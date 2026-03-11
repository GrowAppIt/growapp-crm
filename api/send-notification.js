/**
 * Serverless Function — Invio Notifiche Push FCM
 *
 * Riceve una lista di userId, recupera i loro token FCM da Firestore,
 * e invia la notifica push tramite Firebase Admin SDK.
 *
 * Endpoint: POST /api/send-notification
 * Body: { userIds: string[], title: string, body: string, data?: object }
 * Response: { success: true, sent: number, failed: number }
 *
 * Richiede la variabile d'ambiente FIREBASE_SERVICE_ACCOUNT (JSON stringificato)
 * oppure le singole variabili FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */

const admin = require('firebase-admin');

// Inizializza Firebase Admin (singleton)
if (!admin.apps.length) {
    try {
        // Metodo 1: Service Account JSON completo
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        }
        // Metodo 2: Singole variabili d'ambiente
        else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
                })
            });
        }
        // Fallback: usa Application Default Credentials
        else {
            admin.initializeApp();
        }
    } catch (e) {
        console.error('[send-notification] Errore inizializzazione Firebase Admin:', e.message);
    }
}

module.exports = async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST' });

    const { userIds, title, body, data } = req.body || {};

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: 'userIds mancante o vuoto' });
    }
    if (!title) {
        return res.status(400).json({ error: 'title mancante' });
    }

    try {
        const db = admin.firestore();

        // Recupera i token FCM di tutti gli utenti destinatari
        const allTokens = [];
        for (const userId of userIds) {
            try {
                const userDoc = await db.collection('utenti').doc(userId).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();
                    const tokens = userData.fcmTokens || [];
                    tokens.forEach(token => {
                        if (token) allTokens.push({ token, userId });
                    });
                }
            } catch (e) {
                console.warn(`[send-notification] Errore lettura utente ${userId}:`, e.message);
            }
        }

        if (allTokens.length === 0) {
            return res.status(200).json({
                success: true,
                sent: 0,
                failed: 0,
                message: 'Nessun token FCM trovato per gli utenti specificati'
            });
        }

        console.log(`[send-notification] Invio push a ${allTokens.length} token per ${userIds.length} utenti`);

        // Invia a tutti i token
        let sent = 0;
        let failed = 0;
        const invalidTokens = []; // Token da rimuovere

        for (const { token, userId } of allTokens) {
            try {
                await admin.messaging().send({
                    token: token,
                    notification: {
                        title: title,
                        body: body || ''
                    },
                    data: {
                        ...(data || {}),
                        // Converti tutti i valori a stringa (FCM richiede stringhe)
                        ...(data?.taskId ? { taskId: String(data.taskId) } : {}),
                        ...(data?.appId ? { appId: String(data.appId) } : {}),
                        ...(data?.type ? { type: String(data.type) } : {}),
                        tag: `crm-${data?.type || 'notification'}-${Date.now()}`
                    },
                    webpush: {
                        headers: {
                            Urgency: 'high'
                        },
                        notification: {
                            title: title,
                            body: body || '',
                            icon: '/img/icon-192.png',
                            badge: '/img/icon-72.png',
                            vibrate: [200, 100, 200],
                            requireInteraction: false
                        }
                    }
                });
                sent++;
            } catch (sendError) {
                failed++;
                // Se il token non è più valido, segnalalo per la pulizia
                if (
                    sendError.code === 'messaging/registration-token-not-registered' ||
                    sendError.code === 'messaging/invalid-registration-token'
                ) {
                    invalidTokens.push({ token, userId });
                }
                console.warn(`[send-notification] Errore invio a token ${token.substring(0, 15)}...:`, sendError.code || sendError.message);
            }
        }

        // Pulisci token invalidi da Firestore
        for (const { token, userId } of invalidTokens) {
            try {
                await db.collection('utenti').doc(userId).update({
                    fcmTokens: admin.firestore.FieldValue.arrayRemove(token)
                });
                console.log(`[send-notification] Token invalido rimosso per utente ${userId}`);
            } catch (e) {
                // Ignora errori di pulizia
            }
        }

        return res.status(200).json({
            success: true,
            sent: sent,
            failed: failed,
            totalTokens: allTokens.length,
            invalidRemoved: invalidTokens.length
        });

    } catch (error) {
        console.error('[send-notification] Errore generico:', error);
        return res.status(500).json({ error: 'Errore interno', detail: error.message });
    }
};

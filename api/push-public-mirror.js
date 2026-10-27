/**
 * Serverless Function — Ricopia notifiche nello specchio pubblico push_public
 *
 * Push Broadcast (CRM) registra gli invii scrivendo push_history dal browser.
 * Lo specchio pubblico `push_public` invece lo scrive SOLO il server (nelle
 * regole è write:false, così nessuno può pubblicare testi a nome di un Comune).
 * Dopo aver salvato, il CRM chiama questo endpoint con gli ID appena scritti:
 * il server rilegge quei doc da push_history (fa fede lui, non il browser) e
 * ne copia i soli campi pubblici. Vedi lib/push-public.js.
 *
 * Endpoint: POST /api/push-public-mirror   body: { ids: ["docId", ...] }
 * Accesso: staff del CRM con ID token Firebase (lib/staff-auth.js). Agenti: 403.
 */

const admin = require('firebase-admin');
const { verificaAccesso } = require('../lib/staff-auth');
const { PUBLIC_COLLECTION, toPublic } = require('../lib/push-public');

// Inizializza Firebase Admin (singleton) — stesso codice del sync
if (!admin.apps.length) {
    try {
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
                })
            });
        } else {
            admin.initializeApp();
        }
    } catch (e) {
        console.error('[push-public-mirror] Errore inizializzazione Firebase Admin:', e.message);
    }
}

const db = admin.firestore();

// Un broadcast va al massimo a qualche centinaio di app.
const MAX_IDS = 500;
const CHUNK = 200;

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Metodo non consentito. Usa POST.' });
    }

    const auth = await verificaAccesso(req, admin);
    // Il "cron" riconosciuto solo dall'User-Agent non c'entra con questo endpoint.
    if (!auth.ok || auth.livello !== 'completo') {
        return res.status(auth.status || 401).json({ ok: false, error: auth.error || 'Non autorizzato' });
    }

    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const ids = Array.isArray(body.ids)
        ? [...new Set(body.ids.filter(id => typeof id === 'string' && id && id.length <= 200 && !id.includes('/')))]
        : [];
    if (ids.length === 0) return res.status(400).json({ ok: false, error: 'Nessun ID valido' });
    if (ids.length > MAX_IDS) return res.status(400).json({ ok: false, error: `Massimo ${MAX_IDS} ID per chiamata` });

    try {
        let copied = 0;
        let missing = 0;
        for (let i = 0; i < ids.length; i += CHUNK) {
            const part = ids.slice(i, i + CHUNK);
            const snaps = await db.getAll(...part.map(id => db.collection('push_history').doc(id)));
            const batch = db.batch();
            snaps.forEach((snap, j) => {
                const ref = db.collection(PUBLIC_COLLECTION).doc(part[j]);
                if (snap.exists) {
                    batch.set(ref, toPublic(snap.data()), { merge: true });
                    copied++;
                } else {
                    missing++;
                }
            });
            await batch.commit();
        }
        console.log(`[push-public-mirror] ${copied} copiate, ${missing} non trovate (uid: ${auth.uid || auth.source})`);
        return res.status(200).json({ ok: true, copied, missing });
    } catch (e) {
        console.error('[push-public-mirror] Errore:', e.message);
        return res.status(500).json({ ok: false, error: 'Errore durante la copia' });
    }
};

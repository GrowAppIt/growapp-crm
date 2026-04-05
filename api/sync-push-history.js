/**
 * Serverless Function — Sincronizzazione Storico Notifiche Push
 *
 * Interroga l'API GoodBarber pushapi/history per ogni app configurata
 * e salva le nuove notifiche su Firestore nella collezione push_history.
 *
 * Endpoint: GET /api/sync-push-history
 *   → Sincronizza tutte le app configurate
 *
 * Endpoint: GET /api/sync-push-history?appSlug=locri
 *   → Sincronizza solo una specifica app
 *
 * Endpoint: GET /api/sync-push-history?appSlug=locri&full=true
 *   → Sincronizzazione completa (tutte le pagine, non solo le nuove)
 *
 * L'API GoodBarber chiamata:
 *   GET https://api.goodbarber.net/pushapi/history/
 *     ?user_id={monitorUserId}&token=&page={n}&webzine_id={webzineId}
 *
 * Restituisce per ogni notifica:
 *   { id, message, rootzine, item_id, section_id, pushed_at, url, pushed_at_date }
 *
 * Richiede FIREBASE_SERVICE_ACCOUNT o le singole variabili Firebase Admin.
 */

const admin = require('firebase-admin');

// Inizializza Firebase Admin (singleton)
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
        console.error('[sync-push-history] Errore inizializzazione Firebase Admin:', e.message);
    }
}

const db = admin.firestore();

// ============================================================================
// Configurazione
// ============================================================================

const GOODBARBER_PUSH_API = 'https://api.goodbarber.net/pushapi/history/';
const NOTIFICATIONS_PER_PAGE = 20;
const MAX_PAGES_PER_SYNC = 5;      // In modalità incrementale, max pagine da scorrere
const MAX_PAGES_FULL_SYNC = 100;   // In modalità full, max pagine
const DELAY_BETWEEN_REQUESTS = 200; // ms tra richieste API per non sovraccaricare

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Recupera le app configurate per il monitoraggio push da Firestore.
 * Ogni app deve avere nel documento Firestore (collezione 'app'):
 *   - appSlug: string (es: "locri")
 *   - comune: string (es: "Locri")
 *   - goodbarberWebzineId: number (es: 2942056)
 *   - monitorPushUserId: number (user_id dell'utente fantasma GoodBarber)
 *   - pushMonitorEnabled: boolean (true se il monitoraggio è attivo)
 */
async function getMonitoredApps(filterSlug = null) {
    let query = db.collection('app').where('pushMonitorEnabled', '==', true);

    if (filterSlug) {
        query = query.where('appSlug', '==', filterSlug);
    }

    const snapshot = await query.get();
    const apps = [];

    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.goodbarberWebzineId && data.monitorPushUserId) {
            apps.push({
                id: doc.id,
                appSlug: data.appSlug || '',
                comune: data.comune || '',
                webzineId: data.goodbarberWebzineId,
                monitorUserId: data.monitorPushUserId,
                appUrl: data.appUrl || `https://${data.appSlug}.comune.digital`
            });
        }
    });

    return apps;
}

/**
 * Recupera l'ultimo push_id sincronizzato per una specifica app.
 * Serve per la sincronizzazione incrementale.
 */
async function getLastSyncedPushId(appSlug) {
    const snapshot = await db.collection('push_history')
        .where('appSlug', '==', appSlug)
        .orderBy('gbPushId', 'desc')
        .limit(1)
        .get();

    if (snapshot.empty) return 0;
    return snapshot.docs[0].data().gbPushId || 0;
}

/**
 * Chiama l'API GoodBarber pushapi/history
 */
async function fetchPushHistory(webzineId, userId, page = 1) {
    const url = `${GOODBARBER_PUSH_API}?user_id=${userId}&token=&page=${page}&webzine_id=${webzineId}`;

    const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
        throw new Error(`GoodBarber API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

/**
 * Determina il tipo/sorgente della notifica dal messaggio
 */
function detectNotificationSource(message) {
    if (!message) return { source: 'manual', title: '', body: message || '' };

    // Pattern: "News: testo..." → RSS automatica
    if (message.startsWith('News:')) {
        return {
            source: 'rss_auto',
            title: 'News',
            body: message.substring(5).trim()
        };
    }

    // Pattern: "Evento: testo..." → Calendario automatico
    if (message.startsWith('Evento:')) {
        return {
            source: 'calendar_auto',
            title: 'Evento',
            body: message.substring(7).trim()
        };
    }

    // Pattern: "In Programma: testo..." o "In programma: testo..." → Calendario automatico
    if (/^In [Pp]rogramma[:\s]/i.test(message)) {
        const body = message.replace(/^In [Pp]rogramma[:\s-]*/i, '').trim();
        return {
            source: 'calendar_auto',
            title: 'In Programma',
            body: body
        };
    }

    // Pattern: "Differenziata: testo..." → Calendario/automatico
    if (message.startsWith('Differenziata:')) {
        return {
            source: 'calendar_auto',
            title: 'Differenziata',
            body: message.substring(14).trim()
        };
    }

    // Pattern: "Rifiuti: testo..." → Calendario/automatico
    if (message.startsWith('Rifiuti:')) {
        return {
            source: 'calendar_auto',
            title: 'Rifiuti',
            body: message.substring(8).trim()
        };
    }

    // Pattern: contiene "allerta meteo", "allerta gialla/arancione/rossa",
    // oppure inizia con "Allerta:" → Allerta meteo
    // NB: la parola "meteo" da sola NON basta (es: "widget Meteo" non è un'allerta)
    const msgLower = message.toLowerCase();
    if (
        msgLower.includes('allerta meteo') ||
        msgLower.includes('allerta gialla') ||
        msgLower.includes('allerta arancione') ||
        msgLower.includes('allerta rossa') ||
        msgLower.includes('allerta verde') ||
        message.startsWith('Allerta:') ||
        /\ballerta\b.*\b(protezione civile|temporali|pioggia|neve|vento|frane|esondazione|idrogeologico)\b/i.test(message)
    ) {
        return {
            source: 'meteo_alert',
            title: 'Allerta',
            body: message
        };
    }

    // Default: manuale o broadcast
    return {
        source: 'manual',
        title: '',
        body: message
    };
}

/**
 * Salva un batch di notifiche su Firestore
 */
async function saveNotifications(notifications, appData) {
    if (!notifications || notifications.length === 0) return 0;

    const BATCH_SIZE = 450;
    let totalSaved = 0;

    for (let i = 0; i < notifications.length; i += BATCH_SIZE) {
        const chunk = notifications.slice(i, i + BATCH_SIZE);
        const batch = db.batch();

        for (const notif of chunk) {
            const { source, title, body } = detectNotificationSource(notif.message);

            // Usa un ID deterministico basato sul push_id di GoodBarber
            // per evitare duplicati
            const docId = `gb_${appData.appSlug}_${notif.id}`;
            const docRef = db.collection('push_history').doc(docId);

            batch.set(docRef, {
                appId: appData.id,
                appSlug: appData.appSlug,
                comune: appData.comune,
                title: title,
                message: body,
                fullMessage: notif.message,
                source: source,
                platform: 'all',
                sentAt: admin.firestore.Timestamp.fromDate(new Date(notif.pushed_at)),
                sentBy: 'goodbarber',
                sentByName: 'GoodBarber',
                status: 'sent',
                error: null,
                gbPushId: notif.id,
                gbItemId: notif.item_id || null,
                gbSectionId: notif.section_id || null,
                gbUrl: notif.url || null,
                syncedAt: admin.firestore.FieldValue.serverTimestamp(),
                metadata: {
                    rootzine: notif.rootzine || null,
                    pushed_at_original: notif.pushed_at_date || notif.pushed_at
                }
            }, { merge: true }); // merge per non sovrascrivere eventuali arricchimenti manuali
        }

        await batch.commit();
        totalSaved += chunk.length;
    }

    return totalSaved;
}

/**
 * Sincronizza le notifiche per una singola app
 */
async function syncApp(appData, fullSync = false) {
    const maxPages = fullSync ? MAX_PAGES_FULL_SYNC : MAX_PAGES_PER_SYNC;
    let lastSyncedId = fullSync ? 0 : await getLastSyncedPushId(appData.appSlug);
    let allNewNotifications = [];
    let page = 1;
    let reachedExisting = false;

    console.log(`[sync] ${appData.comune} (${appData.appSlug}) — lastSyncedId: ${lastSyncedId}, fullSync: ${fullSync}`);

    while (page <= maxPages && !reachedExisting) {
        try {
            const data = await fetchPushHistory(appData.webzineId, appData.monitorUserId, page);

            if (!data.result || data.result.length === 0) {
                break; // Nessun'altra notifica
            }

            for (const notif of data.result) {
                if (!fullSync && notif.id <= lastSyncedId) {
                    reachedExisting = true;
                    break;
                }
                allNewNotifications.push(notif);
            }

            // Se siamo all'ultima pagina, usciamo
            if (page >= (data.last_page_index || page)) {
                break;
            }

            page++;

            // Delay tra le richieste
            if (page <= maxPages && !reachedExisting) {
                await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS));
            }
        } catch (error) {
            console.error(`[sync] Errore pagina ${page} per ${appData.comune}:`, error.message);
            break;
        }
    }

    // Salva le nuove notifiche su Firestore
    const savedCount = await saveNotifications(allNewNotifications, appData);

    // Aggiorna il timestamp dell'ultima sincronizzazione
    await db.collection('app').doc(appData.id).update({
        lastPushSync: admin.firestore.FieldValue.serverTimestamp(),
        lastPushSyncCount: savedCount
    });

    return {
        app: appData.comune,
        appSlug: appData.appSlug,
        newNotifications: savedCount,
        pagesScanned: page,
        fullSync: fullSync
    };
}

// ============================================================================
// Main Handler
// ============================================================================

module.exports = async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Metodo non consentito. Usa GET.' });
    }

    // Sicurezza: verifica un token segreto (opzionale ma consigliato)
    const authToken = req.headers['authorization'] || req.query.secret;
    if (process.env.SYNC_SECRET && authToken !== `Bearer ${process.env.SYNC_SECRET}` && authToken !== process.env.SYNC_SECRET) {
        return res.status(401).json({ error: 'Non autorizzato' });
    }

    try {
        const { appSlug, full } = req.query;
        const fullSync = full === 'true';

        // Recupera le app da sincronizzare
        const apps = await getMonitoredApps(appSlug || null);

        if (apps.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'Nessuna app configurata per il monitoraggio push.',
                hint: 'Assicurati che le app in Firestore abbiano pushMonitorEnabled=true, monitorPushUserId e goodbarberWebzineId configurati.'
            });
        }

        // Supporto chunk: ?chunk=0&chunkSize=30 per processare a blocchi
        const chunkIndex = parseInt(req.query.chunk) || 0;
        const chunkSize = parseInt(req.query.chunkSize) || 0; // 0 = tutte

        let appsToSync = apps;
        if (chunkSize > 0) {
            const start = chunkIndex * chunkSize;
            appsToSync = apps.slice(start, start + chunkSize);
            console.log(`[sync] Chunk ${chunkIndex}: app ${start + 1}-${start + appsToSync.length} di ${apps.length} (fullSync: ${fullSync})`);
        } else {
            console.log(`[sync] Inizio sincronizzazione per ${apps.length} app (fullSync: ${fullSync})`);
        }

        if (appsToSync.length === 0) {
            return res.status(200).json({
                success: true,
                totalApps: 0,
                totalNewNotifications: 0,
                message: `Chunk ${chunkIndex}: nessuna app da sincronizzare (totale app: ${apps.length}).`,
                results: []
            });
        }

        // Processa le app in parallelo (batch da CONCURRENCY alla volta)
        const CONCURRENCY = 10;
        const results = [];

        for (let i = 0; i < appsToSync.length; i += CONCURRENCY) {
            const batch = appsToSync.slice(i, i + CONCURRENCY);
            const batchResults = await Promise.allSettled(
                batch.map(app => syncApp(app, fullSync).catch(error => {
                    console.error(`[sync] Errore per ${app.comune}:`, error.message);
                    return { app: app.comune, appSlug: app.appSlug, error: error.message };
                }))
            );

            for (const r of batchResults) {
                results.push(r.status === 'fulfilled' ? r.value : {
                    app: 'unknown',
                    error: r.reason?.message || 'Errore sconosciuto'
                });
            }

            // Breve pausa tra batch paralleli per non sovraccaricare GoodBarber
            if (i + CONCURRENCY < appsToSync.length) {
                await new Promise(r => setTimeout(r, 300));
            }
        }

        const totalNew = results.reduce((sum, r) => sum + (r.newNotifications || 0), 0);

        return res.status(200).json({
            success: true,
            totalApps: appsToSync.length,
            totalAppsTotal: apps.length,
            totalNewNotifications: totalNew,
            chunk: chunkSize > 0 ? { index: chunkIndex, size: chunkSize, hasMore: (chunkIndex + 1) * chunkSize < apps.length } : null,
            results: results
        });
    } catch (error) {
        console.error('[sync-push-history] Errore generale:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

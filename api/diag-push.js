/**
 * Serverless Function — Diagnostica Push History
 *
 * Strumento di debug per verificare cosa c'è davvero su Firestore
 * e cosa restituisce GoodBarber per una determinata app.
 *
 * Esempi d'uso:
 *
 *   GET /api/diag-push?appSlug=catania
 *     → Restituisce:
 *       - config: info dell'app da Firestore (lastPushSync, stato, ecc.)
 *       - firestore: ultime 50 notifiche salvate su push_history per quell'app
 *       - goodbarber: ultime 50 notifiche grezze restituite dall'API GoodBarber
 *       - diff: quante ne ha GB che non sono su Firestore (e viceversa)
 *
 *   GET /api/diag-push?appSlug=catania&pages=5
 *     → Come sopra ma scansiona fino a 5 pagine GoodBarber (100 notifiche)
 *
 *   GET /api/diag-push?appSlug=catania&q=comunicato
 *     → Filtra solo le notifiche il cui messaggio contiene "comunicato"
 *       (utile per trovare casi specifici)
 *
 * L'endpoint NON modifica nulla. È pura lettura.
 */

const admin = require('firebase-admin');

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
        console.error('[diag-push] Errore inizializzazione Firebase Admin:', e.message);
    }
}

const db = admin.firestore();

const GOODBARBER_PUSH_API = 'https://api.goodbarber.net/pushapi/history/';

// ============================================================================
// Helper: scarica N pagine da GoodBarber
// ============================================================================
async function fetchGoodBarberPages(webzineId, userId, maxPages = 3) {
    const results = [];
    let lastPageIndex = null;
    let errors = [];

    for (let page = 1; page <= maxPages; page++) {
        const url = `${GOODBARBER_PUSH_API}?user_id=${userId}&token=&page=${page}&webzine_id=${webzineId}`;
        try {
            const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!r.ok) {
                errors.push(`pagina ${page}: HTTP ${r.status} ${r.statusText}`);
                break;
            }
            const data = await r.json();
            if (!data.result || data.result.length === 0) break;

            data.result.forEach(n => results.push(n));
            lastPageIndex = data.last_page_index || null;

            if (lastPageIndex && page >= lastPageIndex) break;

            // Piccolo delay per non sovraccaricare
            await new Promise(r => setTimeout(r, 150));
        } catch (e) {
            errors.push(`pagina ${page}: ${e.message}`);
            break;
        }
    }

    return { results, lastPageIndex, errors };
}

// ============================================================================
// Helper: recupera tutti i documenti Firestore per un'app
// ============================================================================
async function fetchFirestoreHistory(appSlug, maxDocs = 50) {
    // Proviamo prima con orderBy sentAt desc (richiede indice composito)
    try {
        const snap = await db.collection('push_history')
            .where('appSlug', '==', appSlug)
            .orderBy('sentAt', 'desc')
            .limit(maxDocs)
            .get();

        const docs = [];
        snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
        return { docs, usedFallback: false };
    } catch (e) {
        // Fallback: scarica tutto senza orderBy e ordina in memoria
        const snap = await db.collection('push_history')
            .where('appSlug', '==', appSlug)
            .get();

        const all = [];
        snap.forEach(d => all.push({ id: d.id, ...d.data() }));

        all.sort((a, b) => {
            const da = a.sentAt?.toDate ? a.sentAt.toDate().getTime() : 0;
            const dbb = b.sentAt?.toDate ? b.sentAt.toDate().getTime() : 0;
            return dbb - da;
        });

        return { docs: all.slice(0, maxDocs), usedFallback: true, totalFound: all.length };
    }
}

// ============================================================================
// Helper: recupera info app da Firestore
// ============================================================================
async function fetchAppConfig(appSlug) {
    const snap = await db.collection('app').where('appSlug', '==', appSlug).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    const data = doc.data();
    return {
        id: doc.id,
        comune: data.comune || data.nome || null,
        appSlug: data.appSlug || null,
        pushMonitorEnabled: !!data.pushMonitorEnabled,
        monitorPushUserId: data.monitorPushUserId || null,
        goodbarberWebzineId: data.goodbarberWebzineId || null,
        lastPushSync: data.lastPushSync?.toDate ? data.lastPushSync.toDate().toISOString() : null,
        lastPushSyncCount: data.lastPushSyncCount || 0,
        lastPushSyncPagesScanned: data.lastPushSyncPagesScanned || null,
        lastPushSyncStatus: data.lastPushSyncStatus || null,
        lastPushSyncWarning: data.lastPushSyncWarning || null,
        lastPushSyncError: data.lastPushSyncError || null
    };
}

// ============================================================================
// Helper: serializza notifica Firestore in formato leggibile
// ============================================================================
function formatFirestoreDoc(d) {
    return {
        id: d.id,
        gbPushId: d.gbPushId || null,
        gbSectionId: d.gbSectionId || null,
        gbItemId: d.gbItemId || null,
        gbUrl: d.gbUrl || null,
        rootzine: d.metadata?.rootzine || null,
        source: d.source || null,
        title: d.title || null,
        message: d.fullMessage || d.message || null,
        sentAt: d.sentAt?.toDate ? d.sentAt.toDate().toISOString() : null,
        status: d.status || null
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
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Usa GET.' });

    // Protezione con token segreto (stessa logica del sync)
    const authToken = req.headers['authorization'] || req.query.secret;
    if (process.env.SYNC_SECRET && authToken !== `Bearer ${process.env.SYNC_SECRET}` && authToken !== process.env.SYNC_SECRET) {
        return res.status(401).json({ error: 'Non autorizzato' });
    }

    const { appSlug, q } = req.query;
    const pages = Math.min(parseInt(req.query.pages) || 3, 10);

    if (!appSlug) {
        return res.status(400).json({
            error: 'Parametro appSlug obbligatorio',
            example: '/api/diag-push?appSlug=catania'
        });
    }

    try {
        // 1. Config dell'app
        const config = await fetchAppConfig(appSlug);
        if (!config) {
            return res.status(404).json({
                error: `App con appSlug="${appSlug}" non trovata su Firestore.`,
                hint: 'Verifica di aver scritto lo slug esatto come appare nella configurazione.'
            });
        }

        if (!config.monitorPushUserId || !config.goodbarberWebzineId) {
            return res.status(200).json({
                error: 'App trovata ma non completamente configurata',
                config: config,
                hint: 'Mancano monitorPushUserId o goodbarberWebzineId. Impostali dalla pagina Configura del CRM.'
            });
        }

        // 2. Chiama GoodBarber
        const gb = await fetchGoodBarberPages(config.goodbarberWebzineId, config.monitorPushUserId, pages);

        // 3. Leggi Firestore
        const firestoreData = await fetchFirestoreHistory(appSlug, 50);

        // 4. Calcola il diff: quali push_id GB mancano su Firestore?
        const firestoreGbIds = new Set(firestoreData.docs.map(d => d.gbPushId).filter(Boolean));
        const gbIds = gb.results.map(n => n.id);
        const missingOnFirestore = gb.results.filter(n => !firestoreGbIds.has(n.id));

        // 5. Filtro opzionale per query testuale
        let filteredGb = gb.results;
        let filteredFs = firestoreData.docs.map(formatFirestoreDoc);
        if (q) {
            const needle = String(q).toLowerCase();
            filteredGb = gb.results.filter(n => (n.message || '').toLowerCase().includes(needle));
            filteredFs = filteredFs.filter(n => (n.message || '').toLowerCase().includes(needle));
        }

        // 6. Distribuzione per source sui record Firestore (senza filtro q)
        const sourceDistribution = {};
        firestoreData.docs.forEach(d => {
            const s = d.source || 'null';
            sourceDistribution[s] = (sourceDistribution[s] || 0) + 1;
        });

        return res.status(200).json({
            success: true,
            appSlug: appSlug,
            config: config,
            goodbarber: {
                pagesScanned: pages,
                totalNotifications: gb.results.length,
                errors: gb.errors.length > 0 ? gb.errors : null,
                // Primi 50 risultati grezzi (già ordinati DESC dall'API)
                notifications: filteredGb.slice(0, 50).map(n => ({
                    gbPushId: n.id,
                    message: n.message,
                    pushed_at: n.pushed_at_date || n.pushed_at,
                    rootzine: n.rootzine,
                    section_id: n.section_id,
                    item_id: n.item_id,
                    url: n.url
                }))
            },
            firestore: {
                totalShown: firestoreData.docs.length,
                totalInDb: firestoreData.totalFound || firestoreData.docs.length,
                usedFallback: firestoreData.usedFallback || false,
                sourceDistribution: sourceDistribution,
                notifications: filteredFs
            },
            diff: {
                missingOnFirestoreCount: missingOnFirestore.length,
                // Mostra i primi 20 mancanti per non appesantire la risposta
                missingOnFirestoreSample: missingOnFirestore.slice(0, 20).map(n => ({
                    gbPushId: n.id,
                    message: n.message,
                    pushed_at: n.pushed_at_date || n.pushed_at,
                    rootzine: n.rootzine,
                    section_id: n.section_id,
                    url: n.url
                })),
                hint: missingOnFirestore.length > 0
                    ? 'Ci sono notifiche su GoodBarber che NON sono su Firestore. Lancia un full sync: /api/sync-push-history?appSlug=' + appSlug + '&full=true'
                    : 'Tutte le notifiche recenti di GoodBarber risultano anche su Firestore.'
            }
        });
    } catch (error) {
        console.error('[diag-push] Errore generale:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
};

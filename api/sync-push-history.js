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
 * Genera uno slug URL-friendly dal testo (per URL articoli GoodBarber)
 */
function slugify(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // rimuove accenti
        .replace(/[^a-z0-9\s-]/g, '')  // rimuove caratteri speciali
        .replace(/\s+/g, '-')           // spazi → trattini
        .replace(/-+/g, '-')            // trattini multipli → singolo
        .replace(/^-|-$/g, '')          // rimuove trattini iniziali/finali
        .substring(0, 120);             // limita lunghezza
}

/**
 * Recupera la mappa sezioni (section_id → slug) dall'app GoodBarber.
 * Prova diversi endpoint noti dell'API GoodBarber per trovare le sezioni.
 * Restituisce una Map: section_id (string) → { slug, name }
 */
async function fetchAppSections(appDomain) {
    // Prova diversi endpoint noti di GoodBarber per le sezioni
    const endpoints = [
        `https://${appDomain}/jsonapi/v1/categories/`,
        `https://${appDomain}/jsonapi/v4/sections/`,
        `https://${appDomain}/jsonapi/v2/sections/`,
        `https://${appDomain}/jsonapi/v1/sections/`,
    ];

    for (const url of endpoints) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);

            const resp = await fetch(url, {
                headers: { 'Accept': 'application/json' },
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (!resp.ok) continue;
            const data = await resp.json();

            // GoodBarber può restituire in diversi formati
            const sections = data.result || data.sections || data.categories || data.data || [];
            if (!Array.isArray(sections) || sections.length === 0) continue;

            const map = new Map();
            for (const s of sections) {
                const id = s.id || s.section_id || s.sectionId;
                // Lo slug URL può essere in vari campi
                const slug = s.url_slug || s.slug || s.urlSlug || s.nameSlug || s.name_slug
                    || (s.url ? s.url.replace(/^\/|\/$/g, '') : '')
                    || (s.name ? slugify(s.name) : '');
                const name = s.name || s.title || s.label || '';

                if (id) {
                    map.set(String(id), { slug, name });
                }
            }

            if (map.size > 0) {
                console.log(`[sync] Sezioni caricate per ${appDomain}: ${map.size} sezioni da ${url}`);
                return map;
            }
        } catch (e) {
            // Prova il prossimo endpoint
            continue;
        }
    }

    console.warn(`[sync] Impossibile caricare sezioni per ${appDomain}`);
    return new Map();
}

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

    // Pattern: "Differenziata: testo..." → Calendario/automatico
    if (message.startsWith('Differenziata:')) {
        return {
            source: 'calendar_auto',
            title: 'Differenziata',
            body: message.substring(14).trim()
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
 * @param {Array} notifications - notifiche dal push API
 * @param {Object} appData - dati dell'app
 * @param {Map} sectionMap - mappa section_id → { slug, name } (opzionale)
 */
async function saveNotifications(notifications, appData, sectionMap = new Map()) {
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

            // Risolvi slug sezione da mappa sezioni GoodBarber
            const sectionInfo = notif.section_id ? sectionMap.get(String(notif.section_id)) : null;
            const gbSectionSlug = sectionInfo ? sectionInfo.slug : '';
            // Genera slug titolo dal body della notifica (per URL articolo)
            const gbTitleSlug = (source === 'rss_auto') ? slugify(body) : '';

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
                gbSectionSlug: gbSectionSlug,
                gbTitleSlug: gbTitleSlug,
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

    // Carica mappa sezioni GoodBarber (una volta per app, per risolvere section_id → slug URL)
    const appDomain = `${appData.appSlug}.comune.digital`;
    const sectionMap = await fetchAppSections(appDomain);

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

    // Salva le nuove notifiche su Firestore (con mappa sezioni per slug URL)
    const savedCount = await saveNotifications(allNewNotifications, appData, sectionMap);

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

        console.log(`[sync] Inizio sincronizzazione per ${apps.length} app (fullSync: ${fullSync})`);

        const results = [];
        for (const app of apps) {
            try {
                const result = await syncApp(app, fullSync);
                results.push(result);
            } catch (error) {
                console.error(`[sync] Errore per ${app.comune}:`, error.message);
                results.push({
                    app: app.comune,
                    appSlug: app.appSlug,
                    error: error.message
                });
            }

            // Delay tra app diverse
            if (apps.indexOf(app) < apps.length - 1) {
                await new Promise(r => setTimeout(r, 500));
            }
        }

        const totalNew = results.reduce((sum, r) => sum + (r.newNotifications || 0), 0);

        return res.status(200).json({
            success: true,
            totalApps: apps.length,
            totalNewNotifications: totalNew,
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

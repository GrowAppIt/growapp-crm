/**
 * Serverless Function — Backfill Eventi Storici da GoodBarber
 *
 * Importa retroattivamente tutti gli eventi presenti nella sezione Agenda
 * di un comune, anche quelli antecedenti alla data di attivazione del sync
 * delle notifiche push. Salva ciascun evento nella collezione push_history
 * con lo stesso schema delle notifiche di tipo calendar_auto, così la
 * webapp archivio-eventi può leggerli come tutto il resto.
 *
 * Sorgente: https://{slug}.goodbarber.app/front/get_items/{webzineId}/{sectionId}/
 * Pagination: il campo next_page della risposta contiene l'URL della pagina
 *             successiva (spesso ospitato su api.ww-api.com).
 *
 * Endpoint:
 *   GET /api/backfill-events?appSlug=mezzolombardo&secret=XXX
 *     → Backfill del singolo comune
 *
 *   GET /api/backfill-events?appSlug=mezzolombardo&secret=XXX&sectionId=74672332
 *     → Backfill forzando manualmente l'ID sezione Agenda (se non scopribile
 *       automaticamente dalle notifiche push già presenti)
 *
 *   GET /api/backfill-events?appSlug=mezzolombardo&secret=XXX&dryRun=1
 *     → Simula il backfill senza scrivere su Firestore (solo conteggio)
 *
 *   GET /api/backfill-events?appSlug=mezzolombardo&secret=XXX&maxPages=20
 *     → Limita il numero di pagine scansionate (default 100)
 *
 * Sicurezza: protetto da SYNC_SECRET (stessa variabile usata dagli altri
 * endpoint serverless). Senza il secret corretto → HTTP 401.
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
        console.error('[backfill-events] Errore init Firebase Admin:', e.message);
    }
}

const db = admin.firestore();

// ============================================================================
// Configurazione
// ============================================================================
const DEFAULT_MAX_PAGES = 100;
const PAGE_FETCH_TIMEOUT_MS = 20000;
const DELAY_BETWEEN_PAGES_MS = 300;

// ============================================================================
// Helper: parse di data che può essere stringa ISO, timestamp epoch, o oggetto
// ============================================================================
function parseDate(value) {
    if (!value) return null;
    if (typeof value === 'number' && isFinite(value)) {
        const ms = value < 1e12 ? value * 1000 : value;
        const d = new Date(ms);
        return isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === 'string') {
        if (/^\d+$/.test(value.trim())) {
            const n = parseInt(value, 10);
            const ms = n < 1e12 ? n * 1000 : n;
            const d = new Date(ms);
            return isNaN(d.getTime()) ? null : d;
        }
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }
    return null;
}

// ============================================================================
// Helper: normalizza indirizzo (GoodBarber a volte lo dà come stringa, a volte
// come oggetto strutturato)
// ============================================================================
function normalizeAddress(value) {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
        const parts = [value.street, value.city, value.country].filter(Boolean);
        return parts.length > 0 ? parts.join(', ') : null;
    }
    return null;
}

// ============================================================================
// Helper: recupera app doc da Firestore
// ============================================================================
async function getAppDoc(appSlug) {
    const snap = await db.collection('app').where('appSlug', '==', appSlug).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
}

// ============================================================================
// Helper: scopre la sectionId dell'Agenda dalle push già sincronizzate.
// Se il comune non ha mai avuto una push calendar_auto (perché il sync è
// recente o perché non usa l'Agenda), restituisce null e il caller dovrà
// specificare sectionId manualmente.
// ============================================================================
async function discoverAgendaSectionId(appSlug) {
    try {
        const snap = await db.collection('push_history')
            .where('appSlug', '==', appSlug)
            .where('source', '==', 'calendar_auto')
            .limit(1)
            .get();
        if (snap.empty) return null;
        const data = snap.docs[0].data();
        return data.gbSectionId || null;
    } catch (e) {
        console.warn(`[backfill-events] discoverAgendaSectionId fallito per ${appSlug}:`, e.message);
        return null;
    }
}

// ============================================================================
// Helper: fetch con timeout esplicito
// ============================================================================
async function fetchWithTimeout(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PAGE_FETCH_TIMEOUT_MS);
    try {
        const r = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            signal: controller.signal
        });
        if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
        const ct = r.headers.get('content-type') || '';
        if (!ct.includes('json')) throw new Error(`Risposta non-JSON (${ct})`);
        return await r.json();
    } finally {
        clearTimeout(timer);
    }
}

// ============================================================================
// Helper: costruisce il gbUrl per un singolo item (stesso pattern del sync)
// ============================================================================
function buildItemUrl(appSlug, webzineId, sectionId, itemId) {
    return `https://${appSlug}.goodbarber.app/front/get_item/${webzineId}/${sectionId}/${itemId}/`;
}

// ============================================================================
// Helper: salva un batch di eventi su push_history
// Usa docId deterministico `gb_{slug}_{itemId}` così eventi già presenti
// (sincronizzati dalle push) vengono aggiornati con merge, non duplicati.
// ============================================================================
async function saveEventsBatch(events, appData, appSlug, sectionId, dryRun) {
    if (!events || events.length === 0) return { saved: 0, skipped: 0 };
    if (dryRun) {
        // Simula senza scrivere
        let skipped = 0;
        for (const ev of events) {
            const d = parseDate(ev.sortDate || ev.date);
            if (!d) skipped++;
        }
        return { saved: events.length - skipped, skipped, dryRun: true };
    }

    const BATCH_SIZE = 450;
    let saved = 0;
    let skipped = 0;
    const appSlugNorm = (appSlug || '').toLowerCase().trim();

    for (let i = 0; i < events.length; i += BATCH_SIZE) {
        const chunk = events.slice(i, i + BATCH_SIZE);
        const batch = db.batch();
        let writes = 0;

        for (const ev of chunk) {
            const parsedDate = parseDate(ev.sortDate || ev.date);
            if (!parsedDate) {
                skipped++;
                console.warn(`[backfill-events] SKIP evento ${ev.id}: data non parseabile (sortDate=${ev.sortDate}, date=${ev.date})`);
                continue;
            }

            const itemId = ev.id;
            if (!itemId) {
                skipped++;
                continue;
            }

            const docId = `gb_${appSlugNorm}_${itemId}`;
            const docRef = db.collection('push_history').doc(docId);

            const parsedEndDate = parseDate(ev.endDate);
            const addressNorm = normalizeAddress(ev.address);

            batch.set(docRef, {
                appId: appData.id,
                appSlug: appSlugNorm,
                comune: appData.comune || '',
                title: 'In Programma',
                message: ev.title || '',
                fullMessage: ev.title || '',
                source: 'calendar_auto',
                platform: 'all',
                sentAt: admin.firestore.Timestamp.fromDate(parsedDate),
                sentBy: 'goodbarber',
                sentByName: 'GoodBarber',
                status: 'sent',
                error: null,
                gbPushId: itemId,
                gbItemId: itemId,
                gbSectionId: sectionId,
                gbUrl: buildItemUrl(appSlugNorm, appData.goodbarberWebzineId, sectionId, itemId),
                // Arricchimenti specifici per il backfill (campi aggiuntivi
                // che il sync normale da pushapi/history non riempie):
                eventThumbnail: ev.largeThumbnail || ev.thumbnail || ev.xLargeThumbnail || null,
                eventAuthor: ev.author || null,
                eventAddress: addressNorm,
                eventLatitude: ev.latitude || null,
                eventLongitude: ev.longitude || null,
                eventSortDate: admin.firestore.Timestamp.fromDate(parsedDate),
                eventEndDate: parsedEndDate ? admin.firestore.Timestamp.fromDate(parsedEndDate) : null,
                eventAllDay: typeof ev.allDay === 'boolean' ? ev.allDay : false,
                eventType: ev.type || 'event',
                eventSubtype: ev.subtype || '',
                backfilledAt: admin.firestore.FieldValue.serverTimestamp(),
                syncedAt: admin.firestore.FieldValue.serverTimestamp(),
                metadata: {
                    source: 'backfill',
                    pushed_at_original: ev.sortDate || ev.date
                }
            }, { merge: true });

            writes++;
        }

        if (writes > 0) {
            await batch.commit();
            saved += writes;
        }
    }

    return { saved, skipped };
}

// ============================================================================
// Backfill di un singolo comune
// ============================================================================
async function backfillSingleApp(appSlug, options = {}) {
    const {
        maxPages = DEFAULT_MAX_PAGES,
        sectionIdOverride = null,
        dryRun = false
    } = options;

    const slug = (appSlug || '').toLowerCase().trim();
    if (!slug) throw new Error('appSlug mancante');

    // 1. Recupera il doc dell'app
    const appData = await getAppDoc(slug);
    if (!appData) {
        return {
            appSlug: slug,
            error: 'App non trovata in Firestore.'
        };
    }
    if (!appData.goodbarberWebzineId) {
        return {
            appSlug: slug,
            error: 'App senza goodbarberWebzineId configurato.'
        };
    }

    // 2. Scopri la sectionId dell'Agenda (o usa override)
    let sectionId = sectionIdOverride;
    if (!sectionId) {
        sectionId = await discoverAgendaSectionId(slug);
    }
    if (!sectionId) {
        return {
            appSlug: slug,
            comune: appData.comune,
            error: 'Sezione Agenda non scopribile. Nessuna push calendar_auto già presente — passa sectionId manualmente via &sectionId=X.'
        };
    }

    // 3. Costruisci URL prima pagina
    const webzineId = appData.goodbarberWebzineId;
    let nextUrl = `https://${slug}.goodbarber.app/front/get_items/${webzineId}/${sectionId}/`;

    let pagesScanned = 0;
    let totalItems = 0;
    let totalSaved = 0;
    let totalSkipped = 0;
    const errors = [];

    while (nextUrl && pagesScanned < maxPages) {
        pagesScanned++;
        let data;
        try {
            data = await fetchWithTimeout(nextUrl);
        } catch (e) {
            errors.push(`pagina ${pagesScanned}: ${e.message}`);
            break;
        }

        const items = Array.isArray(data.items) ? data.items : [];
        totalItems += items.length;

        if (items.length === 0) break;

        // Salva su Firestore (o simula se dryRun)
        try {
            const res = await saveEventsBatch(items, appData, slug, sectionId, dryRun);
            totalSaved += res.saved;
            totalSkipped += res.skipped;
        } catch (e) {
            errors.push(`pagina ${pagesScanned} save: ${e.message}`);
            break;
        }

        // Pagination: next_page può puntare a dominio diverso (api.ww-api.com)
        nextUrl = data.next_page || null;

        if (nextUrl && pagesScanned < maxPages) {
            await new Promise(r => setTimeout(r, DELAY_BETWEEN_PAGES_MS));
        }
    }

    return {
        appSlug: slug,
        comune: appData.comune || '',
        webzineId,
        sectionId,
        pagesScanned,
        totalItems,
        totalSaved,
        totalSkipped,
        hitMaxPages: pagesScanned >= maxPages && !!nextUrl,
        dryRun,
        errors: errors.length > 0 ? errors : null
    };
}

// ============================================================================
// Handler Vercel
// ============================================================================
module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Metodo non consentito. Usa GET.' });
    }

    // Sicurezza: secret richiesto
    const authHeader = req.headers['authorization'];
    const secretQuery = req.query.secret;
    const secretEnv = process.env.SYNC_SECRET;
    if (!secretEnv) {
        return res.status(500).json({ error: 'SYNC_SECRET non configurato sul server.' });
    }
    const providedSecret = secretQuery || (authHeader || '').replace(/^Bearer\s+/i, '');
    if (providedSecret !== secretEnv) {
        return res.status(401).json({ error: 'Non autorizzato.' });
    }

    try {
        const { appSlug, sectionId, maxPages, dryRun } = req.query;

        if (!appSlug) {
            return res.status(400).json({
                error: 'Parametro appSlug mancante. Esempio: /api/backfill-events?appSlug=mezzolombardo&secret=...'
            });
        }

        const options = {
            maxPages: maxPages ? Math.max(1, Math.min(1000, parseInt(maxPages, 10) || DEFAULT_MAX_PAGES)) : DEFAULT_MAX_PAGES,
            sectionIdOverride: sectionId || null,
            dryRun: dryRun === '1' || dryRun === 'true'
        };

        const result = await backfillSingleApp(appSlug, options);

        return res.status(200).json({
            success: !result.error,
            ...result
        });
    } catch (e) {
        console.error('[backfill-events] Errore generale:', e);
        return res.status(500).json({
            success: false,
            error: e.message || String(e)
        });
    }
};

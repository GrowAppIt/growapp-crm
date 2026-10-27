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
 *
 * Audit 27/10/2026:
 *   - Accesso: lib/staff-auth.js. Niente più agenti, niente più "finto cron"
 *     con ?full=true; il cron riconosciuto solo dall'User-Agent fa il giro standard.
 *   - "Già sincronizzata?" si controlla leggendo i doc con ID deterministico
 *     della pagina appena scaricata (~20-40 letture per app) invece di leggere
 *     ogni volta le ultime 500 notifiche (~40.000 letture a giro, ~3,9 milioni
 *     al giorno con 109 app). Verificato: tutti i 44.884 doc GoodBarber hanno
 *     l'ID gb_<slug>_<gbPushId>.
 *   - Le notifiche con data futura (push programmate) non generano più un
 *     "avviso" permanente; un errore GoodBarber isolato non è più subito critico
 *     (lastPushSyncErrorStreak, vedi public/js/push-monitor-health.js).
 *   - app_public si aggiorna una volta l'ora e solo se cambia qualcosa; i Comuni
 *     spenti nel configuratore escono dalla landing pubblica.
 */

const admin = require('firebase-admin');
const { verificaAccesso } = require('../lib/staff-auth');
const { batchSetPublic } = require('../lib/push-public');

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
// Aumentato da 5 a 15 (→ 300 notifiche massime per sync) per evitare di perdere
// notifiche nei comuni grandi (es. Catania) quando il sync non gira per qualche giorno.
const MAX_PAGES_PER_SYNC = 15;
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

    // Normalizza il filtro a lowercase: evita mismatch se l'utente del CRM
    // ha digitato "Locri" nell'URL mentre nel DB è salvato "locri" (o viceversa).
    if (filterSlug) {
        const filterSlugNorm = filterSlug.toLowerCase().trim();
        query = query.where('appSlug', '==', filterSlugNorm);
    }

    const snapshot = await query.get();
    const apps = [];
    // Tutte le app col monitor acceso (anche con configurazione incompleta):
    // servono allo specchio pubblico app_public.
    const enabled = [];

    snapshot.forEach(doc => {
        const data = doc.data();
        const slugNorm = (data.appSlug || '').toLowerCase().trim();
        if (slugNorm) enabled.push({ appSlug: slugNorm, comune: data.comune || '' });
        if (data.goodbarberWebzineId && data.monitorPushUserId) {
            apps.push({
                id: doc.id,
                appSlug: slugNorm,              // sempre lowercase nel flusso sync
                comune: data.comune || '',
                webzineId: data.goodbarberWebzineId,
                monitorUserId: data.monitorPushUserId,
                errorStreak: typeof data.lastPushSyncErrorStreak === 'number' ? data.lastPushSyncErrorStreak : 0,
                appUrl: data.appUrl || (slugNorm ? `https://${slugNorm}.comune.digital` : '')
            });
        }
    });

    return { apps, enabled };
}

/**
 * Aggiorna la collezione pubblica "app_public" (specchio minimale) letta dalle
 * pagine pubbliche (archivio notifiche, landing, archivio eventi) per avere SOLO
 * il nome del Comune, senza esporre il documento 'app' completo — che contiene
 * il goodbarberToken e altri dati riservati.
 * Doc-id = appSlug (lowercase). Campi pubblici: appSlug, comune, pushMonitorEnabled.
 * Scritta SOLO dal server (Admin SDK): nelle regole 'app_public' è write:false.
 *
 * Scrive solo i documenti che cambiano (prima: 109 scritture ogni 15 minuti) e
 * mette pushMonitorEnabled=false ai Comuni spenti nel configuratore, che prima
 * restavano per sempre nella landing pubblica.
 * Non-fatale: se fallisce logga e prosegue, senza bloccare il sync push.
 */
async function syncAppPublicMirror(enabled) {
    try {
        const voluti = new Map();
        for (const a of enabled) if (a.appSlug) voluti.set(a.appSlug, a.comune || '');

        const attuali = new Map();
        const snap = await db.collection('app_public').get();
        snap.forEach(d => attuali.set(d.id, d.data() || {}));

        const ops = [];
        for (const [slug, comune] of voluti) {
            const cur = attuali.get(slug);
            if (!cur || cur.pushMonitorEnabled !== true || (cur.comune || '') !== comune || cur.appSlug !== slug) {
                ops.push({ slug, data: { appSlug: slug, comune, pushMonitorEnabled: true } });
            }
        }
        for (const [slug, cur] of attuali) {
            if (!voluti.has(slug) && cur.pushMonitorEnabled === true) {
                ops.push({ slug, data: { pushMonitorEnabled: false } });
            }
        }

        const CHUNK = 400; // limite batch Firestore = 500 operazioni
        for (let i = 0; i < ops.length; i += CHUNK) {
            const batch = db.batch();
            for (const op of ops.slice(i, i + CHUNK)) {
                batch.set(db.collection('app_public').doc(op.slug), {
                    ...op.data,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
            await batch.commit();
        }
        console.log(`[sync] app_public: ${ops.length} documenti aggiornati su ${voluti.size} comuni monitorati`);
    } catch (e) {
        console.error('[sync] Errore aggiornamento app_public (non fatale):', e.message);
    }
}

/**
 * ID deterministico del documento push_history di una notifica GoodBarber.
 * Lo slug normalizzato evita doppioni Locri/locri.
 */
function pushDocId(appSlug, gbPushId) {
    return `gb_${appSlug}_${gbPushId}`;
}

/**
 * Quali notifiche di questa pagina sono GIÀ su Firestore?
 *
 * GoodBarber NON garantisce gbPushId crescenti (i template ricorrenti riusano
 * l'ID originale), quindi non basta un "max id": serve sapere, notifica per
 * notifica, se è già stata importata. Siccome l'ID del documento è
 * deterministico, basta leggere i ~20 documenti della pagina con un solo
 * getAll, invece di scaricare ogni volta le ultime 500 notifiche dell'app.
 *
 * In caso di errore ritorna un Set vuoto: comportamento "prima sync" (importa
 * tutto quello che trova; il salvataggio è idempotente grazie a merge:true).
 */
async function knownPushIds(appSlug, notifs) {
    const known = new Set();
    const withId = notifs.filter(n => n && n.id !== undefined && n.id !== null);
    if (withId.length === 0) return known;
    try {
        const refs = withId.map(n => db.collection('push_history').doc(pushDocId(appSlug, n.id)));
        const snaps = await db.getAll(...refs);
        snaps.forEach((snap, i) => { if (snap.exists) known.add(withId[i].id); });
    } catch (e) {
        console.warn(`[sync] knownPushIds fallito per ${appSlug}: ${e.message}`);
    }
    return known;
}

/**
 * Timeout di default per le chiamate a GoodBarber.
 * Se l'API non risponde entro questo tempo la singola fetch viene abortita;
 * il sync prosegue con le pagine già scaricate invece di bloccarsi fino al
 * timeout della serverless function (300s).
 */
const GOODBARBER_FETCH_TIMEOUT_MS = 30000; // 30 secondi

/**
 * Chiama l'API GoodBarber pushapi/history con timeout esplicito.
 * Usa AbortController così se l'API è lenta non ci blocchiamo indefinitamente.
 */
async function fetchPushHistory(webzineId, userId, page = 1) {
    const url = `${GOODBARBER_PUSH_API}?user_id=${userId}&token=&page=${page}&webzine_id=${webzineId}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GOODBARBER_FETCH_TIMEOUT_MS);

    let response;
    try {
        response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: controller.signal
        });
    } catch (err) {
        // AbortError → timeout esplicito; altri errori → rilancia
        if (err && err.name === 'AbortError') {
            throw new Error(`GoodBarber API timeout (>${GOODBARBER_FETCH_TIMEOUT_MS}ms) su pagina ${page}`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }

    if (!response.ok) {
        throw new Error(`GoodBarber API error: ${response.status} ${response.statusText}`);
    }

    // Parsing JSON difensivo: se la risposta non è JSON valido,
    // evita che l'intero sync esploda con un SyntaxError generico.
    let data;
    try {
        data = await response.json();
    } catch (err) {
        throw new Error(`GoodBarber API: risposta non-JSON (pagina ${page}): ${err.message}`);
    }

    // Controllo esplicito del flag 'ok' di GoodBarber:
    // alcune risposte arrivano con ok=false anche con status HTTP 200.
    // Lo trattiamo solo se il campo è esplicitamente falsy (false/0/"false"/"0"),
    // altrimenti (undefined) procediamo come prima per retrocompatibilità.
    if (data && typeof data.ok !== 'undefined') {
        const okVal = data.ok;
        const isExplicitlyNotOk =
            okVal === false || okVal === 0 || okVal === '0' || okVal === 'false';
        if (isExplicitlyNotOk) {
            throw new Error(`GoodBarber API: ok=${JSON.stringify(okVal)} (pagina ${page})`);
        }
    }

    return data;
}

/**
 * Prova a convertire un valore qualsiasi in Date valida.
 * GoodBarber può restituire pushed_at come:
 *   - timestamp unix (numero o stringa numerica, in secondi)
 *   - stringa ISO ("2026-04-21T08:30:00Z")
 *   - formato custom non sempre parseable
 * In più la risposta contiene anche pushed_at_date come fallback.
 * Ritorna null se nessun formato è parseabile.
 */
function parsePushedAt(primaryValue, fallbackValue) {
    const tryParse = (v) => {
        if (v === null || v === undefined || v === '') return null;

        // Numero → assume epoch. Heuristica: se < 10^12 è in secondi, altrimenti in ms.
        if (typeof v === 'number' && isFinite(v)) {
            const ms = v < 1e12 ? v * 1000 : v;
            const d = new Date(ms);
            return isNaN(d.getTime()) ? null : d;
        }

        // Stringa numerica → stesso trattamento
        if (typeof v === 'string' && /^\d+$/.test(v.trim())) {
            const n = parseInt(v, 10);
            const ms = n < 1e12 ? n * 1000 : n;
            const d = new Date(ms);
            return isNaN(d.getTime()) ? null : d;
        }

        // Altra stringa → prova ISO/RFC
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d;
    };

    return tryParse(primaryValue) || tryParse(fallbackValue) || null;
}

/**
 * Determina il tipo/sorgente della notifica in modalità IBRIDA:
 *
 *   1. PRIMA prova a usare i metadati GoodBarber (rootzine, section_id, url)
 *      → è la classificazione più affidabile perché non dipende dal testo
 *      scelto dall'operatore ma dalla sezione dell'app da cui proviene la push.
 *
 *   2. POI applica i pattern testuali sul messaggio (prefissi noti, parole chiave)
 *      → utile per allerte meteo scritte a mano, comunicati, differenziata, ecc.
 *
 *   3. INFINE, se nulla matcha, ritorna 'manual' (categoria Avvisi)
 *      → così le notifiche non identificate NON spariscono ma compaiono sotto Avvisi.
 *
 * Accetta l'intero oggetto notif di GoodBarber: { id, message, rootzine, section_id, url, ... }
 * Per retrocompatibilità accetta anche una stringa (il solo messaggio).
 */
function detectNotificationSource(notif) {
    // Retrocompatibilità: se viene passata una stringa, la trattiamo come message
    if (typeof notif === 'string') notif = { message: notif };
    notif = notif || {};

    const message = notif.message || '';
    const rootzine = (notif.rootzine || '').toString().toLowerCase();
    const url = (notif.url || '').toString().toLowerCase();
    const sectionId = notif.section_id || null;

    if (!message && !url && !rootzine) {
        return { source: 'manual', title: '', body: '' };
    }

    // ============================================================
    // FASE 1 — Classificazione tramite metadati GoodBarber
    // ============================================================

    // rootzine e URL sono forti indicatori della sezione dell'app.
    // GoodBarber usa convenzioni tipo "news", "events", "articles" ecc.
    const metaText = rootzine + ' ' + url;

    // Notizie: sezioni news/articles/comunicati/blog
    if (
        /\b(news|article|blog|rss|feed|comunicat|press|stamp)/i.test(metaText) ||
        /\/(news|article|blog|rss|comunicat|press)/i.test(url)
    ) {
        return {
            source: 'rss_auto',
            title: extractTitleFromMessage(message) || 'Notizia',
            body: stripKnownPrefixes(message)
        };
    }

    // Agenda / Eventi: sezioni events/agenda/calendar
    if (
        /\b(event|agenda|calendar|calendario|manifestaz)/i.test(metaText) ||
        /\/(event|agenda|calendar)/i.test(url)
    ) {
        // ATTENZIONE: in GoodBarber anche il calendario della raccolta
        // differenziata è una sezione Agenda. Se il testo è chiaramente un
        // promemoria rifiuti lo etichettiamo come 'Differenziata', altrimenti
        // finirebbe nell'archivio eventi pubblico come se fosse un evento
        // (l'archivio accetta i titoli 'In Programma' ed 'Evento').
        const titoloDaPrefisso = extractTitleFromMessage(message);
        const sembraRaccolta = /(stasera esporre|domattina esponi|esporre il |esporre i |esporre la |esporre l'|porta a porta|raccolta differenziata|mastello)/i.test(message);
        return {
            source: 'calendar_auto',
            title: titoloDaPrefisso || (sembraRaccolta ? 'Differenziata' : 'Evento'),
            body: stripKnownPrefixes(message)
        };
    }

    // Allerte meteo: sezioni weather/alert/protezione-civile
    if (
        /\b(weather|meteo|allerta|alert|protezione.civile|emergen)/i.test(metaText) ||
        /\/(weather|meteo|alert|allerta)/i.test(url)
    ) {
        return {
            source: 'meteo_alert',
            title: 'Allerta',
            body: message
        };
    }

    // ============================================================
    // FASE 2 — Pattern testuali (come prima, per fallback su messaggi
    // scritti a mano o quando i metadati non sono chiari)
    // ============================================================

    // Pattern: "News: testo..." → RSS automatica
    if (message.startsWith('News:')) {
        return {
            source: 'rss_auto',
            title: 'News',
            body: message.substring(5).trim()
        };
    }

    // Pattern: "Social News: testo..." → RSS automatica (deve stare PRIMA di "Social:")
    if (message.startsWith('Social News:')) {
        return {
            source: 'rss_auto',
            title: 'Social News',
            body: message.substring(12).trim()
        };
    }

    // Pattern: "Social: testo..." → RSS automatica
    if (message.startsWith('Social:')) {
        return {
            source: 'rss_auto',
            title: 'Social',
            body: message.substring(7).trim()
        };
    }

    // Pattern: "Facebook: testo..." → RSS automatica
    if (message.startsWith('Facebook:')) {
        return {
            source: 'rss_auto',
            title: 'Facebook',
            body: message.substring(9).trim()
        };
    }

    // Pattern: "Comunicato:" / "Comunicati:" (case-insensitive, con o senza "s") → Notizie
    // Copre: "Comunicato: ...", "Comunicati: ...", "COMUNICATO STAMPA: ..."
    if (/^comunicat[oi]\b/i.test(message)) {
        const body = message.replace(/^comunicat[oi][^:]*:\s*/i, '').trim();
        return {
            source: 'rss_auto',
            title: 'Comunicato',
            body: body || message
        };
    }

    // Pattern: "Avviso:" / "Avvisi:" (case-insensitive) → Notizie
    // Molti comuni usano questo prefisso per comunicazioni istituzionali che sono di fatto news
    if (/^avvis[oi]\s*:/i.test(message)) {
        const body = message.replace(/^avvis[oi]\s*:\s*/i, '').trim();
        return {
            source: 'rss_auto',
            title: 'Avviso',
            body: body || message
        };
    }

    // Pattern: "Notizia:" / "Notizie:" (case-insensitive) → Notizie
    if (/^notizi[ae]\s*:/i.test(message)) {
        const body = message.replace(/^notizi[ae]\s*:\s*/i, '').trim();
        return {
            source: 'rss_auto',
            title: 'Notizia',
            body: body || message
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

    // Pattern: "Differenziata: testo..." (case-insensitive) → Calendario/automatico
    if (/^differenziata[:\s]/i.test(message)) {
        const body = message.replace(/^differenziata[:\s-]*/i, '').trim();
        return {
            source: 'calendar_auto',
            title: 'Differenziata',
            body: body
        };
    }

    // Pattern: "Rifiuti: testo..." (case-insensitive) → Calendario/automatico
    if (/^rifiuti[:\s]/i.test(message)) {
        const body = message.replace(/^rifiuti[:\s-]*/i, '').trim();
        return {
            source: 'calendar_auto',
            title: 'Rifiuti',
            body: body
        };
    }

    // Pattern: "Raccolta Differenziata..." (case-insensitive) → Calendario/automatico
    if (/^raccolta\s+differenziata[:\s]/i.test(message)) {
        const body = message.replace(/^raccolta\s+differenziata[:\s-]*/i, '').trim();
        return {
            source: 'calendar_auto',
            title: 'Differenziata',
            body: body || message
        };
    }

    // Pattern: "Raccolta:" SOLO se seguito da parole chiave rifiuti/differenziata
    // (es: "Raccolta: Stasera esporre...", "Raccolta: domani plastica...")
    // NON matcha "Raccolta fondi", "Raccolta firme" ecc.
    if (/^raccolta\s*:/i.test(message)) {
        const afterPrefix = message.replace(/^raccolta\s*:\s*/i, '');
        const lowerAfter = afterPrefix.toLowerCase();
        // Verifica che il contenuto sia legato a rifiuti/differenziata
        if (/stasera|domani|esporre|ritiro|organico|plastica|carta|vetro|secco|umido|indifferenziat|sfalci|ingombranti|raee|bidone|cassonett/i.test(lowerAfter)) {
            return {
                source: 'calendar_auto',
                title: 'Differenziata',
                body: afterPrefix.trim() || message
            };
        }
    }

    // Pattern: "Stasera esporre..." → Calendario/automatico (raccolta differenziata)
    // NB: "Stasera" da solo NON matcha (potrebbe essere una notizia social)
    if (/^stasera\s+esporre/i.test(message)) {
        return {
            source: 'calendar_auto',
            title: 'Differenziata',
            body: message
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

    // ============================================================
    // FASE 3 — Default
    // ============================================================
    // Nessun metadato e nessun pattern ha matchato: categoria 'manual' (Avvisi).
    // Le notifiche NON vengono mai scartate: finiscono comunque nello storico
    // sotto la categoria Avvisi e da lì possono essere riviste manualmente.
    return {
        source: 'manual',
        title: '',
        body: message
    };
}

/**
 * Rimuove dal messaggio i prefissi noti tipo "News:", "Comunicato:" ecc.
 * così il body finale è pulito quando il titolo viene già dai metadati.
 */
function stripKnownPrefixes(message) {
    if (!message) return '';
    return message
        .replace(/^(News|Social News|Social|Facebook|Comunicat[oi][^:]*|Avvis[oi]|Notizi[ae]|Evento|In\s+[Pp]rogramma|Differenziata|Rifiuti|Raccolta(\s+Differenziata)?|Allerta)\s*:\s*/i, '')
        .trim() || message;
}

/**
 * Estrae un titolo sintetico dal prefisso del messaggio (se presente).
 * Es: "Comunicato: strada chiusa" → "Comunicato"
 * Se non c'è un prefisso riconoscibile ritorna null.
 */
function extractTitleFromMessage(message) {
    if (!message) return null;
    const m = message.match(/^(News|Social News|Social|Facebook|Comunicato|Comunicati|Avviso|Avvisi|Notizia|Notizie|Evento|In Programma|In programma|Differenziata|Rifiuti|Raccolta Differenziata|Allerta)\s*:/i);
    if (!m) return null;
    // Normalizza il titolo con la prima lettera maiuscola
    const raw = m[1].toLowerCase();
    const normalized = {
        'news': 'News',
        'social news': 'Social News',
        'social': 'Social',
        'facebook': 'Facebook',
        'comunicato': 'Comunicato',
        'comunicati': 'Comunicato',
        'avviso': 'Avviso',
        'avvisi': 'Avviso',
        'notizia': 'Notizia',
        'notizie': 'Notizia',
        'evento': 'Evento',
        'in programma': 'In Programma',
        'differenziata': 'Differenziata',
        'rifiuti': 'Rifiuti',
        'raccolta differenziata': 'Differenziata',
        'allerta': 'Allerta'
    };
    return normalized[raw] || m[1];
}

/**
 * Salva un batch di notifiche su Firestore.
 *
 * Se una singola notifica ha date malformate, viene SALTATA con log,
 * ma il resto del batch procede. In questo modo una notifica sporca non
 * blocca la sincronizzazione di tutte le altre per quell'app.
 *
 * Normalizza appSlug a lowercase quando lo salva, così le query pubbliche
 * sono case-insensitive di fatto (bisogna scriverne una sola versione).
 *
 * NUOVO (apr 2026): scarta le notifiche con pushed_at nel FUTURO.
 * GoodBarber a volte restituisce push schedulate (non ancora inviate)
 * o eventi calendar dove pushed_at è la data dell'evento, non dell'invio.
 * Tolleranza: +1 ora per coprire piccoli sfasamenti d'orologio.
 */
async function saveNotifications(notifications, appData) {
    if (!notifications || notifications.length === 0) {
        return { saved: 0, skipped: 0, skippedReasons: [] };
    }

    // 2 scritture per notifica (push_history + specchio push_public): 225 × 2
    // resta sotto il limite di 500 operazioni per batch.
    const BATCH_SIZE = 225;
    const FUTURE_TOLERANCE_MS = 60 * 60 * 1000; // 1 ora
    const futureCutoff = new Date(Date.now() + FUTURE_TOLERANCE_MS);

    let totalSaved = 0;
    let totalSkipped = 0;
    let totalFuture = 0;   // push programmate: non sono un problema, verranno importate quando partono
    const skippedReasons = [];

    // Normalizza una sola volta
    const appSlugNorm = (appData.appSlug || '').toLowerCase().trim();

    for (let i = 0; i < notifications.length; i += BATCH_SIZE) {
        const chunk = notifications.slice(i, i + BATCH_SIZE);
        const batch = db.batch();
        let chunkWrites = 0;

        for (const notif of chunk) {
            // Validazione data (A3): se pushed_at e pushed_at_date sono entrambi
            // invalidi, saltiamo la singola notifica per non rompere il batch.
            const parsedDate = parsePushedAt(notif.pushed_at, notif.pushed_at_date);
            if (!parsedDate) {
                totalSkipped++;
                const reason = `notif id=${notif.id}: pushed_at non parseabile (${JSON.stringify(notif.pushed_at)})`;
                skippedReasons.push(reason);
                console.warn(`[sync] SKIP ${appData.comune} — ${reason}`);
                continue;
            }

            // Validazione data nel FUTURO: una push history non dovrebbe mai avere
            // pushed_at futuro. Se succede è quasi sempre una push schedulata o un
            // evento calendar. Saltiamo per non sporcare lo storico.
            if (parsedDate > futureCutoff) {
                totalFuture++;
                continue;
            }

            // Passiamo l'intero oggetto notif al classifier così può usare
            // anche i metadati (rootzine, section_id, url) oltre al testo.
            const { source, title, body } = detectNotificationSource(notif);

            // Usa un ID deterministico basato sul push_id di GoodBarber
            // per evitare duplicati. Includiamo lo slug normalizzato così
            // non si creano due doc diversi per Locri/locri.
            const docId = pushDocId(appSlugNorm || appData.appSlug, notif.id);
            const docRef = db.collection('push_history').doc(docId);

            const record = {
                appId: appData.id,
                appSlug: appSlugNorm,           // sempre lowercase
                comune: appData.comune,
                title: title,
                message: body,
                fullMessage: notif.message,
                source: source,
                platform: 'all',
                sentAt: admin.firestore.Timestamp.fromDate(parsedDate),
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
            };
            batch.set(docRef, record, { merge: true }); // merge per non sovrascrivere eventuali arricchimenti manuali
            // Specchio pubblico (solo i campi che servono all'archivio, niente gbUrl)
            batchSetPublic(batch, db, docId, record);

            chunkWrites++;
        }

        if (chunkWrites > 0) {
            await batch.commit();
            totalSaved += chunkWrites;
        }
    }

    return {
        saved: totalSaved,
        skipped: totalSkipped,
        future: totalFuture,
        skippedReasons: skippedReasons
    };
}

/**
 * Soglia di "convergenza" per il sync incrementale.
 *
 * Se troviamo K notifiche CONSECUTIVE che sono già nel Set di ID già visti,
 * possiamo ragionevolmente assumere di essere arrivati alla zona "vecchia"
 * della history e fermarci. Più alto è il valore = più robustezza contro
 * notifiche interleaved con ID fuori ordine, ma più chiamate API.
 *
 * 30 è un buon compromesso: copre il caso reale Castel San Niccolò /
 * Mezzolombardo dove ID più piccoli (template ricorrenti) erano interleaved
 * fra ID più grandi recenti. Con il vecchio "stop al primo match" il sync
 * saltava dozzine di notifiche.
 */
const STOP_AFTER_CONSECUTIVE_KNOWN = 30;

/**
 * Sincronizza le notifiche per una singola app.
 *
 * Logica incrementale (non full sync): scorre le pagine GoodBarber e per ogni
 * notifica controlla se è già su Firestore (knownPushIds). Si ferma quando
 * trova STOP_AFTER_CONSECUTIVE_KNOWN notifiche consecutive già viste, oppure
 * quando raggiunge l'ultima pagina o il limite maxPages.
 *
 * Questo approccio è ROBUSTO contro gbPushId non monotonici (caso reale: GoodBarber
 * riusa l'ID di template ricorrenti, quindi una push di oggi può avere ID più basso
 * di una push della settimana scorsa). Il vecchio approccio "stop al primo notif.id
 * <= lastSyncedId" perdeva sistematicamente queste notifiche.
 */
async function syncApp(appData, fullSync = false) {
    const maxPages = fullSync ? MAX_PAGES_FULL_SYNC : MAX_PAGES_PER_SYNC;
    // ID già visti in QUESTO giro (GB a volte ripete una notifica tra due pagine)
    const seenIds = new Set();
    let allNewNotifications = [];
    let page = 1;
    let consecutiveKnown = 0;
    let foundAnyKnown = false;   // l'app ha già uno storico su Firestore
    let convergedOnKnown = false;
    let reachedLastPage = false;
    let apiErrors = [];

    console.log(`[sync] ${appData.comune} (${appData.appSlug}) — fullSync: ${fullSync}`);

    while (page <= maxPages && !convergedOnKnown) {
        try {
            const data = await fetchPushHistory(appData.webzineId, appData.monitorUserId, page);

            if (!data.result || data.result.length === 0) {
                reachedLastPage = true;
                break; // Nessun'altra notifica
            }

            const known = fullSync ? new Set() : await knownPushIds(appData.appSlug, data.result);
            for (const notif of data.result) {
                if (seenIds.has(notif.id)) continue; // ripetuta da GB tra due pagine
                seenIds.add(notif.id);
                if (known.has(notif.id)) {
                    // Già su Firestore: incrementa il contatore di consecutive note.
                    // NON la rimette fra le nuove (sarebbe comunque idempotente grazie
                    // al doc id deterministico + merge:true, ma evitiamo lavoro inutile).
                    foundAnyKnown = true;
                    consecutiveKnown++;
                    if (consecutiveKnown >= STOP_AFTER_CONSECUTIVE_KNOWN) {
                        convergedOnKnown = true;
                        break;
                    }
                } else {
                    consecutiveKnown = 0;
                    allNewNotifications.push(notif);
                }
            }

            // Se siamo all'ultima pagina dichiarata da GB, usciamo
            if (page >= (data.last_page_index || page)) {
                reachedLastPage = true;
                break;
            }

            page++;

            // Delay tra le richieste
            if (page <= maxPages && !convergedOnKnown) {
                await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS));
            }
        } catch (error) {
            console.error(`[sync] Errore pagina ${page} per ${appData.comune}:`, error.message);
            apiErrors.push(`page ${page}: ${error.message}`);
            break;
        }
    }

    // Safety net: se abbiamo raggiunto il limite pagine SENZA convergere su una zona
    // di notifiche già viste e SENZA toccare l'ultima pagina dell'API, significa che
    // potremmo aver perso notifiche più vecchie. Lo segnaliamo come warning.
    const syncWarning = (
        !fullSync &&
        !convergedOnKnown &&
        !reachedLastPage &&
        page > maxPages &&
        foundAnyKnown
    )
        ? `Limite pagine raggiunto (${maxPages}) senza convergere su notifiche già viste. Considera un full sync.`
        : null;

    if (syncWarning) {
        console.warn(`[sync] ⚠️  ${appData.comune}: ${syncWarning}`);
    }

    // Salva le nuove notifiche su Firestore
    const saveResult = await saveNotifications(allNewNotifications, appData);
    const savedCount = saveResult.saved;
    const skippedCount = saveResult.skipped;

    // Se ci sono state notifiche saltate per date malformate, le aggiungiamo
    // al warning così Giancarlo le vede nel CRM (dashboard + alert monitoraggio).
    let finalWarning = syncWarning;
    if (skippedCount > 0) {
        const skipNote = `${skippedCount} notifica/e saltata/e per data non parseabile`;
        finalWarning = finalWarning ? `${finalWarning} | ${skipNote}` : skipNote;
    }

    // Aggiorna il timestamp dell'ultima sincronizzazione + diagnostica.
    // lastPushSyncErrorStreak conta i giri falliti DI FILA: un errore isolato di
    // GoodBarber è "temporaneo", diventa critico solo se si ripete (vedi
    // public/js/push-monitor-health.js).
    const hasErrors = apiErrors.length > 0;
    const updateData = {
        lastPushSync: admin.firestore.FieldValue.serverTimestamp(),
        lastPushSyncCount: savedCount,
        lastPushSyncSkipped: skippedCount,
        lastPushSyncFuture: saveResult.future || 0,
        lastPushSyncPagesScanned: page,
        lastPushSyncStatus: hasErrors ? 'error' : (finalWarning ? 'warning' : 'ok'),
        lastPushSyncWarning: finalWarning || null,
        lastPushSyncError: hasErrors ? apiErrors.join('; ') : null,
        lastPushSyncErrorStreak: hasErrors ? (appData.errorStreak || 0) + 1 : 0
    };
    if (!hasErrors) updateData.lastPushSyncOkAt = admin.firestore.FieldValue.serverTimestamp();
    try {
        await db.collection('app').doc(appData.id).update(updateData);
    } catch (e) {
        console.error(`[sync] Impossibile aggiornare doc app ${appData.id}:`, e.message);
    }

    return {
        app: appData.comune,
        appSlug: appData.appSlug,
        newNotifications: savedCount,
        skippedNotifications: skippedCount,
        skippedReasons: saveResult.skippedReasons && saveResult.skippedReasons.length > 0
            ? saveResult.skippedReasons.slice(0, 5) // tieni solo i primi 5 per non gonfiare il JSON
            : null,
        pagesScanned: page,
        fullSync: fullSync,
        convergedOnKnown: convergedOnKnown,
        reachedLastPage: reachedLastPage,
        warning: finalWarning,
        errors: apiErrors.length > 0 ? apiErrors : null
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

    // Chi può chiamare: cron (CRON_SECRET / User-Agent), SYNC_SECRET, staff del
    // CRM con ID token Firebase. Gli agenti ricevono 403. Vedi lib/staff-auth.js.
    const auth = await verificaAccesso(req, admin);
    if (!auth.ok) {
        return res.status(auth.status || 401).json({ success: false, error: auth.error || 'Non autorizzato' });
    }
    // Il cron riconosciuto solo dall'User-Agent (imitabile) fa SOLO il giro standard.
    const soloGiroStandard = auth.livello === 'cron';
    console.log(`[sync] Autenticazione OK (source: ${auth.source}${auth.uid ? `, uid: ${auth.uid}` : ''})`);

    try {
        const q = soloGiroStandard ? {} : req.query;
        const appSlug = q.appSlug || '';
        const fullSync = q.full === 'true';

        // Recupera le app da sincronizzare
        const { apps, enabled } = await getMonitoredApps(appSlug || null);

        // Specchio pubblico dei nomi Comune (app_public) usato dalle pagine
        // pubbliche al posto del doc 'app' completo. Solo sui giri che vedono
        // TUTTE le app (niente filtro, primo blocco) e al massimo una volta l'ora
        // per il cron (sync manuale: subito). Non-fatale.
        const giroCompleto = !appSlug && !(parseInt(q.chunk) > 0);
        const isCron = auth.source === 'cron-secret' || auth.source === 'vercel-cron-ua';
        if (giroCompleto && (!isCron || new Date().getUTCMinutes() < 15)) {
            await syncAppPublicMirror(enabled);
        }

        if (apps.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'Nessuna app configurata per il monitoraggio push.',
                hint: 'Assicurati che le app in Firestore abbiano pushMonitorEnabled=true, monitorPushUserId e goodbarberWebzineId configurati.'
            });
        }

        // Supporto chunk: ?chunk=0&chunkSize=30 per processare a blocchi
        const chunkIndex = parseInt(q.chunk) || 0;
        const chunkSize = Math.min(parseInt(q.chunkSize) || 0, 100); // 0 = tutte

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

        if (soloGiroStandard) {
            return res.status(200).json({ success: true, totalApps: appsToSync.length, totalNewNotifications: totalNew });
        }

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

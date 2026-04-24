/**
 * Serverless Function — Proxy Articoli/Contenuti GoodBarber
 *
 * Riceve un gbUrl (endpoint API GoodBarber), lo chiama lato server
 * e restituisce i dati in formato JSON pulito.
 *
 * Supporta:
 *   - Articoli (sezioni RSS/News) → items[0].content
 *   - Eventi (sezioni Agenda) → items[0].content + sortDate/endDate/address
 *   - Avvisi/CMS custom → items[0].content
 *
 * Il campo "type" restituito ("article" | "event" | ...) permette al reader
 * di adattare l'interfaccia (badge, info extra, gestione eventi passati).
 *
 * REGOLA: i messaggi di errore visibili all'utente finale NON devono MAI
 * nominare "GoodBarber" né dettagli implementativi. Messaggi neutri e
 * comprensibili. I commenti nel codice e i console.log server-side
 * possono continuare a nominarlo (sono solo per noi).
 *
 * MARCATURA CONTENUTO INDISPONIBILE:
 * Se viene passato anche il parametro `notifId` (= doc ID Firestore della
 * notifica) e il CMS risponde 404/410 sul contenuto, questo proxy scrive
 * `contentUnavailable: true` sul documento push_history/{notifId}. La
 * vista utente poi usa questo flag per nascondere il pulsante "Leggi..."
 * per tutte le visualizzazioni successive.
 *
 * Endpoint:
 *   GET /api/article-proxy?url={gbUrl}
 *   GET /api/article-proxy?url={gbUrl}&notifId={doc_id_firestore}
 *
 * Risposta:
 *   {
 *     ok: true,
 *     article: {
 *       id, title, content, summary, thumbnail, sourceUrl,
 *       author, date, type, subtype,
 *       // Extra per eventi:
 *       sortDate, endDate, allDay, address, latitude, longitude
 *     }
 *   }
 *   oppure
 *   { ok: false, error: "messaggio errore user-friendly" }
 */

const admin = require('firebase-admin');

// Inizializza Firebase Admin (singleton, lazy). Non serve per la chiamata
// principale al CMS: serve solo per marcare la notifica come non più
// disponibile quando riceviamo un 404. Inizializziamo comunque all'avvio
// del modulo così evitiamo race condition al primo 404 ricevuto.
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
        console.error('[article-proxy] Errore inizializzazione Firebase Admin:', e.message);
    }
}

/**
 * Scrive sul doc push_history/{notifId} il flag contentUnavailable.
 * Operazione best-effort: se fallisce, logga ma non rompe il flusso
 * principale (l'utente riceve comunque la sua risposta dal proxy).
 *
 * @param {string} notifId — doc ID del documento push_history
 * @param {boolean} unavailable — true per marcare come non disponibile
 */
async function markNotificationUnavailable(notifId, unavailable) {
    if (!notifId || typeof notifId !== 'string') return;
    try {
        const db = admin.firestore();
        await db.collection('push_history').doc(notifId).update({
            contentUnavailable: !!unavailable,
            contentCheckedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log('[article-proxy] Marcata notifica', notifId, 'contentUnavailable:', unavailable);
    } catch (e) {
        // Se il doc non esiste o c'è un problema di permessi, NON falliamo —
        // questa è un'ottimizzazione best-effort. L'utente finale non si
        // accorge di nulla.
        console.warn('[article-proxy] Impossibile aggiornare notifica', notifId, ':', e.message);
    }
}

module.exports = async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // Cache per 1 ora — i contenuti non cambiano spesso
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ ok: false, error: 'Richiesta non valida.' });
    }

    const { url, notifId } = req.query;

    if (!url) {
        return res.status(400).json({ ok: false, error: 'Contenuto non specificato.' });
    }

    // Sicurezza: accetta solo URL dei CMS autorizzati (allowlist interna).
    // All'utente non serve sapere quali sono — restituiamo messaggio generico.
    try {
        const parsed = new URL(url);
        const validHosts = ['.goodbarber.app', '.goodbarber.com', '.ww-api.com'];
        const isValid = validHosts.some(h => parsed.hostname.endsWith(h));
        if (!isValid) {
            return res.status(403).json({ ok: false, error: 'Link non consentito.' });
        }
    } catch (e) {
        return res.status(400).json({ ok: false, error: 'Link non valido.' });
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            signal: controller.signal
        });
        clearTimeout(timeout);

        // Se il CMS risponde non-OK, differenziamo tra 404 (contenuto rimosso/scaduto,
        // tipico per RSS ruotati dai comuni) e altri errori tecnici. Scrivere il log
        // completo lato server per debug, ma all'utente mostrare un messaggio chiaro.
        if (!response.ok) {
            console.warn('[article-proxy] Risposta non-OK dal CMS:', response.status, response.statusText, 'url:', url);
            if (response.status === 404 || response.status === 410) {
                // Contenuto definitivamente non più disponibile — marca la notifica
                // su Firestore così la vista utente non mostrerà più il pulsante.
                // Awaitiamo così siamo sicuri che la scrittura sia andata prima
                // che Vercel killa la funzione serverless.
                await markNotificationUnavailable(notifId, true);

                return res.status(404).json({
                    ok: false,
                    error: 'Questo contenuto non è più disponibile. Potrebbe essere stato rimosso o archiviato.'
                });
            }
            return res.status(502).json({
                ok: false,
                error: 'Contenuto temporaneamente non raggiungibile. Riprova tra qualche istante.'
            });
        }

        const data = await response.json();

        // Estrai l'articolo dal formato GoodBarber
        // Formato tipico:
        //   { items: [{ id, title, content, thumbnail, url, author, date, summary, type, ... }] }
        const items = data.items || data.result || [];
        if (!Array.isArray(items) || items.length === 0) {
            // Anche questo caso = contenuto non disponibile (risposta OK ma vuota)
            await markNotificationUnavailable(notifId, true);
            return res.status(404).json({ ok: false, error: 'Contenuto non trovato.' });
        }

        const item = items[0];

        // Normalizza indirizzo: GoodBarber a volte lo restituisce in "address"
        // e a volte come oggetto strutturato (per ora gestiamo solo string).
        let addressStr = '';
        if (typeof item.address === 'string') {
            addressStr = item.address;
        } else if (item.address && typeof item.address === 'object') {
            // Concatena campi comuni dell'oggetto indirizzo
            addressStr = [item.address.street, item.address.city, item.address.country]
                .filter(Boolean).join(', ');
        }

        // Successo: se la notifica era stata precedentemente marcata come
        // non disponibile, "guariamo" il flag (contenuto ritornato visibile).
        // Scriviamo SOLO se notifId è presente — così non aggiungiamo il campo
        // a documenti che non l'hanno mai avuto.
        if (notifId) {
            await markNotificationUnavailable(notifId, false);
        }

        return res.status(200).json({
            ok: true,
            article: {
                id: item.id || null,
                title: item.title || '',
                content: item.content || '',
                summary: item.summary || '',
                thumbnail: item.largeThumbnail || item.thumbnail || item.xLargeThumbnail || '',
                sourceUrl: item.url || '',
                author: item.author || '',
                date: item.date || '',
                type: item.type || 'article',
                subtype: item.subtype || '',
                // Campi specifici per eventi (presenti per type='event', null altrove)
                sortDate: item.sortDate || null,
                endDate: item.endDate || null,
                allDay: typeof item.allDay === 'boolean' ? item.allDay : false,
                address: addressStr || null,
                latitude: item.latitude || null,
                longitude: item.longitude || null
            }
        });
    } catch (error) {
        if (error.name === 'AbortError') {
            return res.status(504).json({
                ok: false,
                error: 'Il contenuto ha impiegato troppo tempo a caricare. Riprova.'
            });
        }
        console.error('[article-proxy] Errore:', error.message);
        return res.status(500).json({
            ok: false,
            error: 'Impossibile caricare il contenuto in questo momento.'
        });
    }
};

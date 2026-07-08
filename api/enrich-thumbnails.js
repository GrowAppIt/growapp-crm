/**
 * enrich-thumbnails.js — Cron DEDICATO e ISOLATO (non tocca il sync push).
 *
 * Riempie il campo `thumbnail` nei documenti push_history delle notifiche
 * notizia/evento che hanno un articolo collegato (gbUrl) ma non ancora una
 * miniatura, così l'archivio pubblico le mostra in lista SENZA che l'utente
 * debba aprire la singola notifica.
 *
 * COME FUNZIONA
 *   1. Prende i Comuni monitorati (pushMonitorEnabled == true).
 *   2. Per ciascuno guarda le notifiche recenti e seleziona i "candidati":
 *      notizia/evento (rss_auto/calendar_auto) con gbUrl, senza thumbnail e non
 *      ancora verificati (thumbChecked assente), contenuto non sparito.
 *   3. Per ogni candidato chiama /api/article-proxy: il proxy scarica la
 *      miniatura dal CMS GoodBarber e la SALVA lui stesso su push_history.
 *   4. Marca il candidato come verificato (thumbChecked) SOLO quando l'esito è
 *      definitivo (immagine trovata / articolo senza immagine / contenuto
 *      rimosso), così i fallimenti transitori vengono riprovati al giro dopo.
 *
 * SICUREZZA / BUDGET
 *   - Cap globale di candidati per run + timeout per chiamata + concorrenza
 *     limitata + guardia sul tempo residuo.
 *   - È indipendente dal cron di sincronizzazione push: non può in alcun modo
 *     intaccare il suo budget di 300s.
 */

const admin = require('firebase-admin');

// Inizializza Firebase Admin (singleton) — stesso schema degli altri endpoint.
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
        console.error('[enrich-thumbnails] Errore inizializzazione Firebase Admin:', e.message);
    }
}

const db = admin.firestore();

const NEWS_EVENT_SOURCES = ['rss_auto', 'calendar_auto'];
const PER_APP_SCAN = 200;      // quante notifiche recenti guardare per Comune
const PER_APP_CAP = 80;        // max candidati presi da un singolo Comune per run
const MAX_PER_RUN = 250;       // cap globale di miniature da recuperare per run
const FETCH_CONCURRENCY = 6;   // chiamate al proxy in parallelo
const FETCH_TIMEOUT_MS = 12000;
const TIME_BUDGET_MS = 95000;  // fermati prima per stare largo sul maxDuration (120s)

// Base per la self-call al proxy (stesso deployment). In prod è crm.comune.digital.
const SELF_BASE = process.env.SELF_BASE_URL || 'https://crm.comune.digital';

// Autenticazione: Vercel Cron (auto-detect) oppure SYNC_SECRET.
function checkAuth(req) {
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    if (ua.includes('vercel-cron') || req.headers['x-vercel-cron']) return true;
    const secret = process.env.SYNC_SECRET;
    if (secret) {
        const authHeader = req.headers['authorization'] || '';
        const q = req.query.secret || '';
        return authHeader === `Bearer ${secret}` || authHeader === secret || q === secret;
    }
    return true; // storico: nessun secret impostato → lascia passare (dev)
}

async function fetchWithTimeout(u, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
        return await fetch(u, { signal: controller.signal, headers: { 'Accept': 'application/json' } });
    } finally {
        clearTimeout(timer);
    }
}

async function getMonitoredSlugs() {
    const snap = await db.collection('app').where('pushMonitorEnabled', '==', true).get();
    const slugs = [];
    snap.forEach(doc => {
        const s = ((doc.data() || {}).appSlug || '').toLowerCase().trim();
        if (s) slugs.push(s);
    });
    return slugs;
}

// Candidati per un Comune: notizie/eventi recenti con gbUrl, senza thumbnail e
// non ancora verificati. `cap` limita quanti prenderne.
async function collectCandidates(slug, cap) {
    const out = [];
    const pick = (snap) => {
        snap.forEach(doc => {
            if (out.length >= cap) return;
            const d = doc.data() || {};
            if (!NEWS_EVENT_SOURCES.includes(d.source)) return;
            if (!d.gbUrl) return;
            if (d.thumbnail) return;              // già ha la miniatura
            if (d.thumbChecked) return;           // già tentato in passato
            if (d.contentUnavailable === true) return; // contenuto sparito
            out.push({ id: doc.id, gbUrl: d.gbUrl });
        });
    };
    try {
        // Preferita: le più recenti (richiede indice composito appSlug + sentAt desc).
        const snap = await db.collection('push_history')
            .where('appSlug', '==', slug)
            .orderBy('sentAt', 'desc')
            .limit(PER_APP_SCAN)
            .get();
        pick(snap);
    } catch (e) {
        // FALLBACK senza orderBy: se l'indice composito manca, la query ordinata
        // fallisce. Qui scansioniamo un batch più ampio per appSlug (che usa solo
        // l'indice automatico a campo singolo) e filtriamo lato codice. Così le
        // miniature si popolano comunque, indice o no.
        console.warn('[enrich-thumbnails] query ordinata fallita per', slug, '— uso fallback senza orderBy:', e.message);
        try {
            const snap2 = await db.collection('push_history')
                .where('appSlug', '==', slug)
                .limit(300)
                .get();
            pick(snap2);
        } catch (e2) {
            console.warn('[enrich-thumbnails] anche il fallback è fallito per', slug, ':', e2.message);
        }
    }
    return out;
}

// Recupera la miniatura di un candidato chiamando il proxy (che la salva lui),
// poi marca thumbChecked solo se l'esito è DEFINITIVO.
async function enrichOne(cand) {
    let definitive = false;
    try {
        const u = SELF_BASE + '/api/article-proxy?url=' + encodeURIComponent(cand.gbUrl) +
                  '&notifId=' + encodeURIComponent(cand.id);
        const r = await fetchWithTimeout(u, FETCH_TIMEOUT_MS);
        if (r && r.ok) {
            // Il proxy ha risposto: se c'era un'immagine l'ha già salvata su
            // push_history. In ogni caso l'esito è definitivo.
            await r.json().catch(() => null);
            definitive = true;
        } else if (r && [400, 403, 404, 410].includes(r.status)) {
            // Link non valido / non consentito / contenuto rimosso → non riprovare.
            definitive = true;
        }
        // 5xx o timeout → transiente: NON marchiamo, si riprova al giro dopo.
    } catch (e) {
        // network/abort → transiente
    }
    if (definitive) {
        try {
            await db.collection('push_history').doc(cand.id).update({
                thumbChecked: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) { /* best-effort */ }
    }
    return definitive;
}

module.exports = async function handler(req, res) {
    if (!checkAuth(req)) {
        return res.status(401).json({ ok: false, error: 'Non autorizzato' });
    }

    const startedAt = Date.now();
    try {
        const slugs = await getMonitoredSlugs();

        // Raccogli i candidati fino al cap globale (o al tempo massimo).
        let candidates = [];
        for (const slug of slugs) {
            if (candidates.length >= MAX_PER_RUN) break;
            if (Date.now() - startedAt > TIME_BUDGET_MS) break;
            const room = Math.min(PER_APP_CAP, MAX_PER_RUN - candidates.length);
            const c = await collectCandidates(slug, room);
            candidates = candidates.concat(c);
        }

        // Processa con concorrenza limitata + guardia di tempo.
        let processed = 0;
        let done = 0;
        for (let i = 0; i < candidates.length; i += FETCH_CONCURRENCY) {
            if (Date.now() - startedAt > TIME_BUDGET_MS) break;
            const batch = candidates.slice(i, i + FETCH_CONCURRENCY);
            const results = await Promise.all(batch.map(enrichOne));
            processed += batch.length;
            done += results.filter(Boolean).length;
        }

        console.log(`[enrich-thumbnails] app=${slugs.length} candidati=${candidates.length} processati=${processed} definitivi=${done} ms=${Date.now() - startedAt}`);
        return res.status(200).json({
            ok: true,
            monitoredApps: slugs.length,
            candidates: candidates.length,
            processed: processed,
            definitive: done,
            elapsedMs: Date.now() - startedAt
        });
    } catch (error) {
        console.error('[enrich-thumbnails] Errore generale:', error);
        return res.status(500).json({ ok: false, error: error.message });
    }
};

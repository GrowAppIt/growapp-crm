/**
 * Serverless Function — Report pubblico per Comune
 *
 *   GET  /api/report-pubblico?r=<token>
 *        Pubblico, senza login: restituisce i dati della pagina /report/?r=<token>.
 *        Legge `report_pubblici/{token}` con l'Admin SDK, così le regole
 *        Firestore restano chiuse (nessun accesso diretto dal browser).
 *
 *   POST /api/report-pubblico   { appId, azione }
 *        Solo utenti del CRM con ruolo abilitato alla gestione app.
 *        azione: 'crea'      → crea il link (o restituisce quello esistente) e genera i dati
 *                'aggiorna'  → rigenera subito i dati del link esistente
 *                'rigenera'  → nuovo link; quello vecchio smette di funzionare
 *                'disattiva' → elimina il link e i dati pubblici
 */

const admin = require('firebase-admin');
const { COLLEZIONE, generaToken, tokenValido, salvaReport } = require('../lib/report-pubblico.js');

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
        console.error('[report-pubblico] Errore init Firebase Admin:', e.message);
    }
}

const db = admin.firestore();

// Stessi ruoli che nel CRM hanno il permesso 'manage_apps'
const RUOLI_GESTIONE = ['SUPER_ADMIN', 'ADMIN', 'CTO', 'SVILUPPATORE', 'CONTENT_MANAGER'];
const AZIONI = ['crea', 'aggiorna', 'rigenera', 'disattiva'];

async function verificaUtente(req) {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return { ok: false, status: 401, error: 'Accesso negato: serve il login al CRM.' };
    let decoded;
    try {
        decoded = await admin.auth().verifyIdToken(h.slice(7).trim());
    } catch (e) {
        return { ok: false, status: 401, error: 'Sessione scaduta o non valida: ricarica il CRM e rifai il login.' };
    }
    const u = await db.collection('utenti').doc(decoded.uid).get();
    const dati = u.exists ? (u.data() || {}) : {};
    if (dati.stato === 'DISATTIVO' || !RUOLI_GESTIONE.includes(dati.ruolo)) {
        return { ok: false, status: 403, error: 'Il tuo ruolo non è abilitato a gestire i report pubblici.' };
    }
    return { ok: true, uid: decoded.uid };
}

async function leggiReport(req, res) {
    const token = req.query && req.query.r;
    if (!tokenValido(token)) return res.status(404).json({ error: 'Report non trovato.' });

    const snap = await db.collection(COLLEZIONE).doc(token).get();
    if (!snap.exists || !snap.data().report) return res.status(404).json({ error: 'Report non trovato.' });

    // I dati cambiano una volta a notte: la CDN può tenerli 10 minuti.
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.status(200).json(snap.data().report);
}

async function gestisciLink(req, res) {
    const utente = await verificaUtente(req).catch(e => ({ ok: false, status: 500, error: 'Verifica accesso fallita: ' + e.message }));
    if (!utente.ok) return res.status(utente.status).json({ error: utente.error });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { appId, azione } = body;
    if (!appId || typeof appId !== 'string') return res.status(400).json({ error: 'appId mancante.' });
    if (!AZIONI.includes(azione)) return res.status(400).json({ error: 'Azione non valida.' });

    const appRef = db.collection('app').doc(appId);
    const appSnap = await appRef.get();
    if (!appSnap.exists) return res.status(404).json({ error: 'App non trovata.' });
    const app = appSnap.data();
    const tokenAttuale = tokenValido(app.reportPubblicoToken) ? app.reportPubblicoToken : null;

    if (azione === 'disattiva') {
        if (tokenAttuale) await db.collection(COLLEZIONE).doc(tokenAttuale).delete();
        await appRef.update({
            reportPubblicoToken: admin.firestore.FieldValue.delete(),
            reportPubblicoCreatoIl: admin.firestore.FieldValue.delete()
        });
        return res.status(200).json({ ok: true, token: null });
    }

    if (!app.goodbarberWebzineId || !app.goodbarberToken) {
        return res.status(400).json({ error: 'Integrazione CMS non configurata per questa app.' });
    }
    if (azione === 'aggiorna' && !tokenAttuale) {
        return res.status(400).json({ error: 'Questa app non ha ancora un link pubblico.' });
    }

    const nuovo = azione === 'rigenera' || !tokenAttuale;
    const token = nuovo ? generaToken() : tokenAttuale;

    const salvato = await salvaReport(db, appId, app, token);
    if (!salvato) return res.status(502).json({ error: 'Il CMS non ha restituito dati: riprova tra qualche minuto.' });

    if (nuovo) {
        await appRef.update({
            reportPubblicoToken: token,
            reportPubblicoCreatoIl: new Date().toISOString()
        });
        // Il vecchio link smette di funzionare solo dopo che il nuovo è pronto.
        if (tokenAttuale) await db.collection(COLLEZIONE).doc(tokenAttuale).delete();
    }
    return res.status(200).json({ ok: true, token });
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        if (req.method === 'GET') return await leggiReport(req, res);
        if (req.method === 'POST') return await gestisciLink(req, res);
        return res.status(405).json({ error: 'Metodo non consentito.' });
    } catch (error) {
        console.error('[report-pubblico] Errore:', error && error.message);
        return res.status(500).json({ error: 'Errore interno.' });
    }
};

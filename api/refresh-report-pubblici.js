/**
 * Serverless Function — Aggiornamento notturno dei report pubblici (cron)
 *
 * Per ogni app che ha un link pubblico (`reportPubblicoToken`) ricostruisce
 * `report_pubblici/{token}` con gli ultimi 12 mesi dal CMS, i download totali
 * e il dato manuale degli iscritti alle notifiche (consensiPush).
 *
 * Endpoint:
 *   GET /api/refresh-report-pubblici              → tutte le app con link
 *   GET /api/refresh-report-pubblici?appId=APP-1  → solo quella app (test)
 *
 * Protezione: serve CRON_SECRET nelle variabili d'ambiente di Vercel e la
 * richiesta deve presentare `Authorization: Bearer <CRON_SECRET>` (Vercel Cron
 * lo invia da solo) oppure `?secret=<CRON_SECRET>`. Senza CRON_SECRET non parte.
 */

const admin = require('firebase-admin');
const { tokenValido, salvaReport } = require('../lib/report-pubblico.js');

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
        console.error('[refresh-report-pubblici] Errore init Firebase Admin:', e.message);
    }
}

const db = admin.firestore();

const PARALLELE = 3;          // app elaborate in contemporanea
const MARGINE_TEMPO_MS = 270000; // si ferma prima del limite di 300 s della funzione

module.exports = async function handler(req, res) {
    // A differenza di refresh-gb-stats, senza CRON_SECRET l'endpoint resta chiuso:
    // lo user-agent "vercel-cron" si può falsificare.
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        console.error('[refresh-report-pubblici] CRON_SECRET non configurata: aggiornamento non eseguito');
        return res.status(503).json({ ok: false, error: 'CRON_SECRET non configurata' });
    }
    const auth = req.headers.authorization || '';
    const qSecret = (req.query && req.query.secret) || '';
    if (auth !== 'Bearer ' + secret && qSecret !== secret) {
        return res.status(401).json({ ok: false, error: 'Non autorizzato' });
    }

    const filterAppId = (req.query && req.query.appId) ? String(req.query.appId) : null;
    const started = Date.now();

    try {
        const snapshot = await db.collection('app').where('reportPubblicoToken', '>', '').get();
        const apps = [];
        snapshot.forEach(doc => {
            if (filterAppId && doc.id !== filterAppId) return;
            const data = doc.data();
            if (tokenValido(data.reportPubblicoToken) && data.goodbarberWebzineId && data.goodbarberToken) {
                apps.push({ id: doc.id, data });
            }
        });

        let updated = 0, failed = 0, skipped = 0;
        const errors = [];
        let next = 0;

        async function worker() {
            while (next < apps.length) {
                if (Date.now() - started > MARGINE_TEMPO_MS) { skipped += apps.length - next; next = apps.length; return; }
                const { id, data } = apps[next++];
                const nome = data.comune || data.nome || id;
                try {
                    const ok = await salvaReport(db, id, data, data.reportPubblicoToken);
                    if (ok) updated++;
                    else { failed++; errors.push(nome + ': nessun dato dal CMS'); }
                } catch (e) {
                    failed++;
                    errors.push(nome + ': ' + (e && e.message));
                    console.error('[refresh-report-pubblici] Errore su ' + nome + ':', e && e.message);
                }
            }
        }
        await Promise.all(Array.from({ length: Math.min(PARALLELE, apps.length) }, worker));

        const elapsed = ((Date.now() - started) / 1000).toFixed(1);
        console.log(`[refresh-report-pubblici] Aggiornati ${updated}, falliti ${failed}, saltati ${skipped} su ${apps.length} in ${elapsed}s`);
        return res.status(200).json({ ok: true, total: apps.length, updated, failed, skipped, elapsedSeconds: Number(elapsed), errors: errors.slice(0, 20) });
    } catch (error) {
        console.error('[refresh-report-pubblici] Errore generale:', error && error.message);
        return res.status(500).json({ ok: false, error: 'Errore interno', detail: error && error.message });
    }
};

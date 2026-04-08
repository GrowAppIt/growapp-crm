/**
 * Serverless Function — Audit Account Fantasma (Ghost Accounts)
 *
 * Scopo: individuare in un colpo solo tutti i comuni il cui `monitorPushUserId`
 * salvato su Firestore NON corrisponde più all'account fantasma effettivamente
 * installato sul dispositivo di monitoraggio.
 *
 * Il sintomo è sempre lo stesso: l'API `pushapi/history` di GoodBarber per quello
 * user_id restituisce 0 notifiche negli ultimi giorni, anche se il device fisico
 * le sta ricevendo regolarmente.
 *
 * Esempi d'uso:
 *
 *   GET /api/diag-ghost-audit
 *     → Audit di tutti i comuni con pushMonitorEnabled=true, finestra 2 giorni.
 *
 *   GET /api/diag-ghost-audit?days=7
 *     → Come sopra ma considera "SOSPETTO" se 0 notifiche negli ultimi 7 giorni.
 *
 *   GET /api/diag-ghost-audit?format=html
 *     → Restituisce una tabella HTML stampabile, invece di JSON.
 *
 *   GET /api/diag-ghost-audit?pages=3
 *     → Scansiona fino a 3 pagine per ogni comune (default: 2 = 40 notifiche).
 *
 * L'endpoint NON modifica NIENTE su Firestore. È solo lettura.
 * Protetto dallo stesso SYNC_SECRET degli altri endpoint.
 */

const admin = require('firebase-admin');

// ---------------------------------------------------------------------------
// Inizializzazione Firebase Admin (singleton, stesso pattern degli altri file)
// ---------------------------------------------------------------------------
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
        console.error('[diag-ghost-audit] Errore init Firebase Admin:', e.message);
    }
}

const db = admin.firestore();

const GOODBARBER_PUSH_API = 'https://api.goodbarber.net/pushapi/history/';

// ---------------------------------------------------------------------------
// Helper: scarica fino a N pagine da GoodBarber per un singolo comune
// ---------------------------------------------------------------------------
async function fetchGoodBarberPages(webzineId, userId, maxPages) {
    const results = [];
    const errors = [];
    let httpStatus = null;

    for (let page = 1; page <= maxPages; page++) {
        const url = `${GOODBARBER_PUSH_API}?user_id=${encodeURIComponent(userId)}&token=&page=${page}&webzine_id=${encodeURIComponent(webzineId)}`;
        try {
            const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
            httpStatus = r.status;
            if (!r.ok) {
                errors.push(`pagina ${page}: HTTP ${r.status}`);
                break;
            }
            const data = await r.json();
            if (!data || !Array.isArray(data.result) || data.result.length === 0) break;
            data.result.forEach(n => results.push(n));
            const lastPageIndex = data.last_page_index || null;
            if (lastPageIndex && page >= lastPageIndex) break;
            // Piccolo delay per non stressare l'API GB tra pagine
            await new Promise(res => setTimeout(res, 120));
        } catch (e) {
            errors.push(`pagina ${page}: ${e.message}`);
            break;
        }
    }

    return { results, errors, httpStatus };
}

// ---------------------------------------------------------------------------
// Helper: estrae una data affidabile da un record GoodBarber
// ---------------------------------------------------------------------------
function parseGbDate(n) {
    // GoodBarber usa `pushed_at_date` (ISO) o `pushed_at` (epoch secondi o ISO)
    if (n.pushed_at_date) {
        const d = new Date(n.pushed_at_date);
        if (!isNaN(d.getTime())) return d;
    }
    if (n.pushed_at) {
        // Se è numerico interpretalo come epoch seconds
        if (typeof n.pushed_at === 'number' || /^\d+$/.test(n.pushed_at)) {
            const secs = parseInt(n.pushed_at, 10);
            return new Date(secs * 1000);
        }
        const d = new Date(n.pushed_at);
        if (!isNaN(d.getTime())) return d;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Helper: audit di un singolo comune
// ---------------------------------------------------------------------------
async function auditSingleApp(appDoc, daysWindow, pages) {
    const data = appDoc.data();
    const appSlug = data.appSlug || appDoc.id;
    const comune = data.comune || data.nome || appSlug;
    const userId = data.monitorPushUserId || null;
    const webzineId = data.goodbarberWebzineId || null;

    const base = {
        appSlug,
        comune,
        monitorPushUserId: userId,
        goodbarberWebzineId: webzineId,
        totalNotifications: 0,
        notificationsInWindow: 0,
        lastPushAt: null,
        daysSinceLastPush: null,
        httpStatus: null,
        errors: null,
        status: 'UNKNOWN',
        statusReason: ''
    };

    // Config incompleta
    if (!userId || !webzineId) {
        base.status = 'NOT_CONFIGURED';
        base.statusReason = !userId
            ? 'Manca monitorPushUserId su Firestore'
            : 'Manca goodbarberWebzineId su Firestore';
        return base;
    }

    // Chiama GB
    const gb = await fetchGoodBarberPages(webzineId, userId, pages);
    base.httpStatus = gb.httpStatus;
    base.errors = gb.errors.length > 0 ? gb.errors : null;
    base.totalNotifications = gb.results.length;

    // API errore o 0 risultati → ROTTO o SOSPETTO
    if (gb.errors.length > 0 && gb.results.length === 0) {
        base.status = 'ROTTO';
        base.statusReason = `API GoodBarber ha restituito errore: ${gb.errors.join('; ')}`;
        return base;
    }

    if (gb.results.length === 0) {
        base.status = 'SOSPETTO';
        base.statusReason = `L'API non ha restituito nessuna notifica per questo user_id. Probabile: account fantasma cambiato o non più registrato.`;
        return base;
    }

    // Analizza le date
    const now = new Date();
    const windowMs = daysWindow * 24 * 60 * 60 * 1000;
    let latest = null;
    let inWindow = 0;

    gb.results.forEach(n => {
        const d = parseGbDate(n);
        if (!d) return;
        if (!latest || d > latest) latest = d;
        if ((now - d) <= windowMs) inWindow++;
    });

    base.lastPushAt = latest ? latest.toISOString() : null;
    base.daysSinceLastPush = latest ? Math.round((now - latest) / (24 * 60 * 60 * 1000) * 10) / 10 : null;
    base.notificationsInWindow = inWindow;

    if (inWindow > 0) {
        base.status = 'OK';
        base.statusReason = `${inWindow} notifiche ricevute negli ultimi ${daysWindow} giorni`;
    } else {
        base.status = 'SOSPETTO';
        base.statusReason = `Zero notifiche negli ultimi ${daysWindow} giorni (ultima: ${base.daysSinceLastPush ?? '?'} giorni fa). Quasi certamente lo user_id salvato non è più quello dell'account fantasma attivo sul device.`;
    }

    return base;
}

// ---------------------------------------------------------------------------
// Helper: render HTML della tabella audit
// ---------------------------------------------------------------------------
function renderHtml(results, daysWindow) {
    const counters = { OK: 0, SOSPETTO: 0, ROTTO: 0, NOT_CONFIGURED: 0, UNKNOWN: 0 };
    results.forEach(r => { counters[r.status] = (counters[r.status] || 0) + 1; });

    const badgeColor = {
        OK: '#3CA434',
        SOSPETTO: '#FFCC00',
        ROTTO: '#D32F2F',
        NOT_CONFIGURED: '#9B9B9B',
        UNKNOWN: '#9B9B9B'
    };

    const rows = results.map(r => `
        <tr>
            <td><strong>${escapeHtml(r.comune || '-')}</strong><br><small style="color:#9B9B9B">${escapeHtml(r.appSlug)}</small></td>
            <td><span style="background:${badgeColor[r.status]};color:#fff;padding:4px 10px;border-radius:12px;font-size:12px;font-weight:700">${r.status}</span></td>
            <td>${r.notificationsInWindow} / ${r.totalNotifications}</td>
            <td>${r.lastPushAt ? new Date(r.lastPushAt).toLocaleString('it-IT') : '-'}</td>
            <td>${r.daysSinceLastPush !== null ? r.daysSinceLastPush + ' g' : '-'}</td>
            <td><code style="font-size:11px">${escapeHtml(String(r.monitorPushUserId || '-'))}</code></td>
            <td><small>${escapeHtml(r.statusReason || '')}</small></td>
        </tr>
    `).join('');

    return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Audit Account Fantasma</title>
<link href="https://fonts.googleapis.com/css2?family=Titillium+Web:wght@300;400;600;700;900&display=swap" rel="stylesheet">
<style>
    body { font-family: 'Titillium Web', sans-serif; margin: 20px; background: #F5F5F5; color: #4A4A4A; }
    h1 { color: #145284; font-weight: 900; }
    .summary { display: flex; gap: 12px; flex-wrap: wrap; margin: 20px 0; }
    .summary-card { background: #fff; padding: 14px 18px; border-radius: 10px; border-left: 4px solid #145284; min-width: 140px; }
    .summary-card .num { font-size: 28px; font-weight: 900; color: #145284; }
    .summary-card .lbl { font-size: 12px; color: #9B9B9B; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 8px rgba(20,82,132,0.08); }
    th { background: #145284; color: #fff; padding: 12px 10px; text-align: left; font-weight: 700; font-size: 13px; }
    td { padding: 10px; border-bottom: 1px solid #D9D9D9; font-size: 13px; vertical-align: top; }
    tr:hover { background: #D1E2F2; }
    code { background: #F5F5F5; padding: 2px 5px; border-radius: 3px; }
</style>
</head>
<body>
<h1>🔍 Audit Account Fantasma — finestra ${daysWindow} giorni</h1>
<div class="summary">
    <div class="summary-card" style="border-color:#3CA434"><div class="num">${counters.OK}</div><div class="lbl">OK</div></div>
    <div class="summary-card" style="border-color:#FFCC00"><div class="num">${counters.SOSPETTO}</div><div class="lbl">Sospetti</div></div>
    <div class="summary-card" style="border-color:#D32F2F"><div class="num">${counters.ROTTO}</div><div class="lbl">Rotti</div></div>
    <div class="summary-card" style="border-color:#9B9B9B"><div class="num">${counters.NOT_CONFIGURED}</div><div class="lbl">Non configurati</div></div>
    <div class="summary-card"><div class="num">${results.length}</div><div class="lbl">Totale</div></div>
</div>
<table>
    <thead>
        <tr>
            <th>Comune</th>
            <th>Stato</th>
            <th>Notif (finestra/totali)</th>
            <th>Ultima push</th>
            <th>Da</th>
            <th>user_id</th>
            <th>Motivo</th>
        </tr>
    </thead>
    <tbody>${rows}</tbody>
</table>
<p style="margin-top:20px;color:#9B9B9B;font-size:12px">
    Legenda: <strong>OK</strong> = riceve notifiche • <strong>SOSPETTO</strong> = user_id probabilmente sbagliato • <strong>ROTTO</strong> = API GoodBarber risponde con errore • <strong>NOT_CONFIGURED</strong> = manca user_id o webzine_id su Firestore
</p>
</body>
</html>`;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------
module.exports = async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Usa GET.' });

    // Protezione token segreto
    const authToken = req.headers['authorization'] || req.query.secret;
    if (process.env.SYNC_SECRET && authToken !== `Bearer ${process.env.SYNC_SECRET}` && authToken !== process.env.SYNC_SECRET) {
        return res.status(401).json({ error: 'Non autorizzato' });
    }

    const daysWindow = Math.max(1, Math.min(parseInt(req.query.days) || 2, 30));
    const pages = Math.max(1, Math.min(parseInt(req.query.pages) || 2, 5));
    const format = (req.query.format || 'json').toLowerCase();

    try {
        // Leggi tutti i comuni con pushMonitorEnabled true
        const snap = await db.collection('app').where('pushMonitorEnabled', '==', true).get();
        if (snap.empty) {
            return res.status(200).json({ success: true, message: 'Nessun comune con pushMonitorEnabled=true.', results: [] });
        }

        // Esegui l'audit su tutti in sequenza (per non sovraccaricare l'API GB)
        const results = [];
        for (const doc of snap.docs) {
            try {
                const r = await auditSingleApp(doc, daysWindow, pages);
                results.push(r);
            } catch (e) {
                results.push({
                    appSlug: doc.data().appSlug || doc.id,
                    comune: doc.data().comune || '?',
                    status: 'ROTTO',
                    statusReason: `Eccezione durante l'audit: ${e.message}`,
                    totalNotifications: 0,
                    notificationsInWindow: 0,
                    lastPushAt: null,
                    daysSinceLastPush: null,
                    monitorPushUserId: doc.data().monitorPushUserId || null,
                    goodbarberWebzineId: doc.data().goodbarberWebzineId || null,
                    errors: [e.message]
                });
            }
        }

        // Ordina: prima i problemi (SOSPETTO, ROTTO), poi OK, poi NOT_CONFIGURED
        const priority = { SOSPETTO: 0, ROTTO: 1, NOT_CONFIGURED: 2, OK: 3, UNKNOWN: 4 };
        results.sort((a, b) => (priority[a.status] ?? 9) - (priority[b.status] ?? 9));

        // Contatori riepilogativi
        const summary = { OK: 0, SOSPETTO: 0, ROTTO: 0, NOT_CONFIGURED: 0, UNKNOWN: 0, total: results.length };
        results.forEach(r => { summary[r.status] = (summary[r.status] || 0) + 1; });

        if (format === 'html') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(200).send(renderHtml(results, daysWindow));
        }

        return res.status(200).json({
            success: true,
            daysWindow,
            pagesPerApp: pages,
            summary,
            hint: summary.SOSPETTO > 0
                ? `⚠️  ${summary.SOSPETTO} comuni sospetti: probabile user_id obsoleto. Verifica l'account fantasma sul device e aggiornalo nella pagina Configura del CRM.`
                : '✅ Nessun comune sospetto: tutti gli account fantasma stanno ricevendo notifiche.',
            results
        });
    } catch (error) {
        console.error('[diag-ghost-audit] Errore:', error);
        return res.status(500).json({ success: false, error: error.message, stack: error.stack });
    }
};

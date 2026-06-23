/**
 * Serverless Function — Refresh automatico statistiche GoodBarber (cron)
 *
 * Aggiorna in automatico, per ogni app ATTIVA con API GoodBarber configurate,
 * il campo `gbStatsCache` (download, lanci, lanci unici, page views, sessioni,
 * distribuzione OS) e appende uno snapshot a `gbStatsHistory` (per il trend).
 *
 * NON tocca `consensiPush`: quel dato non è esposto dall'API pubblica GoodBarber
 * e resta inserito manualmente (vedi pagina "Consensi Push" del CRM).
 *
 * Endpoint:
 *   GET /api/refresh-gb-stats              → aggiorna tutte le app configurate
 *   GET /api/refresh-gb-stats?appId=APP-1  → aggiorna solo quella app (test)
 *
 * Protezione: se è impostata la variabile d'ambiente CRON_SECRET, la richiesta
 * deve presentare header `Authorization: Bearer <CRON_SECRET>` (Vercel Cron lo
 * invia da solo quando CRON_SECRET è definita) oppure `?secret=<CRON_SECRET>`.
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
        console.error('[refresh-gb-stats] Errore init Firebase Admin:', e.message);
    }
}

const db = admin.firestore();

// ============================================================================
// Configurazione
// ============================================================================

const GB_BASE_URL = 'https://classic.goodbarber.dev/publicapi/v1/general/';
const FETCH_TIMEOUT_MS = 12000;       // timeout per singola chiamata API
const DELAY_BETWEEN_APPS_MS = 250;    // pausa tra un'app e l'altra (rate limiting)
const MAX_HISTORY = 24;               // snapshot massimi conservati per app

// ============================================================================
// Helper
// ============================================================================

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
}

function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return formatDate(d);
}

/**
 * Chiamata GET all'API GoodBarber con header token e timeout. Ritorna il JSON
 * o null in caso di errore (così una metrica fallita non rompe le altre).
 */
async function gbGet(endpoint, token) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const resp = await fetch(GB_BASE_URL + endpoint, {
            method: 'GET',
            headers: { 'token': token, 'Content-Type': 'application/json' },
            signal: controller.signal
        });
        if (!resp.ok) {
            console.warn('[refresh-gb-stats] HTTP ' + resp.status + ' su ' + endpoint);
            return null;
        }
        return await resp.json();
    } catch (e) {
        console.warn('[refresh-gb-stats] fetch fallito su ' + endpoint + ': ' + (e && e.message));
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Recupera tutte le statistiche di un'app (ultimi 30 giorni + download totali).
 * Le chiamate vengono fatte in parallelo. Ritorna { rawData, derived } oppure
 * null se la chiamata principale (download) è fallita del tutto.
 */
async function fetchAppStats(webzineId, token) {
    const endDate = formatDate(new Date());
    const startDate = daysAgo(30);
    const qs = 'start_date=' + startDate + '&end_date=' + endDate + '&platform=all';

    const [downloads, launches, unique, pageViews, sessions, osDist] = await Promise.all([
        gbGet('stats/' + webzineId + '/downloads_global/?platform=all', token),
        gbGet('stats/' + webzineId + '/launches/?' + qs, token),
        gbGet('stats/' + webzineId + '/unique_launches/?' + qs, token),
        gbGet('stats/' + webzineId + '/page_views/?' + qs, token),
        gbGet('stats/' + webzineId + '/session_time/?start_date=' + startDate + '&end_date=' + endDate, token),
        gbGet('stats/' + webzineId + '/mobile_os_distribution_global/', token)
    ]);

    // Se TUTTE le chiamate sono fallite, segnala fallimento (non sovrascrivere).
    if (!downloads && !launches && !unique && !pageViews && !sessions && !osDist) {
        return null;
    }

    const totalDownloads = (downloads && downloads.total_global_downloads) || 0;
    const launchesMonth = (launches && launches.total_launches) || 0;
    const uniqueLaunchesMonth = (unique && unique.total_unique_launches) || 0;
    const pageViewsMonth = (pageViews && pageViews.total_page_views) || 0;
    const totalSessions = (sessions && sessions.total_sessions) || 0;
    const retentionRate = launchesMonth > 0 ? Math.round((uniqueLaunchesMonth / launchesMonth) * 100) : 0;

    return {
        derived: { totalDownloads, launchesMonth, uniqueLaunchesMonth, pageViewsMonth, totalSessions, retentionRate },
        // Stessa forma prodotta da GoodBarberService.getAllStats (il frontend
        // legge rawData.mobile_os_distribution per la Report Card).
        rawData: {
            downloads_global: downloads,
            launches: launches,
            unique_launches: unique,
            page_views: pageViews,
            session_times: sessions,
            mobile_os_distribution: osDist
        }
    };
}

/**
 * Appende uno snapshot allo storico (1 per giorno, cap MAX_HISTORY).
 * `push` riprende il consensiPush manuale esistente (non lo modifichiamo).
 */
function appendHistory(existing, totalDownloads, pageViewsMonth, consensiPush) {
    const today = formatDate(new Date());
    const voce = { d: today, dl: totalDownloads || 0, pv: pageViewsMonth || 0, push: consensiPush || 0 };
    let history = Array.isArray(existing) ? existing.slice() : [];
    if (history.length && history[history.length - 1].d === today) {
        history[history.length - 1] = voce;
    } else {
        history.push(voce);
    }
    if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
    return history;
}

/**
 * Recupera le app ATTIVE con API GoodBarber configurate.
 */
async function getConfiguredApps(filterAppId) {
    const snapshot = await db.collection('app').where('statoApp', '==', 'ATTIVA').get();
    const apps = [];
    snapshot.forEach(doc => {
        if (filterAppId && doc.id !== filterAppId) return;
        const data = doc.data();
        if (data.goodbarberWebzineId && data.goodbarberToken) {
            apps.push({
                id: doc.id,
                comune: data.comune || data.nome || doc.id,
                webzineId: data.goodbarberWebzineId,
                token: data.goodbarberToken,
                consensiPush: data.consensiPush || 0,
                history: data.gbStatsHistory || []
            });
        }
    });
    return apps;
}

// ============================================================================
// Handler
// ============================================================================

module.exports = async function handler(req, res) {
    // CORS minimale (l'endpoint è server-to-server, ma utile per test manuali)
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Protezione: se CRON_SECRET è impostata, richiedila.
    const secret = process.env.CRON_SECRET;
    if (secret) {
        const auth = req.headers.authorization || '';
        const qSecret = (req.query && req.query.secret) || '';
        const ok = auth === 'Bearer ' + secret || qSecret === secret;
        if (!ok) {
            return res.status(401).json({ ok: false, error: 'Non autorizzato' });
        }
    }

    const filterAppId = (req.query && req.query.appId) ? String(req.query.appId) : null;
    const started = Date.now();

    try {
        const apps = await getConfiguredApps(filterAppId);
        if (apps.length === 0) {
            return res.status(200).json({ ok: true, updated: 0, failed: 0, message: 'Nessuna app configurata' });
        }

        let updated = 0;
        let failed = 0;
        const errors = [];

        for (let i = 0; i < apps.length; i++) {
            const app = apps[i];
            try {
                const stats = await fetchAppStats(app.webzineId, app.token);
                if (!stats) {
                    failed++;
                    errors.push(app.comune + ': nessuna statistica recuperata');
                } else {
                    const gbStatsCache = {
                        lastUpdate: new Date().toISOString(),
                        totalDownloads: stats.derived.totalDownloads,
                        launchesMonth: stats.derived.launchesMonth,
                        uniqueLaunchesMonth: stats.derived.uniqueLaunchesMonth,
                        pageViewsMonth: stats.derived.pageViewsMonth,
                        totalSessions: stats.derived.totalSessions,
                        retentionRate: stats.derived.retentionRate,
                        rawData: stats.rawData,
                        source: 'cron'
                    };
                    const gbStatsHistory = appendHistory(
                        app.history,
                        stats.derived.totalDownloads,
                        stats.derived.pageViewsMonth,
                        app.consensiPush
                    );
                    await db.collection('app').doc(app.id).update({ gbStatsCache, gbStatsHistory });
                    updated++;
                }
            } catch (e) {
                failed++;
                errors.push(app.comune + ': ' + (e && e.message));
                console.error('[refresh-gb-stats] Errore su ' + app.comune + ':', e && e.message);
            }

            // Pausa anti rate-limit tra un'app e l'altra
            if (i < apps.length - 1) {
                await new Promise(r => setTimeout(r, DELAY_BETWEEN_APPS_MS));
            }
        }

        const elapsed = ((Date.now() - started) / 1000).toFixed(1);
        console.log(`[refresh-gb-stats] Aggiornate ${updated}, fallite ${failed} su ${apps.length} app in ${elapsed}s`);
        return res.status(200).json({
            ok: true,
            total: apps.length,
            updated,
            failed,
            elapsedSeconds: Number(elapsed),
            errors: errors.slice(0, 20)
        });
    } catch (error) {
        console.error('[refresh-gb-stats] Errore generale:', error && error.message);
        return res.status(500).json({ ok: false, error: 'Errore interno', detail: error && error.message });
    }
};

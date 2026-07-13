/**
 * Serverless Function — Health Alert Giornaliero
 *
 * Analizza le app con push monitoring attivo e, se rileva app che non
 * ricevono più notifiche, scrive nella collezione `notifications` del CRM
 * (che alimenta la campanella in alto) una notifica per ciascun utente
 * con permesso di gestione app (SUPER_ADMIN, ADMIN, CTO, CONTENT_MANAGER).
 *
 * Classificazione stato app:
 *   - OK     → ultima notifica < 3 giorni fa
 *   - WARN   → ultima notifica tra 3 e 7 giorni fa
 *   - ERROR  → ultima notifica > 7 giorni fa (o mai ricevuta)
 *
 * Output:
 *   - Una notifica per utente in collezione `notifications` (solo se hasIssues)
 *   - Documento `health_status/latest` su Firestore (sempre, per banner dashboard)
 *
 * Dedup giornaliero:
 *   Le notifiche usano ID deterministico `health_YYYY-MM-DD_userId`, quindi
 *   eventuali riesecuzioni dello stesso giorno aggiornano invece di duplicare.
 *
 * Endpoint:
 *   GET /api/daily-health-alert          → Esecuzione standard
 *   GET /api/daily-health-alert?force=1  → Scrive notifica anche se tutto OK
 *
 * Cron (vercel.json): "0 7 * * *" = 07:00 UTC
 *   → 09:00 Europa/Roma (estate CEST) / 08:00 (inverno CET)
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
        console.error('[daily-health-alert] Errore inizializzazione Firebase Admin:', e.message);
    }
}

const db = admin.firestore();

// ============================================================================
// Configurazione
// ============================================================================
const WARN_DAYS = 3;
const ERROR_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Ruoli utente che devono ricevere la notifica in campanella
const RUOLI_DESTINATARI = ['SUPER_ADMIN', 'ADMIN', 'CTO', 'CONTENT_MANAGER'];

// ============================================================================
// Salute della SINCRONIZZAZIONE di un'app (0 letture extra: solo campi del doc).
//
// Perché serve: daysSince è calcolato SOLO da push_history, che si popola solo
// se il cron sync-push-history riesce a parlare con GoodBarber. Se il sync è
// rotto/fermo/incompleto, push_history si ferma e l'app sembra "non ricevere
// notifiche da N giorni" mentre il Comune le riceve davvero (falso positivo,
// caso Chiaramonte Gulfi). Qui rileviamo se il DATO è inaffidabile, così il
// report può dire la verità ("monitoraggio rotto") invece di accusare il Comune.
// Ritorna una stringa-motivo se il sync è inaffidabile, altrimenti null.
// ============================================================================
function syncBrokenReason(data, now) {
    const MS_PER_HOUR = 60 * 60 * 1000;

    // Credenziali incomplete → getMonitoredApps del sync scarta l'app: non
    // riceverà MAI dati, quindi push_history sarà sempre vuoto per costruzione.
    if (!data.goodbarberWebzineId || !data.monitorPushUserId) {
        return 'Configurazione monitoraggio incompleta (manca Webzine ID o User ID GoodBarber): la sincronizzazione non parte.';
    }

    const status = data.lastPushSyncStatus || null;
    if (status === 'error') {
        return 'Sincronizzazione in errore: ' + (data.lastPushSyncError || 'errore GoodBarber');
    }

    const lastSync = data.lastPushSync && typeof data.lastPushSync.toDate === 'function'
        ? data.lastPushSync.toDate()
        : (data.lastPushSync ? new Date(data.lastPushSync) : null);
    if (!lastSync) {
        return 'Mai sincronizzata: nessun dato importato da GoodBarber.';
    }

    // Il cron gira ogni 15 min: oltre 6h senza sync riuscito il dato di
    // "giorni senza notifiche" non è affidabile.
    const ageH = (now - lastSync) / MS_PER_HOUR;
    if (ageH > 6) {
        const lbl = ageH >= 48 ? (Math.round(ageH / 24) + ' giorni') : (Math.round(ageH) + ' ore');
        return 'Sincronizzazione ferma da ' + lbl + ': il dato sulle notifiche non è aggiornato.';
    }

    return null; // sync sano → push_history è affidabile
}

// ============================================================================
// Raccolta dati — stato di ogni app monitorata
// ============================================================================
async function collectHealthStatus() {
    const now = new Date();

    // Scarica tutte le app con monitoraggio attivo
    const appsSnap = await db.collection('app')
        .where('pushMonitorEnabled', '==', true)
        .get();

    const report = {
        generatedAt: now.toISOString(),
        totalMonitored: 0,
        ok: [],
        warn: [],
        error: [],
        syncBroken: []   // sync rotto/fermo/incompleto: il dato notifiche è inaffidabile
    };

    for (const doc of appsSnap.docs) {
        const data = doc.data() || {};
        const slug = ((data.appSlug || '') + '').toLowerCase().trim();
        const comune = data.comune || data.nome || slug;
        if (!slug) continue;

        report.totalMonitored++;

        // Trova l'ultima notifica 'sent' per questa app (1 read)
        let lastNotifDate = null;
        let lookupError = null;
        try {
            const snap = await db.collection('push_history')
                .where('appSlug', '==', slug)
                .where('status', '==', 'sent')
                .orderBy('sentAt', 'desc')
                .limit(1)
                .get();
            if (!snap.empty) {
                const d = snap.docs[0].data() || {};
                lastNotifDate = d.sentAt && typeof d.sentAt.toDate === 'function'
                    ? d.sentAt.toDate()
                    : (d.sentAt ? new Date(d.sentAt) : null);
            }
        } catch (e) {
            lookupError = e.message || String(e);
            // Fallback senza orderBy (se manca indice)
            try {
                const snap = await db.collection('push_history')
                    .where('appSlug', '==', slug)
                    .where('status', '==', 'sent')
                    .limit(100)
                    .get();
                snap.forEach(docN => {
                    const d = docN.data() || {};
                    const dt = d.sentAt && typeof d.sentAt.toDate === 'function'
                        ? d.sentAt.toDate()
                        : (d.sentAt ? new Date(d.sentAt) : null);
                    if (dt && (!lastNotifDate || dt > lastNotifDate)) lastNotifDate = dt;
                });
            } catch (e2) {
                console.warn(`[health] lookup fallito per ${slug}:`, e2.message);
            }
        }

        const daysSince = lastNotifDate
            ? Math.floor((now - lastNotifDate) / MS_PER_DAY)
            : null;

        const entry = {
            slug,
            comune,
            lastNotif: lastNotifDate ? lastNotifDate.toISOString() : null,
            daysSince,
            lookupError
        };

        // Rileva se il DATO push_history è affidabile per questa app.
        const syncIssue = syncBrokenReason(data, now);

        if (daysSince !== null && daysSince < WARN_DAYS) {
            // Storico fresco: tutto a posto, a prescindere dallo stato del sync
            // (un singolo ciclo di sync fallito non è un problema se i dati sono recenti).
            report.ok.push(entry);
        } else if (syncIssue) {
            // Storico assente/vecchio MA la causa è il sync rotto/fermo/incompleto:
            // NON accusare il Comune di non inviare notifiche — il dato è inaffidabile.
            report.syncBroken.push({ ...entry, reason: syncIssue });
        } else if (daysSince === null) {
            // Sync sano ma nessuna notifica MAI ricevuta — se configurata da poco warn, altrimenti error
            const lastSync = data.lastPushSync && typeof data.lastPushSync.toDate === 'function'
                ? data.lastPushSync.toDate()
                : (data.lastPushSync ? new Date(data.lastPushSync) : null);
            const configuredRecently = lastSync && (now - lastSync) < (3 * MS_PER_DAY);
            if (configuredRecently) {
                report.warn.push({
                    ...entry,
                    reason: 'Configurata di recente, ancora nessuna notifica ricevuta.'
                });
            } else {
                report.error.push({
                    ...entry,
                    reason: 'Nessuna notifica mai ricevuta. Verifica account fantasma GoodBarber.'
                });
            }
        } else if (daysSince >= ERROR_DAYS) {
            // Sync sano e storico davvero fermo da >7gg → il Comune non invia notifiche
            report.error.push({
                ...entry,
                reason: `Nessuna notifica da ${daysSince} giorni.`
            });
        } else {
            // WARN_DAYS <= daysSince < ERROR_DAYS, sync sano
            report.warn.push({
                ...entry,
                reason: `Ultima notifica ${daysSince} giorni fa.`
            });
        }
    }

    return report;
}

// ============================================================================
// Costruzione testo della notifica in campanella
// ============================================================================
function buildNotificationContent(report) {
    const errCount = report.error.length;
    const warnCount = report.warn.length;
    const okCount = report.ok.length;
    const syncCount = (report.syncBroken || []).length;

    let title;
    let message;

    if (errCount === 0 && warnCount === 0 && syncCount === 0) {
        title = `Tutte le ${report.totalMonitored} app OK`;
        message = 'Nessuna anomalia rilevata nel monitoraggio notifiche push.';
    } else if (errCount > 0 && (warnCount > 0 || syncCount > 0)) {
        title = `${errCount} ${errCount === 1 ? 'app critica' : 'app critiche'} · ${warnCount + syncCount} da controllare`;
        message = buildDetail(report);
    } else if (errCount > 0) {
        title = `${errCount} ${errCount === 1 ? 'app critica' : 'app critiche'} non ricevono notifiche`;
        message = buildDetail(report);
    } else if (syncCount > 0) {
        title = `${syncCount} ${syncCount === 1 ? 'app con monitoraggio' : 'app con monitoraggio'} da controllare`;
        message = buildDetail(report);
    } else {
        title = `${warnCount} ${warnCount === 1 ? 'app' : 'app'} da monitorare`;
        message = buildDetail(report);
    }

    // Clip di sicurezza
    if (message.length > 600) message = message.substring(0, 590) + '…';

    return { title, message };
}

function buildDetail(report) {
    const parti = [];
    if (report.error.length > 0) {
        const nomi = report.error.slice(0, 5).map(e => e.comune).join(', ');
        const extra = report.error.length > 5 ? ` e altre ${report.error.length - 5}` : '';
        parti.push(`Critiche (>${ERROR_DAYS}gg): ${nomi}${extra}.`);
    }
    if (report.warn.length > 0) {
        const nomi = report.warn.slice(0, 5).map(w => w.comune).join(', ');
        const extra = report.warn.length > 5 ? ` e altre ${report.warn.length - 5}` : '';
        parti.push(`Da monitorare (>${WARN_DAYS}gg): ${nomi}${extra}.`);
    }
    if ((report.syncBroken || []).length > 0) {
        const nomi = report.syncBroken.slice(0, 5).map(s => s.comune).join(', ');
        const extra = report.syncBroken.length > 5 ? ` e altre ${report.syncBroken.length - 5}` : '';
        parti.push(`Monitoraggio da sistemare (sync): ${nomi}${extra}.`);
    }
    parti.push(`${report.ok.length} OK su ${report.totalMonitored}.`);
    return parti.join(' ');
}

// ============================================================================
// Trova utenti destinatari (admin, CTO, content manager)
// ============================================================================
async function getDestinatari() {
    const snap = await db.collection('utenti')
        .where('ruolo', 'in', RUOLI_DESTINATARI)
        .get();
    const ids = [];
    snap.forEach(d => {
        const data = d.data() || {};
        // Esclude utenti disattivati
        if (data.attivo === false) return;
        ids.push(d.id);
    });
    return ids;
}

// ============================================================================
// Scrive una notifica per ciascun utente nella collezione `notifications`
// Usa ID deterministico per evitare duplicati in caso di rerun dello stesso giorno
// ============================================================================
async function writeNotifications(report, userIds) {
    if (!userIds || userIds.length === 0) {
        return { written: 0, reason: 'Nessun utente destinatario trovato.' };
    }
    const { title, message } = buildNotificationContent(report);
    const hasIssues = report.error.length > 0 || report.warn.length > 0 || (report.syncBroken || []).length > 0;

    // ID basato sulla data italiana (YYYY-MM-DD) così 1 alert/giorno per utente
    const todayKey = new Date().toISOString().slice(0, 10);

    // Firestore: massimo 500 operazioni per batch
    const CHUNK = 400;
    let written = 0;

    for (let i = 0; i < userIds.length; i += CHUNK) {
        const slice = userIds.slice(i, i + CHUNK);
        const batch = db.batch();

        slice.forEach(userId => {
            const docId = `health_${todayKey}_${userId}`;
            const ref = db.collection('notifications').doc(docId);
            batch.set(ref, {
                userId,
                type: 'health_alert',
                title,
                message,
                severity: report.error.length > 0 ? 'error' : ((report.warn.length > 0 || (report.syncBroken || []).length > 0) ? 'warn' : 'ok'),
                hasIssues,
                counts: {
                    total: report.totalMonitored,
                    ok: report.ok.length,
                    warn: report.warn.length,
                    error: report.error.length,
                    syncBroken: (report.syncBroken || []).length
                },
                linkTo: { page: 'storico-push' },
                taskId: null,
                appId: null,
                read: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        });

        await batch.commit();
        written += slice.length;
    }
    return { written };
}

// ============================================================================
// Salvataggio stato in Firestore (per il banner CRM dashboard)
// ============================================================================
async function persistHealthStatus(report, notifyRes) {
    try {
        const hasIssues = report.error.length > 0 || report.warn.length > 0 || (report.syncBroken || []).length > 0;

        // Rinomino i campi per essere compatibile con ciò che legge dashboard.js:
        //   - errorApps / warnApps (array di app con campi appName, appSlug, daysSinceLast, reason)
        //   - updatedAt (timestamp)
        const mapApp = a => ({
            appSlug: a.slug,
            appName: a.comune,
            daysSinceLast: a.daysSince,
            lastNotif: a.lastNotif || null,
            reason: a.reason || ''
        });

        await db.collection('health_status').doc('latest').set({
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            totalMonitored: report.totalMonitored,
            okCount: report.ok.length,
            warnCount: report.warn.length,
            errorCount: report.error.length,
            syncBrokenCount: (report.syncBroken || []).length,
            hasIssues,
            warnApps: report.warn.map(mapApp),
            errorApps: report.error.map(mapApp),
            // App il cui MONITORAGGIO è rotto: la dashboard le mostra con un
            // messaggio diverso ("sync in errore", non "il Comune non invia").
            syncBrokenApps: (report.syncBroken || []).map(mapApp),
            notifyResult: notifyRes || null
        }, { merge: false });
    } catch (e) {
        console.warn('[health] persist failed:', e.message);
    }
}

// ============================================================================
// Handler Vercel
// ============================================================================
module.exports = async function handler(req, res) {
    // FIX M27 (v10.1.8): protezione come gli altri cron. Se CRON_SECRET (o SYNC_SECRET) è impostata,
    // la richiesta deve presentarla (Vercel Cron la invia da solo) oppure essere riconosciuta come
    // cron Vercel. Senza secret il comportamento resta invariato (nessuna rottura del cron).
    const _cronSecret = process.env.CRON_SECRET || process.env.SYNC_SECRET;
    if (_cronSecret) {
        const _auth = req.headers.authorization || '';
        const _q = (req.query && req.query.secret) || '';
        const _ua = (req.headers['user-agent'] || '').toLowerCase();
        const _isCron = _ua.includes('vercel-cron') || req.headers['x-vercel-cron'];
        const _ok = _isCron || _auth === 'Bearer ' + _cronSecret || _q === _cronSecret;
        if (!_ok) {
            return res.status(401).json({ ok: false, error: 'Non autorizzato' });
        }
    }

    const force = req.query && (req.query.force === '1' || req.query.force === 'true');

    try {
        const report = await collectHealthStatus();
        const hasIssues = report.error.length > 0 || report.warn.length > 0 || (report.syncBroken || []).length > 0;

        let notifyRes = { written: 0, reason: 'skipped: no issues' };

        // Scrive la notifica in campanella solo se c'è qualcosa da dire,
        // oppure sempre se ?force=1
        if (hasIssues || force) {
            try {
                const userIds = await getDestinatari();
                notifyRes = await writeNotifications(report, userIds);
            } catch (e) {
                notifyRes = { written: 0, error: e.message || String(e) };
                console.error('[health] notifiche fallite:', e);
            }
        }

        await persistHealthStatus(report, notifyRes);

        return res.status(200).json({
            ok: true,
            forced: force,
            hasIssues,
            summary: {
                totalMonitored: report.totalMonitored,
                ok: report.ok.length,
                warn: report.warn.length,
                error: report.error.length,
                syncBroken: (report.syncBroken || []).length
            },
            notifications: notifyRes
        });
    } catch (e) {
        console.error('[daily-health-alert] Errore generale:', e);
        return res.status(500).json({
            ok: false,
            error: e.message || String(e)
        });
    }
};

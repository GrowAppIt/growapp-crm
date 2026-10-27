/**
 * Push Monitor Health — UNICA regola di "salute" del monitoraggio notifiche
 *
 * Prima esistevano TRE versioni diverse della stessa regola (pagina Storico
 * Push, banner Dashboard, cron daily-health-alert) e davano risposte diverse
 * sulla stessa app. Esempio reale (26-27/10/2026): Serravalle Pistoiese,
 * Ravanusa e Scigliano restavano "da sistemare" in dashboard per un giorno
 * intero anche dopo essere state sistemate, perché il banner si fidava della
 * fotografia delle 07:00 senza ricontrollare lo stato attuale.
 *
 * Questo file è condiviso:
 *   - browser: window.PushMonitorHealth (index.html lo carica prima delle pagine)
 *   - server:  require('../public/js/push-monitor-health.js') nelle function api/
 *
 * Usa SOLO i campi già presenti sul documento 'app' (0 letture extra).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.PushMonitorHealth = factory();
})(typeof self !== 'undefined' ? self : this, function () {

    const HOUR = 3600 * 1000;

    // Il cron sincronizza ogni 15 min: oltre 6 ore senza sync c'è un problema vero.
    const STALE_ERROR_HOURS = 6;
    const STALE_WARN_HOURS = 1;
    // Un errore GoodBarber isolato (timeout, 502 di un attimo) si risolve da solo
    // al giro dopo: diventa "critico" solo dopo 3 sync falliti di fila (~45 min).
    const ERROR_STREAK_CRITICAL = 3;

    // Firestore Timestamp (client o admin), Date, stringa ISO, {seconds}
    function toMs(v) {
        if (!v) return null;
        if (typeof v.toDate === 'function') return v.toDate().getTime();
        if (v instanceof Date) return v.getTime();
        if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000;
        const t = new Date(v).getTime();
        return isNaN(t) ? null : t;
    }

    function ageLabel(ageH) {
        return ageH >= 48 ? (Math.round(ageH / 24) + ' giorni') : (Math.round(ageH) + ' ore');
    }

    /**
     * Stato della SINCRONIZZAZIONE di un'app monitorata.
     * Ritorna { level, code, label, hint }:
     *   level 'ok' | 'warn' → il dato dello storico è affidabile
     *   level 'error' | 'never' → il monitoraggio va sistemato (dato inaffidabile)
     */
    function syncHealth(app, nowMs) {
        app = app || {};
        const now = typeof nowMs === 'number' ? nowMs : Date.now();

        if (!app.appSlug) {
            return { level: 'error', code: 'slug', label: 'Slug mancante',
                hint: "Manca l'App Slug: l'archivio non è raggiungibile e la sincronizzazione non parte." };
        }
        if (!app.goodbarberWebzineId || !app.monitorPushUserId) {
            const manca = [];
            if (!app.goodbarberWebzineId) manca.push('Webzine ID (scheda app)');
            if (!app.monitorPushUserId) manca.push('User ID fantasma (Configura)');
            return { level: 'error', code: 'incompleta', label: 'Configurazione incompleta',
                hint: 'Manca ' + manca.join(' e ') + ': la sincronizzazione non parte.' };
        }

        const lastSync = toMs(app.lastPushSync);
        const status = app.lastPushSyncStatus || null;

        if (status === 'error') {
            // Documenti sincronizzati prima di questo campo: trattati come prima (critici)
            const streak = typeof app.lastPushSyncErrorStreak === 'number'
                ? app.lastPushSyncErrorStreak : ERROR_STREAK_CRITICAL;
            const msg = app.lastPushSyncError || 'La sincronizzazione ha restituito un errore.';
            if (streak >= ERROR_STREAK_CRITICAL) {
                return { level: 'error', code: 'errore', label: 'Errore sync',
                    hint: msg + ' (' + streak + ' tentativi falliti di fila)' };
            }
            return { level: 'warn', code: 'errore_temporaneo', label: 'Errore temporaneo',
                hint: msg + ' — di solito si risolve da solo al giro successivo.' };
        }
        if (!lastSync) {
            return { level: 'never', code: 'mai', label: 'Mai sincronizzata',
                hint: 'Nessuna sincronizzazione ancora eseguita. Premi Sincronizza o attendi il prossimo ciclo (ogni 15 min).' };
        }

        const ageH = (now - lastSync) / HOUR;
        if (ageH > STALE_ERROR_HOURS) {
            return { level: 'error', code: 'ferma', label: 'Ferma da ' + ageLabel(ageH),
                hint: 'Il cron sincronizza ogni 15 min: oltre ' + STALE_ERROR_HOURS + 'h senza sync indica un problema (GoodBarber, credenziali, app sospesa).' };
        }
        if (status === 'warning') {
            return { level: 'warn', code: 'avviso', label: 'Avviso sync',
                hint: app.lastPushSyncWarning || 'La sincronizzazione ha restituito un avviso.' };
        }
        if (ageH > STALE_WARN_HOURS) {
            return { level: 'warn', code: 'lenta', label: 'Sync ' + Math.round(ageH) + 'h fa',
                hint: 'Sincronizzazione più vecchia del previsto (atteso ~15 min).' };
        }
        return { level: 'ok', code: 'ok', label: 'Attiva', hint: 'Sincronizzazione recente e senza errori.' };
    }

    // true se il monitoraggio è rotto e il dato "giorni senza notifiche" non è affidabile
    function isSyncBroken(health) {
        return !!health && (health.level === 'error' || health.level === 'never');
    }

    return { syncHealth, isSyncBroken, toMs, STALE_ERROR_HOURS, ERROR_STREAK_CRITICAL };
});

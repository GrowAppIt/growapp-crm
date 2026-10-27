/**
 * Autorizzazione degli endpoint del monitoraggio notifiche
 * (sync-push-history, diag-ghost-audit).
 *
 * Audit 27/10/2026 — prima:
 *   - bastava mandare l'intestazione User-Agent "vercel-cron" per essere
 *     trattati come il cron, anche con ?full=true (100 pagine × 109 app);
 *   - qualunque utente Firebase valido passava, AGENTI compresi;
 *   - senza SYNC_SECRET l'endpoint era aperto a tutti.
 *
 * Ora (in ordine):
 *   1. CRON_SECRET (Vercel la manda da solo come "Authorization: Bearer ...")
 *      o SYNC_SECRET (header o ?secret=) → accesso completo.
 *   2. Firebase ID token di un utente ATTIVO con ruolo di staff → accesso completo.
 *      Agenti, utenti disattivati o senza profilo → 403.
 *   3. Solo User-Agent "vercel-cron" (se CRON_SECRET non è impostata) →
 *      accesso "cron": può lanciare SOLO il giro normale, senza parametri.
 *   Nient'altro passa: niente più "aperto se manca il secret".
 */

// Gli stessi ruoli che possono aprire la pagina Storico Push nel CRM
// (permesso view_all_data o manage_apps in public/js/auth.js). NON l'AGENTE.
const RUOLI_STAFF = ['SUPER_ADMIN', 'ADMIN', 'CTO', 'SVILUPPATORE', 'CONTENT_MANAGER', 'CONTABILE'];

async function verificaAccesso(req, admin) {
    const authHeader = req.headers['authorization'] || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
    const querySecret = (req.query && req.query.secret) || '';

    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && bearer === cronSecret) return { ok: true, livello: 'completo', source: 'cron-secret' };

    const syncSecret = process.env.SYNC_SECRET;
    if (syncSecret && (bearer === syncSecret || authHeader === syncSecret || querySecret === syncSecret)) {
        return { ok: true, livello: 'completo', source: 'sync-secret' };
    }

    if (bearer) {
        let decoded = null;
        try {
            decoded = await admin.auth().verifyIdToken(bearer);
        } catch (e) {
            decoded = null; // non è un ID token Firebase valido
        }
        if (decoded) {
            let profilo = null;
            try {
                const snap = await admin.firestore().collection('utenti').doc(decoded.uid).get();
                profilo = snap.exists ? (snap.data() || {}) : null;
            } catch (e) {
                console.error('[staff-auth] Lettura profilo fallita:', e.message);
            }
            if (profilo && profilo.stato !== 'DISATTIVO' && RUOLI_STAFF.includes(profilo.ruolo)) {
                return { ok: true, livello: 'completo', source: 'firebase', uid: decoded.uid, ruolo: profilo.ruolo };
            }
            return { ok: false, status: 403, error: 'Il tuo profilo non può gestire il monitoraggio notifiche.' };
        }
    }

    // Il cron di Vercel senza CRON_SECRET non firma la richiesta: lo riconosciamo
    // dall'User-Agent, che però chiunque può imitare. Per questo gli concediamo
    // solo il giro standard (lo stesso che il cron fa comunque ogni 15 minuti).
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    if (!cronSecret && ua.startsWith('vercel-cron')) {
        return { ok: true, livello: 'cron', source: 'vercel-cron-ua' };
    }

    return { ok: false, status: 401, error: 'Non autorizzato' };
}

module.exports = { verificaAccesso, RUOLI_STAFF };

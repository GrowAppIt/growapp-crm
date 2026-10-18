/**
 * Report pubblico per Comune — costruzione dei dati.
 *
 * Ogni app può avere un link pubblico segreto (campo `reportPubblicoToken` sul
 * documento `app/{id}`) che apre la pagina /report/?r=<token>. I dati mostrati
 * stanno in `report_pubblici/{token}` e contengono SOLO numeri aggregati e il
 * nome del Comune: mai token API, webzine ID o indirizzi del CMS.
 *
 * Chiamate al CMS per ogni report (4):
 *   - downloads_global              → download totali dalla pubblicazione
 *   - mobile_os_distribution_global → iOS / Android
 *   - page_views   (24 mesi)        → visualizzazioni per giorno
 *   - session_time (24 mesi)        → sessioni per giorno e fasce di durata
 * I 24 mesi servono per confrontare gli ultimi 12 mesi con i 12 precedenti.
 *
 * Usato da api/report-pubblico.js (gestione link + lettura pubblica) e da
 * api/refresh-report-pubblici.js (aggiornamento notturno).
 */

const crypto = require('crypto');

const GB_BASE_URL = 'https://classic.goodbarber.dev/publicapi/v1/general/';
const FETCH_TIMEOUT_MS = 25000; // le richieste su 24 mesi sono più lente di quelle a 30 giorni

const COLLEZIONE = 'report_pubblici';
const TOKEN_REGEX = /^[A-Za-z0-9_-]{20,64}$/;

function generaToken() {
    return crypto.randomBytes(18).toString('base64url'); // 24 caratteri
}

function tokenValido(token) {
    return typeof token === 'string' && TOKEN_REGEX.test(token);
}

function formatDate(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
}

// Le date del CRM possono essere stringhe ISO o Timestamp Firestore.
function dataIso(v) {
    if (!v) return null;
    const d = typeof v.toDate === 'function' ? v.toDate() : new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
}

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
            console.warn('[report-pubblico] HTTP ' + resp.status + ' su ' + endpoint.split('?')[0]);
            return null;
        }
        return await resp.json();
    } catch (e) {
        console.warn('[report-pubblico] fetch fallito su ' + endpoint.split('?')[0] + ': ' + (e && e.message));
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * I 24 mesi interi che precedono il mese in corso, dal più vecchio al più
 * recente, come 'YYYY-MM'. Il mese in corso è escluso perché parziale.
 */
function ultimi24Mesi(oggi) {
    const mesi = [];
    for (let i = 24; i >= 1; i--) {
        const d = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth() - i, 1));
        mesi.push(d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'));
    }
    return mesi;
}

/**
 * Durata in secondi rappresentativa di una fascia del CMS, es. "10 to 30 seconds"
 * → 20, "3 to 10 minutes" → 390, "more than 30 minutes" → 2700. null se la
 * fascia non è riconoscibile.
 */
function secondiFascia(etichetta) {
    const testo = String(etichetta || '').toLowerCase();
    const numeri = (testo.match(/\d+(\.\d+)?/g) || []).map(Number);
    if (numeri.length === 0) return null;
    const molt = /min/.test(testo) ? 60 : /hour|ora/.test(testo) ? 3600 : 1;
    if (numeri.length >= 2) return (numeri[0] + numeri[1]) / 2 * molt;
    return numeri[0] * 1.5 * molt; // fascia aperta ("more than 30 minutes")
}

/**
 * Somma per mese le serie giornaliere. Ritorna una mappa
 * 'YYYY-MM' → { pv, sess, secondi, sessConDurata }.
 */
function aggregaPerMese(pageViews, sessionTime) {
    const perMese = {};
    const voce = m => (perMese[m] = perMese[m] || { pv: 0, sess: 0, secondi: 0, sessConDurata: 0 });

    ((pageViews && pageViews.history) || []).forEach(h => {
        if (!h || !h.date) return;
        voce(String(h.date).slice(0, 7)).pv += Number(h.page_views) || 0;
    });
    ((sessionTime && sessionTime.history) || []).forEach(h => {
        if (!h || !h.date) return;
        const v = voce(String(h.date).slice(0, 7));
        const n = Number(h.sessions) || 0;
        v.sess += n;
        const sec = secondiFascia(h.session_time);
        if (sec !== null) {
            v.secondi += sec * n;
            v.sessConDurata += n;
        }
    });
    return perMese;
}

/**
 * Costruisce i dati del report per un'app. `app` è il documento Firestore
 * dell'app (servono goodbarberWebzineId e goodbarberToken). Ritorna null se
 * il CMS non ha risposto a nessuna chiamata.
 */
async function costruisciReport(app, oggi) {
    oggi = oggi || new Date();
    const wid = app.goodbarberWebzineId;
    const tk = app.goodbarberToken;
    const mesi24 = ultimi24Mesi(oggi);
    const inizio = mesi24[0] + '-01';
    const fine = formatDate(new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), 0))); // ultimo giorno del mese scorso

    const [downloads, osDist, pageViews, sessionTime] = await Promise.all([
        gbGet('stats/' + wid + '/downloads_global/?platform=all', tk),
        gbGet('stats/' + wid + '/mobile_os_distribution_global/', tk),
        gbGet('stats/' + wid + '/page_views/?start_date=' + inizio + '&end_date=' + fine + '&platform=all', tk),
        gbGet('stats/' + wid + '/session_time/?start_date=' + inizio + '&end_date=' + fine, tk)
    ]);
    if (!downloads && !osDist && !pageViews && !sessionTime) return null;

    const perMese = aggregaPerMese(pageViews, sessionTime);
    const riga = m => perMese[m] || { pv: 0, sess: 0, secondi: 0, sessConDurata: 0 };
    const precedenti12 = mesi24.slice(0, 12).map(riga);
    let correnti = mesi24.slice(12).map(m => Object.assign({ m }, riga(m)));

    // App pubblicata da meno di un anno: i mesi iniziali vuoti non si mostrano.
    while (correnti.length > 1 && correnti[0].pv === 0 && correnti[0].sess === 0) correnti.shift();

    const somma = (righe, k) => righe.reduce((t, r) => t + r[k], 0);
    const durata = righe => {
        const n = somma(righe, 'sessConDurata');
        return n > 0 ? Math.round(somma(righe, 'secondi') / n) : null;
    };
    // Il confronto ha senso solo se l'anno precedente è completo.
    const annoPrecCompleto = correnti.length === 12 && precedenti12.every(r => r.pv > 0 || r.sess > 0);

    const os = osDist && osDist.mobile_os_distribution ? osDist.mobile_os_distribution : (osDist || {});
    const ios = Number(os.ios_devices_count) || 0;
    const android = Number(os.android_devices_count) || 0;

    return {
        comune: app.comune || app.nome || '',
        iconaUrl: app.iconaUrl || null,
        popolazione: Number(app.popolazione) || null,
        aggiornatoIl: new Date().toISOString(),
        downloadTotali: (downloads && Number(downloads.total_global_downloads)) || 0,
        os: (ios + android) > 0 ? { ios, android } : null,
        iscrittiNotifiche: Number(app.consensiPush) || null,
        iscrittiNotificheAggiornatoIl: dataIso(app.lastPushUpdate || app.pushAggiornatoIl),
        durataMediaSec: durata(correnti),
        durataMediaSecPrec: annoPrecCompleto ? durata(precedenti12) : null,
        mesi: correnti.map(r => ({ m: r.m, pv: r.pv, sess: r.sess })),
        precedenti: annoPrecCompleto ? { pv: somma(precedenti12, 'pv'), sess: somma(precedenti12, 'sess') } : null
    };
}

/**
 * Ricostruisce e salva il report di un'app sotto il suo token.
 * Ritorna true se salvato, false se il CMS non ha risposto.
 */
async function salvaReport(db, appId, app, token) {
    const report = await costruisciReport(app);
    if (!report) return false;
    await db.collection(COLLEZIONE).doc(token).set({ appId, report });
    return true;
}

module.exports = {
    COLLEZIONE,
    generaToken,
    tokenValido,
    costruisciReport,
    salvaReport,
    // esportate per i test
    secondiFascia,
    aggregaPerMese,
    ultimi24Mesi
};

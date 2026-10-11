/**
 * Lasciapassare MCP GoodBarber — gestione condivisa e sicura.
 *
 * Il server MCP GoodBarber è OAuth e ha due caratteristiche che obbligano a stare attenti:
 *  1. ROTAZIONE: a ogni rinnovo restituisce un refresh_token NUOVO e quello vecchio smette di valere.
 *     Se due richieste sulla stessa app rinnovano insieme, la seconda usa un token già bruciato
 *     e il collegamento si perde.
 *  2. SCADENZA: il refresh_token scade dopo ~30 giorni (refresh_expires_in ≈ 2.592.000 s).
 *     Un'app non usata per un mese perde il collegamento → serve il rinnovo periodico (api/mcp-keepalive.js).
 *
 * DOVE STANNO I SEGRETI (v10.7.1): nella collezione protetta `app_mcp_segreti/{appId}`
 * (mcpClientId, mcpRefreshToken, lucchetto). Le regole Firestore del CRM bloccano dal browser
 * qualunque collezione non in elenco, quindi la leggono solo il server (Admin SDK) e gli script
 * di Giancarlo. Nel doc `app/{id}` restano solo dati non segreti: mcpServerUrl, mcpCollegato,
 * mcpCollegatoIl, mcpStato ('ok' | 'errore'), mcpUltimoRinnovo, mcpUltimoErrore.
 *
 * MIGRAZIONE AUTOMATICA: se un'app ha ancora i segreti nel doc `app` (formato vecchio), al primo
 * rinnovo vengono spostati in `app_mcp_segreti` e cancellati dal doc `app`, nella stessa transazione.
 *
 * Il rinnovo avviene per UNA app alla volta grazie a un lucchetto (lockFino, in ms) gestito con
 * transazioni, e il token nuovo è salvato prima di restituire l'access_token. I token non vengono mai loggati.
 */

const COLL_SEGRETI = 'app_mcp_segreti';
const CAMPI_VECCHI = ['mcpClientId', 'mcpRefreshToken', 'mcpApiKey', 'mcpRinnovoLockFino', 'mcpRinnovoLockDi'];

const LOCK_MS = 20000;      // durata massima del lucchetto (poi scade da solo)
const ATTESA_MS = 600;      // pausa tra un tentativo e l'altro se l'app è occupata
const MAX_ATTESA_MS = 15000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function authBaseFromMcpUrl(mcpUrl) {
  return mcpUrl.replace(/\/mcp\/sse\/?$/, '').replace(/\/sse\/?$/, '');
}

// Dati dell'app senza i campi segreti del formato vecchio (quelli che finiscono nelle risposte e nei prompt)
function senzaSegreti(d) {
  const out = Object.assign({}, d || {});
  for (const k of CAMPI_VECCHI) delete out[k];
  return out;
}

async function chiamaRinnovo({ mcpUrl, clientId, refreshToken }) {
  const r = await fetch(authBaseFromMcpUrl(mcpUrl) + '/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, resource: mcpUrl
    }).toString()
  });
  const text = await r.text().catch(() => '');
  if (!r.ok) {
    const e = new Error(`Refresh token rifiutato dal server MCP (HTTP ${r.status}). ${text.slice(0, 200)}`);
    e.code = 'MCP_AUTH';
    e.status = r.status;
    throw e;
  }
  let j; try { j = JSON.parse(text); } catch (_) { j = {}; }
  if (!j.access_token) {
    const e = new Error('Risposta OAuth senza access_token.');
    e.code = 'MCP_AUTH';
    throw e;
  }
  return {
    accessToken: j.access_token,
    newRefreshToken: (j.refresh_token && j.refresh_token !== refreshToken) ? j.refresh_token : null,
    refreshExpiresIn: j.refresh_expires_in || null
  };
}

// Prende il lucchetto dell'app (aspetta se è occupata) e, se serve, sposta i segreti dal doc `app`.
// Ritorna { app, seg } letti DENTRO la transazione.
async function prendiLucchetto(db, appId, owner, admin) {
  const appRef = db.collection('app').doc(String(appId));
  const segRef = db.collection(COLL_SEGRETI).doc(String(appId));
  const del = admin.firestore.FieldValue.delete();
  const inizio = Date.now();
  for (;;) {
    const esito = await db.runTransaction(async tx => {
      const [appSnap, segSnap] = await Promise.all([tx.get(appRef), tx.get(segRef)]);
      if (!appSnap.exists) return { assente: true };
      const a = appSnap.data() || {};
      const ora = Date.now();
      const vecchio = !!a.mcpRefreshToken;
      let seg = segSnap.exists ? (segSnap.data() || {}) : null;

      // Formato vecchio ancora in uso (anche da istanze non aggiornate): rispettane il lucchetto
      if (vecchio && a.mcpRinnovoLockFino && a.mcpRinnovoLockFino > ora && a.mcpRinnovoLockDi !== owner) return { occupata: true };
      if (seg && seg.lockFino && seg.lockFino > ora && seg.lockDi !== owner) return { occupata: true };

      // Migrazione: un token ancora nel doc `app` è sempre il più recente (dopo lo spostamento lì non si
      // scrive più: se c'è, l'ha scritto un codice vecchio o un ricollegamento) → vince e si sposta
      if (vecchio) {
        seg = Object.assign({}, seg || {}, { mcpClientId: a.mcpClientId || (seg && seg.mcpClientId) || '', mcpRefreshToken: a.mcpRefreshToken,
          mcpServerUrl: a.mcpServerUrl || (seg && seg.mcpServerUrl) || '', migratoIl: new Date() });
        if (a.mcpApiKey) seg.mcpApiKeyVecchia = a.mcpApiKey;
      } else if (!seg || !seg.mcpRefreshToken) {
        return { nonConfigurata: true, app: a };
      }

      tx.set(segRef, Object.assign({}, seg, { lockFino: ora + LOCK_MS, lockDi: owner }), { merge: true });
      const pulizia = {};
      for (const k of CAMPI_VECCHI) if (k in a) pulizia[k] = del;
      if (Object.keys(pulizia).length || !a.mcpCollegato) {
        pulizia.mcpCollegato = true;
        if (!a.mcpServerUrl && seg.mcpServerUrl) pulizia.mcpServerUrl = seg.mcpServerUrl;
        tx.update(appRef, pulizia);
      }
      return { app: a, seg };
    });
    if (esito.assente) { const e = new Error('App non trovata.'); e.code = 'NOT_FOUND'; throw e; }
    if (esito.nonConfigurata) {
      const e = new Error('Collegamento MCP non configurato per questa app.');
      e.code = 'MCP_NOT_CONFIGURED';
      throw e;
    }
    if (esito.seg) return esito;
    if (Date.now() - inizio > MAX_ATTESA_MS) {
      const e = new Error('L\'app è occupata da un\'altra richiesta: riprova tra qualche secondo.');
      e.code = 'MCP_BUSY';
      throw e;
    }
    await sleep(ATTESA_MS);
  }
}

async function rilasciaLucchetto(db, appId, owner, extraSeg) {
  const segRef = db.collection(COLL_SEGRETI).doc(String(appId));
  await db.runTransaction(async tx => {
    const snap = await tx.get(segRef);
    if (!snap.exists) return;
    const d = snap.data() || {};
    const upd = Object.assign({}, extraSeg || {});
    if (d.lockDi === owner) { upd.lockFino = 0; upd.lockDi = ''; }
    if (Object.keys(upd).length) tx.update(segRef, upd);
  });
}

/**
 * Rinnova il lasciapassare di un'app in modo sicuro.
 * @returns {{ accessToken, mcpUrl, appName, app }}  (app = dati del documento, senza segreti)
 */
async function ottieniAccessToken(db, appId, admin) {
  const owner = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const { app, seg } = await prendiLucchetto(db, appId, owner, admin);
  const mcpUrl = (seg.mcpServerUrl || app.mcpServerUrl || '').trim();
  const clientId = (seg.mcpClientId || '').trim();
  const refreshToken = (seg.mcpRefreshToken || '').trim();
  const appRef = db.collection('app').doc(String(appId));
  const ts = admin.firestore.FieldValue.serverTimestamp();

  if (!mcpUrl || !clientId || !refreshToken) {
    await rilasciaLucchetto(db, appId, owner);
    const e = new Error('Collegamento MCP non configurato per questa app.');
    e.code = 'MCP_NOT_CONFIGURED';
    throw e;
  }

  try {
    const r = await chiamaRinnovo({ mcpUrl, clientId, refreshToken });
    // Il token nuovo va salvato PRIMA di usare l'access_token: se il salvataggio fallisce, il collegamento si perderebbe.
    await rilasciaLucchetto(db, appId, owner, r.newRefreshToken ? { mcpRefreshToken: r.newRefreshToken, aggiornatoIl: ts } : null);
    await appRef.update({ mcpUltimoRinnovo: ts, mcpStato: 'ok', mcpUltimoErrore: '' }).catch(() => {});
    return { accessToken: r.accessToken, mcpUrl, appName: app.nome || 'App', app: senzaSegreti(app) };
  } catch (err) {
    await rilasciaLucchetto(db, appId, owner).catch(() => {});
    await appRef.update({ mcpStato: 'errore', mcpUltimoErrore: String(err.message || err).slice(0, 300) }).catch(() => {});
    throw err;
  }
}

module.exports = { ottieniAccessToken, authBaseFromMcpUrl, COLL_SEGRETI };

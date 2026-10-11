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
 * Questo modulo rinnova il token di UNA app alla volta grazie a un "lucchetto" sul documento
 * `app/{id}` (campo mcpRinnovoLockFino, in ms) gestito con transazioni Firestore, e salva
 * sempre il token nuovo prima di restituire l'access_token.
 *
 * Campi scritti sul doc `app`: mcpRefreshToken (se ruotato), mcpRinnovoLockFino, mcpUltimoRinnovo,
 * mcpStato ('ok' | 'errore'), mcpUltimoErrore. I token non vengono mai loggati.
 */

const LOCK_MS = 20000;      // durata massima del lucchetto (poi scade da solo)
const ATTESA_MS = 600;      // pausa tra un tentativo e l'altro se l'app è occupata
const MAX_ATTESA_MS = 15000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function authBaseFromMcpUrl(mcpUrl) {
  return mcpUrl.replace(/\/mcp\/sse\/?$/, '').replace(/\/sse\/?$/, '');
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

// Prende il lucchetto dell'app (aspetta se è occupata). Ritorna i dati dell'app letti DENTRO la transazione.
async function prendiLucchetto(db, appId, owner) {
  const ref = db.collection('app').doc(String(appId));
  const inizio = Date.now();
  for (;;) {
    const esito = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { assente: true };
      const d = snap.data() || {};
      const ora = Date.now();
      if (d.mcpRinnovoLockFino && d.mcpRinnovoLockFino > ora && d.mcpRinnovoLockDi !== owner) return { occupata: true };
      tx.update(ref, { mcpRinnovoLockFino: ora + LOCK_MS, mcpRinnovoLockDi: owner });
      return { dati: d };
    });
    if (esito.assente) { const e = new Error('App non trovata.'); e.code = 'NOT_FOUND'; throw e; }
    if (esito.dati) return esito.dati;
    if (Date.now() - inizio > MAX_ATTESA_MS) {
      const e = new Error('L\'app è occupata da un\'altra richiesta: riprova tra qualche secondo.');
      e.code = 'MCP_BUSY';
      throw e;
    }
    await sleep(ATTESA_MS);
  }
}

async function rilasciaLucchetto(db, appId, owner, extra) {
  const ref = db.collection('app').doc(String(appId));
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const d = snap.data() || {};
    const upd = Object.assign({}, extra || {});
    if (d.mcpRinnovoLockDi === owner) { upd.mcpRinnovoLockFino = 0; upd.mcpRinnovoLockDi = ''; }
    if (Object.keys(upd).length) tx.update(ref, upd);
  });
}

/**
 * Rinnova il lasciapassare di un'app in modo sicuro.
 * @returns {{ accessToken, mcpUrl, appName, app }}  (app = dati del documento)
 */
async function ottieniAccessToken(db, appId, admin) {
  const owner = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const app = await prendiLucchetto(db, appId, owner);
  const mcpUrl = (app.mcpServerUrl || '').trim();
  const clientId = (app.mcpClientId || '').trim();
  const refreshToken = (app.mcpRefreshToken || '').trim();
  const ts = admin && admin.firestore && admin.firestore.FieldValue
    ? admin.firestore.FieldValue.serverTimestamp() : new Date();

  if (!mcpUrl || !clientId || !refreshToken) {
    await rilasciaLucchetto(db, appId, owner);
    const e = new Error('Collegamento MCP non configurato per questa app.');
    e.code = 'MCP_NOT_CONFIGURED';
    throw e;
  }

  try {
    const r = await chiamaRinnovo({ mcpUrl, clientId, refreshToken });
    const extra = { mcpUltimoRinnovo: ts, mcpStato: 'ok', mcpUltimoErrore: '' };
    if (r.newRefreshToken) extra.mcpRefreshToken = r.newRefreshToken;
    // Il token nuovo va salvato PRIMA di usare l'access_token: se il salvataggio fallisce, il collegamento si perderebbe.
    await rilasciaLucchetto(db, appId, owner, extra);
    return { accessToken: r.accessToken, mcpUrl, appName: app.nome || 'App', app };
  } catch (err) {
    await rilasciaLucchetto(db, appId, owner, {
      mcpStato: 'errore',
      mcpUltimoErrore: String(err.message || err).slice(0, 300)
    }).catch(() => {});
    throw err;
  }
}

module.exports = { ottieniAccessToken, authBaseFromMcpUrl };

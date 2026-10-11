#!/usr/bin/env node
// Collega UNA app del CRM al suo server MCP GoodBarber (stesso schema di Cefalù).
// Uso: node collega-app.js <docId CRM>
// - registra un client OAuth, scrive il link di autorizzazione in ./auth-url.txt
// - aspetta il ritorno su localhost:8765/callback (max 15 min)
// - prova in SOLA LETTURA (initialize + tools/list)
// - salva mcpClientId / mcpRefreshToken nella collezione protetta app_mcp_segreti (mai stampati)
//   e nel doc app solo i dati non segreti (mcpServerUrl, mcpCollegato, mcpCollegatoIl)
'use strict';
const http = require('http');
const crypto = require('crypto');
const fsx = require('fs');
const path = require('path');
const db = require('./fsrest.js');

const PORT = 8765;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const b64url = b => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const form = o => Object.entries(o).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
const log = (...a) => console.log(...a);

async function mcpCall(url, token, body, sessionId) {
  const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  if (sessionId) h['Mcp-Session-Id'] = sessionId;
  const r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body) });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {
    const line = text.split('\n').filter(l => l.startsWith('data:')).pop();
    if (line) try { json = JSON.parse(line.slice(5)); } catch (_) {}
  }
  return { status: r.status, sessionId: r.headers.get('mcp-session-id') || sessionId, json };
}

async function main() {
  const docId = process.argv[2];
  const app = await db.getDoc('app', docId);
  if (!app) throw new Error('doc app non trovato: ' + docId);
  if (!app.goodbarberWebzineId) throw new Error('SALTATA: nessun goodbarberWebzineId nel CRM');
  if (db.collegata(app) && !process.argv.includes('--force')) throw new Error('SALTATA: già collegata');

  const mcpUrl = `https://mcp.ww-api.com/${app.goodbarberWebzineId}/mcp/sse`;
  const base = mcpUrl.replace(/\/mcp\/sse$/, '');
  log('App:', app.nome, '| webzine', app.goodbarberWebzineId);

  const meta = await (await fetch(base + '/.well-known/oauth-authorization-server')).json();
  const reg = await (await fetch(meta.registration_endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_name: 'CRM GrowApp', redirect_uris: [REDIRECT_URI],
      grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' })
  })).json();
  const clientId = reg.client_id;
  if (!clientId) throw new Error('registrazione client fallita');

  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  const authUrl = meta.authorization_endpoint + '?' + form({ response_type: 'code', client_id: clientId,
    redirect_uri: REDIRECT_URI, code_challenge: challenge, code_challenge_method: 'S256', state, resource: mcpUrl });
  fsx.writeFileSync(path.join(__dirname, 'auth-url.txt'), authUrl);
  log('Link di autorizzazione pronto in auth-url.txt — in attesa del ritorno…');

  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { server.close(); reject(new Error('timeout: nessuna approvazione in 15 minuti')); }, 900000);
    const server = http.createServer((rq, rs) => {
      const u = new URL(rq.url, `http://localhost:${PORT}`);
      if (u.pathname !== '/callback') { rs.writeHead(404); rs.end(); return; }
      const c = u.searchParams.get('code'), st = u.searchParams.get('state'), err = u.searchParams.get('error');
      rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      rs.end('<h2 style="font-family:sans-serif">' + (c ? '✅ ' + app.nome + ' — autorizzato' : '❌ ' + (err || 'errore')) + '</h2>');
      clearTimeout(timer); server.close();
      if (err) return reject(new Error('OAuth: ' + err));
      if (st !== state) return reject(new Error('state non corrispondente'));
      resolve(c);
    }).listen(PORT);
  });

  const tok = await (await fetch(meta.token_endpoint, { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: clientId, code_verifier: verifier, resource: mcpUrl })
  })).json();
  if (!tok.access_token || !tok.refresh_token) throw new Error('scambio token fallito (manca access o refresh token)');

  // Prova in sola lettura
  const init = await mcpCall(mcpUrl, tok.access_token, { jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'crm-collega', version: '1.0' } } });
  if (init.status >= 300) throw new Error('initialize rifiutato HTTP ' + init.status);
  await mcpCall(mcpUrl, tok.access_token, { jsonrpc: '2.0', method: 'notifications/initialized' }, init.sessionId);
  const tl = await mcpCall(mcpUrl, tok.access_token, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, init.sessionId);
  const tools = (tl.json && tl.json.result && tl.json.result.tools) || [];
  const srvName = init.json && init.json.result && init.json.result.serverInfo && init.json.result.serverInfo.name;
  log('Prova lettura: initialize OK, server', srvName || '?', '| strumenti disponibili:', tools.length);
  if (!tools.length) throw new Error('tools/list vuoto o fallito HTTP ' + tl.status);

  // Prima i segreti (collezione protetta), poi il doc app: se il secondo passo fallisse, il token resta salvo
  await db.patchDoc(db.COLL_SEGRETI, docId, {
    mcpServerUrl: mcpUrl, mcpClientId: clientId, mcpRefreshToken: tok.refresh_token, aggiornatoIl: new Date(), lockFino: 0, lockDi: ''
  }, { crea: true });
  await db.patchDoc('app', docId, {
    mcpServerUrl: mcpUrl, mcpCollegato: true, mcpStato: 'ok', mcpUltimoErrore: '',
    mcpCollegatoIl: new Date(), mcpCollegatoDa: 'Claude Code (collegamento automatico)',
    // eventuali segreti del formato vecchio rimasti nel doc app (es. ricollegamento con --force)
    mcpClientId: undefined, mcpRefreshToken: undefined, mcpRinnovoLockFino: undefined, mcpRinnovoLockDi: undefined
  });
  log('✅ COLLEGATA e salvata nel CRM:', app.nome);
}

main().catch(e => { console.log('❌', e.message); process.exit(1); });

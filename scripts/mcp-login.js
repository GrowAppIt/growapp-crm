#!/usr/bin/env node
/**
 * mcp-login.js — Login OAuth UNA TANTUM al server MCP di GoodBarber.
 *
 * Fa il giro OAuth (authorization_code + PKCE) aprendo il browser:
 * tu accedi/approvi su GoodBarber, e lo script ottiene un REFRESH TOKEN
 * (il "lasciapassare permanente") + il client_id da incollare nel CRM.
 * Poi verifica che il server MCP accetti davvero il token.
 *
 * Uso:
 *   node scripts/mcp-login.js
 *   node scripts/mcp-login.js "https://mcp.ww-api.com/376069/mcp/sse"
 *
 * Nessuna dipendenza esterna: solo moduli Node standard.
 */
'use strict';

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { exec } = require('child_process');

const MCP_URL = (process.argv[2] || 'https://mcp.ww-api.com/376069/mcp/sse').trim();
const REDIRECT_PORT = 8765;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

// base del server di autorizzazione = URL MCP senza la coda /mcp/sse (o /sse)
const AUTH_BASE = MCP_URL.replace(/\/mcp\/sse\/?$/, '').replace(/\/sse\/?$/, '');

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function req(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const opts = {
      method,
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      headers: Object.assign({}, headers || {}),
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const r = https.request(opts, (res) => {
      let chunks = '';
      res.on('data', (d) => (chunks += d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: chunks }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function form(obj) {
  return Object.entries(obj).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
}

async function discover() {
  // prova il well-known per-app; se fallisce, deriva gli endpoint dalla base
  const wellKnown = `${AUTH_BASE}/.well-known/oauth-authorization-server`;
  try {
    const r = await req('GET', wellKnown, { Accept: 'application/json' });
    if (r.status === 200) {
      const m = JSON.parse(r.body);
      if (m.authorization_endpoint && m.token_endpoint) return m;
    }
  } catch (_) {}
  return {
    authorization_endpoint: `${AUTH_BASE}/authorize`,
    token_endpoint: `${AUTH_BASE}/token`,
    registration_endpoint: `${AUTH_BASE}/register`,
  };
}

async function main() {
  console.log('\n── Login MCP GoodBarber ───────────────────────────');
  console.log('Server MCP :', MCP_URL);
  console.log('Auth base  :', AUTH_BASE);

  const meta = await discover();

  // 1) Registrazione dinamica del client
  let clientId;
  try {
    const reg = await req('POST', meta.registration_endpoint || `${AUTH_BASE}/register`,
      { 'Content-Type': 'application/json', Accept: 'application/json' },
      { client_name: 'Comune.Digital CRM', redirect_uris: [REDIRECT_URI],
        grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
        token_endpoint_auth_method: 'none' });
    clientId = JSON.parse(reg.body).client_id;
  } catch (e) { console.error('Registrazione client fallita:', e.message); process.exit(1); }
  if (!clientId) { console.error('Nessun client_id ricevuto.'); process.exit(1); }
  console.log('client_id  :', clientId);

  // 2) PKCE + state
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));

  const authUrl = `${meta.authorization_endpoint}?` + form({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    resource: MCP_URL,
  });

  // 3) Server locale che cattura il redirect col "code"
  const codePromise = new Promise((resolve, reject) => {
    const server = http.createServer((rq, rs) => {
      const u = new URL(rq.url, `http://localhost:${REDIRECT_PORT}`);
      if (u.pathname !== '/callback') { rs.writeHead(404); rs.end('not found'); return; }
      const code = u.searchParams.get('code');
      const st = u.searchParams.get('state');
      const err = u.searchParams.get('error');
      rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      rs.end('<html><body style="font-family:sans-serif;padding:40px"><h2>' +
        (code ? '✅ Login completato' : '❌ Errore: ' + (err || 'nessun code')) +
        '</h2><p>Puoi chiudere questa pagina e tornare al terminale.</p></body></html>');
      server.close();
      if (err) return reject(new Error('OAuth error: ' + err));
      if (st !== state) return reject(new Error('state non corrispondente (possibile problema di sicurezza)'));
      if (!code) return reject(new Error('nessun code ricevuto'));
      resolve(code);
    });
    server.listen(REDIRECT_PORT, () => {
      console.log('\n👉 Apro il browser per il login su GoodBarber…');
      console.log('   Se non si apre, copia questo link nel browser:\n');
      console.log('   ' + authUrl + '\n');
      exec(`open "${authUrl}"`);
    });
    server.on('error', reject);
  });

  const code = await codePromise;

  // 4) Scambio code -> token
  const tok = await req('POST', meta.token_endpoint,
    { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    form({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI,
      client_id: clientId, code_verifier: verifier, resource: MCP_URL }));

  let t;
  try { t = JSON.parse(tok.body); } catch (_) { t = {}; }
  if (tok.status !== 200 || !t.access_token) {
    console.error('\n❌ Scambio token fallito. Status', tok.status, '\n', tok.body);
    process.exit(1);
  }

  console.log('\n✅ Token ottenuti.');
  if (!t.refresh_token) {
    console.log('\n⚠️  Il server NON ha restituito un refresh_token (solo access_token, che scade).');
    console.log('    Avviso: senza refresh_token servirebbe rifare il login a ogni scadenza.');
  }

  // 5) Verifica: il server MCP accetta l\'access_token?
  const init = await req('POST', MCP_URL,
    { Authorization: 'Bearer ' + t.access_token, 'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream' },
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'crm-login-test', version: '1.0' } } }));
  const ok = init.status >= 200 && init.status < 300;
  console.log('\n── Verifica sul server MCP ────────────────────────');
  console.log('initialize → HTTP', init.status, ok ? '✅ il server ti ha ACCETTATO' : '❌ rifiutato');
  if (!ok) console.log(String(init.body).slice(0, 300));

  console.log('\n════════════════════════════════════════════════════');
  console.log('  DA INCOLLARE NEL CRM (scheda app → Collegamento MCP)');
  console.log('════════════════════════════════════════════════════');
  console.log('Client ID     :', clientId);
  console.log('Refresh Token :', t.refresh_token || '(nessuno)');
  console.log('════════════════════════════════════════════════════\n');
}

main().catch((e) => { console.error('\nErrore:', e.message); process.exit(1); });

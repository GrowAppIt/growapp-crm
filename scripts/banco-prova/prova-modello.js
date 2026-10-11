#!/usr/bin/env node
// Prova un modello Claude con la STESSA richiesta che fa api/app-publish-chat.js (MCP connector),
// su un'app collegata, con domande di SOLA LETTURA. Non stampa mai chiavi o token.
// Uso: node scripts/banco-prova/prova-modello.js <modello> <docIdApp> "<domanda>"
'use strict';
const fsx = require('fs');
const path = require('path');
const db = require('../mcp-collega/fsrest.js');

const chiave = (fsx.readFileSync(path.join(__dirname, 'chiave.txt'), 'utf8').match(/sk-ant-[A-Za-z0-9_\-]+/) || [])[0];
if (!chiave) { console.error('Chiave non trovata in chiave.txt'); process.exit(1); }

async function rinnova(app) {
  const base = app.mcpServerUrl.replace(/\/mcp\/sse\/?$/, '');
  const r = await fetch(base + '/token', { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: app.mcpRefreshToken, client_id: app.mcpClientId, resource: app.mcpServerUrl }).toString() });
  if (!r.ok) throw new Error('rinnovo rifiutato HTTP ' + r.status);
  const j = await r.json();
  if (j.refresh_token && j.refresh_token !== app.mcpRefreshToken) await db.patchDoc('app', app._id, { mcpRefreshToken: j.refresh_token });
  return j.access_token;
}

(async () => {
  const [modello, docId, domanda] = process.argv.slice(2);
  const app = await db.getDoc('app', docId);
  if (app.mcpRinnovoLockFino && app.mcpRinnovoLockFino > Date.now()) throw new Error('app occupata dal CRM, riprova');
  const accessToken = await rinnova(app);
  // Prompt di sistema identico a quello di produzione
  const src = fsx.readFileSync(path.join(__dirname, '../../api/app-publish-chat.js'), 'utf8');
  const fn = new Function(src.slice(src.indexOf('function buildSystemPrompt'), src.indexOf('// --- CORS')) + '; return buildSystemPrompt;')();
  const payload = {
    model: modello, max_tokens: 16000, system: fn(app.nome),
    cache_control: process.env.NOCACHE ? undefined : { type: 'ephemeral' },
    fallbacks: process.env.FALLBACK ? 'default' : undefined,
    mcp_servers: [{ type: 'url', name: 'goodbarber', url: app.mcpServerUrl, authorization_token: accessToken }],
    tools: [{ type: 'mcp_toolset', mcp_server_name: 'goodbarber' }]
  };
  let convo = [{ role: 'user', content: domanda }];
  const t0 = Date.now(); let last, giri = 0, inT = 0, outT = 0, cR = 0, cW = 0;
  for (; giri <= 6; giri++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': chiave, 'anthropic-version': '2023-06-01', 'anthropic-beta': process.env.FALLBACK ? 'mcp-client-2025-11-20,server-side-fallback-2026-07-01' : 'mcp-client-2025-11-20', 'anthropic-workspace-id': 'wrkspc_01HFKPWGSjcNz9t6zxVDpYMq' },
      body: JSON.stringify(Object.assign({}, payload, { messages: convo })) });
    if (!r.ok) { console.log('ERRORE API', r.status, (await r.text()).slice(0, 600)); process.exit(1); }
    last = await r.json();
    inT += last.usage.input_tokens || 0; outT += last.usage.output_tokens || 0; cR += last.usage.cache_read_input_tokens || 0; cW += last.usage.cache_creation_input_tokens || 0;
    if (last.stop_reason === 'pause_turn') { convo = convo.concat([{ role: 'assistant', content: last.content }]); continue; }
    break;
  }
  const strumenti = last.content.filter(b => b.type === 'mcp_tool_use').map(b => b.name);
  const testo = last.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  console.log(JSON.stringify({ modello, secondi: Math.round((Date.now() - t0) / 1000), stop: last.stop_reason, continuazioni: giri,
    tokenIn: inT, tokenOut: outT, cacheLetti: cR, cacheScritti: cW,
    costoUSD: Math.round(((inT * 4) + (cW * 5) + (cR * 0.4) + (outT * 20)) / 1e4) / 100, strumentiUsati: strumenti }, null, 1));
  console.log('--- risposta ---\n' + testo.slice(0, 2500));
})().catch(e => { console.error('ERR', e.message); process.exit(1); });

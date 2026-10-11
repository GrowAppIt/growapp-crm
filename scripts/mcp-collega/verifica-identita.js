#!/usr/bin/env node
// Verifica che il collegamento MCP di ogni app apra DAVVERO quell'app (non un'altra).
// Uso: node scripts/mcp-collega/verifica-identita.js [docId ...]   (senza argomenti: tutte le app collegate)
//
// Per ogni app collegata:
//  1. ottiene un access_token dal refresh_token (come fa api/app-publish-chat.js);
//     se GoodBarber ruota il refresh_token, salva il nuovo nel doc `app` (unico campo scritto);
//  2. in SOLA LETTURA chiede all'MCP qualche contenuto (articoli, eventi, mappe, foto, video, audio)
//     e ricava dai dati l'ID GoodBarber (superstatic/<id>/, cdn/<id>/) e il dominio dell'app;
//  3. legge la pagina pubblica del dominio indicato nel CRM e ne ricava webzine_id e titolo;
//  4. confronta tutto con goodbarberWebzineId / urlCruscotto / urlSito / nome del CRM.
// Non stampa mai token. Non crea, modifica o pubblica nulla su GoodBarber.
'use strict';
const fsx = require('fs');
const path = require('path');
const db = require('./fsrest.js');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hostOf = u => { try { return new URL(/^https?:/.test(u) ? u : 'https://' + u).hostname.toLowerCase(); } catch (_) { return ''; } };

async function mintAccessToken(mcpUrl, clientId, refreshToken) {
  const base = mcpUrl.replace(/\/mcp\/sse\/?$/, '');
  const r = await fetch(base + '/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, resource: mcpUrl }).toString()
  });
  const text = await r.text();
  if (!r.ok) throw new Error('refresh rifiutato HTTP ' + r.status);
  const j = JSON.parse(text);
  if (!j.access_token) throw new Error('risposta senza access_token');
  return { accessToken: j.access_token, newRefreshToken: (j.refresh_token && j.refresh_token !== refreshToken) ? j.refresh_token : null };
}

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

// Strumenti di SOLA LETTURA provati in ordine finché uno restituisce contenuti
const LETTURE = [
  ['cms_list_articles', { per_page: 10 }],
  ['cms_list_events', { per_page: 10 }],
  ['cms_list_maps', { per_page: 10 }],
  ['cms_list_photos', { per_page: 10 }],
  ['cms_list_videos', { per_page: 10 }],
  ['cms_list_sounds', { per_page: 10 }]
];

function estrai(text) {
  const ids = new Set(), hosts = new Set(), esempi = [];
  let items = [];
  try { const j = JSON.parse(text); items = Array.isArray(j.items) ? j.items : (Array.isArray(j) ? j : []); } catch (_) {}
  // Si ignorano i contenuti "di esempio" del modello GoodBarber (senza sezione e senza indirizzo):
  // le loro foto appartengono all'app modello e non dicono nulla sull'identità.
  const veri = items.filter(it => it && (it.url || (Array.isArray(it.sections) && it.sections.length)));
  for (const it of veri) {
    const u = it.url || it.link || it.shareUrl;
    if (u) { const h = hostOf(String(u)); if (h) hosts.add(h); if (esempi.length < 3) esempi.push(String(u).slice(0, 120)); }
    for (const m of JSON.stringify(it).matchAll(/(?:superstatic|cdn)\/(\d{4,9})\//g)) ids.add(m[1]);
  }
  if (process.env.DEBUG) console.log('  [debug]', items.length, 'elementi,', veri.length, 'veri', [...hosts]);
  return { ids: [...ids], hosts: [...hosts], esempi, n: veri.length };
}

async function identitaMcp(app) {
  // Rispetta il lucchetto di lib/mcp-token.js: se il CRM sta usando l'app in questo momento, non toccarla.
  if (app.mcpRinnovoLockFino && app.mcpRinnovoLockFino > Date.now()) throw new Error('app occupata dal CRM in questo momento, riprova');
  const { accessToken, newRefreshToken } = await mintAccessToken(app.mcpServerUrl, app.mcpClientId, app.mcpRefreshToken);
  // GoodBarber ruota il refresh_token a ogni uso: va salvato subito, altrimenti il collegamento si perde.
  if (newRefreshToken) await db.patchDoc('app', app._id, { mcpRefreshToken: newRefreshToken });
  const url = app.mcpServerUrl;
  const init = await mcpCall(url, accessToken, { jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'crm-verifica', version: '1.0' } } });
  if (init.status >= 300) throw new Error('initialize HTTP ' + init.status);
  await mcpCall(url, accessToken, { jsonrpc: '2.0', method: 'notifications/initialized' }, init.sessionId);
  const tot = { ids: new Set(), hosts: new Set(), esempi: [], fonti: [] };
  let id = 10;
  for (const [name, args] of LETTURE) {
    const r = await mcpCall(url, accessToken, { jsonrpc: '2.0', id: id++, method: 'tools/call', params: { name, arguments: args } }, init.sessionId);
    const content = r.json && r.json.result && r.json.result.content;
    const text = Array.isArray(content) ? content.map(c => c.text || '').join('\n') : '';
    const f = estrai(text);
    if (f.n) tot.fonti.push(name);
    f.ids.forEach(x => tot.ids.add(x)); f.hosts.forEach(x => tot.hosts.add(x)); tot.esempi.push(...f.esempi);
    if (tot.hosts.size) break; // trovato un indirizzo vero: basta così
  }
  return { fonte: tot.fonti.join(',') || null, ids: [...tot.ids], hosts: [...tot.hosts], esempi: tot.esempi.slice(0, 3), ruotato: !!newRefreshToken };
}

async function identitaPubblica(host) {
  if (!host) return { webzine: null, titolo: null };
  try {
    const r = await fetch('https://' + host + '/', { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow' });
    const html = await r.text();
    const w = html.match(/webzine_id"\s*:\s*(\d+)/);
    const t = html.match(/<title>([^<]*)<\/title>/i);
    return { webzine: w ? w[1] : null, titolo: t ? t[1].trim() : null, status: r.status };
  } catch (e) { return { webzine: null, titolo: null, errore: e.message }; }
}

(async () => {
  const filtro = process.argv.slice(2);
  const tutte = await db.listAll('app');
  const apps = tutte.filter(a => a.mcpRefreshToken && (!filtro.length || filtro.includes(a._id)))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
  const out = [];
  for (const app of apps) {
    const wz = String(app.goodbarberWebzineId || '');
    const hostCrm = hostOf(String(app.urlCruscotto || '').replace(/\/manage.*$/, ''));
    const hostSito = hostOf(app.urlSito || '');
    const riga = { docId: app._id, nome: app.nome, webzineCrm: wz, hostCruscotto: hostCrm, hostSito, problemi: [] };
    try {
      const m = await identitaMcp(app);
      Object.assign(riga, { fonte: m.fonte, idsMcp: m.ids, hostsMcp: m.hosts, esempiUrl: m.esempi, ruotato: m.ruotato });
      // Prova forte: l'indirizzo pubblico dei contenuti (item.url) è il dominio dell'app.
      // Prova debole: l'ID nelle foto (le foto possono essere copiate da un'altra app).
      const hostOk = hostCrm && m.hosts.includes(hostCrm);
      const idOk = m.ids.includes(wz);
      if (!m.fonte) riga.esito = 'NESSUN DATO';
      else if (hostOk) riga.esito = 'OK';
      else if (m.hosts.length && !hostOk) { riga.esito = 'DIVERSA'; riga.problemi.push('i contenuti MCP sono su ' + m.hosts.join('/') + ', il CRM dice ' + (hostCrm || '?')); }
      else if (idOk) riga.esito = 'OK (solo foto)';
      else { riga.esito = 'DUBBIA'; riga.problemi.push('nessun indirizzo nei contenuti; foto con webzine ' + (m.ids.join('/') || '-') + ' invece di ' + wz); }
      if (riga.esito === 'NESSUN DATO') riga.problemi.push('MCP: nessun contenuto da cui ricavare l\'identità');
      if (!app.mcpServerUrl.includes('/' + wz + '/')) riga.problemi.push('mcpServerUrl non contiene il webzine del CRM');
    } catch (e) { riga.problemi.push('MCP errore: ' + e.message); }
    const pub = await identitaPubblica(hostCrm || hostSito);
    Object.assign(riga, { webzinePubblico: pub.webzine, titoloPubblico: pub.titolo });
    if (!hostCrm) riga.problemi.push('urlCruscotto mancante nel CRM');
    if (pub.webzine && pub.webzine !== wz) riga.problemi.push('pagina pubblica ' + (hostCrm || hostSito) + ' è webzine ' + pub.webzine + ', CRM dice ' + wz);
    if (!pub.webzine) riga.problemi.push('pagina pubblica non leggibile (' + (hostCrm || hostSito || 'nessun dominio') + ')');
    out.push(riga);
    console.log((riga.problemi.length ? '⚠️ ' : '✅ ') + app.nome + (riga.problemi.length ? ' — ' + riga.problemi.join(' | ') : ''));
    await sleep(300);
  }
  const file = path.join(__dirname, 'verifica-identita-esito.json');
  fsx.writeFileSync(file, JSON.stringify(out, null, 2));
  const ko = out.filter(r => r.problemi.length);
  console.log(`\nVerificate: ${out.length} | OK: ${out.length - ko.length} | da guardare: ${ko.length} | refresh ruotati e salvati: ${out.filter(r => r.ruotato).length}`);
  console.log('Dettaglio: ' + file);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });

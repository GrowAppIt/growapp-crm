// Collaudo delle regole Firestore PRIMA di pubblicarle, con l'API
// firebaserules ":test" (non pubblica nulla: valuta le regole su casi finti).
// I profili utente sono simulati con functionMocks su utenti/{uid}.
// Usa le credenziali del Firebase CLI (account di Giancarlo). Non stampa token.
//
//   node scripts/test-firestore-rules.js                       → regole proposte (passo 2, finale)
//   node scripts/test-firestore-rules.js --passo1              → passo 1: push_history ancora pubblico
//   node scripts/test-firestore-rules.js altro-file.rules.txt  → un altro file
'use strict';
const FT = '/usr/local/lib/node_modules/firebase-tools/lib/';
const auth = require(FT + 'auth.js');
const scopes = require(FT + 'scopes.js');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const PASSO1 = args.includes('--passo1');
const file = args.find(a => !a.startsWith('--'))
  || path.join(__dirname, '..', 'firestore-security', 'firestore.rules.proposed.txt');
let src = fs.readFileSync(file, 'utf8');

const RIGA_FINALE = /(match \/push_history\/\{document\} \{\s*\n\s*allow read: if )isActive\(\);/;
if (PASSO1) {
  if (!RIGA_FINALE.test(src)) throw new Error('Non trovo "allow read: if isActive();" in push_history');
  src = src.replace(RIGA_FINALE, '$1true;');
}

const D = '/databases/(default)/documents';
const mocks = (ruolo, stato) => ruolo === 'SENZA_PROFILO'
  ? [{ function: 'exists', args: [{ exactValue: D + '/utenti/u1' }], result: { value: false } }]
  : [
    { function: 'exists', args: [{ exactValue: D + '/utenti/u1' }], result: { value: true } },
    { function: 'get', args: [{ exactValue: D + '/utenti/u1' }], result: { value: { data: Object.assign({ ruolo }, stato ? { stato } : {}) } } }
  ];
const app = { comune: 'X', appSlug: 'x', pushMonitorEnabled: true, monitorPushUserId: 1, goodbarberWebzineId: 2, gbStatsCache: { a: 1 } };
const notif = { appSlug: 'x', status: 'sent', source: 'rss_auto', title: 'T', gbUrl: 'https://x.goodbarber.app/a', sentBy: 'goodbarber' };
const pub = { appSlug: 'x', status: 'sent', source: 'rss_auto', title: 'T', hasDetail: true };
const T = (nome, exp, ruolo, method, p, newData, oldData, stato) => ({ nome, tc: {
  expectation: exp,
  request: Object.assign({ auth: ruolo === null ? null : { uid: 'u1' }, path: D + p, method }, newData ? { resource: { data: newData } } : {}),
  resource: oldData ? { data: oldData } : undefined,
  functionMocks: ruolo ? mocks(ruolo, stato) : []
}});

const cases = [
  // --- audit 27/10/2026 (monitoraggio: agenti fuori) ---
  T('agente aggiorna statistiche app', 'ALLOW', 'AGENTE', 'update', '/app/a1', { ...app, gbStatsCache: { a: 2 } }, app),
  T('agente cambia User ID fantasma', 'DENY', 'AGENTE', 'update', '/app/a1', { ...app, monitorPushUserId: 999 }, app),
  T('agente spegne monitor', 'DENY', 'AGENTE', 'update', '/app/a1', { ...app, pushMonitorEnabled: false }, app),
  T('agente cambia slug', 'DENY', 'AGENTE', 'update', '/app/a1', { ...app, appSlug: 'y' }, app),
  T('agente crea app con monitor', 'DENY', 'AGENTE', 'create', '/app/n1', { comune: 'Z', pushMonitorEnabled: true }, null),
  T('agente elimina app', 'DENY', 'AGENTE', 'delete', '/app/a1', null, app),
  T('agente legge app', 'ALLOW', 'AGENTE', 'get', '/app/a1', null, app),
  T('agente scrive push_history', 'DENY', 'AGENTE', 'create', '/push_history/p1', { appSlug: 'x' }, null),
  T('agente legge health_status', 'DENY', 'AGENTE', 'get', '/health_status/latest', null, { a: 1 }),
  T('agente scrive health_status', 'DENY', 'AGENTE', 'update', '/health_status/latest', { a: 2 }, { a: 1 }),
  T('admin cambia User ID', 'ALLOW', 'ADMIN', 'update', '/app/a1', { ...app, monitorPushUserId: 999 }, app),
  T('content manager spegne monitor', 'ALLOW', 'CONTENT_MANAGER', 'update', '/app/a1', { ...app, pushMonitorEnabled: false }, app),
  T('sviluppatore scrive push_history', 'ALLOW', 'SVILUPPATORE', 'create', '/push_history/p1', { appSlug: 'x' }, null),
  T('admin legge health_status', 'ALLOW', 'ADMIN', 'get', '/health_status/latest', null, { a: 1 }),
  T('admin scrive health_status', 'DENY', 'ADMIN', 'update', '/health_status/latest', { a: 2 }, { a: 1 }),
  T('admin disattivato cambia User ID', 'DENY', 'ADMIN', 'update', '/app/a1', { ...app, monitorPushUserId: 999 }, app, 'DISATTIVO'),
  T('anonimo legge app', 'DENY', null, 'get', '/app/a1', null, app),
  T('anonimo legge app_public', 'ALLOW', null, 'get', '/app_public/x', null, { appSlug: 'x' }),
  T('agente legge clienti (invariato)', 'ALLOW', 'AGENTE', 'get', '/clienti/c1', null, { a: 1 }),
  T('admin scrive notifications (invariato)', 'ALLOW', 'ADMIN', 'update', '/notifications/n1', { a: 2 }, { a: 1 }),

  // --- specchio pubblico push_public ---
  T('anonimo legge push_public', 'ALLOW', null, 'get', '/push_public/p1', null, pub),
  T('anonimo elenca push_public (archivio)', 'ALLOW', null, 'list', '/push_public/p1', null, pub),
  T('anonimo scrive push_public', 'DENY', null, 'create', '/push_public/p1', pub, null),
  T('agente scrive push_public', 'DENY', 'AGENTE', 'update', '/push_public/p1', { ...pub, title: 'X' }, pub),
  T('admin scrive push_public (solo il server)', 'DENY', 'ADMIN', 'create', '/push_public/p1', pub, null),
  T('admin elimina push_public', 'DENY', 'ADMIN', 'delete', '/push_public/p1', null, pub),

  // --- push_history: chi lo legge ---
  T('anonimo legge push_history', PASSO1 ? 'ALLOW' : 'DENY', null, 'get', '/push_history/p1', null, notif),
  T('anonimo elenca push_history', PASSO1 ? 'ALLOW' : 'DENY', null, 'list', '/push_history/p1', null, notif),
  T('admin legge push_history (Storico Push)', 'ALLOW', 'ADMIN', 'list', '/push_history/p1', null, notif),
  T('agente attivo legge push_history', 'ALLOW', 'AGENTE', 'get', '/push_history/p1', null, notif),
  T('utente disattivato legge push_history', PASSO1 ? 'ALLOW' : 'DENY', 'ADMIN', 'get', '/push_history/p1', null, notif, 'DISATTIVO'),
  T('loggato senza profilo CRM legge push_history', PASSO1 ? 'ALLOW' : 'DENY', 'SENZA_PROFILO', 'get', '/push_history/p1', null, notif),
];

(async () => {
  const acc = auth.getGlobalDefaultAccount();
  const tok = (await auth.getAccessToken(acc.tokens.refresh_token, [scopes.CLOUD_PLATFORM])).access_token;
  const body = { source: { files: [{ name: 'firestore.rules', content: src }] }, testSuite: { testCases: cases.map(c => c.tc) } };
  const r = await fetch('https://firebaserules.googleapis.com/v1/projects/crm-comunedigital:test', {
    method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!r.ok || !j.testResults) { console.log(JSON.stringify(j, null, 1).slice(0, 3000)); process.exit(1); }
  console.log(`Regole: ${path.basename(file)}${PASSO1 ? ' (passo 1: push_history ancora pubblico)' : ''}`);
  let ko = 0;
  j.testResults.forEach((t, i) => {
    const ok = t.state === 'SUCCESS';
    if (!ok) ko++;
    console.log((ok ? 'OK  ' : 'KO  ') + cases[i].nome + (ok ? '' : '  → ' + JSON.stringify(t.debugMessages || t.errorPosition || t)));
  });
  console.log(ko ? ko + ' test falliti' : 'tutti i ' + cases.length + ' test passati');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });

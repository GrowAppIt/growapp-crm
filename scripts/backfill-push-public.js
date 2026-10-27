// Backfill una tantum dello specchio pubblico `push_public` da `push_history`.
//
// Copia in push_public, con lo STESSO doc ID, solo i campi pubblici
// (PUBLIC_FIELDS di lib/push-public.js) più `hasDetail` al posto di gbUrl.
// I campi interni (gbUrl, metadata, sentBy/sentByName, appId...) non vengono
// nemmeno letti: la query chiede a Firestore solo i campi che servono.
// Rilanciabile senza danni: aggiorna solo i campi pubblici presenti.
//
// Usa le credenziali del Firebase CLI (account di Giancarlo), come
// scripts/mcp-collega/fsrest.js. Non stampa mai token.
//
//   node scripts/backfill-push-public.js                  → prova, non scrive nulla
//   node scripts/backfill-push-public.js --app locri      → prova su un solo Comune
//   node scripts/backfill-push-public.js --esegui         → scrive davvero (tutto)
//   node scripts/backfill-push-public.js --app locri --esegui
'use strict';
const FT = '/usr/local/lib/node_modules/firebase-tools/lib/';
const auth = require(FT + 'auth.js');
const scopes = require(FT + 'scopes.js');
const { PUBLIC_COLLECTION, PUBLIC_FIELDS } = require('../lib/push-public');

const PROJECT = 'crm-comunedigital';
const ROOT = `projects/${PROJECT}/databases/(default)/documents`;
const API = 'https://firestore.googleapis.com/v1/';
const PAGE = 500;   // doc letti per pagina e scritti per batchWrite (max 500)

const args = process.argv.slice(2);
const ESEGUI = args.includes('--esegui');
const appIdx = args.indexOf('--app');
const SOLO_APP = appIdx >= 0 ? String(args[appIdx + 1] || '').toLowerCase().trim() : '';

let _tok = null;
async function token() {
  if (_tok) return _tok;
  const acc = auth.getGlobalDefaultAccount();
  const t = await auth.getAccessToken(acc.tokens.refresh_token, [scopes.CLOUD_PLATFORM]);
  _tok = t.access_token;
  return _tok;
}

async function call(path, body) {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(path.split(':').pop() + ' ' + r.status + ' ' + (await r.text()).slice(0, 300));
  return r.json();
}

// Una pagina di push_history, ordinata per ID, con i soli campi che servono.
async function leggiPagina(dopoNome) {
  const q = {
    from: [{ collectionId: 'push_history' }],
    select: { fields: PUBLIC_FIELDS.concat(['gbUrl']).map(f => ({ fieldPath: f })) },
    orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
    limit: PAGE
  };
  if (SOLO_APP) q.where = { fieldFilter: { field: { fieldPath: 'appSlug' }, op: 'EQUAL', value: { stringValue: SOLO_APP } } };
  if (dopoNome) q.startAt = { values: [{ referenceValue: dopoNome }], before: false };
  const righe = await call(ROOT + ':runQuery', { structuredQuery: q });
  return righe.filter(x => x.document).map(x => x.document);
}

// Dai campi (formato REST) di push_history ai campi di push_public.
function campiPubblici(fields) {
  const out = {};
  for (const k of PUBLIC_FIELDS) if (fields[k] !== undefined) out[k] = fields[k];
  if (fields.gbUrl !== undefined) {
    const g = fields.gbUrl.stringValue;
    out.hasDetail = { booleanValue: typeof g === 'string' && g.length > 0 };
  }
  return out;
}

(async () => {
  console.log(`Backfill push_public — ${ESEGUI ? 'ESECUZIONE (scrive)' : 'PROVA (non scrive)'}${SOLO_APP ? ' — solo ' + SOLO_APP : ''}`);
  let letti = 0, scritti = 0, conDettaglio = 0, senzaSlug = 0, pagine = 0;
  let ultimo = null;
  const esempio = [];

  for (;;) {
    const docs = await leggiPagina(ultimo);
    if (docs.length === 0) break;
    pagine++;
    letti += docs.length;
    ultimo = docs[docs.length - 1].name;

    const writes = [];
    for (const d of docs) {
      const id = d.name.split('/').pop();
      const f = campiPubblici(d.fields || {});
      if (!f.appSlug) senzaSlug++;
      if (f.hasDetail && f.hasDetail.booleanValue) conDettaglio++;
      if (esempio.length < 2) esempio.push({ id, campi: Object.keys(f) });
      writes.push({
        update: { name: `${ROOT}/${PUBLIC_COLLECTION}/${id}`, fields: f },
        // Solo i campi presenti: come set(..., {merge:true}), non cancella nulla.
        updateMask: { fieldPaths: Object.keys(f) }
      });
    }

    if (ESEGUI) {
      const res = await call(ROOT + ':batchWrite', { writes });
      const ko = (res.status || []).filter(s => s && s.code);
      if (ko.length) throw new Error(`${ko.length} scritture fallite nella pagina ${pagine}: ${JSON.stringify(ko[0]).slice(0, 200)}`);
      scritti += writes.length;
    }
    if (pagine % 10 === 0) console.log(`  ...${letti} letti${ESEGUI ? `, ${scritti} scritti` : ''}`);
    if (docs.length < PAGE) break;
  }

  console.log(`Letti da push_history: ${letti} (pagine: ${pagine})`);
  console.log(`Con "Leggi il dettaglio": ${conDettaglio} — senza appSlug (non visibili in archivio): ${senzaSlug}`);
  console.log('Esempio di campi copiati:', JSON.stringify(esempio));
  console.log(ESEGUI ? `Scritti su ${PUBLIC_COLLECTION}: ${scritti}` : 'Nessuna scrittura (aggiungi --esegui per scrivere).');
})().catch(e => { console.error('ERRORE:', e.message); process.exit(1); });

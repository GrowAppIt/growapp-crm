// Helper Firestore REST con le credenziali del Firebase CLI (account di Giancarlo).
// Non stampa mai token.
'use strict';
const FT = '/usr/local/lib/node_modules/firebase-tools/lib/';
const auth = require(FT + 'auth.js');
const scopes = require(FT + 'scopes.js');
const PROJECT = 'crm-comunedigital';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

let _tok = null;
async function token() {
  if (_tok) return _tok;
  const acc = auth.getGlobalDefaultAccount();
  const t = await auth.getAccessToken(acc.tokens.refresh_token, [scopes.CLOUD_PLATFORM]);
  _tok = t.access_token;
  return _tok;
}

function fromValue(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  return null;
}
function fromFields(f) { const o = {}; for (const k in f) o[k] = fromValue(f[k]); return o; }
function toValue(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (x instanceof Date) return { timestampValue: x.toISOString() };
  return { stringValue: String(x) };
}

async function listAll(coll) {
  const out = []; let pageToken = '';
  do {
    const u = `${BASE}/${coll}?pageSize=300` + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const r = await fetch(u, { headers: { Authorization: 'Bearer ' + await token() } });
    if (!r.ok) throw new Error('list ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const j = await r.json();
    for (const d of j.documents || []) out.push(Object.assign({ _id: d.name.split('/').pop() }, fromFields(d.fields || {})));
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

async function getDoc(coll, id) {
  const r = await fetch(`${BASE}/${coll}/${encodeURIComponent(id)}`, { headers: { Authorization: 'Bearer ' + await token() } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('get ' + r.status);
  const d = await r.json();
  return Object.assign({ _id: id }, fromFields(d.fields || {}));
}

// Aggiorna SOLO i campi indicati (updateMask), il resto del documento resta intatto.
async function patchDoc(coll, id, data) {
  const keys = Object.keys(data);
  const mask = keys.map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const fields = {}; for (const k of keys) fields[k] = toValue(data[k]);
  const r = await fetch(`${BASE}/${coll}/${encodeURIComponent(id)}?${mask}&currentDocument.exists=true`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  if (!r.ok) throw new Error('patch ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

module.exports = { listAll, getDoc, patchDoc };

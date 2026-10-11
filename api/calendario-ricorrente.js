/**
 * Serverless Function — Calendari ricorrenti sulle app (es. avvisi della raccolta differenziata)
 *
 * Le regole stanno nel doc `app/{id}.schedaComune.differenziata` (vedi lib/calendario.js).
 * Il calcolo delle date lo fa il CODICE (nessuna "fantasia" dell'AI), la creazione avviene
 * chiamando direttamente gli strumenti GoodBarber via MCP, a blocchi, senza doppioni.
 *
 * POST /api/calendario-ricorrente
 *   { azione: 'sezioni',   appId }                      → sezioni/categorie Agenda dell'app
 *   { azione: 'anteprima', appId, dal, al }             → avvisi calcolati + quali esistono già + saltati
 *   { azione: 'crea',      appId, dal, al, chiavi:[…] } → crea (max ~40 per chiamata) gli avvisi indicati
 *   { azione: 'proponi',   appId, categoriaId? }       → ricava le regole dagli avvisi già presenti (sola lettura)
 *   { azione: 'mappa-anteprima', appId }                → punti delle mappe "sorgenti" che mancano nella mappa generale
 *   { azione: 'mappa-allinea',   appId, ids:[…] }       → aggiunge (max ~40 per chiamata) la categoria della generale a quei punti
 * Accesso: utente loggato al CRM con ruolo abilitato (come "Pubblicazioni sulle app").
 */

const admin = require('firebase-admin');
const { ottieniAccessToken } = require('../lib/mcp-token.js');
const { apriSessione } = require('../lib/mcp-client.js');
const { generaAvvisi, proponiRegole } = require('../lib/calendario.js');
const { puntiDaAllineare } = require('../lib/mappa-generale.js');

if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      })
    });
  } else {
    admin.initializeApp();
  }
}
const db = admin.firestore();

const ORIGINI_AMMESSE = ['https://crm.comune.digital', 'http://localhost:8080', 'http://127.0.0.1:8080'];
const RUOLI = ['SUPER_ADMIN', 'ADMIN', 'CTO', 'SVILUPPATORE', 'CONTENT_MANAGER'];
const MAX_PER_CHIAMATA = 40;

function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (ORIGINI_AMMESSE.includes(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function verificaUtente(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return { ok: false, status: 401, error: 'Accesso negato: serve il login al CRM.' };
  let decoded;
  try { decoded = await admin.auth().verifyIdToken(h.slice(7).trim()); }
  catch (_) { return { ok: false, status: 401, error: 'Sessione scaduta: ricarica il CRM e rifai il login.' }; }
  const u = await db.collection('utenti').doc(decoded.uid).get();
  const ruolo = u.exists ? (u.data() || {}).ruolo : null;
  if (!RUOLI.includes(ruolo)) return { ok: false, status: 403, error: 'Il tuo ruolo non è abilitato alle pubblicazioni sulle app.' };
  return { ok: true };
}

const chiaveAvviso = a => `${a.categoriaId}|${a.sortDate.slice(0, 10)}|${a.titolo.trim().toLowerCase()}`;

// Tutti gli eventi delle categorie indicate (paginati) → Set di chiavi già presenti
async function chiaviEsistenti(mcp, categorie) {
  const esistenti = new Set();
  for (const cat of categorie) {
    for (let page = 1; page <= 60; page++) {
      const r = await mcp.chiama('cms_list_events', { category: [cat], per_page: 100, page, sort: 'recent' });
      for (const it of (r.items || [])) {
        if (!it.sortDate || !it.title) continue;
        esistenti.add(`${cat}|${String(it.sortDate).slice(0, 10)}|${String(it.title).trim().toLowerCase()}`);
      }
      if (!r.has_next_page) break;
    }
  }
  return esistenti;
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });
  const utente = await verificaUtente(req).catch(e => ({ ok: false, status: 500, error: e.message }));
  if (!utente.ok) return res.status(utente.status).json({ error: utente.error });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { azione, appId, dal, al } = body;
  if (!appId) return res.status(400).json({ error: 'appId mancante.' });

  try {
    const t = await ottieniAccessToken(db, appId, admin);
    const mcp = await apriSessione(t.mcpUrl, t.accessToken);

    if (azione === 'sezioni') {
      const r = await mcp.chiama('cms_list_cms_sections', { type: 'agenda' });
      let sezioniMappa = [];
      try { const m = await mcp.chiama('cms_list_cms_sections', { type: 'maps' }); sezioniMappa = m.sections || []; } catch (_) {}
      return res.status(200).json({ sezioni: r.sections || r, sezioniMappa });
    }

    if (azione === 'mappa-anteprima' || azione === 'mappa-allinea') {
      const regole = ((t.app || {}).schedaComune || {}).mappaGenerale;
      if (!regole || !regole.attiva || !regole.categoriaId || !(regole.sorgenti || []).length) {
        return res.status(400).json({ error: 'Mappa generale non impostata nella Scheda Comune.' });
      }
      if (azione === 'mappa-anteprima') {
        let punti = [], totale = 0;
        for (let page = 1; page <= 200; page++) {
          const x = await mcp.chiama('cms_list_maps', { per_page: 100, page, sort: 'recent' });
          punti = punti.concat(x.items || []);
          totale = x.total || punti.length;
          if (!x.has_next_page) break;
        }
        const daAllineare = puntiDaAllineare(punti, regole).map(p => ({ id: p.id, titolo: p.titolo, stato: p.stato, sezioni: p.sezioni }));
        const giaDentro = punti.filter(p => (p.sections || []).some(sz => (sz.categories || []).some(c => Number(c.id) === Number(regole.categoriaId)))).length;
        return res.status(200).json({ totale, giaDentro, daAllineare });
      }
      // Si rilegge ogni punto da GoodBarber: si aggiorna solo se il calcolo conferma che manca (niente dati arbitrari dal browser)
      const ids = [...new Set((body.ids || []).map(Number).filter(n => n > 0))].slice(0, MAX_PER_CHIAMATA);
      if (!ids.length) return res.status(400).json({ error: 'Nessun punto indicato.' });
      const letti = await mcp.chiama('cms_list_maps', { id: ids, per_page: 100 });
      const daFare = new Map(puntiDaAllineare(letti.items || [], regole).map(p => [p.id, p]));
      const trovati = new Set((letti.items || []).map(p => Number(p.id)));
      const inizio = Date.now();
      const risultati = [];
      for (const id of ids) {
        if (Date.now() - inizio > 240000) { risultati.push({ id, ok: false, rimandato: true }); continue; }
        if (!trovati.has(id)) { risultati.push({ id, ok: false, errore: 'punto non trovato' }); continue; }
        const p = daFare.get(id);
        if (!p) { risultati.push({ id, ok: true, giaPresente: true }); continue; }
        try {
          await mcp.chiama('cms_update_map', { id, categories: p.nuoveCategorie });
          risultati.push({ id, ok: true });
        } catch (e) {
          risultati.push({ id, ok: false, errore: String(e.message || e).slice(0, 200) });
        }
      }
      return res.status(200).json({ risultati });
    }

    if (azione === 'proponi') {
      let categoriaId = Number(body.categoriaId) || null;
      if (!categoriaId) {
        const r = await mcp.chiama('cms_list_cms_sections', { type: 'agenda' });
        const candidate = [];
        for (const sz of (r.sections || [])) {
          if (!/porta a porta|differenziat|rifiut|raccolt|mastell|notifiche serali|conferiment/i.test(sz.title || '')) continue;
          for (const c of (sz.categories || [])) if (c.id) candidate.push({ categoriaId: c.id, sezione: sz.title });
        }
        if (candidate.length !== 1) {
          return res.status(200).json({ daScegliere: true, candidate,
            messaggio: candidate.length ? 'Ho trovato più sezioni possibili: scegli quella della differenziata nel menu "Sezione Agenda" e riprova.' : 'Non trovo una sezione della differenziata: scegline una nel menu "Sezione Agenda" e riprova.' });
        }
        categoriaId = candidate[0].categoriaId;
      }
      let items = [];
      for (let page = 1; page <= 60; page++) {
        const x = await mcp.chiama('cms_list_events', { category: [categoriaId], per_page: 100, page, sort: 'recent' });
        items = items.concat(x.items || []);
        if (!x.has_next_page) break;
      }
      const p = proponiRegole(items, categoriaId);
      if (p.errore) return res.status(200).json({ errore: p.errore, categoriaId });
      return res.status(200).json({ categoriaId, differenziata: p.differenziata, riepilogo: p.riepilogo });
    }

    const regole = ((t.app || {}).schedaComune || {}).differenziata;
    if (!regole || regole.attiva === false) return res.status(400).json({ error: 'Calendario differenziata non attivo nella scheda di questo Comune.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dal || '') || !/^\d{4}-\d{2}-\d{2}$/.test(al || '')) return res.status(400).json({ error: 'Date non valide.' });

    const { avvisi, saltati } = generaAvvisi(regole, dal, al);
    const categorie = [...new Set(avvisi.map(a => a.categoriaId).filter(Boolean))];
    if (avvisi.some(a => !a.categoriaId)) return res.status(400).json({ error: 'Una zona non ha la sezione Agenda impostata.' });

    if (azione === 'anteprima') {
      const esistenti = await chiaviEsistenti(mcp, categorie);
      return res.status(200).json({
        avvisi: avvisi.map(a => Object.assign({ chiave: chiaveAvviso(a), giaPresente: esistenti.has(chiaveAvviso(a)) }, a)),
        saltati
      });
    }

    if (azione === 'crea') {
      // Si creano SOLO avvisi che il calcolo conferma (niente dati arbitrari dal browser)
      const richieste = new Set((body.chiavi || []).slice(0, MAX_PER_CHIAMATA));
      const daCreare = avvisi.filter(a => richieste.has(chiaveAvviso(a)));
      const esistenti = await chiaviEsistenti(mcp, categorie);
      const stato = regole.stato === 'published' ? 'published' : 'draft';
      const inizio = Date.now();
      const risultati = [];
      for (const a of daCreare) {
        const chiave = chiaveAvviso(a);
        if (Date.now() - inizio > 240000) { risultati.push({ chiave, ok: false, rimandato: true }); continue; }
        if (esistenti.has(chiave)) { risultati.push({ chiave, ok: true, giaPresente: true }); continue; }
        try {
          const ev = await mcp.chiama('cms_create_event', {
            title: a.titolo, categories: [a.categoriaId], sortDate: a.sortDate, endDate: a.endDate, status: stato, commentsEnabled: false
          });
          const id = ev && (ev.id || (ev.item && ev.item.id));
          if (id && a.immagine) await mcp.chiama('cms_create_event_paragraph', { id, type: 'photo', originalThumbnail: a.immagine, isThumbnail: true });
          if (id && a.testo) await mcp.chiama('cms_create_event_paragraph', { id, type: 'text', content: '<p><strong>' + a.testo.replace(/</g, '&lt;') + '</strong></p>' });
          esistenti.add(chiave);
          risultati.push({ chiave, ok: true, id });
        } catch (e) {
          risultati.push({ chiave, ok: false, errore: String(e.message || e).slice(0, 200) });
        }
      }
      return res.status(200).json({ risultati });
    }

    return res.status(400).json({ error: 'Azione non valida.' });
  } catch (e) {
    console.error('[calendario-ricorrente]', e.message);
    const status = e.code === 'MCP_BUSY' ? 409 : e.code === 'NOT_FOUND' ? 404 : 502;
    return res.status(status).json({ error: e.message });
  }
};

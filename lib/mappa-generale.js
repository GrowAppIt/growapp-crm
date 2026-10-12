/**
 * Allineatore della MAPPA GENERALE (calcolo puro, nessuna chiamata di rete).
 *
 * In molte app la "Mappa" generale è una normale sezione mappa: un punto ci compare solo se,
 * oltre alla sua mappa (Visit, Utilità, Food & Drink…), ha spuntata anche la categoria della generale.
 * Regole nel doc `app/{id}.schedaComune.mappaGenerale`:
 *   { attiva, sezioneId, categoriaId, titolo, sorgenti: [{ id, titolo, filtroId? }] }
 * - categoriaId = la categoria "completa" della generale (es. TUTTO) da aggiungere a tutti i punti
 * - sorgenti    = le sezioni mappa che vi confluiscono (le altre, es. Aree di emergenza, restano fuori)
 * - filtroId    = (v10.7.5) la categoria-filtro della generale dedicata a quella sorgente (es. "Food&Drink").
 *                 Numero = quel filtro; 0 = nessun filtro; assente = si cerca da solo per nome.
 * Si AGGIUNGONO soltanto le categorie della generale: le categorie già presenti non si toccano mai.
 */

// Mappe che di regola NON vanno nella generale (proposte non spuntate, restano modificabili a mano)
const ESCLUSE_DI_DEFAULT = /emergenz|protezione civile|aree di (attesa|ricovero|ammassamento)|piano comunale|centro operativo|c\.o\.c\b/i;

// "Accessi in Spiaggia" e "accessi in spiaggia", "Food & Drink" e "Food&Drink" sono lo stesso nome
const nomeCompatto = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function categorieDelPunto(p) {
  const ids = [];
  for (const s of (p.sections || [])) for (const c of (s.categories || [])) if (c.id && !ids.includes(Number(c.id))) ids.push(Number(c.id));
  return ids;
}

function sezioniDelPunto(p) {
  return (p.sections || []).map(s => Number(s.id)).filter(Boolean);
}

/**
 * Filtro della generale per ogni sorgente.
 * @param regole    schedaComune.mappaGenerale
 * @param categorie categorie della sezione generale [{ id, title }] (da cms_list_cms_sections)
 * @returns Map(sorgenteId → { id, titolo } | null)
 */
function filtriSorgenti(regole, categorie) {
  const catGen = Number(regole && regole.categoriaId);
  const elenco = (categorie || []).filter(c => c && c.id && Number(c.id) !== catGen);
  const perId = new Map(elenco.map(c => [Number(c.id), c]));
  const perNome = new Map(elenco.map(c => [nomeCompatto(c.title), c]));
  const out = new Map();
  for (const s of ((regole && regole.sorgenti) || [])) {
    let c = null;
    if (s.filtroId === 0) c = null;
    else if (s.filtroId) c = perId.get(Number(s.filtroId)) || null;
    else c = perNome.get(nomeCompatto(s.titolo)) || null;
    out.set(Number(s.id), c ? { id: Number(c.id), titolo: c.title || '' } : null);
  }
  return out;
}

/**
 * Punti che dovrebbero stare nella generale (categoria completa + filtro della loro mappa) e non ci stanno del tutto.
 * @param punti  elementi di cms_list_maps (con sections[].categories[])
 * @param regole schedaComune.mappaGenerale
 * @param filtri risultato di filtriSorgenti (facoltativo: senza, si aggiunge solo la categoria completa)
 * @returns [{ id, titolo, stato, sezioni:[titoli sorgente], categorie:[ids attuali], aggiunte:[titoli], nuoveCategorie:[ids] }]
 */
function puntiDaAllineare(punti, regole, filtri) {
  const catGen = Number(regole && regole.categoriaId);
  const sorgenti = new Map(((regole && regole.sorgenti) || []).map(s => [Number(s.id), s.titolo || '']));
  if (!catGen || !sorgenti.size) return [];
  const titoloGen = (regole && regole.titolo) || 'mappa generale';
  const out = [];
  for (const p of punti || []) {
    if (!p || !p.id) continue;
    const sezioni = sezioniDelPunto(p).filter(id => sorgenti.has(id));
    if (!sezioni.length) continue;
    const categorie = categorieDelPunto(p);
    const mancanti = [];
    if (!categorie.includes(catGen)) mancanti.push({ id: catGen, titolo: titoloGen });
    for (const sid of sezioni) {
      const f = filtri && filtri.get(sid);
      if (f && !categorie.includes(f.id) && !mancanti.some(m => m.id === f.id)) mancanti.push(f);
    }
    if (!mancanti.length) continue;
    out.push({
      id: Number(p.id),
      titolo: String(p.title || '').trim() || '(senza titolo)',
      stato: p.status || '',
      sezioni: sezioni.map(id => sorgenti.get(id) || String(id)),
      categorie,
      aggiunte: mancanti.map(m => m.titolo),
      nuoveCategorie: categorie.concat(mancanti.map(m => m.id))
    });
  }
  return out.sort((a, b) => a.sezioni[0].localeCompare(b.sezioni[0], 'it') || a.titolo.localeCompare(b.titolo, 'it'));
}

module.exports = { ESCLUSE_DI_DEFAULT, nomeCompatto, filtriSorgenti, puntiDaAllineare, categorieDelPunto };

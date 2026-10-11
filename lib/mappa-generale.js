/**
 * Allineatore della MAPPA GENERALE (calcolo puro, nessuna chiamata di rete).
 *
 * In molte app la "Mappa" generale è una normale sezione mappa: un punto ci compare solo se,
 * oltre alla sua mappa (Visit, Utilità, Food & Drink…), ha spuntata anche la categoria della generale.
 * Regole nel doc `app/{id}.schedaComune.mappaGenerale`:
 *   { attiva, sezioneId, categoriaId, titolo, sorgenti: [{ id, titolo }] }
 * - categoriaId = la categoria della generale da aggiungere ai punti
 * - sorgenti    = le sezioni mappa che vi confluiscono (le altre, es. Aree di emergenza, restano fuori)
 * Si AGGIUNGE soltanto la categoria della generale: le categorie già presenti non si toccano mai.
 */

// Mappe che di regola NON vanno nella generale (proposte non spuntate, restano modificabili a mano)
const ESCLUSE_DI_DEFAULT = /emergenz|protezione civile|aree di (attesa|ricovero|ammassamento)|piano comunale|centro operativo|c\.o\.c\b/i;

function categorieDelPunto(p) {
  const ids = [];
  for (const s of (p.sections || [])) for (const c of (s.categories || [])) if (c.id && !ids.includes(Number(c.id))) ids.push(Number(c.id));
  return ids;
}

function sezioniDelPunto(p) {
  return (p.sections || []).map(s => Number(s.id)).filter(Boolean);
}

/**
 * Punti che dovrebbero stare nella generale e non ci sono.
 * @param punti  elementi di cms_list_maps (con sections[].categories[])
 * @param regole schedaComune.mappaGenerale
 * @returns [{ id, titolo, stato, sezioni:[titoli sorgente], categorie:[ids attuali], nuoveCategorie:[ids] }]
 */
function puntiDaAllineare(punti, regole) {
  const catGen = Number(regole && regole.categoriaId);
  const sorgenti = new Map(((regole && regole.sorgenti) || []).map(s => [Number(s.id), s.titolo || '']));
  if (!catGen || !sorgenti.size) return [];
  const out = [];
  for (const p of punti || []) {
    if (!p || !p.id) continue;
    const categorie = categorieDelPunto(p);
    if (categorie.includes(catGen)) continue;
    const sezioni = sezioniDelPunto(p).filter(id => sorgenti.has(id));
    if (!sezioni.length) continue;
    out.push({
      id: Number(p.id),
      titolo: String(p.title || '').trim() || '(senza titolo)',
      stato: p.status || '',
      sezioni: sezioni.map(id => sorgenti.get(id) || String(id)),
      categorie,
      nuoveCategorie: categorie.concat(catGen)
    });
  }
  return out.sort((a, b) => a.sezioni[0].localeCompare(b.sezioni[0], 'it') || a.titolo.localeCompare(b.titolo, 'it'));
}

module.exports = { ESCLUSE_DI_DEFAULT, puntiDaAllineare, categorieDelPunto };

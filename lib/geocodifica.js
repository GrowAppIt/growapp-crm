/**
 * Trova le coordinate di un indirizzo (OpenStreetMap Nominatim, gratuito).
 * Regole d'uso Nominatim: User-Agent identificativo, al massimo ~1 richiesta al secondo.
 * Ritorna fino a 3 candidati { lat, lon, indirizzo, tipo, verifica } (verifica = link per controllare sulla mappa).
 */

let ultimaChiamata = 0;

async function trovaCoordinate(indirizzo, comune) {
  const q = [indirizzo, comune].filter(Boolean).join(', ');
  if (!q.trim()) return { errore: 'Indirizzo mancante.' };
  const attesa = 1100 - (Date.now() - ultimaChiamata);
  if (attesa > 0) await new Promise(r => setTimeout(r, attesa));
  ultimaChiamata = Date.now();
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&addressdetails=0&countrycodes=it&accept-language=it&q=' + encodeURIComponent(q);
  const r = await fetch(url, { headers: { 'User-Agent': 'CRM-Comune.Digital/1.0 (crm.comune.digital; GrowApp S.r.l.)', 'Accept': 'application/json' } });
  if (!r.ok) return { errore: 'Servizio coordinate non disponibile (HTTP ' + r.status + '). Chiedi all\'operatore le coordinate o un link di Google Maps.' };
  const lista = await r.json().catch(() => []);
  if (!Array.isArray(lista) || !lista.length) return { errore: 'Nessun risultato per "' + q + '". Prova con un indirizzo più preciso o chiedi all\'operatore le coordinate.' };
  return {
    candidati: lista.map(x => {
      const lat = Number(Number(x.lat).toFixed(7)), lon = Number(Number(x.lon).toFixed(7));
      return { lat, lon, indirizzo: x.display_name, tipo: [x.category, x.type].filter(Boolean).join('/'),
        verifica: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}` };
    })
  };
}

module.exports = { trovaCoordinate };

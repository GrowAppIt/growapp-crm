/**
 * Calendari ricorrenti (es. raccolta differenziata) — calcolo PURO delle date, senza rete.
 *
 * Regole (salvate nel doc `app/{id}.schedaComune.differenziata`):
 * {
 *   attiva: true,
 *   orarioNotifica: '20:00',      // ora del promemoria (= ora di INIZIO dell'evento su GoodBarber)
 *   giorniPrima: 1,               // 1 = la sera prima della raccolta, 0 = il giorno stesso
 *   orarioFine: '23:59',          // ora di FINE dell'evento (stesso giorno del promemoria)
 *   testo: 'lasciare il mastello…',
 *   saltaFestivi: true,           // non creare avvisi per raccolte che cadono in un festivo
 *   festivitaLocali: ['06-07'],   // MM-GG (es. patrono), sempre saltate se saltaFestivi
 *   eccezioni: [{ data: '2026-12-26', azione: 'includi' | 'salta' }],  // data = giorno di RACCOLTA
 *   zone: [{
 *     nome: 'Zona A', suffissoTitolo: '', categoriaId: 7902788,
 *     raccolte: [{ giorno: 2, titolo: 'Domattina esponi la plastica', immagine: 'https://…',
 *                  frequenza: 'settimanale' | 'quindicinale' | 'mensile',
 *                  dataRiferimento: '2026-01-06',   // per quindicinale: una data di raccolta valida
 *                  settimanaDelMese: 1 }]          // per mensile: 1..4 o 5 = ultima
 *   }]
 * }
 * giorno: 0 = domenica, 1 = lunedì … 6 = sabato (giorno di RACCOLTA).
 */

const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fromIso = s => { const [y, m, g] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, g)); };
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

// Pasqua (algoritmo di Meeus/Jones/Butcher), calendario gregoriano
function pasqua(anno) {
  const a = anno % 19, b = Math.floor(anno / 100), c = anno % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31), giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(anno, mese - 1, giorno));
}

// Festività nazionali italiane di un anno → Map 'AAAA-MM-GG' → nome
function festiviNazionali(anno) {
  const f = new Map([
    [`${anno}-01-01`, 'Capodanno'], [`${anno}-01-06`, 'Epifania'], [`${anno}-04-25`, 'Festa della Liberazione'],
    [`${anno}-05-01`, 'Festa dei Lavoratori'], [`${anno}-06-02`, 'Festa della Repubblica'], [`${anno}-08-15`, 'Ferragosto'],
    [`${anno}-11-01`, 'Ognissanti'], [`${anno}-12-08`, 'Immacolata'], [`${anno}-12-25`, 'Natale'], [`${anno}-12-26`, 'Santo Stefano']
  ]);
  const p = pasqua(anno);
  f.set(iso(p), 'Pasqua');
  f.set(iso(addDays(p, 1)), 'Lunedì dell\'Angelo');
  return f;
}

function festivoDi(dataIso, festivitaLocali) {
  const anno = Number(dataIso.slice(0, 4));
  const naz = festiviNazionali(anno).get(dataIso);
  if (naz) return naz;
  if ((festivitaLocali || []).includes(dataIso.slice(5))) return 'Festività locale';
  return null;
}

function cadeNellaRaccolta(r, d) {
  if (d.getUTCDay() !== Number(r.giorno)) return false;
  const freq = r.frequenza || 'settimanale';
  if (freq === 'settimanale') return true;
  if (freq === 'quindicinale') {
    if (!r.dataRiferimento) return false;
    const diff = Math.round((d - fromIso(r.dataRiferimento)) / 86400000);
    return ((diff % 14) + 14) % 14 === 0;
  }
  if (freq === 'mensile') {
    const n = Number(r.settimanaDelMese || 1);
    const settimana = Math.floor((d.getUTCDate() - 1) / 7) + 1;
    if (n === 5) return addDays(d, 7).getUTCMonth() !== d.getUTCMonth(); // ultima del mese
    return settimana === n;
  }
  return false;
}

// Offset del fuso Europe/Rome per una data/ora locale ('+01:00' o '+02:00')
function offsetRoma(dataIso, ora) {
  const [h, m] = ora.split(':').map(Number);
  const utc = Date.UTC(...dataIso.split('-').map((x, i) => i === 1 ? Number(x) - 1 : Number(x)), h, m);
  const parti = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(utc));
  const hh = Number(parti.find(p => p.type === 'hour').value);
  const diff = ((hh - h) % 24 + 24) % 24; // ore di differenza tra Roma e UTC
  return diff === 2 ? '+02:00' : '+01:00';
}

/**
 * Genera gli avvisi tra due date di RACCOLTA (incluse).
 * @returns {{ avvisi: Array, saltati: Array }}
 *   avviso: { dataRaccolta, zona, titolo, categoriaId, immagine, testo, sortDate, endDate }
 *   saltato: { dataRaccolta, zona, titolo, motivo }
 */
function generaAvvisi(regole, dal, al) {
  const avvisi = [], saltati = [];
  if (!regole || regole.attiva === false) return { avvisi, saltati };
  const ora = regole.orarioNotifica || '20:00';
  const oraFine = regole.orarioFine || '23:59';
  const prima = Number.isFinite(Number(regole.giorniPrima)) ? Number(regole.giorniPrima) : 1;
  const eccezioni = new Map((regole.eccezioni || []).map(e => [e.data, e.azione]));
  const inizio = fromIso(dal), fine = fromIso(al);
  if (fine < inizio) return { avvisi, saltati };
  if ((fine - inizio) / 86400000 > 400) throw new Error('Intervallo troppo lungo: massimo circa un anno.');

  for (let d = inizio; d <= fine; d = addDays(d, 1)) {
    const dataRaccolta = iso(d);
    for (const zona of (regole.zone || [])) {
      for (const r of (zona.raccolte || [])) {
        if (!cadeNellaRaccolta(r, d)) continue;
        const titolo = (r.titolo || '').trim() + (zona.suffissoTitolo ? ' ' + zona.suffissoTitolo.trim() : '');
        const ecc = eccezioni.get(dataRaccolta);
        const festa = festivoDi(dataRaccolta, regole.festivitaLocali);
        if (ecc === 'salta') { saltati.push({ dataRaccolta, zona: zona.nome || '', titolo, motivo: 'Eccezione: saltare' }); continue; }
        if (festa && regole.saltaFestivi !== false && ecc !== 'includi') { saltati.push({ dataRaccolta, zona: zona.nome || '', titolo, motivo: festa }); continue; }
        const giornoAvviso = iso(addDays(d, -prima));
        avvisi.push({
          dataRaccolta, zona: zona.nome || '', titolo,
          categoriaId: Number(zona.categoriaId), immagine: r.immagine || '', testo: regole.testo || '',
          sortDate: `${giornoAvviso}T${ora}:00${offsetRoma(giornoAvviso, ora)}`,
          endDate: `${giornoAvviso}T${oraFine}:00${offsetRoma(giornoAvviso, oraFine)}`
        });
      }
    }
  }
  return { avvisi, saltati };
}

/**
 * Ricava le regole della differenziata dagli avvisi GIÀ presenti in una sezione Agenda.
 * items: eventi GoodBarber ({ title, sortDate, endDate, status, summary, images }).
 * Ritorna { differenziata, riepilogo:[...righe leggibili] } oppure { errore }.
 */
function proponiRegole(items, categoriaId) {
  const ora = s => String(s || '').slice(11, 16);
  const giornoIso = s => String(s || '').slice(0, 10);
  const conta = arr => arr.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {});
  const piuFrequente = obj => Object.entries(obj).sort((a, b) => b[1] - a[1])[0];
  // Si guarda solo il calendario IN USO: le ultime 14 settimane a partire dall'avviso più recente
  // (compresi quelli futuri già preparati). Così i calendari vecchi, cambiati nel tempo, non si mescolano.
  const conData = (items || []).filter(it => it && it.title && it.sortDate);
  const ultimo = conData.map(it => giornoIso(it.sortDate)).sort().pop();
  if (!ultimo) return { errore: 'Nessun avviso in questa sezione.' };
  const limite = iso(addDays(fromIso(ultimo), -98));
  const validi = conData.filter(it => giornoIso(it.sortDate) >= limite);
  if (validi.length < 6) return { errore: 'Troppo pochi avvisi recenti in questa sezione per ricavare le regole (servono almeno 6).' };

  // Promemoria la sera prima o il giorno stesso? Dall'ora più frequente e dai titoli ("Domattina…", "Domani…")
  const oraTop = piuFrequente(conta(validi.map(it => ora(it.sortDate))))[0];
  const titoliDomani = validi.filter(it => /^(domattina|domani|stasera)/i.test(it.title.trim())).length;
  const giorniPrima = (titoliDomani > validi.length / 2 || Number(oraTop.slice(0, 2)) >= 16) ? 1 : 0;
  const oraFineTop = piuFrequente(conta(validi.filter(it => it.endDate).map(it => ora(it.endDate))) || {}) || ['23:59'];

  const perTitolo = {};
  for (const it of validi) {
    const t = it.title.trim();
    const dRacc = addDays(fromIso(giornoIso(it.sortDate)), giorniPrima);
    (perTitolo[t] = perTitolo[t] || []).push({ it, dRacc });
  }

  const raccolte = [], riepilogo = [];
  for (const [titolo, lista] of Object.entries(perTitolo)) {
    if (lista.length < 3) continue; // avvisi sporadici (es. straordinari): non sono una regola
    const perGiorno = conta(lista.map(x => x.dRacc.getUTCDay()));
    const max = Math.max(...Object.values(perGiorno));
    const immagine = ((lista.find(x => x.it.images && x.it.images[0]) || {}).it || { images: [{ url: '' }] }).images[0].url.split('?')[0];
    for (const [g, n] of Object.entries(perGiorno)) {
      if (n < Math.max(3, max * 0.25)) continue;
      const date = lista.filter(x => x.dRacc.getUTCDay() === Number(g)).map(x => x.dRacc.getTime()).sort((a, b) => a - b);
      const salti = []; for (let i = 1; i < date.length; i++) salti.push(Math.round((date[i] - date[i - 1]) / 86400000));
      const saltoTipico = Number((piuFrequente(conta(salti)) || ['7'])[0]);
      const r = { giorno: Number(g), titolo, immagine, frequenza: 'settimanale' };
      if (saltoTipico === 14) { r.frequenza = 'quindicinale'; r.dataRiferimento = iso(new Date(date[date.length - 1])); }
      else if (saltoTipico >= 28) { r.frequenza = 'mensile'; const ult = new Date(date[date.length - 1]); r.settimanaDelMese = Math.min(4, Math.floor((ult.getUTCDate() - 1) / 7) + 1); }
      raccolte.push(Object.assign(r, { _n: n }));
    }
  }
  if (!raccolte.length) return { errore: 'Non ho trovato avvisi che si ripetono con regolarità in questa sezione.' };
  raccolte.sort((a, b) => ((a.giorno + 6) % 7) - ((b.giorno + 6) % 7) || a.titolo.localeCompare(b.titolo));
  const GG = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  for (const r of raccolte) {
    riepilogo.push(`${GG[r.giorno]}: "${r.titolo}" (${r.frequenza === 'settimanale' ? 'ogni settimana' : r.frequenza === 'quindicinale' ? 'ogni 2 settimane' : 'una volta al mese'}, ${r._n} avvisi trovati)`);
    delete r._n;
  }

  const testoTop = piuFrequente(conta(validi.map(it => String(it.summary || '').trim()).filter(Boolean))) || [''];
  const statoTop = piuFrequente(conta(validi.filter(it => giornoIso(it.sortDate) >= iso(new Date())).map(it => it.status))) || ['draft'];
  return {
    differenziata: {
      attiva: true, orarioNotifica: oraTop, giorniPrima, orarioFine: oraFineTop[0], testo: testoTop[0],
      stato: statoTop[0] === 'published' ? 'published' : 'draft', saltaFestivi: true, festivitaLocali: [], eccezioni: [],
      zone: [{ nome: 'Tutto il Comune', suffissoTitolo: '', categoriaId: Number(categoriaId), raccolte }]
    },
    riepilogo: [`Promemoria ${giorniPrima ? 'la sera prima' : 'il giorno stesso'} alle ${oraTop}, ${validi.length} avvisi analizzati.`].concat(riepilogo)
  };
}

module.exports = { generaAvvisi, proponiRegole, festiviNazionali, pasqua, offsetRoma };

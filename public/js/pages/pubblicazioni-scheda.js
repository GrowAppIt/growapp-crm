/**
 * Pubblicazioni sulle app — Scheda del Comune e Calendario della differenziata (v10.6.0)
 *
 * - Scheda Comune: regole fisse dell'app (lette dall'assistente) + regole della raccolta
 *   differenziata (zone, giorni, materiali, immagini, frequenze, festivi, eccezioni).
 *   Salvata nel doc Firestore `app/{id}.schedaComune`.
 * - Calendario: anteprima calcolata dal server (/api/calendario-ricorrente) e creazione
 *   a blocchi degli avvisi su GoodBarber, senza doppioni.
 * - Mappa generale (v10.7.0): quale sezione mappa raccoglie i punti delle altre e quali mappe
 *   vi confluiscono; l'allineatore aggiunge la categoria della generale ai punti che mancano.
 *   v10.7.5: anche il FILTRO della generale dedicato a ogni mappa (es. "Food&Drink"), trovato per nome.
 */
const PubScheda = {
  ESCLUSE_MAPPA: /emergenz|protezione civile|aree di (attesa|ricovero|ammassamento)|piano comunale|centro operativo|c\.o\.c\b/i,
  GIORNI: ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'],
  _sezioni: null,
  _scheda: null,
  _anteprima: null,

  esc(v) { return PubblicazioniApp.escapeHtml(v); },

  async _api(payload) {
    const headers = { 'Content-Type': 'application/json' };
    const u = firebase.auth().currentUser;
    if (u) headers['Authorization'] = 'Bearer ' + await u.getIdToken();
    const r = await fetch('/api/calendario-ricorrente', { method: 'POST', headers, body: JSON.stringify(payload) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || ('Errore ' + r.status));
    return d;
  },

  _modale(titolo, corpo, piede) {
    this.chiudi();
    document.body.insertAdjacentHTML('beforeend', `
      <div class="psc-overlay" id="pscOverlay">
        <div class="psc-modal">
          <div class="psc-head"><div>${titolo}</div><button class="psc-x" onclick="PubScheda.chiudi()" title="Chiudi"><i class="fas fa-times"></i></button></div>
          <div class="psc-body" id="pscBody">${corpo}</div>
          <div class="psc-foot" id="pscFoot">${piede || ''}</div>
        </div>
      </div>${this._stili()}`);
  },

  chiudi() { const o = document.getElementById('pscOverlay'); if (o) o.remove(); },

  // ---------------------------------------------------------------- SCHEDA COMUNE
  async apriScheda() {
    const app = PubblicazioniApp.currentApp;
    this._esitoProposta = '';
    const base = { regoleGenerali: '', differenziata: { attiva: false, orarioNotifica: '20:00', giorniPrima: 1, orarioFine: '23:59',
      testo: 'lasciare il mastello col rifiuto del giorno al mattino dalle ore 6.00 alle ore 8.30', stato: 'draft',
      saltaFestivi: true, festivitaLocali: [], eccezioni: [], zone: [{ nome: 'Tutto il Comune', suffissoTitolo: '', categoriaId: null, raccolte: [] }] },
      mappaGenerale: { attiva: false, sezioneId: null, categoriaId: null, titolo: '', sorgenti: [] } };
    this._scheda = JSON.parse(JSON.stringify(Object.assign({}, base, app.schedaComune || {})));
    if (!this._scheda.differenziata) this._scheda.differenziata = base.differenziata;
    if (!Array.isArray(this._scheda.differenziata.zone) || !this._scheda.differenziata.zone.length) this._scheda.differenziata.zone = base.differenziata.zone;
    if (!this._scheda.mappaGenerale) this._scheda.mappaGenerale = base.mappaGenerale;
    this._modale(`<i class="fas fa-id-card"></i> Scheda del Comune — ${this.esc(app.nome)}`,
      '<div class="psc-loading"><i class="fas fa-spinner fa-spin"></i> Leggo le sezioni Agenda dell\'app…</div>',
      `<button class="btn btn-secondary" onclick="PubScheda.chiudi()">Annulla</button>
       <button class="btn btn-primary" onclick="PubScheda.salvaScheda()"><i class="fas fa-save"></i> Salva scheda</button>`);
    try {
      if (!this._sezioni || this._sezioni.appId !== app.id) {
        const r = await this._api({ azione: 'sezioni', appId: app.id });
        this._sezioni = { appId: app.id, elenco: r.sezioni || [], mappe: r.sezioniMappa || [] };
      }
    } catch (e) {
      this._sezioni = { appId: app.id, elenco: [], mappe: [], errore: e.message };
    }
    this._disegnaScheda();
  },

  _opzioniCategorie(sel) {
    const opz = ['<option value="">— scegli la sezione Agenda —</option>'];
    for (const s of (this._sezioni && this._sezioni.elenco) || []) {
      for (const c of (s.categories || [])) {
        if (!c.id) continue;
        const etichetta = s.title + (c.title && !/^(categoria principale|tutte le categorie)$/i.test(c.title) ? ' › ' + c.title : '');
        opz.push(`<option value="${c.id}" ${Number(sel) === Number(c.id) ? 'selected' : ''}>${this.esc(etichetta)}</option>`);
      }
    }
    return opz.join('');
  },

  _disegnaScheda() {
    const s = this._scheda, d = s.differenziata;
    const zone = d.zone.map((z, zi) => `
      <div class="psc-zona">
        <div class="psc-row">
          <label>Nome zona<input type="text" value="${this.esc(z.nome)}" oninput="PubScheda._scheda.differenziata.zone[${zi}].nome=this.value"></label>
          <label>Aggiunta al titolo <small>(es. "– Zona A", vuoto se non serve)</small><input type="text" value="${this.esc(z.suffissoTitolo || '')}" oninput="PubScheda._scheda.differenziata.zone[${zi}].suffissoTitolo=this.value"></label>
          <label>Sezione Agenda<select onchange="PubScheda._scheda.differenziata.zone[${zi}].categoriaId=Number(this.value)||null">${this._opzioniCategorie(z.categoriaId)}</select></label>
          ${d.zone.length > 1 ? `<button class="psc-del" title="Togli zona" onclick="PubScheda._scheda.differenziata.zone.splice(${zi},1);PubScheda._disegnaScheda()"><i class="fas fa-trash"></i></button>` : ''}
        </div>
        <table class="psc-tab">
          <thead><tr><th>Giorno di raccolta</th><th>Titolo dell'avviso</th><th>Immagine (indirizzo)</th><th>Frequenza</th><th></th></tr></thead>
          <tbody>${(z.raccolte || []).map((r, ri) => this._rigaRaccolta(zi, ri, r)).join('') || '<tr><td colspan="5" class="psc-muted">Nessuna raccolta: aggiungine una.</td></tr>'}</tbody>
        </table>
        <button class="btn btn-secondary psc-small" onclick="PubScheda._scheda.differenziata.zone[${zi}].raccolte.push({giorno:1,titolo:'Domattina esponi ',immagine:'',frequenza:'settimanale'});PubScheda._disegnaScheda()"><i class="fas fa-plus"></i> Aggiungi raccolta</button>
      </div>`).join('');

    document.getElementById('pscBody').innerHTML = `
      ${this._sezioni && this._sezioni.errore ? `<div class="psc-warn"><i class="fas fa-exclamation-triangle"></i> Non riesco a leggere le sezioni dell'app: ${this.esc(this._sezioni.errore)}</div>` : ''}
      <h4><i class="fas fa-book"></i> Regole del Comune</h4>
      <p class="psc-muted">Indicazioni fisse che l'assistente segue sempre per questa app (sezioni da usare, abitudini, cose da evitare…).</p>
      <textarea rows="4" class="psc-area" oninput="PubScheda._scheda.regoleGenerali=this.value" placeholder="Es: gli eventi turistici vanno anche nella sezione Events in inglese; il Comune non vuole il prezzo nel titolo…">${this.esc(s.regoleGenerali || '')}</textarea>

      <h4><i class="fas fa-recycle"></i> Raccolta differenziata</h4>
      <label class="psc-check"><input type="checkbox" ${d.attiva ? 'checked' : ''} onchange="PubScheda._scheda.differenziata.attiva=this.checked;PubScheda._disegnaScheda()"> Questo Comune ha gli avvisi della differenziata nell'app</label>
      <div class="psc-proponi">
        <button class="btn btn-secondary psc-small" id="pscProponiBtn" onclick="PubScheda.proponi()"><i class="fas fa-magic"></i> Proponi le regole dagli avvisi già presenti</button>
        <span class="psc-muted">Legge gli avvisi della differenziata già nell'app e compila giorni, titoli, immagini e orari. Poi controlla e salva.</span>
      </div>
      <div id="pscProponiEsito">${this._esitoProposta || ''}</div>
      ${d.attiva ? `
        <div class="psc-row">
          <label>Promemoria<select onchange="PubScheda._scheda.differenziata.giorniPrima=Number(this.value)">
            <option value="1" ${Number(d.giorniPrima) === 1 ? 'selected' : ''}>la sera prima</option>
            <option value="0" ${Number(d.giorniPrima) === 0 ? 'selected' : ''}>il giorno stesso</option></select></label>
          <label>Ora del promemoria<input type="time" value="${this.esc(d.orarioNotifica)}" oninput="PubScheda._scheda.differenziata.orarioNotifica=this.value"></label>
          <label>Ora di fine avviso<input type="time" value="${this.esc(d.orarioFine || '23:59')}" oninput="PubScheda._scheda.differenziata.orarioFine=this.value"></label>
          <label>Gli avvisi si creano<select onchange="PubScheda._scheda.differenziata.stato=this.value">
            <option value="draft" ${d.stato !== 'published' ? 'selected' : ''}>in bozza</option>
            <option value="published" ${d.stato === 'published' ? 'selected' : ''}>già pubblicati</option></select></label>
        </div>
        <label>Testo dell'avviso<input type="text" value="${this.esc(d.testo)}" oninput="PubScheda._scheda.differenziata.testo=this.value"></label>
        <div class="psc-row">
          <label class="psc-check"><input type="checkbox" ${d.saltaFestivi !== false ? 'checked' : ''} onchange="PubScheda._scheda.differenziata.saltaFestivi=this.checked"> Nei giorni festivi niente raccolta (salta l'avviso)</label>
        </div>
        <div class="psc-row">
          <label>Festività locali <small>(giorno/mese, separati da virgola — es. patrono: 6/8)</small>
            <input type="text" value="${this.esc((d.festivitaLocali || []).map(x => { const [m, g] = x.split('-'); return Number(g) + '/' + Number(m); }).join(', '))}"
              onchange="PubScheda._festeLocali(this.value)"></label>
          <label>Eccezioni <small>(una per riga: data di raccolta + "salta" o "includi" — es. 26/12/2026 includi)</small>
            <textarea rows="2" class="psc-area" onchange="PubScheda._eccezioni(this.value)">${this.esc((d.eccezioni || []).map(e => { const [y, m, g] = e.data.split('-'); return `${Number(g)}/${Number(m)}/${y} ${e.azione}`; }).join('\n'))}</textarea></label>
        </div>
        <p class="psc-muted">Festivi nazionali già inclusi in automatico: Capodanno, Epifania, Pasqua e Pasquetta, 25 aprile, 1° maggio, 2 giugno, Ferragosto, Ognissanti, Immacolata, Natale, Santo Stefano.</p>
        ${zone}
        <button class="btn btn-secondary psc-small" onclick="PubScheda._scheda.differenziata.zone.push({nome:'Zona '+String.fromCharCode(65+PubScheda._scheda.differenziata.zone.length),suffissoTitolo:'',categoriaId:null,raccolte:[]});PubScheda._disegnaScheda()"><i class="fas fa-plus"></i> Aggiungi zona</button>
      ` : ''}
      ${this._bloccoMappaGenerale()}`;
  },

  // ---------------------------------------------------------------- MAPPA GENERALE (scheda)
  _bloccoMappaGenerale() {
    const mg = this._scheda.mappaGenerale;
    const mappe = (this._sezioni && this._sezioni.mappe) || [];
    let corpo = '';
    if (mg.attiva) {
      if (!mappe.length) {
        corpo = `<div class="psc-warn"><i class="fas fa-info-circle"></i> Non trovo sezioni mappa in questa app.</div>`;
      } else {
        const opz = ['<option value="">— scegli la mappa generale —</option>'];
        for (const s of mappe) for (const c of (s.categories || [])) {
          if (!c.id) continue;
          const et = s.title + (c.title && !/^(categoria principale|tutte le categorie)$/i.test(c.title) ? ' › ' + c.title : '');
          opz.push(`<option value="${s.id}|${c.id}" ${Number(mg.categoriaId) === Number(c.id) ? 'selected' : ''}>${this.esc(et)}</option>`);
        }
        const sorg = new Map((mg.sorgenti || []).map(x => [Number(x.id), x]));
        const altre = mappe.filter(s => Number(s.id) !== Number(mg.sezioneId));
        const filtri = this._categorieFiltro();
        const selFiltro = s => {
          const x = sorg.get(Number(s.id));
          if (!x || !filtri.length) return '';
          const scelto = this._filtroDi(x);
          return `<select class="psc-filtro" title="Filtro della mappa generale per i punti di ${this.esc(s.title)}" onchange="PubScheda._filtroSorgente(${Number(s.id)}, this.value)">
            <option value="0" ${!scelto ? 'selected' : ''}>— nessun filtro —</option>
            ${filtri.map(c => `<option value="${Number(c.id)}" ${scelto === Number(c.id) ? 'selected' : ''}>filtro: ${this.esc(c.title)}</option>`).join('')}
          </select>`;
        };
        corpo = `
          <label>Mappa generale <small>(la sezione e la categoria completa da spuntare su tutti i punti, es. TUTTO)</small>
            <select onchange="PubScheda._sceltaGenerale(this.value)">${opz.join('')}</select></label>
          ${mg.categoriaId ? `
            <div class="psc-label">Mappe che confluiscono nella generale${filtri.length ? ' <small>(e il filtro della generale in cui finiscono i loro punti)</small>' : ''}</div>
            <div class="psc-checks">${altre.map(s => `
              <div class="psc-sorg"><label class="psc-check"><input type="checkbox" ${sorg.has(Number(s.id)) ? 'checked' : ''} onchange="PubScheda._sorgente(${Number(s.id)}, this.checked)"> ${this.esc(s.title)}</label>${selFiltro(s)}</div>`).join('')}
            </div>
            <p class="psc-muted">Il filtro viene proposto da solo quando ha lo stesso nome della mappa. Le mappe di emergenza e protezione civile sono lasciate fuori in automatico: spuntale solo se servono davvero.</p>` : ''}`;
      }
    }
    return `
      <h4><i class="fas fa-map-marked-alt"></i> Mappa generale</h4>
      <label class="psc-check"><input type="checkbox" ${mg.attiva ? 'checked' : ''} onchange="PubScheda._attivaGenerale(this.checked)"> Questa app ha una mappa generale che raccoglie i punti delle altre mappe</label>
      ${corpo}`;
  },

  _attivaGenerale(on) {
    const mg = this._scheda.mappaGenerale;
    mg.attiva = on;
    if (on && !mg.categoriaId) {
      // Proposta: la sezione che si chiama "Mappa" (o "Mappa generale"), con la sua prima categoria
      const s = ((this._sezioni && this._sezioni.mappe) || []).find(x => /^mappa( generale)?$/i.test(String(x.title || '').trim()));
      const c = s && (s.categories || [])[0];
      if (c) this._sceltaGenerale(s.id + '|' + c.id, true);
    }
    this._disegnaScheda();
  },

  _sceltaGenerale(v, senzaRidisegno) {
    const mg = this._scheda.mappaGenerale;
    const [sid, cid] = String(v || '').split('|').map(Number);
    const mappe = (this._sezioni && this._sezioni.mappe) || [];
    const s = mappe.find(x => Number(x.id) === sid);
    const primaVolta = !mg.categoriaId;
    mg.sezioneId = sid || null;
    mg.categoriaId = cid || null;
    mg.titolo = s ? s.title : '';
    if (primaVolta && s) {
      mg.sorgenti = mappe.filter(x => Number(x.id) !== sid && !this.ESCLUSE_MAPPA.test(x.title || '')).map(x => ({ id: Number(x.id), titolo: x.title }));
    }
    mg.sorgenti = (mg.sorgenti || []).filter(x => Number(x.id) !== sid);
    if (!senzaRidisegno) this._disegnaScheda();
  },

  _sorgente(id, on) {
    const mg = this._scheda.mappaGenerale;
    mg.sorgenti = (mg.sorgenti || []).filter(x => Number(x.id) !== id);
    if (on) {
      const s = ((this._sezioni && this._sezioni.mappe) || []).find(x => Number(x.id) === id);
      mg.sorgenti.push({ id, titolo: s ? s.title : String(id) });
    }
    // Ridisegno (compare/sparisce la scelta del filtro) restando nello stesso punto della scheda
    const body = document.getElementById('pscBody'); const y = body ? body.scrollTop : 0;
    this._disegnaScheda();
    if (body) body.scrollTop = y;
  },

  // Categorie-filtro della sezione generale (tutte tranne quella completa, es. TUTTO)
  _categorieFiltro() {
    const mg = this._scheda.mappaGenerale;
    const s = ((this._sezioni && this._sezioni.mappe) || []).find(x => Number(x.id) === Number(mg.sezioneId));
    return ((s && s.categories) || []).filter(c => c.id && Number(c.id) !== Number(mg.categoriaId));
  },

  // Filtro di una sorgente: quello scelto (0 = nessuno) oppure, se mai scelto, quello con lo stesso nome
  _filtroDi(sorgente) {
    const filtri = this._categorieFiltro();
    if (sorgente.filtroId === 0) return 0;
    if (sorgente.filtroId) return filtri.some(c => Number(c.id) === Number(sorgente.filtroId)) ? Number(sorgente.filtroId) : 0;
    const k = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const c = filtri.find(x => k(x.title) === k(sorgente.titolo));
    return c ? Number(c.id) : 0;
  },

  _filtroSorgente(id, v) {
    const x = (this._scheda.mappaGenerale.sorgenti || []).find(s => Number(s.id) === id);
    if (x) x.filtroId = Number(v) || 0;
  },

  async proponi() {
    const btn = document.getElementById('pscProponiBtn');
    const z0 = (this._scheda.differenziata.zone || [])[0] || {};
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Leggo gli avvisi… (fino a un minuto)'; }
    try {
      const r = await this._api({ azione: 'proponi', appId: PubblicazioniApp.currentApp.id, categoriaId: z0.categoriaId || null });
      if (r.daScegliere || r.errore) {
        this._esitoProposta = `<div class="psc-warn"><i class="fas fa-info-circle"></i> ${this.esc(r.messaggio || r.errore)}</div>`;
        this._scheda.differenziata.attiva = true;
      } else {
        const regoleLibere = this._scheda.regoleGenerali;
        this._scheda.differenziata = r.differenziata;
        this._scheda.regoleGenerali = regoleLibere;
        this._esitoProposta = `<div class="psc-ok"><strong><i class="fas fa-check-circle"></i> Regole proposte dagli avvisi esistenti — controllale e poi clicca "Salva scheda":</strong>
          <ul>${r.riepilogo.map(x => `<li>${this.esc(x)}</li>`).join('')}</ul>
          <span class="psc-muted">Festività locali (es. patrono) ed eccezioni non si possono ricavare: aggiungile tu se servono.</span></div>`;
      }
    } catch (e) {
      this._esitoProposta = `<div class="psc-warn"><i class="fas fa-exclamation-triangle"></i> ${this.esc(e.message)}</div>`;
    }
    this._disegnaScheda();
  },

  _rigaRaccolta(zi, ri, r) {
    const p = `PubScheda._scheda.differenziata.zone[${zi}].raccolte[${ri}]`;
    const freq = r.frequenza || 'settimanale';
    return `<tr>
      <td><select onchange="${p}.giorno=Number(this.value)">${this.GIORNI.map((g, i) => `<option value="${i}" ${Number(r.giorno) === i ? 'selected' : ''}>${g}</option>`).join('')}</select></td>
      <td><input type="text" value="${this.esc(r.titolo)}" oninput="${p}.titolo=this.value"></td>
      <td class="psc-img"><input type="url" value="${this.esc(r.immagine || '')}" placeholder="https://…" oninput="${p}.immagine=this.value">
        ${r.immagine ? `<img src="${this.esc(r.immagine)}" alt="">` : ''}</td>
      <td><select onchange="${p}.frequenza=this.value;PubScheda._disegnaScheda()">
          <option value="settimanale" ${freq === 'settimanale' ? 'selected' : ''}>ogni settimana</option>
          <option value="quindicinale" ${freq === 'quindicinale' ? 'selected' : ''}>ogni 2 settimane</option>
          <option value="mensile" ${freq === 'mensile' ? 'selected' : ''}>una volta al mese</option></select>
        ${freq === 'quindicinale' ? `<label class="psc-mini">una data di raccolta valida<input type="date" value="${this.esc(r.dataRiferimento || '')}" onchange="${p}.dataRiferimento=this.value"></label>` : ''}
        ${freq === 'mensile' ? `<select class="psc-mini" onchange="${p}.settimanaDelMese=Number(this.value)">${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${Number(r.settimanaDelMese || 1) === n ? 'selected' : ''}>${n === 5 ? 'ultima' : n + 'ª'} settimana del mese</option>`).join('')}</select>` : ''}
      </td>
      <td><button class="psc-del" title="Togli" onclick="PubScheda._scheda.differenziata.zone[${zi}].raccolte.splice(${ri},1);PubScheda._disegnaScheda()"><i class="fas fa-trash"></i></button></td>
    </tr>`;
  },

  _festeLocali(v) {
    this._scheda.differenziata.festivitaLocali = String(v).split(',').map(x => x.trim()).filter(Boolean).map(x => {
      const m = x.match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})$/); return m ? String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0') : null;
    }).filter(Boolean);
  },

  _eccezioni(v) {
    this._scheda.differenziata.eccezioni = String(v).split('\n').map(x => x.trim()).filter(Boolean).map(x => {
      const m = x.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s+(salta|includi)$/i);
      return m ? { data: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, azione: m[4].toLowerCase() } : null;
    }).filter(Boolean);
  },

  async salvaScheda() {
    const s = this._scheda, d = s.differenziata;
    if (d.attiva) {
      for (const z of d.zone) {
        if (!z.categoriaId) { UI.showError('Scegli la sezione Agenda per la zona "' + (z.nome || '') + '".'); return; }
        for (const r of z.raccolte) {
          if (!String(r.titolo || '').trim()) { UI.showError('C\'è una raccolta senza titolo nella zona "' + (z.nome || '') + '".'); return; }
          if (r.frequenza === 'quindicinale' && !r.dataRiferimento) { UI.showError('Per "' + r.titolo + '" (ogni 2 settimane) serve una data di raccolta valida.'); return; }
        }
      }
    }
    const mg = s.mappaGenerale;
    if (mg && mg.attiva) {
      if (!mg.categoriaId) { UI.showError('Scegli qual è la mappa generale (o togli la spunta).'); return; }
      if (!(mg.sorgenti || []).length) { UI.showError('Spunta almeno una mappa che confluisce nella generale.'); return; }
      // Si salva il filtro proposto per nome, così lo legge anche l'assistente della chat
      if (this._sezioni && (this._sezioni.mappe || []).length) {
        for (const x of mg.sorgenti) { const f = this._filtroDi(x); if (f || x.filtroId === 0) x.filtroId = f; else delete x.filtroId; }
      }
    }
    try {
      s.aggiornataIl = new Date().toISOString();
      await db.collection('app').doc(PubblicazioniApp.currentApp.id).update({ schedaComune: s });
      PubblicazioniApp.currentApp.schedaComune = JSON.parse(JSON.stringify(s));
      UI.showSuccess('Scheda del Comune salvata.');
      this.chiudi();
    } catch (e) {
      UI.showError('Salvataggio non riuscito: ' + e.message);
    }
  },

  // ---------------------------------------------------------------- CALENDARIO
  apriCalendario() {
    const app = PubblicazioniApp.currentApp;
    const d = (app.schedaComune || {}).differenziata;
    if (!d || !d.attiva) {
      this._modale('<i class="fas fa-calendar-alt"></i> Calendario differenziata',
        `<p>Per questo Comune la differenziata non è ancora impostata.</p><p>Apri prima la <strong>Scheda Comune</strong>, attiva la differenziata e inserisci giorni, materiali e immagini.</p>`,
        `<button class="btn btn-primary" onclick="PubScheda.apriScheda()"><i class="fas fa-id-card"></i> Apri la Scheda Comune</button>`);
      return;
    }
    const oggi = new Date();
    const primo = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 1), ultimo = new Date(oggi.getFullYear(), oggi.getMonth() + 2, 0);
    const f = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    this._modale(`<i class="fas fa-calendar-alt"></i> Calendario differenziata — ${this.esc(app.nome)}`, `
      <p class="psc-muted">Scegli il periodo (date di <strong>raccolta</strong>). Il CRM calcola gli avvisi con le regole della scheda, ti mostra l'anteprima e crea solo quelli che mancano.</p>
      <div class="psc-row">
        <label>Dal<input type="date" id="pscDal" value="${f(primo)}"></label>
        <label>Al<input type="date" id="pscAl" value="${f(ultimo)}"></label>
        <button class="btn btn-primary psc-align" onclick="PubScheda.anteprima()"><i class="fas fa-eye"></i> Anteprima</button>
      </div>
      <div id="pscRisultato"></div>`,
      `<button class="btn btn-secondary" onclick="PubScheda.chiudi()">Chiudi</button>`);
  },

  async anteprima() {
    const dal = document.getElementById('pscDal').value, al = document.getElementById('pscAl').value;
    const box = document.getElementById('pscRisultato');
    box.innerHTML = '<div class="psc-loading"><i class="fas fa-spinner fa-spin"></i> Calcolo il calendario e controllo gli avvisi già presenti nell\'app… (può richiedere qualche secondo)</div>';
    document.getElementById('pscFoot').innerHTML = `<button class="btn btn-secondary" onclick="PubScheda.chiudi()">Chiudi</button>`;
    try {
      const r = await this._api({ azione: 'anteprima', appId: PubblicazioniApp.currentApp.id, dal, al });
      this._anteprima = Object.assign({ dal, al }, r);
      const nuovi = r.avvisi.filter(a => !a.giaPresente);
      const quando = a => { const d = new Date(a.sortDate); return d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }) + ' ore ' + a.sortDate.slice(11, 16); };
      const dataR = s => new Date(s + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      box.innerHTML = `
        <div class="psc-sommario">
          <span class="psc-pill psc-verde">${nuovi.length} da creare</span>
          <span class="psc-pill">${r.avvisi.length - nuovi.length} già presenti</span>
          <span class="psc-pill psc-giallo">${r.saltati.length} saltati per festività/eccezioni</span>
        </div>
        ${r.saltati.length ? `<details class="psc-det"><summary>Giorni saltati</summary><ul>${r.saltati.map(s => `<li>${dataR(s.dataRaccolta)} — ${this.esc(s.titolo)} <em>(${this.esc(s.motivo)})</em></li>`).join('')}</ul></details>` : ''}
        <div class="psc-scroll"><table class="psc-tab"><thead><tr><th>Raccolta</th><th>Promemoria</th><th>Avviso</th><th>Zona</th><th>Stato</th></tr></thead><tbody>
          ${r.avvisi.map(a => `<tr class="${a.giaPresente ? 'psc-gia' : ''}"><td>${dataR(a.dataRaccolta)}</td><td>${quando(a)}</td><td>${this.esc(a.titolo)}</td><td>${this.esc(a.zona)}</td><td>${a.giaPresente ? 'già presente' : '<strong>nuovo</strong>'}</td></tr>`).join('')}
        </tbody></table></div>`;
      if (nuovi.length) {
        const statoTxt = (PubblicazioniApp.currentApp.schedaComune.differenziata.stato === 'published') ? 'pubblicati' : 'in bozza';
        document.getElementById('pscFoot').innerHTML = `
          <button class="btn btn-secondary" onclick="PubScheda.chiudi()">Chiudi</button>
          <button class="btn btn-primary" onclick="PubScheda.crea()"><i class="fas fa-magic"></i> Crea ${nuovi.length} avvisi ${statoTxt}</button>`;
      }
    } catch (e) {
      box.innerHTML = `<div class="psc-warn"><i class="fas fa-exclamation-triangle"></i> ${this.esc(e.message)}</div>`;
    }
  },

  async crea() {
    const a = this._anteprima; if (!a) return;
    let daFare = a.avvisi.filter(x => !x.giaPresente).map(x => x.chiave);
    const totale = daFare.length; let fatti = 0; const errori = [];
    const foot = document.getElementById('pscFoot');
    const box = document.getElementById('pscRisultato');
    foot.innerHTML = '';
    box.insertAdjacentHTML('afterbegin', `<div class="psc-progress"><div class="psc-bar"><div id="pscBar" style="width:0%"></div></div><div id="pscProgTxt">Creo gli avvisi… 0 di ${totale}</div></div>`);
    let tentativiVuoti = 0;
    while (daFare.length && tentativiVuoti < 3) {
      const lotto = daFare.slice(0, 40);
      let r;
      try { r = await this._api({ azione: 'crea', appId: PubblicazioniApp.currentApp.id, dal: a.dal, al: a.al, chiavi: lotto }); }
      catch (e) { errori.push(e.message); tentativiVuoti++; await new Promise(res => setTimeout(res, 3000)); continue; }
      const ok = new Set(r.risultati.filter(x => x.ok).map(x => x.chiave));
      r.risultati.filter(x => !x.ok && !x.rimandato).forEach(x => errori.push(x.errore || 'errore'));
      const falliti = new Set(r.risultati.filter(x => !x.ok && !x.rimandato).map(x => x.chiave));
      if (!ok.size) tentativiVuoti++; else tentativiVuoti = 0;
      fatti += ok.size;
      daFare = daFare.filter(k => !ok.has(k) && !falliti.has(k));
      const pct = Math.round(fatti / totale * 100);
      document.getElementById('pscBar').style.width = pct + '%';
      document.getElementById('pscProgTxt').textContent = `Creo gli avvisi… ${fatti} di ${totale}`;
    }
    document.getElementById('pscProgTxt').innerHTML = errori.length
      ? `<span style="color:#D32F2F"><i class="fas fa-exclamation-triangle"></i> Creati ${fatti} di ${totale}. Problemi: ${this.esc([...new Set(errori)].slice(0, 3).join(' · '))}</span>`
      : `<span style="color:#3CA434"><i class="fas fa-check-circle"></i> Fatto: creati ${fatti} avvisi.</span>`;
    foot.innerHTML = `<button class="btn btn-secondary" onclick="PubScheda.anteprima()"><i class="fas fa-redo"></i> Ricontrolla</button>
      <button class="btn btn-primary" onclick="PubScheda.chiudi()">Chiudi</button>`;
  },

  // ---------------------------------------------------------------- MAPPA GENERALE (allineatore)
  apriAllineaMappa() {
    const app = PubblicazioniApp.currentApp;
    const mg = (app.schedaComune || {}).mappaGenerale;
    if (!mg || !mg.attiva || !mg.categoriaId) {
      this._modale('<i class="fas fa-map-marked-alt"></i> Mappa generale',
        `<p>Per questa app la mappa generale non è ancora impostata.</p><p>Apri la <strong>Scheda Comune</strong>, spunta "Mappa generale", scegli la sezione e le mappe che vi confluiscono, poi salva.</p>`,
        `<button class="btn btn-primary" onclick="PubScheda.apriScheda()"><i class="fas fa-id-card"></i> Apri la Scheda Comune</button>`);
      return;
    }
    this._modale(`<i class="fas fa-map-marked-alt"></i> Allinea mappa generale — ${this.esc(app.nome)}`, `
      <p class="psc-muted">Cerco i punti delle mappe <strong>${this.esc((mg.sorgenti || []).map(x => x.titolo).join(', '))}</strong> che mancano nella mappa generale <strong>${this.esc(mg.titolo || '')}</strong> o nel suo filtro.
      Ai punti si aggiungono solo le spunte della generale (categoria completa + filtro della loro mappa): le altre categorie restano tutte come sono.</p>
      <div id="pscRisultato"></div>`,
      `<button class="btn btn-secondary" onclick="PubScheda.chiudi()">Chiudi</button>`);
    this.anteprimaMappa();
  },

  async anteprimaMappa() {
    const box = document.getElementById('pscRisultato');
    box.innerHTML = '<div class="psc-loading"><i class="fas fa-spinner fa-spin"></i> Leggo tutti i punti mappa dell’app… (può richiedere fino a un minuto)</div>';
    document.getElementById('pscFoot').innerHTML = `<button class="btn btn-secondary" onclick="PubScheda.chiudi()">Chiudi</button>`;
    try {
      const r = await this._api({ azione: 'mappa-anteprima', appId: PubblicazioniApp.currentApp.id });
      this._anteprimaMappa = r;
      const statoTxt = s => s === 'published' ? 'pubblicato' : s === 'draft' ? 'bozza' : this.esc(s || '');
      const senzaFiltro = (r.filtri || []).filter(f => !f.filtro).map(f => f.sorgente);
      const note = [];
      if (senzaFiltro.length) note.push(`Senza un filtro con lo stesso nome nella generale (i loro punti vanno solo nella categoria completa): <strong>${this.esc(senzaFiltro.join(', '))}</strong>. Se il filtro c'è con un altro nome, sceglilo nella Scheda Comune.`);
      if ((r.fuori || []).length) note.push(`Restano fuori perché la loro mappa non è spuntata nella Scheda Comune: ${r.fuori.map(f => `<strong>${this.esc(f.titolo)}</strong> (${f.n})`).join(', ')}.`);
      if (r.senzaSezione) note.push(`${r.senzaSezione} punti non sono in nessuna mappa (archivio o sezione cancellata): non compaiono nell'app e non vengono toccati.`);
      box.innerHTML = `
        <div class="psc-sommario">
          <span class="psc-pill psc-verde">${r.daAllineare.length} da sistemare</span>
          <span class="psc-pill">${r.giaDentro} già nella generale</span>
          <span class="psc-pill">${r.totale} punti in tutto</span>
        </div>
        ${note.length ? `<div class="psc-warn"><i class="fas fa-info-circle"></i> ${note.join('<br>')}</div>` : ''}
        ${r.daAllineare.length ? `<div class="psc-scroll"><table class="psc-tab"><thead><tr><th>Punto</th><th>Mappa</th><th>Si aggiunge</th><th>Stato</th></tr></thead><tbody>
          ${r.daAllineare.map(p => `<tr><td>${this.esc(p.titolo)}</td><td>${this.esc(p.sezioni.join(', '))}</td><td>${this.esc((p.aggiunte || []).join(' + '))}</td><td>${statoTxt(p.stato)}</td></tr>`).join('')}
        </tbody></table></div>` : `<div class="psc-ok"><i class="fas fa-check-circle"></i> Tutto in ordine: la mappa generale e i suoi filtri contengono già tutti i punti delle mappe scelte.</div>`}`;
      if (r.daAllineare.length) {
        document.getElementById('pscFoot').innerHTML = `
          <button class="btn btn-secondary" onclick="PubScheda.chiudi()">Chiudi</button>
          <button class="btn btn-primary" onclick="PubScheda.allineaMappa()"><i class="fas fa-plus-circle"></i> Sistema ${r.daAllineare.length} punti nella mappa generale</button>`;
      }
    } catch (e) {
      box.innerHTML = `<div class="psc-warn"><i class="fas fa-exclamation-triangle"></i> ${this.esc(e.message)}</div>`;
    }
  },

  async allineaMappa() {
    const a = this._anteprimaMappa; if (!a) return;
    let daFare = a.daAllineare.map(p => p.id);
    const totale = daFare.length; let fatti = 0; const errori = [];
    const foot = document.getElementById('pscFoot');
    const box = document.getElementById('pscRisultato');
    foot.innerHTML = '';
    box.insertAdjacentHTML('afterbegin', `<div class="psc-progress"><div class="psc-bar"><div id="pscBar" style="width:0%"></div></div><div id="pscProgTxt">Sistemo i punti… 0 di ${totale}</div></div>`);
    let tentativiVuoti = 0;
    while (daFare.length && tentativiVuoti < 3) {
      const lotto = daFare.slice(0, 40);
      let r;
      try { r = await this._api({ azione: 'mappa-allinea', appId: PubblicazioniApp.currentApp.id, ids: lotto }); }
      catch (e) { errori.push(e.message); tentativiVuoti++; await new Promise(res => setTimeout(res, 3000)); continue; }
      const ok = new Set(r.risultati.filter(x => x.ok).map(x => x.id));
      const falliti = new Set(r.risultati.filter(x => !x.ok && !x.rimandato).map(x => x.id));
      r.risultati.filter(x => !x.ok && !x.rimandato).forEach(x => errori.push(x.errore || 'errore'));
      if (!ok.size) tentativiVuoti++; else tentativiVuoti = 0;
      fatti += ok.size;
      daFare = daFare.filter(id => !ok.has(id) && !falliti.has(id));
      document.getElementById('pscBar').style.width = Math.round(fatti / totale * 100) + '%';
      document.getElementById('pscProgTxt').textContent = `Sistemo i punti… ${fatti} di ${totale}`;
    }
    document.getElementById('pscProgTxt').innerHTML = errori.length
      ? `<span style="color:#D32F2F"><i class="fas fa-exclamation-triangle"></i> Sistemati ${fatti} di ${totale}. Problemi: ${this.esc([...new Set(errori)].slice(0, 3).join(' · '))}</span>`
      : `<span style="color:#3CA434"><i class="fas fa-check-circle"></i> Fatto: ${fatti} punti ora compaiono nella mappa generale e nel loro filtro.</span>`;
    foot.innerHTML = `<button class="btn btn-secondary" onclick="PubScheda.anteprimaMappa()"><i class="fas fa-redo"></i> Ricontrolla</button>
      <button class="btn btn-primary" onclick="PubScheda.chiudi()">Chiudi</button>`;
  },

  _stili() {
    return `<style>
      .psc-overlay { position:fixed; inset:0; background:rgba(20,40,60,.45); z-index:9999; display:flex; align-items:center; justify-content:center; padding:1rem; }
      .psc-modal { background:#fff; border-radius:14px; width:min(980px,100%); max-height:92vh; display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,.25); font-family:'Titillium Web',sans-serif; }
      .psc-head { display:flex; justify-content:space-between; align-items:center; padding:.9rem 1.2rem; background:#145284; color:#fff; border-radius:14px 14px 0 0; font-weight:700; font-size:1.05rem; }
      .psc-x { background:none; border:none; color:#fff; font-size:1.1rem; cursor:pointer; }
      .psc-body { padding:1rem 1.2rem; overflow:auto; }
      .psc-foot { display:flex; justify-content:flex-end; gap:.6rem; padding:.8rem 1.2rem; border-top:1px solid #D9D9D9; }
      .psc-body h4 { color:#145284; margin:1rem 0 .3rem; }
      .psc-body label { display:flex; flex-direction:column; gap:.25rem; font-size:.85rem; font-weight:600; color:#4A4A4A; flex:1; min-width:160px; margin-bottom:.6rem; }
      .psc-body input[type=text], .psc-body input[type=url], .psc-body input[type=time], .psc-body input[type=date], .psc-body select, .psc-area { border:1px solid #D9D9D9; border-radius:6px; padding:.45rem .55rem; font-family:inherit; font-size:.9rem; width:100%; box-sizing:border-box; }
      .psc-row { display:flex; gap:.8rem; flex-wrap:wrap; align-items:flex-end; }
      .psc-check { flex-direction:row !important; align-items:center; gap:.45rem !important; }
      .psc-label { font-size:.85rem; font-weight:600; color:#4A4A4A; margin:.2rem 0 .3rem; }
      .psc-checks { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:0 .8rem; }
      .psc-checks .psc-check { margin-bottom:.3rem; font-weight:400; }
      .psc-sorg { display:flex; flex-direction:column; gap:.2rem; margin-bottom:.45rem; }
      .psc-sorg .psc-check { margin-bottom:0; }
      .psc-body select.psc-filtro { font-size:.78rem; padding:.2rem .4rem; margin-left:1.5rem; width:calc(100% - 1.5rem); color:#145284; }
      .psc-muted { color:#9B9B9B; font-size:.85rem; margin:.2rem 0 .6rem; }
      .psc-zona { border:1px solid #7BA7CE; border-radius:10px; padding:.8rem; margin:.8rem 0; background:#F5F9FD; }
      .psc-tab { width:100%; border-collapse:collapse; font-size:.85rem; margin:.4rem 0; }
      .psc-tab th { background:#D1E2F2; color:#145284; text-align:left; padding:.35rem .45rem; }
      .psc-tab td { border-bottom:1px solid #E6E6E6; padding:.3rem .45rem; vertical-align:top; }
      .psc-img { display:flex; gap:.4rem; align-items:center; }
      .psc-img img { width:34px; height:34px; object-fit:cover; border-radius:4px; }
      .psc-mini { font-size:.75rem !important; margin-top:.25rem; }
      .psc-del { background:none; border:none; color:#D32F2F; cursor:pointer; }
      .psc-small { padding:.3rem .7rem; font-size:.85rem; }
      .psc-align { margin-bottom:.6rem; }
      .psc-proponi { display:flex; gap:.7rem; align-items:center; flex-wrap:wrap; margin:.3rem 0 .5rem; }
      .psc-ok { background:#E2F8DE; border-left:4px solid #3CA434; padding:.6rem .8rem; border-radius:6px; margin:.5rem 0; font-size:.88rem; }
      .psc-ok ul { margin:.3rem 0 .3rem 1.1rem; padding:0; }
      .psc-warn { background:#FFF6D6; border-left:4px solid #FFCC00; padding:.6rem .8rem; border-radius:6px; margin:.5rem 0; }
      .psc-loading { color:#4A4A4A; padding:.8rem 0; }
      .psc-sommario { display:flex; gap:.5rem; flex-wrap:wrap; margin:.6rem 0; }
      .psc-pill { background:#F5F5F5; border-radius:20px; padding:.25rem .7rem; font-size:.85rem; font-weight:600; }
      .psc-verde { background:#E2F8DE; color:#3CA434; } .psc-giallo { background:#FFF6D6; color:#8a6d00; }
      .psc-scroll { max-height:45vh; overflow:auto; }
      .psc-gia td { color:#9B9B9B; }
      .psc-det { margin:.4rem 0; font-size:.85rem; }
      .psc-progress { margin:.6rem 0; }
      .psc-bar { height:10px; background:#F5F5F5; border-radius:6px; overflow:hidden; }
      .psc-bar div { height:100%; background:#3CA434; transition:width .3s; }
      @media (max-width:640px) { .psc-row { flex-direction:column; align-items:stretch; } .psc-tab th:nth-child(3), .psc-tab td:nth-child(3) { display:none; } }
    </style>`;
  }
};
window.PubScheda = PubScheda;

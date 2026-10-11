/**
 * Pubblicazioni sulle app — Scheda del Comune e Calendario della differenziata (v10.6.0)
 *
 * - Scheda Comune: regole fisse dell'app (lette dall'assistente) + regole della raccolta
 *   differenziata (zone, giorni, materiali, immagini, frequenze, festivi, eccezioni).
 *   Salvata nel doc Firestore `app/{id}.schedaComune`.
 * - Calendario: anteprima calcolata dal server (/api/calendario-ricorrente) e creazione
 *   a blocchi degli avvisi su GoodBarber, senza doppioni.
 */
const PubScheda = {
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
    const base = { regoleGenerali: '', differenziata: { attiva: false, orarioNotifica: '20:00', giorniPrima: 1, orarioFine: '23:59',
      testo: 'lasciare il mastello col rifiuto del giorno al mattino dalle ore 6.00 alle ore 8.30', stato: 'draft',
      saltaFestivi: true, festivitaLocali: [], eccezioni: [], zone: [{ nome: 'Tutto il Comune', suffissoTitolo: '', categoriaId: null, raccolte: [] }] } };
    this._scheda = JSON.parse(JSON.stringify(Object.assign({}, base, app.schedaComune || {})));
    if (!this._scheda.differenziata) this._scheda.differenziata = base.differenziata;
    if (!Array.isArray(this._scheda.differenziata.zone) || !this._scheda.differenziata.zone.length) this._scheda.differenziata.zone = base.differenziata.zone;
    this._modale(`<i class="fas fa-id-card"></i> Scheda del Comune — ${this.esc(app.nome)}`,
      '<div class="psc-loading"><i class="fas fa-spinner fa-spin"></i> Leggo le sezioni Agenda dell\'app…</div>',
      `<button class="btn btn-secondary" onclick="PubScheda.chiudi()">Annulla</button>
       <button class="btn btn-primary" onclick="PubScheda.salvaScheda()"><i class="fas fa-save"></i> Salva scheda</button>`);
    try {
      if (!this._sezioni || this._sezioni.appId !== app.id) {
        const r = await this._api({ azione: 'sezioni', appId: app.id });
        this._sezioni = { appId: app.id, elenco: r.sezioni || [] };
      }
    } catch (e) {
      this._sezioni = { appId: app.id, elenco: [], errore: e.message };
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
      ` : ''}`;
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

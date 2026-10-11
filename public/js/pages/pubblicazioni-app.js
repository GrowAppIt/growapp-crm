/**
 * Pubblicazioni sulle App — Modulo CRM
 *
 * Sezione che elenca tutte le app e, per ciascuna, apre una finestra di chat
 * per pubblicare contenuti (eventi, ecc.) tramite Claude.
 *
 * STATO: skeleton interfaccia. Il collegamento alla scrittura sulle app
 * (API classica GoodBarber + token per app) verrà agganciato in un secondo
 * momento. Per ora la chat mostra l'esperienza d'uso ma non scrive nulla.
 *
 * Schema di sicurezza previsto (quando sarà collegato):
 *   fonte → Claude prepara una BOZZA → la persona conferma → si pubblica.
 *
 * @module PubblicazioniApp
 */
const PubblicazioniApp = {

  // Stato interno
  apps: [],
  currentApp: null,        // app selezionata per la chat
  _messages: [],           // cronologia chat dell'app corrente (formato API Claude)
  _sending: false,         // true mentre attendiamo la risposta dal backend

  // ============================================================================
  // Render principale — griglia delle app
  // ============================================================================
  async render() {
    const mainContent = document.getElementById('mainContent');
    mainContent.innerHTML = '<div class="loading-spinner" style="margin:3rem auto;"></div>';

    // Carica le app dal CRM
    let apps = [];
    try {
      apps = await DataService.getApps();
    } catch (e) {
      console.error('[PubblicazioniApp] errore caricamento app:', e);
    }

    // Mostra prima le attive, poi le altre; ordina per nome
    this.apps = (apps || []).slice().sort((a, b) => {
      const aAttiva = a.statoApp === 'ATTIVA' ? 0 : 1;
      const bAttiva = b.statoApp === 'ATTIVA' ? 0 : 1;
      if (aAttiva !== bAttiva) return aAttiva - bAttiva;
      return (a.nome || '').localeCompare(b.nome || '');
    });

    this.currentApp = null;
    this._renderGrid();
  },

  _renderGrid() {
    const mainContent = document.getElementById('mainContent');
    const totale = this.apps.length;
    const attive = this.apps.filter(a => a.statoApp === 'ATTIVA').length;

    const cards = this.apps.map(app => this._appCard(app)).join('');

    mainContent.innerHTML = `
      <div class="pub-wrap">
        <div class="pub-header">
          <div>
            <h1 style="margin:0;font-size:1.6rem;font-weight:700;color:var(--grigio-900);">
              <i class="fas fa-paper-plane" style="color:var(--blu-700);"></i>
              Pubblicazioni sulle app
            </h1>
            <p style="margin:.35rem 0 0;color:var(--grigio-600);font-size:.95rem;">
              Scegli un'app per aprire la chat e preparare le pubblicazioni (es. eventi dell'agenda).
            </p>
          </div>
          <div class="pub-count">
            <span><strong>${totale}</strong> app</span>
            <span style="color:var(--verde-successo,#2e7d32);"><strong>${attive}</strong> attive</span>
          </div>
        </div>

        <div class="pub-banner">
          <i class="fas fa-shield-alt"></i>
          <div>
            <strong>Come funziona (in sicurezza):</strong>
            la chat prepara sempre una <em>bozza</em>, tu la rivedi e confermi, poi si pubblica.
            L'assistente non pubblica mai da solo.
          </div>
        </div>

        ${totale === 0
          ? `<div class="pub-empty"><i class="fas fa-mobile-alt"></i><p>Nessuna app trovata.</p></div>`
          : `<div class="pub-grid">${cards}</div>`}
      </div>

      ${this._styles()}
    `;

    // Click sulle card
    mainContent.querySelectorAll('.pub-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.appId;
        this.openChat(id);
      });
    });
  },

  _appCard(app) {
    const nome = this.escapeHtml(app.nome || 'App senza nome');
    const comune = this.escapeHtml(app.comune || app.nomeComune || '');
    const attiva = app.statoApp === 'ATTIVA';
    const collegabile = !!(app.mcpServerUrl && app.mcpClientId && app.mcpRefreshToken);

    const icona = app.iconaUrl
      ? `<img src="${this.escapeHtml(app.iconaUrl)}" alt="" class="pub-card-icon" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
         <div class="pub-card-icon pub-card-icon-fallback" style="display:none;"><i class="fas fa-mobile-alt"></i></div>`
      : `<div class="pub-card-icon pub-card-icon-fallback"><i class="fas fa-mobile-alt"></i></div>`;

    return `
      <div class="pub-card" data-app-id="${this.escapeHtml(app.id)}">
        ${icona}
        <div class="pub-card-body">
          <div class="pub-card-name" title="${nome}">${nome}</div>
          ${comune ? `<div class="pub-card-comune">${comune}</div>` : ''}
          <div class="pub-card-tags">
            <span class="pub-tag ${attiva ? 'pub-tag-green' : 'pub-tag-grey'}">
              ${attiva ? 'Attiva' : this.escapeHtml(app.statoApp || 'N/D')}
            </span>
            <span class="pub-tag ${collegabile ? 'pub-tag-blue' : 'pub-tag-grey'}" title="${collegabile ? 'Collegamento MCP configurato' : 'Manca URL o chiave MCP (configura nella scheda app)'}">
              <i class="fas ${collegabile ? 'fa-link' : 'fa-unlink'}"></i> ${collegabile ? 'Collegata' : 'Da collegare'}
            </span>
          </div>
        </div>
        <i class="fas fa-chevron-right pub-card-arrow"></i>
      </div>
    `;
  },

  // ============================================================================
  // Vista chat per una singola app
  // ============================================================================
  openChat(appId) {
    const app = this.apps.find(a => String(a.id) === String(appId));
    if (!app) return;
    this.currentApp = app;
    this._messages = [];
    this._renderChat();
  },

  _renderChat() {
    const app = this.currentApp;
    const mainContent = document.getElementById('mainContent');
    const nome = this.escapeHtml(app.nome || 'App');
    const comune = this.escapeHtml(app.comune || app.nomeComune || '');
    const collegabile = !!(app.mcpServerUrl && app.mcpClientId && app.mcpRefreshToken);

    mainContent.innerHTML = `
      <div class="pub-wrap pub-chat-wrap">
        <div class="pub-chat-topbar">
          <button class="btn btn-secondary pub-back" onclick="PubblicazioniApp.render()">
            <i class="fas fa-arrow-left"></i> Tutte le app
          </button>
          <div class="pub-chat-appinfo">
            <i class="fas fa-mobile-alt"></i>
            <div>
              <div class="pub-chat-appname">${nome}</div>
              ${comune ? `<div class="pub-chat-appcomune">${comune}</div>` : ''}
            </div>
          </div>
          <div class="pub-chat-tools">
            <button class="btn btn-secondary" onclick="PubScheda.apriScheda()" title="Regole fisse del Comune e della differenziata"><i class="fas fa-id-card"></i> Scheda Comune</button>
            <button class="btn btn-secondary" onclick="PubScheda.apriCalendario()" title="Crea gli avvisi della differenziata per più mesi"><i class="fas fa-recycle"></i> Calendario differenziata</button>
            <button class="btn btn-secondary" onclick="PubScheda.apriAllineaMappa()" title="Aggiunge alla mappa generale i punti delle altre mappe che mancano"><i class="fas fa-map-marked-alt"></i> Allinea mappa generale</button>
          </div>
        </div>

        ${!collegabile ? `
          <div class="pub-banner pub-banner-warn">
            <i class="fas fa-exclamation-triangle"></i>
            <div>Questa app non ha ancora il <strong>Collegamento MCP</strong> configurato. Aprila nella sezione <em>App → scheda app → Configurazione App → Collegamento MCP</em> e inserisci URL e chiave. Finché manca, la chat non potrà leggere o scrivere.</div>
          </div>` : ''}

        <div class="pub-chat-box">
          <div class="pub-chat-messages" id="pubChatMessages">
            ${this._welcomeMessage()}
          </div>
          <div class="pub-quick">
            <button onclick="PubblicazioniApp._rapido('evento')"><i class="fas fa-calendar-plus"></i> Nuovo evento</button>
            <button onclick="PubblicazioniApp._rapido('differenziata')"><i class="fas fa-recycle"></i> Avviso differenziata straordinario</button>
            <button onclick="PubblicazioniApp._rapido('mappa')"><i class="fas fa-map-marker-alt"></i> Nuovo punto mappa</button>
            <button onclick="PubblicazioniApp._rapido('inglese')"><i class="fas fa-language"></i> Aggiungi l'inglese</button>
            <button onclick="PubblicazioniApp._rapido('controlla')"><i class="fas fa-search"></i> Controlla la settimana</button>
          </div>
          <div class="pub-attach-preview" id="pubAttachPreview" style="display:none;"></div>
          <div class="pub-chat-inputbar">
            <input type="file" id="pubAttachFile" accept="image/jpeg,image/png,image/webp" style="display:none;">
            <button class="btn btn-secondary pub-chat-attach" id="pubAttachBtn" title="Allega locandina o foto">
              <i class="fas fa-paperclip"></i>
            </button>
            <textarea id="pubChatInput" class="pub-chat-input" rows="1"
              placeholder="Incolla un'email o il testo dell'evento, oppure allega la locandina con la graffetta…"></textarea>
            <button class="btn btn-primary pub-chat-send" id="pubChatSend" title="Invia">
              <i class="fas fa-paper-plane"></i>
            </button>
          </div>
        </div>
      </div>

      ${this._styles()}
    `;

    const input = document.getElementById('pubChatInput');
    const send = document.getElementById('pubChatSend');

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 160) + 'px';
    });
    // Invio con Enter (Shift+Enter = a capo)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._sendMessage();
      }
    });
    send.addEventListener('click', () => this._sendMessage());
    // v10.5.9: allega locandina
    this._allegato = null;
    const fileInput = document.getElementById('pubAttachFile');
    document.getElementById('pubAttachBtn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (f) this._caricaAllegato(f);
    });
    input.focus();
  },

  _welcomeMessage() {
    return `
      <div class="pub-msg pub-msg-assistant">
        <div class="pub-msg-avatar"><i class="fas fa-robot"></i></div>
        <div class="pub-msg-bubble">
          Ciao! Sto lavorando sull'app <strong>${this.escapeHtml(this.currentApp.nome || '')}</strong>.
          Dammi il materiale di un evento (email, testo, link o locandina) e preparerò una <strong>bozza</strong> da rivedere insieme.
          <br><br>
          <span style="color:var(--grigio-500);font-size:.85rem;">
            <i class="fas fa-shield-alt"></i> Creo sempre bozze; per pubblicare o cancellare ti chiederò conferma.
          </span>
        </div>
      </div>
    `;
  },

  async _sendMessage() {
    const input = document.getElementById('pubChatInput');
    const box = document.getElementById('pubChatMessages');
    const sendBtn = document.getElementById('pubChatSend');
    if (!input || !box) return;

    let text = input.value.trim();
    const allegato = this._allegato;
    if (this._sending) return;
    if (allegato && allegato.caricamento) { UI.showError && UI.showError('Attendi la fine del caricamento della locandina.'); return; }
    if (!text && !(allegato && allegato.url)) return;
    if (!text && allegato) text = 'Ti allego la locandina: preparami la bozza dell\'evento.';

    // Messaggio utente in UI + in cronologia (formato API)
    box.insertAdjacentHTML('beforeend', `
      <div class="pub-msg pub-msg-user">
        <div class="pub-msg-bubble">
          ${allegato && allegato.url ? `<img src="${this.escapeHtml(allegato.url)}" alt="Locandina allegata" class="pub-msg-img">` : ''}
          ${this.escapeHtml(text).replace(/\n/g, '<br>')}
        </div>
        <div class="pub-msg-avatar"><i class="fas fa-user"></i></div>
      </div>
    `);
    if (allegato && allegato.url) {
      // L'assistente "vede" l'immagine e riceve anche l'indirizzo per caricarla su GoodBarber
      this._messages.push({ role: 'user', content: [
        { type: 'image', source: { type: 'url', url: allegato.url } },
        { type: 'text', text: text + '\n\n[Immagine allegata dall\'operatore — indirizzo da usare per caricarla su GoodBarber: ' + allegato.url + ']' }
      ] });
    } else {
      this._messages.push({ role: 'user', content: text });
    }
    this._allegato = null;
    this._mostraAllegato();

    input.value = '';
    input.style.height = 'auto';

    // Indicatore di attesa
    this._sending = true;
    if (sendBtn) sendBtn.disabled = true;
    const loadingId = 'pub-loading-' + Date.now();
    box.insertAdjacentHTML('beforeend', `
      <div class="pub-msg pub-msg-assistant" id="${loadingId}">
        <div class="pub-msg-avatar"><i class="fas fa-robot"></i></div>
        <div class="pub-msg-bubble"><i class="fas fa-spinner fa-spin"></i> Sto lavorando…</div>
      </div>
    `);
    box.scrollTop = box.scrollHeight;

    try {
      // v10.5.5: l'API richiede il login al CRM (Firebase ID token)
      const headers = { 'Content-Type': 'application/json' };
      const _u = firebase.auth().currentUser;
      if (_u) { const _t = await _u.getIdToken(); if (_t) headers['Authorization'] = 'Bearer ' + _t; }
      const resp = await fetch('/api/app-publish-chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ appId: this.currentApp.id, messages: this._messages })
      });

      const data = await resp.json().catch(() => ({}));
      const loadingEl = document.getElementById(loadingId);

      if (!resp.ok) {
        const msg = (data && (data.detail || data.error)) || ('Errore ' + resp.status);
        if (loadingEl) loadingEl.querySelector('.pub-msg-bubble').innerHTML =
          `<span style="color:var(--rosso-errore,#c0392b);"><i class="fas fa-exclamation-triangle"></i> ${this.escapeHtml(msg)}</span>`;
        return;
      }

      // Mostra la risposta e salva il turno assistant nella cronologia (formato API)
      const answer = data.answer || '(nessuna risposta)';
      if (loadingEl) loadingEl.querySelector('.pub-msg-bubble').innerHTML = this.renderMarkdown(answer);
      if (Array.isArray(data.nuoviMessaggi) && data.nuoviMessaggi.length) {
        // v10.6.2: accoda anche i passaggi intermedi (strumenti), così la cronologia resta integra
        data.nuoviMessaggi.forEach(m => this._messages.push(m));
      } else if (Array.isArray(data.content)) {
        this._messages.push({ role: 'assistant', content: data.content });
      } else {
        this._messages.push({ role: 'assistant', content: answer });
      }
    } catch (e) {
      const loadingEl = document.getElementById(loadingId);
      if (loadingEl) loadingEl.querySelector('.pub-msg-bubble').innerHTML =
        `<span style="color:var(--rosso-errore,#c0392b);"><i class="fas fa-exclamation-triangle"></i> Errore di rete. Riprova.</span>`;
      console.error('[PubblicazioniApp] errore invio:', e);
    } finally {
      this._sending = false;
      if (sendBtn) sendBtn.disabled = false;
      box.scrollTop = box.scrollHeight;
    }
  },

  // ============================================================================
  // Utility
  // ============================================================================
  // v10.6.3: pulsanti rapidi — preparano una richiesta già impostata da completare
  _rapido(tipo) {
    const input = document.getElementById('pubChatInput');
    if (!input) return;
    const modelli = {
      evento: 'Nuovo evento in bozza:\nTitolo: \nData e orario reale: \nLuogo: \nDescrizione: \nOrganizzatore / contatti / link: \nA che ora far partire la notifica: ',
      differenziata: 'Avviso straordinario della differenziata (in bozza):\nCosa cambia (es. raccolta spostata per festività, sospesa, recupero): \nData/e: \nZona (se serve): \nA che ora far partire la notifica: ',
      mappa: 'Nuovo punto mappa in bozza:\nNome: \nSezione e sottocategoria (es. Utilità › Farmacie, Food & Drink › Bar, Visit › Chiese): \nIndirizzo (o link di Google Maps): \nTelefono / email / sito: \nOrari e descrizione: \nPunto modello da copiare (facoltativo): ',
      inglese: 'Aggiungi la traduzione inglese (in corsivo, sotto il testo italiano) a: \n(scrivi il titolo dell\'evento o del punto mappa; lascia in bozza le modifiche e mostrami prima l\'anteprima)',
      controlla: 'Controlla gli eventi di questa settimana e della prossima e dimmi se ci sono problemi da sistemare: titoli, testi, orario reale nel titolo, immagini mancanti, traduzione inglese, doppioni. Non modificare nulla.'
    };
    input.value = modelli[tipo] || '';
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
    if (tipo === 'controlla') { this._sendMessage(); return; }
    input.focus();
    // cursore alla fine della prima riga da compilare
    const pos = input.value.indexOf(': \n');
    if (pos > 0) input.setSelectionRange(pos + 2, pos + 2);
  },

  // v10.5.9: carica la locandina su Firebase Storage (ridotta a max 2000 px, JPEG) e ne tiene l'indirizzo pubblico
  async _caricaAllegato(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { UI.showError && UI.showError('Allega un\'immagine JPG, PNG o WEBP.'); return; }
    if (file.size > 20 * 1024 * 1024) { UI.showError && UI.showError('Immagine troppo grande (massimo 20 MB).'); return; }
    this._allegato = { nome: file.name, caricamento: true, anteprima: URL.createObjectURL(file) };
    this._mostraAllegato();
    try {
      const blob = await this._riduciImmagine(file, 2000, 0.88);
      const path = `documenti/app/${this.currentApp.id}/pubblicazione_${Date.now()}.jpg`; // stessa cartella delle icone: le regole Storage non ammettono sottocartelle
      const ref = storage.ref().child(path);
      await ref.put(blob, { contentType: 'image/jpeg' });
      const url = await ref.getDownloadURL();
      if (this._allegato) { this._allegato.url = url; this._allegato.caricamento = false; }
    } catch (e) {
      console.error('[PubblicazioniApp] upload locandina', e);
      this._allegato = null;
      UI.showError && UI.showError('Caricamento della locandina non riuscito. Riprova.');
    }
    this._mostraAllegato();
  },

  _riduciImmagine(file, maxLato, qualita) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, maxLato / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => b ? resolve(b) : reject(new Error('conversione fallita')), 'image/jpeg', qualita);
      };
      img.onerror = () => reject(new Error('immagine non leggibile'));
      img.src = URL.createObjectURL(file);
    });
  },

  _mostraAllegato() {
    const box = document.getElementById('pubAttachPreview');
    if (!box) return;
    const a = this._allegato;
    if (!a) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.style.display = 'flex';
    box.innerHTML = `
      <img src="${this.escapeHtml(a.anteprima || a.url || '')}" alt="">
      <div class="pub-attach-info">
        <strong>${this.escapeHtml(a.nome || 'Locandina')}</strong>
        <span>${a.caricamento ? '<i class="fas fa-spinner fa-spin"></i> Caricamento…' : '<i class="fas fa-check" style="color:var(--verde-700,#3CA434)"></i> Pronta: scrivi eventuali indicazioni e invia'}</span>
      </div>
      <button class="pub-attach-remove" title="Togli allegato" onclick="PubblicazioniApp._allegato=null;PubblicazioniApp._mostraAllegato();"><i class="fas fa-times"></i></button>`;
  },

  // v10.5.7: impagina le risposte dell'assistente (grassetto, corsivo, titoli, elenchi, tabelle, codice).
  // Sicuro: il testo viene prima "escapato" e solo dopo si aggiungono i pochi tag ammessi.
  renderMarkdown(text) {
    const esc = s => this.escapeHtml(s);
    const inline = s => {
      // Link: prima quelli in formato [testo](https://…), poi gli indirizzi "nudi". Solo http/https.
      const link = [];
      const segna = html => '\u0000' + (link.push(html) - 1) + '\u0000';
      let t = esc(s)
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, testo, url) => segna(`<a href="${url}" target="_blank" rel="noopener">${testo}</a>`))
        .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (m, pre, url) => pre + segna(`<a href="${url}" target="_blank" rel="noopener">${url.length > 60 ? url.slice(0, 57) + '…' : url}</a>`));
      t = t
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
      return t.replace(/\u0000(\d+)\u0000/g, (m, i) => link[Number(i)]);
    };
    const righe = String(text || '').replace(/\r/g, '').split('\n');
    const out = [];
    let lista = null; // 'ul' | 'ol'
    const chiudiLista = () => { if (lista) { out.push('</' + lista + '>'); lista = null; } };
    for (let i = 0; i < righe.length; i++) {
      const r = righe[i];
      // Tabella: riga con | seguita da riga separatrice |---|
      if (/^\s*\|.*\|\s*$/.test(r) && i + 1 < righe.length && /^\s*\|?\s*:?-{2,}/.test(righe[i + 1])) {
        chiudiLista();
        const celle = x => x.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
        let html = '<div class="pub-md-table"><table><thead><tr>' + celle(r).map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>';
        i += 2;
        while (i < righe.length && /^\s*\|.*\|\s*$/.test(righe[i])) {
          html += '<tr>' + celle(righe[i]).map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>';
          i++;
        }
        i--;
        out.push(html + '</tbody></table></div>');
        continue;
      }
      let m;
      if ((m = r.match(/^\s*#{1,6}\s+(.*)$/))) { chiudiLista(); out.push('<div class="pub-md-h">' + inline(m[1]) + '</div>'); continue; }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(r)) { chiudiLista(); out.push('<hr class="pub-md-hr">'); continue; }
      if ((m = r.match(/^\s*[-*•]\s+(.*)$/))) { if (lista !== 'ul') { chiudiLista(); out.push('<ul>'); lista = 'ul'; } out.push('<li>' + inline(m[1]) + '</li>'); continue; }
      if ((m = r.match(/^\s*\d+[.)]\s+(.*)$/))) { if (lista !== 'ol') { chiudiLista(); out.push('<ol>'); lista = 'ol'; } out.push('<li>' + inline(m[1]) + '</li>'); continue; }
      chiudiLista();
      out.push(r.trim() === '' ? '<div class="pub-md-gap"></div>' : '<div>' + inline(r) + '</div>');
    }
    chiudiLista();
    return out.join('');
  },

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  _styles() {
    return `
      <style>
        .pub-wrap { max-width: 1100px; margin: 0 auto; }
        .pub-header { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap; margin-bottom:1rem; }
        .pub-count { display:flex; gap:1rem; font-size:.9rem; color:var(--grigio-700); white-space:nowrap; }
        .pub-banner { display:flex; gap:.75rem; align-items:flex-start; background:var(--blu-50,#eaf2fa); border:1px solid var(--blu-300,#7BA7CE);
                      color:var(--grigio-800); border-radius:10px; padding:.85rem 1rem; margin-bottom:1.25rem; font-size:.9rem; }
        .pub-banner i { color:var(--blu-700); font-size:1.1rem; margin-top:.1rem; }
        .pub-banner-warn { background:#fff6e6; border-color:#e6b35c; }
        .pub-banner-warn i { color:#b9770e; }

        .pub-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:1rem; }
        .pub-card { display:flex; align-items:center; gap:.85rem; background:white; border:1px solid var(--grigio-300);
                    border-radius:12px; padding:.9rem; cursor:pointer; transition:box-shadow .15s, transform .15s, border-color .15s; }
        .pub-card:hover { box-shadow:0 4px 16px rgba(0,0,0,.1); transform:translateY(-2px); border-color:var(--blu-300,#7BA7CE); }
        .pub-card-icon { width:48px; height:48px; border-radius:11px; object-fit:cover; flex-shrink:0; background:var(--grigio-100); }
        .pub-card-icon-fallback { display:flex; align-items:center; justify-content:center; color:var(--blu-700); font-size:1.3rem; }
        .pub-card-body { flex:1; min-width:0; }
        .pub-card-name { font-weight:700; color:var(--grigio-900); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .pub-card-comune { font-size:.8rem; color:var(--grigio-600); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .pub-card-tags { display:flex; gap:.4rem; margin-top:.45rem; flex-wrap:wrap; }
        .pub-tag { font-size:.7rem; font-weight:600; padding:.15rem .5rem; border-radius:20px; white-space:nowrap; }
        .pub-tag-green { background:#e6f4ea; color:#2e7d32; }
        .pub-tag-blue { background:#eaf2fa; color:var(--blu-700); }
        .pub-tag-grey { background:var(--grigio-100); color:var(--grigio-600); }
        .pub-card-arrow { color:var(--grigio-400); }
        .pub-empty { text-align:center; padding:3rem; color:var(--grigio-500); }
        .pub-empty i { font-size:2.5rem; margin-bottom:.5rem; display:block; }

        /* Chat */
        .pub-chat-topbar { display:flex; align-items:center; gap:1rem; margin-bottom:1rem; flex-wrap:wrap; }
        .pub-chat-appinfo { display:flex; align-items:center; gap:.6rem; }
        .pub-chat-appinfo > i { font-size:1.4rem; color:var(--blu-700); }
        .pub-chat-appname { font-weight:700; color:var(--grigio-900); }
        .pub-chat-appcomune { font-size:.8rem; color:var(--grigio-600); }
        .pub-chat-box { display:flex; flex-direction:column; background:white; border:1px solid var(--grigio-300);
                        border-radius:12px; overflow:hidden; height:calc(100vh - var(--header-height,60px) - 190px); min-height:380px; }
        .pub-chat-messages { flex:1; overflow-y:auto; padding:1.25rem; display:flex; flex-direction:column; gap:1rem; background:var(--grigio-50,#fafafa); }
        .pub-msg { display:flex; gap:.6rem; max-width:85%; }
        .pub-msg-user { align-self:flex-end; flex-direction:row; }
        .pub-msg-assistant { align-self:flex-start; }
        .pub-msg-avatar { width:34px; height:34px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center;
                          background:var(--blu-700); color:white; font-size:.9rem; }
        .pub-msg-user .pub-msg-avatar { background:var(--grigio-500); }
        .pub-msg-bubble { background:white; border:1px solid var(--grigio-200,#e5e5e5); border-radius:12px; padding:.7rem .9rem;
                          font-size:.92rem; color:var(--grigio-800); line-height:1.45; }
        .pub-msg-user .pub-msg-bubble { background:var(--blu-700); color:white; border-color:var(--blu-700); }
        .pub-msg-bubble ul, .pub-msg-bubble ol { margin:.3rem 0 .3rem 1.2rem; padding:0; }
        .pub-msg-bubble li { margin:.15rem 0; }
        .pub-msg-bubble code { background:var(--grigio-100,#F5F5F5); border-radius:4px; padding:0 .25rem; font-size:.85em; }
        .pub-md-h { font-weight:700; color:var(--blu-700,#145284); margin:.5rem 0 .2rem; }
        .pub-md-gap { height:.45rem; }
        .pub-md-hr { border:0; border-top:1px solid var(--grigio-300,#D9D9D9); margin:.5rem 0; }
        .pub-md-table { overflow-x:auto; margin:.4rem 0; }
        .pub-md-table table { border-collapse:collapse; font-size:.85rem; min-width:100%; }
        .pub-md-table th, .pub-md-table td { border:1px solid var(--grigio-300,#D9D9D9); padding:.3rem .5rem; text-align:left; vertical-align:top; }
        .pub-md-table th { background:var(--blu-100,#D1E2F2); color:var(--blu-700,#145284); }
        .pub-chat-inputbar { display:flex; gap:.6rem; align-items:flex-end; padding:.75rem; border-top:1px solid var(--grigio-300); background:white; }
        .pub-chat-input { flex:1; resize:none; border:1px solid var(--grigio-300); border-radius:10px; padding:.65rem .8rem;
                          font-family:inherit; font-size:.92rem; line-height:1.4; max-height:160px; }
        .pub-chat-input:focus { outline:none; border-color:var(--blu-500,#2E6DA8); }
        .pub-chat-send { flex-shrink:0; height:42px; width:48px; display:flex; align-items:center; justify-content:center; }
        .pub-quick { display:flex; gap:.4rem; flex-wrap:wrap; padding:.55rem .75rem 0; border-top:1px solid var(--grigio-300); background:white; }
        .pub-quick button { border:1px solid var(--blu-300,#7BA7CE); background:var(--blu-100,#D1E2F2); color:var(--blu-700,#145284); border-radius:16px;
                            padding:.28rem .7rem; font-family:inherit; font-size:.8rem; font-weight:600; cursor:pointer; }
        .pub-quick button:hover { background:#fff; }
        .pub-msg-bubble a { color:var(--blu-700,#145284); text-decoration:underline; word-break:break-all; }
        .pub-chat-tools { margin-left:auto; display:flex; gap:.5rem; flex-wrap:wrap; }
        .pub-chat-tools .btn { font-size:.85rem; padding:.4rem .75rem; }
        .pub-chat-attach { flex-shrink:0; height:42px; width:44px; display:flex; align-items:center; justify-content:center; }
        .pub-attach-preview { display:flex; align-items:center; gap:.7rem; padding:.55rem .75rem; border-top:1px solid var(--grigio-300); background:var(--blu-100,#D1E2F2); }
        .pub-attach-preview img { width:52px; height:52px; object-fit:cover; border-radius:6px; border:1px solid var(--grigio-300); }
        .pub-attach-info { flex:1; display:flex; flex-direction:column; font-size:.85rem; color:var(--grigio-700); }
        .pub-attach-remove { background:none; border:none; color:var(--grigio-500); cursor:pointer; font-size:1rem; padding:.3rem; }
        .pub-msg-img { display:block; max-width:220px; max-height:260px; border-radius:8px; margin-bottom:.4rem; }

        @media (max-width:768px) {
          .pub-msg { max-width:95%; }
          .pub-chat-box { height:calc(100vh - 60px - 230px); }
        }
      </style>
    `;
  }
};

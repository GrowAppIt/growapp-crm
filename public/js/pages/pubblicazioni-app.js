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
  _messages: [],           // cronologia chat dell'app corrente

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
    const collegabile = !!(app.goodbarberWebzineId && app.goodbarberToken);

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
            <span class="pub-tag ${collegabile ? 'pub-tag-blue' : 'pub-tag-grey'}" title="${collegabile ? 'Credenziali GoodBarber presenti' : 'Manca il token GoodBarber'}">
              <i class="fas ${collegabile ? 'fa-link' : 'fa-unlink'}"></i> ${collegabile ? 'Collegabile' : 'Senza token'}
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
    const collegabile = !!(app.goodbarberWebzineId && app.goodbarberToken);

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
        </div>

        ${!collegabile ? `
          <div class="pub-banner pub-banner-warn">
            <i class="fas fa-exclamation-triangle"></i>
            <div>Questa app non ha ancora le credenziali GoodBarber salvate: la pubblicazione non sarà possibile finché non vengono aggiunte.</div>
          </div>` : ''}

        <div class="pub-chat-box">
          <div class="pub-chat-messages" id="pubChatMessages">
            ${this._welcomeMessage()}
          </div>
          <div class="pub-chat-inputbar">
            <textarea id="pubChatInput" class="pub-chat-input" rows="1"
              placeholder="Es: incolla qui un'email o una locandina con i dati dell'evento…"></textarea>
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
    input.focus();
  },

  _welcomeMessage() {
    return `
      <div class="pub-msg pub-msg-assistant">
        <div class="pub-msg-avatar"><i class="fas fa-robot"></i></div>
        <div class="pub-msg-bubble">
          Ciao! Sto lavorando sull'app <strong>${this.escapeHtml(this.currentApp.nome || '')}</strong>.
          Dammi il materiale di un evento (email, testo, link o locandina) e preparerò una bozza da rivedere insieme.
          <br><br>
          <span style="color:var(--grigio-500);font-size:.85rem;">
            <i class="fas fa-info-circle"></i> Anteprima dell'interfaccia: il collegamento per scrivere davvero sull'app verrà attivato a breve.
          </span>
        </div>
      </div>
    `;
  },

  _sendMessage() {
    const input = document.getElementById('pubChatInput');
    const box = document.getElementById('pubChatMessages');
    if (!input || !box) return;

    const text = input.value.trim();
    if (!text) return;

    // Messaggio utente
    box.insertAdjacentHTML('beforeend', `
      <div class="pub-msg pub-msg-user">
        <div class="pub-msg-bubble">${this.escapeHtml(text)}</div>
        <div class="pub-msg-avatar"><i class="fas fa-user"></i></div>
      </div>
    `);
    this._messages.push({ role: 'user', content: text });

    input.value = '';
    input.style.height = 'auto';

    // Risposta segnaposto (non ancora collegato al backend)
    box.insertAdjacentHTML('beforeend', `
      <div class="pub-msg pub-msg-assistant">
        <div class="pub-msg-avatar"><i class="fas fa-robot"></i></div>
        <div class="pub-msg-bubble" style="border:1px dashed var(--grigio-300);background:var(--grigio-100);">
          <i class="fas fa-tools" style="color:var(--blu-500);"></i>
          Interfaccia in costruzione: il collegamento all'app (per leggere le sezioni e creare la bozza) non è ancora attivo.
          Appena agganciato, qui vedrai l'anteprima della bozza pronta da confermare.
        </div>
      </div>
    `);
    box.scrollTop = box.scrollHeight;
  },

  // ============================================================================
  // Utility
  // ============================================================================
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
        .pub-chat-inputbar { display:flex; gap:.6rem; align-items:flex-end; padding:.75rem; border-top:1px solid var(--grigio-300); background:white; }
        .pub-chat-input { flex:1; resize:none; border:1px solid var(--grigio-300); border-radius:10px; padding:.65rem .8rem;
                          font-family:inherit; font-size:.92rem; line-height:1.4; max-height:160px; }
        .pub-chat-input:focus { outline:none; border-color:var(--blu-500,#2E6DA8); }
        .pub-chat-send { flex-shrink:0; height:42px; width:48px; display:flex; align-items:center; justify-content:center; }

        @media (max-width:768px) {
          .pub-msg { max-width:95%; }
          .pub-chat-box { height:calc(100vh - 60px - 230px); }
        }
      </style>
    `;
  }
};

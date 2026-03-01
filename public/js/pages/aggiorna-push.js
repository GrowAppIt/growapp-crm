/**
 * Aggiorna Consensi Push — Sub-cruscotto
 * Pagina per aggiornare manualmente i consensi push di tutte le app ATTIVE.
 * Mostra badge colorati per l'anzianità dell'ultimo aggiornamento.
 * Accessibile dal Report App (non è nel menu laterale).
 *
 * CRM Comune.Digital by Growapp S.r.l.
 */

const AggiornaPush = {

  allApps: [],
  searchQuery: '',
  sortKey: 'badge', // default: ordina per urgenza di aggiornamento
  sortOrder: 'desc',

  async render() {
    try {
      UI.showLoading();

      // Carica solo app ATTIVE
      const tutteLeApp = await DataService.getApps();
      this.allApps = tutteLeApp.filter(a => a.statoApp === 'ATTIVA');

      this.renderPage();
      this.renderTable();
      this.attachEventListeners();

      UI.hideLoading();
    } catch (error) {
      console.error('Errore caricamento AggiornaPush:', error);
      UI.hideLoading();
      document.getElementById('mainContent').innerHTML = `
        <div class="empty-state">
          <i class="fas fa-exclamation-triangle"></i>
          <h3>Errore caricamento</h3>
          <p>${error.message}</p>
        </div>`;
    }
  },

  renderPage() {
    const container = document.getElementById('mainContent');
    container.innerHTML = `
      <style>
        .ap-page { max-width: 1200px; margin: 0 auto; padding: 0 1rem; }

        .ap-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.75rem;
        }
        .ap-header h1 {
          font-size: 1.3rem; font-weight: 900; color: var(--blu-900);
          font-family: 'Titillium Web', sans-serif; margin: 0;
        }
        .ap-header h1 i { margin-right: 0.5rem; color: var(--blu-700); }
        .ap-back-btn {
          display: inline-flex; align-items: center; gap: 0.4rem;
          padding: 0.4rem 0.9rem; border-radius: 8px;
          background: var(--blu-700); color: #fff;
          border: none; cursor: pointer; font-size: 0.8rem;
          font-family: 'Titillium Web', sans-serif; font-weight: 600;
          transition: background 0.2s;
        }
        .ap-back-btn:hover { background: var(--blu-500); }

        .ap-legend {
          display: flex; flex-wrap: wrap; gap: 0.6rem; margin-bottom: 1rem;
          padding: 0.75rem 1rem; background: var(--grigio-100); border-radius: 10px;
          font-size: 0.78rem; color: var(--grigio-700); align-items: center;
        }
        .ap-legend-title { font-weight: 700; color: var(--grigio-900); margin-right: 0.3rem; }
        .ap-legend-item { display: flex; align-items: center; gap: 0.3rem; }

        .ap-search-wrap {
          position: relative; max-width: 350px; margin-bottom: 1rem;
        }
        .ap-search-wrap i {
          position: absolute; left: 0.65rem; top: 50%; transform: translateY(-50%);
          color: var(--grigio-500); font-size: 0.8rem; pointer-events: none;
        }
        .ap-search-input {
          width: 100%; padding: 0.5rem 0.75rem 0.5rem 2rem;
          border: 1px solid var(--grigio-300); border-radius: 8px;
          font-size: 0.85rem; background: #fff;
          font-family: 'Titillium Web', sans-serif; color: var(--grigio-900);
        }
        .ap-search-input:focus { outline: none; border-color: var(--blu-500); box-shadow: 0 0 0 2px rgba(20,82,132,0.12); }

        .ap-stats {
          display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap;
        }
        .ap-stat {
          padding: 0.5rem 1rem; background: #fff; border-radius: 8px;
          border: 1px solid var(--grigio-300); font-size: 0.8rem;
          font-family: 'Titillium Web', sans-serif;
        }
        .ap-stat strong { font-weight: 700; color: var(--blu-700); }

        .ap-table-wrap {
          overflow-x: auto; border-radius: 10px;
          box-shadow: 0 1px 6px rgba(0,0,0,0.07); background: #fff;
        }
        .ap-table {
          width: 100%; border-collapse: collapse; font-size: 0.82rem;
          font-family: 'Titillium Web', sans-serif;
        }
        .ap-table thead th {
          background: var(--blu-900); color: #fff;
          padding: 0.6rem 0.5rem; text-align: left; font-weight: 600;
          font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.3px;
          white-space: nowrap; cursor: pointer; user-select: none;
          position: sticky; top: 0;
        }
        .ap-table thead th:hover { background: var(--blu-700); }
        .ap-table thead th.sorted-asc::after { content: ' \\25B2'; font-size: 0.55rem; }
        .ap-table thead th.sorted-desc::after { content: ' \\25BC'; font-size: 0.55rem; }
        .ap-table tbody tr {
          border-bottom: 1px solid var(--grigio-100); transition: background 0.15s;
        }
        .ap-table tbody tr:hover { background: var(--blu-100); }
        .ap-table tbody td {
          padding: 0.5rem; vertical-align: middle;
        }

        .ap-table tbody .col-nome { font-weight: 700; color: var(--blu-900); max-width: 200px; overflow: hidden; text-overflow: ellipsis; }
        .ap-table tbody .col-regione { font-size: 0.75rem; color: var(--grigio-700); max-width: 100px; overflow: hidden; text-overflow: ellipsis; }

        /* Badge anzianità */
        .ap-badge {
          display: inline-flex; align-items: center; gap: 0.25rem;
          padding: 0.2rem 0.55rem; border-radius: 20px;
          font-size: 0.7rem; font-weight: 700; white-space: nowrap;
        }
        .ap-badge-green { background: #E2F8DE; color: #2A752F; }
        .ap-badge-yellow { background: #FFF3CD; color: #856404; }
        .ap-badge-orange { background: #FFE0B2; color: #E65100; }
        .ap-badge-red { background: #FFCDD2; color: #C62828; }
        .ap-badge-gray { background: var(--grigio-100); color: var(--grigio-700); }

        /* Input consensi inline */
        .ap-input-push {
          width: 80px; padding: 0.3rem 0.4rem; border: 1px solid var(--grigio-300);
          border-radius: 6px; font-size: 0.82rem; text-align: right;
          font-family: 'Titillium Web', sans-serif; color: var(--grigio-900);
          font-variant-numeric: tabular-nums;
        }
        .ap-input-push:focus { outline: none; border-color: var(--blu-500); box-shadow: 0 0 0 2px rgba(20,82,132,0.12); }
        .ap-input-push.changed { border-color: var(--verde-700); background: #E2F8DE; }

        .ap-btn-save {
          padding: 0.25rem 0.6rem; border-radius: 6px; border: 1px solid var(--grigio-300);
          background: var(--grigio-100); color: var(--grigio-500); cursor: pointer;
          font-size: 0.72rem; font-weight: 600; font-family: 'Titillium Web', sans-serif;
          transition: all 0.2s;
        }
        .ap-btn-save:hover { background: var(--grigio-300); color: var(--grigio-700); }
        .ap-btn-save.has-change {
          background: var(--verde-700); color: #fff; border-color: var(--verde-700);
        }
        .ap-btn-save.has-change:hover { background: var(--verde-900); }

        .ap-update-info {
          font-size: 0.7rem; color: var(--grigio-500); line-height: 1.3;
        }
        .ap-update-info .ap-who { font-weight: 600; color: var(--grigio-700); }

        /* Contatore modifiche */
        .ap-save-all-bar {
          display: none; position: sticky; bottom: 0; left: 0; right: 0;
          background: var(--blu-900); color: #fff; padding: 0.75rem 1.5rem;
          border-radius: 10px 10px 0 0; margin-top: 1rem;
          font-family: 'Titillium Web', sans-serif;
          box-shadow: 0 -4px 20px rgba(0,0,0,0.15);
          z-index: 100; align-items: center; justify-content: space-between;
        }
        .ap-save-all-bar.visible { display: flex; }
        .ap-save-all-bar .ap-save-count { font-size: 0.85rem; font-weight: 600; }
        .ap-save-all-btn {
          padding: 0.5rem 1.5rem; border-radius: 8px; border: none;
          background: var(--verde-700); color: #fff; cursor: pointer;
          font-size: 0.85rem; font-weight: 700; font-family: 'Titillium Web', sans-serif;
          transition: background 0.2s;
        }
        .ap-save-all-btn:hover { background: var(--verde-500); }

        /* Mobile responsive */
        @media (max-width: 768px) {
          .ap-header { flex-direction: column; align-items: flex-start; }
          .ap-header h1 { font-size: 1.1rem; }
          .ap-search-wrap { max-width: 100%; }
          .ap-stats { gap: 0.5rem; }
          .ap-stat { font-size: 0.75rem; padding: 0.4rem 0.7rem; }

          .ap-table-wrap { overflow-x: hidden; }
          .ap-table { display: block; }
          .ap-table thead { display: none; }
          .ap-table tbody { display: block; }
          .ap-table tbody tr {
            display: flex; flex-wrap: wrap; align-items: center;
            padding: 0.6rem 0.5rem; border-bottom: 1px solid var(--grigio-300);
            gap: 0.3rem;
          }
          .ap-table tbody td { padding: 0 !important; }

          /* Layout mobile: badge + nome + regione su riga 1, input + save + info su riga 2 */
          .ap-table tbody td.col-badge { order: 1; flex: 0 0 auto; }
          .ap-table tbody td.col-nome { order: 2; flex: 1 1 0; min-width: 0; font-size: 0.82rem; }
          .ap-table tbody td.col-regione { order: 3; flex: 0 0 auto; font-size: 0.7rem; }
          .ap-table tbody td.col-attuale { display: none !important; }
          .ap-table tbody td.col-input { order: 4; flex: 0 0 auto; }
          .ap-table tbody td.col-save { order: 5; flex: 0 0 auto; }
          .ap-table tbody td.col-info {
            order: 6; flex: 1 0 100%;
            margin-top: 0.15rem; font-size: 0.68rem;
          }
        }
      </style>

      <div class="ap-page">
        <div class="ap-header">
          <div>
            <h1><i class="fas fa-bell"></i> Aggiorna Consensi Push</h1>
          </div>
          <button class="ap-back-btn" id="apBackBtn">
            <i class="fas fa-arrow-left"></i> Torna al Report
          </button>
        </div>

        <div class="ap-legend">
          <span class="ap-legend-title"><i class="fas fa-circle-info"></i> Anzianità aggiornamento:</span>
          <span class="ap-legend-item"><span class="ap-badge ap-badge-green"><i class="fas fa-check"></i> &lt; 7 gg</span></span>
          <span class="ap-legend-item"><span class="ap-badge ap-badge-yellow"><i class="fas fa-clock"></i> 7–15 gg</span></span>
          <span class="ap-legend-item"><span class="ap-badge ap-badge-orange"><i class="fas fa-exclamation-triangle"></i> 15–30 gg</span></span>
          <span class="ap-legend-item"><span class="ap-badge ap-badge-red"><i class="fas fa-times-circle"></i> &gt; 30 gg</span></span>
          <span class="ap-legend-item"><span class="ap-badge ap-badge-gray"><i class="fas fa-question-circle"></i> Mai aggiornato</span></span>
        </div>

        <div class="ap-stats" id="apStats"></div>

        <div class="ap-search-wrap">
          <i class="fas fa-search"></i>
          <input type="text" id="apSearchInput" class="ap-search-input"
                 placeholder="Cerca app per nome o comune..." value="">
        </div>

        <div class="ap-table-wrap">
          <table class="ap-table" id="apTable">
            <thead>
              <tr>
                <th class="col-badge" data-sort="badge">Stato</th>
                <th class="col-nome" data-sort="nome">Nome App</th>
                <th class="col-regione" data-sort="regione">Regione</th>
                <th class="col-attuale" data-sort="consensiPush">Attuale</th>
                <th class="col-input">Nuovo Valore</th>
                <th class="col-save"></th>
                <th class="col-info" data-sort="lastPushUpdate">Ultimo Aggiornamento</th>
              </tr>
            </thead>
            <tbody id="apTableBody"></tbody>
          </table>
        </div>

        <div class="ap-save-all-bar" id="apSaveAllBar">
          <span class="ap-save-count" id="apSaveCount">0 modifiche in sospeso</span>
          <button class="ap-save-all-btn" id="apSaveAllBtn">
            <i class="fas fa-save"></i> Salva Tutte
          </button>
        </div>
      </div>
    `;
  },

  // ── TABELLA ───────────────────────────────────────────────────
  renderTable() {
    let apps = this.getFilteredApps();
    apps = this.sortApps(apps);

    // Stats
    this.renderStats(apps);

    const tbody = document.getElementById('apTableBody');
    if (!tbody) return;

    if (apps.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--grigio-500);">Nessuna app trovata</td></tr>`;
      return;
    }

    tbody.innerHTML = apps.map(app => {
      const badge = this.getBadge(app);
      const consensi = app.consensiPush || 0;
      const updateInfo = this.getUpdateInfo(app);

      return `
        <tr data-app-id="${app.id}">
          <td class="col-badge">${badge.html}</td>
          <td class="col-nome" title="${this.escapeHtml(app.nome || '')}">${this.escapeHtml(app.nome || 'N/A')}</td>
          <td class="col-regione" title="${this.escapeHtml(app.regione || '')}">${this.escapeHtml(app.regione || '-')}</td>
          <td class="col-attuale" style="text-align:right; font-variant-numeric:tabular-nums; font-weight:600;">${this.formatNumber(consensi)}</td>
          <td class="col-input">
            <input type="number" class="ap-input-push" data-app-id="${app.id}" data-original="${consensi}"
                   value="${consensi}" min="0">
          </td>
          <td class="col-save">
            <button class="ap-btn-save" data-app-id="${app.id}" title="Conferma / Salva">
              <i class="fas fa-check"></i>
            </button>
          </td>
          <td class="col-info">
            <div class="ap-update-info">${updateInfo}</div>
          </td>
        </tr>`;
    }).join('');

    // Aggiorna header ordinamento
    document.querySelectorAll('.ap-table thead th').forEach(th => {
      th.classList.remove('sorted-asc', 'sorted-desc');
      if (th.dataset.sort === this.sortKey) {
        th.classList.add(this.sortOrder === 'asc' ? 'sorted-asc' : 'sorted-desc');
      }
    });
  },

  // ── STATS RIASSUNTIVE ─────────────────────────────────────────
  renderStats(apps) {
    const total = apps.length;
    let green = 0, yellow = 0, orange = 0, red = 0, gray = 0;
    apps.forEach(app => {
      const cat = this.getBadge(app).category;
      if (cat === 'green') green++;
      else if (cat === 'yellow') yellow++;
      else if (cat === 'orange') orange++;
      else if (cat === 'red') red++;
      else gray++;
    });

    const statsEl = document.getElementById('apStats');
    if (!statsEl) return;
    statsEl.innerHTML = `
      <div class="ap-stat"><strong>${total}</strong> app attive</div>
      <div class="ap-stat" style="border-left: 3px solid #2A752F;"><strong>${green}</strong> aggiornate</div>
      <div class="ap-stat" style="border-left: 3px solid #856404;"><strong>${yellow}</strong> da aggiornare presto</div>
      <div class="ap-stat" style="border-left: 3px solid #E65100;"><strong>${orange}</strong> in ritardo</div>
      <div class="ap-stat" style="border-left: 3px solid #C62828;"><strong>${red + gray}</strong> critiche / mai aggiornate</div>
    `;
  },

  // ── BADGE ANZIANITÀ ───────────────────────────────────────────
  getBadge(app) {
    const lastUpdate = app.lastPushUpdate || app.pushAggiornatoIl;
    if (!lastUpdate) {
      return {
        category: 'gray',
        days: 9999,
        html: '<span class="ap-badge ap-badge-gray"><i class="fas fa-question-circle"></i> Mai</span>'
      };
    }

    const now = new Date();
    const updateDate = new Date(lastUpdate);
    const diffMs = now - updateDate;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (days < 7) {
      return {
        category: 'green', days,
        html: `<span class="ap-badge ap-badge-green"><i class="fas fa-check"></i> ${days}g</span>`
      };
    } else if (days < 15) {
      return {
        category: 'yellow', days,
        html: `<span class="ap-badge ap-badge-yellow"><i class="fas fa-clock"></i> ${days}g</span>`
      };
    } else if (days < 30) {
      return {
        category: 'orange', days,
        html: `<span class="ap-badge ap-badge-orange"><i class="fas fa-exclamation-triangle"></i> ${days}g</span>`
      };
    } else {
      return {
        category: 'red', days,
        html: `<span class="ap-badge ap-badge-red"><i class="fas fa-times-circle"></i> ${days}g</span>`
      };
    }
  },

  getUpdateInfo(app) {
    const lastUpdate = app.lastPushUpdate || app.pushAggiornatoIl;
    if (!lastUpdate) {
      return '<span style="color:var(--grigio-500);">Mai aggiornato</span>';
    }
    const date = new Date(lastUpdate);
    const dateStr = date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const who = app.pushAggiornatoDa || 'N/A';
    return `${dateStr} ${timeStr} — <span class="ap-who">${this.escapeHtml(who)}</span>`;
  },

  // ── FILTRO E ORDINAMENTO ──────────────────────────────────────
  getFilteredApps() {
    let apps = [...this.allApps];
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      apps = apps.filter(a => {
        const nome = (a.nome || '').toLowerCase();
        const comune = (a.comune || '').toLowerCase();
        return nome.includes(q) || comune.includes(q);
      });
    }
    return apps;
  },

  sortApps(apps) {
    const key = this.sortKey;
    const order = this.sortOrder === 'asc' ? 1 : -1;

    return apps.sort((a, b) => {
      let va, vb;
      switch (key) {
        case 'badge':
          va = this.getBadge(a).days;
          vb = this.getBadge(b).days;
          break;
        case 'nome':
          va = (a.nome || '').toLowerCase();
          vb = (b.nome || '').toLowerCase();
          return va.localeCompare(vb) * order;
        case 'regione':
          va = (a.regione || '').toLowerCase();
          vb = (b.regione || '').toLowerCase();
          return va.localeCompare(vb) * order;
        case 'consensiPush':
          va = a.consensiPush || 0;
          vb = b.consensiPush || 0;
          break;
        case 'lastPushUpdate':
          va = new Date(a.lastPushUpdate || a.pushAggiornatoIl || '2000-01-01').getTime();
          vb = new Date(b.lastPushUpdate || b.pushAggiornatoIl || '2000-01-01').getTime();
          break;
        default:
          return 0;
      }
      return (va - vb) * order;
    });
  },

  // ── EVENT LISTENERS ───────────────────────────────────────────
  attachEventListeners() {
    // Torna al report
    document.getElementById('apBackBtn')?.addEventListener('click', () => {
      UI.showPage('report-goodbarber');
    });

    // Ricerca con debounce
    const searchInput = document.getElementById('apSearchInput');
    if (searchInput) {
      let searchTimeout = null;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.searchQuery = e.target.value.trim();
          this.renderTable();
          this.attachTableListeners();
        }, 250);
      });
    }

    // Ordinamento header
    document.querySelectorAll('.ap-table thead th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const newKey = th.dataset.sort;
        if (this.sortKey === newKey) {
          this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
          this.sortKey = newKey;
          this.sortOrder = newKey === 'nome' || newKey === 'regione' ? 'asc' : 'desc';
        }
        this.renderTable();
        this.attachTableListeners();
      });
    });

    // Listener sugli input e bottoni save
    this.attachTableListeners();

    // Salva tutte
    document.getElementById('apSaveAllBtn')?.addEventListener('click', () => {
      this.saveAll();
    });
  },

  attachTableListeners() {
    // Input change → evidenzia se diverso dall'originale, aggiorna bottone
    document.querySelectorAll('.ap-input-push').forEach(input => {
      input.addEventListener('input', (e) => {
        const appId = e.target.dataset.appId;
        const original = parseInt(e.target.dataset.original) || 0;
        const newVal = parseInt(e.target.value) || 0;
        const btn = document.querySelector(`.ap-btn-save[data-app-id="${appId}"]`);

        if (newVal !== original) {
          // Valore diverso → input verde, bottone verde
          e.target.classList.add('changed');
          if (btn) btn.classList.add('has-change');
        } else {
          // Valore uguale → conferma possibile ma stile neutro
          e.target.classList.remove('changed');
          if (btn) btn.classList.remove('has-change');
        }
        this.updateSaveBar();
      });

      // Al focus, seleziona tutto il testo per facilitare la sovrascrittura
      input.addEventListener('focus', (e) => {
        e.target.select();
      });
    });

    // Salvataggio singolo — funziona sia per conferma (stesso valore) che per modifica
    document.querySelectorAll('.ap-btn-save').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const appId = btn.dataset.appId;
        await this.saveSingle(appId);
      });
    });
  },

  // ── SALVATAGGIO ───────────────────────────────────────────────
  async saveSingle(appId) {
    const input = document.querySelector(`.ap-input-push[data-app-id="${appId}"]`);
    const btn = document.querySelector(`.ap-btn-save[data-app-id="${appId}"]`);
    if (!input || input.value.trim() === '') return;

    const newValue = parseInt(input.value);
    if (isNaN(newValue) || newValue < 0) return;

    try {
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      btn.disabled = true;

      const utente = typeof AuthService !== 'undefined' ? AuthService.getUtenteCorrente() : null;
      const nomeUtente = utente ? `${utente.nome || ''} ${utente.cognome || ''}`.trim() : 'Sistema';

      await DataService.updateApp(appId, {
        consensiPush: newValue,
        lastPushUpdate: new Date().toISOString(),
        pushAggiornatoIl: new Date().toISOString(),
        pushAggiornatoDa: nomeUtente
      });

      // Aggiorna l'oggetto locale
      const app = this.allApps.find(a => a.id === appId);
      if (app) {
        app.consensiPush = newValue;
        app.lastPushUpdate = new Date().toISOString();
        app.pushAggiornatoIl = new Date().toISOString();
        app.pushAggiornatoDa = nomeUtente;
      }

      // Aggiorna la riga visivamente
      input.dataset.original = newValue;
      input.value = newValue;
      input.classList.remove('changed');
      btn.classList.remove('has-change');
      btn.innerHTML = '<i class="fas fa-check"></i>';
      btn.disabled = false;

      // Aggiorna badge e info nella riga
      const row = input.closest('tr');
      if (row && app) {
        const badgeCell = row.querySelector('.col-badge');
        const attualeCell = row.querySelector('.col-attuale');
        const infoCell = row.querySelector('.col-info .ap-update-info');
        if (badgeCell) badgeCell.innerHTML = this.getBadge(app).html;
        if (attualeCell) attualeCell.textContent = this.formatNumber(newValue);
        if (infoCell) infoCell.innerHTML = this.getUpdateInfo(app);
      }

      this.updateSaveBar();
      this.renderStats(this.getFilteredApps());

    } catch (error) {
      console.error('Errore salvataggio push:', error);
      btn.innerHTML = '<i class="fas fa-times" style="color:#D32F2F;"></i>';
      btn.disabled = false;
      setTimeout(() => { btn.innerHTML = '<i class="fas fa-check"></i>'; }, 2000);
    }
  },

  async saveAll() {
    const changedInputs = document.querySelectorAll('.ap-input-push.changed');
    if (changedInputs.length === 0) return;

    const saveAllBtn = document.getElementById('apSaveAllBtn');
    saveAllBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    saveAllBtn.disabled = true;

    let saved = 0;
    let errors = 0;

    for (const input of changedInputs) {
      try {
        await this.saveSingle(input.dataset.appId);
        saved++;
      } catch (e) {
        errors++;
      }
    }

    saveAllBtn.innerHTML = '<i class="fas fa-save"></i> Salva Tutte';
    saveAllBtn.disabled = false;
    this.updateSaveBar();

    if (errors > 0) {
      alert(`Salvate ${saved} app. ${errors} errori.`);
    }
  },

  updateSaveBar() {
    const changed = document.querySelectorAll('.ap-input-push.changed').length;
    const bar = document.getElementById('apSaveAllBar');
    const count = document.getElementById('apSaveCount');
    if (bar && count) {
      if (changed > 0) {
        bar.classList.add('visible');
        count.textContent = `${changed} ${changed === 1 ? 'modifica' : 'modifiche'} in sospeso`;
      } else {
        bar.classList.remove('visible');
      }
    }
  },

  // ── UTILITIES ─────────────────────────────────────────────────
  formatNumber(n) {
    if (n == null) return '0';
    return Number(n).toLocaleString('it-IT');
  },

  escapeHtml(text) {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }
};

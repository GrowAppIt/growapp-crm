const PushBroadcast = {
  currentStep: 1,
  selectedApps: [],
  allApps: [],
  filteredApps: [],
  messageTemplate: '',
  customMessage: '',
  selectedPlatform: 'Tutte',
  selectedRegions: [],
  searchQuery: '',
  sendingInProgress: false,
  currentSendResults: [],

  // Predefined message templates
  templates: [
    {
      id: 'natale',
      emoji: '🎄',
      label: 'Buon Natale',
      message: 'Il Comune di {COMUNE} augura a tutti i cittadini un sereno Natale e buone feste!'
    },
    {
      id: 'capodanno',
      emoji: '🎆',
      label: 'Buon Anno',
      message: 'Il Comune di {COMUNE} augura a tutti un felice Anno Nuovo!'
    },
    {
      id: 'pasqua',
      emoji: '🐣',
      label: 'Buona Pasqua',
      message: 'Il Comune di {COMUNE} augura a tutti una serena Pasqua!'
    },
    {
      id: 'donna',
      emoji: '🌸',
      label: 'Festa della Donna',
      message: 'Il Comune di {COMUNE} augura a tutte le donne una splendida giornata!'
    },
    {
      id: 'repubblica',
      emoji: '🇮🇹',
      label: 'Festa della Repubblica',
      message: 'Il Comune di {COMUNE} celebra con orgoglio la Festa della Repubblica Italiana!'
    },
    {
      id: 'halloween',
      emoji: '🎃',
      label: 'Halloween',
      message: 'Il Comune di {COMUNE} augura a tutti un divertente Halloween!'
    },
    {
      id: 'ferragosto',
      emoji: '✨',
      label: 'Ferragosto',
      message: 'Buon Ferragosto a tutti i cittadini dal Comune di {COMUNE}!'
    },
    {
      id: 'custom',
      emoji: '✏️',
      label: 'Messaggio Personalizzato',
      message: ''
    }
  ],

  /**
   * Main entry point - render the page
   */
  async render() {
    try {
      UI.showLoading();

      // Load apps from DataService — SOLO le ATTIVA
      const tutteLeApp = await DataService.getApps();
      this.allApps = tutteLeApp.filter(a => a.statoApp === 'ATTIVA');

      // All ATTIVA apps are shown; those with API configured can be selected
      this.filteredApps = [...this.allApps];

      // Reset state
      this.currentStep = 1;
      this.selectedApps = [];
      this.messageTemplate = '';
      this.customMessage = '';
      this.selectedPlatform = 'Tutte';
      this.selectedRegions = [];
      this.currentSendResults = [];

      UI.hideLoading();
      this.renderContent();
    } catch (error) {
      console.error('Error rendering PushBroadcast:', error);
      UI.hideLoading();
      UI.showError('Errore nel caricamento della pagina');
    }
  },

  /**
   * Render main content with step indicator and current step
   */
  renderContent() {
    const container = document.getElementById('mainContent');
    if (!container) return;

    const html = `
      <div class="push-broadcast-container">
        <!-- Step Indicator -->
        <div class="step-indicator">
          <div class="step ${this.currentStep === 1 ? 'active' : 'completed'}">
            <div class="step-number">1</div>
            <div class="step-label">Selezione App</div>
          </div>
          <div class="step-connector ${this.currentStep > 1 ? 'completed' : ''}"></div>
          <div class="step ${this.currentStep === 2 ? 'active' : this.currentStep > 2 ? 'completed' : ''}">
            <div class="step-number">2</div>
            <div class="step-label">Composizione</div>
          </div>
          <div class="step-connector ${this.currentStep > 2 ? 'completed' : ''}"></div>
          <div class="step ${this.currentStep === 3 ? 'active' : ''}">
            <div class="step-number">3</div>
            <div class="step-label">Conferma</div>
          </div>
        </div>

        <!-- Step Content -->
        <div class="step-content">
          ${this.currentStep === 1 ? this.renderStep1() : ''}
          ${this.currentStep === 2 ? this.renderStep2() : ''}
          ${this.currentStep === 3 ? this.renderStep3() : ''}
        </div>

        <!-- History Section -->
        ${this.currentStep === 1 ? this.renderHistory() : ''}
      </div>
    `;

    container.innerHTML = html;
    this.attachEventListeners();
    this.applyStyles();
  },

  /**
   * STEP 1: App Selection
   */
  renderStep1() {
    const totalApps = this.filteredApps.length;
    const appsWithApi = this.filteredApps.filter(app => app.goodbarberWebzineId && app.goodbarberToken).length;
    const selectedCount = this.selectedApps.length;
    const uniqueRegions = [...new Set(this.filteredApps.map(app => app.regione))].filter(Boolean).sort();

    const html = `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Seleziona App Destinatarie</h2>
          <p class="card-subtitle">Scegli gli app a cui inviare la notifica push</p>
        </div>

        <div class="card-body">
          <!-- Quick Actions -->
          <div class="quick-actions">
            <button class="btn btn-secondary" data-action="select-all">
              <i class="fas fa-check-double"></i> Seleziona Tutte
            </button>
            <button class="btn btn-secondary" data-action="deselect-all">
              <i class="fas fa-times"></i> Deseleziona Tutte
            </button>
          </div>

          <!-- Search -->
          <div class="search-app-wrap" style="margin: 0.75rem 0; position: relative;">
            <i class="fas fa-search" style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--grigio-500); font-size: 0.85rem; pointer-events: none;"></i>
            <input type="text" id="pushSearchInput" class="push-search-input"
                   placeholder="Cerca app per nome o comune..."
                   value="${this.escapeHtml(this.searchQuery || '')}"
                   style="width: 100%; padding: 0.55rem 0.75rem 0.55rem 2.2rem; border: 1px solid var(--grigio-300); border-radius: 8px; font-size: 0.875rem; font-family: 'Titillium Web', sans-serif; color: var(--grigio-900); background: #fff;">
          </div>

          <!-- Region Filters -->
          <div class="region-filters">
            <label class="filter-label">Filtra per Regione:</label>
            <div class="filter-chips">
              ${uniqueRegions.map(region => `
                <button class="filter-chip ${this.selectedRegions.includes(region) ? 'active' : ''}"
                        data-region="${region}">
                  ${region}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Apps Counter -->
          <div class="apps-counter">
            <span class="counter-text"><strong>${selectedCount}</strong> app selezionate su <strong>${appsWithApi}</strong> con API configurata (${totalApps} totali)</span>
          </div>

          <!-- Apps List -->
          <div class="apps-list">
            ${this.getFilteredAppsList().map((app, index) => {
              const hasApi = app.goodbarberWebzineId && app.goodbarberToken;
              return `
              <div class="app-row ${!hasApi ? 'app-row-disabled' : ''}">
                <div class="app-checkbox">
                  <input type="checkbox" class="app-select" data-app-id="${app.id}"
                         ${this.selectedApps.includes(app.id) ? 'checked' : ''}
                         ${!hasApi ? 'disabled' : ''}>
                </div>
                <div class="app-info">
                  <div class="app-name">${this.escapeHtml(app.nome)}</div>
                  <div class="app-meta">
                    <span class="meta-item"><i class="fas fa-map-marker-alt"></i> ${this.escapeHtml(app.comune || 'N/D')}</span>
                    <span class="meta-item"><i class="fas fa-map"></i> ${this.escapeHtml(app.regione || 'N/D')}</span>
                    ${!hasApi ? '<span class="meta-item" style="color: var(--rosso-errore);"><i class="fas fa-exclamation-triangle"></i> API non configurata</span>' : '<span class="meta-item" style="color: var(--verde-700);"><i class="fas fa-check-circle"></i> API OK</span>'}
                  </div>
                </div>
                <div class="app-badges">
                  ${this.getStatoBadge(app.statoApp)}
                </div>
              </div>
            `}).join('')}
          </div>

          <!-- Navigation Buttons -->
          <div class="button-group">
            <button class="btn btn-secondary" data-action="back" disabled>
              <i class="fas fa-arrow-left"></i> Indietro
            </button>
            <button class="btn btn-primary" data-action="next-step" ${selectedCount === 0 ? 'disabled' : ''}>
              Avanti <i class="fas fa-arrow-right"></i>
            </button>
          </div>
        </div>
      </div>
    `;

    return html;
  },

  /**
   * STEP 2: Message Composition
   */
  renderStep2() {
    const selectedAppsNames = this.selectedApps.map(id =>
      this.filteredApps.find(app => app.id === id)?.nome
    ).filter(Boolean);

    const currentMessage = this.messageTemplate || this.customMessage;
    const charCount = currentMessage.length;
    const maxChars = 200;

    const html = `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Composizione Messaggio</h2>
          <p class="card-subtitle">Scegli un template o personalizza il messaggio</p>
        </div>

        <div class="card-body">
          <!-- Templates -->
          <div class="templates-section">
            <label class="section-label">Template Predefiniti:</label>
            <div class="templates-grid">
              ${this.templates.map(template => `
                <button class="template-card ${(this.messageTemplate === template.message && template.id !== 'custom') ? 'selected' : ''}"
                        data-template-id="${template.id}"
                        data-template-message="${this.escapeHtml(template.message)}">
                  <div class="template-emoji">${template.emoji}</div>
                  <div class="template-label">${template.label}</div>
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Custom Message -->
          <div class="message-section">
            <label class="section-label" for="message-input">Messaggio:</label>
            <div class="textarea-wrapper">
              <textarea id="message-input" class="message-input"
                        maxlength="${maxChars}"
                        placeholder="Scrivi il tuo messaggio qui... (max ${maxChars} caratteri)">${currentMessage}</textarea>
              <div class="char-counter">
                <span class="char-count">${charCount}</span>/${maxChars}
              </div>
            </div>
            <p class="hint-text">Utilizza il placeholder {COMUNE} che sarà sostituito automaticamente con il nome del comune per ogni app</p>
          </div>

          <!-- Platform Selector -->
          <div class="platform-section">
            <label class="section-label">Piattaforma:</label>
            <div class="platform-options">
              <label class="radio-option">
                <input type="radio" name="platform" value="Tutte" ${this.selectedPlatform === 'Tutte' ? 'checked' : ''}>
                <span>Tutte le piattaforme</span>
              </label>
              <label class="radio-option">
                <input type="radio" name="platform" value="iOS" ${this.selectedPlatform === 'iOS' ? 'checked' : ''}>
                <span>Solo iOS</span>
              </label>
              <label class="radio-option">
                <input type="radio" name="platform" value="Android" ${this.selectedPlatform === 'Android' ? 'checked' : ''}>
                <span>Solo Android</span>
              </label>
              <label class="radio-option">
                <input type="radio" name="platform" value="PWA" ${this.selectedPlatform === 'PWA' ? 'checked' : ''}>
                <span>Solo PWA</span>
              </label>
            </div>
          </div>

          <!-- Preview -->
          <div class="preview-section">
            <label class="section-label">Anteprima Notifica:</label>
            <div class="notification-preview">
              <div class="preview-header">
                <i class="fas fa-bell"></i>
                <span>Anteprima</span>
              </div>
              <div class="preview-body">
                ${currentMessage ? this.escapeHtml(currentMessage) : '<em>Il tuo messaggio apparirà qui</em>'}
              </div>
              <div class="preview-platform">
                Piattaforma: <strong>${this.selectedPlatform}</strong>
              </div>
            </div>
          </div>

          <!-- Navigation Buttons -->
          <div class="button-group">
            <button class="btn btn-secondary" data-action="back">
              <i class="fas fa-arrow-left"></i> Indietro
            </button>
            <button class="btn btn-primary" data-action="next-step" ${!currentMessage ? 'disabled' : ''}>
              Avanti <i class="fas fa-arrow-right"></i>
            </button>
          </div>
        </div>
      </div>
    `;

    return html;
  },

  /**
   * STEP 3: Confirmation and Send
   */
  renderStep3() {
    const selectedAppsData = this.selectedApps
      .map(id => this.filteredApps.find(app => app.id === id))
      .filter(Boolean);

    const messageToSend = this.messageTemplate || this.customMessage;
    const previewApps = selectedAppsData.slice(0, 3);

    const html = `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Conferma e Invio</h2>
          <p class="card-subtitle">Verifica i dettagli prima di inviare</p>
        </div>

        <div class="card-body">
          <!-- Summary -->
          <div class="summary-section">
            <div class="summary-item">
              <span class="summary-label"><i class="fas fa-mobile-alt"></i> App Selezionate:</span>
              <span class="summary-value">${selectedAppsData.length}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label"><i class="fas fa-bell"></i> Messaggio:</span>
              <span class="summary-value">"${this.escapeHtml(messageToSend.substring(0, 50))}${messageToSend.length > 50 ? '...' : ''}"</span>
            </div>
            <div class="summary-item">
              <span class="summary-label"><i class="fas fa-cog"></i> Piattaforma:</span>
              <span class="summary-value">${this.selectedPlatform}</span>
            </div>
          </div>

          <!-- Preview Messages for First 3 Apps -->
          <div class="personalized-preview">
            <label class="section-label">Anteprima Messaggi Personalizzati:</label>
            <div class="preview-list">
              ${previewApps.map(app => `
                <div class="preview-item">
                  <div class="preview-item-header">
                    <strong>${this.escapeHtml(app.nome)}</strong>
                    <span class="preview-item-meta">${this.escapeHtml(app.comune)}, ${this.escapeHtml(app.regione)}</span>
                  </div>
                  <div class="preview-item-message">
                    ${this.escapeHtml(messageToSend.replace('{COMUNE}', app.comune))}
                  </div>
                </div>
              `).join('')}
              ${selectedAppsData.length > 3 ? `
                <div class="preview-item-more">
                  ... e ${selectedAppsData.length - 3} altre app
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Progress Section (hidden initially) -->
          <div id="progress-section" class="progress-section" style="display: none;">
            <div class="progress-bar-container">
              <div class="progress-bar">
                <div id="progress-fill" class="progress-fill" style="width: 0%"></div>
              </div>
              <div class="progress-text">
                <span id="progress-count">0</span> / ${selectedAppsData.length}
              </div>
            </div>
            <div id="results-list" class="results-list"></div>
          </div>

          <!-- Results Section (hidden initially) -->
          <div id="results-section" class="results-section" style="display: none;">
            <div class="results-summary">
              <div class="result-stat success">
                <i class="fas fa-check-circle"></i>
                <span id="success-count">0</span> Successi
              </div>
              <div class="result-stat error">
                <i class="fas fa-exclamation-circle"></i>
                <span id="error-count">0</span> Errori
              </div>
            </div>
            <div id="detailed-results" class="detailed-results"></div>
          </div>

          <!-- Navigation Buttons -->
          <div class="button-group">
            <button class="btn btn-secondary" data-action="back" ${this.sendingInProgress ? 'disabled' : ''}>
              <i class="fas fa-arrow-left"></i> Indietro
            </button>
            <button class="btn btn-primary btn-large" data-action="send-push" ${this.sendingInProgress ? 'disabled' : ''}>
              <i class="fas fa-paper-plane"></i> Invia Push a ${selectedAppsData.length} App
            </button>
          </div>
        </div>
      </div>
    `;

    return html;
  },

  /**
   * BONUS: History Section (on Step 1)
   */
  renderHistory() {
    const html = `
      <div class="history-section">
        <div class="history-header" data-action="toggle-history">
          <h3><i class="fas fa-history"></i> Storico Invii</h3>
          <i class="fas fa-chevron-down"></i>
        </div>
        <div id="history-content" class="history-content" style="display: none;">
          <div id="history-list" class="history-list">
            <p class="loading-text"><i class="fas fa-spinner fa-spin"></i> Caricamento...</p>
          </div>
        </div>
      </div>
    `;

    // Load history asynchronously
    setTimeout(() => this.loadHistory(), 100);

    return html;
  },

  /**
   * Load push broadcast history from Firestore
   */
  async loadHistory() {
    try {
      const snapshot = await db.collection('push_broadcast_log')
        .orderBy('timestamp', 'desc')
        .limit(20)
        .get();

      const historyList = document.getElementById('history-list');
      if (!historyList) return;

      if (snapshot.empty) {
        historyList.innerHTML = '<p class="empty-text">Nessun invio precedente</p>';
        return;
      }

      const items = snapshot.docs.map(doc => {
        const data = doc.data();
        const date = data.timestamp?.toDate?.() || new Date(data.timestamp);
        const dateStr = date.toLocaleString('it-IT');
        const successCount = data.results?.filter(r => r.success).length || 0;
        const errorCount = data.results?.filter(r => !r.success).length || 0;

        return `
          <div class="history-item">
            <div class="history-item-header" data-action="toggle-history-details" data-id="${doc.id}">
              <div class="history-item-info">
                <div class="history-date">${dateStr}</div>
                <div class="history-message">"${this.escapeHtml(data.message.substring(0, 60))}${data.message.length > 60 ? '...' : ''}"</div>
              </div>
              <div class="history-stats">
                <span class="stat success"><i class="fas fa-check"></i> ${data.appIds?.length || 0}</span>
                <span class="stat success-detail">${successCount} ✓</span>
                ${errorCount > 0 ? `<span class="stat error">${errorCount} ✗</span>` : ''}
              </div>
            </div>
            <div id="details-${doc.id}" class="history-item-details" style="display: none;">
              <div class="details-grid">
                <div class="detail-row">
                  <span class="detail-label">Utente:</span>
                  <span class="detail-value">${this.escapeHtml(data.userName || 'N/A')}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Piattaforma:</span>
                  <span class="detail-value">${data.platform || 'Tutte'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Template:</span>
                  <span class="detail-value">${data.template || 'Personalizzato'}</span>
                </div>
              </div>
              <div class="results-details">
                ${data.results?.map(result => `
                  <div class="result-detail ${result.success ? 'success' : 'error'}">
                    <i class="fas fa-${result.success ? 'check-circle' : 'times-circle'}"></i>
                    <span>${this.escapeHtml(result.appName)} - ${this.escapeHtml(result.comune)}</span>
                    ${!result.success ? `<span class="error-msg">${this.escapeHtml(result.error)}</span>` : ''}
                  </div>
                `).join('')}
              </div>
              <button class="btn btn-secondary btn-small" data-action="resend-push" data-id="${doc.id}">
                <i class="fas fa-redo"></i> Reinvia
              </button>
            </div>
          </div>
        `;
      }).join('');

      historyList.innerHTML = items;
    } catch (error) {
      console.error('Error loading history:', error);
      const historyList = document.getElementById('history-list');
      if (historyList) {
        historyList.innerHTML = '<p class="error-text">Errore nel caricamento dello storico</p>';
      }
    }
  },

  /**
   * Get filtered apps list based on selected regions
   */
  getFilteredAppsList() {
    let list = this.filteredApps;

    // Filtro per regioni selezionate
    if (this.selectedRegions.length > 0) {
      list = list.filter(app => this.selectedRegions.includes(app.regione));
    }

    // Filtro per ricerca testuale
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(app => {
        const nome = (app.nome || '').toLowerCase();
        const comune = (app.comune || '').toLowerCase();
        return nome.includes(q) || comune.includes(q);
      });
    }

    return list;
  },

  /**
   * Get status badge HTML
   */
  getStatoBadge(stato) {
    let badgeClass = 'badge';
    let badgeText = stato || 'Sconosciuto';

    if (stato === 'Attivo' || stato === 'attivo') {
      badgeClass += ' badge-success';
    } else if (stato === 'Disattivo' || stato === 'disattivo') {
      badgeClass += ' badge-secondary';
    } else {
      badgeClass += ' badge-info';
    }

    return `<span class="${badgeClass}">${badgeText}</span>`;
  },

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    const container = document.querySelector('.push-broadcast-container');
    if (!container) return;

    // Step 1 events
    container.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.getAttribute('data-action');

      if (action === 'select-all') this.selectAllApps();
      if (action === 'deselect-all') this.deselectAllApps();
      if (action === 'back') this.goBack();
      if (action === 'next-step') this.nextStep();
      if (action === 'send-push') this.confirmAndSend();
      if (action === 'toggle-history') this.toggleHistory();
      if (action === 'toggle-history-details') this.toggleHistoryDetails(e);
      if (action === 'resend-push') this.resendPush(e);
    });

    // App checkboxes (Step 1)
    container.querySelectorAll('.app-select').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const appId = e.target.getAttribute('data-app-id');
        if (e.target.checked) {
          if (!this.selectedApps.includes(appId)) {
            this.selectedApps.push(appId);
          }
        } else {
          this.selectedApps = this.selectedApps.filter(id => id !== appId);
        }
        this.updateStep1UI();
      });
    });

    // Region filters (Step 1)
    container.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const region = e.target.getAttribute('data-region');
        if (this.selectedRegions.includes(region)) {
          this.selectedRegions = this.selectedRegions.filter(r => r !== region);
        } else {
          this.selectedRegions.push(region);
        }
        this.renderContent();
      });
    });

    // Search input (Step 1) con debounce
    const pushSearchInput = container.querySelector('#pushSearchInput');
    if (pushSearchInput) {
      let searchTimeout = null;
      pushSearchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.searchQuery = e.target.value.trim();
          this.renderContent();
        }, 250);
      });
      // Focus sull'input dopo il render per comodità
      pushSearchInput.focus();
    }

    // Template selection (Step 2)
    container.querySelectorAll('.template-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const templateMessage = e.target.closest('.template-card').getAttribute('data-template-message');
        const templateId = e.target.closest('.template-card').getAttribute('data-template-id');

        if (templateId === 'custom') {
          this.messageTemplate = '';
          this.customMessage = '';
        } else {
          this.messageTemplate = templateMessage;
          this.customMessage = '';
        }
        this.renderContent();
      });
    });

    // Message input (Step 2)
    const messageInput = container.querySelector('#message-input');
    if (messageInput) {
      messageInput.addEventListener('input', (e) => {
        this.customMessage = e.target.value;
        if (this.customMessage) {
          this.messageTemplate = '';
        }
        this.updateStep2UI();
      });
    }

    // Platform radio buttons (Step 2)
    container.querySelectorAll('input[name="platform"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.selectedPlatform = e.target.value;
        this.updateStep2UI();
      });
    });
  },

  /**
   * Update Step 1 UI after app selection change
   */
  updateStep1UI() {
    const allFiltered = this.getFilteredAppsList();
    const appsWithApi = allFiltered.filter(app => app.goodbarberWebzineId && app.goodbarberToken).length;
    const totalApps = allFiltered.length;
    const selectedCount = this.selectedApps.length;

    // Update counter
    const counter = document.querySelector('.apps-counter .counter-text');
    if (counter) {
      counter.innerHTML = `<span class="counter-text"><strong>${selectedCount}</strong> app selezionate su <strong>${appsWithApi}</strong> con API configurata (${totalApps} totali)</span>`;
    }

    // Update next button
    const nextBtn = document.querySelector('[data-action="next-step"]');
    if (nextBtn) {
      nextBtn.disabled = selectedCount === 0;
    }

    // Update checkboxes
    document.querySelectorAll('.app-select').forEach(checkbox => {
      const appId = checkbox.getAttribute('data-app-id');
      checkbox.checked = this.selectedApps.includes(appId);
    });
  },

  /**
   * Update Step 2 UI after message change
   */
  updateStep2UI() {
    const currentMessage = this.messageTemplate || this.customMessage;
    const charCount = currentMessage.length;

    // Update char counter
    const counter = document.querySelector('.char-counter .char-count');
    if (counter) {
      counter.textContent = charCount;
    }

    // Update preview
    const preview = document.querySelector('.preview-body');
    if (preview) {
      preview.innerHTML = currentMessage ? this.escapeHtml(currentMessage) : '<em>Il tuo messaggio apparirà qui</em>';
    }

    // Update next button
    const nextBtn = document.querySelector('[data-action="next-step"]');
    if (nextBtn) {
      nextBtn.disabled = !currentMessage;
    }

    // Deselect custom template if using predefined
    if (this.messageTemplate) {
      document.querySelectorAll('.template-card').forEach(card => {
        card.classList.remove('selected');
      });
      document.querySelector(`[data-template-id="${this.getTemplateId()}"]`)?.classList.add('selected');
    }
  },

  /**
   * Get template ID from message
   */
  getTemplateId() {
    for (const template of this.templates) {
      if (template.message === this.messageTemplate) {
        return template.id;
      }
    }
    return 'custom';
  },

  /**
   * Select all apps
   */
  selectAllApps() {
    this.selectedApps = this.getFilteredAppsList()
      .filter(app => app.goodbarberWebzineId && app.goodbarberToken)
      .map(app => app.id);
    this.updateStep1UI();
  },

  /**
   * Deselect all apps
   */
  deselectAllApps() {
    this.selectedApps = [];
    this.updateStep1UI();
  },

  // selectActiveApps rimossa: il report mostra solo app ATTIVA

  /**
   * Go to previous step
   */
  goBack() {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.renderContent();
    }
  },

  /**
   * Go to next step
   */
  nextStep() {
    if (this.currentStep === 1 && this.selectedApps.length === 0) {
      UI.showError('Seleziona almeno un\'app');
      return;
    }
    if (this.currentStep === 2 && !this.messageTemplate && !this.customMessage) {
      UI.showError('Scrivi un messaggio');
      return;
    }
    if (this.currentStep < 3) {
      this.currentStep++;
      this.renderContent();
    }
  },

  /**
   * Show confirmation modal before sending
   */
  confirmAndSend() {
    const selectedCount = this.selectedApps.length;
    if (selectedCount === 0) {
      UI.showError('Nessuna app selezionata');
      return;
    }

    const confirmed = confirm(
      `Stai per inviare una notifica push a ${selectedCount} app.\n\nContinuare?`
    );

    if (confirmed) {
      this.sendPush();
    }
  },

  /**
   * Send push notifications to all selected apps
   */
  async sendPush() {
    try {
      this.sendingInProgress = true;
      this.currentSendResults = [];

      const selectedAppsData = this.selectedApps
        .map(id => this.filteredApps.find(app => app.id === id))
        .filter(Boolean);

      const messageTemplate = this.messageTemplate || this.customMessage;
      const templateName = this.getTemplateName();

      // Show progress section
      const progressSection = document.getElementById('progress-section');
      const resultsSection = document.getElementById('results-section');
      if (progressSection) progressSection.style.display = 'block';
      if (resultsSection) resultsSection.style.display = 'none';

      // Hide buttons
      document.querySelectorAll('[data-action="back"], [data-action="send-push"]').forEach(btn => {
        btn.disabled = true;
      });

      // Mappatura piattaforma: etichetta UI → valore API GoodBarber
      const platformMap = {
        'Tutte': 'all',
        'iOS': 'ios',
        'Android': 'android',
        'PWA': 'pwa'
      };
      const apiPlatform = platformMap[this.selectedPlatform] || 'all';

      // Send to each app sequentially with 300ms delay
      for (let i = 0; i < selectedAppsData.length; i++) {
        const app = selectedAppsData[i];
        const personalizedMessage = messageTemplate.replace('{COMUNE}', app.comune);

        try {
          const result = await GoodBarberService.sendPushBroadcast(
            app.goodbarberWebzineId,
            app.goodbarberToken,
            personalizedMessage,
            apiPlatform
          );

          // L'API GoodBarber restituisce un oggetto se la chiamata è andata a buon fine.
          // Consideriamo successo se riceviamo una risposta valida (no eccezione).
          const isSuccess = result != null;
          this.currentSendResults.push({
            appId: app.id,
            appName: app.nome,
            comune: app.comune,
            success: isSuccess,
            error: isSuccess ? null : 'Nessuna risposta dal server',
            generated_in: result?.generated_in
          });
        } catch (error) {
          this.currentSendResults.push({
            appId: app.id,
            appName: app.nome,
            comune: app.comune,
            success: false,
            error: error.message || 'Errore sconosciuto'
          });
        }

        // Update progress
        this.updateProgressUI(i + 1, selectedAppsData.length);

        // 300ms delay between sends (except for the last one)
        if (i < selectedAppsData.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      // Save to Firestore and show results
      await this.saveAndShowResults(selectedAppsData, messageTemplate, templateName);

      this.sendingInProgress = false;
    } catch (error) {
      console.error('Error sending push:', error);
      UI.showError('Errore nell\'invio delle notifiche: ' + error.message);
      this.sendingInProgress = false;
    }
  },

  /**
   * Update progress UI during sending
   */
  updateProgressUI(current, total) {
    const progressFill = document.getElementById('progress-fill');
    const progressCount = document.getElementById('progress-count');
    const resultsList = document.getElementById('results-list');

    if (progressFill) {
      const percentage = (current / total) * 100;
      progressFill.style.width = percentage + '%';
    }

    if (progressCount) {
      progressCount.textContent = current;
    }

    if (resultsList && this.currentSendResults.length > 0) {
      const lastResult = this.currentSendResults[this.currentSendResults.length - 1];
      const resultItem = `
        <div class="result-item ${lastResult.success ? 'success' : 'error'}">
          <i class="fas fa-${lastResult.success ? 'check-circle' : 'times-circle'}"></i>
          <span>${this.escapeHtml(lastResult.appName)}</span>
          ${lastResult.success ? '<span class="check-mark">✓</span>' : `<span class="error-msg">${this.escapeHtml(lastResult.error)}</span>`}
        </div>
      `;
      resultsList.innerHTML += resultItem;
    }
  },

  /**
   * Save results to Firestore and show summary
   */
  async saveAndShowResults(selectedAppsData, messageTemplate, templateName) {
    try {
      const successCount = this.currentSendResults.filter(r => r.success).length;
      const errorCount = this.currentSendResults.filter(r => !r.success).length;

      // Save to Firestore
      const userId = AuthService.getUserId();
      const userName = AuthService.getUserName();

      await db.collection('push_broadcast_log').add({
        timestamp: new Date(),
        userId: userId,
        userName: userName,
        message: messageTemplate,
        template: templateName,
        platform: this.selectedPlatform,
        appIds: this.selectedApps,
        results: this.currentSendResults.map(r => ({
          appId: r.appId,
          appName: r.appName,
          comune: r.comune,
          success: r.success,
          error: r.error || null
        }))
      });

      // Show results
      const progressSection = document.getElementById('progress-section');
      const resultsSection = document.getElementById('results-section');

      if (progressSection) progressSection.style.display = 'none';
      if (resultsSection) {
        resultsSection.style.display = 'block';

        const successCountEl = document.getElementById('success-count');
        const errorCountEl = document.getElementById('error-count');
        const detailedResults = document.getElementById('detailed-results');

        if (successCountEl) successCountEl.textContent = successCount;
        if (errorCountEl) errorCountEl.textContent = errorCount;

        if (detailedResults) {
          detailedResults.innerHTML = this.currentSendResults.map(result => `
            <div class="detailed-result-item ${result.success ? 'success' : 'error'}">
              <div class="result-item-header">
                <i class="fas fa-${result.success ? 'check-circle' : 'times-circle'}"></i>
                <strong>${this.escapeHtml(result.appName)}</strong>
                <span class="result-item-meta">${this.escapeHtml(result.comune)}</span>
              </div>
              ${!result.success ? `<div class="result-item-error">${this.escapeHtml(result.error)}</div>` : ''}
            </div>
          `).join('');
        }
      }

      UI.showSuccess(`Notifiche inviate: ${successCount} successi, ${errorCount} errori`);
    } catch (error) {
      console.error('Error saving results:', error);
      UI.showError('Errore nel salvataggio dei risultati');
    }
  },

  /**
   * Get template name from message
   */
  getTemplateName() {
    for (const template of this.templates) {
      if (template.message === this.messageTemplate) {
        return template.label;
      }
    }
    return 'Personalizzato';
  },

  /**
   * Toggle history section visibility
   */
  toggleHistory() {
    const historyContent = document.getElementById('history-content');
    if (historyContent) {
      const isHidden = historyContent.style.display === 'none';
      historyContent.style.display = isHidden ? 'block' : 'none';

      if (isHidden) {
        this.loadHistory();
      }
    }
  },

  /**
   * Toggle history item details
   */
  toggleHistoryDetails(e) {
    const historyItem = e.target.closest('[data-action="toggle-history-details"]');
    const id = historyItem?.getAttribute('data-id');

    if (id) {
      const details = document.getElementById(`details-${id}`);
      if (details) {
        const isHidden = details.style.display === 'none';
        details.style.display = isHidden ? 'block' : 'none';
      }
    }
  },

  /**
   * Resend a previous push broadcast
   */
  async resendPush(e) {
    try {
      const id = e.target.closest('[data-action="resend-push"]').getAttribute('data-id');

      const doc = await db.collection('push_broadcast_log').doc(id).get();
      if (!doc.exists) {
        UI.showError('Documento non trovato');
        return;
      }

      const data = doc.data();

      // Pre-fill the wizard
      this.selectedApps = data.appIds || [];

      // Find and select the template
      const messageTemplate = data.template;
      for (const template of this.templates) {
        if (template.label === messageTemplate) {
          this.messageTemplate = template.message;
          this.customMessage = '';
          break;
        }
      }

      if (!this.messageTemplate) {
        this.customMessage = data.message;
        this.messageTemplate = '';
      }

      this.selectedPlatform = data.platform || 'Tutte';
      this.currentStep = 2;

      this.renderContent();
      UI.showSuccess('Wizard pre-compilato. Puoi modificare il messaggio o inviare direttamente');
    } catch (error) {
      console.error('Error resending push:', error);
      UI.showError('Errore nel caricamento dei dati precedenti');
    }
  },

  /**
   * Apply styles (inject CSS if not already present)
   */
  applyStyles() {
    if (document.getElementById('push-broadcast-styles')) {
      return; // Already applied
    }

    const style = document.createElement('style');
    style.id = 'push-broadcast-styles';
    style.textContent = `
      .push-broadcast-container {
        max-width: 900px;
        margin: 0 auto;
        padding: 20px;
        font-family: 'Titillium Web', sans-serif;
      }

      /* Step Indicator */
      .step-indicator {
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 40px;
        gap: 20px;
      }

      .step {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
      }

      .step-number {
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background-color: var(--grigio-300);
        color: var(--grigio-700);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 18px;
        transition: all 0.3s ease;
      }

      .step.active .step-number {
        background-color: var(--blu-700);
        color: white;
        box-shadow: 0 0 0 4px var(--blu-100);
      }

      .step.completed .step-number {
        background-color: var(--verde-700);
        color: white;
      }

      .step-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--grigio-700);
        text-transform: uppercase;
      }

      .step-connector {
        width: 40px;
        height: 3px;
        background-color: var(--grigio-300);
        transition: all 0.3s ease;
      }

      .step-connector.completed {
        background-color: var(--verde-700);
      }

      /* Cards */
      .push-broadcast-container .card {
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        overflow: hidden;
        margin-bottom: 30px;
      }

      .push-broadcast-container .card-header {
        background: linear-gradient(135deg, var(--blu-700), var(--blu-500));
        color: white;
        padding: 24px;
      }

      .push-broadcast-container .card-title {
        margin: 0 0 8px 0;
        font-size: 24px;
        font-weight: 700;
        color: white;
      }

      .push-broadcast-container .card-subtitle {
        margin: 0;
        font-size: 14px;
        opacity: 0.9;
      }

      .push-broadcast-container .card-body {
        padding: 24px;
      }

      /* Quick Actions */
      .quick-actions {
        display: flex;
        gap: 12px;
        margin-bottom: 24px;
        flex-wrap: wrap;
      }

      /* Region Filters */
      .region-filters {
        margin-bottom: 24px;
      }

      .filter-label {
        display: block;
        font-weight: 600;
        margin-bottom: 12px;
        color: var(--grigio-900);
      }

      .filter-chips {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .filter-chip {
        padding: 8px 16px;
        border: 2px solid var(--grigio-300);
        background: white;
        border-radius: 20px;
        cursor: pointer;
        transition: all 0.2s ease;
        font-size: 13px;
        font-weight: 500;
      }

      .filter-chip:hover {
        border-color: var(--blu-500);
        color: var(--blu-700);
      }

      .filter-chip.active {
        background-color: var(--blu-500);
        border-color: var(--blu-500);
        color: white;
      }

      /* Apps Counter */
      .apps-counter {
        background-color: var(--blu-100);
        padding: 12px 16px;
        border-radius: 6px;
        margin-bottom: 20px;
        font-size: 14px;
        color: var(--blu-700);
        border-left: 4px solid var(--blu-700);
      }

      .counter-text {
        display: flex;
        gap: 4px;
      }

      /* Apps List */
      .apps-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 24px;
        max-height: 400px;
        overflow-y: auto;
      }

      .app-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border: 1px solid var(--grigio-300);
        border-radius: 6px;
        transition: all 0.2s ease;
        background: white;
      }

      .app-row:hover {
        border-color: var(--blu-500);
        background-color: var(--blu-100);
      }

      .app-row-disabled {
        opacity: 0.55;
        background-color: var(--grigio-100);
      }

      .app-row-disabled:hover {
        border-color: var(--grigio-300);
        background-color: var(--grigio-100);
        cursor: not-allowed;
      }

      .app-checkbox {
        flex-shrink: 0;
      }

      .app-checkbox input[type="checkbox"] {
        width: 18px;
        height: 18px;
        cursor: pointer;
      }

      .app-info {
        flex: 1;
        min-width: 0;
      }

      .app-name {
        font-weight: 600;
        color: var(--grigio-900);
        margin-bottom: 4px;
      }

      .app-meta {
        display: flex;
        gap: 16px;
        font-size: 12px;
        color: var(--grigio-700);
      }

      .meta-item {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .app-badges {
        flex-shrink: 0;
      }

      /* Badges */
      .push-broadcast-container .badge {
        display: inline-block;
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
      }

      .push-broadcast-container .badge-success {
        background-color: var(--verde-100);
        color: var(--verde-700);
      }

      .push-broadcast-container .badge-secondary {
        background-color: var(--grigio-300);
        color: var(--grigio-900);
      }

      .push-broadcast-container .badge-info {
        background-color: var(--azzurro-info);
        color: white;
      }

      /* Buttons */
      .push-broadcast-container .btn {
        padding: 10px 16px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        transition: all 0.2s ease;
        font-family: 'Titillium Web', sans-serif;
      }

      .push-broadcast-container .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .push-broadcast-container .btn-primary {
        background-color: var(--verde-700);
        color: white;
      }

      .push-broadcast-container .btn-primary:hover:not(:disabled) {
        background-color: var(--verde-500);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(60, 164, 52, 0.3);
      }

      .push-broadcast-container .btn-secondary {
        background-color: var(--grigio-300);
        color: var(--grigio-900);
      }

      .push-broadcast-container .btn-secondary:hover:not(:disabled) {
        background-color: var(--grigio-500);
        color: white;
      }

      .push-broadcast-container .btn-large {
        padding: 14px 32px;
        font-size: 16px;
        width: 100%;
        justify-content: center;
      }

      .push-broadcast-container .btn-small {
        padding: 6px 12px;
        font-size: 12px;
      }

      .button-group {
        display: flex;
        gap: 12px;
        margin-top: 24px;
      }

      .button-group .btn {
        flex: 1;
      }

      /* Step 2: Message Composition */
      .templates-section,
      .message-section,
      .platform-section,
      .preview-section {
        margin-bottom: 24px;
      }

      .section-label {
        display: block;
        font-weight: 600;
        margin-bottom: 12px;
        color: var(--grigio-900);
      }

      .templates-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
        gap: 12px;
      }

      .template-card {
        padding: 16px;
        border: 2px solid var(--grigio-300);
        border-radius: 8px;
        background: white;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        text-align: center;
      }

      .template-card:hover {
        border-color: var(--blu-500);
        background-color: var(--blu-100);
      }

      .template-card.selected {
        background-color: var(--blu-700);
        border-color: var(--blu-700);
        color: white;
      }

      .template-emoji {
        font-size: 32px;
      }

      .template-label {
        font-size: 12px;
        font-weight: 600;
      }

      .textarea-wrapper {
        position: relative;
        margin-bottom: 8px;
      }

      .message-input {
        width: 100%;
        min-height: 120px;
        padding: 12px;
        border: 1px solid var(--grigio-300);
        border-radius: 6px;
        font-family: 'Titillium Web', sans-serif;
        font-size: 14px;
        resize: vertical;
        transition: border-color 0.2s ease;
      }

      .message-input:focus {
        outline: none;
        border-color: var(--blu-700);
        box-shadow: 0 0 0 3px var(--blu-100);
      }

      .char-counter {
        text-align: right;
        font-size: 12px;
        color: var(--grigio-700);
        margin-top: 4px;
      }

      .hint-text {
        font-size: 12px;
        color: var(--grigio-700);
        margin: 8px 0 0 0;
        font-style: italic;
      }

      .platform-options {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 12px;
      }

      .radio-option {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        padding: 8px;
      }

      .radio-option input[type="radio"] {
        cursor: pointer;
      }

      .notification-preview {
        background: linear-gradient(135deg, var(--grigio-900), var(--grigio-700));
        color: white;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      }

      .preview-header {
        background-color: rgba(0, 0, 0, 0.2);
        padding: 12px 16px;
        display: flex;
        align-items: center;
        gap: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        font-weight: 600;
      }

      .preview-body {
        padding: 16px;
        font-size: 14px;
        line-height: 1.5;
      }

      .preview-platform {
        padding: 8px 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        font-size: 12px;
        background-color: rgba(0, 0, 0, 0.2);
      }

      /* Step 3: Confirmation */
      .summary-section {
        background-color: var(--blu-100);
        border-left: 4px solid var(--blu-700);
        padding: 16px;
        border-radius: 6px;
        margin-bottom: 24px;
      }

      .summary-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 0;
        font-size: 14px;
      }

      .summary-label {
        font-weight: 600;
        color: var(--blu-700);
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .summary-value {
        color: var(--grigio-900);
      }

      .personalized-preview {
        margin-bottom: 24px;
      }

      .preview-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .preview-item {
        border: 1px solid var(--grigio-300);
        border-radius: 6px;
        padding: 12px;
        background-color: var(--grigio-100);
      }

      .preview-item-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 8px;
      }

      .preview-item-meta {
        font-size: 12px;
        color: var(--grigio-700);
      }

      .preview-item-message {
        font-size: 13px;
        color: var(--grigio-900);
        line-height: 1.5;
      }

      .preview-item-more {
        padding: 12px;
        text-align: center;
        color: var(--grigio-700);
        font-style: italic;
        font-size: 12px;
      }

      /* Progress Section */
      .progress-section {
        margin: 24px 0;
      }

      .progress-bar-container {
        margin-bottom: 16px;
      }

      .progress-bar {
        width: 100%;
        height: 8px;
        background-color: var(--grigio-300);
        border-radius: 4px;
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--blu-700), var(--verde-700));
        transition: width 0.3s ease;
      }

      .progress-text {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        color: var(--grigio-700);
        margin-top: 4px;
      }

      .results-list {
        max-height: 300px;
        overflow-y: auto;
        margin-top: 12px;
      }

      .result-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px;
        font-size: 13px;
        margin-bottom: 4px;
        border-radius: 4px;
      }

      .result-item.success {
        background-color: var(--verde-100);
        color: var(--verde-700);
      }

      .result-item.error {
        background-color: #ffebee;
        color: var(--rosso-errore);
      }

      .check-mark {
        margin-left: auto;
        font-weight: bold;
      }

      .error-msg {
        margin-left: auto;
        font-size: 11px;
      }

      /* Results Section */
      .results-section {
        background-color: var(--grigio-100);
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 24px;
      }

      .results-summary {
        display: flex;
        gap: 24px;
        margin-bottom: 20px;
      }

      .result-stat {
        display: flex;
        align-items: center;
        gap: 12px;
        font-weight: 600;
      }

      .result-stat.success {
        color: var(--verde-700);
      }

      .result-stat.error {
        color: var(--rosso-errore);
      }

      .result-stat i {
        font-size: 20px;
      }

      .detailed-results {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .detailed-result-item {
        padding: 12px;
        border-radius: 6px;
        background: white;
        border-left: 4px solid;
      }

      .detailed-result-item.success {
        border-left-color: var(--verde-700);
      }

      .detailed-result-item.error {
        border-left-color: var(--rosso-errore);
      }

      .result-item-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
      }

      .result-item-header i {
        font-size: 16px;
      }

      .result-item-meta {
        margin-left: auto;
        font-size: 12px;
        color: var(--grigio-700);
      }

      .result-item-error {
        font-size: 12px;
        color: var(--rosso-errore);
        margin-top: 4px;
      }

      /* History Section */
      .history-section {
        margin-top: 40px;
      }

      .history-header {
        background-color: var(--grigio-100);
        padding: 16px;
        border-radius: 8px;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        user-select: none;
        transition: background-color 0.2s ease;
      }

      .history-header:hover {
        background-color: var(--grigio-300);
      }

      .history-header h3 {
        margin: 0;
        font-size: 16px;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .history-header i {
        transition: transform 0.3s ease;
      }

      .history-content {
        background: white;
        border: 1px solid var(--grigio-300);
        border-top: none;
        border-radius: 0 0 8px 8px;
        overflow: hidden;
      }

      .history-list {
        display: flex;
        flex-direction: column;
      }

      .history-item {
        border-bottom: 1px solid var(--grigio-300);
      }

      .history-item:last-child {
        border-bottom: none;
      }

      .history-item-header {
        padding: 16px;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        transition: background-color 0.2s ease;
        user-select: none;
      }

      .history-item-header:hover {
        background-color: var(--grigio-100);
      }

      .history-item-info {
        flex: 1;
      }

      .history-date {
        font-size: 12px;
        color: var(--grigio-700);
        margin-bottom: 4px;
      }

      .history-message {
        font-size: 13px;
        color: var(--grigio-900);
      }

      .history-stats {
        display: flex;
        gap: 12px;
        align-items: center;
      }

      .stat {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        font-weight: 600;
      }

      .stat.success {
        color: var(--verde-700);
      }

      .stat.success-detail {
        color: var(--verde-700);
      }

      .stat.error {
        color: var(--rosso-errore);
      }

      .history-item-details {
        padding: 0 16px 16px 16px;
        background-color: var(--grigio-100);
      }

      .details-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 12px;
        margin-bottom: 16px;
      }

      .detail-row {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .detail-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--grigio-700);
      }

      .detail-value {
        font-size: 13px;
        color: var(--grigio-900);
      }

      .results-details {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 12px;
      }

      .result-detail {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px;
        background: white;
        border-radius: 4px;
        font-size: 12px;
      }

      .result-detail.success {
        color: var(--verde-700);
      }

      .result-detail.error {
        color: var(--rosso-errore);
      }

      .error-msg {
        margin-left: auto;
        font-size: 11px;
      }

      /* Empty states */
      .empty-text,
      .loading-text,
      .error-text {
        text-align: center;
        padding: 24px;
        color: var(--grigio-700);
        font-size: 14px;
      }

      .loading-text {
        color: var(--blu-700);
      }

      .error-text {
        color: var(--rosso-errore);
      }

      /* Responsive */
      @media (max-width: 768px) {
        .push-broadcast-container {
          padding: 12px;
        }

        .push-broadcast-container .step-indicator {
          margin-bottom: 30px;
          gap: 10px;
        }

        .push-broadcast-container .step-number {
          width: 40px;
          height: 40px;
          font-size: 14px;
        }

        .push-broadcast-container .step-label {
          font-size: 10px;
        }

        .push-broadcast-container .step-connector {
          width: 20px;
        }

        .push-broadcast-container .card-header {
          padding: 16px;
        }

        .push-broadcast-container .card-title {
          font-size: 18px;
        }

        .push-broadcast-container .card-body {
          padding: 16px;
        }

        .push-broadcast-container .quick-actions {
          gap: 8px;
        }

        .push-broadcast-container .btn {
          padding: 8px 12px;
          font-size: 12px;
        }

        .push-broadcast-container .button-group {
          flex-direction: column;
        }

        .push-broadcast-container .templates-grid {
          grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
          gap: 8px;
        }

        .push-broadcast-container .platform-options {
          grid-template-columns: 1fr;
        }

        .push-broadcast-container .results-summary {
          flex-direction: column;
          gap: 12px;
        }

        .push-broadcast-container .history-item-header {
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
        }

        .push-broadcast-container .history-stats {
          width: 100%;
        }
      }
    `;

    document.head.appendChild(style);
  },

  /**
   * Escape HTML special characters
   */
  escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }
};

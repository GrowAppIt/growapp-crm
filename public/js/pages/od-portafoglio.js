/**
 * Officina Digitale — Portafoglio Prodotti
 * Modulo lazy-loaded per la gestione dei prodotti evoluti.
 * Caricato dinamicamente da officina-digitale.js.
 */

const OdPortafoglio = (() => {
    // =========================================================================
    // STATE
    // =========================================================================
    const COL = OfficinaDigitale.COLLECTIONS.PRODOTTI;
    const COL_CHANGELOG = OfficinaDigitale.COLLECTIONS.CHANGELOG;

    let _prodotti = [];
    let _currentProdotto = null;
    let _currentTab = 'panoramica';
    let _filtroStato = 'tutti';
    let _viewMode = 'card'; // card | lista
    let _discussioni = [];
    let _isFollowing = false;

    // Stati prodotto (ordinati per ciclo di vita)
    const STATI_PRODOTTO = [
        { value: 'Concept', label: 'Concept', color: '#9E9E9E', icon: 'fa-lightbulb' },
        { value: 'In Sviluppo', label: 'In Sviluppo', color: '#2196F3', icon: 'fa-code' },
        { value: 'Beta', label: 'Beta', color: '#FF9800', icon: 'fa-flask' },
        { value: 'Rilasciato', label: 'Rilasciato', color: '#4CAF50', icon: 'fa-check-circle' },
        { value: 'In Evoluzione', label: 'In Evoluzione', color: '#7B1FA2', icon: 'fa-rocket' }
    ];

    const CATEGORIE = [
        'AI', 'Mobilità', 'Democrazia Partecipativa', 'Sicurezza',
        'Servizi al Cittadino', 'Comunicazione', 'Ambiente', 'Altro'
    ];

    const TIPI_CHANGELOG = [
        'Nuova funzionalità', 'Bugfix', 'Miglioramento', 'Breaking change'
    ];

    // =========================================================================
    // LISTA PRODOTTI
    // =========================================================================

    async function render() {
        const container = document.getElementById('mainContent');
        container.innerHTML = `
        <div class="od-container">
            <div class="od-header">
                <div class="od-header-left">
                    <button class="od-back-btn" onclick="OfficinaDigitale.render()">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <div class="od-header-icon" style="background: linear-gradient(135deg, #5E35B1, #7E57C2);">
                        <i class="fas fa-box-open"></i>
                    </div>
                    <div>
                        <h1 class="od-title">Portafoglio Prodotti</h1>
                        <p class="od-subtitle">Prodotti evoluti vendibili e documentati</p>
                    </div>
                </div>
                <div class="od-header-actions">
                    ${OfficinaDigitale.can('prodotti.create') ? `
                    <button class="btn btn-primary" onclick="OdPortafoglio.showCreaProdotto()" style="border-radius:10px; font-size:0.8125rem;">
                        <i class="fas fa-plus"></i> Nuovo Prodotto
                    </button>` : ''}
                </div>
            </div>

            <!-- Filtri e vista -->
            <div class="od-toolbar">
                <div class="od-filters">
                    <select id="odFiltroProdStato" onchange="OdPortafoglio._applyFilters()" class="od-select">
                        <option value="tutti">Tutti gli stati</option>
                        ${STATI_PRODOTTO.map(s => `<option value="${s.value}">${s.label}</option>`).join('')}
                    </select>
                </div>
                <div class="od-view-toggle">
                    <button class="od-view-btn ${_viewMode === 'card' ? 'active' : ''}" onclick="OdPortafoglio._setView('card')" title="Vista card">
                        <i class="fas fa-th-large"></i>
                    </button>
                    <button class="od-view-btn ${_viewMode === 'lista' ? 'active' : ''}" onclick="OdPortafoglio._setView('lista')" title="Vista lista">
                        <i class="fas fa-list"></i>
                    </button>
                </div>
            </div>

            <!-- Contenitore prodotti -->
            <div id="od-prodotti-container">
                <div class="loading-spinner" style="margin:2rem auto;"></div>
            </div>
        </div>`;

        _addPortafoglioStyles();
        await _loadProdotti();
    }

    async function _loadProdotti() {
        try {
            const snap = await db.collection(COL).orderBy('ordine', 'asc').get();
            _prodotti = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            _renderList();
        } catch (error) {
            console.error('[OdPortafoglio] Errore caricamento:', error);
            document.getElementById('od-prodotti-container').innerHTML = `
                <div class="od-empty-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Errore nel caricamento dei prodotti.</p>
                </div>`;
        }
    }

    function _renderList() {
        const container = document.getElementById('od-prodotti-container');
        if (!container) return;

        let filtered = _prodotti;
        if (_filtroStato !== 'tutti') {
            filtered = filtered.filter(p => p.stato === _filtroStato);
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="od-empty-state">
                    <i class="fas fa-box-open" style="font-size:3rem; opacity:0.3; margin-bottom:1rem;"></i>
                    <h3>Nessun prodotto${_filtroStato !== 'tutti' ? ' con questo filtro' : ''}</h3>
                    <p>Inizia aggiungendo il primo prodotto al portafoglio.</p>
                </div>`;
            return;
        }

        if (_viewMode === 'card') {
            container.innerHTML = `
                <div class="od-prod-grid">
                    ${filtered.map(p => _renderProdottoCard(p)).join('')}
                </div>`;
        } else {
            container.innerHTML = `
                <div class="od-prod-list">
                    ${filtered.map(p => _renderProdottoRow(p)).join('')}
                </div>`;
        }
    }

    function _renderProdottoCard(p) {
        const stato = STATI_PRODOTTO.find(s => s.value === p.stato) || STATI_PRODOTTO[0];
        const comuniCount = (p.comuniAttivi || []).length;
        return `
        <div class="od-prod-card" onclick="OdPortafoglio.renderDettaglio('${p.id}')">
            <div class="od-prod-card-cover" style="background: ${p.immagineCopertina ? `url(${p.immagineCopertina}) center/cover` : 'linear-gradient(135deg, #f5f5f5, #e0e0e0)'};">
                ${!p.immagineCopertina ? `<i class="fas ${_getCategoriaIcon(p.categoria)}" style="font-size:2.5rem; color:var(--grigio-300);"></i>` : ''}
                <span class="od-prod-stato-badge" style="background:${stato.color};"><i class="fas ${stato.icon}"></i> ${stato.label}</span>
            </div>
            <div class="od-prod-card-body">
                <h3 class="od-prod-card-title">${OfficinaDigitale.escHtml(p.nome || 'Senza nome')}</h3>
                ${p.tagline ? `<p class="od-prod-card-tagline">${OfficinaDigitale.escHtml(p.tagline)}</p>` : ''}
                <div class="od-prod-card-meta">
                    ${p.categoria ? `<span class="od-cat-badge">${p.categoria}</span>` : ''}
                    ${comuniCount > 0 ? `<span class="od-comuni-count"><i class="fas fa-city"></i> ${comuniCount}</span>` : ''}
                    ${p.standalone ? '<span class="od-standalone-badge">Standalone</span>' : ''}
                </div>
            </div>
        </div>`;
    }

    function _renderProdottoRow(p) {
        const stato = STATI_PRODOTTO.find(s => s.value === p.stato) || STATI_PRODOTTO[0];
        const comuniCount = (p.comuniAttivi || []).length;
        return `
        <div class="od-prod-row" onclick="OdPortafoglio.renderDettaglio('${p.id}')">
            <div class="od-prod-row-icon" style="background:${stato.color}20; color:${stato.color};">
                <i class="fas ${stato.icon}"></i>
            </div>
            <div class="od-prod-row-body">
                <div class="od-prod-row-title">${OfficinaDigitale.escHtml(p.nome || 'Senza nome')}</div>
                <div class="od-prod-row-meta">
                    ${p.categoria ? `<span class="od-cat-badge">${p.categoria}</span>` : ''}
                    <span class="od-stato-badge" style="background:${stato.color}20; color:${stato.color};">${stato.label}</span>
                    ${comuniCount > 0 ? `<span><i class="fas fa-city"></i> ${comuniCount} comuni</span>` : ''}
                </div>
            </div>
            <i class="fas fa-chevron-right" style="color:var(--grigio-300);"></i>
        </div>`;
    }

    // =========================================================================
    // DETTAGLIO PRODOTTO — 6 Tab
    // =========================================================================

    async function renderDettaglio(prodottoId) {
        const container = document.getElementById('mainContent');
        container.innerHTML = '<div class="loading-spinner" style="margin:3rem auto;"></div>';

        try {
            const doc = await db.collection(COL).doc(prodottoId).get();
            if (!doc.exists) {
                UI.showError('Prodotto non trovato');
                render();
                return;
            }
            _currentProdotto = { id: doc.id, ...doc.data() };
            _currentTab = 'panoramica';
            _renderDettaglioHTML();
        } catch (error) {
            console.error('[OdPortafoglio] Errore dettaglio:', error);
            UI.showError('Errore nel caricamento del prodotto');
        }
    }

    function _renderDettaglioHTML() {
        const p = _currentProdotto;
        if (!p) return;

        const stato = STATI_PRODOTTO.find(s => s.value === p.stato) || STATI_PRODOTTO[0];
        const container = document.getElementById('mainContent');
        const canEdit = OfficinaDigitale.can('prodotti.edit');

        container.innerHTML = `
        <div class="od-container">
            <!-- Header dettaglio -->
            <div class="od-det-header">
                <button class="od-back-btn" onclick="OdPortafoglio.render()">
                    <i class="fas fa-arrow-left"></i>
                </button>
                <div class="od-det-header-info">
                    <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                        <h1 class="od-title" style="margin:0;">${OfficinaDigitale.escHtml(p.nome)}</h1>
                        <span class="od-stato-badge-lg" style="background:${stato.color}; color:#fff;">
                            <i class="fas ${stato.icon}"></i> ${stato.label}
                        </span>
                    </div>
                    ${p.tagline ? `<p class="od-subtitle" style="margin-top:4px;">${OfficinaDigitale.escHtml(p.tagline)}</p>` : ''}
                </div>
                ${canEdit ? `
                <button class="btn btn-secondary" onclick="OdPortafoglio._editProdotto()" style="border-radius:10px; font-size:0.8125rem; white-space:nowrap;">
                    <i class="fas fa-pen"></i> Modifica
                </button>` : ''}
            </div>

            <!-- Tab Navigation -->
            <div class="od-tabs">
                <button class="od-tab active" data-tab="panoramica" onclick="OdPortafoglio._switchTab('panoramica')">
                    <i class="fas fa-info-circle"></i> <span>Panoramica</span>
                </button>
                <button class="od-tab" data-tab="team" onclick="OdPortafoglio._switchTab('team')">
                    <i class="fas fa-users"></i> <span>Team</span>
                </button>
                ${OfficinaDigitale.can('prodotti.docs.view') ? `
                <button class="od-tab" data-tab="docs" onclick="OdPortafoglio._switchTab('docs')">
                    <i class="fas fa-file-code"></i> <span>Doc. Tecnica</span>
                </button>` : ''}
                ${OfficinaDigitale.can('prodotti.commerciale.view') ? `
                <button class="od-tab" data-tab="commerciale" onclick="OdPortafoglio._switchTab('commerciale')">
                    <i class="fas fa-handshake"></i> <span>Commerciale</span>
                </button>` : ''}
                <button class="od-tab" data-tab="changelog" onclick="OdPortafoglio._switchTab('changelog')">
                    <i class="fas fa-history"></i> <span>Changelog</span>
                </button>
                <button class="od-tab" data-tab="componenti" onclick="OdPortafoglio._switchTab('componenti')">
                    <i class="fas fa-puzzle-piece"></i> <span>Componenti</span>
                </button>
            </div>

            <!-- Tab Content -->
            <div id="od-tab-content" class="od-tab-content">
                <div class="loading-spinner" style="margin:2rem auto;"></div>
            </div>
        </div>`;

        _addPortafoglioStyles();
        _renderTabContent();
    }

    function _switchTab(tab) {
        _currentTab = tab;
        document.querySelectorAll('.od-tab').forEach(t => t.classList.remove('active'));
        const activeBtn = document.querySelector(`.od-tab[data-tab="${tab}"]`);
        if (activeBtn) activeBtn.classList.add('active');
        _renderTabContent();
    }

    function _renderTabContent() {
        const content = document.getElementById('od-tab-content');
        if (!content || !_currentProdotto) return;
        const p = _currentProdotto;
        const canEdit = OfficinaDigitale.can('prodotti.edit');

        switch (_currentTab) {
            case 'panoramica':
                content.innerHTML = _renderTabPanoramica(p, canEdit);
                break;
            case 'team':
                content.innerHTML = _renderTabTeam(p, canEdit);
                break;
            case 'docs':
                content.innerHTML = _renderTabDocs(p, canEdit);
                break;
            case 'commerciale':
                content.innerHTML = _renderTabCommerciale(p, canEdit);
                break;
            case 'changelog':
                _renderTabChangelog(p, canEdit, content);
                break;
            case 'componenti':
                _renderTabComponenti(p, content);
                break;
        }
    }

    // --- TAB 1: Panoramica ---
    function _renderTabPanoramica(p, canEdit) {
        const comuniAttivi = p.comuniAttivi || [];
        const comuniPilota = p.comuniPilota || [];

        return `
        <div class="od-detail-grid">
            <div class="od-detail-card">
                <h4 class="od-detail-card-title"><i class="fas fa-align-left"></i> Descrizione</h4>
                <div class="od-detail-content">
                    ${p.descrizione ? `<div class="od-rich-text">${p.descrizione}</div>` : `<p class="od-empty-text">Nessuna descrizione ancora. ${canEdit ? 'Clicca Modifica per compilare.' : ''}</p>`}
                </div>
            </div>

            <div class="od-detail-card">
                <h4 class="od-detail-card-title"><i class="fas fa-tags"></i> Dettagli</h4>
                <div class="od-detail-fields">
                    <div class="od-field-row">
                        <span class="od-field-label">Categoria</span>
                        <span class="od-field-value">${p.categoria ? `<span class="od-cat-badge">${p.categoria}</span>` : '<em class="od-empty-text">—</em>'}</span>
                    </div>
                    <div class="od-field-row">
                        <span class="od-field-label">Standalone</span>
                        <span class="od-field-value">${p.standalone ? '<i class="fas fa-check-circle" style="color:var(--verde-700);"></i> Sì' : '<i class="fas fa-times-circle" style="color:var(--grigio-500);"></i> No'}</span>
                    </div>
                    <div class="od-field-row">
                        <span class="od-field-label">Integrabile App</span>
                        <span class="od-field-value">${p.integrabileApp ? '<i class="fas fa-check-circle" style="color:var(--verde-700);"></i> Sì' : '<i class="fas fa-times-circle" style="color:var(--grigio-500);"></i> No'}</span>
                    </div>
                </div>
            </div>

            <div class="od-detail-card">
                <h4 class="od-detail-card-title"><i class="fas fa-city"></i> Comuni Attivi (${comuniAttivi.length})</h4>
                <div class="od-detail-content">
                    ${comuniAttivi.length > 0
                        ? `<div class="od-comuni-list">${comuniAttivi.map(c => `
                            <span class="od-comune-chip" onclick="UI.showPage('dettaglio-cliente','${c.id}')">${OfficinaDigitale.escHtml(c.nome || c.id)}</span>
                        `).join('')}</div>`
                        : '<p class="od-empty-text">Nessun comune attivo</p>'}
                </div>
            </div>

            <div class="od-detail-card">
                <h4 class="od-detail-card-title"><i class="fas fa-vial"></i> Comuni Pilota (${comuniPilota.length})</h4>
                <div class="od-detail-content">
                    ${comuniPilota.length > 0
                        ? `<div class="od-comuni-list">${comuniPilota.map(c => `
                            <span class="od-comune-chip" onclick="UI.showPage('dettaglio-cliente','${c.id}')">${OfficinaDigitale.escHtml(c.nome || c.id)}</span>
                        `).join('')}</div>`
                        : '<p class="od-empty-text">Nessun comune pilota</p>'}
                </div>
            </div>
        </div>`;
    }

    // --- TAB 2: Team ---
    function _renderTabTeam(p, canEdit) {
        return `
        <div class="od-detail-grid od-detail-grid-narrow">
            <div class="od-detail-card">
                <h4 class="od-detail-card-title"><i class="fas fa-user-tie"></i> Responsabile Progetto</h4>
                <div class="od-detail-content">
                    ${p.responsabile ? _renderUserChip(p.responsabile) : `<p class="od-empty-text">Non assegnato</p>`}
                </div>
            </div>

            <div class="od-detail-card">
                <h4 class="od-detail-card-title"><i class="fas fa-laptop-code"></i> Team di Sviluppo</h4>
                <div class="od-detail-content">
                    ${(p.teamSviluppo || []).length > 0
                        ? `<div class="od-team-list">${p.teamSviluppo.map(u => _renderUserChip(u)).join('')}</div>`
                        : '<p class="od-empty-text">Team non assegnato</p>'}
                </div>
            </div>

            <div class="od-detail-card">
                <h4 class="od-detail-card-title"><i class="fas fa-briefcase"></i> Referente Commerciale</h4>
                <div class="od-detail-content">
                    ${p.referenteCommerciale ? _renderUserChip(p.referenteCommerciale) : `<p class="od-empty-text">Non assegnato</p>`}
                </div>
            </div>

            <div class="od-detail-card">
                <h4 class="od-detail-card-title"><i class="fas fa-sticky-note"></i> Note Team</h4>
                <div class="od-detail-content">
                    ${p.noteTeam ? `<div class="od-rich-text">${p.noteTeam}</div>` : '<p class="od-empty-text">Nessuna nota</p>'}
                </div>
            </div>
        </div>`;
    }

    // --- TAB 3: Documentazione Tecnica ---
    function _renderTabDocs(p, canEdit) {
        const canEditDocs = OfficinaDigitale.can('prodotti.docs.edit');
        return `
        <div class="od-detail-stack">
            ${_renderDocSection('Architettura', 'fa-sitemap', p.architettura, canEditDocs, 'architettura')}
            ${_renderDocSection('Stack Tecnologico', 'fa-layer-group', null, false, null, p.stackTecnologico)}
            ${_renderDocSection('Requisiti Infrastruttura', 'fa-server', p.requisitiInfrastruttura, canEditDocs, 'requisitiInfrastruttura')}
            ${_renderDocSection('Istruzioni di Deploy', 'fa-cloud-upload-alt', p.istruzioniDeploy, canEditDocs, 'istruzioniDeploy')}
            ${_renderDocSection('Variabili di Configurazione', 'fa-sliders-h', p.variabiliConfigurazione, canEditDocs, 'variabiliConfigurazione')}
            ${_renderDocSection('Problemi Noti', 'fa-bug', p.problemiNoti, canEditDocs, 'problemiNoti')}

            <div class="od-detail-card">
                <h4 class="od-detail-card-title">
                    <i class="fab fa-github"></i> Repository GitHub
                    ${p.repoGithub ? `<button class="btn btn-sm" onclick="OdPortafoglio._loadGithubData('${_currentProdotto.id}')" style="margin-left:auto;font-size:0.7rem;border-radius:8px;padding:3px 10px;">
                        <i class="fas fa-sync-alt"></i> Aggiorna da GitHub
                    </button>` : ''}
                </h4>
                <div class="od-detail-fields">
                    <div class="od-field-row">
                        <span class="od-field-label">Repository</span>
                        <span class="od-field-value">${p.repoGithub ? `<a href="${p.repoGithub}" target="_blank" class="od-link">${p.repoGithub} <i class="fas fa-external-link-alt"></i></a>` : '<em class="od-empty-text">—</em>'}</span>
                    </div>
                    <div class="od-field-row">
                        <span class="od-field-label">Branch Principale</span>
                        <span class="od-field-value">${p.branchPrincipale || '<em class="od-empty-text">—</em>'}</span>
                    </div>
                    <div class="od-field-row">
                        <span class="od-field-label">README</span>
                        <span class="od-field-value">${p.readmeLink ? `<a href="${p.readmeLink}" target="_blank" class="od-link">Apri README <i class="fas fa-external-link-alt"></i></a>` : '<em class="od-empty-text">—</em>'}</span>
                    </div>
                </div>
                <!-- Pannello dati GitHub Live -->
                <div id="odGithubLivePanel" style="margin-top:0.75rem;display:none;"></div>
            </div>
        </div>`;
    }

    function _renderDocSection(title, icon, content, canEdit, fieldId, tags) {
        if (tags) {
            // Render tag multipli (Stack Tecnologico)
            return `
            <div class="od-detail-card">
                <h4 class="od-detail-card-title"><i class="fas ${icon}"></i> ${title}</h4>
                <div class="od-detail-content">
                    ${tags.length > 0
                        ? `<div class="od-tags-list">${tags.map(t => `<span class="od-tech-tag">${OfficinaDigitale.escHtml(t)}</span>`).join('')}</div>`
                        : '<p class="od-empty-text">Non specificato</p>'}
                </div>
            </div>`;
        }
        return `
        <div class="od-detail-card">
            <h4 class="od-detail-card-title"><i class="fas ${icon}"></i> ${title}</h4>
            <div class="od-detail-content">
                ${content ? `<div class="od-rich-text">${content}</div>` : `<p class="od-empty-text">Non compilato${canEdit ? '. Clicca Modifica per aggiungere.' : ''}</p>`}
            </div>
        </div>`;
    }

    // --- TAB 4: Materiali Commerciali ---
    function _renderTabCommerciale(p, canEdit) {
        const canEditComm = OfficinaDigitale.can('prodotti.commerciale');
        return `
        <div class="od-detail-stack">
            <div class="od-detail-card">
                <h4 class="od-detail-card-title"><i class="fas fa-presentation"></i> Link e Demo</h4>
                <div class="od-detail-fields">
                    <div class="od-field-row">
                        <span class="od-field-label">Presentazione</span>
                        <span class="od-field-value">${p.presentazione ? `<a href="${p.presentazione}" target="_blank" class="od-link">Apri <i class="fas fa-external-link-alt"></i></a>` : '<em class="od-empty-text">—</em>'}</span>
                    </div>
                    <div class="od-field-row">
                        <span class="od-field-label">Demo Link</span>
                        <span class="od-field-value">${p.demoLink ? `<a href="${p.demoLink}" target="_blank" class="od-link">Apri Demo <i class="fas fa-external-link-alt"></i></a>` : '<em class="od-empty-text">—</em>'}</span>
                    </div>
                    <div class="od-field-row">
                        <span class="od-field-label">Video Demo</span>
                        <span class="od-field-value">${p.videoDemo ? `<a href="${p.videoDemo}" target="_blank" class="od-link">Guarda <i class="fas fa-external-link-alt"></i></a>` : '<em class="od-empty-text">—</em>'}</span>
                    </div>
                </div>
            </div>

            ${_renderDocSection('Pricing / Modello Costo', 'fa-euro-sign', p.pricing, canEditComm, 'pricing')}
            ${_renderDocSection('FAQ Commerciali', 'fa-question-circle', p.faqCommerciali, canEditComm, 'faqCommerciali')}
            ${_renderDocSection('Casi di Successo', 'fa-trophy', p.casiSuccesso, canEditComm, 'casiSuccesso')}
        </div>`;
    }

    // --- TAB 5: Changelog ---
    async function _renderTabChangelog(p, canEdit, container) {
        container.innerHTML = '<div class="loading-spinner" style="margin:2rem auto;"></div>';

        try {
            const snap = await db.collection(COL_CHANGELOG)
                .where('prodottoId', '==', p.id)
                .orderBy('data', 'desc')
                .limit(50)
                .get();

            const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            container.innerHTML = `
            <div class="od-detail-stack">
                ${canEdit ? `
                <div style="text-align:right; margin-bottom:1rem;">
                    <button class="btn btn-primary" onclick="OdPortafoglio._addChangelog()" style="border-radius:10px; font-size:0.8125rem;">
                        <i class="fas fa-plus"></i> Aggiungi Entry
                    </button>
                </div>` : ''}

                ${entries.length > 0 ? `
                <div class="od-changelog-list">
                    ${entries.map(e => {
                        const dataStr = e.data?.toDate ? e.data.toDate().toLocaleDateString('it-IT') : (e.data || '—');
                        const typeColors = {
                            'Nuova funzionalità': '#4CAF50',
                            'Bugfix': '#F44336',
                            'Miglioramento': '#2196F3',
                            'Breaking change': '#FF9800'
                        };
                        const color = typeColors[e.tipo] || '#9E9E9E';
                        return `
                        <div class="od-changelog-entry">
                            <div class="od-changelog-dot" style="background:${color};"></div>
                            <div class="od-changelog-body">
                                <div class="od-changelog-header">
                                    <span class="od-changelog-date">${dataStr}</span>
                                    ${e.versione ? `<span class="od-changelog-version">v${e.versione}</span>` : ''}
                                    <span class="od-changelog-type" style="color:${color};">${e.tipo || ''}</span>
                                </div>
                                <div class="od-changelog-desc">${OfficinaDigitale.escHtml(e.descrizione || '')}</div>
                                ${e.autoreNome ? `<div class="od-changelog-author">— ${OfficinaDigitale.escHtml(e.autoreNome)}</div>` : ''}
                            </div>
                        </div>`;
                    }).join('')}
                </div>` : `
                <div class="od-empty-state" style="padding:2rem;">
                    <i class="fas fa-history" style="font-size:2rem; opacity:0.3;"></i>
                    <p>Nessuna entry nel changelog</p>
                </div>`}
            </div>`;
        } catch (error) {
            console.error('[OdPortafoglio] Errore changelog:', error);
            container.innerHTML = '<p class="od-empty-text">Errore nel caricamento del changelog</p>';
        }
    }

    // --- TAB 6: Componenti Derivati ---
    async function _renderTabComponenti(p, container) {
        container.innerHTML = '<div class="loading-spinner" style="margin:2rem auto;"></div>';

        try {
            const snap = await db.collection(OfficinaDigitale.COLLECTIONS.COMPONENTI)
                .where('prodottoPadreId', '==', p.id)
                .get();

            const componenti = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            container.innerHTML = `
            <div class="od-detail-stack">
                ${OfficinaDigitale.can('componenti.create') ? `
                <div style="text-align:right; margin-bottom:1rem;">
                    <button class="btn btn-primary" onclick="OdPortafoglio._creaComponenteDerivato()" style="border-radius:10px; font-size:0.8125rem;">
                        <i class="fas fa-plus"></i> Crea Componente Derivato
                    </button>
                </div>` : ''}

                ${componenti.length > 0 ? `
                <div class="od-comp-derived-list">
                    ${componenti.map(c => `
                        <div class="od-quick-item" onclick="OfficinaDigitale.navigateTo('dettaglio-componente','${c.id}')">
                            <div class="od-comp-icon" style="background:${c.colore || 'var(--blu-100)'}; color:${c.colore ? '#fff' : 'var(--blu-700)'}">
                                <i class="fas ${c.icona || 'fa-code'}"></i>
                            </div>
                            <div class="od-quick-item-text">
                                <div class="od-quick-item-title">${OfficinaDigitale.escHtml(c.nome || 'Senza nome')}</div>
                                <div class="od-quick-item-meta">
                                    ${c.categoria ? `<span class="od-cat-badge">${c.categoria}</span>` : ''}
                                    ${c.versione ? `<span>v${c.versione}</span>` : ''}
                                </div>
                            </div>
                            <i class="fas fa-chevron-right" style="color:var(--grigio-300);"></i>
                        </div>`).join('')}
                </div>` : `
                <div class="od-empty-state" style="padding:2rem;">
                    <i class="fas fa-puzzle-piece" style="font-size:2rem; opacity:0.3;"></i>
                    <p>Nessun componente derivato da questo prodotto</p>
                </div>`}
            </div>`;
        } catch (error) {
            console.error('[OdPortafoglio] Errore componenti:', error);
            container.innerHTML = '<p class="od-empty-text">Errore nel caricamento</p>';
        }
    }

    // =========================================================================
    // CREAZIONE / MODIFICA PRODOTTO
    // =========================================================================

    function showCreaProdotto() {
        _showProdottoModal(null);
    }

    function _editProdotto() {
        _showProdottoModal(_currentProdotto);
    }

    function _showProdottoModal(prodotto) {
        const isEdit = !!prodotto;
        const p = prodotto || {};

        const overlay = document.createElement('div');
        overlay.className = 'od-modal-overlay';
        overlay.id = 'odModalOverlay';
        overlay.innerHTML = `
        <div class="od-modal od-modal-lg">
            <div class="od-modal-header">
                <h2><i class="fas fa-${isEdit ? 'pen' : 'plus'}"></i> ${isEdit ? 'Modifica' : 'Nuovo'} Prodotto</h2>
                <button class="od-modal-close" onclick="OdPortafoglio._closeModal()"><i class="fas fa-times"></i></button>
            </div>
            <div class="od-modal-body">
                <form id="odFormProdotto">
                    <div class="od-form-grid">
                        <div class="od-form-group od-form-full">
                            <label>Nome Prodotto *</label>
                            <input type="text" id="odProdNome" value="${OfficinaDigitale.escHtml(p.nome || '')}" required placeholder="es. ChatBot Comunale AI" class="od-input">
                        </div>
                        <div class="od-form-group od-form-full">
                            <label>Tagline <small>(max 140 caratteri)</small></label>
                            <input type="text" id="odProdTagline" value="${OfficinaDigitale.escHtml(p.tagline || '')}" maxlength="140" placeholder="Frase commerciale breve" class="od-input">
                        </div>
                        <div class="od-form-group">
                            <label>Stato</label>
                            <select id="odProdStato" class="od-input">
                                ${STATI_PRODOTTO.map(s => `<option value="${s.value}" ${p.stato === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
                            </select>
                        </div>
                        <div class="od-form-group">
                            <label>Categoria</label>
                            <select id="odProdCategoria" class="od-input">
                                <option value="">Seleziona...</option>
                                ${CATEGORIE.map(c => `<option value="${c}" ${p.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}
                            </select>
                        </div>
                        <div class="od-form-group">
                            <label>Standalone</label>
                            <select id="odProdStandalone" class="od-input">
                                <option value="false" ${!p.standalone ? 'selected' : ''}>No</option>
                                <option value="true" ${p.standalone ? 'selected' : ''}>Sì</option>
                            </select>
                        </div>
                        <div class="od-form-group">
                            <label>Integrabile App</label>
                            <select id="odProdIntegrabile" class="od-input">
                                <option value="false" ${!p.integrabileApp ? 'selected' : ''}>No</option>
                                <option value="true" ${p.integrabileApp ? 'selected' : ''}>Sì</option>
                            </select>
                        </div>
                        <div class="od-form-group od-form-full">
                            <label>Descrizione</label>
                            <textarea id="odProdDescrizione" rows="4" class="od-input" placeholder="Descrizione completa del prodotto...">${p.descrizione || ''}</textarea>
                        </div>
                        <div class="od-form-group od-form-full">
                            <label>URL Immagine Copertina</label>
                            <input type="url" id="odProdImmagine" value="${p.immagineCopertina || ''}" placeholder="https://..." class="od-input">
                        </div>

                        <div class="od-form-separator">Documentazione Tecnica</div>

                        <div class="od-form-group od-form-full">
                            <label>Repository GitHub</label>
                            <input type="url" id="odProdRepo" value="${p.repoGithub || ''}" placeholder="https://github.com/..." class="od-input">
                        </div>
                        <div class="od-form-group">
                            <label>Branch Principale</label>
                            <input type="text" id="odProdBranch" value="${p.branchPrincipale || ''}" placeholder="main" class="od-input">
                        </div>
                        <div class="od-form-group">
                            <label>README Link</label>
                            <input type="url" id="odProdReadme" value="${p.readmeLink || ''}" placeholder="https://github.com/.../README.md" class="od-input">
                        </div>
                        <div class="od-form-group od-form-full">
                            <label>Stack Tecnologico <small>(separati da virgola)</small></label>
                            <input type="text" id="odProdStack" value="${(p.stackTecnologico || []).join(', ')}" placeholder="Node.js, Firebase, OpenAI API" class="od-input">
                        </div>

                        <div class="od-form-separator">Materiali Commerciali</div>

                        <div class="od-form-group">
                            <label>Link Presentazione</label>
                            <input type="url" id="odProdPresentazione" value="${p.presentazione || ''}" placeholder="https://..." class="od-input">
                        </div>
                        <div class="od-form-group">
                            <label>Link Demo</label>
                            <input type="url" id="odProdDemo" value="${p.demoLink || ''}" placeholder="https://..." class="od-input">
                        </div>
                        <div class="od-form-group">
                            <label>Video Demo</label>
                            <input type="url" id="odProdVideo" value="${p.videoDemo || ''}" placeholder="https://..." class="od-input">
                        </div>
                    </div>
                </form>
            </div>
            <div class="od-modal-footer">
                <button class="btn btn-secondary" onclick="OdPortafoglio._closeModal()" style="border-radius:10px;">Annulla</button>
                <button class="btn btn-primary" onclick="OdPortafoglio._saveProdotto('${p.id || ''}')" style="border-radius:10px;">
                    <i class="fas fa-save"></i> ${isEdit ? 'Salva Modifiche' : 'Crea Prodotto'}
                </button>
            </div>
        </div>`;

        document.body.appendChild(overlay);
        setTimeout(() => overlay.classList.add('visible'), 10);
    }

    async function _saveProdotto(existingId) {
        const nome = document.getElementById('odProdNome').value.trim();
        if (!nome) {
            UI.showError('Il nome del prodotto è obbligatorio');
            return;
        }

        const data = {
            nome,
            tagline: document.getElementById('odProdTagline').value.trim(),
            stato: document.getElementById('odProdStato').value,
            categoria: document.getElementById('odProdCategoria').value,
            standalone: document.getElementById('odProdStandalone').value === 'true',
            integrabileApp: document.getElementById('odProdIntegrabile').value === 'true',
            descrizione: document.getElementById('odProdDescrizione').value.trim(),
            immagineCopertina: document.getElementById('odProdImmagine').value.trim(),
            repoGithub: document.getElementById('odProdRepo').value.trim(),
            branchPrincipale: document.getElementById('odProdBranch').value.trim(),
            readmeLink: document.getElementById('odProdReadme').value.trim(),
            stackTecnologico: document.getElementById('odProdStack').value.split(',').map(s => s.trim()).filter(Boolean),
            presentazione: document.getElementById('odProdPresentazione').value.trim(),
            demoLink: document.getElementById('odProdDemo').value.trim(),
            videoDemo: document.getElementById('odProdVideo').value.trim(),
            aggiornatoIl: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            if (existingId) {
                await db.collection(COL).doc(existingId).update(data);
                UI.showNotification('Prodotto aggiornato', 'success');
                _closeModal();
                renderDettaglio(existingId);
            } else {
                data.creatoIl = firebase.firestore.FieldValue.serverTimestamp();
                data.creatoDa = AuthService.currentUser?.uid || '';
                data.creatoDaNome = AuthService.currentUserData ? `${AuthService.currentUserData.nome} ${AuthService.currentUserData.cognome}` : '';
                data.ordine = _prodotti.length + 1;
                data.comuniAttivi = [];
                data.comuniPilota = [];
                data.teamSviluppo = [];

                const docRef = await db.collection(COL).add(data);
                UI.showNotification('Prodotto creato!', 'success');
                _closeModal();
                renderDettaglio(docRef.id);
            }
        } catch (error) {
            console.error('[OdPortafoglio] Errore salvataggio:', error);
            UI.showError('Errore nel salvataggio: ' + error.message);
        }
    }

    // =========================================================================
    // CHANGELOG — Aggiunta entry
    // =========================================================================

    function _addChangelog() {
        if (!_currentProdotto) return;

        const overlay = document.createElement('div');
        overlay.className = 'od-modal-overlay';
        overlay.id = 'odModalOverlay';
        overlay.innerHTML = `
        <div class="od-modal">
            <div class="od-modal-header">
                <h2><i class="fas fa-plus"></i> Nuova Entry Changelog</h2>
                <button class="od-modal-close" onclick="OdPortafoglio._closeModal()"><i class="fas fa-times"></i></button>
            </div>
            <div class="od-modal-body">
                <div class="od-form-grid">
                    <div class="od-form-group">
                        <label>Versione</label>
                        <input type="text" id="odClVersion" placeholder="es. 1.2.0" class="od-input">
                    </div>
                    <div class="od-form-group">
                        <label>Tipo</label>
                        <select id="odClTipo" class="od-input">
                            ${TIPI_CHANGELOG.map(t => `<option value="${t}">${t}</option>`).join('')}
                        </select>
                    </div>
                    <div class="od-form-group od-form-full">
                        <label>Descrizione *</label>
                        <textarea id="odClDescrizione" rows="3" class="od-input" placeholder="Cosa è cambiato..." required></textarea>
                    </div>
                </div>
            </div>
            <div class="od-modal-footer">
                <button class="btn btn-secondary" onclick="OdPortafoglio._closeModal()" style="border-radius:10px;">Annulla</button>
                <button class="btn btn-primary" onclick="OdPortafoglio._saveChangelog()" style="border-radius:10px;">
                    <i class="fas fa-save"></i> Aggiungi
                </button>
            </div>
        </div>`;

        document.body.appendChild(overlay);
        setTimeout(() => overlay.classList.add('visible'), 10);
    }

    async function _saveChangelog() {
        const descrizione = document.getElementById('odClDescrizione').value.trim();
        if (!descrizione) {
            UI.showError('La descrizione è obbligatoria');
            return;
        }

        try {
            await db.collection(COL_CHANGELOG).add({
                prodottoId: _currentProdotto.id,
                versione: document.getElementById('odClVersion').value.trim(),
                tipo: document.getElementById('odClTipo').value,
                descrizione,
                data: firebase.firestore.FieldValue.serverTimestamp(),
                autoreId: AuthService.currentUser?.uid || '',
                autoreNome: AuthService.currentUserData ? `${AuthService.currentUserData.nome} ${AuthService.currentUserData.cognome}` : ''
            });

            UI.showNotification('Entry aggiunta al changelog', 'success');
            _closeModal();
            _switchTab('changelog');
        } catch (error) {
            console.error('[OdPortafoglio] Errore salvataggio changelog:', error);
            UI.showError('Errore: ' + error.message);
        }
    }

    // =========================================================================
    // COMPONENTE DERIVATO
    // =========================================================================

    function _creaComponenteDerivato() {
        // Carica il modulo catalogo e apri il form con prodotto padre precompilato
        OfficinaDigitale.loadModule('catalogo').then(() => {
            if (typeof OdCatalogo !== 'undefined' && typeof OdCatalogo.showCreaComponente === 'function') {
                OdCatalogo.showCreaComponente({ prodottoPadreId: _currentProdotto.id, prodottoPadreNome: _currentProdotto.nome });
            } else {
                UI.showNotification('Modulo Catalogo non disponibile', 'warning');
            }
        });
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    function _renderUserChip(user) {
        if (!user) return '';
        const nome = user.nome || user.id || '?';
        const iniziali = nome.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
        return `
        <div class="od-user-chip">
            <div class="od-user-avatar">${iniziali}</div>
            <span>${OfficinaDigitale.escHtml(nome)}</span>
        </div>`;
    }

    function _getCategoriaIcon(cat) {
        const icons = {
            'AI': 'fa-brain',
            'Mobilità': 'fa-bus',
            'Democrazia Partecipativa': 'fa-vote-yea',
            'Sicurezza': 'fa-shield-alt',
            'Servizi al Cittadino': 'fa-hands-helping',
            'Comunicazione': 'fa-bullhorn',
            'Ambiente': 'fa-leaf',
            'Altro': 'fa-cube'
        };
        return icons[cat] || 'fa-cube';
    }

    function _closeModal() {
        const overlay = document.getElementById('odModalOverlay');
        if (overlay) {
            overlay.classList.remove('visible');
            setTimeout(() => overlay.remove(), 300);
        }
    }

    function _applyFilters() {
        _filtroStato = document.getElementById('odFiltroProdStato')?.value || 'tutti';
        _renderList();
    }

    function _setView(mode) {
        _viewMode = mode;
        document.querySelectorAll('.od-view-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.od-view-btn[onclick*="${mode}"]`)?.classList.add('active');
        _renderList();
    }

    // =========================================================================
    // STYLES SPECIFICI PORTAFOGLIO
    // =========================================================================

    function _addPortafoglioStyles() {
        if (document.getElementById('od-portafoglio-styles')) return;
        const style = document.createElement('style');
        style.id = 'od-portafoglio-styles';
        style.textContent = `
/* ===== PORTAFOGLIO PRODOTTI — Styles ===== */

/* Back button */
.od-back-btn { width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--grigio-300); background: #fff; color: var(--grigio-700); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s; flex-shrink: 0; }
.od-back-btn:hover { border-color: var(--blu-500); color: var(--blu-700); background: var(--blu-100); }

/* Header */
.od-header-actions { display: flex; gap: 0.5rem; align-items: center; }
.od-det-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
.od-det-header-info { flex: 1; min-width: 0; }

/* Toolbar */
.od-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
.od-filters { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.od-select { padding: 0.4375rem 0.75rem; border-radius: 10px; border: 1px solid var(--grigio-300); font-size: 0.8125rem; font-family: inherit; background: #fff; color: var(--grigio-700); }
.od-view-toggle { display: flex; gap: 2px; background: var(--grigio-100); border-radius: 10px; padding: 2px; }
.od-view-btn { width: 32px; height: 32px; border-radius: 8px; border: none; background: transparent; color: var(--grigio-500); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
.od-view-btn.active { background: #fff; color: var(--blu-700); box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

/* Product Grid */
.od-prod-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
.od-prod-card { background: #fff; border-radius: 16px; border: 1px solid var(--grigio-300); overflow: hidden; cursor: pointer; transition: all 0.2s; }
.od-prod-card:hover { border-color: var(--blu-300); box-shadow: 0 4px 16px rgba(0,0,0,0.08); transform: translateY(-2px); }
.od-prod-card-cover { height: 140px; display: flex; align-items: center; justify-content: center; position: relative; }
.od-prod-stato-badge { position: absolute; top: 10px; right: 10px; padding: 4px 10px; border-radius: 999px; font-size: 0.6875rem; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 4px; }
.od-prod-card-body { padding: 1rem; }
.od-prod-card-title { font-size: 1rem; font-weight: 700; color: var(--grigio-900); margin: 0 0 4px; }
.od-prod-card-tagline { font-size: 0.8125rem; color: var(--grigio-500); margin: 0 0 0.5rem; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.od-prod-card-meta { display: flex; flex-wrap: wrap; gap: 0.375rem; align-items: center; font-size: 0.75rem; }
.od-comuni-count { color: var(--grigio-500); display: flex; align-items: center; gap: 3px; }
.od-standalone-badge { background: #EDE7F6; color: #5E35B1; padding: 1px 6px; border-radius: 999px; font-size: 0.625rem; font-weight: 600; }

/* Product List */
.od-prod-list { display: flex; flex-direction: column; gap: 0.5rem; }
.od-prod-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.875rem 1rem; background: #fff; border-radius: 12px; border: 1px solid var(--grigio-300); cursor: pointer; transition: all 0.15s; }
.od-prod-row:hover { border-color: var(--blu-300); background: var(--blu-100); }
.od-prod-row-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1rem; flex-shrink: 0; }
.od-prod-row-body { flex: 1; min-width: 0; }
.od-prod-row-title { font-size: 0.875rem; font-weight: 700; color: var(--grigio-900); }
.od-prod-row-meta { display: flex; flex-wrap: wrap; gap: 0.375rem; align-items: center; margin-top: 2px; font-size: 0.75rem; color: var(--grigio-500); }

/* Tabs */
.od-tabs { display: flex; gap: 0; border-bottom: 2px solid var(--grigio-100); margin-bottom: 1.25rem; overflow-x: auto; -webkit-overflow-scrolling: touch; }
.od-tab { padding: 0.625rem 1rem; border: none; background: none; font-size: 0.8125rem; font-weight: 600; color: var(--grigio-500); cursor: pointer; white-space: nowrap; position: relative; display: flex; align-items: center; gap: 0.375rem; font-family: inherit; transition: color 0.15s; }
.od-tab:hover { color: var(--blu-500); }
.od-tab.active { color: var(--blu-700); }
.od-tab.active::after { content: ''; position: absolute; bottom: -2px; left: 0; right: 0; height: 2px; background: var(--blu-700); border-radius: 2px 2px 0 0; }
.od-tab i { font-size: 0.75rem; }
.od-tab-content { min-height: 200px; }

/* Detail Grid */
.od-detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; }
.od-detail-grid-narrow { grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }
.od-detail-stack { display: flex; flex-direction: column; gap: 1rem; }
.od-detail-card { background: #fff; border-radius: 14px; border: 1px solid var(--grigio-300); padding: 1rem 1.25rem; }
.od-detail-card-title { font-size: 0.8125rem; font-weight: 700; color: var(--grigio-900); margin: 0 0 0.75rem; display: flex; align-items: center; gap: 0.5rem; }
.od-detail-card-title i { color: var(--blu-500); font-size: 0.75rem; }
.od-detail-content { font-size: 0.8125rem; color: var(--grigio-700); line-height: 1.5; }
.od-rich-text { white-space: pre-wrap; word-wrap: break-word; }

/* Fields */
.od-detail-fields { display: flex; flex-direction: column; gap: 0.5rem; }
.od-field-row { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.375rem 0; border-bottom: 1px solid var(--grigio-100); }
.od-field-row:last-child { border-bottom: none; }
.od-field-label { font-size: 0.75rem; font-weight: 600; color: var(--grigio-500); min-width: 120px; flex-shrink: 0; }
.od-field-value { font-size: 0.8125rem; color: var(--grigio-900); flex: 1; }

/* Tags */
.od-tags-list { display: flex; flex-wrap: wrap; gap: 0.375rem; }
.od-tech-tag { background: var(--blu-100); color: var(--blu-700); padding: 3px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }

/* Comuni chips */
.od-comuni-list { display: flex; flex-wrap: wrap; gap: 0.375rem; }
.od-comune-chip { background: var(--grigio-100); color: var(--grigio-700); padding: 4px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: all 0.15s; }
.od-comune-chip:hover { background: var(--blu-100); color: var(--blu-700); }

/* User chip */
.od-user-chip { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0; }
.od-user-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--blu-700); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 0.6875rem; font-weight: 700; }

/* Status badge large */
.od-stato-badge-lg { padding: 4px 12px; border-radius: 999px; font-size: 0.75rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; }

/* Changelog */
.od-changelog-list { display: flex; flex-direction: column; gap: 0; padding-left: 1rem; border-left: 2px solid var(--grigio-300); }
.od-changelog-entry { display: flex; gap: 0.75rem; padding: 0.75rem 0; position: relative; }
.od-changelog-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; position: relative; left: -1.375rem; }
.od-changelog-body { flex: 1; margin-left: -0.625rem; }
.od-changelog-header { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 4px; }
.od-changelog-date { font-size: 0.75rem; font-weight: 700; color: var(--grigio-500); }
.od-changelog-version { background: var(--blu-100); color: var(--blu-700); padding: 1px 6px; border-radius: 999px; font-size: 0.625rem; font-weight: 700; }
.od-changelog-type { font-size: 0.6875rem; font-weight: 700; }
.od-changelog-desc { font-size: 0.8125rem; color: var(--grigio-700); line-height: 1.4; }
.od-changelog-author { font-size: 0.6875rem; color: var(--grigio-500); margin-top: 4px; }

/* Modal */
.od-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 1rem; opacity: 0; transition: opacity 0.2s; }
.od-modal-overlay.visible { opacity: 1; }
.od-modal { background: #fff; border-radius: 20px; width: 100%; max-width: 640px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 24px 48px rgba(0,0,0,0.2); }
.od-modal-lg { max-width: 780px; }
.od-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--grigio-100); }
.od-modal-header h2 { font-size: 1.125rem; font-weight: 700; color: var(--grigio-900); margin: 0; display: flex; align-items: center; gap: 0.5rem; }
.od-modal-close { width: 32px; height: 32px; border-radius: 8px; border: none; background: var(--grigio-100); color: var(--grigio-700); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.od-modal-body { padding: 1.5rem; overflow-y: auto; flex: 1; }
.od-modal-footer { display: flex; justify-content: flex-end; gap: 0.5rem; padding: 1rem 1.5rem; border-top: 1px solid var(--grigio-100); }

/* Form */
.od-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.875rem; }
.od-form-group { display: flex; flex-direction: column; gap: 0.25rem; }
.od-form-group label { font-size: 0.75rem; font-weight: 600; color: var(--grigio-700); }
.od-form-group label small { font-weight: 400; color: var(--grigio-500); }
.od-form-full { grid-column: 1 / -1; }
.od-input { padding: 0.5rem 0.75rem; border-radius: 10px; border: 1px solid var(--grigio-300); font-size: 0.8125rem; font-family: inherit; color: var(--grigio-900); transition: border-color 0.15s; }
.od-input:focus { outline: none; border-color: var(--blu-500); box-shadow: 0 0 0 3px rgba(20,82,132,0.1); }
textarea.od-input { resize: vertical; }
.od-form-separator { grid-column: 1 / -1; font-size: 0.75rem; font-weight: 700; color: var(--blu-700); text-transform: uppercase; letter-spacing: 0.5px; padding-top: 0.5rem; border-top: 1px solid var(--grigio-100); margin-top: 0.25rem; }

@media (max-width: 640px) {
    .od-form-grid { grid-template-columns: 1fr; }
    .od-prod-grid { grid-template-columns: 1fr; }
    .od-detail-grid { grid-template-columns: 1fr; }
    .od-tab span { display: none; }
    .od-det-header { flex-direction: column; align-items: flex-start; }
}
`;
        document.head.appendChild(style);
    }

    // =========================================================================
    // INTEGRAZIONE GITHUB API (Fase 4)
    // =========================================================================

    /**
     * Parsa un URL GitHub e restituisce owner e repo.
     * Supporta: https://github.com/owner/repo, https://github.com/owner/repo.git, etc.
     */
    function _parseGithubUrl(url) {
        if (!url) return null;
        const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
        if (match) return { owner: match[1], repo: match[2] };
        return null;
    }

    /**
     * Carica dati live da GitHub (info repo, ultimi commit, issues aperte, README).
     */
    async function _loadGithubData(prodottoId) {
        const p = _currentProdotto;
        if (!p || !p.repoGithub) { UI.showError('URL repository GitHub mancante'); return; }

        const parsed = _parseGithubUrl(p.repoGithub);
        if (!parsed) { UI.showError('URL GitHub non valido'); return; }

        const panel = document.getElementById('odGithubLivePanel');
        if (!panel) return;

        panel.style.display = 'block';
        panel.innerHTML = `
            <div style="text-align:center;padding:1rem;">
                <i class="fas fa-spinner fa-spin" style="color:var(--blu-500);"></i>
                <span style="color:var(--grigio-500);font-size:0.85rem;margin-left:0.5rem;">Caricamento dati da GitHub...</span>
            </div>`;

        try {
            // Chiamate parallele
            const [repoRes, commitsRes, issuesRes, readmeRes] = await Promise.allSettled([
                fetch('/api/github-proxy', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'repo_info', owner: parsed.owner, repo: parsed.repo })
                }).then(r => r.json()),
                fetch('/api/github-proxy', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'last_commits', owner: parsed.owner, repo: parsed.repo })
                }).then(r => r.json()),
                fetch('/api/github-proxy', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'open_issues', owner: parsed.owner, repo: parsed.repo })
                }).then(r => r.json()),
                fetch('/api/github-proxy', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'readme', owner: parsed.owner, repo: parsed.repo })
                }).then(r => r.json())
            ]);

            let html = `<div style="border-top:1px solid var(--grigio-300);padding-top:0.75rem;">`;

            // --- Info Repo ---
            if (repoRes.status === 'fulfilled' && repoRes.value.success) {
                const repo = repoRes.value.data;
                html += `
                <div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-bottom:0.75rem;">
                    <span style="font-size:0.75rem;padding:3px 10px;border-radius:20px;background:var(--blu-100);color:var(--blu-700);">
                        <i class="fas fa-code-branch"></i> ${repo.default_branch || 'main'}
                    </span>
                    <span style="font-size:0.75rem;padding:3px 10px;border-radius:20px;background:${repo.private ? '#FFF3E0' : 'var(--verde-100)'};color:${repo.private ? '#E65100' : 'var(--verde-700)'};">
                        <i class="fas fa-${repo.private ? 'lock' : 'globe'}"></i> ${repo.private ? 'Privato' : 'Pubblico'}
                    </span>
                    ${repo.language ? `<span style="font-size:0.75rem;padding:3px 10px;border-radius:20px;background:var(--grigio-100);color:var(--grigio-700);">
                        <i class="fas fa-laptop-code"></i> ${repo.language}
                    </span>` : ''}
                    <span style="font-size:0.75rem;padding:3px 10px;border-radius:20px;background:var(--grigio-100);color:var(--grigio-700);">
                        <i class="fas fa-exclamation-circle"></i> ${repo.open_issues_count || 0} issues aperte
                    </span>
                    ${repo.pushed_at ? `<span style="font-size:0.75rem;color:var(--grigio-500);">
                        Ultimo push: ${new Date(repo.pushed_at).toLocaleDateString('it-IT')}
                    </span>` : ''}
                </div>`;
            }

            // --- Ultimi Commit ---
            if (commitsRes.status === 'fulfilled' && commitsRes.value.success && commitsRes.value.data.length > 0) {
                html += `<h5 style="font-size:0.85rem;font-weight:600;color:var(--grigio-900);margin:0.75rem 0 0.5rem;"><i class="fas fa-code-branch"></i> Ultimi Commit</h5>`;
                html += `<div style="display:flex;flex-direction:column;gap:0.35rem;">`;
                commitsRes.value.data.forEach(c => {
                    const dataCommit = c.date ? new Date(c.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
                    html += `
                    <div style="display:flex;align-items:flex-start;gap:0.5rem;padding:0.4rem 0.5rem;background:var(--grigio-100);border-radius:6px;font-size:0.8rem;">
                        <code style="color:var(--blu-700);font-weight:600;flex-shrink:0;">${c.sha}</code>
                        <span style="flex:1;color:var(--grigio-700);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_escHtml(c.message)}</span>
                        <span style="color:var(--grigio-500);flex-shrink:0;font-size:0.7rem;">${c.author} · ${dataCommit}</span>
                    </div>`;
                });
                html += `</div>`;
            }

            // --- Issues Aperte ---
            if (issuesRes.status === 'fulfilled' && issuesRes.value.success && issuesRes.value.data.length > 0) {
                html += `<h5 style="font-size:0.85rem;font-weight:600;color:var(--grigio-900);margin:0.75rem 0 0.5rem;"><i class="fas fa-exclamation-circle"></i> Issues Aperte</h5>`;
                html += `<div style="display:flex;flex-direction:column;gap:0.35rem;">`;
                issuesRes.value.data.forEach(i => {
                    const labelsHtml = i.labels.map(l => `<span style="font-size:0.6rem;padding:1px 6px;border-radius:10px;background:var(--blu-100);color:var(--blu-700);margin-left:4px;">${_escHtml(l)}</span>`).join('');
                    html += `
                    <a href="${i.url}" target="_blank" style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.5rem;background:var(--grigio-100);border-radius:6px;font-size:0.8rem;text-decoration:none;color:inherit;transition:background 0.2s;" onmouseover="this.style.background='var(--blu-100)'" onmouseout="this.style.background='var(--grigio-100)'">
                        <span style="color:var(--verde-700);font-weight:600;flex-shrink:0;">#${i.number}</span>
                        <span style="flex:1;color:var(--grigio-700);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_escHtml(i.title)}</span>
                        ${labelsHtml}
                        <i class="fas fa-external-link-alt" style="color:var(--grigio-300);font-size:0.65rem;"></i>
                    </a>`;
                });
                html += `</div>`;
            }

            // --- README (collapsed) ---
            if (readmeRes.status === 'fulfilled' && readmeRes.value.success && readmeRes.value.data._decoded) {
                const readmeText = readmeRes.value.data._decoded.substring(0, 2000);
                html += `
                <details style="margin-top:0.75rem;">
                    <summary style="font-size:0.85rem;font-weight:600;color:var(--grigio-900);cursor:pointer;padding:0.4rem 0;">
                        <i class="fas fa-book"></i> README.md
                    </summary>
                    <pre style="background:var(--grigio-100);padding:0.75rem;border-radius:8px;font-size:0.75rem;color:var(--grigio-700);overflow-x:auto;max-height:400px;white-space:pre-wrap;word-break:break-word;margin-top:0.5rem;">${_escHtml(readmeText)}${readmeText.length >= 2000 ? '\n\n... (troncato, apri su GitHub per il testo completo)' : ''}</pre>
                </details>`;
            }

            // Messaggio se nessun dato caricato
            if (
                (repoRes.status !== 'fulfilled' || !repoRes.value.success) &&
                (commitsRes.status !== 'fulfilled' || !commitsRes.value.success)
            ) {
                html += `<p style="color:var(--grigio-500);font-size:0.85rem;text-align:center;padding:0.5rem;">
                    <i class="fas fa-info-circle"></i> Impossibile recuperare dati da GitHub. Verifica l'URL e il token.
                </p>`;
            }

            html += `</div>`;
            panel.innerHTML = html;

        } catch (error) {
            console.error('[OdPortafoglio] Errore GitHub:', error);
            panel.innerHTML = `<p style="color:var(--rosso-errore);font-size:0.85rem;padding:0.5rem;">
                <i class="fas fa-exclamation-triangle"></i> Errore nella connessione a GitHub.
            </p>`;
        }
    }

    function _escHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================
    return {
        render,
        renderDettaglio,
        showCreaProdotto,
        _editProdotto,
        _switchTab,
        _applyFilters,
        _setView,
        _closeModal,
        _saveProdotto,
        _addChangelog,
        _saveChangelog,
        _creaComponenteDerivato,
        _loadGithubData
    };
})();

/**
 * Officina Digitale — Catalogo Componenti
 * Modulo lazy-loaded per la libreria di widget, banner, webapp, snippet riutilizzabili.
 * Include anteprima live in iframe, filtri, personalizzazione per comune e istanze salvate.
 */

const OdCatalogo = (() => {
    // =========================================================================
    // STATE
    // =========================================================================
    const COL = OfficinaDigitale.COLLECTIONS.COMPONENTI;
    const COL_ISTANZE = OfficinaDigitale.COLLECTIONS.ISTANZE;

    let _componenti = [];
    let _currentComponente = null;
    let _currentTab = 'info';
    let _filtri = { categoria: 'tutti', complessita: 'tutti', tag: '', search: '' };
    let _formValues = {};

    const CATEGORIE = ['Banner', 'Widget', 'Webapp', 'Landing Page', 'Snippet', 'Pagina Informativa'];
    const COMPLESSITA = [
        { value: 'Semplice', label: 'Semplice', desc: '1-2 file, < 100 righe', color: '#4CAF50' },
        { value: 'Medio', label: 'Medio', desc: 'Funzionalità interattive', color: '#FF9800' },
        { value: 'Avanzato', label: 'Avanzato', desc: 'Logica complessa, API', color: '#F44336' }
    ];

    const TAG_SUGGERITI = [
        'Festività', 'Trasporto', 'Ambiente', 'Cultura', 'Emergenza',
        'Servizi', 'Eventi', 'Turismo', 'Natale', 'Pasqua', 'Estate',
        'Rifiuti', 'Sport', 'Scuola', 'Sanità', 'Modulistica'
    ];

    // =========================================================================
    // LISTA COMPONENTI — Vista Griglia
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
                    <div class="od-header-icon" style="background: linear-gradient(135deg, var(--verde-700), var(--verde-500));">
                        <i class="fas fa-puzzle-piece"></i>
                    </div>
                    <div>
                        <h1 class="od-title">Catalogo Componenti</h1>
                        <p class="od-subtitle">Libreria di widget, banner e webapp riutilizzabili</p>
                    </div>
                </div>
                <div class="od-header-actions">
                    ${OfficinaDigitale.can('componenti.create') ? `
                    <button class="btn btn-primary" onclick="OdCatalogo.showCreaComponente()" style="border-radius:10px; font-size:0.8125rem;">
                        <i class="fas fa-plus"></i> Nuovo Componente
                    </button>` : ''}
                </div>
            </div>

            <!-- Barra ricerca + Filtri -->
            <div class="odc-search-bar">
                <div class="odc-search-input-wrap">
                    <i class="fas fa-search"></i>
                    <input type="text" id="odcSearch" placeholder="Cerca componenti..." class="od-input" oninput="OdCatalogo._applyFilters()">
                </div>
                <select id="odcFiltroCategoria" class="od-select" onchange="OdCatalogo._applyFilters()">
                    <option value="tutti">Tutte le categorie</option>
                    ${CATEGORIE.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
                <select id="odcFiltroComplessita" class="od-select" onchange="OdCatalogo._applyFilters()">
                    <option value="tutti">Tutte le complessità</option>
                    ${COMPLESSITA.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
                </select>
            </div>

            <!-- Ricerca AI Conversazionale -->
            <div class="odc-ai-search-bar" style="margin-bottom:1.25rem;">
                <div style="display:flex;gap:0.5rem;align-items:center;">
                    <div style="flex:1;position:relative;">
                        <i class="fas fa-robot" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--blu-500);font-size:0.9rem;"></i>
                        <input type="text" id="odcAISearch" class="od-input" placeholder="Chiedi all'AI: es. &quot;mi serve qualcosa per gli orari dei bus&quot;" style="padding-left:36px;border:2px solid var(--blu-300);border-radius:10px;background:var(--blu-100);">
                    </div>
                    <button class="btn btn-primary" onclick="OdCatalogo._searchWithAI()" style="border-radius:10px;white-space:nowrap;font-size:0.8125rem;" id="odcAISearchBtn">
                        <i class="fas fa-brain"></i> Cerca con AI
                    </button>
                </div>
                <div id="odcAIResults" style="display:none;"></div>
            </div>

            <!-- Griglia componenti -->
            <div id="odc-grid-container">
                <div class="loading-spinner" style="margin:2rem auto;"></div>
            </div>
        </div>`;

        _addCatalogoStyles();
        await _loadComponenti();
        _initAISearchEnter();
    }

    async function _loadComponenti() {
        try {
            const snap = await db.collection(COL).orderBy('creatoIl', 'desc').get();
            _componenti = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            _renderGrid();
        } catch (error) {
            console.error('[OdCatalogo] Errore caricamento:', error);
            document.getElementById('odc-grid-container').innerHTML = `
                <div class="od-empty-state"><i class="fas fa-exclamation-circle"></i><p>Errore nel caricamento.</p></div>`;
        }
    }

    function _renderGrid() {
        const container = document.getElementById('odc-grid-container');
        if (!container) return;

        let filtered = _componenti;

        // Filtro ricerca
        const search = (document.getElementById('odcSearch')?.value || '').toLowerCase().trim();
        if (search) {
            filtered = filtered.filter(c =>
                (c.nome || '').toLowerCase().includes(search) ||
                (c.descrizione || '').toLowerCase().includes(search) ||
                (c.tagFunzionali || []).some(t => t.toLowerCase().includes(search))
            );
        }

        // Filtro categoria
        const cat = document.getElementById('odcFiltroCategoria')?.value || 'tutti';
        if (cat !== 'tutti') filtered = filtered.filter(c => c.categoria === cat);

        // Filtro complessità
        const comp = document.getElementById('odcFiltroComplessita')?.value || 'tutti';
        if (comp !== 'tutti') filtered = filtered.filter(c => c.complessita === comp);

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="od-empty-state" style="padding:3rem;">
                    <i class="fas fa-puzzle-piece" style="font-size:3rem; opacity:0.3;"></i>
                    <h3>Nessun componente${search || cat !== 'tutti' || comp !== 'tutti' ? ' con questi filtri' : ''}</h3>
                    <p>Inizia aggiungendo il primo componente al catalogo.</p>
                </div>`;
            return;
        }

        container.innerHTML = `
            <div class="odc-count">${filtered.length} componenti</div>
            <div class="odc-grid">
                ${filtered.map(c => _renderComponenteCard(c)).join('')}
            </div>`;
    }

    function _renderComponenteCard(c) {
        const compObj = COMPLESSITA.find(x => x.value === c.complessita) || COMPLESSITA[0];
        const comuniCount = (c.comuniUtilizzatori || []).length;
        const hasPreview = !!c.codiceSorgente || !!c.screenshotUrl;

        return `
        <div class="odc-card" onclick="OdCatalogo.renderDettaglio('${c.id}')">
            <div class="odc-card-preview">
                ${c.screenshotUrl
                    ? `<img src="${c.screenshotUrl}" alt="${OfficinaDigitale.escHtml(c.nome)}" loading="lazy">`
                    : c.codiceSorgente
                        ? `<div class="odc-card-preview-code"><i class="fas fa-code"></i><span>Anteprima disponibile</span></div>`
                        : `<div class="odc-card-preview-empty"><i class="fas ${_getCategoriaIcon(c.categoria)}"></i></div>`
                }
                <div class="odc-card-badges">
                    ${c.categoria ? `<span class="odc-cat-badge">${c.categoria}</span>` : ''}
                    <span class="odc-comp-badge" style="background:${compObj.color}20; color:${compObj.color};">${compObj.label}</span>
                </div>
            </div>
            <div class="odc-card-body">
                <h3 class="odc-card-title">${OfficinaDigitale.escHtml(c.nome || 'Senza nome')}</h3>
                ${c.descrizione ? `<p class="odc-card-desc">${OfficinaDigitale.escHtml(c.descrizione).substring(0, 100)}${c.descrizione.length > 100 ? '...' : ''}</p>` : ''}
                <div class="odc-card-footer">
                    ${c.tagFunzionali && c.tagFunzionali.length > 0
                        ? `<div class="odc-card-tags">${c.tagFunzionali.slice(0, 3).map(t => `<span class="odc-tag">${t}</span>`).join('')}${c.tagFunzionali.length > 3 ? `<span class="odc-tag-more">+${c.tagFunzionali.length - 3}</span>` : ''}</div>`
                        : ''}
                    ${comuniCount > 0 ? `<span class="od-comuni-count"><i class="fas fa-city"></i> ${comuniCount}</span>` : ''}
                </div>
            </div>
        </div>`;
    }

    // =========================================================================
    // DETTAGLIO COMPONENTE
    // =========================================================================

    async function renderDettaglio(componenteId) {
        const container = document.getElementById('mainContent');
        container.innerHTML = '<div class="loading-spinner" style="margin:3rem auto;"></div>';

        try {
            const doc = await db.collection(COL).doc(componenteId).get();
            if (!doc.exists) {
                UI.showError('Componente non trovato');
                render();
                return;
            }
            _currentComponente = { id: doc.id, ...doc.data() };
            _currentTab = 'info';
            _renderDettaglioHTML();
        } catch (error) {
            console.error('[OdCatalogo] Errore dettaglio:', error);
            UI.showError('Errore nel caricamento');
        }
    }

    function _renderDettaglioHTML() {
        const c = _currentComponente;
        if (!c) return;

        const canEdit = OfficinaDigitale.can('componenti.edit');
        const canPersonalizza = OfficinaDigitale.can('componenti.personalizza');
        const compObj = COMPLESSITA.find(x => x.value === c.complessita) || COMPLESSITA[0];
        const container = document.getElementById('mainContent');

        container.innerHTML = `
        <div class="od-container">
            <!-- Header -->
            <div class="od-det-header">
                <button class="od-back-btn" onclick="OdCatalogo.render()">
                    <i class="fas fa-arrow-left"></i>
                </button>
                <div class="odc-det-icon" style="background:${c.colore || 'var(--verde-100)'}; color:${c.colore ? '#fff' : 'var(--verde-700)'};">
                    <i class="fas ${c.icona || 'fa-code'}"></i>
                </div>
                <div class="od-det-header-info">
                    <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                        <h1 class="od-title" style="margin:0;">${OfficinaDigitale.escHtml(c.nome)}</h1>
                        ${c.categoria ? `<span class="odc-cat-badge">${c.categoria}</span>` : ''}
                        <span class="odc-comp-badge" style="background:${compObj.color}20; color:${compObj.color};">${compObj.label}</span>
                        ${c.versione ? `<span class="odc-version-badge">v${c.versione}</span>` : ''}
                    </div>
                    ${c.descrizione ? `<p class="od-subtitle" style="margin-top:4px;">${OfficinaDigitale.escHtml(c.descrizione)}</p>` : ''}
                </div>
                <div class="od-header-actions">
                    ${canPersonalizza ? `
                    <button class="btn btn-primary" onclick="OdCatalogo._startPersonalizza()" style="border-radius:10px; font-size:0.8125rem;">
                        <i class="fas fa-magic"></i> Personalizza
                    </button>` : ''}
                    ${canEdit ? `
                    <button class="btn btn-secondary" onclick="OdCatalogo._editComponente()" style="border-radius:10px; font-size:0.8125rem;">
                        <i class="fas fa-pen"></i> Modifica
                    </button>` : ''}
                </div>
            </div>

            <!-- Tabs -->
            <div class="od-tabs">
                <button class="od-tab active" data-tab="info" onclick="OdCatalogo._switchTab('info')">
                    <i class="fas fa-info-circle"></i> <span>Info</span>
                </button>
                <button class="od-tab" data-tab="anteprima" onclick="OdCatalogo._switchTab('anteprima')">
                    <i class="fas fa-eye"></i> <span>Anteprima</span>
                </button>
                <button class="od-tab" data-tab="codice" onclick="OdCatalogo._switchTab('codice')">
                    <i class="fas fa-code"></i> <span>Codice</span>
                </button>
                <button class="od-tab" data-tab="parametri" onclick="OdCatalogo._switchTab('parametri')">
                    <i class="fas fa-sliders-h"></i> <span>Parametri</span>
                </button>
                <button class="od-tab" data-tab="istanze" onclick="OdCatalogo._switchTab('istanze')">
                    <i class="fas fa-clone"></i> <span>Istanze</span>
                </button>
            </div>

            <div id="odc-tab-content" class="od-tab-content"></div>
        </div>`;

        _addCatalogoStyles();
        _renderTabContent();
    }

    function _switchTab(tab) {
        _currentTab = tab;
        document.querySelectorAll('.od-tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.od-tab[data-tab="${tab}"]`)?.classList.add('active');
        _renderTabContent();
    }

    function _renderTabContent() {
        const content = document.getElementById('odc-tab-content');
        if (!content || !_currentComponente) return;
        const c = _currentComponente;

        switch (_currentTab) {
            case 'info':
                content.innerHTML = _renderTabInfo(c);
                break;
            case 'anteprima':
                content.innerHTML = _renderTabAnteprima(c);
                break;
            case 'codice':
                content.innerHTML = _renderTabCodice(c);
                break;
            case 'parametri':
                content.innerHTML = _renderTabParametri(c);
                break;
            case 'istanze':
                _renderTabIstanze(c, content);
                break;
        }
    }

    // --- TAB: Info ---
    function _renderTabInfo(c) {
        return `
        <div class="od-detail-grid">
            <div class="od-detail-card">
                <h4 class="od-detail-card-title"><i class="fas fa-tags"></i> Dettagli</h4>
                <div class="od-detail-fields">
                    <div class="od-field-row">
                        <span class="od-field-label">Categoria</span>
                        <span class="od-field-value">${c.categoria || '—'}</span>
                    </div>
                    <div class="od-field-row">
                        <span class="od-field-label">Complessità</span>
                        <span class="od-field-value">${c.complessita || '—'}</span>
                    </div>
                    <div class="od-field-row">
                        <span class="od-field-label">Autore</span>
                        <span class="od-field-value">${c.autoreNome || '—'}</span>
                    </div>
                    <div class="od-field-row">
                        <span class="od-field-label">Versione</span>
                        <span class="od-field-value">${c.versione || '—'}</span>
                    </div>
                    <div class="od-field-row">
                        <span class="od-field-label">Creato il</span>
                        <span class="od-field-value">${c.creatoIl?.toDate ? c.creatoIl.toDate().toLocaleDateString('it-IT') : '—'}</span>
                    </div>
                    ${c.prodottoPadreId ? `
                    <div class="od-field-row">
                        <span class="od-field-label">Prodotto Padre</span>
                        <span class="od-field-value"><a href="javascript:void(0)" onclick="OfficinaDigitale.navigateTo('dettaglio-prodotto','${c.prodottoPadreId}')" class="od-link">${OfficinaDigitale.escHtml(c.prodottoPadreNome || 'Vai al prodotto')} <i class="fas fa-arrow-right"></i></a></span>
                    </div>` : ''}
                    ${c.repoGithub ? `
                    <div class="od-field-row">
                        <span class="od-field-label">GitHub</span>
                        <span class="od-field-value">
                            <a href="${c.repoGithub}" target="_blank" class="od-link">${c.repoGithub} <i class="fas fa-external-link-alt"></i></a>
                            <button class="btn btn-sm" onclick="OdCatalogo._loadGithubComponente()" style="margin-left:8px;font-size:0.65rem;border-radius:6px;padding:2px 8px;" title="Carica dati da GitHub">
                                <i class="fas fa-sync-alt"></i>
                            </button>
                            <button class="btn btn-sm" onclick="OdCatalogo._syncCodeFromGithub()" style="margin-left:4px;font-size:0.65rem;border-radius:6px;padding:2px 8px;" title="Sincronizza codice sorgente da GitHub">
                                <i class="fas fa-cloud-download-alt"></i> Sync Codice
                            </button>
                        </span>
                    </div>
                    <div id="odcGithubLivePanel" style="display:none;margin-top:0.5rem;"></div>` : ''}
                </div>
            </div>

            <div class="od-detail-card">
                <h4 class="od-detail-card-title"><i class="fas fa-bookmark"></i> Tag Funzionali</h4>
                <div class="od-detail-content">
                    ${(c.tagFunzionali || []).length > 0
                        ? `<div class="od-tags-list">${c.tagFunzionali.map(t => `<span class="od-tech-tag">${OfficinaDigitale.escHtml(t)}</span>`).join('')}</div>`
                        : '<p class="od-empty-text">Nessun tag</p>'}
                </div>
            </div>

            <div class="od-detail-card">
                <h4 class="od-detail-card-title"><i class="fas fa-city"></i> Comuni Utilizzatori (${(c.comuniUtilizzatori || []).length})</h4>
                <div class="od-detail-content">
                    ${(c.comuniUtilizzatori || []).length > 0
                        ? `<div class="od-comuni-list">${c.comuniUtilizzatori.map(com => `
                            <span class="od-comune-chip" onclick="UI.showPage('dettaglio-cliente','${com.id}')">${OfficinaDigitale.escHtml(com.nome || com.id)}</span>
                        `).join('')}</div>`
                        : '<p class="od-empty-text">Nessun comune utilizza ancora questo componente</p>'}
                </div>
            </div>

            ${c.noteIntegrazione ? `
            <div class="od-detail-card">
                <h4 class="od-detail-card-title"><i class="fas fa-plug"></i> Note di Integrazione</h4>
                <div class="od-detail-content"><div class="od-rich-text">${c.noteIntegrazione}</div></div>
            </div>` : ''}
        </div>`;
    }

    // --- TAB: Anteprima live ---
    function _renderTabAnteprima(c) {
        if (!c.codiceSorgente && !c.screenshotUrl) {
            return `<div class="od-empty-state" style="padding:3rem;">
                <i class="fas fa-eye-slash" style="font-size:2rem; opacity:0.3;"></i>
                <p>Nessuna anteprima disponibile. Aggiungi il codice sorgente o uno screenshot.</p>
            </div>`;
        }

        if (c.screenshotUrl && !c.codiceSorgente) {
            return `<div class="odc-preview-container">
                <img src="${c.screenshotUrl}" alt="Anteprima" style="max-width:100%; border-radius:12px; border:1px solid var(--grigio-300);">
            </div>`;
        }

        // Anteprima live in iframe mobile-first
        return `
        <div class="odc-preview-container">
            <div class="odc-preview-toolbar">
                <span class="odc-preview-label"><i class="fas fa-mobile-alt"></i> Anteprima Mobile (375×667)</span>
                <div class="odc-preview-actions">
                    <button class="od-view-btn active" onclick="OdCatalogo._resizePreview(375, 667, this)" title="Mobile">
                        <i class="fas fa-mobile-alt"></i>
                    </button>
                    <button class="od-view-btn" onclick="OdCatalogo._resizePreview(768, 600, this)" title="Tablet">
                        <i class="fas fa-tablet-alt"></i>
                    </button>
                    <button class="od-view-btn" onclick="OdCatalogo._resizePreview('100%', 600, this)" title="Desktop">
                        <i class="fas fa-desktop"></i>
                    </button>
                </div>
            </div>
            <div class="odc-preview-frame-wrap">
                <iframe id="odcPreviewIframe" class="odc-preview-iframe" sandbox="allow-scripts allow-same-origin"
                    style="width:375px; height:667px;"></iframe>
            </div>
        </div>`;
    }

    function _resizePreview(w, h, btn) {
        const iframe = document.getElementById('odcPreviewIframe');
        if (!iframe) return;
        iframe.style.width = typeof w === 'number' ? w + 'px' : w;
        iframe.style.height = h + 'px';

        document.querySelectorAll('.odc-preview-actions .od-view-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
    }

    // Scrive il codice nell'iframe dopo il render
    function _injectPreview() {
        const iframe = document.getElementById('odcPreviewIframe');
        if (!iframe || !_currentComponente?.codiceSorgente) return;
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(_currentComponente.codiceSorgente);
        doc.close();
    }

    // --- TAB: Codice Sorgente ---
    function _renderTabCodice(c) {
        if (!c.codiceSorgente) {
            return `<div class="od-empty-state" style="padding:3rem;">
                <i class="fas fa-code" style="font-size:2rem; opacity:0.3;"></i>
                <p>Nessun codice sorgente. La fonte di verità è GitHub.</p>
                ${c.repoGithub ? `<a href="${c.repoGithub}" target="_blank" class="btn btn-primary" style="border-radius:10px; margin-top:1rem;">Apri su GitHub <i class="fas fa-external-link-alt"></i></a>` : ''}
            </div>`;
        }

        return `
        <div class="odc-code-container">
            <div class="odc-code-toolbar">
                <span style="font-size:0.75rem; color:var(--grigio-500);">HTML/CSS/JS — ${c.codiceSorgente.length.toLocaleString()} caratteri</span>
                <button class="btn btn-sm" onclick="OdCatalogo._copyCodice()" style="border-radius:8px; font-size:0.75rem; padding:0.25rem 0.75rem;">
                    <i class="fas fa-copy"></i> Copia
                </button>
            </div>
            <pre class="odc-code-block"><code>${OfficinaDigitale.escHtml(c.codiceSorgente)}</code></pre>
        </div>`;
    }

    function _copyCodice() {
        if (!_currentComponente?.codiceSorgente) return;
        navigator.clipboard.writeText(_currentComponente.codiceSorgente).then(() => {
            UI.showNotification('Codice copiato!', 'success');
        }).catch(() => UI.showError('Errore nella copia'));
    }

    // --- TAB: Parametri Personalizzabili ---
    function _renderTabParametri(c) {
        const params = c.parametriPersonalizzabili || [];
        if (params.length === 0) {
            return `<div class="od-empty-state" style="padding:3rem;">
                <i class="fas fa-sliders-h" style="font-size:2rem; opacity:0.3;"></i>
                <p>Nessun parametro personalizzabile definito.</p>
            </div>`;
        }

        return `
        <div class="od-detail-card">
            <h4 class="od-detail-card-title"><i class="fas fa-sliders-h"></i> Parametri Personalizzabili (${params.length})</h4>
            <div class="odc-params-table">
                <div class="odc-params-header">
                    <span>Parametro</span><span>Tipo</span><span>Obbligatorio</span><span>Default</span>
                </div>
                ${params.map(p => `
                    <div class="odc-params-row">
                        <span class="odc-param-name">${OfficinaDigitale.escHtml(p.label || p.id)}</span>
                        <span class="odc-param-type">${p.tipo || 'text'}</span>
                        <span>${p.required ? '<i class="fas fa-check" style="color:var(--verde-700);"></i>' : '<i class="fas fa-minus" style="color:var(--grigio-300);"></i>'}</span>
                        <span class="odc-param-default">${p.default || '—'}</span>
                    </div>
                `).join('')}
            </div>
        </div>`;
    }

    // --- TAB: Istanze (personalizzazioni salvate per comune) ---
    async function _renderTabIstanze(c, container) {
        container.innerHTML = '<div class="loading-spinner" style="margin:2rem auto;"></div>';

        try {
            const snap = await db.collection(COL_ISTANZE)
                .where('componenteId', '==', c.id)
                .orderBy('creatoIl', 'desc')
                .get();

            const istanze = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            container.innerHTML = `
            <div class="od-detail-stack">
                ${istanze.length > 0 ? `
                <div class="odc-istanze-list">
                    ${istanze.map(ist => {
                        const dataStr = ist.creatoIl?.toDate ? ist.creatoIl.toDate().toLocaleDateString('it-IT') : '—';
                        return `
                        <div class="odc-istanza-row">
                            <div class="odc-istanza-info">
                                <span class="odc-istanza-comune"><i class="fas fa-city"></i> ${OfficinaDigitale.escHtml(ist.comuneNome || 'Comune')}</span>
                                <span class="odc-istanza-date">${dataStr}</span>
                                ${ist.creatoDaNome ? `<span class="odc-istanza-author">da ${OfficinaDigitale.escHtml(ist.creatoDaNome)}</span>` : ''}
                            </div>
                            <div class="odc-istanza-actions">
                                <button class="btn btn-sm" onclick="OdCatalogo._downloadIstanza('${ist.id}')" style="border-radius:8px; font-size:0.75rem;">
                                    <i class="fas fa-download"></i> Scarica
                                </button>
                                <button class="btn btn-sm" onclick="OdCatalogo._previewIstanza('${ist.id}')" style="border-radius:8px; font-size:0.75rem;">
                                    <i class="fas fa-eye"></i> Anteprima
                                </button>
                            </div>
                        </div>`;
                    }).join('')}
                </div>` : `
                <div class="od-empty-state" style="padding:2rem;">
                    <i class="fas fa-clone" style="font-size:2rem; opacity:0.3;"></i>
                    <p>Nessuna personalizzazione salvata per questo componente</p>
                </div>`}
            </div>`;
        } catch (error) {
            console.error('[OdCatalogo] Errore istanze:', error);
            container.innerHTML = '<p class="od-empty-text">Errore nel caricamento delle istanze</p>';
        }
    }

    // =========================================================================
    // PERSONALIZZAZIONE PER COMUNE
    // =========================================================================

    // Timer per debounce dell'anteprima live
    let _previewDebounce = null;

    function _startPersonalizza() {
        const c = _currentComponente;
        if (!c) return;

        const params = c.parametriPersonalizzabili || [];
        _formValues = {};

        // Pre-fill defaults
        params.forEach(p => { if (p.default) _formValues[p.id] = p.default; });

        const overlay = document.createElement('div');
        overlay.className = 'od-modal-overlay';
        overlay.id = 'odModalOverlay';
        overlay.innerHTML = `
        <div class="od-modal" style="max-width:1100px;width:95vw;">
            <div class="od-modal-header">
                <h2><i class="fas fa-magic"></i> Personalizza "${OfficinaDigitale.escHtml(c.nome)}"</h2>
                <button class="od-modal-close" onclick="OdCatalogo._closeModal()"><i class="fas fa-times"></i></button>
            </div>
            <div class="od-modal-body" style="padding:0;">
                <!-- Layout split-pane: form a sinistra, anteprima a destra -->
                <div id="odcPersonalizzaSplit" style="display:flex;min-height:500px;">

                    <!-- PANNELLO SINISTRO: Form parametri -->
                    <div id="odcFormPanel" style="flex:1;min-width:0;padding:1.25rem;overflow-y:auto;max-height:70vh;border-right:1px solid var(--grigio-300);">
                        <!-- Selezione comune -->
                        <div class="od-form-group" style="margin-bottom:1.25rem;">
                            <label style="font-weight:700;"><i class="fas fa-city" style="color:var(--blu-700);"></i> Seleziona Comune *</label>
                            <select id="odcComuneSelect" class="od-input" style="width:100%;" onchange="OdCatalogo._updatePreviewLive()">
                                <option value="">— Scegli un comune —</option>
                            </select>
                        </div>

                        ${params.length > 0 ? `
                        <div class="od-form-separator">Parametri</div>
                        <div class="od-form-grid" style="margin-top:0.75rem;">
                            ${params.map(p => `
                            <div class="od-form-group ${p.tipo === 'textarea' ? 'od-form-full' : ''}">
                                <label>${OfficinaDigitale.escHtml(p.label || p.id)} ${p.required ? '*' : ''}</label>
                                ${p.tipo === 'textarea'
                                    ? `<textarea id="odcParam_${p.id}" class="od-input" rows="3" placeholder="${p.placeholder || ''}" oninput="OdCatalogo._updatePreviewLive()">${p.default || ''}</textarea>`
                                    : p.tipo === 'color'
                                        ? `<input type="color" id="odcParam_${p.id}" class="od-input" value="${p.default || '#145284'}" oninput="OdCatalogo._updatePreviewLive()">`
                                        : `<input type="${p.tipo || 'text'}" id="odcParam_${p.id}" class="od-input" value="${p.default || ''}" placeholder="${p.placeholder || ''}" oninput="OdCatalogo._updatePreviewLive()">`
                                }
                            </div>`).join('')}
                        </div>` : '<p class="od-empty-text">Questo componente non ha parametri personalizzabili.</p>'}
                    </div>

                    <!-- PANNELLO DESTRO: Anteprima Live -->
                    <div id="odcPreviewPanel" style="flex:1;min-width:0;display:flex;flex-direction:column;background:#f0f0f0;">
                        <!-- Toolbar anteprima -->
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0.75rem;background:#fff;border-bottom:1px solid var(--grigio-300);">
                            <span style="font-size:0.8rem;font-weight:600;color:var(--grigio-700);">
                                <i class="fas fa-eye"></i> Anteprima Live
                            </span>
                            <div style="display:flex;gap:0.35rem;">
                                <button class="od-preview-size-btn active" data-size="375" onclick="OdCatalogo._setPreviewSize(375, this)" title="Mobile" style="padding:3px 8px;border:1px solid var(--grigio-300);border-radius:4px;background:#fff;cursor:pointer;font-size:0.75rem;">
                                    <i class="fas fa-mobile-alt"></i>
                                </button>
                                <button class="od-preview-size-btn" data-size="768" onclick="OdCatalogo._setPreviewSize(768, this)" title="Tablet" style="padding:3px 8px;border:1px solid var(--grigio-300);border-radius:4px;background:#fff;cursor:pointer;font-size:0.75rem;">
                                    <i class="fas fa-tablet-alt"></i>
                                </button>
                                <button class="od-preview-size-btn" data-size="100" onclick="OdCatalogo._setPreviewSize(100, this)" title="Desktop" style="padding:3px 8px;border:1px solid var(--grigio-300);border-radius:4px;background:#fff;cursor:pointer;font-size:0.75rem;">
                                    <i class="fas fa-desktop"></i>
                                </button>
                            </div>
                        </div>
                        <!-- Contenitore iframe -->
                        <div style="flex:1;display:flex;align-items:flex-start;justify-content:center;padding:1rem;overflow:auto;">
                            <div id="odcPreviewFrame" style="width:375px;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.15);overflow:hidden;transition:width 0.3s ease;">
                                <iframe id="odcLiveIframe" style="width:100%;height:600px;border:none;" sandbox="allow-scripts allow-same-origin"></iframe>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="od-modal-footer">
                <button class="btn btn-secondary" onclick="OdCatalogo._closeModal()" style="border-radius:10px;">Annulla</button>
                <button class="btn btn-primary" onclick="OdCatalogo._generatePersonalizzato()" style="border-radius:10px;">
                    <i class="fas fa-magic"></i> Genera e Salva
                </button>
            </div>
        </div>`;

        document.body.appendChild(overlay);
        setTimeout(() => overlay.classList.add('visible'), 10);

        // Responsive: su mobile il split-pane diventa stack verticale
        _applyPersonalizzaResponsive();
        window.addEventListener('resize', _applyPersonalizzaResponsive);

        // Carica comuni dal CRM
        _loadComuniForSelect();

        // Mostra anteprima iniziale (con valori default)
        setTimeout(() => _updatePreviewLive(), 200);
    }

    /**
     * Rende il layout responsive: stack verticale su schermi < 768px
     */
    function _applyPersonalizzaResponsive() {
        const split = document.getElementById('odcPersonalizzaSplit');
        if (!split) return;
        if (window.innerWidth < 768) {
            split.style.flexDirection = 'column';
            const formPanel = document.getElementById('odcFormPanel');
            const previewPanel = document.getElementById('odcPreviewPanel');
            if (formPanel) { formPanel.style.borderRight = 'none'; formPanel.style.borderBottom = '1px solid var(--grigio-300)'; formPanel.style.maxHeight = '40vh'; }
            if (previewPanel) previewPanel.style.minHeight = '350px';
        } else {
            split.style.flexDirection = 'row';
            const formPanel = document.getElementById('odcFormPanel');
            const previewPanel = document.getElementById('odcPreviewPanel');
            if (formPanel) { formPanel.style.borderRight = '1px solid var(--grigio-300)'; formPanel.style.borderBottom = 'none'; formPanel.style.maxHeight = '70vh'; }
            if (previewPanel) previewPanel.style.minHeight = '';
        }
    }

    /**
     * Aggiorna l'anteprima live nell'iframe con debounce.
     * Sostituisce i {{placeholder}} nel codice sorgente con i valori attuali dei form.
     */
    function _updatePreviewLive() {
        clearTimeout(_previewDebounce);
        _previewDebounce = setTimeout(() => {
            const c = _currentComponente;
            if (!c || !c.codiceSorgente) return;

            const iframe = document.getElementById('odcLiveIframe');
            if (!iframe) return;

            const params = c.parametriPersonalizzabili || [];
            let html = c.codiceSorgente;

            // Sostituisci i placeholder con i valori attuali
            for (const p of params) {
                const el = document.getElementById('odcParam_' + p.id);
                const val = el ? el.value : (p.default || '');
                html = html.replace(new RegExp('\\{\\{' + p.id + '\\}\\}', 'g'), val || `{{${p.id}}}`);
            }

            // Scrivi nell'iframe
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                doc.open();
                doc.write(html);
                doc.close();
            } catch (e) {
                console.warn('[OdCatalogo] Errore aggiornamento anteprima live:', e);
            }
        }, 300); // debounce 300ms
    }

    /**
     * Cambia la dimensione del frame anteprima (mobile/tablet/desktop)
     */
    function _setPreviewSize(size, btnEl) {
        const frame = document.getElementById('odcPreviewFrame');
        if (!frame) return;

        if (size === 100) {
            frame.style.width = '100%';
        } else {
            frame.style.width = size + 'px';
        }

        // Aggiorna pulsanti attivi
        document.querySelectorAll('.od-preview-size-btn').forEach(b => {
            b.classList.remove('active');
            b.style.background = '#fff';
            b.style.color = 'var(--grigio-700)';
        });
        if (btnEl) {
            btnEl.classList.add('active');
            btnEl.style.background = 'var(--blu-700)';
            btnEl.style.color = '#fff';
        }
    }

    async function _loadComuniForSelect() {
        try {
            const snap = await db.collection('clienti').orderBy('ragioneSociale', 'asc').get();
            const select = document.getElementById('odcComuneSelect');
            if (!select) return;
            snap.forEach(doc => {
                const d = doc.data();
                const opt = document.createElement('option');
                opt.value = doc.id;
                opt.textContent = d.ragioneSociale || d.nome || doc.id;
                opt.dataset.nome = d.ragioneSociale || d.nome || '';
                select.appendChild(opt);
            });
        } catch (err) {
            console.warn('[OdCatalogo] Errore caricamento comuni:', err);
        }
    }

    async function _generatePersonalizzato() {
        const c = _currentComponente;
        if (!c || !c.codiceSorgente) {
            UI.showError('Codice sorgente mancante');
            return;
        }

        const comuneSelect = document.getElementById('odcComuneSelect');
        const comuneId = comuneSelect?.value;
        const comuneNome = comuneSelect?.selectedOptions[0]?.dataset?.nome || '';

        if (!comuneId) {
            UI.showError('Seleziona un comune');
            return;
        }

        // Raccogli parametri
        const params = c.parametriPersonalizzabili || [];
        const valori = {};
        for (const p of params) {
            const el = document.getElementById('odcParam_' + p.id);
            const val = el ? el.value.trim() : '';
            if (p.required && !val) {
                UI.showError(`Il campo "${p.label}" è obbligatorio`);
                return;
            }
            valori[p.id] = val;
        }

        // Genera HTML sostituendo i placeholder
        let html = c.codiceSorgente;
        for (const [key, value] of Object.entries(valori)) {
            html = html.replace(new RegExp('\\{\\{' + key + '\\}\\}', 'g'), value);
        }

        // Salva istanza su Firestore
        try {
            const istanzaData = {
                componenteId: c.id,
                componenteNome: c.nome,
                comuneId,
                comuneNome,
                valoriParametri: valori,
                codiceGenerato: html,
                creatoIl: firebase.firestore.FieldValue.serverTimestamp(),
                creatoDa: AuthService.currentUser?.uid || '',
                creatoDaNome: AuthService.currentUserData ? `${AuthService.currentUserData.nome} ${AuthService.currentUserData.cognome}` : ''
            };

            await db.collection(COL_ISTANZE).add(istanzaData);

            // Aggiungi comune ai comuniUtilizzatori se non già presente
            const comuniAttuali = c.comuniUtilizzatori || [];
            if (!comuniAttuali.some(cu => cu.id === comuneId)) {
                comuniAttuali.push({ id: comuneId, nome: comuneNome });
                await db.collection(COL).doc(c.id).update({ comuniUtilizzatori: comuniAttuali });
                _currentComponente.comuniUtilizzatori = comuniAttuali;
            }

            UI.showNotification('Componente personalizzato e salvato!', 'success');
            _closeModal();

            // Offri download
            _downloadCode(html, `${(c.nome || 'componente').toLowerCase().replace(/\s+/g, '_')}_${comuneNome.toLowerCase().replace(/\s+/g, '_')}.html`);

        } catch (error) {
            console.error('[OdCatalogo] Errore salvataggio istanza:', error);
            UI.showError('Errore nel salvataggio: ' + error.message);
        }
    }

    async function _downloadIstanza(istanzaId) {
        try {
            const doc = await db.collection(COL_ISTANZE).doc(istanzaId).get();
            if (!doc.exists) { UI.showError('Istanza non trovata'); return; }
            const data = doc.data();
            const filename = `${(data.componenteNome || 'componente').toLowerCase().replace(/\s+/g, '_')}_${(data.comuneNome || '').toLowerCase().replace(/\s+/g, '_')}.html`;
            _downloadCode(data.codiceGenerato || '', filename);
        } catch (err) {
            UI.showError('Errore download');
        }
    }

    async function _previewIstanza(istanzaId) {
        try {
            const doc = await db.collection(COL_ISTANZE).doc(istanzaId).get();
            if (!doc.exists) return;
            const data = doc.data();

            const overlay = document.createElement('div');
            overlay.className = 'od-modal-overlay';
            overlay.id = 'odModalOverlay';
            overlay.innerHTML = `
            <div class="od-modal od-modal-lg" style="max-width:500px;">
                <div class="od-modal-header">
                    <h2><i class="fas fa-eye"></i> Anteprima — ${OfficinaDigitale.escHtml(data.comuneNome || 'Comune')}</h2>
                    <button class="od-modal-close" onclick="OdCatalogo._closeModal()"><i class="fas fa-times"></i></button>
                </div>
                <div class="od-modal-body" style="padding:0;">
                    <iframe id="odcIstanzaPreview" style="width:100%; height:500px; border:none;" sandbox="allow-scripts allow-same-origin"></iframe>
                </div>
            </div>`;
            document.body.appendChild(overlay);
            setTimeout(() => {
                overlay.classList.add('visible');
                const iframe = document.getElementById('odcIstanzaPreview');
                if (iframe) {
                    const iDoc = iframe.contentDocument || iframe.contentWindow.document;
                    iDoc.open(); iDoc.write(data.codiceGenerato || ''); iDoc.close();
                }
            }, 10);
        } catch (err) {
            UI.showError('Errore anteprima');
        }
    }

    // =========================================================================
    // CREAZIONE / MODIFICA COMPONENTE
    // =========================================================================

    function showCreaComponente(precompile) {
        _showComponenteModal(null, precompile);
    }

    function _editComponente() {
        _showComponenteModal(_currentComponente);
    }

    function _showComponenteModal(componente, precompile) {
        const isEdit = !!componente;
        const c = componente || {};
        const pre = precompile || {};

        const overlay = document.createElement('div');
        overlay.className = 'od-modal-overlay';
        overlay.id = 'odModalOverlay';
        overlay.innerHTML = `
        <div class="od-modal od-modal-lg">
            <div class="od-modal-header">
                <h2><i class="fas fa-${isEdit ? 'pen' : 'plus'}"></i> ${isEdit ? 'Modifica' : 'Nuovo'} Componente</h2>
                <button class="od-modal-close" onclick="OdCatalogo._closeModal()"><i class="fas fa-times"></i></button>
            </div>
            <div class="od-modal-body">
                <div class="od-form-grid">
                    <div class="od-form-group od-form-full">
                        <label>Nome Componente *</label>
                        <input type="text" id="odcNome" value="${OfficinaDigitale.escHtml(c.nome || '')}" required placeholder="es. Banner Festa Patronale" class="od-input">
                    </div>
                    <div class="od-form-group od-form-full">
                        <label>Descrizione</label>
                        <textarea id="odcDescrizione" rows="3" class="od-input" placeholder="Cosa fa questo componente...">${c.descrizione || ''}</textarea>
                    </div>
                    <div class="od-form-group">
                        <label>Categoria</label>
                        <select id="odcCategoria" class="od-input">
                            <option value="">Seleziona...</option>
                            ${CATEGORIE.map(cat => `<option value="${cat}" ${c.categoria === cat ? 'selected' : ''}>${cat}</option>`).join('')}
                        </select>
                    </div>
                    <div class="od-form-group">
                        <label>Complessità</label>
                        <select id="odcComplessita" class="od-input">
                            ${COMPLESSITA.map(comp => `<option value="${comp.value}" ${c.complessita === comp.value ? 'selected' : ''}>${comp.label} — ${comp.desc}</option>`).join('')}
                        </select>
                    </div>
                    <div class="od-form-group od-form-full">
                        <label>Tag Funzionali <small>(separati da virgola)</small></label>
                        <input type="text" id="odcTags" value="${(c.tagFunzionali || []).join(', ')}" placeholder="es. Festività, Natale, Eventi" class="od-input">
                        <div class="odc-tag-suggestions">
                            ${TAG_SUGGERITI.map(t => `<button type="button" class="odc-tag-suggest-btn" onclick="OdCatalogo._addTag('${t}')">${t}</button>`).join('')}
                        </div>
                    </div>
                    <div class="od-form-group">
                        <label>Icona <small>(classe FontAwesome)</small></label>
                        <input type="text" id="odcIcona" value="${c.icona || ''}" placeholder="fa-code" class="od-input">
                    </div>
                    <div class="od-form-group">
                        <label>Colore</label>
                        <input type="color" id="odcColore" value="${c.colore || '#3CA434'}" class="od-input">
                    </div>
                    <div class="od-form-group">
                        <label>Versione</label>
                        <input type="text" id="odcVersione" value="${c.versione || '1.0'}" placeholder="1.0" class="od-input">
                    </div>
                    <div class="od-form-group">
                        <label>URL Screenshot</label>
                        <input type="url" id="odcScreenshot" value="${c.screenshotUrl || ''}" placeholder="https://..." class="od-input">
                    </div>

                    <div class="od-form-separator">Codice e Repository</div>

                    <div class="od-form-group od-form-full">
                        <label>Repository GitHub</label>
                        <input type="url" id="odcRepo" value="${c.repoGithub || ''}" placeholder="https://github.com/..." class="od-input">
                    </div>
                    <div class="od-form-group od-form-full">
                        <label>Codice Sorgente <small>(HTML/CSS/JS completo — solo come riferimento rapido)</small></label>
                        <textarea id="odcCodice" rows="8" class="od-input" style="font-family: monospace; font-size:0.75rem;" placeholder="<!DOCTYPE html>...">${c.codiceSorgente || ''}</textarea>
                    </div>
                    <div class="od-form-group od-form-full">
                        <label>Note di Integrazione</label>
                        <textarea id="odcNote" rows="3" class="od-input" placeholder="Come integrare in GoodBarber...">${c.noteIntegrazione || ''}</textarea>
                    </div>

                    ${pre.prodottoPadreId ? `
                    <input type="hidden" id="odcProdPadreId" value="${pre.prodottoPadreId}">
                    <input type="hidden" id="odcProdPadreNome" value="${OfficinaDigitale.escHtml(pre.prodottoPadreNome || '')}">
                    <div class="od-form-group od-form-full">
                        <label>Prodotto Padre</label>
                        <input type="text" class="od-input" value="${OfficinaDigitale.escHtml(pre.prodottoPadreNome || '')}" disabled>
                    </div>` : ''}

                    <div class="od-form-separator">Parametri Personalizzabili</div>
                    <div class="od-form-group od-form-full">
                        <p style="font-size:0.75rem; color:var(--grigio-500); margin-bottom:0.5rem;">
                            I parametri usano la sintassi <code>{{nome_parametro}}</code> nel codice sorgente.
                        </p>
                        <div id="odcParamsContainer">
                            ${(c.parametriPersonalizzabili || []).map((p, i) => _renderParamField(p, i)).join('')}
                        </div>
                        <button type="button" class="btn btn-sm" onclick="OdCatalogo._addParamField()" style="border-radius:8px; font-size:0.75rem; margin-top:0.5rem;">
                            <i class="fas fa-plus"></i> Aggiungi Parametro
                        </button>
                    </div>
                </div>
            </div>
            <div class="od-modal-footer">
                <button class="btn btn-secondary" onclick="OdCatalogo._closeModal()" style="border-radius:10px;">Annulla</button>
                <button class="btn btn-primary" onclick="OdCatalogo._saveComponente('${c.id || ''}')" style="border-radius:10px;">
                    <i class="fas fa-save"></i> ${isEdit ? 'Salva Modifiche' : 'Crea Componente'}
                </button>
            </div>
        </div>`;

        document.body.appendChild(overlay);
        setTimeout(() => overlay.classList.add('visible'), 10);
    }

    let _paramCounter = 0;

    function _renderParamField(p, index) {
        const id = 'param_' + (index || _paramCounter++);
        return `
        <div class="odc-param-row" data-param-index="${index}">
            <input type="text" placeholder="ID (es. nome_comune)" value="${p?.id || ''}" class="od-input odc-param-id" style="flex:1;">
            <input type="text" placeholder="Label (es. Nome Comune)" value="${p?.label || ''}" class="od-input odc-param-label" style="flex:1.5;">
            <select class="od-input odc-param-tipo" style="flex:0.8;">
                <option value="text" ${p?.tipo === 'text' ? 'selected' : ''}>Testo</option>
                <option value="url" ${p?.tipo === 'url' ? 'selected' : ''}>URL</option>
                <option value="color" ${p?.tipo === 'color' ? 'selected' : ''}>Colore</option>
                <option value="textarea" ${p?.tipo === 'textarea' ? 'selected' : ''}>Testo lungo</option>
                <option value="tel" ${p?.tipo === 'tel' ? 'selected' : ''}>Telefono</option>
                <option value="number" ${p?.tipo === 'number' ? 'selected' : ''}>Numero</option>
            </select>
            <label style="display:flex; align-items:center; gap:4px; font-size:0.75rem; white-space:nowrap;">
                <input type="checkbox" class="odc-param-req" ${p?.required ? 'checked' : ''}> Obb.
            </label>
            <button type="button" onclick="this.closest('.odc-param-row').remove()" style="background:none; border:none; color:#d32f2f; cursor:pointer; padding:4px;">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>`;
    }

    function _addParamField() {
        const container = document.getElementById('odcParamsContainer');
        if (!container) return;
        const div = document.createElement('div');
        div.innerHTML = _renderParamField(null, _paramCounter++);
        container.appendChild(div.firstElementChild);
    }

    function _addTag(tag) {
        const input = document.getElementById('odcTags');
        if (!input) return;
        const current = input.value.split(',').map(t => t.trim()).filter(Boolean);
        if (!current.includes(tag)) {
            current.push(tag);
            input.value = current.join(', ');
        }
    }

    async function _saveComponente(existingId) {
        const nome = document.getElementById('odcNome').value.trim();
        if (!nome) {
            UI.showError('Il nome è obbligatorio');
            return;
        }

        // Raccogli parametri personalizzabili
        const paramRows = document.querySelectorAll('.odc-param-row');
        const parametri = [];
        paramRows.forEach(row => {
            const id = row.querySelector('.odc-param-id')?.value.trim();
            const label = row.querySelector('.odc-param-label')?.value.trim();
            if (id) {
                parametri.push({
                    id,
                    label: label || id,
                    tipo: row.querySelector('.odc-param-tipo')?.value || 'text',
                    required: row.querySelector('.odc-param-req')?.checked || false
                });
            }
        });

        const data = {
            nome,
            descrizione: document.getElementById('odcDescrizione').value.trim(),
            categoria: document.getElementById('odcCategoria').value,
            complessita: document.getElementById('odcComplessita').value,
            tagFunzionali: document.getElementById('odcTags').value.split(',').map(t => t.trim()).filter(Boolean),
            icona: document.getElementById('odcIcona').value.trim() || 'fa-code',
            colore: document.getElementById('odcColore').value,
            versione: document.getElementById('odcVersione').value.trim(),
            screenshotUrl: document.getElementById('odcScreenshot').value.trim(),
            repoGithub: document.getElementById('odcRepo').value.trim(),
            codiceSorgente: document.getElementById('odcCodice').value,
            noteIntegrazione: document.getElementById('odcNote').value.trim(),
            parametriPersonalizzabili: parametri,
            aggiornatoIl: firebase.firestore.FieldValue.serverTimestamp()
        };

        // Prodotto padre (se presente)
        const prodPadreId = document.getElementById('odcProdPadreId')?.value;
        if (prodPadreId) {
            data.prodottoPadreId = prodPadreId;
            data.prodottoPadreNome = document.getElementById('odcProdPadreNome')?.value || '';
        }

        try {
            if (existingId) {
                await db.collection(COL).doc(existingId).update(data);
                UI.showNotification('Componente aggiornato', 'success');
                _closeModal();
                renderDettaglio(existingId);
            } else {
                data.creatoIl = firebase.firestore.FieldValue.serverTimestamp();
                data.creatoDa = AuthService.currentUser?.uid || '';
                data.autoreNome = AuthService.currentUserData ? `${AuthService.currentUserData.nome} ${AuthService.currentUserData.cognome}` : '';
                data.comuniUtilizzatori = [];

                const docRef = await db.collection(COL).add(data);
                UI.showNotification('Componente creato!', 'success');
                _closeModal();
                renderDettaglio(docRef.id);
            }
        } catch (error) {
            console.error('[OdCatalogo] Errore salvataggio:', error);
            UI.showError('Errore: ' + error.message);
        }
    }

    // =========================================================================
    // UTILITIES
    // =========================================================================

    function _getCategoriaIcon(cat) {
        const icons = {
            'Banner': 'fa-image', 'Widget': 'fa-puzzle-piece', 'Webapp': 'fa-globe',
            'Landing Page': 'fa-laptop', 'Snippet': 'fa-code', 'Pagina Informativa': 'fa-file-alt'
        };
        return icons[cat] || 'fa-code';
    }

    function _downloadCode(code, filename) {
        const blob = new Blob([code], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function _closeModal() {
        window.removeEventListener('resize', _applyPersonalizzaResponsive);
        clearTimeout(_previewDebounce);
        const overlay = document.getElementById('odModalOverlay');
        if (overlay) { overlay.classList.remove('visible'); setTimeout(() => overlay.remove(), 300); }
    }

    // =========================================================================
    // RICERCA AI CONVERSAZIONALE (Fase 3)
    // =========================================================================

    let _aiSearching = false;

    async function _searchWithAI() {
        const input = document.getElementById('odcAISearch');
        const query = (input?.value || '').trim();
        if (!query) { UI.showError('Scrivi una domanda per la ricerca AI'); return; }
        if (_aiSearching) return;
        if (_componenti.length === 0) { UI.showError('Nessun componente nel catalogo da analizzare'); return; }

        _aiSearching = true;
        const btn = document.getElementById('odcAISearchBtn');
        const resultsDiv = document.getElementById('odcAIResults');
        if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cerco...';
        if (resultsDiv) {
            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = `
                <div style="padding:1rem;text-align:center;color:var(--grigio-500);">
                    <i class="fas fa-robot fa-bounce" style="font-size:1.5rem;color:var(--blu-500);"></i>
                    <p style="margin-top:0.5rem;">Sto analizzando il catalogo con AI...</p>
                </div>`;
        }

        try {
            // Prepara i metadati dei componenti per Haiku (leggero, no codice sorgente)
            const catalogoPerAI = _componenti.map(c => ({
                id: c.id,
                nome: c.nome || '',
                descrizione: (c.descrizione || '').substring(0, 200),
                categoria: c.categoria || '',
                tag: (c.tagFunzionali || []).join(', '),
                complessita: c.complessita || '',
                comuniUtilizzatori: (c.comuniUtilizzatori || []).map(cu => cu.nome || '').join(', '),
                autoreNome: c.autoreNome || ''
            }));

            const response = await fetch('/api/ai-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: `Sei l'assistente AI dell'Officina Digitale di Comune.Digital. L'utente sta cercando componenti nel catalogo usando linguaggio naturale. Il catalogo contiene ${catalogoPerAI.length} componenti.

CATALOGO COMPONENTI (JSON):
${JSON.stringify(catalogoPerAI)}

DOMANDA DELL'UTENTE: "${query}"

ISTRUZIONI:
- Analizza la domanda e i componenti disponibili.
- Restituisci una risposta JSON con questo formato ESATTO (SOLO JSON, nessun testo fuori):
{
  "risultati": [
    { "id": "id_componente", "rilevanza": 95, "motivo": "breve spiegazione" }
  ],
  "suggerimento": "un consiglio breve per l'utente",
  "nessunRisultato": false
}
- Ordina per rilevanza (0-100). Includi solo componenti pertinenti (rilevanza > 40).
- Se nessun componente corrisponde, imposta "nessunRisultato": true e dai un suggerimento.
- Se l'utente chiede di un comune specifico, filtra per comuniUtilizzatori.
- Rispondi SOLO con JSON valido, niente altro testo.`,
                    appCorrente: null,
                    tutteLeApp: [],
                    contesto: {},
                    conversationHistory: []
                })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Errore API AI');

            // Parsa la risposta AI
            let aiResult;
            try {
                // Estrai JSON dalla risposta (potrebbe avere testo intorno)
                const jsonMatch = data.answer.match(/\{[\s\S]*\}/);
                if (!jsonMatch) throw new Error('Risposta AI non valida');
                aiResult = JSON.parse(jsonMatch[0]);
            } catch (parseErr) {
                // Fallback: mostra la risposta testuale
                if (resultsDiv) {
                    resultsDiv.innerHTML = `
                        <div style="padding:1rem;background:#fff;border-radius:10px;border:1px solid var(--blu-300);margin-top:0.75rem;">
                            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
                                <i class="fas fa-robot" style="color:var(--blu-500);"></i>
                                <strong style="color:var(--blu-700);font-size:0.85rem;">Risposta AI</strong>
                            </div>
                            <p style="color:var(--grigio-700);font-size:0.9rem;line-height:1.5;margin:0;">${OfficinaDigitale.escHtml(data.answer).substring(0, 500)}</p>
                        </div>`;
                }
                return;
            }

            // Renderizza risultati AI
            _renderAIResults(aiResult, query);

        } catch (error) {
            console.error('[OdCatalogo] Errore ricerca AI:', error);
            if (resultsDiv) {
                resultsDiv.innerHTML = `
                    <div style="padding:1rem;background:#FFF3E0;border-radius:10px;border:1px solid #FFB74D;margin-top:0.75rem;">
                        <i class="fas fa-exclamation-triangle" style="color:#E65100;"></i>
                        <span style="color:#E65100;font-size:0.85rem;margin-left:0.5rem;">
                            Ricerca AI non disponibile al momento. Usa la ricerca classica.
                        </span>
                    </div>`;
            }
        } finally {
            _aiSearching = false;
            if (btn) btn.innerHTML = '<i class="fas fa-brain"></i> Cerca con AI';
        }
    }

    function _renderAIResults(aiResult, query) {
        const resultsDiv = document.getElementById('odcAIResults');
        if (!resultsDiv) return;

        if (aiResult.nessunRisultato || !aiResult.risultati || aiResult.risultati.length === 0) {
            resultsDiv.innerHTML = `
                <div style="padding:1rem;background:#fff;border-radius:10px;border:1px solid var(--blu-300);margin-top:0.75rem;">
                    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
                        <i class="fas fa-robot" style="color:var(--blu-500);"></i>
                        <strong style="color:var(--blu-700);font-size:0.85rem;">Nessun risultato per "${OfficinaDigitale.escHtml(query)}"</strong>
                    </div>
                    ${aiResult.suggerimento ? `<p style="color:var(--grigio-700);font-size:0.85rem;margin:0;"><i class="fas fa-lightbulb" style="color:#FFCC00;"></i> ${OfficinaDigitale.escHtml(aiResult.suggerimento)}</p>` : ''}
                </div>`;
            return;
        }

        let html = `
            <div style="padding:1rem;background:#fff;border-radius:10px;border:1px solid var(--blu-300);margin-top:0.75rem;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                        <i class="fas fa-robot" style="color:var(--blu-500);"></i>
                        <strong style="color:var(--blu-700);font-size:0.85rem;">Risultati AI per "${OfficinaDigitale.escHtml(query)}"</strong>
                        <span style="font-size:0.7rem;padding:2px 8px;border-radius:20px;background:var(--blu-100);color:var(--blu-700);">${aiResult.risultati.length} trovati</span>
                    </div>
                    <button onclick="document.getElementById('odcAIResults').style.display='none'" style="background:none;border:none;cursor:pointer;color:var(--grigio-500);font-size:0.8rem;">
                        <i class="fas fa-times"></i> Chiudi
                    </button>
                </div>`;

        aiResult.risultati.forEach(r => {
            const comp = _componenti.find(c => c.id === r.id);
            if (!comp) return;

            const iconeCategorie = {
                'Banner': 'fa-flag', 'Widget': 'fa-th-large', 'Webapp': 'fa-globe',
                'Landing Page': 'fa-file-alt', 'Snippet': 'fa-code', 'Pagina Informativa': 'fa-info-circle'
            };
            const icona = iconeCategorie[comp.categoria] || 'fa-puzzle-piece';
            const rilevanzaColor = r.rilevanza >= 80 ? 'var(--verde-700)' : r.rilevanza >= 60 ? '#FF9800' : 'var(--grigio-500)';

            html += `
                <div style="display:flex;align-items:center;gap:0.75rem;padding:0.6rem 0.75rem;background:var(--grigio-100);border-radius:8px;margin-bottom:0.5rem;cursor:pointer;transition:background 0.2s;"
                     onclick="OdCatalogo.renderDettaglio('${comp.id}')"
                     onmouseover="this.style.background='var(--blu-100)'" onmouseout="this.style.background='var(--grigio-100)'">
                    <div style="width:36px;height:36px;border-radius:8px;background:var(--blu-100);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <i class="fas ${icona}" style="color:var(--blu-700);"></i>
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;color:var(--grigio-900);font-size:0.9rem;">${OfficinaDigitale.escHtml(comp.nome || '')}</div>
                        <div style="font-size:0.75rem;color:var(--grigio-500);">${OfficinaDigitale.escHtml(r.motivo || '')}</div>
                    </div>
                    <div style="text-align:right;flex-shrink:0;">
                        <div style="font-size:0.8rem;font-weight:700;color:${rilevanzaColor};">${r.rilevanza}%</div>
                        <div style="font-size:0.65rem;color:var(--grigio-500);">rilevanza</div>
                    </div>
                    <i class="fas fa-chevron-right" style="color:var(--grigio-300);font-size:0.75rem;"></i>
                </div>`;
        });

        if (aiResult.suggerimento) {
            html += `<p style="color:var(--grigio-600);font-size:0.8rem;margin:0.75rem 0 0;padding-top:0.5rem;border-top:1px solid var(--grigio-200);">
                <i class="fas fa-lightbulb" style="color:#FFCC00;"></i> ${OfficinaDigitale.escHtml(aiResult.suggerimento)}
            </p>`;
        }

        html += `</div>`;
        resultsDiv.innerHTML = html;
    }

    // Supporto ENTER nella barra AI
    function _initAISearchEnter() {
        const input = document.getElementById('odcAISearch');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); _searchWithAI(); }
            });
        }
    }

    function _applyFilters() { _renderGrid(); }

    // =========================================================================
    // INTEGRAZIONE GITHUB API (Fase 4)
    // =========================================================================

    function _parseGithubUrl(url) {
        if (!url) return null;
        const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
        if (match) return { owner: match[1], repo: match[2] };
        return null;
    }

    /**
     * Carica dati live da GitHub per il componente corrente (commit, issues).
     */
    async function _loadGithubComponente() {
        const c = _currentComponente;
        if (!c || !c.repoGithub) return;

        const parsed = _parseGithubUrl(c.repoGithub);
        if (!parsed) { UI.showError('URL GitHub non valido'); return; }

        const panel = document.getElementById('odcGithubLivePanel');
        if (!panel) return;

        panel.style.display = 'block';
        panel.innerHTML = `<div style="text-align:center;padding:0.5rem;"><i class="fas fa-spinner fa-spin" style="color:var(--blu-500);"></i> <span style="font-size:0.8rem;color:var(--grigio-500);">Caricamento...</span></div>`;

        try {
            const [commitsRes, issuesRes] = await Promise.allSettled([
                fetch('/api/github-proxy', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'last_commits', owner: parsed.owner, repo: parsed.repo })
                }).then(r => r.json()),
                fetch('/api/github-proxy', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'open_issues', owner: parsed.owner, repo: parsed.repo })
                }).then(r => r.json())
            ]);

            let html = '';

            if (commitsRes.status === 'fulfilled' && commitsRes.value.success && commitsRes.value.data.length > 0) {
                html += `<div style="font-size:0.8rem;font-weight:600;color:var(--grigio-700);margin-bottom:0.35rem;"><i class="fas fa-code-branch"></i> Ultimi Commit</div>`;
                commitsRes.value.data.slice(0, 3).forEach(cm => {
                    html += `<div style="font-size:0.75rem;padding:3px 6px;background:var(--grigio-100);border-radius:4px;margin-bottom:3px;">
                        <code style="color:var(--blu-700);">${cm.sha}</code> ${OfficinaDigitale.escHtml(cm.message)} <span style="color:var(--grigio-500);">— ${cm.author}</span>
                    </div>`;
                });
            }

            if (issuesRes.status === 'fulfilled' && issuesRes.value.success && issuesRes.value.data.length > 0) {
                html += `<div style="font-size:0.8rem;font-weight:600;color:var(--grigio-700);margin:0.5rem 0 0.35rem;"><i class="fas fa-exclamation-circle"></i> Issues Aperte (${issuesRes.value.data.length})</div>`;
                issuesRes.value.data.slice(0, 5).forEach(i => {
                    html += `<a href="${i.url}" target="_blank" style="display:block;font-size:0.75rem;padding:3px 6px;background:var(--grigio-100);border-radius:4px;margin-bottom:3px;text-decoration:none;color:var(--grigio-700);">
                        <span style="color:var(--verde-700);font-weight:600;">#${i.number}</span> ${OfficinaDigitale.escHtml(i.title)}
                    </a>`;
                });
            }

            if (!html) html = '<p style="font-size:0.8rem;color:var(--grigio-500);text-align:center;">Nessun dato disponibile da GitHub.</p>';
            panel.innerHTML = html;

        } catch (err) {
            console.error('[OdCatalogo] Errore GitHub:', err);
            panel.innerHTML = '<p style="font-size:0.8rem;color:var(--rosso-errore);"><i class="fas fa-exclamation-triangle"></i> Errore connessione GitHub.</p>';
        }
    }

    /**
     * Sincronizza il codice sorgente del componente da GitHub.
     * Cerca un file index.html nella root del percorso specificato nell'URL.
     */
    async function _syncCodeFromGithub() {
        const c = _currentComponente;
        if (!c || !c.repoGithub) return;

        const parsed = _parseGithubUrl(c.repoGithub);
        if (!parsed) { UI.showError('URL GitHub non valido'); return; }

        // Prova a ricavare il path dal URL (es. github.com/owner/repo/tree/main/banner/festa)
        let filePath = 'index.html';
        const pathMatch = c.repoGithub.match(/\/tree\/[^/]+\/(.+)/);
        if (pathMatch) {
            filePath = pathMatch[1].replace(/\/$/, '') + '/index.html';
        }

        if (!confirm(`Vuoi sincronizzare il codice sorgente da GitHub?\nFile: ${filePath}\n\nQuesto sovrascriverà il codice attuale nel CRM.`)) return;

        try {
            UI.showLoading();
            const res = await fetch('/api/github-proxy', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'file_content', owner: parsed.owner, repo: parsed.repo, path: filePath })
            });
            const data = await res.json();

            if (!data.success || !data.data._decoded) {
                throw new Error(data.error || 'File non trovato su GitHub');
            }

            // Aggiorna il codice sorgente nel componente
            await db.collection(COL).doc(c.id).update({
                codiceSorgente: data.data._decoded,
                ultimoAggiornamento: firebase.firestore.FieldValue.serverTimestamp()
            });
            _currentComponente.codiceSorgente = data.data._decoded;

            UI.hideLoading();
            UI.showNotification('Codice sincronizzato da GitHub!', 'success');

            // Ricarica la scheda per aggiornare l'anteprima
            renderDettaglio(c.id);

        } catch (err) {
            UI.hideLoading();
            console.error('[OdCatalogo] Errore sync GitHub:', err);
            UI.showError('Errore sync: ' + (err.message || 'Impossibile recuperare il file'));
        }
    }

    // =========================================================================
    // STYLES
    // =========================================================================

    function _addCatalogoStyles() {
        if (document.getElementById('odc-styles')) return;
        const style = document.createElement('style');
        style.id = 'odc-styles';
        style.textContent = `
/* ===== CATALOGO COMPONENTI ===== */
.odc-search-bar { display: flex; gap: 0.5rem; margin-bottom: 1.25rem; flex-wrap: wrap; align-items: center; }
.odc-search-input-wrap { flex: 1; min-width: 200px; position: relative; }
.odc-search-input-wrap i { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--grigio-500); font-size: 0.8125rem; }
.odc-search-input-wrap input { padding-left: 2.25rem; width: 100%; }
.odc-count { font-size: 0.75rem; color: var(--grigio-500); margin-bottom: 0.75rem; }

/* Grid */
.odc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; }
.odc-card { background: #fff; border-radius: 16px; border: 1px solid var(--grigio-300); overflow: hidden; cursor: pointer; transition: all 0.2s; }
.odc-card:hover { border-color: var(--verde-300); box-shadow: 0 4px 16px rgba(0,0,0,0.08); transform: translateY(-2px); }
.odc-card-preview { height: 140px; background: var(--grigio-100); display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; }
.odc-card-preview img { width: 100%; height: 100%; object-fit: cover; }
.odc-card-preview-code { display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--verde-700); font-size: 0.75rem; }
.odc-card-preview-code i { font-size: 1.5rem; }
.odc-card-preview-empty { color: var(--grigio-300); }
.odc-card-preview-empty i { font-size: 2.5rem; }
.odc-card-badges { position: absolute; top: 8px; left: 8px; display: flex; gap: 4px; }
.odc-cat-badge { background: var(--blu-700); color: #fff; padding: 2px 8px; border-radius: 999px; font-size: 0.625rem; font-weight: 700; }
.odc-comp-badge { padding: 2px 8px; border-radius: 999px; font-size: 0.625rem; font-weight: 700; }
.odc-version-badge { background: var(--grigio-100); color: var(--grigio-700); padding: 2px 8px; border-radius: 999px; font-size: 0.625rem; font-weight: 600; }
.odc-card-body { padding: 0.875rem; }
.odc-card-title { font-size: 0.9375rem; font-weight: 700; color: var(--grigio-900); margin: 0 0 4px; }
.odc-card-desc { font-size: 0.75rem; color: var(--grigio-500); margin: 0 0 0.5rem; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.odc-card-footer { display: flex; align-items: center; justify-content: space-between; }
.odc-card-tags { display: flex; flex-wrap: wrap; gap: 3px; }
.odc-tag { background: var(--grigio-100); color: var(--grigio-700); padding: 1px 6px; border-radius: 999px; font-size: 0.625rem; }
.odc-tag-more { color: var(--grigio-500); font-size: 0.625rem; }

/* Detail icon */
.odc-det-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.125rem; flex-shrink: 0; }

/* Preview */
.odc-preview-container { text-align: center; }
.odc-preview-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem; }
.odc-preview-label { font-size: 0.75rem; color: var(--grigio-500); display: flex; align-items: center; gap: 0.375rem; }
.odc-preview-actions { display: flex; gap: 2px; background: var(--grigio-100); border-radius: 8px; padding: 2px; }
.odc-preview-frame-wrap { display: flex; justify-content: center; background: var(--grigio-100); border-radius: 16px; padding: 1rem; }
.odc-preview-iframe { border: 1px solid var(--grigio-300); border-radius: 12px; background: #fff; box-shadow: 0 4px 16px rgba(0,0,0,0.1); transition: width 0.3s, height 0.3s; }

/* Code */
.odc-code-container { background: #fff; border-radius: 14px; border: 1px solid var(--grigio-300); overflow: hidden; }
.odc-code-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 1rem; background: var(--grigio-100); border-bottom: 1px solid var(--grigio-300); }
.odc-code-block { margin: 0; padding: 1rem; overflow-x: auto; font-size: 0.75rem; line-height: 1.5; max-height: 500px; overflow-y: auto; background: #1e1e1e; color: #d4d4d4; }
.odc-code-block code { font-family: 'Fira Code', 'Consolas', monospace; }

/* Params table */
.odc-params-table { font-size: 0.8125rem; }
.odc-params-header { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 0.5rem; padding: 0.5rem 0; border-bottom: 2px solid var(--grigio-100); font-weight: 700; color: var(--grigio-500); font-size: 0.75rem; }
.odc-params-row { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 0.5rem; padding: 0.5rem 0; border-bottom: 1px solid var(--grigio-100); align-items: center; }
.odc-param-name { font-weight: 600; color: var(--grigio-900); }
.odc-param-type { color: var(--blu-500); font-family: monospace; font-size: 0.75rem; }
.odc-param-default { color: var(--grigio-500); font-size: 0.75rem; }

/* Istanze */
.odc-istanze-list { display: flex; flex-direction: column; gap: 0.5rem; }
.odc-istanza-row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.75rem 1rem; background: #fff; border-radius: 12px; border: 1px solid var(--grigio-300); flex-wrap: wrap; }
.odc-istanza-info { display: flex; align-items: center; gap: 0.75rem; font-size: 0.8125rem; flex-wrap: wrap; }
.odc-istanza-comune { font-weight: 700; color: var(--grigio-900); display: flex; align-items: center; gap: 0.25rem; }
.odc-istanza-date, .odc-istanza-author { font-size: 0.75rem; color: var(--grigio-500); }
.odc-istanza-actions { display: flex; gap: 0.375rem; }

/* Param editor in modal */
.odc-param-row { display: flex; gap: 0.375rem; align-items: center; margin-bottom: 0.375rem; flex-wrap: wrap; }

/* Tag suggestions */
.odc-tag-suggestions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.odc-tag-suggest-btn { background: var(--grigio-100); border: 1px solid var(--grigio-300); color: var(--grigio-700); padding: 2px 8px; border-radius: 999px; font-size: 0.625rem; cursor: pointer; font-family: inherit; transition: all 0.15s; }
.odc-tag-suggest-btn:hover { background: var(--verde-100); border-color: var(--verde-500); color: var(--verde-700); }

@media (max-width: 640px) {
    .odc-grid { grid-template-columns: 1fr; }
    .odc-search-bar { flex-direction: column; }
    .odc-params-header, .odc-params-row { grid-template-columns: 1fr 1fr; }
    .odc-param-row { flex-direction: column; }
}
`;
        document.head.appendChild(style);
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================
    return {
        render,
        renderDettaglio,
        showCreaComponente,
        _editComponente,
        _switchTab,
        _applyFilters,
        _closeModal,
        _saveComponente,
        _addParamField,
        _addTag,
        _startPersonalizza,
        _generatePersonalizzato,
        _downloadIstanza,
        _previewIstanza,
        _copyCodice,
        _resizePreview,
        _updatePreviewLive,
        _setPreviewSize,
        _searchWithAI,
        _loadGithubComponente,
        _syncCodeFromGithub
    };
})();

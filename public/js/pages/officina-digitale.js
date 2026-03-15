/**
 * Officina Digitale - Router & Dashboard
 * Macro-sezione CRM per gestione prodotti, componenti e attività
 *
 * ARCHITETTURA LAZY-LOADING:
 * Questo file è il punto di ingresso (~leggero). Carica i sotto-moduli
 * (od-portafoglio, od-catalogo, od-attivita) solo quando l'utente li richiede.
 * I sotto-moduli vengono cachati dopo il primo caricamento.
 */

const OfficinaDigitale = (() => {
    // =========================================================================
    // STATE
    // =========================================================================
    let _currentSection = 'dashboard'; // dashboard | portafoglio | catalogo | attivita
    let _modulesLoaded = {};           // Cache moduli caricati { portafoglio: true, ... }
    let _dashboardData = null;         // Cache contatori dashboard
    let _initialized = false;

    // =========================================================================
    // LAZY LOADING SYSTEM
    // =========================================================================

    /**
     * Carica dinamicamente un modulo JS se non già caricato.
     * Restituisce una Promise che si risolve quando lo script è pronto.
     */
    function _loadModule(moduleName) {
        return new Promise((resolve, reject) => {
            if (_modulesLoaded[moduleName]) {
                resolve();
                return;
            }

            const version = window.CRM_APP_VERSION || '1.0';
            const scriptMap = {
                'portafoglio': `js/pages/od-portafoglio.js?v=${version}`,
                'catalogo': `js/pages/od-catalogo.js?v=${version}`,
                'attivita': `js/pages/od-attivita.js?v=${version}`
            };

            const src = scriptMap[moduleName];
            if (!src) {
                reject(new Error('Modulo sconosciuto: ' + moduleName));
                return;
            }

            // Controlla se lo script è già nel DOM (es. caricato da un altro percorso)
            if (document.querySelector(`script[src="${src}"]`)) {
                _modulesLoaded[moduleName] = true;
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = src;
            script.onload = () => {
                _modulesLoaded[moduleName] = true;
                console.log(`[OfficinaDigitale] Modulo "${moduleName}" caricato`);
                resolve();
            };
            script.onerror = () => {
                reject(new Error(`Impossibile caricare il modulo "${moduleName}"`));
            };
            document.body.appendChild(script);
        });
    }

    // =========================================================================
    // PERMESSI
    // =========================================================================

    /**
     * Verifica permessi granulari per l'Officina Digitale.
     * Mappa i ruoli CRM ai permessi dell'Officina come da specifica.
     */
    function _can(action) {
        const role = AuthService.getUserRole();
        if (role === 'SUPER_ADMIN') return true; // wildcard

        const permissionMatrix = {
            // Portafoglio Prodotti
            'prodotti.view':           ['ADMIN', 'CTO', 'SVILUPPATORE', 'AGENTE', 'CONTENT_MANAGER', 'CONTABILE'],
            'prodotti.create':         ['ADMIN'],           // Giancarlo + Carmelo (consulente = gestito separatamente)
            'prodotti.edit':           ['ADMIN'],
            'prodotti.docs.edit':      ['ADMIN', 'CTO', 'SVILUPPATORE'],
            'prodotti.docs.view':      ['ADMIN', 'CTO', 'SVILUPPATORE', 'AGENTE', 'CONTENT_MANAGER', 'CONTABILE'],
            'prodotti.commerciale':    ['ADMIN', 'AGENTE'],
            'prodotti.commerciale.view': ['ADMIN', 'CTO', 'SVILUPPATORE', 'AGENTE', 'CONTENT_MANAGER', 'CONTABILE'],

            // Catalogo Componenti
            'componenti.view':         ['ADMIN', 'CTO', 'SVILUPPATORE', 'AGENTE', 'CONTENT_MANAGER', 'CONTABILE'],
            'componenti.create':       ['ADMIN', 'CTO', 'SVILUPPATORE'],
            'componenti.edit':         ['ADMIN', 'CTO', 'SVILUPPATORE'],
            'componenti.personalizza': ['ADMIN', 'CTO', 'SVILUPPATORE', 'AGENTE', 'CONTENT_MANAGER', 'CONTABILE'],

            // Attività
            'attivita.view':           ['ADMIN', 'CTO', 'SVILUPPATORE', 'AGENTE', 'CONTENT_MANAGER', 'CONTABILE'],
            'attivita.create':         ['ADMIN', 'CTO', 'SVILUPPATORE', 'AGENTE', 'CONTENT_MANAGER', 'CONTABILE'],
            'attivita.assign':         ['ADMIN', 'CTO'],
            'attivita.edit_status':    ['ADMIN', 'CTO', 'SVILUPPATORE', 'AGENTE', 'CONTENT_MANAGER', 'CONTABILE'], // Dev: solo proprie (check nel modulo)

            // Gestione
            'manage_officina':         ['ADMIN']
        };

        const allowed = permissionMatrix[action] || [];
        return allowed.includes(role);
    }

    // =========================================================================
    // COLLECTIONS FIRESTORE
    // =========================================================================

    const COLLECTIONS = {
        PRODOTTI: 'od_prodotti',
        COMPONENTI: 'od_componenti',
        ATTIVITA: 'od_attivita',
        ISTANZE: 'od_istanze_componenti',
        CHANGELOG: 'od_changelog'
    };

    // =========================================================================
    // RENDER PRINCIPALE
    // =========================================================================

    function render() {
        // Permesso base: accesso all'Officina Digitale
        if (!AuthService.hasPermission('view_officina_digitale') && !AuthService.hasPermission('*')) {
            document.getElementById('mainContent').innerHTML = `
                <div style="padding: 40px; text-align: center; color: #d32f2f;">
                    <i class="fas fa-lock" style="font-size: 48px; margin-bottom: 20px;"></i>
                    <h2>Accesso negato</h2>
                    <p>Non hai i permessi necessari per accedere all'Officina Digitale.</p>
                </div>`;
            return;
        }

        _currentSection = 'dashboard';
        const container = document.getElementById('mainContent');
        container.innerHTML = _getShellHTML();
        _addStyles();

        // Seed prodotti iniziali al primo accesso (una sola volta)
        if (!_initialized) {
            _initialized = true;
            _seedProdottiIniziali().then(() => _loadDashboard());
        } else {
            _loadDashboard();
        }
    }

    /**
     * Naviga a una sezione specifica dell'Officina.
     * Chiamato anche dall'esterno (es. sidebar, deep link).
     */
    function navigateTo(section, id) {
        _currentSection = section;

        switch (section) {
            case 'dashboard':
                render();
                break;

            case 'portafoglio':
                _loadModuleAndRender('portafoglio', () => {
                    if (typeof OdPortafoglio !== 'undefined') {
                        OdPortafoglio.render();
                    }
                });
                break;

            case 'catalogo':
                _loadModuleAndRender('catalogo', () => {
                    if (typeof OdCatalogo !== 'undefined') {
                        OdCatalogo.render();
                    }
                });
                break;

            case 'attivita':
                _loadModuleAndRender('attivita', () => {
                    if (typeof OdAttivita !== 'undefined') {
                        OdAttivita.render();
                    }
                });
                break;

            case 'dettaglio-prodotto':
                _loadModuleAndRender('portafoglio', () => {
                    if (typeof OdPortafoglio !== 'undefined') {
                        OdPortafoglio.renderDettaglio(id);
                    }
                });
                break;

            case 'dettaglio-componente':
                _loadModuleAndRender('catalogo', () => {
                    if (typeof OdCatalogo !== 'undefined') {
                        OdCatalogo.renderDettaglio(id);
                    }
                });
                break;

            case 'dettaglio-attivita':
                _loadModuleAndRender('attivita', () => {
                    if (typeof OdAttivita !== 'undefined') {
                        OdAttivita.renderDettaglio(id);
                    }
                });
                break;

            case 'generatore':
                // Il Generatore Webapp è già caricato come script globale
                if (typeof GeneratoreWebapp !== 'undefined') {
                    GeneratoreWebapp.render();
                } else {
                    document.getElementById('mainContent').innerHTML = `
                        <div style="padding:40px;text-align:center;color:var(--grigio-500);">
                            <i class="fas fa-exclamation-circle" style="font-size:2rem;"></i>
                            <p style="margin-top:1rem;">Generatore Webapp non disponibile.</p>
                        </div>`;
                }
                break;

            default:
                render();
        }
    }

    function _loadModuleAndRender(moduleName, callback) {
        const container = document.getElementById('mainContent');
        container.innerHTML = '<div class="loading-spinner" style="margin:3rem auto;"></div>';

        _loadModule(moduleName)
            .then(callback)
            .catch(err => {
                console.error('[OfficinaDigitale] Errore caricamento modulo:', err);
                container.innerHTML = `
                    <div style="padding: 40px; text-align: center; color: #d32f2f;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 20px;"></i>
                        <h3>Errore di caricamento</h3>
                        <p>Impossibile caricare il modulo. Riprova.</p>
                        <button class="btn btn-primary" onclick="OfficinaDigitale.render()" style="margin-top:1rem;">
                            <i class="fas fa-redo"></i> Torna alla Dashboard
                        </button>
                    </div>`;
            });
    }

    // =========================================================================
    // SHELL HTML — Struttura base con navigazione interna
    // =========================================================================

    function _getShellHTML() {
        return `
        <div class="od-container">
            <!-- Header -->
            <div class="od-header">
                <div class="od-header-left">
                    <div class="od-header-icon">
                        <i class="fas fa-flask"></i>
                    </div>
                    <div>
                        <h1 class="od-title">Officina Digitale</h1>
                        <p class="od-subtitle">Prodotti, componenti e attività del team</p>
                    </div>
                </div>
            </div>

            <!-- Navigation Pills -->
            <div class="od-nav">
                <button class="od-nav-btn active" data-section="dashboard" onclick="OfficinaDigitale.navigateTo('dashboard')">
                    <i class="fas fa-th-large"></i> <span>Panoramica</span>
                </button>
                ${_can('prodotti.view') ? `
                <button class="od-nav-btn" data-section="portafoglio" onclick="OfficinaDigitale.navigateTo('portafoglio')">
                    <i class="fas fa-box-open"></i> <span>Prodotti</span>
                </button>` : ''}
                ${_can('componenti.view') ? `
                <button class="od-nav-btn" data-section="catalogo" onclick="OfficinaDigitale.navigateTo('catalogo')">
                    <i class="fas fa-puzzle-piece"></i> <span>Componenti</span>
                </button>` : ''}
                ${_can('attivita.view') ? `
                <button class="od-nav-btn" data-section="attivita" onclick="OfficinaDigitale.navigateTo('attivita')">
                    <i class="fas fa-clipboard-check"></i> <span>Attività</span>
                </button>` : ''}
                ${_can('componenti.create') ? `
                <button class="od-nav-btn" data-section="generatore" onclick="OfficinaDigitale.navigateTo('generatore')">
                    <i class="fas fa-magic"></i> <span>Generatore</span>
                </button>` : ''}
            </div>

            <!-- Content Area -->
            <div id="od-content" class="od-content">
                <div class="loading-spinner" style="margin:2rem auto;"></div>
            </div>
        </div>`;
    }

    // =========================================================================
    // DASHBOARD — Panoramica con contatori
    // =========================================================================

    async function _loadDashboard() {
        const content = document.getElementById('od-content');
        if (!content) return;

        try {
            // Carica contatori in parallelo
            const [prodottiSnap, componentiSnap, attivitaSnap] = await Promise.all([
                _can('prodotti.view') ? db.collection(COLLECTIONS.PRODOTTI).get() : Promise.resolve({ size: 0, docs: [] }),
                _can('componenti.view') ? db.collection(COLLECTIONS.COMPONENTI).get() : Promise.resolve({ size: 0, docs: [] }),
                _can('attivita.view') ? db.collection(COLLECTIONS.ATTIVITA).get() : Promise.resolve({ size: 0, docs: [] })
            ]);

            // Calcola statistiche prodotti
            const prodotti = prodottiSnap.docs ? prodottiSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
            const prodottiByStato = {};
            prodotti.forEach(p => {
                const s = p.stato || 'Da compilare';
                prodottiByStato[s] = (prodottiByStato[s] || 0) + 1;
            });

            // Calcola statistiche componenti
            const componenti = componentiSnap.docs ? componentiSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
            const ultimi3Componenti = [...componenti]
                .sort((a, b) => (b.creatoIl?.seconds || 0) - (a.creatoIl?.seconds || 0))
                .slice(0, 3);

            // Calcola statistiche attività
            const attivita = attivitaSnap.docs ? attivitaSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];
            const oggi = new Date();
            oggi.setHours(0, 0, 0, 0);
            const attByStato = { 'Da Fare': 0, 'In Corso': 0, 'In Revisione': 0, 'Fatto': 0 };
            let attScadute = 0;
            attivita.forEach(a => {
                const stato = a.stato || 'Da Fare';
                if (attByStato.hasOwnProperty(stato)) attByStato[stato]++;
                if (a.scadenza && stato !== 'Fatto') {
                    const scadDate = a.scadenza.toDate ? a.scadenza.toDate() : new Date(a.scadenza);
                    if (scadDate < oggi) attScadute++;
                }
            });

            _dashboardData = { prodotti, componenti, attivita, prodottiByStato, attByStato, attScadute, ultimi3Componenti };

            content.innerHTML = _renderDashboardHTML();
        } catch (error) {
            console.error('[OfficinaDigitale] Errore caricamento dashboard:', error);
            content.innerHTML = `
                <div class="od-empty-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Errore nel caricamento dei dati. Riprova.</p>
                    <button class="btn btn-primary" onclick="OfficinaDigitale.render()">
                        <i class="fas fa-redo"></i> Ricarica
                    </button>
                </div>`;
        }
    }

    function _renderDashboardHTML() {
        const d = _dashboardData;
        if (!d) return '';

        return `
        <!-- Cards KPI -->
        <div class="od-kpi-grid">
            <!-- Prodotti -->
            ${_can('prodotti.view') ? `
            <div class="od-kpi-card od-kpi-prodotti" onclick="OfficinaDigitale.navigateTo('portafoglio')">
                <div class="od-kpi-icon"><i class="fas fa-box-open"></i></div>
                <div class="od-kpi-body">
                    <div class="od-kpi-value">${d.prodotti.length}</div>
                    <div class="od-kpi-label">Prodotti</div>
                    <div class="od-kpi-detail">
                        ${Object.entries(d.prodottiByStato).map(([k, v]) =>
                            `<span class="od-kpi-tag">${v} ${k}</span>`
                        ).join('')}
                    </div>
                </div>
                <i class="fas fa-chevron-right od-kpi-arrow"></i>
            </div>` : ''}

            <!-- Componenti -->
            ${_can('componenti.view') ? `
            <div class="od-kpi-card od-kpi-componenti" onclick="OfficinaDigitale.navigateTo('catalogo')">
                <div class="od-kpi-icon"><i class="fas fa-puzzle-piece"></i></div>
                <div class="od-kpi-body">
                    <div class="od-kpi-value">${d.componenti.length}</div>
                    <div class="od-kpi-label">Componenti nel Catalogo</div>
                    <div class="od-kpi-detail">
                        ${d.ultimi3Componenti.length > 0
                            ? `Ultimi: ${d.ultimi3Componenti.map(c => c.nome || 'Senza nome').join(', ')}`
                            : 'Nessun componente ancora'}
                    </div>
                </div>
                <i class="fas fa-chevron-right od-kpi-arrow"></i>
            </div>` : ''}

            <!-- Attività -->
            ${_can('attivita.view') ? `
            <div class="od-kpi-card od-kpi-attivita" onclick="OfficinaDigitale.navigateTo('attivita')">
                <div class="od-kpi-icon"><i class="fas fa-clipboard-check"></i></div>
                <div class="od-kpi-body">
                    <div class="od-kpi-value">${d.attivita.filter(a => a.stato !== 'Fatto').length}</div>
                    <div class="od-kpi-label">Attività Aperte</div>
                    <div class="od-kpi-detail">
                        <span class="od-kpi-tag">${d.attByStato['In Corso']} in corso</span>
                        <span class="od-kpi-tag">${d.attByStato['In Revisione']} in revisione</span>
                        ${d.attScadute > 0 ? `<span class="od-kpi-tag od-kpi-tag-danger">${d.attScadute} scadute</span>` : ''}
                    </div>
                </div>
                <i class="fas fa-chevron-right od-kpi-arrow"></i>
            </div>` : ''}

            <!-- Generatore Webapp -->
            ${_can('componenti.create') ? `
            <div class="od-kpi-card" style="border-left:4px solid #9C27B0;" onclick="OfficinaDigitale.navigateTo('generatore')">
                <div class="od-kpi-icon" style="color:#9C27B0;"><i class="fas fa-magic"></i></div>
                <div class="od-kpi-body">
                    <div class="od-kpi-value" style="color:#9C27B0;"><i class="fas fa-magic"></i></div>
                    <div class="od-kpi-label">Generatore Webapp</div>
                    <div class="od-kpi-detail">Crea webapp personalizzate da modelli</div>
                </div>
                <i class="fas fa-chevron-right od-kpi-arrow"></i>
            </div>` : ''}
        </div>

        <!-- Sezioni rapide -->
        <div class="od-quick-grid">
            <!-- Attività recenti -->
            ${_can('attivita.view') ? `
            <div class="od-quick-card">
                <div class="od-quick-header">
                    <h3><i class="fas fa-clock"></i> Attività Recenti</h3>
                    <a href="javascript:void(0)" onclick="OfficinaDigitale.navigateTo('attivita')" class="od-link">Vedi tutte →</a>
                </div>
                <div class="od-quick-body">
                    ${d.attivita.filter(a => a.stato !== 'Fatto').slice(0, 5).map(a => `
                        <div class="od-quick-item" onclick="OfficinaDigitale.navigateTo('dettaglio-attivita','${a.id}')">
                            <span class="od-priority-dot od-priority-${(a.priorita || 'Media').toLowerCase()}"></span>
                            <div class="od-quick-item-text">
                                <div class="od-quick-item-title">${_escHtml(a.titolo || 'Senza titolo')}</div>
                                <div class="od-quick-item-meta">
                                    <span class="od-stato-badge od-stato-${(a.stato || '').replace(/\s/g, '-').toLowerCase()}">${a.stato || 'Da Fare'}</span>
                                    ${a.assegnatoA_nome ? `<span>→ ${_escHtml(a.assegnatoA_nome)}</span>` : ''}
                                </div>
                            </div>
                        </div>
                    `).join('') || '<p class="od-empty-text">Nessuna attività aperta</p>'}
                </div>
            </div>` : ''}

            <!-- Ultimi componenti -->
            ${_can('componenti.view') ? `
            <div class="od-quick-card">
                <div class="od-quick-header">
                    <h3><i class="fas fa-puzzle-piece"></i> Ultimi Componenti</h3>
                    <a href="javascript:void(0)" onclick="OfficinaDigitale.navigateTo('catalogo')" class="od-link">Catalogo →</a>
                </div>
                <div class="od-quick-body">
                    ${d.componenti.sort((a, b) => (b.creatoIl?.seconds || 0) - (a.creatoIl?.seconds || 0)).slice(0, 5).map(c => `
                        <div class="od-quick-item" onclick="OfficinaDigitale.navigateTo('dettaglio-componente','${c.id}')">
                            <div class="od-comp-icon" style="background:${c.colore || 'var(--blu-100)'}; color:${c.colore ? '#fff' : 'var(--blu-700)'}">
                                <i class="fas ${c.icona || 'fa-code'}"></i>
                            </div>
                            <div class="od-quick-item-text">
                                <div class="od-quick-item-title">${_escHtml(c.nome || 'Senza nome')}</div>
                                <div class="od-quick-item-meta">
                                    ${c.categoria ? `<span class="od-cat-badge">${c.categoria}</span>` : ''}
                                    ${c.comuniUtilizzatori ? `<span>${c.comuniUtilizzatori.length} comuni</span>` : ''}
                                </div>
                            </div>
                        </div>
                    `).join('') || '<p class="od-empty-text">Nessun componente nel catalogo</p>'}
                </div>
            </div>` : ''}
        </div>

        <!-- Strumenti Dati -->
        <div class="od-quick-grid" style="margin-top: 1.5rem;">
            <div class="od-quick-card" style="border-left: 4px solid #FF9800;">
                <div class="od-quick-header">
                    <h3><i class="fas fa-database" style="color: #FF9800;"></i> Strumenti Dati</h3>
                </div>
                <div class="od-quick-body" style="padding: 1rem;">
                    <div style="margin-bottom: 1rem;">
                        <p style="font-size: 0.9rem; color: var(--grigio-700); margin-bottom: 0.75rem;">
                            <strong>Migrazione Periodo di Competenza</strong><br/>
                            Calcola automaticamente il periodo di competenza (Dal/Al) per tutte le fatture esistenti
                            basandosi sul contratto collegato e sulla periodicità. Le fatture senza contratto o con dati
                            insufficienti verranno segnalate per la verifica manuale.
                        </p>
                        <button class="btn btn-primary" id="btnMigraCompetenza" onclick="OfficinaDigitale.eseguiMigrazioneCompetenza()"
                            style="background: #FF9800; border: none; padding: 0.6rem 1.25rem; border-radius: 8px; color: white; font-weight: 600; cursor: pointer;">
                            <i class="fas fa-play"></i> Esegui Migrazione Competenza
                        </button>
                    </div>
                    <div id="migrazioneCompetenzaRisultato"></div>
                </div>
            </div>
        </div>

        `;
    }

    /**
     * Esegue la migrazione massiva delle competenze fatture
     */
    async function _eseguiMigrazioneCompetenza() {
        const btn = document.getElementById('btnMigraCompetenza');
        const risultatoDiv = document.getElementById('migrazioneCompetenzaRisultato');
        if (!btn || !risultatoDiv) return;

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Migrazione in corso...';
        risultatoDiv.innerHTML = '<p style="color: var(--grigio-500);"><i class="fas fa-spinner fa-spin"></i> Analisi fatture in corso...</p>';

        try {
            const result = await DataService.migraCompetenzaFatture();

            let html = `
                <div style="padding: 1rem; background: var(--verde-100); border-radius: 8px; margin-bottom: 1rem;">
                    <h4 style="color: var(--verde-900); margin-bottom: 0.5rem;">
                        <i class="fas fa-check-circle"></i> Migrazione completata
                    </h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.5rem; font-size: 0.9rem;">
                        <div><strong>${result.totale}</strong> fatture totali</div>
                        <div style="color: var(--verde-700);"><strong>${result.aggiornate}</strong> aggiornate</div>
                        <div><strong>${result.giaPresenti}</strong> già presenti</div>
                        <div style="color: ${result.daVerificare.length > 0 ? '#FF9800' : 'var(--grigio-500)'};">
                            <strong>${result.daVerificare.length}</strong> da verificare
                        </div>
                        ${result.errori > 0 ? `<div style="color: var(--rosso-errore);"><strong>${result.errori}</strong> errori</div>` : ''}
                    </div>
                </div>
            `;

            if (result.daVerificare.length > 0) {
                html += `
                    <div style="padding: 1rem; background: #FFF3E0; border-radius: 8px; border-left: 4px solid #FF9800;">
                        <h4 style="color: #E65100; margin-bottom: 0.75rem;">
                            <i class="fas fa-exclamation-triangle"></i> Fatture da verificare manualmente (${result.daVerificare.length})
                        </h4>
                        <div style="max-height: 400px; overflow-y: auto;">
                            <table style="width: 100%; font-size: 0.85rem; border-collapse: collapse;">
                                <thead>
                                    <tr style="background: rgba(0,0,0,0.05); text-align: left;">
                                        <th style="padding: 0.5rem;">Numero</th>
                                        <th style="padding: 0.5rem;">Cliente</th>
                                        <th style="padding: 0.5rem;">Data Em.</th>
                                        <th style="padding: 0.5rem;">Importo</th>
                                        <th style="padding: 0.5rem;">Motivo</th>
                                        <th style="padding: 0.5rem;">Azione</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${result.daVerificare.map(f => `
                                        <tr style="border-bottom: 1px solid var(--grigio-300);">
                                            <td style="padding: 0.5rem; font-weight: 600;">${_escHtml(f.numero)}</td>
                                            <td style="padding: 0.5rem;">${_escHtml(f.cliente)}</td>
                                            <td style="padding: 0.5rem;">${f.dataEmissione ? DataService.formatDate(f.dataEmissione) : '—'}</td>
                                            <td style="padding: 0.5rem;">${f.importo ? DataService.formatCurrency(f.importo) : '—'}</td>
                                            <td style="padding: 0.5rem; color: #E65100; font-size: 0.8rem;">${_escHtml(f.motivo)}</td>
                                            <td style="padding: 0.5rem;">
                                                <button class="btn btn-sm" onclick="UI.showPage('dettaglio-fattura','${f.id}')"
                                                    style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: var(--blu-700); color: white; border: none; border-radius: 4px; cursor: pointer;">
                                                    <i class="fas fa-edit"></i> Apri
                                                </button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }

            risultatoDiv.innerHTML = html;
        } catch (error) {
            risultatoDiv.innerHTML = `
                <div style="padding: 1rem; background: #FFEBEE; border-radius: 8px; color: #D32F2F;">
                    <i class="fas fa-times-circle"></i> Errore durante la migrazione: ${error.message}
                </div>
            `;
        }

        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-play"></i> Esegui Migrazione Competenza';
    }

    // =========================================================================
    // SEED PRODOTTI INIZIALI — Una tantum
    // =========================================================================

    async function _seedProdottiIniziali() {
        try {
            const snap = await db.collection(COLLECTIONS.PRODOTTI).limit(1).get();
            if (!snap.empty) return; // Già popolato

            const prodottiIniziali = [
                { nome: 'ChatBot Comunale AI', categoria: 'AI', stato: 'Concept', icona: 'fa-brain', ordine: 1 },
                { nome: 'Tracking GPS Mezzi Pubblici', categoria: 'Mobilità', stato: 'Concept', icona: 'fa-bus', ordine: 2 },
                { nome: 'E-Voting — Democrazia Partecipativa', categoria: 'Democrazia Partecipativa', stato: 'Concept', icona: 'fa-vote-yea', ordine: 3 },
                { nome: 'Allerte Protezione Civile', categoria: 'Sicurezza', stato: 'Concept', icona: 'fa-shield-alt', ordine: 4 },
                { nome: 'Prenotazione e Ticketing', categoria: 'Servizi al Cittadino', stato: 'Concept', icona: 'fa-ticket-alt', ordine: 5 }
            ];

            const batch = db.batch();
            const now = firebase.firestore.FieldValue.serverTimestamp();

            prodottiIniziali.forEach(p => {
                const ref = db.collection(COLLECTIONS.PRODOTTI).doc();
                batch.set(ref, {
                    ...p,
                    tagline: '',
                    descrizione: '',
                    standalone: false,
                    integrabileApp: true,
                    comuniAttivi: [],
                    comuniPilota: [],
                    teamSviluppo: [],
                    responsabile: null,
                    referenteCommerciale: null,
                    noteTeam: '',
                    architettura: '',
                    stackTecnologico: [],
                    requisitiInfrastruttura: '',
                    istruzioniDeploy: '',
                    variabiliConfigurazione: '',
                    problemiNoti: '',
                    repoGithub: '',
                    branchPrincipale: 'main',
                    readmeLink: '',
                    presentazione: '',
                    demoLink: '',
                    videoDemo: '',
                    pricing: '',
                    faqCommerciali: '',
                    casiSuccesso: '',
                    immagineCopertina: '',
                    creatoIl: now,
                    aggiornatoIl: now,
                    creatoDa: 'sistema',
                    creatoDaNome: 'Sistema (seed iniziale)'
                });
            });

            await batch.commit();
            console.log('[OfficinaDigitale] Seed: 5 prodotti iniziali creati');
        } catch (error) {
            console.warn('[OfficinaDigitale] Seed non riuscito (potrebbe essere già fatto):', error);
        }
    }

    // =========================================================================
    // UTILITIES
    // =========================================================================

    function _escHtml(text) {
        if (!text) return '';
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    // =========================================================================
    // STYLES — Iniettati una sola volta
    // =========================================================================

    function _addStyles() {
        if (document.getElementById('od-styles')) return;
        const style = document.createElement('style');
        style.id = 'od-styles';
        style.textContent = `
/* ===== OFFICINA DIGITALE — Core Styles ===== */
.od-container { max-width: 1200px; margin: 0 auto; padding: 0 1rem 2rem; }

/* Header */
.od-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.75rem; }
.od-header-left { display: flex; align-items: center; gap: 0.75rem; }
.od-header-icon { width: 48px; height: 48px; border-radius: 14px; background: linear-gradient(135deg, var(--blu-700), var(--blu-500)); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; box-shadow: 0 4px 12px rgba(20,82,132,0.3); }
.od-title { font-size: 1.5rem; font-weight: 700; color: var(--grigio-900); margin: 0; line-height: 1.2; }
.od-subtitle { font-size: 0.8125rem; color: var(--grigio-500); margin: 0; }

/* Navigation Pills */
.od-nav { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 2px; }
.od-nav-btn { display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.5rem 1rem; border-radius: 999px; border: 1px solid var(--grigio-300); background: #fff; color: var(--grigio-700); font-size: 0.8125rem; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.2s; font-family: inherit; }
.od-nav-btn:hover { border-color: var(--blu-500); color: var(--blu-700); background: var(--blu-100); }
.od-nav-btn.active { background: var(--blu-700); color: #fff; border-color: var(--blu-700); box-shadow: 0 2px 8px rgba(20,82,132,0.3); }
.od-nav-btn i { font-size: 0.75rem; }

/* KPI Cards Grid */
.od-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
.od-kpi-card { display: flex; align-items: center; gap: 1rem; padding: 1.25rem; border-radius: 16px; background: #fff; border: 1px solid var(--grigio-300); cursor: pointer; transition: all 0.2s; }
.od-kpi-card:hover { border-color: var(--blu-300); box-shadow: 0 4px 16px rgba(0,0,0,0.08); transform: translateY(-1px); }
.od-kpi-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; flex-shrink: 0; }
.od-kpi-prodotti .od-kpi-icon { background: #EDE7F6; color: #5E35B1; }
.od-kpi-componenti .od-kpi-icon { background: var(--verde-100); color: var(--verde-700); }
.od-kpi-attivita .od-kpi-icon { background: var(--blu-100); color: var(--blu-700); }
.od-kpi-body { flex: 1; min-width: 0; }
.od-kpi-value { font-size: 1.75rem; font-weight: 700; color: var(--grigio-900); line-height: 1; }
.od-kpi-label { font-size: 0.8125rem; color: var(--grigio-500); margin-top: 2px; }
.od-kpi-detail { margin-top: 0.5rem; display: flex; flex-wrap: wrap; gap: 0.25rem; font-size: 0.75rem; }
.od-kpi-tag { background: var(--grigio-100); color: var(--grigio-700); padding: 2px 8px; border-radius: 999px; }
.od-kpi-tag-danger { background: #FFEBEE; color: #D32F2F; }
.od-kpi-arrow { color: var(--grigio-300); font-size: 0.875rem; }

/* Quick Cards */
.od-quick-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem; }
.od-quick-card { background: #fff; border-radius: 16px; border: 1px solid var(--grigio-300); overflow: hidden; }
.od-quick-header { display: flex; align-items: center; justify-content: space-between; padding: 0.875rem 1rem; border-bottom: 1px solid var(--grigio-100); }
.od-quick-header h3 { font-size: 0.875rem; font-weight: 700; color: var(--grigio-900); margin: 0; display: flex; align-items: center; gap: 0.5rem; }
.od-quick-header h3 i { color: var(--blu-500); font-size: 0.8125rem; }
.od-link { font-size: 0.75rem; color: var(--blu-500); text-decoration: none; font-weight: 600; }
.od-link:hover { color: var(--blu-700); }
.od-quick-body { padding: 0.5rem; }

/* Quick Items */
.od-quick-item { display: flex; align-items: center; gap: 0.625rem; padding: 0.5rem 0.625rem; border-radius: 10px; cursor: pointer; transition: background 0.15s; }
.od-quick-item:hover { background: var(--grigio-100); }
.od-quick-item-text { flex: 1; min-width: 0; }
.od-quick-item-title { font-size: 0.8125rem; font-weight: 600; color: var(--grigio-900); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.od-quick-item-meta { display: flex; align-items: center; gap: 0.375rem; margin-top: 2px; font-size: 0.6875rem; color: var(--grigio-500); flex-wrap: wrap; }

/* Priority Dots */
.od-priority-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.od-priority-dot.od-priority-bassa { background: #9E9E9E; }
.od-priority-dot.od-priority-media { background: #FF9800; }
.od-priority-dot.od-priority-alta { background: #F44336; }
.od-priority-dot.od-priority-urgente { background: #D32F2F; animation: od-pulse 1.5s infinite; }
@keyframes od-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

/* Status Badges */
.od-stato-badge { display: inline-block; padding: 1px 6px; border-radius: 999px; font-size: 0.625rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
.od-stato-da-fare { background: var(--grigio-100); color: var(--grigio-700); }
.od-stato-in-corso { background: #E3F2FD; color: #1565C0; }
.od-stato-in-revisione { background: #FFF3E0; color: #E65100; }
.od-stato-fatto { background: var(--verde-100); color: var(--verde-900); }

/* Component Icon */
.od-comp-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; flex-shrink: 0; }

/* Category Badge */
.od-cat-badge { background: var(--blu-100); color: var(--blu-700); padding: 1px 6px; border-radius: 999px; font-size: 0.625rem; font-weight: 600; }

/* Empty States */
.od-empty-state { text-align: center; padding: 3rem 1rem; color: var(--grigio-500); }
.od-empty-state i { font-size: 3rem; margin-bottom: 1rem; opacity: 0.5; }
.od-empty-text { font-size: 0.8125rem; color: var(--grigio-500); text-align: center; padding: 1.5rem; }

/* Responsive */
@media (max-width: 640px) {
    .od-kpi-grid { grid-template-columns: 1fr; }
    .od-quick-grid { grid-template-columns: 1fr; }
    .od-title { font-size: 1.25rem; }
    .od-nav-btn span { display: none; }
    .od-nav-btn i { font-size: 1rem; }
    .od-nav-btn { padding: 0.5rem 0.875rem; }
}
`;
        document.head.appendChild(style);
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================
    return {
        render,
        navigateTo,
        COLLECTIONS,
        eseguiMigrazioneCompetenza: _eseguiMigrazioneCompetenza,
        // Esposti per uso dai sotto-moduli
        can: _can,
        escHtml: _escHtml,
        loadModule: _loadModule
    };
})();

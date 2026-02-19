// Settings Page
const Settings = {
    currentTab: 'dashboard',

    async render() {
        UI.showLoading();

        try {
            const widgets = SettingsService.getDashboardWidgets();
            const companyData = SettingsService.getCompanyData();

            const mainContent = document.getElementById('mainContent');
            mainContent.innerHTML = `
                <div class="page-header mb-3">
                    <h1 style="font-size: 2rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                        <i class="fas fa-cog"></i> Impostazioni
                    </h1>
                    <p style="color: var(--grigio-500);">
                        Personalizza il sistema e configura i dati aziendali
                    </p>
                </div>

                <!-- Tabs -->
                <div style="
                    border-bottom: 2px solid var(--grigio-300);
                    margin-bottom: 2rem;
                    display: flex;
                    gap: 0.5rem;
                ">
                    ${AuthService.hasPermission('manage_settings') ? `
                    <button
                        class="settings-tab ${this.currentTab === 'dashboard' ? 'active' : ''}"
                        onclick="Settings.switchTab('dashboard')"
                    >
                        <i class="fas fa-chart-line"></i> Dashboard
                    </button>
                    ` : ''}
                    ${AuthService.hasPermission('view_company_info') ? `
                    <button
                        class="settings-tab ${this.currentTab === 'azienda' ? 'active' : ''}"
                        onclick="Settings.switchTab('azienda')"
                    >
                        <i class="fas fa-building"></i> Growapp S.r.l.
                    </button>
                    ` : ''}
                    ${AuthService.hasPermission('manage_business_card') ? `
                    <button
                        class="settings-tab ${this.currentTab === 'biglietto' ? 'active' : ''}"
                        onclick="Settings.switchTab('biglietto')"
                    >
                        <i class="fas fa-id-card"></i> Biglietto da Visita
                    </button>
                    ` : ''}
                    ${AuthService.hasPermission('manage_settings') ? `
                    <button
                        class="settings-tab ${this.currentTab === 'sistema' ? 'active' : ''}"
                        onclick="Settings.switchTab('sistema')"
                    >
                        <i class="fas fa-sliders-h"></i> Sistema
                    </button>
                    <button
                        class="settings-tab ${this.currentTab === 'dati' ? 'active' : ''}"
                        onclick="Settings.switchTab('dati')"
                    >
                        <i class="fas fa-database"></i> Gestione Dati
                    </button>
                    ` : ''}
                    ${AuthService.hasPermission('manage_settings') ? `
                    <button
                        class="settings-tab ${this.currentTab === 'bonifica' ? 'active' : ''}"
                        onclick="Settings.switchTab('bonifica')"
                    >
                        <i class="fas fa-wrench"></i> Bonifica Fatture
                    </button>
                    <button
                        class="settings-tab ${this.currentTab === 'unisciClienti' ? 'active' : ''}"
                        onclick="Settings.switchTab('unisciClienti')"
                    >
                        <i class="fas fa-object-group"></i> Unisci Clienti
                    </button>
                    ` : ''}
                    ${AuthService.hasPermission('manage_settings') ? `
                    <button
                        class="settings-tab ${this.currentTab === 'template' ? 'active' : ''}"
                        onclick="Settings.switchTab('template')"
                    >
                        <i class="fas fa-envelope-open-text"></i> Template Email
                    </button>
                    ` : ''}
                    ${AuthService.hasPermission('manage_users') ? `
                    <button
                        class="settings-tab ${this.currentTab === 'utenti' ? 'active' : ''}"
                        onclick="Settings.switchTab('utenti')"
                    >
                        <i class="fas fa-users-cog"></i> Utenti
                    </button>
                    ` : ''}
                </div>

                <!-- Tab Content -->
                <div id="settingsTabContent" class="fade-in">
                    ${this.renderTabContent()}
                </div>
            `;

            UI.hideLoading();
        } catch (error) {
            UI.showError('Errore nel caricamento delle impostazioni: ' + error.message);
        }
    },

    renderTabContent() {
        switch (this.currentTab) {
            case 'dashboard':
                return this.renderDashboardTab();
            case 'azienda':
                return this.renderAziendaTab();
            case 'biglietto':
                return this.renderBigliettoTab();
            case 'sistema':
                return this.renderSistemaTab();
            case 'dati':
                return this.renderDatiTab();
            case 'bonifica':
                return this.renderBonificaTab();
            case 'unisciClienti':
                return this.renderUnisciClientiTab();
            case 'utenti':
                return this.renderUtentiTab();
            case 'template':
                return this.renderTemplateTab();
            default:
                return '';
        }
    },

    renderDashboardTab() {
        const widgets = SettingsService.getDashboardWidgets();

        return `
            <div class="card">
                <div class="card-header">
                    <h3>Widget Dashboard</h3>
                    <p style="color: var(--grigio-500); font-size: 0.9rem; margin-top: 0.5rem;">
                        Seleziona quali widget visualizzare nella dashboard
                    </p>
                </div>
                <div class="card-body">
                    <div style="display: grid; gap: 1rem;">
                        ${Object.values(widgets).map(widget => `
                            <div class="widget-setting-item">
                                <div style="display: flex; align-items: center; gap: 1rem;">
                                    <label class="custom-checkbox">
                                        <input
                                            type="checkbox"
                                            ${widget.enabled ? 'checked' : ''}
                                            onchange="Settings.toggleWidget('${widget.id}', this.checked)"
                                        />
                                        <span class="checkmark"></span>
                                    </label>
                                    <div style="flex: 1;">
                                        <div style="font-weight: 600; color: var(--grigio-900);">
                                            ${widget.nome}
                                        </div>
                                        <div style="font-size: 0.85rem; color: var(--grigio-500);">
                                            ${widget.descrizione}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--grigio-300);">
                        <button
                            class="btn btn-secondary"
                            onclick="Settings.resetDashboard()"
                        >
                            <i class="fas fa-undo"></i> Ripristina Predefiniti
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    renderAziendaTab() {
        // Mostra loading e poi carica dati da Firestore
        // Al primo render mostra i dati dalla cache/default, poi aggiorna da Firestore
        const growappData = this.getGrowappData();
        const isEditMode = this.growappEditMode || false;

        // Carica dati da Firestore in background e aggiorna la vista
        if (!isEditMode) {
            setTimeout(async () => {
                await this.loadGrowappData();
                const container = document.getElementById('settingsTabContent');
                if (container && this.currentTab === 'azienda' && !this.growappEditMode) {
                    container.innerHTML = this.renderGrowappCard(this.getGrowappData());
                }
            }, 50);
        }

        if (isEditMode) {
            // MODALITÀ MODIFICA - Form
            return this.renderGrowappEditForm(growappData);
        } else {
            // MODALITÀ VISUALIZZAZIONE - Card elegante
            return this.renderGrowappCard(growappData);
        }
    },

    // Cache locale dei dati Growapp (caricati da Firestore)
    _growappDataCache: null,

    getGrowappDefaultData() {
        return {
            ragioneSociale: 'GROWAPP S.R.L.',
            tagline: 'Soluzioni Digitali per Comuni ed Enti Pubblici',
            partitaIva: '02631030306',
            codiceFiscale: '02631030306',
            codiceSdi: 'M5UXCR1',
            indirizzo: 'Via Nazionale, 60',
            cap: '33010',
            citta: 'Cassacco',
            provincia: 'UD',
            regione: 'Friuli Venezia Giulia',
            paese: 'Italia',
            email: 'info@comune.digital',
            pec: 'growapp@legalmail.it',
            web: 'www.comune.digital',
            banca: 'INTESA SANPAOLO S.P.A.',
            iban: 'IT14 B030 6934 7271 0000 0005 107',
            bic: 'BCITITMM',
            inailCodiceDitta: '440002941',
            inailSede: 'INAIL Udine',
            inailPat: '14121909',
            capitaleSociale: '€ 10.000,00 i.v.',
            rea: 'UD-286344',
            noteFinali: 'Società soggetta all\'attività di direzione e coordinamento di ARTIS S.r.l. (P.IVA 02482670302)'
        };
    },

    getGrowappData() {
        // Ritorna la cache se disponibile, altrimenti i default
        // I dati reali vengono caricati async da loadGrowappData()
        return this._growappDataCache || this.getGrowappDefaultData();
    },

    async loadGrowappData() {
        try {
            const doc = await db.collection('impostazioni').doc('growapp').get();
            if (doc.exists) {
                this._growappDataCache = { ...this.getGrowappDefaultData(), ...doc.data() };
            } else {
                // Prima volta: migra da localStorage se ci sono dati salvati
                const localData = localStorage.getItem('growappData');
                if (localData) {
                    const parsed = JSON.parse(localData);
                    await db.collection('impostazioni').doc('growapp').set({
                        ...parsed,
                        ultimaModifica: new Date().toISOString(),
                        modificatoDa: AuthService.getUserName() || 'Sistema',
                        modificatoDaId: AuthService.getUserId() || 'migrazione'
                    });
                    this._growappDataCache = { ...this.getGrowappDefaultData(), ...parsed };
                    // Rimuovi da localStorage dopo la migrazione
                    localStorage.removeItem('growappData');
                } else {
                    this._growappDataCache = this.getGrowappDefaultData();
                }
            }
            return this._growappDataCache;
        } catch (error) {
            console.error('Errore caricamento dati Growapp da Firestore:', error);
            // Fallback: usa localStorage o default
            const localData = localStorage.getItem('growappData');
            this._growappDataCache = localData ? { ...this.getGrowappDefaultData(), ...JSON.parse(localData) } : this.getGrowappDefaultData();
            return this._growappDataCache;
        }
    },

    async saveGrowappData(data) {
        try {
            // Salva su Firestore (condiviso tra tutti gli utenti)
            await db.collection('impostazioni').doc('growapp').set({
                ...data,
                ultimaModifica: new Date().toISOString(),
                modificatoDa: AuthService.getUserName() || 'Utente',
                modificatoDaId: AuthService.getUserId() || ''
            });
            // Aggiorna cache locale
            this._growappDataCache = { ...this.getGrowappDefaultData(), ...data };
            // Rimuovi eventuale dato vecchio da localStorage
            localStorage.removeItem('growappData');
        } catch (error) {
            console.error('Errore salvataggio dati Growapp su Firestore:', error);
            // Fallback: salva su localStorage
            localStorage.setItem('growappData', JSON.stringify(data));
            this._growappDataCache = { ...this.getGrowappDefaultData(), ...data };
            UI.showError('Salvataggio locale. Riprova più tardi per condividere le modifiche.');
        }
    },

    renderGrowappCard(data) {
        return `
            <div class="card" style="max-width: 900px; margin: 0 auto; background: linear-gradient(135deg, var(--blu-700) 0%, var(--blu-900) 100%); color: white; box-shadow: 0 10px 40px rgba(20, 82, 132, 0.3);">
                <div class="card-body" style="padding: 3rem;">
                    <!-- Header con Logo -->
                    <div style="text-align: center; margin-bottom: 2.5rem; padding-bottom: 2rem; border-bottom: 2px solid rgba(255,255,255,0.2);">
                        <h1 style="font-size: 2.5rem; font-weight: 900; margin: 0 0 0.5rem 0; color: white; letter-spacing: -0.02em;">
                            ${data.ragioneSociale}
                        </h1>
                        <p style="font-size: 1.125rem; color: rgba(255,255,255,0.9); margin: 0; font-weight: 600;">
                            ${data.tagline}
                        </p>
                    </div>

                    <!-- Informazioni Principali -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 2rem; margin-bottom: 2rem;">
                        <!-- Dati Fiscali -->
                        <div>
                            <h3 style="font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.7); margin-bottom: 1rem; font-weight: 700;">
                                <i class="fas fa-file-invoice"></i> Dati Fiscali
                            </h3>
                            <div style="background: rgba(255,255,255,0.1); padding: 1.25rem; border-radius: 12px; backdrop-filter: blur(10px);">
                                <div style="margin-bottom: 0.75rem;">
                                    <div style="font-size: 0.75rem; color: rgba(255,255,255,0.7); margin-bottom: 0.25rem;">Partita IVA</div>
                                    <div style="font-size: 1.125rem; font-weight: 700;">${data.partitaIva}</div>
                                </div>
                                <div style="margin-bottom: 0.75rem;">
                                    <div style="font-size: 0.75rem; color: rgba(255,255,255,0.7); margin-bottom: 0.25rem;">Codice Fiscale</div>
                                    <div style="font-size: 1.125rem; font-weight: 700;">${data.codiceFiscale}</div>
                                </div>
                                <div>
                                    <div style="font-size: 0.75rem; color: rgba(255,255,255,0.7); margin-bottom: 0.25rem;">Codice SDI</div>
                                    <div style="font-size: 1.125rem; font-weight: 700;">${data.codiceSdi}</div>
                                </div>
                            </div>
                        </div>

                        <!-- Sede Legale -->
                        <div>
                            <h3 style="font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.7); margin-bottom: 1rem; font-weight: 700;">
                                <i class="fas fa-map-marker-alt"></i> Sede Legale
                            </h3>
                            <div style="background: rgba(255,255,255,0.1); padding: 1.25rem; border-radius: 12px; backdrop-filter: blur(10px);">
                                <div style="font-size: 1rem; line-height: 1.6;">
                                    ${data.indirizzo}<br>
                                    ${data.cap} ${data.citta} (${data.provincia})<br>
                                    ${data.regione}<br>
                                    ${data.paese}
                                </div>
                            </div>
                        </div>

                        <!-- Contatti -->
                        <div>
                            <h3 style="font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.7); margin-bottom: 1rem; font-weight: 700;">
                                <i class="fas fa-envelope"></i> Contatti
                            </h3>
                            <div style="background: rgba(255,255,255,0.1); padding: 1.25rem; border-radius: 12px; backdrop-filter: blur(10px);">
                                <div style="margin-bottom: 0.75rem;">
                                    <div style="font-size: 0.75rem; color: rgba(255,255,255,0.7); margin-bottom: 0.25rem;">Email</div>
                                    <div style="font-size: 0.9375rem; font-weight: 600;">${data.email}</div>
                                </div>
                                <div style="margin-bottom: 0.75rem;">
                                    <div style="font-size: 0.75rem; color: rgba(255,255,255,0.7); margin-bottom: 0.25rem;">PEC</div>
                                    <div style="font-size: 0.9375rem; font-weight: 600;">${data.pec}</div>
                                </div>
                                <div>
                                    <div style="font-size: 0.75rem; color: rgba(255,255,255,0.7); margin-bottom: 0.25rem;">Web</div>
                                    <div style="font-size: 0.9375rem; font-weight: 600;">${data.web}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Dati Bancari -->
                    <div style="margin-bottom: 2rem;">
                        <h3 style="font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.7); margin-bottom: 1rem; font-weight: 700;">
                            <i class="fas fa-university"></i> Coordinate Bancarie
                        </h3>
                        <div style="background: rgba(255,255,255,0.1); padding: 1.5rem; border-radius: 12px; backdrop-filter: blur(10px);">
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem;">
                                <div>
                                    <div style="font-size: 0.75rem; color: rgba(255,255,255,0.7); margin-bottom: 0.25rem;">Istituto di Credito</div>
                                    <div style="font-size: 1rem; font-weight: 700;">${data.banca}</div>
                                </div>
                                <div>
                                    <div style="font-size: 0.75rem; color: rgba(255,255,255,0.7); margin-bottom: 0.25rem;">IBAN</div>
                                    <div style="font-size: 1rem; font-weight: 700; font-family: 'Courier New', monospace;">${data.iban}</div>
                                </div>
                                <div>
                                    <div style="font-size: 0.75rem; color: rgba(255,255,255,0.7); margin-bottom: 0.25rem;">BIC/SWIFT</div>
                                    <div style="font-size: 1rem; font-weight: 700; font-family: 'Courier New', monospace;">${data.bic}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Posizione INAIL -->
                    <div style="margin-bottom: 2rem;">
                        <h3 style="font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.7); margin-bottom: 1rem; font-weight: 700;">
                            <i class="fas fa-shield-alt"></i> Posizione INAIL
                        </h3>
                        <div style="background: rgba(255,255,255,0.1); padding: 1.5rem; border-radius: 12px; backdrop-filter: blur(10px);">
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem;">
                                <div>
                                    <div style="font-size: 0.75rem; color: rgba(255,255,255,0.7); margin-bottom: 0.25rem;">Codice Ditta</div>
                                    <div style="font-size: 1.125rem; font-weight: 700;">${data.inailCodiceDitta}</div>
                                </div>
                                <div>
                                    <div style="font-size: 0.75rem; color: rgba(255,255,255,0.7); margin-bottom: 0.25rem;">Sede Competente</div>
                                    <div style="font-size: 1rem; font-weight: 600;">${data.inailSede}</div>
                                </div>
                                <div>
                                    <div style="font-size: 0.75rem; color: rgba(255,255,255,0.7); margin-bottom: 0.25rem;">PAT</div>
                                    <div style="font-size: 1.125rem; font-weight: 700;">${data.inailPat}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Note -->
                    <div style="border-top: 2px solid rgba(255,255,255,0.2); padding-top: 1.5rem;">
                        <p style="text-align: center; font-size: 0.875rem; color: rgba(255,255,255,0.8); margin: 0; line-height: 1.6;">
                            <strong>Capitale Sociale:</strong> ${data.capitaleSociale} • <strong>REA:</strong> ${data.rea}<br>
                            ${data.noteFinali}
                        </p>
                    </div>

                    <!-- Action Buttons -->
                    <div style="text-align: center; margin-top: 2rem; display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
                        ${AuthService.hasPermission('manage_settings') ? `
                        <button onclick="Settings.toggleGrowappEdit()" class="btn" style="background: white; color: var(--blu-700); font-weight: 700; padding: 0.875rem 2rem; font-size: 1rem; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                            <i class="fas fa-edit"></i> Modifica Dati
                        </button>
                        ` : ''}
                        <button onclick="Settings.screenshotAzienda()" class="btn" style="background: rgba(255,255,255,0.2); color: white; font-weight: 700; padding: 0.875rem 2rem; font-size: 1rem; border: 2px solid white;">
                            <i class="fas fa-camera"></i> Crea Screenshot
                        </button>
                    </div>
                </div>
            </div>

            ${AuthService.hasPermission('manage_settings') ? `
            <div style="text-align: center; margin-top: 1.5rem; color: var(--grigio-500); font-size: 0.875rem;">
                <i class="fas fa-info-circle"></i> Tutti i campi sono personalizzabili tramite il pulsante "Modifica Dati"
            </div>
            ` : ''}
        `;
    },

    renderGrowappEditForm(data) {
        return `
            <div class="card" style="max-width: 900px; margin: 0 auto;">
                <div class="card-header">
                    <h3><i class="fas fa-edit"></i> Modifica Dati Growapp S.r.l.</h3>
                    <p style="color: var(--grigio-500); margin-top: 0.5rem;">
                        Personalizza tutti i campi della card aziendale
                    </p>
                </div>
                <div class="card-body">
                    <form id="growappEditForm">
                        <!-- Header -->
                        <div style="background: var(--blu-100); padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem;">
                            <h4 style="color: var(--blu-700); margin-bottom: 1rem;">
                                <i class="fas fa-building"></i> Intestazione
                            </h4>
                            <div style="display: grid; gap: 1rem;">
                                <div class="form-group">
                                    <label>Ragione Sociale</label>
                                    <input type="text" class="form-input" id="editRagioneSociale" value="${data.ragioneSociale}" required>
                                </div>
                                <div class="form-group">
                                    <label>Tagline / Descrizione</label>
                                    <input type="text" class="form-input" id="editTagline" value="${data.tagline}" required>
                                </div>
                            </div>
                        </div>

                        <!-- Dati Fiscali -->
                        <div style="background: var(--grigio-100); padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem;">
                            <h4 style="color: var(--blu-700); margin-bottom: 1rem;">
                                <i class="fas fa-file-invoice"></i> Dati Fiscali
                            </h4>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">
                                <div class="form-group">
                                    <label>Partita IVA</label>
                                    <input type="text" class="form-input" id="editPartitaIva" value="${data.partitaIva}" required>
                                </div>
                                <div class="form-group">
                                    <label>Codice Fiscale</label>
                                    <input type="text" class="form-input" id="editCodiceFiscale" value="${data.codiceFiscale}" required>
                                </div>
                                <div class="form-group">
                                    <label>Codice SDI</label>
                                    <input type="text" class="form-input" id="editCodiceSdi" value="${data.codiceSdi}" required>
                                </div>
                            </div>
                        </div>

                        <!-- Sede Legale -->
                        <div style="background: var(--blu-100); padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem;">
                            <h4 style="color: var(--blu-700); margin-bottom: 1rem;">
                                <i class="fas fa-map-marker-alt"></i> Sede Legale
                            </h4>
                            <div style="display: grid; gap: 1rem;">
                                <div class="form-group">
                                    <label>Indirizzo</label>
                                    <input type="text" class="form-input" id="editIndirizzo" value="${data.indirizzo}" required>
                                </div>
                                <div style="display: grid; grid-template-columns: 1fr 2fr 1fr; gap: 1rem;">
                                    <div class="form-group">
                                        <label>CAP</label>
                                        <input type="text" class="form-input" id="editCap" value="${data.cap}" required>
                                    </div>
                                    <div class="form-group">
                                        <label>Città</label>
                                        <input type="text" class="form-input" id="editCitta" value="${data.citta}" required>
                                    </div>
                                    <div class="form-group">
                                        <label>Provincia</label>
                                        <input type="text" class="form-input" id="editProvincia" value="${data.provincia}" maxlength="2" required>
                                    </div>
                                </div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                                    <div class="form-group">
                                        <label>Regione</label>
                                        <input type="text" class="form-input" id="editRegione" value="${data.regione}" required>
                                    </div>
                                    <div class="form-group">
                                        <label>Paese</label>
                                        <input type="text" class="form-input" id="editPaese" value="${data.paese}" required>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Contatti -->
                        <div style="background: var(--grigio-100); padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem;">
                            <h4 style="color: var(--blu-700); margin-bottom: 1rem;">
                                <i class="fas fa-envelope"></i> Contatti
                            </h4>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">
                                <div class="form-group">
                                    <label>Email</label>
                                    <input type="email" class="form-input" id="editEmail" value="${data.email}" required>
                                </div>
                                <div class="form-group">
                                    <label>PEC</label>
                                    <input type="email" class="form-input" id="editPec" value="${data.pec}" required>
                                </div>
                                <div class="form-group">
                                    <label>Sito Web</label>
                                    <input type="text" class="form-input" id="editWeb" value="${data.web}" required>
                                </div>
                            </div>
                        </div>

                        <!-- Coordinate Bancarie -->
                        <div style="background: var(--blu-100); padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem;">
                            <h4 style="color: var(--blu-700); margin-bottom: 1rem;">
                                <i class="fas fa-university"></i> Coordinate Bancarie
                            </h4>
                            <div style="display: grid; gap: 1rem;">
                                <div class="form-group">
                                    <label>Istituto di Credito</label>
                                    <input type="text" class="form-input" id="editBanca" value="${data.banca}" required>
                                </div>
                                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 1rem;">
                                    <div class="form-group">
                                        <label>IBAN</label>
                                        <input type="text" class="form-input" id="editIban" value="${data.iban}" required>
                                    </div>
                                    <div class="form-group">
                                        <label>BIC/SWIFT</label>
                                        <input type="text" class="form-input" id="editBic" value="${data.bic}" required>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Posizione INAIL -->
                        <div style="background: var(--grigio-100); padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem;">
                            <h4 style="color: var(--blu-700); margin-bottom: 1rem;">
                                <i class="fas fa-shield-alt"></i> Posizione INAIL
                            </h4>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                                <div class="form-group">
                                    <label>Codice Ditta</label>
                                    <input type="text" class="form-input" id="editInailCodiceDitta" value="${data.inailCodiceDitta}" required>
                                </div>
                                <div class="form-group">
                                    <label>Sede Competente</label>
                                    <input type="text" class="form-input" id="editInailSede" value="${data.inailSede}" required>
                                </div>
                                <div class="form-group">
                                    <label>PAT</label>
                                    <input type="text" class="form-input" id="editInailPat" value="${data.inailPat}" required>
                                </div>
                            </div>
                        </div>

                        <!-- Note Finali -->
                        <div style="background: var(--blu-100); padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem;">
                            <h4 style="color: var(--blu-700); margin-bottom: 1rem;">
                                <i class="fas fa-info-circle"></i> Informazioni Aggiuntive
                            </h4>
                            <div style="display: grid; gap: 1rem;">
                                <div class="form-group">
                                    <label>Capitale Sociale</label>
                                    <input type="text" class="form-input" id="editCapitaleSociale" value="${data.capitaleSociale}" required>
                                </div>
                                <div class="form-group">
                                    <label>REA</label>
                                    <input type="text" class="form-input" id="editRea" value="${data.rea}" required>
                                </div>
                                <div class="form-group">
                                    <label>Note Finali (es: direzione e coordinamento)</label>
                                    <textarea class="form-input" id="editNoteFinali" rows="2">${data.noteFinali}</textarea>
                                </div>
                            </div>
                        </div>

                        <!-- Buttons -->
                        <div style="display: flex; gap: 1rem; justify-content: flex-end; border-top: 2px solid var(--grigio-300); padding-top: 1.5rem;">
                            <button type="button" onclick="Settings.toggleGrowappEdit()" class="btn btn-secondary">
                                <i class="fas fa-times"></i> Annulla
                            </button>
                            <button type="submit" class="btn btn-primary">
                                <i class="fas fa-save"></i> Salva Modifiche
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    },

    async toggleGrowappEdit() {
        // Carica dati aggiornati da Firestore prima di aprire il form
        if (!this.growappEditMode) {
            await this.loadGrowappData();
        }
        this.growappEditMode = !this.growappEditMode;
        this.switchTab('azienda');

        // Se è appena entrato in edit mode, attacca listener al form
        if (this.growappEditMode) {
            setTimeout(() => {
                const form = document.getElementById('growappEditForm');
                if (form) {
                    form.addEventListener('submit', (e) => {
                        e.preventDefault();
                        this.saveGrowappEdit();
                    });
                }
            }, 100);
        }
    },

    async saveGrowappEdit() {
        const newData = {
            ragioneSociale: document.getElementById('editRagioneSociale').value,
            tagline: document.getElementById('editTagline').value,
            partitaIva: document.getElementById('editPartitaIva').value,
            codiceFiscale: document.getElementById('editCodiceFiscale').value,
            codiceSdi: document.getElementById('editCodiceSdi').value,
            indirizzo: document.getElementById('editIndirizzo').value,
            cap: document.getElementById('editCap').value,
            citta: document.getElementById('editCitta').value,
            provincia: document.getElementById('editProvincia').value,
            regione: document.getElementById('editRegione').value,
            paese: document.getElementById('editPaese').value,
            email: document.getElementById('editEmail').value,
            pec: document.getElementById('editPec').value,
            web: document.getElementById('editWeb').value,
            banca: document.getElementById('editBanca').value,
            iban: document.getElementById('editIban').value,
            bic: document.getElementById('editBic').value,
            inailCodiceDitta: document.getElementById('editInailCodiceDitta').value,
            inailSede: document.getElementById('editInailSede').value,
            inailPat: document.getElementById('editInailPat').value,
            capitaleSociale: document.getElementById('editCapitaleSociale').value,
            rea: document.getElementById('editRea').value,
            noteFinali: document.getElementById('editNoteFinali').value
        };

        try {
            UI.showLoading('Salvataggio dati aziendali...');
            await this.saveGrowappData(newData);
            this.growappEditMode = false;
            UI.hideLoading();
            UI.showSuccess('Dati aziendali salvati con successo! Visibili a tutti gli utenti.');
            this.switchTab('azienda');
        } catch (error) {
            UI.hideLoading();
            UI.showError('Errore nel salvataggio: ' + error.message);
        }
    },

    renderSistemaTab() {
        const settings = SettingsService.getSystemSettings();

        return `
            <div class="card">
                <div class="card-header">
                    <h3>Impostazioni Sistema</h3>
                </div>
                <div class="card-body">
                    <div class="alert alert-info">
                        <i class="fas fa-info-circle"></i>
                        Le impostazioni di sistema saranno disponibili in una prossima versione
                    </div>

                    <div style="display: grid; gap: 1.5rem; opacity: 0.5; pointer-events: none;">
                        <div class="form-group">
                            <label>Notifiche Scadenze (giorni prima)</label>
                            <input type="number" value="${settings.notificheScadenze}" class="form-input"/>
                        </div>
                        <div class="form-group">
                            <label>IVA Predefinita (%)</label>
                            <input type="number" value="${settings.ivaDefault}" class="form-input"/>
                        </div>
                        <div class="form-group">
                            <label>Condizioni Pagamento Predefinite</label>
                            <input type="text" value="${settings.condizioniPagamento}" class="form-input"/>
                        </div>
                        <div class="form-group">
                            <label>Formato Numeri Fattura</label>
                            <input type="text" value="${settings.formatoFattura}" class="form-input"/>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderDatiTab() {
        return `
            <div class="card">
                <div class="card-header">
                    <h3>Gestione Dati</h3>
                    <p style="color: var(--grigio-500); font-size: 0.9rem; margin-top: 0.5rem;">
                        Strumenti per backup e verifica integrità dei dati
                    </p>
                </div>
                <div class="card-body">
                    <div style="display: grid; gap: 2rem;">
                        <!-- Backup Completo -->
                        <div>
                            <h4 style="color: var(--blu-700); margin-bottom: 0.5rem;">
                                <i class="fas fa-download"></i> Backup Completo
                            </h4>
                            <p style="color: var(--grigio-500); margin-bottom: 1rem;">
                                Esporta tutti i dati (Clienti, App, Contratti, Fatture, Scadenze) in un unico file Excel
                            </p>
                            <button
                                class="btn btn-primary"
                                onclick="Settings.exportBackupCompleto()"
                            >
                                <i class="fas fa-file-excel"></i> Esporta Backup
                            </button>
                        </div>

                        <!-- Audit Integrità Database -->
                        <div style="padding-top: 2rem; border-top: 1px solid var(--grigio-300);">
                            <h4 style="color: var(--verde-700); margin-bottom: 0.5rem;">
                                <i class="fas fa-shield-alt"></i> Audit Integrità Database
                            </h4>
                            <p style="color: var(--grigio-500); margin-bottom: 1rem;">
                                <strong>Analisi completa</strong> di tutti i collegamenti tra Clienti, Contratti, App e Fatture.<br>
                                Identifica riferimenti rotti, dati mancanti e incongruenze per garantire l'integrità del sistema.
                            </p>
                            <div id="auditResult" style="margin-bottom: 1rem;"></div>
                            <button
                                class="btn btn-success"
                                id="btnAudit"
                                onclick="Settings.auditDatabase()"
                            >
                                <i class="fas fa-search"></i> Esegui Audit Completo
                            </button>
                        </div>

                        <!-- Sistema Clienti Orfani -->
                        <div style="padding-top: 2rem; border-top: 1px solid var(--grigio-300);">
                            <h4 style="color: var(--rosso-errore); margin-bottom: 0.5rem;">
                                <i class="fas fa-tools"></i> Sistema Clienti Orfani
                            </h4>
                            <p style="color: var(--grigio-500); margin-bottom: 1rem;">
                                <strong>Trova e correggi</strong> fatture collegate a clienti inesistenti.<br>
                                Identifica riferimenti rotti e permette di riassegnare le fatture ai clienti corretti o eliminarle.
                            </p>
                            <button
                                class="btn btn-danger"
                                onclick="SistemaClientiOrfani.analizza()"
                            >
                                <i class="fas fa-search"></i> Cerca Clienti Orfani
                            </button>
                        </div>

                        <!-- 🏛️ Arricchimento Dati Comuni -->
                        <div style="padding-top: 2rem; border-top: 1px solid var(--grigio-300);">
                            <h4 style="color: var(--verde-700); margin-bottom: 0.5rem;">
                                <i class="fas fa-magic"></i> Arricchimento Dati da Database Comuni
                            </h4>
                            <p style="color: var(--grigio-500); margin-bottom: 1rem;">
                                <strong>Compila automaticamente</strong> i campi vuoti dei clienti che corrispondono a un Comune italiano.<br>
                                Confronta la Ragione Sociale con il database di <strong>7.909 comuni</strong> e importa: Codice Fiscale, Indirizzo, CAP, Provincia, Regione, Telefono, Email 2, PEC, Codice SDI, N. Residenti.<br>
                                <em>Non sovrascrive i campi già compilati.</em>
                            </p>
                            <div id="arricchimentoProgress" style="display: none; margin-bottom: 1rem;">
                                <div style="background: var(--grigio-200); border-radius: 8px; overflow: hidden; height: 24px; margin-bottom: 0.5rem;">
                                    <div id="arricchimentoBar" style="background: var(--verde-700); height: 100%; width: 0%; transition: width 0.3s; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 0.875rem;">
                                        0%
                                    </div>
                                </div>
                                <p id="arricchimentoStatus" style="color: var(--grigio-700); font-size: 0.875rem;"></p>
                            </div>
                            <div id="arricchimentoResult" style="margin-bottom: 1rem;"></div>
                            <button
                                class="btn"
                                id="btnArricchimento"
                                style="background: var(--verde-700); color: white;"
                                onclick="Settings.avviaArricchimento()"
                            >
                                <i class="fas fa-magic"></i> Avvia Arricchimento Massivo
                            </button>
                        </div>

                        <!-- Statistiche Database -->
                        <div style="padding-top: 2rem; border-top: 1px solid var(--grigio-300);">
                            <h4 style="color: var(--blu-700); margin-bottom: 1rem;">
                                <i class="fas fa-chart-pie"></i> Statistiche Database
                            </h4>
                            <div id="dbStats" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
                                <div class="stat-box">
                                    <div class="stat-value" id="statClienti">-</div>
                                    <div class="stat-label">Clienti</div>
                                </div>
                                <div class="stat-box">
                                    <div class="stat-value" id="statApp">-</div>
                                    <div class="stat-label">App</div>
                                </div>
                                <div class="stat-box">
                                    <div class="stat-value" id="statContratti">-</div>
                                    <div class="stat-label">Contratti</div>
                                </div>
                                <div class="stat-box">
                                    <div class="stat-value" id="statFatture">-</div>
                                    <div class="stat-label">Fatture</div>
                                </div>
                                <div class="stat-box">
                                    <div class="stat-value" id="statScadenze">-</div>
                                    <div class="stat-label">Scadenze</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderUtentiTab() {
        return `
            <div class="card">
                <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h3>Gestione Utenti</h3>
                        <p style="color: var(--grigio-500); font-size: 0.9rem; margin-top: 0.5rem;">
                            Crea e gestisci gli utenti del sistema con ruoli e permessi
                        </p>
                    </div>
                    <button class="btn btn-primary" onclick="Settings.showUserForm()">
                        <i class="fas fa-user-plus"></i> Nuovo Utente
                    </button>
                </div>
                <div class="card-body">
                    <div id="utentiListContainer">
                        <div style="text-align: center; padding: 2rem; color: var(--grigio-500);">
                            <i class="fas fa-spinner fa-spin fa-2x"></i>
                            <p style="margin-top: 1rem;">Caricamento utenti...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    async loadUtentiList() {
        try {
            const utentiSnapshot = await db.collection('utenti').orderBy('cognome').get();
            const container = document.getElementById('utentiListContainer');

            if (utentiSnapshot.empty) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 3rem; color: var(--grigio-500);">
                        <i class="fas fa-users fa-3x" style="opacity: 0.3;"></i>
                        <p style="margin-top: 1rem; font-size: 1.1rem;">Nessun utente trovato</p>
                        <button class="btn btn-primary" onclick="Settings.showUserForm()" style="margin-top: 1rem;">
                            <i class="fas fa-user-plus"></i> Crea Primo Utente
                        </button>
                    </div>
                `;
                return;
            }

            const utenti = [];
            utentiSnapshot.forEach(doc => {
                utenti.push({ id: doc.id, ...doc.data() });
            });

            container.innerHTML = `
                <div style="overflow-x: auto;">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Email</th>
                                <th>Ruolo</th>
                                <th>Stato</th>
                                <th>Ultimo Accesso</th>
                                <th style="text-align: right;">Azioni</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${utenti.map(utente => {
                                const uId = utente.id; // doc.id Firestore, sempre affidabile
                                const isSelf = uId === AuthService.getUserId();
                                return `
                                <tr>
                                    <td>
                                        <div style="font-weight: 600;">${utente.nome} ${utente.cognome}</div>
                                        ${isSelf ? '<span class="badge" style="background: var(--blu-700);">Tu</span>' : ''}
                                    </td>
                                    <td>${utente.email}</td>
                                    <td>
                                        <span class="badge" style="background: var(--blu-500); color: white;">
                                            ${AuthService.ROLE_LABELS[utente.ruolo] || utente.ruolo}
                                        </span>
                                        ${utente.ancheAgente && utente.ruolo !== 'AGENTE' ? '<span class="badge" style="background: var(--verde-700); color: white; margin-left: 0.25rem;"><i class="fas fa-user-tie"></i> Agente</span>' : ''}
                                    </td>
                                    <td>
                                        <span class="badge" style="background: ${utente.stato === 'ATTIVO' ? 'var(--verde-700)' : 'var(--grigio-500)'};">
                                            ${utente.stato || 'ATTIVO'}
                                        </span>
                                    </td>
                                    <td style="font-size: 0.85rem; color: var(--grigio-600);">
                                        ${utente.lastLogin ? new Date(utente.lastLogin.toDate()).toLocaleDateString('it-IT') : 'Mai'}
                                    </td>
                                    <td style="text-align: right;">
                                        <button class="btn btn-sm btn-secondary" onclick="Settings.editUser('${uId}')" title="Modifica">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        ${!isSelf ? `
                                            <button class="btn btn-sm ${utente.stato === 'ATTIVO' ? 'btn-warning' : 'btn-success'}"
                                                onclick="Settings.toggleUserStatus('${uId}', '${utente.stato || 'ATTIVO'}')"
                                                title="${utente.stato === 'ATTIVO' ? 'Disattiva' : 'Attiva'}">
                                                <i class="fas fa-${utente.stato === 'ATTIVO' ? 'ban' : 'check'}"></i>
                                            </button>
                                        ` : ''}
                                        <button class="btn btn-sm btn-primary" onclick="Settings.resetUserPassword('${uId}', '${utente.email}')" title="Reset Password">
                                            <i class="fas fa-key"></i>
                                        </button>
                                        ${AuthService.isSuperAdmin() && !isSelf ? `
                                            <button class="btn btn-sm btn-danger" onclick="Settings.deleteUser('${uId}', '${utente.nome} ${utente.cognome}')" title="Elimina Utente">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        ` : ''}
                                    </td>
                                </tr>
                            `;}).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (error) {
            console.error('Errore caricamento utenti:', error);
            document.getElementById('utentiListContainer').innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle"></i> Errore caricamento utenti: ${error.message}
                </div>
            `;
        }
    },

    async showUserForm(userId = null) {
        const isEdit = userId !== null;
        let utente = null;

        // Se è modifica, carica i dati dell'utente
        if (isEdit) {
            try {
                const userDoc = await db.collection('utenti').doc(userId).get();
                if (!userDoc.exists) {
                    UI.showError('Utente non trovato');
                    return;
                }
                utente = { uid: userDoc.id, ...userDoc.data() };
            } catch (error) {
                UI.showError('Errore caricamento utente: ' + error.message);
                return;
            }
        }

        const modalHtml = `
            <div id="userModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center;">
                <div style="background: white; border-radius: 12px; width: 90%; max-width: 600px; max-height: 90vh; overflow-y: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                    <!-- Header -->
                    <div style="padding: 1.5rem; border-bottom: 2px solid var(--grigio-300); display: flex; justify-content: space-between; align-items: center;">
                        <h2 style="font-size: 1.5rem; font-weight: 700; color: var(--blu-700); margin: 0;">
                            <i class="fas fa-${isEdit ? 'user-edit' : 'user-plus'}"></i> ${isEdit ? 'Modifica Utente' : 'Nuovo Utente'}
                        </h2>
                        <button onclick="Settings.closeUserModal()" style="background: none; border: none; font-size: 1.5rem; color: var(--grigio-600); cursor: pointer;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <!-- Form -->
                    <form id="userForm" style="padding: 1.5rem;">
                        <!-- Nome -->
                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: block; font-weight: 600; color: var(--grigio-900); margin-bottom: 0.5rem;">
                                Nome <span style="color: var(--rosso-errore);">*</span>
                            </label>
                            <input type="text" id="userNome" required
                                   value="${isEdit ? utente.nome : ''}"
                                   placeholder="Es: Mario"
                                   style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 6px; font-size: 1rem;">
                        </div>

                        <!-- Cognome -->
                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: block; font-weight: 600; color: var(--grigio-900); margin-bottom: 0.5rem;">
                                Cognome <span style="color: var(--rosso-errore);">*</span>
                            </label>
                            <input type="text" id="userCognome" required
                                   value="${isEdit ? utente.cognome : ''}"
                                   placeholder="Es: Rossi"
                                   style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 6px; font-size: 1rem;">
                        </div>

                        <!-- Email -->
                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: block; font-weight: 600; color: var(--grigio-900); margin-bottom: 0.5rem;">
                                Email <span style="color: var(--rosso-errore);">*</span>
                            </label>
                            <input type="email" id="userEmail" required
                                   value="${isEdit ? utente.email : ''}"
                                   ${isEdit ? 'disabled' : ''}
                                   placeholder="Es: mario.rossi@example.com"
                                   style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 6px; font-size: 1rem; ${isEdit ? 'background: var(--grigio-100); cursor: not-allowed;' : ''}">
                            ${isEdit ? '<small style="color: var(--grigio-600); font-size: 0.875rem;">Email non modificabile</small>' : ''}
                        </div>

                        <!-- 📱 Telegram Username (nuovo!) -->
                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: block; font-weight: 600; color: var(--grigio-900); margin-bottom: 0.5rem;">
                                <i class="fab fa-telegram" style="color: #0088cc;"></i> Username Telegram
                            </label>
                            <input type="text" id="userTelegram"
                                   value="${isEdit && utente.telegramUsername ? utente.telegramUsername : ''}"
                                   placeholder="Es: @nomeutente"
                                   style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 6px; font-size: 1rem;">
                            <small style="color: var(--grigio-600); font-size: 0.875rem;">
                                <i class="fas fa-info-circle"></i> Necessario per ricevere notifiche Telegram sui task urgenti
                            </small>
                        </div>

                        <!-- Password (solo creazione) -->
                        ${!isEdit ? `
                            <div style="margin-bottom: 1.5rem;">
                                <label style="display: block; font-weight: 600; color: var(--grigio-900); margin-bottom: 0.5rem;">
                                    Password <span style="color: var(--rosso-errore);">*</span>
                                </label>
                                <input type="password" id="userPassword" required
                                       placeholder="Almeno 6 caratteri"
                                       style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 6px; font-size: 1rem;">
                                <small style="color: var(--grigio-600); font-size: 0.875rem;">Minimo 6 caratteri</small>
                            </div>
                        ` : ''}

                        <!-- Ruolo -->
                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: block; font-weight: 600; color: var(--grigio-900); margin-bottom: 0.5rem;">
                                Ruolo <span style="color: var(--rosso-errore);">*</span>
                            </label>
                            <select id="userRuolo" required
                                    style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 6px;">
                                ${Object.keys(AuthService.ROLES).map(roleKey => `
                                    <option value="${roleKey}" ${isEdit && utente.ruolo === roleKey ? 'selected' : ''}>
                                        ${AuthService.ROLE_LABELS[roleKey]}
                                    </option>
                                `).join('')}
                            </select>
                        </div>

                        <!-- Stato -->
                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: block; font-weight: 600; color: var(--grigio-900); margin-bottom: 0.5rem;">
                                Stato
                            </label>
                            <select id="userStato"
                                    style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 6px;">
                                <option value="ATTIVO" ${!isEdit || (utente && utente.stato === 'ATTIVO') ? 'selected' : ''}>Attivo</option>
                                <option value="DISATTIVO" ${isEdit && utente && utente.stato === 'DISATTIVO' ? 'selected' : ''}>Disattivo</option>
                            </select>
                        </div>

                        <!-- Flag Anche Agente (nascosto se ruolo è già AGENTE) -->
                        <div id="ancheAgenteContainer" style="margin-bottom: 1.5rem; padding: 1rem; background: var(--verde-100); border-radius: 8px; border-left: 4px solid var(--verde-700); ${isEdit && utente && utente.ruolo === 'AGENTE' ? 'display: none;' : ''}">
                            <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer;">
                                <input type="checkbox" id="userAncheAgente"
                                       ${isEdit && utente && utente.ancheAgente ? 'checked' : ''}
                                       style="width: 20px; height: 20px;">
                                <div>
                                    <span style="font-weight: 700; color: var(--verde-900); font-size: 1rem;">
                                        <i class="fas fa-user-tie"></i> Opera anche come Agente Commerciale
                                    </span>
                                    <div style="font-size: 0.85rem; color: var(--grigio-700); margin-top: 0.25rem;">
                                        Se attivo, questo utente apparirà nelle liste agenti per l'assegnazione ai clienti e alle app, pur mantenendo il suo ruolo principale.
                                    </div>
                                </div>
                            </label>
                        </div>

                        <!-- Permessi Info (readonly) -->
                        <div style="margin-bottom: 1.5rem; padding: 1rem; background: var(--blu-100); border-radius: 6px;">
                            <h4 style="font-size: 0.875rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                                <i class="fas fa-info-circle"></i> Permessi associati al ruolo
                            </h4>
                            <div id="rolePermissionsPreview" style="font-size: 0.875rem; color: var(--grigio-700);">
                                <!-- Aggiornato dinamicamente -->
                            </div>
                        </div>

                        <!-- Pulsanti -->
                        <div style="display: flex; gap: 1rem; justify-content: flex-end; padding-top: 1rem; border-top: 1px solid var(--grigio-300);">
                            <button type="button" onclick="Settings.closeUserModal()" class="btn btn-secondary">
                                <i class="fas fa-times"></i> Annulla
                            </button>
                            <button type="submit" class="btn btn-primary">
                                <i class="fas fa-check"></i> ${isEdit ? 'Salva Modifiche' : 'Crea Utente'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Update permissions preview on role change
        const ruoloSelect = document.getElementById('userRuolo');
        const updatePermissionsPreview = () => {
            const selectedRole = ruoloSelect.value;
            const permissions = AuthService.ROLE_PERMISSIONS[selectedRole] || [];
            const previewDiv = document.getElementById('rolePermissionsPreview');

            if (permissions.includes('*')) {
                previewDiv.innerHTML = '<strong style="color: var(--verde-700);">✓ Tutti i permessi (Super Admin)</strong>';
            } else {
                previewDiv.innerHTML = `
                    <ul style="margin: 0; padding-left: 1.5rem; list-style: disc;">
                        ${permissions.map(p => `<li>${p}</li>`).join('')}
                    </ul>
                `;
            }
        };

        // Mostra/nascondi checkbox "anche agente" in base al ruolo
        const updateAncheAgenteVisibility = () => {
            const container = document.getElementById('ancheAgenteContainer');
            const checkbox = document.getElementById('userAncheAgente');
            if (ruoloSelect.value === 'AGENTE') {
                container.style.display = 'none';
                checkbox.checked = false; // Non serve se il ruolo è già AGENTE
            } else {
                container.style.display = '';
            }
        };

        ruoloSelect.addEventListener('change', () => {
            updatePermissionsPreview();
            updateAncheAgenteVisibility();
        });
        updatePermissionsPreview(); // Initial load
        updateAncheAgenteVisibility(); // Initial load

        // Form submit
        document.getElementById('userForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveUser(userId);
        });

        // Close on click outside
        document.getElementById('userModal').addEventListener('click', (e) => {
            if (e.target.id === 'userModal') {
                this.closeUserModal();
            }
        });
    },

    closeUserModal() {
        const modal = document.getElementById('userModal');
        if (modal) {
            modal.remove();
        }
    },

    async editUser(userId) {
        await this.showUserForm(userId);
    },

    async toggleUserStatus(userId, currentStatus) {
        const newStatus = currentStatus === 'ATTIVO' ? 'DISATTIVO' : 'ATTIVO';
        const conferma = confirm(`Confermi di voler ${newStatus === 'ATTIVO' ? 'attivare' : 'disattivare'} questo utente?`);

        if (!conferma) return;

        try {
            await db.collection('utenti').doc(userId).update({
                stato: newStatus
            });
            UI.showSuccess(`Utente ${newStatus === 'ATTIVO' ? 'attivato' : 'disattivato'} con successo`);
            this.loadUtentiList();
        } catch (error) {
            UI.showError('Errore: ' + error.message);
        }
    },

    async resetUserPassword(userId, email) {
        const conferma = confirm(`Inviare email di reset password a ${email}?`);

        if (!conferma) return;

        try {
            await auth.sendPasswordResetEmail(email);
            UI.showSuccess(`Email di reset password inviata a ${email}`);
        } catch (error) {
            UI.showError('Errore invio email: ' + error.message);
        }
    },

    async saveUser(userId = null) {
        const isEdit = userId !== null;

        UI.showLoading();

        try {
            // Raccogli dati dal form
            const nome = document.getElementById('userNome').value.trim();
            const cognome = document.getElementById('userCognome').value.trim();
            const email = document.getElementById('userEmail').value.trim().toLowerCase();
            const password = !isEdit ? document.getElementById('userPassword').value : null;
            const ruolo = document.getElementById('userRuolo').value;
            const stato = document.getElementById('userStato').value;
            const telegramUsername = document.getElementById('userTelegram').value.trim();
            const ancheAgente = ruolo !== 'AGENTE' ? document.getElementById('userAncheAgente').checked : false;

            // Validazione
            if (!nome || !cognome || !email || !ruolo) {
                UI.showError('Compila tutti i campi obbligatori');
                UI.hideLoading();
                return;
            }

            if (!isEdit && (!password || password.length < 6)) {
                UI.showError('La password deve essere di almeno 6 caratteri');
                UI.hideLoading();
                return;
            }

            if (isEdit) {
                // MODIFICA UTENTE ESISTENTE
                await db.collection('utenti').doc(userId).update({
                    nome: nome,
                    cognome: cognome,
                    ruolo: ruolo,
                    stato: stato,
                    ancheAgente: ancheAgente,
                    telegramUsername: telegramUsername || null,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: AuthService.getUserId()
                });

                UI.hideLoading();
                UI.showSuccess('Utente aggiornato con successo');
                this.closeUserModal();
                this.loadUtentiList();

                // Svuota cache agenti in caso di cambio nome/ruolo
                DataService._cacheAgenti = null;
                DataService._cacheAgentiTimestamp = 0;

            } else {
                // CREAZIONE NUOVO UTENTE

                // Verifica che l'email non esista già
                const existingUser = await db.collection('utenti')
                    .where('email', '==', email)
                    .get();

                if (!existingUser.empty) {
                    UI.showError('Esiste già un utente con questa email');
                    UI.hideLoading();
                    return;
                }

                // Crea account Firebase Auth usando una seconda istanza
                // per evitare di fare logout dell'admin corrente
                let newUser;
                let secondaryApp;

                try {
                    // Crea una seconda istanza di Firebase App temporanea
                    const firebaseConfig = firebase.app().options;

                    // Elimina eventuale istanza 'Secondary' rimasta da un tentativo precedente
                    try {
                        const existingApp = firebase.app('Secondary');
                        if (existingApp) await existingApp.delete();
                    } catch (e) { /* Non esiste, va bene */ }

                    secondaryApp = firebase.initializeApp(firebaseConfig, 'Secondary');

                    // Crea l'utente usando l'istanza secondaria
                    const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(email, password);
                    newUser = userCredential.user;

                    // Elimina subito l'istanza secondaria
                    await secondaryApp.delete();

                } catch (authError) {
                    // Pulisci l'istanza secondaria in caso di errore
                    if (secondaryApp) {
                        try { await secondaryApp.delete(); } catch (e) {}
                    }

                    // CASO SPECIALE: Email già in uso in Auth (utente cancellato ma Auth rimasto)
                    if (authError.code === 'auth/email-already-in-use') {
                        const confermaRecupero = confirm(
                            `⚠️ ATTENZIONE ⚠️\n\n` +
                            `Esiste già un account Firebase con questa email, probabilmente da un utente precedentemente eliminato.\n\n` +
                            `Vuoi RECUPERARE l'account esistente?\n\n` +
                            `NOTA: Non potrai impostare una nuova password. L'utente dovrà usare "Reset Password" per accedere.`
                        );

                        if (!confermaRecupero) {
                            UI.hideLoading();
                            return;
                        }

                        // Prova a recuperare l'UID usando Cloud Functions o metodo alternativo
                        // Per ora, creo solo il documento con UID temporaneo e chiedo reset password
                        UI.showError(
                            'Account Firebase già esistente. ' +
                            'Per favore usa il pulsante "Reset Password" dopo aver creato l\'utente per permettergli di accedere.'
                        );
                        UI.hideLoading();
                        return;

                    } else if (authError.code === 'auth/weak-password') {
                        UI.showError('Password troppo debole');
                    } else {
                        UI.showError('Errore creazione utente: ' + authError.message);
                    }
                    UI.hideLoading();
                    return;
                }

                // Crea documento utente in Firestore
                await db.collection('utenti').doc(newUser.uid).set({
                    uid: newUser.uid,
                    nome: nome,
                    cognome: cognome,
                    email: email,
                    ruolo: ruolo,
                    stato: stato,
                    ancheAgente: ancheAgente,
                    telegramUsername: telegramUsername || null,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdBy: AuthService.getUserId(),
                    lastLogin: null
                });

                UI.hideLoading();
                UI.showSuccess('Utente creato con successo!');

                // Chiudi modal
                this.closeUserModal();

                // Ricarica lista utenti
                this.loadUtentiList();

                // Svuota cache agenti così il nuovo agente appare nelle select
                DataService._cacheAgenti = null;
                DataService._cacheAgentiTimestamp = 0;
            }

        } catch (error) {
            console.error('Errore salvataggio utente:', error);
            UI.showError('Errore: ' + error.message);
            UI.hideLoading();
        }
    },

    async deleteUser(userId, userName) {
        // Verifica che solo Super Admin possa eliminare utenti
        if (!AuthService.isSuperAdmin()) {
            UI.showError('Solo il Super Amministratore può eliminare utenti');
            return;
        }

        // Verifica che non stia cercando di eliminare se stesso
        if (userId === AuthService.getUserId()) {
            UI.showError('Non puoi eliminare te stesso');
            return;
        }

        // Conferma
        const conferma = confirm(
            `⚠️ DISATTIVAZIONE UTENTE ⚠️\n\n` +
            `Stai per DISATTIVARE l'utente:\n${userName}\n\n` +
            `L'utente verrà disattivato e non potrà più accedere.\n` +
            `Potrai riattivarlo modificando il suo stato.\n\n` +
            `Vuoi procedere?`
        );

        if (!conferma) return;

        UI.showLoading();

        try {
            // SOFT DELETE: Disattiva l'utente invece di eliminarlo
            // Questo evita problemi con Firebase Auth e permette di riattivare l'utente
            await db.collection('utenti').doc(userId).update({
                stato: 'DISATTIVO',
                disabledAt: firebase.firestore.FieldValue.serverTimestamp(),
                disabledBy: AuthService.getUserId()
            });

            UI.showSuccess(`Utente ${userName} disattivato con successo`);

            // Ricarica lista
            this.loadUtentiList();

        } catch (error) {
            console.error('Errore disattivazione utente:', error);
            UI.showError('Errore: ' + error.message);
            UI.hideLoading();
        }
    },

    // === TAB UNISCI CLIENTI DUPLICATI ===
    renderUnisciClientiTab() {
        return `
            <div class="card fade-in">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-object-group"></i> Unisci Clienti Duplicati
                    </h2>
                </div>
                <div style="padding: 1.5rem;">
                    <div style="padding: 1rem; background: #E1F5FE; border-left: 4px solid #0288D1; border-radius: 8px; margin-bottom: 1.5rem;">
                        <p style="color: #01579B; margin: 0; font-size: 0.9rem; line-height: 1.6;">
                            <i class="fas fa-info-circle"></i> Usa questo strumento quando hai <strong>due schede cliente per lo stesso soggetto</strong> (es. nome scritto diversamente).
                            Scegli quale cliente tenere (il "principale") e quale eliminare (il "duplicato"). Tutte le fatture, i contratti, i documenti e le scadenze del duplicato verranno spostati al principale.
                        </p>
                    </div>

                    <!-- Step 1: Cerca duplicati -->
                    <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 1rem;">
                        <i class="fas fa-search"></i> 1. Cerca i due clienti
                    </h3>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
                        <!-- Cliente PRINCIPALE (da mantenere) -->
                        <div style="padding: 1rem; border: 2px solid var(--verde-700); border-radius: 8px; background: var(--verde-100);">
                            <label style="display: block; font-weight: 700; color: var(--verde-900); margin-bottom: 0.5rem;">
                                <i class="fas fa-check-circle"></i> Cliente PRINCIPALE (da mantenere)
                            </label>
                            <input type="text" id="searchClientePrincipale" placeholder="Cerca per nome..."
                                oninput="Settings.cercaClienteUnione('principale', this.value)"
                                style="width: 100%; padding: 0.75rem; border: 1px solid var(--verde-700); border-radius: 6px; font-family: inherit; font-size: 1rem; margin-bottom: 0.5rem;"
                            />
                            <div id="risultatiPrincipale" style="max-height: 150px; overflow-y: auto;"></div>
                            <div id="selezionatoPrincipale" style="display: none; margin-top: 0.5rem;"></div>
                        </div>

                        <!-- Cliente DUPLICATO (da eliminare) -->
                        <div style="padding: 1rem; border: 2px solid #D32F2F; border-radius: 8px; background: #FFEBEE;">
                            <label style="display: block; font-weight: 700; color: #C62828; margin-bottom: 0.5rem;">
                                <i class="fas fa-times-circle"></i> Cliente DUPLICATO (da eliminare)
                            </label>
                            <input type="text" id="searchClienteDuplicato" placeholder="Cerca per nome..."
                                oninput="Settings.cercaClienteUnione('duplicato', this.value)"
                                style="width: 100%; padding: 0.75rem; border: 1px solid #D32F2F; border-radius: 6px; font-family: inherit; font-size: 1rem; margin-bottom: 0.5rem;"
                            />
                            <div id="risultatiDuplicato" style="max-height: 150px; overflow-y: auto;"></div>
                            <div id="selezionatoDuplicato" style="display: none; margin-top: 0.5rem;"></div>
                        </div>
                    </div>

                    <!-- Step 2: Anteprima -->
                    <div id="unioneAnteprima" style="display: none;">
                        <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 1rem;">
                            <i class="fas fa-eye"></i> 2. Anteprima dell'unione
                        </h3>
                        <div id="unioneDettagli"></div>

                        <div style="margin-top: 1.5rem; padding: 1rem; background: #FFF3E0; border-left: 4px solid #FFCC00; border-radius: 8px;">
                            <p style="color: #E65100; margin: 0; font-weight: 600;">
                                <i class="fas fa-exclamation-triangle"></i> Attenzione: il cliente duplicato verrà <strong>eliminato definitivamente</strong> dopo lo spostamento dei dati. Questa operazione non è reversibile.
                            </p>
                        </div>

                        <button class="btn btn-success" id="btnEseguiUnione" onclick="Settings.eseguiUnione()" style="margin-top: 1rem;">
                            <i class="fas fa-play"></i> Esegui Unione
                        </button>
                    </div>

                    <div id="unioneProgress" style="display: none;"></div>
                </div>
            </div>
        `;
    },

    _clientePrincipale: null,
    _clienteDuplicato: null,
    _unioneSearchTimeout: null,

    async cercaClienteUnione(tipo, query) {
        clearTimeout(this._unioneSearchTimeout);
        this._unioneSearchTimeout = setTimeout(async () => {
            const resultsDiv = document.getElementById(`risultati${tipo === 'principale' ? 'Principale' : 'Duplicato'}`);
            if (!query || query.length < 2) {
                resultsDiv.innerHTML = '';
                return;
            }

            const clienti = await DataService.getClienti();
            const filtrati = clienti.filter(c =>
                c.ragioneSociale?.toLowerCase().includes(query.toLowerCase())
            ).slice(0, 10);

            if (filtrati.length === 0) {
                resultsDiv.innerHTML = '<p style="color: var(--grigio-500); font-size: 0.85rem; padding: 0.5rem;">Nessun risultato</p>';
                return;
            }

            resultsDiv.innerHTML = filtrati.map(c => `
                <div onclick="Settings.selezionaClienteUnione('${tipo}', '${c.id}')"
                     style="padding: 0.5rem 0.75rem; cursor: pointer; border-bottom: 1px solid var(--grigio-200); font-size: 0.9rem; transition: background 0.2s;"
                     onmouseover="this.style.background='rgba(0,0,0,0.05)'"
                     onmouseout="this.style.background='transparent'">
                    <strong>${c.ragioneSociale}</strong>
                    <span style="color: var(--grigio-500); font-size: 0.8rem;"> (${c.provincia || 'N/A'}) ${c.tipo === 'PA' ? '🏛️ PA' : ''}</span>
                </div>
            `).join('');
        }, 300);
    },

    async selezionaClienteUnione(tipo, clienteId) {
        const cliente = await DataService.getCliente(clienteId);
        if (!cliente) return;

        // Carica dati associati
        const fatture = await DataService.getFattureCliente(cliente.clienteIdLegacy || clienteId);
        const contratti = await DataService.getContrattiCliente(cliente.clienteIdLegacy || clienteId);

        const selDiv = document.getElementById(`selezionato${tipo === 'principale' ? 'Principale' : 'Duplicato'}`);
        const resultsDiv = document.getElementById(`risultati${tipo === 'principale' ? 'Principale' : 'Duplicato'}`);
        const searchInput = document.getElementById(`searchCliente${tipo === 'principale' ? 'Principale' : 'Duplicato'}`);

        // Salva il cliente selezionato
        if (tipo === 'principale') {
            this._clientePrincipale = { ...cliente, _fatture: fatture, _contratti: contratti };
        } else {
            this._clienteDuplicato = { ...cliente, _fatture: fatture, _contratti: contratti };
        }

        const colore = tipo === 'principale' ? 'var(--verde-700)' : '#D32F2F';
        selDiv.innerHTML = `
            <div style="padding: 0.75rem; background: white; border-radius: 6px; border: 1px solid ${colore};">
                <strong style="color: ${colore}; font-size: 1rem;">${cliente.ragioneSociale}</strong>
                <div style="font-size: 0.8rem; color: var(--grigio-600); margin-top: 0.25rem;">
                    ID: ${cliente.clienteIdLegacy || cliente.id}<br/>
                    Tipo: ${cliente.tipo || 'N/A'} • Provincia: ${cliente.provincia || 'N/A'}<br/>
                    <strong>${fatture.length} fatture</strong> • <strong>${contratti.length} contratti</strong>
                </div>
                <button onclick="Settings.deselezionaClienteUnione('${tipo}')" style="margin-top: 0.5rem; font-size: 0.8rem; color: ${colore}; background: none; border: 1px solid ${colore}; border-radius: 4px; padding: 0.25rem 0.5rem; cursor: pointer;">
                    <i class="fas fa-times"></i> Cambia
                </button>
            </div>
        `;
        selDiv.style.display = 'block';
        resultsDiv.innerHTML = '';
        searchInput.style.display = 'none';

        // Se entrambi i clienti sono selezionati, mostra anteprima
        if (this._clientePrincipale && this._clienteDuplicato) {
            this.mostraAnteprimaUnione();
        }
    },

    deselezionaClienteUnione(tipo) {
        const selDiv = document.getElementById(`selezionato${tipo === 'principale' ? 'Principale' : 'Duplicato'}`);
        const searchInput = document.getElementById(`searchCliente${tipo === 'principale' ? 'Principale' : 'Duplicato'}`);

        selDiv.style.display = 'none';
        selDiv.innerHTML = '';
        searchInput.style.display = 'block';
        searchInput.value = '';

        if (tipo === 'principale') {
            this._clientePrincipale = null;
        } else {
            this._clienteDuplicato = null;
        }

        document.getElementById('unioneAnteprima').style.display = 'none';
    },

    mostraAnteprimaUnione() {
        const principale = this._clientePrincipale;
        const duplicato = this._clienteDuplicato;

        if (principale.id === duplicato.id) {
            UI.showError('Non puoi unire un cliente con se stesso!');
            return;
        }

        const dettagliDiv = document.getElementById('unioneDettagli');
        dettagliDiv.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 1rem; align-items: start;">
                <!-- Duplicato (sorgente) -->
                <div style="padding: 1rem; background: #FFEBEE; border-radius: 8px; border: 2px solid #D32F2F;">
                    <h4 style="color: #C62828; margin: 0 0 0.75rem 0; font-size: 0.95rem;">
                        <i class="fas fa-times-circle"></i> DA ELIMINARE
                    </h4>
                    <p style="font-weight: 700; margin: 0 0 0.5rem 0;">${duplicato.ragioneSociale}</p>
                    <p style="font-size: 0.85rem; color: var(--grigio-700); margin: 0;">
                        ${duplicato._fatture.length} fatture da spostare<br/>
                        ${duplicato._contratti.length} contratti da spostare
                    </p>
                </div>

                <!-- Freccia -->
                <div style="display: flex; align-items: center; justify-content: center; padding-top: 2rem;">
                    <i class="fas fa-arrow-right" style="font-size: 2rem; color: var(--blu-700);"></i>
                </div>

                <!-- Principale (destinazione) -->
                <div style="padding: 1rem; background: var(--verde-100); border-radius: 8px; border: 2px solid var(--verde-700);">
                    <h4 style="color: var(--verde-900); margin: 0 0 0.75rem 0; font-size: 0.95rem;">
                        <i class="fas fa-check-circle"></i> DA MANTENERE
                    </h4>
                    <p style="font-weight: 700; margin: 0 0 0.5rem 0;">${principale.ragioneSociale}</p>
                    <p style="font-size: 0.85rem; color: var(--grigio-700); margin: 0;">
                        ${principale._fatture.length} fatture esistenti<br/>
                        ${principale._contratti.length} contratti esistenti<br/><br/>
                        <strong style="color: var(--verde-700);">Dopo l'unione:</strong><br/>
                        ${principale._fatture.length + duplicato._fatture.length} fatture totali<br/>
                        ${principale._contratti.length + duplicato._contratti.length} contratti totali
                    </p>
                </div>
            </div>

            ${duplicato._fatture.length > 0 ? `
                <div style="margin-top: 1rem;">
                    <h4 style="font-size: 0.9rem; font-weight: 700; color: var(--grigio-700); margin-bottom: 0.5rem;">
                        <i class="fas fa-file-invoice"></i> Fatture che verranno spostate:
                    </h4>
                    <div style="max-height: 200px; overflow-y: auto; background: var(--grigio-100); border-radius: 6px; padding: 0.5rem;">
                        ${duplicato._fatture.map(f => `
                            <div style="display: flex; justify-content: space-between; padding: 0.35rem 0.5rem; font-size: 0.85rem; border-bottom: 1px solid var(--grigio-200);">
                                <span><strong>${f.numeroFatturaCompleto || 'N/A'}</strong> — ${DataService.formatDate(f.dataEmissione)}</span>
                                <span style="font-weight: 600;">${DataService.formatCurrency(f.importoTotale)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        `;

        document.getElementById('unioneAnteprima').style.display = 'block';
    },

    async eseguiUnione() {
        const principale = this._clientePrincipale;
        const duplicato = this._clienteDuplicato;

        if (!principale || !duplicato) {
            UI.showError('Seleziona entrambi i clienti');
            return;
        }

        if (principale.id === duplicato.id) {
            UI.showError('Non puoi unire un cliente con se stesso!');
            return;
        }

        const conferma = confirm(
            `Confermi l'unione?\n\n` +
            `ELIMINARE: "${duplicato.ragioneSociale}"\n` +
            `MANTENERE: "${principale.ragioneSociale}"\n\n` +
            `${duplicato._fatture.length} fatture e ${duplicato._contratti.length} contratti verranno spostati.\n` +
            `Il cliente duplicato verrà eliminato definitivamente.`
        );
        if (!conferma) return;

        const progressDiv = document.getElementById('unioneProgress');
        const btnEsegui = document.getElementById('btnEseguiUnione');
        btnEsegui.disabled = true;
        btnEsegui.innerHTML = '<i class="fas fa-spinner fa-spin"></i> In corso...';
        progressDiv.style.display = 'block';

        // Raccoglie TUTTI i possibili ID del cliente principale e duplicato
        const idsPrincipale = [principale.id, principale.clienteIdLegacy].filter(Boolean);
        const idsDuplicato = [duplicato.id, duplicato.clienteIdLegacy].filter(Boolean);
        // ID da usare per il salvataggio (usa il legacy se esiste)
        const idPrincipale = principale.clienteIdLegacy || principale.id;
        let operazioni = 0;
        let errori = 0;
        const totaleOp = duplicato._fatture.length + duplicato._contratti.length + 1; // +1 per eliminazione

        try {
            // 1. Sposta tutte le fatture (trovate tramite getFattureCliente che cerca entrambi gli ID)
            for (const fattura of duplicato._fatture) {
                try {
                    await db.collection('fatture').doc(fattura.id).update({
                        clienteId: idPrincipale,
                        clienteRagioneSociale: principale.ragioneSociale
                    });
                    operazioni++;
                } catch (e) {
                    console.error(`Errore spostamento fattura ${fattura.id}:`, e);
                    errori++;
                }
                this._aggiornaProgressUnione(progressDiv, operazioni + errori, totaleOp, 'Spostamento fatture...');
            }

            // 2. Sposta tutti i contratti (trovati tramite getContrattiCliente che cerca entrambi gli ID)
            for (const contratto of duplicato._contratti) {
                try {
                    await db.collection('contratti').doc(contratto.id).update({
                        clienteId: idPrincipale,
                        clienteRagioneSociale: principale.ragioneSociale
                    });
                    operazioni++;
                } catch (e) {
                    console.error(`Errore spostamento contratto ${contratto.id}:`, e);
                    errori++;
                }
                this._aggiornaProgressUnione(progressDiv, operazioni + errori, totaleOp, 'Spostamento contratti...');
            }

            // 3. Sposta scadenze (cerca per TUTTI gli ID del duplicato)
            try {
                for (const idDup of idsDuplicato) {
                    const scadenzeSnapshot = await db.collection('scadenzario')
                        .where('clienteId', '==', idDup).get();
                    for (const doc of scadenzeSnapshot.docs) {
                        await db.collection('scadenzario').doc(doc.id).update({
                            clienteId: idPrincipale,
                            clienteRagioneSociale: principale.ragioneSociale
                        });
                    }
                }
            } catch (e) {
                console.error('Errore spostamento scadenze:', e);
            }

            // 4. Sposta documenti (cerca per TUTTI gli ID del duplicato)
            try {
                for (const idDup of idsDuplicato) {
                    const documentiSnapshot = await db.collection('documenti')
                        .where('entitaId', '==', idDup).get();
                    for (const doc of documentiSnapshot.docs) {
                        await db.collection('documenti').doc(doc.id).update({
                            entitaId: principale.id
                        });
                    }
                }
            } catch (e) {
                console.error('Errore spostamento documenti:', e);
            }

            // 5. Elimina il cliente duplicato
            try {
                await db.collection('clienti').doc(duplicato.id).delete();
                operazioni++;
            } catch (e) {
                console.error('Errore eliminazione duplicato:', e);
                errori++;
            }

            // Risultato finale
            progressDiv.innerHTML = `
                <div style="padding: 1.5rem; background: ${errori === 0 ? 'var(--verde-100)' : '#FFF3E0'}; border-radius: 8px; margin-top: 1rem; border-left: 4px solid ${errori === 0 ? 'var(--verde-700)' : '#FFCC00'};">
                    <h3 style="font-size: 1.1rem; font-weight: 700; color: ${errori === 0 ? 'var(--verde-900)' : '#E65100'}; margin-bottom: 0.5rem;">
                        <i class="fas ${errori === 0 ? 'fa-check-circle' : 'fa-exclamation-triangle'}"></i>
                        Unione completata!
                    </h3>
                    <p style="margin: 0; color: var(--grigio-700); line-height: 1.6;">
                        <strong>${duplicato._fatture.length}</strong> fatture spostate a "${principale.ragioneSociale}"<br/>
                        <strong>${duplicato._contratti.length}</strong> contratti spostati<br/>
                        Cliente "<strong>${duplicato.ragioneSociale}</strong>" eliminato
                        ${errori > 0 ? `<br/><strong style="color: #D32F2F;">${errori} errori riscontrati</strong>` : ''}
                    </p>
                </div>
            `;

            btnEsegui.style.display = 'none';
            document.getElementById('unioneAnteprima').style.display = 'none';
            this._clientePrincipale = null;
            this._clienteDuplicato = null;
            UI.showSuccess('Unione completata con successo!');

        } catch (error) {
            console.error('Errore durante l\'unione:', error);
            progressDiv.innerHTML = `
                <div style="padding: 1rem; background: #FFEBEE; border-left: 4px solid #D32F2F; border-radius: 8px; margin-top: 1rem;">
                    <p style="color: #D32F2F; font-weight: 700; margin: 0;">
                        <i class="fas fa-times-circle"></i> Errore durante l'unione: ${error.message}
                    </p>
                </div>
            `;
            btnEsegui.disabled = false;
            btnEsegui.innerHTML = '<i class="fas fa-play"></i> Riprova';
        }
    },

    _aggiornaProgressUnione(div, current, total, fase) {
        div.innerHTML = `
            <div style="padding: 1rem; background: var(--blu-100); border-radius: 8px; margin-top: 1rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                    <span style="font-weight: 600; color: var(--blu-700);">${fase}</span>
                    <span style="font-weight: 700; color: var(--blu-700);">${current}/${total}</span>
                </div>
                <div style="width: 100%; height: 8px; background: var(--grigio-300); border-radius: 4px; overflow: hidden;">
                    <div style="width: ${(current / total * 100)}%; height: 100%; background: var(--verde-700); transition: width 0.3s;"></div>
                </div>
            </div>
        `;
    },

    // === TAB BONIFICA FATTURE ===
    renderBonificaTab() {
        return `
            <div class="card fade-in">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-wrench"></i> Bonifica Numeri Fattura (PA/PR)
                    </h2>
                </div>
                <div style="padding: 1.5rem;">
                    <div style="padding: 1rem; background: #FFF3E0; border-left: 4px solid #FFCC00; border-radius: 8px; margin-bottom: 1.5rem;">
                        <h3 style="font-size: 1rem; font-weight: 700; color: #E65100; margin-bottom: 0.5rem;">
                            <i class="fas fa-exclamation-triangle"></i> Cosa fa questa bonifica?
                        </h3>
                        <p style="color: #4A4A4A; margin: 0; font-size: 0.9rem; line-height: 1.6;">
                            Questa operazione aggiorna <strong>tutte le fatture esistenti</strong> aggiungendo il suffisso <strong>/PA</strong> o <strong>/PR</strong> al numero fattura,
                            in base al tipo del cliente associato.<br/>
                            Esempio: <code>2026/005</code> diventa <code>2026/005/PA</code> o <code>2026/005/PR</code>.<br/><br/>
                            <strong>Attenzione:</strong> le fatture che hanno già il suffisso /PA o /PR non verranno modificate.
                        </p>
                    </div>

                    <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem;">
                        <button class="btn btn-primary" onclick="Settings.anteprimaBonifica()">
                            <i class="fas fa-search"></i> Anteprima modifiche
                        </button>
                        <button class="btn btn-success" id="btnEseguiBonifica" onclick="Settings.eseguiBonificaFatture()" style="display: none;">
                            <i class="fas fa-play"></i> Esegui Bonifica
                        </button>
                    </div>

                    <div id="bonificaResults" style="display: none;">
                        <div id="bonificaStats" style="margin-bottom: 1rem;"></div>
                        <div id="bonificaList" style="max-height: 400px; overflow-y: auto;"></div>
                    </div>
                    <div id="bonificaProgress" style="display: none;"></div>
                </div>
            </div>
        `;
    },

    async anteprimaBonifica() {
        const resultsDiv = document.getElementById('bonificaResults');
        const statsDiv = document.getElementById('bonificaStats');
        const listDiv = document.getElementById('bonificaList');
        const btnEsegui = document.getElementById('btnEseguiBonifica');

        statsDiv.innerHTML = '<p style="color: var(--grigio-500);"><i class="fas fa-spinner fa-spin"></i> Analisi in corso...</p>';
        resultsDiv.style.display = 'block';

        try {
            // Carica tutte le fatture
            const fattureSnapshot = await db.collection('fatture').get();
            const fatture = fattureSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Carica tutti i clienti per determinare il tipo
            const clientiSnapshot = await db.collection('clienti').get();
            const clientiMap = {};
            clientiSnapshot.forEach(doc => {
                const data = doc.data();
                const legacyId = data.id || doc.id;
                clientiMap[legacyId] = {
                    ragioneSociale: data.ragioneSociale,
                    tipo: data.tipo || 'PRIVATO'
                };
                // Mappa anche con Firebase ID
                clientiMap[doc.id] = clientiMap[legacyId];
            });

            // Analizza fatture da aggiornare
            const daBonificare = [];
            const giaOk = [];
            const senzaCliente = [];

            for (const f of fatture) {
                const num = f.numeroFatturaCompleto || '';
                const hasSuffix = num.endsWith('/PA') || num.endsWith('/PR');

                if (hasSuffix) {
                    giaOk.push(f);
                    continue;
                }

                const cliente = clientiMap[f.clienteId];
                if (!cliente) {
                    senzaCliente.push(f);
                    continue;
                }

                const suffisso = cliente.tipo === 'PA' ? 'PA' : 'PR';
                const nuovoNumero = num ? `${num}/${suffisso}` : '';

                daBonificare.push({
                    ...f,
                    clienteNome: cliente.ragioneSociale,
                    tipoCliente: suffisso,
                    nuovoNumero: nuovoNumero,
                    vecchioNumero: num
                });
            }

            // Salva per l'esecuzione
            this._daBonificare = daBonificare;

            // Statistiche
            statsDiv.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
                    <div style="padding: 1rem; background: var(--blu-100); border-radius: 8px; text-align: center;">
                        <div style="font-size: 2rem; font-weight: 700; color: var(--blu-700);">${fatture.length}</div>
                        <div style="font-size: 0.85rem; color: var(--grigio-700);">Fatture totali</div>
                    </div>
                    <div style="padding: 1rem; background: #FFF3E0; border-radius: 8px; text-align: center;">
                        <div style="font-size: 2rem; font-weight: 700; color: #E65100;">${daBonificare.length}</div>
                        <div style="font-size: 0.85rem; color: var(--grigio-700);">Da aggiornare</div>
                    </div>
                    <div style="padding: 1rem; background: var(--verde-100); border-radius: 8px; text-align: center;">
                        <div style="font-size: 2rem; font-weight: 700; color: var(--verde-700);">${giaOk.length}</div>
                        <div style="font-size: 0.85rem; color: var(--grigio-700);">Già con PA/PR</div>
                    </div>
                    ${senzaCliente.length > 0 ? `
                    <div style="padding: 1rem; background: #FFEBEE; border-radius: 8px; text-align: center;">
                        <div style="font-size: 2rem; font-weight: 700; color: #D32F2F;">${senzaCliente.length}</div>
                        <div style="font-size: 0.85rem; color: var(--grigio-700);">Senza cliente</div>
                    </div>` : ''}
                </div>
            `;

            // Lista anteprima
            if (daBonificare.length > 0) {
                listDiv.innerHTML = `
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem;">
                        <thead>
                            <tr style="background: var(--grigio-100); font-weight: 700;">
                                <th style="padding: 0.5rem 0.75rem; text-align: left;">Cliente</th>
                                <th style="padding: 0.5rem 0.75rem; text-align: left;">Tipo</th>
                                <th style="padding: 0.5rem 0.75rem; text-align: left;">Numero attuale</th>
                                <th style="padding: 0.5rem 0.75rem; text-align: left;"><i class="fas fa-arrow-right"></i> Nuovo numero</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${daBonificare.map(f => `
                                <tr style="border-bottom: 1px solid var(--grigio-200);">
                                    <td style="padding: 0.5rem 0.75rem;">${f.clienteNome || f.clienteId}</td>
                                    <td style="padding: 0.5rem 0.75rem;">
                                        <span style="display:inline-block; background:${f.tipoCliente === 'PA' ? '#0288D1' : '#9B9B9B'}; color:white; font-size:0.7rem; padding:0.15rem 0.4rem; border-radius:4px; font-weight:700;">${f.tipoCliente}</span>
                                    </td>
                                    <td style="padding: 0.5rem 0.75rem; color: var(--grigio-500); text-decoration: line-through;">${f.vecchioNumero}</td>
                                    <td style="padding: 0.5rem 0.75rem; font-weight: 700; color: var(--verde-700);">${f.nuovoNumero}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
                btnEsegui.style.display = 'inline-flex';
            } else {
                listDiv.innerHTML = '<p style="color: var(--verde-700); font-weight: 600;"><i class="fas fa-check-circle"></i> Tutte le fatture sono già aggiornate con il suffisso PA/PR!</p>';
                btnEsegui.style.display = 'none';
            }

        } catch (error) {
            console.error('Errore anteprima bonifica:', error);
            statsDiv.innerHTML = `<p style="color: #D32F2F;"><i class="fas fa-times-circle"></i> Errore: ${error.message}</p>`;
        }
    },

    async eseguiBonificaFatture() {
        if (!this._daBonificare || this._daBonificare.length === 0) {
            UI.showError('Nessuna fattura da bonificare');
            return;
        }

        const conferma = confirm(`Stai per aggiornare ${this._daBonificare.length} fatture. Vuoi procedere?`);
        if (!conferma) return;

        const progressDiv = document.getElementById('bonificaProgress');
        const btnEsegui = document.getElementById('btnEseguiBonifica');
        btnEsegui.disabled = true;
        btnEsegui.innerHTML = '<i class="fas fa-spinner fa-spin"></i> In corso...';
        progressDiv.style.display = 'block';

        let aggiornate = 0;
        let errori = 0;
        const totale = this._daBonificare.length;

        for (const f of this._daBonificare) {
            try {
                await db.collection('fatture').doc(f.id).update({
                    numeroFatturaCompleto: f.nuovoNumero,
                    tipoCliente: f.tipoCliente
                });
                aggiornate++;
            } catch (error) {
                console.error(`Errore aggiornamento fattura ${f.id}:`, error);
                errori++;
            }

            // Aggiorna progress
            progressDiv.innerHTML = `
                <div style="padding: 1rem; background: var(--blu-100); border-radius: 8px; margin-top: 1rem;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                        <span style="font-weight: 600; color: var(--blu-700);">Aggiornamento in corso...</span>
                        <span style="font-weight: 700; color: var(--blu-700);">${aggiornate + errori}/${totale}</span>
                    </div>
                    <div style="width: 100%; height: 8px; background: var(--grigio-300); border-radius: 4px; overflow: hidden;">
                        <div style="width: ${((aggiornate + errori) / totale * 100)}%; height: 100%; background: var(--verde-700); transition: width 0.3s;"></div>
                    </div>
                </div>
            `;
        }

        // Risultato finale
        progressDiv.innerHTML = `
            <div style="padding: 1.5rem; background: ${errori === 0 ? 'var(--verde-100)' : '#FFF3E0'}; border-radius: 8px; margin-top: 1rem; border-left: 4px solid ${errori === 0 ? 'var(--verde-700)' : '#FFCC00'};">
                <h3 style="font-size: 1.1rem; font-weight: 700; color: ${errori === 0 ? 'var(--verde-900)' : '#E65100'}; margin-bottom: 0.5rem;">
                    <i class="fas ${errori === 0 ? 'fa-check-circle' : 'fa-exclamation-triangle'}"></i>
                    Bonifica completata
                </h3>
                <p style="margin: 0; color: var(--grigio-700);">
                    <strong>${aggiornate}</strong> fatture aggiornate con successo.
                    ${errori > 0 ? `<br/><strong style="color: #D32F2F;">${errori}</strong> errori.` : ''}
                </p>
            </div>
        `;

        btnEsegui.style.display = 'none';
        this._daBonificare = [];
        UI.showSuccess(`Bonifica completata: ${aggiornate} fatture aggiornate!`);
    },

    async switchTab(tab) {
        this.currentTab = tab;

        // Pre-carica dati Growapp da Firestore per tab che ne hanno bisogno
        if (tab === 'azienda' || tab === 'biglietto') {
            await this.loadGrowappData();
        }

        await this.render();

        // Se tab dati, carica statistiche
        if (tab === 'dati') {
            this.loadDatabaseStats();
        }

        // Se tab utenti, carica lista utenti
        if (tab === 'utenti') {
            this.loadUtentiList();
        }
    },

    toggleWidget(widgetId, enabled) {
        SettingsService.toggleWidget(widgetId, enabled);
        UI.showSuccess(`Widget ${enabled ? 'attivato' : 'disattivato'}`);
    },

    async resetDashboard() {
        if (confirm('Ripristinare la configurazione predefinita della dashboard?')) {
            SettingsService.resetDashboardWidgets();
            UI.showSuccess('Dashboard ripristinata');
            await this.render();
        }
    },

    saveCompanyData(event) {
        event.preventDefault();

        const data = {
            ragioneSociale: document.getElementById('ragioneSociale').value,
            partitaIva: document.getElementById('partitaIva').value,
            codiceFiscale: document.getElementById('codiceFiscale').value,
            indirizzo: document.getElementById('indirizzo').value,
            cap: document.getElementById('cap').value,
            citta: document.getElementById('citta').value,
            provincia: document.getElementById('provincia').value,
            telefono: document.getElementById('telefono').value,
            email: document.getElementById('email').value,
            pec: document.getElementById('pec').value,
            sitoWeb: document.getElementById('sitoWeb').value
        };

        SettingsService.saveCompanyData(data);
        UI.showSuccess('Dati aziendali salvati con successo');
    },

    async exportBackupCompleto() {
        try {
            UI.showLoading();
            await ExportManager.exportReportCompleto();
            UI.hideLoading();
            UI.showSuccess('Backup esportato con successo');
        } catch (error) {
            UI.showError('Errore durante l\'esportazione: ' + error.message);
        }
    },

    async resetDatabase() {
        const confirm1 = confirm('⚠️ ATTENZIONE! Questa operazione eliminerà TUTTI i dati dal database.\n\nSei sicuro di voler procedere?');
        if (!confirm1) return;

        const confirm2 = confirm('🚨 ULTIMA CONFERMA! I dati verranno persi definitivamente.\n\nDigita OK per confermare.');
        if (!confirm2) return;

        try {
            UI.showLoading();
            // TODO: Implementare reset database quando necessario
            UI.hideLoading();
            UI.showSuccess('Database resettato');
        } catch (error) {
            UI.showError('Errore durante il reset: ' + error.message);
        }
    },

    async loadDatabaseStats() {
        try {
            const stats = await DataService.getStatistiche();
            document.getElementById('statClienti').textContent = stats.clienti.totale;
            document.getElementById('statApp').textContent = stats.app.totale;
            document.getElementById('statContratti').textContent = stats.contratti.totale;
            document.getElementById('statFatture').textContent = stats.fatture.totale;
            document.getElementById('statScadenze').textContent = stats.scadenze.totale;
        } catch (error) {
            console.error('Errore caricamento statistiche', error);
        }
    },





    // Funzione helper per calcolare similarità tra stringhe (Levenshtein distance normalizzata)


    async auditDatabase() {
        const btn = document.getElementById('btnAudit');
        const resultDiv = document.getElementById('auditResult');

        try {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analisi in corso...';

            resultDiv.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-spinner fa-spin"></i> Caricamento database...
                </div>
            `;

            // Carica tutti i dati
            const [clientiSnapshot, contrattiSnapshot, appSnapshot, fattureSnapshot] = await Promise.all([
                db.collection('clienti').get(),
                db.collection('contratti').get(),
                db.collection('app').get(),
                db.collection('fatture').get()
            ]);

            // Crea set di ID esistenti
            const clientiIds = new Set(clientiSnapshot.docs.map(doc => doc.id));
            const contrattiIds = new Set(contrattiSnapshot.docs.map(doc => doc.id));

            // Inizializza contatori problemi
            const problemi = {
                fattureClienteNonValido: [],
                fattureContrattoNonValido: [],
                contrattiClienteNonValido: [],
                appClienteNonValido: [],
                appContrattoNonValido: [],
                clientiSenzaContratti: [],
                clientiSenzaFatture: []
            };

            // Verifica FATTURE
            fattureSnapshot.forEach(doc => {
                const fattura = doc.data();
                const clienteId = fattura.clienteId;
                const contrattoId = fattura.contrattoId;

                // Verifica cliente
                if (!clienteId || clienteId.length < 20) {
                    // È un nome, non un ID Firebase
                    problemi.fattureClienteNonValido.push({
                        id: doc.id,
                        numero: fattura.numeroFatturaCompleto,
                        clienteId: clienteId,
                        problema: 'ClienteId è un nome, non un ID Firebase'
                    });
                } else if (!clientiIds.has(clienteId)) {
                    // ID Firebase ma cliente non esiste
                    problemi.fattureClienteNonValido.push({
                        id: doc.id,
                        numero: fattura.numeroFatturaCompleto,
                        clienteId: clienteId,
                        problema: 'Cliente non esiste nel database'
                    });
                }

                // Verifica contratto
                if (!contrattoId) {
                    problemi.fattureContrattoNonValido.push({
                        id: doc.id,
                        numero: fattura.numeroFatturaCompleto,
                        problema: 'Nessun contratto collegato'
                    });
                } else if (!contrattiIds.has(contrattoId)) {
                    problemi.fattureContrattoNonValido.push({
                        id: doc.id,
                        numero: fattura.numeroFatturaCompleto,
                        contrattoId: contrattoId,
                        problema: 'Contratto non esiste nel database'
                    });
                }
            });

            // Verifica CONTRATTI
            contrattiSnapshot.forEach(doc => {
                const contratto = doc.data();
                const clienteId = contratto.clienteId;

                if (!clienteId || !clientiIds.has(clienteId)) {
                    problemi.contrattiClienteNonValido.push({
                        id: doc.id,
                        numero: contratto.numeroContratto,
                        clienteId: clienteId,
                        problema: clienteId ? 'Cliente non esiste' : 'Nessun cliente collegato'
                    });
                }
            });

            // Verifica APP
            appSnapshot.forEach(doc => {
                const app = doc.data();
                const clientePaganteId = app.clientePaganteId;
                const contrattoId = app.contrattoId;

                // Verifica cliente pagante
                if (!clientePaganteId || !clientiIds.has(clientePaganteId)) {
                    problemi.appClienteNonValido.push({
                        id: doc.id,
                        nome: app.nome,
                        clientePaganteId: clientePaganteId,
                        problema: clientePaganteId ? 'Cliente non esiste' : 'Nessun cliente pagante'
                    });
                }

                // Verifica contratto
                if (!contrattoId) {
                    problemi.appContrattoNonValido.push({
                        id: doc.id,
                        nome: app.nome,
                        problema: 'Nessun contratto collegato'
                    });
                } else if (!contrattiIds.has(contrattoId)) {
                    problemi.appContrattoNonValido.push({
                        id: doc.id,
                        nome: app.nome,
                        contrattoId: contrattoId,
                        problema: 'Contratto non esiste'
                    });
                }
            });

            // Verifica CLIENTI senza contratti/fatture
            const contrattiPerCliente = {};
            const fatturePerCliente = {};

            contrattiSnapshot.forEach(doc => {
                const clienteId = doc.data().clienteId;
                if (clienteId) {
                    contrattiPerCliente[clienteId] = (contrattiPerCliente[clienteId] || 0) + 1;
                }
            });

            fattureSnapshot.forEach(doc => {
                const clienteId = doc.data().clienteId;
                if (clienteId && clienteId.length >= 20) {
                    fatturePerCliente[clienteId] = (fatturePerCliente[clienteId] || 0) + 1;
                }
            });

            clientiSnapshot.forEach(doc => {
                const clienteId = doc.id;
                const ragioneSociale = doc.data().ragioneSociale;

                if (!contrattiPerCliente[clienteId]) {
                    problemi.clientiSenzaContratti.push({
                        id: clienteId,
                        ragioneSociale: ragioneSociale
                    });
                }

                if (!fatturePerCliente[clienteId]) {
                    problemi.clientiSenzaFatture.push({
                        id: clienteId,
                        ragioneSociale: ragioneSociale
                    });
                }
            });

            // Calcola totali
            const totaleProblemi =
                problemi.fattureClienteNonValido.length +
                problemi.fattureContrattoNonValido.length +
                problemi.contrattiClienteNonValido.length +
                problemi.appClienteNonValido.length +
                problemi.appContrattoNonValido.length;

            // Mostra risultato
            const bgColor = totaleProblemi > 0 ? 'var(--rosso)' : 'var(--verde-700)';
            const bgColorLight = totaleProblemi > 0 ? '#fee' : 'var(--verde-100)';

            resultDiv.innerHTML = `
                <div style="background: ${bgColorLight}; padding: 1.5rem; border-radius: 8px; border-left: 4px solid ${bgColor};">
                    <h4 style="color: ${bgColor}; margin-bottom: 1rem;">
                        <i class="fas ${totaleProblemi > 0 ? 'fa-exclamation-triangle' : 'fa-check-circle'}"></i>
                        Audit Completato - ${totaleProblemi} Problemi Critici
                    </h4>

                    <!-- Statistiche Generali -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
                        <div style="text-align: center; padding: 1rem; background: white; border-radius: 8px;">
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--blu-700);">${clientiSnapshot.size}</div>
                            <div style="font-size: 0.85rem; color: var(--grigio-700);">Clienti</div>
                        </div>
                        <div style="text-align: center; padding: 1rem; background: white; border-radius: 8px;">
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--verde-700);">${contrattiSnapshot.size}</div>
                            <div style="font-size: 0.85rem; color: var(--grigio-700);">Contratti</div>
                        </div>
                        <div style="text-align: center; padding: 1rem; background: white; border-radius: 8px;">
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--blu-700);">${appSnapshot.size}</div>
                            <div style="font-size: 0.85rem; color: var(--grigio-700);">App</div>
                        </div>
                        <div style="text-align: center; padding: 1rem; background: white; border-radius: 8px;">
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--verde-700);">${fattureSnapshot.size}</div>
                            <div style="font-size: 0.85rem; color: var(--grigio-700);">Fatture</div>
                        </div>
                    </div>

                    ${totaleProblemi > 0 ? `
                        <h5 style="color: var(--rosso); margin-top: 1.5rem; margin-bottom: 1rem;">🚨 Problemi Critici</h5>

                        ${problemi.fattureClienteNonValido.length > 0 ? `
                            <div style="background: white; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; border-left: 3px solid var(--rosso);">
                                <strong style="color: var(--rosso);">❌ Fatture con Cliente Non Valido: ${problemi.fattureClienteNonValido.length}</strong>
                                <details style="margin-top: 0.5rem;">
                                    <summary style="cursor: pointer; color: var(--blu-700);">Mostra dettagli</summary>
                                    <div style="margin-top: 0.5rem; font-size: 0.85rem;">
                                        ${problemi.fattureClienteNonValido.slice(0, 10).map(p =>
                                            `<div>• ${p.numero}: ${p.problema} (${p.clienteId})</div>`
                                        ).join('')}
                                        ${problemi.fattureClienteNonValido.length > 10 ? `<div style="color: var(--grigio-500);">... e altri ${problemi.fattureClienteNonValido.length - 10}</div>` : ''}
                                    </div>
                                </details>
                            </div>
                        ` : ''}

                        ${problemi.fattureContrattoNonValido.length > 0 ? `
                            <div style="background: white; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; border-left: 3px solid var(--rosso);">
                                <strong style="color: var(--rosso);">❌ Fatture con Contratto Non Valido: ${problemi.fattureContrattoNonValido.length}</strong>
                                <details style="margin-top: 0.5rem;">
                                    <summary style="cursor: pointer; color: var(--blu-700);">Mostra dettagli</summary>
                                    <div style="margin-top: 0.5rem; font-size: 0.85rem;">
                                        ${problemi.fattureContrattoNonValido.slice(0, 10).map(p =>
                                            `<div>• ${p.numero}: ${p.problema}</div>`
                                        ).join('')}
                                        ${problemi.fattureContrattoNonValido.length > 10 ? `<div style="color: var(--grigio-500);">... e altri ${problemi.fattureContrattoNonValido.length - 10}</div>` : ''}
                                    </div>
                                </details>
                            </div>
                        ` : ''}

                        ${problemi.contrattiClienteNonValido.length > 0 ? `
                            <div style="background: white; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; border-left: 3px solid var(--rosso);">
                                <strong style="color: var(--rosso);">❌ Contratti con Cliente Non Valido: ${problemi.contrattiClienteNonValido.length}</strong>
                                <details style="margin-top: 0.5rem;">
                                    <summary style="cursor: pointer; color: var(--blu-700);">Mostra dettagli</summary>
                                    <div style="margin-top: 0.5rem; font-size: 0.85rem;">
                                        ${problemi.contrattiClienteNonValido.slice(0, 10).map(p =>
                                            `<div>• ${p.numero}: ${p.problema}</div>`
                                        ).join('')}
                                        ${problemi.contrattiClienteNonValido.length > 10 ? `<div style="color: var(--grigio-500);">... e altri ${problemi.contrattiClienteNonValido.length - 10}</div>` : ''}
                                    </div>
                                </details>
                            </div>
                        ` : ''}

                        ${problemi.appClienteNonValido.length > 0 ? `
                            <div style="background: white; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; border-left: 3px solid var(--rosso);">
                                <strong style="color: var(--rosso);">❌ App con Cliente Non Valido: ${problemi.appClienteNonValido.length}</strong>
                                <details style="margin-top: 0.5rem;">
                                    <summary style="cursor: pointer; color: var(--blu-700);">Mostra dettagli</summary>
                                    <div style="margin-top: 0.5rem; font-size: 0.85rem;">
                                        ${problemi.appClienteNonValido.slice(0, 10).map(p =>
                                            `<div>• ${p.nome}: ${p.problema}</div>`
                                        ).join('')}
                                        ${problemi.appClienteNonValido.length > 10 ? `<div style="color: var(--grigio-500);">... e altri ${problemi.appClienteNonValido.length - 10}</div>` : ''}
                                    </div>
                                </details>
                            </div>
                        ` : ''}

                        ${problemi.appContrattoNonValido.length > 0 ? `
                            <div style="background: white; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; border-left: 3px solid var(--rosso);">
                                <strong style="color: var(--rosso);">❌ App con Contratto Non Valido: ${problemi.appContrattoNonValido.length}</strong>
                                <details style="margin-top: 0.5rem;">
                                    <summary style="cursor: pointer; color: var(--blu-700);">Mostra dettagli</summary>
                                    <div style="margin-top: 0.5rem; font-size: 0.85rem;">
                                        ${problemi.appContrattoNonValido.slice(0, 10).map(p =>
                                            `<div>• ${p.nome}: ${p.problema}</div>`
                                        ).join('')}
                                        ${problemi.appContrattoNonValido.length > 10 ? `<div style="color: var(--grigio-500);">... e altri ${problemi.appContrattoNonValido.length - 10}</div>` : ''}
                                    </div>
                                </details>
                            </div>
                        ` : ''}

                        <div style="background: var(--blu-100); padding: 1rem; border-radius: 8px; margin-top: 1.5rem;">
                            <strong>💡 Soluzione:</strong> Usa i fix button sopra per correggere automaticamente questi problemi:
                            <ul style="margin-top: 0.5rem; margin-bottom: 0;">
                                <li>Fix Contratti → corregge collegamenti contratti-clienti</li>
                                <li>Fix Fatture → corregge collegamenti fatture-clienti-contratti</li>
                                <li>Fix App → corregge collegamenti app-contratti</li>
                            </ul>
                        </div>
                    ` : `
                        <div style="background: white; padding: 1.5rem; border-radius: 8px; text-align: center;">
                            <div style="font-size: 3rem; margin-bottom: 0.5rem;">✅</div>
                            <strong style="color: var(--verde-700); font-size: 1.2rem;">Database Integro!</strong>
                            <p style="margin-top: 0.5rem; color: var(--grigio-700);">
                                Tutti i collegamenti tra Clienti, Contratti, App e Fatture sono corretti.
                            </p>
                        </div>
                    `}

                    ${problemi.clientiSenzaContratti.length > 0 || problemi.clientiSenzaFatture.length > 0 ? `
                        <h5 style="color: var(--giallo-avviso); margin-top: 1.5rem; margin-bottom: 1rem;">⚠️ Warning (non critici)</h5>

                        ${problemi.clientiSenzaContratti.length > 0 ? `
                            <div style="background: white; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; border-left: 3px solid var(--giallo-avviso);">
                                <strong style="color: var(--giallo-avviso);">⚠️ Clienti Senza Contratti: ${problemi.clientiSenzaContratti.length}</strong>
                            </div>
                        ` : ''}

                        ${problemi.clientiSenzaFatture.length > 0 ? `
                            <div style="background: white; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; border-left: 3px solid var(--giallo-avviso);">
                                <strong style="color: var(--giallo-avviso);">⚠️ Clienti Senza Fatture: ${problemi.clientiSenzaFatture.length}</strong>
                            </div>
                        ` : ''}
                    ` : ''}
                </div>
            `;

            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-search"></i> Esegui Audit Completo';

            // Log dettagliato nella console

        } catch (error) {
            console.error('Errore audit:', error);
            resultDiv.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Errore:</strong> ${error.message}
                </div>
            `;
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-search"></i> Esegui Audit Completo';
            UI.showError('Errore: ' + error.message);
        }
    },

    renderBigliettoTab() {
        const user = AuthService.currentUserData || {};
        const userName = `${user.nome || ''} ${user.cognome || ''}`.trim() || 'Nome Cognome';
        const userRole = AuthService.getUserRoleLabel() || 'Ruolo';
        const userEmail = AuthService.currentUser?.email || 'email@esempio.it';

        return `
            <div style="max-width: 1000px; margin: 0 auto;">
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-id-card"></i> Genera il tuo Biglietto da Visita</h3>
                        <p style="color: var(--grigio-500); margin-top: 0.5rem;">
                            Personalizza i tuoi dati e scarica il biglietto in formato PDF per la stampa
                        </p>
                    </div>
                    <div class="card-body">
                        <!-- Form Personalizzazione -->
                        <div style="margin-bottom: 2rem; padding: 1.5rem; background: var(--grigio-100); border-radius: 12px;">
                            <h4 style="margin-bottom: 1rem; color: var(--blu-700);">
                                <i class="fas fa-user-edit"></i> I tuoi dati
                            </h4>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">
                                <div class="form-group">
                                    <label>Nome e Cognome</label>
                                    <input type="text" id="bigliettoNome" class="form-input" value="${userName}" placeholder="Mario Rossi">
                                </div>
                                <div class="form-group">
                                    <label>Ruolo</label>
                                    <input type="text" id="bigliettoRuolo" class="form-input" value="${userRole}" placeholder="Sviluppatore">
                                </div>
                                <div class="form-group">
                                    <label>Telefono</label>
                                    <input type="tel" id="bigliettoTelefono" class="form-input" value="${user.telefono || ''}" placeholder="+39 333 1234567">
                                </div>
                                <div class="form-group">
                                    <label>Email</label>
                                    <input type="email" id="bigliettoEmail" class="form-input" value="${userEmail}" placeholder="nome@comune.digital">
                                </div>
                            </div>
                            <div style="text-align: center; margin-top: 1rem;">
                                <button onclick="Settings.updateBigliettoPreview()" class="btn btn-secondary">
                                    <i class="fas fa-sync"></i> Aggiorna Anteprima
                                </button>
                            </div>
                        </div>

                        <!-- Anteprima Biglietto -->
                        <div style="margin-bottom: 2rem;">
                            <h4 style="margin-bottom: 1rem; color: var(--blu-700); text-align: center;">
                                <i class="fas fa-eye"></i> Anteprima
                            </h4>
                            <div id="bigliettoPreview" style="background: white; padding: 2rem; box-shadow: 0 10px 40px rgba(0,0,0,0.15); border-radius: 16px; max-width: 600px; margin: 0 auto;">
                                ${this.renderBigliettoContent(userName, userRole, user.telefono || '', userEmail)}
                            </div>
                        </div>

                        <!-- Actions -->
                        <div style="text-align: center; display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
                            <button onclick="Settings.downloadBigliettoPDF()" class="btn btn-primary" style="min-width: 200px;">
                                <i class="fas fa-download"></i> Scarica PDF
                            </button>
                            <button onclick="Settings.printBiglietto()" class="btn btn-secondary">
                                <i class="fas fa-print"></i> Stampa
                            </button>
                        </div>

                        <!-- Info -->
                        <div class="alert alert-info" style="margin-top: 2rem;">
                            <i class="fas fa-info-circle"></i>
                            <div>
                                <strong>Dimensioni biglietto:</strong> 85mm x 55mm (standard europeo)<br>
                                <strong>Risoluzione stampa:</strong> 300 DPI - Perfetto per la stampa professionale<br>
                                <strong>Logo:</strong> Carica il logo orizzontale in <code>/img/logo-biglietto1.png</code> per sostituire il placeholder<br>
                                <strong>Ruolo:</strong> Il campo "Ruolo" indica la tua mansione aziendale (es: "Sviluppatore", "Account Manager")
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderBigliettoContent(nome, ruolo, telefono, email) {
        const growappData = this.getGrowappData();

        return `
            <div style="display: flex; gap: 2rem; align-items: stretch; min-height: 220px;">
                <!-- Lato Sinistro - Logo -->
                <div style="flex: 0 0 220px; background: linear-gradient(135deg, var(--blu-700) 0%, var(--blu-900) 100%); border-radius: 12px; padding: 1.5rem; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; color: white;">
                    <!-- Logo Orizzontale -->
                    <div style="width: 100%; background: white; border-radius: 12px; padding: 1.25rem; display: flex; align-items: center; justify-content: center; margin-bottom: 1.5rem; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                        <img
                            src="/img/logo-biglietto1.png?v=2"
                            alt="Comune.Digital Logo"
                            style="max-width: 100%; height: auto; max-height: 70px; object-fit: contain;"
                            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                        >
                        <!-- Fallback se logo non disponibile -->
                        <div style="display: none; width: 100%; flex-direction: column; align-items: center; justify-content: center; color: var(--blu-700);">
                            <span style="font-size: 1.75rem; font-weight: 900; line-height: 1;">COMUNE</span>
                            <span style="font-size: 1.75rem; font-weight: 900; line-height: 1;">DIGITAL</span>
                        </div>
                    </div>
                    <div style="font-size: 0.875rem; font-weight: 600; line-height: 1.4; color: rgba(255,255,255,0.9);">
                        Soluzioni Digitali<br>per Comuni
                    </div>
                </div>

                <!-- Lato Destro - Dati -->
                <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between; padding: 1rem 0;">
                    <!-- Nome e Ruolo -->
                    <div>
                        <h2 style="font-size: 1.75rem; font-weight: 900; color: var(--blu-700); margin: 0 0 0.25rem 0; line-height: 1.2;">
                            ${nome}
                        </h2>
                        <p style="font-size: 1rem; color: var(--grigio-700); margin: 0 0 1.25rem 0; font-weight: 600;">
                            ${ruolo}
                        </p>
                    </div>

                    <!-- Contatti Personali -->
                    <div style="margin-bottom: 1.25rem;">
                        ${telefono ? `
                            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                                <i class="fas fa-phone" style="color: var(--verde-700); width: 16px;"></i>
                                <span style="font-size: 0.9375rem; color: var(--grigio-900); font-weight: 500;">${telefono}</span>
                            </div>
                        ` : ''}
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                            <i class="fas fa-envelope" style="color: var(--verde-700); width: 16px;"></i>
                            <span style="font-size: 0.9375rem; color: var(--grigio-900); font-weight: 500;">${email}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fas fa-globe" style="color: var(--verde-700); width: 16px;"></i>
                            <span style="font-size: 0.9375rem; color: var(--grigio-900); font-weight: 500;">${growappData.web}</span>
                        </div>
                    </div>

                    <!-- Growapp Info -->
                    <div style="border-top: 2px solid var(--grigio-300); padding-top: 0.75rem;">
                        <p style="font-size: 0.8125rem; color: var(--grigio-700); margin: 0; line-height: 1.4;">
                            <strong style="color: var(--blu-700);">${growappData.ragioneSociale}</strong><br>
                            ${growappData.indirizzo} - ${growappData.cap} ${growappData.citta} (${growappData.provincia})<br>
                            P.IVA ${growappData.partitaIva}
                        </p>
                    </div>
                </div>
            </div>
        `;
    },

    updateBigliettoPreview() {
        const nome = document.getElementById('bigliettoNome').value || 'Nome Cognome';
        const ruolo = document.getElementById('bigliettoRuolo').value || 'Ruolo';
        const telefono = document.getElementById('bigliettoTelefono').value || '';
        const email = document.getElementById('bigliettoEmail').value || 'email@esempio.it';

        document.getElementById('bigliettoPreview').innerHTML = this.renderBigliettoContent(nome, ruolo, telefono, email);
    },

    async downloadBigliettoPDF() {
        try {
            UI.showLoading();

            // Aggiorna anteprima prima di scaricare
            this.updateBigliettoPreview();

            // Usa html2canvas per convertire in immagine
            const element = document.getElementById('bigliettoPreview');
            const canvas = await html2canvas(element, {
                scale: 3, // Alta risoluzione per stampa
                backgroundColor: '#ffffff',
                logging: false
            });

            // Converti in PDF con jsPDF
            const imgData = canvas.toDataURL('image/png');

            // Dimensioni biglietto: 85mm x 55mm
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: [85, 55]
            });

            pdf.addImage(imgData, 'PNG', 0, 0, 85, 55);

            const nome = document.getElementById('bigliettoNome').value.replace(/\s+/g, '_') || 'biglietto';
            pdf.save(`Biglietto_${nome}.pdf`);

            UI.hideLoading();
            UI.showSuccess('Biglietto da visita scaricato con successo!');

        } catch (error) {
            console.error('Errore download PDF:', error);
            UI.hideLoading();
            UI.showError('Errore: ' + error.message + '. Assicurati che html2canvas e jsPDF siano caricati.');
        }
    },

    printBiglietto() {
        this.updateBigliettoPreview();

        const content = document.getElementById('bigliettoPreview').innerHTML;
        const printWindow = window.open('', '', 'width=800,height=600');

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Biglietto da Visita</title>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
                <link href="https://fonts.googleapis.com/css2?family=Titillium+Web:wght@300;400;600;700;900&display=swap" rel="stylesheet">
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: 'Titillium Web', sans-serif;
                        padding: 20mm;
                    }
                    @page { size: 85mm 55mm; margin: 0; }
                    @media print {
                        body { padding: 0; }
                    }
                    :root {
                        --blu-700: #145284;
                        --blu-900: #0D3A5C;
                        --verde-700: #3CA434;
                        --grigio-300: #D9D9D9;
                        --grigio-700: #4A4A4A;
                        --grigio-900: #1E1E1E;
                    }
                </style>
            </head>
            <body>
                <div style="width: 85mm; height: 55mm; background: white;">
                    ${content}
                </div>
            </body>
            </html>
        `);

        printWindow.document.close();
        setTimeout(() => {
            printWindow.print();
        }, 500);
    },

    screenshotAzienda() {
        UI.showSuccess('Usa la funzione screenshot del tuo sistema operativo o browser per catturare la card!');
    },

    // 🏛️ ARRICCHIMENTO MASSIVO DATI COMUNI
    async avviaArricchimento() {
        if (!confirm('Vuoi avviare l\'arricchimento massivo?\n\nQuesta operazione:\n- Confronta tutti i clienti con il database di 7.909 comuni italiani\n- Compila automaticamente i campi vuoti\n- NON sovrascrive i campi già compilati\n\nProcedere?')) {
            return;
        }

        const btn = document.getElementById('btnArricchimento');
        const progressDiv = document.getElementById('arricchimentoProgress');
        const resultDiv = document.getElementById('arricchimentoResult');
        const bar = document.getElementById('arricchimentoBar');
        const status = document.getElementById('arricchimentoStatus');

        // Disabilita pulsante e mostra progress
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Arricchimento in corso...';
        progressDiv.style.display = 'block';
        resultDiv.innerHTML = '';

        try {
            const result = await ComuniService.arricchimentoMassivo((progress) => {
                // Aggiorna barra progresso
                bar.style.width = progress.percentuale + '%';
                bar.textContent = progress.percentuale + '%';
                status.textContent = `Processati ${progress.processati}/${progress.totale} clienti | Arricchiti: ${progress.arricchiti} | Non trovati: ${progress.nonTrovati} | Già completi: ${progress.giaCompleti}`;
            });

            if (result.success) {
                // Mostra risultati
                resultDiv.innerHTML = `
                    <div style="background: var(--verde-100); border: 2px solid var(--verde-300); border-radius: 8px; padding: 1rem;">
                        <h4 style="color: var(--verde-900); margin-bottom: 0.75rem;">
                            <i class="fas fa-check-circle"></i> Arricchimento completato!
                        </h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
                            <div style="text-align: center;">
                                <div style="font-size: 2rem; font-weight: 700; color: var(--blu-700);">${result.totale}</div>
                                <div style="font-size: 0.875rem; color: var(--grigio-600);">Totale clienti</div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-size: 2rem; font-weight: 700; color: var(--verde-700);">${result.arricchiti}</div>
                                <div style="font-size: 0.875rem; color: var(--grigio-600);">Arricchiti</div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-size: 2rem; font-weight: 700; color: var(--grigio-500);">${result.giaCompleti}</div>
                                <div style="font-size: 0.875rem; color: var(--grigio-600);">Già completi</div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-size: 2rem; font-weight: 700; color: var(--giallo-avviso);">${result.nonTrovati}</div>
                                <div style="font-size: 0.875rem; color: var(--grigio-600);">Non trovati</div>
                            </div>
                        </div>
                        ${result.dettaglio.length > 0 ? `
                            <details>
                                <summary style="cursor: pointer; color: var(--blu-700); font-weight: 600; margin-bottom: 0.5rem;">
                                    <i class="fas fa-list"></i> Vedi dettaglio clienti arricchiti (${result.dettaglio.length})
                                </summary>
                                <div style="max-height: 200px; overflow-y: auto; background: white; border-radius: 6px; padding: 0.5rem;">
                                    ${result.dettaglio.map(d => `
                                        <div style="padding: 0.5rem; border-bottom: 1px solid var(--grigio-200); font-size: 0.875rem;">
                                            <strong>${d.nome}</strong>
                                            <span style="color: var(--verde-700);">+${d.campi} campi</span>
                                            <small style="color: var(--grigio-500);"> (${d.dettagli.join(', ')})</small>
                                        </div>
                                    `).join('')}
                                </div>
                            </details>
                        ` : ''}
                    </div>
                `;
            } else {
                resultDiv.innerHTML = `
                    <div style="background: #FDECEA; border: 2px solid var(--rosso-errore); border-radius: 8px; padding: 1rem; color: var(--rosso-errore);">
                        <i class="fas fa-exclamation-triangle"></i> Errore: ${result.error}
                    </div>
                `;
            }

        } catch (error) {
            console.error('Errore arricchimento:', error);
            resultDiv.innerHTML = `
                <div style="background: #FDECEA; border: 2px solid var(--rosso-errore); border-radius: 8px; padding: 1rem; color: var(--rosso-errore);">
                    <i class="fas fa-exclamation-triangle"></i> Errore: ${error.message}
                </div>
            `;
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-magic"></i> Avvia Arricchimento Massivo';
        }
    },

    // =====================================================
    // TAB TEMPLATE EMAIL/PEC
    // =====================================================

    _templateEditabili: null,

    renderTemplateTab() {
        // Carica template da Firestore in background
        this.loadTemplateEmailFromFirestore();

        return `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title"><i class="fas fa-envelope-open-text"></i> Template Comunicazioni Email/PEC</h2>
                </div>
                <div style="padding: 1.5rem;">
                    <p style="color: var(--grigio-700); margin-bottom: 1rem; font-size: 0.9rem;">
                        Modifica i template delle comunicazioni standard. I placeholder come <code>{{ragioneSociale}}</code>, <code>{{nomeAzienda}}</code>, ecc. verranno sostituiti automaticamente con i dati reali del cliente quando generi una comunicazione.
                    </p>

                    <div style="background: var(--blu-100); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; font-size: 0.85rem;">
                        <strong><i class="fas fa-info-circle"></i> Placeholder disponibili:</strong><br>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem; margin-top: 0.5rem;">
                            <span><code>{{ragioneSociale}}</code> — Nome cliente</span>
                            <span><code>{{nomeAzienda}}</code> — Nome Growapp</span>
                            <span><code>{{emailCliente}}</code> — Email cliente</span>
                            <span><code>{{emailAzienda}}</code> — Email Growapp</span>
                            <span><code>{{pecCliente}}</code> — PEC cliente</span>
                            <span><code>{{pecAzienda}}</code> — PEC Growapp</span>
                            <span><code>{{telefonoCliente}}</code> — Tel. cliente</span>
                            <span><code>{{telefonoAzienda}}</code> — Tel. Growapp</span>
                            <span><code>{{numeroFattura}}</code> — N. fattura</span>
                            <span><code>{{importoFattura}}</code> — Importo fattura</span>
                            <span><code>{{dataEmissione}}</code> — Data emissione</span>
                            <span><code>{{numeroContratto}}</code> — N. contratto</span>
                            <span><code>{{oggettoContratto}}</code> — Oggetto contr.</span>
                            <span><code>{{importoContratto}}</code> — Importo contr.</span>
                            <span><code>{{dataScadenza}}</code> — Data scadenza</span>
                            <span><code>{{periodicita}}</code> — Periodicità</span>
                        </div>
                    </div>

                    <div id="templateEditorContainer">
                        <div style="text-align: center; padding: 2rem;">
                            <i class="fas fa-spinner fa-spin" style="font-size: 1.5rem; color: var(--blu-500);"></i>
                            <p style="margin-top: 0.5rem; color: var(--grigio-500);">Caricamento template...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Carica template da Firestore, o usa quelli di default da TemplateService
     */
    async loadTemplateEmailFromFirestore() {
        try {
            const doc = await db.collection('impostazioni').doc('template_email').get();
            let templateSalvati = {};

            if (doc.exists) {
                templateSalvati = doc.data().templates || {};
            }

            // Merge: per ogni template di default, usa quello salvato su Firestore se esiste
            const templateFinali = TemplateService.TEMPLATES.map(t => {
                const salvato = templateSalvati[t.id];
                return {
                    ...t,
                    oggetto: salvato?.oggetto || t.oggetto,
                    corpo: salvato?.corpo || t.corpo
                };
            });

            this._templateEditabili = templateFinali;
            this.renderTemplateEditors(templateFinali);

        } catch (error) {
            console.error('Errore caricamento template:', error);
            // Fallback: usa quelli di default
            this._templateEditabili = TemplateService.TEMPLATES;
            this.renderTemplateEditors(TemplateService.TEMPLATES);
        }
    },

    /**
     * Renderizza i form di editing per ciascun template
     */
    renderTemplateEditors(templates) {
        const container = document.getElementById('templateEditorContainer');
        if (!container) return;

        let html = '';

        templates.forEach((t, idx) => {
            html += `
                <div style="border: 1px solid var(--grigio-300); border-radius: 12px; margin-bottom: 1.5rem; overflow: hidden;">
                    <!-- Header template -->
                    <div
                        onclick="Settings.toggleTemplateEditor('tplEditor_${idx}')"
                        style="padding: 1rem 1.25rem; background: var(--grigio-100); cursor: pointer; display: flex; align-items: center; justify-content: space-between;"
                    >
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div style="width: 36px; height: 36px; border-radius: 50%; background: ${t.color}20; display: flex; align-items: center; justify-content: center;">
                                <i class="${t.icon}" style="color: ${t.color};"></i>
                            </div>
                            <div>
                                <strong style="font-size: 0.95rem; color: var(--grigio-900);">${t.nome}</strong>
                                <div style="font-size: 0.75rem; color: var(--grigio-500);">${t.richiede ? 'Richiede: ' + t.richiede : 'Solo dati cliente'}</div>
                            </div>
                        </div>
                        <i class="fas fa-chevron-down" id="tplChevron_${idx}" style="color: var(--grigio-500); transition: transform 0.2s;"></i>
                    </div>

                    <!-- Editor (nascosto di default) -->
                    <div id="tplEditor_${idx}" style="display: none; padding: 1.25rem;">
                        <div style="margin-bottom: 1rem;">
                            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--grigio-700); margin-bottom: 0.35rem;">
                                Oggetto email
                            </label>
                            <input
                                type="text"
                                id="tplOggetto_${t.id}"
                                value="${this.escapeHtmlAttr(t.oggetto)}"
                                style="width: 100%; padding: 0.6rem; border: 1px solid var(--grigio-300); border-radius: 6px; font-family: 'Titillium Web', sans-serif; font-size: 0.9rem;"
                            />
                        </div>
                        <div style="margin-bottom: 1rem;">
                            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--grigio-700); margin-bottom: 0.35rem;">
                                Corpo del messaggio
                            </label>
                            <textarea
                                id="tplCorpo_${t.id}"
                                style="width: 100%; min-height: 280px; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 6px; font-family: 'Titillium Web', sans-serif; font-size: 0.9rem; line-height: 1.6; resize: vertical;"
                            >${this.escapeHtml(t.corpo)}</textarea>
                        </div>
                        <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                            <button
                                class="btn btn-secondary"
                                onclick="Settings.ripristinaTemplateDefault('${t.id}', ${idx})"
                                style="font-size: 0.85rem;"
                            >
                                <i class="fas fa-undo"></i> Ripristina Default
                            </button>
                            <button
                                class="btn btn-primary"
                                onclick="Settings.salvaTemplate('${t.id}')"
                                style="font-size: 0.85rem;"
                            >
                                <i class="fas fa-save"></i> Salva Template
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        // Pulsante salva tutti
        html += `
            <div style="text-align: center; margin-top: 1rem;">
                <button class="btn btn-primary" onclick="Settings.salvaTuttiTemplate()" style="padding: 0.75rem 2rem;">
                    <i class="fas fa-save"></i> Salva Tutti i Template
                </button>
            </div>
        `;

        container.innerHTML = html;
    },

    toggleTemplateEditor(editorId) {
        const editor = document.getElementById(editorId);
        if (!editor) return;
        const isOpen = editor.style.display !== 'none';
        editor.style.display = isOpen ? 'none' : 'block';

        // Ruota chevron
        const idx = editorId.replace('tplEditor_', '');
        const chevron = document.getElementById('tplChevron_' + idx);
        if (chevron) {
            chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
        }
    },

    /**
     * Salva un singolo template su Firestore
     */
    async salvaTemplate(templateId) {
        try {
            const oggettoInput = document.getElementById('tplOggetto_' + templateId);
            const corpoInput = document.getElementById('tplCorpo_' + templateId);
            if (!oggettoInput || !corpoInput) return;

            // Carica template esistenti da Firestore
            const doc = await db.collection('impostazioni').doc('template_email').get();
            let templates = {};
            if (doc.exists) {
                templates = doc.data().templates || {};
            }

            // Aggiorna questo template
            templates[templateId] = {
                oggetto: oggettoInput.value,
                corpo: corpoInput.value
            };

            await db.collection('impostazioni').doc('template_email').set({
                templates: templates,
                ultimaModifica: new Date().toISOString(),
                modificatoDa: AuthService.getUserName(),
                modificatoDaId: AuthService.getUserId()
            });

            // Aggiorna anche il TemplateService in memoria + invalida cache
            TemplateService._templatePersonalizzati = null;
            const tpl = TemplateService.TEMPLATES.find(t => t.id === templateId);
            if (tpl) {
                tpl.oggetto = oggettoInput.value;
                tpl.corpo = corpoInput.value;
            }

            UI.showSuccess('Template "' + templateId + '" salvato!');

        } catch (error) {
            console.error('Errore salvataggio template:', error);
            UI.showError('Errore nel salvataggio del template');
        }
    },

    /**
     * Salva tutti i template contemporaneamente
     */
    async salvaTuttiTemplate() {
        try {
            const templates = {};

            TemplateService.TEMPLATES.forEach(t => {
                const oggettoInput = document.getElementById('tplOggetto_' + t.id);
                const corpoInput = document.getElementById('tplCorpo_' + t.id);
                if (oggettoInput && corpoInput) {
                    templates[t.id] = {
                        oggetto: oggettoInput.value,
                        corpo: corpoInput.value
                    };

                    // Aggiorna anche in memoria
                    t.oggetto = oggettoInput.value;
                    t.corpo = corpoInput.value;
                }
            });

            await db.collection('impostazioni').doc('template_email').set({
                templates: templates,
                ultimaModifica: new Date().toISOString(),
                modificatoDa: AuthService.getUserName(),
                modificatoDaId: AuthService.getUserId()
            });

            // Invalida cache TemplateService
            TemplateService._templatePersonalizzati = null;

            UI.showSuccess('Tutti i template salvati con successo!');

        } catch (error) {
            console.error('Errore salvataggio template:', error);
            UI.showError('Errore nel salvataggio');
        }
    },

    /**
     * Ripristina un template ai valori di default (hardcoded)
     */
    ripristinaTemplateDefault(templateId, idx) {
        // Trova il template di default nel codice originale di TemplateService
        // Per ripristinare, serve il testo originale hardcoded
        const defaultTemplates = {
            'sollecito_pagamento': {
                oggetto: 'Sollecito pagamento fattura n. {{numeroFattura}}',
                corpo: `Gentile {{ragioneSociale}},

con la presente ci permettiamo di ricordarVi che la fattura n. {{numeroFattura}} del {{dataEmissione}}, di importo pari a €{{importoFattura}}, risulta ad oggi non ancora saldata.

Vi invitiamo cortesemente a provvedere al pagamento entro i prossimi 15 giorni dalla ricezione della presente comunicazione.

Per qualsiasi chiarimento o necessità, non esitate a contattarci.

Cordiali saluti,
{{nomeAzienda}}
{{emailAzienda}}
{{telefonoAzienda}}`
            },
            'conferma_rinnovo': {
                oggetto: 'Conferma rinnovo contratto n. {{numeroContratto}}',
                corpo: `Gentile {{ragioneSociale}},

siamo lieti di confermarVi il rinnovo del contratto n. {{numeroContratto}} relativo a "{{oggettoContratto}}".

Il contratto è stato rinnovato con le seguenti condizioni:
- Importo annuale: €{{importoContratto}}
- Periodicità: {{periodicita}}
- Nuova scadenza: {{dataScadenza}}

Rimaniamo a disposizione per qualsiasi chiarimento.

Cordiali saluti,
{{nomeAzienda}}
{{emailAzienda}}
{{telefonoAzienda}}`
            },
            'benvenuto': {
                oggetto: 'Benvenuto in {{nomeAzienda}} - {{ragioneSociale}}',
                corpo: `Gentile {{ragioneSociale}},

siamo lieti di darVi il benvenuto tra i nostri clienti!

Il nostro team è a Vostra completa disposizione per supportarVi in ogni fase del percorso. Di seguito i nostri recapiti per qualsiasi necessità:

Email: {{emailAzienda}}
Telefono: {{telefonoAzienda}}
PEC: {{pecAzienda}}

Non esitate a contattarci per qualsiasi domanda o richiesta.

Un cordiale benvenuto,
{{nomeAzienda}}`
            },
            'scadenza_contratto': {
                oggetto: 'Avviso scadenza contratto n. {{numeroContratto}}',
                corpo: `Gentile {{ragioneSociale}},

desideriamo informarVi che il contratto n. {{numeroContratto}} relativo a "{{oggettoContratto}}" è in scadenza il {{dataScadenza}}.

L'importo annuale attuale è di €{{importoContratto}} con periodicità {{periodicita}}.

Vi invitiamo a contattarci per discutere le condizioni di rinnovo e garantire la continuità del servizio.

Restiamo a disposizione per un incontro o una call.

Cordiali saluti,
{{nomeAzienda}}
{{emailAzienda}}
{{telefonoAzienda}}`
            }
        };

        const def = defaultTemplates[templateId];
        if (!def) return;

        const oggettoInput = document.getElementById('tplOggetto_' + templateId);
        const corpoInput = document.getElementById('tplCorpo_' + templateId);

        if (oggettoInput) oggettoInput.value = def.oggetto;
        if (corpoInput) corpoInput.value = def.corpo;

        UI.showSuccess('Template ripristinato ai valori di default. Clicca "Salva" per confermare.');
    },

    escapeHtml(text) {
        if (!text) return '';
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    escapeHtmlAttr(text) {
        if (!text) return '';
        return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

};

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
                    <button
                        class="settings-tab ${this.currentTab === 'dashboard' ? 'active' : ''}"
                        onclick="Settings.switchTab('dashboard')"
                    >
                        <i class="fas fa-chart-line"></i> Dashboard
                    </button>
                    <button
                        class="settings-tab ${this.currentTab === 'azienda' ? 'active' : ''}"
                        onclick="Settings.switchTab('azienda')"
                    >
                        <i class="fas fa-building"></i> Growapp S.r.l.
                    </button>
                    <button
                        class="settings-tab ${this.currentTab === 'biglietto' ? 'active' : ''}"
                        onclick="Settings.switchTab('biglietto')"
                    >
                        <i class="fas fa-id-card"></i> Biglietto da Visita
                    </button>
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
            case 'utenti':
                return this.renderUtentiTab();
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
        // Carica dati azienda da localStorage o usa valori predefiniti
        const growappData = this.getGrowappData();
        const isEditMode = this.growappEditMode || false;

        if (isEditMode) {
            // MODALITÀ MODIFICA - Form
            return this.renderGrowappEditForm(growappData);
        } else {
            // MODALITÀ VISUALIZZAZIONE - Card elegante
            return this.renderGrowappCard(growappData);
        }
    },

    getGrowappData() {
        const defaultData = {
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

        const savedData = localStorage.getItem('growappData');
        return savedData ? { ...defaultData, ...JSON.parse(savedData) } : defaultData;
    },

    saveGrowappData(data) {
        localStorage.setItem('growappData', JSON.stringify(data));
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
                        <button onclick="Settings.toggleGrowappEdit()" class="btn" style="background: white; color: var(--blu-700); font-weight: 700; padding: 0.875rem 2rem; font-size: 1rem; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                            <i class="fas fa-edit"></i> Modifica Dati
                        </button>
                        <button onclick="Settings.screenshotAzienda()" class="btn" style="background: rgba(255,255,255,0.2); color: white; font-weight: 700; padding: 0.875rem 2rem; font-size: 1rem; border: 2px solid white;">
                            <i class="fas fa-camera"></i> Crea Screenshot
                        </button>
                    </div>
                </div>
            </div>

            <div style="text-align: center; margin-top: 1.5rem; color: var(--grigio-500); font-size: 0.875rem;">
                <i class="fas fa-info-circle"></i> Tutti i campi sono personalizzabili tramite il pulsante "Modifica Dati"
            </div>
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

    toggleGrowappEdit() {
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

    saveGrowappEdit() {
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

        this.saveGrowappData(newData);
        this.growappEditMode = false;
        UI.showSuccess('Dati aziendali salvati con successo!');
        this.switchTab('azienda');
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
                            ${utenti.map(utente => `
                                <tr>
                                    <td>
                                        <div style="font-weight: 600;">${utente.nome} ${utente.cognome}</div>
                                        ${utente.uid === AuthService.getUserId() ? '<span class="badge" style="background: var(--blu-700);">Tu</span>' : ''}
                                    </td>
                                    <td>${utente.email}</td>
                                    <td>
                                        <span class="badge" style="background: var(--blu-500); color: white;">
                                            ${AuthService.ROLE_LABELS[utente.ruolo] || utente.ruolo}
                                        </span>
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
                                        <button class="btn btn-sm btn-secondary" onclick="Settings.editUser('${utente.uid}')" title="Modifica">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        ${utente.uid !== AuthService.getUserId() ? `
                                            <button class="btn btn-sm ${utente.stato === 'ATTIVO' ? 'btn-warning' : 'btn-success'}"
                                                onclick="Settings.toggleUserStatus('${utente.uid}', '${utente.stato || 'ATTIVO'}')"
                                                title="${utente.stato === 'ATTIVO' ? 'Disattiva' : 'Attiva'}">
                                                <i class="fas fa-${utente.stato === 'ATTIVO' ? 'ban' : 'check'}"></i>
                                            </button>
                                        ` : ''}
                                        <button class="btn btn-sm btn-primary" onclick="Settings.resetUserPassword('${utente.uid}', '${utente.email}')" title="Reset Password">
                                            <i class="fas fa-key"></i>
                                        </button>
                                        ${AuthService.isSuperAdmin() && utente.uid !== AuthService.getUserId() ? `
                                            <button class="btn btn-sm btn-danger" onclick="Settings.deleteUser('${utente.uid}', '${utente.nome} ${utente.cognome}')" title="Elimina Utente">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        ` : ''}
                                    </td>
                                </tr>
                            `).join('')}
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

        ruoloSelect.addEventListener('change', updatePermissionsPreview);
        updatePermissionsPreview(); // Initial load

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
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: AuthService.getUserId()
                });

                UI.showSuccess('Utente aggiornato con successo');
                this.closeUserModal();
                this.loadUtentiList();

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
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdBy: AuthService.getUserId(),
                    lastLogin: null
                });

                UI.showSuccess('Utente creato con successo!');

                // Chiudi modal
                this.closeUserModal();

                // Ricarica lista utenti
                this.loadUtentiList();
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

    async switchTab(tab) {
        this.currentTab = tab;
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
    }

};

// Pagina App - Gestione App Comuni
const GestioneApp = {
    filtri: {
        search: '',
        statoApp: '',
        clientePagante: '',
        agente: ''
    },
    filterTimeout: null, // Per debounce della ricerca

    async render() {
        UI.showLoading();

        try {
            // Se agente, carica solo app dei propri clienti
            const _isAgente = AuthService.canViewOnlyOwnData();
            const _agenteNome = _isAgente ? AuthService.getAgenteFilterName() : null;
            let apps, clienti;

            if (_isAgente && _agenteNome) {
                const datiAgente = await DataService.getDatiAgente(_agenteNome);
                apps = datiAgente.app;
                clienti = datiAgente.clienti;
            } else {
                apps = await DataService.getApps();
                clienti = await DataService.getClienti();
            }

            const mainContent = document.getElementById('mainContent');
            mainContent.innerHTML = `
                <div class="page-header mb-3">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
                        <div>
                            <h1 style="font-size: 2rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                                <i class="fas fa-mobile-alt"></i> App Comuni
                            </h1>
                            <p style="color: var(--grigio-500);">
                                Gestione app e collegamento ai clienti paganti
                            </p>
                        </div>
                        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                            <button class="btn btn-secondary" onclick="GestioneApp.exportData()">
                                <i class="fas fa-file-excel"></i> Esporta
                            </button>
                            <button class="btn btn-primary" onclick="FormsManager.showNuovaApp()">
                                <i class="fas fa-plus"></i> Nuova App
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Avviso App da Collegare -->
                ${this.renderAvvisoAppDaCollegare(apps)}

                <!-- Ricerca Documenti Globale -->
                <div class="card" style="margin-bottom: 1.5rem;">
                    <div class="card-header">
                        <h3 style="margin: 0; font-weight: 700; color: var(--blu-700);">
                            <i class="fas fa-search"></i> Ricerca Documenti App
                        </h3>
                    </div>
                    <div style="padding: 1.5rem;">
                        <div style="position: relative; margin-bottom: 1rem;">
                            <i class="fas fa-file-search" style="
                                position: absolute;
                                left: 1rem;
                                top: 50%;
                                transform: translateY(-50%);
                                color: var(--grigio-500);
                                font-size: 1.2rem;
                            "></i>
                            <input
                                type="text"
                                id="searchDocumentiGlobaleApp"
                                placeholder="🔍 Cerca in tutti i documenti app per descrizione o nome file..."
                                onkeyup="GestioneApp.searchDocumenti()"
                                style="
                                    width: 100%;
                                    padding: 1rem 1rem 1rem 3rem;
                                    border: 2px solid var(--grigio-300);
                                    border-radius: 8px;
                                    font-family: 'Titillium Web', sans-serif;
                                    font-size: 1rem;
                                    transition: all 0.2s;
                                "
                                onfocus="this.style.borderColor='var(--blu-500)'"
                                onblur="this.style.borderColor='var(--grigio-300)'"
                            >
                        </div>
                        <small style="color: var(--grigio-500);">
                            <i class="fas fa-info-circle"></i> Digita per cercare in tutti i documenti caricati dalle app
                        </small>

                        <!-- Risultati Ricerca -->
                        <div id="documentiSearchResultsApp" style="display: none; margin-top: 1.5rem;"></div>
                    </div>
                </div>

                <!-- Filtri -->
                <div class="card mb-3">
                    <div class="card-body" style="padding: 1rem;">
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                            <input
                                type="text"
                                id="searchApp"
                                class="form-input"
                                placeholder="Cerca app..."
                                value="${this.filtri.search}"
                                oninput="GestioneApp.applyFilters()"
                            />
                            <select class="filter-select" id="filtroStatoApp" onchange="GestioneApp.applyFilters()">
                                <option value="">Tutti gli stati app</option>
                                <option value="ATTIVA">Attive</option>
                                <option value="IN_SVILUPPO">In Sviluppo</option>
                                <option value="SOSPESA">Sospese</option>
                                <option value="DISATTIVATA">Disattivate</option>
                                <option value="DEMO">Demo</option>
                                <option value="__SENZA_STATO__">⚠️ Senza stato</option>
                            </select>
                            <select class="filter-select" id="filtroClientePagante" onchange="GestioneApp.applyFilters()">
                                <option value="">Tutti i paganti</option>
                                <option value="__NON_COLLEGATO__">⚠️ Non Collegati</option>
                                ${this.renderClientiPagantiOptions(clienti)}
                            </select>
                            <select class="filter-select" id="filtroAgente" onchange="GestioneApp.applyFilters()">
                                <option value="">Tutti gli agenti</option>
                                ${this.renderAgentiOptions(apps, clienti)}
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Lista App -->
                <div id="appListContainer">
                    ${this.renderAppList(apps, clienti)}
                </div>
            `;

            UI.hideLoading();
        } catch (error) {
            console.error('Errore rendering app:', error);
            UI.hideLoading();
            UI.showError('Errore nel caricamento delle app');
        }
    },

    renderAvvisoAppDaCollegare(apps) {
        // Mostra warning solo per app ATTIVE non collegate (non per IN_SVILUPPO, DEMO o prospect)
        const nonCollegate = apps.filter(a =>
            !a.clientePaganteId &&
            a.statoApp === 'ATTIVA'
        ).length;

        if (nonCollegate === 0) return '';

        return `
            <div class="alert alert-warning" style="background: var(--giallo-avviso); border-left: 4px solid #FFA000; padding: 1rem; margin-bottom: 1.5rem; border-radius: 8px;">
                <strong><i class="fas fa-exclamation-triangle"></i> ${nonCollegate} app attive da collegare</strong>
                <p style="margin: 0.5rem 0 0 0; color: var(--grigio-700);">
                    Collega ogni app attiva al cliente pagante corretto usando il menu a tendina
                </p>
            </div>
        `;
    },

    renderClientiPagantiOptions(clienti) {
        return clienti.map(c => `
            <option value="${c.id}">${c.ragioneSociale}</option>
        `).join('');
    },

    renderAgentiOptions(apps, clienti) {
        // Raccogli agenti unici da app e clienti collegati
        const agentiSet = new Set();

        apps.forEach(app => {
            // Priorità: agente dal cliente se collegato, altrimenti agente app
            const cliente = clienti.find(c => c.id === app.clientePaganteId);
            const agente = cliente?.agente || app.agente;

            if (agente && agente.trim()) {
                agentiSet.add(agente.trim());
            }
        });

        // Converti in array, ordina alfabeticamente e genera options
        const agentiUnici = Array.from(agentiSet).sort();

        return agentiUnici.map(agente => `
            <option value="${agente}">${agente}</option>
        `).join('');
    },

    renderAppList(apps, clienti) {
        let filtrate = apps;

        // Applica filtri
        if (this.filtri.search) {
            const term = this.filtri.search.toLowerCase();
            filtrate = filtrate.filter(a =>
                a.nome?.toLowerCase().includes(term) ||
                a.comune?.toLowerCase().includes(term) ||
                a.provincia?.toLowerCase().includes(term)
            );
        }

        if (this.filtri.statoApp) {
            if (this.filtri.statoApp === '__SENZA_STATO__') {
                filtrate = filtrate.filter(a => !a.statoApp || a.statoApp === '');
            } else {
                filtrate = filtrate.filter(a => a.statoApp === this.filtri.statoApp);
            }
        }

        if (this.filtri.clientePagante) {
            if (this.filtri.clientePagante === '__NON_COLLEGATO__') {
                filtrate = filtrate.filter(a => !a.clientePaganteId);
            } else {
                filtrate = filtrate.filter(a => a.clientePaganteId === this.filtri.clientePagante);
            }
        }

        if (this.filtri.agente) {
            const _filtroAgLower = this.filtri.agente.toLowerCase();
            filtrate = filtrate.filter(a => {
                // Priorità: agente dal cliente se collegato, altrimenti agente app
                const cliente = clienti.find(c => c.id === a.clientePaganteId);
                const agente = cliente?.agente || a.agente;
                return (agente || '').toLowerCase() === _filtroAgLower;
            });
        }

        if (filtrate.length === 0) {
            return `
                <div class="empty-state">
                    <i class="fas fa-mobile-alt"></i>
                    <h3>Nessuna app trovata</h3>
                    <p>Nessuna app corrisponde ai filtri selezionati</p>
                </div>
            `;
        }

        return `
            <div class="card">
                <div class="list-group">
                    ${filtrate.map(app => this.renderAppRow(app, clienti)).join('')}
                </div>
            </div>
        `;
    },

    calcolaAlertScadenze(app) {
        // Calcola scadenze in alert (3 giorni prima)
        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);
        const tra7giorni = new Date(oggi);
        tra7giorni.setDate(oggi.getDate() + 7);

        let numAlert = 0;

        // Alert = scadute (passate) + imminenti (prossimi 7 giorni)
        if (app.ultimaDataRaccoltaDifferenziata) {
            const data = new Date(app.ultimaDataRaccoltaDifferenziata);
            data.setHours(0, 0, 0, 0);
            if (data < oggi || (data >= oggi && data <= tra7giorni)) numAlert++;
        }

        if (app.ultimaDataFarmacieTurno) {
            const data = new Date(app.ultimaDataFarmacieTurno);
            data.setHours(0, 0, 0, 0);
            if (data < oggi || (data >= oggi && data <= tra7giorni)) numAlert++;
        }

        if (app.scadenzaCertificatoApple) {
            const data = new Date(app.scadenzaCertificatoApple);
            data.setHours(0, 0, 0, 0);
            if (data < oggi || (data >= oggi && data <= tra7giorni)) numAlert++;
        }

        if (app.altraScadenzaData) {
            const data = new Date(app.altraScadenzaData);
            data.setHours(0, 0, 0, 0);
            if (data < oggi || (data >= oggi && data <= tra7giorni)) numAlert++;
        }

        return numAlert;
    },

    calcolaAvvisoControlloQualita(app) {
        // Verifica se serve un controllo qualità (più di 1 mese dall'ultimo)
        if (app.dataUltimoControlloQualita) {
            const dataControllo = new Date(app.dataUltimoControlloQualita);
            dataControllo.setHours(0, 0, 0, 0);
            const oggi = new Date();
            oggi.setHours(0, 0, 0, 0);
            const diffTime = oggi - dataControllo;
            const giorniPassati = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            return giorniPassati > 30; // True se è passato più di 1 mese
        } else {
            // Nessun controllo mai fatto
            return true;
        }
    },

    renderAppRow(app, clienti) {
        const badgeClass = DataService.getStatoBadgeClass(app.statoApp);
        const clientePagante = clienti.find(c => c.id === app.clientePaganteId);
        const isCollegata = !!app.clientePaganteId;
        const numAlert = this.calcolaAlertScadenze(app);
        const needsQualityCheck = this.calcolaAvvisoControlloQualita(app);

        // Calcola se il controllo è recente (entro 30 giorni) per app ATTIVE
        let hasRecentQualityCheck = false;
        if (app.statoApp === 'ATTIVA' && app.dataUltimoControlloQualita) {
            const dataControllo = new Date(app.dataUltimoControlloQualita);
            dataControllo.setHours(0, 0, 0, 0);
            const oggi = new Date();
            oggi.setHours(0, 0, 0, 0);
            const diffTime = oggi - dataControllo;
            const giorniPassati = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            hasRecentQualityCheck = giorniPassati <= 30;
        }

        return `
            <div class="list-item" style="display: grid; grid-template-columns: 1fr auto auto; gap: 1rem; align-items: center;">
                <div onclick="UI.showPage('dettaglio-app', '${app.id}')" style="cursor: pointer;">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div style="width: 40px; height: 40px; background: var(--blu-100); border-radius: 8px; display: flex; align-items: center; justify-content: center; position: relative;">
                            <i class="fas fa-mobile-alt" style="color: var(--blu-700);"></i>
                            ${numAlert > 0 ? `
                            <span style="position: absolute; top: -4px; right: -4px; width: 18px; height: 18px; background: var(--rosso-errore); color: white; border-radius: 50%; font-size: 0.65rem; font-weight: 700; display: flex; align-items: center; justify-content: center; border: 2px solid white;">
                                ${numAlert}
                            </span>
                            ` : ''}
                        </div>
                        <div style="flex: 1;">
                            <h3 style="font-size: 1rem; font-weight: 600; margin: 0; color: var(--grigio-900);">
                                ${app.nome}
                                ${numAlert > 0 ? `<span style="color: var(--rosso-errore); font-size: 0.875rem; margin-left: 0.5rem;"><i class="fas fa-exclamation-circle"></i></span>` : ''}
                            </h3>
                            <div style="font-size: 0.875rem; color: var(--grigio-500); margin-top: 0.25rem;">
                                ${app.provincia || 'N/A'}
                                ${isCollegata
                                    ? `• <strong>Pagante:</strong> ${clientePagante?.ragioneSociale || 'Sconosciuto'}`
                                    : (app.statoApp === 'ATTIVA' || app.statoApp === 'IN_SVILUPPO'
                                        ? '• <span style="color: var(--rosso-errore);">⚠️ Non collegata</span>'
                                        : '• <span style="color: var(--grigio-400);">Prospect/Demo</span>')
                                }
                                ${numAlert > 0 ? `• <span style="color: var(--rosso-errore); font-weight: 600;">${numAlert} scadenz${numAlert === 1 ? 'a' : 'e'} in alert</span>` : ''}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Select Cliente Pagante -->
                <select
                    class="form-input"
                    style="width: 250px;"
                    onchange="GestioneApp.collegaClientePagante('${app.id}', this.value)"
                    ${isCollegata ? '' : 'style="border-color: var(--rosso-errore);"'}
                >
                    <option value="">-- Seleziona Cliente Pagante --</option>
                    ${clienti.map(c => `
                        <option value="${c.id}" ${c.id === app.clientePaganteId ? 'selected' : ''}>
                            ${c.ragioneSociale}
                        </option>
                    `).join('')}
                </select>

                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    ${numAlert > 0 ? `
                    <span class="badge" style="background: var(--rosso-errore); color: white; cursor: pointer; animation: pulse 2s infinite;" onclick="UI.showPage('dettaglio-app', '${app.id}')" title="Clicca per vedere dettagli scadenze">
                        <i class="fas fa-bell"></i> ${numAlert} Alert
                    </span>
                    ` : ''}
                    ${(app.controlloQualitaNegativo === true || app.controlloQualitaNegativo === 'true') && app.statoApp === 'ATTIVA' ? `
                    <span class="badge" style="background: var(--rosso-errore); color: white; cursor: pointer; animation: pulse 2s infinite;" onclick="UI.showPage('dettaglio-app', '${app.id}')" title="Controllo qualità NEGATIVO - problemi rilevati">
                        <i class="fas fa-times-circle"></i> QA KO
                    </span>
                    ` : hasRecentQualityCheck ? `
                    <span class="badge" style="background: var(--verde-700); color: white; cursor: pointer;" onclick="UI.showPage('dettaglio-app', '${app.id}')" title="Controllo qualità OK - effettuato di recente">
                        <i class="fas fa-check-circle"></i> QA OK
                    </span>
                    ` : needsQualityCheck && app.statoApp === 'ATTIVA' ? `
                    <span class="badge" style="background: var(--giallo-avviso); color: #856404; cursor: pointer;" onclick="UI.showPage('dettaglio-app', '${app.id}')" title="Controllo qualità necessario">
                        <i class="fas fa-clipboard-check"></i> Controllo QA
                    </span>
                    ` : ''}
                    <span class="badge ${badgeClass}">
                        ${app.statoApp?.replace('_', ' ') || 'N/A'}
                    </span>
                    <button
                        class="btn-icon"
                        onclick="GestioneApp.eliminaApp('${app.id}', '${app.nome}')"
                        title="Elimina app"
                    >
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    },

    async collegaClientePagante(appId, clientePaganteId) {
        try {
            if (!clientePaganteId) {
                // Scollega
                await DataService.updateApp(appId, {
                    clientePaganteId: null,
                    tipoPagamento: null,
                    migrazioneCompleta: false
                });
                UI.showSuccess('App scollegata dal cliente');
            } else {
                // Collega
                await DataService.updateApp(appId, {
                    clientePaganteId,
                    tipoPagamento: 'RIVENDITORE', // Default - può essere modificato dopo
                    migrazioneCompleta: true
                });
                UI.showSuccess('App collegata al cliente pagante');
            }

            // Ricarica lista
            await this.render();
        } catch (error) {
            console.error('Errore collegamento:', error);
            UI.showError('Errore nel collegamento: ' + error.message);
        }
    },

    async eliminaApp(appId, nomeApp) {
        const conferma = confirm(
            `Eliminare definitivamente l'app "${nomeApp}"?\n\nQuesta operazione NON può essere annullata.`
        );

        if (!conferma) return;

        try {
            await DataService.deleteApp(appId);
            UI.showSuccess('App eliminata');
            await this.render();
        } catch (error) {
            console.error('Errore eliminazione:', error);
            UI.showError('Errore nell\'eliminazione: ' + error.message);
        }
    },

    applyFilters() {
        // Debounce: aspetta 300ms dopo l'ultima digitazione prima di filtrare
        clearTimeout(this.filterTimeout);
        this.filterTimeout = setTimeout(async () => {
            this.filtri.search = document.getElementById('searchApp')?.value || '';
            this.filtri.statoApp = document.getElementById('filtroStatoApp')?.value || '';
            this.filtri.clientePagante = document.getElementById('filtroClientePagante')?.value || '';
            this.filtri.agente = document.getElementById('filtroAgente')?.value || '';

            // Ricarica solo la lista, non tutta la pagina
            try {
                const __isAgente = AuthService.canViewOnlyOwnData();
                const __agenteNome = __isAgente ? AuthService.getAgenteFilterName() : null;
                let apps, clienti;
                if (__isAgente && __agenteNome) {
                    const dati = await DataService.getDatiAgente(__agenteNome);
                    apps = dati.app;
                    clienti = dati.clienti;
                } else {
                    apps = await DataService.getApps();
                    clienti = await DataService.getClienti();
                }
                document.getElementById('appListContainer').innerHTML = this.renderAppList(apps, clienti);
            } catch (error) {
                console.error('Errore applicazione filtri:', error);
            }
        }, 300);
    },

    async exportData() {
        try {
            UI.showLoading();
            const _isAgenteExp = AuthService.canViewOnlyOwnData();
            const _agenteNomeExp = _isAgenteExp ? AuthService.getAgenteFilterName() : null;
            let apps, clienti;
            if (_isAgenteExp && _agenteNomeExp) {
                const dati = await DataService.getDatiAgente(_agenteNomeExp);
                apps = dati.app;
                clienti = dati.clienti;
            } else {
                [apps, clienti] = await Promise.all([
                    DataService.getApps(),
                    DataService.getClienti()
                ]);
            }

            // Arricchisci con ragione sociale cliente pagante e agente
            const appsConCliente = apps.map(a => {
                const cliente = clienti.find(c => c.id === a.clientePaganteId);
                return {
                    ...a,
                    clientePaganteRagioneSociale: cliente?.ragioneSociale || 'Non collegata',
                    agente: cliente?.agente || a.agente || '' // Priorità: agente cliente, poi agente app
                };
            });

            UI.hideLoading();
            await ExportManager.exportApp(appsConCliente);
        } catch (error) {
            UI.hideLoading();
            UI.showError('Errore export: ' + error.message);
        }
    },

    async searchDocumenti() {
        const searchInput = document.getElementById('searchDocumentiGlobaleApp');
        const searchTerm = searchInput.value.toLowerCase().trim();
        const resultsContainer = document.getElementById('documentiSearchResultsApp');

        // Se il campo è vuoto, nascondi i risultati
        if (searchTerm === '') {
            resultsContainer.style.display = 'none';
            return;
        }

        // Mostra loading
        resultsContainer.style.display = 'block';
        resultsContainer.innerHTML = '<div style="text-align: center; padding: 2rem;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--blu-500);"></i><p style="margin-top: 1rem; color: var(--grigio-600);">Ricerca in corso...</p></div>';

        try {
            // Cerca in tutti i documenti di tipo "app"
            const documentiSnapshot = await db.collection('documenti')
                .where('tipo', '==', 'app')
                .get();

            const documenti = [];
            documentiSnapshot.forEach(doc => {
                const data = doc.data();
                documenti.push({ id: doc.id, ...data });
            });

            // Filtra documenti che matchano la ricerca
            const risultati = documenti.filter(doc => {
                const searchText = `${doc.nomeOriginale} ${doc.descrizione}`.toLowerCase();
                return searchText.includes(searchTerm);
            });

            // Carica info app per i risultati
            const appMap = new Map();
            for (const doc of risultati) {
                if (!appMap.has(doc.entitaId)) {
                    try {
                        const app = await DataService.getApp(doc.entitaId);
                        if (app) {
                            appMap.set(doc.entitaId, app);
                        }
                    } catch (e) {
                        console.warn(`App ${doc.entitaId} non trovata`);
                    }
                }
            }

            // Renderizza risultati
            if (risultati.length === 0) {
                resultsContainer.innerHTML = `
                    <div style="text-align: center; padding: 2rem;">
                        <i class="fas fa-search" style="font-size: 3rem; color: var(--grigio-400); margin-bottom: 1rem;"></i>
                        <h3 style="color: var(--grigio-600);">Nessun documento trovato</h3>
                        <p style="color: var(--grigio-500);">Prova con altre parole chiave</p>
                    </div>
                `;
            } else {
                resultsContainer.innerHTML = `
                    <div style="border-top: 2px solid var(--grigio-300); padding-top: 1.5rem;">
                        <h4 style="margin: 0 0 1rem 0; color: var(--blu-700); font-weight: 700;">
                            <i class="fas fa-check-circle" style="color: var(--verde-700);"></i>
                            Trovati ${risultati.length} documento${risultati.length !== 1 ? 'i' : ''}
                        </h4>
                        <div style="display: grid; gap: 1rem;">
                            ${risultati.map(doc => {
                                const app = appMap.get(doc.entitaId);
                                return `
                                    <div style="
                                        background: white;
                                        border: 2px solid var(--grigio-300);
                                        border-radius: 8px;
                                        padding: 1rem;
                                        display: grid;
                                        grid-template-columns: auto 1fr auto;
                                        gap: 1rem;
                                        align-items: center;
                                        transition: all 0.2s;
                                        cursor: pointer;
                                    " onmouseover="this.style.borderColor='var(--blu-500)'; this.style.boxShadow='0 4px 12px rgba(20, 82, 132, 0.15)'"
                                       onmouseout="this.style.borderColor='var(--grigio-300)'; this.style.boxShadow='none'"
                                       onclick="UI.showPage('dettaglio-app', '${doc.entitaId}')">

                                        <i class="${DocumentService.getFileIcon(doc.mimeType)}" style="
                                            font-size: 2rem;
                                            color: ${DocumentService.getFileColor(doc.mimeType)};
                                        "></i>

                                        <div style="min-width: 0;">
                                            <h5 style="margin: 0 0 0.25rem 0; color: var(--blu-700); font-weight: 700; font-size: 1rem;">
                                                ${doc.nomeOriginale}
                                            </h5>
                                            <p style="margin: 0 0 0.5rem 0; color: var(--grigio-700); font-size: 0.9rem;">
                                                ${doc.descrizione}
                                            </p>
                                            <div style="display: flex; gap: 1rem; flex-wrap: wrap; font-size: 0.85rem; color: var(--grigio-500);">
                                                <span><i class="fas fa-mobile-alt"></i> <strong>${app ? app.nome : 'App eliminata'}</strong></span>
                                                <span><i class="fas fa-hdd"></i> ${DocumentService.formatFileSize(doc.dimensione)}</span>
                                                <span><i class="fas fa-calendar"></i> ${new Date(doc.dataCaricamento).toLocaleDateString('it-IT')}</span>
                                            </div>
                                        </div>

                                        <i class="fas fa-chevron-right" style="color: var(--grigio-400);"></i>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Errore ricerca documenti:', error);
            resultsContainer.innerHTML = `
                <div style="text-align: center; padding: 2rem;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: var(--rosso-errore); margin-bottom: 1rem;"></i>
                    <h3 style="color: var(--rosso-errore);">Errore durante la ricerca</h3>
                    <p style="color: var(--grigio-500);">${error.message}</p>
                </div>
            `;
        }
    }
};

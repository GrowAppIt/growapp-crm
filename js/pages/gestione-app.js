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
            const apps = await DataService.getApps();
            const clienti = await DataService.getClienti();

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
        // Mostra warning solo per app ATTIVE o IN_SVILUPPO non collegate (non per DEMO o prospect)
        const nonCollegate = apps.filter(a =>
            !a.clientePaganteId &&
            (a.statoApp === 'ATTIVA' || a.statoApp === 'IN_SVILUPPO')
        ).length;

        if (nonCollegate === 0) return '';

        return `
            <div class="alert alert-warning" style="background: var(--giallo-avviso); border-left: 4px solid #FFA000; padding: 1rem; margin-bottom: 1.5rem; border-radius: 8px;">
                <strong><i class="fas fa-exclamation-triangle"></i> ${nonCollegate} app attive da collegare</strong>
                <p style="margin: 0.5rem 0 0 0; color: var(--grigio-700);">
                    Collega ogni app attiva/in sviluppo al cliente pagante corretto usando il menu a tendina
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
            filtrate = filtrate.filter(a => a.statoApp === this.filtri.statoApp);
        }

        if (this.filtri.clientePagante) {
            if (this.filtri.clientePagante === '__NON_COLLEGATO__') {
                filtrate = filtrate.filter(a => !a.clientePaganteId);
            } else {
                filtrate = filtrate.filter(a => a.clientePaganteId === this.filtri.clientePagante);
            }
        }

        if (this.filtri.agente) {
            filtrate = filtrate.filter(a => {
                // Priorità: agente dal cliente se collegato, altrimenti agente app
                const cliente = clienti.find(c => c.id === a.clientePaganteId);
                const agente = cliente?.agente || a.agente;
                return agente === this.filtri.agente;
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

    renderAppRow(app, clienti) {
        const badgeClass = DataService.getStatoBadgeClass(app.statoApp);
        const clientePagante = clienti.find(c => c.id === app.clientePaganteId);
        const isCollegata = !!app.clientePaganteId;

        return `
            <div class="list-item" style="display: grid; grid-template-columns: 1fr auto auto; gap: 1rem; align-items: center;">
                <div onclick="UI.showPage('dettaglio-app', '${app.id}')" style="cursor: pointer;">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div style="width: 40px; height: 40px; background: var(--blu-100); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-mobile-alt" style="color: var(--blu-700);"></i>
                        </div>
                        <div style="flex: 1;">
                            <h3 style="font-size: 1rem; font-weight: 600; margin: 0; color: var(--grigio-900);">
                                ${app.nome}
                            </h3>
                            <div style="font-size: 0.875rem; color: var(--grigio-500); margin-top: 0.25rem;">
                                ${app.provincia || 'N/A'}
                                ${isCollegata
                                    ? `• <strong>Pagante:</strong> ${clientePagante?.ragioneSociale || 'Sconosciuto'}`
                                    : (app.statoApp === 'ATTIVA' || app.statoApp === 'IN_SVILUPPO'
                                        ? '• <span style="color: var(--rosso-errore);">⚠️ Non collegata</span>'
                                        : '• <span style="color: var(--grigio-400);">Prospect/Demo</span>')
                                }
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
                const apps = await DataService.getApps();
                const clienti = await DataService.getClienti();
                document.getElementById('appListContainer').innerHTML = this.renderAppList(apps, clienti);
            } catch (error) {
                console.error('Errore applicazione filtri:', error);
            }
        }, 300);
    },

    async exportData() {
        try {
            UI.showLoading();
            const [apps, clienti] = await Promise.all([
                DataService.getApps(),
                DataService.getClienti()
            ]);

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
    }
};

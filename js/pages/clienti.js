// Clienti Page
const Clienti = {
    filtri: {
        stato: '',
        agente: '',
        search: ''
    },

    async render() {
        UI.showLoading();

        try {
            const clienti = await DataService.getClienti();

            const mainContent = document.getElementById('mainContent');
            mainContent.innerHTML = `
                <div class="page-header mb-3">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
                        <div>
                            <h1 style="font-size: 2rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                                <i class="fas fa-users"></i> Clienti
                            </h1>
                            <p style="color: var(--grigio-500);">
                                Totale: ${clienti.length} clienti
                            </p>
                        </div>
                        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                            <button class="btn btn-secondary" onclick="ExportManager.downloadTemplateClienti()">
                                <i class="fas fa-download"></i> Template
                            </button>
                            <button class="btn btn-secondary" onclick="ExportManager.importClienti()">
                                <i class="fas fa-upload"></i> Importa
                            </button>
                            <button class="btn btn-secondary" onclick="Clienti.exportData()">
                                <i class="fas fa-file-excel"></i> Esporta
                            </button>
                            <button class="btn btn-primary" onclick="FormsManager.showNuovoCliente()">
                                <i class="fas fa-plus"></i> Nuovo Cliente
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Filtri -->
                <div class="filter-bar fade-in">
                    <div class="filter-group">
                        <input type="text" class="filter-input" id="searchInput" placeholder="🔍 Cerca cliente..." onkeyup="Clienti.applyFilters()">
                        <select class="filter-select" id="filtroStato" onchange="Clienti.applyFilters()">
                            <option value="">Tutti gli stati</option>
                            <option value="ATTIVO">Attivi</option>
                            <option value="PROSPECT">Prospect</option>
                            <option value="SCADUTO">Scaduti</option>
                            <option value="CESSATO">Cessati</option>
                            <option value="DA_DEFINIRE">Da Definire</option>
                        </select>
                        <select class="filter-select" id="filtroAgente" onchange="Clienti.applyFilters()">
                            <option value="">Tutti gli agenti</option>
                            ${this.renderAgentiOptions(clienti)}
                        </select>
                    </div>
                </div>

                <!-- Lista Clienti -->
                <div id="clientiList">
                    ${this.renderClientiList(clienti)}
                </div>
            `;

            UI.hideLoading();
        } catch (error) {
            console.error('Errore rendering clienti:', error);
            UI.hideLoading();
        }
    },

    renderClientiList(clienti) {
        if (clienti.length === 0) {
            return UI.createEmptyState({
                icon: 'users',
                title: 'Nessun cliente',
                subtitle: 'Non ci sono clienti che corrispondono ai filtri selezionati'
            });
        }

        let html = '<div class="card"><div class="list-group">';

        for (const cliente of clienti) {
            const badgeClass = DataService.getStatoBadgeClass(cliente.statoContratto);
            const statoApp = cliente.statoApp ? cliente.statoApp.replace('_', ' ') : 'N/A';

            html += `
                <div class="list-item" style="display: grid; grid-template-columns: 1fr auto; gap: 1rem; align-items: center;">
                    <div onclick="UI.showPage('dettaglio-cliente', '${cliente.id}')" style="cursor: pointer; flex: 1;">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div style="width: 40px; height: 40px; background: var(--blu-100); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                                <i class="fas fa-building" style="color: var(--blu-700);"></i>
                            </div>
                            <div style="flex: 1;">
                                <h3 style="font-size: 1rem; font-weight: 600; margin: 0; color: var(--grigio-900);">
                                    ${cliente.ragioneSociale}
                                </h3>
                                <div style="font-size: 0.875rem; color: var(--grigio-500); margin-top: 0.25rem;">
                                    ${cliente.provincia || 'N/A'} • ${cliente.agente || 'N/A'} • App: ${statoApp}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <span class="badge ${badgeClass}">
                            ${cliente.statoContratto?.replace('_', ' ') || 'N/A'}
                        </span>
                        <button
                            class="btn-icon"
                            onclick="Clienti.eliminaCliente('${cliente.id}', '${cliente.ragioneSociale.replace(/'/g, "\\'")}')"
                            title="Elimina cliente"
                            style="color: var(--rosso-errore);"
                        >
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }

        html += '</div></div>';
        return html;
    },

    renderAgentiOptions(clienti) {
        const agenti = [...new Set(clienti.map(c => c.agente).filter(a => a))];
        agenti.sort();
        return agenti.map(a => `<option value="${a}">${a}</option>`).join('');
    },

    applyFilters() {
        this.filtri.stato = document.getElementById('filtroStato').value;
        this.filtri.agente = document.getElementById('filtroAgente').value;
        this.filtri.search = document.getElementById('searchInput').value.toLowerCase();

        DataService.getClienti().then(clienti => {
            let filtrati = clienti;

            if (this.filtri.stato) {
                filtrati = filtrati.filter(c => c.statoContratto === this.filtri.stato);
            }

            if (this.filtri.agente) {
                filtrati = filtrati.filter(c => c.agente === this.filtri.agente);
            }

            if (this.filtri.search) {
                filtrati = filtrati.filter(c =>
                    c.ragioneSociale.toLowerCase().includes(this.filtri.search) ||
                    c.provincia?.toLowerCase().includes(this.filtri.search) ||
                    c.agente?.toLowerCase().includes(this.filtri.search)
                );
            }

            document.getElementById('clientiList').innerHTML = this.renderClientiList(filtrati);
        });
    },

    async exportData() {
        // Prendi i clienti attualmente visualizzati (con filtri applicati)
        const clienti = await DataService.getClienti();
        let filtrati = clienti;

        if (this.filtri.stato) {
            filtrati = filtrati.filter(c => c.statoContratto === this.filtri.stato);
        }
        if (this.filtri.agente) {
            filtrati = filtrati.filter(c => c.agente === this.filtri.agente);
        }
        if (this.filtri.search) {
            filtrati = filtrati.filter(c =>
                c.ragioneSociale.toLowerCase().includes(this.filtri.search) ||
                c.provincia?.toLowerCase().includes(this.filtri.search) ||
                c.agente?.toLowerCase().includes(this.filtri.search)
            );
        }

        await ExportManager.exportClienti(filtrati);
    },

    async eliminaCliente(clienteId, nomeCliente) {
        const conferma = confirm(
            `⚠️ ATTENZIONE!\n\nSei sicuro di voler eliminare "${nomeCliente}"?\n\n` +
            `Questa operazione eliminerà:\n` +
            `• Il cliente dalla lista\n` +
            `• TUTTE le fatture associate\n` +
            `• TUTTI i contratti e scadenze\n\n` +
            `QUESTA OPERAZIONE NON PUÒ ESSERE ANNULLATA!`
        );

        if (!conferma) return;

        // Doppia conferma per sicurezza
        const confermaFinale = confirm(
            `ULTIMA CONFERMA:\n\nDigita OK per eliminare definitivamente "${nomeCliente}"`
        );

        if (!confermaFinale) return;

        try {
            UI.showLoading();

            // Elimina tutte le fatture del cliente
            const fatture = await DataService.getFattureCliente(clienteId);
            for (const fattura of fatture) {
                await DataService.deleteFattura(fattura.id);
            }

            // Elimina il cliente
            await DataService.deleteCliente(clienteId);

            UI.hideLoading();
            UI.showSuccess(`Cliente "${nomeCliente}" eliminato con successo`);

            // Ricarica la lista
            await this.render();
        } catch (error) {
            console.error('Errore eliminazione cliente:', error);
            UI.hideLoading();
            UI.showError('Errore nell\'eliminazione: ' + error.message);
        }
    }
};

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

                <!-- Ricerca Documenti Globale -->
                <div class="card" style="margin-bottom: 1.5rem;">
                    <div class="card-header">
                        <h3 style="margin: 0; font-weight: 700; color: var(--blu-700);">
                            <i class="fas fa-search"></i> Ricerca Documenti Clienti
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
                                id="searchDocumentiGlobale"
                                placeholder="🔍 Cerca in tutti i documenti clienti per descrizione o nome file..."
                                onkeyup="Clienti.searchDocumenti()"
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
                            <i class="fas fa-info-circle"></i> Digita per cercare in tutti i documenti caricati dai clienti
                        </small>

                        <!-- Risultati Ricerca -->
                        <div id="documentiSearchResults" style="display: none; margin-top: 1.5rem;"></div>
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
                        <select class="filter-select" id="filtroTipo" onchange="Clienti.applyFilters()">
                            <option value="">Tutti i tipi</option>
                            <option value="PA">PA - Pubblica Amm.</option>
                            <option value="PRIVATO">Privati</option>
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
                                    ${cliente.tipo === 'PA' ? '<span style="display:inline-block; background:#0288D1; color:white; font-size:0.65rem; padding:0.1rem 0.35rem; border-radius:3px; font-weight:700; margin-left:0.5rem; vertical-align:middle;">PA</span>' :
                                      '<span style="display:inline-block; background:#9B9B9B; color:white; font-size:0.65rem; padding:0.1rem 0.35rem; border-radius:3px; font-weight:700; margin-left:0.5rem; vertical-align:middle;">PR</span>'}
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
        this.filtri.tipo = document.getElementById('filtroTipo')?.value || '';

        DataService.getClienti().then(clienti => {
            let filtrati = clienti;

            if (this.filtri.stato) {
                filtrati = filtrati.filter(c => c.statoContratto === this.filtri.stato);
            }

            if (this.filtri.agente) {
                filtrati = filtrati.filter(c => c.agente === this.filtri.agente);
            }

            if (this.filtri.tipo) {
                filtrati = filtrati.filter(c => c.tipo === this.filtri.tipo);
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
    },

    async searchDocumenti() {
        const searchInput = document.getElementById('searchDocumentiGlobale');
        const searchTerm = searchInput.value.toLowerCase().trim();
        const resultsContainer = document.getElementById('documentiSearchResults');

        // Se il campo è vuoto, nascondi i risultati
        if (searchTerm === '') {
            resultsContainer.style.display = 'none';
            return;
        }

        // Mostra loading
        resultsContainer.style.display = 'block';
        resultsContainer.innerHTML = '<div style="text-align: center; padding: 2rem;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: var(--blu-500);"></i><p style="margin-top: 1rem; color: var(--grigio-600);">Ricerca in corso...</p></div>';

        try {
            // Cerca in tutti i documenti di tipo "cliente"
            const documentiSnapshot = await db.collection('documenti')
                .where('tipo', '==', 'cliente')
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

            // Carica info clienti per i risultati
            const clientiMap = new Map();
            for (const doc of risultati) {
                if (!clientiMap.has(doc.entitaId)) {
                    try {
                        const cliente = await DataService.getCliente(doc.entitaId);
                        if (cliente) {
                            clientiMap.set(doc.entitaId, cliente);
                        }
                    } catch (e) {
                        console.warn(`Cliente ${doc.entitaId} non trovato`);
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
                                const cliente = clientiMap.get(doc.entitaId);
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
                                       onclick="UI.showPage('dettaglio-cliente', '${doc.entitaId}')">

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
                                                <span><i class="fas fa-user"></i> <strong>${cliente ? cliente.ragioneSociale : 'Cliente eliminato'}</strong></span>
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

// Pagina Contratti - Gestione Contratti
const Contratti = {
    filtri: {
        search: '',
        stato: '',
        clienteId: '',
        tipologia: '',
        scadenza: '' // '', '30', '60', '90' giorni
    },

    async render() {
        UI.showLoading();

        try {
            // Se agente, carica solo dati dei propri clienti
            const _isAgente = AuthService.canViewOnlyOwnData();
            const _agenteNome = _isAgente ? AuthService.getAgenteFilterName() : null;
            let contratti, clienti;

            if (_isAgente && _agenteNome) {
                const datiAgente = await DataService.getDatiAgente(_agenteNome);
                contratti = datiAgente.contratti;
                clienti = datiAgente.clienti;
            } else {
                [contratti, clienti] = await Promise.all([
                    DataService.getContratti(),
                    DataService.getClienti()
                ]);
            }

            // Arricchisci contratti con ragione sociale cliente
            const contrattiArricchiti = contratti.map(c => ({
                ...c,
                clienteRagioneSociale: clienti.find(cl => cl.id === c.clienteId || cl.clienteIdLegacy === c.clienteId)?.ragioneSociale || c.clienteRagioneSociale || 'Sconosciuto'
            }));

            const mainContent = document.getElementById('mainContent');
            mainContent.innerHTML = `
                <div class="page-header mb-3">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
                        <div>
                            <h1 style="font-size: 2rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                                <i class="fas fa-file-contract"></i> Contratti
                            </h1>
                            <p style="color: var(--grigio-500);">
                                Gestione contratti e accordi commerciali
                            </p>
                        </div>
                        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                            <button class="btn btn-secondary" onclick="Contratti.exportData()">
                                <i class="fas fa-file-excel"></i> Esporta
                            </button>
                            ${!AuthService.canViewOnlyOwnData() ? `
                            <button class="btn btn-primary" onclick="FormsManager.showNuovoContratto()">
                                <i class="fas fa-plus"></i> Nuovo Contratto
                            </button>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <!-- Avviso Contratti in Scadenza -->
                ${this.renderAvvisoContrattiInScadenza(contrattiArricchiti)}

                <!-- Filtri -->
                <div class="card mb-3">
                    <div class="card-body" style="padding: 1rem;">
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                            <input
                                type="text"
                                id="searchContratto"
                                class="form-input"
                                placeholder="🔍 Cerca contratto..."
                                value="${this.filtri.search}"
                                oninput="Contratti.applyFilters()"
                            />
                            <select class="filter-select" id="filtroStato" onchange="Contratti.applyFilters()">
                                <option value="">Tutti gli stati</option>
                                <option value="ATTIVO">Attivi</option>
                                <option value="SCADUTO">Scaduti</option>
                                <option value="IN_RINNOVO">In Rinnovo</option>
                                <option value="CESSATO">Cessati</option>
                                <option value="SOSPESO">Sospesi</option>
                            </select>
                            <select class="filter-select" id="filtroCliente" onchange="Contratti.applyFilters()">
                                <option value="">Tutti i clienti</option>
                                ${this.renderClientiOptions(clienti)}
                            </select>
                            <select class="filter-select" id="filtroTipologia" onchange="Contratti.applyFilters()">
                                <option value="">Tutte le tipologie</option>
                                <option value="SERVIZIO_APP">Servizio App</option>
                                <option value="MANUTENZIONE">Manutenzione</option>
                                <option value="CONSULENZA">Consulenza</option>
                                <option value="SERVIZI">Servizi</option>
                                <option value="ALTRO">Altro</option>
                            </select>
                            <select class="filter-select" id="filtroScadenza" onchange="Contratti.applyFilters()">
                                <option value="">Tutte le scadenze</option>
                                <option value="30">In scadenza 30gg</option>
                                <option value="60">In scadenza 60gg</option>
                                <option value="90">In scadenza 90gg</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Lista Contratti -->
                <div id="contrattiListContainer">
                    ${this.renderContrattiList(contrattiArricchiti)}
                </div>
            `;

            UI.hideLoading();
        } catch (error) {
            console.error('Errore rendering contratti:', error);
            UI.hideLoading();
            UI.showError('Errore nel caricamento dei contratti');
        }
    },

    renderAvvisoContrattiInScadenza(contratti) {
        const oggi = new Date();
        const tra30gg = new Date();
        tra30gg.setDate(oggi.getDate() + 30);

        const inScadenza = contratti.filter(c =>
            c.stato === 'ATTIVO' &&
            c.dataScadenza &&
            new Date(c.dataScadenza) <= tra30gg
        ).length;

        if (inScadenza === 0) return '';

        return `
            <div class="alert alert-warning" style="background: var(--giallo-avviso); border-left: 4px solid #FFA000; padding: 1rem; margin-bottom: 1.5rem; border-radius: 8px;">
                <strong><i class="fas fa-exclamation-triangle"></i> ${inScadenza} contratti in scadenza nei prossimi 30 giorni</strong>
                <p style="margin: 0.5rem 0 0 0; color: var(--grigio-700);">
                    Verifica i contratti in scadenza e procedi con i rinnovi
                </p>
            </div>
        `;
    },

    renderClientiOptions(clienti) {
        return clienti.map(c => `
            <option value="${c.id}">${c.ragioneSociale}</option>
        `).join('');
    },

    renderContrattiList(contratti) {
        let filtrati = contratti;

        // Applica filtri
        if (this.filtri.search) {
            const term = this.filtri.search.toLowerCase();
            filtrati = filtrati.filter(c =>
                c.numeroContratto?.toLowerCase().includes(term) ||
                c.oggetto?.toLowerCase().includes(term) ||
                c.clienteRagioneSociale?.toLowerCase().includes(term)
            );
        }

        if (this.filtri.stato) {
            filtrati = filtrati.filter(c => c.stato === this.filtri.stato);
        }

        if (this.filtri.clienteId) {
            filtrati = filtrati.filter(c => c.clienteId === this.filtri.clienteId);
        }

        if (this.filtri.tipologia) {
            filtrati = filtrati.filter(c => c.tipologia === this.filtri.tipologia);
        }

        if (this.filtri.scadenza) {
            const oggi = new Date();
            const limite = new Date();
            limite.setDate(oggi.getDate() + parseInt(this.filtri.scadenza));

            filtrati = filtrati.filter(c => {
                if (!c.dataScadenza) return false;
                const dataScadenza = new Date(c.dataScadenza);
                return c.stato === 'ATTIVO' && dataScadenza <= limite;
            });
        }

        if (filtrati.length === 0) {
            return `
                <div class="empty-state">
                    <i class="fas fa-file-contract"></i>
                    <h3>Nessun contratto trovato</h3>
                    <p>Nessun contratto corrisponde ai filtri selezionati</p>
                </div>
            `;
        }

        return `
            <div class="card">
                <div class="list-group">
                    ${filtrati.map(contratto => this.renderContrattoRow(contratto)).join('')}
                </div>
            </div>
        `;
    },

    renderContrattoRow(contratto) {
        const badgeClass = this.getStatoBadgeClass(contratto.stato);
        const giorniRimanenti = contratto.dataScadenza ? this.calcolaGiorniRimanenti(contratto.dataScadenza) : null;
        const isInScadenza = giorniRimanenti !== null && giorniRimanenti <= 30 && giorniRimanenti >= 0 && contratto.stato === 'ATTIVO';

        return `
            <div class="list-item" style="display: grid; grid-template-columns: 1fr auto auto; gap: 1rem; align-items: center;">
                <div onclick="UI.showPage('dettaglio-contratto', '${contratto.id}')" style="cursor: pointer;">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div style="width: 40px; height: 40px; background: var(--blu-100); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-file-contract" style="color: var(--blu-700);"></i>
                        </div>
                        <div style="flex: 1;">
                            <h3 style="font-size: 1rem; font-weight: 600; margin: 0; color: var(--grigio-900);">
                                ${contratto.numeroContratto || 'N/A'} ${isInScadenza ? '<i class="fas fa-exclamation-triangle" style="color: var(--rosso-errore);"></i>' : ''}
                            </h3>
                            <div style="font-size: 0.875rem; color: var(--grigio-500); margin-top: 0.25rem;">
                                ${contratto.clienteRagioneSociale} • ${contratto.oggetto || 'Senza oggetto'}
                            </div>
                            <div style="font-size: 0.75rem; color: var(--grigio-400); margin-top: 0.25rem;">
                                ${contratto.tipologia ? this.getTipologiaLabel(contratto.tipologia) : 'N/A'} •
                                Scadenza: ${contratto.dataScadenza ? DataService.formatDate(contratto.dataScadenza) : 'N/A'}
                                ${giorniRimanenti !== null && contratto.stato === 'ATTIVO' ? ` (${giorniRimanenti > 0 ? giorniRimanenti + ' giorni' : 'SCADUTO'})` : ''}
                            </div>
                        </div>
                    </div>
                </div>

                <div style="text-align: right;">
                    <div style="font-weight: 600; color: var(--blu-700); font-size: 1.1rem;">
                        ${contratto.importoAnnuale ? DataService.formatCurrency(contratto.importoAnnuale) : '-'}
                    </div>
                    <div style="font-size: 0.75rem; color: var(--grigio-400);">
                        ${contratto.periodicita || ''}
                    </div>
                </div>

                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <span class="badge ${badgeClass}">
                        ${contratto.stato?.replace('_', ' ') || 'N/A'}
                    </span>
                    <button
                        class="btn-icon"
                        onclick="event.stopPropagation(); Contratti.eliminaContratto('${contratto.id}', '${contratto.numeroContratto?.replace(/'/g, "\\'")}', '${contratto.clienteRagioneSociale?.replace(/'/g, "\\'")}')"
                        title="Elimina contratto"
                        style="color: var(--rosso-errore);"
                    >
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    },

    getStatoBadgeClass(stato) {
        const badgeMap = {
            'ATTIVO': 'badge-success',
            'SCADUTO': 'badge-warning',
            'CESSATO': 'badge-secondary',
            'IN_RINNOVO': 'badge-info',
            'SOSPESO': 'badge-danger'
        };
        return badgeMap[stato] || 'badge-secondary';
    },

    getTipologiaLabel(tipologia) {
        const labels = {
            'SERVIZIO_APP': 'Servizio App',
            'MANUTENZIONE': 'Manutenzione',
            'CONSULENZA': 'Consulenza',
            'SERVIZI': 'Servizi',
            'ALTRO': 'Altro'
        };
        return labels[tipologia] || tipologia;
    },

    calcolaGiorniRimanenti(dataScadenza) {
        if (!dataScadenza) return null;
        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);
        const scadenza = new Date(dataScadenza);
        scadenza.setHours(0, 0, 0, 0);
        return Math.ceil((scadenza - oggi) / (1000 * 60 * 60 * 24));
    },

    applyFilters() {
        this.filtri.search = document.getElementById('searchContratto')?.value || '';
        this.filtri.stato = document.getElementById('filtroStato')?.value || '';
        this.filtri.clienteId = document.getElementById('filtroCliente')?.value || '';
        this.filtri.tipologia = document.getElementById('filtroTipologia')?.value || '';
        this.filtri.scadenza = document.getElementById('filtroScadenza')?.value || '';
        this.render();
    },

    async exportData() {
        try {
            UI.showLoading();
            const _isAgenteExp = AuthService.canViewOnlyOwnData();
            const _agenteNomeExp = _isAgenteExp ? AuthService.getAgenteFilterName() : null;
            let contratti, clienti;

            if (_isAgenteExp && _agenteNomeExp) {
                const dati = await DataService.getDatiAgente(_agenteNomeExp);
                contratti = dati.contratti;
                clienti = dati.clienti;
            } else {
                [contratti, clienti] = await Promise.all([
                    DataService.getContratti(),
                    DataService.getClienti()
                ]);
            }

            // Arricchisci con ragione sociale cliente
            const contrattiConCliente = contratti.map(c => ({
                ...c,
                clienteRagioneSociale: clienti.find(cl => cl.id === c.clienteId || cl.clienteIdLegacy === c.clienteId)?.ragioneSociale || c.clienteRagioneSociale || 'Sconosciuto'
            }));

            UI.hideLoading();
            await ExportManager.exportContratti(contrattiConCliente);
        } catch (error) {
            UI.hideLoading();
            UI.showError('Errore export: ' + error.message);
        }
    },

    async eliminaContratto(contrattoId, numeroContratto, clienteRagioneSociale) {
        const conferma = confirm(
            `⚠️ ATTENZIONE!\n\nSei sicuro di voler eliminare il contratto "${numeroContratto}" di ${clienteRagioneSociale}?\n\n` +
            `Questa operazione eliminerà:\n` +
            `• Il contratto\n` +
            `• I collegamenti dalle fatture (le fatture rimarranno)\n\n` +
            `QUESTA OPERAZIONE NON PUÒ ESSERE ANNULLATA!`
        );

        if (!conferma) return;

        try {
            UI.showLoading();
            await DataService.deleteContratto(contrattoId);
            UI.hideLoading();
            UI.showSuccess(`Contratto "${numeroContratto}" eliminato`);
            await this.render();
        } catch (error) {
            console.error('Errore eliminazione contratto:', error);
            UI.hideLoading();
            UI.showError('Errore nell\'eliminazione: ' + error.message);
        }
    }
};

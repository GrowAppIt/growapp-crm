// Scadenzario Page
const Scadenzario = {
    filtri: {
        tipo: '',
        urgenza: ''
    },

    // Cache dati agente per evitare ricaricamenti
    _isAgente: false,
    _agenteNome: null,
    _datiAgente: null,

    async render() {
        UI.showLoading();

        try {
            // Verifica se è un agente
            this._isAgente = AuthService.canViewOnlyOwnData();
            this._agenteNome = this._isAgente ? AuthService.getAgenteFilterName() : null;

            let scadenze, contrattiInScadenza, fattureScadute;

            if (this._isAgente && this._agenteNome) {
                // Agente: carica dati filtrati per i propri clienti
                this._datiAgente = await DataService.getDatiAgente(this._agenteNome);
                const clienteIds = this._datiAgente.clienteIds;

                scadenze = this._datiAgente.scadenze;

                // Filtra contratti in scadenza tra quelli dell'agente
                const oggi = new Date();
                const tra60gg = new Date();
                tra60gg.setDate(oggi.getDate() + 60);
                contrattiInScadenza = this._datiAgente.contratti.filter(c =>
                    c.stato === 'ATTIVO' && c.dataScadenza && new Date(c.dataScadenza) <= tra60gg
                );

                // Filtra fatture scadute tra quelle dell'agente
                fattureScadute = this._datiAgente.fatture.filter(f =>
                    (f.statoPagamento === 'NON_PAGATA' || f.statoPagamento === 'PARZIALMENTE_PAGATA') &&
                    f.dataScadenza && new Date(f.dataScadenza) < oggi
                );
            } else {
                // Admin/altri ruoli: carica tutto
                [scadenze, contrattiInScadenza, fattureScadute] = await Promise.all([
                    DataService.getScadenze(),
                    DataService.getContrattiInScadenza(60),
                    DataService.getFattureScadute()
                ]);
            }

            // Filtra scadenze per tipo FATTURAZIONE
            const prossimeFatturazioni = scadenze.filter(s => s.tipo === 'FATTURAZIONE');

            // Ordina per urgenza
            const scadenzeOrdinate = this.ordinaPerUrgenza(scadenze);

            const mainContent = document.getElementById('mainContent');
            mainContent.innerHTML = `
                <div class="page-header mb-3">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
                        <div>
                            <h1 style="font-size: 2rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                                <i class="fas fa-calendar-alt"></i> Scadenzario
                            </h1>
                            <p style="color: var(--grigio-500);">
                                Gestione scadenze pagamenti, fatturazioni e rinnovi
                            </p>
                        </div>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn btn-secondary" onclick="Scadenzario.exportData()">
                                <i class="fas fa-file-excel"></i> Esporta Excel
                            </button>
                            <button class="btn btn-primary" onclick="FormsManager.showNuovaScadenza()">
                                <i class="fas fa-plus"></i> Nuova Scadenza
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Widget Scadenze Rapide -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
                    ${this.renderContrattiWidget(contrattiInScadenza)}
                    ${this.renderFattureScaduteWidget(fattureScadute)}
                    ${this.renderProssimeFatturazioniWidget(prossimeFatturazioni)}
                </div>

                <!-- Filtri -->
                <div class="filter-bar fade-in">
                    <div class="filter-group">
                        <select class="filter-select" id="filtroTipo" onchange="Scadenzario.applyFilters()">
                            <option value="">Tutti i tipi</option>
                            <option value="PAGAMENTO">Pagamenti</option>
                            <option value="FATTURAZIONE">Fatturazioni</option>
                            <option value="RINNOVO_CONTRATTO">Rinnovi Contratto</option>
                        </select>
                        <select class="filter-select" id="filtroUrgenza" onchange="Scadenzario.applyFilters()">
                            <option value="">Tutte le urgenze</option>
                            <option value="scaduto">Scadute</option>
                            <option value="critico">Critiche (≤7gg)</option>
                            <option value="imminente">Imminenti (≤30gg)</option>
                            <option value="normale">Normali (>30gg)</option>
                        </select>
                    </div>
                </div>

                <!-- Lista Scadenze -->
                <div id="scadenzeList">
                    ${this.renderScadenzeList(scadenzeOrdinate)}
                </div>
            `;

            UI.hideLoading();
        } catch (error) {
            console.error('Errore rendering scadenzario:', error);
            UI.hideLoading();
        }
    },

    renderScadenzeList(scadenze) {
        if (scadenze.length === 0) {
            return UI.createEmptyState({
                icon: 'calendar-check',
                title: 'Nessuna scadenza',
                subtitle: 'Non ci sono scadenze che corrispondono ai filtri selezionati'
            });
        }

        let html = '<div class="list-group fade-in">';

        for (const scadenza of scadenze) {
            const urgenza = DataService.getUrgenzaScadenza(scadenza.dataScadenza);
            const badgeClass = this.getUrgenzaBadgeClass(urgenza);
            const tipoIcon = this.getTipoIcon(scadenza.tipo);
            const urgenzaLabel = this.getUrgenzaLabel(urgenza, scadenza.giorniRimanenti);

            html += UI.createListItem({
                title: scadenza.clienteRagioneSociale,
                subtitle: `${this.getTipoLabel(scadenza.tipo)} • ${DataService.formatDate(scadenza.dataScadenza)} • ${scadenza.agente || 'N/A'}`,
                badge: urgenzaLabel,
                badgeClass,
                icon: tipoIcon,
                onclick: `UI.showPage('dettaglio-scadenza', '${scadenza.id}')`
            });
        }

        html += '</div>';
        return html;
    },

    ordinaPerUrgenza(scadenze) {
        const oggi = new Date();
        return scadenze.sort((a, b) => {
            const dataA = new Date(a.dataScadenza);
            const dataB = new Date(b.dataScadenza);
            return dataA - dataB;
        });
    },

    applyFilters() {
        this.filtri.tipo = document.getElementById('filtroTipo').value;
        this.filtri.urgenza = document.getElementById('filtroUrgenza').value;

        // Usa dati agente se disponibili, altrimenti carica tutto
        const scadenzePromise = (this._isAgente && this._agenteNome)
            ? DataService.getDatiAgente(this._agenteNome).then(d => d.scadenze)
            : DataService.getScadenze();

        scadenzePromise.then(scadenze => {
            let filtrate = scadenze;

            if (this.filtri.tipo) {
                filtrate = filtrate.filter(s => s.tipo === this.filtri.tipo);
            }

            if (this.filtri.urgenza) {
                filtrate = filtrate.filter(s => {
                    const urgenza = DataService.getUrgenzaScadenza(s.dataScadenza);
                    return urgenza === this.filtri.urgenza;
                });
            }

            const scadenzeOrdinate = this.ordinaPerUrgenza(filtrate);
            document.getElementById('scadenzeList').innerHTML = this.renderScadenzeList(scadenzeOrdinate);
        });
    },

    renderContrattiWidget(contratti) {
        const count = contratti.length;
        const urgenti = contratti.filter(c => {
            const giorni = this.calcolaGiorniRimanenti(c.dataScadenzaContratto);
            return giorni <= 30;
        }).length;

        return `
            <div class="card fade-in" style="cursor: pointer; transition: transform 0.2s;"
                 onclick="Scadenzario.mostraContratti()"
                 onmouseover="this.style.transform='translateY(-4px)'"
                 onmouseout="this.style.transform='translateY(0)'">
                <div style="padding: 1.5rem;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                        <div style="background: linear-gradient(135deg, #2E6DA8 0%, #145284 100%); width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-file-contract" style="color: white; font-size: 1.25rem;"></i>
                        </div>
                        ${urgenti > 0 ? `<span class="badge badge-warning">${urgenti} urgenti</span>` : ''}
                    </div>
                    <h3 style="font-size: 0.875rem; font-weight: 600; color: var(--grigio-500); margin-bottom: 0.5rem; text-transform: uppercase;">
                        Contratti da Rinnovare
                    </h3>
                    <p style="font-size: 2rem; font-weight: 700; color: var(--blu-700); margin: 0;">
                        ${count}
                    </p>
                    <p style="font-size: 0.75rem; color: var(--grigio-500); margin-top: 0.5rem;">
                        Prossimi 60 giorni
                    </p>
                </div>
            </div>
        `;
    },

    renderFattureScaduteWidget(fatture) {
        const count = fatture.length;
        const totale = fatture.reduce((sum, f) => sum + (f.importoTotale || 0), 0);

        return `
            <div class="card fade-in" style="cursor: pointer; transition: transform 0.2s;"
                 onclick="Scadenzario.mostraFattureScadute()"
                 onmouseover="this.style.transform='translateY(-4px)'"
                 onmouseout="this.style.transform='translateY(0)'">
                <div style="padding: 1.5rem;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                        <div style="background: linear-gradient(135deg, #D32F2F 0%, #B71C1C 100%); width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-file-invoice-dollar" style="color: white; font-size: 1.25rem;"></i>
                        </div>
                        ${count > 0 ? `<span class="badge badge-danger">SCADUTE</span>` : ''}
                    </div>
                    <h3 style="font-size: 0.875rem; font-weight: 600; color: var(--grigio-500); margin-bottom: 0.5rem; text-transform: uppercase;">
                        Fatture da Incassare
                    </h3>
                    <p style="font-size: 2rem; font-weight: 700; color: #D32F2F; margin: 0;">
                        ${count}
                    </p>
                    <p style="font-size: 0.75rem; color: var(--grigio-500); margin-top: 0.5rem;">
                        Totale: ${DataService.formatCurrency(totale)}
                    </p>
                </div>
            </div>
        `;
    },

    renderProssimeFatturazioniWidget(fatturazioni) {
        const count = fatturazioni.length;
        const prossime30gg = fatturazioni.filter(f => {
            const giorni = this.calcolaGiorniRimanenti(f.dataScadenza);
            return giorni <= 30 && giorni >= 0;
        }).length;

        return `
            <div class="card fade-in" style="cursor: pointer; transition: transform 0.2s;"
                 onclick="Scadenzario.mostraFatturazioni()"
                 onmouseover="this.style.transform='translateY(-4px)'"
                 onmouseout="this.style.transform='translateY(0)'">
                <div style="padding: 1.5rem;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                        <div style="background: linear-gradient(135deg, #3CA434 0%, #2A752F 100%); width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-file-invoice" style="color: white; font-size: 1.25rem;"></i>
                        </div>
                        ${prossime30gg > 0 ? `<span class="badge badge-info">${prossime30gg} prossime</span>` : ''}
                    </div>
                    <h3 style="font-size: 0.875rem; font-weight: 600; color: var(--grigio-500); margin-bottom: 0.5rem; text-transform: uppercase;">
                        Fatture da Emettere
                    </h3>
                    <p style="font-size: 2rem; font-weight: 700; color: var(--verde-700); margin: 0;">
                        ${count}
                    </p>
                    <p style="font-size: 0.75rem; color: var(--grigio-500); margin-top: 0.5rem;">
                        ${prossime30gg} nei prossimi 30 giorni
                    </p>
                </div>
            </div>
        `;
    },

    calcolaGiorniRimanenti(dataScadenza) {
        if (!dataScadenza) return 0;
        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);
        const scadenza = new Date(dataScadenza);
        scadenza.setHours(0, 0, 0, 0);
        const diff = Math.ceil((scadenza - oggi) / (1000 * 60 * 60 * 24));
        return diff;
    },

    async mostraContratti() {
        UI.showLoading();

        let contratti, clienti;

        if (this._isAgente && this._agenteNome) {
            const datiAgente = await DataService.getDatiAgente(this._agenteNome);
            clienti = datiAgente.clienti;
            const oggi = new Date();
            const tra60gg = new Date();
            tra60gg.setDate(oggi.getDate() + 60);
            contratti = datiAgente.contratti.filter(c =>
                c.stato === 'ATTIVO' && c.dataScadenza && new Date(c.dataScadenza) <= tra60gg
            );
        } else {
            [contratti, clienti] = await Promise.all([
                DataService.getContrattiInScadenza(60),
                DataService.getClienti()
            ]);
        }

        // Arricchisci contratti con dati cliente
        const contrattiArricchiti = contratti.map(contratto => {
            const cliente = clienti.find(c => c.id === contratto.clienteId);
            return {
                ...contratto,
                ragioneSociale: cliente?.ragioneSociale || contratto.ragioneSociale || 'Cliente non trovato',
                agente: cliente?.agente || contratto.agente || '',
                provincia: cliente?.provincia || contratto.provincia || ''
            };
        });

        const mainContent = document.getElementById('mainContent');
        const listHtml = this.renderContrattiList(contrattiArricchiti);

        mainContent.innerHTML = `
            <div class="page-header mb-3">
                <button class="btn btn-secondary btn-sm" onclick="Scadenzario.render()" style="margin-bottom: 1rem;">
                    <i class="fas fa-arrow-left"></i> Torna allo scadenzario
                </button>
                <h1 style="font-size: 2rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                    <i class="fas fa-file-contract"></i> Contratti da Rinnovare
                </h1>
                <p style="color: var(--grigio-500);">
                    Contratti in scadenza nei prossimi 60 giorni
                </p>
            </div>
            ${listHtml}
        `;
        UI.hideLoading();
    },

    async mostraFattureScadute() {
        UI.showLoading();
        let fatture;

        if (this._isAgente && this._agenteNome) {
            const datiAgente = await DataService.getDatiAgente(this._agenteNome);
            const oggi = new Date();
            fatture = datiAgente.fatture.filter(f =>
                (f.statoPagamento === 'NON_PAGATA' || f.statoPagamento === 'PARZIALMENTE_PAGATA') &&
                f.dataScadenza && new Date(f.dataScadenza) < oggi
            );
        } else {
            fatture = await DataService.getFattureScadute();
        }

        const mainContent = document.getElementById('mainContent');
        const listHtml = this.renderFattureScaduteList(fatture);

        mainContent.innerHTML = `
            <div class="page-header mb-3">
                <button class="btn btn-secondary btn-sm" onclick="Scadenzario.render()" style="margin-bottom: 1rem;">
                    <i class="fas fa-arrow-left"></i> Torna allo scadenzario
                </button>
                <h1 style="font-size: 2rem; font-weight: 700; color: #D32F2F; margin-bottom: 0.5rem;">
                    <i class="fas fa-file-invoice-dollar"></i> Fatture Scadute da Incassare
                </h1>
                <p style="color: var(--grigio-500);">
                    Fatture non pagate con scadenza superata
                </p>
            </div>
            ${listHtml}
        `;
        UI.hideLoading();
    },

    async mostraFatturazioni() {
        UI.showLoading();
        let scadenze;

        if (this._isAgente && this._agenteNome) {
            const datiAgente = await DataService.getDatiAgente(this._agenteNome);
            scadenze = datiAgente.scadenze;
        } else {
            scadenze = await DataService.getScadenze();
        }

        const fatturazioni = scadenze.filter(s => s.tipo === 'FATTURAZIONE');
        const ordinate = this.ordinaPerUrgenza(fatturazioni);

        const mainContent = document.getElementById('mainContent');
        const listHtml = this.renderScadenzeList(ordinate);

        mainContent.innerHTML = `
            <div class="page-header mb-3">
                <button class="btn btn-secondary btn-sm" onclick="Scadenzario.render()" style="margin-bottom: 1rem;">
                    <i class="fas fa-arrow-left"></i> Torna allo scadenzario
                </button>
                <h1 style="font-size: 2rem; font-weight: 700; color: var(--verde-700); margin-bottom: 0.5rem;">
                    <i class="fas fa-file-invoice"></i> Prossime Fatture da Emettere
                </h1>
                <p style="color: var(--grigio-500);">
                    Scadenze fatturazioni ordinate cronologicamente
                </p>
            </div>
            ${listHtml}
        `;
        UI.hideLoading();
    },

    renderContrattiList(contratti) {
        if (contratti.length === 0) {
            return UI.createEmptyState({
                icon: 'file-contract',
                title: 'Nessun contratto in scadenza',
                subtitle: 'Non ci sono contratti da rinnovare nei prossimi 60 giorni'
            });
        }

        let html = '<div class="list-group fade-in">';

        for (const contratto of contratti) {
            const giorni = this.calcolaGiorniRimanenti(contratto.dataScadenza);
            const urgenza = giorni <= 7 ? 'critico' : giorni <= 30 ? 'imminente' : 'normale';
            const badgeClass = this.getUrgenzaBadgeClass(urgenza);

            html += UI.createListItem({
                title: contratto.ragioneSociale,
                subtitle: `Scadenza: ${DataService.formatDate(contratto.dataScadenza)} • ${contratto.agente || 'N/A'} • ${contratto.provincia || 'N/A'}`,
                badge: `${giorni} GIORNI`,
                badgeClass,
                icon: 'file-contract',
                onclick: `UI.showPage('dettaglio-contratto', '${contratto.id}')`
            });
        }

        html += '</div>';
        return html;
    },

    renderFattureScaduteList(fatture) {
        if (fatture.length === 0) {
            return UI.createEmptyState({
                icon: 'check-circle',
                title: 'Nessuna fattura scaduta',
                subtitle: 'Tutte le fatture sono state incassate o sono in scadenza futura'
            });
        }

        let html = '<div class="list-group fade-in">';

        for (const fattura of fatture) {
            const giorni = Math.abs(this.calcolaGiorniRimanenti(fattura.dataScadenza));
            const clienteInfo = fattura.clienteRagioneSociale || `Cliente: ${fattura.clienteId?.substring(0,8)}...`;

            html += UI.createListItem({
                title: fattura.numeroFatturaCompleto,
                subtitle: `${clienteInfo} • Scaduta da ${giorni} giorni • ${DataService.formatCurrency(fattura.importoTotale)}`,
                badge: 'SCADUTA',
                badgeClass: 'badge-danger',
                icon: 'file-invoice-dollar',
                onclick: `UI.showPage('dettaglio-fattura', '${fattura.id}')`
            });
        }

        html += '</div>';
        return html;
    },

    getTipoIcon(tipo) {
        const icons = {
            'PAGAMENTO': 'file-invoice-dollar',
            'FATTURAZIONE': 'file-invoice',
            'RINNOVO_CONTRATTO': 'file-contract'
        };
        return icons[tipo] || 'calendar';
    },

    getTipoLabel(tipo) {
        const labels = {
            'PAGAMENTO': 'Pagamento',
            'FATTURAZIONE': 'Fatturazione',
            'RINNOVO_CONTRATTO': 'Rinnovo Contratto'
        };
        return labels[tipo] || tipo;
    },

    getUrgenzaBadgeClass(urgenza) {
        const classes = {
            'scaduto': 'badge-danger',
            'critico': 'badge-warning',
            'imminente': 'badge-info',
            'normale': 'badge-success'
        };
        return classes[urgenza] || 'badge-secondary';
    },

    getUrgenzaLabel(urgenza, giorni) {
        if (urgenza === 'scaduto') return 'SCADUTO';
        if (urgenza === 'critico') return `${giorni}gg`;
        if (urgenza === 'imminente') return `${giorni}gg`;
        return `${giorni}gg`;
    },

    async exportData() {
        let scadenze;

        if (this._isAgente && this._agenteNome) {
            const datiAgente = await DataService.getDatiAgente(this._agenteNome);
            scadenze = datiAgente.scadenze;
        } else {
            scadenze = await DataService.getScadenze();
        }

        let filtrate = scadenze;

        if (this.filtri.tipo) {
            filtrate = filtrate.filter(s => s.tipo === this.filtri.tipo);
        }
        if (this.filtri.urgenza) {
            filtrate = filtrate.filter(s => {
                const urgenza = DataService.getUrgenzaScadenza(s.dataScadenza);
                return urgenza === this.filtri.urgenza;
            });
        }

        await ExportManager.exportScadenze(filtrate);
    }
};

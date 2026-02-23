// Scadenzario Page — Vista calcolata da Contratti e Fatture
const Scadenzario = {
    filtri: {
        tipo: '',
        urgenza: ''
    },

    // Cache dati
    _isAgente: false,
    _agenteNome: null,
    _datiCalcolati: null,

    async render() {
        UI.showLoading();

        try {
            // Verifica se è un agente
            this._isAgente = AuthService.canViewOnlyOwnData();
            this._agenteNome = this._isAgente ? AuthService.getAgenteFilterName() : null;

            // Calcola scadenzario da dati reali
            const opzioni = {};
            if (this._isAgente && this._agenteNome) {
                opzioni.agente = this._agenteNome;
            }
            this._datiCalcolati = await DataService.getScadenzeCompute(opzioni);

            const { contrattiDaRinnovare, fattureDaEmettere, fattureDaIncassare, tutteLeScadenze } = this._datiCalcolati;

            const mainContent = document.getElementById('mainContent');
            mainContent.innerHTML = `
                <div class="page-header mb-3">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
                        <div>
                            <h1 style="font-size: 2rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                                <i class="fas fa-calendar-alt"></i> Scadenzario
                            </h1>
                            <p style="color: var(--grigio-500);">
                                Rinnovi contratti, fatture da emettere e da incassare
                            </p>
                        </div>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn btn-secondary" onclick="Scadenzario.exportData()">
                                <i class="fas fa-file-excel"></i> Esporta Excel
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Widget Scadenze Rapide -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
                    ${this.renderContrattiWidget(contrattiDaRinnovare)}
                    ${this.renderFattureScaduteWidget(fattureDaIncassare)}
                    ${this.renderFattureDaEmettereWidget(fattureDaEmettere)}
                </div>

                <!-- Filtri -->
                <div class="filter-bar fade-in">
                    <div class="filter-group">
                        <select class="filter-select" id="filtroTipo" onchange="Scadenzario.applyFilters()">
                            <option value="">Tutti i tipi</option>
                            <option value="CONTRATTO_RINNOVO">Contratti da Rinnovare</option>
                            <option value="FATTURA_INCASSO">Fatture da Incassare</option>
                            <option value="FATTURA_EMISSIONE">Fatture da Emettere</option>
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
                    ${this.renderScadenzeList(tutteLeScadenze)}
                </div>
            `;

            UI.hideLoading();
        } catch (error) {
            console.error('Errore rendering scadenzario:', error);
            UI.hideLoading();
        }
    },

    renderScadenzeList(scadenze) {
        if (!scadenze || scadenze.length === 0) {
            return UI.createEmptyState({
                icon: 'calendar-check',
                title: 'Nessuna scadenza',
                subtitle: 'Non ci sono scadenze che corrispondono ai filtri selezionati'
            });
        }

        let html = '<div class="list-group fade-in">';

        for (const item of scadenze) {
            const urgenza = DataService.getUrgenzaScadenza(item.dataScadenza);
            const badgeClass = this.getUrgenzaBadgeClass(urgenza);
            const giorni = this.calcolaGiorniRimanenti(item.dataScadenza);
            const urgenzaLabel = this.getUrgenzaLabel(urgenza, giorni);
            const tipoIcon = this.getTipoIcon(item.tipo);
            const tipoLabel = this.getTipoLabel(item.tipo);

            // Determina dove navigare al click
            let onclick = '';
            if (item.tipo === 'CONTRATTO_RINNOVO') {
                onclick = `UI.showPage('dettaglio-contratto', '${item.id}')`;
            } else if (item.tipo === 'FATTURA_INCASSO') {
                onclick = `UI.showPage('dettaglio-fattura', '${item.id}')`;
            } else if (item.tipo === 'FATTURA_EMISSIONE' && item.contrattoId) {
                onclick = `UI.showPage('dettaglio-contratto', '${item.contrattoId}')`;
            }

            // Costruisci sottotitolo
            let subtitle = tipoLabel;
            if (item.dataScadenza) subtitle += ` • ${DataService.formatDate(item.dataScadenza)}`;
            if (item.agente) subtitle += ` • ${item.agente}`;
            if (item.importo || item.importoTotale) {
                subtitle += ` • ${DataService.formatCurrency(item.importo || item.importoTotale)}`;
            }

            html += UI.createListItem({
                title: item.clienteRagioneSociale || item.descrizione || 'N/A',
                subtitle: subtitle,
                badge: urgenzaLabel,
                badgeClass,
                icon: tipoIcon,
                onclick: onclick
            });
        }

        html += '</div>';
        return html;
    },

    applyFilters() {
        this.filtri.tipo = document.getElementById('filtroTipo').value;
        this.filtri.urgenza = document.getElementById('filtroUrgenza').value;

        if (!this._datiCalcolati) return;

        let filtrate = [...this._datiCalcolati.tutteLeScadenze];

        if (this.filtri.tipo) {
            filtrate = filtrate.filter(s => s.tipo === this.filtri.tipo);
        }

        if (this.filtri.urgenza) {
            filtrate = filtrate.filter(s => {
                const urgenza = DataService.getUrgenzaScadenza(s.dataScadenza);
                return urgenza === this.filtri.urgenza;
            });
        }

        document.getElementById('scadenzeList').innerHTML = this.renderScadenzeList(filtrate);
    },

    // =========================================================================
    // WIDGET CARDS
    // =========================================================================

    renderContrattiWidget(contratti) {
        const count = contratti.length;
        const urgenti = contratti.filter(c => {
            const giorni = this.calcolaGiorniRimanenti(c.dataScadenza);
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
        const totale = fatture.reduce((sum, f) => sum + (parseFloat(f.importoTotale) || 0), 0);

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
                        ${count > 0 ? `<span class="badge badge-danger">${count} da incassare</span>` : ''}
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

    renderFattureDaEmettereWidget(fatturazioni) {
        const count = fatturazioni.length;
        const prossime30gg = fatturazioni.filter(f => {
            const giorni = this.calcolaGiorniRimanenti(f.dataScadenza);
            return giorni <= 30 && giorni >= 0;
        }).length;
        const scadute = fatturazioni.filter(f => this.calcolaGiorniRimanenti(f.dataScadenza) < 0).length;

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
                        ${scadute > 0 ? `<span class="badge badge-danger">${scadute} in ritardo</span>` : prossime30gg > 0 ? `<span class="badge badge-info">${prossime30gg} prossime</span>` : ''}
                    </div>
                    <h3 style="font-size: 0.875rem; font-weight: 600; color: var(--grigio-500); margin-bottom: 0.5rem; text-transform: uppercase;">
                        Fatture da Emettere
                    </h3>
                    <p style="font-size: 2rem; font-weight: 700; color: var(--verde-700, #3CA434); margin: 0;">
                        ${count}
                    </p>
                    <p style="font-size: 0.75rem; color: var(--grigio-500); margin-top: 0.5rem;">
                        ${prossime30gg} nei prossimi 30 giorni
                    </p>
                </div>
            </div>
        `;
    },

    // =========================================================================
    // VISTE DETTAGLIO (click su widget)
    // =========================================================================

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

        // Ricalcola i dati se non sono in cache
        if (!this._datiCalcolati) {
            const opzioni = {};
            if (this._isAgente && this._agenteNome) opzioni.agente = this._agenteNome;
            this._datiCalcolati = await DataService.getScadenzeCompute(opzioni);
        }

        const fatture = this._datiCalcolati.fattureDaIncassare;

        const mainContent = document.getElementById('mainContent');
        const listHtml = this.renderFattureScaduteList(fatture);

        mainContent.innerHTML = `
            <div class="page-header mb-3">
                <button class="btn btn-secondary btn-sm" onclick="Scadenzario.render()" style="margin-bottom: 1rem;">
                    <i class="fas fa-arrow-left"></i> Torna allo scadenzario
                </button>
                <h1 style="font-size: 2rem; font-weight: 700; color: #D32F2F; margin-bottom: 0.5rem;">
                    <i class="fas fa-file-invoice-dollar"></i> Fatture da Incassare
                </h1>
                <p style="color: var(--grigio-500);">
                    Fatture non pagate o parzialmente pagate
                </p>
            </div>
            ${listHtml}
        `;
        UI.hideLoading();
    },

    async mostraFatturazioni() {
        UI.showLoading();

        // Ricalcola i dati se non sono in cache
        if (!this._datiCalcolati) {
            const opzioni = {};
            if (this._isAgente && this._agenteNome) opzioni.agente = this._agenteNome;
            this._datiCalcolati = await DataService.getScadenzeCompute(opzioni);
        }

        const fatturazioni = this._datiCalcolati.fattureDaEmettere;

        const mainContent = document.getElementById('mainContent');

        let listHtml = '';
        if (fatturazioni.length === 0) {
            listHtml = UI.createEmptyState({
                icon: 'check-circle',
                title: 'Tutte le fatture sono state emesse',
                subtitle: 'Non ci sono periodi di fatturazione in sospeso'
            });
        } else {
            listHtml = '<div class="list-group fade-in">';
            for (const item of fatturazioni) {
                const giorni = this.calcolaGiorniRimanenti(item.dataScadenza);
                const urgenza = DataService.getUrgenzaScadenza(item.dataScadenza);
                const badgeClass = this.getUrgenzaBadgeClass(urgenza);

                listHtml += UI.createListItem({
                    title: item.clienteRagioneSociale || 'N/A',
                    subtitle: `${item.descrizione} • ${DataService.formatDate(item.dataScadenza)} • ${DataService.formatCurrency(item.importo)}`,
                    badge: giorni < 0 ? `${Math.abs(giorni)}gg IN RITARDO` : `${giorni}gg`,
                    badgeClass,
                    icon: 'file-invoice',
                    onclick: item.contrattoId ? `UI.showPage('dettaglio-contratto', '${item.contrattoId}')` : ''
                });
            }
            listHtml += '</div>';
        }

        mainContent.innerHTML = `
            <div class="page-header mb-3">
                <button class="btn btn-secondary btn-sm" onclick="Scadenzario.render()" style="margin-bottom: 1rem;">
                    <i class="fas fa-arrow-left"></i> Torna allo scadenzario
                </button>
                <h1 style="font-size: 2rem; font-weight: 700; color: var(--verde-700, #3CA434); margin-bottom: 0.5rem;">
                    <i class="fas fa-file-invoice"></i> Fatture da Emettere
                </h1>
                <p style="color: var(--grigio-500);">
                    Periodi di fatturazione senza fattura emessa
                </p>
            </div>
            ${listHtml}
        `;
        UI.hideLoading();
    },

    // =========================================================================
    // LISTE DETTAGLIO
    // =========================================================================

    renderContrattiList(contratti) {
        if (contratti.length === 0) {
            return UI.createEmptyState({
                icon: 'file-contract',
                title: 'Nessun contratto in scadenza',
                subtitle: 'Non ci sono contratti da rinnovare nei prossimi 60 giorni'
            });
        }

        let html = '<div class="list-group fade-in">';

        const _sysScad = SettingsService.getSystemSettingsSync();
        for (const contratto of contratti) {
            const giorni = this.calcolaGiorniRimanenti(contratto.dataScadenza);
            const urgenza = giorni <= (_sysScad.sogliaCritico || 7) ? 'critico' : giorni <= (_sysScad.sogliaImminente || 30) ? 'imminente' : 'normale';
            const badgeClass = this.getUrgenzaBadgeClass(urgenza);

            html += UI.createListItem({
                title: contratto.ragioneSociale,
                subtitle: `Contratto ${contratto.numeroContratto || ''} • Scadenza: ${DataService.formatDate(contratto.dataScadenza)} • ${contratto.agente || 'N/A'} • ${contratto.provincia || 'N/A'}`,
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
                title: 'Nessuna fattura da incassare',
                subtitle: 'Tutte le fatture sono state pagate'
            });
        }

        let html = '<div class="list-group fade-in">';

        for (const fattura of fatture) {
            const giorni = this.calcolaGiorniRimanenti(fattura.dataScadenza);
            const clienteInfo = fattura.clienteRagioneSociale || `Cliente: ${fattura.clienteId?.substring(0,8)}...`;

            const _sysF = SettingsService.getSystemSettingsSync();
            let badgeLabel, badgeClass;
            if (giorni < 0) {
                badgeLabel = `${Math.abs(giorni)}gg SCADUTA`;
                badgeClass = 'badge-danger';
            } else if (giorni <= (_sysF.sogliaCritico || 7)) {
                badgeLabel = `${giorni}gg`;
                badgeClass = 'badge-warning';
            } else {
                badgeLabel = `${giorni}gg`;
                badgeClass = 'badge-info';
            }

            const stato = fattura.statoPagamento === 'PARZIALMENTE_PAGATA' ? ' (parz.)' : '';

            html += UI.createListItem({
                title: (fattura.numeroFatturaCompleto || fattura.numeroFattura || 'Fattura') + stato,
                subtitle: `${clienteInfo} • Scadenza: ${DataService.formatDate(fattura.dataScadenza)} • ${DataService.formatCurrency(fattura.importoTotale)}`,
                badge: badgeLabel,
                badgeClass,
                icon: 'file-invoice-dollar',
                onclick: `UI.showPage('dettaglio-fattura', '${fattura.id}')`
            });
        }

        html += '</div>';
        return html;
    },

    // =========================================================================
    // UTILITÀ
    // =========================================================================

    calcolaGiorniRimanenti(dataScadenza) {
        if (!dataScadenza) return 0;
        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);
        const scadenza = new Date(dataScadenza);
        scadenza.setHours(0, 0, 0, 0);
        return Math.ceil((scadenza - oggi) / (1000 * 60 * 60 * 24));
    },

    getTipoIcon(tipo) {
        const icons = {
            'CONTRATTO_RINNOVO': 'file-contract',
            'FATTURA_INCASSO': 'file-invoice-dollar',
            'FATTURA_EMISSIONE': 'file-invoice'
        };
        return icons[tipo] || 'calendar';
    },

    getTipoLabel(tipo) {
        const labels = {
            'CONTRATTO_RINNOVO': 'Rinnovo Contratto',
            'FATTURA_INCASSO': 'Fattura da Incassare',
            'FATTURA_EMISSIONE': 'Fattura da Emettere'
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
        if (urgenza === 'scaduto') return `${Math.abs(giorni)}gg SCADUTO`;
        return `${giorni}gg`;
    },

    async exportData() {
        if (!this._datiCalcolati) {
            const opzioni = {};
            if (this._isAgente && this._agenteNome) opzioni.agente = this._agenteNome;
            this._datiCalcolati = await DataService.getScadenzeCompute(opzioni);
        }

        let filtrate = [...this._datiCalcolati.tutteLeScadenze];

        if (this.filtri.tipo) {
            filtrate = filtrate.filter(s => s.tipo === this.filtri.tipo);
        }
        if (this.filtri.urgenza) {
            filtrate = filtrate.filter(s => {
                const urgenza = DataService.getUrgenzaScadenza(s.dataScadenza);
                return urgenza === this.filtri.urgenza;
            });
        }

        // Adatta i dati al formato di ExportManager
        const scadenzeExport = filtrate.map(s => ({
            tipo: this.getTipoLabel(s.tipo),
            clienteRagioneSociale: s.clienteRagioneSociale || '',
            descrizione: s.descrizione || '',
            dataScadenza: s.dataScadenza || '',
            importo: s.importo || s.importoTotale || 0,
            agente: s.agente || '',
            urgenza: DataService.getUrgenzaScadenza(s.dataScadenza)
        }));

        await ExportManager.exportScadenze(scadenzeExport);
    }
};

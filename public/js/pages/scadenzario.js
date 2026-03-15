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

            // Verifica automatica stati contratti (scaduti + rinnovi taciti)
            await DataService.verificaEAggiornaStatiContratti();

            // Calcola scadenzario da dati reali
            const opzioni = {};
            if (this._isAgente && this._agenteNome) {
                opzioni.agente = this._agenteNome;
            }
            this._datiCalcolati = await DataService.getScadenzeCompute(opzioni);

            const { contrattiDaRinnovare, fattureDaEmettere, fattureDaIncassare, tutteLeScadenze } = this._datiCalcolati;

            // Carica contratti per le card "Scaduti" e "In Scadenza 60gg"
            let _tuttiContratti;
            if (this._isAgente && this._agenteNome) {
                const datiAgente = await DataService.getDatiAgente(this._agenteNome);
                _tuttiContratti = datiAgente.contratti;
            } else {
                _tuttiContratti = await DataService.getContratti();
            }
            const oggi = new Date();
            oggi.setHours(0, 0, 0, 0);
            const tra60gg = new Date(oggi);
            tra60gg.setDate(tra60gg.getDate() + 60);

            this._contrattiScaduti = _tuttiContratti.filter(c => c.stato === 'SCADUTO')
                .sort((a, b) => new Date(a.dataScadenza || 0) - new Date(b.dataScadenza || 0));
            this._contrattiInScadenza = _tuttiContratti.filter(c =>
                c.stato === 'ATTIVO' && c.dataScadenza && new Date(c.dataScadenza) <= tra60gg
            ).sort((a, b) => new Date(a.dataScadenza) - new Date(b.dataScadenza));

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

                <!-- Card Contratti Scaduti + In Scadenza -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 1.5rem; margin-bottom: 1.5rem;">
                    ${this.renderContrattiScadutiWidget(this._contrattiScaduti)}
                    ${this.renderContrattiInScadenzaWidget(this._contrattiInScadenza)}
                </div>

                <!-- Widget Scadenze Rapide -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
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
                            <option value="critico">Critiche (≤1gg)</option>
                            <option value="imminente">Imminenti (≤3gg)</option>
                            <option value="normale">Normali (>3gg)</option>
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

    // Helper: calcola importo residuo (saldo dopo acconti per parzialmente pagate)
    _calcolaImportoResiduo(f) {
        if (f.statoPagamento === 'PARZIALMENTE_PAGATA') {
            const totAcconti = (f.acconti || []).reduce((s, a) => s + (a.importo || 0), 0);
            return Math.max(0, (f.importoTotale || 0) - totAcconti);
        }
        return f.importoTotale || 0;
    },

    // Helper: verifica credito sospeso
    _isCreditoSospeso(f) {
        return f.creditoSospeso === true || f.creditoSospeso === 'true';
    },

    renderFattureScaduteWidget(fatture) {
        // Depura le fatture con credito sospeso
        const fattureNormali = fatture.filter(f => !this._isCreditoSospeso(f));
        const fattureSospese = fatture.filter(f => this._isCreditoSospeso(f));
        const count = fattureNormali.length;
        const totale = fattureNormali.reduce((sum, f) => sum + this._calcolaImportoResiduo(f), 0);
        const countSospese = fattureSospese.length;

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
                        Totale: ${DataService.formatCurrency(totale)}${countSospese > 0 ? ` <span style="color:#FF9800;">(+ ${countSospese} in sospeso)</span>` : ''}
                    </p>
                </div>
            </div>
        `;
    },

    renderFattureDaEmettereWidget(fatturazioni) {
        // Filtra solo quelle entro fine mese corrente (+ arretrate)
        const oggi = new Date();
        const fineMese = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 0, 23, 59, 59);
        const entroFineMese = fatturazioni.filter(f => {
            if (!f.dataScadenza) return false;
            return new Date(f.dataScadenza) <= fineMese;
        });
        const count = entroFineMese.length;
        const scadute = entroFineMese.filter(f => this.calcolaGiorniRimanenti(f.dataScadenza) < 0).length;
        const totale = entroFineMese.reduce((sum, f) => sum + (parseFloat(f.importo) || 0), 0);
        const nomeMese = oggi.toLocaleDateString('it-IT', { month: 'long' });

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
                        ${scadute > 0 ? `<span class="badge badge-danger">${scadute} in ritardo</span>` : count > 0 ? `<span class="badge badge-info">${count} da emettere</span>` : ''}
                    </div>
                    <h3 style="font-size: 0.875rem; font-weight: 600; color: var(--grigio-500); margin-bottom: 0.5rem; text-transform: uppercase;">
                        Fatture da Emettere
                    </h3>
                    <p style="font-size: 2rem; font-weight: 700; color: var(--verde-700, #3CA434); margin: 0;">
                        ${count}
                    </p>
                    <p style="font-size: 0.75rem; color: var(--grigio-500); margin-top: 0.5rem;">
                        Entro fine ${nomeMese}${totale > 0 ? ` — ${DataService.formatCurrency(totale)}` : ''}
                    </p>
                </div>
            </div>
        `;
    },

    // =========================================================================
    // WIDGET: CONTRATTI SCADUTI + IN SCADENZA 60GG
    // =========================================================================

    renderContrattiScadutiWidget(contratti) {
        const count = contratti.length;
        return `
            <div class="card fade-in" style="cursor: pointer; transition: transform 0.2s; ${count > 0 ? 'border-left: 4px solid #D32F2F;' : ''}"
                 onclick="Scadenzario.mostraContrattiScaduti()"
                 onmouseover="this.style.transform='translateY(-4px)'"
                 onmouseout="this.style.transform='translateY(0)'">
                <div style="padding: 1.5rem;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                        <div style="background: linear-gradient(135deg, #D32F2F 0%, #B71C1C 100%); width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-exclamation-circle" style="color: white; font-size: 1.25rem;"></i>
                        </div>
                        ${count > 0 ? `<span class="badge badge-danger">${count} da gestire</span>` : '<span class="badge badge-success">OK</span>'}
                    </div>
                    <h3 style="font-size: 0.875rem; font-weight: 600; color: var(--grigio-500); margin-bottom: 0.5rem; text-transform: uppercase;">
                        Contratti Scaduti
                    </h3>
                    <p style="font-size: 2rem; font-weight: 700; color: ${count > 0 ? '#D32F2F' : 'var(--verde-700)'}; margin: 0;">
                        ${count}
                    </p>
                    <p style="font-size: 0.75rem; color: var(--grigio-500); margin-top: 0.5rem;">
                        ${count > 0 ? 'Da rinnovare o cessare' : 'Nessun contratto scaduto'}
                    </p>
                </div>
            </div>
        `;
    },

    renderContrattiInScadenzaWidget(contratti) {
        const count = contratti.length;
        const urgenti = contratti.filter(c => {
            const giorni = this.calcolaGiorniRimanenti(c.dataScadenza);
            return giorni <= 30;
        }).length;

        return `
            <div class="card fade-in" style="cursor: pointer; transition: transform 0.2s; ${urgenti > 0 ? 'border-left: 4px solid #FFCC00;' : ''}"
                 onclick="Scadenzario.mostraContrattiInScadenza()"
                 onmouseover="this.style.transform='translateY(-4px)'"
                 onmouseout="this.style.transform='translateY(0)'">
                <div style="padding: 1.5rem;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                        <div style="background: linear-gradient(135deg, #FFCC00 0%, #E6A800 100%); width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-clock" style="color: white; font-size: 1.25rem;"></i>
                        </div>
                        ${urgenti > 0 ? `<span class="badge badge-warning">${urgenti} entro 30gg</span>` : ''}
                    </div>
                    <h3 style="font-size: 0.875rem; font-weight: 600; color: var(--grigio-500); margin-bottom: 0.5rem; text-transform: uppercase;">
                        In Scadenza
                    </h3>
                    <p style="font-size: 2rem; font-weight: 700; color: ${count > 0 ? '#E6A800' : 'var(--verde-700)'}; margin: 0;">
                        ${count}
                    </p>
                    <p style="font-size: 0.75rem; color: var(--grigio-500); margin-top: 0.5rem;">
                        Prossimi 60 giorni
                    </p>
                </div>
            </div>
        `;
    },

    // =========================================================================
    // VISTE DETTAGLIO (click su widget)
    // =========================================================================

    async mostraContrattiScaduti() {
        UI.showLoading();

        let contratti, clienti;
        if (this._isAgente && this._agenteNome) {
            const datiAgente = await DataService.getDatiAgente(this._agenteNome);
            clienti = datiAgente.clienti;
            contratti = datiAgente.contratti.filter(c => c.stato === 'SCADUTO');
        } else {
            const [tuttiContratti, tuttiClienti] = await Promise.all([
                DataService.getContratti(),
                DataService.getClienti()
            ]);
            contratti = tuttiContratti.filter(c => c.stato === 'SCADUTO');
            clienti = tuttiClienti;
        }

        const contrattiArricchiti = contratti.map(c => {
            const cliente = clienti.find(cl => cl.id === c.clienteId);
            return { ...c, ragioneSociale: cliente?.ragioneSociale || c.clienteRagioneSociale || 'N/A' };
        }).sort((a, b) => new Date(a.dataScadenza || 0) - new Date(b.dataScadenza || 0));

        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);

        let listHtml = '';
        if (contrattiArricchiti.length === 0) {
            listHtml = UI.createEmptyState({ icon: 'check-circle', title: 'Nessun contratto scaduto', subtitle: 'Tutti i contratti sono in regola' });
        } else {
            listHtml = '<div class="list-group fade-in">';
            contrattiArricchiti.forEach(c => {
                const scadenza = c.dataScadenza ? new Date(c.dataScadenza) : null;
                const giorniScaduto = scadenza ? Math.abs(Math.ceil((scadenza - oggi) / (1000 * 60 * 60 * 24))) : '?';
                listHtml += UI.createListItem({
                    title: c.ragioneSociale,
                    subtitle: `${c.numeroContratto || 'N/A'} — ${c.oggetto || ''} — Scaduto da ${giorniScaduto} giorni (${c.dataScadenza ? DataService.formatDate(c.dataScadenza) : 'N/A'}) — ${c.importoAnnuale ? DataService.formatCurrency(c.importoAnnuale) + '/anno' : ''}`,
                    badge: 'SCADUTO',
                    badgeClass: 'badge-warning',
                    icon: 'file-contract',
                    onclick: `UI.showPage("dettaglio-contratto", "${c.id}")`
                });
            });
            listHtml += '</div>';
        }

        document.getElementById('mainContent').innerHTML = `
            <div class="page-header mb-3">
                <button class="btn btn-secondary btn-sm" onclick="Scadenzario.render()" style="margin-bottom: 1rem;">
                    <i class="fas fa-arrow-left"></i> Torna allo scadenzario
                </button>
                <h1 style="font-size: 2rem; font-weight: 700; color: #D32F2F; margin-bottom: 0.5rem;">
                    <i class="fas fa-exclamation-circle"></i> Contratti Scaduti
                </h1>
                <p style="color: var(--grigio-500);">
                    ${contrattiArricchiti.length} contratti da rinnovare o cessare
                </p>
            </div>
            ${listHtml}
        `;
        UI.hideLoading();
    },

    async mostraContrattiInScadenza() {
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
            const [tuttiContratti, tuttiClienti] = await Promise.all([
                DataService.getContratti(),
                DataService.getClienti()
            ]);
            const oggi = new Date();
            oggi.setHours(0, 0, 0, 0);
            const tra60gg = new Date();
            tra60gg.setDate(oggi.getDate() + 60);
            contratti = tuttiContratti.filter(c =>
                c.stato === 'ATTIVO' && c.dataScadenza && new Date(c.dataScadenza) <= tra60gg
            );
            clienti = tuttiClienti;
        }

        const contrattiArricchiti = contratti.map(c => {
            const cliente = clienti.find(cl => cl.id === c.clienteId);
            return { ...c, ragioneSociale: cliente?.ragioneSociale || c.clienteRagioneSociale || 'N/A' };
        }).sort((a, b) => new Date(a.dataScadenza) - new Date(b.dataScadenza));

        let listHtml = '';
        if (contrattiArricchiti.length === 0) {
            listHtml = UI.createEmptyState({ icon: 'check-circle', title: 'Nessun contratto in scadenza', subtitle: 'Nessun rinnovo previsto nei prossimi 60 giorni' });
        } else {
            listHtml = '<div class="list-group fade-in">';
            contrattiArricchiti.forEach(c => {
                const giorni = this.calcolaGiorniRimanenti(c.dataScadenza);
                listHtml += UI.createListItem({
                    title: c.ragioneSociale,
                    subtitle: `${c.numeroContratto || 'N/A'} — ${c.oggetto || ''} — Scadenza: ${DataService.formatDate(c.dataScadenza)} — ${c.importoAnnuale ? DataService.formatCurrency(c.importoAnnuale) + '/anno' : ''}`,
                    badge: `${giorni}gg`,
                    badgeClass: giorni <= 30 ? 'badge-warning' : 'badge-info',
                    icon: 'file-contract',
                    onclick: `UI.showPage("dettaglio-contratto", "${c.id}")`
                });
            });
            listHtml += '</div>';
        }

        document.getElementById('mainContent').innerHTML = `
            <div class="page-header mb-3">
                <button class="btn btn-secondary btn-sm" onclick="Scadenzario.render()" style="margin-bottom: 1rem;">
                    <i class="fas fa-arrow-left"></i> Torna allo scadenzario
                </button>
                <h1 style="font-size: 2rem; font-weight: 700; color: #E6A800; margin-bottom: 0.5rem;">
                    <i class="fas fa-clock"></i> Contratti in Scadenza
                </h1>
                <p style="color: var(--grigio-500);">
                    ${contrattiArricchiti.length} contratti nei prossimi 60 giorni
                </p>
            </div>
            ${listHtml}
        `;
        UI.hideLoading();
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
            const [tuttiContratti, tuttiClienti] = await Promise.all([
                DataService.getContratti(),
                DataService.getClienti()
            ]);
            const oggi = new Date();
            oggi.setHours(0, 0, 0, 0);
            const tra60gg = new Date();
            tra60gg.setDate(oggi.getDate() + 60);
            contratti = tuttiContratti.filter(c =>
                c.stato === 'ATTIVO' && c.dataScadenza && new Date(c.dataScadenza) <= tra60gg
            );
            clienti = tuttiClienti;
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

        const tutteFatture = this._datiCalcolati.fattureDaIncassare;
        const fattureNormali = tutteFatture.filter(f => !this._isCreditoSospeso(f));
        const fattureSospese = tutteFatture.filter(f => this._isCreditoSospeso(f));

        const totaleNormali = fattureNormali.reduce((sum, f) => sum + this._calcolaImportoResiduo(f), 0);
        const totaleSospese = fattureSospese.reduce((sum, f) => sum + this._calcolaImportoResiduo(f), 0);

        const listHtml = this.renderFattureScaduteList(fattureNormali);

        // Pulsante toggle crediti sospesi
        let sospesiHtml = '';
        if (fattureSospese.length > 0) {
            sospesiHtml = `
                <div style="margin-top:1.5rem;">
                    <button id="toggleSospesiScad" onclick="Scadenzario._toggleSospesi()" style="background:#FFF3E0;color:#E65100;border:1px solid #FFB74D;border-radius:20px;padding:0.5rem 1.25rem;font-size:0.85rem;font-weight:600;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;gap:0.5rem;">
                        <i class="fas fa-pause-circle"></i> Mostra crediti sospesi
                        <span style="background:#FFE0B2;padding:0.15rem 0.5rem;border-radius:10px;font-size:0.75rem;">${fattureSospese.length} • ${DataService.formatCurrency(totaleSospese)}</span>
                    </button>
                    <div id="listaSospesiScad" style="display:none;margin-top:1rem;">
                        <div style="padding:0.5rem 0.75rem;background:#FFFAF0;border-left:3px solid #FF9800;border-radius:6px;margin-bottom:0.75rem;">
                            <span style="font-size:0.8rem;color:#E65100;font-weight:600;"><i class="fas fa-info-circle"></i> Fatture con credito sospeso — escluse dal totale da incassare</span>
                        </div>
                        ${this.renderFattureScaduteList(fattureSospese, true)}
                    </div>
                </div>
            `;
        }

        const mainContent = document.getElementById('mainContent');
        mainContent.innerHTML = `
            <div class="page-header mb-3">
                <button class="btn btn-secondary btn-sm" onclick="Scadenzario.render()" style="margin-bottom: 1rem;">
                    <i class="fas fa-arrow-left"></i> Torna allo scadenzario
                </button>
                <h1 style="font-size: 2rem; font-weight: 700; color: #D32F2F; margin-bottom: 0.5rem;">
                    <i class="fas fa-file-invoice-dollar"></i> Fatture da Incassare
                </h1>
                <p style="color: var(--grigio-500);">
                    ${fattureNormali.length} fatture • Totale residuo: ${DataService.formatCurrency(totaleNormali)}
                </p>
            </div>
            ${listHtml}
            ${sospesiHtml}
        `;
        UI.hideLoading();
    },

    _toggleSospesi() {
        const lista = document.getElementById('listaSospesiScad');
        const btn = document.getElementById('toggleSospesiScad');
        if (!lista || !btn) return;
        const visible = lista.style.display !== 'none';
        lista.style.display = visible ? 'none' : 'block';
        btn.innerHTML = visible
            ? btn.innerHTML.replace('Nascondi', 'Mostra')
            : btn.innerHTML.replace('Mostra', 'Nascondi');
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

                const competenzaLabel = item.competenzaDal && item.competenzaAl
                    ? `Competenza: ${DataService.formatDate(item.competenzaDal)} → ${DataService.formatDate(item.competenzaAl)} • `
                    : '';
                listHtml += UI.createListItem({
                    title: item.clienteRagioneSociale || 'N/A',
                    subtitle: `${item.descrizione} • ${competenzaLabel}${DataService.formatDate(item.dataScadenza)} • ${DataService.formatCurrency(item.importo)}`,
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
            const urgenza = giorni <= (_sysScad.sogliaCritico || 1) ? 'critico' : giorni <= (_sysScad.sogliaImminente || 3) ? 'imminente' : 'normale';
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

    renderFattureScaduteList(fatture, isSospeso) {
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

            const isParziale = fattura.statoPagamento === 'PARZIALMENTE_PAGATA';
            const residuo = this._calcolaImportoResiduo(fattura);
            const stato = isParziale ? ' (parz.)' : '';
            const importoLabel = isParziale
                ? `Residuo: ${DataService.formatCurrency(residuo)} su ${DataService.formatCurrency(fattura.importoTotale)}`
                : DataService.formatCurrency(fattura.importoTotale);
            const sospesoLabel = isSospeso ? ' • <span style="color:#FF9800;font-weight:600;">Credito sospeso</span>' : '';

            html += UI.createListItem({
                title: (isSospeso ? '<i class="fas fa-pause-circle" style="color:#FF9800;margin-right:4px;font-size:0.85rem;"></i>' : '') + (fattura.numeroFatturaCompleto || fattura.numeroFattura || 'Fattura') + stato,
                subtitle: `${clienteInfo} • Scadenza: ${DataService.formatDate(fattura.dataScadenza)} • ${importoLabel}${sospesoLabel}`,
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

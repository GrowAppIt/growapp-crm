// Fatture Page
const Fatture = {
    filtri: {
        anno: '',
        stato: '',
        search: ''
    },
    filterTimeout: null, // Per debounce della ricerca

    async render() {
        UI.showLoading();

        try {
            // Se agente, carica solo fatture dei propri clienti
            let fatture;
            const _isAgente = AuthService.canViewOnlyOwnData();
            const _agenteNome = _isAgente ? AuthService.getAgenteFilterName() : null;
            if (_isAgente && _agenteNome) {
                const datiAgente = await DataService.getDatiAgente(_agenteNome);
                fatture = datiAgente.fatture;
                this._clienteIdsAgente = datiAgente.clienteIds; // Salva per i filtri
            } else {
                fatture = await DataService.getFatture({ limit: 200 });
                this._clienteIdsAgente = null;
            }

            const mainContent = document.getElementById('mainContent');
            mainContent.innerHTML = `
                <div class="page-header mb-3">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
                        <div>
                            <h1 style="font-size: 2rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                                <i class="fas fa-file-invoice"></i> Fatture
                            </h1>
                            <p style="color: var(--grigio-500);">
                                Ultime ${fatture.length} fatture
                            </p>
                        </div>
                        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                            <button class="btn btn-secondary" onclick="ExportManager.downloadTemplateFatture()">
                                <i class="fas fa-download"></i> Template
                            </button>
                            <button class="btn btn-secondary" onclick="ExportManager.importFatture()">
                                <i class="fas fa-upload"></i> Importa
                            </button>
                            <button class="btn btn-secondary" onclick="Fatture.exportData()">
                                <i class="fas fa-file-excel"></i> Esporta
                            </button>
                            <button class="btn btn-primary" onclick="FormsManager.showNuovaFattura()">
                                <i class="fas fa-plus"></i> Nuova Fattura
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Filtri -->
                <div class="filter-bar fade-in">
                    <div class="filter-group">
                        <input type="text" class="filter-input" id="searchInput" placeholder="🔍 Cerca fattura o cliente..." onkeyup="Fatture.applyFilters()">
                        <select class="filter-select" id="filtroAnno" onchange="Fatture.applyFilters()">
                            <option value="">Tutti gli anni</option>
                            <option value="2026">2026</option>
                            <option value="2025">2025</option>
                            <option value="2024">2024</option>
                            <option value="2023">2023</option>
                            <option value="2022">2022</option>
                            <option value="2021">2021</option>
                        </select>
                        <select class="filter-select" id="filtroTipoCliente" onchange="Fatture.applyFilters()">
                            <option value="">PA e Privati</option>
                            <option value="PA">Solo PA</option>
                            <option value="PR">Solo Privati</option>
                        </select>
                        <select class="filter-select" id="filtroStato" onchange="Fatture.applyFilters()">
                            <option value="">Tutti gli stati</option>
                            <option value="PAGATA">Pagate</option>
                            <option value="NON_PAGATA">Non Pagate</option>
                            <option value="PARZIALMENTE_PAGATA">Parzialmente Pagate</option>
                            <option value="NOTA_CREDITO">Note di Credito</option>
                            <option value="RIFIUTATA">Rifiutate</option>
                        </select>
                    </div>
                </div>

                <!-- Lista Fatture -->
                <div id="fattureList">
                    ${this.renderFattureList(fatture)}
                </div>
            `;

            UI.hideLoading();
        } catch (error) {
            console.error('Errore rendering fatture:', error);
            UI.hideLoading();
        }
    },

    renderFattureList(fatture) {
        if (fatture.length === 0) {
            return UI.createEmptyState({
                icon: 'file-invoice',
                title: 'Nessuna fattura',
                subtitle: 'Non ci sono fatture che corrispondono ai filtri selezionati'
            });
        }

        // Ordina per anno decrescente, poi per numero fattura decrescente
        fatture.sort((a, b) => {
            // Prima confronta l'anno (decrescente)
            const annoA = parseInt(a.anno) || 0;
            const annoB = parseInt(b.anno) || 0;
            if (annoB !== annoA) return annoB - annoA;

            // Poi confronta il numero fattura (decrescente)
            // Supporta formati: "2026/014", "2026/014/PA", "2026/014/PR"
            const numA = (a.numeroFatturaCompleto || '');
            const numB = (b.numeroFatturaCompleto || '');
            const partsA = numA.split('/');
            const partsB = numB.split('/');
            // Il numero progressivo è sempre la seconda parte
            const partA = parseInt(partsA[1]) || parseInt(partsA[partsA.length > 2 ? 1 : partsA.length - 1]) || 0;
            const partB = parseInt(partsB[1]) || parseInt(partsB[partsB.length > 2 ? 1 : partsB.length - 1]) || 0;
            if (partB !== partA) return partB - partA;

            // Se stesso numero, PA prima di PR
            const tipoA = a.tipoCliente || (numA.endsWith('/PA') ? 'PA' : 'PR');
            const tipoB = b.tipoCliente || (numB.endsWith('/PA') ? 'PA' : 'PR');
            return tipoA.localeCompare(tipoB);
        });

        let html = '<div class="list-group fade-in">';

        for (const fattura of fatture) {
            const badgeClass = DataService.getStatoBadgeClass(fattura.statoPagamento);
            // Mostra solo numero fattura senza caricare dati cliente (per performance)
            const clienteInfo = fattura.clienteRagioneSociale || `Cliente: ${fattura.clienteId?.substring(0,8)}...`;

            // Determina tipo PA/PR dal campo tipoCliente o dal numero fattura
            const tipoCliente = fattura.tipoCliente || (fattura.numeroFatturaCompleto?.endsWith('/PA') ? 'PA' : (fattura.numeroFatturaCompleto?.endsWith('/PR') ? 'PR' : ''));
            const tipoBadge = tipoCliente === 'PA' ? '<span style="display:inline-block; background:#0288D1; color:white; font-size:0.7rem; padding:0.15rem 0.4rem; border-radius:4px; font-weight:700; margin-left:0.5rem;">PA</span>' :
                              tipoCliente === 'PR' ? '<span style="display:inline-block; background:#9B9B9B; color:white; font-size:0.7rem; padding:0.15rem 0.4rem; border-radius:4px; font-weight:700; margin-left:0.5rem;">PR</span>' : '';

            // Nota di credito badge
            const isNotaCredito = fattura.tipoDocumento === 'NOTA_DI_CREDITO' || (fattura.numeroFatturaCompleto || '').startsWith('NC-');
            const ncBadge = isNotaCredito ? '<span style="display:inline-block; background:#D32F2F; color:white; font-size:0.7rem; padding:0.15rem 0.4rem; border-radius:4px; font-weight:700; margin-left:0.5rem;">NC</span>' : '';

            html += UI.createListItem({
                title: `${fattura.numeroFatturaCompleto}${tipoBadge}${ncBadge}`,
                subtitle: `${clienteInfo} • ${DataService.formatDate(fattura.dataEmissione)} • ${isNotaCredito ? '-' : ''}${DataService.formatCurrency(fattura.importoTotale)}`,
                badge: isNotaCredito ? 'NOTA CREDITO' : fattura.statoPagamento?.replace('_', ' '),
                badgeClass: isNotaCredito ? 'badge-danger' : badgeClass,
                icon: isNotaCredito ? 'file-invoice-dollar' : 'file-invoice',
                onclick: `UI.showPage('dettaglio-fattura', '${fattura.id}')`
            });
        }

        html += '</div>';
        return html;
    },

    applyFilters() {
        // Debounce: aspetta 300ms dopo l'ultima digitazione prima di filtrare
        clearTimeout(this.filterTimeout);
        this.filterTimeout = setTimeout(() => {
            this.filtri.anno = document.getElementById('filtroAnno').value;
            this.filtri.stato = document.getElementById('filtroStato').value;
            this.filtri.search = document.getElementById('searchInput').value.toLowerCase();
            this.filtri.tipoCliente = document.getElementById('filtroTipoCliente')?.value || '';

            let filtro = { limit: 500 };
            if (this.filtri.anno) filtro.anno = parseInt(this.filtri.anno);
            if (this.filtri.stato) filtro.statoPagamento = this.filtri.stato;

            // Se agente, usa getDatiAgente; altrimenti carica normalmente
            const __isAgente = AuthService.canViewOnlyOwnData();
            const __agenteNome = __isAgente ? AuthService.getAgenteFilterName() : null;

            const fatturePromise = (__isAgente && __agenteNome)
                ? DataService.getDatiAgente(__agenteNome).then(d => { this._clienteIdsAgente = d.clienteIds; return d.fatture; })
                : DataService.getFatture(filtro);

            fatturePromise.then(fatture => {
                let filtrate = fatture;

                if (this.filtri.search) {
                    filtrate = filtrate.filter(f =>
                        f.numeroFatturaCompleto?.toLowerCase().includes(this.filtri.search) ||
                        f.clienteRagioneSociale?.toLowerCase().includes(this.filtri.search) ||
                        f.clienteId?.toLowerCase().includes(this.filtri.search)
                    );
                }

                // Filtra per tipo cliente PA/PR
                if (this.filtri.tipoCliente) {
                    filtrate = filtrate.filter(f => {
                        const tipo = f.tipoCliente || (f.numeroFatturaCompleto?.endsWith('/PA') ? 'PA' : (f.numeroFatturaCompleto?.endsWith('/PR') ? 'PR' : ''));
                        return tipo === this.filtri.tipoCliente;
                    });
                }

                document.getElementById('fattureList').innerHTML = this.renderFattureList(filtrate);
            });
        }, 300);
    },

    async exportData() {
        let filtro = { limit: 1000 };
        if (this.filtri.anno) filtro.anno = parseInt(this.filtri.anno);
        if (this.filtri.stato) filtro.statoPagamento = this.filtri.stato;

        // Se agente, carica solo fatture dei propri clienti
        const _isAgenteExp = AuthService.canViewOnlyOwnData();
        const _agenteNomeExp = _isAgenteExp ? AuthService.getAgenteFilterName() : null;
        let fatture;
        if (_isAgenteExp && _agenteNomeExp) {
            const dati = await DataService.getDatiAgente(_agenteNomeExp);
            fatture = dati.fatture;
        } else {
            fatture = await DataService.getFatture(filtro);
        }
        let filtrate = fatture;

        if (this.filtri.search) {
            filtrate = filtrate.filter(f =>
                f.numeroFatturaCompleto?.toLowerCase().includes(this.filtri.search) ||
                f.clienteRagioneSociale?.toLowerCase().includes(this.filtri.search) ||
                f.clienteId?.toLowerCase().includes(this.filtri.search)
            );
        }

        await ExportManager.exportFatture(filtrate);
    }
};

// Dashboard Page con Widget Personalizzabili
const Dashboard = {
    // Cache dati KPI per drill-down al click
    _kpiData: null,

    async render() {
        try {
            // === VISTA AGENTE: dati filtrati solo per i propri clienti ===
            if (AuthService.canViewOnlyOwnData()) {
                UI.showLoading();
                return await this.renderDashboardAgente();
            }

            // === VISTA NORMALE (admin, CTO, ecc.) ===
            // FASE 0: Mostra SUBITO lo skeleton della dashboard (senza attendere i dati)
            this._renderSkeleton();

            // OTTIMIZZAZIONE: carica le 6 collezioni base UNA sola volta, poi calcola tutto in memoria
            const _sysDash2 = SettingsService.getSystemSettingsSync();

            const canContracts = AuthService.hasPermission('manage_contracts') || AuthService.hasPermission('view_contracts') || AuthService.hasPermission('view_all_data');
            const canInvoices = AuthService.hasPermission('manage_invoices') || AuthService.hasPermission('view_invoices') || AuthService.hasPermission('view_all_data');
            const canClients = AuthService.hasPermission('view_clients') || AuthService.hasPermission('manage_clients') || AuthService.hasPermission('view_all_data');
            const canApps = AuthService.hasPermission('view_apps') || AuthService.hasPermission('manage_apps') || AuthService.hasPermission('manage_app_content') || AuthService.hasPermission('view_all_data');
            const canTasks = AuthService.hasPermission('view_dev_tasks') || AuthService.hasPermission('manage_dev_tasks') || AuthService.hasPermission('view_all_data');

            // ── FASE 1: Carica le 6 collezioni base in parallelo (6 query Firestore, non 16) ──
            const [
                _rawClienti,
                _rawContratti,
                _rawFatture,
                _rawApp,
                _rawScadenze,
                _rawTasksResult
            ] = await Promise.all([
                canClients ? DataService.getClienti().catch(e => { console.warn('Dashboard: errore getClienti', e); return []; }) : Promise.resolve([]),
                canContracts ? DataService.getContratti().catch(e => { console.warn('Dashboard: errore getContratti', e); return []; }) : Promise.resolve([]),
                canInvoices ? DataService.getFatture().catch(e => { console.warn('Dashboard: errore getFatture', e); return []; }) : Promise.resolve([]),
                canApps ? DataService.getApps().catch(e => { console.warn('Dashboard: errore getApps', e); return []; }) : Promise.resolve([]),
                DataService.getScadenze().catch(e => { console.warn('Dashboard: errore getScadenze', e); return []; }),
                canTasks ? TaskService.getAllTasks({ limit: 100 }).catch(e => { console.warn('Dashboard: errore getAllTasks', e); return { tasks: [] }; }) : Promise.resolve({ tasks: [] })
            ]);

            const clienti = _rawClienti;
            const contrattiTutti = _rawContratti;
            const fatture = _rawFatture;
            const app = _rawApp;
            const tasks = _rawTasksResult.tasks || [];

            // ── FASE 2: Calcola tutto IN MEMORIA dai dati già caricati ──
            const oggi = new Date();
            oggi.setHours(0, 0, 0, 0);

            // Stats: calcola clientiConStato in memoria
            const _contrattiPerCliente = {};
            contrattiTutti.forEach(c => {
                if (!c.clienteId) return;
                if (!_contrattiPerCliente[c.clienteId]) _contrattiPerCliente[c.clienteId] = [];
                _contrattiPerCliente[c.clienteId].push(c);
            });
            const clientiConStato = clienti.map(cl => {
                const ids = [cl.id, cl.clienteIdLegacy].filter(Boolean);
                const contrattiCl = [];
                const idsVisti = new Set();
                ids.forEach(id => {
                    (_contrattiPerCliente[id] || []).forEach(c => {
                        if (!idsVisti.has(c.id)) { idsVisti.add(c.id); contrattiCl.push(c); }
                    });
                });
                return { ...cl, statoContratto: DataService.calcolaStatoCliente(contrattiCl) };
            });

            // Statistiche KPI
            const clientiPerStato = {};
            clientiConStato.forEach(c => { clientiPerStato[c.statoContratto] = (clientiPerStato[c.statoContratto] || 0) + 1; });
            const fatturePerStato = {};
            fatture.forEach(f => { fatturePerStato[f.statoPagamento] = (fatturePerStato[f.statoPagamento] || 0) + 1; });
            const fatturatoTotale = fatture
                .filter(f => f.statoPagamento === 'PAGATA' || f.tipoDocumento === 'NOTA_DI_CREDITO')
                .reduce((sum, f) => {
                    const importo = f.importoTotale || 0;
                    const isNC = f.tipoDocumento === 'NOTA_DI_CREDITO' || (f.numeroFatturaCompleto || '').startsWith('NC-');
                    return sum + (isNC ? -Math.abs(importo) : importo);
                }, 0);
            const fattureNonPagateStats = fatture.filter(f => f.statoPagamento === 'NON_PAGATA' && f.tipoDocumento !== 'NOTA_DI_CREDITO');
            const importoNonPagato = fattureNonPagateStats.reduce((sum, f) => sum + (f.importoTotale || 0), 0);
            const contrattiPerStato = {};
            contrattiTutti.forEach(c => { contrattiPerStato[c.stato] = (contrattiPerStato[c.stato] || 0) + 1; });
            const appPerStato = {};
            app.forEach(a => { appPerStato[a.statoApp] = (appPerStato[a.statoApp] || 0) + 1; });
            const tra7giorni = new Date(oggi);
            tra7giorni.setDate(tra7giorni.getDate() + 7);
            const scadenzeScaduteStats = _rawScadenze.filter(s => s.dataScadenza && new Date(s.dataScadenza) < oggi);
            const scadenzeImminentiStats = _rawScadenze.filter(s => {
                if (!s.dataScadenza) return false;
                const d = new Date(s.dataScadenza);
                return d >= oggi && d <= tra7giorni;
            });

            const stats = {
                clienti: { totale: clienti.length, attivi: clientiPerStato['ATTIVO'] || 0, scaduti: clientiPerStato['SCADUTO'] || 0, cessati: clientiPerStato['CESSATO'] || 0, senzaContratto: clientiPerStato['SENZA_CONTRATTO'] || 0, perStato: clientiPerStato },
                app: { totale: app.length, attive: appPerStato['ATTIVA'] || 0, inSviluppo: (appPerStato['SVILUPPO'] || 0) + (appPerStato['IN_SVILUPPO'] || 0), sospese: appPerStato['SOSPESA'] || 0, perStato: appPerStato },
                contratti: { totale: contrattiTutti.length, attivi: contrattiPerStato['ATTIVO'] || 0, scaduti: contrattiPerStato['SCADUTO'] || 0, cessati: contrattiPerStato['CESSATO'] || 0, perStato: contrattiPerStato },
                fatture: { totale: fatture.length, pagate: fatturePerStato['PAGATA'] || 0, nonPagate: fatturePerStato['NON_PAGATA'] || 0, perStato: fatturePerStato, fatturatoTotale, importoNonPagato },
                scadenze: { totale: _rawScadenze.length, scadute: scadenzeScaduteStats.length, imminenti: scadenzeImminentiStats.length }
            };

            // Contratti in scadenza (filtro in memoria)
            const _finestraContratti = _sysDash2.finestraContrattiDashboard || 60;
            const _dataLimiteContratti = new Date(oggi);
            _dataLimiteContratti.setDate(_dataLimiteContratti.getDate() + _finestraContratti);
            const contrattiInScadenza = contrattiTutti.filter(c =>
                c.stato === 'ATTIVO' && c.dataScadenza && new Date(c.dataScadenza) <= _dataLimiteContratti
            ).sort((a, b) => new Date(a.dataScadenza) - new Date(b.dataScadenza));

            // Fatture scadute (filtro in memoria)
            const fattureScadute = fatture.filter(f =>
                f.statoPagamento === 'NON_PAGATA' && f.dataScadenza && new Date(f.dataScadenza) < oggi
            );

            // Fatture in scadenza (filtro in memoria)
            const _finestraFatture = _sysDash2.finestraFattureDashboard || 30;
            const _dataLimiteFatture = new Date(oggi);
            _dataLimiteFatture.setDate(_dataLimiteFatture.getDate() + _finestraFatture);
            const fattureInScadenza = fatture.filter(f => {
                if (f.statoPagamento !== 'NON_PAGATA' || !f.dataScadenza) return false;
                const ds = new Date(f.dataScadenza);
                return ds >= oggi && ds <= _dataLimiteFatture;
            });

            // Scadenze compute (passa dati già caricati per evitare ulteriori query)
            let scadenzeScadute = [];
            let scadenzeImminenti = [];
            try {
                const scadenzeCalcolateResult = await DataService.getScadenzeCompute({ contratti: contrattiTutti, fatture: fatture });
                const finestraImminente = new Date(oggi);
                finestraImminente.setDate(finestraImminente.getDate() + (_sysDash2.sogliaImminente || 30));
                scadenzeScadute = scadenzeCalcolateResult.tutteLeScadenze.filter(s =>
                    s.dataScadenza && new Date(s.dataScadenza) < oggi
                );
                scadenzeImminenti = scadenzeCalcolateResult.tutteLeScadenze.filter(s => {
                    if (!s.dataScadenza) return false;
                    const ds = new Date(s.dataScadenza);
                    return ds >= oggi && ds <= finestraImminente;
                });
            } catch (e) { console.warn('Dashboard: errore getScadenzeCompute', e); }

            // Get enabled widgets
            const enabledWidgets = SettingsService.getEnabledWidgets();

            // FASE 2: Sostituisce l'intera area skeleton con i widget reali
            const dashboardBody = document.getElementById('dashboardBody');
            if (dashboardBody) {
                dashboardBody.innerHTML = `
                    <div style="display: grid; gap: 1.5rem;">
                        ${await this.renderEnabledWidgets(enabledWidgets, {
                            stats,
                            scadenzeScadute,
                            scadenzeImminenti,
                            contrattiInScadenza,
                            fattureInScadenza,
                            clienti,
                            fatture,
                            fattureScadute,
                            app,
                            tasks,
                            contrattiTutti
                        })}
                    </div>
                `;
            }

            UI.hideLoading();
        } catch (error) {
            console.error('Errore rendering dashboard:', error);
            UI.hideLoading();
            UI.showError('Errore nel caricamento della dashboard');
        }
    },

    // Flag per distinguere vista agente manuale vs automatica
    _vistaAgenteManuale: false,

    /**
     * Passa alla vista agente (per admin/CTO con ancheAgente)
     */
    async switchToVistaAgente() {
        this._vistaAgenteManuale = true;
        UI.showLoading();
        await this.renderDashboardAgente();
    },

    /**
     * Torna alla dashboard admin normale
     */
    async switchToVistaAdmin() {
        this._vistaAgenteManuale = false;
        await this.render();
    },

    // Skeleton: mostra subito la struttura della dashboard con placeholder animati
    _renderSkeleton() {
        const mainContent = document.getElementById('mainContent');
        mainContent.innerHTML = `
            <div class="page-header mb-3">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                    <div>
                        <h1 style="font-size: 2rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                            <i class="fas fa-home"></i> Dashboard
                        </h1>
                        <p style="color: var(--grigio-500);">
                            Panoramica generale e metriche chiave
                        </p>
                    </div>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        ${AuthService.isAncheAgente() ? `
                            <button class="btn btn-primary" onclick="Dashboard.switchToVistaAgente()" style="background: var(--verde-700);">
                                <i class="fas fa-user-tie"></i> Vista Agente
                            </button>
                        ` : ''}
                        <button class="btn btn-secondary" onclick="UI.showPage('impostazioni')">
                            <i class="fas fa-cog"></i> Personalizza
                        </button>
                    </div>
                </div>
            </div>

            <!-- Corpo dashboard: skeleton animato, verrà sostituito dai dati reali -->
            <div id="dashboardBody">
                <div class="kpi-grid" style="margin-bottom: 1.5rem;">
                    ${[1,2,3,4,5,6].map(() => `
                        <div style="background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
                            <div style="display: flex; align-items: center; gap: 1rem;">
                                <div style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite;"></div>
                                <div style="flex: 1;">
                                    <div style="height: 14px; width: 60%; border-radius: 4px; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; margin-bottom: 8px;"></div>
                                    <div style="height: 24px; width: 40%; border-radius: 4px; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite;"></div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div style="display: grid; gap: 1.5rem;">
                    ${[1,2].map(() => `
                        <div style="background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.06); min-height: 200px;">
                            <div style="height: 20px; width: 30%; border-radius: 4px; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; margin-bottom: 1rem;"></div>
                            <div style="height: 14px; width: 90%; border-radius: 4px; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; margin-bottom: 0.5rem;"></div>
                            <div style="height: 14px; width: 75%; border-radius: 4px; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; margin-bottom: 0.5rem;"></div>
                            <div style="height: 14px; width: 85%; border-radius: 4px; background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite;"></div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <style>
                @keyframes shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
            </style>
        `;
        UI.hideLoading();
    },

    async renderEnabledWidgets(widgets, data) {
        let html = '';

        // Mappa permessi richiesti per ogni widget
        // NOTA: '_always_' = visibile a tutti gli utenti autenticati
        const widgetPermissions = {
            'statistiche': ['_always_'],
            'scadenzeImminenti': ['manage_payments', 'view_all_data'],
            'fattureNonPagate': ['manage_invoices', 'view_invoices', 'view_all_data'],
            'contrattiInScadenza': ['manage_contracts', 'view_contracts', 'view_all_data'],
            'andamentoMensile': ['view_all_data'],
            'statoApp': ['view_apps', 'manage_apps', 'manage_app_content', 'view_all_data'],
            'topClienti': ['manage_invoices', 'view_invoices', 'view_clients', 'manage_clients', 'view_all_data'],
            'ultimiClienti': ['view_clients', 'manage_clients', 'view_all_data']
        };

        for (const widget of widgets) {
            // Verifica se l'utente ha i permessi per vedere questo widget
            const requiredPerms = widgetPermissions[widget.id] || [];
            const hasPermission = requiredPerms.includes('_always_') || requiredPerms.some(perm => AuthService.hasPermission(perm));

            if (!hasPermission) {
                continue; // Salta questo widget
            }

            switch (widget.id) {
                case 'statistiche':
                    html += this.renderStatisticheKPI(data.stats, data.scadenzeScadute, data.contrattiTutti, data.fattureScadute, data.tasks);
                    break;
                case 'scadenzeImminenti':
                    // Usa versione compatta se impostato nel widget
                    if (widget.compatto) {
                        html += await this.renderScadenzeImminenteCompatta(data.scadenzeImminenti, data.contrattiInScadenza, data.fattureInScadenza);
                    } else {
                        html += await this.renderScadenzeImminenti(data.scadenzeImminenti, data.contrattiInScadenza, data.fattureInScadenza);
                    }
                    break;
                case 'fattureNonPagate':
                    html += this.renderFattureNonPagate(data.fattureScadute);
                    break;
                case 'contrattiInScadenza':
                    html += this.renderContrattiInScadenza(data.contrattiInScadenza);
                    break;
                case 'andamentoMensile':
                    html += await this.renderAndamentoMensile(data.fatture, data.clienti, data.contrattiTutti, data.app);
                    break;
                case 'statoApp':
                    html += this.renderStatoAppCorretto(data.app);
                    break;
                case 'topClienti':
                    html += await this.renderTopClienti(data.fatture, data.clienti);
                    break;
                case 'ultimiClienti':
                    html += this.renderUltimiClienti(data.clienti);
                    break;
            }
        }

        return html || '<div class="empty-state"><p>Nessun widget disponibile con i tuoi permessi. <a href="#" onclick="UI.showPage(\'impostazioni\')">Personalizza dashboard</a></p></div>';
    },

    renderStatistiche(stats, scadenzeScadute, scadenzeImminenti, contrattiInScadenza) {
        return `
            <div class="kpi-grid fade-in">
                ${UI.createKPICard({
                    icon: 'exclamation-triangle',
                    iconClass: 'critical',
                    label: 'Scadenze Critiche',
                    value: scadenzeScadute.length,
                    onclick: 'UI.showPage("scadenzario")'
                })}
                ${UI.createKPICard({
                    icon: 'clock',
                    iconClass: 'warning',
                    label: 'Prossimi 30 giorni',
                    value: scadenzeImminenti.length,
                    onclick: 'UI.showPage("scadenzario")'
                })}
                ${UI.createKPICard({
                    icon: 'file-contract',
                    iconClass: 'info',
                    label: 'Rinnovi (60gg)',
                    value: contrattiInScadenza.length
                })}
                ${UI.createKPICard({
                    icon: 'euro-sign',
                    iconClass: 'success',
                    label: 'Fatturato Totale',
                    value: DataService.formatCurrency(stats.fatture.fatturatoTotale)
                })}
            </div>
        `;
    },

    async renderScadenzeImminenti(scadenzeCalcolate, contrattiInScadenza, fattureInScadenza) {
        // Le scadenze sono già calcolate da contratti e fatture reali
        const oggi = new Date();

        if (scadenzeCalcolate.length === 0) {
            return `
                <div class="card fade-in">
                    <div class="card-header">
                        <h2 class="card-title">
                            <i class="fas fa-calendar-check"></i> Scadenze Imminenti
                        </h2>
                    </div>
                    <div class="empty-state">
                        <i class="fas fa-check-circle"></i>
                        <h3>Nessuna scadenza nei prossimi 30 giorni</h3>
                    </div>
                </div>
            `;
        }

        // Conta per tipo
        const nContratti = scadenzeCalcolate.filter(s => s.tipo === 'CONTRATTO_RINNOVO').length;
        const nFattureEmettere = scadenzeCalcolate.filter(s => s.tipo === 'FATTURA_EMISSIONE').length;
        const nFattureIncasso = scadenzeCalcolate.filter(s => s.tipo === 'FATTURA_INCASSO').length;

        let html = `
            <div class="card fade-in">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-calendar-alt"></i> Scadenze Imminenti
                    </h2>
                    <div class="card-subtitle">Prossimi 30 giorni: ${scadenzeCalcolate.length} scadenze (${nContratti} rinnovi, ${nFattureEmettere} da emettere, ${nFattureIncasso} da incassare)</div>
                </div>
                <div class="list-group">
        `;

        const slice = scadenzeCalcolate.slice(0, 10);
        for (const scadenza of slice) {
            const giorni = Math.ceil((new Date(scadenza.dataScadenza) - oggi) / (1000 * 60 * 60 * 24));
            const urgenza = giorni < 0 ? 'scaduto' : giorni <= 7 ? 'critico' : 'normale';
            const badgeClass = urgenza === 'scaduto' ? 'badge-danger' :
                             urgenza === 'critico' ? 'badge-warning' : 'badge-info';

            // Icona e label per tipo calcolato
            let tipoIcon = 'calendar';
            if (scadenza.tipo === 'CONTRATTO_RINNOVO') tipoIcon = 'file-contract';
            else if (scadenza.tipo === 'FATTURA_INCASSO') tipoIcon = 'file-invoice-dollar';
            else if (scadenza.tipo === 'FATTURA_EMISSIONE') tipoIcon = 'file-invoice';

            const importo = scadenza.importo || scadenza.importoTotale;
            const subtitle = importo
                ? `${scadenza.descrizione || ''} • ${DataService.formatDate(scadenza.dataScadenza)} • ${DataService.formatCurrency(importo)}`
                : `${scadenza.descrizione || ''} • ${DataService.formatDate(scadenza.dataScadenza)}`;

            // Navigazione corretta
            let onclick = `UI.showPage('scadenzario')`;
            if (scadenza.tipo === 'CONTRATTO_RINNOVO') {
                onclick = `UI.showPage('dettaglio-contratto', '${scadenza.id}')`;
            } else if (scadenza.tipo === 'FATTURA_INCASSO') {
                onclick = `UI.showPage('dettaglio-fattura', '${scadenza.id}')`;
            } else if (scadenza.tipo === 'FATTURA_EMISSIONE' && scadenza.contrattoId) {
                onclick = `UI.showPage('dettaglio-contratto', '${scadenza.contrattoId}')`;
            }

            html += UI.createListItem({
                title: scadenza.clienteRagioneSociale || 'N/A',
                subtitle: subtitle,
                badge: urgenza === 'scaduto' ? 'SCADUTO' : `${giorni}gg`,
                badgeClass,
                icon: tipoIcon,
                onclick: onclick
            });
        }

        html += `
                </div>
                <div style="text-align: center; margin-top: 1rem;">
                    <button class="btn btn-primary" onclick="UI.showPage('scadenzario')">
                        <i class="fas fa-calendar-alt"></i> Vedi tutte
                    </button>
                </div>
            </div>
        `;

        return html;
    },

    async renderTopClienti(fatture, clienti) {
        // Filtra fatture ultimo anno
        const oggi = new Date();
        const unAnnoFa = new Date(oggi);
        unAnnoFa.setFullYear(oggi.getFullYear() - 1);

        const fattureUltimoAnno = fatture.filter(f => {
            if (!f.dataEmissione) return false;
            const dataEmissione = new Date(f.dataEmissione);
            return dataEmissione >= unAnnoFa;
        });

        // Calcola fatturato per cliente
        const fatturatoPerCliente = {};
        fattureUltimoAnno.forEach(f => {
            if (!f.clienteId) return;

            if (!fatturatoPerCliente[f.clienteId]) {
                // Trova il cliente corrispondente usando id
                const cliente = clienti.find(c => c.id === f.clienteId);

                // Salta i clienti non trovati (probabilmente cancellati)
                if (!cliente) return;

                fatturatoPerCliente[f.clienteId] = {
                    totale: 0,
                    ragioneSociale: cliente.ragioneSociale,
                    id: cliente.id
                };
            }
            const isNC = f.tipoDocumento === 'NOTA_DI_CREDITO' || (f.numeroFatturaCompleto || '').startsWith('NC-');
            fatturatoPerCliente[f.clienteId].totale += isNC ? -Math.abs(f.importoTotale || 0) : (f.importoTotale || 0);
        });

        // Ordina e prendi top 5 (solo clienti validi)
        const topClienti = Object.entries(fatturatoPerCliente)
            .map(([id, data]) => ({ ...data }))
            .filter(c => c.ragioneSociale !== undefined) // Filtra eventuali clienti invalidi
            .sort((a, b) => b.totale - a.totale)
            .slice(0, 5);

        if (topClienti.length === 0) {
            return `
                <div class="card fade-in">
                    <div class="card-header">
                        <h2 class="card-title">
                            <i class="fas fa-trophy"></i> Top 5 Clienti
                        </h2>
                    </div>
                    <div class="empty-state">
                        <i class="fas fa-info-circle"></i>
                        <p>Nessun dato disponibile per l'ultimo anno</p>
                    </div>
                </div>
            `;
        }

        let html = `
            <div class="card fade-in">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-trophy"></i> Top 5 Clienti per Fatturato
                    </h2>
                    <div class="card-subtitle">Basato su fatture emesse negli ultimi 12 mesi</div>
                </div>
                <div class="list-group">
        `;

        topClienti.forEach((cliente, index) => {
            const medalIcon = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '👤';
            html += UI.createListItem({
                title: `${medalIcon} ${cliente.ragioneSociale}`,
                subtitle: `${index + 1}° classificato`,
                icon: 'building',
                onclick: `UI.showPage("dettaglio-cliente", "${cliente.id}")`
            });
        });

        html += `
                </div>
            </div>
        `;

        return html;
    },

    renderFattureNonPagate(fattureScadute) {
        // Usa direttamente le fatture scadute da DataService.getFattureScadute()
        const totaleScaduto = fattureScadute.reduce((sum, f) => sum + (f.importoTotale || 0), 0);

        return `
            <div class="card fade-in">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-exclamation-circle"></i> Fatture Scadute da Incassare
                    </h2>
                </div>
                <div class="card-body">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1.5rem;">
                        <div class="stat-box">
                            <div class="stat-value">${fattureScadute.length}</div>
                            <div class="stat-label">Fatture</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${DataService.formatCurrency(totaleScaduto)}</div>
                            <div class="stat-label">Totale</div>
                        </div>
                    </div>
                    <div style="text-align: center; margin-top: 1.5rem;">
                        <button class="btn btn-primary btn-sm" onclick="UI.showPage('scadenzario')">
                            <i class="fas fa-calendar-alt"></i> Vedi scadenzario
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    renderContrattiInScadenza(contratti) {
        if (contratti.length === 0) {
            return `
                <div class="card fade-in">
                    <div class="card-header">
                        <h2 class="card-title">
                            <i class="fas fa-file-contract"></i> Contratti in Scadenza
                        </h2>
                    </div>
                    <div class="empty-state">
                        <i class="fas fa-check-circle"></i>
                        <p>Nessun contratto in scadenza nei prossimi 60 giorni</p>
                    </div>
                </div>
            `;
        }

        let html = `
            <div class="card fade-in">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-file-contract"></i> Contratti in Scadenza
                    </h2>
                    <div class="card-subtitle">Prossimi 60 giorni: ${contratti.length} contratti</div>
                </div>
                <div class="list-group">
        `;

        const slice = contratti.slice(0, 5);
        slice.forEach(contratto => {
            const giorni = Math.ceil((new Date(contratto.dataScadenza) - new Date()) / (1000 * 60 * 60 * 24));
            html += UI.createListItem({
                title: contratto.clienteRagioneSociale || 'Cliente non specificato',
                subtitle: `${contratto.numeroContratto || 'N/A'} - Scadenza: ${DataService.formatDate(contratto.dataScadenza)}`,
                badge: `${giorni}gg`,
                badgeClass: giorni < 30 ? 'badge-warning' : 'badge-info',
                icon: 'file-contract',
                onclick: `UI.showPage("dettaglio-contratto", "${contratto.id}")`
            });
        });

        html += `
                </div>
            </div>
        `;

        return html;
    },

    async renderAndamentoMensile(fatture, clienti, contratti, app) {
        const metrics = this.calculateMonthlyMetrics(clienti, contratti, app);

        const chartId1 = 'chart-nuovi-clienti-' + Date.now();
        const chartId2 = 'chart-contratti-' + (Date.now() + 1);
        const chartId3 = 'chart-app-sviluppo-' + (Date.now() + 2);

        setTimeout(() => {
            this.createChartNuoviClienti(chartId1, metrics.nuoviClienti);
            this.createChartContratti(chartId2, metrics.contrattiAttivati, metrics.contrattiScaduti);
            this.createChartApps(chartId3, metrics.appInSviluppo);
        }, 100);

        return `
            <div class="card fade-in">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-chart-line"></i> Andamento Generale del Mese
                    </h2>
                    <div class="card-subtitle">${metrics.mese}</div>
                </div>
                <div class="card-body">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 2rem;">
                        <!-- Grafico 1: Nuovi Clienti -->
                        <div style="text-align: center;">
                            <h3 style="font-size: 1rem; color: var(--blu-700); margin-bottom: 1rem;">
                                <i class="fas fa-user-plus"></i> Nuovi Clienti
                            </h3>
                            <canvas id="${chartId1}" width="200" height="200"></canvas>
                            <div style="margin-top: 0.5rem; font-size: 1.5rem; font-weight: 700; color: var(--blu-700);">
                                ${metrics.nuoviClienti}
                            </div>
                        </div>

                        <!-- Grafico 2: Contratti -->
                        <div style="text-align: center;">
                            <h3 style="font-size: 1rem; color: var(--verde-700); margin-bottom: 1rem;">
                                <i class="fas fa-file-contract"></i> Contratti
                            </h3>
                            <canvas id="${chartId2}" width="200" height="200"></canvas>
                            <div style="margin-top: 0.5rem; font-size: 0.875rem; color: var(--grigio-700);">
                                <span style="color: var(--verde-700); font-weight: 700;">${metrics.contrattiAttivati} attivati</span> •
                                <span style="color: var(--rosso-errore); font-weight: 700;">${metrics.contrattiScaduti} scaduti</span>
                            </div>
                        </div>

                        <!-- Grafico 3: App in Sviluppo -->
                        <div style="text-align: center;">
                            <h3 style="font-size: 1rem; color: var(--azzurro-info); margin-bottom: 1rem;">
                                <i class="fas fa-mobile-alt"></i> Nuove App
                            </h3>
                            <canvas id="${chartId3}" width="200" height="200"></canvas>
                            <div style="margin-top: 0.5rem; font-size: 1.5rem; font-weight: 700; color: var(--azzurro-info);">
                                ${metrics.appInSviluppo}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    createChartNuoviClienti(canvasId, count) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Nuovi', 'Obiettivo rimanente'],
                datasets: [{
                    data: [count, Math.max(0, 10 - count)],
                    backgroundColor: [
                        'rgb(20, 82, 132)',  // blu-700
                        'rgb(209, 226, 242)'  // blu-100
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: true }
                },
                cutout: '70%',
                animation: {
                    animateRotate: true,
                    animateScale: true,
                    duration: 1000,
                    easing: 'easeOutQuart'
                }
            }
        });
    },

    createChartContratti(canvasId, attivati, scaduti) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Attivati', 'Scaduti'],
                datasets: [{
                    label: 'Contratti',
                    data: [attivati, scaduti],
                    backgroundColor: [
                        'rgb(60, 164, 52)',   // verde-700
                        'rgb(211, 47, 47)'    // rosso-errore
                    ],
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: true }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeOutBounce'
                }
            }
        });
    },

    createChartApps(canvasId, count) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['In Sviluppo', 'Altre'],
                datasets: [{
                    data: [count, Math.max(0, 5 - count)],
                    backgroundColor: [
                        'rgb(2, 136, 209)',   // azzurro-info
                        'rgb(245, 245, 245)'  // grigio-100
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: true }
                },
                cutout: '70%',
                animation: {
                    animateRotate: true,
                    animateScale: true,
                    duration: 1000,
                    easing: 'easeOutQuart'
                }
            }
        });
    },


    renderStatoApp(clienti) {
        const stati = {
            ATTIVA: clienti.filter(c => c.statoApp === 'ATTIVA').length,
            IN_SVILUPPO: clienti.filter(c => c.statoApp === 'IN_SVILUPPO').length,
            SOSPESA: clienti.filter(c => c.statoApp === 'SOSPESA').length,
            DEMO: clienti.filter(c => c.statoApp === 'DEMO').length
        };

        return `
            <div class="card fade-in">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-mobile-alt"></i> Stato App
                    </h2>
                </div>
                <div class="card-body">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 1rem;">
                        <div class="stat-box">
                            <div class="stat-value" style="color: var(--verde-700);">${stati.ATTIVA}</div>
                            <div class="stat-label">Attive</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value" style="color: var(--azzurro-info);">${stati.IN_SVILUPPO}</div>
                            <div class="stat-label">In Sviluppo</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value" style="color: var(--giallo-avviso);">${stati.SOSPESA}</div>
                            <div class="stat-label">Sospese</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value" style="color: var(--grigio-500);">${stati.DEMO}</div>
                            <div class="stat-label">Demo</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderUltimiClienti(clienti) {
        const ultimi = [...clienti]
            .sort((a, b) => new Date(b.dataInserimento || 0) - new Date(a.dataInserimento || 0))
            .slice(0, 5);

        if (ultimi.length === 0) {
            return `
                <div class="card fade-in">
                    <div class="card-header">
                        <h2 class="card-title">
                            <i class="fas fa-user-plus"></i> Ultimi Clienti
                        </h2>
                    </div>
                    <div class="empty-state">
                        <p>Nessun cliente presente</p>
                    </div>
                </div>
            `;
        }

        let html = `
            <div class="card fade-in">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-user-plus"></i> Ultimi Clienti Aggiunti
                    </h2>
                </div>
                <div class="list-group">
        `;

        ultimi.forEach(cliente => {
            const badgeClass = DataService.getStatoBadgeClass(cliente.statoContratto);
            html += UI.createListItem({
                title: cliente.ragioneSociale,
                subtitle: cliente.citta || '-',
                badge: cliente.statoContratto?.replace('_', ' '),
                badgeClass,
                icon: 'building',
                onclick: `UI.showPage("dettaglio-cliente", "${cliente.id}")`
            });
        });

        html += `
                </div>
            </div>
        `;

        return html;
    },

    // === HELPER FUNCTIONS ===

    calculateMonthlyMetrics(clienti, contratti, app) {
        const oggi = new Date();
        const primoGiornoMese = new Date(oggi.getFullYear(), oggi.getMonth(), 1);
        const ultimoGiornoMese = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 0);

        // Nuovi clienti del mese
        const nuoviClienti = clienti.filter(c => {
            if (!c.dataInserimento) return false;
            const data = new Date(c.dataInserimento);
            return data >= primoGiornoMese && data <= ultimoGiornoMese;
        }).length;

        // Contratti attivati nel mese
        const contrattiAttivati = contratti.filter(c => {
            if (!c.dataInizio || c.stato !== 'ATTIVO') return false;
            const data = new Date(c.dataInizio);
            return data >= primoGiornoMese && data <= ultimoGiornoMese;
        }).length;

        // Contratti scaduti nel mese
        const contrattiScaduti = contratti.filter(c => {
            if (!c.dataScadenza) return false;
            const data = new Date(c.dataScadenza);
            return data >= primoGiornoMese && data <= ultimoGiornoMese && c.stato === 'SCADUTO';
        }).length;

        // App in sviluppo del mese
        const appInSviluppo = app.filter(a => {
            if (!a.dataCreazione) return false;
            const data = new Date(a.dataCreazione);
            return data >= primoGiornoMese && data <= ultimoGiornoMese &&
                   (a.statoApp === 'SVILUPPO' || a.statoApp === 'IN_SVILUPPO');
        }).length;

        return {
            nuoviClienti,
            contrattiAttivati,
            contrattiScaduti,
            appInSviluppo,
            mese: oggi.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
        };
    },

    // === NUOVI WIDGET KPI ===

    renderStatisticheKPI(stats, scadenzeScadute, contrattiTutti, fattureScadute, tasks) {
        // Contratti scaduti: data scadenza passata e non cessati
        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);
        const contrattiScadutiList = contrattiTutti.filter(c => {
            if (!c.dataScadenza || c.stato === 'CESSATO') return false;
            return new Date(c.dataScadenza) < oggi;
        });
        const contrattiScadutiCount = contrattiScadutiList.length;

        // Calcola fatturato scaduto da recuperare
        const fatturatoScaduto = fattureScadute.reduce((sum, f) => sum + (f.importoTotale || 0), 0);

        // Salva in cache per drill-down
        this._kpiData = {
            scadenzeScadute,
            contrattiScaduti: contrattiScadutiList,
            fattureScadute,
            tasks
        };

        // Calcola task urgenti in corso (IN_PROGRESS con priorità ALTA o URGENTE)
        const taskUrgenti = tasks.filter(t =>
            t.stato === 'IN_PROGRESS' &&
            (t.priorita === 'ALTA' || t.priorita === 'URGENTE')
        ).length;

        // Costruisci KPI in base ai permessi
        let kpiCards = [];

        // Scadenze Critiche - visibile se può gestire pagamenti o vedere tutto
        if (AuthService.hasPermission('manage_payments') || AuthService.hasPermission('view_all_data')) {
            kpiCards.push(UI.createKPICard({
                icon: 'exclamation-triangle',
                iconClass: 'critical',
                label: 'Scadenze Critiche',
                value: scadenzeScadute.length,
                onclick: 'Dashboard.mostraDettaglioKPI("scadenzeCritiche")'
            }));
        }

        // Contratti Scaduti - visibile se può gestire contratti
        if (AuthService.hasPermission('manage_contracts') || AuthService.hasPermission('view_contracts') || AuthService.hasPermission('view_all_data')) {
            kpiCards.push(UI.createKPICard({
                icon: 'file-contract',
                iconClass: 'warning',
                label: 'Contratti Scaduti',
                value: contrattiScadutiCount,
                onclick: 'Dashboard.mostraDettaglioKPI("contrattiScaduti")'
            }));
        }

        // Fatturato da Incassare - visibile se può gestire fatture
        if (AuthService.hasPermission('manage_invoices') || AuthService.hasPermission('view_invoices') || AuthService.hasPermission('view_all_data')) {
            kpiCards.push(UI.createKPICard({
                icon: 'euro-sign',
                iconClass: 'danger',
                label: 'Fatturato da Incassare',
                value: DataService.formatCurrency(fatturatoScaduto),
                onclick: 'Dashboard.mostraDettaglioKPI("fatturatoScaduto")'
            }));
        }

        // Task Urgenti - visibile se può vedere task
        if (AuthService.hasPermission('view_dev_tasks') || AuthService.hasPermission('manage_dev_tasks') || AuthService.hasPermission('view_all_data')) {
            kpiCards.push(UI.createKPICard({
                icon: 'tasks',
                iconClass: 'info',
                label: 'Task Urgenti',
                value: taskUrgenti,
                onclick: 'UI.showPage("task")'
            }));
        }

        // Se non ci sono KPI da mostrare, mostra messaggio
        if (kpiCards.length === 0) {
            return `
                <div class="empty-state">
                    <i class="fas fa-chart-line"></i>
                    <p>Nessuna statistica disponibile con i tuoi permessi</p>
                </div>
            `;
        }

        return `
            <div class="kpi-grid fade-in">
                ${kpiCards.join('')}
            </div>
        `;
    },

    // =========================================================================
    // DRILL-DOWN KPI: mostra dettaglio al click sulla card
    // =========================================================================
    mostraDettaglioKPI(tipo) {
        if (!this._kpiData) return;

        let titolo = '';
        let listaHtml = '';

        switch (tipo) {
            case 'scadenzeCritiche': {
                const items = this._kpiData.scadenzeScadute;
                titolo = `Scadenze Critiche (${items.length})`;
                if (items.length === 0) {
                    listaHtml = '<p style="color:var(--grigio-500);text-align:center;padding:1rem;">Nessuna scadenza critica</p>';
                } else {
                    listaHtml = '<div class="list-group">';
                    for (const s of items.slice(0, 30)) {
                        const giorni = Math.abs(Math.ceil((new Date(s.dataScadenza) - new Date()) / (1000 * 60 * 60 * 24)));
                        let tipoLabel = s.tipo === 'CONTRATTO_RINNOVO' ? 'Rinnovo' : s.tipo === 'FATTURA_INCASSO' ? 'Incasso' : s.tipo === 'FATTURA_EMISSIONE' ? 'Emissione' : s.tipo;
                        let onclick = s.tipo === 'CONTRATTO_RINNOVO' ? `UI.showPage('dettaglio-contratto','${s.id}')` :
                                      s.tipo === 'FATTURA_INCASSO' ? `UI.showPage('dettaglio-fattura','${s.id}')` :
                                      s.contrattoId ? `UI.showPage('dettaglio-contratto','${s.contrattoId}')` : '';
                        listaHtml += `
                            <div class="list-item" style="cursor:${onclick ? 'pointer' : 'default'};" ${onclick ? `onclick="${onclick}"` : ''}>
                                <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;">
                                    <div style="flex:1;min-width:0;">
                                        <div style="font-weight:600;color:var(--grigio-900);">${s.clienteRagioneSociale || 'N/A'}</div>
                                        <div style="font-size:0.8rem;color:var(--grigio-500);">${tipoLabel} • ${s.descrizione || ''}</div>
                                    </div>
                                    <div style="text-align:right;flex-shrink:0;">
                                        <span class="badge badge-danger">${giorni}gg fa</span>
                                        ${s.importo || s.importoTotale ? `<div style="font-size:0.8rem;font-weight:600;color:var(--grigio-700);margin-top:0.25rem;">${DataService.formatCurrency(s.importo || s.importoTotale)}</div>` : ''}
                                    </div>
                                </div>
                            </div>`;
                    }
                    listaHtml += '</div>';
                }
                break;
            }
            case 'contrattiScaduti': {
                const items = this._kpiData.contrattiScaduti;
                titolo = `Contratti Scaduti (${items.length})`;
                if (items.length === 0) {
                    listaHtml = '<p style="color:var(--grigio-500);text-align:center;padding:1rem;">Nessun contratto scaduto</p>';
                } else {
                    listaHtml = '<div class="list-group">';
                    for (const c of items.sort((a, b) => new Date(a.dataScadenza) - new Date(b.dataScadenza))) {
                        const giorni = Math.abs(Math.ceil((new Date(c.dataScadenza) - new Date()) / (1000 * 60 * 60 * 24)));
                        listaHtml += `
                            <div class="list-item" style="cursor:pointer;" onclick="UI.showPage('dettaglio-contratto','${c.id}')">
                                <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;">
                                    <div style="flex:1;min-width:0;">
                                        <div style="font-weight:600;color:var(--grigio-900);">${c.clienteRagioneSociale || c.ragioneSociale || 'N/A'}</div>
                                        <div style="font-size:0.8rem;color:var(--grigio-500);">${c.numeroContratto || ''} • ${c.oggetto || ''} • Stato: ${c.stato || 'N/A'}</div>
                                    </div>
                                    <div style="text-align:right;flex-shrink:0;">
                                        <span class="badge badge-warning">Scaduto da ${giorni}gg</span>
                                        ${c.importoAnnuale ? `<div style="font-size:0.8rem;font-weight:600;color:var(--grigio-700);margin-top:0.25rem;">${DataService.formatCurrency(c.importoAnnuale)}/anno</div>` : ''}
                                    </div>
                                </div>
                            </div>`;
                    }
                    listaHtml += '</div>';
                }
                break;
            }
            case 'fatturatoScaduto': {
                const items = this._kpiData.fattureScadute;
                const totale = items.reduce((sum, f) => sum + (f.importoTotale || 0), 0);
                titolo = `Fatturato da Incassare — ${items.length} fatture • Totale: ${DataService.formatCurrency(totale)}`;
                if (items.length === 0) {
                    listaHtml = '<p style="color:var(--grigio-500);text-align:center;padding:1rem;">Nessuna fattura scaduta</p>';
                } else {
                    listaHtml = '<div class="list-group">';
                    for (const f of items.sort((a, b) => new Date(a.dataScadenza) - new Date(b.dataScadenza))) {
                        const giorni = Math.abs(Math.ceil((new Date(f.dataScadenza) - new Date()) / (1000 * 60 * 60 * 24)));
                        listaHtml += `
                            <div class="list-item" style="cursor:pointer;" onclick="UI.showPage('dettaglio-fattura','${f.id}')">
                                <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;">
                                    <div style="flex:1;min-width:0;">
                                        <div style="font-weight:600;color:var(--grigio-900);">${f.clienteRagioneSociale || 'N/A'}</div>
                                        <div style="font-size:0.8rem;color:var(--grigio-500);">${f.numeroFatturaCompleto || f.numeroFattura || 'Fattura'} • Scadenza: ${DataService.formatDate(f.dataScadenza)} • ${f.statoPagamento === 'PARZIALMENTE_PAGATA' ? 'Parz. pagata' : 'Non pagata'}</div>
                                    </div>
                                    <div style="text-align:right;flex-shrink:0;">
                                        <span class="badge badge-danger">${giorni}gg fa</span>
                                        <div style="font-size:1rem;font-weight:700;color:#D32F2F;margin-top:0.25rem;">${DataService.formatCurrency(f.importoTotale)}</div>
                                    </div>
                                </div>
                            </div>`;
                    }
                    listaHtml += '</div>';
                }
                break;
            }
            default:
                return;
        }

        // Mostra il dettaglio sotto le card KPI
        let container = document.getElementById('kpiDrillDown');
        if (!container) {
            const kpiGrid = document.querySelector('.kpi-grid');
            if (!kpiGrid) return;
            container = document.createElement('div');
            container.id = 'kpiDrillDown';
            kpiGrid.parentNode.insertBefore(container, kpiGrid.nextSibling);
        }

        container.innerHTML = `
            <div class="card fade-in" style="margin-top:1.5rem;">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
                    <h2 class="card-title" style="font-size:1rem;">
                        <i class="fas fa-list"></i> ${titolo}
                    </h2>
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('kpiDrillDown').innerHTML=''">
                        <i class="fas fa-times"></i> Chiudi
                    </button>
                </div>
                <div style="max-height:500px;overflow-y:auto;">
                    ${listaHtml}
                </div>
            </div>
        `;

        // Scrolla per mostrare il dettaglio
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    renderStatoAppCorretto(app) {
        if (!app || app.length === 0) {
            return `
                <div class="card fade-in">
                    <div class="card-header">
                        <h2 class="card-title">
                            <i class="fas fa-mobile-alt"></i> Stato App
                        </h2>
                    </div>
                    <div class="empty-state">
                        <i class="fas fa-info-circle"></i>
                        <p>Nessuna app presente</p>
                    </div>
                </div>
            `;
        }

        // Conta per ogni stato
        const statiCount = {};
        const totale = app.length;

        app.forEach(a => {
            const stato = a.statoApp || 'NON_DEFINITO';
            statiCount[stato] = (statiCount[stato] || 0) + 1;
        });

        // Ordina stati per count decrescente
        const statiOrdinati = Object.entries(statiCount)
            .sort((a, b) => b[1] - a[1]);

        // Colori per stati
        const coloriStato = {
            'ATTIVA': 'var(--verde-700)',
            'SVILUPPO': 'var(--azzurro-info)',
            'IN_SVILUPPO': 'var(--azzurro-info)',
            'SOSPESA': 'var(--giallo-avviso)',
            'DISATTIVATA': 'var(--rosso-errore)',
            'DISATTIVA': 'var(--rosso-errore)',  // Vecchio valore, deprecato
            'DISATTIVO': 'var(--grigio-500)',  // Vecchio stato, deprecato
            'DEMO': 'var(--blu-500)',
            'NON_DEFINITO': 'var(--grigio-300)'
        };

        let statsHTML = '';
        statiOrdinati.forEach(([stato, count]) => {
            const percentuale = ((count / totale) * 100).toFixed(0);
            const colore = coloriStato[stato] || 'var(--grigio-500)';
            const label = stato.replace('_', ' ');

            statsHTML += `
                <div class="stat-box">
                    <div class="stat-value" style="color: ${colore};">${count}</div>
                    <div class="stat-label">${label}</div>
                    <div style="font-size: 0.75rem; color: var(--grigio-500); margin-top: 0.25rem;">${percentuale}%</div>
                </div>
            `;
        });

        return `
            <div class="card fade-in">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-mobile-alt"></i> Stato App
                    </h2>
                    <div class="card-subtitle">Distribuzione ${totale} app per stato</div>
                </div>
                <div class="card-body">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 1rem;">
                        ${statsHTML}
                    </div>
                    <div style="text-align: center; margin-top: 1.5rem;">
                        <button class="btn btn-primary btn-sm" onclick="UI.showPage('app')">
                            <i class="fas fa-mobile-alt"></i> Vedi tutte le app
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    async renderScadenzeImminenteCompatta(scadenzeCalcolate, contrattiInScadenza, fattureInScadenza) {
        // Le scadenze sono già calcolate da contratti e fatture reali
        const oggi = new Date();
        const tutteScadenze = scadenzeCalcolate;

        if (tutteScadenze.length === 0) {
            return `
                <div class="card fade-in">
                    <div class="card-header">
                        <h2 class="card-title">
                            <i class="fas fa-calendar-check"></i> Scadenze Imminenti
                        </h2>
                    </div>
                    <div class="empty-state">
                        <i class="fas fa-check-circle"></i>
                        <h3>Nessuna scadenza nei prossimi 30 giorni</h3>
                    </div>
                </div>
            `;
        }

        let html = `
            <div class="card fade-in">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-calendar-alt"></i> Scadenze Imminenti
                    </h2>
                    <div class="card-subtitle">Top 5 prossime scadenze • Totale: ${tutteScadenze.length}</div>
                </div>
                <div class="list-group">
        `;

        // Mostra solo le prime 5
        const slice = tutteScadenze.slice(0, 5);
        for (const scadenza of slice) {
            const giorni = Math.ceil((new Date(scadenza.dataScadenza) - oggi) / (1000 * 60 * 60 * 24));
            const urgenza = giorni < 0 ? 'scaduto' : giorni <= 7 ? 'critico' : 'normale';
            const badgeClass = urgenza === 'scaduto' ? 'badge-danger' :
                             urgenza === 'critico' ? 'badge-warning' : 'badge-info';

            // Icona per tipo calcolato
            let tipoIcon = 'calendar';
            if (scadenza.tipo === 'CONTRATTO_RINNOVO') tipoIcon = 'file-contract';
            else if (scadenza.tipo === 'FATTURA_INCASSO') tipoIcon = 'file-invoice-dollar';
            else if (scadenza.tipo === 'FATTURA_EMISSIONE') tipoIcon = 'file-invoice';

            const importo = scadenza.importo || scadenza.importoTotale;
            const subtitle = importo
                ? `${scadenza.descrizione || ''} • ${DataService.formatDate(scadenza.dataScadenza)} • ${DataService.formatCurrency(importo)}`
                : `${scadenza.descrizione || ''} • ${DataService.formatDate(scadenza.dataScadenza)}`;

            // Navigazione corretta
            let onclick = `UI.showPage('scadenzario')`;
            if (scadenza.tipo === 'CONTRATTO_RINNOVO') {
                onclick = `UI.showPage('dettaglio-contratto', '${scadenza.id}')`;
            } else if (scadenza.tipo === 'FATTURA_INCASSO') {
                onclick = `UI.showPage('dettaglio-fattura', '${scadenza.id}')`;
            } else if (scadenza.tipo === 'FATTURA_EMISSIONE' && scadenza.contrattoId) {
                onclick = `UI.showPage('dettaglio-contratto', '${scadenza.contrattoId}')`;
            }

            html += UI.createListItem({
                title: scadenza.clienteRagioneSociale || 'N/A',
                subtitle: subtitle,
                badge: urgenza === 'scaduto' ? 'SCADUTO' : `${giorni}gg`,
                badgeClass,
                icon: tipoIcon,
                onclick: onclick
            });
        }

        html += `
                </div>
                <div style="text-align: center; margin-top: 1rem;">
                    <button class="btn btn-primary btn-sm" onclick="UI.showPage('scadenzario')">
                        <i class="fas fa-calendar-alt"></i> Vedi tutte (${tutteScadenze.length})
                    </button>
                </div>
            </div>
        `;

        return html;
    },

    getTipoScadenzaLabel(tipo) {
        const labels = {
            'PAGAMENTO': 'Pagamento',
            'FATTURAZIONE': 'Fatturazione',
            'RINNOVO_CONTRATTO': 'Rinnovo Contratto'
        };
        return labels[tipo] || tipo;
    },

    // ============================================
    // === DASHBOARD DEDICATA PER AGENTE ===
    // ============================================
    async renderDashboardAgente() {
        const agenteNome = AuthService.getAgenteFilterName();
        if (!agenteNome) {
            UI.hideLoading();
            UI.showError('Impossibile identificare l\'agente. Contatta l\'amministratore.');
            return;
        }

        // Carica tutti i dati filtrati per l'agente
        const datiAgente = await DataService.getDatiAgente(agenteNome);
        const { clienti, fatture, contratti, app, scadenze, clienteIds } = datiAgente;

        // Calcola statistiche
        const oggi = new Date();
        const tra30giorni = new Date(oggi);
        tra30giorni.setDate(tra30giorni.getDate() + 30);

        // Fatture non pagate
        const fattureNonPagate = fatture.filter(f => f.statoPagamento === 'NON_PAGATA');
        const importoNonPagato = fattureNonPagate.reduce((sum, f) => sum + (f.importoTotale || 0), 0);

        // Fatture scadute
        const fattureScadute = fattureNonPagate.filter(f => {
            if (!f.dataScadenza) return false;
            return new Date(f.dataScadenza) < oggi;
        });

        // Helper: calcola importo considerando note di credito (sottraggono)
        const calcolaImportoFattura = (f) => {
            const importo = f.importoTotale || 0;
            const isNC = f.tipoDocumento === 'NOTA_DI_CREDITO' || (f.numeroFatturaCompleto || '').startsWith('NC-');
            return isNC ? -Math.abs(importo) : importo;
        };

        // Fatturato totale (pagate + note di credito)
        const fatturatoTotale = fatture
            .filter(f => f.statoPagamento === 'PAGATA' || f.tipoDocumento === 'NOTA_DI_CREDITO')
            .reduce((sum, f) => sum + calcolaImportoFattura(f), 0);

        // Fatturato anno corrente
        const annoCorrente = oggi.getFullYear();
        const fatturatoAnno = fatture
            .filter(f => (f.statoPagamento === 'PAGATA' || f.tipoDocumento === 'NOTA_DI_CREDITO') && f.dataEmissione && new Date(f.dataEmissione).getFullYear() === annoCorrente)
            .reduce((sum, f) => sum + calcolaImportoFattura(f), 0);

        // Fatturato mese corrente
        const meseCorrente = oggi.getMonth();
        const fatturatoMese = fatture
            .filter(f => (f.statoPagamento === 'PAGATA' || f.tipoDocumento === 'NOTA_DI_CREDITO') && f.dataEmissione && new Date(f.dataEmissione).getFullYear() === annoCorrente && new Date(f.dataEmissione).getMonth() === meseCorrente)
            .reduce((sum, f) => sum + calcolaImportoFattura(f), 0);

        // Contratti in scadenza
        const contrattiInScadenza = contratti.filter(c => {
            if (!c.dataScadenza || c.stato !== 'ATTIVO') return false;
            const scadenza = new Date(c.dataScadenza);
            return scadenza >= oggi && scadenza <= tra30giorni;
        });

        // Contratti scaduti (da rinnovare)
        const contrattiScaduti = contratti.filter(c => {
            if (!c.dataScadenza) return false;
            return c.stato === 'SCADUTO' || (c.stato === 'ATTIVO' && new Date(c.dataScadenza) < oggi);
        });

        // Clienti attivi vs altri
        const clientiAttivi = clienti.filter(c => c.statoContratto === 'ATTIVO');
        const clientiSenzaContratto = clienti.filter(c => c.statoContratto === 'SENZA_CONTRATTO');

        // Scadenze calcolate da contratti e fatture reali
        let scadenzeScadute = [];
        let scadenzeImminenti = [];
        try {
            const scadenzeCalcolate = await DataService.getScadenzeCompute({
                contratti: contratti,
                fatture: fatture
            });
            scadenzeScadute = scadenzeCalcolate.tutteLeScadenze.filter(s =>
                s.dataScadenza && new Date(s.dataScadenza) < oggi
            );
            scadenzeImminenti = scadenzeCalcolate.tutteLeScadenze.filter(s => {
                if (!s.dataScadenza) return false;
                const ds = new Date(s.dataScadenza);
                return ds >= oggi && ds <= tra30giorni;
            });
        } catch (e) { console.warn('Errore calcolo scadenze agente:', e); }

        // App attive
        const appAttive = app.filter(a => a.statoApp === 'ATTIVA');

        const mainContent = document.getElementById('mainContent');
        mainContent.innerHTML = `
            <div class="page-header mb-3">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                    <div>
                        <h1 style="font-size: 2rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                            <i class="fas fa-briefcase"></i> La mia Area
                        </h1>
                        <p style="color: var(--grigio-500);">
                            Benvenuto, <strong>${agenteNome}</strong> — Panoramica del tuo portafoglio clienti
                        </p>
                    </div>
                    ${this._vistaAgenteManuale ? `
                        <button class="btn btn-secondary" onclick="Dashboard.switchToVistaAdmin()" style="border: 2px solid var(--blu-700);">
                            <i class="fas fa-arrow-left"></i> Torna alla Dashboard
                        </button>
                    ` : ''}
                </div>
            </div>

            <!-- KPI PRINCIPALI AGENTE -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
                <div style="background: white; border-radius: 12px; padding: 1.2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border-left: 4px solid var(--blu-700); text-align: center;">
                    <div style="font-size: 2rem; font-weight: 900; color: var(--blu-700);">${clienti.length}</div>
                    <div style="font-size: 0.85rem; color: var(--grigio-500);">I miei Clienti</div>
                    <div style="font-size: 0.75rem; color: var(--verde-700); margin-top: 4px;">${clientiAttivi.length} attivi</div>
                </div>
                <div style="background: white; border-radius: 12px; padding: 1.2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border-left: 4px solid var(--verde-700); text-align: center;">
                    <div style="font-size: 2rem; font-weight: 900; color: var(--verde-700);">${contratti.filter(c => c.stato === 'ATTIVO').length}</div>
                    <div style="font-size: 0.85rem; color: var(--grigio-500);">Contratti Attivi</div>
                    <div style="font-size: 0.75rem; color: ${contrattiInScadenza.length > 0 ? '#FFCC00' : 'var(--grigio-500)'}; margin-top: 4px;">${contrattiInScadenza.length} in scadenza</div>
                </div>
                <div style="background: white; border-radius: 12px; padding: 1.2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border-left: 4px solid #0288D1; text-align: center;">
                    <div style="font-size: 2rem; font-weight: 900; color: #0288D1;">${appAttive.length}</div>
                    <div style="font-size: 0.85rem; color: var(--grigio-500);">App Attive</div>
                    <div style="font-size: 0.75rem; color: var(--grigio-500); margin-top: 4px;">su ${app.length} totali</div>
                </div>
                <div style="background: white; border-radius: 12px; padding: 1.2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border-left: 4px solid ${fattureScadute.length > 0 ? '#D32F2F' : 'var(--grigio-300)'}; text-align: center;">
                    <div style="font-size: 2rem; font-weight: 900; color: ${fattureNonPagate.length > 0 ? '#D32F2F' : 'var(--grigio-700)'};">${fattureNonPagate.length}</div>
                    <div style="font-size: 0.85rem; color: var(--grigio-500);">Fatture da Incassare</div>
                    <div style="font-size: 0.75rem; color: #D32F2F; margin-top: 4px;">${DataService.formatCurrency(importoNonPagato)}</div>
                </div>
            </div>

            <!-- FATTURATO -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
                <div style="background: linear-gradient(135deg, var(--blu-700), var(--blu-500)); border-radius: 12px; padding: 1.5rem; color: white; text-align: center;">
                    <div style="font-size: 0.85rem; opacity: 0.8; margin-bottom: 0.5rem;">
                        <i class="fas fa-euro-sign"></i> Fatturato ${annoCorrente}
                    </div>
                    <div style="font-size: 1.8rem; font-weight: 900;">${DataService.formatCurrency(fatturatoAnno)}</div>
                </div>
                <div style="background: linear-gradient(135deg, var(--verde-700), var(--verde-500)); border-radius: 12px; padding: 1.5rem; color: white; text-align: center;">
                    <div style="font-size: 0.85rem; opacity: 0.8; margin-bottom: 0.5rem;">
                        <i class="fas fa-chart-line"></i> Fatturato Mese
                    </div>
                    <div style="font-size: 1.8rem; font-weight: 900;">${DataService.formatCurrency(fatturatoMese)}</div>
                </div>
                <div style="background: linear-gradient(135deg, #0D3A5C, #145284); border-radius: 12px; padding: 1.5rem; color: white; text-align: center;">
                    <div style="font-size: 0.85rem; opacity: 0.8; margin-bottom: 0.5rem;">
                        <i class="fas fa-coins"></i> Fatturato Totale
                    </div>
                    <div style="font-size: 1.8rem; font-weight: 900;">${DataService.formatCurrency(fatturatoTotale)}</div>
                </div>
            </div>

            <!-- DUE COLONNE: ALERT + AZIONI -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
                ${this.renderAgenteAlerts(scadenzeScadute, scadenzeImminenti, contrattiInScadenza, contrattiScaduti, fattureScadute, clientiSenzaContratto)}
                ${this.renderAgenteClientiRecap(clienti, contratti, fatture)}
            </div>

            <!-- LISTA FATTURE NON PAGATE -->
            ${this.renderAgenteFattureNonPagate(fattureNonPagate, clienti)}

            <!-- CONTRATTI IN SCADENZA -->
            ${this.renderAgenteContrattiScadenza(contrattiInScadenza, contrattiScaduti)}

            <!-- LISTA CLIENTI -->
            ${this.renderAgenteListaClienti(clienti, contratti, fatture)}

            <!-- NUOVI WIDGET: Prossime Attività, Task Aperti, Azioni Rapide -->
            <!-- LE MIE APP -->
            ${app.length > 0 ? `
            <div style="background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.06); margin-top: 1.5rem;">
                <h3 style="font-size: 1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 1rem;">
                    <i class="fas fa-mobile-alt"></i> Le Mie App (${app.length})
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 0.75rem;">
                    ${app.map(a => {
                        const clienteApp = clienti.find(c => c.id === a.clientePaganteId);
                        return `
                        <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: var(--grigio-100); border-radius: 10px; cursor: pointer;" onclick="UI.showPage('dettaglio-app', '${a.id}')">
                            ${a.iconaUrl
                                ? `<img src="${a.iconaUrl}" alt="${a.nome}" style="width: 40px; height: 40px; border-radius: 10px; object-fit: cover; flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,0.18); border: 1px solid rgba(0,0,0,0.08);" />`
                                : `<div style="width: 40px; height: 40px; border-radius: 10px; background: var(--blu-100); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                    <i class="fas fa-mobile-alt" style="color: var(--blu-700); font-size: 0.9rem;"></i>
                                  </div>`
                            }
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-weight: 600; font-size: 0.85rem; color: var(--grigio-900); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${a.nome}</div>
                                <div style="font-size: 0.7rem; color: var(--grigio-500);">${clienteApp?.ragioneSociale || ''}</div>
                            </div>
                            <div style="display: flex; gap: 0.35rem; flex-shrink: 0;">
                                ${a.urlSito ? `<a href="${a.urlSito}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Vedi l'app" style="display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; background: var(--blu-700); color: white; text-decoration: none; font-size: 0.7rem;"><i class="fas fa-external-link-alt"></i></a>` : ''}
                                ${a.urlCruscotto ? `<a href="${a.urlCruscotto}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Cruscotto" style="display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; background: var(--verde-700); color: white; text-decoration: none; font-size: 0.7rem;"><i class="fas fa-cogs"></i></a>` : ''}
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
            ` : ''}

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; margin-top: 1.5rem;">
                <!-- PROSSIME ATTIVITÀ (7gg) -->
                <div id="widgetProssimeAttivita" style="background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
                    <h3 style="font-size: 1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 1rem;">
                        <i class="fas fa-calendar-week"></i> Prossime Attività (7gg)
                    </h3>
                    ${this.renderWidgetProssimeAttivita([...scadenzeScadute, ...scadenzeImminenti])}
                </div>

                <!-- I MIEI TASK APERTI -->
                <div id="widgetTaskAperti" style="background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
                    <h3 style="font-size: 1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 1rem;">
                        <i class="fas fa-tasks"></i> I Miei Task Aperti
                    </h3>
                    <div id="widgetTaskApertiContent">
                        <div style="text-align:center;padding:1rem;"><i class="fas fa-spinner fa-spin" style="color:var(--grigio-400);"></i></div>
                    </div>
                </div>

                <!-- AZIONI RAPIDE -->
                <div style="background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
                    <h3 style="font-size: 1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 1rem;">
                        <i class="fas fa-bolt"></i> Azioni Rapide
                    </h3>
                    <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                        <button class="btn btn-primary" onclick="UI.showPage('gestione-task')" style="width: 100%; text-align: left;">
                            <i class="fas fa-plus-circle"></i> Nuovo Task
                        </button>
                        <button class="btn btn-secondary" onclick="UI.showPage('scadenzario')" style="width: 100%; text-align: left;">
                            <i class="fas fa-calendar-check"></i> Vedi Scadenzario
                        </button>
                        <button class="btn btn-secondary" onclick="UI.showPage('report')" style="width: 100%; text-align: left;">
                            <i class="fas fa-chart-bar"></i> Vedi Report
                        </button>
                        <button class="btn btn-secondary" onclick="UI.showPage('clienti')" style="width: 100%; text-align: left;">
                            <i class="fas fa-users"></i> I Miei Clienti
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Carica task aperti in modo asincrono
        this.loadWidgetTaskAperti();

        UI.hideLoading();
    },

    /**
     * Widget: Prossime attività nei prossimi 7 giorni
     */
    renderWidgetProssimeAttivita(scadenze) {
        const oggi = new Date();
        const tra7gg = new Date(oggi);
        tra7gg.setDate(tra7gg.getDate() + 7);

        const prossime = scadenze
            .filter(s => {
                if (!s.dataScadenza) return false;
                const data = new Date(s.dataScadenza);
                return data >= oggi && data <= tra7gg;
            })
            .sort((a, b) => new Date(a.dataScadenza) - new Date(b.dataScadenza))
            .slice(0, 5);

        if (prossime.length === 0) {
            return `<div style="text-align:center;padding:1rem;color:var(--grigio-400);"><i class="fas fa-check-circle" style="font-size:1.5rem;display:block;margin-bottom:0.5rem;"></i>Nessuna attività nei prossimi 7 giorni</div>`;
        }

        const tipoIcons = {
            'CONTRATTO_RINNOVO': 'fas fa-sync-alt',
            'FATTURA_EMISSIONE': 'fas fa-file-invoice',
            'FATTURA_INCASSO': 'fas fa-euro-sign',
            'FATTURAZIONE': 'fas fa-file-invoice',
            'RINNOVO_CONTRATTO': 'fas fa-sync-alt',
            'PAGAMENTO': 'fas fa-euro-sign'
        };

        const tipoColors = {
            'CONTRATTO_RINNOVO': '#3CA434',
            'FATTURA_EMISSIONE': '#E67E22',
            'FATTURA_INCASSO': '#D32F2F',
            'FATTURAZIONE': '#E67E22',
            'RINNOVO_CONTRATTO': '#3CA434',
            'PAGAMENTO': '#D32F2F'
        };

        let html = prossime.map(s => {
            const icon = tipoIcons[s.tipo] || 'fas fa-bell';
            const color = tipoColors[s.tipo] || 'var(--blu-500)';
            const dataStr = DataService.formatDate(s.dataScadenza);
            const giorniMancanti = Math.ceil((new Date(s.dataScadenza) - oggi) / (1000 * 60 * 60 * 24));

            // Navigazione corretta per tipo calcolato
            let onclick = `UI.showPage('scadenzario')`;
            if (s.tipo === 'CONTRATTO_RINNOVO') onclick = `UI.showPage('dettaglio-contratto', '${s.id}')`;
            else if (s.tipo === 'FATTURA_INCASSO') onclick = `UI.showPage('dettaglio-fattura', '${s.id}')`;
            else if (s.tipo === 'FATTURA_EMISSIONE' && s.contrattoId) onclick = `UI.showPage('dettaglio-contratto', '${s.contrattoId}')`;

            return `
                <div style="display:flex;gap:0.75rem;align-items:center;padding:0.6rem;border-radius:8px;background:var(--grigio-100);margin-bottom:0.5rem;cursor:pointer;"
                     onclick="${onclick}">
                    <i class="${icon}" style="color:${color};font-size:0.9rem;width:20px;text-align:center;"></i>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:0.85rem;font-weight:600;color:var(--grigio-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.clienteRagioneSociale || s.descrizione || s.tipo}</div>
                        <div style="font-size:0.75rem;color:var(--grigio-500);">${s.descrizione ? s.descrizione.substring(0, 40) : ''}</div>
                    </div>
                    <div style="text-align:right;flex-shrink:0;">
                        <div style="font-size:0.75rem;font-weight:600;color:${giorniMancanti <= 2 ? '#D32F2F' : 'var(--grigio-700)'};">${giorniMancanti === 0 ? 'OGGI' : giorniMancanti === 1 ? 'Domani' : `${giorniMancanti}gg`}</div>
                        ${s.importo ? `<div style="font-size:0.7rem;color:var(--grigio-500);">${DataService.formatCurrency(s.importo)}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        const totaleScadenze7gg = scadenze.filter(s => s.dataScadenza && new Date(s.dataScadenza) >= oggi && new Date(s.dataScadenza) <= tra7gg).length;
        if (totaleScadenze7gg > 5) {
            html += `<div style="text-align:center;margin-top:0.5rem;"><a href="#" onclick="UI.showPage('scadenzario');return false;" style="font-size:0.8rem;color:var(--blu-500);text-decoration:none;">Vedi tutte (${totaleScadenze7gg}) →</a></div>`;
        }

        return html;
    },

    /**
     * Widget: Task aperti (caricamento asincrono)
     */
    async loadWidgetTaskAperti() {
        try {
            const allTasks = await TaskService.getAllTasks();
            const currentUserId = AuthService.getUserId();

            // Filtra task dell'agente (assegnati o creati)
            const myTasks = allTasks.filter(task => {
                if (task.stato === 'COMPLETATO') return false;
                if (task.creatoDa === currentUserId) return true;
                if (task.assegnatiA && Array.isArray(task.assegnatiA) && task.assegnatiA.includes(currentUserId)) return true;
                return false;
            }).slice(0, 5);

            const container = document.getElementById('widgetTaskApertiContent');
            if (!container) return;

            if (myTasks.length === 0) {
                container.innerHTML = `<div style="text-align:center;padding:1rem;color:var(--grigio-400);"><i class="fas fa-clipboard-check" style="font-size:1.5rem;display:block;margin-bottom:0.5rem;"></i>Nessun task aperto</div>`;
                return;
            }

            const prioritaColors = {
                'ALTA': '#D32F2F',
                'MEDIA': '#FFCC00',
                'BASSA': '#3CA434'
            };

            let html = myTasks.map(t => {
                const prColor = prioritaColors[t.priorita] || 'var(--grigio-400)';
                return `
                    <div style="display:flex;gap:0.75rem;align-items:center;padding:0.6rem;border-radius:8px;background:var(--grigio-100);margin-bottom:0.5rem;cursor:pointer;"
                         onclick="UI.showPage('gestione-task')">
                        <div style="width:8px;height:8px;border-radius:50%;background:${prColor};flex-shrink:0;"></div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:0.85rem;font-weight:600;color:var(--grigio-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.titolo || 'Task senza titolo'}</div>
                            <div style="font-size:0.75rem;color:var(--grigio-500);">${t.appNome || ''} ${t.stato ? '• ' + t.stato.replace('_', ' ') : ''}</div>
                        </div>
                        <span style="font-size:0.65rem;padding:0.15rem 0.4rem;border-radius:4px;background:${prColor}20;color:${prColor};font-weight:700;">${t.priorita || 'N/A'}</span>
                    </div>
                `;
            }).join('');

            const totaleTasks = allTasks.filter(task => {
                if (task.stato === 'COMPLETATO') return false;
                return task.creatoDa === currentUserId || (task.assegnatiA && task.assegnatiA.includes(currentUserId));
            }).length;

            if (totaleTasks > 5) {
                html += `<div style="text-align:center;margin-top:0.5rem;"><a href="#" onclick="UI.showPage('gestione-task');return false;" style="font-size:0.8rem;color:var(--blu-500);text-decoration:none;">Vedi tutti (${totaleTasks}) →</a></div>`;
            }

            container.innerHTML = html;

        } catch (error) {
            console.warn('Errore caricamento task agente:', error);
            const container = document.getElementById('widgetTaskApertiContent');
            if (container) {
                container.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--grigio-400);font-size:0.85rem;">Impossibile caricare i task</div>';
            }
        }
    },

    // === Widget Alert per Agente ===
    renderAgenteAlerts(scadenzeScadute, scadenzeImminenti, contrattiInScadenza, contrattiScaduti, fattureScadute, clientiSenzaContratto) {
        let alertItems = '';

        if (scadenzeScadute.length > 0) {
            alertItems += `<div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: #FFF3F3; border-radius: 8px; margin-bottom: 0.5rem;">
                <i class="fas fa-exclamation-circle" style="color: #D32F2F; font-size: 1.2rem;"></i>
                <div><strong style="color: #D32F2F;">${scadenzeScadute.length} scadenze arretrate</strong><br><span style="font-size: 0.8rem; color: var(--grigio-700);">Da gestire al più presto</span></div>
            </div>`;
        }
        if (fattureScadute.length > 0) {
            const importo = fattureScadute.reduce((s, f) => s + (f.importoTotale || 0), 0);
            alertItems += `<div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: #FFF3F3; border-radius: 8px; margin-bottom: 0.5rem;">
                <i class="fas fa-file-invoice-dollar" style="color: #D32F2F; font-size: 1.2rem;"></i>
                <div><strong style="color: #D32F2F;">${fattureScadute.length} fatture scadute</strong> (${DataService.formatCurrency(importo)})<br><span style="font-size: 0.8rem; color: var(--grigio-700);">Sollecitare il pagamento</span></div>
            </div>`;
        }
        if (contrattiScaduti.length > 0) {
            alertItems += `<div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: #FFF8E1; border-radius: 8px; margin-bottom: 0.5rem;">
                <i class="fas fa-file-contract" style="color: #FFCC00; font-size: 1.2rem;"></i>
                <div><strong style="color: #E6A800;">${contrattiScaduti.length} contratti scaduti</strong><br><span style="font-size: 0.8rem; color: var(--grigio-700);">Da rinnovare</span></div>
            </div>`;
        }
        if (contrattiInScadenza.length > 0) {
            alertItems += `<div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: #FFF8E1; border-radius: 8px; margin-bottom: 0.5rem;">
                <i class="fas fa-clock" style="color: #FFCC00; font-size: 1.2rem;"></i>
                <div><strong style="color: #E6A800;">${contrattiInScadenza.length} contratti in scadenza</strong><br><span style="font-size: 0.8rem; color: var(--grigio-700);">Prossimi 30 giorni</span></div>
            </div>`;
        }
        if (scadenzeImminenti.length > 0) {
            alertItems += `<div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: #E3F2FD; border-radius: 8px; margin-bottom: 0.5rem;">
                <i class="fas fa-calendar-check" style="color: #0288D1; font-size: 1.2rem;"></i>
                <div><strong style="color: #0288D1;">${scadenzeImminenti.length} scadenze imminenti</strong><br><span style="font-size: 0.8rem; color: var(--grigio-700);">Prossimi 30 giorni</span></div>
            </div>`;
        }
        if (clientiSenzaContratto.length > 0) {
            alertItems += `<div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: #FFF3F3; border-radius: 8px; margin-bottom: 0.5rem;">
                <i class="fas fa-exclamation-triangle" style="color: #D32F2F; font-size: 1.2rem;"></i>
                <div><strong style="color: #D32F2F;">${clientiSenzaContratto.length} clienti senza contratto</strong><br><span style="font-size: 0.8rem; color: var(--grigio-700);">Collegare contratto o verificare anagrafica</span></div>
            </div>`;
        }

        if (!alertItems) {
            alertItems = `<div style="text-align: center; padding: 2rem; color: var(--grigio-500);">
                <i class="fas fa-check-circle" style="font-size: 2rem; color: var(--verde-700); margin-bottom: 0.5rem;"></i>
                <p>Tutto in ordine! Nessun alert.</p>
            </div>`;
        }

        return `<div style="background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
            <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 1rem;">
                <i class="fas fa-bell"></i> Attenzione Richiesta
            </h3>
            ${alertItems}
        </div>`;
    },

    // === Riepilogo clienti per agente ===
    renderAgenteClientiRecap(clienti, contratti, fatture) {
        // Top 5 clienti per fatturato (note di credito sottraggono)
        const clientiFatturato = clienti.map(c => {
            const ids = new Set([c.id, c.clienteIdLegacy].filter(Boolean));
            const fattCliente = fatture.filter(f => ids.has(f.clienteId) && (f.statoPagamento === 'PAGATA' || f.tipoDocumento === 'NOTA_DI_CREDITO'));
            const totale = fattCliente.reduce((sum, f) => {
                const isNC = f.tipoDocumento === 'NOTA_DI_CREDITO' || (f.numeroFatturaCompleto || '').startsWith('NC-');
                return sum + (isNC ? -Math.abs(f.importoTotale || 0) : (f.importoTotale || 0));
            }, 0);
            return { ...c, fatturato: totale };
        }).sort((a, b) => b.fatturato - a.fatturato).slice(0, 5);

        let topHtml = '';
        clientiFatturato.forEach((c, i) => {
            topHtml += `<div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; ${i < clientiFatturato.length - 1 ? 'border-bottom: 1px solid var(--grigio-100);' : ''}">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span style="width: 24px; height: 24px; border-radius: 50%; background: var(--blu-100); color: var(--blu-700); display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700;">${i + 1}</span>
                    <a href="#" onclick="UI.showPage('dettaglio-cliente', '${c.id}')" style="color: var(--blu-700); text-decoration: none; font-size: 0.9rem; font-weight: 500;">${c.ragioneSociale || 'N/D'}</a>
                </div>
                <span style="font-weight: 700; color: var(--verde-700); font-size: 0.9rem;">${DataService.formatCurrency(c.fatturato)}</span>
            </div>`;
        });

        if (!topHtml) {
            topHtml = '<p style="text-align: center; color: var(--grigio-500); padding: 1rem;">Nessun dato disponibile</p>';
        }

        return `<div style="background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
            <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 1rem;">
                <i class="fas fa-trophy"></i> Top Clienti per Fatturato
            </h3>
            ${topHtml}
            <div style="text-align: center; margin-top: 1rem;">
                <button class="btn btn-primary btn-sm" onclick="UI.showPage('clienti')">
                    <i class="fas fa-users"></i> Tutti i miei clienti (${clienti.length})
                </button>
            </div>
        </div>`;
    },

    // === Fatture non pagate per agente ===
    renderAgenteFattureNonPagate(fattureNonPagate, clienti) {
        if (fattureNonPagate.length === 0) return '';

        // Mappa clienteId -> nome per lookup veloce
        const clienteMap = {};
        clienti.forEach(c => {
            if (c.id) clienteMap[c.id] = c.ragioneSociale;
            if (c.clienteIdLegacy) clienteMap[c.clienteIdLegacy] = c.ragioneSociale;
        });

        // Ordina per data scadenza (più urgenti prima)
        const ordinate = [...fattureNonPagate].sort((a, b) => {
            const dA = a.dataScadenza ? new Date(a.dataScadenza) : new Date('2099-01-01');
            const dB = b.dataScadenza ? new Date(b.dataScadenza) : new Date('2099-01-01');
            return dA - dB;
        }).slice(0, 10);

        const oggi = new Date();
        let righe = '';
        ordinate.forEach(f => {
            const scaduta = f.dataScadenza && new Date(f.dataScadenza) < oggi;
            const nomeCliente = clienteMap[f.clienteId] || f.clienteRagioneSociale || 'N/D';
            righe += `<div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.5rem; border-bottom: 1px solid var(--grigio-100); ${scaduta ? 'background: #FFF3F3; border-radius: 6px; margin-bottom: 2px;' : ''}">
                <div style="flex: 1;">
                    <a href="#" onclick="UI.showPage('dettaglio-fattura', '${f.id}')" style="color: var(--blu-700); text-decoration: none; font-weight: 600; font-size: 0.9rem;">${f.numeroFattura || f.numeroFatturaCompleto || 'N/D'}</a>
                    <div style="font-size: 0.8rem; color: var(--grigio-500);">${nomeCliente} • Scad. ${DataService.formatDate(f.dataScadenza)}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight: 700; color: ${scaduta ? '#D32F2F' : 'var(--grigio-700)'};">${DataService.formatCurrency(f.importoTotale)}</div>
                    ${scaduta ? '<span class="badge badge-danger" style="font-size: 0.7rem;">SCADUTA</span>' : ''}
                </div>
            </div>`;
        });

        return `<div style="background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.06); margin-bottom: 1.5rem;">
            <h3 style="font-size: 1.1rem; font-weight: 700; color: #D32F2F; margin-bottom: 1rem;">
                <i class="fas fa-file-invoice-dollar"></i> Fatture da Incassare (${fattureNonPagate.length})
            </h3>
            ${righe}
            ${fattureNonPagate.length > 10 ? `<div style="text-align: center; margin-top: 1rem;">
                <button class="btn btn-primary btn-sm" onclick="UI.showPage('fatture')">
                    <i class="fas fa-list"></i> Vedi tutte (${fattureNonPagate.length})
                </button>
            </div>` : ''}
        </div>`;
    },

    // === Contratti in scadenza per agente ===
    renderAgenteContrattiScadenza(contrattiInScadenza, contrattiScaduti) {
        const tutti = [...contrattiScaduti, ...contrattiInScadenza];
        if (tutti.length === 0) return '';

        let righe = '';
        tutti.forEach(c => {
            const scaduto = c.stato === 'SCADUTO' || (c.dataScadenza && new Date(c.dataScadenza) < new Date());
            righe += `<div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.5rem; border-bottom: 1px solid var(--grigio-100); ${scaduto ? 'background: #FFF8E1; border-radius: 6px; margin-bottom: 2px;' : ''}">
                <div style="flex: 1;">
                    <a href="#" onclick="UI.showPage('dettaglio-contratto', '${c.id}')" style="color: var(--blu-700); text-decoration: none; font-weight: 600; font-size: 0.9rem;">${c.numeroContratto || 'N/D'}</a>
                    <div style="font-size: 0.8rem; color: var(--grigio-500);">${c.clienteRagioneSociale || 'N/D'} • Scad. ${DataService.formatDate(c.dataScadenza)}</div>
                </div>
                <span class="badge ${scaduto ? 'badge-danger' : 'badge-warning'}" style="font-size: 0.75rem;">${scaduto ? 'SCADUTO' : 'IN SCADENZA'}</span>
            </div>`;
        });

        return `<div style="background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.06); margin-bottom: 1.5rem;">
            <h3 style="font-size: 1.1rem; font-weight: 700; color: #E6A800; margin-bottom: 1rem;">
                <i class="fas fa-file-contract"></i> Contratti da Rinnovare (${tutti.length})
            </h3>
            ${righe}
            <div style="text-align: center; margin-top: 1rem;">
                <button class="btn btn-primary btn-sm" onclick="UI.showPage('contratti')">
                    <i class="fas fa-file-alt"></i> Tutti i contratti
                </button>
            </div>
        </div>`;
    },

    // === Lista clienti per agente ===
    renderAgenteListaClienti(clienti, contratti, fatture) {
        if (clienti.length === 0) {
            return `<div style="background: white; border-radius: 12px; padding: 2rem; text-align: center; color: var(--grigio-500);">
                <i class="fas fa-users" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                <p>Nessun cliente associato al tuo profilo.</p>
            </div>`;
        }

        // Ordina per stato (attivi prima, poi scaduti, cessati, senza contratto)
        const ordineStato = { 'ATTIVO': 0, 'SCADUTO': 1, 'SOSPESO': 2, 'CESSATO': 3, 'SENZA_CONTRATTO': 4 };
        const ordinati = [...clienti].sort((a, b) => {
            const oA = ordineStato[a.statoContratto] ?? 99;
            const oB = ordineStato[b.statoContratto] ?? 99;
            return oA - oB || (a.ragioneSociale || '').localeCompare(b.ragioneSociale || '');
        });

        let righe = '';
        ordinati.forEach(c => {
            const ids = new Set([c.id, c.clienteIdLegacy].filter(Boolean));
            const nContratti = contratti.filter(ct => ids.has(ct.clienteId)).length;
            const nFatture = fatture.filter(f => ids.has(f.clienteId)).length;

            const statoClass = c.statoContratto === 'ATTIVO' ? 'badge-success' :
                               c.statoContratto === 'SCADUTO' ? 'badge-danger' :
                               c.statoContratto === 'SENZA_CONTRATTO' ? 'badge-danger' :
                               c.statoContratto === 'SOSPESO' ? 'badge-warning' : 'badge-secondary';
            const tipoBadge = c.tipo === 'PA' ? '<span style="background: var(--blu-100); color: var(--blu-700); padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 700; margin-left: 6px;">PA</span>' :
                              '<span style="background: var(--grigio-100); color: var(--grigio-700); padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 700; margin-left: 6px;">PR</span>';

            righe += `<div style="display: flex; justify-content: space-between; align-items: center; padding: 0.7rem 0.5rem; border-bottom: 1px solid var(--grigio-100);">
                <div style="flex: 1;">
                    <a href="#" onclick="UI.showPage('dettaglio-cliente', '${c.id}')" style="color: var(--blu-700); text-decoration: none; font-weight: 600;">${c.ragioneSociale || 'N/D'}</a>${tipoBadge}
                    <div style="font-size: 0.8rem; color: var(--grigio-500); margin-top: 2px;">${c.provincia || ''} • ${nContratti} contratti • ${nFatture} fatture</div>
                </div>
                <span class="badge ${statoClass}" style="font-size: 0.75rem;">${c.statoContratto || 'N/D'}</span>
            </div>`;
        });

        return `<div style="background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.06); margin-bottom: 1.5rem;">
            <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 1rem;">
                <i class="fas fa-users"></i> I miei Clienti (${clienti.length})
            </h3>
            ${righe}
        </div>`;
    }
};

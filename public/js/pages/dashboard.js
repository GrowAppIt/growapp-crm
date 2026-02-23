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
                canInvoices ? DataService.getFatture({ limit: 5000 }).catch(e => { console.warn('Dashboard: errore getFatture', e); return []; }) : Promise.resolve([]),
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
            const fattureNonPagateStats = fatture.filter(f => (f.statoPagamento === 'NON_PAGATA' || f.statoPagamento === 'PARZIALMENTE_PAGATA') && f.tipoDocumento !== 'NOTA_DI_CREDITO');
            const importoNonPagato = fattureNonPagateStats.reduce((sum, f) => {
                // Per parzialmente pagate, calcola il saldo residuo
                if (f.statoPagamento === 'PARZIALMENTE_PAGATA') {
                    const totAcconti = (f.acconti || []).reduce((s, a) => s + (a.importo || 0), 0);
                    return sum + Math.max(0, (f.importoTotale || 0) - totAcconti);
                }
                return sum + (f.importoTotale || 0);
            }, 0);
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

            // Fatture scadute (filtro in memoria) — include anche PARZIALMENTE_PAGATA
            const fattureScadute = fatture.filter(f =>
                (f.statoPagamento === 'NON_PAGATA' || f.statoPagamento === 'PARZIALMENTE_PAGATA') && f.dataScadenza && new Date(f.dataScadenza) < oggi
            );

            // Fatture in scadenza (filtro in memoria) — include anche PARZIALMENTE_PAGATA
            const _finestraFatture = _sysDash2.finestraFattureDashboard || 30;
            const _dataLimiteFatture = new Date(oggi);
            _dataLimiteFatture.setDate(_dataLimiteFatture.getDate() + _finestraFatture);
            const fattureInScadenza = fatture.filter(f => {
                if ((f.statoPagamento !== 'NON_PAGATA' && f.statoPagamento !== 'PARZIALMENTE_PAGATA') || !f.dataScadenza) return false;
                const ds = new Date(f.dataScadenza);
                return ds >= oggi && ds <= _dataLimiteFatture;
            });

            // Scadenze compute (passa dati già caricati per evitare ulteriori query)
            let scadenzeScadute = [];
            let scadenzeImminenti = [];
            try {
                const scadenzeCalcolateResult = await DataService.getScadenzeCompute({ contratti: contrattiTutti, fatture: fatture, clienti: clienti });
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

            // Aggiorna badge sidebar con dati già caricati (nessuna query extra)
            const fattureNonPagateCount = fatture.filter(f =>
                (f.statoPagamento === 'NON_PAGATA' || f.statoPagamento === 'PARZIALMENTE_PAGATA') &&
                f.tipoDocumento !== 'NOTA_DI_CREDITO'
            ).length;
            const taskApertiCount = tasks.filter(t => (t.stato === 'TODO' || t.stato === 'IN_PROGRESS') && !t.archiviato).length;
            UI.updateSidebarBadges({
                scadenzeScadute: scadenzeScadute.length,
                fattureNonPagate: fattureNonPagateCount,
                taskAperti: taskApertiCount
            });

            // Aggiorna timestamp ultimo aggiornamento
            this._updateTimestamp();

            UI.hideLoading();
        } catch (error) {
            console.error('Errore rendering dashboard:', error);
            UI.hideLoading();
            UI.showError('Errore nel caricamento della dashboard');
        }
    },

    // Aggiorna il timestamp visualizzato nell'header
    _updateTimestamp() {
        const el = document.getElementById('dashboardTimestamp');
        if (!el) return;
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        el.innerHTML = `<i class="fas fa-clock" style="margin-right: 4px;"></i> Aggiornato alle ${hh}:${mm}`;
    },

    // Refresh manuale: invalida cache e ricarica
    async refresh() {
        if (typeof DataService !== 'undefined') DataService._cacheClear();
        UI.showPage('dashboard');
    },

    // Flag per distinguire vista agente manuale vs automatica
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
                        <p id="dashboardTimestamp" style="font-size: 0.75rem; color: var(--grigio-500); margin-top: 4px;">
                            <i class="fas fa-sync-alt fa-spin" style="margin-right: 4px;"></i> Caricamento dati...
                        </p>
                    </div>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        ${AuthService.isAncheAgente() ? `
                            <button class="btn btn-primary" onclick="Dashboard.switchToVistaAgente()" style="background: var(--verde-700);">
                                <i class="fas fa-user-tie"></i> Vista Agente
                            </button>
                        ` : ''}
                        <button class="btn btn-secondary" onclick="Dashboard.refresh()" title="Aggiorna dati">
                            <i class="fas fa-sync-alt"></i>
                        </button>
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
                        <div class="sk-card">
                            <div style="display: flex; align-items: center; gap: 1rem;">
                                <div class="sk" style="width: 48px; height: 48px; border-radius: 12px; flex-shrink: 0;"></div>
                                <div style="flex: 1;">
                                    <div class="sk" style="height: 14px; width: 60%; margin-bottom: 8px;"></div>
                                    <div class="sk" style="height: 24px; width: 40%;"></div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div style="display: grid; gap: 1.5rem;">
                    ${[1,2].map(() => `
                        <div class="sk-card" style="min-height: 200px;">
                            <div class="sk" style="height: 20px; width: 30%; margin-bottom: 1rem;"></div>
                            <div class="sk" style="height: 14px; width: 90%; margin-bottom: 0.5rem;"></div>
                            <div class="sk" style="height: 14px; width: 75%; margin-bottom: 0.5rem;"></div>
                            <div class="sk" style="height: 14px; width: 85%;"></div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        UI.hideLoading();
    },

    async renderEnabledWidgets(widgets, data) {
        let html = '';

        // Ruolo corrente dell'utente
        const ruoloCorrente = AuthService.getUserRole();

        // Ruoli AMMINISTRATIVI/FINANZIARI: vedono fatture, scadenze, riepilogo finanziario
        const ruoliAmministrativi = ['SUPER_ADMIN', 'ADMIN', 'CONTABILE'];
        const isAmministrativo = ruoliAmministrativi.includes(ruoloCorrente);

        // Ruoli TECNICI: vedono app, task, clienti (NO dati finanziari)
        const ruoliTecnici = ['CTO', 'SVILUPPATORE', 'CONTENT_MANAGER'];
        const isTecnico = ruoliTecnici.includes(ruoloCorrente);

        // Widget FINANZIARI: visibili SOLO ai ruoli amministrativi
        const widgetFinanziari = ['andamentoMensile', 'fattureNonPagate', 'topClienti', 'scadenzeImminenti'];

        // Widget TECNICI: visibili a tutti ma prioritari per i ruoli tecnici
        // contrattiInScadenza: visibile anche al CTO (ha responsabilità gestionale)
        const widgetSoloAdmin = ['andamentoMensile', 'fattureNonPagate', 'topClienti'];

        // Mappa permessi richiesti per ogni widget (permessi base)
        const widgetPermissions = {
            'statistiche': ['_always_'],
            'scadenzeImminenti': ['manage_payments', 'view_all_data'],
            'fattureNonPagate': ['manage_invoices', 'view_invoices', 'view_all_data'],
            'contrattiInScadenza': ['manage_contracts', 'view_contracts', 'view_all_data'],
            'andamentoMensile': ['manage_invoices', 'view_reports'],
            'statoApp': ['view_apps', 'manage_apps', 'manage_app_content', 'view_all_data'],
            'topClienti': ['manage_invoices', 'view_invoices', 'view_all_data'],
            'ultimiClienti': ['view_clients', 'manage_clients', 'view_all_data']
        };

        for (const widget of widgets) {
            // 1. Se è un widget finanziario e l'utente è un ruolo tecnico → NASCOSTO
            if (isTecnico && widgetFinanziari.includes(widget.id)) {
                continue;
            }

            // 2. Per scadenzeImminenti: solo CTO tra i tecnici può vederle (gestione contratti)
            if (widget.id === 'scadenzeImminenti' && isTecnico && ruoloCorrente !== 'CTO') {
                continue;
            }

            // 3. Verifica permessi standard
            const requiredPerms = widgetPermissions[widget.id] || [];
            const hasPermission = requiredPerms.includes('_always_') || requiredPerms.some(perm => AuthService.hasPermission(perm));

            if (!hasPermission) {
                continue;
            }

            switch (widget.id) {
                case 'statistiche':
                    html += this.renderStatisticheKPI(data.stats, data.scadenzeScadute, data.contrattiTutti, data.fattureScadute, data.tasks, data.app);
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
                    html += await this.renderAndamentoMensile(data.fatture);
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
        // Calcola saldo residuo: per PARZIALMENTE_PAGATA sottrai gli acconti
        const totaleScaduto = fattureScadute.reduce((sum, f) => {
            if (f.statoPagamento === 'PARZIALMENTE_PAGATA') {
                const totAcconti = (f.acconti || []).reduce((s, a) => s + (a.importo || 0), 0);
                return sum + Math.max(0, (f.importoTotale || 0) - totAcconti);
            }
            return sum + (f.importoTotale || 0);
        }, 0);

        return `
            <div class="card fade-in">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-exclamation-circle"></i> Fatture Scadute da Incassare
                    </h2>
                </div>
                <div class="card-body">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr)); gap: 1.5rem;">
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

    async renderAndamentoMensile(fatture) {
        const metrics = this.calculateMonthlyMetrics(fatture);

        // Helper per freccia variazione
        const renderVariazione = (variazione, mesePrec) => {
            if (variazione === 0) return `<span style="font-size: 0.75rem; color: var(--grigio-500);">= vs ${mesePrec}</span>`;
            const colore = variazione > 0 ? 'var(--verde-700)' : 'var(--rosso-errore)';
            const icona = variazione > 0 ? 'fa-arrow-up' : 'fa-arrow-down';
            return `<span style="font-size: 0.75rem; color: ${colore}; font-weight: 600;">
                <i class="fas ${icona}" style="font-size: 0.65rem;"></i> ${variazione > 0 ? '+' : ''}${variazione}% vs ${mesePrec}
            </span>`;
        };

        // Barra tasso incasso
        const tassoClampato = Math.min(metrics.tassoIncasso, 100);
        const coloreBarra = tassoClampato >= 70 ? 'var(--verde-700)' : tassoClampato >= 40 ? '#FFCC00' : 'var(--rosso-errore)';

        return `
            <div class="card fade-in">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-euro-sign"></i> Riepilogo Finanziario
                    </h2>
                    <div class="card-subtitle" style="text-transform: capitalize;">${metrics.mese}</div>
                </div>
                <div class="card-body" style="padding: 0;">

                    <!-- Emesso lordo -->
                    <div style="padding: 1rem 1.25rem; border-bottom: 1px solid var(--grigio-300);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                            <span style="font-size: 0.8rem; color: var(--grigio-700); font-weight: 500;">
                                <i class="fas fa-file-invoice" style="color: var(--blu-700); width: 18px;"></i> Fatturato emesso nel mese
                            </span>
                            <span style="font-size: 0.75rem; color: var(--grigio-500);">${metrics.numFattureEmesse} fatture</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: baseline;">
                            <span style="font-size: 1.5rem; font-weight: 700; color: var(--blu-900);">
                                ${DataService.formatCurrency(metrics.emessoLordoMese)}
                            </span>
                            ${renderVariazione(metrics.varEmessoLordo, metrics.mesePrec)}
                        </div>
                        ${metrics.ncMese > 0 ? `
                        <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed var(--grigio-300);">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 0.75rem; color: #D32F2F; font-weight: 500;">
                                    <i class="fas fa-file-invoice-dollar" style="width: 18px;"></i> Note di credito (${metrics.numNcMese})
                                </span>
                                <span style="font-size: 0.9rem; font-weight: 600; color: #D32F2F;">
                                    -${DataService.formatCurrency(metrics.ncMese)}
                                </span>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.35rem;">
                                <span style="font-size: 0.75rem; color: var(--grigio-500); font-style: italic;">
                                    Netto mese
                                </span>
                                <span style="font-size: 0.9rem; font-weight: 700; color: var(--grigio-700);">
                                    ${DataService.formatCurrency(metrics.emessoNettoMese)}
                                </span>
                            </div>
                        </div>
                        ` : ''}
                    </div>

                    <!-- Incassato -->
                    <div style="padding: 1rem 1.25rem; border-bottom: 1px solid var(--grigio-300);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                            <span style="font-size: 0.8rem; color: var(--grigio-700); font-weight: 500;">
                                <i class="fas fa-hand-holding-usd" style="color: var(--verde-700); width: 18px;"></i> Incassato nel mese
                            </span>
                            <span style="font-size: 0.75rem; color: var(--grigio-500);">${metrics.numPagamentiMese} pagamenti ricevuti</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: baseline;">
                            <span style="font-size: 1.5rem; font-weight: 700; color: var(--verde-900);">
                                ${DataService.formatCurrency(metrics.incassatoMese)}
                            </span>
                            ${renderVariazione(metrics.varIncassato, metrics.mesePrec)}
                        </div>
                    </div>

                    <!-- Da incassare -->
                    <div style="padding: 1rem 1.25rem; border-bottom: 1px solid var(--grigio-300);">
                        <div style="font-size: 0.8rem; color: var(--grigio-700); font-weight: 500; margin-bottom: 0.25rem;">
                            <i class="fas fa-clock" style="color: var(--rosso-errore); width: 18px;"></i> Da incassare (totale)
                        </div>
                        <span style="font-size: 1.5rem; font-weight: 700; color: ${metrics.daIncassare > 0 ? 'var(--rosso-errore)' : 'var(--verde-700)'};">
                            ${DataService.formatCurrency(metrics.daIncassare)}
                        </span>
                    </div>

                    <!-- Tasso di incasso -->
                    <div style="padding: 1rem 1.25rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                            <span style="font-size: 0.8rem; color: var(--grigio-700); font-weight: 500;">
                                <i class="fas fa-percentage" style="color: var(--blu-500); width: 18px;"></i> Recupero crediti del mese
                            </span>
                            <span style="font-size: 1rem; font-weight: 700; color: ${coloreBarra};">
                                ${metrics.tassoIncasso}%
                            </span>
                        </div>
                        <div style="width: 100%; height: 8px; background: var(--grigio-100); border-radius: 4px; overflow: hidden;">
                            <div style="width: ${tassoClampato}%; height: 100%; background: ${coloreBarra}; border-radius: 4px; transition: width 1s ease-out;"></div>
                        </div>
                    </div>

                </div>
            </div>
        `;
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
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(120px, 100%), 1fr)); gap: 1rem;">
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

    calculateMonthlyMetrics(fatture) {
        const oggi = new Date();
        const primoGiornoMese = new Date(oggi.getFullYear(), oggi.getMonth(), 1);
        const ultimoGiornoMese = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 0, 23, 59, 59);

        // Mese precedente per confronto
        const primoGiornoMesePrec = new Date(oggi.getFullYear(), oggi.getMonth() - 1, 1);
        const ultimoGiornoMesePrec = new Date(oggi.getFullYear(), oggi.getMonth(), 0, 23, 59, 59);

        // Helper: controlla se data è nel range
        const isInRange = (dataStr, inizio, fine) => {
            if (!dataStr) return false;
            const d = new Date(dataStr);
            return d >= inizio && d <= fine;
        };

        // Helper: calcola saldo residuo
        const saldoResiduo = (f) => {
            if (f.statoPagamento === 'PARZIALMENTE_PAGATA' && f.acconti && f.acconti.length > 0) {
                const totAcconti = f.acconti.reduce((s, a) => s + (a.importo || 0), 0);
                return Math.max(0, (f.importoTotale || 0) - totAcconti);
            }
            return f.importoTotale || 0;
        };

        // Fatture escluse note di credito per calcoli emesso
        const fattureReali = fatture.filter(f => f.tipoDocumento !== 'NOTA_DI_CREDITO');
        const noteDiCredito = fatture.filter(f => f.tipoDocumento === 'NOTA_DI_CREDITO');

        // --- EMESSO NEL MESE (fatture emesse questo mese) ---
        // Emesso lordo: solo fatture reali (no NC)
        const emessoLordoMese = fattureReali
            .filter(f => isInRange(f.dataEmissione, primoGiornoMese, ultimoGiornoMese))
            .reduce((s, f) => s + (f.importoTotale || 0), 0);
        // NC emesse nel mese (mostrate separatamente — possono riferirsi a fatture di altri mesi)
        const ncMese = noteDiCredito
            .filter(f => isInRange(f.dataEmissione, primoGiornoMese, ultimoGiornoMese))
            .reduce((s, f) => s + Math.abs(f.importoTotale || 0), 0);
        const numNcMese = noteDiCredito
            .filter(f => isInRange(f.dataEmissione, primoGiornoMese, ultimoGiornoMese)).length;
        // Netto per compatibilità (emesso lordo - NC del mese)
        const emessoNettoMese = emessoLordoMese - ncMese;

        // Emesso mese precedente per confronto (usa lordo per confronto corretto)
        const emessoLordoMesePrec = fattureReali
            .filter(f => isInRange(f.dataEmissione, primoGiornoMesePrec, ultimoGiornoMesePrec))
            .reduce((s, f) => s + (f.importoTotale || 0), 0);
        const ncMesePrec = noteDiCredito
            .filter(f => isInRange(f.dataEmissione, primoGiornoMesePrec, ultimoGiornoMesePrec))
            .reduce((s, f) => s + Math.abs(f.importoTotale || 0), 0);
        const emessoNettoMesePrec = emessoLordoMesePrec - ncMesePrec;

        // --- INCASSATO NEL MESE ---
        // Calcola il denaro effettivamente entrato nel mese, evitando doppi conteggi:
        // - Se fattura ha acconti: conta SOLO gli acconti nel periodo (gli acconti sono i pagamenti reali)
        // - Se fattura PAGATA senza acconti: conta importoTotale su dataSaldo
        // - Se fattura PAGATA con acconti ma saldo finale non coperto da acconti: conta la differenza
        const _calcolaIncassatoPeriodo = (listaFatture, inizio, fine) => {
            let totale = 0;
            let numPagamenti = 0;
            listaFatture.forEach(f => {
                if (f.tipoDocumento === 'NOTA_DI_CREDITO') return;

                const haAcconti = f.acconti && f.acconti.length > 0;
                let accontiNelPeriodo = 0;
                let totaleAcconti = 0;

                if (haAcconti) {
                    f.acconti.forEach(a => {
                        totaleAcconti += (a.importo || 0);
                        if (isInRange(a.data, inizio, fine)) {
                            accontiNelPeriodo += (a.importo || 0);
                        }
                    });
                    totale += accontiNelPeriodo;
                    if (accontiNelPeriodo > 0) numPagamenti++;

                    // Se PAGATA nel periodo e c'è un residuo non coperto dagli acconti
                    // (es: utente ha marcato manualmente come pagata)
                    if (f.statoPagamento === 'PAGATA' && isInRange(f.dataSaldo, inizio, fine)) {
                        const residuoNonAcconti = Math.max(0, (f.importoTotale || 0) - totaleAcconti);
                        if (residuoNonAcconti > 0) {
                            totale += residuoNonAcconti;
                        }
                    }
                } else if (f.statoPagamento === 'PAGATA' && isInRange(f.dataSaldo, inizio, fine)) {
                    // Fattura pagata senza acconti: intero importo nel periodo del saldo
                    totale += (f.importoTotale || 0);
                    numPagamenti++;
                }
            });
            return { totale, numPagamenti };
        };

        const incMese = _calcolaIncassatoPeriodo(fatture, primoGiornoMese, ultimoGiornoMese);
        const incassatoMese = incMese.totale;
        const numPagamentiMese = incMese.numPagamenti;

        // Incassato mese precedente per confronto
        const incMesePrec = _calcolaIncassatoPeriodo(fatture, primoGiornoMesePrec, ultimoGiornoMesePrec);
        const incassatoMesePrec = incMesePrec.totale;

        // --- DA INCASSARE (totale residuo) ---
        const daIncassare = fattureReali
            .filter(f => f.statoPagamento === 'NON_PAGATA' || f.statoPagamento === 'PARZIALMENTE_PAGATA')
            .reduce((s, f) => s + saldoResiduo(f), 0);

        // --- CONTEGGIO FATTURE MESE ---
        const numFattureEmesse = fattureReali
            .filter(f => isInRange(f.dataEmissione, primoGiornoMese, ultimoGiornoMese)).length;

        // --- TASSO DI RECUPERO CREDITI ---
        // Rapporto tra incassato nel mese e totale da incassare (quanto stai recuperando)
        const totaleEsposto = daIncassare + incassatoMese; // crediti inizio mese (approssimato)
        const tassoIncasso = totaleEsposto > 0 ? Math.min(100, Math.round((incassatoMese / totaleEsposto) * 100)) : 0;

        // --- VARIAZIONE PERCENTUALE ---
        const varEmesso = emessoNettoMesePrec > 0
            ? Math.round(((emessoNettoMese - emessoNettoMesePrec) / emessoNettoMesePrec) * 100)
            : (emessoNettoMese > 0 ? 100 : 0);
        const varIncassato = incassatoMesePrec > 0
            ? Math.round(((incassatoMese - incassatoMesePrec) / incassatoMesePrec) * 100)
            : (incassatoMese > 0 ? 100 : 0);

        // Variazione su lordo (confronto più corretto)
        const varEmessoLordo = emessoLordoMesePrec > 0
            ? Math.round(((emessoLordoMese - emessoLordoMesePrec) / emessoLordoMesePrec) * 100)
            : (emessoLordoMese > 0 ? 100 : 0);

        return {
            emessoLordoMese,
            ncMese,
            numNcMese,
            emessoNettoMese,
            incassatoMese,
            daIncassare,
            numFattureEmesse,
            numPagamentiMese,
            tassoIncasso,
            varEmesso,
            varEmessoLordo,
            varIncassato,
            mese: oggi.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }),
            mesePrec: primoGiornoMesePrec.toLocaleDateString('it-IT', { month: 'long' })
        };
    },

    // === NUOVI WIDGET KPI ===

    renderStatisticheKPI(stats, scadenzeScadute, contrattiTutti, fattureScadute, tasks, app) {
        // Contratti scaduti: data scadenza passata e non cessati
        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);
        const contrattiScadutiList = contrattiTutti.filter(c => {
            if (!c.dataScadenza || c.stato === 'CESSATO') return false;
            return new Date(c.dataScadenza) < oggi;
        });
        const contrattiScadutiCount = contrattiScadutiList.length;

        // Calcola fatturato scaduto da recuperare (saldo residuo per parzialmente pagate)
        const fatturatoScaduto = fattureScadute.reduce((sum, f) => {
            if (f.statoPagamento === 'PARZIALMENTE_PAGATA') {
                const totAcconti = (f.acconti || []).reduce((s, a) => s + (a.importo || 0), 0);
                return sum + Math.max(0, (f.importoTotale || 0) - totAcconti);
            }
            return sum + (f.importoTotale || 0);
        }, 0);

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

        // Costruisci KPI in base al RUOLO (non solo permessi)
        const _ruoloKPI = AuthService.getUserRole();
        const _ruoliTecniciKPI = ['CTO', 'SVILUPPATORE', 'CONTENT_MANAGER'];
        const _isTecnicoKPI = _ruoliTecniciKPI.includes(_ruoloKPI);

        let kpiCards = [];

        // === KPI FINANZIARI (solo ruoli amministrativi: SUPER_ADMIN, ADMIN, CONTABILE) ===

        // Scadenze Critiche
        if (!_isTecnicoKPI && (AuthService.hasPermission('manage_payments') || AuthService.hasPermission('view_all_data'))) {
            kpiCards.push(UI.createKPICard({
                icon: 'exclamation-triangle',
                iconClass: 'critical',
                label: 'Scadenze Critiche',
                value: scadenzeScadute.length,
                onclick: 'Dashboard.mostraDettaglioKPI("scadenzeCritiche")'
            }));
        }

        // Contratti Scaduti — visibile anche al CTO (gestione contratti)
        if ((_ruoloKPI === 'CTO' || !_isTecnicoKPI) && (AuthService.hasPermission('manage_contracts') || AuthService.hasPermission('view_contracts') || AuthService.hasPermission('view_all_data'))) {
            kpiCards.push(UI.createKPICard({
                icon: 'file-contract',
                iconClass: 'warning',
                label: 'Contratti Scaduti',
                value: contrattiScadutiCount,
                onclick: 'Dashboard.mostraDettaglioKPI("contrattiScaduti")'
            }));
        }

        // Fatturato da Incassare — SOLO ruoli amministrativi
        if (!_isTecnicoKPI && (AuthService.hasPermission('manage_invoices') || AuthService.hasPermission('view_invoices'))) {
            kpiCards.push(UI.createKPICard({
                icon: 'euro-sign',
                iconClass: 'danger',
                label: 'Fatturato da Incassare',
                value: DataService.formatCurrency(fatturatoScaduto),
                onclick: 'Dashboard.mostraDettaglioKPI("fatturatoScaduto")'
            }));
        }

        // === KPI TECNICI (per tutti, ma prioritari per ruoli tecnici) ===

        // Task Urgenti — visibile a tutti
        if (AuthService.hasPermission('view_dev_tasks') || AuthService.hasPermission('manage_dev_tasks') || AuthService.hasPermission('view_all_data')) {
            kpiCards.push(UI.createKPICard({
                icon: 'tasks',
                iconClass: _isTecnicoKPI ? 'critical' : 'info',
                label: 'Task Urgenti',
                value: taskUrgenti,
                onclick: 'UI.showPage("task")'
            }));
        }

        // App in Sviluppo — KPI aggiuntivo per ruoli tecnici
        if (_isTecnicoKPI && (AuthService.hasPermission('view_apps') || AuthService.hasPermission('manage_apps') || AuthService.hasPermission('manage_app_content'))) {
            const _appData = app || [];
            const _appSviluppoCount = _appData.filter(a => a.statoApp === 'IN_SVILUPPO' || a.statoApp === 'SVILUPPO').length;
            const _appAttiveCount = _appData.filter(a => a.statoApp === 'ATTIVA').length;
            kpiCards.push(UI.createKPICard({
                icon: 'code',
                iconClass: 'warning',
                label: 'App in Sviluppo',
                value: _appSviluppoCount,
                onclick: 'UI.showPage("app")'
            }));
            kpiCards.push(UI.createKPICard({
                icon: 'mobile-alt',
                iconClass: 'success',
                label: 'App Attive',
                value: _appAttiveCount,
                onclick: 'UI.showPage("app")'
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
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(120px, 100%), 1fr)); gap: 1rem;">
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

        // Fatture non pagate (include PARZIALMENTE_PAGATA)
        const fattureNonPagate = fatture.filter(f => f.statoPagamento === 'NON_PAGATA' || f.statoPagamento === 'PARZIALMENTE_PAGATA');
        const importoNonPagato = fattureNonPagate.reduce((sum, f) => {
            if (f.statoPagamento === 'PARZIALMENTE_PAGATA') {
                const totAcconti = (f.acconti || []).reduce((s, a) => s + (a.importo || 0), 0);
                return sum + Math.max(0, (f.importoTotale || 0) - totAcconti);
            }
            return sum + (f.importoTotale || 0);
        }, 0);

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
                fatture: fatture,
                clienti: clienti
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
                        <p id="dashboardTimestamp" style="font-size: 0.75rem; color: var(--grigio-500); margin-top: 4px;">
                            <i class="fas fa-clock" style="margin-right: 4px;"></i> Caricamento...
                        </p>
                    </div>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        ${this._vistaAgenteManuale ? `
                            <button class="btn btn-secondary" onclick="Dashboard.switchToVistaAdmin()" style="border: 2px solid var(--blu-700);">
                                <i class="fas fa-arrow-left"></i> Torna alla Dashboard
                            </button>
                        ` : ''}
                        <button class="btn btn-secondary" onclick="Dashboard.refresh()" title="Aggiorna dati">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                    </div>
                </div>
            </div>

            <!-- KPI PRINCIPALI AGENTE -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
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
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
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
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 1.5rem; margin-bottom: 1.5rem;">
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
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(min(250px, 100%), 1fr)); gap: 0.75rem;">
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

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 1.5rem; margin-top: 1.5rem;">
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

        // Aggiorna timestamp
        this._updateTimestamp();

        // Aggiorna badge sidebar con dati agente (nessuna query extra)
        const _agFattureNP = fatture.filter(f =>
            (f.statoPagamento === 'NON_PAGATA' || f.statoPagamento === 'PARZIALMENTE_PAGATA') &&
            f.tipoDocumento !== 'NOTA_DI_CREDITO'
        ).length;
        UI.updateSidebarBadges({
            scadenzeScadute: scadenzeScadute.length,
            fattureNonPagate: _agFattureNP,
            taskAperti: 0 // Task caricati async, verrà aggiornato da loadWidgetTaskAperti
        });

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
                if (task.stato !== 'TODO' && task.stato !== 'IN_PROGRESS') return false;
                if (task.archiviato) return false;
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
                if (task.stato !== 'TODO' && task.stato !== 'IN_PROGRESS') return false;
                if (task.archiviato) return false;
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
            const importo = fattureScadute.reduce((s, f) => {
                if (f.stato === 'PARZIALMENTE_PAGATA' && f.acconti && f.acconti.length > 0) {
                    const totAcconti = f.acconti.reduce((sum, a) => sum + (a.importo || 0), 0);
                    return s + Math.max(0, (f.importoTotale || 0) - totAcconti);
                }
                return s + (f.importoTotale || 0);
            }, 0);
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

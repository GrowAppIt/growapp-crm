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

            // Verifica automatica stati contratti (scaduti + rinnovi taciti)
            // Lanciata in background: non blocca il rendering della dashboard
            DataService.verificaEAggiornaStatiContratti().then(result => {
                if (result.scaduti > 0 || result.rinnovati > 0) {
                    console.log(`[Dashboard] Contratti aggiornati in background: ${result.scaduti} scaduti, ${result.rinnovati} rinnovati`);
                    // Invalida cache e ricarica la dashboard per riflettere i cambiamenti
                    DataService._cacheInvalidate('contratti:');
                    DataService._cacheInvalidate('clienti:');
                    this.render();
                }
            }).catch(e => console.warn('Verifica contratti in background fallita:', e));

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
            const _sogliaImmDash = _sysDash2.sogliaImminente || 3;
            const traXgiorni = new Date(oggi);
            traXgiorni.setDate(traXgiorni.getDate() + _sogliaImmDash);
            const scadenzeScaduteStats = _rawScadenze.filter(s => s.dataScadenza && new Date(s.dataScadenza) < oggi);
            const scadenzeImminentiStats = _rawScadenze.filter(s => {
                if (!s.dataScadenza) return false;
                const d = new Date(s.dataScadenza);
                return d >= oggi && d <= traXgiorni;
            });

            const stats = {
                clienti: { totale: clienti.length, attivi: clientiPerStato['ATTIVO'] || 0, scaduti: clientiPerStato['SCADUTO'] || 0, cessati: clientiPerStato['CESSATO'] || 0, senzaContratto: clientiPerStato['SENZA_CONTRATTO'] || 0, perStato: clientiPerStato },
                app: { totale: app.length, attive: appPerStato['ATTIVA'] || 0, inSviluppo: (appPerStato['SVILUPPO'] || 0) + (appPerStato['IN_SVILUPPO'] || 0), sospese: appPerStato['SOSPESA'] || 0, perStato: appPerStato },
                contratti: { totale: contrattiTutti.length, attivi: contrattiPerStato['ATTIVO'] || 0, scaduti: contrattiPerStato['SCADUTO'] || 0, cessati: contrattiPerStato['CESSATO'] || 0, perStato: contrattiPerStato },
                fatture: { totale: fatture.length, pagate: fatturePerStato['PAGATA'] || 0, nonPagate: fatturePerStato['NON_PAGATA'] || 0, perStato: fatturePerStato, fatturatoTotale, importoNonPagato },
                scadenze: { totale: _rawScadenze.length, scadute: scadenzeScaduteStats.length, imminenti: scadenzeImminentiStats.length }
            };

            // Contratti in scadenza (filtro in memoria) — prossimi 60gg
            const _finestraContratti = _sysDash2.finestraContrattiDashboard || 60;
            const _dataLimiteContratti = new Date(oggi);
            _dataLimiteContratti.setDate(_dataLimiteContratti.getDate() + _finestraContratti);
            const contrattiInScadenza = contrattiTutti.filter(c =>
                c.stato === 'ATTIVO' && c.dataScadenza && new Date(c.dataScadenza) <= _dataLimiteContratti
            ).sort((a, b) => new Date(a.dataScadenza) - new Date(b.dataScadenza));

            // Contratti scaduti (stato SCADUTO nel database)
            const contrattiScaduti = contrattiTutti.filter(c => c.stato === 'SCADUTO')
                .sort((a, b) => new Date(a.dataScadenza || 0) - new Date(b.dataScadenza || 0));

            // Fatture scadute (filtro in memoria) — include anche PARZIALMENTE_PAGATA, esclude NC
            const fattureScadute = fatture.filter(f =>
                (f.statoPagamento === 'NON_PAGATA' || f.statoPagamento === 'PARZIALMENTE_PAGATA') && f.dataScadenza && new Date(f.dataScadenza) < oggi && f.tipoDocumento !== 'NOTA_DI_CREDITO'
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
            let scadenzeImminenti = [];     // Finestra 30gg per il widget principale dashboard
            let scadenzeImminentiAlert = []; // Finestra 3gg per badge sidebar e widget "Prossime Attività"
            let scadenzeScaduteSospese = []; // Fatture in contenzioso/dissesto — escluse di default
            try {
                const scadenzeCalcolateResult = await DataService.getScadenzeCompute({ contratti: contrattiTutti, fatture: fatture, clienti: clienti });

                // Finestra alert (3gg) — per badge e widget prossime attività
                const finestraAlert = new Date(oggi);
                finestraAlert.setDate(finestraAlert.getDate() + (_sysDash2.sogliaImminente || 3));

                // Finestra widget (30gg) — per il widget "Scadenze Imminenti" in dashboard
                const finestraWidget = new Date(oggi);
                finestraWidget.setDate(finestraWidget.getDate() + 30);

                const _tutteScadenzeScadute = scadenzeCalcolateResult.tutteLeScadenze.filter(s =>
                    s.dataScadenza && new Date(s.dataScadenza) < oggi
                );
                // Separa scadenze normali da quelle con credito sospeso (fatture in contenzioso/dissesto)
                const _isCreditoSospeso = (s) => s.creditoSospeso === true || s.creditoSospeso === 'true';
                scadenzeScadute = _tutteScadenzeScadute.filter(s => !(s.tipo === 'FATTURA_INCASSO' && _isCreditoSospeso(s)));
                scadenzeScaduteSospese = _tutteScadenzeScadute.filter(s => s.tipo === 'FATTURA_INCASSO' && _isCreditoSospeso(s));

                // Scadenze imminenti (30gg) per il widget principale
                scadenzeImminenti = scadenzeCalcolateResult.tutteLeScadenze.filter(s => {
                    if (!s.dataScadenza) return false;
                    const ds = new Date(s.dataScadenza);
                    return ds >= oggi && ds <= finestraWidget;
                });

                // Scadenze imminenti (3gg) per badge e alert
                scadenzeImminentiAlert = scadenzeCalcolateResult.tutteLeScadenze.filter(s => {
                    if (!s.dataScadenza) return false;
                    const ds = new Date(s.dataScadenza);
                    return ds >= oggi && ds <= finestraAlert;
                });
            } catch (e) { console.warn('Dashboard: errore getScadenzeCompute', e); }

            // Get enabled widgets
            const enabledWidgets = SettingsService.getEnabledWidgets();

            // FASE 2: Sostituisce l'intera area skeleton con i widget reali
            const dashboardBody = document.getElementById('dashboardBody');

            // === WIDGET SCADENZE FUTURE APP (per SUPER_ADMIN, CONTENT_MANAGER, CTO e SVILUPPATORE) ===
            let widgetScadenzeFutureHtml = '';
            const _ruoloWidget = AuthService.getUserRole();
            if (_ruoloWidget === 'SUPER_ADMIN' || _ruoloWidget === 'CONTENT_MANAGER' || _ruoloWidget === 'CTO' || _ruoloWidget === 'SVILUPPATORE') {
                const scadenzeFutureApp = this._collectAllFutureAppDeadlines(app);
                if (scadenzeFutureApp.length > 0) {
                    // Salva in cache per il drill-down
                    this._scadenzeFutureAppCache = scadenzeFutureApp;
                    widgetScadenzeFutureHtml = this._renderWidgetScadenzeFutureApp(scadenzeFutureApp);
                }
            }

            if (dashboardBody) {
                dashboardBody.innerHTML = `
                    ${widgetScadenzeFutureHtml}
                    <div style="display: grid; gap: 1.5rem;">
                        ${await this.renderEnabledWidgets(enabledWidgets, {
                            stats,
                            scadenzeScadute,
                            scadenzeImminenti,
                            scadenzeImminentiAlert,
                            contrattiInScadenza,
                            contrattiScaduti,
                            fattureInScadenza,
                            clienti,
                            fatture,
                            fattureScadute,
                            scadenzeScaduteSospese,
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
            // Badge sidebar: conta scadute + imminenti (≤3gg)
            const scadenzeBadgeCount = scadenzeScadute.length + scadenzeImminentiAlert.length;
            UI.updateSidebarBadges({
                scadenzeScadute: scadenzeBadgeCount,
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
                        ${AuthService.canViewPubblicazioneStore() ? `
                        <button class="btn btn-primary" onclick="Dashboard.toggleAIChat()" title="AI Assistant" style="background: linear-gradient(135deg, var(--blu-700), var(--blu-900, #0D3A5C)); position: relative;">
                            <i class="fas fa-robot"></i> AI Assistant
                        </button>
                        ` : ''}
                    </div>
                </div>
            </div>

            <!-- Banner Health Status: visibile solo se ci sono app in warn/error -->
            <div id="healthStatusBanner"></div>

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

        // Carica in background il banner health status (non bloccante)
        this.loadAndRenderHealthBanner().catch(e => console.warn('[Dashboard] Health banner fallito:', e));
    },

    // ─────────────────────────────────────────────────────────────
    // Banner Health Status: legge health_status/latest da Firestore
    // e mostra un avviso visibile se alcune app non ricevono più
    // notifiche (warn ≥3 giorni, error ≥7 giorni). Il documento viene
    // aggiornato ogni mattina alle 09:00 dal cron /api/daily-health-alert.
    // ─────────────────────────────────────────────────────────────
    async loadAndRenderHealthBanner() {
        const container = document.getElementById('healthStatusBanner');
        if (!container) return;

        // Visibile solo a chi ha permesso su app/push (admin, CTO, content manager)
        const puoVedere = AuthService.hasPermission('view_all_data')
            || AuthService.hasPermission('manage_apps')
            || AuthService.hasPermission('view_apps')
            || AuthService.hasPermission('manage_app_content');
        if (!puoVedere) { container.innerHTML = ''; return; }

        let doc;
        try {
            doc = await db.collection('health_status').doc('latest').get();
        } catch (e) {
            console.warn('[Dashboard] Impossibile leggere health_status:', e);
            container.innerHTML = '';
            return;
        }
        if (!doc || !doc.exists) { container.innerHTML = ''; return; }

        const data = doc.data() || {};
        const errorApps = Array.isArray(data.errorApps) ? data.errorApps : [];
        const warnApps = Array.isArray(data.warnApps) ? data.warnApps : [];

        // Nessun problema → non mostriamo nulla
        if (errorApps.length === 0 && warnApps.length === 0) {
            container.innerHTML = '';
            return;
        }

        // Formatta timestamp dell'ultima verifica
        let updatedLabel = '';
        try {
            const ts = data.updatedAt;
            const d = ts && ts.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
            if (d && !isNaN(d.getTime())) {
                updatedLabel = d.toLocaleString('it-IT', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
            }
        } catch (e) {}

        // Priorità: se ci sono errori mostra rosso, altrimenti giallo
        const hasError = errorApps.length > 0;
        const bgColor = hasError ? '#FDECEA' : '#FFF8E1';
        const borderColor = hasError ? '#D32F2F' : '#FFCC00';
        const iconColor = hasError ? '#D32F2F' : '#B45309';
        const icon = hasError ? 'fa-circle-exclamation' : 'fa-triangle-exclamation';
        const titolo = hasError
            ? `${errorApps.length} app non ricevono notifiche da oltre 7 giorni`
            : `${warnApps.length} app non ricevono notifiche da oltre 3 giorni`;

        // Costruisci la lista combinata (rossi prima, poi gialli)
        const tuttiProblemi = [
            ...errorApps.map(a => ({ ...a, severity: 'error' })),
            ...warnApps.map(a => ({ ...a, severity: 'warn' }))
        ];

        const listaHtml = tuttiProblemi.slice(0, 8).map(app => {
            const sevColor = app.severity === 'error' ? '#D32F2F' : '#B45309';
            const sevIcon = app.severity === 'error' ? 'fa-circle' : 'fa-circle';
            const giorni = typeof app.daysSinceLast === 'number' ? app.daysSinceLast : '?';
            const nome = (app.appName || app.appSlug || 'App sconosciuta');
            const slug = (app.appSlug || '');
            return `
                <div style="display: flex; align-items: center; gap: 0.5rem; padding: 6px 0; border-bottom: 1px solid #F5F5F5; font-size: 0.875rem;">
                    <i class="fas ${sevIcon}" style="color: ${sevColor}; font-size: 0.5rem;"></i>
                    <span style="flex: 1; color: #4A4A4A; font-weight: 600;">${nome}</span>
                    <span style="color: ${sevColor}; font-size: 0.8rem;">
                        <i class="fas fa-clock"></i> ${giorni} ${giorni === 1 ? 'giorno' : 'giorni'}
                    </span>
                    ${slug ? `<button onclick="UI.showPage('storico-push')" class="btn btn-small" style="padding: 2px 8px; font-size: 0.7rem; background: #145284; color: white; border: none; border-radius: 4px; cursor: pointer;" title="Apri storico push">Dettagli</button>` : ''}
                </div>
            `;
        }).join('');

        const resto = tuttiProblemi.length > 8 ? `<div style="padding: 6px 0; font-size: 0.8rem; color: #9B9B9B; text-align: center;">+ altre ${tuttiProblemi.length - 8} app</div>` : '';

        container.innerHTML = `
            <div style="background: ${bgColor}; border-left: 4px solid ${borderColor}; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1rem;">
                <div style="display: flex; align-items: flex-start; gap: 0.75rem;">
                    <i class="fas ${icon}" style="color: ${iconColor}; font-size: 1.25rem; margin-top: 2px;"></i>
                    <div style="flex: 1;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                            <div style="font-weight: 700; color: ${iconColor}; font-size: 1rem;">
                                ${titolo}
                            </div>
                            <div style="display: flex; gap: 0.5rem; align-items: center;">
                                ${updatedLabel ? `<span style="font-size: 0.75rem; color: #9B9B9B;"><i class="fas fa-sync-alt"></i> ${updatedLabel}</span>` : ''}
                                <button onclick="UI.showPage('storico-push')" class="btn btn-small" style="background: #145284; color: white; border: none; padding: 4px 10px; font-size: 0.8rem; border-radius: 4px; cursor: pointer;">
                                    <i class="fas fa-chart-line"></i> Apri Monitor
                                </button>
                                <button onclick="document.getElementById('healthStatusBanner').innerHTML = ''" class="btn btn-small" style="background: transparent; color: #9B9B9B; border: none; padding: 4px 8px; font-size: 0.9rem; cursor: pointer;" title="Nascondi">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        <div style="margin-top: 0.5rem;">
                            ${listaHtml}
                            ${resto}
                        </div>
                    </div>
                </div>
            </div>
        `;
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

        // Widget AMMINISTRATIVI: nascosti a SVILUPPATORE e CONTENT_MANAGER (clienti, contratti, scadenze)
        const ruoliSenzaAmministrazione = ['SVILUPPATORE', 'CONTENT_MANAGER'];
        const isSenzaAmministrazione = ruoliSenzaAmministrazione.includes(ruoloCorrente);
        const widgetAmministrativi = ['contrattiInScadenza', 'contrattiScaduti', 'ultimiClienti', 'scadenzeImminenti'];

        // Widget TECNICI: visibili a tutti ma prioritari per i ruoli tecnici
        // contrattiInScadenza: visibile anche al CTO (ha responsabilità gestionale)
        const widgetSoloAdmin = ['andamentoMensile', 'fattureNonPagate', 'topClienti'];

        // Mappa permessi richiesti per ogni widget (permessi base)
        const widgetPermissions = {
            'statistiche': ['_always_'],
            'scadenzeImminenti': ['manage_payments', 'view_all_data'],
            'fattureNonPagate': ['manage_invoices', 'view_invoices', 'view_all_data'],
            'contrattiInScadenza': ['manage_contracts', 'view_contracts', 'view_all_data'],
            'contrattiScaduti': ['manage_contracts', 'view_contracts', 'view_all_data'],
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

            // 1b. Se è un widget amministrativo (clienti, contratti, scadenze) e l'utente è SVILUPPATORE o CONTENT_MANAGER → NASCOSTO
            if (isSenzaAmministrazione && widgetAmministrativi.includes(widget.id)) {
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
                    html += this.renderStatisticheKPI(data.stats, data.scadenzeScadute, data.contrattiTutti, data.fattureScadute, data.tasks, data.app, data.scadenzeScaduteSospese);
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
                case 'contrattiScaduti':
                    html += this.renderContrattiScaduti(data.contrattiScaduti);
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
        // Helper: calcola saldo residuo per singola fattura
        const _residuo = (f) => {
            if (f.statoPagamento === 'PARZIALMENTE_PAGATA') {
                const totAcconti = (f.acconti || []).reduce((s, a) => s + (a.importo || 0), 0);
                return Math.max(0, (f.importoTotale || 0) - totAcconti);
            }
            return f.importoTotale || 0;
        };
        const _isSospeso = (f) => f.creditoSospeso === true || f.creditoSospeso === 'true';

        // Separa normali da crediti sospesi (coerente con KPI card)
        const fattureNormali = fattureScadute.filter(f => !_isSospeso(f));
        const fattureSospese = fattureScadute.filter(f => _isSospeso(f));
        const totaleNormali = fattureNormali.reduce((sum, f) => sum + _residuo(f), 0);
        const totaleSospese = fattureSospese.reduce((sum, f) => sum + _residuo(f), 0);

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
                            <div class="stat-value">${fattureNormali.length}</div>
                            <div class="stat-label">Fatture</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-value">${DataService.formatCurrency(totaleNormali)}</div>
                            <div class="stat-label">Totale</div>
                        </div>
                    </div>
                    ${fattureSospese.length > 0 ? '<p style="font-size: 0.75rem; color: #FF9800; margin-top: 0.75rem; text-align: center;"><i class="fas fa-pause-circle"></i> + ' + fattureSospese.length + ' in sospeso (' + DataService.formatCurrency(totaleSospese) + ') escluse dal totale</p>' : ''}
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

    renderContrattiScaduti(contratti) {
        if (contratti.length === 0) {
            return `
                <div class="card fade-in">
                    <div class="card-header">
                        <h2 class="card-title">
                            <i class="fas fa-exclamation-circle" style="color: var(--rosso-errore);"></i> Contratti Scaduti
                        </h2>
                    </div>
                    <div class="empty-state">
                        <i class="fas fa-check-circle" style="color: var(--verde-700);"></i>
                        <p>Nessun contratto scaduto da gestire</p>
                    </div>
                </div>
            `;
        }

        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);

        let html = `
            <div class="card fade-in">
                <div class="card-header" style="border-left: 4px solid var(--rosso-errore);">
                    <h2 class="card-title">
                        <i class="fas fa-exclamation-circle" style="color: var(--rosso-errore);"></i> Contratti Scaduti
                    </h2>
                    <div class="card-subtitle" style="color: var(--rosso-errore); font-weight: 600;">${contratti.length} contratt${contratti.length === 1 ? 'o' : 'i'} da rinnovare o cessare</div>
                </div>
                <div class="list-group">
        `;

        const slice = contratti.slice(0, 8);
        slice.forEach(contratto => {
            const scadenza = contratto.dataScadenza ? new Date(contratto.dataScadenza) : null;
            const giorniScaduto = scadenza ? Math.abs(Math.ceil((scadenza - oggi) / (1000 * 60 * 60 * 24))) : '?';
            html += UI.createListItem({
                title: contratto.clienteRagioneSociale || 'Cliente non specificato',
                subtitle: `${contratto.numeroContratto || 'N/A'} — scaduto da ${giorniScaduto} giorn${giorniScaduto === 1 ? 'o' : 'i'} (${contratto.dataScadenza ? DataService.formatDate(contratto.dataScadenza) : 'N/A'})`,
                badge: 'SCADUTO',
                badgeClass: 'badge-warning',
                icon: 'file-contract',
                onclick: `UI.showPage("dettaglio-contratto", "${contratto.id}")`
            });
        });

        if (contratti.length > 8) {
            html += `
                <div style="padding: 0.75rem 1rem; text-align: center;">
                    <a href="#" onclick="UI.showPage('contratti'); return false;" style="font-size: 0.8rem; color: var(--blu-500); text-decoration: none; font-weight: 600;">
                        <i class="fas fa-arrow-right"></i> Vedi tutti i ${contratti.length} contratti scaduti
                    </a>
                </div>
            `;
        }

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

                    <!-- Crediti aperti -->
                    <div style="padding: 1rem 1.25rem; border-bottom: 1px solid var(--grigio-300);">
                        <div style="font-size: 0.8rem; color: var(--grigio-700); font-weight: 500; margin-bottom: 0.25rem;">
                            <i class="fas fa-clock" style="color: var(--rosso-errore); width: 18px;"></i> Crediti aperti (scaduti + a scadere)
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

    renderStatisticheKPI(stats, scadenzeScadute, contrattiTutti, fattureScadute, tasks, app, scadenzeScaduteSospese) {
        // Contratti scaduti: data scadenza passata e non cessati
        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);
        const contrattiScadutiList = contrattiTutti.filter(c => {
            if (!c.dataScadenza || c.stato === 'CESSATO') return false;
            return new Date(c.dataScadenza) < oggi;
        });
        const contrattiScadutiCount = contrattiScadutiList.length;

        // Helper robusto: gestisce boolean true, stringa 'true', e undefined/false/'false'
        const _isSospeso = (obj) => obj.creditoSospeso === true || obj.creditoSospeso === 'true';

        // Separa fatture normali da quelle con credito sospeso
        const fattureScaduteNormali = fattureScadute.filter(f => !_isSospeso(f));
        const fattureScaduteSospese = fattureScadute.filter(f => _isSospeso(f));

        // Calcola fatturato scaduto da recuperare (SOLO fatture normali, esclude crediti sospesi)
        const _calcolaImportoResiduo = (f) => {
            if (f.statoPagamento === 'PARZIALMENTE_PAGATA') {
                const totAcconti = (f.acconti || []).reduce((s, a) => s + (a.importo || 0), 0);
                return Math.max(0, (f.importoTotale || 0) - totAcconti);
            }
            return f.importoTotale || 0;
        };
        const fatturatoScaduto = fattureScaduteNormali.reduce((sum, f) => sum + _calcolaImportoResiduo(f), 0);
        const fatturatoSospeso = fattureScaduteSospese.reduce((sum, f) => sum + _calcolaImportoResiduo(f), 0);

        // === SCADENZE NELLE APP ===
        // Calcola tutte le scadenze (scadute + imminenti ≤3gg) dalle app
        const _oggiApp = new Date();
        _oggiApp.setHours(0, 0, 0, 0);
        const _sysKPI = SettingsService.getSystemSettingsSync();
        const _sogliaApp = _sysKPI.sogliaImminente || 3;
        const _tra7giorniApp = new Date(_oggiApp);
        _tra7giorniApp.setDate(_oggiApp.getDate() + _sogliaApp);

        const scadenzeApp = [];
        (app || []).forEach(a => {
            const nomeApp = a.nomeApp || a.nome || 'App senza nome';
            const appId = a.id;
            const comune = a.comune || a.nomeComune || '';

            // Raccolta Differenziata
            if (a.ultimaDataRaccoltaDifferenziata) {
                const d = new Date(a.ultimaDataRaccoltaDifferenziata);
                d.setHours(0, 0, 0, 0);
                const isScaduta = d < _oggiApp;
                const isImminente = d >= _oggiApp && d <= _tra7giorniApp;
                if (isScaduta || isImminente) {
                    scadenzeApp.push({ tipo: 'Raccolta Differenziata', icona: 'fas fa-recycle', data: a.ultimaDataRaccoltaDifferenziata, isScaduta, nomeApp, appId, comune });
                }
            }
            // Farmacie di Turno
            if (a.ultimaDataFarmacieTurno) {
                const d = new Date(a.ultimaDataFarmacieTurno);
                d.setHours(0, 0, 0, 0);
                const isScaduta = d < _oggiApp;
                const isImminente = d >= _oggiApp && d <= _tra7giorniApp;
                if (isScaduta || isImminente) {
                    scadenzeApp.push({ tipo: 'Farmacie di Turno', icona: 'fas fa-pills', data: a.ultimaDataFarmacieTurno, isScaduta, nomeApp, appId, comune });
                }
            }
            // Notifiche Farmacie di Turno
            if (a.ultimaDataNotificheFarmacie) {
                const d = new Date(a.ultimaDataNotificheFarmacie);
                d.setHours(0, 0, 0, 0);
                const isScaduta = d < _oggiApp;
                const isImminente = d >= _oggiApp && d <= _tra7giorniApp;
                if (isScaduta || isImminente) {
                    scadenzeApp.push({ tipo: 'Notifiche Farmacie', icona: 'fas fa-bell', data: a.ultimaDataNotificheFarmacie, isScaduta, nomeApp, appId, comune });
                }
            }
            // Certificato Apple
            if (a.scadenzaCertificatoApple) {
                const d = new Date(a.scadenzaCertificatoApple);
                d.setHours(0, 0, 0, 0);
                const isScaduta = d < _oggiApp;
                const isImminente = d >= _oggiApp && d <= _tra7giorniApp;
                if (isScaduta || isImminente) {
                    scadenzeApp.push({ tipo: 'Certificato Apple', icona: 'fab fa-apple', data: a.scadenzaCertificatoApple, isScaduta, nomeApp, appId, comune });
                }
            }
            // Altra Scadenza
            if (a.altraScadenzaData) {
                const d = new Date(a.altraScadenzaData);
                d.setHours(0, 0, 0, 0);
                const isScaduta = d < _oggiApp;
                const isImminente = d >= _oggiApp && d <= _tra7giorniApp;
                if (isScaduta || isImminente) {
                    scadenzeApp.push({ tipo: a.altraScadenzaNote || 'Altra Scadenza', icona: 'fas fa-bookmark', data: a.altraScadenzaData, isScaduta, nomeApp, appId, comune });
                }
            }
        });

        // Ordina: prima le scadute (dalla più vecchia), poi le imminenti (dalla più prossima)
        scadenzeApp.sort((a, b) => {
            if (a.isScaduta && !b.isScaduta) return -1;
            if (!a.isScaduta && b.isScaduta) return 1;
            return new Date(a.data) - new Date(b.data);
        });

        const scadenzeAppScadute = scadenzeApp.filter(s => s.isScaduta);
        const scadenzeAppImminenti = scadenzeApp.filter(s => !s.isScaduta);

        // Salva in cache per drill-down
        this._kpiData = {
            scadenzeScadute,
            scadenzeScaduteSospese: scadenzeScaduteSospese || [],
            contrattiScaduti: contrattiScadutiList,
            fattureScadute,
            fattureScaduteNormali,
            fattureScaduteSospese,
            fatturatoSospeso,
            tasks,
            scadenzeApp,
            scadenzeAppScadute,
            scadenzeAppImminenti
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

        // Scaduto da incassare — SOLO ruoli amministrativi
        if (!_isTecnicoKPI && (AuthService.hasPermission('manage_invoices') || AuthService.hasPermission('view_invoices'))) {
            kpiCards.push(UI.createKPICard({
                icon: 'euro-sign',
                iconClass: 'danger',
                label: 'Scaduto da Incassare',
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

        // Scadenze nelle App — visibile a chi può vedere le app
        if (AuthService.hasPermission('view_apps') || AuthService.hasPermission('manage_apps') || AuthService.hasPermission('manage_app_content') || AuthService.hasPermission('view_all_data')) {
            const _totScadenzeApp = scadenzeApp.length;
            const _scaduteAppCount = scadenzeAppScadute.length;
            if (_totScadenzeApp > 0) {
                kpiCards.push(UI.createKPICard({
                    icon: 'calendar-day',
                    iconClass: _scaduteAppCount > 0 ? 'critical' : 'warning',
                    label: 'Scadenze nelle App',
                    value: _totScadenzeApp,
                    onclick: 'Dashboard.mostraDettaglioKPI("scadenzeApp")'
                }));
            }
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
                const itemsSospese = this._kpiData.scadenzeScaduteSospese || [];
                const hasSospese = itemsSospese.length > 0;

                // Conta per tipologia (per chiarezza nel titolo)
                const _nRinnovi = items.filter(s => s.tipo === 'CONTRATTO_RINNOVO').length;
                const _nIncassi = items.filter(s => s.tipo === 'FATTURA_INCASSO').length;
                const _nEmissioni = items.filter(s => s.tipo === 'FATTURA_EMISSIONE').length;
                const _dettaglio = [
                    _nRinnovi > 0 ? `${_nRinnovi} rinnovi` : '',
                    _nIncassi > 0 ? `${_nIncassi} incassi` : '',
                    _nEmissioni > 0 ? `${_nEmissioni} emissioni` : ''
                ].filter(Boolean).join(' + ');
                titolo = `Scadenze Critiche (${items.length})${_dettaglio ? ' — ' + _dettaglio : ''}`;

                // Helper per renderizzare una riga di scadenza critica
                const _renderRigaScadCritica = (s, isSospesa) => {
                    const giorni = Math.abs(Math.ceil((new Date(s.dataScadenza) - new Date()) / (1000 * 60 * 60 * 24)));
                    let tipoLabel = s.tipo === 'CONTRATTO_RINNOVO' ? 'Rinnovo' : s.tipo === 'FATTURA_INCASSO' ? 'Incasso' : s.tipo === 'FATTURA_EMISSIONE' ? 'Emissione' : s.tipo;
                    let onclick = s.tipo === 'CONTRATTO_RINNOVO' ? `UI.showPage('dettaglio-contratto','${s.id}')` :
                                  s.tipo === 'FATTURA_INCASSO' ? `UI.showPage('dettaglio-fattura','${s.id}')` :
                                  s.contrattoId ? `UI.showPage('dettaglio-contratto','${s.contrattoId}')` : '';
                    return `
                        <div class="list-item scadCrit-item ${isSospesa ? 'scadCrit-sospesa' : ''}" style="cursor:${onclick ? 'pointer' : 'default'};${isSospesa ? 'display:none;border-left:3px solid #FF9800;background:#FFFAF0;' : ''}" ${onclick ? `onclick="${onclick}"` : ''}>
                            <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;">
                                <div style="flex:1;min-width:0;">
                                    <div style="font-weight:600;color:var(--grigio-900);">
                                        ${isSospesa ? '<i class="fas fa-pause-circle" style="color:#FF9800;margin-right:4px;font-size:0.85rem;"></i>' : ''}${s.clienteRagioneSociale || 'N/A'}
                                    </div>
                                    <div style="font-size:0.8rem;color:var(--grigio-500);">${tipoLabel} • ${s.descrizione || ''}${isSospesa ? ' • <span style="color:#FF9800;font-weight:600;">Credito sospeso</span>' : ''}</div>
                                </div>
                                <div style="text-align:right;flex-shrink:0;">
                                    <span class="badge badge-danger">${giorni}gg fa</span>
                                    ${s.importo || s.importoTotale ? `<div style="font-size:0.8rem;font-weight:600;color:var(--grigio-700);margin-top:0.25rem;">${DataService.formatCurrency(s.importo || s.importoTotale)}</div>` : ''}
                                </div>
                            </div>
                        </div>`;
                };

                if (items.length === 0 && !hasSospese) {
                    listaHtml = '<p style="color:var(--grigio-500);text-align:center;padding:1rem;">Nessuna scadenza critica</p>';
                } else {
                    // Toggle crediti sospesi (se presenti)
                    if (hasSospese) {
                        listaHtml += `
                            <div style="padding:0.75rem 1rem;border-bottom:1px solid var(--grigio-300);background:var(--grigio-100);display:flex;align-items:center;justify-content:space-between;">
                                <button id="toggleSospesiScadCrit" onclick="Dashboard._toggleCreditiSospesi('scadCrit')" style="background:#FFF3E0;color:#E65100;border:1px solid #FFB74D;border-radius:20px;padding:0.4rem 1rem;font-size:0.8rem;font-weight:600;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;gap:0.4rem;">
                                    <i class="fas fa-pause-circle"></i> Vedi anche crediti sospesi <span style="background:#FFE0B2;padding:0.1rem 0.45rem;border-radius:10px;font-size:0.7rem;margin-left:2px;">${itemsSospese.length}</span>
                                </button>
                            </div>`;
                    }
                    listaHtml += '<div class="list-group">';
                    for (const s of items.slice(0, 30)) {
                        listaHtml += _renderRigaScadCritica(s, false);
                    }
                    // Righe sospese (nascoste di default)
                    for (const s of itemsSospese.slice(0, 30)) {
                        listaHtml += _renderRigaScadCritica(s, true);
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
                const itemsNormali = this._kpiData.fattureScaduteNormali || [];
                const itemsSospeseFatt = this._kpiData.fattureScaduteSospese || [];
                const hasSospeseFatt = itemsSospeseFatt.length > 0;

                const _calcolaResiduo = (f) => {
                    if (f.statoPagamento === 'PARZIALMENTE_PAGATA') {
                        const totAcc = (f.acconti || []).reduce((s, a) => s + (a.importo || 0), 0);
                        return Math.max(0, (f.importoTotale || 0) - totAcc);
                    }
                    return f.importoTotale || 0;
                };

                const totaleNormali = itemsNormali.reduce((sum, f) => sum + _calcolaResiduo(f), 0);
                const totaleSospese = itemsSospeseFatt.reduce((sum, f) => sum + _calcolaResiduo(f), 0);
                titolo = `Scaduto da Incassare — ${itemsNormali.length} fatture • Totale: ${DataService.formatCurrency(totaleNormali)}`;

                // Helper per riga fattura
                const _renderRigaFatt = (f, isSospesa) => {
                    const giorni = Math.abs(Math.ceil((new Date(f.dataScadenza) - new Date()) / (1000 * 60 * 60 * 24)));
                    const residuo = _calcolaResiduo(f);
                    const isParziale = f.statoPagamento === 'PARZIALMENTE_PAGATA';
                    const importoLabel = isParziale
                        ? DataService.formatCurrency(residuo) + ' <span style="font-size:0.75rem;font-weight:400;color:var(--grigio-500);">su ' + DataService.formatCurrency(f.importoTotale) + '</span>'
                        : DataService.formatCurrency(f.importoTotale);
                    return `
                        <div class="list-item fattScad-item ${isSospesa ? 'fattScad-sospesa' : ''}" style="cursor:pointer;${isSospesa ? 'display:none;border-left:3px solid #FF9800;background:#FFFAF0;' : ''}" onclick="UI.showPage('dettaglio-fattura','${f.id}')">
                            <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;">
                                <div style="flex:1;min-width:0;">
                                    <div style="font-weight:600;color:var(--grigio-900);">
                                        ${isSospesa ? '<i class="fas fa-pause-circle" style="color:#FF9800;margin-right:4px;font-size:0.85rem;"></i>' : ''}${f.clienteRagioneSociale || 'N/A'}
                                    </div>
                                    <div style="font-size:0.8rem;color:var(--grigio-500);">${f.numeroFatturaCompleto || f.numeroFattura || 'Fattura'} • Scadenza: ${DataService.formatDate(f.dataScadenza)} • ${isParziale ? 'Parz. pagata' : 'Non pagata'}${isSospesa ? ' • <span style="color:#FF9800;font-weight:600;">Credito sospeso</span>' : ''}</div>
                                </div>
                                <div style="text-align:right;flex-shrink:0;">
                                    <span class="badge badge-danger">${giorni}gg fa</span>
                                    <div style="font-size:1rem;font-weight:700;color:${isSospesa ? '#FF9800' : '#D32F2F'};margin-top:0.25rem;">${importoLabel}</div>
                                </div>
                            </div>
                        </div>`;
                };

                if (itemsNormali.length === 0 && !hasSospeseFatt) {
                    listaHtml = '<p style="color:var(--grigio-500);text-align:center;padding:1rem;">Nessuna fattura scaduta</p>';
                } else {
                    // Toggle crediti sospesi (se presenti)
                    if (hasSospeseFatt) {
                        listaHtml += `
                            <div style="padding:0.75rem 1rem;border-bottom:1px solid var(--grigio-300);background:var(--grigio-100);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;">
                                <button id="toggleSospesiFatt" onclick="Dashboard._toggleCreditiSospesi('fattScad')" style="background:#FFF3E0;color:#E65100;border:1px solid #FFB74D;border-radius:20px;padding:0.4rem 1rem;font-size:0.8rem;font-weight:600;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;gap:0.4rem;">
                                    <i class="fas fa-pause-circle"></i> Vedi anche crediti sospesi <span style="background:#FFE0B2;padding:0.1rem 0.45rem;border-radius:10px;font-size:0.7rem;margin-left:2px;">${itemsSospeseFatt.length} • ${DataService.formatCurrency(totaleSospese)}</span>
                                </button>
                            </div>`;
                    }
                    listaHtml += '<div class="list-group">';
                    const sortedNormali = [...itemsNormali].sort((a, b) => new Date(a.dataScadenza) - new Date(b.dataScadenza));
                    for (const f of sortedNormali) {
                        listaHtml += _renderRigaFatt(f, false);
                    }
                    // Righe sospese (nascoste di default)
                    const sortedSospese = [...itemsSospeseFatt].sort((a, b) => new Date(a.dataScadenza) - new Date(b.dataScadenza));
                    for (const f of sortedSospese) {
                        listaHtml += _renderRigaFatt(f, true);
                    }
                    listaHtml += '</div>';
                }
                break;
            }
            case 'scadenzeApp': {
                const allScadenzeApp = this._kpiData.scadenzeApp || [];
                const totalApp = allScadenzeApp.length;
                titolo = `Scadenze nelle App (${totalApp})`;

                if (totalApp === 0) {
                    listaHtml = '<p style="color:var(--grigio-500);text-align:center;padding:1rem;">Nessuna scadenza nelle app</p>';
                } else {
                    // Conta per tipologia (per mostrare badge sui filtri)
                    const tipologie = [
                        { key: 'Raccolta Differenziata', label: 'Raccolta Diff.', icona: 'fas fa-recycle', color: '#2E6DA8' },
                        { key: 'Farmacie di Turno', label: 'Farmacie Turno', icona: 'fas fa-pills', color: '#3CA434' },
                        { key: 'Notifiche Farmacie', label: 'Notifiche Farm.', icona: 'fas fa-bell', color: '#F59E0B' },
                        { key: 'Certificato Apple', label: 'Certificato Apple', icona: 'fab fa-apple', color: '#555' },
                        { key: '_altro', label: 'Altra Scadenza', icona: 'fas fa-bookmark', color: '#9B9B9B' }
                    ];

                    const contiPerTipo = {};
                    allScadenzeApp.forEach(s => {
                        const chiave = tipologie.find(t => t.key === s.tipo) ? s.tipo : '_altro';
                        contiPerTipo[chiave] = (contiPerTipo[chiave] || 0) + 1;
                    });

                    // Barra filtri
                    listaHtml = `
                        <div id="scadenzeAppFiltri" style="display:flex;flex-wrap:wrap;gap:0.5rem;padding:0.75rem 1rem;border-bottom:1px solid var(--grigio-300);background:var(--grigio-100);">
                            <button class="btn btn-sm scadApp-filtro attivo" data-filtro="tutti" onclick="Dashboard._filtroScadenzeApp('tutti')" style="background:var(--blu-700);color:white;border:none;border-radius:20px;padding:0.35rem 0.85rem;font-size:0.8rem;font-weight:600;cursor:pointer;transition:all 0.2s;">
                                Tutte <span style="background:rgba(255,255,255,0.3);padding:0.1rem 0.4rem;border-radius:10px;margin-left:4px;font-size:0.7rem;">${totalApp}</span>
                            </button>
                            ${tipologie.map(t => {
                                const count = contiPerTipo[t.key] || 0;
                                if (count === 0) return '';
                                return `<button class="btn btn-sm scadApp-filtro" data-filtro="${t.key}" onclick="Dashboard._filtroScadenzeApp('${t.key}')" style="background:white;color:var(--grigio-700);border:1px solid var(--grigio-300);border-radius:20px;padding:0.35rem 0.85rem;font-size:0.8rem;font-weight:600;cursor:pointer;transition:all 0.2s;">
                                    <i class="${t.icona}" style="margin-right:4px;color:${t.color};"></i>${t.label} <span style="background:var(--grigio-100);padding:0.1rem 0.4rem;border-radius:10px;margin-left:4px;font-size:0.7rem;">${count}</span>
                                </button>`;
                            }).join('')}
                        </div>
                    `;

                    // Helper per creare una riga scadenza
                    const _renderRigaScadApp = (s) => {
                        const isScaduta = s.isScaduta;
                        const giorni = Math.abs(Math.ceil((new Date(s.data) - new Date()) / (1000 * 60 * 60 * 24)));
                        const tipoFiltro = tipologie.find(t => t.key === s.tipo) ? s.tipo : '_altro';
                        return `
                            <div class="list-item scadApp-item" data-tipo-scadenza="${tipoFiltro}" style="cursor:pointer;" onclick="UI.showPage('dettaglio-app','${s.appId}')">
                                <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;">
                                    <div style="flex:1;min-width:0;">
                                        <div style="font-weight:600;color:var(--grigio-900);">
                                            <i class="${s.icona}" style="width:20px;text-align:center;margin-right:6px;color:${isScaduta ? 'var(--rosso-errore)' : '#F59E0B'};"></i>
                                            ${s.tipo}
                                        </div>
                                        <div style="font-size:0.8rem;color:var(--grigio-500);margin-top:2px;">
                                            <i class="fas fa-mobile-alt" style="width:14px;text-align:center;margin-right:4px;"></i> ${s.nomeApp}${s.comune ? ' &bull; ' + s.comune : ''}
                                        </div>
                                    </div>
                                    <div style="text-align:right;flex-shrink:0;">
                                        <span class="badge ${isScaduta ? 'badge-danger' : 'badge-warning'}">${isScaduta ? giorni + 'gg fa' : 'tra ' + giorni + 'gg'}</span>
                                        <div style="font-size:0.75rem;color:var(--grigio-500);margin-top:0.25rem;">${DataService.formatDate(s.data)}</div>
                                    </div>
                                </div>
                            </div>`;
                    };

                    // Sezione SCADUTE
                    const scaduteApp = allScadenzeApp.filter(s => s.isScaduta);
                    const imminentiApp = allScadenzeApp.filter(s => !s.isScaduta);

                    if (scaduteApp.length > 0) {
                        listaHtml += `
                            <div class="scadApp-sezione-header" data-sezione="scadute" style="padding: 0.75rem 1rem; background: #FDE8E8; border-left: 4px solid var(--rosso-errore); margin-bottom: 0.5rem;">
                                <strong style="color: var(--rosso-errore);"><i class="fas fa-exclamation-circle"></i> Scadute (<span id="scadAppCountScadute">${scaduteApp.length}</span>)</strong>
                            </div>
                            <div class="list-group" id="scadAppListScadute">
                                ${scaduteApp.map(s => _renderRigaScadApp(s)).join('')}
                            </div>`;
                    }

                    if (imminentiApp.length > 0) {
                        listaHtml += `
                            <div class="scadApp-sezione-header" data-sezione="imminenti" style="padding: 0.75rem 1rem; background: #FFF8E1; border-left: 4px solid var(--giallo-avviso); margin-top: ${scaduteApp.length > 0 ? '1rem' : '0'}; margin-bottom: 0.5rem;">
                                <strong style="color: #F59E0B;"><i class="fas fa-exclamation-triangle"></i> Imminenti — prossimi 3 giorni (<span id="scadAppCountImminenti">${imminentiApp.length}</span>)</strong>
                            </div>
                            <div class="list-group" id="scadAppListImminenti">
                                ${imminentiApp.map(s => _renderRigaScadApp(s)).join('')}
                            </div>`;
                    }
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

    // Filtro per tipologia nella lista Scadenze App
    _filtroScadenzeApp(filtro) {
        // Aggiorna stile bottoni filtro
        document.querySelectorAll('.scadApp-filtro').forEach(btn => {
            if (btn.dataset.filtro === filtro) {
                btn.style.background = 'var(--blu-700)';
                btn.style.color = 'white';
                btn.style.border = 'none';
            } else {
                btn.style.background = 'white';
                btn.style.color = 'var(--grigio-700)';
                btn.style.border = '1px solid var(--grigio-300)';
            }
        });

        // Mostra/nascondi gli item in base al filtro
        const items = document.querySelectorAll('.scadApp-item');
        let scaduteVisibili = 0;
        let imminentiVisibili = 0;

        items.forEach(item => {
            const tipoItem = item.dataset.tipoScadenza;
            const mostra = filtro === 'tutti' || tipoItem === filtro;
            item.style.display = mostra ? '' : 'none';

            if (mostra) {
                // Controlla se è nella sezione scadute o imminenti
                const parentList = item.closest('.list-group');
                if (parentList && parentList.id === 'scadAppListScadute') scaduteVisibili++;
                if (parentList && parentList.id === 'scadAppListImminenti') imminentiVisibili++;
            }
        });

        // Aggiorna contatori nelle intestazioni sezione
        const countScadute = document.getElementById('scadAppCountScadute');
        const countImminenti = document.getElementById('scadAppCountImminenti');
        if (countScadute) countScadute.textContent = scaduteVisibili;
        if (countImminenti) countImminenti.textContent = imminentiVisibili;

        // Nascondi le sezioni se non hanno item visibili
        document.querySelectorAll('.scadApp-sezione-header').forEach(header => {
            const sezione = header.dataset.sezione;
            const listId = sezione === 'scadute' ? 'scadAppListScadute' : 'scadAppListImminenti';
            const list = document.getElementById(listId);
            const visibili = sezione === 'scadute' ? scaduteVisibili : imminentiVisibili;
            header.style.display = visibili > 0 ? '' : 'none';
            if (list) list.style.display = visibili > 0 ? '' : 'none';
        });
    },

    // Toggle visibilità crediti sospesi nei drill-down (scadenzeCritiche / fatturatoScaduto)
    _toggleCreditiSospesi(prefisso) {
        // prefisso = 'scadCrit' oppure 'fattScad'
        const itemsSospesi = document.querySelectorAll(`.${prefisso}-sospesa`);
        if (itemsSospesi.length === 0) return;

        // Controlla stato attuale (visibile o nascosto)
        const primoItem = itemsSospesi[0];
        const isVisibile = primoItem.style.display !== 'none';

        // Toggle
        itemsSospesi.forEach(item => {
            item.style.display = isVisibile ? 'none' : '';
        });

        // Aggiorna stile bottone
        const btnId = prefisso === 'scadCrit' ? 'toggleSospesiScadCrit' : 'toggleSospesiFatt';
        const btn = document.getElementById(btnId);
        if (btn) {
            if (isVisibile) {
                // Torna allo stato "mostra"
                btn.style.background = '#FFF3E0';
                btn.style.color = '#E65100';
                btn.style.border = '1px solid #FFB74D';
                btn.innerHTML = btn.innerHTML.replace('Nascondi crediti sospesi', 'Vedi anche crediti sospesi');
            } else {
                // Stato "nascondi"
                btn.style.background = '#FF9800';
                btn.style.color = 'white';
                btn.style.border = '1px solid #FF9800';
                btn.innerHTML = btn.innerHTML.replace('Vedi anche crediti sospesi', 'Nascondi crediti sospesi');
            }
        }
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

    // ============================================
    // === WIDGET SCADENZE FUTURE APP ===
    // === (SUPER_ADMIN + CONTENT_MANAGER) ===
    // ============================================

    // Cache per il drill-down
    _scadenzeFutureAppCache: [],

    /**
     * Raccoglie TUTTE le scadenze future delle app (da oggi in poi, senza limite di giorni).
     * Include: Raccolta Differenziata, Farmacie di Turno, Notifiche Farmacie, Certificato Apple, Altra Scadenza.
     */
    _collectAllFutureAppDeadlines(apps) {
        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);
        const scadenze = [];

        (apps || []).forEach(a => {
            const nomeApp = a.nomeApp || a.nome || 'App senza nome';
            const appId = a.id;
            const comune = a.comune || a.nomeComune || '';

            // Raccolta Differenziata
            if (a.ultimaDataRaccoltaDifferenziata) {
                const d = new Date(a.ultimaDataRaccoltaDifferenziata);
                d.setHours(0, 0, 0, 0);
                if (d >= oggi) {
                    scadenze.push({ tipo: 'Raccolta Differenziata', icona: 'fas fa-recycle', colore: '#2E6DA8', data: a.ultimaDataRaccoltaDifferenziata, nomeApp, appId, comune });
                }
            }
            // Farmacie di Turno
            if (a.ultimaDataFarmacieTurno) {
                const d = new Date(a.ultimaDataFarmacieTurno);
                d.setHours(0, 0, 0, 0);
                if (d >= oggi) {
                    scadenze.push({ tipo: 'Farmacie di Turno', icona: 'fas fa-pills', colore: '#3CA434', data: a.ultimaDataFarmacieTurno, nomeApp, appId, comune });
                }
            }
            // Notifiche Farmacie
            if (a.ultimaDataNotificheFarmacie) {
                const d = new Date(a.ultimaDataNotificheFarmacie);
                d.setHours(0, 0, 0, 0);
                if (d >= oggi) {
                    scadenze.push({ tipo: 'Notifiche Farmacie', icona: 'fas fa-bell', colore: '#F59E0B', data: a.ultimaDataNotificheFarmacie, nomeApp, appId, comune });
                }
            }
            // Certificato Apple
            if (a.scadenzaCertificatoApple) {
                const d = new Date(a.scadenzaCertificatoApple);
                d.setHours(0, 0, 0, 0);
                if (d >= oggi) {
                    scadenze.push({ tipo: 'Certificato Apple', icona: 'fab fa-apple', colore: '#555', data: a.scadenzaCertificatoApple, nomeApp, appId, comune });
                }
            }
            // Altra Scadenza
            if (a.altraScadenzaData) {
                const d = new Date(a.altraScadenzaData);
                d.setHours(0, 0, 0, 0);
                if (d >= oggi) {
                    scadenze.push({ tipo: a.altraScadenzaNote || 'Altra Scadenza', icona: 'fas fa-bookmark', colore: '#9B9B9B', data: a.altraScadenzaData, nomeApp, appId, comune });
                }
            }
        });

        // Ordina cronologicamente (dalla più prossima alla più lontana)
        scadenze.sort((a, b) => new Date(a.data) - new Date(b.data));
        return scadenze;
    },

    /**
     * Renderizza il widget/banner cliccabile in cima alla dashboard.
     * Mostra un riepilogo con contatori per tipologia e un invito a cliccare.
     */
    _renderWidgetScadenzeFutureApp(scadenze) {
        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);

        // Conta per fasce temporali
        const tra7gg = new Date(oggi);
        tra7gg.setDate(tra7gg.getDate() + 7);
        const tra30gg = new Date(oggi);
        tra30gg.setDate(tra30gg.getDate() + 30);

        const entro7 = scadenze.filter(s => new Date(s.data) <= tra7gg).length;
        const entro30 = scadenze.filter(s => new Date(s.data) <= tra30gg).length;
        const oltre30 = scadenze.length - entro30;

        // Conta per tipologia
        const tipologie = {};
        scadenze.forEach(s => {
            const chiave = s.tipo;
            tipologie[chiave] = (tipologie[chiave] || 0) + 1;
        });

        // Badge tipologie (le più rilevanti)
        const badgeTipologie = Object.entries(tipologie)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([tipo, count]) => {
                const icona = tipo === 'Raccolta Differenziata' ? 'fa-recycle' :
                              tipo === 'Farmacie di Turno' ? 'fa-pills' :
                              tipo === 'Notifiche Farmacie' ? 'fa-bell' :
                              tipo === 'Certificato Apple' ? 'fa-apple' : 'fa-bookmark';
                const iconPrefix = tipo === 'Certificato Apple' ? 'fab' : 'fas';
                return `<span style="background: rgba(255,255,255,0.2); padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.75rem; white-space: nowrap;"><i class="${iconPrefix} ${icona}" style="margin-right: 3px;"></i>${tipo}: <strong>${count}</strong></span>`;
            }).join(' ');

        return `
            <div id="widgetScadenzeFutureApp" onclick="Dashboard.mostraScadenzeFutureApp()" style="
                background: linear-gradient(135deg, #145284 0%, #2E6DA8 50%, #3CA434 100%);
                border-radius: 16px;
                padding: 1.25rem 1.5rem;
                margin-bottom: 1.5rem;
                cursor: pointer;
                color: white;
                box-shadow: 0 4px 15px rgba(20, 82, 132, 0.3);
                transition: transform 0.2s, box-shadow 0.2s;
                position: relative;
                overflow: hidden;
            " onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(20,82,132,0.4)';" onmouseout="this.style.transform='';this.style.boxShadow='0 4px 15px rgba(20,82,132,0.3)';">
                <!-- Icona decorativa di sfondo -->
                <i class="fas fa-calendar-check" style="position: absolute; right: 1.5rem; top: 50%; transform: translateY(-50%); font-size: 4rem; opacity: 0.12;"></i>

                <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
                    <div style="background: rgba(255,255,255,0.2); width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="fas fa-calendar-alt" style="font-size: 1.5rem;"></i>
                    </div>
                    <div style="flex: 1; min-width: 200px;">
                        <div style="font-size: 1.15rem; font-weight: 900; margin-bottom: 0.3rem; letter-spacing: 0.02em;">
                            <i class="fas fa-clipboard-list" style="margin-right: 0.4rem;"></i>
                            Scadenze Contenuti App
                            <span style="background: rgba(255,255,255,0.25); padding: 0.15rem 0.6rem; border-radius: 20px; font-size: 0.85rem; margin-left: 0.5rem;">${scadenze.length}</span>
                        </div>
                        <div style="font-size: 0.85rem; opacity: 0.9; margin-bottom: 0.5rem;">
                            Pianifica in anticipo gli aggiornamenti delle app
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;">
                            ${entro7 > 0 ? `<span style="background: rgba(211,47,47,0.35); padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.75rem; font-weight: 700;"><i class="fas fa-exclamation-circle" style="margin-right: 3px;"></i>Entro 7gg: ${entro7}</span>` : ''}
                            ${entro30 > entro7 ? `<span style="background: rgba(255,204,0,0.3); padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.75rem; font-weight: 700;"><i class="fas fa-clock" style="margin-right: 3px;"></i>Entro 30gg: ${entro30 - entro7}</span>` : ''}
                            ${oltre30 > 0 ? `<span style="background: rgba(255,255,255,0.15); padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.75rem;"><i class="fas fa-hourglass-half" style="margin-right: 3px;"></i>Oltre 30gg: ${oltre30}</span>` : ''}
                        </div>
                    </div>
                    <div style="flex-shrink: 0; text-align: right;">
                        <div style="background: rgba(255,255,255,0.2); padding: 0.5rem 1rem; border-radius: 12px; font-size: 0.8rem; font-weight: 700;">
                            <i class="fas fa-chevron-right" style="margin-left: 0.3rem;"></i> Vedi tutte
                        </div>
                    </div>
                </div>
                ${badgeTipologie ? `<div style="display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.75rem;">${badgeTipologie}</div>` : ''}
            </div>

            <!-- Container per l'elenco espandibile -->
            <div id="scadenzeFutureAppPanel" style="display: none; margin-bottom: 1.5rem;"></div>
        `;
    },

    /**
     * Mostra/nasconde il pannello con l'elenco completo delle scadenze future.
     * Viene chiamato al click sul widget.
     */
    mostraScadenzeFutureApp() {
        const panel = document.getElementById('scadenzeFutureAppPanel');
        if (!panel) return;

        // Toggle: se è già visibile, nascondi
        if (panel.style.display !== 'none') {
            panel.style.display = 'none';
            return;
        }

        const scadenze = this._scadenzeFutureAppCache || [];
        if (scadenze.length === 0) {
            panel.innerHTML = '<div class="card"><div class="empty-state"><i class="fas fa-check-circle"></i><h3>Nessuna scadenza futura</h3></div></div>';
            panel.style.display = '';
            return;
        }

        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);

        // Tipologie per filtri
        const tipologieDef = [
            { key: 'Raccolta Differenziata', label: 'Raccolta Diff.', icona: 'fas fa-recycle', color: '#2E6DA8' },
            { key: 'Farmacie di Turno', label: 'Farmacie Turno', icona: 'fas fa-pills', color: '#3CA434' },
            { key: 'Notifiche Farmacie', label: 'Notifiche Farm.', icona: 'fas fa-bell', color: '#F59E0B' },
            { key: 'Certificato Apple', label: 'Certificato Apple', icona: 'fab fa-apple', color: '#555' },
            { key: '_altro', label: 'Altra Scadenza', icona: 'fas fa-bookmark', color: '#9B9B9B' }
        ];

        // Conta per tipo
        const contiPerTipo = {};
        scadenze.forEach(s => {
            const chiave = tipologieDef.find(t => t.key === s.tipo) ? s.tipo : '_altro';
            contiPerTipo[chiave] = (contiPerTipo[chiave] || 0) + 1;
        });

        // Raggruppa per mese
        const perMese = {};
        scadenze.forEach(s => {
            const d = new Date(s.data);
            const chiaveMese = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!perMese[chiaveMese]) perMese[chiaveMese] = [];
            perMese[chiaveMese].push(s);
        });

        const mesiLabel = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

        // Barra filtri
        let filtriHtml = `
            <div id="scadFutFiltri" style="display:flex;flex-wrap:wrap;gap:0.5rem;padding:0.75rem 1rem;border-bottom:1px solid var(--grigio-300);background:var(--grigio-100);border-radius:12px 12px 0 0;">
                <button class="btn btn-sm scadFut-filtro attivo" data-filtro="tutti" onclick="Dashboard._filtroScadenzeFuture('tutti')" style="background:var(--blu-700);color:white;border:none;border-radius:20px;padding:0.35rem 0.85rem;font-size:0.8rem;font-weight:600;cursor:pointer;">
                    Tutte <span style="background:rgba(255,255,255,0.3);padding:0.1rem 0.4rem;border-radius:10px;margin-left:4px;font-size:0.7rem;">${scadenze.length}</span>
                </button>
                ${tipologieDef.map(t => {
                    const count = contiPerTipo[t.key] || 0;
                    if (count === 0) return '';
                    return `<button class="btn btn-sm scadFut-filtro" data-filtro="${t.key}" onclick="Dashboard._filtroScadenzeFuture('${t.key}')" style="background:white;color:var(--grigio-700);border:1px solid var(--grigio-300);border-radius:20px;padding:0.35rem 0.85rem;font-size:0.8rem;font-weight:600;cursor:pointer;">
                        <i class="${t.icona}" style="margin-right:4px;color:${t.color};"></i>${t.label} <span style="background:var(--grigio-100);padding:0.1rem 0.4rem;border-radius:10px;margin-left:4px;font-size:0.7rem;">${count}</span>
                    </button>`;
                }).join('')}
            </div>
        `;

        // Render righe raggruppate per mese
        let listaHtml = '';
        const mesiOrdinati = Object.keys(perMese).sort();
        mesiOrdinati.forEach(chiaveMese => {
            const [anno, mese] = chiaveMese.split('-');
            const meseIdx = parseInt(mese) - 1;
            const items = perMese[chiaveMese];

            listaHtml += `
                <div class="scadFut-mese-header" style="padding: 0.6rem 1rem; background: var(--blu-100); border-left: 4px solid var(--blu-700); margin-top: 0.5rem; font-weight: 700; color: var(--blu-700); font-size: 0.9rem; display: flex; justify-content: space-between; align-items: center;">
                    <span><i class="fas fa-calendar" style="margin-right: 0.5rem;"></i>${mesiLabel[meseIdx]} ${anno}</span>
                    <span style="background: var(--blu-700); color: white; padding: 0.15rem 0.5rem; border-radius: 12px; font-size: 0.75rem;" class="scadFut-mese-count" data-mese="${chiaveMese}">${items.length}</span>
                </div>
                <div class="list-group">
            `;

            items.forEach(s => {
                const giorni = Math.ceil((new Date(s.data) - oggi) / (1000 * 60 * 60 * 24));
                const tipoFiltro = tipologieDef.find(t => t.key === s.tipo) ? s.tipo : '_altro';

                // Colore urgenza
                let badgeColor, badgeBg, badgeLabel;
                if (giorni === 0) {
                    badgeColor = '#D32F2F'; badgeBg = '#FFEBEE'; badgeLabel = 'OGGI';
                } else if (giorni <= 3) {
                    badgeColor = '#D32F2F'; badgeBg = '#FFEBEE'; badgeLabel = `tra ${giorni}gg`;
                } else if (giorni <= 7) {
                    badgeColor = '#E65100'; badgeBg = '#FFF3E0'; badgeLabel = `tra ${giorni}gg`;
                } else if (giorni <= 30) {
                    badgeColor = '#F59E0B'; badgeBg = '#FFFDE7'; badgeLabel = `tra ${giorni}gg`;
                } else {
                    badgeColor = 'var(--blu-500)'; badgeBg = 'var(--blu-100)'; badgeLabel = `tra ${giorni}gg`;
                }

                listaHtml += `
                    <div class="list-item scadFut-item" data-tipo-scadenza="${tipoFiltro}" style="cursor:pointer; transition: background 0.15s;" onclick="UI.showPage('dettaglio-app','${s.appId}')" onmouseover="this.style.background='var(--grigio-100)'" onmouseout="this.style.background=''">
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;">
                            <div style="flex-shrink:0; width:36px; height:36px; border-radius:10px; background:${s.colore || '#2E6DA8'}15; display:flex; align-items:center; justify-content:center;">
                                <i class="${s.icona}" style="color:${s.colore || '#2E6DA8'};font-size:1rem;"></i>
                            </div>
                            <div style="flex:1;min-width:0;">
                                <div style="font-weight:600;color:var(--grigio-900);font-size:0.9rem;">
                                    ${s.tipo}
                                </div>
                                <div style="font-size:0.8rem;color:var(--grigio-500);margin-top:2px;">
                                    <i class="fas fa-mobile-alt" style="width:14px;text-align:center;margin-right:4px;"></i>${s.nomeApp}${s.comune ? ' &bull; <i class="fas fa-map-marker-alt" style="margin:0 2px;"></i>' + s.comune : ''}
                                </div>
                            </div>
                            <div style="text-align:right;flex-shrink:0;">
                                <span style="background:${badgeBg};color:${badgeColor};padding:0.2rem 0.6rem;border-radius:12px;font-size:0.75rem;font-weight:700;">${badgeLabel}</span>
                                <div style="font-size:0.75rem;color:var(--grigio-500);margin-top:0.25rem;">${DataService.formatDate(s.data)}</div>
                            </div>
                        </div>
                    </div>`;
            });

            listaHtml += '</div>';
        });

        panel.innerHTML = `
            <div class="card fade-in" style="border: 2px solid var(--blu-300); border-radius: 16px; overflow: hidden;">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;background:white;padding:1rem 1.25rem;">
                    <h2 class="card-title" style="font-size:1.1rem;margin:0;">
                        <i class="fas fa-clipboard-list" style="color:var(--blu-700);margin-right:0.5rem;"></i>
                        Tutte le Scadenze Future (${scadenze.length})
                    </h2>
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('scadenzeFutureAppPanel').style.display='none'" style="border-radius:20px;">
                        <i class="fas fa-times"></i> Chiudi
                    </button>
                </div>
                ${filtriHtml}
                <div style="max-height:600px;overflow-y:auto;">
                    ${listaHtml}
                </div>
            </div>
        `;

        panel.style.display = '';
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    /**
     * Filtro per tipologia nell'elenco scadenze future
     */
    _filtroScadenzeFuture(filtro) {
        // Aggiorna stile bottoni
        document.querySelectorAll('.scadFut-filtro').forEach(btn => {
            if (btn.dataset.filtro === filtro) {
                btn.style.background = 'var(--blu-700)';
                btn.style.color = 'white';
                btn.style.border = 'none';
            } else {
                btn.style.background = 'white';
                btn.style.color = 'var(--grigio-700)';
                btn.style.border = '1px solid var(--grigio-300)';
            }
        });

        // Mostra/nascondi gli item
        const items = document.querySelectorAll('.scadFut-item');
        const mesiCounters = {};

        items.forEach(item => {
            const tipoItem = item.dataset.tipoScadenza;
            const mostra = filtro === 'tutti' || tipoItem === filtro;
            item.style.display = mostra ? '' : 'none';

            // Aggiorna contatori mese
            if (mostra) {
                // Trova il mese di appartenenza cercando il header precedente
                let el = item.parentElement;
                while (el && !el.previousElementSibling?.classList?.contains('scadFut-mese-header')) {
                    el = el.parentElement;
                }
                if (el && el.previousElementSibling) {
                    const headerEl = el.previousElementSibling;
                    const countEl = headerEl.querySelector('.scadFut-mese-count');
                    if (countEl) {
                        const chiaveMese = countEl.dataset.mese;
                        mesiCounters[chiaveMese] = (mesiCounters[chiaveMese] || 0) + 1;
                    }
                }
            }
        });

        // Aggiorna visibilità e contatori degli header mese
        document.querySelectorAll('.scadFut-mese-header').forEach(header => {
            const countEl = header.querySelector('.scadFut-mese-count');
            if (countEl) {
                const chiaveMese = countEl.dataset.mese;
                const count = mesiCounters[chiaveMese] || 0;
                countEl.textContent = count;
                // Nascondi l'intero blocco mese se nessun item è visibile
                const listGroup = header.nextElementSibling;
                header.style.display = count > 0 ? '' : 'none';
                if (listGroup) listGroup.style.display = count > 0 ? '' : 'none';
            }
        });
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

        // Helper: parsing date robusto (supporta Firestore Timestamp, stringa ISO, Date)
        const parseData = (d) => {
            if (!d) return null;
            if (d.toDate) return d.toDate(); // Firestore Timestamp
            if (d.seconds) return new Date(d.seconds * 1000); // Firestore Timestamp raw
            const parsed = new Date(d);
            return isNaN(parsed.getTime()) ? null : parsed;
        };

        // ── FATTURATO EMESSO (tutte le fatture emesse, al netto delle NC) ──
        // Per l'agente "fatturato" = valore fatturato/emesso, non solo incassato
        const annoCorrente = oggi.getFullYear();
        const meseCorrente = oggi.getMonth();

        // Fatture valide (esclude solo bozze se ce ne sono)
        const fattureValide = fatture.filter(f => f.tipoDocumento !== 'PROFORMA');

        // Fatturato EMESSO totale (tutte le fatture emesse di tutti gli anni)
        const fatturatoTotale = fattureValide
            .reduce((sum, f) => sum + calcolaImportoFattura(f), 0);

        // Fatturato EMESSO anno corrente
        const fatturatoAnno = fattureValide
            .filter(f => {
                const de = parseData(f.dataEmissione);
                return de && de.getFullYear() === annoCorrente;
            })
            .reduce((sum, f) => sum + calcolaImportoFattura(f), 0);

        // Fatturato EMESSO mese corrente
        const fatturatoMese = fattureValide
            .filter(f => {
                const de = parseData(f.dataEmissione);
                return de && de.getFullYear() === annoCorrente && de.getMonth() === meseCorrente;
            })
            .reduce((sum, f) => sum + calcolaImportoFattura(f), 0);

        // Fatturato INCASSATO (solo PAGATA) — per le sotto-etichette
        const fatturatoIncassatoAnno = fattureValide
            .filter(f => {
                if (f.statoPagamento !== 'PAGATA' && f.tipoDocumento !== 'NOTA_DI_CREDITO') return false;
                const de = parseData(f.dataEmissione);
                return de && de.getFullYear() === annoCorrente;
            })
            .reduce((sum, f) => sum + calcolaImportoFattura(f), 0);

        const fatturatoIncassatoTotale = fattureValide
            .filter(f => f.statoPagamento === 'PAGATA' || f.tipoDocumento === 'NOTA_DI_CREDITO')
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
        let scadenzeImminentiAlert = []; // Finestra 3gg per widget "Prossime Attività"
        try {
            const scadenzeCalcolate = await DataService.getScadenzeCompute({
                contratti: contratti,
                fatture: fatture,
                clienti: clienti
            });

            // Finestra alert (3gg) — per widget prossime attività
            const finestraAlert = new Date(oggi);
            finestraAlert.setDate(finestraAlert.getDate() + 3);

            scadenzeScadute = scadenzeCalcolate.tutteLeScadenze.filter(s =>
                s.dataScadenza && new Date(s.dataScadenza) < oggi
            );
            scadenzeImminenti = scadenzeCalcolate.tutteLeScadenze.filter(s => {
                if (!s.dataScadenza) return false;
                const ds = new Date(s.dataScadenza);
                return ds >= oggi && ds <= tra30giorni;
            });
            scadenzeImminentiAlert = scadenzeCalcolate.tutteLeScadenze.filter(s => {
                if (!s.dataScadenza) return false;
                const ds = new Date(s.dataScadenza);
                return ds >= oggi && ds <= finestraAlert;
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
                        <i class="fas fa-file-invoice-dollar"></i> Fatturato ${annoCorrente}
                    </div>
                    <div style="font-size: 1.8rem; font-weight: 900;">${DataService.formatCurrency(fatturatoAnno)}</div>
                    <div style="font-size: 0.7rem; opacity: 0.7; margin-top: 0.35rem;">
                        <i class="fas fa-check-circle"></i> Incassato: ${DataService.formatCurrency(fatturatoIncassatoAnno)}
                    </div>
                </div>
                <div style="background: linear-gradient(135deg, var(--verde-700), var(--verde-500)); border-radius: 12px; padding: 1.5rem; color: white; text-align: center;">
                    <div style="font-size: 0.85rem; opacity: 0.8; margin-bottom: 0.5rem;">
                        <i class="fas fa-calendar-alt"></i> Fatturato Mese
                    </div>
                    <div style="font-size: 1.8rem; font-weight: 900;">${DataService.formatCurrency(fatturatoMese)}</div>
                </div>
                <div style="background: linear-gradient(135deg, #0D3A5C, #145284); border-radius: 12px; padding: 1.5rem; color: white; text-align: center;">
                    <div style="font-size: 0.85rem; opacity: 0.8; margin-bottom: 0.5rem;">
                        <i class="fas fa-coins"></i> Fatturato Totale
                    </div>
                    <div style="font-size: 1.8rem; font-weight: 900;">${DataService.formatCurrency(fatturatoTotale)}</div>
                    <div style="font-size: 0.7rem; opacity: 0.7; margin-top: 0.35rem;">
                        <i class="fas fa-check-circle"></i> Incassato: ${DataService.formatCurrency(fatturatoIncassatoTotale)}
                    </div>
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
                <!-- PROSSIME ATTIVITÀ (3gg) -->
                <div id="widgetProssimeAttivita" style="background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
                    <h3 style="font-size: 1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 1rem;">
                        <i class="fas fa-calendar-week"></i> Prossime Attività (3gg)
                    </h3>
                    ${this.renderWidgetProssimeAttivita([...scadenzeScadute, ...scadenzeImminentiAlert])}
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
                        <button class="btn btn-secondary" onclick="UI.showPage('report-app')" style="width: 100%; text-align: left;">
                            <i class="fas fa-chart-line"></i> Report App
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
     * Widget: Prossime attività nei prossimi 3 giorni
     */
    renderWidgetProssimeAttivita(scadenze) {
        const oggi = new Date();
        const _sysPA = SettingsService.getSystemSettingsSync();
        const giorniFinestra = _sysPA.sogliaImminente || 3;
        const traXgg = new Date(oggi);
        traXgg.setDate(traXgg.getDate() + giorniFinestra);

        const prossime = scadenze
            .filter(s => {
                if (!s.dataScadenza) return false;
                const data = new Date(s.dataScadenza);
                return data >= oggi && data <= traXgg;
            })
            .sort((a, b) => new Date(a.dataScadenza) - new Date(b.dataScadenza))
            .slice(0, 5);

        if (prossime.length === 0) {
            return `<div style="text-align:center;padding:1rem;color:var(--grigio-400);"><i class="fas fa-check-circle" style="font-size:1.5rem;display:block;margin-bottom:0.5rem;"></i>Nessuna attività nei prossimi ${giorniFinestra} giorni</div>`;
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

        const totaleScadenzeFinestra = scadenze.filter(s => s.dataScadenza && new Date(s.dataScadenza) >= oggi && new Date(s.dataScadenza) <= traXgg).length;
        if (totaleScadenzeFinestra > 5) {
            html += `<div style="text-align:center;margin-top:0.5rem;"><a href="#" onclick="UI.showPage('scadenzario');return false;" style="font-size:0.8rem;color:var(--blu-500);text-decoration:none;">Vedi tutte (${totaleScadenzeFinestra}) →</a></div>`;
        }

        return html;
    },

    /**
     * Widget: Task aperti (caricamento asincrono)
     */
    async loadWidgetTaskAperti() {
        try {
            const tasksResult = await TaskService.getAllTasks();
            const allTasks = (tasksResult && tasksResult.tasks) ? tasksResult.tasks : [];
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
                if (f.statoPagamento === 'PARZIALMENTE_PAGATA' && f.acconti && f.acconti.length > 0) {
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
        // Top 5 clienti per fatturato EMESSO (tutte le fatture, note di credito sottraggono)
        const clientiFatturato = clienti.map(c => {
            const ids = new Set([c.id, c.clienteIdLegacy].filter(Boolean));
            const nomeNorm = (c.ragioneSociale || '').trim().toLowerCase();
            const fattCliente = fatture.filter(f => {
                if (f.tipoDocumento === 'PROFORMA') return false;
                if (f.clienteId && ids.has(f.clienteId)) return true;
                if (f.clienteRagioneSociale && f.clienteRagioneSociale.trim().toLowerCase() === nomeNorm) return true;
                return false;
            });
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
            const isParziale = f.statoPagamento === 'PARZIALMENTE_PAGATA';
            let residuo = f.importoTotale || 0;
            if (isParziale) {
                const totAcconti = (f.acconti || []).reduce((s, a) => s + (a.importo || 0), 0);
                residuo = Math.max(0, (f.importoTotale || 0) - totAcconti);
            }
            const importoLabel = isParziale
                ? DataService.formatCurrency(residuo) + ' <span style="font-size:0.75rem;font-weight:400;color:var(--grigio-500);">su ' + DataService.formatCurrency(f.importoTotale) + '</span>'
                : DataService.formatCurrency(f.importoTotale);
            righe += `<div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.5rem; border-bottom: 1px solid var(--grigio-100); ${scaduta ? 'background: #FFF3F3; border-radius: 6px; margin-bottom: 2px;' : ''}">
                <div style="flex: 1;">
                    <a href="#" onclick="UI.showPage('dettaglio-fattura', '${f.id}')" style="color: var(--blu-700); text-decoration: none; font-weight: 600; font-size: 0.9rem;">${f.numeroFattura || f.numeroFatturaCompleto || 'N/D'}</a>
                    <div style="font-size: 0.8rem; color: var(--grigio-500);">${nomeCliente} • Scad. ${DataService.formatDate(f.dataScadenza)}${isParziale ? ' • Parz. pagata' : ''}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight: 700; color: ${scaduta ? '#D32F2F' : 'var(--grigio-700)'};">${importoLabel}</div>
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
    },

    // =====================================================================
    // AI CHAT ASSISTANT (solo CTO / Admin / Super Admin)
    // =====================================================================
    _aiChatHistory: [],
    _aiChatDataCache: null, // Cache per TUTTI i dati CRM (app, clienti, contratti, fatture, scadenze)
    _aiChatVisible: false,

    toggleAIChat() {
        this._aiChatVisible = !this._aiChatVisible;
        let panel = document.getElementById('aiChatPanel');
        if (!panel) {
            // Crea il pannello la prima volta
            const wrapper = document.createElement('div');
            wrapper.innerHTML = this._buildAIChatPanel();
            document.body.appendChild(wrapper.firstElementChild);
            panel = document.getElementById('aiChatPanel');
        }
        panel.style.display = this._aiChatVisible ? 'flex' : 'none';
        if (this._aiChatVisible) {
            const input = document.getElementById('aiChatInput');
            if (input) setTimeout(() => input.focus(), 100);
        }
    },

    _buildAIChatPanel() {
        const suggerimenti = [
            'Fammi un riepilogo generale del CRM: clienti, contratti, fatture e app',
            'Quali fatture sono ancora non pagate? Elenca importi e clienti',
            'Elenca i contratti in scadenza nei prossimi 60 giorni',
            'Quali sono le scadenze piu urgenti nello scadenzario?',
            'Fammi la lista delle pubblicazioni sugli store piu vecchie',
            'Qual e\' il fatturato totale e quante fatture sono state emesse?',
            'Quali clienti hanno contratti attivi? Elenca con importi',
            'Quali app hanno la penetrazione piu bassa rispetto alla popolazione?'
        ];

        return `
        <div id="aiChatPanel" style="
            display: none; position: fixed; bottom: 0; right: 0;
            width: 480px; max-width: 100vw; height: 85vh; max-height: 700px;
            flex-direction: column; z-index: 9999;
            box-shadow: -4px 0 30px rgba(0,0,0,0.2); border-radius: 16px 0 0 0;
            overflow: hidden; background: white;
        ">
            <!-- Header -->
            <div style="padding: 1rem 1.25rem; background: linear-gradient(135deg, var(--blu-700) 0%, var(--blu-900, #0D3A5C) 100%); display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0;">
                <div style="width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,0.15); display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-robot" style="color: white; font-size: 1.1rem;"></i>
                </div>
                <div style="flex: 1;">
                    <div style="color: white; font-weight: 700; font-size: 0.95rem;">AI Assistant</div>
                    <div style="color: rgba(255,255,255,0.7); font-size: 0.7rem;">Analisi dati CRM • Claude Haiku</div>
                </div>
                <button onclick="Dashboard.clearAIChat()" style="background: rgba(255,255,255,0.15); color: white; border: none; padding: 0.3rem 0.6rem; border-radius: 6px; font-size: 0.7rem; cursor: pointer;" title="Nuova conversazione">
                    <i class="fas fa-trash-alt"></i>
                </button>
                <button onclick="Dashboard.toggleAIChat()" style="background: rgba(255,255,255,0.15); color: white; border: none; padding: 0.3rem 0.6rem; border-radius: 6px; font-size: 0.9rem; cursor: pointer;" title="Chiudi">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <!-- Messages -->
            <div id="aiChatMessages" style="flex: 1; overflow-y: auto; padding: 1rem; background: var(--grigio-100); display: flex; flex-direction: column; gap: 0.75rem;">
                <!-- Welcome -->
                <div style="display: flex; gap: 0.6rem; align-items: flex-start;">
                    <div style="width: 28px; height: 28px; border-radius: 50%; background: var(--blu-700); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="fas fa-robot" style="color: white; font-size: 0.7rem;"></i>
                    </div>
                    <div style="background: white; padding: 0.85rem; border-radius: 0 10px 10px 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); max-width: 85%;">
                        <div style="font-weight: 600; color: var(--blu-700); margin-bottom: 0.4rem; font-size: 0.9rem;">Ciao! Sono l'assistente AI del CRM.</div>
                        <div style="color: var(--grigio-700); font-size: 0.85rem; line-height: 1.4;">
                            Ho accesso a tutti i dati del CRM: app, clienti, contratti, fatture e scadenze. Chiedimi analisi, elenchi, confronti e suggerimenti.
                        </div>
                    </div>
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 0.4rem; padding: 0.25rem 0 0 2.25rem;">
                    ${suggerimenti.map(s => `
                        <button onclick="Dashboard.askAI(this.textContent.trim())" style="
                            background: white; border: 1.5px solid var(--blu-300); color: var(--blu-700);
                            padding: 0.4rem 0.7rem; border-radius: 18px; font-size: 0.75rem; cursor: pointer;
                            transition: all 0.2s; line-height: 1.3; text-align: left;
                        " onmouseover="this.style.background='var(--blu-100)';this.style.borderColor='var(--blu-700)'"
                           onmouseout="this.style.background='white';this.style.borderColor='var(--blu-300)'">
                            ${s}
                        </button>
                    `).join('')}
                </div>
            </div>

            <!-- Input -->
            <div style="padding: 0.75rem; background: white; border-top: 2px solid var(--grigio-300); flex-shrink: 0;">
                <div style="display: flex; gap: 0.5rem;">
                    <input type="text" id="aiChatInput"
                        placeholder="Chiedi qualcosa sui dati..."
                        style="flex: 1; padding: 0.65rem 0.85rem; border: 2px solid var(--grigio-300); border-radius: 10px; font-size: 0.85rem; font-family: 'Titillium Web', sans-serif; outline: none; transition: border-color 0.2s;"
                        onfocus="this.style.borderColor='var(--blu-500)'"
                        onblur="this.style.borderColor='var(--grigio-300)'"
                        onkeydown="if(event.key==='Enter' && !event.shiftKey) { event.preventDefault(); Dashboard.sendAIMessage(); }"
                    />
                    <button id="aiChatSendBtn" onclick="Dashboard.sendAIMessage()" class="btn btn-primary" style="padding: 0.65rem 1rem; border-radius: 10px; font-size: 0.95rem;">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
                <div style="margin-top: 0.35rem; font-size: 0.65rem; color: var(--grigio-500); text-align: center;">
                    <i class="fas fa-lock" style="margin-right: 0.2rem;"></i> I dati non vengono salvati esternamente
                </div>
            </div>
        </div>`;
    },

    askAI(question) {
        const input = document.getElementById('aiChatInput');
        if (input) {
            input.value = question;
            this.sendAIMessage();
        }
    },

    clearAIChat() {
        this._aiChatHistory = [];
        this._aiChatDataCache = null;
        const messagesContainer = document.getElementById('aiChatMessages');
        if (messagesContainer) {
            // Rimuovi il pannello e ricrealo
            const panel = document.getElementById('aiChatPanel');
            if (panel) panel.remove();
            this._aiChatVisible = false;
            this.toggleAIChat();
        }
    },

    _renderChatMessage(msg) {
        if (msg.role === 'user') {
            return `
                <div style="display: flex; gap: 0.6rem; align-items: flex-start; justify-content: flex-end;">
                    <div style="background: var(--blu-700); color: white; padding: 0.7rem 0.85rem; border-radius: 10px 0 10px 10px; max-width: 80%; font-size: 0.85rem; line-height: 1.4;">
                        ${msg.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
                    </div>
                    <div style="width: 28px; height: 28px; border-radius: 50%; background: var(--grigio-300); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="fas fa-user" style="color: var(--grigio-700); font-size: 0.7rem;"></i>
                    </div>
                </div>`;
        } else {
            return `
                <div style="display: flex; gap: 0.6rem; align-items: flex-start;">
                    <div style="width: 28px; height: 28px; border-radius: 50%; background: var(--blu-700); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="fas fa-robot" style="color: white; font-size: 0.7rem;"></i>
                    </div>
                    <div style="background: white; padding: 0.85rem; border-radius: 0 10px 10px 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); max-width: 85%; font-size: 0.85rem; line-height: 1.5; color: var(--grigio-900); white-space: pre-wrap;">
                        ${msg.content}
                        ${msg.usage ? `<div style="margin-top: 0.5rem; padding-top: 0.4rem; border-top: 1px solid var(--grigio-300); font-size: 0.65rem; color: var(--grigio-500);"><i class="fas fa-microchip"></i> Token: ${msg.usage.input_tokens} in / ${msg.usage.output_tokens} out</div>` : ''}
                    </div>
                </div>`;
        }
    },

    /**
     * Crea un riepilogo LEGGERO di tutte le app per il contesto AI
     * (solo campi essenziali, niente gbStatsCache pesante)
     */
    _buildLightAppSummary(apps) {
        if (!apps || !Array.isArray(apps)) return [];
        return apps.map(a => ({
            id: a.id,
            nome: a.nome,
            comune: a.comune,
            provincia: a.provincia,
            regione: a.regione,
            statoApp: a.statoApp,
            popolazione: a.popolazione || 0,
            numDownloads: (a.gbStatsCache?.totalDownloads) || a.numDownloads || 0,
            launchesMonth: a.gbStatsCache?.launchesMonth || 0,
            pageViewsMonth: a.gbStatsCache?.pageViewsMonth || 0,
            consensiPush: a.consensiPush || 0,
            dataPubblicazioneApple: a.dataPubblicazioneApple || null,
            dataPubblicazioneAndroid: a.dataPubblicazioneAndroid || null,
            scadenzaCertificatoApple: a.scadenzaCertificatoApple || null,
            ultimaDataRaccoltaDifferenziata: a.ultimaDataRaccoltaDifferenziata || null,
            ultimaDataFarmacieTurno: a.ultimaDataFarmacieTurno || null,
            ultimaDataNotificheFarmacie: a.ultimaDataNotificheFarmacie || null,
            altraScadenzaData: a.altraScadenzaData || null,
            altraScadenzaNote: a.altraScadenzaNote || null,
            hasGruppoTelegram: a.hasGruppoTelegram,
            hasAvvisiFlash: a.hasAvvisiFlash,
            feedRssCount: Array.isArray(a.feedRss) ? a.feedRss.length : 0,
            referenteComune: a.referenteComune || null,
            dataUltimoControlloQualita: a.dataUltimoControlloQualita || null,
            controlloQualitaNegativo: a.controlloQualitaNegativo || false,
            tipoPagamento: a.tipoPagamento || null,
            // Credenziali Apple Developer
            appleUsername: a.appleUsername || null,
            applePassword: a.applePassword || null,
            appleEmailAggiuntiva: a.appleEmailAggiuntiva || null,
            appleTelefonoOtp: a.appleTelefonoOtp || null,
            // Contatti e note
            telefonoReferente: a.telefonoReferente || null,
            emailReferente: a.emailReferente || null,
            note1: a.note1 ? a.note1.substring(0, 150) : null,
            note2: a.note2 ? a.note2.substring(0, 150) : null
        }));
    },

    /**
     * Crea un riepilogo LEGGERO dei clienti per il contesto AI
     */
    _buildLightClientiSummary(clienti) {
        if (!clienti || !Array.isArray(clienti)) return [];
        return clienti.map(c => ({
            id: c.id,
            ragioneSociale: c.ragioneSociale || '',
            tipo: c.tipo || '',
            comune: c.comune || '',
            provincia: c.provincia || '',
            regione: c.regione || '',
            email: c.email || '',
            pec: c.pec || '',
            telefono: c.telefono || '',
            agente: c.agente || '',
            statoContratto: c.statoContratto || '',
            numResidenti: c.numResidenti || 0,
            note: (c.note || '').substring(0, 100)
        }));
    },

    /**
     * Crea un riepilogo LEGGERO dei contratti per il contesto AI
     */
    _buildLightContrattiSummary(contratti) {
        if (!contratti || !Array.isArray(contratti)) return [];
        return contratti.map(c => ({
            id: c.id,
            numeroContratto: c.numeroContratto || '',
            oggetto: c.oggetto || '',
            clienteId: c.clienteId || '',
            clienteRagioneSociale: c.clienteRagioneSociale || '',
            tipologia: c.tipologia || '',
            stato: c.stato || '',
            importoAnnuale: c.importoAnnuale || 0,
            importoMensile: c.importoMensile || 0,
            dataInizio: c.dataInizio || null,
            dataScadenza: c.dataScadenza || null,
            durataContratto: c.durataContratto || 0,
            periodicita: c.periodicita || '',
            modalitaPagamento: c.modalitaPagamento || ''
        }));
    },

    /**
     * Crea un riepilogo LEGGERO delle fatture per il contesto AI
     */
    _buildLightFattureSummary(fatture) {
        if (!fatture || !Array.isArray(fatture)) return [];
        return fatture.map(f => ({
            id: f.id,
            numeroFatturaCompleto: f.numeroFatturaCompleto || f.numeroFattura || '',
            clienteId: f.clienteId || '',
            clienteRagioneSociale: f.clienteRagioneSociale || '',
            contrattoId: f.contrattoId || '',
            dataEmissione: f.dataEmissione || null,
            dataScadenza: f.dataScadenza || null,
            importoTotale: f.importoTotale || 0,
            imponibile: f.imponibile || 0,
            importoIva: f.importoIva || 0,
            statoPagamento: f.statoPagamento || '',
            dataPagamento: f.dataPagamento || null,
            importoAcconto: f.importoAcconto || 0,
            saldoResiduo: f.saldoResiduo || 0,
            anno: f.anno || ''
        }));
    },

    /**
     * Crea un riepilogo LEGGERO delle scadenze per il contesto AI
     */
    _buildLightScadenzeSummary(scadenze) {
        if (!scadenze || !Array.isArray(scadenze)) return [];
        return scadenze.map(s => ({
            id: s.id,
            tipo: s.tipo || '',
            dataScadenza: s.dataScadenza || null,
            clienteId: s.clienteId || '',
            clienteRagioneSociale: s.clienteRagioneSociale || '',
            agente: s.agente || '',
            importo: s.importo || 0,
            descrizione: (s.descrizione || '').substring(0, 150),
            completata: s.completata || false,
            fatturaId: s.fatturaId || ''
        }));
    },

    async sendAIMessage() {
        const input = document.getElementById('aiChatInput');
        const sendBtn = document.getElementById('aiChatSendBtn');
        if (!input || !input.value.trim()) return;

        const question = input.value.trim();
        input.value = '';

        // Aggiungi messaggio utente allo storico
        this._aiChatHistory.push({ role: 'user', content: question });

        // Aggiorna UI
        const messagesContainer = document.getElementById('aiChatMessages');
        if (messagesContainer) {
            messagesContainer.innerHTML = this._aiChatHistory.map(m => this._renderChatMessage(m)).join('');
            // Indicatore "sta scrivendo"
            messagesContainer.innerHTML += `
                <div id="aiTypingIndicator" style="display: flex; gap: 0.6rem; align-items: flex-start;">
                    <div style="width: 28px; height: 28px; border-radius: 50%; background: var(--blu-700); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="fas fa-robot" style="color: white; font-size: 0.7rem;"></i>
                    </div>
                    <div style="background: white; padding: 0.85rem; border-radius: 0 10px 10px 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.06);">
                        <div style="display: flex; gap: 0.35rem; align-items: center;">
                            <div style="width: 7px; height: 7px; border-radius: 50%; background: var(--blu-500); animation: aiBounce 1.4s infinite ease-in-out both;"></div>
                            <div style="width: 7px; height: 7px; border-radius: 50%; background: var(--blu-500); animation: aiBounce 1.4s infinite ease-in-out both; animation-delay: 0.16s;"></div>
                            <div style="width: 7px; height: 7px; border-radius: 50%; background: var(--blu-500); animation: aiBounce 1.4s infinite ease-in-out both; animation-delay: 0.32s;"></div>
                            <span style="margin-left: 0.4rem; font-size: 0.75rem; color: var(--grigio-500);">Sto analizzando...</span>
                        </div>
                    </div>
                </div>`;
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        // Disabilita input
        input.disabled = true;
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            // Carica TUTTI i dati CRM (leggeri) se non in cache
            if (!this._aiChatDataCache) {
                this._aiChatDataCache = { app: [], clienti: [], contratti: [], fatture: [], scadenze: [] };
                const loadPromises = [];

                // App
                loadPromises.push(
                    db.collection('app').get().then(snap => {
                        const raw = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        this._aiChatDataCache.app = this._buildLightAppSummary(raw);
                    }).catch(e => { console.warn('AI: errore caricamento app:', e); })
                );

                // Clienti
                loadPromises.push(
                    db.collection('clienti').get().then(snap => {
                        const raw = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                        this._aiChatDataCache.clienti = this._buildLightClientiSummary(raw);
                    }).catch(e => { console.warn('AI: errore caricamento clienti:', e); })
                );

                // Contratti
                loadPromises.push(
                    db.collection('contratti').get().then(snap => {
                        const raw = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                        this._aiChatDataCache.contratti = this._buildLightContrattiSummary(raw);
                    }).catch(e => { console.warn('AI: errore caricamento contratti:', e); })
                );

                // Fatture (ultime 500 per non esagerare)
                loadPromises.push(
                    db.collection('fatture').orderBy('dataEmissione', 'desc').limit(500).get().then(snap => {
                        const raw = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                        this._aiChatDataCache.fatture = this._buildLightFattureSummary(raw);
                    }).catch(e => { console.warn('AI: errore caricamento fatture:', e); })
                );

                // Scadenzario (solo non completate)
                loadPromises.push(
                    db.collection('scadenzario').where('completata', '==', false).get().then(snap => {
                        const raw = snap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                        this._aiChatDataCache.scadenze = this._buildLightScadenzeSummary(raw);
                    }).catch(e => { console.warn('AI: errore caricamento scadenze:', e); })
                );

                await Promise.all(loadPromises);
            }

            // Storico conversazione (ultimi 10)
            const conversationHistory = this._aiChatHistory.slice(0, -1).map(m => ({
                role: m.role,
                content: m.content
            }));

            // Prepara il payload — limita i record per evitare errore 413/502
            const MAX_ITEMS = { app: 300, clienti: 200, contratti: 200, fatture: 300, scadenze: 150 };
            const payload = {
                question: question,
                appCorrente: null,
                tutteLeApp: (this._aiChatDataCache.app || []).slice(0, MAX_ITEMS.app),
                contesto: {
                    clienti: (this._aiChatDataCache.clienti || []).slice(0, MAX_ITEMS.clienti),
                    contratti: (this._aiChatDataCache.contratti || []).slice(0, MAX_ITEMS.contratti),
                    fatture: (this._aiChatDataCache.fatture || []).slice(0, MAX_ITEMS.fatture),
                    scadenze: (this._aiChatDataCache.scadenze || []).slice(0, MAX_ITEMS.scadenze)
                },
                conversationHistory: conversationHistory
            };

            // Verifica dimensione payload e riduci se necessario
            let bodyStr = JSON.stringify(payload);
            const MAX_BODY_SIZE = 3 * 1024 * 1024; // 3MB safety limit
            if (bodyStr.length > MAX_BODY_SIZE) {
                console.warn('AI Chat: payload troppo grande (' + (bodyStr.length / 1024 / 1024).toFixed(1) + 'MB), riduco i dati...');
                // Riduci progressivamente
                payload.contesto.fatture = payload.contesto.fatture.slice(0, 100);
                payload.contesto.clienti = payload.contesto.clienti.slice(0, 100);
                payload.contesto.contratti = payload.contesto.contratti.slice(0, 100);
                payload.contesto.scadenze = payload.contesto.scadenze.slice(0, 80);
                payload.tutteLeApp = payload.tutteLeApp.slice(0, 150);
                bodyStr = JSON.stringify(payload);
            }

            console.log('AI Chat: payload size = ' + (bodyStr.length / 1024).toFixed(0) + 'KB');

            // Chiamata API con TUTTI i dati CRM
            const response = await fetch('/api/ai-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: bodyStr
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || data.detail || 'Errore dalla API');
            }

            this._aiChatHistory.push({
                role: 'assistant',
                content: data.answer,
                usage: data.usage
            });

        } catch (error) {
            console.error('Errore AI Chat:', error);
            this._aiChatHistory.push({
                role: 'assistant',
                content: 'Si e\' verificato un errore: ' + (error.message || 'Errore sconosciuto') + '\n\nRiprova tra qualche secondo.',
                usage: null
            });
        }

        // Re-render messaggi
        if (messagesContainer) {
            messagesContainer.innerHTML = this._aiChatHistory.map(m => this._renderChatMessage(m)).join('');
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        // Riabilita input
        input.disabled = false;
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        input.focus();
    }
};

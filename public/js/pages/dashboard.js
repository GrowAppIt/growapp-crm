// Dashboard Page con Widget Personalizzabili
const Dashboard = {
    async render() {
        UI.showLoading();

        try {
            // === VISTA AGENTE: dati filtrati solo per i propri clienti ===
            if (AuthService.canViewOnlyOwnData()) {
                return await this.renderDashboardAgente();
            }

            // === VISTA NORMALE (admin, CTO, ecc.) ===
            // Carica dati base
            const stats = await DataService.getStatistiche();

            // Carica dati in base ai permessi
            const scadenzeScadute = AuthService.hasPermission('manage_payments') || AuthService.hasPermission('view_all_data')
                ? await DataService.getScadenzeScadute()
                : [];
            const scadenzeImminenti = AuthService.hasPermission('manage_payments') || AuthService.hasPermission('view_all_data')
                ? await DataService.getScadenzeImminenti(30)
                : [];
            const contrattiInScadenza = AuthService.hasPermission('manage_contracts') || AuthService.hasPermission('view_contracts') || AuthService.hasPermission('view_all_data')
                ? await DataService.getContrattiInScadenza(60)
                : [];
            const fattureInScadenza = AuthService.hasPermission('manage_invoices') || AuthService.hasPermission('view_invoices') || AuthService.hasPermission('view_all_data')
                ? await DataService.getFattureInScadenza(30)
                : [];
            const clienti = AuthService.hasPermission('view_clients') || AuthService.hasPermission('manage_clients') || AuthService.hasPermission('view_all_data')
                ? await DataService.getClienti()
                : [];
            const fatture = AuthService.hasPermission('manage_invoices') || AuthService.hasPermission('view_invoices') || AuthService.hasPermission('view_all_data')
                ? await DataService.getFatture()
                : [];
            const fattureScadute = AuthService.hasPermission('manage_invoices') || AuthService.hasPermission('view_invoices') || AuthService.hasPermission('view_all_data')
                ? await DataService.getFattureScadute()
                : [];

            // NUOVI DATI per widget aggiuntivi
            const app = AuthService.hasPermission('view_apps') || AuthService.hasPermission('manage_apps') || AuthService.hasPermission('manage_app_content') || AuthService.hasPermission('view_all_data')
                ? await DataService.getApps()
                : [];
            const tasksResult = AuthService.hasPermission('view_dev_tasks') || AuthService.hasPermission('manage_dev_tasks') || AuthService.hasPermission('view_all_data')
                ? await TaskService.getAllTasks({ limit: 100 })
                : { tasks: [] };
            const tasks = tasksResult.tasks || [];
            const contrattiTutti = AuthService.hasPermission('manage_contracts') || AuthService.hasPermission('view_contracts') || AuthService.hasPermission('view_all_data')
                ? await DataService.getContratti()
                : [];

            // Get enabled widgets
            const enabledWidgets = SettingsService.getEnabledWidgets();

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

                <!-- Widgets Dinamici -->
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

    async renderEnabledWidgets(widgets, data) {
        let html = '';

        // Mappa permessi richiesti per ogni widget
        const widgetPermissions = {
            'statistiche': ['*'], // Sempre visibile, si adatta ai permessi
            'scadenzeImminenti': ['manage_payments', 'view_all_data'],
            'fattureNonPagate': ['manage_invoices', 'view_invoices', 'view_all_data'],
            'contrattiInScadenza': ['manage_contracts', 'view_contracts', 'view_all_data'],
            'andamentoMensile': ['view_all_data'], // Richiede molti dati
            'statoApp': ['view_apps', 'manage_apps', 'manage_app_content', 'view_all_data'],
            'topClienti': ['manage_invoices', 'view_invoices', 'view_clients', 'manage_clients', 'view_all_data'],
            'ultimiClienti': ['view_clients', 'manage_clients', 'view_all_data']
        };

        for (const widget of widgets) {
            // Verifica se l'utente ha i permessi per vedere questo widget
            const requiredPerms = widgetPermissions[widget.id] || [];
            const hasPermission = requiredPerms.some(perm => AuthService.hasPermission(perm));

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

    async renderScadenzeImminenti(scadenzeScadenzario, contrattiInScadenza, fattureInScadenza) {
        // Unisci tutte le scadenze in un formato comune
        const tutteScadenze = [];

        // Aggiungi scadenze dallo scadenzario (solo prossimi 30gg)
        const oggi = new Date();
        const limite30gg = new Date(oggi);
        limite30gg.setDate(oggi.getDate() + 30);

        scadenzeScadenzario.forEach(s => {
            const dataScadenza = new Date(s.dataScadenza);
            if (dataScadenza <= limite30gg) {
                tutteScadenze.push({
                    tipo: 'SCADENZARIO',
                    sottotipo: s.tipo,
                    dataScadenza: s.dataScadenza,
                    clienteRagioneSociale: s.clienteRagioneSociale,
                    descrizione: this.getTipoScadenzaLabel(s.tipo),
                    id: s.id,
                    link: 'scadenzario'
                });
            }
        });

        // Aggiungi contratti in scadenza (solo prossimi 30gg per questo widget)
        contrattiInScadenza.forEach(c => {
            const dataScadenza = new Date(c.dataScadenza);
            if (dataScadenza <= limite30gg) {
                tutteScadenze.push({
                    tipo: 'CONTRATTO',
                    dataScadenza: c.dataScadenza,
                    clienteRagioneSociale: c.clienteRagioneSociale,
                    descrizione: `Scadenza contratto ${c.numeroContratto || ''}`,
                    id: c.id,
                    link: 'dettaglio-contratto'
                });
            }
        });

        // Aggiungi fatture in scadenza
        fattureInScadenza.forEach(f => {
            tutteScadenze.push({
                tipo: 'FATTURA',
                dataScadenza: f.dataScadenza,
                clienteRagioneSociale: f.clienteRagioneSociale,
                descrizione: `Pagamento fattura ${f.numeroFattura || ''}`,
                importo: f.importoTotale,
                id: f.id,
                link: 'fatture'
            });
        });

        // Ordina per data
        tutteScadenze.sort((a, b) => new Date(a.dataScadenza) - new Date(b.dataScadenza));

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
                    <div class="card-subtitle">Prossimi 30 giorni: ${tutteScadenze.length} scadenze (${contrattiInScadenza.filter(c => new Date(c.dataScadenza) <= limite30gg).length} contratti, ${fattureInScadenza.length} fatture, ${scadenzeScadenzario.filter(s => new Date(s.dataScadenza) <= limite30gg).length} altre)</div>
                </div>
                <div class="list-group">
        `;

        const slice = tutteScadenze.slice(0, 10);
        for (const scadenza of slice) {
            const giorni = Math.ceil((new Date(scadenza.dataScadenza) - oggi) / (1000 * 60 * 60 * 24));
            const urgenza = giorni < 0 ? 'scaduto' : giorni <= 7 ? 'critico' : 'normale';
            const badgeClass = urgenza === 'scaduto' ? 'badge-danger' :
                             urgenza === 'critico' ? 'badge-warning' : 'badge-info';

            // Icona per tipo
            let tipoIcon = 'calendar';
            let tipoLabel = '';
            if (scadenza.tipo === 'CONTRATTO') {
                tipoIcon = 'file-contract';
                tipoLabel = '📄';
            } else if (scadenza.tipo === 'FATTURA') {
                tipoIcon = 'file-invoice-dollar';
                tipoLabel = '💶';
            } else if (scadenza.sottotipo === 'PAGAMENTO') {
                tipoIcon = 'euro-sign';
                tipoLabel = '💳';
            } else if (scadenza.sottotipo === 'FATTURAZIONE') {
                tipoIcon = 'file-invoice';
                tipoLabel = '📋';
            } else {
                tipoLabel = '📅';
            }

            const subtitle = scadenza.importo
                ? `${tipoLabel} ${scadenza.descrizione} • ${DataService.formatDate(scadenza.dataScadenza)} • ${DataService.formatCurrency(scadenza.importo)}`
                : `${tipoLabel} ${scadenza.descrizione} • ${DataService.formatDate(scadenza.dataScadenza)}`;

            html += UI.createListItem({
                title: scadenza.clienteRagioneSociale || 'N/A',
                subtitle: subtitle,
                badge: urgenza === 'scaduto' ? 'SCADUTO' : `${giorni}gg`,
                badgeClass,
                icon: tipoIcon,
                onclick: scadenza.tipo === 'CONTRATTO'
                    ? `UI.showPage('${scadenza.link}', '${scadenza.id}')`
                    : `UI.showPage('${scadenza.link}')`
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
                onclick: `UI.showPage('dettaglio-cliente', '${cliente.id}')`
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
                onclick: `UI.showPage('dettaglio-contratto', '${contratto.id}')`
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
                onclick: `UI.showPage('dettaglio-cliente', '${cliente.id}')`
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
        // Calcola rinnovi totali in sospeso (contratti che scadono ma ancora non rinnovati)
        const oggi = new Date();
        const rinnoviSospesi = contrattiTutti.filter(c => {
            if (!c.dataScadenza) return false;
            const dataScadenza = new Date(c.dataScadenza);
            return dataScadenza < oggi && c.stato !== 'CESSATO' && c.stato !== 'ATTIVO';
        }).length;

        // Calcola fatturato scaduto da recuperare
        const fatturatoScaduto = fattureScadute.reduce((sum, f) => sum + (f.importoTotale || 0), 0);

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
                onclick: 'UI.showPage("scadenzario")'
            }));
        }

        // Rinnovi Sospesi - visibile se può gestire contratti
        if (AuthService.hasPermission('manage_contracts') || AuthService.hasPermission('view_contracts') || AuthService.hasPermission('view_all_data')) {
            kpiCards.push(UI.createKPICard({
                icon: 'sync-alt',
                iconClass: 'warning',
                label: 'Rinnovi Sospesi',
                value: rinnoviSospesi,
                onclick: 'UI.showPage("contratti")'
            }));
        }

        // Fatturato Scaduto - visibile se può gestire fatture
        if (AuthService.hasPermission('manage_invoices') || AuthService.hasPermission('view_invoices') || AuthService.hasPermission('view_all_data')) {
            kpiCards.push(UI.createKPICard({
                icon: 'euro-sign',
                iconClass: 'danger',
                label: 'Fatturato Scaduto',
                value: DataService.formatCurrency(fatturatoScaduto),
                onclick: 'UI.showPage("scadenzario")'
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
                        <button class="btn btn-primary btn-sm" onclick="UI.showPage('gestione-app')">
                            <i class="fas fa-mobile-alt"></i> Vedi tutte le app
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    async renderScadenzeImminenteCompatta(scadenzeScadenzario, contrattiInScadenza, fattureInScadenza) {
        // Unisci tutte le scadenze in un formato comune
        const tutteScadenze = [];
        const oggi = new Date();
        const limite30gg = new Date(oggi);
        limite30gg.setDate(oggi.getDate() + 30);

        // Aggiungi scadenze dallo scadenzario (solo prossimi 30gg)
        scadenzeScadenzario.forEach(s => {
            const dataScadenza = new Date(s.dataScadenza);
            if (dataScadenza <= limite30gg) {
                tutteScadenze.push({
                    tipo: 'SCADENZARIO',
                    sottotipo: s.tipo,
                    dataScadenza: s.dataScadenza,
                    clienteRagioneSociale: s.clienteRagioneSociale,
                    descrizione: this.getTipoScadenzaLabel(s.tipo),
                    id: s.id,
                    link: 'scadenzario'
                });
            }
        });

        // Aggiungi contratti in scadenza (solo prossimi 30gg)
        contrattiInScadenza.forEach(c => {
            const dataScadenza = new Date(c.dataScadenza);
            if (dataScadenza <= limite30gg) {
                tutteScadenze.push({
                    tipo: 'CONTRATTO',
                    dataScadenza: c.dataScadenza,
                    clienteRagioneSociale: c.clienteRagioneSociale,
                    descrizione: `Rinnovo contratto`,
                    id: c.id,
                    link: 'dettaglio-contratto'
                });
            }
        });

        // Aggiungi fatture in scadenza
        fattureInScadenza.forEach(f => {
            tutteScadenze.push({
                tipo: 'FATTURA',
                dataScadenza: f.dataScadenza,
                clienteRagioneSociale: f.clienteRagioneSociale,
                descrizione: `Pagamento ${f.numeroFattura || ''}`,
                importo: f.importoTotale,
                id: f.id,
                link: 'fatture'
            });
        });

        // Ordina per data
        tutteScadenze.sort((a, b) => new Date(a.dataScadenza) - new Date(b.dataScadenza));

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

            // Icona per tipo
            let tipoIcon = 'calendar';
            if (scadenza.tipo === 'CONTRATTO') {
                tipoIcon = 'file-contract';
            } else if (scadenza.tipo === 'FATTURA') {
                tipoIcon = 'file-invoice-dollar';
            } else if (scadenza.sottotipo === 'PAGAMENTO') {
                tipoIcon = 'euro-sign';
            }

            const subtitle = scadenza.importo
                ? `${scadenza.descrizione} • ${DataService.formatDate(scadenza.dataScadenza)} • ${DataService.formatCurrency(scadenza.importo)}`
                : `${scadenza.descrizione} • ${DataService.formatDate(scadenza.dataScadenza)}`;

            html += UI.createListItem({
                title: scadenza.clienteRagioneSociale || 'N/A',
                subtitle: subtitle,
                badge: urgenza === 'scaduto' ? 'SCADUTO' : `${giorni}gg`,
                badgeClass,
                icon: tipoIcon,
                onclick: scadenza.tipo === 'CONTRATTO'
                    ? `UI.showPage('${scadenza.link}', '${scadenza.id}')`
                    : `UI.showPage('${scadenza.link}')`
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

        // Scadenze critiche
        const scadenzeScadute = scadenze.filter(s => s.dataScadenza && new Date(s.dataScadenza) < oggi);
        const scadenzeImminenti = scadenze.filter(s => {
            if (!s.dataScadenza) return false;
            const data = new Date(s.dataScadenza);
            return data >= oggi && data <= tra30giorni;
        });

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
                    ${this.renderWidgetProssimeAttivita(scadenze)}
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
                if (!s.dataScadenza || s.completata) return false;
                const data = new Date(s.dataScadenza);
                return data >= oggi && data <= tra7gg;
            })
            .sort((a, b) => new Date(a.dataScadenza) - new Date(b.dataScadenza))
            .slice(0, 5);

        if (prossime.length === 0) {
            return `<div style="text-align:center;padding:1rem;color:var(--grigio-400);"><i class="fas fa-check-circle" style="font-size:1.5rem;display:block;margin-bottom:0.5rem;"></i>Nessuna attività nei prossimi 7 giorni</div>`;
        }

        const tipoIcons = {
            'FATTURAZIONE': 'fas fa-file-invoice',
            'RINNOVO_CONTRATTO': 'fas fa-sync-alt',
            'PAGAMENTO': 'fas fa-euro-sign'
        };

        const tipoColors = {
            'FATTURAZIONE': '#E67E22',
            'RINNOVO_CONTRATTO': '#3CA434',
            'PAGAMENTO': '#D32F2F'
        };

        let html = prossime.map(s => {
            const icon = tipoIcons[s.tipo] || 'fas fa-bell';
            const color = tipoColors[s.tipo] || 'var(--blu-500)';
            const dataStr = DataService.formatDate(s.dataScadenza);
            const giorniMancanti = Math.ceil((new Date(s.dataScadenza) - oggi) / (1000 * 60 * 60 * 24));

            return `
                <div style="display:flex;gap:0.75rem;align-items:center;padding:0.6rem;border-radius:8px;background:var(--grigio-100);margin-bottom:0.5rem;cursor:pointer;"
                     onclick="UI.showPage('dettaglio-scadenza', '${s.id}')">
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

        const totaleScadenze7gg = scadenze.filter(s => s.dataScadenza && !s.completata && new Date(s.dataScadenza) >= oggi && new Date(s.dataScadenza) <= tra7gg).length;
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

// Dashboard Page con Widget Personalizzabili
const Dashboard = {
    async render() {
        UI.showLoading();

        try {
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
                        <button class="btn btn-secondary" onclick="UI.showPage('impostazioni')">
                            <i class="fas fa-cog"></i> Personalizza
                        </button>
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
            fatturatoPerCliente[f.clienteId].totale += f.importoTotale || 0;
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
    }
};

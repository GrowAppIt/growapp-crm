// Dettaglio App Page
const DettaglioApp = {
    appId: null,
    app: null,
    currentTab: 'info',
    tasks: [],
    documenti: [],

    async render(appId) {
        this.appId = appId;
        this.currentTab = 'info';
        UI.showLoading();

        try {
            const [app, clienti, tasksResult, documenti] = await Promise.all([
                DataService.getApp(appId),
                DataService.getClienti(),
                TaskService.getTasksByApp(appId),
                DocumentService.getDocumenti('app', appId)
            ]);

            if (!app) {
                UI.hideLoading();
                UI.showError('App non trovata');
                return;
            }

            this.app = app;
            this.tasks = tasksResult.success ? tasksResult.tasks : [];
            this.documenti = documenti;

            // Auto-fill popolazione da ISTAT se il comune è compilato ma la popolazione no
            if (app.comune && (!app.popolazione || app.popolazione === 0)) {
                try {
                    const comuneISTAT = await ComuniService.trovaPeNome(app.comune);
                    if (comuneISTAT && comuneISTAT.numResidenti > 0) {
                        app.popolazione = comuneISTAT.numResidenti;
                        DataService.updateApp(appId, { popolazione: comuneISTAT.numResidenti }).catch(err => {
                            console.warn('Errore salvataggio popolazione:', err);
                        });
                    }
                } catch (e) {
                    console.warn('Errore lookup ISTAT:', e);
                }
            }

            const clientePagante = app.clientePaganteId
                ? clienti.find(c => c.id === app.clientePaganteId)
                : null;

            const mainContent = document.getElementById('mainContent');
            mainContent.innerHTML = `
                <div class="page-header mb-3">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem;">
                        <button class="btn btn-secondary btn-sm" onclick="UI.showPage('app')">
                            <i class="fas fa-arrow-left"></i> Torna alle app
                        </button>
                        ${!AuthService.canViewOnlyOwnData() ? `
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn btn-primary btn-sm" onclick="DettaglioApp.editApp()">
                                <i class="fas fa-edit"></i> Modifica
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="DettaglioApp.deleteApp()">
                                <i class="fas fa-trash"></i> Elimina
                            </button>
                        </div>
                        ` : ''}
                    </div>
                    <!-- Header con icona app -->
                    <div style="display: flex; align-items: center; gap: 1.25rem; margin-bottom: 0.5rem;">
                        ${app.iconaUrl ? `
                            <img src="${app.iconaUrl}" alt="${app.nome}" style="width: 72px; height: 72px; border-radius: 16px; object-fit: cover; box-shadow: 0 2px 10px rgba(0,0,0,0.18); border: 1px solid rgba(0,0,0,0.08); flex-shrink: 0;" />
                        ` : `
                            <div style="width: 72px; height: 72px; border-radius: 16px; background: var(--blu-100); display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                                <i class="fas fa-mobile-alt" style="font-size: 2rem; color: var(--blu-700);"></i>
                            </div>
                        `}
                        <div style="flex: 1;">
                            <h1 style="font-size: 2rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.25rem;">
                                ${app.nome}
                            </h1>
                            <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                                <span class="badge ${DataService.getStatoBadgeClass(app.statoApp)}">
                                    ${app.statoApp?.replace('_', ' ') || 'N/A'}
                                </span>
                                ${app.provincia ? `<span style="color: var(--grigio-500);"><i class="fas fa-map-marker-alt"></i> ${app.provincia}</span>` : ''}
                                ${clientePagante ? `<span style="color: var(--grigio-500);"><i class="fas fa-building"></i> ${clientePagante.ragioneSociale}</span>` : ''}
                                ${(() => {
                                    // Agente sempre dal cliente pagante (fonte di verità), fallback app solo se cliente non presente
                                    const agente = clientePagante ? clientePagante.agente : app.agente;
                                    return agente ? `<span style="color: var(--blu-500);"><i class="fas fa-user-tie"></i> ${agente}</span>` : '';
                                })()}
                            </div>
                        </div>
                    </div>

                    <!-- Link App e Cruscotto -->
                    ${app.urlSito || app.urlCruscotto ? `
                    <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.75rem;">
                        ${app.urlSito ? `
                            <a href="${app.urlSito}" target="_blank" rel="noopener" style="display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background: var(--blu-700); color: white; border-radius: 8px; text-decoration: none; font-size: 0.875rem; font-weight: 600; transition: background 0.2s;" onmouseover="this.style.background='var(--blu-500)'" onmouseout="this.style.background='var(--blu-700)'">
                                <i class="fas fa-external-link-alt"></i> Vai all'App
                            </a>
                        ` : ''}
                        ${app.urlCruscotto ? `
                            <a href="${app.urlCruscotto}" target="_blank" rel="noopener" style="display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background: var(--verde-700); color: white; border-radius: 8px; text-decoration: none; font-size: 0.875rem; font-weight: 600; transition: background 0.2s;" onmouseover="this.style.background='var(--verde-500)'" onmouseout="this.style.background='var(--verde-700)'">
                                <i class="fas fa-cogs"></i> Gestione App
                            </a>
                        ` : ''}
                    </div>
                    ` : ''}
                </div>

                <!-- Tabs Navigation -->
                ${this.renderTabsNav()}

                <!-- Tab Content -->
                <div id="tabContent" style="margin-top: 1.5rem;">
                    ${this.renderTabContent(app, clientePagante)}
                </div>

                <!-- Footer Audit -->
                ${app.ultimaModificaDa ? `
                <div style="margin-top: 1.5rem; padding: 0.75rem 1rem; background: var(--grigio-100); border-radius: 8px; display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: var(--grigio-500);">
                    <i class="fas fa-user-edit"></i>
                    Ultima modifica: <strong style="color: var(--grigio-700);">${app.ultimaModificaNome || app.ultimaModificaDa}</strong>
                    &mdash; ${new Date(app.ultimaModificaIl).toLocaleString('it-IT')}
                </div>
                ` : ''}
            `;

            UI.hideLoading();
        } catch (error) {
            console.error('Errore caricamento dettaglio app:', error);
            UI.hideLoading();
            UI.showError('Errore nel caricamento dell\'app');
        }
    },

    renderTabsNav() {
        const todoCount = this.tasks.filter(t => t.stato === TaskService.STATI.TODO).length;
        const inProgressCount = this.tasks.filter(t => t.stato === TaskService.STATI.IN_PROGRESS).length;
        const totalActive = todoCount + inProgressCount;

        return `
            <div style="border-bottom: 2px solid var(--grigio-300); display: flex; gap: 0;">
                <button
                    class="tab-button ${this.currentTab === 'info' ? 'active' : ''}"
                    onclick="DettaglioApp.switchTab('info')"
                    style="padding: 1rem 1.5rem; border: none; background: ${this.currentTab === 'info' ? 'var(--blu-100)' : 'transparent'};
                           color: ${this.currentTab === 'info' ? 'var(--blu-700)' : 'var(--grigio-600)'};
                           font-weight: ${this.currentTab === 'info' ? '700' : '600'}; cursor: pointer;
                           border-bottom: 3px solid ${this.currentTab === 'info' ? 'var(--blu-700)' : 'transparent'};
                           transition: all 0.2s;">
                    <i class="fas fa-info-circle"></i> Informazioni
                </button>
                <button
                    class="tab-button ${this.currentTab === 'task' ? 'active' : ''}"
                    onclick="DettaglioApp.switchTab('task')"
                    style="padding: 1rem 1.5rem; border: none; background: ${this.currentTab === 'task' ? 'var(--blu-100)' : 'transparent'};
                           color: ${this.currentTab === 'task' ? 'var(--blu-700)' : 'var(--grigio-600)'};
                           font-weight: ${this.currentTab === 'task' ? '700' : '600'}; cursor: pointer;
                           border-bottom: 3px solid ${this.currentTab === 'task' ? 'var(--blu-700)' : 'transparent'};
                           transition: all 0.2s; position: relative;">
                    <i class="fas fa-tasks"></i> Task
                    ${totalActive > 0 ? `<span style="background: var(--verde-700); color: white; border-radius: 12px; padding: 0.125rem 0.5rem; font-size: 0.75rem; margin-left: 0.5rem; font-weight: 700;">${totalActive}</span>` : ''}
                </button>
                <button
                    class="tab-button ${this.currentTab === 'documenti' ? 'active' : ''}"
                    onclick="DettaglioApp.switchTab('documenti')"
                    style="padding: 1rem 1.5rem; border: none; background: ${this.currentTab === 'documenti' ? 'var(--blu-100)' : 'transparent'};
                           color: ${this.currentTab === 'documenti' ? 'var(--blu-700)' : 'var(--grigio-600)'};
                           font-weight: ${this.currentTab === 'documenti' ? '700' : '600'}; cursor: pointer;
                           border-bottom: 3px solid ${this.currentTab === 'documenti' ? 'var(--blu-700)' : 'transparent'};
                           transition: all 0.2s;">
                    <i class="fas fa-folder-open"></i> Documenti (${this.documenti.length})
                </button>
                ${this.app && this.app.goodbarberWebzineId ? `
                <button
                    class="tab-button ${this.currentTab === 'statistiche' ? 'active' : ''}"
                    onclick="DettaglioApp.switchTab('statistiche')"
                    style="padding: 1rem 1.5rem; border: none; background: ${this.currentTab === 'statistiche' ? 'var(--blu-100)' : 'transparent'};
                           color: ${this.currentTab === 'statistiche' ? 'var(--blu-700)' : 'var(--grigio-600)'};
                           font-weight: ${this.currentTab === 'statistiche' ? '700' : '600'}; cursor: pointer;
                           border-bottom: 3px solid ${this.currentTab === 'statistiche' ? 'var(--blu-700)' : 'transparent'};
                           transition: all 0.2s;">
                    <i class="fas fa-chart-bar"></i> Statistiche GB
                </button>
                ` : ''}
            </div>
        `;
    },

    renderTabContent(app, clientePagante) {
        if (this.currentTab === 'info') {
            return `
                <div style="display: grid; gap: 1.5rem;">
                    ${AuthService.isSuperAdmin() ? this.renderConfigurazioneApp(app) : ''}
                    ${this.renderDatiComune(app)}
                    ${this.renderGestioneCommerciale(app, clientePagante)}
                    ${this.renderPubblicazioneStore(app)}
                    ${this.renderFunzionalita(app)}
                    <div id="metricheContainer">${this.renderMetriche(app)}</div>
                    ${this.renderControlloQualita(app)}
                    ${this.renderNote(app)}
                </div>
            `;
        } else if (this.currentTab === 'task') {
            return this.renderTaskTab();
        } else if (this.currentTab === 'documenti') {
            return this.renderDocumenti();
        } else if (this.currentTab === 'statistiche') {
            return this.renderStatisticheGB(app);
        }
    },

    switchTab(tabName) {
        this.currentTab = tabName;
        const tabContent = document.getElementById('tabContent');
        const clientePagante = this.app.clientePaganteId
            ? { ragioneSociale: 'Cliente' } // Placeholder, già caricato
            : null;

        tabContent.innerHTML = this.renderTabContent(this.app, clientePagante);

        // Aggiorna stile tabs
        document.querySelectorAll('.tab-button').forEach(btn => {
            const isActive = btn.textContent.toLowerCase().includes(tabName);
            btn.style.background = isActive ? 'var(--blu-100)' : 'transparent';
            btn.style.color = isActive ? 'var(--blu-700)' : 'var(--grigio-600)';
            btn.style.fontWeight = isActive ? '700' : '600';
            btn.style.borderBottom = isActive ? '3px solid var(--blu-700)' : '3px solid transparent';
        });
    },

    renderTaskTab() {
        const todoTasks = this.tasks.filter(t => t.stato === TaskService.STATI.TODO);
        const inProgressTasks = this.tasks.filter(t => t.stato === TaskService.STATI.IN_PROGRESS);
        const doneTasks = this.tasks.filter(t => t.stato === TaskService.STATI.DONE);

        return `
            <div>
                <!-- Header con pulsante Nuovo Task -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                    <div>
                        <h2 style="font-size: 1.5rem; font-weight: 700; color: var(--grigio-900); margin-bottom: 0.25rem;">
                            Task di Sviluppo
                        </h2>
                        <p style="color: var(--grigio-500); font-size: 0.875rem;">
                            Gestisci le attività di sviluppo per questa app
                        </p>
                    </div>
                    ${AuthService.hasPermission('manage_dev_tasks') ? `
                        <button class="btn btn-primary" onclick="DettaglioApp.showNewTaskForm()">
                            <i class="fas fa-plus"></i> Nuovo Task
                        </button>
                    ` : ''}
                </div>

                <!-- Statistiche rapide -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 1rem; margin-bottom: 2rem;">
                    ${this.renderTaskStatCard('TODO', todoTasks.length, 'circle', 'blu-700')}
                    ${this.renderTaskStatCard('IN PROGRESS', inProgressTasks.length, 'spinner', 'giallo-avviso')}
                    ${this.renderTaskStatCard('DONE', doneTasks.length, 'check-circle', 'verde-700')}
                </div>

                <!-- Colonne Task -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 1.5rem;">
                    ${this.renderTaskColumn('TODO', todoTasks, 'blu-700')}
                    ${this.renderTaskColumn('IN_PROGRESS', inProgressTasks, 'giallo-avviso')}
                    ${this.renderTaskColumn('DONE', doneTasks, 'verde-700')}
                </div>
            </div>
        `;
    },

    renderTaskStatCard(label, count, icon, color) {
        return `
            <div style="background: var(--grigio-100); border-left: 4px solid var(--${color}); padding: 1rem; border-radius: 8px;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <i class="fas fa-${icon}" style="font-size: 2rem; color: var(--${color});"></i>
                    <div>
                        <div style="font-size: 2rem; font-weight: 700; color: var(--grigio-900);">${count}</div>
                        <div style="font-size: 0.875rem; color: var(--grigio-600); font-weight: 600;">${label}</div>
                    </div>
                </div>
            </div>
        `;
    },

    renderTaskColumn(stato, tasks, color) {
        const stateConfig = TaskService.STATO_COLORS[stato];
        const stateLabel = stato.replace('_', ' ');

        return `
            <div>
                <div style="background: var(--${color}); color: white; padding: 0.75rem 1rem; border-radius: 8px 8px 0 0; font-weight: 700; display: flex; align-items: center; gap: 0.5rem;">
                    <i class="${stateConfig.icon}"></i>
                    ${stateLabel}
                    <span style="background: rgba(255,255,255,0.3); padding: 0.125rem 0.5rem; border-radius: 12px; font-size: 0.875rem; margin-left: auto;">
                        ${tasks.length}
                    </span>
                </div>
                <div style="background: var(--grigio-100); min-height: 400px; padding: 1rem; border-radius: 0 0 8px 8px;">
                    ${tasks.length === 0 ? `
                        <div style="text-align: center; padding: 2rem; color: var(--grigio-500);">
                            <i class="fas fa-inbox" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i>
                            <p>Nessun task ${stateLabel.toLowerCase()}</p>
                        </div>
                    ` : tasks.map(task => this.renderTaskCard(task, stato)).join('')}
                </div>
            </div>
        `;
    },

    renderTaskCard(task, currentStato) {
        const priorityConfig = TaskService.PRIORITA_COLORS[task.priorita];
        const isOverdue = TaskService.isScaduto(task);
        const isDueSoon = TaskService.isInScadenza(task);

        return `
            <div class="task-card" style="background: white; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-left: 4px solid ${priorityConfig.bg};">
                <!-- Titolo e Priorità -->
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.75rem;">
                    <h4 style="font-size: 1rem; font-weight: 700; color: var(--grigio-900); flex: 1; margin-right: 0.5rem;">
                        ${task.titolo}
                    </h4>
                    <span style="background: ${priorityConfig.bg}; color: ${priorityConfig.text}; padding: 0.125rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; white-space: nowrap;">
                        ${task.priorita}
                    </span>
                </div>

                <!-- Descrizione -->
                ${task.descrizione ? `
                    <p style="color: var(--grigio-600); font-size: 0.875rem; margin-bottom: 0.75rem; line-height: 1.4;">
                        ${task.descrizione.substring(0, 100)}${task.descrizione.length > 100 ? '...' : ''}
                    </p>
                ` : ''}

                <!-- Info -->
                <div style="display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.875rem; color: var(--grigio-600); margin-bottom: 0.75rem;">
                    ${(() => {
                        // Gestione assegnazione multipla (retrocompatibile)
                        const assegnati = task.assegnatiANomi || (task.assegnatoANome ? [task.assegnatoANome] : []);
                        if (assegnati.length > 0) {
                            return `
                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                    <i class="fas fa-${assegnati.length > 1 ? 'users' : 'user'}" style="width: 14px;"></i>
                                    <span>${assegnati.join(', ')}</span>
                                </div>
                            `;
                        } else {
                            return `
                                <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--giallo-avviso);">
                                    <i class="fas fa-user-slash" style="width: 14px;"></i>
                                    <span>Non assegnato (pool)</span>
                                </div>
                            `;
                        }
                    })()}
                    ${task.scadenza ? `
                        <div style="display: flex; align-items: center; gap: 0.5rem; ${isOverdue ? 'color: var(--rosso-errore);' : isDueSoon ? 'color: var(--giallo-avviso);' : ''}">
                            <i class="fas fa-calendar" style="width: 14px;"></i>
                            <span>${TaskService.formatDate(task.scadenza)}</span>
                            ${isOverdue ? '<i class="fas fa-exclamation-triangle"></i>' : ''}
                        </div>
                    ` : ''}
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <i class="fas fa-clock" style="width: 14px;"></i>
                        <span>Creato il ${TaskService.formatDate(task.creatoIl)}</span>
                    </div>
                </div>

                <!-- Azioni -->
                ${this.renderTaskActions(task, currentStato)}
            </div>
        `;
    },

    renderTaskActions(task, currentStato) {
        const canManage = AuthService.hasPermission('manage_dev_tasks');
        const canView = AuthService.hasPermission('view_dev_tasks');

        if (!canManage && !canView) return '';

        let actions = [];

        // Cambio stato
        if (canManage) {
            if (currentStato === TaskService.STATI.TODO) {
                actions.push(`
                    <button class="btn btn-sm" style="background: #FFCC00; color: #333; border: none; padding: 0.25rem 0.75rem; font-size: 0.75rem;"
                            onclick="DettaglioApp.changeTaskState('${task.id}', '${TaskService.STATI.IN_PROGRESS}')">
                        <i class="fas fa-play"></i> Inizia
                    </button>
                `);
            } else if (currentStato === TaskService.STATI.IN_PROGRESS) {
                actions.push(`
                    <button class="btn btn-sm" style="background: var(--verde-700); color: white; border: none; padding: 0.25rem 0.75rem; font-size: 0.75rem;"
                            onclick="DettaglioApp.changeTaskState('${task.id}', '${TaskService.STATI.DONE}')">
                        <i class="fas fa-check"></i> Completa
                    </button>
                `);
                actions.push(`
                    <button class="btn btn-sm" style="background: var(--grigio-500); color: white; border: none; padding: 0.25rem 0.75rem; font-size: 0.75rem;"
                            onclick="DettaglioApp.changeTaskState('${task.id}', '${TaskService.STATI.TODO}')">
                        <i class="fas fa-pause"></i> Pausa
                    </button>
                `);
            }
        }

        // Azione view dettagli (placeholder per futura implementazione)
        actions.push(`
            <button class="btn btn-sm" style="background: var(--blu-500); color: white; border: none; padding: 0.25rem 0.75rem; font-size: 0.75rem;"
                    onclick="DettaglioApp.viewTaskDetails('${task.id}')">
                <i class="fas fa-eye"></i>
            </button>
        `);

        return `
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                ${actions.join('')}
            </div>
        `;
    },

    async changeTaskState(taskId, newState) {
        UI.showLoading();

        try {
            const result = await TaskService.cambiaStato(taskId, newState);

            if (result.success) {
                UI.showSuccess('Stato task aggiornato');
                // Ricarica la pagina per aggiornare i dati
                await this.render(this.appId);
            } else {
                UI.showError('Errore aggiornamento stato: ' + result.error);
            }
        } catch (error) {
            console.error('Errore cambio stato task:', error);
            UI.showError('Errore aggiornamento stato');
        } finally {
            UI.hideLoading();
        }
    },

    showNewTaskForm() {
        // Salva l'appId corrente per pre-compilare il form
        sessionStorage.setItem('newTaskAppId', this.appId);
        sessionStorage.setItem('newTaskAppNome', this.app.nome);

        // Naviga alla pagina Task globale
        UI.showPage('task');
    },

    viewTaskDetails(taskId) {
        // Naviga alla pagina Task globale dove l'utente potrà vedere e gestire il task
        UI.showPage('task');
    },

    renderDatiComune(app) {
        return `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-map-marker-alt"></i> Dati Comune
                    </h2>
                </div>
                <div class="card-body">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(250px, 100%), 1fr)); gap: 1.5rem;">
                        ${this.renderInfoItem('Comune', app.comune, 'map-marker-alt')}
                        ${this.renderInfoItem('Provincia', app.provincia, 'map')}
                        ${this.renderInfoItem('Regione', app.regione, 'globe-europe')}
                        ${this.renderInfoItem('CAP', app.cap, 'envelope')}
                        ${this.renderInfoItem('Indirizzo', app.indirizzo, 'location-arrow')}
                        ${this.renderInfoItem('Telefono', app.telefono, 'phone')}
                        ${this.renderInfoItem('Email', app.email, 'envelope')}
                        ${this.renderInfoItem('PEC', app.pec, 'envelope-open')}
                    </div>
                </div>
            </div>
        `;
    },

    renderGestioneCommerciale(app, clientePagante) {
        return `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-handshake"></i> Gestione Commerciale
                    </h2>
                </div>
                <div class="card-body">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(250px, 100%), 1fr)); gap: 1.5rem;">
                        ${this.renderInfoItem('Cliente Pagante', clientePagante?.ragioneSociale || 'Non collegata', 'building', !clientePagante)}
                        ${this.renderInfoItem('Tipo Pagamento', app.tipoPagamento, 'credit-card')}
                        ${this.renderInfoItem('Stato App', app.statoApp?.replace('_', ' '), 'toggle-on')}
                        ${this.renderInfoItem('Referente', app.referenteComune, 'user-tie')}
                    </div>
                </div>
            </div>
        `;
    },

    renderPubblicazioneStore(app) {
        // Verifica se ci sono credenziali Apple compilate
        const hasCredenzialiApple = app.appleUsername || app.applePassword || app.appleEmailAggiuntiva || app.appleTelefonoOtp;

        return `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-store"></i> Pubblicazione Store
                    </h2>
                </div>
                <div class="card-body">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(250px, 100%), 1fr)); gap: 1.5rem;">
                        ${this.renderInfoItem('Pubblicazione Apple', app.dataPubblicazioneApple ? DataService.formatDate(app.dataPubblicazioneApple) : 'Non pubblicata', 'apple')}
                        ${this.renderInfoItem('Pubblicazione Android', app.dataPubblicazioneAndroid ? DataService.formatDate(app.dataPubblicazioneAndroid) : 'Non pubblicata', 'android')}
                    </div>

                    ${hasCredenzialiApple ? `
                    <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 2px solid var(--grigio-300);">
                        <h4 style="font-size: 0.875rem; font-weight: 700; color: var(--grigio-700); margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 0.05em;">
                            <i class="fab fa-apple"></i> Credenziali Apple Developer
                        </h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(250px, 100%), 1fr)); gap: 1.5rem;">
                            ${this.renderInfoItem('Username', app.appleUsername, 'user')}
                            ${this.renderInfoItem('Password', app.applePassword, 'lock')}
                            ${this.renderInfoItem('Email Aggiuntiva', app.appleEmailAggiuntiva, 'envelope')}
                            ${this.renderInfoItem('Telefono OTP', app.appleTelefonoOtp, 'mobile-alt')}
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    renderFunzionalita(app) {
        // Calcola scadenze con alert: scadute (passate) + imminenti (prossimi N giorni da settings)
        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);
        const _sysDetApp = SettingsService.getSystemSettingsSync();
        const _sogliaDetApp = _sysDetApp.sogliaImminente || 3;
        const traXgiorni = new Date(oggi);
        traXgiorni.setDate(oggi.getDate() + _sogliaDetApp);

        const scadenze = [];

        if (app.ultimaDataRaccoltaDifferenziata) {
            const data = new Date(app.ultimaDataRaccoltaDifferenziata);
            data.setHours(0, 0, 0, 0);
            const isScaduta = data < oggi;
            const isImminente = data >= oggi && data <= traXgiorni;
            if (isScaduta || isImminente) {
                scadenze.push({ tipo: '📅 Raccolta Differenziata', data: app.ultimaDataRaccoltaDifferenziata, isScaduta });
            }
        }

        if (app.ultimaDataFarmacieTurno) {
            const data = new Date(app.ultimaDataFarmacieTurno);
            data.setHours(0, 0, 0, 0);
            const isScaduta = data < oggi;
            const isImminente = data >= oggi && data <= traXgiorni;
            if (isScaduta || isImminente) {
                scadenze.push({ tipo: '💊 Farmacie di Turno', data: app.ultimaDataFarmacieTurno, isScaduta });
            }
        }

        if (app.ultimaDataNotificheFarmacie) {
            const data = new Date(app.ultimaDataNotificheFarmacie);
            data.setHours(0, 0, 0, 0);
            const isScaduta = data < oggi;
            const isImminente = data >= oggi && data <= traXgiorni;
            if (isScaduta || isImminente) {
                scadenze.push({ tipo: '🔔 Notifiche Farmacie', data: app.ultimaDataNotificheFarmacie, isScaduta });
            }
        }

        if (app.scadenzaCertificatoApple) {
            const data = new Date(app.scadenzaCertificatoApple);
            data.setHours(0, 0, 0, 0);
            const isScaduta = data < oggi;
            const isImminente = data >= oggi && data <= traXgiorni;
            if (isScaduta || isImminente) {
                scadenze.push({ tipo: '🍎 Certificato Apple', data: app.scadenzaCertificatoApple, isScaduta });
            }
        }

        if (app.altraScadenzaData) {
            const data = new Date(app.altraScadenzaData);
            data.setHours(0, 0, 0, 0);
            const isScaduta = data < oggi;
            const isImminente = data >= oggi && data <= traXgiorni;
            if (isScaduta || isImminente) {
                scadenze.push({ tipo: '📌 ' + (app.altraScadenzaNote || 'Altra Scadenza'), data: app.altraScadenzaData, isScaduta });
            }
        }

        // Separa scadute da imminenti per stile diverso
        const scadute = scadenze.filter(s => s.isScaduta);
        const imminenti = scadenze.filter(s => !s.isScaduta);

        // Gestisci booleani che possono essere sia true/false che stringhe "true"/"false"
        const hasTelegram = app.hasGruppoTelegram === true || app.hasGruppoTelegram === 'true';
        const hasFlash = app.hasAvvisiFlash === true || app.hasAvvisiFlash === 'true';

        const haDateScadenze = app.ultimaDataRaccoltaDifferenziata || app.ultimaDataFarmacieTurno || app.ultimaDataNotificheFarmacie || app.scadenzaCertificatoApple || app.altraScadenzaData;

        return `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-cogs"></i> Funzionalità e Scadenze
                        ${scadute.length > 0 ? `<span class="badge" style="background: var(--rosso-errore); color: white; font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: 12px; margin-left: 0.5rem;"><i class="fas fa-exclamation-circle"></i> ${scadute.length} Scadute</span>` : ''}
                        ${imminenti.length > 0 ? `<span class="badge" style="background: var(--giallo-avviso); color: #856404; font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: 12px; margin-left: 0.5rem;"><i class="fas fa-clock"></i> ${imminenti.length} Imminenti</span>` : ''}
                    </h2>
                </div>
                <div class="card-body">
                    <!-- Funzionalità Attive -->
                    <div style="margin-bottom: ${haDateScadenze ? '1.5rem' : '0'}; padding-bottom: ${haDateScadenze ? '1.5rem' : '0'}; border-bottom: ${haDateScadenze ? '2px solid var(--grigio-300)' : 'none'};">
                        <h4 style="font-size: 0.875rem; font-weight: 700; color: var(--grigio-700); margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 0.05em;">Funzionalità Attive</h4>
                        <div style="display: flex; gap: 2rem; flex-wrap: wrap;">
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <i class="fas fa-${hasTelegram ? 'check-circle' : 'times-circle'}"
                                   style="color: var(--${hasTelegram ? 'verde-700' : 'grigio-400'}); font-size: 1.5rem;"></i>
                                <span style="font-weight: 600;">Gruppo Telegram</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <i class="fas fa-${hasFlash ? 'check-circle' : 'times-circle'}"
                                   style="color: var(--${hasFlash ? 'verde-700' : 'grigio-400'}); font-size: 1.5rem;"></i>
                                <span style="font-weight: 600;">Avvisi Flash</span>
                            </div>
                        </div>
                    </div>

                    <!-- Feed RSS -->
                    <div style="margin-bottom: ${(Array.isArray(app.feedRss) && app.feedRss.length > 0) || haDateScadenze ? '1.5rem' : '0'}; padding-bottom: ${(Array.isArray(app.feedRss) && app.feedRss.length > 0) || haDateScadenze ? '1.5rem' : '0'}; border-bottom: ${(Array.isArray(app.feedRss) && app.feedRss.length > 0) || haDateScadenze ? '2px solid var(--grigio-300)' : 'none'};">
                        <h4 style="font-size: 0.875rem; font-weight: 700; color: #e88a1a; margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 0.05em;">
                            <i class="fas fa-rss" style="color: #e88a1a;"></i> Feed RSS
                        </h4>
                        ${Array.isArray(app.feedRss) && app.feedRss.length > 0 ? `
                            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                                ${app.feedRss.map(feed => `
                                    <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 1rem; background: var(--grigio-100); border-radius: 8px; border-left: 3px solid #e88a1a;">
                                        <i class="fas fa-rss" style="color: #e88a1a; font-size: 0.85rem; flex-shrink: 0;"></i>
                                        <div style="flex: 1; min-width: 0;">
                                            <div style="font-weight: 700; font-size: 0.9rem; color: var(--blu-700);">${feed.nome || 'Feed senza nome'}</div>
                                            ${feed.url ? `<a href="${feed.url}" target="_blank" rel="noopener" style="font-size: 0.8rem; color: var(--blu-500); word-break: break-all; text-decoration: none;">${feed.url} <i class="fas fa-external-link-alt" style="font-size: 0.65rem;"></i></a>` : ''}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        ` : `
                            <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--grigio-400); font-size: 0.9rem;">
                                <i class="fas fa-rss" style="font-size: 1.2rem;"></i>
                                <span>Nessun Feed RSS configurato</span>
                            </div>
                        `}
                    </div>

                    <!-- Scadenze e Alert -->
                    ${haDateScadenze ? `
                    <div>
                        <h4 style="font-size: 0.875rem; font-weight: 700; color: var(--blu-700); margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 0.05em;">📋 Scadenze e Date</h4>

                        ${scadute.length > 0 ? `
                        <div style="background: linear-gradient(135deg, #FFEBEE 0%, #FFCDD2 100%); border-left: 4px solid var(--rosso-errore); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                            <div style="font-weight: 700; color: #C62828; margin-bottom: 0.5rem;">
                                <i class="fas fa-exclamation-circle"></i> Scadenze Superate
                            </div>
                            ${scadute.map(s => `
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid rgba(198, 40, 40, 0.2);">
                                    <span style="font-weight: 600; color: #C62828;">${s.tipo}</span>
                                    <span style="font-weight: 700; color: var(--rosso-errore);">${DataService.formatDate(s.data)} — SCADUTA</span>
                                </div>
                            `).join('')}
                        </div>
                        ` : ''}

                        ${imminenti.length > 0 ? `
                        <div style="background: linear-gradient(135deg, #FFF3CD 0%, #FFEBCC 100%); border-left: 4px solid var(--giallo-avviso); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                            <div style="font-weight: 700; color: #856404; margin-bottom: 0.5rem;">
                                <i class="fas fa-exclamation-triangle"></i> Scadenze Imminenti (prossimi ${_sogliaDetApp} giorni)
                            </div>
                            ${imminenti.map(s => `
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid rgba(133, 100, 4, 0.2);">
                                    <span style="font-weight: 600; color: #856404;">${s.tipo}</span>
                                    <span style="font-weight: 700; color: #E6A800;">${DataService.formatDate(s.data)}</span>
                                </div>
                            `).join('')}
                        </div>
                        ` : ''}

                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 1rem;">
                            ${app.ultimaDataRaccoltaDifferenziata ? `
                            <div class="stat-box" style="background: var(--grigio-100); padding: 1rem; border-radius: 8px;">
                                <div style="font-size: 0.75rem; color: var(--grigio-500); margin-bottom: 0.25rem; font-weight: 600; text-transform: uppercase;">📅 Raccolta Differenziata</div>
                                <div style="font-size: 1.125rem; font-weight: 700; color: var(--blu-700);">${DataService.formatDate(app.ultimaDataRaccoltaDifferenziata)}</div>
                                ${(() => { const d = new Date(app.ultimaDataRaccoltaDifferenziata); d.setHours(0,0,0,0); return d < oggi ? '<div style="font-size: 0.8rem; color: var(--rosso-errore); margin-top: 4px; font-weight: 600;"><i class="fas fa-exclamation-circle"></i> Scaduta</div>' : ''; })()}
                            </div>
                            ` : ''}
                            ${app.ultimaDataFarmacieTurno ? `
                            <div class="stat-box" style="background: var(--grigio-100); padding: 1rem; border-radius: 8px;">
                                <div style="font-size: 0.75rem; color: var(--grigio-500); margin-bottom: 0.25rem; font-weight: 600; text-transform: uppercase;">💊 Farmacie di Turno</div>
                                <div style="font-size: 1.125rem; font-weight: 700; color: var(--blu-700);">${DataService.formatDate(app.ultimaDataFarmacieTurno)}</div>
                                ${(() => { const d = new Date(app.ultimaDataFarmacieTurno); d.setHours(0,0,0,0); return d < oggi ? '<div style="font-size: 0.8rem; color: var(--rosso-errore); margin-top: 4px; font-weight: 600;"><i class="fas fa-exclamation-circle"></i> Scaduta</div>' : ''; })()}
                            </div>
                            ` : ''}
                            ${app.ultimaDataNotificheFarmacie ? `
                            <div class="stat-box" style="background: var(--grigio-100); padding: 1rem; border-radius: 8px;">
                                <div style="font-size: 0.75rem; color: var(--grigio-500); margin-bottom: 0.25rem; font-weight: 600; text-transform: uppercase;">🔔 Notifiche Farmacie</div>
                                <div style="font-size: 1.125rem; font-weight: 700; color: var(--blu-700);">${DataService.formatDate(app.ultimaDataNotificheFarmacie)}</div>
                                ${(() => { const d = new Date(app.ultimaDataNotificheFarmacie); d.setHours(0,0,0,0); return d < oggi ? '<div style="font-size: 0.8rem; color: var(--rosso-errore); margin-top: 4px; font-weight: 600;"><i class="fas fa-exclamation-circle"></i> Scaduta</div>' : ''; })()}
                            </div>
                            ` : ''}
                            ${app.scadenzaCertificatoApple ? `
                            <div class="stat-box" style="background: var(--grigio-100); padding: 1rem; border-radius: 8px;">
                                <div style="font-size: 0.75rem; color: var(--grigio-500); margin-bottom: 0.25rem; font-weight: 600; text-transform: uppercase;">🍎 Certificato Apple</div>
                                <div style="font-size: 1.125rem; font-weight: 700; color: var(--blu-700);">${DataService.formatDate(app.scadenzaCertificatoApple)}</div>
                                ${(() => { const d = new Date(app.scadenzaCertificatoApple); d.setHours(0,0,0,0); return d < oggi ? '<div style="font-size: 0.8rem; color: var(--rosso-errore); margin-top: 4px; font-weight: 600;"><i class="fas fa-exclamation-circle"></i> Scaduta</div>' : ''; })()}
                            </div>
                            ` : ''}
                            ${app.altraScadenzaData ? `
                            <div class="stat-box" style="background: var(--grigio-100); padding: 1rem; border-radius: 8px;">
                                <div style="font-size: 0.75rem; color: var(--grigio-500); margin-bottom: 0.25rem; font-weight: 600; text-transform: uppercase;">📌 ${app.altraScadenzaNote || 'Altra Scadenza'}</div>
                                <div style="font-size: 1.125rem; font-weight: 700; color: var(--blu-700);">${DataService.formatDate(app.altraScadenzaData)}</div>
                                ${(() => { const d = new Date(app.altraScadenzaData); d.setHours(0,0,0,0); return d < oggi ? '<div style="font-size: 0.8rem; color: var(--rosso-errore); margin-top: 4px; font-weight: 600;"><i class="fas fa-exclamation-circle"></i> Scaduta</div>' : ''; })()}
                            </div>
                            ` : ''}
                        </div>
                    </div>
                    ` : `
                    <div style="text-align: center; padding: 1rem; color: var(--grigio-400); font-size: 0.9rem;">
                        <i class="fas fa-calendar-times" style="font-size: 1.5rem; margin-bottom: 0.5rem;"></i>
                        <p style="margin: 0;">Nessuna scadenza configurata</p>
                    </div>
                    `}
                </div>
            </div>
        `;
    },

    renderMetriche(app) {
        const cache = app.gbStatsCache || {};
        const downloads = cache.totalDownloads || app.numDownloads || 0;
        const lastUpdate = cache.lastUpdate ? DataService.formatDate(cache.lastUpdate) : '';
        const launchesMonth = cache.launchesMonth || 0;
        const pageViewsMonth = cache.pageViewsMonth || 0;
        const consensiPush = app.consensiPush || 0;
        const popolazione = app.popolazione || 0;
        const penetrazione = popolazione > 0 ? Math.min(100, (downloads / popolazione) * 100).toFixed(1) : 0;

        return `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-chart-line"></i> Metriche
                    </h2>
                </div>
                <div class="card-body">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr)); gap: 1.5rem;">
                        <div>
                            <div style="font-size: 2rem; font-weight: 700; color: var(--blu-700);">
                                ${downloads.toLocaleString('it-IT')}
                            </div>
                            <div style="color: var(--grigio-500); font-size: 0.875rem;">
                                <i class="fas fa-download"></i> Downloads
                                ${lastUpdate ? `<br><small>(${lastUpdate})</small>` : ''}
                            </div>
                        </div>
                        <div>
                            <div style="font-size: 2rem; font-weight: 700; color: var(--blu-500);">
                                ${consensiPush.toLocaleString('it-IT')}
                            </div>
                            <div style="color: var(--grigio-500); font-size: 0.875rem;">
                                <i class="fas fa-mobile-alt"></i> Consensi Push
                            </div>
                        </div>
                        <div>
                            <div style="font-size: 2rem; font-weight: 700; color: var(--verde-700);">
                                ${penetrazione}%
                            </div>
                            <div style="color: var(--grigio-500); font-size: 0.875rem;">
                                <i class="fas fa-users"></i> Penetrazione
                                ${popolazione > 0 ? `<br><small>(${popolazione.toLocaleString('it-IT')} ab.)</small>` : ''}
                            </div>
                        </div>
                        <div>
                            <div style="font-size: 2rem; font-weight: 700; color: var(--grigio-700);">
                                ${launchesMonth.toLocaleString('it-IT')}
                            </div>
                            <div style="color: var(--grigio-500); font-size: 0.875rem;">
                                <i class="fas fa-rocket"></i> Lanci/mese
                            </div>
                        </div>
                        <div>
                            <div style="font-size: 2rem; font-weight: 700; color: var(--grigio-700);">
                                ${pageViewsMonth.toLocaleString('it-IT')}
                            </div>
                            <div style="color: var(--grigio-500); font-size: 0.875rem;">
                                <i class="fas fa-eye"></i> Views/mese
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderControlloQualita(app) {
        // Gestisci booleano che può essere sia true/false che stringa "true"/"false"
        const isQANegativo = app.controlloQualitaNegativo === true || app.controlloQualitaNegativo === 'true';

        // Calcola se serve un controllo qualità (più di 1 mese dall'ultimo)
        let needsCheck = false;
        let giorniPassati = null;

        if (app.dataUltimoControlloQualita) {
            const dataControllo = new Date(app.dataUltimoControlloQualita);
            dataControllo.setHours(0, 0, 0, 0);
            const oggi = new Date();
            oggi.setHours(0, 0, 0, 0);
            const diffTime = oggi - dataControllo;
            giorniPassati = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            needsCheck = giorniPassati > 30;
        } else {
            // Nessun controllo mai fatto
            needsCheck = true;
        }

        return `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-clipboard-check"></i> Controllo Qualità
                        ${isQANegativo ? `<span class="badge" style="background: var(--rosso-errore); color: white; font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: 12px; margin-left: 0.5rem;"><i class="fas fa-times-circle"></i> QA KO</span>` : needsCheck ? `<span class="badge" style="background: var(--giallo-avviso); color: #856404; font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: 12px; margin-left: 0.5rem;"><i class="fas fa-info-circle"></i> Controllo necessario</span>` : ''}
                    </h2>
                </div>
                <div class="card-body">
                    ${isQANegativo ? `
                    <div style="background: linear-gradient(135deg, #FFEBEE 0%, #FFCDD2 100%); border-left: 4px solid var(--rosso-errore); padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem;">
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <i class="fas fa-times-circle" style="color: var(--rosso-errore); font-size: 2.5rem;"></i>
                            <div style="flex: 1;">
                                <div style="font-weight: 700; color: var(--rosso-errore); font-size: 1.25rem; margin-bottom: 0.5rem;">
                                    <i class="fas fa-exclamation-triangle"></i> CONTROLLO QUALITÀ NEGATIVO
                                </div>
                                <div style="font-size: 0.95rem; color: #C62828; line-height: 1.5;">
                                    Il controllo qualità ha rilevato problemi critici che richiedono attenzione immediata.
                                    Verificare le note del controllo per i dettagli.
                                </div>
                            </div>
                        </div>
                    </div>
                    ` : needsCheck ? `
                    <div style="background: linear-gradient(135deg, #FFF9E6 0%, #FFF3CD 100%); border-left: 4px solid var(--giallo-avviso); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
                        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                            <i class="fas fa-exclamation-triangle" style="color: var(--giallo-avviso); font-size: 1.5rem;"></i>
                            <div>
                                <div style="font-weight: 700; color: #856404; font-size: 1rem;">
                                    ${app.dataUltimoControlloQualita ? `È passato più di 1 mese dall'ultimo controllo` : `Nessun controllo qualità effettuato`}
                                </div>
                                <div style="font-size: 0.875rem; color: #856404; margin-top: 0.25rem;">
                                    ${app.dataUltimoControlloQualita ? `Ultimo controllo: ${DataService.formatDate(app.dataUltimoControlloQualita)} (${giorniPassati} giorni fa)` : `Si consiglia di effettuare un controllo qualità dell'app`}
                                </div>
                            </div>
                        </div>
                    </div>
                    ` : ''}

                    ${app.dataUltimoControlloQualita ? `
                    <div style="display: grid; gap: 1.5rem;">
                        <div class="stat-box" style="background: var(--${needsCheck ? 'giallo-avviso' : 'verde-100'}); padding: 1.5rem; border-radius: 8px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                <div style="font-size: 0.75rem; color: var(--grigio-700); font-weight: 600; text-transform: uppercase;">
                                    📅 Ultimo Controllo
                                </div>
                                <span style="background: white; color: var(--blu-700); padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.75rem; font-weight: 700;">
                                    ${giorniPassati} giorni fa
                                </span>
                            </div>
                            <div style="font-size: 1.25rem; font-weight: 700; color: var(--blu-700); margin-bottom: ${app.controlloQualitaDaNome ? '0.75rem' : '0'};">
                                ${DataService.formatDate(app.dataUltimoControlloQualita)}
                            </div>
                            ${app.controlloQualitaDaNome ? `
                            <div style="font-size: 0.875rem; color: var(--grigio-600); margin-top: 0.5rem; padding-top: 0.75rem; border-top: 1px solid rgba(0,0,0,0.1);">
                                <i class="fas fa-user-check" style="color: var(--blu-500);"></i>
                                <strong>Ultima verifica effettuata da:</strong> ${app.controlloQualitaDaNome}
                            </div>
                            ` : ''}
                        </div>

                        ${app.noteControlloQualita ? `
                        <div style="background: var(--grigio-100); padding: 1.5rem; border-radius: 8px;">
                            <div style="font-size: 0.75rem; color: var(--grigio-700); font-weight: 600; text-transform: uppercase; margin-bottom: 0.75rem;">
                                📋 Risultati Controllo
                            </div>
                            <div style="color: var(--grigio-900); white-space: pre-wrap; line-height: 1.6;">
                                ${app.noteControlloQualita}
                            </div>
                        </div>
                        ` : ''}
                    </div>
                    ` : `
                    <div class="empty-state" style="padding: 2rem;">
                        <i class="fas fa-clipboard-check" style="font-size: 3rem; color: var(--grigio-300); margin-bottom: 1rem;"></i>
                        <p style="color: var(--grigio-500); margin: 0;">Nessun controllo qualità effettuato</p>
                        <p style="color: var(--grigio-400); font-size: 0.875rem; margin-top: 0.5rem;">Clicca su Modifica per aggiungere la data del primo controllo</p>
                    </div>
                    `}
                </div>
            </div>
        `;
    },

    renderNote(app) {
        if (!app.note1 && !app.note2) {
            return '';
        }

        return `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-sticky-note"></i> Note
                    </h2>
                </div>
                <div class="card-body">
                    ${app.note1 ? `
                        <div style="margin-bottom: 1rem;">
                            <h4 style="font-size: 0.875rem; font-weight: 700; color: var(--grigio-700); margin-bottom: 0.5rem;">
                                Note 1
                            </h4>
                            <p style="color: var(--grigio-600); white-space: pre-wrap;">${app.note1}</p>
                        </div>
                    ` : ''}
                    ${app.note2 ? `
                        <div>
                            <h4 style="font-size: 0.875rem; font-weight: 700; color: var(--grigio-700); margin-bottom: 0.5rem;">
                                Note 2
                            </h4>
                            <p style="color: var(--grigio-600); white-space: pre-wrap;">${app.note2}</p>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    renderInfoItem(label, value, icon, isWarning = false) {
        if (!value || value === 'null' || value === 'undefined') {
            return `
                <div>
                    <div style="font-size: 0.75rem; font-weight: 600; color: var(--grigio-500); text-transform: uppercase; margin-bottom: 0.25rem;">
                        <i class="fas fa-${icon}"></i> ${label}
                    </div>
                    <div style="color: var(--grigio-400); font-style: italic;">
                        Non specificato
                    </div>
                </div>
            `;
        }

        return `
            <div>
                <div style="font-size: 0.75rem; font-weight: 600; color: var(--grigio-500); text-transform: uppercase; margin-bottom: 0.25rem;">
                    <i class="fas fa-${icon}"></i> ${label}
                </div>
                <div style="font-weight: 600; color: var(--${isWarning ? 'rosso-errore' : 'grigio-900'});">
                    ${isWarning ? '<i class="fas fa-exclamation-triangle"></i> ' : ''}${value}
                </div>
            </div>
        `;
    },

    renderDocumenti() {
        return `
            <div class="card">
                <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                    <h2 class="card-title">
                        <i class="fas fa-folder-open"></i> Documenti App
                    </h2>
                    <button class="btn btn-primary" onclick="DettaglioApp.showUploadDocumento()">
                        <i class="fas fa-upload"></i> Carica Documento
                    </button>
                </div>

                ${this.documenti.length === 0 ? `
                    <div class="empty-state">
                        <i class="fas fa-folder-open"></i>
                        <h3>Nessun documento caricato</h3>
                        <p>Carica documenti tecnici, di gestione o altro per questa app</p>
                    </div>
                ` : `
                    <div class="documenti-list" style="display: grid; gap: 1rem; padding: 1.5rem;">
                        ${this.documenti.map(doc => `
                            <div class="documento-item" style="
                                background: white;
                                border: 2px solid var(--grigio-300);
                                border-radius: 8px;
                                padding: 1.5rem;
                                display: grid;
                                grid-template-columns: auto 1fr auto;
                                gap: 1.5rem;
                                align-items: start;
                                transition: all 0.2s;
                            " onmouseover="this.style.borderColor='var(--blu-500)'" onmouseout="this.style.borderColor='var(--grigio-300)'">

                                <!-- Icona file -->
                                <div style="
                                    width: 60px;
                                    height: 60px;
                                    background: var(--grigio-100);
                                    border-radius: 8px;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                ">
                                    <i class="${DocumentService.getFileIcon(doc.mimeType)}" style="
                                        font-size: 2rem;
                                        color: ${DocumentService.getFileColor(doc.mimeType)};
                                    "></i>
                                </div>

                                <!-- Info documento -->
                                <div style="min-width: 0;">
                                    <h4 style="
                                        margin: 0 0 0.5rem 0;
                                        color: var(--blu-700);
                                        font-weight: 700;
                                        font-size: 1.1rem;
                                        word-break: break-word;
                                    ">
                                        ${doc.nomeOriginale}
                                    </h4>

                                    <p style="
                                        margin: 0 0 0.75rem 0;
                                        color: var(--grigio-700);
                                        line-height: 1.5;
                                    ">
                                        ${doc.descrizione}
                                    </p>

                                    <div style="
                                        display: flex;
                                        gap: 1.5rem;
                                        flex-wrap: wrap;
                                        font-size: 0.9rem;
                                        color: var(--grigio-500);
                                    ">
                                        <span>
                                            <i class="fas fa-hdd"></i> ${DocumentService.formatFileSize(doc.dimensione)}
                                        </span>
                                        <span>
                                            <i class="fas fa-calendar"></i> ${new Date(doc.dataCaricamento).toLocaleDateString('it-IT')}
                                        </span>
                                        <span>
                                            <i class="fas fa-user"></i> ${doc.caricatoDaNome}
                                        </span>
                                    </div>
                                </div>

                                <!-- Azioni -->
                                <div style="display: flex; gap: 0.5rem; flex-direction: column;">
                                    <button class="btn btn-primary" onclick="DettaglioApp.downloadDocumento('${doc.downloadUrl}', '${doc.nomeOriginale}')" style="
                                        white-space: nowrap;
                                        padding: 0.5rem 1rem;
                                    ">
                                        <i class="fas fa-download"></i> Scarica
                                    </button>
                                    ${!AuthService.canViewOnlyOwnData() ? `<button class="btn btn-danger" onclick="DettaglioApp.deleteDocumento('${doc.id}', '${doc.storagePath}', '${doc.nomeOriginale}')" style="
                                        white-space: nowrap;
                                        padding: 0.5rem 1rem;
                                    ">
                                        <i class="fas fa-trash"></i> Elimina
                                    </button>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;
    },

    async showUploadDocumento() {
        await UI.showModal({
            title: '<i class="fas fa-upload"></i> Carica Documento App',
            content: `
                <form id="uploadDocumentoForm">
                    <div style="margin-bottom: 1.5rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: var(--grigio-700);">
                            📄 File (PDF o Immagini, max 10MB)
                        </label>
                        <input type="file" id="fileInput" accept=".pdf,.jpg,.jpeg,.png" required style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px dashed var(--blu-500);
                            border-radius: 8px;
                            background: var(--blu-100);
                            cursor: pointer;
                        ">
                        <small style="color: var(--grigio-500); display: block; margin-top: 0.5rem;">
                            Tipi ammessi: PDF, JPG, PNG - Dimensione massima: 10MB
                        </small>
                    </div>

                    <div style="margin-bottom: 1.5rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: var(--grigio-700);">
                            📝 Descrizione *
                        </label>
                        <textarea id="descrizioneInput" rows="3" required placeholder="Es: Screenshot interfaccia, Documento tecnico, Privacy policy..." style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px solid var(--grigio-300);
                            border-radius: 8px;
                            font-family: 'Titillium Web', sans-serif;
                            resize: vertical;
                        "></textarea>
                    </div>
                </form>
            `,
            confirmText: 'Carica',
            cancelText: 'Annulla',
            onConfirm: async () => {
                // Raccogli dati PRIMA che il modal si chiuda
                const fileInput = document.getElementById('fileInput');
                const descrizioneInput = document.getElementById('descrizioneInput');

                const file = fileInput.files[0];
                const descrizione = descrizioneInput.value.trim();

                if (!file) {
                    UI.showError('Seleziona un file da caricare');
                    return false;  // Non chiudere il modal
                }

                if (!descrizione) {
                    UI.showError('Inserisci una descrizione per il documento');
                    return false;  // Non chiudere il modal
                }

                // Mostra loading sul pulsante
                const confirmBtn = document.getElementById('modalConfirmBtn');
                const originalHTML = confirmBtn.innerHTML;
                confirmBtn.disabled = true;
                confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Caricamento...';

                try {
                    await DocumentService.uploadDocumento(file, 'app', this.appId, descrizione);

                    // Ricarica documenti
                    this.documenti = await DocumentService.getDocumenti('app', this.appId);

                    // Aggiorna tab content
                    const tabContent = document.getElementById('tabContent');
                    tabContent.innerHTML = this.renderDocumenti();

                    // Aggiorna conteggio nel tab
                    const tabsNav = document.querySelector('[style*="border-bottom"]');
                    if (tabsNav) {
                        tabsNav.outerHTML = this.renderTabsNav();
                    }

                    return true;  // Chiudi il modal
                } catch (error) {
                    // Ripristina pulsante in caso di errore
                    confirmBtn.disabled = false;
                    confirmBtn.innerHTML = originalHTML;
                    UI.showError(error.message || 'Errore durante il caricamento del documento');
                    return false;  // Non chiudere il modal in caso di errore
                }
            }
        });
    },

    downloadDocumento(url, nomeFile) {
        const a = document.createElement('a');
        a.href = url;
        a.download = nomeFile;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    },

    async deleteDocumento(documentoId, storagePath, nomeFile) {
        const conferma = await UI.showModal({
            title: '<i class="fas fa-exclamation-triangle"></i> Conferma Eliminazione',
            content: `
                <div style="text-align: center;">
                    <p style="font-size: 1.1rem; margin-bottom: 1rem;">
                        Sei sicuro di voler eliminare questo documento?
                    </p>
                    <p style="
                        background: var(--grigio-100);
                        padding: 1rem;
                        border-radius: 8px;
                        font-weight: 600;
                        color: var(--blu-700);
                        word-break: break-word;
                    ">
                        ${nomeFile}
                    </p>
                    <p style="color: var(--rosso-errore); font-weight: 600; margin-top: 1rem;">
                        ⚠️ Questa azione non può essere annullata
                    </p>
                </div>
            `,
            confirmText: 'Sì, elimina',
            cancelText: 'Annulla',
            confirmClass: 'btn-danger'
        });

        if (conferma) {
            try {
                await DocumentService.deleteDocumento(documentoId, storagePath);

                // Ricarica documenti
                this.documenti = await DocumentService.getDocumenti('app', this.appId);

                // Aggiorna tab content
                const tabContent = document.getElementById('tabContent');
                tabContent.innerHTML = this.renderDocumenti();

                // Aggiorna conteggio nel tab
                const tabsNav = document.querySelector('[style*="border-bottom"]');
                if (tabsNav) {
                    tabsNav.outerHTML = this.renderTabsNav();
                }
            } catch (error) {
                UI.showError(error.message || 'Errore durante l\'eliminazione del documento');
            }
        }
    },

    async editApp() {
        FormsManager.showModificaApp(this.app);
    },

    async deleteApp() {
        const conferma = confirm(
            `Eliminare definitivamente l'app "${this.app.nome}"?\n\nQuesta operazione NON può essere annullata.`
        );

        if (!conferma) return;

        try {
            await DataService.deleteApp(this.appId);
            UI.showSuccess('App eliminata con successo');
            UI.showPage('app');
        } catch (error) {
            console.error('Errore eliminazione app:', error);
            UI.showError('Errore nell\'eliminazione: ' + error.message);
        }
    },

    // =====================================================
    // CONFIGURAZIONE APP (Solo Super Admin)
    // =====================================================

    renderConfigurazioneApp(app) {
        const defaultUrlSito = app.nome ? `https://${app.nome.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '')}.comune.digital` : '';
        const defaultUrlCruscotto = defaultUrlSito ? `${defaultUrlSito}/manage` : '';

        return `
            <div class="card" style="border: 2px solid var(--blu-300);">
                <div class="card-header" style="background: var(--blu-100); cursor: pointer; user-select: none;" onclick="DettaglioApp.toggleConfigApp()">
                    <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                        <h2 class="card-title" style="color: var(--blu-700); margin: 0;">
                            <i class="fas fa-sliders-h"></i> Configurazione App
                            <span style="font-size: 0.7rem; background: var(--blu-700); color: white; padding: 0.15rem 0.5rem; border-radius: 4px; margin-left: 0.5rem; vertical-align: middle;">SUPER ADMIN</span>
                        </h2>
                        <i id="configAppChevron" class="fas fa-chevron-down" style="color: var(--blu-700); font-size: 0.9rem; transition: transform 0.3s ease;"></i>
                    </div>
                </div>
                <div id="configAppBody" style="max-height: 0; overflow: hidden; transition: max-height 0.4s ease;">
                    <div style="padding: 1.5rem;">
                        <!-- Icona App -->
                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: block; font-size: 0.85rem; font-weight: 700; color: var(--grigio-700); margin-bottom: 0.75rem;">
                                <i class="fas fa-image"></i> Icona App
                            </label>
                            <div style="display: flex; align-items: center; gap: 1rem;">
                                ${app.iconaUrl ? `
                                    <img id="configIconaPreview" src="${app.iconaUrl}" alt="Icona" style="width: 64px; height: 64px; border-radius: 14px; object-fit: cover; box-shadow: 0 2px 6px rgba(0,0,0,0.1);" />
                                ` : `
                                    <div id="configIconaPreview" style="width: 64px; height: 64px; border-radius: 14px; background: var(--grigio-100); display: flex; align-items: center; justify-content: center; border: 2px dashed var(--grigio-300);">
                                        <i class="fas fa-camera" style="color: var(--grigio-400); font-size: 1.2rem;"></i>
                                    </div>
                                `}
                                <div>
                                    <input type="file" id="configIconaFile" accept="image/*" style="display: none;" onchange="DettaglioApp.onIconaSelected()" />
                                    <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); document.getElementById('configIconaFile').click()">
                                        <i class="fas fa-upload"></i> ${app.iconaUrl ? 'Cambia Icona' : 'Carica Icona'}
                                    </button>
                                    <p style="font-size: 0.75rem; color: var(--grigio-500); margin-top: 0.25rem;">Immagine quadrata, max 2MB</p>
                                </div>
                            </div>
                        </div>

                        <!-- URL Sito e Cruscotto -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(250px, 100%), 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
                            <div>
                                <label style="display: block; font-size: 0.85rem; font-weight: 700; color: var(--grigio-700); margin-bottom: 0.35rem;">
                                    <i class="fas fa-globe"></i> URL Sito Pubblico
                                </label>
                                <input type="url" id="configUrlSito" value="${app.urlSito || defaultUrlSito}" placeholder="https://nomecomune.comune.digital"
                                    style="width: 100%; padding: 0.6rem; border: 1px solid var(--grigio-300); border-radius: 6px; font-family: 'Titillium Web', sans-serif; font-size: 0.9rem;" />
                            </div>
                            <div>
                                <label style="display: block; font-size: 0.85rem; font-weight: 700; color: var(--grigio-700); margin-bottom: 0.35rem;">
                                    <i class="fas fa-cogs"></i> URL Cruscotto Gestione
                                </label>
                                <input type="url" id="configUrlCruscotto" value="${app.urlCruscotto || defaultUrlCruscotto}" placeholder="https://nomecomune.comune.digital/manage"
                                    style="width: 100%; padding: 0.6rem; border: 1px solid var(--grigio-300); border-radius: 6px; font-family: 'Titillium Web', sans-serif; font-size: 0.9rem;" />
                            </div>
                        </div>

                        <!-- Pulsante Salva -->
                        <button id="btnSalvaConfigApp" class="btn btn-primary" onclick="DettaglioApp.salvaConfigApp()" style="width: 100%;">
                            <i class="fas fa-save"></i> Salva Configurazione
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    // Toggle accordion configurazione app
    toggleConfigApp() {
        const body = document.getElementById('configAppBody');
        const chevron = document.getElementById('configAppChevron');
        if (!body) return;

        const isOpen = body.style.maxHeight && body.style.maxHeight !== '0px';
        if (isOpen) {
            body.style.maxHeight = '0';
            if (chevron) chevron.style.transform = 'rotate(0deg)';
        } else {
            body.style.maxHeight = body.scrollHeight + 'px';
            if (chevron) chevron.style.transform = 'rotate(180deg)';
        }
    },

    // Preview icona selezionata
    onIconaSelected() {
        const fileInput = document.getElementById('configIconaFile');
        if (!fileInput.files || !fileInput.files[0]) return;

        const file = fileInput.files[0];

        // Validazione
        if (file.size > 2 * 1024 * 1024) {
            UI.showError('Immagine troppo grande (max 2MB)');
            fileInput.value = '';
            return;
        }
        if (!file.type.startsWith('image/')) {
            UI.showError('Seleziona un file immagine');
            fileInput.value = '';
            return;
        }

        // Preview
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById('configIconaPreview');
            if (preview.tagName === 'IMG') {
                preview.src = e.target.result;
            } else {
                preview.outerHTML = `<img id="configIconaPreview" src="${e.target.result}" alt="Icona" style="width: 64px; height: 64px; border-radius: 14px; object-fit: cover; box-shadow: 0 2px 6px rgba(0,0,0,0.1);" />`;
            }
        };
        reader.readAsDataURL(file);
    },

    /**
     * Salva configurazione app: icona (su Storage) + URL (su Firestore)
     */
    async salvaConfigApp() {
        const btn = document.getElementById('btnSalvaConfigApp');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvataggio...';

        try {
            const urlSito = document.getElementById('configUrlSito')?.value?.trim() || '';
            const urlCruscotto = document.getElementById('configUrlCruscotto')?.value?.trim() || '';
            const fileInput = document.getElementById('configIconaFile');
            let iconaUrl = this.app.iconaUrl || '';

            // Upload icona se selezionata
            if (fileInput.files && fileInput.files[0]) {
                const file = fileInput.files[0];
                const timestamp = Date.now();
                const ext = file.name.split('.').pop().toLowerCase();
                const storagePath = `documenti/app/${this.appId}/icona_${timestamp}.${ext}`;

                const storageRef = storage.ref();
                const fileRef = storageRef.child(storagePath);
                await fileRef.put(file, { contentType: file.type });
                iconaUrl = await fileRef.getDownloadURL();
            }

            // Salva su Firestore
            await db.collection('app').doc(this.appId).update({
                iconaUrl: iconaUrl,
                urlSito: urlSito,
                urlCruscotto: urlCruscotto
            });

            // Aggiorna dati locali
            this.app.iconaUrl = iconaUrl;
            this.app.urlSito = urlSito;
            this.app.urlCruscotto = urlCruscotto;

            UI.showSuccess('Configurazione salvata!');

            // Ricarica la pagina per aggiornare header
            this.render(this.appId);

        } catch (error) {
            console.error('Errore salvataggio configurazione app:', error);
            UI.showError('Errore nel salvataggio: ' + error.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save"></i> Salva Configurazione';
            }
        }
    },

    // === TAB STATISTICHE GOODBARBER ===

    renderStatisticheGB(app) {
        if (!app.goodbarberWebzineId || !app.goodbarberToken) {
            return `
                <div class="card fade-in" style="text-align:center;padding:3rem;">
                    <i class="fas fa-plug" style="font-size:3rem;color:var(--grigio-300);margin-bottom:1rem;"></i>
                    <h3 style="color:var(--grigio-700);">Integrazione GoodBarber non configurata</h3>
                    <p style="color:var(--grigio-500);margin-top:0.5rem;">Per vedere le statistiche, modifica l'app e inserisci il <strong>Webzine ID</strong> e il <strong>Token API</strong> nella sezione Metriche.</p>
                    <button class="btn btn-primary" style="margin-top:1rem;" onclick="DettaglioApp.editApp()">
                        <i class="fas fa-edit"></i> Configura Integrazione
                    </button>
                </div>`;
        }

        // Usa dati dalla cache se disponibili
        const cache = app.gbStatsCache || null;
        const lastUpdate = cache ? new Date(cache.lastUpdate).toLocaleString('it-IT') : 'Mai';

        return `
            <div class="fade-in" style="display:grid;gap:1.5rem;">
                <!-- Header con bottone aggiorna -->
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;">
                    <div>
                        <span style="font-size:0.85rem;color:var(--grigio-500);">
                            <i class="fas fa-clock"></i> Ultimo aggiornamento: ${lastUpdate}
                        </span>
                    </div>
                    <div style="display:flex;gap:0.5rem;">
                        <button class="btn btn-secondary btn-sm" onclick="DettaglioApp.testGBConnection()">
                            <i class="fas fa-plug"></i> Test Connessione
                        </button>
                        <button class="btn btn-primary btn-sm" id="btnAggiornaStatsGB" onclick="DettaglioApp.aggiornaStatisticheGB()">
                            <i class="fas fa-sync-alt"></i> Aggiorna Statistiche
                        </button>
                    </div>
                </div>

                <!-- Container per i dati (verrà popolato da aggiornaStatisticheGB o dalla cache) -->
                <div id="gbStatsContainer">
                    ${cache ? this._renderGBStatsContent(cache) : `
                        <div class="card" style="text-align:center;padding:2rem;">
                            <i class="fas fa-chart-bar" style="font-size:2rem;color:var(--grigio-300);margin-bottom:1rem;"></i>
                            <p style="color:var(--grigio-500);">Clicca "Aggiorna Statistiche" per caricare i dati da GoodBarber</p>
                        </div>
                    `}
                </div>
            </div>
        `;
    },

    async testGBConnection() {
        const app = this.app;
        if (!app.goodbarberWebzineId || !app.goodbarberToken) {
            UI.showError('Webzine ID e Token non configurati');
            return;
        }
        try {
            UI.showLoading();
            const result = await GoodBarberService.testConnection(app.goodbarberWebzineId, app.goodbarberToken);
            UI.hideLoading();
            if (result.success) {
                UI.showSuccess('Connessione GoodBarber OK! Gruppi trovati: ' + (result.groups || 0));
            } else {
                UI.showError('Connessione fallita: ' + (result.error || 'Errore sconosciuto'));
            }
        } catch (e) {
            UI.hideLoading();
            UI.showError('Errore test connessione: ' + e.message);
        }
    },

    async aggiornaStatisticheGB() {
        const app = this.app;
        const btn = document.getElementById('btnAggiornaStatsGB');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Caricamento...'; }

        try {
            const stats = await GoodBarberService.getAllStats(app.goodbarberWebzineId, app.goodbarberToken);

            // Salva cache su Firestore — mappo le chiavi della risposta getAllStats
            const osDist = stats.mobile_os_distribution || {};
            const cacheData = {
                lastUpdate: new Date().toISOString(),
                totalDownloads: stats.downloads_global?.total_global_downloads || 0,
                downloadVersions: stats.downloads_global?.versions || [],
                launchesMonth: stats.launches?.total_launches || 0,
                uniqueLaunchesMonth: stats.unique_launches?.total_unique_launches || 0,
                pageViewsMonth: stats.page_views?.total_page_views || 0,
                pageViewsPerWeekDay: stats.page_views_per_week_day || {},
                sessionTimes: stats.session_times?.history || [],
                totalSessions: stats.session_times?.total_sessions || 0,
                devices: stats.devices_global?.devices || [],
                totalDevices: stats.devices_global?.total_devices || 0,
                osDistribution: osDist,
                osVersions: stats.os_versions?.os_versions || [],
                downloadsHistory: stats.downloads?.history || [],
                launchesHistory: stats.launches?.history || [],
                pageViewsHistory: stats.page_views?.history || [],
                rawData: stats
            };

            await DataService.updateApp(app.id, { gbStatsCache: cacheData });
            this.app.gbStatsCache = cacheData;

            // Aggiorna anche numDownloads dal dato API
            if (cacheData.totalDownloads > 0) {
                await DataService.updateApp(app.id, {
                    numDownloads: cacheData.totalDownloads,
                    dataRilevamentoDownloads: new Date().toISOString().split('T')[0]
                });
                this.app.numDownloads = cacheData.totalDownloads;
            }

            // Renderizza i dati
            const container = document.getElementById('gbStatsContainer');
            if (container) {
                container.innerHTML = this._renderGBStatsContent(cacheData);
            }

            // Aggiorna anche la sezione Metriche con i nuovi dati API
            const metricheContainer = document.getElementById('metricheContainer');
            if (metricheContainer) {
                metricheContainer.innerHTML = this.renderMetriche(this.app);
            }

            // Aggiorna timestamp
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Aggiorna Statistiche'; }
            UI.showSuccess('Statistiche aggiornate!');

        } catch (e) {
            console.error('Errore aggiornamento stats GB:', e);
            UI.showError('Errore caricamento statistiche: ' + e.message);
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Aggiorna Statistiche'; }
        }
    },

    _renderGBStatsContent(cache) {
        const totalDl = cache.totalDownloads || 0;
        const launches = cache.launchesMonth || 0;
        const uniqueLaunches = cache.uniqueLaunchesMonth || 0;
        const pageViews = cache.pageViewsMonth || 0;
        const totalSessions = cache.totalSessions || 0;
        const totalDevices = cache.totalDevices || 0;
        const osDist = cache.osDistribution || {};
        const iosPerc = osDist.ios_devices_percentage || 0;
        const androidPerc = osDist.android_devices_percentage || 0;
        const groups = cache.groups || [];
        const prospects = cache.prospects || {};
        const prospectCount = prospects.count || 0;

        // Calcola sessione media
        let avgSession = 'N/D';
        if (cache.sessionTimes && cache.sessionTimes.length > 0) {
            const sessionMap = {};
            cache.sessionTimes.forEach(s => {
                sessionMap[s.session_time] = (sessionMap[s.session_time] || 0) + s.sessions;
            });
            const sorted = Object.entries(sessionMap).sort((a, b) => b[1] - a[1]);
            if (sorted.length > 0) avgSession = sorted[0][0];
        }

        // Page views per giorno settimana
        const weekDays = cache.pageViewsPerWeekDay || {};
        const maxPV = Math.max(1, ...Object.values(weekDays));
        const giorniIT = { Monday: 'Lun', Tuesday: 'Mar', Wednesday: 'Mer', Thursday: 'Gio', Friday: 'Ven', Saturday: 'Sab', Sunday: 'Dom' };

        // Top devices
        const topDevices = (cache.devices || []).slice(0, 8);
        const maxDevCount = Math.max(1, ...topDevices.map(d => d.devices));

        // Downloads history (ultimi 30 gg - grafico barre)
        const dlHistory = (cache.downloadsHistory || []).slice(-30);
        const maxDlDay = Math.max(1, ...dlHistory.map(d => d.downloads));

        return `
            <!-- KPI Cards -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;">
                <div class="card" style="text-align:center;padding:1rem;">
                    <div style="font-size:2rem;font-weight:900;color:var(--blu-700);">${totalDl.toLocaleString('it-IT')}</div>
                    <div style="font-size:0.8rem;color:var(--grigio-500);"><i class="fas fa-download"></i> Download Totali</div>
                </div>
                <div class="card" style="text-align:center;padding:1rem;">
                    <div style="font-size:2rem;font-weight:900;color:var(--verde-700);">${launches.toLocaleString('it-IT')}</div>
                    <div style="font-size:0.8rem;color:var(--grigio-500);"><i class="fas fa-rocket"></i> Lanci (30gg)</div>
                </div>
                <div class="card" style="text-align:center;padding:1rem;">
                    <div style="font-size:2rem;font-weight:900;color:var(--blu-500);">${pageViews.toLocaleString('it-IT')}</div>
                    <div style="font-size:0.8rem;color:var(--grigio-500);"><i class="fas fa-eye"></i> Page Views (30gg)</div>
                </div>
                <div class="card" style="text-align:center;padding:1rem;">
                    <div style="font-size:2rem;font-weight:900;color:#F59E0B;">${uniqueLaunches.toLocaleString('it-IT')}</div>
                    <div style="font-size:0.8rem;color:var(--grigio-500);"><i class="fas fa-user"></i> Lanci Unici (30gg)</div>
                </div>
            </div>

            <!-- Distribuzione piattaforme -->
            <div class="card" style="padding:1.25rem;">
                <h3 style="font-size:1rem;font-weight:700;color:var(--grigio-900);margin-bottom:1rem;">
                    <i class="fas fa-mobile-alt" style="color:var(--blu-700);"></i> Distribuzione Piattaforme
                </h3>
                <div style="display:flex;gap:1rem;align-items:center;">
                    <div style="flex:1;">
                        <div style="display:flex;justify-content:space-between;margin-bottom:0.25rem;">
                            <span style="font-size:0.85rem;font-weight:600;"><i class="fab fa-apple"></i> iOS</span>
                            <span style="font-weight:700;color:var(--grigio-900);">${iosPerc}%</span>
                        </div>
                        <div style="height:12px;background:var(--grigio-100);border-radius:6px;overflow:hidden;">
                            <div style="height:100%;width:${iosPerc}%;background:var(--grigio-700);border-radius:6px;transition:width 0.5s;"></div>
                        </div>
                    </div>
                    <div style="flex:1;">
                        <div style="display:flex;justify-content:space-between;margin-bottom:0.25rem;">
                            <span style="font-size:0.85rem;font-weight:600;"><i class="fab fa-android"></i> Android</span>
                            <span style="font-weight:700;color:var(--grigio-900);">${androidPerc}%</span>
                        </div>
                        <div style="height:12px;background:var(--grigio-100);border-radius:6px;overflow:hidden;">
                            <div style="height:100%;width:${androidPerc}%;background:var(--verde-700);border-radius:6px;transition:width 0.5s;"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Page Views per giorno settimana -->
            ${Object.keys(weekDays).length > 0 ? `
            <div class="card" style="padding:1.25rem;">
                <h3 style="font-size:1rem;font-weight:700;color:var(--grigio-900);margin-bottom:1rem;">
                    <i class="fas fa-calendar-week" style="color:var(--blu-500);"></i> Page Views per Giorno
                </h3>
                <div style="display:flex;gap:0.5rem;align-items:flex-end;height:120px;">
                    ${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(day => {
                        const val = weekDays[day] || 0;
                        const perc = Math.round(val / maxPV * 100);
                        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:0.25rem;">
                            <span style="font-size:0.7rem;font-weight:700;color:var(--grigio-700);">${val}</span>
                            <div style="width:100%;height:${Math.max(4, perc)}%;background:var(--blu-300);border-radius:4px 4px 0 0;min-height:4px;transition:height 0.3s;"></div>
                            <span style="font-size:0.7rem;color:var(--grigio-500);">${giorniIT[day]}</span>
                        </div>`;
                    }).join('')}
                </div>
            </div>` : ''}

            <!-- Download History (ultimi 30gg) -->
            ${dlHistory.length > 0 ? `
            <div class="card" style="padding:1.25rem;">
                <h3 style="font-size:1rem;font-weight:700;color:var(--grigio-900);margin-bottom:1rem;">
                    <i class="fas fa-chart-bar" style="color:var(--verde-700);"></i> Download ultimi 30 giorni
                </h3>
                <div style="display:flex;gap:2px;align-items:flex-end;height:80px;overflow-x:auto;">
                    ${dlHistory.map(d => {
                        const perc = Math.round(d.downloads / maxDlDay * 100);
                        const day = d.date ? d.date.split('-')[2] : '';
                        return `<div style="flex:1;min-width:8px;display:flex;flex-direction:column;align-items:center;gap:1px;">
                            <div style="width:100%;height:${Math.max(2, perc)}%;background:var(--verde-500);border-radius:2px 2px 0 0;min-height:2px;"></div>
                            ${dlHistory.length <= 15 ? `<span style="font-size:0.55rem;color:var(--grigio-500);">${day}</span>` : ''}
                        </div>`;
                    }).join('')}
                </div>
            </div>` : ''}

            <!-- Top Dispositivi -->
            ${topDevices.length > 0 ? `
            <div class="card" style="padding:1.25rem;">
                <h3 style="font-size:1rem;font-weight:700;color:var(--grigio-900);margin-bottom:1rem;">
                    <i class="fas fa-tablet-alt" style="color:#F59E0B;"></i> Top Dispositivi (${totalDevices} totali)
                </h3>
                <div style="display:flex;flex-direction:column;gap:0.5rem;">
                    ${topDevices.map(d => {
                        const perc = Math.round(d.devices / maxDevCount * 100);
                        const platformIcon = d.platform === 'iphone' || d.platform === 'ipad' ? 'fab fa-apple' : d.platform === 'android' ? 'fab fa-android' : 'fas fa-globe';
                        return `<div style="display:flex;align-items:center;gap:0.75rem;">
                            <i class="${platformIcon}" style="width:18px;text-align:center;color:var(--grigio-500);"></i>
                            <span style="font-size:0.85rem;font-weight:600;width:120px;color:var(--grigio-900);">${d.device_name}</span>
                            <div style="flex:1;height:10px;background:var(--grigio-100);border-radius:5px;overflow:hidden;">
                                <div style="height:100%;width:${perc}%;background:var(--blu-300);border-radius:5px;"></div>
                            </div>
                            <span style="font-size:0.8rem;font-weight:700;color:var(--grigio-700);min-width:30px;text-align:right;">${d.devices}</span>
                        </div>`;
                    }).join('')}
                </div>
            </div>` : ''}

            <!-- Community & Prospect -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:1rem;">
                <div class="card" style="padding:1.25rem;">
                    <h3 style="font-size:1rem;font-weight:700;color:var(--grigio-900);margin-bottom:1rem;">
                        <i class="fas fa-users" style="color:var(--blu-700);"></i> Prospect
                    </h3>
                    <div style="font-size:2rem;font-weight:900;color:var(--blu-700);">${prospectCount}</div>
                    <div style="font-size:0.8rem;color:var(--grigio-500);">Utenti registrati</div>
                </div>
                <div class="card" style="padding:1.25rem;">
                    <h3 style="font-size:1rem;font-weight:700;color:var(--grigio-900);margin-bottom:1rem;">
                        <i class="fas fa-layer-group" style="color:var(--verde-700);"></i> Gruppi Utenti
                    </h3>
                    ${groups.length > 0 ? `
                        <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">
                            ${groups.map(g => `
                                <span style="background:${g.is_default ? 'var(--blu-100)' : 'var(--grigio-100)'};color:${g.is_default ? 'var(--blu-700)' : 'var(--grigio-700)'};padding:0.25rem 0.75rem;border-radius:12px;font-size:0.8rem;font-weight:600;">
                                    ${g.label}${g.is_default ? ' (default)' : ''}
                                </span>
                            `).join('')}
                        </div>
                    ` : '<p style="color:var(--grigio-500);font-size:0.85rem;">Nessun gruppo configurato</p>'}
                </div>
            </div>

            <!-- Sessioni -->
            <div class="card" style="padding:1.25rem;">
                <h3 style="font-size:1rem;font-weight:700;color:var(--grigio-900);margin-bottom:0.5rem;">
                    <i class="fas fa-stopwatch" style="color:#F59E0B;"></i> Sessioni (30gg)
                </h3>
                <div style="display:flex;gap:2rem;align-items:baseline;margin-bottom:1rem;">
                    <div>
                        <span style="font-size:1.5rem;font-weight:900;color:var(--grigio-900);">${totalSessions}</span>
                        <span style="font-size:0.8rem;color:var(--grigio-500);"> sessioni totali</span>
                    </div>
                    <div>
                        <span style="font-size:0.85rem;color:var(--grigio-500);">Durata più frequente: </span>
                        <span style="font-weight:700;color:var(--grigio-900);">${avgSession}</span>
                    </div>
                </div>
            </div>
        `;
    }
};

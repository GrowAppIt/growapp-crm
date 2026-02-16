// Dettaglio App Page
const DettaglioApp = {
    appId: null,
    app: null,
    currentTab: 'info',
    tasks: [],

    async render(appId) {
        this.appId = appId;
        this.currentTab = 'info';
        UI.showLoading();

        try {
            const [app, clienti, tasksResult] = await Promise.all([
                DataService.getApp(appId),
                DataService.getClienti(),
                TaskService.getTasksByApp(appId)
            ]);

            if (!app) {
                UI.hideLoading();
                UI.showError('App non trovata');
                return;
            }

            this.app = app;
            this.tasks = tasksResult.success ? tasksResult.tasks : [];

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
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn btn-primary btn-sm" onclick="DettaglioApp.editApp()">
                                <i class="fas fa-edit"></i> Modifica
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="DettaglioApp.deleteApp()">
                                <i class="fas fa-trash"></i> Elimina
                            </button>
                        </div>
                    </div>
                    <h1 style="font-size: 2rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                        <i class="fas fa-mobile-alt"></i> ${app.nome}
                    </h1>
                    <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                        <span class="badge ${DataService.getStatoBadgeClass(app.statoApp)}">
                            ${app.statoApp?.replace('_', ' ') || 'N/A'}
                        </span>
                        ${app.provincia ? `<span style="color: var(--grigio-500);"><i class="fas fa-map-marker-alt"></i> ${app.provincia}</span>` : ''}
                        ${clientePagante ? `<span style="color: var(--grigio-500);"><i class="fas fa-building"></i> ${clientePagante.ragioneSociale}</span>` : ''}
                        ${(() => {
                            const agente = clientePagante?.agente || app.agente;
                            return agente ? `<span style="color: var(--blu-500);"><i class="fas fa-user-tie"></i> ${agente}</span>` : '';
                        })()}
                    </div>
                </div>

                <!-- Tabs Navigation -->
                ${this.renderTabsNav()}

                <!-- Tab Content -->
                <div id="tabContent" style="margin-top: 1.5rem;">
                    ${this.renderTabContent(app, clientePagante)}
                </div>
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
            </div>
        `;
    },

    renderTabContent(app, clientePagante) {
        if (this.currentTab === 'info') {
            return `
                <div style="display: grid; gap: 1.5rem;">
                    ${this.renderDatiComune(app)}
                    ${this.renderGestioneCommerciale(app, clientePagante)}
                    ${this.renderPubblicazioneStore(app)}
                    ${this.renderFunzionalita(app)}
                    ${this.renderMetriche(app)}
                    ${this.renderNote(app)}
                </div>
            `;
        } else if (this.currentTab === 'task') {
            return this.renderTaskTab();
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
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
                    ${this.renderTaskStatCard('TODO', todoTasks.length, 'circle', 'blu-700')}
                    ${this.renderTaskStatCard('IN PROGRESS', inProgressTasks.length, 'spinner', 'giallo-avviso')}
                    ${this.renderTaskStatCard('DONE', doneTasks.length, 'check-circle', 'verde-700')}
                </div>

                <!-- Colonne Task -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem;">
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
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem;">
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
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem;">
                        ${this.renderInfoItem('Cliente Pagante', clientePagante?.ragioneSociale || 'Non collegata', 'building', !clientePagante)}
                        ${this.renderInfoItem('Tipo Pagamento', app.tipoPagamento, 'credit-card')}
                        ${this.renderInfoItem('Stato App', app.statoApp?.replace('_', ' '), 'toggle-on')}
                    </div>
                </div>
            </div>
        `;
    },

    renderPubblicazioneStore(app) {
        return `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-store"></i> Pubblicazione Store
                    </h2>
                </div>
                <div class="card-body">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem;">
                        ${this.renderInfoItem('Pubblicazione Apple', app.dataPubblicazioneApple ? DataService.formatDate(app.dataPubblicazioneApple) : 'Non pubblicata', 'apple')}
                        ${this.renderInfoItem('Pubblicazione Android', app.dataPubblicazioneAndroid ? DataService.formatDate(app.dataPubblicazioneAndroid) : 'Non pubblicata', 'android')}
                        ${this.renderInfoItem('Referente Comune', app.referenteComune, 'user')}
                    </div>
                </div>
            </div>
        `;
    },

    renderFunzionalita(app) {
        return `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-cogs"></i> Funzionalità
                    </h2>
                </div>
                <div class="card-body">
                    <div style="display: flex; gap: 2rem; flex-wrap: wrap;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fas fa-${app.hasGruppoTelegram ? 'check-circle' : 'times-circle'}"
                               style="color: var(--${app.hasGruppoTelegram ? 'verde-700' : 'grigio-400'}); font-size: 1.5rem;"></i>
                            <span style="font-weight: 600;">Gruppo Telegram</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fas fa-${app.hasAvvisiFlash ? 'check-circle' : 'times-circle'}"
                               style="color: var(--${app.hasAvvisiFlash ? 'verde-700' : 'grigio-400'}); font-size: 1.5rem;"></i>
                            <span style="font-weight: 600;">Avvisi Flash</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderMetriche(app) {
        return `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-chart-line"></i> Metriche
                    </h2>
                </div>
                <div class="card-body">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem;">
                        <div>
                            <div style="font-size: 2rem; font-weight: 700; color: var(--blu-700);">
                                ${app.numDownloads || 0}
                            </div>
                            <div style="color: var(--grigio-500); font-size: 0.875rem;">
                                <i class="fas fa-download"></i> Downloads
                                ${app.dataRilevamentoDownloads ? `(${DataService.formatDate(app.dataRilevamentoDownloads)})` : ''}
                            </div>
                        </div>
                        <div>
                            <div style="font-size: 2rem; font-weight: 700; color: var(--verde-700);">
                                ${app.numNotifiche || 0}
                            </div>
                            <div style="color: var(--grigio-500); font-size: 0.875rem;">
                                <i class="fas fa-bell"></i> Notifiche Inviate
                                ${app.dataRilevamentoNotifiche ? `(${DataService.formatDate(app.dataRilevamentoNotifiche)})` : ''}
                            </div>
                        </div>
                    </div>
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
    }
};

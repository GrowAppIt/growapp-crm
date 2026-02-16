// Gestione Task - Pagina Globale
const GestioneTask = {
    tasks: [],
    apps: [],
    utenti: [],
    filtri: {
        appId: null,
        assegnatoA: null,
        priorita: null
    },

    async render() {
        UI.showLoading();

        try {
            // Carica dati in parallelo
            const [tasksResult, apps, utenti] = await Promise.all([
                TaskService.getAllTasks(),
                DataService.getApps(),
                this.loadUtenti()
            ]);

            this.tasks = tasksResult.success ? tasksResult.tasks : [];
            this.apps = apps;
            this.utenti = utenti;

            const mainContent = document.getElementById('mainContent');
            mainContent.innerHTML = `
                <div class="page-header mb-3">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem;">
                        <div>
                            <h1 style="font-size: 2rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                                <i class="fas fa-tasks"></i> Gestione Task
                            </h1>
                            <p style="color: var(--grigio-600);">
                                Tutti i task di sviluppo e gestione
                            </p>
                        </div>
                        ${AuthService.hasPermission('manage_dev_tasks') ? `
                            <button class="btn btn-primary" onclick="GestioneTask.showNewTaskForm()">
                                <i class="fas fa-plus"></i> Nuovo Task
                            </button>
                        ` : ''}
                    </div>
                </div>

                <!-- Filtri -->
                ${this.renderFiltri()}

                <!-- Statistiche rapide -->
                ${this.renderStatistiche()}

                <!-- Kanban Board -->
                ${this.renderKanbanBoard()}
            `;

            UI.hideLoading();

            // Controlla se bisogna aprire il modal di creazione task (da DettaglioApp)
            const newTaskAppId = sessionStorage.getItem('newTaskAppId');
            if (newTaskAppId) {
                // Rimuovi da sessionStorage
                const appNome = sessionStorage.getItem('newTaskAppNome');
                sessionStorage.removeItem('newTaskAppId');
                sessionStorage.removeItem('newTaskAppNome');

                // Apri modal con app pre-selezionata
                setTimeout(() => {
                    this.showNewTaskForm(newTaskAppId);
                }, 300);
            }
        } catch (error) {
            console.error('Errore caricamento task:', error);
            UI.hideLoading();
            UI.showError('Errore nel caricamento dei task');
        }
    },

    renderFiltri() {
        return `
            <div class="card mb-3">
                <div class="card-body" style="padding: 1rem;">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                        <!-- Filtro App -->
                        <div>
                            <label style="display: block; font-size: 0.875rem; font-weight: 600; color: var(--grigio-700); margin-bottom: 0.5rem;">
                                <i class="fas fa-mobile-alt"></i> App
                            </label>
                            <select id="filtroApp" onchange="GestioneTask.applicaFiltri()"
                                    style="width: 100%; padding: 0.5rem; border: 1px solid var(--grigio-300); border-radius: 4px;">
                                <option value="">Tutte le app</option>
                                <option value="__generic__">Task generici (senza app)</option>
                                ${this.apps.map(app => `
                                    <option value="${app.id}">${app.nome}</option>
                                `).join('')}
                            </select>
                        </div>

                        <!-- Filtro Assegnatario -->
                        <div>
                            <label style="display: block; font-size: 0.875rem; font-weight: 600; color: var(--grigio-700); margin-bottom: 0.5rem;">
                                <i class="fas fa-user"></i> Assegnato a
                            </label>
                            <select id="filtroAssegnatario" onchange="GestioneTask.applicaFiltri()"
                                    style="width: 100%; padding: 0.5rem; border: 1px solid var(--grigio-300); border-radius: 4px;">
                                <option value="">Tutti gli utenti</option>
                                <option value="__unassigned__">Non assegnati</option>
                                ${this.utenti.map(u => `
                                    <option value="${u.uid}">${u.nome} ${u.cognome}</option>
                                `).join('')}
                            </select>
                        </div>

                        <!-- Filtro Priorità -->
                        <div>
                            <label style="display: block; font-size: 0.875rem; font-weight: 600; color: var(--grigio-700); margin-bottom: 0.5rem;">
                                <i class="fas fa-flag"></i> Priorità
                            </label>
                            <select id="filtroPriorita" onchange="GestioneTask.applicaFiltri()"
                                    style="width: 100%; padding: 0.5rem; border: 1px solid var(--grigio-300); border-radius: 4px;">
                                <option value="">Tutte le priorità</option>
                                <option value="URGENTE">Urgente</option>
                                <option value="ALTA">Alta</option>
                                <option value="MEDIA">Media</option>
                                <option value="BASSA">Bassa</option>
                            </select>
                        </div>

                        <!-- Pulsante Reset -->
                        <div style="display: flex; align-items: flex-end;">
                            <button class="btn btn-secondary" onclick="GestioneTask.resetFiltri()"
                                    style="width: 100%; padding: 0.5rem;">
                                <i class="fas fa-undo"></i> Reset Filtri
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderStatistiche() {
        const tasksFiltered = this.getTasksFiltrati();
        const todoCount = tasksFiltered.filter(t => t.stato === TaskService.STATI.TODO).length;
        const inProgressCount = tasksFiltered.filter(t => t.stato === TaskService.STATI.IN_PROGRESS).length;
        const doneCount = tasksFiltered.filter(t => t.stato === TaskService.STATI.DONE).length;
        const scadutiCount = tasksFiltered.filter(t => TaskService.isScaduto(t)).length;

        return `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
                ${this.renderStatCard('TODO', todoCount, 'circle', 'blu-700')}
                ${this.renderStatCard('IN PROGRESS', inProgressCount, 'spinner', 'giallo-avviso')}
                ${this.renderStatCard('DONE', doneCount, 'check-circle', 'verde-700')}
                ${scadutiCount > 0 ? this.renderStatCard('SCADUTI', scadutiCount, 'exclamation-triangle', 'rosso-errore') : ''}
            </div>
        `;
    },

    renderStatCard(label, count, icon, color) {
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

    renderKanbanBoard() {
        const tasksFiltered = this.getTasksFiltrati();
        const todoTasks = tasksFiltered.filter(t => t.stato === TaskService.STATI.TODO);
        const inProgressTasks = tasksFiltered.filter(t => t.stato === TaskService.STATI.IN_PROGRESS);
        const doneTasks = tasksFiltered.filter(t => t.stato === TaskService.STATI.DONE);

        return `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem;">
                ${this.renderTaskColumn('TODO', todoTasks, 'blu-700')}
                ${this.renderTaskColumn('IN_PROGRESS', inProgressTasks, 'giallo-avviso')}
                ${this.renderTaskColumn('DONE', doneTasks, 'verde-700')}
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
                <div style="background: var(--grigio-100); min-height: 500px; padding: 1rem; border-radius: 0 0 8px 8px; max-height: 70vh; overflow-y: auto;">
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

        // Trova nomi app collegate
        const appNames = task.appIds && task.appIds.length > 0
            ? task.appIds.map(appId => {
                const app = this.apps.find(a => a.id === appId);
                return app ? app.nome : 'App sconosciuta';
            })
            : ['Task generico'];

        return `
            <div class="task-card" style="background: white; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-left: 4px solid ${priorityConfig.bg}; cursor: pointer;"
                 onclick="GestioneTask.viewTaskDetails('${task.id}')">

                <!-- Titolo e Priorità -->
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.75rem;">
                    <h4 style="font-size: 1rem; font-weight: 700; color: var(--grigio-900); flex: 1; margin-right: 0.5rem;">
                        ${task.titolo}
                    </h4>
                    <span style="background: ${priorityConfig.bg}; color: ${priorityConfig.text}; padding: 0.125rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; white-space: nowrap;">
                        ${task.priorita}
                    </span>
                </div>

                <!-- App collegate -->
                <div style="display: flex; flex-wrap: wrap; gap: 0.25rem; margin-bottom: 0.75rem;">
                    ${appNames.map(nome => `
                        <span style="background: var(--blu-100); color: var(--blu-700); padding: 0.125rem 0.5rem; border-radius: 4px; font-size: 0.75rem;">
                            <i class="fas fa-mobile-alt"></i> ${nome}
                        </span>
                    `).join('')}
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
                        <span>Creato ${TaskService.formatDate(task.creatoIl)}</span>
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
        const currentUserId = AuthService.getUserId();
        const assegnatiA = task.assegnatiA || [];
        const isAssigned = assegnatiA.includes(currentUserId);

        // Pulsante "Prendi in carico" se NON sei assegnato
        if (canView && !isAssigned && currentStato !== TaskService.STATI.DONE) {
            actions.push(`
                <button class="btn btn-sm" style="background: var(--verde-500); color: white; border: none; padding: 0.25rem 0.75rem; font-size: 0.75rem;"
                        onclick="event.stopPropagation(); GestioneTask.takeTask('${task.id}')">
                    <i class="fas fa-hand-paper"></i> Prendi in carico
                </button>
            `);
        }

        // Cambio stato (solo se assegnato o canManage)
        if ((isAssigned || canManage) && currentStato !== TaskService.STATI.DONE) {
            if (currentStato === TaskService.STATI.TODO) {
                actions.push(`
                    <button class="btn btn-sm" style="background: #FFCC00; color: #333; border: none; padding: 0.25rem 0.75rem; font-size: 0.75rem;"
                            onclick="event.stopPropagation(); GestioneTask.changeTaskState('${task.id}', '${TaskService.STATI.IN_PROGRESS}')">
                        <i class="fas fa-play"></i> Inizia
                    </button>
                `);
            } else if (currentStato === TaskService.STATI.IN_PROGRESS) {
                actions.push(`
                    <button class="btn btn-sm" style="background: var(--verde-700); color: white; border: none; padding: 0.25rem 0.75rem; font-size: 0.75rem;"
                            onclick="event.stopPropagation(); GestioneTask.changeTaskState('${task.id}', '${TaskService.STATI.DONE}')">
                        <i class="fas fa-check"></i> Completa
                    </button>
                `);
                actions.push(`
                    <button class="btn btn-sm" style="background: var(--grigio-500); color: white; border: none; padding: 0.25rem 0.75rem; font-size: 0.75rem;"
                            onclick="event.stopPropagation(); GestioneTask.changeTaskState('${task.id}', '${TaskService.STATI.TODO}')">
                        <i class="fas fa-pause"></i> Pausa
                    </button>
                `);
            }
        }

        // Pulsante "Riassegna" (solo per chi può gestire)
        if (canManage) {
            actions.push(`
                <button class="btn btn-sm" style="background: var(--blu-500); color: white; border: none; padding: 0.25rem 0.75rem; font-size: 0.75rem;"
                        onclick="event.stopPropagation(); GestioneTask.showReassignModal('${task.id}')">
                    <i class="fas fa-user-edit"></i> Riassegna
                </button>
            `);
        }

        return actions.length > 0 ? `
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; padding-top: 0.5rem; border-top: 1px solid var(--grigio-300);">
                ${actions.join('')}
            </div>
        ` : '';
    },

    // Carica lista utenti per filtro
    async loadUtenti() {
        try {
            const snapshot = await db.collection('utenti')
                .where('stato', '==', 'ATTIVO')
                .get();

            const utenti = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                utenti.push({
                    uid: doc.id,
                    nome: data.nome,
                    cognome: data.cognome,
                    email: data.email
                });
            });

            return utenti;
        } catch (error) {
            console.error('Errore caricamento utenti:', error);
            return [];
        }
    },

    // Applica filtri
    applicaFiltri() {
        this.filtri.appId = document.getElementById('filtroApp').value || null;
        this.filtri.assegnatoA = document.getElementById('filtroAssegnatario').value || null;
        this.filtri.priorita = document.getElementById('filtroPriorita').value || null;

        // Ricarica solo la sezione task
        this.reloadTasks();
    },

    resetFiltri() {
        this.filtri = { appId: null, assegnatoA: null, priorita: null };
        document.getElementById('filtroApp').value = '';
        document.getElementById('filtroAssegnatario').value = '';
        document.getElementById('filtroPriorita').value = '';
        this.reloadTasks();
    },

    getTasksFiltrati() {
        let filtered = [...this.tasks];

        // Filtro App
        if (this.filtri.appId) {
            if (this.filtri.appId === '__generic__') {
                // Task generici (senza app)
                filtered = filtered.filter(t => !t.appIds || t.appIds.length === 0);
            } else {
                // Task con questa app
                filtered = filtered.filter(t => t.appIds && t.appIds.includes(this.filtri.appId));
            }
        }

        // Filtro Assegnatario
        if (this.filtri.assegnatoA) {
            if (this.filtri.assegnatoA === '__unassigned__') {
                filtered = filtered.filter(t => !t.assegnatoA);
            } else {
                filtered = filtered.filter(t => t.assegnatoA === this.filtri.assegnatoA);
            }
        }

        // Filtro Priorità
        if (this.filtri.priorita) {
            filtered = filtered.filter(t => t.priorita === this.filtri.priorita);
        }

        return filtered;
    },

    async reloadTasks() {
        const statistiche = document.querySelector('.page-header').nextElementSibling.nextElementSibling;
        const kanban = statistiche.nextElementSibling;

        statistiche.outerHTML = this.renderStatistiche();
        kanban.outerHTML = this.renderKanbanBoard();
    },

    async changeTaskState(taskId, newState) {
        UI.showLoading();

        try {
            const result = await TaskService.cambiaStato(taskId, newState);

            if (result.success) {
                UI.showSuccess('Stato task aggiornato');
                // Ricarica tutti i task
                await this.render();
            } else {
                UI.showError('Errore aggiornamento stato: ' + result.error);
                UI.hideLoading();
            }
        } catch (error) {
            console.error('Errore cambio stato task:', error);
            UI.showError('Errore aggiornamento stato');
            UI.hideLoading();
        }
    },

    showNewTaskForm(preSelectedAppId = null) {
        // Crea modal con form
        const modalHtml = `
            <div id="taskModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center;">
                <div style="background: white; border-radius: 12px; width: 90%; max-width: 600px; max-height: 90vh; overflow-y: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                    <!-- Header -->
                    <div style="padding: 1.5rem; border-bottom: 2px solid var(--grigio-300); display: flex; justify-content: space-between; align-items: center;">
                        <h2 style="font-size: 1.5rem; font-weight: 700; color: var(--blu-700); margin: 0;">
                            <i class="fas fa-plus-circle"></i> Nuovo Task
                        </h2>
                        <button onclick="GestioneTask.closeModal()" style="background: none; border: none; font-size: 1.5rem; color: var(--grigio-600); cursor: pointer;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <!-- Form -->
                    <form id="newTaskForm" style="padding: 1.5rem;">
                        <!-- Titolo -->
                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: block; font-weight: 600; color: var(--grigio-900); margin-bottom: 0.5rem;">
                                Titolo <span style="color: var(--rosso-errore);">*</span>
                            </label>
                            <input type="text" id="taskTitolo" required
                                   placeholder="Es: Implementare login social"
                                   style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 6px; font-size: 1rem;">
                        </div>

                        <!-- Descrizione -->
                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: block; font-weight: 600; color: var(--grigio-900); margin-bottom: 0.5rem;">
                                Descrizione
                            </label>
                            <textarea id="taskDescrizione" rows="3"
                                      placeholder="Descrizione dettagliata del task..."
                                      style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 6px; font-size: 1rem; resize: vertical;"></textarea>
                        </div>

                        <!-- App Collegate (Select Multiplo) -->
                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: block; font-weight: 600; color: var(--grigio-900); margin-bottom: 0.5rem;">
                                App Collegate
                            </label>
                            <select id="taskApps" multiple size="5"
                                    style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 6px;">
                                <option value="">-- Nessuna app (task generico) --</option>
                                ${this.apps.map(app => `
                                    <option value="${app.id}" ${app.id === preSelectedAppId ? 'selected' : ''}>${app.nome}</option>
                                `).join('')}
                            </select>
                            <small style="color: var(--grigio-600); font-size: 0.875rem;">
                                Tieni premuto CTRL (CMD su Mac) per selezionare più app. Lascia vuoto per task generico.
                            </small>
                        </div>

                        <!-- Priorità -->
                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: block; font-weight: 600; color: var(--grigio-900); margin-bottom: 0.5rem;">
                                Priorità
                            </label>
                            <select id="taskPriorita"
                                    style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 6px;">
                                <option value="BASSA">Bassa</option>
                                <option value="MEDIA" selected>Media</option>
                                <option value="ALTA">Alta</option>
                                <option value="URGENTE">Urgente</option>
                            </select>
                        </div>

                        <!-- Assegna a (Select Multiplo per TEAM) -->
                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: block; font-weight: 600; color: var(--grigio-900); margin-bottom: 0.5rem;">
                                Assegna a (multiplo per task di team)
                            </label>
                            <select id="taskAssegnati" multiple size="5"
                                    style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 6px;">
                                <option value="">-- Nessuno (task pool) --</option>
                                ${this.utenti.map(u => `
                                    <option value="${u.uid}" data-nome="${u.nome} ${u.cognome}">${u.nome} ${u.cognome}</option>
                                `).join('')}
                            </select>
                            <small style="color: var(--grigio-600); font-size: 0.875rem;">
                                Tieni premuto CTRL (CMD su Mac) per assegnare a più persone. Lascia vuoto per task pool.
                            </small>
                        </div>

                        <!-- Scadenza -->
                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: block; font-weight: 600; color: var(--grigio-900); margin-bottom: 0.5rem;">
                                Scadenza
                            </label>
                            <input type="date" id="taskScadenza"
                                   style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 6px;">
                        </div>

                        <!-- Note -->
                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: block; font-weight: 600; color: var(--grigio-900); margin-bottom: 0.5rem;">
                                Note
                            </label>
                            <textarea id="taskNote" rows="2"
                                      placeholder="Note aggiuntive..."
                                      style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 6px; font-size: 1rem; resize: vertical;"></textarea>
                        </div>

                        <!-- Pulsanti -->
                        <div style="display: flex; gap: 1rem; justify-content: flex-end; padding-top: 1rem; border-top: 1px solid var(--grigio-300);">
                            <button type="button" onclick="GestioneTask.closeModal()" class="btn btn-secondary">
                                <i class="fas fa-times"></i> Annulla
                            </button>
                            <button type="submit" class="btn btn-primary">
                                <i class="fas fa-check"></i> Crea Task
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        // Aggiungi modal al DOM
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Event listener per submit
        document.getElementById('newTaskForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.createTask();
        });

        // Chiudi modal cliccando fuori
        document.getElementById('taskModal').addEventListener('click', (e) => {
            if (e.target.id === 'taskModal') {
                this.closeModal();
            }
        });
    },

    closeModal() {
        const modal = document.getElementById('taskModal');
        if (modal) {
            modal.remove();
        }
    },

    async createTask() {
        UI.showLoading();

        try {
            // Raccogli dati dal form
            const titolo = document.getElementById('taskTitolo').value.trim();
            const descrizione = document.getElementById('taskDescrizione').value.trim();

            // App selezionate (multiplo)
            const selectApps = document.getElementById('taskApps');
            const appIds = Array.from(selectApps.selectedOptions)
                .map(opt => opt.value)
                .filter(val => val !== ''); // Rimuovi opzione vuota

            const priorita = document.getElementById('taskPriorita').value;

            // Assegnati (multiplo)
            const selectAssegnati = document.getElementById('taskAssegnati');
            const assegnatiData = Array.from(selectAssegnati.selectedOptions)
                .filter(opt => opt.value !== '') // Rimuovi opzione vuota
                .map(opt => ({
                    uid: opt.value,
                    nome: opt.dataset.nome
                }));

            const assegnatiA = assegnatiData.map(u => u.uid);
            const assegnatiANomi = assegnatiData.map(u => u.nome);

            const scadenzaInput = document.getElementById('taskScadenza').value;
            const note = document.getElementById('taskNote').value.trim();

            // Validazione
            if (!titolo) {
                UI.showError('Il titolo è obbligatorio');
                UI.hideLoading();
                return;
            }

            // Converti scadenza in Timestamp
            let scadenza = null;
            if (scadenzaInput) {
                scadenza = firebase.firestore.Timestamp.fromDate(new Date(scadenzaInput + 'T23:59:59'));
            }

            // Crea task
            const taskData = {
                appIds: appIds,
                titolo: titolo,
                descrizione: descrizione,
                priorita: priorita,
                assegnatiA: assegnatiA,
                assegnatiANomi: assegnatiANomi,
                scadenza: scadenza,
                note: note
            };

            const result = await TaskService.createTask(taskData);

            if (result.success) {
                UI.showSuccess('Task creato con successo!');
                this.closeModal();
                // Ricarica pagina
                await this.render();
            } else {
                UI.showError('Errore creazione task: ' + result.error);
                UI.hideLoading();
            }
        } catch (error) {
            console.error('Errore creazione task:', error);
            UI.showError('Errore creazione task');
            UI.hideLoading();
        }
    },

    async viewTaskDetails(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) {
            UI.showError('Task non trovato');
            return;
        }

        const stateConfig = TaskService.STATO_COLORS[task.stato];
        const priorityConfig = TaskService.PRIORITA_COLORS[task.priorita];
        const isOverdue = TaskService.isScaduto(task);
        const isDueSoon = TaskService.isInScadenza(task);

        // Trova nomi app collegat
e
        const appsNomi = (task.appIds || []).map(appId => {
            const app = this.apps.find(a => a.id === appId);
            return app ? app.nome : 'App sconosciuta';
        });

        const modalHtml = `
            <div id="taskDetailModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center; overflow-y: auto;">
                <div style="background: white; border-radius: 12px; width: 90%; max-width: 800px; max-height: 90vh; overflow-y: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.3); margin: 2rem;">
                    <!-- Header -->
                    <div style="padding: 1.5rem; border-bottom: 2px solid var(--grigio-300); display: flex; justify-content: space-between; align-items: start; position: sticky; top: 0; background: white; z-index: 1;">
                        <div style="flex: 1;">
                            <h2 style="font-size: 1.5rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.75rem;">
                                <i class="fas fa-tasks"></i> ${task.titolo}
                            </h2>
                            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                <span style="background: ${stateConfig.bg}; color: ${stateConfig.text}; padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.875rem; font-weight: 600;">
                                    <i class="${stateConfig.icon}"></i> ${task.stato.replace('_', ' ')}
                                </span>
                                <span style="background: ${priorityConfig.bg}; color: ${priorityConfig.text}; padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.875rem; font-weight: 600;">
                                    ${task.priorita}
                                </span>
                                ${isOverdue ? '<span style="background: var(--rosso-errore); color: white; padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.875rem; font-weight: 600;"><i class="fas fa-exclamation-triangle"></i> SCADUTO</span>' : ''}
                                ${isDueSoon && !isOverdue ? '<span style="background: var(--giallo-avviso); color: #333; padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.875rem; font-weight: 600;"><i class="fas fa-clock"></i> IN SCADENZA</span>' : ''}
                            </div>
                        </div>
                        <button onclick="document.getElementById('taskDetailModal').remove()" style="background: none; border: none; font-size: 1.5rem; color: var(--grigio-600); cursor: pointer; padding: 0; margin-left: 1rem;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <!-- Body -->
                    <div style="padding: 1.5rem;">
                        <!-- Descrizione -->
                        ${task.descrizione ? `
                            <div style="margin-bottom: 1.5rem;">
                                <h3 style="font-size: 1.125rem; font-weight: 700; color: var(--grigio-900); margin-bottom: 0.5rem;">
                                    <i class="fas fa-align-left"></i> Descrizione
                                </h3>
                                <p style="color: var(--grigio-700); line-height: 1.6; white-space: pre-wrap;">${task.descrizione}</p>
                            </div>
                        ` : ''}

                        <!-- Info Grid -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-bottom: 1.5rem;">
                            <!-- Assegnati -->
                            <div>
                                <h4 style="font-size: 0.875rem; font-weight: 700; color: var(--grigio-600); margin-bottom: 0.5rem; text-transform: uppercase;">
                                    <i class="fas fa-users"></i> Assegnato a
                                </h4>
                                <p style="color: var(--grigio-900);">
                                    ${(() => {
                                        const assegnati = task.assegnatiANomi || (task.assegnatoANome ? [task.assegnatoANome] : []);
                                        if (assegnati.length > 0) {
                                            return assegnati.join(', ');
                                        } else {
                                            return '<span style="color: var(--giallo-avviso);"><i class="fas fa-user-slash"></i> Non assegnato (pool)</span>';
                                        }
                                    })()}
                                </p>
                            </div>

                            <!-- Scadenza -->
                            ${task.scadenza ? `
                                <div>
                                    <h4 style="font-size: 0.875rem; font-weight: 700; color: var(--grigio-600); margin-bottom: 0.5rem; text-transform: uppercase;">
                                        <i class="fas fa-calendar"></i> Scadenza
                                    </h4>
                                    <p style="color: ${isOverdue ? 'var(--rosso-errore)' : isDueSoon ? 'var(--giallo-avviso)' : 'var(--grigio-900)'}; font-weight: ${isOverdue || isDueSoon ? '700' : '400'};">
                                        ${TaskService.formatDate(task.scadenza)}
                                        ${isOverdue ? ' <i class="fas fa-exclamation-triangle"></i>' : ''}
                                    </p>
                                </div>
                            ` : ''}

                            <!-- App Collegate -->
                            ${appsNomi.length > 0 ? `
                                <div>
                                    <h4 style="font-size: 0.875rem; font-weight: 700; color: var(--grigio-600); margin-bottom: 0.5rem; text-transform: uppercase;">
                                        <i class="fas fa-mobile-alt"></i> App
                                    </h4>
                                    <p style="color: var(--grigio-900);">
                                        ${appsNomi.join(', ')}
                                    </p>
                                </div>
                            ` : '<div></div>'}

                            <!-- Creato -->
                            <div>
                                <h4 style="font-size: 0.875rem; font-weight: 700; color: var(--grigio-600); margin-bottom: 0.5rem; text-transform: uppercase;">
                                    <i class="fas fa-user-plus"></i> Creato
                                </h4>
                                <p style="color: var(--grigio-900);">
                                    ${task.creatoDaNome || 'Sconosciuto'}<br>
                                    <small style="color: var(--grigio-600);">${TaskService.formatDateTime(task.creatoIl)}</small>
                                </p>
                            </div>

                            <!-- Completato -->
                            ${task.stato === TaskService.STATI.DONE && task.completatoIl ? `
                                <div>
                                    <h4 style="font-size: 0.875rem; font-weight: 700; color: var(--grigio-600); margin-bottom: 0.5rem; text-transform: uppercase;">
                                        <i class="fas fa-check-circle"></i> Completato
                                    </h4>
                                    <p style="color: var(--grigio-900);">
                                        <small style="color: var(--grigio-600);">${TaskService.formatDateTime(task.completatoIl)}</small>
                                    </p>
                                </div>
                            ` : ''}
                        </div>

                        <!-- Note -->
                        ${task.note ? `
                            <div style="margin-bottom: 1.5rem;">
                                <h3 style="font-size: 1.125rem; font-weight: 700; color: var(--grigio-900); margin-bottom: 0.5rem;">
                                    <i class="fas fa-sticky-note"></i> Note
                                </h3>
                                <p style="color: var(--grigio-700); line-height: 1.6; white-space: pre-wrap;">${task.note}</p>
                            </div>
                        ` : ''}

                        <!-- Storia -->
                        ${task.storia && task.storia.length > 0 ? `
                            <div>
                                <h3 style="font-size: 1.125rem; font-weight: 700; color: var(--grigio-900); margin-bottom: 1rem;">
                                    <i class="fas fa-history"></i> Storia Modifiche
                                </h3>
                                <div style="border-left: 3px solid var(--blu-300); padding-left: 1rem;">
                                    ${task.storia.slice().reverse().map(entry => `
                                        <div style="margin-bottom: 1rem;">
                                            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                                                <strong style="color: var(--blu-700);">${entry.utente}</strong>
                                                <span style="color: var(--grigio-600); font-size: 0.875rem;">
                                                    ${entry.azione}
                                                </span>
                                            </div>
                                            <p style="color: var(--grigio-700); font-size: 0.875rem; margin-bottom: 0.25rem;">
                                                ${entry.dettagli}
                                            </p>
                                            <small style="color: var(--grigio-500); font-size: 0.75rem;">
                                                ${entry.timestamp ? TaskService.formatDateTime(entry.timestamp) : 'Data sconosciuta'}
                                            </small>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>

                    <!-- Footer con azioni -->
                    <div style="padding: 1.5rem; border-top: 1px solid var(--grigio-300); display: flex; justify-content: flex-end; gap: 0.5rem; background: var(--grigio-100);">
                        <button onclick="document.getElementById('taskDetailModal').remove()" class="btn btn-secondary">
                            <i class="fas fa-times"></i> Chiudi
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Chiudi cliccando fuori
        document.getElementById('taskDetailModal').addEventListener('click', (e) => {
            if (e.target.id === 'taskDetailModal') {
                document.getElementById('taskDetailModal').remove();
            }
        });
    },

    async takeTask(taskId) {
        if (!confirm('Vuoi prendere in carico questo task?')) return;

        UI.showLoading();

        try {
            const result = await TaskService.takeTask(taskId);

            if (result.success) {
                UI.showSuccess('Task preso in carico!');
                await this.render();
            } else {
                UI.showError('Errore: ' + result.error);
                UI.hideLoading();
            }
        } catch (error) {
            console.error('Errore prendere task:', error);
            UI.showError('Errore nel prendere il task');
            UI.hideLoading();
        }
    },

    showReassignModal(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        const currentAssegnati = task.assegnatiA || [];

        const modalHtml = `
            <div id="reassignModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center;">
                <div style="background: white; border-radius: 12px; width: 90%; max-width: 500px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                    <div style="padding: 1.5rem; border-bottom: 2px solid var(--grigio-300); display: flex; justify-content: space-between; align-items: center;">
                        <h2 style="font-size: 1.25rem; font-weight: 700; color: var(--blu-700); margin: 0;">
                            <i class="fas fa-user-edit"></i> Riassegna Task
                        </h2>
                        <button onclick="document.getElementById('reassignModal').remove()" style="background: none; border: none; font-size: 1.5rem; color: var(--grigio-600); cursor: pointer;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <form id="reassignForm" style="padding: 1.5rem;">
                        <p style="margin-bottom: 1rem; color: var(--grigio-700);">
                            <strong>${task.titolo}</strong>
                        </p>
                        <label style="display: block; font-weight: 600; color: var(--grigio-900); margin-bottom: 0.5rem;">
                            Assegna a:
                        </label>
                        <select id="reassignUsers" multiple size="7"
                                style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 6px; margin-bottom: 1rem;">
                            <option value="">-- Nessuno (rimuovi tutti) --</option>
                            ${this.utenti.map(u => `
                                <option value="${u.uid}" ${currentAssegnati.includes(u.uid) ? 'selected' : ''} data-nome="${u.nome} ${u.cognome}">
                                    ${u.nome} ${u.cognome}
                                </option>
                            `).join('')}
                        </select>
                        <small style="color: var(--grigio-600); font-size: 0.875rem; display: block; margin-bottom: 1rem;">
                            CTRL/CMD per selezione multipla
                        </small>
                        <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                            <button type="button" onclick="document.getElementById('reassignModal').remove()" class="btn btn-secondary">
                                Annulla
                            </button>
                            <button type="submit" class="btn btn-primary">
                                <i class="fas fa-check"></i> Salva
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('reassignForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.reassignTask(taskId);
        });
    },

    async reassignTask(taskId) {
        UI.showLoading();

        try {
            const select = document.getElementById('reassignUsers');
            const selectedData = Array.from(select.selectedOptions)
                .filter(opt => opt.value !== '')
                .map(opt => ({
                    uid: opt.value,
                    nome: opt.dataset.nome
                }));

            const userIds = selectedData.map(u => u.uid);
            const userNames = selectedData.map(u => u.nome);

            const result = await TaskService.reassignTask(taskId, userIds, userNames);

            if (result.success) {
                UI.showSuccess('Task riassegnato!');
                document.getElementById('reassignModal').remove();
                await this.render();
            } else {
                UI.showError('Errore: ' + result.error);
                UI.hideLoading();
            }
        } catch (error) {
            console.error('Errore riassegnazione:', error);
            UI.showError('Errore riassegnazione task');
            UI.hideLoading();
        }
    }
};

// Gestione Task - Pagina Globale
const GestioneTask = {
    tasks: [],
    apps: [],
    utenti: [],
    commentsCounts: {}, // Mappa taskId -> numero commenti
    filtri: {
        appId: null,
        assegnatoA: null,
        priorita: null
    },

    async render() {
        UI.showLoading();
        this._permDebugLogged = false; // Reset debug flag per nuovo render

        try {
            // Carica dati in parallelo
            const [tasksResult, apps, utenti] = await Promise.all([
                TaskService.getAllTasks(),
                DataService.getApps(),
                this.loadUtenti()
            ]);

            let allTasks = tasksResult.success ? tasksResult.tasks : [];

            // Filtro visibilità task per ruolo:
            // Admin e CTO vedono tutti i task, gli altri vedono solo quelli assegnati a loro o creati da loro
            const canSeeAllTasks = AuthService.isAdmin() || AuthService.isCTO();
            if (!canSeeAllTasks) {
                const currentUserId = AuthService.getUserId();
                allTasks = allTasks.filter(task => {
                    // Task creato dall'utente corrente
                    if (task.creatoDa === currentUserId) return true;
                    // Task assegnato all'utente corrente
                    if (task.assegnatiA && Array.isArray(task.assegnatiA) && task.assegnatiA.includes(currentUserId)) return true;
                    return false;
                });
            }

            this.tasks = allTasks;
            this.apps = apps;
            this.utenti = utenti;

            // Carica conteggi commenti per tutti i task
            await this.loadAllCommentsCounts();

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
                    <!-- Campo Ricerca Testuale -->
                    <div style="margin-bottom: 1rem;">
                        <div style="position: relative;">
                            <i class="fas fa-search" style="
                                position: absolute;
                                left: 1rem;
                                top: 50%;
                                transform: translateY(-50%);
                                color: var(--grigio-500);
                            "></i>
                            <input
                                type="text"
                                id="searchTask"
                                placeholder="🔍 Cerca task per titolo o descrizione..."
                                onkeyup="GestioneTask.applicaFiltri()"
                                style="
                                    width: 100%;
                                    padding: 0.75rem 1rem 0.75rem 2.5rem;
                                    border: 2px solid var(--grigio-300);
                                    border-radius: 8px;
                                    font-family: 'Titillium Web', sans-serif;
                                    font-size: 1rem;
                                    transition: all 0.2s;
                                "
                                onfocus="this.style.borderColor='var(--blu-500)'"
                                onblur="this.style.borderColor='var(--grigio-300)'"
                            >
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 1rem;">
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

                        <!-- 🗄️ Checkbox Archiviati -->
                        <div style="display: flex; align-items: flex-end;">
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.5rem; background: var(--grigio-100); border-radius: 4px; width: 100%;">
                                <input type="checkbox" id="mostraArchiviati" onchange="GestioneTask.applicaFiltri()"
                                       style="width: 18px; height: 18px; cursor: pointer;">
                                <span style="font-size: 0.875rem; font-weight: 600; color: var(--grigio-700);">
                                    <i class="fas fa-archive"></i> Mostra archiviati
                                </span>
                            </label>
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
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 1rem; margin-bottom: 2rem;">
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
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 1.5rem;">
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

        // Nomi assegnati
        const assegnati = task.assegnatiANomi || (task.assegnatoANome ? [task.assegnatoANome] : []);
        const commentsCount = this.commentsCounts[task.id] || 0;

        return `
            <div class="task-card" style="background: white; border-radius: 10px; padding: 0; margin-bottom: 0.75rem; box-shadow: 0 1px 4px rgba(0,0,0,0.08); border-left: 4px solid ${priorityConfig.bg}; cursor: pointer; overflow: hidden; transition: box-shadow 0.2s;"
                 onclick="GestioneTask.viewTaskDetails('${task.id}')"
                 onmouseover="this.style.boxShadow='0 3px 12px rgba(0,0,0,0.14)'"
                 onmouseout="this.style.boxShadow='0 1px 4px rgba(0,0,0,0.08)'">

                <!-- Contenuto principale -->
                <div style="padding: 0.875rem 1rem 0.75rem;">
                    <!-- Riga 1: Titolo + Priorità -->
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                        <h4 style="font-size: 0.9375rem; font-weight: 700; color: var(--grigio-900); flex: 1; margin-right: 0.5rem; line-height: 1.3;">
                            ${task.titolo}
                        </h4>
                        <span style="background: ${priorityConfig.bg}; color: ${priorityConfig.text}; padding: 2px 8px; border-radius: 4px; font-size: 0.6875rem; font-weight: 700; white-space: nowrap; text-transform: uppercase; letter-spacing: 0.3px;">
                            ${task.priorita}
                        </span>
                    </div>

                    <!-- Riga 2: App -->
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 0.625rem;">
                        ${appNames.map(nome => `
                            <span style="background: var(--blu-100); color: var(--blu-700); padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">
                                <i class="fas fa-mobile-alt" style="font-size: 0.625rem;"></i> ${nome}
                            </span>
                        `).join('')}
                    </div>

                    <!-- Riga 3: Descrizione -->
                    ${task.descrizione ? `
                        <p style="color: var(--grigio-600); font-size: 0.8125rem; margin-bottom: 0.625rem; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                            ${task.descrizione}
                        </p>
                    ` : ''}

                    <!-- Riga 4: Aperto da / Assegnato a -->
                    <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 0.625rem;">
                        <!-- Aperto da -->
                        <div style="display: flex; align-items: center; gap: 6px; font-size: 0.8125rem;">
                            <span style="color: var(--grigio-500); min-width: 70px; font-weight: 600;">
                                <i class="fas fa-user-edit" style="width: 14px;"></i> Aperto da
                            </span>
                            <span style="color: var(--grigio-800); font-weight: 600;">${task.creatoDaNome || 'Sconosciuto'}</span>
                        </div>
                        <!-- Assegnato a -->
                        <div style="display: flex; align-items: center; gap: 6px; font-size: 0.8125rem;">
                            <span style="color: var(--grigio-500); min-width: 70px; font-weight: 600;">
                                <i class="fas fa-user-check" style="width: 14px;"></i> Assegnato
                            </span>
                            ${assegnati.length > 0 ? `
                                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                                    ${assegnati.map(nome => `
                                        <span style="background: var(--verde-100); color: var(--verde-900); padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">
                                            ${nome}
                                        </span>
                                    `).join('')}
                                </div>
                            ` : `
                                <span style="background: var(--giallo-avviso); color: var(--grigio-900); padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">
                                    <i class="fas fa-user-slash" style="font-size: 0.625rem;"></i> Pool
                                </span>
                            `}
                        </div>
                    </div>

                    <!-- Riga 5: Date + Commenti -->
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; font-size: 0.75rem; color: var(--grigio-500);">
                        <div style="display: flex; gap: 10px; align-items: center;">
                            ${task.scadenza ? `
                                <span style="${isOverdue ? 'color:var(--rosso-errore);font-weight:700;' : isDueSoon ? 'color:var(--giallo-avviso);font-weight:700;' : ''}">
                                    <i class="fas fa-calendar-alt"></i> ${TaskService.formatDate(task.scadenza)}
                                    ${isOverdue ? ' <i class="fas fa-exclamation-triangle"></i>' : ''}
                                </span>
                            ` : ''}
                            <span><i class="fas fa-clock"></i> ${TaskService.formatDate(task.creatoIl)}</span>
                        </div>
                        <span style="display: inline-flex; align-items: center; gap: 4px; background: ${commentsCount > 0 ? 'var(--blu-100)' : 'var(--grigio-100)'}; color: ${commentsCount > 0 ? 'var(--blu-700)' : 'var(--grigio-500)'}; padding: 3px 8px; border-radius: 4px; font-weight: 600; cursor: pointer;"
                              onclick="event.stopPropagation(); GestioneTask.viewTaskDetails('${task.id}'); setTimeout(() => GestioneTask.scrollToCommenti('${task.id}'), 600);">
                            <i class="fas fa-comments"></i> ${commentsCount}${commentsCount > 0 ? ' — Rispondi' : ' — Discuti'}
                        </span>
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

        // Tutti gli utenti autenticati possono almeno vedere i pulsanti base
        let actions = [];
        const currentUserId = AuthService.getUserId();
        const assegnatiA = task.assegnatiA || [];
        const isAssigned = assegnatiA.includes(currentUserId);

        // === PULSANTI BASE (tutti gli utenti che vedono il task) ===

        // "Prendi in carico" se NON sei già assegnato e task non completato
        if (!isAssigned && currentStato !== TaskService.STATI.DONE) {
            actions.push(`
                <button class="btn btn-sm" style="background: var(--verde-500); color: white; border: none; padding: 0.25rem 0.75rem; font-size: 0.75rem;"
                        onclick="event.stopPropagation(); GestioneTask.takeTask('${task.id}')">
                    <i class="fas fa-hand-paper"></i> Prendi in carico
                </button>
            `);
        }

        // Cambio stato: Inizia / Completa / Pausa (tutti possono se assegnati, canManage sempre)
        if (currentStato !== TaskService.STATI.DONE) {
            if (currentStato === TaskService.STATI.TODO) {
                if (isAssigned || canManage) {
                    actions.push(`
                        <button class="btn btn-sm" style="background: #FFCC00; color: #333; border: none; padding: 0.25rem 0.75rem; font-size: 0.75rem;"
                                onclick="event.stopPropagation(); GestioneTask.changeTaskState('${task.id}', '${TaskService.STATI.IN_PROGRESS}')">
                            <i class="fas fa-play"></i> Inizia
                        </button>
                    `);
                }
            } else if (currentStato === TaskService.STATI.IN_PROGRESS) {
                if (isAssigned || canManage) {
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
        }

        // === PULSANTI GESTIONE (canManage oppure canView per Riassegna) ===

        // "Riassegna" — disponibile per chi gestisce O per chi è assegnato (può riassegnare ad altri)
        if (canManage || isAssigned) {
            actions.push(`
                <button class="btn btn-sm" style="background: var(--blu-500); color: white; border: none; padding: 0.25rem 0.75rem; font-size: 0.75rem;"
                        onclick="event.stopPropagation(); GestioneTask.showReassignModal('${task.id}')">
                    <i class="fas fa-user-edit"></i> Riassegna
                </button>
            `);
        }

        // 📱 "Avvisa con Telegram" (task URGENTI - disponibile per tutti)
        if (task.priorita === TaskService.PRIORITA.URGENTE && !task.archiviato) {
            actions.push(`
                <button class="btn btn-sm" style="background: #0088cc; color: white; border: none; padding: 0.25rem 0.75rem; font-size: 0.75rem;"
                        onclick="event.stopPropagation(); GestioneTask.notifyTelegram('${task.id}')">
                    <i class="fab fa-telegram"></i> Avvisa con Telegram
                </button>
            `);
        }

        // === PULSANTI ADMIN (solo canManage) ===
        if (canManage) {
            if (task.archiviato) {
                actions.push(`
                    <button class="btn btn-sm" style="background: var(--verde-500); color: white; border: none; padding: 0.25rem 0.75rem; font-size: 0.75rem;"
                            onclick="event.stopPropagation(); GestioneTask.restoreTask('${task.id}')">
                        <i class="fas fa-undo"></i> Ripristina
                    </button>
                `);
            } else {
                actions.push(`
                    <button class="btn btn-sm" style="background: var(--grigio-500); color: white; border: none; padding: 0.25rem 0.75rem; font-size: 0.75rem;"
                            onclick="event.stopPropagation(); GestioneTask.archiveTask('${task.id}')">
                        <i class="fas fa-archive"></i> Archivia
                    </button>
                `);
            }

            actions.push(`
                <button class="btn btn-sm" style="background: var(--rosso-errore); color: white; border: none; padding: 0.25rem 0.75rem; font-size: 0.75rem;"
                        onclick="event.stopPropagation(); GestioneTask.deleteTask('${task.id}')">
                    <i class="fas fa-trash"></i> Elimina
                </button>
            `);
        }

        return actions.length > 0 ? `
            <div style="
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr));
                gap: 0.5rem;
                padding: 0.75rem 1rem;
                border-top: 1px solid var(--grigio-300);
                background: var(--grigio-100);
            ">
                ${actions.join('')}
            </div>
        ` : '';
    },

    // Carica lista utenti per filtro
    async loadUtenti() {
        try {
            // Carica TUTTI gli utenti (non filtrare per stato,
            // perché utenti senza campo 'stato' non apparirebbero)
            const snapshot = await db.collection('utenti').get();

            const utenti = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                // Escludi solo utenti esplicitamente DISATTIVATI
                if (data.stato === 'DISATTIVO') return;

                utenti.push({
                    uid: doc.id,
                    nome: data.nome || '',
                    cognome: data.cognome || '',
                    email: data.email || '',
                    ruolo: data.ruolo || ''
                });
            });

            // Ordina per nome
            utenti.sort((a, b) => {
                const nomeA = `${a.nome} ${a.cognome}`.toLowerCase();
                const nomeB = `${b.nome} ${b.cognome}`.toLowerCase();
                return nomeA.localeCompare(nomeB);
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
        this.filtri.mostraArchiviati = document.getElementById('mostraArchiviati').checked;
        this.filtri.searchText = document.getElementById('searchTask').value.toLowerCase().trim() || null;

        // Ricarica solo la sezione task
        this.reloadTasks();
    },

    resetFiltri() {
        this.filtri = { appId: null, assegnatoA: null, priorita: null, mostraArchiviati: false, searchText: null };
        document.getElementById('filtroApp').value = '';
        document.getElementById('filtroAssegnatario').value = '';
        document.getElementById('filtroPriorita').value = '';
        document.getElementById('mostraArchiviati').checked = false;
        document.getElementById('searchTask').value = '';
        this.reloadTasks();
    },

    getTasksFiltrati() {
        let filtered = [...this.tasks];

        // 🗄️ FILTRO ARCHIVIATI (nuovo!)
        if (!this.filtri.mostraArchiviati) {
            // Di default, nascondi i task archiviati
            filtered = filtered.filter(t => !t.archiviato);
        }
        // Se mostraArchiviati è true, mostra tutti (anche archiviati)

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
                // Task non assegnati: controllo se array è vuoto o non esiste
                filtered = filtered.filter(t => !t.assegnatiA || t.assegnatiA.length === 0);
            } else {
                // Task assegnati a un utente specifico: controllo se è nell'array
                filtered = filtered.filter(t => t.assegnatiA && t.assegnatiA.includes(this.filtri.assegnatoA));
            }
        }

        // Filtro Priorità
        if (this.filtri.priorita) {
            filtered = filtered.filter(t => t.priorita === this.filtri.priorita);
        }

        // 🔍 Filtro Ricerca Testuale
        if (this.filtri.searchText) {
            filtered = filtered.filter(t => {
                const searchableText = `${t.titolo} ${t.descrizione || ''}`.toLowerCase();
                return searchableText.includes(this.filtri.searchText);
            });
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
        // Reset stato commenti
        this.commentiCaricati = false;
        this.commentiAperti = false;

        const task = this.tasks.find(t => t.id === taskId);
        if (!task) {
            UI.showError('Task non trovato');
            return;
        }

        const stateConfig = TaskService.STATO_COLORS[task.stato];
        const priorityConfig = TaskService.PRIORITA_COLORS[task.priorita];
        const isOverdue = TaskService.isScaduto(task);
        const isDueSoon = TaskService.isInScadenza(task);

        // Trova nomi app collegate
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

                                <!-- Badge Discussione -->
                                <button
                                    onclick="event.stopPropagation(); GestioneTask.scrollToCommenti('${task.id}')"
                                    style="
                                        background: var(--verde-700);
                                        color: white;
                                        padding: 0.25rem 0.75rem;
                                        border-radius: 4px;
                                        font-size: 0.875rem;
                                        font-weight: 600;
                                        border: none;
                                        cursor: pointer;
                                        transition: all 0.2s;
                                    "
                                    onmouseover="this.style.background='var(--verde-500)'"
                                    onmouseout="this.style.background='var(--verde-700)'">
                                    <i class="fas fa-comments"></i> Discussione <span id="badgeCommentiCount">...</span>
                                </button>
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
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(250px, 100%), 1fr)); gap: 1.5rem; margin-bottom: 1.5rem;">
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

                        <!-- 💬 SEZIONE DISCUSSIONE -->
                        <div id="commentiSection" style="margin-top: 1.5rem; border-top: 2px solid var(--blu-300); padding-top: 1.25rem;">
                            <!-- Header con toggle -->
                            <div onclick="GestioneTask.toggleCommenti('${task.id}')"
                                 style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 0.75rem 1rem; background: var(--blu-700); border-radius: 8px; margin-bottom: 1rem;">
                                <h3 style="font-size: 1rem; font-weight: 700; color: #fff; margin: 0; display: flex; align-items: center; gap: 8px;">
                                    <i class="fas fa-comments"></i> Discussione
                                    <span id="commentiCount" style="background: rgba(255,255,255,0.25); color: #fff; padding: 2px 10px; border-radius: 12px; font-size: 0.8125rem;">
                                        ...
                                    </span>
                                </h3>
                                <i id="commentiToggleIcon" class="fas fa-chevron-up" style="color: #fff; transition: transform 0.3s;"></i>
                            </div>

                            <!-- Contenuto commenti (visibile di default) -->
                            <div id="commentiContent" style="display: block;">
                                <!-- Lista commenti -->
                                <div id="commentiList" style="margin-bottom: 1rem; max-height: 400px; overflow-y: auto;">
                                    <div style="text-align: center; padding: 2rem; color: var(--grigio-500);">
                                        <i class="fas fa-spinner fa-spin" style="font-size: 1.5rem;"></i>
                                        <p style="margin-top: 0.5rem; font-size: 0.875rem;">Caricamento...</p>
                                    </div>
                                </div>

                                <!-- Form nuovo commento — stile chat -->
                                <div style="background: var(--grigio-100); padding: 0.875rem; border-radius: 10px; border: 1px solid var(--grigio-300);">
                                    <textarea
                                        id="nuovoCommentoText"
                                        placeholder="Scrivi un messaggio nella discussione..."
                                        style="width: 100%; min-height: 60px; padding: 0.625rem 0.75rem; border: 2px solid var(--grigio-300); border-radius: 8px; font-family: 'Titillium Web', sans-serif; font-size: 0.875rem; resize: vertical; margin-bottom: 0.5rem; transition: border-color 0.2s;"
                                        onfocus="this.style.borderColor='var(--blu-500)'"
                                        onblur="this.style.borderColor='var(--grigio-300)'"
                                    ></textarea>

                                    <!-- Anteprima allegati selezionati -->
                                    <div id="anteprimaAllegati" style="display: none; margin-bottom: 0.75rem;"></div>

                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <!-- Pulsante allega file -->
                                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                                            <input
                                                type="file"
                                                id="commentoFileInput"
                                                multiple
                                                accept="image/*,.pdf,.doc,.docx"
                                                style="display: none;"
                                                onchange="GestioneTask.onFileSelezionati()"
                                            />
                                            <button
                                                type="button"
                                                onclick="document.getElementById('commentoFileInput').click()"
                                                class="btn btn-sm"
                                                style="background: var(--blu-100); color: var(--blu-700); border: 1px solid var(--blu-300); font-size: 0.8125rem;"
                                                title="Allega immagini, PDF o documenti">
                                                <i class="fas fa-paperclip"></i> Allega file
                                            </button>
                                            <span id="fileCountLabel" style="font-size: 0.75rem; color: var(--grigio-600);"></span>
                                        </div>

                                        <button
                                            onclick="GestioneTask.aggiungiCommento('${task.id}')"
                                            class="btn"
                                            style="background: var(--verde-700); color: white;">
                                            <i class="fas fa-paper-plane"></i> Invia
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
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

        // Carica conteggio commenti per il badge e i commenti stessi (sezione aperta di default)
        this.loadCommentiCount(taskId);
        this.commentiAperti = true;
        this.commentiCaricati = false;
        this.loadCommenti(taskId);

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
    },

    // 🗄️ ARCHIVIA TASK
    async archiveTask(taskId) {
        if (!confirm('Vuoi archiviare questo task?\n\nIl task verrà nascosto dalla vista principale ma rimarrà nel database e potrai ripristinarlo in qualsiasi momento.')) {
            return;
        }

        try {
            UI.showLoading();
            const result = await TaskService.archiveTask(taskId);

            if (result.success) {
                UI.showSuccess('Task archiviato con successo!');
                await this.render();
            } else {
                UI.showError('Errore: ' + result.error);
                UI.hideLoading();
            }
        } catch (error) {
            console.error('Errore archiviazione task:', error);
            UI.showError('Errore archiviazione task');
            UI.hideLoading();
        }
    },

    // ♻️ RIPRISTINA TASK
    async restoreTask(taskId) {
        try {
            UI.showLoading();
            const result = await TaskService.restoreTask(taskId);

            if (result.success) {
                UI.showSuccess('Task ripristinato con successo!');
                await this.render();
            } else {
                UI.showError('Errore: ' + result.error);
                UI.hideLoading();
            }
        } catch (error) {
            console.error('Errore ripristino task:', error);
            UI.showError('Errore ripristino task');
            UI.hideLoading();
        }
    },

    // 🗑️ ELIMINA TASK
    async deleteTask(taskId) {
        if (!confirm('⚠️ ATTENZIONE!\n\nVuoi eliminare DEFINITIVAMENTE questo task?\n\nQuesta azione NON può essere annullata!\n\nSe non sei sicuro, usa "Archivia" invece di "Elimina".')) {
            return;
        }

        // Doppia conferma per sicurezza
        if (!confirm('Sei ASSOLUTAMENTE SICURO?\n\nIl task verrà eliminato per sempre e non sarà più recuperabile!')) {
            return;
        }

        try {
            UI.showLoading();
            const result = await TaskService.deleteTask(taskId);

            if (result.success) {
                UI.showSuccess('Task eliminato definitivamente');
                await this.render();
            } else {
                UI.showError('Errore: ' + result.error);
                UI.hideLoading();
            }
        } catch (error) {
            console.error('Errore eliminazione task:', error);
            UI.showError('Errore eliminazione task');
            UI.hideLoading();
        }
    },

    // 📱 NOTIFICA TELEGRAM
    async notifyTelegram(taskId) {
        try {
            UI.showLoading();

            // Carica il task
            const taskDoc = await db.collection('tasks').doc(taskId).get();
            if (!taskDoc.exists) {
                UI.showError('Task non trovato');
                UI.hideLoading();
                return;
            }

            const task = { id: taskDoc.id, ...taskDoc.data() };

            // Genera link diretto al task
            const taskLink = `https://growapp-crm.vercel.app/#/task/${taskId}`;

            // Genera messaggio Telegram
            const messaggio = `🚨 *TASK URGENTE* 🚨\n\n` +
                `📋 *${task.titolo}*\n\n` +
                (task.descrizione ? `${task.descrizione}\n\n` : '') +
                `⚠️ Priorità: URGENTE\n` +
                `📅 Creato: ${task.creatoIl ? new Date(task.creatoIl.seconds * 1000).toLocaleDateString('it-IT') : 'N/A'}\n\n` +
                `🔗 Apri task: ${taskLink}`;

            // Codifica il messaggio per URL
            const messaggioCodificato = encodeURIComponent(messaggio);

            // Se il task è assegnato a qualcuno, apri chat con l'utente
            if (task.assegnatiA && task.assegnatiA.length > 0) {
                // Carica gli utenti assegnati
                const utentiPromises = task.assegnatiA.map(uid =>
                    db.collection('utenti').doc(uid).get()
                );
                const utentiDocs = await Promise.all(utentiPromises);

                const utentiConTelegram = utentiDocs
                    .filter(doc => doc.exists && doc.data().telegramUsername)
                    .map(doc => ({
                        nome: doc.data().nome + ' ' + doc.data().cognome,
                        telegram: doc.data().telegramUsername
                    }));

                if (utentiConTelegram.length === 0) {
                    UI.showError('Nessun utente assegnato ha configurato il proprio account Telegram.\n\nVai in Impostazioni → Utenti per aggiungere gli username Telegram.');
                    UI.hideLoading();
                    return;
                }

                // Se c'è un solo utente, apri direttamente la chat
                if (utentiConTelegram.length === 1) {
                    const username = utentiConTelegram[0].telegram.replace('@', '');
                    const telegramUrl = `https://t.me/${username}?text=${messaggioCodificato}`;

                    UI.hideLoading();
                    window.open(telegramUrl, '_blank');
                    UI.showSuccess(`Telegram aperto per inviare notifica a ${utentiConTelegram[0].nome}`);
                } else {
                    // Più utenti: chiedi quale
                    const scelta = confirm(
                        `Il task è assegnato a ${utentiConTelegram.length} persone:\n\n` +
                        utentiConTelegram.map((u, i) => `${i + 1}. ${u.nome} (${u.telegram})`).join('\n') +
                        `\n\nVuoi inviare a TUTTI (OK) o scegliere manualmente (Annulla)?`
                    );

                    UI.hideLoading();

                    if (scelta) {
                        // Invia a tutti (apri Telegram app con messaggio, l'utente sceglierà)
                        const telegramUrl = `tg://msg?text=${messaggioCodificato}`;
                        window.location.href = telegramUrl;
                        UI.showSuccess('Telegram aperto. Seleziona i destinatari e invia!');
                    } else {
                        // Apri Telegram app per scegliere manualmente
                        const telegramUrl = `tg://msg?text=${messaggioCodificato}`;
                        window.location.href = telegramUrl;
                        UI.showSuccess('Telegram aperto. Seleziona il destinatario!');
                    }
                }
            } else {
                // Task in pool (non assegnato): apri Telegram app direttamente
                // Usa deep link per aprire l'app invece di andare allo store
                const telegramUrl = `tg://msg?text=${messaggioCodificato}`;

                UI.hideLoading();
                window.location.href = telegramUrl; // Usa location.href invece di window.open per deep link
                UI.showSuccess('Telegram aperto. Seleziona il gruppo Growapp o un destinatario!');
            }

        } catch (error) {
            console.error('Errore notifica Telegram:', error);
            UI.showError('Errore invio notifica Telegram');
            UI.hideLoading();
        }
    },

    // 💬 ========================================
    // GESTIONE COMMENTI/DISCUSSIONI
    // ========================================

    commentiCaricati: false,
    commentiAperti: false,

    /**
     * Toggle espansione/compressione sezione commenti
     */
    async toggleCommenti(taskId) {
        const content = document.getElementById('commentiContent');
        const icon = document.getElementById('commentiToggleIcon');

        if (!content || !icon) return;

        this.commentiAperti = !this.commentiAperti;

        if (this.commentiAperti) {
            content.style.display = 'block';
            icon.style.transform = 'rotate(0deg)';

            if (!this.commentiCaricati) {
                await this.loadCommenti(taskId);
            }
        } else {
            content.style.display = 'none';
            icon.style.transform = 'rotate(180deg)';
        }
    },

    /**
     * Carica commenti — wrapper per garantire caricamento unico
     */
    async loadCommenti(taskId) {
        if (this.commentiCaricati) return;
        this.commentiCaricati = true;
        await this.caricaCommenti(taskId);
    },

    /**
     * Carica commenti dal database
     */
    async caricaCommenti(taskId) {
        try {
            const result = await CommentService.getCommentiTask(taskId);

            if (result.success) {
                this.renderCommenti(result.commenti, taskId);
            } else {
                document.getElementById('commentiList').innerHTML = `
                    <div style="text-align: center; padding: 2rem; color: var(--rosso-errore);">
                        <i class="fas fa-exclamation-triangle" style="font-size: 2rem;"></i>
                        <p style="margin-top: 0.5rem;">Errore caricamento commenti</p>
                    </div>
                `;
            }

        } catch (error) {
            console.error('Errore caricamento commenti:', error);
            document.getElementById('commentiList').innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--rosso-errore);">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem;"></i>
                    <p style="margin-top: 0.5rem;">Errore caricamento commenti</p>
                </div>
            `;
        }
    },

    /**
     * Renderizza lista commenti
     */
    renderCommenti(commenti, taskId) {
        const commentiList = document.getElementById('commentiList');
        const commentiCount = document.getElementById('commentiCount');

        // Aggiorna contatore
        if (commentiCount) {
            commentiCount.textContent = commenti.length;
        }

        // Se non ci sono commenti
        if (commenti.length === 0) {
            commentiList.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--grigio-500);">
                    <i class="fas fa-comments" style="font-size: 2rem; opacity: 0.3;"></i>
                    <p style="margin-top: 0.5rem;">Nessun commento ancora. Sii il primo a commentare!</p>
                </div>
            `;
            return;
        }

        // Renderizza commenti — stile chat con avatar iniziali
        const utenteCorrente = AuthService.getUtenteCorrente();

        commentiList.innerHTML = commenti.map(commento => {
            const isAutore = utenteCorrente && commento.autoreId === utenteCorrente.uid;
            const allegati = commento.allegati || [];

            // Avatar con iniziali
            const nomeParti = (commento.autoreNome || '?').split(' ');
            const iniziali = nomeParti.length >= 2
                ? (nomeParti[0][0] + nomeParti[nomeParti.length - 1][0]).toUpperCase()
                : (nomeParti[0][0] || '?').toUpperCase();
            const avatarColor = isAutore ? 'var(--verde-700)' : 'var(--blu-700)';

            // Renderizza allegati
            let allegatiHtml = '';
            if (allegati.length > 0) {
                const immagini = allegati.filter(a => CommentService.isImmagine(a.tipo));
                const documenti = allegati.filter(a => !CommentService.isImmagine(a.tipo));

                allegatiHtml = '<div style="margin-top: 0.5rem;">';

                if (immagini.length > 0) {
                    allegatiHtml += `
                        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem;">
                            ${immagini.map(img => `
                                <a href="${img.url}" target="_blank" title="${img.nome}" style="display: block; border-radius: 8px; overflow: hidden; border: 2px solid var(--grigio-300); transition: border-color 0.2s;"
                                   onmouseover="this.style.borderColor='var(--blu-500)'" onmouseout="this.style.borderColor='var(--grigio-300)'">
                                    <img src="${img.url}" alt="${img.nome}"
                                         style="max-width: 200px; max-height: 150px; object-fit: cover; display: block; cursor: pointer;"
                                         loading="lazy" />
                                </a>
                            `).join('')}
                        </div>
                    `;
                }

                if (documenti.length > 0) {
                    allegatiHtml += documenti.map(doc => {
                        const icon = doc.tipo === 'application/pdf' ? 'fa-file-pdf' : 'fa-file-word';
                        const color = doc.tipo === 'application/pdf' ? '#D32F2F' : 'var(--blu-700)';
                        return `
                            <a href="${doc.url}" target="_blank" style="display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0.625rem; background: white; border: 1px solid var(--grigio-300); border-radius: 6px; font-size: 0.8125rem; color: var(--grigio-900); text-decoration: none; margin-right: 0.5rem; margin-bottom: 0.25rem; transition: border-color 0.2s;"
                               onmouseover="this.style.borderColor='var(--blu-500)'" onmouseout="this.style.borderColor='var(--grigio-300)'">
                                <i class="fas ${icon}" style="color: ${color}; font-size: 1.125rem;"></i>
                                <span style="max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${doc.nome}</span>
                                <span style="color: var(--grigio-500); font-size: 0.75rem;">${CommentService.formatDimensione(doc.dimensione)}</span>
                            </a>
                        `;
                    }).join('');
                }

                allegatiHtml += '</div>';
            }

            return `
                <div style="display: flex; gap: 10px; margin-bottom: 1rem; ${isAutore ? 'flex-direction: row-reverse;' : ''}">
                    <!-- Avatar -->
                    <div style="width: 36px; height: 36px; border-radius: 50%; background: ${avatarColor}; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 0.8125rem; font-weight: 700; flex-shrink: 0; font-family: Titillium Web, sans-serif;">
                        ${iniziali}
                    </div>
                    <!-- Bolla messaggio -->
                    <div style="flex: 1; max-width: 85%; background: ${isAutore ? 'var(--verde-100)' : 'var(--blu-100)'}; border-radius: ${isAutore ? '12px 2px 12px 12px' : '2px 12px 12px 12px'}; padding: 0.75rem 1rem; position: relative;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.375rem;">
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <strong style="color: ${avatarColor}; font-size: 0.8125rem; font-family: Titillium Web, sans-serif;">
                                    ${commento.autoreNome}
                                </strong>
                                ${isAutore ? '<span style="background: var(--verde-700); color: white; padding: 1px 6px; border-radius: 3px; font-size: 0.6875rem; font-weight: 600;">Tu</span>' : ''}
                            </div>
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span style="color: var(--grigio-500); font-size: 0.75rem;">
                                    ${CommentService.formatDataCommento(commento.creatoIl)}
                                    ${commento.modificato ? ' <i style="font-style: italic;">(mod)</i>' : ''}
                                </span>
                                ${isAutore ? `
                                    <button onclick="GestioneTask.eliminaCommento('${commento.id}', '${taskId}')"
                                        style="background: none; border: none; color: var(--grigio-400); cursor: pointer; padding: 2px 4px; font-size: 0.75rem; border-radius: 4px; transition: all 0.2s;"
                                        onmouseover="this.style.color='var(--rosso-errore)'" onmouseout="this.style.color='var(--grigio-400)'"
                                        title="Elimina">
                                        <i class="fas fa-trash-alt"></i>
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                        ${commento.testo ? `
                            <p style="color: var(--grigio-900); line-height: 1.5; white-space: pre-wrap; margin: 0; font-size: 0.875rem;">
                                ${commento.testo}
                            </p>
                        ` : ''}
                        ${allegati.length > 0 ? `<div style="margin-top: 4px; font-size: 0.75rem; color: var(--blu-700);"><i class="fas fa-paperclip"></i> ${allegati.length} allegat${allegati.length === 1 ? 'o' : 'i'}</div>` : ''}
                        ${allegatiHtml}
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Aggiunge un nuovo commento
     */
    // Gestione file selezionati per il commento
    onFileSelezionati() {
        const fileInput = document.getElementById('commentoFileInput');
        const anteprima = document.getElementById('anteprimaAllegati');
        const fileCountLabel = document.getElementById('fileCountLabel');

        if (!fileInput || !fileInput.files.length) {
            if (anteprima) anteprima.style.display = 'none';
            if (fileCountLabel) fileCountLabel.textContent = '';
            return;
        }

        const files = Array.from(fileInput.files);
        if (fileCountLabel) fileCountLabel.textContent = `${files.length} file selezionat${files.length === 1 ? 'o' : 'i'}`;

        if (anteprima) {
            anteprima.style.display = 'flex';
            anteprima.style.cssText = 'display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;';

            anteprima.innerHTML = files.map((file, i) => {
                const isImg = file.type.startsWith('image/');
                const icon = isImg ? 'fa-image' : (file.type === 'application/pdf' ? 'fa-file-pdf' : 'fa-file-word');
                const color = isImg ? 'var(--verde-700)' : (file.type === 'application/pdf' ? '#D32F2F' : 'var(--blu-700)');

                return `
                    <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0.75rem; background: white; border: 1px solid var(--grigio-300); border-radius: 6px; font-size: 0.8125rem;">
                        <i class="fas ${icon}" style="color: ${color};"></i>
                        <span style="max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${file.name}</span>
                        <span style="color: var(--grigio-500); font-size: 0.75rem;">${CommentService.formatDimensione(file.size)}</span>
                        <button type="button" onclick="GestioneTask.rimuoviFileAllegato(${i})" style="background: none; border: none; color: var(--rosso-errore); cursor: pointer; padding: 0; font-size: 0.875rem;">
                            <i class="fas fa-times-circle"></i>
                        </button>
                    </div>
                `;
            }).join('');
        }
    },

    // Rimuovi un file dalla selezione
    rimuoviFileAllegato(index) {
        const fileInput = document.getElementById('commentoFileInput');
        if (!fileInput) return;

        // Crea un nuovo DataTransfer per rimuovere il file specifico
        const dt = new DataTransfer();
        const files = Array.from(fileInput.files);
        files.forEach((file, i) => {
            if (i !== index) dt.items.add(file);
        });
        fileInput.files = dt.files;

        this.onFileSelezionati();
    },

    async aggiungiCommento(taskId) {
        const textarea = document.getElementById('nuovoCommentoText');
        const fileInput = document.getElementById('commentoFileInput');
        const testo = textarea.value.trim();
        const files = fileInput ? Array.from(fileInput.files) : [];

        if (!testo && files.length === 0) {
            UI.showError('Scrivi un commento o allega un file');
            return;
        }

        UI.showLoading();

        try {
            let result;

            if (files.length > 0) {
                // Commento con allegati
                result = await CommentService.aggiungiCommentoConAllegati(taskId, testo, files);
            } else {
                // Commento solo testo
                result = await CommentService.aggiungiCommento(taskId, testo);
            }

            if (result.success) {
                // Crea notifiche per il nuovo commento
                const utenteCorrente = AuthService.getUtenteCorrente();
                const autoreNome = `${utenteCorrente.nome} ${utenteCorrente.cognome}`;

                await CommentService.creaNotificheCommento(taskId, result.commentoId, autoreNome);

                // Ricarica commenti
                await this.caricaCommenti(taskId);

                // Ricarica conteggio nel badge
                await this.loadCommentiCount(taskId);

                // Pulisci textarea e file
                textarea.value = '';
                if (fileInput) fileInput.value = '';
                const anteprima = document.getElementById('anteprimaAllegati');
                if (anteprima) { anteprima.style.display = 'none'; anteprima.innerHTML = ''; }
                const fileCountLabel = document.getElementById('fileCountLabel');
                if (fileCountLabel) fileCountLabel.textContent = '';

                UI.hideLoading();
                UI.showSuccess(files.length > 0 ? 'Commento con allegati inviato!' : 'Commento aggiunto!');
            } else {
                UI.showError('Errore: ' + result.error);
                UI.hideLoading();
            }

        } catch (error) {
            console.error('Errore aggiunta commento:', error);
            UI.showError('Errore aggiunta commento');
            UI.hideLoading();
        }
    },

    /**
     * Elimina un commento
     */
    async eliminaCommento(commentoId, taskId) {
        if (!confirm('Sei sicuro di voler eliminare questo commento e i suoi allegati?')) {
            return;
        }

        UI.showLoading();

        try {
            // Prima recupera il commento per eliminare eventuali allegati dallo storage
            const commentoDoc = await db.collection('commenti').doc(commentoId).get();
            if (commentoDoc.exists) {
                const allegati = commentoDoc.data().allegati || [];
                for (const allegato of allegati) {
                    await CommentService.eliminaAllegato(allegato.storagePath);
                }
            }

            const result = await CommentService.eliminaCommento(commentoId);

            if (result.success) {
                // Ricarica commenti
                await this.caricaCommenti(taskId);

                // Ricarica conteggio nel badge
                await this.loadCommentiCount(taskId);

                UI.hideLoading();
                UI.showSuccess('Commento eliminato');
            } else {
                UI.showError('Errore: ' + result.error);
                UI.hideLoading();
            }

        } catch (error) {
            console.error('Errore eliminazione commento:', error);
            UI.showError('Errore eliminazione commento');
            UI.hideLoading();
        }
    },

    /**
     * Scrolla alla sezione commenti ed espandila
     */
    async scrollToCommenti(taskId) {
        // Espandi la sezione se è chiusa
        if (!this.commentiAperti) {
            await this.toggleCommenti(taskId);
        }

        // Scrolla alla sezione commenti
        setTimeout(() => {
            const commentiSection = document.getElementById('commentiSection');
            if (commentiSection) {
                commentiSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 100);
    },

    /**
     * Carica il conteggio commenti e aggiorna i badge
     */
    async loadCommentiCount(taskId) {
        try {
            const result = await CommentService.getCommentiTask(taskId);

            if (result.success) {
                const count = result.commenti.length;

                // Aggiorna badge nell'header
                const badgeHeader = document.getElementById('badgeCommentiCount');
                if (badgeHeader) {
                    badgeHeader.textContent = `(${count})`;
                }

                // Aggiorna badge nella sezione espandibile
                const badgeSection = document.getElementById('commentiCount');
                if (badgeSection) {
                    badgeSection.textContent = count;
                }

                // Aggiorna anche nella mappa globale
                this.commentsCounts[taskId] = count;
            }

        } catch (error) {
            console.error('Errore caricamento conteggio commenti:', error);
        }
    },

    /**
     * Carica conteggi commenti per tutti i task (in batch)
     */
    async loadAllCommentsCounts() {
        try {
            // Carica tutti i commenti in una singola query
            const snapshot = await db.collection('commenti').get();

            // Conta per ogni taskId
            const counts = {};
            snapshot.forEach(doc => {
                const taskId = doc.data().taskId;
                counts[taskId] = (counts[taskId] || 0) + 1;
            });

            this.commentsCounts = counts;

        } catch (error) {
            console.error('Errore caricamento conteggi commenti:', error);
            this.commentsCounts = {};
        }
    }
};

// Task Service - Gestione Task di Sviluppo
const TaskService = {
    // Stati task
    STATI: {
        TODO: 'TODO',
        IN_PROGRESS: 'IN_PROGRESS',
        DONE: 'DONE'
    },

    // Priorità task
    PRIORITA: {
        BASSA: 'BASSA',
        MEDIA: 'MEDIA',
        ALTA: 'ALTA',
        URGENTE: 'URGENTE'
    },

    // Configurazione colori stati
    STATO_COLORS: {
        TODO: { bg: 'var(--blu-700)', text: 'white', icon: 'fas fa-circle' },
        IN_PROGRESS: { bg: '#FFCC00', text: '#333', icon: 'fas fa-spinner' },
        DONE: { bg: 'var(--verde-700)', text: 'white', icon: 'fas fa-check-circle' }
    },

    // Configurazione colori priorità
    PRIORITA_COLORS: {
        BASSA: { bg: 'var(--grigio-500)', text: 'white' },
        MEDIA: { bg: 'var(--blu-500)', text: 'white' },
        ALTA: { bg: '#FF8C00', text: 'white' },
        URGENTE: { bg: 'var(--rosso)', text: 'white' }
    },

    /**
     * Crea un nuovo task
     * taskData.appIds può essere: array con uno o più ID, oppure array vuoto [] per task generici
     */
    async createTask(taskData) {
        try {
            // Validazione dati obbligatori
            if (!taskData.titolo || taskData.titolo.trim() === '') {
                throw new Error('Titolo è obbligatorio');
            }

            // Gestione appIds: accetta sia array che singolo valore (per retrocompatibilità)
            let appIds = [];
            if (taskData.appIds && Array.isArray(taskData.appIds)) {
                appIds = taskData.appIds;
            } else if (taskData.appId) {
                // Retrocompatibilità: se passa appId, convertilo in array
                appIds = [taskData.appId];
            }

            // Prepara dati task
            const task = {
                appIds: appIds,
                titolo: taskData.titolo.trim(),
                descrizione: taskData.descrizione?.trim() || '',
                stato: taskData.stato || this.STATI.TODO,
                priorita: taskData.priorita || this.PRIORITA.MEDIA,

                // Archiviazione (di default: non archiviato)
                archiviato: false,

                // Assegnazione MULTIPLA (array)
                // Gestione retrocompatibilità: accetta sia assegnatiA (array) che assegnatoA (singolo)
                assegnatiA: (() => {
                    if (taskData.assegnatiA && Array.isArray(taskData.assegnatiA)) {
                        return taskData.assegnatiA;
                    } else if (taskData.assegnatoA) {
                        // Retrocompatibilità: converti singolo in array
                        return [taskData.assegnatoA];
                    }
                    return []; // Nessuno assegnato
                })(),
                assegnatiANomi: (() => {
                    if (taskData.assegnatiANomi && Array.isArray(taskData.assegnatiANomi)) {
                        return taskData.assegnatiANomi;
                    } else if (taskData.assegnatoANome) {
                        // Retrocompatibilità
                        return [taskData.assegnatoANome];
                    }
                    return [];
                })(),

                // Creazione
                creatoIl: firebase.firestore.FieldValue.serverTimestamp(),
                creatoDa: AuthService.getUserId(),
                creatoDaNome: AuthService.getUserName(),

                // Scadenza opzionale
                scadenza: taskData.scadenza || null,

                // Completamento (null inizialmente)
                completatoIl: null,
                completatoDa: null,

                // Note e storia
                note: taskData.note || '',
                storia: [
                    {
                        timestamp: new Date(),
                        utente: AuthService.getUserName(),
                        azione: 'Creato',
                        dettagli: (() => {
                            const assegnati = taskData.assegnatiANomi || (taskData.assegnatoANome ? [taskData.assegnatoANome] : []);
                            if (assegnati.length > 0) {
                                return `Task creato e assegnato a: ${assegnati.join(', ')}`;
                            }
                            return 'Task creato (non assegnato)';
                        })()
                    }
                ]
            };

            // Salva in Firestore
            const docRef = await db.collection('tasks').add(task);

            // 🔔 NOTIFICHE: Notifica tutti gli assegnati
            if (task.assegnatiA.length > 0) {
                await NotificationService.createNotificationsForUsers(
                    task.assegnatiA,
                    {
                        type: NotificationService.TYPES.TASK_ASSIGNED,
                        title: 'Nuovo task assegnato',
                        message: `Sei stato assegnato al task: ${task.titolo}`,
                        taskId: docRef.id,
                        appId: task.appIds[0] || null
                    }
                );
            }

            return { success: true, taskId: docRef.id };

        } catch (error) {
            console.error('❌ Errore creazione task:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Aggiorna un task esistente
     */
    async updateTask(taskId, updates) {
        try {
            const taskRef = db.collection('tasks').doc(taskId);
            const taskDoc = await taskRef.get();

            if (!taskDoc.exists) {
                throw new Error('Task non trovato');
            }

            const currentTask = taskDoc.data();
            const updateData = { ...updates };

            // Aggiungi entry nella storia se ci sono modifiche significative
            const storiaEntry = {
                timestamp: new Date(),
                utente: AuthService.getUserName(),
                azione: 'Modificato',
                dettagli: this.getUpdateDetails(currentTask, updates)
            };

            // Se c'è un cambio stato, aggiorna i campi speciali
            if (updates.stato && updates.stato !== currentTask.stato) {
                if (updates.stato === this.STATI.DONE) {
                    updateData.completatoIl = firebase.firestore.FieldValue.serverTimestamp();
                    updateData.completatoDa = AuthService.getUserId();
                } else {
                    // FIX (v10.2.0): uscendo da DONE (task riaperto) azzera il completamento,
                    // altrimenti il task riaperto resta "completato" in DB e nei report.
                    updateData.completatoIl = null;
                    updateData.completatoDa = null;
                }
            }

            // Aggiungi alla storia
            updateData.storia = firebase.firestore.FieldValue.arrayUnion(storiaEntry);

            // Salva modifiche
            await taskRef.update(updateData);

            return { success: true };

        } catch (error) {
            console.error('❌ Errore aggiornamento task:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Cambia lo stato di un task
     */
    async cambiaStato(taskId, nuovoStato) {
        try {
            // Ottieni task per dati notifica
            const taskDoc = await db.collection('tasks').doc(taskId).get();
            if (!taskDoc.exists) {
                throw new Error('Task non trovato');
            }

            const task = taskDoc.data();
            const oldStato = task.stato;

            // Aggiorna stato
            const result = await this.updateTask(taskId, { stato: nuovoStato });

            if (!result.success) {
                return result;
            }

            // 🔔 NOTIFICHE: Notifica tutti gli assegnati + il creatore (se diverso),
            // MA non chi ha fatto il cambio di stato (niente auto-notifiche).
            const myId = AuthService.getUserId();
            const notifyUserIds = [...(task.assegnatiA || [])];
            if (task.creatoDa && !notifyUserIds.includes(task.creatoDa)) {
                notifyUserIds.push(task.creatoDa);
            }
            const recipients = notifyUserIds.filter(id => id && id !== myId);

            if (recipients.length > 0) {
                const statoLabel = {
                    'TODO': 'Da Fare',
                    'IN_PROGRESS': 'In Lavorazione',
                    'DONE': 'Completato'
                };

                await NotificationService.createNotificationsForUsers(
                    recipients,
                    {
                        type: NotificationService.TYPES.TASK_STATUS_CHANGED,
                        title: 'Stato task aggiornato',
                        message: `Task "${task.titolo}" è passato da ${statoLabel[oldStato]} a ${statoLabel[nuovoStato]}`,
                        taskId: taskId,
                        appId: task.appIds && task.appIds[0] ? task.appIds[0] : null
                    }
                );
            }

            return result;
        } catch (error) {
            console.error('Errore cambio stato task:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Assegna task a un utente
     */
    async assegnaTask(taskId, utenteId, utenteNome) {
        return await this.updateTask(taskId, {
            assegnatoA: utenteId,
            assegnatoANome: utenteNome
        });
    },

    /**
     * Archivia un task (lo nasconde ma lo mantiene nel database)
     */
    async archiveTask(taskId) {
        try {
            const taskRef = db.collection('tasks').doc(taskId);
            const taskDoc = await taskRef.get();

            if (!taskDoc.exists) {
                throw new Error('Task non trovato');
            }

            await taskRef.update({
                archiviato: true,
                archiviatoIl: new Date(),
                archiviatoDa: AuthService.getUserId(),   // FIX (v10.2.0): era 'archiviatioDa' (typo)
                archiviatoDaNome: AuthService.getUserName()
            });

            return { success: true };
        } catch (error) {
            console.error('❌ Errore archiviazione task:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Ripristina un task archiviato
     */
    async restoreTask(taskId) {
        try {
            const taskRef = db.collection('tasks').doc(taskId);
            const taskDoc = await taskRef.get();

            if (!taskDoc.exists) {
                throw new Error('Task non trovato');
            }

            await taskRef.update({
                archiviato: false,
                ripristinatoIl: new Date(),
                ripristinatoDa: AuthService.getUserId(),
                ripristinatoDaNome: AuthService.getUserName(),
                // FIX (v10.2.0): pulisci i campi di archiviazione dopo il ripristino
                // (incluso il vecchio campo con typo, per non lasciare residui).
                archiviatoIl: null,
                archiviatoDa: null,
                archiviatoDaNome: null,
                archiviatioDa: firebase.firestore.FieldValue.delete()
            });

            return { success: true };
        } catch (error) {
            console.error('❌ Errore ripristino task:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Elimina un task (DEFINITIVO)
     */
    async deleteTask(taskId) {
        try {
            await db.collection('tasks').doc(taskId).delete();
            return { success: true };
        } catch (error) {
            console.error('❌ Errore eliminazione task:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Ottiene un task per ID
     */
    async getTask(taskId) {
        try {
            const doc = await db.collection('tasks').doc(taskId).get();

            if (!doc.exists) {
                throw new Error('Task non trovato');
            }

            return { success: true, task: { id: doc.id, ...doc.data() } };

        } catch (error) {
            console.error('❌ Errore caricamento task:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Ottiene tutti i task (con filtri opzionali)
     * filtri.appId - cerca task che contengono questo appId nell'array appIds
     * filtri.includeGeneric - se true, include anche i task generici (appIds vuoto)
     * filtri.includiArchiviati - se true, include anche i task archiviati (default: false)
     * filtri.soloArchiviati - se true, mostra SOLO i task archiviati
     */
    async getTasks(filtri = {}) {
        const orderBy = filtri.orderBy || 'creatoIl';
        const orderDirection = filtri.orderDirection || 'desc';
        const limit = filtri.limit || 100;

        // Costruisce la query con i soli filtri where (senza orderBy)
        const buildBase = () => {
            let query = db.collection('tasks');
            if (filtri.soloArchiviati) {
                query = query.where('archiviato', '==', true);
            } else if (!filtri.includiArchiviati) {
                query = query.where('archiviato', '==', false);
            }
            if (filtri.appId) query = query.where('appIds', 'array-contains', filtri.appId);
            if (filtri.stato) query = query.where('stato', '==', filtri.stato);
            if (filtri.assegnatoA) query = query.where('assegnatiA', 'array-contains', filtri.assegnatoA);
            if (filtri.priorita) query = query.where('priorita', '==', filtri.priorita);
            return query;
        };

        const toArray = (snap) => {
            const tasks = [];
            snap.forEach(doc => tasks.push({ id: doc.id, ...doc.data() }));
            return tasks;
        };
        const sortInMemory = (arr) => arr.sort((a, b) => {
            const av = a[orderBy] && a[orderBy].toMillis ? a[orderBy].toMillis() : (a[orderBy] || 0);
            const bv = b[orderBy] && b[orderBy].toMillis ? b[orderBy].toMillis() : (b[orderBy] || 0);
            return orderDirection === 'desc' ? bv - av : av - bv;
        });

        try {
            const snapshot = await buildBase().orderBy(orderBy, orderDirection).limit(limit).get();
            return { success: true, tasks: toArray(snapshot) };
        } catch (error) {
            // FIX (v10.2.0): fallback su indice composito mancante — prima la pagina Task
            // mostrava "nessun task" in modo silenzioso. Ora riprova senza orderBy e ordina
            // in memoria, così i dati compaiono comunque (in modo leggermente degradato).
            const isIndexErr = error && (error.code === 'failed-precondition' || /index/i.test(error.message || ''));
            if (isIndexErr) {
                try {
                    console.warn('⚠️ Indice tasks mancante, uso fallback senza orderBy:', error.message);
                    const snap = await buildBase().limit(limit).get();
                    return { success: true, tasks: sortInMemory(toArray(snap)) };
                } catch (e2) {
                    console.error('❌ Errore caricamento tasks (fallback):', e2);
                    return { success: false, error: e2.message, tasks: [] };
                }
            }
            console.error('❌ Errore caricamento tasks:', error);
            return { success: false, error: error.message, tasks: [] };
        }
    },

    /**
     * Ottiene i task per una specifica app
     */
    async getTasksByApp(appId) {
        return await this.getTasks({ appId });
    },

    /**
     * Ottiene i task assegnati a un utente
     */
    async getTasksByUser(userId) {
        return await this.getTasks({ assegnatoA: userId });
    },

    /**
     * Ottiene i task assegnati all'utente corrente
     */
    async getMyTasks() {
        return await this.getTasksByUser(AuthService.getUserId());
    },

    /**
     * Ottiene i task generici (non collegati a nessuna app)
     */
    async getGenericTasks() {
        try {
            const snapshot = await db.collection('tasks')
                .where('appIds', '==', [])
                .orderBy('creatoIl', 'desc')
                .get();

            const tasks = [];
            snapshot.forEach(doc => {
                tasks.push({ id: doc.id, ...doc.data() });
            });

            return { success: true, tasks };
        } catch (error) {
            console.error('Errore caricamento task generici:', error);
            return { success: false, error: error.message, tasks: [] };
        }
    },

    /**
     * Ottiene TUTTI i task (inclusi quelli generici)
     * Utile per la pagina globale Task
     */
    async getAllTasks(filtri = {}) {
        try {
            let query = db.collection('tasks');

            // Applica filtri (escluso appId perché vogliamo tutti i task)
            if (filtri.stato) {
                query = query.where('stato', '==', filtri.stato);
            }
            if (filtri.assegnatoA) {
                // Usa array-contains per cercare nell'array assegnatiA
                query = query.where('assegnatiA', 'array-contains', filtri.assegnatoA);
            }
            if (filtri.priorita) {
                query = query.where('priorita', '==', filtri.priorita);
            }

            // Ordinamento
            const orderBy = filtri.orderBy || 'creatoIl';
            const orderDirection = filtri.orderDirection || 'desc';
            query = query.orderBy(orderBy, orderDirection);

            const snapshot = await query.get();

            const tasks = [];
            snapshot.forEach(doc => {
                tasks.push({ id: doc.id, ...doc.data() });
            });

            return { success: true, tasks, count: tasks.length };
        } catch (error) {
            console.error('Errore caricamento tutti i task:', error);
            return { success: false, error: error.message, tasks: [] };
        }
    },

    /**
     * Ottiene statistiche task
     */
    async getStatistiche(appId = null) {
        try {
            const filtri = appId ? { appId } : {};
            const result = await this.getTasks(filtri);

            if (!result.success) {
                throw new Error(result.error);
            }

            const tasks = result.tasks;

            // Calcola statistiche
            const stats = {
                totale: tasks.length,
                todo: tasks.filter(t => t.stato === this.STATI.TODO).length,
                inProgress: tasks.filter(t => t.stato === this.STATI.IN_PROGRESS).length,
                done: tasks.filter(t => t.stato === this.STATI.DONE).length,

                // Per priorità
                bassa: tasks.filter(t => t.priorita === this.PRIORITA.BASSA).length,
                media: tasks.filter(t => t.priorita === this.PRIORITA.MEDIA).length,
                alta: tasks.filter(t => t.priorita === this.PRIORITA.ALTA).length,
                urgente: tasks.filter(t => t.priorita === this.PRIORITA.URGENTE).length,

                // Task in scadenza (prossimi 3 giorni)
                inScadenza: tasks.filter(t => {
                    if (!t.scadenza || t.stato === this.STATI.DONE) return false;
                    const scadenza = t.scadenza.toDate();
                    const oggi = new Date();
                    const treGiorni = new Date();
                    treGiorni.setDate(oggi.getDate() + 3);
                    return scadenza <= treGiorni && scadenza >= oggi;
                }).length,

                // Task scaduti
                scaduti: tasks.filter(t => {
                    if (!t.scadenza || t.stato === this.STATI.DONE) return false;
                    return t.scadenza.toDate() < new Date();
                }).length
            };

            return { success: true, stats };

        } catch (error) {
            console.error('❌ Errore calcolo statistiche:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Helper: genera descrizione dettagliata delle modifiche
     */
    getUpdateDetails(oldTask, updates) {
        const details = [];

        if (updates.stato && updates.stato !== oldTask.stato) {
            details.push(`Stato: ${oldTask.stato} → ${updates.stato}`);
        }

        if (updates.priorita && updates.priorita !== oldTask.priorita) {
            details.push(`Priorità: ${oldTask.priorita} → ${updates.priorita}`);
        }

        if (updates.assegnatoANome && updates.assegnatoANome !== oldTask.assegnatoANome) {
            const old = oldTask.assegnatoANome || 'Nessuno';
            details.push(`Assegnato: ${old} → ${updates.assegnatoANome}`);
        }

        if (updates.titolo && updates.titolo !== oldTask.titolo) {
            details.push('Titolo modificato');
        }

        if (updates.descrizione !== undefined && updates.descrizione !== oldTask.descrizione) {
            details.push('Descrizione modificata');
        }

        if (updates.scadenza && updates.scadenza !== oldTask.scadenza) {
            details.push('Scadenza modificata');
        }

        return details.length > 0 ? details.join(', ') : 'Modifiche generiche';
    },

    /**
     * Formatta data per visualizzazione
     */
    formatDate(timestamp) {
        if (!timestamp) return '-';

        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    },

    /**
     * Formatta data e ora per visualizzazione
     */
    formatDateTime(timestamp) {
        if (!timestamp) return '-';

        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    /**
     * Verifica se un task è in scadenza
     */
    isInScadenza(task) {
        if (!task.scadenza || task.stato === this.STATI.DONE) return false;

        const scadenza = task.scadenza.toDate ? task.scadenza.toDate() : new Date(task.scadenza);
        const oggi = new Date();
        const treGiorni = new Date();
        treGiorni.setDate(oggi.getDate() + 3);

        return scadenza <= treGiorni && scadenza >= oggi;
    },

    /**
     * Verifica se un task è scaduto
     */
    isScaduto(task) {
        if (!task.scadenza || task.stato === this.STATI.DONE) return false;

        const scadenza = task.scadenza.toDate ? task.scadenza.toDate() : new Date(task.scadenza);
        return scadenza < new Date();
    },

    // ===== FUNZIONI ASSEGNAZIONE MULTIPLA =====

    /**
     * Prendi in carico un task (aggiungi te stesso agli assegnati)
     */
    async takeTask(taskId) {
        try {
            const userId = AuthService.getUserId();
            const userName = AuthService.getUserName();

            if (!userId || !userName) {
                throw new Error('Utente non autenticato');
            }

            const taskRef = db.collection('tasks').doc(taskId);

            // FIX (v10.2.0): transazione atomica. Prima era una read-modify-write non
            // atomica: due "Prendi in carico" ravvicinati si sovrascrivevano (last-write-wins)
            // e un assegnato spariva pur avendo ricevuto conferma di successo.
            const outcome = await db.runTransaction(async (tx) => {
                const taskDoc = await tx.get(taskRef);
                if (!taskDoc.exists) throw new Error('Task non trovato');

                const task = taskDoc.data();
                const assegnatiA = task.assegnatiA || [];
                const assegnatiANomi = task.assegnatiANomi || [];

                if (assegnatiA.includes(userId)) {
                    return { already: true };
                }

                const storiaEntry = {
                    timestamp: new Date(),
                    utente: userName,
                    azione: 'Preso in carico',
                    dettagli: `${userName} si è preso il task`
                };

                tx.update(taskRef, {
                    assegnatiA: [...assegnatiA, userId],
                    assegnatiANomi: [...assegnatiANomi, userName],
                    storia: firebase.firestore.FieldValue.arrayUnion(storiaEntry)
                });

                return { already: false, creatoDa: task.creatoDa, titolo: task.titolo, appIds: task.appIds };
            });

            if (outcome.already) {
                return { success: false, error: 'Sei già assegnato a questo task' };
            }

            // 🔔 NOTIFICHE fuori dalla transazione (side-effect non idempotente sui retry)
            if (outcome.creatoDa && outcome.creatoDa !== userId) {
                await NotificationService.createNotification({
                    userId: outcome.creatoDa,
                    type: NotificationService.TYPES.TASK_TAKEN,
                    title: 'Task preso in carico',
                    message: `${userName} ha preso in carico il task: ${outcome.titolo}`,
                    taskId: taskId,
                    appId: outcome.appIds && outcome.appIds[0] ? outcome.appIds[0] : null
                });
            }

            return { success: true };
        } catch (error) {
            console.error('Errore prendere task:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Riassegna completamente il task (cambia tutti gli assegnati)
     */
    async reassignTask(taskId, userIds, userNames) {
        try {
            if (!userIds || !Array.isArray(userIds)) {
                throw new Error('userIds deve essere un array');
            }

            const taskRef = db.collection('tasks').doc(taskId);
            const taskDoc = await taskRef.get();

            if (!taskDoc.exists) {
                throw new Error('Task non trovato');
            }

            const task = taskDoc.data();
            const oldAssegnatiA = task.assegnatiA || [];

            const storiaEntry = {
                timestamp: new Date(),
                utente: AuthService.getUserName(),
                azione: 'Riassegnato',
                dettagli: userNames.length > 0
                    ? `Task riassegnato a: ${userNames.join(', ')}`
                    : 'Task non più assegnato'
            };

            await taskRef.update({
                assegnatiA: userIds,
                assegnatiANomi: userNames,
                storia: firebase.firestore.FieldValue.arrayUnion(storiaEntry)
            });

            // 🔔 NOTIFICHE: Notifica solo i NUOVI assegnati (quelli non presenti prima)
            const newAssignees = userIds.filter(id => !oldAssegnatiA.includes(id));

            if (newAssignees.length > 0) {
                await NotificationService.createNotificationsForUsers(
                    newAssignees,
                    {
                        type: NotificationService.TYPES.TASK_REASSIGNED,
                        title: 'Task riassegnato a te',
                        message: `Sei stato assegnato al task: ${task.titolo}`,
                        taskId: taskId,
                        appId: task.appIds && task.appIds[0] ? task.appIds[0] : null
                    }
                );
            }

            return { success: true };
        } catch (error) {
            console.error('Errore riassegnazione task:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Aggiungi un assegnato al task
     */
    async addAssignee(taskId, userId, userName) {
        try {
            const actorId = AuthService.getUserId();
            const actorName = AuthService.getUserName();
            const taskRef = db.collection('tasks').doc(taskId);

            // FIX (v10.2.0): transazione atomica (come takeTask) contro le race.
            const outcome = await db.runTransaction(async (tx) => {
                const taskDoc = await tx.get(taskRef);
                if (!taskDoc.exists) throw new Error('Task non trovato');

                const task = taskDoc.data();
                const assegnatiA = task.assegnatiA || [];
                const assegnatiANomi = task.assegnatiANomi || [];

                if (assegnatiA.includes(userId)) {
                    return { already: true };
                }

                const storiaEntry = {
                    timestamp: new Date(),
                    utente: actorName,
                    azione: 'Aggiunto assegnato',
                    dettagli: `${userName} aggiunto al task`
                };

                tx.update(taskRef, {
                    assegnatiA: [...assegnatiA, userId],
                    assegnatiANomi: [...assegnatiANomi, userName],
                    storia: firebase.firestore.FieldValue.arrayUnion(storiaEntry)
                });

                return { already: false, titolo: task.titolo, appIds: task.appIds };
            });

            if (outcome.already) {
                return { success: false, error: 'Utente già assegnato' };
            }

            // 🔔 NUOVO (v10.2.0): avvisa il nuovo assegnato (prima non veniva notificato)
            if (userId && userId !== actorId) {
                await NotificationService.createNotification({
                    userId: userId,
                    type: NotificationService.TYPES.TASK_REASSIGNED,
                    title: 'Sei stato aggiunto a un task',
                    message: `Sei stato assegnato al task: ${outcome.titolo}`,
                    taskId: taskId,
                    appId: outcome.appIds && outcome.appIds[0] ? outcome.appIds[0] : null
                });
            }

            return { success: true };
        } catch (error) {
            console.error('Errore aggiunta assegnato:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Verifica e notifica task in scadenza o scaduti
     * Chiamato periodicamente (al login o apertura pagina Task)
     */
    async checkAndNotifyDueTasks() {
        try {
            const now = new Date();
            const treGiorni = new Date();
            treGiorni.setDate(now.getDate() + 3);

            // Trova tutti i task NON completati con scadenza
            const snapshot = await db.collection('tasks')
                .where('stato', '!=', this.STATI.DONE)
                .get();

            const tasksToNotify = [];

            snapshot.forEach(doc => {
                const task = { id: doc.id, ...doc.data() };

                // FIX (v10.2.0): salta i task archiviati (prima continuavano a generare
                // notifiche "scaduto" ogni giorno). Filtro in-memory: nessun indice extra
                // e tratta correttamente i doc legacy senza il campo 'archiviato'.
                if (task.archiviato) return;

                if (!task.scadenza) return;

                const scadenza = task.scadenza.toDate ? task.scadenza.toDate() : new Date(task.scadenza);

                // Task in scadenza (entro 3 giorni)
                if (scadenza <= treGiorni && scadenza >= now) {
                    tasksToNotify.push({
                        task,
                        type: 'DUE_SOON',
                        message: `Il task "${task.titolo}" scade tra ${Math.ceil((scadenza - now) / (1000 * 60 * 60 * 24))} giorni`
                    });
                }
                // Task scaduti
                else if (scadenza < now) {
                    tasksToNotify.push({
                        task,
                        type: 'OVERDUE',
                        message: `Il task "${task.titolo}" è scaduto il ${this.formatDate(task.scadenza)}`
                    });
                }
            });

            // Crea notifiche per task in scadenza/scaduti
            for (const item of tasksToNotify) {
                const { task, type, message } = item;

                if (!task.assegnatiA || task.assegnatiA.length === 0) continue;

                // Verifica se esiste già una notifica recente (ultime 24h) per evitare spam
                const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                let skipNotifica = false;

                try {
                    const existingNotif = await db.collection('notifications')
                        .where('taskId', '==', task.id)
                        .where('type', '==', type === 'DUE_SOON' ? NotificationService.TYPES.TASK_DUE_SOON : NotificationService.TYPES.TASK_OVERDUE)
                        .where('createdAt', '>', firebase.firestore.Timestamp.fromDate(oneDayAgo))
                        .limit(1)
                        .get();

                    if (!existingNotif.empty) skipNotifica = true;
                } catch (indexErr) {
                    // Se l'indice composito non esiste, fallback: cerca solo per taskId e tipo
                    console.warn('⚠️ Indice mancante per check duplicati notifiche, uso fallback');
                    const fallback = await db.collection('notifications')
                        .where('taskId', '==', task.id)
                        .where('type', '==', type === 'DUE_SOON' ? NotificationService.TYPES.TASK_DUE_SOON : NotificationService.TYPES.TASK_OVERDUE)
                        .limit(5)
                        .get();

                    fallback.forEach(doc => {
                        const d = doc.data();
                        const createdDate = d.createdAt?.toDate ? d.createdAt.toDate() : new Date(d.createdAt || 0);
                        if (createdDate > oneDayAgo) skipNotifica = true;
                    });
                }

                // Se esiste già notifica recente, salta
                if (skipNotifica) continue;

                // Crea notifiche
                await NotificationService.createNotificationsForUsers(
                    task.assegnatiA,
                    {
                        type: type === 'DUE_SOON' ? NotificationService.TYPES.TASK_DUE_SOON : NotificationService.TYPES.TASK_OVERDUE,
                        title: type === 'DUE_SOON' ? 'Task in scadenza' : 'Task scaduto',
                        message: message,
                        taskId: task.id,
                        appId: task.appIds && task.appIds[0] ? task.appIds[0] : null
                    }
                );
            }

            return { success: true, count: tasksToNotify.length };

        } catch (error) {
            console.error('Errore verifica task in scadenza:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Rimuovi un assegnato dal task
     */
    async removeAssignee(taskId, userId) {
        try {
            const actorId = AuthService.getUserId();
            const actorName = AuthService.getUserName();
            const taskRef = db.collection('tasks').doc(taskId);

            // FIX (v10.2.0): transazione atomica per mantenere allineati i due array
            // paralleli (assegnatiA / assegnatiANomi) anche con azioni concorrenti.
            const outcome = await db.runTransaction(async (tx) => {
                const taskDoc = await tx.get(taskRef);
                if (!taskDoc.exists) throw new Error('Task non trovato');

                const task = taskDoc.data();
                const assegnatiA = task.assegnatiA || [];
                const assegnatiANomi = task.assegnatiANomi || [];

                const index = assegnatiA.indexOf(userId);
                if (index === -1) {
                    return { notFound: true };
                }

                const removedName = assegnatiANomi[index];
                const newAssegnatiA = assegnatiA.slice();
                const newAssegnatiANomi = assegnatiANomi.slice();
                newAssegnatiA.splice(index, 1);
                newAssegnatiANomi.splice(index, 1);

                const storiaEntry = {
                    timestamp: new Date(),
                    utente: actorName,
                    azione: 'Rimosso assegnato',
                    dettagli: `${removedName} rimosso dal task`
                };

                tx.update(taskRef, {
                    assegnatiA: newAssegnatiA,
                    assegnatiANomi: newAssegnatiANomi,
                    storia: firebase.firestore.FieldValue.arrayUnion(storiaEntry)
                });

                return { notFound: false, titolo: task.titolo, appIds: task.appIds };
            });

            if (outcome.notFound) {
                return { success: false, error: 'Utente non assegnato' };
            }

            // 🔔 NUOVO (v10.2.0): avvisa chi è stato rimosso (se diverso da chi agisce)
            if (userId && userId !== actorId) {
                await NotificationService.createNotification({
                    userId: userId,
                    type: NotificationService.TYPES.TASK_REASSIGNED,
                    title: 'Sei stato rimosso da un task',
                    message: `Non sei più assegnato al task: ${outcome.titolo}`,
                    taskId: taskId,
                    appId: outcome.appIds && outcome.appIds[0] ? outcome.appIds[0] : null
                });
            }

            return { success: true };
        } catch (error) {
            console.error('Errore rimozione assegnato:', error);
            return { success: false, error: error.message };
        }
    }
};

// Esponi su window per accesso da iframe (Monitor RSS)
window.TaskService = TaskService;

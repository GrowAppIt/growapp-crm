/**
 * 💬 COMMENT SERVICE
 * Gestisce i commenti/discussioni sui task
 */

const CommentService = {

    /**
     * 📝 Aggiunge un nuovo commento a un task
     */
    async aggiungiCommento(taskId, testo) {
        try {
            if (!testo || testo.trim() === '') {
                throw new Error('Il commento non può essere vuoto');
            }

            const utenteCorrente = AuthService.getUtenteCorrente();
            if (!utenteCorrente) {
                throw new Error('Utente non autenticato');
            }

            const nuovoCommento = {
                taskId: taskId,
                testo: testo.trim(),
                autoreId: utenteCorrente.uid,
                autoreNome: `${utenteCorrente.nome} ${utenteCorrente.cognome}`,
                creatoIl: firebase.firestore.FieldValue.serverTimestamp()
            };

            const docRef = await db.collection('commenti').add(nuovoCommento);

            return {
                success: true,
                commentoId: docRef.id
            };

        } catch (error) {
            console.error('Errore aggiunta commento:', error);
            return {
                success: false,
                error: error.message
            };
        }
    },

    /**
     * 📋 Carica tutti i commenti di un task
     */
    async getCommentiTask(taskId) {
        try {
            const snapshot = await db.collection('commenti')
                .where('taskId', '==', taskId)
                .orderBy('creatoIl', 'asc')
                .get();

            const commenti = [];
            snapshot.forEach(doc => {
                commenti.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            return {
                success: true,
                commenti: commenti
            };

        } catch (error) {
            console.error('Errore caricamento commenti:', error);
            return {
                success: false,
                error: error.message,
                commenti: []
            };
        }
    },

    /**
     * 🗑️ Elimina un commento (solo l'autore può eliminare)
     */
    async eliminaCommento(commentoId) {
        try {
            const utenteCorrente = AuthService.getUtenteCorrente();
            if (!utenteCorrente) {
                throw new Error('Utente non autenticato');
            }

            // Verifica che l'utente sia l'autore
            const commentoDoc = await db.collection('commenti').doc(commentoId).get();
            if (!commentoDoc.exists) {
                throw new Error('Commento non trovato');
            }

            const commento = commentoDoc.data();
            if (commento.autoreId !== utenteCorrente.uid) {
                throw new Error('Non sei autorizzato a eliminare questo commento');
            }

            await db.collection('commenti').doc(commentoId).delete();

            return {
                success: true
            };

        } catch (error) {
            console.error('Errore eliminazione commento:', error);
            return {
                success: false,
                error: error.message
            };
        }
    },

    /**
     * ✏️ Modifica un commento (solo l'autore può modificare)
     */
    async modificaCommento(commentoId, nuovoTesto) {
        try {
            if (!nuovoTesto || nuovoTesto.trim() === '') {
                throw new Error('Il commento non può essere vuoto');
            }

            const utenteCorrente = AuthService.getUtenteCorrente();
            if (!utenteCorrente) {
                throw new Error('Utente non autenticato');
            }

            // Verifica che l'utente sia l'autore
            const commentoDoc = await db.collection('commenti').doc(commentoId).get();
            if (!commentoDoc.exists) {
                throw new Error('Commento non trovato');
            }

            const commento = commentoDoc.data();
            if (commento.autoreId !== utenteCorrente.uid) {
                throw new Error('Non sei autorizzato a modificare questo commento');
            }

            await db.collection('commenti').doc(commentoId).update({
                testo: nuovoTesto.trim(),
                modificato: true,
                modificatoIl: firebase.firestore.FieldValue.serverTimestamp()
            });

            return {
                success: true
            };

        } catch (error) {
            console.error('Errore modifica commento:', error);
            return {
                success: false,
                error: error.message
            };
        }
    },

    /**
     * 🔔 Crea notifiche per nuovo commento
     */
    async creaNotificheCommento(taskId, commentoId, autoreNome) {
        try {
            // Carica il task per sapere chi notificare
            const taskDoc = await db.collection('tasks').doc(taskId).get();
            if (!taskDoc.exists) return;

            const task = taskDoc.data();
            const utenteCorrente = AuthService.getUtenteCorrente();

            const destinatari = new Set();

            // Notifica chi ha creato il task
            if (task.creatoDA && task.creatoDA !== utenteCorrente.uid) {
                destinatari.add(task.creatoDA);
            }

            // Notifica gli assegnati
            if (task.assegnatiA && task.assegnatiA.length > 0) {
                task.assegnatiA.forEach(uid => {
                    if (uid !== utenteCorrente.uid) {
                        destinatari.add(uid);
                    }
                });
            }

            // Notifica chi ha già commentato
            const commentiSnapshot = await db.collection('commenti')
                .where('taskId', '==', taskId)
                .get();

            commentiSnapshot.forEach(doc => {
                const autoreId = doc.data().autoreId;
                if (autoreId !== utenteCorrente.uid) {
                    destinatari.add(autoreId);
                }
            });

            // Crea le notifiche usando lo schema di NotificationService
            const batch = db.batch();

            destinatari.forEach(userId => {
                const notificaRef = db.collection('notifications').doc();
                batch.set(notificaRef, {
                    userId: userId,
                    type: NotificationService.TYPES.NEW_COMMENT,
                    title: `Nuovo commento su "${task.titolo}"`,
                    message: `${autoreNome} ha commentato il task`,
                    taskId: taskId,
                    commentoId: commentoId,
                    appId: null,
                    read: false,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });

            await batch.commit();

            return {
                success: true,
                notificheCreate: destinatari.size
            };

        } catch (error) {
            console.error('Errore creazione notifiche commento:', error);
            return {
                success: false,
                error: error.message
            };
        }
    },

    /**
     * 🕐 Formatta timestamp per visualizzazione
     */
    formatDataCommento(timestamp) {
        if (!timestamp) return 'Data non disponibile';

        const data = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const ora = data.toLocaleTimeString('it-IT', {
            hour: '2-digit',
            minute: '2-digit'
        });
        const giorno = data.toLocaleDateString('it-IT', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });

        return `${giorno} alle ${ora}`;
    }
};

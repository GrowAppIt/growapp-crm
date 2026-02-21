// Notification Service - Gestione Notifiche
const NotificationService = {
    // Tipi notifica
    TYPES: {
        TASK_ASSIGNED: 'task_assigned',
        TASK_STATUS_CHANGED: 'task_status_changed',
        TASK_DUE_SOON: 'task_due_soon',
        TASK_OVERDUE: 'task_overdue',
        TASK_TAKEN: 'task_taken',
        TASK_REASSIGNED: 'task_reassigned',
        NEW_COMMENT: 'new_comment'
    },

    /**
     * Crea una nuova notifica
     */
    async createNotification(notificationData) {
        try {
            const notification = {
                userId: notificationData.userId,
                type: notificationData.type,
                title: notificationData.title,
                message: notificationData.message,
                taskId: notificationData.taskId || null,
                appId: notificationData.appId || null,
                read: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await db.collection('notifications').add(notification);
            return { success: true };
        } catch (error) {
            console.error('Errore creazione notifica:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Crea notifiche per più utenti (batch)
     */
    async createNotificationsForUsers(userIds, notificationData) {
        try {
            const batch = db.batch();

            userIds.forEach(userId => {
                const notifRef = db.collection('notifications').doc();
                batch.set(notifRef, {
                    userId: userId,
                    type: notificationData.type,
                    title: notificationData.title,
                    message: notificationData.message,
                    taskId: notificationData.taskId || null,
                    appId: notificationData.appId || null,
                    read: false,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });

            await batch.commit();
            return { success: true };
        } catch (error) {
            console.error('Errore creazione notifiche batch:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Ottiene le notifiche dell'utente corrente
     */
    async getNotifications(limit = 10, onlyUnread = false) {
        try {
            const userId = AuthService.getUserId();
            if (!userId) {
                throw new Error('Utente non autenticato');
            }

            let query = db.collection('notifications')
                .where('userId', '==', userId);

            if (onlyUnread) {
                query = query.where('read', '==', false);
            }

            query = query.orderBy('createdAt', 'desc').limit(limit);

            const snapshot = await query.get();

            const notifications = [];
            snapshot.forEach(doc => {
                notifications.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            return { success: true, notifications };
        } catch (error) {
            console.error('Errore caricamento notifiche:', error);
            return { success: false, error: error.message, notifications: [] };
        }
    },

    /**
     * Conta notifiche non lette
     */
    async getUnreadCount() {
        try {
            const userId = AuthService.getUserId();
            if (!userId) return { success: true, count: 0 };

            const snapshot = await db.collection('notifications')
                .where('userId', '==', userId)
                .where('read', '==', false)
                .get();

            return { success: true, count: snapshot.size };
        } catch (error) {
            console.error('Errore conteggio notifiche:', error);
            return { success: false, count: 0 };
        }
    },

    /**
     * Segna notifica come letta
     */
    async markAsRead(notificationId) {
        try {
            await db.collection('notifications').doc(notificationId).update({
                read: true,
                readAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            return { success: true };
        } catch (error) {
            console.error('Errore aggiornamento notifica:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Segna tutte le notifiche come lette
     */
    async markAllAsRead() {
        try {
            const userId = AuthService.getUserId();
            if (!userId) {
                throw new Error('Utente non autenticato');
            }

            const snapshot = await db.collection('notifications')
                .where('userId', '==', userId)
                .where('read', '==', false)
                .get();

            const batch = db.batch();
            snapshot.forEach(doc => {
                batch.update(doc.ref, {
                    read: true,
                    readAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });

            await batch.commit();

            return { success: true, count: snapshot.size };
        } catch (error) {
            console.error('Errore aggiornamento notifiche:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Elimina una notifica
     */
    async deleteNotification(notificationId) {
        try {
            await db.collection('notifications').doc(notificationId).delete();
            return { success: true };
        } catch (error) {
            console.error('Errore eliminazione notifica:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Listener real-time per notifiche non lette
     */
    startUnreadListener(callback) {
        const userId = AuthService.getUserId();
        if (!userId) return null;

        return db.collection('notifications')
            .where('userId', '==', userId)
            .where('read', '==', false)
            .onSnapshot(snapshot => {
                callback(snapshot.size);
            }, error => {
                console.error('Errore listener notifiche:', error);
            });
    },

    /**
     * Formatta data notifica (es: "2 minuti fa", "ieri", "3 giorni fa")
     */
    formatTimeAgo(timestamp) {
        if (!timestamp) return '';

        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);

        if (seconds < 60) return 'Ora';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} minuti fa`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} ore fa`;
        if (seconds < 172800) return 'Ieri';
        if (seconds < 604800) return `${Math.floor(seconds / 86400)} giorni fa`;

        return date.toLocaleDateString('it-IT', {
            day: 'numeric',
            month: 'short'
        });
    },

    /**
     * Ottiene icona per tipo notifica
     */
    getNotificationIcon(type) {
        const icons = {
            [this.TYPES.TASK_ASSIGNED]: 'fa-user-check',
            [this.TYPES.TASK_STATUS_CHANGED]: 'fa-sync-alt',
            [this.TYPES.TASK_DUE_SOON]: 'fa-clock',
            [this.TYPES.TASK_OVERDUE]: 'fa-exclamation-triangle',
            [this.TYPES.TASK_TAKEN]: 'fa-hand-paper',
            [this.TYPES.TASK_REASSIGNED]: 'fa-user-edit',
            [this.TYPES.NEW_COMMENT]: 'fa-comment'
        };
        return icons[type] || 'fa-bell';
    },

    /**
     * Ottiene colore per tipo notifica
     */
    getNotificationColor(type) {
        const colors = {
            [this.TYPES.TASK_ASSIGNED]: 'var(--verde-700)',
            [this.TYPES.TASK_STATUS_CHANGED]: 'var(--blu-700)',
            [this.TYPES.TASK_DUE_SOON]: '#FFCC00',
            [this.TYPES.TASK_OVERDUE]: 'var(--rosso-errore)',
            [this.TYPES.TASK_TAKEN]: 'var(--verde-500)',
            [this.TYPES.TASK_REASSIGNED]: 'var(--blu-500)',
            [this.TYPES.NEW_COMMENT]: 'var(--verde-700)'
        };
        return colors[type] || 'var(--grigio-600)';
    }
};

// Esponi su window per accesso da iframe (Monitor RSS)
window.NotificationService = NotificationService;

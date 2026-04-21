/**
 * Push History Service — Storico Notifiche Push Centralizzato
 *
 * Servizio per registrare TUTTE le notifiche push inviate ai comuni,
 * indipendentemente dalla fonte (CRM broadcast, API Vercel, RSS auto, calendario).
 *
 * Schema Firestore - Collezione: push_history
 * {
 *   appId:        string   — ID documento Firestore dell'app
 *   appSlug:      string   — Slug dell'app (es: "locri", "taormina")
 *   comune:       string   — Nome del comune (es: "Locri", "Taormina")
 *   title:        string   — Titolo della notifica (opzionale, dipende dalla fonte)
 *   message:      string   — Testo/corpo della notifica
 *   source:       string   — Origine: "crm_broadcast"|"crm_api"|"rss_auto"|"calendar_auto"|"meteo_alert"|"manual"
 *   platform:     string   — Piattaforma: "all"|"ios"|"android"|"pwa"
 *   sentAt:       timestamp
 *   sentBy:       string   — userId o "system"
 *   sentByName:   string   — Nome utente o "Sistema Automatico"
 *   status:       string   — "sent"|"failed"
 *   error:        string|null
 *   metadata:     object   — Dati extra (templateName, rssUrl, articleUrl, ecc.)
 * }
 */
const PushHistoryService = {

    // Sorgenti notifica
    SOURCES: {
        CRM_BROADCAST: 'crm_broadcast',
        CRM_API: 'crm_api',
        RSS_AUTO: 'rss_auto',
        CALENDAR_AUTO: 'calendar_auto',
        METEO_ALERT: 'meteo_alert',
        MANUAL: 'manual'
    },

    // Stati
    STATUS: {
        SENT: 'sent',
        FAILED: 'failed'
    },

    /**
     * Registra una singola notifica push nello storico
     *
     * @param {Object} data
     * @param {string} data.appId       — ID Firestore dell'app
     * @param {string} data.appSlug     — Slug dell'app (es: "locri")
     * @param {string} data.comune      — Nome del comune
     * @param {string} data.title       — Titolo notifica (opzionale)
     * @param {string} data.message     — Testo della notifica
     * @param {string} data.source      — Una delle SOURCES
     * @param {string} data.platform    — "all"|"ios"|"android"|"pwa"
     * @param {string} data.sentBy      — userId o "system"
     * @param {string} data.sentByName  — Nome utente o "Sistema Automatico"
     * @param {string} data.status      — "sent"|"failed"
     * @param {string|null} data.error  — Messaggio errore se failed
     * @param {Object} data.metadata    — Dati extra opzionali
     * @returns {Promise<{success: boolean, id?: string, error?: string}>}
     */
    async logNotification(data) {
        try {
            // Normalizza appSlug a lowercase+trim per coerenza con sync e pagina pubblica
            const slugNorm = ((data.appSlug || '') + '').toLowerCase().trim();
            const record = {
                appId: data.appId || '',
                appSlug: slugNorm,
                comune: data.comune || '',
                title: data.title || '',
                message: data.message || '',
                source: data.source || this.SOURCES.MANUAL,
                platform: data.platform || 'all',
                sentAt: firebase.firestore.FieldValue.serverTimestamp(),
                sentBy: data.sentBy || 'system',
                sentByName: data.sentByName || 'Sistema Automatico',
                status: data.status || this.STATUS.SENT,
                error: data.error || null,
                metadata: data.metadata || {}
            };

            const docRef = await db.collection('push_history').add(record);
            console.log('[PushHistory] Notifica registrata:', docRef.id, '—', data.comune);

            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('[PushHistory] Errore registrazione notifica:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Registra notifiche push per più app (batch) — tipicamente da broadcast CRM
     *
     * @param {Array<Object>} notifications — Array di oggetti come logNotification
     * @returns {Promise<{success: boolean, count?: number, error?: string}>}
     */
    async logNotificationsBatch(notifications) {
        try {
            if (!notifications || notifications.length === 0) {
                return { success: true, count: 0 };
            }

            // Firestore batch supporta max 500 operazioni
            const batchSize = 450;
            let totalWritten = 0;

            for (let i = 0; i < notifications.length; i += batchSize) {
                const chunk = notifications.slice(i, i + batchSize);
                const batch = db.batch();

                chunk.forEach(data => {
                    // Normalizza appSlug a lowercase+trim per ogni entry del batch
                    const slugNorm = ((data.appSlug || '') + '').toLowerCase().trim();
                    const docRef = db.collection('push_history').doc();
                    batch.set(docRef, {
                        appId: data.appId || '',
                        appSlug: slugNorm,
                        comune: data.comune || '',
                        title: data.title || '',
                        message: data.message || '',
                        source: data.source || this.SOURCES.MANUAL,
                        platform: data.platform || 'all',
                        sentAt: firebase.firestore.FieldValue.serverTimestamp(),
                        sentBy: data.sentBy || 'system',
                        sentByName: data.sentByName || 'Sistema Automatico',
                        status: data.status || this.STATUS.SENT,
                        error: data.error || null,
                        metadata: data.metadata || {}
                    });
                });

                await batch.commit();
                totalWritten += chunk.length;
            }

            console.log('[PushHistory] Batch registrato:', totalWritten, 'notifiche');
            return { success: true, count: totalWritten };
        } catch (error) {
            console.error('[PushHistory] Errore batch:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Recupera lo storico notifiche per una specifica app (per la webapp pubblica)
     *
     * @param {string} appSlug — Slug dell'app (es: "locri")
     * @param {number} limit — Numero massimo di risultati (default: 20)
     * @param {Object|null} lastDoc — Ultimo documento per paginazione
     * @returns {Promise<{success: boolean, notifications: Array, lastDoc: Object|null}>}
     */
    async getHistoryByApp(appSlug, limit = 20, lastDoc = null) {
        // Normalizza lo slug a lowercase/trim: i documenti sono sempre salvati
        // lowercase dal sync, quindi una query con casing diverso non matcherebbe.
        const slug = (appSlug || '').toString().toLowerCase().trim();
        try {
            let query = db.collection('push_history')
                .where('appSlug', '==', slug)
                .where('status', '==', this.STATUS.SENT)
                .orderBy('sentAt', 'desc')
                .limit(limit);

            if (lastDoc) {
                query = query.startAfter(lastDoc);
            }

            const snapshot = await query.get();
            const notifications = [];
            let newLastDoc = null;

            snapshot.forEach(doc => {
                notifications.push({ id: doc.id, ...doc.data() });
                newLastDoc = doc;
            });

            return { success: true, notifications, lastDoc: newLastDoc };
        } catch (error) {
            console.error('[PushHistory] Errore recupero storico:', error);

            // Fallback senza orderBy se indice mancante
            try {
                console.warn('[PushHistory] Tentativo fallback senza orderBy...');
                let fallbackQuery = db.collection('push_history')
                    .where('appSlug', '==', slug)
                    .where('status', '==', this.STATUS.SENT)
                    .limit(limit * 2);

                const fallbackSnapshot = await fallbackQuery.get();
                const fallbackNotifications = [];

                fallbackSnapshot.forEach(doc => {
                    fallbackNotifications.push({ id: doc.id, ...doc.data() });
                });

                // Ordina manualmente
                fallbackNotifications.sort((a, b) => {
                    const dateA = a.sentAt?.toDate ? a.sentAt.toDate() : new Date(a.sentAt || 0);
                    const dateB = b.sentAt?.toDate ? b.sentAt.toDate() : new Date(b.sentAt || 0);
                    return dateB - dateA;
                });

                return {
                    success: true,
                    notifications: fallbackNotifications.slice(0, limit),
                    lastDoc: null
                };
            } catch (fallbackError) {
                console.error('[PushHistory] Anche il fallback è fallito:', fallbackError);
                return { success: false, notifications: [], lastDoc: null, error: fallbackError.message };
            }
        }
    },

    /**
     * Recupera lo storico notifiche per il CRM (tutte le app, con filtri)
     *
     * @param {Object} filters
     * @param {string} filters.source — Filtra per sorgente
     * @param {string} filters.appSlug — Filtra per app
     * @param {string} filters.status — Filtra per stato
     * @param {number} filters.limit — Numero massimo (default: 50)
     * @param {Object|null} filters.lastDoc — Ultimo documento per paginazione
     * @returns {Promise<{success: boolean, notifications: Array, lastDoc: Object|null}>}
     */
    async getHistoryForCRM(filters = {}) {
        try {
            let query = db.collection('push_history');

            if (filters.source) {
                query = query.where('source', '==', filters.source);
            }
            if (filters.appSlug) {
                query = query.where('appSlug', '==', filters.appSlug);
            }
            if (filters.status) {
                query = query.where('status', '==', filters.status);
            }

            query = query.orderBy('sentAt', 'desc').limit(filters.limit || 50);

            if (filters.lastDoc) {
                query = query.startAfter(filters.lastDoc);
            }

            const snapshot = await query.get();
            const notifications = [];
            let lastDoc = null;

            snapshot.forEach(doc => {
                notifications.push({ id: doc.id, ...doc.data() });
                lastDoc = doc;
            });

            return { success: true, notifications, lastDoc };
        } catch (error) {
            console.error('[PushHistory] Errore recupero CRM:', error);
            return { success: false, notifications: [], lastDoc: null, error: error.message };
        }
    },

    /**
     * Conta le notifiche per una specifica app (per statistiche)
     *
     * @param {string} appSlug
     * @returns {Promise<{success: boolean, count: number}>}
     */
    async getCountByApp(appSlug) {
        const slug = (appSlug || '').toString().toLowerCase().trim();
        try {
            // Count aggregato: 1 read invece di N (Firebase 10+)
            try {
                const agg = await db.collection('push_history')
                    .where('appSlug', '==', slug)
                    .where('status', '==', this.STATUS.SENT)
                    .count().get();
                return { success: true, count: agg.data().count };
            } catch (eCount) {
                // Fallback per SDK più vecchi
                const snapshot = await db.collection('push_history')
                    .where('appSlug', '==', slug)
                    .where('status', '==', this.STATUS.SENT)
                    .get();
                return { success: true, count: snapshot.size };
            }
        } catch (error) {
            console.error('[PushHistory] Errore conteggio:', error);
            return { success: false, count: 0 };
        }
    },

    /**
     * Conta le notifiche per sorgente (per dashboard CRM)
     *
     * @param {string} source — Una delle SOURCES
     * @param {number} days — Ultimi N giorni (default: 30)
     * @returns {Promise<{success: boolean, count: number}>}
     */
    async getCountBySource(source, days = 30) {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            try {
                const agg = await db.collection('push_history')
                    .where('source', '==', source)
                    .where('sentAt', '>=', startDate)
                    .count().get();
                return { success: true, count: agg.data().count };
            } catch (eCount) {
                const snapshot = await db.collection('push_history')
                    .where('source', '==', source)
                    .where('sentAt', '>=', startDate)
                    .get();
                return { success: true, count: snapshot.size };
            }
        } catch (error) {
            console.error('[PushHistory] Errore conteggio per sorgente:', error);
            return { success: false, count: 0 };
        }
    },

    /**
     * Formatta la data per la visualizzazione pubblica
     *
     * @param {Object|Date} timestamp — Firestore Timestamp o Date
     * @returns {string} Data formattata (es: "3 Apr 2026, 14:30")
     */
    formatDate(timestamp) {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('it-IT', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    /**
     * Formatta data relativa (es: "2 ore fa")
     *
     * @param {Object|Date} timestamp
     * @returns {string}
     */
    formatTimeAgo(timestamp) {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);

        if (seconds < 60) return 'Ora';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} min fa`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} ore fa`;
        if (seconds < 172800) return 'Ieri';
        if (seconds < 604800) return `${Math.floor(seconds / 86400)} giorni fa`;

        return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
    },

    /**
     * Restituisce l'icona FontAwesome per la sorgente
     *
     * @param {string} source
     * @returns {string} Classe icona FA
     */
    getSourceIcon(source) {
        const icons = {
            [this.SOURCES.CRM_BROADCAST]: 'fa-bullhorn',
            [this.SOURCES.CRM_API]: 'fa-code',
            [this.SOURCES.RSS_AUTO]: 'fa-rss',
            [this.SOURCES.CALENDAR_AUTO]: 'fa-calendar-alt',
            [this.SOURCES.METEO_ALERT]: 'fa-cloud-sun-rain',
            [this.SOURCES.MANUAL]: 'fa-hand-pointer'
        };
        return icons[source] || 'fa-bell';
    },

    /**
     * Restituisce l'etichetta per la sorgente
     *
     * @param {string} source
     * @returns {string} Etichetta leggibile
     */
    getSourceLabel(source) {
        const labels = {
            [this.SOURCES.CRM_BROADCAST]: 'Broadcast CRM',
            [this.SOURCES.CRM_API]: 'API CRM',
            [this.SOURCES.RSS_AUTO]: 'RSS Automatica',
            [this.SOURCES.CALENDAR_AUTO]: 'Calendario',
            [this.SOURCES.METEO_ALERT]: 'Allerta Meteo',
            [this.SOURCES.MANUAL]: 'Manuale'
        };
        return labels[source] || 'Altro';
    },

    /**
     * Restituisce il colore per la sorgente
     *
     * @param {string} source
     * @returns {string} Colore CSS
     */
    getSourceColor(source) {
        const colors = {
            [this.SOURCES.CRM_BROADCAST]: '#145284',
            [this.SOURCES.CRM_API]: '#2E6DA8',
            [this.SOURCES.RSS_AUTO]: '#3CA434',
            [this.SOURCES.CALENDAR_AUTO]: '#FFCC00',
            [this.SOURCES.METEO_ALERT]: '#D32F2F',
            [this.SOURCES.MANUAL]: '#9B9B9B'
        };
        return colors[source] || '#4A4A4A';
    }
};

// Esponi globalmente
window.PushHistoryService = PushHistoryService;

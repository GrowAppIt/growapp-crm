/**
 * FCM Service — Gestione Firebase Cloud Messaging
 *
 * Si occupa di:
 * - Registrazione Service Worker
 * - Richiesta permesso notifiche
 * - Ottenimento/salvataggio token FCM
 * - Ricezione notifiche in foreground
 * - Invio notifiche push via API serverless
 */
const FCMService = {

    _messaging: null,
    _token: null,
    _initialized: false,

    VAPID_KEY: 'BN04miaHC1xjkYldcqC_x-wBafeXIvQI2RKl60eGadoXA_ykor93SrIf7vCrGRktaIR1x80LR5VExgLLaYm9m4o',

    /**
     * Inizializza FCM: registra il Service Worker e controlla il permesso
     * Chiamare DOPO il login dell'utente
     */
    async init() {
        if (this._initialized) return;

        // Controlla supporto browser
        if (!('serviceWorker' in navigator) || !('Notification' in window)) {
            console.warn('[FCM] Browser non supporta notifiche push');
            return;
        }

        // Controlla che firebase.messaging esista
        if (!firebase.messaging) {
            console.warn('[FCM] Firebase Messaging non caricato');
            return;
        }

        try {
            this._messaging = firebase.messaging();

            // Registra il Service Worker
            const swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
            console.log('[FCM] Service Worker registrato');

            // Invia la config Firebase al SW
            if (swRegistration.active) {
                swRegistration.active.postMessage({
                    type: 'FIREBASE_CONFIG',
                    config: {
                        apiKey: window.ENV.FIREBASE_API_KEY,
                        authDomain: window.ENV.FIREBASE_AUTH_DOMAIN,
                        projectId: window.ENV.FIREBASE_PROJECT_ID,
                        storageBucket: window.ENV.FIREBASE_STORAGE_BUCKET,
                        messagingSenderId: window.ENV.FIREBASE_MESSAGING_SENDER_ID,
                        appId: window.ENV.FIREBASE_APP_ID
                    }
                });
            }

            // Ascolta notifiche in FOREGROUND (tab aperta)
            this._messaging.onMessage((payload) => {
                console.log('[FCM] Notifica foreground:', payload);
                this._showForegroundNotification(payload);
            });

            this._initialized = true;

            // Se il permesso è già granted, ottieni/aggiorna il token
            if (Notification.permission === 'granted') {
                await this._getAndSaveToken();
            }

            console.log('[FCM] Inizializzato. Permesso attuale:', Notification.permission);

        } catch (error) {
            console.error('[FCM] Errore inizializzazione:', error);
        }
    },

    /**
     * Richiede il permesso per le notifiche e salva il token
     * Ritorna true se il permesso viene concesso, false altrimenti
     */
    async requestPermission() {
        try {
            const permission = await Notification.requestPermission();

            if (permission === 'granted') {
                console.log('[FCM] Permesso notifiche concesso');
                await this._getAndSaveToken();
                return true;
            } else {
                console.warn('[FCM] Permesso notifiche negato:', permission);
                return false;
            }
        } catch (error) {
            console.error('[FCM] Errore richiesta permesso:', error);
            return false;
        }
    },

    /**
     * Controlla se le notifiche push sono attive per l'utente corrente
     */
    isEnabled() {
        return Notification.permission === 'granted' && this._token !== null;
    },

    /**
     * Controlla lo stato del permesso senza chiederlo
     */
    getPermissionStatus() {
        if (!('Notification' in window)) return 'unsupported';
        return Notification.permission; // 'granted', 'denied', 'default'
    },

    /**
     * Ottiene il token FCM e lo salva su Firestore nell'utente
     */
    async _getAndSaveToken() {
        try {
            if (!this._messaging) return;

            const token = await this._messaging.getToken({
                vapidKey: this.VAPID_KEY
            });

            if (token) {
                this._token = token;
                console.log('[FCM] Token ottenuto:', token.substring(0, 20) + '...');

                // Salva il token nel documento utente su Firestore
                const userId = AuthService.getUserId();
                if (userId) {
                    await db.collection('utenti').doc(userId).update({
                        fcmTokens: firebase.firestore.FieldValue.arrayUnion(token),
                        fcmTokenUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    console.log('[FCM] Token salvato su Firestore per utente:', userId);
                }
            } else {
                console.warn('[FCM] Nessun token ottenuto');
            }
        } catch (error) {
            console.error('[FCM] Errore ottenimento token:', error);
        }
    },

    /**
     * Mostra una notifica quando l'app è in foreground (tab attiva)
     * Usa il sistema di notifiche in-app esistente + una notifica browser nativa
     */
    _showForegroundNotification(payload) {
        const title = payload.notification?.title || payload.data?.title || 'Notifica CRM';
        const body = payload.notification?.body || payload.data?.body || '';
        const data = payload.data || {};

        // 1. Mostra toast in-app (usa il sistema UI esistente)
        if (typeof UI !== 'undefined' && UI.showSuccess) {
            UI.showSuccess(title + (body ? ': ' + body : ''));
        }

        // 2. Mostra anche notifica browser nativa (se la tab è visibile ma non focalizzata)
        if (document.visibilityState !== 'visible' || !document.hasFocus()) {
            try {
                new Notification(title, {
                    body: body,
                    icon: '/img/icon-192.png',
                    tag: data.tag || 'crm-fg-' + Date.now(),
                    data: data
                });
            } catch (e) {
                // Ignora se non riesce
            }
        }

        // 3. Aggiorna il badge campanella
        if (typeof UI !== 'undefined' && UI.loadSidebarBadges) {
            UI.loadSidebarBadges();
        }
    },

    /**
     * Invia una notifica push a uno o piu utenti via API serverless
     *
     * @param {string[]} userIds - Array di userId destinatari
     * @param {string} title - Titolo della notifica
     * @param {string} body - Corpo della notifica
     * @param {object} data - Dati extra (taskId, appId, url, ecc.)
     */
    async sendPushToUsers(userIds, title, body, data = {}) {
        try {
            const response = await fetch('/api/send-notification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userIds: userIds,
                    title: title,
                    body: body,
                    data: data
                })
            });

            const result = await response.json();

            if (!response.ok) {
                console.error('[FCM] Errore invio push:', result);
                return { success: false, error: result.error };
            }

            console.log('[FCM] Push inviata:', result);
            return { success: true, ...result };
        } catch (error) {
            console.error('[FCM] Errore invio push:', error);
            return { success: false, error: error.message };
        }
    }
};

// Esponi globalmente
window.FCMService = FCMService;

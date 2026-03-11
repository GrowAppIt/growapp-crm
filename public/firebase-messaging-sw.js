/**
 * Firebase Messaging Service Worker
 * Gestisce la ricezione delle notifiche push in background
 * (quando il browser è chiuso o la tab non è attiva)
 */

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// La configurazione Firebase viene iniettata dal frontend via postMessage
// oppure usa un fallback minimo (solo messagingSenderId serve per il SW)
let firebaseConfigured = false;

self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'FIREBASE_CONFIG') {
        if (!firebaseConfigured) {
            firebase.initializeApp(event.data.config);
            firebaseConfigured = true;
        }
    }
});

// Fallback: se il SW viene avviato senza config (es. push in background),
// la configurazione viene letta dai query params del SW registration
// Firebase gestisce automaticamente le notifiche push in background

self.addEventListener('push', function(event) {
    // Se Firebase non è ancora configurato, gestisci la notifica manualmente
    if (!firebaseConfigured && event.data) {
        try {
            const payload = event.data.json();
            const notificationTitle = payload.notification?.title || 'CRM Comune.Digital';
            const notificationOptions = {
                body: payload.notification?.body || 'Hai una nuova notifica',
                icon: '/img/icon-192.png',
                badge: '/img/icon-72.png',
                tag: payload.data?.tag || 'crm-notification',
                data: payload.data || {},
                vibrate: [200, 100, 200],
                actions: [
                    { action: 'open', title: 'Apri CRM' }
                ]
            };

            event.waitUntil(
                self.registration.showNotification(notificationTitle, notificationOptions)
            );
        } catch (e) {
            console.error('[SW] Errore parsing push:', e);
        }
    }
});

// Click sulla notifica: apri il CRM nella pagina corretta
self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    const data = event.notification.data || {};
    let targetUrl = '/';

    // Naviga alla pagina corretta in base al tipo di notifica
    if (data.taskId && data.appId) {
        targetUrl = `/#app/${data.appId}/task/${data.taskId}`;
    } else if (data.appId) {
        targetUrl = `/#app/${data.appId}`;
    } else if (data.url) {
        targetUrl = data.url;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            // Se c'è già una finestra CRM aperta, focalizzala
            for (const client of clientList) {
                if (client.url.includes(self.registration.scope) && 'focus' in client) {
                    client.focus();
                    client.navigate(targetUrl);
                    return;
                }
            }
            // Altrimenti apri una nuova finestra
            return clients.openWindow(targetUrl);
        })
    );
});

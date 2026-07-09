/**
 * Firebase Messaging Service Worker
 * Gestisce la ricezione delle notifiche push in background
 * (quando il browser è chiuso o la tab non è attiva)
 *
 * v10.2.0 — FIX:
 *   1. Deep link: targetUrl allineato al router (#/task/<id>, #/<pagina>/<id>).
 *      Prima era "#app/<appId>/task/<taskId>" (senza slash) e richiedeva appId,
 *      quindi il click sul banner non apriva quasi mai il task.
 *   2. Banner in background sempre mostrato dal nostro handler (prima veniva
 *      saltato se il SW aveva ricevuto la config via postMessage → notifiche perse),
 *      con guardia anti-doppione se esiste già una finestra CRM visibile.
 */

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// La configurazione Firebase viene iniettata dal frontend via postMessage.
let firebaseConfigured = false;

self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'FIREBASE_CONFIG') {
        if (!firebaseConfigured) {
            try {
                firebase.initializeApp(event.data.config);
                firebaseConfigured = true;
            } catch (e) {
                console.error('[SW] initializeApp fallito:', e);
            }
        }
    }
});

self.addEventListener('push', function(event) {
    if (!event.data) return;

    let payload;
    try {
        payload = event.data.json();
    } catch (e) {
        console.error('[SW] Errore parsing push:', e);
        return;
    }

    const notif = payload.notification || {};
    const data = payload.data || {};
    const title = notif.title || data.title || 'CRM Comune.Digital';
    const body = notif.body || data.body || 'Hai una nuova notifica';

    event.waitUntil((async () => {
        // Il SW è l'UNICO che mostra i banner OS (le pagine mostrano solo il toast in-app).
        // Salta SOLO se esiste una finestra CRM VISIBILE: lì l'utente vede già il toast in-app,
        // quindi niente banner. In tutti gli altri casi (tab in background, congelata, o app
        // chiusa) mostra il banner — così non si perdono notifiche e non si duplicano.
        try {
            const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
            if (wins.some(c => c.visibilityState === 'visible')) return;
        } catch (e) { /* prosegui e mostra comunque */ }

        await self.registration.showNotification(title, {
            body: body,
            icon: '/img/icon-192.png',
            badge: '/img/icon-72.png',
            tag: data.tag || ('crm-' + (data.type || 'notification')),
            renotify: true,
            data: data,
            vibrate: [200, 100, 200],
            actions: [
                { action: 'open', title: 'Apri' }
            ]
        });
    })());
});

// Click sulla notifica: apri il CRM nella pagina corretta
self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    const data = event.notification.data || {};
    const has = (v) => v && v !== 'null' && v !== 'undefined' && v !== '';

    // Costruisci il target ALLINEATO al router (app.js handleHashChange).
    let targetUrl = '/';
    if (has(data.linkToPage)) {
        targetUrl = '/#/' + data.linkToPage + (has(data.linkToId) ? '/' + data.linkToId : '');
    } else if (has(data.taskId)) {
        targetUrl = '/#/task/' + data.taskId;   // il router apre il dettaglio del task
    } else if (has(data.conversationId)) {
        targetUrl = '/#/messaggi/' + data.conversationId;   // apre la conversazione chat
    } else if (has(data.appId)) {
        targetUrl = '/#/dettaglio-app/' + data.appId;
    } else if (has(data.url)) {
        targetUrl = data.url;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            // Se c'è già una finestra CRM aperta, focalizzala e naviga
            for (const client of clientList) {
                if (client.url.includes(self.registration.scope) && 'focus' in client) {
                    client.focus();
                    if ('navigate' in client) client.navigate(targetUrl);
                    return;
                }
            }
            // Altrimenti apri una nuova finestra
            return clients.openWindow(targetUrl);
        })
    );
});

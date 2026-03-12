/**
 * Messaging Service — CRM Comune.Digital
 * Gestisce chat 1-a-1 e di gruppo, presenza online, messaggi real-time.
 * Usa Firestore: collections "chat_conversations" e "presence".
 */
const MessagingService = {

    // ══════════════════════════════════════════
    // PRESENZA ONLINE
    // ══════════════════════════════════════════

    _heartbeatInterval: null,
    _visibilityHandler: null,
    HEARTBEAT_MS: 60000,          // 60 secondi
    HEARTBEAT_IDLE_MS: 300000,    // 5 minuti quando tab non visibile
    ONLINE_THRESHOLD: 120000,     // 2 min → online (verde)
    IDLE_THRESHOLD: 600000,       // 10 min → inattivo (giallo)

    /**
     * Avvia il sistema di presenza (da chiamare al login / onAuthStateChanged)
     */
    startPresence() {
        const userId = AuthService.getUserId();
        if (!userId) return;

        // Scrivi subito "online"
        this._writePresence(userId, true);

        // Heartbeat periodico
        this._heartbeatInterval = setInterval(() => {
            this._writePresence(userId, true);
        }, this.HEARTBEAT_MS);

        // Gestione visibilità tab
        this._visibilityHandler = () => {
            if (document.hidden) {
                // Tab nascosto → rallenta heartbeat
                clearInterval(this._heartbeatInterval);
                this._heartbeatInterval = setInterval(() => {
                    this._writePresence(userId, true);
                }, this.HEARTBEAT_IDLE_MS);
            } else {
                // Tab visibile → riprendi heartbeat normale + scrivi subito
                clearInterval(this._heartbeatInterval);
                this._writePresence(userId, true);
                this._heartbeatInterval = setInterval(() => {
                    this._writePresence(userId, true);
                }, this.HEARTBEAT_MS);
            }
        };
        document.addEventListener('visibilitychange', this._visibilityHandler);

        // beforeunload → segna offline
        window.addEventListener('beforeunload', () => {
            this._writePresenceSync(userId);
        });
    },

    /**
     * Ferma il sistema di presenza (logout)
     */
    stopPresence() {
        const userId = AuthService.getUserId();
        if (userId) {
            this._writePresence(userId, false);
        }
        if (this._heartbeatInterval) {
            clearInterval(this._heartbeatInterval);
            this._heartbeatInterval = null;
        }
        if (this._visibilityHandler) {
            document.removeEventListener('visibilitychange', this._visibilityHandler);
            this._visibilityHandler = null;
        }
    },

    /**
     * Scrive il documento presenza su Firestore
     */
    async _writePresence(userId, online) {
        try {
            await db.collection('presence').doc(userId).set({
                online: online,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
                status: online ? (localStorage.getItem('crm_presence_status') || 'disponibile') : 'offline',
                statusText: localStorage.getItem('crm_presence_text') || null
            }, { merge: true });
        } catch (e) {
            // Silenzioso — non bloccare il CRM per un errore di presenza
        }
    },

    /**
     * Scrittura sincrona per beforeunload (sendBeacon non disponibile per Firestore)
     */
    _writePresenceSync(userId) {
        try {
            // Usa update con merge per non bloccare — Firestore compat non ha sendBeacon
            db.collection('presence').doc(userId).set({
                online: false,
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch (e) { /* silenzioso */ }
    },

    /**
     * Cambia il proprio stato di presenza
     */
    setMyStatus(status, statusText) {
        localStorage.setItem('crm_presence_status', status);
        if (statusText) {
            localStorage.setItem('crm_presence_text', statusText);
        } else {
            localStorage.removeItem('crm_presence_text');
        }
        const userId = AuthService.getUserId();
        if (userId) {
            this._writePresence(userId, true);
        }
    },

    /**
     * Legge la presenza di più utenti in un colpo solo
     * Ritorna { userId: { online, lastSeen, status, statusText, presenceState } }
     */
    async getPresenceBatch(userIds) {
        if (!userIds || userIds.length === 0) return {};

        const result = {};
        // Firestore "in" supporta max 30 — splitta se necessario
        const chunks = [];
        for (let i = 0; i < userIds.length; i += 30) {
            chunks.push(userIds.slice(i, i + 30));
        }

        for (const chunk of chunks) {
            try {
                const snap = await db.collection('presence')
                    .where(firebase.firestore.FieldPath.documentId(), 'in', chunk)
                    .get();

                snap.forEach(doc => {
                    const data = doc.data();
                    const lastSeen = data.lastSeen ? data.lastSeen.toMillis() : 0;
                    const elapsed = Date.now() - lastSeen;

                    let presenceState = 'offline';
                    if (data.online && elapsed < this.ONLINE_THRESHOLD) {
                        presenceState = 'online';
                    } else if (data.online && elapsed < this.IDLE_THRESHOLD) {
                        presenceState = 'idle';
                    }

                    // Override se stato manuale
                    if (data.status === 'non_disturbare' || data.status === 'in_ferie') {
                        presenceState = data.status;
                    }

                    result[doc.id] = {
                        online: data.online,
                        lastSeen: lastSeen,
                        status: data.status || 'offline',
                        statusText: data.statusText || null,
                        presenceState: presenceState
                    };
                });
            } catch (e) {
                console.warn('Errore lettura presenza batch:', e);
            }
        }

        return result;
    },

    /**
     * Ritorna la classe CSS del pallino presenza
     */
    getPresenceDot(presenceState) {
        switch (presenceState) {
            case 'online': return 'presence-online';
            case 'idle': return 'presence-idle';
            case 'non_disturbare': return 'presence-dnd';
            case 'in_ferie': return 'presence-away';
            default: return 'presence-offline';
        }
    },

    /**
     * Ritorna il colore del pallino presenza
     */
    getPresenceColor(presenceState) {
        switch (presenceState) {
            case 'online': return '#3CA434';
            case 'idle': return '#FFCC00';
            case 'non_disturbare': return '#D32F2F';
            case 'in_ferie': return '#9B9B9B';
            default: return '#9B9B9B';
        }
    },

    // ══════════════════════════════════════════
    // CONVERSAZIONI
    // ══════════════════════════════════════════

    /**
     * Carica la lista utenti del team (per "Nuovo messaggio")
     */
    async getTeamUsers() {
        try {
            const snap = await db.collection('utenti').get();
            const currentId = AuthService.getUserId();
            const users = [];
            snap.forEach(doc => {
                if (doc.id !== currentId) {
                    const d = doc.data();
                    if (d.stato !== 'DISATTIVO') {
                        users.push({
                            id: doc.id,
                            nome: d.nome || '',
                            cognome: d.cognome || '',
                            nomeCompleto: `${d.nome || ''} ${d.cognome || ''}`.trim(),
                            ruolo: d.ruolo || '',
                            photoURL: d.photoURL || null
                        });
                    }
                }
            });
            return users.sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto));
        } catch (e) {
            console.error('Errore caricamento team:', e);
            return [];
        }
    },

    /**
     * Trova o crea una chat diretta 1-a-1
     */
    async getOrCreateDirectChat(targetUserId) {
        const myId = AuthService.getUserId();
        if (!myId || !targetUserId) return null;

        // Cerca conversazione diretta esistente tra i due utenti
        // Ordina gli ID per avere un lookup consistente
        const sortedIds = [myId, targetUserId].sort();

        try {
            const existing = await db.collection('chat_conversations')
                .where('type', '==', 'direct')
                .where('participantIds', '==', sortedIds)
                .limit(1)
                .get();

            if (!existing.empty) {
                const doc = existing.docs[0];
                return { id: doc.id, ...doc.data() };
            }

            // Crea nuova conversazione
            const myData = AuthService.getCurrentUserData();
            const targetDoc = await db.collection('utenti').doc(targetUserId).get();
            const targetData = targetDoc.exists ? targetDoc.data() : {};

            const myName = `${myData.nome || ''} ${myData.cognome || ''}`.trim();
            const targetName = `${targetData.nome || ''} ${targetData.cognome || ''}`.trim();

            const convData = {
                type: 'direct',
                participantIds: sortedIds,
                participantInfo: {
                    [myId]: {
                        nome: myName,
                        photoURL: myData.photoURL || null,
                        ruolo: myData.ruolo || ''
                    },
                    [targetUserId]: {
                        nome: targetName,
                        photoURL: targetData.photoURL || null,
                        ruolo: targetData.ruolo || ''
                    }
                },
                title: null,
                icon: null,
                lastMessage: null,
                unreadCounts: { [myId]: 0, [targetUserId]: 0 },
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            const ref = await db.collection('chat_conversations').add(convData);
            return { id: ref.id, ...convData };
        } catch (e) {
            console.error('Errore getOrCreateDirectChat:', e);
            return null;
        }
    },

    /**
     * Crea una chat di gruppo
     */
    async createGroupChat(title, participantIds, icon) {
        const myId = AuthService.getUserId();
        if (!myId) return null;

        // Includi me stesso se non già presente
        if (!participantIds.includes(myId)) {
            participantIds.push(myId);
        }

        try {
            // Carica info di tutti i partecipanti
            const participantInfo = {};
            for (const uid of participantIds) {
                if (uid === myId) {
                    const myData = AuthService.getCurrentUserData();
                    participantInfo[uid] = {
                        nome: `${myData.nome || ''} ${myData.cognome || ''}`.trim(),
                        photoURL: myData.photoURL || null,
                        ruolo: myData.ruolo || ''
                    };
                } else {
                    const doc = await db.collection('utenti').doc(uid).get();
                    if (doc.exists) {
                        const d = doc.data();
                        participantInfo[uid] = {
                            nome: `${d.nome || ''} ${d.cognome || ''}`.trim(),
                            photoURL: d.photoURL || null,
                            ruolo: d.ruolo || ''
                        };
                    }
                }
            }

            const unreadCounts = {};
            participantIds.forEach(id => unreadCounts[id] = 0);

            const convData = {
                type: 'group',
                participantIds: participantIds,
                participantInfo: participantInfo,
                title: title || 'Gruppo senza nome',
                icon: icon || 'fa-users',
                lastMessage: null,
                unreadCounts: unreadCounts,
                createdBy: myId,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            const ref = await db.collection('chat_conversations').add(convData);

            // Messaggio di sistema
            await this.sendMessage(ref.id, `${participantInfo[myId].nome} ha creato il gruppo "${title}"`, 'system');

            return { id: ref.id, ...convData };
        } catch (e) {
            console.error('Errore createGroupChat:', e);
            return null;
        }
    },

    // ══════════════════════════════════════════
    // MESSAGGI
    // ══════════════════════════════════════════

    /**
     * Invia un messaggio in una conversazione
     */
    async sendMessage(conversationId, text, type, attachment) {
        const userId = AuthService.getUserId();
        const userData = AuthService.getCurrentUserData();
        if (!userId || (!text && !attachment)) return null;
        if (!text) text = '';

        const senderName = `${userData.nome || ''} ${userData.cognome || ''}`.trim();

        try {
            const msgData = {
                senderId: userId,
                senderName: senderName,
                senderPhoto: userData.photoURL || null,
                text: text,
                type: type || 'text',
                attachment: attachment || null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            // Aggiungi messaggio nella subcollection
            const msgRef = await db.collection('chat_conversations')
                .doc(conversationId)
                .collection('messages')
                .add(msgData);

            // Aggiorna il documento conversazione (denormalizzazione)
            const convRef = db.collection('chat_conversations').doc(conversationId);
            const convDoc = await convRef.get();

            if (convDoc.exists) {
                const convData = convDoc.data();
                const updateData = {
                    lastMessage: {
                        text: type === 'system' ? text : (text.length > 80 ? text.substring(0, 80) + '…' : text),
                        senderId: userId,
                        senderName: senderName,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp()
                    },
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                // Incrementa unreadCounts per tutti tranne il mittente
                const unreadCounts = convData.unreadCounts || {};
                (convData.participantIds || []).forEach(pid => {
                    if (pid !== userId) {
                        unreadCounts[pid] = (unreadCounts[pid] || 0) + 1;
                    }
                });
                updateData.unreadCounts = unreadCounts;

                await convRef.update(updateData);

                // Push notification ai destinatari (se non è messaggio di sistema)
                if (type !== 'system' && typeof FCMService !== 'undefined') {
                    const recipientIds = (convData.participantIds || []).filter(id => id !== userId);
                    if (recipientIds.length > 0) {
                        const chatTitle = convData.type === 'direct'
                            ? senderName
                            : (convData.title || 'Gruppo');

                        FCMService.sendPushToUsers(
                            recipientIds,
                            `💬 ${chatTitle}`,
                            text.length > 100 ? text.substring(0, 100) + '…' : text,
                            { type: 'chat_message', conversationId: conversationId }
                        ).catch(e => console.warn('Push chat fallita:', e));
                    }
                }
            }

            return { id: msgRef.id, ...msgData };
        } catch (e) {
            console.error('Errore sendMessage:', e);
            return null;
        }
    },

    /**
     * Segna una conversazione come letta per l'utente corrente
     */
    async markConversationRead(conversationId) {
        const userId = AuthService.getUserId();
        if (!userId) return;

        try {
            await db.collection('chat_conversations').doc(conversationId).update({
                [`unreadCounts.${userId}`]: 0
            });
        } catch (e) {
            console.warn('Errore markConversationRead:', e);
        }
    },

    // ══════════════════════════════════════════
    // GESTIONE CONVERSAZIONI (elimina, abbandona)
    // ══════════════════════════════════════════

    /**
     * Elimina un gruppo (solo il creatore può farlo).
     * Cancella tutti i messaggi nella subcollection e poi il documento conversazione.
     */
    async deleteGroup(conversationId) {
        const userId = AuthService.getUserId();
        if (!userId) return { success: false, error: 'Non autenticato' };

        try {
            const convRef = db.collection('chat_conversations').doc(conversationId);
            const convDoc = await convRef.get();
            if (!convDoc.exists) return { success: false, error: 'Conversazione non trovata' };

            const convData = convDoc.data();

            // Solo il creatore o SUPER_ADMIN può eliminare
            if (convData.createdBy !== userId && AuthService.getUserRole() !== 'SUPER_ADMIN') {
                return { success: false, error: 'Solo chi ha creato il gruppo può eliminarlo' };
            }

            // Elimina tutti i messaggi nella subcollection (batch da 500)
            const messagesRef = convRef.collection('messages');
            let snap = await messagesRef.limit(500).get();
            while (!snap.empty) {
                const batch = db.batch();
                snap.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                snap = await messagesRef.limit(500).get();
            }

            // Elimina il documento conversazione
            await convRef.delete();

            return { success: true };
        } catch (e) {
            console.error('Errore deleteGroup:', e);
            return { success: false, error: e.message };
        }
    },

    /**
     * Abbandona un gruppo (rimuovi te stesso dai partecipanti).
     * Se rimane un solo partecipante, il gruppo viene eliminato.
     */
    async leaveGroup(conversationId) {
        const userId = AuthService.getUserId();
        if (!userId) return { success: false, error: 'Non autenticato' };

        try {
            const convRef = db.collection('chat_conversations').doc(conversationId);
            const convDoc = await convRef.get();
            if (!convDoc.exists) return { success: false, error: 'Conversazione non trovata' };

            const convData = convDoc.data();
            const participants = convData.participantIds || [];

            if (!participants.includes(userId)) {
                return { success: false, error: 'Non fai parte di questo gruppo' };
            }

            const remaining = participants.filter(id => id !== userId);

            if (remaining.length <= 1) {
                // Ultimo o penultimo — elimina tutto il gruppo
                return await this.deleteGroup(conversationId);
            }

            // Rimuovi dai partecipanti
            const newParticipantInfo = { ...(convData.participantInfo || {}) };
            const myName = newParticipantInfo[userId] ? newParticipantInfo[userId].nome : 'Qualcuno';
            delete newParticipantInfo[userId];

            const newUnreadCounts = { ...(convData.unreadCounts || {}) };
            delete newUnreadCounts[userId];

            await convRef.update({
                participantIds: remaining,
                participantInfo: newParticipantInfo,
                unreadCounts: newUnreadCounts,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Messaggio di sistema
            await this.sendMessage(conversationId, `${myName} ha abbandonato il gruppo`, 'system');

            return { success: true };
        } catch (e) {
            console.error('Errore leaveGroup:', e);
            return { success: false, error: e.message };
        }
    },

    /**
     * Elimina una chat diretta (per entrambi i partecipanti).
     */
    async deleteDirectChat(conversationId) {
        const userId = AuthService.getUserId();
        if (!userId) return { success: false, error: 'Non autenticato' };

        try {
            const convRef = db.collection('chat_conversations').doc(conversationId);
            const convDoc = await convRef.get();
            if (!convDoc.exists) return { success: false, error: 'Conversazione non trovata' };

            // Elimina messaggi
            const messagesRef = convRef.collection('messages');
            let snap = await messagesRef.limit(500).get();
            while (!snap.empty) {
                const batch = db.batch();
                snap.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                snap = await messagesRef.limit(500).get();
            }

            await convRef.delete();
            return { success: true };
        } catch (e) {
            console.error('Errore deleteDirectChat:', e);
            return { success: false, error: e.message };
        }
    },

    // ══════════════════════════════════════════
    // LISTENER REAL-TIME
    // ══════════════════════════════════════════

    /**
     * Listener sulla lista conversazioni dell'utente (per badge + lista chat)
     * Ritorna la funzione unsubscribe
     */
    listenToConversations(callback) {
        const userId = AuthService.getUserId();
        if (!userId) return () => {};

        return db.collection('chat_conversations')
            .where('participantIds', 'array-contains', userId)
            .orderBy('updatedAt', 'desc')
            .onSnapshot(snapshot => {
                const conversations = [];
                let totalUnread = 0;

                snapshot.forEach(doc => {
                    const data = doc.data();
                    const unread = (data.unreadCounts && data.unreadCounts[userId]) || 0;
                    totalUnread += unread;

                    conversations.push({
                        id: doc.id,
                        ...data,
                        myUnread: unread
                    });
                });

                callback(conversations, totalUnread);
            }, error => {
                console.error('Errore listener conversazioni:', error);
            });
    },

    /**
     * Listener sui messaggi di una conversazione specifica
     * Carica ultimi N messaggi. Ritorna funzione unsubscribe.
     */
    listenToMessages(conversationId, callback, limit) {
        limit = limit || 40;

        return db.collection('chat_conversations')
            .doc(conversationId)
            .collection('messages')
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .onSnapshot(snapshot => {
                const messages = [];
                snapshot.forEach(doc => {
                    messages.push({ id: doc.id, ...doc.data() });
                });
                // Inverti per ordine cronologico (dal più vecchio al più nuovo)
                messages.reverse();
                callback(messages);
            }, error => {
                console.error('Errore listener messaggi:', error);
            });
    },

    /**
     * Carica messaggi più vecchi (paginazione scroll-up)
     */
    async loadOlderMessages(conversationId, beforeTimestamp, limit) {
        limit = limit || 30;
        try {
            const snap = await db.collection('chat_conversations')
                .doc(conversationId)
                .collection('messages')
                .orderBy('createdAt', 'desc')
                .startAfter(beforeTimestamp)
                .limit(limit)
                .get();

            const messages = [];
            snap.forEach(doc => {
                messages.push({ id: doc.id, ...doc.data() });
            });
            return messages.reverse();
        } catch (e) {
            console.error('Errore loadOlderMessages:', e);
            return [];
        }
    },

    // ══════════════════════════════════════════
    // UTILITY
    // ══════════════════════════════════════════

    /**
     * Formatta timestamp messaggio
     */
    formatMessageTime(timestamp) {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        // Oggi → solo ora
        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        }

        // Ieri
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) {
            return 'Ieri ' + date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        }

        // Questa settimana → giorno + ora
        if (diff < 7 * 24 * 60 * 60 * 1000) {
            const giorni = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
            return giorni[date.getDay()] + ' ' + date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        }

        // Più vecchio → data breve
        return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
    },

    /**
     * Formatta timestamp per la lista conversazioni (più compatto)
     */
    formatConversationTime(timestamp) {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();

        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        }

        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) {
            return 'Ieri';
        }

        return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
    },

    /**
     * Genera avatar HTML per un utente
     */
    renderAvatar(nome, photoURL, size, presenceState) {
        size = size || 40;
        const initials = this._getInitials(nome);
        const dotSize = Math.max(10, Math.round(size * 0.3));

        const presenceDot = presenceState ? `
            <span style="position:absolute;bottom:0;right:0;width:${dotSize}px;height:${dotSize}px;border-radius:50%;background:${this.getPresenceColor(presenceState)};border:2px solid white;"></span>
        ` : '';

        if (photoURL) {
            return `
                <div style="position:relative;width:${size}px;height:${size}px;flex-shrink:0;">
                    <img src="${photoURL}" alt="${nome}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;">
                    ${presenceDot}
                </div>
            `;
        }

        return `
            <div style="position:relative;width:${size}px;height:${size}px;flex-shrink:0;">
                <div style="width:${size}px;height:${size}px;border-radius:50%;background:var(--blu-300);color:white;display:flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.375)}px;font-weight:700;font-family:Titillium Web,sans-serif;">
                    ${initials}
                </div>
                ${presenceDot}
            </div>
        `;
    },

    _getInitials(nome) {
        if (!nome) return '?';
        const parts = nome.trim().split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return (parts[0][0] || '?').toUpperCase();
    },

    // ══════════════════════════════════════════
    // UPLOAD FILE & AUDIO
    // ══════════════════════════════════════════

    CHAT_MAX_FILE_SIZE: 15 * 1024 * 1024, // 15MB
    CHAT_ALLOWED_TYPES: [
        'application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain', 'text/csv', 'application/zip', 'application/x-zip-compressed',
        'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'
    ],

    /**
     * Upload un file allegato alla chat su Firebase Storage
     * Ritorna { url, name, size, type, storagePath }
     */
    async uploadChatFile(file, conversationId) {
        if (!file) return null;

        if (file.size > this.CHAT_MAX_FILE_SIZE) {
            throw new Error('Il file supera i 15MB');
        }

        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `chat/${conversationId}/${timestamp}_${safeName}`;

        try {
            const storageRef = storage.ref();
            const fileRef = storageRef.child(storagePath);
            await fileRef.put(file, {
                contentType: file.type,
                customMetadata: {
                    originalName: file.name,
                    uploadedBy: AuthService.getUserId()
                }
            });

            const url = await fileRef.getDownloadURL();
            return {
                url: url,
                name: file.name,
                size: file.size,
                type: file.type,
                storagePath: storagePath
            };
        } catch (e) {
            console.error('Errore upload file chat:', e);
            throw new Error('Upload fallito: ' + e.message);
        }
    },

    /**
     * Invia un messaggio con allegato file
     */
    async sendFileMessage(conversationId, file) {
        const attachment = await this.uploadChatFile(file, conversationId);
        if (!attachment) return null;

        const isImage = file.type.startsWith('image/');
        const type = isImage ? 'image' : 'file';
        const previewText = isImage ? '📷 Immagine' : `📎 ${file.name}`;

        return await this.sendMessage(conversationId, previewText, type, attachment);
    },

    /**
     * Invia un messaggio audio
     */
    async sendAudioMessage(conversationId, audioBlob) {
        const file = new File([audioBlob], `audio_${Date.now()}.webm`, { type: audioBlob.type || 'audio/webm' });
        const attachment = await this.uploadChatFile(file, conversationId);
        if (!attachment) return null;

        return await this.sendMessage(conversationId, '🎤 Messaggio vocale', 'audio', attachment);
    },

    // ══════════════════════════════════════════
    // MODIFICA / CANCELLA MESSAGGI
    // ══════════════════════════════════════════

    /**
     * Modifica il testo di un messaggio (solo il mittente, entro 15 minuti)
     */
    async editMessage(conversationId, messageId, newText) {
        const userId = AuthService.getUserId();
        if (!userId || !newText) return { success: false, error: 'Dati mancanti' };

        try {
            const msgRef = db.collection('chat_conversations')
                .doc(conversationId)
                .collection('messages')
                .doc(messageId);

            const msgDoc = await msgRef.get();
            if (!msgDoc.exists) return { success: false, error: 'Messaggio non trovato' };

            const msgData = msgDoc.data();

            // Solo il mittente può modificare
            if (msgData.senderId !== userId) {
                return { success: false, error: 'Puoi modificare solo i tuoi messaggi' };
            }

            // Entro 15 minuti
            const createdAt = msgData.createdAt ? msgData.createdAt.toMillis() : 0;
            if (Date.now() - createdAt > 15 * 60 * 1000) {
                return { success: false, error: 'Puoi modificare solo entro 15 minuti' };
            }

            await msgRef.update({
                text: newText,
                edited: true,
                editedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Aggiorna lastMessage se era l'ultimo
            const convRef = db.collection('chat_conversations').doc(conversationId);
            const convDoc = await convRef.get();
            if (convDoc.exists) {
                const convData = convDoc.data();
                if (convData.lastMessage && convData.lastMessage.senderId === userId) {
                    await convRef.update({
                        'lastMessage.text': newText.length > 80 ? newText.substring(0, 80) + '…' : newText
                    });
                }
            }

            return { success: true };
        } catch (e) {
            console.error('Errore editMessage:', e);
            return { success: false, error: e.message };
        }
    },

    /**
     * Cancella un messaggio per tutti (solo il mittente o SUPER_ADMIN)
     */
    async deleteMessageForAll(conversationId, messageId) {
        const userId = AuthService.getUserId();
        if (!userId) return { success: false, error: 'Non autenticato' };

        try {
            const msgRef = db.collection('chat_conversations')
                .doc(conversationId)
                .collection('messages')
                .doc(messageId);

            const msgDoc = await msgRef.get();
            if (!msgDoc.exists) return { success: false, error: 'Messaggio non trovato' };

            const msgData = msgDoc.data();

            // Solo il mittente o SUPER_ADMIN
            if (msgData.senderId !== userId && AuthService.getUserRole() !== 'SUPER_ADMIN') {
                return { success: false, error: 'Non hai i permessi' };
            }

            // Elimina file da Storage se presente
            if (msgData.attachment && msgData.attachment.storagePath) {
                try {
                    await storage.ref().child(msgData.attachment.storagePath).delete();
                } catch (e) {
                    console.warn('File storage non trovato:', e);
                }
            }

            // Sostituisci con messaggio "eliminato"
            await msgRef.update({
                text: 'Messaggio eliminato',
                type: 'deleted',
                attachment: null,
                deleted: true,
                deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
                deletedBy: userId
            });

            // Aggiorna lastMessage se era l'ultimo
            const convRef = db.collection('chat_conversations').doc(conversationId);
            const convDoc = await convRef.get();
            if (convDoc.exists) {
                const convData = convDoc.data();
                if (convData.lastMessage && convData.lastMessage.senderId === msgData.senderId) {
                    await convRef.update({
                        'lastMessage.text': 'Messaggio eliminato'
                    });
                }
            }

            return { success: true };
        } catch (e) {
            console.error('Errore deleteMessageForAll:', e);
            return { success: false, error: e.message };
        }
    },

    /**
     * Formatta dimensione file leggibile
     */
    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
};

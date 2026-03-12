/**
 * Messaging UI — CRM Comune.Digital
 * Pannello laterale chat: lista conversazioni + finestra messaggi.
 * Si appoggia a MessagingService per dati e listener.
 */
const MessagingUI = {

    // Stato interno
    _conversationsListener: null,
    _messagesListener: null,
    _conversations: [],
    _currentConvId: null,
    _currentMessages: [],
    _panelOpen: false,
    _view: 'list', // 'list' | 'chat' | 'newMessage' | 'newGroup'
    _teamUsers: null,
    _presenceCache: {},
    _isRecording: false,
    _mediaRecorder: null,
    _audioChunks: [],
    _recordingTimer: null,
    _recordingSeconds: 0,
    _editingMessageId: null,
    _prevUnreadMap: {},        // Track unread per conversazione per rilevare nuovi messaggi
    _notificationsReady: false, // Permesso notifiche ottenuto

    // ══════════════════════════════════════════
    // INIZIALIZZAZIONE
    // ══════════════════════════════════════════

    init() {
        // Crea il pannello nel DOM (una sola volta)
        if (!document.getElementById('chatPanel')) {
            this._createPanel();
        }

        // Listener click sull'icona chat nell'header
        const chatToggle = document.getElementById('chatToggle');
        if (chatToggle) {
            chatToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.togglePanel();
            });
        }

        // Chiudi pannello cliccando fuori
        document.addEventListener('click', (e) => {
            if (this._panelOpen) {
                const panel = document.getElementById('chatPanel');
                const toggle = document.getElementById('chatToggle');
                if (panel && !panel.contains(e.target) && toggle && !toggle.contains(e.target)) {
                    this.closePanel();
                }
            }
        });

        // Richiedi permesso notifiche browser
        this._requestNotificationPermission();

        // Avvia listener conversazioni (per badge)
        this._startConversationsListener();
    },

    /**
     * Chiede il permesso per le notifiche browser (Chrome, Firefox, ecc.)
     */
    _requestNotificationPermission() {
        if (!('Notification' in window)) return;

        if (Notification.permission === 'granted') {
            this._notificationsReady = true;
        } else if (Notification.permission !== 'denied') {
            // Chiedi il permesso al primo click sull'icona chat
            const chatToggle = document.getElementById('chatToggle');
            if (chatToggle) {
                const askOnce = () => {
                    Notification.requestPermission().then(perm => {
                        this._notificationsReady = (perm === 'granted');
                    });
                    chatToggle.removeEventListener('click', askOnce);
                };
                chatToggle.addEventListener('click', askOnce);
            }
        }
    },

    /**
     * Cleanup (logout)
     */
    cleanup() {
        if (this._conversationsListener) {
            this._conversationsListener();
            this._conversationsListener = null;
        }
        if (this._messagesListener) {
            this._messagesListener();
            this._messagesListener = null;
        }
        this._stopRecording(true);
        this._conversations = [];
        this._currentConvId = null;
        this._currentMessages = [];
        this._panelOpen = false;
        this._teamUsers = null;
        this._prevUnreadMap = {};
    },

    // ══════════════════════════════════════════
    // PANNELLO
    // ══════════════════════════════════════════

    _createPanel() {
        const panel = document.createElement('div');
        panel.id = 'chatPanel';
        panel.className = 'chat-panel';
        panel.innerHTML = '<div id="chatPanelContent"></div>';
        // Blocca propagazione click dentro il pannello per evitare che il
        // listener "chiudi se clicchi fuori" lo chiuda durante i re-render
        panel.addEventListener('click', (e) => e.stopPropagation());
        document.body.appendChild(panel);

        // Overlay per mobile
        const overlay = document.createElement('div');
        overlay.id = 'chatPanelOverlay';
        overlay.className = 'chat-panel-overlay';
        overlay.addEventListener('click', () => this.closePanel());
        document.body.appendChild(overlay);
    },

    togglePanel() {
        if (this._panelOpen) {
            this.closePanel();
        } else {
            this.openPanel();
        }
    },

    openPanel() {
        const panel = document.getElementById('chatPanel');
        const overlay = document.getElementById('chatPanelOverlay');
        if (panel) panel.classList.add('open');
        if (overlay) overlay.classList.add('open');
        this._panelOpen = true;

        // Mostra la vista corrente
        if (this._currentConvId && this._view === 'chat') {
            this._renderChatView(this._currentConvId);
        } else {
            this._view = 'list';
            this._renderConversationList();
        }
    },

    closePanel() {
        const panel = document.getElementById('chatPanel');
        const overlay = document.getElementById('chatPanelOverlay');
        if (panel) panel.classList.remove('open');
        if (overlay) overlay.classList.remove('open');
        this._panelOpen = false;

        // Ferma listener messaggi quando chiudo
        if (this._messagesListener) {
            this._messagesListener();
            this._messagesListener = null;
        }
        this._stopRecording(true);
    },

    // ══════════════════════════════════════════
    // LISTENER CONVERSAZIONI (sempre attivo)
    // ══════════════════════════════════════════

    _startConversationsListener() {
        this._conversationsListener = MessagingService.listenToConversations(
            (conversations, totalUnread) => {
                // Rileva nuovi messaggi confrontando unread precedenti
                this._checkForNewMessages(conversations);

                this._conversations = conversations;
                this._updateBadge(totalUnread);

                // Se il pannello è aperto sulla lista, aggiorna
                if (this._panelOpen && this._view === 'list') {
                    this._renderConversationList();
                }
            }
        );
    },

    /**
     * Confronta unread attuali con precedenti e invia notifica browser
     * se ci sono nuovi messaggi in arrivo.
     */
    _checkForNewMessages(conversations) {
        const myId = AuthService.getUserId();

        conversations.forEach(conv => {
            const prevUnread = this._prevUnreadMap[conv.id] || 0;
            const currUnread = conv.myUnread || 0;

            // Se unread è aumentato → nuovo messaggio in arrivo
            if (currUnread > prevUnread) {
                // Non notificare se l'utente ha già aperto quella chat
                const isViewingThis = this._panelOpen && this._view === 'chat' && this._currentConvId === conv.id;
                if (!isViewingThis) {
                    this._showBrowserNotification(conv, myId);
                }
            }

            // Aggiorna mappa
            this._prevUnreadMap[conv.id] = currUnread;
        });
    },

    /**
     * Mostra una notifica browser nativa (popup Chrome)
     */
    _showBrowserNotification(conv, myId) {
        if (!this._notificationsReady || Notification.permission !== 'granted') return;

        // Costruisci titolo
        let title = 'Nuovo messaggio';
        if (conv.type === 'group') {
            title = conv.title || 'Gruppo';
        } else if (conv.type === 'direct') {
            const otherId = (conv.participantIds || []).find(id => id !== myId);
            const otherInfo = conv.participantInfo && conv.participantInfo[otherId];
            title = otherInfo ? otherInfo.nome : 'Nuovo messaggio';
        }

        // Corpo della notifica (anteprima ultimo messaggio)
        let body = '';
        if (conv.lastMessage) {
            const lm = conv.lastMessage;
            if (lm.type === 'image') body = '📷 Immagine';
            else if (lm.type === 'audio') body = '🎤 Messaggio vocale';
            else if (lm.type === 'file') body = '📎 File allegato';
            else body = lm.text || '';

            // Nei gruppi, mostra chi ha scritto
            if (conv.type === 'group' && lm.senderName && lm.senderId !== myId) {
                body = lm.senderName + ': ' + body;
            }
        }

        // Tronca body se troppo lungo
        if (body.length > 100) body = body.substring(0, 97) + '...';

        try {
            const notification = new Notification(title, {
                body: body,
                icon: '/img/logo.png',
                badge: '/img/logo.png',
                tag: 'chat-' + conv.id,   // Raggruppa per conversazione (sostituisce la precedente)
                renotify: true,
                silent: false
            });

            // Click sulla notifica → apri la chat
            notification.onclick = () => {
                window.focus();
                notification.close();
                this.openPanel();
                this.openChat(conv.id);
            };

            // Auto-chiudi dopo 5 secondi
            setTimeout(() => notification.close(), 5000);
        } catch (e) {
            console.warn('Errore notifica browser:', e);
        }
    },

    _updateBadge(count) {
        const badge = document.getElementById('chatBadge');
        if (!badge) return;
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    },

    // ══════════════════════════════════════════
    // VISTA: LISTA CONVERSAZIONI
    // ══════════════════════════════════════════

    async _renderConversationList() {
        this._view = 'list';
        const container = document.getElementById('chatPanelContent');
        if (!container) return;

        const myId = AuthService.getUserId();

        // Carica presenza dei partecipanti
        const allParticipantIds = new Set();
        this._conversations.forEach(c => {
            (c.participantIds || []).forEach(id => {
                if (id !== myId) allParticipantIds.add(id);
            });
        });
        this._presenceCache = await MessagingService.getPresenceBatch([...allParticipantIds]);

        container.innerHTML = `
            <!-- Header lista -->
            <div class="chat-panel-header">
                <h3 style="margin:0;font-size:1.0625rem;font-weight:700;color:white;">
                    <i class="fas fa-comments"></i> Messaggi
                </h3>
                <div style="display:flex;gap:6px;">
                    <button onclick="MessagingUI._showNewGroup()" style="background:rgba(255,255,255,0.15);border:none;color:white;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:0.8125rem;" title="Nuovo gruppo">
                        <i class="fas fa-users"></i>
                    </button>
                    <button onclick="MessagingUI._showNewMessage()" style="background:rgba(255,255,255,0.15);border:none;color:white;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:0.875rem;" title="Nuovo messaggio">
                        <i class="fas fa-user-plus"></i>
                    </button>
                    <button onclick="MessagingUI.closePanel()" style="background:none;border:none;color:white;width:32px;height:32px;cursor:pointer;font-size:1rem;" title="Chiudi">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>

            <!-- Stato presenza personale -->
            <div style="padding:0.5rem 1rem;background:var(--blu-100);display:flex;align-items:center;gap:8px;font-size:0.8125rem;cursor:pointer;border-bottom:1px solid var(--grigio-300);" onclick="MessagingUI._showStatusPicker()">
                <span style="width:8px;height:8px;border-radius:50%;background:#3CA434;"></span>
                <span style="color:var(--grigio-700);" id="chatMyStatus">${this._getMyStatusLabel()}</span>
                <i class="fas fa-chevron-down" style="color:var(--grigio-500);font-size:0.625rem;margin-left:auto;"></i>
            </div>

            <!-- Lista conversazioni -->
            <div class="chat-conv-list" id="chatConvList">
                ${this._conversations.length === 0 ? `
                    <div style="text-align:center;padding:3rem 1.5rem;color:var(--grigio-500);">
                        <i class="fas fa-comment-dots" style="font-size:2.5rem;opacity:0.3;margin-bottom:1rem;display:block;"></i>
                        <p style="margin:0 0 0.5rem;font-weight:600;">Nessuna conversazione</p>
                        <p style="margin:0;font-size:0.8125rem;">Inizia a scrivere ai tuoi colleghi!</p>
                    </div>
                ` : this._conversations.map(conv => this._renderConversationItem(conv, myId)).join('')}
            </div>
        `;
    },

    _renderConversationItem(conv, myId) {
        // Per chat dirette, mostra info dell'altro partecipante
        let displayName, displayPhoto, presenceState;

        if (conv.type === 'direct') {
            const otherId = (conv.participantIds || []).find(id => id !== myId);
            const otherInfo = conv.participantInfo && conv.participantInfo[otherId];
            displayName = otherInfo ? otherInfo.nome : 'Utente';
            displayPhoto = otherInfo ? otherInfo.photoURL : null;
            presenceState = (this._presenceCache[otherId] || {}).presenceState || 'offline';
        } else {
            displayName = conv.title || 'Gruppo';
            displayPhoto = null;
            presenceState = null;
        }

        const lastMsg = conv.lastMessage;
        const lastText = lastMsg
            ? (lastMsg.senderId === myId ? 'Tu: ' : '') + (lastMsg.text || '')
            : 'Nessun messaggio';
        const lastTime = lastMsg && lastMsg.timestamp
            ? MessagingService.formatConversationTime(lastMsg.timestamp)
            : '';

        const isUnread = conv.myUnread > 0;
        const avatar = conv.type === 'group'
            ? `<div style="position:relative;width:44px;height:44px;flex-shrink:0;">
                <div style="width:44px;height:44px;border-radius:50%;background:var(--blu-700);color:white;display:flex;align-items:center;justify-content:center;font-size:1.125rem;">
                    <i class="fas ${conv.icon || 'fa-users'}"></i>
                </div>
              </div>`
            : MessagingService.renderAvatar(displayName, displayPhoto, 44, presenceState);

        return `
            <div class="chat-conv-item ${isUnread ? 'unread' : ''}" onclick="MessagingUI.openChat('${conv.id}')">
                ${avatar}
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
                        <span style="font-weight:${isUnread ? '700' : '600'};font-size:0.9375rem;color:var(--grigio-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                            ${displayName}
                        </span>
                        <span style="font-size:0.6875rem;color:${isUnread ? 'var(--blu-700)' : 'var(--grigio-500)'};white-space:nowrap;margin-left:8px;font-weight:${isUnread ? '700' : '400'};">
                            ${lastTime}
                        </span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-size:0.8125rem;color:${isUnread ? 'var(--grigio-900)' : 'var(--grigio-500)'};font-weight:${isUnread ? '600' : '400'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;">
                            ${lastText}
                        </span>
                        ${isUnread ? `
                            <span style="background:var(--blu-700);color:white;border-radius:50%;min-width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:0.6875rem;font-weight:700;margin-left:8px;">
                                ${conv.myUnread > 99 ? '99+' : conv.myUnread}
                            </span>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    },

    // ══════════════════════════════════════════
    // VISTA: CHAT (messaggi di una conversazione)
    // ══════════════════════════════════════════

    async openChat(convId) {
        this._currentConvId = convId;
        this._view = 'chat';
        this._editingMessageId = null;

        // Segna come letta e azzera unread nella mappa notifiche
        MessagingService.markConversationRead(convId);
        this._prevUnreadMap[convId] = 0;

        this._renderChatView(convId);
    },

    async _renderChatView(convId) {
        const container = document.getElementById('chatPanelContent');
        if (!container) return;

        const myId = AuthService.getUserId();
        const conv = this._conversations.find(c => c.id === convId);

        let headerTitle, headerSubtitle;
        const isGroup = conv && conv.type === 'group';
        const isCreator = isGroup && conv.createdBy === myId;
        const isSuperAdmin = AuthService.getUserRole() === 'SUPER_ADMIN';

        if (conv && conv.type === 'direct') {
            const otherId = (conv.participantIds || []).find(id => id !== myId);
            const otherInfo = conv.participantInfo && conv.participantInfo[otherId];
            headerTitle = otherInfo ? otherInfo.nome : 'Utente';
            const pres = this._presenceCache[otherId];
            headerSubtitle = pres ? this._presenceLabel(pres.presenceState) : '';
        } else if (conv) {
            headerTitle = conv.title || 'Gruppo';
            headerSubtitle = `${(conv.participantIds || []).length} partecipanti`;
        } else {
            headerTitle = 'Chat';
            headerSubtitle = '';
        }

        container.innerHTML = `
            <!-- Header chat -->
            <div class="chat-panel-header">
                <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
                    <button onclick="MessagingUI._backToList()" style="background:none;border:none;color:white;font-size:1.125rem;cursor:pointer;padding:4px;">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <div style="min-width:0;">
                        <div style="font-weight:700;font-size:0.9375rem;color:white;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${headerTitle}</div>
                        ${headerSubtitle ? `<div style="font-size:0.75rem;color:rgba(255,255,255,0.7);">${headerSubtitle}</div>` : ''}
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:4px;">
                    <div style="position:relative;" id="chatMenuContainer">
                        <button onclick="MessagingUI._toggleChatMenu(event)" style="background:none;border:none;color:white;width:32px;height:32px;cursor:pointer;font-size:1rem;border-radius:50%;transition:background 0.15s;"
                            onmouseover="this.style.background='rgba(255,255,255,0.15)'" onmouseout="this.style.background='none'">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                        <div id="chatContextMenu" style="display:none;position:absolute;top:100%;right:0;background:white;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.2);min-width:200px;z-index:10;overflow:hidden;margin-top:4px;">
                            ${isGroup ? `
                                ${isGroup ? `
                                    <div onclick="MessagingUI._showGroupInfo('${convId}')" style="padding:0.75rem 1rem;cursor:pointer;display:flex;align-items:center;gap:10px;font-size:0.875rem;color:var(--grigio-900);transition:background 0.15s;"
                                        onmouseover="this.style.background='var(--grigio-100)'" onmouseout="this.style.background='white'">
                                        <i class="fas fa-info-circle" style="color:var(--blu-700);width:16px;text-align:center;"></i> Info gruppo
                                    </div>
                                ` : ''}
                                <div onclick="MessagingUI._confirmLeaveGroup('${convId}')" style="padding:0.75rem 1rem;cursor:pointer;display:flex;align-items:center;gap:10px;font-size:0.875rem;color:var(--grigio-900);transition:background 0.15s;"
                                    onmouseover="this.style.background='var(--grigio-100)'" onmouseout="this.style.background='white'">
                                    <i class="fas fa-sign-out-alt" style="color:var(--giallo-avviso);width:16px;text-align:center;"></i> Abbandona gruppo
                                </div>
                                ${isCreator || isSuperAdmin ? `
                                    <div onclick="MessagingUI._confirmDeleteConversation('${convId}', 'group')" style="padding:0.75rem 1rem;cursor:pointer;display:flex;align-items:center;gap:10px;font-size:0.875rem;color:var(--rosso-errore);border-top:1px solid var(--grigio-200);transition:background 0.15s;"
                                        onmouseover="this.style.background='#FFF0F0'" onmouseout="this.style.background='white'">
                                        <i class="fas fa-trash-alt" style="width:16px;text-align:center;"></i> Elimina gruppo
                                    </div>
                                ` : ''}
                            ` : `
                                <div onclick="MessagingUI._confirmDeleteConversation('${convId}', 'direct')" style="padding:0.75rem 1rem;cursor:pointer;display:flex;align-items:center;gap:10px;font-size:0.875rem;color:var(--rosso-errore);transition:background 0.15s;"
                                    onmouseover="this.style.background='#FFF0F0'" onmouseout="this.style.background='white'">
                                    <i class="fas fa-trash-alt" style="width:16px;text-align:center;"></i> Elimina conversazione
                                </div>
                            `}
                        </div>
                    </div>
                    <button onclick="MessagingUI.closePanel()" style="background:none;border:none;color:white;width:32px;height:32px;cursor:pointer;font-size:1rem;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>

            <!-- Area messaggi -->
            <div class="chat-messages-area" id="chatMessagesArea">
                <div style="text-align:center;padding:2rem;color:var(--grigio-400);">
                    <i class="fas fa-spinner fa-spin"></i>
                </div>
            </div>

            <!-- Barra editing (nascosta di default) -->
            <div id="chatEditBar" style="display:none;padding:0.5rem 1rem;background:var(--blu-100);border-top:1px solid var(--blu-300);flex-shrink:0;">
                <div style="display:flex;align-items:center;justify-content:space-between;">
                    <span style="font-size:0.8125rem;color:var(--blu-700);font-weight:600;"><i class="fas fa-pen"></i> Modifica messaggio</span>
                    <button onclick="MessagingUI._cancelEdit()" style="background:none;border:none;color:var(--grigio-500);cursor:pointer;font-size:0.875rem;padding:2px 6px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>

            <!-- Area input messaggio con allegati e audio -->
            <div class="chat-input-area" id="chatInputArea">
                <!-- Preview file selezionato -->
                <div id="chatFilePreview" style="display:none;padding:0.5rem;margin-bottom:0.5rem;background:var(--grigio-100);border-radius:8px;">
                </div>

                <div style="display:flex;align-items:flex-end;gap:6px;">
                    <!-- Bottone allegato -->
                    <button onclick="document.getElementById('chatFileInput').click()" id="chatAttachBtn"
                        style="width:36px;height:36px;border-radius:50%;background:none;color:var(--grigio-500);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1.125rem;flex-shrink:0;transition:color 0.2s;"
                        title="Allega file">
                        <i class="fas fa-paperclip"></i>
                    </button>
                    <input type="file" id="chatFileInput" style="display:none;"
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
                        onchange="MessagingUI._onFileSelected(this)">

                    <!-- Input testo -->
                    <textarea id="chatMessageInput" rows="1" placeholder="Scrivi un messaggio..."
                        style="flex:1;border:2px solid var(--grigio-300);border-radius:20px;padding:0.5rem 0.875rem;font-family:Titillium Web,sans-serif;font-size:0.875rem;resize:none;outline:none;max-height:100px;line-height:1.4;transition:border-color 0.2s;-webkit-appearance:none;"
                        onfocus="this.style.borderColor='var(--blu-500)'; MessagingUI._onInputFocus();"
                        onblur="this.style.borderColor='var(--grigio-300)'; MessagingUI._onInputBlur();"
                        onkeydown="MessagingUI._handleInputKey(event)"
                        oninput="MessagingUI._autoResizeInput(this)"></textarea>

                    <!-- Bottone audio / invio -->
                    <button onclick="MessagingUI._toggleAudioRecord()" id="chatAudioBtn"
                        style="width:36px;height:36px;border-radius:50%;background:none;color:var(--grigio-500);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1.125rem;flex-shrink:0;transition:all 0.2s;"
                        title="Messaggio vocale">
                        <i class="fas fa-microphone"></i>
                    </button>
                    <button onclick="MessagingUI._sendCurrentMessage()" id="chatSendBtn"
                        style="display:none;width:36px;height:36px;border-radius:50%;background:var(--blu-700);color:white;border:none;cursor:pointer;align-items:center;justify-content:center;font-size:0.9375rem;transition:background 0.2s;flex-shrink:0;">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>

                <!-- Registrazione audio UI -->
                <div id="chatRecordingBar" style="display:none;padding:0.5rem 0;margin-top:0.5rem;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="width:10px;height:10px;border-radius:50%;background:var(--rosso-errore);animation:chatPulse 1s infinite;"></span>
                        <span id="chatRecordingTime" style="font-size:0.8125rem;font-weight:600;color:var(--rosso-errore);font-family:monospace;">00:00</span>
                        <span style="flex:1;font-size:0.8125rem;color:var(--grigio-500);">Registrazione in corso...</span>
                        <button onclick="MessagingUI._stopRecording(false)" style="background:var(--rosso-errore);color:white;border:none;padding:0.375rem 0.75rem;border-radius:16px;font-size:0.8125rem;font-weight:600;cursor:pointer;font-family:Titillium Web,sans-serif;">
                            <i class="fas fa-stop"></i> Invia
                        </button>
                        <button onclick="MessagingUI._stopRecording(true)" style="background:none;border:none;color:var(--grigio-500);cursor:pointer;font-size:1rem;padding:4px;">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Avvia listener messaggi
        if (this._messagesListener) {
            this._messagesListener();
        }
        this._messagesListener = MessagingService.listenToMessages(convId, (messages) => {
            this._currentMessages = messages;
            this._renderMessages(messages);
        });
    },

    _renderMessages(messages) {
        const area = document.getElementById('chatMessagesArea');
        if (!area) return;

        const myId = AuthService.getUserId();

        if (messages.length === 0) {
            area.innerHTML = `
                <div style="text-align:center;padding:3rem 1.5rem;color:var(--grigio-400);">
                    <i class="fas fa-hand-peace" style="font-size:2rem;margin-bottom:0.75rem;display:block;"></i>
                    <p style="margin:0;font-size:0.875rem;">Inizia la conversazione!</p>
                </div>
            `;
            return;
        }

        let html = '';
        let lastDate = '';
        let lastSenderId = '';

        messages.forEach((msg, i) => {
            const isSystem = msg.type === 'system';
            const isDeleted = msg.type === 'deleted' || msg.deleted;
            const isMine = msg.senderId === myId;

            // Separatore data
            const msgDate = msg.createdAt
                ? (msg.createdAt.toDate ? msg.createdAt.toDate().toLocaleDateString('it-IT') : new Date(msg.createdAt).toLocaleDateString('it-IT'))
                : '';
            if (msgDate && msgDate !== lastDate) {
                html += `<div style="text-align:center;margin:1rem 0 0.5rem;"><span style="background:var(--grigio-200);color:var(--grigio-600);padding:3px 12px;border-radius:12px;font-size:0.75rem;font-weight:600;">${msgDate}</span></div>`;
                lastDate = msgDate;
            }

            // Messaggio di sistema
            if (isSystem) {
                html += `<div style="text-align:center;margin:0.5rem 0;"><span style="color:var(--grigio-500);font-size:0.8125rem;font-style:italic;">${msg.text}</span></div>`;
                lastSenderId = '';
                return;
            }

            // Messaggio eliminato
            if (isDeleted) {
                html += `
                    <div style="display:flex;justify-content:${isMine ? 'flex-end' : 'flex-start'};margin-bottom:4px;padding:0 0.75rem;">
                        <div style="background:transparent;border:1px dashed var(--grigio-300);border-radius:12px;padding:0.375rem 0.75rem;">
                            <span style="color:var(--grigio-500);font-size:0.8125rem;font-style:italic;"><i class="fas fa-ban" style="margin-right:4px;font-size:0.6875rem;"></i>Messaggio eliminato</span>
                        </div>
                    </div>
                `;
                lastSenderId = '';
                return;
            }

            // Raggruppa messaggi consecutivi dello stesso mittente
            const showAvatar = msg.senderId !== lastSenderId;
            lastSenderId = msg.senderId;

            const time = msg.createdAt ? MessagingService.formatMessageTime(msg.createdAt) : '';
            const editedLabel = msg.edited ? ' <span style="font-size:0.625rem;opacity:0.6;font-style:italic;">modificato</span>' : '';

            // Contenuto messaggio (testo, immagine, file, audio)
            const contentHtml = this._renderMessageContent(msg);

            // Azioni messaggio — hover su desktop, long-press su mobile
            // msg.type può essere 'text', undefined (vecchi messaggi) o altro
            const msgType = msg.type || 'text';
            const canEdit = isMine && msgType === 'text' && msg.createdAt;
            const canDelete = isMine || AuthService.getUserRole() === 'SUPER_ADMIN';
            const hasActions = canEdit || canDelete;

            // Attributi touch per long-press su mobile
            const touchAttrs = hasActions ? `
                ontouchstart="MessagingUI._touchStart(event, '${msg.id}', ${isMine}, ${canEdit})"
                ontouchend="MessagingUI._touchEnd()"
                ontouchmove="MessagingUI._touchEnd()"
            ` : '';

            // Pulsante ▼ dentro la bolla (visibile al hover o long-press)
            const msgActionBtn = hasActions ? `
                <div class="chat-msg-actions" data-msgid="${msg.id}" style="display:none;position:absolute;top:4px;${isMine ? 'left:6px;' : 'right:6px;'}z-index:5;">
                    <button onclick="event.stopPropagation(); MessagingUI._showMsgMenu(event, '${msg.id}', ${isMine}, ${canEdit})"
                        style="background:rgba(255,255,255,0.9);border:1px solid var(--grigio-300);width:24px;height:24px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.15);backdrop-filter:blur(4px);">
                        <i class="fas fa-chevron-down" style="font-size:0.5625rem;color:var(--grigio-600);"></i>
                    </button>
                </div>
            ` : '';

            if (isMine) {
                html += `
                    <div class="chat-msg-row" style="display:flex;justify-content:flex-end;margin-bottom:${showAvatar ? '8px' : '2px'};padding:0 0.75rem;"
                         ${touchAttrs}>
                        <div class="chat-msg-bubble" style="max-width:80%;background:var(--blu-700);color:white;border-radius:16px 4px 16px 16px;padding:0.5rem 0.875rem;position:relative;"
                             onmouseenter="MessagingUI._showMsgActions('${msg.id}')" onmouseleave="MessagingUI._hideMsgActions('${msg.id}')">
                            ${msgActionBtn}
                            ${contentHtml}
                            <div style="text-align:right;margin-top:2px;"><span style="font-size:0.6875rem;opacity:0.7;">${time}</span>${editedLabel}</div>
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div class="chat-msg-row" style="display:flex;gap:8px;margin-bottom:${showAvatar ? '8px' : '2px'};padding:0 0.75rem;align-items:flex-end;"
                         ${touchAttrs}>
                        ${showAvatar
                            ? MessagingService.renderAvatar(msg.senderName, msg.senderPhoto, 30, null)
                            : '<div style="width:30px;flex-shrink:0;"></div>'
                        }
                        <div style="max-width:75%;">
                            ${showAvatar ? `<div style="font-size:0.75rem;font-weight:700;color:var(--blu-700);margin-bottom:2px;padding-left:4px;">${msg.senderName}</div>` : ''}
                            <div class="chat-msg-bubble" style="background:var(--grigio-100);color:var(--grigio-900);border-radius:4px 16px 16px 16px;padding:0.5rem 0.875rem;position:relative;"
                                 onmouseenter="MessagingUI._showMsgActions('${msg.id}')" onmouseleave="MessagingUI._hideMsgActions('${msg.id}')">
                                ${msgActionBtn}
                                ${contentHtml}
                                <div style="margin-top:2px;"><span style="font-size:0.6875rem;color:var(--grigio-500);">${time}</span>${editedLabel}</div>
                            </div>
                        </div>
                    </div>
                `;
            }
        });

        area.innerHTML = html;

        // Scroll in basso
        area.scrollTop = area.scrollHeight;
    },

    /**
     * Renderizza il contenuto specifico del messaggio in base al tipo
     */
    _renderMessageContent(msg) {
        const isMine = msg.senderId === AuthService.getUserId();

        // Immagine
        if (msg.type === 'image' && msg.attachment && msg.attachment.url) {
            return `
                <div style="margin:-0.25rem -0.375rem 0.25rem;">
                    <img src="${msg.attachment.url}" alt="${msg.attachment.name || 'Immagine'}"
                        style="max-width:100%;border-radius:8px;cursor:pointer;display:block;"
                        onclick="window.open('${msg.attachment.url}', '_blank')"
                        loading="lazy">
                </div>
            `;
        }

        // Audio
        if (msg.type === 'audio' && msg.attachment && msg.attachment.url) {
            return `
                <div style="display:flex;align-items:center;gap:8px;min-width:180px;">
                    <button onclick="MessagingUI._playAudio(this, '${msg.attachment.url}')" style="width:32px;height:32px;border-radius:50%;background:${isMine ? 'rgba(255,255,255,0.2)' : 'var(--blu-100)'};border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <i class="fas fa-play" style="color:${isMine ? 'white' : 'var(--blu-700)'};font-size:0.75rem;margin-left:2px;"></i>
                    </button>
                    <div style="flex:1;">
                        <div style="height:4px;background:${isMine ? 'rgba(255,255,255,0.3)' : 'var(--grigio-300)'};border-radius:2px;overflow:hidden;">
                            <div class="audio-progress" style="height:100%;width:0%;background:${isMine ? 'white' : 'var(--blu-700)'};border-radius:2px;transition:width 0.1s linear;"></div>
                        </div>
                        <div style="font-size:0.6875rem;opacity:0.7;margin-top:2px;">${msg.attachment.size ? MessagingService.formatFileSize(msg.attachment.size) : 'Audio'}</div>
                    </div>
                </div>
            `;
        }

        // File allegato
        if (msg.type === 'file' && msg.attachment && msg.attachment.url) {
            const ext = (msg.attachment.name || '').split('.').pop().toLowerCase();
            const iconMap = { pdf: 'fa-file-pdf', doc: 'fa-file-word', docx: 'fa-file-word', xls: 'fa-file-excel', xlsx: 'fa-file-excel', txt: 'fa-file-alt', csv: 'fa-file-csv', zip: 'fa-file-archive' };
            const icon = iconMap[ext] || 'fa-file';
            const sizeLabel = msg.attachment.size ? MessagingService.formatFileSize(msg.attachment.size) : '';

            return `
                <a href="${msg.attachment.url}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;text-decoration:none;color:inherit;padding:0.25rem 0;">
                    <div style="width:36px;height:36px;border-radius:8px;background:${isMine ? 'rgba(255,255,255,0.15)' : 'var(--blu-100)'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <i class="fas ${icon}" style="font-size:1rem;color:${isMine ? 'white' : 'var(--blu-700)'};"></i>
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:0.8125rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${msg.attachment.name || 'File'}</div>
                        <div style="font-size:0.6875rem;opacity:0.7;">${sizeLabel}</div>
                    </div>
                    <i class="fas fa-download" style="font-size:0.75rem;opacity:0.6;"></i>
                </a>
            `;
        }

        // Testo normale
        return `<p style="margin:0;font-size:0.875rem;line-height:1.45;white-space:pre-wrap;word-break:break-word;">${this._escapeHtml(msg.text || '')}</p>`;
    },

    // ══════════════════════════════════════════
    // AZIONI SUI MESSAGGI (edit / delete)
    // ══════════════════════════════════════════

    _longPressTimer: null,

    _showMsgActions(msgId) {
        const el = document.querySelector(`.chat-msg-actions[data-msgid="${msgId}"]`);
        if (el) el.style.display = 'block';
    },

    _hideMsgActions(msgId) {
        const el = document.querySelector(`.chat-msg-actions[data-msgid="${msgId}"]`);
        if (el) el.style.display = 'none';
    },

    /**
     * Long-press su mobile (touchstart → 500ms → apri menu)
     */
    _touchStart(e, msgId, isMine, canEdit) {
        this._touchEnd(); // Pulisci timer precedente
        this._longPressTimer = setTimeout(() => {
            // Vibra per feedback tattile (se supportato)
            if (navigator.vibrate) navigator.vibrate(30);
            // Simula un evento per posizionare il menu
            const touch = e.touches && e.touches[0];
            const fakeEvent = {
                stopPropagation: () => {},
                currentTarget: { getBoundingClientRect: () => ({
                    bottom: touch ? touch.clientY : 300,
                    left: touch ? touch.clientX - 80 : 100
                })}
            };
            this._showMsgMenu(fakeEvent, msgId, isMine, canEdit);
        }, 500);
    },

    _touchEnd() {
        if (this._longPressTimer) {
            clearTimeout(this._longPressTimer);
            this._longPressTimer = null;
        }
    },

    _showMsgMenu(e, msgId, isMine, canEdit) {
        if (e && e.stopPropagation) e.stopPropagation();
        // Chiudi eventuali menu precedenti
        const existing = document.getElementById('chatMsgMenu');
        if (existing) existing.remove();

        const menu = document.createElement('div');
        menu.id = 'chatMsgMenu';
        menu.style.cssText = 'position:fixed;background:white;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.2);min-width:160px;z-index:9999;overflow:hidden;';

        let menuHtml = '';
        if (canEdit) {
            menuHtml += `<div onclick="MessagingUI._startEditMessage('${msgId}')" style="padding:0.625rem 1rem;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:0.8125rem;color:var(--grigio-900);transition:background 0.15s;" onmouseover="this.style.background='var(--grigio-100)'" onmouseout="this.style.background='white'"><i class="fas fa-pen" style="color:var(--blu-700);width:14px;text-align:center;"></i>Modifica</div>`;
        }
        if (isMine || AuthService.getUserRole() === 'SUPER_ADMIN') {
            menuHtml += `<div onclick="MessagingUI._confirmDeleteMessage('${msgId}')" style="padding:0.625rem 1rem;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:0.8125rem;color:var(--rosso-errore);transition:background 0.15s;" onmouseover="this.style.background='#FFF0F0'" onmouseout="this.style.background='white'"><i class="fas fa-trash-alt" style="width:14px;text-align:center;"></i>Elimina per tutti</div>`;
        }

        if (!menuHtml) return; // Nessuna azione disponibile

        menu.innerHTML = menuHtml;

        // Posiziona usando le coordinate del mouse (più robusto di e.currentTarget)
        let posY = 300, posX = 100;
        if (e) {
            // Coordinate dal click/touch
            posY = e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY) || 300;
            posX = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 100;
        }

        menu.style.top = (posY + 4) + 'px';
        menu.style.left = Math.max(8, posX - 80) + 'px';

        // Verifica che il menu non esca dal viewport
        document.body.appendChild(menu);
        const menuRect = menu.getBoundingClientRect();
        if (menuRect.bottom > window.innerHeight) {
            menu.style.top = Math.max(8, posY - menuRect.height - 4) + 'px';
        }
        if (menuRect.right > window.innerWidth) {
            menu.style.left = Math.max(8, window.innerWidth - menuRect.width - 8) + 'px';
        }

        // Chiudi cliccando fuori — listener su document E sul pannello chat
        // (il pannello ha stopPropagation, quindi i click al suo interno non raggiungono document)
        const closeMenu = (ev) => {
            if (!menu.contains(ev.target)) {
                menu.remove();
                document.removeEventListener('mousedown', closeMenu, true);
                const panel = document.getElementById('chatPanel');
                if (panel) panel.removeEventListener('mousedown', closeMenu);
            }
        };
        setTimeout(() => {
            document.addEventListener('mousedown', closeMenu, true);
            const panel = document.getElementById('chatPanel');
            if (panel) panel.addEventListener('mousedown', closeMenu);
        }, 50);
    },

    _startEditMessage(msgId) {
        // Chiudi menu
        const menu = document.getElementById('chatMsgMenu');
        if (menu) menu.remove();

        const msg = this._currentMessages.find(m => m.id === msgId);
        if (!msg) return;

        // Verifica tempo (15 min)
        const createdAt = msg.createdAt ? (msg.createdAt.toMillis ? msg.createdAt.toMillis() : msg.createdAt) : 0;
        if (Date.now() - createdAt > 15 * 60 * 1000) {
            UI.showError('Puoi modificare solo entro 15 minuti');
            return;
        }

        this._editingMessageId = msgId;
        const input = document.getElementById('chatMessageInput');
        const editBar = document.getElementById('chatEditBar');

        if (input) {
            input.value = msg.text || '';
            input.focus();
            this._autoResizeInput(input);
        }
        if (editBar) editBar.style.display = 'block';

        // Mostra tasto invio, nascondi audio
        this._showSendButton();
    },

    _cancelEdit() {
        this._editingMessageId = null;
        const input = document.getElementById('chatMessageInput');
        const editBar = document.getElementById('chatEditBar');
        if (input) {
            input.value = '';
            input.style.height = 'auto';
        }
        if (editBar) editBar.style.display = 'none';
        this._updateSendAudioToggle();
    },

    async _confirmDeleteMessage(msgId) {
        // Chiudi menu
        const menu = document.getElementById('chatMsgMenu');
        if (menu) menu.remove();

        FormsManager.showModal(
            '<i class="fas fa-trash-alt" style="color:var(--rosso-errore);"></i> Elimina messaggio',
            `<div style="padding:1rem 0;">
                <p style="color:var(--grigio-900);font-size:0.9375rem;margin:0 0 0.5rem;">Vuoi eliminare questo messaggio per tutti?</p>
                <p style="color:var(--grigio-500);font-size:0.8125rem;margin:0;">Il messaggio verrà rimosso dalla conversazione per tutti i partecipanti.</p>
            </div>`,
            async () => {
                const result = await MessagingService.deleteMessageForAll(this._currentConvId, msgId);
                if (result.success) {
                    UI.showSuccess('Messaggio eliminato');
                } else {
                    UI.showError(result.error || 'Errore');
                }
                FormsManager.closeModal();
            }
        );
    },

    // ══════════════════════════════════════════
    // ALLEGATI FILE
    // ══════════════════════════════════════════

    _pendingFile: null,

    _onFileSelected(inputEl) {
        const file = inputEl.files && inputEl.files[0];
        if (!file) return;

        // Reset l'input per permettere di riselezionare lo stesso file
        inputEl.value = '';

        if (file.size > 15 * 1024 * 1024) {
            UI.showError('Il file supera i 15MB');
            return;
        }

        this._pendingFile = file;

        // Mostra preview
        const preview = document.getElementById('chatFilePreview');
        if (!preview) return;

        const isImage = file.type.startsWith('image/');
        const ext = file.name.split('.').pop().toLowerCase();
        const iconMap = { pdf: 'fa-file-pdf', doc: 'fa-file-word', docx: 'fa-file-word', xls: 'fa-file-excel', xlsx: 'fa-file-excel', txt: 'fa-file-alt', csv: 'fa-file-csv', zip: 'fa-file-archive' };
        const icon = iconMap[ext] || 'fa-file';

        let previewHtml = '';
        if (isImage) {
            const url = URL.createObjectURL(file);
            previewHtml = `
                <div style="display:flex;align-items:center;gap:10px;">
                    <img src="${url}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;">
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:0.8125rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${file.name}</div>
                        <div style="font-size:0.75rem;color:var(--grigio-500);">${MessagingService.formatFileSize(file.size)}</div>
                    </div>
                    <button onclick="MessagingUI._clearPendingFile()" style="background:none;border:none;color:var(--grigio-500);cursor:pointer;font-size:1rem;padding:4px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        } else {
            previewHtml = `
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:40px;height:40px;border-radius:8px;background:var(--blu-100);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <i class="fas ${icon}" style="color:var(--blu-700);"></i>
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:0.8125rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${file.name}</div>
                        <div style="font-size:0.75rem;color:var(--grigio-500);">${MessagingService.formatFileSize(file.size)}</div>
                    </div>
                    <button onclick="MessagingUI._clearPendingFile()" style="background:none;border:none;color:var(--grigio-500);cursor:pointer;font-size:1rem;padding:4px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        }

        preview.innerHTML = previewHtml;
        preview.style.display = 'block';

        // Mostra tasto invio
        this._showSendButton();
    },

    _clearPendingFile() {
        this._pendingFile = null;
        const preview = document.getElementById('chatFilePreview');
        if (preview) {
            preview.style.display = 'none';
            preview.innerHTML = '';
        }
        this._updateSendAudioToggle();
    },

    // ══════════════════════════════════════════
    // REGISTRAZIONE AUDIO
    // ══════════════════════════════════════════

    async _toggleAudioRecord() {
        if (this._isRecording) {
            this._stopRecording(false);
        } else {
            await this._startRecording();
        }
    },

    async _startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this._audioChunks = [];
            this._mediaRecorder = new MediaRecorder(stream, { mimeType: this._getAudioMimeType() });

            this._mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    this._audioChunks.push(e.data);
                }
            };

            this._mediaRecorder.onstop = () => {
                stream.getTracks().forEach(track => track.stop());
            };

            this._mediaRecorder.start();
            this._isRecording = true;
            this._recordingSeconds = 0;

            // UI registrazione
            const recordingBar = document.getElementById('chatRecordingBar');
            if (recordingBar) recordingBar.style.display = 'block';

            const audioBtn = document.getElementById('chatAudioBtn');
            if (audioBtn) {
                audioBtn.style.background = 'var(--rosso-errore)';
                audioBtn.style.color = 'white';
            }

            // Timer
            this._recordingTimer = setInterval(() => {
                this._recordingSeconds++;
                const min = Math.floor(this._recordingSeconds / 60).toString().padStart(2, '0');
                const sec = (this._recordingSeconds % 60).toString().padStart(2, '0');
                const el = document.getElementById('chatRecordingTime');
                if (el) el.textContent = `${min}:${sec}`;

                // Max 3 minuti
                if (this._recordingSeconds >= 180) {
                    this._stopRecording(false);
                }
            }, 1000);

        } catch (e) {
            console.error('Errore accesso microfono:', e);
            UI.showError('Impossibile accedere al microfono. Verifica i permessi del browser.');
        }
    },

    async _stopRecording(discard) {
        if (!this._isRecording || !this._mediaRecorder) {
            this._isRecording = false;
            return;
        }

        this._isRecording = false;

        // Ferma timer
        if (this._recordingTimer) {
            clearInterval(this._recordingTimer);
            this._recordingTimer = null;
        }

        // UI reset
        const recordingBar = document.getElementById('chatRecordingBar');
        if (recordingBar) recordingBar.style.display = 'none';

        const audioBtn = document.getElementById('chatAudioBtn');
        if (audioBtn) {
            audioBtn.style.background = 'none';
            audioBtn.style.color = 'var(--grigio-500)';
        }

        return new Promise((resolve) => {
            this._mediaRecorder.onstop = async () => {
                // Ferma tracce
                if (this._mediaRecorder.stream) {
                    this._mediaRecorder.stream.getTracks().forEach(t => t.stop());
                }

                if (discard || this._audioChunks.length === 0) {
                    this._audioChunks = [];
                    resolve();
                    return;
                }

                // Invia audio
                try {
                    const mimeType = this._getAudioMimeType();
                    const blob = new Blob(this._audioChunks, { type: mimeType });
                    this._audioChunks = [];

                    if (blob.size < 1000) {
                        UI.showError('Audio troppo breve');
                        resolve();
                        return;
                    }

                    // Feedback uploading
                    const sendBtn = document.getElementById('chatSendBtn');
                    if (sendBtn) {
                        sendBtn.disabled = true;
                        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    }

                    await MessagingService.sendAudioMessage(this._currentConvId, blob);

                    if (sendBtn) {
                        sendBtn.disabled = false;
                        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
                    }
                } catch (e) {
                    console.error('Errore invio audio:', e);
                    UI.showError('Errore invio messaggio vocale');
                }
                resolve();
            };

            try {
                this._mediaRecorder.stop();
            } catch (e) {
                resolve();
            }
        });
    },

    _getAudioMimeType() {
        const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
        for (const type of types) {
            if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        return 'audio/webm';
    },

    // ══════════════════════════════════════════
    // AUDIO PLAYER (inline nei messaggi)
    // ══════════════════════════════════════════

    _activeAudio: null,

    _playAudio(btn, url) {
        // Ferma audio precedente
        if (this._activeAudio) {
            this._activeAudio.pause();
            this._activeAudio = null;
        }

        const icon = btn.querySelector('i');
        const progressBar = btn.closest('div[style*="min-width"]').querySelector('.audio-progress');

        // Toggle play/pause
        if (icon.classList.contains('fa-pause')) {
            icon.classList.replace('fa-pause', 'fa-play');
            if (progressBar) progressBar.style.width = '0%';
            return;
        }

        icon.classList.replace('fa-play', 'fa-pause');

        const audio = new Audio(url);
        this._activeAudio = audio;

        audio.addEventListener('timeupdate', () => {
            if (audio.duration && progressBar) {
                progressBar.style.width = (audio.currentTime / audio.duration * 100) + '%';
            }
        });

        audio.addEventListener('ended', () => {
            icon.classList.replace('fa-pause', 'fa-play');
            if (progressBar) progressBar.style.width = '0%';
            this._activeAudio = null;
        });

        audio.addEventListener('error', () => {
            icon.classList.replace('fa-pause', 'fa-play');
            UI.showError('Impossibile riprodurre l\'audio');
        });

        audio.play().catch(e => {
            icon.classList.replace('fa-pause', 'fa-play');
            console.error('Errore riproduzione audio:', e);
        });
    },

    // ══════════════════════════════════════════
    // VISTA: NUOVO MESSAGGIO
    // ══════════════════════════════════════════

    async _showNewMessage() {
        this._view = 'newMessage';
        const container = document.getElementById('chatPanelContent');
        if (!container) return;

        // Carica utenti se non in cache
        if (!this._teamUsers) {
            this._teamUsers = await MessagingService.getTeamUsers();
        }

        // Carica presenza
        const userIds = this._teamUsers.map(u => u.id);
        this._presenceCache = await MessagingService.getPresenceBatch(userIds);

        container.innerHTML = `
            <div class="chat-panel-header">
                <div style="display:flex;align-items:center;gap:10px;">
                    <button onclick="MessagingUI._backToList()" style="background:none;border:none;color:white;font-size:1.125rem;cursor:pointer;padding:4px;">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <span style="font-weight:700;font-size:0.9375rem;color:white;">Nuovo messaggio</span>
                </div>
                <button onclick="MessagingUI.closePanel()" style="background:none;border:none;color:white;width:32px;height:32px;cursor:pointer;font-size:1rem;">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <!-- Ricerca -->
            <div style="padding:0.75rem 1rem;border-bottom:1px solid var(--grigio-300);">
                <input type="text" id="chatUserSearch" placeholder="Cerca collega..." oninput="MessagingUI._filterUsers()"
                    style="width:100%;border:2px solid var(--grigio-300);border-radius:20px;padding:0.5rem 1rem;font-family:Titillium Web,sans-serif;font-size:0.875rem;outline:none;font-size:16px;"
                    onfocus="this.style.borderColor='var(--blu-500)'" onblur="this.style.borderColor='var(--grigio-300)'">
            </div>

            <!-- Lista utenti -->
            <div class="chat-conv-list" id="chatUserList">
                ${this._renderUserList(this._teamUsers)}
            </div>
        `;

        // Focus sulla ricerca
        setTimeout(() => {
            const input = document.getElementById('chatUserSearch');
            if (input) input.focus();
        }, 100);
    },

    _renderUserList(users) {
        return users.map(user => {
            const pres = this._presenceCache[user.id] || {};
            const presState = pres.presenceState || 'offline';
            const avatar = MessagingService.renderAvatar(user.nomeCompleto, user.photoURL, 40, presState);
            const ruoloLabel = AuthService.ROLE_LABELS[user.ruolo] || user.ruolo;

            return `
                <div class="chat-conv-item" onclick="MessagingUI._startDirectChat('${user.id}')">
                    ${avatar}
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;font-size:0.9375rem;color:var(--grigio-900);">${user.nomeCompleto}</div>
                        <div style="font-size:0.75rem;color:var(--grigio-500);">${ruoloLabel}</div>
                    </div>
                </div>
            `;
        }).join('');
    },

    _filterUsers() {
        const search = (document.getElementById('chatUserSearch').value || '').toLowerCase();
        const filtered = (this._teamUsers || []).filter(u =>
            u.nomeCompleto.toLowerCase().includes(search)
        );
        const list = document.getElementById('chatUserList');
        if (list) list.innerHTML = this._renderUserList(filtered);
    },

    async _startDirectChat(targetUserId) {
        const conv = await MessagingService.getOrCreateDirectChat(targetUserId);
        if (conv) {
            // Aggiorna lista se la conversazione è nuova
            if (!this._conversations.find(c => c.id === conv.id)) {
                this._conversations.unshift({ ...conv, myUnread: 0 });
            }
            this.openChat(conv.id);
        }
    },

    // ══════════════════════════════════════════
    // VISTA: NUOVO GRUPPO
    // ══════════════════════════════════════════

    async _showNewGroup() {
        this._view = 'newGroup';
        const container = document.getElementById('chatPanelContent');
        if (!container) return;

        if (!this._teamUsers) {
            this._teamUsers = await MessagingService.getTeamUsers();
        }
        this._presenceCache = await MessagingService.getPresenceBatch(this._teamUsers.map(u => u.id));

        container.innerHTML = `
            <div class="chat-panel-header">
                <div style="display:flex;align-items:center;gap:10px;">
                    <button onclick="MessagingUI._backToList()" style="background:none;border:none;color:white;font-size:1.125rem;cursor:pointer;padding:4px;">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <span style="font-weight:700;font-size:0.9375rem;color:white;">Nuovo gruppo</span>
                </div>
                <button onclick="MessagingUI.closePanel()" style="background:none;border:none;color:white;width:32px;height:32px;cursor:pointer;font-size:1rem;">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div style="padding:1rem;border-bottom:1px solid var(--grigio-300);">
                <input type="text" id="chatGroupName" placeholder="Nome del gruppo (es. Progetto Comune di Trani)"
                    style="width:100%;border:2px solid var(--grigio-300);border-radius:8px;padding:0.625rem 1rem;font-family:Titillium Web,sans-serif;font-size:16px;outline:none;margin-bottom:0.75rem;"
                    onfocus="this.style.borderColor='var(--blu-500)'" onblur="this.style.borderColor='var(--grigio-300)'">
                <div id="chatGroupSelected" style="display:flex;flex-wrap:wrap;gap:6px;min-height:24px;"></div>
            </div>

            <div style="padding:0.5rem 1rem;font-size:0.8125rem;font-weight:600;color:var(--grigio-500);">Seleziona partecipanti:</div>

            <div class="chat-conv-list" id="chatGroupUserList">
                ${this._teamUsers.map(user => {
                    const pres = this._presenceCache[user.id] || {};
                    const avatar = MessagingService.renderAvatar(user.nomeCompleto, user.photoURL, 36, pres.presenceState);
                    return `
                        <div class="chat-conv-item" id="groupUser_${user.id}" onclick="MessagingUI._toggleGroupUser('${user.id}', '${user.nomeCompleto.replace(/'/g, "\\'")}')">
                            ${avatar}
                            <div style="flex:1;min-width:0;">
                                <div style="font-weight:600;font-size:0.875rem;color:var(--grigio-900);">${user.nomeCompleto}</div>
                                <div style="font-size:0.75rem;color:var(--grigio-500);">${AuthService.ROLE_LABELS[user.ruolo] || user.ruolo}</div>
                            </div>
                            <div id="groupCheck_${user.id}" style="width:22px;height:22px;border-radius:50%;border:2px solid var(--grigio-300);display:flex;align-items:center;justify-content:center;transition:all 0.2s;"></div>
                        </div>
                    `;
                }).join('')}
            </div>

            <div style="padding:1rem;border-top:1px solid var(--grigio-300);">
                <button onclick="MessagingUI._createGroup()" style="width:100%;background:var(--blu-700);color:white;border:none;padding:0.75rem;border-radius:8px;font-family:Titillium Web,sans-serif;font-size:0.9375rem;font-weight:700;cursor:pointer;transition:background 0.2s;"
                    onmouseover="this.style.background='var(--blu-500)'" onmouseout="this.style.background='var(--blu-700)'">
                    <i class="fas fa-users"></i> Crea gruppo
                </button>
            </div>
        `;

        this._selectedGroupUsers = [];
    },

    _selectedGroupUsers: [],

    _toggleGroupUser(userId, userName) {
        const idx = this._selectedGroupUsers.findIndex(u => u.id === userId);
        const check = document.getElementById('groupCheck_' + userId);

        if (idx >= 0) {
            this._selectedGroupUsers.splice(idx, 1);
            if (check) {
                check.style.background = 'transparent';
                check.style.borderColor = 'var(--grigio-300)';
                check.innerHTML = '';
            }
        } else {
            this._selectedGroupUsers.push({ id: userId, nome: userName });
            if (check) {
                check.style.background = 'var(--verde-700)';
                check.style.borderColor = 'var(--verde-700)';
                check.innerHTML = '<i class="fas fa-check" style="color:white;font-size:0.625rem;"></i>';
            }
        }

        // Aggiorna badge selezionati
        const selectedDiv = document.getElementById('chatGroupSelected');
        if (selectedDiv) {
            selectedDiv.innerHTML = this._selectedGroupUsers.map(u => `
                <span style="background:var(--blu-100);color:var(--blu-700);padding:3px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;">${u.nome}</span>
            `).join('');
        }
    },

    async _createGroup() {
        const nameInput = document.getElementById('chatGroupName');
        const title = nameInput ? nameInput.value.trim() : '';

        if (!title) {
            nameInput.style.borderColor = 'var(--rosso-errore)';
            nameInput.focus();
            return;
        }

        if (this._selectedGroupUsers.length === 0) {
            UI.showError('Seleziona almeno un partecipante');
            return;
        }

        const participantIds = this._selectedGroupUsers.map(u => u.id);
        const conv = await MessagingService.createGroupChat(title, participantIds, 'fa-users');
        if (conv) {
            this.openChat(conv.id);
        }
    },

    // ══════════════════════════════════════════
    // INPUT MESSAGGI
    // ══════════════════════════════════════════

    _handleInputKey(e) {
        // Invio senza Shift → invia messaggio
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this._sendCurrentMessage();
        }
    },

    _autoResizeInput(el) {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 100) + 'px';
        this._updateSendAudioToggle();
    },

    _updateSendAudioToggle() {
        const input = document.getElementById('chatMessageInput');
        const hasText = input && input.value.trim().length > 0;
        const hasFile = !!this._pendingFile;
        const isEditing = !!this._editingMessageId;

        if (hasText || hasFile || isEditing) {
            this._showSendButton();
        } else {
            this._showAudioButton();
        }
    },

    _showSendButton() {
        const sendBtn = document.getElementById('chatSendBtn');
        const audioBtn = document.getElementById('chatAudioBtn');
        if (sendBtn) { sendBtn.style.display = 'flex'; }
        if (audioBtn) { audioBtn.style.display = 'none'; }
    },

    _showAudioButton() {
        const sendBtn = document.getElementById('chatSendBtn');
        const audioBtn = document.getElementById('chatAudioBtn');
        if (sendBtn) { sendBtn.style.display = 'none'; }
        if (audioBtn) { audioBtn.style.display = 'flex'; }
    },

    async _sendCurrentMessage() {
        const input = document.getElementById('chatMessageInput');
        if (!input) return;

        const text = input.value.trim();

        // MODIFICA messaggio esistente
        if (this._editingMessageId) {
            if (!text) return;
            const result = await MessagingService.editMessage(this._currentConvId, this._editingMessageId, text);
            if (result.success) {
                UI.showSuccess('Messaggio modificato');
            } else {
                UI.showError(result.error || 'Errore modifica');
            }
            this._cancelEdit();
            return;
        }

        // INVIO FILE allegato
        if (this._pendingFile) {
            const file = this._pendingFile;
            this._clearPendingFile();
            input.value = '';
            input.style.height = 'auto';

            // Feedback uploading
            const sendBtn = document.getElementById('chatSendBtn');
            if (sendBtn) {
                sendBtn.disabled = true;
                sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            }

            try {
                await MessagingService.sendFileMessage(this._currentConvId, file);
                // Se c'era anche testo, invialo come messaggio separato
                if (text) {
                    await MessagingService.sendMessage(this._currentConvId, text);
                }
            } catch (e) {
                UI.showError('Errore invio file: ' + e.message);
            }

            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
            }
            this._updateSendAudioToggle();
            return;
        }

        // INVIO testo normale
        if (!text || !this._currentConvId) return;

        input.value = '';
        input.style.height = 'auto';
        this._updateSendAudioToggle();

        await MessagingService.sendMessage(this._currentConvId, text);
    },

    // ══════════════════════════════════════════
    // MOBILE OPTIMIZATION
    // ══════════════════════════════════════════

    _onInputFocus() {
        // Su mobile, scrolla l'area messaggi in basso e gestisci la virtual keyboard
        if (window.innerWidth <= 768) {
            setTimeout(() => {
                const area = document.getElementById('chatMessagesArea');
                if (area) area.scrollTop = area.scrollHeight;

                // Usa visualViewport per adattarsi alla tastiera virtuale
                if (window.visualViewport) {
                    this._viewportHandler = () => {
                        const panel = document.getElementById('chatPanel');
                        if (panel && this._panelOpen) {
                            panel.style.height = window.visualViewport.height + 'px';
                            const area2 = document.getElementById('chatMessagesArea');
                            if (area2) area2.scrollTop = area2.scrollHeight;
                        }
                    };
                    window.visualViewport.addEventListener('resize', this._viewportHandler);
                    this._viewportHandler();
                }
            }, 300);
        }
    },

    _onInputBlur() {
        if (window.innerWidth <= 768) {
            // Reset altezza pannello
            const panel = document.getElementById('chatPanel');
            if (panel) {
                panel.style.height = '';
            }
            // Rimuovi listener viewport
            if (this._viewportHandler && window.visualViewport) {
                window.visualViewport.removeEventListener('resize', this._viewportHandler);
                this._viewportHandler = null;
            }
        }
    },

    // ══════════════════════════════════════════
    // NAVIGAZIONE
    // ══════════════════════════════════════════

    _backToList() {
        // Ferma listener messaggi
        if (this._messagesListener) {
            this._messagesListener();
            this._messagesListener = null;
        }
        this._currentConvId = null;
        this._editingMessageId = null;
        this._pendingFile = null;
        this._view = 'list';
        this._stopRecording(true);
        this._renderConversationList();
    },

    // ══════════════════════════════════════════
    // STATO PRESENZA UI
    // ══════════════════════════════════════════

    _showStatusPicker() {
        const statuses = [
            { key: 'disponibile', label: 'Disponibile', color: '#3CA434', icon: 'fa-circle' },
            { key: 'occupato', label: 'Occupato', color: '#FFCC00', icon: 'fa-minus-circle' },
            { key: 'non_disturbare', label: 'Non disturbare', color: '#D32F2F', icon: 'fa-ban' },
            { key: 'in_ferie', label: 'In ferie / Assente', color: '#9B9B9B', icon: 'fa-plane' }
        ];

        const currentStatus = localStorage.getItem('crm_presence_status') || 'disponibile';
        const currentText = localStorage.getItem('crm_presence_text') || '';

        const content = `
            <div style="padding:0.5rem 0;">
                ${statuses.map(s => `
                    <div style="display:flex;align-items:center;gap:10px;padding:0.75rem 1rem;cursor:pointer;border-radius:8px;background:${s.key === currentStatus ? 'var(--blu-100)' : 'transparent'};transition:background 0.15s;"
                         onclick="MessagingUI._setStatus('${s.key}')"
                         onmouseover="this.style.background='var(--grigio-100)'" onmouseout="this.style.background='${s.key === currentStatus ? 'var(--blu-100)' : 'transparent'}'">
                        <i class="fas ${s.icon}" style="color:${s.color};width:16px;text-align:center;"></i>
                        <span style="font-size:0.9375rem;color:var(--grigio-900);">${s.label}</span>
                        ${s.key === currentStatus ? '<i class="fas fa-check" style="margin-left:auto;color:var(--blu-700);"></i>' : ''}
                    </div>
                `).join('')}
                <div style="border-top:1px solid var(--grigio-300);margin-top:0.5rem;padding-top:0.75rem;padding-left:1rem;padding-right:1rem;">
                    <input type="text" id="statusTextInput" value="${currentText}" placeholder="Stato personalizzato (opzionale)"
                        style="width:100%;border:2px solid var(--grigio-300);border-radius:8px;padding:0.5rem 0.75rem;font-family:Titillium Web,sans-serif;font-size:16px;outline:none;"
                        onfocus="this.style.borderColor='var(--blu-500)'" onblur="this.style.borderColor='var(--grigio-300)'"
                        onkeydown="if(event.key==='Enter'){MessagingUI._saveStatusText(); FormsManager.closeModal();}">
                    <button onclick="MessagingUI._saveStatusText(); FormsManager.closeModal();"
                        style="width:100%;margin-top:0.5rem;background:var(--blu-700);color:white;border:none;padding:0.5rem;border-radius:8px;font-family:Titillium Web,sans-serif;font-size:0.8125rem;font-weight:600;cursor:pointer;">
                        Salva stato
                    </button>
                </div>
            </div>
        `;

        FormsManager.showModal('<i class="fas fa-circle" style="color:#3CA434;"></i> Il tuo stato', content);
    },

    _setStatus(status) {
        MessagingService.setMyStatus(status, localStorage.getItem('crm_presence_text') || null);
        // Aggiorna label nel pannello
        const label = document.getElementById('chatMyStatus');
        if (label) label.textContent = this._getMyStatusLabel();
        FormsManager.closeModal();
    },

    _saveStatusText() {
        const input = document.getElementById('statusTextInput');
        const text = input ? input.value.trim() : '';
        const status = localStorage.getItem('crm_presence_status') || 'disponibile';
        MessagingService.setMyStatus(status, text || null);
        const label = document.getElementById('chatMyStatus');
        if (label) label.textContent = this._getMyStatusLabel();
    },

    _getMyStatusLabel() {
        const status = localStorage.getItem('crm_presence_status') || 'disponibile';
        const text = localStorage.getItem('crm_presence_text') || '';
        const labels = {
            'disponibile': 'Disponibile',
            'occupato': 'Occupato',
            'non_disturbare': 'Non disturbare',
            'in_ferie': 'In ferie / Assente'
        };
        const label = labels[status] || 'Disponibile';
        return text ? `${label} — ${text}` : label;
    },

    _presenceLabel(state) {
        switch (state) {
            case 'online': return 'Online';
            case 'idle': return 'Inattivo';
            case 'non_disturbare': return 'Non disturbare';
            case 'in_ferie': return 'Assente';
            default: return 'Offline';
        }
    },

    // ══════════════════════════════════════════
    // MENU CONTESTUALE + GESTIONE CONVERSAZIONI
    // ══════════════════════════════════════════

    _toggleChatMenu(e) {
        e.stopPropagation();
        const menu = document.getElementById('chatContextMenu');
        if (!menu) return;

        const isVisible = menu.style.display !== 'none';
        menu.style.display = isVisible ? 'none' : 'block';

        // Chiudi cliccando fuori
        if (!isVisible) {
            const closeHandler = (ev) => {
                if (!menu.contains(ev.target)) {
                    menu.style.display = 'none';
                    document.removeEventListener('click', closeHandler);
                }
            };
            setTimeout(() => document.addEventListener('click', closeHandler), 10);
        }
    },

    _showGroupInfo(convId) {
        document.getElementById('chatContextMenu').style.display = 'none';
        const conv = this._conversations.find(c => c.id === convId);
        if (!conv) return;

        const participants = Object.entries(conv.participantInfo || {}).map(([uid, info]) => {
            const pres = this._presenceCache[uid] || {};
            const presColor = MessagingService.getPresenceColor(pres.presenceState || 'offline');
            const isCreator = uid === conv.createdBy;
            return `
                <div style="display:flex;align-items:center;gap:10px;padding:0.5rem 0;">
                    ${MessagingService.renderAvatar(info.nome, info.photoURL, 36, pres.presenceState)}
                    <div style="flex:1;">
                        <div style="font-weight:600;font-size:0.875rem;color:var(--grigio-900);">
                            ${info.nome} ${isCreator ? '<span style="background:var(--blu-100);color:var(--blu-700);padding:1px 6px;border-radius:3px;font-size:0.6875rem;font-weight:700;margin-left:4px;">Admin</span>' : ''}
                        </div>
                        <div style="font-size:0.75rem;color:var(--grigio-500);">${info.ruolo ? (AuthService.ROLE_LABELS[info.ruolo] || info.ruolo) : ''}</div>
                    </div>
                </div>
            `;
        }).join('');

        FormsManager.showModal(
            `<i class="fas fa-users" style="color:var(--blu-700);"></i> ${conv.title || 'Gruppo'}`,
            `<div style="padding:0.5rem 0;">
                <div style="font-size:0.8125rem;font-weight:600;color:var(--grigio-500);margin-bottom:0.5rem;">
                    ${Object.keys(conv.participantInfo || {}).length} partecipanti
                </div>
                ${participants}
            </div>`
        );
    },

    _confirmLeaveGroup(convId) {
        document.getElementById('chatContextMenu').style.display = 'none';
        const conv = this._conversations.find(c => c.id === convId);
        const groupName = conv ? (conv.title || 'questo gruppo') : 'questo gruppo';

        FormsManager.showModal(
            '<i class="fas fa-sign-out-alt" style="color:var(--giallo-avviso);"></i> Abbandona gruppo',
            `<div style="padding:1rem 0;">
                <p style="color:var(--grigio-900);font-size:0.9375rem;margin:0 0 0.5rem;">Vuoi abbandonare <strong>${groupName}</strong>?</p>
                <p style="color:var(--grigio-500);font-size:0.8125rem;margin:0;">Non riceverai più i messaggi di questo gruppo.</p>
            </div>`,
            async () => {
                const result = await MessagingService.leaveGroup(convId);
                if (result.success) {
                    UI.showSuccess('Hai abbandonato il gruppo');
                    this._backToList();
                } else {
                    UI.showError(result.error || 'Errore');
                }
                FormsManager.closeModal();
            }
        );
    },

    _confirmDeleteConversation(convId, type) {
        document.getElementById('chatContextMenu').style.display = 'none';
        const conv = this._conversations.find(c => c.id === convId);

        const title = type === 'group'
            ? '<i class="fas fa-trash-alt" style="color:var(--rosso-errore);"></i> Elimina gruppo'
            : '<i class="fas fa-trash-alt" style="color:var(--rosso-errore);"></i> Elimina conversazione';

        const displayName = type === 'group'
            ? (conv ? conv.title : 'questo gruppo')
            : 'questa conversazione';

        FormsManager.showModal(
            title,
            `<div style="padding:1rem 0;">
                <p style="color:var(--grigio-900);font-size:0.9375rem;margin:0 0 0.5rem;">Vuoi eliminare definitivamente <strong>${displayName}</strong>?</p>
                <p style="color:var(--rosso-errore);font-size:0.8125rem;margin:0;"><i class="fas fa-exclamation-triangle"></i> Tutti i messaggi verranno cancellati per sempre. Questa azione non è reversibile.</p>
            </div>`,
            async () => {
                let result;
                if (type === 'group') {
                    result = await MessagingService.deleteGroup(convId);
                } else {
                    result = await MessagingService.deleteDirectChat(convId);
                }
                if (result.success) {
                    UI.showSuccess(type === 'group' ? 'Gruppo eliminato' : 'Conversazione eliminata');
                    this._backToList();
                } else {
                    UI.showError(result.error || 'Errore');
                }
                FormsManager.closeModal();
            }
        );
    },

    // ══════════════════════════════════════════
    // UTILITY
    // ══════════════════════════════════════════

    /**
     * Apri chat diretta con un utente da qualsiasi punto del CRM
     * (usabile da task cards, profili, ecc.)
     */
    async openDirectChat(userId) {
        if (!this._panelOpen) this.openPanel();
        await this._startDirectChat(userId);
    },

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

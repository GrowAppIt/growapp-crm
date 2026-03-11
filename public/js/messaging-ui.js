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

        // Avvia listener conversazioni (per badge)
        this._startConversationsListener();
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
        this._conversations = [];
        this._currentConvId = null;
        this._currentMessages = [];
        this._panelOpen = false;
        this._teamUsers = null;
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
    },

    // ══════════════════════════════════════════
    // LISTENER CONVERSAZIONI (sempre attivo)
    // ══════════════════════════════════════════

    _startConversationsListener() {
        this._conversationsListener = MessagingService.listenToConversations(
            (conversations, totalUnread) => {
                this._conversations = conversations;
                this._updateBadge(totalUnread);

                // Se il pannello è aperto sulla lista, aggiorna
                if (this._panelOpen && this._view === 'list') {
                    this._renderConversationList();
                }

                // Toast + push per nuovi messaggi (solo se pannello chiuso o in altra chat)
                // Gestito dal listener: se totalUnread aumenta e non sto guardando quella chat
            }
        );
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

        // Segna come letta
        MessagingService.markConversationRead(convId);

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

            <!-- Input messaggio -->
            <div class="chat-input-area">
                <div style="display:flex;align-items:flex-end;gap:8px;">
                    <textarea id="chatMessageInput" rows="1" placeholder="Scrivi un messaggio..."
                        style="flex:1;border:2px solid var(--grigio-300);border-radius:20px;padding:0.625rem 1rem;font-family:Titillium Web,sans-serif;font-size:0.875rem;resize:none;outline:none;max-height:100px;line-height:1.4;transition:border-color 0.2s;"
                        onfocus="this.style.borderColor='var(--blu-500)'"
                        onblur="this.style.borderColor='var(--grigio-300)'"
                        onkeydown="MessagingUI._handleInputKey(event)"
                        oninput="MessagingUI._autoResizeInput(this)"></textarea>
                    <button onclick="MessagingUI._sendCurrentMessage()" id="chatSendBtn"
                        style="width:40px;height:40px;border-radius:50%;background:var(--blu-700);color:white;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1rem;transition:background 0.2s;flex-shrink:0;"
                        onmouseover="this.style.background='var(--blu-500)'"
                        onmouseout="this.style.background='var(--blu-700)'">
                        <i class="fas fa-paper-plane"></i>
                    </button>
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

            // Raggruppa messaggi consecutivi dello stesso mittente
            const showAvatar = msg.senderId !== lastSenderId;
            lastSenderId = msg.senderId;

            const time = msg.createdAt ? MessagingService.formatMessageTime(msg.createdAt) : '';

            if (isMine) {
                html += `
                    <div style="display:flex;justify-content:flex-end;margin-bottom:${showAvatar ? '8px' : '2px'};padding:0 0.75rem;">
                        <div style="max-width:80%;background:var(--blu-700);color:white;border-radius:16px 4px 16px 16px;padding:0.5rem 0.875rem;">
                            <p style="margin:0;font-size:0.875rem;line-height:1.45;white-space:pre-wrap;word-break:break-word;">${this._escapeHtml(msg.text)}</p>
                            <div style="text-align:right;margin-top:2px;"><span style="font-size:0.6875rem;opacity:0.7;">${time}</span></div>
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div style="display:flex;gap:8px;margin-bottom:${showAvatar ? '8px' : '2px'};padding:0 0.75rem;align-items:flex-end;">
                        ${showAvatar
                            ? MessagingService.renderAvatar(msg.senderName, msg.senderPhoto, 30, null)
                            : '<div style="width:30px;flex-shrink:0;"></div>'
                        }
                        <div style="max-width:75%;">
                            ${showAvatar ? `<div style="font-size:0.75rem;font-weight:700;color:var(--blu-700);margin-bottom:2px;padding-left:4px;">${msg.senderName}</div>` : ''}
                            <div style="background:var(--grigio-100);color:var(--grigio-900);border-radius:4px 16px 16px 16px;padding:0.5rem 0.875rem;">
                                <p style="margin:0;font-size:0.875rem;line-height:1.45;white-space:pre-wrap;word-break:break-word;">${this._escapeHtml(msg.text)}</p>
                                <div style="margin-top:2px;"><span style="font-size:0.6875rem;color:var(--grigio-500);">${time}</span></div>
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
                    style="width:100%;border:2px solid var(--grigio-300);border-radius:20px;padding:0.5rem 1rem;font-family:Titillium Web,sans-serif;font-size:0.875rem;outline:none;"
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
                    style="width:100%;border:2px solid var(--grigio-300);border-radius:8px;padding:0.625rem 1rem;font-family:Titillium Web,sans-serif;font-size:0.875rem;outline:none;margin-bottom:0.75rem;"
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
    },

    async _sendCurrentMessage() {
        const input = document.getElementById('chatMessageInput');
        if (!input) return;

        const text = input.value.trim();
        if (!text || !this._currentConvId) return;

        // Pulisci input subito (UX reattiva)
        input.value = '';
        input.style.height = 'auto';

        await MessagingService.sendMessage(this._currentConvId, text);
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
        this._view = 'list';
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
                        style="width:100%;border:2px solid var(--grigio-300);border-radius:8px;padding:0.5rem 0.75rem;font-family:Titillium Web,sans-serif;font-size:0.8125rem;outline:none;"
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

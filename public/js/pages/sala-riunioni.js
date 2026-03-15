// Sala Riunioni Module — Videoconferenze e Conferenze Audio integrate via Jitsi Meet
const SalaRiunioni = {

    // Jitsi API instance
    _jitsiApi: null,
    _currentRoom: null,
    _jitsiLoaded: false,

    // =========================================================================
    // RENDER PRINCIPALE — Lista stanze
    // =========================================================================
    async render() {
        const mainContent = document.getElementById('mainContent');
        UI.showLoading();

        try {
            // Carica stanze attive da Firestore
            const stanze = await this._getStanze();
            const user = AuthService.currentUser;
            const userName = user?.displayName || user?.email?.split('@')[0] || 'Utente';

            mainContent.innerHTML = `
                <style>
                    .sr-container { max-width: 1000px; margin: 0 auto; }
                    .sr-header { margin-bottom: 2rem; }
                    .sr-header h1 { font-size: 2rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem; }
                    .sr-header p { color: var(--grigio-500); }
                    .sr-actions { display: flex; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }
                    .sr-btn-new {
                        padding: 0.75rem 1.5rem; border-radius: 12px; border: none;
                        font-weight: 700; font-size: 0.95rem; cursor: pointer;
                        display: flex; align-items: center; gap: 0.5rem;
                        transition: transform 0.2s, box-shadow 0.2s;
                        font-family: 'Titillium Web', sans-serif;
                    }
                    .sr-btn-new:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
                    .sr-btn-video { background: linear-gradient(135deg, #145284 0%, #0D3A5C 100%); color: white; }
                    .sr-btn-audio { background: linear-gradient(135deg, #3CA434 0%, #2A752F 100%); color: white; }

                    .sr-rooms-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr)); gap: 1.25rem; }
                    .sr-room-card {
                        background: white; border-radius: 16px; padding: 1.5rem;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid var(--grigio-300);
                        transition: transform 0.2s, box-shadow 0.2s; cursor: pointer;
                        position: relative; overflow: hidden;
                    }
                    .sr-room-card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
                    .sr-room-card::before {
                        content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px;
                    }
                    .sr-room-card.sr-tipo-video::before { background: linear-gradient(90deg, #145284, #2E6DA8); }
                    .sr-room-card.sr-tipo-audio::before { background: linear-gradient(90deg, #3CA434, #59C64D); }

                    .sr-room-icon {
                        width: 48px; height: 48px; border-radius: 12px;
                        display: flex; align-items: center; justify-content: center;
                        font-size: 1.25rem; color: white;
                    }
                    .sr-room-icon.video { background: linear-gradient(135deg, #145284, #2E6DA8); }
                    .sr-room-icon.audio { background: linear-gradient(135deg, #3CA434, #59C64D); }

                    .sr-room-name { font-size: 1.1rem; font-weight: 700; color: var(--grigio-900); margin-top: 1rem; }
                    .sr-room-meta { font-size: 0.85rem; color: var(--grigio-500); margin-top: 0.25rem; }
                    .sr-room-badge {
                        display: inline-block; padding: 0.2rem 0.6rem; border-radius: 20px;
                        font-size: 0.75rem; font-weight: 700; margin-top: 0.75rem;
                    }
                    .sr-badge-video { background: var(--blu-100); color: var(--blu-700); }
                    .sr-badge-audio { background: var(--verde-100); color: var(--verde-700); }

                    .sr-room-partecipanti {
                        margin-top: 0.75rem; display: flex; gap: 0.5rem; flex-wrap: wrap;
                    }
                    .sr-partecipante-tag {
                        background: var(--grigio-100); padding: 0.2rem 0.5rem; border-radius: 6px;
                        font-size: 0.75rem; color: var(--grigio-700);
                    }

                    .sr-room-enter {
                        margin-top: 1rem; width: 100%; padding: 0.6rem; border: none;
                        border-radius: 8px; font-weight: 700; font-size: 0.9rem;
                        cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem;
                        font-family: 'Titillium Web', sans-serif; transition: opacity 0.2s;
                    }
                    .sr-room-enter:hover { opacity: 0.85; }
                    .sr-room-enter.video { background: var(--blu-700); color: white; }
                    .sr-room-enter.audio { background: var(--verde-700); color: white; }

                    .sr-empty {
                        text-align: center; padding: 3rem; color: var(--grigio-500);
                    }
                    .sr-empty i { font-size: 3rem; margin-bottom: 1rem; color: var(--grigio-300); }

                    /* Stanza attiva — Jitsi embed */
                    .sr-jitsi-container {
                        width: 100%; height: calc(100vh - var(--header-height, 60px) - 16px);
                        position: relative; background: #1a1a2e; border-radius: 12px; overflow: hidden;
                    }
                    .sr-jitsi-toolbar {
                        position: absolute; top: 0; left: 0; right: 0; z-index: 10;
                        background: rgba(0,0,0,0.7); backdrop-filter: blur(8px);
                        padding: 0.75rem 1.25rem; display: flex; align-items: center; justify-content: space-between;
                    }
                    .sr-jitsi-toolbar h3 { color: white; font-size: 1rem; font-weight: 600; margin: 0; }
                    .sr-btn-leave {
                        background: #D32F2F; color: white; border: none; padding: 0.5rem 1rem;
                        border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 0.85rem;
                        font-family: 'Titillium Web', sans-serif;
                    }

                    /* Form nuova stanza */
                    .sr-form-overlay {
                        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(0,0,0,0.5); z-index: 10000;
                        display: flex; align-items: flex-start; justify-content: center;
                        padding: 2rem; overflow-y: auto;
                    }
                    .sr-form-modal {
                        background: white; border-radius: 20px; width: 100%; max-width: 500px;
                        padding: 2rem; box-shadow: 0 24px 48px rgba(0,0,0,0.2);
                    }
                    .sr-form-modal h2 { font-size: 1.25rem; font-weight: 700; color: var(--blu-700); margin-bottom: 1.5rem; }

                    @media (max-width: 768px) {
                        .sr-actions { flex-direction: column; }
                        .sr-btn-new { width: 100%; justify-content: center; }
                        .sr-jitsi-container { border-radius: 0; height: calc(100vh - 60px); }
                    }
                </style>

                <div class="sr-container">
                    <div class="sr-header">
                        <h1><i class="fas fa-video"></i> Sala Riunioni</h1>
                        <p>Videoconferenze e conferenze audio integrate nel CRM</p>
                    </div>

                    <div class="sr-actions">
                        <button class="sr-btn-new sr-btn-video" onclick="SalaRiunioni.mostraFormNuovaStanza('video')">
                            <i class="fas fa-video"></i> Nuova Videoconferenza
                        </button>
                        <button class="sr-btn-new sr-btn-audio" onclick="SalaRiunioni.mostraFormNuovaStanza('audio')">
                            <i class="fas fa-phone-alt"></i> Nuova Conferenza Audio
                        </button>
                    </div>

                    <div class="sr-rooms-grid" id="stanzeGrid">
                        ${stanze.length === 0 ? `
                            <div class="sr-empty" style="grid-column: 1 / -1;">
                                <i class="fas fa-door-open"></i>
                                <p>Nessuna stanza attiva.<br>Crea una nuova videoconferenza o conferenza audio per iniziare.</p>
                            </div>
                        ` : stanze.map(s => this._renderRoomCard(s, userName)).join('')}
                    </div>
                </div>
            `;

            UI.hideLoading();
        } catch (error) {
            console.error('[SalaRiunioni] Errore render:', error);
            mainContent.innerHTML = `
                <div style="padding: 3rem; text-align: center; color: var(--rosso-errore);">
                    <i class="fas fa-exclamation-circle" style="font-size: 2rem;"></i>
                    <p style="margin-top: 1rem;">Errore nel caricamento della Sala Riunioni.</p>
                    <button class="btn btn-primary" onclick="SalaRiunioni.render()" style="margin-top: 1rem;">
                        <i class="fas fa-redo"></i> Riprova
                    </button>
                </div>`;
            UI.hideLoading();
        }
    },

    // =========================================================================
    // RENDER CARD STANZA
    // =========================================================================
    _renderRoomCard(stanza, userName) {
        const isVideo = stanza.tipo === 'video';
        const creataIl = stanza.creatoIl ? DataService.formatDate(stanza.creatoIl) : '';
        const invitati = stanza.invitati || [];

        return `
            <div class="sr-room-card sr-tipo-${stanza.tipo}">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div class="sr-room-icon ${stanza.tipo}">
                        <i class="fas ${isVideo ? 'fa-video' : 'fa-phone-alt'}"></i>
                    </div>
                    ${stanza.creatoDa === userName ? `
                        <button onclick="event.stopPropagation(); SalaRiunioni.eliminaStanza('${stanza.id}')"
                            style="background: none; border: none; color: var(--grigio-500); cursor: pointer; padding: 0.25rem; font-size: 1rem;"
                            title="Elimina stanza">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    ` : ''}
                </div>
                <div class="sr-room-name">${stanza.nome}</div>
                <div class="sr-room-meta">
                    Creata da ${stanza.creatoDa || 'N/A'}${creataIl ? ' — ' + creataIl : ''}
                </div>
                <span class="sr-room-badge ${isVideo ? 'sr-badge-video' : 'sr-badge-audio'}">
                    <i class="fas ${isVideo ? 'fa-video' : 'fa-phone-alt'}"></i>
                    ${isVideo ? 'Videoconferenza' : 'Solo Audio'}
                </span>
                ${invitati.length > 0 ? `
                    <div class="sr-room-partecipanti">
                        ${invitati.map(i => `<span class="sr-partecipante-tag"><i class="fas fa-user"></i> ${i}</span>`).join('')}
                    </div>
                ` : ''}
                <button class="sr-room-enter ${stanza.tipo}" onclick="SalaRiunioni.entraInStanza('${stanza.id}')">
                    <i class="fas ${isVideo ? 'fa-sign-in-alt' : 'fa-phone-alt'}"></i>
                    ${isVideo ? 'Entra in Videoconferenza' : 'Entra in Conferenza Audio'}
                </button>
            </div>
        `;
    },

    // =========================================================================
    // FORM NUOVA STANZA
    // =========================================================================
    async mostraFormNuovaStanza(tipo) {
        // Carica lista utenti per inviti
        let utentiHtml = '';
        try {
            const utenti = await DataService.getUtenti();
            const currentUser = AuthService.currentUser;
            const altriUtenti = utenti.filter(u => u.email !== currentUser?.email);
            utentiHtml = altriUtenti.map(u => `
                <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0; cursor: pointer;">
                    <input type="checkbox" name="invitato" value="${u.displayName || u.nome || u.email}"
                        style="width: 18px; height: 18px; accent-color: var(--blu-700);" />
                    <span style="font-size: 0.9rem; color: var(--grigio-900);">
                        ${u.displayName || u.nome || u.email}
                        <span style="color: var(--grigio-500); font-size: 0.8rem;">(${u.ruolo || ''})</span>
                    </span>
                </label>
            `).join('');
        } catch (e) {
            console.warn('[SalaRiunioni] Errore caricamento utenti:', e);
        }

        const isVideo = tipo === 'video';
        const overlay = document.createElement('div');
        overlay.className = 'sr-form-overlay';
        overlay.id = 'srFormOverlay';
        overlay.innerHTML = `
            <div class="sr-form-modal">
                <h2>
                    <i class="fas ${isVideo ? 'fa-video' : 'fa-phone-alt'}" style="color: ${isVideo ? 'var(--blu-700)' : 'var(--verde-700)'};"></i>
                    Nuova ${isVideo ? 'Videoconferenza' : 'Conferenza Audio'}
                </h2>
                <div style="margin-bottom: 1.25rem;">
                    <label style="display: block; font-size: 0.875rem; font-weight: 600; color: var(--grigio-700); margin-bottom: 0.5rem;">
                        Nome Stanza <span style="color: #D32F2F;">*</span>
                    </label>
                    <input type="text" id="srNomeStanza" placeholder="Es: Riunione operativa, Stand-up settimanale..."
                        style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 8px; font-size: 1rem; font-family: 'Titillium Web', sans-serif; box-sizing: border-box;" />
                </div>
                ${utentiHtml ? `
                <div style="margin-bottom: 1.25rem;">
                    <label style="display: block; font-size: 0.875rem; font-weight: 600; color: var(--grigio-700); margin-bottom: 0.5rem;">
                        Invita partecipanti
                    </label>
                    <div style="max-height: 200px; overflow-y: auto; padding: 0.5rem; background: var(--grigio-100); border-radius: 8px;">
                        ${utentiHtml}
                    </div>
                </div>
                ` : ''}
                <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                    <button onclick="SalaRiunioni.creaStanza('${tipo}')"
                        style="flex: 1; padding: 0.75rem; border: none; border-radius: 10px; font-weight: 700; font-size: 1rem; cursor: pointer; color: white; font-family: 'Titillium Web', sans-serif;
                        background: ${isVideo ? 'var(--blu-700)' : 'var(--verde-700)'};">
                        <i class="fas ${isVideo ? 'fa-video' : 'fa-phone-alt'}"></i> Crea e Entra
                    </button>
                    <button onclick="document.getElementById('srFormOverlay').remove()"
                        style="padding: 0.75rem 1.25rem; border: 1px solid var(--grigio-300); border-radius: 10px; background: white; font-weight: 600; cursor: pointer; color: var(--grigio-700); font-family: 'Titillium Web', sans-serif;">
                        Annulla
                    </button>
                </div>
            </div>
        `;

        // Chiudi cliccando fuori
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        document.body.appendChild(overlay);
        document.getElementById('srNomeStanza').focus();
    },

    // =========================================================================
    // CREA STANZA
    // =========================================================================
    async creaStanza(tipo) {
        const nome = document.getElementById('srNomeStanza')?.value?.trim();
        if (!nome) {
            UI.showError('Inserisci un nome per la stanza');
            return;
        }

        const user = AuthService.currentUser;
        const userName = user?.displayName || user?.email?.split('@')[0] || 'Utente';

        // Raccogli invitati
        const checkboxes = document.querySelectorAll('#srFormOverlay input[name="invitato"]:checked');
        const invitati = Array.from(checkboxes).map(cb => cb.value);

        // Genera room ID univoco per Jitsi
        const roomId = 'cd-' + nome.toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .substring(0, 30) + '-' + Date.now().toString(36);

        try {
            // Salva in Firestore
            const stanzaData = {
                nome: nome,
                tipo: tipo, // 'video' o 'audio'
                roomId: roomId,
                creatoDa: userName,
                creatoDaEmail: user?.email || '',
                invitati: invitati,
                creatoIl: new Date().toISOString(),
                attiva: true
            };

            await db.collection('saleRiunioni').add(stanzaData);

            // Chiudi il form
            document.getElementById('srFormOverlay')?.remove();

            // Ricarica lista e poi entra
            UI.showSuccess(`Stanza "${nome}" creata!`);
            await this.render();

            // Entra automaticamente nella stanza appena creata
            const stanze = await this._getStanze();
            const nuova = stanze.find(s => s.roomId === roomId);
            if (nuova) {
                this.entraInStanza(nuova.id);
            }
        } catch (error) {
            console.error('[SalaRiunioni] Errore creazione stanza:', error);
            UI.showError('Errore nella creazione della stanza');
        }
    },

    // =========================================================================
    // ENTRA IN STANZA — Carica Jitsi
    // =========================================================================
    async entraInStanza(stanzaId) {
        UI.showLoading();

        try {
            // Carica dati stanza
            const doc = await db.collection('saleRiunioni').doc(stanzaId).get();
            if (!doc.exists) {
                UI.showError('Stanza non trovata');
                UI.hideLoading();
                return;
            }

            const stanza = { ...doc.data(), id: doc.id };
            this._currentRoom = stanza;
            const isVideo = stanza.tipo === 'video';

            const user = AuthService.currentUser;
            const userName = user?.displayName || user?.email?.split('@')[0] || 'Utente';

            const mainContent = document.getElementById('mainContent');
            mainContent.innerHTML = `
                <div class="sr-jitsi-container" id="srJitsiContainer">
                    <div class="sr-jitsi-toolbar">
                        <h3>
                            <i class="fas ${isVideo ? 'fa-video' : 'fa-phone-alt'}" style="margin-right: 0.5rem;"></i>
                            ${stanza.nome}
                            <span style="font-weight: 400; font-size: 0.85rem; opacity: 0.7; margin-left: 0.5rem;">
                                (${isVideo ? 'Videoconferenza' : 'Solo Audio'})
                            </span>
                        </h3>
                        <button class="sr-btn-leave" onclick="SalaRiunioni.esciDallaStanza()">
                            <i class="fas fa-phone-slash"></i> Esci
                        </button>
                    </div>
                    <div id="jitsiMeetContainer" style="width: 100%; height: 100%;"></div>
                </div>
            `;

            // Carica Jitsi API se non già caricata
            await this._loadJitsiApi();

            // Inizializza Jitsi Meet
            const domain = 'meet.jit.si';
            const options = {
                roomName: stanza.roomId,
                parentNode: document.getElementById('jitsiMeetContainer'),
                width: '100%',
                height: '100%',
                userInfo: {
                    displayName: userName,
                    email: user?.email || ''
                },
                configOverwrite: {
                    startWithAudioMuted: false,
                    startWithVideoMuted: !isVideo,
                    // Per stanze solo audio, disabilita completamente il video
                    ...(stanza.tipo === 'audio' ? {
                        startAudioOnly: true,
                        disableVideo: true,
                        startWithVideoMuted: true,
                        toolbarButtons: [
                            'microphone', 'hangup', 'chat', 'raisehand',
                            'tileview', 'participants-pane', 'settings',
                            'desktop', 'shareaudio'
                        ]
                    } : {
                        toolbarButtons: [
                            'microphone', 'camera', 'hangup', 'chat', 'raisehand',
                            'tileview', 'participants-pane', 'settings',
                            'desktop', 'shareaudio', 'fullscreen',
                            'filmstrip', 'select-background'
                        ]
                    })
                },
                interfaceConfigOverwrite: {
                    SHOW_JITSI_WATERMARK: false,
                    SHOW_WATERMARK_FOR_GUESTS: false,
                    SHOW_BRAND_WATERMARK: false,
                    DEFAULT_BACKGROUND: '#1a1a2e',
                    TOOLBAR_ALWAYS_VISIBLE: false,
                    DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
                    MOBILE_APP_PROMO: false,
                    HIDE_INVITE_MORE_HEADER: true,
                    DISABLE_FOCUS_INDICATOR: true
                }
            };

            this._jitsiApi = new JitsiMeetExternalAPI(domain, options);

            // Listener per quando l'utente esce dalla conferenza
            this._jitsiApi.addEventListener('readyToClose', () => {
                this.esciDallaStanza();
            });

            UI.hideLoading();
        } catch (error) {
            console.error('[SalaRiunioni] Errore entrata stanza:', error);
            UI.showError('Errore nel caricamento della conferenza');
            UI.hideLoading();
            this.render();
        }
    },

    // =========================================================================
    // ESCI DALLA STANZA
    // =========================================================================
    esciDallaStanza() {
        if (this._jitsiApi) {
            this._jitsiApi.dispose();
            this._jitsiApi = null;
        }
        this._currentRoom = null;
        this.render();
    },

    // =========================================================================
    // ELIMINA STANZA
    // =========================================================================
    async eliminaStanza(stanzaId) {
        if (!confirm('Vuoi eliminare questa stanza?\nI partecipanti attivi verranno disconnessi.')) return;

        try {
            await db.collection('saleRiunioni').doc(stanzaId).delete();
            UI.showSuccess('Stanza eliminata');
            this.render();
        } catch (error) {
            console.error('[SalaRiunioni] Errore eliminazione:', error);
            UI.showError('Errore nell\'eliminazione della stanza');
        }
    },

    // =========================================================================
    // CLEANUP — Chiamato quando si naviga via
    // =========================================================================
    cleanup() {
        if (this._jitsiApi) {
            this._jitsiApi.dispose();
            this._jitsiApi = null;
        }
        this._currentRoom = null;
    },

    // =========================================================================
    // HELPERS
    // =========================================================================

    /**
     * Carica dinamicamente la Jitsi Meet External API
     */
    _loadJitsiApi() {
        return new Promise((resolve, reject) => {
            if (this._jitsiLoaded && typeof JitsiMeetExternalAPI !== 'undefined') {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://meet.jit.si/external_api.js';
            script.onload = () => {
                this._jitsiLoaded = true;
                resolve();
            };
            script.onerror = () => reject(new Error('Impossibile caricare Jitsi Meet API'));
            document.head.appendChild(script);
        });
    },

    /**
     * Carica stanze attive da Firestore
     */
    async _getStanze() {
        try {
            const snapshot = await db.collection('saleRiunioni')
                .where('attiva', '==', true)
                .orderBy('creatoIl', 'desc')
                .get();

            return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        } catch (error) {
            console.error('[SalaRiunioni] Errore caricamento stanze:', error);
            // Fallback senza orderBy (potrebbe servire indice)
            try {
                const snapshot = await db.collection('saleRiunioni').get();
                return snapshot.docs
                    .map(doc => ({ ...doc.data(), id: doc.id }))
                    .filter(s => s.attiva !== false)
                    .sort((a, b) => (b.creatoIl || '').localeCompare(a.creatoIl || ''));
            } catch (e2) {
                console.error('[SalaRiunioni] Errore fallback:', e2);
                return [];
            }
        }
    }
};

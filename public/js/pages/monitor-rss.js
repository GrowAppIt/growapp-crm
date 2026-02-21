// Monitor RSS Module - Integrazione webapp RSS nel CRM via iframe
const MonitorRSS = {

    // URL della webapp RSS (stessa cartella del CRM, stessa origine)
    RSS_WEBAPP_URL: 'rss-monitor/index.html',

    // Riferimenti per cleanup
    _sidebarHoverZone: null,
    _mouseMoveHandler: null,
    _sidebarHidden: false,

    render() {
        const mainContent = document.getElementById('mainContent');

        mainContent.innerHTML = `
            <style>
                /* Override padding per la pagina Monitor RSS — fullscreen sotto l'header */
                #mainContent.monitor-rss-fullscreen {
                    padding: 0 !important;
                    max-width: 100% !important;
                    width: 100% !important;
                    margin: 0 !important;
                    overflow: hidden !important;
                }

                /* Sidebar auto-hide su desktop quando Monitor RSS è attivo */
                @media (min-width: 769px) {
                    .app.rss-sidebar-hidden {
                        grid-template-columns: 0px 1fr !important;
                        transition: grid-template-columns 0.35s cubic-bezier(0.4, 0, 0.2, 1);
                    }
                    .app.rss-sidebar-hidden .sidebar {
                        transform: translateX(-100%);
                        opacity: 0;
                        pointer-events: none;
                        transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1),
                                    opacity 0.25s ease;
                    }
                    .app.rss-sidebar-visible {
                        transition: grid-template-columns 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    }
                    .app.rss-sidebar-visible .sidebar {
                        transform: translateX(0);
                        opacity: 1;
                        pointer-events: all;
                        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                                    opacity 0.2s ease;
                    }
                }

                /* Zona invisibile per riattivare la sidebar */
                .rss-sidebar-hover-zone {
                    position: fixed;
                    top: var(--header-height, 60px);
                    left: 0;
                    width: 18px;
                    height: calc(100vh - var(--header-height, 60px));
                    z-index: 199;
                    cursor: pointer;
                }
                .rss-sidebar-hover-zone::after {
                    content: '';
                    position: absolute;
                    top: 50%;
                    left: 4px;
                    transform: translateY(-50%);
                    width: 4px;
                    height: 48px;
                    background: var(--blu-300, #7BA7CE);
                    border-radius: 4px;
                    opacity: 0;
                    transition: opacity 0.25s ease;
                }
                .rss-sidebar-hover-zone:hover::after {
                    opacity: 0.7;
                }

                .monitor-rss-container {
                    width: 100%;
                    height: calc(100vh - var(--header-height, 60px) - 8px);
                    position: relative;
                    background: #F5F5F5;
                }
                .monitor-rss-iframe {
                    width: 100%;
                    height: 100%;
                    border: none;
                    display: block;
                }
                .monitor-rss-loading {
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    background: #F5F5F5;
                    z-index: 5;
                    gap: 16px;
                }
                .monitor-rss-loading i {
                    font-size: 48px;
                    color: var(--blu-700);
                    animation: spin 1s linear infinite;
                }
                @keyframes spin { to { transform: rotate(360deg); } }
                .monitor-rss-loading p {
                    font-size: 16px;
                    color: var(--grigio-700);
                    font-weight: 600;
                }
                .monitor-rss-error {
                    display: none;
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    background: #F5F5F5;
                    z-index: 5;
                    gap: 16px;
                    padding: 2rem;
                    text-align: center;
                }
                .monitor-rss-error i {
                    font-size: 48px;
                    color: var(--rosso-errore);
                }
                .monitor-rss-error h3 {
                    font-size: 1.25rem;
                    color: var(--grigio-900);
                    margin: 0;
                }
                .monitor-rss-error p {
                    font-size: 0.95rem;
                    color: var(--grigio-700);
                    margin: 0;
                    max-width: 500px;
                }

                @media (max-width: 768px) {
                    .monitor-rss-container {
                        height: calc(100vh - 60px);
                    }
                    .rss-sidebar-hover-zone {
                        display: none;
                    }
                }
            </style>

            <div class="monitor-rss-container">
                <div class="monitor-rss-loading" id="rssLoading">
                    <i class="fas fa-spinner"></i>
                    <p>Caricamento Monitor RSS...</p>
                </div>
                <div class="monitor-rss-error" id="rssError">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Impossibile caricare il Monitor RSS</h3>
                    <p>Si è verificato un errore nel caricamento. Riprova.</p>
                    <button class="btn btn-primary" onclick="MonitorRSS.retryLoad()" style="margin-top: 12px;">
                        <i class="fas fa-redo"></i> Riprova
                    </button>
                </div>
                <iframe
                    id="rssIframe"
                    class="monitor-rss-iframe"
                    sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
                    allow="clipboard-write"
                    style="display: none;"
                ></iframe>
            </div>
        `;

        // Aggiungi classe fullscreen al mainContent
        mainContent.classList.add('monitor-rss-fullscreen');

        // Attiva auto-hide sidebar su desktop
        this._setupSidebarAutoHide();

        // Carica l'iframe
        this._loadIframe();
    },

    /******************************************************************
     * SIDEBAR AUTO-HIDE
     * Su desktop: la sidebar scorre via a sinistra, lasciando tutto
     * lo schermo al Monitor RSS. Una striscia sottile sul bordo sinistro
     * permette di riaprirla al passaggio del mouse.
     ******************************************************************/
    _setupSidebarAutoHide() {
        // Solo su desktop (>768px)
        if (window.innerWidth <= 768) return;

        const appEl = document.querySelector('.app');
        if (!appEl) return;

        // Nascondi sidebar con animazione
        setTimeout(() => {
            appEl.classList.add('rss-sidebar-hidden');
            this._sidebarHidden = true;
        }, 300);

        // Crea zona hover sul bordo sinistro
        this._sidebarHoverZone = document.createElement('div');
        this._sidebarHoverZone.className = 'rss-sidebar-hover-zone';
        document.body.appendChild(this._sidebarHoverZone);

        // Hover zone → mostra sidebar
        this._sidebarHoverZone.addEventListener('mouseenter', () => {
            this._showSidebar();
        });

        // Quando il mouse esce dalla sidebar → nascondi di nuovo
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.addEventListener('mouseleave', (e) => {
                // Controlla che siamo ancora nella pagina monitor-rss
                if (UI.currentPage !== 'monitor-rss') return;
                // Nascondi solo se il mouse va verso destra (non verso la hover zone)
                if (e.clientX > 10) {
                    this._hideSidebar();
                }
            });
        }
    },

    _showSidebar() {
        const appEl = document.querySelector('.app');
        if (!appEl || !this._sidebarHidden) return;

        appEl.classList.remove('rss-sidebar-hidden');
        appEl.classList.add('rss-sidebar-visible');
        this._sidebarHidden = false;

        // Nascondi la hover zone mentre la sidebar è visibile
        if (this._sidebarHoverZone) {
            this._sidebarHoverZone.style.display = 'none';
        }
    },

    _hideSidebar() {
        const appEl = document.querySelector('.app');
        if (!appEl || this._sidebarHidden) return;

        appEl.classList.remove('rss-sidebar-visible');
        appEl.classList.add('rss-sidebar-hidden');
        this._sidebarHidden = true;

        // Rimostra la hover zone
        if (this._sidebarHoverZone) {
            this._sidebarHoverZone.style.display = 'block';
        }
    },

    _loadIframe() {
        const iframe = document.getElementById('rssIframe');
        const loading = document.getElementById('rssLoading');
        const error = document.getElementById('rssError');

        if (!iframe) return;

        // Timeout per errore di caricamento
        const loadTimeout = setTimeout(() => {
            loading.style.display = 'none';
            error.style.display = 'flex';
        }, 15000);

        iframe.onload = () => {
            clearTimeout(loadTimeout);
            loading.style.display = 'none';
            iframe.style.display = 'block';
        };

        iframe.onerror = () => {
            clearTimeout(loadTimeout);
            loading.style.display = 'none';
            error.style.display = 'flex';
        };

        iframe.src = this.RSS_WEBAPP_URL;
    },

    retryLoad() {
        const error = document.getElementById('rssError');
        const loading = document.getElementById('rssLoading');
        if (error) error.style.display = 'none';
        if (loading) loading.style.display = 'flex';
        this._loadIframe();
    },

    // Chiamato quando si naviga via dalla pagina
    cleanup() {
        const mainContent = document.getElementById('mainContent');
        if (mainContent) {
            mainContent.classList.remove('monitor-rss-fullscreen');
        }

        // Ripristina sidebar
        const appEl = document.querySelector('.app');
        if (appEl) {
            appEl.classList.remove('rss-sidebar-hidden', 'rss-sidebar-visible');
        }

        // Rimuovi hover zone
        if (this._sidebarHoverZone) {
            this._sidebarHoverZone.remove();
            this._sidebarHoverZone = null;
        }

        this._sidebarHidden = false;
    }
};

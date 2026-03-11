// Main App Controller
const App = {
    init() {

        // Setup event listeners
        this.setupEventListeners();

        const loading = document.getElementById('loading');
        const loginScreen = document.getElementById('loginScreen');

        // Strategia: lo splash screen (#loading) resta visibile come stato neutro
        // finché Firebase non decide se l'utente è loggato o no.
        // - Se loggato → splash → direttamente alla pagina (mai vedi login)
        // - Se non loggato → splash → login
        // Lo splash mostra solo lo spinner, testo rimosso per leggerezza
        if (loading) {
            const loadingText = loading.querySelector('p');
            if (loadingText) loadingText.textContent = '';
        }

        // Monitor auth state — Firebase verifica token salvato in IndexedDB
        AuthService.onAuthStateChanged((user) => {
            if (user) {
                // Autenticato → nascondi tutto e vai alla pagina corrente
                if (loading) loading.classList.add('hidden');
                if (loginScreen) loginScreen.classList.add('hidden');
                this.onUserLoggedIn();
            } else {
                // Non autenticato → mostra login
                if (loading) loading.classList.add('hidden');
                if (loginScreen) loginScreen.classList.remove('hidden');
                this.onUserLoggedOut();
            }
        });
    },

    setupEventListeners() {
        // 🔗 URL Hash Routing (per deep links da Telegram)
        window.addEventListener('hashchange', () => this.handleHashChange());

        // Tasto "Indietro" del browser — usa lo stack di navigazione interno
        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.page) {
                // Il browser ha una entry con la pagina: naviga senza pushare nello stack
                UI._isGoingBack = true;
                UI.showPage(e.state.page, e.state.id || null);
                UI._isGoingBack = false;
            } else {
                // Fallback: leggi dall'hash corrente
                this.handleHashChange();
            }
        });

        // Login form
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Menu toggle
        // Logo → Dashboard
        const logoHome = document.getElementById('logoHome');
        if (logoHome) {
            logoHome.addEventListener('click', (e) => {
                e.preventDefault();
                UI.showPage('dashboard');
            });
        }

        const menuToggle = document.getElementById('menuToggle');
        if (menuToggle) {
            menuToggle.addEventListener('click', () => UI.toggleSidebar());
        }

        // Sidebar close
        const sidebarClose = document.getElementById('sidebarClose');
        if (sidebarClose) {
            sidebarClose.addEventListener('click', () => UI.closeSidebar());
        }

        // Sidebar overlay
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', () => UI.closeSidebar());
        }

        // User menu toggle
        const userMenuToggle = document.getElementById('userMenuToggle');
        if (userMenuToggle) {
            userMenuToggle.addEventListener('click', () => UI.toggleUserMenu());
        }

        // Logout buttons
        const logoutBtn = document.getElementById('logoutBtn');
        const logoutLink = document.getElementById('logoutLink');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.handleLogout());
        }
        if (logoutLink) {
            logoutLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleLogout();
            });
        }

        // Menu items
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                if (page) {
                    UI.showPage(page);
                }
            });
        });

        // Close user menu when clicking outside
        document.addEventListener('click', (e) => {
            const userMenu = document.getElementById('userMenu');
            const userMenuToggle = document.getElementById('userMenuToggle');

            if (!userMenu.contains(e.target) && e.target !== userMenuToggle && !userMenuToggle.contains(e.target)) {
                UI.closeUserMenu();
            }
        });
    },

    async handleLogin(e) {
        e.preventDefault();

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        UI.showLoading();

        const result = await AuthService.login(email, password);

        if (result.success) {
            // L'auth state observer gestirà il resto
        } else {
            UI.hideLoading();
            UI.showError('Errore di accesso: ' + result.error);
        }
    },

    async handleLogout() {
        UI.showLoading();
        const result = await AuthService.logout();

        if (result.success) {
            // L'auth state observer gestirà il resto
        } else {
            UI.hideLoading();
            UI.showError('Errore logout: ' + result.error);
        }
    },

    onUserLoggedIn() {

        // Nascondi schermata login
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('loading').classList.add('hidden');

        // Mostra app
        document.getElementById('app').classList.remove('hidden');

        // Aggiorna info utente
        UI.setUserInfo(AuthService.getUserName(), AuthService.getUserRole());

        // Filtra menu in base ai permessi dell'utente
        UI.initializeMenuByPermissions();

        // Precarica impostazioni di sistema (Firestore → cache locale)
        SettingsService.preloadSystemSettings().catch(e =>
            console.warn('Preload impostazioni fallito:', e)
        );

        // Inizializza sistema notifiche
        NotificationUI.init();

        // Inizializza FCM (notifiche push)
        if (typeof FCMService !== 'undefined') {
            FCMService.init().then(() => {
                // Se il permesso non è ancora stato chiesto, mostra banner
                if (FCMService.getPermissionStatus() === 'default') {
                    // Non mostrare se dismissato meno di 7 giorni fa
                    const dismissed = localStorage.getItem('fcm_banner_dismissed');
                    if (!dismissed || (Date.now() - parseInt(dismissed)) > 7 * 24 * 60 * 60 * 1000) {
                        this._showPushBanner();
                    }
                }
            }).catch(e => console.warn('FCM init error:', e));
        }

        // Verifica task in scadenza (notifiche automatiche)
        TaskService.checkAndNotifyDueTasks();

        // Verifica promemoria in scadenza (badge nel menu)
        if (typeof Promemoria !== 'undefined') {
            Promemoria.checkPromemoriaInScadenza();
        }

        // Carica badge sidebar (scadenze, fatture, task)
        UI.loadSidebarBadges();

        // Carica pagina iniziale (controlla se c'è un hash nell'URL, altrimenti prima pagina accessibile)
        if (!this.handleHashChange()) {
            const firstPage = AuthService.getFirstAccessiblePage();
            UI.showPage(firstPage);
        }

        // Salva lo state iniziale nella history entry corrente,
        // così il primo popstate (tasto Indietro) avrà sempre un state valido
        if (UI.currentPage) {
            history.replaceState({ page: UI.currentPage, id: UI.currentPageId }, '');
        }
    },

    /**
     * Mostra un banner in alto per chiedere all'utente di attivare le notifiche push.
     * Il permesso DEVE partire da un click dell'utente (requisito browser).
     */
    _showPushBanner() {
        // Non mostrare se esiste già
        if (document.getElementById('fcm-push-banner')) return;

        const banner = document.createElement('div');
        banner.id = 'fcm-push-banner';
        banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:linear-gradient(135deg,#145284,#2E6DA8);color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-family:Titillium Web,sans-serif;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.25);';
        banner.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;flex:1">
                <i class="fas fa-bell" style="font-size:20px"></i>
                <span>Vuoi ricevere notifiche push per task e avvisi?</span>
            </div>
            <div style="display:flex;gap:8px">
                <button id="fcm-btn-yes" style="background:#3CA434;color:#fff;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-family:inherit;font-weight:600;font-size:13px;">Attiva</button>
                <button id="fcm-btn-no" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.4);padding:8px 14px;border-radius:6px;cursor:pointer;font-family:inherit;font-size:13px;">No grazie</button>
            </div>
        `;

        document.body.appendChild(banner);

        document.getElementById('fcm-btn-yes').addEventListener('click', async () => {
            banner.innerHTML = '<div style="display:flex;align-items:center;gap:10px;padding:4px 0"><i class="fas fa-spinner fa-spin"></i> <span>Attivazione in corso...</span></div>';
            const granted = await FCMService.requestPermission();
            if (granted) {
                banner.style.background = 'linear-gradient(135deg,#2A752F,#3CA434)';
                banner.innerHTML = '<div style="display:flex;align-items:center;gap:10px;padding:4px 0"><i class="fas fa-check-circle"></i> <span>Notifiche push attivate!</span></div>';
            } else {
                banner.style.background = '#D32F2F';
                banner.innerHTML = '<div style="display:flex;align-items:center;gap:10px;padding:4px 0"><i class="fas fa-times-circle"></i> <span>Permesso negato. Puoi attivarlo dalle impostazioni del browser.</span></div>';
            }
            setTimeout(() => banner.remove(), 3000);
        });

        document.getElementById('fcm-btn-no').addEventListener('click', () => {
            banner.remove();
            // Salva in localStorage per non chiedere di nuovo per 7 giorni
            localStorage.setItem('fcm_banner_dismissed', Date.now().toString());
        });
    },

    onUserLoggedOut() {
        // Svuota cache dati
        if (typeof DataService !== 'undefined') DataService._cacheClear();

        // Nascondi app
        document.getElementById('app').classList.add('hidden');
        document.getElementById('loading').classList.add('hidden');

        // Mostra schermata login
        document.getElementById('loginScreen').classList.remove('hidden');

        // Reset form
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.reset();
        }
    },

    // 🔗 GESTIONE URL HASH (Routing persistente + Deep Links)
    handleHashChange() {
        const hash = window.location.hash;

        // Se non c'è hash, non fare nulla
        if (!hash || hash === '#') {
            return false;
        }

        // Rimuovi il # iniziale
        const path = hash.substring(1);

        // Lista pagine valide (tutte le pagine del CRM)
        const validPages = [
            'dashboard', 'scadenzario', 'clienti', 'mappa', 'app', 'task',
            'contratti', 'fatture', 'report', 'promemoria', 'impostazioni',
            'report-app', 'push-broadcast', 'aggiorna-push', 'monitor-rss', 'generatore-webapp',
            'dettaglio-cliente', 'dettaglio-contratto', 'dettaglio-app',
            'dettaglio-fattura', 'dettaglio-scadenza'
        ];

        // Pattern: #/pagina/id (per pagine dettaglio o deep link task)
        const pageWithIdMatch = path.match(/^\/([a-z-]+)\/(.+)$/);
        if (pageWithIdMatch) {
            const pageName = pageWithIdMatch[1];
            const id = pageWithIdMatch[2];

            // Deep link Telegram per task specifico
            if (pageName === 'task' && id) {
                console.log('📱 Deep link rilevato: task', id);
                UI.showPage('task');

                // Apri dettaglio task dopo il rendering della pagina
                setTimeout(() => {
                    if (window.GestioneTask && typeof GestioneTask.viewTaskDetails === 'function') {
                        GestioneTask.viewTaskDetails(id);
                    }
                }, 800);

                return true;
            }

            // Pagina dettaglio generica (dettaglio-cliente, dettaglio-app, ecc.)
            if (validPages.includes(pageName)) {
                UI.showPage(pageName, id);
                return true;
            }
        }

        // Pattern: #/pagina (pagina senza id)
        const pageMatch = path.match(/^\/([a-z-]+)$/);
        if (pageMatch) {
            const pageName = pageMatch[1];

            // Compatibilità vecchio hash
            if (pageName === 'gestione-task') {
                UI.showPage('task');
                return true;
            }

            if (validPages.includes(pageName)) {
                UI.showPage(pageName);
                return true;
            }
        }

        return false;
    }
};

// ===== NOTIFICATION UI =====
const NotificationUI = {
    unreadListener: null,
    _toastTimer: null,

    init() {
        const notifToggle = document.getElementById('notificationToggle');
        const notifDropdown = document.getElementById('notificationDropdown');

        if (notifToggle) {
            notifToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.toggleDropdown();
            });
        }

        // Chiudi dropdown cliccando fuori
        document.addEventListener('click', (e) => {
            if (notifDropdown && !notifDropdown.contains(e.target) && !e.target.closest('#notificationToggle')) {
                notifDropdown.classList.add('hidden');
            }
        });

        // Crea il container del toast se non esiste
        if (!document.getElementById('notif-toast-container')) {
            const toastContainer = document.createElement('div');
            toastContainer.id = 'notif-toast-container';
            toastContainer.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:100000;pointer-events:none;display:flex;flex-direction:column;align-items:center;padding-top:8px;gap:8px;';
            document.body.appendChild(toastContainer);
        }

        // Avvia listener real-time
        this.startUnreadListener();
    },

    // ==========================================
    // TOAST POPUP (10 secondi nell'header)
    // ==========================================
    showToast(title, body, data = {}) {
        const container = document.getElementById('notif-toast-container');
        if (!container) return;

        const icon = NotificationService.getNotificationIcon(data.type);
        const color = NotificationService.getNotificationColor(data.type);

        const toast = document.createElement('div');
        toast.style.cssText = 'pointer-events:auto;width:min(92vw,420px);background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.18);overflow:hidden;transform:translateY(-100%);opacity:0;transition:all .4s cubic-bezier(.22,1,.36,1);cursor:pointer;border-left:4px solid ' + color + ';';
        toast.innerHTML = `
            <div style="padding:12px 16px;display:flex;gap:12px;align-items:start;">
                <div style="width:36px;height:36px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0;font-size:0.875rem;">
                    <i class="fas ${icon}"></i>
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:700;font-size:0.9375rem;color:var(--grigio-900);font-family:Titillium Web,sans-serif;margin-bottom:2px;">${this._escapeHtml(title)}</div>
                    <div style="font-size:0.875rem;color:var(--grigio-700);font-family:Titillium Web,sans-serif;line-height:1.4;">${this._escapeHtml(body)}</div>
                </div>
                <button onclick="event.stopPropagation();this.closest('div[data-toast]').remove();" style="background:none;border:none;color:var(--grigio-500);cursor:pointer;font-size:1.1rem;padding:4px;flex-shrink:0;line-height:1;">&times;</button>
            </div>
            <div style="height:3px;background:var(--grigio-200);">
                <div class="toast-progress" style="height:100%;background:${color};width:100%;transition:width 10s linear;"></div>
            </div>
        `;
        toast.setAttribute('data-toast', '1');

        // Click sul toast → naviga al task
        toast.addEventListener('click', () => {
            toast.remove();
            if (data.taskId && data.taskId !== 'null' && data.taskId !== '') {
                UI.showPage('task');
                setTimeout(() => {
                    if (window.GestioneTask && typeof GestioneTask.viewTaskDetails === 'function') {
                        GestioneTask.viewTaskDetails(data.taskId);
                    }
                }, 500);
            } else {
                // Apri centro notifiche
                UI.showPage('centro-notifiche');
            }
        });

        container.appendChild(toast);

        // Animazione entrata
        requestAnimationFrame(() => {
            toast.style.transform = 'translateY(0)';
            toast.style.opacity = '1';
            // Avvia progress bar
            const progress = toast.querySelector('.toast-progress');
            if (progress) {
                requestAnimationFrame(() => { progress.style.width = '0%'; });
            }
        });

        // Rimuovi dopo 10 secondi
        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.transform = 'translateY(-100%)';
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 400);
            }
        }, 10000);
    },

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    },

    // ==========================================
    // DROPDOWN RAPIDO (ultime 5 non lette + Vedi tutte)
    // ==========================================
    async toggleDropdown() {
        const dropdown = document.getElementById('notificationDropdown');
        const isHidden = dropdown.classList.contains('hidden');

        if (isHidden) {
            const header = document.querySelector('.app-header');
            if (header) {
                dropdown.style.top = (header.offsetHeight + 8) + 'px';
            }
            dropdown.classList.remove('hidden');
            await this.loadDropdownNotifications();
        } else {
            dropdown.classList.add('hidden');
        }
    },

    async loadDropdownNotifications() {
        const listContainer = document.getElementById('notificationList');
        listContainer.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--grigio-500);"><i class="fas fa-spinner fa-spin"></i></div>';

        const result = await NotificationService.getNotifications(5);

        if (result.success && result.notifications.length > 0) {
            let html = result.notifications.map(notif => this._renderDropdownItem(notif)).join('');
            // Link "Vedi tutte"
            html += `
                <div onclick="document.getElementById('notificationDropdown').classList.add('hidden'); UI.showPage('centro-notifiche');"
                     style="padding:12px 16px;text-align:center;cursor:pointer;background:var(--grigio-100);border-top:1px solid var(--grigio-300);font-size:0.875rem;font-weight:600;color:var(--blu-700);font-family:Titillium Web,sans-serif;transition:background .2s;"
                     onmouseover="this.style.background='var(--blu-100)'" onmouseout="this.style.background='var(--grigio-100)'">
                    <i class="fas fa-archive"></i> Vedi tutte le notifiche
                </div>
            `;
            listContainer.innerHTML = html;
        } else {
            listContainer.innerHTML = `
                <div style="padding:3rem 2rem;text-align:center;color:var(--grigio-500);">
                    <i class="fas fa-bell-slash" style="font-size:2.5rem;margin-bottom:1rem;opacity:0.3;"></i>
                    <p style="margin:0;">Nessuna notifica</p>
                </div>
                <div onclick="document.getElementById('notificationDropdown').classList.add('hidden'); UI.showPage('centro-notifiche');"
                     style="padding:12px 16px;text-align:center;cursor:pointer;background:var(--grigio-100);border-top:1px solid var(--grigio-300);font-size:0.875rem;font-weight:600;color:var(--blu-700);font-family:Titillium Web,sans-serif;"
                     onmouseover="this.style.background='var(--blu-100)'" onmouseout="this.style.background='var(--grigio-100)'">
                    <i class="fas fa-archive"></i> Archivio notifiche
                </div>
            `;
        }
    },

    _renderDropdownItem(notif) {
        const icon = NotificationService.getNotificationIcon(notif.type);
        const color = NotificationService.getNotificationColor(notif.type);
        const timeAgo = NotificationService.formatTimeAgo(notif.createdAt);
        const bg = notif.read ? '#fff' : 'var(--blu-100)';

        return `
            <div onclick="NotificationUI.handleNotificationClick('${notif.id}', '${notif.taskId}')"
                 style="padding:10px 14px;border-bottom:1px solid var(--grigio-200);cursor:pointer;background:${bg};transition:background .2s;"
                 onmouseover="this.style.background='var(--grigio-100)'" onmouseout="this.style.background='${bg}'">
                <div style="display:flex;gap:10px;align-items:start;">
                    <div style="width:34px;height:34px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0;font-size:0.8rem;">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                            <strong style="font-size:0.875rem;color:var(--grigio-900);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${notif.title}</strong>
                            ${!notif.read ? '<span style="width:8px;height:8px;background:var(--blu-700);border-radius:50%;flex-shrink:0;"></span>' : ''}
                        </div>
                        <p style="font-size:0.8125rem;color:var(--grigio-700);margin:2px 0 4px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${notif.message}</p>
                        <span style="font-size:0.6875rem;color:var(--grigio-500);"><i class="fas fa-clock"></i> ${timeAgo}</span>
                    </div>
                </div>
            </div>
        `;
    },

    async handleNotificationClick(notificationId, taskId) {
        await NotificationService.markAsRead(notificationId);
        document.getElementById('notificationDropdown').classList.add('hidden');

        if (taskId && taskId !== 'null' && taskId !== 'undefined') {
            UI.showPage('task');
            setTimeout(() => {
                if (window.GestioneTask && typeof GestioneTask.viewTaskDetails === 'function') {
                    GestioneTask.viewTaskDetails(taskId);
                }
            }, 500);
        }

        this.updateBadge();
    },

    async markAllAsRead() {
        const result = await NotificationService.markAllAsRead();
        if (result.success) {
            UI.showSuccess(`${result.count} notifiche segnate come lette`);
            // Ricarica dropdown se aperto
            const dropdown = document.getElementById('notificationDropdown');
            if (dropdown && !dropdown.classList.contains('hidden')) {
                await this.loadDropdownNotifications();
            }
            this.updateBadge();
        }
    },

    startUnreadListener() {
        if (this.unreadListener) {
            this.unreadListener();
        }

        // Listener diretto su Firestore per rilevare nuove notifiche e mostrare toast
        const userId = AuthService.getUserId();
        if (!userId) return;

        let isFirstSnapshot = true;

        this.unreadListener = db.collection('notifications')
            .where('userId', '==', userId)
            .where('read', '==', false)
            .onSnapshot(snapshot => {
                // Aggiorna badge
                this.updateBadgeCount(snapshot.size);

                // Mostra toast solo per notifiche NUOVE (non al primo caricamento)
                if (isFirstSnapshot) {
                    isFirstSnapshot = false;
                    return;
                }

                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const notifData = change.doc.data();
                        const title = notifData.title || 'Nuova notifica';
                        const body = notifData.message || '';
                        const extra = {
                            type: notifData.type || '',
                            taskId: notifData.taskId || '',
                            appId: notifData.appId || ''
                        };

                        // Toast in-app
                        this.showToast(title, body, extra);

                        // Notifica nativa Chrome (via Service Worker per banner affidabile)
                        if (Notification.permission === 'granted' && navigator.serviceWorker) {
                            navigator.serviceWorker.ready.then(reg => {
                                reg.showNotification(title, {
                                    body: body,
                                    icon: '/img/icon-192.png',
                                    badge: '/img/icon-72.png',
                                    tag: 'crm-' + change.doc.id,
                                    renotify: true,
                                    data: extra,
                                    vibrate: [200, 100, 200],
                                    requireInteraction: false
                                });
                            }).catch(e => { /* ignora */ });
                        }
                    }
                });
            }, error => {
                console.error('Errore listener notifiche:', error);
            });
    },

    stopUnreadListener() {
        if (this.unreadListener) {
            this.unreadListener();
            this.unreadListener = null;
        }
    },

    updateBadgeCount(count) {
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    },

    async updateBadge() {
        const result = await NotificationService.getUnreadCount();
        if (result.success) {
            this.updateBadgeCount(result.count);
        }
    }
};

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
} else {
    App.init();
}

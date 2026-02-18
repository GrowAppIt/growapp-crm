// Main App Controller
const App = {
    init() {

        // Setup event listeners
        this.setupEventListeners();

        // Monitor auth state
        AuthService.onAuthStateChanged((user) => {
            if (user) {
                this.onUserLoggedIn();
            } else {
                this.onUserLoggedOut();
            }
        });
    },

    setupEventListeners() {
        // 🔗 URL Hash Routing (per deep links da Telegram)
        window.addEventListener('hashchange', () => this.handleHashChange());

        // Login form
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }

        // Menu toggle
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
            alert('Errore di accesso: ' + result.error);
        }
    },

    async handleLogout() {
        UI.showLoading();
        const result = await AuthService.logout();

        if (result.success) {
            // L'auth state observer gestirà il resto
        } else {
            UI.hideLoading();
            alert('Errore logout: ' + result.error);
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

        // Inizializza sistema notifiche
        NotificationUI.init();

        // Verifica task in scadenza (notifiche automatiche)
        TaskService.checkAndNotifyDueTasks();

        // Carica pagina iniziale (controlla se c'è un hash nell'URL, altrimenti prima pagina accessibile)
        if (!this.handleHashChange()) {
            const firstPage = AuthService.getFirstAccessiblePage();
            UI.showPage(firstPage);
        }
    },

    onUserLoggedOut() {

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
            'dashboard', 'scadenzario', 'clienti', 'app', 'task',
            'contratti', 'fatture', 'report', 'impostazioni',
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

    init() {
        // Setup toggle dropdown
        const notifToggle = document.getElementById('notificationToggle');
        const notifDropdown = document.getElementById('notificationDropdown');

        if (notifToggle) {
            notifToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDropdown();
            });
        }

        // Chiudi dropdown cliccando fuori
        document.addEventListener('click', (e) => {
            if (!notifDropdown.contains(e.target) && e.target.id !== 'notificationToggle') {
                notifDropdown.classList.add('hidden');
            }
        });

        // Avvia listener real-time
        this.startUnreadListener();
    },

    async toggleDropdown() {
        const dropdown = document.getElementById('notificationDropdown');
        const isHidden = dropdown.classList.contains('hidden');

        if (isHidden) {
            dropdown.classList.remove('hidden');
            await this.loadNotifications();
        } else {
            dropdown.classList.add('hidden');
        }
    },

    async loadNotifications() {
        const listContainer = document.getElementById('notificationList');
        listContainer.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--grigio-500);"><i class="fas fa-spinner fa-spin"></i> Caricamento...</div>';

        const result = await NotificationService.getNotifications(10);

        // 🔍 DEBUG: Log per vedere cosa viene restituito
        console.log('📬 Notifiche caricate:', result);

        if (result.success && result.notifications.length > 0) {
            listContainer.innerHTML = result.notifications.map(notif => this.renderNotification(notif)).join('');
        } else {
            // 🔍 DEBUG: Log se non ci sono notifiche
            console.log('⚠️ Nessuna notifica trovata. Success:', result.success, 'Count:', result.notifications?.length);
            listContainer.innerHTML = `
                <div style="padding: 3rem 2rem; text-align: center; color: var(--grigio-500);">
                    <i class="fas fa-bell-slash" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i>
                    <p>Nessuna notifica</p>
                </div>
            `;
        }
    },

    renderNotification(notif) {
        const icon = NotificationService.getNotificationIcon(notif.type);
        const color = NotificationService.getNotificationColor(notif.type);
        const timeAgo = NotificationService.formatTimeAgo(notif.createdAt);

        return `
            <div class="notification-item" onclick="NotificationUI.handleNotificationClick('${notif.id}', '${notif.taskId}')"
                 style="padding: 1rem; border-bottom: 1px solid var(--grigio-200); cursor: pointer; background: ${notif.read ? 'white' : 'var(--blu-100)'}; transition: background 0.2s;"
                 onmouseover="this.style.background='var(--grigio-100)'" onmouseout="this.style.background='${notif.read ? 'white' : 'var(--blu-100)'}'">
                <div style="display: flex; gap: 1rem; align-items: start;">
                    <div style="width: 40px; height: 40px; border-radius: 50%; background: ${color}; display: flex; align-items: center; justify-content: center; color: white; flex-shrink: 0;">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.25rem;">
                            <strong style="font-size: 0.9375rem; color: var(--grigio-900);">${notif.title}</strong>
                            ${!notif.read ? '<span style="width: 8px; height: 8px; background: var(--blu-700); border-radius: 50%; flex-shrink: 0;"></span>' : ''}
                        </div>
                        <p style="font-size: 0.875rem; color: var(--grigio-700); margin: 0 0 0.5rem 0; line-height: 1.4;">
                            ${notif.message}
                        </p>
                        <span style="font-size: 0.75rem; color: var(--grigio-500);">
                            <i class="fas fa-clock"></i> ${timeAgo}
                        </span>
                    </div>
                </div>
            </div>
        `;
    },

    async handleNotificationClick(notificationId, taskId) {
        // Segna come letta
        await NotificationService.markAsRead(notificationId);

        // Chiudi dropdown
        document.getElementById('notificationDropdown').classList.add('hidden');

        // Naviga al task e aprilo
        if (taskId && taskId !== 'null') {
            UI.showPage('task');

            // Attendi che la pagina sia caricata, poi apri il dettaglio
            setTimeout(() => {
                if (window.GestioneTask && typeof GestioneTask.viewTaskDetails === 'function') {
                    GestioneTask.viewTaskDetails(taskId);
                }
            }, 500);
        }

        // Ricarica badge
        this.updateBadge();
    },

    async markAllAsRead() {
        const result = await NotificationService.markAllAsRead();
        if (result.success) {
            UI.showSuccess(`${result.count} notifiche segnate come lette`);
            await this.loadNotifications();
            this.updateBadge();
        }
    },

    startUnreadListener() {
        if (this.unreadListener) {
            this.unreadListener(); // Stoppa listener precedente
        }

        this.unreadListener = NotificationService.startUnreadListener((count) => {
            this.updateBadgeCount(count);
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

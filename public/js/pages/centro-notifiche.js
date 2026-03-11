/**
 * Centro Notifiche — Archivio completo notifiche con filtri, paginazione e azioni
 */
const CentroNotifiche = {

    _notifications: [],
    _filteredNotifications: [],
    _currentFilter: 'all', // 'all', 'unread', oppure un tipo specifico
    _pageSize: 20,
    _currentPage: 1,

    async render() {
        const mainContent = document.getElementById('mainContent');
        mainContent.innerHTML = this._buildSkeleton();

        // Carica tutte le notifiche
        await this._loadAll();
        this._applyFilter();
        this._renderList();
    },

    _buildSkeleton() {
        return `
        <div style="max-width:800px;margin:0 auto;padding:1rem;">
            <!-- Header -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;flex-wrap:wrap;gap:0.75rem;">
                <h1 style="margin:0;font-size:1.5rem;font-weight:900;color:var(--blu-700);font-family:Titillium Web,sans-serif;">
                    <i class="fas fa-bell"></i> Centro Notifiche
                </h1>
                <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                    <button onclick="CentroNotifiche._markAllRead()" style="background:var(--blu-700);color:#fff;border:none;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:0.8125rem;font-weight:600;font-family:Titillium Web,sans-serif;display:flex;align-items:center;gap:6px;">
                        <i class="fas fa-check-double"></i> Segna tutte lette
                    </button>
                    <button onclick="CentroNotifiche._deleteAllRead()" style="background:var(--grigio-100);color:var(--grigio-700);border:1px solid var(--grigio-300);padding:8px 14px;border-radius:8px;cursor:pointer;font-size:0.8125rem;font-weight:600;font-family:Titillium Web,sans-serif;display:flex;align-items:center;gap:6px;">
                        <i class="fas fa-trash-alt"></i> Elimina lette
                    </button>
                </div>
            </div>

            <!-- Filtri -->
            <div id="cn-filters" style="display:flex;gap:0.5rem;margin-bottom:1rem;overflow-x:auto;padding-bottom:4px;flex-wrap:wrap;">
                <button class="cn-filter-btn cn-filter-active" data-filter="all" onclick="CentroNotifiche._setFilter('all')">
                    <i class="fas fa-inbox"></i> Tutte
                </button>
                <button class="cn-filter-btn" data-filter="unread" onclick="CentroNotifiche._setFilter('unread')">
                    <i class="fas fa-circle" style="font-size:0.5rem;"></i> Non lette
                </button>
                <button class="cn-filter-btn" data-filter="task_assigned" onclick="CentroNotifiche._setFilter('task_assigned')">
                    <i class="fas fa-user-check"></i> Assegnazioni
                </button>
                <button class="cn-filter-btn" data-filter="task_due_soon" onclick="CentroNotifiche._setFilter('task_due_soon')">
                    <i class="fas fa-clock"></i> Scadenze
                </button>
                <button class="cn-filter-btn" data-filter="task_status_changed" onclick="CentroNotifiche._setFilter('task_status_changed')">
                    <i class="fas fa-sync-alt"></i> Aggiornamenti
                </button>
                <button class="cn-filter-btn" data-filter="new_comment" onclick="CentroNotifiche._setFilter('new_comment')">
                    <i class="fas fa-comment"></i> Commenti
                </button>
            </div>

            <!-- Contatore -->
            <div id="cn-counter" style="font-size:0.8125rem;color:var(--grigio-500);margin-bottom:0.75rem;font-family:Titillium Web,sans-serif;"></div>

            <!-- Lista notifiche -->
            <div id="cn-list" style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:hidden;">
                <div style="padding:3rem;text-align:center;color:var(--grigio-500);"><i class="fas fa-spinner fa-spin fa-2x"></i></div>
            </div>

            <!-- Paginazione -->
            <div id="cn-pagination" style="display:flex;justify-content:center;gap:0.5rem;margin-top:1rem;flex-wrap:wrap;"></div>
        </div>

        <style>
            .cn-filter-btn {
                background: #fff;
                border: 1px solid var(--grigio-300);
                padding: 6px 14px;
                border-radius: 20px;
                cursor: pointer;
                font-size: 0.8125rem;
                font-family: Titillium Web, sans-serif;
                font-weight: 600;
                color: var(--grigio-700);
                display: flex;
                align-items: center;
                gap: 6px;
                white-space: nowrap;
                transition: all 0.2s;
            }
            .cn-filter-btn:hover { background: var(--blu-100); color: var(--blu-700); border-color: var(--blu-300); }
            .cn-filter-active { background: var(--blu-700) !important; color: #fff !important; border-color: var(--blu-700) !important; }
            .cn-notif-row { padding: 14px 16px; border-bottom: 1px solid var(--grigio-200); display: flex; gap: 12px; align-items: start; transition: background 0.2s; cursor: pointer; }
            .cn-notif-row:hover { background: var(--grigio-100); }
            .cn-notif-row:last-child { border-bottom: none; }
            .cn-notif-unread { background: var(--blu-100); }
            .cn-page-btn {
                width: 36px; height: 36px; border-radius: 8px; border: 1px solid var(--grigio-300);
                background: #fff; color: var(--grigio-700); cursor: pointer; font-weight: 600;
                font-family: Titillium Web, sans-serif; font-size: 0.875rem; display: flex;
                align-items: center; justify-content: center; transition: all 0.2s;
            }
            .cn-page-btn:hover { background: var(--blu-100); border-color: var(--blu-300); }
            .cn-page-active { background: var(--blu-700) !important; color: #fff !important; border-color: var(--blu-700) !important; }
        </style>
        `;
    },

    async _loadAll() {
        try {
            const userId = AuthService.getUserId();
            if (!userId) return;

            // Carica fino a 200 notifiche
            let notifications = [];
            try {
                const snapshot = await db.collection('notifications')
                    .where('userId', '==', userId)
                    .orderBy('createdAt', 'desc')
                    .limit(200)
                    .get();
                snapshot.forEach(doc => {
                    notifications.push({ id: doc.id, ...doc.data() });
                });
            } catch (indexError) {
                // Fallback senza orderBy
                const snapshot = await db.collection('notifications')
                    .where('userId', '==', userId)
                    .limit(200)
                    .get();
                snapshot.forEach(doc => {
                    notifications.push({ id: doc.id, ...doc.data() });
                });
                notifications.sort((a, b) => {
                    const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
                    const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
                    return dateB - dateA;
                });
            }

            this._notifications = notifications;
        } catch (error) {
            console.error('Errore caricamento notifiche:', error);
            this._notifications = [];
        }
    },

    _applyFilter() {
        const f = this._currentFilter;
        if (f === 'all') {
            this._filteredNotifications = [...this._notifications];
        } else if (f === 'unread') {
            this._filteredNotifications = this._notifications.filter(n => !n.read);
        } else {
            // Filtro per tipo — includi anche task_overdue insieme a task_due_soon
            if (f === 'task_due_soon') {
                this._filteredNotifications = this._notifications.filter(n => n.type === 'task_due_soon' || n.type === 'task_overdue');
            } else if (f === 'task_assigned') {
                this._filteredNotifications = this._notifications.filter(n => n.type === 'task_assigned' || n.type === 'task_reassigned' || n.type === 'task_taken');
            } else {
                this._filteredNotifications = this._notifications.filter(n => n.type === f);
            }
        }
        this._currentPage = 1;
    },

    _setFilter(filter) {
        this._currentFilter = filter;
        // Aggiorna stile bottoni
        document.querySelectorAll('.cn-filter-btn').forEach(btn => {
            btn.classList.toggle('cn-filter-active', btn.dataset.filter === filter);
        });
        this._applyFilter();
        this._renderList();
    },

    _renderList() {
        const listEl = document.getElementById('cn-list');
        const counterEl = document.getElementById('cn-counter');
        const total = this._filteredNotifications.length;
        const totalPages = Math.max(1, Math.ceil(total / this._pageSize));
        const start = (this._currentPage - 1) * this._pageSize;
        const pageItems = this._filteredNotifications.slice(start, start + this._pageSize);

        // Contatore
        const unreadCount = this._notifications.filter(n => !n.read).length;
        counterEl.textContent = `${total} notifiche trovate · ${unreadCount} non lette`;

        if (pageItems.length === 0) {
            listEl.innerHTML = `
                <div style="padding:4rem 2rem;text-align:center;color:var(--grigio-500);">
                    <i class="fas fa-bell-slash" style="font-size:3rem;margin-bottom:1rem;opacity:0.3;"></i>
                    <p style="margin:0;font-size:1rem;">Nessuna notifica${this._currentFilter !== 'all' ? ' per questo filtro' : ''}</p>
                </div>
            `;
        } else {
            listEl.innerHTML = pageItems.map(n => this._renderRow(n)).join('');
        }

        // Paginazione
        this._renderPagination(totalPages);
    },

    _renderRow(notif) {
        const icon = NotificationService.getNotificationIcon(notif.type);
        const color = NotificationService.getNotificationColor(notif.type);
        const timeAgo = NotificationService.formatTimeAgo(notif.createdAt);
        const unreadClass = notif.read ? '' : 'cn-notif-unread';

        return `
            <div class="cn-notif-row ${unreadClass}" onclick="CentroNotifiche._clickNotif('${notif.id}', '${notif.taskId || ''}')">
                <div style="width:40px;height:40px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0;">
                    <i class="fas ${icon}"></i>
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:2px;">
                        <strong style="font-size:0.9375rem;color:var(--grigio-900);font-family:Titillium Web,sans-serif;">${notif.title}</strong>
                        ${!notif.read ? '<span style="width:8px;height:8px;background:var(--blu-700);border-radius:50%;flex-shrink:0;"></span>' : ''}
                    </div>
                    <p style="font-size:0.875rem;color:var(--grigio-700);margin:0 0 6px;line-height:1.4;">${notif.message}</p>
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-size:0.75rem;color:var(--grigio-500);"><i class="fas fa-clock"></i> ${timeAgo}</span>
                        <button onclick="event.stopPropagation(); CentroNotifiche._deleteOne('${notif.id}')" style="background:none;border:none;color:var(--grigio-400);cursor:pointer;font-size:0.8rem;padding:4px 8px;border-radius:6px;transition:all .2s;" onmouseover="this.style.color='var(--rosso-errore)';this.style.background='rgba(211,47,47,0.08)'" onmouseout="this.style.color='var(--grigio-400)';this.style.background='none'">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    _renderPagination(totalPages) {
        const paginationEl = document.getElementById('cn-pagination');
        if (totalPages <= 1) {
            paginationEl.innerHTML = '';
            return;
        }

        let html = '';
        // Prev
        if (this._currentPage > 1) {
            html += `<button class="cn-page-btn" onclick="CentroNotifiche._goToPage(${this._currentPage - 1})"><i class="fas fa-chevron-left"></i></button>`;
        }
        // Pages
        for (let i = 1; i <= totalPages; i++) {
            if (totalPages > 7 && i > 2 && i < totalPages - 1 && Math.abs(i - this._currentPage) > 1) {
                if (i === 3 || i === totalPages - 2) html += `<span style="padding:0 4px;color:var(--grigio-500);">...</span>`;
                continue;
            }
            html += `<button class="cn-page-btn ${i === this._currentPage ? 'cn-page-active' : ''}" onclick="CentroNotifiche._goToPage(${i})">${i}</button>`;
        }
        // Next
        if (this._currentPage < totalPages) {
            html += `<button class="cn-page-btn" onclick="CentroNotifiche._goToPage(${this._currentPage + 1})"><i class="fas fa-chevron-right"></i></button>`;
        }
        paginationEl.innerHTML = html;
    },

    _goToPage(page) {
        this._currentPage = page;
        this._renderList();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    async _clickNotif(notifId, taskId) {
        // Segna come letta
        await NotificationService.markAsRead(notifId);
        // Aggiorna localmente
        const notif = this._notifications.find(n => n.id === notifId);
        if (notif) notif.read = true;

        // Naviga al task
        if (taskId && taskId !== 'null' && taskId !== 'undefined' && taskId !== '') {
            UI.showPage('task');
            setTimeout(() => {
                if (window.GestioneTask && typeof GestioneTask.viewTaskDetails === 'function') {
                    GestioneTask.viewTaskDetails(taskId);
                }
            }, 500);
        } else {
            // Ricarica lista
            this._applyFilter();
            this._renderList();
        }

        NotificationUI.updateBadge();
    },

    async _markAllRead() {
        const result = await NotificationService.markAllAsRead();
        if (result.success) {
            UI.showSuccess(`${result.count} notifiche segnate come lette`);
            this._notifications.forEach(n => n.read = true);
            this._applyFilter();
            this._renderList();
            NotificationUI.updateBadge();
        }
    },

    async _deleteOne(notifId) {
        const result = await NotificationService.deleteNotification(notifId);
        if (result.success) {
            this._notifications = this._notifications.filter(n => n.id !== notifId);
            this._applyFilter();
            this._renderList();
            NotificationUI.updateBadge();
        }
    },

    async _deleteAllRead() {
        const readNotifs = this._notifications.filter(n => n.read);
        if (readNotifs.length === 0) {
            UI.showSuccess('Nessuna notifica letta da eliminare');
            return;
        }

        // Elimina a batch di 500
        const batchSize = 500;
        for (let i = 0; i < readNotifs.length; i += batchSize) {
            const batch = db.batch();
            const chunk = readNotifs.slice(i, i + batchSize);
            chunk.forEach(n => {
                batch.delete(db.collection('notifications').doc(n.id));
            });
            await batch.commit();
        }

        UI.showSuccess(`${readNotifs.length} notifiche eliminate`);
        this._notifications = this._notifications.filter(n => !n.read);
        this._applyFilter();
        this._renderList();
        NotificationUI.updateBadge();
    }
};

window.CentroNotifiche = CentroNotifiche;

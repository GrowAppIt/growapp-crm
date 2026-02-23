// UI Module - Gestione interfaccia utente
const UI = {
    // === NAVIGATION ===
    // Pagina corrente (per routing hash)
    currentPage: null,
    currentPageId: null,

    showPage(pageName, id = null) {
        // Verifica accesso alla pagina
        if (!AuthService.isAuthenticated()) {
            return;
        }

        if (!AuthService.canAccessPage(pageName)) {
            this.showAccessDenied(pageName);
            return;
        }

        // Cleanup pagina precedente (se necessario)
        if (typeof MonitorRSS !== 'undefined' && this.currentPage === 'monitor-rss' && pageName !== 'monitor-rss') {
            MonitorRSS.cleanup();
        }

        // Salva pagina corrente
        this.currentPage = pageName;
        this.currentPageId = id;

        // Aggiorna hash URL per persistenza al refresh (senza triggerare hashchange)
        const hashValue = id ? `#/${pageName}/${id}` : `#/${pageName}`;
        if (window.location.hash !== hashValue) {
            history.replaceState(null, '', window.location.pathname + window.location.search + hashValue);
        }

        // Aggiorna menu attivo (solo per pagine principali, non dettagli)
        if (!pageName.startsWith('dettaglio-')) {
            document.querySelectorAll('.menu-item').forEach(item => {
                item.classList.remove('active');
                if (item.dataset.page === pageName) {
                    item.classList.add('active');
                }
            });
        }

        // Carica contenuto pagina — skeleton se disponibile, altrimenti spinner
        const mainContent = document.getElementById('mainContent');
        const skeleton = this.getPageSkeleton(pageName);
        mainContent.innerHTML = skeleton || '<div class="loading-spinner" style="margin:3rem auto;"></div>';
        mainContent.scrollTop = 0;

        // Chiudi sidebar su mobile
        this.closeSidebar();

        // Carica pagina specifica
        switch (pageName) {
            case 'dashboard':
                Dashboard.render();
                break;
            case 'scadenzario':
                Scadenzario.render();
                break;
            case 'clienti':
                Clienti.render();
                break;
            case 'app':
                GestioneApp.render();
                break;
            case 'task':
                GestioneTask.render();
                break;
            case 'contratti':
                Contratti.render();
                break;
            case 'fatture':
                Fatture.render();
                break;
            case 'report':
                Report.render();
                break;
            case 'mappa':
                MappaClienti.render();
                break;
            case 'promemoria':
                Promemoria.render();
                break;
            case 'impostazioni':
                Settings.render();
                break;
            case 'monitor-rss':
                MonitorRSS.render();
                break;
            // Pagine di dettaglio
            case 'dettaglio-cliente':
                if (id) DettaglioCliente.render(id);
                else UI.showPage('clienti');
                break;
            case 'dettaglio-contratto':
                if (id) DettaglioContratto.render(id);
                else UI.showPage('contratti');
                break;
            case 'dettaglio-app':
                if (id) DettaglioApp.render(id);
                else UI.showPage('app');
                break;
            case 'dettaglio-fattura':
                if (id) DettaglioFattura.render(id);
                else UI.showPage('fatture');
                break;
            case 'dettaglio-scadenza':
                if (id) DettaglioScadenza.render(id);
                else UI.showPage('scadenzario');
                break;
            default:
                mainContent.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-tools"></i>
                        <h3>Pagina in sviluppo</h3>
                        <p>Questa funzionalità sarà disponibile a breve</p>
                    </div>
                `;
        }
    },

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    },

    closeSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    },

    toggleUserMenu() {
        const userMenu = document.getElementById('userMenu');
        userMenu.classList.toggle('hidden');
    },

    closeUserMenu() {
        const userMenu = document.getElementById('userMenu');
        userMenu.classList.add('hidden');
    },

    // === COMPONENTI ===
    createKPICard(options) {
        const { icon, iconClass, label, value, onclick } = options;
        // Escape HTML degli apici per evitare conflitti nell'attributo onclick
        const clickAttr = onclick ? `onclick='${onclick.replace(/'/g, "&#39;")}'` : '';
        const cursorStyle = onclick ? 'cursor:pointer;' : '';

        return `
            <div class="kpi-card" style="${cursorStyle}" ${clickAttr}>
                <div class="kpi-icon ${iconClass}">
                    <i class="fas fa-${icon}"></i>
                </div>
                <div class="kpi-content">
                    <div class="kpi-label">${label}</div>
                    <div class="kpi-value">${value}</div>
                </div>
            </div>
        `;
    },

    createListItem(options) {
        const { title, subtitle, badge, badgeClass, icon, onclick } = options;
        const clickAttr = onclick ? `onclick='${onclick.replace(/'/g, "&#39;")}'` : '';
        const iconHTML = icon ? `<i class="fas fa-${icon}"></i>` : '';
        const badgeHTML = badge ? `<span class="badge ${badgeClass}">${badge}</span>` : '';

        return `
            <div class="list-item" ${clickAttr}>
                ${iconHTML}
                <div class="list-item-content">
                    <div class="list-item-title">${title}</div>
                    <div class="list-item-meta">${subtitle}</div>
                </div>
                <div class="list-item-action">
                    ${badgeHTML}
                    <i class="fas fa-chevron-right"></i>
                </div>
            </div>
        `;
    },

    createCard(options) {
        const { title, subtitle, content, actions } = options;
        const subtitleHTML = subtitle ? `<div class="card-subtitle">${subtitle}</div>` : '';
        const actionsHTML = actions ? `<div class="card-actions">${actions}</div>` : '';

        return `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">${title}</h2>
                    ${subtitleHTML}
                </div>
                <div class="card-body">
                    ${content}
                </div>
                ${actionsHTML}
            </div>
        `;
    },

    createEmptyState(options) {
        const { icon, title, subtitle } = options;
        return `
            <div class="empty-state">
                <i class="fas fa-${icon}"></i>
                <h3>${title}</h3>
                <p>${subtitle}</p>
            </div>
        `;
    },

    // === TOAST NOTIFICATIONS ===
    _toastContainer: null,

    _getToastContainer() {
        if (!this._toastContainer || !document.body.contains(this._toastContainer)) {
            this._toastContainer = document.createElement('div');
            this._toastContainer.id = 'toastContainer';
            this._toastContainer.className = 'toast-container';
            document.body.appendChild(this._toastContainer);
        }
        return this._toastContainer;
    },

    showNotification(message, type = 'info', duration = 3500) {
        const container = this._getToastContainer();

        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <i class="fas ${icons[type] || icons.info}"></i>
            <span class="toast-msg">${message}</span>
            <button class="toast-close" onclick="this.parentElement.classList.add('toast-exit')">
                <i class="fas fa-times"></i>
            </button>
        `;

        container.appendChild(toast);

        // Trigger animazione entrata (richiede un frame per la transizione CSS)
        requestAnimationFrame(() => {
            toast.classList.add('toast-enter');
        });

        // Auto-dismiss
        const timer = setTimeout(() => {
            toast.classList.add('toast-exit');
        }, duration);

        // Rimuovi dal DOM dopo animazione uscita
        toast.addEventListener('animationend', (e) => {
            if (e.animationName === 'toastSlideOut') {
                clearTimeout(timer);
                toast.remove();
            }
        });
    },

    showError(message) {
        this.showNotification(message, 'error', 5000);
    },

    showSuccess(message) {
        this.showNotification(message, 'success');
    },

    showWarning(message) {
        this.showNotification(message, 'warning', 4500);
    },

    // === SKELETON LOADING ===
    _skeletonLine(w = '60%', h = '14px') {
        return `<div class="sk" style="height:${h};width:${w};margin-bottom:0.5rem;"></div>`;
    },

    /**
     * Genera HTML skeleton in base al tipo di pagina.
     * Dashboard ha il suo skeleton custom (_renderSkeleton).
     * Le altre pagine usano template generici.
     */
    getPageSkeleton(pageName) {
        // Skeleton per pagine lista (clienti, fatture, contratti, app, task, scadenzario)
        const skRow = `
            <div style="display:flex;align-items:center;gap:1rem;padding:1rem 0;border-bottom:1px solid var(--grigio-100);">
                <div class="sk sk-circle" style="width:40px;height:40px;flex-shrink:0;"></div>
                <div style="flex:1;">
                    <div class="sk" style="height:15px;width:55%;margin-bottom:6px;"></div>
                    <div class="sk" style="height:12px;width:35%;"></div>
                </div>
                <div class="sk" style="height:24px;width:70px;border-radius:12px;"></div>
            </div>`;

        const skFilterBar = `
            <div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-bottom:1.5rem;">
                <div class="sk" style="height:40px;width:min(100%,280px);border-radius:8px;"></div>
                <div class="sk" style="height:40px;width:120px;border-radius:8px;"></div>
                <div class="sk" style="height:40px;width:120px;border-radius:8px;"></div>
            </div>`;

        const skHeader = (icon, title) => `
            <div class="page-header mb-3">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;">
                    <div>
                        <h1 style="font-size:2rem;font-weight:700;color:var(--blu-700);margin-bottom:0.5rem;">
                            <i class="fas ${icon}"></i> ${title}
                        </h1>
                        <div class="sk" style="height:14px;width:140px;"></div>
                    </div>
                    <div style="display:flex;gap:0.5rem;">
                        <div class="sk" style="height:38px;width:100px;border-radius:8px;"></div>
                    </div>
                </div>
            </div>`;

        // Pagine dettaglio: skeleton più semplice (card singola)
        const skDettaglio = (icon, title) => `
            ${skHeader(icon, title)}
            <div class="sk-card" style="margin-bottom:1rem;">
                <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;">
                    <div class="sk" style="width:64px;height:64px;border-radius:14px;"></div>
                    <div style="flex:1;">
                        <div class="sk" style="height:22px;width:50%;margin-bottom:8px;"></div>
                        <div class="sk" style="height:14px;width:30%;"></div>
                    </div>
                </div>
                <div class="sk" style="height:14px;width:90%;margin-bottom:0.5rem;"></div>
                <div class="sk" style="height:14px;width:75%;margin-bottom:0.5rem;"></div>
                <div class="sk" style="height:14px;width:60%;"></div>
            </div>`;

        // Skeleton per pagine con griglia di card (report, mappa, promemoria)
        const skCardGrid = (icon, title, n = 4) => `
            ${skHeader(icon, title)}
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:1rem;">
                ${Array(n).fill(`
                    <div class="sk-card">
                        <div class="sk" style="height:18px;width:45%;margin-bottom:1rem;"></div>
                        <div class="sk" style="height:60px;width:100%;margin-bottom:0.75rem;"></div>
                        <div class="sk" style="height:14px;width:70%;"></div>
                    </div>
                `).join('')}
            </div>`;

        // Lista generica (tabella)
        const skLista = (icon, title) => `
            ${skHeader(icon, title)}
            ${skFilterBar}
            <div class="sk-card">
                ${Array(6).fill(skRow).join('')}
            </div>`;

        const map = {
            'clienti':       () => skLista('fa-users', 'Clienti'),
            'fatture':       () => skLista('fa-file-invoice', 'Fatture'),
            'contratti':     () => skLista('fa-file-contract', 'Contratti'),
            'app':           () => skLista('fa-mobile-alt', 'App'),
            'task':          () => skLista('fa-tasks', 'Task'),
            'scadenzario':   () => skLista('fa-calendar-alt', 'Scadenzario'),
            'report':        () => skCardGrid('fa-chart-bar', 'Report', 4),
            'mappa':         () => skCardGrid('fa-map-marked-alt', 'Mappa Clienti', 1),
            'promemoria':    () => skCardGrid('fa-bell', 'Promemoria', 3),
            'impostazioni':  () => skCardGrid('fa-cog', 'Impostazioni', 3),
            'monitor-rss':   () => skCardGrid('fa-rss', 'Monitor RSS', 2),
            'dettaglio-cliente':   () => skDettaglio('fa-user', 'Dettaglio Cliente'),
            'dettaglio-app':       () => skDettaglio('fa-mobile-alt', 'Dettaglio App'),
            'dettaglio-contratto': () => skDettaglio('fa-file-contract', 'Dettaglio Contratto'),
            'dettaglio-fattura':   () => skDettaglio('fa-file-invoice', 'Dettaglio Fattura'),
            'dettaglio-scadenza':  () => skDettaglio('fa-calendar-alt', 'Dettaglio Scadenza'),
        };

        // La dashboard ha il suo skeleton custom, non serve qui
        if (pageName === 'dashboard') return null;

        const generator = map[pageName];
        return generator ? generator() : null;
    },

    // === UTILITY ===
    showLoading() {
        document.getElementById('loading').classList.remove('hidden');
    },

    hideLoading() {
        document.getElementById('loading').classList.add('hidden');
    },

    async setUserInfo(name, role) {
        // Aggiorna nome utente
        document.getElementById('userName').textContent = name;

        // Aggiorna nome nell'header
        const userHeaderName = document.getElementById('userHeaderName');
        if (userHeaderName) userHeaderName.textContent = name;

        // Carica foto profilo dall'utente Firebase
        const userData = await AuthService.getCurrentUserData();
        const photoURL = userData?.photoURL || null;

        // Aggiorna avatar nell'header
        const userHeaderAvatar = document.getElementById('userHeaderAvatar');
        if (userHeaderAvatar) {
            if (photoURL) {
                userHeaderAvatar.innerHTML = `<img src="${photoURL}" alt="${name}" style="width: 100%; height: 100%; object-fit: cover;">`;
            } else {
                // Mostra iniziali
                const initials = this.getInitials(name);
                userHeaderAvatar.innerHTML = `<span style="font-weight: 700; font-size: 1rem;">${initials}</span>`;
            }
        }

        // Aggiorna avatar nel menu dropdown
        const userMenuAvatar = document.getElementById('userMenuAvatar');
        if (userMenuAvatar) {
            if (photoURL) {
                userMenuAvatar.innerHTML = `<img src="${photoURL}" alt="${name}" style="width: 100%; height: 100%; object-fit: cover;">`;
            } else {
                // Mostra iniziali
                const initials = this.getInitials(name);
                userMenuAvatar.innerHTML = `<span style="font-weight: 700; font-size: 1.5rem;">${initials}</span>`;
            }
        }

        // Inizializza menu basato su permessi
        this.initializeMenuByPermissions();
    },

    getInitials(fullName) {
        if (!fullName) return 'U';
        const parts = fullName.split(' ').filter(p => p.length > 0);
        if (parts.length === 0) return 'U';
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    },

    async showProfileSettings() {
        const userData = await AuthService.getCurrentUserData();
        const currentPhotoURL = userData?.photoURL || '';

        const content = `
            <div class="form-section">
                <h3><i class="fas fa-camera"></i> Foto Profilo</h3>

                <div style="text-align: center; margin-bottom: 1.5rem;">
                    <div id="profilePhotoPreview" style="width: 120px; height: 120px; border-radius: 50%; overflow: hidden; margin: 0 auto 1rem; border: 3px solid var(--blu-700); display: flex; align-items: center; justify-content: center; background: var(--grigio-100); color: var(--blu-700); font-size: 3rem;">
                        ${currentPhotoURL ? `<img src="${currentPhotoURL}" style="width: 100%; height: 100%; object-fit: cover;">` : `<i class="fas fa-user"></i>`}
                    </div>

                    <input type="hidden" id="photoURL" value="${currentPhotoURL}">

                    <div style="display: flex; gap: 0.5rem; justify-content: center; margin-bottom: 1rem;">
                        <label for="photoFileInput" class="btn btn-primary btn-sm" style="margin: 0; cursor: pointer;">
                            <i class="fas fa-upload"></i> Carica Foto
                        </label>
                        <input type="file" id="photoFileInput" accept="image/*" style="display: none;" onchange="UI.handleProfilePhotoUpload(event)">

                        <button type="button" class="btn btn-outline btn-sm" onclick="UI.removeProfilePhoto()">
                            <i class="fas fa-trash"></i> Rimuovi
                        </button>
                    </div>

                    <small style="color: var(--grigio-500); display: block;">
                        <i class="fas fa-info-circle"></i> Formati: JPG, PNG, WebP (max 2MB)
                    </small>
                </div>
            </div>

            <div class="form-section" style="margin-top: 2rem;">
                <h3><i class="fas fa-user"></i> Informazioni Personali</h3>
                <div class="alert alert-warning" style="margin-bottom: 1rem;">
                    <i class="fas fa-info-circle"></i> Per modificare nome, cognome, email e ruolo, contatta un Super Amministratore.
                </div>

                <div class="form-group">
                    <label>Nome Completo</label>
                    <input type="text" class="form-control" value="${AuthService.getUserName()}" disabled>
                </div>

                <div class="form-group">
                    <label>Email</label>
                    <input type="email" class="form-control" value="${AuthService.currentUser?.email || ''}" disabled>
                </div>
            </div>
        `;

        FormsManager.showModal(
            '<i class="fas fa-user-cog"></i> Modifica Profilo',
            content,
            async () => {
                await this.saveProfileSettings();
            }
        );
    },

    previewProfilePhoto() {
        const photoURL = document.getElementById('photoURL').value.trim();
        const preview = document.getElementById('profilePhotoPreview');

        if (photoURL) {
            preview.innerHTML = `<img src="${photoURL}" style="width: 100%; height: 100%; object-fit: cover;" onerror="UI.onProfilePhotoError()">`;
        } else {
            preview.innerHTML = `<i class="fas fa-user"></i>`;
        }
    },

    onProfilePhotoError() {
        UI.showError('Impossibile caricare l\'immagine. Verifica che l\'URL sia corretto e punti a un\'immagine valida.');
        const preview = document.getElementById('profilePhotoPreview');
        preview.innerHTML = `<i class="fas fa-exclamation-triangle" style="color: var(--rosso-errore);"></i>`;
    },

    removeProfilePhoto() {
        document.getElementById('photoURL').value = '';
        document.getElementById('profilePhotoPreview').innerHTML = `<i class="fas fa-user"></i>`;
    },

    async handleProfilePhotoUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Validazione tipo file
        if (!file.type.startsWith('image/')) {
            UI.showError('Seleziona un file immagine valido (JPG, PNG, WebP)');
            return;
        }

        // Validazione dimensione (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            UI.showError('L\'immagine è troppo grande. Dimensione massima: 2MB');
            return;
        }

        try {
            // Converti in base64
            const reader = new FileReader();
            reader.onload = (e) => {
                const base64 = e.target.result;

                // Aggiorna preview
                const preview = document.getElementById('profilePhotoPreview');
                preview.innerHTML = `<img src="${base64}" style="width: 100%; height: 100%; object-fit: cover;">`;

                // Salva base64 nel campo nascosto
                document.getElementById('photoURL').value = base64;

                UI.showSuccess('Foto caricata! Clicca "Salva Modifiche" per confermare.');
            };

            reader.onerror = () => {
                UI.showError('Errore durante il caricamento del file');
            };

            reader.readAsDataURL(file);

        } catch (error) {
            console.error('Errore caricamento foto:', error);
            UI.showError('Errore durante il caricamento: ' + error.message);
        }
    },

    async saveProfileSettings() {
        try {
            UI.showLoading();

            const photoURL = document.getElementById('photoURL').value.trim();

            // Aggiorna documento utente in Firestore
            const userId = AuthService.currentUser.uid;
            await db.collection('utenti').doc(userId).update({
                photoURL: photoURL || null,
                dataAggiornamento: firebase.firestore.FieldValue.serverTimestamp()
            });

            UI.hideLoading();
            FormsManager.closeModal();
            UI.showSuccess('Profilo aggiornato con successo!');

            // Ricarica info utente per aggiornare avatar
            await this.setUserInfo(AuthService.getUserName(), AuthService.getUserRole());

        } catch (error) {
            console.error('Errore salvataggio profilo:', error);
            UI.hideLoading();
            UI.showError('Errore nel salvataggio del profilo: ' + error.message);
        }
    },

    // Inizializza menu mostrando solo pagine accessibili
    initializeMenuByPermissions() {
        const menuItems = document.querySelectorAll('.menu-item');
        menuItems.forEach(item => {
            const pageName = item.dataset.page;
            if (pageName && !AuthService.canAccessPage(pageName)) {
                item.style.display = 'none';
            } else {
                item.style.display = 'flex';
            }
        });
    },

    // === SIDEBAR BADGES ===
    // Aggiorna i badge numerici nella sidebar con i dati già caricati dalla dashboard
    updateSidebarBadges(data = {}) {
        // Badge Scadenzario: scadenze scadute (rosso)
        this._setSidebarBadge('badgeScadenzario', data.scadenzeScadute || 0);

        // Badge Fatture: fatture da incassare (rosso)
        this._setSidebarBadge('badgeFatture', data.fattureNonPagate || 0);

        // Badge Task: task aperti non completati (info blu)
        this._setSidebarBadge('badgeTask', data.taskAperti || 0, 'badge-info');
    },

    _setSidebarBadge(elementId, count, extraClass = '') {
        const badge = document.getElementById(elementId);
        if (!badge) return;

        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.className = 'sidebar-badge' + (extraClass ? ' ' + extraClass : '');
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    },

    // Carica i badge sidebar in modo autonomo (usato al login, non dipende dalla dashboard)
    async loadSidebarBadges() {
        try {
            const oggi = new Date();
            oggi.setHours(0, 0, 0, 0);

            // Carica dati in parallelo (query leggere, con limit basso)
            const [fattureNP, fattureP, tasksResult] = await Promise.all([
                DataService.getFatture({ statoPagamento: 'NON_PAGATA', limit: 200 }),
                DataService.getFatture({ statoPagamento: 'PARZIALMENTE_PAGATA', limit: 200 }),
                (typeof TaskService !== 'undefined' && AuthService.canAccessPage('task'))
                    ? TaskService.getAllTasks({ limit: 100 }).catch(() => ({ tasks: [] }))
                    : Promise.resolve({ tasks: [] })
            ]);

            const fattureNonPagate = [...fattureNP, ...fattureP].filter(f => f.tipoDocumento !== 'NOTA_DI_CREDITO').length;

            const taskAperti = (tasksResult.tasks || []).filter(t => (t.stato === 'TODO' || t.stato === 'IN_PROGRESS') && !t.archiviato).length;

            // Scadenze: usa getScadenzeCompute se disponibile
            let scadenzeScadute = 0;
            try {
                const scadenze = await DataService.getScadenzeCompute({});
                scadenzeScadute = (scadenze.tutteLeScadenze || []).filter(s =>
                    s.dataScadenza && new Date(s.dataScadenza) < oggi
                ).length;
            } catch (e) { /* ignora */ }

            this.updateSidebarBadges({ scadenzeScadute, fattureNonPagate, taskAperti });
        } catch (e) {
            console.warn('Sidebar badges: errore caricamento', e);
        }
    },

    // Mostra schermata accesso negato
    showAccessDenied(pageName) {
        const mainContent = document.getElementById('mainContent');
        mainContent.innerHTML = `
            <div class="empty-state" style="padding: 3rem;">
                <i class="fas fa-lock fa-3x" style="color: var(--rosso); opacity: 0.5;"></i>
                <h3 style="color: var(--rosso); margin-top: 1.5rem;">Accesso Negato</h3>
                <p style="color: var(--grigio-600); margin-top: 1rem;">
                    Non hai i permessi necessari per accedere a questa sezione.
                </p>
                <p style="color: var(--grigio-500); font-size: 0.9rem; margin-top: 0.5rem;">
                    Ruolo attuale: <strong>${AuthService.getUserRoleLabel()}</strong>
                </p>
                <button class="btn btn-primary" onclick="UI.showPage('dashboard')" style="margin-top: 2rem;">
                    <i class="fas fa-home"></i> Torna alla Dashboard
                </button>
            </div>
        `;
    },

    // Mostra modal con conferma/annulla
    showModal(options) {
        return new Promise((resolve) => {
            const {
                title,
                content,
                confirmText = 'Conferma',
                cancelText = 'Annulla',
                confirmClass = 'btn-primary',
                onConfirm = null  // Callback chiamata PRIMA di chiudere il modal
            } = options;

            // Rimuovi modal esistente
            const existingModal = document.getElementById('customModal');
            if (existingModal) existingModal.remove();

            const modal = document.createElement('div');
            modal.id = 'customModal';
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                padding: 1rem;
            `;

            modal.innerHTML = `
                <div class="modal-content" style="
                    background: white;
                    border-radius: 12px;
                    max-width: 600px;
                    width: 100%;
                    max-height: 90vh;
                    overflow-y: auto;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
                ">
                    <div class="modal-header" style="
                        padding: 1.5rem;
                        border-bottom: 2px solid var(--grigio-300);
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    ">
                        <h2 style="
                            font-size: 1.5rem;
                            font-weight: 700;
                            color: var(--blu-700);
                            margin: 0;
                        ">${title}</h2>
                        <button onclick="document.getElementById('customModal').remove()" style="
                            background: none;
                            border: none;
                            font-size: 1.5rem;
                            cursor: pointer;
                            color: var(--grigio-500);
                            padding: 0;
                            width: 32px;
                            height: 32px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                        ">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body" style="padding: 1.5rem;">
                        ${content}
                    </div>
                    <div class="modal-footer" style="
                        padding: 1.5rem;
                        border-top: 2px solid var(--grigio-300);
                        display: flex;
                        gap: 1rem;
                        justify-content: flex-end;
                    ">
                        <button id="modalCancelBtn" class="btn btn-secondary">
                            <i class="fas fa-times"></i> ${cancelText}
                        </button>
                        <button id="modalConfirmBtn" class="btn ${confirmClass}">
                            <i class="fas fa-check"></i> ${confirmText}
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Event listeners
            const confirmBtn = document.getElementById('modalConfirmBtn');
            const cancelBtn = document.getElementById('modalCancelBtn');

            confirmBtn.onclick = async () => {
                // Se c'è una callback onConfirm, chiamala PRIMA di chiudere
                if (onConfirm) {
                    const result = await onConfirm();
                    // Se onConfirm restituisce false, non chiudere il modal
                    if (result === false) return;
                }
                modal.remove();
                resolve(true);
            };

            cancelBtn.onclick = () => {
                modal.remove();
                resolve(false);
            };

            // Chiudi cliccando fuori
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.remove();
                    resolve(false);
                }
            });
        });
    }
};

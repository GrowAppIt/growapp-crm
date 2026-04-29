/**
 * Storico Push Module — Pagina CRM per gestione storico notifiche push
 *
 * Funzionalità:
 * - Visualizza lo storico notifiche di tutte le app (o filtrate)
 * - Avvia sincronizzazione manuale dall'API GoodBarber
 * - Configura il monitoraggio per ogni app (user_id fantasma)
 * - Statistiche per sorgente e per app
 */
const StoricoPush = {

    // Stato
    notifications: [],
    lastDoc: null,
    hasMore: true,
    loading: false,
    filters: {
        appSlug: '',
        source: '',
        limit: 30
    },
    apps: [],
    tutteLeApp: [],        // cache della lista completa (per il modal Configura)
    showAllApps: false,    // se true, nel modal Configura si vedono anche le app non-ATTIVE

    // ================================================================
    // Render principale
    // ================================================================

    async render() {
        try {
            UI.showLoading();

            // Carica lista app per filtri (tutte le app con pushMonitorEnabled O attive)
            const tutteLeApp = await DataService.getApps();
            this.tutteLeApp = tutteLeApp || [];
            this.apps = tutteLeApp.filter(a => a.pushMonitorEnabled || a.statoApp === 'ATTIVA');

            // Reset stato
            this.notifications = [];
            this.lastDoc = null;
            this.hasMore = true;
            this.filters = { appSlug: '', source: '', limit: 30 };

            UI.hideLoading();
            this.renderContent();
            await this.loadNotifications();

            // Carica alert monitoraggio (in parallelo, non blocca la pagina)
            this.loadMonitorAlerts();

        } catch (error) {
            console.error('[StoricoPush] Errore render:', error);
            UI.hideLoading();
            UI.showError('Errore nel caricamento della pagina');
        }
    },

    // ================================================================
    // Layout pagina
    // ================================================================

    renderContent() {
        const mainContent = document.getElementById('mainContent');

        // Opzioni filtro app — divise in configurate e non configurate
        const allApps = this.apps
            .filter(a => a.appSlug || a.comune || a.nome)
            .sort((a, b) => (a.comune || a.nome || '').localeCompare(b.comune || b.nome || '', 'it'));

        const configurate = allApps.filter(a => a.pushMonitorEnabled);
        const nonConfigurate = allApps.filter(a => !a.pushMonitorEnabled);

        let appOptions = '';

        if (configurate.length > 0) {
            appOptions += `<optgroup label="✅ Configurate (${configurate.length})">`;
            appOptions += configurate.map(a => {
                const slug = a.appSlug || (a.comune || a.nome || '').toLowerCase().replace(/\s+/g, '');
                const label = a.comune || a.nome || slug;
                return `<option value="${this.escapeHtml(slug)}">✅ ${this.escapeHtml(label)}</option>`;
            }).join('');
            appOptions += `</optgroup>`;
        }

        if (nonConfigurate.length > 0) {
            appOptions += `<optgroup label="⏳ Da configurare (${nonConfigurate.length})">`;
            appOptions += nonConfigurate.map(a => {
                const slug = a.appSlug || (a.comune || a.nome || '').toLowerCase().replace(/\s+/g, '');
                const label = a.comune || a.nome || slug;
                return `<option value="${this.escapeHtml(slug)}" disabled>⏳ ${this.escapeHtml(label)}</option>`;
            }).join('');
            appOptions += `</optgroup>`;
        }

        mainContent.innerHTML = `
            <div class="storico-push-page">
                <!-- Header con azioni -->
                <div class="sp-header">
                    <div class="sp-header-left">
                        <h2><i class="fas fa-history"></i> Storico Notifiche Push</h2>
                        <p class="sp-subtitle">Archivio centralizzato di tutte le notifiche inviate ai comuni</p>
                    </div>
                    <div class="sp-header-actions">
                        <button class="btn btn-outline" onclick="StoricoPush.openConfig()">
                            <i class="fas fa-cog"></i> Configura
                        </button>
                        <button class="btn btn-primary" onclick="StoricoPush.syncNow()">
                            <i class="fas fa-sync-alt"></i> Sincronizza Ora
                        </button>
                    </div>
                </div>

                <!-- Statistiche rapide -->
                <div class="sp-stats" id="sp-stats">
                    <div class="sp-stat-card">
                        <i class="fas fa-bell"></i>
                        <div class="sp-stat-value" id="sp-stat-total">—</div>
                        <div class="sp-stat-label">Totali</div>
                    </div>
                    <div class="sp-stat-card">
                        <i class="fas fa-newspaper"></i>
                        <div class="sp-stat-value" id="sp-stat-rss">—</div>
                        <div class="sp-stat-label">Notizie</div>
                    </div>
                    <div class="sp-stat-card">
                        <i class="fas fa-calendar-alt"></i>
                        <div class="sp-stat-value" id="sp-stat-events">—</div>
                        <div class="sp-stat-label">Agenda</div>
                    </div>
                    <div class="sp-stat-card">
                        <i class="fas fa-bullhorn"></i>
                        <div class="sp-stat-value" id="sp-stat-broadcast">—</div>
                        <div class="sp-stat-label">Avvisi</div>
                    </div>
                    <div class="sp-stat-card">
                        <i class="fas fa-mobile-alt"></i>
                        <div class="sp-stat-value" id="sp-stat-apps">—</div>
                        <div class="sp-stat-label">App Monitorate</div>
                    </div>
                </div>

                <!-- Alert Monitoraggio -->
                <div class="sp-monitor-alerts" id="sp-monitor-alerts" style="display:none;"></div>

                <!-- Filtri -->
                <div class="sp-filters">
                    <div class="sp-filter-group">
                        <label>Comune</label>
                        <select id="sp-filter-app" onchange="StoricoPush.applyFilters()">
                            <option value="">Tutti i comuni</option>
                            ${appOptions}
                        </select>
                    </div>
                    <div class="sp-filter-group">
                        <label>Tipo</label>
                        <select id="sp-filter-source" onchange="StoricoPush.applyFilters()">
                            <option value="">Tutti i tipi</option>
                            <option value="notizie">Notizie</option>
                            <option value="in_agenda">Agenda</option>
                            <option value="avvisi">Avvisi</option>
                        </select>
                    </div>
                    <button class="btn btn-sm btn-outline" onclick="StoricoPush.resetFilters()">
                        <i class="fas fa-times"></i> Reset
                    </button>
                </div>

                <!-- Lista notifiche -->
                <div class="sp-list" id="sp-list">
                    <div class="sp-loading">
                        <i class="fas fa-spinner fa-spin"></i> Caricamento...
                    </div>
                </div>

                <!-- Load More -->
                <div id="sp-load-more" style="display:none; text-align:center; padding:16px;">
                    <button class="btn btn-outline" onclick="StoricoPush.loadMore()">
                        <i class="fas fa-chevron-down"></i> Carica altre
                    </button>
                </div>
            </div>

            <style>
                .storico-push-page { max-width: 1000px; }

                .sp-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    flex-wrap: wrap;
                    gap: 12px;
                    margin-bottom: 20px;
                }
                .sp-header h2 {
                    font-size: 1.4rem;
                    color: var(--blu-700);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .sp-subtitle {
                    font-size: 0.85rem;
                    color: var(--grigio-500);
                    margin-top: 2px;
                }
                .sp-header-actions {
                    display: flex;
                    gap: 8px;
                }

                .sp-stats {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                    gap: 12px;
                    margin-bottom: 20px;
                }
                .sp-stat-card {
                    background: var(--bianco);
                    border-radius: 10px;
                    padding: 14px;
                    text-align: center;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
                }
                .sp-stat-card i {
                    font-size: 20px;
                    color: var(--blu-300);
                    margin-bottom: 4px;
                }
                .sp-stat-value {
                    font-size: 1.5rem;
                    font-weight: 900;
                    color: var(--blu-700);
                }
                .sp-stat-label {
                    font-size: 0.75rem;
                    color: var(--grigio-500);
                    font-weight: 600;
                    text-transform: uppercase;
                }

                .sp-filters {
                    display: flex;
                    gap: 12px;
                    align-items: flex-end;
                    flex-wrap: wrap;
                    margin-bottom: 16px;
                    background: var(--bianco);
                    padding: 12px 16px;
                    border-radius: 10px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
                }
                .sp-filter-group {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .sp-filter-group label {
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: var(--grigio-500);
                    text-transform: uppercase;
                }
                .sp-filter-group select {
                    padding: 6px 10px;
                    border: 1.5px solid var(--grigio-300);
                    border-radius: 6px;
                    font-family: 'Titillium Web', sans-serif;
                    font-size: 0.85rem;
                    min-width: 180px;
                }

                .sp-list { min-height: 200px; }

                .sp-loading {
                    text-align: center;
                    padding: 40px;
                    color: var(--grigio-500);
                    font-size: 0.9rem;
                }

                .sp-notif-row {
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    padding: 12px 16px;
                    background: var(--bianco);
                    border-radius: 8px;
                    margin-bottom: 6px;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.04);
                    border-left: 3px solid var(--grigio-300);
                    transition: background 0.15s;
                }
                .sp-notif-row:hover {
                    background: var(--grigio-100);
                }
                .sp-notif-row.src-rss_auto { border-left-color: var(--verde-700); }
                .sp-notif-row.src-calendar_auto { border-left-color: #F57F17; }
                .sp-notif-row.src-meteo_alert { border-left-color: var(--rosso-errore, #D32F2F); }
                .sp-notif-row.src-crm_broadcast,
                .sp-notif-row.src-crm_api,
                .sp-notif-row.src-manual { border-left-color: var(--blu-700); }

                .sp-notif-icon {
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                    flex-shrink: 0;
                    background: var(--grigio-100);
                    color: var(--grigio-500);
                }
                .sp-notif-icon.ic-rss_auto { background: var(--verde-100); color: var(--verde-700); }
                .sp-notif-icon.ic-manual { background: var(--blu-100); color: var(--blu-700); }
                .sp-notif-icon.ic-calendar_auto { background: #FFF8E1; color: #F57F17; }
                .sp-notif-icon.ic-meteo_alert { background: #FFEBEE; color: #D32F2F; }
                .sp-notif-icon.ic-crm_broadcast,
                .sp-notif-icon.ic-crm_api { background: var(--blu-100); color: var(--blu-700); }

                .sp-notif-content { flex: 1; min-width: 0; }
                .sp-notif-message {
                    font-size: 0.9rem;
                    color: var(--grigio-700);
                    line-height: 1.4;
                    word-wrap: break-word;
                }
                .sp-notif-meta {
                    display: flex;
                    gap: 12px;
                    margin-top: 4px;
                    font-size: 0.75rem;
                    color: var(--grigio-500);
                }
                .sp-notif-meta span {
                    display: flex;
                    align-items: center;
                    gap: 3px;
                }

                .sp-empty {
                    text-align: center;
                    padding: 60px 20px;
                    color: var(--grigio-500);
                }
                .sp-empty i {
                    font-size: 48px;
                    color: var(--grigio-300);
                    margin-bottom: 12px;
                }

                /* Alert Monitoraggio */
                .sp-monitor-alerts {
                    margin-bottom: 16px;
                }
                .sp-alert-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 10px;
                    padding: 10px 14px;
                    border-radius: 8px;
                }
                .sp-alert-title {
                    font-size: 0.85rem;
                    font-weight: 700;
                    color: inherit;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .sp-alert-toggle {
                    font-size: 0.75rem;
                    color: var(--grigio-500);
                    cursor: pointer;
                    border: none;
                    background: none;
                    font-family: 'Titillium Web', sans-serif;
                    font-weight: 600;
                    text-decoration: underline;
                }
                .sp-alert-card {
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    padding: 12px 16px;
                    border-radius: 10px;
                    margin-bottom: 6px;
                    font-size: 0.85rem;
                }
                .sp-alert-card.alert-error {
                    background: #FFEBEE;
                    border-left: 4px solid #D32F2F;
                }
                .sp-alert-card.alert-warn {
                    background: #FFF8E1;
                    border-left: 4px solid #FFCC00;
                }
                .sp-alert-card .alert-icon {
                    font-size: 18px;
                    flex-shrink: 0;
                    margin-top: 1px;
                }
                .sp-alert-card.alert-error .alert-icon { color: #D32F2F; }
                .sp-alert-card.alert-warn .alert-icon { color: #F57F17; }
                .sp-alert-card .alert-body { flex: 1; }
                .sp-alert-card .alert-app-name {
                    font-weight: 700;
                    color: var(--grigio-700);
                }
                .sp-alert-card .alert-message {
                    color: var(--grigio-700);
                    margin-top: 2px;
                    line-height: 1.4;
                }
                .sp-alert-card .alert-details {
                    display: flex;
                    gap: 12px;
                    margin-top: 4px;
                    font-size: 0.75rem;
                    color: var(--grigio-500);
                }
                .sp-alert-card .alert-details span {
                    display: flex;
                    align-items: center;
                    gap: 3px;
                }

                @media (max-width: 768px) {
                    .sp-header { flex-direction: column; }
                    .sp-stats { grid-template-columns: repeat(2, 1fr); }
                    .sp-filters { flex-direction: column; }
                    .sp-filter-group select { min-width: 100%; }
                }
            </style>
        `;
    },

    // ================================================================
    // Caricamento notifiche
    // ================================================================

    async loadNotifications(append = false) {
        if (this.loading) return;
        this.loading = true;

        if (!append) {
            this.notifications = [];
            this.lastDoc = null;
            this.hasMore = true;
        }

        try {
            let query = db.collection('push_history');

            if (this.filters.appSlug) {
                query = query.where('appSlug', '==', this.filters.appSlug);
            }
            if (this.filters.source) {
                if (this.filters.source === 'notizie') {
                    query = query.where('source', '==', 'rss_auto');
                } else if (this.filters.source === 'in_agenda') {
                    query = query.where('source', '==', 'calendar_auto');
                } else if (this.filters.source === 'avvisi') {
                    // 'manual' = notifiche non classificate → finiscono qui
                    // così NON si perdono mai e possono essere riviste.
                    query = query.where('source', 'in', ['meteo_alert', 'crm_broadcast', 'crm_api', 'manual']);
                }
            }

            query = query.orderBy('sentAt', 'desc').limit(this.filters.limit);

            if (this.lastDoc) {
                query = query.startAfter(this.lastDoc);
            }

            const snapshot = await query.get();
            const newItems = [];

            snapshot.forEach(doc => {
                newItems.push({ id: doc.id, ...doc.data(), _doc: doc });
                this.lastDoc = doc;
            });

            this.notifications = append ? [...this.notifications, ...newItems] : newItems;
            this.hasMore = newItems.length >= this.filters.limit;

            this.renderList();

            // Carica statistiche solo al primo caricamento
            if (!append) this.loadStats();

        } catch (error) {
            console.error('[StoricoPush] Errore caricamento:', error);
            document.getElementById('sp-list').innerHTML = `
                <div class="sp-empty">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Errore di caricamento</h3>
                    <p>${this.escapeHtml(error.message)}</p>
                    <p style="margin-top:8px;font-size:0.8rem;">Potrebbe essere necessario creare un indice composito su Firestore.<br>
                    Controlla la console del browser per il link diretto.</p>
                </div>
            `;
        }

        this.loading = false;
    },

    // ================================================================
    // Statistiche
    // ================================================================

    async loadStats() {
        try {
            // --- Conta app monitorate (count aggregato, 1 read invece di N) ---
            // Firebase 10+ compat supporta query.count().get() → AggregateQuerySnapshot.
            // Costo: 1 read per ogni 1000 doc conteggiati (vs N read se leggi tutto).
            let appsCount = 0;
            try {
                const appsAgg = await db.collection('app')
                    .where('pushMonitorEnabled', '==', true)
                    .count().get();
                appsCount = appsAgg.data().count;
            } catch (e) {
                // Fallback per SDK più vecchi o indici mancanti
                const appsSnap = await db.collection('app')
                    .where('pushMonitorEnabled', '==', true)
                    .get();
                appsCount = appsSnap.size;
            }
            document.getElementById('sp-stat-apps').textContent = appsCount;

            // --- Stats push_history: usiamo count() aggregato in parallelo ---
            // NB: 'manual' è incluso negli Avvisi (notifiche non classificate).
            const queries = {
                total: db.collection('push_history').where('status', '==', 'sent'),
                rss: db.collection('push_history').where('source', '==', 'rss_auto'),
                events: db.collection('push_history').where('source', '==', 'calendar_auto'),
                broadcast: db.collection('push_history').where('source', 'in', ['meteo_alert', 'crm_broadcast', 'crm_api', 'manual'])
            };

            // Helper: count con fallback a get() se count() non è supportato
            async function countOrFallback(query) {
                try {
                    const agg = await query.count().get();
                    return agg.data().count;
                } catch (e) {
                    const snap = await query.get();
                    return snap.size;
                }
            }

            const [totalCount, rssCount, eventsCount, broadcastCount] = await Promise.all([
                countOrFallback(queries.total),
                countOrFallback(queries.rss),
                countOrFallback(queries.events),
                countOrFallback(queries.broadcast)
            ]);

            document.getElementById('sp-stat-total').textContent = totalCount;
            document.getElementById('sp-stat-rss').textContent = rssCount;
            document.getElementById('sp-stat-events').textContent = eventsCount;
            document.getElementById('sp-stat-broadcast').textContent = broadcastCount;

        } catch (error) {
            console.warn('[StoricoPush] Errore stats:', error);
        }
    },

    // ================================================================
    // Rendering lista
    // ================================================================

    renderList() {
        const container = document.getElementById('sp-list');
        const loadMoreEl = document.getElementById('sp-load-more');

        // Safety net: nascondi notifiche con sentAt nel futuro.
        // Il sync nuovo non ne salva più, ma quelle vecchie restano nel DB.
        // Tolleranza 1h per piccoli sfasamenti orologio.
        const cutoffMs = Date.now() + (60 * 60 * 1000);
        const visibleNotifications = this.notifications.filter(n => {
            const sentAt = n.sentAt && n.sentAt.toDate ? n.sentAt.toDate() : new Date(n.sentAt || 0);
            return sentAt.getTime() <= cutoffMs;
        });
        const hiddenFutureCount = this.notifications.length - visibleNotifications.length;

        if (visibleNotifications.length === 0) {
            container.innerHTML = `
                <div class="sp-empty">
                    <i class="fas fa-bell-slash"></i>
                    <h3>Nessuna notifica trovata</h3>
                    <p>${hiddenFutureCount > 0
                        ? `${hiddenFutureCount} elemento/i nascosto/i perch&eacute; con data nel futuro (push schedulate o eventi calendar).`
                        : 'Prova a modificare i filtri o avvia una sincronizzazione.'}</p>
                </div>
            `;
            loadMoreEl.style.display = 'none';
            return;
        }

        const sourceIcons = {
            'rss_auto': 'fa-rss',
            'calendar_auto': 'fa-calendar-alt',
            'meteo_alert': 'fa-cloud-sun-rain',
            'crm_broadcast': 'fa-bullhorn',
            'crm_api': 'fa-code',
            'manual': 'fa-bell'
        };

        const sourceLabels = {
            'rss_auto': 'Notizia',
            'calendar_auto': 'Agenda',
            'meteo_alert': 'Allerta',
            'crm_broadcast': 'Avviso',
            'crm_api': 'Avviso',
            'manual': 'Avviso'
        };

        // Banner informativo se abbiamo nascosto delle date future
        const hiddenBanner = hiddenFutureCount > 0 ? `
            <div style="padding:8px 14px;margin-bottom:8px;background:#FFF8E1;border-left:3px solid #FFCC00;border-radius:6px;font-size:0.8rem;color:#4A4A4A;">
                <i class="fas fa-info-circle" style="color:#F57F17;"></i>
                ${hiddenFutureCount} elemento/i nascosto/i perch&eacute; con data nel futuro (push schedulate o eventi calendar non ancora inviati).
            </div>
        ` : '';

        container.innerHTML = hiddenBanner + visibleNotifications.map(n => {
            const source = n.source || 'manual';
            const icon = sourceIcons[source] || 'fa-bell';
            const label = sourceLabels[source] || 'Altro';
            const sentAt = n.sentAt?.toDate ? n.sentAt.toDate() : new Date(n.sentAt || 0);
            const dateStr = sentAt.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
            const timeStr = sentAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
            const comune = n.comune || n.appSlug || '';

            return `
                <div class="sp-notif-row src-${source}">
                    <div class="sp-notif-icon ic-${source}">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div class="sp-notif-content">
                        <div class="sp-notif-message">${this.escapeHtml(n.fullMessage || n.message || '')}</div>
                        <div class="sp-notif-meta">
                            <span><i class="fas fa-map-marker-alt"></i> ${this.escapeHtml(comune)}</span>
                            <span><i class="fas fa-tag"></i> ${label}</span>
                            <span><i class="fas fa-clock"></i> ${dateStr} ${timeStr}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        loadMoreEl.style.display = this.hasMore ? 'block' : 'none';
    },

    // ================================================================
    // Filtri
    // ================================================================

    applyFilters() {
        this.filters.appSlug = document.getElementById('sp-filter-app').value;
        this.filters.source = document.getElementById('sp-filter-source').value;
        this.loadNotifications(false);
    },

    resetFilters() {
        document.getElementById('sp-filter-app').value = '';
        document.getElementById('sp-filter-source').value = '';
        this.filters.appSlug = '';
        this.filters.source = '';
        this.loadNotifications(false);
    },

    loadMore() {
        this.loadNotifications(true);
    },

    // ================================================================
    // Sincronizzazione manuale
    // ================================================================

    /**
     * Costruisce gli header HTTP per l'auth verso /api/sync-push-history.
     * Usa l'ID token Firebase dell'utente loggato — il backend lo verifica
     * via admin.auth().verifyIdToken(). Niente token esposti nel client.
     */
    async _buildSyncAuthHeaders() {
        try {
            const fbAuth = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth() : null;
            const user = fbAuth ? fbAuth.currentUser : null;
            if (user) {
                const token = await user.getIdToken();
                if (token) return { 'Authorization': 'Bearer ' + token };
            }
        } catch (e) {
            console.warn('[StoricoPush] Impossibile ottenere ID token Firebase:', e.message);
        }
        // Senza token la richiesta procede comunque: il backend la rifiuterà
        // con 401 se SYNC_SECRET è configurato, e questo è il messaggio che
        // mostriamo all'utente.
        return {};
    },

    async syncNow() {
        const appSlug = this.filters.appSlug || '';

        // Auth header costruito una sola volta
        const authHeaders = await this._buildSyncAuthHeaders();

        // Se filtrato per una singola app, sync diretto senza chunk
        if (appSlug) {
            UI.showLoading(`Sincronizzazione ${appSlug}...`);
            try {
                const response = await fetch(`/api/sync-push-history?appSlug=${encodeURIComponent(appSlug)}`, {
                    headers: authHeaders
                });
                const data = await response.json();
                UI.hideLoading();
                if (data.success) {
                    UI.showSuccess(`Sync completato: ${data.totalNewNotifications} nuove notifiche`);
                    await this.loadNotifications(false);
                    this.loadMonitorAlerts();
                } else {
                    const hint = response.status === 401
                        ? ' (la sessione potrebbe essere scaduta — rifai login e riprova)'
                        : '';
                    UI.showError('Errore: ' + (data.error || 'Errore sconosciuto') + hint);
                }
            } catch (error) {
                UI.hideLoading();
                UI.showError('Errore di connessione: ' + error.message);
            }
            return;
        }

        // Sync tutte le app: processa a chunk per evitare timeout
        const CHUNK_SIZE = 30;
        let chunk = 0;
        let totalNew = 0;
        let totalApps = 0;
        let hasMore = true;

        UI.showLoading('Sincronizzazione tutte le app (chunk 1)...');

        try {
            while (hasMore) {
                UI.showLoading(`Sincronizzazione in corso... (blocco ${chunk + 1})`);

                const response = await fetch(`/api/sync-push-history?chunk=${chunk}&chunkSize=${CHUNK_SIZE}`, {
                    headers: authHeaders
                });
                const data = await response.json();

                if (!data.success) {
                    UI.hideLoading();
                    const hint = response.status === 401
                        ? ' — sessione scaduta? Esci, rifai login e riprova.'
                        : '';
                    UI.showError('Errore nel blocco ' + (chunk + 1) + ': ' + (data.error || 'Errore') + hint);
                    return;
                }

                totalNew += data.totalNewNotifications || 0;
                totalApps += data.totalApps || 0;
                hasMore = data.chunk ? data.chunk.hasMore : false;
                chunk++;
            }

            UI.hideLoading();
            UI.showSuccess(`Sync completato: ${totalNew} nuove notifiche da ${totalApps} app`);
            await this.loadNotifications(false);
            this.loadMonitorAlerts();
        } catch (error) {
            UI.hideLoading();
            UI.showError('Errore di connessione: ' + error.message);
        }
    },

    // ================================================================
    // Configurazione monitoraggio
    // ================================================================

    openConfig() {
        // Sorgente: se showAllApps=true mostra TUTTE le app del CRM,
        // altrimenti solo ATTIVE + già monitorate (comportamento default)
        const sourceList = this.showAllApps
            ? (this.tutteLeApp || [])
            : (this.apps || []);

        // Ordina alfabeticamente per nome comune
        const sortedApps = [...sourceList].sort((a, b) => {
            const na = (a.comune || a.nome || '').toLowerCase();
            const nb = (b.comune || b.nome || '').toLowerCase();
            return na.localeCompare(nb, 'it');
        });

        // Divide in due gruppi: monitorate attive vs disponibili da aggiungere
        const monitorate = sortedApps.filter(a => a.pushMonitorEnabled);
        const disponibili = sortedApps.filter(a => !a.pushMonitorEnabled);

        const countMonitorate = monitorate.length;
        const countDisponibili = disponibili.length;

        // Conta app nascoste perché non ATTIVE (per mostrare indicatore)
        const totaleCrm = (this.tutteLeApp || []).length;
        const totaleVisibiliDefault = (this.apps || []).length;
        const totaliNonAttive = Math.max(0, totaleCrm - totaleVisibiliDefault);

        // Costruisce una riga di tabella per un'app, con toggle-switch che salva subito
        const buildRow = (a) => {
            const userId = a.monitorPushUserId || '';
            const currentSlug = a.appSlug || '';
            const enabled = !!a.pushMonitorEnabled;
            // Suggerimento slug: dal nome comune, minuscolo, senza accenti/spazi/speciali
            const suggestedSlug = (a.comune || a.nome || '').toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]/g, '');
            const nomeApp = a.comune || a.nome || '';
            const badge = enabled
                ? '<span class="sp-cfg-badge sp-cfg-badge-on"><i class="fas fa-check-circle"></i> Monitorata</span>'
                : '<span class="sp-cfg-badge sp-cfg-badge-off"><i class="far fa-circle"></i> Non monitorata</span>';

            return `
                <tr class="sp-cfg-row" data-app-id="${a.id}" data-search="${this.escapeHtml(nomeApp.toLowerCase())}">
                    <td style="padding:10px 6px;vertical-align:middle;">
                        <div style="font-weight:700;color:#145284;">${this.escapeHtml(nomeApp)}</div>
                        <div style="margin-top:3px;">${badge}</div>
                    </td>
                    <td style="padding:10px 6px;vertical-align:middle;">
                        <input type="text" class="sp-config-slug"
                               data-app-id="${a.id}"
                               value="${this.escapeHtml(currentSlug)}"
                               placeholder="${this.escapeHtml(suggestedSlug)}"
                               style="width:150px;padding:5px 8px;border:1px solid #ddd;border-radius:4px;font-size:0.85rem;font-family:monospace;">
                    </td>
                    <td style="padding:10px 6px;vertical-align:middle;"><code style="font-size:0.8rem;color:#9B9B9B;">${a.goodbarberWebzineId || '—'}</code></td>
                    <td style="padding:10px 6px;vertical-align:middle;">
                        <input type="number" class="sp-config-userid"
                               data-app-id="${a.id}"
                               value="${userId}"
                               placeholder="User ID fantasma"
                               style="width:120px;padding:5px 8px;border:1px solid #ddd;border-radius:4px;font-size:0.85rem;">
                    </td>
                    <td style="padding:10px 6px;text-align:center;vertical-align:middle;">
                        <label class="sp-switch" title="${enabled ? 'Disattiva monitoraggio' : 'Attiva monitoraggio'}">
                            <input type="checkbox" class="sp-config-enabled"
                                   data-app-id="${a.id}" ${enabled ? 'checked' : ''}
                                   onchange="StoricoPush.toggleMonitor('${a.id}', this.checked, this)">
                            <span class="sp-switch-slider"></span>
                        </label>
                    </td>
                </tr>
            `;
        };

        const headerRow = `
            <thead>
                <tr style="border-bottom:2px solid #d9d9d9;text-align:left;background:#F5F5F5;">
                    <th style="padding:10px 6px;">Comune</th>
                    <th style="padding:10px 6px;">App Slug</th>
                    <th style="padding:10px 6px;">Webzine ID</th>
                    <th style="padding:10px 6px;">Monitor User ID</th>
                    <th style="padding:10px 6px;text-align:center;width:90px;">Monitor</th>
                </tr>
            </thead>
        `;

        const rowsMonitorate = monitorate.length > 0
            ? monitorate.map(buildRow).join('')
            : `<tr><td colspan="5" style="padding:20px;text-align:center;color:#9B9B9B;font-style:italic;">Nessuna app in monitoraggio. Attiva il toggle di una app qui sotto per iniziare.</td></tr>`;

        const rowsDisponibili = disponibili.length > 0
            ? disponibili.map(buildRow).join('')
            : `<tr><td colspan="5" style="padding:20px;text-align:center;color:#9B9B9B;font-style:italic;">Tutte le app attive sono già in monitoraggio.</td></tr>`;

        const modalHtml = `
            <div id="sp-config-modal" onclick="StoricoPush.closeConfig(event)" style="
                position:fixed;top:0;left:0;right:0;bottom:0;
                background:rgba(0,0,0,0.5);
                display:flex;align-items:center;justify-content:center;
                z-index:9999;padding:1rem;">
                <div onclick="event.stopPropagation()" style="
                    background:white;border-radius:12px;
                    max-width:1000px;width:100%;max-height:90vh;
                    overflow:hidden;display:flex;flex-direction:column;
                    box-shadow:0 20px 60px rgba(0,0,0,0.3);">

                    <!-- Header -->
                    <div style="padding:1rem 1.5rem;border-bottom:1px solid #d9d9d9;display:flex;align-items:center;justify-content:space-between;">
                        <div>
                            <h3 style="margin:0;font-size:1.1rem;color:#145284;font-weight:700;"><i class="fas fa-cog"></i> Configurazione Monitoraggio Push</h3>
                            <p style="margin:4px 0 0 0;font-size:0.78rem;color:#9B9B9B;">Il toggle <strong>Monitor</strong> salva subito. Slug e User ID si salvano con il bottone <strong>Salva</strong>.</p>
                        </div>
                        <button onclick="StoricoPush.closeConfig()" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:#9B9B9B;padding:4px 8px;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <!-- Ricerca + controlli -->
                    <div style="padding:10px 1.5rem;border-bottom:1px solid #F5F5F5;background:#FAFAFA;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;">
                        <div style="position:relative;flex:1;min-width:220px;max-width:360px;">
                            <i class="fas fa-search" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#9B9B9B;font-size:0.85rem;"></i>
                            <input id="sp-cfg-search" type="text" placeholder="Cerca comune..."
                                   oninput="StoricoPush.filterConfigList(this.value)"
                                   style="width:100%;padding:7px 10px 7px 32px;border:1px solid #D9D9D9;border-radius:6px;font-family:'Titillium Web',sans-serif;font-size:0.9rem;">
                        </div>
                        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
                            <label style="display:flex;align-items:center;gap:8px;font-size:0.82rem;color:#4A4A4A;cursor:pointer;">
                                <span>Mostra tutte le app${totaliNonAttive > 0 ? ` <span style="color:#9B9B9B;">(${totaliNonAttive} non ATTIVE)</span>` : ''}</span>
                                <span class="sp-switch" style="width:40px;height:22px;" title="Include anche le app non-ATTIVE del CRM">
                                    <input type="checkbox" id="sp-cfg-show-all"
                                           ${this.showAllApps ? 'checked' : ''}
                                           onchange="StoricoPush.toggleShowAllApps(this.checked)">
                                    <span class="sp-switch-slider"></span>
                                </span>
                            </label>
                            <button class="btn btn-primary" style="padding:6px 12px;font-size:0.82rem;"
                                    onclick="StoricoPush.openAddAppForm()">
                                <i class="fas fa-plus"></i> Aggiungi app
                            </button>
                        </div>
                    </div>

                    <!-- Form inline "Nuova app" (nascosto di default) -->
                    <div id="sp-cfg-new-app-form" style="display:none;padding:14px 1.5rem;border-bottom:1px solid #D1E2F2;background:#F0F7FC;">
                        <h4 style="margin:0 0 10px 0;font-size:0.9rem;color:#145284;font-weight:700;">
                            <i class="fas fa-plus-circle"></i> Nuova app nel CRM
                        </h4>
                        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:10px;">
                            <div>
                                <label style="display:block;font-size:0.72rem;font-weight:700;color:#9B9B9B;text-transform:uppercase;margin-bottom:3px;">Comune *</label>
                                <input id="sp-new-comune" type="text" placeholder="Es. Mezzolombardo"
                                       oninput="StoricoPush._onNewAppComuneInput(this.value)"
                                       style="width:100%;padding:7px 10px;border:1px solid #D9D9D9;border-radius:5px;font-family:'Titillium Web',sans-serif;font-size:0.9rem;">
                            </div>
                            <div>
                                <label style="display:block;font-size:0.72rem;font-weight:700;color:#9B9B9B;text-transform:uppercase;margin-bottom:3px;">App Slug *</label>
                                <input id="sp-new-slug" type="text" placeholder="es. mezzolombardo"
                                       style="width:100%;padding:7px 10px;border:1px solid #D9D9D9;border-radius:5px;font-family:monospace;font-size:0.85rem;">
                            </div>
                            <div>
                                <label style="display:block;font-size:0.72rem;font-weight:700;color:#9B9B9B;text-transform:uppercase;margin-bottom:3px;">Monitor User ID</label>
                                <input id="sp-new-userid" type="number" placeholder="ID utente fantasma"
                                       style="width:100%;padding:7px 10px;border:1px solid #D9D9D9;border-radius:5px;font-family:'Titillium Web',sans-serif;font-size:0.9rem;">
                            </div>
                            <div>
                                <label style="display:block;font-size:0.72rem;font-weight:700;color:#9B9B9B;text-transform:uppercase;margin-bottom:3px;">Stato app</label>
                                <select id="sp-new-stato"
                                        style="width:100%;padding:7px 10px;border:1px solid #D9D9D9;border-radius:5px;font-family:'Titillium Web',sans-serif;font-size:0.9rem;background:white;">
                                    <option value="ATTIVA" selected>ATTIVA</option>
                                    <option value="IN_SVILUPPO">IN SVILUPPO</option>
                                    <option value="IN_PROVA">IN PROVA</option>
                                </select>
                            </div>
                        </div>
                        <p style="margin:4px 0 10px 0;font-size:0.75rem;color:#9B9B9B;">
                            <i class="fas fa-info-circle"></i>
                            Crea una nuova app nella collezione <code>app</code> del CRM con monitoraggio push già attivo.
                            Per configurare tutti gli altri dati (contratti, contatti, ecc.) usa la pagina <strong>Gestione App</strong>.
                        </p>
                        <div style="display:flex;gap:8px;justify-content:flex-end;">
                            <button class="btn btn-outline" style="padding:6px 12px;font-size:0.82rem;"
                                    onclick="StoricoPush.closeAddAppForm()">Annulla</button>
                            <button class="btn btn-primary" style="padding:6px 12px;font-size:0.82rem;"
                                    onclick="StoricoPush.submitNewApp()">
                                <i class="fas fa-save"></i> Crea app
                            </button>
                        </div>
                    </div>

                    <!-- Body scrollabile -->
                    <div style="padding:1rem 1.5rem;overflow-y:auto;flex:1;">

                        <!-- Sezione: Monitorate -->
                        <div class="sp-cfg-section" data-section="monitorate">
                            <h4 style="margin:0 0 8px 0;font-size:0.95rem;color:#3CA434;font-weight:700;display:flex;align-items:center;gap:6px;">
                                <i class="fas fa-satellite-dish"></i>
                                <span>Monitorate</span>
                                <span id="sp-cfg-count-monitorate" style="background:#E2F8DE;color:#3CA434;padding:2px 8px;border-radius:10px;font-size:0.75rem;">${countMonitorate}</span>
                            </h4>
                            <table style="width:100%;border-collapse:collapse;font-size:0.85rem;margin-bottom:18px;">
                                ${headerRow}
                                <tbody id="sp-cfg-tbody-monitorate">
                                    ${rowsMonitorate}
                                </tbody>
                            </table>
                        </div>

                        <!-- Sezione: Disponibili -->
                        <div class="sp-cfg-section" data-section="disponibili">
                            <h4 style="margin:0 0 8px 0;font-size:0.95rem;color:#145284;font-weight:700;display:flex;align-items:center;gap:6px;">
                                <i class="fas fa-plus-circle"></i>
                                <span>Disponibili da aggiungere</span>
                                <span id="sp-cfg-count-disponibili" style="background:#D1E2F2;color:#145284;padding:2px 8px;border-radius:10px;font-size:0.75rem;">${countDisponibili}</span>
                            </h4>
                            <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                                ${headerRow}
                                <tbody id="sp-cfg-tbody-disponibili">
                                    ${rowsDisponibili}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div style="display:flex;gap:8px;justify-content:space-between;align-items:center;padding:12px 1.5rem;border-top:1px solid #d9d9d9;background:white;">
                        <span id="sp-cfg-hint" style="font-size:0.78rem;color:#9B9B9B;">
                            <i class="fas fa-info-circle"></i> Tip: attiva il toggle per iniziare subito a monitorare un comune.
                        </span>
                        <div style="display:flex;gap:8px;">
                            <button class="btn btn-outline" onclick="StoricoPush.closeConfig()">Chiudi</button>
                            <button class="btn btn-primary" onclick="StoricoPush.saveConfig()">
                                <i class="fas fa-save"></i> Salva Slug e User ID
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                /* Toggle switch */
                .sp-switch {
                    position: relative;
                    display: inline-block;
                    width: 46px;
                    height: 24px;
                    cursor: pointer;
                }
                .sp-switch input {
                    opacity: 0;
                    width: 0;
                    height: 0;
                }
                .sp-switch-slider {
                    position: absolute;
                    inset: 0;
                    background-color: #D9D9D9;
                    border-radius: 24px;
                    transition: background-color .2s;
                }
                .sp-switch-slider::before {
                    content: "";
                    position: absolute;
                    height: 18px;
                    width: 18px;
                    left: 3px;
                    top: 3px;
                    background-color: #FFFFFF;
                    border-radius: 50%;
                    transition: transform .2s;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                }
                .sp-switch input:checked + .sp-switch-slider {
                    background-color: #3CA434;
                }
                .sp-switch input:checked + .sp-switch-slider::before {
                    transform: translateX(22px);
                }
                .sp-switch input:disabled + .sp-switch-slider {
                    opacity: 0.6;
                    cursor: wait;
                }

                /* Badge di stato */
                .sp-cfg-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 0.72rem;
                    font-weight: 700;
                    padding: 2px 8px;
                    border-radius: 10px;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                }
                .sp-cfg-badge-on {
                    background: #E2F8DE;
                    color: #3CA434;
                }
                .sp-cfg-badge-off {
                    background: #F5F5F5;
                    color: #9B9B9B;
                }

                /* Riga nascosta dalla ricerca */
                .sp-cfg-row.sp-cfg-hidden {
                    display: none;
                }

                /* Responsive */
                @media (max-width: 768px) {
                    #sp-config-modal > div > div table { font-size: 0.78rem; }
                    #sp-config-modal .sp-config-slug,
                    #sp-config-modal .sp-config-userid { width: 100% !important; min-width: 90px; }
                }
            </style>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    closeConfig(event) {
        if (event && event.target !== event.currentTarget) return;
        const modal = document.getElementById('sp-config-modal');
        if (modal) modal.remove();
    },

    async saveConfig() {
        try {
            UI.showLoading('Salvataggio configurazione...');

            const userIdInputs = document.querySelectorAll('.sp-config-userid');
            const enabledInputs = document.querySelectorAll('.sp-config-enabled');

            const batch = db.batch();

            userIdInputs.forEach(input => {
                const appId = input.dataset.appId;
                const userId = parseInt(input.value) || 0;
                const enabledInput = document.querySelector(`.sp-config-enabled[data-app-id="${appId}"]`);
                const enabled = enabledInput ? enabledInput.checked : false;
                const slugInput = document.querySelector(`.sp-config-slug[data-app-id="${appId}"]`);
                const slugValue = slugInput ? slugInput.value.trim().toLowerCase().replace(/[^a-z0-9]/g, '') : '';

                const updateData = {
                    monitorPushUserId: userId,
                    pushMonitorEnabled: enabled
                };

                // Salva appSlug se compilato (o usa il placeholder come fallback)
                if (slugValue) {
                    updateData.appSlug = slugValue;
                } else if (enabled && slugInput && slugInput.placeholder) {
                    // Se attivo ma slug vuoto, usa il suggerimento dal placeholder
                    updateData.appSlug = slugInput.placeholder;
                    console.log(`[Config] Usato slug suggerito "${updateData.appSlug}" per app ${appId}`);
                }

                const docRef = db.collection('app').doc(appId);
                batch.update(docRef, updateData);
            });

            await batch.commit();

            UI.hideLoading();
            UI.showSuccess('Configurazione salvata!');
            this.closeConfig();

            // Aggiorna la lista app locale (ATTIVA + già monitorate anche se non attive)
            const tutteLeApp = await DataService.getApps();
            this.apps = tutteLeApp.filter(a => a.pushMonitorEnabled || a.statoApp === 'ATTIVA');

        } catch (error) {
            UI.hideLoading();
            UI.showError('Errore nel salvataggio: ' + error.message);
        }
    },

    // ================================================================
    // Toggle immediato on/off monitoraggio (salva subito su Firestore)
    // ================================================================

    async toggleMonitor(appId, enabled, checkboxEl) {
        if (!appId) return;

        // Trova l'app in memoria
        const app = this.apps.find(a => a.id === appId);
        const appName = app ? (app.comune || app.nome || appId) : appId;

        // Se sto disattivando, chiedi conferma
        if (!enabled) {
            const ok = confirm(
                `Vuoi disattivare il monitoraggio push per "${appName}"?\n\n` +
                `Le notifiche già salvate nello storico resteranno, ` +
                `ma non verranno più sincronizzate nuove notifiche per questa app.`
            );
            if (!ok) {
                // L'utente ha annullato: ripristina lo stato del checkbox
                if (checkboxEl) checkboxEl.checked = true;
                return;
            }
        }

        // Se sto attivando ma manca lo slug, blocca e avvisa
        if (enabled && app && !app.appSlug) {
            // Suggerimento slug
            const suggested = (app.comune || app.nome || '').toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]/g, '');
            const inputSlug = document.querySelector(`.sp-config-slug[data-app-id="${appId}"]`);
            const currentSlug = inputSlug ? inputSlug.value.trim() : '';

            if (!currentSlug) {
                alert(
                    `Per attivare il monitoraggio di "${appName}" serve prima l'App Slug.\n\n` +
                    `Compila il campo "App Slug" (${suggested ? 'es. ' + suggested : 'es. nome app in minuscolo senza spazi'}) ` +
                    `e clicca "Salva Slug e User ID", poi riprova ad attivare il toggle.`
                );
                if (checkboxEl) checkboxEl.checked = false;
                // Focus sul campo slug
                if (inputSlug) {
                    inputSlug.focus();
                    inputSlug.style.borderColor = '#D32F2F';
                    setTimeout(() => { inputSlug.style.borderColor = '#ddd'; }, 2500);
                }
                return;
            }
        }

        // Disabilita il checkbox durante il salvataggio
        if (checkboxEl) checkboxEl.disabled = true;

        try {
            await db.collection('app').doc(appId).update({
                pushMonitorEnabled: enabled
            });

            // Aggiorna lo stato in memoria
            if (app) app.pushMonitorEnabled = enabled;

            // Sposta la riga nella sezione corretta e aggiorna badge
            this._moveConfigRow(appId, enabled);
            this._updateConfigCounts();

            // Feedback visivo
            if (typeof UI !== 'undefined' && UI.showSuccess) {
                UI.showSuccess(enabled
                    ? `Monitoraggio attivato per ${appName}`
                    : `Monitoraggio disattivato per ${appName}`);
            }

        } catch (error) {
            console.error('[StoricoPush] Errore toggle monitor:', error);
            if (typeof UI !== 'undefined' && UI.showError) {
                UI.showError('Errore nel salvataggio: ' + error.message);
            }
            // Ripristina lo stato del checkbox
            if (checkboxEl) checkboxEl.checked = !enabled;
        } finally {
            if (checkboxEl) checkboxEl.disabled = false;
        }
    },

    // Sposta una riga del modal dalla sezione "monitorate" a "disponibili" e viceversa
    _moveConfigRow(appId, enabled) {
        const row = document.querySelector(`.sp-cfg-row[data-app-id="${appId}"]`);
        if (!row) return;

        // Aggiorna il badge dentro la riga
        const badgeCell = row.querySelector('td:first-child > div:last-child');
        if (badgeCell) {
            badgeCell.innerHTML = enabled
                ? '<span class="sp-cfg-badge sp-cfg-badge-on"><i class="fas fa-check-circle"></i> Monitorata</span>'
                : '<span class="sp-cfg-badge sp-cfg-badge-off"><i class="far fa-circle"></i> Non monitorata</span>';
        }

        // Sposta la riga
        const targetTbody = enabled
            ? document.getElementById('sp-cfg-tbody-monitorate')
            : document.getElementById('sp-cfg-tbody-disponibili');

        if (targetTbody) {
            // Rimuovi eventuale riga "empty state" del tbody di destinazione
            const empty = targetTbody.querySelector('td[colspan]');
            if (empty) targetTbody.innerHTML = '';
            targetTbody.appendChild(row);
        }
    },

    // Aggiorna i contatori nei titoli delle sezioni e gestisce gli empty state
    _updateConfigCounts() {
        const tbodyMon = document.getElementById('sp-cfg-tbody-monitorate');
        const tbodyDis = document.getElementById('sp-cfg-tbody-disponibili');
        const countMon = document.getElementById('sp-cfg-count-monitorate');
        const countDis = document.getElementById('sp-cfg-count-disponibili');

        const nMon = tbodyMon ? tbodyMon.querySelectorAll('tr.sp-cfg-row').length : 0;
        const nDis = tbodyDis ? tbodyDis.querySelectorAll('tr.sp-cfg-row').length : 0;

        if (countMon) countMon.textContent = nMon;
        if (countDis) countDis.textContent = nDis;

        // Se un tbody è vuoto, rimetti l'empty state
        if (tbodyMon && nMon === 0 && !tbodyMon.querySelector('td[colspan]')) {
            tbodyMon.innerHTML = `<tr><td colspan="5" style="padding:20px;text-align:center;color:#9B9B9B;font-style:italic;">Nessuna app in monitoraggio. Attiva il toggle di una app qui sotto per iniziare.</td></tr>`;
        }
        if (tbodyDis && nDis === 0 && !tbodyDis.querySelector('td[colspan]')) {
            tbodyDis.innerHTML = `<tr><td colspan="5" style="padding:20px;text-align:center;color:#9B9B9B;font-style:italic;">Tutte le app attive sono già in monitoraggio.</td></tr>`;
        }
    },

    // ================================================================
    // Ricerca nella lista di configurazione
    // ================================================================

    filterConfigList(term) {
        const q = (term || '').trim().toLowerCase();
        const rows = document.querySelectorAll('#sp-config-modal tr.sp-cfg-row');
        rows.forEach(r => {
            const searchable = r.getAttribute('data-search') || '';
            if (!q || searchable.indexOf(q) !== -1) {
                r.classList.remove('sp-cfg-hidden');
            } else {
                r.classList.add('sp-cfg-hidden');
            }
        });
    },

    // ================================================================
    // Toggle "Mostra tutte le app" — include anche app non-ATTIVE
    // ================================================================

    toggleShowAllApps(enabled) {
        this.showAllApps = !!enabled;
        // Riapri il modal con la nuova sorgente dati
        const modal = document.getElementById('sp-config-modal');
        if (modal) modal.remove();
        this.openConfig();
    },

    // ================================================================
    // Form "Aggiungi app" — apertura / chiusura / submit
    // ================================================================

    openAddAppForm() {
        const form = document.getElementById('sp-cfg-new-app-form');
        if (!form) return;
        form.style.display = 'block';
        // Reset campi
        document.getElementById('sp-new-comune').value = '';
        document.getElementById('sp-new-slug').value = '';
        document.getElementById('sp-new-userid').value = '';
        document.getElementById('sp-new-stato').value = 'ATTIVA';
        // Focus su nome comune
        setTimeout(() => {
            const el = document.getElementById('sp-new-comune');
            if (el) el.focus();
            form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
    },

    closeAddAppForm() {
        const form = document.getElementById('sp-cfg-new-app-form');
        if (form) form.style.display = 'none';
    },

    // Mentre l'utente digita il nome comune, propone uno slug nel campo slug (se vuoto)
    _onNewAppComuneInput(value) {
        const slugInput = document.getElementById('sp-new-slug');
        if (!slugInput) return;
        // Se l'utente ha già scritto manualmente uno slug, non sovrascrivere
        if (slugInput.dataset.edited === '1') return;

        const suggested = (value || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '');
        slugInput.value = suggested;

        // Se utente edita a mano dopo, segna come "edited" e smetto di auto-riempire
        slugInput.addEventListener('input', function markEdited() {
            slugInput.dataset.edited = '1';
            slugInput.removeEventListener('input', markEdited);
        });
    },

    async submitNewApp() {
        const comune = (document.getElementById('sp-new-comune').value || '').trim();
        const slugRaw = (document.getElementById('sp-new-slug').value || '').trim();
        const userIdRaw = (document.getElementById('sp-new-userid').value || '').trim();
        const statoApp = (document.getElementById('sp-new-stato').value || 'ATTIVA').trim();

        // Validazione minima
        if (!comune) {
            alert('Il campo "Comune" è obbligatorio.');
            document.getElementById('sp-new-comune').focus();
            return;
        }
        if (!slugRaw) {
            alert('Il campo "App Slug" è obbligatorio (nome dell\'app su GoodBarber, minuscolo senza spazi).');
            document.getElementById('sp-new-slug').focus();
            return;
        }

        // Normalizza lo slug (minuscolo, solo a-z0-9)
        const appSlug = slugRaw.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!appSlug) {
            alert('L\'App Slug deve contenere almeno una lettera o cifra.');
            document.getElementById('sp-new-slug').focus();
            return;
        }

        // Evita duplicati sullo slug
        const duplicato = (this.tutteLeApp || []).find(a => (a.appSlug || '').toLowerCase() === appSlug);
        if (duplicato) {
            const nomeDup = duplicato.comune || duplicato.nome || appSlug;
            alert(`Esiste già un'app nel CRM con slug "${appSlug}" (${nomeDup}).\n\nUsa il toggle sulla riga esistente invece di crearne una nuova.`);
            return;
        }

        const monitorPushUserId = userIdRaw ? (parseInt(userIdRaw, 10) || 0) : 0;

        // Conferma
        const conferma = confirm(
            `Creare una nuova app nel CRM?\n\n` +
            `Comune: ${comune}\n` +
            `App Slug: ${appSlug}\n` +
            `Monitor User ID: ${monitorPushUserId || '(non impostato)'}\n` +
            `Stato: ${statoApp}\n` +
            `Monitoraggio push: ATTIVO`
        );
        if (!conferma) return;

        try {
            UI.showLoading('Creazione app in corso...');

            const nuovoDoc = {
                comune: comune,
                nome: comune,
                appSlug: appSlug,
                statoApp: statoApp,
                pushMonitorEnabled: true,
                monitorPushUserId: monitorPushUserId
            };

            const newId = await DataService.createApp(nuovoDoc);

            // Aggiorna le cache locali
            const nuovaApp = { id: newId, ...nuovoDoc };
            this.tutteLeApp = [...(this.tutteLeApp || []), nuovaApp];
            this.apps = [...(this.apps || []), nuovaApp];

            UI.hideLoading();
            UI.showSuccess(`App "${comune}" creata e aggiunta al monitoraggio!`);

            // Rigenera il modal con la nuova app
            const modal = document.getElementById('sp-config-modal');
            if (modal) modal.remove();
            this.openConfig();

        } catch (error) {
            UI.hideLoading();
            console.error('[StoricoPush] Errore creazione app:', error);
            UI.showError('Errore nella creazione dell\'app: ' + error.message);
        }
    },

    // ================================================================
    // Alert Monitoraggio
    // ================================================================

    async loadMonitorAlerts() {
        const container = document.getElementById('sp-monitor-alerts');
        if (!container) return;

        try {
            // Soglie (in giorni)
            const WARN_DAYS = 3;
            const ERROR_DAYS = 7;
            const now = new Date();

            const alerts = [];

            // Solo app con monitoraggio abilitato: controlla ultima notifica
            const monitorate = this.apps.filter(a => !!a.pushMonitorEnabled && a.appSlug);

            if (monitorate.length === 0) {
                container.style.display = 'none';
                return;
            }

            // Normalizza lo slug dell'app a lowercase per allinearsi ai doc push_history
            // (che salviamo sempre lowercase dal sync)
            for (const app of monitorate) {
                const slug = (app.appSlug || '').toLowerCase().trim();
                if (!slug) continue;

                // NUOVO: surface degli errori/warning di sync salvati sul doc app
                // (impostati da api/sync-push-history.js dopo ogni run).
                // Questo fa vedere a colpo d'occhio quali app stanno dando problemi
                // di sincronizzazione anche senza dover aprire la console.
                if (app.lastPushSyncStatus === 'error' && app.lastPushSyncError) {
                    alerts.push({
                        type: 'error',
                        appName: app.comune || app.appSlug,
                        message: 'Errore sincronizzazione: ' + app.lastPushSyncError,
                        details: { lastSync: app.lastPushSync?.toDate ? app.lastPushSync.toDate() : null }
                    });
                } else if (app.lastPushSyncStatus === 'warning' && app.lastPushSyncWarning) {
                    alerts.push({
                        type: 'warn',
                        appName: app.comune || app.appSlug,
                        message: 'Avviso sync: ' + app.lastPushSyncWarning,
                        details: { lastSync: app.lastPushSync?.toDate ? app.lastPushSync.toDate() : null }
                    });
                }

                let lastNotifDate = null;
                let totalNotifs = 0;
                let queryOk = false;

                try {
                    // Prima prova con orderBy (richiede indice composito appSlug+status+sentAt desc)
                    const lastSnap = await db.collection('push_history')
                        .where('appSlug', '==', slug)
                        .where('status', '==', 'sent')
                        .orderBy('sentAt', 'desc')
                        .limit(1)
                        .get();

                    queryOk = true;
                    if (!lastSnap.empty) {
                        const data = lastSnap.docs[0].data();
                        lastNotifDate = data.sentAt?.toDate ? data.sentAt.toDate() : null;
                    }

                    // Count aggregato: costa 1 read invece di N (Firebase 10+)
                    try {
                        const countAgg = await db.collection('push_history')
                            .where('appSlug', '==', slug)
                            .where('status', '==', 'sent')
                            .count().get();
                        totalNotifs = countAgg.data().count;
                    } catch (eCount) {
                        // Fallback: conta leggendo, limitato a 500 per contenere costi
                        const countSnap = await db.collection('push_history')
                            .where('appSlug', '==', slug)
                            .where('status', '==', 'sent')
                            .limit(500)
                            .get();
                        totalNotifs = countSnap.size;
                    }

                } catch (e) {
                    // Fallback: query senza orderBy (non serve indice composito)
                    console.warn(`[monitor] Indice mancante per ${slug}, uso fallback senza orderBy`);
                    try {
                        // Count aggregato anche nel fallback
                        try {
                            const countAgg = await db.collection('push_history')
                                .where('appSlug', '==', slug)
                                .where('status', '==', 'sent')
                                .count().get();
                            totalNotifs = countAgg.data().count;
                        } catch (eCount) {
                            const countSnap = await db.collection('push_history')
                                .where('appSlug', '==', slug)
                                .where('status', '==', 'sent')
                                .limit(500)
                                .get();
                            totalNotifs = countSnap.size;
                        }

                        // Per lastNotifDate leggiamo SOLO se serve (quando totalNotifs > 0
                        // e non abbiamo potuto usare orderBy). Limitiamo a 50 doc più recenti
                        // ordinati sul client.
                        if (totalNotifs > 0) {
                            const fallbackSnap = await db.collection('push_history')
                                .where('appSlug', '==', slug)
                                .where('status', '==', 'sent')
                                .limit(50)
                                .get();
                            fallbackSnap.forEach(doc => {
                                const d = doc.data();
                                const sentAt = d.sentAt?.toDate ? d.sentAt.toDate() : null;
                                if (sentAt && (!lastNotifDate || sentAt > lastNotifDate)) {
                                    lastNotifDate = sentAt;
                                }
                            });
                        }
                        queryOk = true;
                    } catch (e2) {
                        console.warn(`[monitor] Anche il fallback fallito per ${slug}:`, e2.message);
                    }
                }

                // Se la query non è riuscita neanche col fallback, salta questa app
                if (!queryOk) continue;

                if (totalNotifs === 0) {
                    // Distingui tra app appena configurata e app con problemi reali
                    const lastSync = app.lastPushSync?.toDate ? app.lastPushSync.toDate() : null;
                    const configuredRecently = lastSync && (now - lastSync) < (3 * 24 * 60 * 60 * 1000); // meno di 3 giorni
                    alerts.push({
                        type: configuredRecently ? 'warn' : 'error',
                        appName: app.comune || app.appSlug,
                        message: configuredRecently
                            ? 'Nessuna notifica ancora ricevuta. Account configurato di recente — invia una notifica di test e rilancia il sync.'
                            : 'Nessuna notifica ricevuta. Verificare che l\'account fantasma abbia aperto l\'app e accettato le notifiche push.',
                        details: { lastSync }
                    });
                } else if (lastNotifDate) {
                    const daysSince = Math.floor((now - lastNotifDate) / (1000 * 60 * 60 * 24));
                    if (daysSince >= ERROR_DAYS) {
                        alerts.push({
                            type: 'error',
                            appName: app.comune || app.appSlug,
                            message: `Nessuna notifica da ${daysSince} giorni. Possibile token push scaduto o app sospesa dal dispositivo.`,
                            details: { lastNotif: lastNotifDate, totalNotifs }
                        });
                    } else if (daysSince >= WARN_DAYS) {
                        alerts.push({
                            type: 'warn',
                            appName: app.comune || app.appSlug,
                            message: `Ultima notifica ricevuta ${daysSince} giorni fa. Verificare che l'app sia ancora attiva sul dispositivo.`,
                            details: { lastNotif: lastNotifDate, totalNotifs }
                        });
                    }
                }
            }

            // Ordina: errori prima, poi warning
            alerts.sort((a, b) => (a.type === 'error' ? 0 : 1) - (b.type === 'error' ? 0 : 1));

            const errCount = alerts.filter(a => a.type === 'error').length;
            const warnCount = alerts.filter(a => a.type === 'warn').length;
            const okCount = monitorate.length - errCount - warnCount;

            // Header — mostra sempre il riepilogo
            let headerBg = '#E2F8DE'; // verde chiaro
            let headerColor = '#3CA434';
            let headerIcon = 'fa-check-circle';
            let headerText = `Monitoraggio attivo — ${monitorate.length} app tutte OK`;

            if (errCount > 0) {
                headerBg = '#FFEBEE';
                headerColor = '#D32F2F';
                headerIcon = 'fa-exclamation-triangle';
                headerText = `${errCount} ${errCount === 1 ? 'problema critico' : 'problemi critici'}${warnCount > 0 ? `, ${warnCount} avvisi` : ''} — ${okCount} OK su ${monitorate.length}`;
            } else if (warnCount > 0) {
                headerBg = '#FFF8E1';
                headerColor = '#F57F17';
                headerIcon = 'fa-exclamation-triangle';
                headerText = `${warnCount} ${warnCount === 1 ? 'avviso' : 'avvisi'} — ${okCount} OK su ${monitorate.length}`;
            }

            let html = `
                <div class="sp-alert-header" style="background:${headerBg}; color:${headerColor};">
                    <span class="sp-alert-title">
                        <i class="fas ${headerIcon}"></i>
                        ${headerText}
                    </span>
                </div>
            `;

            // Card per ogni app con problemi
            alerts.forEach(alert => {
                const iconClass = alert.type === 'error' ? 'fa-times-circle' : 'fa-exclamation-triangle';
                let detailsHtml = '';

                if (alert.details) {
                    detailsHtml = '<div class="alert-details">';
                    if (alert.details.lastNotif) {
                        detailsHtml += `<span><i class="fas fa-clock"></i> Ultima: ${this.formatDate(alert.details.lastNotif)}</span>`;
                    }
                    if (alert.details.totalNotifs !== undefined) {
                        detailsHtml += `<span><i class="fas fa-bell"></i> ${alert.details.totalNotifs} totali</span>`;
                    }
                    if (alert.details.lastSync) {
                        detailsHtml += `<span><i class="fas fa-sync-alt"></i> Sync: ${this.formatDate(alert.details.lastSync)}</span>`;
                    }
                    detailsHtml += '</div>';
                }

                html += `
                    <div class="sp-alert-card alert-${alert.type}">
                        <div class="alert-icon"><i class="fas ${iconClass}"></i></div>
                        <div class="alert-body">
                            <div class="alert-app-name">${this.escapeHtml(alert.appName)}</div>
                            <div class="alert-message">${this.escapeHtml(alert.message)}</div>
                            ${detailsHtml}
                        </div>
                    </div>
                `;
            });

            // Se tutto OK, mostra lista compatta delle app monitorate
            if (alerts.length === 0) {
                const nomiOk = monitorate
                    .map(a => a.comune || a.nome || a.appSlug)
                    .sort((a, b) => a.localeCompare(b, 'it'))
                    .join(', ');

                html += `
                    <div class="sp-alert-card" style="border-left:4px solid #3CA434; background:#E2F8DE;">
                        <div class="alert-icon" style="color:#3CA434;"><i class="fas fa-check-circle"></i></div>
                        <div class="alert-body">
                            <div class="alert-app-name" style="color:#3CA434;">Tutte le app funzionano correttamente</div>
                            <div class="alert-message" style="color:#4A4A4A;">${this.escapeHtml(nomiOk)}</div>
                        </div>
                    </div>
                `;
            }

            container.innerHTML = html;
            container.style.display = 'block';

        } catch (error) {
            console.warn('[StoricoPush] Errore caricamento alert:', error);
            container.style.display = 'none';
        }
    },

    formatDate(date) {
        if (!date) return '—';
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffDays === 0) return 'Oggi ' + date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        if (diffDays === 1) return 'Ieri';
        if (diffDays < 30) return `${diffDays} giorni fa`;
        return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
    },

    // ================================================================
    // Utility
    // ================================================================

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};

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

    // ================================================================
    // Render principale
    // ================================================================

    async render() {
        try {
            UI.showLoading();

            // Carica lista app per filtri (tutte le app con pushMonitorEnabled O attive)
            const tutteLeApp = await DataService.getApps();
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
                        <div class="sp-stat-label">In agenda</div>
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
                            <option value="in_agenda">In agenda</option>
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
                .sp-notif-row.src-crm_api { border-left-color: var(--blu-700); }

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
                }
                .sp-alert-title {
                    font-size: 0.85rem;
                    font-weight: 700;
                    color: #D32F2F;
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
            // Conta app monitorate
            const appsSnap = await db.collection('app')
                .where('pushMonitorEnabled', '==', true)
                .get();
            document.getElementById('sp-stat-apps').textContent = appsSnap.size;

            // Per le altre stats, facciamo query leggere
            const queries = {
                total: db.collection('push_history').where('status', '==', 'sent'),
                rss: db.collection('push_history').where('source', '==', 'rss_auto'),
                events: db.collection('push_history').where('source', '==', 'calendar_auto'),
                broadcast: db.collection('push_history').where('source', 'in', ['meteo_alert', 'crm_broadcast', 'crm_api', 'manual'])
            };

            // Esegui in parallelo
            const [totalSnap, rssSnap, eventsSnap, broadcastSnap] = await Promise.all([
                queries.total.get(),
                queries.rss.get(),
                queries.events.get(),
                queries.broadcast.get()
            ]);

            document.getElementById('sp-stat-total').textContent = totalSnap.size;
            document.getElementById('sp-stat-rss').textContent = rssSnap.size;
            document.getElementById('sp-stat-events').textContent = eventsSnap.size;
            document.getElementById('sp-stat-broadcast').textContent = broadcastSnap.size;

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

        if (this.notifications.length === 0) {
            container.innerHTML = `
                <div class="sp-empty">
                    <i class="fas fa-bell-slash"></i>
                    <h3>Nessuna notifica trovata</h3>
                    <p>Prova a modificare i filtri o avvia una sincronizzazione.</p>
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
            'calendar_auto': 'In agenda',
            'meteo_alert': 'Allerta',
            'crm_broadcast': 'Avviso',
            'crm_api': 'Avviso',
            'manual': 'Avviso'
        };

        container.innerHTML = this.notifications.map(n => {
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

    async syncNow() {
        const appSlug = this.filters.appSlug || '';
        const label = appSlug ? `Sincronizzazione ${appSlug}...` : 'Sincronizzazione tutte le app...';

        UI.showLoading(label);

        try {
            const params = new URLSearchParams();
            if (appSlug) params.set('appSlug', appSlug);

            const response = await fetch(`/api/sync-push-history?${params.toString()}`);
            const data = await response.json();

            UI.hideLoading();

            if (data.success) {
                UI.showSuccess(`Sincronizzazione completata: ${data.totalNewNotifications} nuove notifiche da ${data.totalApps} app`);
                // Ricarica la lista
                await this.loadNotifications(false);
            } else {
                UI.showError('Errore nella sincronizzazione: ' + (data.error || 'Errore sconosciuto'));
            }
        } catch (error) {
            UI.hideLoading();
            UI.showError('Errore di connessione: ' + error.message);
        }
    },

    // ================================================================
    // Configurazione monitoraggio
    // ================================================================

    openConfig() {
        // Mostra un modal con la lista delle app e la configurazione del monitoraggio
        const appRows = this.apps.map(a => {
            const enabled = a.pushMonitorEnabled ? 'checked' : '';
            const userId = a.monitorPushUserId || '';
            return `
                <tr>
                    <td><strong>${this.escapeHtml(a.comune || a.nome)}</strong></td>
                    <td><code>${a.goodbarberWebzineId || '—'}</code></td>
                    <td>
                        <input type="number" class="sp-config-userid"
                               data-app-id="${a.id}"
                               value="${userId}"
                               placeholder="User ID fantasma"
                               style="width:120px;padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:0.85rem;">
                    </td>
                    <td style="text-align:center;">
                        <input type="checkbox" class="sp-config-enabled"
                               data-app-id="${a.id}" ${enabled}>
                    </td>
                </tr>
            `;
        }).join('');

        const modalHtml = `
            <div id="sp-config-modal" onclick="StoricoPush.closeConfig(event)" style="
                position:fixed;top:0;left:0;right:0;bottom:0;
                background:rgba(0,0,0,0.5);
                display:flex;align-items:center;justify-content:center;
                z-index:9999;padding:1rem;">
                <div onclick="event.stopPropagation()" style="
                    background:white;border-radius:12px;
                    max-width:750px;width:100%;max-height:85vh;
                    overflow:hidden;display:flex;flex-direction:column;
                    box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                    <div style="padding:1rem 1.5rem;border-bottom:1px solid #d9d9d9;display:flex;align-items:center;justify-content:space-between;">
                        <h3 style="margin:0;font-size:1.1rem;color:#145284;"><i class="fas fa-cog"></i> Configurazione Monitoraggio Push</h3>
                        <button onclick="StoricoPush.closeConfig()" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:#9B9B9B;padding:4px 8px;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div style="padding:1rem 1.5rem;overflow-y:auto;flex:1;">
                        <p style="margin-bottom:12px;font-size:0.85rem;color:#9B9B9B;">
                            Per ogni app, inserisci il <strong>User ID</strong> dell'utente fantasma creato su GoodBarber
                            e attiva il monitoraggio. L'API
                            <code>pushapi/history</code> verrà interrogata periodicamente per ogni app attiva.
                        </p>
                        <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                            <thead>
                                <tr style="border-bottom:2px solid #d9d9d9;text-align:left;">
                                    <th style="padding:8px 4px;">Comune</th>
                                    <th style="padding:8px 4px;">Webzine ID</th>
                                    <th style="padding:8px 4px;">Monitor User ID</th>
                                    <th style="padding:8px 4px;text-align:center;">Attivo</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${appRows}
                            </tbody>
                        </table>
                    </div>
                    <div style="display:flex;gap:8px;justify-content:flex-end;padding:12px 1.5rem;border-top:1px solid #d9d9d9;background:white;">
                        <button class="btn btn-outline" onclick="StoricoPush.closeConfig()">Annulla</button>
                        <button class="btn btn-primary" onclick="StoricoPush.saveConfig()">
                            <i class="fas fa-save"></i> Salva Configurazione
                        </button>
                    </div>
                </div>
            </div>
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

                const docRef = db.collection('app').doc(appId);
                batch.update(docRef, {
                    monitorPushUserId: userId,
                    pushMonitorEnabled: enabled
                });
            });

            await batch.commit();

            UI.hideLoading();
            UI.showSuccess('Configurazione salvata!');
            this.closeConfig();

            // Aggiorna la lista app locale
            const tutteLeApp = await DataService.getApps();
            this.apps = tutteLeApp.filter(a => a.statoApp === 'ATTIVA');

        } catch (error) {
            UI.hideLoading();
            UI.showError('Errore nel salvataggio: ' + error.message);
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
            const monitorate = this.apps.filter(a => a.pushMonitorEnabled === true && a.appSlug);

            if (monitorate.length === 0) {
                container.style.display = 'none';
                return;
            }

            for (const app of monitorate) {
                let lastNotifDate = null;
                let totalNotifs = 0;
                let queryOk = false;

                try {
                    // Prima prova con orderBy (richiede indice composito)
                    const lastSnap = await db.collection('push_history')
                        .where('appSlug', '==', app.appSlug)
                        .where('status', '==', 'sent')
                        .orderBy('sentAt', 'desc')
                        .limit(1)
                        .get();

                    queryOk = true;
                    if (!lastSnap.empty) {
                        const data = lastSnap.docs[0].data();
                        lastNotifDate = data.sentAt?.toDate ? data.sentAt.toDate() : null;
                    }

                    const countSnap = await db.collection('push_history')
                        .where('appSlug', '==', app.appSlug)
                        .where('status', '==', 'sent')
                        .get();
                    totalNotifs = countSnap.size;

                } catch (e) {
                    // Fallback: query senza orderBy (non serve indice composito)
                    console.warn(`[monitor] Indice mancante per ${app.appSlug}, uso fallback senza orderBy`);
                    try {
                        const fallbackSnap = await db.collection('push_history')
                            .where('appSlug', '==', app.appSlug)
                            .where('status', '==', 'sent')
                            .get();

                        totalNotifs = fallbackSnap.size;
                        queryOk = true;

                        // Trova la data più recente manualmente
                        fallbackSnap.forEach(doc => {
                            const d = doc.data();
                            const sentAt = d.sentAt?.toDate ? d.sentAt.toDate() : null;
                            if (sentAt && (!lastNotifDate || sentAt > lastNotifDate)) {
                                lastNotifDate = sentAt;
                            }
                        });
                    } catch (e2) {
                        console.warn(`[monitor] Anche il fallback fallito per ${app.appSlug}:`, e2.message);
                    }
                }

                // Se la query non è riuscita neanche col fallback, salta questa app
                if (!queryOk) continue;

                if (totalNotifs === 0) {
                    alerts.push({
                        type: 'error',
                        appName: app.comune || app.appSlug,
                        message: 'Nessuna notifica ricevuta. Account fantasma non attivo o non ha mai aperto l\'app.',
                        details: { lastSync: app.lastPushSync?.toDate ? app.lastPushSync.toDate() : null }
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

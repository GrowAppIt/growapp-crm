/**
 * Storico Push Module — Pagina CRM per gestione storico notifiche push
 *
 * Funzionalità:
 * - Visualizza lo storico notifiche di tutte le app (o filtrate)
 * - Avvia sincronizzazione manuale dall'API GoodBarber
 * - Configura il monitoraggio per ogni app (user_id fantasma)
 * - Statistiche per sorgente e per app
 *
 * -----------------------------------------------------------------------------
 * CHANGELOG
 * -----------------------------------------------------------------------------
 * 2026-07-09 — Configuratore Archivio Notifiche: affidabilità + restyle
 *   BUG RISOLTO ("sembra non salvare slug/user id"): saveConfig() scriveva su
 *   Firestore con un db.batch() grezzo SENZA invalidare la cache app di
 *   DataService (TTL 3 min) e senza aggiornare lo stato in memoria; poi
 *   ricaricava this.apps dalla cache VECCHIA. Risultato: il dato veniva salvato
 *   davvero su Firestore, ma riaprendo il modal ricompariva vuoto → l'utente
 *   pensava che non salvasse. (Confermato in produzione: San Cataldo e
 *   Valledolmo risultavano già salvati su Firestore.)
 *   FIX:
 *     - openConfig() ora RICARICA sempre lo stato reale da Firestore (bypassa
 *       la cache) prima di disegnare il modal.
 *     - saveConfig() salva riga-per-riga (una riga rotta non blocca le altre),
 *       invalida la cache, aggiorna lo stato in memoria e mostra un feedback
 *       onesto (cosa è stato salvato / cosa no).
 *     - Autosave su "blur" dei campi Slug/User ID + evidenza "modifiche non
 *       salvate", così ciò che scrivi viene ricordato.
 *   RESTYLE:
 *     - Pannello "Stato monitoraggio" con health-grid di TUTTE le app a colpo
 *       d'occhio, calcolato dai campi già presenti sul doc app (0 letture extra
 *       invece di ~2 query × 103 app), + card azionabili e azioni rapide.
 *     - Modal Configura più leggibile: chip di stato sync, azioni rapide
 *       (apri archivio / copia URL), validazione slug e collisioni.
 * -----------------------------------------------------------------------------
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
            this.loading = false; // sblocca eventuali rotelle rimaste "appese" da una visita precedente
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

                /* ---- Pannello "Stato monitoraggio" (restyle 2026-07-09) ---- */
                .sp-alert-summary {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    flex-wrap: wrap;
                    gap: 10px;
                    padding: 12px 16px;
                    border-radius: 10px;
                    margin-bottom: 10px;
                }
                .sp-alert-summary .sp-sum-left {
                    display: flex; align-items: center; gap: 10px; font-weight: 700;
                    font-size: 0.95rem;
                }
                .sp-alert-summary .sp-sum-counts { display: flex; gap: 6px; flex-wrap: wrap; }
                .sp-sum-pill {
                    font-size: 0.72rem; font-weight: 800; padding: 2px 9px; border-radius: 20px;
                    display: inline-flex; align-items: center; gap: 4px; letter-spacing: .2px;
                }
                .sp-sum-pill.ok    { background: #E2F8DE; color: #2f8a29; }
                .sp-sum-pill.warn  { background: #FFF8E1; color: #C77700; }
                .sp-sum-pill.error { background: #FFEBEE; color: #D32F2F; }
                .sp-sum-pill.never { background: #F0F0F0; color: #6b6b6b; }
                .sp-alert-summary .sp-sum-actions { display: flex; gap: 6px; flex-wrap: wrap; }

                /* Griglia "salute" di tutte le app monitorate */
                .sp-health-grid {
                    display: flex; flex-wrap: wrap; gap: 6px;
                    margin-bottom: 12px;
                }
                .sp-health-chip {
                    display: inline-flex; align-items: center; gap: 6px;
                    padding: 5px 10px; border-radius: 8px; cursor: pointer;
                    font-size: 0.8rem; font-weight: 600; border: 1px solid transparent;
                    transition: transform .1s, box-shadow .1s;
                    max-width: 220px;
                }
                .sp-health-chip:hover { transform: translateY(-1px); box-shadow: 0 2px 6px rgba(0,0,0,.12); }
                .sp-health-chip .hc-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .sp-health-chip .hc-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
                .sp-health-chip.ok    { background: #F1FBEF; border-color: #CDEFC6; color: #2f6b2a; }
                .sp-health-chip.ok    .hc-dot { background: #3CA434; }
                .sp-health-chip.warn  { background: #FFF8E1; border-color: #FCE9AE; color: #97600A; }
                .sp-health-chip.warn  .hc-dot { background: #F5A623; }
                .sp-health-chip.error { background: #FFEBEE; border-color: #F6C6CB; color: #C62828; }
                .sp-health-chip.error .hc-dot { background: #D32F2F; }
                .sp-health-chip.never { background: #F5F5F5; border-color: #E2E2E2; color: #6b6b6b; }
                .sp-health-chip.never .hc-dot { background: #9B9B9B; }

                .sp-alert-card.alert-never { background: #F7F7F7; border-left: 4px solid #9B9B9B; }
                .sp-alert-card.alert-never .alert-icon { color: #9B9B9B; }
                .sp-alert-card .alert-actions {
                    display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap;
                }

                /* Bottoncini azione riutilizzabili (pannello + modal) */
                .sp-mini-btn {
                    display: inline-flex; align-items: center; gap: 5px;
                    font-family: 'Titillium Web', sans-serif;
                    font-size: 0.75rem; font-weight: 700;
                    padding: 4px 10px; border-radius: 6px; cursor: pointer;
                    border: 1px solid #D1E2F2; background: #fff; color: #145284;
                    transition: background .12s, border-color .12s;
                    white-space: nowrap;
                }
                .sp-mini-btn:hover { background: #EAF3FB; border-color: #7BA7CE; }
                .sp-mini-btn.solid { background: #145284; color: #fff; border-color: #145284; }
                .sp-mini-btn.solid:hover { background: #2E6DA8; }
                .sp-mini-btn.green { background: #3CA434; color: #fff; border-color: #3CA434; }
                .sp-mini-btn.green:hover { background: #59C64D; }
                .sp-mini-btn:disabled { opacity: .55; cursor: not-allowed; }

                /* Chip di stato sync dentro il modal Configura */
                .sp-cfg-chip {
                    display: inline-flex; align-items: center; gap: 5px;
                    font-size: 0.72rem; font-weight: 700; padding: 3px 8px; border-radius: 20px;
                    white-space: nowrap;
                }
                .sp-cfg-chip .cc-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
                .sp-cfg-chip.ok    { background: #E2F8DE; color: #2f8a29; }
                .sp-cfg-chip.ok    .cc-dot { background: #3CA434; }
                .sp-cfg-chip.warn  { background: #FFF8E1; color: #97600A; }
                .sp-cfg-chip.warn  .cc-dot { background: #F5A623; }
                .sp-cfg-chip.error { background: #FFEBEE; color: #C62828; }
                .sp-cfg-chip.error .cc-dot { background: #D32F2F; }
                .sp-cfg-chip.never { background: #F0F0F0; color: #6b6b6b; }
                .sp-cfg-chip.never .cc-dot { background: #9B9B9B; }

                /* Evidenza righe con modifiche non salvate / appena salvate */
                .sp-cfg-row.sp-cfg-dirty { background: #FFFDF3; }
                .sp-cfg-row.sp-cfg-dirty td:first-child { box-shadow: inset 3px 0 0 #F5A623; }
                .sp-cfg-row.sp-cfg-saved { animation: spCfgSaved 1.4s ease; }
                @keyframes spCfgSaved {
                    0% { background: #DFF5DB; }
                    100% { background: transparent; }
                }
                .sp-cfg-input-invalid { border-color: #D32F2F !important; background: #FFF6F6; }
                .sp-cfg-rowmsg { font-size: 0.72rem; margin-top: 3px; min-height: 0; }
                .sp-cfg-rowmsg.ok  { color: #2f8a29; }
                .sp-cfg-rowmsg.err { color: #D32F2F; }

                @media (max-width: 768px) {
                    .sp-header { flex-direction: column; }
                    .sp-stats { grid-template-columns: repeat(2, 1fr); }
                    .sp-filters { flex-direction: column; }
                    .sp-filter-group select { min-width: 100%; }
                    .sp-health-chip { max-width: 100%; flex: 1 1 auto; }
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
            // Guardia null: se l'utente ha cambiato pagina mentre la query era in
            // corso, sp-list non esiste più. Senza questa guardia il catch lancerebbe
            // un secondo TypeError e this.loading resterebbe true per sempre → rotella
            // infinita ad ogni riapertura del configuratore finché non si ricarica.
            const _el = document.getElementById('sp-list');
            if (_el) {
                _el.innerHTML = `
                <div class="sp-empty">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Errore di caricamento</h3>
                    <p>${this.escapeHtml(error.message)}</p>
                    <p style="margin-top:8px;font-size:0.8rem;">Potrebbe essere necessario creare un indice composito su Firestore.<br>
                    Controlla la console del browser per il link diretto.</p>
                </div>
            `;
            }
        } finally {
            // SEMPRE, anche se renderList()/catch lanciano: altrimenti la rotella
            // non si ferma mai nelle visite successive (StoricoPush è un singleton).
            this.loading = false;
        }
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
        // Guardia null: se la pagina non è più visibile (cambio menu durante una
        // query lenta) container è null. Uscire subito evita il TypeError che
        // altrimenti lascerebbe la rotella "appesa" per le visite successive.
        if (!container) return;

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

    async openConfig(opts = {}) {
        // Ricarica SEMPRE lo stato reale da Firestore prima di disegnare il modal.
        // (Fix bug "sembra non salvare": la cache app di DataService — TTL 3 min —
        //  restituiva dati vecchi e faceva ricomparire vuoti i campi dopo il salvataggio.)
        if (opts.reload !== false) {
            try {
                UI.showLoading('Carico configurazione...');
                await this._reloadAppsFresh();
                UI.hideLoading();
            } catch (e) {
                UI.hideLoading();
                console.warn('[StoricoPush] Reload config fallito, uso i dati già in memoria:', e && e.message);
            }
        }

        // Evita due modal sovrapposti
        const existing = document.getElementById('sp-config-modal');
        if (existing) existing.remove();

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
            const suggestedSlug = this._suggestSlug(a.comune || a.nome || '');
            const nomeApp = a.comune || a.nome || '';
            const badge = enabled
                ? '<span class="sp-cfg-badge sp-cfg-badge-on"><i class="fas fa-check-circle"></i> Monitorata</span>'
                : '<span class="sp-cfg-badge sp-cfg-badge-off"><i class="far fa-circle"></i> Non monitorata</span>';

            const chip = enabled
                ? this._chipHtml(this._computeHealth(a))
                : '<span style="color:#c4c4c4;font-size:0.78rem;">\u2014</span>';

            const webz = a.goodbarberWebzineId
                ? `<div style="font-size:0.68rem;color:#B0B0B0;margin-top:3px;">Webzine ${this.escapeHtml(String(a.goodbarberWebzineId))}</div>`
                : '';

            // Le azioni usano lo slug salvato oppure il suggerimento (anteprima anche prima
            // di salvare). Lo slug \u00e8 normalizzato [a-z0-9] \u21d2 sicuro dentro gli apici.
            const slugForActions = currentSlug || suggestedSlug;
            const actions = slugForActions
                ? `<button class="sp-mini-btn" title="Apri l'archivio pubblico in una nuova scheda" onclick="StoricoPush.openArchive('${slugForActions}')"><i class="fas fa-external-link-alt"></i></button>
                   <button class="sp-mini-btn" title="Copia l'URL dell'archivio" onclick="StoricoPush.copyArchiveUrl('${slugForActions}', this)"><i class="fas fa-link"></i></button>
                   <button class="sp-mini-btn" title="Sincronizza ora questa app" onclick="StoricoPush.syncApp('${slugForActions}', this)"><i class="fas fa-sync-alt"></i></button>`
                : '<span style="color:#ccc;">\u2014</span>';

            return `
                <tr class="sp-cfg-row" data-app-id="${a.id}" data-search="${this.escapeHtml(nomeApp.toLowerCase())}">
                    <td style="padding:10px 6px;vertical-align:middle;">
                        <div style="font-weight:700;color:#145284;">${this.escapeHtml(nomeApp)}</div>
                        <div style="margin-top:3px;">${badge}</div>
                    </td>
                    <td style="padding:10px 6px;vertical-align:middle;">
                        <input type="text" class="sp-config-slug"
                               data-app-id="${a.id}" data-orig="${this.escapeHtml(currentSlug)}"
                               value="${this.escapeHtml(currentSlug)}"
                               placeholder="${this.escapeHtml(suggestedSlug)}"
                               oninput="StoricoPush._onRowInput('${a.id}')"
                               onblur="StoricoPush._onRowBlurSave('${a.id}')"
                               style="width:150px;max-width:100%;padding:5px 8px;border:1px solid #ddd;border-radius:4px;font-size:0.85rem;font-family:monospace;">
                        ${webz}
                    </td>
                    <td style="padding:10px 6px;vertical-align:middle;">
                        <input type="number" class="sp-config-userid"
                               data-app-id="${a.id}" data-orig="${userId}"
                               value="${userId}"
                               placeholder="User ID fantasma"
                               oninput="StoricoPush._onRowInput('${a.id}')"
                               onblur="StoricoPush._onRowBlurSave('${a.id}')"
                               style="width:120px;max-width:100%;padding:5px 8px;border:1px solid #ddd;border-radius:4px;font-size:0.85rem;">
                        <div class="sp-cfg-rowmsg" data-app-id="${a.id}"></div>
                    </td>
                    <td class="sp-cfg-statuscell" style="padding:10px 6px;text-align:center;vertical-align:middle;">${chip}</td>
                    <td style="padding:10px 6px;vertical-align:middle;">
                        <div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap;">${actions}</div>
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
                    <th style="padding:10px 6px;">Monitor User ID</th>
                    <th style="padding:10px 6px;text-align:center;">Stato sync</th>
                    <th style="padding:10px 6px;text-align:center;">Azioni</th>
                    <th style="padding:10px 6px;text-align:center;width:80px;">Monitor</th>
                </tr>
            </thead>
        `;

        const rowsMonitorate = monitorate.length > 0
            ? monitorate.map(buildRow).join('')
            : `<tr><td colspan="6" style="padding:20px;text-align:center;color:#9B9B9B;font-style:italic;">Nessuna app in monitoraggio. Attiva il toggle di una app qui sotto per iniziare.</td></tr>`;

        const rowsDisponibili = disponibili.length > 0
            ? disponibili.map(buildRow).join('')
            : `<tr><td colspan="6" style="padding:20px;text-align:center;color:#9B9B9B;font-style:italic;">Tutte le app attive sono già in monitoraggio.</td></tr>`;

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
                            <p style="margin:4px 0 0 0;font-size:0.78rem;color:#9B9B9B;">Il toggle <strong>Monitor</strong> salva subito. <strong>Slug</strong> e <strong>User ID</strong> vengono salvati automaticamente quando esci dal campo (o col bottone <strong>Salva</strong> in basso). Le righe con modifiche non salvate sono evidenziate in giallo.</p>
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
                            <i class="fas fa-info-circle"></i> Tip: attiva il toggle per iniziare subito a monitorare un comune. L'URL dell'archivio è <code>notifiche.comune.digital/storico-notifiche/?app=SLUG</code>
                        </span>
                        <div style="display:flex;gap:8px;">
                            <button class="btn btn-outline" onclick="StoricoPush.closeConfig()">Chiudi</button>
                            <button id="sp-cfg-save-btn" class="btn btn-primary" onclick="StoricoPush.saveConfig()">
                                <i class="fas fa-check"></i> Tutto salvato
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

    // Salva in blocco tutte le righe con modifiche non salvate ("dirty").
    // Ogni riga è salvata in modo indipendente: se una fallisce (doc mancante,
    // slug in conflitto, permessi), le altre vengono comunque salvate.
    // Niente più db.batch() atomico che, con un solo doc problematico, bloccava
    // TUTTO il salvataggio.
    async saveConfig() {
        const dirtyRows = Array.from(
            document.querySelectorAll('#sp-config-modal tr.sp-cfg-row.sp-cfg-dirty')
        );
        if (dirtyRows.length === 0) {
            UI.showSuccess('Tutto già salvato.');
            return;
        }

        UI.showLoading('Salvataggio configurazione...');

        const ok = [];
        const ko = [];
        // Sequenziale: così la rilevazione delle collisioni di slug tiene conto
        // anche degli slug appena salvati nelle righe precedenti.
        for (const row of dirtyRows) {
            const appId = row.dataset.appId;
            const res = await this._persistRow(appId, { silent: true });
            if (res && res.ok && res.changed) ok.push(res.appName);
            else if (res && !res.ok) ko.push((res.appName || appId) + (res.error ? ' (' + res.error + ')' : ''));
        }

        UI.hideLoading();
        this._updateDirtyCount();

        if (ko.length === 0) {
            UI.showSuccess('Salvato: ' + (ok.length ? ok.join(', ') : 'nessuna modifica'));
        } else if (ok.length === 0) {
            UI.showError('Non salvato → ' + ko.join('; '));
        } else {
            UI.showError('Salvate ' + ok.length + ' app. NON salvate → ' + ko.join('; '));
        }

        // Ricalcola i chip di salute del pannello con lo stato aggiornato
        this.loadMonitorAlerts();
    },

    // =================================================================
    // Helper condivisi (configuratore + pannello "Stato monitoraggio")
    // =================================================================

    // Ricarica lo stato REALE delle app da Firestore bypassando la cache di
    // DataService (TTL 3 min). È la chiave del fix "sembra non salvare".
    async _reloadAppsFresh() {
        if (typeof DataService !== 'undefined' && typeof DataService._cacheInvalidate === 'function') {
            DataService._cacheInvalidate('app:');
        }
        const tutte = await DataService.getApps();
        this.tutteLeApp = tutte || [];
        this.apps = this.tutteLeApp.filter(a => a.pushMonitorEnabled || a.statoApp === 'ATTIVA');
        return this.tutteLeApp;
    },

    // Slug normalizzato: minuscolo, senza accenti/spazi/simboli → solo [a-z0-9]
    _normalizeSlug(v) {
        return (v == null ? '' : String(v))
            .trim().toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]/g, '');
    },
    _suggestSlug(name) {
        return this._normalizeSlug(name);
    },

    // URL pubblico dell'archivio notifiche di un comune
    archiveUrl(slug) {
        const s = this._normalizeSlug(slug);
        return s ? 'https://notifiche.comune.digital/storico-notifiche/?app=' + encodeURIComponent(s) : '';
    },
    openArchive(slug) {
        const url = this.archiveUrl(slug);
        if (url) window.open(url, '_blank', 'noopener');
    },
    copyArchiveUrl(slug, btn) {
        const url = this.archiveUrl(slug);
        if (!url) return;
        const done = () => {
            if (btn) { const old = btn.innerHTML; btn.innerHTML = '<i class="fas fa-check"></i>'; setTimeout(() => { btn.innerHTML = old; }, 1200); }
            if (typeof UI !== 'undefined' && UI.showSuccess) UI.showSuccess('URL archivio copiato negli appunti');
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(done).catch(() => { this._fallbackCopy(url); done(); });
        } else {
            this._fallbackCopy(url); done();
        }
    },
    _fallbackCopy(text) {
        const t = document.createElement('textarea');
        t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.focus(); t.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(t);
    },

    // Sincronizza ORA una singola app (azioni rapide del modal e delle card).
    async syncApp(slug, btn) {
        const s = this._normalizeSlug(slug);
        if (!s) return;
        const headers = await this._buildSyncAuthHeaders();
        let oldHtml = null;
        if (btn) { oldHtml = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
        try {
            const r = await fetch('/api/sync-push-history?appSlug=' + encodeURIComponent(s), { headers });
            const data = await r.json();
            if (data.success) {
                if (UI.showSuccess) UI.showSuccess('Sync ' + s + ': ' + (data.totalNewNotifications || 0) + ' nuove notifiche');
                await this._reloadAppsFresh();
                this.loadMonitorAlerts();
            } else {
                const hint = r.status === 401 ? ' (sessione scaduta — rifai login)' : '';
                if (UI.showError) UI.showError('Errore sync ' + s + ': ' + (data.error || 'errore') + hint);
            }
        } catch (e) {
            if (UI.showError) UI.showError('Errore di connessione: ' + e.message);
        } finally {
            if (btn) { btn.disabled = false; if (oldHtml != null) btn.innerHTML = oldHtml; }
        }
    },

    // Salute di un'app calcolata SOLO dai campi già presenti sul doc app
    // (0 letture Firestore extra). Il cron /api/sync-push-history gira ogni
    // 15 min per TUTTE le app (normalmente lastPushSync < 15 min), quindi una
    // lastPushSync vecchia o uno status 'error' indicano un problema reale.
    _computeHealth(app) {
        const HOUR = 3600 * 1000;
        const now = Date.now();
        const lastSync = (app.lastPushSync && app.lastPushSync.toDate) ? app.lastPushSync.toDate().getTime() : null;
        const status = app.lastPushSyncStatus || null;

        if (!app.appSlug) {
            return { level: 'error', label: 'Slug mancante', hint: "Manca l'App Slug: l'archivio non è raggiungibile e la sincronizzazione non parte." };
        }
        if (status === 'error') {
            return { level: 'error', label: 'Errore sync', hint: app.lastPushSyncError || 'La sincronizzazione ha restituito un errore.' };
        }
        if (!lastSync) {
            return { level: 'never', label: 'Mai sincronizzata', hint: 'Nessuna sincronizzazione ancora eseguita. Premi Sincronizza o attendi il prossimo ciclo (ogni 15 min).' };
        }
        const ageH = (now - lastSync) / HOUR;
        if (ageH > 6) {
            const lbl = ageH >= 48 ? (Math.round(ageH / 24) + ' giorni') : (Math.round(ageH) + ' ore');
            return { level: 'error', label: 'Ferma da ' + lbl, hint: 'Il cron sincronizza ogni 15 min: oltre 6h senza sync indica un problema (token GoodBarber scaduto, app sospesa, credenziali).' };
        }
        if (status === 'warning') {
            return { level: 'warn', label: 'Avviso sync', hint: app.lastPushSyncWarning || 'La sincronizzazione ha restituito un avviso.' };
        }
        if (ageH > 1) {
            return { level: 'warn', label: 'Sync ' + Math.round(ageH) + 'h fa', hint: 'Sincronizzazione più vecchia del previsto (atteso ~15 min).' };
        }
        return { level: 'ok', label: 'Attiva', hint: 'Sincronizzazione recente e senza errori.' };
    },
    // Escaping per il CONTENUTO di un attributo ("..."): escapeHtml non escapa
    // i doppi apici, quindi un messaggio di errore con una " romperebbe title="...".
    _attr(s) {
        return this.escapeHtml(s).replace(/"/g, '&quot;');
    },
    _chipHtml(h) {
        return '<span class="sp-cfg-chip ' + h.level + '" title="' + this._attr(h.hint) + '">'
             + '<span class="cc-dot"></span>' + this.escapeHtml(h.label) + '</span>';
    },
    _relTime(ts) {
        const d = (ts && ts.toDate) ? ts.toDate() : (ts instanceof Date ? ts : null);
        if (!d) return 'mai';
        return this.formatDate(d);
    },

    // =================================================================
    // Dirty-tracking e salvataggio riga per riga
    // =================================================================

    _onRowInput(appId) {
        const row = document.querySelector('#sp-config-modal tr.sp-cfg-row[data-app-id="' + appId + '"]');
        if (!row) return;
        const slugInput = row.querySelector('.sp-config-slug');
        const userIdInput = row.querySelector('.sp-config-userid');
        const slugChanged = slugInput && this._normalizeSlug(slugInput.value) !== this._normalizeSlug(slugInput.dataset.orig || '');
        const userChanged = userIdInput && (parseInt(userIdInput.value, 10) || 0) !== (parseInt(userIdInput.dataset.orig, 10) || 0);
        if (slugChanged || userChanged) row.classList.add('sp-cfg-dirty');
        else row.classList.remove('sp-cfg-dirty');
        // Togli l'evidenza di errore mentre si digita
        if (slugInput) slugInput.classList.remove('sp-cfg-input-invalid');
        const msgEl = row.querySelector('.sp-cfg-rowmsg');
        if (msgEl && msgEl.classList.contains('err')) { msgEl.textContent = ''; msgEl.className = 'sp-cfg-rowmsg'; }
        this._updateDirtyCount();
    },

    // Autosave quando si esce da un campo (solo se la riga ha modifiche).
    _onRowBlurSave(appId) {
        const row = document.querySelector('#sp-config-modal tr.sp-cfg-row[data-app-id="' + appId + '"]');
        if (!row || !row.classList.contains('sp-cfg-dirty')) return;
        this._persistRow(appId, { silent: true }).then(() => this._updateDirtyCount());
    },

    _updateDirtyCount() {
        const n = document.querySelectorAll('#sp-config-modal tr.sp-cfg-row.sp-cfg-dirty').length;
        const btn = document.getElementById('sp-cfg-save-btn');
        if (!btn) return;
        if (n > 0) {
            btn.innerHTML = '<i class="fas fa-save"></i> Salva ' + n + (n === 1 ? ' modifica' : ' modifiche');
        } else {
            btn.innerHTML = '<i class="fas fa-check"></i> Tutto salvato';
        }
    },

    // Salva UNA riga su Firestore: valida, aggiorna cache + stato in memoria e
    // dà feedback inline. Ritorna { ok, changed, appName, error }.
    async _persistRow(appId, opts = {}) {
        const silent = !!opts.silent;
        const row = document.querySelector('#sp-config-modal tr.sp-cfg-row[data-app-id="' + appId + '"]');
        const app = (this.tutteLeApp || []).find(a => a.id === appId)
                 || (this.apps || []).find(a => a.id === appId);
        const appName = app ? (app.comune || app.nome || appId) : appId;
        if (!row || !app) return { ok: false, changed: false, appName, error: 'riga non trovata' };

        const slugInput = row.querySelector('.sp-config-slug');
        const userIdInput = row.querySelector('.sp-config-userid');
        const enabledInput = row.querySelector('.sp-config-enabled');
        const msgEl = row.querySelector('.sp-cfg-rowmsg');

        const slug = slugInput ? this._normalizeSlug(slugInput.value) : (app.appSlug || '');
        const userId = userIdInput ? (parseInt(userIdInput.value, 10) || 0) : (app.monitorPushUserId || 0);
        const enabled = enabledInput ? !!enabledInput.checked : !!app.pushMonitorEnabled;

        const fail = (m) => {
            if (slugInput) slugInput.classList.add('sp-cfg-input-invalid');
            if (msgEl) { msgEl.className = 'sp-cfg-rowmsg err'; msgEl.textContent = m; }
            if (!silent && UI.showError) UI.showError(appName + ': ' + m);
            return { ok: false, changed: false, appName, error: m };
        };

        // Validazioni
        if (enabled && !slug) return fail("Per monitorare serve prima l'App Slug.");
        if (slug) {
            const clash = (this.tutteLeApp || []).find(a => a.id !== appId && this._normalizeSlug(a.appSlug || '') === slug);
            if (clash) return fail('Slug già usato da "' + (clash.comune || clash.nome || clash.id) + '".');
        }
        if (slugInput) slugInput.classList.remove('sp-cfg-input-invalid');

        // Solo i campi realmente cambiati
        const patch = {};
        if (slug !== (app.appSlug || '')) patch.appSlug = slug;
        if (userId !== (app.monitorPushUserId || 0)) patch.monitorPushUserId = userId;
        if (enabled !== !!app.pushMonitorEnabled) patch.pushMonitorEnabled = enabled;

        if (Object.keys(patch).length === 0) {
            row.classList.remove('sp-cfg-dirty');
            return { ok: true, changed: false, appName };
        }

        try {
            await db.collection('app').doc(appId).update(patch);
            if (typeof DataService !== 'undefined' && typeof DataService._cacheInvalidate === 'function') {
                DataService._cacheInvalidate('app:');
            }
            // Mantieni coerenti gli oggetti in memoria (in entrambe le liste)
            Object.assign(app, patch);
            const inApps = (this.apps || []).find(a => a.id === appId);
            if (inApps && inApps !== app) Object.assign(inApps, patch);

            // Aggiorna i valori "base", pulisci dirty, feedback verde
            if (slugInput) slugInput.dataset.orig = slug;
            if (userIdInput) userIdInput.dataset.orig = String(userId);
            row.classList.remove('sp-cfg-dirty');
            row.classList.remove('sp-cfg-saved'); void row.offsetWidth; row.classList.add('sp-cfg-saved');
            if (msgEl) {
                msgEl.className = 'sp-cfg-rowmsg ok';
                msgEl.textContent = 'Salvato ✓';
                setTimeout(() => { if (msgEl.textContent === 'Salvato ✓') { msgEl.textContent = ''; msgEl.className = 'sp-cfg-rowmsg'; } }, 2500);
            }
            this._refreshRowChip(row, app);
            if (!silent && UI.showSuccess) UI.showSuccess('Salvato: ' + appName);
            return { ok: true, changed: true, appName };
        } catch (e) {
            return fail('Errore salvataggio: ' + (e && e.message ? e.message : e));
        }
    },

    _refreshRowChip(row, app) {
        const cell = row.querySelector('.sp-cfg-statuscell');
        if (!cell) return;
        if (!app.pushMonitorEnabled) {
            cell.innerHTML = '<span style="color:#c4c4c4;font-size:0.78rem;">—</span>';
            return;
        }
        cell.innerHTML = this._chipHtml(this._computeHealth(app));
    },

    // ================================================================
    // Toggle immediato on/off monitoraggio (salva subito su Firestore)
    // ================================================================

    async toggleMonitor(appId, enabled, checkboxEl) {
        if (!appId) return;

        // Trova l'app in memoria (in entrambe le liste: con "Mostra tutte le app"
        // una app non-ATTIVA può non essere in this.apps).
        const app = (this.tutteLeApp || []).find(a => a.id === appId)
                 || (this.apps || []).find(a => a.id === appId);
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

        // Per attivare serve uno slug: usa quello digitato nella riga (anche se non
        // ancora salvato), altrimenti quello gi\u00e0 presente sull'app.
        const inputSlug = document.querySelector(`.sp-config-slug[data-app-id="${appId}"]`);
        const typedSlug = inputSlug ? this._normalizeSlug(inputSlug.value) : '';
        const effectiveSlug = typedSlug || (app ? this._normalizeSlug(app.appSlug || '') : '');

        if (enabled && !effectiveSlug) {
            const suggested = this._suggestSlug((app && (app.comune || app.nome)) || '');
            alert(
                `Per attivare il monitoraggio di "${appName}" serve prima l'App Slug.\n\n` +
                `Compila il campo "App Slug" (${suggested ? 'es. ' + suggested : 'es. nome app in minuscolo senza spazi'}) e riprova.`
            );
            if (checkboxEl) checkboxEl.checked = false;
            if (inputSlug) {
                inputSlug.focus();
                inputSlug.classList.add('sp-cfg-input-invalid');
                setTimeout(() => { inputSlug.classList.remove('sp-cfg-input-invalid'); }, 2500);
            }
            return;
        }

        // Se sto attivando con uno slug digitato diverso da quello già salvato,
        // applica lo STESSO controllo anti-collisione di _persistRow: due comuni
        // non possono condividere lo slug (altrimenti stesso archivio/bucket push).
        if (enabled && typedSlug && app && this._normalizeSlug(app.appSlug || '') !== typedSlug) {
            const clash = (this.tutteLeApp || []).find(a => a.id !== appId && this._normalizeSlug(a.appSlug || '') === typedSlug);
            if (clash) {
                alert(
                    `Impossibile attivare "${appName}": lo slug "${typedSlug}" è già usato da "${clash.comune || clash.nome || clash.id}".\n\n` +
                    `Ogni comune deve avere uno slug diverso, altrimenti condividerebbero lo stesso archivio notifiche.`
                );
                if (checkboxEl) checkboxEl.checked = false;
                if (inputSlug) {
                    inputSlug.focus();
                    inputSlug.classList.add('sp-cfg-input-invalid');
                    setTimeout(() => { inputSlug.classList.remove('sp-cfg-input-invalid'); }, 2500);
                }
                return;
            }
        }

        // Disabilita il checkbox durante il salvataggio
        if (checkboxEl) checkboxEl.disabled = true;

        try {
            const updateData = { pushMonitorEnabled: enabled };
            // Se sto attivando e c'\u00e8 uno slug digitato non ancora salvato, salvalo insieme
            // (cos\u00ec non si attiva il monitoraggio con appSlug vuoto sul documento).
            if (enabled && typedSlug && app && this._normalizeSlug(app.appSlug || '') !== typedSlug) {
                updateData.appSlug = typedSlug;
            }
            await db.collection('app').doc(appId).update(updateData);

            // Invalida la cache app (altrimenti getApps restituirebbe dati vecchi)
            if (typeof DataService !== 'undefined' && typeof DataService._cacheInvalidate === 'function') {
                DataService._cacheInvalidate('app:');
            }

            // Aggiorna lo stato in memoria (in entrambe le liste)
            if (app) Object.assign(app, updateData);
            const inApps = (this.apps || []).find(a => a.id === appId);
            if (inApps && inApps !== app) Object.assign(inApps, updateData);

            // Se abbiamo salvato lo slug insieme, allinea input + baseline della riga
            const rowEl = document.querySelector('#sp-config-modal tr.sp-cfg-row[data-app-id="' + appId + '"]');
            if (updateData.appSlug && inputSlug) { inputSlug.value = updateData.appSlug; inputSlug.dataset.orig = updateData.appSlug; }
            if (rowEl) rowEl.classList.remove('sp-cfg-dirty');
            this._updateDirtyCount();

            // Sposta la riga nella sezione corretta, aggiorna badge, chip e contatori
            this._moveConfigRow(appId, enabled);
            if (rowEl && app) this._refreshRowChip(rowEl, app);
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
            tbodyMon.innerHTML = `<tr><td colspan="6" style="padding:20px;text-align:center;color:#9B9B9B;font-style:italic;">Nessuna app in monitoraggio. Attiva il toggle di una app qui sotto per iniziare.</td></tr>`;
        }
        if (tbodyDis && nDis === 0 && !tbodyDis.querySelector('td[colspan]')) {
            tbodyDis.innerHTML = `<tr><td colspan="6" style="padding:20px;text-align:center;color:#9B9B9B;font-style:italic;">Tutte le app attive sono già in monitoraggio.</td></tr>`;
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
        // Riapri il modal con la nuova sorgente dati (dati già in memoria: niente reload)
        const modal = document.getElementById('sp-config-modal');
        if (modal) modal.remove();
        this.openConfig({ reload: false });
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

            // Rigenera il modal con la nuova app (già in memoria: niente reload)
            const modal = document.getElementById('sp-config-modal');
            if (modal) modal.remove();
            this.openConfig({ reload: false });

        } catch (error) {
            UI.hideLoading();
            console.error('[StoricoPush] Errore creazione app:', error);
            UI.showError('Errore nella creazione dell\'app: ' + error.message);
        }
    },

    // ================================================================
    // Alert Monitoraggio
    // ================================================================

    // Pannello "Stato monitoraggio": salute di TUTTE le app monitorate a colpo
    // d'occhio, calcolata dai campi già presenti sul doc app (0 letture Firestore
    // extra, invece di ~2 query x 103 app della versione precedente).
    async loadMonitorAlerts() {
        const container = document.getElementById('sp-monitor-alerts');
        if (!container) return;

        try {
            const monitorate = (this.apps || []).filter(a => !!a.pushMonitorEnabled);
            if (monitorate.length === 0) { container.style.display = 'none'; return; }

            const rank = { error: 0, never: 1, warn: 2, ok: 3 };
            const items = monitorate
                .map(a => ({ app: a, health: this._computeHealth(a) }))
                .sort((x, y) => {
                    const r = rank[x.health.level] - rank[y.health.level];
                    if (r !== 0) return r;
                    return (x.app.comune || x.app.nome || '').localeCompare(y.app.comune || y.app.nome || '', 'it');
                });

            const c = { ok: 0, warn: 0, error: 0, never: 0 };
            items.forEach(it => { c[it.health.level]++; });
            const problemi = items.filter(it => it.health.level !== 'ok');

            // Colore header in base al problema più grave
            let hBg = '#E2F8DE', hColor = '#2f8a29', hIcon = 'fa-check-circle';
            let hText = 'Tutte le ' + monitorate.length + ' app monitorate stanno sincronizzando correttamente';
            if (c.error > 0) {
                hBg = '#FFEBEE'; hColor = '#D32F2F'; hIcon = 'fa-exclamation-triangle';
                hText = c.error + (c.error === 1 ? ' app con problema critico' : ' app con problemi critici')
                      + ((c.warn + c.never) > 0 ? (' + ' + (c.warn + c.never) + ' da controllare') : '');
            } else if (c.warn > 0 || c.never > 0) {
                hBg = '#FFF8E1'; hColor = '#C77700'; hIcon = 'fa-exclamation-circle';
                hText = (c.warn + c.never) + ' app da tenere d\'occhio su ' + monitorate.length;
            }

            const pill = (n, cls, label) => n > 0
                ? '<span class="sp-sum-pill ' + cls + '">' + n + ' ' + label + '</span>'
                : '';

            let html = ''
              + '<div class="sp-alert-summary" style="background:' + hBg + ';color:' + hColor + ';">'
              +   '<span class="sp-sum-left"><i class="fas ' + hIcon + '"></i> ' + this.escapeHtml(hText) + '</span>'
              +   '<span class="sp-sum-counts">'
              +     pill(c.error, 'error', 'critiche')
              +     pill(c.never, 'never', 'mai sincr.')
              +     pill(c.warn, 'warn', 'avvisi')
              +     pill(c.ok, 'ok', 'ok')
              +   '</span>'
              +   '<span class="sp-sum-actions">'
              +     '<button class="sp-mini-btn" onclick="StoricoPush.refreshMonitorAlerts(this)"><i class="fas fa-rotate"></i> Aggiorna</button>'
              +     '<button class="sp-mini-btn" id="sp-health-toggle-btn" onclick="StoricoPush.toggleHealthGrid(this)"><i class="fas fa-table-cells-large"></i> ' + (problemi.length ? 'Vedi tutte' : 'Mostra elenco') + '</button>'
              +     '<button class="sp-mini-btn" onclick="StoricoPush.openConfig()"><i class="fas fa-cog"></i> Configura</button>'
              +   '</span>'
              + '</div>';

            // Griglia salute di TUTTE le app (aperta se ci sono problemi, altrimenti chiusa)
            const chipFor = (it) => {
                const a = it.app, h = it.health;
                const name = a.comune || a.nome || a.appSlug || a.id;
                const slug = this._normalizeSlug(a.appSlug || '');
                return '<span class="sp-health-chip ' + h.level + '" title="' + this._attr(name + ' — ' + h.label + ': ' + h.hint) + '" '
                     + 'onclick="StoricoPush.focusApp(\'' + slug + '\')">'
                     + '<span class="hc-dot"></span><span class="hc-name">' + this.escapeHtml(name) + '</span></span>';
            };
            const gridOpen = problemi.length > 0;
            html += '<div class="sp-health-grid" id="sp-health-grid" style="' + (gridOpen ? '' : 'display:none;') + '">'
                  + items.map(chipFor).join('') + '</div>';

            // Card azionabili solo per le app con problemi
            problemi.forEach(it => {
                const a = it.app, h = it.health;
                const slug = this._normalizeSlug(a.appSlug || '');
                const name = a.comune || a.nome || a.appSlug || a.id;
                const cls = h.level === 'error' ? 'alert-error' : (h.level === 'never' ? 'alert-never' : 'alert-warn');
                const icon = h.level === 'error' ? 'fa-times-circle' : (h.level === 'never' ? 'fa-hourglass-half' : 'fa-exclamation-triangle');
                const lastSync = a.lastPushSync ? this._relTime(a.lastPushSync) : 'mai';

                const details = '<div class="alert-details">'
                    + '<span><i class="fas fa-sync-alt"></i> Sync: ' + this.escapeHtml(lastSync) + '</span>'
                    + (typeof a.consensiPush === 'number' ? '<span><i class="fas fa-users"></i> ' + a.consensiPush + ' consensi push</span>' : '')
                    + '</div>';

                const acts = '<div class="alert-actions">'
                    + (slug ? '<button class="sp-mini-btn solid" onclick="StoricoPush.syncApp(\'' + slug + '\', this)"><i class="fas fa-sync-alt"></i> Sincronizza</button>' : '')
                    + (slug ? '<button class="sp-mini-btn" onclick="StoricoPush.openArchive(\'' + slug + '\')"><i class="fas fa-external-link-alt"></i> Apri archivio</button>' : '')
                    + '<button class="sp-mini-btn" onclick="StoricoPush.openConfig()"><i class="fas fa-cog"></i> Configura</button>'
                    + '</div>';

                html += '<div class="sp-alert-card ' + cls + '">'
                      + '<div class="alert-icon"><i class="fas ' + icon + '"></i></div>'
                      + '<div class="alert-body">'
                      + '<div class="alert-app-name">' + this.escapeHtml(name) + ' <span style="font-weight:600;color:#999;">· ' + this.escapeHtml(h.label) + '</span></div>'
                      + '<div class="alert-message">' + this.escapeHtml(h.hint) + '</div>'
                      + details + acts
                      + '</div></div>';
            });

            container.innerHTML = html;
            container.style.display = 'block';

        } catch (error) {
            console.warn('[StoricoPush] Errore caricamento alert:', error);
            container.style.display = 'none';
        }
    },

    // Ricarica lo stato reale delle app e ridisegna il pannello salute
    async refreshMonitorAlerts(btn) {
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aggiorno'; }
        try { await this._reloadAppsFresh(); } catch (e) { /* in caso di errore uso i dati in memoria */ }
        // loadMonitorAlerts ridisegna l'intero pannello (il bottone verrà ricreato)
        await this.loadMonitorAlerts();
    },

    toggleHealthGrid(btn) {
        const grid = document.getElementById('sp-health-grid');
        if (!grid) return;
        const show = grid.style.display === 'none';
        grid.style.display = show ? 'flex' : 'none';
        const b = btn || document.getElementById('sp-health-toggle-btn');
        if (b) b.innerHTML = '<i class="fas fa-table-cells-large"></i> ' + (show ? 'Nascondi elenco' : 'Vedi tutte');
    },

    // Click su un chip di salute → filtra la lista notifiche per quel comune
    focusApp(slug) {
        const s = this._normalizeSlug(slug);
        if (!s) return;
        const sel = document.getElementById('sp-filter-app');
        if (sel) {
            const opt = Array.from(sel.options).find(o => o.value === s);
            if (opt && !opt.disabled) { sel.value = s; this.applyFilters(); }
        }
        const list = document.getElementById('sp-list');
        if (list && list.scrollIntoView) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

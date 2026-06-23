/**
 * Report GoodBarber Page Module
 * Analytics and ranking of all apps using GoodBarber API stats
 * CRM Comune.Digital by Growapp S.r.l.
 *
 * Changelog:
 *  - Fix Top/Bottom: le liste "Top" e "Da Migliorare" ora sono sempre
 *    disgiunte (prima, con meno di 20 app attive, mostravano le stesse app).
 *  - Fix KPI "App Attive": ora mostra il numero reale di app attive, con
 *    sotto-dato "N con statistiche" (prima contava solo quelle con API GB).
 *  - Fix modal aggiornamento: rimosso sempre via finally, anche in errore
 *    (prima l'overlay restava a coprire lo schermo se l'update falliva).
 */

const ReportGoodBarber = {
  // Icona Comune.Digital (cubo bianco) inline, per il footer della Report Card
  _cdIconBase64: 'data:image/png;base64,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',
  // State
  allApps: [],
  allStats: {},
  filteredApps: [],
  sortKey: 'score',
  sortOrder: 'desc',
  currentFilters: {
    regione: null,
    gestione: null,
    searchQuery: ''
  },

  /**
   * Main render method - entry point
   */
  async render() {
    try {
      UI.showLoading();
      this._sortListenersAttached = false; // Reset per ri-render completo

      // Load all apps — SOLO le ATTIVA
      const tutteLeApp = await DataService.getApps();
      let appAttive = tutteLeApp.filter(a => a.statoApp === 'ATTIVA');

      // 🔒 Filtro Agente: mostra solo le app dei propri clienti
      if (AuthService.canViewOnlyOwnData()) {
        const agenteNome = AuthService.getAgenteFilterName();
        if (agenteNome) {
          try {
            const clientiAgente = await DataService.getClienti({ agente: agenteNome });
            const clienteIds = new Set();
            clientiAgente.forEach(c => {
              if (c.id) clienteIds.add(c.id);
              if (c.clienteIdLegacy) clienteIds.add(c.clienteIdLegacy);
            });
            appAttive = appAttive.filter(a => {
              if (a.clientePaganteId && clienteIds.has(a.clientePaganteId)) return true;
              if (a.clienteId && clienteIds.has(a.clienteId)) return true;
              return false;
            });
            console.log(`📊 Report Agente "${agenteNome}": ${appAttive.length} app filtrate su ${tutteLeApp.length} totali`);
          } catch (e) {
            console.warn('Errore filtro agente nel report:', e);
          }
        }
      }

      this.allApps = appAttive;

      // Auto-fill popolazione da ISTAT per le app che hanno il comune ma non la popolazione
      await this.autoFillPopolazioneISTAT();

      // Initialize filtered apps
      this.filteredApps = [...this.allApps];

      // Render the page structure
      this.renderPage();

      // Populate stats from cache and calculate scores
      await this.loadAndCalculateStats();

      // Render KPIs
      this.renderKPICards();

      // Render filters
      this.renderFilters();

      // Render table
      this.renderRankingTable();

      // Render top/bottom sections
      this.renderTopBottomSections();

      UI.hideLoading();
    } catch (error) {
      console.error('Error rendering report:', error);
      UI.showError('Errore nel caricamento del report');
      UI.hideLoading();
    }
  },

  /**
   * Auto-fill popolazione da database ISTAT per tutte le app che hanno
   * il campo "comune" compilato ma "popolazione" vuota.
   * Salva direttamente su Firestore così il dato resta persistente.
   */
  async autoFillPopolazioneISTAT() {
    try {
      await ComuniService.load();

      let aggiornate = 0;
      for (const app of this.allApps) {
        // Se l'app ha un comune ma non la popolazione, cerca nel database ISTAT
        if (app.comune && (!app.popolazione || app.popolazione === 0)) {
          const comune = await ComuniService.trovaPeNome(app.comune);
          if (comune && comune.numResidenti > 0) {
            app.popolazione = comune.numResidenti;
            // Salva su Firestore in background (non attendiamo)
            DataService.updateApp(app.id, { popolazione: comune.numResidenti }).catch(err => {
              console.warn('Errore salvataggio popolazione per', app.nome, err);
            });
            aggiornate++;
          }
        }
      }

      if (aggiornate > 0) {
        console.log(`Popolazione ISTAT auto-compilata per ${aggiornate} app`);
      }
    } catch (error) {
      console.warn('Errore auto-fill popolazione ISTAT:', error);
    }
  },

  /**
   * Render page structure
   */
  renderPage() {
    const pageContent = `
      <style>
        .rpt-page { max-width: 1400px; margin: 0 auto; padding: 0 1rem; }

        /* Header */
        .rpt-header {
          display: flex; justify-content: space-between; align-items: center;
          flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;
          padding-bottom: 1rem; border-bottom: 2px solid var(--grigio-300);
        }
        .rpt-header h1 {
          font-size: 1.5rem; font-weight: 900; color: var(--blu-700); margin: 0;
          font-family: 'Titillium Web', sans-serif;
        }
        .rpt-header h1 i { margin-right: 0.5rem; }
        .rpt-header .rpt-subtitle {
          font-size: 0.8rem; color: var(--grigio-500); margin-top: 0.25rem;
        }
        .rpt-btn-update {
          background: linear-gradient(135deg, var(--blu-700), var(--blu-500));
          color: #fff; border: none; border-radius: 10px; padding: 0.65rem 1.25rem;
          font-size: 0.9rem; font-weight: 600; cursor: pointer;
          font-family: 'Titillium Web', sans-serif;
          transition: all 0.2s; box-shadow: 0 2px 8px rgba(20,82,132,0.3);
        }
        .rpt-btn-update:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(20,82,132,0.4); }

        /* KPI Grid */
        .rpt-kpi-grid {
          display: grid; grid-template-columns: repeat(5, 1fr); gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .rpt-kpi {
          background: #fff; border-radius: 12px; padding: 1.25rem 1rem;
          box-shadow: 0 1px 4px rgba(0,0,0,0.06);
          border-left: 4px solid var(--blu-300);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .rpt-kpi:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .rpt-kpi-label {
          font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.5px; color: var(--grigio-500); margin-bottom: 0.5rem;
        }
        .rpt-kpi-value {
          font-size: 1.75rem; font-weight: 900; color: var(--blu-900);
          font-family: 'Titillium Web', sans-serif; line-height: 1;
        }
        .rpt-kpi-icon {
          font-size: 1.1rem; margin-bottom: 0.5rem; opacity: 0.8;
        }
        .rpt-kpi.green  { border-left-color: var(--verde-700); }
        .rpt-kpi.blue   { border-left-color: var(--blu-700); }
        .rpt-kpi.amber  { border-left-color: var(--giallo-avviso); }
        .rpt-kpi.teal   { border-left-color: #0288D1; }
        .rpt-kpi.dark   { border-left-color: var(--blu-900); }

        /* Filters */
        .rpt-filters {
          display: flex; gap: 1rem; flex-wrap: wrap; align-items: flex-end;
          margin-bottom: 1.5rem; padding: 1rem;
          background: var(--grigio-100); border-radius: 10px;
        }
        .rpt-filter-group { flex: 1; min-width: 160px; }
        .rpt-filter-group label {
          display: block; font-size: 0.75rem; font-weight: 700;
          color: var(--grigio-500); text-transform: uppercase;
          letter-spacing: 0.5px; margin-bottom: 0.35rem;
        }
        .rpt-filter-select {
          width: 100%; padding: 0.5rem 0.75rem; border: 1px solid var(--grigio-300);
          border-radius: 8px; font-size: 0.875rem; background: #fff;
          font-family: 'Titillium Web', sans-serif; color: var(--grigio-900);
        }
        .rpt-filter-select:focus, .rpt-filter-input:focus { border-color: var(--blu-500); outline: none; box-shadow: 0 0 0 2px rgba(46,109,168,0.2); }
        .rpt-filter-input {
          width: 100%; padding: 0.5rem 0.75rem 0.5rem 2rem; border: 1px solid var(--grigio-300);
          border-radius: 8px; font-size: 0.875rem; background: #fff;
          font-family: 'Titillium Web', sans-serif; color: var(--grigio-900);
        }
        .rpt-search-wrap { position: relative; }
        .rpt-search-wrap i {
          position: absolute; left: 0.65rem; top: 50%; transform: translateY(-50%);
          color: var(--grigio-500); font-size: 0.8rem; pointer-events: none;
        }
        .rpt-btn-reset {
          background: none; border: 1px solid var(--grigio-300); border-radius: 8px;
          padding: 0.5rem 1rem; font-size: 0.8rem; color: var(--grigio-700);
          cursor: pointer; font-family: 'Titillium Web', sans-serif; transition: all 0.2s;
        }
        .rpt-btn-reset:hover { border-color: var(--rosso-errore); color: var(--rosso-errore); }

        /* Table */
        .rpt-section-title {
          font-size: 1.1rem; font-weight: 700; color: var(--blu-700);
          margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem;
        }
        .rpt-table-wrap {
          overflow-x: auto; border-radius: 10px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.06); background: #fff;
        }
        .rpt-table {
          width: 100%; border-collapse: collapse; font-size: 0.8rem;
          table-layout: fixed;
        }
        .rpt-table thead th {
          background: var(--blu-900); color: #fff;
          padding: 0.6rem 0.5rem; text-align: left; font-weight: 600;
          font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.3px;
          white-space: nowrap; cursor: pointer; user-select: none;
          position: sticky; top: 0;
        }
        .rpt-table thead th:hover { background: var(--blu-700); }
        .rpt-table thead th.sorted-asc::after { content: ' \\25B2'; font-size: 0.55rem; }
        .rpt-table thead th.sorted-desc::after { content: ' \\25BC'; font-size: 0.55rem; }
        .rpt-table tbody tr {
          border-bottom: 1px solid var(--grigio-100); transition: background 0.15s;
        }
        .rpt-table tbody tr:hover { background: var(--blu-100); cursor: pointer; }
        .rpt-table tbody td {
          padding: 0.55rem 0.5rem; color: var(--grigio-900); white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis;
        }
        .rpt-table .col-rank { text-align: center; width: 32px; font-weight: 700; color: var(--grigio-500); }
        .rpt-table tbody .col-nome { font-weight: 700; color: var(--blu-900); max-width: 200px; overflow: hidden; text-overflow: ellipsis; }
        .rpt-table .col-regione { width: 70px; max-width: 70px; overflow: hidden; text-overflow: ellipsis; font-size: 0.75rem; }
        .rpt-table .col-score { text-align: center; width: 60px; }
        .rpt-table .col-downloads,
        .rpt-table .col-consensi,
        .rpt-table .col-penetrazione,
        .rpt-table .col-lanci,
        .rpt-table .col-pageviews,
        .rpt-table .col-popolazione { text-align: right; font-variant-numeric: tabular-nums; width: 80px; }

        .rpt-badge {
          display: inline-block; padding: 0.2rem 0.6rem; border-radius: 20px;
          font-size: 0.8rem; font-weight: 700; min-width: 36px; text-align: center;
        }
        .rpt-badge-success { background: var(--verde-100); color: var(--verde-900); }
        .rpt-badge-warning { background: #FFF3CD; color: #856404; }
        .rpt-badge-danger  { background: #FDECEA; color: var(--rosso-errore); }

        /* Top / Bottom 5 */
        .rpt-tb-container {
          display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;
          margin-top: 1.5rem;
        }
        .rpt-tb-section { background: #fff; border-radius: 12px; padding: 1.25rem; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
        .rpt-tb-title {
          font-size: 1rem; font-weight: 700; margin-bottom: 1rem;
          display: flex; align-items: center; gap: 0.5rem;
        }
        .rpt-tb-item {
          display: flex; align-items: center; gap: 0.75rem;
          padding: 0.6rem 0; border-bottom: 1px solid var(--grigio-100);
        }
        .rpt-tb-item:last-child { border-bottom: none; }
        .rpt-tb-rank {
          width: 28px; height: 28px; border-radius: 50%; display: flex;
          align-items: center; justify-content: center; font-size: 0.75rem;
          font-weight: 700; flex-shrink: 0;
        }
        .rpt-tb-rank.top { background: var(--verde-100); color: var(--verde-900); }
        .rpt-tb-rank.bottom { background: #FDECEA; color: var(--rosso-errore); }
        .rpt-tb-info { flex: 1; min-width: 0; }
        .rpt-tb-name { font-weight: 600; font-size: 0.875rem; color: var(--grigio-900); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rpt-tb-score { font-size: 0.75rem; color: var(--grigio-500); }
        .rpt-tb-bar { flex: 0 0 100px; height: 6px; background: var(--grigio-100); border-radius: 3px; overflow: hidden; }
        .rpt-tb-bar-fill { height: 100%; border-radius: 3px; transition: width 0.5s ease; }

        /* Progress modal */
        .rpt-progress-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.5); display: flex; align-items: center;
          justify-content: center; z-index: 9999;
        }
        .rpt-progress-box {
          background: #fff; border-radius: 12px; padding: 2rem;
          min-width: 320px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        .rpt-progress-box h3 { margin: 0 0 1rem; color: var(--blu-700); font-size: 1.1rem; }
        .rpt-progress-track { height: 8px; background: var(--grigio-100); border-radius: 4px; overflow: hidden; margin-bottom: 0.75rem; }
        .rpt-progress-fill { height: 100%; background: linear-gradient(90deg, var(--blu-700), var(--verde-700)); border-radius: 4px; transition: width 0.3s; }
        .rpt-progress-text { font-size: 0.875rem; color: var(--grigio-500); }

        /* Responsive */
        @media (max-width: 1024px) {
          .rpt-kpi-grid { grid-template-columns: repeat(3, 1fr); }
          .rpt-tb-container { grid-template-columns: 1fr; }
        }
        @media (max-width: 768px) {
          .rpt-kpi-grid { grid-template-columns: repeat(2, 1fr); }
          .rpt-header { flex-direction: column; align-items: flex-start; }
          .rpt-kpi-value { font-size: 1.4rem; }
          .rpt-filters { flex-direction: column; }

          /* ── TABELLA → CARD MOBILE ────────────────────── */
          .rpt-table-wrap { overflow-x: hidden; }
          .rpt-table { table-layout: auto; display: block; }
          .rpt-table thead { display: none; }
          .rpt-table tbody { display: block; }
          .rpt-table tbody tr {
            display: flex; flex-wrap: wrap; align-items: center;
            padding: 0.55rem 0.5rem;
            border-bottom: 1px solid var(--grigio-300);
          }
          .rpt-table tbody tr:hover { background: var(--blu-100); }

          /* Reset tutte le celle */
          .rpt-table tbody td {
            width: auto !important; max-width: none !important;
            padding: 0 !important; white-space: nowrap;
          }

          /* Nascondi tutto tranne rank, nome, score, downloads, push */
          .rpt-table tbody td.col-regione,
          .rpt-table tbody td.col-penetrazione,
          .rpt-table tbody td.col-lanci,
          .rpt-table tbody td.col-pageviews,
          .rpt-table tbody td.col-popolazione,
          .rpt-table tbody td.col-card,
          .rpt-table thead th.col-card { display: none !important; }

          /* RIGA 1: rank + nome + score */
          .rpt-table tbody td.col-rank {
            order: 1; flex: 0 0 22px;
            font-size: 0.72rem; color: var(--grigio-500); font-weight: 700;
            text-align: center;
          }
          .rpt-table tbody td.col-nome {
            order: 2; flex: 1 1 0; min-width: 0;
            font-size: 0.82rem; font-weight: 700; color: var(--blu-900);
            overflow: hidden; text-overflow: ellipsis;
            padding: 0 0.3rem !important;
          }
          .rpt-table tbody td.col-score {
            order: 3; flex: 0 0 auto;
          }

          /* RIGA 2: downloads a sinistra, push a destra */
          /* flex-basis 50% forza il wrap perché riga 1 è già piena */
          .rpt-table tbody td.col-downloads {
            order: 4; flex: 0 0 50%;
            margin-top: 3px; padding-left: 22px !important;
            font-size: 0.7rem; color: var(--grigio-700);
            text-align: left;
          }
          .rpt-table tbody td.col-consensi {
            order: 5; flex: 0 0 auto;
            margin-top: 3px; margin-left: auto;
            font-size: 0.7rem; color: var(--grigio-700);
            text-align: right; padding-right: 0.3rem !important;
          }

          /* Etichette inline */
          .rpt-table tbody td.col-downloads::before { content: 'Downloads '; font-weight: 600; color: var(--grigio-500); }
          .rpt-table tbody td.col-consensi::before { content: 'Push '; font-weight: 600; color: var(--grigio-500); }

          /* Badge score più piccolo su mobile */
          .rpt-badge { font-size: 0.68rem; padding: 0.15rem 0.45rem; min-width: 26px; }

          /* Top/Bottom cards */
          .rpt-tb-container { grid-template-columns: 1fr; }
        }
      </style>

      <div class="rpt-page">
        <div class="rpt-header">
          <div>
            <h1><i class="fas fa-chart-bar"></i> Report App — Analytics</h1>
            <div class="rpt-subtitle" id="lastUpdateSubtitle">Ultimo aggiornamento: mai</div>
          </div>
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
            <button class="rpt-btn-update" id="goAggiornaPush" style="background:var(--verde-700);"
                    title="Aggiorna i consensi push delle app">
              <i class="fas fa-bell"></i> Consensi Push
            </button>
            <button class="rpt-btn-update" id="updateAllButton">
              <i class="fas fa-sync-alt"></i> Aggiorna Tutti i Dati
            </button>
          </div>
        </div>

        <div class="rpt-kpi-grid" id="kpiContainer"></div>

        <div id="filtersSection"></div>

        <div>
          <div class="rpt-section-title"><i class="fas fa-trophy"></i> Ranking App</div>
          <div class="rpt-table-wrap">
            <table class="rpt-table" id="rankingTable">
              <thead>
                <tr>
                  <th class="col-rank" data-sort="rank">#</th>
                  <th class="col-nome" data-sort="nome">Nome App</th>
                  <th class="col-regione" data-sort="regione">Regione</th>
                  <th class="col-score" data-sort="score">Score</th>
                  <th class="col-downloads" data-sort="downloads">Downloads</th>
                  <th class="col-consensi" data-sort="pushConsents">Cons. Push</th>
                  <th class="col-penetrazione" data-sort="penetrazione">Penetraz.</th>
                  <th class="col-lanci" data-sort="launchesMonth">Lanci/m</th>
                  <th class="col-pageviews" data-sort="pageViewsMonth">Views/m</th>
                  <th class="col-popolazione" data-sort="popolazione">Abitanti</th>
                  <th class="col-card" style="width:40px;text-align:center;" title="Genera Report Card"><i class="fas fa-image" style="color:var(--grigio-500);"></i></th>
                </tr>
              </thead>
              <tbody id="rankingTableBody"></tbody>
            </table>
          </div>
        </div>

        <div class="rpt-tb-container" id="topBottomContainer">
          <div class="rpt-tb-section" id="top5Section"></div>
          <div class="rpt-tb-section" id="bottom5Section"></div>
        </div>
      </div>
    `;

    const mainContent = document.getElementById('mainContent');
    mainContent.innerHTML = pageContent;

    // Attach event listeners
    document.getElementById('updateAllButton').addEventListener('click', () => this.updateAllData());
    document.getElementById('goAggiornaPush')?.addEventListener('click', () => UI.showPage('aggiorna-push'));
  },

  /**
   * Load stats from cache and calculate scores
   */
  async loadAndCalculateStats() {
    try {
      this.allStats = {};
      let latestUpdate = null;

      for (const app of this.allApps) {
        if (app.goodbarberWebzineId && app.goodbarberToken && app.gbStatsCache) {
          const cache = app.gbStatsCache;
          this.allStats[app.id] = cache;

          // Track latest update
          if (cache.lastUpdate) {
            const updateTime = new Date(cache.lastUpdate);
            if (!latestUpdate || updateTime > latestUpdate) {
              latestUpdate = updateTime;
            }
          }
        } else {
          this.allStats[app.id] = {
            totalDownloads: app.numDownloads || 0,
            launchesMonth: 0,
            uniqueLaunchesMonth: 0,
            pageViewsMonth: 0,
            lastUpdate: null
          };
        }

        // Calculate score for each app
        app.score = this.calcolaScore(app, this.allStats[app.id]);
        app.penetrazione = this.calcolaPenetrazione(app, this.allStats[app.id]);
      }

      // Update subtitle with last update time
      if (latestUpdate) {
        const formattedDate = latestUpdate.toLocaleString('it-IT');
        document.getElementById('lastUpdateSubtitle').textContent = `Ultimo aggiornamento: ${formattedDate}`;
      }

      // Apply filters and sort
      this.applyFiltersAndSort();
    } catch (error) {
      console.error('Error loading stats:', error);
      throw error;
    }
  },

  /**
   * Calculate penetration percentage
   */
  calcolaPenetrazione(app, stats) {
    if (!app.popolazione || app.popolazione === 0) return 0;
    const downloads = stats.totalDownloads || 0;
    return Math.min(100, (downloads / app.popolazione) * 100);
  },

  /**
   * Calcola lo score di un'app (0-100) come media ponderata di 6 componenti.
   *
   * COMPONENTI E PESI:
   *   30% Penetrazione     – downloads / popolazione
   *   25% Retention         – utenti unici attivi / downloads (con scala logaritmica)
   *   15% Engagement        – pagine viste per sessione
   *   15% Opt-in Push       – consensi push / downloads
   *   10% Qualità Turistica – SOLO se indiceTuristicita > 0, pushRatio pesato
   *    5% Momentum Crescita – velocità download/mese rapportata alla popolazione
   *
   * CORRETTIVO VOLUME (soglia minima download):
   *   Le metriche basate su rapporti (retention, optInPush) sono statisticamente
   *   instabili con pochi download. Es: 16/29 = 55% non è significativo come
   *   2649/7331 = 36%. Per evitare che micro-app con pochi utenti ottengano
   *   score gonfiati, applichiamo un fattore di smorzamento:
   *     volumeFactor = min(1, log10(downloads) / log10(SOGLIA))
   *   dove SOGLIA = 100 download. Sotto i 100 download, i rapporti vengono
   *   ridotti proporzionalmente. Es: 29 download → factor 0.73 → il 55% diventa 40%.
   *
   * RETENTION con scala logaritmica:
   *   Il rapporto grezzo uniqueLaunches/downloads penalizza le app grandi
   *   (impossibile che tutti i 7000 utenti usino l'app ogni mese).
   *   Applichiamo una normalizzazione logaritmica che tiene conto del volume:
   *     retention = rawRetention * volumeFactor
   *   Così un retention 93% con 29 download (volumeFactor 0.73) diventa 68%,
   *   mentre un retention 27% con 7331 download (volumeFactor 1.0) resta 27%
   *   ma ha un peso strutturalmente più solido.
   *
   * QUALITÀ TURISTICA (10%):
   *   Attiva SOLO quando indiceTuristicita > 0. Se il comune non è turistico,
   *   il peso viene redistribuito agli altri componenti.
   *   Il pushRatio (consensiPush/downloads) pesato per turistFactor misura
   *   quanto i download sono "reali" vs "turisti di passaggio".
   *
   * MOMENTUM DI CRESCITA (5%):
   *   Velocità download/mese vs target proporzionale alla popolazione.
   */
  /**
   * Algoritmo di scoring v3 — Più generoso e bilanciato
   *
   * Tre miglioramenti rispetto a v1:
   * 1. Correzione turistica: per comuni turistici, i download "in eccesso"
   *    rispetto alla popolazione vengono scontati dal denominatore di
   *    retention e optInPush (30-60% in base all'indice di turisticità).
   * 2. Bonus Volume (10%): premia i numeri assoluti di download con scala
   *    logaritmica. 500 DL ≈ 65pt, 2000 DL ≈ 79pt, 15.000+ DL = 100pt.
   * 3. Curva sqrt sulla penetrazione + engagement più morbido (sat a 7 pag/sessione).
   *    La penetrazione al 50% vale ~71 punti invece di 50.
   *
   * Pesi: Penetraz 22%, Retention 20%, OptInPush 19%, Engagement 13%,
   *        QualitàTuristica 10%, VolumBonus 8%, Momentum 8%, BonusFloor 5%
   */
  calcolaScore(app, stats) {
    try {
      const popolazione = app.popolazione || 1;
      const downloads = stats.totalDownloads || 0;
      const launchesMonth = stats.launchesMonth || 0;
      const uniqueLaunchesMonth = stats.uniqueLaunchesMonth || 0;
      const pageViewsMonth = stats.pageViewsMonth || 0;
      const consensiPush = app.consensiPush || 0;
      const turisticita = app.indiceTuristicita || 0;

      // ── FATTORE DI VOLUME (soglia minima download) ─────────────
      // Smorza i rapporti quando i download sono pochi (<100).
      const SOGLIA_DOWNLOAD = 100;
      const volumeFactor = downloads > 0
        ? Math.min(1, Math.log10(downloads) / Math.log10(SOGLIA_DOWNLOAD))
        : 0;

      // ── CORREZIONE TURISTICA SUL DENOMINATORE ──────────────────
      // Per i comuni turistici, i download "in eccesso" rispetto alla
      // popolazione diluiscono ingiustamente retention e optInPush.
      // Scontiamo dal 30% al 60% dell'eccesso in base alla turisticità.
      let downloadEffettivi = downloads;
      if (turisticita > 0 && downloads > popolazione * 0.5) {
        const eccesso = downloads - popolazione * 0.5;
        if (eccesso > 0) {
          const scontoFraction = 0.3 + (turisticita / 10) * 0.3; // range: 0.3 a 0.6
          downloadEffettivi = Math.max(popolazione * 0.5, downloads - (eccesso * scontoFraction));
        }
      }

      // ── 22% PENETRAZIONE (curva sqrt, più generosa) ────────────
      // sqrt rende la curva più morbida: 50% penetraz → ~71 punti
      // 25% penetraz → ~50 punti, 100% penetraz → 100 punti
      const rawPenetrazione = Math.min(1, downloads / popolazione);
      const penetrazione = Math.sqrt(rawPenetrazione) * 100;

      // ── 20% RETENTION (con denominatore corretto) ──────────────
      // Utenti unici mensili / downloadEffettivi (corretto per turismo).
      let retention = 0;
      if (downloadEffettivi > 0 && uniqueLaunchesMonth > 0) {
        const rawRetention = Math.min(100, (uniqueLaunchesMonth / downloadEffettivi) * 100);
        retention = rawRetention * volumeFactor;
      }

      // ── 13% ENGAGEMENT (saturazione a 7 pag/sessione) ──────────
      // Più generoso: 7+ pagine per sessione = 100 punti (era 10).
      let engagement = 0;
      if (launchesMonth > 0) {
        const pagesPerSession = pageViewsMonth / launchesMonth;
        engagement = Math.min(100, (pagesPerSession / 7) * 100);
      }

      // ── 19% OPT-IN PUSH (con denominatore corretto) ───────────
      // Rapporto consensiPush / downloadEffettivi, smorzato dal volumeFactor.
      let optInPush = 0;
      if (downloadEffettivi > 0 && consensiPush > 0) {
        const rawOptIn = Math.min(100, (consensiPush / downloadEffettivi) * 100);
        optInPush = rawOptIn * volumeFactor;
      }

      // ── 10% BONUS VOLUME (NUOVO) ──────────────────────────────
      // Premia i numeri assoluti di download con scala logaritmica.
      // 50 DL ≈ 41pt, 500 DL ≈ 65pt, 2.000 DL ≈ 79pt,
      // 10.000 DL ≈ 96pt, 15.000+ DL = 100pt
      let volumeBonus = 0;
      if (downloads > 0) {
        const VOLUME_MAX = 15000;
        volumeBonus = Math.min(100, (Math.log10(downloads) / Math.log10(VOLUME_MAX)) * 100);
      }

      // ── 10% QUALITÀ TURISTICA ─────────────────────────────────
      // ATTIVA SOLO se indiceTuristicita > 0.
      // Base = turisticità * 10 (max 100), modulato da engagement
      // e push ratio per premiare i comuni turistici che funzionano.
      let qualitaTuristica = 0;
      if (turisticita > 0) {
        let base = turisticita * 10; // 0 a 100
        // Bonus engagement turistico: se i turisti usano l'app
        if (launchesMonth > 0 && downloads > 0) {
          const launchRatio = Math.min(1, launchesMonth / (downloads * 2));
          base = base * (0.5 + launchRatio * 0.5);
        }
        // Bonus push: se accettano le notifiche
        if (downloadEffettivi > 0 && consensiPush > 0) {
          const pushBoost = Math.min(1, consensiPush / downloadEffettivi);
          base = base * (0.7 + pushBoost * 0.3);
        }
        qualitaTuristica = Math.min(100, base);
      }

      // ── 8% MOMENTUM DI CRESCITA ───────────────────────────────
      // Velocità download/mese vs target proporzionale alla popolazione.
      // CAP a 36 mesi (3 anni): dopo 3 anni la data di lancio non penalizza più.
      // Un'app di 5 anni viene trattata come se fosse online da 3 anni.
      let momentum = 0;
      if (app.dataLancioApp && downloads > 0) {
        const launchDate = new Date(app.dataLancioApp);
        const now = new Date();
        const monthsOnline = Math.min(36, Math.max(1,
          (now.getFullYear() - launchDate.getFullYear()) * 12 +
          (now.getMonth() - launchDate.getMonth())
        ));
        const velocity = downloads / monthsOnline;
        const targetVelocity = Math.max(3, popolazione * 0.001);
        momentum = Math.min(100, (velocity / targetVelocity) * 100);
      }

      // ── 5% BONUS FLOOR ────────────────────────────────────────
      // Piccolo bonus che alza il pavimento per tutte le app con
      // attività reale. Basato su sqrt(downloads) normalizzato.
      // Garantisce che app con attività non finiscano troppo in basso.
      let bonusFloor = 0;
      if (downloads > 10) {
        bonusFloor = Math.min(100, Math.sqrt(downloads) / Math.sqrt(500) * 60 + 20);
      }

      // ── SCORE FINALE (media ponderata dinamica) ────────────────
      // Se un dato non è disponibile, il suo peso viene redistribuito.
      const components = [
        { value: penetrazione,     weight: 0.22, available: downloads > 0 || popolazione > 1 },
        { value: retention,        weight: 0.20, available: uniqueLaunchesMonth > 0 },
        { value: engagement,       weight: 0.13, available: launchesMonth > 0 },
        { value: optInPush,        weight: 0.19, available: downloadEffettivi > 0 && consensiPush > 0 },
        { value: volumeBonus,      weight: 0.08, available: downloads > 0 },
        { value: qualitaTuristica, weight: 0.10, available: turisticita > 0 },
        { value: momentum,         weight: 0.08, available: momentum > 0 },
        { value: bonusFloor,       weight: 0.05, available: downloads > 10 }
      ];

      const activeComponents = components.filter(c => c.available);
      if (activeComponents.length === 0) return 0;

      const totalActiveWeight = activeComponents.reduce((s, c) => s + c.weight, 0);
      const score = activeComponents.reduce((s, c) => {
        return s + c.value * (c.weight / totalActiveWeight);
      }, 0);

      return Math.round(Math.max(0, Math.min(100, score)));
    } catch (error) {
      console.error('Error calculating score:', error);
      return 0;
    }
  },

  /**
   * Render KPI summary cards
   */
  renderKPICards() {
    const configuredApps = this.allApps.filter(a => a.goodbarberWebzineId && a.goodbarberToken).length;

    const totalDownloads = this.allApps.reduce((sum, app) => {
      return sum + (this.allStats[app.id]?.totalDownloads || 0);
    }, 0);

    const totalPushConsents = this.allApps.reduce((sum, app) => {
      return sum + (app.consensiPush || 0);
    }, 0);

    const totalPageViews = this.allApps.reduce((sum, app) => {
      return sum + (this.allStats[app.id]?.pageViewsMonth || 0);
    }, 0);

    // Somma abitanti serviti (popolazione di tutte le app ATTIVA)
    const abitantiServiti = this.allApps.reduce((sum, app) => {
      return sum + (app.popolazione || 0);
    }, 0);

    const trendPositive = this.countPositiveTrend();

    const kpiHtml = `
      <div class="rpt-kpi">
        <div class="rpt-kpi-icon" style="color: var(--blu-500);"><i class="fas fa-cube"></i></div>
        <div class="rpt-kpi-label">App Attive</div>
        <div class="rpt-kpi-value">${this.allApps.length}</div>
        <div style="font-size:0.7rem;color:var(--grigio-500);margin-top:0.25rem;">${configuredApps} con statistiche</div>
      </div>
      <div class="rpt-kpi green">
        <div class="rpt-kpi-icon" style="color: var(--verde-700);"><i class="fas fa-download"></i></div>
        <div class="rpt-kpi-label">Download Totali</div>
        <div class="rpt-kpi-value">${this.formatNumber(totalDownloads)}</div>
      </div>
      <div class="rpt-kpi blue">
        <div class="rpt-kpi-icon" style="color: var(--blu-700);"><i class="fas fa-bell"></i></div>
        <div class="rpt-kpi-label">Consensi Push</div>
        <div class="rpt-kpi-value">${this.formatNumber(totalPushConsents)}</div>
      </div>
      <div class="rpt-kpi amber">
        <div class="rpt-kpi-icon" style="color: var(--giallo-avviso);"><i class="fas fa-eye"></i></div>
        <div class="rpt-kpi-label">Page Views / mese</div>
        <div class="rpt-kpi-value">${this.formatNumber(totalPageViews)}</div>
      </div>
      <div class="rpt-kpi teal">
        <div class="rpt-kpi-icon" style="color: #0288D1;"><i class="fas fa-users"></i></div>
        <div class="rpt-kpi-label">Abitanti Serviti</div>
        <div class="rpt-kpi-value">${this.formatNumber(abitantiServiti)}</div>
      </div>
    `;

    document.getElementById('kpiContainer').innerHTML = kpiHtml;
  },

  /**
   * Count apps with positive trend (launches this month > last month)
   * Placeholder: would need more detailed monthly data from API
   */
  countPositiveTrend() {
    // For now, count apps with launchesMonth > 0
    return this.allApps.filter(app => {
      const stats = this.allStats[app.id] || {};
      return (stats.launchesMonth || 0) > 0;
    }).length;
  },

  /**
   * Render filter dropdowns
   */
  renderFilters() {
    const regioni = [...new Set(this.allApps.map(a => a.regione).filter(Boolean))].sort();
    const gestioni = [...new Set(this.allApps.map(a => a.gestione).filter(Boolean))].sort();

    const filtersHtml = `
      <div class="rpt-filters">
        <div class="rpt-filter-group">
          <label>Regione</label>
          <select id="filterRegione" class="rpt-filter-select">
            <option value="">Tutte</option>
            ${regioni.map(r => `<option value="${r}">${r}</option>`).join('')}
          </select>
        </div>
        <div class="rpt-filter-group">
          <label>Gestione</label>
          <select id="filterGestione" class="rpt-filter-select">
            <option value="">Tutte</option>
            ${gestioni.map(g => `<option value="${g}">${g}</option>`).join('')}
          </select>
        </div>
        <div class="rpt-filter-group">
          <label>Cerca App / Comune</label>
          <div class="rpt-search-wrap">
            <i class="fas fa-search"></i>
            <input type="text" id="filterSearch" class="rpt-filter-input"
                   placeholder="Cerca per nome app o comune..."
                   value="${this.currentFilters.searchQuery || ''}">
          </div>
        </div>
        <div style="display: flex; align-items: flex-end;">
          <button class="rpt-btn-reset" id="resetFiltersBtn">
            <i class="fas fa-times"></i> Reset
          </button>
        </div>
      </div>
    `;

    document.getElementById('filtersSection').innerHTML = filtersHtml;

    // Attach filter listeners
    document.getElementById('filterRegione').addEventListener('change', (e) => {
      this.currentFilters.regione = e.target.value || null;
      this.applyFiltersAndSort();
      this.renderRankingTable();
      this.renderTopBottomSections();
    });

    document.getElementById('filterGestione').addEventListener('change', (e) => {
      this.currentFilters.gestione = e.target.value || null;
      this.applyFiltersAndSort();
      this.renderRankingTable();
      this.renderTopBottomSections();
    });

    // Search input con debounce
    let searchTimeout = null;
    document.getElementById('filterSearch').addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.currentFilters.searchQuery = e.target.value.trim();
        this.applyFiltersAndSort();
        this.renderRankingTable();
        this.renderTopBottomSections();
      }, 250);
    });

    document.getElementById('resetFiltersBtn').addEventListener('click', () => {
      this.currentFilters = { regione: null, gestione: null, searchQuery: '' };
      document.getElementById('filterRegione').value = '';
      document.getElementById('filterGestione').value = '';
      document.getElementById('filterSearch').value = '';
      this.applyFiltersAndSort();
      this.renderRankingTable();
      this.renderTopBottomSections();
    });
  },

  /**
   * Apply filters and sorting
   */
  applyFiltersAndSort() {
    let filtered = [...this.allApps];

    // Apply filters
    if (this.currentFilters.regione) {
      filtered = filtered.filter(a => a.regione === this.currentFilters.regione);
    }
    if (this.currentFilters.gestione) {
      filtered = filtered.filter(a => a.gestione === this.currentFilters.gestione);
    }
    if (this.currentFilters.searchQuery) {
      const q = this.currentFilters.searchQuery.toLowerCase();
      filtered = filtered.filter(a => {
        const nome = (a.nome || '').toLowerCase();
        const comune = (a.comune || '').toLowerCase();
        return nome.includes(q) || comune.includes(q);
      });
    }

    // Apply sorting — some keys are on the app object, others on allStats
    const statsKeys = ['downloads', 'totalDevices', 'launchesMonth', 'pageViewsMonth', 'uniqueLaunchesMonth', 'totalSessions'];
    const self = this;
    filtered.sort((a, b) => {
      let aVal, bVal;
      if (this.sortKey === 'downloads') {
        aVal = (self.allStats[a.id]?.totalDownloads || 0);
        bVal = (self.allStats[b.id]?.totalDownloads || 0);
      } else if (this.sortKey === 'pushConsents') {
        // Consensi Push è un campo manuale sull'app, non dalle stats API
        aVal = (a.consensiPush || 0);
        bVal = (b.consensiPush || 0);
      } else if (statsKeys.includes(this.sortKey)) {
        aVal = (self.allStats[a.id]?.[this.sortKey] || 0);
        bVal = (self.allStats[b.id]?.[this.sortKey] || 0);
      } else {
        aVal = a[this.sortKey];
        bVal = b[this.sortKey];
      }

      // Handle null/undefined
      if (aVal == null) aVal = typeof aVal === 'number' ? 0 : '';
      if (bVal == null) bVal = typeof bVal === 'number' ? 0 : '';

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      let comparison = 0;
      if (aVal < bVal) comparison = -1;
      if (aVal > bVal) comparison = 1;

      return this.sortOrder === 'asc' ? comparison : -comparison;
    });

    this.filteredApps = filtered;
  },

  /**
   * Render ranking table
   */
  renderRankingTable() {
    const tbody = document.getElementById('rankingTableBody');

    let html = '';
    this.filteredApps.forEach((app, index) => {
      const stats = this.allStats[app.id] || {};
      const score = app.score || 0;
      const downloads = stats.totalDownloads || 0;
      const pushConsents = app.consensiPush || 0;
      const penetrazione = app.penetrazione || 0;
      const launchesMonth = stats.launchesMonth || 0;
      const pageViewsMonth = stats.pageViewsMonth || 0;
      const popolazione = app.popolazione || 0;

      const scoreClass = score >= 70 ? 'rpt-badge-success' :
                        score >= 40 ? 'rpt-badge-warning' : 'rpt-badge-danger';

      html += `
        <tr class="ranking-row" data-app-id="${app.id}">
          <td class="col-rank">${index + 1}</td>
          <td class="col-nome" title="${this.escapeHtml(app.nome || '')}">${this.escapeHtml(app.nome || 'N/A')}</td>
          <td class="col-regione">${this.escapeHtml(app.regione || 'N/A')}</td>
          <td class="col-score">
            <span class="rpt-badge ${scoreClass}">${score}</span>
          </td>
          <td class="col-downloads">${this.formatNumber(downloads)}</td>
          <td class="col-consensi">${this.formatNumber(pushConsents)}</td>
          <td class="col-penetrazione">${penetrazione.toFixed(1)}%</td>
          <td class="col-lanci">${this.formatNumber(launchesMonth)}</td>
          <td class="col-pageviews">${this.formatNumber(pageViewsMonth)}</td>
          <td class="col-popolazione">${this.formatNumber(popolazione)}</td>
          <td class="col-card" style="text-align:center;">
            <button class="rpt-btn-card" data-app-id="${app.id}" title="Scarica Report Card"
                    style="border:none;background:none;color:var(--blu-500);font-size:1.1rem;cursor:pointer;padding:0.2rem 0.4rem;border-radius:6px;transition:background 0.2s;">
              <i class="fas fa-file-image"></i>
            </button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html || '<tr><td colspan="11" style="text-align:center; padding:2rem; color:var(--grigio-500);">Nessun risultato</td></tr>';

    // Attach row click listeners
    document.querySelectorAll('.ranking-row').forEach(row => {
      row.addEventListener('click', () => {
        const appId = row.dataset.appId;
        UI.showPage('dettaglio-app', appId);
      });
    });

    // Attach report card button listeners
    document.querySelectorAll('.rpt-btn-card').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const appId = btn.dataset.appId;
        this.generateReportCard(appId);
      });
    });

    // Aggiorna indicatori visivi sugli header (senza riaggiungere listener)
    document.querySelectorAll('.rpt-table th[data-sort]').forEach(th => {
      th.classList.remove('sorted-asc', 'sorted-desc');
      if (th.dataset.sort === this.sortKey) {
        th.classList.add(this.sortOrder === 'asc' ? 'sorted-asc' : 'sorted-desc');
      }
    });

    // Attach header sort listeners SOLO la prima volta (evita listener duplicati)
    if (!this._sortListenersAttached) {
      this._sortListenersAttached = true;
      document.querySelector('.rpt-table thead')?.addEventListener('click', (e) => {
        const th = e.target.closest('th[data-sort]');
        if (!th) return;
        const key = th.dataset.sort;
        if (this.sortKey === key) {
          this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
          this.sortKey = key;
          this.sortOrder = 'desc';
        }
        this.applyFiltersAndSort();
        this.renderRankingTable();
      });
    }
  },

  /**
   * Render top 5 and bottom 5 sections
   */
  renderTopBottomSections() {
    const container = document.getElementById('topBottomContainer');

    // Solo app con stato ATTIVA, ordinate per score
    const attive = this.filteredApps.filter(a => a.statoApp === 'ATTIVA');

    // Se ci sono meno di 5 app filtrate, le classifiche non hanno senso
    if (attive.length < 5) {
      if (container) container.style.display = 'none';
      return;
    }
    if (container) container.style.display = '';

    // Quante app mostrare per lato: al massimo 10, ma mai più della metà
    // delle app disponibili. Così "Top" e "Da Migliorare" non condividono
    // mai le stesse app (prima, con meno di 20 app, si sovrapponevano).
    const perSide = Math.min(10, Math.floor(attive.length / 2));

    const sorted = [...attive].sort((a, b) => (b.score || 0) - (a.score || 0));
    const top10 = sorted.slice(0, perSide);
    const bottom10 = sorted.slice(attive.length - perSide).reverse();

    // Top (le migliori `perSide`)
    let topHtml = `<div class="rpt-tb-title"><i class="fas fa-crown" style="color: var(--giallo-avviso);"></i> Top ${perSide} App Attive</div>`;
    top10.forEach((app, index) => {
      const score = app.score || 0;
      topHtml += `
        <div class="rpt-tb-item">
          <div class="rpt-tb-rank top">${index + 1}</div>
          <div class="rpt-tb-info">
            <div class="rpt-tb-name">${this.escapeHtml(app.nome || 'N/A')}</div>
            <div class="rpt-tb-score">Score: ${score}</div>
          </div>
          <div class="rpt-tb-bar">
            <div class="rpt-tb-bar-fill" style="width: ${score}%; background: var(--verde-700);"></div>
          </div>
        </div>
      `;
    });

    if (top10.length === 0) {
      topHtml += '<div style="padding: 1rem; color: var(--grigio-500); font-size: 0.875rem;">Nessuna app attiva</div>';
    }

    // Bottom 10
    let bottomHtml = '<div class="rpt-tb-title"><i class="fas fa-triangle-exclamation" style="color: var(--rosso-errore);"></i> Da Migliorare (Attive)</div>';
    bottom10.forEach((app, index) => {
      const score = app.score || 0;
      const position = attive.length - index;
      bottomHtml += `
        <div class="rpt-tb-item">
          <div class="rpt-tb-rank bottom">${position}</div>
          <div class="rpt-tb-info">
            <div class="rpt-tb-name">${this.escapeHtml(app.nome || 'N/A')}</div>
            <div class="rpt-tb-score">Score: ${score}</div>
          </div>
          <div class="rpt-tb-bar">
            <div class="rpt-tb-bar-fill" style="width: ${Math.max(score, 5)}%; background: var(--rosso-errore);"></div>
          </div>
        </div>
      `;
    });

    if (bottom10.length === 0) {
      bottomHtml += '<div style="padding: 1rem; color: var(--grigio-500); font-size: 0.875rem;">Nessuna app attiva</div>';
    }

    document.getElementById('top5Section').innerHTML = topHtml;
    document.getElementById('bottom5Section').innerHTML = bottomHtml;
  },

  /**
   * Update all data from GoodBarber API
   */
  async updateAllData() {
    let progressModal = null;
    try {
      if (!AuthService.hasPermission('manage_apps') && !AuthService.hasPermission('*')) {
        UI.showError('Non hai i permessi per aggiornare i dati');
        return;
      }

      const appsToUpdate = this.allApps.filter(a => a.goodbarberWebzineId && a.goodbarberToken);

      if (appsToUpdate.length === 0) {
        UI.showError('Nessun\'app con API CMS configurate');
        return;
      }

      UI.showLoading();
      progressModal = this.showUpdateProgress(appsToUpdate.length);

      for (let i = 0; i < appsToUpdate.length; i++) {
        const app = appsToUpdate[i];

        try {
          this.updateUpdateProgress(progressModal, i + 1, appsToUpdate.length);

          // Fetch all stats from GoodBarber
          const allStats = await GoodBarberService.getAllStats(app.goodbarberWebzineId, app.goodbarberToken);

          // Extract relevant data from API response objects
          const totalDownloads = (allStats.downloads_global && allStats.downloads_global.total_global_downloads) || 0;
          const launchesMonth = (allStats.launches && allStats.launches.total_launches) || 0;
          const uniqueLaunchesMonth = (allStats.unique_launches && allStats.unique_launches.total_unique_launches) || 0;
          const pageViewsMonth = (allStats.page_views && allStats.page_views.total_page_views) || 0;
          const totalSessions = (allStats.session_times && allStats.session_times.total_sessions) || 0;
          const retentionRate = launchesMonth > 0 ? Math.round((uniqueLaunchesMonth / launchesMonth) * 100) : 0;

          const statsCache = {
            lastUpdate: new Date().toISOString(),
            totalDownloads: totalDownloads,
            launchesMonth: launchesMonth,
            uniqueLaunchesMonth: uniqueLaunchesMonth,
            pageViewsMonth: pageViewsMonth,
            totalSessions: totalSessions,
            retentionRate: retentionRate,
            rawData: allStats
          };

          // Update app document
          await DataService.updateApp(app.id, { gbStatsCache: statsCache });

          // Cache the stats locally
          this.allStats[app.id] = statsCache;

          // Recalculate score
          app.score = this.calcolaScore(app, statsCache);
          app.penetrazione = this.calcolaPenetrazione(app, statsCache);

          // Small delay to avoid API rate limiting
          if (i < appsToUpdate.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error) {
          console.error(`Error updating app ${app.id}:`, error);
          // Continue with next app even if one fails
        }
      }

      // Re-render the page
      this.applyFiltersAndSort();
      this.renderKPICards();
      this.renderRankingTable();
      this.renderTopBottomSections();

      // Update subtitle
      const now = new Date();
      document.getElementById('lastUpdateSubtitle').textContent =
        `Ultimo aggiornamento: ${now.toLocaleString('it-IT')}`;

      UI.showSuccess(`Dati aggiornati con successo per ${appsToUpdate.length} app`);
    } catch (error) {
      console.error('Error updating all data:', error);
      UI.showError('Errore nell\'aggiornamento dei dati');
    } finally {
      // Rimuove SEMPRE il modal di avanzamento e lo spinner, anche se
      // l'aggiornamento va in errore a metà: altrimenti l'overlay scuro
      // resterebbe a coprire lo schermo bloccando la pagina.
      if (progressModal) progressModal.remove();
      UI.hideLoading();
    }
  },

  /**
   * Show progress modal during update
   */
  showUpdateProgress(total) {
    const modal = document.createElement('div');
    modal.className = 'rpt-progress-overlay';
    modal.innerHTML = `
      <div class="rpt-progress-box">
        <h3><i class="fas fa-sync-alt fa-spin" style="margin-right: 0.5rem;"></i> Aggiornamento Dati</h3>
        <div class="rpt-progress-track">
          <div class="rpt-progress-fill" id="progressBarFill" style="width: 0%;"></div>
        </div>
        <p class="rpt-progress-text" id="progressText">0 / ${total} app</p>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  },

  /**
   * Update progress modal
   */
  updateUpdateProgress(modal, current, total) {
    const percentage = (current / total) * 100;
    modal.querySelector('#progressBarFill').style.width = percentage + '%';
    modal.querySelector('#progressText').textContent = `${current} / ${total} app`;
  },

  /**
   * Format number with thousand separators
   */
  formatNumber(num) {
    if (num == null) return '0';
    return new Intl.NumberFormat('it-IT').format(Math.round(num));
  },

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // ═══════════════════════════════════════════════════════════
  // REPORT CARD — Generazione infografica PNG per i comuni
  // ═══════════════════════════════════════════════════════════

  /**
   * Entry point: genera la report card PNG per una app
   */
  async generateReportCard(appId) {
    const app = this.allApps.find(a => a.id === appId);
    if (!app) { UI.showError('App non trovata'); return; }
    const stats = this.allStats[appId] || {};

    UI.showLoading('Generazione Report Card…');

    try {
      // Calcola metriche
      const m = this.calcReportMetrics(app, stats);

      // Pre-carica icona come base64 per evitare problemi CORS con html2canvas.
      // Le icone stanno su Firebase Storage (firebasestorage.googleapis.com) che
      // NON invia header CORS: il fetch diretto dei byte fallisce (anche se l'<img>
      // si vede). Strategia: 1) provo il fetch diretto; 2) se fallisce, riprovo
      // attraverso il proxy lato server del CRM (/api/image-proxy) che restituisce
      // l'immagine con CORS aperto.
      let iconBase64 = '';
      if (app.iconaUrl) {
        const blobToBase64 = (blob) => new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = () => resolve('');
          reader.readAsDataURL(blob);
        });

        // Tentativo 1 — fetch diretto (funziona se l'host invia gli header CORS)
        try {
          const resp = await fetch(app.iconaUrl);
          if (resp.ok) {
            const blob = await resp.blob();
            if (blob && blob.type && blob.type.indexOf('image/') === 0) {
              iconBase64 = await blobToBase64(blob);
            }
          }
        } catch (e) {
          // CORS o rete: si passa al proxy qui sotto
        }

        // Tentativo 2 — proxy CRM (bypassa il CORS di Firebase Storage)
        if (!iconBase64) {
          try {
            const proxyUrl = '/api/image-proxy?url=' + encodeURIComponent(app.iconaUrl);
            const resp = await fetch(proxyUrl);
            if (resp.ok) {
              const blob = await resp.blob();
              if (blob && blob.type && blob.type.indexOf('image/') === 0) {
                iconBase64 = await blobToBase64(blob);
              }
            } else {
              console.warn('Icona via proxy non disponibile (HTTP ' + resp.status + '), uso placeholder.');
            }
          } catch (e) {
            console.warn('Icona non caricabile nemmeno via proxy, uso placeholder:', e);
          }
        }
      }

      // Genera HTML della card (con icona già in base64)
      const cardHTML = this.buildReportCardHTML(app, m, iconBase64);

      // Crea container nascosto
      const wrapper = document.createElement('div');
      wrapper.id = 'rc-offscreen-wrapper';
      wrapper.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;';
      wrapper.innerHTML = cardHTML;
      document.body.appendChild(wrapper);

      // Attendi rendering font
      await new Promise(r => setTimeout(r, 600));

      const cardEl = wrapper.querySelector('#reportCardCanvas');

      const canvas = await html2canvas(cardEl, {
        scale: 2,
        useCORS: false,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false
      });

      // Download PNG
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      const nomeFile = (app.nome || 'App').replace(/[^a-zA-Z0-9À-ÿ]/g, '_');
      const oggi = new Date().toISOString().split('T')[0];
      link.download = `ReportCard_${nomeFile}_${oggi}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Cleanup
      wrapper.remove();
      UI.hideLoading();
      UI.showSuccess('Report Card scaricata!');

    } catch (err) {
      console.error('Errore generazione Report Card:', err);
      UI.hideLoading();
      UI.showError('Errore nella generazione del report');
      const old = document.getElementById('rc-offscreen-wrapper');
      if (old) old.remove();
    }
  },

  /**
   * Calcola tutte le metriche per la report card
   */
  calcReportMetrics(app, stats) {
    const downloads = stats.totalDownloads || 0;
    const launchesMonth = stats.launchesMonth || 0;
    const uniqueMonth = stats.uniqueLaunchesMonth || 0;
    const pageViewsMonth = stats.pageViewsMonth || 0;
    const consensiPush = app.consensiPush || 0;
    const popolazione = app.popolazione || 0;

    // Tutti i dati API (launches, unique_launches, page_views) sono relativi
    // agli ultimi 30 giorni. downloads_global è il totale storico.
    const penetrazione = popolazione > 0 ? Math.min(100, (downloads / popolazione) * 100) : 0;
    const engagement = launchesMonth > 0 ? (pageViewsMonth / launchesMonth) : 0;

    // Distribuzione piattaforme (da rawData o cache dettaglio)
    const rawData = stats.rawData || {};
    const osDist = rawData.mobile_os_distribution || stats.osDistribution || {};
    const iosPerc = osDist.ios_devices_percentage || 0;
    const androidPerc = osDist.android_devices_percentage || 0;

    return {
      downloads,
      launchesMonth,
      pageViewsMonth,
      consensiPush,
      popolazione,
      penetrazione,
      engagement,
      iosPerc,
      androidPerc
    };
  },

  /**
   * Costruisce l'HTML dell'infografica (stili tutti inline per html2canvas)
   */
  buildReportCardHTML(app, m, iconBase64) {
    const comune = app.comune || app.nomeComune || '';
    const provincia = app.provincia || '';
    const regione = app.regione || '';
    const location = [comune, provincia, regione].filter(Boolean).join(' · ');
    const dataLancio = app.dataLancioApp
      ? new Date(app.dataLancioApp).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
      : '';
    const iconSrc = iconBase64 || '';
    const now = new Date().toLocaleString('it-IT', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const fmtNum = (n) => new Intl.NumberFormat('it-IT').format(Math.round(n));
    const fmtDec = (n, d) => n.toFixed(d).replace('.', ',');

    // ── Card metrica secondaria (numero + etichetta + spiegazione in italiano semplice) ──
    const metricCard = (icon, label, value, color, subtitle) => `
      <div style="background:#ffffff;border-radius:18px;padding:26px 20px 24px;text-align:left;
                  box-shadow:0 6px 18px rgba(16,40,70,0.06);border:1px solid #E6ECF2;
                  border-top:4px solid ${color};">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <div style="width:48px;height:48px;border-radius:13px;background:${color}14;
                      display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i class="${icon}" style="font-size:24px;color:${color};"></i>
          </div>
          <div style="font-size:16px;font-weight:700;color:#103A5E;line-height:1.2;text-transform:uppercase;letter-spacing:0.4px;">
            ${label}
          </div>
        </div>
        <div style="font-size:46px;font-weight:700;color:#0E2E4A;line-height:1;margin-bottom:6px;">
          ${value}
        </div>
        ${subtitle ? `<div style="font-size:15px;color:#7C8A99;line-height:1.3;">${subtitle}</div>` : ''}
      </div>
    `;

    return `
      <div id="reportCardCanvas" style="width:800px;font-family:'Titillium Web',Arial,Helvetica,sans-serif;
           background:#EEF3F8;overflow:hidden;">

        <!-- ▓▓ HEADER ▓▓ -->
        <div style="background:linear-gradient(135deg,#145284 0%,#0D3A5C 100%);padding:46px 44px 40px;position:relative;">
          <!-- Pattern decorativo -->
          <div style="position:absolute;top:0;right:0;width:260px;height:260px;
                      background:radial-gradient(circle at 100% 0%,rgba(60,164,52,0.18) 0%,transparent 65%);"></div>

          <div style="display:flex;align-items:center;gap:24px;position:relative;">
            ${iconSrc ? `
            <img src="${iconSrc}"
                 style="width:104px;height:104px;border-radius:24px;border:3px solid rgba(255,255,255,0.25);
                        object-fit:cover;flex-shrink:0;" />
            ` : `
            <div style="width:104px;height:104px;border-radius:24px;background:rgba(255,255,255,0.15);
                        display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <i class="fas fa-mobile-alt" style="font-size:48px;color:rgba(255,255,255,0.7);"></i>
            </div>
            `}
            <div style="flex:1;">
              <div style="font-size:18px;font-weight:600;color:#9FD497;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px;">
                Report dell'app comunale
              </div>
              <div style="font-size:50px;font-weight:700;color:#ffffff;line-height:1.1;margin-bottom:8px;">
                ${this.escapeHtml(app.nome || 'App')}
              </div>
              <div style="font-size:20px;color:rgba(255,255,255,0.8);font-weight:400;">
                <i class="fas fa-map-marker-alt" style="margin-right:6px;opacity:0.8;"></i>${this.escapeHtml(location)}
              </div>
              ${dataLancio ? `
              <div style="font-size:16px;color:rgba(255,255,255,0.6);margin-top:10px;">
                <i class="fas fa-rocket" style="margin-right:5px;"></i> Online dal ${dataLancio}
              </div>` : ''}
            </div>
          </div>
        </div>

        <!-- ▓▓ TITOLO SEZIONE + PERIODO ▓▓ -->
        <div style="padding:32px 44px 4px;display:flex;align-items:flex-end;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:14px;">
            <div style="width:6px;height:38px;border-radius:3px;background:#3CA434;"></div>
            <div>
              <div style="font-size:28px;font-weight:700;color:#103A5E;line-height:1.1;">
                Come sta andando l'app
              </div>
              <div style="font-size:16px;font-weight:600;color:#7C8A99;margin-top:3px;">
                <i class="fas fa-clock" style="margin-right:5px;"></i> Dati aggiornati agli ultimi 30 giorni
              </div>
            </div>
          </div>
          <div style="font-size:15px;color:#9BAABA;font-weight:400;text-align:right;">
            <i class="fas fa-calendar-alt" style="margin-right:5px;"></i> ${now}
          </div>
        </div>

        <!-- ▓▓ NUMERO PRINCIPALE: DOWNLOADS TOTALI ▓▓ -->
        <div style="padding:22px 44px 8px;">
          <div style="background:linear-gradient(135deg,#145284 0%,#1C6AA8 100%);border-radius:20px;
                      padding:30px 36px;display:flex;align-items:center;gap:26px;
                      box-shadow:0 10px 28px rgba(20,82,132,0.25);">
            <div style="width:72px;height:72px;border-radius:18px;background:rgba(255,255,255,0.18);
                        display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <i class="fas fa-download" style="font-size:34px;color:#ffffff;"></i>
            </div>
            <div style="flex:1;">
              <div style="font-size:18px;font-weight:600;color:rgba(255,255,255,0.85);text-transform:uppercase;letter-spacing:0.6px;">
                Download totali dell'app
              </div>
              <div style="font-size:72px;font-weight:700;color:#ffffff;line-height:1;margin:4px 0 4px;">
                ${fmtNum(m.downloads)}
              </div>
              <div style="font-size:16px;color:rgba(255,255,255,0.7);">installazioni complessive da quando l'app è online</div>
            </div>
          </div>
        </div>

        <!-- ▓▓ GRIGLIA METRICHE (3x2) ▓▓ -->
        <div style="padding:18px 44px 8px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;">

          ${metricCard('fas fa-bell', 'Notifiche attive', fmtNum(m.consensiPush), '#3CA434', 'cittadini che ricevono gli avvisi del Comune')}
          ${metricCard('fas fa-mobile-alt', 'Aperture app', fmtNum(m.launchesMonth), '#145284', 'volte che i cittadini hanno aperto l’app negli ultimi 30 giorni')}

          <!-- Card piattaforme iOS/Android -->
          <div style="background:#ffffff;border-radius:18px;padding:26px 20px 24px;text-align:left;
                      box-shadow:0 6px 18px rgba(16,40,70,0.06);border:1px solid #E6ECF2;border-top:4px solid #6C7A89;">
            <div style="font-size:16px;font-weight:700;color:#103A5E;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:18px;">
              Dispositivi
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div style="text-align:center;flex:1;">
                <i class="fab fa-apple" style="font-size:30px;color:#1E1E1E;display:block;margin-bottom:6px;"></i>
                <div style="font-size:34px;font-weight:700;color:#0E2E4A;line-height:1;">${m.iosPerc}%</div>
                <div style="font-size:15px;color:#7C8A99;margin-top:3px;">iPhone</div>
              </div>
              <div style="width:1px;height:64px;background:#E0E6EC;"></div>
              <div style="text-align:center;flex:1;">
                <i class="fab fa-android" style="font-size:30px;color:#3CA434;display:block;margin-bottom:6px;"></i>
                <div style="font-size:34px;font-weight:700;color:#0E2E4A;line-height:1;">${m.androidPerc}%</div>
                <div style="font-size:15px;color:#7C8A99;margin-top:3px;">Android</div>
              </div>
            </div>
          </div>

          ${metricCard('fas fa-eye', 'Pagine consultate', fmtNum(m.pageViewsMonth), '#0288D1', 'contenuti letti dai cittadini negli ultimi 30 giorni')}
          ${metricCard('fas fa-book-open', 'Pagine per visita', fmtDec(m.engagement, 1), '#E67E22', 'quanto i cittadini approfondiscono in media')}
          ${metricCard('fas fa-users', 'Diffusione', fmtDec(m.penetrazione, 1) + '%', '#2E6DA8', 'quota di abitanti che ha scaricato l’app')}

        </div>

        <!-- ▓▓ FOOTER ▓▓ -->
        <div style="background:#ffffff;margin-top:18px;padding:24px 44px;display:flex;align-items:center;justify-content:space-between;
                    border-top:1px solid #E0E6EC;">
          <div style="display:flex;align-items:center;gap:14px;">
            <div style="width:42px;height:42px;border-radius:11px;background:#145284;
                        display:flex;align-items:center;justify-content:center;">
              <img src="${this._cdIconBase64}" alt="Comune.Digital" style="width:26px;height:26px;object-fit:contain;" />
            </div>
            <div>
              <div style="font-size:20px;font-weight:700;color:#145284;line-height:1.1;">Comune.Digital</div>
              <div style="font-size:14px;color:#9BAABA;">L'app del tuo Comune</div>
            </div>
          </div>
          <div style="font-size:14px;color:#9BAABA;text-align:right;">
            Powered by Growapp S.r.l.
          </div>
        </div>

      </div>
    `;
  }
};

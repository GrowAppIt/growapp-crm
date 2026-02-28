/**
 * Report GoodBarber Page Module
 * Analytics and ranking of all apps using GoodBarber API stats
 * CRM Comune.Digital by Growapp S.r.l.
 */

const ReportGoodBarber = {
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

      // Load all apps — SOLO le ATTIVA
      const tutteLeApp = await DataService.getApps();
      this.allApps = tutteLeApp.filter(a => a.statoApp === 'ATTIVA');

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
          .rpt-table tbody td.col-popolazione { display: none !important; }

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
          <button class="rpt-btn-update" id="updateAllButton">
            <i class="fas fa-sync-alt"></i> Aggiorna Tutti i Dati
          </button>
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
                </tr>
              </thead>
              <tbody id="rankingTableBody"></tbody>
            </table>
          </div>
        </div>

        <div class="rpt-tb-container">
          <div class="rpt-tb-section" id="top5Section"></div>
          <div class="rpt-tb-section" id="bottom5Section"></div>
        </div>
      </div>
    `;

    const mainContent = document.getElementById('mainContent');
    mainContent.innerHTML = pageContent;

    // Attach event listeners
    document.getElementById('updateAllButton').addEventListener('click', () => this.updateAllData());
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
   * Pesi: Penetraz 22%, Retention 20%, Engagement 13%, OptInPush 12%,
   *        VolumBonus 10%, QualitàTuristica 10%, Momentum 8%, BonusFloor 5%
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

      // ── 12% OPT-IN PUSH (con denominatore corretto) ───────────
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
        { value: optInPush,        weight: 0.12, available: downloadEffettivi > 0 && consensiPush > 0 },
        { value: volumeBonus,      weight: 0.10, available: downloads > 0 },
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
        <div class="rpt-kpi-value">${configuredApps}</div>
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
        </tr>
      `;
    });

    tbody.innerHTML = html || '<tr><td colspan="10" style="text-align:center; padding:2rem; color:var(--grigio-500);">Nessun risultato</td></tr>';

    // Attach row click listeners
    document.querySelectorAll('.ranking-row').forEach(row => {
      row.addEventListener('click', () => {
        const appId = row.dataset.appId;
        UI.showPage('dettaglio-app', appId);
      });
    });

    // Attach header sort listeners + highlight sorted column
    document.querySelectorAll('.rpt-table th[data-sort]').forEach(th => {
      // Mark current sort column
      th.classList.remove('sorted-asc', 'sorted-desc');
      if (th.dataset.sort === this.sortKey) {
        th.classList.add(this.sortOrder === 'asc' ? 'sorted-asc' : 'sorted-desc');
      }

      th.addEventListener('click', () => {
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
    });
  },

  /**
   * Render top 5 and bottom 5 sections
   */
  renderTopBottomSections() {
    // Solo app con stato ATTIVA, ordinate per score
    const attive = this.filteredApps.filter(a => a.statoApp === 'ATTIVA');
    const sorted = [...attive].sort((a, b) => (b.score || 0) - (a.score || 0));
    const top10 = sorted.slice(0, 10);
    const bottom10 = sorted.slice(-10).reverse();

    // Top 10
    let topHtml = '<div class="rpt-tb-title"><i class="fas fa-crown" style="color: var(--giallo-avviso);"></i> Top 10 App Attive</div>';
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
    try {
      if (!AuthService.hasPermission('manage_apps') && !AuthService.hasPermission('*')) {
        UI.showError('Non hai i permessi per aggiornare i dati');
        return;
      }

      const appsToUpdate = this.allApps.filter(a => a.goodbarberWebzineId && a.goodbarberToken);

      if (appsToUpdate.length === 0) {
        UI.showError('Nessun\'app con API GoodBarber configurate');
        return;
      }

      UI.showLoading();
      const progressModal = this.showUpdateProgress(appsToUpdate.length);

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

      // Close progress modal
      progressModal.remove();
      UI.hideLoading();

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
  }
};

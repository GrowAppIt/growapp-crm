/**
 * GoodBarber Classic Public API v1.3.3 Service Module
 *
 * Modulo per l'interazione con l'API pubblica di GoodBarber.
 * Fornisce metodi per gestire prospect, push notification, community, subscriptions e statistiche.
 *
 * Base URL: https://classic.goodbarber.dev/publicapi/v1/general/
 * Authentication: HTTP header "token: {goodbarberToken}"
 *
 * @module GoodBarberService
 */

const GoodBarberService = {
  // ============================================================================
  // Configuration
  // ============================================================================

  BASE_URL: 'https://classic.goodbarber.dev/publicapi/v1/general/',

  /**
   * Timeout per le richieste fetch in millisecondi
   * @type {number}
   */
  TIMEOUT: 10000,

  /**
   * Numero massimo di tentativi per le richieste
   * @type {number}
   */
  MAX_RETRIES: 2,

  /**
   * TTL della cache in millisecondi (5 minuti)
   * @type {number}
   */
  CACHE_TTL: 5 * 60 * 1000,

  // ============================================================================
  // Cache Management
  // ============================================================================

  /**
   * Cache interna per memorizzare i risultati delle API
   * @type {Object}
   * @private
   */
  _cache: {},

  /**
   * Recupera un valore dalla cache se disponibile e non scaduto
   *
   * @param {string} key - Chiave della cache
   * @returns {*} Valore dalla cache o undefined se scaduto/non presente
   * @private
   */
  _cacheGet: function(key) {
    const entry = this._cache[key];
    if (!entry) return undefined;

    if (Date.now() - entry.timestamp > this.CACHE_TTL) {
      delete this._cache[key];
      return undefined;
    }

    return entry.data;
  },

  /**
   * Memorizza un valore nella cache
   *
   * @param {string} key - Chiave della cache
   * @param {*} data - Dati da memorizzare
   * @private
   */
  _cacheSet: function(key, data) {
    this._cache[key] = {
      data: data,
      timestamp: Date.now()
    };
  },

  /**
   * Svuota la cache completamente
   */
  clearCache: function() {
    this._cache = {};
  },

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Converte una Date in formato stringa YYYY-MM-DD
   *
   * @param {Date} date - Data da convertire
   * @returns {string} Data formattata come YYYY-MM-DD
   * @private
   */
  _formatDate: function(date) {
    if (!(date instanceof Date)) {
      date = new Date(date);
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return year + '-' + month + '-' + day;
  },

  /**
   * Ritorna la data di n giorni fa in formato YYYY-MM-DD
   *
   * @param {number} n - Numero di giorni nel passato
   * @returns {string} Data formattata come YYYY-MM-DD
   * @private
   */
  _daysAgo: function(n) {
    const date = new Date();
    date.setDate(date.getDate() - n);
    return this._formatDate(date);
  },

  // ============================================================================
  // Fetch Helper with Retry and Error Handling
  // ============================================================================

  /**
   * Helper interno per effettuare richieste fetch con retry automatico
   *
   * @param {string} endpoint - Endpoint relativo (es: "prospects/123/")
   * @param {string} token - Token di autenticazione
   * @param {Object} options - Opzioni per fetch
   * @param {string} options.method - HTTP method (GET, POST, etc.) - default: "GET"
   * @param {Object} options.body - Corpo della richiesta (verrà serializzato a JSON)
   * @param {boolean} options.useCache - Se usare la cache per questo endpoint - default: false
   * @returns {Promise<Object>} Risposta JSON dell'API
   * @throws {Error} Se la richiesta fallisce dopo i retry
   * @private
   */
  _fetch: function(endpoint, token, options) {
    const self = this;
    options = options || {};

    const method = options.method || 'GET';
    const useCache = options.useCache === true;
    const body = options.body;

    // Costruisci la chiave della cache
    const cacheKey = method + ':' + endpoint;

    // Controlla cache se GET
    if (method === 'GET' && useCache) {
      const cached = this._cacheGet(cacheKey);
      if (cached !== undefined) {
        return Promise.resolve(cached);
      }
    }

    const url = this.BASE_URL + endpoint;
    const fetchOptions = {
      method: method,
      headers: {
        'token': token,
        'Content-Type': 'application/json'
      },
      timeout: this.TIMEOUT
    };

    if (body) {
      fetchOptions.body = JSON.stringify(body);
    }

    // Implementa il retry logic
    const attempt = function(retryCount) {
      return fetch(url, fetchOptions)
        .then(function(response) {
          if (!response.ok) {
            const error = new Error(
              'HTTP ' + response.status + ': ' + response.statusText
            );
            error.status = response.status;
            throw error;
          }
          return response.json();
        })
        .then(function(data) {
          // Memorizza nella cache se GET e useCache è true
          if (method === 'GET' && useCache) {
            self._cacheSet(cacheKey, data);
          }
          return data;
        })
        .catch(function(error) {
          // Retry se non è un errore di autenticazione o autorizzazione
          if (retryCount < self.MAX_RETRIES && error.status !== 401 && error.status !== 403) {
            return new Promise(function(resolve) {
              setTimeout(function() {
                resolve(attempt(retryCount + 1));
              }, 1000 * (retryCount + 1)); // Backoff esponenziale
            });
          }
          throw error;
        });
    };

    return attempt(0);
  },

  // ============================================================================
  // Prospects Methods
  // ============================================================================

  /**
   * Recupera la lista dei prospect per un'app
   *
   * @param {number} webzineId - ID dell'app
   * @param {string} token - Token di autenticazione
   * @param {number} page - Numero di pagina (default: 1)
   * @param {number} perPage - Numero di prospect per pagina (default: 50)
   * @returns {Promise<Object>} Lista dei prospect e metadati di paginazione
   */
  getProspects: function(webzineId, token, page, perPage) {
    page = page || 1;
    perPage = perPage || 50;

    const endpoint = 'prospects/' + webzineId + '/?page=' + page + '&per_page=' + perPage;

    return this._fetch(endpoint, token, { method: 'GET', useCache: false });
  },

  /**
   * Recupera i dettagli di un prospect specifico
   *
   * @param {number} webzineId - ID dell'app
   * @param {string} token - Token di autenticazione
   * @param {number} prospectId - ID del prospect
   * @returns {Promise<Object>} Dettagli del prospect
   */
  getProspect: function(webzineId, token, prospectId) {
    const endpoint = 'prospects/' + webzineId + '/prospect/' + prospectId + '/';

    return this._fetch(endpoint, token, { method: 'GET', useCache: true });
  },

  // ============================================================================
  // Push Notification Methods
  // ============================================================================

  /**
   * Invia una notifica push a tutti gli utenti o a una piattaforma specifica
   *
   * @param {number} webzineId - ID dell'app
   * @param {string} token - Token di autenticazione
   * @param {string} message - Testo del messaggio push
   * @param {string} platform - Piattaforma: "all" | "pwa" | "ios" | "android" (default: "all")
   * @returns {Promise<Object>} Risposta dell'API
   */
  sendPushBroadcast: function(webzineId, token, message, platform) {
    platform = platform || 'all';

    const endpoint = 'push/' + webzineId + '/';
    const body = {
      message: message,
      platform: platform
    };

    return this._fetch(endpoint, token, { method: 'POST', body: body });
  },

  /**
   * Invia una notifica push a specifici gruppi di utenti
   *
   * @param {number} webzineId - ID dell'app
   * @param {string} token - Token di autenticazione
   * @param {string} message - Testo del messaggio push
   * @param {number[]} groups - Array di ID dei gruppi
   * @param {string} platform - Piattaforma: "all" | "pwa" | "ios" | "android" (default: "all")
   * @returns {Promise<Object>} Risposta dell'API
   */
  sendPushByGroups: function(webzineId, token, message, groups, platform) {
    platform = platform || 'all';

    const endpoint = 'push/groups/' + webzineId + '/';
    const body = {
      message: message,
      groups: groups,
      platform: platform
    };

    return this._fetch(endpoint, token, { method: 'POST', body: body });
  },

  // ============================================================================
  // Community Methods
  // ============================================================================

  /**
   * Recupera la lista dei gruppi della community
   *
   * @param {number} webzineId - ID dell'app
   * @param {string} token - Token di autenticazione
   * @returns {Promise<Object>} Lista dei gruppi
   */
  getGroups: function(webzineId, token) {
    const endpoint = 'community/' + webzineId + '/groups/';

    return this._fetch(endpoint, token, { method: 'GET', useCache: true });
  },

  // ============================================================================
  // Subscriptions Methods
  // ============================================================================

  /**
   * Recupera le sottoscrizioni attive
   *
   * @param {number} webzineId - ID dell'app
   * @param {string} token - Token di autenticazione
   * @param {number} page - Numero di pagina (default: 1)
   * @param {number} perPage - Numero di risultati per pagina (default: 50)
   * @returns {Promise<Object>} Lista delle sottoscrizioni attive e metadati di paginazione
   */
  getActiveSubscriptions: function(webzineId, token, page, perPage) {
    page = page || 1;
    perPage = perPage || 50;

    const endpoint = 'subscriptions/' + webzineId + '/active/?page=' + page + '&per_page=' + perPage;

    return this._fetch(endpoint, token, { method: 'GET', useCache: false });
  },

  /**
   * Recupera le sottoscrizioni scadute
   *
   * @param {number} webzineId - ID dell'app
   * @param {string} token - Token di autenticazione
   * @param {number} page - Numero di pagina (default: 1)
   * @param {number} perPage - Numero di risultati per pagina (default: 50)
   * @returns {Promise<Object>} Lista delle sottoscrizioni scadute e metadati di paginazione
   */
  getExpiredSubscriptions: function(webzineId, token, page, perPage) {
    page = page || 1;
    perPage = perPage || 50;

    const endpoint = 'subscriptions/' + webzineId + '/expired/?page=' + page + '&per_page=' + perPage;

    return this._fetch(endpoint, token, { method: 'GET', useCache: false });
  },

  // ============================================================================
  // Stats - Traffic Methods
  // ============================================================================

  /**
   * Recupera il numero di download nel periodo specificato
   *
   * @param {number} webzineId - ID dell'app
   * @param {string} token - Token di autenticazione
   * @param {string|Date} startDate - Data di inizio (YYYY-MM-DD)
   * @param {string|Date} endDate - Data di fine (YYYY-MM-DD)
   * @param {string} platform - Piattaforma: "all" | "pwa" | "ios" | "android" (default: "all")
   * @returns {Promise<Object>} Statistiche di download
   */
  getDownloads: function(webzineId, token, startDate, endDate, platform) {
    platform = platform || 'all';

    const start = typeof startDate === 'string' ? startDate : this._formatDate(startDate);
    const end = typeof endDate === 'string' ? endDate : this._formatDate(endDate);

    const endpoint = 'stats/' + webzineId + '/downloads/?start_date=' + start +
                     '&end_date=' + end + '&platform=' + platform;

    return this._fetch(endpoint, token, { method: 'GET', useCache: true });
  },

  /**
   * Recupera il totale dei download globali
   *
   * @param {number} webzineId - ID dell'app
   * @param {string} token - Token di autenticazione
   * @param {string} platform - Piattaforma: "all" | "pwa" | "ios" | "android" (default: "all")
   * @returns {Promise<Object>} Statistiche globali di download
   */
  getGlobalDownloads: function(webzineId, token, platform) {
    platform = platform || 'all';

    const endpoint = 'stats/' + webzineId + '/downloads_global/?platform=' + platform;

    return this._fetch(endpoint, token, { method: 'GET', useCache: true });
  },

  /**
   * Recupera il numero di avvii dell'app nel periodo specificato
   *
   * @param {number} webzineId - ID dell'app
   * @param {string} token - Token di autenticazione
   * @param {string|Date} startDate - Data di inizio (YYYY-MM-DD)
   * @param {string|Date} endDate - Data di fine (YYYY-MM-DD)
   * @param {string} platform - Piattaforma: "all" | "pwa" | "ios" | "android" (default: "all")
   * @returns {Promise<Object>} Statistiche di avvii
   */
  getLaunches: function(webzineId, token, startDate, endDate, platform) {
    platform = platform || 'all';

    const start = typeof startDate === 'string' ? startDate : this._formatDate(startDate);
    const end = typeof endDate === 'string' ? endDate : this._formatDate(endDate);

    const endpoint = 'stats/' + webzineId + '/launches/?start_date=' + start +
                     '&end_date=' + end + '&platform=' + platform;

    return this._fetch(endpoint, token, { method: 'GET', useCache: true });
  },

  /**
   * Recupera il numero di avvii univoci nel periodo specificato
   *
   * @param {number} webzineId - ID dell'app
   * @param {string} token - Token di autenticazione
   * @param {string|Date} startDate - Data di inizio (YYYY-MM-DD)
   * @param {string|Date} endDate - Data di fine (YYYY-MM-DD)
   * @param {string} platform - Piattaforma: "all" | "pwa" | "ios" | "android" (default: "all")
   * @returns {Promise<Object>} Statistiche di avvii univoci
   */
  getUniqueLaunches: function(webzineId, token, startDate, endDate, platform) {
    platform = platform || 'all';

    const start = typeof startDate === 'string' ? startDate : this._formatDate(startDate);
    const end = typeof endDate === 'string' ? endDate : this._formatDate(endDate);

    const endpoint = 'stats/' + webzineId + '/unique_launches/?start_date=' + start +
                     '&end_date=' + end + '&platform=' + platform;

    return this._fetch(endpoint, token, { method: 'GET', useCache: true });
  },

  /**
   * Recupera il numero di visualizzazioni di pagina nel periodo specificato
   *
   * @param {number} webzineId - ID dell'app
   * @param {string} token - Token di autenticazione
   * @param {string|Date} startDate - Data di inizio (YYYY-MM-DD)
   * @param {string|Date} endDate - Data di fine (YYYY-MM-DD)
   * @param {string} platform - Piattaforma: "all" | "pwa" | "ios" | "android" (default: "all")
   * @returns {Promise<Object>} Statistiche di visualizzazioni di pagina
   */
  getPageViews: function(webzineId, token, startDate, endDate, platform) {
    platform = platform || 'all';

    const start = typeof startDate === 'string' ? startDate : this._formatDate(startDate);
    const end = typeof endDate === 'string' ? endDate : this._formatDate(endDate);

    const endpoint = 'stats/' + webzineId + '/page_views/?start_date=' + start +
                     '&end_date=' + end + '&platform=' + platform;

    return this._fetch(endpoint, token, { method: 'GET', useCache: true });
  },

  /**
   * Recupera le visualizzazioni di pagina per giorno della settimana
   *
   * @param {number} webzineId - ID dell'app
   * @param {string} token - Token di autenticazione
   * @param {string|Date} startDate - Data di inizio (YYYY-MM-DD)
   * @param {string|Date} endDate - Data di fine (YYYY-MM-DD)
   * @returns {Promise<Object>} Statistiche di visualizzazioni per giorno della settimana
   */
  getPageViewsPerWeekDay: function(webzineId, token, startDate, endDate) {
    const start = typeof startDate === 'string' ? startDate : this._formatDate(startDate);
    const end = typeof endDate === 'string' ? endDate : this._formatDate(endDate);

    const endpoint = 'stats/' + webzineId + '/page_views_per_week_day/?start_date=' + start +
                     '&end_date=' + end;

    return this._fetch(endpoint, token, { method: 'GET', useCache: true });
  },

  /**
   * Recupera il tempo medio di sessione nel periodo specificato
   *
   * @param {number} webzineId - ID dell'app
   * @param {string} token - Token di autenticazione
   * @param {string|Date} startDate - Data di inizio (YYYY-MM-DD)
   * @param {string|Date} endDate - Data di fine (YYYY-MM-DD)
   * @returns {Promise<Object>} Statistiche di tempo di sessione
   */
  getSessionTimes: function(webzineId, token, startDate, endDate) {
    const start = typeof startDate === 'string' ? startDate : this._formatDate(startDate);
    const end = typeof endDate === 'string' ? endDate : this._formatDate(endDate);

    const endpoint = 'stats/' + webzineId + '/session_time/?start_date=' + start +
                     '&end_date=' + end;

    return this._fetch(endpoint, token, { method: 'GET', useCache: true });
  },

  // ============================================================================
  // Stats - Technics Methods
  // ============================================================================

  /**
   * Recupera la distribuzione globale dei dispositivi
   *
   * @param {number} webzineId - ID dell'app
   * @param {string} token - Token di autenticazione
   * @param {string} platform - Piattaforma: "all" | "pwa" | "ios" | "android" (default: "all")
   * @returns {Promise<Object>} Statistiche dei dispositivi
   */
  getDevicesGlobal: function(webzineId, token, platform) {
    platform = platform || 'all';

    const endpoint = 'stats/' + webzineId + '/devices_global/?platform=' + platform;

    return this._fetch(endpoint, token, { method: 'GET', useCache: true });
  },

  /**
   * Recupera la distribuzione dei sistemi operativi mobili
   *
   * @param {number} webzineId - ID dell'app
   * @param {string} token - Token di autenticazione
   * @returns {Promise<Object>} Statistiche della distribuzione dei sistemi operativi
   */
  getMobileOsDistribution: function(webzineId, token) {
    const endpoint = 'stats/' + webzineId + '/mobile_os_distribution_global/';

    return this._fetch(endpoint, token, { method: 'GET', useCache: true });
  },

  /**
   * Recupera la distribuzione delle versioni del sistema operativo
   *
   * @param {number} webzineId - ID dell'app
   * @param {string} token - Token di autenticazione
   * @param {string} platform - Piattaforma: "all" | "pwa" | "ios" | "android" (default: "all")
   * @returns {Promise<Object>} Statistiche delle versioni del sistema operativo
   */
  getOsVersions: function(webzineId, token, platform) {
    // NOTA: questo endpoint NON supporta 'all', solo 'android', 'iphone', 'ipad', 'html5'
    platform = platform || 'android';
    if (platform === 'all') platform = 'android';

    const endpoint = 'stats/' + webzineId + '/os_version_global/?platform=' + platform;

    return this._fetch(endpoint, token, { method: 'GET', useCache: true });
  },

  // ============================================================================
  // Convenience Methods
  // ============================================================================

  /**
   * Recupera tutte le statistiche per un'app negli ultimi 30 giorni in una singola chiamata
   * Chiama più endpoint in parallelo e ritorna un oggetto combinato.
   * Il risultato viene memorizzato nella cache.
   *
   * @param {number} webzineId - ID dell'app
   * @param {string} token - Token di autenticazione
   * @returns {Promise<Object>} Oggetto contenente tutte le statistiche disponibili
   */
  getAllStats: function(webzineId, token) {
    const self = this;
    const cacheKey = 'all_stats:' + webzineId;

    // Controlla cache prima di procedere
    const cached = this._cacheGet(cacheKey);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }

    const endDate = this._formatDate(new Date());
    const startDate = this._daysAgo(30);

    // Effettua tutte le chiamate in parallelo
    const promises = [
      this.getDownloads(webzineId, token, startDate, endDate, 'all'),
      this.getGlobalDownloads(webzineId, token, 'all'),
      this.getLaunches(webzineId, token, startDate, endDate, 'all'),
      this.getUniqueLaunches(webzineId, token, startDate, endDate, 'all'),
      this.getPageViews(webzineId, token, startDate, endDate, 'all'),
      this.getPageViewsPerWeekDay(webzineId, token, startDate, endDate),
      this.getSessionTimes(webzineId, token, startDate, endDate),
      this.getDevicesGlobal(webzineId, token, 'all'),
      this.getMobileOsDistribution(webzineId, token),
      this.getOsVersions(webzineId, token, 'all')
    ];

    // Usa allSettled per non bloccare tutto se un endpoint fallisce
    return Promise.allSettled(promises)
      .then(function(results) {
        var getValue = function(r) { return r.status === 'fulfilled' ? r.value : null; };

        var statsData = {
          period: {
            start: startDate,
            end: endDate,
            days: 30
          },
          downloads: getValue(results[0]),
          downloads_global: getValue(results[1]),
          launches: getValue(results[2]),
          unique_launches: getValue(results[3]),
          page_views: getValue(results[4]),
          page_views_per_week_day: getValue(results[5]),
          session_times: getValue(results[6]),
          devices_global: getValue(results[7]),
          mobile_os_distribution: getValue(results[8]),
          os_versions: getValue(results[9]),
          retrieved_at: new Date().toISOString()
        };

        // Log eventuali errori parziali
        var errors = results.filter(function(r) { return r.status === 'rejected'; });
        if (errors.length > 0) {
          console.warn('GoodBarber API: ' + errors.length + ' endpoint(s) failed:',
            errors.map(function(e) { return e.reason?.message || e.reason; }));
        }

        // Memorizza nella cache
        self._cacheSet(cacheKey, statsData);

        return statsData;
      });
  },

  /**
   * Verifica la connessione all'API tentando di recuperare i gruppi della community
   *
   * @param {number} webzineId - ID dell'app
   * @param {string} token - Token di autenticazione
   * @returns {Promise<Object>} Oggetto con proprietà success (boolean) e error (string se fallisce)
   */
  testConnection: function(webzineId, token) {
    return this.getGroups(webzineId, token)
      .then(function(response) {
        return {
          success: true,
          error: null,
          message: 'Connessione all\'API verificata con successo'
        };
      })
      .catch(function(error) {
        return {
          success: false,
          error: error.message || 'Errore sconosciuto durante la connessione',
          message: 'Impossibile connettersi all\'API'
        };
      });
  }
};

// Settings Service - Gestione preferenze utente
const SettingsService = {
    // Chiavi localStorage
    KEYS: {
        DASHBOARD_WIDGETS: 'cd_dashboard_widgets',
        COMPANY_DATA: 'cd_company_data'
    },

    // Widget disponibili per la dashboard
    AVAILABLE_WIDGETS: {
        statistiche: {
            id: 'statistiche',
            nome: 'KPI Dashboard',
            descrizione: 'Scadenze critiche, Rinnovi sospesi, Fatturato scaduto, Task urgenti',
            enabled: true,
            order: 1
        },
        scadenzeImminenti: {
            id: 'scadenzeImminenti',
            nome: 'Scadenze Imminenti',
            descrizione: 'Prossime scadenze nei prossimi 30 giorni (compatta - top 5)',
            enabled: true,
            compatto: true,
            order: 2
        },
        fattureNonPagate: {
            id: 'fattureNonPagate',
            nome: 'Fatture Scadute da Incassare',
            descrizione: 'Fatture con scadenza pagamento superata',
            enabled: true,
            order: 3
        },
        contrattiInScadenza: {
            id: 'contrattiInScadenza',
            nome: 'Contratti in Scadenza',
            descrizione: 'Rinnovi previsti nei prossimi 60 giorni',
            enabled: true,
            order: 4
        },
        andamentoMensile: {
            id: 'andamentoMensile',
            nome: 'Riepilogo Finanziario del Mese',
            descrizione: 'Emesso, incassato, da incassare con confronto mese precedente (solo ruoli amministrativi)',
            enabled: true,
            order: 5
        },
        statoApp: {
            id: 'statoApp',
            nome: 'Stato App',
            descrizione: 'Distribuzione app per stato (dati reali dalla collection App)',
            enabled: true,
            order: 6
        },
        topClienti: {
            id: 'topClienti',
            nome: 'Top 5 Clienti',
            descrizione: 'Clienti con maggior fatturato (deprecato)',
            enabled: false,
            order: 99
        },
        graficoAndamento: {
            id: 'graficoAndamento',
            nome: 'Grafico Fatturato (vecchio)',
            descrizione: 'Fatturato ultimi 12 mesi (sostituito da andamentoMensile)',
            enabled: false,
            order: 98
        },
        ultimiClienti: {
            id: 'ultimiClienti',
            nome: 'Ultimi Clienti',
            descrizione: 'Ultimi 5 clienti aggiunti',
            enabled: false,
            order: 7
        }
    },

    // === DASHBOARD WIDGETS ===
    getDashboardWidgets() {
        const saved = localStorage.getItem(this.KEYS.DASHBOARD_WIDGETS);
        if (saved) {
            return JSON.parse(saved);
        }
        // Ritorna configurazione di default
        return { ...this.AVAILABLE_WIDGETS };
    },

    saveDashboardWidgets(widgets) {
        localStorage.setItem(this.KEYS.DASHBOARD_WIDGETS, JSON.stringify(widgets));
    },

    toggleWidget(widgetId, enabled) {
        const widgets = this.getDashboardWidgets();
        if (widgets[widgetId]) {
            widgets[widgetId].enabled = enabled;
            this.saveDashboardWidgets(widgets);
        }
    },

    getEnabledWidgets() {
        const widgets = this.getDashboardWidgets();
        return Object.values(widgets)
            .filter(w => w.enabled)
            .sort((a, b) => a.order - b.order);
    },

    resetDashboardWidgets() {
        this.saveDashboardWidgets({ ...this.AVAILABLE_WIDGETS });
    },

    // === COMPANY DATA ===
    getCompanyData() {
        const saved = localStorage.getItem(this.KEYS.COMPANY_DATA);
        if (saved) {
            return JSON.parse(saved);
        }
        // Dati di default
        return {
            ragioneSociale: 'Comune.Digital',
            partitaIva: '',
            codiceFiscale: '',
            indirizzo: '',
            cap: '',
            citta: '',
            provincia: '',
            telefono: '',
            email: '',
            pec: '',
            sitoWeb: '',
            logo: null
        };
    },

    saveCompanyData(data) {
        localStorage.setItem(this.KEYS.COMPANY_DATA, JSON.stringify(data));
    },

    // === SYSTEM SETTINGS (Firestore-backed) ===

    // Cache locale per evitare letture ripetute
    _systemSettingsCache: null,
    _systemSettingsCacheTime: 0,
    CACHE_TTL: 5 * 60 * 1000, // 5 minuti

    // Valori di default — usati se Firestore non ha ancora nulla
    SYSTEM_DEFAULTS: {
        // --- Fatturazione ---
        ivaDefault: 22,
        metodoPagamentoDefault: 'BONIFICO',
        condizionePagamentoDefault: 'ANTICIPATO',
        formatoNumeroFattura: '{ANNO}/{NUM}/{TIPO}',   // {ANNO}, {NUM}, {TIPO}=PA|PR
        paddingNumeroFattura: 3,                          // cifre: 001, 0001, etc.
        prefissoNotaCredito: 'NC-',
        annoContabile: new Date().getFullYear(),

        // --- Contratti ---
        prefissoNumeroContratto: 'CTR',
        formatoNumeroContratto: '{PREF}-{ANNO}-{NUM}', // {PREF}, {ANNO}, {NUM}
        paddingNumeroContratto: 3,
        giorniPreavvisoRinnovo: 60,
        durataContrattoDefault: 12,                      // mesi
        periodicitaDefault: 'ANNUALE',
        tipologiaContrattoDefault: 'SERVIZIO_APP',

        // --- Soglie e notifiche ---
        sogliaCritico: 1,                               // giorni (scade domani o oggi)
        sogliaImminente: 3,                              // giorni (alert entro 3 giorni)
        finestraContrattiDashboard: 60,                  // giorni
        finestraFattureDashboard: 30,                    // giorni
        giorniLookbackStorico: 180,                      // 6 mesi
        giorniFuturoBilling: 90                          // limite futuro fatture da emettere
    },

    /**
     * Carica le impostazioni di sistema da Firestore (con cache)
     * Ritorna sempre un oggetto completo (defaults + override salvati)
     */
    async getSystemSettings() {
        // Controlla cache
        const now = Date.now();
        if (this._systemSettingsCache && (now - this._systemSettingsCacheTime) < this.CACHE_TTL) {
            return { ...this.SYSTEM_DEFAULTS, ...this._systemSettingsCache };
        }

        try {
            const doc = await db.collection('settings').doc('system').get();
            if (doc.exists) {
                this._systemSettingsCache = doc.data();
            } else {
                this._systemSettingsCache = {};
            }
            this._systemSettingsCacheTime = now;
        } catch (e) {
            console.warn('Errore lettura impostazioni sistema:', e);
            this._systemSettingsCache = this._systemSettingsCache || {};
        }

        return { ...this.SYSTEM_DEFAULTS, ...this._systemSettingsCache };
    },

    /**
     * Versione sincrona che ritorna la cache (o i defaults se non ancora caricata)
     * Usa questa nei form dove non puoi fare await
     */
    getSystemSettingsSync() {
        if (this._systemSettingsCache) {
            return { ...this.SYSTEM_DEFAULTS, ...this._systemSettingsCache };
        }
        return { ...this.SYSTEM_DEFAULTS };
    },

    /**
     * Salva le impostazioni di sistema su Firestore
     */
    async saveSystemSettings(settings) {
        try {
            // Salva solo i campi che differiscono dai defaults
            const toSave = {};
            for (const [key, val] of Object.entries(settings)) {
                if (this.SYSTEM_DEFAULTS[key] !== undefined) {
                    toSave[key] = val;
                }
            }
            await db.collection('settings').doc('system').set(toSave, { merge: true });
            // Aggiorna cache
            this._systemSettingsCache = toSave;
            this._systemSettingsCacheTime = Date.now();
            return true;
        } catch (e) {
            console.error('Errore salvataggio impostazioni sistema:', e);
            throw e;
        }
    },

    /**
     * Precarica le impostazioni all'avvio dell'app (chiamare dopo auth)
     */
    async preloadSystemSettings() {
        await this.getSystemSettings();
    },

    /**
     * Invalida la cache (dopo un salvataggio esterno)
     */
    invalidateSystemSettingsCache() {
        this._systemSettingsCache = null;
        this._systemSettingsCacheTime = 0;
    }
};

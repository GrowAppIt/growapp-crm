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
            nome: 'Andamento Generale del Mese',
            descrizione: 'Grafici animati: nuovi clienti, contratti attivati/scaduti, app in sviluppo',
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

    // === SYSTEM SETTINGS ===
    getSystemSettings() {
        return {
            notificheScadenze: 7, // giorni
            ivaDefault: 22,
            condizioniPagamento: '30 giorni data fattura',
            formatoFattura: 'FAT{NUMERO}/2025'
        };
    }
};

/**
 * 📧 TEMPLATE SERVICE
 * Gestisce i template predefiniti per comunicazioni email/PEC
 * Placeholder: {{campo}} → sostituiti con dati reali
 */

const TemplateService = {

    // Cache dati aziendali
    _datiAzienda: null,

    /**
     * Lista template disponibili
     */
    TEMPLATES: [
        {
            id: 'sollecito_pagamento',
            nome: 'Sollecito Pagamento',
            icon: 'fas fa-exclamation-circle',
            color: '#D32F2F',
            richiede: 'fattura', // richiede selezione fattura
            oggetto: 'Sollecito pagamento fattura n. {{numeroFattura}}',
            corpo: `Gentile {{ragioneSociale}},

con la presente ci permettiamo di ricordarVi che la fattura n. {{numeroFattura}} del {{dataEmissione}}, di importo pari a €{{importoFattura}}, risulta ad oggi non ancora saldata.

Vi invitiamo cortesemente a provvedere al pagamento entro i prossimi 15 giorni dalla ricezione della presente comunicazione.

Per qualsiasi chiarimento o necessità, non esitate a contattarci.

Cordiali saluti,
{{nomeAzienda}}
{{emailAzienda}}
{{telefonoAzienda}}`
        },
        {
            id: 'conferma_rinnovo',
            nome: 'Proposta Rinnovo Contratto',
            icon: 'fas fa-sync-alt',
            color: '#3CA434',
            richiede: 'contratto', // richiede selezione contratto
            oggetto: 'Conferma rinnovo contratto n. {{numeroContratto}}',
            corpo: `Gentile {{ragioneSociale}},

siamo lieti di confermarVi il rinnovo del contratto n. {{numeroContratto}} relativo a "{{oggettoContratto}}".

Il contratto è stato rinnovato con le seguenti condizioni:
- Importo annuale: €{{importoContratto}}
- Periodicità: {{periodicita}}
- Nuova scadenza: {{dataScadenza}}

Rimaniamo a disposizione per qualsiasi chiarimento.

Cordiali saluti,
{{nomeAzienda}}
{{emailAzienda}}
{{telefonoAzienda}}`
        },
        {
            id: 'benvenuto',
            nome: 'Benvenuto Nuovo Cliente',
            icon: 'fas fa-handshake',
            color: '#2E6DA8',
            richiede: null, // solo dati cliente
            oggetto: 'Benvenuto in {{nomeAzienda}} - {{ragioneSociale}}',
            corpo: `Gentile {{ragioneSociale}},

siamo lieti di darVi il benvenuto tra i nostri clienti!

Il nostro team è a Vostra completa disposizione per supportarVi in ogni fase del percorso. Di seguito i nostri recapiti per qualsiasi necessità:

Email: {{emailAzienda}}
Telefono: {{telefonoAzienda}}
PEC: {{pecAzienda}}

Non esitate a contattarci per qualsiasi domanda o richiesta.

Un cordiale benvenuto,
{{nomeAzienda}}`
        },
        {
            id: 'scadenza_contratto',
            nome: 'Avviso Scadenza Contratto',
            icon: 'fas fa-clock',
            color: '#FFCC00',
            richiede: 'contratto',
            oggetto: 'Avviso scadenza contratto n. {{numeroContratto}}',
            corpo: `Gentile {{ragioneSociale}},

desideriamo informarVi che il contratto n. {{numeroContratto}} relativo a "{{oggettoContratto}}" è in scadenza il {{dataScadenza}}.

L'importo annuale attuale è di €{{importoContratto}} con periodicità {{periodicita}}.

Vi invitiamo a contattarci per discutere le condizioni di rinnovo e garantire la continuità del servizio.

Restiamo a disposizione per un incontro o una call.

Cordiali saluti,
{{nomeAzienda}}
{{emailAzienda}}
{{telefonoAzienda}}`
        }
    ],

    /**
     * Carica dati aziendali da Firestore (impostazioni/growapp)
     */
    async getDatiAzienda() {
        if (this._datiAzienda) return this._datiAzienda;

        try {
            const doc = await db.collection('impostazioni').doc('growapp').get();
            if (doc.exists) {
                this._datiAzienda = doc.data();
            } else {
                this._datiAzienda = {
                    ragioneSociale: 'Growapp S.r.l.',
                    email: '',
                    telefono: '',
                    pec: ''
                };
            }
            return this._datiAzienda;
        } catch (error) {
            console.warn('Errore caricamento dati azienda:', error);
            return { ragioneSociale: 'Growapp S.r.l.', email: '', telefono: '', pec: '' };
        }
    },

    // Cache template personalizzati da Firestore
    _templatePersonalizzati: null,

    /**
     * Carica template personalizzati da Firestore (se esistono)
     */
    async loadTemplatePersonalizzati() {
        if (this._templatePersonalizzati) return this._templatePersonalizzati;
        try {
            const doc = await db.collection('impostazioni').doc('template_email').get();
            if (doc.exists) {
                this._templatePersonalizzati = doc.data().templates || {};
            } else {
                this._templatePersonalizzati = {};
            }
            return this._templatePersonalizzati;
        } catch (error) {
            console.warn('Errore caricamento template personalizzati:', error);
            this._templatePersonalizzati = {};
            return {};
        }
    },

    /**
     * Genera testo dal template sostituendo i placeholder
     * Usa prima i template personalizzati da Firestore, poi quelli di default
     */
    async generaTesto(templateId, cliente, entita = null) {
        const templateBase = this.TEMPLATES.find(t => t.id === templateId);
        if (!templateBase) throw new Error('Template non trovato');

        // Carica eventuali personalizzazioni da Firestore
        const personalizzati = await this.loadTemplatePersonalizzati();
        const template = {
            ...templateBase,
            oggetto: personalizzati[templateId]?.oggetto || templateBase.oggetto,
            corpo: personalizzati[templateId]?.corpo || templateBase.corpo
        };

        const azienda = await this.getDatiAzienda();

        // Mappa placeholder → valore
        const valori = {
            // Dati cliente
            ragioneSociale: cliente.ragioneSociale || '',
            emailCliente: cliente.email || '',
            pecCliente: cliente.pec || '',
            telefonoCliente: cliente.telefono || '',
            comuneCliente: cliente.comune || '',
            provinciaCliente: cliente.provincia || '',

            // Dati azienda
            nomeAzienda: azienda.ragioneSociale || azienda.nomeAzienda || 'Growapp S.r.l.',
            emailAzienda: azienda.email || '',
            telefonoAzienda: azienda.telefono || '',
            pecAzienda: azienda.pec || '',
            indirizzoAzienda: azienda.indirizzo || '',
            sitoAzienda: azienda.sito || ''
        };

        // Dati fattura
        if (entita && template.richiede === 'fattura') {
            valori.numeroFattura = entita.numeroFatturaCompleto || '';
            valori.dataEmissione = entita.dataEmissione ? DataService.formatDate(entita.dataEmissione) : '';
            valori.importoFattura = entita.importoTotale ? DataService.formatCurrency(entita.importoTotale).replace('€', '').trim() : '0,00';
            valori.statoFattura = entita.statoPagamento?.replace('_', ' ') || '';
        }

        // Dati contratto
        if (entita && template.richiede === 'contratto') {
            valori.numeroContratto = entita.numeroContratto || '';
            valori.oggettoContratto = entita.oggetto || '';
            valori.importoContratto = entita.importoAnnuale ? DataService.formatCurrency(entita.importoAnnuale).replace('€', '').trim() : '0,00';
            valori.dataScadenza = entita.dataScadenza ? DataService.formatDate(entita.dataScadenza) : '';
            valori.dataInizio = entita.dataInizio ? DataService.formatDate(entita.dataInizio) : '';
            valori.periodicita = entita.periodicita || '';
            valori.statoContratto = entita.stato?.replace('_', ' ') || '';
        }

        // Sostituisci placeholder nel corpo e nell'oggetto
        let corpo = template.corpo;
        let oggetto = template.oggetto;

        for (const [key, value] of Object.entries(valori)) {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            corpo = corpo.replace(regex, value || '');
            oggetto = oggetto.replace(regex, value || '');
        }

        return { oggetto, corpo };
    },

    /**
     * Copia testo negli appunti
     */
    async copyToClipboard(testo) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(testo);
                return true;
            }
            // Fallback per browser meno recenti
            const textarea = document.createElement('textarea');
            textarea.value = testo;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            return true;
        } catch (error) {
            console.error('Errore copia negli appunti:', error);
            return false;
        }
    }
};

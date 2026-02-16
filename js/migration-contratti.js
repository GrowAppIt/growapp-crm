// Script Migrazione Clienti → Contratti
const MigrazioneContratti = {

    /**
     * Analizza i clienti e identifica quelli con dati contrattuali da migrare
     */
    async analizzaClienti() {
        try {
            const clienti = await DataService.getClienti();

            const clientiDaMigrare = clienti.filter(c =>
                c.dataScadenzaContratto ||
                c.importoContratto ||
                c.dataProssimaFattura
            );

            const report = {
                totaleClienti: clienti.length,
                clientiDaMigrare: clientiDaMigrare.length,
                clientiSenzaDati: clienti.length - clientiDaMigrare.length,
                dettaglio: {
                    conScadenza: clienti.filter(c => c.dataScadenzaContratto).length,
                    conImporto: clienti.filter(c => c.importoContratto).length,
                    conProssimaFattura: clienti.filter(c => c.dataProssimaFattura).length
                },
                clienti: clientiDaMigrare.map(c => ({
                    id: c.id,
                    ragioneSociale: c.ragioneSociale,
                    statoContratto: c.statoContratto,
                    dataScadenzaContratto: c.dataScadenzaContratto,
                    importoContratto: c.importoContratto,
                    dataProssimaFattura: c.dataProssimaFattura,
                    gestione: c.gestione
                }))
            };

            return report;
        } catch (error) {
            console.error('Errore analisi clienti:', error);
            throw error;
        }
    },

    /**
     * Calcola la data di inizio contratto (1 anno prima della scadenza, o oggi se manca)
     */
    calcolaDataInizio(dataScadenza) {
        if (!dataScadenza) {
            // Se non c'è scadenza, usa 1 anno fa da oggi
            const oggi = new Date();
            oggi.setFullYear(oggi.getFullYear() - 1);
            return oggi.toISOString();
        }

        const scadenza = new Date(dataScadenza);
        scadenza.setFullYear(scadenza.getFullYear() - 1);
        return scadenza.toISOString();
    },

    /**
     * Genera numero contratto progressivo
     */
    async generaNumeroContratto(anno, indice) {
        return `CTR-${anno}-${String(indice).padStart(3, '0')}`;
    },

    /**
     * Mappa lo stato cliente allo stato contratto
     */
    mappaStato(statoCliente) {
        const mappatura = {
            'ATTIVO': 'ATTIVO',
            'SCADUTO': 'SCADUTO',
            'CESSATO': 'CESSATO',
            'PROSPECT': 'ATTIVO', // Prospect → Attivo come default
            'DA_DEFINIRE': 'ATTIVO'
        };
        return mappatura[statoCliente] || 'ATTIVO';
    },

    /**
     * Rimuove campi undefined da un oggetto (Firebase non li accetta)
     */
    rimuoviUndefined(obj) {
        const pulito = {};
        for (const key in obj) {
            if (obj[key] !== undefined && obj[key] !== null) {
                if (typeof obj[key] === 'object' && !(obj[key] instanceof Date)) {
                    pulito[key] = this.rimuoviUndefined(obj[key]);
                } else {
                    pulito[key] = obj[key];
                }
            }
        }
        return pulito;
    },

    /**
     * Crea un contratto da un cliente
     */
    async creaContrattoCliente(cliente, numeroContratto) {
        const dataInizio = this.calcolaDataInizio(cliente.dataScadenzaContratto);
        const dataScadenza = cliente.dataScadenzaContratto || new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString();

        // Calcola durata in mesi tra inizio e scadenza
        const inizio = new Date(dataInizio);
        const scadenza = new Date(dataScadenza);
        const durataContratto = Math.round((scadenza - inizio) / (1000 * 60 * 60 * 24 * 30));

        const contratto = {
            clienteId: cliente.id,
            clienteRagioneSociale: cliente.ragioneSociale,
            numeroContratto: numeroContratto,
            oggetto: `Contratto Migrato - ${cliente.ragioneSociale}`,
            tipologia: 'SERVIZIO_APP', // Default, da modificare manualmente

            // Date
            dataInizio: dataInizio,
            dataScadenza: dataScadenza,
            dataFirma: null,
            durataContratto: durataContratto || 12,

            // Economico
            importoAnnuale: parseFloat(cliente.importoContratto) || 0,
            importoMensile: cliente.importoContratto ? parseFloat(cliente.importoContratto) / 12 : 0,
            periodicita: 'ANNUALE', // Default
            modalitaPagamento: 'ANTICIPATO', // Default

            // Stato
            stato: this.mappaStato(cliente.statoContratto),
            rinnovoAutomatico: false, // Default
            giorniPreavvisoRinnovo: 60,

            // Metadati
            note: this.generaNoteMigrazione(cliente),
            allegati: [],
            dataCreazione: new Date(),
            dataAggiornamento: new Date(),

            // Flag migrazione
            migrato: true,
            dataMigrazione: new Date(),
            clienteOriginale: {
                statoContratto: cliente.statoContratto,
                dataScadenzaContratto: cliente.dataScadenzaContratto,
                dataProssimaFattura: cliente.dataProssimaFattura,
                importoContratto: cliente.importoContratto,
                gestione: cliente.gestione
            }
        };

        // IMPORTANTE: Rimuovi campi undefined (Firebase non li accetta)
        return this.rimuoviUndefined(contratto);
    },

    /**
     * Genera note di migrazione con info originali
     */
    generaNoteMigrazione(cliente) {
        let note = `📋 CONTRATTO MIGRATO AUTOMATICAMENTE\n`;
        note += `Data migrazione: ${new Date().toLocaleDateString('it-IT')}\n\n`;
        note += `DATI ORIGINALI CLIENTE:\n`;
        note += `- Stato: ${cliente.statoContratto || 'N/A'}\n`;
        note += `- Scadenza: ${cliente.dataScadenzaContratto ? new Date(cliente.dataScadenzaContratto).toLocaleDateString('it-IT') : 'N/A'}\n`;
        note += `- Importo: ${cliente.importoContratto ? '€ ' + parseFloat(cliente.importoContratto).toFixed(2) : 'N/A'}\n`;
        note += `- Prossima fattura: ${cliente.dataProssimaFattura ? new Date(cliente.dataProssimaFattura).toLocaleDateString('it-IT') : 'N/A'}\n`;
        note += `- Gestione: ${cliente.gestione || 'N/A'}\n\n`;
        note += `⚠️ AZIONI NECESSARIE:\n`;
        note += `1. Verificare e correggere la tipologia contratto\n`;
        note += `2. Verificare importi e periodicità fatturazione\n`;
        note += `3. Aggiungere data firma se disponibile\n`;
        note += `4. Verificare data inizio (calcolata automaticamente)\n`;
        note += `5. Impostare rinnovo automatico se applicabile\n`;

        return note;
    },

    /**
     * Esegue la migrazione completa
     */
    async eseguiMigrazione(preview = false) {
        try {
            const report = await this.analizzaClienti();

            if (preview) {
                return {
                    success: true,
                    preview: true,
                    report: report
                };
            }

            // Esegui migrazione reale
            const anno = new Date().getFullYear();
            const risultati = {
                success: true,
                totaleClienti: report.clientiDaMigrare.length,
                contrattiCreati: 0,
                errori: [],
                dettagli: []
            };


            for (let i = 0; i < report.clienti.length; i++) {
                const cliente = report.clienti[i];

                try {

                    // Genera numero contratto progressivo
                    const numeroContratto = await this.generaNumeroContratto(anno, i + 1);

                    // Carica cliente completo
                    const clienteCompleto = await DataService.getCliente(cliente.id);

                    if (!clienteCompleto) {
                        throw new Error('Cliente non trovato');
                    }

                    // Crea contratto
                    const contratto = await this.creaContrattoCliente(clienteCompleto, numeroContratto);

                    // Salva su Firebase
                    const contrattoId = await DataService.createContratto(contratto);

                    if (!contrattoId) {
                        throw new Error('Errore creazione contratto su Firebase');
                    }

                    risultati.contrattiCreati++;
                    risultati.dettagli.push({
                        cliente: clienteCompleto.ragioneSociale,
                        numeroContratto: numeroContratto,
                        contrattoId: contrattoId,
                        success: true
                    });


                    // IMPORTANTE: Delay per evitare rate limiting Firebase
                    // Ogni 10 contratti, pausa più lunga
                    if ((i + 1) % 10 === 0) {
                        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 secondi
                    } else {
                        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms tra scritture
                    }

                } catch (error) {
                    console.error(`❌ [${i + 1}/${report.clienti.length}] Errore migrazione cliente ${cliente.ragioneSociale}:`, error);
                    risultati.errori.push({
                        cliente: cliente.ragioneSociale,
                        errore: error.message,
                        indice: i + 1
                    });
                    risultati.dettagli.push({
                        cliente: cliente.ragioneSociale,
                        success: false,
                        errore: error.message
                    });

                    // Continua anche in caso di errore
                }
            }

            if (risultati.errori.length > 0) {
            }

            return risultati;

        } catch (error) {
            console.error('Errore durante migrazione:', error);
            return {
                success: false,
                errore: error.message
            };
        }
    },

    /**
     * Verifica se la migrazione è già stata eseguita
     */
    async verificaMigrazioneEseguita() {
        try {
            const contratti = await DataService.getContratti();
            const contrattiMigrati = contratti.filter(c => c.migrato === true);

            return {
                giàEseguita: contrattiMigrati.length > 0,
                contrattiMigrati: contrattiMigrati.length,
                ultimaMigrazione: contrattiMigrati.length > 0 ?
                    contrattiMigrati[0].dataMigrazione : null
            };
        } catch (error) {
            console.error('Errore verifica migrazione:', error);
            return {
                giàEseguita: false,
                errore: error.message
            };
        }
    }
};

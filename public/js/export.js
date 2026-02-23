// Export Manager - Gestione export dati in Excel
const ExportManager = {

    // Verifica permesso export e restituisce dati filtrati per ruolo
    async _checkAndLoadData() {
        // Verifica permesso export
        if (typeof AuthService !== 'undefined' && !AuthService.hasPermission('export_data') && !AuthService.hasPermission('*')) {
            throw new Error('Non hai i permessi per esportare i dati');
        }

        // Se l'utente è un agente, carica solo i propri dati
        const isAgente = typeof AuthService !== 'undefined' && AuthService.canViewOnlyOwnData();
        if (isAgente) {
            const nomeAgente = AuthService.getAgenteFilterName();
            if (nomeAgente) {
                const datiAgente = await DataService.getDatiAgente(nomeAgente);
                return {
                    clienti: datiAgente.clienti || [],
                    fatture: datiAgente.fatture || [],
                    app: datiAgente.app || [],
                    filteredByAgent: true,
                    nomeAgente: nomeAgente
                };
            }
        }

        return { filteredByAgent: false };
    },

    // Colori tema Comune.Digital
    colors: {
        bluPrimario: 'FF145284',
        bluChiaro: 'FFD1E2F2',
        verdeSecondario: 'FF3CA434',
        verdeChiaro: 'FFE2F8DE',
        grigio: 'FFF5F5F5',
        bianco: 'FFFFFFFF'
    },

    // === EXPORT CLIENTI ===
    async exportClienti(clienti, nomeFile = 'Clienti_Comune_Digital') {
        try {
            await this._checkAndLoadData(); // verifica permessi
            // Prepara i dati
            const dati = clienti.map(c => ({
                'Ragione Sociale': c.ragioneSociale || '',
                'Partita IVA': c.partitaIva || '',
                'Codice Fiscale': c.codiceFiscale || '',
                'Indirizzo': c.indirizzo || '',
                'CAP': c.cap || '',
                'Comune': c.comune || '',
                'Provincia': c.provincia || '',
                'Regione': c.regione || '',
                'Telefono': c.telefono || '',
                'Email': c.email || '',
                'PEC': c.pec || '',
                'Codice SDI': c.codiceSdi || '',
                'Agente': c.agente || '',
                'Stato Contratto': c.statoContratto || '',
                'Tipo': c.tipo || '',
                'Gestione': c.gestione || '',
                'Data Scadenza Contratto': c.dataScadenzaContratto ? this.formatExcelDate(c.dataScadenzaContratto) : '',
                'Importo Contratto': c.importoContratto || '',
                'Note': c.note || ''
            }));

            // Crea workbook
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(dati);

            // Imposta larghezza colonne
            ws['!cols'] = [
                { wch: 35 }, // Ragione Sociale
                { wch: 15 }, // P.IVA
                { wch: 18 }, // CF
                { wch: 30 }, // Indirizzo
                { wch: 8 },  // CAP
                { wch: 20 }, // Comune
                { wch: 8 },  // Provincia
                { wch: 15 }, // Regione
                { wch: 15 }, // Telefono
                { wch: 25 }, // Email
                { wch: 25 }, // PEC
                { wch: 12 }, // SDI
                { wch: 20 }, // Agente
                { wch: 15 }, // Stato
                { wch: 12 }, // Tipo
                { wch: 15 }, // Gestione
                { wch: 18 }, // Data Scadenza
                { wch: 15 }, // Importo
                { wch: 40 }  // Note
            ];

            // Stile intestazioni
            this.styleHeader(ws, 19); // 19 colonne

            XLSX.utils.book_append_sheet(wb, ws, 'Clienti');

            // Download
            const fileName = `${nomeFile}_${this.getDateString()}.xlsx`;
            XLSX.writeFile(wb, fileName);

            UI.showSuccess(`File "${fileName}" scaricato con successo!`);
        } catch (error) {
            console.error('Errore export clienti:', error);
            UI.showError('Errore durante l\'export: ' + error.message);
        }
    },

    // === EXPORT FATTURE ===
    async exportFatture(fatture, nomeFile = 'Fatture_Comune_Digital') {
        try {
            await this._checkAndLoadData(); // verifica permessi
            const dati = fatture.map(f => ({
                'Numero Fattura': f.numeroFatturaCompleto || '',
                'Anno': f.anno || '',
                'Data Emissione': f.dataEmissione ? this.formatExcelDate(f.dataEmissione) : '',
                'Data Scadenza': f.dataScadenza ? this.formatExcelDate(f.dataScadenza) : '',
                'Data Pagamento': f.dataSaldo ? this.formatExcelDate(f.dataSaldo) : '',
                'Cliente': f.clienteRagioneSociale || f.clienteId || '',
                'Imponibile': f.imponibile || 0,
                'Aliquota IVA %': f.aliquotaIva || 0,
                'Importo IVA': f.importoIva || 0,
                'Totale': f.importoTotale || 0,
                'Stato Pagamento': f.statoPagamento || '',
                'Tipo': f.tipo || '',
                'Periodicità': f.periodicita || '',
                'Metodo Pagamento': f.metodoPagamento || '',
                'Note': f.note || ''
            }));

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(dati);

            // Larghezza colonne
            ws['!cols'] = [
                { wch: 18 }, // Numero
                { wch: 8 },  // Anno
                { wch: 15 }, // Data Emissione
                { wch: 15 }, // Data Scadenza
                { wch: 15 }, // Data Pagamento
                { wch: 35 }, // Cliente
                { wch: 12 }, // Imponibile
                { wch: 12 }, // IVA %
                { wch: 12 }, // Importo IVA
                { wch: 12 }, // Totale
                { wch: 15 }, // Stato
                { wch: 12 }, // Tipo
                { wch: 15 }, // Periodicità
                { wch: 18 }, // Metodo
                { wch: 40 }  // Note
            ];

            // Formato valuta per importi (colonne G, I, J)
            const range = XLSX.utils.decode_range(ws['!ref']);
            for (let row = 1; row <= range.e.r; row++) {
                ['G', 'I', 'J'].forEach(col => {
                    const cellRef = col + (row + 1);
                    if (ws[cellRef]) {
                        ws[cellRef].z = '€#,##0.00';
                    }
                });
            }

            this.styleHeader(ws, 15);

            XLSX.utils.book_append_sheet(wb, ws, 'Fatture');

            const fileName = `${nomeFile}_${this.getDateString()}.xlsx`;
            XLSX.writeFile(wb, fileName);

            UI.showSuccess(`File "${fileName}" scaricato con successo!`);
        } catch (error) {
            console.error('Errore export fatture:', error);
            UI.showError('Errore durante l\'export: ' + error.message);
        }
    },

    // === EXPORT APP ===
    async exportApp(apps, nomeFile = 'App_Comune_Digital') {
        try {
            await this._checkAndLoadData(); // verifica permessi
            const dati = apps.map(a => ({
                'Nome App': a.nome || '',
                'Comune': a.comune || '',
                'Provincia': a.provincia || '',
                'Regione': a.regione || '',
                'Cliente Pagante': a.clientePaganteRagioneSociale || 'Non collegata',
                'Agente': a.agente || '',
                'Tipo Pagamento': a.tipoPagamento || '',
                'Stato App': a.statoApp || '',
                'Data Pubb. Apple': a.dataPubblicazioneApple ? this.formatExcelDate(a.dataPubblicazioneApple) : '',
                'Data Pubb. Android': a.dataPubblicazioneAndroid ? this.formatExcelDate(a.dataPubblicazioneAndroid) : '',
                'Referente Comune': a.referenteComune || '',
                'Gruppo Telegram': a.hasGruppoTelegram ? 'Sì' : 'No',
                'Avvisi Flash': a.hasAvvisiFlash ? 'Sì' : 'No',
                'Downloads': a.numDownloads || 0,
                'Data Rilevamento Downloads': a.dataRilevamentoDownloads ? this.formatExcelDate(a.dataRilevamentoDownloads) : '',
                'Notifiche': a.numNotifiche || 0,
                'Data Rilevamento Notifiche': a.dataRilevamentoNotifiche ? this.formatExcelDate(a.dataRilevamentoNotifiche) : '',
                'Note 1': a.note1 || '',
                'Note 2': a.note2 || '',
                'Telefono': a.telefono || '',
                'Email': a.email || '',
                'PEC': a.pec || ''
            }));

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(dati);

            // Imposta larghezza colonne
            ws['!cols'] = [
                { wch: 35 }, // Nome App
                { wch: 20 }, // Comune
                { wch: 10 }, // Provincia
                { wch: 15 }, // Regione
                { wch: 30 }, // Cliente Pagante
                { wch: 20 }, // Agente
                { wch: 15 }, // Tipo Pagamento
                { wch: 15 }, // Stato App
                { wch: 15 }, // Data Apple
                { wch: 15 }, // Data Android
                { wch: 25 }, // Referente
                { wch: 12 }, // Telegram
                { wch: 12 }, // Avvisi Flash
                { wch: 12 }, // Downloads
                { wch: 18 }, // Data Download
                { wch: 12 }, // Notifiche
                { wch: 18 }, // Data Notifiche
                { wch: 40 }, // Note 1
                { wch: 40 }, // Note 2
                { wch: 15 }, // Telefono
                { wch: 25 }, // Email
                { wch: 25 }  // PEC
            ];

            // Stile intestazioni
            this.styleHeader(ws, 22); // 22 colonne

            XLSX.utils.book_append_sheet(wb, ws, 'App');

            // Download
            const fileName = `${nomeFile}_${this.getDateString()}.xlsx`;
            XLSX.writeFile(wb, fileName);

            UI.showSuccess(`File "${fileName}" scaricato con successo!`);
        } catch (error) {
            console.error('Errore export app:', error);
            UI.showError('Errore durante l\'export: ' + error.message);
        }
    },

    // === EXPORT SCADENZE ===
    async exportScadenze(scadenze, nomeFile = 'Scadenze_Comune_Digital') {
        try {
            await this._checkAndLoadData(); // verifica permessi
            const dati = scadenze.map(s => ({
                'Cliente': s.clienteRagioneSociale || s.clienteId || '',
                'Tipo': this.getTipoScadenzaLabel(s.tipo),
                'Data Scadenza': s.dataScadenza ? this.formatExcelDate(s.dataScadenza) : '',
                'Giorni Rimanenti': s.giorniRimanenti || this.calcolaGiorniRimanenti(s.dataScadenza),
                'Agente': s.agente || '',
                'Importo': s.importo || 0,
                'Completata': s.completata ? 'Sì' : 'No',
                'Data Completamento': s.dataCompletamento ? this.formatExcelDate(s.dataCompletamento) : '',
                'Descrizione': s.descrizione || '',
                'Note': s.note || ''
            }));

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(dati);

            ws['!cols'] = [
                { wch: 35 }, // Cliente
                { wch: 20 }, // Tipo
                { wch: 15 }, // Data Scadenza
                { wch: 15 }, // Giorni
                { wch: 20 }, // Agente
                { wch: 12 }, // Importo
                { wch: 12 }, // Completata
                { wch: 18 }, // Data Completamento
                { wch: 40 }, // Descrizione
                { wch: 40 }  // Note
            ];

            this.styleHeader(ws, 10);

            XLSX.utils.book_append_sheet(wb, ws, 'Scadenze');

            const fileName = `${nomeFile}_${this.getDateString()}.xlsx`;
            XLSX.writeFile(wb, fileName);

            UI.showSuccess(`File "${fileName}" scaricato con successo!`);
        } catch (error) {
            console.error('Errore export scadenze:', error);
            UI.showError('Errore durante l\'export: ' + error.message);
        }
    },

    // === EXPORT REPORT COMPLETO ===
    async exportReportCompleto() {
        try {
            UI.showLoading();

            // Verifica permessi e carica dati filtrati per ruolo
            const agentData = await this._checkAndLoadData();

            let clienti, fatture, scadenze, stats;
            if (agentData.filteredByAgent) {
                clienti = agentData.clienti;
                fatture = agentData.fatture;
                scadenze = await DataService.getScadenze();
                stats = await DataService.getStatistiche();
            } else {
                [clienti, fatture, scadenze, stats] = await Promise.all([
                    DataService.getClienti(),
                    DataService.getFatture({ limit: 2000 }),
                    DataService.getScadenze(),
                    DataService.getStatistiche()
                ]);
            }

            const wb = XLSX.utils.book_new();

            // FOGLIO 1: Overview
            const overview = [
                ['REPORT COMPLETO COMUNE.DIGITAL'],
                ['Generato il', new Date().toLocaleDateString('it-IT')],
                [],
                ['STATISTICHE GENERALI'],
                ['Totale Clienti', clienti.length],
                ['Totale Fatture', fatture.length],
                ['Fatturato Totale', stats.fatture.fatturatoTotale],
                ['Da Incassare', stats.fatture.importoNonPagato],
                ['Scadenze Attive', scadenze.length],
                [],
                ['CLIENTI PER STATO'],
                ...Object.entries(stats.clienti.perStato).map(([stato, count]) => [stato, count]),
                [],
                ['FATTURE PER STATO'],
                ...Object.entries(stats.fatture.perStato).map(([stato, count]) => [stato, count])
            ];

            const wsOverview = XLSX.utils.aoa_to_sheet(overview);
            wsOverview['!cols'] = [{ wch: 30 }, { wch: 20 }];
            XLSX.utils.book_append_sheet(wb, wsOverview, 'Overview');

            // FOGLIO 2: Clienti
            const datiClienti = clienti.map(c => ({
                'Ragione Sociale': c.ragioneSociale || '',
                'Provincia': c.provincia || '',
                'Agente': c.agente || '',
                'Stato': c.statoContratto || '',
                'Tipo': c.tipo || '',
                'Email': c.email || '',
                'Telefono': c.telefono || ''
            }));
            const wsClienti = XLSX.utils.json_to_sheet(datiClienti);
            wsClienti['!cols'] = [
                { wch: 35 }, { wch: 12 }, { wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 25 }, { wch: 15 }
            ];
            this.styleHeader(wsClienti, 7);
            XLSX.utils.book_append_sheet(wb, wsClienti, 'Clienti');

            // FOGLIO 3: Fatture
            const datiFatture = fatture.map(f => ({
                'Numero': f.numeroFatturaCompleto || '',
                'Data': f.dataEmissione ? this.formatExcelDate(f.dataEmissione) : '',
                'Cliente': f.clienteRagioneSociale || '',
                'Imponibile': f.imponibile || 0,
                'IVA': f.importoIva || 0,
                'Totale': f.importoTotale || 0,
                'Stato': f.statoPagamento || ''
            }));
            const wsFatture = XLSX.utils.json_to_sheet(datiFatture);
            wsFatture['!cols'] = [
                { wch: 18 }, { wch: 15 }, { wch: 35 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }
            ];
            this.styleHeader(wsFatture, 7);
            XLSX.utils.book_append_sheet(wb, wsFatture, 'Fatture');

            // FOGLIO 4: Top Clienti
            const fatturatoPerCliente = {};
            fatture.forEach(f => {
                if (f.clienteId) {
                    if (!fatturatoPerCliente[f.clienteId]) {
                        fatturatoPerCliente[f.clienteId] = {
                            ragioneSociale: f.clienteRagioneSociale || f.clienteId,
                            totale: 0,
                            numeroFatture: 0
                        };
                    }
                    const isNC = f.tipoDocumento === 'NOTA_DI_CREDITO' || (f.numeroFatturaCompleto || '').startsWith('NC-');
                    fatturatoPerCliente[f.clienteId].totale += isNC ? -Math.abs(f.importoTotale || 0) : (f.importoTotale || 0);
                    fatturatoPerCliente[f.clienteId].numeroFatture++;
                }
            });

            const topClienti = Object.values(fatturatoPerCliente)
                .sort((a, b) => b.totale - a.totale)
                .slice(0, 20)
                .map((c, i) => ({
                    'Pos.': i + 1,
                    'Cliente': c.ragioneSociale,
                    'N° Fatture': c.numeroFatture,
                    'Fatturato': c.totale
                }));

            const wsTop = XLSX.utils.json_to_sheet(topClienti);
            wsTop['!cols'] = [{ wch: 8 }, { wch: 35 }, { wch: 12 }, { wch: 15 }];
            this.styleHeader(wsTop, 4);
            XLSX.utils.book_append_sheet(wb, wsTop, 'Top Clienti');

            // FOGLIO 5: Scadenze
            const datiScadenze = scadenze.map(s => ({
                'Cliente': s.clienteRagioneSociale || '',
                'Tipo': this.getTipoScadenzaLabel(s.tipo),
                'Data Scadenza': s.dataScadenza ? this.formatExcelDate(s.dataScadenza) : '',
                'Completata': s.completata ? 'Sì' : 'No'
            }));
            const wsScadenze = XLSX.utils.json_to_sheet(datiScadenze);
            wsScadenze['!cols'] = [{ wch: 35 }, { wch: 20 }, { wch: 15 }, { wch: 12 }];
            this.styleHeader(wsScadenze, 4);
            XLSX.utils.book_append_sheet(wb, wsScadenze, 'Scadenze');

            UI.hideLoading();

            // Download
            const fileName = `Report_Completo_Comune_Digital_${this.getDateString()}.xlsx`;
            XLSX.writeFile(wb, fileName);

            UI.showSuccess(`Report completo "${fileName}" scaricato con successo!`);
        } catch (error) {
            console.error('Errore export report:', error);
            UI.hideLoading();
            UI.showError('Errore durante l\'export: ' + error.message);
        }
    },

    // === UTILITY ===
    styleHeader(worksheet, numCols) {
        // Stile header blu Comune.Digital
        for (let i = 0; i < numCols; i++) {
            const cellRef = XLSX.utils.encode_cell({ r: 0, c: i });
            if (!worksheet[cellRef]) continue;

            worksheet[cellRef].s = {
                fill: { fgColor: { rgb: this.colors.bluPrimario } },
                font: { bold: true, color: { rgb: this.colors.bianco }, sz: 12 },
                alignment: { horizontal: 'center', vertical: 'center' }
            };
        }
    },

    formatExcelDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('it-IT');
    },

    getDateString() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    },

    getTipoScadenzaLabel(tipo) {
        const labels = {
            'PAGAMENTO': 'Pagamento',
            'FATTURAZIONE': 'Fatturazione',
            'RINNOVO_CONTRATTO': 'Rinnovo Contratto',
            'CONTRATTO_RINNOVO': 'Rinnovo Contratto',
            'FATTURA_INCASSO': 'Fattura da Incassare',
            'FATTURA_EMISSIONE': 'Fattura da Emettere'
        };
        return labels[tipo] || tipo;
    },

    calcolaGiorniRimanenti(dataScadenza) {
        if (!dataScadenza) return 0;
        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);
        const scadenza = new Date(dataScadenza);
        scadenza.setHours(0, 0, 0, 0);
        return Math.ceil((scadenza - oggi) / (1000 * 60 * 60 * 24));
    },

    // === TEMPLATE EXCEL ===
    downloadTemplateClienti() {
        const wb = XLSX.utils.book_new();

        // Dati template con esempi
        const template = [
            // Intestazioni
            ['Ragione Sociale*', 'Partita IVA', 'Codice Fiscale', 'Indirizzo', 'CAP', 'Comune', 'Provincia', 'Regione', 'Telefono', 'Email', 'PEC', 'Codice SDI', 'Agente', 'Stato Contratto', 'Tipo', 'Gestione', 'Data Scadenza Contratto', 'Importo Contratto', 'Note'],
            // Formati
            ['Testo', 'Numero 11 cifre', 'Testo', 'Testo', '5 cifre', 'Testo', 'Sigla', 'Testo', 'Numero', 'email@esempio.it', 'email@esempio.it', '7 caratteri', 'Nome Cognome', 'ATTIVO/PROSPECT/SCADUTO/DA_DEFINIRE', 'PA/PRIVATO/ALTRO', 'Testo', 'gg/mm/aaaa', 'Numero', 'Testo'],
            // Esempi
            ['Comune di Udine', '12345678901', 'CMNSML80A01L483P', 'Piazza Libertà 1', '33100', 'Udine', 'UD', 'Friuli Venezia Giulia', '0432123456', 'ufficio@comune.udine.it', 'protocollo@pec.comune.udine.it', 'ABC1234', 'Mario Rossi', 'ATTIVO', 'PA', 'PA - Gestione Comune', '31/12/2025', '5000', 'Cliente principale'],
            ['Impresa Esempio SRL', '98765432109', '', 'Via Roma 10', '33100', 'Udine', 'UD', 'Friuli Venezia Giulia', '0432654321', 'info@impresa.it', 'pec@impresa.it', '', 'Lucia Bianchi', 'PROSPECT', 'PRIVATO', '', '', '', 'Nuovo prospect da contattare']
        ];

        const ws = XLSX.utils.aoa_to_sheet(template);

        // Larghezza colonne
        ws['!cols'] = [
            { wch: 30 }, { wch: 15 }, { wch: 18 }, { wch: 30 }, { wch: 8 }, { wch: 20 },
            { wch: 10 }, { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 12 },
            { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 15 }, { wch: 40 }
        ];

        // Stile intestazioni (blu)
        for (let i = 0; i < 19; i++) {
            const cellRef = XLSX.utils.encode_cell({ r: 0, c: i });
            if (ws[cellRef]) {
                ws[cellRef].s = {
                    fill: { fgColor: { rgb: this.colors.bluPrimario } },
                    font: { bold: true, color: { rgb: this.colors.bianco } }
                };
            }
        }

        // Stile riga formati (grigio)
        for (let i = 0; i < 19; i++) {
            const cellRef = XLSX.utils.encode_cell({ r: 1, c: i });
            if (ws[cellRef]) {
                ws[cellRef].s = {
                    fill: { fgColor: { rgb: this.colors.grigio } },
                    font: { italic: true, sz: 9 }
                };
            }
        }

        XLSX.utils.book_append_sheet(wb, ws, 'Template Clienti');

        // Sheet istruzioni
        const istruzioni = [
            ['ISTRUZIONI PER L\'IMPORT CLIENTI'],
            [''],
            ['1. CAMPI OBBLIGATORI (*)'],
            ['   - Ragione Sociale: Nome dell\'azienda o ente (obbligatorio)'],
            [''],
            ['2. FORMATI CORRETTI'],
            ['   - Date: gg/mm/aaaa (es. 31/12/2025)'],
            ['   - Partita IVA: 11 cifre numeriche'],
            ['   - Stato Contratto: ATTIVO, PROSPECT, SCADUTO, DA_DEFINIRE'],
            ['   - Tipo: PA (Pubblica Amministrazione), PRIVATO, ALTRO'],
            [''],
            ['3. COME USARE QUESTO TEMPLATE'],
            ['   - NON modificare la riga 1 (intestazioni)'],
            ['   - Cancella la riga 2 (formati) e 3-4 (esempi) prima dell\'import'],
            ['   - Inserisci i tuoi dati dalla riga 2 in poi'],
            ['   - Salva il file Excel'],
            ['   - Usa il pulsante "Importa Excel" nel CRM'],
            [''],
            ['4. AGGIORNAMENTO DATI ESISTENTI'],
            ['   - Se la Ragione Sociale esiste già, i dati verranno aggiornati'],
            ['   - Se non esiste, verrà creato un nuovo cliente'],
            [''],
            ['5. NOTE'],
            ['   - I campi vuoti non modificheranno i dati esistenti'],
            ['   - Controlla sempre l\'anteprima prima di confermare l\'import']
        ];

        const wsIstruzioni = XLSX.utils.aoa_to_sheet(istruzioni);
        wsIstruzioni['!cols'] = [{ wch: 80 }];
        XLSX.utils.book_append_sheet(wb, wsIstruzioni, 'Istruzioni');

        XLSX.writeFile(wb, `Template_Import_Clienti_${this.getDateString()}.xlsx`);
        UI.showSuccess('Template scaricato! Compila il file e usa "Importa Excel" per caricare i dati.');
    },

    downloadTemplateFatture() {
        const wb = XLSX.utils.book_new();

        const template = [
            ['Cliente ID*', 'Numero Fattura*', 'Anno*', 'Data Emissione*', 'Data Scadenza', 'Data Pagamento', 'Imponibile*', 'Aliquota IVA %', 'Importo IVA', 'Totale*', 'Stato Pagamento', 'Tipo', 'Periodicità', 'Metodo Pagamento', 'Note'],
            ['ID o Ragione Sociale', '2026/001', '2026', 'gg/mm/aaaa', 'gg/mm/aaaa', 'gg/mm/aaaa', 'Numero', 'Numero', 'Numero', 'Numero', 'PAGATA/NON_PAGATA/NOTA_CREDITO/RIFIUTATA', 'VENDITA/ALTRO', 'MENSILE/TRIMESTRALE/ANNUALE', 'BONIFICO/RID/ALTRO', 'Testo'],
            ['LETOJANNI', '2026/001', '2026', '15/01/2026', '15/02/2026', '', '1000.00', '22', '220.00', '1220.00', 'NON_PAGATA', 'VENDITA', 'MENSILE', 'BONIFICO', 'Fattura gennaio'],
            ['Comune di Udine', '2026/002', '2026', '20/01/2026', '20/02/2026', '25/01/2026', '500.00', '22', '110.00', '610.00', 'PAGATA', 'VENDITA', '', 'BONIFICO', '']
        ];

        const ws = XLSX.utils.aoa_to_sheet(template);
        ws['!cols'] = [
            { wch: 30 }, { wch: 15 }, { wch: 8 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
            { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 12 },
            { wch: 15 }, { wch: 18 }, { wch: 40 }
        ];

        this.styleHeader(ws, 15);

        XLSX.utils.book_append_sheet(wb, ws, 'Template Fatture');

        const istruzioni = [
            ['ISTRUZIONI PER L\'IMPORT FATTURE'],
            [''],
            ['CAMPI OBBLIGATORI: Cliente ID, Numero Fattura, Anno, Data Emissione, Imponibile, Totale'],
            [''],
            ['Cliente ID: Puoi usare l\'ID cliente o la Ragione Sociale esatta'],
            ['Date: Formato gg/mm/aaaa (es. 31/12/2026)'],
            ['Importi: Numeri decimali con punto (es. 1000.00)'],
            ['Stato Pagamento: PAGATA, NON_PAGATA, NOTA_CREDITO, RIFIUTATA'],
            [''],
            ['Cancella le righe di esempio (2-4) prima dell\'import!']
        ];

        const wsIstruzioni = XLSX.utils.aoa_to_sheet(istruzioni);
        wsIstruzioni['!cols'] = [{ wch: 80 }];
        XLSX.utils.book_append_sheet(wb, wsIstruzioni, 'Istruzioni');

        XLSX.writeFile(wb, `Template_Import_Fatture_${this.getDateString()}.xlsx`);
        UI.showSuccess('Template scaricato! Compila e usa "Importa Excel" per caricare.');
    },

    // === IMPORT EXCEL ===
    async importClienti() {
        // Crea input file nascosto
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.xls';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            UI.showLoading();

            try {
                const data = await this.readExcelFile(file);
                const clienti = this.parseClientiFromExcel(data);

                // Mostra preview
                this.showImportPreview('Clienti', clienti, async (confermati) => {
                    await this.saveClienti(confermati);
                });

            } catch (error) {
                UI.hideLoading();
                UI.showError('Errore lettura file: ' + error.message);
            }
        };
        input.click();
    },

    async importFatture() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.xls';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            UI.showLoading();

            try {
                const data = await this.readExcelFile(file);
                const fatture = this.parseFattureFromExcel(data);

                this.showImportPreview('Fatture', fatture, async (confermate) => {
                    await this.saveFatture(confermate);
                });

            } catch (error) {
                UI.hideLoading();
                UI.showError('Errore lettura file: ' + error.message);
            }
        };
        input.click();
    },

    async readExcelFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                    resolve(jsonData);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    },

    parseClientiFromExcel(data) {
        return data.map((row, index) => {
            const cliente = {
                ragioneSociale: row['Ragione Sociale*'] || row['Ragione Sociale'],
                partitaIva: row['Partita IVA'] || '',
                codiceFiscale: row['Codice Fiscale'] || '',
                indirizzo: row['Indirizzo'] || '',
                cap: row['CAP'] || '',
                comune: row['Comune'] || '',
                provincia: row['Provincia'] || '',
                regione: row['Regione'] || '',
                telefono: row['Telefono'] || '',
                email: row['Email'] || '',
                pec: row['PEC'] || '',
                codiceSdi: row['Codice SDI'] || '',
                agente: row['Agente'] || '',
                statoContratto: row['Stato Contratto'] || 'PROSPECT',
                tipo: row['Tipo'] || 'PRIVATO',
                gestione: row['Gestione'] || '',
                dataScadenzaContratto: this.parseExcelDate(row['Data Scadenza Contratto']),
                importoContratto: parseFloat(row['Importo Contratto']) || null,
                note: row['Note'] || '',
                _rowIndex: index + 2,
                _isValid: !!row['Ragione Sociale*'] || !!row['Ragione Sociale']
            };

            return cliente;
        }).filter(c => c._isValid);
    },

    parseFattureFromExcel(data) {
        return data.map((row, index) => {
            const fattura = {
                clienteId: row['Cliente ID*'] || row['Cliente ID'],
                numeroFatturaCompleto: row['Numero Fattura*'] || row['Numero Fattura'],
                anno: parseInt(row['Anno*'] || row['Anno']),
                dataEmissione: this.parseExcelDate(row['Data Emissione*'] || row['Data Emissione']),
                dataScadenza: this.parseExcelDate(row['Data Scadenza']),
                dataSaldo: this.parseExcelDate(row['Data Pagamento']),
                imponibile: parseFloat(row['Imponibile*'] || row['Imponibile']),
                aliquotaIva: parseFloat(row['Aliquota IVA %']) || null,
                importoIva: parseFloat(row['Importo IVA']) || null,
                importoTotale: parseFloat(row['Totale*'] || row['Totale']),
                statoPagamento: row['Stato Pagamento'] || 'NON_PAGATA',
                tipo: row['Tipo'] || 'VENDITA',
                periodicita: row['Periodicità'] || '',
                metodoPagamento: row['Metodo Pagamento'] || '',
                note: row['Note'] || '',
                _rowIndex: index + 2,
                _isValid: !!(row['Cliente ID*'] || row['Cliente ID']) && !!(row['Numero Fattura*'] || row['Numero Fattura'])
            };

            return fattura;
        }).filter(f => f._isValid);
    },

    parseExcelDate(value) {
        if (!value) return null;

        // Se è già una stringa ISO
        if (typeof value === 'string' && value.includes('-')) {
            return new Date(value).toISOString();
        }

        // Se è formato gg/mm/aaaa
        if (typeof value === 'string' && value.includes('/')) {
            const [day, month, year] = value.split('/');
            return new Date(year, month - 1, day).toISOString();
        }

        // Se è un numero Excel (giorni da 1900)
        if (typeof value === 'number') {
            const date = new Date((value - 25569) * 86400 * 1000);
            return date.toISOString();
        }

        return null;
    },

    showImportPreview(tipo, dati, onConfirm) {
        UI.hideLoading();

        const errori = dati.filter(d => !d._isValid);
        const validi = dati.filter(d => d._isValid);

        const modalContent = `
            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                    Preview Import ${tipo}
                </h3>
                <p style="color: var(--grigio-500);">
                    ${validi.length} record validi, ${errori.length} errori
                </p>
            </div>

            ${errori.length > 0 ? `
                <div style="padding: 1rem; background: #FFEBEE; border-left: 4px solid #D32F2F; border-radius: 8px; margin-bottom: 1rem;">
                    <strong style="color: #D32F2F;">⚠️ ${errori.length} record con errori (verranno ignorati)</strong>
                    <ul style="margin: 0.5rem 0 0 1.5rem; color: #B71C1C;">
                        ${errori.slice(0, 5).map(e => `<li>Riga ${e._rowIndex}: Campi obbligatori mancanti</li>`).join('')}
                        ${errori.length > 5 ? `<li>...e altri ${errori.length - 5} errori</li>` : ''}
                    </ul>
                </div>
            ` : ''}

            <div style="max-height: 400px; overflow-y: auto; border: 1px solid var(--grigio-300); border-radius: 8px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead style="position: sticky; top: 0; background: var(--blu-primario); color: white;">
                        <tr>
                            ${this.getPreviewHeaders(tipo)}
                        </tr>
                    </thead>
                    <tbody>
                        ${validi.slice(0, 50).map(d => this.getPreviewRow(tipo, d)).join('')}
                        ${validi.length > 50 ? `<tr><td colspan="10" style="padding: 1rem; text-align: center; color: var(--grigio-500);">...e altri ${validi.length - 50} record</td></tr>` : ''}
                    </tbody>
                </table>
            </div>

            <div style="margin-top: 1rem; padding: 1rem; background: var(--grigio-100); border-radius: 8px;">
                <strong>Confermi l'importazione di ${validi.length} record?</strong>
                <p style="font-size: 0.875rem; color: var(--grigio-500); margin: 0.5rem 0 0 0;">
                    I dati verranno salvati nel database. Questa operazione non può essere annullata.
                </p>
            </div>
        `;

        FormsManager.showModal(
            `<i class="fas fa-upload"></i> Import ${tipo}`,
            modalContent,
            () => onConfirm(validi)
        );
    },

    getPreviewHeaders(tipo) {
        if (tipo === 'Clienti') {
            return '<th style="padding: 0.75rem; text-align: left;">Ragione Sociale</th><th>Provincia</th><th>Tipo</th><th>Stato</th>';
        } else {
            return '<th style="padding: 0.75rem; text-align: left;">Numero</th><th>Cliente</th><th>Data</th><th>Totale</th>';
        }
    },

    getPreviewRow(tipo, data) {
        if (tipo === 'Clienti') {
            return `
                <tr style="border-bottom: 1px solid var(--grigio-300);">
                    <td style="padding: 0.75rem;">${data.ragioneSociale}</td>
                    <td style="padding: 0.75rem;">${data.provincia || '-'}</td>
                    <td style="padding: 0.75rem;">${data.tipo}</td>
                    <td style="padding: 0.75rem;"><span class="badge badge-${data.statoContratto === 'ATTIVO' ? 'success' : 'info'}">${data.statoContratto}</span></td>
                </tr>
            `;
        } else {
            return `
                <tr style="border-bottom: 1px solid var(--grigio-300);">
                    <td style="padding: 0.75rem;">${data.numeroFatturaCompleto}</td>
                    <td style="padding: 0.75rem;">${data.clienteId}</td>
                    <td style="padding: 0.75rem;">${DataService.formatDate(data.dataEmissione)}</td>
                    <td style="padding: 0.75rem;">${DataService.formatCurrency(data.importoTotale)}</td>
                </tr>
            `;
        }
    },

    async saveClienti(clienti) {
        UI.showLoading();

        try {
            let creati = 0;
            let aggiornati = 0;
            let errori = 0;

            for (const cliente of clienti) {
                try {
                    // Rimuovi campi interni
                    delete cliente._rowIndex;
                    delete cliente._isValid;

                    // Cerca cliente esistente per ragione sociale
                    const esistenti = await DataService.getClienti();
                    const esistente = esistenti.find(c =>
                        c.ragioneSociale.toLowerCase() === cliente.ragioneSociale.toLowerCase()
                    );

                    if (esistente) {
                        await DataService.updateCliente(esistente.id, cliente);
                        aggiornati++;
                    } else {
                        await DataService.createCliente(cliente);
                        creati++;
                    }
                } catch (error) {
                    console.error('Errore salvataggio cliente:', error);
                    errori++;
                }
            }

            UI.hideLoading();
            FormsManager.closeModal();

            UI.showSuccess(`Import completato! ${creati} creati, ${aggiornati} aggiornati, ${errori} errori`);

            // Ricarica lista clienti se siamo in quella pagina
            if (typeof Clienti !== 'undefined' && Clienti.render) {
                Clienti.render();
            }
        } catch (error) {
            UI.hideLoading();
            UI.showError('Errore durante l\'import: ' + error.message);
        }
    },

    async saveFatture(fatture) {
        UI.showLoading();

        try {
            let creati = 0;
            let errori = 0;

            for (const fattura of fatture) {
                try {
                    delete fattura._rowIndex;
                    delete fattura._isValid;

                    await DataService.createFattura(fattura);
                    creati++;
                } catch (error) {
                    console.error('Errore salvataggio fattura:', error);
                    errori++;
                }
            }

            UI.hideLoading();
            FormsManager.closeModal();

            UI.showSuccess(`Import completato! ${creati} fatture create, ${errori} errori`);

            if (typeof Fatture !== 'undefined' && Fatture.render) {
                Fatture.render();
            }
        } catch (error) {
            UI.hideLoading();
            UI.showError('Errore durante l\'import: ' + error.message);
        }
    }
};

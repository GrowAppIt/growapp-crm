// Script Duplicazione Clienti → App
// Copia TUTTI i clienti nella nuova collection "app" con stessa intestazione

const MigrazioneDuplicazione = {
    async duplicaTuttiClientiInApp() {
        try {

            // 1. Carica tutti i clienti
            const clienti = await DataService.getClienti();

            let creati = 0;
            let errori = 0;
            const report = [];

            // 2. Per ogni cliente, crea un'app identica
            for (const cliente of clienti) {
                try {
                    const appData = {
                        // Dati Comune (copiati da cliente)
                        nome: cliente.ragioneSociale,
                        partitaIva: cliente.pIva || null,
                        codiceFiscale: cliente.codiceFiscale || null,
                        indirizzo: cliente.indirizzo || null,
                        CAP: cliente.CAP || null,
                        comune: cliente.comune || null,
                        provincia: cliente.provincia || null,
                        telefono: cliente.telefono || null,
                        email: cliente.email || null,
                        pec: cliente.pec || null,
                        codiceSdi: cliente.codiceSdi || null,

                        // Riferimento al cliente (inizialmente null - da collegare manualmente)
                        clientePaganteId: null,
                        clientePaganteLegacyId: null,
                        tipoPagamento: null, // RIVENDITORE | DIRETTO - da impostare

                        // Stato App (copiato se presente)
                        statoApp: cliente.statoApp || 'IN_SVILUPPO',
                        dataAttivazione: cliente.dataInizioApp || null,
                        dataScadenza: cliente.dataScadenzaContratto || null,

                        // Info Tecniche App (NUOVI campi - inizialmente vuoti)
                        versione: null,
                        piattaforma: null,
                        dataPubblicazioneApple: null,
                        dataPubblicazioneAndroid: null,

                        // Referente Comune (NUOVO)
                        referenteComune: null,
                        emailReferente: null,
                        telefonoReferente: null,

                        // Engagement Metrics (NUOVI)
                        hasGruppoTelegram: false,
                        hasAvvisiFlash: false,
                        numDownloads: 0,
                        dataRilevamentoDownloads: null,
                        numNotifiche: 0,
                        dataRilevamentoNotifiche: null,

                        // Customizzazione (NUOVO)
                        campiPersonalizzati: {},

                        // Note (NUOVE)
                        note1: cliente.note || null,
                        note2: cliente.noteCristina || null,

                        // Contratto (copiato)
                        statoContratto: cliente.statoContratto || null,
                        dataScadenzaContratto: cliente.dataScadenzaContratto || null,

                        // Agente/Gestione (copiato)
                        agente: cliente.agente || null,
                        gestione: cliente.gestione || null,

                        // Migrazione tracking
                        migratoDA: cliente.id, // Firestore ID del cliente originale
                        clienteOriginaleLegacyId: cliente.clienteIdLegacy, // ID legacy
                        migrazioneData: new Date().toISOString(),
                        migrazioneCompleta: false // Marcatore per indicare se app è stata collegata al cliente pagante
                    };

                    // Crea record app
                    const appId = await DataService.createApp(appData);
                    creati++;

                    report.push({
                        clienteId: cliente.id,
                        clienteLegacyId: cliente.clienteIdLegacy,
                        ragioneSociale: cliente.ragioneSociale,
                        appId: appId,
                        status: 'OK'
                    });


                } catch (error) {
                    errori++;
                    report.push({
                        clienteId: cliente.id,
                        ragioneSociale: cliente.ragioneSociale,
                        status: 'ERROR',
                        error: error.message
                    });
                    console.error(`✗ Errore duplicazione ${cliente.ragioneSociale}:`, error);
                }
            }

            // 3. Riepilogo

            // 4. Mostra report all'utente
            this.mostraReportDuplicazione(report, creati, errori);

            return { success: true, creati, errori, report };

        } catch (error) {
            console.error('ERRORE CRITICO durante duplicazione:', error);
            alert('Errore durante la duplicazione: ' + error.message);
            return { success: false, error: error.message };
        }
    },

    mostraReportDuplicazione(report, creati, errori) {
        const modal = document.getElementById('modalOverlay');
        if (!modal) return;

        const erroriHtml = report
            .filter(r => r.status === 'ERROR')
            .map(r => `
                <div style="padding: 0.5rem; background: var(--rosso-errore); color: white; border-radius: 4px; margin-bottom: 0.5rem;">
                    <strong>${r.ragioneSociale}</strong>: ${r.error}
                </div>
            `).join('');

        const successHtml = creati > 0 ? `
            <div style="padding: 1rem; background: var(--verde-100); border-left: 4px solid var(--verde-700); margin-bottom: 1rem;">
                <strong style="color: var(--verde-900);">✓ ${creati} app create con successo!</strong>
            </div>
        ` : '';

        modal.innerHTML = `
            <div class="modal fade-in" style="max-width: 600px;">
                <div class="modal-header">
                    <h2>Duplicazione Completata</h2>
                    <button onclick="document.getElementById('modalOverlay').classList.add('hidden')" class="modal-close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    ${successHtml}

                    <p><strong>Prossimi passi:</strong></p>
                    <ol style="margin-left: 1.5rem; line-height: 1.8;">
                        <li>Vai alla pagina <strong>App</strong></li>
                        <li>Per ogni app, collega il <strong>Cliente Pagante</strong> corretto</li>
                        <li>Cancella i <strong>clienti</strong> che sono solo app</li>
                        <li>Cancella le <strong>app</strong> che sono solo clienti paganti</li>
                    </ol>

                    ${errori > 0 ? `
                        <h3 style="color: var(--rosso-errore); margin-top: 1.5rem;">Errori (${errori}):</h3>
                        ${erroriHtml}
                    ` : ''}
                </div>
                <div class="modal-footer">
                    <button onclick="UI.showPage('app')" class="btn btn-primary">
                        <i class="fas fa-mobile-alt"></i> Vai a gestione App
                    </button>
                    <button onclick="document.getElementById('modalOverlay').classList.add('hidden')" class="btn btn-secondary">
                        Chiudi
                    </button>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
    },

    // Metodo per avviare duplicazione con conferma
    async avviaDuplicazioneConConferma() {
        const conferma = confirm(
            '⚠️ ATTENZIONE!\n\n' +
            'Questa operazione creerà un record APP per OGNI cliente esistente.\n\n' +
            'Dopo dovrai manualmente:\n' +
            '1. Collegare ogni app al cliente pagante\n' +
            '2. Cancellare clienti che sono solo app\n' +
            '3. Cancellare app che sono solo clienti\n\n' +
            'Procedere con la duplicazione?'
        );

        if (!conferma) {
            return;
        }

        UI.showLoading();
        const risultato = await this.duplicaTuttiClientiInApp();
        UI.hideLoading();

        return risultato;
    }
};

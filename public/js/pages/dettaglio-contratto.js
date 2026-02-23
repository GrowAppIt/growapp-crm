// Dettaglio Contratto
const DettaglioContratto = {
    contrattoId: null,
    contratto: null,
    cliente: null,
    fatture: [],

    async render(contrattoId) {
        this.contrattoId = contrattoId;
        UI.showLoading();

        try {
            // Carica contratto
            this.contratto = await DataService.getContratto(contrattoId);

            if (!this.contratto) {
                UI.hideLoading();
                UI.showError('Contratto non trovato');
                UI.showPage('contratti');
                return;
            }

            // Carica dati collegati (no più scadenze vecchie da Firestore)
            const [cliente, fatture] = await Promise.all([
                DataService.getCliente(this.contratto.clienteId),
                DataService.getFattureContratto(contrattoId)
            ]);

            this.cliente = cliente;
            this.fatture = fatture || [];

            const mainContent = document.getElementById('mainContent');
            mainContent.innerHTML = `
                ${this.renderHeader()}

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(350px, 100%), 1fr)); gap: 1.5rem; margin-bottom: 1.5rem;">
                    <!-- Colonna Principale -->
                    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                        ${this.renderDatiContratto()}
                        ${this.renderEconomico()}
                        ${this.renderFatture()}
                    </div>

                    <!-- Colonna Laterale -->
                    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                        ${this.renderAzioni()}
                        ${this.renderScadenze()}
                        ${this.renderNote()}
                    </div>
                </div>

                <!-- Footer Audit -->
                ${this.contratto.ultimaModificaDa ? `
                <div style="margin-top: 1.5rem; padding: 0.75rem 1rem; background: var(--grigio-100); border-radius: 8px; display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: var(--grigio-500);">
                    <i class="fas fa-user-edit"></i>
                    Ultima modifica: <strong style="color: var(--grigio-700);">${this.contratto.ultimaModificaNome || this.contratto.ultimaModificaDa}</strong>
                    &mdash; ${new Date(this.contratto.ultimaModificaIl).toLocaleString('it-IT')}
                </div>
                ` : ''}
            `;

            UI.hideLoading();
        } catch (error) {
            console.error('Errore caricamento contratto:', error);
            UI.hideLoading();
            UI.showError('Errore nel caricamento: ' + error.message);
        }
    },

    renderHeader() {
        const badgeClass = this.getStatoBadgeClass(this.contratto.stato);
        const giorniRimanenti = this.contratto.dataScadenza ? this.calcolaGiorniRimanenti(this.contratto.dataScadenza) : null;
        const isInScadenza = giorniRimanenti !== null && giorniRimanenti <= 30 && giorniRimanenti >= 0 && this.contratto.stato === 'ATTIVO';

        return `
            <div class="page-header mb-3">
                <button class="btn btn-secondary mb-2" onclick="UI.showPage('contratti')">
                    <i class="fas fa-arrow-left"></i> Torna ai Contratti
                </button>

                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-top: 1rem;">
                    <div style="flex: 1;">
                        <div style="margin-bottom: 0.5rem;">
                            <a href="#" onclick="UI.showPage('dettaglio-cliente', '${this.contratto.clienteId}'); return false;"
                               style="font-size: 1.5rem; font-weight: 900; color: var(--blu-900); text-decoration: none; display: inline-block; line-height: 1.2; font-family: 'Titillium Web', sans-serif;">
                                <i class="fas fa-building" style="font-size: 1.2rem; color: var(--blu-700); margin-right: 0.35rem;"></i>${this.cliente?.ragioneSociale || 'Sconosciuto'}
                            </a>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                            <span style="font-size: 1.1rem; font-weight: 600; color: var(--grigio-700);">
                                <i class="fas fa-file-contract" style="color: var(--blu-700); margin-right: 0.25rem;"></i> ${this.contratto.numeroContratto || 'N/A'}
                            </span>
                            <span class="badge ${badgeClass}" style="font-size: 0.875rem;">
                                ${this.contratto.stato?.replace('_', ' ') || 'N/A'}
                            </span>
                            ${isInScadenza ? '<i class="fas fa-exclamation-triangle" style="color: var(--rosso-errore); font-size: 1.25rem;"></i>' : ''}
                        </div>
                        <div style="font-size: 0.875rem; color: var(--grigio-500);">
                            ${this.contratto.oggetto || 'Nessun oggetto'}
                        </div>
                        ${isInScadenza ? `
                            <div class="alert alert-warning" style="background: var(--giallo-avviso); padding: 0.75rem; margin-top: 1rem; border-radius: 8px; border-left: 4px solid #FFA000;">
                                <i class="fas fa-exclamation-triangle"></i>
                                <strong>In scadenza tra ${giorniRimanenti} giorni</strong> (${DataService.formatDate(this.contratto.dataScadenza)})
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    },

    renderDatiContratto() {
        const giorniRimanenti = this.contratto.dataScadenza ? this.calcolaGiorniRimanenti(this.contratto.dataScadenza) : null;

        return `
            <div class="card">
                <div class="card-header">
                    <h2 style="font-size: 1.25rem; font-weight: 600; color: var(--grigio-900); margin: 0;">
                        <i class="fas fa-info-circle"></i> Dati Contratto
                    </h2>
                </div>
                <div class="card-body">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 1rem;">
                        <div>
                            <label style="font-size: 0.75rem; color: var(--grigio-500); text-transform: uppercase; font-weight: 600;">Tipologia</label>
                            <div style="font-size: 1rem; color: var(--grigio-900); margin-top: 0.25rem;">
                                ${this.contratto.tipologia ? this.getTipologiaLabel(this.contratto.tipologia) : 'N/A'}
                            </div>
                        </div>

                        <div>
                            <label style="font-size: 0.75rem; color: var(--grigio-500); text-transform: uppercase; font-weight: 600;">Durata</label>
                            <div style="font-size: 1rem; color: var(--grigio-900); margin-top: 0.25rem;">
                                ${this.contratto.durataContratto ? this.contratto.durataContratto + ' mesi' : 'N/A'}
                            </div>
                        </div>

                        <div>
                            <label style="font-size: 0.75rem; color: var(--grigio-500); text-transform: uppercase; font-weight: 600;">Data Inizio</label>
                            <div style="font-size: 1rem; color: var(--grigio-900); margin-top: 0.25rem;">
                                ${this.contratto.dataInizio ? DataService.formatDate(this.contratto.dataInizio) : 'N/A'}
                            </div>
                        </div>

                        <div>
                            <label style="font-size: 0.75rem; color: var(--grigio-500); text-transform: uppercase; font-weight: 600;">Data Scadenza</label>
                            <div style="font-size: 1rem; color: var(--grigio-900); margin-top: 0.25rem;">
                                ${this.contratto.dataScadenza ? DataService.formatDate(this.contratto.dataScadenza) : 'N/A'}
                                ${giorniRimanenti !== null && this.contratto.stato === 'ATTIVO' ?
                                    `<span style="font-size: 0.875rem; color: ${giorniRimanenti <= 30 ? 'var(--rosso-errore)' : 'var(--grigio-500)'};">
                                        (${giorniRimanenti > 0 ? giorniRimanenti + ' giorni' : 'SCADUTO'})
                                    </span>`
                                : ''}
                            </div>
                        </div>

                        <div>
                            <label style="font-size: 0.75rem; color: var(--grigio-500); text-transform: uppercase; font-weight: 600;">Data Firma</label>
                            <div style="font-size: 1rem; color: var(--grigio-900); margin-top: 0.25rem;">
                                ${this.contratto.dataFirma ? DataService.formatDate(this.contratto.dataFirma) : 'N/A'}
                            </div>
                        </div>

                        <div>
                            <label style="font-size: 0.75rem; color: var(--grigio-500); text-transform: uppercase; font-weight: 600;">Rinnovo Automatico</label>
                            <div style="font-size: 1rem; color: var(--grigio-900); margin-top: 0.25rem;">
                                ${this.contratto.rinnovoAutomatico ?
                                    '<i class="fas fa-check" style="color: var(--verde-700);"></i> Sì' :
                                    '<i class="fas fa-times" style="color: var(--grigio-400);"></i> No'}
                                ${this.contratto.giorniPreavvisoRinnovo ? ` (${this.contratto.giorniPreavvisoRinnovo} gg preavviso)` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderEconomico() {
        return `
            <div class="card">
                <div class="card-header">
                    <h2 style="font-size: 1.25rem; font-weight: 600; color: var(--grigio-900); margin: 0;">
                        <i class="fas fa-euro-sign"></i> Dati Economici
                    </h2>
                </div>
                <div class="card-body">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 1rem;">
                        <div>
                            <label style="font-size: 0.75rem; color: var(--grigio-500); text-transform: uppercase; font-weight: 600;">Importo Contratto</label>
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--blu-700); margin-top: 0.25rem;">
                                ${this.contratto.importoAnnuale ? DataService.formatCurrency(this.contratto.importoAnnuale) : '-'}
                            </div>
                        </div>

                        <div>
                            <label style="font-size: 0.75rem; color: var(--grigio-500); text-transform: uppercase; font-weight: 600;">Importo Mensile</label>
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--blu-700); margin-top: 0.25rem;">
                                ${this.contratto.importoMensile ? DataService.formatCurrency(this.contratto.importoMensile) :
                                  (this.contratto.importoAnnuale ? DataService.formatCurrency(this.contratto.importoAnnuale / 12) : '-')}
                            </div>
                        </div>

                        <div>
                            <label style="font-size: 0.75rem; color: var(--grigio-500); text-transform: uppercase; font-weight: 600;">Periodicità Fatturazione</label>
                            <div style="font-size: 1rem; color: var(--grigio-900); margin-top: 0.25rem;">
                                ${this.contratto.periodicita || 'N/A'}
                            </div>
                        </div>

                        <div>
                            <label style="font-size: 0.75rem; color: var(--grigio-500); text-transform: uppercase; font-weight: 600;">Modalità Pagamento</label>
                            <div style="font-size: 1rem; color: var(--grigio-900); margin-top: 0.25rem;">
                                ${this.contratto.modalitaPagamento || 'N/A'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderFatture() {
        const fattureHtml = this.fatture.length > 0 ? this.fatture.map(f => `
            <div class="list-item" onclick="UI.showPage('dettaglio-fattura', '${f.id}')" style="cursor: pointer;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 600; color: var(--grigio-900);">
                            ${f.numeroFattura || 'N/A'} • ${f.dataEmissione ? DataService.formatDate(f.dataEmissione) : 'N/A'}
                        </div>
                        <div style="font-size: 0.875rem; color: var(--grigio-500); margin-top: 0.25rem;">
                            ${f.descrizione || 'Nessuna descrizione'}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: 700; color: var(--blu-700); font-size: 1.1rem;">
                            ${f.importo ? DataService.formatCurrency(f.importo) : '-'}
                        </div>
                        <span class="badge ${DataService.getStatoBadgeClass(f.stato)}">
                            ${f.stato || 'N/A'}
                        </span>
                    </div>
                </div>
            </div>
        `).join('') : `
            <div class="empty-state" style="padding: 2rem; text-align: center;">
                <i class="fas fa-file-invoice" style="font-size: 3rem; color: var(--grigio-300);"></i>
                <p style="color: var(--grigio-500); margin-top: 1rem;">Nessuna fattura collegata</p>
            </div>
        `;

        return `
            <div class="card">
                <div class="card-header">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h2 style="font-size: 1.25rem; font-weight: 600; color: var(--grigio-900); margin: 0;">
                            <i class="fas fa-file-invoice"></i> Fatture Collegate
                            ${this.fatture.length > 0 ? `<span style="font-size: 0.875rem; color: var(--grigio-500); font-weight: 400;"> (${this.fatture.length})</span>` : ''}
                        </h2>
                        <button class="btn btn-secondary btn-sm" onclick="FormsManager.showNuovaFattura('${this.contratto.clienteId}', '${this.contrattoId}')">
                            <i class="fas fa-plus"></i> Nuova Fattura
                        </button>
                    </div>
                </div>
                <div class="list-group">
                    ${fattureHtml}
                </div>
            </div>
        `;
    },

    renderAzioni() {
        // Gli agenti possono solo leggere, non modificare
        if (AuthService.canViewOnlyOwnData()) {
            return '';
        }

        const isAttivo = this.contratto.stato === 'ATTIVO';
        const isScaduto = this.contratto.stato === 'SCADUTO';

        return `
            <div class="card">
                <div class="card-header">
                    <h2 style="font-size: 1.25rem; font-weight: 600; color: var(--grigio-900); margin: 0;">
                        <i class="fas fa-tools"></i> Azioni
                    </h2>
                </div>
                <div class="card-body" style="display: flex; flex-direction: column; gap: 0.75rem;">
                    <button class="btn btn-primary btn-block" onclick="FormsManager.showModificaContratto('${this.contrattoId}')">
                        <i class="fas fa-edit"></i> Modifica Contratto
                    </button>

                    ${isAttivo || isScaduto ? `
                        <button class="btn btn-secondary btn-block" onclick="DettaglioContratto.rinnovaContratto()">
                            <i class="fas fa-sync-alt"></i> Rinnova Contratto
                        </button>
                    ` : ''}

                    ${isAttivo ? `
                        <button class="btn btn-secondary btn-block" onclick="DettaglioContratto.cessaContratto()">
                            <i class="fas fa-ban"></i> Cessa Contratto
                        </button>
                    ` : ''}

                    <button class="btn btn-danger btn-block" onclick="DettaglioContratto.eliminaContratto()">
                        <i class="fas fa-trash"></i> Elimina Contratto
                    </button>
                </div>
            </div>
        `;
    },

    renderScadenze() {
        // --- Calcolo riepilogo scadenze da dati reali ---

        // 1) Scadenza contratto
        const giorniAllaScadenza = this.contratto.dataScadenza ? this.calcolaGiorniRimanenti(this.contratto.dataScadenza) : null;
        const isAttivo = this.contratto.stato === 'ATTIVO';
        let scadenzaContrattoHtml = '';
        if (this.contratto.dataScadenza) {
            let colore = 'var(--grigio-700)';
            let icona = 'fa-calendar-check';
            let label = '';
            if (giorniAllaScadenza !== null && isAttivo) {
                if (giorniAllaScadenza < 0) {
                    colore = 'var(--rosso-errore)';
                    icona = 'fa-exclamation-circle';
                    label = 'SCADUTO';
                } else if (giorniAllaScadenza <= 30) {
                    colore = 'var(--rosso-errore)';
                    icona = 'fa-exclamation-triangle';
                    label = `tra ${giorniAllaScadenza} gg`;
                } else if (giorniAllaScadenza <= 90) {
                    colore = '#FFA000';
                    icona = 'fa-clock';
                    label = `tra ${giorniAllaScadenza} gg`;
                } else {
                    colore = 'var(--verde-700)';
                    icona = 'fa-check-circle';
                    label = `tra ${giorniAllaScadenza} gg`;
                }
            }
            scadenzaContrattoHtml = `
                <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; border-radius: 8px; background: ${giorniAllaScadenza !== null && giorniAllaScadenza <= 30 && isAttivo ? '#FFF3F3' : 'var(--grigio-100)'};">
                    <i class="fas ${icona}" style="color: ${colore}; font-size: 1.25rem; flex-shrink: 0;"></i>
                    <div style="flex: 1;">
                        <div style="font-size: 0.7rem; color: var(--grigio-500); text-transform: uppercase; font-weight: 600;">Scadenza Contratto</div>
                        <div style="font-weight: 600; color: var(--grigio-900); font-size: 0.95rem;">
                            ${DataService.formatDate(this.contratto.dataScadenza)}
                        </div>
                    </div>
                    ${label ? `<span style="font-size: 0.75rem; font-weight: 700; color: ${colore};">${label}</span>` : ''}
                </div>
            `;
        }

        // 2) Fatture da incassare (non pagate di questo contratto)
        const fattureDaIncassare = this.fatture.filter(f =>
            f.stato === 'NON_PAGATA' || f.stato === 'PARZIALMENTE_PAGATA'
        );

        let fattureIncassoHtml = '';
        if (fattureDaIncassare.length > 0) {
            const totaleNonPagato = fattureDaIncassare.reduce((sum, f) => {
                const importo = f.importo || 0;
                const pagato = f.importoPagato || 0;
                return sum + (importo - pagato);
            }, 0);

            fattureIncassoHtml = `
                <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; border-radius: 8px; background: #FFF3F3; cursor: pointer;"
                     onclick="document.getElementById('fattureIncassoDettaglio').style.display = document.getElementById('fattureIncassoDettaglio').style.display === 'none' ? 'block' : 'none'">
                    <i class="fas fa-file-invoice-dollar" style="color: var(--rosso-errore); font-size: 1.25rem; flex-shrink: 0;"></i>
                    <div style="flex: 1;">
                        <div style="font-size: 0.7rem; color: var(--grigio-500); text-transform: uppercase; font-weight: 600;">Fatture da Incassare</div>
                        <div style="font-weight: 600; color: var(--grigio-900); font-size: 0.95rem;">
                            ${fattureDaIncassare.length} fattur${fattureDaIncassare.length === 1 ? 'a' : 'e'}
                        </div>
                    </div>
                    <span style="font-size: 0.875rem; font-weight: 700; color: var(--rosso-errore);">
                        ${DataService.formatCurrency(totaleNonPagato)}
                    </span>
                </div>
                <div id="fattureIncassoDettaglio" style="display: none; padding: 0 0.5rem;">
                    ${fattureDaIncassare.map(f => `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border-bottom: 1px solid var(--grigio-300); cursor: pointer;"
                             onclick="UI.showPage('dettaglio-fattura', '${f.id}')">
                            <div>
                                <div style="font-size: 0.85rem; font-weight: 600; color: var(--grigio-900);">${f.numeroFattura || 'N/A'}</div>
                                <div style="font-size: 0.75rem; color: var(--grigio-500);">${f.dataEmissione ? DataService.formatDate(f.dataEmissione) : ''}</div>
                            </div>
                            <div style="font-size: 0.85rem; font-weight: 700; color: var(--rosso-errore);">
                                ${DataService.formatCurrency(f.importo || 0)}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // 3) Prossima fattura da emettere (calcolata dalla periodicità)
        let prossimaFatturaHtml = '';
        if (isAttivo && this.contratto.periodicita && this.contratto.dataInizio) {
            try {
                const fattureDaEmettere = DataService.calcolaFattureDaEmettere(
                    [this.contratto],
                    this.fatture
                );
                if (fattureDaEmettere.length > 0) {
                    // Prendi la prima (più urgente)
                    const prossima = fattureDaEmettere[0];
                    const oggi = new Date();
                    const dataScad = new Date(prossima.dataScadenza);
                    const giorniMancanti = Math.ceil((dataScad - oggi) / (1000 * 60 * 60 * 24));
                    const isScaduta = giorniMancanti < 0;

                    prossimaFatturaHtml = `
                        <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; border-radius: 8px; background: ${isScaduta ? '#FFF8E1' : '#E2F8DE'};">
                            <i class="fas ${isScaduta ? 'fa-exclamation-triangle' : 'fa-file-alt'}" style="color: ${isScaduta ? '#FFA000' : 'var(--verde-700)'}; font-size: 1.25rem; flex-shrink: 0;"></i>
                            <div style="flex: 1;">
                                <div style="font-size: 0.7rem; color: var(--grigio-500); text-transform: uppercase; font-weight: 600;">
                                    ${isScaduta ? 'Fattura da Emettere (in ritardo)' : 'Prossima Fattura da Emettere'}
                                </div>
                                <div style="font-weight: 600; color: var(--grigio-900); font-size: 0.95rem;">
                                    ${prossima.periodo || DataService.formatDate(prossima.dataScadenza)}
                                </div>
                            </div>
                            ${fattureDaEmettere.length > 1 ? `
                                <span style="font-size: 0.75rem; color: var(--grigio-500);">+${fattureDaEmettere.length - 1} altr${fattureDaEmettere.length - 1 === 1 ? 'a' : 'e'}</span>
                            ` : ''}
                        </div>
                    `;
                }
            } catch(e) {
                console.warn('Errore calcolo fatture da emettere:', e);
            }
        }

        // 4) Fatture pagate (conteggio rapido)
        const fatturePagate = this.fatture.filter(f => f.stato === 'PAGATA');
        let fatturePagateHtml = '';
        if (fatturePagate.length > 0) {
            const totalePagato = fatturePagate.reduce((sum, f) => sum + (f.importo || 0), 0);
            fatturePagateHtml = `
                <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; border-radius: 8px; background: #E2F8DE;">
                    <i class="fas fa-check-circle" style="color: var(--verde-700); font-size: 1.25rem; flex-shrink: 0;"></i>
                    <div style="flex: 1;">
                        <div style="font-size: 0.7rem; color: var(--grigio-500); text-transform: uppercase; font-weight: 600;">Fatture Incassate</div>
                        <div style="font-weight: 600; color: var(--grigio-900); font-size: 0.95rem;">
                            ${fatturePagate.length} fattur${fatturePagate.length === 1 ? 'a' : 'e'}
                        </div>
                    </div>
                    <span style="font-size: 0.875rem; font-weight: 700; color: var(--verde-700);">
                        ${DataService.formatCurrency(totalePagato)}
                    </span>
                </div>
            `;
        }

        // Se nessun dato disponibile
        const hasContent = scadenzaContrattoHtml || prossimaFatturaHtml || fattureIncassoHtml || fatturePagateHtml;

        return `
            <div class="card">
                <div class="card-header">
                    <h2 style="font-size: 1.25rem; font-weight: 600; color: var(--grigio-900); margin: 0;">
                        <i class="fas fa-calendar-alt"></i> Situazione
                    </h2>
                </div>
                <div class="card-body" style="display: flex; flex-direction: column; gap: 0.75rem;">
                    ${hasContent ? `
                        ${scadenzaContrattoHtml}
                        ${prossimaFatturaHtml}
                        ${fattureIncassoHtml}
                        ${fatturePagateHtml}
                    ` : `
                        <div style="padding: 1rem; text-align: center; color: var(--grigio-400);">
                            <i class="fas fa-calendar-check"></i> Nessuna scadenza attiva
                        </div>
                    `}
                </div>
            </div>
        `;
    },

    renderNote() {
        return `
            <div class="card">
                <div class="card-header">
                    <h2 style="font-size: 1.25rem; font-weight: 600; color: var(--grigio-900); margin: 0;">
                        <i class="fas fa-sticky-note"></i> Note
                    </h2>
                </div>
                <div class="card-body">
                    <div style="white-space: pre-wrap; color: var(--grigio-700); font-size: 0.875rem;">
                        ${this.contratto.note || '<span style="color: var(--grigio-400);">Nessuna nota inserita</span>'}
                    </div>
                </div>
            </div>
        `;
    },

    async rinnovaContratto() {
        // Apri form rinnovo
        FormsManager.showRinnovoContratto(this.contrattoId);
    },

    async cessaContratto() {
        const conferma = confirm(
            `⚠️ ATTENZIONE!\n\n` +
            `Sei sicuro di voler cessare il contratto "${this.contratto.numeroContratto}"?\n\n` +
            `Il contratto passerà allo stato CESSATO.\n` +
            `Le fatture e i dati storici rimarranno invariati.`
        );

        if (!conferma) return;

        try {
            UI.showLoading();
            await DataService.updateContratto(this.contrattoId, {
                stato: 'CESSATO',
                dataAggiornamento: new Date()
            });
            UI.hideLoading();
            UI.showSuccess('Contratto cessato con successo');
            await this.render(this.contrattoId);
        } catch (error) {
            console.error('Errore cessazione contratto:', error);
            UI.hideLoading();
            UI.showError('Errore nella cessazione: ' + error.message);
        }
    },

    async eliminaContratto() {
        const conferma = confirm(
            `⚠️ ATTENZIONE!\n\n` +
            `Sei sicuro di voler eliminare DEFINITIVAMENTE il contratto "${this.contratto.numeroContratto}"?\n\n` +
            `Questa operazione eliminerà:\n` +
            `• Il contratto\n` +
            `• I collegamenti dalle fatture (le fatture rimarranno)\n` +
            `• Le scadenze collegate\n\n` +
            `QUESTA OPERAZIONE NON PUÒ ESSERE ANNULLATA!`
        );

        if (!conferma) return;

        try {
            UI.showLoading();
            await DataService.deleteContratto(this.contrattoId);
            UI.hideLoading();
            UI.showSuccess(`Contratto "${this.contratto.numeroContratto}" eliminato`);
            UI.showPage('contratti');
        } catch (error) {
            console.error('Errore eliminazione contratto:', error);
            UI.hideLoading();
            UI.showError('Errore nell\'eliminazione: ' + error.message);
        }
    },

    // Helper methods
    getStatoBadgeClass(stato) {
        const badgeMap = {
            'ATTIVO': 'badge-success',
            'SCADUTO': 'badge-warning',
            'CESSATO': 'badge-secondary',
            'IN_RINNOVO': 'badge-info',
            'SOSPESO': 'badge-danger'
        };
        return badgeMap[stato] || 'badge-secondary';
    },

    getTipologiaLabel(tipologia) {
        const labels = {
            'SERVIZIO_APP': 'Servizio App',
            'MANUTENZIONE': 'Manutenzione',
            'CONSULENZA': 'Consulenza',
            'SERVIZI': 'Servizi',
            'ALTRO': 'Altro'
        };
        return labels[tipologia] || tipologia;
    },

    calcolaGiorniRimanenti(dataScadenza) {
        if (!dataScadenza) return null;
        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);
        const scadenza = new Date(dataScadenza);
        scadenza.setHours(0, 0, 0, 0);
        return Math.ceil((scadenza - oggi) / (1000 * 60 * 60 * 24));
    },

    // getScadenzaBadgeClass rimosso: le scadenze ora sono calcolate in tempo reale
};

// Dettaglio Fattura Page
const DettaglioFattura = {
    fatturaId: null,
    fattura: null,

    async render(fatturaId) {
        this.fatturaId = fatturaId;
        UI.showLoading();

        try {
            // Carica dati fattura
            const fattura = await DataService.getFattura(fatturaId);

            if (!fattura) {
                UI.hideLoading();
                UI.showError('Fattura non trovata');
                return;
            }

            this.fattura = fattura; // Salva per uso successivo

            // Carica cliente associato
            const cliente = fattura.clienteId ? await DataService.getClienteByLegacyId(fattura.clienteId) : null;

            const mainContent = document.getElementById('mainContent');
            mainContent.innerHTML = `
                <div class="page-header mb-3">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem;">
                        <button class="btn btn-secondary btn-sm" onclick="UI.showPage('fatture')">
                            <i class="fas fa-arrow-left"></i> Torna alle fatture
                        </button>
                        <div style="display: flex; gap: 0.5rem;">
                            ${fattura.statoPagamento === 'NON_PAGATA' ? `
                                <button class="btn btn-success btn-sm" onclick="FormsManager.marcaFatturaPagata('${fattura.id}')">
                                    <i class="fas fa-check"></i> Marca Pagata
                                </button>
                            ` : ''}
                            <button class="btn btn-primary btn-sm" onclick="DettaglioFattura.editFattura()">
                                <i class="fas fa-edit"></i> Modifica
                            </button>
                        </div>
                    </div>
                    <h1 style="font-size: 2rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                        <i class="fas fa-file-invoice"></i> ${fattura.numeroFatturaCompleto || 'Fattura'}
                    </h1>
                    <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                        <span class="badge ${DataService.getStatoBadgeClass(fattura.statoPagamento)}">
                            ${fattura.statoPagamento?.replace('_', ' ') || 'N/A'}
                        </span>
                        <span style="color: var(--grigio-500);">
                            <i class="fas fa-calendar"></i> ${DataService.formatDate(fattura.dataEmissione)}
                        </span>
                        <span style="color: var(--grigio-500);">
                            <i class="fas fa-euro-sign"></i> ${DataService.formatCurrency(fattura.importoTotale)}
                        </span>
                    </div>
                </div>

                <!-- Dettagli Fattura -->
                ${this.renderDettagliFattura(fattura, cliente)}
            `;

            UI.hideLoading();
        } catch (error) {
            console.error('Errore caricamento dettaglio fattura:', error);
            UI.hideLoading();
            UI.showError('Errore nel caricamento della fattura');
        }
    },

    renderDettagliFattura(fattura, cliente) {
        return `
            <!-- Cliente -->
            ${cliente ? `
                <div class="card fade-in mb-3">
                    <div class="card-header">
                        <h2 class="card-title">
                            <i class="fas fa-building"></i> Cliente
                        </h2>
                    </div>
                    <div style="padding: 1.5rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                            <div>
                                <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.25rem;">
                                    ${cliente.ragioneSociale}
                                </h3>
                                <p style="color: var(--grigio-500); margin: 0;">
                                    ${cliente.indirizzo || ''} ${cliente.comune || ''} ${cliente.provincia || ''}
                                </p>
                            </div>
                            <button class="btn btn-primary btn-sm" onclick="UI.showPage('dettaglio-cliente', '${cliente.id}')">
                                <i class="fas fa-eye"></i> Vedi cliente
                            </button>
                        </div>
                    </div>
                </div>
            ` : ''}

            <!-- Informazioni Fattura -->
            <div class="card fade-in mb-3">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-info-circle"></i> Informazioni Fattura
                    </h2>
                </div>
                <div style="padding: 1.5rem;">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem;">
                        ${this.renderInfoField('Numero Fattura', fattura.numeroFatturaCompleto, 'file-invoice')}
                        ${this.renderInfoField('Anno', fattura.anno, 'calendar')}
                        ${this.renderInfoField('Data Emissione', DataService.formatDate(fattura.dataEmissione), 'calendar-day')}
                        ${fattura.dataScadenza ? this.renderInfoField('Data Scadenza', DataService.formatDate(fattura.dataScadenza), 'calendar-times') : ''}
                        ${fattura.dataSaldo ? this.renderInfoField('Data Pagamento', DataService.formatDate(fattura.dataSaldo), 'calendar-check') : ''}
                        ${this.renderInfoField('Periodicità', fattura.periodicita, 'clock')}
                        ${this.renderInfoField('Tipo', fattura.tipo, 'tag')}
                        ${this.renderInfoField('Stato Pagamento', fattura.statoPagamento?.replace('_', ' '), 'check-circle')}
                        ${fattura.metodoPagamento ? this.renderInfoField('Metodo Pagamento', fattura.metodoPagamento, 'credit-card') : ''}
                    </div>
                </div>
            </div>

            <!-- Importi -->
            <div class="card fade-in mb-3">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-euro-sign"></i> Importi
                    </h2>
                </div>
                <div style="padding: 1.5rem;">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem;">
                        ${fattura.imponibile ? this.renderImportoField('Imponibile', fattura.imponibile, 'receipt') : ''}
                        ${fattura.importoIva ? this.renderImportoField('IVA' + (fattura.aliquotaIva ? ` (${fattura.aliquotaIva}%)` : ''), fattura.importoIva, 'percent') : ''}
                        ${this.renderImportoField('Totale Fattura', fattura.importoTotale, 'file-invoice-dollar', true)}
                    </div>

                    ${cliente ? `
                        <div style="margin-top: 1.5rem; padding: 1rem; background: #E1F5FE; border-left: 4px solid #0288D1; border-radius: 8px;">
                            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                                <i class="fas fa-landmark" style="color: #0288D1;"></i>
                                <h3 style="font-size: 0.875rem; font-weight: 700; color: #01579B; margin: 0;">
                                    Split Payment
                                </h3>
                            </div>
                            <p style="font-size: 0.875rem; color: #01579B; margin: 0 0 0.75rem 0;">
                                ${cliente.tipo === 'PA' || cliente.gestione?.includes('PA') || cliente.ragioneSociale?.includes('COMUNE') ?
                                    '🏛️ <strong>Cliente PA</strong> - L\'IVA è a carico dell\'Erario (Split Payment)' :
                                    '🏢 <strong>Cliente Privato</strong> - IVA da incassare'
                                }
                            </p>
                            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.75rem; border-top: 1px solid rgba(1,87,155,0.2);">
                                <span style="font-size: 0.875rem; font-weight: 600; color: #01579B;">
                                    💰 Da Incassare:
                                </span>
                                <span style="font-size: 1.25rem; font-weight: 700; color: #0288D1;">
                                    ${DataService.formatCurrency(
                                        (cliente.tipo === 'PA' || cliente.gestione?.includes('PA') || cliente.ragioneSociale?.includes('COMUNE'))
                                            ? fattura.imponibile
                                            : fattura.importoTotale
                                    )}
                                </span>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>

            <!-- Note -->
            ${fattura.note || fattura.noteConsolidate ? `
                <div class="card fade-in">
                    <div class="card-header">
                        <h2 class="card-title">
                            <i class="fas fa-sticky-note"></i> Note
                        </h2>
                    </div>
                    <div style="padding: 1.5rem;">
                        ${fattura.note ? `
                            <div style="margin-bottom: 1rem;">
                                <h3 style="font-size: 0.875rem; font-weight: 700; color: var(--grigio-700); margin-bottom: 0.5rem;">Note:</h3>
                                <p style="color: var(--grigio-900); white-space: pre-wrap;">${fattura.note}</p>
                            </div>
                        ` : ''}
                        ${fattura.noteConsolidate ? `
                            <div>
                                <h3 style="font-size: 0.875rem; font-weight: 700; color: var(--grigio-700); margin-bottom: 0.5rem;">Note Consolidate:</h3>
                                <p style="color: var(--grigio-900); white-space: pre-wrap;">${fattura.noteConsolidate}</p>
                            </div>
                        ` : ''}
                    </div>
                </div>
            ` : ''}
        `;
    },

    renderInfoField(label, value, icon) {
        if (!value && value !== 0) return '';
        return `
            <div>
                <div style="font-size: 0.75rem; font-weight: 600; color: var(--grigio-500); text-transform: uppercase; margin-bottom: 0.25rem;">
                    <i class="fas fa-${icon}"></i> ${label}
                </div>
                <div style="font-size: 1rem; font-weight: 600; color: var(--grigio-900);">
                    ${value}
                </div>
            </div>
        `;
    },

    renderImportoField(label, value, icon, highlight = false) {
        if (!value && value !== 0) return '';
        const color = highlight ? 'var(--blu-700)' : 'var(--grigio-900)';
        const size = highlight ? '1.5rem' : '1rem';
        return `
            <div>
                <div style="font-size: 0.75rem; font-weight: 600; color: var(--grigio-500); text-transform: uppercase; margin-bottom: 0.25rem;">
                    <i class="fas fa-${icon}"></i> ${label}
                </div>
                <div style="font-size: ${size}; font-weight: 700; color: ${color};">
                    ${DataService.formatCurrency(value)}
                </div>
            </div>
        `;
    },

    editFattura() {
        if (this.fattura) {
            FormsManager.showModificaFattura(this.fattura);
        }
    }
};

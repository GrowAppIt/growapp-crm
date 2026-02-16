// Dettaglio Scadenza Page
const DettaglioScadenza = {
    scadenzaId: null,
    scadenza: null,

    async render(scadenzaId) {
        this.scadenzaId = scadenzaId;
        UI.showLoading();

        try {
            // Carica dati scadenza
            const scadenza = await DataService.getScadenza(scadenzaId);

            if (!scadenza) {
                UI.hideLoading();
                UI.showError('Scadenza non trovata');
                return;
            }

            this.scadenza = scadenza; // Salva per uso successivo

            // Carica cliente associato (se presente)
            const cliente = scadenza.clienteId ? await DataService.getClienteByLegacyId(scadenza.clienteId) : null;

            // Carica fattura associata (se presente)
            const fattura = scadenza.fatturaId ? await DataService.getFattura(scadenza.fatturaId) : null;

            // Calcola urgenza
            const urgenza = DataService.getUrgenzaScadenza(scadenza.dataScadenza);
            const giorniRimanenti = scadenza.giorniRimanenti || this.calcolaGiorniRimanenti(scadenza.dataScadenza);

            const mainContent = document.getElementById('mainContent');
            mainContent.innerHTML = `
                <div class="page-header mb-3">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem;">
                        <button class="btn btn-secondary btn-sm" onclick="UI.showPage('scadenzario')">
                            <i class="fas fa-arrow-left"></i> Torna allo scadenzario
                        </button>
                        <div style="display: flex; gap: 0.5rem;">
                            ${!scadenza.completata ? `
                                <button class="btn btn-success btn-sm" onclick="FormsManager.marcaScadenzaCompletata('${scadenza.id}')">
                                    <i class="fas fa-check"></i> Marca Completata
                                </button>
                            ` : ''}
                            <button class="btn btn-primary btn-sm" onclick="DettaglioScadenza.editScadenza()">
                                <i class="fas fa-edit"></i> Modifica
                            </button>
                        </div>
                    </div>
                    <h1 style="font-size: 2rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                        <i class="fas fa-${this.getTipoIcon(scadenza.tipo)}"></i> ${this.getTipoLabel(scadenza.tipo)}
                    </h1>
                    <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                        <span class="badge ${this.getUrgenzaBadgeClass(urgenza)}">
                            ${this.getUrgenzaLabel(urgenza, giorniRimanenti)}
                        </span>
                        <span style="color: var(--grigio-500);">
                            <i class="fas fa-calendar"></i> ${DataService.formatDate(scadenza.dataScadenza)}
                        </span>
                        ${scadenza.completata ? '<span class="badge badge-success">COMPLETATA</span>' : ''}
                    </div>
                </div>

                <!-- Dettagli Scadenza -->
                ${this.renderDettagliScadenza(scadenza, cliente, fattura, urgenza, giorniRimanenti)}
            `;

            UI.hideLoading();
        } catch (error) {
            console.error('Errore caricamento dettaglio scadenza:', error);
            UI.hideLoading();
            UI.showError('Errore nel caricamento della scadenza');
        }
    },

    renderDettagliScadenza(scadenza, cliente, fattura, urgenza, giorniRimanenti) {
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
            ` : scadenza.clienteRagioneSociale ? `
                <div class="card fade-in mb-3">
                    <div class="card-header">
                        <h2 class="card-title">
                            <i class="fas fa-building"></i> Cliente
                        </h2>
                    </div>
                    <div style="padding: 1.5rem;">
                        <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--blu-700);">
                            ${scadenza.clienteRagioneSociale}
                        </h3>
                    </div>
                </div>
            ` : ''}

            <!-- Fattura Collegata -->
            ${fattura ? `
                <div class="card fade-in mb-3">
                    <div class="card-header">
                        <h2 class="card-title">
                            <i class="fas fa-file-invoice"></i> Fattura Collegata
                        </h2>
                    </div>
                    <div style="padding: 1.5rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                            <div>
                                <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.25rem;">
                                    ${fattura.numeroFatturaCompleto}
                                </h3>
                                <p style="color: var(--grigio-500); margin: 0;">
                                    <i class="fas fa-calendar"></i> ${DataService.formatDate(fattura.dataEmissione)} •
                                    <i class="fas fa-euro-sign"></i> ${DataService.formatCurrency(fattura.importoTotale)}
                                </p>
                            </div>
                            <button class="btn btn-primary btn-sm" onclick="UI.showPage('dettaglio-fattura', '${fattura.id}')">
                                <i class="fas fa-eye"></i> Vedi fattura
                            </button>
                        </div>
                    </div>
                </div>
            ` : ''}

            <!-- Informazioni Scadenza -->
            <div class="card fade-in mb-3">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-info-circle"></i> Informazioni Scadenza
                    </h2>
                </div>
                <div style="padding: 1.5rem;">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem;">
                        ${this.renderInfoField('Tipo', this.getTipoLabel(scadenza.tipo), this.getTipoIcon(scadenza.tipo))}
                        ${this.renderInfoField('Data Scadenza', DataService.formatDate(scadenza.dataScadenza), 'calendar-alt')}
                        ${this.renderInfoField('Urgenza', this.getUrgenzaLabel(urgenza, giorniRimanenti), 'exclamation-triangle')}
                        ${scadenza.agente ? this.renderInfoField('Agente', scadenza.agente, 'user') : ''}
                        ${scadenza.importo ? this.renderInfoField('Importo', DataService.formatCurrency(scadenza.importo), 'euro-sign') : ''}
                        ${this.renderInfoField('Stato', scadenza.completata ? 'Completata' : 'Da completare', scadenza.completata ? 'check-circle' : 'clock')}
                    </div>

                    <!-- Alert Urgenza -->
                    ${urgenza === 'scaduto' ? `
                        <div style="margin-top: 1.5rem; padding: 1rem; background: #FFEBEE; border-left: 4px solid #D32F2F; border-radius: 8px;">
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <i class="fas fa-exclamation-circle" style="color: #D32F2F; font-size: 1.25rem;"></i>
                                <h3 style="font-size: 0.875rem; font-weight: 700; color: #B71C1C; margin: 0;">
                                    ⚠️ SCADENZA SUPERATA
                                </h3>
                            </div>
                            <p style="font-size: 0.875rem; color: #B71C1C; margin: 0.5rem 0 0 0;">
                                Questa scadenza è stata superata. È necessario intervenire immediatamente.
                            </p>
                        </div>
                    ` : urgenza === 'critico' ? `
                        <div style="margin-top: 1.5rem; padding: 1rem; background: #FFF3E0; border-left: 4px solid #F57C00; border-radius: 8px;">
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <i class="fas fa-exclamation-triangle" style="color: #F57C00; font-size: 1.25rem;"></i>
                                <h3 style="font-size: 0.875rem; font-weight: 700; color: #E65100; margin: 0;">
                                    ⚡ SCADENZA CRITICA
                                </h3>
                            </div>
                            <p style="font-size: 0.875rem; color: #E65100; margin: 0.5rem 0 0 0;">
                                Mancano solo ${giorniRimanenti} giorni alla scadenza. Agire con urgenza.
                            </p>
                        </div>
                    ` : ''}
                </div>
            </div>

            <!-- Note -->
            ${scadenza.note || scadenza.descrizione ? `
                <div class="card fade-in">
                    <div class="card-header">
                        <h2 class="card-title">
                            <i class="fas fa-sticky-note"></i> Note
                        </h2>
                    </div>
                    <div style="padding: 1.5rem;">
                        ${scadenza.note ? `
                            <div style="margin-bottom: ${scadenza.descrizione ? '1rem' : '0'};">
                                <h3 style="font-size: 0.875rem; font-weight: 700; color: var(--grigio-700); margin-bottom: 0.5rem;">Note:</h3>
                                <p style="color: var(--grigio-900); white-space: pre-wrap;">${scadenza.note}</p>
                            </div>
                        ` : ''}
                        ${scadenza.descrizione ? `
                            <div>
                                <h3 style="font-size: 0.875rem; font-weight: 700; color: var(--grigio-700); margin-bottom: 0.5rem;">Descrizione:</h3>
                                <p style="color: var(--grigio-900); white-space: pre-wrap;">${scadenza.descrizione}</p>
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

    calcolaGiorniRimanenti(dataScadenza) {
        if (!dataScadenza) return 0;
        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);
        const scadenza = new Date(dataScadenza);
        scadenza.setHours(0, 0, 0, 0);
        const diff = Math.ceil((scadenza - oggi) / (1000 * 60 * 60 * 24));
        return diff;
    },

    getTipoIcon(tipo) {
        const icons = {
            'PAGAMENTO': 'file-invoice-dollar',
            'FATTURAZIONE': 'file-invoice',
            'RINNOVO_CONTRATTO': 'file-contract'
        };
        return icons[tipo] || 'calendar';
    },

    getTipoLabel(tipo) {
        const labels = {
            'PAGAMENTO': 'Scadenza Pagamento',
            'FATTURAZIONE': 'Scadenza Fatturazione',
            'RINNOVO_CONTRATTO': 'Rinnovo Contratto'
        };
        return labels[tipo] || tipo;
    },

    getUrgenzaBadgeClass(urgenza) {
        const classes = {
            'scaduto': 'badge-danger',
            'critico': 'badge-warning',
            'imminente': 'badge-info',
            'normale': 'badge-success'
        };
        return classes[urgenza] || 'badge-secondary';
    },

    getUrgenzaLabel(urgenza, giorni) {
        if (urgenza === 'scaduto') return 'SCADUTO';
        if (urgenza === 'critico') return `CRITICO (${giorni}gg)`;
        if (urgenza === 'imminente') return `IMMINENTE (${giorni}gg)`;
        return `${giorni} giorni`;
    },

    editScadenza() {
        if (this.scadenza) {
            FormsManager.showModificaScadenza(this.scadenza);
        }
    }
};

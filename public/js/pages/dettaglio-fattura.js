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
                        ${!AuthService.canViewOnlyOwnData() ? `
                        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                            ${fattura.statoPagamento === 'NON_PAGATA' || fattura.statoPagamento === 'PARZIALMENTE_PAGATA' ? `
                                <button class="btn btn-success btn-sm" onclick="FormsManager.marcaFatturaPagata('${fattura.id}')">
                                    <i class="fas fa-check"></i> Marca Pagata
                                </button>
                            ` : ''}
                            ${fattura.statoPagamento !== 'PAGATA' ? `
                                <button class="btn btn-sm" style="background: var(--verde-700); color: white; border: none;" onclick="DettaglioFattura.registraAcconto()">
                                    <i class="fas fa-hand-holding-usd"></i> Registra Acconto
                                </button>
                            ` : ''}
                            <button class="btn btn-primary btn-sm" onclick="DettaglioFattura.editFattura()">
                                <i class="fas fa-edit"></i> Modifica
                            </button>
                        </div>
                        ` : ''}
                    </div>
                    <h1 style="font-size: 2rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                        <i class="fas fa-file-invoice"></i> ${fattura.numeroFatturaCompleto || 'Fattura'}
                    </h1>
                    <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                        ${(fattura.tipoCliente === 'PA' || fattura.numeroFatturaCompleto?.endsWith('/PA')) ?
                            '<span class="badge badge-info" style="font-size: 0.85rem;"><i class="fas fa-landmark"></i> PA</span>' :
                        (fattura.tipoCliente === 'PR' || fattura.numeroFatturaCompleto?.endsWith('/PR')) ?
                            '<span class="badge badge-secondary" style="font-size: 0.85rem;"><i class="fas fa-building"></i> PR</span>' : ''}
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

                <!-- Footer Audit -->
                ${fattura.ultimaModificaDa ? `
                <div style="margin-top: 1.5rem; padding: 0.75rem 1rem; background: var(--grigio-100); border-radius: 8px; display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: var(--grigio-500);">
                    <i class="fas fa-user-edit"></i>
                    Ultima modifica: <strong style="color: var(--grigio-700);">${fattura.ultimaModificaNome || fattura.ultimaModificaDa}</strong>
                    &mdash; ${new Date(fattura.ultimaModificaIl).toLocaleString('it-IT')}
                </div>
                ` : ''}
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
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 1.5rem;">
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
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 1.5rem;">
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
                                    '<i class="fas fa-landmark"></i> <strong>Cliente PA</strong> - L\'IVA è a carico dell\'Erario (Split Payment)' :
                                    '<i class="fas fa-building"></i> <strong>Cliente Privato</strong> - IVA da incassare'
                                }
                            </p>
                            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.75rem; border-top: 1px solid rgba(1,87,155,0.2);">
                                <span style="font-size: 0.875rem; font-weight: 600; color: #01579B;">
                                    <i class="fas fa-coins"></i> Da Incassare:
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

            <!-- Acconti e Saldo Residuo -->
            ${fattura.acconti && fattura.acconti.length > 0 ? `
                <div class="card fade-in mb-3">
                    <div class="card-header">
                        <h2 class="card-title">
                            <i class="fas fa-hand-holding-usd"></i> Acconti e Saldo
                        </h2>
                    </div>
                    <div style="padding: 1.5rem;">
                        ${fattura.acconti.map((acconto, i) => `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; background: var(--verde-100); border-radius: 8px; margin-bottom: 0.5rem;">
                                <div>
                                    <i class="fas fa-check-circle" style="color: var(--verde-700);"></i>
                                    <strong style="color: var(--verde-900); margin-left: 0.5rem;">${acconto.note || 'Acconto ' + (i + 1)}</strong>
                                    <span style="color: var(--grigio-600); margin-left: 0.5rem; font-size: 0.875rem;">
                                        ${DataService.formatDate(acconto.data)}
                                    </span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 0.75rem;">
                                    <strong style="color: var(--verde-700); font-size: 1.125rem;">
                                        + ${DataService.formatCurrency(acconto.importo)}
                                    </strong>
                                    ${!AuthService.canViewOnlyOwnData() ? `
                                        <button onclick="DettaglioFattura.eliminaAcconto(${i})" title="Elimina acconto" style="background: none; border: none; color: var(--grigio-500); cursor: pointer; padding: 0.25rem; font-size: 0.9rem; transition: color 0.2s;" onmouseenter="this.style.color='#D32F2F'" onmouseleave="this.style.color='var(--grigio-500)'">
                                            <i class="fas fa-trash-alt"></i>
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                        `).join('')}

                        <!-- Totale acconti -->
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; margin-top: 0.75rem; border-top: 2px solid var(--grigio-300);">
                            <strong style="color: var(--grigio-900);">
                                <i class="fas fa-calculator"></i> Totale Acconti:
                            </strong>
                            <strong style="color: var(--verde-700); font-size: 1.25rem;">
                                ${DataService.formatCurrency(fattura.acconti.reduce((sum, a) => sum + (a.importo || 0), 0))}
                            </strong>
                        </div>

                        <!-- Saldo residuo -->
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; margin-top: 0.5rem; background: ${(fattura.saldoResiduo || 0) > 0 ? '#FFF3E0' : 'var(--verde-100)'}; border-radius: 8px; border-left: 4px solid ${(fattura.saldoResiduo || 0) > 0 ? '#FFCC00' : 'var(--verde-700)'};">
                            <strong style="color: ${(fattura.saldoResiduo || 0) > 0 ? '#E65100' : 'var(--verde-900)'}; font-size: 1rem;">
                                <i class="fas ${(fattura.saldoResiduo || 0) > 0 ? 'fa-exclamation-triangle' : 'fa-check-double'}"></i>
                                Saldo Residuo:
                            </strong>
                            <strong style="color: ${(fattura.saldoResiduo || 0) > 0 ? '#D32F2F' : 'var(--verde-700)'}; font-size: 1.5rem;">
                                ${DataService.formatCurrency(fattura.saldoResiduo || 0)}
                            </strong>
                        </div>

                        ${(fattura.saldoResiduo || 0) > 0 ? `
                            <div style="margin-top: 1rem; text-align: right;">
                                <button class="btn btn-primary btn-sm" onclick="DettaglioFattura.registraAcconto()">
                                    <i class="fas fa-plus"></i> Registra Nuovo Acconto
                                </button>
                            </div>
                        ` : ''}
                    </div>
                </div>
            ` : ''}

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
    },

    // Registra acconto rapido dalla pagina dettaglio
    async registraAcconto() {
        if (!this.fattura) return;

        const accontiEsistenti = this.fattura.acconti || [];
        const totaleAcconti = accontiEsistenti.reduce((sum, a) => sum + (a.importo || 0), 0);
        const saldoResiduo = (this.fattura.importoTotale || 0) - totaleAcconti;

        const content = `
            <div style="padding: 1rem; background: var(--verde-100); border-radius: 8px; margin-bottom: 1rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                    <span style="color: var(--grigio-700);">Totale Fattura:</span>
                    <strong>${DataService.formatCurrency(this.fattura.importoTotale)}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                    <span style="color: var(--grigio-700);">Già versato:</span>
                    <strong style="color: var(--verde-700);">${DataService.formatCurrency(totaleAcconti)}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; border-top: 2px solid var(--verde-700); padding-top: 0.5rem;">
                    <span style="color: #D32F2F; font-weight: 700;">Saldo residuo:</span>
                    <strong style="color: #D32F2F;">${DataService.formatCurrency(saldoResiduo)}</strong>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                ${FormsManager.createFormField('Importo Acconto', 'accontoImporto', 'number', '', { required: true, placeholder: '0.00' })}
                ${FormsManager.createFormField('Data', 'accontoData', 'date', new Date().toISOString().split('T')[0], { required: true })}
            </div>
            ${FormsManager.createFormField('Nota', 'accontoNote', 'text', '', { placeholder: 'Es: Acconto ricevuto via bonifico' })}
        `;

        FormsManager.showModal(
            '<i class="fas fa-hand-holding-usd"></i> Registra Acconto',
            content,
            async () => {
                const data = FormsManager.getFormData();
                if (!data.accontoImporto || data.accontoImporto <= 0) {
                    throw new Error('Inserisci un importo valido (maggiore di zero)');
                }
                if (data.accontoImporto > saldoResiduo) {
                    throw new Error(`L'acconto (${DataService.formatCurrency(data.accontoImporto)}) non può superare il saldo residuo di ${DataService.formatCurrency(saldoResiduo)}`);
                }

                const nuovoAcconto = {
                    importo: data.accontoImporto,
                    data: data.accontoData || new Date().toISOString(),
                    note: data.accontoNote || 'Acconto'
                };

                const nuoviAcconti = [...accontiEsistenti, nuovoAcconto];
                const nuovoTotale = nuoviAcconti.reduce((sum, a) => sum + (a.importo || 0), 0);
                const nuovoSaldo = parseFloat(((this.fattura.importoTotale || 0) - nuovoTotale).toFixed(2));

                const updateData = {
                    acconti: nuoviAcconti,
                    saldoResiduo: Math.max(nuovoSaldo, 0)
                };

                // Se il saldo è coperto, marca come pagata
                if (nuovoSaldo <= 0) {
                    updateData.statoPagamento = 'PAGATA';
                    updateData.dataSaldo = new Date().toISOString();
                } else {
                    updateData.statoPagamento = 'PARZIALMENTE_PAGATA';
                }

                await DataService.updateFattura(this.fatturaId, updateData);
                DataService._logAudit('UPDATE', 'fatture', this.fatturaId, { azione: 'REGISTRA_ACCONTO', importo: data.accontoImporto });
                UI.showSuccess(nuovoSaldo <= 0 ? 'Fattura saldata completamente!' : 'Acconto registrato!');
                this.render(this.fatturaId);
            }
        );
    },

    async eliminaAcconto(index) {
        if (!this.fattura || !this.fattura.acconti || !this.fattura.acconti[index]) return;

        const acconto = this.fattura.acconti[index];
        const conferma = confirm(
            `Vuoi eliminare l'acconto di ${DataService.formatCurrency(acconto.importo)} del ${DataService.formatDate(acconto.data)}?\n\n` +
            `Nota: ${acconto.note || 'Nessuna nota'}\n\nQuesta operazione non può essere annullata.`
        );
        if (!conferma) return;

        try {
            UI.showLoading();
            const nuoviAcconti = [...this.fattura.acconti];
            nuoviAcconti.splice(index, 1);

            const nuovoTotale = nuoviAcconti.reduce((sum, a) => sum + (a.importo || 0), 0);
            const nuovoSaldo = parseFloat(((this.fattura.importoTotale || 0) - nuovoTotale).toFixed(2));

            const updateData = {
                acconti: nuoviAcconti,
                saldoResiduo: Math.max(nuovoSaldo, 0)
            };

            // Aggiorna stato pagamento
            if (nuoviAcconti.length === 0) {
                updateData.statoPagamento = 'NON_PAGATA';
                updateData.dataSaldo = null;
            } else if (nuovoSaldo > 0) {
                updateData.statoPagamento = 'PARZIALMENTE_PAGATA';
                updateData.dataSaldo = null;
            } else {
                updateData.statoPagamento = 'PAGATA';
            }

            await DataService.updateFattura(this.fatturaId, updateData);
            DataService._logAudit('UPDATE', 'fatture', this.fatturaId, { azione: 'ELIMINA_ACCONTO', importoRimosso: acconto.importo, nota: acconto.note });
            UI.showSuccess('Acconto eliminato');
            this.render(this.fatturaId);
        } catch (error) {
            UI.hideLoading();
            UI.showError('Errore nell\'eliminazione dell\'acconto: ' + error.message);
        }
    }
};

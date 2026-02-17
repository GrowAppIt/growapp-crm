// Dettaglio Cliente Page
const DettaglioCliente = {
    clienteId: null,
    cliente: null,
    activeTab: 'anagrafica',

    async render(clienteId) {
        this.clienteId = clienteId;
        UI.showLoading();

        try {
            // Carica dati cliente, fatture, contratti e documenti
            const [cliente, fatture, contratti, documenti] = await Promise.all([
                DataService.getCliente(clienteId),
                DataService.getFattureCliente(clienteId),
                DataService.getContrattiCliente(clienteId),
                DocumentService.getDocumenti('cliente', clienteId)
            ]);

            if (!cliente) {
                UI.hideLoading();
                UI.showError('Cliente non trovato');
                return;
            }

            this.cliente = cliente; // Salva per uso successivo

            const mainContent = document.getElementById('mainContent');
            mainContent.innerHTML = `
                <div class="page-header mb-3">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem;">
                        <button class="btn btn-secondary btn-sm" onclick="UI.showPage('clienti')">
                            <i class="fas fa-arrow-left"></i> Torna ai clienti
                        </button>
                        <button class="btn btn-primary btn-sm" onclick="DettaglioCliente.editCliente()">
                            <i class="fas fa-edit"></i> Modifica
                        </button>
                    </div>
                    <h1 style="font-size: 2rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                        <i class="fas fa-building"></i> ${cliente.ragioneSociale}
                    </h1>
                    <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                        <span class="badge ${DataService.getStatoBadgeClass(cliente.statoContratto)}">
                            ${cliente.statoContratto}
                        </span>
                        ${cliente.provincia ? `<span style="color: var(--grigio-500);"><i class="fas fa-map-marker-alt"></i> ${cliente.provincia}</span>` : ''}
                        ${cliente.agente ? `<span style="color: var(--grigio-500);"><i class="fas fa-user"></i> ${cliente.agente}</span>` : ''}
                    </div>
                </div>

                <!-- Tabs -->
                <div class="tabs-container" style="margin-bottom: 1.5rem;">
                    <div class="tabs" style="display: flex; gap: 0.5rem; border-bottom: 2px solid var(--grigio-300); overflow-x: auto;">
                        <button class="tab-btn active" data-tab="anagrafica" onclick="DettaglioCliente.switchTab('anagrafica')">
                            <i class="fas fa-info-circle"></i> Anagrafica
                        </button>
                        <button class="tab-btn" data-tab="fatture" onclick="DettaglioCliente.switchTab('fatture')">
                            <i class="fas fa-file-invoice"></i> Fatture (${fatture.length})
                        </button>
                        <button class="tab-btn" data-tab="contratti" onclick="DettaglioCliente.switchTab('contratti')">
                            <i class="fas fa-file-contract"></i> Contratti (${contratti.length})
                        </button>
                        <button class="tab-btn" data-tab="documenti" onclick="DettaglioCliente.switchTab('documenti')">
                            <i class="fas fa-folder-open"></i> Documenti (${documenti.length})
                        </button>
                        <button class="tab-btn" data-tab="note" onclick="DettaglioCliente.switchTab('note')">
                            <i class="fas fa-sticky-note"></i> Note
                        </button>
                    </div>
                </div>

                <!-- Tab Content -->
                <div id="tabContent">
                    ${this.renderTabContent(cliente, fatture, contratti, documenti)}
                </div>
            `;

            UI.hideLoading();
        } catch (error) {
            console.error('Errore caricamento dettaglio cliente:', error);
            UI.hideLoading();
            UI.showError('Errore nel caricamento del cliente');
        }
    },

    switchTab(tabName) {
        this.activeTab = tabName;
        
        // Update active tab button
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Re-render tab content
        this.reloadTabContent();
    },

    async reloadTabContent() {
        const [cliente, fatture, contratti, documenti] = await Promise.all([
            DataService.getCliente(this.clienteId),
            DataService.getFattureCliente(this.clienteId),
            DataService.getContrattiCliente(this.clienteId),
            DocumentService.getDocumenti('cliente', this.clienteId)
        ]);

        document.getElementById('tabContent').innerHTML = this.renderTabContent(cliente, fatture, contratti, documenti);
    },

    renderTabContent(cliente, fatture, contratti = [], documenti = []) {
        switch(this.activeTab) {
            case 'anagrafica':
                return this.renderAnagrafica(cliente);
            case 'fatture':
                return this.renderFatture(fatture);
            case 'contratti':
                return this.renderContratti(contratti);
            case 'documenti':
                return this.renderDocumenti(documenti);
            case 'note':
                return this.renderNote(cliente);
            default:
                return '';
        }
    },

    renderAnagrafica(cliente) {
        return `
            <div class="card fade-in">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-info-circle"></i> Informazioni Generali
                    </h2>
                </div>
                <div style="padding: 1.5rem;">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem;">
                        ${this.renderInfoField('Ragione Sociale', cliente.ragioneSociale, 'building')}
                        ${this.renderInfoField('Comune', cliente.comune, 'map-marker-alt')}
                        ${this.renderInfoField('Provincia', cliente.provincia, 'map')}
                        ${this.renderInfoField('Indirizzo', cliente.indirizzo, 'home')}
                        ${this.renderInfoField('Tipo', cliente.tipo, 'tag')}
                        ${this.renderInfoField('Agente', cliente.agente, 'user')}
                        ${this.renderInfoField('Stato Contratto', cliente.statoContratto, 'file-contract')}
                        ${this.renderInfoField('Gestione', cliente.gestione, 'cog')}
                        ${this.renderInfoField('ID', cliente.id, 'fingerprint')}
                    </div>

                    ${cliente.dataScadenzaContratto ? `
                        <div style="margin-top: 1.5rem; padding: 1rem; background: var(--grigio-100); border-radius: 8px;">
                            <h3 style="font-size: 0.875rem; font-weight: 700; color: var(--grigio-700); margin-bottom: 0.5rem;">
                                <i class="fas fa-calendar-alt"></i> Scadenza Contratto
                            </h3>
                            <div style="font-size: 1.25rem; font-weight: 700; color: var(--blu-700);">
                                ${DataService.formatDate(cliente.dataScadenzaContratto)}
                            </div>
                        </div>
                    ` : ''}

                    ${cliente.dataProssimaFattura ? `
                        <div style="margin-top: 1rem; padding: 1rem; background: var(--verde-100); border-radius: 8px;">
                            <h3 style="font-size: 0.875rem; font-weight: 700; color: var(--verde-900); margin-bottom: 0.5rem;">
                                <i class="fas fa-file-invoice"></i> Prossima Fatturazione
                            </h3>
                            <div style="font-size: 1.25rem; font-weight: 700; color: var(--verde-700);">
                                ${DataService.formatDate(cliente.dataProssimaFattura)}
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    renderInfoField(label, value, icon) {
        if (!value) return '';
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

    renderFatture(fatture) {
        if (fatture.length === 0) {
            return `
                <div class="card fade-in">
                    ${UI.createEmptyState({
                        icon: 'file-invoice',
                        title: 'Nessuna fattura',
                        subtitle: 'Non ci sono fatture per questo cliente'
                    })}
                </div>
            `;
        }

        // Calcola statistiche
        const totale = fatture.reduce((sum, f) => sum + (f.importoTotale || 0), 0);
        const pagate = fatture.filter(f => f.statoPagamento === 'PAGATA').length;
        const nonPagate = fatture.filter(f => f.statoPagamento === 'NON_PAGATA').length;
        const importoNonPagato = fatture
            .filter(f => f.statoPagamento === 'NON_PAGATA')
            .reduce((sum, f) => sum + (f.importoTotale || 0), 0);

        let html = `
            <div class="card fade-in">
                <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                    <h2 class="card-title">
                        <i class="fas fa-file-invoice"></i> Fatture (${fatture.length})
                    </h2>
                    <button class="btn btn-primary btn-sm" onclick="FormsManager.showNuovaFattura('${this.clienteId}')">
                        <i class="fas fa-plus"></i> Nuova Fattura
                    </button>
                </div>

                <!-- Statistiche Fatture -->
                <div style="padding: 1.5rem; background: var(--grigio-100); border-bottom: 1px solid var(--grigio-300);">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
                        <div style="text-align: center;">
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--blu-700);">
                                ${DataService.formatCurrency(totale)}
                            </div>
                            <div style="font-size: 0.75rem; color: var(--grigio-500); font-weight: 600;">
                                TOTALE FATTURATO
                            </div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--verde-700);">
                                ${pagate}
                            </div>
                            <div style="font-size: 0.75rem; color: var(--grigio-500); font-weight: 600;">
                                PAGATE
                            </div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--rosso-errore);">
                                ${nonPagate}
                            </div>
                            <div style="font-size: 0.75rem; color: var(--grigio-500); font-weight: 600;">
                                NON PAGATE
                            </div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--rosso-errore);">
                                ${DataService.formatCurrency(importoNonPagato)}
                            </div>
                            <div style="font-size: 0.75rem; color: var(--grigio-500); font-weight: 600;">
                                DA INCASSARE
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Lista Fatture -->
                <div class="list-group">
        `;

        for (const fattura of fatture) {
            const badgeClass = DataService.getStatoBadgeClass(fattura.statoPagamento);
            html += UI.createListItem({
                title: fattura.numeroFatturaCompleto,
                subtitle: `${DataService.formatDate(fattura.dataEmissione)} • ${DataService.formatCurrency(fattura.importoTotale)}`,
                badge: fattura.statoPagamento?.replace('_', ' '),
                badgeClass,
                icon: 'file-invoice',
                onclick: `UI.showPage('dettaglio-fattura', '${fattura.id}')`
            });
        }

        html += `
                </div>
            </div>
        `;

        return html;
    },

    renderContratti(contratti = []) {
        let html = `
            <div class="card fade-in">
                <div class="card-header">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h2 class="card-title">
                            <i class="fas fa-file-contract"></i> Contratti (${contratti.length})
                        </h2>
                        <button class="btn btn-primary btn-sm" onclick="FormsManager.showNuovoContratto('${this.clienteId}')">
                            <i class="fas fa-plus"></i> Nuovo Contratto
                        </button>
                    </div>
                </div>
        `;

        if (contratti.length === 0) {
            html += `
                <div class="empty-state">
                    <i class="fas fa-file-contract"></i>
                    <h3>Nessun contratto</h3>
                    <p>Questo cliente non ha ancora contratti registrati</p>
                    <button class="btn btn-primary" onclick="FormsManager.showNuovoContratto('${this.clienteId}')" style="margin-top: 1rem;">
                        <i class="fas fa-plus"></i> Crea primo contratto
                    </button>
                </div>
            `;
        } else {
            html += `<div class="list-group">`;

            for (const contratto of contratti) {
                const badgeClass = this.getStatoBadgeClass(contratto.stato);
                const giorniRimanenti = contratto.dataScadenza ? this.calcolaGiorniRimanenti(contratto.dataScadenza) : null;
                const isInScadenza = giorniRimanenti !== null && giorniRimanenti <= 30 && giorniRimanenti >= 0 && contratto.stato === 'ATTIVO';

                html += `
                    <div class="list-item" onclick="UI.showPage('dettaglio-contratto', '${contratto.id}')" style="cursor: pointer;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                            <div style="flex: 1;">
                                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                                    <span style="font-weight: 700; color: var(--blu-700); font-size: 1.1rem;">
                                        ${contratto.numeroContratto || 'N/A'}
                                    </span>
                                    ${isInScadenza ? '<i class="fas fa-exclamation-triangle" style="color: var(--giallo-avviso);"></i>' : ''}
                                </div>
                                <div style="font-size: 0.875rem; color: var(--grigio-700); margin-bottom: 0.25rem;">
                                    ${contratto.oggetto || 'Nessun oggetto'}
                                </div>
                                <div style="display: flex; gap: 1rem; flex-wrap: wrap; font-size: 0.875rem; color: var(--grigio-500);">
                                    <span><i class="fas fa-tag"></i> ${this.getTipologiaLabel(contratto.tipologia)}</span>
                                    ${contratto.dataScadenza ? `<span><i class="fas fa-calendar-alt"></i> Scade: ${DataService.formatDate(contratto.dataScadenza)}${giorniRimanenti !== null && contratto.stato === 'ATTIVO' ? ` (${giorniRimanenti > 0 ? giorniRimanenti + ' gg' : 'SCADUTO'})` : ''}</span>` : ''}
                                </div>
                            </div>
                            <div style="text-align: right;">
                                ${contratto.importoAnnuale ? `
                                    <div style="font-size: 1.25rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                                        ${DataService.formatCurrency(contratto.importoAnnuale)}
                                    </div>
                                ` : ''}
                                <span class="badge ${badgeClass}">
                                    ${contratto.stato?.replace('_', ' ') || 'N/A'}
                                </span>
                            </div>
                        </div>
                    </div>
                `;
            }

            html += `</div>`;
        }

        html += `</div>`;
        return html;
    },

    renderNote(cliente) {
        return `
            <div class="card fade-in">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-sticky-note"></i> Note
                    </h2>
                </div>
                <div class="empty-state">
                    <i class="fas fa-sticky-note"></i>
                    <h3>Funzionalità in arrivo</h3>
                    <p>Presto potrai aggiungere e visualizzare note per questo cliente</p>
                </div>
            </div>
        `;
    },

    renderDocumenti(documenti) {
        return `
            <div class="card">
                <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                    <h2 class="card-title">
                        <i class="fas fa-folder-open"></i> Documenti Cliente
                    </h2>
                    <button class="btn btn-primary" onclick="DettaglioCliente.showUploadDocumento()">
                        <i class="fas fa-upload"></i> Carica Documento
                    </button>
                </div>

                ${documenti.length === 0 ? `
                    <div class="empty-state">
                        <i class="fas fa-folder-open"></i>
                        <h3>Nessun documento caricato</h3>
                        <p>Carica documenti amministrativi, contabili o altro per questo cliente</p>
                    </div>
                ` : `
                    <div class="documenti-list" style="display: grid; gap: 1rem; padding: 1.5rem;">
                        ${documenti.map(doc => `
                            <div class="documento-item" style="
                                background: white;
                                border: 2px solid var(--grigio-300);
                                border-radius: 8px;
                                padding: 1.5rem;
                                display: grid;
                                grid-template-columns: auto 1fr auto;
                                gap: 1.5rem;
                                align-items: start;
                                transition: all 0.2s;
                            " onmouseover="this.style.borderColor='var(--blu-500)'" onmouseout="this.style.borderColor='var(--grigio-300)'">

                                <!-- Icona file -->
                                <div style="
                                    width: 60px;
                                    height: 60px;
                                    background: var(--grigio-100);
                                    border-radius: 8px;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                ">
                                    <i class="${DocumentService.getFileIcon(doc.mimeType)}" style="
                                        font-size: 2rem;
                                        color: ${DocumentService.getFileColor(doc.mimeType)};
                                    "></i>
                                </div>

                                <!-- Info documento -->
                                <div style="min-width: 0;">
                                    <h4 style="
                                        margin: 0 0 0.5rem 0;
                                        color: var(--blu-700);
                                        font-weight: 700;
                                        font-size: 1.1rem;
                                        word-break: break-word;
                                    ">
                                        ${doc.nomeOriginale}
                                    </h4>

                                    <p style="
                                        margin: 0 0 0.75rem 0;
                                        color: var(--grigio-700);
                                        line-height: 1.5;
                                    ">
                                        ${doc.descrizione}
                                    </p>

                                    <div style="
                                        display: flex;
                                        gap: 1.5rem;
                                        flex-wrap: wrap;
                                        font-size: 0.9rem;
                                        color: var(--grigio-500);
                                    ">
                                        <span>
                                            <i class="fas fa-hdd"></i> ${DocumentService.formatFileSize(doc.dimensione)}
                                        </span>
                                        <span>
                                            <i class="fas fa-calendar"></i> ${new Date(doc.dataCaricamento).toLocaleDateString('it-IT')}
                                        </span>
                                        <span>
                                            <i class="fas fa-user"></i> ${doc.caricatoDaNome}
                                        </span>
                                    </div>
                                </div>

                                <!-- Azioni -->
                                <div style="display: flex; gap: 0.5rem; flex-direction: column;">
                                    <button class="btn btn-primary" onclick="DettaglioCliente.downloadDocumento('${doc.downloadUrl}', '${doc.nomeOriginale}')" style="
                                        white-space: nowrap;
                                        padding: 0.5rem 1rem;
                                    ">
                                        <i class="fas fa-download"></i> Scarica
                                    </button>
                                    <button class="btn btn-danger" onclick="DettaglioCliente.deleteDocumento('${doc.id}', '${doc.storagePath}', '${doc.nomeOriginale}')" style="
                                        white-space: nowrap;
                                        padding: 0.5rem 1rem;
                                    ">
                                        <i class="fas fa-trash"></i> Elimina
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;
    },

    async showUploadDocumento() {
        await UI.showModal({
            title: '<i class="fas fa-upload"></i> Carica Documento Cliente',
            content: `
                <form id="uploadDocumentoForm">
                    <div style="margin-bottom: 1.5rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: var(--grigio-700);">
                            📄 File (PDF o Immagini, max 10MB)
                        </label>
                        <input type="file" id="fileInput" accept=".pdf,.jpg,.jpeg,.png" required style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px dashed var(--blu-500);
                            border-radius: 8px;
                            background: var(--blu-100);
                            cursor: pointer;
                        ">
                        <small style="color: var(--grigio-500); display: block; margin-top: 0.5rem;">
                            Tipi ammessi: PDF, JPG, PNG - Dimensione massima: 10MB
                        </small>
                    </div>

                    <div style="margin-bottom: 1.5rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: var(--grigio-700);">
                            📝 Descrizione *
                        </label>
                        <textarea id="descrizioneInput" rows="3" required placeholder="Es: Contratto firmato, Fattura 2024, Documento identità..." style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 2px solid var(--grigio-300);
                            border-radius: 8px;
                            font-family: 'Titillium Web', sans-serif;
                            resize: vertical;
                        "></textarea>
                    </div>
                </form>
            `,
            confirmText: 'Carica',
            cancelText: 'Annulla',
            onConfirm: async () => {
                // Raccogli dati PRIMA che il modal si chiuda
                const fileInput = document.getElementById('fileInput');
                const descrizioneInput = document.getElementById('descrizioneInput');

                const file = fileInput.files[0];
                const descrizione = descrizioneInput.value.trim();

                if (!file) {
                    UI.showError('Seleziona un file da caricare');
                    return false;  // Non chiudere il modal
                }

                if (!descrizione) {
                    UI.showError('Inserisci una descrizione per il documento');
                    return false;  // Non chiudere il modal
                }

                // Mostra loading sul pulsante
                const confirmBtn = document.getElementById('modalConfirmBtn');
                const originalHTML = confirmBtn.innerHTML;
                confirmBtn.disabled = true;
                confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Caricamento...';

                try {
                    await DocumentService.uploadDocumento(file, 'cliente', this.clienteId, descrizione);
                    await this.reloadTabContent('documenti');
                    return true;  // Chiudi il modal
                } catch (error) {
                    // Ripristina pulsante in caso di errore
                    confirmBtn.disabled = false;
                    confirmBtn.innerHTML = originalHTML;
                    UI.showError(error.message || 'Errore durante il caricamento del documento');
                    return false;  // Non chiudere il modal in caso di errore
                }
            }
        });
    },

    downloadDocumento(url, nomeFile) {
        const a = document.createElement('a');
        a.href = url;
        a.download = nomeFile;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    },

    async deleteDocumento(documentoId, storagePath, nomeFile) {
        const conferma = await UI.showModal({
            title: '<i class="fas fa-exclamation-triangle"></i> Conferma Eliminazione',
            content: `
                <div style="text-align: center;">
                    <p style="font-size: 1.1rem; margin-bottom: 1rem;">
                        Sei sicuro di voler eliminare questo documento?
                    </p>
                    <p style="
                        background: var(--grigio-100);
                        padding: 1rem;
                        border-radius: 8px;
                        font-weight: 600;
                        color: var(--blu-700);
                        word-break: break-word;
                    ">
                        ${nomeFile}
                    </p>
                    <p style="color: var(--rosso-errore); font-weight: 600; margin-top: 1rem;">
                        ⚠️ Questa azione non può essere annullata
                    </p>
                </div>
            `,
            confirmText: 'Sì, elimina',
            cancelText: 'Annulla',
            confirmClass: 'btn-danger'
        });

        if (conferma) {
            try {
                await DocumentService.deleteDocumento(documentoId, storagePath);
                await this.reloadTabContent('documenti');
            } catch (error) {
                UI.showError(error.message || 'Errore durante l\'eliminazione del documento');
            }
        }
    },

    editCliente() {
        if (this.cliente) {
            FormsManager.showModificaCliente(this.cliente);
        }
    },

    // Helper methods per contratti
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
    }
};

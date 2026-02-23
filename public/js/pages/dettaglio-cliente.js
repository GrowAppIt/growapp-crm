// Dettaglio Cliente Page
const DettaglioCliente = {
    clienteId: null,
    cliente: null,
    activeTab: 'anagrafica',

    async render(clienteId) {
        this.clienteId = clienteId;
        UI.showLoading();

        try {
            // Carica dati cliente, fatture, contratti, documenti e app
            const [cliente, fatture, contratti, documenti, appSnapshot] = await Promise.all([
                DataService.getCliente(clienteId),
                DataService.getFattureCliente(clienteId),
                DataService.getContrattiCliente(clienteId),
                DocumentService.getDocumenti('cliente', clienteId),
                db.collection('app').where('clientePaganteId', '==', clienteId).get()
            ]);
            const appCliente = appSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            this._appCliente = appCliente;

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
                        ${!AuthService.canViewOnlyOwnData() ? `
                        <button class="btn btn-primary btn-sm" onclick="DettaglioCliente.editCliente()">
                            <i class="fas fa-edit"></i> Modifica
                        </button>
                        ` : ''}
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
                        <button class="tab-btn" data-tab="timeline" onclick="DettaglioCliente.switchTab('timeline')">
                            <i class="fas fa-history"></i> Timeline
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
                return this.renderAnagrafica(cliente, contratti);
            case 'fatture':
                return this.renderFatture(fatture);
            case 'contratti':
                return this.renderContratti(contratti);
            case 'documenti':
                return this.renderDocumenti(documenti);
            case 'timeline':
                this.loadTimeline();
                return '<div id="timelineContainer"><div style="text-align:center;padding:2rem;"><i class="fas fa-spinner fa-spin" style="font-size:1.5rem;color:var(--blu-500);"></i><p style="margin-top:0.5rem;color:var(--grigio-500);">Caricamento timeline...</p></div></div>';
            case 'note':
                return this.renderNote(cliente);
            default:
                return '';
        }
    },

    /**
     * Carica e renderizza la timeline del cliente
     */
    async loadTimeline() {
        try {
            const [note, contratti, fatture, apps] = await Promise.allSettled([
                db.collection('note_cliente').where('clienteId', '==', this.clienteId).get(),
                DataService.getContrattiCliente(this.clienteId),
                DataService.getFattureCliente(this.clienteId),
                db.collection('app').where('clientePaganteId', '==', this.clienteId).get()
            ]);

            const eventi = [];

            // Note
            if (note.status === 'fulfilled') {
                note.value.forEach(doc => {
                    const d = doc.data();
                    const dataEvento = d.dataCreazione || d.data;
                    eventi.push({
                        type: 'nota',
                        data: dataEvento,
                        icon: 'fas fa-sticky-note',
                        color: '#2E6DA8',
                        bgColor: '#D1E2F2',
                        title: d.titolo || 'Nota',
                        description: (d.testo || '').substring(0, 120) + ((d.testo || '').length > 120 ? '...' : ''),
                        extra: d.autoreNome ? `di ${d.autoreNome}` : '',
                        onclick: `DettaglioCliente.switchTab('note')`
                    });
                });
            }

            // Contratti
            if (contratti.status === 'fulfilled') {
                contratti.value.forEach(c => {
                    eventi.push({
                        type: 'contratto',
                        data: c.dataCreazione || c.dataInizio || c.dataFirma,
                        icon: 'fas fa-file-contract',
                        color: '#3CA434',
                        bgColor: '#E2F8DE',
                        title: `Contratto ${c.numeroContratto || ''}`,
                        description: `${c.oggetto || 'Senza oggetto'} • ${DataService.formatCurrency(c.importoAnnuale || 0)}`,
                        extra: c.stato || '',
                        onclick: `UI.showPage('dettaglio-contratto', '${c.id}')`
                    });
                });
            }

            // Fatture
            if (fatture.status === 'fulfilled') {
                fatture.value.forEach(f => {
                    eventi.push({
                        type: 'fattura',
                        data: f.dataEmissione || f.dataCreazione,
                        icon: 'fas fa-file-invoice',
                        color: '#E67E22',
                        bgColor: '#FFF3E0',
                        title: `Fattura ${f.numeroFatturaCompleto || ''}`,
                        description: `${DataService.formatCurrency(f.importoTotale || 0)}`,
                        extra: f.statoPagamento?.replace('_', ' ') || '',
                        onclick: `UI.showPage('dettaglio-fattura', '${f.id}')`
                    });
                });
            }

            // App
            if (apps.status === 'fulfilled') {
                apps.value.forEach(doc => {
                    const a = doc.data();
                    eventi.push({
                        type: 'app',
                        data: a.dataCreazione || a.dataAttivazione,
                        icon: 'fas fa-mobile-alt',
                        color: '#8E44AD',
                        bgColor: '#F3E5F5',
                        title: `App ${a.nome || 'Senza nome'}`,
                        description: a.piattaforma || '',
                        extra: a.stato || '',
                        onclick: `UI.showPage('dettaglio-app', '${doc.id}')`
                    });
                });
            }

            // Ordina per data decrescente
            eventi.sort((a, b) => {
                const dataA = a.data ? new Date(a.data) : new Date(0);
                const dataB = b.data ? new Date(b.data) : new Date(0);
                return dataB - dataA;
            });

            // Renderizza
            const container = document.getElementById('timelineContainer');
            if (!container) return;

            if (eventi.length === 0) {
                container.innerHTML = `
                    <div style="text-align:center;padding:3rem;">
                        <i class="fas fa-stream" style="font-size:3rem;color:var(--grigio-300);"></i>
                        <h3 style="margin-top:1rem;color:var(--grigio-500);">Nessun evento</h3>
                        <p style="color:var(--grigio-400);">Non ci sono ancora eventi per questo cliente</p>
                    </div>
                `;
                return;
            }

            let html = '<div class="card fade-in" style="padding:1.5rem;">';
            html += '<h3 style="font-size:1.1rem;font-weight:700;color:var(--blu-700);margin-bottom:1.5rem;"><i class="fas fa-history"></i> Timeline Attività</h3>';

            eventi.forEach((ev, idx) => {
                const isLast = idx === eventi.length - 1;
                const dataFormatted = ev.data ? DataService.formatDate(ev.data) : 'Data N/D';

                html += `
                    <div style="display:flex;gap:1rem;cursor:pointer;${!isLast ? 'margin-bottom:0;' : ''}" onclick="${ev.onclick || ''}">
                        <!-- Linea verticale + icona -->
                        <div style="display:flex;flex-direction:column;align-items:center;min-width:40px;">
                            <div style="width:36px;height:36px;border-radius:50%;background:${ev.bgColor};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                <i class="${ev.icon}" style="color:${ev.color};font-size:0.9rem;"></i>
                            </div>
                            ${!isLast ? '<div style="width:2px;flex:1;background:var(--grigio-300);margin:4px 0;min-height:20px;"></div>' : ''}
                        </div>
                        <!-- Contenuto -->
                        <div style="flex:1;padding-bottom:${!isLast ? '1.25rem' : '0'};border-bottom:${!isLast ? '1px solid var(--grigio-100)' : 'none'};margin-bottom:${!isLast ? '0.5rem' : '0'};">
                            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:0.5rem;">
                                <h4 style="font-size:0.95rem;font-weight:600;color:var(--grigio-900);margin:0;">${ev.title}</h4>
                                <span style="font-size:0.75rem;color:var(--grigio-500);white-space:nowrap;">${dataFormatted}</span>
                            </div>
                            <p style="font-size:0.85rem;color:var(--grigio-700);margin:0.25rem 0 0;">${ev.description}</p>
                            ${ev.extra ? `<span style="display:inline-block;margin-top:0.35rem;font-size:0.7rem;padding:0.15rem 0.5rem;border-radius:4px;background:${ev.bgColor};color:${ev.color};font-weight:600;">${ev.extra}</span>` : ''}
                        </div>
                    </div>
                `;
            });

            html += '</div>';
            container.innerHTML = html;

        } catch (error) {
            console.error('Errore caricamento timeline:', error);
            const container = document.getElementById('timelineContainer');
            if (container) {
                container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--rosso-errore);"><i class="fas fa-exclamation-triangle"></i> Errore nel caricamento della timeline</div>';
            }
        }
    },

    renderAnagrafica(cliente, contratti = []) {
        // Calcola dati derivati dai contratti reali
        const contrattiAttivi = contratti.filter(c => c.stato === 'ATTIVO' || c.stato === 'IN_RINNOVO');
        const prossimaScadenza = contrattiAttivi
            .filter(c => c.dataScadenza)
            .sort((a, b) => new Date(a.dataScadenza) - new Date(b.dataScadenza))[0];
        const importoTotaleAttivi = contrattiAttivi.reduce((sum, c) => sum + (parseFloat(c.importoAnnuale) || 0), 0);
        const gestioniAttive = [...new Set(contrattiAttivi.map(c => c.gestione).filter(Boolean))];

        return `
            <div class="card fade-in">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-info-circle"></i> Informazioni Generali
                    </h2>
                </div>
                <div style="padding: 1.5rem;">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(250px, 100%), 1fr)); gap: 1.5rem;">
                        ${this.renderInfoField('Ragione Sociale', cliente.ragioneSociale, 'building')}
                        ${this.renderInfoField('Comune', cliente.comune, 'map-marker-alt')}
                        ${this.renderInfoField('Provincia', cliente.provincia, 'map')}
                        ${this.renderInfoField('Regione', cliente.regione, 'globe-europe')}
                        ${this.renderInfoField('Indirizzo', cliente.indirizzo, 'home')}
                        ${this.renderInfoField('CAP', cliente.cap, 'mail-bulk')}
                        ${this.renderInfoField('Telefono', cliente.telefono, 'phone')}
                        ${this.renderInfoField('Email 1', cliente.email, 'envelope')}
                        ${this.renderInfoField('Email 2', cliente.email2, 'envelope-open')}
                        ${this.renderInfoField('PEC', cliente.pec, 'certificate')}
                        ${this.renderInfoField('Codice Fiscale', cliente.codiceFiscale, 'id-card')}
                        ${this.renderInfoField('Codice SDI', cliente.codiceSdi, 'barcode')}
                        ${this.renderInfoField('N. Residenti', cliente.numResidenti ? Number(cliente.numResidenti).toLocaleString('it-IT') : null, 'users')}
                        ${this.renderInfoField('Tipo', cliente.tipo === 'PA' ? '🏛 Pubblica Amministrazione (PA)' : (cliente.tipo === 'PRIVATO' ? '🏢 Privato (PR)' : (cliente.tipo || 'N/A')), 'tag')}
                        ${this.renderInfoField('Agente', cliente.agente, 'user')}
                        ${this.renderInfoField('Stato Contratto', cliente.statoContratto, 'file-contract')}
                        ${gestioniAttive.length > 0 ? this.renderInfoField('Gestione', gestioniAttive.join(', '), 'cog') : ''}
                        ${this.renderInfoField('ID', cliente.id, 'fingerprint')}
                    </div>

                    <!-- Riepilogo Contratti (calcolato dai dati reali) -->
                    ${contrattiAttivi.length > 0 ? `
                        <div style="margin-top: 1.5rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 1rem;">
                            <div style="padding: 1rem; background: var(--blu-100); border-radius: 8px;">
                                <div style="font-size: 0.75rem; font-weight: 600; color: var(--blu-700); text-transform: uppercase; margin-bottom: 0.25rem;">
                                    <i class="fas fa-file-contract"></i> Contratti Attivi
                                </div>
                                <div style="font-size: 1.5rem; font-weight: 700; color: var(--blu-700);">
                                    ${contrattiAttivi.length}
                                </div>
                            </div>
                            <div style="padding: 1rem; background: var(--verde-100); border-radius: 8px;">
                                <div style="font-size: 0.75rem; font-weight: 600; color: var(--verde-700); text-transform: uppercase; margin-bottom: 0.25rem;">
                                    <i class="fas fa-euro-sign"></i> Importo Contratto
                                </div>
                                <div style="font-size: 1.5rem; font-weight: 700; color: var(--verde-700);">
                                    ${DataService.formatCurrency(importoTotaleAttivi)}
                                </div>
                            </div>
                            ${prossimaScadenza ? `
                            <div style="padding: 1rem; background: var(--grigio-100); border-radius: 8px;">
                                <div style="font-size: 0.75rem; font-weight: 600; color: var(--grigio-700); text-transform: uppercase; margin-bottom: 0.25rem;">
                                    <i class="fas fa-calendar-alt"></i> Prossima Scadenza
                                </div>
                                <div style="font-size: 1.5rem; font-weight: 700; color: var(--blu-700);">
                                    ${DataService.formatDate(prossimaScadenza.dataScadenza)}
                                </div>
                                <div style="font-size: 0.75rem; color: var(--grigio-500); margin-top: 0.25rem;">
                                    ${prossimaScadenza.numeroContratto || ''}
                                </div>
                            </div>
                            ` : ''}
                        </div>
                    ` : ''}

                    <!-- App Associate -->
                    ${this._appCliente && this._appCliente.length > 0 ? `
                    <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--grigio-300);">
                        <h3 style="font-size: 0.95rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.75rem;">
                            <i class="fas fa-mobile-alt"></i> App Associate (${this._appCliente.length})
                        </h3>
                        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                            ${this._appCliente.map(a => `
                                <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: var(--grigio-100); border-radius: 10px;">
                                    ${a.iconaUrl
                                        ? `<img src="${a.iconaUrl}" alt="${a.nome}" style="width: 44px; height: 44px; border-radius: 10px; object-fit: cover; flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,0.18); border: 1px solid rgba(0,0,0,0.08);" />`
                                        : `<div style="width: 44px; height: 44px; border-radius: 10px; background: var(--blu-100); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                            <i class="fas fa-mobile-alt" style="color: var(--blu-700);"></i>
                                          </div>`
                                    }
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="font-weight: 600; font-size: 0.9rem; color: var(--grigio-900); cursor: pointer;" onclick="UI.showPage('dettaglio-app', '${a.id}')">
                                            ${a.nome}
                                        </div>
                                        <span class="badge ${DataService.getStatoBadgeClass(a.statoApp)}" style="font-size: 0.7rem; margin-top: 0.15rem;">
                                            ${a.statoApp?.replace('_', ' ') || 'N/A'}
                                        </span>
                                    </div>
                                    <div style="display: flex; gap: 0.5rem; flex-shrink: 0;">
                                        ${a.urlSito ? `
                                            <a href="${a.urlSito}" target="_blank" rel="noopener" title="Vedi l'app" style="display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 8px; background: var(--blu-700); color: white; text-decoration: none; font-size: 0.8rem;" onmouseover="this.style.background='var(--blu-500)'" onmouseout="this.style.background='var(--blu-700)'">
                                                <i class="fas fa-external-link-alt"></i>
                                            </a>
                                        ` : ''}
                                        ${a.urlCruscotto ? `
                                            <a href="${a.urlCruscotto}" target="_blank" rel="noopener" title="Vedi il cruscotto dell'app" style="display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 8px; background: var(--verde-700); color: white; text-decoration: none; font-size: 0.8rem;" onmouseover="this.style.background='var(--verde-500)'" onmouseout="this.style.background='var(--verde-700)'">
                                                <i class="fas fa-cogs"></i>
                                            </a>
                                        ` : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                    <!-- Pulsante Genera Comunicazione -->
                    <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--grigio-300);">
                        <button class="btn btn-secondary" onclick="DettaglioCliente.mostraModalTemplate()" style="width: 100%;">
                            <i class="fas fa-envelope"></i> Genera Comunicazione Email/PEC
                        </button>
                    </div>
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
                    ${!AuthService.canViewOnlyOwnData() ? `
                    <button class="btn btn-primary btn-sm" onclick="FormsManager.showNuovaFattura('${this.clienteId}')">
                        <i class="fas fa-plus"></i> Nuova Fattura
                    </button>
                    ` : ''}
                </div>

                <!-- Statistiche Fatture -->
                <div style="padding: 1.5rem; background: var(--grigio-100); border-bottom: 1px solid var(--grigio-300);">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr)); gap: 1rem;">
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
                        ${!AuthService.canViewOnlyOwnData() ? `
                        <button class="btn btn-primary btn-sm" onclick="FormsManager.showNuovoContratto('${this.clienteId}')">
                            <i class="fas fa-plus"></i> Nuovo Contratto
                        </button>
                        ` : ''}
                    </div>
                </div>
        `;

        if (contratti.length === 0) {
            html += `
                <div class="empty-state">
                    <i class="fas fa-file-contract"></i>
                    <h3>Nessun contratto</h3>
                    <p>Questo cliente non ha ancora contratti registrati</p>
                    ${!AuthService.canViewOnlyOwnData() ? `<button class="btn btn-primary" onclick="FormsManager.showNuovoContratto('${this.clienteId}')" style="margin-top: 1rem;">
                        <i class="fas fa-plus"></i> Crea primo contratto
                    </button>` : ''}
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

    // ===== NOTE RAPIDE =====
    noteList: [],

    renderNote(cliente) {
        // Avvia il caricamento note in background
        setTimeout(() => this.loadNote(), 50);

        return `
            <div class="card fade-in">
                <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                    <h2 class="card-title">
                        <i class="fas fa-sticky-note"></i> Note
                    </h2>
                    <button class="btn btn-primary btn-sm" onclick="DettaglioCliente.showNuovaNota()">
                        <i class="fas fa-plus"></i> Nuova Nota
                    </button>
                </div>

                <!-- Form nuova nota (nascosto) -->
                <div id="nuovaNotaForm" style="display: none; padding: 1.5rem; border-bottom: 2px solid var(--grigio-300); background: var(--blu-100);">
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: var(--grigio-700); font-size: 0.875rem;">
                            <i class="fas fa-tag"></i> Categoria
                        </label>
                        <select id="notaCategoria" style="width: 100%; padding: 0.625rem; border: 2px solid var(--grigio-300); border-radius: 8px; font-family: 'Titillium Web', sans-serif; font-size: 0.9375rem; background: white;">
                            <option value="generale">📋 Generale</option>
                            <option value="commerciale">💼 Commerciale</option>
                            <option value="tecnica">🔧 Tecnica</option>
                            <option value="amministrativa">📄 Amministrativa</option>
                            <option value="importante">⚠️ Importante</option>
                        </select>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: var(--grigio-700); font-size: 0.875rem;">
                            <i class="fas fa-pencil-alt"></i> Testo della nota *
                        </label>
                        <textarea id="notaTesto" rows="3" placeholder="Scrivi qui la tua nota..." style="width: 100%; padding: 0.75rem; border: 2px solid var(--grigio-300); border-radius: 8px; font-family: 'Titillium Web', sans-serif; font-size: 0.9375rem; resize: vertical; line-height: 1.5;"></textarea>
                    </div>

                    <!-- Sezione Allega Documento -->
                    <div style="margin-bottom: 1rem;">
                        <button type="button" class="btn btn-secondary btn-sm" onclick="DettaglioCliente.toggleAllegaDocumento()" id="btnToggleAllegato" style="margin-bottom: 0.75rem;">
                            <i class="fas fa-paperclip"></i> Allega Documento
                        </button>
                        <div id="allegaDocumentoSection" style="display: none; background: white; border: 2px dashed var(--blu-500); border-radius: 8px; padding: 1rem;">
                            <div style="margin-bottom: 0.75rem;">
                                <label style="display: block; margin-bottom: 0.4rem; font-weight: 600; color: var(--grigio-700); font-size: 0.8125rem;">
                                    <i class="fas fa-file"></i> File (PDF o Immagini, max 10MB)
                                </label>
                                <input type="file" id="notaFileInput" accept=".pdf,.jpg,.jpeg,.png" style="
                                    width: 100%; padding: 0.5rem; border: 2px solid var(--grigio-300);
                                    border-radius: 8px; background: var(--grigio-100); cursor: pointer; font-size: 0.875rem;
                                ">
                            </div>
                            <div style="margin-bottom: 0.5rem;">
                                <label style="display: block; margin-bottom: 0.4rem; font-weight: 600; color: var(--grigio-700); font-size: 0.8125rem;">
                                    <i class="fas fa-align-left"></i> Descrizione documento *
                                </label>
                                <input type="text" id="notaDocDescrizione" placeholder="Es: Delibera di giunta, PEC ricevuta..." style="
                                    width: 100%; padding: 0.5rem 0.75rem; border: 2px solid var(--grigio-300);
                                    border-radius: 8px; font-family: 'Titillium Web', sans-serif; font-size: 0.875rem;
                                ">
                            </div>
                            <div style="display: flex; justify-content: flex-end;">
                                <button type="button" class="btn btn-secondary btn-sm" onclick="DettaglioCliente.rimuoviAllegato()" style="font-size: 0.8125rem; padding: 0.3rem 0.75rem;">
                                    <i class="fas fa-times"></i> Rimuovi allegato
                                </button>
                            </div>
                        </div>
                        <!-- Preview file selezionato -->
                        <div id="allegaDocumentoPreview" style="display: none; margin-top: 0.5rem; padding: 0.5rem 0.75rem; background: var(--verde-100); border-radius: 8px; font-size: 0.8125rem; color: var(--verde-900); display: none;">
                            <i class="fas fa-check-circle"></i> <span id="allegaDocumentoNome"></span>
                        </div>
                    </div>

                    <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                        <button class="btn btn-secondary btn-sm" onclick="DettaglioCliente.hideNuovaNota()">
                            <i class="fas fa-times"></i> Annulla
                        </button>
                        <button class="btn btn-primary btn-sm" id="salvaNota" onclick="DettaglioCliente.salvaNota()">
                            <i class="fas fa-save"></i> Salva Nota
                        </button>
                    </div>
                </div>

                <!-- Lista note -->
                <div id="noteContainer" style="padding: 1.5rem;">
                    <div style="text-align: center; padding: 2rem; color: var(--grigio-500);">
                        <i class="fas fa-spinner fa-spin" style="font-size: 1.5rem;"></i>
                        <p style="margin-top: 0.5rem;">Caricamento note...</p>
                    </div>
                </div>
            </div>
        `;
    },

    showNuovaNota() {
        const form = document.getElementById('nuovaNotaForm');
        if (form) {
            form.style.display = 'block';
            document.getElementById('notaTesto').focus();
        }
    },

    hideNuovaNota() {
        const form = document.getElementById('nuovaNotaForm');
        if (form) {
            form.style.display = 'none';
            document.getElementById('notaTesto').value = '';
            document.getElementById('notaCategoria').value = 'generale';
            // Reset allegato
            this.rimuoviAllegato();
        }
    },

    // Toggle sezione allega documento nella nota
    toggleAllegaDocumento() {
        const section = document.getElementById('allegaDocumentoSection');
        if (section) {
            const isVisible = section.style.display !== 'none';
            section.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) {
                // Focus sul file input quando si apre
                const fileInput = document.getElementById('notaFileInput');
                if (fileInput) fileInput.focus();
            }
        }
    },

    // Rimuovi allegato selezionato
    rimuoviAllegato() {
        const section = document.getElementById('allegaDocumentoSection');
        const fileInput = document.getElementById('notaFileInput');
        const descInput = document.getElementById('notaDocDescrizione');
        const preview = document.getElementById('allegaDocumentoPreview');
        if (section) section.style.display = 'none';
        if (fileInput) fileInput.value = '';
        if (descInput) descInput.value = '';
        if (preview) preview.style.display = 'none';
    },

    async loadNote() {
        try {
            const snapshot = await db.collection('note_cliente')
                .where('clienteId', '==', this.clienteId)
                .get();

            this.noteList = [];
            snapshot.forEach(doc => {
                this.noteList.push({ id: doc.id, ...doc.data() });
            });

            // Ordina per data (più recenti prima)
            this.noteList.sort((a, b) => {
                const dataA = a.creatoIl ? (a.creatoIl.toDate ? a.creatoIl.toDate() : new Date(a.creatoIl)) : new Date(0);
                const dataB = b.creatoIl ? (b.creatoIl.toDate ? b.creatoIl.toDate() : new Date(b.creatoIl)) : new Date(0);
                return dataB - dataA;
            });

            this.renderNoteList();
        } catch (error) {
            console.error('Errore caricamento note:', error);
            const container = document.getElementById('noteContainer');
            if (container) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 2rem; color: var(--rosso-errore);">
                        <i class="fas fa-exclamation-triangle" style="font-size: 1.5rem;"></i>
                        <p style="margin-top: 0.5rem;">Errore nel caricamento delle note</p>
                    </div>
                `;
            }
        }
    },

    renderNoteList() {
        const container = document.getElementById('noteContainer');
        if (!container) return;

        if (this.noteList.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 3rem 1rem; color: var(--grigio-500);">
                    <i class="fas fa-sticky-note" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                    <h3 style="color: var(--grigio-700); margin-bottom: 0.5rem;">Nessuna nota</h3>
                    <p>Clicca "Nuova Nota" per aggiungere la prima nota a questo cliente</p>
                </div>
            `;
            return;
        }

        const categoriaConfig = {
            generale: { icon: 'fas fa-clipboard', color: 'var(--blu-700)', bg: 'var(--blu-100)', label: 'Generale' },
            commerciale: { icon: 'fas fa-briefcase', color: 'var(--verde-900)', bg: 'var(--verde-100)', label: 'Commerciale' },
            tecnica: { icon: 'fas fa-wrench', color: '#6C63FF', bg: '#EEEDFF', label: 'Tecnica' },
            amministrativa: { icon: 'fas fa-file-alt', color: 'var(--grigio-700)', bg: 'var(--grigio-100)', label: 'Amministrativa' },
            importante: { icon: 'fas fa-exclamation-circle', color: 'var(--rosso-errore)', bg: '#FDECEA', label: 'Importante' }
        };

        let html = '<div style="display: flex; flex-direction: column; gap: 1rem;">';

        for (const nota of this.noteList) {
            const cat = categoriaConfig[nota.categoria] || categoriaConfig.generale;
            const data = nota.creatoIl ? (nota.creatoIl.toDate ? nota.creatoIl.toDate() : new Date(nota.creatoIl)) : null;
            const dataStr = data ? data.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/D';

            // Bordo sinistro colorato per categoria
            const borderColor = nota.categoria === 'importante' ? 'var(--rosso-errore)' : cat.color;

            html += `
                <div style="
                    background: white;
                    border: 1px solid var(--grigio-300);
                    border-left: 4px solid ${borderColor};
                    border-radius: 8px;
                    padding: 1rem 1.25rem;
                    transition: all 0.2s;
                " onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow='none'">

                    <!-- Header nota -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                        <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                            <span style="
                                display: inline-flex; align-items: center; gap: 0.35rem;
                                background: ${cat.bg}; color: ${cat.color};
                                padding: 0.2rem 0.6rem; border-radius: 12px;
                                font-size: 0.75rem; font-weight: 700;
                            ">
                                <i class="${cat.icon}"></i> ${cat.label}
                            </span>
                            <span style="font-size: 0.8125rem; color: var(--grigio-500);">
                                <i class="fas fa-user" style="margin-right: 0.2rem;"></i>${nota.autoreNome || 'Utente'}
                            </span>
                            <span style="font-size: 0.8125rem; color: var(--grigio-500);">
                                <i class="fas fa-clock" style="margin-right: 0.2rem;"></i>${dataStr}
                            </span>
                        </div>
                        <div style="display: flex; gap: 0.25rem; flex-shrink: 0;">
                            <button onclick="DettaglioCliente.editNota('${nota.id}')" title="Modifica" style="
                                background: none; border: none; cursor: pointer;
                                color: var(--grigio-500); padding: 0.35rem;
                                border-radius: 6px; transition: all 0.2s;
                            " onmouseover="this.style.color='var(--blu-700)';this.style.background='var(--blu-100)'" onmouseout="this.style.color='var(--grigio-500)';this.style.background='none'">
                                <i class="fas fa-pen" style="font-size: 0.8125rem;"></i>
                            </button>
                            <button onclick="DettaglioCliente.deleteNota('${nota.id}')" title="Elimina" style="
                                background: none; border: none; cursor: pointer;
                                color: var(--grigio-500); padding: 0.35rem;
                                border-radius: 6px; transition: all 0.2s;
                            " onmouseover="this.style.color='var(--rosso-errore)';this.style.background='#FDECEA'" onmouseout="this.style.color='var(--grigio-500)';this.style.background='none'">
                                <i class="fas fa-trash" style="font-size: 0.8125rem;"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Testo nota -->
                    <div id="notaText_${nota.id}" style="
                        color: var(--grigio-900);
                        font-size: 0.9375rem;
                        line-height: 1.6;
                        white-space: pre-wrap;
                        word-break: break-word;
                    ">${this.escapeHtml(nota.testo)}</div>

                    ${nota.documentoAllegato ? `
                        <div style="
                            margin-top: 0.75rem;
                            padding: 0.625rem 0.875rem;
                            background: var(--blu-100);
                            border: 1px solid var(--blu-300);
                            border-radius: 8px;
                            display: flex;
                            align-items: center;
                            gap: 0.75rem;
                            cursor: pointer;
                            transition: all 0.2s;
                        " onclick="window.open('${nota.documentoAllegato.downloadUrl}', '_blank')"
                           onmouseover="this.style.borderColor='var(--blu-700)';this.style.background='var(--blu-300)'"
                           onmouseout="this.style.borderColor='var(--blu-300)';this.style.background='var(--blu-100)'">
                            <div style="
                                width: 36px; height: 36px;
                                background: white; border-radius: 8px;
                                display: flex; align-items: center; justify-content: center;
                                flex-shrink: 0;
                            ">
                                <i class="${DocumentService.getFileIcon(nota.documentoAllegato.mimeType)}" style="
                                    font-size: 1.1rem;
                                    color: ${DocumentService.getFileColor(nota.documentoAllegato.mimeType)};
                                "></i>
                            </div>
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-weight: 600; font-size: 0.8125rem; color: var(--blu-700); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <i class="fas fa-paperclip" style="margin-right: 0.25rem;"></i>${this.escapeHtml(nota.documentoAllegato.nomeFile)}
                                </div>
                                <div style="font-size: 0.75rem; color: var(--grigio-500); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    ${this.escapeHtml(nota.documentoAllegato.descrizione || '')}${nota.documentoAllegato.dimensione ? ' • ' + DocumentService.formatFileSize(nota.documentoAllegato.dimensione) : ''}
                                </div>
                            </div>
                            <i class="fas fa-external-link-alt" style="color: var(--blu-500); font-size: 0.8125rem; flex-shrink: 0;"></i>
                        </div>
                    ` : ''}

                    ${nota.modificatoIl ? `
                        <div style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--grigio-500); font-style: italic;">
                            <i class="fas fa-edit"></i> Modificata il ${(nota.modificatoIl.toDate ? nota.modificatoIl.toDate() : new Date(nota.modificatoIl)).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                    ` : ''}
                </div>
            `;
        }

        html += '</div>';
        container.innerHTML = html;
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    async salvaNota() {
        const testo = document.getElementById('notaTesto').value.trim();
        const categoria = document.getElementById('notaCategoria').value;

        // Controlla se c'è un allegato
        const fileInput = document.getElementById('notaFileInput');
        const descInput = document.getElementById('notaDocDescrizione');
        const allegaSection = document.getElementById('allegaDocumentoSection');
        const hasAllegato = allegaSection && allegaSection.style.display !== 'none' && fileInput && fileInput.files.length > 0;

        if (!testo) {
            UI.showError('Inserisci il testo della nota');
            return;
        }

        // Se c'è un file ma manca la descrizione
        if (hasAllegato && (!descInput || !descInput.value.trim())) {
            UI.showError('Inserisci una descrizione per il documento allegato');
            return;
        }

        const btn = document.getElementById('salvaNota');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvataggio...';

        try {
            const user = firebase.auth().currentUser;
            let documentoAllegato = null;

            // Se c'è un allegato, caricalo prima con DocumentService (così finisce anche nella sezione Documenti)
            if (hasAllegato) {
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Upload documento...';
                const file = fileInput.files[0];
                const descrizione = descInput.value.trim();

                const docResult = await DocumentService.uploadDocumento(file, 'cliente', this.clienteId, descrizione);
                documentoAllegato = {
                    documentoId: docResult.id,
                    nomeFile: docResult.nomeOriginale,
                    descrizione: docResult.descrizione,
                    downloadUrl: docResult.downloadUrl,
                    mimeType: docResult.mimeType,
                    dimensione: docResult.dimensione
                };
            }

            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvataggio nota...';

            // Salva la nota con eventuale riferimento al documento
            const notaData = {
                clienteId: this.clienteId,
                testo: testo,
                categoria: categoria,
                autoreId: user.uid,
                autoreNome: AuthService.getUserName(),
                creatoIl: firebase.firestore.FieldValue.serverTimestamp()
            };

            // Aggiungi riferimento documento se presente
            if (documentoAllegato) {
                notaData.documentoAllegato = documentoAllegato;
            }

            await db.collection('note_cliente').add(notaData);

            this.hideNuovaNota();
            await this.loadNote();
            UI.showSuccess(documentoAllegato ? 'Nota salvata con documento allegato!' : 'Nota salvata con successo');
        } catch (error) {
            console.error('Errore salvataggio nota:', error);
            UI.showError('Errore nel salvataggio: ' + (error.message || 'Errore sconosciuto'));
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Salva Nota';
        }
    },

    async editNota(notaId) {
        const nota = this.noteList.find(n => n.id === notaId);
        if (!nota) return;

        // Mostra info documento allegato esistente, se presente
        const docAllegatoInfo = nota.documentoAllegato ? `
            <div id="editDocAllegatoEsistente" style="
                margin-top: 0.75rem; padding: 0.625rem 0.875rem;
                background: var(--blu-100); border: 1px solid var(--blu-300); border-radius: 8px;
                display: flex; align-items: center; gap: 0.75rem;
            ">
                <i class="${DocumentService.getFileIcon(nota.documentoAllegato.mimeType)}" style="font-size: 1.1rem; color: ${DocumentService.getFileColor(nota.documentoAllegato.mimeType)};"></i>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 600; font-size: 0.8125rem; color: var(--blu-700);">${nota.documentoAllegato.nomeFile}</div>
                    <div style="font-size: 0.75rem; color: var(--grigio-500);">${nota.documentoAllegato.descrizione || ''}</div>
                </div>
                <button type="button" onclick="document.getElementById('editDocAllegatoEsistente').dataset.rimosso='true'; document.getElementById('editDocAllegatoEsistente').style.display='none'; document.getElementById('editAllegaNuovoDoc').style.display='block';" style="
                    background: none; border: none; cursor: pointer; color: var(--rosso-errore); padding: 0.35rem;
                    border-radius: 6px; font-size: 0.8125rem;
                " title="Rimuovi allegato dalla nota">
                    <i class="fas fa-unlink"></i>
                </button>
            </div>
        ` : '';

        await UI.showModal({
            title: '<i class="fas fa-pen"></i> Modifica Nota',
            content: `
                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: var(--grigio-700); font-size: 0.875rem;">
                        <i class="fas fa-tag"></i> Categoria
                    </label>
                    <select id="editNotaCategoria" style="width: 100%; padding: 0.625rem; border: 2px solid var(--grigio-300); border-radius: 8px; font-family: 'Titillium Web', sans-serif; font-size: 0.9375rem; background: white;">
                        <option value="generale" ${nota.categoria === 'generale' ? 'selected' : ''}>📋 Generale</option>
                        <option value="commerciale" ${nota.categoria === 'commerciale' ? 'selected' : ''}>💼 Commerciale</option>
                        <option value="tecnica" ${nota.categoria === 'tecnica' ? 'selected' : ''}>🔧 Tecnica</option>
                        <option value="amministrativa" ${nota.categoria === 'amministrativa' ? 'selected' : ''}>📄 Amministrativa</option>
                        <option value="importante" ${nota.categoria === 'importante' ? 'selected' : ''}>⚠️ Importante</option>
                    </select>
                </div>
                <div style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: var(--grigio-700); font-size: 0.875rem;">
                        <i class="fas fa-pencil-alt"></i> Testo
                    </label>
                    <textarea id="editNotaTesto" rows="5" style="width: 100%; padding: 0.75rem; border: 2px solid var(--grigio-300); border-radius: 8px; font-family: 'Titillium Web', sans-serif; font-size: 0.9375rem; resize: vertical; line-height: 1.5;">${nota.testo}</textarea>
                </div>

                <!-- Documento allegato esistente -->
                ${docAllegatoInfo}

                <!-- Sezione per allegare nuovo documento -->
                <div id="editAllegaNuovoDoc" style="display: ${nota.documentoAllegato ? 'none' : 'block'}; margin-top: 0.75rem;">
                    <button type="button" onclick="
                        const s = document.getElementById('editAllegaDocSection');
                        s.style.display = s.style.display === 'none' ? 'block' : 'none';
                    " style="
                        background: none; border: 1px dashed var(--blu-500); color: var(--blu-700);
                        padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer;
                        font-family: 'Titillium Web', sans-serif; font-size: 0.8125rem; font-weight: 600;
                        width: 100%; text-align: center; transition: all 0.2s;
                    ">
                        <i class="fas fa-paperclip"></i> Allega Documento
                    </button>
                    <div id="editAllegaDocSection" style="display: none; margin-top: 0.75rem; background: var(--grigio-100); border-radius: 8px; padding: 1rem;">
                        <div style="margin-bottom: 0.5rem;">
                            <label style="display: block; margin-bottom: 0.3rem; font-weight: 600; color: var(--grigio-700); font-size: 0.8125rem;">
                                <i class="fas fa-file"></i> File (PDF o Immagini, max 10MB)
                            </label>
                            <input type="file" id="editNotaFileInput" accept=".pdf,.jpg,.jpeg,.png" style="
                                width: 100%; padding: 0.5rem; border: 2px solid var(--grigio-300);
                                border-radius: 8px; background: white; cursor: pointer; font-size: 0.8125rem;
                            ">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 0.3rem; font-weight: 600; color: var(--grigio-700); font-size: 0.8125rem;">
                                <i class="fas fa-align-left"></i> Descrizione documento *
                            </label>
                            <input type="text" id="editNotaDocDescrizione" placeholder="Es: Delibera di giunta, PEC ricevuta..." style="
                                width: 100%; padding: 0.5rem 0.75rem; border: 2px solid var(--grigio-300);
                                border-radius: 8px; font-family: 'Titillium Web', sans-serif; font-size: 0.8125rem;
                            ">
                        </div>
                    </div>
                </div>
            `,
            confirmText: 'Salva Modifiche',
            cancelText: 'Annulla',
            onConfirm: async () => {
                const nuovoTesto = document.getElementById('editNotaTesto').value.trim();
                const nuovaCategoria = document.getElementById('editNotaCategoria').value;

                if (!nuovoTesto) {
                    UI.showError('Il testo non può essere vuoto');
                    return false;
                }

                // Verifica se c'è un nuovo file da allegare
                const editFileInput = document.getElementById('editNotaFileInput');
                const editDescInput = document.getElementById('editNotaDocDescrizione');
                const editAllegaSection = document.getElementById('editAllegaDocSection');
                const hasNuovoFile = editAllegaSection && editAllegaSection.style.display !== 'none' && editFileInput && editFileInput.files.length > 0;

                if (hasNuovoFile && (!editDescInput || !editDescInput.value.trim())) {
                    UI.showError('Inserisci una descrizione per il documento allegato');
                    return false;
                }

                // Verifica se il documento esistente è stato rimosso
                const docEsistente = document.getElementById('editDocAllegatoEsistente');
                const docRimosso = docEsistente && docEsistente.dataset.rimosso === 'true';

                try {
                    const updateData = {
                        testo: nuovoTesto,
                        categoria: nuovaCategoria,
                        modificatoIl: firebase.firestore.FieldValue.serverTimestamp()
                    };

                    // Upload nuovo documento se presente
                    if (hasNuovoFile) {
                        const file = editFileInput.files[0];
                        const descrizione = editDescInput.value.trim();
                        const docResult = await DocumentService.uploadDocumento(file, 'cliente', this.clienteId, descrizione);
                        updateData.documentoAllegato = {
                            documentoId: docResult.id,
                            nomeFile: docResult.nomeOriginale,
                            descrizione: docResult.descrizione,
                            downloadUrl: docResult.downloadUrl,
                            mimeType: docResult.mimeType,
                            dimensione: docResult.dimensione
                        };
                    } else if (docRimosso) {
                        // Rimuovi il riferimento al documento dalla nota (il documento resta nella sezione Documenti)
                        updateData.documentoAllegato = firebase.firestore.FieldValue.delete();
                    }

                    await db.collection('note_cliente').doc(notaId).update(updateData);

                    await this.loadNote();
                    UI.showSuccess('Nota aggiornata');
                    return true;
                } catch (error) {
                    console.error('Errore modifica nota:', error);
                    UI.showError('Errore nella modifica');
                    return false;
                }
            }
        });
    },

    async deleteNota(notaId) {
        const conferma = await UI.showModal({
            title: '<i class="fas fa-exclamation-triangle"></i> Elimina Nota',
            content: `
                <div style="text-align: center;">
                    <p style="font-size: 1.1rem; margin-bottom: 1rem;">Sei sicuro di voler eliminare questa nota?</p>
                    <p style="color: var(--rosso-errore); font-weight: 600;">⚠️ Questa azione non può essere annullata</p>
                </div>
            `,
            confirmText: 'Sì, elimina',
            cancelText: 'Annulla',
            confirmClass: 'btn-danger'
        });

        if (conferma) {
            try {
                await db.collection('note_cliente').doc(notaId).delete();
                await this.loadNote();
                UI.showSuccess('Nota eliminata');
            } catch (error) {
                console.error('Errore eliminazione nota:', error);
                UI.showError('Errore nell\'eliminazione');
            }
        }
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
                                    ${!AuthService.canViewOnlyOwnData() ? `<button class="btn btn-danger" onclick="DettaglioCliente.deleteDocumento('${doc.id}', '${doc.storagePath}', '${doc.nomeOriginale}')" style="
                                        white-space: nowrap;
                                        padding: 0.5rem 1rem;
                                    ">
                                        <i class="fas fa-trash"></i> Elimina
                                    </button>` : ''}
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
    },

    // =====================================================
    // TEMPLATE EMAIL/PEC
    // =====================================================

    /**
     * Mostra modal per selezionare e generare template comunicazione
     */
    async mostraModalTemplate() {
        try {
            // Carica contratti e fatture del cliente per le selezioni
            const [contratti, fatture] = await Promise.all([
                DataService.getContrattiCliente(this.clienteId),
                DataService.getFattureCliente(this.clienteId)
            ]);

            // Cache per uso successivo
            this._templateContratti = contratti;
            this._templateFatture = fatture;

            const templateCards = TemplateService.TEMPLATES.map(t => `
                <div
                    class="template-card"
                    id="tplCard_${t.id}"
                    onclick="DettaglioCliente.onTemplateSelezionato('${t.id}')"
                    style="padding: 1rem; border: 2px solid var(--grigio-300); border-radius: 10px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 0.75rem;"
                    onmouseover="this.style.borderColor='${t.color}'; this.style.background='${t.color}10'"
                    onmouseout="if(!this.classList.contains('selected')){this.style.borderColor='var(--grigio-300)'; this.style.background='white'}"
                >
                    <div style="width: 40px; height: 40px; border-radius: 50%; background: ${t.color}20; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="${t.icon}" style="color: ${t.color};"></i>
                    </div>
                    <div>
                        <strong style="font-size: 0.9rem; color: var(--grigio-900);">${t.nome}</strong>
                        ${t.richiede ? `<div style="font-size: 0.75rem; color: var(--grigio-500);">Richiede selezione ${t.richiede}</div>` : '<div style="font-size: 0.75rem; color: var(--grigio-500);">Solo dati cliente</div>'}
                    </div>
                </div>
            `).join('');

            const modalHtml = `
                <div id="templateModal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 1rem;">
                    <div style="background: white; border-radius: 16px; width: 100%; max-width: 700px; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                        <!-- Header -->
                        <div style="padding: 1.5rem; border-bottom: 1px solid var(--grigio-300); display: flex; justify-content: space-between; align-items: center;">
                            <h2 style="font-size: 1.25rem; font-weight: 700; color: var(--blu-700); margin: 0;">
                                <i class="fas fa-envelope"></i> Genera Comunicazione
                            </h2>
                            <button onclick="DettaglioCliente.chiudiModalTemplate()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--grigio-500); padding: 0.25rem;">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>

                        <!-- Step 1: Selezione Template -->
                        <div style="padding: 1.5rem;">
                            <p style="font-size: 0.875rem; color: var(--grigio-700); margin-bottom: 1rem;">Seleziona il tipo di comunicazione:</p>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;" id="templateGrid">
                                ${templateCards}
                            </div>
                        </div>

                        <!-- Step 2: Selezione entità (se necessario) -->
                        <div id="templateEntitaSection" style="display: none; padding: 0 1.5rem 1rem;">
                        </div>

                        <!-- Step 3: Testo generato -->
                        <div id="templateOutputSection" style="display: none; padding: 0 1.5rem 1.5rem;">
                            <div style="margin-bottom: 0.75rem;">
                                <label style="font-size: 0.8rem; font-weight: 600; color: var(--grigio-700);">Oggetto:</label>
                                <input type="text" id="templateOggetto" readonly style="width: 100%; padding: 0.5rem; border: 1px solid var(--grigio-300); border-radius: 6px; font-family: 'Titillium Web', sans-serif; background: var(--grigio-100); margin-top: 0.25rem;" />
                            </div>
                            <div style="margin-bottom: 1rem;">
                                <label style="font-size: 0.8rem; font-weight: 600; color: var(--grigio-700);">Corpo messaggio:</label>
                                <textarea id="templateCorpo" readonly style="width: 100%; min-height: 250px; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 6px; font-family: 'Titillium Web', sans-serif; background: var(--grigio-100); resize: vertical; margin-top: 0.25rem; line-height: 1.5;"></textarea>
                            </div>
                            <div style="display: flex; gap: 0.5rem;">
                                <button class="btn btn-primary" onclick="DettaglioCliente.copiaOggettoTemplate()" style="flex: 1;">
                                    <i class="fas fa-copy"></i> Copia Oggetto
                                </button>
                                <button class="btn btn-primary" onclick="DettaglioCliente.copiaCorpoTemplate()" style="flex: 2;">
                                    <i class="fas fa-copy"></i> Copia Corpo
                                </button>
                                <button class="btn btn-secondary" onclick="DettaglioCliente.copiaTuttoTemplate()" style="flex: 1;">
                                    <i class="fas fa-clipboard"></i> Copia Tutto
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

        } catch (error) {
            console.error('Errore apertura modal template:', error);
            UI.showError('Errore nell\'apertura dei template');
        }
    },

    chiudiModalTemplate() {
        const modal = document.getElementById('templateModal');
        if (modal) modal.remove();
    },

    /**
     * Gestisce selezione di un template
     */
    async onTemplateSelezionato(templateId) {
        this._selectedTemplateId = templateId;
        const template = TemplateService.TEMPLATES.find(t => t.id === templateId);
        if (!template) return;

        // Evidenzia card selezionata
        document.querySelectorAll('.template-card').forEach(card => {
            card.classList.remove('selected');
            card.style.borderColor = 'var(--grigio-300)';
            card.style.background = 'white';
        });
        const selectedCard = document.getElementById(`tplCard_${templateId}`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
            selectedCard.style.borderColor = template.color;
            selectedCard.style.background = template.color + '10';
        }

        const entitaSection = document.getElementById('templateEntitaSection');
        const outputSection = document.getElementById('templateOutputSection');

        // Se richiede selezione entità
        if (template.richiede === 'fattura') {
            if (this._templateFatture.length === 0) {
                entitaSection.innerHTML = '<p style="color: var(--rosso-errore); font-size: 0.875rem;"><i class="fas fa-exclamation-triangle"></i> Nessuna fattura trovata per questo cliente</p>';
                entitaSection.style.display = 'block';
                outputSection.style.display = 'none';
                return;
            }
            entitaSection.innerHTML = `
                <label style="font-size: 0.8rem; font-weight: 600; color: var(--grigio-700);">Seleziona fattura:</label>
                <select id="templateEntitaSelect" onchange="DettaglioCliente.generaTestoTemplate()" style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 8px; font-family: 'Titillium Web', sans-serif; margin-top: 0.25rem;">
                    <option value="">-- Seleziona una fattura --</option>
                    ${this._templateFatture.map((f, idx) => `<option value="${idx}">${f.numeroFatturaCompleto} • ${DataService.formatCurrency(f.importoTotale || 0)} • ${f.statoPagamento?.replace('_', ' ') || ''}</option>`).join('')}
                </select>
            `;
            entitaSection.style.display = 'block';
            outputSection.style.display = 'none';

        } else if (template.richiede === 'contratto') {
            if (this._templateContratti.length === 0) {
                entitaSection.innerHTML = '<p style="color: var(--rosso-errore); font-size: 0.875rem;"><i class="fas fa-exclamation-triangle"></i> Nessun contratto trovato per questo cliente</p>';
                entitaSection.style.display = 'block';
                outputSection.style.display = 'none';
                return;
            }
            entitaSection.innerHTML = `
                <label style="font-size: 0.8rem; font-weight: 600; color: var(--grigio-700);">Seleziona contratto:</label>
                <select id="templateEntitaSelect" onchange="DettaglioCliente.generaTestoTemplate()" style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 8px; font-family: 'Titillium Web', sans-serif; margin-top: 0.25rem;">
                    <option value="">-- Seleziona un contratto --</option>
                    ${this._templateContratti.map((c, idx) => `<option value="${idx}">${c.numeroContratto} • ${c.oggetto || 'Senza oggetto'} • ${c.stato || ''}</option>`).join('')}
                </select>
            `;
            entitaSection.style.display = 'block';
            outputSection.style.display = 'none';

        } else {
            // Template senza selezione entità → genera direttamente
            entitaSection.style.display = 'none';
            await this.generaTestoTemplate();
        }
    },

    /**
     * Genera il testo dal template selezionato
     */
    async generaTestoTemplate() {
        const template = TemplateService.TEMPLATES.find(t => t.id === this._selectedTemplateId);
        if (!template) return;

        let entita = null;
        if (template.richiede) {
            const select = document.getElementById('templateEntitaSelect');
            if (!select || select.value === '') return;
            const idx = parseInt(select.value);
            if (template.richiede === 'fattura') {
                entita = this._templateFatture[idx];
            } else {
                entita = this._templateContratti[idx];
            }
        }

        try {
            const cliente = await DataService.getCliente(this.clienteId);
            const risultato = await TemplateService.generaTesto(this._selectedTemplateId, cliente, entita);

            document.getElementById('templateOggetto').value = risultato.oggetto;
            document.getElementById('templateCorpo').value = risultato.corpo;
            document.getElementById('templateOutputSection').style.display = 'block';

        } catch (error) {
            console.error('Errore generazione testo:', error);
            UI.showError('Errore nella generazione del testo');
        }
    },

    async copiaOggettoTemplate() {
        const testo = document.getElementById('templateOggetto')?.value;
        if (testo && await TemplateService.copyToClipboard(testo)) {
            UI.showSuccess('Oggetto copiato negli appunti!');
        } else {
            UI.showError('Errore nella copia');
        }
    },

    async copiaCorpoTemplate() {
        const testo = document.getElementById('templateCorpo')?.value;
        if (testo && await TemplateService.copyToClipboard(testo)) {
            UI.showSuccess('Corpo messaggio copiato negli appunti!');
        } else {
            UI.showError('Errore nella copia');
        }
    },

    async copiaTuttoTemplate() {
        const oggetto = document.getElementById('templateOggetto')?.value || '';
        const corpo = document.getElementById('templateCorpo')?.value || '';
        const tutto = `Oggetto: ${oggetto}\n\n${corpo}`;
        if (await TemplateService.copyToClipboard(tutto)) {
            UI.showSuccess('Comunicazione completa copiata negli appunti!');
        } else {
            UI.showError('Errore nella copia');
        }
    }
};

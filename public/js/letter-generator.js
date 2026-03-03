/**
 * Letter Generator Module — Generazione Lettere AI + Download .docx
 *
 * Modulo completo che gestisce:
 * 1. Caricamento dinamico tipi lettera da Firestore (impostazioni/ai_letter_types)
 * 2. Raccolta dati dal CRM (DataService, GoodBarberService, TemplateService)
 * 3. Wizard multi-step per configurare la lettera
 * 4. Chiamata all'AI (POST /api/generate-letter)
 * 5. Anteprima del testo generato
 * 6. Generazione e download del file .docx
 *
 * I tipi di lettera e le sezioni dati sono configurabili dalle Impostazioni del CRM.
 *
 * Dipendenze: DataService, AuthService, TemplateService (getDatiAzienda),
 *             GoodBarberService (opzionale), docx library (caricata on-demand da CDN)
 */
const LetterGenerator = {

    // ============================================================
    // TIPI DI LETTERA DEFAULT — usati al primo avvio per inizializzare Firestore
    // ============================================================
    _DEFAULT_TYPES: {
        rinnovo_contratto: {
            id: 'rinnovo_contratto',
            nome: 'Rinnovo Contratto',
            descrizione: 'Proposta di rinnovo per contratti in scadenza o scaduti',
            icona: 'fas fa-file-contract',
            colore: '#145284',
            richiede: 'contratto',
            promptAI: 'Ringrazia per la collaborazione passata. Evidenzia i risultati ottenuti (statistiche app se disponibili). Proponi il rinnovo alle stesse condizioni o migliorate. Indica la data di scadenza del contratto attuale. Invita a un incontro o chiamata per discutere il rinnovo.',
            sezioniDati: ['includes_contract_details', 'includes_payment_history', 'includes_app_stats', 'includes_renewal_proposal'],
            isDefault: true,
            ordine: 1
        },
        sollecito_pagamento: {
            id: 'sollecito_pagamento',
            nome: 'Sollecito Pagamento',
            descrizione: 'Sollecito cortese per fatture non pagate',
            icona: 'fas fa-file-invoice-dollar',
            colore: '#D32F2F',
            richiede: 'fattura',
            promptAI: 'Tono cortese ma fermo. Indica chiaramente le fatture non pagate con numeri e importi. Ricorda le condizioni di pagamento concordate. Proponi modalita\' di pagamento o dilazione se appropriato. Invita a contattare per chiarimenti.',
            sezioniDati: ['includes_payment_history', 'includes_contract_details'],
            isDefault: true,
            ordine: 2
        },
        benvenuto: {
            id: 'benvenuto',
            nome: 'Benvenuto',
            descrizione: 'Lettera di benvenuto per nuovi clienti',
            icona: 'fas fa-handshake',
            colore: '#3CA434',
            richiede: null,
            promptAI: 'Tono caloroso e accogliente. Presenta brevemente i servizi offerti. Illustra i prossimi step (formazione, configurazione app, ecc.). Fornisci i contatti di riferimento per assistenza. Esprimi entusiasmo per la nuova collaborazione.',
            sezioniDati: ['includes_contract_details'],
            isDefault: true,
            ordine: 3
        }
    },

    // Definizioni sezioni dati disponibili (usate nelle Impostazioni e nel wizard)
    SECTION_DEFINITIONS: {
        includes_payment_history: { id: 'includes_payment_history', label: 'Storico pagamenti', icon: 'fas fa-receipt', description: 'Include riepilogo fatture emesse e stato pagamenti' },
        includes_app_stats: { id: 'includes_app_stats', label: 'Statistiche App', icon: 'fas fa-chart-line', description: 'Include download, utenti attivi e utilizzo dell\'app' },
        includes_contract_details: { id: 'includes_contract_details', label: 'Dettagli contratto', icon: 'fas fa-file-alt', description: 'Include numero, importo, date e tipologia del contratto' },
        includes_renewal_proposal: { id: 'includes_renewal_proposal', label: 'Proposta di rinnovo', icon: 'fas fa-redo', description: 'Include proposta esplicita di rinnovo alle stesse condizioni' }
    },

    // Cache
    _letterTypesCache: null,
    _currentClienteId: null,
    _currentCliente: null,
    _currentContratti: [],
    _currentFatture: [],
    _currentApp: null,
    _currentAppStats: null,
    _currentAzienda: null,
    _generatedSections: null,
    _selectedType: null,
    _selectedEntity: null,

    // ============================================================
    // CARICAMENTO TIPI DA FIRESTORE
    // ============================================================
    async loadLetterTypes(forceReload) {
        if (this._letterTypesCache && !forceReload) return this._letterTypesCache;

        try {
            const doc = await db.collection('impostazioni').doc('ai_letter_types').get();
            if (doc.exists && doc.data().types && Object.keys(doc.data().types).length > 0) {
                this._letterTypesCache = doc.data().types;
            } else {
                // Primo avvio: inizializza con i tipi default
                await this._initDefaultTypes();
            }
        } catch (e) {
            console.warn('[LetterGenerator] Errore caricamento tipi, uso defaults:', e);
            this._letterTypesCache = { ...this._DEFAULT_TYPES };
        }

        return this._letterTypesCache;
    },

    async _initDefaultTypes() {
        console.log('[LetterGenerator] Inizializzazione tipi default su Firestore...');
        try {
            const user = firebase.auth().currentUser;
            await db.collection('impostazioni').doc('ai_letter_types').set({
                types: { ...this._DEFAULT_TYPES },
                ultimaModifica: new Date().toISOString(),
                modificatoDa: user?.displayName || 'Sistema',
                modificatoDaId: user?.uid || 'system'
            });
            this._letterTypesCache = { ...this._DEFAULT_TYPES };
        } catch (e) {
            console.error('[LetterGenerator] Errore inizializzazione tipi:', e);
            this._letterTypesCache = { ...this._DEFAULT_TYPES };
        }
    },

    /**
     * Restituisce i tipi come array ordinato per campo 'ordine'
     */
    _getTypesArray() {
        if (!this._letterTypesCache) return [];
        return Object.values(this._letterTypesCache).sort((a, b) => (a.ordine || 99) - (b.ordine || 99));
    },

    /**
     * Invalida la cache dei tipi (usato da Settings dopo un salvataggio)
     */
    invalidateCache() {
        this._letterTypesCache = null;
    },

    // ============================================================
    // PUNTO DI INGRESSO — Apre il wizard
    // ============================================================
    async open(clienteId) {
        this._currentClienteId = clienteId;
        this._generatedSections = null;
        this._selectedType = null;
        this._selectedEntity = null;

        UI.showLoading();

        try {
            // Carica tipi lettera + dati cliente in parallelo
            const [letterTypes, cliente, contratti, fatture, azienda] = await Promise.all([
                this.loadLetterTypes(),
                DataService.getCliente(clienteId),
                DataService.getContratti ? DataService.getContratti({ clienteId }) : DataService.getContrattiCliente(clienteId),
                DataService.getFattureCliente(clienteId),
                TemplateService.getDatiAzienda()
            ]);

            if (!cliente) {
                UI.hideLoading();
                UI.showError('Cliente non trovato');
                return;
            }

            this._currentCliente = cliente;
            this._currentContratti = (contratti || []).filter(c => {
                const ids = [clienteId, cliente.clienteIdLegacy].filter(Boolean);
                return ids.includes(c.clienteId);
            });
            this._currentFatture = fatture || [];
            this._currentAzienda = azienda || {};

            // Cerca app associata al cliente
            try {
                const snapshot = await db.collection('app').where('clientePaganteId', '==', clienteId).get();
                if (!snapshot.empty) {
                    const appDoc = snapshot.docs[0];
                    this._currentApp = { id: appDoc.id, ...appDoc.data() };
                } else {
                    this._currentApp = null;
                }
            } catch (e) {
                console.warn('[LetterGenerator] Errore caricamento app:', e);
                this._currentApp = null;
            }

            UI.hideLoading();
            this._showStep1();

        } catch (error) {
            UI.hideLoading();
            console.error('[LetterGenerator] Errore apertura wizard:', error);
            UI.showError('Errore nel caricamento dei dati: ' + error.message);
        }
    },

    // ============================================================
    // STEP 1 — Selezione tipo di lettera (DINAMICO da Firestore)
    // ============================================================
    _showStep1() {
        const cliente = this._currentCliente;
        const types = this._getTypesArray();

        if (types.length === 0) {
            this._showModal(`
                <div style="text-align: center; padding: 2rem;">
                    <i class="fas fa-inbox" style="font-size: 3rem; color: var(--grigio-300); margin-bottom: 1rem;"></i>
                    <h3 style="color: var(--grigio-700);">Nessun tipo di lettera configurato</h3>
                    <p style="color: var(--grigio-500); font-size: 0.85rem;">Vai in Impostazioni &gt; Generatore Lettere AI per configurare i tipi di lettera disponibili.</p>
                </div>
            `);
            return;
        }

        const typeCards = types.map(type => {
            // Verifica disponibilita'
            let disabled = false;
            let disabledMsg = '';
            if (type.richiede === 'contratto' && this._currentContratti.length === 0) {
                disabled = true;
                disabledMsg = 'Nessun contratto presente';
            }
            if (type.richiede === 'fattura') {
                const nonPagate = this._currentFatture.filter(f => f.statoPagamento === 'NON_PAGATA' || f.statoPagamento === 'PARZIALMENTE_PAGATA');
                if (nonPagate.length === 0) {
                    disabled = true;
                    disabledMsg = 'Nessuna fattura da sollecitare';
                }
            }

            const color = type.colore || '#145284';
            const icon = type.icona || 'fas fa-envelope';

            return `
                <div class="letter-type-card ${disabled ? 'disabled' : ''}"
                     data-type="${type.id}"
                     onclick="${disabled ? '' : `LetterGenerator._onTypeSelected('${type.id}')`}"
                     style="
                        background: white;
                        border: 2px solid ${disabled ? 'var(--grigio-300)' : color + '30'};
                        border-radius: 14px;
                        padding: 1.25rem;
                        cursor: ${disabled ? 'not-allowed' : 'pointer'};
                        transition: all 0.2s;
                        opacity: ${disabled ? '0.5' : '1'};
                        ${disabled ? '' : 'box-shadow: 0 2px 8px rgba(0,0,0,0.04);'}
                     "
                     ${disabled ? '' : `
                        onmouseover="this.style.borderColor='${color}';this.style.boxShadow='0 4px 16px ${color}20';"
                        onmouseout="this.style.borderColor='${color}30';this.style.boxShadow='0 2px 8px rgba(0,0,0,0.04)';"
                     `}
                >
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <div style="width: 48px; height: 48px; border-radius: 12px; background: ${color}15; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <i class="${icon}" style="font-size: 1.25rem; color: ${color};"></i>
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-weight: 700; color: var(--grigio-900); font-size: 1rem; margin-bottom: 0.2rem;">${type.nome}</div>
                            <div style="font-size: 0.8rem; color: var(--grigio-500);">${type.descrizione || ''}</div>
                            ${disabled ? `<div style="font-size: 0.75rem; color: var(--rosso-errore); margin-top: 0.25rem;"><i class="fas fa-info-circle"></i> ${disabledMsg}</div>` : ''}
                        </div>
                        ${disabled ? '' : '<i class="fas fa-chevron-right" style="color: var(--grigio-300); flex-shrink: 0;"></i>'}
                    </div>
                </div>
            `;
        }).join('');

        this._showModal(`
            <div style="margin-bottom: 1.5rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                    <div style="background: var(--blu-100); width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 700; color: var(--blu-700);">1</div>
                    <span style="font-weight: 600; color: var(--grigio-700);">Scegli il tipo di lettera per <strong style="color: var(--blu-700);">${cliente.ragioneSociale}</strong></span>
                </div>
            </div>
            <div style="display: grid; gap: 0.75rem;">
                ${typeCards}
            </div>
        `);
    },

    _onTypeSelected(typeId) {
        const type = this._letterTypesCache[typeId];
        if (!type) return;

        this._selectedType = type;

        if (type.richiede === 'contratto') {
            this._showStep2Contratto();
        } else if (type.richiede === 'fattura') {
            this._showStep2Fattura();
        } else {
            this._selectedEntity = null;
            this._showStep3();
        }
    },

    // ============================================================
    // STEP 2 — Selezione entita' (contratto o fattura)
    // ============================================================
    _showStep2Contratto() {
        const contratti = this._currentContratti
            .sort((a, b) => new Date(b.dataScadenza || 0) - new Date(a.dataScadenza || 0));

        const options = contratti.map(c => {
            const stato = c.stato || 'N/D';
            const badgeClass = stato === 'ATTIVO' ? 'background: var(--verde-700); color: white;' :
                              stato === 'SCADUTO' ? 'background: var(--rosso-errore); color: white;' :
                              'background: var(--grigio-300); color: var(--grigio-700);';
            return `
                <div class="letter-entity-option" onclick="LetterGenerator._onEntitySelected('${c.id}')" style="
                    background: white; border: 2px solid var(--grigio-300); border-radius: 12px; padding: 1rem;
                    cursor: pointer; transition: all 0.2s;
                " onmouseover="this.style.borderColor='var(--blu-500)';this.style.background='var(--blu-100)'" onmouseout="this.style.borderColor='var(--grigio-300)';this.style.background='white'">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem;">
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-weight: 700; color: var(--grigio-900);">
                                ${c.numeroContratto || 'Senza numero'}
                                <span style="font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 10px; margin-left: 0.5rem; ${badgeClass}">${stato}</span>
                            </div>
                            <div style="font-size: 0.8rem; color: var(--grigio-500); margin-top: 0.25rem;">
                                ${c.oggetto ? c.oggetto.substring(0, 80) : 'N/D'}
                            </div>
                            <div style="font-size: 0.75rem; color: var(--grigio-500); margin-top: 0.25rem;">
                                ${c.importoAnnuale ? DataService.formatCurrency(c.importoAnnuale) : ''}
                                ${c.dataScadenza ? '&bull; Scadenza: ' + DataService.formatDate(c.dataScadenza) : ''}
                            </div>
                        </div>
                        <i class="fas fa-chevron-right" style="color: var(--grigio-300); flex-shrink: 0;"></i>
                    </div>
                </div>
            `;
        }).join('');

        this._showModal(`
            <div style="margin-bottom: 1.5rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;">
                    <div style="background: var(--blu-100); width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 700; color: var(--blu-700);">2</div>
                    <span style="font-weight: 600; color: var(--grigio-700);">Seleziona il contratto</span>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="LetterGenerator._showStep1()" style="margin-bottom: 0.5rem;">
                    <i class="fas fa-arrow-left"></i> Indietro
                </button>
            </div>
            <div style="display: grid; gap: 0.5rem; max-height: 400px; overflow-y: auto;">
                ${options}
            </div>
        `);
    },

    _showStep2Fattura() {
        const fatture = this._currentFatture
            .filter(f => f.statoPagamento === 'NON_PAGATA' || f.statoPagamento === 'PARZIALMENTE_PAGATA')
            .sort((a, b) => new Date(a.dataScadenza || 0) - new Date(b.dataScadenza || 0));

        const options = fatture.map(f => `
            <div class="letter-entity-option" onclick="LetterGenerator._onEntitySelected('${f.id}')" style="
                background: white; border: 2px solid var(--grigio-300); border-radius: 12px; padding: 1rem;
                cursor: pointer; transition: all 0.2s;
            " onmouseover="this.style.borderColor='var(--rosso-errore)';this.style.background='#FFEBEE'" onmouseout="this.style.borderColor='var(--grigio-300)';this.style.background='white'">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 700; color: var(--grigio-900);">
                            ${f.numeroFatturaCompleto || 'N/D'}
                        </div>
                        <div style="font-size: 0.85rem; color: var(--rosso-errore); font-weight: 600;">
                            ${DataService.formatCurrency(f.importoTotale)}
                        </div>
                        <div style="font-size: 0.75rem; color: var(--grigio-500);">
                            Emessa: ${DataService.formatDate(f.dataEmissione)} &bull; Scadenza: ${DataService.formatDate(f.dataScadenza)}
                        </div>
                    </div>
                    <i class="fas fa-chevron-right" style="color: var(--grigio-300);"></i>
                </div>
            </div>
        `).join('');

        this._showModal(`
            <div style="margin-bottom: 1.5rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;">
                    <div style="background: var(--blu-100); width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 700; color: var(--blu-700);">2</div>
                    <span style="font-weight: 600; color: var(--grigio-700);">Seleziona la fattura da sollecitare</span>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="LetterGenerator._showStep1()" style="margin-bottom: 0.5rem;">
                    <i class="fas fa-arrow-left"></i> Indietro
                </button>
            </div>
            <div style="display: grid; gap: 0.5rem; max-height: 400px; overflow-y: auto;">
                ${options}
            </div>
        `);
    },

    _onEntitySelected(entityId) {
        if (this._selectedType.richiede === 'contratto') {
            this._selectedEntity = this._currentContratti.find(c => c.id === entityId);
        } else {
            this._selectedEntity = this._currentFatture.find(f => f.id === entityId);
        }
        this._showStep3();
    },

    // ============================================================
    // STEP 3 — Selezione sezioni opzionali (DINAMICHE per tipo)
    // ============================================================
    _showStep3() {
        const hasApp = !!this._currentApp;
        // Mostra solo le sezioni configurate per questo tipo di lettera
        const availableSectionIds = this._selectedType.sezioniDati || [];

        const checkboxes = availableSectionIds.map(sectionId => {
            const section = this.SECTION_DEFINITIONS[sectionId];
            if (!section) return '';

            const disabled = sectionId === 'includes_app_stats' && !hasApp;
            const checked = !disabled && sectionId !== 'includes_app_stats';

            return `
                <label style="
                    display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem;
                    background: ${disabled ? 'var(--grigio-100)' : 'white'}; border: 1px solid var(--grigio-300);
                    border-radius: 10px; cursor: ${disabled ? 'not-allowed' : 'pointer'};
                    opacity: ${disabled ? '0.5' : '1'}; transition: all 0.15s;
                " ${disabled ? '' : `onmouseover="this.style.borderColor='var(--blu-500)'" onmouseout="this.style.borderColor='var(--grigio-300)'"`}>
                    <input type="checkbox" id="letterOpt_${section.id}" name="${section.id}"
                           ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}
                           style="width: 18px; height: 18px; accent-color: var(--blu-700);">
                    <div style="flex: 1;">
                        <div style="font-weight: 600; font-size: 0.9rem; color: var(--grigio-900);">
                            <i class="${section.icon}" style="width: 20px; text-align: center; margin-right: 4px; color: var(--blu-500);"></i>
                            ${section.label}
                        </div>
                        <div style="font-size: 0.75rem; color: var(--grigio-500);">${section.description}</div>
                        ${disabled ? '<div style="font-size: 0.7rem; color: var(--rosso-errore);"><i class="fas fa-info-circle"></i> Nessuna app associata a questo cliente</div>' : ''}
                    </div>
                </label>
            `;
        }).filter(Boolean).join('');

        const sectionLabel = this._selectedType.nome || 'Lettera';
        const sectionIcon = this._selectedType.icona || 'fas fa-envelope';

        this._showModal(`
            <div style="margin-bottom: 1.5rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;">
                    <div style="background: var(--blu-100); width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 700; color: var(--blu-700);">3</div>
                    <span style="font-weight: 600; color: var(--grigio-700);">Cosa vuoi includere nella lettera?</span>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="LetterGenerator._showStep1()" style="margin-bottom: 0.5rem;">
                    <i class="fas fa-arrow-left"></i> Ricomincia
                </button>
            </div>

            <!-- Riepilogo tipo + entita' -->
            <div style="background: var(--blu-100); border-radius: 10px; padding: 0.75rem 1rem; margin-bottom: 1rem; font-size: 0.85rem;">
                <strong style="color: var(--blu-700);"><i class="${sectionIcon}"></i> ${sectionLabel}</strong>
                ${this._selectedEntity ? `<span style="color: var(--grigio-500);"> &bull; ${this._selectedEntity.numeroContratto || this._selectedEntity.numeroFatturaCompleto || ''}</span>` : ''}
            </div>

            ${checkboxes ? `
                <div style="display: grid; gap: 0.5rem; margin-bottom: 1.5rem;">
                    ${checkboxes}
                </div>
            ` : ''}

            <!-- Istruzioni personalizzate -->
            <div style="margin-bottom: 1.5rem;">
                <label style="font-weight: 600; font-size: 0.85rem; color: var(--grigio-700); display: block; margin-bottom: 0.5rem;">
                    <i class="fas fa-pencil-alt" style="margin-right: 4px;"></i> Istruzioni aggiuntive (opzionale)
                </label>
                <textarea id="letterCustomInstructions" placeholder="Es: Menziona che offriamo uno sconto del 10% per il rinnovo anticipato..."
                    style="width: 100%; min-height: 70px; border: 1px solid var(--grigio-300); border-radius: 10px; padding: 0.75rem; font-family: inherit; font-size: 0.85rem; resize: vertical;"></textarea>
            </div>

            <button class="btn btn-primary" onclick="LetterGenerator._generateLetter()" style="width: 100%; padding: 0.85rem; font-size: 1rem; border-radius: 12px;">
                <i class="fas fa-magic"></i> Genera Lettera con AI
            </button>
        `);
    },

    // ============================================================
    // STEP 4 — Generazione AI + Anteprima
    // ============================================================
    async _generateLetter() {
        // Raccogli le sezioni selezionate
        const selectedSections = {};
        const availableSectionIds = this._selectedType.sezioniDati || [];
        availableSectionIds.forEach(sectionId => {
            const checkbox = document.getElementById('letterOpt_' + sectionId);
            if (checkbox) selectedSections[sectionId] = checkbox.checked;
        });

        const customInstructions = (document.getElementById('letterCustomInstructions')?.value || '').trim();

        // Mostra loading nel modal
        const modalBody = document.getElementById('letterModalBody');
        if (modalBody) {
            modalBody.innerHTML = `
                <div style="text-align: center; padding: 3rem 1rem;">
                    <div style="font-size: 3rem; color: var(--blu-700); margin-bottom: 1rem;">
                        <i class="fas fa-robot fa-pulse"></i>
                    </div>
                    <h3 style="color: var(--blu-700); margin-bottom: 0.5rem;">Generazione in corso...</h3>
                    <p style="color: var(--grigio-500); font-size: 0.85rem;">L'AI sta creando una lettera personalizzata per <strong>${this._currentCliente.ragioneSociale}</strong></p>
                    <div style="margin-top: 1.5rem; width: 200px; height: 4px; background: var(--grigio-300); border-radius: 4px; margin: 1.5rem auto 0; overflow: hidden;">
                        <div style="width: 40%; height: 100%; background: var(--blu-700); border-radius: 4px; animation: letterProgress 2s ease-in-out infinite;"></div>
                    </div>
                </div>
                <style>
                    @keyframes letterProgress {
                        0% { transform: translateX(-100%); }
                        50% { transform: translateX(150%); }
                        100% { transform: translateX(-100%); }
                    }
                </style>
            `;
        }

        try {
            // Carica statistiche app se richieste e disponibili
            let appStats = null;
            if (selectedSections.includes_app_stats && this._currentApp && this._currentApp.goodbarberWebzineId && this._currentApp.goodbarberToken) {
                try {
                    const stats = await GoodBarberService.getAllStats(this._currentApp.goodbarberWebzineId, this._currentApp.goodbarberToken);
                    if (stats) {
                        appStats = {
                            downloads: stats.downloads_global?.total || stats.downloads_global?.count || null,
                            launches: stats.launches?.total || stats.launches?.count || null,
                            uniqueUsers: stats.unique_launches?.total || stats.unique_launches?.count || null,
                            pageViews: stats.page_views?.total || stats.page_views?.count || null,
                            avgSessionTime: stats.session_times?.average || null
                        };
                    }
                } catch (e) {
                    console.warn('[LetterGenerator] Statistiche app non disponibili:', e.message);
                }
            }

            // Prepara il payload con letterTypeInfo dinamico
            const payload = {
                letterTypeInfo: {
                    id: this._selectedType.id,
                    nome: this._selectedType.nome,
                    descrizione: this._selectedType.descrizione || '',
                    promptAI: this._selectedType.promptAI
                },
                cliente: {
                    ragioneSociale: this._currentCliente.ragioneSociale,
                    tipo: this._currentCliente.tipo,
                    indirizzo: this._currentCliente.indirizzo,
                    cap: this._currentCliente.cap,
                    comune: this._currentCliente.comune,
                    provincia: this._currentCliente.provincia,
                    email: this._currentCliente.email,
                    pec: this._currentCliente.pec,
                    telefono: this._currentCliente.telefono,
                    referente: this._currentCliente.referente || this._currentCliente.referenteComune || null
                },
                contratto: this._selectedEntity && this._selectedType.richiede === 'contratto' ? {
                    numeroContratto: this._selectedEntity.numeroContratto,
                    oggetto: this._selectedEntity.oggetto,
                    importoAnnuale: this._selectedEntity.importoAnnuale,
                    dataInizio: this._selectedEntity.dataInizio,
                    dataScadenza: this._selectedEntity.dataScadenza,
                    stato: this._selectedEntity.stato,
                    tipologia: this._selectedEntity.tipologia
                } : null,
                fatture: selectedSections.includes_payment_history ? this._currentFatture.slice(0, 10).map(f => ({
                    numeroFatturaCompleto: f.numeroFatturaCompleto,
                    importoTotale: f.importoTotale,
                    statoPagamento: f.statoPagamento,
                    dataEmissione: f.dataEmissione,
                    dataScadenza: f.dataScadenza
                })) : null,
                app: this._currentApp ? {
                    nomeApp: this._currentApp.nomeApp || this._currentApp.nome,
                    comune: this._currentApp.comune,
                    popolazione: this._currentApp.popolazione,
                    statoApp: this._currentApp.statoApp,
                    referenteComune: this._currentApp.referenteComune
                } : null,
                appStats: appStats,
                azienda: this._currentAzienda,
                selectedSections: selectedSections,
                customInstructions: customInstructions || null
            };

            // Se il tipo e' sollecito, passa la fattura specifica
            if (this._selectedType.richiede === 'fattura' && this._selectedEntity) {
                payload.fattura_sollecitata = {
                    numeroFatturaCompleto: this._selectedEntity.numeroFatturaCompleto,
                    importoTotale: this._selectedEntity.importoTotale,
                    statoPagamento: this._selectedEntity.statoPagamento,
                    dataEmissione: this._selectedEntity.dataEmissione,
                    dataScadenza: this._selectedEntity.dataScadenza
                };
            }

            // Chiama l'API
            let baseUrl = '';
            try { baseUrl = window.location.origin; } catch (e) { baseUrl = ''; }

            const response = await fetch(baseUrl + '/api/generate-letter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: 'Errore sconosciuto' }));
                throw new Error(errData.error || `Errore HTTP ${response.status}`);
            }

            const result = await response.json();
            this._generatedSections = result.sections;

            this._showStep4Preview(result);

        } catch (error) {
            console.error('[LetterGenerator] Errore generazione:', error);
            if (modalBody) {
                modalBody.innerHTML = `
                    <div style="text-align: center; padding: 2rem 1rem;">
                        <div style="font-size: 3rem; color: var(--rosso-errore); margin-bottom: 1rem;">
                            <i class="fas fa-exclamation-triangle"></i>
                        </div>
                        <h3 style="color: var(--rosso-errore); margin-bottom: 0.5rem;">Errore nella generazione</h3>
                        <p style="color: var(--grigio-500); font-size: 0.85rem; margin-bottom: 1.5rem;">${error.message}</p>
                        <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
                            <button class="btn btn-primary" onclick="LetterGenerator._showStep3()">
                                <i class="fas fa-arrow-left"></i> Torna indietro
                            </button>
                            <button class="btn btn-secondary" onclick="LetterGenerator._generateLetter()">
                                <i class="fas fa-redo"></i> Riprova
                            </button>
                        </div>
                    </div>
                `;
            }
        }
    },

    _showStep4Preview(result) {
        const sections = result.sections;
        const metadata = result.metadata || {};

        const fullText = [
            sections.salutation,
            sections.intro,
            sections.body,
            sections.stats || '',
            sections.closing,
            sections.signature
        ].filter(Boolean).join('\n\n');

        this._showModal(`
            <div style="margin-bottom: 1rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;">
                    <div style="background: var(--verde-100); width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 700; color: var(--verde-700);">4</div>
                    <span style="font-weight: 600; color: var(--grigio-700);">Anteprima della lettera</span>
                </div>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem;">
                    <button class="btn btn-secondary btn-sm" onclick="LetterGenerator._showStep3()">
                        <i class="fas fa-arrow-left"></i> Modifica opzioni
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="LetterGenerator._generateLetter()">
                        <i class="fas fa-redo"></i> Rigenera
                    </button>
                </div>
            </div>

            <div style="background: white; border: 1px solid var(--grigio-300); border-radius: 12px; padding: 1.5rem; max-height: 400px; overflow-y: auto; font-size: 0.9rem; line-height: 1.7; white-space: pre-wrap; font-family: 'Titillium Web', serif; box-shadow: inset 0 2px 4px rgba(0,0,0,0.04);">
${fullText}
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.75rem; font-size: 0.75rem; color: var(--grigio-500);">
                <span><i class="fas fa-robot"></i> Generata da AI &bull; ${metadata.charCount || '?'} caratteri</span>
                ${result.usage ? `<span><i class="fas fa-coins"></i> ${result.usage.input_tokens + result.usage.output_tokens} tokens</span>` : ''}
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-top: 1.25rem;">
                <button class="btn btn-secondary" onclick="LetterGenerator._copyToClipboard()" style="padding: 0.85rem; border-radius: 12px;">
                    <i class="fas fa-copy"></i> Copia testo
                </button>
                <button class="btn btn-primary" onclick="LetterGenerator._downloadDocx()" style="padding: 0.85rem; border-radius: 12px; font-weight: 700;">
                    <i class="fas fa-file-word"></i> Scarica Word
                </button>
            </div>
        `);
    },

    // ============================================================
    // AZIONI — Copia e Download
    // ============================================================
    async _copyToClipboard() {
        if (!this._generatedSections) return;
        const sections = this._generatedSections;
        const fullText = [sections.salutation, sections.intro, sections.body, sections.stats || '', sections.closing, sections.signature].filter(Boolean).join('\n\n');

        try {
            await navigator.clipboard.writeText(fullText);
            UI.showSuccess('Testo copiato negli appunti!');
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = fullText;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            UI.showSuccess('Testo copiato negli appunti!');
        }
    },

    async _downloadDocx() {
        if (!this._generatedSections) return;

        try {
            // Carica la libreria docx on-demand se non gia' presente
            if (typeof docx === 'undefined' || typeof window.docx === 'undefined') {
                await new Promise((resolve, reject) => {
                    if (document.querySelector('script[data-docx-lib]')) {
                        const check = setInterval(() => {
                            if (typeof window.docx !== 'undefined') { clearInterval(check); resolve(); }
                        }, 200);
                        setTimeout(() => { clearInterval(check); reject(new Error('Timeout caricamento libreria')); }, 15000);
                        return;
                    }
                    const s = document.createElement('script');
                    s.src = 'https://unpkg.com/docx@9.1.1/build/index.umd.js';
                    s.setAttribute('data-docx-lib', 'true');
                    s.onload = () => {
                        const check = setInterval(() => {
                            if (typeof window.docx !== 'undefined') { clearInterval(check); resolve(); }
                        }, 100);
                        setTimeout(() => { clearInterval(check); reject(new Error('Libreria docx caricata ma non disponibile')); }, 5000);
                    };
                    s.onerror = () => reject(new Error('Impossibile caricare la libreria docx'));
                    document.head.appendChild(s);
                });
            }

            const sections = this._generatedSections;
            const cliente = this._currentCliente;
            const azienda = this._currentAzienda;
            const children = [];

            // --- INTESTAZIONE AZIENDA ---
            children.push(
                new docx.Paragraph({
                    children: [new docx.TextRun({ text: azienda.nomeAzienda || azienda.ragioneSociale || 'Growapp S.r.l.', bold: true, size: 32, color: '145284', font: 'Titillium Web' })],
                    spacing: { after: 60 }
                })
            );

            const aziendaInfo = [
                azienda.indirizzoAzienda || azienda.indirizzo,
                azienda.emailAzienda || azienda.email,
                azienda.pecAzienda || azienda.pec ? 'PEC: ' + (azienda.pecAzienda || azienda.pec) : null,
                azienda.telefonoAzienda || azienda.telefono ? 'Tel: ' + (azienda.telefonoAzienda || azienda.telefono) : null,
                azienda.sitoAzienda || azienda.sito
            ].filter(Boolean).join(' | ');

            if (aziendaInfo) {
                children.push(new docx.Paragraph({
                    children: [new docx.TextRun({ text: aziendaInfo, size: 16, color: '9B9B9B', font: 'Titillium Web' })],
                    spacing: { after: 100 }
                }));
            }

            children.push(new docx.Paragraph({
                border: { bottom: { color: '145284', space: 1, style: docx.BorderStyle.SINGLE, size: 6 } },
                spacing: { after: 300 }
            }));

            // --- DATA ---
            const oggi = new Date();
            const dataLettera = `${oggi.getDate()} ${['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'][oggi.getMonth()]} ${oggi.getFullYear()}`;
            children.push(new docx.Paragraph({
                children: [new docx.TextRun({ text: dataLettera, size: 20, color: '4A4A4A', font: 'Titillium Web' })],
                alignment: docx.AlignmentType.RIGHT,
                spacing: { after: 300 }
            }));

            // --- DESTINATARIO ---
            const dest = [
                cliente.ragioneSociale,
                cliente.indirizzo,
                [cliente.cap, cliente.comune, cliente.provincia ? '(' + cliente.provincia + ')' : ''].filter(Boolean).join(' ')
            ].filter(Boolean);

            dest.forEach(line => {
                children.push(new docx.Paragraph({
                    children: [new docx.TextRun({ text: line, size: 22, font: 'Titillium Web', bold: line === cliente.ragioneSociale })],
                    spacing: { after: 40 }
                }));
            });

            children.push(new docx.Paragraph({ spacing: { after: 200 } }));

            // --- CORPO LETTERA ---
            const sectionTexts = [
                sections.salutation, sections.intro, sections.body,
                sections.stats || '', sections.closing, sections.signature
            ].filter(Boolean);

            sectionTexts.forEach((sectionText, idx) => {
                const paragraphs = sectionText.split(/\n\n+/);
                paragraphs.forEach(para => {
                    const trimmed = para.trim();
                    if (!trimmed) return;
                    const isFirma = idx === sectionTexts.length - 1;
                    const isSaluto = idx === 0;

                    children.push(new docx.Paragraph({
                        children: [new docx.TextRun({
                            text: trimmed, size: 22, font: 'Titillium Web',
                            bold: isSaluto || isFirma,
                            color: isFirma ? '145284' : '1E1E1E'
                        })],
                        spacing: { after: 200 },
                        alignment: docx.AlignmentType.JUSTIFIED
                    }));
                });
            });

            const doc = new docx.Document({
                sections: [{
                    properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
                    children: children
                }]
            });

            const blob = await docx.Packer.toBlob(doc);
            const typeName = (this._selectedType.nome || 'Lettera').replace(/\s+/g, '_');
            const clienteName = cliente.ragioneSociale.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
            const nomeFile = `Lettera_${typeName}_${clienteName}_${oggi.getFullYear()}${String(oggi.getMonth() + 1).padStart(2, '0')}${String(oggi.getDate()).padStart(2, '0')}.docx`;

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = nomeFile;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            UI.showSuccess('Documento Word scaricato!');

        } catch (error) {
            console.error('[LetterGenerator] Errore generazione docx:', error);
            UI.showError('Errore nella creazione del documento: ' + error.message);
        }
    },

    // ============================================================
    // MODAL — Gestione overlay modale
    // ============================================================
    _showModal(contentHtml) {
        const existing = document.getElementById('letterModal');
        if (existing) {
            existing.querySelector('#letterModalBody').innerHTML = contentHtml;
            return;
        }

        const modal = document.createElement('div');
        modal.id = 'letterModal';
        modal.innerHTML = `
            <div style="
                position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.5); z-index: 10000;
                display: flex; align-items: center; justify-content: center;
                padding: 1rem; backdrop-filter: blur(4px);
            " onclick="if(event.target===this) LetterGenerator._closeModal()">
                <div style="
                    background: var(--grigio-100, #F5F5F5);
                    border-radius: 20px;
                    width: min(95vw, 600px);
                    max-height: 90vh;
                    overflow-y: auto;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    animation: letterModalIn 0.25s ease-out;
                ">
                    <div style="
                        background: linear-gradient(135deg, #145284, #2E6DA8);
                        color: white; padding: 1.25rem 1.5rem;
                        border-radius: 20px 20px 0 0;
                        display: flex; justify-content: space-between; align-items: center;
                    ">
                        <h2 style="margin: 0; font-size: 1.15rem; font-weight: 900;">
                            <i class="fas fa-file-word" style="margin-right: 0.5rem;"></i>
                            Genera Lettera AI
                        </h2>
                        <button onclick="LetterGenerator._closeModal()" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; font-size: 1.1rem; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div id="letterModalBody" style="padding: 1.5rem;">
                        ${contentHtml}
                    </div>
                </div>
            </div>
            <style>
                @keyframes letterModalIn {
                    from { opacity: 0; transform: scale(0.95) translateY(10px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
            </style>
        `;

        document.body.appendChild(modal);
    },

    _closeModal() {
        const modal = document.getElementById('letterModal');
        if (modal) modal.remove();
    }
};

// Forms Manager - Gestione form di modifica e creazione
const FormsManager = {
    currentModal: null,

    // === STATE MACHINE APP ===
    STATE_TRANSITIONS: {
        'DEMO':         ['IN_SVILUPPO', 'DISATTIVATA'],
        'IN_SVILUPPO':  ['DEMO', 'ATTIVA', 'SOSPESA', 'DISATTIVATA'],
        'ATTIVA':       ['SOSPESA', 'DISATTIVATA'],
        'SOSPESA':      ['ATTIVA', 'DISATTIVATA'],
        'DISATTIVATA':  ['IN_SVILUPPO']
    },

    STATE_LABELS: {
        'DEMO': 'Demo',
        'IN_SVILUPPO': 'In Sviluppo',
        'ATTIVA': 'Attiva',
        'SOSPESA': 'Sospesa',
        'DISATTIVATA': 'Disattivata'
    },

    // Transizioni che richiedono sezioni checklist completate
    TRANSITIONS_REQUIRING_CHECKLIST: {
        'DEMO→IN_SVILUPPO': ['A'],
        'IN_SVILUPPO→ATTIVA': ['A','B','C','D','E','F','G'],
        'DISATTIVATA→IN_SVILUPPO': ['A']
    },

    // Verifica se una transizione di stato è valida
    isValidTransition(fromState, toState) {
        if (fromState === toState) return true; // Nessun cambio
        const allowed = this.STATE_TRANSITIONS[fromState];
        return allowed ? allowed.includes(toState) : false;
    },

    // Verifica se le sezioni richieste della checklist sono completate
    checkRequiredSections(app, fromState, toState) {
        const key = `${fromState}→${toState}`;
        const requiredSections = this.TRANSITIONS_REQUIRING_CHECKLIST[key];
        if (!requiredSections) return { ok: true }; // Nessun requisito

        // SOSPESA→ATTIVA è sempre libera
        if (fromState === 'SOSPESA' && toState === 'ATTIVA') return { ok: true };

        const cartaIdentita = app.cartaIdentita || {};
        const SECTIONS = typeof DettaglioApp !== 'undefined' && DettaglioApp.CHECKLIST_SECTIONS
            ? DettaglioApp.CHECKLIST_SECTIONS : [];

        const missingSections = [];
        for (const sectionPrefix of requiredSections) {
            const section = SECTIONS.find(s => s.prefix === sectionPrefix);
            if (!section) continue;
            const total = section.items.length;
            const completed = section.items.filter(item => cartaIdentita[item.id]?.checked).length;
            if (completed < total) {
                missingSections.push({
                    label: section.title,
                    completed,
                    total
                });
            }
        }

        if (missingSections.length > 0) {
            return { ok: false, missingSections };
        }
        return { ok: true };
    },

    // Genera le opzioni del select stato filtrate per transizioni valide
    getFilteredStateOptions(currentState) {
        const allowed = this.STATE_TRANSITIONS[currentState] || [];
        const options = [{ value: currentState, label: this.STATE_LABELS[currentState] || currentState }];
        for (const state of allowed) {
            options.push({ value: state, label: this.STATE_LABELS[state] || state });
        }
        return options;
    },

    // === MODAL COMPONENT ===
    showModal(title, content, onSave, onCancel = null) {
        // Rimuovi modal esistente se presente
        this.closeModal();

        const modal = document.createElement('div');
        modal.id = 'formModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            padding: 1rem;
        `;

        modal.innerHTML = `
            <div style="
                background: white;
                border-radius: 12px;
                max-width: 800px;
                width: 100%;
                max-height: 90vh;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            ">
                <div style="
                    padding: 1.5rem;
                    border-bottom: 1px solid var(--grigio-300);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                ">
                    <h2 style="
                        font-size: 1.5rem;
                        font-weight: 700;
                        color: var(--blu-700);
                        margin: 0;
                    ">${title}</h2>
                    <button
                        onclick="FormsManager.closeModal()"
                        style="
                            background: none;
                            border: none;
                            font-size: 1.5rem;
                            cursor: pointer;
                            color: var(--grigio-500);
                            padding: 0;
                            width: 32px;
                            height: 32px;
                        "
                    >
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div id="modalContent" style="
                    padding: 1.5rem;
                    overflow-y: auto;
                    flex: 1;
                ">
                    ${content}
                </div>
                <div style="
                    padding: 1.5rem;
                    border-top: 1px solid var(--grigio-300);
                    display: flex;
                    gap: 1rem;
                    justify-content: flex-end;
                ">
                    <button
                        onclick="FormsManager.closeModal()"
                        class="btn btn-secondary"
                    >
                        <i class="fas fa-times"></i> Annulla
                    </button>
                    <button
                        onclick="FormsManager.handleSave()"
                        class="btn btn-primary"
                        id="modalSaveBtn"
                    >
                        <i class="fas fa-save"></i> Salva
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.currentModal = {
            element: modal,
            onSave,
            onCancel
        };

        // Chiudi al click fuori dal modal
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal();
            }
        });
    },

    closeModal() {
        if (this.currentModal) {
            if (this.currentModal.onCancel) {
                this.currentModal.onCancel();
            }
            this.currentModal.element.remove();
            this.currentModal = null;
        }
    },

    async handleSave() {
        if (this.currentModal && this.currentModal.onSave) {
            const saveBtn = document.getElementById('modalSaveBtn');
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvataggio...';

            try {
                await this.currentModal.onSave();
                this.closeModal();
            } catch (error) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-save"></i> Salva';
                UI.showError('Errore durante il salvataggio: ' + error.message);
            }
        }
    },

    // Elimina fattura dal form di modifica (con doppia conferma)
    async _eliminaFatturaDaModifica(fatturaId, numeroFattura) {
        const conferma = confirm(
            `⚠️ ATTENZIONE!\n\n` +
            `Sei sicuro di voler eliminare DEFINITIVAMENTE la fattura "${numeroFattura}"?\n\n` +
            `Questa operazione NON può essere annullata!`
        );

        if (!conferma) return;

        try {
            this.closeModal();
            UI.showLoading();
            await DataService.deleteFattura(fatturaId);
            UI.hideLoading();
            UI.showSuccess(`Fattura "${numeroFattura}" eliminata con successo`);
            // Torna alla lista fatture
            UI.showPage('fatture');
        } catch (error) {
            console.error('Errore eliminazione fattura:', error);
            UI.hideLoading();
            UI.showError('Errore nell\'eliminazione: ' + error.message);
        }
    },

    // === FORM HELPERS ===
    createFormField(label, name, type = 'text', value = '', options = {}) {
        const required = options.required ? 'required' : '';
        const placeholder = options.placeholder || '';
        const disabled = options.disabled ? 'disabled' : '';

        if (type === 'select') {
            return `
                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="
                        display: block;
                        font-size: 0.875rem;
                        font-weight: 600;
                        color: var(--grigio-700);
                        margin-bottom: 0.5rem;
                    ">
                        ${label} ${required ? '<span style="color: #D32F2F;">*</span>' : ''}
                    </label>
                    <select
                        name="${name}"
                        id="${name}"
                        ${required}
                        ${disabled}
                        style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 1px solid var(--grigio-300);
                            border-radius: 8px;
                            font-size: 1rem;
                            font-family: 'Titillium Web', sans-serif;
                        "
                    >
                        ${options.options.map(opt =>
                            `<option value="${opt.value}" ${opt.value === value ? 'selected' : ''}>${opt.label}</option>`
                        ).join('')}
                    </select>
                </div>
            `;
        }

        if (type === 'textarea') {
            return `
                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="
                        display: block;
                        font-size: 0.875rem;
                        font-weight: 600;
                        color: var(--grigio-700);
                        margin-bottom: 0.5rem;
                    ">
                        ${label} ${required ? '<span style="color: #D32F2F;">*</span>' : ''}
                    </label>
                    <textarea
                        name="${name}"
                        id="${name}"
                        ${required}
                        ${disabled}
                        rows="4"
                        placeholder="${placeholder}"
                        style="
                            width: 100%;
                            padding: 0.75rem;
                            border: 1px solid var(--grigio-300);
                            border-radius: 8px;
                            font-size: 1rem;
                            font-family: 'Titillium Web', sans-serif;
                            resize: vertical;
                        "
                    >${value || ''}</textarea>
                </div>
            `;
        }

        return `
            <div class="form-group" style="margin-bottom: 1rem;">
                <label style="
                    display: block;
                    font-size: 0.875rem;
                    font-weight: 600;
                    color: var(--grigio-700);
                    margin-bottom: 0.5rem;
                ">
                    ${label} ${required ? '<span style="color: #D32F2F;">*</span>' : ''}
                </label>
                <input
                    type="${type}"
                    name="${name}"
                    id="${name}"
                    value="${value || ''}"
                    ${required}
                    ${disabled}
                    placeholder="${placeholder}"
                    style="
                        width: 100%;
                        padding: 0.75rem;
                        border: 1px solid var(--grigio-300);
                        border-radius: 8px;
                        font-size: 1rem;
                        font-family: 'Titillium Web', sans-serif;
                    "
                />
            </div>
        `;
    },

    getFormData(formId = 'modalContent') {
        const container = document.getElementById(formId);
        const inputs = container.querySelectorAll('input, select, textarea');
        const data = {};

        inputs.forEach(input => {
            // Salta campi senza name o disabilitati
            if (!input.name || input.disabled) return;

            if (input.type === 'checkbox') {
                // Per i checkbox, usa input.checked (NON input.value che è sempre 'true')
                data[input.name] = input.checked ? 'true' : 'false';
            } else if (input.type === 'number') {
                data[input.name] = input.value ? parseFloat(input.value) : null;
            } else if (input.type === 'date') {
                data[input.name] = input.value ? new Date(input.value).toISOString() : null;
            } else {
                data[input.name] = input.value || null;
            }
        });

        return data;
    },

    // === FORM MODIFICA CLIENTE ===
    async showModificaCliente(cliente) {
        // Carica lista agenti per il selettore
        const agenti = await DataService.getAgenti();
        const opzioniAgente = [
            { value: '', label: '— Nessun agente —' },
            ...agenti.map(a => ({ value: a.nomeCompleto, label: `${a.nomeCompleto} (${a.email})` }))
        ];
        // Se il cliente ha un agente non in lista (vecchio dato testo libero), aggiungilo
        if (cliente.agente && !agenti.find(a => a.nomeCompleto === cliente.agente)) {
            opzioniAgente.push({ value: cliente.agente, label: `${cliente.agente} (non in lista utenti)` });
        }

        const content = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 1rem;">
                ${this.createFormField('Ragione Sociale', 'ragioneSociale', 'text', cliente.ragioneSociale, { required: true })}
                ${this.createFormField('Partita IVA', 'partitaIva', 'text', cliente.partitaIva)}
                ${this.createFormField('Codice Fiscale', 'codiceFiscale', 'text', cliente.codiceFiscale)}
                ${this.createFormField('Indirizzo', 'indirizzo', 'text', cliente.indirizzo)}
                ${this.createFormField('CAP', 'cap', 'text', cliente.cap)}
                ${this.createFormField('Comune', 'comune', 'text', cliente.comune)}
                ${this.createFormField('Provincia', 'provincia', 'text', cliente.provincia)}
                ${this.createFormField('Regione', 'regione', 'text', cliente.regione)}
                ${this.createFormField('Telefono', 'telefono', 'tel', cliente.telefono)}
                ${this.createFormField('Email 1', 'email', 'email', cliente.email)}
                ${this.createFormField('Email 2', 'email2', 'email', cliente.email2, { placeholder: 'Email secondaria' })}
                ${this.createFormField('PEC', 'pec', 'email', cliente.pec)}
                ${this.createFormField('Codice SDI', 'codiceSdi', 'text', cliente.codiceSdi)}
                ${this.createFormField('N. Residenti', 'numResidenti', 'number', cliente.numResidenti, { placeholder: 'Numero abitanti' })}
                ${this.createFormField('Agente', 'agente', 'select', cliente.agente, { options: opzioniAgente })}
                ${this.createFormField('Tipo', 'tipo', 'select', cliente.tipo, {
                    options: [
                        { value: 'PA', label: 'Pubblica Amministrazione' },
                        { value: 'PRIVATO', label: 'Privato' },
                        { value: 'ALTRO', label: 'Altro' }
                    ]
                })}
            </div>
            ${this.createFormField('Note', 'note', 'textarea', cliente.note)}
        `;

        this.showModal(
            `<i class="fas fa-edit"></i> Modifica Cliente`,
            content,
            async () => {
                const data = this.getFormData();
                await DataService.updateCliente(cliente.id, data);
                UI.showSuccess('Cliente aggiornato con successo!');
                // Ricarica la pagina dettaglio
                DettaglioCliente.render(cliente.id);
            }
        );
    },

    // === FORM NUOVO CLIENTE ===
    async showNuovoCliente() {
        // Carica lista agenti per il selettore
        const agenti = await DataService.getAgenti();
        const opzioniAgente = [
            { value: '', label: '— Nessun agente —' },
            ...agenti.map(a => ({ value: a.nomeCompleto, label: `${a.nomeCompleto} (${a.email})` }))
        ];

        const content = `
            <!-- 🏛️ Autocomplete Comune -->
            <div style="margin-bottom: 1.5rem; padding: 1rem; background: var(--verde-100); border-radius: 8px; border: 2px solid var(--verde-300);">
                <label style="display: block; font-weight: 700; color: var(--verde-900); margin-bottom: 0.5rem;">
                    <i class="fas fa-magic"></i> Compila automaticamente da database Comuni
                </label>
                <div style="position: relative;">
                    <input
                        type="text"
                        id="autocompleteComune"
                        placeholder="Digita il nome del comune per compilare automaticamente..."
                        oninput="FormsManager.autocompleteComune(this.value)"
                        style="width: 100%; padding: 0.75rem 1rem; border: 2px solid var(--verde-700); border-radius: 6px; font-family: inherit; font-size: 1rem;"
                    >
                    <div id="autocompleteResults" style="
                        display: none;
                        position: absolute;
                        top: 100%;
                        left: 0;
                        right: 0;
                        background: white;
                        border: 2px solid var(--verde-700);
                        border-top: none;
                        border-radius: 0 0 6px 6px;
                        max-height: 200px;
                        overflow-y: auto;
                        z-index: 1000;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    "></div>
                </div>
                <small style="color: var(--verde-900); margin-top: 0.25rem; display: block;">
                    Digita almeno 2 lettere. Seleziona un comune per auto-compilare tutti i campi.
                </small>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 1rem;">
                ${this.createFormField('Ragione Sociale', 'ragioneSociale', 'text', '', { required: true, placeholder: 'Nome azienda o ente' })}
                ${this.createFormField('Partita IVA', 'partitaIva', 'text', '', { placeholder: '12345678901' })}
                ${this.createFormField('Codice Fiscale', 'codiceFiscale', 'text', '')}
                ${this.createFormField('Indirizzo', 'indirizzo', 'text', '')}
                ${this.createFormField('CAP', 'cap', 'text', '')}
                ${this.createFormField('Comune', 'comune', 'text', '')}
                ${this.createFormField('Provincia', 'provincia', 'text', '', { placeholder: 'UD' })}
                ${this.createFormField('Regione', 'regione', 'text', '')}
                ${this.createFormField('Telefono', 'telefono', 'tel', '')}
                ${this.createFormField('Email 1', 'email', 'email', '', { placeholder: 'Email principale' })}
                ${this.createFormField('Email 2', 'email2', 'email', '', { placeholder: 'Email secondaria (da database comuni)' })}
                ${this.createFormField('PEC', 'pec', 'email', '')}
                ${this.createFormField('Codice SDI', 'codiceSdi', 'text', '', { placeholder: 'Codice 7 caratteri' })}
                ${this.createFormField('N. Residenti', 'numResidenti', 'number', '', { placeholder: 'Numero abitanti' })}
                ${this.createFormField('Agente', 'agente', 'select', '', { options: opzioniAgente })}
                ${this.createFormField('Tipo', 'tipo', 'select', 'PRIVATO', {
                    options: [
                        { value: 'PRIVATO', label: 'Privato' },
                        { value: 'PA', label: 'Pubblica Amministrazione' },
                        { value: 'ALTRO', label: 'Altro' }
                    ]
                })}
            </div>
            ${this.createFormField('Note', 'note', 'textarea', '', { placeholder: 'Note aggiuntive...' })}
        `;

        this.showModal(
            `<i class="fas fa-plus"></i> Nuovo Cliente`,
            content,
            async () => {
                const data = this.getFormData();
                const newId = await DataService.createCliente(data);
                UI.showSuccess('Cliente creato con successo!');
                DettaglioCliente.render(newId);
            }
        );
    },

    // 🏛️ AUTOCOMPLETE COMUNE
    async autocompleteComune(query) {
        const resultsDiv = document.getElementById('autocompleteResults');
        if (!resultsDiv) return;

        if (!query || query.length < 2) {
            resultsDiv.style.display = 'none';
            return;
        }

        const risultati = await ComuniService.cerca(query);

        if (risultati.length === 0) {
            resultsDiv.innerHTML = '<div style="padding: 0.75rem 1rem; color: var(--grigio-500);">Nessun comune trovato</div>';
            resultsDiv.style.display = 'block';
            return;
        }

        resultsDiv.innerHTML = risultati.map(comune => `
            <div onclick="FormsManager.selezionaComune('${comune.nome.replace(/'/g, "\\'")}')"
                 style="padding: 0.75rem 1rem; cursor: pointer; border-bottom: 1px solid var(--grigio-200); transition: background 0.2s;"
                 onmouseover="this.style.background='var(--verde-100)'"
                 onmouseout="this.style.background='white'">
                <strong style="color: var(--grigio-900);">${comune.nome}</strong>
                <span style="color: var(--grigio-600); font-size: 0.875rem;"> - ${comune.provincia}, ${comune.regione}</span>
                <span style="color: var(--verde-700); font-size: 0.8125rem; float: right;">${comune.numResidenti.toLocaleString('it-IT')} ab.</span>
            </div>
        `).join('');

        resultsDiv.style.display = 'block';
    },

    async selezionaComune(nomeComune) {
        const comune = await ComuniService.trovaPeNome(nomeComune);
        if (!comune) return;

        // Compila tutti i campi del form
        const campi = {
            ragioneSociale: comune.nome,
            codiceFiscale: comune.codiceFiscale,
            indirizzo: comune.indirizzo,
            cap: comune.cap,
            comune: comune.nome,
            provincia: comune.provincia,
            regione: comune.regione,
            telefono: comune.telefono,
            email2: comune.email,
            pec: comune.pec,
            codiceSdi: comune.codiceSdi,
            numResidenti: comune.numResidenti,
            tipo: 'PA'
        };

        for (const [campo, valore] of Object.entries(campi)) {
            const input = document.getElementById(campo);
            if (input && valore) {
                input.value = valore;
                // Trigger change per i select
                if (input.tagName === 'SELECT') {
                    input.dispatchEvent(new Event('change'));
                }
            }
        }

        // Chiudi autocomplete
        document.getElementById('autocompleteResults').style.display = 'none';
        document.getElementById('autocompleteComune').value = comune.nome;

        UI.showSuccess(`✅ Dati di "${comune.nome}" compilati automaticamente!`);
    },

    // === FORM MODIFICA FATTURA ===
    async showModificaFattura(fattura) {
        // Carica tutti i clienti per il select
        const clientiSnapshot = await db.collection('clienti').get();
        const clienti = clientiSnapshot.docs.map(doc => ({
            id: doc.id,
            ragioneSociale: doc.data().ragioneSociale,
            tipo: doc.data().tipo || 'PRIVATO'
        })).sort((a, b) => a.ragioneSociale.localeCompare(b.ragioneSociale));

        // Trova il tipo del cliente corrente
        const clienteCorrente = clienti.find(c => c.id === fattura.clienteId);
        const tipoClienteCorrente = fattura.tipoCliente || clienteCorrente?.tipo || 'PRIVATO';

        // Carica contratti del cliente corrente
        const contrattiSnapshot = fattura.clienteId
            ? await db.collection('contratti').where('clienteId', '==', fattura.clienteId).get()
            : { docs: [] };
        const contratti = contrattiSnapshot.docs.map(doc => ({
            id: doc.id,
            numero: doc.data().numeroContratto || 'Senza numero'
        }));

        // Calcola acconto totale se presenti acconti precedenti
        const accontiEsistenti = fattura.acconti || [];
        const totaleAcconti = accontiEsistenti.reduce((sum, a) => sum + (a.importo || 0), 0);

        const content = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 1rem;">
                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display: block; font-size: 0.875rem; font-weight: 600; color: var(--grigio-700); margin-bottom: 0.5rem;">
                        Cliente <span style="color: #D32F2F;">*</span>
                    </label>
                    <select name="clienteId" id="clienteId" required
                        style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 8px; font-size: 1rem; font-family: 'Titillium Web', sans-serif;"
                        onchange="FormsManager.onClienteSelected()">
                        <option value="">-- Seleziona cliente --</option>
                        ${clienti.map(c => `<option value="${c.id}" data-ragione-sociale="${c.ragioneSociale}" data-tipo="${c.tipo}" ${c.id === fattura.clienteId ? 'selected' : ''}>${c.ragioneSociale} ${c.tipo === 'PA' ? '🏛️' : ''}</option>`).join('')}
                    </select>
                    <input type="hidden" name="clienteRagioneSociale" id="clienteRagioneSociale" value="${clienteCorrente?.ragioneSociale || fattura.clienteRagioneSociale || ''}" />
                    <input type="hidden" id="tipoClienteSelezionato" value="${tipoClienteCorrente}" />
                    <div id="badgeTipoCliente" style="margin-top: 0.5rem;">
                        <span class="badge ${tipoClienteCorrente === 'PA' ? 'badge-info' : 'badge-secondary'}" style="font-size: 0.9rem; padding: 0.4rem 0.75rem;">
                            ${tipoClienteCorrente === 'PA' ? '<i class="fas fa-landmark"></i> Pubblica Amministrazione (PA)' : '<i class="fas fa-building"></i> Privato (PR)'}
                        </span>
                    </div>
                </div>
                ${contratti.length > 0 ? this.createFormField('Contratto', 'contrattoId', 'select', fattura.contrattoId, {
                    options: [
                        { value: '', label: '-- Nessun contratto --' },
                        ...contratti.map(c => ({ value: c.id, label: c.numero }))
                    ]
                }) : ''}
                ${this.createFormField('Numero Fattura Completo', 'numeroFatturaCompleto', 'text', fattura.numeroFatturaCompleto, { required: true, placeholder: 'Es: 2026/001/PA' })}
                ${this.createFormField('Anno', 'anno', 'number', fattura.anno, { required: true })}
                ${this.createFormField('Data Emissione', 'dataEmissione', 'date', fattura.dataEmissione?.split('T')[0], { required: true })}
                ${this.createFormField('Data Scadenza', 'dataScadenza', 'date', fattura.dataScadenza?.split('T')[0])}
                ${this.createFormField('Data Pagamento', 'dataSaldo', 'date', fattura.dataSaldo?.split('T')[0])}
                ${this.createFormField('Imponibile', 'imponibile', 'number', fattura.imponibile, { required: true })}
                ${this.createFormField('Aliquota IVA (%)', 'aliquotaIva', 'number', fattura.aliquotaIva)}
                ${this.createFormField('Importo IVA', 'importoIva', 'number', fattura.importoIva)}
                ${this.createFormField('Totale Fattura', 'importoTotale', 'number', fattura.importoTotale, { required: true })}
                ${this.createFormField('Metodo Pagamento', 'metodoPagamento', 'select', fattura.metodoPagamento || 'BONIFICO', {
                    options: [
                        { value: 'BONIFICO', label: 'Bonifico Bancario' },
                        { value: 'CARTA', label: 'Carta di Credito/Debito' },
                        { value: 'CONTANTI', label: 'Contanti' },
                        { value: 'ASSEGNO', label: 'Assegno' },
                        { value: 'RIBA', label: 'RiBa' },
                        { value: 'ALTRO', label: 'Altro' }
                    ]
                })}
                ${this.createFormField('Tipo Documento', 'tipoDocumento', 'select', fattura.tipoDocumento || 'FATTURA', {
                    options: [
                        { value: 'FATTURA', label: 'Fattura' },
                        { value: 'NOTA_DI_CREDITO', label: 'Nota di Credito' }
                    ]
                })}
                ${this.createFormField('Stato Pagamento', 'statoPagamento', 'select', fattura.statoPagamento, {
                    options: [
                        { value: 'NON_PAGATA', label: 'Non Pagata' },
                        { value: 'PAGATA', label: 'Pagata' },
                        { value: 'PARZIALMENTE_PAGATA', label: 'Parzialmente Pagata (Acconto)' },
                        { value: 'NOTA_CREDITO', label: 'Nota di Credito' },
                        { value: 'RIFIUTATA', label: 'Rifiutata' }
                    ]
                })}
                ${this.createFormField('Tipo', 'tipo', 'text', fattura.tipo)}
                ${this.createFormField('Periodicità', 'periodicita', 'text', fattura.periodicita)}
            </div>

            <!-- Credito Sospeso -->
            <div style="margin-top: 1rem; padding: 1rem; background: ${fattura.creditoSospeso ? '#FFF3E0' : 'var(--grigio-100)'}; border-left: 4px solid ${fattura.creditoSospeso ? '#FF9800' : 'var(--grigio-300)'}; border-radius: 8px;">
                <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; margin: 0;">
                    <input type="checkbox" name="creditoSospeso" value="true" ${fattura.creditoSospeso ? 'checked' : ''} style="width: 20px; height: 20px; accent-color: #FF9800; cursor: pointer;" />
                    <div>
                        <div style="font-weight: 700; color: var(--grigio-900); font-size: 0.95rem;">
                            <i class="fas fa-pause-circle" style="color: #FF9800;"></i> Credito Sospeso
                        </div>
                        <div style="font-size: 0.8rem; color: var(--grigio-500); margin-top: 2px;">
                            Fattura in contenzioso o comune in dissesto — esclusa dai solleciti ordinari
                        </div>
                    </div>
                </label>
            </div>

            <!-- Sezione Acconti -->
            <div id="sezioneAccontoModifica" style="display: ${fattura.statoPagamento === 'PARZIALMENTE_PAGATA' ? 'block' : 'none'}; margin-top: 1rem; padding: 1rem; background: var(--verde-100); border-left: 4px solid var(--verde-700); border-radius: 8px;">
                <h3 style="font-size: 1rem; font-weight: 700; color: var(--verde-900); margin-bottom: 0.75rem;">
                    <i class="fas fa-hand-holding-usd"></i> Gestione Acconti
                </h3>

                <!-- Acconti esistenti -->
                ${accontiEsistenti.length > 0 ? `
                    <div style="margin-bottom: 1rem;">
                        <h4 style="font-size: 0.875rem; font-weight: 600; color: var(--verde-900); margin-bottom: 0.5rem;">Acconti ricevuti:</h4>
                        ${accontiEsistenti.map((a, i) => `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.75rem; background: white; border-radius: 6px; margin-bottom: 0.25rem;">
                                <span style="font-size: 0.875rem; color: var(--grigio-700);">
                                    <i class="fas fa-check-circle" style="color: var(--verde-700);"></i>
                                    ${DataService.formatDate(a.data)} — ${a.note || 'Acconto'}
                                </span>
                                <strong style="color: var(--verde-900);">${DataService.formatCurrency(a.importo)}</strong>
                            </div>
                        `).join('')}
                        <div style="display: flex; justify-content: space-between; padding: 0.5rem 0.75rem; margin-top: 0.5rem; border-top: 2px solid var(--verde-700);">
                            <strong style="color: var(--verde-900);">Totale acconti:</strong>
                            <strong style="color: var(--verde-900);">${DataService.formatCurrency(totaleAcconti)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 0.5rem 0.75rem;">
                            <strong style="color: #D32F2F;">Saldo residuo:</strong>
                            <strong style="color: #D32F2F;">${DataService.formatCurrency((fattura.importoTotale || 0) - totaleAcconti)}</strong>
                        </div>
                    </div>
                ` : ''}

                <!-- Nuovo acconto -->
                <h4 style="font-size: 0.875rem; font-weight: 600; color: var(--verde-900); margin-bottom: 0.5rem;">Registra nuovo acconto:</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 1rem;">
                    ${this.createFormField('Importo Nuovo Acconto', 'nuovoAccontoImporto', 'number', '', { placeholder: '0.00' })}
                    ${this.createFormField('Data Acconto', 'nuovoAccontoData', 'date', new Date().toISOString().split('T')[0])}
                    ${this.createFormField('Nota Acconto', 'nuovoAccontoNote', 'text', '', { placeholder: 'Es: Acconto ricevuto' })}
                </div>
            </div>

            ${this.createFormField('Note', 'note', 'textarea', fattura.note)}
            ${this.createFormField('Note Consolidate', 'noteConsolidate', 'textarea', fattura.noteConsolidate)}

            <!-- Sezione Elimina Fattura -->
            <div style="margin-top: 1.5rem; padding: 1rem; background: #FFF3F3; border-left: 4px solid var(--rosso-errore); border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
                    <div>
                        <div style="font-weight: 700; color: var(--rosso-errore); font-size: 0.95rem;">
                            <i class="fas fa-exclamation-triangle"></i> Zona Pericolosa
                        </div>
                        <div style="font-size: 0.8rem; color: var(--grigio-600); margin-top: 0.25rem;">
                            L'eliminazione è definitiva e non può essere annullata.
                        </div>
                    </div>
                    <button type="button" onclick="FormsManager._eliminaFatturaDaModifica('${fattura.id}', '${(fattura.numeroFatturaCompleto || fattura.numeroFattura || 'N/A').replace(/'/g, "\\'")}')"
                        style="background: var(--rosso-errore); color: white; border: none; padding: 0.6rem 1.25rem; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 0.875rem; font-family: 'Titillium Web', sans-serif; display: flex; align-items: center; gap: 0.5rem; transition: background 0.2s;"
                        onmouseover="this.style.background='#B71C1C'" onmouseout="this.style.background='var(--rosso-errore)'">
                        <i class="fas fa-trash-alt"></i> Elimina Fattura
                    </button>
                </div>
            </div>
        `;

        this.showModal(
            `<i class="fas fa-edit"></i> Modifica Fattura`,
            content,
            async () => {
                const data = this.getFormData();

                // Salva il tipo cliente (PA/PR) nella fattura
                const tipoClienteEl = document.getElementById('tipoClienteSelezionato');
                if (tipoClienteEl) {
                    data.tipoCliente = tipoClienteEl.value === 'PA' ? 'PA' : 'PR';
                }

                // Gestione nuovo acconto
                if (data.nuovoAccontoImporto && data.nuovoAccontoImporto > 0) {
                    const nuovoAcconto = {
                        importo: data.nuovoAccontoImporto,
                        data: data.nuovoAccontoData || new Date().toISOString(),
                        note: data.nuovoAccontoNote || 'Acconto'
                    };

                    // Aggiungi ai precedenti
                    data.acconti = [...accontiEsistenti, nuovoAcconto];
                    const nuovoTotaleAcconti = data.acconti.reduce((sum, a) => sum + (a.importo || 0), 0);
                    data.saldoResiduo = parseFloat((data.importoTotale - nuovoTotaleAcconti).toFixed(2));

                    // Se il saldo è 0 o negativo, marca come PAGATA
                    if (data.saldoResiduo <= 0) {
                        data.statoPagamento = 'PAGATA';
                        data.saldoResiduo = 0;
                        data.dataSaldo = data.dataSaldo || new Date().toISOString();
                    }
                } else if (fattura.acconti) {
                    // Mantieni gli acconti esistenti
                    data.acconti = accontiEsistenti;
                }

                // Rimuovi campi temporanei nuovo acconto
                delete data.nuovoAccontoImporto;
                delete data.nuovoAccontoData;
                delete data.nuovoAccontoNote;

                // Converti creditoSospeso in boolean (getFormData lo salva come stringa)
                data.creditoSospeso = (data.creditoSospeso === 'true' || data.creditoSospeso === true);

                await DataService.updateFattura(fattura.id, data);
                UI.showSuccess('Fattura aggiornata con successo!');
                DettaglioFattura.render(fattura.id);
            }
        );

        // Listener per mostrare/nascondere sezione acconto
        setTimeout(() => {
            const statoSelect = document.getElementById('statoPagamento');
            const sezioneAcconto = document.getElementById('sezioneAccontoModifica');
            if (statoSelect && sezioneAcconto) {
                statoSelect.addEventListener('change', () => {
                    sezioneAcconto.style.display = statoSelect.value === 'PARZIALMENTE_PAGATA' ? 'block' : 'none';
                });
            }

            // Calcolo automatico IVA e totale
            const imponibileInput = document.getElementById('imponibile');
            const aliquotaInput = document.getElementById('aliquotaIva');
            const ivaInput = document.getElementById('importoIva');
            const totaleInput = document.getElementById('importoTotale');

            const calcolaImporti = () => {
                const imponibile = parseFloat(imponibileInput?.value) || 0;
                const aliquota = parseFloat(aliquotaInput?.value) || 0;
                if (imponibile > 0) {
                    const iva = parseFloat((imponibile * aliquota / 100).toFixed(2));
                    const totale = parseFloat((imponibile + iva).toFixed(2));
                    if (ivaInput) ivaInput.value = iva;
                    if (totaleInput) totaleInput.value = totale;
                }
            };

            if (imponibileInput) imponibileInput.addEventListener('input', calcolaImporti);
            if (aliquotaInput) aliquotaInput.addEventListener('input', calcolaImporti);
        }, 100);
    },

    // === FORM NUOVA FATTURA ===
    async showNuovaFattura(clienteId = null, contrattoId = null) {
        // Carica lista clienti per il selettore
        const clienti = await DataService.getClienti();

        // Calcola prossimo numero progressivo automatico
        let prossimoProgressivo = '';
        try {
            const annoCorrente = new Date().getFullYear();
            const tuttefatture = await DataService.getFatture();
            const fattureAnno = tuttefatture.filter(f => f.anno === annoCorrente || f.anno === String(annoCorrente));
            // Trova il numero progressivo più alto dell'anno
            let maxNum = 0;
            fattureAnno.forEach(f => {
                const nfc = f.numeroFatturaCompleto || f.numeroFattura || '';
                // Estrai il numero dal formato ANNO/NUM/TIPO o similare
                const match = nfc.match(/\/(\d+)\//);
                if (match) {
                    const num = parseInt(match[1]);
                    if (num > maxNum) maxNum = num;
                } else {
                    // Prova con formato semplice numerico
                    const numMatch = nfc.match(/(\d+)/);
                    if (numMatch) {
                        const num = parseInt(numMatch[1]);
                        if (num > maxNum) maxNum = num;
                    }
                }
            });
            const _sysP = SettingsService.getSystemSettingsSync();
            const _padP = _sysP.paddingNumeroFattura || 3;
            prossimoProgressivo = String(maxNum + 1).padStart(_padP, '0');
        } catch (e) {
            console.warn('Errore calcolo prossimo progressivo:', e);
        }

        let clienteSelectHtml = '';
        if (!clienteId) {
            // Crea campo di ricerca cliente
            clienteSelectHtml = `
                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display: block; font-size: 0.875rem; font-weight: 600; color: var(--grigio-700); margin-bottom: 0.5rem;">
                        Cliente <span style="color: #D32F2F;">*</span>
                    </label>
                    <input
                        type="text"
                        id="clienteSearch"
                        placeholder="🔍 Cerca cliente per nome..."
                        style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 8px; font-size: 1rem; font-family: 'Titillium Web', sans-serif; margin-bottom: 0.5rem;"
                        onkeyup="FormsManager.filterClienti()"
                    />
                    <select
                        name="clienteId"
                        id="clienteId"
                        required
                        style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 8px; font-size: 1rem; font-family: 'Titillium Web', sans-serif;"
                        onchange="FormsManager.onClienteSelected()"
                    >
                        <option value="">-- Seleziona un cliente --</option>
                        ${clienti.map(c =>
                            `<option value="${c.id}" data-ragione-sociale="${c.ragioneSociale}" data-tipo="${c.tipo || 'PRIVATO'}">${c.ragioneSociale} (${c.provincia || 'N/A'}) ${c.tipo === 'PA' ? '🏛️' : ''}</option>`
                        ).join('')}
                    </select>
                    <input type="hidden" name="clienteRagioneSociale" id="clienteRagioneSociale" />
                </div>
            `;
        } else {
            // Cliente già selezionato (es. da pagina cliente)
            const cliente = clienti.find(c => c.id === clienteId);
            const tipoClientePreselezionato = cliente?.tipo || 'PRIVATO';
            clienteSelectHtml = `
                ${this.createFormField('Cliente', 'clienteRagioneSociale_display', 'text', cliente?.ragioneSociale || '', { disabled: true })}
                <input type="hidden" name="clienteId" value="${clienteId}" />
                <input type="hidden" name="clienteRagioneSociale" value="${cliente?.ragioneSociale || ''}" />
                <input type="hidden" id="tipoClienteSelezionato" value="${tipoClientePreselezionato}" />
                <div style="margin-bottom: 1rem;">
                    <span class="badge ${tipoClientePreselezionato === 'PA' ? 'badge-info' : 'badge-secondary'}" style="font-size: 0.9rem; padding: 0.4rem 0.75rem;">
                        ${tipoClientePreselezionato === 'PA' ? '<i class="fas fa-landmark"></i> Pubblica Amministrazione' : '<i class="fas fa-building"></i> Privato'}
                    </span>
                </div>
            `;
        }

        const content = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 1rem;">
                ${clienteSelectHtml}
                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display: block; font-size: 0.875rem; font-weight: 600; color: var(--grigio-700); margin-bottom: 0.5rem;">
                        Numero Progressivo <span style="color: #D32F2F;">*</span>
                    </label>
                    <input type="text" name="numeroProgressivo" id="numeroProgressivo" required
                        placeholder="Es: 001, 002..."
                        value="${prossimoProgressivo}"
                        oninput="FormsManager.aggiornaNumeroFattura()"
                        style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 8px; font-size: 1rem; font-family: 'Titillium Web', sans-serif;"
                    />
                    <input type="hidden" name="numeroFatturaCompleto" id="numeroFatturaCompleto" />
                    <div id="anteprimaNumeroFattura" style="margin-top: 0.5rem; padding: 0.5rem 0.75rem; background: var(--blu-100); border-radius: 6px; font-weight: 700; color: var(--blu-700); font-size: 1.1rem; display: none;">
                        <i class="fas fa-file-invoice"></i> Numero fattura: <span id="anteprimaNumero"></span>
                    </div>
                </div>
                ${this.createFormField('Anno', 'anno', 'number', new Date().getFullYear(), { required: true })}
                ${this.createFormField('Data Emissione', 'dataEmissione', 'date', new Date().toISOString().split('T')[0], { required: true })}
                ${this.createFormField('Data Scadenza', 'dataScadenza', 'date', '')}
                ${this.createFormField('Imponibile', 'imponibile', 'number', '', { required: true, placeholder: '0.00' })}
                ${this.createFormField('Aliquota IVA (%)', 'aliquotaIva', 'number', String(SettingsService.getSystemSettingsSync().ivaDefault), { placeholder: String(SettingsService.getSystemSettingsSync().ivaDefault) })}
                ${this.createFormField('Importo IVA', 'importoIva', 'number', '', { placeholder: 'Calcolato auto' })}
                ${this.createFormField('Totale Fattura', 'importoTotale', 'number', '', { required: true, placeholder: 'Calcolato auto' })}
                ${this.createFormField('Metodo Pagamento', 'metodoPagamento', 'select', SettingsService.getSystemSettingsSync().metodoPagamentoDefault, {
                    options: [
                        { value: 'BONIFICO', label: 'Bonifico Bancario' },
                        { value: 'CARTA', label: 'Carta di Credito/Debito' },
                        { value: 'CONTANTI', label: 'Contanti' },
                        { value: 'ASSEGNO', label: 'Assegno' },
                        { value: 'RIBA', label: 'RiBa' },
                        { value: 'ALTRO', label: 'Altro' }
                    ]
                })}
                ${this.createFormField('Tipo Documento', 'tipoDocumento', 'select', 'FATTURA', {
                    options: [
                        { value: 'FATTURA', label: 'Fattura' },
                        { value: 'NOTA_DI_CREDITO', label: 'Nota di Credito' }
                    ]
                })}
                ${this.createFormField('Stato Pagamento', 'statoPagamento', 'select', 'NON_PAGATA', {
                    options: [
                        { value: 'NON_PAGATA', label: 'Non Pagata' },
                        { value: 'PAGATA', label: 'Pagata' },
                        { value: 'PARZIALMENTE_PAGATA', label: 'Parzialmente Pagata (Acconto)' }
                    ]
                })}
                ${this.createFormField('Tipo', 'tipo', 'text', 'VENDITA')}
                ${this.createFormField('Periodicità', 'periodicita', 'text', '')}
                <div class="form-group" id="contrattoSelectContainer" style="display:none;">
                    <label style="display: block; font-size: 0.875rem; font-weight: 600; color: var(--grigio-700); margin-bottom: 0.5rem;">
                        Contratto collegato
                    </label>
                    <select name="contrattoId" id="contrattoIdFattura" class="form-input"
                        style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 8px; font-size: 1rem; font-family: 'Titillium Web', sans-serif;">
                        <option value="">-- Nessun contratto --</option>
                    </select>
                    <small style="color: var(--grigio-500);">Collega la fattura a un contratto del cliente</small>
                </div>
                </div>

            <!-- Credito Sospeso -->
            <div style="margin-top: 1rem; padding: 1rem; background: var(--grigio-100); border-left: 4px solid var(--grigio-300); border-radius: 8px;">
                <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; margin: 0;">
                    <input type="checkbox" name="creditoSospeso" value="true" style="width: 20px; height: 20px; accent-color: #FF9800; cursor: pointer;" />
                    <div>
                        <div style="font-weight: 700; color: var(--grigio-900); font-size: 0.95rem;">
                            <i class="fas fa-pause-circle" style="color: #FF9800;"></i> Credito Sospeso
                        </div>
                        <div style="font-size: 0.8rem; color: var(--grigio-500); margin-top: 2px;">
                            Fattura in contenzioso o comune in dissesto — esclusa dai solleciti ordinari
                        </div>
                    </div>
                </label>
            </div>

            <!-- Sezione Acconto (visibile solo se stato = PARZIALMENTE_PAGATA) -->
            <div id="sezioneAcconto" style="display: none; margin-top: 1rem; padding: 1rem; background: var(--verde-100); border-left: 4px solid var(--verde-700); border-radius: 8px;">
                <h3 style="font-size: 1rem; font-weight: 700; color: var(--verde-900); margin-bottom: 0.75rem;">
                    <i class="fas fa-hand-holding-usd"></i> Dettagli Acconto
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(250px, 100%), 1fr)); gap: 1rem;">
                    ${this.createFormField('Importo Acconto', 'importoAcconto', 'number', '', { placeholder: '0.00' })}
                    ${this.createFormField('Data Acconto', 'dataAcconto', 'date', new Date().toISOString().split('T')[0])}
                </div>
            </div>

            ${this.createFormField('Note', 'note', 'textarea', '', { placeholder: 'Note aggiuntive...' })}
        `;

        this.showModal(
            `<i class="fas fa-plus"></i> Nuova Fattura`,
            content,
            async () => {
                const data = this.getFormData();

                // Rimuovi campi temporanei
                delete data[''];
                delete data['clienteRagioneSociale_display'];
                delete data['numeroProgressivo'];

                // Salva anche il tipo cliente (PA/PR) nella fattura
                const tipoClienteEl = document.getElementById('tipoClienteSelezionato');
                if (tipoClienteEl) {
                    data.tipoCliente = tipoClienteEl.value === 'PA' ? 'PA' : 'PR';
                }

                // Calcola automaticamente IVA e totale se mancanti
                if (data.imponibile && !data.importoIva && data.aliquotaIva) {
                    data.importoIva = parseFloat((data.imponibile * data.aliquotaIva / 100).toFixed(2));
                }
                if (data.imponibile && !data.importoTotale) {
                    data.importoTotale = parseFloat((data.imponibile + (data.importoIva || 0)).toFixed(2));
                }

                // Gestione acconto con validazione
                if (data.statoPagamento === 'PARZIALMENTE_PAGATA' && data.importoAcconto) {
                    if (data.importoAcconto <= 0) {
                        throw new Error('L\'importo dell\'acconto deve essere maggiore di zero');
                    }
                    if (data.importoAcconto >= data.importoTotale) {
                        throw new Error('L\'acconto non può essere uguale o superiore al totale fattura. Usa lo stato PAGATA se il pagamento è completo.');
                    }
                    data.saldoResiduo = parseFloat((data.importoTotale - data.importoAcconto).toFixed(2));
                    data.acconti = [{
                        importo: data.importoAcconto,
                        data: data.dataAcconto || new Date().toISOString(),
                        note: 'Acconto iniziale'
                    }];
                }

                // Converti creditoSospeso in boolean (getFormData lo salva come stringa)
                data.creditoSospeso = (data.creditoSospeso === 'true' || data.creditoSospeso === true);

                const newId = await DataService.createFattura(data);
                UI.showSuccess('Fattura creata con successo!');
                DettaglioFattura.render(newId);
            }
        );

        // Listener per mostrare/nascondere sezione acconto
        setTimeout(async () => {
            // Se cliente preselezionato, carica i contratti
            if (clienteId) {
                try {
                    const contratti = await DataService.getContrattiCliente(clienteId);
                    const attivi = contratti.filter(c => c.stato === 'ATTIVO' || c.stato === 'IN_RINNOVO');
                    const contrattoContainer = document.getElementById('contrattoSelectContainer');
                    const contrattoSelect = document.getElementById('contrattoIdFattura');
                    if (contrattoSelect && attivi.length > 0) {
                        contrattoSelect.innerHTML = '<option value="">-- Nessun contratto --</option>' +
                            attivi.map(c => `<option value="${c.id}" ${c.id === contrattoId ? 'selected' : ''}>${c.numeroContratto || 'N/D'} — ${c.oggetto || ''} (${c.periodicita || ''})</option>`).join('');
                        if (contrattoContainer) contrattoContainer.style.display = 'block';
                    }
                } catch (e) {
                    console.warn('Errore caricamento contratti cliente preselezionato:', e);
                }
            }

            // Aggiorna numero fattura con il progressivo pre-compilato
            FormsManager.aggiornaNumeroFattura();

            const statoSelect = document.getElementById('statoPagamento');
            const sezioneAcconto = document.getElementById('sezioneAcconto');
            if (statoSelect && sezioneAcconto) {
                statoSelect.addEventListener('change', () => {
                    sezioneAcconto.style.display = statoSelect.value === 'PARZIALMENTE_PAGATA' ? 'block' : 'none';
                });
            }

            // Calcolo automatico IVA e totale quando si compila l'imponibile
            const imponibileInput = document.getElementById('imponibile');
            const aliquotaInput = document.getElementById('aliquotaIva');
            const ivaInput = document.getElementById('importoIva');
            const totaleInput = document.getElementById('importoTotale');

            const calcolaImporti = () => {
                const imponibile = parseFloat(imponibileInput?.value) || 0;
                const aliquota = parseFloat(aliquotaInput?.value) || 0;
                if (imponibile > 0) {
                    const iva = parseFloat((imponibile * aliquota / 100).toFixed(2));
                    const totale = parseFloat((imponibile + iva).toFixed(2));
                    if (ivaInput) ivaInput.value = iva;
                    if (totaleInput) totaleInput.value = totale;
                }
            };

            if (imponibileInput) imponibileInput.addEventListener('input', calcolaImporti);
            if (aliquotaInput) aliquotaInput.addEventListener('input', calcolaImporti);

            // Quando cambia l'anno, ricalcola il numero fattura completo
            const annoInput = document.getElementById('anno');
            if (annoInput) {
                annoInput.addEventListener('input', () => FormsManager.aggiornaNumeroFattura());
            }

            // Quando cambia il tipo documento (Fattura/Nota di Credito)
            const tipoDocSelect = document.getElementById('tipoDocumento');
            if (tipoDocSelect) {
                tipoDocSelect.addEventListener('change', () => {
                    const isNC = tipoDocSelect.value === 'NOTA_DI_CREDITO';

                    // Ricalcola numero con prefisso NC
                    FormsManager.aggiornaNumeroFattura();

                    // Se è Nota di Credito, imposta stato automaticamente
                    if (isNC && statoSelect) {
                        statoSelect.value = 'NOTA_CREDITO';
                        if (sezioneAcconto) sezioneAcconto.style.display = 'none';
                    }

                    // Aggiorna titolo modale
                    const modalTitle = document.querySelector('.modal-header h2, [style*="font-size: 1.5rem"]');
                    if (modalTitle) {
                        modalTitle.innerHTML = isNC
                            ? '<i class="fas fa-file-invoice-dollar" style="color: #D32F2F;"></i> Nuova Nota di Credito'
                            : '<i class="fas fa-plus"></i> Nuova Fattura';
                    }
                });
            }
        }, 100);
    },

    // === FORM MODIFICA SCADENZA ===
    async showModificaScadenza(scadenza) {
        // Carica lista agenti per il selettore
        const agentiScad = await DataService.getAgenti();
        const opzioniAgenteScad = [
            { value: '', label: '— Nessun agente —' },
            ...agentiScad.map(a => ({ value: a.nomeCompleto, label: `${a.nomeCompleto} (${a.email})` }))
        ];
        if (scadenza.agente && !agentiScad.find(a => a.nomeCompleto === scadenza.agente)) {
            opzioniAgenteScad.push({ value: scadenza.agente, label: `${scadenza.agente} (non in lista utenti)` });
        }

        const content = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 1rem;">
                ${this.createFormField('Cliente ID', 'clienteId', 'text', scadenza.clienteId)}
                ${this.createFormField('Ragione Sociale Cliente', 'clienteRagioneSociale', 'text', scadenza.clienteRagioneSociale)}
                ${this.createFormField('Tipo', 'tipo', 'select', scadenza.tipo, {
                    required: true,
                    options: [
                        { value: 'PAGAMENTO', label: 'Pagamento' },
                        { value: 'FATTURAZIONE', label: 'Fatturazione' },
                        { value: 'RINNOVO_CONTRATTO', label: 'Rinnovo Contratto' }
                    ]
                })}
                ${this.createFormField('Data Scadenza', 'dataScadenza', 'date', scadenza.dataScadenza?.split('T')[0], { required: true })}
                ${this.createFormField('Agente', 'agente', 'select', scadenza.agente, { options: opzioniAgenteScad })}
                ${this.createFormField('Importo', 'importo', 'number', scadenza.importo)}
                ${this.createFormField('Fattura ID', 'fatturaId', 'text', scadenza.fatturaId, { placeholder: 'ID fattura collegata (opzionale)' })}
                ${this.createFormField('Completata', 'completata', 'select', scadenza.completata ? 'true' : 'false', {
                    options: [
                        { value: 'false', label: 'No' },
                        { value: 'true', label: 'Sì' }
                    ]
                })}
            </div>
            ${this.createFormField('Descrizione', 'descrizione', 'textarea', scadenza.descrizione)}
            ${this.createFormField('Note', 'note', 'textarea', scadenza.note)}
        `;

        this.showModal(
            `<i class="fas fa-edit"></i> Modifica Scadenza`,
            content,
            async () => {
                const data = this.getFormData();
                data.completata = data.completata === 'true';
                await DataService.updateScadenza(scadenza.id, data);
                UI.showSuccess('Scadenza aggiornata con successo!');
                DettaglioScadenza.render(scadenza.id);
            }
        );
    },

    // === FORM NUOVA SCADENZA ===
    async showNuovaScadenza() {
        // Carica lista clienti e agenti per i selettori
        const clienti = await DataService.getClienti();
        const agentiNuovaScad = await DataService.getAgenti();
        const opzioniAgenteNuovaScad = [
            { value: '', label: '— Nessun agente —' },
            ...agentiNuovaScad.map(a => ({ value: a.nomeCompleto, label: `${a.nomeCompleto} (${a.email})` }))
        ];

        const clienteSelectHtml = `
            <div class="form-group" style="margin-bottom: 1rem; grid-column: 1 / -1;">
                <label style="display: block; font-size: 0.875rem; font-weight: 600; color: var(--grigio-700); margin-bottom: 0.5rem;">
                    Cliente
                </label>
                <input
                    type="text"
                    id="clienteSearch"
                    placeholder="🔍 Cerca cliente per nome..."
                    style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 8px; font-size: 1rem; font-family: 'Titillium Web', sans-serif; margin-bottom: 0.5rem;"
                    onkeyup="FormsManager.filterClienti()"
                />
                <select
                    name="clienteId"
                    id="clienteId"
                    style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 8px; font-size: 1rem; font-family: 'Titillium Web', sans-serif;"
                    onchange="FormsManager.onClienteSelected()"
                >
                    <option value="">-- Seleziona un cliente (opzionale) --</option>
                    ${clienti.map(c =>
                        `<option value="${c.id}" data-ragione-sociale="${c.ragioneSociale}">${c.ragioneSociale} (${c.provincia || 'N/A'})</option>`
                    ).join('')}
                </select>
                <input type="hidden" name="clienteRagioneSociale" id="clienteRagioneSociale" />
            </div>
        `;

        const content = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 1rem;">
                ${clienteSelectHtml}
                ${this.createFormField('Tipo', 'tipo', 'select', 'PAGAMENTO', {
                    required: true,
                    options: [
                        { value: 'PAGAMENTO', label: 'Pagamento' },
                        { value: 'FATTURAZIONE', label: 'Fatturazione' },
                        { value: 'RINNOVO_CONTRATTO', label: 'Rinnovo Contratto' }
                    ]
                })}
                ${this.createFormField('Data Scadenza', 'dataScadenza', 'date', '', { required: true })}
                ${this.createFormField('Agente', 'agente', 'select', '', { options: opzioniAgenteNuovaScad })}
                ${this.createFormField('Importo', 'importo', 'number', '', { placeholder: '0.00' })}
                ${this.createFormField('Fattura ID', 'fatturaId', 'text', '', { placeholder: 'ID fattura collegata (opzionale)' })}
            </div>
            ${this.createFormField('Descrizione', 'descrizione', 'textarea', '', { placeholder: 'Descrizione della scadenza...' })}
            ${this.createFormField('Note', 'note', 'textarea', '', { placeholder: 'Note aggiuntive...' })}
        `;

        this.showModal(
            `<i class="fas fa-plus"></i> Nuova Scadenza`,
            content,
            async () => {
                const data = this.getFormData();
                const newId = await DataService.createScadenza(data);
                UI.showSuccess('Scadenza creata con successo!');
                DettaglioScadenza.render(newId);
            }
        );
    },

    // === AZIONI RAPIDE ===
    async marcaFatturaPagata(fatturaId) {
        // Carica fattura per messaggio di conferma dettagliato
        let messaggio = 'Confermi di voler marcare questa fattura come pagata?';
        try {
            const fattura = await DataService.getFattura(fatturaId);
            if (fattura && fattura.acconti && fattura.acconti.length > 0) {
                const totAcconti = fattura.acconti.reduce((s, a) => s + (a.importo || 0), 0);
                const residuo = (fattura.importoTotale || 0) - totAcconti;
                if (residuo > 0) {
                    messaggio = `Questa fattura ha un saldo residuo di ${DataService.formatCurrency(residuo)}.\n\nIl sistema registrerà automaticamente il pagamento del saldo finale.\n\nConfermi il pagamento completo?`;
                }
            }
        } catch (e) { /* usa messaggio default */ }

        if (confirm(messaggio)) {
            UI.showLoading();
            try {
                await DataService.marcaFatturaPagata(fatturaId);
                UI.showSuccess('Fattura marcata come pagata!');
                DettaglioFattura.render(fatturaId);
            } catch (error) {
                UI.hideLoading();
                UI.showError('Errore: ' + error.message);
            }
        }
    },

    async marcaScadenzaCompletata(scadenzaId) {
        if (confirm('Confermi di voler marcare questa scadenza come completata?')) {
            UI.showLoading();
            try {
                await DataService.marcaScadenzaCompletata(scadenzaId);
                UI.showSuccess('Scadenza marcata come completata!');
                DettaglioScadenza.render(scadenzaId);
            } catch (error) {
                UI.hideLoading();
                UI.showError('Errore: ' + error.message);
            }
        }
    },

    // === HELPER PER SELEZIONE CLIENTE ===
    filterClienti() {
        const searchInput = document.getElementById('clienteSearch');
        const select = document.getElementById('clienteId');

        if (!searchInput || !select) return;

        const searchTerm = searchInput.value.toLowerCase();
        const options = select.getElementsByTagName('option');

        for (let i = 1; i < options.length; i++) { // Salta la prima opzione "Seleziona..."
            const option = options[i];
            const text = option.textContent.toLowerCase();

            if (text.includes(searchTerm)) {
                option.style.display = '';
            } else {
                option.style.display = 'none';
            }
        }
    },

    async onClienteSelected() {
        const select = document.getElementById('clienteId');
        const selectedOption = select.options[select.selectedIndex];

        if (selectedOption && selectedOption.value) {
            const clienteId = selectedOption.value;
            const ragioneSociale = selectedOption.getAttribute('data-ragione-sociale');
            const tipoCliente = selectedOption.getAttribute('data-tipo') || 'PRIVATO';

            // Popola ragione sociale
            const hiddenRagioneSociale = document.getElementById('clienteRagioneSociale');
            if (hiddenRagioneSociale) hiddenRagioneSociale.value = ragioneSociale;

            // Salva il tipo cliente per la composizione del numero fattura
            let hiddenTipo = document.getElementById('tipoClienteSelezionato');
            if (!hiddenTipo) {
                hiddenTipo = document.createElement('input');
                hiddenTipo.type = 'hidden';
                hiddenTipo.id = 'tipoClienteSelezionato';
                select.parentElement.appendChild(hiddenTipo);
            }
            hiddenTipo.value = tipoCliente;

            // Mostra badge tipo cliente
            let badgeTipo = document.getElementById('badgeTipoCliente');
            if (!badgeTipo) {
                badgeTipo = document.createElement('div');
                badgeTipo.id = 'badgeTipoCliente';
                badgeTipo.style.cssText = 'margin-top: 0.5rem;';
                select.parentElement.appendChild(badgeTipo);
            }
            badgeTipo.innerHTML = `
                <span class="badge ${tipoCliente === 'PA' ? 'badge-info' : 'badge-secondary'}" style="font-size: 0.9rem; padding: 0.4rem 0.75rem;">
                    ${tipoCliente === 'PA' ? '<i class="fas fa-landmark"></i> Pubblica Amministrazione (PA)' : '<i class="fas fa-building"></i> Privato (PR)'}
                </span>
            `;

            // Carica contratti del cliente e popola il select contratto
            const contrattoContainer = document.getElementById('contrattoSelectContainer');
            const contrattoSelect = document.getElementById('contrattoIdFattura');
            if (contrattoSelect) {
                try {
                    const contratti = await DataService.getContrattiCliente(clienteId);
                    const attivi = contratti.filter(c => c.stato === 'ATTIVO' || c.stato === 'IN_RINNOVO');
                    if (attivi.length > 0) {
                        contrattoSelect.innerHTML = '<option value="">-- Nessun contratto --</option>' +
                            attivi.map(c => `<option value="${c.id}">${c.numeroContratto || 'N/D'} — ${c.oggetto || ''} (${c.periodicita || ''})</option>`).join('');
                        if (contrattoContainer) contrattoContainer.style.display = 'block';
                    } else {
                        contrattoSelect.innerHTML = '<option value="">Nessun contratto attivo</option>';
                        if (contrattoContainer) contrattoContainer.style.display = 'none';
                    }
                } catch (e) {
                    console.warn('Errore caricamento contratti cliente:', e);
                }
            }

            // Aggiorna automaticamente il numero fattura
            this.aggiornaNumeroFattura();
        }
    },

    // Compone automaticamente il numero fattura nel formato ANNO/NUMERO/PA o ANNO/NUMERO/PR
    // Per note di credito: NC-ANNO/NUMERO/PA o NC-ANNO/NUMERO/PR
    aggiornaNumeroFattura() {
        const annoInput = document.getElementById('anno');
        const numInput = document.getElementById('numeroProgressivo');
        const hiddenNumero = document.getElementById('numeroFatturaCompleto');
        const anteprimaDiv = document.getElementById('anteprimaNumeroFattura');
        const anteprimaSpan = document.getElementById('anteprimaNumero');
        const tipoInput = document.getElementById('tipoClienteSelezionato');
        const tipoDocSelect = document.getElementById('tipoDocumento');

        if (!numInput || !hiddenNumero) return;

        const anno = annoInput?.value || new Date().getFullYear();
        const numero = numInput.value.trim();
        const tipo = tipoInput?.value || '';
        const isNotaCredito = tipoDocSelect?.value === 'NOTA_DI_CREDITO';

        if (numero) {
            // Formato da impostazioni di sistema
            const _sysF = SettingsService.getSystemSettingsSync();
            const _padF = _sysF.paddingNumeroFattura || 3;
            const _fmtF = _sysF.formatoNumeroFattura || '{ANNO}/{NUM}/{TIPO}';
            const _prefNC = _sysF.prefissoNotaCredito || 'NC-';

            const numeroPadded = numero.padStart(_padF, '0');
            const suffisso = tipo === 'PA' ? 'PA' : (tipo ? 'PR' : '');
            const prefisso = isNotaCredito ? _prefNC : '';

            // Genera il numero usando il formato configurato
            let numeroFormattato = _fmtF.replace('{ANNO}', anno).replace('{NUM}', numeroPadded).replace('{TIPO}', suffisso);
            // Rimuovi separatore finale se TIPO è vuoto
            if (!suffisso) numeroFormattato = numeroFormattato.replace(/\/+$/, '').replace(/-+$/, '');
            const numeroCompleto = prefisso + numeroFormattato;

            hiddenNumero.value = numeroCompleto;

            if (anteprimaDiv && anteprimaSpan) {
                anteprimaSpan.textContent = numeroCompleto;
                anteprimaDiv.style.display = 'block';

                // Colora in base al tipo
                if (isNotaCredito) {
                    anteprimaDiv.style.background = '#FFEBEE';
                    anteprimaDiv.style.color = '#D32F2F';
                    anteprimaDiv.querySelector('i').className = 'fas fa-file-invoice-dollar';
                } else if (tipo === 'PA') {
                    anteprimaDiv.style.background = '#E1F5FE';
                    anteprimaDiv.style.color = '#0288D1';
                    anteprimaDiv.querySelector('i').className = 'fas fa-file-invoice';
                } else {
                    anteprimaDiv.style.background = 'var(--blu-100)';
                    anteprimaDiv.style.color = 'var(--blu-700)';
                    anteprimaDiv.querySelector('i').className = 'fas fa-file-invoice';
                }
            }
        } else {
            hiddenNumero.value = '';
            if (anteprimaDiv) anteprimaDiv.style.display = 'none';
        }
    },

    /**
     * Auto-fill popolazione dal database ISTAT quando il campo "comune" cambia.
     * Cerca il comune per nome esatto e compila il campo "popolazione" se trovato.
     * Il campo resta editabile dall'utente.
     */
    setupComuneAutoFillPopolazione() {
        const comuneInput = document.getElementById('comune');
        const popolazioneInput = document.getElementById('popolazione');
        if (!comuneInput || !popolazioneInput) return;

        const doLookup = async () => {
            const nomeComune = comuneInput.value.trim();
            if (!nomeComune || nomeComune.length < 2) return;

            const comune = await ComuniService.trovaPeNome(nomeComune);
            if (comune && comune.numResidenti > 0) {
                popolazioneInput.value = comune.numResidenti;
            }
        };

        // Listener per cambiamenti futuri
        comuneInput.addEventListener('blur', doLookup);
        comuneInput.addEventListener('change', doLookup);

        // Auto-fill immediato se il comune è già compilato ma la popolazione è vuota
        if (comuneInput.value.trim() && !popolazioneInput.value) {
            doLookup();
        }
    },

    // === FORM MODIFICA APP ===
    async showModificaApp(app) {
        // Carica lista clienti e agenti in parallelo
        const [clienti, agenti] = await Promise.all([
            DataService.getClienti(),
            DataService.getAgenti()
        ]);

        // Costruisci opzioni agente — fonte di verità: cliente pagante se presente
        const clientePagante = app.clientePaganteId ? clienti.find(c => c.id === app.clientePaganteId) : null;
        const agenteCorrente = (clientePagante ? clientePagante.agente : app.agente) || '';
        const agenteInLista = agenti.some(a => a.nomeCompleto === agenteCorrente);
        let opzioniAgente = '<option value="">-- Nessun agente --</option>';
        agenti.forEach(a => {
            const sel = a.nomeCompleto === agenteCorrente ? 'selected' : '';
            opzioniAgente += `<option value="${a.nomeCompleto}" ${sel}>${a.nomeCompleto}</option>`;
        });
        if (agenteCorrente && !agenteInLista) {
            opzioniAgente += `<option value="${agenteCorrente}" selected>${agenteCorrente} (non in lista utenti)</option>`;
        }

        const content = `
            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                    📱 Dati App/Comune
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 1rem;">
                    ${this.createFormField('Nome App/Comune', 'nome', 'text', app.nome, { required: true })}
                    ${this.createFormField('Comune', 'comune', 'text', app.comune)}
                    ${this.createFormField('Provincia', 'provincia', 'text', app.provincia)}
                    ${this.createFormField('Regione', 'regione', 'text', app.regione)}
                    ${this.createFormField('CAP', 'cap', 'text', app.cap)}
                    ${this.createFormField('Indirizzo', 'indirizzo', 'text', app.indirizzo)}
                    ${this.createFormField('Telefono', 'telefono', 'tel', app.telefono)}
                    ${this.createFormField('Email', 'email', 'email', app.email)}
                    ${this.createFormField('PEC', 'pec', 'email', app.pec)}
                </div>
            </div>

            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                    💼 Gestione Commerciale
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 1rem;">
                    <div class="form-group">
                        <label>Cliente Pagante</label>
                        <select name="clientePaganteId" class="form-input" onchange="FormsManager.onClientePaganteChange(this.value, ${JSON.stringify(clienti).replace(/"/g, '&quot;')})">
                            <option value="">-- Nessuno (Prospect/Demo) --</option>
                            ${clienti.map(c => `<option value="${c.id}" ${c.id === app.clientePaganteId ? 'selected' : ''}>${c.ragioneSociale}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Agente Commerciale</label>
                        <select name="agente" id="agenteAppInput" class="form-input" ${app.clientePaganteId ? 'disabled' : ''}>
                            ${opzioniAgente}
                        </select>
                        ${app.clientePaganteId ? `<small class="agente-info" style="color: var(--grigio-500); display: block; margin-top: 0.25rem;"><i class="fas fa-info-circle"></i> L'agente viene preso dal cliente associato</small>` : ''}
                    </div>
                    ${this.createFormField('Gestione', 'gestione', 'select', app.gestione, {
                        options: [
                            { value: '', label: '-- Seleziona --' },
                            { value: 'Growapp', label: 'Growapp' },
                            { value: 'IOL', label: 'IOL (ItaliaOnLine)' },
                            { value: 'ALTRO', label: 'Altro' }
                        ]
                    })}
                    ${this.createFormField('Tipo Pagamento', 'tipoPagamento', 'select', app.tipoPagamento, {
                        options: [
                            { value: '', label: '-- Seleziona --' },
                            { value: 'DIRETTO', label: 'Diretto Growapp' },
                            { value: 'RIVENDITORE', label: 'Tramite Rivenditore' },
                            { value: 'PROMOZIONALE', label: 'Promozionale/Cortesia' }
                        ]
                    })}
                    ${this.createFormField('Stato App', 'statoApp', 'select', app.statoApp, {
                        required: true,
                        options: this.getFilteredStateOptions(app.statoApp || 'DEMO')
                    })}
                    ${this.createFormField('Referente', 'referenteComune', 'text', app.referenteComune, { placeholder: 'Nome e cognome referente' })}
                </div>
            </div>

            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                    📅 Pubblicazione Store
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 1rem;">
                    ${this.createFormField('Data Pubblicazione Apple', 'dataPubblicazioneApple', 'date', app.dataPubblicazioneApple?.split('T')[0])}
                    ${this.createFormField('Data Pubblicazione Android', 'dataPubblicazioneAndroid', 'date', app.dataPubblicazioneAndroid?.split('T')[0])}
                </div>

                <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 2px solid var(--grigio-300);">
                    <h4 style="font-size: 0.95rem; font-weight: 600; color: var(--grigio-700); margin-bottom: 0.75rem;">
                        🍎 Credenziali Apple Developer
                    </h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 1rem;">
                        ${this.createFormField('Username Apple', 'appleUsername', 'text', app.appleUsername, { placeholder: 'Apple ID / Email' })}
                        ${this.createFormField('Password Apple', 'applePassword', 'text', app.applePassword, { placeholder: 'Password account' })}
                        ${this.createFormField('Email Aggiuntiva Developer', 'appleEmailAggiuntiva', 'text', app.appleEmailAggiuntiva, { placeholder: 'Email aggiuntiva nel developer' })}
                        ${this.createFormField('Telefono OTP', 'appleTelefonoOtp', 'text', app.appleTelefonoOtp, { placeholder: 'Numero per ricezione OTP' })}
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                    ⚙️ Funzionalità e Scadenze
                </h3>
                <div style="margin-bottom: 1rem;">
                    <h4 style="font-size: 0.95rem; font-weight: 600; color: var(--grigio-700); margin-bottom: 0.75rem;">
                        Funzionalità Attive
                    </h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 1rem;">
                        <div class="form-group">
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="checkbox" name="hasGruppoTelegram" value="true" ${app.hasGruppoTelegram ? 'checked' : ''} style="width: 20px; height: 20px;">
                                <span>Gruppo Telegram</span>
                            </label>
                        </div>
                        <div class="form-group">
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="checkbox" name="hasAvvisiFlash" value="true" ${app.hasAvvisiFlash ? 'checked' : ''} style="width: 20px; height: 20px;">
                                <span>Avvisi Flash</span>
                            </label>
                        </div>
                    </div>
                </div>
                <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 2px solid var(--grigio-300);">
                    <h4 style="font-size: 0.95rem; font-weight: 600; color: #e88a1a; margin-bottom: 0.75rem;">
                        <i class="fas fa-rss" style="color: #e88a1a;"></i> Feed RSS (max 5)
                    </h4>
                    <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                        ${(() => {
                            const feeds = Array.isArray(app.feedRss) ? app.feedRss : [];
                            let html = '';
                            for (let i = 1; i <= 5; i++) {
                                const feed = feeds[i - 1] || { nome: '', url: '' };
                                html += '<div style="background: var(--grigio-100); border-radius: 8px; padding: 10px 12px; border-left: 3px solid #e88a1a;">'
                                    + '<div style="font-size: 0.75rem; font-weight: 700; color: #e88a1a; margin-bottom: 6px;">Feed ' + i + '</div>'
                                    + '<input type="text" name="feedRssNome' + i + '" class="form-input" value="' + (feed.nome || '').replace(/"/g, '&quot;') + '" placeholder="Nome del feed" style="font-size: 0.85rem; padding: 8px 10px; margin-bottom: 6px;">'
                                    + '<input type="text" name="feedRssUrl' + i + '" class="form-input" value="' + (feed.url || '').replace(/"/g, '&quot;') + '" placeholder="https://rss.app/feeds/..." style="font-size: 0.85rem; padding: 8px 10px;">'
                                    + '</div>';
                            }
                            return html;
                        })()}
                    </div>
                </div>
                <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 2px solid var(--grigio-300);">
                    <h4 style="font-size: 0.95rem; font-weight: 600; color: var(--giallo-avviso); margin-bottom: 0.75rem;">
                        ⚠️ Scadenze e Alert (Alert 3 giorni prima)
                    </h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 1rem;">
                        ${this.createFormField('📅 Ultima Data Raccolta Differenziata', 'ultimaDataRaccoltaDifferenziata', 'date', app.ultimaDataRaccoltaDifferenziata?.split('T')[0], { placeholder: 'Data aggiornamento' })}
                        ${this.createFormField('💊 Ultima Data Farmacie di Turno', 'ultimaDataFarmacieTurno', 'date', app.ultimaDataFarmacieTurno?.split('T')[0], { placeholder: 'Data aggiornamento' })}
                        ${this.createFormField('🔔 Ultima Data Notifiche Farmacie', 'ultimaDataNotificheFarmacie', 'date', app.ultimaDataNotificheFarmacie?.split('T')[0], { placeholder: 'Data aggiornamento' })}
                        ${this.createFormField('🍎 Scadenza Certificato Apple', 'scadenzaCertificatoApple', 'date', app.scadenzaCertificatoApple?.split('T')[0], { placeholder: 'Data scadenza' })}
                        ${this.createFormField('📌 Altra Scadenza', 'altraScadenzaData', 'date', app.altraScadenzaData?.split('T')[0], { placeholder: 'Data scadenza' })}
                    </div>
                    <div style="margin-top: 1rem;">
                        ${this.createFormField('Note Altra Scadenza', 'altraScadenzaNote', 'textarea', app.altraScadenzaNote, { placeholder: 'Descrizione altra scadenza...', rows: 2 })}
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                    📊 Metriche
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 1rem;">
                    ${this.createFormField('Consensi Push (destinatari)', 'consensiPush', 'number', app.consensiPush || '', { placeholder: 'N. dispositivi con consenso push attivo' })}
                    ${this.createFormField('Popolazione Comune', 'popolazione', 'number', app.popolazione || '', { placeholder: 'Auto-compilato dal comune ISTAT' })}
                    ${this.createFormField('Indice Turisticità (1-10)', 'indiceTuristicita', 'number', app.indiceTuristicita || '', { placeholder: '1 = bassa, 10 = altissima' })}
                    ${this.createFormField('Data Lancio App', 'dataLancioApp', 'date', app.dataLancioApp?.split('T')[0], { placeholder: 'Data effettiva lancio' })}
                </div>

                <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 2px solid var(--grigio-300);">
                    <h4 style="font-size: 0.95rem; font-weight: 600; color: var(--grigio-700); margin-bottom: 0.75rem;">
                        <i class="fas fa-plug" style="color: var(--blu-700);"></i> Integrazione CMS API
                    </h4>
                    <p style="font-size: 0.8rem; color: var(--grigio-500); margin-bottom: 0.75rem;">
                        <i class="fas fa-info-circle"></i> Inserisci le credenziali API per abilitare statistiche automatiche e invio push dal CRM
                    </p>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 1rem;">
                        ${this.createFormField('Webzine ID (CMS)', 'goodbarberWebzineId', 'number', app.goodbarberWebzineId || '', { placeholder: 'ID numerico app su CMS' })}
                        ${this.createFormField('Token API CMS', 'goodbarberToken', 'text', app.goodbarberToken || '', { placeholder: 'Token di autenticazione API' })}
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                    ✅ Controllo Qualità
                </h3>
                <div style="background: var(--grigio-100); padding: 1.5rem; border-radius: 8px; border-left: 4px solid var(--blu-700);">
                    <p style="font-size: 0.875rem; color: var(--grigio-700); margin-bottom: 1rem;">
                        <i class="fas fa-info-circle"></i> Se passa più di 1 mese dall'ultimo controllo, apparirà un avviso
                    </p>
                    <div style="display: grid; gap: 1rem;">
                        ${this.createFormField('📅 Data Ultimo Controllo', 'dataUltimoControlloQualita', 'date', app.dataUltimoControlloQualita?.split('T')[0], { placeholder: 'Data controllo' })}
                        ${this.createFormField('📋 Risultati Controllo / Note', 'noteControlloQualita', 'textarea', app.noteControlloQualita, { placeholder: 'Descrivi cosa è stato controllato e cosa non andava...', rows: 3 })}
                    </div>
                    <div style="margin-top: 1rem; padding-top: 1rem; border-top: 2px solid var(--grigio-300);">
                        <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; background: white; padding: 1rem; border-radius: 8px; border: 2px solid var(--rosso-errore);">
                            <input type="checkbox" name="controlloQualitaNegativo" value="true" ${app.controlloQualitaNegativo ? 'checked' : ''} style="width: 20px; height: 20px;">
                            <div>
                                <span style="font-weight: 700; color: var(--rosso-errore); font-size: 1rem;">
                                    <i class="fas fa-times-circle"></i> Esito Controllo NEGATIVO
                                </span>
                                <div style="font-size: 0.875rem; color: var(--grigio-600); margin-top: 0.25rem;">
                                    Seleziona se il controllo ha rilevato problemi critici. Apparirà un badge rosso "QA KO" nella lista app.
                                </div>
                            </div>
                        </label>
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 1rem;">
                <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                    📝 Note
                </h3>
                ${this.createFormField('Note 1', 'note1', 'textarea', app.note1)}
                ${this.createFormField('Note 2', 'note2', 'textarea', app.note2)}
            </div>
        `;

        this.showModal(
            `<i class="fas fa-edit"></i> Modifica App: ${app.nome}`,
            content,
            async () => {
                const data = this.getFormData();

                // Converti checkbox in boolean (SEMPRE includi i valori, anche se false)
                data.hasGruppoTelegram = data.hasGruppoTelegram === 'true';
                data.hasAvvisiFlash = data.hasAvvisiFlash === 'true';
                data.controlloQualitaNegativo = data.controlloQualitaNegativo === 'true';

                // Converti numeri
                data.consensiPush = parseInt(data.consensiPush) || null;
                data.popolazione = parseInt(data.popolazione) || null;
                data.indiceTuristicita = Math.min(10, Math.max(0, parseInt(data.indiceTuristicita) || 0)) || null;
                data.goodbarberWebzineId = parseInt(data.goodbarberWebzineId) || null;
                data.goodbarberToken = (data.goodbarberToken || '').trim() || null;
                data.dataLancioApp = data.dataLancioApp || null;

                // Se non c'è cliente pagante, rimuovi i campi commerciali
                if (!data.clientePaganteId) {
                    data.clientePaganteId = null;
                    data.tipoPagamento = null;
                    data.gestione = null;
                    data.agente = data.agente || null;
                } else {
                    // Con cliente pagante: agente sempre sincronizzato dal cliente (fonte di verità)
                    // Il select è disabled quindi data.agente potrebbe essere vuoto/assente
                    try {
                        const clienti = await DataService.getClienti();
                        const clienteAssociato = clienti.find(c => c.id === data.clientePaganteId);
                        if (clienteAssociato) {
                            data.agente = clienteAssociato.agente || '';
                        }
                    } catch (e) {
                        console.warn('Errore recupero agente dal cliente:', e);
                    }
                }

                // Assicura che i campi scadenze siano sempre presenti (anche se vuoti)
                data.ultimaDataRaccoltaDifferenziata = data.ultimaDataRaccoltaDifferenziata || null;
                data.ultimaDataFarmacieTurno = data.ultimaDataFarmacieTurno || null;
                data.ultimaDataNotificheFarmacie = data.ultimaDataNotificheFarmacie || null;
                data.scadenzaCertificatoApple = data.scadenzaCertificatoApple || null;
                data.altraScadenzaData = data.altraScadenzaData || null;
                data.altraScadenzaNote = data.altraScadenzaNote || null;

                // Assicura che i campi Credenziali Apple siano presenti
                data.appleUsername = data.appleUsername || null;
                data.applePassword = data.applePassword || null;
                data.appleEmailAggiuntiva = data.appleEmailAggiuntiva || null;
                data.appleTelefonoOtp = data.appleTelefonoOtp || null;

                // Raccogli Feed RSS (fino a 5 slot)
                data.feedRss = [];
                for (let i = 1; i <= 5; i++) {
                    const nome = (data['feedRssNome' + i] || '').trim();
                    const url = (data['feedRssUrl' + i] || '').trim();
                    if (nome || url) {
                        data.feedRss.push({ nome, url });
                    }
                    delete data['feedRssNome' + i];
                    delete data['feedRssUrl' + i];
                }

                // Assicura che i campi controllo qualità siano sempre presenti
                data.dataUltimoControlloQualita = data.dataUltimoControlloQualita || null;
                data.noteControlloQualita = data.noteControlloQualita || null;

                // Se la data controllo qualità è cambiata, salva automaticamente chi l'ha aggiornata
                if (data.dataUltimoControlloQualita && data.dataUltimoControlloQualita !== app.dataUltimoControlloQualita?.split('T')[0]) {
                    data.controlloQualitaDa = AuthService.getUserId();
                    data.controlloQualitaDaNome = AuthService.getUserName();
                    data.controlloQualitaDataAggiornamento = new Date().toISOString();
                }

                // === VALIDAZIONE STATE MACHINE ===
                const oldState = app.statoApp || 'DEMO';
                const newState = data.statoApp || oldState;

                if (oldState !== newState) {
                    // Verifica transizione valida
                    if (!FormsManager.isValidTransition(oldState, newState)) {
                        UI.showError(`Transizione non consentita: ${FormsManager.STATE_LABELS[oldState] || oldState} → ${FormsManager.STATE_LABELS[newState] || newState}`);
                        return;
                    }

                    // Ri-leggi l'app fresca da Firestore per avere cartaIdentita aggiornata
                    const freshApp = await DataService.getApp(app.id);

                    // Verifica checklist se richiesta
                    const checkResult = FormsManager.checkRequiredSections(freshApp || app, oldState, newState);
                    if (!checkResult.ok) {
                        const missingList = checkResult.missingSections
                            .map(s => `\u2022 ${s.label}: ${s.completed}/${s.total} completati`)
                            .join('\n');
                        UI.showError(`Per passare a "${FormsManager.STATE_LABELS[newState]}" completa prima queste sezioni della Carta d'Identità:\n\n${missingList}`);
                        return;
                    }

                    // Reset checklist se DISATTIVATA → IN_SVILUPPO
                    if (oldState === 'DISATTIVATA' && newState === 'IN_SVILUPPO') {
                        if (!confirm('Attenzione: riattivando questa app, la checklist di sviluppo (Carta d\'Identità) verrà resettata e dovrà essere ri-compilata. Continuare?')) {
                            return;
                        }
                        data.cartaIdentita = {}; // Reset completo
                    }
                }

                await DataService.updateApp(app.id, data);
                UI.showSuccess('App aggiornata con successo!');

                // Ricarica la pagina dettaglio
                DettaglioApp.render(app.id);
            }
        );

        // Auto-fill popolazione dal database ISTAT quando si cambia il campo comune
        this.setupComuneAutoFillPopolazione();
    },

    // === FORM NUOVA APP ===
    async showNuovaApp() {
        // Carica lista clienti e agenti in parallelo
        const [clienti, agenti] = await Promise.all([
            DataService.getClienti(),
            DataService.getAgenti()
        ]);

        // Costruisci opzioni agente per nuova app
        let opzioniAgenteNuova = '<option value="">-- Nessun agente --</option>';
        agenti.forEach(a => {
            opzioniAgenteNuova += `<option value="${a.nomeCompleto}">${a.nomeCompleto}</option>`;
        });

        const content = `
            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                    📱 Dati App/Comune
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 1rem;">
                    ${this.createFormField('Nome App/Comune', 'nome', 'text', '', { required: true, placeholder: 'Comune di...' })}
                    ${this.createFormField('Comune', 'comune', 'text', '')}
                    ${this.createFormField('Provincia', 'provincia', 'text', '', { placeholder: 'UD' })}
                    ${this.createFormField('Regione', 'regione', 'text', '')}
                    ${this.createFormField('CAP', 'cap', 'text', '')}
                    ${this.createFormField('Indirizzo', 'indirizzo', 'text', '')}
                    ${this.createFormField('Telefono', 'telefono', 'tel', '')}
                    ${this.createFormField('Email', 'email', 'email', '')}
                    ${this.createFormField('PEC', 'pec', 'email', '')}
                </div>
            </div>

            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                    💼 Gestione Commerciale
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 1rem;">
                    <div class="form-group">
                        <label>Cliente Pagante</label>
                        <select name="clientePaganteId" class="form-input" onchange="FormsManager.onClientePaganteChange(this.value, ${JSON.stringify(clienti).replace(/"/g, '&quot;')})">
                            <option value="">-- Nessuno (Prospect/Demo) --</option>
                            ${clienti.map(c => `<option value="${c.id}">${c.ragioneSociale}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Agente Commerciale</label>
                        <select name="agente" id="agenteAppInput" class="form-input">
                            ${opzioniAgenteNuova}
                        </select>
                    </div>
                    ${this.createFormField('Gestione', 'gestione', 'select', '', {
                        options: [
                            { value: '', label: '-- Seleziona --' },
                            { value: 'Growapp', label: 'Growapp' },
                            { value: 'IOL', label: 'IOL (ItaliaOnline)' },
                            { value: 'ALTRO', label: 'Altro' }
                        ]
                    })}
                    ${this.createFormField('Tipo Pagamento', 'tipoPagamento', 'select', '', {
                        options: [
                            { value: '', label: '-- Seleziona --' },
                            { value: 'DIRETTO', label: 'Diretto Growapp' },
                            { value: 'RIVENDITORE', label: 'Tramite Rivenditore' },
                            { value: 'PROMOZIONALE', label: 'Promozionale/Cortesia' }
                        ]
                    })}
                    ${this.createFormField('Stato App', 'statoApp', 'select', 'IN_SVILUPPO', {
                        options: [
                            { value: 'IN_SVILUPPO', label: 'In Sviluppo' },
                            { value: 'DEMO', label: 'Demo' },
                            { value: 'ATTIVA', label: 'Attiva' },
                            { value: 'SOSPESA', label: 'Sospesa' }
                        ]
                    })}
                    ${this.createFormField('Referente', 'referenteComune', 'text', '', { placeholder: 'Nome e cognome referente' })}
                </div>
            </div>

            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                    📅 Pubblicazione Store
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 1rem;">
                    ${this.createFormField('Data Pubblicazione Apple', 'dataPubblicazioneApple', 'date', '')}
                    ${this.createFormField('Data Pubblicazione Android', 'dataPubblicazioneAndroid', 'date', '')}
                </div>

                <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 2px solid var(--grigio-300);">
                    <h4 style="font-size: 0.95rem; font-weight: 600; color: var(--grigio-700); margin-bottom: 0.75rem;">
                        🍎 Credenziali Apple Developer
                    </h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 1rem;">
                        ${this.createFormField('Username Apple', 'appleUsername', 'text', '', { placeholder: 'Apple ID / Email' })}
                        ${this.createFormField('Password Apple', 'applePassword', 'text', '', { placeholder: 'Password account' })}
                        ${this.createFormField('Email Aggiuntiva Developer', 'appleEmailAggiuntiva', 'text', '', { placeholder: 'Email aggiuntiva nel developer' })}
                        ${this.createFormField('Telefono OTP', 'appleTelefonoOtp', 'text', '', { placeholder: 'Numero per ricezione OTP' })}
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                    ⚙️ Funzionalità e Scadenze
                </h3>
                <div style="margin-bottom: 1rem;">
                    <h4 style="font-size: 0.95rem; font-weight: 600; color: var(--grigio-700); margin-bottom: 0.75rem;">
                        Funzionalità Attive
                    </h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 1rem;">
                        <div class="form-group">
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="checkbox" name="hasGruppoTelegram" value="true" style="width: 20px; height: 20px;">
                                <span>Gruppo Telegram</span>
                            </label>
                        </div>
                        <div class="form-group">
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="checkbox" name="hasAvvisiFlash" value="true" style="width: 20px; height: 20px;">
                                <span>Avvisi Flash</span>
                            </label>
                        </div>
                    </div>
                </div>
                <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 2px solid var(--grigio-300);">
                    <h4 style="font-size: 0.95rem; font-weight: 600; color: #e88a1a; margin-bottom: 0.75rem;">
                        <i class="fas fa-rss" style="color: #e88a1a;"></i> Feed RSS (max 5)
                    </h4>
                    <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                        ${(() => {
                            let html = '';
                            for (let i = 1; i <= 5; i++) {
                                html += '<div style="background: var(--grigio-100); border-radius: 8px; padding: 10px 12px; border-left: 3px solid #e88a1a;">'
                                    + '<div style="font-size: 0.75rem; font-weight: 700; color: #e88a1a; margin-bottom: 6px;">Feed ' + i + '</div>'
                                    + '<input type="text" name="feedRssNome' + i + '" class="form-input" value="" placeholder="Nome del feed" style="font-size: 0.85rem; padding: 8px 10px; margin-bottom: 6px;">'
                                    + '<input type="text" name="feedRssUrl' + i + '" class="form-input" value="" placeholder="https://rss.app/feeds/..." style="font-size: 0.85rem; padding: 8px 10px;">'
                                    + '</div>';
                            }
                            return html;
                        })()}
                    </div>
                </div>
                <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 2px solid var(--grigio-300);">
                    <h4 style="font-size: 0.95rem; font-weight: 600; color: var(--giallo-avviso); margin-bottom: 0.75rem;">
                        ⚠️ Scadenze e Alert (Alert 3 giorni prima)
                    </h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 1rem;">
                        ${this.createFormField('📅 Ultima Data Raccolta Differenziata', 'ultimaDataRaccoltaDifferenziata', 'date', '', { placeholder: 'Data aggiornamento' })}
                        ${this.createFormField('💊 Ultima Data Farmacie di Turno', 'ultimaDataFarmacieTurno', 'date', '', { placeholder: 'Data aggiornamento' })}
                        ${this.createFormField('🔔 Ultima Data Notifiche Farmacie', 'ultimaDataNotificheFarmacie', 'date', '', { placeholder: 'Data aggiornamento' })}
                        ${this.createFormField('🍎 Scadenza Certificato Apple', 'scadenzaCertificatoApple', 'date', '', { placeholder: 'Data scadenza' })}
                        ${this.createFormField('📌 Altra Scadenza', 'altraScadenzaData', 'date', '', { placeholder: 'Data scadenza' })}
                    </div>
                    <div style="margin-top: 1rem;">
                        ${this.createFormField('Note Altra Scadenza', 'altraScadenzaNote', 'textarea', '', { placeholder: 'Descrizione altra scadenza...', rows: 2 })}
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                    📊 Metriche
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 1rem;">
                    ${this.createFormField('Consensi Push (destinatari)', 'consensiPush', 'number', '', { placeholder: 'N. dispositivi con consenso push attivo' })}
                    ${this.createFormField('Popolazione Comune', 'popolazione', 'number', '', { placeholder: 'Auto-compilato dal comune ISTAT' })}
                    ${this.createFormField('Indice Turisticità (1-10)', 'indiceTuristicita', 'number', '', { placeholder: '1 = bassa, 10 = altissima' })}
                    ${this.createFormField('Data Lancio App', 'dataLancioApp', 'date', '', { placeholder: 'Data effettiva lancio' })}
                </div>

                <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 2px solid var(--grigio-300);">
                    <h4 style="font-size: 0.95rem; font-weight: 600; color: var(--grigio-700); margin-bottom: 0.75rem;">
                        <i class="fas fa-plug" style="color: var(--blu-700);"></i> Integrazione CMS API
                    </h4>
                    <p style="font-size: 0.8rem; color: var(--grigio-500); margin-bottom: 0.75rem;">
                        <i class="fas fa-info-circle"></i> Inserisci le credenziali API per abilitare statistiche automatiche e invio push dal CRM
                    </p>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 1rem;">
                        ${this.createFormField('Webzine ID (CMS)', 'goodbarberWebzineId', 'number', '', { placeholder: 'ID numerico app su CMS' })}
                        ${this.createFormField('Token API CMS', 'goodbarberToken', 'text', '', { placeholder: 'Token di autenticazione API' })}
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                    ✅ Controllo Qualità
                </h3>
                <div style="background: var(--grigio-100); padding: 1.5rem; border-radius: 8px; border-left: 4px solid var(--blu-700);">
                    <p style="font-size: 0.875rem; color: var(--grigio-700); margin-bottom: 1rem;">
                        <i class="fas fa-info-circle"></i> Se passa più di 1 mese dall'ultimo controllo, apparirà un avviso
                    </p>
                    <div style="display: grid; gap: 1rem;">
                        ${this.createFormField('📅 Data Ultimo Controllo', 'dataUltimoControlloQualita', 'date', '', { placeholder: 'Data controllo' })}
                        ${this.createFormField('📋 Risultati Controllo / Note', 'noteControlloQualita', 'textarea', '', { placeholder: 'Descrivi cosa è stato controllato e cosa non andava...', rows: 3 })}
                    </div>
                    <div style="margin-top: 1rem; padding-top: 1rem; border-top: 2px solid var(--grigio-300);">
                        <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; background: white; padding: 1rem; border-radius: 8px; border: 2px solid var(--rosso-errore);">
                            <input type="checkbox" name="controlloQualitaNegativo" value="true" style="width: 20px; height: 20px;">
                            <div>
                                <span style="font-weight: 700; color: var(--rosso-errore); font-size: 1rem;">
                                    <i class="fas fa-times-circle"></i> Esito Controllo NEGATIVO
                                </span>
                                <div style="font-size: 0.875rem; color: var(--grigio-600); margin-top: 0.25rem;">
                                    Seleziona se il controllo ha rilevato problemi critici. Apparirà un badge rosso "QA KO" nella lista app.
                                </div>
                            </div>
                        </label>
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 1rem;">
                <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                    📝 Note
                </h3>
                ${this.createFormField('Note 1', 'note1', 'textarea', '', { placeholder: 'Note generali...' })}
                ${this.createFormField('Note 2', 'note2', 'textarea', '', { placeholder: 'Note aggiuntive...' })}
            </div>
        `;

        this.showModal(
            `<i class="fas fa-plus"></i> Nuova App`,
            content,
            async () => {
                const data = this.getFormData();

                // Converti checkbox in boolean
                data.hasGruppoTelegram = data.hasGruppoTelegram === 'true';
                data.hasAvvisiFlash = data.hasAvvisiFlash === 'true';
                data.controlloQualitaNegativo = data.controlloQualitaNegativo === 'true';

                // Converti numeri
                data.consensiPush = parseInt(data.consensiPush) || null;
                data.popolazione = parseInt(data.popolazione) || null;
                data.indiceTuristicita = Math.min(10, Math.max(0, parseInt(data.indiceTuristicita) || 0)) || null;
                data.goodbarberWebzineId = parseInt(data.goodbarberWebzineId) || null;
                data.goodbarberToken = (data.goodbarberToken || '').trim() || null;
                data.dataLancioApp = data.dataLancioApp || null;

                // Se non c'è cliente pagante, rimuovi i campi commerciali
                if (!data.clientePaganteId) {
                    data.clientePaganteId = null;
                    data.tipoPagamento = null;
                    data.gestione = null;
                }
                // Altrimenti usa i valori scelti dall'utente nel form

                // Raccogli Feed RSS (fino a 5 slot)
                data.feedRss = [];
                for (let i = 1; i <= 5; i++) {
                    const nome = (data['feedRssNome' + i] || '').trim();
                    const url = (data['feedRssUrl' + i] || '').trim();
                    if (nome || url) {
                        data.feedRss.push({ nome, url });
                    }
                    delete data['feedRssNome' + i];
                    delete data['feedRssUrl' + i];
                }

                // Se è stata inserita una data controllo qualità, salva chi l'ha creata
                if (data.dataUltimoControlloQualita) {
                    data.controlloQualitaDa = AuthService.getUserId();
                    data.controlloQualitaDaNome = AuthService.getUserName();
                    data.controlloQualitaDataAggiornamento = new Date().toISOString();
                }

                const newId = await DataService.createApp(data);
                UI.showSuccess('App creata con successo!');

                // Ricarica lista app
                if (typeof GestioneApp !== 'undefined' && GestioneApp.render) {
                    GestioneApp.render();
                }
            }
        );

        // Auto-fill popolazione dal database ISTAT quando si cambia il campo comune
        this.setupComuneAutoFillPopolazione();
    },

    // === FORM NUOVO CONTRATTO ===
    async showNuovoContratto(clienteId = null) {
        // Carica lista clienti per il selettore
        const clienti = await DataService.getClienti();

        let clienteSelectHtml = '';
        if (!clienteId) {
            // Crea campo di selezione cliente
            clienteSelectHtml = `
                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display: block; font-size: 0.875rem; font-weight: 600; color: var(--grigio-700); margin-bottom: 0.5rem;">
                        Cliente <span style="color: #D32F2F;">*</span>
                    </label>
                    <select
                        name="clienteId"
                        id="clienteId"
                        required
                        style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 8px; font-size: 1rem; font-family: 'Titillium Web', sans-serif;"
                    >
                        <option value="">-- Seleziona Cliente --</option>
                        ${clienti.map(c =>
                            `<option value="${c.id}">${c.ragioneSociale}</option>`
                        ).join('')}
                    </select>
                </div>
            `;
        } else {
            // Cliente già selezionato
            const cliente = clienti.find(c => c.id === clienteId);
            clienteSelectHtml = `
                ${this.createFormField('Cliente', 'clienteDisplay', 'text', cliente?.ragioneSociale || '', { disabled: true })}
                <input type="hidden" name="clienteId" value="${clienteId}" />
            `;
        }

        // Genera numero contratto suggerito (da impostazioni sistema)
        // Trova il numero SEQUENZIALE PIÙ ALTO tra i contratti dell'anno e propone il successivo
        const _sys = SettingsService.getSystemSettingsSync();
        const anno = _sys.annoContabile || new Date().getFullYear();
        const _pref = _sys.prefissoNumeroContratto || 'CTR';
        const _padC = _sys.paddingNumeroContratto || 3;
        const _fmtC = _sys.formatoNumeroContratto || '{PREF}-{ANNO}-{NUM}';
        const contratti = await DataService.getContratti();
        const prefissoAnno = `${_pref}-${anno}`;
        let maxNumContratto = 0;
        contratti.forEach(c => {
            const nc = c.numeroContratto || '';
            if (nc.startsWith(prefissoAnno)) {
                // Estrai la parte numerica finale (es. da "CTR-2026-003" → 3)
                const match = nc.match(/(\d+)$/);
                if (match) {
                    const num = parseInt(match[1]);
                    if (num > maxNumContratto) maxNumContratto = num;
                }
            }
        });
        const _numC = String(maxNumContratto + 1).padStart(_padC, '0');
        const numeroSuggerito = _fmtC.replace('{PREF}', _pref).replace('{ANNO}', anno).replace('{NUM}', _numC);

        const content = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 1rem;">
                ${clienteSelectHtml}
                ${this.createFormField('Numero Contratto', 'numeroContratto', 'text', numeroSuggerito, { required: true, placeholder: numeroSuggerito })}
                ${this.createFormField('Oggetto', 'oggetto', 'text', '', { required: true, placeholder: 'Servizio App Comune' })}
                ${this.createFormField('Tipologia', 'tipologia', 'select', _sys.tipologiaContrattoDefault, {
                    required: true,
                    options: [
                        { value: 'SERVIZIO_APP', label: 'Servizio App' },
                        { value: 'MANUTENZIONE', label: 'Manutenzione' },
                        { value: 'CONSULENZA', label: 'Consulenza' },
                        { value: 'SERVIZI', label: 'Servizi' },
                        { value: 'ALTRO', label: 'Altro' }
                    ]
                })}
                ${this.createFormField('Data Inizio', 'dataInizio', 'date', new Date().toISOString().split('T')[0], { required: true })}
                ${this.createFormField('Durata (mesi)', 'durataContratto', 'number', String(_sys.durataContrattoDefault), { required: true, placeholder: String(_sys.durataContrattoDefault) })}
                ${this.createFormField('Data Scadenza', 'dataScadenza', 'date', '', { required: true })}
                ${this.createFormField('Data Firma', 'dataFirma', 'date', '')}
                ${this.createFormField('Importo Contratto €', 'importoAnnuale', 'number', '', { required: true, placeholder: '0.00' })}
                ${this.createFormField('Importo Mensile €', 'importoMensile', 'number', '', { placeholder: 'Calcolato automaticamente se vuoto' })}
                ${this.createFormField('Periodicità Fatturazione', 'periodicita', 'select', _sys.periodicitaDefault, {
                    options: [
                        { value: 'UNA_TANTUM', label: 'Una Tantum' },
                        { value: 'MENSILE', label: 'Mensile' },
                        { value: 'BIMENSILE', label: 'Bimensile' },
                        { value: 'TRIMESTRALE', label: 'Trimestrale' },
                        { value: 'SEMESTRALE', label: 'Semestrale' },
                        { value: 'ANNUALE', label: 'Annuale' },
                        { value: 'BIENNALE', label: 'Biennale (2 anni)' },
                        { value: 'TRIENNALE', label: 'Triennale (3 anni)' },
                        { value: 'QUADRIENNALE', label: 'Quadriennale (4 anni)' },
                        { value: 'QUINQUENNALE', label: 'Quinquennale (5 anni)' }
                    ]
                })}
                ${this.createFormField('Modalità Pagamento', 'modalitaPagamento', 'select', _sys.condizionePagamentoDefault, {
                    options: [
                        { value: 'ANTICIPATO', label: 'Anticipato' },
                        { value: 'POSTICIPATO', label: 'Posticipato' },
                        { value: 'MENSILE', label: 'Mensile' }
                    ]
                })}
                ${this.createFormField('Gestione', 'gestione', 'select', '', {
                    options: [
                        { value: '', label: '-- Seleziona --' },
                        { value: 'Growapp', label: 'Growapp' },
                        { value: 'IOL', label: 'IOL (ItaliaOnline)' },
                        { value: 'ALTRO', label: 'Altro' }
                    ]
                })}
                ${this.createFormField('Stato', 'stato', 'select', 'ATTIVO', {
                    required: true,
                    options: [
                        { value: 'ATTIVO', label: 'Attivo' },
                        { value: 'IN_RINNOVO', label: 'In Rinnovo' },
                        { value: 'SOSPESO', label: 'Sospeso' }
                    ]
                })}
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">
                <div class="form-group">
                    <label style="display: block; font-size: 0.875rem; font-weight: 600; color: var(--grigio-700); margin-bottom: 0.5rem;">
                        <input type="checkbox" name="rinnovoAutomatico" id="rinnovoAutomatico" />
                        Rinnovo Automatico
                    </label>
                </div>
                ${this.createFormField('Giorni Preavviso Rinnovo', 'giorniPreavvisoRinnovo', 'number', String(_sys.giorniPreavvisoRinnovo), { placeholder: String(_sys.giorniPreavvisoRinnovo) })}
            </div>
            ${this.createFormField('Note', 'note', 'textarea', '', { placeholder: 'Note aggiuntive...' })}
        `;

        this.showModal(
            `<i class="fas fa-plus"></i> Nuovo Contratto`,
            content,
            async () => {
                const data = this.getFormData();

                // Gestisci checkbox
                data.rinnovoAutomatico = document.getElementById('rinnovoAutomatico')?.checked || false;

                // Calcola importo mensile se non fornito
                if (!data.importoMensile && data.importoAnnuale) {
                    data.importoMensile = data.importoAnnuale / 12;
                }

                // Validazione date obbligatorie
                if (!data.dataInizio) {
                    throw new Error('La data di inizio contratto è obbligatoria');
                }
                if (!data.dataScadenza) {
                    throw new Error('La data di scadenza contratto è obbligatoria');
                }
                if (new Date(data.dataScadenza) <= new Date(data.dataInizio)) {
                    throw new Error('La data di scadenza deve essere successiva alla data di inizio contratto');
                }

                // Converti numeri
                data.importoAnnuale = parseFloat(data.importoAnnuale) || 0;
                data.importoMensile = parseFloat(data.importoMensile) || 0;
                data.durataContratto = parseInt(data.durataContratto) || 12;
                data.giorniPreavvisoRinnovo = parseInt(data.giorniPreavvisoRinnovo) || 60;

                // Aggiungi timestamp
                data.dataCreazione = new Date();
                data.dataAggiornamento = new Date();

                const newId = await DataService.createContratto(data);

                // === GENERAZIONE SCADENZE AUTOMATICHE ===
                try {
                    // Recupera dati cliente per ragioneSociale e agente
                    const clientePerScadenze = clienti.find(c => c.id === data.clienteId);
                    const ragioneSocialeCliente = clientePerScadenze?.ragioneSociale || '';
                    const agenteCliente = clientePerScadenze?.agente || '';

                    // Genera scadenze passando l'ID del contratto appena creato
                    const contrattoConId = { ...data, id: newId };
                    const risultatoScadenze = await DataService.generateScadenzeFromContratto(
                        contrattoConId,
                        ragioneSocialeCliente,
                        agenteCliente
                    );

                    if (risultatoScadenze.success && risultatoScadenze.scadenzeCreate > 0) {
                        UI.showSuccess(`Contratto creato! Generate ${risultatoScadenze.scadenzeCreate} scadenze automatiche.`);
                    } else {
                        UI.showSuccess('Contratto creato con successo!');
                    }
                } catch (errScadenze) {
                    console.warn('Scadenze automatiche non generate:', errScadenze);
                    UI.showSuccess('Contratto creato con successo! (Scadenze automatiche non generate)');
                }

                // Aggiorna stato cliente in base ai contratti
                DataService.aggiornaStatoCliente(data.clienteId);

                // Vai al dettaglio contratto
                DettaglioContratto.render(newId);
            }
        );
    },

    // === FORM MODIFICA CONTRATTO ===
    async showModificaContratto(contrattoId) {
        // Carica contratto
        const contratto = await DataService.getContratto(contrattoId);
        if (!contratto) {
            UI.showError('Contratto non trovato');
            return;
        }

        // Carica cliente e app del cliente
        const cliente = await DataService.getCliente(contratto.clienteId);

        // Carica app del cliente pagante per il select
        const appSnapshot = await db.collection('app').where('clientePaganteId', '==', contratto.clienteId).get();
        const apps = appSnapshot.docs.map(doc => ({
            id: doc.id,
            nome: doc.data().nome || 'Senza nome'
        }));

        const content = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 1rem;">
                ${this.createFormField('Cliente', 'clienteDisplay', 'text', cliente?.ragioneSociale || 'Sconosciuto', { disabled: true })}
                ${apps.length > 0 ? this.createFormField('App Collegata', 'appId', 'select', contratto.appId, {
                    options: [
                        { value: '', label: '-- Nessuna app --' },
                        ...apps.map(app => ({ value: app.id, label: app.nome }))
                    ]
                }) : ''}
                ${this.createFormField('Numero Contratto', 'numeroContratto', 'text', contratto.numeroContratto, { required: true })}
                ${this.createFormField('Oggetto', 'oggetto', 'text', contratto.oggetto, { required: true })}
                ${this.createFormField('Tipologia', 'tipologia', 'select', contratto.tipologia, {
                    required: true,
                    options: [
                        { value: 'SERVIZIO_APP', label: 'Servizio App' },
                        { value: 'MANUTENZIONE', label: 'Manutenzione' },
                        { value: 'CONSULENZA', label: 'Consulenza' },
                        { value: 'SERVIZI', label: 'Servizi' },
                        { value: 'ALTRO', label: 'Altro' }
                    ]
                })}
                ${this.createFormField('Data Inizio', 'dataInizio', 'date', contratto.dataInizio?.split('T')[0], { required: true })}
                ${this.createFormField('Durata (mesi)', 'durataContratto', 'number', contratto.durataContratto, { required: true })}
                ${this.createFormField('Data Scadenza', 'dataScadenza', 'date', contratto.dataScadenza?.split('T')[0], { required: true })}
                ${this.createFormField('Data Firma', 'dataFirma', 'date', contratto.dataFirma?.split('T')[0])}
                ${this.createFormField('Importo Contratto €', 'importoAnnuale', 'number', contratto.importoAnnuale, { required: true })}
                ${this.createFormField('Importo Mensile €', 'importoMensile', 'number', contratto.importoMensile)}
                ${this.createFormField('Periodicità Fatturazione', 'periodicita', 'select', contratto.periodicita, {
                    options: [
                        { value: 'UNA_TANTUM', label: 'Una Tantum' },
                        { value: 'MENSILE', label: 'Mensile' },
                        { value: 'BIMENSILE', label: 'Bimensile' },
                        { value: 'TRIMESTRALE', label: 'Trimestrale' },
                        { value: 'SEMESTRALE', label: 'Semestrale' },
                        { value: 'ANNUALE', label: 'Annuale' },
                        { value: 'BIENNALE', label: 'Biennale (2 anni)' },
                        { value: 'TRIENNALE', label: 'Triennale (3 anni)' },
                        { value: 'QUADRIENNALE', label: 'Quadriennale (4 anni)' },
                        { value: 'QUINQUENNALE', label: 'Quinquennale (5 anni)' }
                    ]
                })}
                ${this.createFormField('Modalità Pagamento', 'modalitaPagamento', 'select', contratto.modalitaPagamento, {
                    options: [
                        { value: 'ANTICIPATO', label: 'Anticipato' },
                        { value: 'POSTICIPATO', label: 'Posticipato' },
                        { value: 'MENSILE', label: 'Mensile' }
                    ]
                })}
                ${this.createFormField('Gestione', 'gestione', 'select', contratto.gestione, {
                    options: [
                        { value: '', label: '-- Seleziona --' },
                        { value: 'Growapp', label: 'Growapp' },
                        { value: 'IOL', label: 'IOL (ItaliaOnline)' },
                        { value: 'ALTRO', label: 'Altro' }
                    ]
                })}
                ${this.createFormField('Stato', 'stato', 'select', contratto.stato, {
                    required: true,
                    options: [
                        { value: 'ATTIVO', label: 'Attivo' },
                        { value: 'SCADUTO', label: 'Scaduto' },
                        { value: 'RINNOVATO', label: 'Rinnovato' },
                        { value: 'CESSATO', label: 'Cessato' },
                        { value: 'IN_RINNOVO', label: 'In Rinnovo' },
                        { value: 'SOSPESO', label: 'Sospeso' }
                    ]
                })}
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">
                <div class="form-group">
                    <label style="display: block; font-size: 0.875rem; font-weight: 600; color: var(--grigio-700); margin-bottom: 0.5rem;">
                        <input type="checkbox" name="rinnovoAutomatico" id="rinnovoAutomatico" ${contratto.rinnovoAutomatico ? 'checked' : ''} />
                        Rinnovo Automatico
                    </label>
                </div>
                ${this.createFormField('Giorni Preavviso Rinnovo', 'giorniPreavvisoRinnovo', 'number', contratto.giorniPreavvisoRinnovo)}
            </div>
            ${this.createFormField('Note', 'note', 'textarea', contratto.note)}
        `;

        this.showModal(
            `<i class="fas fa-edit"></i> Modifica Contratto`,
            content,
            async () => {
                const data = this.getFormData();

                // Gestisci checkbox
                data.rinnovoAutomatico = document.getElementById('rinnovoAutomatico')?.checked || false;

                // Calcola importo mensile se non fornito
                if (!data.importoMensile && data.importoAnnuale) {
                    data.importoMensile = data.importoAnnuale / 12;
                }

                // Validazione date
                if (data.dataInizio && data.dataScadenza && new Date(data.dataScadenza) <= new Date(data.dataInizio)) {
                    throw new Error('La data di scadenza deve essere successiva alla data di inizio contratto');
                }

                // Converti numeri
                data.importoAnnuale = parseFloat(data.importoAnnuale) || 0;
                data.importoMensile = parseFloat(data.importoMensile) || 0;
                data.durataContratto = parseInt(data.durataContratto) || 12;
                data.giorniPreavvisoRinnovo = parseInt(data.giorniPreavvisoRinnovo) || 60;

                // Aggiungi timestamp aggiornamento
                data.dataAggiornamento = new Date();

                await DataService.updateContratto(contrattoId, data);
                UI.showSuccess('Contratto aggiornato con successo!');

                // Aggiorna stato cliente in base ai contratti
                if (data.clienteId) {
                    DataService.aggiornaStatoCliente(data.clienteId);
                }

                // Ricarica dettaglio
                DettaglioContratto.render(contrattoId);
            }
        );
    },

    // === FORM RINNOVO CONTRATTO ===
    async showRinnovoContratto(contrattoId) {
        // Carica contratto originale
        const contratto = await DataService.getContratto(contrattoId);
        if (!contratto) {
            UI.showError('Contratto non trovato');
            return;
        }

        // Carica cliente
        const cliente = await DataService.getCliente(contratto.clienteId);

        // Calcola date per il nuovo contratto
        // Data inizio = giorno dopo scadenza vecchio (o oggi se già scaduto)
        const vecchiaScadenza = contratto.dataScadenza ? new Date(contratto.dataScadenza) : new Date();
        const oggi = new Date();
        const dataInizioNuovo = vecchiaScadenza > oggi ? new Date(vecchiaScadenza) : new Date(oggi);
        dataInizioNuovo.setDate(dataInizioNuovo.getDate() + 1);

        // Data scadenza = 1 anno dalla data inizio
        const nuovaScadenza = new Date(dataInizioNuovo);
        nuovaScadenza.setFullYear(nuovaScadenza.getFullYear() + 1);

        // Durata in mesi
        const durata = contratto.durataContratto || 12;

        const content = `
            <div class="alert alert-info" style="background: #E8F4FD; padding: 1rem; margin-bottom: 1.5rem; border-radius: 8px; border-left: 4px solid #0288D1;">
                <p style="margin: 0; color: var(--grigio-700);">
                    <strong><i class="fas fa-info-circle"></i> Rinnovo Contratto</strong><br>
                    Il contratto attuale <strong>${contratto.numeroContratto}</strong> verrà marcato come <em>Rinnovato</em> e verrà creato un <strong>nuovo contratto</strong> con i dati sottostanti. Puoi modificare importi, date e durata.
                </p>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 1rem;">
                ${this.createFormField('Cliente', 'clienteDisplay', 'text', cliente?.ragioneSociale || 'Sconosciuto', { disabled: true })}
                ${this.createFormField('Contratto Originale', 'contrattoOriginale', 'text', contratto.numeroContratto, { disabled: true })}
                ${this.createFormField('Nuovo N. Contratto', 'nuovoNumero', 'text', DataService._generaNumeroRinnovo(contratto.numeroContratto), { disabled: true })}
                ${this.createFormField('Data Inizio Nuovo', 'dataInizioNuovo', 'date', dataInizioNuovo.toISOString().split('T')[0], { required: true })}
                ${this.createFormField('Durata (mesi)', 'durataNuovo', 'number', durata, { required: true })}
                ${this.createFormField('Data Scadenza Nuovo', 'dataScadenzaNuovo', 'date', nuovaScadenza.toISOString().split('T')[0], { required: true })}
                ${this.createFormField('Importo Contratto €', 'nuovoImportoAnnuale', 'number', contratto.importoAnnuale, { required: true })}
                ${this.createFormField('Importo Mensile €', 'nuovoImportoMensile', 'number', contratto.importoMensile, { placeholder: 'Calcolato automaticamente se vuoto' })}
                ${this.createFormField('Periodicità Fatturazione', 'periodicitaNuovo', 'select', contratto.periodicita || 'ANNUALE', {
                    options: [
                        { value: 'UNA_TANTUM', label: 'Una Tantum' },
                        { value: 'MENSILE', label: 'Mensile' },
                        { value: 'BIMENSILE', label: 'Bimensile' },
                        { value: 'TRIMESTRALE', label: 'Trimestrale' },
                        { value: 'SEMESTRALE', label: 'Semestrale' },
                        { value: 'ANNUALE', label: 'Annuale' },
                        { value: 'BIENNALE', label: 'Biennale (2 anni)' },
                        { value: 'TRIENNALE', label: 'Triennale (3 anni)' },
                        { value: 'QUADRIENNALE', label: 'Quadriennale (4 anni)' },
                        { value: 'QUINQUENNALE', label: 'Quinquennale (5 anni)' }
                    ]
                })}
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">
                <div class="form-group">
                    <label style="display: block; font-size: 0.875rem; font-weight: 600; color: var(--grigio-700); margin-bottom: 0.5rem;">
                        <input type="checkbox" name="rinnovoAutomaticoNuovo" id="rinnovoAutomaticoNuovo" ${contratto.rinnovoAutomatico ? 'checked' : ''} />
                        Rinnovo Automatico
                    </label>
                </div>
                ${this.createFormField('Giorni Preavviso', 'giorniPreavvisoNuovo', 'number', contratto.giorniPreavvisoRinnovo || 60)}
            </div>
            ${this.createFormField('Note Nuovo Contratto', 'noteRinnovo', 'textarea', '', { placeholder: 'Note per il nuovo contratto...' })}
        `;

        this.showModal(
            `<i class="fas fa-sync-alt"></i> Rinnova Contratto`,
            content,
            async () => {
                const data = this.getFormData();

                const importoAnnuale = parseFloat(data.nuovoImportoAnnuale) || contratto.importoAnnuale;
                let importoMensile = parseFloat(data.nuovoImportoMensile);
                if (!importoMensile && importoAnnuale) {
                    importoMensile = importoAnnuale / 12;
                }

                // Validazioni
                if (!data.dataInizioNuovo) throw new Error('La data di inizio è obbligatoria');
                if (!data.dataScadenzaNuovo) throw new Error('La data di scadenza è obbligatoria');
                if (new Date(data.dataScadenzaNuovo) <= new Date(data.dataInizioNuovo)) {
                    throw new Error('La data di scadenza deve essere successiva alla data di inizio');
                }

                // Prepara dati per il nuovo contratto
                const nuovoContrattoDati = {
                    dataInizio: data.dataInizioNuovo,
                    dataScadenza: data.dataScadenzaNuovo,
                    importoAnnuale: importoAnnuale,
                    importoMensile: importoMensile,
                    durataContratto: parseInt(data.durataNuovo) || 12,
                    periodicita: data.periodicitaNuovo || contratto.periodicita,
                    note: data.noteRinnovo || '',
                    rinnovoAutomatico: document.getElementById('rinnovoAutomaticoNuovo')?.checked || false,
                    giorniPreavvisoRinnovo: parseInt(data.giorniPreavvisoNuovo) || 60
                };

                // Crea nuovo contratto e marca vecchio come RINNOVATO
                const nuovoId = await DataService.rinnovaContratto(contrattoId, nuovoContrattoDati);

                UI.showSuccess('Contratto rinnovato! Il vecchio contratto è stato archiviato e ne è stato creato uno nuovo.');

                // Aggiorna stato cliente in base ai contratti
                if (contratto.clienteId) {
                    await DataService.aggiornaStatoCliente(contratto.clienteId);
                }

                // Vai al dettaglio del NUOVO contratto
                DettaglioContratto.render(nuovoId);
            }
        );
    },

    // Gestisce il cambio del cliente pagante nel form app
    onClientePaganteChange(clienteId, clientiJSON) {
        const agenteSelect = document.getElementById('agenteAppInput');
        if (!agenteSelect) return;

        try {
            // Parse clienti dalla stringa JSON
            const clienti = JSON.parse(clientiJSON.replace(/&quot;/g, '"'));

            if (clienteId) {
                // Cliente selezionato → prendi agente dal cliente
                const cliente = clienti.find(c => c.id === clienteId);
                if (cliente && cliente.agente) {
                    // Seleziona l'agente nella select (se presente tra le opzioni)
                    const agenteNome = cliente.agente;
                    let trovato = false;
                    for (let i = 0; i < agenteSelect.options.length; i++) {
                        if (agenteSelect.options[i].value === agenteNome) {
                            agenteSelect.selectedIndex = i;
                            trovato = true;
                            break;
                        }
                    }
                    // Se l'agente del cliente non è in lista, aggiungilo temporaneamente
                    if (!trovato && agenteNome) {
                        const opt = document.createElement('option');
                        opt.value = agenteNome;
                        opt.textContent = agenteNome + ' (dal cliente)';
                        opt.selected = true;
                        agenteSelect.appendChild(opt);
                    }
                    agenteSelect.disabled = true;

                    // Mostra messaggio informativo
                    let infoMessage = agenteSelect.parentNode.querySelector('.agente-info');
                    if (!infoMessage) {
                        infoMessage = document.createElement('small');
                        infoMessage.className = 'agente-info';
                        infoMessage.style.cssText = 'color: var(--grigio-500); display: block; margin-top: 0.25rem;';
                        agenteSelect.parentNode.appendChild(infoMessage);
                    }
                    infoMessage.innerHTML = '<i class="fas fa-info-circle"></i> L\'agente viene preso dal cliente associato';
                } else {
                    // Cliente senza agente
                    agenteSelect.selectedIndex = 0;
                    agenteSelect.disabled = true;
                }
            } else {
                // Nessun cliente → select libera
                agenteSelect.disabled = false;

                // Rimuovi messaggio informativo
                const infoMessage = agenteSelect.parentNode.querySelector('.agente-info');
                if (infoMessage) {
                    infoMessage.remove();
                }
                // Rimuovi eventuali opzioni temporanee "(dal cliente)"
                for (let i = agenteSelect.options.length - 1; i >= 0; i--) {
                    if (agenteSelect.options[i].textContent.includes('(dal cliente)')) {
                        agenteSelect.remove(i);
                    }
                }
            }
        } catch (error) {
            console.error('Errore parsing clienti:', error);
        }
    }
};

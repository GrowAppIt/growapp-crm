// Forms Manager - Gestione form di modifica e creazione
const FormsManager = {
    currentModal: null,

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
            if (input.type === 'number') {
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
        const content = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem;">
                ${this.createFormField('Ragione Sociale', 'ragioneSociale', 'text', cliente.ragioneSociale, { required: true })}
                ${this.createFormField('Partita IVA', 'partitaIva', 'text', cliente.partitaIva)}
                ${this.createFormField('Codice Fiscale', 'codiceFiscale', 'text', cliente.codiceFiscale)}
                ${this.createFormField('Indirizzo', 'indirizzo', 'text', cliente.indirizzo)}
                ${this.createFormField('CAP', 'cap', 'text', cliente.cap)}
                ${this.createFormField('Comune', 'comune', 'text', cliente.comune)}
                ${this.createFormField('Provincia', 'provincia', 'text', cliente.provincia)}
                ${this.createFormField('Regione', 'regione', 'text', cliente.regione)}
                ${this.createFormField('Telefono', 'telefono', 'tel', cliente.telefono)}
                ${this.createFormField('Email', 'email', 'email', cliente.email)}
                ${this.createFormField('PEC', 'pec', 'email', cliente.pec)}
                ${this.createFormField('Codice SDI', 'codiceSdi', 'text', cliente.codiceSdi)}
                ${this.createFormField('Agente', 'agente', 'text', cliente.agente)}
                ${this.createFormField('Stato Contratto', 'statoContratto', 'select', cliente.statoContratto, {
                    options: [
                        { value: 'ATTIVO', label: 'Attivo' },
                        { value: 'PROSPECT', label: 'Prospect' },
                        { value: 'SCADUTO', label: 'Scaduto' },
                        { value: 'CESSATO', label: 'Cessato' },
                        { value: 'DA_DEFINIRE', label: 'Da Definire' }
                    ]
                })}
                ${this.createFormField('Tipo', 'tipo', 'select', cliente.tipo, {
                    options: [
                        { value: 'PA', label: 'Pubblica Amministrazione' },
                        { value: 'PRIVATO', label: 'Privato' },
                        { value: 'ALTRO', label: 'Altro' }
                    ]
                })}
                ${this.createFormField('Gestione', 'gestione', 'select', cliente.gestione, {
                    options: [
                        { value: '', label: '-- Seleziona --' },
                        { value: 'Growapp', label: 'Growapp' },
                        { value: 'IOL', label: 'IOL (ItaliaOnline)' },
                        { value: 'ALTRO', label: 'Altro' }
                    ]
                })}
                ${this.createFormField('Data Scadenza Contratto', 'dataScadenzaContratto', 'date', cliente.dataScadenzaContratto?.split('T')[0])}
                ${this.createFormField('Importo Contratto', 'importoContratto', 'number', cliente.importoContratto)}
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
        const content = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem;">
                ${this.createFormField('Ragione Sociale', 'ragioneSociale', 'text', '', { required: true, placeholder: 'Nome azienda o ente' })}
                ${this.createFormField('Partita IVA', 'partitaIva', 'text', '', { placeholder: '12345678901' })}
                ${this.createFormField('Codice Fiscale', 'codiceFiscale', 'text', '')}
                ${this.createFormField('Indirizzo', 'indirizzo', 'text', '')}
                ${this.createFormField('CAP', 'cap', 'text', '')}
                ${this.createFormField('Comune', 'comune', 'text', '')}
                ${this.createFormField('Provincia', 'provincia', 'text', '', { placeholder: 'UD' })}
                ${this.createFormField('Regione', 'regione', 'text', '')}
                ${this.createFormField('Telefono', 'telefono', 'tel', '')}
                ${this.createFormField('Email', 'email', 'email', '')}
                ${this.createFormField('PEC', 'pec', 'email', '')}
                ${this.createFormField('Codice SDI', 'codiceSdi', 'text', '', { placeholder: 'Codice 7 caratteri' })}
                ${this.createFormField('Agente', 'agente', 'text', '')}
                ${this.createFormField('Stato Contratto', 'statoContratto', 'select', 'PROSPECT', {
                    options: [
                        { value: 'PROSPECT', label: 'Prospect' },
                        { value: 'ATTIVO', label: 'Attivo' },
                        { value: 'SCADUTO', label: 'Scaduto' },
                        { value: 'CESSATO', label: 'Cessato' },
                        { value: 'DA_DEFINIRE', label: 'Da Definire' }
                    ]
                })}
                ${this.createFormField('Tipo', 'tipo', 'select', 'PRIVATO', {
                    options: [
                        { value: 'PRIVATO', label: 'Privato' },
                        { value: 'PA', label: 'Pubblica Amministrazione' },
                        { value: 'ALTRO', label: 'Altro' }
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
                ${this.createFormField('Data Scadenza Contratto', 'dataScadenzaContratto', 'date', '')}
                ${this.createFormField('Importo Contratto', 'importoContratto', 'number', '', { placeholder: '0.00' })}
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
                // Vai al dettaglio del nuovo cliente
                DettaglioCliente.render(newId);
            }
        );
    },

    // === FORM MODIFICA FATTURA ===
    async showModificaFattura(fattura) {
        // Carica tutti i clienti per il select
        const clientiSnapshot = await db.collection('clienti').get();
        const clienti = clientiSnapshot.docs.map(doc => ({
            id: doc.id,
            ragioneSociale: doc.data().ragioneSociale
        })).sort((a, b) => a.ragioneSociale.localeCompare(b.ragioneSociale));

        // Carica contratti del cliente corrente
        const contrattiSnapshot = fattura.clienteId
            ? await db.collection('contratti').where('clienteId', '==', fattura.clienteId).get()
            : { docs: [] };
        const contratti = contrattiSnapshot.docs.map(doc => ({
            id: doc.id,
            numero: doc.data().numeroContratto || 'Senza numero'
        }));

        const content = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem;">
                ${this.createFormField('Cliente', 'clienteId', 'select', fattura.clienteId, {
                    required: true,
                    options: [
                        { value: '', label: '-- Seleziona cliente --' },
                        ...clienti.map(c => ({ value: c.id, label: c.ragioneSociale }))
                    ]
                })}
                ${contratti.length > 0 ? this.createFormField('Contratto', 'contrattoId', 'select', fattura.contrattoId, {
                    options: [
                        { value: '', label: '-- Nessun contratto --' },
                        ...contratti.map(c => ({ value: c.id, label: c.numero }))
                    ]
                }) : ''}
                ${this.createFormField('Numero Fattura', 'numeroFatturaCompleto', 'text', fattura.numeroFatturaCompleto, { required: true })}
                ${this.createFormField('Anno', 'anno', 'number', fattura.anno, { required: true })}
                ${this.createFormField('Data Emissione', 'dataEmissione', 'date', fattura.dataEmissione?.split('T')[0], { required: true })}
                ${this.createFormField('Data Scadenza', 'dataScadenza', 'date', fattura.dataScadenza?.split('T')[0])}
                ${this.createFormField('Data Pagamento', 'dataSaldo', 'date', fattura.dataSaldo?.split('T')[0])}
                ${this.createFormField('Imponibile', 'imponibile', 'number', fattura.imponibile, { required: true })}
                ${this.createFormField('Aliquota IVA (%)', 'aliquotaIva', 'number', fattura.aliquotaIva)}
                ${this.createFormField('Importo IVA', 'importoIva', 'number', fattura.importoIva)}
                ${this.createFormField('Totale Fattura', 'importoTotale', 'number', fattura.importoTotale, { required: true })}
                ${this.createFormField('Stato Pagamento', 'statoPagamento', 'select', fattura.statoPagamento, {
                    options: [
                        { value: 'NON_PAGATA', label: 'Non Pagata' },
                        { value: 'PAGATA', label: 'Pagata' },
                        { value: 'NOTA_CREDITO', label: 'Nota di Credito' },
                        { value: 'RIFIUTATA', label: 'Rifiutata' }
                    ]
                })}
                ${this.createFormField('Tipo', 'tipo', 'text', fattura.tipo)}
                ${this.createFormField('Periodicità', 'periodicita', 'text', fattura.periodicita)}
                ${this.createFormField('Metodo Pagamento', 'metodoPagamento', 'text', fattura.metodoPagamento)}
            </div>
            ${this.createFormField('Note', 'note', 'textarea', fattura.note)}
            ${this.createFormField('Note Consolidate', 'noteConsolidate', 'textarea', fattura.noteConsolidate)}
        `;

        this.showModal(
            `<i class="fas fa-edit"></i> Modifica Fattura`,
            content,
            async () => {
                const data = this.getFormData();
                await DataService.updateFattura(fattura.id, data);
                UI.showSuccess('Fattura aggiornata con successo!');
                DettaglioFattura.render(fattura.id);
            }
        );
    },

    // === FORM NUOVA FATTURA ===
    async showNuovaFattura(clienteId = null) {
        // Carica lista clienti per il selettore
        const clienti = await DataService.getClienti();

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
                            `<option value="${c.id}" data-ragione-sociale="${c.ragioneSociale}" data-id-legacy="${c.clienteIdLegacy || c.id}">${c.ragioneSociale} (${c.provincia || 'N/A'})</option>`
                        ).join('')}
                    </select>
                    <input type="hidden" name="clienteIdLegacy" id="clienteIdLegacy" />
                    <input type="hidden" name="clienteRagioneSociale" id="clienteRagioneSociale" />
                </div>
            `;
        } else {
            // Cliente già selezionato (es. da pagina cliente)
            const cliente = clienti.find(c => c.id === clienteId);
            clienteSelectHtml = `
                ${this.createFormField('Cliente', 'clienteRagioneSociale', 'text', cliente?.ragioneSociale || '', { disabled: true })}
                <input type="hidden" name="clienteId" value="${cliente?.clienteIdLegacy || clienteId}" />
            `;
        }

        const content = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem;">
                ${clienteSelectHtml}
                ${this.createFormField('Numero Fattura', 'numeroFatturaCompleto', 'text', '', { required: true, placeholder: '2026/001' })}
                ${this.createFormField('Anno', 'anno', 'number', new Date().getFullYear(), { required: true })}
                ${this.createFormField('Data Emissione', 'dataEmissione', 'date', new Date().toISOString().split('T')[0], { required: true })}
                ${this.createFormField('Data Scadenza', 'dataScadenza', 'date', '')}
                ${this.createFormField('Imponibile', 'imponibile', 'number', '', { required: true, placeholder: '0.00' })}
                ${this.createFormField('Aliquota IVA (%)', 'aliquotaIva', 'number', '22', { placeholder: '22' })}
                ${this.createFormField('Importo IVA', 'importoIva', 'number', '', { placeholder: '0.00' })}
                ${this.createFormField('Totale Fattura', 'importoTotale', 'number', '', { required: true, placeholder: '0.00' })}
                ${this.createFormField('Stato Pagamento', 'statoPagamento', 'select', 'NON_PAGATA', {
                    options: [
                        { value: 'NON_PAGATA', label: 'Non Pagata' },
                        { value: 'PAGATA', label: 'Pagata' }
                    ]
                })}
                ${this.createFormField('Tipo', 'tipo', 'text', 'VENDITA')}
                ${this.createFormField('Periodicità', 'periodicita', 'text', '')}
                ${this.createFormField('Metodo Pagamento', 'metodoPagamento', 'text', '')}
            </div>
            ${this.createFormField('Note', 'note', 'textarea', '', { placeholder: 'Note aggiuntive...' })}
        `;

        this.showModal(
            `<i class="fas fa-plus"></i> Nuova Fattura`,
            content,
            async () => {
                const data = this.getFormData();
                const newId = await DataService.createFattura(data);
                UI.showSuccess('Fattura creata con successo!');
                DettaglioFattura.render(newId);
            }
        );
    },

    // === FORM MODIFICA SCADENZA ===
    async showModificaScadenza(scadenza) {
        const content = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem;">
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
                ${this.createFormField('Agente', 'agente', 'text', scadenza.agente)}
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
        // Carica lista clienti per il selettore
        const clienti = await DataService.getClienti();

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
                        `<option value="${c.clienteIdLegacy || c.id}" data-ragione-sociale="${c.ragioneSociale}">${c.ragioneSociale} (${c.provincia || 'N/A'})</option>`
                    ).join('')}
                </select>
                <input type="hidden" name="clienteRagioneSociale" id="clienteRagioneSociale" />
            </div>
        `;

        const content = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem;">
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
                ${this.createFormField('Agente', 'agente', 'text', '')}
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
        if (confirm('Confermi di voler marcare questa fattura come pagata?')) {
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

    onClienteSelected() {
        const select = document.getElementById('clienteId');
        const selectedOption = select.options[select.selectedIndex];

        if (selectedOption && selectedOption.value) {
            // Popola i campi hidden con i dati del cliente
            const clienteIdLegacy = selectedOption.getAttribute('data-id-legacy');
            const ragioneSociale = selectedOption.getAttribute('data-ragione-sociale');

            const hiddenLegacyId = document.getElementById('clienteIdLegacy');
            const hiddenRagioneSociale = document.getElementById('clienteRagioneSociale');

            if (hiddenLegacyId) hiddenLegacyId.value = clienteIdLegacy;
            if (hiddenRagioneSociale) hiddenRagioneSociale.value = ragioneSociale;
        }
    },

    // === FORM MODIFICA APP ===
    async showModificaApp(app) {
        // Carica lista clienti per il selettore cliente pagante
        const clienti = await DataService.getClienti();

        const content = `
            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                    📱 Dati App/Comune
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
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
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
                    <div class="form-group">
                        <label>Cliente Pagante</label>
                        <select name="clientePaganteId" class="form-input" onchange="FormsManager.onClientePaganteChange(this.value, ${JSON.stringify(clienti).replace(/"/g, '&quot;')})">
                            <option value="">-- Nessuno (Prospect/Demo) --</option>
                            ${clienti.map(c => `<option value="${c.id}" ${c.id === app.clientePaganteId ? 'selected' : ''}>${c.ragioneSociale}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Agente Commerciale</label>
                        <input
                            type="text"
                            name="agente"
                            id="agenteAppInput"
                            class="form-input"
                            value="${app.agente || ''}"
                            placeholder="${app.clientePaganteId ? 'Preso dal cliente' : 'Inserisci nome agente'}"
                            ${app.clientePaganteId ? 'disabled' : ''}
                        />
                        ${app.clientePaganteId ? `<small style="color: var(--grigio-500); display: block; margin-top: 0.25rem;"><i class="fas fa-info-circle"></i> L'agente viene preso dal cliente associato</small>` : ''}
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
                        options: [
                            { value: '', label: '-- Seleziona Stato --' },
                            { value: 'ATTIVA', label: 'Attiva' },
                            { value: 'IN_SVILUPPO', label: 'In Sviluppo' },
                            { value: 'SOSPESA', label: 'Sospesa' },
                            { value: 'DISATTIVATA', label: 'Disattivata' },
                            { value: 'DEMO', label: 'Demo' }
                        ]
                    })}
                </div>
            </div>

            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                    📅 Pubblicazione Store
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
                    ${this.createFormField('Data Pubblicazione Apple', 'dataPubblicazioneApple', 'date', app.dataPubblicazioneApple?.split('T')[0])}
                    ${this.createFormField('Data Pubblicazione Android', 'dataPubblicazioneAndroid', 'date', app.dataPubblicazioneAndroid?.split('T')[0])}
                    ${this.createFormField('Referente Comune', 'referenteComune', 'text', app.referenteComune)}
                </div>
            </div>

            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                    ⚙️ Funzionalità
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
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

            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                    📊 Metriche
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
                    ${this.createFormField('Numero Downloads', 'numDownloads', 'number', app.numDownloads || 0)}
                    ${this.createFormField('Data Rilevamento Downloads', 'dataRilevamentoDownloads', 'date', app.dataRilevamentoDownloads?.split('T')[0])}
                    ${this.createFormField('Numero Notifiche', 'numNotifiche', 'number', app.numNotifiche || 0)}
                    ${this.createFormField('Data Rilevamento Notifiche', 'dataRilevamentoNotifiche', 'date', app.dataRilevamentoNotifiche?.split('T')[0])}
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

                // Converti checkbox in boolean
                data.hasGruppoTelegram = data.hasGruppoTelegram === 'true';
                data.hasAvvisiFlash = data.hasAvvisiFlash === 'true';

                // Converti numeri
                data.numDownloads = parseInt(data.numDownloads) || 0;
                data.numNotifiche = parseInt(data.numNotifiche) || 0;

                // Se non c'è cliente pagante, rimuovi i campi commerciali
                if (!data.clientePaganteId) {
                    data.clientePaganteId = null;
                    data.tipoPagamento = null;
                    data.gestione = null;
                }
                // Altrimenti usa i valori scelti dall'utente nel form

                await DataService.updateApp(app.id, data);
                UI.showSuccess('App aggiornata con successo!');

                // Ricarica la pagina dettaglio
                DettaglioApp.render(app.id);
            }
        );
    },

    // === FORM NUOVA APP ===
    async showNuovaApp() {
        // Carica lista clienti per il selettore cliente pagante
        const clienti = await DataService.getClienti();

        const content = `
            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                    📱 Dati App/Comune
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
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
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
                    <div class="form-group">
                        <label>Cliente Pagante</label>
                        <select name="clientePaganteId" class="form-input">
                            <option value="">-- Nessuno (Prospect/Demo) --</option>
                            ${clienti.map(c => `<option value="${c.id}">${c.ragioneSociale}</option>`).join('')}
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
                </div>
            </div>

            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                    📅 Pubblicazione Store
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
                    ${this.createFormField('Data Pubblicazione Apple', 'dataPubblicazioneApple', 'date', '')}
                    ${this.createFormField('Data Pubblicazione Android', 'dataPubblicazioneAndroid', 'date', '')}
                    ${this.createFormField('Referente Comune', 'referenteComune', 'text', '', { placeholder: 'Nome e cognome' })}
                </div>
            </div>

            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                    ⚙️ Funzionalità
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
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

            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                    📊 Metriche
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
                    ${this.createFormField('Numero Downloads', 'numDownloads', 'number', '0', { placeholder: '0' })}
                    ${this.createFormField('Data Rilevamento Downloads', 'dataRilevamentoDownloads', 'date', '')}
                    ${this.createFormField('Numero Notifiche', 'numNotifiche', 'number', '0', { placeholder: '0' })}
                    ${this.createFormField('Data Rilevamento Notifiche', 'dataRilevamentoNotifiche', 'date', '')}
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

                // Converti numeri
                data.numDownloads = parseInt(data.numDownloads) || 0;
                data.numNotifiche = parseInt(data.numNotifiche) || 0;

                // Se non c'è cliente pagante, rimuovi i campi commerciali
                if (!data.clientePaganteId) {
                    data.clientePaganteId = null;
                    data.tipoPagamento = null;
                    data.gestione = null;
                }
                // Altrimenti usa i valori scelti dall'utente nel form

                const newId = await DataService.createApp(data);
                UI.showSuccess('App creata con successo!');

                // Ricarica lista app
                if (typeof GestioneApp !== 'undefined' && GestioneApp.render) {
                    GestioneApp.render();
                }
            }
        );
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

        // Genera numero contratto suggerito
        const anno = new Date().getFullYear();
        const contratti = await DataService.getContratti();
        const numeroContratti = contratti.filter(c => c.numeroContratto?.startsWith(`CTR-${anno}`)).length;
        const numeroSuggerito = `CTR-${anno}-${String(numeroContratti + 1).padStart(3, '0')}`;

        const content = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem;">
                ${clienteSelectHtml}
                ${this.createFormField('Numero Contratto', 'numeroContratto', 'text', numeroSuggerito, { required: true, placeholder: 'CTR-2026-001' })}
                ${this.createFormField('Oggetto', 'oggetto', 'text', '', { required: true, placeholder: 'Servizio App Comune' })}
                ${this.createFormField('Tipologia', 'tipologia', 'select', 'SERVIZIO_APP', {
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
                ${this.createFormField('Durata (mesi)', 'durataContratto', 'number', '12', { required: true, placeholder: '12' })}
                ${this.createFormField('Data Scadenza', 'dataScadenza', 'date', '', { required: true })}
                ${this.createFormField('Data Firma', 'dataFirma', 'date', '')}
                ${this.createFormField('Importo Annuale €', 'importoAnnuale', 'number', '', { required: true, placeholder: '0.00' })}
                ${this.createFormField('Importo Mensile €', 'importoMensile', 'number', '', { placeholder: 'Calcolato automaticamente se vuoto' })}
                ${this.createFormField('Periodicità Fatturazione', 'periodicita', 'select', 'ANNUALE', {
                    options: [
                        { value: 'UNA_TANTUM', label: 'Una Tantum' },
                        { value: 'MENSILE', label: 'Mensile' },
                        { value: 'BIMENSILE', label: 'Bimensile' },
                        { value: 'TRIMESTRALE', label: 'Trimestrale' },
                        { value: 'SEMESTRALE', label: 'Semestrale' },
                        { value: 'ANNUALE', label: 'Annuale' },
                        { value: 'BIENNALE', label: 'Biennale' }
                    ]
                })}
                ${this.createFormField('Modalità Pagamento', 'modalitaPagamento', 'select', 'ANTICIPATO', {
                    options: [
                        { value: 'ANTICIPATO', label: 'Anticipato' },
                        { value: 'POSTICIPATO', label: 'Posticipato' },
                        { value: 'MENSILE', label: 'Mensile' }
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
                ${this.createFormField('Giorni Preavviso Rinnovo', 'giorniPreavvisoRinnovo', 'number', '60', { placeholder: '60' })}
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

                // Converti numeri
                data.importoAnnuale = parseFloat(data.importoAnnuale) || 0;
                data.importoMensile = parseFloat(data.importoMensile) || 0;
                data.durataContratto = parseInt(data.durataContratto) || 12;
                data.giorniPreavvisoRinnovo = parseInt(data.giorniPreavvisoRinnovo) || 60;

                // Aggiungi timestamp
                data.dataCreazione = new Date();
                data.dataAggiornamento = new Date();

                const newId = await DataService.createContratto(data);
                UI.showSuccess('Contratto creato con successo!');

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
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem;">
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
                ${this.createFormField('Importo Annuale €', 'importoAnnuale', 'number', contratto.importoAnnuale, { required: true })}
                ${this.createFormField('Importo Mensile €', 'importoMensile', 'number', contratto.importoMensile)}
                ${this.createFormField('Periodicità Fatturazione', 'periodicita', 'select', contratto.periodicita, {
                    options: [
                        { value: 'UNA_TANTUM', label: 'Una Tantum' },
                        { value: 'MENSILE', label: 'Mensile' },
                        { value: 'BIMENSILE', label: 'Bimensile' },
                        { value: 'TRIMESTRALE', label: 'Trimestrale' },
                        { value: 'SEMESTRALE', label: 'Semestrale' },
                        { value: 'ANNUALE', label: 'Annuale' },
                        { value: 'BIENNALE', label: 'Biennale' }
                    ]
                })}
                ${this.createFormField('Modalità Pagamento', 'modalitaPagamento', 'select', contratto.modalitaPagamento, {
                    options: [
                        { value: 'ANTICIPATO', label: 'Anticipato' },
                        { value: 'POSTICIPATO', label: 'Posticipato' },
                        { value: 'MENSILE', label: 'Mensile' }
                    ]
                })}
                ${this.createFormField('Stato', 'stato', 'select', contratto.stato, {
                    required: true,
                    options: [
                        { value: 'ATTIVO', label: 'Attivo' },
                        { value: 'SCADUTO', label: 'Scaduto' },
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

                // Converti numeri
                data.importoAnnuale = parseFloat(data.importoAnnuale) || 0;
                data.importoMensile = parseFloat(data.importoMensile) || 0;
                data.durataContratto = parseInt(data.durataContratto) || 12;
                data.giorniPreavvisoRinnovo = parseInt(data.giorniPreavvisoRinnovo) || 60;

                // Aggiungi timestamp aggiornamento
                data.dataAggiornamento = new Date();

                await DataService.updateContratto(contrattoId, data);
                UI.showSuccess('Contratto aggiornato con successo!');

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

        // Calcola nuova data scadenza (1 anno dalla scadenza attuale o da oggi)
        const dataBase = contratto.dataScadenza ? new Date(contratto.dataScadenza) : new Date();
        const nuovaScadenza = new Date(dataBase);
        nuovaScadenza.setFullYear(nuovaScadenza.getFullYear() + 1);

        const content = `
            <div class="alert alert-info" style="background: var(--azzurro-info); padding: 1rem; margin-bottom: 1.5rem; border-radius: 8px; border-left: 4px solid #0288D1;">
                <p style="margin: 0; color: var(--grigio-700);">
                    <strong><i class="fas fa-info-circle"></i> Rinnovo Contratto</strong><br>
                    Il rinnovo prolungherà il contratto di 1 anno. Puoi modificare gli importi se necessario.
                </p>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem;">
                ${this.createFormField('Cliente', 'clienteDisplay', 'text', cliente?.ragioneSociale || 'Sconosciuto', { disabled: true })}
                ${this.createFormField('Contratto Originale', 'contrattoOriginale', 'text', contratto.numeroContratto, { disabled: true })}
                ${this.createFormField('Nuova Data Scadenza', 'nuovaDataScadenza', 'date', nuovaScadenza.toISOString().split('T')[0], { required: true })}
                ${this.createFormField('Importo Annuale €', 'nuovoImportoAnnuale', 'number', contratto.importoAnnuale, { required: true })}
                ${this.createFormField('Importo Mensile €', 'nuovoImportoMensile', 'number', contratto.importoMensile)}
            </div>
            ${this.createFormField('Note Rinnovo', 'noteRinnovo', 'textarea', '', { placeholder: 'Note sul rinnovo...' })}
        `;

        this.showModal(
            `<i class="fas fa-sync-alt"></i> Rinnova Contratto`,
            content,
            async () => {
                const data = this.getFormData();

                // Prepara dati aggiornamento
                const updateData = {
                    dataScadenza: data.nuovaDataScadenza,
                    importoAnnuale: parseFloat(data.nuovoImportoAnnuale) || contratto.importoAnnuale,
                    importoMensile: parseFloat(data.nuovoImportoMensile) || contratto.importoMensile,
                    stato: 'ATTIVO',
                    dataAggiornamento: new Date()
                };

                // Aggiungi note rinnovo alle note esistenti
                if (data.noteRinnovo) {
                    const notaRinnovo = `\n\n--- RINNOVO ${new Date().toLocaleDateString()} ---\n${data.noteRinnovo}`;
                    updateData.note = (contratto.note || '') + notaRinnovo;
                }

                // Usa il metodo dedicato che crea anche la scadenza
                await DataService.rinnovaContratto(
                    contrattoId,
                    data.nuovaDataScadenza,
                    data.noteRinnovo
                );

                // Aggiorna anche importi se cambiati
                if (updateData.importoAnnuale !== contratto.importoAnnuale ||
                    updateData.importoMensile !== contratto.importoMensile) {
                    await DataService.updateContratto(contrattoId, updateData);
                }

                UI.showSuccess('Contratto rinnovato con successo!');

                // Ricarica dettaglio
                DettaglioContratto.render(contrattoId);
            }
        );
    },

    // Gestisce il cambio del cliente pagante nel form app
    onClientePaganteChange(clienteId, clientiJSON) {
        const agenteInput = document.getElementById('agenteAppInput');
        if (!agenteInput) return;

        try {
            // Parse clienti dalla stringa JSON
            const clienti = JSON.parse(clientiJSON.replace(/&quot;/g, '"'));

            if (clienteId) {
                // Cliente selezionato → prendi agente dal cliente
                const cliente = clienti.find(c => c.id === clienteId);
                if (cliente && cliente.agente) {
                    agenteInput.value = cliente.agente;
                    agenteInput.placeholder = 'Preso dal cliente';
                    agenteInput.disabled = true;

                    // Mostra messaggio informativo
                    let infoMessage = agenteInput.nextElementSibling;
                    if (!infoMessage || !infoMessage.classList.contains('agente-info')) {
                        infoMessage = document.createElement('small');
                        infoMessage.className = 'agente-info';
                        infoMessage.style.cssText = 'color: var(--grigio-500); display: block; margin-top: 0.25rem;';
                        agenteInput.parentNode.appendChild(infoMessage);
                    }
                    infoMessage.innerHTML = '<i class="fas fa-info-circle"></i> L\'agente viene preso dal cliente associato';
                } else {
                    // Cliente senza agente
                    agenteInput.value = '';
                    agenteInput.placeholder = 'Cliente senza agente';
                    agenteInput.disabled = true;
                }
            } else {
                // Nessun cliente → campo manuale
                agenteInput.placeholder = 'Inserisci nome agente';
                agenteInput.disabled = false;

                // Rimuovi messaggio informativo
                const infoMessage = agenteInput.parentNode.querySelector('.agente-info');
                if (infoMessage) {
                    infoMessage.remove();
                }
            }
        } catch (error) {
            console.error('Errore parsing clienti:', error);
        }
    }
};

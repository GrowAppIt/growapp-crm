/**
 * Officina Digitale — Attività (Task Management leggero)
 * Vista Kanban + Lista con drag&drop, notifiche integrate, discussioni.
 * Modulo lazy-loaded.
 */

const OdAttivita = (() => {
    // =========================================================================
    // STATE
    // =========================================================================
    const COL = OfficinaDigitale.COLLECTIONS.ATTIVITA;
    let _attivita = [];
    let _currentAttivita = null;
    let _viewMode = 'kanban'; // kanban | lista
    let _filtri = { assegnato: 'tutti', prodotto: 'tutti', priorita: 'tutti', scadenza: 'tutti' };
    let _utenti = [];
    let _prodotti = [];
    let _componenti = [];
    let _dragData = null;

    const STATI = [
        { value: 'Da Fare', icon: 'fa-inbox', color: '#9E9E9E' },
        { value: 'In Corso', icon: 'fa-spinner', color: '#2196F3' },
        { value: 'In Revisione', icon: 'fa-search', color: '#FF9800' },
        { value: 'Fatto', icon: 'fa-check-circle', color: '#4CAF50' }
    ];

    const PRIORITA = [
        { value: 'Bassa', color: '#9E9E9E' },
        { value: 'Media', color: '#FF9800' },
        { value: 'Alta', color: '#F44336' },
        { value: 'Urgente', color: '#D32F2F' }
    ];

    // =========================================================================
    // RENDER PRINCIPALE
    // =========================================================================

    async function render() {
        const container = document.getElementById('mainContent');
        container.innerHTML = `
        <div class="od-container">
            <div class="od-header">
                <div class="od-header-left">
                    <button class="od-back-btn" onclick="OfficinaDigitale.render()">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <div class="od-header-icon" style="background: linear-gradient(135deg, var(--blu-700), var(--blu-500));">
                        <i class="fas fa-clipboard-check"></i>
                    </div>
                    <div>
                        <h1 class="od-title">Attività</h1>
                        <p class="od-subtitle">Coordinamento sviluppo — chi fa cosa, entro quando</p>
                    </div>
                </div>
                <div class="od-header-actions">
                    ${OfficinaDigitale.can('attivita.create') ? `
                    <button class="btn btn-primary" onclick="OdAttivita.showCreaAttivita()" style="border-radius:10px; font-size:0.8125rem;">
                        <i class="fas fa-plus"></i> Nuova Attività
                    </button>` : ''}
                </div>
            </div>

            <!-- Toolbar -->
            <div class="od-toolbar">
                <div class="od-filters">
                    <select id="odaFiltroAssegnato" class="od-select" onchange="OdAttivita._applyFilters()">
                        <option value="tutti">Tutti gli assegnatari</option>
                    </select>
                    <select id="odaFiltroPriorita" class="od-select" onchange="OdAttivita._applyFilters()">
                        <option value="tutti">Tutte le priorità</option>
                        ${PRIORITA.map(p => `<option value="${p.value}">${p.value}</option>`).join('')}
                    </select>
                    <select id="odaFiltroScadenza" class="od-select" onchange="OdAttivita._applyFilters()">
                        <option value="tutti">Tutte le scadenze</option>
                        <option value="scadute">Scadute</option>
                        <option value="settimana">Questa settimana</option>
                        <option value="mese">Questo mese</option>
                    </select>
                </div>
                <div class="od-view-toggle">
                    <button class="od-view-btn ${_viewMode === 'kanban' ? 'active' : ''}" onclick="OdAttivita._setView('kanban')" title="Kanban">
                        <i class="fas fa-columns"></i>
                    </button>
                    <button class="od-view-btn ${_viewMode === 'lista' ? 'active' : ''}" onclick="OdAttivita._setView('lista')" title="Lista">
                        <i class="fas fa-list"></i>
                    </button>
                </div>
            </div>

            <!-- Contenuto -->
            <div id="oda-container">
                <div class="loading-spinner" style="margin:2rem auto;"></div>
            </div>
        </div>`;

        _addAttivitaStyles();
        await _loadData();
    }

    async function _loadData() {
        try {
            const [attSnap, utSnap] = await Promise.all([
                db.collection(COL).orderBy('creatoIl', 'desc').get(),
                db.collection('utenti').where('stato', '==', 'ATTIVO').get()
            ]);

            _attivita = attSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            _utenti = utSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Popola filtro assegnatari
            const select = document.getElementById('odaFiltroAssegnato');
            if (select) {
                _utenti.forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = u.id;
                    opt.textContent = `${u.nome || ''} ${u.cognome || ''}`.trim();
                    select.appendChild(opt);
                });
                // Opzione "Le mie"
                const myOpt = document.createElement('option');
                myOpt.value = 'mie';
                myOpt.textContent = '★ Le mie attività';
                select.insertBefore(myOpt, select.options[1]);
            }

            _renderView();
        } catch (error) {
            console.error('[OdAttivita] Errore caricamento:', error);
            document.getElementById('oda-container').innerHTML = `
                <div class="od-empty-state"><i class="fas fa-exclamation-circle"></i><p>Errore nel caricamento.</p></div>`;
        }
    }

    function _getFilteredAttivita() {
        let filtered = [..._attivita];
        const oggi = new Date(); oggi.setHours(0, 0, 0, 0);

        const assegnato = document.getElementById('odaFiltroAssegnato')?.value || 'tutti';
        if (assegnato === 'mie') {
            filtered = filtered.filter(a => a.assegnatoA === AuthService.currentUser?.uid);
        } else if (assegnato !== 'tutti') {
            filtered = filtered.filter(a => a.assegnatoA === assegnato);
        }

        const priorita = document.getElementById('odaFiltroPriorita')?.value || 'tutti';
        if (priorita !== 'tutti') filtered = filtered.filter(a => a.priorita === priorita);

        const scadenza = document.getElementById('odaFiltroScadenza')?.value || 'tutti';
        if (scadenza === 'scadute') {
            filtered = filtered.filter(a => {
                if (a.stato === 'Fatto') return false;
                const d = a.scadenza?.toDate ? a.scadenza.toDate() : null;
                return d && d < oggi;
            });
        } else if (scadenza === 'settimana') {
            const fine = new Date(oggi); fine.setDate(fine.getDate() + 7);
            filtered = filtered.filter(a => {
                const d = a.scadenza?.toDate ? a.scadenza.toDate() : null;
                return d && d >= oggi && d <= fine;
            });
        } else if (scadenza === 'mese') {
            const fine = new Date(oggi); fine.setMonth(fine.getMonth() + 1);
            filtered = filtered.filter(a => {
                const d = a.scadenza?.toDate ? a.scadenza.toDate() : null;
                return d && d >= oggi && d <= fine;
            });
        }

        return filtered;
    }

    function _renderView() {
        if (_viewMode === 'kanban') _renderKanban();
        else _renderLista();
    }

    // =========================================================================
    // VISTA KANBAN
    // =========================================================================

    function _renderKanban() {
        const container = document.getElementById('oda-container');
        if (!container) return;
        const filtered = _getFilteredAttivita();

        container.innerHTML = `
        <div class="oda-kanban">
            ${STATI.map(stato => {
                const cards = filtered.filter(a => (a.stato || 'Da Fare') === stato.value);
                return `
                <div class="oda-kanban-col" data-stato="${stato.value}"
                    ondragover="event.preventDefault(); this.classList.add('oda-dragover');"
                    ondragleave="this.classList.remove('oda-dragover');"
                    ondrop="OdAttivita._onDrop(event, '${stato.value}'); this.classList.remove('oda-dragover');">
                    <div class="oda-kanban-col-header">
                        <span class="oda-kanban-col-dot" style="background:${stato.color};"></span>
                        <span class="oda-kanban-col-title">${stato.value}</span>
                        <span class="oda-kanban-col-count">${cards.length}</span>
                    </div>
                    <div class="oda-kanban-col-body">
                        ${cards.map(a => _renderKanbanCard(a)).join('')}
                        ${cards.length === 0 ? '<div class="oda-kanban-empty">Nessuna attività</div>' : ''}
                    </div>
                </div>`;
            }).join('')}
        </div>`;
    }

    function _renderKanbanCard(a) {
        const prObj = PRIORITA.find(p => p.value === a.priorita) || PRIORITA[1];
        const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
        const scadDate = a.scadenza?.toDate ? a.scadenza.toDate() : null;
        const isScaduta = scadDate && scadDate < oggi && a.stato !== 'Fatto';
        const scadStr = scadDate ? scadDate.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) : '';

        return `
        <div class="oda-kanban-card" draggable="true"
            ondragstart="OdAttivita._onDragStart(event, '${a.id}')"
            onclick="OdAttivita.renderDettaglio('${a.id}')">
            <div class="oda-kanban-card-top">
                <span class="od-priority-dot od-priority-${a.priorita?.toLowerCase() || 'media'}"></span>
                <span class="oda-kanban-card-priority" style="color:${prObj.color};">${a.priorita || 'Media'}</span>
            </div>
            <div class="oda-kanban-card-title">${OfficinaDigitale.escHtml(a.titolo || 'Senza titolo')}</div>
            <div class="oda-kanban-card-footer">
                ${a.assegnatoA_nome ? `<span class="oda-assignee"><i class="fas fa-user"></i> ${OfficinaDigitale.escHtml(a.assegnatoA_nome)}</span>` : ''}
                ${scadStr ? `<span class="oda-due ${isScaduta ? 'oda-due-overdue' : ''}"><i class="fas fa-calendar"></i> ${scadStr}</span>` : ''}
            </div>
            ${a.prodottoNome || a.componenteNome ? `<div class="oda-kanban-card-link"><i class="fas fa-link"></i> ${OfficinaDigitale.escHtml(a.prodottoNome || a.componenteNome || '')}</div>` : ''}
        </div>`;
    }

    // Drag & Drop
    function _onDragStart(e, id) {
        _dragData = id;
        e.dataTransfer.effectAllowed = 'move';
        e.target.classList.add('oda-dragging');
    }

    async function _onDrop(e, nuovoStato) {
        e.preventDefault();
        if (!_dragData) return;

        const attId = _dragData;
        _dragData = null;

        // Verifica permessi: se non admin/CTO, solo le proprie
        const att = _attivita.find(a => a.id === attId);
        if (!att) return;

        const canChangeAny = OfficinaDigitale.can('attivita.assign');
        const isOwn = att.assegnatoA === AuthService.currentUser?.uid || att.creatoDa === AuthService.currentUser?.uid;

        if (!canChangeAny && !isOwn) {
            UI.showError('Puoi modificare solo le tue attività');
            return;
        }

        try {
            await db.collection(COL).doc(attId).update({
                stato: nuovoStato,
                aggiornatoIl: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Aggiorna localmente
            const idx = _attivita.findIndex(a => a.id === attId);
            if (idx >= 0) _attivita[idx].stato = nuovoStato;

            _renderKanban();
            UI.showNotification(`Attività spostata in "${nuovoStato}"`, 'success');

            // Notifica al creatore se un dev sposta in "In Revisione"
            if (nuovoStato === 'In Revisione' && att.creatoDa && att.creatoDa !== AuthService.currentUser?.uid) {
                NotificationService.createNotification({
                    userId: att.creatoDa,
                    type: 'task_status_changed',
                    title: 'Attività in revisione',
                    message: `"${att.titolo}" è pronta per la revisione`,
                    taskId: attId
                });
            }
        } catch (error) {
            console.error('[OdAttivita] Errore cambio stato:', error);
            UI.showError('Errore nel cambio stato');
        }
    }

    // =========================================================================
    // VISTA LISTA
    // =========================================================================

    function _renderLista() {
        const container = document.getElementById('oda-container');
        if (!container) return;
        const filtered = _getFilteredAttivita();

        // Ordina per priorità (Urgente > Alta > Media > Bassa), poi per scadenza
        const priOrd = { 'Urgente': 0, 'Alta': 1, 'Media': 2, 'Bassa': 3 };
        filtered.sort((a, b) => {
            const pa = priOrd[a.priorita] ?? 2;
            const pb = priOrd[b.priorita] ?? 2;
            if (pa !== pb) return pa - pb;
            const da = a.scadenza?.toDate?.() || new Date('2099-01-01');
            const db2 = b.scadenza?.toDate?.() || new Date('2099-01-01');
            return da - db2;
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="od-empty-state" style="padding:3rem;">
                    <i class="fas fa-clipboard-check" style="font-size:3rem; opacity:0.3;"></i>
                    <h3>Nessuna attività</h3>
                </div>`;
            return;
        }

        const oggi = new Date(); oggi.setHours(0, 0, 0, 0);

        container.innerHTML = `
        <div class="oda-list">
            <div class="oda-list-header">
                <span style="flex:2.5;">Titolo</span>
                <span style="flex:1;">Stato</span>
                <span style="flex:1;">Priorità</span>
                <span style="flex:1.2;">Assegnato</span>
                <span style="flex:0.8;">Scadenza</span>
            </div>
            ${filtered.map(a => {
                const stObj = STATI.find(s => s.value === a.stato) || STATI[0];
                const prObj = PRIORITA.find(p => p.value === a.priorita) || PRIORITA[1];
                const scadDate = a.scadenza?.toDate ? a.scadenza.toDate() : null;
                const isScaduta = scadDate && scadDate < oggi && a.stato !== 'Fatto';
                const scadStr = scadDate ? scadDate.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) : '—';

                return `
                <div class="oda-list-row" onclick="OdAttivita.renderDettaglio('${a.id}')">
                    <span style="flex:2.5;" class="oda-list-title">
                        <span class="od-priority-dot od-priority-${(a.priorita || 'media').toLowerCase()}"></span>
                        ${OfficinaDigitale.escHtml(a.titolo || 'Senza titolo')}
                    </span>
                    <span style="flex:1;">
                        <span class="od-stato-badge od-stato-${(a.stato || 'Da Fare').replace(/\s/g, '-').toLowerCase()}">${a.stato || 'Da Fare'}</span>
                    </span>
                    <span style="flex:1; color:${prObj.color}; font-weight:600; font-size:0.75rem;">${a.priorita || 'Media'}</span>
                    <span style="flex:1.2; font-size:0.75rem; color:var(--grigio-700);">${a.assegnatoA_nome || '—'}</span>
                    <span style="flex:0.8; font-size:0.75rem;" class="${isScaduta ? 'oda-due-overdue' : ''}">${scadStr}</span>
                </div>`;
            }).join('')}
        </div>`;
    }

    // =========================================================================
    // DETTAGLIO ATTIVITA
    // =========================================================================

    async function renderDettaglio(attivitaId) {
        const container = document.getElementById('mainContent');
        container.innerHTML = '<div class="loading-spinner" style="margin:3rem auto;"></div>';

        try {
            const doc = await db.collection(COL).doc(attivitaId).get();
            if (!doc.exists) { UI.showError('Attività non trovata'); render(); return; }
            _currentAttivita = { id: doc.id, ...doc.data() };
            _renderDettaglioHTML();
        } catch (error) {
            console.error('[OdAttivita] Errore dettaglio:', error);
            UI.showError('Errore nel caricamento');
        }
    }

    function _renderDettaglioHTML() {
        const a = _currentAttivita;
        if (!a) return;

        const stObj = STATI.find(s => s.value === a.stato) || STATI[0];
        const prObj = PRIORITA.find(p => p.value === a.priorita) || PRIORITA[1];
        const canEdit = OfficinaDigitale.can('attivita.assign') || a.assegnatoA === AuthService.currentUser?.uid || a.creatoDa === AuthService.currentUser?.uid;
        const scadDate = a.scadenza?.toDate ? a.scadenza.toDate() : null;
        const container = document.getElementById('mainContent');

        container.innerHTML = `
        <div class="od-container">
            <div class="od-det-header">
                <button class="od-back-btn" onclick="OdAttivita.render()"><i class="fas fa-arrow-left"></i></button>
                <div class="od-det-header-info" style="flex:1;">
                    <h1 class="od-title" style="margin:0;">${OfficinaDigitale.escHtml(a.titolo)}</h1>
                    <div style="display:flex; gap:0.5rem; align-items:center; margin-top:6px; flex-wrap:wrap;">
                        <span class="od-stato-badge-lg" style="background:${stObj.color}; color:#fff;"><i class="fas ${stObj.icon}"></i> ${a.stato || 'Da Fare'}</span>
                        <span style="color:${prObj.color}; font-weight:700; font-size:0.8125rem;"><i class="fas fa-flag"></i> ${a.priorita || 'Media'}</span>
                        ${scadDate ? `<span style="font-size:0.8125rem; color:var(--grigio-500);"><i class="fas fa-calendar"></i> ${scadDate.toLocaleDateString('it-IT')}</span>` : ''}
                    </div>
                </div>
                ${canEdit ? `
                <button class="btn btn-secondary" onclick="OdAttivita._editAttivita()" style="border-radius:10px; font-size:0.8125rem;">
                    <i class="fas fa-pen"></i> Modifica
                </button>` : ''}
            </div>

            <div class="od-detail-grid">
                <!-- Colonna principale -->
                <div class="od-detail-card">
                    <h4 class="od-detail-card-title"><i class="fas fa-align-left"></i> Descrizione</h4>
                    <div class="od-detail-content">
                        ${a.descrizione ? `<div class="od-rich-text">${a.descrizione}</div>` : '<p class="od-empty-text">Nessuna descrizione</p>'}
                    </div>
                </div>

                <!-- Info laterali -->
                <div class="od-detail-card">
                    <h4 class="od-detail-card-title"><i class="fas fa-info-circle"></i> Dettagli</h4>
                    <div class="od-detail-fields">
                        <div class="od-field-row">
                            <span class="od-field-label">Assegnato a</span>
                            <span class="od-field-value">${a.assegnatoA_nome || '<em>Non assegnato</em>'}</span>
                        </div>
                        <div class="od-field-row">
                            <span class="od-field-label">Creato da</span>
                            <span class="od-field-value">${a.creatoDaNome || '—'}</span>
                        </div>
                        <div class="od-field-row">
                            <span class="od-field-label">Scadenza</span>
                            <span class="od-field-value">${scadDate ? scadDate.toLocaleDateString('it-IT') : '—'}</span>
                        </div>
                        ${a.prodottoNome ? `
                        <div class="od-field-row">
                            <span class="od-field-label">Prodotto</span>
                            <span class="od-field-value"><a href="javascript:void(0)" onclick="OfficinaDigitale.navigateTo('dettaglio-prodotto','${a.prodottoId}')" class="od-link">${OfficinaDigitale.escHtml(a.prodottoNome)}</a></span>
                        </div>` : ''}
                        ${a.componenteNome ? `
                        <div class="od-field-row">
                            <span class="od-field-label">Componente</span>
                            <span class="od-field-value"><a href="javascript:void(0)" onclick="OfficinaDigitale.navigateTo('dettaglio-componente','${a.componenteId}')" class="od-link">${OfficinaDigitale.escHtml(a.componenteNome)}</a></span>
                        </div>` : ''}
                        ${a.comuneNome ? `
                        <div class="od-field-row">
                            <span class="od-field-label">Comune</span>
                            <span class="od-field-value"><a href="javascript:void(0)" onclick="UI.showPage('dettaglio-cliente','${a.comuneId}')" class="od-link">${OfficinaDigitale.escHtml(a.comuneNome)}</a></span>
                        </div>` : ''}
                        <div class="od-field-row">
                            <span class="od-field-label"><i class="fab fa-github" style="margin-right:4px;"></i>GitHub Issue</span>
                            <span class="od-field-value">${a.githubIssueUrl
                                ? `<a href="${a.githubIssueUrl}" target="_blank" class="od-link">${OfficinaDigitale.escHtml(a.githubIssueUrl.replace(/.*\/issues\//, '#'))} <i class="fas fa-external-link-alt"></i></a>`
                                : `<button class="btn btn-sm" onclick="OdAttivita._linkGithubIssue()" style="font-size:0.7rem;border-radius:6px;padding:2px 8px;">
                                    <i class="fab fa-github"></i> Collega Issue
                                </button>`
                            }</span>
                        </div>
                    </div>

                    <!-- Cambio stato rapido -->
                    ${canEdit ? `
                    <div style="margin-top:1rem; padding-top:0.75rem; border-top:1px solid var(--grigio-100);">
                        <label style="font-size:0.75rem; font-weight:600; color:var(--grigio-500); display:block; margin-bottom:0.375rem;">Cambia Stato</label>
                        <div style="display:flex; gap:4px; flex-wrap:wrap;">
                            ${STATI.map(s => `
                                <button class="btn btn-sm" onclick="OdAttivita._cambiaStato('${s.value}')"
                                    style="border-radius:8px; font-size:0.6875rem; ${a.stato === s.value ? `background:${s.color}; color:#fff; border-color:${s.color};` : ''}">
                                    <i class="fas ${s.icon}"></i> ${s.value}
                                </button>
                            `).join('')}
                        </div>
                    </div>` : ''}
                </div>
            </div>

            <!-- Discussione (riutilizza pattern esistente) -->
            <div class="od-detail-card" style="margin-top:1rem;">
                <h4 class="od-detail-card-title"><i class="fas fa-comments"></i> Discussione</h4>
                <div id="oda-discussione-container">
                    <div class="loading-spinner" style="margin:1rem auto;"></div>
                </div>
            </div>
        </div>`;

        _addAttivitaStyles();
        _loadDiscussione();
    }

    async function _cambiaStato(nuovoStato) {
        if (!_currentAttivita) return;
        try {
            await db.collection(COL).doc(_currentAttivita.id).update({
                stato: nuovoStato,
                aggiornatoIl: firebase.firestore.FieldValue.serverTimestamp()
            });
            _currentAttivita.stato = nuovoStato;

            // Aggiorna nella lista locale
            const idx = _attivita.findIndex(a => a.id === _currentAttivita.id);
            if (idx >= 0) _attivita[idx].stato = nuovoStato;

            _renderDettaglioHTML();
            UI.showNotification(`Stato aggiornato: ${nuovoStato}`, 'success');

            // Notifica
            if (nuovoStato === 'In Revisione' && _currentAttivita.creatoDa && _currentAttivita.creatoDa !== AuthService.currentUser?.uid) {
                NotificationService.createNotification({
                    userId: _currentAttivita.creatoDa,
                    type: 'task_status_changed',
                    title: 'Attività in revisione',
                    message: `"${_currentAttivita.titolo}" è pronta per la revisione`,
                    taskId: _currentAttivita.id
                });
            }
        } catch (error) {
            UI.showError('Errore nel cambio stato');
        }
    }

    // =========================================================================
    // DISCUSSIONE (riutilizza pattern CRM)
    // =========================================================================

    async function _loadDiscussione() {
        const container = document.getElementById('oda-discussione-container');
        if (!container || !_currentAttivita) return;

        try {
            const snap = await db.collection('commenti')
                .where('taskId', '==', `od_${_currentAttivita.id}`)
                .orderBy('creatoIl', 'asc')
                .get();

            const commenti = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const utente = AuthService.getUtenteCorrente();

            container.innerHTML = `
            <div class="oda-commenti">
                ${commenti.map(c => {
                    const dataStr = c.creatoIl?.toDate ? c.creatoIl.toDate().toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
                    const isMine = c.autoreId === AuthService.currentUser?.uid;
                    return `
                    <div class="oda-commento ${isMine ? 'oda-commento-mine' : ''}">
                        <div class="oda-commento-header">
                            <strong>${OfficinaDigitale.escHtml(c.autoreNome || 'Utente')}</strong>
                            <span>${dataStr}</span>
                        </div>
                        <div class="oda-commento-body">${OfficinaDigitale.escHtml(c.testo)}</div>
                    </div>`;
                }).join('')}
                ${commenti.length === 0 ? '<p class="od-empty-text" style="padding:0.5rem;">Nessun commento ancora. Scrivi per primo!</p>' : ''}
            </div>

            <!-- Form nuovo commento -->
            <div class="oda-commento-form">
                <textarea id="odaCommentoText" rows="2" class="od-input" placeholder="Scrivi un commento..." style="resize:none;"></textarea>
                <button class="btn btn-primary" onclick="OdAttivita._inviaCommento()" style="border-radius:10px; font-size:0.8125rem; align-self:flex-end;">
                    <i class="fas fa-paper-plane"></i> Invia
                </button>
            </div>`;
        } catch (error) {
            console.warn('[OdAttivita] Errore discussione (index mancante?):', error);
            container.innerHTML = '<p class="od-empty-text">Discussione non disponibile. Potrebbe servire un indice Firestore.</p>';
        }
    }

    async function _inviaCommento() {
        const text = document.getElementById('odaCommentoText')?.value.trim();
        if (!text) return;

        const utente = AuthService.getUtenteCorrente();
        try {
            await db.collection('commenti').add({
                taskId: `od_${_currentAttivita.id}`,
                testo: text,
                autoreId: utente?.uid || '',
                autoreNome: utente ? `${utente.nome} ${utente.cognome}` : '',
                creatoIl: firebase.firestore.FieldValue.serverTimestamp()
            });

            document.getElementById('odaCommentoText').value = '';
            _loadDiscussione();

            // Notifica all'assegnatario se il commento viene da un altro utente
            if (_currentAttivita.assegnatoA && _currentAttivita.assegnatoA !== utente?.uid) {
                NotificationService.createNotification({
                    userId: _currentAttivita.assegnatoA,
                    type: 'new_comment',
                    title: 'Nuovo commento',
                    message: `Commento su "${_currentAttivita.titolo}"`,
                    taskId: _currentAttivita.id
                });
            }
        } catch (error) {
            UI.showError('Errore nell\'invio del commento');
        }
    }

    // =========================================================================
    // CREAZIONE / MODIFICA
    // =========================================================================

    function showCreaAttivita(precompile) {
        _showAttivitaModal(null, precompile);
    }

    function _editAttivita() {
        _showAttivitaModal(_currentAttivita);
    }

    function _showAttivitaModal(attivita, precompile) {
        const isEdit = !!attivita;
        const a = attivita || {};
        const pre = precompile || {};
        const canAssign = OfficinaDigitale.can('attivita.assign');
        const scadStr = a.scadenza?.toDate ? a.scadenza.toDate().toISOString().split('T')[0] : '';

        const overlay = document.createElement('div');
        overlay.className = 'od-modal-overlay';
        overlay.id = 'odModalOverlay';
        overlay.innerHTML = `
        <div class="od-modal">
            <div class="od-modal-header">
                <h2><i class="fas fa-${isEdit ? 'pen' : 'plus'}"></i> ${isEdit ? 'Modifica' : 'Nuova'} Attività</h2>
                <button class="od-modal-close" onclick="OdAttivita._closeModal()"><i class="fas fa-times"></i></button>
            </div>
            <div class="od-modal-body">
                <div class="od-form-grid">
                    <div class="od-form-group od-form-full">
                        <label>Titolo *</label>
                        <input type="text" id="odaTitolo" value="${OfficinaDigitale.escHtml(a.titolo || '')}" required placeholder="es. Integrare widget meteo per Cefalù" class="od-input">
                    </div>
                    <div class="od-form-group od-form-full">
                        <label>Descrizione</label>
                        <textarea id="odaDescrizione" rows="3" class="od-input" placeholder="Dettagli, specifiche, link utili...">${a.descrizione || ''}</textarea>
                    </div>
                    <div class="od-form-group">
                        <label>Stato</label>
                        <select id="odaStato" class="od-input">
                            ${STATI.map(s => `<option value="${s.value}" ${a.stato === s.value ? 'selected' : ''}>${s.value}</option>`).join('')}
                        </select>
                    </div>
                    <div class="od-form-group">
                        <label>Priorità</label>
                        <select id="odaPriorita" class="od-input">
                            ${PRIORITA.map(p => `<option value="${p.value}" ${(a.priorita || 'Media') === p.value ? 'selected' : ''}>${p.value}</option>`).join('')}
                        </select>
                    </div>
                    <div class="od-form-group">
                        <label>Scadenza</label>
                        <input type="date" id="odaScadenza" value="${scadStr}" class="od-input">
                    </div>
                    <div class="od-form-group">
                        <label>Assegnato a ${!canAssign ? '<small>(solo admin/CTO)</small>' : ''}</label>
                        <select id="odaAssegnato" class="od-input" ${!canAssign ? 'disabled' : ''}>
                            <option value="">Non assegnato</option>
                            ${_utenti.map(u => `<option value="${u.id}" data-nome="${u.nome || ''} ${u.cognome || ''}" ${a.assegnatoA === u.id ? 'selected' : ''}>${u.nome || ''} ${u.cognome || ''}</option>`).join('')}
                        </select>
                    </div>
                    <div class="od-form-group">
                        <label>Comune collegato</label>
                        <select id="odaComune" class="od-input">
                            <option value="">Nessuno</option>
                        </select>
                    </div>
                    <div class="od-form-group">
                        <label><i class="fab fa-github"></i> GitHub Issue URL</label>
                        <input type="url" id="odaGithubIssue" class="od-input" value="${a.githubIssueUrl || ''}" placeholder="https://github.com/owner/repo/issues/42">
                    </div>
                </div>
            </div>
            <div class="od-modal-footer">
                <button class="btn btn-secondary" onclick="OdAttivita._closeModal()" style="border-radius:10px;">Annulla</button>
                <button class="btn btn-primary" onclick="OdAttivita._saveAttivita('${a.id || ''}')" style="border-radius:10px;">
                    <i class="fas fa-save"></i> ${isEdit ? 'Salva' : 'Crea'}
                </button>
            </div>
        </div>`;

        document.body.appendChild(overlay);
        setTimeout(() => overlay.classList.add('visible'), 10);

        // Carica comuni
        db.collection('clienti').orderBy('ragioneSociale', 'asc').get().then(snap => {
            const sel = document.getElementById('odaComune');
            if (!sel) return;
            snap.forEach(doc => {
                const d = doc.data();
                const opt = document.createElement('option');
                opt.value = doc.id;
                opt.textContent = d.ragioneSociale || d.nome || doc.id;
                opt.dataset.nome = d.ragioneSociale || d.nome || '';
                if (a.comuneId === doc.id) opt.selected = true;
                sel.appendChild(opt);
            });
        });
    }

    async function _saveAttivita(existingId) {
        const titolo = document.getElementById('odaTitolo').value.trim();
        if (!titolo) { UI.showError('Il titolo è obbligatorio'); return; }

        const assegnatoSel = document.getElementById('odaAssegnato');
        const comuneSel = document.getElementById('odaComune');
        const scadVal = document.getElementById('odaScadenza').value;

        const data = {
            titolo,
            descrizione: document.getElementById('odaDescrizione').value.trim(),
            stato: document.getElementById('odaStato').value,
            priorita: document.getElementById('odaPriorita').value,
            assegnatoA: assegnatoSel?.value || '',
            assegnatoA_nome: assegnatoSel?.selectedOptions[0]?.dataset?.nome?.trim() || '',
            comuneId: comuneSel?.value || '',
            comuneNome: comuneSel?.selectedOptions[0]?.dataset?.nome || '',
            githubIssueUrl: (document.getElementById('odaGithubIssue')?.value || '').trim(),
            scadenza: scadVal ? firebase.firestore.Timestamp.fromDate(new Date(scadVal + 'T00:00:00')) : null,
            aggiornatoIl: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            if (existingId) {
                await db.collection(COL).doc(existingId).update(data);
                UI.showNotification('Attività aggiornata', 'success');
                _closeModal();
                // Aggiorna localmente
                const idx = _attivita.findIndex(a => a.id === existingId);
                if (idx >= 0) Object.assign(_attivita[idx], data);
                renderDettaglio(existingId);
            } else {
                data.creatoIl = firebase.firestore.FieldValue.serverTimestamp();
                data.creatoDa = AuthService.currentUser?.uid || '';
                data.creatoDaNome = AuthService.currentUserData ? `${AuthService.currentUserData.nome} ${AuthService.currentUserData.cognome}` : '';

                const docRef = await db.collection(COL).add(data);
                _attivita.unshift({ id: docRef.id, ...data });
                UI.showNotification('Attività creata!', 'success');
                _closeModal();

                // Notifica all'assegnatario
                if (data.assegnatoA && data.assegnatoA !== AuthService.currentUser?.uid) {
                    NotificationService.createNotification({
                        userId: data.assegnatoA,
                        type: 'task_assigned',
                        title: 'Nuova attività assegnata',
                        message: `Ti è stata assegnata: "${titolo}"`,
                        taskId: docRef.id
                    });
                }

                renderDettaglio(docRef.id);
            }
        } catch (error) {
            console.error('[OdAttivita] Errore salvataggio:', error);
            UI.showError('Errore: ' + error.message);
        }
    }

    // =========================================================================
    // UTILITIES
    // =========================================================================

    function _closeModal() {
        const overlay = document.getElementById('odModalOverlay');
        if (overlay) { overlay.classList.remove('visible'); setTimeout(() => overlay.remove(), 300); }
    }

    function _applyFilters() { _renderView(); }

    function _setView(mode) {
        _viewMode = mode;
        document.querySelectorAll('.od-view-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.od-view-btn[onclick*="${mode}"]`)?.classList.add('active');
        _renderView();
    }

    // =========================================================================
    // STYLES
    // =========================================================================

    function _addAttivitaStyles() {
        if (document.getElementById('oda-styles')) return;
        const style = document.createElement('style');
        style.id = 'oda-styles';
        style.textContent = `
/* ===== ATTIVITÀ ===== */

/* Kanban */
.oda-kanban { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; min-height: 400px; }
.oda-kanban-col { background: var(--grigio-100); border-radius: 14px; padding: 0.75rem; display: flex; flex-direction: column; min-height: 200px; }
.oda-kanban-col.oda-dragover { background: var(--blu-100); outline: 2px dashed var(--blu-500); }
.oda-kanban-col-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--grigio-300); }
.oda-kanban-col-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.oda-kanban-col-title { font-size: 0.8125rem; font-weight: 700; color: var(--grigio-900); flex: 1; }
.oda-kanban-col-count { background: var(--grigio-300); color: var(--grigio-700); padding: 0 6px; border-radius: 999px; font-size: 0.6875rem; font-weight: 700; }
.oda-kanban-col-body { flex: 1; display: flex; flex-direction: column; gap: 0.5rem; }
.oda-kanban-empty { font-size: 0.75rem; color: var(--grigio-500); text-align: center; padding: 1rem; }

/* Kanban Card */
.oda-kanban-card { background: #fff; border-radius: 12px; padding: 0.75rem; border: 1px solid var(--grigio-300); cursor: grab; transition: all 0.15s; }
.oda-kanban-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-color: var(--blu-300); }
.oda-kanban-card.oda-dragging { opacity: 0.5; }
.oda-kanban-card-top { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
.oda-kanban-card-priority { font-size: 0.625rem; font-weight: 700; text-transform: uppercase; }
.oda-kanban-card-title { font-size: 0.8125rem; font-weight: 600; color: var(--grigio-900); line-height: 1.3; margin-bottom: 6px; }
.oda-kanban-card-footer { display: flex; align-items: center; justify-content: space-between; font-size: 0.6875rem; color: var(--grigio-500); }
.oda-kanban-card-link { font-size: 0.625rem; color: var(--blu-500); margin-top: 4px; }
.oda-assignee, .oda-due { display: flex; align-items: center; gap: 3px; }
.oda-due-overdue { color: #D32F2F !important; font-weight: 700; }

/* Lista */
.oda-list { background: #fff; border-radius: 14px; border: 1px solid var(--grigio-300); overflow: hidden; }
.oda-list-header { display: flex; padding: 0.625rem 1rem; background: var(--grigio-100); font-size: 0.6875rem; font-weight: 700; color: var(--grigio-500); text-transform: uppercase; letter-spacing: 0.3px; }
.oda-list-row { display: flex; align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid var(--grigio-100); cursor: pointer; transition: background 0.15s; }
.oda-list-row:hover { background: var(--blu-100); }
.oda-list-row:last-child { border-bottom: none; }
.oda-list-title { font-weight: 600; font-size: 0.8125rem; color: var(--grigio-900); display: flex; align-items: center; gap: 0.5rem; }

/* Discussione */
.oda-commenti { max-height: 300px; overflow-y: auto; margin-bottom: 0.75rem; }
.oda-commento { padding: 0.625rem 0; border-bottom: 1px solid var(--grigio-100); }
.oda-commento:last-child { border-bottom: none; }
.oda-commento-header { display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--grigio-500); margin-bottom: 4px; }
.oda-commento-header strong { color: var(--grigio-900); }
.oda-commento-body { font-size: 0.8125rem; color: var(--grigio-700); line-height: 1.4; white-space: pre-wrap; }
.oda-commento-form { display: flex; flex-direction: column; gap: 0.5rem; }

@media (max-width: 900px) {
    .oda-kanban { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
    .oda-kanban { grid-template-columns: 1fr; }
    .oda-list-header { display: none; }
    .oda-list-row { flex-direction: column; align-items: flex-start; gap: 0.375rem; }
    .oda-list-row span { flex: unset !important; }
}
`;
        document.head.appendChild(style);
    }

    // =========================================================================
    // COLLEGAMENTO GITHUB ISSUES (Fase 4)
    // =========================================================================

    function _linkGithubIssue() {
        const a = _currentAttivita;
        if (!a) return;

        const url = prompt('Incolla l\'URL della issue GitHub:\n(es. https://github.com/growapp/repo/issues/42)');
        if (!url || !url.trim()) return;

        // Valida URL
        if (!url.match(/github\.com\/[^/]+\/[^/]+\/issues\/\d+/)) {
            UI.showError('URL non valido. Deve essere nel formato https://github.com/owner/repo/issues/numero');
            return;
        }

        db.collection(OfficinaDigitale.COLLECTIONS.ATTIVITA).doc(a.id).update({
            githubIssueUrl: url.trim()
        }).then(() => {
            _currentAttivita.githubIssueUrl = url.trim();
            UI.showNotification('Issue GitHub collegata!', 'success');
            _renderDettaglioHTML();
        }).catch(err => {
            console.error('[OdAttivita] Errore link issue:', err);
            UI.showError('Errore nel collegamento');
        });
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================
    return {
        render,
        renderDettaglio,
        showCreaAttivita,
        _editAttivita,
        _applyFilters,
        _setView,
        _closeModal,
        _saveAttivita,
        _cambiaStato,
        _inviaCommento,
        _onDragStart,
        _onDrop,
        _linkGithubIssue
    };
})();

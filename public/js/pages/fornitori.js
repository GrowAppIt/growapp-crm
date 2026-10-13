/**
 * 🏅 REGISTRO FORNITORI QUALIFICATI — ISO 9001:2015 punto 8.4
 * ----------------------------------------------------------------------------
 * Cosa dimostra all'auditor:
 *   - i fornitori esterni sono SCELTI con criteri definiti (qualifica iniziale)
 *   - sono TENUTI SOTTO CONTROLLO (valutazioni periodiche con punteggio)
 *   - sono RIVALUTATI a scadenza (frequenza in base alla criticità)
 *   - di tutto resta TRACCIA (valutazioni mai cancellabili + audit_log)
 *
 * Collezioni Firestore:
 *   fornitori              — una scheda per fornitore
 *   fornitori_valutazioni  — storico valutazioni (si aggiungono, non si cancellano)
 *   documenti              — allegati (tipo: 'fornitore', via DocumentService)
 *   audit_log              — storico modifiche (collezione: 'fornitori')
 * ⚠️ 'fornitori' e 'fornitori_valutazioni' vanno aggiunte alla whitelist
 *    isCrmCollection delle regole Firestore (firestore-security/).
 *
 * Route: #/fornitori (registro + cruscotto), #/fornitori/<id> (scheda)
 *
 * SICUREZZA: ogni testo da DB passa da escHtml/safeUrl; negli onclick inline
 * passano SOLO id (slug o id Firestore), mai testi.
 */

const Fornitori = {
    COLL: 'fornitori',
    COLL_VAL: 'fornitori_valutazioni',

    // ─── Tabelle di riferimento ────────────────────────────────────────────
    CATEGORIE: {
        piattaforma_app: { label: 'Piattaforma app', icon: 'fa-mobile-alt' },
        hosting_cloud:   { label: 'Hosting e cloud', icon: 'fa-server' },
        intelligenza_artificiale: { label: 'Intelligenza artificiale', icon: 'fa-robot' },
        comunicazione:   { label: 'Comunicazione', icon: 'fa-comments' },
        sviluppo:        { label: 'Strumenti di sviluppo', icon: 'fa-code-branch' },
        dati_contenuti:  { label: 'Dati e contenuti', icon: 'fa-database' },
        servizi_professionali: { label: 'Servizi professionali', icon: 'fa-user-tie' },
        altro:           { label: 'Altro', icon: 'fa-box' }
    },

    CRITICITA: {
        alta:  { label: 'Alta',  color: '#D32F2F', bg: '#FDECEA', desc: 'Se si ferma, si ferma il servizio ai Comuni' },
        media: { label: 'Media', color: '#B26A00', bg: '#FFF4D6', desc: 'Degrada una funzione, ma il servizio continua' },
        bassa: { label: 'Bassa', color: '#3CA434', bg: '#E2F8DE', desc: 'Sostituibile in breve, impatto minimo' }
    },

    STATI: {
        in_valutazione:      { label: 'Da valutare',             color: '#0288D1', bg: '#E1F3FC', icon: 'fa-hourglass-half' },
        qualificato:         { label: 'Qualificato',             color: '#3CA434', bg: '#E2F8DE', icon: 'fa-check-circle' },
        qualificato_riserva: { label: 'Qualificato con riserva', color: '#B26A00', bg: '#FFF4D6', icon: 'fa-exclamation-circle' },
        sospeso:             { label: 'Sospeso',                 color: '#4A4A4A', bg: '#EDEDED', icon: 'fa-pause-circle' },
        non_qualificato:     { label: 'Non qualificato',         color: '#D32F2F', bg: '#FDECEA', icon: 'fa-times-circle' }
    },

    METODI_QUALIFICA: {
        storico:             'Storico delle forniture (fornitore già in uso con esiti positivi)',
        certificazioni:      'Certificazioni possedute (ISO, SOC 2…)',
        analisi_documentale: 'Analisi documentale (condizioni, DPA, SLA, sicurezza)',
        referenze:           'Referenze / reputazione di mercato',
        prova:               'Prova o periodo di test',
        unico_disponibile:   'Fornitore unico o vincolato (nessuna alternativa equivalente)'
    },

    // Criteri di valutazione periodica — punteggio 1-5, pesi uguali.
    CRITERI: [
        { id: 'qualita',      label: 'Qualità del servizio',      desc: 'Il servizio fa quello che promette, senza errori o difetti ricorrenti' },
        { id: 'affidabilita', label: 'Affidabilità e continuità', desc: 'Disponibilità, assenza di disservizi, rispetto di tempi e scadenze' },
        { id: 'assistenza',   label: 'Assistenza e reattività',   desc: 'Tempi e qualità delle risposte quando c’è un problema' },
        { id: 'conformita',   label: 'Conformità e sicurezza',    desc: 'Certificazioni, protezione dei dati, documentazione e contratti chiari' },
        { id: 'prezzo',       label: 'Rapporto qualità/prezzo',   desc: 'Costo coerente con il valore e con le alternative di mercato' }
    ],

    SCALA: {
        1: 'Insufficiente — problemi gravi o ripetuti',
        2: 'Scarso — problemi frequenti',
        3: 'Sufficiente — adeguato, con qualche problema',
        4: 'Buono — problemi rari e risolti bene',
        5: 'Ottimo — nessun problema rilevante'
    },

    // Soglie esito sulla media dei punteggi
    SOGLIE: { qualificato: 3.5, riserva: 2.5 },

    // Frequenza di rivalutazione (mesi) in base alla criticità
    MESI_RIVALUTAZIONE: { alta: 12, media: 12, bassa: 24 },

    // Giorni di preavviso per "in scadenza"
    PREAVVISO_RIVALUTAZIONE: 30,
    PREAVVISO_CERTIFICATI: 60,

    // ─── Stato della pagina ────────────────────────────────────────────────
    _fornitori: [],
    _valutazioni: [],
    filtri: { search: '', categoria: '', stato: '', criticita: '', mostraCessati: false },
    _certRows: 0,

    // ═══════════════════════════════════════════════════════════════════════
    // ENTRY POINT
    // ═══════════════════════════════════════════════════════════════════════
    async render(id) {
        this._iniettaStili();
        const main = document.getElementById('mainContent');
        try {
            await Promise.all([this._carica(), this._caricaSeed()]);
            if (id) {
                await this.renderScheda(id);
            } else {
                main.innerHTML = this._htmlRegistro();
            }
        } catch (error) {
            console.error('Errore registro fornitori:', error);
            main.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Impossibile caricare il registro fornitori</h3>
                    <p>${escHtml(error.message)}</p>
                    ${/permission/i.test(error.message || '') ? `<p style="max-width:520px;margin:1rem auto 0;color:var(--grigio-700);">
                        Probabilmente le regole Firestore non includono ancora le collezioni
                        <strong>fornitori</strong> e <strong>fornitori_valutazioni</strong>.</p>` : ''}
                </div>`;
        }
        UI.hideLoading();
    },

    async _carica() {
        const [snapF, snapV] = await Promise.all([
            db.collection(this.COLL).get(),
            db.collection(this.COLL_VAL).get()
        ]);
        this._fornitori = snapF.docs.map(d => ({ id: d.id, ...d.data() }));
        this._valutazioni = snapV.docs.map(d => ({ id: d.id, ...d.data() }));
        this._fornitori.sort((a, b) => (a.codice || '').localeCompare(b.codice || ''));
    },

    // ═══════════════════════════════════════════════════════════════════════
    // CALCOLI
    // ═══════════════════════════════════════════════════════════════════════
    _pad(n) { return String(n).padStart(2, '0'); },

    _oggi() {
        const d = new Date();
        return `${d.getFullYear()}-${this._pad(d.getMonth() + 1)}-${this._pad(d.getDate())}`;
    },

    _fmt(iso) {
        if (!iso) return '—';
        const p = String(iso).slice(0, 10).split('-');
        return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : escHtml(iso);
    },

    _addMesi(iso, mesi) {
        const p = String(iso).slice(0, 10).split('-').map(Number);
        const d = new Date(p[0], p[1] - 1 + mesi, p[2]);
        return `${d.getFullYear()}-${this._pad(d.getMonth() + 1)}-${this._pad(d.getDate())}`;
    },

    _giorniA(iso) {
        if (!iso) return null;
        const p = String(iso).slice(0, 10).split('-').map(Number);
        const target = new Date(p[0], p[1] - 1, p[2]);
        const o = new Date(); o.setHours(0, 0, 0, 0);
        return Math.round((target - o) / 86400000);
    },

    prossimaRivalutazione(f) {
        if (!f.dataUltimaValutazione) return null;
        return this._addMesi(f.dataUltimaValutazione, this.MESI_RIVALUTAZIONE[f.criticita] || 12);
    },

    /** 'mai' | 'scaduta' | 'in_scadenza' | 'ok' */
    statoRivalutazione(f) {
        const p = this.prossimaRivalutazione(f);
        if (!p) return 'mai';
        const g = this._giorniA(p);
        if (g < 0) return 'scaduta';
        if (g <= this.PREAVVISO_RIVALUTAZIONE) return 'in_scadenza';
        return 'ok';
    },

    /** Certificazioni scadute o in scadenza */
    certificatiInScadenza(f) {
        return (f.certificazioni || []).filter(c => {
            if (!c.scadenza) return false;
            return this._giorniA(c.scadenza) <= this.PREAVVISO_CERTIFICATI;
        });
    },

    valutazioniDi(fornitoreId) {
        return this._valutazioni
            .filter(v => v.fornitoreId === fornitoreId)
            .sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
    },

    esitoDaMedia(media, punteggi) {
        let esito = media >= this.SOGLIE.qualificato ? 'qualificato'
            : media >= this.SOGLIE.riserva ? 'qualificato_riserva'
            : 'non_qualificato';
        // Un criterio a 1 non può dare "qualificato" pieno
        if (esito === 'qualificato' && punteggi && Object.values(punteggi).some(p => Number(p) === 1)) {
            esito = 'qualificato_riserva';
        }
        return esito;
    },

    /** Campi che l'auditor si aspetta di trovare compilati */
    completezza(f) {
        const manca = [];
        if (!f.ragioneSociale) manca.push('Ragione sociale');
        if (!f.sede) manca.push('Sede');
        if (!f.partitaIva) manca.push('P.IVA / n. registrazione');
        if (!f.categoria) manca.push('Categoria');
        if (!f.fornitura) manca.push('Cosa fornisce');
        if (!f.criticita) manca.push('Criticità');
        if (!f.inUsoDal) manca.push('In uso dal');
        if (!f.referenteNome && !f.contattoSupporto) manca.push('Referente o contatto di supporto');
        if (!(f.qualificaMetodi || []).length) manca.push('Metodo di qualifica');
        if (!f.dataUltimaValutazione) manca.push('Prima valutazione');
        const totale = 10;
        return { percentuale: Math.round(((totale - manca.length) / totale) * 100), manca };
    },

    _attivi() {
        return this._fornitori.filter(f => f.attivo !== false);
    },

    // ═══════════════════════════════════════════════════════════════════════
    // BADGE
    // ═══════════════════════════════════════════════════════════════════════
    _badgeStato(stato) {
        const s = this.STATI[stato] || this.STATI.in_valutazione;
        return `<span class="forn-badge" style="color:${s.color};background:${s.bg};"><i class="fas ${s.icon}"></i> ${s.label}</span>`;
    },

    _badgeCriticita(c) {
        const k = this.CRITICITA[c];
        if (!k) return '<span class="forn-badge" style="color:#9B9B9B;background:#F5F5F5;">Criticità n.d.</span>';
        return `<span class="forn-badge" style="color:${k.color};background:${k.bg};" title="${escAttr(k.desc)}"><i class="fas fa-signal"></i> Criticità ${k.label.toLowerCase()}</span>`;
    },

    _badgeRivalutazione(f) {
        const st = this.statoRivalutazione(f);
        const p = this.prossimaRivalutazione(f);
        if (f.attivo === false) return '';
        if (st === 'mai') return '<span class="forn-badge" style="color:#0288D1;background:#E1F3FC;"><i class="fas fa-star-half-alt"></i> Mai valutato</span>';
        if (st === 'scaduta') return `<span class="forn-badge" style="color:#D32F2F;background:#FDECEA;"><i class="fas fa-calendar-times"></i> Rivalutazione scaduta il ${this._fmt(p)}</span>`;
        if (st === 'in_scadenza') return `<span class="forn-badge" style="color:#B26A00;background:#FFF4D6;"><i class="fas fa-calendar-day"></i> Rivalutare entro ${this._fmt(p)}</span>`;
        return `<span class="forn-badge" style="color:#4A4A4A;background:#F5F5F5;"><i class="fas fa-calendar-check"></i> Prossima ${this._fmt(p)}</span>`;
    },

    _punteggioHtml(media) {
        if (media === undefined || media === null || media === '') return '<span style="color:var(--grigio-500);">—</span>';
        const m = Number(media);
        const col = m >= this.SOGLIE.qualificato ? '#3CA434' : m >= this.SOGLIE.riserva ? '#B26A00' : '#D32F2F';
        return `<span class="forn-score" style="color:${col};">${m.toFixed(2).replace('.', ',')}<small>/5</small></span>`;
    },

    // ═══════════════════════════════════════════════════════════════════════
    // VISTA REGISTRO + CRUSCOTTO
    // ═══════════════════════════════════════════════════════════════════════
    _htmlRegistro() {
        const seedMancanti = this._seedMancanti();
        return `
            <div class="page-header mb-3">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1rem;">
                    <div>
                        <h1 style="font-size:2rem;font-weight:700;color:var(--blu-700);margin-bottom:0.5rem;">
                            <i class="fas fa-award"></i> Registro fornitori qualificati
                        </h1>
                        <p style="color:var(--grigio-500);margin:0;">
                            ISO 9001:2015 — punto 8.4 · Controllo dei processi, prodotti e servizi forniti dall’esterno
                        </p>
                    </div>
                    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                        <button class="btn btn-secondary" onclick="Fornitori.esportaExcel()"><i class="fas fa-file-excel"></i> Excel</button>
                        <button class="btn btn-secondary" onclick="Fornitori.stampaElenco()"><i class="fas fa-print"></i> Elenco per l’audit</button>
                        <button class="btn btn-primary" onclick="Fornitori.apriForm()"><i class="fas fa-plus"></i> Nuovo fornitore</button>
                    </div>
                </div>
            </div>

            ${seedMancanti.length ? `
            <div class="forn-alert forn-alert-info">
                <div>
                    <strong><i class="fas fa-magic"></i> ${this._fornitori.length ? 'Ci sono fornitori iniziali non ancora caricati' : 'Il registro è vuoto'}</strong><br>
                    Puoi caricare con un clic ${seedMancanti.length} fornitori già preparati (dati verificati sui siti ufficiali il ${this._fmt(window.FORNITORI_INIZIALI_VERIFICA || '')}).
                    Le valutazioni con punteggio restano da fare a te.
                </div>
                <button class="btn btn-primary" onclick="Fornitori.caricaIniziali()"><i class="fas fa-download"></i> Carica fornitori iniziali</button>
            </div>` : ''}

            ${this._htmlCruscotto()}

            <div class="card mb-3">
                <div class="card-body" style="padding:1rem;">
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(190px,100%),1fr));gap:0.75rem;align-items:center;">
                        <input type="text" id="fornSearch" class="form-input" placeholder="🔍 Cerca fornitore o servizio…"
                            value="${escAttr(this.filtri.search)}" oninput="Fornitori.applicaFiltri()">
                        <select id="fornFiltroStato" class="filter-select" onchange="Fornitori.applicaFiltri()">
                            <option value="">Tutti gli stati</option>
                            ${Object.entries(this.STATI).map(([k, s]) => `<option value="${k}" ${this.filtri.stato === k ? 'selected' : ''}>${s.label}</option>`).join('')}
                            <option value="__da_rivalutare" ${this.filtri.stato === '__da_rivalutare' ? 'selected' : ''}>Da (ri)valutare ora</option>
                        </select>
                        <select id="fornFiltroCriticita" class="filter-select" onchange="Fornitori.applicaFiltri()">
                            <option value="">Tutte le criticità</option>
                            ${Object.entries(this.CRITICITA).map(([k, c]) => `<option value="${k}" ${this.filtri.criticita === k ? 'selected' : ''}>Criticità ${c.label.toLowerCase()}</option>`).join('')}
                        </select>
                        <select id="fornFiltroCategoria" class="filter-select" onchange="Fornitori.applicaFiltri()">
                            <option value="">Tutte le categorie</option>
                            ${Object.entries(this.CATEGORIE).map(([k, c]) => `<option value="${k}" ${this.filtri.categoria === k ? 'selected' : ''}>${c.label}</option>`).join('')}
                        </select>
                        <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.9rem;color:var(--grigio-700);cursor:pointer;">
                            <input type="checkbox" id="fornMostraCessati" ${this.filtri.mostraCessati ? 'checked' : ''} onchange="Fornitori.applicaFiltri()"> Mostra rapporti cessati
                        </label>
                    </div>
                </div>
            </div>

            <div id="fornLista">${this._htmlLista()}</div>

            ${this._htmlCriteri()}
        `;
    },

    _htmlCruscotto() {
        const attivi = this._attivi();
        const conta = st => attivi.filter(f => (f.stato || 'in_valutazione') === st).length;
        const daValutare = attivi.filter(f => ['mai', 'scaduta'].includes(this.statoRivalutazione(f))).length;
        const inScadenza = attivi.filter(f => this.statoRivalutazione(f) === 'in_scadenza').length;
        const conPunteggio = attivi.filter(f => f.punteggioUltimo !== undefined && f.punteggioUltimo !== null);
        const mediaGen = conPunteggio.length
            ? conPunteggio.reduce((s, f) => s + Number(f.punteggioUltimo), 0) / conPunteggio.length
            : null;

        const kpi = (icon, colore, valore, label, sub = '', filtro = '') => `
            <div class="forn-kpi" ${filtro ? `onclick="Fornitori.filtraStato('${filtro}')" style="cursor:pointer;"` : ''}>
                <div class="forn-kpi-icon" style="background:${colore}1A;color:${colore};"><i class="fas ${icon}"></i></div>
                <div>
                    <div class="forn-kpi-val">${valore}</div>
                    <div class="forn-kpi-label">${label}</div>
                    ${sub ? `<div class="forn-kpi-sub">${sub}</div>` : ''}
                </div>
            </div>`;

        // Cose da fare
        const todo = [];
        attivi.forEach(f => {
            const st = this.statoRivalutazione(f);
            const nome = escHtml(f.nomeCommerciale || f.ragioneSociale);
            if (st === 'mai') todo.push({ ord: 1, icon: 'fa-star-half-alt', col: '#0288D1', id: f.id, testo: `<strong>${nome}</strong>: fare la prima valutazione`, azione: 'valuta' });
            if (st === 'scaduta') todo.push({ ord: 0, icon: 'fa-calendar-times', col: '#D32F2F', id: f.id, testo: `<strong>${nome}</strong>: rivalutazione scaduta il ${this._fmt(this.prossimaRivalutazione(f))}`, azione: 'valuta' });
            if (st === 'in_scadenza') todo.push({ ord: 2, icon: 'fa-calendar-day', col: '#B26A00', id: f.id, testo: `<strong>${nome}</strong>: rivalutare entro il ${this._fmt(this.prossimaRivalutazione(f))}`, azione: 'valuta' });
            this.certificatiInScadenza(f).forEach(c => {
                const g = this._giorniA(c.scadenza);
                todo.push({ ord: g < 0 ? 0 : 2, icon: 'fa-certificate', col: g < 0 ? '#D32F2F' : '#B26A00', id: f.id,
                    testo: `<strong>${nome}</strong>: certificato ${escHtml(c.nome)} ${g < 0 ? 'scaduto' : 'in scadenza'} il ${this._fmt(c.scadenza)} — verificare il rinnovo`, azione: 'apri' });
            });
            if (['qualificato_riserva', 'sospeso'].includes(f.stato)) {
                todo.push({ ord: 1, icon: 'fa-tools', col: '#B26A00', id: f.id, testo: `<strong>${nome}</strong>: ${this.STATI[f.stato].label.toLowerCase()} — seguire le azioni decise`, azione: 'apri' });
            }
            const comp = this.completezza(f);
            const mancaSenzaValutazione = comp.manca.filter(m => m !== 'Prima valutazione');
            if (mancaSenzaValutazione.length) {
                todo.push({ ord: 3, icon: 'fa-clipboard-list', col: '#9B9B9B', id: f.id, testo: `<strong>${nome}</strong>: scheda da completare (${escHtml(mancaSenzaValutazione.join(', '))})`, azione: 'modifica' });
            }
        });
        todo.sort((a, b) => a.ord - b.ord);

        const perCriticita = Object.entries(this.CRITICITA).map(([k, c]) => {
            const n = attivi.filter(f => f.criticita === k).length;
            return `<div class="forn-crit-row"><span class="forn-dot" style="background:${c.color};"></span>${c.label}<strong>${n}</strong></div>`;
        }).join('');

        return `
            <div class="forn-kpi-grid">
                ${kpi('fa-building', '#145284', attivi.length, 'Fornitori attivi', `${attivi.filter(f => f.criticita === 'alta').length} a criticità alta`)}
                ${kpi('fa-check-circle', '#3CA434', conta('qualificato'), 'Qualificati', '', 'qualificato')}
                ${kpi('fa-exclamation-circle', '#B26A00', conta('qualificato_riserva') + conta('sospeso'), 'Con riserva o sospesi', '', 'qualificato_riserva')}
                ${kpi('fa-times-circle', '#D32F2F', conta('non_qualificato'), 'Non qualificati', '', 'non_qualificato')}
                ${kpi('fa-hourglass-half', daValutare ? '#D32F2F' : '#0288D1', daValutare, 'Da valutare ora', inScadenza ? `+ ${inScadenza} in scadenza entro ${this.PREAVVISO_RIVALUTAZIONE} gg` : 'mai valutati o scaduti', '__da_rivalutare')}
                ${kpi('fa-star', '#145284', mediaGen === null ? '—' : mediaGen.toFixed(2).replace('.', ','), 'Punteggio medio', `su ${conPunteggio.length} fornitori valutati`)}
            </div>

            <div class="forn-two-col mb-3">
                <div class="card" style="margin:0;">
                    <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
                        <h3 class="card-title" style="margin:0;"><i class="fas fa-tasks"></i> Cose da fare</h3>
                        <span style="color:var(--grigio-500);font-size:0.85rem;">${todo.length} ${todo.length === 1 ? 'attività' : 'attività'}</span>
                    </div>
                    <div class="forn-todo">
                        ${todo.length ? todo.slice(0, 12).map(t => `
                            <div class="forn-todo-row">
                                <i class="fas ${t.icon}" style="color:${t.col};"></i>
                                <span>${t.testo}</span>
                                <button class="btn btn-sm btn-secondary" onclick="${t.azione === 'valuta' ? `Fornitori.apriValutazione('${t.id}')` : t.azione === 'modifica' ? `Fornitori.apriForm('${t.id}')` : `UI.showPage('fornitori','${t.id}')`}">
                                    ${t.azione === 'valuta' ? '<i class="fas fa-star"></i> Valuta' : t.azione === 'modifica' ? '<i class="fas fa-pen"></i> Completa' : '<i class="fas fa-eye"></i> Apri'}
                                </button>
                            </div>`).join('') + (todo.length > 12 ? `<div class="forn-todo-more">… e altre ${todo.length - 12}</div>` : '')
                        : '<div class="forn-empty-small"><i class="fas fa-check-circle" style="color:#3CA434;"></i> Tutto in regola</div>'}
                    </div>
                </div>
                <div class="card" style="margin:0;">
                    <div class="card-header"><h3 class="card-title" style="margin:0;"><i class="fas fa-signal"></i> Per criticità</h3></div>
                    <div style="padding:1rem 1.25rem;">${perCriticita}
                        <p style="font-size:0.8rem;color:var(--grigio-500);margin:0.75rem 0 0;">
                            Rivalutazione: ogni ${this.MESI_RIVALUTAZIONE.alta} mesi per criticità alta e media, ogni ${this.MESI_RIVALUTAZIONE.bassa} mesi per la bassa.
                        </p>
                    </div>
                </div>
            </div>`;
    },

    _filtrati() {
        const t = (this.filtri.search || '').toLowerCase().trim();
        return this._fornitori.filter(f => {
            if (!this.filtri.mostraCessati && f.attivo === false) return false;
            if (this.filtri.categoria && f.categoria !== this.filtri.categoria) return false;
            if (this.filtri.criticita && f.criticita !== this.filtri.criticita) return false;
            if (this.filtri.stato === '__da_rivalutare') {
                if (!['mai', 'scaduta', 'in_scadenza'].includes(this.statoRivalutazione(f))) return false;
            } else if (this.filtri.stato === 'qualificato_riserva') {
                if (!['qualificato_riserva', 'sospeso'].includes(f.stato)) return false;
            } else if (this.filtri.stato && (f.stato || 'in_valutazione') !== this.filtri.stato) {
                return false;
            }
            if (t) {
                const testo = [f.codice, f.ragioneSociale, f.nomeCommerciale, f.fornitura, f.utilizzo].join(' ').toLowerCase();
                if (!testo.includes(t)) return false;
            }
            return true;
        });
    },

    _htmlLista() {
        const lista = this._filtrati();
        if (!lista.length) {
            return `<div class="empty-state"><i class="fas fa-award"></i><h3>Nessun fornitore</h3>
                <p>${this._fornitori.length ? 'Nessun fornitore corrisponde ai filtri.' : 'Aggiungi il primo fornitore o carica quelli iniziali.'}</p></div>`;
        }
        return `<div class="forn-grid">${lista.map(f => {
            const cat = this.CATEGORIE[f.categoria] || this.CATEGORIE.altro;
            const comp = this.completezza(f);
            return `
            <div class="forn-card ${f.attivo === false ? 'forn-card-cessato' : ''}" onclick="UI.showPage('fornitori','${f.id}')">
                <div class="forn-card-top">
                    <div class="forn-card-icon"><i class="fas ${cat.icon}"></i></div>
                    <div style="min-width:0;flex:1;">
                        <div class="forn-card-code">${escHtml(f.codice || '')} · ${cat.label}</div>
                        <div class="forn-card-name">${escHtml(f.nomeCommerciale || f.ragioneSociale)}</div>
                        ${f.nomeCommerciale && f.ragioneSociale && f.nomeCommerciale !== f.ragioneSociale ? `<div class="forn-card-legal">${escHtml(f.ragioneSociale)}</div>` : ''}
                    </div>
                    <div style="text-align:right;">${this._punteggioHtml(f.punteggioUltimo)}</div>
                </div>
                <div class="forn-card-desc">${escHtml(f.fornitura || '')}</div>
                <div class="forn-card-badges">
                    ${f.attivo === false ? '<span class="forn-badge" style="color:#4A4A4A;background:#EDEDED;"><i class="fas fa-ban"></i> Rapporto cessato</span>' : this._badgeStato(f.stato)}
                    ${this._badgeCriticita(f.criticita)}
                    ${this._badgeRivalutazione(f)}
                </div>
                <div class="forn-progress" title="Completezza scheda: ${comp.percentuale}%${comp.manca.length ? ' — manca: ' + escAttr(comp.manca.join(', ')) : ''}">
                    <div style="width:${comp.percentuale}%;background:${comp.percentuale === 100 ? '#3CA434' : comp.percentuale >= 70 ? '#2E6DA8' : '#FFCC00'};"></div>
                </div>
                <div class="forn-progress-label">Scheda completa al ${comp.percentuale}%</div>
            </div>`;
        }).join('')}</div>`;
    },

    _htmlCriteri() {
        return `
            <details class="card forn-criteri mb-3">
                <summary><i class="fas fa-book"></i> Criteri di qualifica e valutazione (metodo documentato)</summary>
                <div style="padding:0 1.25rem 1.25rem;">
                    ${this._htmlMetodoTesto()}
                </div>
            </details>`;
    },

    /** Testo del metodo — usato sia in pagina sia nelle stampe per l'audit */
    _htmlMetodoTesto() {
        return `
            <h4>1. Qualifica iniziale</h4>
            <p>Prima di usare un nuovo fornitore se ne verifica l’idoneità con uno o più di questi metodi:</p>
            <ul>${Object.values(this.METODI_QUALIFICA).map(m => `<li>${m}</li>`).join('')}</ul>
            <p>I fornitori già in uso alla data di avvio del registro sono qualificati per <em>storico delle forniture</em>,
            insieme all’analisi della documentazione pubblica (certificazioni, condizioni, protezione dei dati).</p>
            <h4>2. Criticità</h4>
            <ul>${Object.values(this.CRITICITA).map(c => `<li><strong>${c.label}</strong>: ${c.desc}</li>`).join('')}</ul>
            <h4>3. Valutazione periodica</h4>
            <p>Ogni criterio riceve un punteggio da 1 a 5 (pesi uguali):</p>
            <ul>${this.CRITERI.map(c => `<li><strong>${c.label}</strong>: ${c.desc}</li>`).join('')}</ul>
            <p>Scala: ${Object.entries(this.SCALA).map(([k, v]) => `<strong>${k}</strong> = ${v}`).join(' · ')}.</p>
            <h4>4. Esito</h4>
            <ul>
                <li><strong>Qualificato</strong>: media ≥ ${String(this.SOGLIE.qualificato).replace('.', ',')} e nessun criterio a 1</li>
                <li><strong>Qualificato con riserva</strong>: media da ${String(this.SOGLIE.riserva).replace('.', ',')} a ${String(this.SOGLIE.qualificato).replace('.', ',')}, oppure un criterio a 1. Si definiscono azioni e si rivaluta prima della scadenza ordinaria</li>
                <li><strong>Non qualificato</strong>: media &lt; ${String(this.SOGLIE.riserva).replace('.', ',')}. Si avvia la sostituzione del fornitore</li>
                <li><strong>Sospeso</strong>: decisione motivata della direzione in attesa di chiarimenti</li>
            </ul>
            <p>Il valutatore può discostarsi dall’esito proposto solo indicando la motivazione, che resta registrata.</p>
            <h4>5. Rivalutazione</h4>
            <p>Ogni ${this.MESI_RIVALUTAZIONE.alta} mesi per i fornitori a criticità alta e media, ogni ${this.MESI_RIVALUTAZIONE.bassa} mesi per quelli a criticità bassa,
            e comunque dopo un disservizio rilevante. Le valutazioni registrate non si cancellano: si correggono con una nuova valutazione.</p>`;
    },

    applicaFiltri() {
        this.filtri.search = document.getElementById('fornSearch')?.value || '';
        this.filtri.stato = document.getElementById('fornFiltroStato')?.value || '';
        this.filtri.criticita = document.getElementById('fornFiltroCriticita')?.value || '';
        this.filtri.categoria = document.getElementById('fornFiltroCategoria')?.value || '';
        this.filtri.mostraCessati = !!document.getElementById('fornMostraCessati')?.checked;
        const box = document.getElementById('fornLista');
        if (box) box.innerHTML = this._htmlLista();
    },

    filtraStato(stato) {
        const sel = document.getElementById('fornFiltroStato');
        if (sel) sel.value = stato;
        this.applicaFiltri();
        document.getElementById('fornLista')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    // ═══════════════════════════════════════════════════════════════════════
    // SCHEDA FORNITORE
    // ═══════════════════════════════════════════════════════════════════════
    async renderScheda(id) {
        const main = document.getElementById('mainContent');
        const f = this._fornitori.find(x => x.id === id);
        if (!f) {
            main.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><h3>Fornitore non trovato</h3>
                <button class="btn btn-primary" onclick="UI.showPage('fornitori')">Torna al registro</button></div>`;
            return;
        }
        const cat = this.CATEGORIE[f.categoria] || this.CATEGORIE.altro;
        const vals = this.valutazioniDi(id);
        const comp = this.completezza(f);
        const riga = (label, valore) => `<div class="forn-field"><div class="forn-field-l">${label}</div><div class="forn-field-v">${valore || '<span style="color:var(--grigio-500);">—</span>'}</div></div>`;
        const link = (u, testo) => u ? `<a href="${safeUrl(u)}" target="_blank" rel="noopener">${escHtml(testo || u)} <i class="fas fa-external-link-alt" style="font-size:0.7em;"></i></a>` : '';

        main.innerHTML = `
            <button class="btn btn-secondary btn-sm mb-2" onclick="UI.goBack('fornitori')"><i class="fas fa-arrow-left"></i> Torna al registro</button>

            <div class="card mb-3">
                <div style="padding:1.25rem;display:flex;gap:1rem;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;">
                    <div style="display:flex;gap:1rem;align-items:flex-start;min-width:0;flex:1;">
                        <div class="forn-card-icon" style="width:56px;height:56px;font-size:1.5rem;"><i class="fas ${cat.icon}"></i></div>
                        <div style="min-width:0;">
                            <div class="forn-card-code">${escHtml(f.codice || '')} · ${cat.label}</div>
                            <h1 style="font-size:1.75rem;font-weight:700;color:var(--blu-700);margin:0.1rem 0;">${escHtml(f.nomeCommerciale || f.ragioneSociale)}</h1>
                            <div style="color:var(--grigio-700);">${escHtml(f.ragioneSociale || '')}</div>
                            <div class="forn-card-badges" style="margin-top:0.6rem;">
                                ${f.attivo === false ? '<span class="forn-badge" style="color:#4A4A4A;background:#EDEDED;"><i class="fas fa-ban"></i> Rapporto cessato</span>' : this._badgeStato(f.stato)}
                                ${this._badgeCriticita(f.criticita)}
                                ${this._badgeRivalutazione(f)}
                            </div>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:0.8rem;color:var(--grigio-500);">Ultimo punteggio</div>
                        ${this._punteggioHtml(f.punteggioUltimo)}
                        <div style="font-size:0.8rem;color:var(--grigio-500);">${f.dataUltimaValutazione ? 'del ' + this._fmt(f.dataUltimaValutazione) : 'mai valutato'}</div>
                    </div>
                </div>
                <div class="forn-actions">
                    ${f.attivo !== false ? `<button class="btn btn-primary" onclick="Fornitori.apriValutazione('${f.id}')"><i class="fas fa-star"></i> Nuova valutazione</button>` : ''}
                    <button class="btn btn-secondary" onclick="Fornitori.apriForm('${f.id}')"><i class="fas fa-pen"></i> Modifica scheda</button>
                    <button class="btn btn-secondary" onclick="Fornitori.stampaScheda('${f.id}')"><i class="fas fa-print"></i> Stampa scheda</button>
                    ${f.attivo !== false
                        ? `<button class="btn btn-secondary" onclick="Fornitori.cessaRapporto('${f.id}')"><i class="fas fa-ban"></i> Cessa rapporto</button>`
                        : `<button class="btn btn-secondary" onclick="Fornitori.riattiva('${f.id}')"><i class="fas fa-undo"></i> Riattiva</button>`}
                    ${AuthService.isSuperAdmin() && !vals.length ? `<button class="btn btn-danger" onclick="Fornitori.elimina('${f.id}')"><i class="fas fa-trash"></i> Elimina</button>` : ''}
                </div>
            </div>

            ${comp.manca.length ? `<div class="forn-alert forn-alert-warn"><div><strong><i class="fas fa-clipboard-list"></i> Scheda completa al ${comp.percentuale}%</strong><br>Per l’audit manca: ${escHtml(comp.manca.join(', '))}.</div></div>` : ''}
            ${f.attivo === false ? `<div class="forn-alert forn-alert-grey"><div><strong>Rapporto cessato il ${this._fmt(f.dataCessazione)}</strong>${f.motivoCessazione ? ' — ' + escHtml(f.motivoCessazione) : ''}</div></div>` : ''}

            <div class="forn-two-col">
                <div class="card" style="margin:0;">
                    <div class="card-header"><h3 class="card-title" style="margin:0;"><i class="fas fa-id-card"></i> Anagrafica</h3></div>
                    <div class="forn-fields">
                        ${riga('Ragione sociale', escHtml(f.ragioneSociale))}
                        ${riga('Sede', escHtml(f.sede))}
                        ${riga('Paese', escHtml(f.paese))}
                        ${riga('P.IVA / n. registrazione', escHtml(f.partitaIva))}
                        ${riga('Sito web', link(f.sitoWeb))}
                        ${riga('Referente', escHtml([f.referenteNome, f.referenteEmail, f.referenteTelefono].filter(Boolean).join(' · ')))}
                        ${riga('Assistenza', /^https?:/i.test(f.contattoSupporto || '') ? link(f.contattoSupporto) : escHtml(f.contattoSupporto))}
                        ${riga('In uso dal', escHtml(f.inUsoDal))}
                    </div>
                </div>
                <div class="card" style="margin:0;">
                    <div class="card-header"><h3 class="card-title" style="margin:0;"><i class="fas fa-box-open"></i> Fornitura</h3></div>
                    <div class="forn-fields">
                        ${riga('Cosa fornisce', escHtml(f.fornitura))}
                        ${riga('Come lo usiamo', escHtml(f.utilizzo))}
                        ${riga('Criticità', f.criticita ? `${this.CRITICITA[f.criticita].label} — ${escHtml(f.motivazioneCriticita || this.CRITICITA[f.criticita].desc)}` : '')}
                        ${riga('Contratto / piano', escHtml(f.contratto))}
                        ${riga('Alternative (piano B)', escHtml(f.alternative))}
                    </div>
                </div>
            </div>

            <div class="forn-two-col" style="margin-top:1rem;">
                <div class="card" style="margin:0;">
                    <div class="card-header"><h3 class="card-title" style="margin:0;"><i class="fas fa-shield-alt"></i> Garanzie del fornitore</h3></div>
                    <div class="forn-fields">
                        ${riga('Certificazioni', (f.certificazioni || []).length ? `<ul class="forn-cert-list">${f.certificazioni.map(c => {
                            const g = c.scadenza ? this._giorniA(c.scadenza) : null;
                            const col = g === null ? '' : g < 0 ? 'color:#D32F2F;' : g <= this.PREAVVISO_CERTIFICATI ? 'color:#B26A00;' : '';
                            return `<li><strong>${escHtml(c.nome)}</strong>${c.ambito ? ` — ${escHtml(c.ambito)}` : ''}
                                <span style="${col}">${c.scadenza ? ` · scade ${this._fmt(c.scadenza)}` : ''}</span>
                                ${c.fonte ? ` · ${link(c.fonte, 'fonte')}` : ''}</li>`;
                        }).join('')}</ul>` : '<span style="color:var(--grigio-500);">Nessuna certificazione dichiarata</span>')}
                        ${riga('Dove stanno i dati', escHtml(f.localizzazioneDati))}
                        ${riga('Protezione dati (DPA)', escHtml(f.dpa))}
                        ${riga('Livello di servizio (SLA)', escHtml(f.sla))}
                        ${riga('Trust center', link(f.paginaTrust))}
                        ${riga('Stato del servizio', link(f.paginaStatus))}
                        ${riga('Dati verificati il', f.dataVerificaDati ? `${this._fmt(f.dataVerificaDati)}${f.verificaDatiDa ? ' da ' + escHtml(f.verificaDatiDa) : ''}` : '')}
                    </div>
                </div>
                <div class="card" style="margin:0;">
                    <div class="card-header"><h3 class="card-title" style="margin:0;"><i class="fas fa-user-check"></i> Qualifica iniziale</h3></div>
                    <div class="forn-fields">
                        ${riga('Metodo', (f.qualificaMetodi || []).length ? `<ul class="forn-cert-list">${f.qualificaMetodi.map(m => `<li>${escHtml(this.METODI_QUALIFICA[m] || m)}</li>`).join('')}</ul>` : '')}
                        ${riga('Data', this._fmt(f.qualificaData))}
                        ${riga('Eseguita da', escHtml(f.qualificaDa))}
                        ${riga('Esito', f.qualificaEsito ? this._badgeStato(f.qualificaEsito) : '')}
                        ${riga('Note', escHtml(f.qualificaNote))}
                        ${riga('Note generali', escHtml(f.note))}
                    </div>
                </div>
            </div>

            <div class="card" style="margin-top:1rem;">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                    <h3 class="card-title" style="margin:0;"><i class="fas fa-star"></i> Valutazioni (${vals.length})</h3>
                    ${f.attivo !== false ? `<button class="btn btn-sm btn-primary" onclick="Fornitori.apriValutazione('${f.id}')"><i class="fas fa-plus"></i> Nuova valutazione</button>` : ''}
                </div>
                ${vals.length ? `<div class="table-responsive"><table class="table forn-table">
                    <thead><tr><th>Data</th><th>Periodo</th>${this.CRITERI.map(c => `<th title="${escAttr(c.desc)}">${c.label}</th>`).join('')}<th>Media</th><th>Esito</th><th>Valutatore</th></tr></thead>
                    <tbody>${vals.map(v => `
                        <tr>
                            <td>${this._fmt(v.data)}</td>
                            <td>${escHtml(v.periodo || '')}</td>
                            ${this.CRITERI.map(c => `<td style="text-align:center;">${escHtml((v.punteggi || {})[c.id] ?? '—')}</td>`).join('')}
                            <td>${this._punteggioHtml(v.media)}</td>
                            <td>${this._badgeStato(v.esito)}${v.esito !== v.esitoProposto ? `<div style="font-size:0.75rem;color:var(--grigio-500);margin-top:0.25rem;">proposto: ${escHtml((this.STATI[v.esitoProposto] || {}).label || '')}</div>` : ''}</td>
                            <td>${escHtml(v.valutatoreNome || '')}</td>
                        </tr>
                        ${v.note || v.azioni || v.motivazioneEsito ? `<tr class="forn-note-row"><td colspan="${this.CRITERI.length + 5}">
                            ${v.motivazioneEsito ? `<div><strong>Motivazione esito:</strong> ${escHtml(v.motivazioneEsito)}</div>` : ''}
                            ${v.note ? `<div><strong>Note:</strong> ${escHtml(v.note)}</div>` : ''}
                            ${v.azioni ? `<div><strong>Azioni decise:</strong> ${escHtml(v.azioni)}</div>` : ''}
                        </td></tr>` : ''}`).join('')}
                    </tbody></table></div>`
                : '<div class="forn-empty-small">Nessuna valutazione registrata.</div>'}
            </div>

            <div class="card" style="margin-top:1rem;">
                <div class="card-header"><h3 class="card-title" style="margin:0;"><i class="fas fa-paperclip"></i> Documenti allegati</h3></div>
                <div style="padding:1rem 1.25rem;">
                    <div class="forn-upload">
                        <input type="file" id="fornDocFile" class="form-input" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.p7m">
                        <input type="text" id="fornDocDescr" class="form-input" placeholder="Descrizione (es. Certificato ISO 27001 2026)">
                        <select id="fornDocCat" class="filter-select">
                            ${DocumentService.CATEGORIE.map(c => `<option value="${c.id}" ${c.id === 'certificato' ? 'selected' : ''}>${c.label}</option>`).join('')}
                        </select>
                        <input type="date" id="fornDocData" class="form-input" value="${this._oggi()}">
                        <button class="btn btn-primary" onclick="Fornitori.caricaDocumento('${f.id}')"><i class="fas fa-upload"></i> Carica</button>
                    </div>
                    <div id="fornDocLista" style="margin-top:1rem;"><div class="loading-spinner" style="margin:1rem auto;"></div></div>
                </div>
            </div>

            <div class="card" style="margin-top:1rem;">
                <div class="card-header"><h3 class="card-title" style="margin:0;"><i class="fas fa-history"></i> Storico modifiche</h3></div>
                <div id="fornStorico" style="padding:1rem 1.25rem;"><div class="loading-spinner" style="margin:1rem auto;"></div></div>
            </div>
        `;

        this._caricaDocumenti(id);
        this._caricaStorico(id);
    },

    async _caricaDocumenti(id) {
        const box = document.getElementById('fornDocLista');
        if (!box) return;
        try {
            const docs = await DocumentService.getDocumenti('fornitore', id);
            if (!docs.length) {
                box.innerHTML = '<div class="forn-empty-small">Nessun documento. Carica certificati, contratti e condizioni del fornitore.</div>';
                return;
            }
            box.innerHTML = docs.map(d => {
                const cat = DocumentService.getCategoria(d.categoria);
                return `
                <div class="forn-doc-row">
                    <i class="${cat.icon}" style="color:${cat.color};"></i>
                    <div style="flex:1;min-width:0;">
                        <a href="${safeUrl(d.downloadUrl)}" target="_blank" rel="noopener" style="font-weight:600;">${escHtml(d.descrizione)}</a>
                        <div style="font-size:0.8rem;color:var(--grigio-500);">${escHtml(d.nomeOriginale)} · ${cat.label} · ${DocumentService.formatData(d.dataDocumento)} · caricato da ${escHtml(d.caricatoDaNome || '')}</div>
                    </div>
                    <button class="btn btn-sm btn-secondary" title="Elimina" onclick="Fornitori.eliminaDocumento('${id}','${d.id}')"><i class="fas fa-trash"></i></button>
                </div>`;
            }).join('');
        } catch (e) {
            box.innerHTML = `<div class="forn-empty-small" style="color:#D32F2F;">Errore nel caricamento dei documenti: ${escHtml(e.message)}</div>`;
        }
    },

    async caricaDocumento(id) {
        const file = document.getElementById('fornDocFile')?.files?.[0];
        const descr = document.getElementById('fornDocDescr')?.value || '';
        const cat = document.getElementById('fornDocCat')?.value || 'altro';
        const data = document.getElementById('fornDocData')?.value || '';
        if (!file) { UI.showWarning('Scegli un file da caricare'); return; }
        if (!descr.trim()) { UI.showWarning('Scrivi una descrizione del documento'); return; }
        try {
            await DocumentService.uploadDocumento(file, 'fornitore', id, descr, data, cat);
            DataService._logAudit('DOCUMENTO_CARICATO', 'fornitori', id, { descrizione: descr.trim(), file: file.name });
            document.getElementById('fornDocFile').value = '';
            document.getElementById('fornDocDescr').value = '';
            this._caricaDocumenti(id);
            this._caricaStorico(id);
        } catch (e) {
            UI.showError('Caricamento non riuscito: ' + e.message);
        }
    },

    async eliminaDocumento(fornitoreId, docId) {
        const ok = await UI.showModal({
            title: 'Eliminare il documento?',
            content: '<p>Il file viene rimosso definitivamente. L’operazione resta nello storico modifiche.</p>',
            confirmText: 'Elimina', confirmClass: 'btn-danger'
        });
        if (!ok) return;
        try {
            const snap = await db.collection('documenti').doc(docId).get();
            if (!snap.exists) return;
            const d = snap.data();
            if (d.tipo !== 'fornitore' || d.entitaId !== fornitoreId) return;
            await DocumentService.deleteDocumento(docId, d.storagePath);
            DataService._logAudit('DOCUMENTO_ELIMINATO', 'fornitori', fornitoreId, { descrizione: d.descrizione || '', file: d.nomeOriginale || '' });
            this._caricaDocumenti(fornitoreId);
            this._caricaStorico(fornitoreId);
        } catch (e) {
            UI.showError('Eliminazione non riuscita: ' + e.message);
        }
    },

    AZIONI_STORICO: {
        CREATE: 'Scheda creata',
        UPDATE: 'Scheda modificata',
        VALUTAZIONE: 'Valutazione registrata',
        CESSAZIONE: 'Rapporto cessato',
        RIATTIVAZIONE: 'Rapporto riattivato',
        DOCUMENTO_CARICATO: 'Documento caricato',
        DOCUMENTO_ELIMINATO: 'Documento eliminato',
        IMPORT_INIZIALE: 'Caricato dai fornitori iniziali'
    },

    async _caricaStorico(id) {
        const box = document.getElementById('fornStorico');
        if (!box) return;
        try {
            const snap = await db.collection('audit_log')
                .where('collezione', '==', 'fornitori')
                .where('documentoId', '==', id)
                .get();
            const righe = snap.docs.map(d => d.data()).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
            if (!righe.length) { box.innerHTML = '<div class="forn-empty-small">Nessuna modifica registrata.</div>'; return; }
            box.innerHTML = righe.map(r => {
                const det = r.dettagli || {};
                let extra = '';
                if (det.campiModificati && det.campiModificati.length) extra = 'Campi: ' + det.campiModificati.join(', ');
                else if (det.esito) extra = `Esito: ${(this.STATI[det.esito] || {}).label || det.esito}${det.media !== undefined ? ' · media ' + det.media : ''}`;
                else if (det.descrizione) extra = det.descrizione;
                else if (det.motivo) extra = det.motivo;
                const ts = r.timestamp ? new Date(r.timestamp) : null;
                return `<div class="forn-log-row">
                    <div class="forn-log-when">${ts ? ts.toLocaleDateString('it-IT') + ' ' + ts.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                    <div><strong>${escHtml(this.AZIONI_STORICO[r.azione] || r.azione)}</strong> — ${escHtml(r.utenteNome || r.utente || '')}
                        ${extra ? `<div style="font-size:0.8rem;color:var(--grigio-500);">${escHtml(extra)}</div>` : ''}</div>
                </div>`;
            }).join('');
        } catch (e) {
            box.innerHTML = `<div class="forn-empty-small">Storico non disponibile (${escHtml(e.message)}).</div>`;
        }
    },

    // ═══════════════════════════════════════════════════════════════════════
    // MODALE GENERICO (più largo di UI.showModal)
    // ═══════════════════════════════════════════════════════════════════════
    _apriModale(titolo, corpo, testoConferma, onConferma) {
        document.getElementById('fornModal')?.remove();
        const m = document.createElement('div');
        m.id = 'fornModal';
        m.className = 'forn-modal-bg';
        m.innerHTML = `
            <div class="forn-modal" role="dialog" aria-modal="true">
                <div class="forn-modal-head">
                    <h2>${titolo}</h2>
                    <button class="forn-modal-x" onclick="Fornitori._chiudiModale()" aria-label="Chiudi"><i class="fas fa-times"></i></button>
                </div>
                <div class="forn-modal-body">${corpo}</div>
                <div class="forn-modal-foot">
                    <button class="btn btn-secondary" onclick="Fornitori._chiudiModale()"><i class="fas fa-times"></i> Annulla</button>
                    <button class="btn btn-primary" id="fornModalOk"><i class="fas fa-check"></i> ${testoConferma}</button>
                </div>
            </div>`;
        document.body.appendChild(m);
        document.getElementById('fornModalOk').onclick = async () => {
            const btn = document.getElementById('fornModalOk');
            btn.disabled = true;
            try {
                const esito = await onConferma();
                if (esito !== false) this._chiudiModale();
            } finally {
                if (document.getElementById('fornModalOk')) btn.disabled = false;
            }
        };
    },

    _chiudiModale() {
        document.getElementById('fornModal')?.remove();
    },

    // ═══════════════════════════════════════════════════════════════════════
    // FORM FORNITORE (nuovo / modifica)
    // ═══════════════════════════════════════════════════════════════════════
    apriForm(id) {
        const f = id ? (this._fornitori.find(x => x.id === id) || {}) : { attivo: true, qualificaMetodi: [] };
        const v = k => escAttr(f[k] || '');
        const opt = (obj, sel, labelFn) => Object.entries(obj).map(([k, o]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${escHtml(labelFn(o))}</option>`).join('');
        this._certRows = 0;

        const corpo = `
            <div class="forn-form">
                <fieldset><legend>Anagrafica</legend>
                    <div class="forn-form-grid">
                        <label>Nome commerciale *<input class="form-input" id="ff_nomeCommerciale" value="${v('nomeCommerciale')}" placeholder="es. GoodBarber"></label>
                        <label>Ragione sociale *<input class="form-input" id="ff_ragioneSociale" value="${v('ragioneSociale')}" placeholder="Entità legale con cui si contratta"></label>
                        <label class="forn-span2">Sede legale<input class="form-input" id="ff_sede" value="${v('sede')}"></label>
                        <label>Paese<input class="form-input" id="ff_paese" value="${v('paese')}"></label>
                        <label>P.IVA / n. registrazione<input class="form-input" id="ff_partitaIva" value="${v('partitaIva')}"></label>
                        <label>Sito web<input class="form-input" id="ff_sitoWeb" value="${v('sitoWeb')}" placeholder="https://"></label>
                        <label>In uso dal<input class="form-input" id="ff_inUsoDal" value="${v('inUsoDal')}" placeholder="es. 2019 oppure 03/2021"></label>
                        <label>Referente (nome)<input class="form-input" id="ff_referenteNome" value="${v('referenteNome')}"></label>
                        <label>Referente (email)<input class="form-input" id="ff_referenteEmail" value="${v('referenteEmail')}"></label>
                        <label>Referente (telefono)<input class="form-input" id="ff_referenteTelefono" value="${v('referenteTelefono')}"></label>
                        <label>Assistenza (link o email)<input class="form-input" id="ff_contattoSupporto" value="${v('contattoSupporto')}"></label>
                    </div>
                </fieldset>

                <fieldset><legend>Fornitura</legend>
                    <div class="forn-form-grid">
                        <label>Categoria *<select class="filter-select" id="ff_categoria"><option value="">—</option>${opt(this.CATEGORIE, f.categoria, o => o.label)}</select></label>
                        <label>Criticità *<select class="filter-select" id="ff_criticita"><option value="">—</option>${opt(this.CRITICITA, f.criticita, o => o.label + ' — ' + o.desc)}</select></label>
                        <label class="forn-span2">Cosa fornisce *<textarea class="form-input" id="ff_fornitura" rows="2">${escHtml(f.fornitura || '')}</textarea></label>
                        <label class="forn-span2">Come lo usiamo (servizi, prodotti, clienti coinvolti)<textarea class="form-input" id="ff_utilizzo" rows="2">${escHtml(f.utilizzo || '')}</textarea></label>
                        <label class="forn-span2">Perché questa criticità<input class="form-input" id="ff_motivazioneCriticita" value="${v('motivazioneCriticita')}"></label>
                        <label class="forn-span2">Contratto / piano sottoscritto<input class="form-input" id="ff_contratto" value="${v('contratto')}" placeholder="es. Piano Reseller, pagamento a consumo, gratuito…"></label>
                        <label class="forn-span2">Alternative in caso di problemi (piano B)<input class="form-input" id="ff_alternative" value="${v('alternative')}"></label>
                    </div>
                </fieldset>

                <fieldset><legend>Garanzie del fornitore</legend>
                    <div id="ff_certRows"></div>
                    <button type="button" class="btn btn-sm btn-secondary" onclick="Fornitori._aggiungiCertRow()"><i class="fas fa-plus"></i> Aggiungi certificazione</button>
                    <div class="forn-form-grid" style="margin-top:0.75rem;">
                        <label class="forn-span2">Dove stanno i dati<input class="form-input" id="ff_localizzazioneDati" value="${v('localizzazioneDati')}"></label>
                        <label class="forn-span2">Protezione dati (DPA)<input class="form-input" id="ff_dpa" value="${v('dpa')}"></label>
                        <label class="forn-span2">Livello di servizio (SLA)<input class="form-input" id="ff_sla" value="${v('sla')}"></label>
                        <label>Trust center (link)<input class="form-input" id="ff_paginaTrust" value="${v('paginaTrust')}"></label>
                        <label>Stato del servizio (link)<input class="form-input" id="ff_paginaStatus" value="${v('paginaStatus')}"></label>
                        <label>Dati verificati il<input type="date" class="form-input" id="ff_dataVerificaDati" value="${v('dataVerificaDati')}"></label>
                    </div>
                </fieldset>

                <fieldset><legend>Qualifica iniziale</legend>
                    <div class="forn-checks">
                        ${Object.entries(this.METODI_QUALIFICA).map(([k, l]) => `
                            <label><input type="checkbox" name="ff_metodo" value="${k}" ${(f.qualificaMetodi || []).includes(k) ? 'checked' : ''}> ${escHtml(l)}</label>`).join('')}
                    </div>
                    <div class="forn-form-grid" style="margin-top:0.75rem;">
                        <label class="forn-span2">Note sulla qualifica<textarea class="form-input" id="ff_qualificaNote" rows="2">${escHtml(f.qualificaNote || '')}</textarea></label>
                    </div>
                    <p class="forn-hint">Data, autore ed esito della qualifica si compilano da soli alla prima valutazione.</p>
                </fieldset>

                <fieldset><legend>Altro</legend>
                    <div class="forn-form-grid">
                        ${id ? `<label>Stato<select class="filter-select" id="ff_stato">${opt(this.STATI, f.stato || 'in_valutazione', o => o.label)}</select></label>` : ''}
                        <label class="forn-span2">Note generali<textarea class="form-input" id="ff_note" rows="2">${escHtml(f.note || '')}</textarea></label>
                    </div>
                    ${id ? '<p class="forn-hint">Lo stato di norma lo decide la valutazione. Cambialo a mano solo con un motivo (es. sospensione): la modifica resta nello storico.</p>' : ''}
                </fieldset>
            </div>`;

        this._apriModale(id ? 'Modifica fornitore' : 'Nuovo fornitore', corpo, 'Salva', () => this._salvaForm(id));
        (f.certificazioni || []).forEach(c => this._aggiungiCertRow(c));
    },

    _aggiungiCertRow(c = {}) {
        const box = document.getElementById('ff_certRows');
        if (!box) return;
        const n = this._certRows++;
        const div = document.createElement('div');
        div.className = 'forn-cert-row';
        div.dataset.certRow = '1';
        div.innerHTML = `
            <input class="form-input" data-k="nome" placeholder="Certificazione (es. ISO/IEC 27001)" value="${escAttr(c.nome || '')}">
            <input class="form-input" data-k="ambito" placeholder="Ambito (facoltativo)" value="${escAttr(c.ambito || '')}">
            <input class="form-input" type="date" data-k="scadenza" title="Scadenza (se nota)" value="${escAttr(c.scadenza || '')}">
            <input class="form-input" data-k="fonte" placeholder="Link alla fonte" value="${escAttr(c.fonte || '')}">
            <button type="button" class="btn btn-sm btn-secondary" title="Rimuovi" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>`;
        div.id = 'ff_cert_' + n;
        box.appendChild(div);
    },

    _leggiForm() {
        const g = k => (document.getElementById('ff_' + k)?.value || '').trim();
        const dati = {};
        ['nomeCommerciale', 'ragioneSociale', 'sede', 'paese', 'partitaIva', 'sitoWeb', 'inUsoDal',
         'referenteNome', 'referenteEmail', 'referenteTelefono', 'contattoSupporto',
         'categoria', 'criticita', 'fornitura', 'utilizzo', 'motivazioneCriticita', 'contratto', 'alternative',
         'localizzazioneDati', 'dpa', 'sla', 'paginaTrust', 'paginaStatus', 'dataVerificaDati',
         'qualificaNote', 'note'].forEach(k => { dati[k] = g(k); });
        if (document.getElementById('ff_stato')) dati.stato = g('stato');
        dati.qualificaMetodi = Array.from(document.querySelectorAll('input[name="ff_metodo"]:checked')).map(i => i.value);
        dati.certificazioni = Array.from(document.querySelectorAll('#ff_certRows [data-cert-row]')).map(r => {
            const c = {};
            r.querySelectorAll('[data-k]').forEach(i => { c[i.dataset.k] = (i.value || '').trim(); });
            return c;
        }).filter(c => c.nome);
        return dati;
    },

    async _salvaForm(id) {
        const dati = this._leggiForm();
        if (!dati.nomeCommerciale && !dati.ragioneSociale) { UI.showWarning('Indica almeno il nome del fornitore'); return false; }
        if (!dati.ragioneSociale) dati.ragioneSociale = dati.nomeCommerciale;
        if (!dati.nomeCommerciale) dati.nomeCommerciale = dati.ragioneSociale;
        if (!dati.categoria || !dati.criticita || !dati.fornitura) { UI.showWarning('Categoria, criticità e “cosa fornisce” sono obbligatori'); return false; }

        const audit = DataService._getAuditFields();
        try {
            if (id) {
                const prima = this._fornitori.find(x => x.id === id) || {};
                const cambiati = Object.keys(dati).filter(k => JSON.stringify(dati[k] ?? '') !== JSON.stringify(prima[k] ?? ''));
                if (!cambiati.length) return true;
                await db.collection(this.COLL).doc(id).update({ ...dati, ...audit });
                DataService._logAudit('UPDATE', 'fornitori', id, { campiModificati: cambiati, ...(cambiati.includes('stato') ? { statoDa: prima.stato || '', statoA: dati.stato } : {}) });
                UI.showSuccess('Scheda fornitore aggiornata');
            } else {
                const nuovo = {
                    ...dati,
                    codice: this._prossimoCodice(),
                    stato: 'in_valutazione',
                    attivo: true,
                    createdAt: new Date().toISOString(),
                    createdBy: audit.ultimaModificaNome,
                    ...audit
                };
                const ref = await db.collection(this.COLL).add(nuovo);
                DataService._logAudit('CREATE', 'fornitori', ref.id, { codice: nuovo.codice, nome: nuovo.nomeCommerciale });
                UI.showSuccess('Fornitore aggiunto. Ora fai la prima valutazione.');
                id = ref.id;
            }
            await this._carica();
            this._chiudiModale();
            UI.showPage('fornitori', id);
            return true;
        } catch (e) {
            console.error(e);
            UI.showError('Salvataggio non riuscito: ' + e.message);
            return false;
        }
    },

    _prossimoCodice() {
        const max = this._fornitori.reduce((m, f) => {
            const n = parseInt(String(f.codice || '').replace(/\D/g, ''), 10);
            return isNaN(n) ? m : Math.max(m, n);
        }, 0);
        return 'FOR-' + String(max + 1).padStart(3, '0');
    },

    // ═══════════════════════════════════════════════════════════════════════
    // VALUTAZIONE CON PUNTEGGIO
    // ═══════════════════════════════════════════════════════════════════════
    apriValutazione(id) {
        const f = this._fornitori.find(x => x.id === id);
        if (!f) return;
        const ultima = this.valutazioniDi(id)[0];
        const anno = new Date().getFullYear();

        const corpo = `
            <div class="forn-form">
                <p style="margin-top:0;color:var(--grigio-700);">
                    Valuta <strong>${escHtml(f.nomeCommerciale || f.ragioneSociale)}</strong> sul periodo indicato.
                    Dai un voto da 1 a 5 a ogni criterio: l’esito si calcola da solo.
                    ${ultima ? `<br><span style="font-size:0.85rem;color:var(--grigio-500);">Ultima valutazione: ${this._fmt(ultima.data)}, media ${escHtml(String(ultima.media).replace('.', ','))}.</span>` : ''}
                </p>
                <div class="forn-form-grid">
                    <label>Data valutazione<input type="date" class="form-input" id="fv_data" value="${this._oggi()}"></label>
                    <label>Periodo considerato<input class="form-input" id="fv_periodo" value="${ultima ? escAttr(this._fmt(ultima.data) + ' – oggi') : 'Anno ' + (anno - 1) + '–' + anno}"></label>
                </div>
                <div style="margin-top:1rem;">
                    ${this.CRITERI.map(c => `
                        <div class="forn-crit">
                            <div class="forn-crit-head"><strong>${c.label}</strong><span>${c.desc}</span></div>
                            <div class="forn-stars" role="radiogroup" aria-label="${escAttr(c.label)}">
                                ${[1, 2, 3, 4, 5].map(n => `
                                    <label title="${escAttr(this.SCALA[n])}">
                                        <input type="radio" name="fv_${c.id}" value="${n}" onchange="Fornitori._aggiornaEsito()">
                                        <span>${n}</span>
                                    </label>`).join('')}
                            </div>
                        </div>`).join('')}
                </div>
                <div class="forn-legend">${Object.entries(this.SCALA).map(([k, v]) => `<span><strong>${k}</strong> ${v}</span>`).join('')}</div>

                <div class="forn-esito-box" id="fv_esitoBox">Assegna un voto a tutti i criteri per vedere l’esito proposto.</div>

                <div class="forn-form-grid">
                    <label>Esito<select class="filter-select" id="fv_esito" onchange="Fornitori._aggiornaEsito()">
                        <option value="">(proposto automaticamente)</option>
                        ${['qualificato', 'qualificato_riserva', 'sospeso', 'non_qualificato'].map(k => `<option value="${k}">${this.STATI[k].label}</option>`).join('')}
                    </select></label>
                    <label id="fv_motivazioneWrap" class="hidden">Motivazione (obbligatoria se cambi l’esito)<input class="form-input" id="fv_motivazioneEsito"></label>
                    <label class="forn-span2">Note (fatti a supporto: disservizi, ritardi, punti di forza…)<textarea class="form-input" id="fv_note" rows="3"></textarea></label>
                    <label class="forn-span2">Azioni decise (obbligatorie se l’esito non è “qualificato”)<textarea class="form-input" id="fv_azioni" rows="2"></textarea></label>
                </div>
                <p class="forn-hint">Valutatore: ${escHtml(AuthService.getUserName())}. Una valutazione salvata non si può cancellare: per correggerla se ne registra una nuova.</p>
            </div>`;

        this._apriModale(`<i class="fas fa-star"></i> Valutazione fornitore`, corpo, 'Registra valutazione', () => this._salvaValutazione(id));
    },

    _leggiPunteggi() {
        const p = {};
        this.CRITERI.forEach(c => {
            const sel = document.querySelector(`input[name="fv_${c.id}"]:checked`);
            if (sel) p[c.id] = Number(sel.value);
        });
        return p;
    },

    _aggiornaEsito() {
        const p = this._leggiPunteggi();
        const box = document.getElementById('fv_esitoBox');
        const override = document.getElementById('fv_esito')?.value || '';
        const n = Object.keys(p).length;
        let proposto = null;
        if (n === this.CRITERI.length) {
            const media = Object.values(p).reduce((s, x) => s + x, 0) / n;
            proposto = this.esitoDaMedia(media, p);
            box.innerHTML = `Media <strong>${media.toFixed(2).replace('.', ',')}</strong> → esito proposto ${this._badgeStato(proposto)}`;
        } else {
            box.textContent = `Hai votato ${n} criteri su ${this.CRITERI.length}.`;
        }
        const wrap = document.getElementById('fv_motivazioneWrap');
        if (wrap) wrap.classList.toggle('hidden', !(override && proposto && override !== proposto));
    },

    async _salvaValutazione(id) {
        const f = this._fornitori.find(x => x.id === id);
        const p = this._leggiPunteggi();
        if (Object.keys(p).length !== this.CRITERI.length) { UI.showWarning('Dai un voto a tutti i criteri'); return false; }
        const data = document.getElementById('fv_data').value || this._oggi();
        if (data > this._oggi()) { UI.showWarning('La data della valutazione non può essere nel futuro'); return false; }
        const media = Math.round((Object.values(p).reduce((s, x) => s + x, 0) / this.CRITERI.length) * 100) / 100;
        const proposto = this.esitoDaMedia(media, p);
        const scelto = document.getElementById('fv_esito').value || proposto;
        const motivazione = (document.getElementById('fv_motivazioneEsito').value || '').trim();
        const note = (document.getElementById('fv_note').value || '').trim();
        const azioni = (document.getElementById('fv_azioni').value || '').trim();
        if (scelto !== proposto && !motivazione) { UI.showWarning('Hai cambiato l’esito proposto: scrivi la motivazione'); return false; }
        if (scelto !== 'qualificato' && !azioni) { UI.showWarning('Con questo esito vanno indicate le azioni decise'); return false; }

        const utente = AuthService.getUtenteCorrente() || {};
        const valutatoreNome = AuthService.getUserName();
        const val = {
            fornitoreId: id,
            fornitoreCodice: f.codice || '',
            fornitoreNome: f.nomeCommerciale || f.ragioneSociale,
            data,
            periodo: (document.getElementById('fv_periodo').value || '').trim(),
            punteggi: p,
            media,
            esitoProposto: proposto,
            esito: scelto,
            motivazioneEsito: scelto !== proposto ? motivazione : '',
            note,
            azioni,
            criticitaAlMomento: f.criticita || '',
            valutatoreUid: utente.uid || AuthService.getUserId() || '',
            valutatoreEmail: utente.email || '',
            valutatoreNome,
            createdAt: new Date().toISOString()
        };

        // Aggiorna la scheda solo se questa è la valutazione più recente
        const piuRecente = !f.dataUltimaValutazione || data >= f.dataUltimaValutazione;
        const agg = { ...DataService._getAuditFields() };
        if (piuRecente) {
            agg.stato = scelto;
            agg.dataUltimaValutazione = data;
            agg.punteggioUltimo = media;
        }
        if (!f.qualificaData) {
            agg.qualificaData = data;
            agg.qualificaDa = valutatoreNome;
            agg.qualificaEsito = scelto;
        }

        try {
            const batch = db.batch();
            const ref = db.collection(this.COLL_VAL).doc();
            batch.set(ref, val);
            batch.update(db.collection(this.COLL).doc(id), agg);
            await batch.commit();
            DataService._logAudit('VALUTAZIONE', 'fornitori', id, { valutazioneId: ref.id, media, esito: scelto, data });
            UI.showSuccess('Valutazione registrata');
            await this._carica();
            this._chiudiModale();
            UI.showPage('fornitori', id);
            return true;
        } catch (e) {
            console.error(e);
            UI.showError('Salvataggio non riuscito: ' + e.message);
            return false;
        }
    },

    // ═══════════════════════════════════════════════════════════════════════
    // CESSAZIONE / RIATTIVAZIONE / ELIMINAZIONE
    // ═══════════════════════════════════════════════════════════════════════
    cessaRapporto(id) {
        this._apriModale('Cessare il rapporto con il fornitore?', `
            <p>Il fornitore esce dal registro attivo ma la scheda e tutte le valutazioni restano archiviate (servono per l’audit).</p>
            <div class="forn-form-grid">
                <label>Data cessazione<input type="date" class="form-input" id="fc_data" value="${this._oggi()}"></label>
                <label class="forn-span2">Motivo *<input class="form-input" id="fc_motivo" placeholder="es. sostituito da…, servizio non più usato"></label>
            </div>`, 'Cessa rapporto', async () => {
            const motivo = (document.getElementById('fc_motivo').value || '').trim();
            const data = document.getElementById('fc_data').value || this._oggi();
            if (!motivo) { UI.showWarning('Indica il motivo'); return false; }
            try {
                await db.collection(this.COLL).doc(id).update({ attivo: false, dataCessazione: data, motivoCessazione: motivo, ...DataService._getAuditFields() });
                DataService._logAudit('CESSAZIONE', 'fornitori', id, { motivo, data });
                await this._carica();
                this._chiudiModale();
                UI.showPage('fornitori', id);
                return true;
            } catch (e) { UI.showError(e.message); return false; }
        });
    },

    async riattiva(id) {
        const ok = await UI.showModal({ title: 'Riattivare il fornitore?', content: '<p>Torna nel registro attivo. Ricordati di rivalutarlo.</p>', confirmText: 'Riattiva' });
        if (!ok) return;
        try {
            await db.collection(this.COLL).doc(id).update({ attivo: true, dataCessazione: '', motivoCessazione: '', ...DataService._getAuditFields() });
            DataService._logAudit('RIATTIVAZIONE', 'fornitori', id, {});
            await this._carica();
            UI.showPage('fornitori', id);
        } catch (e) { UI.showError(e.message); }
    },

    async elimina(id) {
        if (!AuthService.isSuperAdmin()) return;
        if (this.valutazioniDi(id).length) { UI.showWarning('Un fornitore con valutazioni non si elimina: usa “Cessa rapporto”.'); return; }
        const ok = await UI.showModal({
            title: 'Eliminare definitivamente?',
            content: '<p>Usalo solo per schede create per errore. Per un fornitore reale usa “Cessa rapporto”.</p>',
            confirmText: 'Elimina', confirmClass: 'btn-danger'
        });
        if (!ok) return;
        try {
            await db.collection(this.COLL).doc(id).delete();
            DataService._logAudit('DELETE', 'fornitori', id, {});
            await this._carica();
            UI.showPage('fornitori');
        } catch (e) { UI.showError(e.message); }
    },

    // ═══════════════════════════════════════════════════════════════════════
    // FORNITORI INIZIALI (public/js/data/fornitori-iniziali.js, caricato su richiesta)
    // ═══════════════════════════════════════════════════════════════════════
    /** Carica il file dei fornitori iniziali solo quando serve (non pesa sul login) */
    _caricaSeed() {
        if (window.FORNITORI_INIZIALI) return Promise.resolve();
        return new Promise(resolve => {
            const s = document.createElement('script');
            s.src = 'js/data/fornitori-iniziali.js?v=' + encodeURIComponent(window.CRM_APP_VERSION || '1');
            s.onload = () => resolve();
            s.onerror = () => { console.warn('Fornitori iniziali non disponibili'); resolve(); };
            document.head.appendChild(s);
        });
    },

    _seedMancanti() {
        const seed = window.FORNITORI_INIZIALI || [];
        const presenti = new Set(this._fornitori.map(f => f.id));
        return seed.filter(s => !presenti.has(s.id));
    },

    async caricaIniziali() {
        const mancanti = this._seedMancanti();
        if (!mancanti.length) return;
        const ok = await UI.showModal({
            title: 'Caricare i fornitori iniziali?',
            content: `<p>Verranno aggiunti ${mancanti.length} fornitori:</p>
                <p style="color:var(--grigio-700);">${mancanti.map(m => escHtml(m.nomeCommerciale)).join(', ')}.</p>
                <p>Partono come <strong>“Da valutare”</strong>: la prima valutazione con punteggio la fai tu.</p>`,
            confirmText: 'Carica'
        });
        if (!ok) return;
        try {
            const audit = DataService._getAuditFields();
            const batch = db.batch();
            let n = this._fornitori.reduce((m, f) => {
                const x = parseInt(String(f.codice || '').replace(/\D/g, ''), 10);
                return isNaN(x) ? m : Math.max(m, x);
            }, 0);
            mancanti.forEach(s => {
                const { id, ...dati } = s;
                n++;
                batch.set(db.collection(this.COLL).doc(id), {
                    ...dati,
                    codice: 'FOR-' + String(n).padStart(3, '0'),
                    stato: 'in_valutazione',
                    attivo: true,
                    createdAt: new Date().toISOString(),
                    createdBy: audit.ultimaModificaNome,
                    ...audit
                });
            });
            await batch.commit();
            mancanti.forEach(s => DataService._logAudit('IMPORT_INIZIALE', 'fornitori', s.id, { nome: s.nomeCommerciale }));
            UI.showSuccess(`${mancanti.length} fornitori caricati`);
            this.render();
        } catch (e) {
            console.error(e);
            UI.showError('Caricamento non riuscito: ' + e.message);
        }
    },

    // ═══════════════════════════════════════════════════════════════════════
    // ESPORTAZIONI PER L'AUDIT
    // ═══════════════════════════════════════════════════════════════════════
    esportaExcel() {
        if (typeof XLSX === 'undefined') { UI.showWarning('Libreria Excel non ancora caricata, riprova tra qualche secondo'); return; }
        const lab = (obj, k) => (obj[k] || {}).label || k || '';
        const elenco = this._fornitori.map(f => ({
            'Codice': f.codice || '',
            'Fornitore': f.nomeCommerciale || '',
            'Ragione sociale': f.ragioneSociale || '',
            'Sede': f.sede || '',
            'Paese': f.paese || '',
            'P.IVA / n. registrazione': f.partitaIva || '',
            'Categoria': lab(this.CATEGORIE, f.categoria),
            'Cosa fornisce': f.fornitura || '',
            'Come lo usiamo': f.utilizzo || '',
            'Criticità': lab(this.CRITICITA, f.criticita),
            'In uso dal': f.inUsoDal || '',
            'Stato': f.attivo === false ? 'Rapporto cessato' : lab(this.STATI, f.stato || 'in_valutazione'),
            'Ultima valutazione': this._fmt(f.dataUltimaValutazione).replace('—', ''),
            'Punteggio': f.punteggioUltimo ?? '',
            'Prossima rivalutazione': this._fmt(this.prossimaRivalutazione(f)).replace('—', ''),
            'Qualifica: metodo': (f.qualificaMetodi || []).map(m => this.METODI_QUALIFICA[m] || m).join('; '),
            'Qualifica: data': this._fmt(f.qualificaData).replace('—', ''),
            'Certificazioni': (f.certificazioni || []).map(c => c.nome + (c.scadenza ? ' (scad. ' + this._fmt(c.scadenza) + ')' : '')).join('; '),
            'Dove stanno i dati': f.localizzazioneDati || '',
            'DPA': f.dpa || '',
            'SLA': f.sla || '',
            'Alternative': f.alternative || '',
            'Referente': [f.referenteNome, f.referenteEmail, f.referenteTelefono].filter(Boolean).join(' · '),
            'Assistenza': f.contattoSupporto || '',
            'Cessazione': f.attivo === false ? `${this._fmt(f.dataCessazione)} — ${f.motivoCessazione || ''}` : ''
        }));
        const valutazioni = [...this._valutazioni].sort((a, b) => (a.fornitoreCodice || '').localeCompare(b.fornitoreCodice || '') || (a.data || '').localeCompare(b.data || '')).map(v => {
            const r = { 'Codice': v.fornitoreCodice || '', 'Fornitore': v.fornitoreNome || '', 'Data': this._fmt(v.data), 'Periodo': v.periodo || '' };
            this.CRITERI.forEach(c => { r[c.label] = (v.punteggi || {})[c.id] ?? ''; });
            Object.assign(r, {
                'Media': v.media,
                'Esito proposto': lab(this.STATI, v.esitoProposto),
                'Esito': lab(this.STATI, v.esito),
                'Motivazione esito': v.motivazioneEsito || '',
                'Note': v.note || '',
                'Azioni decise': v.azioni || '',
                'Valutatore': v.valutatoreNome || ''
            });
            return r;
        });
        const certificati = [];
        this._fornitori.forEach(f => (f.certificazioni || []).forEach(c => certificati.push({
            'Codice': f.codice || '', 'Fornitore': f.nomeCommerciale || '', 'Certificazione': c.nome || '',
            'Ambito': c.ambito || '', 'Scadenza': this._fmt(c.scadenza).replace('—', 'non pubblicata'), 'Fonte': c.fonte || ''
        })));
        const criteri = [
            ...this.CRITERI.map(c => ({ 'Voce': 'Criterio: ' + c.label, 'Descrizione': c.desc })),
            ...Object.entries(this.SCALA).map(([k, v]) => ({ 'Voce': 'Punteggio ' + k, 'Descrizione': v })),
            { 'Voce': 'Esito qualificato', 'Descrizione': `media ≥ ${this.SOGLIE.qualificato} e nessun criterio a 1` },
            { 'Voce': 'Esito con riserva', 'Descrizione': `media da ${this.SOGLIE.riserva} a ${this.SOGLIE.qualificato}, oppure un criterio a 1` },
            { 'Voce': 'Esito non qualificato', 'Descrizione': `media < ${this.SOGLIE.riserva}` },
            ...Object.entries(this.MESI_RIVALUTAZIONE).map(([k, m]) => ({ 'Voce': 'Rivalutazione criticità ' + k, 'Descrizione': `ogni ${m} mesi` }))
        ];

        const wb = XLSX.utils.book_new();
        const add = (righe, nome, larghezze) => {
            const ws = XLSX.utils.json_to_sheet(righe.length ? righe : [{ '': 'Nessun dato' }]);
            if (larghezze) ws['!cols'] = larghezze.map(w => ({ wch: w }));
            XLSX.utils.book_append_sheet(wb, ws, nome);
        };
        add(elenco, 'Elenco fornitori', [9, 16, 28, 30, 10, 18, 20, 40, 40, 9, 10, 20, 12, 9, 14, 40, 12, 50, 30, 30, 30, 30, 30, 30, 30]);
        add(valutazioni, 'Valutazioni', [9, 16, 11, 18, 10, 10, 10, 10, 10, 7, 18, 18, 30, 40, 40, 20]);
        add(certificati, 'Certificazioni', [9, 16, 28, 30, 14, 50]);
        add(criteri, 'Criteri', [32, 80]);
        XLSX.writeFile(wb, `Registro_fornitori_qualificati_${this._oggi()}.xlsx`);
    },

    _apriStampa(titolo, corpo) {
        const w = window.open('', '_blank');
        if (!w) { UI.showWarning('Il browser ha bloccato la finestra di stampa: consenti i popup per crm.comune.digital'); return; }
        w.document.write(`<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>${escHtml(titolo)}</title>
            <link href="https://fonts.googleapis.com/css2?family=Titillium+Web:wght@400;600;700&display=swap" rel="stylesheet">
            <style>
                @page { size: A4 landscape; margin: 12mm; }
                body { font-family: 'Titillium Web', Arial, sans-serif; color: #1E1E1E; font-size: 10.5pt; margin: 0; }
                h1 { color: #145284; font-size: 18pt; margin: 0 0 2px; }
                h2 { color: #145284; font-size: 13pt; margin: 18px 0 6px; border-bottom: 2px solid #D1E2F2; padding-bottom: 3px; }
                h4 { color: #145284; margin: 10px 0 4px; }
                .sub { color: #4A4A4A; margin-bottom: 10px; }
                table { width: 100%; border-collapse: collapse; margin-top: 6px; }
                th { background: #145284; color: #fff; text-align: left; padding: 5px 6px; font-size: 9pt; }
                td { border-bottom: 1px solid #D9D9D9; padding: 5px 6px; vertical-align: top; font-size: 9pt; }
                tr { page-break-inside: avoid; }
                .meta { display: flex; justify-content: space-between; gap: 20px; font-size: 9pt; color: #4A4A4A; border: 1px solid #D9D9D9; border-radius: 6px; padding: 8px 12px; margin: 8px 0 14px; }
                .firme { display: flex; gap: 40px; margin-top: 30px; }
                .firme div { flex: 1; border-top: 1px solid #4A4A4A; padding-top: 4px; font-size: 9pt; color: #4A4A4A; }
                .k { color: #4A4A4A; width: 220px; }
                ul { margin: 2px 0; padding-left: 18px; }
                p { margin: 4px 0; }
                .badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 8.5pt; font-weight: 600; }
                @media print { .noprint { display: none; } }
                .noprint { margin: 10px 0; }
                .noprint button { background: #145284; color: #fff; border: 0; padding: 8px 16px; border-radius: 6px; font-family: inherit; font-size: 11pt; cursor: pointer; }
            </style></head><body>
            <div class="noprint"><button onclick="window.print()">Stampa / Salva in PDF</button></div>
            ${corpo}
            </body></html>`);
        w.document.close();
        setTimeout(() => { try { w.focus(); w.print(); } catch (e) { /* l'utente può usare il pulsante */ } }, 600);
    },

    _badgeStampa(stato) {
        const s = this.STATI[stato] || this.STATI.in_valutazione;
        return `<span class="badge" style="color:${s.color};background:${s.bg};">${s.label}</span>`;
    },

    stampaElenco() {
        const attivi = this._attivi();
        const cessati = this._fornitori.filter(f => f.attivo === false);
        const righe = lista => lista.map(f => `
            <tr>
                <td>${escHtml(f.codice || '')}</td>
                <td><strong>${escHtml(f.nomeCommerciale || '')}</strong><br><span style="color:#4A4A4A;">${escHtml(f.ragioneSociale || '')}${f.paese ? ' · ' + escHtml(f.paese) : ''}</span></td>
                <td>${escHtml(f.fornitura || '')}</td>
                <td>${escHtml((this.CRITICITA[f.criticita] || {}).label || '—')}</td>
                <td>${escHtml((f.certificazioni || []).map(c => c.nome).join(', ') || '—')}</td>
                <td>${f.attivo === false ? 'Cessato il ' + this._fmt(f.dataCessazione) : this._badgeStampa(f.stato)}</td>
                <td>${this._fmt(f.dataUltimaValutazione)}</td>
                <td>${f.punteggioUltimo !== undefined && f.punteggioUltimo !== null ? Number(f.punteggioUltimo).toFixed(2).replace('.', ',') : '—'}</td>
                <td>${f.attivo === false ? '—' : this._fmt(this.prossimaRivalutazione(f))}</td>
            </tr>`).join('');
        const testa = '<tr><th>Cod.</th><th>Fornitore</th><th>Cosa fornisce</th><th>Criticità</th><th>Certificazioni</th><th>Stato</th><th>Ult. valutazione</th><th>Punteggio</th><th>Prossima</th></tr>';

        this._apriStampa('Elenco fornitori qualificati', `
            <h1>Elenco fornitori qualificati</h1>
            <div class="sub">Growapp S.r.l. — Sistema di gestione per la qualità ISO 9001:2015, punto 8.4</div>
            <div class="meta">
                <span>Data di emissione: <strong>${this._fmt(this._oggi())}</strong></span>
                <span>Fornitori attivi: <strong>${attivi.length}</strong></span>
                <span>Qualificati: <strong>${attivi.filter(f => f.stato === 'qualificato').length}</strong></span>
                <span>Generato dal CRM da: <strong>${escHtml(AuthService.getUserName())}</strong></span>
            </div>
            <table><thead>${testa}</thead><tbody>${righe(attivi) || '<tr><td colspan="9">Nessun fornitore</td></tr>'}</tbody></table>
            ${cessati.length ? `<h2>Fornitori con rapporto cessato</h2><table><thead>${testa}</thead><tbody>${righe(cessati)}</tbody></table>` : ''}
            <h2>Criteri di qualifica e valutazione</h2>
            ${this._htmlMetodoTesto()}
            <div class="firme"><div>Redatto da</div><div>Approvato dalla Direzione</div><div>Data</div></div>
        `);
    },

    stampaScheda(id) {
        const f = this._fornitori.find(x => x.id === id);
        if (!f) return;
        const vals = this.valutazioniDi(id);
        const r = (k, v) => `<tr><td class="k">${k}</td><td>${v || '—'}</td></tr>`;
        this._apriStampa('Scheda fornitore ' + (f.codice || ''), `
            <h1>Scheda fornitore ${escHtml(f.codice || '')} — ${escHtml(f.nomeCommerciale || f.ragioneSociale)}</h1>
            <div class="sub">Growapp S.r.l. — Registro fornitori qualificati (ISO 9001:2015, punto 8.4) · stampata il ${this._fmt(this._oggi())}</div>
            <div class="meta">
                <span>Stato: ${f.attivo === false ? 'Rapporto cessato il ' + this._fmt(f.dataCessazione) : this._badgeStampa(f.stato)}</span>
                <span>Criticità: <strong>${escHtml((this.CRITICITA[f.criticita] || {}).label || '—')}</strong></span>
                <span>Ultimo punteggio: <strong>${f.punteggioUltimo !== undefined && f.punteggioUltimo !== null ? Number(f.punteggioUltimo).toFixed(2).replace('.', ',') : '—'}</strong></span>
                <span>Prossima rivalutazione: <strong>${this._fmt(this.prossimaRivalutazione(f))}</strong></span>
            </div>
            <h2>Anagrafica e fornitura</h2>
            <table>
                ${r('Ragione sociale', escHtml(f.ragioneSociale))}
                ${r('Sede', escHtml([f.sede, f.paese].filter(Boolean).join(' — ')))}
                ${r('P.IVA / n. registrazione', escHtml(f.partitaIva))}
                ${r('Sito web', escHtml(f.sitoWeb))}
                ${r('Referente', escHtml([f.referenteNome, f.referenteEmail, f.referenteTelefono].filter(Boolean).join(' · ')))}
                ${r('Assistenza', escHtml(f.contattoSupporto))}
                ${r('In uso dal', escHtml(f.inUsoDal))}
                ${r('Categoria', escHtml((this.CATEGORIE[f.categoria] || {}).label))}
                ${r('Cosa fornisce', escHtml(f.fornitura))}
                ${r('Come lo usiamo', escHtml(f.utilizzo))}
                ${r('Criticità', escHtml(((this.CRITICITA[f.criticita] || {}).label || '') + (f.motivazioneCriticita ? ' — ' + f.motivazioneCriticita : '')))}
                ${r('Contratto / piano', escHtml(f.contratto))}
                ${r('Alternative (piano B)', escHtml(f.alternative))}
            </table>
            <h2>Garanzie del fornitore</h2>
            <table>
                ${r('Certificazioni', (f.certificazioni || []).length ? '<ul>' + f.certificazioni.map(c => `<li>${escHtml(c.nome)}${c.ambito ? ' — ' + escHtml(c.ambito) : ''}${c.scadenza ? ' · scade ' + this._fmt(c.scadenza) : ''}${c.fonte ? '<br><span style="color:#4A4A4A;">' + escHtml(c.fonte) + '</span>' : ''}</li>`).join('') + '</ul>' : '')}
                ${r('Dove stanno i dati', escHtml(f.localizzazioneDati))}
                ${r('Protezione dati (DPA)', escHtml(f.dpa))}
                ${r('Livello di servizio (SLA)', escHtml(f.sla))}
                ${r('Trust center', escHtml(f.paginaTrust))}
                ${r('Stato del servizio', escHtml(f.paginaStatus))}
                ${r('Dati verificati il', this._fmt(f.dataVerificaDati))}
            </table>
            <h2>Qualifica iniziale</h2>
            <table>
                ${r('Metodo', (f.qualificaMetodi || []).length ? '<ul>' + f.qualificaMetodi.map(m => `<li>${escHtml(this.METODI_QUALIFICA[m] || m)}</li>`).join('') + '</ul>' : '')}
                ${r('Data', this._fmt(f.qualificaData))}
                ${r('Eseguita da', escHtml(f.qualificaDa))}
                ${r('Esito', f.qualificaEsito ? this._badgeStampa(f.qualificaEsito) : '')}
                ${r('Note', escHtml(f.qualificaNote))}
            </table>
            <h2>Valutazioni periodiche</h2>
            ${vals.length ? `<table><thead><tr><th>Data</th><th>Periodo</th>${this.CRITERI.map(c => `<th>${c.label}</th>`).join('')}<th>Media</th><th>Esito</th><th>Valutatore</th></tr></thead><tbody>
                ${vals.map(v => `<tr><td>${this._fmt(v.data)}</td><td>${escHtml(v.periodo || '')}</td>${this.CRITERI.map(c => `<td>${escHtml((v.punteggi || {})[c.id] ?? '')}</td>`).join('')}
                    <td><strong>${escHtml(String(v.media).replace('.', ','))}</strong></td><td>${this._badgeStampa(v.esito)}</td><td>${escHtml(v.valutatoreNome || '')}</td></tr>
                    ${v.note || v.azioni || v.motivazioneEsito ? `<tr><td></td><td colspan="${this.CRITERI.length + 4}">
                        ${v.motivazioneEsito ? '<p><strong>Motivazione esito:</strong> ' + escHtml(v.motivazioneEsito) + '</p>' : ''}
                        ${v.note ? '<p><strong>Note:</strong> ' + escHtml(v.note) + '</p>' : ''}
                        ${v.azioni ? '<p><strong>Azioni decise:</strong> ' + escHtml(v.azioni) + '</p>' : ''}</td></tr>` : ''}`).join('')}
            </tbody></table>` : '<p>Nessuna valutazione registrata.</p>'}
            ${f.note ? `<h2>Note</h2><p>${escHtml(f.note)}</p>` : ''}
            <div class="firme"><div>Valutatore</div><div>Approvato dalla Direzione</div><div>Data</div></div>
        `);
    },

    // ═══════════════════════════════════════════════════════════════════════
    // STILI (iniettati una volta)
    // ═══════════════════════════════════════════════════════════════════════
    _iniettaStili() {
        if (document.getElementById('fornitoriStyles')) return;
        const s = document.createElement('style');
        s.id = 'fornitoriStyles';
        s.textContent = `
            .forn-badge{display:inline-flex;align-items:center;gap:0.3rem;padding:0.2rem 0.6rem;border-radius:999px;font-size:0.78rem;font-weight:600;white-space:nowrap;}
            .forn-kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr));gap:0.75rem;margin-bottom:1rem;}
            .forn-kpi{background:#fff;border-radius:12px;box-shadow:var(--shadow-sm);padding:1rem;display:flex;align-items:center;gap:0.75rem;transition:transform .15s;}
            .forn-kpi:hover{transform:translateY(-2px);}
            .forn-kpi-icon{width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.25rem;flex-shrink:0;}
            .forn-kpi-val{font-size:1.6rem;font-weight:700;color:var(--grigio-900);line-height:1.1;}
            .forn-kpi-label{font-size:0.85rem;font-weight:600;color:var(--grigio-700);}
            .forn-kpi-sub{font-size:0.75rem;color:var(--grigio-500);}
            .forn-two-col{display:grid;grid-template-columns:2fr 1fr;gap:1rem;}
            .forn-two-col > .card{min-width:0;}
            .forn-todo{max-height:340px;overflow-y:auto;}
            .forn-todo-row{display:flex;align-items:center;gap:0.75rem;padding:0.6rem 1.25rem;border-bottom:1px solid var(--grigio-100,#F5F5F5);font-size:0.9rem;}
            .forn-todo-row > span{flex:1;min-width:0;}
            .forn-todo-row .btn{flex-shrink:0;width:auto;}
            .forn-todo-more{padding:0.6rem 1.25rem;color:var(--grigio-500);font-size:0.85rem;}
            .forn-empty-small{padding:1rem 1.25rem;color:var(--grigio-500);font-size:0.9rem;}
            .forn-crit-row{display:flex;align-items:center;gap:0.5rem;padding:0.35rem 0;}
            .forn-crit-row strong{margin-left:auto;font-size:1.1rem;}
            .forn-dot{width:10px;height:10px;border-radius:50%;display:inline-block;}
            .forn-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr));gap:1rem;margin-bottom:1rem;}
            .forn-card{background:#fff;border-radius:12px;box-shadow:var(--shadow-sm);padding:1rem 1.1rem;cursor:pointer;border-top:4px solid var(--blu-700);transition:transform .15s,box-shadow .15s;display:flex;flex-direction:column;gap:0.6rem;}
            .forn-card:hover{transform:translateY(-2px);box-shadow:var(--shadow-md);}
            .forn-card-cessato{opacity:0.65;border-top-color:var(--grigio-500);}
            .forn-card-top{display:flex;gap:0.75rem;align-items:flex-start;}
            .forn-card-icon{width:42px;height:42px;border-radius:10px;background:#D1E2F2;color:#145284;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;}
            .forn-card-code{font-size:0.75rem;color:var(--grigio-500);font-weight:600;text-transform:uppercase;letter-spacing:0.03em;}
            .forn-card-name{font-size:1.15rem;font-weight:700;color:var(--blu-700);line-height:1.2;}
            .forn-card-legal{font-size:0.8rem;color:var(--grigio-700);}
            .forn-card-desc{font-size:0.88rem;color:var(--grigio-700);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
            .forn-card-badges{display:flex;flex-wrap:wrap;gap:0.35rem;}
            .forn-score{font-size:1.5rem;font-weight:700;line-height:1;}
            .forn-score small{font-size:0.7rem;color:var(--grigio-500);font-weight:600;}
            .forn-progress{height:5px;background:#F5F5F5;border-radius:3px;overflow:hidden;margin-top:auto;}
            .forn-progress > div{height:100%;border-radius:3px;}
            .forn-progress-label{font-size:0.72rem;color:var(--grigio-500);margin-top:-0.3rem;}
            .forn-alert{display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;padding:1rem 1.25rem;border-radius:10px;margin-bottom:1rem;font-size:0.92rem;}
            .forn-alert-info{background:#E1F3FC;border-left:4px solid #0288D1;}
            .forn-alert-warn{background:#FFF8E1;border-left:4px solid #FFCC00;}
            .forn-alert-grey{background:#F5F5F5;border-left:4px solid #9B9B9B;}
            .forn-criteri summary{padding:1rem 1.25rem;cursor:pointer;font-weight:700;color:var(--blu-700);}
            .forn-criteri h4{color:var(--blu-700);margin:1rem 0 0.35rem;}
            .forn-criteri p,.forn-criteri li{font-size:0.9rem;color:var(--grigio-700);}
            .forn-actions{display:flex;flex-wrap:wrap;gap:0.5rem;padding:0 1.25rem 1.25rem;}
            .forn-fields{padding:0.5rem 1.25rem 1rem;}
            .forn-field{display:grid;grid-template-columns:minmax(120px,38%) 1fr;gap:0.75rem;padding:0.5rem 0;border-bottom:1px solid #F5F5F5;font-size:0.9rem;}
            .forn-field:last-child{border-bottom:0;}
            .forn-field-l{color:var(--grigio-500);font-weight:600;}
            .forn-field-v{color:var(--grigio-900);min-width:0;overflow-wrap:anywhere;}
            .forn-cert-list{margin:0;padding-left:1.1rem;}
            .forn-cert-list li{margin-bottom:0.25rem;}
            .forn-table th{font-size:0.78rem;white-space:normal;}
            .forn-table td{font-size:0.88rem;}
            .forn-note-row td{background:#FAFAFA;font-size:0.85rem;color:var(--grigio-700);}
            .forn-upload{display:grid;grid-template-columns:1.2fr 1.5fr 0.8fr 0.8fr auto;gap:0.5rem;align-items:center;}
            .forn-doc-row{display:flex;align-items:center;gap:0.75rem;padding:0.6rem 0;border-bottom:1px solid #F5F5F5;}
            .forn-log-row{display:grid;grid-template-columns:140px 1fr;gap:0.75rem;padding:0.5rem 0;border-bottom:1px solid #F5F5F5;font-size:0.88rem;}
            .forn-log-when{color:var(--grigio-500);}
            .forn-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;padding:1rem;}
            .forn-modal{background:#fff;border-radius:12px;max-width:880px;width:100%;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,0.2);}
            .forn-modal-head{display:flex;justify-content:space-between;align-items:center;padding:1.1rem 1.5rem;border-bottom:2px solid var(--grigio-300);}
            .forn-modal-head h2{margin:0;font-size:1.35rem;color:var(--blu-700);font-weight:700;}
            .forn-modal-x{background:none;border:0;font-size:1.4rem;color:var(--grigio-500);cursor:pointer;}
            .forn-modal-body{padding:1.25rem 1.5rem;overflow-y:auto;}
            .forn-modal-foot{display:flex;justify-content:flex-end;gap:0.75rem;padding:1rem 1.5rem;border-top:2px solid var(--grigio-300);}
            .forn-form fieldset{border:1px solid var(--grigio-300);border-radius:10px;padding:0.75rem 1rem 1rem;margin:0 0 1rem;}
            .forn-form legend{font-weight:700;color:var(--blu-700);padding:0 0.4rem;}
            .forn-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;}
            .forn-form-grid label,.forn-form > label{display:flex;flex-direction:column;gap:0.3rem;font-size:0.85rem;font-weight:600;color:var(--grigio-700);}
            .forn-form textarea{resize:vertical;font-family:inherit;}
            .forn-span2{grid-column:span 2;}
            .forn-checks{display:grid;gap:0.4rem;}
            .forn-checks label{display:flex;gap:0.5rem;align-items:flex-start;font-size:0.9rem;color:var(--grigio-700);cursor:pointer;}
            .forn-hint{font-size:0.8rem;color:var(--grigio-500);margin:0.6rem 0 0;}
            .forn-cert-row{display:grid;grid-template-columns:1.4fr 1fr 0.8fr 1.4fr auto;gap:0.4rem;margin-bottom:0.4rem;}
            .forn-crit{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:0.7rem 0;border-bottom:1px solid #F5F5F5;flex-wrap:wrap;}
            .forn-crit-head{display:flex;flex-direction:column;flex:1;min-width:200px;}
            .forn-crit-head span{font-size:0.8rem;color:var(--grigio-500);}
            .forn-stars{display:flex;gap:0.35rem;}
            .forn-stars label{cursor:pointer;}
            .forn-stars input{position:absolute;opacity:0;width:1px;height:1px;}
            .forn-stars span{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:8px;border:2px solid var(--grigio-300);font-weight:700;color:var(--grigio-700);transition:all .1s;}
            .forn-stars input:checked + span{background:var(--blu-700);border-color:var(--blu-700);color:#fff;}
            .forn-stars input:focus-visible + span{outline:3px solid #7BA7CE;}
            .forn-legend{display:flex;flex-wrap:wrap;gap:0.3rem 1rem;font-size:0.75rem;color:var(--grigio-500);margin:0.6rem 0 0;}
            .forn-esito-box{margin:1rem 0;padding:0.8rem 1rem;background:#F5F5F5;border-radius:8px;font-size:0.95rem;}
            @media (max-width: 900px){
                .forn-two-col{grid-template-columns:1fr;}
                .forn-upload{grid-template-columns:1fr 1fr;}
                .forn-upload > input[type=file],.forn-upload > input[type=text]{grid-column:span 2;}
            }
            @media (max-width: 640px){
                .forn-form-grid{grid-template-columns:1fr;}
                .forn-span2{grid-column:auto;}
                .forn-cert-row{grid-template-columns:1fr 1fr;}
                .forn-cert-row > input:first-child{grid-column:span 2;}
                .forn-field{grid-template-columns:1fr;gap:0.15rem;}
                .forn-log-row{grid-template-columns:1fr;gap:0.1rem;}
                .forn-modal-body{padding:1rem;}
                .forn-stars span{width:44px;height:44px;}
                .forn-todo-row{padding:0.6rem 0.9rem;flex-wrap:wrap;}
                .forn-todo-row > span{flex:1 1 calc(100% - 2rem);}
                .forn-todo-row .btn{margin-left:1.75rem;}
                .forn-kpi{padding:0.75rem;gap:0.6rem;}
                .forn-kpi-icon{width:36px;height:36px;font-size:1rem;}
                .forn-kpi-val{font-size:1.35rem;}
                .forn-actions .btn,.forn-upload .btn{width:auto;}
            }
        `;
        document.head.appendChild(s);
    }
};

window.Fornitori = Fornitori;

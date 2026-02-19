/**
 * 📌 PROMEMORIA PERSONALI
 * Ogni utente vede solo i propri promemoria
 * Collection Firestore: promemoria (con campo userId per filtrare)
 *
 * ⚡ PER RIMUOVERE: eliminare questo file + rimuovere le righe aggiunte in:
 *    - index.html (script + menu-item)
 *    - ui.js (case 'promemoria')
 *    - auth.js (canAccessPage 'promemoria')
 *    - app.js (validPages 'promemoria')
 */

const Promemoria = {
    promemoria: [],
    filtro: 'attivi', // attivi | tutti | completati

    async render() {
        const mainContent = document.getElementById('mainContent');

        try {
            await this.caricaPromemoria();

            mainContent.innerHTML = `
                <div class="page-header mb-3">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
                        <div>
                            <h1 style="font-size: 2rem; font-weight: 700; color: var(--blu-700); margin-bottom: 0.5rem;">
                                <i class="fas fa-bell"></i> I miei Promemoria
                            </h1>
                            <p style="color: var(--grigio-500);">
                                Promemoria personali visibili solo a te
                            </p>
                        </div>
                        <button class="btn btn-primary" onclick="Promemoria.mostraFormNuovo()">
                            <i class="fas fa-plus"></i> Nuovo Promemoria
                        </button>
                    </div>
                </div>

                <!-- Filtri -->
                <div style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
                    <button class="btn ${this.filtro === 'attivi' ? 'btn-primary' : 'btn-secondary'}" onclick="Promemoria.cambiaFiltro('attivi')" style="font-size: 0.875rem;">
                        <i class="fas fa-clock"></i> Attivi
                        <span id="badgeAttivi" style="background: white; color: var(--blu-700); border-radius: 50%; padding: 0 6px; margin-left: 4px; font-size: 0.75rem; font-weight: 700;"></span>
                    </button>
                    <button class="btn ${this.filtro === 'tutti' ? 'btn-primary' : 'btn-secondary'}" onclick="Promemoria.cambiaFiltro('tutti')" style="font-size: 0.875rem;">
                        <i class="fas fa-list"></i> Tutti
                    </button>
                    <button class="btn ${this.filtro === 'completati' ? 'btn-primary' : 'btn-secondary'}" onclick="Promemoria.cambiaFiltro('completati')" style="font-size: 0.875rem;">
                        <i class="fas fa-check-circle"></i> Completati
                    </button>
                </div>

                <!-- Form nuovo promemoria (nascosto di default) -->
                <div id="formNuovoPromemoria" class="hidden" style="margin-bottom: 1.5rem;">
                    ${this.renderFormNuovo()}
                </div>

                <!-- Lista promemoria -->
                <div id="listaPromemoria">
                    ${this.renderLista()}
                </div>
            `;

            // Aggiorna badge contatore
            this.aggiornaBadge();

        } catch (error) {
            console.error('Errore caricamento promemoria:', error);
            mainContent.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Errore</h3>
                    <p>Impossibile caricare i promemoria: ${error.message}</p>
                </div>
            `;
        }

        UI.hideLoading();
    },

    /**
     * Carica i promemoria dell'utente corrente da Firestore
     */
    async caricaPromemoria() {
        const userId = AuthService.getUserId();
        if (!userId) {
            console.warn('⚠️ Promemoria: userId non disponibile');
            this.promemoria = [];
            return;
        }

        console.log('📌 Caricamento promemoria per userId:', userId);

        // Query semplice senza orderBy (evita la necessità di indice composito)
        const snapshot = await db.collection('promemoria')
            .where('userId', '==', userId)
            .get();

        this.promemoria = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Ordina lato client per data scadenza
        this.promemoria.sort((a, b) => {
            if (!a.dataScadenza) return 1;
            if (!b.dataScadenza) return -1;
            return new Date(a.dataScadenza) - new Date(b.dataScadenza);
        });

        console.log(`📌 Caricati ${this.promemoria.length} promemoria`);
    },

    /**
     * Render del form per nuovo promemoria
     */
    renderFormNuovo(editing = null) {
        const p = editing || {};
        const titolo = editing ? 'Modifica Promemoria' : 'Nuovo Promemoria';
        const azione = editing
            ? `Promemoria.salvaModifica('${p.id}')`
            : 'Promemoria.salvaNuovo()';

        return `
            <div class="card" style="border-left: 4px solid var(--blu-700);">
                <div class="card-header">
                    <h3 style="margin: 0; color: var(--blu-700); font-weight: 700;">
                        <i class="fas fa-${editing ? 'edit' : 'plus-circle'}"></i> ${titolo}
                    </h3>
                </div>
                <div style="padding: 1.5rem;">
                    <div class="form-group" style="margin-bottom: 1rem;">
                        <label style="font-weight: 600; color: var(--grigio-700); margin-bottom: 0.5rem; display: block;">
                            <i class="fas fa-pen"></i> Di cosa devi ricordarti?
                        </label>
                        <textarea id="promTesto" rows="3" placeholder="Scrivi qui il testo del promemoria..."
                            style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 8px; font-family: 'Titillium Web'; font-size: 0.95rem; resize: vertical;"
                        >${p.testo || ''}</textarea>
                    </div>

                    <div style="display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem;">
                        <div class="form-group" style="flex: 1; min-width: 200px;">
                            <label style="font-weight: 600; color: var(--grigio-700); margin-bottom: 0.5rem; display: block;">
                                <i class="fas fa-calendar"></i> Quando ricordarmelo
                            </label>
                            <input type="date" id="promData" value="${p.dataScadenza ? p.dataScadenza.split('T')[0] : ''}"
                                style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 8px; font-family: 'Titillium Web'; font-size: 0.95rem;">
                        </div>
                        <div class="form-group" style="flex: 1; min-width: 200px;">
                            <label style="font-weight: 600; color: var(--grigio-700); margin-bottom: 0.5rem; display: block;">
                                <i class="fas fa-clock"></i> Ora (opzionale)
                            </label>
                            <input type="time" id="promOra" value="${p.ora || ''}"
                                style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 8px; font-family: 'Titillium Web'; font-size: 0.95rem;">
                        </div>
                        <div class="form-group" style="flex: 1; min-width: 200px;">
                            <label style="font-weight: 600; color: var(--grigio-700); margin-bottom: 0.5rem; display: block;">
                                <i class="fas fa-flag"></i> Priorità
                            </label>
                            <select id="promPriorita"
                                style="width: 100%; padding: 0.75rem; border: 1px solid var(--grigio-300); border-radius: 8px; font-family: 'Titillium Web'; font-size: 0.95rem;">
                                <option value="normale" ${(p.priorita || 'normale') === 'normale' ? 'selected' : ''}>🟢 Normale</option>
                                <option value="importante" ${p.priorita === 'importante' ? 'selected' : ''}>🟡 Importante</option>
                                <option value="urgente" ${p.priorita === 'urgente' ? 'selected' : ''}>🔴 Urgente</option>
                            </select>
                        </div>
                    </div>

                    <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                        <button class="btn btn-secondary" onclick="Promemoria.chiudiForm()">
                            <i class="fas fa-times"></i> Annulla
                        </button>
                        <button class="btn btn-primary" onclick="${azione}">
                            <i class="fas fa-save"></i> Salva
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Render della lista promemoria filtrata
     */
    renderLista() {
        const ora = new Date();
        let filtrati = this.promemoria;

        if (this.filtro === 'attivi') {
            filtrati = this.promemoria.filter(p => !p.completato);
        } else if (this.filtro === 'completati') {
            filtrati = this.promemoria.filter(p => p.completato);
        }

        if (filtrati.length === 0) {
            const msg = this.filtro === 'attivi'
                ? 'Nessun promemoria attivo. Tutto sotto controllo!'
                : this.filtro === 'completati'
                    ? 'Nessun promemoria completato.'
                    : 'Nessun promemoria. Creane uno!';

            return `
                <div class="empty-state" style="padding: 3rem;">
                    <i class="fas fa-bell-slash" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                    <h3>${msg}</h3>
                </div>
            `;
        }

        // Separa: scaduti, oggi, prossimi, futuri, senza data
        const scaduti = [];
        const oggi = [];
        const prossimi7gg = [];
        const futuri = [];
        const senzaData = [];

        const oggiStr = ora.toISOString().split('T')[0];
        const tra7gg = new Date(ora);
        tra7gg.setDate(tra7gg.getDate() + 7);
        const tra7ggStr = tra7gg.toISOString().split('T')[0];

        filtrati.forEach(p => {
            if (!p.dataScadenza) {
                senzaData.push(p);
            } else {
                const dataStr = p.dataScadenza.split('T')[0];
                if (p.completato) {
                    futuri.push(p); // I completati vanno tutti insieme
                } else if (dataStr < oggiStr) {
                    scaduti.push(p);
                } else if (dataStr === oggiStr) {
                    oggi.push(p);
                } else if (dataStr <= tra7ggStr) {
                    prossimi7gg.push(p);
                } else {
                    futuri.push(p);
                }
            }
        });

        let html = '';

        if (scaduti.length > 0) {
            html += this.renderGruppo('Scaduti', scaduti, 'var(--rosso-errore)', 'exclamation-triangle');
        }
        if (oggi.length > 0) {
            html += this.renderGruppo('Oggi', oggi, 'var(--blu-700)', 'calendar-day');
        }
        if (prossimi7gg.length > 0) {
            html += this.renderGruppo('Prossimi 7 giorni', prossimi7gg, 'var(--verde-700)', 'calendar-week');
        }
        if (futuri.length > 0) {
            const labelFuturi = this.filtro === 'completati' ? 'Completati' : 'Più avanti';
            html += this.renderGruppo(labelFuturi, futuri, 'var(--grigio-500)', 'calendar-alt');
        }
        if (senzaData.length > 0) {
            html += this.renderGruppo('Senza data', senzaData, 'var(--grigio-500)', 'sticky-note');
        }

        return html;
    },

    /**
     * Render di un gruppo di promemoria con header
     */
    renderGruppo(titolo, items, colore, icona) {
        let html = `
            <div style="margin-bottom: 1.5rem;">
                <h3 style="font-size: 0.875rem; font-weight: 700; color: ${colore}; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem; padding-left: 0.25rem;">
                    <i class="fas fa-${icona}"></i> ${titolo} (${items.length})
                </h3>
        `;

        items.forEach(p => {
            html += this.renderSingoloPromemoria(p);
        });

        html += '</div>';
        return html;
    },

    /**
     * Render di un singolo promemoria
     */
    renderSingoloPromemoria(p) {
        const ora = new Date();
        const isScaduto = p.dataScadenza && !p.completato && new Date(p.dataScadenza) < ora;
        const isOggi = p.dataScadenza && p.dataScadenza.split('T')[0] === ora.toISOString().split('T')[0];

        // Colori priorità
        const colorePriorita = {
            urgente: 'var(--rosso-errore)',
            importante: '#FFCC00',
            normale: 'var(--grigio-300)'
        };
        const borderColor = colorePriorita[p.priorita] || colorePriorita.normale;

        // Background
        let bgColor = 'white';
        if (p.completato) bgColor = 'var(--grigio-100)';
        else if (isScaduto) bgColor = '#FFF3F3';
        else if (isOggi) bgColor = 'var(--blu-100)';

        // Data formattata
        let dataLabel = '';
        if (p.dataScadenza) {
            const d = new Date(p.dataScadenza);
            const opzioni = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
            dataLabel = d.toLocaleDateString('it-IT', opzioni);
            if (p.ora) dataLabel += ` alle ${p.ora}`;
        }

        return `
            <div class="card" style="margin-bottom: 0.75rem; border-left: 4px solid ${borderColor}; background: ${bgColor}; ${p.completato ? 'opacity: 0.7;' : ''}">
                <div style="padding: 1rem 1.25rem; display: flex; align-items: flex-start; gap: 1rem;">
                    <!-- Checkbox completamento -->
                    <div style="padding-top: 2px; flex-shrink: 0;">
                        <input type="checkbox" ${p.completato ? 'checked' : ''}
                            onchange="Promemoria.toggleCompletato('${p.id}', this.checked)"
                            style="width: 20px; height: 20px; cursor: pointer; accent-color: var(--verde-700);">
                    </div>

                    <!-- Contenuto -->
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 1rem; color: var(--grigio-900); ${p.completato ? 'text-decoration: line-through;' : ''} line-height: 1.5; white-space: pre-wrap; word-break: break-word;">
                            ${this.escapeHtml(p.testo || 'Senza testo')}
                        </div>
                        <div style="display: flex; gap: 1rem; margin-top: 0.5rem; flex-wrap: wrap; align-items: center;">
                            ${dataLabel ? `
                                <span style="font-size: 0.8rem; color: ${isScaduto ? 'var(--rosso-errore)' : isOggi ? 'var(--blu-700)' : 'var(--grigio-500)'}; font-weight: ${isScaduto || isOggi ? '700' : '400'};">
                                    <i class="fas fa-${isScaduto ? 'exclamation-circle' : isOggi ? 'bell' : 'calendar'}"></i>
                                    ${isScaduto ? 'SCADUTO — ' : isOggi ? 'OGGI — ' : ''}${dataLabel}
                                </span>
                            ` : ''}
                            ${p.priorita && p.priorita !== 'normale' ? `
                                <span style="font-size: 0.75rem; padding: 1px 8px; border-radius: 4px; font-weight: 700;
                                    background: ${p.priorita === 'urgente' ? '#FFEBEE' : '#FFF8E1'};
                                    color: ${p.priorita === 'urgente' ? 'var(--rosso-errore)' : '#F57F17'};">
                                    ${p.priorita === 'urgente' ? '🔴 Urgente' : '🟡 Importante'}
                                </span>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Azioni -->
                    <div style="display: flex; gap: 0.25rem; flex-shrink: 0;">
                        <button onclick="Promemoria.modifica('${p.id}')" title="Modifica"
                            style="background: none; border: none; color: var(--grigio-500); cursor: pointer; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.9rem;"
                            onmouseover="this.style.color='var(--blu-700)'" onmouseout="this.style.color='var(--grigio-500)'">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button onclick="Promemoria.elimina('${p.id}')" title="Elimina"
                            style="background: none; border: none; color: var(--grigio-500); cursor: pointer; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.9rem;"
                            onmouseover="this.style.color='var(--rosso-errore)'" onmouseout="this.style.color='var(--grigio-500)'">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    // === AZIONI ===

    mostraFormNuovo() {
        const form = document.getElementById('formNuovoPromemoria');
        form.innerHTML = this.renderFormNuovo();
        form.classList.remove('hidden');

        // Imposta la data di default a oggi
        const oggi = new Date().toISOString().split('T')[0];
        document.getElementById('promData').value = oggi;

        // Focus sul testo
        document.getElementById('promTesto').focus();
    },

    chiudiForm() {
        document.getElementById('formNuovoPromemoria').classList.add('hidden');
    },

    async salvaNuovo() {
        const testo = document.getElementById('promTesto').value.trim();
        const data = document.getElementById('promData').value;
        const ora = document.getElementById('promOra').value;
        const priorita = document.getElementById('promPriorita').value;

        if (!testo) {
            UI.showError('Scrivi il testo del promemoria');
            return;
        }

        try {
            // Componi la data di scadenza
            let dataScadenza = null;
            if (data) {
                dataScadenza = ora ? `${data}T${ora}:00` : `${data}T09:00:00`;
            }

            await db.collection('promemoria').add({
                userId: AuthService.getUserId(),
                userName: AuthService.getUserName(),
                testo: testo,
                dataScadenza: dataScadenza,
                ora: ora || '',
                priorita: priorita,
                completato: false,
                creatoIl: new Date().toISOString()
            });

            UI.showSuccess('Promemoria salvato!');
            this.chiudiForm();
            await this.render();
        } catch (error) {
            console.error('Errore salvataggio promemoria:', error);
            UI.showError('Errore nel salvataggio: ' + error.message);
        }
    },

    async modifica(id) {
        const p = this.promemoria.find(x => x.id === id);
        if (!p) return;

        const form = document.getElementById('formNuovoPromemoria');
        form.innerHTML = this.renderFormNuovo(p);
        form.classList.remove('hidden');

        // Scroll al form
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.getElementById('promTesto').focus();
    },

    async salvaModifica(id) {
        const testo = document.getElementById('promTesto').value.trim();
        const data = document.getElementById('promData').value;
        const ora = document.getElementById('promOra').value;
        const priorita = document.getElementById('promPriorita').value;

        if (!testo) {
            UI.showError('Scrivi il testo del promemoria');
            return;
        }

        try {
            let dataScadenza = null;
            if (data) {
                dataScadenza = ora ? `${data}T${ora}:00` : `${data}T09:00:00`;
            }

            await db.collection('promemoria').doc(id).update({
                testo: testo,
                dataScadenza: dataScadenza,
                ora: ora || '',
                priorita: priorita,
                modificatoIl: new Date().toISOString()
            });

            UI.showSuccess('Promemoria aggiornato!');
            this.chiudiForm();
            await this.render();
        } catch (error) {
            console.error('Errore modifica promemoria:', error);
            UI.showError('Errore: ' + error.message);
        }
    },

    async toggleCompletato(id, completato) {
        try {
            await db.collection('promemoria').doc(id).update({
                completato: completato,
                completatoIl: completato ? new Date().toISOString() : null
            });

            // Aggiorna localmente
            const p = this.promemoria.find(x => x.id === id);
            if (p) p.completato = completato;

            // Aggiorna UI
            document.getElementById('listaPromemoria').innerHTML = this.renderLista();
            this.aggiornaBadge();

            if (completato) {
                UI.showSuccess('Promemoria completato!');
            }
        } catch (error) {
            console.error('Errore toggle completato:', error);
            UI.showError('Errore: ' + error.message);
        }
    },

    async elimina(id) {
        if (!confirm('Eliminare questo promemoria?')) return;

        try {
            await db.collection('promemoria').doc(id).delete();
            UI.showSuccess('Promemoria eliminato');
            await this.render();
        } catch (error) {
            console.error('Errore eliminazione promemoria:', error);
            UI.showError('Errore: ' + error.message);
        }
    },

    cambiaFiltro(nuovoFiltro) {
        this.filtro = nuovoFiltro;
        this.render();
    },

    aggiornaBadge() {
        const attivi = this.promemoria.filter(p => !p.completato).length;
        const badge = document.getElementById('badgeAttivi');
        if (badge) {
            badge.textContent = attivi > 0 ? attivi : '';
        }
    },

    /**
     * 🔔 Controlla promemoria scaduti/in scadenza oggi
     * Chiamato all'avvio dell'app per mostrare un avviso
     */
    async checkPromemoriaInScadenza() {
        try {
            const userId = AuthService.getUserId();
            if (!userId) return;

            const oggi = new Date().toISOString().split('T')[0];

            const snapshot = await db.collection('promemoria')
                .where('userId', '==', userId)
                .where('completato', '==', false)
                .get();

            const inScadenza = [];
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.dataScadenza) {
                    const dataStr = data.dataScadenza.split('T')[0];
                    if (dataStr <= oggi) {
                        inScadenza.push(data);
                    }
                }
            });

            if (inScadenza.length > 0) {
                // Aggiorna il badge nel menu sidebar
                const menuItem = document.querySelector('.menu-item[data-page="promemoria"]');
                if (menuItem) {
                    // Aggiungi badge al menu
                    let badge = menuItem.querySelector('.promemoria-badge');
                    if (!badge) {
                        badge = document.createElement('span');
                        badge.className = 'promemoria-badge';
                        badge.style.cssText = 'background: var(--rosso-errore); color: white; border-radius: 50%; width: 20px; height: 20px; font-size: 0.7rem; font-weight: 700; display: flex; align-items: center; justify-content: center; margin-left: auto;';
                        menuItem.appendChild(badge);
                    }
                    badge.textContent = inScadenza.length > 9 ? '9+' : inScadenza.length;
                }

                console.log(`📌 ${inScadenza.length} promemoria in scadenza oggi o scaduti`);
            }
        } catch (error) {
            console.warn('Errore check promemoria:', error.message);
        }
    },

    /**
     * Escape HTML per sicurezza
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

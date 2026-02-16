// Utility per sistemare fatture con clienti inesistenti
const SistemaClientiOrfani = {

    // Analizza e mostra il problema
    async analizza() {
        try {
            UI.showLoading();

            const clienti = await DataService.getClienti();
            const fatture = await DataService.getFatture({ limit: 10000 });

            const clientiIds = new Set(clienti.map(c => c.id));
            const fattureOrfane = [];

            fatture.forEach(f => {
                if (f.clienteId && !clientiIds.has(f.clienteId)) {
                    fattureOrfane.push({
                        numeroFattura: f.numeroFattura || f.numeroFatturaCompleto,
                        fatturaId: f.id,
                        clienteId: f.clienteId,
                        importoTotale: f.importoTotale,
                        dataEmissione: f.dataEmissione
                    });
                }
            });

            UI.hideLoading();

            if (fattureOrfane.length === 0) {
                UI.showSuccess('✅ Nessuna fattura orfana trovata! Il database è allineato.');
                return;
            }

            // Raggruppa per clienteId mancante
            const perCliente = {};
            fattureOrfane.forEach(f => {
                if (!perCliente[f.clienteId]) {
                    perCliente[f.clienteId] = {
                        clienteId: f.clienteId,
                        fatture: [],
                        possibiliMatch: []
                    };
                }
                perCliente[f.clienteId].fatture.push(f);
            });

            // Cerca possibili match
            Object.keys(perCliente).forEach(clienteId => {
                const idParts = clienteId.toLowerCase().split('_').filter(p => p.length > 2);
                const possibiliMatch = clienti.filter(c => {
                    const nomeCliente = c.ragioneSociale.toLowerCase();
                    return idParts.some(part => nomeCliente.includes(part));
                });
                perCliente[clienteId].possibiliMatch = possibiliMatch;
            });

            // Mostra report
            this.mostraReport(perCliente, clienti);

        } catch (error) {
            UI.hideLoading();
            UI.showError('Errore analisi: ' + error.message);
        }
    },

    mostraReport(perCliente, clienti) {
        const gruppi = Object.values(perCliente);
        const totaleFatture = gruppi.reduce((sum, g) => sum + g.fatture.length, 0);

        let html = `
            <div style="max-height: 600px; overflow-y: auto;">
                <div style="padding: 1.5rem; background: var(--blu-100); border-radius: 8px; margin-bottom: 1.5rem;">
                    <h3 style="margin: 0 0 0.5rem 0; color: var(--blu-700);">
                        <i class="fas fa-exclamation-triangle"></i>
                        Trovate ${totaleFatture} fatture con clienti inesistenti
                    </h3>
                    <p style="margin: 0; color: var(--grigio-700);">
                        Queste fatture hanno riferimenti a clienti che non esistono più nel database.
                    </p>
                </div>

                ${gruppi.map(gruppo => `
                    <div style="margin-bottom: 2rem; padding: 1.5rem; border: 2px solid var(--grigio-300); border-radius: 8px;">
                        <div style="margin-bottom: 1rem;">
                            <strong style="color: var(--rosso-errore);">
                                ❌ Cliente ID: "${gruppo.clienteId}"
                            </strong>
                            <div style="font-size: 0.875rem; color: var(--grigio-500); margin-top: 0.25rem;">
                                ${gruppo.fatture.length} fattura/e collegate
                            </div>
                        </div>

                        <!-- Fatture -->
                        <div style="margin-bottom: 1rem; padding: 1rem; background: var(--grigio-100); border-radius: 6px;">
                            <strong style="display: block; margin-bottom: 0.5rem;">📄 Fatture:</strong>
                            ${gruppo.fatture.map(f => `
                                <div style="padding: 0.5rem 0; border-bottom: 1px solid var(--grigio-300);">
                                    ${f.numeroFattura}
                                    <span style="color: var(--grigio-500);">
                                        del ${DataService.formatDate(f.dataEmissione)} -
                                        ${DataService.formatCurrency(f.importoTotale)}
                                    </span>
                                </div>
                            `).join('')}
                        </div>

                        ${gruppo.possibiliMatch.length > 0 ? `
                            <!-- Possibili Match -->
                            <div style="margin-bottom: 1rem;">
                                <strong style="display: block; margin-bottom: 0.5rem; color: var(--verde-700);">
                                    🔍 Possibili clienti corrispondenti:
                                </strong>
                                <select
                                    id="match_${gruppo.clienteId.replace(/[^a-zA-Z0-9]/g, '_')}"
                                    class="form-input"
                                    style="margin-top: 0.5rem;"
                                >
                                    <option value="">-- Seleziona cliente corretto --</option>
                                    ${gruppo.possibiliMatch.map(c => `
                                        <option value="${c.id}">${c.ragioneSociale} (${c.id})</option>
                                    `).join('')}
                                    <option value="__ALTRO__">📝 Cerca altro cliente...</option>
                                    <option value="__ELIMINA__" style="color: var(--rosso-errore);">🗑️ Elimina fatture</option>
                                </select>
                            </div>
                        ` : `
                            <div style="padding: 1rem; background: #FFF3E0; border-radius: 6px; margin-bottom: 1rem;">
                                <strong style="color: #F57C00;">⚠️ Nessun match automatico trovato</strong>
                                <select
                                    id="match_${gruppo.clienteId.replace(/[^a-zA-Z0-9]/g, '_')}"
                                    class="form-input"
                                    style="margin-top: 0.5rem;"
                                >
                                    <option value="">-- Seleziona azione --</option>
                                    <option value="__ALTRO__">📝 Seleziona cliente manualmente...</option>
                                    <option value="__ELIMINA__" style="color: var(--rosso-errore);">🗑️ Elimina fatture</option>
                                </select>
                            </div>
                        `}
                    </div>
                `).join('')}

                <div style="padding: 1rem; background: var(--verde-100); border-radius: 8px; margin-top: 2rem;">
                    <strong style="color: var(--verde-700);">💡 Come procedere:</strong>
                    <ol style="margin: 0.5rem 0 0 1.5rem; color: var(--grigio-700);">
                        <li>Seleziona il cliente corretto per ogni gruppo di fatture orfane</li>
                        <li>Oppure scegli di eliminare le fatture se non servono più</li>
                        <li>Clicca "Applica Correzioni" per salvare le modifiche</li>
                    </ol>
                </div>
            </div>
        `;

        FormsManager.showModal(
            '<i class="fas fa-tools"></i> Sistema Clienti Orfani',
            html,
            () => this.applicaCorrezioni(perCliente, clienti)
        );
    },

    async applicaCorrezioni(perCliente, clienti) {
        try {
            UI.showLoading();

            const correzioni = [];
            const eliminazioni = [];

            // Raccoglie le scelte dell'utente
            for (const gruppo of Object.values(perCliente)) {
                const selectId = `match_${gruppo.clienteId.replace(/[^a-zA-Z0-9]/g, '_')}`;
                const select = document.getElementById(selectId);

                if (!select) continue;

                const scelta = select.value;

                if (scelta === '__ELIMINA__') {
                    eliminazioni.push(...gruppo.fatture);
                } else if (scelta === '__ALTRO__') {
                    UI.hideLoading();
                    await this.scegliClienteManualmente(gruppo, clienti);
                    return;
                } else if (scelta) {
                    // Aggiorna clienteId
                    correzioni.push({
                        fatture: gruppo.fatture,
                        nuovoClienteId: scelta
                    });
                }
            }

            // Applica correzioni
            let aggiornate = 0;
            let eliminate = 0;

            for (const corr of correzioni) {
                for (const fattura of corr.fatture) {
                    await DataService.updateFattura(fattura.fatturaId, {
                        clienteId: corr.nuovoClienteId
                    });
                    aggiornate++;
                }
            }

            for (const fattura of eliminazioni) {
                await DataService.deleteFattura(fattura.fatturaId);
                eliminate++;
            }

            UI.hideLoading();
            FormsManager.closeModal();

            UI.showSuccess(
                `✅ Operazione completata!\n` +
                `${aggiornate} fatture aggiornate\n` +
                `${eliminate} fatture eliminate`
            );

            // Ricarica la pagina corrente se possibile
            if (window.location.hash.includes('fatture')) {
                setTimeout(() => UI.showPage('fatture'), 1000);
            }

        } catch (error) {
            UI.hideLoading();
            UI.showError('Errore durante le correzioni: ' + error.message);
        }
    },

    async scegliClienteManualmente(gruppo, clienti) {
        const html = `
            <div style="margin-bottom: 1rem;">
                <p><strong>Seleziona il cliente corretto per queste fatture:</strong></p>
                <ul style="margin: 0.5rem 0; padding-left: 1.5rem; color: var(--grigio-600);">
                    ${gruppo.fatture.map(f => `<li>${f.numeroFattura}</li>`).join('')}
                </ul>
            </div>

            <select id="clienteManuale" class="form-input">
                <option value="">-- Seleziona cliente --</option>
                ${clienti
                    .sort((a, b) => a.ragioneSociale.localeCompare(b.ragioneSociale))
                    .map(c => `
                        <option value="${c.id}">${c.ragioneSociale}</option>
                    `).join('')}
            </select>
        `;

        FormsManager.showModal(
            '<i class="fas fa-search"></i> Seleziona Cliente',
            html,
            async () => {
                const clienteId = document.getElementById('clienteManuale')?.value;
                if (!clienteId) {
                    UI.showError('Seleziona un cliente');
                    return;
                }

                UI.showLoading();
                try {
                    for (const fattura of gruppo.fatture) {
                        await DataService.updateFattura(fattura.fatturaId, { clienteId });
                    }
                    UI.hideLoading();
                    FormsManager.closeModal();
                    UI.showSuccess(`${gruppo.fatture.length} fatture aggiornate!`);
                } catch (error) {
                    UI.hideLoading();
                    UI.showError('Errore aggiornamento: ' + error.message);
                }
            }
        );
    }
};

// Aggiungi al menu impostazioni se esiste
if (typeof window !== 'undefined') {
    window.SistemaClientiOrfani = SistemaClientiOrfani;
}

/**
 * 🏛️ COMUNI SERVICE
 * Gestisce il database comuni italiani per autocomplete e arricchimento dati
 */

const ComuniService = {
    comuni: [],
    loaded: false,
    loading: false,

    /**
     * Carica il database comuni dal JSON
     */
    async load() {
        if (this.loaded) return;
        if (this.loading) {
            // Attendi se già in caricamento
            while (this.loading) {
                await new Promise(r => setTimeout(r, 100));
            }
            return;
        }

        this.loading = true;

        try {
            const response = await fetch('js/data/comuni-italiani.json');
            this.comuni = await response.json();
            this.loaded = true;
            console.log(`🏛️ Database comuni caricato: ${this.comuni.length} comuni`);
        } catch (error) {
            console.error('Errore caricamento database comuni:', error);
            this.comuni = [];
        } finally {
            this.loading = false;
        }
    },

    /**
     * 🔍 Cerca comuni per nome (autocomplete)
     * Restituisce max 10 risultati
     */
    async cerca(query) {
        await this.load();

        if (!query || query.length < 2) return [];

        const q = query.toLowerCase().trim();

        // Prima cerca quelli che iniziano con la query, poi quelli che la contengono
        const iniziaCon = [];
        const contiene = [];

        for (const comune of this.comuni) {
            const nome = comune.nome.toLowerCase();
            if (nome.startsWith(q)) {
                iniziaCon.push(comune);
            } else if (nome.includes(q)) {
                contiene.push(comune);
            }
            if (iniziaCon.length + contiene.length >= 10) break;
        }

        return [...iniziaCon, ...contiene].slice(0, 10);
    },

    /**
     * 🎯 Trova un comune per nome esatto
     */
    async trovaPeNome(nome) {
        await this.load();

        if (!nome) return null;

        const nomeNorm = nome.toLowerCase().trim();

        return this.comuni.find(c => c.nome.toLowerCase() === nomeNorm) || null;
    },

    /**
     * 📦 Arricchisci un cliente con i dati del comune
     * Aggiorna solo i campi vuoti (non sovrascrive)
     */
    async arricchisciCliente(clienteId) {
        try {
            const clienteDoc = await db.collection('clienti').doc(clienteId).get();
            if (!clienteDoc.exists) {
                return { success: false, error: 'Cliente non trovato' };
            }

            const cliente = clienteDoc.data();
            const comune = await this.trovaPeNome(cliente.ragioneSociale);

            if (!comune) {
                return { success: false, error: 'Comune non trovato nel database', nomeCliente: cliente.ragioneSociale };
            }

            // Prepara aggiornamenti (solo campi vuoti)
            const updates = {};
            let campiAggiornati = 0;

            // Mappa campi comune → campi CRM
            const mapping = {
                codiceFiscale: 'codiceFiscale',
                indirizzo: 'indirizzo',
                cap: 'cap',
                provincia: 'provincia',
                regione: 'regione',
                telefono: 'telefono',
                pec: 'pec',
                codiceSdi: 'codiceSdi'
            };

            for (const [campoCrmKey, campoCrmField] of Object.entries(mapping)) {
                if ((!cliente[campoCrmField] || cliente[campoCrmField] === '') && comune[campoCrmKey]) {
                    updates[campoCrmField] = comune[campoCrmKey];
                    campiAggiornati++;
                }
            }

            // Email del file → email2 (non sovrascrive email principale)
            if ((!cliente.email2 || cliente.email2 === '') && comune.email) {
                updates.email2 = comune.email;
                campiAggiornati++;
            }

            // Numero residenti → sempre aggiornato
            if (comune.numResidenti > 0) {
                updates.numResidenti = comune.numResidenti;
                if (!cliente.numResidenti || cliente.numResidenti === 0) {
                    campiAggiornati++;
                }
            }

            // Tipo → PA se è un comune
            if (!cliente.tipo || cliente.tipo === 'PRIVATO') {
                updates.tipo = 'PA';
                campiAggiornati++;
            }

            // Comune (campo separato dal nome)
            if ((!cliente.comune || cliente.comune === '') && comune.nome) {
                updates.comune = comune.nome;
                campiAggiornati++;
            }

            if (campiAggiornati === 0) {
                return { success: true, nomeCliente: cliente.ragioneSociale, aggiornati: 0, messaggio: 'Tutti i campi sono già compilati' };
            }

            // Aggiorna su Firestore
            await db.collection('clienti').doc(clienteId).update(updates);

            return {
                success: true,
                nomeCliente: cliente.ragioneSociale,
                aggiornati: campiAggiornati,
                dettagli: Object.keys(updates)
            };

        } catch (error) {
            console.error('Errore arricchimento cliente:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * 🚀 Arricchimento massivo di tutti i clienti
     * Callback per aggiornare progresso UI
     */
    async arricchimentoMassivo(progressCallback) {
        try {
            await this.load();

            // Carica tutti i clienti
            const snapshot = await db.collection('clienti').get();
            const totale = snapshot.size;

            let processati = 0;
            let arricchiti = 0;
            let nonTrovati = 0;
            let giaCompleti = 0;
            const dettaglio = [];

            for (const doc of snapshot.docs) {
                processati++;

                const result = await this.arricchisciCliente(doc.id);

                if (result.success) {
                    if (result.aggiornati > 0) {
                        arricchiti++;
                        dettaglio.push({
                            nome: result.nomeCliente,
                            campi: result.aggiornati,
                            dettagli: result.dettagli
                        });
                    } else {
                        giaCompleti++;
                    }
                } else if (result.error === 'Comune non trovato nel database') {
                    nonTrovati++;
                }

                // Aggiorna progresso
                if (progressCallback) {
                    progressCallback({
                        processati,
                        totale,
                        arricchiti,
                        nonTrovati,
                        giaCompleti,
                        percentuale: Math.round((processati / totale) * 100)
                    });
                }
            }

            return {
                success: true,
                totale,
                arricchiti,
                nonTrovati,
                giaCompleti,
                dettaglio
            };

        } catch (error) {
            console.error('Errore arricchimento massivo:', error);
            return { success: false, error: error.message };
        }
    }
};

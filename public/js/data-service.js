// Data Service - Gestione dati da Firestore
const DataService = {

    // === AGENTI (utenti con ruolo AGENTE oppure con flag ancheAgente) ===
    _cacheAgenti: null,
    _cacheAgentiTimestamp: 0,

    async getAgenti(forceRefresh = false) {
        // Cache di 5 minuti per evitare query ripetute
        const now = Date.now();
        if (!forceRefresh && this._cacheAgenti && (now - this._cacheAgentiTimestamp) < 300000) {
            return this._cacheAgenti;
        }

        try {
            // Due query: utenti con ruolo AGENTE + utenti con flag ancheAgente
            const [snapshotAgenti, snapshotAnche] = await Promise.all([
                db.collection('utenti')
                    .where('ruolo', '==', 'AGENTE')
                    .where('stato', '==', 'ATTIVO')
                    .get(),
                db.collection('utenti')
                    .where('ancheAgente', '==', true)
                    .where('stato', '==', 'ATTIVO')
                    .get()
            ]);

            // Unisci i risultati evitando duplicati (per uid)
            const agentiMap = new Map();

            snapshotAgenti.docs.forEach(doc => {
                const data = doc.data();
                agentiMap.set(doc.id, {
                    uid: doc.id,
                    nome: data.nome || '',
                    cognome: data.cognome || '',
                    email: data.email || '',
                    nomeCompleto: `${data.nome || ''} ${data.cognome || ''}`.trim()
                });
            });

            snapshotAnche.docs.forEach(doc => {
                if (!agentiMap.has(doc.id)) {
                    const data = doc.data();
                    agentiMap.set(doc.id, {
                        uid: doc.id,
                        nome: data.nome || '',
                        cognome: data.cognome || '',
                        email: data.email || '',
                        nomeCompleto: `${data.nome || ''} ${data.cognome || ''}`.trim()
                    });
                }
            });

            this._cacheAgenti = Array.from(agentiMap.values())
                .sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto));

            this._cacheAgentiTimestamp = now;
            return this._cacheAgenti;
        } catch (error) {
            console.error('Errore caricamento agenti:', error);
            return [];
        }
    },

    // === CLIENTI ===
    async getClienti(filtri = {}) {
        try {
            let query = db.collection('clienti');
            let hasCompositeFilter = false;

            if (filtri.stato) {
                query = query.where('statoContratto', '==', filtri.stato);
            }
            if (filtri.agente) {
                query = query.where('agente', '==', filtri.agente);
                hasCompositeFilter = true; // Evita orderBy per non richiedere indice composito
            }
            if (filtri.tipo) {
                query = query.where('tipo', '==', filtri.tipo);
            }

            // Se c'è un filtro agente, non aggiungere orderBy (richiederebbe indice composito)
            // L'ordinamento viene fatto lato client
            if (!hasCompositeFilter) {
                query = query.orderBy('ragioneSociale', 'asc');
            }

            const snapshot = await query.get();
            const risultati = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    ...data,
                    clienteIdLegacy: data.id,  // Salva l'ID originale prima di sovrascriverlo
                    id: doc.id  // ID documento Firestore
                };
            });

            // Ordinamento lato client quando non fatto da Firestore
            if (hasCompositeFilter) {
                risultati.sort((a, b) => (a.ragioneSociale || '').localeCompare(b.ragioneSociale || ''));
            }

            return risultati;
        } catch (error) {
            console.error('Errore caricamento clienti:', error);
            return [];
        }
    },

    async getCliente(clienteId) {
        try {
            const doc = await db.collection('clienti').doc(clienteId).get();
            if (doc.exists) {
                const data = doc.data();
                return {
                    ...data,
                    clienteIdLegacy: data.id,  // Salva ID originale
                    id: doc.id   // ID documento Firestore
                };
            }
            return null;
        } catch (error) {
            console.error('Errore caricamento cliente:', error);
            return null;
        }
    },

    async searchClienti(searchTerm) {
        try {
            const clienti = await this.getClienti();
            const term = searchTerm.toLowerCase();
            return clienti.filter(c =>
                c.ragioneSociale.toLowerCase().includes(term) ||
                c.provincia?.toLowerCase().includes(term) ||
                c.agente?.toLowerCase().includes(term)
            );
        } catch (error) {
            console.error('Errore ricerca clienti:', error);
            return [];
        }
    },

    // === APP ===
    async getApps(filtri = {}) {
        try {
            let query = db.collection('app');

            if (filtri.statoApp) {
                query = query.where('statoApp', '==', filtri.statoApp);
            }
            if (filtri.clientePaganteId) {
                query = query.where('clientePaganteId', '==', filtri.clientePaganteId);
            }
            if (filtri.tipoPagamento) {
                query = query.where('tipoPagamento', '==', filtri.tipoPagamento);
            }

            query = query.orderBy('nome', 'asc');

            const snapshot = await query.get();
            return snapshot.docs.map(doc => ({
                ...doc.data(),
                id: doc.id
            }));
        } catch (error) {
            console.error('Errore caricamento app:', error);
            return [];
        }
    },

    async getApp(appId) {
        try {
            const doc = await db.collection('app').doc(appId).get();
            if (doc.exists) {
                return {
                    ...doc.data(),
                    id: doc.id
                };
            }
            return null;
        } catch (error) {
            console.error('Errore caricamento app:', error);
            return null;
        }
    },

    async createApp(data) {
        try {
            const appData = {
                ...data,
                dataCreazione: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            const docRef = await db.collection('app').add(appData);
            return docRef.id;
        } catch (error) {
            console.error('Errore creazione app:', error);
            throw error;
        }
    },

    async updateApp(appId, data) {
        try {
            const updateData = {
                ...data,
                updatedAt: new Date().toISOString()
            };
            await db.collection('app').doc(appId).update(updateData);
            return true;
        } catch (error) {
            console.error('Errore aggiornamento app:', error);
            throw error;
        }
    },

    async deleteApp(appId) {
        try {
            await db.collection('app').doc(appId).delete();
            return true;
        } catch (error) {
            console.error('Errore eliminazione app:', error);
            throw error;
        }
    },

    async searchApps(searchTerm) {
        try {
            const apps = await this.getApps();
            const term = searchTerm.toLowerCase();
            return apps.filter(a =>
                a.nome?.toLowerCase().includes(term) ||
                a.comune?.toLowerCase().includes(term) ||
                a.provincia?.toLowerCase().includes(term) ||
                a.referenteComune?.toLowerCase().includes(term)
            );
        } catch (error) {
            console.error('Errore ricerca app:', error);
            return [];
        }
    },

    // === CONTRATTI ===
    async getContratti(filtri = {}) {
        try {
            let query = db.collection('contratti');

            if (filtri.clienteId) {
                query = query.where('clienteId', '==', filtri.clienteId);
            }
            if (filtri.stato) {
                query = query.where('stato', '==', filtri.stato);
            }
            if (filtri.tipologia) {
                query = query.where('tipologia', '==', filtri.tipologia);
            }

            query = query.orderBy('dataScadenza', 'desc');

            const snapshot = await query.get();
            return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        } catch (error) {
            console.error('Errore caricamento contratti:', error);
            return [];
        }
    },

    async getContratto(contrattoId) {
        try {
            const doc = await db.collection('contratti').doc(contrattoId).get();
            if (!doc.exists) return null;
            return { ...doc.data(), id: doc.id };
        } catch (error) {
            console.error('Errore caricamento contratto:', error);
            return null;
        }
    },

    async getContrattiCliente(clienteId) {
        try {
            // Cerca contratti per l'ID passato
            const snapshot1 = await db.collection('contratti')
                .where('clienteId', '==', clienteId)
                .orderBy('dataScadenza', 'desc')
                .get();
            const contratti1 = snapshot1.docs.map(doc => ({ ...doc.data(), id: doc.id }));

            // Cerca anche per l'altro ID del cliente (legacy ↔ Firestore)
            let contratti2 = [];
            const clienteDoc = await db.collection('clienti').doc(clienteId).get();
            if (clienteDoc.exists) {
                const legacyId = clienteDoc.data().id;
                if (legacyId && legacyId !== clienteId) {
                    const snapshot2 = await db.collection('contratti')
                        .where('clienteId', '==', legacyId)
                        .get();
                    contratti2 = snapshot2.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                }
            } else {
                const snapshot = await db.collection('clienti').where('id', '==', clienteId).limit(1).get();
                if (!snapshot.empty) {
                    const firestoreId = snapshot.docs[0].id;
                    if (firestoreId !== clienteId) {
                        const snapshot2 = await db.collection('contratti')
                            .where('clienteId', '==', firestoreId)
                            .get();
                        contratti2 = snapshot2.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                    }
                }
            }

            // Unisci senza duplicati
            const idsVisti = new Set(contratti1.map(c => c.id));
            const tutti = [...contratti1];
            for (const c of contratti2) {
                if (!idsVisti.has(c.id)) {
                    tutti.push(c);
                }
            }
            return tutti;
        } catch (error) {
            console.error('Errore caricamento contratti cliente:', error);
            return [];
        }
    },

    // === STATO CLIENTE CALCOLATO DAI CONTRATTI ===
    // Logica:
    // - ATTIVO: almeno 1 contratto ATTIVO o IN_RINNOVO
    // - SCADUTO: nessun contratto attivo, ma almeno 1 SCADUTO (attesa rinnovo)
    // - CESSATO: tutti i contratti CESSATI
    // - SOSPESO: almeno 1 contratto SOSPESO e nessun ATTIVO
    // - SENZA_CONTRATTO: nessun contratto collegato (errore da evidenziare)
    calcolaStatoCliente(contrattiCliente) {
        if (!contrattiCliente || contrattiCliente.length === 0) {
            return 'SENZA_CONTRATTO';
        }

        const stati = contrattiCliente.map(c => c.stato);

        // Se almeno uno è ATTIVO o IN_RINNOVO → cliente ATTIVO
        if (stati.includes('ATTIVO') || stati.includes('IN_RINNOVO')) {
            return 'ATTIVO';
        }

        // Se almeno uno è SOSPESO → cliente SOSPESO
        if (stati.includes('SOSPESO')) {
            return 'SOSPESO';
        }

        // Se almeno uno è SCADUTO → cliente SCADUTO (in attesa rinnovo)
        if (stati.includes('SCADUTO')) {
            return 'SCADUTO';
        }

        // Tutti CESSATI → cliente CESSATO
        if (stati.every(s => s === 'CESSATO')) {
            return 'CESSATO';
        }

        return 'SENZA_CONTRATTO';
    },

    // Arricchisce l'array clienti con lo stato calcolato dai contratti
    async getClientiConStato(filtriClienti = {}) {
        // Carica clienti e contratti in parallelo
        const [clienti, contratti] = await Promise.all([
            this.getClienti(filtriClienti),
            this.getContratti()
        ]);

        // Raggruppa contratti per clienteId (usando anche legacyId)
        const contrattiPerCliente = {};
        contratti.forEach(c => {
            if (!c.clienteId) return;
            if (!contrattiPerCliente[c.clienteId]) {
                contrattiPerCliente[c.clienteId] = [];
            }
            contrattiPerCliente[c.clienteId].push(c);
        });

        // Per ogni cliente, calcola lo stato
        return clienti.map(cliente => {
            // Cerca contratti per entrambi gli ID (Firestore e legacy)
            const ids = [cliente.id, cliente.clienteIdLegacy].filter(Boolean);
            const contrattiCliente = [];
            const idsVisti = new Set();

            ids.forEach(id => {
                (contrattiPerCliente[id] || []).forEach(c => {
                    if (!idsVisti.has(c.id)) {
                        idsVisti.add(c.id);
                        contrattiCliente.push(c);
                    }
                });
            });

            const statoCalcolato = this.calcolaStatoCliente(contrattiCliente);

            return {
                ...cliente,
                statoContratto: statoCalcolato,
                _numContratti: contrattiCliente.length,
                _contrattiAttivi: contrattiCliente.filter(c => c.stato === 'ATTIVO' || c.stato === 'IN_RINNOVO').length
            };
        });
    },

    async getContrattiInScadenza(giorni = 30) {
        try {
            const oggi = new Date();
            const dataLimite = new Date();
            dataLimite.setDate(oggi.getDate() + giorni);

            const snapshot = await db.collection('contratti')
                .where('stato', '==', 'ATTIVO')
                .where('dataScadenza', '<=', dataLimite.toISOString())
                .orderBy('dataScadenza', 'asc')
                .get();

            return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        } catch (error) {
            console.error('Errore caricamento contratti in scadenza:', error);
            return [];
        }
    },

    async createContratto(data) {
        try {
            const docRef = await db.collection('contratti').add({
                ...data,
                dataCreazione: new Date().toISOString(),
                dataAggiornamento: new Date().toISOString(),
                stato: data.stato || 'ATTIVO'
            });
            return docRef.id;
        } catch (error) {
            console.error('Errore creazione contratto:', error);
            throw error;
        }
    },

    async updateContratto(contrattoId, data) {
        try {
            await db.collection('contratti').doc(contrattoId).update({
                ...data,
                dataAggiornamento: new Date().toISOString()
            });
            return true;
        } catch (error) {
            console.error('Errore aggiornamento contratto:', error);
            throw error;
        }
    },

    async deleteContratto(contrattoId) {
        try {
            await db.collection('contratti').doc(contrattoId).delete();
            return true;
        } catch (error) {
            console.error('Errore eliminazione contratto:', error);
            throw error;
        }
    },

    async rinnovaContratto(contrattoId, nuovaDataScadenza, note = '') {
        try {
            await this.updateContratto(contrattoId, {
                dataScadenza: nuovaDataScadenza,
                stato: 'ATTIVO',
                note: note
            });

            // Crea scadenza automatica per il prossimo rinnovo
            const contratto = await this.getContratto(contrattoId);
            if (contratto && contratto.giorniPreavvisoRinnovo) {
                const dataScadenzaDate = new Date(nuovaDataScadenza);
                const dataScadenzaPreavviso = new Date(dataScadenzaDate);
                dataScadenzaPreavviso.setDate(dataScadenzaDate.getDate() - contratto.giorniPreavvisoRinnovo);

                await this.createScadenza({
                    tipo: 'RINNOVO_CONTRATTO',
                    clienteId: contratto.clienteId,
                    contrattoId: contrattoId,
                    dataScadenza: dataScadenzaPreavviso.toISOString(),
                    descrizione: `Rinnovo contratto ${contratto.numeroContratto}`,
                    completata: false
                });
            }

            return true;
        } catch (error) {
            console.error('Errore rinnovo contratto:', error);
            throw error;
        }
    },

    async searchContratti(searchTerm) {
        try {
            const contratti = await this.getContratti();
            const term = searchTerm.toLowerCase();
            return contratti.filter(c =>
                c.numeroContratto?.toLowerCase().includes(term) ||
                c.oggetto?.toLowerCase().includes(term) ||
                c.clienteRagioneSociale?.toLowerCase().includes(term)
            );
        } catch (error) {
            console.error('Errore ricerca contratti:', error);
            return [];
        }
    },

    async getFattureContratto(contrattoId) {
        try {
            const snapshot = await db.collection('fatture')
                .where('contrattoId', '==', contrattoId)
                .orderBy('dataEmissione', 'desc')
                .get();
            return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        } catch (error) {
            console.error('Errore caricamento fatture contratto:', error);
            return [];
        }
    },

    // === FATTURE ===
    async getFatture(filtri = {}) {
        try {
            let query = db.collection('fatture');

            if (filtri.anno) {
                query = query.where('anno', '==', filtri.anno);
            }
            if (filtri.statoPagamento) {
                query = query.where('statoPagamento', '==', filtri.statoPagamento);
            }
            if (filtri.clienteId) {
                query = query.where('clienteId', '==', filtri.clienteId);
            }

            query = query.orderBy('dataEmissione', 'desc').limit(filtri.limit || 100);

            const snapshot = await query.get();
            const fatture = snapshot.docs.map(doc => ({
                ...doc.data(),
                id: doc.id  // ID documento ha precedenza
            }));

            // NON arricchire con dati cliente per performance
            // Il clienteId è già presente in ogni fattura

            return fatture;
        } catch (error) {
            console.error('Errore caricamento fatture:', error);
            return [];
        }
    },

    async getFattureCliente(clienteId) {
        // Cerca fatture usando ENTRAMBI gli ID del cliente (Firestore doc ID e legacy ID)
        // perché le fatture possono avere salvato l'uno o l'altro
        try {
            // Prima cerca per l'ID passato
            const fatture1 = await this.getFatture({ clienteId: clienteId, limit: 1000 });

            // Poi cerca anche per l'altro ID del cliente
            let fatture2 = [];
            const clienteDoc = await db.collection('clienti').doc(clienteId).get();
            if (clienteDoc.exists) {
                const legacyId = clienteDoc.data().id;
                if (legacyId && legacyId !== clienteId) {
                    fatture2 = await this.getFatture({ clienteId: legacyId, limit: 1000 });
                }
            } else {
                // Se clienteId non è un doc ID Firestore, potrebbe essere un legacy ID
                // Cerca il doc Firestore per ottenere il suo doc.id
                const snapshot = await db.collection('clienti').where('id', '==', clienteId).limit(1).get();
                if (!snapshot.empty) {
                    const firestoreId = snapshot.docs[0].id;
                    if (firestoreId !== clienteId) {
                        fatture2 = await this.getFatture({ clienteId: firestoreId, limit: 1000 });
                    }
                }
            }

            // Unisci senza duplicati (usando l'ID fattura come chiave)
            const idsVisti = new Set(fatture1.map(f => f.id));
            const tutte = [...fatture1];
            for (const f of fatture2) {
                if (!idsVisti.has(f.id)) {
                    tutte.push(f);
                }
            }
            return tutte;
        } catch (error) {
            console.error('Errore caricamento fatture cliente:', error);
            return [];
        }
    },

    async getFattura(fatturaId) {
        try {
            const doc = await db.collection('fatture').doc(fatturaId).get();
            if (doc.exists) {
                const data = doc.data();
                return {
                    ...data,
                    id: doc.id
                };
            }
            return null;
        } catch (error) {
            console.error('Errore caricamento fattura:', error);
            return null;
        }
    },

    async getClienteByLegacyId(legacyId) {
        try {
            // 1. Cerca cliente che ha nel campo "id" (legacy) il valore passato
            const snapshot = await db.collection('clienti')
                .where('id', '==', legacyId)
                .limit(1)
                .get();

            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                const data = doc.data();
                return {
                    ...data,
                    clienteIdLegacy: data.id,
                    id: doc.id  // ID documento Firestore
                };
            }

            // 2. Se non trovato per legacy ID, prova come Firestore doc ID
            const docDirect = await db.collection('clienti').doc(legacyId).get();
            if (docDirect.exists) {
                const data = docDirect.data();
                return {
                    ...data,
                    clienteIdLegacy: data.id,
                    id: docDirect.id
                };
            }

            return null;
        } catch (error) {
            console.error('Errore ricerca cliente by legacy ID:', error);
            return null;
        }
    },

    async getFattureNonPagate() {
        return this.getFatture({ statoPagamento: 'NON_PAGATA', limit: 1000 });
    },

    async getFattureScadute() {
        try {
            const oggi = new Date();
            const fatture = await this.getFattureNonPagate();
            return fatture.filter(f => {
                if (!f.dataScadenza) return false;
                const scadenza = new Date(f.dataScadenza);
                return scadenza < oggi;
            });
        } catch (error) {
            console.error('Errore caricamento fatture scadute:', error);
            return [];
        }
    },

    async getFattureInScadenza(giorni = 30) {
        try {
            const oggi = new Date();
            const futuro = new Date(oggi);
            futuro.setDate(futuro.getDate() + giorni);

            const fatture = await this.getFattureNonPagate();
            return fatture.filter(f => {
                if (!f.dataScadenza) return false;
                const scadenza = new Date(f.dataScadenza);
                return scadenza >= oggi && scadenza <= futuro;
            });
        } catch (error) {
            console.error('Errore caricamento fatture in scadenza:', error);
            return [];
        }
    },

    // === SCADENZARIO ===
    async getScadenze(filtri = {}) {
        try {
            let query = db.collection('scadenzario');
            let hasAgenteFilter = false;

            if (filtri.tipo) {
                query = query.where('tipo', '==', filtri.tipo);
            }
            if (filtri.agente) {
                hasAgenteFilter = true;
                // NON aggiungiamo where('agente') + where('completata') + orderBy insieme
                // perché richiederebbe un indice composito su 3 campi.
                // Filtriamo solo per completata su Firestore, il resto lato client
            }

            if (!hasAgenteFilter) {
                // Query normale senza filtro agente: usa indice completata + dataScadenza
                query = query.where('completata', '==', false)
                             .orderBy('dataScadenza', 'asc');
            } else {
                // Con filtro agente: solo where('completata') per evitare indice composito
                query = query.where('completata', '==', false);
            }

            const snapshot = await query.get();
            let risultati = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    ...data,
                    clienteIdLegacy: data.id,
                    id: doc.id
                };
            });

            // Filtraggio e ordinamento lato client quando c'è filtro agente
            if (hasAgenteFilter) {
                risultati = risultati.filter(s => s.agente === filtri.agente);
                risultati.sort((a, b) => {
                    const dataA = a.dataScadenza ? new Date(a.dataScadenza) : new Date(0);
                    const dataB = b.dataScadenza ? new Date(b.dataScadenza) : new Date(0);
                    return dataA - dataB;
                });
            }

            return risultati;
        } catch (error) {
            console.error('Errore caricamento scadenze:', error);
            return [];
        }
    },

    async getScadenzeImminenti(giorni = 30) {
        try {
            const oggi = new Date();
            const futuro = new Date(oggi);
            futuro.setDate(futuro.getDate() + giorni);

            const scadenze = await this.getScadenze();
            return scadenze.filter(s => {
                if (!s.dataScadenza) return false;
                const data = new Date(s.dataScadenza);
                return data >= oggi && data <= futuro;
            });
        } catch (error) {
            console.error('Errore scadenze imminenti:', error);
            return [];
        }
    },

    async getScadenzeScadute() {
        try {
            const oggi = new Date();
            const scadenze = await this.getScadenze();
            return scadenze.filter(s => {
                if (!s.dataScadenza) return false;
                const data = new Date(s.dataScadenza);
                return data < oggi;
            });
        } catch (error) {
            console.error('Errore scadenze scadute:', error);
            return [];
        }
    },

    async getScadenza(scadenzaId) {
        try {
            const doc = await db.collection('scadenzario').doc(scadenzaId).get();
            if (doc.exists) {
                const data = doc.data();
                return {
                    ...data,
                    clienteIdLegacy: data.id,
                    id: doc.id
                };
            }
            return null;
        } catch (error) {
            console.error('Errore caricamento scadenza:', error);
            return null;
        }
    },


    // === STATISTICHE ===
    async getStatistiche() {
        try {
            // Carica clienti con stato calcolato dai contratti
            const [clienti, fattureRecenti, scadenze, app, contratti] = await Promise.all([
                this.getClientiConStato(),
                this.getFatture({ limit: 500 }),  // Solo le 500 più recenti
                this.getScadenze(),
                this.getApps(),
                this.getContratti()
            ]);
            const fatture = fattureRecenti;

            // Clienti per stato (ora calcolato dai contratti)
            const clientiPerStato = {};
            clienti.forEach(c => {
                clientiPerStato[c.statoContratto] = (clientiPerStato[c.statoContratto] || 0) + 1;
            });

            // Fatture per stato
            const fatturePerStato = {};
            fatture.forEach(f => {
                fatturePerStato[f.statoPagamento] = (fatturePerStato[f.statoPagamento] || 0) + 1;
            });

            // Fatturato totale (le note di credito sottraggono)
            const fatturatoTotale = fatture
                .filter(f => f.statoPagamento === 'PAGATA' || f.tipoDocumento === 'NOTA_DI_CREDITO')
                .reduce((sum, f) => {
                    const importo = f.importoTotale || 0;
                    const isNC = f.tipoDocumento === 'NOTA_DI_CREDITO' || (f.numeroFatturaCompleto || '').startsWith('NC-');
                    return sum + (isNC ? -Math.abs(importo) : importo);
                }, 0);

            // Fatture non pagate (escluse note di credito)
            const fattureNonPagate = fatture.filter(f => f.statoPagamento === 'NON_PAGATA' && f.tipoDocumento !== 'NOTA_DI_CREDITO');
            const importoNonPagato = fattureNonPagate.reduce((sum, f) => sum + (f.importoTotale || 0), 0);

            // Scadenze critiche (scadute)
            const oggi = new Date();
            const scadenzeScadute = scadenze.filter(s => {
                if (!s.dataScadenza) return false;
                return new Date(s.dataScadenza) < oggi;
            });

            // Scadenze imminenti (prossimi 7 giorni)
            const tra7giorni = new Date(oggi);
            tra7giorni.setDate(tra7giorni.getDate() + 7);
            const scadenzeImminenti = scadenze.filter(s => {
                if (!s.dataScadenza) return false;
                const data = new Date(s.dataScadenza);
                return data >= oggi && data <= tra7giorni;
            });

            // Contratti per stato
            const contrattiPerStato = {};
            contratti.forEach(c => {
                contrattiPerStato[c.stato] = (contrattiPerStato[c.stato] || 0) + 1;
            });

            // App per stato
            const appPerStato = {};
            app.forEach(a => {
                appPerStato[a.statoApp] = (appPerStato[a.statoApp] || 0) + 1;
            });

            return {
                clienti: {
                    totale: clienti.length,
                    attivi: clientiPerStato['ATTIVO'] || 0,
                    scaduti: clientiPerStato['SCADUTO'] || 0,
                    cessati: clientiPerStato['CESSATO'] || 0,
                    senzaContratto: clientiPerStato['SENZA_CONTRATTO'] || 0,
                    perStato: clientiPerStato
                },
                app: {
                    totale: app.length,
                    attive: appPerStato['ATTIVA'] || 0,
                    inSviluppo: (appPerStato['SVILUPPO'] || 0) + (appPerStato['IN_SVILUPPO'] || 0),
                    sospese: appPerStato['SOSPESA'] || 0,
                    perStato: appPerStato
                },
                contratti: {
                    totale: contratti.length,
                    attivi: contrattiPerStato['ATTIVO'] || 0,
                    scaduti: contrattiPerStato['SCADUTO'] || 0,
                    cessati: contrattiPerStato['CESSATO'] || 0,
                    perStato: contrattiPerStato
                },
                fatture: {
                    totale: fatture.length,
                    pagate: fatturePerStato['PAGATA'] || 0,
                    nonPagate: fatturePerStato['NON_PAGATA'] || 0,
                    perStato: fatturePerStato,
                    fatturatoTotale,
                    importoNonPagato
                },
                scadenze: {
                    totale: scadenze.length,
                    scadute: scadenzeScadute.length,
                    imminenti: scadenzeImminenti.length
                }
            };
        } catch (error) {
            console.error('Errore calcolo statistiche:', error);
            return null;
        }
    },

    // === DATI FILTRATI PER AGENTE ===
    // Metodo centralizzato: carica i clienti dell'agente e filtra a cascata fatture, contratti, app
    async getDatiAgente(agenteNome) {
        try {
            // 1. Carica solo i clienti di questo agente
            const clienti = await this.getClienti({ agente: agenteNome });

            // 2. Raccogli tutti gli ID dei clienti (sia Firestore che legacy)
            const clienteIds = new Set();
            clienti.forEach(c => {
                if (c.id) clienteIds.add(c.id);
                if (c.clienteIdLegacy) clienteIds.add(c.clienteIdLegacy);
            });

            // 3. Carica fatture, contratti e app in parallelo (ogni query gestita singolarmente)
            const [tutteFattureResult, tuttiContrattiResult, tutteAppResult, scadenzeResult] = await Promise.allSettled([
                this.getFatture({ limit: 1000 }),
                this.getContratti(),
                this.getApps(),
                this.getScadenze({ agente: agenteNome })
            ]);

            // Estrai risultati con fallback sicuro ad array vuoto
            const tutteFatture = tutteFattureResult.status === 'fulfilled' ? tutteFattureResult.value : [];
            const tuttiContratti = tuttiContrattiResult.status === 'fulfilled' ? tuttiContrattiResult.value : [];
            const tutteApp = tutteAppResult.status === 'fulfilled' ? tutteAppResult.value : [];
            const scadenze = scadenzeResult.status === 'fulfilled' ? scadenzeResult.value : [];

            // Log eventuali errori senza bloccare il flusso
            if (tutteFattureResult.status === 'rejected') console.warn('Errore caricamento fatture agente:', tutteFattureResult.reason);
            if (tuttiContrattiResult.status === 'rejected') console.warn('Errore caricamento contratti agente:', tuttiContrattiResult.reason);
            if (tutteAppResult.status === 'rejected') console.warn('Errore caricamento app agente:', tutteAppResult.reason);
            if (scadenzeResult.status === 'rejected') console.warn('Errore caricamento scadenze agente:', scadenzeResult.reason);

            // 4. Filtra fatture per clienti dell'agente
            const fatture = tutteFatture.filter(f => clienteIds.has(f.clienteId));

            // 5. Filtra contratti per clienti dell'agente
            const contratti = tuttiContratti.filter(c => clienteIds.has(c.clienteId));

            // 6. Filtra app per clienti dell'agente (solo match esatti su ID)
            const app = tutteApp.filter(a => {
                if (a.clientePaganteId && clienteIds.has(a.clientePaganteId)) return true;
                if (a.clienteId && clienteIds.has(a.clienteId)) return true;
                return false;
            });

            // 7. Calcola lo stato clienti dai contratti caricati
            const contrattiPerCliente = {};
            contratti.forEach(c => {
                if (!c.clienteId) return;
                if (!contrattiPerCliente[c.clienteId]) contrattiPerCliente[c.clienteId] = [];
                contrattiPerCliente[c.clienteId].push(c);
            });

            const clientiConStato = clienti.map(cl => {
                const ids = [cl.id, cl.clienteIdLegacy].filter(Boolean);
                const contrattiCl = [];
                const idsVisti = new Set();
                ids.forEach(id => {
                    (contrattiPerCliente[id] || []).forEach(ct => {
                        if (!idsVisti.has(ct.id)) { idsVisti.add(ct.id); contrattiCl.push(ct); }
                    });
                });
                return {
                    ...cl,
                    statoContratto: this.calcolaStatoCliente(contrattiCl),
                    _numContratti: contrattiCl.length
                };
            });

            return { clienti: clientiConStato, fatture, contratti, app, scadenze, clienteIds };
        } catch (error) {
            console.error('Errore caricamento dati agente:', error);
            return { clienti: [], fatture: [], contratti: [], app: [], scadenze: [], clienteIds: new Set() };
        }
    },

    // Statistiche filtrate per agente
    async getStatisticheAgente(agenteNome) {
        try {
            const { clienti, fatture, contratti, app, scadenze } = await this.getDatiAgente(agenteNome);

            const oggi = new Date();
            const tra7giorni = new Date(oggi);
            tra7giorni.setDate(tra7giorni.getDate() + 7);

            // Clienti per stato
            const clientiPerStato = {};
            clienti.forEach(c => {
                clientiPerStato[c.statoContratto] = (clientiPerStato[c.statoContratto] || 0) + 1;
            });

            // Fatture per stato
            const fatturePerStato = {};
            fatture.forEach(f => {
                fatturePerStato[f.statoPagamento] = (fatturePerStato[f.statoPagamento] || 0) + 1;
            });

            const fatturatoTotale = fatture
                .filter(f => f.statoPagamento === 'PAGATA' || f.tipoDocumento === 'NOTA_DI_CREDITO')
                .reduce((sum, f) => {
                    const importo = f.importoTotale || 0;
                    const isNC = f.tipoDocumento === 'NOTA_DI_CREDITO' || (f.numeroFatturaCompleto || '').startsWith('NC-');
                    return sum + (isNC ? -Math.abs(importo) : importo);
                }, 0);

            const importoNonPagato = fatture
                .filter(f => f.statoPagamento === 'NON_PAGATA' && f.tipoDocumento !== 'NOTA_DI_CREDITO')
                .reduce((sum, f) => sum + (f.importoTotale || 0), 0);

            // Contratti per stato
            const contrattiPerStato = {};
            contratti.forEach(c => {
                contrattiPerStato[c.stato] = (contrattiPerStato[c.stato] || 0) + 1;
            });

            // App per stato
            const appPerStato = {};
            app.forEach(a => {
                appPerStato[a.statoApp] = (appPerStato[a.statoApp] || 0) + 1;
            });

            // Scadenze
            const scadenzeScadute = scadenze.filter(s => {
                if (!s.dataScadenza) return false;
                return new Date(s.dataScadenza) < oggi;
            });
            const scadenzeImminenti = scadenze.filter(s => {
                if (!s.dataScadenza) return false;
                const data = new Date(s.dataScadenza);
                return data >= oggi && data <= tra7giorni;
            });

            return {
                clienti: { totale: clienti.length, attivi: clientiPerStato['ATTIVO'] || 0, scaduti: clientiPerStato['SCADUTO'] || 0, cessati: clientiPerStato['CESSATO'] || 0, senzaContratto: clientiPerStato['SENZA_CONTRATTO'] || 0, perStato: clientiPerStato },
                app: { totale: app.length, attive: appPerStato['ATTIVA'] || 0, inSviluppo: (appPerStato['SVILUPPO'] || 0) + (appPerStato['IN_SVILUPPO'] || 0), sospese: appPerStato['SOSPESA'] || 0, perStato: appPerStato },
                contratti: { totale: contratti.length, attivi: contrattiPerStato['ATTIVO'] || 0, scaduti: contrattiPerStato['SCADUTO'] || 0, cessati: contrattiPerStato['CESSATO'] || 0, perStato: contrattiPerStato },
                fatture: { totale: fatture.length, pagate: fatturePerStato['PAGATA'] || 0, nonPagate: fatturePerStato['NON_PAGATA'] || 0, perStato: fatturePerStato, fatturatoTotale, importoNonPagato },
                scadenze: { totale: scadenze.length, scadute: scadenzeScadute.length, imminenti: scadenzeImminenti.length }
            };
        } catch (error) {
            console.error('Errore calcolo statistiche agente:', error);
            return null;
        }
    },

    // === UTILITY ===
    formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    },

    formatCurrency(amount) {
        if (!amount && amount !== 0) return '-';
        return new Intl.NumberFormat('it-IT', {
            style: 'currency',
            currency: 'EUR'
        }).format(amount);
    },

    getUrgenzaScadenza(dataScadenza) {
        if (!dataScadenza) return 'unknown';
        const oggi = new Date();
        const scadenza = new Date(dataScadenza);
        const giorni = Math.ceil((scadenza - oggi) / (1000 * 60 * 60 * 24));

        // Soglie da impostazioni di sistema
        const _sys = SettingsService.getSystemSettingsSync();
        const sogliaCritico = _sys.sogliaCritico || 7;
        const sogliaImminente = _sys.sogliaImminente || 30;

        if (giorni < 0) return 'scaduto';
        if (giorni <= sogliaCritico) return 'critico';
        if (giorni <= sogliaImminente) return 'imminente';
        return 'normale';
    },

    getStatoBadgeClass(stato) {
        const mapping = {
            'ATTIVO': 'badge-success',
            'SCADUTO': 'badge-danger',
            'PROSPECT': 'badge-info',
            'CESSATO': 'badge-secondary',
            'SOSPESO': 'badge-warning',
            'SENZA_CONTRATTO': 'badge-danger',
            'DA_DEFINIRE': 'badge-warning',
            'IN_RINNOVO': 'badge-info',
            'PAGATA': 'badge-success',
            'NON_PAGATA': 'badge-danger',
            'PARZIALMENTE_PAGATA': 'badge-warning',
            'NOTA_CREDITO': 'badge-secondary',
            'RIFIUTATA': 'badge-danger'
        };
        return mapping[stato] || 'badge-secondary';
    },

    // === CRUD OPERATIONS ===

    // CLIENTI
    async updateCliente(clienteId, data) {
        try {
            await db.collection('clienti').doc(clienteId).update(data);
            return true;
        } catch (error) {
            console.error('Errore aggiornamento cliente:', error);
            throw error;
        }
    },

    async createCliente(data) {
        try {
            // Rimuovi statoContratto statico (viene calcolato dai contratti)
            delete data.statoContratto;
            const docRef = await db.collection('clienti').add({
                ...data,
                dataCreazione: new Date().toISOString()
            });
            return docRef.id;
        } catch (error) {
            console.error('Errore creazione cliente:', error);
            throw error;
        }
    },

    async deleteCliente(clienteId) {
        try {
            await db.collection('clienti').doc(clienteId).delete();
            return true;
        } catch (error) {
            console.error('Errore eliminazione cliente:', error);
            throw error;
        }
    },

    // FATTURE
    async updateFattura(fatturaId, data) {
        try {
            await db.collection('fatture').doc(fatturaId).update(data);
            return true;
        } catch (error) {
            console.error('Errore aggiornamento fattura:', error);
            throw error;
        }
    },

    async createFattura(data) {
        try {
            const docRef = await db.collection('fatture').add({
                ...data,
                dataCreazione: new Date().toISOString(),
                statoPagamento: data.statoPagamento || 'NON_PAGATA'
            });
            return docRef.id;
        } catch (error) {
            console.error('Errore creazione fattura:', error);
            throw error;
        }
    },

    async deleteFattura(fatturaId) {
        try {
            await db.collection('fatture').doc(fatturaId).delete();
            return true;
        } catch (error) {
            console.error('Errore eliminazione fattura:', error);
            throw error;
        }
    },

    // SCADENZE
    async updateScadenza(scadenzaId, data) {
        try {
            await db.collection('scadenzario').doc(scadenzaId).update(data);
            return true;
        } catch (error) {
            console.error('Errore aggiornamento scadenza:', error);
            throw error;
        }
    },

    async createScadenza(data) {
        try {
            const docRef = await db.collection('scadenzario').add({
                ...data,
                dataCreazione: new Date().toISOString(),
                completata: data.completata || false
            });
            return docRef.id;
        } catch (error) {
            console.error('Errore creazione scadenza:', error);
            throw error;
        }
    },

    /**
     * Genera scadenze automatiche da un contratto appena creato
     * - 1 scadenza RINNOVO_CONTRATTO (dataScadenza - giorniPreavviso)
     * - N scadenze FATTURAZIONE in base alla periodicità
     */
    async generateScadenzeFromContratto(contratto, clienteRagioneSociale, agente) {
        try {
            const scadenzeCreate = [];
            const dataInizio = new Date(contratto.dataInizio);
            const dataScadenza = new Date(contratto.dataScadenza);
            const importoAnnuale = parseFloat(contratto.importoAnnuale) || 0;
            const _sysPreavviso = SettingsService.getSystemSettingsSync().giorniPreavvisoRinnovo || 60;
            const giorniPreavviso = parseInt(contratto.giorniPreavvisoRinnovo) || _sysPreavviso;

            // === 1. SCADENZA RINNOVO CONTRATTO ===
            if (contratto.dataScadenza) {
                const dataRinnovo = new Date(dataScadenza);
                dataRinnovo.setDate(dataRinnovo.getDate() - giorniPreavviso);

                // Solo se la data di rinnovo è futura
                if (dataRinnovo > new Date()) {
                    const idRinnovo = await this.createScadenza({
                        tipo: 'RINNOVO_CONTRATTO',
                        clienteId: contratto.clienteId,
                        clienteRagioneSociale: clienteRagioneSociale || '',
                        contrattoId: contratto.id || '',
                        dataScadenza: dataRinnovo.toISOString(),
                        descrizione: `Rinnovo contratto ${contratto.numeroContratto}`,
                        agente: agente || '',
                        importo: importoAnnuale,
                        completata: false,
                        note: `Preavviso ${giorniPreavviso} giorni prima della scadenza del ${dataScadenza.toLocaleDateString('it-IT')}`
                    });
                    scadenzeCreate.push(idRinnovo);
                }
            }

            // === 2. SCADENZE FATTURAZIONE ===
            if (contratto.periodicita && importoAnnuale > 0) {
                // Calcola numero periodi e intervallo mesi
                let numPeriodi = 1;
                let intervalloMesi = 12;

                switch (contratto.periodicita) {
                    case 'MENSILE':
                        numPeriodi = 12;
                        intervalloMesi = 1;
                        break;
                    case 'BIMENSILE':
                        numPeriodi = 6;
                        intervalloMesi = 2;
                        break;
                    case 'TRIMESTRALE':
                        numPeriodi = 4;
                        intervalloMesi = 3;
                        break;
                    case 'SEMESTRALE':
                        numPeriodi = 2;
                        intervalloMesi = 6;
                        break;
                    case 'ANNUALE':
                        numPeriodi = 1;
                        intervalloMesi = 12;
                        break;
                    case 'BIENNALE':
                        numPeriodi = 1;
                        intervalloMesi = 24;
                        break;
                    case 'TRIENNALE':
                        numPeriodi = 1;
                        intervalloMesi = 36;
                        break;
                    case 'QUADRIENNALE':
                        numPeriodi = 1;
                        intervalloMesi = 48;
                        break;
                    case 'QUINQUENNALE':
                        numPeriodi = 1;
                        intervalloMesi = 60;
                        break;
                    case 'UNA_TANTUM':
                        numPeriodi = 1;
                        intervalloMesi = 0; // Nessun intervallo, una sola scadenza
                        break;
                }

                const importoPerPeriodo = Math.round((importoAnnuale / numPeriodi) * 100) / 100;

                for (let i = 0; i < numPeriodi; i++) {
                    // Calcola data scadenza fatturazione
                    const dataFatturazione = new Date(dataInizio);

                    if (contratto.periodicita === 'UNA_TANTUM') {
                        // Una tantum: stessa data di inizio
                    } else {
                        // Aggiungi mesi in modo sicuro (gestione fine mese)
                        const meseTarget = dataFatturazione.getMonth() + (intervalloMesi * i);
                        dataFatturazione.setMonth(meseTarget);

                        // Gestione edge case fine mese (es. 31 gen + 1 mese = 28/29 feb)
                        const giornoOriginale = new Date(dataInizio).getDate();
                        if (dataFatturazione.getDate() !== giornoOriginale) {
                            // Se il giorno è cambiato, vai all'ultimo giorno del mese precedente
                            dataFatturazione.setDate(0);
                        }
                    }

                    // Verifica che la data sia nel range contratto
                    if (dataFatturazione > dataScadenza) break;

                    // Crea scadenza fatturazione
                    const periodoLabel = this._getPeriodoLabel(contratto.periodicita, i + 1, numPeriodi);

                    const idFatt = await this.createScadenza({
                        tipo: 'FATTURAZIONE',
                        clienteId: contratto.clienteId,
                        clienteRagioneSociale: clienteRagioneSociale || '',
                        contrattoId: contratto.id || '',
                        dataScadenza: dataFatturazione.toISOString(),
                        descrizione: `Fatturazione ${periodoLabel} - ${contratto.numeroContratto}`,
                        agente: agente || '',
                        importo: importoPerPeriodo,
                        completata: false,
                        note: `${contratto.oggetto || ''} • Periodicità: ${contratto.periodicita} • Rata ${i + 1}/${numPeriodi}`
                    });
                    scadenzeCreate.push(idFatt);
                }
            }

            return {
                success: true,
                scadenzeCreate: scadenzeCreate.length,
                ids: scadenzeCreate
            };

        } catch (error) {
            console.error('Errore generazione scadenze da contratto:', error);
            return {
                success: false,
                error: error.message,
                scadenzeCreate: 0
            };
        }
    },

    /**
     * Helper: genera etichetta periodo per scadenza fatturazione
     */
    _getPeriodoLabel(periodicita, numero, totale) {
        switch (periodicita) {
            case 'MENSILE':
                const mesi = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                              'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
                return mesi[(numero - 1) % 12] || `Rata ${numero}`;
            case 'BIMENSILE':
                return `Bimestre ${numero}/${totale}`;
            case 'TRIMESTRALE':
                return `Q${numero} (Trimestre ${numero}/${totale})`;
            case 'SEMESTRALE':
                return `Semestre ${numero}/${totale}`;
            case 'ANNUALE':
                return 'Annuale';
            case 'BIENNALE':
                return 'Biennale';
            case 'TRIENNALE':
                return 'Triennale';
            case 'QUADRIENNALE':
                return 'Quadriennale';
            case 'QUINQUENNALE':
                return 'Quinquennale';
            case 'UNA_TANTUM':
                return 'Una Tantum';
            default:
                return `Rata ${numero}/${totale}`;
        }
    },

    async deleteScadenza(scadenzaId) {
        try {
            await db.collection('scadenzario').doc(scadenzaId).delete();
            return true;
        } catch (error) {
            console.error('Errore eliminazione scadenza:', error);
            throw error;
        }
    },

    // AZIONI RAPIDE
    async marcaFatturaPagata(fatturaId, dataPagamento = null) {
        try {
            const updateData = {
                statoPagamento: 'PAGATA',
                dataSaldo: dataPagamento || new Date().toISOString()
            };
            await this.updateFattura(fatturaId, updateData);
            return true;
        } catch (error) {
            console.error('Errore marca fattura pagata:', error);
            throw error;
        }
    },

    async marcaScadenzaCompletata(scadenzaId) {
        try {
            await this.updateScadenza(scadenzaId, {
                completata: true,
                dataCompletamento: new Date().toISOString()
            });
            return true;
        } catch (error) {
            console.error('Errore marca scadenza completata:', error);
            throw error;
        }
    },

    // =========================================================================
    // SCADENZARIO CALCOLATO — Vista derivata da Contratti e Fatture
    // =========================================================================

    /**
     * Calcola i periodi di fatturazione mancanti per contratti attivi.
     * Per ogni contratto ATTIVO, genera i periodi previsti dalla periodicità
     * e verifica se esiste già una fattura collegata per quel periodo.
     *
     * Il matching fatture avviene in 2 modi:
     * 1) Per contrattoId (match diretto, preciso)
     * 2) Fallback per clienteId + data emissione in finestra temporale
     *    (per fatture storiche senza contrattoId)
     */
    calcolaFattureDaEmettere(contratti, fatture) {
        const oggi = new Date();
        oggi.setHours(0, 0, 0, 0);
        // Limiti da impostazioni di sistema
        const _sys = SettingsService.getSystemSettingsSync();
        const limite = new Date(oggi);
        limite.setDate(limite.getDate() + (_sys.giorniFuturoBilling || 90));
        const result = [];

        // Pre-indicizza fatture per clienteId per velocizzare il lookup
        const fatturePerCliente = {};
        for (const f of fatture) {
            if (!f.clienteId) continue;
            if (!fatturePerCliente[f.clienteId]) fatturePerCliente[f.clienteId] = [];
            fatturePerCliente[f.clienteId].push(f);
        }

        // Pre-indicizza fatture per contrattoId
        const fatturePerContratto = {};
        for (const f of fatture) {
            if (!f.contrattoId) continue;
            if (!fatturePerContratto[f.contrattoId]) fatturePerContratto[f.contrattoId] = [];
            fatturePerContratto[f.contrattoId].push(f);
        }

        const contrattiAttivi = contratti.filter(c => c.stato === 'ATTIVO' && c.periodicita && c.dataInizio);

        for (const contratto of contrattiAttivi) {
            // Salta UNA_TANTUM — non hanno periodicità ricorrente
            if (contratto.periodicita === 'UNA_TANTUM') continue;

            const dataInizio = new Date(contratto.dataInizio);
            const dataScadenza = contratto.dataScadenza ? new Date(contratto.dataScadenza) : limite;
            const importoAnnuale = parseFloat(contratto.importoAnnuale) || 0;
            if (importoAnnuale <= 0) continue;

            // Calcola periodi e intervallo
            let numPeriodi = 1, intervalloMesi = 12;
            switch (contratto.periodicita) {
                case 'MENSILE':      numPeriodi = 12; intervalloMesi = 1; break;
                case 'BIMENSILE':    numPeriodi = 6;  intervalloMesi = 2; break;
                case 'TRIMESTRALE':  numPeriodi = 4;  intervalloMesi = 3; break;
                case 'SEMESTRALE':   numPeriodi = 2;  intervalloMesi = 6; break;
                case 'ANNUALE':      numPeriodi = 1;  intervalloMesi = 12; break;
                case 'BIENNALE':     numPeriodi = 1;  intervalloMesi = 24; break;
                case 'TRIENNALE':    numPeriodi = 1;  intervalloMesi = 36; break;
                case 'QUADRIENNALE': numPeriodi = 1;  intervalloMesi = 48; break;
                case 'QUINQUENNALE': numPeriodi = 1;  intervalloMesi = 60; break;
            }

            const importoPerPeriodo = Math.round((importoAnnuale / numPeriodi) * 100) / 100;

            // Raccogli TUTTE le fatture che possono corrispondere a questo contratto:
            // 1) Fatture con contrattoId esplicito
            const fattureDirecte = fatturePerContratto[contratto.id] || [];
            // 2) Fatture dello stesso cliente SENZA contrattoId (match per data)
            const fattureCliente = (fatturePerCliente[contratto.clienteId] || [])
                .filter(f => !f.contrattoId); // Solo quelle senza contrattoId (evita doppi match)

            const tutteLeFatture = [...fattureDirecte, ...fattureCliente];

            // Genera solo i periodi dell'anno corrente e del prossimo
            // (non tutto lo storico — quello è già fatturato)
            const annoCorrente = oggi.getFullYear();
            const annoInizio = Math.max(new Date(contratto.dataInizio).getFullYear(), annoCorrente - 1);
            const annoFine = Math.min(dataScadenza.getFullYear(), annoCorrente + 1);

            for (let anno = annoInizio; anno <= annoFine; anno++) {
                for (let i = 0; i < numPeriodi; i++) {
                    const dataFatturazione = new Date(dataInizio);

                    // Per anni successivi al primo, partiamo dall'anniversario
                    if (anno > dataInizio.getFullYear()) {
                        dataFatturazione.setFullYear(anno);
                        dataFatturazione.setMonth(dataInizio.getMonth());
                        dataFatturazione.setDate(dataInizio.getDate());
                    }

                    const meseTarget = dataFatturazione.getMonth() + (intervalloMesi * i);
                    dataFatturazione.setMonth(meseTarget);
                    // Correggi fine mese (es. 31 gen → 28 feb)
                    const giornoOriginale = new Date(dataInizio).getDate();
                    if (dataFatturazione.getDate() !== giornoOriginale) {
                        dataFatturazione.setDate(0);
                    }

                    // Deve essere nel range del contratto
                    if (dataFatturazione > dataScadenza) break;
                    // Mostra solo periodi fino a 90 giorni nel futuro
                    if (dataFatturazione > limite) continue;
                    // Salta periodi troppo vecchi (lookback da impostazioni)
                    const lookbackDate = new Date(oggi);
                    lookbackDate.setDate(lookbackDate.getDate() - (_sys.giorniLookbackStorico || 180));
                    if (dataFatturazione < lookbackDate) continue;

                    // Calcola finestra temporale per il matching (metà intervallo)
                    // Es: MENSILE → ±15gg, TRIMESTRALE → ±45gg, ANNUALE → ±90gg
                    const giorniFinestra = Math.max(Math.floor(intervalloMesi * 15), 20);
                    const dataMin = new Date(dataFatturazione);
                    dataMin.setDate(dataMin.getDate() - giorniFinestra);
                    const dataMax = new Date(dataFatturazione);
                    dataMax.setDate(dataMax.getDate() + giorniFinestra);

                    // Verifica se esiste già una fattura per questo periodo
                    const fatturaEsistente = tutteLeFatture.some(f => {
                        const dataRef = f.dataEmissione || f.dataFattura || f.dataScadenza;
                        if (!dataRef) return false;
                        const de = new Date(dataRef);
                        return de >= dataMin && de <= dataMax;
                    });

                    if (!fatturaEsistente) {
                        const periodoLabel = this._getPeriodoLabel(contratto.periodicita, i + 1, numPeriodi);
                        result.push({
                            id: `emit_${contratto.id}_${anno}_${i}`,
                            tipo: 'FATTURA_EMISSIONE',
                            contrattoId: contratto.id,
                            clienteId: contratto.clienteId,
                            clienteRagioneSociale: contratto.clienteRagioneSociale || '',
                            numeroContratto: contratto.numeroContratto || '',
                            dataScadenza: dataFatturazione.toISOString(),
                            importo: importoPerPeriodo,
                            agente: contratto.agente || '',
                            descrizione: `Fattura da emettere: ${periodoLabel} ${anno} — ${contratto.numeroContratto}`,
                            isComputed: true
                        });
                    }
                }
            }
        }

        // Ordina per data
        result.sort((a, b) => new Date(a.dataScadenza) - new Date(b.dataScadenza));
        return result;
    },

    /**
     * Calcola l'intero scadenzario da dati reali (contratti + fatture).
     * Opzionale: filtra per agente.
     */
    async getScadenzeCompute(opzioni = {}) {
        try {
            let contratti, fatture;

            if (opzioni.contratti && opzioni.fatture) {
                // Dati già disponibili (es. da getDatiAgente)
                contratti = opzioni.contratti;
                fatture = opzioni.fatture;
            } else {
                // Carica tutto in parallelo
                [contratti, fatture] = await Promise.all([
                    this.getContratti(),
                    this.getFatture({ limit: 5000 })
                ]);
            }

            // Filtra per agente se richiesto
            if (opzioni.agente) {
                const datiAgente = await this.getDatiAgente(opzioni.agente);
                const clienteIds = datiAgente.clienteIds;
                contratti = contratti.filter(c => clienteIds.has(c.clienteId));
                fatture = fatture.filter(f => clienteIds.has(f.clienteId));
            }

            const oggi = new Date();
            const fra60 = new Date(oggi);
            fra60.setDate(fra60.getDate() + 60);

            // 1. Contratti da rinnovare (ATTIVI in scadenza entro 60 giorni)
            const contrattiDaRinnovare = contratti
                .filter(c => {
                    if (c.stato !== 'ATTIVO' || !c.dataScadenza) return false;
                    const ds = new Date(c.dataScadenza);
                    return ds <= fra60;
                })
                .map(c => ({
                    ...c,
                    tipo: 'CONTRATTO_RINNOVO',
                    descrizione: `Rinnovo contratto ${c.numeroContratto || ''}`,
                    isComputed: true
                }))
                .sort((a, b) => new Date(a.dataScadenza) - new Date(b.dataScadenza));

            // 2. Fatture da incassare (emesse ma non pagate)
            const fattureDaIncassare = fatture
                .filter(f => f.statoPagamento === 'NON_PAGATA' || f.statoPagamento === 'PARZIALMENTE_PAGATA')
                .map(f => ({
                    ...f,
                    tipo: 'FATTURA_INCASSO',
                    descrizione: `Fattura da incassare: ${f.numeroFatturaCompleto || f.numeroFattura || ''} — ${f.clienteRagioneSociale || ''}`,
                    isComputed: true
                }))
                .sort((a, b) => new Date(a.dataScadenza || 0) - new Date(b.dataScadenza || 0));

            // 3. Fatture da emettere (calcolate dai periodi contrattuali)
            const fattureDaEmettere = this.calcolaFattureDaEmettere(contratti, fatture);

            // Unione ordinata per urgenza
            const tutteLeScadenze = [
                ...contrattiDaRinnovare,
                ...fattureDaIncassare,
                ...fattureDaEmettere
            ].sort((a, b) => new Date(a.dataScadenza || 0) - new Date(b.dataScadenza || 0));

            return {
                contrattiDaRinnovare,
                fattureDaEmettere,
                fattureDaIncassare,
                tutteLeScadenze
            };

        } catch (error) {
            console.error('Errore calcolo scadenzario:', error);
            return { contrattiDaRinnovare: [], fattureDaEmettere: [], fattureDaIncassare: [], tutteLeScadenze: [] };
        }
    }
};

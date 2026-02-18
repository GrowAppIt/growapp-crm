// Data Service - Gestione dati da Firestore
const DataService = {
    // === CLIENTI ===
    async getClienti(filtri = {}) {
        try {
            let query = db.collection('clienti');

            if (filtri.stato) {
                query = query.where('statoContratto', '==', filtri.stato);
            }
            if (filtri.agente) {
                query = query.where('agente', '==', filtri.agente);
            }
            if (filtri.tipo) {
                query = query.where('tipo', '==', filtri.tipo);
            }

            query = query.orderBy('ragioneSociale', 'asc');

            const snapshot = await query.get();
            return snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    ...data,
                    clienteIdLegacy: data.id,  // Salva l'ID originale prima di sovrascriverlo
                    id: doc.id  // ID documento Firestore
                };
            });
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

            if (filtri.tipo) {
                query = query.where('tipo', '==', filtri.tipo);
            }
            if (filtri.agente) {
                query = query.where('agente', '==', filtri.agente);
            }

            query = query.where('completata', '==', false)
                         .orderBy('dataScadenza', 'asc');

            const snapshot = await query.get();
            return snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    ...data,
                    clienteIdLegacy: data.id,  // Salva l'ID originale prima di sovrascriverlo
                    id: doc.id  // ID documento Firestore
                };
            });
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
            // Carica solo i dati necessari per le statistiche
            const [clienti, fattureRecenti, scadenze, app, contratti] = await Promise.all([
                this.getClienti(),
                this.getFatture({ limit: 500 }),  // Solo le 500 più recenti
                this.getScadenze(),
                this.getApps(),
                this.getContratti()
            ]);
            const fatture = fattureRecenti;

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

            // Fatturato totale
            const fatturatoTotale = fatture
                .filter(f => f.statoPagamento === 'PAGATA')
                .reduce((sum, f) => sum + (f.importoTotale || 0), 0);

            // Fatture non pagate
            const fattureNonPagate = fatture.filter(f => f.statoPagamento === 'NON_PAGATA');
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
                    prospect: clientiPerStato['PROSPECT'] || 0,
                    scaduti: clientiPerStato['SCADUTO'] || 0,
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

        if (giorni < 0) return 'scaduto';
        if (giorni <= 7) return 'critico';
        if (giorni <= 30) return 'imminente';
        return 'normale';
    },

    getStatoBadgeClass(stato) {
        const mapping = {
            'ATTIVO': 'badge-success',
            'SCADUTO': 'badge-danger',
            'PROSPECT': 'badge-info',
            'CESSATO': 'badge-secondary',
            'DA_DEFINIRE': 'badge-warning',
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
            const docRef = await db.collection('clienti').add({
                ...data,
                dataCreazione: new Date().toISOString(),
                statoContratto: data.statoContratto || 'PROSPECT'
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
    }
};

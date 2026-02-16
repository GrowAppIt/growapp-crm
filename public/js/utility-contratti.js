// Utility per gestione contratti (pulizia, debug, etc.)
const UtilityContratti = {

    /**
     * Elimina tutti i contratti migrati (con flag migrato = true)
     */
    async eliminaContrattiMigrati() {
        try {
            const contratti = await DataService.getContratti();
            const contrattiMigrati = contratti.filter(c => c.migrato === true);

            if (contrattiMigrati.length === 0) {
                return {
                    success: true,
                    messaggio: 'Nessun contratto migrato da eliminare',
                    eliminati: 0
                };
            }

            // Conferma
            const conferma = confirm(
                `⚠️ ELIMINA CONTRATTI MIGRATI\n\n` +
                `Verranno eliminati ${contrattiMigrati.length} contratti con flag "migrato".\n\n` +
                `Contratti da eliminare:\n` +
                contrattiMigrati.slice(0, 10).map(c => `- ${c.numeroContratto} (${c.clienteRagioneSociale})`).join('\n') +
                (contrattiMigrati.length > 10 ? `\n... e altri ${contrattiMigrati.length - 10}` : '') +
                `\n\nQuesta operazione NON può essere annullata!\n\nConfermi l'eliminazione?`
            );

            if (!conferma) {
                return {
                    success: false,
                    messaggio: 'Operazione annullata dall\'utente',
                    eliminati: 0
                };
            }

            // Elimina tutti i contratti migrati
            let eliminati = 0;
            let errori = [];

            for (const contratto of contrattiMigrati) {
                try {
                    await DataService.deleteContratto(contratto.id);
                    eliminati++;
                } catch (error) {
                    console.error(`❌ Errore eliminazione ${contratto.numeroContratto}:`, error);
                    errori.push({
                        contratto: contratto.numeroContratto,
                        errore: error.message
                    });
                }
            }

            return {
                success: true,
                messaggio: `Eliminati ${eliminati}/${contrattiMigrati.length} contratti migrati`,
                eliminati: eliminati,
                errori: errori
            };

        } catch (error) {
            console.error('Errore eliminazione contratti migrati:', error);
            return {
                success: false,
                messaggio: 'Errore: ' + error.message,
                eliminati: 0
            };
        }
    },

    /**
     * Trova e mostra duplicati
     */
    async trovaDuplicati() {
        try {
            const contratti = await DataService.getContratti();

            // Raggruppa per clienteId
            const gruppiCliente = {};
            contratti.forEach(c => {
                if (!gruppiCliente[c.clienteId]) {
                    gruppiCliente[c.clienteId] = [];
                }
                gruppiCliente[c.clienteId].push(c);
            });

            // Trova clienti con più contratti migrati
            const duplicati = [];
            Object.keys(gruppiCliente).forEach(clienteId => {
                const contrattiCliente = gruppiCliente[clienteId];
                const contrattiMigrati = contrattiCliente.filter(c => c.migrato === true);

                if (contrattiMigrati.length > 1) {
                    duplicati.push({
                        clienteId: clienteId,
                        cliente: contrattiCliente[0].clienteRagioneSociale,
                        totaleContratti: contrattiCliente.length,
                        contrattiMigrati: contrattiMigrati.length,
                        contratti: contrattiMigrati.map(c => ({
                            id: c.id,
                            numeroContratto: c.numeroContratto,
                            dataMigrazione: c.dataMigrazione
                        }))
                    });
                }
            });

            return {
                success: true,
                duplicati: duplicati,
                totaleDuplicati: duplicati.length
            };

        } catch (error) {
            console.error('Errore ricerca duplicati:', error);
            return {
                success: false,
                errore: error.message
            };
        }
    },

    /**
     * Verifica stato migrazione
     */
    async verificaStatoMigrazione() {
        try {
            const [contratti, clienti] = await Promise.all([
                DataService.getContratti(),
                DataService.getClienti()
            ]);

            const contrattiMigrati = contratti.filter(c => c.migrato === true);
            const contrattiNormali = contratti.filter(c => !c.migrato);

            const clientiConDatiContrattuali = clienti.filter(c =>
                c.dataScadenzaContratto ||
                c.importoContratto ||
                c.dataProssimaFattura
            );

            return {
                success: true,
                totaleContratti: contratti.length,
                contrattiMigrati: contrattiMigrati.length,
                contrattiNormali: contrattiNormali.length,
                totaleClienti: clienti.length,
                clientiDaMigrare: clientiConDatiContrattuali.length,
                mancano: Math.max(0, clientiConDatiContrattuali.length - contrattiMigrati.length)
            };

        } catch (error) {
            console.error('Errore verifica stato:', error);
            return {
                success: false,
                errore: error.message
            };
        }
    }
};

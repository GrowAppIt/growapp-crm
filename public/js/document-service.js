// Document Service - Gestione documenti con Firebase Storage
const DocumentService = {
    // Configurazione
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_TYPES: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
    ALLOWED_EXTENSIONS: ['pdf', 'jpg', 'jpeg', 'png'],

    /**
     * Valida un file prima dell'upload
     */
    validateFile(file) {
        const errors = [];

        // Verifica dimensione
        if (file.size > this.MAX_FILE_SIZE) {
            errors.push(`Il file supera la dimensione massima di 10MB (attuale: ${(file.size / 1024 / 1024).toFixed(2)}MB)`);
        }

        // Verifica tipo
        if (!this.ALLOWED_TYPES.includes(file.type)) {
            errors.push('Tipo file non supportato. Sono ammessi solo PDF e immagini (JPG, PNG)');
        }

        // Verifica estensione
        const extension = file.name.split('.').pop().toLowerCase();
        if (!this.ALLOWED_EXTENSIONS.includes(extension)) {
            errors.push('Estensione file non valida');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    },

    /**
     * Data di oggi in formato YYYY-MM-DD, nel fuso orario locale.
     * (NON usare toISOString(): di notte restituisce il giorno precedente perché è UTC)
     */
    oggiISO() {
        const d = new Date();
        const mese = String(d.getMonth() + 1).padStart(2, '0');
        const giorno = String(d.getDate()).padStart(2, '0');
        return `${d.getFullYear()}-${mese}-${giorno}`;
    },

    /**
     * Normalizza una data in YYYY-MM-DD, oppure null se non valida
     */
    normalizzaData(valore) {
        if (!valore) return null;
        const data = String(valore).slice(0, 10);
        return /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null;
    },

    /**
     * Data "ufficiale" del documento: quella scelta dall'utente se presente,
     * altrimenti si ricade sulla data di caricamento (documenti caricati prima
     * dell'introduzione del campo dataDocumento).
     */
    getDataDocumento(doc) {
        return this.normalizzaData(doc.dataDocumento) || this.normalizzaData(doc.dataCaricamento) || '';
    },

    /**
     * Formatta una data YYYY-MM-DD in gg/mm/aaaa
     */
    formatData(dataISO) {
        const parti = String(dataISO || '').slice(0, 10).split('-');
        if (parti.length !== 3 || !parti[0]) return '—';
        return `${parti[2]}/${parti[1]}/${parti[0]}`;
    },

    /**
     * Ordina i documenti dal più recente al più vecchio in base alla data del
     * documento; a parità di data vince chi è stato caricato per ultimo.
     */
    sortDocumenti(documenti) {
        return documenti.sort((a, b) => {
            const dataA = this.getDataDocumento(a);
            const dataB = this.getDataDocumento(b);
            if (dataA !== dataB) return dataA < dataB ? 1 : -1;
            return String(b.dataCaricamento || '').localeCompare(String(a.dataCaricamento || ''));
        });
    },

    /**
     * Il file può essere mostrato in anteprima nel CRM?
     */
    isImmagine(mimeType) {
        return !!mimeType && mimeType.startsWith('image/');
    },

    isPdf(mimeType) {
        return mimeType === 'application/pdf';
    },

    /**
     * Upload documento su Firebase Storage
     */
    async uploadDocumento(file, tipo, entitaId, descrizione, dataDocumento) {
        try {
            // Valida file
            const validation = this.validateFile(file);
            if (!validation.valid) {
                throw new Error(validation.errors.join('\n'));
            }

            // Valida descrizione
            if (!descrizione || descrizione.trim().length === 0) {
                throw new Error('La descrizione è obbligatoria');
            }

            UI.showLoading('Upload documento in corso...');

            // Genera nome file unico
            const timestamp = Date.now();
            const extension = file.name.split('.').pop().toLowerCase();
            const nomeFileStorage = `${timestamp}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

            // Path storage basato su tipo entità
            const storagePath = `documenti/${tipo}/${entitaId}/${nomeFileStorage}`;

            // Upload su Firebase Storage
            const storageRef = storage.ref();
            const fileRef = storageRef.child(storagePath);

            const uploadTask = await fileRef.put(file, {
                contentType: file.type,
                customMetadata: {
                    originalName: file.name,
                    uploadedBy: AuthService.getUserName(),
                    uploadedById: AuthService.getUserId()
                }
            });

            // Ottieni URL download
            const downloadUrl = await fileRef.getDownloadURL();

            // Salva metadata in Firestore
            const docData = {
                tipo: tipo, // cliente, app
                entitaId: entitaId,
                nomeFile: nomeFileStorage,
                nomeOriginale: file.name,
                estensione: extension,
                mimeType: file.type,
                dimensione: file.size,
                descrizione: descrizione.trim(),
                storagePath: storagePath,
                downloadUrl: downloadUrl,
                caricatoDa: AuthService.getUserId(),
                caricatoDaNome: AuthService.getUserName(),
                // Data del documento: se non indicata vale quella di caricamento
                dataDocumento: this.normalizzaData(dataDocumento) || this.oggiISO(),
                dataCaricamento: new Date().toISOString()
            };

            const docRef = await db.collection('documenti').add(docData);

            UI.hideLoading();
            UI.showSuccess('Documento caricato con successo!');

            return {
                id: docRef.id,
                ...docData
            };

        } catch (error) {
            UI.hideLoading();
            console.error('Errore upload documento:', error);
            throw error;
        }
    },

    /**
     * Aggiorna i dati modificabili di un documento già caricato
     * (descrizione e data). Il file su Storage non viene toccato.
     */
    async updateDocumento(documentoId, dati) {
        try {
            const descrizione = (dati.descrizione || '').trim();
            if (!descrizione) {
                throw new Error('La descrizione è obbligatoria');
            }

            UI.showLoading('Salvataggio modifiche...');

            const updateData = {
                descrizione: descrizione,
                modificatoDa: AuthService.getUserId(),
                modificatoDaNome: AuthService.getUserName(),
                dataModifica: new Date().toISOString()
            };

            const dataDocumento = this.normalizzaData(dati.dataDocumento);
            if (dataDocumento) {
                updateData.dataDocumento = dataDocumento;
            }

            await db.collection('documenti').doc(documentoId).update(updateData);

            UI.hideLoading();
            UI.showSuccess('Documento aggiornato con successo');

            return updateData;

        } catch (error) {
            UI.hideLoading();
            console.error('Errore aggiornamento documento:', error);
            throw error;
        }
    },

    /**
     * Ottieni lista documenti per entità
     *
     * NOTA: la query Firestore continua a ordinare per dataCaricamento (indice
     * già esistente). L'ordinamento per data del documento è fatto lato client
     * di proposito: un orderBy('dataDocumento') ESCLUDEREBBE dai risultati tutti
     * i documenti caricati prima dell'introduzione del campo.
     */
    async getDocumenti(tipo, entitaId) {
        try {
            const snapshot = await db.collection('documenti')
                .where('tipo', '==', tipo)
                .where('entitaId', '==', entitaId)
                .orderBy('dataCaricamento', 'desc')
                .get();

            return this.sortDocumenti(snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })));

        } catch (error) {
            console.error('Errore caricamento documenti:', error);
            throw error;
        }
    },

    /**
     * Elimina documento
     */
    async deleteDocumento(documentoId, storagePath) {
        try {
            UI.showLoading('Eliminazione documento...');

            // Elimina file da Storage
            const storageRef = storage.ref();
            const fileRef = storageRef.child(storagePath);

            try {
                await fileRef.delete();
            } catch (storageError) {
                console.warn('File non trovato in storage:', storageError);
                // Continua comunque per eliminare il record Firestore
            }

            // Elimina record da Firestore
            await db.collection('documenti').doc(documentoId).delete();

            UI.hideLoading();
            UI.showSuccess('Documento eliminato con successo');

        } catch (error) {
            UI.hideLoading();
            console.error('Errore eliminazione documento:', error);
            throw error;
        }
    },

    /**
     * Genera URL download temporaneo
     */
    async getDownloadUrl(storagePath) {
        try {
            const storageRef = storage.ref();
            const fileRef = storageRef.child(storagePath);
            return await fileRef.getDownloadURL();
        } catch (error) {
            console.error('Errore generazione URL:', error);
            throw error;
        }
    },

    /**
     * Formatta dimensione file in formato leggibile
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    },

    /**
     * Ottieni icona per tipo file
     */
    getFileIcon(mimeType) {
        if (mimeType === 'application/pdf') {
            return 'fas fa-file-pdf';
        } else if (mimeType.startsWith('image/')) {
            return 'fas fa-file-image';
        }
        return 'fas fa-file';
    },

    /**
     * Ottieni colore per tipo file
     */
    getFileColor(mimeType) {
        if (mimeType === 'application/pdf') {
            return '#D32F2F'; // Rosso per PDF
        } else if (mimeType.startsWith('image/')) {
            return '#2E6DA8'; // Blu per immagini
        }
        return '#9B9B9B'; // Grigio default
    }
};

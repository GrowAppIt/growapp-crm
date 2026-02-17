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
     * Upload documento su Firebase Storage
     */
    async uploadDocumento(file, tipo, entitaId, descrizione) {
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
     * Ottieni lista documenti per entità
     */
    async getDocumenti(tipo, entitaId) {
        try {
            const snapshot = await db.collection('documenti')
                .where('tipo', '==', tipo)
                .where('entitaId', '==', entitaId)
                .orderBy('dataCaricamento', 'desc')
                .get();

            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

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

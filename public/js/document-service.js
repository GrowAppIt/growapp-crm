// Document Service - Gestione documenti con Firebase Storage
const DocumentService = {
    // Configurazione
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB

    // Estensioni ammesse. NOTA: la validazione si basa sull'ESTENSIONE, non sul
    // MIME type dichiarato dal browser: per i .p7m (contratti firmati
    // digitalmente) il browser non dichiara nessun tipo, e un controllo sul MIME
    // li rifiuterebbe sempre.
    ALLOWED_EXTENSIONS: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'p7m'],

    // MIME da usare quando il browser non ne dichiara uno (o dichiara il generico
    // octet-stream): serve a scegliere icona e anteprima in modo affidabile.
    MIME_PER_ESTENSIONE: {
        pdf: 'application/pdf',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        p7m: 'application/pkcs7-mime'
    },

    // Categorie documento. Gli id devono restare allineati a CATEGORIE
    // in api/suggerisci-documento.js
    CATEGORIE: [
        { id: 'contratto',   label: 'Contratto',   icon: 'fas fa-file-signature', color: '#145284' },
        { id: 'fattura',     label: 'Fattura',     icon: 'fas fa-euro-sign',      color: '#3CA434' },
        { id: 'certificato', label: 'Certificato', icon: 'fas fa-award',          color: '#0288D1' },
        { id: 'identita',    label: 'Identità',    icon: 'fas fa-id-card',        color: '#D32F2F' },
        { id: 'verbale',     label: 'Verbale',     icon: 'fas fa-gavel',          color: '#4A4A4A' },
        { id: 'altro',       label: 'Altro',       icon: 'fas fa-folder',         color: '#9B9B9B' }
    ],

    /**
     * Estensione (minuscola) di un nome file
     */
    estensioneDi(nomeFile) {
        const parti = String(nomeFile || '').split('.');
        return parti.length > 1 ? parti.pop().toLowerCase() : '';
    },

    /**
     * MIME affidabile di un file: quello del browser se c'è, altrimenti quello
     * dedotto dall'estensione.
     */
    mimeEffettivo(file) {
        const dichiarato = (file.type || '').toLowerCase();
        const daEstensione = this.MIME_PER_ESTENSIONE[this.estensioneDi(file.name)];
        if (!dichiarato || dichiarato === 'application/octet-stream') {
            return daEstensione || 'application/octet-stream';
        }
        return dichiarato;
    },

    /**
     * Categoria: oggetto completo, con ricaduta su "Altro"
     */
    getCategoria(categoriaId) {
        const trovata = this.CATEGORIE.find(c => c.id === categoriaId);
        return trovata || this.CATEGORIE[this.CATEGORIE.length - 1];
    },

    /**
     * Valida un file prima dell'upload
     */
    validateFile(file) {
        const errors = [];

        // Verifica dimensione
        if (file.size > this.MAX_FILE_SIZE) {
            errors.push(`Il file supera la dimensione massima di 10MB (attuale: ${(file.size / 1024 / 1024).toFixed(2)}MB)`);
        }

        // Verifica estensione
        const extension = this.estensioneDi(file.name);
        if (!this.ALLOWED_EXTENSIONS.includes(extension)) {
            errors.push('Tipo file non supportato. Sono ammessi PDF, immagini (JPG, PNG, WEBP), Word, Excel e file firmati digitalmente (.p7m)');
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
    async uploadDocumento(file, tipo, entitaId, descrizione, dataDocumento, categoria, opzioni) {
        try {
            const silenzioso = !!(opzioni && opzioni.silenzioso);

            // Valida file
            const validation = this.validateFile(file);
            if (!validation.valid) {
                throw new Error(validation.errors.join('\n'));
            }

            // Valida descrizione
            if (!descrizione || descrizione.trim().length === 0) {
                throw new Error('La descrizione è obbligatoria');
            }

            if (!silenzioso) UI.showLoading('Upload documento in corso...');

            // Genera nome file unico
            const timestamp = Date.now();
            const extension = this.estensioneDi(file.name);
            const mimeType = this.mimeEffettivo(file);
            const nomeFileStorage = `${timestamp}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

            // Path storage basato su tipo entità
            const storagePath = `documenti/${tipo}/${entitaId}/${nomeFileStorage}`;

            // Upload su Firebase Storage
            const storageRef = storage.ref();
            const fileRef = storageRef.child(storagePath);

            const uploadTask = await fileRef.put(file, {
                contentType: mimeType,
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
                mimeType: mimeType,
                dimensione: file.size,
                descrizione: descrizione.trim(),
                categoria: this.getCategoria(categoria).id,
                storagePath: storagePath,
                downloadUrl: downloadUrl,
                caricatoDa: AuthService.getUserId(),
                caricatoDaNome: AuthService.getUserName(),
                // Data del documento: se non indicata vale quella di caricamento
                dataDocumento: this.normalizzaData(dataDocumento) || this.oggiISO(),
                dataCaricamento: new Date().toISOString()
            };

            const docRef = await db.collection('documenti').add(docData);

            if (!silenzioso) {
                UI.hideLoading();
                UI.showSuccess('Documento caricato con successo!');
            }

            return {
                id: docRef.id,
                ...docData
            };

        } catch (error) {
            if (!(opzioni && opzioni.silenzioso)) UI.hideLoading();
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

            if (dati.categoria) {
                updateData.categoria = this.getCategoria(dati.categoria).id;
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
     * Il file è un documento Word / Excel / firmato digitalmente?
     */
    isWord(mimeType) {
        return !!mimeType && (mimeType === 'application/msword' || mimeType.indexOf('wordprocessingml') !== -1);
    },

    isExcel(mimeType) {
        return !!mimeType && (mimeType === 'application/vnd.ms-excel' || mimeType.indexOf('spreadsheetml') !== -1);
    },

    isFirmato(mimeType) {
        return !!mimeType && mimeType.indexOf('pkcs7') !== -1;
    },

    /**
     * Ottieni icona per tipo file
     */
    getFileIcon(mimeType) {
        if (this.isPdf(mimeType)) {
            return 'fas fa-file-pdf';
        } else if (this.isImmagine(mimeType)) {
            return 'fas fa-file-image';
        } else if (this.isWord(mimeType)) {
            return 'fas fa-file-word';
        } else if (this.isExcel(mimeType)) {
            return 'fas fa-file-excel';
        } else if (this.isFirmato(mimeType)) {
            return 'fas fa-file-shield';
        }
        return 'fas fa-file';
    },

    /**
     * Ottieni colore per tipo file
     */
    getFileColor(mimeType) {
        if (this.isPdf(mimeType)) {
            return '#D32F2F'; // Rosso per PDF
        } else if (this.isImmagine(mimeType)) {
            return '#2E6DA8'; // Blu per immagini
        } else if (this.isWord(mimeType)) {
            return '#145284'; // Blu brand per Word
        } else if (this.isExcel(mimeType)) {
            return '#3CA434'; // Verde per Excel
        } else if (this.isFirmato(mimeType)) {
            return '#0288D1'; // Azzurro per i firmati digitalmente
        }
        return '#9B9B9B'; // Grigio default
    },

    /**
     * L'AI può leggere questo file? (solo PDF e immagini)
     */
    aiPuoLeggere(mimeType) {
        return this.isPdf(mimeType) || this.isImmagine(mimeType);
    },

    // Oltre questa dimensione il file non entra nel corpo della richiesta verso
    // la funzione serverless (limite Vercel ~4.5MB, il base64 gonfia del ~33%).
    MAX_AI_FILE_SIZE: 2.5 * 1024 * 1024,

    /**
     * Chiede a Claude di proporre descrizione, categoria e data leggendo il file.
     *
     * PRIVACY: invia il documento alle API di Anthropic. Va chiamata SOLO su
     * azione esplicita dell'utente, mai in automatico durante il caricamento.
     */
    async suggerisciDati(file) {
        const mimeType = this.mimeEffettivo(file);

        if (!this.aiPuoLeggere(mimeType)) {
            throw new Error('Il suggerimento automatico funziona solo su PDF e immagini.');
        }

        // Le immagini le rimpiccioliamo prima di spedirle: restano leggibili e
        // il corpo della richiesta resta piccolo.
        let daInviare = file;
        if (this.isImmagine(mimeType) && file.size > 400 * 1024) {
            try {
                daInviare = await this.rimpicciolisciImmagine(file);
            } catch (e) {
                console.warn('Ridimensionamento immagine non riuscito, invio originale:', e);
            }
        }

        if (daInviare.size > this.MAX_AI_FILE_SIZE) {
            throw new Error('Documento troppo pesante per il suggerimento automatico: compila i campi a mano.');
        }

        const base64 = await this.fileToBase64(daInviare);
        const token = await firebase.auth().currentUser.getIdToken();

        const risposta = await fetch('/api/suggerisci-documento', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({
                nomeFile: file.name,
                mimeType: this.isImmagine(mimeType) ? (daInviare.type || mimeType) : mimeType,
                data: base64
            })
        });

        const dati = await risposta.json().catch(() => ({}));
        if (!risposta.ok) {
            throw new Error(dati.error || 'Errore durante l\'analisi del documento.');
        }
        return dati;
    },

    /**
     * Legge un file e ne restituisce il base64 puro (senza il prefisso data:)
     */
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const risultato = String(reader.result || '');
                const virgola = risultato.indexOf(',');
                resolve(virgola === -1 ? risultato : risultato.slice(virgola + 1));
            };
            reader.onerror = () => reject(new Error('Impossibile leggere il file'));
            reader.readAsDataURL(file);
        });
    },

    /**
     * Ridimensiona un'immagine a max 1600px di lato lungo, in JPEG.
     * Serve solo per l'invio all'AI: il file originale viene caricato intatto.
     */
    rimpicciolisciImmagine(file, latoMax = 1600) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                const scala = Math.min(1, latoMax / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scala);
                canvas.height = Math.round(img.height * scala);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(blob => {
                    if (blob) resolve(new File([blob], file.name, { type: 'image/jpeg' }));
                    else reject(new Error('Conversione immagine non riuscita'));
                }, 'image/jpeg', 0.85);
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Immagine non leggibile'));
            };
            img.src = url;
        });
    }
};

// Authentication Module
const AuthService = {
    currentUser: null,
    currentUserData: null,

    // Definizione Ruoli e Permessi
    ROLES: {
        SUPER_ADMIN: 'SUPER_ADMIN',
        ADMIN: 'ADMIN',
        CTO: 'CTO',
        SVILUPPATORE: 'SVILUPPATORE',
        AGENTE: 'AGENTE',
        CONTENT_MANAGER: 'CONTENT_MANAGER',
        CONTABILE: 'CONTABILE'
    },

    ROLE_LABELS: {
        SUPER_ADMIN: 'Super Amministratore',
        ADMIN: 'Amministratore di Sistema',
        CTO: 'CTO (Chief Technology Officer)',
        SVILUPPATORE: 'Sviluppatore',
        AGENTE: 'Agente Commerciale',
        CONTENT_MANAGER: 'Gestore Contenuti',
        CONTABILE: 'Addetto Amministrativo/Contabile'
    },

    // Mappa Ruoli -> Permessi
    ROLE_PERMISSIONS: {
        SUPER_ADMIN: ['*'], // Tutti i permessi
        ADMIN: [
            'view_all_data', 'manage_users', 'manage_clients', 'manage_contracts',
            'manage_apps', 'manage_invoices', 'manage_payments', 'view_reports',
            'export_data', 'manage_settings', 'view_audit',
            'view_dev_tasks', 'manage_dev_tasks', // ✅ Aggiunto accesso TASK
            'view_company_info' // ✅ Può vedere card Growapp (ma non modificare)
        ],
        CTO: [
            'view_all_data', 'manage_apps', 'manage_dev_tasks', 'view_dev_tasks',
            'manage_app_content', 'view_reports', 'manage_clients', 'manage_contracts',
            'view_company_info', 'manage_business_card' // ✅ Può vedere Growapp + modificare biglietto
        ],
        SVILUPPATORE: [
            'view_dev_tasks', 'manage_dev_tasks', 'manage_app_content', 'view_apps',
            'view_clients', // ✅ Aggiunto accesso CLIENTI
            'view_company_info', 'manage_business_card' // ✅ Impostazioni base
        ],
        AGENTE: [
            'view_own_data', 'view_clients', 'view_contracts', 'view_apps',
            'view_invoices', 'manage_clients', 'manage_contracts',
            'view_dev_tasks', 'manage_dev_tasks', // ✅ TASK: visualizzazione + creazione
            'view_company_info', 'manage_business_card' // ✅ Impostazioni base
        ],
        CONTENT_MANAGER: [
            'view_all_data', 'manage_app_content', 'view_apps', 'manage_apps',
            'view_clients', // ✅ Aggiunto CLIENTI
            'view_dev_tasks', 'manage_dev_tasks', // ✅ Aggiunto TASK
            'view_company_info', 'manage_business_card' // ✅ Impostazioni base
        ],
        CONTABILE: [
            'view_all_data', 'manage_invoices', 'manage_payments', 'view_reports',
            'export_data', 'view_clients', 'view_contracts',
            'view_apps', // ✅ Aggiunto APP
            'view_dev_tasks', 'manage_dev_tasks', // ✅ Aggiunto TASK + creazione task
            'view_company_info', 'manage_business_card' // ✅ Impostazioni base
        ]
    },

    async login(email, password) {
        try {
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            this.currentUser = userCredential.user;

            // Carica dati utente da Firestore
            const userDoc = await db.collection('utenti').doc(this.currentUser.uid).get();
            if (userDoc.exists) {
                this.currentUserData = userDoc.data();
            } else {
                throw new Error('Profilo utente non trovato');
            }

            // Verifica che l'utente sia attivo
            if (this.currentUserData.stato === 'DISATTIVO') {
                await auth.signOut();
                throw new Error('Account disattivato. Contatta l\'amministratore.');
            }

            // Aggiorna ultimo login
            await db.collection('utenti').doc(this.currentUser.uid).update({
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });

            return { success: true, user: this.currentUser };
        } catch (error) {
            console.error('Errore login:', error);
            return { success: false, error: error.message };
        }
    },

    async logout() {
        try {
            await auth.signOut();
            this.currentUser = null;
            this.currentUserData = null;
            return { success: true };
        } catch (error) {
            console.error('Errore logout:', error);
            return { success: false, error: error.message };
        }
    },

    isAuthenticated() {
        return this.currentUser !== null;
    },

    getUserRole() {
        return this.currentUserData?.ruolo || null;
    },

    getUserRoleLabel() {
        const role = this.getUserRole();
        return this.ROLE_LABELS[role] || role;
    },

    getUserId() {
        return this.currentUser?.uid || null;
    },

    getUserName() {
        if (this.currentUserData) {
            return `${this.currentUserData.nome} ${this.currentUserData.cognome}`;
        }
        return this.currentUser?.email || 'Utente';
    },

    getUserEmail() {
        return this.currentUser?.email || null;
    },

    getCurrentUserData() {
        return this.currentUserData || null;
    },

    // Restituisce utente corrente con uid incluso
    getUtenteCorrente() {
        if (!this.currentUserData || !this.currentUser) return null;
        return {
            uid: this.currentUser.uid,
            nome: this.currentUserData.nome || '',
            cognome: this.currentUserData.cognome || '',
            email: this.currentUser.email,
            ruolo: this.currentUserData.ruolo
        };
    },

    // Verifica permesso singolo
    hasPermission(permission) {
        if (!this.currentUserData) {
            console.error('❌ hasPermission: currentUserData è null!', {
                currentUser: this.currentUser,
                permission: permission
            });
            return false;
        }

        const role = this.getUserRole();
        const rolePermissions = this.ROLE_PERMISSIONS[role] || [];

        // Super admin ha tutti i permessi
        if (rolePermissions.includes('*')) return true;

        // Verifica permesso specifico
        return rolePermissions.includes(permission);
    },

    // Verifica se può vedere tutti i dati o solo i propri
    canViewAllData() {
        return this.hasPermission('view_all_data') || this.hasPermission('*');
    },

    // Verifica se può vedere solo i propri dati
    canViewOnlyOwnData() {
        return this.hasPermission('view_own_data') && !this.canViewAllData();
    },

    // Helper per ruoli specifici
    isSuperAdmin() {
        return this.getUserRole() === this.ROLES.SUPER_ADMIN;
    },

    isAdmin() {
        return [this.ROLES.SUPER_ADMIN, this.ROLES.ADMIN].includes(this.getUserRole());
    },

    isCTO() {
        return [this.ROLES.SUPER_ADMIN, this.ROLES.ADMIN, this.ROLES.CTO].includes(this.getUserRole());
    },

    isSviluppatore() {
        return [this.ROLES.SUPER_ADMIN, this.ROLES.ADMIN, this.ROLES.CTO, this.ROLES.SVILUPPATORE].includes(this.getUserRole());
    },

    isAgente() {
        return this.getUserRole() === this.ROLES.AGENTE;
    },

    // Ritorna il nome dell'agente per filtrare i dati (campo 'agente' nei clienti)
    getAgenteFilterName() {
        if (!this.currentUserData) return null;
        const nome = this.currentUserData.nome || '';
        const cognome = this.currentUserData.cognome || '';
        return `${nome} ${cognome}`.trim() || null;
    },

    isContentManager() {
        return [this.ROLES.SUPER_ADMIN, this.ROLES.ADMIN, this.ROLES.CONTENT_MANAGER].includes(this.getUserRole());
    },

    isContabile() {
        return [this.ROLES.SUPER_ADMIN, this.ROLES.ADMIN, this.ROLES.CONTABILE].includes(this.getUserRole());
    },

    /**
     * Verifica se l'utente è admin/CTO MA ha anche il flag ancheAgente
     * (es. Super Admin che gestisce anche clienti come agente)
     */
    isAncheAgente() {
        if (!this.currentUserData) return false;
        // Ha il flag ancheAgente e NON è un agente puro (è admin, CTO, ecc.)
        return this.currentUserData.ancheAgente === true && this.getUserRole() !== this.ROLES.AGENTE;
    },

    // Verifica accesso a una pagina
    canAccessPage(pageName) {
        const pagePermissions = {
            'dashboard': ['*', 'view_all_data', 'view_own_data'],
            'clienti': ['*', 'view_all_data', 'manage_clients', 'view_clients', 'view_own_data'],
            'dettaglio-cliente': ['*', 'view_all_data', 'manage_clients', 'view_clients', 'view_own_data'],
            'app': ['*', 'view_all_data', 'manage_apps', 'view_apps', 'manage_app_content', 'view_own_data'],
            'gestione-app': ['*', 'view_all_data', 'manage_apps', 'view_apps', 'manage_app_content', 'view_own_data'],
            'dettaglio-app': ['*', 'view_all_data', 'manage_apps', 'view_apps', 'manage_app_content', 'view_own_data'],
            'task': ['*', 'view_all_data', 'manage_dev_tasks', 'view_dev_tasks', 'view_own_data'],
            'contratti': ['*', 'view_all_data', 'manage_contracts', 'view_contracts', 'view_own_data'],
            'dettaglio-contratto': ['*', 'view_all_data', 'manage_contracts', 'view_contracts', 'view_own_data'],
            'fatture': ['*', 'view_all_data', 'manage_invoices', 'view_invoices', 'view_own_data'],
            'dettaglio-fattura': ['*', 'view_all_data', 'manage_invoices', 'view_invoices', 'view_own_data'],
            'scadenzario': ['*', 'view_all_data', 'manage_payments', 'view_own_data'],
            'dettaglio-scadenza': ['*', 'view_all_data', 'manage_payments', 'view_own_data'],
            'mappa': ['*', 'view_all_data', 'view_own_data', 'view_clients', 'manage_clients', 'view_apps', 'view_dev_tasks', 'manage_dev_tasks', 'view_company_info'],
            'promemoria': ['*', 'view_all_data', 'view_own_data', 'view_clients', 'manage_clients', 'view_apps', 'view_dev_tasks', 'manage_dev_tasks', 'view_company_info'],
            'report': ['*', 'view_reports', 'view_all_data'],
            'impostazioni': ['*', 'manage_settings', 'manage_users', 'view_company_info', 'manage_business_card'] // ✅ Tutti possono vedere Impostazioni (almeno le card base)
        };

        const requiredPermissions = pagePermissions[pageName] || [];
        const hasAccess = requiredPermissions.length === 0 || requiredPermissions.some(perm => this.hasPermission(perm));

        return hasAccess;
    },

    // 🏠 Ottiene la prima pagina accessibile per l'utente corrente (per redirect al login)
    getFirstAccessiblePage() {
        // Ordine di preferenza delle pagine
        const pageOrder = ['dashboard', 'task', 'app', 'clienti', 'contratti', 'fatture', 'scadenzario', 'report', 'impostazioni'];

        for (const page of pageOrder) {
            if (this.canAccessPage(page)) {
                return page;
            }
        }

        // Fallback: se non ha accesso a nulla (non dovrebbe mai succedere)
        return 'dashboard';
    },

    // Observer per stato autenticazione
    onAuthStateChanged(callback) {
        return auth.onAuthStateChanged(async (user) => {
            if (user) {
                this.currentUser = user;
                const userDoc = await db.collection('utenti').doc(user.uid).get();
                if (userDoc.exists) {
                    this.currentUserData = userDoc.data();
                }
            } else {
                this.currentUser = null;
                this.currentUserData = null;
            }
            callback(user);
        });
    }
};

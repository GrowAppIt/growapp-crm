# 🏛️ CRM Comune.Digital

Sistema di gestione completo per amministrare clienti, contratti, app e fatture dei Comuni.

**Sviluppato da:** Growapp S.r.l.
**Tecnologie:** HTML5, CSS3, JavaScript, Firebase (Auth + Firestore)

---

## ⚠️ IMPORTANTE: Sicurezza e Dati Sensibili

**PRIMA di caricare su GitHub**, leggi attentamente:

📖 **[SECURITY_SETUP.md](./SECURITY_SETUP.md)** - Guida completa alla protezione delle chiavi Firebase

### Quick Start Sicurezza

```bash
# 1. Copia i template
cp js/env.example.js js/env.js
cp .env.example .env

# 2. Modifica js/env.js e inserisci le TUE credenziali Firebase

# 3. Verifica che .gitignore escluda i file sensibili
git status  # js/env.js e .env NON devono apparire in verde
```

**❌ NON committare MAI:**
- `js/env.js` (contiene chiavi Firebase)
- `.env` (contiene chiavi Firebase)

**✅ Committi solo:**
- `js/env.example.js` (template)
- `.env.example` (template)

---

## 🚀 Caratteristiche Principali

### 📊 Dashboard
- KPI in tempo reale (clienti, fatturato, scadenze)
- Grafici interattivi (fatturato mensile, clienti attivi)
- Quick actions per azioni rapide

### 📅 Scadenzario
- Vista calendar delle scadenze contrattuali
- Notifiche automatiche (30/15/7/1 giorni prima)
- Filtri per stato e tipo scadenza
- Sistema di alert configurabile

### 👥 Gestione Clienti
- Anagrafica completa (comune, P.IVA, contatti)
- Storico completo (contratti, fatture, app)
- Gestione documenti e note
- Caricamento stemma/logo comune

### 📱 Gestione App
- Creazione e tracciamento app per comune
- Assegnazione agente/task
- Gestione stati (In attesa, In lavorazione, Completata, Consegnata)
- Storico modifiche e note operative
- Gestione agenti personalizzati

### 📄 Contratti
- Creazione contratti personalizzabili
- Collegamento a clienti e app
- Tracking rinnovi e scadenze
- Gestione moduli e tipologie
- Calendario scadenze integrato

### 💶 Fatturazione
- Emissione e gestione fatture
- Collegamento a contratti
- Esportazione Excel
- Stati pagamento (Emessa, Pagata, Scaduta, Annullata)
- Report fatturato

### 📈 Report & Analytics
- Fatturato per periodo
- Clienti per provincia/regione
- Performance agenti
- App per stato
- Esportazione dati Excel

### ⚙️ Impostazioni
- Gestione utenti e ruoli (Admin, Manager, Agent, Viewer)
- Configurazione agenti
- Gestione task personalizzabili
- Impostazioni generali
- Backup e ripristino dati

---

## 🔧 Tecnologie Utilizzate

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Firebase
  - Authentication (gestione utenti)
  - Firestore (database NoSQL)
- **Librerie**:
  - Chart.js (grafici)
  - SheetJS (export Excel)
  - Font Awesome (icone)
  - Titillium Web (font)

---

## 📦 Installazione e Deploy

### Opzione 1: Deploy Vercel (Consigliato)

Segui la guida completa: **[GITHUB_SETUP.md](./GITHUB_SETUP.md)**

```bash
# 1. Setup sicurezza
cp js/env.example.js js/env.js
# Modifica js/env.js con le tue credenziali

# 2. Inizializza Git
git init
git add .
git commit -m "Initial commit"

# 3. Carica su GitHub
git remote add origin https://github.com/TUO-USERNAME/crm-comune-digital.git
git push -u origin main

# 4. Connetti Vercel a GitHub (deploy automatico!)
```

### Opzione 2: Server Tradizionale

```bash
# Upload via FTP/SFTP
# Carica tutti i file nella root del dominio
# Assicurati di caricare anche js/env.js con le credenziali

# Requisiti server:
- Web server (Apache/Nginx)
- HTTPS obbligatorio
- NO PHP, NO database locale
```

---

## 🔐 Configurazione Firebase

### 1. Crea Progetto Firebase

1. Vai su [Firebase Console](https://console.firebase.google.com)
2. Crea nuovo progetto: `crm-comune-digital`
3. Abilita Google Analytics (opzionale)

### 2. Configura Authentication

1. Authentication → Sign-in method
2. Abilita: **Email/Password**
3. Aggiungi utenti autorizzati

### 3. Configura Firestore Database

1. Firestore Database → Crea database
2. Modalità: **Produzione**
3. Location: `europe-west` (o più vicino)

### 4. Imposta Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 5. Ottieni Credenziali

1. Impostazioni progetto (⚙️)
2. Le tue app → Web app → Config
3. Copia i valori in `js/env.js`

### 6. Autorizza Dominio

1. Authentication → Settings → Authorized domains
2. Aggiungi il tuo dominio: `tuo-sito.vercel.app`

---

## 🎯 Primo Accesso

### 1. Crea Primo Utente (Console Firebase)

```
Email: admin@tuodominio.it
Password: [password sicura]
```

### 2. Aggiungi Ruolo Admin (Firestore)

Collezione: `users`
Documento ID: `[UID utente]`

```json
{
  "email": "admin@tuodominio.it",
  "role": "admin",
  "displayName": "Amministratore",
  "createdAt": [timestamp],
  "active": true
}
```

### 3. Login Applicazione

Vai su: `https://tuo-dominio.com`
Login con le credenziali create

---

## 👥 Ruoli e Permessi

| Ruolo | Permessi |
|-------|----------|
| **Admin** | Accesso completo, gestione utenti, impostazioni |
| **Manager** | Gestione clienti, contratti, fatture, report |
| **Agent** | Gestione app e task assegnati |
| **Viewer** | Sola lettura, visualizzazione dati |

---

## 📁 Struttura Progetto

```
crm-comune-digital/
├── index.html              # Entry point
├── css/
│   └── styles.css         # Stili principali
├── js/
│   ├── env.js             # ⚠️ Config Firebase (NON committare!)
│   ├── env.example.js     # Template configurazione
│   ├── firebase-config.js # Inizializzazione Firebase
│   ├── auth.js            # Autenticazione
│   ├── data-service.js    # CRUD operations
│   ├── ui.js              # UI utilities
│   ├── forms.js           # Form handling
│   ├── export.js          # Export Excel
│   └── pages/             # Page modules
│       ├── dashboard.js
│       ├── clienti.js
│       ├── app.js
│       ├── contratti.js
│       ├── fatture.js
│       └── ...
├── img/                   # Assets
├── scripts/
│   └── generate-env.js    # Build script per Vercel
├── .env                   # ⚠️ Variabili locali (NON committare!)
├── .env.example           # Template variabili
├── .gitignore             # File da escludere
├── package.json           # NPM config
├── vercel.json            # Vercel config
├── README.md              # Questa guida
├── SECURITY_SETUP.md      # Guida sicurezza
└── GITHUB_SETUP.md        # Guida deploy
```

---

## 🐛 Troubleshooting

### Errore: "Firebase not configured"

```bash
# Verifica che js/env.js esista e contenga valori validi
cat js/env.js

# Se mancante, copia dal template
cp js/env.example.js js/env.js
# Modifica e inserisci credenziali Firebase
```

### Errore: "Permission denied" su Firestore

1. Verifica Security Rules in Firebase Console
2. Controlla che l'utente sia autenticato
3. Verifica ruolo utente in collezione `users`

### Login non funziona

1. Verifica email/password corretti
2. Controlla che Authentication sia abilitato
3. Verifica dominio in "Authorized domains"

### Deploy Vercel: "env.js not found"

1. Configura Environment Variables su Vercel
2. Verifica che lo script `generate-env.js` funzioni
3. Controlla build logs su Vercel

---

## 📞 Supporto

**Email:** [supporto@growapp.it](mailto:supporto@growapp.it)
**Sviluppato da:** Growapp S.r.l.

---

## 📄 Licenza

Questo software è proprietario di **Growapp S.r.l.**
Tutti i diritti riservati. Uso non autorizzato vietato.

---

## 🔄 Aggiornamenti

### Versione 1.0.0 (Attuale)
- ✅ Sistema completo CRM
- ✅ Gestione clienti, app, contratti, fatture
- ✅ Scadenzario automatizzato
- ✅ Report e analytics
- ✅ Multi-utente con ruoli
- ✅ Export Excel
- ✅ Responsive design
- ✅ Sicurezza chiavi Firebase

---

**🚀 Pronto per il deploy!**

Segui [SECURITY_SETUP.md](./SECURITY_SETUP.md) per la configurazione sicura delle credenziali.

// Firebase Configuration
// Le credenziali vengono caricate da env.js (non committato su Git)

// Verifica che le variabili d'ambiente siano caricate
if (!window.ENV) {
    console.error('❌ ERRORE: File env.js non trovato o non caricato!');
    console.error('📋 Segui questi passaggi:');
    console.error('1. Copia js/env.example.js come js/env.js');
    console.error('2. Inserisci le tue credenziali Firebase in js/env.js');
    console.error('3. Ricarica la pagina');
    throw new Error('Configurazione Firebase mancante. Verifica che env.js sia presente e caricato.');
}

const firebaseConfig = {
    apiKey: window.ENV.FIREBASE_API_KEY,
    authDomain: window.ENV.FIREBASE_AUTH_DOMAIN,
    projectId: window.ENV.FIREBASE_PROJECT_ID,
    storageBucket: window.ENV.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: window.ENV.FIREBASE_MESSAGING_SENDER_ID,
    appId: window.ENV.FIREBASE_APP_ID
};

// Verifica che tutte le chiavi siano presenti
const missingKeys = Object.entries(firebaseConfig)
    .filter(([key, value]) => !value || value.includes('your-'))
    .map(([key]) => key);

if (missingKeys.length > 0) {
    console.error('❌ ERRORE: Configurazione Firebase incompleta!');
    console.error('🔑 Chiavi mancanti o non configurate:', missingKeys);
    console.error('📋 Modifica js/env.js e inserisci i valori corretti da Firebase Console');
    throw new Error('Configurazione Firebase incompleta');
}

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Configura persistenza locale
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

// Esponi su window per accesso da iframe (Monitor RSS)
window.db = db;
window.auth = auth;
window.storage = storage;
window.firebase = firebase;

console.log('✅ Firebase inizializzato correttamente');

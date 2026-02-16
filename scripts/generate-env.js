#!/usr/bin/env node

/**
 * Script di Build per Vercel
 * Genera js/env.js dalle Environment Variables di Vercel
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Generazione env.js da Vercel Environment Variables...');

// Verifica che tutte le variabili siano presenti
const requiredVars = [
    'FIREBASE_API_KEY',
    'FIREBASE_AUTH_DOMAIN',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_STORAGE_BUCKET',
    'FIREBASE_MESSAGING_SENDER_ID',
    'FIREBASE_APP_ID'
];

const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error('❌ ERRORE: Variabili d\'ambiente mancanti in Vercel:');
    missingVars.forEach(varName => {
        console.error(`   - ${varName}`);
    });
    console.error('\n📋 Configura le variabili su: Vercel Dashboard → Settings → Environment Variables');
    process.exit(1);
}

// Genera il contenuto del file env.js
const envContent = `// 🤖 GENERATO AUTOMATICAMENTE DA VERCEL BUILD
// NON modificare manualmente questo file

window.ENV = {
    FIREBASE_API_KEY: "${process.env.FIREBASE_API_KEY}",
    FIREBASE_AUTH_DOMAIN: "${process.env.FIREBASE_AUTH_DOMAIN}",
    FIREBASE_PROJECT_ID: "${process.env.FIREBASE_PROJECT_ID}",
    FIREBASE_STORAGE_BUCKET: "${process.env.FIREBASE_STORAGE_BUCKET}",
    FIREBASE_MESSAGING_SENDER_ID: "${process.env.FIREBASE_MESSAGING_SENDER_ID}",
    FIREBASE_APP_ID: "${process.env.FIREBASE_APP_ID}"
};

console.log('✅ Configurazione Firebase caricata da Vercel Environment Variables');
`;

// Percorso del file di output
const outputPath = path.join(__dirname, '..', 'js', 'env.js');

// Scrivi il file
try {
    fs.writeFileSync(outputPath, envContent, 'utf8');
    console.log('✅ env.js generato con successo');
    console.log(`📁 Percorso: ${outputPath}`);
    console.log('\n🚀 Build completato! Firebase configurato correttamente.');
} catch (error) {
    console.error('❌ ERRORE durante la scrittura di env.js:', error.message);
    process.exit(1);
}

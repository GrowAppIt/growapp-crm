#!/usr/bin/env node

/**
 * Script di Build per Vercel
 * Genera public/js/env.js dalle Environment Variables di Vercel
 */

const fs = require('fs');
const path = require('path');

// Leggi la versione dal package.json
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const APP_VERSION = pkg.version || '1.0.0';

console.log(`🔧 Generazione env.js (v${APP_VERSION}) da Vercel Environment Variables...`);

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

window.CRM_APP_VERSION = "${APP_VERSION}";

console.log('✅ Configurazione Firebase caricata da Vercel Environment Variables (v${APP_VERSION})');
`;

// Percorso del file di output (ora in public/js/)
const outputPath = path.join(__dirname, '..', 'public', 'js', 'env.js');

// Scrivi il file env.js
try {
    fs.writeFileSync(outputPath, envContent, 'utf8');
    console.log('✅ public/js/env.js generato con successo');
    console.log(`📁 Percorso: ${outputPath}`);
} catch (error) {
    console.error('❌ ERRORE durante la scrittura di env.js:', error.message);
    process.exit(1);
}

// ============================================================
// VERSIONING AUTOMATICO — Aggiorna index.html con la versione
// dal package.json, così non serve cambiare a mano.
// ============================================================
const indexPath = path.join(__dirname, '..', 'public', 'index.html');

try {
    let indexHtml = fs.readFileSync(indexPath, 'utf8');

    // Trova la versione attuale nell'index.html (cerca il pattern APP_VERSION = 'x.y.z')
    const versionMatch = indexHtml.match(/var APP_VERSION\s*=\s*'([^']+)'/);
    const currentVersion = versionMatch ? versionMatch[1] : null;

    if (currentVersion && currentVersion !== APP_VERSION) {
        console.log(`\n🔄 Aggiornamento versione in index.html: ${currentVersion} → ${APP_VERSION}`);

        // 1. Aggiorna APP_VERSION nello script inline
        indexHtml = indexHtml.replace(
            /var APP_VERSION\s*=\s*'[^']+'/,
            `var APP_VERSION = '${APP_VERSION}'`
        );

        // 2. Aggiorna tutti i ?v=x.y.z per cache busting (script e css)
        indexHtml = indexHtml.replace(
            /\?v=[\d]+\.[\d]+\.[\d]+/g,
            `?v=${APP_VERSION}`
        );

        fs.writeFileSync(indexPath, indexHtml, 'utf8');
        console.log(`✅ index.html aggiornato alla versione ${APP_VERSION}`);
        console.log(`   - APP_VERSION inline aggiornata`);
        console.log(`   - Cache busting (?v=) aggiornato su tutti gli script`);
    } else if (currentVersion === APP_VERSION) {
        console.log(`\nℹ️  index.html già alla versione ${APP_VERSION}, nessun aggiornamento necessario`);
    } else {
        console.warn('⚠️  Non ho trovato APP_VERSION in index.html — versioning non aggiornato');
    }
} catch (error) {
    console.error('⚠️  Errore durante l\'aggiornamento di index.html:', error.message);
    console.error('   Il build env.js è riuscito, ma il versioning non è stato aggiornato.');
}

console.log('\n🚀 Build completato! Firebase configurato correttamente.');

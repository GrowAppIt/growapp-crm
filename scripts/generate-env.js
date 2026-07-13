#!/usr/bin/env node

/**
 * Script di Build per Vercel
 * Genera public/js/env.js dalle Environment Variables di Vercel
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

    // 1. Aggiorna SEMPRE APP_VERSION nello script inline con la versione del package
    if (currentVersion !== APP_VERSION) {
        indexHtml = indexHtml.replace(
            /var APP_VERSION\s*=\s*'[^']+'/,
            `var APP_VERSION = '${APP_VERSION}'`
        );
    }

    // 2. Cache busting per-file basato sul CONTENUTO (hash), non sulla versione.
    //    PROBLEMA RISOLTO: prima i ?v= venivano riscritti solo se cambiava la
    //    versione in package.json. Se si deployava JS modificato SENZA bumpare la
    //    versione, l'URL restava identico e con Cache-Control immutable=1anno i
    //    browser servivano per un anno il file VECCHIO → bug "a volte va a volte no",
    //    configuratore che non si aggiornava su alcune postazioni.
    //    Ora, ad OGNI build, per ogni <script src>/<link href> che punta a un file
    //    locale js/css, calcoliamo un hash del contenuto e lo mettiamo in ?v=.
    //    Stesso contenuto → stesso hash (nessun download inutile); contenuto
    //    cambiato → hash nuovo → i client riscaricano subito. Indipendente dal bump.
    const publicDir = path.join(__dirname, '..', 'public');
    const hashCache = {};
    function assetHash(relPath) {
        if (hashCache[relPath] !== undefined) return hashCache[relPath];
        let h = null;
        try {
            const buf = fs.readFileSync(path.join(publicDir, relPath));
            h = crypto.createHash('md5').update(buf).digest('hex').slice(0, 10);
        } catch (e) {
            h = null; // file non trovato (es. env.js non ancora generato in altri contesti): lascia com'è
        }
        hashCache[relPath] = h;
        return h;
    }

    let bustCount = 0;
    // Match: src="js/....js" o href="css/....css", con o senza ?v=... già presente.
    indexHtml = indexHtml.replace(
        /((?:src|href)=")((?:js|css)\/[^"?]+\.(?:js|css))(\?v=[^"]*)?(")/g,
        (full, pre, relPath, oldQ, post) => {
            const h = assetHash(relPath);
            if (!h) return full; // file non trovato: non toccare
            bustCount++;
            return `${pre}${relPath}?v=${h}${post}`;
        }
    );

    fs.writeFileSync(indexPath, indexHtml, 'utf8');
    console.log(`✅ index.html aggiornato: APP_VERSION=${APP_VERSION}, cache-busting per-hash su ${bustCount} asset js/css`);
} catch (error) {
    console.error('⚠️  Errore durante l\'aggiornamento di index.html:', error.message);
    console.error('   Il build env.js è riuscito, ma il versioning non è stato aggiornato.');
}

console.log('\n🚀 Build completato! Firebase configurato correttamente.');

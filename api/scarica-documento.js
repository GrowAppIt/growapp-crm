/**
 * Serverless Function — Link di download di un documento archiviato
 *
 * I file su Firebase Storage vengono serviti con "Content-Disposition: inline"
 * e da un dominio diverso dal CRM: il browser ignora l'attributo `download`
 * del link e apre il file in una scheda (o non fa nulla) invece di scaricarlo.
 * Qui generiamo un URL firmato V4, valido pochi minuti, che forza
 * "attachment" con il nome originale del file.
 *
 * Endpoint: POST /api/scarica-documento
 * Body: { documentoId }
 * Response: { url, nomeFile }
 *
 * Accessibile solo a utenti CRM attivi (ID token Firebase valido), come le
 * regole Firestore sulla collezione 'documenti'. Gli allegati dei fornitori
 * restano riservati agli admin, come la pagina che li mostra.
 */

const admin = require('firebase-admin');
if (!admin.apps.length) {
  try {
    const opzioni = {};
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      opzioni.credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      opzioni.credential = admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      });
    }
    admin.initializeApp(opzioni);
  } catch (e) {
    console.error('[scarica-documento] Errore init Firebase Admin:', e.message);
  }
}

// Stesso bucket usato dal client (env.js); il default dell'Admin SDK sarebbe
// il vecchio <progetto>.appspot.com, che qui non esiste.
const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'crm-comunedigital.firebasestorage.app';

// Durata del link firmato: basta per far partire il download.
const DURATA_LINK_MS = 5 * 60 * 1000;

/**
 * Content-Disposition con il nome originale: versione ASCII per i browser
 * vecchi + filename* (RFC 5987) per accenti e caratteri speciali.
 */
function contentDisposition(nomeFile) {
  const ascii = nomeFile.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const utf8 = encodeURIComponent(nomeFile).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

module.exports = async function handler(req, res) {

  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito. Usa POST.' });

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!idToken) {
    return res.status(401).json({ error: 'Non autorizzato: token Firebase mancante.' });
  }

  let uid;
  try {
    uid = (await admin.auth().verifyIdToken(idToken)).uid;
  } catch (e) {
    return res.status(401).json({ error: 'Non autorizzato: token Firebase non valido.' });
  }

  const documentoId = String((req.body || {}).documentoId || '');
  if (!documentoId || documentoId.includes('/')) {
    return res.status(400).json({ error: 'Documento non specificato.' });
  }

  try {
    const db = admin.firestore();

    // Stesso criterio di isActive() nelle regole Firestore: blocca solo chi è DISATTIVO.
    const utente = await db.collection('utenti').doc(uid).get();
    if (!utente.exists || (utente.data().stato || 'ATTIVO') === 'DISATTIVO') {
      return res.status(403).json({ error: 'Utente non abilitato.' });
    }

    const snap = await db.collection('documenti').doc(documentoId).get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'Documento non trovato.' });
    }
    const doc = snap.data();

    if (doc.tipo === 'fornitore' && !['SUPER_ADMIN', 'ADMIN'].includes(utente.data().ruolo)) {
      return res.status(403).json({ error: 'Non hai accesso a questo documento.' });
    }

    if (!doc.storagePath) {
      return res.status(404).json({ error: 'File del documento non disponibile.' });
    }

    const nomeFile = String(doc.nomeOriginale || doc.nomeFile || 'documento').slice(0, 200);
    const [url] = await admin.storage().bucket(BUCKET).file(doc.storagePath).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + DURATA_LINK_MS,
      responseDisposition: contentDisposition(nomeFile)
    });

    return res.status(200).json({ url, nomeFile });

  } catch (e) {
    console.error('[scarica-documento] Errore:', e.message);
    return res.status(500).json({ error: 'Impossibile preparare il download.' });
  }
};

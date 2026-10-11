/**
 * Serverless Function — Rinnovo periodico dei lasciapassare MCP delle app (keep-alive)
 *
 * Perché: il refresh_token di GoodBarber scade dopo ~30 giorni. Un'app che non viene usata
 * per un mese da "Pubblicazioni sulle app" perde il collegamento (successo a Cefalù, ott 2026).
 * Questa funzione, lanciata da Vercel Cron una volta a settimana, rinnova il lasciapassare
 * di tutte le app collegate e salva quello nuovo (lib/mcp-token.js: un'app alla volta, con lucchetto).
 *
 * Non legge né modifica contenuti delle app: fa solo il rinnovo OAuth.
 * Esito per app nel doc `app`: mcpStato ('ok'|'errore'), mcpUltimoRinnovo, mcpUltimoErrore.
 * Riepilogo dell'ultima esecuzione in `sistema/mcpKeepalive`.
 *
 * Endpoint: GET/POST /api/mcp-keepalive
 * Accesso: Vercel Cron, oppure Authorization: Bearer <CRON_SECRET>, oppure un SUPER_ADMIN loggato.
 */

const admin = require('firebase-admin');
const { ottieniAccessToken } = require('../lib/mcp-token.js');

if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      })
    });
  } else {
    admin.initializeApp();
  }
}
const db = admin.firestore();

async function autorizzato(req) {
  const h = req.headers.authorization || '';
  // Vercel Cron: se CRON_SECRET è impostato, Vercel lo manda come Bearer.
  if (process.env.CRON_SECRET && h === 'Bearer ' + process.env.CRON_SECRET) return true;
  // Senza CRON_SECRET, Vercel Cron si riconosce dallo user-agent (stesso schema delle altre function).
  const ua = String(req.headers['user-agent'] || '').toLowerCase();
  if (!process.env.CRON_SECRET && (ua.includes('vercel-cron') || req.headers['x-vercel-cron'])) return true;
  // Lancio manuale da un SUPER_ADMIN loggato al CRM.
  if (h.startsWith('Bearer ')) {
    try {
      const decoded = await admin.auth().verifyIdToken(h.slice(7).trim());
      const u = await db.collection('utenti').doc(decoded.uid).get();
      return u.exists && (u.data() || {}).ruolo === 'SUPER_ADMIN';
    } catch (_) { return false; }
  }
  return false;
}

module.exports = async function handler(req, res) {
  if (!(await autorizzato(req))) return res.status(401).json({ error: 'Non autorizzato.' });

  const inizio = Date.now();
  const snap = await db.collection('app').get();
  const apps = snap.docs.filter(d => (d.data() || {}).mcpRefreshToken);
  const errori = [];
  let ok = 0;

  for (const d of apps) {
    // Margine di sicurezza sui 300 s della function: il resto lo farà il giro successivo.
    if (Date.now() - inizio > 270000) { errori.push({ app: '(tempo esaurito)', errore: 'giro interrotto, ' + (apps.length - ok - errori.length) + ' app rimandate' }); break; }
    const nome = (d.data() || {}).nome || d.id;
    try {
      await ottieniAccessToken(db, d.id, admin);
      ok++;
    } catch (e) {
      errori.push({ app: nome, errore: String(e.message || e).slice(0, 200) });
    }
  }

  const riepilogo = {
    eseguitoIl: admin.firestore.FieldValue.serverTimestamp(),
    durataMs: Date.now() - inizio,
    totali: apps.length,
    rinnovate: ok,
    errori
  };
  await db.collection('sistema').doc('mcpKeepalive').set(riepilogo);
  console.log('[mcp-keepalive]', JSON.stringify({ totali: apps.length, rinnovate: ok, errori: errori.length }));
  return res.status(200).json(Object.assign({}, riepilogo, { eseguitoIl: new Date().toISOString() }));
};

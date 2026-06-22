/**
 * Serverless Function — Chat Pubblicazioni sulle App (MCP connector)
 *
 * Fa dialogare la sezione "Pubblicazioni sulle app" del CRM con Claude,
 * agganciando il server MCP della singola app GoodBarber (URL + chiave R-W).
 * La chiave NON arriva dal browser: viene letta da Firestore lato server.
 *
 * Endpoint: POST /api/app-publish-chat
 * Body: { appId: string, messages: [{role, content}, ...] }
 * Response: { answer, content, stop_reason, usage, app: {nome} }
 *
 * Modello: Claude Sonnet 4.6 — MCP connector (beta mcp-client-2025-11-20).
 */

const admin = require('firebase-admin');

// --- Init firebase-admin (stesso schema delle altre function del CRM) ---
if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
    });
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

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const MCP_BETA = 'mcp-client-2025-11-20';
const MAX_CONTINUATIONS = 6; // per gestire pause_turn (loop tool lato server)

// --- System prompt: il "playbook" di sicurezza ---
function buildSystemPrompt(appName) {
  return [
    `Sei l'assistente di pubblicazione per l'app comunale "${appName}" dentro il CRM Comune.Digital.`,
    `Aiuti un operatore a pubblicare contenuti (soprattutto EVENTI dell'agenda) sull'app, partendo da materiale grezzo (email, testo, link, locandine).`,
    ``,
    `REGOLE DI SICUREZZA (tassative — è un'app pubblica di un Comune, non si può sbagliare):`,
    `1. Dichiara sempre all'inizio su quale app stai lavorando: "${appName}".`,
    `2. Prima di creare contenuti, USA GLI STRUMENTI per leggere le sezioni/categorie reali dell'app: non inventare mai ID di sezione o categoria.`,
    `3. Crea i contenuti SEMPRE come BOZZA (status=draft). Non pubblicare (published) e non cancellare nulla senza una conferma ESPLICITA dell'operatore nel messaggio.`,
    `4. Prima di creare, fai un controllo anti-duplicato: cerca se esiste già un evento simile e, se sì, segnalalo invece di duplicare.`,
    `5. Date e orari: usa il formato con fuso orario (es. 2026-09-01T18:00:00+02:00). Non ripetere l'orario dentro il titolo.`,
    `6. Lingua: se l'app ha sezioni in italiano e in inglese e il contenuto è turistico, proponi anche la versione inglese; altrimenti chiedi.`,
    `7. Dopo aver creato/modificato, RILEGGI il risultato (con una lista/ricerca) e mostralo all'operatore per conferma. Nota: la lettura del singolo elemento può essere in cache, quindi verifica con la lista.`,
    `8. Prima di scrivere, mostra sempre un'ANTEPRIMA testuale di cosa stai per creare e chiedi conferma se qualcosa non è chiaro.`,
    ``,
    `Stile: italiano, chiaro e conciso. Spiega cosa stai facendo passo-passo. Quando proponi una bozza, elenca i campi (titolo, data/ora inizio e fine, luogo, descrizione, sezione) in modo leggibile.`
  ].join('\n');
}

// --- OAuth: la base del server di autorizzazione si ricava dall'URL MCP ---
// (es. https://mcp.ww-api.com/376069/mcp/sse -> https://mcp.ww-api.com/376069)
function authBaseFromMcpUrl(mcpUrl) {
  return mcpUrl.replace(/\/mcp\/sse\/?$/, '').replace(/\/sse\/?$/, '');
}

// Ottiene un access_token FRESCO dal refresh_token (grant OAuth refresh_token).
// Il server MCP GoodBarber è OAuth: NON accetta chiavi statiche, solo questo.
// Ritorna { accessToken, newRefreshToken|null } (newRefreshToken se è stato ruotato).
async function mintAccessToken({ mcpUrl, clientId, refreshToken }) {
  const tokenEndpoint = authBaseFromMcpUrl(mcpUrl) + '/token';
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    resource: mcpUrl
  }).toString();

  const r = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'accept': 'application/json' },
    body
  });
  const text = await r.text().catch(() => '');
  if (!r.ok) {
    const e = new Error(`Refresh token rifiutato dal server MCP (HTTP ${r.status}). ${text.slice(0, 300)}`);
    e.code = 'MCP_AUTH';
    throw e;
  }
  let j; try { j = JSON.parse(text); } catch (_) { j = {}; }
  if (!j.access_token) {
    const e = new Error('Risposta OAuth senza access_token.');
    e.code = 'MCP_AUTH';
    throw e;
  }
  const newRefreshToken = (j.refresh_token && j.refresh_token !== refreshToken) ? j.refresh_token : null;
  return { accessToken: j.access_token, newRefreshToken };
}

// --- CORS ---
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito. Usa POST.' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[app-publish-chat] ANTHROPIC_API_KEY non configurata');
    return res.status(500).json({ error: 'Chiave API Claude non configurata sul server.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const appId = body.appId;
    const messages = Array.isArray(body.messages) ? body.messages : null;

    if (!appId) return res.status(400).json({ error: 'appId mancante.' });
    if (!messages || messages.length === 0) return res.status(400).json({ error: 'Nessun messaggio da elaborare.' });

    // Leggi credenziali MCP dell'app DAL SERVER (mai dal browser)
    const doc = await db.collection('app').doc(String(appId)).get();
    if (!doc.exists) return res.status(404).json({ error: 'App non trovata.' });
    const app = doc.data() || {};

    const mcpUrl = (app.mcpServerUrl || '').trim();
    const clientId = (app.mcpClientId || '').trim();
    const refreshToken = (app.mcpRefreshToken || '').trim();
    const appName = app.nome || 'App';

    if (!mcpUrl || !clientId || !refreshToken) {
      return res.status(400).json({
        error: 'Collegamento MCP non configurato per questa app.',
        detail: 'Esegui il login MCP (scripts/mcp-login.js) e incolla Client ID e Refresh Token nella scheda dell\'app (Configurazione App → Collegamento MCP).'
      });
    }

    // Il server MCP GoodBarber è OAuth: ottieni un access_token fresco dal refresh_token.
    let accessToken;
    try {
      const minted = await mintAccessToken({ mcpUrl, clientId, refreshToken });
      accessToken = minted.accessToken;
      // Se il server ha ruotato il refresh_token, salva quello nuovo per le prossime volte
      if (minted.newRefreshToken) {
        await db.collection('app').doc(String(appId)).update({ mcpRefreshToken: minted.newRefreshToken });
      }
    } catch (e) {
      console.error('[app-publish-chat] mintAccessToken', e.message);
      return res.status(502).json({
        error: 'Autenticazione MCP fallita.',
        detail: e.message,
        hint: 'Il refresh token potrebbe essere scaduto o revocato: rifai il login con scripts/mcp-login.js e aggiorna Client ID e Refresh Token nella scheda dell\'app.'
      });
    }

    // Richiesta base verso Claude con MCP connector agganciato
    const basePayload = {
      model: MODEL,
      max_tokens: 4096,
      system: buildSystemPrompt(appName),
      mcp_servers: [
        { type: 'url', name: 'goodbarber', url: mcpUrl, authorization_token: accessToken }
      ],
      tools: [
        { type: 'mcp_toolset', mcp_server_name: 'goodbarber' }
      ]
    };

    // Copia la cronologia (verrà estesa se ci sono pause_turn)
    let convo = messages.slice();
    let last = null;
    let usageTotal = { input_tokens: 0, output_tokens: 0 };

    for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
      const r = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': MCP_BETA
        },
        body: JSON.stringify({ ...basePayload, messages: convo })
      });

      if (!r.ok) {
        const errText = await r.text().catch(() => '');
        console.error('[app-publish-chat] Anthropic error', r.status, errText);
        return res.status(502).json({ error: 'Errore dalla API di Claude.', status: r.status, detail: errText.slice(0, 800) });
      }

      last = await r.json();
      if (last.usage) {
        usageTotal.input_tokens += last.usage.input_tokens || 0;
        usageTotal.output_tokens += last.usage.output_tokens || 0;
      }

      // pause_turn: il loop tool lato server ha raggiunto il limite — rilancia per continuare
      if (last.stop_reason === 'pause_turn') {
        convo = convo.concat([{ role: 'assistant', content: last.content }]);
        continue;
      }
      break;
    }

    const answer = (last && Array.isArray(last.content))
      ? last.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
      : '';

    return res.status(200).json({
      answer: answer || '(nessun testo nella risposta)',
      content: last ? last.content : [],
      stop_reason: last ? last.stop_reason : null,
      usage: usageTotal,
      app: { nome: appName }
    });

  } catch (err) {
    console.error('[app-publish-chat] errore', err);
    return res.status(500).json({ error: 'Errore interno del server', detail: err.message });
  }
};

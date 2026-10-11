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
 * Modello: Claude Opus 5.5 — MCP connector (beta mcp-client-2025-11-20).
 * v10.5.6: Opus 5.5 al posto di Sonnet 4.6 (provato in sola lettura su Cefalù l'11/10/2026),
 * cache dei prompt (gli ~84 strumenti GoodBarber si rileggono dalla cache: ~0,04 $ invece di ~1 $
 * a richiesta), data di oggi nel prompt, rete di sicurezza sui rifiuti (fallbacks "default").
 *
 * SICUREZZA (v10.5.5): la chiamata richiede un utente loggato nel CRM
 * (Authorization: Bearer <Firebase ID token>) con un ruolo abilitato (RUOLI_PUBBLICAZIONE),
 * e il browser chiamante deve essere il CRM (CORS ristretto).
 * Il lasciapassare MCP si rinnova tramite lib/mcp-token.js: un'app alla volta (lucchetto)
 * e token ruotato sempre salvato.
 */

const admin = require('firebase-admin');
const { ottieniAccessToken } = require('../lib/mcp-token.js');

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
const MODEL = 'claude-opus-5-5';
const MCP_BETA = 'mcp-client-2025-11-20,server-side-fallback-2026-07-01';
const MAX_CONTINUATIONS = 6; // per gestire pause_turn (loop tool lato server)

// --- Strumenti GoodBarber TOLTI all'assistente (v10.5.8) ---
// Push ai cittadini, cancellazioni di interi contenuti e prenotazioni restano manuali.
// (Le cancellazioni di singoli paragrafi restano attive: servono per correggere testi e foto.)
const STRUMENTI_DISATTIVATI = [
  'classic_create_push_broadcast', 'classic_create_push_by_groups', 'classic_v1_create_push_notification',
  'cms_delete_article', 'cms_delete_event', 'cms_delete_map', 'cms_delete_photo', 'cms_delete_sound', 'cms_delete_video',
  'booking_cancel_booking', 'booking_create_closing_day', 'booking_delete_closing_day'
];
const MCP_TOOLSET = {
  type: 'mcp_toolset',
  mcp_server_name: 'goodbarber',
  configs: Object.fromEntries(STRUMENTI_DISATTIVATI.map(n => [n, { enabled: false }]))
};

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
    `5. ORARI E NOTIFICHE (metodo di lavoro Comune.Digital, vale per tutte le app): l'ora di INIZIO salvata nell'evento NON è l'orario reale. È l'ora in cui parte la notifica push agli utenti, di solito anticipata rispetto all'evento, e non viene mostrata agli utenti. L'orario REALE dell'evento si scrive nel TITOLO (e/o nella descrizione).`,
    `   - Quando leggi gli eventi, considera reale l'orario scritto nel titolo o nel testo. NON segnalare come errore la differenza tra ora di inizio salvata e orario nel titolo: è voluta.`,
    `   - Quando crei un evento, scrivi l'orario reale nel titolo come negli eventi già presenti nell'app. L'anticipo della notifica si decide ogni volta: se l'operatore non ti ha detto a che ora far partire la notifica, CHIEDIGLIELO prima di creare la bozza (proponi tu un orario sensato, ad esempio qualche ora prima o la mattina stessa, ma fallo confermare).`,
    `   - Formato delle date con fuso orario, ad esempio 2026-09-01T18:00:00+02:00.`,
    `6. TESTI CURATI E INGLESE (sempre, già dalla prima bozza): riscrivi il materiale ricevuto in un italiano chiaro ed elegante, adatto all'app di un Comune (niente maiuscolo urlato, niente refusi, frasi brevi). La descrizione si scrive in HTML semplice: paragrafi <p>, <strong> per le informazioni chiave (data, orario, luogo, costo), elenchi <ul><li> se servono. Sotto il testo italiano aggiungi una riga <hr> e poi la TRADUZIONE INGLESE completa in corsivo, racchiusa in <p><em>…</em></p>. Il titolo resta in italiano. Se l'app ha anche una sezione separata in inglese (per esempio "Events"), chiedi se creare lì anche l'evento in inglese.`,
    `6b. Strumenti non disponibili per scelta: non puoi inviare notifiche push, cancellare interi contenuti (eventi, articoli, punti mappa, foto, video, audio) né gestire prenotazioni. Se te lo chiedono, spiega che va fatto a mano dal back office GoodBarber.`,
    `7. Dopo aver creato/modificato, RILEGGI il risultato (con una lista/ricerca) e mostralo all'operatore per conferma. Nota: la lettura del singolo elemento può essere in cache, quindi verifica con la lista.`,
    `8. Prima di scrivere, mostra sempre un'ANTEPRIMA testuale di cosa stai per creare e chiedi conferma se qualcosa non è chiaro.`,
    ``,
    `Stile: italiano, chiaro e conciso. Spiega cosa stai facendo passo-passo. Quando proponi una bozza, elenca i campi (titolo, data/ora inizio e fine, luogo, descrizione, sezione) in modo leggibile.`,
    ``,
    `Oggi è ${oggiInItalia()} (ora italiana, fuso Europe/Rome). Usa questa data per interpretare "oggi", "domani", "sabato prossimo" e simili.`
  ].join('\n');
}

// Data di oggi in italiano (solo il giorno: cambia una volta al giorno, così la cache dei prompt regge)
function oggiInItalia() {
  return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
}

// --- CORS: solo il CRM (e il server locale di sviluppo) ---
const ORIGINI_AMMESSE = ['https://crm.comune.digital', 'http://localhost:8080', 'http://127.0.0.1:8080'];
function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (ORIGINI_AMMESSE.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// --- Chi può pubblicare sulle app (ruoli del CRM, campo utenti/{uid}.ruolo) ---
const RUOLI_PUBBLICAZIONE = ['SUPER_ADMIN', 'ADMIN', 'CTO', 'SVILUPPATORE', 'CONTENT_MANAGER'];

async function verificaUtente(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return { ok: false, status: 401, error: 'Accesso negato: serve il login al CRM.' };
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(h.slice(7).trim());
  } catch (e) {
    return { ok: false, status: 401, error: 'Sessione scaduta o non valida: ricarica il CRM e rifai il login.' };
  }
  const u = await db.collection('utenti').doc(decoded.uid).get();
  const ruolo = u.exists ? (u.data() || {}).ruolo : null;
  if (!RUOLI_PUBBLICAZIONE.includes(ruolo)) {
    return { ok: false, status: 403, error: 'Il tuo ruolo non è abilitato alle pubblicazioni sulle app.' };
  }
  return { ok: true, uid: decoded.uid, ruolo };
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito. Usa POST.' });

  const utente = await verificaUtente(req).catch(e => ({ ok: false, status: 500, error: 'Verifica accesso fallita: ' + e.message }));
  if (!utente.ok) return res.status(utente.status).json({ error: utente.error });

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

    // Credenziali MCP lette e rinnovate DAL SERVER (mai dal browser), un'app alla volta.
    let accessToken, mcpUrl, appName;
    try {
      const t = await ottieniAccessToken(db, appId, admin);
      accessToken = t.accessToken; mcpUrl = t.mcpUrl; appName = t.appName;
    } catch (e) {
      if (e.code === 'NOT_FOUND') return res.status(404).json({ error: 'App non trovata.' });
      if (e.code === 'MCP_NOT_CONFIGURED') {
        return res.status(400).json({
          error: 'Collegamento MCP non configurato per questa app.',
          detail: 'Collega l\'app con scripts/mcp-collega/collega-app.js (vedi scripts/mcp-collega/ISTRUZIONI.md).'
        });
      }
      if (e.code === 'MCP_BUSY') return res.status(409).json({ error: e.message });
      console.error('[app-publish-chat] rinnovo lasciapassare', e.message);
      return res.status(502).json({
        error: 'Autenticazione MCP fallita.',
        detail: e.message,
        hint: 'Il collegamento potrebbe essere scaduto (non usato per 30 giorni) o revocato: ricollega l\'app con scripts/mcp-collega/collega-app.js --force.'
      });
    }

    // Richiesta base verso Claude con MCP connector agganciato
    const basePayload = {
      model: MODEL,
      max_tokens: 16000,
      // Cache automatica: strumenti, istruzioni e cronologia si rileggono a ~1/10 del prezzo
      cache_control: { type: 'ephemeral' },
      // Se Opus rifiuta per un falso allarme dei filtri di sicurezza, il server riprova con un altro modello
      fallbacks: 'default',
      system: buildSystemPrompt(appName),
      mcp_servers: [
        { type: 'url', name: 'goodbarber', url: mcpUrl, authorization_token: accessToken }
      ],
      tools: [MCP_TOOLSET]
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

    let answer = (last && Array.isArray(last.content))
      ? last.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
      : '';
    if (last && last.stop_reason === 'refusal') {
      const cat = last.stop_details && last.stop_details.category ? ' (' + last.stop_details.category + ')' : '';
      answer = (answer ? answer + '\n\n' : '') + '⚠️ L\'assistente non ha potuto completare questa richiesta' + cat + '. Prova a riformularla o a dividerla in parti più semplici.';
    }

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

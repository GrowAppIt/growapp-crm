/**
 * Serverless Function — Suggerimento dati documento con AI
 *
 * Riceve un documento (PDF o immagine) in base64, lo fa leggere a Claude e
 * restituisce una proposta di descrizione, categoria e data del documento.
 * L'utente vede la proposta nel form e la conferma o la corregge: NIENTE viene
 * salvato da qui.
 *
 * Endpoint: POST /api/suggerisci-documento
 * Body: { nomeFile, mimeType, data }   // data = base64 puro, senza prefisso data:
 * Response: { descrizione, categoria, dataDocumento, usage }
 *
 * PRIVACY: il documento viene inviato alle API di Anthropic. La chiamata parte
 * SOLO quando l'utente preme "Suggerisci" su quel singolo file — mai in automatico.
 *
 * Accessibile solo a utenti autenticati (ID token Firebase valido).
 */

// Categorie ammesse — devono restare allineate a DocumentService.CATEGORIE
// in public/js/document-service.js
const CATEGORIE = ['contratto', 'fattura', 'certificato', 'identita', 'verbale', 'altro'];

// Tipi che Claude sa leggere. Word/Excel/p7m si possono archiviare ma non far leggere.
const MIME_LEGGIBILI = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

// Limite di sicurezza sul body: le Vercel Serverless Function accettano al massimo
// ~4.5MB di richiesta. Teniamoci sotto con margine (il base64 gonfia del ~33%).
const MAX_BASE64_BYTES = 3.8 * 1024 * 1024;

const SYSTEM_PROMPT = `Sei un archivista che cataloga i documenti dei clienti dentro un CRM italiano (Comune.Digital, azienda che realizza le app dei Comuni italiani).

Ricevi un documento e proponi tre dati per l'archivio:

1. "descrizione": UNA riga in italiano, 4-12 parole, che dica che cos'è il documento e a cosa si riferisce. Deve servire a ritrovarlo in una lista.
   - Scrivi la sostanza, non il tipo di file. NO "documento PDF", "scansione", "immagine".
   - Includi riferimenti utili se ci sono: numero fattura, anno, oggetto del contratto, nome del Comune.
   - Esempi buoni: "Contratto canone app 2026 firmato dal Comune di Mezzolombardo", "Fattura 2026/114 per attivazione app", "Visura camerale Growapp aggiornata".
   - Niente virgolette doppie nel testo.

2. "categoria": esattamente uno tra contratto, fattura, certificato, identita, verbale, altro.
   - contratto: contratti, proposte firmate, ordini, capitolati.
   - fattura: fatture, note di credito, ricevute, solleciti di pagamento.
   - certificato: visure, DURC, certificati camerali, polizze, attestati.
   - identita: carte d'identità, passaporti, patenti, codici fiscali, tessere sanitarie.
   - verbale: verbali, determine, delibere, corrispondenza formale.
   - altro: tutto il resto.

3. "dataDocumento": la data del documento in formato AAAA-MM-GG.
   - È la data stampata SUL documento (data fattura, data firma, data del verbale), NON la data di oggi.
   - Se il documento riporta più date, usa quella che lo identifica (emissione/firma).
   - Se non riesci a leggere nessuna data, restituisci stringa vuota "".

Se il documento è illeggibile o non capisci cosa sia, non inventare: descrizione generica onesta, categoria "altro", data "".`;

const SCHEMA = {
  type: 'object',
  properties: {
    descrizione: { type: 'string' },
    categoria: { type: 'string', enum: CATEGORIE },
    dataDocumento: { type: 'string' }
  },
  required: ['descrizione', 'categoria', 'dataDocumento'],
  additionalProperties: false
};

// === HANDLER PRINCIPALE ===

const admin = require('firebase-admin');
if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      admin.initializeApp({ credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      }) });
    } else {
      admin.initializeApp();
    }
  } catch (e) {
    console.error('[suggerisci-documento] Errore init Firebase Admin:', e.message);
  }
}

function normalizzaData(valore) {
  const data = String(valore || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : '';
}

function ripulisciDescrizione(valore) {
  return String(valore || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/"/g, '”')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 300);
}

module.exports = async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito. Usa POST.' });

  // Autenticazione obbligatoria: l'endpoint riceve documenti dei clienti e usa la chiave Anthropic.
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!idToken) {
    return res.status(401).json({ error: 'Non autorizzato: token Firebase mancante.' });
  }
  try {
    await admin.auth().verifyIdToken(idToken);
  } catch (e) {
    return res.status(401).json({ error: 'Non autorizzato: token Firebase non valido.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[suggerisci-documento] ANTHROPIC_API_KEY non configurata');
    return res.status(500).json({ error: 'Chiave API non configurata sul server.' });
  }

  const body = req.body || {};
  const nomeFile = String(body.nomeFile || 'documento').slice(0, 200);
  const mimeType = String(body.mimeType || '');
  const data = String(body.data || '');

  if (!data) {
    return res.status(400).json({ error: 'Nessun contenuto ricevuto.' });
  }
  if (MIME_LEGGIBILI.indexOf(mimeType) === -1) {
    return res.status(400).json({ error: 'Il suggerimento automatico funziona solo su PDF e immagini.' });
  }
  if (data.length > MAX_BASE64_BYTES) {
    return res.status(413).json({ error: 'Documento troppo grande per il suggerimento automatico. Compila i campi a mano.' });
  }

  // Il blocco "document" vale per i PDF, "image" per le immagini.
  const blocco = mimeType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: data } }
    : { type: 'image', source: { type: 'base64', media_type: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType, data: data } };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: SCHEMA }
        },
        messages: [{
          role: 'user',
          content: [
            blocco,
            { type: 'text', text: `Cataloga questo documento. Il file si chiama "${nomeFile}": usalo come indizio solo se il contenuto non basta.` }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[suggerisci-documento] Errore API Anthropic:', response.status, errBody.substring(0, 500));
      let detail = errBody.substring(0, 500);
      try {
        const errJson = JSON.parse(errBody);
        detail = (errJson.error && errJson.error.message) || detail;
      } catch (e) { /* non JSON */ }
      return res.status(502).json({ error: 'Errore dalla API Anthropic', detail: detail });
    }

    const risposta = await response.json();

    if (risposta.stop_reason === 'refusal') {
      return res.status(422).json({ error: 'Il modello ha rifiutato di analizzare questo documento.' });
    }

    const testo = (risposta.content || [])
      .filter(function (b) { return b.type === 'text'; })
      .map(function (b) { return b.text; })
      .join('');

    let parsed;
    try {
      parsed = JSON.parse(testo);
    } catch (e) {
      console.error('[suggerisci-documento] Risposta non JSON:', testo.substring(0, 300));
      return res.status(502).json({ error: 'Risposta del modello non interpretabile.' });
    }

    const usage = risposta.usage || {};
    console.log(`[suggerisci-documento] OK — ${nomeFile} — input: ${usage.input_tokens || '?'}, output: ${usage.output_tokens || '?'} token`);

    return res.status(200).json({
      descrizione: ripulisciDescrizione(parsed.descrizione),
      categoria: CATEGORIE.indexOf(parsed.categoria) !== -1 ? parsed.categoria : 'altro',
      dataDocumento: normalizzaData(parsed.dataDocumento),
      usage: {
        input_tokens: usage.input_tokens || 0,
        output_tokens: usage.output_tokens || 0
      }
    });

  } catch (error) {
    console.error('[suggerisci-documento] Errore:', error.message);
    return res.status(500).json({ error: 'Errore durante l\'analisi del documento.' });
  }
};

/**
 * Serverless Function — Classificazione AI notizie RSS
 *
 * Proxy sicuro verso l'API Anthropic (Claude Haiku).
 * La chiave API resta nelle Environment Variables di Vercel,
 * mai esposta al frontend.
 *
 * Endpoint: POST /api/classify-news
 * Body: { items: [{ id, title, description, feedName }] }
 * Response: { results: [{ id, category, relevance, reason }] }
 */

// Categorie configurate per le app comunali Comune.Digital
const CATEGORIES = [
  { id: 'differenziata', label: 'Raccolta differenziata', keywords: 'calendari, cambio giorni, isole ecologiche, TARI, rifiuti' },
  { id: 'eventi', label: 'Eventi e cultura', keywords: 'sagre, feste patronali, concerti, mostre, cinema, teatro, spettacoli' },
  { id: 'servizi', label: 'Servizi e uffici', keywords: 'orari uffici, numeri telefono, sportelli, servizi digitali, anagrafe' },
  { id: 'turismo', label: 'Punti di interesse / Turismo', keywords: 'percorsi, attrazioni, itinerari, spiagge, parchi, monumenti' },
  { id: 'salute_trasporti', label: 'Salute e trasporti', keywords: 'farmacie, guardie mediche, orari bus, trasporto urbano, ASL' },
  { id: 'scuola', label: 'Scuola e istruzione', keywords: 'iscrizioni, mense scolastiche, trasporto scolastico, borse di studio, campus' },
  { id: 'bandi', label: 'Bandi e contributi', keywords: 'bandi, bonus, agevolazioni, contributi, PNRR, finanziamenti' },
  { id: 'lavori_viabilita', label: 'Lavori pubblici e viabilità', keywords: 'cantieri, chiusure strade, parcheggi, ZTL, rotatorie, piste ciclabili' },
  { id: 'ambiente', label: 'Ambiente e verde', keywords: 'parchi, aree verdi, animali, randagismo, disinfestazioni, alberi' },
];

const CATEGORY_LIST = CATEGORIES.map(c => `- "${c.id}" = ${c.label} (${c.keywords})`).join('\n');

/**
 * Pulisce il testo da HTML, caratteri di controllo, emoji problematici
 * e lo tronca a maxLen caratteri.
 */

/**
 * Rimuove i lone surrogates (caratteri Unicode rotti) da una stringa.
 * Itera carattere per carattere — approccio più robusto delle regex.
 */
function removeLoneSurrogates(str) {
  if (!str) return '';
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0xD800 && code <= 0xDBFF) {
      // High surrogate: controlla se è seguito da un low surrogate
      const next = i + 1 < str.length ? str.charCodeAt(i + 1) : 0;
      if (next >= 0xDC00 && next <= 0xDFFF) {
        // Coppia valida — tieni entrambi
        result += str[i] + str[i + 1];
        i++;
      }
      // Altrimenti lone high surrogate — salta
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      // Lone low surrogate — salta
    } else {
      result += str[i];
    }
  }
  return result;
}

function sanitizeText(raw, maxLen) {
  if (!raw) return '';
  let text = raw
    // Rimuovi tag HTML
    .replace(/<[^>]*>/g, ' ')
    // Decodifica entità HTML comuni
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/&\w+;/g, ' ')
    // Rimuovi caratteri di controllo (tranne newline e tab)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Rimuovi surrogate pairs rotti (emoji/unicode spaiati che rompono il JSON)
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '$1')
    // Rimuovi caratteri Unicode problematici
    .replace(/[\uFFFD\uFFFE\uFFFF]/g, '')
    // Normalizza spazi e newline
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length > maxLen) {
    text = text.substring(0, maxLen);
  }
  return text;
}

module.exports = async function handler(req, res) {

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo non consentito. Usa POST.' });
  }

  // Leggi la chiave API dalle Environment Variables di Vercel
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[classify-news] ANTHROPIC_API_KEY non configurata');
    return res.status(500).json({ error: 'Chiave API non configurata sul server.' });
  }

  const { items } = req.body || {};

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Invia un array "items" con almeno un elemento.' });
  }

  // Limite: max 20 notizie per chiamata (ridotto per sicurezza)
  const batch = items.slice(0, 20);

  // Costruisci il prompt con testo sanitizzato
  const newsBlock = batch.map((item, i) => {
    const title = sanitizeText(item.title, 200) || 'Senza titolo';
    const desc = sanitizeText(item.description, 250);
    const feed = sanitizeText(item.feedName, 80) || 'N/A';
    return `[${i}] Fonte: ${feed} | Titolo: ${title}${desc ? ' | Testo: ' + desc : ''}`;
  }).join('\n');

  const systemPrompt = `Sei un assistente che classifica notizie per app comunali italiane (Comune.Digital).

Per ogni notizia devi decidere:
1. Se e' RILEVANTE per un'app comunale (contenuto utile per i cittadini)
2. La CATEGORIA piu' pertinente
3. Un PUNTEGGIO di rilevanza da 1 a 10

Categorie disponibili:
${CATEGORY_LIST}
- "non_rilevante" = Notizia non pertinente (comunicati politici generici, auguri, condoglianze, contenuti vaghi)

Criteri di rilevanza (punteggio 1-10):
- 8-10: Contenuto DIRETTAMENTE utilizzabile nell'app (calendario differenziata, evento con data/luogo, cambio orari ufficio)
- 5-7: Contenuto POTENZIALMENTE utile ma generico
- 1-4: Rilevanza bassa o marginale
- 0: Non rilevante

RISPONDI SOLO con un array JSON valido. Ogni elemento:
- "idx": indice della notizia (numero)
- "cat": id categoria (stringa)
- "score": punteggio 0-10 (numero)
- "reason": motivazione breve in italiano (max 12 parole)

Esempio: [{"idx":0,"cat":"eventi","score":8,"reason":"Evento con data e luogo specifici"}]`;

  const userMessage = `Classifica queste ${batch.length} notizie:\n\n${newsBlock}`;

  try {
    // Costruisci il JSON e rimuovi eventuali surrogate pairs rotti dal body finale
    let requestBody = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userMessage }
      ]
    });
    // Pulizia definitiva: rimuovi TUTTE le sequenze surrogate escape (\uD800-\uDFFF)
    // dal JSON serializzato. JSON.stringify converte i surrogates in escape testuali
    // tipo \uD83D\uDE00 — rimuoviamo tutte le \uDXXX (sia lone che paired = emoji)
    // perché non servono per la classificazione e causano errori API.
    requestBody = requestBody.replace(/\\u[dD][89a-fA-F][0-9a-fA-F]{2}/g, '');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: requestBody
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[classify-news] Errore API Anthropic:', response.status, errBody);
      // Prova a parsare l'errore JSON di Anthropic per estrarre il messaggio
      let errorMessage = errBody.substring(0, 1000);
      try {
        const errJson = JSON.parse(errBody);
        errorMessage = (errJson.error && errJson.error.message) || (errJson.error && errJson.error.type) || errorMessage;
      } catch(e) { /* non JSON, usa il testo raw */ }
      return res.status(502).json({
        error: 'Errore dalla API Anthropic',
        status: response.status,
        detail: errorMessage
      });
    }

    const data = await response.json();
    const textContent = data.content?.[0]?.text || '[]';

    // Estrai il JSON dalla risposta
    let classifications;
    try {
      const jsonMatch = textContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        classifications = JSON.parse(jsonMatch[0]);
      } else {
        classifications = JSON.parse(textContent);
      }
    } catch (parseErr) {
      console.error('[classify-news] Errore parsing:', parseErr.message, 'Testo:', textContent.substring(0, 300));
      return res.status(502).json({ error: 'Risposta AI non valida', raw: textContent.substring(0, 200) });
    }

    // Mappa i risultati con gli ID originali
    const categoryLabels = {};
    CATEGORIES.forEach(c => { categoryLabels[c.id] = c.label; });
    categoryLabels['non_rilevante'] = 'Non rilevante';

    const results = [];
    for (const cl of classifications) {
      const idx = typeof cl.idx === 'number' ? cl.idx : parseInt(cl.idx);
      if (isNaN(idx) || idx < 0 || idx >= batch.length) continue;
      const originalItem = batch[idx];
      results.push({
        id: originalItem?.id || ('idx_' + idx),
        category: cl.cat || 'non_rilevante',
        categoryLabel: categoryLabels[cl.cat] || cl.cat || 'Non rilevante',
        relevance: typeof cl.score === 'number' ? cl.score : 0,
        reason: cl.reason || ''
      });
    }

    const usage = data.usage || {};

    return res.status(200).json({
      results,
      usage: {
        input_tokens: usage.input_tokens || 0,
        output_tokens: usage.output_tokens || 0
      }
    });

  } catch (err) {
    console.error('[classify-news] Errore generico:', err);
    return res.status(500).json({ error: 'Errore interno del server', detail: err.message });
  }
};

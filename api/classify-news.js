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

const CATEGORY_LIST = CATEGORIES.map(c => `- "${c.id}" → ${c.label} (${c.keywords})`).join('\n');

module.exports = async function handler(req, res) {

  // CORS headers (il Monitor RSS gira nello stesso dominio, ma per sicurezza)
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
    console.error('[classify-news] ANTHROPIC_API_KEY non configurata nelle Environment Variables di Vercel');
    return res.status(500).json({ error: 'Chiave API non configurata sul server.' });
  }

  const { items } = req.body || {};

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Invia un array "items" con almeno un elemento.' });
  }

  // Limite: max 30 notizie per chiamata (per restare nei limiti di token)
  const batch = items.slice(0, 30);

  // Costruisci il prompt per Claude Haiku
  const newsBlock = batch.map((item, i) => {
    const desc = (item.description || '').substring(0, 300);
    return `[${i}] Fonte: ${item.feedName || 'N/A'}\nTitolo: ${item.title || 'Senza titolo'}\nDescrizione: ${desc}`;
  }).join('\n\n');

  const systemPrompt = `Sei un assistente che classifica notizie per app comunali italiane (Comune.Digital).

Per ogni notizia devi decidere:
1. Se è RILEVANTE per un'app comunale (contenuto utile per i cittadini)
2. La CATEGORIA più pertinente
3. Un PUNTEGGIO di rilevanza da 1 a 10

Categorie disponibili:
${CATEGORY_LIST}
- "non_rilevante" → Notizia non pertinente per le app (comunicati politici generici, notizie nazionali, auguri, condoglianze, contenuti vaghi)

Criteri di rilevanza (punteggio 1-10):
- 8-10: Contenuto DIRETTAMENTE utilizzabile nell'app (nuovo calendario differenziata, evento con data/luogo, cambio orari ufficio)
- 5-7: Contenuto POTENZIALMENTE utile ma generico (iniziativa culturale senza dettagli, menzione servizi senza novità)
- 1-4: Rilevanza bassa o marginale
- 0: Non rilevante

RISPONDI SOLO con un array JSON valido, senza altro testo. Ogni elemento deve avere:
- "idx": numero indice della notizia [0, 1, 2...]
- "cat": id categoria (stringa)
- "score": punteggio 1-10 (numero) oppure 0 se non rilevante
- "reason": motivazione brevissima in italiano (max 15 parole)

Esempio di risposta:
[{"idx":0,"cat":"eventi","score":8,"reason":"Evento culturale con data e luogo specifici"},{"idx":1,"cat":"non_rilevante","score":0,"reason":"Comunicato politico generico senza info utili"}]`;

  const userMessage = `Classifica queste ${batch.length} notizie:\n\n${newsBlock}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userMessage }
        ]
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[classify-news] Errore API Anthropic:', response.status, errBody);
      return res.status(502).json({
        error: 'Errore dalla API Anthropic',
        status: response.status,
        detail: errBody.substring(0, 200)
      });
    }

    const data = await response.json();
    const textContent = data.content?.[0]?.text || '[]';

    // Estrai il JSON dalla risposta (gestisci anche se Haiku aggiunge testo extra)
    let classifications;
    try {
      // Cerca un array JSON nella risposta
      const jsonMatch = textContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        classifications = JSON.parse(jsonMatch[0]);
      } else {
        classifications = JSON.parse(textContent);
      }
    } catch (parseErr) {
      console.error('[classify-news] Errore parsing risposta AI:', parseErr.message, 'Testo:', textContent.substring(0, 500));
      return res.status(502).json({ error: 'Risposta AI non valida', raw: textContent.substring(0, 300) });
    }

    // Mappa i risultati con gli ID originali
    const categoryLabels = {};
    CATEGORIES.forEach(c => { categoryLabels[c.id] = c.label; });
    categoryLabels['non_rilevante'] = 'Non rilevante';

    const results = classifications.map(cl => {
      const originalItem = batch[cl.idx];
      return {
        id: originalItem?.id || `idx_${cl.idx}`,
        category: cl.cat || 'non_rilevante',
        categoryLabel: categoryLabels[cl.cat] || cl.cat,
        relevance: typeof cl.score === 'number' ? cl.score : 0,
        reason: cl.reason || ''
      };
    });

    // Info sui token usati (per monitoraggio costi)
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

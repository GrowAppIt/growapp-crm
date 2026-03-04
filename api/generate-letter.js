/**
 * Serverless Function — Generazione Lettere AI Personalizzate
 *
 * Proxy sicuro verso l'API Anthropic (Claude Haiku 4.5).
 * La chiave API resta nelle Environment Variables di Vercel,
 * mai esposta al frontend.
 *
 * Endpoint: POST /api/generate-letter
 * Body: { letterTypeInfo, cliente, contratto, fatture, app, appStats, azienda, selectedSections, customInstructions }
 * Response: { sections: { salutation, intro, body, stats, closing, signature }, metadata, usage }
 *
 * I tipi di lettera sono DINAMICI e configurati dall'admin nelle Impostazioni del CRM.
 * Il frontend passa letterTypeInfo con nome, descrizione e promptAI personalizzato.
 */

/**
 * Pulisce il testo da HTML, caratteri di controllo e lo tronca a maxLen.
 */
function sanitizeText(raw, maxLen) {
  if (!raw) return '';
  let text = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ').replace(/&\w+;/g, ' ')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[\uFFFD\uFFFE\uFFFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLen ? text.substring(0, maxLen) : text;
}

/**
 * Formatta una data in DD/MM/YYYY
 */
function formatDate(dateStr) {
  if (!dateStr) return 'N/D';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'N/D';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  } catch (e) { return 'N/D'; }
}

/**
 * Formatta un importo in Euro
 */
function formatCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return 'N/D';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount);
}

module.exports = async function handler(req, res) {

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito. Usa POST.' });

  // API Key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[generate-letter] ANTHROPIC_API_KEY non configurata');
    return res.status(500).json({ error: 'Chiave API non configurata sul server.' });
  }

  const { letterTypeInfo, cliente, contratto, fatture, app, appStats, azienda, selectedSections, customInstructions } = req.body || {};

  // Validazione — il tipo di lettera e' ora passato dal frontend con tutte le info
  if (!letterTypeInfo || !letterTypeInfo.nome || !letterTypeInfo.promptAI) {
    return res.status(400).json({ error: 'Dati tipo lettera mancanti (nome e promptAI obbligatori).' });
  }
  if (!cliente || !cliente.ragioneSociale) {
    return res.status(400).json({ error: 'Dati cliente mancanti (ragioneSociale obbligatoria).' });
  }

  // Costruisci il contesto dati per l'AI
  let dataContext = '';

  // --- CLIENTE ---
  dataContext += `\n## CLIENTE\n`;
  dataContext += `- Ragione Sociale: ${sanitizeText(cliente.ragioneSociale, 200)}\n`;
  if (cliente.tipo) dataContext += `- Tipo: ${cliente.tipo === 'PA' ? 'Pubblica Amministrazione' : 'Privato'}\n`;
  if (cliente.indirizzo) dataContext += `- Indirizzo: ${sanitizeText(cliente.indirizzo, 200)}\n`;
  if (cliente.cap) dataContext += `- CAP: ${cliente.cap}\n`;
  if (cliente.comune) dataContext += `- Comune: ${sanitizeText(cliente.comune, 100)}\n`;
  if (cliente.provincia) dataContext += `- Provincia: ${sanitizeText(cliente.provincia, 50)}\n`;
  if (cliente.email) dataContext += `- Email: ${sanitizeText(cliente.email, 100)}\n`;
  if (cliente.pec) dataContext += `- PEC: ${sanitizeText(cliente.pec, 100)}\n`;
  if (cliente.telefono) dataContext += `- Telefono: ${sanitizeText(cliente.telefono, 30)}\n`;
  if (cliente.referente) dataContext += `- Referente: ${sanitizeText(cliente.referente, 100)}\n`;

  // --- CONTRATTO ---
  if (contratto) {
    dataContext += `\n## CONTRATTO\n`;
    if (contratto.numeroContratto) dataContext += `- Numero: ${sanitizeText(contratto.numeroContratto, 50)}\n`;
    if (contratto.oggetto) dataContext += `- Oggetto: ${sanitizeText(contratto.oggetto, 300)}\n`;
    if (contratto.importoAnnuale) dataContext += `- Importo annuale: ${formatCurrency(contratto.importoAnnuale)}\n`;
    if (contratto.dataInizio) dataContext += `- Inizio: ${formatDate(contratto.dataInizio)}\n`;
    if (contratto.dataScadenza) dataContext += `- Scadenza: ${formatDate(contratto.dataScadenza)}\n`;
    if (contratto.stato) dataContext += `- Stato: ${contratto.stato}\n`;
    if (contratto.tipologia) dataContext += `- Tipologia: ${sanitizeText(contratto.tipologia, 100)}\n`;
  }

  // --- FATTURE (storico pagamenti) ---
  if (selectedSections?.includes_payment_history && fatture && fatture.length > 0) {
    dataContext += `\n## STORICO FATTURE (ultime ${Math.min(fatture.length, 10)})\n`;
    const fattureRecenti = fatture.slice(0, 10);
    fattureRecenti.forEach(f => {
      dataContext += `- ${f.numeroFatturaCompleto || 'N/D'}: ${formatCurrency(f.importoTotale)} — ${f.statoPagamento || 'N/D'} — Emessa: ${formatDate(f.dataEmissione)} — Scadenza: ${formatDate(f.dataScadenza)}\n`;
    });
    const pagate = fatture.filter(f => f.statoPagamento === 'PAGATA').length;
    const nonPagate = fatture.filter(f => f.statoPagamento === 'NON_PAGATA' || f.statoPagamento === 'PARZIALMENTE_PAGATA').length;
    dataContext += `- Riepilogo: ${pagate} pagate, ${nonPagate} non pagate su ${fatture.length} totali\n`;
  }

  // --- APP ---
  if (app) {
    dataContext += `\n## APP ASSOCIATA\n`;
    if (app.nomeApp || app.nome) dataContext += `- Nome: ${sanitizeText(app.nomeApp || app.nome, 100)}\n`;
    if (app.comune) dataContext += `- Comune servito: ${sanitizeText(app.comune, 100)}\n`;
    if (app.popolazione) dataContext += `- Popolazione: ${app.popolazione.toLocaleString('it-IT')} abitanti\n`;
    if (app.statoApp) dataContext += `- Stato: ${app.statoApp}\n`;
    if (app.referenteComune) dataContext += `- Referente comunale: ${sanitizeText(app.referenteComune, 100)}\n`;
  }

  // --- STATISTICHE APP ---
  if (selectedSections?.includes_app_stats && appStats) {
    dataContext += `\n## STATISTICHE UTILIZZO APP (ultimi 30 giorni)\n`;
    if (appStats.downloads !== undefined) dataContext += `- Download totali: ${appStats.downloads?.toLocaleString('it-IT') || 'N/D'}\n`;
    if (appStats.launches !== undefined) dataContext += `- Lanci app (30gg): ${appStats.launches?.toLocaleString('it-IT') || 'N/D'}\n`;
    if (appStats.uniqueUsers !== undefined) dataContext += `- Utenti unici (30gg): ${appStats.uniqueUsers?.toLocaleString('it-IT') || 'N/D'}\n`;
    if (appStats.pageViews !== undefined) dataContext += `- Pagine visualizzate (30gg): ${appStats.pageViews?.toLocaleString('it-IT') || 'N/D'}\n`;
    if (appStats.avgSessionTime) dataContext += `- Durata media sessione: ${appStats.avgSessionTime}\n`;
  }

  // --- AZIENDA MITTENTE ---
  if (azienda) {
    dataContext += `\n## AZIENDA MITTENTE\n`;
    if (azienda.nomeAzienda || azienda.ragioneSociale) dataContext += `- Nome: ${sanitizeText(azienda.nomeAzienda || azienda.ragioneSociale, 200)}\n`;
    if (azienda.emailAzienda || azienda.email) dataContext += `- Email: ${sanitizeText(azienda.emailAzienda || azienda.email, 100)}\n`;
    if (azienda.telefonoAzienda || azienda.telefono) dataContext += `- Telefono: ${sanitizeText(azienda.telefonoAzienda || azienda.telefono, 30)}\n`;
    if (azienda.pecAzienda || azienda.pec) dataContext += `- PEC: ${sanitizeText(azienda.pecAzienda || azienda.pec, 100)}\n`;
    if (azienda.indirizzoAzienda || azienda.indirizzo) dataContext += `- Indirizzo: ${sanitizeText(azienda.indirizzoAzienda || azienda.indirizzo, 200)}\n`;
    if (azienda.sitoAzienda || azienda.sito) dataContext += `- Sito web: ${sanitizeText(azienda.sitoAzienda || azienda.sito, 100)}\n`;
  }

  // --- FATTURA SOLLECITATA (per solleciti pagamento) ---
  if (req.body?.fattura_sollecitata) {
    const fs = req.body.fattura_sollecitata;
    dataContext += `\n## FATTURA OGGETTO DEL SOLLECITO\n`;
    if (fs.numeroFatturaCompleto) dataContext += `- Numero: ${fs.numeroFatturaCompleto}\n`;
    if (fs.importoTotale) dataContext += `- Importo: ${formatCurrency(fs.importoTotale)}\n`;
    if (fs.dataEmissione) dataContext += `- Emessa il: ${formatDate(fs.dataEmissione)}\n`;
    if (fs.dataScadenza) dataContext += `- Scadenza pagamento: ${formatDate(fs.dataScadenza)}\n`;
    if (fs.statoPagamento) dataContext += `- Stato: ${fs.statoPagamento}\n`;
  }

  // Costruisci il system prompt con le istruzioni AI personalizzate dall'admin
  const systemPrompt = `Sei un esperto di comunicazione aziendale italiana. Generi lettere professionali per Growapp S.r.l. (marchio "Comune.Digital"), un'azienda che sviluppa app per comuni italiani.

TIPO DI LETTERA RICHIESTA: ${sanitizeText(letterTypeInfo.nome, 200)}
${letterTypeInfo.descrizione ? sanitizeText(letterTypeInfo.descrizione, 500) : ''}

ISTRUZIONI GENERALI:
1. Scrivi in italiano formale (dare del "Lei" al destinatario)
2. Tono: professionale, orientato alla partnership, positivo e propositivo
3. Personalizza FORTEMENTE usando i dati forniti: cita numeri di contratto, importi, date, nomi dei comuni, statistiche di utilizzo
4. Se ci sono statistiche app, usale per dimostrare il VALORE del servizio (es. "la sua app ha registrato X download e Y utenti attivi")
5. Se ci sono fatture non pagate, menzionale con tatto se pertinente al tipo di lettera
6. Date in formato DD/MM/YYYY, importi in formato europeo (es. "€1.234,56")
7. Lunghezza: 300-500 parole per il corpo della lettera
8. NON inventare dati: usa SOLO le informazioni fornite

ISTRUZIONI SPECIFICHE PER QUESTO TIPO DI LETTERA:
${sanitizeText(letterTypeInfo.promptAI, 2000)}

${customInstructions ? `ISTRUZIONI AGGIUNTIVE DALL'UTENTE:\n${sanitizeText(customInstructions, 500)}\n` : ''}

FORMATO DI RISPOSTA — Rispondi SOLO con un JSON valido:
{
  "sections": {
    "salutation": "Spett.le [Nome Cliente],",
    "intro": "[Paragrafo introduttivo]",
    "body": "[Corpo principale della lettera - piu' paragrafi separati da \\n\\n]",
    "stats": "[Paragrafo statistiche app - SOLO se dati disponibili, altrimenti stringa vuota]",
    "closing": "[Paragrafo di chiusura con call to action]",
    "signature": "Cordiali saluti,\\n[Nome Azienda]"
  }
}

IMPORTANTE: Rispondi ESCLUSIVAMENTE con il JSON, nessun testo prima o dopo, nessun markdown.`;

  const userMessage = `Genera una lettera di tipo "${sanitizeText(letterTypeInfo.nome, 100)}" con i seguenti dati:\n${dataContext}`;

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
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[generate-letter] Errore API Anthropic:', response.status, errBody);
      return res.status(502).json({
        error: 'Errore dalla API Anthropic',
        status: response.status,
        detail: errBody.substring(0, 1000)
      });
    }

    const data = await response.json();
    const textContent = data.content?.[0]?.text || '{}';

    // Estrai il JSON dalla risposta
    let letterContent;
    try {
      const jsonMatch = textContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        letterContent = JSON.parse(jsonMatch[0]);
      } else {
        letterContent = JSON.parse(textContent);
      }
    } catch (parseErr) {
      console.error('[generate-letter] Errore parsing:', parseErr.message, 'Testo:', textContent.substring(0, 500));
      return res.status(502).json({ error: 'Risposta AI non valida', raw: textContent.substring(0, 300) });
    }

    // Validazione risposta
    if (!letterContent.sections) {
      return res.status(502).json({ error: 'Formato risposta AI non valido (mancano le sezioni)' });
    }

    const usage = data.usage || {};

    return res.status(200).json({
      sections: letterContent.sections,
      metadata: {
        letterType: letterTypeInfo.id,
        letterTypeName: letterTypeInfo.nome,
        clienteName: cliente.ragioneSociale,
        generatedAt: new Date().toISOString(),
        charCount: Object.values(letterContent.sections).join('').length
      },
      usage: {
        input_tokens: usage.input_tokens || 0,
        output_tokens: usage.output_tokens || 0
      }
    });

  } catch (err) {
    console.error('[generate-letter] Errore generico:', err);
    return res.status(500).json({ error: 'Errore interno del server', detail: err.message });
  }
};

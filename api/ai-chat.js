/**
 * Serverless Function — AI Chat Assistente CRM
 *
 * Chatbot AI per analisi dati app nel CRM Comune.Digital.
 * Riceve la domanda dell'utente + contesto dati e risponde con analisi intelligenti.
 *
 * Endpoint: POST /api/ai-chat
 * Body: { question, appCorrente, tutteLeApp, contesto }
 * Response: { answer, usage }
 *
 * Visibile solo a CTO, Amministratori e Super Admin.
 */

function removeLoneSurrogates(str) {
  if (!str) return '';
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = i + 1 < str.length ? str.charCodeAt(i + 1) : 0;
      if (next >= 0xDC00 && next <= 0xDFFF) {
        result += str[i] + str[i + 1];
        i++;
      }
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      // skip
    } else {
      result += str[i];
    }
  }
  return result;
}

function sanitizeText(raw, maxLen) {
  if (!raw) return '';
  let text = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ').replace(/&\w+;/g, ' ')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '$1')
    .replace(/[\uFFFD\uFFFE\uFFFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLen ? text.substring(0, maxLen) : text;
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/D';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'N/D';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  } catch (e) { return 'N/D'; }
}

function formatCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return 'N/D';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount);
}

/**
 * Costruisce il contesto dati dell'app corrente (dettagliato)
 */
function buildAppCorrenteContext(app) {
  if (!app) return '';
  let ctx = '\n## APP CORRENTE (dettaglio completo)\n';
  ctx += `- ID: ${app.id || 'N/D'}\n`;
  ctx += `- Nome: ${sanitizeText(app.nome, 200)}\n`;
  ctx += `- Comune: ${sanitizeText(app.comune, 100)}\n`;
  ctx += `- Provincia: ${sanitizeText(app.provincia, 50)}\n`;
  ctx += `- Regione: ${sanitizeText(app.regione, 50)}\n`;
  ctx += `- Stato: ${app.statoApp || 'N/D'}\n`;
  ctx += `- Popolazione: ${app.popolazione ? app.popolazione.toLocaleString('it-IT') : 'N/D'}\n`;

  // Statistiche
  const cache = app.gbStatsCache || {};
  const downloads = cache.totalDownloads || app.numDownloads || 0;
  const penetrazione = app.popolazione > 0 ? ((downloads / app.popolazione) * 100).toFixed(1) : 'N/D';
  ctx += `- Download totali: ${downloads}\n`;
  ctx += `- Penetrazione: ${penetrazione}%\n`;
  ctx += `- Lanci mensili: ${cache.launchesMonth || 0}\n`;
  ctx += `- Lanci unici mensili: ${cache.uniqueLaunchesMonth || 0}\n`;
  ctx += `- Page views mensili: ${cache.pageViewsMonth || 0}\n`;
  ctx += `- Consensi push: ${app.consensiPush || 0}\n`;

  // OS Distribution
  const osDist = cache.osDistribution || {};
  if (osDist.ios_devices_percentage || osDist.android_devices_percentage) {
    ctx += `- Distribuzione OS: iOS ${osDist.ios_devices_percentage || 0}%, Android ${osDist.android_devices_percentage || 0}%\n`;
  }

  // Date pubblicazione
  if (app.dataPubblicazioneApple) ctx += `- Pubblicazione Apple: ${formatDate(app.dataPubblicazioneApple)}\n`;
  if (app.dataPubblicazioneAndroid) ctx += `- Pubblicazione Android: ${formatDate(app.dataPubblicazioneAndroid)}\n`;

  // Scadenze
  if (app.scadenzaCertificatoApple) ctx += `- Scadenza Certificato Apple: ${formatDate(app.scadenzaCertificatoApple)}\n`;
  if (app.ultimaDataRaccoltaDifferenziata) ctx += `- Scadenza Raccolta Differenziata: ${formatDate(app.ultimaDataRaccoltaDifferenziata)}\n`;
  if (app.ultimaDataFarmacieTurno) ctx += `- Scadenza Farmacie di Turno: ${formatDate(app.ultimaDataFarmacieTurno)}\n`;
  if (app.ultimaDataNotificheFarmacie) ctx += `- Scadenza Notifiche Farmacie: ${formatDate(app.ultimaDataNotificheFarmacie)}\n`;
  if (app.altraScadenzaData) ctx += `- Altra Scadenza (${sanitizeText(app.altraScadenzaNote, 50) || 'N/D'}): ${formatDate(app.altraScadenzaData)}\n`;

  // Funzionalita
  ctx += `- Gruppo Telegram: ${app.hasGruppoTelegram === true || app.hasGruppoTelegram === 'true' ? 'Si' : 'No'}\n`;
  ctx += `- Avvisi Flash: ${app.hasAvvisiFlash === true || app.hasAvvisiFlash === 'true' ? 'Si' : 'No'}\n`;

  // Feed RSS
  if (Array.isArray(app.feedRss) && app.feedRss.length > 0) {
    ctx += `- Feed RSS configurati: ${app.feedRss.length} (${app.feedRss.map(f => sanitizeText(f.nome, 50) || 'senza nome').join(', ')})\n`;
  }

  // QA
  if (app.dataUltimoControlloQualita) {
    ctx += `- Ultimo controllo qualita: ${formatDate(app.dataUltimoControlloQualita)}`;
    ctx += ` — Esito: ${app.controlloQualitaNegativo === true || app.controlloQualitaNegativo === 'true' ? 'NEGATIVO' : 'Positivo'}\n`;
    if (app.noteControlloQualita) ctx += `- Note QA: ${sanitizeText(app.noteControlloQualita, 300)}\n`;
  }

  // Commerciale
  if (app.referenteComune) ctx += `- Referente comune: ${sanitizeText(app.referenteComune, 100)}\n`;
  if (app.tipoPagamento) ctx += `- Tipo pagamento: ${app.tipoPagamento}\n`;

  // Note
  if (app.note1) ctx += `- Note 1: ${sanitizeText(app.note1, 300)}\n`;
  if (app.note2) ctx += `- Note 2: ${sanitizeText(app.note2, 300)}\n`;

  return ctx;
}

/**
 * Costruisce il contesto sintetico di tutte le app
 */
function buildTutteLeAppContext(apps) {
  if (!apps || !Array.isArray(apps) || apps.length === 0) return '';

  let ctx = `\n## TUTTE LE APP NEL CRM (${apps.length} totali)\n`;
  ctx += `Formato: [Nome] | Comune (Prov) | Stato | Download | Popolazione | Penetrazione | PubblApple | PubblAndroid | ScadCertApple\n\n`;

  for (const app of apps) {
    const downloads = (app.gbStatsCache?.totalDownloads) || app.numDownloads || 0;
    const pop = app.popolazione || 0;
    const pen = pop > 0 ? ((downloads / pop) * 100).toFixed(1) + '%' : 'N/D';

    ctx += `- ${sanitizeText(app.nome, 80)} | ${sanitizeText(app.comune, 50)} (${app.provincia || '?'}) | ${app.statoApp || '?'} | DL:${downloads} | Pop:${pop} | Pen:${pen}`;
    if (app.dataPubblicazioneApple) ctx += ` | PubApple:${formatDate(app.dataPubblicazioneApple)}`;
    if (app.dataPubblicazioneAndroid) ctx += ` | PubAndroid:${formatDate(app.dataPubblicazioneAndroid)}`;
    if (app.scadenzaCertificatoApple) ctx += ` | CertApple:${formatDate(app.scadenzaCertificatoApple)}`;
    if (app.ultimaDataRaccoltaDifferenziata) ctx += ` | RaccDiff:${formatDate(app.ultimaDataRaccoltaDifferenziata)}`;
    if (app.ultimaDataFarmacieTurno) ctx += ` | Farm:${formatDate(app.ultimaDataFarmacieTurno)}`;
    if (app.dataUltimoControlloQualita) ctx += ` | QA:${formatDate(app.dataUltimoControlloQualita)}${app.controlloQualitaNegativo === true || app.controlloQualitaNegativo === 'true' ? '(KO)' : ''}`;
    if (app.consensiPush) ctx += ` | Push:${app.consensiPush}`;
    ctx += '\n';
  }

  return ctx;
}

/**
 * Costruisce contesto aggiuntivo (clienti, contratti, fatture, scadenze, task)
 */
function buildContestoExtra(contesto) {
  if (!contesto) return '';
  let ctx = '';

  // === CLIENTI ===
  if (contesto.clienti && Array.isArray(contesto.clienti) && contesto.clienti.length > 0) {
    ctx += `\n## TUTTI I CLIENTI (${contesto.clienti.length} totali)\n`;
    ctx += `Formato: [RagioneSociale] | Tipo | Comune (Prov) | Agente | Stato | Residenti\n\n`;
    for (const c of contesto.clienti) {
      ctx += `- ${sanitizeText(c.ragioneSociale, 80)} | ${c.tipo || '?'} | ${sanitizeText(c.comune, 50)} (${c.provincia || '?'})`;
      if (c.agente) ctx += ` | Agente: ${sanitizeText(c.agente, 40)}`;
      if (c.statoContratto) ctx += ` | Stato: ${c.statoContratto}`;
      if (c.numResidenti) ctx += ` | Residenti: ${c.numResidenti}`;
      if (c.email) ctx += ` | Email: ${sanitizeText(c.email, 60)}`;
      ctx += '\n';
    }
  }

  // === CONTRATTI ===
  if (contesto.contratti && Array.isArray(contesto.contratti) && contesto.contratti.length > 0) {
    ctx += `\n## TUTTI I CONTRATTI (${contesto.contratti.length} totali)\n`;
    ctx += `Formato: [NumContratto] | Oggetto | Cliente | Stato | Importo annuale | Inizio | Scadenza | Tipologia | Pagamento\n\n`;
    for (const c of contesto.contratti) {
      ctx += `- ${sanitizeText(c.numeroContratto, 30)} | ${sanitizeText(c.oggetto, 60)} | ${sanitizeText(c.clienteRagioneSociale, 50)} | ${c.stato || '?'} | ${formatCurrency(c.importoAnnuale)}`;
      ctx += ` | Inizio: ${formatDate(c.dataInizio)} | Scadenza: ${formatDate(c.dataScadenza)}`;
      if (c.tipologia) ctx += ` | Tipo: ${c.tipologia}`;
      if (c.modalitaPagamento) ctx += ` | Pag: ${c.modalitaPagamento}`;
      if (c.periodicita) ctx += ` | ${c.periodicita}`;
      ctx += '\n';
    }
  }

  // === FATTURE ===
  if (contesto.fatture && Array.isArray(contesto.fatture) && contesto.fatture.length > 0) {
    ctx += `\n## TUTTE LE FATTURE (${contesto.fatture.length} totali)\n`;
    ctx += `Formato: [NumFattura] | Cliente | Importo | Stato | Emessa | Scadenza | Anno\n\n`;
    for (const f of contesto.fatture) {
      ctx += `- ${sanitizeText(f.numeroFatturaCompleto, 30)} | ${sanitizeText(f.clienteRagioneSociale, 50)} | ${formatCurrency(f.importoTotale)} | ${f.statoPagamento || '?'}`;
      ctx += ` | Emessa: ${formatDate(f.dataEmissione)}`;
      if (f.dataScadenza) ctx += ` | Scad: ${formatDate(f.dataScadenza)}`;
      if (f.anno) ctx += ` | Anno: ${f.anno}`;
      if (f.statoPagamento === 'PARZIALMENTE_PAGATA' && f.saldoResiduo) ctx += ` | Residuo: ${formatCurrency(f.saldoResiduo)}`;
      if (f.dataPagamento) ctx += ` | Pagata il: ${formatDate(f.dataPagamento)}`;
      ctx += '\n';
    }
  }

  // === SCADENZARIO ===
  if (contesto.scadenze && Array.isArray(contesto.scadenze) && contesto.scadenze.length > 0) {
    ctx += `\n## SCADENZARIO (${contesto.scadenze.length} scadenze non completate)\n`;
    ctx += `Formato: [Tipo] | Data | Cliente | Agente | Importo | Descrizione\n\n`;
    for (const s of contesto.scadenze) {
      ctx += `- [${s.tipo || '?'}] ${formatDate(s.dataScadenza)} | ${sanitizeText(s.clienteRagioneSociale, 50)}`;
      if (s.agente) ctx += ` | Agente: ${sanitizeText(s.agente, 30)}`;
      if (s.importo) ctx += ` | ${formatCurrency(s.importo)}`;
      if (s.descrizione) ctx += ` | ${sanitizeText(s.descrizione, 100)}`;
      ctx += '\n';
    }
  }

  // === TASK (per app corrente, se presente) ===
  if (contesto.tasks && Array.isArray(contesto.tasks) && contesto.tasks.length > 0) {
    ctx += `\n## TASK DELL'APP CORRENTE (${contesto.tasks.length} totali)\n`;
    for (const t of contesto.tasks.slice(0, 30)) {
      ctx += `- [${t.stato || '?'}] ${sanitizeText(t.titolo, 100)}`;
      if (t.scadenza) ctx += ` | Scadenza: ${formatDate(t.scadenza)}`;
      if (t.assegnatoA) ctx += ` | Assegnato: ${sanitizeText(t.assegnatoA, 50)}`;
      ctx += '\n';
    }
  }

  // Checklist Carta d'Identita
  if (contesto.cartaIdentita) {
    const ci = contesto.cartaIdentita;
    ctx += `\n## CHECKLIST SVILUPPO (Carta d'Identita)\n`;
    ctx += `- Completamento: ${ci.completati || 0}/${ci.totali || 0} (${ci.percentuale || 0}%)\n`;
    if (ci.mancanti && ci.mancanti.length > 0) {
      ctx += `- Item mancanti: ${ci.mancanti.slice(0, 15).join('; ')}\n`;
    }
  }

  return ctx;
}


module.exports = async function handler(req, res) {

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo non consentito. Usa POST.' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[ai-chat] ANTHROPIC_API_KEY non configurata');
    return res.status(500).json({ error: 'Chiave API non configurata sul server.' });
  }

  const { question, appCorrente, tutteLeApp, contesto, conversationHistory } = req.body || {};

  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return res.status(400).json({ error: 'Domanda mancante o vuota.' });
  }

  // Costruisci il contesto dati completo
  let dataContext = '';
  dataContext += buildAppCorrenteContext(appCorrente);
  dataContext += buildTutteLeAppContext(tutteLeApp);
  dataContext += buildContestoExtra(contesto);

  const oggi = new Date();
  const oggiStr = `${String(oggi.getDate()).padStart(2, '0')}/${String(oggi.getMonth() + 1).padStart(2, '0')}/${oggi.getFullYear()}`;

  const systemPrompt = `Sei l'assistente AI del CRM Comune.Digital di Growapp S.r.l.
Il tuo ruolo e' aiutare CTO e amministratori ad analizzare TUTTI i dati del CRM: app comunali, clienti, contratti, fatture e scadenze.

DATA DI OGGI: ${oggiStr}

HAI ACCESSO AI SEGUENTI DATI:
${dataContext}

ISTRUZIONI:
1. Rispondi SEMPRE in italiano
2. Usa i dati forniti per rispondere in modo preciso e specifico — NON inventare dati
3. Quando fai elenchi, usa formato tabellare o ordinato con date in formato DD/MM/YYYY
4. Se una domanda richiede dati che non hai, dillo chiaramente
5. Per le analisi, fornisci numeri concreti e suggerimenti pratici
6. Quando confronti app, usa metriche chiare (download, penetrazione, ecc.)
7. Per le scadenze, calcola i giorni mancanti/passati rispetto alla data di oggi
8. Formatta gli importi in formato europeo (es. 1.234,56 EUR)
9. Sii conciso ma completo — le risposte devono essere operative e utili
10. Se ti chiedono classifiche o ordinamenti, mostrali chiaramente numerati
11. Puoi fare calcoli, confronti, medie, tendenze e suggerimenti strategici
12. Rispondi in testo semplice formattato, senza markdown con ### o **bold** — usa solo testo piano con trattini per le liste
13. Per domande su fatturato, incassi, pagamenti: usa i dati delle fatture e contratti disponibili
14. Per domande su clienti: puoi incrociare dati clienti con contratti e fatture per analisi complete
15. Per lo scadenzario: evidenzia le scadenze gia' passate (scadute) rispetto a oggi`;

  // Costruisci i messaggi (supporta storico conversazione)
  const messages = [];

  // Aggiungi lo storico conversazione se presente
  if (conversationHistory && Array.isArray(conversationHistory)) {
    for (const msg of conversationHistory.slice(-10)) { // Max ultimi 10 messaggi
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({
          role: msg.role,
          content: sanitizeText(msg.content, msg.role === 'user' ? 500 : 3000)
        });
      }
    }
  }

  // Aggiungi la domanda corrente
  messages.push({ role: 'user', content: sanitizeText(question, 1000) });

  try {
    let requestBody = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages
    });
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
      console.error('[ai-chat] Errore API Anthropic:', response.status, errBody);
      let errorMessage = errBody.substring(0, 1000);
      try {
        const errJson = JSON.parse(errBody);
        errorMessage = (errJson.error && errJson.error.message) || errorMessage;
      } catch(e) { /* non JSON */ }
      return res.status(502).json({
        error: 'Errore dalla API Anthropic',
        status: response.status,
        detail: errorMessage
      });
    }

    const data = await response.json();
    const answer = data.content?.[0]?.text || 'Nessuna risposta generata.';
    const usage = data.usage || {};

    return res.status(200).json({
      answer: answer,
      usage: {
        input_tokens: usage.input_tokens || 0,
        output_tokens: usage.output_tokens || 0
      }
    });

  } catch (err) {
    console.error('[ai-chat] Errore generico:', err);
    return res.status(500).json({ error: 'Errore interno del server', detail: err.message });
  }
};

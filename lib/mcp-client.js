/**
 * Client MCP minimo (lato server) per chiamare DIRETTAMENTE gli strumenti GoodBarber,
 * senza passare da Claude: serve per i lavori ripetitivi e "meccanici" (es. creare 300 avvisi
 * della differenziata), dove il calcolo lo fa il codice e non serve intelligenza.
 * Uso: const c = await apriSessione(mcpUrl, accessToken); const r = await c.chiama('cms_list_events', {...});
 */

async function rpc(url, token, body, sessionId) {
  const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  if (sessionId) h['Mcp-Session-Id'] = sessionId;
  const r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body) });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {
    const line = text.split('\n').filter(l => l.startsWith('data:')).pop();
    if (line) { try { json = JSON.parse(line.slice(5)); } catch (_) {} }
  }
  return { status: r.status, sessionId: r.headers.get('mcp-session-id') || sessionId, json };
}

async function apriSessione(mcpUrl, accessToken) {
  const init = await rpc(mcpUrl, accessToken, { jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'crm-comune-digital', version: '1.0' } } });
  if (init.status >= 300) throw new Error('Connessione MCP rifiutata (HTTP ' + init.status + ')');
  const sid = init.sessionId;
  await rpc(mcpUrl, accessToken, { jsonrpc: '2.0', method: 'notifications/initialized' }, sid);
  let id = 10;
  return {
    async chiama(nome, args) {
      const r = await rpc(mcpUrl, accessToken, { jsonrpc: '2.0', id: id++, method: 'tools/call', params: { name: nome, arguments: args || {} } }, sid);
      const res = r.json && r.json.result;
      if (!res) throw new Error(nome + ': risposta non valida (HTTP ' + r.status + ')' + (r.json && r.json.error ? ' ' + JSON.stringify(r.json.error).slice(0, 200) : ''));
      const testo = Array.isArray(res.content) ? res.content.map(c => c.text || '').join('\n') : '';
      if (res.isError) throw new Error(nome + ': ' + testo.slice(0, 300));
      try { return JSON.parse(testo); } catch (_) { return testo; }
    }
  };
}

module.exports = { apriSessione };

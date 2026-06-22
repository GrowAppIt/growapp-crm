#!/usr/bin/env bash
# Test diretto della chiave API GoodBarber contro il suo server MCP.
# La chiave NON viene mostrata a schermo e NON viene salvata da nessuna parte:
# resta solo in questo terminale e parte verso GoodBarber.
#
# Uso:  bash scripts/test-mcp-key.sh
set -uo pipefail

DEFAULT_URL="https://mcp.ww-api.com/376069/mcp/sse"   # Cefalù

read -r -p "URL server MCP [${DEFAULT_URL}]: " MCP_URL
MCP_URL="${MCP_URL:-$DEFAULT_URL}"

# Chiave digitata in modo nascosto (non appare a schermo)
read -r -s -p "Incolla la chiave API (usa 'Copia chiave' su GoodBarber), poi Invio: " MCP_KEY
echo

# --- Diagnostica sulla FORMA della chiave (senza rivelarla) ---
LEN=${#MCP_KEY}
DOTS=$(printf '%s' "$MCP_KEY" | tr -cd '.' | wc -c | tr -d ' ')
HEAD=$(printf '%s' "$MCP_KEY" | cut -c1-6)
TAIL=$(printf '%s' "$MCP_KEY" | rev | cut -c1-4 | rev)
echo
echo "── Forma della chiave ─────────────────────────────"
echo "Lunghezza: $LEN caratteri"
echo "Punti (.): $DOTS   (un JWT valido ne ha 2)"
echo "Inizio: ${HEAD}…   Fine: …${TAIL}"
if [ "$DOTS" -ne 2 ]; then
  echo "⚠️  ATTENZIONE: un JWT valido ha esattamente 2 punti. Qui ne ho contati $DOTS → chiave probabilmente troncata/sbagliata."
fi
if [ "$LEN" -lt 100 ]; then
  echo "⚠️  ATTENZIONE: la chiave è molto corta ($LEN). I JWT di GoodBarber sono in genere lunghi 200+ caratteri → probabilmente troncata."
fi
echo

# --- Test 1: SSE (GET) ---
echo "── Test 1: connessione SSE (GET) ──────────────────"
curl -sS -o /dev/null -D - --max-time 12 \
  -H "Authorization: Bearer ${MCP_KEY}" \
  -H "Accept: text/event-stream" \
  "$MCP_URL" 2>&1 | sed -n '1,12p'
echo

# --- Test 2: Streamable HTTP (POST initialize) ---
echo "── Test 2: initialize (POST JSON-RPC) ─────────────"
POST_URL="${MCP_URL%/sse}"   # molti server usano la stessa base senza /sse per il POST
curl -sS -D - --max-time 12 \
  -H "Authorization: Bearer ${MCP_KEY}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -X POST "$POST_URL" \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"crm-test","version":"1.0"}}}' \
  2>&1 | sed -n '1,30p'
echo
echo "── Fine. Cosa guardare ────────────────────────────"
echo "• HTTP/.. 200 (o uno stream di eventi)  = chiave OK ✅"
echo "• HTTP/.. 401 / 403 / 'Unauthorized'    = chiave rifiutata ❌ (ri-copiala con 'Copia chiave')"
echo "• HTTP/.. 404                            = URL sbagliato"

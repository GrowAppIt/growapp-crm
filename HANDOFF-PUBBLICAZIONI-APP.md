# Handoff — "Pubblicazioni sulle app" (chat MCP)

_Ultimo aggiornamento: sessione del 21/06/2026 · CRM versione 10.1.2 · codice committato._

## Obiettivo
Dare al CRM Comune.Digital una sezione **"Pubblicazioni sulle app"**: una chat (Claude) collegata, per ogni app GoodBarber, al **suo server MCP**, per agevolare chi ogni giorno carica a mano gli eventi sulle app. Principio di sicurezza: **fonte → Claude prepara una BOZZA → l'operatore conferma → si pubblica**. L'assistente non pubblica mai da solo.

## Decisioni prese (con l'utente)
- **Architettura: MCP connector** dell'API Messages di Anthropic (Anthropic si collega al server MCP dell'app). Non l'API classica.
- **Modello: `claude-sonnet-4-6`**.
- **Sicurezza prima versione: "semplice"** = chiave R-W + regole nel system prompt + conferma esplicita per pubblicare/cancellare. (Le bozze non sono pubbliche.)
- **Credenziali per app**: inserite nella **scheda della singola app** (non in una pagina globale).
- Un evento va **quasi sempre su una sola app**.

## Scoperta DEFINITIVA (22/06/2026 — non ricaderci): il server MCP è OAuth, NON chiave statica
La vecchia teoria "la Chiave API è un JWT statico Bearer, basta Copia chiave" era **SBAGLIATA** ed è la **causa del calvario ricorrente "chiave tronca"**. La verità, provata sul server:
- POST al server MCP risponde `401` con `www-authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource/376069/mcp/sse"` → è un **OAuth Protected Resource**. La chiave statica del back-office (100 caratteri, 1 punto) viene **sempre** rifiutata: è il tipo di credenziale sbagliato.
- Metadati auth server (`https://mcp.ww-api.com/376069/.well-known/oauth-authorization-server`): grant `authorization_code` + `refresh_token` (NIENTE `client_credentials`), PKCE S256, client pubblico (`token_endpoint_auth_method: none`), endpoint `/authorize` `/token` `/register` sotto `.../376069/`.
- **SOLUZIONE**: login OAuth interattivo **una volta** per app (con `scripts/mcp-login.js`) → si ottiene un **refresh_token**; il backend lo usa per generare access_token freschi e restare headless. Niente più "Copia chiave".

## Cosa è stato costruito (file toccati)
- **UI credenziali** — `public/js/pages/dettaglio-app.js`
  - `renderConfigurazioneApp`: nuova sezione **"Collegamento MCP"** con campi *URL Server MCP* e *Chiave API (R-W)* (chiave mascherata se già presente).
  - `salvaConfigApp`: salva `mcpServerUrl` e `mcpApiKey` su Firestore (la chiave si aggiorna **solo** se ne digiti una nuova).
- **Backend (motore)** — `api/app-publish-chat.js` (NUOVO)
  - Legge `mcpServerUrl` + `mcpApiKey` dal doc app **lato server** (firebase-admin), mai dal browser.
  - Chiama `api.anthropic.com/v1/messages` con beta `mcp-client-2025-11-20`, `mcp_servers:[{type:url,name:goodbarber,url,authorization_token:<chiave>}]`, `tools:[{type:mcp_toolset,mcp_server_name:goodbarber}]`, modello `claude-sonnet-4-6`, system prompt = playbook di sicurezza. Gestisce `pause_turn`.
- **Chat (frontend)** — `public/js/pages/pubblicazioni-app.js`
  - `_sendMessage` collegato a `/api/app-publish-chat` (invia `appId` + cronologia in formato API, spinner di attesa, salva il turno assistant).
  - Badge app: **"Collegata / Da collegare"** in base a `mcpServerUrl` + `mcpApiKey`.
- **Collegamenti** — `public/index.html` (voce menu "Pubblicazioni sulle app", `<script>`, `APP_VERSION` 10.1.2), `public/js/ui.js` (case routing), `public/js/auth.js` (permessi pagina).
- **Config** — `vercel.json`: `api/app-publish-chat.js` con `maxDuration 60`, `memory 1024`.

Campi nuovi nel doc Firestore `app`: **`mcpServerUrl`**, **`mcpApiKey`**.
Env già presenti e usate: `ANTHROPIC_API_KEY`, `FIREBASE_*` (service account).

## Come provare (CRM 10.1.3, dopo il deploy)
0. **Login OAuth una-tantum** (sul Mac, nel repo): `node scripts/mcp-login.js` → si apre il browser, accedi/approvi su GoodBarber → lo script stampa **Client ID** e **Refresh Token** e conferma `initialize → HTTP 200 ✅`.
1. **App → Cefalù → Configurazione App → Collegamento MCP**: incolla **URL** (`https://mcp.ww-api.com/376069/mcp/sse`), **Client ID** e **Refresh Token**. Salva.
2. **Pubblicazioni sulle app → Cefalù** → prova in **sola lettura**: _"leggi cosa c'è negli eventi da oggi in poi"_.
   - Se elenca gli eventi/sezioni → il collegamento funziona. ✅
3. **Per ogni altra app**: rifare `node scripts/mcp-login.js "<URL MCP di quell'app>"` e incollare i suoi Client ID + Refresh Token nella sua scheda.

## Cosa resta (prossimi step)
1. **Esito prova di lettura** (la riferisce l'utente).
2. Se ok → **prima bozza di evento end-to-end** (da email/locandina → bozza → conferma).
3. Estendere la configurazione **alle altre app**.
4. (Opzionale) **Hardening sicurezza**: oggi `mcpApiKey` sta nel doc app, leggibile anche client-side (come già il vecchio token GoodBarber e le password Apple). Valutare collezione separata / regole Firestore.
5. (Opzionale) Allowlist degli strumenti MCP (disabilitare cancellazione/pubblicazione lato Claude per sicurezza extra).
6. Gestione **IT/EN** per eventi turistici.

## Rischi / cose da osservare
- **Auth**: atteso `Authorization: Bearer <JWT>` (token statico) → dovrebbe funzionare al primo colpo. Se desse errore di autenticazione, controllare prima di tutto che la chiave **non sia troncata**.
- **Timeout**: turni con molti strumenti potrebbero avvicinarsi ai 60s della function.
- **Cache GoodBarber**: dopo una scrittura, il singolo `get` può essere in cache qualche minuto → verificare con la **lista/ricerca** (già previsto nel system prompt).

## Come riprendere in un'altra sessione
1. In una nuova chat, dì qualcosa come: **"riprendiamo le Pubblicazioni sulle app del CRM"**. La memoria persistente richiama il contesto (vedi nota `crm-pubblicazioni-app-mcp`).
2. Riferisci **com'è andata la prova di lettura**:
   - ✅ se ha elencato le sezioni → procediamo con la **bozza di evento**.
   - ❌ se ha dato errore → **incolla il messaggio d'errore esatto** mostrato in chat (così diagnostichiamo sul fatto, senza tentativi a naso).
3. Questo file (`HANDOFF-PUBBLICAZIONI-APP.md`) è il riepilogo completo del punto in cui siamo.

# Handoff — "Pubblicazioni sulle app" (chat MCP del CRM)

_Ultimo aggiornamento: 11/10/2026 · CRM versione **10.6.3** pubblicata · tutto committato._

> Per riprendere: in una nuova sessione scrivi **"riprendiamo le Pubblicazioni sulle app: leggi HANDOFF-PUBBLICAZIONI-APP.md"**.
> Giancarlo NON è sviluppatore: un passo alla volta, linguaggio semplice, aspettare il suo "fatto". Pubblica lui da GitHub Desktop (Claude non committa/pusha). Dopo ogni push controllare che la versione sia online prima di testare (Vercel impiega 1–4 minuti).

## Com'è fatto oggi
- **Pagina CRM**: Pubblicazioni sulle app (`public/js/pages/pubblicazioni-app.js`) + Scheda Comune / Calendario (`public/js/pages/pubblicazioni-scheda.js`).
- **Chat**: `api/app-publish-chat.js` → API Messages con **MCP connector** verso il server MCP GoodBarber dell'app.
  - Modello **`claude-opus-5-5`** (deciso con Giancarlo), `cache_control` automatico (≈0,04 $ a richiesta invece di ≈1 $), `fallbacks: "default"` (beta `server-side-fallback-2026-07-01` insieme a `mcp-client-2025-11-20`), `max_tokens` 16000, `maxDuration` 300.
  - **Sicurezza**: serve login CRM (Firebase ID token) con ruolo SUPER_ADMIN/ADMIN/CTO/SVILUPPATORE/CONTENT_MANAGER; CORS solo crm.comune.digital. Strumenti GoodBarber **tolti** all'assistente: 3 push, cancellazioni di interi contenuti, prenotazioni (`STRUMENTI_DISATTIVATI`).
  - Prompt: bozze sempre; data di oggi; **regola orari**: l'ora di INIZIO evento = ora della notifica push (anticipata, nascosta), l'orario reale va nel TITOLO, l'anticipo lo si chiede ogni volta; testi curati in HTML + **inglese in corsivo** sotto `<hr>`; locandine (immagine allegata → paragrafo foto); **punti mappa** con punto modello (copia TUTTE le categorie incl. quella generale/filtro, stile HTML del testo, icona pin) + strumento CRM `trova_coordinate` (`lib/geocodifica.js`, OpenStreetMap); Scheda Comune iniettata nel prompt.
  - La risposta include `nuoviMessaggi`: il browser li accoda tutti (cronologia append-only, necessaria per Opus 5.5).
- **UI chat**: risposte impaginate (markdown sicuro, link cliccabili), graffetta "Allega locandina" (upload su Storage `documenti/app/{id}/pubblicazione_{ts}.jpg`: le regole Storage NON ammettono sottocartelle), pulsanti rapidi (Nuovo evento, Avviso differenziata straordinario, Nuovo punto mappa, Aggiungi l'inglese, Controlla la settimana).
- **Lasciapassare MCP**: `lib/mcp-token.js`. GoodBarber **ruota il refresh_token a ogni uso** e lo fa **scadere dopo ~30 giorni** → lucchetto per app (`mcpRinnovoLockFino/Di`) + salvataggio immediato; cron settimanale `api/mcp-keepalive.js` (lunedì 03:10 UTC), esito in `app.mcpStato/mcpUltimoRinnovo/mcpUltimoErrore` e `sistema/mcpKeepalive`.
- **Collegamenti**: 110/110 app attive collegate (procedura in `scripts/mcp-collega/ISTRUZIONI.md`). Identità verificata con `scripts/mcp-collega/verifica-identita.js` (sola lettura su GB). Manca solo Italo Greek Monasteries (senza webzineId).
- **Calendario differenziata**: `api/calendario-ricorrente.js` (azioni `sezioni`, `anteprima`, `crea`, `proponi`), calcolo puro in `lib/calendario.js` (festivi nazionali + Pasqua, festività locali, eccezioni, frequenze settimanale/quindicinale/mensile, zone, fuso Europe/Rome), creazione diretta via `lib/mcp-client.js` a lotti di 40, dedup per `categoria|data|titolo`. Regole in `app/{id}.schedaComune.differenziata`. "Proponi le regole" legge le ultime 14 settimane di avvisi. Scheda di **Cefalù già compilata** (non creati avvisi: il test lo fa Giancarlo).
- **Prove locali**: `scripts/banco-prova/prova-modello.js <modello> <docIdApp> "<domanda>"` (stessa richiesta della produzione; env `FALLBACK=1`, `IMG=<url>`). Chiave API di prova in `scripts/banco-prova/chiave.txt` (gitignored, **scade a metà novembre 2026**, chiave non legata a un workspace → header `anthropic-workspace-id: wrkspc_01HFKPWGSjcNz9t6zxVDpYMq`).

## PROSSIMO PASSO — "Allineatore mappa generale" (punto 6)
Scoperto su **Città della Spezia** (docId `P5nsfHzjIr6fpEjQHawz`, webzine 3954832): la mappa generale è una normale **sezione mappa chiamata "Mappa"** (id sezione 67497103). I punti ci entrano perché **spuntati anche lì**, oltre alla loro mappa (Visit, Utilità, Food&Drink…). Numeri: 611 punti totali, 249 nella "Mappa" generale, 293 in più sezioni. Le mappe restano separate perché ognuna ha il suo feed RSS (es. Visit → "Scopri" di Esplora).
Da costruire (stesso schema del calendario):
1. Nella **Scheda Comune**: scelta della **sezione mappa generale** e di **quali mappe vi confluiscono**.
2. Azione `anteprima` (nuovo endpoint o azione in `calendario-ricorrente.js`): elenca i punti delle mappe scelte che NON hanno la categoria della generale.
3. Azione `allinea`: `cms_update_map` con `categories` = categorie attuali + categoria della generale (mai togliere categorie), a lotti, con barra di avanzamento.
4. Regola nel prompt: i nuovi punti mappa vanno spuntati anche nella generale se la loro mappa vi confluisce.
Attenzione: chiedere a Giancarlo se ci sono mappe da ESCLUDERE dalla generale (es. Emergenze, Aree di emergenza).

## Altri punti aperti
- Vecchio campo `mcpApiKey` (chiave statica GB) ancora nel doc di Cefalù, leggibile dal client: da togliere e valutare la revoca del set "MCP CEFALU"/"CMP" (decide Giancarlo).
- I refresh token stanno nel doc `app` leggibile lato client: spostarli in una collezione protetta (tocca app-publish-chat, mcp-token, collega-app, dettaglio-app).
- Il modulo "Configurazione App" in `dettaglio-app.js` **inventa gli URL** dal nome se mancano: correggere.
- Booking senza spunta sui set delle app collegate prima di Diamante.
- Nomi GB da sistemare: "Santo Stefano di Magra di Magra", "Villa San Giovann".
- 2 file di prova 10×10 px in Storage `documenti/app/ahsLdIWDeljJRQN66GDj/` (Zambrone), non cancellabili dal client.
- Ottimizzazione: in `crea` del calendario la rilettura degli esistenti costa ~40 s per lotto su app grandi.

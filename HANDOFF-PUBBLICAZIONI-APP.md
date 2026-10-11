# Handoff — "Pubblicazioni sulle app" (chat MCP del CRM)

_Ultimo aggiornamento: 11/10/2026 · CRM **10.7.0** (allineatore mappa generale) scritto, **NON ancora pubblicato** né provato in scrittura._

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

## Allineatore mappa generale (v10.7.0 — scritto, da pubblicare e collaudare)
Scoperto su **Città della Spezia** (docId `P5nsfHzjIr6fpEjQHawz`): la mappa generale è una normale sezione mappa ("Mappa", id 67497103, categoria 14014404); i punti ci compaiono solo se hanno spuntata anche quella categoria.
- **Scheda Comune** → blocco "Mappa generale": spunta, scelta sezione›categoria della generale (proposta in automatico se si chiama "Mappa"), caselle delle mappe che vi confluiscono. Escluse di default (ma spuntabili): emergenze, protezione civile, aree di attesa/ricovero/ammassamento, C.O.C. Salvato in `app/{id}.schedaComune.mappaGenerale = { attiva, sezioneId, categoriaId, titolo, sorgenti:[{id,titolo}] }`.
- **Pulsante "Allinea mappa generale"** nella chat → `api/calendario-ricorrente.js` azioni `mappa-anteprima` (legge tutti i punti, ~30 s per 600 punti) e `mappa-allinea` (max 40 id per chiamata; il server rilegge i punti con `cms_list_maps` filtro id e manda `cms_update_map` con categorie attuali + quella della generale, mai togliere). Calcolo puro in `lib/mappa-generale.js`.
- **Prompt chat**: se la scheda ha la mappa generale, i nuovi punti nelle mappe sorgenti prendono anche la categoria della generale.
- Prova in sola lettura su La Spezia (11/10): 611 punti, 249 già nella generale, 243 da aggiungere (95 Presidi e Servizi Locali, 55 Rifornimenti e Colonnine, 33 DAE, 25 Scuole…). Da decidere con Giancarlo quali mappe spuntare prima di allineare.
- **Collaudo da fare**: pubblicare, aprire La Spezia → Scheda Comune → impostare → Anteprima → allineare prima una mappa piccola (es. Associazioni) e controllare su GoodBarber che il punto compaia in entrambe le mappe e che nulla sia sparito.

## Altri punti aperti
- Vecchio campo `mcpApiKey` (chiave statica GB) ancora nel doc di Cefalù, leggibile dal client: da togliere e valutare la revoca del set "MCP CEFALU"/"CMP" (decide Giancarlo).
- I refresh token stanno nel doc `app` leggibile lato client: spostarli in una collezione protetta (tocca app-publish-chat, mcp-token, collega-app, dettaglio-app).
- Il modulo "Configurazione App" in `dettaglio-app.js` **inventa gli URL** dal nome se mancano: correggere.
- Booking senza spunta sui set delle app collegate prima di Diamante.
- Nomi GB da sistemare: "Santo Stefano di Magra di Magra", "Villa San Giovann".
- 2 file di prova 10×10 px in Storage `documenti/app/ahsLdIWDeljJRQN66GDj/` (Zambrone), non cancellabili dal client.
- Ottimizzazione: in `crea` del calendario la rilettura degli esistenti costa ~40 s per lotto su app grandi.

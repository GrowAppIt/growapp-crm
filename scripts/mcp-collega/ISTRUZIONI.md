# Collegare le app GoodBarber all'MCP del CRM — istruzioni per Claude

> Quando Giancarlo chiede di **"collegare le app all'MCP"** (o "riprendiamo i collegamenti", "gruppo successivo"…), segui QUESTO file. Il modello è Cefalù: ogni app collegata può poi essere usata dalla pagina CRM **"Pubblicazioni sulle app"** (`api/app-publish-chat.js`).

## 1. Come funziona (in breve)

- Il server MCP di GoodBarber è **OAuth**, non accetta chiavi statiche: per ogni app serve un'autorizzazione una tantum. Al termine si ottiene un *refresh token* ("lasciapassare permanente").
- La pagina di autorizzazione GoodBarber (`https://mcp.ww-api.com/<webzineId>/authorize…`) chiede la **chiave API** dell'app. La chiave si crea nel back office dell'app in **Impostazioni → MCP Server & API pubbliche**.
- Lo script `collega-app.js` fa tutto il resto:
  1. ricava l'URL MCP da `goodbarberWebzineId`;
  2. registra il client;
  3. scrive il link di autorizzazione in `auth-url.txt`;
  4. aspetta il ritorno su `localhost:8765` (max 15 min);
  5. fa una **prova in sola lettura** (initialize + elenco strumenti);
  6. salva `mcpClientId` / `mcpRefreshToken` nella collezione protetta **`app_mcp_segreti/{docId}`** e nel doc `app` solo `mcpServerUrl` / `mcpCollegato` / `mcpCollegatoIl` (dalla v10.7.1).
- I token **non vengono mai stampati**. Non scriverli mai in chat, file, log o riepiloghi.

## 2. Divisione dei compiti (OBBLIGATA dalle regole di sicurezza)

| Claude | Giancarlo |
|---|---|
| Lancia `stato.js` e propone il gruppo da 10 | Dà l'ok al gruppo |
| Lancia `collega-app.js` per l'app | — |
| Apre in Chrome la pagina di autorizzazione (scheda "Collega il tuo assistente AI") | — |
| Apre il back office cliccando la riga dell'app nel pannello reseller, va in `/manage/settings/publicapi/`, compila il set e clicca **Aggiungere chiave** (autorizzato da Giancarlo l'11/10/2026) | — |
| — | Copia la chiave dai dettagli del set, la incolla nella pagina di autorizzazione, clicca **Autorizza** |
| Controlla l'esito, passa all'app successiva | Scrive "fatto" |

**Cose che Claude NON può fare** (il classifier le blocca: non provare ad aggirarle):
- leggere, copiare o incollare la chiave generata (la copia e la incolla Giancarlo). Creare il set invece è ok: autorizzato da Giancarlo l'11/10/2026;
- scrivere o incollare chiavi o token in un campo;
- navigare direttamente al link `data-href` del pannello reseller (contiene un accesso automatico). Cliccare la riga nel pannello invece funziona (11/10/2026): si apre una nuova scheda nel gruppo;
- inserire password o fare login;
- modificarsi i permessi (`settings.local.json`);
- scrivere su Firestore con script diversi da `collega-app.js`. Per correggere un dato dell'app si passa dalla scheda dell'app nel CRM, in Chrome.

## 3. Procedura

### Avvio sessione
1. `node scripts/mcp-collega/stato.js` → mostra quante app sono collegate e il prossimo gruppo da 10 (docId, webzineId, nome, cruscotto).
2. Mostra a Giancarlo l'elenco dei 10 nomi e chiedi il via.
3. Prepara Chrome (claude-in-chrome): `tabs_context_mcp` → serve una scheda per la pagina di autorizzazione, più il pannello reseller `https://www.goodbarber.app/reseller/manage/` (Giancarlo deve essere già loggato; se non lo è, chiedigli di farlo).

### Per ogni app (una alla volta, si va avanti solo dopo "fatto")
1. Avvia lo script in background, poi leggi il link:
   ```bash
   rm -f scripts/mcp-collega/auth-url.txt && (node scripts/mcp-collega/collega-app.js <docId> > <scratchpad>/app.log 2>&1 &) ; for i in $(seq 1 15); do [ -f scripts/mcp-collega/auth-url.txt ] && break; sleep 1; done; cat scripts/mcp-collega/auth-url.txt
   ```
   (La regola allow in `.claude/settings.local.json` copre `Bash(node scripts/mcp-collega/collega-app.js *)`.)
2. Con `navigate` apri quel link nella scheda di autorizzazione.
3. Pannello reseller: triple_click sul campo "Cerca" + `type` dell'**ID webzine** (il trucco jQuery keyup non filtra più), aspetta ~3 s, verifica che `tr[data-id=<webzineId>]` sia l'app giusta, poi clicca la riga → si apre il back office in una nuova scheda.
4. Nella nuova scheda: `navigate` a `https://<host>/manage/settings/publicapi/` (l'host si legge dal titolo/URL della scheda; non è sempre `*.comune.digital`, es. Conservatorio = `conservatoriomusicalefrancescocilea.istituti.eu`). Controlla i set già presenti (se uno ha già Cms → chiedi). Clicca "Creare un nuovo set di chiavi", scrivi il nome nel campo "Nome del set" (click + type), poi via JS nel contenitore del nome: checkbox `booking` spuntata e radio `user/stats/cms/booking_permission` = `READ_WRITE`; se tutto torna, clic su **Aggiungere chiave** e controlla che compaia "MCP CRM GrowApp (data)" senza leggere la chiave. Se un set esistente ha già Cms o si chiama GrowApp → fermati e chiedi.
5. Chiudi la scheda back office dell'app precedente e dai a Giancarlo il passo (testo modello qui sotto).
6. **Controllo prima di passare all'app successiva** (lezione 11/10/2026, San Vito): se il log NON dice `✅ COLLEGATA`, non lanciare l'app dopo. Il nuovo script morirebbe con `EADDRINUSE` sulla porta 8765, e il log precedente verrebbe sovrascritto. Ricarica invece la pagina di ritorno (localhost:8765/callback) oppure chiedi a Giancarlo. Usa un log separato per ogni app. A volte lo script resta vivo anche dopo `COLLEGATA`: `pkill -f collega-app.js` prima di lanciare il successivo.
   Se Giancarlo incolla per errore la chiave di un'altra app, la pagina di ritorno mostra il nome sbagliato. In quel caso rifai l'app con `--force` e la chiave giusta (il set esiste già, basta copiarla da "Visualizza i dettagli").
7. Dopo "fatto": `tail -2 <scratchpad>/app.log`. Deve dire `✅ COLLEGATA e salvata nel CRM`. Poi passa subito all'app successiva (stesso messaggio: esito + nuovo passo).

### Testo modello del passo per Giancarlo
> ✅ <app precedente> collegata.
>
> **N/10 – <Nome app>** (ID <webzineId>). La pagina di autorizzazione è pronta e lo script è in attesa.
> Ho creato il set `MCP CRM GrowApp` (tutti e 4 i moduli in Lettura e scrittura): la chiave è nei dettagli del set.
> Copiala, incollala in **"Collega il tuo assistente AI"** e clicca **Autorizza**.
>
> Poi scrivimi "fatto".

Il set: **User + Stats + Cms + Booking, tutti Lettura e scrittura** (dall'11/10/2026, da Diamante in poi; le app precedenti hanno Booking senza spunta).

### Fine gruppo
- Riepilogo **breve**: app collegate, app saltate e perché, anomalie trovate. Poi aspetta l'ok per il gruppo successivo.
- Verifica end-to-end facoltativa (fatta sulla prova iniziale): CRM → **Pubblicazioni sulle app** → apri un'app → chiedi *"Prova di collegamento in SOLA LETTURA: dimmi il nome dell'app ed elenca le sezioni CMS. Non creare, modificare o pubblicare nulla."*
- Aggiorna la memoria `crm-mcp-collegamento-app.md` con lo stato.

## 4. Casi particolari (non improvvisare: segnala o chiedi)

- **L'app ha già un set con Cms R-W** (es. Basicò, Rocca Imperiale, San Cataldo, set "CRM"): dall'11/10/2026 Giancarlo ha detto di **procedere senza chiedere**. Crea comunque `MCP CRM GrowApp`, non toccare il set esistente e segnalalo nel riepilogo di fine gruppo. Se esiste già un set chiamato GrowApp, invece, fermati e chiedi.
- **Set già presenti "CRM" (User & Stats) / "Allerte PC" / "Avvisi PC"**: sono normali, non toccarli e non usarli (non hanno Cms).
- **Lo script esce con `SALTATA: già collegata`**: l'app è già a posto. Per ricollegarla serve `--force`, ma solo con l'ok di Giancarlo.
- **`timeout`**: sono passati 15 minuti senza autorizzazione. Rilancia lo script: genera un link nuovo, quello vecchio non vale più.
- **App senza `goodbarberWebzineId`**: non si può collegare, segnalala (oggi l'unica attiva è Italo Greek Monasteries).
- **Il webzineId non corrisponde all'app nel pannello reseller**, oppure un dato del CRM è sbagliato (es. URL cruscotto): segnalalo nel riepilogo, correggi solo su richiesta e dalla scheda app del CRM.
- **GoodBarber chiede password, conferme di sicurezza o termini**: fermati e chiama Giancarlo.
- Durante il collegamento **non si pubblica nulla e non si inviano push**.

## 5. File

| File | Cosa fa |
|---|---|
| `collega-app.js` | Collega una app (OAuth + prova in lettura + salvataggio su Firestore) |
| `stato.js` | Sola lettura: conteggi e prossimo gruppo |
| `fsrest.js` | Firestore REST con le credenziali del Firebase CLI di Giancarlo (progetto `crm-comunedigital`) |
| `auth-url.txt` | Link di autorizzazione temporaneo (ignorato da git) |

## 6. Lasciapassare: rotazione e scadenza (scoperto l'11/10/2026)
- GoodBarber **ruota il refresh_token a ogni rinnovo**: quello vecchio smette di valere. Chi lo usa deve salvare subito il nuovo, e due rinnovi in contemporanea sulla stessa app rompono il collegamento. In produzione se ne occupa `lib/mcp-token.js`, con un lucchetto per app (campi `mcpRinnovoLockFino`/`mcpRinnovoLockDi`).
- Il refresh_token **scade dopo ~30 giorni**. `api/mcp-keepalive.js` (Vercel Cron, lunedì 03:10 UTC) rinnova tutte le app. Esito per app in `mcpStato`/`mcpUltimoRinnovo`/`mcpUltimoErrore`, riepilogo in `sistema/mcpKeepalive`.
- Se un'app risulta scaduta (`refresh rifiutato HTTP 400`), si ricollega con `collega-app.js <docId> --force`.
- Verifica che ogni chiave apra l'app giusta: `node scripts/mcp-collega/verifica-identita.js [docId…]`. È in sola lettura su GoodBarber e salva i token ruotati.

## 7. Dove stanno i lasciapassare (dalla v10.7.1, 11/10/2026)
- I segreti (client id, refresh token, lucchetto `lockFino`/`lockDi`) stanno in **`app_mcp_segreti/{docId}`**. Le regole Firestore del CRM bloccano dal browser ogni collezione fuori elenco: verificato l'11/10 che anche un SUPER_ADMIN loggato riceve `permission-denied` in lettura e scrittura. La leggono solo il server (Admin SDK) e gli script di Giancarlo (credenziali Firebase CLI).
- Nel doc `app` restano solo dati non segreti: `mcpServerUrl`, `mcpCollegato`, `mcpCollegatoIl`, `mcpStato`, `mcpUltimoRinnovo`, `mcpUltimoErrore`.
- **Migrazione automatica**: `lib/mcp-token.js` sposta i segreti rimasti nel doc `app` al primo rinnovo (chat, calendario o cron del lunedì), nella stessa transazione in cui li cancella dal doc `app`. Un token trovato nel doc `app` è sempre considerato il più recente.
- `fsrest.js` espone `collegata(app)`, `segretiMcp(app)` e `salvaRefreshMcp(...)`: gli script leggono da entrambi i formati.
- `stato.js` dice quanti lasciapassare sono ancora nel formato vecchio.
- La vecchia chiave statica di Cefalù (`mcpApiKey`) è spostata in `app_mcp_segreti` come `mcpApiKeyVecchia`. Revocare il set su GoodBarber lo decide Giancarlo.

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
  6. salva `mcpServerUrl` / `mcpClientId` / `mcpRefreshToken` / `mcpCollegatoIl` nel doc `app` su Firestore.
- I token **non vengono mai stampati**. Non scriverli mai in chat, file, log o riepiloghi.

## 2. Divisione dei compiti (OBBLIGATA dalle regole di sicurezza)

| Claude | Giancarlo |
|---|---|
| Lancia `stato.js` e propone il gruppo da 10 | Dà l'ok al gruppo |
| Lancia `collega-app.js` per l'app | — |
| Apre in Chrome la pagina di autorizzazione (scheda "Collega il tuo assistente AI") | Apre il back office dell'app **dal pannello reseller** |
| — | Crea il set di chiavi, copia la chiave, la incolla nella pagina di autorizzazione, clicca **Autorizza** |
| Controlla l'esito, passa all'app successiva | Scrive "fatto" |

**Cose che Claude NON può fare** (il classifier le blocca: non provare ad aggirarle):
- creare il set di chiavi nel back office (è una concessione di permessi);
- scrivere o incollare chiavi o token in un campo;
- aprire il back office col link `data-href` del pannello reseller (contiene un accesso automatico);
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
2. Con `navigate` apri quel link nella scheda di autorizzazione. Riporta anche il pannello reseller alla lista.
3. Dai a Giancarlo il passo (testo modello qui sotto).
4. Dopo "fatto": `tail -2 <scratchpad>/app.log`. Deve dire `✅ COLLEGATA e salvata nel CRM`. Poi passa subito all'app successiva (stesso messaggio: esito + nuovo passo).

### Testo modello del passo per Giancarlo
> ✅ <app precedente> collegata.
>
> **N/10 – <Nome app>** (ID <webzineId>). La pagina di autorizzazione è pronta e lo script è in attesa.
> 1. Dal **pannello reseller** apri **<Nome app>** → **Impostazioni → MCP Server & API pubbliche**.
> 2. Crea il set `MCP CRM GrowApp` (User, Stats e Cms tutti in Lettura e scrittura) e copia la chiave.
> 3. Incollala in **"Collega il tuo assistente AI"** e clicca **Autorizza**.
>
> Poi scrivimi "fatto".

Il set va configurato come "MCP CEFALU": **User + Stats + Cms, tutti Lettura e scrittura**, **Booking senza spunta**.

### Fine gruppo
- Riepilogo **breve**: app collegate, app saltate e perché, anomalie trovate. Poi aspetta l'ok per il gruppo successivo.
- Verifica end-to-end facoltativa (fatta sulla prova iniziale): CRM → **Pubblicazioni sulle app** → apri un'app → chiedi *"Prova di collegamento in SOLA LETTURA: dimmi il nome dell'app ed elenca le sezioni CMS. Non creare, modificare o pubblicare nulla."*
- Aggiorna la memoria `crm-mcp-collegamento-app.md` con lo stato.

## 4. Casi particolari (non improvvisare: segnala o chiedi)

- **L'app ha già un set con Cms R-W** (es. Basicò, set "crm"): chiedi. La scelta consigliata, già usata su Basicò, è creare comunque `MCP CRM GrowApp` e non toccare il set esistente.
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

## 6. Punto aperto
I refresh token stanno nel doc `app`, leggibile anche lato client (come le vecchie credenziali). Prima o poi vanno spostati in una collezione protetta da regole Firestore: cambiano `api/app-publish-chat.js`, `dettaglio-app.js`, `pubblicazioni-app.js` e questo script.

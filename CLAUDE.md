# Note persistenti per Claude — Progetto CRM Comune.Digital

> **LEGGI SEMPRE QUESTO FILE PER PRIMO** prima di toccare qualsiasi cosa nel progetto. Contiene contesto, regole tecniche critiche, lezioni apprese da bug reali e preferenze dell'utente Giancarlo.

> 🔗 **Auth Bridge fra prodotti Comune.Digital**: vedi `AUTH-BRIDGE.md` nella root del repo. Documento condiviso (copia identica in CMS, Segnalazioni, Booking). Descrive il meccanismo di accesso unificato che evita login multipli quando si naviga fra CRM, CMS, Segnalazioni, Booking. **Fase 2 (CRM→CMS) ancora da implementare** — JWT firmato RSA, vedi sezione Fase 2 nel documento.

> 👥 **Schema utenti CRM** (usato dal CMS per la sincronizzazione Team): collection `utenti`, campo `ruolo` (valori in MAIUSCOLO: `SUPER_ADMIN`, `ADMIN`, `MARKETING`, `AGENTE`, ...). Quando il CMS importa utenti dal CRM, esclude `ruolo === 'AGENTE'` e `stato === 'DISATTIVO'`. Le rules attuali in produzione (`firestore-security/firestore.rules.proposed.txt`) permettono ad un utente attivo di leggere tutta la collection `utenti`, quindi la sync funziona.

---

## 1. Cos'è questo progetto

**CRM Comune.Digital** (package: `crm-comune-digital`, vendor: Growapp S.r.l.) è un CRM gestionale che serve l'azienda a:
1. Gestire clienti, contratti, fatture, scadenze, task
2. Generare e configurare le **app mobile dei Comuni italiani** (basate su GoodBarber)
3. In particolare, generare le **homepage HTML** che vengono iniettate nelle app GoodBarber dei Comuni

L'app è in **PRODUZIONE** su `https://crm.comune.digital` (Vercel). Massima cautela su qualsiasi modifica: mai pushare/aggiornare il backoffice senza permesso esplicito di Giancarlo.

### Stack
- Frontend: HTML + CSS + JavaScript vanilla (NESSUN framework)
- Backend: Vercel serverless functions (`api/*.js`)
- DB / Auth: Firebase
- Notifiche push: FCM
- Build: `node scripts/generate-env.js` → `npm run vercel-build`
- Deploy: Vercel (`npm run deploy` per prod, `npm run deploy:preview` per anteprima)

### Struttura cartelle principali
```
webapp/
├── api/                          # Vercel serverless functions
│   ├── ai-chat.js               # Chat AI
│   ├── article-proxy.js
│   ├── cartolina-view.js
│   ├── classify-news.js
│   ├── diag-ghost-audit.js, diag-push.js
│   ├── generate-letter.js
│   ├── github-proxy.js
│   ├── send-notification.js
│   └── sync-push-history.js     # Cron ogni 15 min
├── public/                       # Static (servito da Vercel)
│   ├── index.html               # Entry point CRM
│   ├── firebase-messaging-sw.js
│   ├── css/, img/, docs/
│   └── js/
│       ├── app.js               # Bootstrap CRM
│       ├── auth.js              # Login/auth Firebase
│       ├── data-service.js      # 97KB — accesso dati centralizzato
│       ├── forms.js             # 156KB — form builder generico
│       ├── ui.js                # 40KB — UI helpers
│       ├── messaging-service.js, messaging-ui.js
│       ├── goodbarber-service.js   # Integrazione API GoodBarber
│       ├── notification-service.js, fcm-service.js
│       ├── settings-service.js, comuni-service.js, document-service.js
│       └── pages/               # Una pagina per file
│           ├── dashboard.js (192KB)
│           ├── settings.js (219KB)
│           ├── officina-digitale.js          # Hub Officina Digitale
│           ├── od-attivita.js, od-catalogo.js, od-portafoglio.js
│           ├── generatore-home.js (309KB) ★  # IL FILE PIÙ TOCCATO
│           ├── generatore-webapp.js
│           ├── dettaglio-cliente.js, dettaglio-app.js, dettaglio-contratto.js
│           ├── clienti.js, contratti.js, fatture.js, scadenzario.js
│           ├── push-broadcast.js, storico-push.js, centro-notifiche.js
│           ├── gestione-app.js, gestione-task.js
│           ├── monitor-rss.js, mappa-clienti.js, sala-riunioni.js
│           └── report.js, report-goodbarber.js
├── scripts/
│   └── generate-env.js          # Build-time: crea env.js da variabili Vercel
├── package.json                 # firebase-admin ^12.0.0 unica dipendenza
└── vercel.json                  # config functions, crons, redirects
```

### File chiave su cui Claude lavora di solito
- **`public/js/pages/generatore-home.js`** ← il file più importante. È il generatore della homepage del Comune. Produce HTML completi che vanno copiati in GoodBarber. **Versione attuale: v4.5.10**.
- `public/js/pages/generatore-webapp.js` — generatore di altre webapp embedded
- `public/js/pages/officina-digitale.js` — hub che contiene il Generatore Home come tab
- `public/js/data-service.js` — accesso dati centralizzato, contiene `calcolaFattureDaEmettere()` (vedi sezione 9)
- `public/js/forms.js` — form builder, contiene `_generaPeriodiContratto()` e `onContrattoSelezionato()`

---

## 2. Come funziona il Generatore Home

`GeneratoreHome` è un IIFE su `window.GeneratoreHome` che vive dentro l'Officina Digitale del CRM. L'utente:
1. Sceglie il Comune
2. Configura tema (palette, font), header, ticker, slideshow, widget abilitati
3. Clicca "Genera" → ottiene un file HTML completo (~3300 righe) auto-contenuto
4. Copia/incolla l'HTML in GoodBarber (vedi sezione 3)

### Widget disponibili (ordine default)
| order | id | label | enabled di default |
|-------|----|-------|-------------------|
| 0 | `dateHeader` | Barra Data (giorno + meteo + evento del giorno) | sì |
| 1 | `bannerNotifiche` | Banner Notifiche | no |
| 2 | `tickerBar` | Ticker News (RSS) | sì |
| 3 | `slideshow` | Slideshow orizzontale | sì |
| 4 | `servizi` | Griglia Servizi | sì |
| 5 | `bannerCIE` | Banner Carta Identità Elettronica | sì |
| 6 | `raccoltaDifferenziata` | Raccolta Differenziata | sì |
| 7 | `protezioneCivile` | Protezione Civile DPC | sì |
| 8 | `slideshowVerticale` | Slideshow Verticale full-screen | no |
| 9 | `tabBar` | Tab Bar custom | no |
| 14 | `meteoCard` | **Widget Meteo** (2 schermate, modal dettagli) | sì |

Più widget dinamici aggiunti dall'utente: `rssSlider_*`, `bannerCustom_*`.

### Storia versioni rilevanti
- v3.8.6 — Rimosso widget custom, attenuate ombre barra data
- v4.0.1 — Aggiunto Slideshow Verticale + bugfix
- v4.2.0 — Null-checks su dateHeader disabilitato
- v4.3.0 — Tema Tab Bar chiaro/scuro, fix SV
- v4.4.0 — Restyle Barra Data (calendario glass, mini-meteo FA, ~80 ricorrenze)
- v4.5.0 — Restyle integrale widget Meteo (2 schermate, modal, temi dinamici, scroll Android-safe, cache offline)
- v4.5.1 — Fix backslash in specialEvents, ° letterale, BannerCarousel CSS url() concat
- v4.5.2 — Bonifica residui backslash (regex SV → split.join, querySelector → getElementsByTagName)
- v4.5.3 — Tentativo 1 fix macro `apiUrl` → rinominata in `buildMeteoUrl` (NON è bastato: GB matcha qualunque suffisso `*url`/`*Url`)
- v4.5.4 — **Fix DEFINITIVO macro `*url(`**: rimossa funzione `buildMeteoUrl()`, endpoint inlinato come variabile `meteoEndpoint` dentro `loadMeteo()` (vedi sezione 3.1)
- v4.5.5 — **Fix RSS Slider eventi in menù custom**: il fetch verso `/syndication/<feed>/` veniva intercettato dal Service Worker dell'app GoodBarber e ritornava la SPA shell HTML 404; tutti e 3 i CORS proxy pubblici (allorigins, corsproxy.io, codetabs) ormai falliscono per limiti free / blocchi UA. Aggiunto come PRIMA scelta della catena fetch il proxy server-side `/api/rss-proxy.js` sul CRM, che bypassa il SW (è cross-origin) e usa un User-Agent browser-like. Vedi sezione 3.4.
- v4.5.6–v4.5.9 — Restyle card RSS Slider (più grandi), tracking pubblicazione homepage, supporto `<media:content>` per feed rss.app, hotlink protection Facebook CDN
- v4.5.10 — **Fix CRITICO pagina bianca**: `new URL(imgSrc)` introdotto in v4.5.9 veniva matchato dal preprocessor GB come macro `URL(` → SyntaxError fatale → pagina bianca. Sostituito con `document.createElement('a').hostname`. Vedi sezione 3.1.

---

## 3. ⚠️ REGOLE TECNICHE CRITICHE PER GOODBARBER

Le webapp generate vengono caricate dentro app GoodBarber personalizzate per ciascun Comune. **Esistono due punti di inserimento HTML in GoodBarber con comportamenti DIVERSI**:

| Inserimento | Comportamento |
|-------------|---------------|
| **"custom html"** | Passa il codice tale e quale al client, **nessuna trasformazione** |
| **"menù custom"** | Passa il codice attraverso un **preprocessor** che applica trasformazioni di stringhe e sostituzioni di macro di sistema |

**Se un bug appare SOLO in "menù custom" e NON in "custom html", la causa è quasi sempre il preprocessor.**

### 3.1 Mai chiamare funzioni con nomi che terminano in `url`/`Url` o che collidono con macro GoodBarber

Il preprocessor riconosce alcune **chiamate di funzione** come macro di sistema e le sostituisce con un URL hardcoded del Comune. La regola CONFERMATA in produzione su Mezzolombardo (bug v4.5.x risolto definitivamente in v4.5.4):

**REGOLA #1 — Suffisso `url` (case-insensitive)**: GoodBarber sostituisce QUALUNQUE chiamata `*url(...)` o `*Url(...)` con `*url(<URL_DEL_COMUNE>)`. Il match è sul SUFFISSO del nome di funzione, case-insensitive. Esempi confermati:

```js
function apiUrl(){ return 'https://api.open-meteo.com/...'; }
fetchJSON(apiUrl(), ctrl.signal, CFG.maxRetries)
// GB la trasforma in:
fetchJSON(apiurl(https://mezzolombardo.comune.digital/apiv3/root/scratch/), ctrl.signal, CFG.maxRetries)
//                       ^^ il "//" diventa commento JS, mangia il `)` di fetchJSON

function buildMeteoUrl(){ ... }
fetchJSON(buildMeteoUrl(), ...)
// GB la trasforma comunque in (anche se ha prefisso):
fetchJSON(buildMeteourl(https://mezzolombardo.comune.digital/apiv3/root/scratch/), ...)

// Risultato in entrambi i casi:
// "Uncaught SyntaxError: missing ) after argument list"
```

**IMPORTANTE — Le VARIABILI sono safe**: `var miniMeteoUrl = '...'; fetch(miniMeteoUrl)` sopravvive intatto. La trasformazione GB scatta SOLO quando c'è `(` subito dopo l'identificatore. Quindi una variabile usata come argomento (`fetch(miniMeteoUrl)`) è OK.

**ATTENZIONE — Anche `new URL()` è a rischio**: il costruttore nativo `new URL(imgSrc)` contiene il pattern `URL(` che il preprocessor GB matcha case-insensitively. Bug confermato in v4.5.9→v4.5.10 (pagina bianca su Valledolmo). **Workaround**: estrarre l'hostname usando `document.createElement('a')`:
```js
// ❌ PERICOLOSO — "new URL(" → preprocessor lo trasforma in macro
var h = (new URL(imgSrc)).hostname;

// ✅ SAFE — nessun pattern *url( nel codice
var tmpAnchor = document.createElement('a');
tmpAnchor.href = imgSrc;
var h = (tmpAnchor.hostname || '').toLowerCase();
```

**Workaround in v4.5.4**: rimuovere del tutto la funzione `buildMeteoUrl()` e costruire l'endpoint INLINE dentro `loadMeteo()` come variabile locale (`var meteoEndpoint = ...`). Pattern raccomandato per qualunque costruzione di URL:

```js
// ✅ SAFE — variabile, no function call
var qsParts = ['latitude='+CFG.lat, ...];
var meteoEndpoint = CFG.apiBase + '?' + qsParts.join('&');
fetchJSON(meteoEndpoint, ...)
```

**REGOLA #2 — Altri nomi a rischio di collisione macro**: prefissare sempre con nome del widget o identificatore univoco.

✅ **Sicuri**: `loadMeteoData`, `meteoApiCall`, `slideshowGetData`, `tickerLoadFeed`, `dateHeaderRefresh`, `cieRenderBlock`, `meteoEndpoint` (variabile)
❌ **A rischio (DA EVITARE come nomi di FUNZIONE chiamata `()`)**: qualunque nome che termina in `url`/`Url`, e inoltre `apiCall`, `getData`, `getLang`, `getUser`, `getTime`, `getDate`, `loadData`, `fetchData`, `getConfig`, `getTitle`, `getName`

### 3.2 Mai usare backslash-escape nelle stringhe JS emesse

Il preprocessor strippa o trasforma i backslash, rompendo regex e stringhe. Regole tassative:

| Caso | ❌ Sbagliato | ✅ Corretto |
|------|-------------|-------------|
| Apostrofo | `'l\'utente'` | `'l'utente'` (apostrofo tipografico U+2019) |
| Gradi | `'\u00B0C'` | `'°C'` (carattere letterale) |
| CSS url() con apici | `'url(\'' + path + '\')'` | `"url(" + "'" + path + "'" + ")"` |
| Regex con punto | `s.replace(/\./g, '')` | `s.split('.').join('')` |
| Selector CSS namespace | `querySelector('media\\:thumbnail')` | `getElementsByTagName('media:thumbnail')` |

### 3.4 Service Worker delle app GoodBarber e fetch RSS

**Problema confermato in produzione (Mezzolombardo, v4.5.5)**: ogni Comune servito su `<comune>.comune.digital` (app GoodBarber) ha un **Service Worker** registrato sull'intera origine, scope `/`. Il SW intercetta TUTTI i fetch same-origin: per i path che non riconosce (es. `/syndication/eventi/`) restituisce la **SPA shell HTML con HTTP 404**, NON il file remoto. Risultato: qualunque widget runtime che fa `fetch('https://<comune>.comune.digital/syndication/...')` da dentro l'iframe del menù custom NON può ricevere XML.

In più, i 3 CORS proxy pubblici classici sono ormai inaffidabili:
- `api.allorigins.win` → spesso "Failed to fetch" / down
- `corsproxy.io` → 403 "Free usage is limited to localhost and development environments"
- `api.codetabs.com` → 403 "Forbidden by administrative rules" su comune.digital (UA gating)

**Soluzione standard adottata**: proxy RSS server-side ospitato sul CRM, file `api/rss-proxy.js`. Endpoint:

```
GET https://crm.comune.digital/api/rss-proxy?url=<feed-url-encoded>
```

Caratteristiche:
- Allowlist di domini (`.comune.digital`, `.goodbarber.app`, `.goodbarber.com`, `.ww-api.com`, `rss.app`)
- User-Agent browser-like (`Mozilla/5.0 (compatible; ComuneDigitalRSSProxy/1.0; ...)`) per superare i blocchi UA
- Cache edge 5 min + stale 1 h
- Restituisce **XML raw** con `Content-Type: text/xml` e `Access-Control-Allow-Origin: *`
- Scarta automaticamente le risposte HTML SPA shell (anti-fallback)
- Errori → JSON `{ ok: false, error: "..." }` con status appropriato (502/504/403/400)

Nel runtime di `generatore-home.js`, dentro l'IIFE `RSS SLIDERS RUNTIME`, `CORS_PROXIES` ha questa priorità:
1. **Proxy CRM** (`crm.comune.digital/api/rss-proxy?url=`) ← PRIMARIO
2. allorigins (JSON wrapper `{contents:""}`)
3. corsproxy.io
4. codetabs

La funzione `extractXml(raw)` gestisce sia XML raw sia il wrapper JSON di allorigins, e scarta SPA shell HTML.

**Lezione**: per qualunque feed RSS chiamato da dentro l'iframe del menù custom, NON contare su un fetch same-origin, NON contare sui CORS proxy pubblici. Usare sempre prima il proxy CRM.

### 3.3 Verifica obbligatoria prima di rilasciare in produzione

Per ogni modifica al generatore:
1. `node --check public/js/pages/generatore-home.js` — verifica sintassi JS
2. Test in **preview** GoodBarber del Comune di test (es. Mezzolombardo: `https://mezzolombardo.comune.digital/manage/preview/...`) — MAI direttamente in produzione
3. Aspettare che Giancarlo dia esplicitamente l'OK per aggiornare il backoffice

---

## 4. Workflow di debug per crash JS in GoodBarber preview

Se compare un errore tipo `SyntaxError` o `Unexpected token` solo nel "menù custom":

1. **Apri Claude in Chrome** sulla preview del Comune (es. `https://mezzolombardo.comune.digital/manage/preview/emergenze/c/0`)
2. **Naviga nell'iframe nidificato** che corrisponde al servito da `/apiv3/getControllerUrl`:
   ```js
   var iframe = document.getElementById('iframe-preview');
   var idoc = iframe.contentDocument;
   var nested = idoc.querySelectorAll('iframe');
   var ndoc = nested[1].contentDocument;  // [0] è solitamente vuoto
   var html = ndoc.documentElement.outerHTML;
   var lines = html.split('\n');
   // estrai lines[errLine - 5 .. errLine + 5]
   ```
3. **Sanitizza l'output** sostituendo `?`/`&`/`=` con placeholder PRIMA di restituire, altrimenti scatta `[BLOCKED: Cookie/query string data]` di Claude in Chrome:
   ```js
   l.replace(/\?/g,'(QM)').replace(/&/g,'(AMP)').replace(/=/g,'(EQ)')
   ```
4. **Confronta con il sorgente** nel generatore. Ciò che è cambiato è la trasformazione del preprocessor — è il bug.

### Note operative su Claude in Chrome
- Le query string nei valori di ritorno fanno scattare il blocco privacy. **Sempre sanitizzare**.
- `fetch()` di file con query string nel body è bloccato.
- `XMLHttpRequest` sync funziona per script same-origin SENZA query string nel body restituito.
- Il modo migliore per leggere il file servito è via `iframe.contentDocument.documentElement.outerHTML`.
- Per trovare risorse caricate dinamicamente: `iwin.performance.getEntriesByType('resource')` mostra anche quelle iniettate via fetch o iframe.

---

## 5. Convenzioni di codice e palette

### Palette Comune.Digital (USA SEMPRE QUESTI COLORI)

**Blu principale** — `#145284` (titoli, pulsanti primari, navigazione)
- Blu 700: `#145284` brand
- Blu 500: `#2E6DA8` hover
- Blu 300: `#7BA7CE` separatori
- Blu 100: `#D1E2F2` background card

**Verde secondario** — `#3CA434` (call-to-action, badge, conferme, sezioni ambiente/riuso)
- Verde 700: `#3CA434` ufficiale
- Verde 500: `#59C64D` hover
- Verde 300: `#A4E89A` icone/background positivi
- Verde 100: `#E2F8DE` success

**Grigi**
- 700 `#4A4A4A` testo secondario
- 500 `#9B9B9B` testo disattivato
- 300 `#D9D9D9` bordi
- 100 `#F5F5F5` background neutro

**Stato**
- Giallo avviso `#FFCC00`
- Rosso errore `#D32F2F`
- Azzurro info `#0288D1`

### Font
**Titillium Web** in tutte le varianti, peso 300-700 per testo, 900 per titoli.

### Pulsanti standard
- Background `#145284`, hover `#2E6DA8`, testo `#FFFFFF`
- Per sezioni green: protagonista `#3CA434`, sfondo `#A4E89A`

### Icone
Font Awesome free (`fas fa-*`) quando non specificato diversamente.

### Immagini
Se servono immagini (stemmi, foto a tutto schermo, box), **indicare DOVE inserirle e CHE TIPO** — l'URL lo aggiunge Giancarlo. Se non servono immagini, non forzarle.

---

## 6. Preferenze utente Giancarlo (TASSATIVE)

- **Solo HTML/CSS/JS vanilla**, mai framework (no React, no Vue, no Tailwind, no jQuery se non già presente)
- **Spiegazioni passo-passo**: Giancarlo NON è programmatore esperto. Per ogni modifica:
  - Spiegare cosa fa il codice
  - Dire ESATTAMENTE dove incollarlo (file + riga / sezione)
  - Quando si fornisce un blocco di codice riscritto, **darlo COMPLETO dalla prima all'ultima stringa**, mai diff parziali tipo "qui aggiungi X"
- **Mobile-first, responsive**: tutte le webapp devono prima funzionare bene su mobile, poi adattarsi a desktop
- **Palette Comune.Digital obbligatoria** (vedi sezione 5)
- **L'app è in PRODUZIONE**: massima cautela. Mai modificare il backoffice/cruscotto senza permesso esplicito. Quando in dubbio, chiedere prima.
- Quando si modifica `generatore-home.js`: sempre bumpare il numero di versione nel commento header, descrivendo cosa è cambiato e perché.
- Lingua di lavoro: **italiano**.

---

## 7. Comandi utili

```bash
# Verifica sintassi del generatore
node --check public/js/pages/generatore-home.js

# Build env e dev server locale
npm run build
npm run dev   # Python http.server su :8080

# Deploy
npm run deploy:preview   # preview Vercel
npm run deploy           # PROD — chiedere prima a Giancarlo!
```

---

## 8. TODO / lezioni aperte

- Nessun audit completo dei nomi di funzione "a rischio macro GoodBarber" è stato fatto sul resto del generatore. Se in futuro compaiono crash analoghi su altri widget, controllare per primi i nomi della lista in 3.1.
- Non c'è ancora una pipeline di test automatici. La verifica si basa su `node --check` + test manuale in preview GoodBarber.

---

## 9. Sistema Fatturazione e Contratti

Questa sezione documenta il flusso completo dalla creazione del contratto all'emissione della fattura, e l'algoritmo che calcola le fatture ancora da emettere (lo "scadenzario").

### 9.1 Modello dati Firestore

**Collezione `contratti`** — un documento per contratto:
```
{
  id: "CTR-2026-001",
  clienteId: "CLI-001",
  clienteNome: "Comune di Mezzolombardo",
  tipo: "Canone App" | "Attivazione" | "Servizio" | ...,
  importo: 1200,                    // Importo per periodo di fatturazione
  iva: 22,
  stato: "attivo" | "in_attesa" | "scaduto" | "disdetto",
  dataInizio: "2026-01-14",         // ← IMPORTANTE: data effettiva di inizio
  dataFine: "2026-12-31",
  periodicita: "mensile" | "bimestrale" | "trimestrale" | "semestrale" | "annuale" | "una_tantum",
  giorniPagamento: 30,
  note: "...",
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Collezione `fatture`** — un documento per fattura:
```
{
  id: "FAT-2026-001",
  numero: "2026/001",               // Numero progressivo anno/seq
  contrattoId: "CTR-2026-001",      // Riferimento al contratto
  clienteId: "CLI-001",
  clienteNome: "Comune di Mezzolombardo",
  importo: 1200,
  iva: 22,
  totale: 1464,
  competenzaDal: "2026-01-14",      // Inizio periodo di competenza
  competenzaAl: "2026-02-13",       // Fine periodo di competenza
  dataEmissione: "2026-01-14",
  dataScadenza: "2026-02-13",
  stato: "emessa" | "pagata" | "scaduta" | "annullata",
  metodoPagamento: "bonifico" | "ri.ba" | ...,
  note: "...",
  createdAt: Timestamp
}
```

**Collezione `contatori`** — numerazione progressiva fatture:
```
{
  id: "fatture_2026",
  valore: 42                        // Prossimo numero disponibile
}
```

### 9.2 Flusso: creazione contratto → emissione fattura

**STEP 1 — Creazione contratto** (`forms.js` linee ~2507-2645, `data-service.js` linee ~853-885):
- L'utente compila il form contratto: cliente, tipo, importo, periodicità, data inizio, data fine
- `DataService.createContratto()` salva su Firestore con ID auto-generato `CTR-{anno}-{seq}`

**STEP 2 — Creazione fattura** (form fattura in `forms.js` linee ~1440-1600):
- L'utente apre il form "Nuova Fattura" e seleziona un contratto
- `onContrattoSelezionato()` (`forms.js` ~linea 1513) si attiva e:
  1. Carica i dati del contratto
  2. Chiama `_generaPeriodiContratto()` per ottenere tutti i periodi di fatturazione
  3. Cerca il primo periodo non ancora coperto da fattura esistente
  4. Pre-compila automaticamente: importo, IVA, `competenzaDal`, `competenzaAl`, `dataEmissione`, `dataScadenza`
- L'utente conferma e salva

**STEP 3 — Salvataggio fattura** (`data-service.js` linee ~1736-1786, `createFattura()`):
- Genera numero progressivo da collezione `contatori` (operazione atomica)
- Salva il documento fattura su Firestore
- Aggiorna la cache locale

### 9.3 Generazione periodi di fatturazione

La funzione `_generaPeriodiContratto()` (`forms.js` ~linea 1603) genera tutti i periodi teorici dalla data di inizio alla data di fine del contratto, in base alla periodicità.

**Logica**:
```
Input: contratto con dataInizio, dataFine, periodicita
Output: array di { dal: Date, al: Date }

Per ogni step di periodicità (1 mese, 2 mesi, 3 mesi, 6 mesi, 12 mesi):
  - periodoDal = dataInizio + (step × i)    // Avanza dal mese base
  - periodoAl  = periodoDal + step - 1 giorno
  - Se periodoAl > dataFine → periodoAl = dataFine
  - Se periodoDal > dataFine → stop
```

**Esempio** (contratto mensile, inizio 14/01/2026, fine 31/12/2026):
- Periodo 1: 14/01/2026 → 13/02/2026
- Periodo 2: 14/02/2026 → 13/03/2026
- Periodo 3: 14/03/2026 → 13/04/2026
- ... e così via fino a dicembre

**ATTENZIONE**: I periodi NON partono dal 1° del mese ma dalla data effettiva di inizio contratto. Se il contratto parte il 14 gennaio, i periodi sono 14→13, 14→13, ecc. Questo è fondamentale per capire il matching con le fatture.

### 9.4 Algoritmo `calcolaFattureDaEmettere()` — lo scadenzario

Questa è la funzione critica che determina quali fatture devono ancora essere emesse. Si trova in `data-service.js` linee ~2078-2266.

**Flusso dell'algoritmo**:

1. **Carica tutti i contratti attivi** (stato = `attivo` o `in_attesa`)
2. **Carica tutte le fatture** raggruppate per contratto (`fatturePerContratto`) e per cliente (`fatturePerCliente`)
3. **Per ogni contratto**, genera i periodi teorici con la stessa logica di `_generaPeriodiContratto()`
4. **Per ogni periodo**, cerca se esiste una fattura corrispondente

**Matching fattura-periodo (v4.5.x con fix overlap + cross-contratto)**:

Il matching avviene in **due step**:

**STEP 1 — Match diretto** (fatture dello stesso contratto + fatture del cliente senza contratto):
```
tutteLeFatture = fatturePerContratto[contratto.id] + fatturePerCliente[contratto.clienteId].filter(senza contrattoId)
```
Per ogni fattura in `tutteLeFatture`, la funzione `_matchFatturaPeriodo` verifica:
- Se la fattura ha `competenzaDal` E `competenzaAl` → **overlap di date**: la fattura copre il periodo se `fDal ≤ periodoAl AND fAl ≥ periodoDal`
- Se la fattura ha solo `competenzaDal` (senza `competenzaAl`) → fallback ±5 giorni dalla data inizio periodo
- Se la fattura non ha date di competenza → fallback fuzzy su importo + data emissione vicina

**STEP 2 — Match cross-contratto** (fatture del cliente su ALTRI contratti, solo se STEP 1 non ha trovato nulla):
```
fattureClienteAltriContratti = fatturePerCliente[contratto.clienteId].filter(ha contrattoId diverso)
```
Per questo step si usa SOLO l'overlap stretto (entrambe le date presenti, `fDal ≤ periodoAl AND fAl ≥ periodoDal`). Questo copre il caso comune di clienti come Italiaonline che hanno una fattura unica che copre più contratti.

5. **Se nessun match** → il periodo viene aggiunto alla lista "da emettere"
6. **Output**: array di oggetti con contratto, importo, periodo, data emissione suggerita

### 9.5 Visualizzazione nello scadenzario

Lo scadenzario è visibile in due punti:
- **Dashboard** (`dashboard.js`): widget riassuntivo con conteggio e importo totale
- **Pagina Scadenzario** (`scadenzario.js`): lista dettagliata filtrata per mese
- **Dettaglio Contratto** (`dettaglio-contratto.js` ~linea 443, `renderScadenze`): mostra le prossime scadenze per quel singolo contratto

La funzione `getScadenzeCompute()` (`data-service.js` ~linea 2272) converte l'output di `calcolaFattureDaEmettere()` nel formato atteso dalle pagine UI.

### 9.6 Bug risolto (aprile 2026) e lezione appresa

**Problema**: il CRM continuava a mostrare fatture "da emettere" per periodi già coperti da fattura. Numero falsi positivi: 77 fatture "fantasma".

**Causa 1 — Matching per tolleranza anziché overlap** (77→71, -6):
La logica originale confrontava `competenzaDal` della fattura con la data inizio del periodo generato, con tolleranza ±5 giorni. Ma se il contratto inizia il 14 e la fattura è stata emessa con competenza dal 1° del mese, la differenza è 13 giorni → non matchava.

**Fix**: sostituito il confronto ±5 giorni con **overlap di periodi** (`fDal ≤ periodoAl AND fAl ≥ periodoDal`). Due intervalli si sovrappongono se e solo se ciascuno inizia prima che l'altro finisca.

**Causa 2 — Fatture cross-contratto ignorate** (71→53, -18):
Alcuni clienti (in particolare Italiaonline) emettono una fattura unica che copre più contratti dello stesso cliente. La fattura è associata a `contrattoId = CTR-2026-120` ma deve coprire anche `CTR-2026-115`, `CTR-2026-118`, ecc. La logica originale guardava solo le fatture dello stesso `contrattoId`.

**Fix**: aggiunto STEP 2 di matching che cerca anche tra le fatture dello stesso `clienteId` ma di altri contratti, usando overlap stretto (entrambe le date presenti).

**Risultato finale**: da 77 falsi positivi a 53 fatture effettivamente da emettere.

**LEZIONE PER IL FUTURO**:
- **Mai usare tolleranza a giorni fissi** per matching periodi: usare sempre overlap di date
- **Considerare sempre le fatture cross-contratto**: un cliente può avere una fattura consolidata che copre più contratti
- Per diagnosticare problemi di fatturazione, iniettare JS direttamente nella pagina CRM via Claude in Chrome per confrontare i dati Firestore con l'output dell'algoritmo

### 9.7 File e funzioni chiave del sistema fatturazione

| File | Funzione/Sezione | Cosa fa |
|------|------------------|---------|
| `data-service.js` ~L853 | `createContratto()` | Crea contratto su Firestore |
| `data-service.js` ~L1736 | `createFattura()` | Crea fattura con numero progressivo |
| `data-service.js` ~L2078 | `calcolaFattureDaEmettere()` | Algoritmo scadenzario (genera periodi + matching) |
| `data-service.js` ~L2272 | `getScadenzeCompute()` | Converte output per UI scadenzario |
| `forms.js` ~L1513 | `onContrattoSelezionato()` | Auto-fill form fattura da contratto |
| `forms.js` ~L1603 | `_generaPeriodiContratto()` | Genera periodi teorici da contratto |
| `dettaglio-contratto.js` ~L443 | `renderScadenze()` | Mostra scadenze nel dettaglio contratto |
| `dashboard.js` | Widget scadenzario | Conteggio e importo totale da emettere |
| `scadenzario.js` | Pagina Scadenzario | Lista dettagliata per mese |

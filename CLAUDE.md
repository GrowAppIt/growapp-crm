# Note persistenti per Claude — Progetto CRM Comune.Digital

> **LEGGI SEMPRE QUESTO FILE PER PRIMO** prima di toccare qualsiasi cosa nel progetto. Contiene contesto, regole tecniche critiche, lezioni apprese da bug reali e preferenze dell'utente Giancarlo.

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
- **`public/js/pages/generatore-home.js`** ← il file più importante. È il generatore della homepage del Comune. Produce HTML completi che vanno copiati in GoodBarber. **Versione attuale: v4.5.3**.
- `public/js/pages/generatore-webapp.js` — generatore di altre webapp embedded
- `public/js/pages/officina-digitale.js` — hub che contiene il Generatore Home come tab

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

# Changelog KB Catania

Registro delle modifiche manuali alla Knowledge Base del Comune di Catania (`catania.kb.json`).

Ogni release del file segue il versioning indicato nel campo `meta.version`.

---

## v1.0.1 — 2026-05 (hotfix URL)

**Hotfix critico**: in v1.0 gli URL delle sezioni dell'app erano stati derivati con kebab-case del *nome attuale* della sezione invece di leggere lo *slug reale* dal CMS. Quando una sezione è stata rinominata nel tempo (es. con l'aggiunta della traduzione inglese al nome), il nome è cambiato ma lo slug originale è rimasto invariato. Risultato: ~30% degli URL puntavano a sezioni inesistenti (404).

### Cosa è stato fatto

1. **Identificato l'endpoint pubblico** `https://catania.comune.digital/apiv4/getSettings?platform=webapp` che restituisce un JSON con tutte le sezioni e il campo `rewritedUrl` (lo slug reale di ogni sezione). Nessuna autenticazione richiesta, sorgente machine-readable e stabile.

2. **Estratta la mappa sectionId → rewritedUrl** per le 68 sezioni pubblicate dell'app.

3. **22 URL corretti automaticamente** matchando per nome dal TSV interno. Esempi:
   - `amministrazione-administration` → `amministrazione-comunale`
   - `catania-digitale-services` → `servizi-online-1`
   - `siti-tematici-utilities` → `catania-digitale`
   - `contatti-e-sedi-contacts` → `contatti-municipio`
   - `numeri-emergenza-emergency` → `numeri-emergenza-nazionali`
   - `differenziata-waste-recycling` → `raccolta-differenziata-rubbish`
   - `metropolitana-subway` → `metro`
   - `colonnine-charging-stations` → `ricarica-veicoli-elettrici`
   - `news-flash` → `avvisi-flash`
   - `dae` → `page-dae`
   - `notizie-news` → `notizie-news-1`
   - `dicci-la-tua-sull-app` → `dicci-la-tua-sullapp`
   - `catania-e-casa-video` → `catania-e-casa`
   - `pubblica-utilita-utilities` → `pubblica-utilita`
   - `festa-di-sant-agata` → `festa-di-santagata`
   - `benvenuti-nell-app-catania` → `benvenuti-nellapp-catania`
   - …e altre

4. **3 sezioni reindirizzate al sito istituzionale** (avevano una pagina equivalente sul sito):
   - `uffici-comunali-mappa` → `https://www.comune.catania.it/amministrazione/uffici/`
   - `posteggi-parking` → `https://www.comune.catania.it/servizi/default.aspx?category=4`
   - `scuole` → `https://www.comune.catania.it/servizi/default.aspx?category=1`

5. **6 nodi rimossi** perché senza pagina pubblica raggiungibile e senza alternativa funzionale:
   - `crea-cartolina` (sezione effimera)
   - `stazioni-servizio` (mappa non pubblicata sulla webapp)
   - `around-catania` (Clickto a sito esterno non determinabile via API pubblica)
   - `feedback-ambiente` (duplicato di `feedback-app`)
   - `proponi-idea` (form senza pagina pubblica)
   - `highlights-sant-agata-2026` (video effimero post-edizione 2026)

6. **1 riferimento incrociato corretto** nelle FAQ: `faq-camper-parcheggio` puntava al vecchio slug `posteggi-parking` non più esistente, reindirizzato al sito-mobilità.

### Statistiche post-hotfix

- **Items totali**: 147 (da 153, -6)
- **URL unici**: 95
- **URL verificati 200 OK**: 94 / 95 (1 intermittenza di rete sul sito istituzionale, non bug del kb)

### Lezione operativa per il futuro

**Mai derivare gli slug per kebab-case dal nome di una sezione**. Lo slug reale del CMS può differire dal nome perché:
- È stato creato quando il nome era diverso (e poi il nome è stato cambiato)
- Ha suffissi `-1`, `-2` per disambiguare nomi duplicati
- Usa traduzioni o convenzioni interne (es. `page-dae`, `servizi-online-1`)

La fonte di verità è sempre **`/apiv4/getSettings?platform=webapp`** del dominio `<comune>.comune.digital`, campo `rewritedUrl`. Per ogni futura release o per ogni nuovo Comune del rollout, leggere quella mappa e usare gli slug così come sono.

---

## v1.0 — 2026-05

**Prima release.**

Compilazione iniziale della KB Catania a partire da estrazione automatica delle sorgenti pubbliche e da bozza euristica delle FAQ canoniche, secondo lo schema definitivo concordato (Brief Cowork — KB Chatbot Municipale).

### Composizione (153 items totali)

| Origine | Items | Note |
|---|---:|---|
| Sezioni dell'app Catania | 63 | Estrazione una tantum dalla configurazione pubblica dell'app, senza accesso al CMS in esercizio. Refresh manuale a richiesta. |
| Sezioni del sito istituzionale `www.comune.catania.it` | 42 | Crawler progressivo dai 4 hub principali (Amministrazione, Novità, Servizi, Vivere il Comune), uffici codificati e pagine footer scartati. |
| FAQ canoniche euristiche | 48 | Bozza redatta a partire da pattern noti dei Comuni italiani. **Tutte da validare con l'ufficio competente prima del rilascio in produzione.** |

### Distribuzione

- **Level**: 85 L1 (istituzionale), 36 L2 (civico), 32 L3 (esperienziale)
- **Response type**: 135 `app_link` + 18 `quick_answer`
- **Sensitive**: 11 nodi (emergenze, salute, pass disabili, servizi sociali)
- **Requires_intent**: 1 nodo (rateizzazione tasse — dipende dal tipo di tributo)

### URL

Tutti i 135 link puntano a domini autorizzati:

- `https://catania.comune.digital/<slug>/` per le sezioni dell'app
- `https://www.comune.catania.it/<path>` per le sezioni del sito istituzionale

Nessun riferimento alla piattaforma CMS sottostante (white-label rispettato).

### Lingue

`it` + `en` per tutti i nodi, come da brief.

### Esclusioni e accorpamenti rispetto alle sorgenti grezze

- **Sezioni meta dell'app** (`Home`, `Login box`, `Profile`, `Settings`, `Tos`, gruppi `Node`) → escluse
- **Sezioni di test interno** (`amministrazione test`, `Menu`, `Credits`) → escluse
- **Duplicati funzionali** (`ctsemplice` vs `Catania Semplice`, due `archivionotifiche`) → tenuto un solo nodo
- **Singoli articoli/notizie/avvisi del sito** → non inclusi (la KB linka le sezioni, non i singoli pezzi)
- **Uffici codificati del sito** (es. "GS - Ufficio per le Relazioni con il Pubblico") → esclusi: il cittadino non li cerca con quel nome
- **Pagine footer del sito** (cookie policy, privacy, note legali, mappa portale) → escluse
- **Paginazione delle Novità** (`?page=N`) → accorpata sotto gli hub principali
- **Sub-categorie filtrate dei Luoghi** → accorpate sotto la voce `sito-luoghi`

### Note operative per il rilascio

1. **FAQ canoniche da validare** — i 48 nodi del batch 4 (`faq-*`) sono una bozza euristica. Prima del rilascio in produzione vanno revisionati dall'ufficio competente del Comune o da Carmelo, in particolare:
   - `quick_answer` con dati specifici (sindaco, costi, definizioni di legge): verificare aggiornamento
   - `app_link` su servizi: verificare che gli URL puntino al servizio attivo, non a pagine in bozza
2. **Sezione effimera** — `highlights-sant-agata-2026` è legata all'edizione 2026 del festival e dovrà essere rimossa o sostituita dopo l'edizione (lo gestirà il diff notturno).
3. **Doppio servizio Catania Semplice** — esistono due voci adiacenti (`catania-semplice` come app feature, `sito-servizi` come catalogo sito). Sono complementari, non duplicati: il primo è il portale richieste, il secondo l'elenco completo dei servizi. Verificare comunque con il responsabile del servizio.
4. **`sito-amministrazione-trasparente`** — la pagina `https://www.comune.catania.it/amministrazione-trasparente/` ha restituito HTTP 403 a tutti i tentativi (con e senza UA browser). Non è stata inserita nella KB. Se è effettivamente pubblica, va indagata e re-inclusa in v1.1.

### Sorgenti di lavoro (traccia di provenienza)

Conservate nella stessa cartella per tracciabilità interna, **non parte della consegna**:

- `_sources_app_catania.tsv` — 64 sezioni app derivate da estrazione una tantum (senza terminologia di piattaforma)
- `_sources_site_catania.tsv` — 75 voci del sito istituzionale derivate da crawler progressivo
- `_batch1_items.json` — 22 items custom-page app (prima conversione)
- `_batch2_items.json` — 41 items sezioni app rimanenti
- `_batch3_items.json` — 42 items sito istituzionale curato
- `_batch4_faq.json` — 48 FAQ canoniche euristiche

### Da fare per v1.1 (dopo validazione ufficio)

- [ ] Validazione delle 48 FAQ canoniche con ufficio competente
- [ ] Verifica `sito-amministrazione-trasparente` (403 al primo accesso)
- [ ] Aggiunta dialetto / varianti locali catanesi se identificate dalla redazione
- [ ] Eventuale aggiunta di nodi mancanti emersi dalla validazione
- [ ] Implementazione diff notturno (script di confronto su `nuovi_nodi.json`, `nodi_rimossi.json`, `nodi_modificati.json`)

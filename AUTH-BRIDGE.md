# Auth Bridge — accesso unificato fra i prodotti Comune.Digital

> **A chi serve questo documento.** A chiunque metta mano a uno dei progetti
> della famiglia Comune.Digital (CRM, CMS, Segnalazioni, Booking) e debba capire
> come funziona l'accesso "single-sign-on" che evita all'utente di ridigitare
> la password ogni volta che salta da un dominio all'altro. Se cambi questo
> meccanismo, aggiorna **tutti** i progetti in cui è citato.

## In due righe

Quando un super-admin del CMS clicca "Admin" su un tenant, il CMS chiede a una
Cloud Function di emettergli un token monouso, apre la nuova tab con il token
nell'hash, e la pagina di destinazione (Segnalazioni o Booking) lo consuma con
`signInWithCustomToken`. Risultato: zero login intermedi all'interno della
famiglia di prodotti che vivono sul project Firebase `comune-digital-booking`.

## I due ambienti coinvolti

Comune.Digital usa **due project Firebase distinti**:

| Project Firebase | Cosa ospita | Dominio principale |
|---|---|---|
| `comune-digital-booking` | CMS, Segnalazioni, Booking, futura Officina | `cms.comune.digital`, `segnala.comune.digital`, `prenota.comune.digital` |
| `crm-comunedigital`      | CRM interno (anagrafica clienti, App, contratti, ecc.) | `crm.comune.digital` |

Le sessioni di Firebase Auth sono:

- **Per-project**: una sessione `comune-digital-booking` non vale come sessione
  `crm-comunedigital`, e viceversa.
- **Per-dominio**: anche all'interno dello stesso project, ogni dominio web
  (`cms.…`, `segnala.…`, `prenota.…`) ha la propria sessione in indexedDB.

Quindi senza intervento speciale, l'utente deve fare login una volta per
ogni dominio. L'Auth Bridge serve a evitarlo.

## Fase 1 — Bridge intra-project (implementato)

**Scopo:** dal CMS aprire le dashboard admin di Segnalazioni e Booking senza
ulteriore login.

### Pezzi del puzzle

1. **Cloud Function `issueAdminBridgeToken`** nel project booking
   (`firebase/functions/index.js` del repo `comune-digital-segnalazioni`).
   - Callable, region `europe-west1`.
   - Richiede `request.auth.uid` (utente loggato).
   - Verifica che l'UID sia in `superAdmins/{uid}`. Altrimenti
     `permission-denied`.
   - Audit log: scrive `authBridgeLog/{auto}` con uid, email, target,
     tenantSlug, ip, userAgent, timestamp.
   - Restituisce `{ token, uid, issuedAt }` dove `token` è un Custom Token
     Firebase con claim custom `adminBridgeOverride: true`.

2. **Pagina `/auth-bridge.html`** nel repo `comune-digital-segnalazioni`
   (e in futuro nel booking — vedi sotto). Carica `js/pages/auth-bridge.js`,
   che:
   - Estrae `#auth=<token>` dall'hash e `?next=...` dalla query.
   - Chiama `signInWithCustomToken(auth, token)` → sessione Firebase Auth sul
     dominio corrente.
   - Pulisce l'URL con `history.replaceState` (il token sparisce dalla
     cronologia e dai log).
   - Redirect a `next` (validato a path interno: regex `^\/[a-z0-9._/?=&%-]*$`).

3. **Lato CMS** (`public/js/app-section.js` del repo `comune-digital-cms`):
   - Helper `_openWithBridge(btn, { targetOrigin, targetPath, bridgeTarget, tenantSlug })`.
   - Chiamato da `data-action="bridge-admin-reports"` (Segnalazioni) e
     `data-action="bridge-admin-booking"` (Booking).
   - Costruisce l'URL ponte:
     `https://segnala.comune.digital/auth-bridge.html?next=%2Fadmin.html%3Ftenant%3DX#auth=<token>`

### Sicurezza

| Cosa | Mitigazione |
|---|---|
| Token leakage | Token nell'hash (`#`), non nei log server. URL pulito subito dopo signin. |
| Token replay | Validità intrinseca Firebase Custom Token: 1 ora. Lato client viene rimosso al primo uso. |
| Abuso function | Verifica `superAdmins/{uid}` lato server. |
| Auditing | Ogni emissione scrive su `authBridgeLog`. |
| Privilege escalation | Token ha solo claim `adminBridgeOverride`. Le rules Firestore mantengono i controlli normali per i dati. |

### Costi

Cloud Functions ha tier gratuito 2M invocazioni/mese. Con uso interno
~30K/mese siamo abbondantemente sotto.

### Reversibilità

Per disattivare il bridge:
1. Nel CMS, sostituire i bottoni `data-action="bridge-admin-*"` con i link
   diretti `<a href="https://segnala.comune.digital/admin.html?tenant=...">`.
2. La Cloud Function `issueAdminBridgeToken` può restare (non danneggia).
3. La pagina `auth-bridge.html` può restare (è una pagina morta se non viene
   linkata).

Niente di tutto questo intacca login manuali, sessioni, o flussi normali.

## Fase 2 — Bridge cross-project (CRM → CMS, da implementare)

**Scopo:** atterrare sul CMS già loggato venendo dal CRM, senza login.

Il CRM è su un project Firebase diverso (`crm-comunedigital`) dal booking.
La Cloud Function `issueAdminBridgeToken` non può essere chiamata dal CRM
perché:
1. L'utente loggato nel CRM ha un UID del project `crm-comunedigital`, ma la
   function gira nel project `comune-digital-booking` e si aspetta UID di lì.
2. Anche con Admin SDK cross-project servirebbe condividere service accounts,
   cosa rischiosa.

### Architettura proposta

Usare un **JWT firmato con coppia di chiavi RSA**:

1. Generare una coppia di chiavi RSA (2048 bit minimo). Chiave privata nel
   CRM (variabile d'ambiente / secret); chiave pubblica nel project booking.
2. Nel CRM, una Cloud Function `issueCmsBridgeJwt` emette un JWT firmato con
   la chiave privata, contenente `{ email, ruolo, exp: now+60s }`.
3. Sul CMS, una nuova pagina `/auth-bridge.html` legge `?jwt=...`, chiama
   una Cloud Function del booking `consumeCrmJwt`, che:
   - Verifica la firma del JWT con la chiave pubblica
   - Verifica `exp` < now + 60s
   - Verifica `ruolo !== 'AGENTE'` e `stato !== 'DISATTIVO'`
   - Cerca l'UID booking corrispondente all'email (via fetchSignInMethods o
     cache `superAdmins` per email)
   - Se non esiste, lo crea con la stessa logica del flusso "Sincronizza dal
     CRM" già esistente in `team-section.js`
   - Emette un Custom Token Firebase per quell'UID booking
   - Restituisce `{ token }` al client CMS
4. Il client CMS fa `signInWithCustomToken` e prosegue.

### Lavoro stimato

~mezza giornata. Da fare quando il problema "ridigitare la password CMS"
diventerà fastidioso al punto di valere lo sforzo.

## Convenzioni di mantenimento

- **Tutti i progetti della famiglia** devono riferire questo documento
  (lo includiamo per copia in CRM, CMS, Segnalazioni, Booking).
- Quando si modifica la logica del bridge, aggiornare **tutte le copie**.
- La collection di audit `authBridgeLog` è append-only, nessuno la deve
  modificare. Vedere/eventualmente esportare via Firestore Console.
- Cloud Functions: il deploy del bridge fa parte del deploy delle Functions
  nel repo `comune-digital-segnalazioni`
  (`firebase deploy --only functions:issueAdminBridgeToken`).

## Sintesi per chi entra nel team

- Ad oggi la giornata tipica di un super-admin del CMS richiede **una sola
  login** sul CMS al mattino. Da lì, ogni "Admin" sui tenant è zero-click.
- Solo la prima volta che il CMS legge dal CRM ti chiede di sbloccare la
  sessione CRM (password CRM, una volta per giornata di lavoro).
- Per il CRM stesso, il login resta separato finché non implementiamo la
  Fase 2.

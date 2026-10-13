/**
 * FORNITORI INIZIALI — Registro fornitori qualificati ISO 9001 (v10.8.0)
 * ----------------------------------------------------------------------------
 * Caricato SOLO dalla pagina Fornitori (pulsante "Carica fornitori iniziali").
 * Gli id sono fissi: ricaricare non crea doppioni.
 *
 * Dati oggettivi (ragione sociale, sede, certificazioni, DPA, SLA, dove stanno
 * i dati) verificati il 13/10/2026 sulle pagine ufficiali dei fornitori (link
 * nel campo "fonte" delle certificazioni). Le date di scadenza dei certificati
 * NON sono pubblicate da nessun fornitore: vanno inserite scaricando i PDF dai
 * trust center. I punteggi di valutazione NON sono precompilati: li dà la
 * Direzione con la prima valutazione.
 */
window.FORNITORI_INIZIALI_VERIFICA = '2026-10-13';

(function () {
    var VERIFICA = {
        dataVerificaDati: '2026-10-13',
        verificaDatiDa: 'analisi documentale online delle pagine ufficiali'
    };
    var QUALIFICA_NOTE = 'Fornitore già in uso all’avvio del registro (ottobre 2026): qualificato per storico delle forniture. ' +
        'Documentazione pubblica (condizioni, protezione dati, certificazioni) analizzata il 13/10/2026.';

    function f(dati) {
        var out = {};
        Object.keys(VERIFICA).forEach(function (k) { out[k] = VERIFICA[k]; });
        out.qualificaNote = QUALIFICA_NOTE;
        Object.keys(dati).forEach(function (k) { out[k] = dati[k]; });
        return out;
    }

    window.FORNITORI_INIZIALI = [
        f({
            id: 'goodbarber',
            nomeCommerciale: 'GoodBarber',
            ragioneSociale: 'GoodBarber SAS',
            sede: 'CampusPlex, 95 cours Napoléon, 20000 Ajaccio (Corsica)',
            paese: 'Francia (UE)',
            partitaIva: 'RCS Ajaccio 438 864 894',
            sitoWeb: 'https://www.goodbarber.com',
            contattoSupporto: 'https://www.goodbarber.com/contact/ — dpo@goodbarber.com',
            categoria: 'piattaforma_app',
            criticita: 'alta',
            motivazioneCriticita: 'Tutte le app dei Comuni sono costruite e pubblicate su GoodBarber: se si ferma, si fermano le app.',
            fornitura: 'Piattaforma no-code per creare, pubblicare e gestire le app mobili (iOS, Android, PWA).',
            utilizzo: 'App comunali di tutti i clienti, in qualità di reseller: contenuti, notifiche push, sezioni custom, statistiche.',
            alternative: 'Nessuna sostituzione rapida: cambiare piattaforma significa ricostruire le app. Mitigazione: backup dei contenuti e dei codici custom nei repository Growapp.',
            certificazioni: [],
            localizzazioneDati: 'Francia (tre data center francesi secondo la DPA). La DPA ammette sub-responsabili anche extra-UE (AWS, Google, Twilio, Stripe…) con clausole contrattuali tipo.',
            dpa: 'Sì — DPA standard del 16/06/2022 (https://www.goodbarber.com/dpa/), da firmare. Notifica violazioni entro 72 ore.',
            sla: 'Nessuno SLA pubblicato: i Terms escludono un servizio ininterrotto.',
            paginaTrust: 'https://www.goodbarber.com/privacy-compliance',
            paginaStatus: '',
            qualificaMetodi: ['storico', 'analisi_documentale', 'unico_disponibile'],
            note: 'Nessuna certificazione ISO/SOC dichiarata pubblicamente; nessuna pagina di stato pubblica. Fornitore critico: conviene chiedere un questionario di sicurezza e conservare la DPA firmata tra gli allegati.'
        }),
        f({
            id: 'aruba',
            nomeCommerciale: 'Aruba',
            ragioneSociale: 'Aruba S.p.A.',
            sede: 'Via San Clemente 53, 24036 Ponte San Pietro (BG)',
            paese: 'Italia (UE)',
            partitaIva: '01573850516',
            sitoWeb: 'https://www.aruba.it',
            contattoSupporto: 'https://assistenza.aruba.it',
            categoria: 'hosting_cloud',
            criticita: 'alta',
            motivazioneCriticita: 'Gestisce il dominio comune.digital e i suoi DNS: da lì passano gli indirizzi <comune>.comune.digital di tutte le app.',
            fornitura: 'Registrazione domini, DNS, posta elettronica (ed eventuale PEC).',
            utilizzo: 'Dominio comune.digital con DNS e posta (verificato sui record DNS il 13/10/2026). Se si usa la PEC Aruba, il contratto è con Aruba PEC S.p.A. (P.IVA 01879020517): indicarlo nelle note.',
            alternative: 'Trasferimento del dominio e dei DNS ad altro registrar (operazione di alcuni giorni, da pianificare).',
            certificazioni: [
                { nome: 'ISO 9001', ambito: 'Sistema di gestione per la qualità', scadenza: '', fonte: 'https://www.aruba.it/azienda/certificazioni.aspx' },
                { nome: 'ISO/IEC 27001 (estesa a 27017, 27018, 27035)', ambito: 'Sicurezza delle informazioni e cloud', scadenza: '', fonte: 'https://www.aruba.it/azienda/certificazioni.aspx' },
                { nome: 'ISO/IEC 27701', ambito: 'Gestione della privacy', scadenza: '', fonte: 'https://www.aruba.it/azienda/certificazioni.aspx' },
                { nome: 'ISO/IEC 20000-1', ambito: 'Gestione dei servizi IT', scadenza: '', fonte: 'https://www.aruba.it/azienda/certificazioni.aspx' },
                { nome: 'ISO 22301', ambito: 'Continuità operativa', scadenza: '', fonte: 'https://www.aruba.it/azienda/certificazioni.aspx' },
                { nome: 'CSA STAR Level 2', ambito: 'Sicurezza cloud', scadenza: '', fonte: 'https://www.aruba.it/azienda/certificazioni.aspx' },
                { nome: 'SOC 1 Type II (ISAE 3402)', ambito: 'Hosting, cloud e data center', scadenza: '', fonte: 'https://www.aruba.it/azienda/certificazioni.aspx' },
                { nome: 'Qualificazione ACN QC3', ambito: 'Solo Virtual Private Cloud e Hosted Private Cloud (non l’hosting condiviso)', scadenza: '', fonte: 'https://www.aruba.it/azienda/certificazioni.aspx' }
            ],
            localizzazioneDati: 'Italia — data center di Ponte San Pietro (BG), Arezzo e Roma.',
            dpa: 'Sì — nomina a responsabile (art. 28 GDPR) all’art. 23 delle Condizioni di fornitura hosting (v. 4.7 del 07/07/2026).',
            sla: '99,95% annuo pubblicato da Aruba Business per DNS, web, database e posta; per domini, email e PEC nessuna percentuale pubblicata.',
            paginaTrust: 'https://www.aruba.it/azienda/certificazioni.aspx',
            paginaStatus: '',
            qualificaMetodi: ['storico', 'certificazioni', 'analisi_documentale'],
            note: 'Unico fornitore italiano, profilo di certificazione più completo (anche ISO 9001). Le date di scadenza dei certificati non sono pubblicate: richiederle o scaricare i PDF dalla pagina certificazioni.'
        }),
        f({
            id: 'google',
            nomeCommerciale: 'Google (Firebase e Gemini)',
            ragioneSociale: 'Google Cloud Italy S.r.l. (servizi a pagamento fatturati in Italia) — Google LLC (servizi gratuiti)',
            sede: 'Via Federico Confalonieri 4, 20124 Milano — Google LLC: 1600 Amphitheatre Parkway, Mountain View, CA 94043, USA',
            paese: 'Italia (contraente) / USA',
            partitaIva: '',
            sitoWeb: 'https://firebase.google.com',
            contattoSupporto: 'https://firebase.google.com/support',
            categoria: 'hosting_cloud',
            criticita: 'alta',
            motivazioneCriticita: 'Firebase è il database e il sistema di accesso del CRM e degli altri servizi Growapp: se si ferma, si fermano CRM e servizi collegati.',
            fornitura: 'Firebase / Google Cloud (database Firestore, autenticazione, archivio file, notifiche FCM) e API Gemini (intelligenza artificiale).',
            utilizzo: 'CRM Comune.Digital, archivio notifiche, booking, segnalazioni e CMS (database, login, file, notifiche push). Gemini: servizi di intelligenza artificiale (indicare quali).',
            alternative: 'Database: migrazione possibile ma onerosa (settimane). Gemini: sostituibile con altri modelli AI (Anthropic, OpenAI).',
            certificazioni: [
                { nome: 'ISO/IEC 27001:2022', ambito: 'Google Cloud, inclusi Firestore, Firebase Authentication, Cloud Storage, FCM (la Gemini API di AI Studio non è nel perimetro)', scadenza: '', fonte: 'https://cloud.google.com/security/compliance/iso-27001' },
                { nome: 'ISO/IEC 27017 e 27018', ambito: 'Firestore, Cloud Storage, Firebase Authentication', scadenza: '', fonte: 'https://firebase.google.com/support/privacy' },
                { nome: 'SOC 1, SOC 2, SOC 3', ambito: 'Servizi Firebase', scadenza: '', fonte: 'https://firebase.google.com/support/privacy' },
                { nome: 'ISO/IEC 42001:2023', ambito: 'Google Cloud / Vertex AI (non la Gemini API di AI Studio)', scadenza: '', fonte: 'https://cloud.google.com/security/compliance/iso-42001' },
                { nome: 'Qualificazione ACN livello 2', ambito: 'Infrastruttura e parte dei servizi Google Cloud', scadenza: '', fonte: 'https://cloud.google.com/security/compliance/acn-italy' }
            ],
            localizzazioneDati: 'Firestore e Storage nella location scelta alla creazione del progetto (da verificare in console); Firebase Authentication solo USA. Gemini API: qualunque Paese con strutture Google. Trasferimenti coperti da EU-US Data Privacy Framework.',
            dpa: 'Sì — Firebase Data Processing and Security Terms; per la Gemini API a pagamento il Cloud Data Processing Addendum. La Gemini API gratuita non ha DPA.',
            sla: 'Firestore ≥ 99,99% (regionale) / 99,999% (multi-region); Cloud Storage ≥ 99,9%; solo piani a pagamento. Gemini API: nessuno SLA.',
            paginaTrust: 'https://cloud.google.com/security/compliance',
            paginaStatus: 'https://status.firebase.google.com',
            qualificaMetodi: ['storico', 'certificazioni', 'analisi_documentale'],
            note: 'P.IVA Google Cloud Italy da riportare dalla fattura Google (fonti non ufficiali indicano 11256580967). Per avere garanzie certificate sull’AI servirebbe Gemini via Vertex AI anziché AI Studio.'
        }),
        f({
            id: 'vercel',
            nomeCommerciale: 'Vercel',
            ragioneSociale: 'Vercel Inc.',
            sede: '440 N Barranca Ave #4133, Covina, CA 91723',
            paese: 'USA',
            partitaIva: '',
            sitoWeb: 'https://vercel.com',
            contattoSupporto: 'https://vercel.com/help',
            categoria: 'hosting_cloud',
            criticita: 'alta',
            motivazioneCriticita: 'Ospita il CRM e le funzioni server (proxy RSS, notifiche, AI) usate anche dalle home delle app.',
            fornitura: 'Hosting di siti e funzioni serverless con pubblicazione automatica dal repository.',
            utilizzo: 'CRM crm.comune.digital, proxy RSS e immagini per le app, invio notifiche, sincronizzazioni pianificate (cron), assistente AI del CRM.',
            alternative: 'Netlify, Cloudflare Pages o hosting tradizionale: migrazione di alcuni giorni.',
            certificazioni: [
                { nome: 'SOC 2 Type II', ambito: 'Periodo 01/07/2025 – 30/06/2026, auditor Schellman', scadenza: '', fonte: 'https://security.vercel.com' },
                { nome: 'ISO/IEC 27001:2022', ambito: '', scadenza: '', fonte: 'https://security.vercel.com' },
                { nome: 'SOC 3', ambito: '', scadenza: '', fonte: 'https://security.vercel.com' },
                { nome: 'PCI DSS v4.0', ambito: '', scadenza: '', fonte: 'https://vercel.com/security' }
            ],
            localizzazioneDati: 'USA (infrastruttura AWS). Region delle funzioni non impostata nel progetto: default iad1 (Washington).',
            dpa: 'Sì — https://vercel.com/legal/dpa',
            sla: '99,99% solo con piano Enterprise; nessuno SLA per Hobby e Pro.',
            paginaTrust: 'https://security.vercel.com',
            paginaStatus: 'https://www.vercel-status.com',
            qualificaMetodi: ['storico', 'certificazioni', 'analisi_documentale'],
            note: 'Indicare nel campo contratto il piano sottoscritto (Hobby/Pro). Valutare se impostare una region UE (es. fra1) per le funzioni.'
        }),
        f({
            id: 'github',
            nomeCommerciale: 'GitHub',
            ragioneSociale: 'GitHub, Inc. (gruppo Microsoft)',
            sede: '88 Colin P. Kelly Jr. St., San Francisco, CA 94107',
            paese: 'USA',
            partitaIva: '',
            sitoWeb: 'https://github.com',
            contattoSupporto: 'https://support.github.com',
            categoria: 'sviluppo',
            criticita: 'media',
            motivazioneCriticita: 'Se si ferma non si possono pubblicare aggiornamenti, ma i servizi già in linea continuano a funzionare.',
            fornitura: 'Repository del codice sorgente e versionamento.',
            utilizzo: 'Codice di CRM, CMS, booking, segnalazioni e webapp; ogni pubblicazione su Vercel parte da GitHub.',
            alternative: 'GitLab o Bitbucket; ogni computer di sviluppo ha una copia completa del codice.',
            certificazioni: [
                { nome: 'SOC 1 Type 2, SOC 2 Type 2', ambito: 'GitHub.com / Enterprise Cloud', scadenza: '', fonte: 'https://docs.github.com/en/enterprise-cloud@latest/admin/overview/accessing-compliance-reports-for-your-enterprise' },
                { nome: 'ISO/IEC 27001:2022', ambito: '', scadenza: '', fonte: 'https://docs.github.com/en/enterprise-cloud@latest/admin/overview/accessing-compliance-reports-for-your-enterprise' },
                { nome: 'CSA STAR Level 2', ambito: '', scadenza: '', fonte: 'https://docs.github.com/en/enterprise-cloud@latest/admin/overview/accessing-compliance-reports-for-your-enterprise' }
            ],
            localizzazioneDati: 'USA e altri Paesi; region UE solo con GitHub Enterprise Cloud. Trasferimenti con Data Privacy Framework e clausole tipo.',
            dpa: 'Sì — GitHub Data Protection Agreement (https://github.com/customer-terms/github-data-protection-agreement).',
            sla: '99,9% solo per Enterprise Cloud; nessuno SLA sui piani Free e Team.',
            paginaTrust: 'https://docs.github.com/en/enterprise-cloud@latest/admin/overview/accessing-compliance-reports-for-your-enterprise',
            paginaStatus: 'https://www.githubstatus.com',
            qualificaMetodi: ['storico', 'certificazioni', 'analisi_documentale'],
            note: ''
        }),
        f({
            id: 'anthropic',
            nomeCommerciale: 'Anthropic',
            ragioneSociale: 'Anthropic Ireland, Limited',
            sede: '6th Floor, South Bank House, Barrow Street, Dublino 4, D04 TR29',
            paese: 'Irlanda (UE)',
            partitaIva: '',
            sitoWeb: 'https://www.anthropic.com',
            contattoSupporto: 'https://support.claude.com',
            categoria: 'intelligenza_artificiale',
            criticita: 'media',
            motivazioneCriticita: 'Le funzioni AI si degradano, ma CRM e app continuano a funzionare.',
            fornitura: 'Modelli di intelligenza artificiale Claude tramite API.',
            utilizzo: 'Assistente AI del CRM, classificazione notizie del Monitor RSS, generazione lettere, lettura documenti, chat di pubblicazione sulle app.',
            alternative: 'OpenAI o Google Gemini, con adattamento dei prompt.',
            certificazioni: [
                { nome: 'ISO/IEC 27001:2022', ambito: 'Prodotti commerciali (API)', scadenza: '', fonte: 'https://support.claude.com/en/articles/10015870-what-certifications-has-anthropic-obtained' },
                { nome: 'ISO/IEC 42001:2023', ambito: 'Gestione dell’intelligenza artificiale', scadenza: '', fonte: 'https://support.claude.com/en/articles/10015870-what-certifications-has-anthropic-obtained' },
                { nome: 'SOC 2 Type II', ambito: 'Prodotti commerciali', scadenza: '', fonte: 'https://support.claude.com/en/articles/10015870-what-certifications-has-anthropic-obtained' }
            ],
            localizzazioneDati: 'Dati conservati negli USA; elaborazione globale. Nessuna opzione UE sull’API diretta. Contratto con entità irlandese.',
            dpa: 'Sì — Data Processing Addendum incluso nei Commercial Terms (https://www.anthropic.com/legal/data-processing-addendum).',
            sla: 'Nessuno SLA contrattuale; obiettivo 99,5% solo con Priority Tier.',
            paginaTrust: 'https://trust.anthropic.com',
            paginaStatus: 'https://status.claude.com',
            qualificaMetodi: ['storico', 'certificazioni', 'analisi_documentale'],
            note: ''
        }),
        f({
            id: 'openai',
            nomeCommerciale: 'OpenAI',
            ragioneSociale: 'OpenAI Ireland Ltd',
            sede: '1st Floor, The Liffey Trust Centre, 117-126 Sheriff Street Upper, Dublino 1, D01 YC43',
            paese: 'Irlanda (UE)',
            partitaIva: '',
            sitoWeb: 'https://openai.com',
            contattoSupporto: 'https://help.openai.com',
            categoria: 'intelligenza_artificiale',
            criticita: 'media',
            motivazioneCriticita: 'Le funzioni AI si degradano, ma i servizi principali continuano a funzionare.',
            fornitura: 'Modelli di intelligenza artificiale tramite API.',
            utilizzo: 'Servizi AI di Growapp (indicare quali: non risulta usato dal CRM).',
            alternative: 'Anthropic o Google Gemini, con adattamento dei prompt.',
            certificazioni: [
                { nome: 'SOC 2 Type 2', ambito: 'API Platform, periodo 01/07/2025 – 30/06/2026', scadenza: '', fonte: 'https://trust.openai.com' },
                { nome: 'ISO/IEC 27001:2022', ambito: 'API, ChatGPT Enterprise ed Edu', scadenza: '', fonte: 'https://trust.openai.com' },
                { nome: 'ISO/IEC 27017, 27018, 27701', ambito: 'Stesso perimetro della 27001', scadenza: '', fonte: 'https://trust.openai.com' },
                { nome: 'ISO/IEC 42001:2023', ambito: '', scadenza: '', fonte: 'https://trust.openai.com' }
            ],
            localizzazioneDati: 'USA per impostazione predefinita; residenza dati in Europa disponibile per progetti creati con region Europe.',
            dpa: 'Sì — Data Processing Addendum (https://openai.com/policies/data-processing-addendum/).',
            sla: '99,9% solo con Scale Tier (Enterprise); nessuno SLA sui piani standard.',
            paginaTrust: 'https://trust.openai.com',
            paginaStatus: 'https://status.openai.com',
            qualificaMetodi: ['storico', 'certificazioni', 'analisi_documentale'],
            note: 'Indirizzo tratto dalla privacy policy UE: ricontrollare sulla fattura.'
        }),
        f({
            id: 'elevenlabs',
            nomeCommerciale: 'ElevenLabs',
            ragioneSociale: 'Eleven Labs Inc.',
            sede: '169 Madison Ave #2484, New York, NY 10016',
            paese: 'USA (entità UE: ElevenLabs Poland sp. z o.o., Varsavia)',
            partitaIva: '',
            sitoWeb: 'https://elevenlabs.io',
            contattoSupporto: 'https://help.elevenlabs.io',
            categoria: 'intelligenza_artificiale',
            criticita: 'media',
            motivazioneCriticita: 'Gli audio già prodotti restano utilizzabili; si ferma solo la produzione di nuovi audio.',
            fornitura: 'Sintesi vocale con intelligenza artificiale (voci e file audio).',
            utilizzo: 'Audioguide e contenuti audio per le app turistiche e dei Comuni.',
            alternative: 'Altri servizi di sintesi vocale (Google, Microsoft, OpenAI) o registrazione con speaker.',
            certificazioni: [
                { nome: 'SOC 2 Type II', ambito: 'Report disponibile su richiesta', scadenza: '', fonte: 'https://elevenlabs.io/dpa' },
                { nome: 'ISO/IEC 27001', ambito: 'Dichiarata nelle pagine commerciali', scadenza: '', fonte: 'https://compliance.elevenlabs.io' }
            ],
            localizzazioneDati: 'USA; residenza dati UE solo con piano Enterprise. Trasferimenti con Data Privacy Framework e clausole tipo.',
            dpa: 'Sì — https://elevenlabs.io/dpa (aggiornata 08/04/2026).',
            sla: 'Nessuno SLA pubblicato.',
            paginaTrust: 'https://compliance.elevenlabs.io',
            paginaStatus: 'https://status.elevenlabs.io',
            qualificaMetodi: ['storico', 'certificazioni', 'analisi_documentale'],
            note: 'Le certificazioni sono dichiarate in modo non uniforme tra le pagine: scaricare i certificati dal trust center e allegarli.'
        }),
        f({
            id: 'rssapp',
            nomeCommerciale: 'rss.app',
            ragioneSociale: 'FeedsApp Inc.',
            sede: '',
            paese: 'USA',
            partitaIva: '',
            sitoWeb: 'https://rss.app',
            contattoSupporto: 'support@rss.app',
            categoria: 'dati_contenuti',
            criticita: 'media',
            motivazioneCriticita: 'Se si ferma, gli slider notizie ed eventi delle app che usano questi feed restano vuoti; il resto dell’app funziona.',
            fornitura: 'Generazione di feed RSS da siti e pagine social che non ne hanno uno.',
            utilizzo: 'Feed per gli slider notizie/eventi e il ticker nelle home delle app.',
            alternative: 'Feed RSS nativi dei siti comunali, altri generatori di feed (es. FetchRSS) o feed costruiti dal CMS.',
            certificazioni: [],
            localizzazioneDati: 'USA. Tratta solo contenuti pubblici, nessun dato personale dei cittadini.',
            dpa: 'Non disponibile.',
            sla: 'Nessuno: i Terms non garantiscono la disponibilità.',
            paginaTrust: '',
            paginaStatus: '',
            qualificaMetodi: ['storico', 'analisi_documentale'],
            note: 'Fornitore a basse garanzie (nessun indirizzo, certificazione o DPA pubblicati): ammesso solo per contenuti pubblici, senza dati personali.'
        }),
        f({
            id: 'telegram',
            nomeCommerciale: 'Telegram',
            ragioneSociale: 'Telegram Messenger Inc.',
            sede: 'Non pubblicata — rappresentante UE: EDPO, Avenue Huart Hamoir 71, 1030 Bruxelles',
            paese: 'Non dichiarato (gruppo con società a Dubai e Isole Vergini Britanniche)',
            partitaIva: '',
            sitoWeb: 'https://telegram.org',
            contattoSupporto: 'https://telegram.org/support',
            categoria: 'comunicazione',
            criticita: 'bassa',
            motivazioneCriticita: 'Canale di comunicazione sostituibile subito con email, telefono o altre chat.',
            fornitura: 'Messaggistica e bot.',
            utilizzo: 'Gruppi di supporto con i referenti dei Comuni e avvisi interni sui task urgenti.',
            alternative: 'Email, telefono, WhatsApp Business.',
            certificazioni: [],
            localizzazioneDati: 'Utenti UE: data center di terzi nei Paesi Bassi.',
            dpa: 'Non disponibile: Telegram è titolare autonomo del trattamento.',
            sla: 'Nessuno: servizio gratuito senza garanzie di disponibilità.',
            paginaTrust: '',
            paginaStatus: '',
            qualificaMetodi: ['storico', 'analisi_documentale'],
            note: 'Servizio consumer gratuito senza contratto business: usarlo solo per comunicazioni operative non riservate, senza dati personali dei cittadini.'
        }),
        f({
            id: 'openmeteo',
            nomeCommerciale: 'Open-Meteo',
            ragioneSociale: 'OpenMeteo GmbH',
            sede: 'Hintere Schilligmatte 6, 6463 Bürglen (UR)',
            paese: 'Svizzera (Paese adeguato UE)',
            partitaIva: 'CHE-332.429.722 MWST',
            sitoWeb: 'https://open-meteo.com',
            contattoSupporto: 'info@open-meteo.com',
            categoria: 'dati_contenuti',
            criticita: 'bassa',
            motivazioneCriticita: 'Se si ferma, nelle home delle app non compare il meteo; il resto funziona.',
            fornitura: 'Dati e previsioni meteo e meteomarine tramite API.',
            utilizzo: 'Widget meteo e barra data nelle home delle app dei Comuni; widget “Com’è il mare oggi?”.',
            alternative: 'Altre API meteo (es. OpenWeather, servizi meteo regionali).',
            certificazioni: [],
            localizzazioneDati: 'Server in Europa e Nord America; nessun dato personale (solo coordinate del Comune).',
            dpa: 'Non disponibile.',
            sla: 'Nessuno sull’API gratuita; obiettivo 99,9% solo sui piani a pagamento.',
            paginaTrust: '',
            paginaStatus: 'https://status.open-meteo.com',
            qualificaMetodi: ['storico', 'analisi_documentale'],
            note: 'ATTENZIONE: l’API gratuita è riservata all’uso non commerciale. Per le app vendute ai Comuni valutare un piano a pagamento (https://open-meteo.com/en/pricing). Dati in licenza CC BY 4.0: serve l’attribuzione.'
        })
    ];
})();

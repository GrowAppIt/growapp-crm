/**
 * Generatore Webapp - CRM Page
 * Page for managing and generating customized HTML webapps for Italian municipalities
 * Part of Growapp S.r.l. CRM system
 */

const GeneratoreWebapp = (() => {
  // Private variables
  const FRAZIONI_RIFIUTI = [
    { id: 'umido', label: 'Umido', colore: '#8BC34A', icona: 'fa-seedling', cssClass: 'wp-umido' },
    { id: 'indiff', label: 'Indifferenziato', colore: '#757575', icona: 'fa-trash', cssClass: 'wp-indiff' },
    { id: 'plastica', label: 'Plastica', colore: '#FF9800', icona: 'fa-bottle-water', cssClass: 'wp-plastica' },
    { id: 'vetro', label: 'Vetro', colore: '#4CAF50', icona: 'fa-wine-bottle', cssClass: 'wp-vetro' },
    { id: 'carta', label: 'Carta e cartone', colore: '#2196F3', icona: 'fa-newspaper', cssClass: 'wp-carta' },
    { id: 'alluminio', label: 'Alluminio', colore: '#9E9E9E', icona: 'fa-can-food', cssClass: 'wp-alluminio' },
    { id: 'olio', label: 'Olio esausto', colore: '#795548', icona: 'fa-oil-can', cssClass: 'wp-olio' },
    { id: 'ingombranti', label: 'Ingombranti', colore: '#6D4C41', icona: 'fa-couch', cssClass: 'wp-ingombranti' }
  ];

  const DEFAULT_CALENDARIO = {
    1: ['umido', 'ingombranti'],
    2: ['indiff'],
    3: ['umido', 'plastica'],
    4: ['vetro', 'olio'],
    5: ['umido', 'alluminio'],
    6: ['umido', 'carta']
  };

  const SEZIONI_LABELS = {
    base: 'Info Base',
    calendario: 'Calendario',
    servizi: 'Servizi',
    commerciali: 'Attività Commerciali',
    documenti: 'Documenti',
    link: 'Link e URL'
  };

  let state = {
    templates: {},
    currentTab: 'modelli',
    currentGenerationTemplate: null,
    formValues: {}
  };

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  function generateUniqueId() {
    return 'custom_' + Date.now();
  }

  // ============================================================================
  // FIRESTORE OPERATIONS
  // ============================================================================

  function _loadTemplates() {
    UI.showLoading();
    return db.collection('impostazioni').doc('webapp_templates').get()
      .then(doc => {
        if (doc.exists && doc.data().templates) {
          state.templates = doc.data().templates;
          // Migrazione: aggiungi nuovi modelli predefiniti se mancanti
          return _migrateNewDefaults();
        } else {
          // Initialize with defaults if document doesn't exist
          return _initDefaultTemplates();
        }
      })
      .then(() => {
        UI.hideLoading();
        _renderModels();
      })
      .catch(error => {
        UI.hideLoading();
        UI.showError('Errore nel caricamento dei modelli: ' + error.message);
        console.error('Error loading templates:', error);
      });
  }

  function _migrateNewDefaults() {
    let needsSave = false;

    // Definizione aggiornata del modello Cartolina 8 Marzo
    var CARTOLINA_VERSION = '2.2'; // Bump: quote più larga, testi leggibili, URL comunedigital.it

    // Aggiungi o aggiorna Cartolina 8 Marzo se mancante o versione vecchia
    if (!state.templates['cartolina_8_marzo'] || state.templates['cartolina_8_marzo'].versione !== CARTOLINA_VERSION) {
      state.templates['cartolina_8_marzo'] = {
        id: 'cartolina_8_marzo',
        nome: 'Cartolina 8 Marzo',
        descrizione: 'Cartolina digitale per la Festa della Donna con condivisione social',
        icona: 'fa-heart',
        colore: '#C2185B',
        versione: CARTOLINA_VERSION,
        multiFile: true,
        campiVariabili: [
          { id: 'nome_comune', label: 'Nome Comune', tipo: 'text', required: true, sezione: 'base', placeholder: 'es. Candela' },
          { id: 'url_stemma', label: 'URL Logo/Stemma Comune (opzionale)', tipo: 'text', required: false, sezione: 'base', placeholder: 'https://...' },
          { id: 'url_cartolina_view', label: 'URL API cartolina (endpoint Vercel)', tipo: 'text', required: true, sezione: 'link', placeholder: 'https://tuodominio.vercel.app/api/cartolina-view', default: 'https://growapp-crm.vercel.app/api/cartolina-view' },
          { id: 'url_scarica_app', label: 'URL scarica app', tipo: 'text', required: true, sezione: 'link', placeholder: 'https://example.com/scarica-app' },
          { id: 'url_homepage', label: 'URL homepage app', tipo: 'text', required: true, sezione: 'link', placeholder: 'https://example.com' }
        ],
        files: [
          { id: 'crea', nome: 'cartolina-crea.html', label: 'Pagina Creazione Cartolina', codiceHTML: _getDefaultTemplateCartolina8MarzoCrea() },
          { id: 'view', nome: 'cartolina-view.html', label: 'Pagina Visualizzazione Cartolina', codiceHTML: _getDefaultTemplateCartolina8MarzoView() }
        ],
        isDefault: true,
        ordine: 2,
        createdAt: new Date().toISOString(),
        createdBy: 'Sistema'
      };
      needsSave = true;
      console.log('[GeneratoreWebapp] Migrazione: aggiornato modello Cartolina 8 Marzo a v' + CARTOLINA_VERSION);
    }

    if (needsSave) {
      return _saveAllTemplates();
    }
  }

  function _initDefaultTemplates() {
    state.templates = {
      'raccolta_differenziata': {
        id: 'raccolta_differenziata',
        nome: 'Raccolta Differenziata',
        descrizione: 'Calendario raccolta rifiuti con guida frazioni',
        icona: 'fa-recycle',
        colore: '#3CA434',
        versione: '1.0',
        campiVariabili: [
          { id: 'nome_comune', label: 'Nome Comune', tipo: 'text', required: true, sezione: 'base', placeholder: 'es. Candela' },
          { id: 'anno', label: 'Anno di riferimento', tipo: 'text', required: true, sezione: 'base', default: '2026' },
          { id: 'url_stemma', label: 'URL Stemma Comune (opzionale)', tipo: 'text', required: false, sezione: 'base', placeholder: 'https://...' },
          { id: 'url_pdf', label: 'URL PDF Calendario ufficiale', tipo: 'text', required: false, sezione: 'documenti', placeholder: 'https://...' },
          { id: 'calendario', label: 'Calendario settimanale', tipo: 'calendario_rifiuti', required: true, sezione: 'calendario' },
          { id: 'festivita', label: 'Festività senza raccolta', tipo: 'lista_date', required: false, sezione: 'calendario' },
          { id: 'telefono_ingombranti', label: 'Telefono prenotazione ingombranti', tipo: 'tel', required: false, sezione: 'servizi', placeholder: 'es. 339 1234567' },
          { id: 'giorno_ingombranti', label: 'Giorno ritiro ingombranti', tipo: 'select', required: false, sezione: 'servizi', options: ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'] },
          { id: 'max_pezzi', label: 'Max pezzi per ritiro', tipo: 'number', required: false, sezione: 'servizi', default: '2' },
          { id: 'punti_olio', label: 'Punti raccolta olio esausto', tipo: 'lista_testi', required: false, sezione: 'servizi', placeholder: 'es. Via Roma 1' },
          { id: 'giorni_carta_comm', label: 'Giorni raccolta carta attività commerciali', tipo: 'text', required: false, sezione: 'commerciali', placeholder: 'es. martedì e sabato' },
          { id: 'giorni_vetro_comm', label: 'Giorni raccolta vetro attività commerciali', tipo: 'text', required: false, sezione: 'commerciali', placeholder: 'es. martedì e giovedì' },
          { id: 'orari_isola', label: 'Orari isola ecologica', tipo: 'text', required: false, sezione: 'commerciali', placeholder: 'es. Lun-Ven 9:00-12:00' }
        ],
        codiceHTML: _getDefaultTemplateRaccoltaDifferenziata(),
        isDefault: true,
        ordine: 1,
        createdAt: new Date().toISOString(),
        createdBy: 'Sistema'
      },
      'cartolina_8_marzo': {
        id: 'cartolina_8_marzo',
        nome: 'Cartolina 8 Marzo',
        descrizione: 'Cartolina digitale per la Festa della Donna con condivisione social',
        icona: 'fa-heart',
        colore: '#C2185B',
        versione: '2.2',
        multiFile: true,
        campiVariabili: [
          { id: 'nome_comune', label: 'Nome Comune', tipo: 'text', required: true, sezione: 'base', placeholder: 'es. Candela' },
          { id: 'url_stemma', label: 'URL Logo/Stemma Comune (opzionale)', tipo: 'text', required: false, sezione: 'base', placeholder: 'https://...' },
          { id: 'url_cartolina_view', label: 'URL API cartolina (endpoint Vercel)', tipo: 'text', required: true, sezione: 'link', placeholder: 'https://tuodominio.vercel.app/api/cartolina-view', default: 'https://growapp-crm.vercel.app/api/cartolina-view' },
          { id: 'url_scarica_app', label: 'URL scarica app', tipo: 'text', required: true, sezione: 'link', placeholder: 'https://example.com/scarica-app' },
          { id: 'url_homepage', label: 'URL homepage app', tipo: 'text', required: true, sezione: 'link', placeholder: 'https://example.com' }
        ],
        files: [
          { id: 'crea', nome: 'cartolina-crea.html', label: 'Pagina Creazione Cartolina', codiceHTML: _getDefaultTemplateCartolina8MarzoCrea() },
          { id: 'view', nome: 'cartolina-view.html', label: 'Pagina Visualizzazione Cartolina (anteprima CRM)', codiceHTML: _getDefaultTemplateCartolina8MarzoView() }
        ],
        isDefault: true,
        ordine: 2,
        createdAt: new Date().toISOString(),
        createdBy: 'Sistema'
      }
    };

    return _saveAllTemplates();
  }

  function _getDefaultTemplateRaccoltaDifferenziata() {
    return '<!DOCTYPE html>\n' +
'<html lang="it">\n' +
'<head>\n' +
'    <meta charset="UTF-8">\n' +
'    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">\n' +
'    <title>Raccolta Differenziata - Comune di {{nome_comune}}</title>\n' +
'    <link rel="preconnect" href="https://fonts.googleapis.com">\n' +
'    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
'    <link href="https://fonts.googleapis.com/css2?family=Titillium+Web:wght@300;400;600;700&display=swap" rel="stylesheet">\n' +
'    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">\n' +
'    <style>\n' +
'        :root {\n' +
'            --primary-blue: #145284; --secondary-green: #3CA434; --green-100: #E2F8DE;\n' +
'            --hover-blue: #2E6DA8; --white: #FFFFFF; --section-green-bg: #A4E89A;\n' +
'            --col-umido: #8BC34A; --col-indiff: #757575; --col-plastica: #FF9800;\n' +
'            --col-vetro: #4CAF50; --col-carta: #2196F3; --col-alluminio: #9E9E9E;\n' +
'            --col-olio: #795548; --col-ingombranti: #6D4C41;\n' +
'            --glass-bg: rgba(255,255,255,0.92); --glass-border: rgba(255,255,255,0.6);\n' +
'            --glass-shadow: 0 18px 45px rgba(0,0,0,0.35);\n' +
'            --radius-xl: 26px; --radius-lg: 18px;\n' +
'        }\n' +
'        * { box-sizing: border-box; margin: 0; padding: 0; font-family: "Titillium Web", system-ui, sans-serif; }\n' +
'        body { min-height: 100vh; background: radial-gradient(circle at top left, #3CA434 0%, #145284 45%, #0b304c 100%); color: #222; padding: 16px 12px 90px 12px; }\n' +
'        @media (min-width: 768px) { body { display: flex; justify-content: center; } }\n' +
'        .app-shell { width: 100%; max-width: 960px; }\n' +
'        .app-header { color: var(--white); padding: 10px 4px 18px 4px; display: flex; align-items: center; gap: 12px; }\n' +
'        .app-logo { width: 52px; height: 52px; border-radius: 999px; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.4); display: flex; align-items: center; justify-content: center; overflow: hidden; }\n' +
'        .app-logo img { width: 100%; height: 100%; object-fit: cover; }\n' +
'        .app-logo span { font-size: 11px; text-align: center; line-height: 1.1; font-weight: 600; }\n' +
'        .app-title-block { flex: 1; }\n' +
'        .app-title { font-weight: 700; font-size: 22px; letter-spacing: 0.4px; }\n' +
'        .app-subtitle { font-size: 14px; opacity: 0.9; margin-top: 2px; }\n' +
'        .banner-tonight { background: linear-gradient(135deg, #145284, #2E6DA8); border-radius: var(--radius-lg); border: 1px solid rgba(255,255,255,0.5); box-shadow: 0 10px 25px rgba(0,0,0,0.4); padding: 10px; display: flex; align-items: center; gap: 10px; color: var(--white); margin-bottom: 16px; backdrop-filter: blur(12px); }\n' +
'        .banner-tonight-icon { width: 38px; height: 38px; border-radius: 999px; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }\n' +
'        .banner-tonight-text { flex: 1; background: rgba(255,255,255,0.12); border-radius: 16px; padding: 6px 10px; }\n' +
'        .banner-tonight-text small { font-size: 12px; opacity: 0.9; }\n' +
'        .banner-tonight-main { font-size: 15px; font-weight: 600; }\n' +
'        .banner-tonight-main span { font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }\n' +
'        .banner-tonight-extra { font-size: 11px; opacity: 0.9; margin-top: 2px; }\n' +
'        .nav-pills { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }\n' +
'        .nav-pill-btn { flex: 1 1 calc(50% - 8px); border-radius: 999px; border: 1px solid rgba(255,255,255,0.7); padding: 8px 10px; font-size: 13px; color: var(--white); background: rgba(255,255,255,0.06); display: inline-flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; backdrop-filter: blur(10px); transition: background 0.2s ease, transform 0.15s ease; text-align: center; }\n' +
'        .nav-pill-btn i { font-size: 13px; }\n' +
'        .nav-pill-btn.active { background: var(--secondary-green); border-color: var(--secondary-green); box-shadow: 0 6px 18px rgba(0,0,0,0.35); }\n' +
'        @media (min-width: 768px) { .nav-pill-btn { flex: 0 0 auto; min-width: 150px; } }\n' +
'        .card { background: var(--glass-bg); border-radius: var(--radius-xl); border: 1px solid var(--glass-border); box-shadow: var(--glass-shadow); padding: 16px 16px 18px 16px; margin-bottom: 16px; }\n' +
'        .card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; border-bottom: 1px solid rgba(20,82,132,0.1); padding-bottom: 6px; }\n' +
'        .card-header i { font-size: 20px; color: var(--secondary-green); }\n' +
'        .card-title { font-weight: 700; font-size: 18px; color: var(--primary-blue); }\n' +
'        .card-subtitle { font-size: 13px; color: #4b4b4b; margin-bottom: 8px; }\n' +
'        .section-panel { display: none; animation: fadeIn 0.3s ease; }\n' +
'        .section-panel.active { display: block; }\n' +
'        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }\n' +
'        .calendar-list { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }\n' +
'        .cal-row { background: #fff; border-radius: 16px; border: 1px solid #e0e7f0; padding: 8px 10px; display: flex; align-items: center; gap: 8px; position: relative; overflow: hidden; }\n' +
'        .cal-row::before { content: ""; width: 4px; align-self: stretch; border-radius: 999px; background: rgba(20,82,132,0.4); }\n' +
'        .cal-row-day { width: 60px; font-size: 13px; font-weight: 700; text-transform: uppercase; color: #555; }\n' +
'        .cal-row-tags { flex: 1; display: flex; flex-wrap: wrap; gap: 4px; }\n' +
'        .waste-pill { border-radius: 999px; padding: 3px 9px; font-size: 12px; font-weight: 600; color: #fff; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 2px 6px rgba(0,0,0,0.18); }\n' +
'        .wp-umido { background: var(--col-umido); } .wp-indiff { background: var(--col-indiff); }\n' +
'        .wp-plastica { background: var(--col-plastica); } .wp-vetro { background: var(--col-vetro); }\n' +
'        .wp-carta { background: var(--col-carta); } .wp-alluminio { background: var(--col-alluminio); }\n' +
'        .wp-olio { background: var(--col-olio); } .wp-ingombranti { background: var(--col-ingombranti); }\n' +
'        .cal-row.no-pickup .cal-row-tags { font-size: 12px; color: #a2a2a2; }\n' +
'        .cal-row-highlight { border: 2px solid var(--secondary-green); box-shadow: 0 4px 16px rgba(60,164,52,0.25); }\n' +
'        .cal-row-highlight::after { content: "RACCOLTA DOMANI"; position: absolute; right: 8px; top: 6px; font-size: 9px; font-weight: 700; letter-spacing: 0.4px; padding: 2px 6px; border-radius: 999px; background: var(--secondary-green); color: #fff; }\n' +
'        .text-block { font-size: 13px; line-height: 1.4; color: #333; margin-bottom: 8px; }\n' +
'        .text-block strong { font-weight: 700; }\n' +
'        .text-block + .text-block { margin-top: 6px; }\n' +
'        .bullet-list { list-style: none; padding-left: 0; margin: 4px 0 6px 0; }\n' +
'        .bullet-list li { position: relative; padding-left: 14px; font-size: 13px; margin-bottom: 3px; }\n' +
'        .bullet-list li::before { content: "\\2022"; position: absolute; left: 2px; top: 0; }\n' +
'        .section-label-green { font-weight: 700; text-transform: uppercase; font-size: 13px; color: var(--secondary-green); margin-top: 6px; margin-bottom: 2px; }\n' +
'        .accordion { display: flex; flex-direction: column; gap: 8px; }\n' +
'        .acc-item { border-radius: 18px; border: 1px solid #dde6f2; background: #fdfdfd; overflow: hidden; }\n' +
'        .acc-header { display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; cursor: pointer; }\n' +
'        .acc-header-main { display: flex; align-items: center; gap: 8px; }\n' +
'        .acc-dot { width: 14px; height: 14px; border-radius: 999px; }\n' +
'        .acc-dot.umido { background: var(--col-umido); } .acc-dot.indiff { background: var(--col-indiff); }\n' +
'        .acc-dot.plastica { background: var(--col-plastica); } .acc-dot.vetro { background: var(--col-vetro); }\n' +
'        .acc-dot.carta { background: var(--col-carta); } .acc-dot.alluminio { background: var(--col-alluminio); }\n' +
'        .acc-dot.ingombranti { background: var(--col-ingombranti); } .acc-dot.olio { background: var(--col-olio); }\n' +
'        .acc-title { font-size: 14px; font-weight: 700; color: var(--primary-blue); }\n' +
'        .acc-sub { font-size: 11px; color: #777; }\n' +
'        .acc-chevron { font-size: 14px; color: #777; }\n' +
'        .acc-body { padding: 8px 12px 10px 12px; border-top: 1px dashed #e0e0e0; font-size: 13px; display: none; background: #fff; }\n' +
'        .acc-item.open .acc-body { display: block; }\n' +
'        .acc-item.open .acc-chevron { transform: rotate(90deg); }\n' +
'        .si-title { font-weight: 700; color: var(--secondary-green); margin-top: 2px; margin-bottom: 2px; font-size: 13px; }\n' +
'        .no-title { font-weight: 700; color: #c62828; margin-top: 6px; margin-bottom: 2px; font-size: 13px; }\n' +
'        .note-title { font-weight: 700; color: var(--primary-blue); margin-top: 6px; margin-bottom: 2px; font-size: 13px; }\n' +
'        a { color: var(--primary-blue); }\n' +
'        .btn-link { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 9px 12px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; text-decoration: none; }\n' +
'        .btn-primary { background: var(--primary-blue); color: #fff; }\n' +
'        .btn-primary:hover { background: var(--hover-blue); }\n' +
'        .holiday-badge { display: inline-flex; align-items: center; gap: 6px; background: #fff3cd; border-radius: 999px; padding: 4px 10px; font-size: 11px; color: #856404; border: 1px solid #ffeeba; margin-top: 4px; }\n' +
'        .footer-note { margin-top: 4px; font-size: 11px; color: rgba(255,255,255,0.78); text-align: center; }\n' +
'    </style>\n' +
'</head>\n' +
'<body>\n' +
'<div class="app-shell">\n' +
'    <header class="app-header">\n' +
'        <div class="app-logo">\n' +
'            {{STEMMA_BLOCK}}\n' +
'        </div>\n' +
'        <div class="app-title-block">\n' +
'            <div class="app-title">Raccolta differenziata</div>\n' +
'            <div class="app-subtitle">{{nome_comune}} &middot; Calendario {{anno}}</div>\n' +
'        </div>\n' +
'    </header>\n' +
'    <section class="banner-tonight" id="banner-tonight">\n' +
'        <div class="banner-tonight-icon" id="banner-tonight-icon"><i class="fa-solid fa-moon"></i></div>\n' +
'        <div class="banner-tonight-text">\n' +
'            <small>Stasera, per la raccolta di domani:</small>\n' +
'            <div class="banner-tonight-main" id="banner-tonight-main"><span>Calcolo in corso...</span></div>\n' +
'            <div class="banner-tonight-extra" id="banner-tonight-extra">Esponi i rifiuti la sera precedente al giorno di ritiro, come indicato nel calendario.</div>\n' +
'        </div>\n' +
'    </section>\n' +
'    <nav class="nav-pills">\n' +
'        <button class="nav-pill-btn active" data-target="section-calendario"><i class="fa-regular fa-calendar-check"></i> Calendario</button>\n' +
'        <button class="nav-pill-btn" data-target="section-frazioni"><i class="fa-solid fa-recycle"></i> Dove lo butto?</button>\n' +
'        <button class="nav-pill-btn" data-target="section-ingombranti"><i class="fa-solid fa-couch"></i> Ingombranti &amp; attivit\\u00e0</button>\n' +
'        <button class="nav-pill-btn" data-target="section-documenti"><i class="fa-solid fa-file-pdf"></i> Calendario PDF</button>\n' +
'    </nav>\n' +
'    <section class="section-panel active" id="section-calendario">\n' +
'        <div class="card">\n' +
'            <div class="card-header"><i class="fa-regular fa-calendar-days"></i><div><div class="card-title">Calendario settimanale</div></div></div>\n' +
'            <div class="text-block"><strong>\\u00c8 importante preparare i rifiuti la sera prima</strong> del giorno di ritiro indicato sotto.</div>\n' +
'            <div class="holiday-badge"><i class="fa-solid fa-triangle-exclamation"></i> Attenzione alle festivit\\u00e0 elencate: in quelle date la raccolta non viene effettuata.</div>\n' +
'            <div class="calendar-list" id="calendar-list">\n' +
'{{CALENDARIO_HTML_ROWS}}\n' +
'            </div>\n' +
'            <div class="text-block" style="margin-top:10px;"><strong>Festivit\\u00e0 senza ritiro</strong><br>Nelle seguenti date <strong>non viene effettuata alcuna raccolta</strong>:</div>\n' +
'            <ul class="bullet-list">\n' +
'{{festivita_list}}\n' +
'            </ul>\n' +
'        </div>\n' +
'    </section>\n' +
'    <section class="section-panel" id="section-frazioni">\n' +
'        <div class="card">\n' +
'            <div class="card-header"><i class="fa-solid fa-recycle"></i><div><div class="card-title">Dove lo butto?</div><div class="card-subtitle">Guida alla raccolta differenziata nel Comune di {{nome_comune}}.</div></div></div>\n' +
'            <div class="text-block">La raccolta differenziata \\u00e8 la pi\\u00f9 efficace alternativa allo smaltimento dei rifiuti in discarica. Differenziare i rifiuti significa favorire un uso pi\\u00f9 efficiente delle risorse cos\\u00ec da ricavarne benefici per l\\u2019ambiente e per l\\u2019economia.</div>\n' +
'            <div class="text-block">Fare la raccolta differenziata significa:</div>\n' +
'            <ul class="bullet-list"><li>salvaguardare l\\u2019ambiente</li><li>assicurare un futuro migliore alle nuove generazioni</li><li>contribuire allo sviluppo del proprio Comune di residenza</li><li>pagare meno tasse.</li></ul>\n' +
'            <div class="accordion" id="fractions-accordion">\n' +
'                <div class="acc-item open"><div class="acc-header"><div class="acc-header-main"><span class="acc-dot umido"></span><div><div class="acc-title">Umido</div><div class="acc-sub">Scarti di cucina e rifiuti organici</div></div></div><i class="fa-solid fa-chevron-right acc-chevron"></i></div><div class="acc-body"><div class="si-title">S\\u00cc</div><ul class="bullet-list"><li>scarti di cibo freddi e sgocciolati crudi o cotti</li><li>avanzi di cibo</li><li>gusci d\\u2019uovo</li><li>alimenti avariati</li><li>fondi di caff\\u00e8</li><li>cialde di caff\\u00e8, filtri di t\\u00e8, camomilla ed altre bevande da infusione</li><li>tovaglioli di carta</li><li>fazzoletti di carta</li><li>carta del pane</li><li>carta assorbente da cucina</li><li>foglie e fiori delle piante da appartamento</li><li>terriccio dei vasi</li><li>semi</li><li>scarti di frutta e verdure</li><li>tappi di sughero</li><li>cenere di legna</li><li>capelli non colorati</li><li>escrementi di animali.</li></ul></div></div>\n' +
'                <div class="acc-item"><div class="acc-header"><div class="acc-header-main"><span class="acc-dot indiff"></span><div><div class="acc-title">Indifferenziato</div><div class="acc-sub">Rifiuti non riciclabili</div></div></div><i class="fa-solid fa-chevron-right acc-chevron"></i></div><div class="acc-body"><div class="si-title">S\\u00cc</div><ul class="bullet-list"><li>ceramiche e porcellane</li><li>gomma</li><li>cd - dvd</li><li>penne e pennarelli</li><li>sacchi per aspirapolvere</li><li>spazzolini e spazzole</li><li>collant</li><li>rasoi in plastica usa e getta</li><li>polveri dell\\u2019aspirapolvere</li><li>lettiere per animali domestici</li><li>cocci in ceramica</li><li>mozziconi di sigaretta</li><li>capelli trattati o colorati</li><li>lampadine</li><li>pannolini</li><li>pannoloni e assorbenti in generale.</li></ul><div class="note-title">N.B.</div><div class="text-block">Pannolini, pannoloni e assorbenti in genere possono essere conferiti tutti i giorni, inseriti in un sacchetto a parte.</div></div></div>\n' +
'                <div class="acc-item"><div class="acc-header"><div class="acc-header-main"><span class="acc-dot plastica"></span><div><div class="acc-title">Plastica</div><div class="acc-sub">Imballaggi plastici riciclabili</div></div></div><i class="fa-solid fa-chevron-right acc-chevron"></i></div><div class="acc-body"><div class="si-title">S\\u00cc</div><ul class="bullet-list"><li>contenitori che riportano le sigle pe, pet, pvc</li><li>contenitori per liquidi</li><li>bottiglie per bevande</li><li>flaconi per prodotti per l\\u2019igiene personale e per la pulizia della casa</li><li>plastica in pellicola</li><li>piatti e bicchieri in plastica.</li></ul><div class="no-title">NO</div><ul class="bullet-list"><li>contenitori che non riportano le sigle pe, pet, pvc</li><li>custodie di cd-dvd</li><li>giocattoli</li><li>cassette della frutta.</li></ul><div class="note-title">Attenzione alle sigle</div><div class="text-block">Tra le <strong>plastiche riciclabili</strong> rientrano i materiali indicati con le sigle: PET, HDPE, PVC, LDPE, PP, PS. Le <strong>plastiche non riciclabili</strong> sono contrassegnate dal simbolo generico \\u201cO\\u201d.</div></div></div>\n' +
'                <div class="acc-item"><div class="acc-header"><div class="acc-header-main"><span class="acc-dot vetro"></span><div><div class="acc-title">Vetro</div><div class="acc-sub">Bottiglie e barattoli in vetro</div></div></div><i class="fa-solid fa-chevron-right acc-chevron"></i></div><div class="acc-body"><div class="si-title">S\\u00cc</div><ul class="bullet-list"><li>bottiglie</li><li>barattoli</li><li>vetri rotti</li><li>flaconi (no medicinali).</li></ul><div class="no-title">NO</div><ul class="bullet-list"><li>bicchieri e calici in cristallo</li><li>lampadine</li><li>tazzine</li><li>piatti ecc. in ceramica</li><li>pirofile in vetro</li><li>specchi</li><li>schermi degli apparecchi elettronici.</li></ul></div></div>\n' +
'                <div class="acc-item"><div class="acc-header"><div class="acc-header-main"><span class="acc-dot carta"></span><div><div class="acc-title">Carta e cartone</div><div class="acc-sub">Imballaggi e materiali cellulosici</div></div></div><i class="fa-solid fa-chevron-right acc-chevron"></i></div><div class="acc-body"><div class="si-title">S\\u00cc</div><ul class="bullet-list"><li>scatole</li><li>imballaggi in cartone</li><li>tetrapak</li><li>brick del latte e dei succhi di frutta</li><li>giornali</li><li>riviste</li><li>libri</li><li>quaderni</li><li>fogli</li><li>cartoni della pizza ripuliti da residui di cibo.</li></ul><div class="no-title">NO</div><ul class="bullet-list"><li>carta termica: scontrini, fax ecc.</li><li>cartoni della pizza con residui di cibo</li><li>carta con residui di colla.</li></ul></div></div>\n' +
'                <div class="acc-item"><div class="acc-header"><div class="acc-header-main"><span class="acc-dot alluminio"></span><div><div class="acc-title">Alluminio</div><div class="acc-sub">Lattine e piccoli imballaggi metallici</div></div></div><i class="fa-solid fa-chevron-right acc-chevron"></i></div><div class="acc-body"><div class="si-title">S\\u00cc</div><ul class="bullet-list"><li>lattine</li><li>bombolette</li><li>scatolame</li><li>vaschette</li><li>vassoi per alimenti</li><li>tubetti</li><li>capsule</li><li>tappi a vite</li><li>coperchi per vasetti di yogurt.</li></ul><div class="no-title">NO</div><ul class="bullet-list"><li>filtri</li><li>bombolette spray di prodotti pericolosi</li><li>taniche e barattoli per solventi e vernici</li><li>contenitori di prodotti irritanti, infiammabili, tossici e corrosivi.</li></ul></div></div>\n' +
'                <div class="acc-item"><div class="acc-header"><div class="acc-header-main"><span class="acc-dot olio"></span><div><div class="acc-title">Olio esausto da cucina</div><div class="acc-sub">Oli e grassi vegetali esausti</div></div></div><i class="fa-solid fa-chevron-right acc-chevron"></i></div><div class="acc-body"><div class="si-title">S\\u00cc</div><div class="text-block">L\\u2019olio esausto da cucina va raccolto in un contenitore e riposto nell\\u2019apposita biopattumiera di colore blu.</div><div class="text-block">\\u00c8 possibile conferire l\\u2019olio esausto da cucina anche presso le postazioni dedicate situate nei seguenti punti:</div><ul class="bullet-list">{{punti_olio_list}}</ul><div class="no-title">NO</div><div class="text-block">Gli oli esausti non vanno sversati direttamente nei terreni o nelle condutture perch\\u00e9 sono altamente inquinanti.</div></div></div>\n' +
'                <div class="acc-item"><div class="acc-header"><div class="acc-header-main"><span class="acc-dot umido" style="background: var(--secondary-green);"></span><div><div class="acc-title">Ricorda &amp; simboli utili</div><div class="acc-sub">Come leggere le etichette e i loghi</div></div></div><i class="fa-solid fa-chevron-right acc-chevron"></i></div><div class="acc-body"><div class="section-label-green">Ricorda</div><div class="text-block">Sulle confezioni e sugli incarti dei prodotti sono riportate tutte le indicazioni per il loro corretto smaltimento.</div><div class="text-block">L\\u2019esagono \\u00e8 usato per i contenitori di liquidi. Al loro interno vengono riportati dei codici che indicano la natura dell\\u2019oggetto, ad esempio: da 1 a 6 \\u00e8 plastica, da 20 a 39 carta, da 40 a 49 metallo.</div><div class="section-label-green">Altri simboli importanti</div><div class="text-block"><strong>Logo RAEE</strong><br>Rifiuti di apparecchiature elettriche ed elettroniche che non vanno gettati tra i rifiuti generici.</div><div class="text-block"><strong>Appiattire dopo l\\u2019uso</strong><br>Questo simbolo invita a comprimere i contenitori per ridurne il volume.</div><div class="text-block"><strong>Non disperdere i rifiuti nell\\u2019ambiente</strong><br>Spesso scambiato come indicatore di rifiuti indifferenziati, in realt\\u00e0 indica: \\u201cNon disperdere i rifiuti nell\\u2019ambiente\\u201d.</div><div class="text-block" style="margin-top:6px; font-weight:700; color:var(--secondary-green);">Tutti insieme facciamo la differenza!</div></div></div>\n' +
'            </div>\n' +
'        </div>\n' +
'    </section>\n' +
'    <section class="section-panel" id="section-ingombranti">\n' +
'        <div class="card">\n' +
'            <div class="card-header"><i class="fa-solid fa-couch"></i><div><div class="card-title">Ritiro dei rifiuti ingombranti</div><div class="card-subtitle">Servizio dedicato per i cittadini del Comune di {{nome_comune}}.</div></div></div>\n' +
'            <div class="text-block">Il Comune di {{nome_comune}} offre il servizio di ritiro dei rifiuti ingombranti, che viene effettuato <strong>ogni {{giorno_ingombranti}} solo su prenotazione</strong> al numero <a href="tel:{{telefono_ingombranti}}"><strong>{{telefono_ingombranti}}</strong></a>.</div>\n' +
'            <div class="text-block">\\u00c8 possibile prenotare il ritiro di massimo {{max_pezzi}} pezzi per volta. Al momento della prenotazione occorre specificare la tipologia di rifiuti da conferire.</div>\n' +
'            <div class="text-block">Il personale provveder\\u00e0 a ritirare i rifiuti la mattina della prenotazione. I rifiuti ingombranti vanno lasciati dinanzi la propria abitazione, a piano strada, il giorno stesso del ritiro o al massimo la sera precedente.</div>\n' +
'            <div class="text-block">Il personale non \\u00e8 autorizzato al ritiro di rifiuti ingombranti per i quali non sia stata effettuata regolare prenotazione.</div>\n' +
'            <div class="section-label-green" style="margin-top:10px;">Cosa si pu\\u00f2 conferire</div>\n' +
'            <div class="text-block">\\u00c8 possibile conferire frigoriferi, lavatrici, piccoli elettrodomestici in genere, mobili di piccole e medie dimensioni ecc.</div>\n' +
'            <div class="text-block">Per prenotare chiamare il numero <a href="tel:{{telefono_ingombranti}}"><strong>{{telefono_ingombranti}}</strong></a>. Per ogni prenotazione: massimo {{max_pezzi}} pezzi.</div>\n' +
'            <div class="text-block" style="font-weight:700;">IMPORTANTE: I RIFIUTI INGOMBRANTI DEVONO ESSERE LASCIATI A PIANO STRADA.</div>\n' +
'            <a href="tel:{{telefono_ingombranti}}" class="btn-link btn-primary" style="margin-top:10px;"><i class="fa-solid fa-phone"></i> Chiama per prenotare il ritiro</a>\n' +
'        </div>\n' +
'        <div class="card">\n' +
'            <div class="card-header"><i class="fa-solid fa-store"></i><div><div class="card-title">Ritiro dei rifiuti delle attivit\\u00e0 commerciali</div></div></div>\n' +
'            <div class="text-block">Per le <strong>attivit\\u00e0 commerciali</strong> \\u00e8 previsto il ritiro dei rifiuti di carta e vetro due volte a settimana:</div>\n' +
'            <ul class="bullet-list"><li><strong>{{giorni_carta_comm}}</strong>: carta</li><li><strong>{{giorni_vetro_comm}}</strong>: vetro.</li></ul>\n' +
'            <div class="text-block">Si ricorda che l\\u2019isola ecologica \\u00e8 aperta <strong>{{orari_isola}}</strong> per il conferimento diretto dei rifiuti.</div>\n' +
'        </div>\n' +
'    </section>\n' +
'    <section class="section-panel" id="section-documenti">\n' +
'        <div class="card">\n' +
'            <div class="card-header"><i class="fa-solid fa-file-pdf"></i><div><div class="card-title">Calendario ufficiale {{anno}}</div><div class="card-subtitle">Scarica il calendario completo della raccolta differenziata del Comune di {{nome_comune}}.</div></div></div>\n' +
'            <div class="text-block">Puoi consultare e scaricare il calendario in formato PDF cliccando sul pulsante qui sotto.</div>\n' +
'            <a href="{{url_pdf}}" target="_blank" class="btn-link btn-primary"><i class="fa-solid fa-file-arrow-down"></i> Scarica il calendario {{anno}} (PDF)</a>\n' +
'        </div>\n' +
'    </section>\n' +
'    <div class="footer-note">Webapp informativa &middot; I contenuti seguono le indicazioni del materiale ufficiale del Comune di {{nome_comune}}.</div>\n' +
'</div>\n' +
'<script>\n' +
'    document.querySelectorAll(".nav-pill-btn").forEach(function(btn) {\n' +
'        btn.addEventListener("click", function() {\n' +
'            document.querySelectorAll(".nav-pill-btn").forEach(function(b) { b.classList.remove("active"); });\n' +
'            btn.classList.add("active");\n' +
'            var target = btn.getAttribute("data-target");\n' +
'            document.querySelectorAll(".section-panel").forEach(function(sec) {\n' +
'                sec.classList.toggle("active", sec.id === target);\n' +
'            });\n' +
'            window.scrollTo({ top: 0, behavior: "smooth" });\n' +
'        });\n' +
'    });\n' +
'    document.querySelectorAll(".acc-item .acc-header").forEach(function(header) {\n' +
'        header.addEventListener("click", function() { header.parentElement.classList.toggle("open"); });\n' +
'    });\n' +
'{{WEEKDAY_SCHEDULE_JS}}\n' +
'{{HOLIDAYS_JS}}\n' +
'    function formatDateISO(d) { var y=d.getFullYear(); var m=String(d.getMonth()+1).padStart(2,"0"); var day=String(d.getDate()).padStart(2,"0"); return y+"-"+m+"-"+day; }\n' +
'    function updateTonightInfo() {\n' +
'        var now = new Date(); var tomorrow = new Date(now.getTime()); tomorrow.setDate(now.getDate()+1);\n' +
'        var tomorrowISO = formatDateISO(tomorrow); var tomorrowWeekday = tomorrow.getDay();\n' +
'        var bannerMain = document.getElementById("banner-tonight-main");\n' +
'        var bannerExtra = document.getElementById("banner-tonight-extra");\n' +
'        var bannerIcon = document.getElementById("banner-tonight-icon");\n' +
'        document.querySelectorAll(".cal-row").forEach(function(row) { row.classList.remove("cal-row-highlight"); });\n' +
'        if (HOLIDAYS.indexOf(tomorrowISO) !== -1) {\n' +
'            bannerMain.innerHTML = "<span>Nessun ritiro previsto</span>";\n' +
'            bannerExtra.textContent = "Domani \\u00e8 una festivit\\u00e0: non esporre alcun rifiuto.";\n' +
'            bannerIcon.style.background = "rgba(0,0,0,0.3)"; bannerIcon.querySelector("i").className = "fa-solid fa-church"; return;\n' +
'        }\n' +
'        var schedule = WEEKDAY_SCHEDULE[tomorrowWeekday] || [];\n' +
'        if (!schedule.length) {\n' +
'            bannerMain.innerHTML = "<span>Nessun ritiro programmato</span>";\n' +
'            bannerExtra.textContent = "Domani non \\u00e8 prevista raccolta.";\n' +
'            bannerIcon.style.background = "rgba(0,0,0,0.25)"; bannerIcon.querySelector("i").className = "fa-solid fa-circle-minus";\n' +
'        } else {\n' +
'            var labels = schedule.map(function(item) { return item.label; });\n' +
'            bannerMain.innerHTML = "<span>" + labels.join(" \\u00b7 ") + "</span>";\n' +
'            bannerExtra.textContent = "Prepara e differenzia correttamente questi rifiuti questa sera.";\n' +
'            var first = schedule[0]; bannerIcon.style.background = first.color;\n' +
'            bannerIcon.querySelector("i").className = "fa-solid " + first.icon;\n' +
'            var rowToHighlight = document.querySelector(".cal-row[data-weekday=\\"" + tomorrowWeekday + "\\"]");\n' +
'            if (rowToHighlight) rowToHighlight.classList.add("cal-row-highlight");\n' +
'        }\n' +
'    }\n' +
'    document.addEventListener("DOMContentLoaded", function() { updateTonightInfo(); });\n' +
'<' + '/script>\n' +
'</body>\n' +
'</html>';
  }

  function _saveAllTemplates() {
    return db.collection('impostazioni').doc('webapp_templates').set({
      templates: state.templates,
      ultimaModifica: new Date().toISOString(),
      modificatoDa: AuthService.getUserName(),
      modificatoDaId: AuthService.getUserId()
    }, { merge: true })
      .then(() => {
        UI.showSuccess('Modelli salvati con successo');
      })
      .catch(error => {
        UI.showError('Errore nel salvataggio: ' + error.message);
        console.error('Error saving templates:', error);
      });
  }

  function _duplicateTemplate(templateId) {
    if (!state.templates[templateId]) {
      UI.showError('Modello non trovato');
      return;
    }

    const original = state.templates[templateId];
    const newId = generateUniqueId();

    const newTemplate = JSON.parse(JSON.stringify(original));
    newTemplate.id = newId;
    newTemplate.nome = original.nome + ' (copia)';
    newTemplate.isDefault = false;
    newTemplate.createdAt = new Date().toISOString();
    newTemplate.createdBy = AuthService.getUserName();

    state.templates[newId] = newTemplate;
    return _saveAllTemplates().then(() => {
      _renderModels();
    });
  }

  function _deleteTemplate(templateId) {
    if (!state.templates[templateId]) {
      UI.showError('Modello non trovato');
      return;
    }

    if (state.templates[templateId].isDefault) {
      UI.showError('Non è possibile eliminare un modello predefinito');
      return;
    }

    if (!confirm('Sei sicuro di voler eliminare questo modello? L\'azione è irreversibile.')) {
      return;
    }

    delete state.templates[templateId];
    return _saveAllTemplates().then(() => {
      _renderModels();
    });
  }

  // ============================================================================
  // GENERATION ENGINE
  // ============================================================================

  function _generateHTML(templateId, formValues) {
    const template = state.templates[templateId];
    if (!template) {
      UI.showError('Modello non trovato');
      return '';
    }

    // Handle multi-file templates
    if (template.multiFile && template.files) {
      const result = [];
      template.files.forEach(file => {
        let html = file.codiceHTML;
        html = _applyPlaceholders(html, template, formValues);
        result.push({
          id: file.id,
          nome: file.nome,
          label: file.label,
          html: html
        });
      });
      return result;
    }

    // Handle single-file templates
    let html = template.codiceHTML;
    html = _applyPlaceholders(html, template, formValues);
    return html;
  }

  function _applyPlaceholders(html, template, formValues) {
    // Process simple fields
    template.campiVariabili.forEach(campo => {
      const value = formValues[campo.id];

      if (campo.tipo === 'calendario_rifiuti') {
        const calendariaHtml = _generateCalendarHTML(value || DEFAULT_CALENDARIO);
        const weekdayScheduleJs = _generateWeekdayScheduleJS(value || DEFAULT_CALENDARIO);
        const holidaysJs = _generateHolidaysJS(formValues['festivita'] || []);

        html = html.replace(/\{\{CALENDARIO_HTML_ROWS\}\}/g, calendariaHtml);
        html = html.replace(/\{\{WEEKDAY_SCHEDULE_JS\}\}/g, weekdayScheduleJs);
        html = html.replace(/\{\{HOLIDAYS_JS\}\}/g, holidaysJs);

      } else if (campo.tipo === 'lista_date') {
        const dates = value || [];
        const dateArray = "['".concat(dates.join("', '"), "']");
        const dateListHtml = dates.map(date => '<li><strong>' + escapeHtml(date) + '</strong></li>').join('');

        html = html.replace(new RegExp('\\{\\{' + campo.id + '_array\\}\\}', 'g'), dateArray);
        html = html.replace(new RegExp('\\{\\{' + campo.id + '_list\\}\\}', 'g'), dateListHtml);

      } else if (campo.tipo === 'lista_testi') {
        const testi = value || [];
        const testiHtml = testi.map(testo => '<li>' + escapeHtml(testo) + '</li>').join('');

        html = html.replace(new RegExp('\\{\\{' + campo.id + '_list\\}\\}', 'g'), testiHtml);

      } else if (campo.tipo === 'text' || campo.tipo === 'tel' || campo.tipo === 'number') {
        // Per campi URL (usati dentro <script>), non fare HTML-escape
        // perché &amp; dentro <script> non viene decodificato dal browser
        const isUrl = campo.id.indexOf('url_') === 0;
        const safeValue = isUrl ? (value || '') : escapeHtml(value || '');
        html = html.replace(new RegExp('\\{\\{' + campo.id + '\\}\\}', 'g'), safeValue);

      } else if (campo.tipo === 'select') {
        const safeValue = escapeHtml(value || '');
        html = html.replace(new RegExp('\\{\\{' + campo.id + '\\}\\}', 'g'), safeValue);

      }
    });

    // Gestione stemma: se url_stemma è fornito mostra immagine, altrimenti testo fallback
    var stemmaUrl = formValues['url_stemma'] || '';
    var stemmaBlock;
    if (stemmaUrl) {
      stemmaBlock = '<img src="' + escapeHtml(stemmaUrl) + '" alt="Logo Comune" style="height:36px;">';
    } else {
      var nomeComune = escapeHtml(formValues['nome_comune'] || 'Comune');
      stemmaBlock = '<i class="fas fa-landmark"></i> Comune di <strong style="margin-left:4px">' + nomeComune + '</strong>';
    }
    html = html.replace(/\{\{STEMMA_BLOCK\}\}/g, stemmaBlock);
    html = html.replace(/\{\{STEMMA_CARTOLINA\}\}/g, stemmaBlock);

    return html;
  }

  function _generateCalendarHTML(calendario) {
    const giorni = [
      { num: 1, nome: 'Lunedì' }, { num: 2, nome: 'Martedì' }, { num: 3, nome: 'Mercoledì' },
      { num: 4, nome: 'Giovedì' }, { num: 5, nome: 'Venerdì' }, { num: 6, nome: 'Sabato' }
    ];
    let html = '';

    giorni.forEach(giorno => {
      const frazioni = calendario[giorno.num] || [];
      html += '                <div class="cal-row" data-weekday="' + giorno.num + '">\n';
      html += '                    <div class="cal-row-day">' + giorno.nome + '</div>\n';
      html += '                    <div class="cal-row-tags">\n';

      if (frazioni.length === 0) {
        html += '                        Nessun ritiro programmato.\n';
      } else {
        frazioni.forEach(frazioneId => {
          const f = FRAZIONI_RIFIUTI.find(fr => fr.id === frazioneId);
          if (f) {
            var label = f.label;
            if (frazioneId === 'ingombranti') label += ' (su prenotazione)';
            html += '                        <span class="waste-pill ' + f.cssClass + '"><i class="fa-solid ' + f.icona + '"></i> ' + label + '</span>\n';
          }
        });
      }

      html += '                    </div>\n';
      html += '                </div>\n';
    });

    // Domenica
    html += '                <div class="cal-row no-pickup" data-weekday="0">\n';
    html += '                    <div class="cal-row-day">Domenica</div>\n';
    html += '                    <div class="cal-row-tags">\n';
    html += '                        Nessun ritiro programmato.\n';
    html += '                    </div>\n';
    html += '                </div>\n';

    return html;
  }

  function _generateWeekdayScheduleJS(calendario) {
    var lines = [];
    lines.push('    var WEEKDAY_SCHEDULE = {');
    lines.push('        0: [],');

    for (var dayNum = 1; dayNum <= 6; dayNum++) {
      var frazioni = calendario[dayNum] || [];
      var items = frazioni.map(function(frazioneId) {
        var f = FRAZIONI_RIFIUTI.find(function(fr) { return fr.id === frazioneId; });
        if (!f) return null;
        var label = f.label;
        if (frazioneId === 'ingombranti') label = 'Rifiuti ingombranti (su prenotazione)';
        return "            { code: '" + f.id + "', label: '" + label + "', color: 'var(--col-" + f.id + ")', icon: '" + f.icona + "' }";
      }).filter(Boolean);

      if (items.length === 0) {
        lines.push('        ' + dayNum + ': [],');
      } else {
        lines.push('        ' + dayNum + ': [');
        lines.push(items.join(',\n'));
        lines.push('        ],');
      }
    }

    lines.push('    };');
    return lines.join('\n');
  }

  function _generateHolidaysJS(festivita) {
    if (!festivita || festivita.length === 0) return '    var HOLIDAYS = [];';
    var items = festivita.map(function(d) { return "        '" + escapeHtml(d) + "'"; });
    return '    var HOLIDAYS = [\n' + items.join(',\n') + '\n    ];';
  }


  function _getDefaultTemplateCartolina8MarzoCrea() {
    return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>8 Marzo – Invia la tua cartolina</title>
<link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@500;700&family=Titillium+Web:wght@300;400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<style>
  :root {
    --blu-900: #0D3A5C;
    --blu-700: #145284;
    --blu-500: #2E6DA8;
    --blu-300: #7BA7CE;
    --blu-100: #D1E2F2;
    --verde-700: #3CA434;
    --verde-500: #59C64D;
    --verde-300: #A4E89A;
    --verde-100: #E2F8DE;
    --grigio-900: #1E1E1E;
    --grigio-700: #4A4A4A;
    --grigio-500: #9B9B9B;
    --grigio-300: #D9D9D9;
    --grigio-100: #F5F5F5;
    --mimosa: #F5C842;
    --mimosa-chiaro: #FBE8A2;
    --mimosa-scuro: #C9960A;
    --rosa: #C2185B;
    --rosa-chiaro: #E06090;
    --rosa-bg: #FDE8EF;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { overflow-x: hidden; max-width: 100vw; }

  body {
    font-family: 'Titillium Web', sans-serif;
    background: linear-gradient(160deg, #0D3A5C 0%, #145284 35%, #1B6A6E 65%, #1A7C5A 100%);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 16px 40px;
    position: relative;
    overflow-x: hidden;
  }

  /* PETALI ANIMATI */
  .petalo {
    position: fixed;
    opacity: 0;
    pointer-events: none;
    animation: caduta linear infinite;
    z-index: 0;
  }
  @keyframes caduta {
    0%   { transform: translateY(-60px) rotate(0deg) scale(0.8); opacity: 0; }
    10%  { opacity: 0.7; }
    90%  { opacity: 0.3; }
    100% { transform: translateY(110vh) rotate(720deg) scale(0.4); opacity: 0; }
  }

  /* SFONDO DECORATIVO */
  body::before {
    content: '';
    position: fixed;
    top: -50%;
    right: -30%;
    width: 80vw;
    height: 80vw;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(245,200,66,0.08) 0%, transparent 70%);
    z-index: 0;
    pointer-events: none;
  }
  body::after {
    content: '';
    position: fixed;
    bottom: -40%;
    left: -20%;
    width: 70vw;
    height: 70vw;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(194,24,91,0.08) 0%, transparent 70%);
    z-index: 0;
    pointer-events: none;
  }

  /* LOGO BAR */
  .logo-bar {
    width: 100%;
    max-width: 460px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 0 10px;
    position: relative;
    z-index: 10;
  }
  .logo-comune {
    color: white;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    opacity: 0.9;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .logo-comune i { color: var(--mimosa); font-size: 1rem; }
  /*
    📌 IMMAGINE LOGO: sostituisci il div.logo-comune con:
    <img src="URL_LOGO" alt="Logo Comune" style="height:38px;">
    oppure aggiungi l'img dentro il div mantenendo il testo
  */
  .data-badge {
    background: linear-gradient(135deg, var(--mimosa) 0%, #F0B800 100%);
    color: #1a1a1a;
    font-weight: 700;
    font-size: 0.65rem;
    padding: 5px 13px;
    border-radius: 20px;
    letter-spacing: 1.2px;
    box-shadow: 0 2px 10px rgba(245,200,66,0.3);
  }

  /* HEADER */
  .header-section {
    text-align: center;
    position: relative;
    z-index: 10;
    margin-bottom: 10px;
    animation: fadeDown 0.6s ease both;
  }
  @keyframes fadeDown {
    from { opacity: 0; transform: translateY(-14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .header-emoji {
    display: block;
    margin-bottom: 4px;
  }
  .header-emoji img {
    height: 50px;
    object-fit: contain;
    filter: drop-shadow(0 3px 8px rgba(0,0,0,0.2));
    animation: pulse 3s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); }
  }
  h1 {
    color: white;
    font-size: 1.3rem;
    font-weight: 700;
    letter-spacing: 0.5px;
    margin-bottom: 2px;
  }
  .subtitle {
    color: rgba(255,255,255,0.75);
    font-size: 0.82rem;
    font-weight: 400;
    letter-spacing: 0.2px;
  }

  /* ANTEPRIMA CARTOLINA */
  .card-wrapper {
    width: 100%;
    max-width: 460px;
    position: relative;
    z-index: 10;
    margin-bottom: 14px;
    animation: popIn 0.5s cubic-bezier(.22,1.4,.36,1) 0.15s both;
  }
  @keyframes popIn {
    from { opacity: 0; transform: scale(0.9); }
    to   { opacity: 1; transform: scale(1); }
  }

  .card-label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: rgba(255,255,255,0.5);
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    margin-bottom: 10px;
  }
  .card-label i { font-size: 0.65rem; }

  #cartolina {
    width: 100%;
    border-radius: 18px;
    overflow: hidden;
    box-shadow:
      0 4px 15px rgba(0,0,0,0.15),
      0 20px 50px rgba(0,0,0,0.35);
    background: white;
    position: relative;
    min-height: 280px;
    display: flex;
    flex-direction: column;
    transition: box-shadow 0.3s ease;
  }

  .card-bg {
    position: absolute;
    inset: 0;
    background: linear-gradient(155deg, #FDE8EF 0%, #FFF8E1 35%, #FFF0F5 65%, #E3F0FF 100%);
  }
  .card-bg::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 10% 15%, rgba(245,200,66,0.25) 0%, transparent 40%),
      radial-gradient(circle at 90% 80%, rgba(194,24,91,0.12) 0%, transparent 40%),
      radial-gradient(circle at 75% 10%, rgba(92,196,220,0.12) 0%, transparent 30%);
  }
  .card-bg::after {
    content: '';
    position: absolute;
    inset: 0;
    opacity: 0.04;
    background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='30' cy='30' r='4' fill='%23F5C842'/%3E%3Ccircle cx='10' cy='10' r='3' fill='%23C2185B'/%3E%3Ccircle cx='50' cy='50' r='3' fill='%23C2185B'/%3E%3C/svg%3E");
    background-size: 60px 60px;
  }

  .card-nastro {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 5px;
    background: linear-gradient(90deg, var(--rosa) 0%, var(--rosa-chiaro) 50%, var(--mimosa) 100%);
    z-index: 3;
  }
  .card-deco-tr {
    position: absolute;
    top: 10px; right: 12px;
    font-size: 2rem;
    line-height: 1;
    z-index: 2;
    filter: drop-shadow(1px 2px 3px rgba(0,0,0,0.12));
    animation: dondola 4s ease-in-out infinite;
  }
  .card-deco-bl {
    position: absolute;
    bottom: 60px; left: 12px;
    font-size: 1.5rem;
    line-height: 1;
    z-index: 2;
    animation: dondola 5s ease-in-out infinite reverse;
  }

  .card-content {
    position: relative;
    z-index: 4;
    padding: 20px 20px 16px;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .card-data-label {
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 3px;
    color: var(--rosa);
    text-transform: uppercase;
    margin-bottom: 2px;
    opacity: 0.7;
  }
  .card-titolo {
    font-family: 'Dancing Script', cursive;
    font-size: 2rem;
    font-weight: 700;
    color: var(--rosa);
    line-height: 1.1;
    text-shadow: 1px 1px 0 rgba(255,255,255,0.6);
  }
  .card-titolo span { color: var(--mimosa-scuro); }

  .card-quote {
    font-size: 0.88rem;
    font-style: italic;
    color: var(--grigio-700);
    line-height: 1.55;
    max-width: 100%;
    padding: 10px 14px;
    background: rgba(255,255,255,0.65);
    border-radius: 10px;
    border-left: 3px solid var(--mimosa);
    backdrop-filter: blur(4px);
  }

  .card-msg-utente {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--rosa);
    line-height: 1.55;
    max-width: 100%;
    padding: 7px 12px;
    background: linear-gradient(135deg, rgba(253,232,239,0.8), rgba(255,240,245,0.7));
    border-radius: 10px;
    border-left: 3px solid var(--rosa-chiaro);
    display: none;
    animation: fadeIn 0.3s ease;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .card-msg-utente.visible { display: block; }

  .card-mittente {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--grigio-500);
    font-style: italic;
    display: none;
    margin-top: 2px;
  }
  .card-mittente.visible { display: block; }

  .card-footer {
    display: flex;
    justify-content: space-between;
    margin-top: auto;
    align-items: flex-end;
  }
  .card-footer-comune {
    font-size: 0.56rem;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: var(--grigio-500);
    line-height: 1.6;
  }
  .card-footer-comune span {
    display: block;
    font-size: 0.7rem;
    color: var(--blu-700);
    font-weight: 700;
  }
  .card-mimosa {
    font-size: 1.8rem;
    animation: dondola 3s ease-in-out infinite;
    filter: drop-shadow(1px 2px 4px rgba(0,0,0,0.15));
  }
  @keyframes dondola {
    0%,100% { transform: rotate(-6deg); }
    50%      { transform: rotate(6deg); }
  }

  /* FORM */
  .form-section {
    width: 100%;
    max-width: 460px;
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 16px;
    padding: 18px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    position: relative;
    z-index: 10;
    margin-bottom: 16px;
    animation: fadeUp 0.5s ease 0.3s both;
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .form-section h2 {
    color: white;
    font-size: 0.85rem;
    font-weight: 700;
    margin-bottom: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .form-section h2 i { color: var(--mimosa); font-size: 0.9rem; }

  .input-group { display: flex; flex-direction: column; gap: 5px; margin-bottom: 14px; }
  .input-group:last-child { margin-bottom: 0; }
  .input-group label {
    color: rgba(255,255,255,0.65);
    font-size: 0.74rem;
    font-weight: 600;
    letter-spacing: 0.3px;
  }
  .input-group input,
  .input-group textarea {
    width: 100%;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 12px;
    padding: 12px 14px;
    color: white;
    font-family: 'Titillium Web', sans-serif;
    font-size: 16px;
    outline: none;
    transition: border-color 0.3s, background 0.3s, box-shadow 0.3s;
    line-height: 1.5;
  }
  .input-group textarea { resize: none; }
  .input-group input::placeholder,
  .input-group textarea::placeholder { color: rgba(255,255,255,0.32); }
  .input-group input:focus,
  .input-group textarea:focus {
    border-color: var(--mimosa);
    background: rgba(255,255,255,0.15);
    box-shadow: 0 0 0 3px rgba(245,200,66,0.15);
  }
  .char-count {
    text-align: right;
    font-size: 0.66rem;
    color: rgba(255,255,255,0.35);
    margin-top: 2px;
    transition: color 0.3s;
  }
  .char-count.warning { color: var(--mimosa); }

  /* BOTTONI CONDIVISIONE */
  .condividi-section {
    width: 100%;
    max-width: 460px;
    position: relative;
    z-index: 10;
    animation: fadeUp 0.5s ease 0.45s both;
  }
  .condividi-section h2 {
    color: white;
    font-size: 0.85rem;
    font-weight: 700;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .condividi-section h2 i { color: var(--mimosa); font-size: 0.9rem; }

  .btn-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 14px 14px;
    border-radius: 14px;
    border: none;
    font-family: 'Titillium Web', sans-serif;
    font-size: 0.84rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.25s ease;
    letter-spacing: 0.3px;
    position: relative;
    overflow: hidden;
    width: 100%;
  }
  .btn:active { transform: scale(0.96); }
  .btn i { font-size: 1rem; }

  .btn-condividi {
    background: linear-gradient(135deg, var(--rosa) 0%, var(--rosa-chiaro) 100%);
    color: white;
    box-shadow: 0 3px 12px rgba(194,24,91,0.3);
    padding: 16px 14px;
    font-size: 0.9rem;
  }
  .btn-condividi:hover {
    box-shadow: 0 5px 18px rgba(194,24,91,0.4);
    transform: translateY(-1px);
  }
  .btn-condividi .btn-sub {
    font-size: 0.68rem;
    font-weight: 400;
    opacity: 0.8;
    margin-left: 4px;
  }

  .btn-copia {
    background: rgba(255,255,255,0.08);
    color: white;
    border: 1px solid rgba(255,255,255,0.18);
  }
  .btn-copia:hover {
    background: rgba(255,255,255,0.15);
    transform: translateY(-1px);
  }
  .btn-copia.copiato {
    background: var(--verde-700);
    border-color: var(--verde-700);
    box-shadow: 0 3px 12px rgba(60,164,52,0.3);
  }

  /* INFORMATIVA PRIVACY */
  .privacy-notice {
    width: 100%;
    max-width: 460px;
    margin-top: 18px;
    padding: 12px 16px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    position: relative;
    z-index: 10;
    animation: fadeUp 0.5s ease 0.55s both;
  }
  .privacy-notice i {
    color: var(--verde-300);
    font-size: 0.85rem;
    margin-top: 1px;
    flex-shrink: 0;
  }
  .privacy-notice p {
    color: rgba(255,255,255,0.85);
    font-size: 0.68rem;
    font-weight: 400;
    line-height: 1.6;
  }

  /* TOAST */
  .toast {
    position: fixed;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%) translateY(120px);
    background: rgba(30,30,30,0.95);
    color: white;
    padding: 11px 24px;
    border-radius: 24px;
    font-size: 0.8rem;
    font-weight: 600;
    z-index: 1000;
    transition: transform 0.35s cubic-bezier(.22,1.4,.36,1);
    white-space: nowrap;
    box-shadow: 0 6px 24px rgba(0,0,0,0.4);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  .toast.show { transform: translateX(-50%) translateY(0); }

  /* FOOTER */
  .footer-ist {
    margin-top: 20px;
    text-align: center;
    color: rgba(255,255,255,0.75);
    font-size: 0.66rem;
    font-weight: 300;
    position: relative;
    z-index: 10;
    line-height: 1.9;
  }
  .footer-ist a { color: rgba(255,255,255,0.9); text-decoration: none; transition: color 0.2s; }
  .footer-ist a:hover { color: white; }
</style>
</head>
<body>

<div class="logo-bar">
  <div class="logo-comune">
    {{STEMMA_CARTOLINA}}
  </div>
  <div class="data-badge">8 MARZO 2026</div>
</div>

<div class="header-section">
  <span class="header-emoji"><img src="https://estensioni.comune.digital/docs/mimosa.png" alt="Mimosa"></span>
  <h1>Invia la tua cartolina</h1>
  <p class="subtitle">Manda un pensiero speciale per la Festa della Donna</p>
</div>

<!-- ANTEPRIMA CARTOLINA -->
<div class="card-wrapper">
  <div class="card-label"><i class="fas fa-eye"></i> Anteprima</div>
  <div id="cartolina">
    <div class="card-bg"></div>
    <div class="card-nastro"></div>
    <div class="card-deco-tr">🌼🌿</div>
    <div class="card-deco-bl">🌸</div>
    <div class="card-content">
      <div>
        <div class="card-data-label">8 Marzo · Festa della Donna</div>
        <div class="card-titolo">Buon 8<span> Marzo</span></div>
      </div>
      <div class="card-quote">
        "Il rispetto non è un simbolo da esibire per un giorno.
        <br>È una responsabilità quotidiana che passa dai gesti,
        dalle scelte e dai diritti di tutte le donne."
      </div>
      <div class="card-msg-utente" id="msg-preview"></div>
      <div class="card-mittente" id="mittente-preview"></div>
      <div class="card-footer">
        <div class="card-footer-comune">
          Un pensiero a cura del
          <span>Comune di {{nome_comune}}</span>
        </div>
        <div class="card-mimosa">🌼</div>
      </div>
    </div>
  </div>
</div>

<!-- FORM -->
<div class="form-section">
  <h2><i class="fas fa-pen-fancy"></i> Personalizza la cartolina</h2>

  <div class="input-group">
    <label for="nome-mittente">Il tuo nome <span style="opacity:0.5">(obbligatorio)</span></label>
    <input type="text" id="nome-mittente" maxlength="40"
      placeholder="Es: Mario, La tua amica Anna, Papà...">
  </div>

  <div class="input-group">
    <label for="testo-utente">Un messaggio personale <span style="opacity:0.5">(opzionale)</span></label>
    <textarea id="testo-utente" rows="3" maxlength="120"
      placeholder="Es: Oggi ti penso con tutto il mio affetto!"></textarea>
    <div class="char-count" id="char-count"><span id="count">0</span>/120</div>
  </div>
</div>

<!-- CONDIVISIONE -->
<div class="condividi-section">
  <h2><i class="fas fa-share-alt"></i> Condividi la cartolina</h2>
  <div class="btn-grid">
    <button class="btn btn-condividi" onclick="condividiNativo()">
      <i class="fas fa-share-alt"></i> Condividi la cartolina <span class="btn-sub">(WhatsApp, Telegram, Messenger…)</span>
    </button>
    <button class="btn btn-copia" id="btn-copia" onclick="copiaLink()">
      <i class="fas fa-link"></i> Copia link di condivisione
    </button>
  </div>
</div>

<!-- INFORMATIVA PRIVACY -->
<div class="privacy-notice">
  <i class="fas fa-shield-alt"></i>
  <p>
    <strong>La tua privacy è al sicuro.</strong> Nessun dato personale viene salvato, raccolto o memorizzato dall'app.
    Il messaggio e il nome del mittente viaggiano esclusivamente all'interno del link condiviso e non vengono archiviati su alcun server.
  </p>
</div>

<div class="footer-ist">
  Un'iniziativa del Comune · Powered by <a href="https://www.comunedigital.it" target="_blank">Comune.Digital</a>
</div>

<div class="toast" id="toast"></div>

<script>
  // ============================================================
  // ⚙️ CONFIGURAZIONE – modifica questi valori per ogni comune
  // ============================================================
  const CONFIG = {
    nomeComune:    "{{nome_comune}}",
    urlCartolina:  "{{url_cartolina_view}}",
    urlScaricaApp: "{{url_scarica_app}}",
    urlHomepage:   "{{url_homepage}}",
    urlStemma:     "{{url_stemma}}"
  };
  // ============================================================

  // Petali animati
  const petaliEmoji = ['🌸','🌼','💛','✨','🌿','💐'];
  petaliEmoji.forEach((em) => {
    for (let j = 0; j < 3; j++) {
      const p = document.createElement('div');
      p.className = 'petalo';
      p.textContent = em;
      const size = 0.7 + Math.random() * 1;
      const dur = 8 + Math.random() * 8;
      const delay = Math.random() * 12;
      p.style.cssText = 'left:' + (Math.random()*100) + 'vw;font-size:' + size + 'rem;animation-duration:' + dur + 's;animation-delay:' + delay + 's';
      document.body.prepend(p);
    }
  });

  // Riferimenti DOM
  const nomeMittente  = document.getElementById('nome-mittente');
  const textarea      = document.getElementById('testo-utente');
  const msgPreview    = document.getElementById('msg-preview');
  const mittentePreview = document.getElementById('mittente-preview');
  const countEl       = document.getElementById('count');
  const charCount     = document.getElementById('char-count');

  // Aggiorna anteprima nome mittente in tempo reale
  nomeMittente.addEventListener('input', () => {
    const nome = nomeMittente.value.trim();
    if (nome) {
      mittentePreview.textContent = '— ' + nome;
      mittentePreview.classList.add('visible');
    } else {
      mittentePreview.textContent = '';
      mittentePreview.classList.remove('visible');
    }
  });

  // Aggiorna anteprima messaggio in tempo reale
  textarea.addEventListener('input', () => {
    const val = textarea.value.trim();
    const len = textarea.value.length;
    countEl.textContent = len;

    if (len > 100) { charCount.classList.add('warning'); }
    else           { charCount.classList.remove('warning'); }

    if (val) {
      msgPreview.textContent = '💬 "' + val + '"';
      msgPreview.classList.add('visible');
    } else {
      msgPreview.textContent = '';
      msgPreview.classList.remove('visible');
    }
  });

  // ==========================================
  // 🔗 Costruisce l'URL con messaggio + mittente
  //    Entrambi codificati in Base64 nell'URL
  // ==========================================
  function getUrlConParametri() {
    const msg  = textarea.value.trim();
    const nome = nomeMittente.value.trim();
    // Usa l'API serverless: tutti i dati vanno come query params
    // così funziona anche dentro webview GoodBarber
    var base = CONFIG.urlCartolina;
    var params = [];

    // Funzione helper per codifica Base64 (solo per testo breve)
    function toB64(str) {
      if (!str) return '';
      return btoa(unescape(encodeURIComponent(str))).replace(/=+$/, '');
    }

    // Dati del comune (URL con encodeURIComponent, come Piraino che funziona)
    params.push('cn=' + encodeURIComponent(CONFIG.nomeComune));
    if (CONFIG.urlScaricaApp) params.push('sa=' + encodeURIComponent(CONFIG.urlScaricaApp));
    if (CONFIG.urlHomepage) params.push('hp=' + encodeURIComponent(CONFIG.urlHomepage));
    if (CONFIG.urlStemma) params.push('st=' + encodeURIComponent(CONFIG.urlStemma));

    // Dati dell'utente (Base64 per nome e messaggio)
    if (nome) params.push('da=' + toB64(nome));
    if (msg) params.push('msg=' + toB64(msg));

    // Costruisci URL con query params (? non #)
    if (params.length > 0) {
      base += '?' + params.join('&');
    }
    return base;
  }

  // Verifica che il nome mittente sia compilato
  function verificaMittente() {
    const nome = nomeMittente.value.trim();
    if (!nome) {
      nomeMittente.style.borderColor = '#D32F2F';
      nomeMittente.style.boxShadow = '0 0 0 3px rgba(211,47,47,0.2)';
      nomeMittente.focus();
      mostraToast("Inserisci il tuo nome prima di condividere");
      setTimeout(() => {
        nomeMittente.style.borderColor = '';
        nomeMittente.style.boxShadow = '';
      }, 3000);
      return false;
    }
    return true;
  }

  function getTesto() {
    const msg  = textarea.value.trim();
    const nome = nomeMittente.value.trim();
    let testo = "🌸 Ti ho inviato una cartolina per la Festa della Donna!\\n";
    testo += "dall'App del Comune di " + CONFIG.nomeComune + "\\n";
    if (msg) testo += "💬 \\"" + msg + "\\"\\n";
    testo += "\\n👇 Clicca qui per aprirla:\\n" + getUrlConParametri();
    return testo;
  }

  async function condividiNativo() {
    if (!verificaMittente()) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "🌸 Cartolina 8 Marzo – " + CONFIG.nomeComune,
          text: getTesto()
        });
      } catch(e) { /* utente ha annullato */ }
    } else {
      try {
        await navigator.clipboard.writeText(getTesto());
        mostraToast("Testo copiato! 📋");
      } catch(e) { mostraToast("Condivisione non supportata"); }
    }
  }

  async function copiaLink() {
    if (!verificaMittente()) return;
    const btn = document.getElementById('btn-copia');
    const url = getTesto();
    try {
      await navigator.clipboard.writeText(url);
      btn.classList.add('copiato');
      btn.innerHTML = '<i class="fas fa-check"></i> Link copiato!';
      mostraToast("Link copiato negli appunti ✅");
      setTimeout(() => {
        btn.classList.remove('copiato');
        btn.innerHTML = '<i class="fas fa-link"></i> Copia link condivisione';
      }, 3000);
    } catch(e) {
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      mostraToast("Link copiato! ✅");
    }
  }

  function mostraToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
  }
</script>
</body>
</html>
`;
  }

  function _getDefaultTemplateCartolina8MarzoView() {
    return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>8 Marzo – La tua cartolina</title>
<link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@500;700&family=Titillium+Web:wght@300;400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<style>
  :root {
    --blu-900: #0D3A5C;
    --blu-700: #145284;
    --blu-500: #2E6DA8;
    --verde-700: #3CA434;
    --verde-500: #59C64D;
    --verde-300: #A4E89A;
    --verde-100: #E2F8DE;
    --grigio-700: #4A4A4A;
    --grigio-500: #9B9B9B;
    --mimosa: #F5C842;
    --mimosa-scuro: #C9960A;
    --rosa: #C2185B;
    --rosa-chiaro: #E06090;
    --rosa-bg: #FDE8EF;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { overflow-x: hidden; max-width: 100vw; }

  body {
    font-family: 'Titillium Web', sans-serif;
    background: linear-gradient(160deg, #0D3A5C 0%, #145284 35%, #1B6A6E 65%, #1A7C5A 100%);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 16px 40px;
    position: relative;
    overflow-x: hidden;
  }

  /* SFONDO DECORATIVO */
  body::before {
    content: '';
    position: fixed;
    top: -50%;
    right: -30%;
    width: 80vw;
    height: 80vw;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(245,200,66,0.08) 0%, transparent 70%);
    z-index: 0;
    pointer-events: none;
  }
  body::after {
    content: '';
    position: fixed;
    bottom: -40%;
    left: -20%;
    width: 70vw;
    height: 70vw;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(194,24,91,0.08) 0%, transparent 70%);
    z-index: 0;
    pointer-events: none;
  }

  /* PETALI */
  .petalo {
    position: fixed; opacity: 0; pointer-events: none;
    animation: caduta linear infinite; z-index: 0;
  }
  @keyframes caduta {
    0%   { transform: translateY(-60px) rotate(0deg) scale(0.8); opacity: 0; }
    10%  { opacity: 0.7; }
    90%  { opacity: 0.3; }
    100% { transform: translateY(110vh) rotate(720deg) scale(0.4); opacity: 0; }
  }

  /* INTRO */
  .intro {
    text-align: center;
    position: relative;
    z-index: 10;
    margin-bottom: 22px;
    animation: fadeDown 0.7s ease both;
  }
  @keyframes fadeDown {
    from { opacity: 0; transform: translateY(-16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .intro-emoji {
    display: block;
    margin-bottom: 10px;
  }
  .intro-emoji img {
    height: 80px;
    object-fit: contain;
    filter: drop-shadow(0 3px 8px rgba(0,0,0,0.2));
    animation: pulse 3s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); }
  }
  .intro h1 {
    color: white;
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: 0.5px;
    margin-bottom: 5px;
  }
  .intro p {
    color: rgba(255,255,255,0.55);
    font-size: 0.82rem;
    font-weight: 300;
  }
  /* Se c'è un mittente, lo mostriamo nell'intro */
  .intro-mittente {
    display: none;
    color: var(--mimosa);
    font-size: 0.85rem;
    font-weight: 700;
    margin-top: 4px;
  }
  .intro-mittente.visible { display: block; }

  /* CARTOLINA */
  .card-wrapper {
    width: 100%;
    max-width: 460px;
    position: relative;
    z-index: 10;
    margin-bottom: 28px;
    animation: popIn 0.55s cubic-bezier(.22,1.4,.36,1) 0.2s both;
  }
  @keyframes popIn {
    from { opacity: 0; transform: scale(0.88); }
    to   { opacity: 1; transform: scale(1); }
  }

  .cartolina {
    width: 100%;
    border-radius: 20px;
    overflow: hidden;
    box-shadow:
      0 4px 15px rgba(0,0,0,0.15),
      0 22px 60px rgba(0,0,0,0.4);
    background: white;
    position: relative;
    min-height: 280px;
    display: flex;
    flex-direction: column;
  }

  .card-bg {
    position: absolute; inset: 0;
    background: linear-gradient(155deg, #FDE8EF 0%, #FFF8E1 35%, #FFF0F5 65%, #E3F0FF 100%);
  }
  .card-bg::before {
    content: ''; position: absolute; inset: 0;
    background:
      radial-gradient(circle at 10% 15%, rgba(245,200,66,0.25) 0%, transparent 40%),
      radial-gradient(circle at 90% 80%, rgba(194,24,91,0.12) 0%, transparent 40%),
      radial-gradient(circle at 75% 10%, rgba(92,196,220,0.12) 0%, transparent 30%);
  }
  .card-bg::after {
    content: '';
    position: absolute;
    inset: 0;
    opacity: 0.04;
    background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='30' cy='30' r='4' fill='%23F5C842'/%3E%3Ccircle cx='10' cy='10' r='3' fill='%23C2185B'/%3E%3Ccircle cx='50' cy='50' r='3' fill='%23C2185B'/%3E%3C/svg%3E");
    background-size: 60px 60px;
  }

  .card-nastro {
    position: absolute; top: 0; left: 0;
    width: 100%; height: 5px;
    background: linear-gradient(90deg, var(--rosa) 0%, var(--rosa-chiaro) 50%, var(--mimosa) 100%);
    z-index: 3;
  }
  .card-deco-tr {
    position: absolute; top: 10px; right: 12px;
    font-size: 2rem; line-height: 1; z-index: 2;
    filter: drop-shadow(1px 2px 3px rgba(0,0,0,0.12));
    animation: dondola 4s ease-in-out infinite;
  }
  .card-deco-bl {
    position: absolute; bottom: 60px; left: 12px;
    font-size: 1.5rem; line-height: 1; z-index: 2;
    animation: dondola 5s ease-in-out infinite reverse;
  }

  .card-content {
    position: relative; z-index: 4;
    padding: 20px 20px 16px;
    flex: 1;
    display: flex; flex-direction: column;
    gap: 12px;
  }
  .card-data-label {
    font-size: 0.6rem; font-weight: 700;
    letter-spacing: 3px; color: var(--rosa);
    text-transform: uppercase; margin-bottom: 2px;
    opacity: 0.7;
  }
  .card-titolo {
    font-family: 'Dancing Script', cursive;
    font-size: 2rem; font-weight: 700;
    color: var(--rosa); line-height: 1.1;
    text-shadow: 1px 1px 0 rgba(255,255,255,0.6);
  }
  .card-titolo span { color: var(--mimosa-scuro); }

  .card-quote {
    font-size: 0.92rem; font-style: italic;
    color: var(--grigio-700); line-height: 1.65;
    max-width: 82%; padding: 10px 14px;
    background: rgba(255,255,255,0.65);
    border-radius: 10px; border-left: 3px solid var(--mimosa);
    backdrop-filter: blur(4px);
  }

  /* MESSAGGIO PERSONALE (dall'URL) */
  .card-msg-personale {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--rosa);
    line-height: 1.55;
    max-width: 78%;
    padding: 8px 12px;
    background: linear-gradient(135deg, rgba(253,232,239,0.8), rgba(255,240,245,0.7));
    border-radius: 10px;
    border-left: 3px solid var(--rosa-chiaro);
    display: none;
    animation: fadeInMsg 0.6s ease 0.6s both;
  }
  @keyframes fadeInMsg {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .card-msg-personale.visible { display: block; }

  /* NOME MITTENTE dentro la cartolina */
  .card-mittente {
    font-size: 0.78rem;
    font-weight: 600;
    color: #9B9B9B;
    font-style: italic;
    display: none;
    margin-top: 2px;
    animation: fadeInMsg 0.6s ease 0.8s both;
  }
  .card-mittente.visible { display: block; }

  .card-footer {
    display: flex; justify-content: space-between; align-items: flex-end;
    margin-top: auto;
  }
  .card-footer-comune {
    font-size: 0.56rem; font-weight: 700;
    letter-spacing: 1.5px; text-transform: uppercase;
    color: #9B9B9B; line-height: 1.6;
  }
  .card-footer-comune span {
    display: block; font-size: 0.7rem;
    color: var(--blu-700); font-weight: 700;
  }
  .card-mimosa {
    font-size: 1.8rem;
    animation: dondola 3s ease-in-out infinite;
    filter: drop-shadow(1px 2px 4px rgba(0,0,0,0.15));
  }
  @keyframes dondola {
    0%,100% { transform: rotate(-6deg); }
    50%      { transform: rotate(6deg); }
  }

  /* SEZIONE DOWNLOAD APP – grande e visibile */
  .download-section {
    width: 100%;
    max-width: 460px;
    position: relative;
    z-index: 10;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 18px;
    padding: 22px 18px;
    text-align: center;
    margin-bottom: 12px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    animation: fadeUp 0.5s ease 0.5s both;
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .download-section .download-icon {
    font-size: 2.2rem;
    margin-bottom: 8px;
    display: block;
  }
  .download-section h2 {
    color: white;
    font-size: 1.15rem;
    font-weight: 700;
    margin-bottom: 6px;
  }
  .download-section p {
    color: rgba(255,255,255,0.55);
    font-size: 0.78rem;
    font-weight: 300;
    margin-bottom: 16px;
    line-height: 1.5;
  }

  .azioni {
    width: 100%;
    max-width: 460px;
    position: relative;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .btn {
    display: flex; align-items: center; justify-content: center;
    gap: 10px; padding: 16px 20px; border-radius: 14px;
    border: none; font-family: 'Titillium Web', sans-serif;
    font-size: 0.92rem; font-weight: 700; cursor: pointer;
    transition: all 0.25s ease; text-decoration: none;
    letter-spacing: 0.3px; width: 100%;
    position: relative; overflow: hidden;
  }
  .btn:active { transform: scale(0.97); }
  .btn i { font-size: 1.1rem; }

  .btn-app {
    background: linear-gradient(135deg, var(--verde-700) 0%, var(--verde-500) 100%);
    color: white;
    box-shadow: 0 4px 18px rgba(60,164,52,0.4);
    font-size: 1rem;
    padding: 18px 20px;
  }
  .btn-app:hover {
    box-shadow: 0 6px 24px rgba(60,164,52,0.5);
    transform: translateY(-2px);
  }
  .btn-app i { font-size: 1.2rem; }

  .btn-home {
    background: rgba(255,255,255,0.08);
    color: white;
    border: 1px solid rgba(255,255,255,0.18);
  }
  .btn-home:hover {
    background: rgba(255,255,255,0.15);
    transform: translateY(-1px);
  }

  .divider-testo {
    text-align: center;
    color: rgba(255,255,255,0.35);
    font-size: 0.72rem;
    font-weight: 300;
    padding: 2px 0;
  }

  /* INFORMATIVA PRIVACY */
  .privacy-notice {
    width: 100%;
    max-width: 460px;
    margin-top: 18px;
    padding: 12px 16px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    position: relative;
    z-index: 10;
    animation: fadeUp 0.5s ease 0.7s both;
  }
  .privacy-notice i {
    color: var(--verde-300);
    font-size: 0.85rem;
    margin-top: 1px;
    flex-shrink: 0;
  }
  .privacy-notice p {
    color: rgba(255,255,255,0.85);
    font-size: 0.68rem;
    font-weight: 400;
    line-height: 1.6;
  }

  /* FOOTER */
  .footer-ist {
    margin-top: 16px;
    text-align: center;
    color: rgba(255,255,255,0.75);
    font-size: 0.65rem;
    font-weight: 300;
    position: relative; z-index: 10;
    line-height: 1.9;
  }
  .footer-ist a { color: rgba(255,255,255,0.9); text-decoration: none; transition: color 0.2s; }
  .footer-ist a:hover { color: white; }
</style>
<script>
// === SCRIPT INDIPENDENTE: Lettura parametri URL ===
// Questo script è separato per garantire che funzioni anche se altri script hanno errori
document.addEventListener('DOMContentLoaded', function() {
  try {
    var href = window.location.href || '';
    console.log('[Cartolina] URL completo:', href);

    function estraiParam(paramStr, key) {
      if (!paramStr) return null;
      var coppie = paramStr.split('&');
      for (var i = 0; i < coppie.length; i++) {
        var pos = coppie[i].indexOf('=');
        if (pos === -1) continue;
        var chiave = coppie[i].substring(0, pos);
        var valore = coppie[i].substring(pos + 1);
        try { chiave = decodeURIComponent(chiave); } catch(e) {}
        if (chiave === key) {
          try { return decodeURIComponent(valore); } catch(e) { return valore; }
        }
      }
      return null;
    }

    function leggiParam(key) {
      var hashStr = '';
      var queryStr = '';
      var hashPos = href.indexOf('#');
      if (hashPos !== -1) hashStr = href.substring(hashPos + 1);
      var qPos = href.indexOf('?');
      if (qPos !== -1) {
        var fine = (hashPos !== -1 && hashPos > qPos) ? hashPos : href.length;
        queryStr = href.substring(qPos + 1, fine);
      }
      return estraiParam(hashStr, key) || estraiParam(queryStr, key) || null;
    }

    function decodaBase64(str) {
      try { return decodeURIComponent(escape(atob(str))); }
      catch(e) { return str; }
    }

    function pulisci(str) {
      var d = document.createElement('div');
      d.textContent = str;
      return d.innerHTML;
    }

    var da = leggiParam('da');
    var msg = leggiParam('msg');
    console.log('[Cartolina] da raw:', da, '| msg raw:', msg);

    if (da) {
      var nome = decodaBase64(da);
      console.log('[Cartolina] nome decodificato:', nome);
      if (nome && nome.length > 0 && nome.length <= 50) {
        var nomeOk = pulisci(nome);
        var elIntro = document.getElementById('intro-mittente');
        if (elIntro) { elIntro.textContent = '✉️ Inviata da ' + nomeOk; elIntro.classList.add('visible'); }
        var elCard = document.getElementById('card-mittente');
        if (elCard) { elCard.textContent = '— ' + nomeOk; elCard.classList.add('visible'); }
      }
    }

    if (msg) {
      var testo = decodaBase64(msg);
      console.log('[Cartolina] messaggio decodificato:', testo);
      if (testo && testo.length > 0 && testo.length <= 150) {
        var testoOk = pulisci(testo);
        var elMsg = document.getElementById('msg-personale');
        if (elMsg) { elMsg.textContent = '💬 "' + testoOk + '"'; elMsg.classList.add('visible'); }
      }
    }

    if (!da && !msg) {
      console.log('[Cartolina] ATTENZIONE: nessun parametro trovato nella URL');
    }
  } catch(errore) {
    console.log('[Cartolina] ERRORE:', errore.message);
  }
});
</script>
</head>
<body>

<!-- INTRO -->
<div class="intro">
  <span class="intro-emoji"><img src="https://estensioni.comune.digital/docs/mimosa.png" alt="Mimosa"></span>
  <h1>Hai ricevuto una cartolina!</h1>
  <p>Qualcuno ti pensa in questo giorno speciale</p>
  <div class="intro-mittente" id="intro-mittente"></div>
</div>

<!-- CARTOLINA -->
<div class="card-wrapper">
  <div class="cartolina">
    <div class="card-bg"></div>
    <div class="card-nastro"></div>
    <div class="card-deco-tr">🌼🌿</div>
    <div class="card-deco-bl">🌸</div>
    <div class="card-content">
      <div>
        <div class="card-data-label">8 Marzo · Festa della Donna</div>
        <div class="card-titolo">Buon 8<span> Marzo</span></div>
      </div>
      <div class="card-quote">
        "Il rispetto non è un simbolo da esibire per un giorno.
        <br>È una responsabilità quotidiana che passa dai gesti,
        dalle scelte e dai diritti di tutte le donne."
      </div>
      <!-- Messaggio personale (dall'URL) -->
      <div class="card-msg-personale" id="msg-personale"></div>
      <!-- Nome mittente (dall'URL) -->
      <div class="card-mittente" id="card-mittente"></div>
      <div class="card-footer">
        <div class="card-footer-comune">
          Un pensiero a cura del
          <span>Comune di {{nome_comune}}</span>
        </div>
        <div class="card-mimosa">🌼</div>
      </div>
    </div>
  </div>
</div>

<!-- SEZIONE DOWNLOAD APP – grande e visibile -->
<div class="download-section">
  <span class="download-icon">📱</span>
  <h2>Non hai ancora l'app del Comune?</h2>
  <p>Resta aggiornato su eventi, servizi e notizie del tuo Comune direttamente sul tuo smartphone</p>
  <div class="azioni">
    <a class="btn btn-app" href="{{url_scarica_app}}" target="_blank" id="btn-app">
      <i class="fas fa-download"></i> Scarica l'app del Comune
    </a>
    <div class="divider-testo">— oppure —</div>
    <a class="btn btn-home" href="{{url_homepage}}" id="btn-torna">
      <i class="fas fa-home"></i> Vai all'homepage dell'app
    </a>
  </div>
</div>

<!-- INFORMATIVA PRIVACY -->
<div class="privacy-notice">
  <i class="fas fa-shield-alt"></i>
  <p>
    <strong>La tua privacy è al sicuro.</strong> Nessun dato personale viene salvato, raccolto o memorizzato dall'app.
    Il messaggio e il nome del mittente viaggiano esclusivamente all'interno del link e non vengono archiviati su alcun server.
  </p>
</div>

<div class="footer-ist">
  Un'iniziativa del Comune · Powered by <a href="https://www.comunedigital.it" target="_blank">Comune.Digital</a>
</div>

<script>
  // ============================================================
  // ⚙️ CONFIGURAZIONE – modifica questi valori per ogni comune
  // ============================================================
  const CONFIG = {
    nomeComune:    "{{nome_comune}}",
    urlScaricaApp: "{{url_scarica_app}}",
    urlHomepage:   "{{url_homepage}}"
  };
  // ============================================================

  // Applica i link dinamicamente
  document.getElementById('btn-app').href = CONFIG.urlScaricaApp;
  document.getElementById('btn-torna').href = CONFIG.urlHomepage;

  // Petali animati
  const petaliEmoji = ['🌸','🌼','💛','✨','🌿','💐'];
  petaliEmoji.forEach(em => {
    for (let j = 0; j < 3; j++) {
      const p = document.createElement('div');
      p.className = 'petalo';
      p.textContent = em;
      const size = 0.7 + Math.random() * 1;
      const dur = 8 + Math.random() * 8;
      const delay = Math.random() * 12;
      p.style.cssText = 'left:' + (Math.random()*100) + 'vw;font-size:' + size + 'rem;animation-duration:' + dur + 's;animation-delay:' + delay + 's';
      document.body.prepend(p);
    }
  });
</script>
</body>
</html>
`;
  }


    // ============================================================================
  // RENDERING FUNCTIONS
  // ============================================================================

  function _renderModels() {
    const container = document.getElementById('models-container');
    if (!container) return;

    container.innerHTML = '';

    const sortedTemplates = Object.values(state.templates)
      .sort((a, b) => (a.ordine || 999) - (b.ordine || 999));

    if (sortedTemplates.length === 0) {
      container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #999;">Nessun modello disponibile. Crea il primo modello.</p>';
      return;
    }

    sortedTemplates.forEach(template => {
      const card = document.createElement('div');
      card.className = 'template-card';
      card.style.borderLeftColor = template.colore;

      const fieldCount = template.campiVariabili ? template.campiVariabili.length : 0;

      card.innerHTML = `
        <div class="template-card-header">
          <div class="template-icon" style="background-color: ${template.colore};">
            <i class="fas ${template.icona}"></i>
          </div>
          <div class="template-info">
            <h3>${escapeHtml(template.nome)}</h3>
            <p class="template-desc">${escapeHtml(template.descrizione)}</p>
            <div class="template-meta">
              <span class="badge">v${escapeHtml(template.versione)}</span>
              <span class="badge">${fieldCount} campi</span>
            </div>
          </div>
        </div>
        <div class="template-actions">
          <button class="btn btn-primary btn-sm" onclick="GeneratoreWebapp._startGeneration('${template.id}')">
            <i class="fas fa-play"></i> Genera
          </button>
          <button class="btn btn-secondary btn-sm" onclick="GeneratoreWebapp._editTemplate('${template.id}')">
            <i class="fas fa-edit"></i> Modifica
          </button>
          <button class="btn btn-default btn-sm" onclick="GeneratoreWebapp._duplicateTemplate('${template.id}')">
            <i class="fas fa-copy"></i> Duplica
          </button>
          ${!template.isDefault ? `<button class="btn btn-danger btn-sm" onclick="GeneratoreWebapp._deleteTemplate('${template.id}')">
            <i class="fas fa-trash"></i>
          </button>` : ''}
        </div>
      `;

      container.appendChild(card);
    });
  }

  function _renderGenerationForm() {
    const template = state.templates[state.currentGenerationTemplate];
    if (!template) {
      UI.showError('Modello non trovato');
      return;
    }

    const container = document.getElementById('generation-form-container');
    if (!container) return;

    container.innerHTML = '';

    // Group fields by section
    const fieldsBySection = {};
    template.campiVariabili.forEach(campo => {
      const sezione = campo.sezione || 'base';
      if (!fieldsBySection[sezione]) {
        fieldsBySection[sezione] = [];
      }
      fieldsBySection[sezione].push(campo);
    });

    // Sort sections in defined order
    const sectionOrder = ['base', 'calendario', 'servizi', 'commerciali', 'documenti', 'link'];
    const sortedSections = sectionOrder.filter(s => fieldsBySection[s]);

    sortedSections.forEach(sezione => {
      const section = document.createElement('div');
      section.className = 'form-section';

      const sectionTitle = document.createElement('h3');
      sectionTitle.textContent = SEZIONI_LABELS[sezione] || sezione;
      section.appendChild(sectionTitle);

      fieldsBySection[sezione].forEach(campo => {
        section.appendChild(_createFieldInput(campo));
      });

      container.appendChild(section);
    });

    // Add generation button
    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'form-section-actions';
    buttonDiv.innerHTML = `
      <button class="btn btn-primary" onclick="GeneratoreWebapp._performGeneration()">
        <i class="fas fa-magic"></i> Genera Webapp
      </button>
      <button class="btn btn-default" onclick="GeneratoreWebapp._backToModels()">
        <i class="fas fa-arrow-left"></i> Torna ai Modelli
      </button>
    `;
    container.appendChild(buttonDiv);
  }

  function _createFieldInput(campo) {
    const container = document.createElement('div');
    container.className = 'form-group';

    const label = document.createElement('label');
    label.textContent = campo.label;
    if (campo.required) {
      const req = document.createElement('span');
      req.className = 'required';
      req.textContent = ' *';
      label.appendChild(req);
    }
    container.appendChild(label);

    let input;

    if (campo.tipo === 'text' || campo.tipo === 'tel' || campo.tipo === 'number') {
      input = document.createElement('input');
      input.type = campo.tipo;
      input.className = 'form-input';
      input.placeholder = campo.placeholder || '';
      input.value = state.formValues[campo.id] || campo.default || '';
      input.required = campo.required;
      input.dataset.fieldId = campo.id;
      input.addEventListener('change', _updateFormValue);
      container.appendChild(input);

    } else if (campo.tipo === 'select') {
      input = document.createElement('select');
      input.className = 'form-input';
      input.required = campo.required;
      input.dataset.fieldId = campo.id;

      const emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.textContent = '-- Seleziona --';
      input.appendChild(emptyOption);

      (campo.options || []).forEach(option => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        input.appendChild(opt);
      });

      input.value = state.formValues[campo.id] || campo.default || '';
      input.addEventListener('change', _updateFormValue);
      container.appendChild(input);

    } else if (campo.tipo === 'calendario_rifiuti') {
      container.appendChild(_createCalendarWidget(campo));

    } else if (campo.tipo === 'lista_date') {
      container.appendChild(_createListaDateWidget(campo));

    } else if (campo.tipo === 'lista_testi') {
      container.appendChild(_createListaTextiWidget(campo));
    }

    return container;
  }

  function _createCalendarWidget(campo) {
    const container = document.createElement('div');
    container.className = 'calendario-widget';
    container.id = 'widget-' + campo.id;

    const calendario = state.formValues[campo.id] || DEFAULT_CALENDARIO;

    const giorni = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

    let html = '<div class="calendario-table">';
    html += '<table>';

    for (let dayNum = 1; dayNum <= 6; dayNum++) {
      const dayName = giorni[dayNum - 1];
      html += '<tr><td class="day-label">' + dayName + '</td><td class="day-frazioni">';

      FRAZIONI_RIFIUTI.forEach(frazione => {
        const isChecked = (calendario[dayNum] || []).includes(frazione.id);
        html += `<label class="checkbox-frazione">
          <input type="checkbox"
                 data-day="${dayNum}"
                 data-frazione="${frazione.id}"
                 ${isChecked ? 'checked' : ''}
                 onchange="GeneratoreWebapp._updateCalendario('${campo.id}')">
          <span style="color: ${frazione.colore};">
            <i class="fas ${frazione.icona}"></i> ${frazione.label}
          </span>
        </label>`;
      });

      html += '</td></tr>';
    }

    html += '</table></div>';
    container.innerHTML = html;

    return container;
  }

  function _createListaDateWidget(campo) {
    const container = document.createElement('div');
    container.className = 'lista-widget';
    container.id = 'widget-' + campo.id;

    const dates = state.formValues[campo.id] || [];

    let html = '<div class="lista-controls">';
    html += `<input type="date" id="date-input-${campo.id}" class="form-input" placeholder="Seleziona data">`;
    html += `<button class="btn btn-secondary btn-sm" onclick="GeneratoreWebapp._addDateToList('${campo.id}')">`;
    html += '<i class="fas fa-plus"></i> Aggiungi data</button>';
    html += '</div>';

    html += '<div class="lista-items">';
    dates.forEach((date, index) => {
      html += `<div class="lista-item">
        <span>${escapeHtml(date)}</span>
        <button class="btn-remove" onclick="GeneratoreWebapp._removeDateFromList('${campo.id}', ${index})">
          <i class="fas fa-times"></i>
        </button>
      </div>`;
    });
    html += '</div>';

    container.innerHTML = html;
    return container;
  }

  function _createListaTextiWidget(campo) {
    const container = document.createElement('div');
    container.className = 'lista-widget';
    container.id = 'widget-' + campo.id;

    const testi = state.formValues[campo.id] || [];

    let html = '<div class="lista-controls">';
    html += `<input type="text" id="text-input-${campo.id}" class="form-input" placeholder="${campo.placeholder || 'Inserisci testo'}">`;
    html += `<button class="btn btn-secondary btn-sm" onclick="GeneratoreWebapp._addTextToList('${campo.id}')">`;
    html += '<i class="fas fa-plus"></i> Aggiungi</button>';
    html += '</div>';

    html += '<div class="lista-items">';
    testi.forEach((testo, index) => {
      html += `<div class="lista-item">
        <span>${escapeHtml(testo)}</span>
        <button class="btn-remove" onclick="GeneratoreWebapp._removeTextFromList('${campo.id}', ${index})">
          <i class="fas fa-times"></i>
        </button>
      </div>`;
    });
    html += '</div>';

    container.innerHTML = html;
    return container;
  }

  function _renderGenerationPreview(htmlData) {
    const container = document.getElementById('generation-preview-container');
    if (!container) return;

    container.innerHTML = '';

    const previewSection = document.createElement('div');
    previewSection.className = 'preview-section';

    // Check if multi-file (array) or single-file (string)
    const isMultiFile = Array.isArray(htmlData);

    const title = document.createElement('h3');
    title.textContent = 'Anteprima Webapp';
    previewSection.appendChild(title);

    if (isMultiFile) {
      // Multi-file template - create tabs
      const tabNav = document.createElement('div');
      tabNav.className = 'preview-tabs-nav';
      tabNav.style.cssText = 'display: flex; gap: 10px; margin-bottom: 15px; border-bottom: 2px solid #e0e0e0; flex-wrap: wrap;';

      htmlData.forEach((file, index) => {
        const btn = document.createElement('button');
        btn.className = 'preview-tab-btn';
        btn.style.cssText = index === 0 ? 'padding: 10px 20px; background: none; border: none; color: #145284; cursor: pointer; border-bottom: 3px solid #145284; font-weight: 600;' : 'padding: 10px 20px; background: none; border: none; color: #999; cursor: pointer; border-bottom: 3px solid transparent; font-weight: 600;';
        btn.textContent = file.label;
        btn.onclick = function() { _switchPreviewTab(index, htmlData); };
        tabNav.appendChild(btn);
      });

      previewSection.appendChild(tabNav);

      // Container for tab content
      const tabContent = document.createElement('div');
      tabContent.id = 'preview-tab-content';
      previewSection.appendChild(tabContent);

      // Aggiungi al DOM PRIMA di switchPreviewTab (che cerca #preview-tab-content)
      container.appendChild(previewSection);

      // Show first tab
      _switchPreviewTab(0, htmlData);
    } else {
      // Single-file template
      const iframeContainer = document.createElement('div');
      iframeContainer.className = 'preview-iframe-container';

      const iframe = document.createElement('iframe');
      iframe.className = 'preview-iframe';
      iframe.sandbox.add('allow-same-origin');
      iframe.sandbox.add('allow-scripts');
      iframe.sandbox.add('allow-popups');
      iframe.sandbox.add('allow-forms');
      iframeContainer.appendChild(iframe);
      previewSection.appendChild(iframeContainer);

      // Write HTML to iframe
      iframe.contentDocument.open();
      iframe.contentDocument.write(htmlData);
      iframe.contentDocument.close();

      const copyButtonDiv = document.createElement('div');
      copyButtonDiv.className = 'copy-button-container';
      copyButtonDiv.innerHTML = `
        <button class="btn btn-primary" onclick="GeneratoreWebapp._copyHTMLToClipboard()">
          <i class="fas fa-copy"></i> Copia codice HTML
        </button>
        <button class="btn btn-default" onclick="GeneratoreWebapp._downloadHTML()">
          <i class="fas fa-download"></i> Scarica HTML
        </button>
      `;
      previewSection.appendChild(copyButtonDiv);

      state.generatedHTML = htmlData;
    }

    // Per single-file, aggiungi al DOM qui (per multi-file è già stato aggiunto sopra)
    if (!isMultiFile) {
      container.appendChild(previewSection);
    }

    // Store the generated data
    state.generatedHTML = htmlData;
  }

  function _switchPreviewTab(index, htmlData) {
    const file = htmlData[index];
    const content = document.getElementById('preview-tab-content');

    content.innerHTML = '';

    const iframeContainer = document.createElement('div');
    iframeContainer.className = 'preview-iframe-container';

    const iframe = document.createElement('iframe');
    iframe.className = 'preview-iframe';
    iframe.sandbox.add('allow-same-origin');
    iframe.sandbox.add('allow-scripts');
    iframe.sandbox.add('allow-popups');
    iframe.sandbox.add('allow-forms');
    iframeContainer.appendChild(iframe);
    content.appendChild(iframeContainer);

    // Write HTML to iframe
    iframe.contentDocument.open();
    iframe.contentDocument.write(file.html);
    iframe.contentDocument.close();

    const copyButtonDiv = document.createElement('div');
    copyButtonDiv.className = 'copy-button-container';
    copyButtonDiv.innerHTML = `
      <button class="btn btn-primary" onclick="GeneratoreWebapp._copyFileHTML(${index})">
        <i class="fas fa-copy"></i> Copia codice ${file.nome}
      </button>
      <button class="btn btn-default" onclick="GeneratoreWebapp._downloadFileHTML(${index})">
        <i class="fas fa-download"></i> Scarica ${file.nome}
      </button>
    `;
    content.appendChild(copyButtonDiv);

    // Update active tab button
    document.querySelectorAll('.preview-tab-btn').forEach((btn, i) => {
      if (i === index) {
        btn.style.color = '#145284';
        btn.style.borderBottomColor = '#145284';
      } else {
        btn.style.color = '#999';
        btn.style.borderBottomColor = 'transparent';
      }
    });
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  function render() {
    // Permission check
    if (!AuthService.hasPermission('manage_webapp_templates')) {
      document.getElementById('mainContent').innerHTML = `
        <div style="padding: 40px; text-align: center; color: #d32f2f;">
          <i class="fas fa-lock" style="font-size: 48px; margin-bottom: 20px;"></i>
          <h2>Accesso negato</h2>
          <p>Non hai i permessi necessari per accedere a questa pagina.</p>
        </div>
      `;
      return;
    }

    const container = document.getElementById('mainContent');
    container.innerHTML = `
      <div class="generatore-webapp">
        <div class="page-header">
          <h1><i class="fas fa-magic"></i> Generatore Webapp</h1>
          <p class="page-subtitle">Crea e personalizza modelli di webapp per le municipalità</p>
        </div>

        <div class="tabs-nav">
          <button class="tab-button active" data-tab="modelli" onclick="GeneratoreWebapp._switchTab('modelli')">
            <i class="fas fa-th-large"></i> Modelli
          </button>
          <button class="tab-button" data-tab="genera" onclick="GeneratoreWebapp._switchTab('genera')">
            <i class="fas fa-magic"></i> Genera Webapp
          </button>
        </div>

        <div class="tabs-content">
          <!-- Modelli Tab -->
          <div id="tab-modelli" class="tab-content active">
            <div class="section-actions">
              <button class="btn btn-primary" onclick="GeneratoreWebapp._showNewModelModal()">
                <i class="fas fa-plus"></i> Nuovo Modello
              </button>
            </div>
            <div id="models-container" class="models-grid"></div>
          </div>

          <!-- Genera Tab -->
          <div id="tab-genera" class="tab-content">
            <div id="generation-form-container" class="generation-form"></div>
            <div id="generation-preview-container"></div>
          </div>
        </div>
      </div>
    `;

    _addStyles();
    _loadTemplates();
  }

  function _switchTab(tabName) {
    state.currentTab = tabName;

    // Update button active state
    document.querySelectorAll('.tab-button').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update content visibility
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`tab-${tabName}`).classList.add('active');

    if (tabName === 'genera' && state.currentGenerationTemplate) {
      _renderGenerationForm();
    }
  }

  function _startGeneration(templateId) {
    state.currentGenerationTemplate = templateId;
    state.formValues = {};

    // Pre-fill defaults
    const template = state.templates[templateId];
    if (template && template.campiVariabili) {
      template.campiVariabili.forEach(campo => {
        if (campo.default) {
          state.formValues[campo.id] = campo.default;
        }
      });
    }

    _switchTab('genera');
    _renderGenerationForm();
  }

  function _editTemplate(templateId) {
    // Show edit modal - for now just alert
    UI.showNotification('Modifica modello ' + templateId + ' (feature in progress)', 'info');
  }

  function _showNewModelModal() {
    UI.showNotification('Creazione nuovo modello (feature in progress)', 'info');
  }

  function _backToModels() {
    _switchTab('modelli');
  }

  function _updateFormValue(e) {
    const fieldId = e.target.dataset.fieldId;
    state.formValues[fieldId] = e.target.value;
  }

  function _updateCalendario(fieldId) {
    const calendario = {};
    const widget = document.getElementById('widget-' + fieldId);

    widget.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
      const day = parseInt(checkbox.dataset.day);
      const frazione = checkbox.dataset.frazione;

      if (!calendario[day]) {
        calendario[day] = [];
      }

      if (checkbox.checked) {
        calendario[day].push(frazione);
      }
    });

    state.formValues[fieldId] = calendario;
  }

  function _addDateToList(fieldId) {
    const input = document.getElementById('date-input-' + fieldId);
    const date = input.value;

    if (!date) {
      UI.showError('Selezionare una data');
      return;
    }

    if (!state.formValues[fieldId]) {
      state.formValues[fieldId] = [];
    }

    if (!state.formValues[fieldId].includes(date)) {
      state.formValues[fieldId].push(date);
      input.value = '';

      // Re-render the widget
      const container = document.getElementById('tab-genera');
      const widget = document.getElementById('widget-' + fieldId);
      if (widget) {
        const template = state.templates[state.currentGenerationTemplate];
        const campo = template.campiVariabili.find(c => c.id === fieldId);
        widget.replaceWith(_createListaDateWidget(campo));
      }
    } else {
      UI.showError('Data già aggiunta');
    }
  }

  function _removeDateFromList(fieldId, index) {
    if (state.formValues[fieldId]) {
      state.formValues[fieldId].splice(index, 1);

      const widget = document.getElementById('widget-' + fieldId);
      if (widget) {
        const template = state.templates[state.currentGenerationTemplate];
        const campo = template.campiVariabili.find(c => c.id === fieldId);
        widget.replaceWith(_createListaDateWidget(campo));
      }
    }
  }

  function _addTextToList(fieldId) {
    const input = document.getElementById('text-input-' + fieldId);
    const text = input.value.trim();

    if (!text) {
      UI.showError('Inserire un testo');
      return;
    }

    if (!state.formValues[fieldId]) {
      state.formValues[fieldId] = [];
    }

    state.formValues[fieldId].push(text);
    input.value = '';

    const widget = document.getElementById('widget-' + fieldId);
    if (widget) {
      const template = state.templates[state.currentGenerationTemplate];
      const campo = template.campiVariabili.find(c => c.id === fieldId);
      widget.replaceWith(_createListaTextiWidget(campo));
    }
  }

  function _removeTextFromList(fieldId, index) {
    if (state.formValues[fieldId]) {
      state.formValues[fieldId].splice(index, 1);

      const widget = document.getElementById('widget-' + fieldId);
      if (widget) {
        const template = state.templates[state.currentGenerationTemplate];
        const campo = template.campiVariabili.find(c => c.id === fieldId);
        widget.replaceWith(_createListaTextiWidget(campo));
      }
    }
  }

  function _performGeneration() {
    const template = state.templates[state.currentGenerationTemplate];
    if (!template) {
      UI.showError('Modello non trovato');
      return;
    }

    // Validate required fields
    const missingFields = [];
    template.campiVariabili.forEach(campo => {
      if (campo.required && (!state.formValues[campo.id] || state.formValues[campo.id] === '')) {
        missingFields.push(campo.label);
      }
    });

    if (missingFields.length > 0) {
      UI.showError('Compilare i campi obbligatori: ' + missingFields.join(', '));
      return;
    }

    UI.showLoading();
    setTimeout(() => {
      const generatedHtml = _generateHTML(state.currentGenerationTemplate, state.formValues);
      UI.hideLoading();
      _renderGenerationPreview(generatedHtml);
      UI.showSuccess('Webapp generato con successo');
    }, 500);
  }

  function _copyHTMLToClipboard() {
    if (!state.generatedHTML) {
      UI.showError('Nessun HTML da copiare');
      return;
    }

    // Handle both single-file (string) and multi-file (array)
    if (Array.isArray(state.generatedHTML)) {
      UI.showError('Per i modelli multi-file, usa il pulsante specifico per ogni file');
      return;
    }

    navigator.clipboard.writeText(state.generatedHTML).then(() => {
      UI.showSuccess('Codice HTML copiato negli appunti');
    }).catch(() => {
      UI.showError('Errore nella copia');
    });
  }

  function _downloadHTML() {
    if (!state.generatedHTML) {
      UI.showError('Nessun HTML da scaricare');
      return;
    }

    // Handle both single-file (string) and multi-file (array)
    if (Array.isArray(state.generatedHTML)) {
      UI.showError('Per i modelli multi-file, usa il pulsante specifico per ogni file');
      return;
    }

    const template = state.templates[state.currentGenerationTemplate];
    const filename = (template.nome || 'webapp').toLowerCase().replace(/\s+/g, '_') + '.html';

    const blob = new Blob([state.generatedHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function _copyFileHTML(fileIndex) {
    if (!state.generatedHTML || !Array.isArray(state.generatedHTML)) {
      UI.showError('Nessun HTML da copiare');
      return;
    }

    const file = state.generatedHTML[fileIndex];
    if (!file) {
      UI.showError('File non trovato');
      return;
    }

    navigator.clipboard.writeText(file.html).then(() => {
      UI.showSuccess('Codice ' + file.nome + ' copiato negli appunti');
    }).catch(() => {
      UI.showError('Errore nella copia');
    });
  }

  function _downloadFileHTML(fileIndex) {
    if (!state.generatedHTML || !Array.isArray(state.generatedHTML)) {
      UI.showError('Nessun HTML da scaricare');
      return;
    }

    const file = state.generatedHTML[fileIndex];
    if (!file) {
      UI.showError('File non trovato');
      return;
    }

    const blob = new Blob([file.html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ============================================================================
  // STYLES
  // ============================================================================

  function _addStyles() {
    if (document.getElementById('generatore-webapp-styles')) return;

    const style = document.createElement('style');
    style.id = 'generatore-webapp-styles';
    style.textContent = `
      .generatore-webapp {
        padding: 20px;
        max-width: 1400px;
        margin: 0 auto;
      }

      .page-header {
        margin-bottom: 30px;
      }

      .page-header h1 {
        color: #145284;
        font-family: 'Titillium Web', sans-serif;
        font-size: 28px;
        margin: 0 0 10px 0;
        font-weight: 700;
      }

      .page-subtitle {
        color: #666;
        font-size: 14px;
        margin: 0;
      }

      .tabs-nav {
        display: flex;
        gap: 10px;
        margin-bottom: 30px;
        border-bottom: 2px solid #e0e0e0;
      }

      .tab-button {
        padding: 12px 24px;
        background: none;
        border: none;
        color: #666;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        border-bottom: 3px solid transparent;
        margin-bottom: -2px;
        transition: all 0.3s ease;
      }

      .tab-button:hover {
        color: #145284;
      }

      .tab-button.active {
        color: #145284;
        border-bottom-color: #145284;
      }

      .tab-content {
        display: none;
      }

      .tab-content.active {
        display: block;
      }

      .section-actions {
        margin-bottom: 20px;
      }

      .models-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
        gap: 20px;
      }

      .template-card {
        background: white;
        border: 1px solid #e0e0e0;
        border-left: 5px solid #145284;
        border-radius: 8px;
        padding: 20px;
        transition: all 0.3s ease;
        display: flex;
        flex-direction: column;
      }

      .template-card:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }

      .template-card-header {
        display: flex;
        gap: 15px;
        margin-bottom: 20px;
        flex: 1;
      }

      .template-icon {
        width: 60px;
        height: 60px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 28px;
        flex-shrink: 0;
      }

      .template-info {
        flex: 1;
      }

      .template-info h3 {
        margin: 0 0 5px 0;
        color: #145284;
        font-family: 'Titillium Web', sans-serif;
        font-size: 16px;
        font-weight: 700;
      }

      .template-desc {
        margin: 0 0 10px 0;
        color: #666;
        font-size: 13px;
        line-height: 1.4;
      }

      .template-meta {
        display: flex;
        gap: 8px;
      }

      .badge {
        display: inline-block;
        background-color: #f0f0f0;
        color: #333;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
      }

      .template-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .btn {
        padding: 10px 16px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: all 0.3s ease;
      }

      .btn-primary {
        background-color: #145284;
        color: white;
      }

      .btn-primary:hover {
        background-color: #0d3a5c;
      }

      .btn-secondary {
        background-color: #3CA434;
        color: white;
      }

      .btn-secondary:hover {
        background-color: #2d8027;
      }

      .btn-default {
        background-color: #f0f0f0;
        color: #333;
        border: 1px solid #d0d0d0;
      }

      .btn-default:hover {
        background-color: #e0e0e0;
      }

      .btn-danger {
        background-color: #d32f2f;
        color: white;
      }

      .btn-danger:hover {
        background-color: #b71c1c;
      }

      .btn-sm {
        padding: 6px 12px;
        font-size: 12px;
      }

      .generation-form {
        background: white;
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 20px;
      }

      .form-section {
        margin-bottom: 30px;
      }

      .form-section h3 {
        color: #145284;
        font-family: 'Titillium Web', sans-serif;
        font-size: 16px;
        font-weight: 700;
        margin: 0 0 15px 0;
        padding-bottom: 10px;
        border-bottom: 2px solid #f0f0f0;
      }

      .form-group {
        margin-bottom: 20px;
      }

      .form-group label {
        display: block;
        color: #333;
        font-weight: 600;
        font-size: 14px;
        margin-bottom: 8px;
      }

      .required {
        color: #d32f2f;
      }

      .form-input {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #d0d0d0;
        border-radius: 4px;
        font-size: 14px;
        font-family: inherit;
        transition: border-color 0.3s ease;
        box-sizing: border-box;
      }

      .form-input:focus {
        outline: none;
        border-color: #145284;
        box-shadow: 0 0 0 3px rgba(20, 82, 132, 0.1);
      }

      .checkbox-frazione {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 0;
        cursor: pointer;
        user-select: none;
      }

      .checkbox-frazione input[type="checkbox"] {
        width: 18px;
        height: 18px;
        cursor: pointer;
      }

      .calendario-widget {
        background-color: #f9f9f9;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        padding: 15px;
      }

      .calendario-table table {
        width: 100%;
        border-collapse: collapse;
      }

      .calendario-table tr {
        border-bottom: 1px solid #e0e0e0;
      }

      .calendario-table tr:last-child {
        border-bottom: none;
      }

      .day-label {
        padding: 12px;
        font-weight: 600;
        color: #145284;
        width: 100px;
        vertical-align: top;
      }

      .day-frazioni {
        padding: 12px;
      }

      .lista-widget {
        background-color: #f9f9f9;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        padding: 15px;
      }

      .lista-controls {
        display: flex;
        gap: 8px;
        margin-bottom: 15px;
      }

      .lista-controls input {
        flex: 1;
      }

      .lista-items {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .lista-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background-color: white;
        border: 1px solid #d0d0d0;
        border-radius: 4px;
        padding: 10px 12px;
      }

      .btn-remove {
        background: none;
        border: none;
        color: #d32f2f;
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
      }

      .btn-remove:hover {
        color: #b71c1c;
      }

      .form-section-actions {
        display: flex;
        gap: 10px;
        margin-top: 30px;
        padding-top: 20px;
        border-top: 2px solid #f0f0f0;
      }

      .preview-section {
        background: white;
        border-radius: 8px;
        padding: 20px;
      }

      .preview-section h3 {
        color: #145284;
        font-family: 'Titillium Web', sans-serif;
        font-size: 16px;
        font-weight: 700;
        margin: 0 0 20px 0;
      }

      .preview-iframe-container {
        border: 1px solid #d0d0d0;
        border-radius: 4px;
        margin-bottom: 20px;
        background-color: #f9f9f9;
        overflow: hidden;
      }

      .preview-iframe {
        width: 100%;
        height: 600px;
        border: none;
        background: white;
      }

      .copy-button-container {
        display: flex;
        gap: 10px;
      }

      @media (max-width: 768px) {
        .models-grid {
          grid-template-columns: 1fr;
        }

        .template-actions {
          flex-direction: column;
        }

        .template-actions button {
          width: 100%;
        }

        .copy-button-container {
          flex-direction: column;
        }

        .copy-button-container button {
          width: 100%;
        }
      }
    `;

    document.head.appendChild(style);
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  return {
    render: render,
    _switchTab: _switchTab,
    _startGeneration: _startGeneration,
    _editTemplate: _editTemplate,
    _showNewModelModal: _showNewModelModal,
    _backToModels: _backToModels,
    _duplicateTemplate: _duplicateTemplate,
    _deleteTemplate: _deleteTemplate,
    _updateFormValue: _updateFormValue,
    _updateCalendario: _updateCalendario,
    _addDateToList: _addDateToList,
    _removeDateFromList: _removeDateFromList,
    _addTextToList: _addTextToList,
    _removeTextFromList: _removeTextFromList,
    _performGeneration: _performGeneration,
    _copyHTMLToClipboard: _copyHTMLToClipboard,
    _downloadHTML: _downloadHTML,
    _copyFileHTML: _copyFileHTML,
    _downloadFileHTML: _downloadFileHTML,
    _switchPreviewTab: _switchPreviewTab
  };
})();

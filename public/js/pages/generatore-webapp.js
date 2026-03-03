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
    documenti: 'Documenti'
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

    let html = template.codiceHTML;

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
        const safeValue = escapeHtml(value || '');
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
      stemmaBlock = '<img src="' + escapeHtml(stemmaUrl) + '" alt="Stemma Comune" style="width:100%;height:100%;object-fit:cover;">';
    } else {
      var nomeComune = escapeHtml(formValues['nome_comune'] || 'Comune');
      stemmaBlock = '<span>Comune<br>di<br>' + nomeComune + '</span>';
    }
    html = html.replace(/\{\{STEMMA_BLOCK\}\}/g, stemmaBlock);

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
    const sectionOrder = ['base', 'calendario', 'servizi', 'commerciali', 'documenti'];
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

  function _renderGenerationPreview(html) {
    const container = document.getElementById('generation-preview-container');
    if (!container) return;

    container.innerHTML = '';

    const previewSection = document.createElement('div');
    previewSection.className = 'preview-section';

    const title = document.createElement('h3');
    title.textContent = 'Anteprima Webapp';
    previewSection.appendChild(title);

    const iframeContainer = document.createElement('div');
    iframeContainer.className = 'preview-iframe-container';

    const iframe = document.createElement('iframe');
    iframe.className = 'preview-iframe';
    iframe.sandbox.add('allow-same-origin');
    iframeContainer.appendChild(iframe);
    previewSection.appendChild(iframeContainer);

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

    container.appendChild(previewSection);

    // Write HTML to iframe
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();

    // Store the generated HTML
    state.generatedHTML = html;
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  function render() {
    // Permission check
    if (!AuthService.hasPermission('manage_webapp_templates')) {
      document.getElementById('page-container').innerHTML = `
        <div style="padding: 40px; text-align: center; color: #d32f2f;">
          <i class="fas fa-lock" style="font-size: 48px; margin-bottom: 20px;"></i>
          <h2>Accesso negato</h2>
          <p>Non hai i permessi necessari per accedere a questa pagina.</p>
        </div>
      `;
      return;
    }

    const container = document.getElementById('page-container');
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
    _downloadHTML: _downloadHTML
  };
})();

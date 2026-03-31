/**
 * GeneratoreHome – Generatore Homepage Comune.Digital
 * Produce file HTML completi e funzionanti per le app dei comuni.
 * Si integra nel CRM come sezione dell'Officina Digitale.
 */
window.GeneratoreHome = (function () {
  'use strict';

  /* ============================================================
     COLOR UTILITIES
     ============================================================ */
  function hexToRGB(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    return { r: parseInt(hex.substring(0,2),16), g: parseInt(hex.substring(2,4),16), b: parseInt(hex.substring(4,6),16) };
  }

  function rgbToHSL(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    let h, s, l = (max+min)/2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d/(2-max-min) : d/(max+min);
      switch(max) {
        case r: h = ((g-b)/d + (g<b?6:0))/6; break;
        case g: h = ((b-r)/d + 2)/6; break;
        case b: h = ((r-g)/d + 4)/6; break;
      }
    }
    return { h: Math.round(h*360), s: Math.round(s*100), l: Math.round(l*100) };
  }

  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1-l);
    const f = n => { const k = (n + h/30) % 12; const color = l - a * Math.max(Math.min(k-3, 9-k, 1), -1); return Math.round(255*color).toString(16).padStart(2,'0'); };
    return '#' + f(0) + f(8) + f(4);
  }

  function generatePalette(baseHex) {
    const rgb = hexToRGB(baseHex);
    const hsl = rgbToHSL(rgb.r, rgb.g, rgb.b);
    return {
      '900': hslToHex(hsl.h, Math.min(hsl.s+5,100), Math.max(hsl.l-15, 15)),
      '700': baseHex,
      '500': hslToHex(hsl.h, hsl.s, Math.min(hsl.l+10, 60)),
      '300': hslToHex(hsl.h, Math.max(hsl.s-10,20), 65),
      '100': hslToHex(hsl.h, Math.max(hsl.s-15,15), 88),
    };
  }

  function generateDarkPalette(lightPalette, baseHex) {
    const rgb = hexToRGB(baseHex);
    const hsl = rgbToHSL(rgb.r, rgb.g, rgb.b);
    return {
      '900': hslToHex(hsl.h, Math.min(hsl.s+5,100), Math.max(hsl.l-20, 10)),
      '700': hslToHex(hsl.h, Math.min(hsl.s+15,100), Math.min(hsl.l+15, 55)),
      '500': hslToHex(hsl.h, hsl.s, Math.min(hsl.l+25, 65)),
      '300': hslToHex(hsl.h, Math.max(hsl.s-5,20), Math.max(hsl.l-5, 25)),
      '100': hslToHex(hsl.h, Math.min(hsl.s+5,100), Math.max(hsl.l-25, 12)),
    };
  }

  /**
   * Applica gli override manuali dell'utente a una palette auto-generata.
   * overrides è un oggetto { '900': '#xxx', '500': '', ... } — le chiavi vuote restano auto.
   */
  function applyPaletteOverrides(palette, overrides) {
    if (!overrides) return palette;
    const result = { ...palette };
    ['900','500','300','100'].forEach(k => {
      if (overrides[k] && /^#[0-9a-fA-F]{3,6}$/.test(overrides[k])) {
        result[k] = overrides[k];
      }
    });
    return result;
  }

  /* ============================================================
     PRESET COLOR PALETTES
     ============================================================ */
  const COLOR_PRESETS = [
    { name: 'Comune.Digital',       primary: '#145284', secondary: '#3CA434', icon: 'fa-city',              desc: 'Blu istituzionale + Verde' },
    { name: 'Blu Notte',            primary: '#0D3A5C', secondary: '#FF9800', icon: 'fa-moon',              desc: 'Blu scuro + Arancione' },
    { name: 'Verde Natura',         primary: '#2E7D32', secondary: '#FF6F00', icon: 'fa-leaf',              desc: 'Verde bosco + Arancio caldo' },
    { name: 'Rosso Borghi',         primary: '#B71C1C', secondary: '#1565C0', icon: 'fa-landmark',          desc: 'Rosso mattone + Blu' },
    { name: 'Azzurro Mare',         primary: '#0288D1', secondary: '#43A047', icon: 'fa-water',             desc: 'Azzurro + Verde acqua' },
    { name: 'Viola Cultura',        primary: '#6A1B9A', secondary: '#00897B', icon: 'fa-masks-theater',     desc: 'Viola + Verde teal' },
    { name: 'Arancione Energia',    primary: '#E65100', secondary: '#1B5E20', icon: 'fa-sun',               desc: 'Arancione + Verde scuro' },
    { name: 'Grigio Moderno',       primary: '#37474F', secondary: '#00ACC1', icon: 'fa-building',          desc: 'Grigio antracite + Ciano' },
    { name: 'Turchese Costiero',    primary: '#00695C', secondary: '#EF6C00', icon: 'fa-umbrella-beach',    desc: 'Turchese + Arancio' },
    { name: 'Bordeaux Elegante',    primary: '#880E4F', secondary: '#4A148C', icon: 'fa-wine-glass',        desc: 'Bordeaux + Viola profondo' },
    { name: 'Oliva Campagna',       primary: '#558B2F', secondary: '#8D6E63', icon: 'fa-tractor',           desc: 'Oliva + Marrone terra' },
    { name: 'Blu Elettrico',        primary: '#1A237E', secondary: '#F57C00', icon: 'fa-bolt',              desc: 'Blu intenso + Arancione' },
    { name: 'Rosso Gonfalone',      primary: '#9A162B', secondary: '#145284', icon: 'fa-flag',              desc: 'Rosso gonfalone + Blu' },
  ];

  /* ============================================================
     FA ICONS LIST
     ============================================================ */
  const FA_ICONS = [
    // — Edifici e luoghi istituzionali —
    { v: 'fa-building-columns', l: 'Municipio / Palazzo' },
    { v: 'fa-landmark', l: 'Monumento / Sede istituzionale' },
    { v: 'fa-building', l: 'Edificio / Ufficio' },
    { v: 'fa-building-flag', l: 'Sede con bandiera' },
    { v: 'fa-city', l: 'Città / Skyline' },
    { v: 'fa-tree-city', l: 'Città verde / Urbanistica' },
    { v: 'fa-house', l: 'Casa / Abitazione' },
    { v: 'fa-house-chimney', l: 'Casa con camino' },
    { v: 'fa-school', l: 'Scuola' },
    { v: 'fa-hospital', l: 'Ospedale' },
    { v: 'fa-house-medical', l: 'Guardia medica / ASL' },
    { v: 'fa-church', l: 'Chiesa' },
    { v: 'fa-mosque', l: 'Moschea' },
    { v: 'fa-store', l: 'Negozio / Commercio' },
    { v: 'fa-shop', l: 'Bottega / Attività locale' },
    // — Servizi e utilità —
    { v: 'fa-gears', l: 'Servizi / Ingranaggi' },
    { v: 'fa-screwdriver-wrench', l: 'Manutenzione / Lavori' },
    { v: 'fa-phone', l: 'Telefono / Contatti' },
    { v: 'fa-envelope', l: 'Posta / E-mail' },
    { v: 'fa-wifi', l: 'Wi-Fi / Connettività' },
    { v: 'fa-globe', l: 'Web / Sito internet' },
    { v: 'fa-circle-info', l: 'Informazioni' },
    { v: 'fa-circle-question', l: 'FAQ / Domande' },
    { v: 'fa-headset', l: 'Assistenza / Supporto' },
    { v: 'fa-comment-dots', l: 'Chat / Messaggi' },
    { v: 'fa-bell', l: 'Notifiche / Avvisi' },
    { v: 'fa-bullhorn', l: 'Comunicazioni / Annunci' },
    { v: 'fa-newspaper', l: 'Notizie / Giornale' },
    { v: 'fa-clipboard-list', l: 'Lista / Elenco pratiche' },
    { v: 'fa-file-lines', l: 'Documento / Modulo' },
    { v: 'fa-file-signature', l: 'Firma / Autocertificazione' },
    { v: 'fa-file-invoice', l: 'Fattura / Tributi' },
    { v: 'fa-receipt', l: 'Ricevuta / Pagamenti' },
    { v: 'fa-credit-card', l: 'Pagamento / Carta' },
    { v: 'fa-money-bill-wave', l: 'Pagamenti / Economia' },
    { v: 'fa-coins', l: 'Tasse / Tributi locali' },
    { v: 'fa-scale-balanced', l: 'Giustizia / Legale' },
    { v: 'fa-gavel', l: 'Delibere / Atti ufficiali' },
    // — Segnalazioni e sicurezza —
    { v: 'fa-triangle-exclamation', l: 'Segnalazione / Attenzione' },
    { v: 'fa-flag', l: 'Segnala / Bandiera' },
    { v: 'fa-shield-halved', l: 'Sicurezza / Protezione' },
    { v: 'fa-helmet-safety', l: 'Cantiere / Lavori in corso' },
    { v: 'fa-tower-broadcast', l: 'Allerte / Emergenze' },
    { v: 'fa-fire-extinguisher', l: 'Vigili del fuoco' },
    { v: 'fa-kit-medical', l: 'Pronto soccorso' },
    // — Persone e servizi sociali —
    { v: 'fa-users', l: 'Comunità / Persone' },
    { v: 'fa-people-group', l: 'Gruppo / Associazioni' },
    { v: 'fa-user', l: 'Cittadino / Profilo' },
    { v: 'fa-user-doctor', l: 'Medico / Sanità' },
    { v: 'fa-user-graduate', l: 'Laureato / Formazione' },
    { v: 'fa-user-tie', l: 'Funzionario / Dirigente' },
    { v: 'fa-user-shield', l: 'Protezione dati / Privacy' },
    { v: 'fa-baby', l: 'Neonato / Infanzia' },
    { v: 'fa-children', l: 'Bambini / Minori' },
    { v: 'fa-person-cane', l: 'Anziani / Terza età' },
    { v: 'fa-wheelchair', l: 'Accessibilità / Disabilità' },
    { v: 'fa-hand-holding-heart', l: 'Servizi sociali / Volontariato' },
    { v: 'fa-hands-holding-child', l: 'Tutela minori / Famiglia' },
    { v: 'fa-id-card', l: 'Carta d\'identità / Documenti' },
    { v: 'fa-passport', l: 'Passaporto / Anagrafe' },
    { v: 'fa-hands-praying', l: 'Culto / Spiritualità' },
    // — Istruzione e cultura —
    { v: 'fa-graduation-cap', l: 'Istruzione / Scuola' },
    { v: 'fa-book-open', l: 'Biblioteca / Lettura' },
    { v: 'fa-book', l: 'Libro / Cultura' },
    { v: 'fa-chalkboard-user', l: 'Insegnamento / Corsi' },
    { v: 'fa-palette', l: 'Arte / Creatività' },
    { v: 'fa-paintbrush', l: 'Pittura / Restauro' },
    { v: 'fa-masks-theater', l: 'Teatro / Spettacoli' },
    { v: 'fa-music', l: 'Musica / Concerti' },
    { v: 'fa-film', l: 'Cinema / Video' },
    { v: 'fa-camera', l: 'Fotografia / Immagini' },
    // — Turismo e territorio —
    { v: 'fa-map-location-dot', l: 'Mappa / Posizione' },
    { v: 'fa-map', l: 'Cartina / Territorio' },
    { v: 'fa-location-dot', l: 'Punto di interesse' },
    { v: 'fa-route', l: 'Itinerario / Percorso' },
    { v: 'fa-signs-post', l: 'Indicazioni / Segnaletica' },
    { v: 'fa-mountain-sun', l: 'Montagna / Paesaggio' },
    { v: 'fa-mountain', l: 'Montagna / Sentieri' },
    { v: 'fa-water', l: 'Mare / Acqua' },
    { v: 'fa-umbrella-beach', l: 'Spiaggia / Balneare' },
    { v: 'fa-campground', l: 'Campeggio / Natura' },
    { v: 'fa-person-hiking', l: 'Escursioni / Trekking' },
    { v: 'fa-person-biking', l: 'Ciclismo / Bici' },
    { v: 'fa-compass', l: 'Esplora / Bussola' },
    { v: 'fa-binoculars', l: 'Osservazione / Panorami' },
    { v: 'fa-bed', l: 'Alloggio / Dormire' },
    { v: 'fa-suitcase', l: 'Turismo / Viaggiare' },
    { v: 'fa-plane', l: 'Aeroporto / Voli' },
    { v: 'fa-ship', l: 'Porto / Traghetti' },
    // — Trasporti e mobilità —
    { v: 'fa-bus', l: 'Autobus / Trasporto pubblico' },
    { v: 'fa-train', l: 'Treno / Ferrovia' },
    { v: 'fa-car', l: 'Auto / Parcheggi' },
    { v: 'fa-taxi', l: 'Taxi / NCC' },
    { v: 'fa-bicycle', l: 'Bicicletta / Ciclabile' },
    { v: 'fa-motorcycle', l: 'Moto / Scooter' },
    { v: 'fa-charging-station', l: 'Colonnina elettrica' },
    { v: 'fa-gas-pump', l: 'Distributore / Carburante' },
    { v: 'fa-road', l: 'Strade / Viabilità' },
    { v: 'fa-parking', l: 'Parcheggio' },
    // — Ambiente e sostenibilità —
    { v: 'fa-leaf', l: 'Natura / Ecologia' },
    { v: 'fa-seedling', l: 'Piantina / Sostenibilità' },
    { v: 'fa-tree', l: 'Albero / Parco' },
    { v: 'fa-recycle', l: 'Riciclo / Raccolta differenziata' },
    { v: 'fa-trash-can', l: 'Rifiuti / Spazzatura' },
    { v: 'fa-dumpster', l: 'Cassonetto / Isola ecologica' },
    { v: 'fa-solar-panel', l: 'Energia solare / Rinnovabili' },
    { v: 'fa-wind', l: 'Vento / Eolico' },
    { v: 'fa-temperature-half', l: 'Temperatura / Clima' },
    { v: 'fa-paw', l: 'Animali / Canile' },
    { v: 'fa-dog', l: 'Cane / Animali domestici' },
    // — Sport e tempo libero —
    { v: 'fa-futbol', l: 'Calcio / Sport' },
    { v: 'fa-basketball', l: 'Basket / Palestra' },
    { v: 'fa-volleyball', l: 'Pallavolo / Beach volley' },
    { v: 'fa-table-tennis-paddle-ball', l: 'Ping pong / Giochi' },
    { v: 'fa-dumbbell', l: 'Palestra / Fitness' },
    { v: 'fa-person-swimming', l: 'Piscina / Nuoto' },
    { v: 'fa-person-running', l: 'Corsa / Atletica' },
    { v: 'fa-chess', l: 'Giochi / Scacchi' },
    // — Cibo e ristorazione —
    { v: 'fa-utensils', l: 'Ristorante / Mangiare' },
    { v: 'fa-pizza-slice', l: 'Pizzeria / Street food' },
    { v: 'fa-wine-glass', l: 'Enoteca / Vino' },
    { v: 'fa-mug-hot', l: 'Bar / Caffè' },
    { v: 'fa-ice-cream', l: 'Gelateria / Dolci' },
    { v: 'fa-wheat-awn', l: 'Agricoltura / Grano' },
    { v: 'fa-lemon', l: 'Agrumi / Prodotti tipici' },
    // — Eventi e calendario —
    { v: 'fa-calendar-days', l: 'Calendario / Eventi' },
    { v: 'fa-calendar-check', l: 'Prenotazione / Appuntamento' },
    { v: 'fa-clock', l: 'Orari / Aperture' },
    { v: 'fa-champagne-glasses', l: 'Feste / Celebrazioni' },
    { v: 'fa-gift', l: 'Regalo / Promozioni' },
    { v: 'fa-star', l: 'Speciale / Preferiti' },
    { v: 'fa-heart', l: 'Cuore / Preferiti' },
    { v: 'fa-trophy', l: 'Premio / Concorsi' },
    { v: 'fa-ticket', l: 'Biglietto / Ingressi' },
    { v: 'fa-fire', l: 'Evento caldo / Tendenza' },
    // — Tecnologia e digitale —
    { v: 'fa-laptop', l: 'Computer / Digitale' },
    { v: 'fa-mobile-screen', l: 'Smartphone / App' },
    { v: 'fa-qrcode', l: 'QR Code / Scansione' },
    { v: 'fa-download', l: 'Download / Scarica' },
    { v: 'fa-cloud', l: 'Cloud / Servizi online' },
    { v: 'fa-lock', l: 'Sicurezza / Accesso protetto' },
    { v: 'fa-key', l: 'Chiave / SPID / Login' },
    { v: 'fa-fingerprint', l: 'Impronta / Identità digitale' },
    // — Altro —
    { v: 'fa-face-smile', l: 'Sorriso / Soddisfazione' },
    { v: 'fa-lightbulb', l: 'Idea / Suggerimenti' },
    { v: 'fa-wrench', l: 'Strumenti / Configurazione' },
    { v: 'fa-bolt', l: 'Energia / Elettricità' },
    { v: 'fa-cross', l: 'Cimitero / Servizi cimiteriali' },
    { v: 'fa-dove', l: 'Pace / Colomba' },
    { v: 'fa-earth-europe', l: 'Europa / Internazionale' },
    { v: 'fa-handshake', l: 'Accordi / Collaborazioni' },
    { v: 'fa-section', l: 'Regolamento / Normativa' },
    { v: 'fa-universal-access', l: 'Accessibilità universale' },
    { v: 'fa-eye', l: 'Trasparenza / Visualizza' },
    { v: 'fa-chart-line', l: 'Statistiche / Andamento' },
    { v: 'fa-chart-pie', l: 'Grafici / Bilancio' },
  ];

  /* ============================================================
     STATE
     ============================================================ */
  function getDefaultState() {
    return {
      nomeComune: '', baseUrl: '', pageTitle: '', stemmaUrl: '',
      lat: '', lon: '',
      colorePrimario: '#145284', coloreSecondario: '#3CA434',
      // Override manuali palette (vuoto = auto-calcolato)
      palettePrimarioOverride: { '900': '', '500': '', '300': '', '100': '' },
      paletteSecondarioOverride: { '900': '', '500': '', '300': '', '100': '' },
      tickerRssId: '', tickerLinkUrl: 'social',
      slides: [{ titleIt: '', titleEn: '', href: '', bg: '' }],
      servizi: [{
        sectionIt: 'Servizi Comunali', sectionEn: 'Municipal Services',
        items: [
          { icon: 'fa-building-columns', labelIt: 'Municipio', labelEn: 'Town Hall', href: 'municipio-cittadini' },
          { icon: 'fa-gears', labelIt: 'Servizi', labelEn: 'Online Services', href: 'servizi-online' },
          { icon: 'fa-triangle-exclamation', labelIt: 'Segnala', labelEn: 'Report Issue', href: 'segnalazioni' },
        ]
      }],
      bannerGroups: [],
      // RSS Sliders (replicabili)
      rssSliders: [],
      bannerCieEnabled: true,
      bannerCieTitle: "Stop alla carta d'identità cartacea",
      bannerCieTitleEn: 'Paper ID cards discontinued',
      bannerCieSubtitle: 'Dal 3 agosto 2026 non sarà più valida',
      bannerCieSubtitleEn: 'From August 3, 2026 they will no longer be valid',
      bannerCieHref: '',
      raccoltaFeedUrl: '', raccoltaInfoUrl: 'raccolta-differenziata',
      raccoltaEcoTips: [
        'Usa borracce riutilizzabili: eviti decine di bottiglie al mese.',
        'Sciacqua i contenitori prima della plastica: migliora il riciclo.',
        'Carta unta? Organico, non carta.',
        'Conserva i tappi di sughero: molti Comuni li raccolgono.',
        'Pianifica i pasti: meno spreco = meno rifiuti.',
        'Olio esausto alle isole ecologiche.',
        'Pile e farmaci scaduti nei punti dedicati.',
        'Prodotti sfusi = meno imballaggi.',
        'Bicchieri di vetro ≠ bottiglie: verifica regole locali.',
        'Abbassa 1°C il riscaldamento: -10% energia.'
      ],
      protCivileEnabled: true, protCivileApiKey: '', protCivileRegione: 'Sici-E',
      protCivileComune: '', protCivileUrlRegione: 'https://www.protezionecivilesicilia.it',
      meteoWeeklyUrl: 'meteo', meteoInterval: 15, meteoTimeout: 10000,
      footerTerminiUrl: '', footerTerminiLabel: 'Termini e condizioni del Servizio',
      footerPrivacyUrl: '', footerPrivacyLabel: 'Privacy Policy',
      footerCopyrightText: 'Comune.Digital', footerCopyrightUrl: 'https://app.comune.digital',
      a11yDarkMode: true, a11yContrasto: true, a11yFontScale: true, a11yMaxFontScale: 4, a11yRispettaSistema: false,
      spotlightWidgetId: '', spotlightDurata: 2500, spotlightForzaSempre: false,
      // Tab Bar
      tabBarItems: [
        { icon: 'fa-building-columns', labelIt: 'Municipio', labelEn: 'Town Hall', href: 'municipio-cittadini', isCenter: false },
        { icon: 'fa-triangle-exclamation', labelIt: 'Emergenza', labelEn: 'Emergency', href: 'emergenza', isCenter: false },
        { icon: 'fa-house', labelIt: 'Home', labelEn: 'Home', href: '', isCenter: true },
        { icon: 'fa-heart-pulse', labelIt: 'DAE', labelEn: 'AED', href: 'dae', isCenter: false },
        { icon: 'fa-bars', labelIt: 'Menu', labelEn: 'Menu', href: 'menu', isCenter: false },
      ],
      // Widget Custom (iframe isolato)
      customWidget: {
        enabled: false,
        height: 300,
        label: 'Widget Custom',
        htmlCode: '',
      },
      widgets: [
        { id: 'dateHeader', label: 'Barra Data', enabled: true, order: 0 },
        { id: 'tickerBar', label: 'Ticker News', enabled: true, order: 1 },
        { id: 'slideshow', label: 'Slideshow', enabled: true, order: 2 },
        { id: 'servizi', label: 'Servizi', enabled: true, order: 3 },
        { id: 'bannerCIE', label: 'Banner CIE', enabled: true, order: 4 },
        { id: 'raccoltaDifferenziata', label: 'Raccolta Differenziata', enabled: true, order: 5 },
        { id: 'protezioneCivile', label: 'Protezione Civile', enabled: true, order: 6 },
        { id: 'meteoCard', label: 'Meteo', enabled: true, order: 7 },
        { id: 'customWidget', label: 'Widget Custom', enabled: false, order: 8 },
        { id: 'tabBar', label: 'Tab Bar', enabled: false, order: 9 },
      ],
    };
  }

  let state = getDefaultState();

  /* ============================================================
     HELPERS
     ============================================================ */
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  function makeInput(id, label, value, placeholder, type) {
    type = type || 'text';
    return '<div style="margin-bottom:16px;"><label style="display:block;font-weight:600;color:#4A4A4A;margin-bottom:6px;font-size:13px;">'+esc(label)+'</label>' +
      '<input type="'+type+'" id="'+id+'" value="'+esc(value||'')+'" placeholder="'+esc(placeholder||'')+'" style="width:100%;padding:10px 14px;border:1px solid #d0d0d0;border-radius:8px;font-family:\'Titillium Web\',sans-serif;font-size:14px;box-sizing:border-box;"></div>';
  }

  function makeCheckbox(id, label, checked) {
    return '<div style="margin-bottom:12px;"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;">' +
      '<input type="checkbox" id="'+id+'" '+(checked?'checked':'')+' style="width:18px;height:18px;cursor:pointer;">' +
      '<span style="font-weight:600;color:#4A4A4A;font-size:14px;">'+esc(label)+'</span></label></div>';
  }

  function makeSection(icon, title, bodyHtml, open) {
    return '<div class="gh-section" style="background:#fff;border-radius:12px;border:1px solid #e0e0e0;margin-bottom:16px;overflow:hidden;">' +
      '<div class="ghSectionHeader" style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;cursor:pointer;background:#f8f9fa;border-bottom:1px solid #e0e0e0;font-weight:700;color:#145284;font-size:15px;">' +
      '<span><i class="fas '+esc(icon)+'"></i> '+esc(title)+'</span><i class="fas fa-chevron-down" style="transition:transform .2s;'+(open?'transform:rotate(180deg);':'')+'"></i></div>' +
      '<div class="ghSectionBody" style="padding:20px;display:'+(open?'block':'none')+';">'+bodyHtml+'</div></div>';
  }

  function makeIconSelect(id, selected) {
    let opts = FA_ICONS.map(ic => '<option value="'+ic.v+'" '+(ic.v===selected?'selected':'')+'>'+ic.l+'</option>').join('');
    return '<select id="'+id+'" style="width:100%;padding:10px 14px;border:1px solid #d0d0d0;border-radius:8px;font-family:\'Titillium Web\',sans-serif;font-size:14px;">'+opts+'</select>';
  }

  /* ============================================================
     RENDER – FORM UI
     ============================================================ */
  function render() {
    const el = document.getElementById('mainContent');
    if (!el) return;

    let formHtml = '';

    // LAYOUT: wrapper due colonne (form + preview)
    formHtml += '<div id="ghMainLayout" style="display:flex;gap:20px;padding:20px;font-family:\'Titillium Web\',sans-serif;max-width:1800px;margin:0 auto;">';

    // COLONNA FORM
    formHtml += '<div id="ghFormCol" style="flex:1;min-width:0;max-width:900px;">';

    // HEADER
    formHtml += '<div style="background:linear-gradient(135deg,#0D3A5C,#145284);color:#fff;padding:24px;border-radius:16px;margin-bottom:24px;">';
    formHtml += '<h1 style="margin:0;font-size:24px;font-weight:900;"><i class="fas fa-home"></i> Generatore Home Comune</h1>';
    formHtml += '<p style="margin:8px 0 0;opacity:.8;font-size:14px;">Configura e genera la homepage personalizzata per l\'app del comune</p></div>';

    // === SEZ. 0: CONFIGURAZIONI SALVATE (Firebase) ===
    formHtml += makeSection('fa-database', 'Configurazioni Salvate',
      '<div id="ghFirebaseWarning" style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px 16px;margin-bottom:16px;color:#856404;font-size:13px;display:none;">' +
        '<i class="fas fa-exclamation-triangle"></i> Firebase non disponibile – salvataggio disabilitato' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">' +
        '<div><label style="display:block;font-weight:600;color:#4A4A4A;margin-bottom:6px;font-size:13px;">Configurazione Salvata</label>' +
          '<select id="ghConfigSelect" style="width:100%;padding:10px 14px;border:1px solid #d0d0d0;border-radius:8px;font-family:\'Titillium Web\',sans-serif;font-size:14px;">' +
            '<option value="">-- Nessuna --</option>' +
          '</select></div>' +
        '<div style="display:flex;flex-direction:column;justify-content:flex-end;gap:6px;">' +
          '<button type="button" id="ghBtnLoadConfig" style="background:#3CA434;color:#fff;border:none;padding:10px 14px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;font-family:\'Titillium Web\',sans-serif;"><i class="fas fa-download"></i> Carica</button>' +
          '<button type="button" id="ghBtnDeleteConfig" style="background:#D32F2F;color:#fff;border:none;padding:10px 14px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;font-family:\'Titillium Web\',sans-serif;"><i class="fas fa-trash"></i> Elimina</button>' +
        '</div>' +
      '</div>' +
      '<button type="button" id="ghBtnSaveConfig" style="background:#145284;color:#fff;border:none;padding:12px 20px;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;font-family:\'Titillium Web\',sans-serif;width:100%;"><i class="fas fa-save"></i> Salva Configurazione</button>' +
      '<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:6px;"><i class="fas fa-sync-alt" style="font-size:10px;color:#9B9B9B;"></i><span id="ghAutoSaveStatus" style="font-size:11px;color:#9B9B9B;font-family:\'Titillium Web\',sans-serif;">Auto-save attivo</span></div>',
      false
    );

    // === SEZ. 1: IDENTITÀ ===
    formHtml += makeSection('fa-city', 'Identità Comune',
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
        makeInput('ghNomeComune','Nome Comune *',state.nomeComune,'Es: Cammarata') +
        makeInput('ghBaseUrl','Base URL *',state.baseUrl,'https://nomecomune.comune.digital') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
        makeInput('ghPageTitle','Titolo Pagina (opzionale)',state.pageTitle,'') +
        makeInput('ghStemmaUrl','URL Stemma',state.stemmaUrl,'docs/stemma.webp') +
      '</div>' +
      '<p style="font-size:12px;color:#9B9B9B;margin:0;">Lo stemma verrà visualizzato nell\'header. Se vuoto, non appare.</p>',
      true
    );

    // === SEZ. 2: GESTIONE WIDGET ===
    formHtml += makeSection('fa-puzzle-piece', 'Gestione Widget',
      '<div id="ghWidgetList" style="max-height:400px;overflow-y:auto;"></div>',
      false
    );

    // === SEZ. 2b: WIDGET CUSTOM (iframe isolato) ===
    formHtml += makeSection('fa-code', 'Widget Custom (HTML)',
      '<p style="font-size:12px;color:#9B9B9B;margin:0 0 12px;">Inserisci un blocco HTML completo (video, slideshow, ecc.). Verrà isolato in un iframe: nessun conflitto CSS/JS con la homepage. Attivalo/disattivalo dalla Gestione Widget.</p>' +
      makeInput('ghCustomWidgetLabel', 'Etichetta widget', state.customWidget.label, 'Video promozionale') +
      makeInput('ghCustomWidgetHeight', 'Altezza (px)', state.customWidget.height, '300', 'number') +
      '<div style="margin-bottom:16px;">' +
        '<label style="display:block;font-weight:600;color:#4A4A4A;margin-bottom:6px;font-size:13px;">Codice HTML completo</label>' +
        '<textarea id="ghCustomWidgetCode" rows="12" placeholder="<!DOCTYPE html>&#10;<html>&#10;<head>...</head>&#10;<body>...</body>&#10;</html>" style="width:100%;padding:10px 14px;border:1px solid #d0d0d0;border-radius:8px;font-family:monospace;font-size:13px;box-sizing:border-box;resize:vertical;line-height:1.4;tab-size:2;">' + esc(state.customWidget.htmlCode) + '</textarea>' +
      '</div>' +
      '<div style="background:#D1E2F2;border-radius:8px;padding:12px 16px;font-size:12px;color:#0D3A5C;">' +
        '<i class="fas fa-info-circle"></i> <strong>Come funziona:</strong> Il codice viene incapsulato in un <code>&lt;iframe srcdoc&gt;</code>. ' +
        'CSS e JavaScript del widget non possono interferire con la homepage e viceversa. ' +
        'Se disattivi il widget dalla Gestione Widget, il codice generato resta identico a prima.' +
      '</div>',
      false
    );

    // === SEZ. 3: GEOLOCALIZZAZIONE ===
    formHtml += makeSection('fa-map-marker-alt', 'Geolocalizzazione',
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
        makeInput('ghLat','Latitudine',state.lat,'37.6279','number') +
        makeInput('ghLon','Longitudine',state.lon,'13.7049','number') +
      '</div>' +
      '<p style="font-size:12px;color:#9B9B9B;margin:0;">Usate per il widget meteo. Cerca su Google Maps → click destro → Copia coordinate.</p>',
      false
    );

    // === SEZ. 4: PALETTE COLORI ===
    // Build preset palette cards
    let presetHtml = '<div style="margin-bottom:20px;">' +
      '<label style="display:block;font-weight:700;color:#145284;margin-bottom:10px;font-size:14px;"><i class="fas fa-swatchbook"></i> Palette Preimpostate</label>' +
      '<div id="ghPresetGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;">';
    COLOR_PRESETS.forEach(function(pr, idx) {
      const isActive = (state.colorePrimario.toLowerCase() === pr.primary.toLowerCase() && state.coloreSecondario.toLowerCase() === pr.secondary.toLowerCase());
      presetHtml += '<div class="ghPresetCard" data-preset-idx="'+idx+'" style="border:2px solid '+(isActive ? pr.primary : '#e0e0e0')+';border-radius:12px;padding:12px 10px;cursor:pointer;text-align:center;transition:all .2s;background:'+(isActive ? pr.primary+'12' : '#fff')+';position:relative;">' +
        (isActive ? '<div style="position:absolute;top:6px;right:6px;background:'+pr.primary+';color:#fff;width:20px;height:20px;border-radius:50%;font-size:10px;display:flex;align-items:center;justify-content:center;"><i class="fas fa-check"></i></div>' : '') +
        '<div style="display:flex;justify-content:center;gap:6px;margin-bottom:8px;">' +
          '<div style="width:32px;height:32px;border-radius:8px;background:'+esc(pr.primary)+';border:1px solid rgba(0,0,0,.1);"></div>' +
          '<div style="width:32px;height:32px;border-radius:8px;background:'+esc(pr.secondary)+';border:1px solid rgba(0,0,0,.1);"></div>' +
        '</div>' +
        '<div style="font-weight:700;font-size:12px;color:#1E1E1E;line-height:1.2;">'+esc(pr.name)+'</div>' +
        '<div style="font-size:10px;color:#9B9B9B;margin-top:2px;"><i class="fas '+esc(pr.icon)+'"></i> '+esc(pr.desc)+'</div>' +
      '</div>';
    });
    presetHtml += '</div></div>';

    // Separator + Custom section
    presetHtml += '<div style="display:flex;align-items:center;gap:12px;margin:16px 0;">' +
      '<div style="flex:1;height:1px;background:#D9D9D9;"></div>' +
      '<span style="font-size:12px;font-weight:600;color:#9B9B9B;">oppure scegli manualmente</span>' +
      '<div style="flex:1;height:1px;background:#D9D9D9;"></div>' +
    '</div>';

    presetHtml += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:16px;">' +
      '<div><label style="display:block;font-weight:600;color:#4A4A4A;margin-bottom:6px;font-size:13px;">Colore Principale</label>' +
        '<div style="display:flex;align-items:center;gap:12px;">' +
          '<input type="color" id="ghColorePrimario" value="'+esc(state.colorePrimario)+'" style="width:60px;height:40px;border:none;cursor:pointer;border-radius:8px;">' +
          '<input type="text" id="ghColorePrimarioHex" value="'+esc(state.colorePrimario)+'" maxlength="7" style="width:90px;padding:8px 10px;border:1px solid #d0d0d0;border-radius:8px;font-weight:700;font-size:14px;color:#4A4A4A;font-family:\'Titillium Web\',sans-serif;text-transform:uppercase;">' +
        '</div></div>' +
      '<div><label style="display:block;font-weight:600;color:#4A4A4A;margin-bottom:6px;font-size:13px;">Colore Secondario</label>' +
        '<div style="display:flex;align-items:center;gap:12px;">' +
          '<input type="color" id="ghColoreSecondario" value="'+esc(state.coloreSecondario)+'" style="width:60px;height:40px;border:none;cursor:pointer;border-radius:8px;">' +
          '<input type="text" id="ghColoreSecondarioHex" value="'+esc(state.coloreSecondario)+'" maxlength="7" style="width:90px;padding:8px 10px;border:1px solid #d0d0d0;border-radius:8px;font-weight:700;font-size:14px;color:#4A4A4A;font-family:\'Titillium Web\',sans-serif;text-transform:uppercase;">' +
        '</div></div>' +
    '</div>';

    formHtml += makeSection('fa-palette', 'Palette Colori',
      presetHtml +
      '<div id="ghPalettePreview" style="display:flex;gap:8px;flex-wrap:wrap;"></div>',
      false
    );

    // === SEZ. 5: TICKER NEWS ===
    formHtml += makeSection('fa-newspaper', 'Ticker News',
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
        makeInput('ghTickerRssId','ID Widget RSS.app',state.tickerRssId,'hJedxhkIBuP2z3VP') +
        makeInput('ghTickerLinkUrl','Link Pagina Notizie',state.tickerLinkUrl,'social') +
      '</div>',
      false
    );

    // === SEZ. 6: SLIDESHOW ===
    formHtml += makeSection('fa-images', 'Slideshow (1-8 slide)',
      '<div id="ghSlidesContainer"></div>' +
      '<button type="button" id="ghBtnAddSlide" style="background:#E2F8DE;color:#2A752F;border:2px dashed #3CA434;padding:10px 20px;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;width:100%;margin-top:8px;font-family:\'Titillium Web\',sans-serif;">' +
      '<i class="fas fa-plus"></i> Aggiungi Slide</button>',
      false
    );

    // === SEZ. 7: SERVIZI ===
    formHtml += makeSection('fa-th-large', 'Servizi (Icone)',
      '<div id="ghServiziContainer"></div>' +
      '<button type="button" id="ghBtnAddSezione" style="background:#D1E2F2;color:#145284;border:2px dashed #145284;padding:10px 20px;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;width:100%;margin-top:8px;font-family:\'Titillium Web\',sans-serif;">' +
      '<i class="fas fa-plus"></i> Aggiungi Sezione Servizi</button>',
      false
    );

    // === SEZ. 8: BANNER PERSONALIZZABILI (replicabili) ===
    formHtml += makeSection('fa-bullhorn', 'Banner Personalizzabili',
      '<p style="font-size:12px;color:#9B9B9B;margin-bottom:12px;"><i class="fas fa-info-circle"></i> Puoi aggiungere più banner carousel, ognuno con le sue card. Appariranno nella Gestione Widget per posizionarli dove vuoi. Ogni banner può avere da 1 a 4 card (anche solo immagini senza testo).</p>' +
      '<div id="ghBannerGroupsContainer"></div>' +
      '<button type="button" id="ghBtnAddBannerGroup" style="background:#145284;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;font-family:\'Titillium Web\',sans-serif;margin-top:8px;"><i class="fas fa-plus"></i> Aggiungi Banner</button>',
      false
    );

    // === SEZ. 9: BANNER CIE ===
    formHtml += makeSection('fa-id-card', 'Banner CIE',
      makeCheckbox('ghBannerCieEnabled','Abilita Banner CIE',state.bannerCieEnabled) +
      '<div id="ghBannerCieFields">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
        makeInput('ghBannerCieTitle','Titolo IT',state.bannerCieTitle,'') +
        makeInput('ghBannerCieTitleEn','Titolo EN',state.bannerCieTitleEn,'') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
        makeInput('ghBannerCieSubtitle','Sottotitolo IT',state.bannerCieSubtitle,'') +
        makeInput('ghBannerCieSubtitleEn','Sottotitolo EN',state.bannerCieSubtitleEn,'') +
      '</div>' +
        makeInput('ghBannerCieHref','Link / URL Immagine',state.bannerCieHref,'') +
      '</div>',
      false
    );

    // === SEZ. 10: RACCOLTA DIFFERENZIATA ===
    formHtml += makeSection('fa-recycle', 'Raccolta Differenziata',
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
        makeInput('ghRaccoltaFeedUrl','Feed RSS URL',state.raccoltaFeedUrl,'syndication/notifiche-differenziata/') +
        makeInput('ghRaccoltaInfoUrl','Pagina Info URL',state.raccoltaInfoUrl,'raccolta-differenziata') +
      '</div>' +
      '<div style="margin-bottom:16px;"><label style="display:block;font-weight:600;color:#4A4A4A;margin-bottom:6px;font-size:13px;">Eco-consigli (uno per riga)</label>' +
      '<textarea id="ghRaccoltaEcoTips" rows="6" style="width:100%;padding:10px 14px;border:1px solid #d0d0d0;border-radius:8px;font-family:\'Titillium Web\',sans-serif;font-size:14px;box-sizing:border-box;resize:vertical;">'+esc(state.raccoltaEcoTips.join('\n'))+'</textarea></div>',
      false
    );

    // === SEZ. 11: PROTEZIONE CIVILE ===
    formHtml += makeSection('fa-shield-halved', 'Protezione Civile',
      makeCheckbox('ghProtCivileEnabled','Abilita Protezione Civile',state.protCivileEnabled) +
      '<div id="ghProtCivileFields">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
        makeInput('ghProtCivileApiKey','API Key',state.protCivileApiKey,'') +
        makeInput('ghProtCivileRegione','Codice Regione',state.protCivileRegione,'Sici-E') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
        makeInput('ghProtCivileComune','Nome Comune (DPC)',state.protCivileComune,'') +
        makeInput('ghProtCivileUrlRegione','URL Regione',state.protCivileUrlRegione,'https://www.protezionecivilesicilia.it') +
      '</div></div>',
      false
    );

    // === SEZ. 12: METEO ===
    formHtml += makeSection('fa-cloud-sun', 'Meteo',
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">' +
        makeInput('ghMeteoWeeklyUrl','URL Previsioni',state.meteoWeeklyUrl,'meteo') +
        makeInput('ghMeteoInterval','Intervallo Agg. (min)',String(state.meteoInterval),'15','number') +
        makeInput('ghMeteoTimeout','Timeout (ms)',String(state.meteoTimeout),'10000','number') +
      '</div>',
      false
    );

    // === SEZ. 14: SLIDER RSS (replicabili) ===
    formHtml += makeSection('fa-rss', 'Slider RSS (Eventi, Mostre, ...)',
      '<p style="font-size:12px;color:#9B9B9B;margin-bottom:12px;"><i class="fas fa-info-circle"></i> Puoi aggiungere più slider RSS, ognuno con il suo feed. Appariranno nella Gestione Widget per posizionarli dove vuoi.</p>' +
      '<div id="ghRssSlidersContainer"></div>' +
      '<button type="button" id="ghBtnAddRssSlider" style="background:#145284;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;font-family:\'Titillium Web\',sans-serif;margin-top:8px;"><i class="fas fa-plus"></i> Aggiungi Slider RSS</button>',
      false
    );

    // === SEZ. 15: FOOTER ===
    formHtml += makeSection('fa-link', 'Footer',
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
        makeInput('ghFooterTerminiUrl','URL Termini',state.footerTerminiUrl,'https://nomecomune.comune.digital/termini-e-condizioni-del-servizio') +
        makeInput('ghFooterTerminiLabel','Label Termini',state.footerTerminiLabel,'') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
        makeInput('ghFooterPrivacyUrl','URL Privacy',state.footerPrivacyUrl,'https://nomecomune.comune.digital/privacy-policy') +
        makeInput('ghFooterPrivacyLabel','Label Privacy',state.footerPrivacyLabel,'') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
        makeInput('ghFooterCopyrightText','Testo Copyright',state.footerCopyrightText,'Comune.Digital') +
        makeInput('ghFooterCopyrightUrl','URL Copyright',state.footerCopyrightUrl,'https://app.comune.digital') +
      '</div>',
      false
    );

    // === SEZ. 14: ACCESSIBILITÀ ===
    formHtml += makeSection('fa-universal-access', 'Accessibilità',
      makeCheckbox('ghA11yDarkMode','Abilita Dark Mode',state.a11yDarkMode) +
      makeCheckbox('ghA11yContrasto','Abilita Alto Contrasto',state.a11yContrasto) +
      makeCheckbox('ghA11yFontScale','Abilita Scala Caratteri',state.a11yFontScale) +
      makeInput('ghA11yMaxFontScale','Scala Massima (1-4)',String(state.a11yMaxFontScale),'4','number') +
      makeCheckbox('ghA11yRispettaSistema','Rispetta Impostazioni Sistema',state.a11yRispettaSistema),
      false
    );

    // === SEZ. 15: SPOTLIGHT ===
    formHtml += makeSection('fa-lightbulb', 'Spotlight',
      '<div style="margin-bottom:16px;"><label style="display:block;font-weight:600;color:#4A4A4A;margin-bottom:6px;font-size:13px;">Widget da Evidenziare</label>' +
      '<select id="ghSpotlightWidgetId" style="width:100%;padding:10px 14px;border:1px solid #d0d0d0;border-radius:8px;font-family:\'Titillium Web\',sans-serif;font-size:14px;">' +
        '<option value="">-- Nessuno (disattivato) --</option>' +
        '<option value="dateHeader">Barra Data</option><option value="tickerBar">Ticker News</option>' +
        '<option value="slideshowContainer">Slideshow</option><option value="servicesContainer">Servizi</option>' +
        '<option value="bannerCustom">Banner Personalizzabile</option><option value="bannerCIE">Banner CIE</option>' +
        '<option value="raccoltaDifferenziata">Raccolta Differenziata</option>' +
        '<option value="protezioneCivile">Protezione Civile</option><option value="meteoCard">Meteo</option>' +
      '</select></div>' +
      makeInput('ghSpotlightDurata','Durata (ms)',String(state.spotlightDurata),'2500','number') +
      makeCheckbox('ghSpotlightForzaSempre','Forza Sempre (per test)',state.spotlightForzaSempre),
      false
    );

    // === SEZ. 17: TAB BAR ===
    formHtml += makeSection('fa-ellipsis', 'Tab Bar (Navigazione)',
      '<p style="font-size:12px;color:#9B9B9B;margin:0 0 12px;"><i class="fas fa-info-circle"></i> Barra di navigazione flottante in basso con 5 pulsanti. Attiva/disattiva dalla <strong>Gestione Widget</strong>. Il pulsante centrale sarà più grande e in evidenza.</p>' +
      '<div id="ghTabBarItemsContainer"></div>',
      false
    );

    // === BOTTONI ===
    formHtml += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin:24px 0 16px;">' +
      '<button type="button" id="ghBtnGenera" style="background:#145284;color:#fff;border:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px;cursor:pointer;font-family:\'Titillium Web\',sans-serif;box-shadow:0 4px 12px rgba(20,82,132,.3);"><i class="fas fa-download"></i> Genera HTML</button>' +
      '<button type="button" id="ghBtnPreview" style="background:#3CA434;color:#fff;border:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px;cursor:pointer;font-family:\'Titillium Web\',sans-serif;box-shadow:0 4px 12px rgba(60,164,52,.3);"><i class="fas fa-eye"></i> Apri Anteprima Live</button>' +
      '<span id="ghPreviewStatus" style="display:flex;align-items:center;font-size:12px;color:#9B9B9B;gap:6px;"></span>' +
    '</div>';
    formHtml += '<p style="font-size:12px;color:#9B9B9B;margin:0 0 30px;"><i class="fas fa-info-circle"></i> Clicca "Apri Anteprima Live" per vedere la homepage in una finestra laterale. Si aggiornerà automaticamente ad ogni modifica.</p>';

    formHtml += '</div>'; // close form column
    formHtml += '</div>'; // close main layout

    el.innerHTML = formHtml;

    // === ATTACH EVENTS ===
    attachEvents();
    refreshSlides();
    refreshServizi();
    syncBannerCustomWidgets();
    refreshBannerGroups();
    ensureWidgetExists('tabBar', 'Tab Bar', false);
    syncRssSliderWidgets();
    refreshRssSliders();
    refreshTabBarItems();
    refreshWidgetList();
    updatePalettePreview();
    if (!isFirebaseAvailable()) showFirebaseWarning();
    else loadConfigList();
  }

  /* ============================================================
     EVENT HANDLERS
     ============================================================ */
  function attachEvents() {
    // Section toggle
    document.querySelectorAll('.ghSectionHeader').forEach(h => {
      h.addEventListener('click', () => {
        const body = h.nextElementSibling;
        const chevron = h.querySelector('.fa-chevron-down');
        if (body) {
          const open = body.style.display !== 'none';
          body.style.display = open ? 'none' : 'block';
          if (chevron) chevron.style.transform = open ? '' : 'rotate(180deg)';
        }
      });
    });

    // Color pickers + hex text inputs (bidirezionali)
    const cp = document.getElementById('ghColorePrimario');
    const cs = document.getElementById('ghColoreSecondario');
    const cpHex = document.getElementById('ghColorePrimarioHex');
    const csHex = document.getElementById('ghColoreSecondarioHex');

    if (cp) cp.addEventListener('input', e => {
      state.colorePrimario = e.target.value;
      if (cpHex) cpHex.value = e.target.value;
      updatePalettePreview();
      updatePresetHighlight();
    });
    if (cs) cs.addEventListener('input', e => {
      state.coloreSecondario = e.target.value;
      if (csHex) csHex.value = e.target.value;
      updatePalettePreview();
      updatePresetHighlight();
    });

    // Hex input → aggiorna color picker
    if (cpHex) cpHex.addEventListener('input', e => {
      let val = e.target.value.trim();
      if (val.length >= 4 && /^#[0-9a-fA-F]{3,6}$/.test(val)) {
        if (val.length === 4) val = '#' + val[1]+val[1] + val[2]+val[2] + val[3]+val[3];
        state.colorePrimario = val;
        if (cp) cp.value = val;
        updatePalettePreview();
        updatePresetHighlight();
      }
    });
    if (csHex) csHex.addEventListener('input', e => {
      let val = e.target.value.trim();
      if (val.length >= 4 && /^#[0-9a-fA-F]{3,6}$/.test(val)) {
        if (val.length === 4) val = '#' + val[1]+val[1] + val[2]+val[2] + val[3]+val[3];
        state.coloreSecondario = val;
        if (cs) cs.value = val;
        updatePalettePreview();
        updatePresetHighlight();
      }
    });

    // Preset palette cards click
    document.querySelectorAll('.ghPresetCard').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.getAttribute('data-preset-idx'));
        const preset = COLOR_PRESETS[idx];
        if (!preset) return;
        state.colorePrimario = preset.primary;
        state.coloreSecondario = preset.secondary;
        // Reset override manuali quando si sceglie un preset
        state.palettePrimarioOverride = { '900': '', '500': '', '300': '', '100': '' };
        state.paletteSecondarioOverride = { '900': '', '500': '', '300': '', '100': '' };
        if (cp) cp.value = preset.primary;
        if (cs) cs.value = preset.secondary;
        if (cpHex) cpHex.value = preset.primary;
        if (csHex) csHex.value = preset.secondary;
        updatePalettePreview();
        updatePresetHighlight();
      });
    });

    // Add banner group
    const btnAddBannerGroup = document.getElementById('ghBtnAddBannerGroup');
    if (btnAddBannerGroup) btnAddBannerGroup.addEventListener('click', () => {
      collectBannerGroupsFromDOM();
      state.bannerGroups.push({
        items: [{ icon: 'fa-bullhorn', kicker: '', titleIt: '', titleEn: '', href: '', ctaLabel: 'Apri', ctaIcon: 'fa-arrow-right', bgImage: '' }]
      });
      syncBannerCustomWidgets();
      refreshBannerGroups();
      refreshWidgetList();
    });

    // Add slide
    const btnAdd = document.getElementById('ghBtnAddSlide');
    if (btnAdd) btnAdd.addEventListener('click', () => {
      if (state.slides.length < 8) {
        state.slides.push({ titleIt: '', titleEn: '', href: '', bg: '' });
        refreshSlides();
      }
    });

    // Add sezione servizi
    const btnSez = document.getElementById('ghBtnAddSezione');
    if (btnSez) btnSez.addEventListener('click', () => {
      state.servizi.push({ sectionIt: '', sectionEn: '', items: [{ icon: 'fa-gears', labelIt: '', labelEn: '', href: '' }] });
      refreshServizi();
    });

    // CIE toggle
    const cieCheck = document.getElementById('ghBannerCieEnabled');
    if (cieCheck) cieCheck.addEventListener('change', e => {
      const fields = document.getElementById('ghBannerCieFields');
      if (fields) fields.style.opacity = e.target.checked ? '1' : '0.4';
    });

    // Prot Civile toggle
    const pcCheck = document.getElementById('ghProtCivileEnabled');
    if (pcCheck) pcCheck.addEventListener('change', e => {
      const fields = document.getElementById('ghProtCivileFields');
      if (fields) fields.style.opacity = e.target.checked ? '1' : '0.4';
    });

    // Add RSS Slider
    const btnAddRss = document.getElementById('ghBtnAddRssSlider');
    if (btnAddRss) btnAddRss.addEventListener('click', () => {
      collectRssSlidersFromDOM();
      state.rssSliders.push({
        icon: 'fa-calendar-days', titleIt: '', titleEn: '', feedUrl: '', targetUrl: '', domainBase: '',
        newLabelIt: 'NUOVO', newLabelEn: 'NEW'
      });
      syncRssSliderWidgets();
      refreshRssSliders();
      refreshWidgetList();
    });

    // Init RSS sliders form
    refreshRssSliders();

    // Genera
    document.getElementById('ghBtnGenera')?.addEventListener('click', () => {
      collectState();
      if (!state.nomeComune) { alert('Inserisci il nome del comune!'); return; }
      if (!state.baseUrl) { alert('Inserisci il Base URL!'); return; }
      const html = generateHTML();
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = state.nomeComune.toLowerCase().replace(/\s+/g, '-') + '-home.html';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    // === LIVE PREVIEW SYSTEM (popup window con Blob URL) ===
    let previewWin = null;
    let previewTimer = null;
    let lastBlobUrl = null;
    const previewStatus = document.getElementById('ghPreviewStatus');

    function isPreviewOpen() {
      return previewWin && !previewWin.closed;
    }

    function updatePreviewStatus(msg) {
      if (previewStatus) previewStatus.textContent = msg;
    }

    function buildPreviewBlobUrl() {
      collectState();
      if (!state.nomeComune || !state.baseUrl) return null;
      const html = generateHTML();
      if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
      lastBlobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      return lastBlobUrl;
    }

    function refreshPreviewContent() {
      if (!isPreviewOpen()) {
        updatePreviewStatus('Finestra chiusa. Clicca "Apri Anteprima Live" per riaprire.');
        return;
      }
      try {
        collectState();
        if (!state.nomeComune || !state.baseUrl) {
          updatePreviewStatus('Inserisci nome comune e URL base');
          return;
        }
        updatePreviewStatus('Aggiornando...');
        const url = buildPreviewBlobUrl();
        if (!url) return;
        previewWin.location.href = url;
        updatePreviewStatus('Aggiornato ' + new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      } catch (e) {
        updatePreviewStatus('Errore: ' + e.message);
      }
    }

    function schedulePreview() {
      if (!isPreviewOpen()) return;
      clearTimeout(previewTimer);
      previewTimer = setTimeout(refreshPreviewContent, 1200);
    }

    // Bottone "Apri Anteprima Live" — deve partire da click utente per evitare popup blocker
    document.getElementById('ghBtnPreview')?.addEventListener('click', () => {
      collectState();
      if (!state.nomeComune) { alert('Inserisci il nome del comune!'); return; }

      // Se la finestra è già aperta, la porta in primo piano e aggiorna
      if (isPreviewOpen()) {
        previewWin.focus();
        refreshPreviewContent();
        return;
      }

      // Genera Blob URL
      const url = buildPreviewBlobUrl();
      if (!url) { alert('Inserisci nome comune e URL base prima di aprire l\'anteprima.'); return; }

      // Apri finestra popup con Blob URL
      const sw = window.screen.availWidth;
      const sh = window.screen.availHeight;
      const pw = 420;
      const ph = Math.min(780, sh - 40);
      const left = sw - pw - 20;
      const top = 20;
      previewWin = window.open(url, 'ghPreviewPopup',
        'width=' + pw + ',height=' + ph + ',left=' + left + ',top=' + top +
        ',resizable=yes,scrollbars=yes,menubar=no,toolbar=no,location=no,status=no');

      if (!previewWin) {
        alert('Il browser ha bloccato il popup. Abilita i popup per questo sito e riprova.');
        return;
      }

      updatePreviewStatus('Anteprima aperta — si aggiorna automaticamente');

      // Controlla periodicamente se la finestra è stata chiusa dall'utente
      const checkClosed = setInterval(() => {
        if (!isPreviewOpen()) {
          clearInterval(checkClosed);
          updatePreviewStatus('Finestra chiusa. Clicca "Apri Anteprima Live" per riaprire.');
          if (lastBlobUrl) { URL.revokeObjectURL(lastBlobUrl); lastBlobUrl = null; }
        }
      }, 2000);
    });

    // Auto-refresh: intercetta TUTTE le interazioni nel form
    const formCol = document.getElementById('ghFormCol');
    if (formCol) {
      formCol.addEventListener('input', schedulePreview);
      formCol.addEventListener('change', schedulePreview);
      formCol.addEventListener('click', e => {
        if (e.target.closest('button') || e.target.closest('[data-preset-idx]') ||
            e.target.closest('[data-widget-toggle]') || e.target.closest('[data-widget-up]') ||
            e.target.closest('[data-widget-down]') || e.target.tagName === 'INPUT') {
          schedulePreview();
        }
      });
    }

    // Firebase config handlers
    document.getElementById('ghBtnSaveConfig')?.addEventListener('click', saveConfig);
    document.getElementById('ghBtnLoadConfig')?.addEventListener('click', () => {
      const sel = document.getElementById('ghConfigSelect');
      if (sel && sel.value) loadConfig(sel.value);
      else alert('Seleziona una configurazione');
    });
    document.getElementById('ghBtnDeleteConfig')?.addEventListener('click', () => {
      const sel = document.getElementById('ghConfigSelect');
      if (sel && sel.value) deleteConfig(sel.value);
      else alert('Seleziona una configurazione');
    });

    // === AUTO-SAVE (ogni 60 secondi, silenzioso) ===
    let autoSaveTimer = null;
    let autoSaveDirty = false;
    const autoSaveIndicator = document.getElementById('ghAutoSaveStatus');

    function markDirty() { autoSaveDirty = true; }

    async function autoSave() {
      if (!autoSaveDirty) return;
      if (!isFirebaseAvailable()) return;
      collectState();
      if (!state.nomeComune) return; // niente da salvare se non c'è il nome
      try {
        const db = firebase.firestore();
        const docId = state.nomeComune.toLowerCase().replace(/\s+/g, '-');
        const userEmail = AuthService.getUserEmail() || 'unknown';
        await db.collection('generatore-home-configs').doc(docId).set({
          config: state,
          nomeComune: state.nomeComune,
          updatedAt: new Date(),
          createdBy: userEmail
        });
        autoSaveDirty = false;
        if (autoSaveIndicator) {
          autoSaveIndicator.textContent = 'Salvato ' + new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
          autoSaveIndicator.style.color = '#3CA434';
        }
      } catch (err) {
        console.warn('Auto-save failed:', err.message);
        if (autoSaveIndicator) {
          autoSaveIndicator.textContent = 'Auto-save fallito';
          autoSaveIndicator.style.color = '#D32F2F';
        }
      }
    }

    // Intercetta modifiche per segnare "dirty"
    const formArea = document.getElementById('ghFormCol');
    if (formArea) {
      formArea.addEventListener('input', markDirty);
      formArea.addEventListener('change', markDirty);
    }

    // Avvia timer auto-save ogni 60 secondi
    autoSaveTimer = setInterval(autoSave, 60000);

    // Salva anche quando l'utente sta per lasciare la pagina
    window.addEventListener('beforeunload', () => {
      if (autoSaveDirty && isFirebaseAvailable() && state.nomeComune) {
        // Tentativo sincrono best-effort con sendBeacon
        try {
          collectState();
          const docId = state.nomeComune.toLowerCase().replace(/\s+/g, '-');
          // sendBeacon non supporta Firestore, ma facciamo l'autoSave sincrono
          autoSave();
        } catch(e) {}
      }
    });
  }

  /* ============================================================
     DYNAMIC FORM – SLIDES
     ============================================================ */
  function refreshSlides(skipCollect) {
    const c = document.getElementById('ghSlidesContainer');
    if (!c) return;
    if (!skipCollect) collectSlidesFromDOM(); // salva prima di ricostruire
    let html = '';
    state.slides.forEach((s, i) => {
      html += '<div class="gh-slide-card" style="background:#f8f9fa;border:1px solid #e0e0e0;border-radius:10px;padding:16px;margin-bottom:12px;position:relative;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
          '<strong style="color:#145284;font-size:14px;"><i class="fas fa-image"></i> Slide '+(i+1)+'</strong>' +
          (state.slides.length > 1 ? '<button type="button" data-remove-slide="'+i+'" style="background:#D32F2F;color:#fff;border:none;padding:4px 10px;border-radius:6px;font-size:12px;cursor:pointer;font-weight:700;"><i class="fas fa-trash"></i></button>' : '') +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
          '<div><label style="font-size:12px;font-weight:600;color:#4A4A4A;">Titolo IT</label><input type="text" data-slide="'+i+'" data-field="titleIt" value="'+esc(s.titleIt)+'" style="width:100%;padding:8px 10px;border:1px solid #d0d0d0;border-radius:6px;font-size:13px;box-sizing:border-box;font-family:\'Titillium Web\',sans-serif;"></div>' +
          '<div><label style="font-size:12px;font-weight:600;color:#4A4A4A;">Titolo EN</label><input type="text" data-slide="'+i+'" data-field="titleEn" value="'+esc(s.titleEn)+'" style="width:100%;padding:8px 10px;border:1px solid #d0d0d0;border-radius:6px;font-size:13px;box-sizing:border-box;font-family:\'Titillium Web\',sans-serif;"></div>' +
          '<div><label style="font-size:12px;font-weight:600;color:#4A4A4A;">Link (href)</label><input type="text" data-slide="'+i+'" data-field="href" value="'+esc(s.href)+'" style="width:100%;padding:8px 10px;border:1px solid #d0d0d0;border-radius:6px;font-size:13px;box-sizing:border-box;font-family:\'Titillium Web\',sans-serif;"></div>' +
          '<div><label style="font-size:12px;font-weight:600;color:#4A4A4A;">URL Immagine</label><input type="text" data-slide="'+i+'" data-field="bg" value="'+esc(s.bg)+'" placeholder="docs/Slide.jpg" style="width:100%;padding:8px 10px;border:1px solid #d0d0d0;border-radius:6px;font-size:13px;box-sizing:border-box;font-family:\'Titillium Web\',sans-serif;"></div>' +
        '</div></div>';
    });
    c.innerHTML = html;

    // Remove slide buttons
    c.querySelectorAll('[data-remove-slide]').forEach(btn => {
      btn.addEventListener('click', e => {
        const idx = parseInt(e.currentTarget.getAttribute('data-remove-slide'));
        collectSlidesFromDOM();
        state.slides.splice(idx, 1);
        refreshSlides();
      });
    });
  }

  function collectSlidesFromDOM() {
    document.querySelectorAll('[data-slide]').forEach(input => {
      const i = parseInt(input.getAttribute('data-slide'));
      const f = input.getAttribute('data-field');
      if (state.slides[i]) state.slides[i][f] = input.value;
    });
  }

  /* ============================================================
     DYNAMIC FORM – BANNER CUSTOM ITEMS
     ============================================================ */
  const BANNER_ICONS = [
    { v: 'fa-bullhorn', l: 'Annuncio / Comunicazioni' },
    { v: 'fa-bell', l: 'Notifica / Avviso' },
    { v: 'fa-newspaper', l: 'Notizia / Giornale' },
    { v: 'fa-circle-info', l: 'Informazione' },
    { v: 'fa-star', l: 'Speciale / In evidenza' },
    { v: 'fa-fire', l: 'Tendenza / Novità' },
    { v: 'fa-gift', l: 'Promozione / Regalo' },
    { v: 'fa-heart', l: 'Cuore / Preferito' },
    { v: 'fa-calendar-check', l: 'Evento / Appuntamento' },
    { v: 'fa-trophy', l: 'Premio / Concorso' },
    { v: 'fa-ticket', l: 'Biglietto / Ingresso' },
    { v: 'fa-champagne-glasses', l: 'Festa / Celebrazione' },
    { v: 'fa-masks-theater', l: 'Teatro / Spettacolo' },
    { v: 'fa-music', l: 'Musica / Concerto' },
    { v: 'fa-palette', l: 'Arte / Mostra' },
    { v: 'fa-camera', l: 'Fotografia / Immagine' },
    { v: 'fa-film', l: 'Cinema / Video' },
    { v: 'fa-graduation-cap', l: 'Scuola / Formazione' },
    { v: 'fa-children', l: 'Bambini / Famiglie' },
    { v: 'fa-hands-holding-heart', l: 'Solidarietà / Volontariato' },
    { v: 'fa-handshake', l: 'Accordo / Collaborazione' },
    { v: 'fa-flag', l: 'Bandiera / Commemorazione' },
    { v: 'fa-lightbulb', l: 'Idea / Suggerimento' },
    { v: 'fa-shield-halved', l: 'Sicurezza / Protezione' },
    { v: 'fa-tree', l: 'Natura / Ambiente' },
    { v: 'fa-umbrella-beach', l: 'Estate / Spiaggia' },
    { v: 'fa-mountain-sun', l: 'Paesaggio / Montagna' },
    { v: 'fa-utensils', l: 'Gastronomia / Sagra' },
    { v: 'fa-futbol', l: 'Sport / Calcio' },
    { v: 'fa-church', l: 'Festa patronale / Religione' },
    { v: 'fa-earth-europe', l: 'Europa / Internazionale' },
    { v: 'fa-bolt', l: 'Energia / Urgente' },
    { v: 'fa-triangle-exclamation', l: 'Allerta / Attenzione' },
    { v: 'fa-road', l: 'Strade / Viabilità' },
    { v: 'fa-recycle', l: 'Riciclo / Ambiente' },
    { v: 'fa-map-location-dot', l: 'Mappa / Luogo' },
    { v: 'fa-book-open', l: 'Biblioteca / Lettura' },
    { v: 'fa-eye', l: 'Trasparenza / Vedi' },
  ];

  const CTA_ICONS = [
    { v: 'fa-arrow-right', l: 'Freccia destra' },
    { v: 'fa-chevron-right', l: 'Chevron destra' },
    { v: 'fa-eye', l: 'Visualizza' },
    { v: 'fa-paper-plane', l: 'Invia' },
    { v: 'fa-book-open', l: 'Leggi' },
    { v: 'fa-external-link-alt', l: 'Link esterno' },
    { v: 'fa-hand-pointer', l: 'Clicca' },
    { v: 'fa-play', l: 'Riproduci' },
    { v: 'fa-download', l: 'Scarica' },
    { v: 'fa-phone', l: 'Chiama' },
    { v: 'fa-circle-info', l: 'Info' },
    { v: 'fa-plus', l: 'Aggiungi / Scopri' },
  ];

  const RSS_SLIDER_ICONS = [
    { v: 'fa-calendar-days', l: 'Calendario / Eventi' },
    { v: 'fa-newspaper', l: 'Notizie / Giornale' },
    { v: 'fa-palette', l: 'Arte / Mostre' },
    { v: 'fa-masks-theater', l: 'Teatro / Spettacoli' },
    { v: 'fa-music', l: 'Musica / Concerti' },
    { v: 'fa-film', l: 'Cinema / Video' },
    { v: 'fa-camera', l: 'Fotografia' },
    { v: 'fa-mountain-sun', l: 'Escursioni / Natura' },
    { v: 'fa-utensils', l: 'Gastronomia / Sagre' },
    { v: 'fa-futbol', l: 'Sport' },
    { v: 'fa-church', l: 'Feste patronali' },
    { v: 'fa-landmark', l: 'Cultura / Monumenti' },
    { v: 'fa-book-open', l: 'Biblioteca / Lettura' },
    { v: 'fa-graduation-cap', l: 'Formazione / Scuola' },
    { v: 'fa-star', l: 'In evidenza' },
    { v: 'fa-heart', l: 'Preferiti' },
    { v: 'fa-trophy', l: 'Premi / Concorsi' },
    { v: 'fa-bullhorn', l: 'Comunicazioni' },
    { v: 'fa-ticket', l: 'Biglietti / Ingressi' },
    { v: 'fa-champagne-glasses', l: 'Feste / Celebrazioni' },
    { v: 'fa-gift', l: 'Promozioni' },
    { v: 'fa-fire', l: 'Tendenze / Novità' },
    { v: 'fa-tree', l: 'Natura / Ambiente' },
    { v: 'fa-umbrella-beach', l: 'Estate / Mare' },
    { v: 'fa-person-hiking', l: 'Escursioni / Trekking' },
    { v: 'fa-children', l: 'Bambini / Famiglie' },
  ];

  /* ============================================================
     DYNAMIC FORM – RSS SLIDERS
     ============================================================ */
  function refreshRssSliders(skipCollect) {
    const c = document.getElementById('ghRssSlidersContainer');
    if (!c) return;
    if (!skipCollect) collectRssSlidersFromDOM();
    let html = '';
    state.rssSliders.forEach((slider, i) => {
      let iconOpts = '';
      RSS_SLIDER_ICONS.forEach(ic => {
        iconOpts += '<option value="'+ic.v+'"'+(slider.icon === ic.v ? ' selected' : '')+'>'+ic.l+'</option>';
      });
      html += '<div class="gh-rss-card" style="background:#f8f9fa;border:1px solid #e0e0e0;border-radius:10px;padding:16px;margin-bottom:12px;position:relative;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
          '<span style="font-weight:700;color:#145284;font-size:14px;"><i class="fas fa-rss"></i> Slider #'+(i+1)+' — '+(slider.titleIt || 'Nuovo slider')+'</span>' +
          (state.rssSliders.length > 1 ? '<button type="button" data-rss-remove="'+i+'" style="background:#D32F2F;color:#fff;border:none;padding:4px 12px;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600;"><i class="fas fa-trash"></i></button>' : '') +
        '</div>' +
        // Riga 1: Icona + Titolo IT + Titolo EN
        '<div style="display:grid;grid-template-columns:auto 1fr 1fr;gap:12px;margin-bottom:8px;">' +
          '<div><label style="font-size:12px;font-weight:600;color:#4A4A4A;">Icona</label>' +
            '<select data-rss="'+i+'" data-rfield="icon" style="width:100%;padding:8px 10px;border:1px solid #d0d0d0;border-radius:6px;font-size:12px;font-family:\'Titillium Web\',sans-serif;">'+iconOpts+'</select></div>' +
          '<div><label style="font-size:12px;font-weight:600;color:#4A4A4A;">Titolo (IT)</label>' +
            '<input type="text" data-rss="'+i+'" data-rfield="titleIt" value="'+esc(slider.titleIt)+'" placeholder="Es: Mostre e Musei" style="width:100%;padding:8px 10px;border:1px solid #d0d0d0;border-radius:6px;font-size:13px;box-sizing:border-box;font-family:\'Titillium Web\',sans-serif;"></div>' +
          '<div><label style="font-size:12px;font-weight:600;color:#4A4A4A;">Titolo (EN)</label>' +
            '<input type="text" data-rss="'+i+'" data-rfield="titleEn" value="'+esc(slider.titleEn)+'" placeholder="Es: Exhibitions" style="width:100%;padding:8px 10px;border:1px solid #d0d0d0;border-radius:6px;font-size:13px;box-sizing:border-box;font-family:\'Titillium Web\',sans-serif;"></div>' +
        '</div>' +
        // Riga 2: Feed RSS URL
        '<div style="margin-bottom:8px;">' +
          '<label style="font-size:12px;font-weight:600;color:#4A4A4A;">URL Feed RSS</label>' +
          '<input type="text" data-rss="'+i+'" data-rfield="feedUrl" value="'+esc(slider.feedUrl)+'" placeholder="https://comune.digital/syndication/mostre/" style="width:100%;padding:8px 10px;border:1px solid #d0d0d0;border-radius:6px;font-size:13px;box-sizing:border-box;font-family:\'Titillium Web\',sans-serif;">' +
        '</div>' +
        // Riga 3: Target URL + Dominio base
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px;">' +
          '<div><label style="font-size:12px;font-weight:600;color:#4A4A4A;">URL pagina "Vedi tutti"</label>' +
            '<input type="text" data-rss="'+i+'" data-rfield="targetUrl" value="'+esc(slider.targetUrl)+'" placeholder="https://comune.digital/mostre/c/0" style="width:100%;padding:8px 10px;border:1px solid #d0d0d0;border-radius:6px;font-size:13px;box-sizing:border-box;font-family:\'Titillium Web\',sans-serif;"></div>' +
          '<div><label style="font-size:12px;font-weight:600;color:#4A4A4A;">Dominio base (per immagini)</label>' +
            '<input type="text" data-rss="'+i+'" data-rfield="domainBase" value="'+esc(slider.domainBase)+'" placeholder="https://comune.digital" style="width:100%;padding:8px 10px;border:1px solid #d0d0d0;border-radius:6px;font-size:13px;box-sizing:border-box;font-family:\'Titillium Web\',sans-serif;"></div>' +
        '</div>' +
        // Riga 4: Label tag NUOVO
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
          '<div><label style="font-size:12px;font-weight:600;color:#4A4A4A;">Etichetta "nuovo" (IT)</label>' +
            '<input type="text" data-rss="'+i+'" data-rfield="newLabelIt" value="'+esc(slider.newLabelIt || 'NUOVO')+'" placeholder="NUOVO" style="width:100%;padding:8px 10px;border:1px solid #d0d0d0;border-radius:6px;font-size:13px;box-sizing:border-box;font-family:\'Titillium Web\',sans-serif;"></div>' +
          '<div><label style="font-size:12px;font-weight:600;color:#4A4A4A;">Etichetta "nuovo" (EN)</label>' +
            '<input type="text" data-rss="'+i+'" data-rfield="newLabelEn" value="'+esc(slider.newLabelEn || 'NEW')+'" placeholder="NEW" style="width:100%;padding:8px 10px;border:1px solid #d0d0d0;border-radius:6px;font-size:13px;box-sizing:border-box;font-family:\'Titillium Web\',sans-serif;"></div>' +
        '</div>' +
      '</div>';
    });
    c.innerHTML = html;

    // Remove buttons
    c.querySelectorAll('[data-rss-remove]').forEach(btn => {
      btn.addEventListener('click', e => {
        const idx = parseInt(e.currentTarget.getAttribute('data-rss-remove'));
        collectRssSlidersFromDOM();
        const removedId = 'rssSlider_' + idx;
        // Remove from widgets
        state.widgets = state.widgets.filter(w => w.id !== removedId);
        // Renumber remaining rssSlider widgets
        state.rssSliders.splice(idx, 1);
        syncRssSliderWidgets();
        refreshRssSliders();
        refreshWidgetList();
      });
    });
  }

  function collectRssSlidersFromDOM() {
    document.querySelectorAll('[data-rss]').forEach(el => {
      const i = parseInt(el.getAttribute('data-rss'));
      const f = el.getAttribute('data-rfield');
      if (state.rssSliders[i]) state.rssSliders[i][f] = el.value;
    });
  }

  function ensureWidgetExists(id, label, enabled) {
    if (!state.widgets.find(w => w.id === id)) {
      const maxOrder = state.widgets.reduce((m, w) => Math.max(m, w.order), -1);
      state.widgets.push({ id: id, label: label, enabled: !!enabled, order: maxOrder + 1 });
    }
  }

  function syncRssSliderWidgets() {
    // Remove all rssSlider_* widgets
    state.widgets = state.widgets.filter(w => !w.id.startsWith('rssSlider_'));
    // Re-add with correct indices
    const maxOrder = state.widgets.reduce((m, w) => Math.max(m, w.order), -1);
    state.rssSliders.forEach((slider, i) => {
      state.widgets.push({
        id: 'rssSlider_' + i,
        label: 'RSS: ' + (slider.titleIt || 'Slider ' + (i + 1)),
        enabled: true,
        order: maxOrder + 1 + i
      });
    });
  }

  function syncBannerCustomWidgets() {
    state.widgets = state.widgets.filter(w => !w.id.startsWith('bannerCustom_'));
    const maxOrder = state.widgets.reduce((m, w) => Math.max(m, w.order), -1);
    state.bannerGroups.forEach((group, i) => {
      state.widgets.push({
        id: 'bannerCustom_' + i,
        label: 'Banner: ' + (group.items[0]?.kicker || group.items[0]?.titleIt || 'Banner ' + (i + 1)),
        enabled: true,
        order: maxOrder + 1 + i
      });
    });
  }

  function refreshBannerGroups(skipCollect) {
    const c = document.getElementById('ghBannerGroupsContainer');
    if (!c) return;
    if (!skipCollect) collectBannerGroupsFromDOM();
    let html = '';
    state.bannerGroups.forEach((group, gi) => {
      html += '<div class="gh-banner-group" data-bgrp="'+gi+'" style="background:#f0f4f8;border:1px solid #d0d8e0;border-radius:10px;padding:16px;margin-bottom:16px;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
        '<strong style="color:#145284;font-size:14px;"><i class="fas fa-columns"></i> Banner '+(gi+1)+'</strong>' +
        (state.bannerGroups.length > 1 ? '<button type="button" data-remove-bgrp="'+gi+'" style="background:#D32F2F;color:#fff;border:none;padding:4px 10px;border-radius:6px;font-size:12px;cursor:pointer;font-weight:700;"><i class="fas fa-trash"></i></button>' : '') +
      '</div>';

      // Items dentro il gruppo
      group.items.forEach((item, ii) => {
        let iconOpts = '';
        BANNER_ICONS.forEach(ic => {
          iconOpts += '<option value="'+ic.v+'"'+(item.icon === ic.v ? ' selected' : '')+'>'+ic.l+'</option>';
        });
        let ctaOpts = '';
        CTA_ICONS.forEach(ic => {
          ctaOpts += '<option value="'+ic.v+'"'+(item.ctaIcon === ic.v ? ' selected' : '')+'>'+ic.l+'</option>';
        });

        html += '<div class="gh-banner-card" style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:12px;margin-bottom:8px;position:relative;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<strong style="color:#145284;font-size:13px;"><i class="fas '+esc(item.icon)+'"></i> Card '+(ii+1)+'</strong>' +
            (group.items.length > 1 ? '<button type="button" data-remove-bcard="'+gi+'-'+ii+'" style="background:#D32F2F;color:#fff;border:none;padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer;font-weight:700;"><i class="fas fa-trash"></i></button>' : '') +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px;">' +
            '<div><label style="font-size:11px;font-weight:600;color:#4A4A4A;">Icona</label>' +
              '<select data-bgi="'+gi+'" data-bii="'+ii+'" data-bfield="icon" style="width:100%;padding:6px 8px;border:1px solid #d0d0d0;border-radius:4px;font-size:11px;font-family:\'Titillium Web\',sans-serif;">'+iconOpts+'</select></div>' +
            '<div><label style="font-size:11px;font-weight:600;color:#4A4A4A;">Etichetta</label>' +
              '<input type="text" data-bgi="'+gi+'" data-bii="'+ii+'" data-bfield="kicker" value="'+esc(item.kicker)+'" placeholder="Es: Notizie" style="width:100%;padding:6px 8px;border:1px solid #d0d0d0;border-radius:4px;font-size:11px;box-sizing:border-box;font-family:\'Titillium Web\',sans-serif;"></div>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px;">' +
            '<div><label style="font-size:11px;font-weight:600;color:#4A4A4A;">Titolo (IT)</label>' +
              '<input type="text" data-bgi="'+gi+'" data-bii="'+ii+'" data-bfield="titleIt" value="'+esc(item.titleIt)+'" placeholder="Es: News dal Comune" style="width:100%;padding:6px 8px;border:1px solid #d0d0d0;border-radius:4px;font-size:11px;box-sizing:border-box;font-family:\'Titillium Web\',sans-serif;"></div>' +
            '<div><label style="font-size:11px;font-weight:600;color:#4A4A4A;">Titolo (EN)</label>' +
              '<input type="text" data-bgi="'+gi+'" data-bii="'+ii+'" data-bfield="titleEn" value="'+esc(item.titleEn)+'" placeholder="Es: City news" style="width:100%;padding:6px 8px;border:1px solid #d0d0d0;border-radius:4px;font-size:11px;box-sizing:border-box;font-family:\'Titillium Web\',sans-serif;"></div>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px;">' +
            '<div><label style="font-size:11px;font-weight:600;color:#4A4A4A;">Link</label>' +
              '<input type="text" data-bgi="'+gi+'" data-bii="'+ii+'" data-bfield="href" value="'+esc(item.href)+'" placeholder="pagina-notizie" style="width:100%;padding:6px 8px;border:1px solid #d0d0d0;border-radius:4px;font-size:11px;box-sizing:border-box;font-family:\'Titillium Web\',sans-serif;"></div>' +
            '<div><label style="font-size:11px;font-weight:600;color:#4A4A4A;">Immagine sfondo (opz.)</label>' +
              '<input type="text" data-bgi="'+gi+'" data-bii="'+ii+'" data-bfield="bgImage" value="'+esc(item.bgImage || '')+'" placeholder="docs/banner-bg.jpg" style="width:100%;padding:6px 8px;border:1px solid #d0d0d0;border-radius:4px;font-size:11px;box-sizing:border-box;font-family:\'Titillium Web\',sans-serif;"></div>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div><label style="font-size:11px;font-weight:600;color:#4A4A4A;">Testo Pulsante</label>' +
              '<input type="text" data-bgi="'+gi+'" data-bii="'+ii+'" data-bfield="ctaLabel" value="'+esc(item.ctaLabel)+'" placeholder="Apri" style="width:100%;padding:6px 8px;border:1px solid #d0d0d0;border-radius:4px;font-size:11px;box-sizing:border-box;font-family:\'Titillium Web\',sans-serif;"></div>' +
            '<div><label style="font-size:11px;font-weight:600;color:#4A4A4A;">Icona Pulsante</label>' +
              '<select data-bgi="'+gi+'" data-bii="'+ii+'" data-bfield="ctaIcon" style="width:100%;padding:6px 8px;border:1px solid #d0d0d0;border-radius:4px;font-size:11px;font-family:\'Titillium Web\',sans-serif;">'+ctaOpts+'</select></div>' +
          '</div>' +
        '</div>';
      });

      html += '<button type="button" data-add-bcard="'+gi+'" style="background:none;color:#145284;border:1px dashed #145284;padding:6px 12px;border-radius:4px;font-size:11px;cursor:pointer;font-weight:600;margin-top:4px;font-family:\'Titillium Web\',sans-serif;"><i class="fas fa-plus"></i> Aggiungi Card (max 4)</button>';
      html += '</div>';
    });
    c.innerHTML = html;

    // Remove banner group buttons
    c.querySelectorAll('[data-remove-bgrp]').forEach(btn => {
      btn.addEventListener('click', e => {
        const gi = parseInt(e.currentTarget.getAttribute('data-remove-bgrp'));
        collectBannerGroupsFromDOM();
        state.bannerGroups.splice(gi, 1);
        syncBannerCustomWidgets();
        refreshBannerGroups();
        refreshWidgetList();
      });
    });

    // Remove banner card buttons
    c.querySelectorAll('[data-remove-bcard]').forEach(btn => {
      btn.addEventListener('click', e => {
        const [gi, ii] = e.currentTarget.getAttribute('data-remove-bcard').split('-').map(Number);
        collectBannerGroupsFromDOM();
        state.bannerGroups[gi].items.splice(ii, 1);
        refreshBannerGroups();
      });
    });

    // Add card buttons
    c.querySelectorAll('[data-add-bcard]').forEach(btn => {
      btn.addEventListener('click', e => {
        const gi = parseInt(e.currentTarget.getAttribute('data-add-bcard'));
        collectBannerGroupsFromDOM();
        if (state.bannerGroups[gi].items.length < 4) {
          state.bannerGroups[gi].items.push({ icon: 'fa-bullhorn', kicker: '', titleIt: '', titleEn: '', href: '', ctaLabel: 'Apri', ctaIcon: 'fa-arrow-right', bgImage: '' });
          refreshBannerGroups();
        } else {
          alert('Massimo 4 card per banner!');
        }
      });
    });
  }

  function collectBannerGroupsFromDOM() {
    document.querySelectorAll('[data-bgi]').forEach(el => {
      const gi = parseInt(el.getAttribute('data-bgi'));
      const ii = parseInt(el.getAttribute('data-bii'));
      const f = el.getAttribute('data-bfield');
      if (state.bannerGroups[gi] && state.bannerGroups[gi].items[ii]) {
        state.bannerGroups[gi].items[ii][f] = el.value || (el.options ? el.options[el.selectedIndex]?.value : el.value);
      }
    });
  }

  /* ============================================================
     DYNAMIC FORM – TAB BAR
     ============================================================ */
  function refreshTabBarItems(skipCollect) {
    const c = document.getElementById('ghTabBarItemsContainer');
    if (!c) return;
    if (!skipCollect) collectTabBarFromDOM();

    // Trova quale pulsante è il centrale
    let centerIdx = state.tabBarItems.findIndex(it => it.isCenter);
    if (centerIdx < 0) centerIdx = 2; // default: il terzo (posizione centrale)

    // Dropdown per scegliere il pulsante centrale – PRIMA delle card
    let html = '<div style="background:#e8f0fa;border:2px solid #145284;border-radius:10px;padding:14px 16px;margin-bottom:16px;">';
    html += '<label style="display:block;font-size:13px;font-weight:700;color:#145284;margin-bottom:8px;"><i class="fas fa-star"></i> Quale pulsante vuoi al centro (più grande e in evidenza)?</label>';
    html += '<select id="ghTabBarCenterSelect" style="width:100%;padding:10px 14px;border:1px solid #145284;border-radius:8px;font-family:\'Titillium Web\',sans-serif;font-size:14px;font-weight:600;color:#145284;background:#fff;">';
    state.tabBarItems.forEach((item, i) => {
      html += '<option value="'+i+'"'+(i === centerIdx ? ' selected' : '')+'>Pulsante '+(i+1)+' – '+esc(item.labelIt || 'Senza nome')+'</option>';
    });
    html += '</select></div>';

    // Card per ogni pulsante
    state.tabBarItems.forEach((item, i) => {
      const isCenterItem = (i === centerIdx);
      const borderColor = isCenterItem ? '#145284' : '#d0d8e0';
      const bgColor = isCenterItem ? '#e8f4fd' : '#f0f4f8';
      const badge = isCenterItem ? ' <span style="background:#145284;color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;margin-left:6px;">CENTRALE</span>' : '';
      html += '<div class="gh-tabbar-card" data-tabbar="'+i+'" style="background:'+bgColor+';border:2px solid '+borderColor+';border-radius:10px;padding:14px;margin-bottom:12px;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
        '<span style="font-size:13px;font-weight:700;color:#145284;"><i class="fas '+esc(item.icon)+'"></i> Pulsante '+(i+1)+badge+'</span>' +
      '</div>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">' +
        '<div><label style="font-size:12px;font-weight:600;color:#4A4A4A;">Icona</label>' +
          makeIconSelect('ghTabBarIcon_'+i, item.icon) +
          '<input type="hidden" data-tabbar="'+i+'" data-tbfield="icon" value="'+esc(item.icon)+'">' +
        '</div>' +
        '<div><label style="font-size:12px;font-weight:600;color:#4A4A4A;">Label IT</label>' +
          '<input type="text" data-tabbar="'+i+'" data-tbfield="labelIt" value="'+esc(item.labelIt)+'" style="width:100%;padding:8px 10px;border:1px solid #d0d0d0;border-radius:6px;font-size:13px;box-sizing:border-box;font-family:\'Titillium Web\',sans-serif;">' +
        '</div>' +
      '</div>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
        '<div><label style="font-size:12px;font-weight:600;color:#4A4A4A;">Label EN</label>' +
          '<input type="text" data-tabbar="'+i+'" data-tbfield="labelEn" value="'+esc(item.labelEn)+'" style="width:100%;padding:8px 10px;border:1px solid #d0d0d0;border-radius:6px;font-size:13px;box-sizing:border-box;font-family:\'Titillium Web\',sans-serif;">' +
        '</div>' +
        '<div><label style="font-size:12px;font-weight:600;color:#4A4A4A;">Link/Href</label>' +
          '<input type="text" data-tabbar="'+i+'" data-tbfield="href" value="'+esc(item.href)+'" placeholder="link-page" style="width:100%;padding:8px 10px;border:1px solid #d0d0d0;border-radius:6px;font-size:13px;box-sizing:border-box;font-family:\'Titillium Web\',sans-serif;">' +
        '</div>' +
      '</div>';
      html += '</div>';
    });
    c.innerHTML = html;

    // Listener sul dropdown centro: aggiorna badge e state
    const centerSel = document.getElementById('ghTabBarCenterSelect');
    if (centerSel) {
      centerSel.addEventListener('change', () => {
        const ci = parseInt(centerSel.value);
        state.tabBarItems.forEach((it, idx) => { it.isCenter = (idx === ci); });
        refreshTabBarItems(false); // ri-renderizza con il nuovo badge
      });
    }

    // Listener sulle select icone
    state.tabBarItems.forEach((item, i) => {
      const sel = document.getElementById('ghTabBarIcon_'+i);
      if (sel) {
        sel.addEventListener('change', e => {
          const inp = document.querySelector('[data-tabbar="'+i+'"][data-tbfield="icon"]');
          if (inp) inp.value = e.target.value;
          state.tabBarItems[i].icon = e.target.value;
        });
      }
    });
  }

  function collectTabBarFromDOM() {
    // Raccogli campi testo/icona da ogni card
    state.tabBarItems.forEach((item, i) => {
      const icon = document.querySelector('[data-tabbar="'+i+'"][data-tbfield="icon"]');
      const labelIt = document.querySelector('[data-tabbar="'+i+'"][data-tbfield="labelIt"]');
      const labelEn = document.querySelector('[data-tabbar="'+i+'"][data-tbfield="labelEn"]');
      const href = document.querySelector('[data-tabbar="'+i+'"][data-tbfield="href"]');
      if (icon) state.tabBarItems[i].icon = icon.value;
      if (labelIt) state.tabBarItems[i].labelIt = labelIt.value;
      if (labelEn) state.tabBarItems[i].labelEn = labelEn.value;
      if (href) state.tabBarItems[i].href = href.value;
    });
    // Leggi il dropdown per il pulsante centrale
    const centerSel = document.getElementById('ghTabBarCenterSelect');
    if (centerSel) {
      const ci = parseInt(centerSel.value);
      state.tabBarItems.forEach((it, idx) => { it.isCenter = (idx === ci); });
    }
    // Se non c'è il dropdown (es. form non ancora renderizzato), non toccare isCenter
  }

  /* ============================================================
     DYNAMIC FORM – SERVIZI
     ============================================================ */
  function refreshServizi(skipCollect) {
    const c = document.getElementById('ghServiziContainer');
    if (!c) return;
    if (!skipCollect) collectServiziFromDOM();
    let html = '';
    state.servizi.forEach((sec, si) => {
      html += '<div class="gh-sez-card" style="background:#f0f4f8;border:1px solid #d0d8e0;border-radius:10px;padding:16px;margin-bottom:16px;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
        '<strong style="color:#145284;font-size:14px;"><i class="fas fa-layer-group"></i> Sezione '+(si+1)+'</strong>' +
        (state.servizi.length > 1 ? '<button type="button" data-remove-sez="'+si+'" style="background:#D32F2F;color:#fff;border:none;padding:4px 10px;border-radius:6px;font-size:12px;cursor:pointer;font-weight:700;"><i class="fas fa-trash"></i></button>' : '') +
      '</div>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
        '<div><label style="font-size:12px;font-weight:600;color:#4A4A4A;">Nome Sezione IT</label><input type="text" data-sez="'+si+'" data-sez-field="sectionIt" value="'+esc(sec.sectionIt)+'" style="width:100%;padding:8px 10px;border:1px solid #d0d0d0;border-radius:6px;font-size:13px;box-sizing:border-box;font-family:\'Titillium Web\',sans-serif;"></div>' +
        '<div><label style="font-size:12px;font-weight:600;color:#4A4A4A;">Nome Sezione EN</label><input type="text" data-sez="'+si+'" data-sez-field="sectionEn" value="'+esc(sec.sectionEn)+'" style="width:100%;padding:8px 10px;border:1px solid #d0d0d0;border-radius:6px;font-size:13px;box-sizing:border-box;font-family:\'Titillium Web\',sans-serif;"></div>' +
      '</div>';
      // Items
      sec.items.forEach((it, ii) => {
        html += '<div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:12px;margin-bottom:8px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<span style="font-size:12px;font-weight:600;color:#9B9B9B;">Servizio '+(ii+1)+'</span>' +
            (sec.items.length > 1 ? '<button type="button" data-remove-item="'+si+'-'+ii+'" style="background:none;color:#D32F2F;border:none;font-size:12px;cursor:pointer;font-weight:700;"><i class="fas fa-times"></i></button>' : '') +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;">' +
            '<div><label style="font-size:11px;font-weight:600;color:#4A4A4A;">Icona</label><select data-item="'+si+'-'+ii+'" data-item-field="icon" style="width:100%;padding:6px 8px;border:1px solid #d0d0d0;border-radius:6px;font-size:12px;font-family:\'Titillium Web\',sans-serif;">' +
              FA_ICONS.map(ic => '<option value="'+ic.v+'" '+(ic.v===it.icon?'selected':'')+'>'+ic.l+'</option>').join('') +
            '</select></div>' +
            '<div><label style="font-size:11px;font-weight:600;color:#4A4A4A;">Label IT</label><input type="text" data-item="'+si+'-'+ii+'" data-item-field="labelIt" value="'+esc(it.labelIt)+'" style="width:100%;padding:6px 8px;border:1px solid #d0d0d0;border-radius:6px;font-size:12px;box-sizing:border-box;font-family:\'Titillium Web\',sans-serif;"></div>' +
            '<div><label style="font-size:11px;font-weight:600;color:#4A4A4A;">Label EN</label><input type="text" data-item="'+si+'-'+ii+'" data-item-field="labelEn" value="'+esc(it.labelEn)+'" style="width:100%;padding:6px 8px;border:1px solid #d0d0d0;border-radius:6px;font-size:12px;box-sizing:border-box;font-family:\'Titillium Web\',sans-serif;"></div>' +
            '<div><label style="font-size:11px;font-weight:600;color:#4A4A4A;">Link</label><input type="text" data-item="'+si+'-'+ii+'" data-item-field="href" value="'+esc(it.href)+'" style="width:100%;padding:6px 8px;border:1px solid #d0d0d0;border-radius:6px;font-size:12px;box-sizing:border-box;font-family:\'Titillium Web\',sans-serif;"></div>' +
          '</div></div>';
      });
      html += '<button type="button" data-add-item="'+si+'" style="background:none;color:#3CA434;border:1px dashed #3CA434;padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer;font-weight:700;margin-top:4px;font-family:\'Titillium Web\',sans-serif;"><i class="fas fa-plus"></i> Aggiungi Servizio</button>';
      html += '</div>';
    });
    c.innerHTML = html;

    // Events
    c.querySelectorAll('[data-remove-sez]').forEach(btn => {
      btn.addEventListener('click', e => {
        collectServiziFromDOM();
        state.servizi.splice(parseInt(e.currentTarget.getAttribute('data-remove-sez')), 1);
        refreshServizi();
      });
    });
    c.querySelectorAll('[data-remove-item]').forEach(btn => {
      btn.addEventListener('click', e => {
        collectServiziFromDOM();
        const [si, ii] = e.currentTarget.getAttribute('data-remove-item').split('-').map(Number);
        state.servizi[si].items.splice(ii, 1);
        refreshServizi();
      });
    });
    c.querySelectorAll('[data-add-item]').forEach(btn => {
      btn.addEventListener('click', e => {
        collectServiziFromDOM();
        const si = parseInt(e.currentTarget.getAttribute('data-add-item'));
        state.servizi[si].items.push({ icon: 'fa-gears', labelIt: '', labelEn: '', href: '' });
        refreshServizi();
      });
    });
  }

  function collectServiziFromDOM() {
    document.querySelectorAll('[data-sez]').forEach(input => {
      const si = parseInt(input.getAttribute('data-sez'));
      const f = input.getAttribute('data-sez-field');
      if (state.servizi[si]) state.servizi[si][f] = input.value;
    });
    document.querySelectorAll('[data-item]').forEach(input => {
      const [si, ii] = input.getAttribute('data-item').split('-').map(Number);
      const f = input.getAttribute('data-item-field');
      if (state.servizi[si] && state.servizi[si].items[ii]) {
        state.servizi[si].items[ii][f] = input.value || input.options?.[input.selectedIndex]?.value || '';
      }
    });
  }

  /* ============================================================
     DYNAMIC FORM – WIDGETS
     ============================================================ */
  function refreshWidgetList(skipCollect) {
    const c = document.getElementById('ghWidgetList');
    if (!c) return;
    if (!skipCollect) collectWidgetsFromDOM();
    const sorted = state.widgets.slice().sort((a, b) => a.order - b.order);
    let html = '';
    sorted.forEach(w => {
      html += '<div class="gh-widget-row" style="background:#f8f9fa;border:1px solid #e0e0e0;border-radius:10px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;gap:12px;">' +
        '<input type="checkbox" data-widget-toggle="'+w.id+'" '+(w.enabled?'checked':'')+' style="width:18px;height:18px;cursor:pointer;flex-shrink:0;">' +
        '<span style="flex:1;font-weight:600;color:#145284;font-size:14px;">'+esc(w.label)+'</span>' +
        '<button type="button" data-widget-up="'+w.id+'" style="background:none;border:1px solid #145284;color:#145284;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;font-weight:600;"><i class="fas fa-arrow-up"></i></button>' +
        '<button type="button" data-widget-down="'+w.id+'" style="background:none;border:1px solid #145284;color:#145284;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;font-weight:600;"><i class="fas fa-arrow-down"></i></button>' +
      '</div>';
    });
    c.innerHTML = html;

    // Events
    c.querySelectorAll('[data-widget-toggle]').forEach(cb => {
      cb.addEventListener('change', e => {
        const wid = e.currentTarget.getAttribute('data-widget-toggle');
        const w = state.widgets.find(x => x.id === wid);
        if (w) w.enabled = e.currentTarget.checked;
      });
    });
    c.querySelectorAll('[data-widget-up]').forEach(btn => {
      btn.addEventListener('click', e => {
        const wid = e.currentTarget.getAttribute('data-widget-up');
        const w = state.widgets.find(x => x.id === wid);
        if (w && w.order > 0) {
          const other = state.widgets.find(x => x.order === w.order - 1);
          if (other) { w.order--; other.order++; }
          refreshWidgetList();
        }
      });
    });
    c.querySelectorAll('[data-widget-down]').forEach(btn => {
      btn.addEventListener('click', e => {
        const wid = e.currentTarget.getAttribute('data-widget-down');
        const w = state.widgets.find(x => x.id === wid);
        if (w && w.order < state.widgets.length - 1) {
          const other = state.widgets.find(x => x.order === w.order + 1);
          if (other) { w.order++; other.order--; }
          refreshWidgetList();
        }
      });
    });
  }

  function collectWidgetsFromDOM() {
    document.querySelectorAll('[data-widget-toggle]').forEach(cb => {
      const wid = cb.getAttribute('data-widget-toggle');
      const w = state.widgets.find(x => x.id === wid);
      if (w) w.enabled = cb.checked;
    });
  }

  /* ============================================================
     FIREBASE – SAVE/LOAD CONFIGURATIONS
     ============================================================ */
  function isFirebaseAvailable() {
    return typeof firebase !== 'undefined' && firebase.firestore && typeof AuthService !== 'undefined' && AuthService.isAuthenticated();
  }

  function showFirebaseWarning() {
    const w = document.getElementById('ghFirebaseWarning');
    if (w) w.style.display = 'block';
    const btns = [document.getElementById('ghBtnSaveConfig'), document.getElementById('ghBtnLoadConfig'), document.getElementById('ghBtnDeleteConfig')];
    btns.forEach(b => { if (b) b.disabled = true; });
  }

  async function loadConfigList() {
    const sel = document.getElementById('ghConfigSelect');
    if (!sel || !isFirebaseAvailable()) return;
    try {
      const db = firebase.firestore();
      const snap = await db.collection('generatore-home-configs').get();
      sel.innerHTML = '<option value="">-- Nessuna --</option>';
      snap.forEach(doc => {
        const opt = document.createElement('option');
        opt.value = doc.id;
        opt.textContent = doc.id;
        sel.appendChild(opt);
      });
    } catch (err) {
      console.error('Error loading configs:', err);
    }
  }

  async function saveConfig() {
    if (!isFirebaseAvailable()) { alert('Firebase non disponibile'); return; }
    collectState();
    if (!state.nomeComune) { alert('Inserisci il nome del comune!'); return; }
    try {
      const db = firebase.firestore();
      const docId = state.nomeComune.toLowerCase().replace(/\s+/g, '-');
      const userEmail = AuthService.getUserEmail() || 'unknown';
      const timestamp = new Date();
      await db.collection('generatore-home-configs').doc(docId).set({
        config: state,
        nomeComune: state.nomeComune,
        updatedAt: timestamp,
        createdBy: userEmail
      });
      alert('Configurazione salvata!');
      await loadConfigList();
    } catch (err) {
      console.error('Error saving config:', err);
      alert('Errore durante il salvataggio: ' + err.message);
    }
  }

  async function loadConfig(docId) {
    if (!isFirebaseAvailable()) { alert('Firebase non disponibile'); return; }
    try {
      const db = firebase.firestore();
      const doc = await db.collection('generatore-home-configs').doc(docId).get();
      if (doc.exists) {
        const data = doc.data();
        state = Object.assign(getDefaultState(), data.config || {});
        // Migrate old bannerCustomItems to bannerGroups
        if (state.bannerCustomItems && !state.bannerGroups?.length) {
          state.bannerGroups = [{ items: state.bannerCustomItems }];
          delete state.bannerCustomItems;
        }
        // Migrate old tabBarEnabled to widget system
        if (state.tabBarEnabled !== undefined) {
          const tbW = state.widgets.find(w => w.id === 'tabBar');
          if (tbW) tbW.enabled = !!state.tabBarEnabled;
          delete state.tabBarEnabled;
        }
        populateForm();
        alert('Configurazione caricata!');
      } else {
        alert('Configurazione non trovata');
      }
    } catch (err) {
      console.error('Error loading config:', err);
      alert('Errore durante il caricamento: ' + err.message);
    }
  }

  async function deleteConfig(docId) {
    if (!isFirebaseAvailable()) { alert('Firebase non disponibile'); return; }
    if (!confirm('Sei sicuro di voler eliminare questa configurazione?')) return;
    try {
      const db = firebase.firestore();
      await db.collection('generatore-home-configs').doc(docId).delete();
      alert('Configurazione eliminata!');
      await loadConfigList();
    } catch (err) {
      console.error('Error deleting config:', err);
      alert('Errore durante l\'eliminazione: ' + err.message);
    }
  }

  /* ============================================================
     PALETTE PREVIEW
     ============================================================ */
  function updatePalettePreview() {
    const el = document.getElementById('ghPalettePreview');
    if (!el) return;
    const pAuto = generatePalette(state.colorePrimario);
    const gAuto = generatePalette(state.coloreSecondario);
    const p = applyPaletteOverrides(pAuto, state.palettePrimarioOverride);
    const g = applyPaletteOverrides(gAuto, state.paletteSecondarioOverride);

    // Box editabile: la sfumatura 700 è il colore base (già editabile sopra), le altre hanno un color picker
    const editableBox = (color, autoColor, shade, group) => {
      const isBase = shade === '700';
      const isOverridden = !isBase && color !== autoColor;
      const inputId = 'ghPal_' + group + '_' + shade;
      if (isBase) {
        // 700 = colore base, non editabile qui (si cambia sopra)
        return '<div style="text-align:center;">'
          + '<div style="width:44px;height:44px;border-radius:10px;background:'+color+';border:2px solid '+color+';margin:0 auto 4px;box-shadow:0 2px 6px rgba(0,0,0,.15);"></div>'
          + '<div style="font-size:10px;font-weight:700;color:'+color+';">'+shade+'</div>'
          + '<div style="font-size:9px;color:#9B9B9B;">base</div>'
        + '</div>';
      }
      return '<div style="text-align:center;position:relative;">'
        + '<label for="'+inputId+'" style="cursor:pointer;display:block;">'
        + '<div style="width:44px;height:44px;border-radius:10px;background:'+color+';border:2px solid '+(isOverridden ? '#e88a1a' : 'rgba(0,0,0,.1)')+';margin:0 auto 4px;position:relative;transition:border-color .2s;">'
        + (isOverridden ? '<div style="position:absolute;top:-4px;right:-4px;background:#e88a1a;color:#fff;width:14px;height:14px;border-radius:50%;font-size:8px;display:flex;align-items:center;justify-content:center;"><i class="fas fa-pen"></i></div>' : '')
        + '</div></label>'
        + '<input type="color" id="'+inputId+'" value="'+color+'" style="position:absolute;top:0;left:50%;transform:translateX(-50%);width:44px;height:44px;opacity:0;cursor:pointer;">'
        + '<div style="font-size:10px;color:#4A4A4A;">'+shade+'</div>'
        + (isOverridden
          ? '<div style="cursor:pointer;font-size:9px;color:#e88a1a;text-decoration:underline;" onclick="document.getElementById(\''+inputId+'\').dataset.reset=\'1\';document.getElementById(\''+inputId+'\').dispatchEvent(new Event(\'change\'));">reset</div>'
          : '<div style="font-size:9px;color:#9B9B9B;">auto</div>')
      + '</div>';
    };

    const shades = ['900','700','500','300','100'];

    el.innerHTML = '<div style="margin-bottom:8px;font-size:12px;font-weight:700;color:'+state.colorePrimario+';width:100%;"><i class="fas fa-palette"></i> Primario — clicca una sfumatura per modificarla</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">' +
        shades.map(s => editableBox(p[s], pAuto[s], s, 'pri')).join('') +
      '</div>' +
      '<div style="margin-bottom:8px;font-size:12px;font-weight:700;color:'+state.coloreSecondario+';width:100%;"><i class="fas fa-palette"></i> Secondario — clicca una sfumatura per modificarla</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
        shades.map(s => editableBox(g[s], gAuto[s], s, 'sec')).join('') +
      '</div>';

    // Attach color picker events
    shades.filter(s => s !== '700').forEach(shade => {
      const priInput = document.getElementById('ghPal_pri_' + shade);
      const secInput = document.getElementById('ghPal_sec_' + shade);
      if (priInput) priInput.addEventListener('change', e => {
        if (e.target.dataset.reset === '1') {
          delete e.target.dataset.reset;
          if (!state.palettePrimarioOverride) state.palettePrimarioOverride = {};
          state.palettePrimarioOverride[shade] = '';
        } else {
          if (!state.palettePrimarioOverride) state.palettePrimarioOverride = {};
          state.palettePrimarioOverride[shade] = e.target.value;
        }
        updatePalettePreview();
      });
      if (secInput) secInput.addEventListener('change', e => {
        if (e.target.dataset.reset === '1') {
          delete e.target.dataset.reset;
          if (!state.paletteSecondarioOverride) state.paletteSecondarioOverride = {};
          state.paletteSecondarioOverride[shade] = '';
        } else {
          if (!state.paletteSecondarioOverride) state.paletteSecondarioOverride = {};
          state.paletteSecondarioOverride[shade] = e.target.value;
        }
        updatePalettePreview();
      });
    });
  }

  function updatePresetHighlight() {
    document.querySelectorAll('.ghPresetCard').forEach(card => {
      const idx = parseInt(card.getAttribute('data-preset-idx'));
      const pr = COLOR_PRESETS[idx];
      if (!pr) return;
      const isActive = (state.colorePrimario.toLowerCase() === pr.primary.toLowerCase() && state.coloreSecondario.toLowerCase() === pr.secondary.toLowerCase());
      card.style.borderColor = isActive ? pr.primary : '#e0e0e0';
      card.style.background = isActive ? pr.primary + '12' : '#fff';
      // Aggiorna check icon
      const existingCheck = card.querySelector('.ghPresetCheck');
      if (isActive && !existingCheck) {
        const check = document.createElement('div');
        check.className = 'ghPresetCheck';
        check.style.cssText = 'position:absolute;top:6px;right:6px;background:'+pr.primary+';color:#fff;width:20px;height:20px;border-radius:50%;font-size:10px;display:flex;align-items:center;justify-content:center;';
        check.innerHTML = '<i class="fas fa-check"></i>';
        card.appendChild(check);
      } else if (!isActive && existingCheck) {
        existingCheck.remove();
      }
    });
  }

  /* ============================================================
     COLLECT STATE FROM FORM
     ============================================================ */
  function collectState() {
    const v = id => { const e = document.getElementById(id); return e ? (e.type === 'checkbox' ? e.checked : e.value) : ''; };
    state.nomeComune = v('ghNomeComune');
    state.baseUrl = v('ghBaseUrl');
    state.pageTitle = v('ghPageTitle');
    state.stemmaUrl = v('ghStemmaUrl');
    state.lat = v('ghLat');
    state.lon = v('ghLon');
    state.colorePrimario = v('ghColorePrimario');
    state.coloreSecondario = v('ghColoreSecondario');
    // Override palette: leggi dai color picker nella preview (se esistono)
    ['900','500','300','100'].forEach(shade => {
      const priEl = document.getElementById('ghPal_pri_' + shade);
      const secEl = document.getElementById('ghPal_sec_' + shade);
      if (priEl && state.palettePrimarioOverride && state.palettePrimarioOverride[shade]) {
        state.palettePrimarioOverride[shade] = priEl.value;
      }
      if (secEl && state.paletteSecondarioOverride && state.paletteSecondarioOverride[shade]) {
        state.paletteSecondarioOverride[shade] = secEl.value;
      }
    });
    state.tickerRssId = v('ghTickerRssId');
    state.tickerLinkUrl = v('ghTickerLinkUrl');
    collectSlidesFromDOM();
    collectServiziFromDOM();
    collectBannerGroupsFromDOM();
    collectWidgetsFromDOM();
    state.bannerCieEnabled = v('ghBannerCieEnabled');
    state.bannerCieTitle = v('ghBannerCieTitle');
    state.bannerCieTitleEn = v('ghBannerCieTitleEn');
    state.bannerCieSubtitle = v('ghBannerCieSubtitle');
    state.bannerCieSubtitleEn = v('ghBannerCieSubtitleEn');
    state.bannerCieHref = v('ghBannerCieHref');
    state.raccoltaFeedUrl = v('ghRaccoltaFeedUrl');
    state.raccoltaInfoUrl = v('ghRaccoltaInfoUrl');
    const tips = v('ghRaccoltaEcoTips');
    state.raccoltaEcoTips = typeof tips === 'string' ? tips.split('\n').filter(t => t.trim()) : state.raccoltaEcoTips;
    state.protCivileEnabled = v('ghProtCivileEnabled');
    state.protCivileApiKey = v('ghProtCivileApiKey');
    state.protCivileRegione = v('ghProtCivileRegione');
    state.protCivileComune = v('ghProtCivileComune');
    state.protCivileUrlRegione = v('ghProtCivileUrlRegione');
    state.meteoWeeklyUrl = v('ghMeteoWeeklyUrl');
    state.meteoInterval = parseInt(v('ghMeteoInterval')) || 15;
    state.meteoTimeout = parseInt(v('ghMeteoTimeout')) || 10000;
    state.footerTerminiUrl = v('ghFooterTerminiUrl');
    state.footerTerminiLabel = v('ghFooterTerminiLabel');
    state.footerPrivacyUrl = v('ghFooterPrivacyUrl');
    state.footerPrivacyLabel = v('ghFooterPrivacyLabel');
    state.footerCopyrightText = v('ghFooterCopyrightText');
    state.footerCopyrightUrl = v('ghFooterCopyrightUrl');
    state.a11yDarkMode = v('ghA11yDarkMode');
    state.a11yContrasto = v('ghA11yContrasto');
    state.a11yFontScale = v('ghA11yFontScale');
    state.a11yMaxFontScale = parseInt(v('ghA11yMaxFontScale')) || 4;
    state.a11yRispettaSistema = v('ghA11yRispettaSistema');
    state.spotlightWidgetId = v('ghSpotlightWidgetId');
    state.spotlightDurata = parseInt(v('ghSpotlightDurata')) || 2500;
    state.spotlightForzaSempre = v('ghSpotlightForzaSempre');
    // Widget Custom
    state.customWidget.label = v('ghCustomWidgetLabel') || 'Widget Custom';
    state.customWidget.height = parseInt(v('ghCustomWidgetHeight')) || 300;
    state.customWidget.htmlCode = v('ghCustomWidgetCode') || '';
    // enabled è gestito dalla lista widget (customWidget toggle)
    const cwWidget = state.widgets.find(w => w.id === 'customWidget');
    state.customWidget.enabled = cwWidget ? cwWidget.enabled : false;
    // Sincronizza la label nella lista widget
    if (cwWidget) cwWidget.label = state.customWidget.label;
    // Tab Bar
    collectTabBarFromDOM();
    // RSS Sliders
    collectRssSlidersFromDOM();
  }

  /* ============================================================
     POPULATE FORM FROM STATE (after JSON import)
     ============================================================ */
  function populateForm() {
    const set = (id, val) => { const e = document.getElementById(id); if (e) { if (e.type === 'checkbox') e.checked = !!val; else e.value = val || ''; } };
    set('ghNomeComune', state.nomeComune);
    set('ghBaseUrl', state.baseUrl);
    set('ghPageTitle', state.pageTitle);
    set('ghStemmaUrl', state.stemmaUrl);
    set('ghLat', state.lat);
    set('ghLon', state.lon);
    set('ghColorePrimario', state.colorePrimario);
    set('ghColoreSecondario', state.coloreSecondario);
    // Assicura che gli override palette esistano (compatibilità configurazioni vecchie)
    if (!state.palettePrimarioOverride) state.palettePrimarioOverride = { '900': '', '500': '', '300': '', '100': '' };
    if (!state.paletteSecondarioOverride) state.paletteSecondarioOverride = { '900': '', '500': '', '300': '', '100': '' };
    // Aggiorna anche gli hex input
    const cpHex = document.getElementById('ghColorePrimarioHex');
    const csHex = document.getElementById('ghColoreSecondarioHex');
    if (cpHex) cpHex.value = state.colorePrimario;
    if (csHex) csHex.value = state.coloreSecondario;
    set('ghTickerRssId', state.tickerRssId);
    set('ghTickerLinkUrl', state.tickerLinkUrl);
    syncBannerCustomWidgets();
    refreshBannerGroups(true); // skipCollect: lo state è già aggiornato dal load
    set('ghBannerCieEnabled', state.bannerCieEnabled);
    set('ghBannerCieTitle', state.bannerCieTitle);
    set('ghBannerCieTitleEn', state.bannerCieTitleEn);
    set('ghBannerCieSubtitle', state.bannerCieSubtitle);
    set('ghBannerCieSubtitleEn', state.bannerCieSubtitleEn);
    set('ghBannerCieHref', state.bannerCieHref);
    set('ghRaccoltaFeedUrl', state.raccoltaFeedUrl);
    set('ghRaccoltaInfoUrl', state.raccoltaInfoUrl);
    const tipsEl = document.getElementById('ghRaccoltaEcoTips');
    if (tipsEl) tipsEl.value = (state.raccoltaEcoTips || []).join('\n');
    set('ghProtCivileEnabled', state.protCivileEnabled);
    set('ghProtCivileApiKey', state.protCivileApiKey);
    set('ghProtCivileRegione', state.protCivileRegione);
    set('ghProtCivileComune', state.protCivileComune);
    set('ghProtCivileUrlRegione', state.protCivileUrlRegione);
    set('ghMeteoWeeklyUrl', state.meteoWeeklyUrl);
    set('ghMeteoInterval', state.meteoInterval);
    set('ghMeteoTimeout', state.meteoTimeout);
    set('ghFooterTerminiUrl', state.footerTerminiUrl);
    set('ghFooterTerminiLabel', state.footerTerminiLabel);
    set('ghFooterPrivacyUrl', state.footerPrivacyUrl);
    set('ghFooterPrivacyLabel', state.footerPrivacyLabel);
    set('ghFooterCopyrightText', state.footerCopyrightText);
    set('ghFooterCopyrightUrl', state.footerCopyrightUrl);
    set('ghA11yDarkMode', state.a11yDarkMode);
    set('ghA11yContrasto', state.a11yContrasto);
    set('ghA11yFontScale', state.a11yFontScale);
    set('ghA11yMaxFontScale', state.a11yMaxFontScale);
    set('ghA11yRispettaSistema', state.a11yRispettaSistema);
    set('ghSpotlightWidgetId', state.spotlightWidgetId);
    set('ghSpotlightDurata', state.spotlightDurata);
    set('ghSpotlightForzaSempre', state.spotlightForzaSempre);
    // Widget Custom
    if (!state.customWidget) state.customWidget = { enabled: false, height: 300, label: 'Widget Custom', htmlCode: '' };
    set('ghCustomWidgetLabel', state.customWidget.label);
    set('ghCustomWidgetHeight', state.customWidget.height);
    const cwCodeEl = document.getElementById('ghCustomWidgetCode');
    if (cwCodeEl) cwCodeEl.value = state.customWidget.htmlCode || '';
    ensureWidgetExists('customWidget', state.customWidget.label || 'Widget Custom', !!state.customWidget.enabled);
    // Tab Bar
    ensureWidgetExists('tabBar', 'Tab Bar', false);
    refreshTabBarItems(true);
    // RSS Sliders
    syncRssSliderWidgets();
    refreshRssSliders(true); // skipCollect: lo state è già aggiornato dal load
    refreshSlides(true); // skipCollect: lo state è già aggiornato dal load
    refreshServizi(true); // skipCollect: lo state è già aggiornato dal load
    // Normalizza ordini widget: elimina gap per garantire spostamenti corretti
    state.widgets.slice().sort((a, b) => a.order - b.order).forEach((w, i) => { w.order = i; });
    refreshWidgetList(true); // skipCollect: lo state è già aggiornato dal load
    updatePalettePreview();
  }

  /* ============================================================
     GENERATE HTML – ORCHESTRATOR
     ============================================================ */
  function generateHTML() {
    collectState();
    const S = state;
    const bp = applyPaletteOverrides(generatePalette(S.colorePrimario), S.palettePrimarioOverride);
    const gp = applyPaletteOverrides(generatePalette(S.coloreSecondario), S.paletteSecondarioOverride);
    const dbp = generateDarkPalette(bp, S.colorePrimario);
    const dgp = generateDarkPalette(gp, S.coloreSecondario);
    const BASE = S.baseUrl.replace(/\/+$/, '');

    // Build COMUNE_CONFIG
    const config = buildConfig(S, BASE);

    // Build servizi for config
    const serviziJson = JSON.stringify(S.servizi.map(sec => ({
      sectionIt: sec.sectionIt, sectionEn: sec.sectionEn,
      items: sec.items.map(it => ({ icon: it.icon, labelIt: it.labelIt, labelEn: it.labelEn, href: it.href }))
    })), null, 6);

    // Assemble full HTML
    return buildFullHTML(bp, gp, dbp, dgp, config, S);
  }

  /* ============================================================
     BUILD CONFIG OBJECT (as JS string)
     ============================================================ */
  function buildConfig(S, BASE) {
    const q = s => JSON.stringify(s);
    // Rende una stringa sicura dentro template literal (escapa backtick e ${)
    const BT = String.fromCharCode(96); // backtick
    const tplSafe = function(s) { return s.split(BT).join('\\' + BT).split('${').join('\\${'); };
    const serviziStr = JSON.stringify(S.servizi.map(sec => ({
      sectionIt: sec.sectionIt, sectionEn: sec.sectionEn,
      items: sec.items.map(it => ({ icon: it.icon, labelIt: it.labelIt, labelEn: it.labelEn, href: it.href }))
    })), null, 4);
    const tipsStr = JSON.stringify(S.raccoltaEcoTips, null, 6);
    // Serializza customWidget come JSON e rendilo safe per template literal e <script> tag
    const cwJson = JSON.stringify({
      enabled: !!S.customWidget.enabled,
      height: parseInt(S.customWidget.height) || 300,
      label: S.customWidget.label || 'Widget Custom',
      htmlCode: S.customWidget.htmlCode || ''
    });
    // 1) Spezza </script> per evitare che il parser HTML chiuda il tag prematuramente
    // 2) Escapa backtick e ${ per sicurezza nella template literal
    const customWidgetStr = tplSafe(cwJson.replace(/<\/script>/gi, '<\\/script>'));

    return `  window.COMUNE_CONFIG = {
    nomeComune:     ${q(S.nomeComune)},
    baseUrl:        ${q(S.baseUrl)},
    pageTitle:      ${q(S.pageTitle)},
    lat: ${S.lat || 0},
    lon: ${S.lon || 0},
    ticker: {
      rssWidgetId:  ${q(S.tickerRssId)},
      linkUrl:      ${q(S.tickerLinkUrl)},
    },
    slides: ${JSON.stringify(S.slides, null, 4)},
    servizi: ${serviziStr},
    bannerGroups: ${JSON.stringify(S.bannerGroups || [], null, 4)},
    bannerCie: {
      title:      ${q(S.bannerCieTitle)},
      titleEn:    ${q(S.bannerCieTitleEn)},
      subtitle:   ${q(S.bannerCieSubtitle)},
      subtitleEn: ${q(S.bannerCieSubtitleEn)},
      href:       ${q(S.bannerCieHref)},
      enabled:    ${!!S.bannerCieEnabled},
    },
    raccolta: {
      feedRssUrl: ${q(S.raccoltaFeedUrl)},
      infoPageUrl:${q(S.raccoltaInfoUrl)},
      ecoTips: ${tipsStr},
    },
    protezioneCivile: {
      apiKey:       ${q(S.protCivileApiKey)},
      codiceRegione:${q(S.protCivileRegione)},
      nomeComune:   ${q(S.protCivileComune || S.nomeComune)},
      urlRegione:   ${q(S.protCivileUrlRegione)},
      enabled:      ${!!S.protCivileEnabled},
    },
    meteo: {
      weeklyForecastUrl: ${q(S.meteoWeeklyUrl)},
      updateIntervalMin: ${S.meteoInterval},
      timeoutMs:         ${S.meteoTimeout},
    },
    rssSliders: ${JSON.stringify(S.rssSliders || [], null, 4)},
    header: {
      mostraNome:     true,
      stemmaUrl:   ${q(S.stemmaUrl)},
    },
    footer: {
      terminiUrl:     ${q(S.footerTerminiUrl || S.baseUrl + '/termini-e-condizioni-del-servizio')},
      terminiLabel:   ${q(S.footerTerminiLabel)},
      privacyUrl:     ${q(S.footerPrivacyUrl || S.baseUrl + '/privacy-policy')},
      privacyLabel:   ${q(S.footerPrivacyLabel)},
      copyrightText:  ${q(S.footerCopyrightText)},
      copyrightUrl:   ${q(S.footerCopyrightUrl)},
    },
    accessibilita: {
      abilitaDarkMode:    ${!!S.a11yDarkMode},
      abilitaContrasto:   ${!!S.a11yContrasto},
      abilitaFontScale:   ${!!S.a11yFontScale},
      maxFontScale:       ${S.a11yMaxFontScale},
      rispettaSistema:    ${!!S.a11yRispettaSistema},
    },
    spotlight: {
      widgetId: ${q(S.spotlightWidgetId)},
      durata:   ${S.spotlightDurata},
      forzaSempre: ${!!S.spotlightForzaSempre},
    },
    tabBar: {
      items: ${JSON.stringify(S.tabBarItems || [], null, 4)},
    },
    customWidget: ${customWidgetStr},
    widgets: ${JSON.stringify(S.widgets)},
    i18n: {
      defaultLang: "it",
      lingue: { it: "\uD83C\uDDEE\uD83C\uDDF9", en: "\uD83C\uDDEC\uD83C\uDDE7" },
      ui: {
        "ticker.title":        { it: "news dal Comune", en: "Municipal News" },
        "slide.cta":           { it: "Apri sezione", en: "Open section" },
        "banner.cta":          { it: "Apri", en: "Open" },
        "cie.badge":           { it: "INFO", en: "INFO" },
        "rd.title":            { it: "Raccolta differenziata", en: "Waste Collection" },
        "rd.sub":              { it: "Avvisi conferimenti", en: "Collection Notices" },
        "rd.today":            { it: "Oggi", en: "Today" },
        "rd.next3":            { it: "Prossimi 3 giorni", en: "Next 3 days" },
        "rd.info":             { it: "Info Raccolta", en: "Collection Info" },
        "rd.none":             { it: "Nessun conferimento", en: "No collection" },
        "rd.eco":              { it: "Eco-consiglio", en: "Eco-tip" },
        "meteo.title":         { it: "Meteo", en: "Weather" },
        "meteo.loading":       { it: "Caricamento...", en: "Loading..." },
        "meteo.current":       { it: "Situazione attuale", en: "Current conditions" },
        "meteo.details":       { it: "Clicca per i dettagli", en: "Tap for details" },
        "meteo.weekly":        { it: "Previsioni 7 giorni", en: "7-day forecast" },
        "meteo.error":         { it: "Impossibile caricare i dati", en: "Unable to load data" },
        "meteo.errorSub":      { it: "Verifica la connessione", en: "Check your connection" },
        "meteo.retry":         { it: "Riprova", en: "Retry" },
        "meteo.humidity":      { it: "Umidità", en: "Humidity" },
        "meteo.wind":          { it: "Vento", en: "Wind" },
        "meteo.rain":          { it: "Pioggia", en: "Rain" },
        "meteo.pressure":      { it: "Press.", en: "Press." },
        "w.0":  { it: "Sereno", en: "Clear" },
        "w.1":  { it: "Poco nuvoloso", en: "Mostly clear" },
        "w.2":  { it: "Parz. nuvoloso", en: "Partly cloudy" },
        "w.3":  { it: "Coperto", en: "Overcast" },
        "w.45": { it: "Nebbia", en: "Fog" },
        "w.48": { it: "Brina", en: "Rime fog" },
        "w.51": { it: "Pioviggine", en: "Light drizzle" },
        "w.53": { it: "Pioviggine", en: "Drizzle" },
        "w.55": { it: "Pioviggine", en: "Heavy drizzle" },
        "w.61": { it: "Pioggia debole", en: "Light rain" },
        "w.63": { it: "Pioggia", en: "Rain" },
        "w.65": { it: "Pioggia forte", en: "Heavy rain" },
        "w.71": { it: "Neve debole", en: "Light snow" },
        "w.73": { it: "Neve", en: "Snow" },
        "w.75": { it: "Neve forte", en: "Heavy snow" },
        "w.80": { it: "Rovesci", en: "Showers" },
        "w.82": { it: "Temporale", en: "Thunderstorm" },
        "w.95": { it: "Temporale", en: "Thunderstorm" },
        "w.96": { it: "Grandine", en: "Hail" },
        "w.99": { it: "Grandine forte", en: "Heavy hail" },
        "a11y.title":          { it: "Accessibilità", en: "Accessibility" },
        "a11y.dark":           { it: "Tema scuro", en: "Dark theme" },
        "a11y.contrast":       { it: "Alto contrasto", en: "High contrast" },
        "a11y.fontsize":       { it: "Dimensione testo", en: "Text size" },
        "a11y.reset":          { it: "Ripristina", en: "Reset" },
        "a11y.open":           { it: "Apri impostazioni accessibilità", en: "Open accessibility settings" },
        "a11y.close":          { it: "Chiudi impostazioni accessibilità", en: "Close accessibility settings" },
        "footer.termini":      { it: "Termini e condizioni del Servizio", en: "Terms of Service" },
        "footer.privacy":      { it: "Privacy Policy", en: "Privacy Policy" },
        "date.dayOfYear":      { it: "giorno dell'anno", en: "day of the year" },
      }
    },
  };`;
  }

  /* ============================================================
     BUILD FULL HTML DOCUMENT
     ============================================================ */
  function buildFullHTML(bp, gp, dbp, dgp, configScript, S) {
    const BASE = S.baseUrl.replace(/\/+$/, '');
    const terminiUrl = S.footerTerminiUrl || BASE + '/termini-e-condizioni-del-servizio';
    const privacyUrl = S.footerPrivacyUrl || BASE + '/privacy-policy';

    return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
  <title>Home – ${esc(S.nomeComune)} – Comune.Digital</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Titillium+Web:wght@300;400;600;700&display=swap" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" rel="stylesheet">
  <style>
${buildCSS(bp, gp, dbp, dgp)}
  </style>
</head>
<body>
<script>
${configScript}
</script>

<a href="#mainContent" class="skip-link">Vai al contenuto principale</a>
<div id="a11yLive" class="a11y-live" role="status" aria-live="polite" aria-atomic="true"></div>

<nav class="a11y-bar" aria-label="Strumenti di accessibilità">
  <div class="a11y-panel" id="a11yPanel" role="region" aria-label="Impostazioni accessibilità">
    <div class="a11y-panel-title">Accessibilità</div>
    <div class="a11y-row" id="a11yRowDark"><span class="a11y-row-label">Tema scuro</span><button class="a11y-btn" id="a11yDark" aria-pressed="false" aria-label="Attiva tema scuro" title="Tema scuro"><i class="fa-solid fa-moon a11y-btn-icon"></i></button></div>
    <div class="a11y-row" id="a11yRowContrast"><span class="a11y-row-label">Alto contrasto</span><button class="a11y-btn" id="a11yContrast" aria-pressed="false" aria-label="Attiva alto contrasto" title="Alto contrasto"><i class="fa-solid fa-circle-half-stroke a11y-btn-icon"></i></button></div>
    <div class="a11y-row" id="a11yRowFont"><span class="a11y-row-label">Dimensione testo</span><div class="a11y-fontsize-group"><button class="a11y-btn" id="a11yFontDown" aria-label="Riduci dimensione testo" title="Testo più piccolo">A-</button><span class="a11y-fontsize-val" id="a11yFontVal" aria-live="polite">0</span><button class="a11y-btn" id="a11yFontUp" aria-label="Aumenta dimensione testo" title="Testo più grande">A+</button></div></div>
    <div class="a11y-row" style="margin-top:4px;border-top:1px solid var(--a11y-bar-border);padding-top:8px"><button class="a11y-btn" id="a11yReset" aria-label="Ripristina impostazioni predefinite" title="Ripristina tutto" style="width:100%;justify-content:center;gap:6px"><i class="fa-solid fa-rotate-left a11y-btn-icon"></i> Ripristina</button></div>
  </div>
  <button class="a11y-fab" id="a11yFab" aria-expanded="false" aria-controls="a11yPanel" aria-label="Apri impostazioni accessibilità" title="Accessibilità"><i class="fa-solid fa-universal-access"></i></button>
</nav>

<header class="w-main-header" id="mainHeader" aria-label="Intestazione">
  <div class="main-header-inner">
    <span class="main-header-name" id="headerName">${esc(S.nomeComune)}</span>
    <button class="lang-toggle" id="langToggle" aria-label="Switch language">🇬🇧</button>
  </div>
</header>

<div class="home-wrapper" id="mainContent" role="main">
  <div id="widgetMount"></div>
</div>

<div id="footerMount"></div>
<div id="tabBarMount"></div>

<script src="https://widget.rss.app/v1/ticker.js" type="text/javascript" async></script>
<div id="dpcScriptMount"></div>

<script>
${buildJS()}
</script>

</body>
</html>`;
  }

  /* ============================================================
     BUILD CSS (complete, from Cammarata template)
     ============================================================ */
  function buildCSS(bp, gp, dbp, dgp) {
    const hexRgb = (h) => { const n = parseInt(h.replace('#',''),16); return ((n>>16)&255)+','+((n>>8)&255)+','+(n&255); };
    const bluRgb = hexRgb(bp['700']);
    const bluDarkRgb = hexRgb(bp['900']);
    const bluHoverRgb = hexRgb(bp['500']);
    const verdeRgb = hexRgb(gp['700']);
    return `:root {
  --cd-blue-900: ${bp['900']}; --cd-blue-700: ${bp['700']}; --cd-blue-500: ${bp['500']}; --cd-blue-300: ${bp['300']}; --cd-blue-100: ${bp['100']};
  --cd-green-900: ${gp['900']}; --cd-green-700: ${gp['700']}; --cd-green-500: ${gp['500']}; --cd-green-300: ${gp['300']}; --cd-green-100: ${gp['100']};
  --blu-rgb: ${bluRgb}; --blu-dark-rgb: ${bluDarkRgb}; --blu-hover-rgb: ${bluHoverRgb}; --verde-rgb: ${verdeRgb};
  --cd-gray-900: #1E1E1E; --cd-gray-700: #4A4A4A; --cd-gray-500: #9B9B9B; --cd-gray-300: #D9D9D9; --cd-gray-100: #F5F5F5;
  --cd-yellow: #FFCC00; --cd-red: #D32F2F; --cd-info: #0288D1;
  --blu: var(--cd-blue-700); --blu-dark: var(--cd-blue-900); --blu-hover: var(--cd-blue-500);
  --verde: var(--cd-green-700); --verde-soft: var(--cd-green-300); --verde-100: var(--cd-green-100);
  --white: #FFFFFF; --ink: var(--cd-gray-900); --ink-sub: var(--cd-gray-700); --page-bg: var(--cd-gray-100);
  --fs-xs:clamp(11px,2.8vw,13px);--fs-sm:clamp(12px,3.0vw,14px);--fs-base:clamp(13px,3.3vw,15px);
  --fs-md:clamp(14px,3.5vw,16px);--fs-lg:clamp(15px,3.8vw,18px);--fs-xl:clamp(17px,4.2vw,20px);--fs-2xl:clamp(20px,5vw,26px);
  --shadow-sm:0 2px 8px rgba(10,24,40,.10);--shadow-md:0 10px 24px rgba(10,24,40,.18);
  --shadow-lg:0 10px 28px rgba(var(--blu-rgb),.12),0 4px 18px rgba(0,0,0,.08);
  --radius:18px;--radius-sm:12px;
  --glass-bg:rgba(255,255,255,0.75);--glass-border:rgba(255,255,255,0.6);--glass-blur:blur(26px) saturate(200%);
  --a11y-bar-bg:rgba(255,255,255,.92);--a11y-bar-border:rgba(0,0,0,.12);
  --a11y-btn-bg:rgba(var(--blu-rgb),.08);--a11y-btn-active:var(--blu);--a11y-btn-color:var(--blu-dark);
}
[data-theme="dark"]{
  --cd-blue-900:${dbp['900']};--cd-blue-700:${dbp['700']};--cd-blue-500:${dbp['500']};--cd-blue-300:${dbp['300']};--cd-blue-100:${dbp['100']};
  --cd-green-900:${dgp['900']};--cd-green-700:${dgp['700']};--cd-green-500:${dgp['500']};--cd-green-300:${dgp['300']};--cd-green-100:${dgp['100']};
  --blu-rgb:${hexRgb(dbp['700'])};--blu-dark-rgb:${hexRgb(dbp['900'])};--blu-hover-rgb:${hexRgb(dbp['500'])};--verde-rgb:${hexRgb(dgp['700'])};
  --cd-gray-900:#E8E8E8;--cd-gray-700:#B0B0B0;--cd-gray-500:#707070;--cd-gray-300:#383838;--cd-gray-100:#1A1A1A;
  --white:#1E1E1E;--ink:#E8E8E8;--ink-sub:#B0B0B0;--page-bg:#121212;
  --shadow-sm:0 2px 8px rgba(0,0,0,.30);--shadow-md:0 10px 24px rgba(0,0,0,.40);--shadow-lg:0 10px 28px rgba(0,0,0,.35),0 4px 18px rgba(0,0,0,.20);
  --glass-bg:rgba(30,30,30,0.82);--glass-border:rgba(255,255,255,0.08);--glass-blur:blur(26px) saturate(150%);
  --a11y-bar-bg:rgba(30,30,30,.94);--a11y-bar-border:rgba(255,255,255,.12);--a11y-btn-bg:rgba(255,255,255,.08);--a11y-btn-color:#B0C8E0;
}
[data-theme="dark"] body{background:#121212;}
[data-theme="dark"] .w-main-header{background:linear-gradient(180deg,${dbp['900']} 0%,#061E32 100%);}
[data-theme="dark"] .w-footer{background:#061E32;}
[data-theme="dark"] .w-date-header{background:linear-gradient(135deg,rgba(30,30,30,.92),rgba(25,25,25,.88));}
[data-theme="dark"] .w-date-header .day-label,[data-theme="dark"] .w-date-header .day-sub{color:#E0E0E0;}
[data-theme="dark"] .w-date-header .day-icon{color:#7AB8E8;}
[data-theme="dark"] .w-date-header .weather-temp{color:#E0E0E0;}
[data-theme="dark"] .slide-textbox{background:rgba(10,30,50,0.35);border-color:rgba(255,255,255,0.20);}
[data-theme="dark"] .svc-card{background:rgba(40,40,40,.75);border-color:rgba(255,255,255,.08);}
[data-theme="dark"] .svc-link:hover .svc-card{background:rgba(55,55,55,.90);}
[data-theme="dark"] .svc-label-it{color:#E0E0E0;}[data-theme="dark"] .svc-label-en{color:#A0A0A0;}
[data-theme="dark"] .svc-icon-box{background:linear-gradient(180deg,${dbp['500']} 0%,${dbp['700']} 100%);}
[data-theme="dark"] .svc-title-it{color:#7AB8E8;}[data-theme="dark"] .svc-title-en{color:#6A98C0;}
[data-theme="dark"] .banner-link-card{background:linear-gradient(90deg,${dbp['900']} 0%,#1A5A8A 100%);}
[data-theme="dark"] .w-banner-cie{background:linear-gradient(180deg,rgba(15,50,80,.96),rgba(10,35,55,.96));}
[data-contrast="high"]{--ink:#000;--ink-sub:#000;--page-bg:#FFF;--glass-bg:rgba(255,255,255,1);--glass-border:#000;}
[data-contrast="high"] .svc-card{border:2px solid #000!important;background:#fff!important;}
[data-contrast="high"] .svc-label-it{color:#000!important;}[data-contrast="high"] .svc-label-en{color:#333!important;}
[data-contrast="high"] .svc-title-it{color:#000!important;}
[data-contrast="high"] .rd-card,[data-contrast="high"] .meteo-card{border:2px solid #000!important;background:#fff!important;}
[data-contrast="high"] .rd-chip,[data-contrast="high"] .m-chip{border:2px solid #000!important;color:#000!important;font-weight:700!important;}
[data-contrast="high"] .rd-title,[data-contrast="high"] .meteo-title{color:#000!important;}
[data-contrast="high"] .rd-accordion,[data-contrast="high"] .meteo-acc{border:2px solid #000!important;}
[data-contrast="high"] .banner-link-card{border:2px solid #fff!important;}
[data-contrast="high"] .w-banner-cie{border:2px solid #fff!important;}
[data-contrast="high"] .cie-title,[data-contrast="high"] .cie-subtitle{color:#fff!important;font-weight:700!important;}
[data-contrast="high"] .eco-tip{border:2px solid #000!important;color:#000!important;}
[data-contrast="high"] .current-date,[data-contrast="high"] .special-event{text-shadow:none!important;}
[data-contrast="high"] a:focus-visible,[data-contrast="high"] button:focus-visible,[data-contrast="high"] [tabindex]:focus-visible{outline:3px solid #FFCC00!important;outline-offset:2px!important;}
[data-theme="dark"][data-contrast="high"]{--ink:#FFF;--ink-sub:#FFF;--page-bg:#000;--glass-bg:rgba(0,0,0,1);--glass-border:#FFF;}
[data-theme="dark"][data-contrast="high"] body{background:#000;}
[data-theme="dark"][data-contrast="high"] .svc-card{border:2px solid #fff!important;background:#000!important;}
[data-theme="dark"][data-contrast="high"] .svc-label-it{color:#fff!important;}
[data-theme="dark"][data-contrast="high"] .rd-card,[data-theme="dark"][data-contrast="high"] .meteo-card{border:2px solid #fff!important;background:#000!important;}
[data-theme="dark"][data-contrast="high"] .rd-chip,[data-theme="dark"][data-contrast="high"] .m-chip{border:2px solid #fff!important;color:#fff!important;}
[data-theme="dark"][data-contrast="high"] .rd-title,[data-theme="dark"][data-contrast="high"] .meteo-title{color:#fff!important;}
[data-theme="dark"][data-contrast="high"] .rd-accordion,[data-theme="dark"][data-contrast="high"] .meteo-acc{border:2px solid #fff!important;}
[data-theme="dark"][data-contrast="high"] .eco-tip{border:2px solid #fff!important;color:#fff!important;}
[data-fontscale="1"]{--fs-xs:clamp(13px,3.2vw,15px);--fs-sm:clamp(14px,3.5vw,16px);--fs-base:clamp(15px,3.8vw,17px);--fs-md:clamp(16px,4.0vw,18px);--fs-lg:clamp(17px,4.4vw,21px);--fs-xl:clamp(20px,4.8vw,23px);--fs-2xl:clamp(23px,5.8vw,30px);}
[data-fontscale="2"]{--fs-xs:clamp(14px,3.6vw,17px);--fs-sm:clamp(16px,3.9vw,18px);--fs-base:clamp(17px,4.3vw,20px);--fs-md:clamp(18px,4.6vw,21px);--fs-lg:clamp(20px,4.9vw,23px);--fs-xl:clamp(22px,5.5vw,26px);--fs-2xl:clamp(26px,6.5vw,34px);}
[data-fontscale="3"]{--fs-xs:clamp(16px,4.1vw,19px);--fs-sm:clamp(17px,4.4vw,20px);--fs-base:clamp(19px,4.8vw,22px);--fs-md:clamp(20px,5.1vw,23px);--fs-lg:clamp(22px,5.5vw,26px);--fs-xl:clamp(25px,6.1vw,29px);--fs-2xl:clamp(29px,7.3vw,38px);}
[data-fontscale="4"]{--fs-xs:clamp(18px,4.5vw,21px);--fs-sm:clamp(19px,4.8vw,22px);--fs-base:clamp(21px,5.3vw,24px);--fs-md:clamp(22px,5.6vw,26px);--fs-lg:clamp(24px,6.1vw,29px);--fs-xl:clamp(27px,6.7vw,32px);--fs-2xl:clamp(32px,8.0vw,42px);}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
html{-webkit-text-size-adjust:100%!important;text-size-adjust:100%!important;font-size:16px!important;scroll-behavior:smooth;touch-action:pan-x pan-y;-ms-touch-action:pan-x pan-y;}
body{font-family:'Titillium Web',system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:var(--page-bg);color:var(--ink);line-height:1.45;overflow-x:hidden;-webkit-font-smoothing:antialiased;}
.home-wrapper{width:100%;max-width:640px;margin:0 auto;display:flex;flex-direction:column;gap:0;}
.home-wrapper>*{flex-shrink:0;flex-grow:0;}
.w-main-header{background:linear-gradient(180deg,var(--blu) 0%,var(--blu-dark) 100%),conic-gradient(from -20deg at 30% 0%,rgba(255,255,255,.45),rgba(255,255,255,0) 30%,rgba(255,255,255,.25) 60%,rgba(255,255,255,0) 85%,rgba(255,255,255,.45));color:#fff;padding-top:36px;padding-bottom:clamp(4px,1vw,8px);padding-left:0;padding-right:clamp(8px,2.5vw,14px);text-align:left!important;position:relative;z-index:101;}
.ios-device .w-main-header{padding-top:72px;}
.main-header-inner{display:flex;align-items:center;gap:0;}
.main-header-stemma{height:clamp(52px,14vw,72px);width:auto;flex-shrink:0;filter:drop-shadow(0 2px 6px rgba(0,0,0,.35));align-self:center;margin-bottom:-8px;}
.main-header-name{flex:1;min-width:0;font-weight:700;font-size:clamp(28px,8vw,42px);letter-spacing:.5px;text-shadow:0 1px 0 rgba(0,0,0,.35),0 6px 12px rgba(0,0,0,.25);line-height:1.1;white-space:nowrap;overflow:hidden;text-align:left!important;}
.lang-toggle{flex-shrink:0;align-self:center;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.30);border-radius:8px;padding:4px 14px;font-size:22px;line-height:1;cursor:pointer;color:#fff;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:background .15s ease,transform .15s ease;-webkit-tap-highlight-color:transparent;min-width:44px;min-height:32px;display:flex;align-items:center;justify-content:center;}
.lang-toggle:active{transform:scale(.92);}
.w-footer{background:var(--blu-dark);padding:clamp(12px,3vw,18px);padding-bottom:max(env(safe-area-inset-bottom,0px),clamp(12px,3vw,18px));text-align:center;}
.footer-inner{max-width:640px;margin:0 auto;display:flex;flex-direction:column;align-items:center;gap:8px;}
.footer-links{display:flex;flex-wrap:wrap;justify-content:center;gap:6px 16px;}
.footer-links a{color:rgba(255,255,255,.80);text-decoration:none;font-size:var(--fs-xs);font-weight:600;transition:color .15s ease;}
.footer-links a:hover{color:#fff;text-decoration:underline;}
.footer-copy{font-size:var(--fs-xs);color:rgba(255,255,255,.50);font-weight:400;padding-top:4px;}
.footer-copy a{color:rgba(255,255,255,.65);text-decoration:none;font-weight:600;transition:color .15s ease;}
.footer-copy a:hover{color:#fff;text-decoration:underline;}
.w-date-header{position:relative;top:0;z-index:100;padding:clamp(8px,2vw,12px) 0;background:linear-gradient(180deg,var(--blu-hover) 2%,var(--blu) 55%,var(--blu-dark) 100%),conic-gradient(from -20deg at 30% 0%,rgba(255,255,255,.55),rgba(255,255,255,0) 30%,rgba(255,255,255,.35) 60%,rgba(255,255,255,0) 85%,rgba(255,255,255,.55)),radial-gradient(900px 300px at 50% 15%,rgba(255,255,255,.20),rgba(255,255,255,0) 60%);border-bottom:1px solid rgba(16,59,96,.55);box-shadow:var(--shadow-md),inset 0 10px 18px rgba(16,59,96,.45),inset 0 -10px 16px rgba(255,255,255,.12);-webkit-backdrop-filter:blur(8px) saturate(160%);backdrop-filter:blur(8px) saturate(160%);overflow:hidden;}
.w-date-header::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:3px;pointer-events:none;background:linear-gradient(90deg,rgba(60,164,52,0),rgba(60,164,52,.65),rgba(60,164,52,0));filter:blur(.2px);}
.date-header-inner{max-width:640px;margin:0 auto;padding:0 clamp(10px,3vw,16px);display:flex;justify-content:space-between;align-items:center;gap:10px;}
.date-left{display:flex;align-items:center;gap:10px;color:#fff;min-width:0;}
.date-ico{width:clamp(26px,7vw,32px);height:clamp(26px,7vw,32px);border-radius:10px;display:grid;place-items:center;flex-shrink:0;background:linear-gradient(180deg,var(--blu-hover) 2%,var(--blu) 55%,var(--blu-dark) 100%);outline:1px solid rgba(16,59,96,.55);box-shadow:inset 0 10px 18px rgba(16,59,96,.45),inset 0 -10px 16px rgba(255,255,255,.12);}
.date-ico i{font-size:var(--fs-sm);color:#fff;}
.date-text{min-width:0;}
.current-date{font-size:var(--fs-md);font-weight:700;color:#fff;display:block;line-height:1.1;text-shadow:0 1px 0 rgba(0,0,0,.45),0 8px 14px rgba(0,0,0,.30);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.special-event{font-size:var(--fs-sm);color:#f3f8ff;font-weight:400;display:block;line-height:1.15;opacity:.98;text-shadow:0 1px 0 rgba(0,0,0,.35);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.weather-box{display:flex;align-items:center;gap:6px;color:#fff;font-weight:800;flex-shrink:0;}
.weather-icon{font-size:var(--fs-lg);line-height:1;}
.temperature{font-size:var(--fs-md);}
.w-ticker{background:transparent;}
.ticker-header{position:relative;color:#fff;padding:clamp(5px,1.2vw,7px) clamp(10px,3vw,14px);font-weight:700;font-size:var(--fs-sm);display:flex;align-items:center;gap:10px;background:linear-gradient(180deg,var(--blu-hover) 8%,var(--blu) 58%,var(--blu-dark) 100%),conic-gradient(from -20deg at 25% 0%,rgba(255,255,255,.55),rgba(255,255,255,0) 30%,rgba(255,255,255,.35) 60%,rgba(255,255,255,0) 85%,rgba(255,255,255,.55));border-bottom:1px solid rgba(16,59,96,.45);box-shadow:var(--shadow-md),inset 0 10px 18px rgba(16,59,96,.42),inset 0 -10px 16px rgba(255,255,255,.10);overflow:hidden;}
.ticker-header a{color:#fff;text-decoration:none;display:flex;align-items:center;gap:10px;width:100%;}
.ticker-header .news-ico{width:clamp(24px,6vw,28px);height:clamp(24px,6vw,28px);border-radius:9px;display:grid;place-items:center;flex-shrink:0;font-size:var(--fs-sm);background:linear-gradient(180deg,var(--blu-hover) 8%,var(--blu) 58%,var(--blu-dark) 100%);outline:1px solid rgba(16,59,96,.55);box-shadow:inset 0 10px 18px rgba(16,59,96,.42),inset 0 -10px 16px rgba(255,255,255,.10);}
.ticker-header .header-title{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 0 rgba(0,0,0,.35),0 8px 14px rgba(0,0,0,.28);}
.ticker-header .arrow-link{margin-left:8px;font-size:var(--fs-xs);display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border:1px solid rgba(255,255,255,.75);border-radius:50%;line-height:1;}
.ticker-strip{padding:2px 10px 3px;border-top:1px solid #eaeaea;min-height:30px;overflow:hidden;display:flex;align-items:flex-start;background:#fff;}
rssapp-ticker{display:block!important;width:100%!important;min-height:32px!important;overflow:hidden!important;padding-top:2px!important;}
rssapp-ticker,rssapp-ticker *,rssapp-ticker div,rssapp-ticker span,rssapp-ticker a{height:auto!important;max-height:none!important;line-height:1.6!important;font-size:var(--fs-sm)!important;vertical-align:top!important;padding-top:0!important;padding-bottom:2px!important;margin-top:0!important;margin-bottom:0!important;overflow:hidden!important;white-space:nowrap!important;font-family:'Titillium Web',sans-serif!important;}
rssapp-ticker a{margin-right:50px!important;display:inline-block!important;color:var(--blu)!important;text-decoration:none!important;}
@media(hover:hover){rssapp-ticker a:hover{text-decoration:underline!important;}}
.w-slideshow{position:relative;width:100%;overflow:hidden;isolation:isolate;background:var(--blu);height:clamp(220px,56vw,300px);}
.slide{position:absolute;inset:0;opacity:0;transition:opacity .6s ease-in-out;pointer-events:none;}
.slide.active{opacity:1;pointer-events:auto;}
.slide::before{content:"";position:absolute;inset:0;background-image:var(--bg-image);background-size:cover;background-position:center;background-repeat:no-repeat;transform:scale(1.05);transition:transform 1.2s ease-out,opacity .6s ease-in-out;}
.slide.active::before{transform:scale(1);}
.slide.error::before{background-image:none!important;background-color:var(--blu);}
.slide::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.05) 0%,rgba(0,0,0,.15) 35%,rgba(0,0,0,.55) 75%,rgba(0,0,0,.70) 100%);}
.slide-content{position:absolute;left:1rem;right:1rem;bottom:5rem;color:#fff;z-index:2;max-width:960px;}
.slide-textbox{display:inline-block;background:rgba(var(--blu-rgb),0.10);border:1px solid rgba(255,255,255,0.35);border-radius:16px;padding:clamp(.6rem,2vw,.75rem) clamp(.75rem,2.5vw,1rem);backdrop-filter:blur(8px);box-shadow:var(--shadow-md);}
.slide-title{font-weight:700;letter-spacing:.2px;color:#fff;font-size:clamp(1.25rem,5vw,2rem);line-height:1.15;}
.slide-subtitle{margin-top:.2rem;font-weight:300;color:#fff;opacity:.95;font-size:clamp(.85rem,3.2vw,1.1rem);}
.slide-cta{position:absolute;left:1rem;bottom:clamp(.8rem,2.5vw,1.2rem);z-index:3;}
.slide-cta a{display:inline-flex;align-items:center;gap:.5rem;background:var(--blu-dark);color:#fff;text-decoration:none;font-weight:700;font-size:var(--fs-base);padding:clamp(.55rem,1.8vw,.7rem) clamp(.75rem,2.5vw,1rem);border-radius:999px;box-shadow:var(--shadow-md);transition:background .15s ease,transform .15s ease;}
.slide-cta a:hover{background:var(--blu-hover);transform:translateY(-1px);}
.slide-cta a:active{transform:translateY(0) scale(.98);}
.slide-cta a.disabled{opacity:.6;pointer-events:none;}
.slide-nav{position:absolute;inset:0;display:none;}
.slide-arrow{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;display:grid;place-items:center;border:none;border-radius:50%;color:#fff;background:rgba(255,255,255,.22);backdrop-filter:blur(8px);box-shadow:var(--shadow-md);cursor:pointer;z-index:4;transition:background .15s ease;}
.slide-arrow:hover{background:rgba(255,255,255,.3);}
.slide-arrow.prev{left:14px;}.slide-arrow.next{right:14px;}
.slide-indicators{position:absolute;left:50%;transform:translateX(-50%);bottom:clamp(.8rem,2.5vw,1.2rem);display:flex;gap:.5rem;z-index:3;}
.slide-dot{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.55);border:2px solid transparent;cursor:pointer;transition:transform .15s ease,background .15s ease;position:relative;}
.slide-dot.active{background:#fff;transform:scale(1.2);}
.slide-dot::after{content:attr(data-title);position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);background:rgba(0,0,0,.85);color:#fff;padding:.4rem .6rem;border-radius:6px;font-size:var(--fs-xs);font-weight:600;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .2s ease;}
.slide-dot:hover::after{opacity:1;}
@media(prefers-reduced-motion:reduce){.slide,.slide::before{transition:none!important;}.slide::before{transform:scale(1)!important;}}
@media(min-width:769px){.w-slideshow{height:280px!important;}.slide-nav{display:block;}.slide-content{left:2rem;right:2rem;bottom:4.5rem;}.slide-cta{left:2rem;bottom:1rem;}.slide-indicators{bottom:1rem;}}
.w-services{padding:clamp(14px,4vw,20px);background:var(--glass-bg);backdrop-filter:var(--glass-blur);-webkit-backdrop-filter:var(--glass-blur);border:1px solid var(--glass-border);border-radius:0;box-shadow:var(--shadow-sm),inset 0 2px 2px rgba(255,255,255,0.7);}
.svc-section{margin-bottom:clamp(22px,5vw,30px);}.svc-section:first-child{padding-top:clamp(4px,1.5vw,8px);}.svc-section:last-child{margin-bottom:0;}
.svc-section-hdr{margin-bottom:clamp(12px,3vw,18px);padding-left:8px;}
.svc-title-it{font-weight:700;font-size:var(--fs-xl);color:var(--blu);line-height:1.1;display:flex;align-items:center;gap:12px;}
.svc-title-it::before{content:'';display:block;width:7px;height:clamp(22px,5.5vw,28px);background:linear-gradient(180deg,var(--blu),var(--blu-hover));border-radius:10px;box-shadow:0 4px 12px rgba(var(--blu-rgb),.35);}
.svc-title-en{font-weight:400;font-size:var(--fs-xs);color:var(--blu-hover);margin-left:16px;opacity:.85;letter-spacing:.4px;margin-top:3px;}
.svc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(14px,4vw,20px);max-width:340px;margin:0 auto;}
.svc-link{text-decoration:none;color:inherit;display:block;outline:none;perspective:1000px;}
.svc-card{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;aspect-ratio:1/1;padding:clamp(6px,2vw,10px);background:rgba(255,255,255,.70);border:1px solid rgba(255,255,255,.75);border-radius:clamp(20px,5.5vw,26px);box-shadow:0 8px 18px rgba(14,59,96,.18),0 3px 6px rgba(0,0,0,.08),inset 0 1px 0 rgba(255,255,255,.5);transition:all 0.3s cubic-bezier(0.34,1.56,0.64,1);overflow:hidden;}
.svc-link:hover .svc-card{background:rgba(255,255,255,.95);transform:translateY(-3px) scale(1.04);box-shadow:0 14px 30px rgba(var(--blu-rgb),.22),0 4px 8px rgba(0,0,0,.08);}
.svc-link:active .svc-card{transform:scale(0.95);transition-duration:.1s;}
.svc-icon-box{width:clamp(38px,10vw,48px);height:clamp(38px,10vw,48px);margin-bottom:clamp(5px,1.5vw,8px);border-radius:clamp(12px,3vw,15px);display:flex;align-items:center;justify-content:center;font-size:clamp(17px,4.8vw,23px);color:#fff;background:linear-gradient(180deg,var(--blu-hover) 0%,var(--blu) 100%);box-shadow:0 6px 14px rgba(var(--blu-rgb),.3),inset 0 1.5px 0 rgba(255,255,255,.4);transition:transform .4s ease;}
.svc-link:hover .svc-icon-box{transform:rotate(-6deg) scale(1.10);}
.svc-icon-box i{filter:drop-shadow(0 2px 3px rgba(0,0,0,.25));}
.svc-label-it{font-size:clamp(11px,3vw,13px);font-weight:700;color:var(--blu-dark);line-height:1.15;width:100%;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;}
.svc-label-en{font-size:var(--fs-xs);font-weight:600;color:var(--ink-sub);line-height:1.1;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.9;}
.svc-ripple{position:absolute;border-radius:50%;transform:scale(0);background:rgba(var(--verde-rgb),.25);pointer-events:none;animation:svcRipple .55s linear;}
@keyframes svcRipple{to{transform:scale(3.5);opacity:0;}}
.w-banner-custom{width:100%;padding-bottom:10px;background:var(--blu);}
.bc-container{position:relative;width:100%;overflow:hidden;box-shadow:var(--shadow-md);min-height:clamp(110px,26vw,170px);isolation:isolate;background:#fff;border:1px solid rgba(0,0,0,.06);}
.bc-slide{position:absolute;inset:0;opacity:0;visibility:hidden;transition:opacity .5s ease,visibility .5s ease;display:grid;place-items:center start;}
.bc-slide.active{opacity:1;visibility:visible;}
.bc-slide::before{content:"";position:absolute;inset:0;background-image:var(--bg-image,none);background-size:cover;background-position:center;opacity:.05;z-index:0;pointer-events:none;filter:grayscale(100%);}
.bc-slide:has(.bc-slide-img-only)::before{display:none;}
.bc-slide-img-only{display:block;width:100%;height:100%;position:absolute;inset:0;padding:0!important;}
.bc-slide-img-only img{width:100%;height:100%;object-fit:cover;display:block;}
.bc-slide-link{z-index:1;color:var(--blu);text-decoration:none;display:flex;align-items:center;justify-content:space-between;gap:.8rem;padding:clamp(12px,3vw,20px) clamp(14px,4vw,24px);width:100%;height:100%;}
.bc-text-wrap{display:flex;align-items:flex-start;min-width:0;flex:1 1 auto;}
.bc-title-group{display:flex;flex-direction:column;gap:.25rem;min-width:0;}
.bc-kicker{display:inline-flex;align-items:center;gap:.4rem;font-weight:700;font-size:clamp(.7rem,2.5vw,.85rem);text-transform:uppercase;letter-spacing:.03em;color:var(--blu);background:rgba(var(--blu-rgb),.08);border:1px solid rgba(var(--blu-rgb),.15);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);padding:.25rem .6rem;border-radius:999px;line-height:1;max-width:100%;word-break:break-word;box-shadow:0 2px 10px rgba(var(--blu-rgb),.05);}
.bc-kicker i{font-size:.9em;}
.bc-title{margin:.2rem 0 0;font-weight:700;font-size:clamp(1.1rem,4.2vw,1.35rem);line-height:1.15;color:var(--blu);text-shadow:0 2px 4px rgba(var(--blu-rgb),.15);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;}

.bc-cta{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;padding:.6rem;border-radius:50%;background:linear-gradient(135deg,var(--blu) 0%,var(--blu-dark) 100%);color:#fff;border:none;box-shadow:0 4px 12px rgba(var(--blu-rgb),.3);transition:transform .2s ease,box-shadow .2s ease;flex:0 0 auto;}
.bc-cta:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(var(--blu-rgb),.4);}
.bc-cta-label{display:none;font-weight:700;font-size:.9rem;}
.bc-dots{position:absolute;left:50%;transform:translateX(-50%);bottom:10px;display:flex;gap:8px;z-index:2;padding:4px 8px;background:rgba(255,255,255,.6);border:1px solid rgba(var(--blu-rgb),.1);border-radius:999px;backdrop-filter:blur(4px);}
.bc-dot{width:8px;height:8px;min-width:8px;flex-shrink:0;border-radius:50%;background:rgba(var(--blu-rgb),.25);border:0;cursor:pointer;transition:all .25s cubic-bezier(.25,1,.5,1);padding:0;}
.bc-dot:hover{background:rgba(var(--blu-rgb),.6);}
.bc-dot.active{transform:scale(1.3);background:var(--blu);box-shadow:0 2px 6px rgba(var(--blu-rgb),.4);}
@media(min-width:768px){.bc-cta{width:auto;height:auto;border-radius:999px;padding:.5rem 1.2rem;}.bc-cta-label{display:inline;}.bc-title{font-size:1.5rem;}}
@media(prefers-reduced-motion:reduce){.bc-slide,.bc-cta,.bc-dot{transition:none;}}
[data-theme="dark"] .bc-container{background:var(--cd-blue-100);border-color:rgba(255,255,255,.08);}
[data-theme="dark"] .bc-slide-link{color:var(--cd-blue-700);}
[data-theme="dark"] .bc-kicker{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.15);color:var(--cd-blue-500);}
[data-theme="dark"] .bc-title{color:var(--cd-blue-500);text-shadow:none;}

[data-theme="dark"] .bc-dots{background:rgba(30,30,30,.6);border-color:rgba(255,255,255,.1);}
.w-banner-cie{width:100%;max-width:900px;margin:0 auto;background:linear-gradient(180deg,rgba(var(--blu-rgb),.96),rgba(var(--blu-dark-rgb),.96));border:1px solid rgba(255,255,255,.12);box-shadow:var(--shadow-md);position:relative;overflow:hidden;}
.w-banner-cie::before{content:"";position:absolute;inset:-2px;background:radial-gradient(900px 220px at 18% 0%,rgba(255,255,255,.22),transparent 55%),radial-gradient(780px 220px at 92% 30%,rgba(255,255,255,.10),transparent 60%),radial-gradient(520px 260px at 40% 140%,rgba(var(--verde-rgb),.14),transparent 65%);pointer-events:none;mix-blend-mode:overlay;}
.cie-link{position:relative;display:flex;align-items:center;gap:clamp(8px,2.5vw,12px);padding:clamp(10px,2.5vw,14px);color:#fff;text-decoration:none;min-height:clamp(62px,16vw,80px);}
.cie-ico{flex:0 0 auto;width:clamp(36px,9vw,42px);height:clamp(36px,9vw,42px);display:grid;place-items:center;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.14);box-shadow:0 8px 18px rgba(0,0,0,.16);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}
.cie-ico i{font-size:var(--fs-lg);color:#fff;filter:drop-shadow(0 6px 12px rgba(0,0,0,.22));}
.cie-txt{min-width:0;flex:1;line-height:1.08;}
.cie-title{margin:0;font-weight:700;font-size:var(--fs-md);letter-spacing:.2px;opacity:.95;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;}
.cie-subtitle{margin:clamp(2px,.8vw,4px) 0 0;font-weight:700;font-size:var(--fs-md);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}
.cie-info-wrap{position:relative;flex:0 0 auto;width:clamp(56px,14vw,70px);height:clamp(36px,10vw,44px);display:flex;align-items:flex-start;justify-content:flex-end;}
.cie-badge{position:relative;z-index:2;font-size:var(--fs-xs);font-weight:700;letter-spacing:.4px;color:#0b2234;background:linear-gradient(180deg,var(--verde-soft),rgba(var(--verde-rgb),.85));padding:clamp(5px,1.4vw,7px) clamp(8px,2vw,10px);border-radius:999px;border:1px solid rgba(255,255,255,.35);box-shadow:0 10px 18px rgba(0,0,0,.20);line-height:1;}
.cie-finger{position:absolute;right:clamp(0px,.5vw,2px);top:clamp(14px,4vw,18px);z-index:1;color:rgba(255,255,255,.95);filter:drop-shadow(0 8px 14px rgba(0,0,0,.30));animation:fingerTap 1.25s ease-in-out infinite;pointer-events:none;}
.cie-finger i{font-size:var(--fs-lg);}
.cie-ring{position:absolute;right:clamp(10px,2.8vw,14px);top:clamp(6px,1.8vw,9px);width:clamp(10px,2.6vw,12px);height:clamp(10px,2.6vw,12px);border:2px solid rgba(255,255,255,.55);border-radius:999px;opacity:0;animation:cieRing 1.25s ease-in-out infinite;pointer-events:none;z-index:0;}
@keyframes fingerTap{0%{transform:translate(0,0) scale(1);}40%{transform:translate(-2px,-4px) scale(1.05);}55%{transform:translate(-1px,-2px) scale(.98);}100%{transform:translate(0,0) scale(1);}}
@keyframes cieRing{0%{opacity:0;transform:scale(.7);}45%{opacity:.65;transform:scale(1);}100%{opacity:0;transform:scale(1.35);}}
.w-raccolta-wrapper{padding:clamp(8px,2.5vw,14px) clamp(8px,2.5vw,12px);background:var(--blu-dark);}
.w-raccolta-wrapper .rd-card{position:relative;border-radius:var(--radius);padding:clamp(12px,3vw,16px);background:linear-gradient(135deg,rgba(255,255,255,.86),rgba(255,255,255,.78));backdrop-filter:blur(14px) saturate(118%);-webkit-backdrop-filter:blur(14px) saturate(118%);border:1px solid rgba(var(--blu-rgb),.20);box-shadow:var(--shadow-lg);max-width:520px;margin:0 auto;overflow:hidden;isolation:isolate;}
.w-raccolta-wrapper .rd-card>*{position:relative;z-index:2;}
.w-raccolta-wrapper .rd-card::before{content:"";position:absolute;inset:-8%;pointer-events:none;border-radius:inherit;background:radial-gradient(200px 260px at 20% 0%,rgba(var(--verde-rgb),.22),transparent 60%),radial-gradient(240px 200px at 110% 10%,rgba(var(--blu-rgb),.22),transparent 60%),radial-gradient(220px 260px at -10% 110%,rgba(255,255,255,.25),transparent 62%);filter:blur(18px) saturate(120%);mix-blend-mode:screen;z-index:0;animation:rdLiqFloat 22s ease-in-out infinite alternate;}
.w-raccolta-wrapper .rd-card::after{content:"";position:absolute;inset:-30% -20%;pointer-events:none;border-radius:inherit;background:linear-gradient(130deg,rgba(255,255,255,0) 20%,rgba(255,255,255,.18) 40%,rgba(255,255,255,0) 60%);z-index:1;animation:rdSheen 6s ease-in-out infinite;}
@keyframes rdLiqFloat{0%{transform:translate3d(0,0,0) rotate(.2deg);}50%{transform:translate3d(-2%,1%,0) rotate(-.6deg);}100%{transform:translate3d(2%,-1%,0) rotate(.8deg);}}
@keyframes rdSheen{0%{transform:translateX(-30%) rotate(.2deg);}50%{transform:translateX(30%) rotate(.2deg);}100%{transform:translateX(-30%) rotate(.2deg);}}
.rd-header{display:flex;align-items:center;gap:clamp(8px,2.5vw,12px);margin-bottom:8px;}
.rd-icon{width:clamp(38px,10vw,46px);height:clamp(38px,10vw,46px);display:grid;place-items:center;border-radius:14px;background:radial-gradient(80% 80% at 30% 20%,rgba(255,255,255,.22),rgba(255,255,255,0) 65%),linear-gradient(160deg,var(--verde),rgba(var(--verde-rgb),.85));color:#fff;box-shadow:inset 0 1px 8px rgba(255,255,255,.28),0 8px 18px rgba(0,0,0,.25);flex-shrink:0;}
.rd-title{font-weight:700;font-size:var(--fs-lg);line-height:1.1;color:var(--blu);}
.rd-sub{font-size:var(--fs-xs);color:var(--ink-sub);margin-top:2px;}
.rd-badge{margin-left:auto;font-size:var(--fs-xs);font-weight:800;color:var(--blu);padding:7px 12px;border-radius:999px;background:linear-gradient(160deg,rgba(var(--blu-rgb),.10),rgba(var(--blu-rgb),.06));border:1px solid rgba(var(--blu-rgb),.22);white-space:nowrap;}
.rd-section{margin-top:8px;}
.rd-section h3{margin:0 0 6px;font-size:var(--fs-md);font-weight:700;display:flex;align-items:center;gap:8px;color:inherit;}
.rd-section h3 .fa-solid{opacity:.95;color:var(--blu);}
.rd-chips{display:flex;flex-wrap:wrap;gap:8px;}
.rd-chip{display:inline-flex;align-items:center;gap:8px;padding:clamp(7px,2vw,9px) clamp(10px,2.5vw,14px);border-radius:14px;background:radial-gradient(120% 120% at 20% 10%,rgba(255,255,255,.28),rgba(255,255,255,0) 60%),linear-gradient(180deg,rgba(var(--verde-rgb),.18),rgba(var(--verde-rgb),.10));border:1px solid rgba(var(--verde-rgb),.30);font-size:var(--fs-sm);font-weight:800;color:#0f301a;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:inset 0 1px 8px rgba(255,255,255,.35),0 8px 16px rgba(var(--blu-rgb),.08);}
.rd-chip .fa-solid{font-size:var(--fs-sm);}
.rd-chip--none{background:radial-gradient(120% 120% at 20% 10%,rgba(255,255,255,.26),rgba(255,255,255,0) 60%),linear-gradient(180deg,rgba(var(--blu-rgb),.12),rgba(var(--blu-rgb),.06));border:1px dashed rgba(var(--blu-rgb),.28);color:var(--blu);}
.rd-accordion{border-radius:14px;overflow:hidden;border:1px solid rgba(var(--blu-rgb),.16);background:rgba(255,255,255,.86);}
.rd-acc-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:clamp(10px,2.5vw,12px) clamp(12px,3vw,14px);cursor:pointer;user-select:none;background:linear-gradient(180deg,rgba(var(--blu-rgb),.06),rgba(var(--blu-rgb),.03));}
.rd-acc-head span{font-weight:700;font-size:var(--fs-sm);}
.rd-acc-body{display:none;padding:10px 12px;background:rgba(255,255,255,.86);}
.rd-acc-body.open{display:block;}
.day-row{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px dashed rgba(var(--blu-rgb),.18);}
.day-row:last-child{border-bottom:none;}
.day-date{flex:0 0 clamp(74px,20vw,92px);font-weight:800;font-size:var(--fs-sm);}
.rd-cta{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;}
.rd-btn{display:inline-flex;align-items:center;gap:8px;padding:clamp(9px,2.5vw,11px) clamp(12px,3vw,16px);border-radius:14px;border:1px solid rgba(var(--verde-rgb),.45);font-weight:700;text-decoration:none;cursor:pointer;color:#fff;font-size:var(--fs-sm);background:radial-gradient(120% 120% at 10% 10%,rgba(255,255,255,.22),rgba(255,255,255,0) 60%),linear-gradient(110deg,var(--verde),var(--verde) 40%,var(--cd-green-500) 100%);box-shadow:0 10px 18px rgba(0,0,0,.20),inset 0 1px 10px rgba(255,255,255,.30);}
.rd-btn:active{transform:translateY(1px);}
.eco-tip{margin-top:10px;padding:clamp(8px,2vw,10px) clamp(10px,2.5vw,12px);border-radius:14px;background:linear-gradient(180deg,rgba(var(--blu-rgb),.05),rgba(var(--blu-rgb),.03));border:1px solid rgba(var(--blu-rgb),.18);display:flex;gap:10px;align-items:flex-start;font-size:var(--fs-sm);}
.eco-tip .fa-regular{margin-top:2px;}
.eco-tip small{display:block;font-size:var(--fs-xs);opacity:.85;}
.w-protezione{padding:clamp(10px,3vw,16px) clamp(8px,2.5vw,12px);background:var(--blu-dark);}
.w-protezione h2{color:var(--blu)!important;font-size:var(--fs-xl);}
.w-protezione .disclaimer,.w-protezione .disclaimer a{color:rgba(255,255,255,.85)!important;}
.w-protezione .disclaimer svg{fill:rgba(255,255,255,.85)!important;}
#dpc-alerts-widget{width:100%;margin:0 auto;}
.w-meteo-wrapper{padding:clamp(6px,2vw,10px) clamp(8px,2.5vw,12px);background:var(--blu-dark);flex-shrink:0;flex-grow:0;}
.w-meteo-wrapper .meteo-card{position:relative;border-radius:var(--radius);padding:clamp(10px,2.5vw,12px);background:linear-gradient(135deg,rgba(255,255,255,.86),rgba(255,255,255,.78));backdrop-filter:blur(14px) saturate(118%);-webkit-backdrop-filter:blur(14px) saturate(118%);border:1px solid rgba(var(--blu-rgb),.20);box-shadow:var(--shadow-lg);max-width:520px;margin:0 auto;overflow:hidden;}
.w-meteo-wrapper .meteo-card>*:not(.meteo-layer){position:relative;z-index:2;}
.w-meteo-wrapper .meteo-card::before{content:"";position:absolute;inset:-8%;pointer-events:none;border-radius:inherit;background:radial-gradient(220px 240px at 15% 0%,rgba(var(--blu-rgb),.18),transparent 60%),radial-gradient(240px 220px at 110% 10%,rgba(var(--blu-hover-rgb),.22),transparent 60%),radial-gradient(200px 240px at -10% 110%,rgba(255,255,255,.28),transparent 62%);filter:blur(18px) saturate(120%);mix-blend-mode:screen;z-index:0;animation:rdLiqFloat 24s ease-in-out infinite alternate;}
.w-meteo-wrapper .meteo-card::after{content:"";position:absolute;inset:-30% -20%;pointer-events:none;border-radius:inherit;background:linear-gradient(130deg,rgba(255,255,255,0) 20%,rgba(255,255,255,.18) 40%,rgba(255,255,255,0) 60%);z-index:1;animation:rdSheen 6s ease-in-out infinite;}
.meteo-header{display:flex;align-items:center;gap:8px;margin-bottom:4px;}
.meteo-icon{width:clamp(32px,8vw,38px);height:clamp(32px,8vw,38px);display:grid;place-items:center;border-radius:14px;color:#fff;background:radial-gradient(80% 80% at 30% 20%,rgba(255,255,255,.22),rgba(255,255,255,0) 65%),linear-gradient(160deg,var(--blu),var(--blu-hover));box-shadow:inset 0 1px 8px rgba(255,255,255,.28),0 8px 18px rgba(0,0,0,.22);flex-shrink:0;}
.meteo-title{font-weight:700;font-size:var(--fs-lg);line-height:1.1;color:var(--blu);}
.meteo-sub{font-size:var(--fs-xs);color:var(--ink-sub);}
.meteo-badge{margin-left:auto;font-size:var(--fs-xs);font-weight:700;color:var(--blu);padding:4px 8px;border-radius:999px;border:1px solid rgba(var(--blu-rgb),.22);background:linear-gradient(160deg,rgba(var(--blu-rgb),.10),rgba(var(--blu-rgb),.06));}
.meteo-section{margin-top:6px;}
.meteo-section h3{margin:0 0 4px;font-size:var(--fs-sm);font-weight:700;color:var(--blu);display:flex;gap:6px;align-items:center;}
.m-chips{display:flex;flex-wrap:wrap;gap:6px;}
.m-chip{display:inline-flex;align-items:center;gap:6px;padding:clamp(5px,1.5vw,6px) clamp(8px,2vw,10px);border-radius:12px;font-weight:600;background:linear-gradient(180deg,rgba(var(--blu-rgb),.12),rgba(var(--blu-rgb),.07));border:1px solid rgba(var(--blu-rgb),.28);color:var(--blu-dark);font-size:var(--fs-sm);}
.m-chip .fa-solid{font-size:var(--fs-sm);}
.meteo-acc{border:1px solid rgba(var(--blu-rgb),.22);border-radius:14px;overflow:hidden;background:rgba(255,255,255,.86);}
.meteo-acc-h{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:clamp(6px,2vw,8px) clamp(8px,2vw,10px);cursor:pointer;background:linear-gradient(180deg,rgba(var(--blu-rgb),.08),rgba(var(--blu-rgb),.04));user-select:none;color:var(--blu);font-size:var(--fs-sm);}
.meteo-acc-h strong{font-size:var(--fs-sm);}
.meteo-acc-b{display:none;padding:8px 10px;}
.meteo-acc-b.open{display:block;}
.meteo-cta{display:flex;gap:8px;margin-top:8px;}
.meteo-btn{display:inline-flex;align-items:center;gap:8px;padding:clamp(7px,2vw,9px) clamp(10px,2.5vw,12px);border-radius:12px;border:1px solid rgba(var(--blu-rgb),.35);color:#fff;text-decoration:none;font-weight:700;cursor:pointer;font-size:var(--fs-sm);background:linear-gradient(110deg,var(--blu),var(--blu-hover));box-shadow:0 10px 18px rgba(0,0,0,.20),inset 0 1px 10px rgba(255,255,255,.24);}
.meteo-btn:active{transform:translateY(1px);}
.meteo-layer{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:10;opacity:0;pointer-events:none;transition:.25s;background:rgba(255,255,255,.95);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);border-radius:inherit;}
.meteo-layer.visible{opacity:1;pointer-events:auto;}
.meteo-spinner{width:36px;height:36px;border:4px solid rgba(0,0,0,.1);border-radius:50%;border-top-color:var(--blu);animation:meteoSpin 1s linear infinite;}
.meteo-err{flex-direction:column;gap:8px;text-align:center;}
.meteo-err .msg{color:var(--ink-sub);font-size:var(--fs-sm);}
@keyframes meteoSpin{to{transform:rotate(360deg);}}
.spotlight-overlay{position:fixed;inset:0;z-index:8000;background:rgba(0,0,0,0);pointer-events:none;transition:background .5s ease;}
.spotlight-overlay.active{background:rgba(0,0,0,.65);pointer-events:auto;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);}
.spotlight-target{transition:transform .6s cubic-bezier(.34,1.56,.64,1),box-shadow .5s ease;}
.spotlight-target.spotlight-active{position:relative;z-index:8001;box-shadow:0 20px 60px rgba(0,0,0,.40),0 0 0 4px rgba(255,255,255,.25)!important;}
@keyframes spotlightPulse{0%,100%{box-shadow:0 20px 60px rgba(0,0,0,.40),0 0 0 4px rgba(255,255,255,.25);}50%{box-shadow:0 24px 70px rgba(0,0,0,.50),0 0 0 6px rgba(255,255,255,.35);}}
.spotlight-target.spotlight-center{animation:spotlightPulse 1.8s ease-in-out infinite;}
@media(min-width:641px){.home-wrapper{max-width:640px;}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;}}
.skip-link{position:absolute;top:-100%;left:50%;transform:translateX(-50%);background:var(--blu);color:#fff;padding:10px 20px;border-radius:0 0 12px 12px;font-weight:700;font-size:var(--fs-md);z-index:10000;text-decoration:none;transition:top .2s ease;}
.skip-link:focus{top:0;}
.a11y-bar{position:fixed;bottom:clamp(14px,4vw,22px);right:clamp(10px,3vw,18px);z-index:9999;display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none;}
.a11y-panel{display:none;flex-direction:column;gap:6px;padding:10px;background:var(--a11y-bar-bg);border:1px solid var(--a11y-bar-border);border-radius:16px;box-shadow:var(--shadow-lg);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);pointer-events:auto;min-width:180px;}
.a11y-panel.open{display:flex;}
.a11y-panel-title{font-size:var(--fs-xs);font-weight:700;color:var(--ink-sub);text-transform:uppercase;letter-spacing:.8px;padding:0 4px 4px;border-bottom:1px solid var(--a11y-bar-border);margin-bottom:2px;}
.a11y-row{display:flex;align-items:center;gap:6px;}
.a11y-row-label{font-size:var(--fs-sm);font-weight:600;color:var(--ink);flex:1;padding-left:4px;}
.a11y-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:38px;height:38px;border-radius:12px;border:1px solid transparent;background:var(--a11y-btn-bg);color:var(--a11y-btn-color);font-size:var(--fs-sm);font-weight:700;cursor:pointer;transition:background .15s,color .15s,border-color .15s,transform .1s;-webkit-tap-highlight-color:transparent;padding:0 8px;font-family:'Titillium Web',sans-serif;}
.a11y-btn:hover{background:rgba(var(--blu-rgb),.16);}
.a11y-btn:active{transform:scale(.94);}
.a11y-btn[aria-pressed="true"],.a11y-btn.active{background:var(--a11y-btn-active,var(--blu));color:#fff;border-color:transparent;}
.a11y-btn-icon{font-size:16px;}
.a11y-fab{width:50px;height:50px;border-radius:50%;border:none;background:linear-gradient(135deg,var(--blu),var(--blu-hover));color:#fff;font-size:20px;cursor:pointer;box-shadow:0 6px 20px rgba(var(--blu-rgb),.35);display:grid;place-items:center;pointer-events:auto;transition:transform .2s ease,box-shadow .2s ease;-webkit-tap-highlight-color:transparent;}
.a11y-fab:hover{transform:scale(1.08);box-shadow:0 8px 26px rgba(var(--blu-rgb),.45);}
.a11y-fab:active{transform:scale(.95);}
.a11y-fab[aria-expanded="true"]{background:linear-gradient(135deg,var(--cd-red),#E05555);}
.a11y-fontsize-group{display:flex;align-items:center;gap:4px;}
.a11y-fontsize-val{min-width:20px;text-align:center;font-weight:700;font-size:var(--fs-sm);color:var(--ink);}
.sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important;}
.a11y-live{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;}
.keyboard-nav a:focus-visible,.keyboard-nav button:focus-visible,.keyboard-nav [tabindex]:focus-visible,.keyboard-nav input:focus-visible{outline:3px solid var(--blu-hover)!important;outline-offset:2px!important;}
/* === RSS SLIDER WIDGET === */
.w-rss-slider{width:100%;margin:0;padding:14px 0 20px 0;background:var(--blu);border-radius:0;}
.rss-header{padding:0 14px 10px 14px;display:flex;justify-content:space-between;align-items:center;}
.rss-title{font-size:1.15rem;font-weight:700;color:#fff;margin:0;display:flex;align-items:center;gap:8px;}
.rss-view-all{font-size:0.8rem;color:#fff;text-decoration:none;font-weight:700;background:rgba(255,255,255,0.2);padding:4px 10px;border-radius:20px;transition:background .2s;}
.rss-view-all:hover{background:rgba(255,255,255,0.35);}
.rss-slider-container{display:flex;gap:14px;overflow-x:auto;padding:0 14px 25px 14px;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;margin:0;}
.rss-slider-container::-webkit-scrollbar{display:none;}
.rss-event-card{flex:0 0 310px;height:130px;scroll-snap-align:start;background:#fff;border-radius:var(--radius-card,14px);box-shadow:0 6px 18px rgba(0,0,0,0.15);display:flex;overflow:hidden;text-decoration:none;position:relative;border:1px solid rgba(255,255,255,0.2);transition:transform 0.2s;}
.rss-event-card:active{transform:scale(0.98);}
.rss-card-img{width:115px;height:100%;position:relative;background:#f0f2f5;flex-shrink:0;display:flex;align-items:center;justify-content:center;overflow:hidden;}
.rss-card-img img{width:100%;height:100%;object-fit:cover;display:block;}
.rss-fallback-icon{font-size:2.2rem;color:#cbd5e0;}
.rss-today-tag{position:absolute;top:0;left:0;background:var(--verde,#3CA434);color:#fff;font-size:0.7rem;font-weight:700;padding:3px 8px;border-bottom-right-radius:10px;box-shadow:1px 1px 4px rgba(0,0,0,0.3);z-index:2;}
.rss-card-body{flex:1;padding:12px 14px;display:flex;flex-direction:column;justify-content:center;min-width:0;}
.rss-event-date{font-size:0.8rem;font-weight:700;color:var(--verde,#3CA434);text-transform:uppercase;margin-bottom:6px;display:flex;align-items:center;gap:6px;}
.rss-event-date i{font-size:0.9rem;}
.rss-event-title{font-size:1rem;font-weight:700;line-height:1.3;color:var(--blu);margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
.rss-msg-box{color:rgba(255,255,255,0.8);font-size:0.9rem;padding:20px;text-align:center;width:100%;}
[data-theme="dark"] .rss-event-card{background:var(--cd-gray-900);border-color:rgba(255,255,255,.1);}
[data-theme="dark"] .rss-event-title{color:var(--cd-blue-300);}
[data-theme="dark"] .rss-event-date{color:var(--cd-green-300);}
[data-theme="dark"] .rss-card-img{background:#2a2a2a;}
@media(max-width:380px){.rss-event-card{flex:0 0 280px;height:120px;}.rss-card-img{width:95px;}}
/* TAB BAR */
.cd-tab-bar{position:fixed;bottom:0;left:0;right:0;z-index:9998;padding:0;pointer-events:none;display:none;}
.cd-tab-bar.active{display:flex;justify-content:center;}
.cd-tab-bar-inner{width:100%;max-width:100%;background:#fff;border-radius:14px 14px 0 0;border:none;border-top:1px solid #D9D9D9;box-shadow:0 -4px 16px rgba(0,0,0,.1);display:flex;align-items:flex-end;justify-content:space-around;padding:8px 4px 10px;pointer-events:auto;}
.cd-tab-btn{display:flex;flex-direction:column;align-items:center;gap:3px;text-decoration:none;color:var(--cd-gray-700);font-size:10px;font-weight:600;letter-spacing:.02em;padding:2px 0;min-width:56px;-webkit-tap-highlight-color:transparent;position:relative;}
.cd-tab-btn:active{transform:scale(.92);}
.cd-tab-icon{width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:18px;border-radius:12px;transition:all .2s ease;color:var(--cd-gray-700);}
.cd-tab-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:64px;line-height:1.2;font-size:10px;font-family:'Titillium Web',sans-serif;}
/* Center button — elevated, lighter blue */
.cd-tab-btn.cd-tab-center{margin-top:-18px;}
.cd-tab-btn.cd-tab-center .cd-tab-icon{width:46px;height:46px;font-size:20px;border-radius:50%;background:var(--cd-blue-500,#2E6DA8);color:#fff;box-shadow:0 4px 12px rgba(var(--blu-rgb),.3),0 2px 4px rgba(0,0,0,.1);border:3px solid #fff;transition:transform .2s ease,box-shadow .2s ease;}
.cd-tab-btn.cd-tab-center:active .cd-tab-icon{transform:scale(.9);}
.cd-tab-btn.cd-tab-center .cd-tab-label{font-weight:700;color:var(--cd-blue-500,#2E6DA8);margin-top:2px;}
/* Active non-center (ultimo toccato) */
.cd-tab-btn.cd-tab-active:not(.cd-tab-center) .cd-tab-icon{background:rgba(var(--blu-rgb),.1);color:var(--cd-blue-500,#2E6DA8);}
.cd-tab-btn.cd-tab-active:not(.cd-tab-center) .cd-tab-label{color:var(--cd-blue-500,#2E6DA8);font-weight:700;}
/* Safe area */
@supports(padding-bottom: env(safe-area-inset-bottom)){
  .cd-tab-bar-inner{padding-bottom:calc(10px + env(safe-area-inset-bottom));}
}
/* Dark mode */
[data-theme="dark"] .cd-tab-bar-inner{background:#1c1c1e;border-color:rgba(255,255,255,.08);border-top:1px solid rgba(255,255,255,.1);box-shadow:0 -2px 10px rgba(0,0,0,.3);}
[data-theme="dark"] .cd-tab-icon{color:rgba(255,255,255,.45);}
[data-theme="dark"] .cd-tab-label{color:rgba(255,255,255,.45);}
[data-theme="dark"] .cd-tab-btn.cd-tab-center .cd-tab-icon{border-color:rgba(28,28,30,.88);color:#fff;}
[data-theme="dark"] .cd-tab-btn.cd-tab-active:not(.cd-tab-center) .cd-tab-icon{background:rgba(var(--blu-rgb),.15);color:var(--cd-blue-300);}
[data-theme="dark"] .cd-tab-btn.cd-tab-active:not(.cd-tab-center) .cd-tab-label{color:var(--cd-blue-300);}
/* Body padding + A11y FAB offset */
body.has-tab-bar{padding-bottom:90px;}
body.has-tab-bar .a11y-bar{bottom:calc(clamp(14px,4vw,22px) + 86px);}
@supports(padding-bottom: env(safe-area-inset-bottom)){
  body.has-tab-bar{padding-bottom:calc(90px + env(safe-area-inset-bottom));}
  body.has-tab-bar .a11y-bar{bottom:calc(clamp(14px,4vw,22px) + 86px + env(safe-area-inset-bottom));}
}`;
  }

  /* ============================================================
     BUILD JS (complete logic from Cammarata template)
     ============================================================ */
  function buildJS() {
    // This is the complete JS logic – it reads from COMUNE_CONFIG at runtime
    return `(function(){
  "use strict";
  if(new RegExp('iPhone|iPad|iPod').test(navigator.userAgent)){
    document.documentElement.classList.add('ios-device');
  }

  const C = window.COMUNE_CONFIG;
  const BASE = C.baseUrl.replace(new RegExp('[/]+$'), '');

  const href = (path) => {
    const url = path.startsWith('http') ? path : BASE + '/' + path;
    return encodeURI(decodeURI(url));
  };

  document.title = C.pageTitle || 'Home – ' + C.nomeComune + ' – Comune.Digital';

  const esc = (s) => {
    return String(s)
      .split('&').join('&amp;')
      .split('<').join('&lt;')
      .split('>').join('&gt;')
      .split('"').join('&quot;');
  };

  let LANG = localStorage.getItem('cd_lang') || C.i18n.defaultLang;

  const t = (key) => {
    const entry = C.i18n.ui[key];
    if (!entry) return key;
    return entry[LANG] || entry[C.i18n.defaultLang] || key;
  };

  const mount = document.getElementById('widgetMount');
  let html = '';

  // Build widget renderers
  const widgetRenderers = {
    dateHeader: () =>
      '<header class="w-date-header" id="dateHeader" '
      + 'aria-label="Data odierna e meteo">'
      + '<div class="date-header-inner">'
      + '<div class="date-left">'
      + '<span class="date-ico" aria-hidden="true">'
      + '<i class="fa-solid fa-calendar-days"></i></span>'
      + '<div class="date-text">'
      + '<span class="current-date" id="currentDate"></span>'
      + '<span class="special-event" id="specialEvent"></span>'
      + '</div></div>'
      + '<div class="weather-box" aria-label="Meteo attuale a '
      + esc(C.nomeComune) + '">'
      + '<span class="weather-icon" id="weatherIcon">--</span>'
      + '<span class="temperature" id="temperature">--°C</span>'
      + '</div></div></header>',

    tickerBar: () =>
      '<section class="w-ticker" id="tickerBar" '
      + 'aria-label="Notizie in scorrimento">'
      + '<div class="ticker-header">'
      + '<a href="' + esc(href(C.ticker.linkUrl)) + '" '
      + 'target="_blank" rel="noopener">'
      + '<span class="news-ico" aria-hidden="true">'
      + '<span style="transform:translateY(1px);display:inline-block;">'
      + '📰</span></span>'
      + '<span class="header-title" data-i18n="ticker.title">'
      + esc(t('ticker.title')) + '</span>'
      + '<span class="arrow-link" aria-hidden="true"><i class="fa-solid fa-chevron-right" style="font-size:9px"></i></span>'
      + '</a></div>'
      + '<div class="ticker-strip">'
      + '<rssapp-ticker id="' + esc(C.ticker.rssWidgetId) + '">'
      + '</rssapp-ticker></div></section>',
    slideshow: () => {
      const slides = C.slides || [];
      const hasContent = slides.some((s) => s.titleIt || s.bg);
      if (!hasContent) return '';

      let sh = '';
      slides.forEach((sl, i) => {
        const hrefF = sl.href
          ? (sl.href.startsWith('http') ? sl.href : BASE + '/' + sl.href)
          : '#';
        const bgF = sl.bg
          ? (sl.bg.startsWith('http') ? sl.bg : BASE + '/' + sl.bg)
          : '';
        sh += '<article class="slide' + (i === 0 ? ' active' : '') + '" '
          + 'data-href="' + esc(hrefF) + '" '
          + 'data-bg="' + esc(bgF) + '" '
          + 'data-title-it="' + esc(sl.titleIt) + '" '
          + 'data-title-en="' + esc(sl.titleEn) + '" '
          + 'aria-label="' + esc(sl.titleIt) + '">'
          + '<div class="slide-content">'
          + '<div class="slide-textbox">'
          + '<h1 class="slide-title">' + esc(sl.titleIt) + '</h1>'
          + '</div></div></article>';
      });

      let dh = '';
      slides.forEach((sl, i) => {
        dh += '<button class="slide-dot' + (i === 0 ? ' active' : '') + '" '
          + 'data-title="' + esc(sl.titleIt) + '" '
          + 'role="tab" '
          + 'aria-selected="' + (i === 0 ? 'true' : 'false') + '" '
          + 'aria-label="' + esc(sl.titleIt) + '"></button>';
      });

      return '<section class="w-slideshow" id="slideshowStatic" '
        + 'role="region" aria-roledescription="carousel" '
        + 'aria-label="Sezioni principali" aria-live="polite">'
        + sh
        + '<div class="slide-cta">'
        + '<a id="ctaLink" href="#" '
        + 'aria-label="Apri la sezione corrente">'
        + '<i class="fa-solid fa-arrow-right"></i> '
        + '<span id="ctaText" data-i18n="slide.cta">Apri sezione</span>'
        + '</a></div>'
        + '<div class="slide-nav" aria-hidden="true">'
        + '<button class="slide-arrow prev" '
        + 'aria-label="Slide precedente">'
        + '<i class="fas fa-chevron-left"></i></button>'
        + '<button class="slide-arrow next" '
        + 'aria-label="Slide successiva">'
        + '<i class="fas fa-chevron-right"></i></button>'
        + '</div>'
        + '<div class="slide-indicators" role="tablist" '
        + 'aria-label="Vai alla slide">'
        + dh + '</div>'
        + '</section>';
    },
    servizi: () => {
      const svcSections = C.servizi
        .map((sec) => {
          const cards = sec.items
            .map((it) =>
              '<a class="svc-link" href="' + esc(href(it.href)) + '" '
              + 'target="_blank" rel="noopener">'
              + '<div class="svc-card">'
              + '<div class="svc-icon-box">'
              + '<i class="fa-solid ' + esc(it.icon) + '"></i>'
              + '</div>'
              + '<div class="svc-label-it" '
              + 'data-i18n-it="' + esc(it.labelIt) + '" '
              + 'data-i18n-en="' + esc(it.labelEn) + '">'
              + esc(LANG === 'en' ? it.labelEn : it.labelIt)
              + '</div></div></a>'
            )
            .join('');
          return '<div class="svc-section">'
            + '<div class="svc-section-hdr">'
            + '<div class="svc-title-it" '
            + 'data-i18n-it="' + esc(sec.sectionIt) + '" '
            + 'data-i18n-en="' + esc(sec.sectionEn) + '">'
            + esc(LANG === 'en' ? sec.sectionEn : sec.sectionIt)
            + '</div></div>'
            + '<div class="svc-grid">' + cards + '</div>'
            + '</div>';
        })
        .join('');
      return '<section class="w-services" id="servicesContainer" '
        + 'aria-label="Servizi comunali">'
        + svcSections + '</section>';
    },
    bannerCIE: () => {
      if (!C.bannerCie.enabled) return '';
      const titleText = LANG === 'en'
        ? (C.bannerCie.titleEn || C.bannerCie.title)
        : C.bannerCie.title;
      const subtitleText = LANG === 'en'
        ? (C.bannerCie.subtitleEn || C.bannerCie.subtitle)
        : C.bannerCie.subtitle;
      return '<section class="w-banner-cie" id="bannerCIE" '
        + 'role="region" aria-label="Avviso CIE">'
        + '<a class="cie-link" href="' + esc(C.bannerCie.href) + '" '
        + 'target="_blank" rel="noopener" '
        + 'aria-label="' + esc(C.bannerCie.title) + '">'
        + '<div class="cie-ico" aria-hidden="true">'
        + '<i class="fa-solid fa-id-card"></i></div>'
        + '<div class="cie-txt">'
        + '<p class="cie-title" '
        + 'data-i18n-it="' + esc(C.bannerCie.title) + '" '
        + 'data-i18n-en="'
        + esc(C.bannerCie.titleEn || C.bannerCie.title) + '">'
        + esc(titleText) + '</p>'
        + '<p class="cie-subtitle" '
        + 'data-i18n-it="' + esc(C.bannerCie.subtitle) + '" '
        + 'data-i18n-en="'
        + esc(C.bannerCie.subtitleEn || C.bannerCie.subtitle) + '">'
        + esc(subtitleText) + '</p>'
        + '</div>'
        + '<div class="cie-info-wrap" aria-hidden="true">'
        + '<span class="cie-badge" data-i18n="cie.badge">'
        + esc(t('cie.badge')) + '</span>'
        + '<span class="cie-ring"></span>'
        + '<span class="cie-finger">'
        + '<i class="fa-solid fa-hand-point-up"></i></span>'
        + '</div></a></section>';
    },

    raccoltaDifferenziata: () =>
      '<section class="w-raccolta-wrapper" '
      + 'aria-label="Raccolta differenziata">'
      + '<div id="raccoltaDifferenziata" class="rd-card" '
      + 'aria-live="polite"></div></section>',

    protezioneCivile: () => {
      if (!C.protezioneCivile.enabled) return '';
      return '<section class="w-protezione" id="protezioneCivile" '
        + 'aria-label="Bollettino Protezione Civile">'
        + '<div id="dpc-alerts-widget"></div></section>';
    },
    meteoCard: () =>
      '<section class="w-meteo-wrapper" aria-label="Meteo '
      + esc(C.nomeComune) + '">'
      + '<div id="meteoCard" class="meteo-card" aria-live="polite">'
      + '<div class="meteo-header">'
      + '<div class="meteo-icon" aria-hidden="true">'
      + '<i class="fa-solid fa-cloud-sun"></i></div>'
      + '<div>'
      + '<div class="meteo-title" data-i18n="meteo.title">'
      + esc(t('meteo.title')) + '</div>'
      + '<div class="meteo-sub" id="mwCity" '
      + 'data-i18n="meteo.loading">'
      + esc(t('meteo.loading')) + '</div>'
      + '</div>'
      + '<div class="meteo-badge" id="mwBadge">--:--</div>'
      + '</div>'
      + '<div class="meteo-section">'
      + '<h3><i class="fa-solid fa-temperature-half"></i> '
      + '<span data-i18n="meteo.current">'
      + esc(t('meteo.current')) + '</span></h3>'
      + '<div class="m-chips" id="meteoNow"></div></div>'
      + '<div class="meteo-section">'
      + '<div class="meteo-acc" id="meteoAcc">'
      + '<div class="meteo-acc-h" id="meteoAccHead">'
      + '<strong><i class="fa-solid fa-circle-info"></i> '
      + '<span data-i18n="meteo.details">'
      + esc(t('meteo.details')) + '</span></strong>'
      + '<small><i id="meteoChev" '
      + 'class="fa-solid fa-chevron-down"></i></small>'
      + '</div>'
      + '<div class="meteo-acc-b" id="meteoAccBody">'
      + '<div class="m-chips" id="meteoDet"></div>'
      + '</div></div></div>'
      + '<div class="meteo-cta">'
      + '<a class="meteo-btn" href="javascript:void(0)" '
      + 'id="meteoWeekly">'
      + '<i class="fa-solid fa-calendar-week"></i> '
      + '<span data-i18n="meteo.weekly">'
      + esc(t('meteo.weekly')) + '</span></a>'
      + '</div>'
      + '<div class="meteo-layer" id="meteoLoader">'
      + '<div class="meteo-spinner" aria-label="Caricamento">'
      + '</div></div>'
      + '<div class="meteo-layer meteo-err" id="meteoError" '
      + 'role="alert">'
      + '<div><i class="fa-solid fa-triangle-exclamation"></i> '
      + '<span data-i18n="meteo.error">'
      + esc(t('meteo.error')) + '</span></div>'
      + '<div class="msg" id="meteoErrmsg" '
      + 'data-i18n="meteo.errorSub">'
      + esc(t('meteo.errorSub')) + '</div>'
      + '<a class="meteo-btn" href="#" id="meteoRetry" '
      + 'style="margin-top:4px">'
      + '<i class="fa-solid fa-rotate-right"></i> '
      + '<span data-i18n="meteo.retry">'
      + esc(t('meteo.retry')) + '</span></a>'
      + '</div></div></section>',
  };

  // Register dynamic RSS slider renderers
  (C.rssSliders || []).forEach((sl, i) => {
    widgetRenderers['rssSlider_' + i] = () =>
      '<section class="w-rss-slider" id="rssSlider_' + i + '" '
      + 'aria-label="' + esc(sl.titleIt) + '" '
      + 'data-rss-idx="' + i + '">'
      + '<div class="rss-header">'
      + '<h2 class="rss-title">'
      + '<i class="fa-solid ' + esc(sl.icon || 'fa-calendar-days') + '" '
      + 'aria-hidden="true"></i> '
      + '<span data-i18n-it="' + esc(sl.titleIt) + '" '
      + 'data-i18n-en="' + esc(sl.titleEn || sl.titleIt) + '">'
      + esc(sl.titleIt) + '</span></h2>'
      + '<a href="' + esc(href(sl.targetUrl)) + '" '
      + 'class="rss-view-all" target="_blank" rel="noopener">'
      + '<span data-i18n-it="Tutti" data-i18n-en="All">Tutti</span> '
      + '<i class="fa-solid fa-chevron-right" aria-hidden="true" '
      + 'style="font-size:0.7em;"></i></a></div>'
      + '<div class="rss-slider-container" id="rssContainer_' + i + '" '
      + 'role="list" aria-live="polite" aria-busy="true">'
      + '<div class="rss-msg-box">'
      + '<i class="fa-solid fa-circle-notch fa-spin" '
      + 'aria-hidden="true"></i> '
      + '<span data-i18n-it="Caricamento..." '
      + 'data-i18n-en="Loading...">Caricamento...</span>'
      + '</div></div></section>';
  });

  // Register dynamic banner custom renderers
  (C.bannerGroups || []).forEach((group, gi) => {
    widgetRenderers['bannerCustom_' + gi] = () => {
      const items = group.items || [];
      if (!items.length) return '';

      let slidesH = '';
      items.forEach((it, i) => {
        const bg = it.bgImage
          ? (it.bgImage.startsWith('http')
            ? it.bgImage
            : BASE + '/' + it.bgImage)
          : '';
        const hasText = it.kicker || it.titleIt;
        slidesH += '<div class="bc-slide' + (i === 0 ? ' active' : '') + '" '
          + 'data-title="' + esc(it.kicker || it.titleIt || 'Banner') + '"'
          + (bg ? ' style="--bg-image:url(\\'' + esc(bg) + '\\')"' : '') + '>';

        if (hasText) {
          slidesH += '<a class="bc-slide-link" '
            + 'href="' + esc(href(it.href)) + '" '
            + 'target="_blank" rel="noopener" '
            + 'aria-label="' + esc(it.titleIt) + '">'
            + '<div class="bc-text-wrap"><div class="bc-title-group">'
            + '<span class="bc-kicker">'
            + '<i class="fa-solid ' + esc(it.icon || 'fa-bullhorn') + '">'
            + '</i> '
            + '<span data-i18n-it="' + esc(it.kicker) + '" '
            + 'data-i18n-en="' + esc(it.kicker) + '">'
            + esc(it.kicker) + '</span></span>'
            + '<h2 class="bc-title" '
            + 'data-i18n-it="' + esc(it.titleIt) + '" '
            + 'data-i18n-en="' + esc(it.titleEn || it.titleIt) + '">'
            + esc(it.titleIt) + '</h2>'
            + '</div></div>'
            + '<span class="bc-cta">'
            + '<span class="bc-cta-label">'
            + esc(it.ctaLabel || 'Apri') + '</span>'
            + '<i class="fa-solid ' + esc(it.ctaIcon || 'fa-arrow-right') + '">'
            + '</i></span>'
            + '</a>';
        } else if (bg) {
          slidesH += '<a class="bc-slide-link bc-slide-img-only" '
            + 'href="' + esc(href(it.href)) + '" '
            + 'target="_blank" rel="noopener" style="padding:0;">'
            + '<img src="' + esc(bg) + '" '
            + 'alt="' + esc(it.titleIt || 'Banner') + '" '
            + 'style="width:100%;height:100%;object-fit:cover;'
            + 'display:block;"></a>';
        }
        slidesH += '</div>';
      });

      let dotsH = '';
      if (items.length > 1) {
        dotsH = '<div class="bc-dots" role="tablist" '
          + 'aria-label="Indicatori banner">';
        items.forEach((it, i) => {
          dotsH += '<button class="bc-dot' + (i === 0 ? ' active' : '') + '" '
            + 'type="button" role="tab" '
            + 'aria-label="Banner ' + (i + 1) + '"></button>';
        });
        dotsH += '</div>';
      }

      return '<section class="w-banner-custom" '
        + 'id="bannerCustom_' + gi + '" '
        + 'aria-label="Banner informativi" '
        + 'aria-roledescription="carousel">'
        + '<div class="bc-container">'
        + slidesH + dotsH + '</div></section>';
    };
  });

  // Register custom widget renderer (iframe isolato)
  widgetRenderers['customWidget'] = () => {
    const cw = C.customWidget;
    if (!cw || !cw.enabled || !cw.htmlCode) return '';
    // Genera un placeholder; l'iframe viene creato via JS sotto per evitare problemi di encoding srcdoc
    return '<section class="w-custom-widget" id="customWidgetSection" '
      + 'aria-label="' + esc(cw.label || 'Widget Custom') + '" '
      + 'style="width:100%;overflow:hidden;">'
      + '<div id="customWidgetIframeMount" style="width:100%;height:' + (parseInt(cw.height) || 300) + 'px;"></div>'
      + '</section>';
  };

  // Sort widgets by order and render enabled ones
  const enabledWidgets = (C.widgets || [])
    .filter((w) => w.enabled)
    .sort((a, b) => a.order - b.order);

  enabledWidgets.forEach((w) => {
    if (widgetRenderers[w.id]) {
      const rendered = widgetRenderers[w.id]();
      if (rendered) html += rendered;
    }
  });

  mount.innerHTML = html;

  /* CUSTOM WIDGET – inject iframe via document.write for max WebView compatibility */
  (() => {
    const cw = C.customWidget;
    if (!cw || !cw.enabled || !cw.htmlCode) return;
    const mountEl = document.getElementById('customWidgetIframeMount');
    if (!mountEl) return;
    const h = parseInt(cw.height) || 300;
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:100%;height:' + h + 'px;border:none;display:block;';
    iframe.setAttribute('title', cw.label || 'Widget Custom');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('allow', 'autoplay; fullscreen');
    mountEl.appendChild(iframe);
    // document.write è il metodo più compatibile con WebView (GoodBarber, etc.)
    try {
      var iDoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      if (iDoc) {
        iDoc.open();
        iDoc.write(cw.htmlCode);
        iDoc.close();
      } else {
        iframe.srcdoc = cw.htmlCode;
      }
    } catch(e) {
      // Fallback se cross-origin block
      iframe.srcdoc = cw.htmlCode;
    }
  })();

  /* FOOTER – render only if configured */
  (() => {
    const fm = document.getElementById('footerMount');
    if (!fm) return;
    const ft = C.footer;
    if (!ft) return;
    const hasFooter = ft.terminiLabel || ft.privacyLabel || ft.copyrightText;
    if (!hasFooter) {
      fm.innerHTML = '';
      return;
    }
    let fh = '<footer class="w-footer" id="mainFooter" '
      + 'aria-label="Footer"><div class="footer-inner">';
    if (ft.terminiLabel || ft.privacyLabel) {
      fh += '<nav class="footer-links" aria-label="Link legali">';
      if (ft.terminiLabel) {
        fh += '<a href="' + esc(ft.terminiUrl || '#') + '" '
          + 'id="footerTermini" target="_blank" rel="noopener">'
          + esc(ft.terminiLabel) + '</a>';
      }
      if (ft.privacyLabel) {
        fh += '<a href="' + esc(ft.privacyUrl || '#') + '" '
          + 'id="footerPrivacy" target="_blank" rel="noopener">'
          + esc(ft.privacyLabel) + '</a>';
      }
      fh += '</nav>';
    }
    if (ft.copyrightText) {
      fh += '<div class="footer-copy" id="footerCopy">&copy; 2026 '
        + '<a href="' + esc(ft.copyrightUrl || '#') + '" '
        + 'id="footerBrand" target="_blank" rel="noopener">'
        + esc(ft.copyrightText) + '</a></div>';
    }
    fh += '</div></footer>';
    fm.innerHTML = fh;
  })();

  /* TAB BAR */
  (() => {
    const tbm = document.getElementById('tabBarMount');
    if (!tbm) return;
    const tb = C.tabBar;
    if (!tb) return;
    const tbWidget = (C.widgets || []).find((w) => w.id === 'tabBar');
    if (!tbWidget || !tbWidget.enabled) return;
    document.body.classList.add('has-tab-bar');
    const items = tb.items || [];
    if (!items.length) return;

    /* Riordina: sposta il pulsante centrale fisicamente al centro dell'array */
    const centerIdx = items.findIndex((it) => !!it.isCenter);
    const midPos = Math.floor(items.length / 2);
    const ordered = items.slice();
    if (centerIdx >= 0 && centerIdx !== midPos) {
      const cItem = ordered.splice(centerIdx, 1)[0];
      ordered.splice(midPos, 0, cItem);
    }

    let h = '<nav class="cd-tab-bar active" id="cdTabBar" '
      + 'role="navigation" aria-label="Navigazione principale">'
      + '<div class="cd-tab-bar-inner">';
    ordered.forEach((it, i) => {
      const isC = !!it.isCenter;
      const url = it.href
        ? (it.href.startsWith('http') ? it.href : BASE + '/' + it.href)
        : '#';
      h += '<a href="' + esc(url) + '" class="cd-tab-btn'
        + (isC ? ' cd-tab-center' : '') + '">';
      h += '<div class="cd-tab-icon"><i class="fas '
        + esc(it.icon || 'fa-circle') + '"></i></div>';
      h += '<div class="cd-tab-label" '
        + 'data-i18n-it="' + esc(it.labelIt) + '" '
        + 'data-i18n-en="' + esc(it.labelEn || it.labelIt) + '">'
        + esc(LANG === 'en' ? (it.labelEn || it.labelIt) : it.labelIt)
        + '</div>';
      h += '</a>';
    });
    h += '</div></nav>';
    tbm.innerHTML = h;

    /* Tap su tab → evidenzia ultimo toccato */
    const tabBtns = tbm.querySelectorAll('.cd-tab-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        tabBtns.forEach((b) => b.classList.remove('cd-tab-active'));
        btn.classList.add('cd-tab-active');
      });
    });
  })();

  /* BANNER CUSTOM CAROUSEL – per ogni gruppo */
  document.querySelectorAll('.w-banner-custom').forEach((section) => {
    const bcSlides = section.querySelectorAll('.bc-slide');
    const bcDots = section.querySelectorAll('.bc-dot');
    if (!bcSlides.length || bcSlides.length < 2) return;

    let bcIdx = 0;
    let bcTimer = null;
    let bcPlaying = true;
    let bcUserPaused = false;
    let bcTransitioning = false;
    const bcDuration = 5000;
    const bcContainer = section.querySelector('.bc-container');

    const bcGoTo = (i) => {
      if (bcTransitioning || i === bcIdx) return;
      bcTransitioning = true;
      bcSlides[bcIdx].classList.remove('active');
      if (bcDots[bcIdx]) bcDots[bcIdx].classList.remove('active');
      bcIdx = (i + bcSlides.length) % bcSlides.length;
      bcSlides[bcIdx].classList.add('active');
      if (bcDots[bcIdx]) bcDots[bcIdx].classList.add('active');
      setTimeout(() => { bcTransitioning = false; }, 500);
    };

    const bcNext = () => bcGoTo(bcIdx + 1);
    const bcPrev = () => bcGoTo(bcIdx - 1);

    const bcPlay = () => {
      if (!bcPlaying || bcUserPaused) return;
      clearInterval(bcTimer);
      bcTimer = setInterval(bcNext, bcDuration);
    };

    const bcPause = () => clearInterval(bcTimer);

    bcPlay();

    bcDots.forEach((d, i) => {
      d.addEventListener('click', () => {
        clearInterval(bcTimer);
        bcGoTo(i);
        bcPlaying = true;
        if (!bcUserPaused) bcPlay();
      });
    });

    if (bcContainer) {
      let bsx = 0, bex = 0, bsy = 0, bey = 0;
      bcContainer.addEventListener(
        'touchstart',
        (e) => {
          bsx = bex = e.touches[0].clientX;
          bsy = bey = e.touches[0].clientY;
        },
        { passive: true }
      );
      bcContainer.addEventListener(
        'touchmove',
        (e) => {
          bex = e.touches[0].clientX;
          bey = e.touches[0].clientY;
        },
        { passive: true }
      );
      bcContainer.addEventListener(
        'touchend',
        () => {
          const dx = bsx - bex;
          const dy = bsy - bey;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
            clearInterval(bcTimer);
            dx > 0 ? bcNext() : bcPrev();
            bcPlaying = true;
            if (!bcUserPaused) bcPlay();
          }
          bsx = bex = bsy = bey = 0;
        },
        { passive: true }
      );

      if (window.matchMedia('(min-width:769px)').matches) {
        bcContainer.addEventListener('mouseenter', () => {
          bcUserPaused = true;
          bcPause();
        });
        bcContainer.addEventListener('mouseleave', () => {
          bcUserPaused = false;
          if (bcPlaying) bcPlay();
        });
      }
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) bcPause();
      else if (bcPlaying && !bcUserPaused) bcPlay();
    });
  });

  /* RSS SLIDERS RUNTIME */
  (() => {
    const CORS_PROXIES = [
      (u) => 'https://api.allorigins.win/get?url='
        + encodeURIComponent(u),
      (u) => 'https://corsproxy.io/?' + encodeURIComponent(u),
      (u) => 'https://api.codetabs.com/v1/proxy?quest='
        + encodeURIComponent(u),
    ];

    const fetchWithTimeout = (url, ms) => {
      let ctrl, sig;
      if (typeof AbortController !== 'undefined') {
        ctrl = new AbortController();
        sig = ctrl.signal;
      }
      const fp = fetch(url, { cache: 'no-store', signal: sig })
        .then((r) => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r;
        });
      const tp = new Promise((_, rej) => {
        setTimeout(() => {
          if (ctrl) ctrl.abort();
          rej(new Error('timeout'));
        }, ms);
      });
      return Promise.race([fp, tp]);
    };

    const fetchRssText = (rssUrl) => {
      const bust = rssUrl
        + (rssUrl.includes('?') ? '&' : '?')
        + '_t=' + Date.now();
      return fetchWithTimeout(bust, 10000)
        .then((r) => r.text())
        .catch(() => {
          return CORS_PROXIES.reduce((chain, pFn) => {
            return chain.catch(() => {
              return fetchWithTimeout(pFn(bust), 10000)
                .then((r) => r.json ? r.json() : r.text())
                .then((d) => {
                  if (d && typeof d.contents === 'string') return d.contents;
                  if (typeof d === 'string') return d;
                  throw new Error('proxy-invalid');
                });
            });
          }, Promise.reject(new Error('start')));
        });
    };
    const parseRss = (str, domainBase) => {
      const xml = new DOMParser().parseFromString(str, 'text/xml');
      if (xml.querySelector('parsererror')) return [];

      const items = xml.querySelectorAll('item');
      const evts = [];

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        let title = (it.querySelector('title') || {}).textContent || '';
        title = title.trim();
        const desc = (it.querySelector('description') || {})
          .textContent || '';
        const pub = (it.querySelector('pubDate') || {})
          .textContent || '';
        let imgUrl = null;

        try {
          const mt = it.querySelector('media\\\\:thumbnail,thumbnail');
          if (mt) imgUrl = mt.getAttribute('url');
        } catch (e) {}

        if (!imgUrl) {
          try {
            const enc = it.querySelector('enclosure');
            if (enc) imgUrl = enc.getAttribute('url');
          } catch (e) {}
        }

        if (!imgUrl) {
          const tmp = document.createElement('div');
          tmp.innerHTML = desc;
          const img = tmp.querySelector('img');
          if (img) {
            const s = img.getAttribute('src');
            if (s) {
              imgUrl = s.startsWith('/') ? domainBase + s : s;
            }
          }
        }

        let d = new Date(pub);
        if (isNaN(d.getTime())) d = new Date();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        evts.push({
          title: title,
          date: d,
          image: imgUrl,
          isNew: (d.getFullYear() === today.getFullYear()
            && d.getMonth() === today.getMonth()
            && d.getDate() === today.getDate()),
        });
      }

      evts.sort((a, b) => b.date - a.date);
      return evts;
    };
    const renderSlider = (container, events, targetUrl, newLabelIt, newLabelEn) => {
      container.innerHTML = '';
      container.setAttribute('aria-busy', 'false');

      if (!events || !events.length) {
        container.innerHTML = '<div class="rss-msg-box" '
          + 'data-i18n-it="Nessun evento in programma." '
          + 'data-i18n-en="No events scheduled.">'
          + 'Nessun evento in programma.</div>';
        return;
      }

      events.forEach((evt) => {
        const day = evt.date.getDate();
        const month = evt.date.toLocaleString(
          LANG === 'en' ? 'en-GB' : 'it-IT',
          { month: 'short' }
        ).toUpperCase().replace('.', '');

        const card = document.createElement('a');
        card.className = 'rss-event-card';
        card.href = targetUrl;
        card.target = '_blank';
        card.rel = 'noopener';
        card.setAttribute('role', 'listitem');
        card.setAttribute('aria-label', evt.title + ', ' + day + ' ' + month);

        const imgCol = document.createElement('div');
        imgCol.className = 'rss-card-img';

        if (evt.image) {
          const imgEl = document.createElement('img');
          imgEl.src = evt.image;
          imgEl.alt = evt.title;
          imgEl.loading = 'lazy';
          const fb = document.createElement('i');
          fb.className = 'fa-regular fa-image rss-fallback-icon';
          fb.style.display = 'none';
          imgEl.addEventListener('error', () => {
            imgEl.style.display = 'none';
            fb.style.display = 'flex';
          });
          imgCol.appendChild(imgEl);
          imgCol.appendChild(fb);
        } else {
          const ic = document.createElement('i');
          ic.className = 'fa-solid fa-calendar-days rss-fallback-icon';
          imgCol.appendChild(ic);
        }

        if (evt.isNew) {
          const tag = document.createElement('div');
          tag.className = 'rss-today-tag';
          tag.setAttribute('data-i18n-it', newLabelIt || 'NUOVO');
          tag.setAttribute('data-i18n-en', newLabelEn || 'NEW');
          tag.textContent = LANG === 'en'
            ? (newLabelEn || 'NEW')
            : (newLabelIt || 'NUOVO');
          imgCol.appendChild(tag);
        }

        const body = document.createElement('div');
        body.className = 'rss-card-body';

        const dateDiv = document.createElement('div');
        dateDiv.className = 'rss-event-date';
        const calI = document.createElement('i');
        calI.className = 'far fa-calendar';
        dateDiv.appendChild(calI);
        dateDiv.appendChild(document.createTextNode(' ' + day + ' ' + month));

        const titleEl = document.createElement('h3');
        titleEl.className = 'rss-event-title';
        titleEl.textContent = evt.title;

        body.appendChild(dateDiv);
        body.appendChild(titleEl);
        card.appendChild(imgCol);
        card.appendChild(body);
        container.appendChild(card);
      });
    };
    (C.rssSliders || []).forEach((sl, i) => {
      const container = document.getElementById('rssContainer_' + i);
      if (!container) return;
      const cacheKey = 'rss_slider_' + i + '_cache';

      const doFetch = () => {
        fetchRssText(sl.feedUrl)
          .then((xml) => {
            const evts = parseRss(xml, sl.domainBase || BASE);
            renderSlider(container, evts, sl.targetUrl, sl.newLabelIt, sl.newLabelEn);
            try {
              localStorage.setItem(
                cacheKey,
                JSON.stringify({
                  ts: Date.now(),
                  evts: evts.map(function(e) {
                    return {
                      title: e.title,
                      date: e.date.toISOString(),
                      image: e.image,
                      isNew: e.isNew
                    };
                  }),
                })
              );
            } catch (e) {}
          })
          .catch(() => {
            try {
              const c = JSON.parse(localStorage.getItem(cacheKey));
              if (c && c.evts) {
                const restored = c.evts.map(function(e) {
                  return {
                    title: e.title,
                    date: new Date(e.date),
                    image: e.image,
                    isNew: e.isNew
                  };
                });
                renderSlider(container, restored, sl.targetUrl,
                  sl.newLabelIt, sl.newLabelEn);
                return;
              }
            } catch (e) {}
            container.innerHTML = '<div class="rss-msg-box" '
              + 'data-i18n-it="Impossibile caricare i dati." '
              + 'data-i18n-en="Unable to load data.">'
              + 'Impossibile caricare i dati.</div>';
            container.setAttribute('aria-busy', 'false');
          });
      };

      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey));
        if (cached && cached.evts && cached.evts.length) {
          const restored = cached.evts.map(function(e) {
            return {
              title: e.title,
              date: new Date(e.date),
              image: e.image,
              isNew: e.isNew
            };
          });
          renderSlider(container, restored, sl.targetUrl,
            sl.newLabelIt, sl.newLabelEn);
        }
      } catch (e) {}

      doFetch();
      setInterval(doFetch, 15 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) doFetch();
      });
    });
  })();

  /* Move static slideshow */
  const slideshowEl = document.getElementById('slideshowStatic');
  const slideshowSlot = document.getElementById('slideshowSlot');
  if (slideshowEl && slideshowSlot) {
    slideshowSlot.replaceWith(slideshowEl);
  }

  /* Header from config */
  (() => {
    const hdr = C.header || {};
    const hName = document.getElementById('headerName');
    if (hName) {
      if (hdr.mostraNome === false) {
        hName.style.display = 'none';
      } else {
        hName.textContent = C.nomeComune || '';
      }
    }

    if (hdr.stemmaUrl) {
      const inner = document.querySelector('.main-header-inner');
      if (inner) {
        const img = document.createElement('img');
        img.src = href(hdr.stemmaUrl);
        img.alt = 'Stemma ' + (C.nomeComune || 'Comune');
        img.className = 'main-header-stemma';
        inner.insertBefore(img, inner.firstChild);
      }
    }

    const fitHeaderName = () => {
      if (!hName) return;
      hName.style.fontSize = '';
      const maxFs = parseFloat(getComputedStyle(hName).fontSize);
      const minFs = 16;
      let fs = maxFs;
      while (fs > minFs && hName.scrollWidth > hName.clientWidth) {
        fs -= 1;
        hName.style.fontSize = fs + 'px';
      }
    };

    if (document.readyState === 'complete') {
      fitHeaderName();
    } else {
      window.addEventListener('load', fitHeaderName);
    }
    window.addEventListener('resize', fitHeaderName);
  })();

  /* Footer from config */
  (() => {
    const f = C.footer || {};
    const elT = document.getElementById('footerTermini');
    const elP = document.getElementById('footerPrivacy');
    const elC = document.getElementById('footerCopy');

    if (elT) {
      elT.href = f.terminiUrl || '#';
      elT.textContent = f.terminiLabel || 'Termini e condizioni';
    }
    if (elP) {
      elP.href = f.privacyUrl || '#';
      elP.textContent = f.privacyLabel || 'Privacy Policy';
    }
    if (elC) {
      const yr = new Date().getFullYear();
      elC.innerHTML = '&copy; ' + yr + ' <a href="'
        + (f.copyrightUrl || 'https://app.comune.digital') + '" '
        + 'id="footerBrand" target="_blank" rel="noopener">'
        + esc(f.copyrightText || 'Comune.Digital') + '</a>';
    }
  })();

  /* DPC script */
  if (C.protezioneCivile.enabled) {
    const s = document.createElement('script');
    s.src = 'https://growapp-dpc-alerts-widget.vercel.app/render.js';
    s.setAttribute('data-api-key', C.protezioneCivile.apiKey);
    s.setAttribute('data-code', C.protezioneCivile.codiceRegione);
    s.setAttribute('data-comune', C.protezioneCivile.nomeComune);
    s.setAttribute('data-url-regione', C.protezioneCivile.urlRegione);
    document.getElementById('dpcScriptMount').appendChild(s);
  }

  /* DATE WIDGET */
  const dayOfYear = (date) => {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = (date - start)
      + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const specialEvents = {
    '1/1': '🎉 Buon Anno!',
    '1/6': '🧙 Befana!',
    '1/27': '🕯 Giorno della Memoria',
    '2/14': '💖 San Valentino!',
    '3/8': '👩 Giornata internazionale della donna',
    '3/17': '🇮🇹 Giornata Unità Nazionale',
    '3/19': '👨 Festa del papà',
    '3/21': '🌸 Giornata della Poesia',
    '3/22': '💧 Giornata Mondiale dell\\'acqua',
    '4/22': '🌍 Giornata della Terra',
    '4/25': '🇮🇹 Festa della Liberazione',
    '5/1': '🛠 Festa dei Lavoratori!',
    '5/9': '🇪🇺 Festa dell\\'Europa',
    '6/2': '🇮🇹 Festa della Repubblica',
    '6/5': '🌳 Giornata dell\\'Ambiente',
    '6/21': '🎶 Festa della Musica',
    '8/15': '☀️ Ferragosto!',
    '10/4': 'San Francesco d\\'Assisi',
    '10/31': '🎃 Halloween!',
    '11/1': '🕯 Tutti i Santi',
    '11/4': '🎖 Giornata Unità e Forze Armate',
    '12/8': '🙏 Immacolata Concezione',
    '12/24': '🎄 Vigilia di Natale',
    '12/25': '🎅 Natale!',
    '12/26': '🎁 Santo Stefano',
    '12/31': '🎊 Vigilia di Capodanno',
  };

  const updateDateWidget = () => {
    const now = new Date();
    const locale = LANG === 'en' ? 'en-GB' : 'it-IT';
    const weekday = now.toLocaleDateString(locale, { weekday: 'long' });
    const formatted = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    const month = now.toLocaleDateString(locale,
      { month: 'long', year: 'numeric' });
    document.getElementById('currentDate').textContent
      = formatted + ' ' + now.getDate() + ' ' + month;

    const key = (now.getMonth() + 1) + '/' + now.getDate();
    const dayNum = dayOfYear(now);
    document.getElementById('specialEvent').textContent
      = specialEvents[key] || (dayNum + '° ' + t('date.dayOfYear'));
  };

  updateDateWidget();

  (() => {
    const now = new Date();
    const ms = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      - now;
    setTimeout(() => {
      updateDateWidget();
      setInterval(updateDateWidget, 86400000);
    }, ms);
  })();

  /* MINI METEO */
  const miniMeteoUrl = 'https://api.open-meteo.com/v1/forecast?latitude='
    + C.lat + '&longitude=' + C.lon
    + '&current=temperature_2m,weather_code&timezone=Europe/Rome';

  const miniWeatherIcon = (code) => {
    const m = {
      0: '☀️',
      1: '🌤️',
      2: '⛅',
      3: '☁️',
      45: '🌫️',
      48: '🌫️',
      51: '🌦️',
      53: '🌦️',
      55: '🌧️',
      61: '🌧️',
      63: '🌧️',
      65: '🌧️',
      71: '🌨️',
      73: '🌨️',
      75: '🌨️',
      80: '🌧️',
      95: '⛈️',
      96: '⛈️',
    };
    return m[code] || '—';
  };

  const fetchMiniMeteo = () => {
    fetch(miniMeteoUrl)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        const c = data.current;
        document.getElementById('weatherIcon').textContent
          = miniWeatherIcon(c.weather_code);
        document.getElementById('temperature').textContent
          = Math.round(c.temperature_2m) + '°C';
      })
      .catch(() => {
        document.getElementById('weatherIcon').textContent = '—';
        document.getElementById('temperature').textContent = '--°C';
      });
  };

  fetchMiniMeteo();
  setInterval(fetchMiniMeteo, 300000);

  /* TICKER RESTYLE */
  const restyleTicker = () => {
    const t = document.querySelector('rssapp-ticker');
    if (!t) return;
    const fsVar = getComputedStyle(document.documentElement)
      .getPropertyValue('--fs-sm').trim() || '13px';
    t.querySelectorAll('*').forEach((el) => {
      el.style.lineHeight = '1.6';
      el.style.fontSize = fsVar;
      el.style.height = 'auto';
      el.style.maxHeight = '32px';
      el.style.overflow = 'hidden';
      el.style.fontFamily = "'Titillium Web',sans-serif";
      if (el.tagName === 'A') {
        el.style.marginRight = '50px';
        el.style.display = 'inline-block';
        el.style.color = getComputedStyle(document.documentElement)
          .getPropertyValue('--blu').trim();
        el.style.textDecoration = 'none';
      }
    });
  };

  setTimeout(restyleTicker, 2000);
  setInterval(restyleTicker, 3000);

  /* SLIDESHOW */
  let sIdx = 0;
  let sPlaying = true;
  let sTimer = null;
  let sTransitioning = false;
  let sUserPaused = false;
  const slides = Array.from(document.querySelectorAll('.slide'));
  const sDots = Array.from(document.querySelectorAll('.slide-dot'));
  const sPrev = document.querySelector('.slide-arrow.prev');
  const sNext = document.querySelector('.slide-arrow.next');
  const sCtaLink = document.getElementById('ctaLink');
  const sCtaText = document.getElementById('ctaText');
  const sContainer = document.querySelector('.w-slideshow');

  const sPreload = () => {
    slides.forEach((slide) => {
      const url = slide.getAttribute('data-bg');
      if (url) {
        const img = new Image();
        img.onload = () => {
          slide.style.setProperty('--bg-image', "url('" + url + "')");
        };
        img.onerror = () => {
          slide.classList.add('error');
        };
        img.src = url;
      }
    });
  };

  const sUpdateCTA = () => {
    const h = (slides[sIdx] ? slides[sIdx].getAttribute('data-href') : '');
    if (h && sCtaLink) sCtaLink.href = h;
  };

  const sSyncDots = () => {
    sDots.forEach((d, i) => {
      const s = slides[i];
      const it = (s ? s.getAttribute('data-title-it') : '') || '';
      const en = (s ? s.getAttribute('data-title-en') : '') || it;
      d.setAttribute('data-title', LANG === 'it' ? it : en);
      d.setAttribute('aria-label', LANG === 'it' ? it : en);
    });
  };

  const sGoTo = (i) => {
    if (sTransitioning || i === sIdx || !slides.length) return;
    if (sCtaLink) sCtaLink.classList.add('disabled');
    sTransitioning = true;
    slides[sIdx].classList.remove('active');
    if (sDots[sIdx]) {
      sDots[sIdx].classList.remove('active');
      sDots[sIdx].setAttribute('aria-selected', 'false');
    }
    sIdx = (i + slides.length) % slides.length;
    slides[sIdx].classList.add('active');
    if (sDots[sIdx]) {
      sDots[sIdx].classList.add('active');
      sDots[sIdx].setAttribute('aria-selected', 'true');
    }
    sUpdateCTA();
    setTimeout(() => {
      sTransitioning = false;
      if (sCtaLink) sCtaLink.classList.remove('disabled');
    }, 620);
  };

  const sNextFn = () => sGoTo(sIdx + 1);
  const sPrevFn = () => sGoTo(sIdx - 1);

  const sPlay = () => {
    if (!sPlaying || sUserPaused) return;
    clearInterval(sTimer);
    sTimer = setInterval(sNextFn, 6000);
  };

  const sPause = () => clearInterval(sTimer);

  const sStop = () => {
    clearInterval(sTimer);
    sPlaying = false;
  };

  const sUpdateTexts = () => {
    slides.forEach((s) => {
      const h1 = s.querySelector('.slide-title');
      if (!h1) return;
      const title = s.getAttribute('data-title-' + LANG)
        || s.getAttribute('data-title-it')
        || h1.textContent;
      h1.textContent = title;
    });
  };

  sPreload();
  sUpdateTexts();
  sSyncDots();
  sUpdateCTA();
  sPlay();

  if (sContainer) {
    let sx = 0, ex = 0, sy = 0, ey = 0;
    let ctaTouch = false;
    const ctaEl = document.querySelector('.slide-cta');

    sContainer.addEventListener(
      'touchstart',
      (e) => {
        sx = ex = e.touches[0].clientX;
        sy = ey = e.touches[0].clientY;
        ctaTouch = ctaEl && ctaEl.contains(e.target);
      },
      { passive: true }
    );

    sContainer.addEventListener(
      'touchmove',
      (e) => {
        if (!ctaTouch) {
          ex = e.touches[0].clientX;
          ey = e.touches[0].clientY;
        }
      },
      { passive: true }
    );

    sContainer.addEventListener(
      'touchend',
      () => {
        if (ctaTouch) {
          ctaTouch = false;
          sx = ex = sy = ey = 0;
          return;
        }
        const dx = sx - ex;
        const dy = sy - ey;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
          sStop();
          dx > 0 ? sNextFn() : sPrevFn();
          sPlaying = true;
          sPlay();
        }
        sx = ex = sy = ey = 0;
        ctaTouch = false;
      },
      { passive: true }
    );

    if (window.matchMedia('(min-width:769px)').matches) {
      sContainer.addEventListener('mouseenter', () => {
        sUserPaused = true;
        sPause();
      });
      sContainer.addEventListener('mouseleave', () => {
        sUserPaused = false;
        if (sPlaying) sPlay();
      });
    }
  }

  sDots.forEach((d, i) => {
    d.addEventListener('click', () => {
      sStop();
      sGoTo(i);
      sPlaying = true;
      if (!sUserPaused) sPlay();
    });
  });

  if (sPrev && sNext) {
    sPrev.addEventListener('click', () => {
      sStop();
      sPrevFn();
      sPlaying = true;
      if (!sUserPaused) sPlay();
    });
    sNext.addEventListener('click', () => {
      sStop();
      sNextFn();
      sPlaying = true;
      if (!sUserPaused) sPlay();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      sStop();
      sPrevFn();
      sPlaying = true;
      if (!sUserPaused) sPlay();
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      sStop();
      sNextFn();
      sPlaying = true;
      if (!sUserPaused) sPlay();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) sPause();
    else if (sPlaying && !sUserPaused) sPlay();
  });

  /* RIPPLE */
  document.addEventListener(
    'pointerdown',
    (e) => {
      const link = e.target.closest('.svc-link');
      if (!link) return;
      const card = link.querySelector('.svc-card');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2.2;
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      const r = document.createElement('span');
      r.className = 'svc-ripple';
      r.style.width = r.style.height = size + 'px';
      r.style.left = x + 'px';
      r.style.top = y + 'px';
      const old = card.querySelector('.svc-ripple');
      if (old) old.remove();
      card.appendChild(r);
      setTimeout(() => { r.remove(); }, 550);
    },
    { passive: true }
  );

  /* RACCOLTA DIFFERENZIATA */
  (() => {
    const FEED_URL = href(C.raccolta.feedRssUrl);
    const PAGE_URL = href(C.raccolta.infoPageUrl);
    const ECO_TIPS = C.raccolta.ecoTips;
    const root = document.getElementById('raccoltaDifferenziata');
    let _lastRdModel = null;

    const fmtDate = (d, opts) => {
      opts = opts || { weekday: 'short', day: '2-digit', month: 'short' };
      const loc = LANG === 'en' ? 'en-GB' : 'it-IT';
      var s = d.toLocaleDateString(loc, opts).split('.').join('');
    return s.charAt(0).toUpperCase() + s.slice(1);
    };

    const toMid = (d) => {
      d = d === undefined ? new Date() : d;
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x;
    };

    const sameDay = (a, b) =>
      a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();

    const findDay = (items, d) =>
      items.filter((it) => sameDay(it.date, d));

    const fetchText = (url, ms) => {
      ms = ms || 8000;
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), ms);
      return fetch(url, { signal: ctrl.signal })
        .then((res) => {
          clearTimeout(tm);
          if (!res.ok) throw new Error();
          return res.text();
        })
        .catch((e) => {
          clearTimeout(tm);
          throw e;
        });
    };

    const parseRSS = (xml) => {
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      return Array.prototype.slice.call(doc.querySelectorAll('item'))
        .map(function(it) {
          const _t = it.querySelector('title');
          const _p = it.querySelector('pubDate');
          return {
            title: (_t && _t.textContent) ? _t.textContent.trim() : '',
            date: new Date((_p ? _p.textContent : '') || '')
          };
        })
        .sort((a, b) => a.date - b.date);
    };

    const chipHtml = (t) =>
      '<span class="rd-chip" title="' + esc(t) + '">'
      + '<i class="fa-solid fa-check"></i> '
      + esc(t) + '</span>';

    const chipNone = () =>
      '<span class="rd-chip rd-chip--none">'
      + '<i class="fa-solid fa-circle-minus"></i> '
      + '<span data-i18n="rd.none">' + esc(t('rd.none'))
      + '</span></span>';

    const renderBase = () => {
      root.innerHTML = '<div class="rd-header">'
        + '<div class="rd-icon" aria-hidden="true">'
        + '<i class="fa-solid fa-recycle"></i></div><div>'
        + '<div class="rd-title" data-i18n="rd.title">'
        + esc(t('rd.title')) + '</div>'
        + '<div class="rd-sub" data-i18n="rd.sub">'
        + esc(t('rd.sub')) + '</div></div>'
        + '<div class="rd-badge" id="rdBadge">'
        + '<span data-i18n="rd.today">'
        + esc(t('rd.today')) + '</span> • '
        + fmtDate(new Date()) + '</div></div>'
        + '<div class="rd-section" id="rdToday"><h3>'
        + '<i class="fa-solid fa-calendar-day"></i> '
        + '<span data-i18n="rd.today">'
        + esc(t('rd.today')) + '</span></h3>'
        + '<div class="rd-chips" id="chipsToday"></div></div>'
        + '<div class="rd-section" id="rdAgenda">'
        + '<div class="rd-accordion">'
        + '<div class="rd-acc-head" id="rdAccHead">'
        + '<span><i class="fa-solid fa-list-ul"></i> '
        + '<span data-i18n="rd.next3">'
        + esc(t('rd.next3')) + '</span></span>'
        + '<i class="fa-solid fa-chevron-down" '
        + 'id="rdAccArrow"></i></div>'
        + '<div class="rd-acc-body" id="rdAccBody"></div>'
        + '</div></div>'
        + '<div class="rd-cta"><a class="rd-btn" '
        + 'href="' + esc(PAGE_URL) + '" rel="noopener">'
        + '<i class="fa-solid fa-circle-info"></i> '
        + '<span data-i18n="rd.info">'
        + esc(t('rd.info')) + '</span></a></div>'
        + '<div class="eco-tip" id="ecoTip" '
        + 'style="display:none">'
        + '<i class="fa-regular fa-lightbulb"></i><div>'
        + '<strong data-i18n="rd.eco">'
        + esc(t('rd.eco')) + '</strong>'
        + '<div id="ecoText"></div></div></div>';

      const _ah = document.getElementById('rdAccHead');
      if (_ah) {
        _ah.addEventListener('click', () => {
          const _ab = document.getElementById('rdAccBody');
          if (_ab) _ab.classList.toggle('open');
          const _aa = document.getElementById('rdAccArrow');
          if (_aa) _aa.classList.toggle('fa-rotate-180');
        });
      }
    };

    const renderEcoOnly = () => {
      (() => {
        const _e = document.getElementById('rdToday');
        if (_e) _e.remove();
      })();
      (() => {
        const _e = document.getElementById('rdAgenda');
        if (_e) _e.remove();
      })();
      const box = document.getElementById('ecoTip');
      const txt = document.getElementById('ecoText');
      if (!box || !txt) return;
      txt.textContent = ECO_TIPS[Math.floor(Math.random() * ECO_TIPS.length)];
      box.style.display = 'flex';
    };

    const renderToday = (titles) => {
      const w = document.getElementById('chipsToday');
      if (!w) return;
      w.innerHTML = (!titles || !titles.length)
        ? chipNone()
        : titles.map(chipHtml).join('');
    };

    const renderAgenda = (days) => {
      const b = document.getElementById('rdAccBody');
      if (!b) return;
      if (!days || !days.length) {
        b.innerHTML = '<div class="day-row">'
          + '<div class="day-date">N/D</div><div>'
          + chipNone() + '</div></div>';
        return;
      }
      b.innerHTML = days.map((d) =>
        '<div class="day-row">'
        + '<div class="day-date">' + esc(d.label) + '</div><div>'
        + (d.titles.length
          ? d.titles.map(chipHtml).join('')
          : chipNone())
        + '</div></div>'
      ).join('');
    };

    const buildModel = (items) => {
      const today = toMid();
      const tom = new Date(today);
      tom.setDate(today.getDate() + 1);
      const days = [];
      for (let i = 1; i <= 3; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        days.push({
          date: d,
          label: fmtDate(d),
          titles: findDay(items, d).map((it) => it.title),
        });
      }
      return {
        todayTitles: findDay(items, today).map((it) => it.title),
        tomorrowTitles: findDay(items, tom).map((it) => it.title),
        agendaDays: days,
      };
    };

    const applyModel = (m) => {
      _lastRdModel = m;
      renderBase();
      const hr = new Date().getHours();
      const noData = (!(m.todayTitles && m.todayTitles.length))
        && (!(m.tomorrowTitles && m.tomorrowTitles.length));
      if (hr < 12 || noData) {
        renderEcoOnly();
        return;
      }
      renderToday(m.todayTitles);
      renderAgenda(m.agendaDays);
    };

    window.reRenderRaccolta = () => {
      if (_lastRdModel) {
        _lastRdModel.agendaDays.forEach((d) => {
          if (d.date) d.label = fmtDate(d.date);
        });
        applyModel(_lastRdModel);
      }
    };

    const loadRD = () => {
      fetchText(FEED_URL)
        .then((xml) => {
          const items = parseRSS(xml);
          const m = buildModel(items);
          applyModel(m);
          try {
            localStorage.setItem('rd_cache_v2',
              JSON.stringify({
                ts: Date.now(),
                model: m,
              }));
          } catch (e) {}
        })
        .catch((e) => {
          try {
            const c = JSON.parse(localStorage.getItem('rd_cache_v2'));
            if (c && c.model) {
              applyModel(c.model);
              return;
            }
          } catch (e2) {}
          renderBase();
          renderEcoOnly();
        });
    };

    loadRD();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) loadRD();
    });

    (function rdMidnightCheck() {
      var ms = new Date(new Date().getFullYear(),
        new Date().getMonth(),
        new Date().getDate() + 1) - new Date();
      setTimeout(function() {
        loadRD();
        rdMidnightCheck();
      }, ms);
    })();
  })();

  /* METEO */
  (() => {
    const MC = C.meteo;
    const METEO_CFG = {
      name: C.nomeComune,
      lat: C.lat,
      lon: C.lon,
      weeklyUrl: href(MC.weeklyForecastUrl),
      interval: MC.updateIntervalMin,
      timeout: MC.timeoutMs,
    };

    const pad2 = (n) => ('0' + n).slice(-2);

    const nowTime = () => {
      const d = new Date();
      return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    };

    const chip = (html) => '<span class="m-chip">' + html + '</span>';

    const nowEl = document.getElementById('meteoNow');
    const detEl = document.getElementById('meteoDet');
    const cityEl = document.getElementById('mwCity');
    const badgeEl = document.getElementById('mwBadge');
    const weeklyBtn = document.getElementById('meteoWeekly');
    const loader = document.getElementById('meteoLoader');
    const err = document.getElementById('meteoError');
    const errmsg = document.getElementById('meteoErrmsg');
    const retry = document.getElementById('meteoRetry');
    const accHead = document.getElementById('meteoAccHead');
    const accBody = document.getElementById('meteoAccBody');
    const chev = document.getElementById('meteoChev');

    let _lastMeteo = null;

    const showLoader = (v) => {
      if (loader) loader.classList.toggle('visible', !!v);
    };

    const showErr = (m) => {
      if (errmsg) errmsg.textContent = m || 'Errore';
      if (err) err.classList.add('visible');
      showLoader(false);
    };

    const hideErr = () => {
      if (err) err.classList.remove('visible');
    };

    const iconFor = (c) => {
      if (c === 0) return 'fa-sun';
      if ([1, 2].includes(c)) return 'fa-cloud-sun';
      if (c === 3) return 'fa-cloud';
      if ([45, 48].includes(c)) return 'fa-smog';
      if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]
        .includes(c))
        return 'fa-cloud-showers-heavy';
      if ([71, 73, 75, 77, 85, 86].includes(c)) return 'fa-snowflake';
      if ([95, 96, 99].includes(c)) return 'fa-cloud-bolt';
      return 'fa-circle-question';
    };

    const descFor = (c) => {
      const k = 'w.' + c;
      return t(k) !== k ? t(k) : 'N/D';
    };

    const render = (cur, daily) => {
      _lastMeteo = { cur, daily };
      if (cityEl) cityEl.textContent = METEO_CFG.name;
      if (badgeEl) badgeEl.textContent = 'Agg. ' + nowTime();

      const temp = Math.round(cur.temperature_2m);
      const tMax = Math.round(daily.temperature_2m_max[0]);
      const tMin = Math.round(daily.temperature_2m_min[0]);
      const ico = iconFor(cur.weather_code);
      const desc = descFor(cur.weather_code);

      if (nowEl) {
        nowEl.innerHTML = [
          chip('<i class="fa-solid ' + ico + '"></i> ' + desc),
          chip('<i class="fa-solid fa-temperature-half"></i> '
            + temp + '°C'),
          chip('<i class="fa-solid fa-arrow-trend-up"></i> ↑'
            + tMax + '° • ↓' + tMin + '°C'),
        ].join('');
      }

      const hum = Math.round(cur.relative_humidity_2m);
      const wind = Math.round(cur.wind_speed_10m);
      const pprob = (daily.precipitation_probability_max
        ? daily.precipitation_probability_max[0]
        : '--');
      const press = Math.round(cur.surface_pressure);

      if (detEl) {
        detEl.innerHTML = [
          chip('<i class="fa-solid fa-droplet"></i> '
            + t('meteo.humidity') + ' ' + hum + '%'),
          chip('<i class="fa-solid fa-wind"></i> '
            + t('meteo.wind') + ' ' + wind + ' km/h'),
          chip('<i class="fa-solid fa-umbrella"></i> '
            + t('meteo.rain') + ' ' + pprob + '%'),
          chip('<i class="fa-solid fa-gauge"></i> '
            + t('meteo.pressure') + ' ' + press + ' hPa'),
        ].join('');
      }
    };

    window.reRenderMeteo = () => {
      if (_lastMeteo) render(_lastMeteo.cur, _lastMeteo.daily);
    };

    const loadMeteo = () => {
      hideErr();
      showLoader(true);
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), METEO_CFG.timeout);
      const url = 'https://api.open-meteo.com/v1/forecast?latitude='
        + METEO_CFG.lat + '&longitude=' + METEO_CFG.lon
        + '&current=temperature_2m,relative_humidity_2m,'
        + 'precipitation,weather_code,surface_pressure,'
        + 'wind_speed_10m&daily=temperature_2m_max,'
        + 'temperature_2m_min,precipitation_probability_max'
        + '&timezone=Europe/Rome';

      fetch(url, { signal: ctrl.signal })
        .then((res) => {
          clearTimeout(tm);
          if (!res.ok) throw new Error();
          return res.json();
        })
        .then((data) => {
          render(data.current, data.daily);
          showLoader(false);
        })
        .catch((e) => {
          showErr(e.name === 'AbortError'
            ? 'Timeout'
            : 'Dati non disponibili');
          showLoader(false);
        });
    };

    if (weeklyBtn) {
      weeklyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.parent) {
          window.parent.location.href = METEO_CFG.weeklyUrl;
        } else {
          window.location.href = METEO_CFG.weeklyUrl;
        }
      });
    }

    if (retry) {
      retry.addEventListener('click', (e) => {
        e.preventDefault();
        loadMeteo();
      });
    }

    if (accHead) {
      accHead.addEventListener('click', () => {
        if (accBody) accBody.classList.toggle('open');
        if (chev) chev.classList.toggle('fa-rotate-180');
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) loadMeteo();
    });

    loadMeteo();
    setInterval(loadMeteo, METEO_CFG.interval * 60 * 1000);
  })();

  /* LANGUAGE SWITCHER */
  const applyLang = (lang) => {
    LANG = lang;
    localStorage.setItem('cd_lang', lang);
    const flagBtn = document.getElementById('langToggle');
    if (flagBtn) {
      const otherLang = lang === 'it' ? 'en' : 'it';
      flagBtn.textContent = C.i18n.lingue[otherLang] || '🌐';
    }

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const val = t(key);
      if (val !== key) el.textContent = val;
    });

    document.querySelectorAll('[data-i18n-it]').forEach((el) => {
      const txt = el.getAttribute('data-i18n-' + lang)
        || el.getAttribute('data-i18n-it');
      if (txt) el.textContent = txt;
    });

    document.querySelectorAll('.slide').forEach((slide) => {
      const title = slide.getAttribute('data-title-' + lang)
        || slide.getAttribute('data-title-it');
      const h1 = slide.querySelector('.slide-title');
      if (h1 && title) h1.textContent = title;
    });

    document.title = (lang === 'en' ? 'Home' : 'Home')
      + ' – ' + C.nomeComune + ' – Comune.Digital';

    if (typeof updateDateWidget === 'function') updateDateWidget();
    if (typeof window.reRenderMeteo === 'function') window.reRenderMeteo();
    if (typeof window.reRenderRaccolta === 'function') {
      window.reRenderRaccolta();
    }
  };

  const langBtn = document.getElementById('langToggle');
  if (langBtn) {
    langBtn.addEventListener('click', () => {
      applyLang(LANG === 'it' ? 'en' : 'it');
    });
  }

  applyLang(LANG);
})();

/* ACCESSIBILITY */
(function(){
  "use strict";
  var C=window.COMUNE_CONFIG;var A=C.accessibilita||{};var root=document.documentElement;var liveEl=document.getElementById('a11yLive');
  function announce(msg){if(!liveEl)return;liveEl.textContent='';requestAnimationFrame(function(){liveEl.textContent=msg;});}
  function saveP(k,v){try{localStorage.setItem('cd_a11y_'+k,JSON.stringify(v));}catch(e){}}
  function loadP(k,d){try{var v=localStorage.getItem('cd_a11y_'+k);return v!==null?JSON.parse(v):d;}catch(e){return d;}}
  var darkOn=false;var contrastOn=false;var fontScale=0;var maxScale=A.maxFontScale||4;
  var fab=document.getElementById('a11yFab'),panel=document.getElementById('a11yPanel');
  var btnDark=document.getElementById('a11yDark'),btnContr=document.getElementById('a11yContrast');
  var btnFUp=document.getElementById('a11yFontUp'),btnFDn=document.getElementById('a11yFontDown');
  var fontVal=document.getElementById('a11yFontVal'),btnReset=document.getElementById('a11yReset');
  if(!A.abilitaDarkMode)(function(){var _e=document.getElementById('a11yRowDark');if(_e)_e.remove();}());
  if(!A.abilitaContrasto)(function(){var _e=document.getElementById('a11yRowContrast');if(_e)_e.remove();}());
  if(!A.abilitaFontScale)(function(){var _e=document.getElementById('a11yRowFont');if(_e)_e.remove();}());
  function applyDark(on) {
    darkOn = !!on;
    root.setAttribute('data-theme', darkOn ? 'dark' : 'light');
    if (btnDark) {
      btnDark.setAttribute('aria-pressed', String(darkOn));
      btnDark.querySelector('i').className = darkOn
        ? 'fa-solid fa-sun a11y-btn-icon'
        : 'fa-solid fa-moon a11y-btn-icon';
    }
    saveP('dark', darkOn);
  }
  function applyContrast(on) {
    contrastOn = !!on;
    if (contrastOn) root.setAttribute('data-contrast', 'high');
    else root.removeAttribute('data-contrast');
    if (btnContr) btnContr.setAttribute('aria-pressed', String(contrastOn));
    saveP('contrast', contrastOn);
  }
  function applyFontScale(level) {
    fontScale = Math.max(0, Math.min(maxScale, level));
    if (fontScale > 0) root.setAttribute('data-fontscale', String(fontScale));
    else root.removeAttribute('data-fontscale');
    if (fontVal) fontVal.textContent = String(fontScale);
    saveP('fontscale', fontScale);
  }
  if (fab) fab.addEventListener('click', () => {
    const open = panel.classList.toggle('open');
    fab.setAttribute('aria-expanded', String(open));
    fab.setAttribute('aria-label', open
      ? 'Chiudi impostazioni accessibilità'
      : 'Apri impostazioni accessibilità');
    if (open) announce('Pannello accessibilità aperto');
  });
  document.addEventListener('pointerdown', (e) => {
    if (!(panel && panel.classList.contains('open'))) return;
    if (!panel.contains(e.target) && !(fab && fab.contains(e.target))) {
      panel.classList.remove('open');
      if (fab) fab.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel && panel.classList.contains('open')) {
      panel.classList.remove('open');
      if (fab) fab.setAttribute('aria-expanded', 'false');
      if (fab) fab.focus();
    }
  });
  if (btnDark) btnDark.addEventListener('click', () => {
    applyDark(!darkOn);
    announce(darkOn ? 'Tema scuro attivato' : 'Tema chiaro attivato');
  });
  if (btnContr) btnContr.addEventListener('click', () => {
    applyContrast(!contrastOn);
    announce(contrastOn ? 'Alto contrasto attivato' : 'Alto contrasto disattivato');
  });
  if (btnFUp) btnFUp.addEventListener('click', () => {
    if (fontScale >= maxScale) return;
    applyFontScale(fontScale + 1);
    announce('Testo ingrandito: livello ' + fontScale);
  });
  if (btnFDn) btnFDn.addEventListener('click', () => {
    if (fontScale <= 0) return;
    applyFontScale(fontScale - 1);
    announce(fontScale === 0 ? 'Dimensione testo predefinita' : 'Testo ridotto: livello ' + fontScale);
  });
  if (btnReset) btnReset.addEventListener('click', () => {
    applyDark(false);
    applyContrast(false);
    applyFontScale(0);
    announce('Impostazioni di accessibilità ripristinate');
  });
  const storedDark = loadP('dark', null);
  if (storedDark !== null) {
    applyDark(storedDark);
  } else if (A.rispettaSistema && window.matchMedia('(prefers-color-scheme:dark)').matches) {
    applyDark(true);
  } else {
    applyDark(false);
  }
  applyContrast(loadP('contrast', false));
  applyFontScale(loadP('fontscale', 0));
  if (A.rispettaSistema) {
    window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change', (e) => {
      if (loadP('dark', null) === null) {
        applyDark(e.matches);
        announce(e.matches ? 'Tema scuro attivato (sistema)' : 'Tema chiaro attivato (sistema)');
      }
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') root.classList.add('keyboard-nav');
  });
  document.addEventListener('mousedown', () => root.classList.remove('keyboard-nav'));
})();

/* SPOTLIGHT */
(function() {
  "use strict";
  const C = window.COMUNE_CONFIG;
  const S = C.spotlight || {};
  if (!S.widgetId) return;
  const STORAGE_KEY = 'cd_spotlight_date';
  const today = new Date().toISOString().slice(0, 10);
  if (!S.forzaSempre) {
    try { if (localStorage.getItem(STORAGE_KEY) === today) return; } catch(e) {}
  }
  const durata = S.durata || 2500;

  function startSpotlight() {
    const widget = document.getElementById(S.widgetId);
    if (!widget) return;
    try { localStorage.setItem(STORAGE_KEY, today); } catch(e) {}
    const overlay = document.createElement('div');
    overlay.className = 'spotlight-overlay';
    document.body.appendChild(overlay);

    function closeSpotlight() {
      widget.classList.remove('spotlight-center');
      widget.style.transform = '';
      overlay.classList.remove('active');
      setTimeout(() => {
        widget.classList.remove('spotlight-active', 'spotlight-target');
        widget.style.zIndex = '';
        if (overlay.parentNode) overlay.remove();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 700);
    }
    overlay.addEventListener('click', closeSpotlight);
    widget.scrollIntoView({ behavior: 'smooth', block: 'center' });

    setTimeout(() => {
      const rect = widget.getBoundingClientRect();
      const viewH = window.innerHeight;
      const viewW = window.innerWidth;
      const widgetCenterY = rect.top + rect.height / 2;
      const widgetCenterX = rect.left + rect.width / 2;
      const deltaY = (viewH / 2) - widgetCenterY;
      const deltaX = (viewW / 2) - widgetCenterX;
      const scaleVal = Math.min(1.08, (viewW - 32) / rect.width);
      widget.classList.add('spotlight-target');
      overlay.classList.add('active');
      requestAnimationFrame(() => {
        widget.classList.add('spotlight-active');
        widget.style.transform = 'translate(' + deltaX + 'px,' + deltaY + 'px) scale(' + scaleVal + ')';
        widget.style.zIndex = '8001';
        setTimeout(() => { widget.classList.add('spotlight-center'); }, 650);
        setTimeout(closeSpotlight, durata);
      });
    }, 600);
  }

  if (document.readyState === 'complete') {
    setTimeout(startSpotlight, 1000);
  } else {
    window.addEventListener('load', () => { setTimeout(startSpotlight, 1000); });
  }
})();`;
  }

  /* ============================================================
     PUBLIC API
     ============================================================ */
  return { render, generateHTML };
})();

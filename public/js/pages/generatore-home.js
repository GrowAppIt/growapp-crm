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

  /* ============================================================
     FA ICONS LIST
     ============================================================ */
  const FA_ICONS = [
    'fa-building-columns','fa-gears','fa-triangle-exclamation','fa-newspaper','fa-screwdriver-wrench',
    'fa-user-doctor','fa-recycle','fa-helmet-safety','fa-book-open','fa-map-location-dot',
    'fa-bus','fa-graduation-cap','fa-calendar-days','fa-house-medical','fa-baby',
    'fa-tree-city','fa-landmark','fa-phone','fa-envelope','fa-wifi',
    'fa-utensils','fa-futbol','fa-music','fa-church','fa-mountain-sun',
    'fa-water','fa-masks-theater','fa-paw','fa-dumbbell','fa-paintbrush',
    'fa-mosque','fa-hands-praying','fa-users','fa-id-card','fa-camera',
    'fa-store','fa-car','fa-bicycle','fa-leaf','fa-shield-halved'
  ];

  /* ============================================================
     STATE
     ============================================================ */
  function getDefaultState() {
    return {
      nomeComune: '', baseUrl: '', pageTitle: '', stemmaUrl: '',
      lat: '', lon: '',
      colorePrimario: '#145284', coloreSecondario: '#3CA434',
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
      bannerScattiTitleIt: 'Vista da Te', bannerScattiTitleEn: 'Seen from You',
      bannerScattiSubtitle: 'I vostri scatti più belli', bannerScattiHref: '',
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
      widgets: [
        { id: 'dateHeader', label: 'Barra Data', enabled: true, order: 0 },
        { id: 'tickerBar', label: 'Ticker News', enabled: true, order: 1 },
        { id: 'slideshow', label: 'Slideshow', enabled: true, order: 2 },
        { id: 'servizi', label: 'Servizi', enabled: true, order: 3 },
        { id: 'bannerScatti', label: 'Banner "Vista da Te"', enabled: true, order: 4 },
        { id: 'bannerCIE', label: 'Banner CIE', enabled: true, order: 5 },
        { id: 'raccoltaDifferenziata', label: 'Raccolta Differenziata', enabled: true, order: 6 },
        { id: 'protezioneCivile', label: 'Protezione Civile', enabled: true, order: 7 },
        { id: 'meteoCard', label: 'Meteo', enabled: true, order: 8 },
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
    let opts = FA_ICONS.map(ic => '<option value="'+ic+'" '+(ic===selected?'selected':'')+'>'+ic.replace('fa-','')+'</option>').join('');
    return '<select id="'+id+'" style="width:100%;padding:10px 14px;border:1px solid #d0d0d0;border-radius:8px;font-family:\'Titillium Web\',sans-serif;font-size:14px;">'+opts+'</select>';
  }

  /* ============================================================
     RENDER – FORM UI
     ============================================================ */
  function render() {
    const el = document.getElementById('mainContent');
    if (!el) return;

    let formHtml = '';

    // HEADER
    formHtml += '<div style="max-width:900px;margin:0 auto;padding:20px;font-family:\'Titillium Web\',sans-serif;">';
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
      '<button type="button" id="ghBtnSaveConfig" style="background:#145284;color:#fff;border:none;padding:12px 20px;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;font-family:\'Titillium Web\',sans-serif;width:100%;"><i class="fas fa-save"></i> Salva Configurazione</button>',
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
    formHtml += makeSection('fa-palette', 'Palette Colori',
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:16px;">' +
        '<div><label style="display:block;font-weight:600;color:#4A4A4A;margin-bottom:6px;font-size:13px;">Colore Principale</label>' +
          '<div style="display:flex;align-items:center;gap:12px;"><input type="color" id="ghColorePrimario" value="'+esc(state.colorePrimario)+'" style="width:60px;height:40px;border:none;cursor:pointer;border-radius:8px;">' +
          '<span id="ghColorePrimarioHex" style="font-weight:700;font-size:14px;color:#4A4A4A;">'+esc(state.colorePrimario)+'</span></div></div>' +
        '<div><label style="display:block;font-weight:600;color:#4A4A4A;margin-bottom:6px;font-size:13px;">Colore Secondario</label>' +
          '<div style="display:flex;align-items:center;gap:12px;"><input type="color" id="ghColoreSecondario" value="'+esc(state.coloreSecondario)+'" style="width:60px;height:40px;border:none;cursor:pointer;border-radius:8px;">' +
          '<span id="ghColoreSecondarioHex" style="font-weight:700;font-size:14px;color:#4A4A4A;">'+esc(state.coloreSecondario)+'</span></div></div>' +
      '</div>' +
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

    // === SEZ. 8: BANNER "VISTA DA TE" ===
    formHtml += makeSection('fa-camera', 'Banner "Vista da Te"',
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
        makeInput('ghBannerScattiTitleIt','Titolo IT',state.bannerScattiTitleIt,'Vista da Te') +
        makeInput('ghBannerScattiTitleEn','Titolo EN',state.bannerScattiTitleEn,'Seen from You') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
        makeInput('ghBannerScattiSubtitle','Sottotitolo',state.bannerScattiSubtitle,'I vostri scatti più belli') +
        makeInput('ghBannerScattiHref','Link',state.bannerScattiHref,'nomecomune-vista-da-te') +
      '</div>',
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

    // === SEZ. 13: FOOTER ===
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
        '<option value="bannerScatti">Banner Scatti</option><option value="bannerCIE">Banner CIE</option>' +
        '<option value="raccoltaDifferenziata">Raccolta Differenziata</option>' +
        '<option value="protezioneCivile">Protezione Civile</option><option value="meteoCard">Meteo</option>' +
      '</select></div>' +
      makeInput('ghSpotlightDurata','Durata (ms)',String(state.spotlightDurata),'2500','number') +
      makeCheckbox('ghSpotlightForzaSempre','Forza Sempre (per test)',state.spotlightForzaSempre),
      false
    );

    // === BOTTONI ===
    formHtml += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin:24px 0 40px;">' +
      '<button type="button" id="ghBtnGenera" style="background:#145284;color:#fff;border:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px;cursor:pointer;font-family:\'Titillium Web\',sans-serif;box-shadow:0 4px 12px rgba(20,82,132,.3);"><i class="fas fa-download"></i> Genera HTML</button>' +
      '<button type="button" id="ghBtnPreview" style="background:#3CA434;color:#fff;border:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px;cursor:pointer;font-family:\'Titillium Web\',sans-serif;box-shadow:0 4px 12px rgba(60,164,52,.3);"><i class="fas fa-eye"></i> Anteprima</button>' +
    '</div>';

    formHtml += '</div>'; // close container

    el.innerHTML = formHtml;

    // === ATTACH EVENTS ===
    attachEvents();
    refreshSlides();
    refreshServizi();
    refreshWidgetList();
    updatePalettePreview();
    if (!firebaseAvailable) showFirebaseWarning();
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

    // Color pickers
    const cp = document.getElementById('ghColorePrimario');
    const cs = document.getElementById('ghColoreSecondario');
    if (cp) cp.addEventListener('input', e => {
      state.colorePrimario = e.target.value;
      const hex = document.getElementById('ghColorePrimarioHex');
      if (hex) hex.textContent = e.target.value;
      updatePalettePreview();
    });
    if (cs) cs.addEventListener('input', e => {
      state.coloreSecondario = e.target.value;
      const hex = document.getElementById('ghColoreSecondarioHex');
      if (hex) hex.textContent = e.target.value;
      updatePalettePreview();
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

    // Preview
    document.getElementById('ghBtnPreview')?.addEventListener('click', () => {
      collectState();
      if (!state.nomeComune) { alert('Inserisci il nome del comune!'); return; }
      const html = generateHTML();
      const w = window.open('', '_blank');
      w.document.write(html);
      w.document.close();
    });


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
  }

  /* ============================================================
     DYNAMIC FORM – SLIDES
     ============================================================ */
  function refreshSlides() {
    const c = document.getElementById('ghSlidesContainer');
    if (!c) return;
    collectSlidesFromDOM(); // salva prima di ricostruire
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
     DYNAMIC FORM – SERVIZI
     ============================================================ */
  function refreshServizi() {
    const c = document.getElementById('ghServiziContainer');
    if (!c) return;
    collectServiziFromDOM();
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
              FA_ICONS.map(ic => '<option value="'+ic+'" '+(ic===it.icon?'selected':'')+'>'+ic.replace('fa-','')+'</option>').join('') +
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
  function refreshWidgetList() {
    const c = document.getElementById('ghWidgetList');
    if (!c) return;
    collectWidgetsFromDOM();
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
  const firebaseAvailable = typeof firebase !== 'undefined' && firebase.firestore && typeof AuthService !== 'undefined' && AuthService.getCurrentUser;

  function showFirebaseWarning() {
    const w = document.getElementById('ghFirebaseWarning');
    if (w) w.style.display = 'block';
    const btns = [document.getElementById('ghBtnSaveConfig'), document.getElementById('ghBtnLoadConfig'), document.getElementById('ghBtnDeleteConfig')];
    btns.forEach(b => { if (b) b.disabled = true; });
  }

  async function loadConfigList() {
    const sel = document.getElementById('ghConfigSelect');
    if (!sel || !firebaseAvailable) return;
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
    if (!firebaseAvailable) { alert('Firebase non disponibile'); return; }
    collectState();
    if (!state.nomeComune) { alert('Inserisci il nome del comune!'); return; }
    try {
      const db = firebase.firestore();
      const docId = state.nomeComune.toLowerCase().replace(/\s+/g, '-');
      const user = AuthService.getCurrentUser();
      const timestamp = new Date();
      await db.collection('generatore-home-configs').doc(docId).set({
        config: state,
        nomeComune: state.nomeComune,
        updatedAt: timestamp,
        createdBy: user ? user.email : 'unknown'
      });
      alert('Configurazione salvata!');
      await loadConfigList();
    } catch (err) {
      console.error('Error saving config:', err);
      alert('Errore durante il salvataggio: ' + err.message);
    }
  }

  async function loadConfig(docId) {
    if (!firebaseAvailable) { alert('Firebase non disponibile'); return; }
    try {
      const db = firebase.firestore();
      const doc = await db.collection('generatore-home-configs').doc(docId).get();
      if (doc.exists) {
        const data = doc.data();
        state = Object.assign(getDefaultState(), data.config || {});
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
    if (!firebaseAvailable) { alert('Firebase non disponibile'); return; }
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
    const p = generatePalette(state.colorePrimario);
    const g = generatePalette(state.coloreSecondario);
    const box = (color, label) => '<div style="text-align:center;"><div style="width:40px;height:40px;border-radius:10px;background:'+color+';border:1px solid rgba(0,0,0,.1);margin:0 auto 4px;"></div><div style="font-size:10px;color:#4A4A4A;">'+label+'</div></div>';
    el.innerHTML = '<div style="margin-bottom:8px;font-size:12px;font-weight:700;color:#145284;width:100%;">Primario</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' +
        box(p['900'],'900') + box(p['700'],'700') + box(p['500'],'500') + box(p['300'],'300') + box(p['100'],'100') +
      '</div>' +
      '<div style="margin-bottom:8px;font-size:12px;font-weight:700;color:#3CA434;width:100%;">Secondario</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        box(g['900'],'900') + box(g['700'],'700') + box(g['500'],'500') + box(g['300'],'300') + box(g['100'],'100') +
      '</div>';
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
    state.tickerRssId = v('ghTickerRssId');
    state.tickerLinkUrl = v('ghTickerLinkUrl');
    collectSlidesFromDOM();
    collectServiziFromDOM();
    collectWidgetsFromDOM();
    state.bannerScattiTitleIt = v('ghBannerScattiTitleIt');
    state.bannerScattiTitleEn = v('ghBannerScattiTitleEn');
    state.bannerScattiSubtitle = v('ghBannerScattiSubtitle');
    state.bannerScattiHref = v('ghBannerScattiHref');
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
    set('ghTickerRssId', state.tickerRssId);
    set('ghTickerLinkUrl', state.tickerLinkUrl);
    set('ghBannerScattiTitleIt', state.bannerScattiTitleIt);
    set('ghBannerScattiTitleEn', state.bannerScattiTitleEn);
    set('ghBannerScattiSubtitle', state.bannerScattiSubtitle);
    set('ghBannerScattiHref', state.bannerScattiHref);
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
    refreshSlides();
    refreshServizi();
    refreshWidgetList();
    updatePalettePreview();
  }

  /* ============================================================
     GENERATE HTML – ORCHESTRATOR
     ============================================================ */
  function generateHTML() {
    collectState();
    const S = state;
    const bp = generatePalette(S.colorePrimario);
    const gp = generatePalette(S.coloreSecondario);
    const dbp = generateDarkPalette(bp, S.colorePrimario);
    const dgp = generateDarkPalette(gp, S.coloreSecondario);
    const BASE = S.baseUrl.replace(/\/+$/, '');

    // Build slides HTML
    let slidesHtml = '';
    S.slides.forEach((sl, i) => {
      const hrefFull = sl.href.startsWith('http') ? sl.href : BASE + '/' + sl.href;
      const bgFull = sl.bg.startsWith('http') ? sl.bg : BASE + '/' + sl.bg;
      slidesHtml += '    <article class="slide' + (i===0?' active':'') + '"\n' +
        '             data-href="' + hrefFull + '"\n' +
        '             data-bg="' + bgFull + '"\n' +
        '             data-title-it="' + esc(sl.titleIt) + '" data-title-en="' + esc(sl.titleEn) + '"\n' +
        '             aria-label="' + esc(sl.titleIt) + '">\n' +
        '      <div class="slide-content"><div class="slide-textbox">\n' +
        '        <h1 class="slide-title">' + esc(sl.titleIt) + '</h1>\n' +
        '      </div></div>\n' +
        '    </article>\n\n';
    });

    let dotsHtml = '';
    S.slides.forEach((sl, i) => {
      dotsHtml += '      <button class="slide-dot' + (i===0?' active':'') + '" data-title="' + esc(sl.titleIt) + '" role="tab" aria-selected="' + (i===0?'true':'false') + '" aria-label="' + esc(sl.titleIt) + '"></button>\n';
    });

    // Build COMUNE_CONFIG
    const config = buildConfig(S, BASE);

    // Build servizi for config
    const serviziJson = JSON.stringify(S.servizi.map(sec => ({
      sectionIt: sec.sectionIt, sectionEn: sec.sectionEn,
      items: sec.items.map(it => ({ icon: it.icon, labelIt: it.labelIt, labelEn: it.labelEn, href: it.href }))
    })), null, 6);

    // Assemble full HTML
    return buildFullHTML(bp, gp, dbp, dgp, config, slidesHtml, dotsHtml, S);
  }

  /* ============================================================
     BUILD CONFIG OBJECT (as JS string)
     ============================================================ */
  function buildConfig(S, BASE) {
    const q = s => JSON.stringify(s);
    const serviziStr = JSON.stringify(S.servizi.map(sec => ({
      sectionIt: sec.sectionIt, sectionEn: sec.sectionEn,
      items: sec.items.map(it => ({ icon: it.icon, labelIt: it.labelIt, labelEn: it.labelEn, href: it.href }))
    })), null, 4);
    const tipsStr = JSON.stringify(S.raccoltaEcoTips, null, 6);

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
    bannerScatti: {
      titleIt:    ${q(S.bannerScattiTitleIt)},
      titleEn:    ${q(S.bannerScattiTitleEn)},
      subtitle:   ${q(S.bannerScattiSubtitle)},
      href:       ${q(S.bannerScattiHref)},
    },
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
    widgets: ${JSON.stringify(S.widgets)},
    i18n: {
      defaultLang: "it",
      lingue: { it: "\\u{1F1EE}\\u{1F1F9}", en: "\\u{1F1EC}\\u{1F1E7}" },
      ui: {
        "ticker.title":        { it: "news dal Comune", en: "Municipal News" },
        "slide.cta":           { it: "Apri sezione", en: "Open section" },
        "banner.subtitle":     { it: ${q(S.bannerScattiSubtitle)}, en: "Your most beautiful shots" },
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
  function buildFullHTML(bp, gp, dbp, dgp, configScript, slidesHtml, dotsHtml, S) {
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
  <link href="https://fonts.googleapis.com/css2?family=Titillium+Web:wght@300;400;600;700;900&display=swap" rel="stylesheet">
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

  <section class="w-slideshow" id="slideshowStatic" role="region" aria-roledescription="carousel" aria-label="Sezioni principali" aria-live="polite">
${slidesHtml}
    <div class="slide-cta">
      <a id="ctaLink" href="#" aria-label="Apri la sezione corrente">
        <i class="fa-solid fa-arrow-right"></i> <span id="ctaText" data-i18n="slide.cta">Apri sezione</span>
      </a>
    </div>
    <div class="slide-nav" aria-hidden="true">
      <button class="slide-arrow prev" aria-label="Slide precedente"><i class="fas fa-chevron-left"></i></button>
      <button class="slide-arrow next" aria-label="Slide successiva"><i class="fas fa-chevron-right"></i></button>
    </div>
    <div class="slide-indicators" role="tablist" aria-label="Vai alla slide">
${dotsHtml}
    </div>
  </section>
</div>

<footer class="w-footer" id="mainFooter" aria-label="Footer">
  <div class="footer-inner">
    <nav class="footer-links" aria-label="Link legali">
      <a href="${esc(terminiUrl)}" id="footerTermini" target="_blank" rel="noopener">${esc(S.footerTerminiLabel)}</a>
      <a href="${esc(privacyUrl)}" id="footerPrivacy" target="_blank" rel="noopener">${esc(S.footerPrivacyLabel)}</a>
    </nav>
    <div class="footer-copy" id="footerCopy">&copy; 2026 <a href="${esc(S.footerCopyrightUrl)}" id="footerBrand" target="_blank" rel="noopener">${esc(S.footerCopyrightText)}</a></div>
  </div>
</footer>

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
    return `:root {
  --cd-blue-900: ${bp['900']}; --cd-blue-700: ${bp['700']}; --cd-blue-500: ${bp['500']}; --cd-blue-300: ${bp['300']}; --cd-blue-100: ${bp['100']};
  --cd-green-900: ${gp['900']}; --cd-green-700: ${gp['700']}; --cd-green-500: ${gp['500']}; --cd-green-300: ${gp['300']}; --cd-green-100: ${gp['100']};
  --cd-gray-900: #1E1E1E; --cd-gray-700: #4A4A4A; --cd-gray-500: #9B9B9B; --cd-gray-300: #D9D9D9; --cd-gray-100: #F5F5F5;
  --cd-yellow: #FFCC00; --cd-red: #D32F2F; --cd-info: #0288D1;
  --blu: var(--cd-blue-700); --blu-dark: var(--cd-blue-900); --blu-hover: var(--cd-blue-500);
  --verde: var(--cd-green-700); --verde-soft: var(--cd-green-300); --verde-100: var(--cd-green-100);
  --white: #FFFFFF; --ink: var(--cd-gray-900); --ink-sub: var(--cd-gray-700); --page-bg: var(--cd-gray-100);
  --fs-xs:clamp(11px,2.8vw,13px);--fs-sm:clamp(12px,3.0vw,14px);--fs-base:clamp(13px,3.3vw,15px);
  --fs-md:clamp(14px,3.5vw,16px);--fs-lg:clamp(15px,3.8vw,18px);--fs-xl:clamp(17px,4.2vw,20px);--fs-2xl:clamp(20px,5vw,26px);
  --shadow-sm:0 2px 8px rgba(10,24,40,.10);--shadow-md:0 10px 24px rgba(10,24,40,.18);
  --shadow-lg:0 10px 28px rgba(20,82,132,.12),0 4px 18px rgba(0,0,0,.08);
  --radius:18px;--radius-sm:12px;
  --glass-bg:rgba(255,255,255,0.75);--glass-border:rgba(255,255,255,0.6);--glass-blur:blur(26px) saturate(200%);
  --a11y-bar-bg:rgba(255,255,255,.92);--a11y-bar-border:rgba(0,0,0,.12);
  --a11y-btn-bg:rgba(20,82,132,.08);--a11y-btn-active:var(--blu);--a11y-btn-color:var(--blu-dark);
}
[data-theme="dark"]{
  --cd-blue-900:${dbp['900']};--cd-blue-700:${dbp['700']};--cd-blue-500:${dbp['500']};--cd-blue-300:${dbp['300']};--cd-blue-100:${dbp['100']};
  --cd-green-900:${dgp['900']};--cd-green-700:${dgp['700']};--cd-green-500:${dgp['500']};--cd-green-300:${dgp['300']};--cd-green-100:${dgp['100']};
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
[data-contrast="high"] .rd-chip,[data-contrast="high"] .m-chip{border:2px solid #000!important;color:#000!important;font-weight:900!important;}
[data-contrast="high"] .rd-title,[data-contrast="high"] .meteo-title{color:#000!important;}
[data-contrast="high"] .rd-accordion,[data-contrast="high"] .meteo-acc{border:2px solid #000!important;}
[data-contrast="high"] .banner-link-card{border:2px solid #fff!important;}
[data-contrast="high"] .w-banner-cie{border:2px solid #fff!important;}
[data-contrast="high"] .cie-title,[data-contrast="high"] .cie-subtitle{color:#fff!important;font-weight:900!important;}
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
.current-date{font-size:var(--fs-md);font-weight:900;color:#fff;display:block;line-height:1.1;text-shadow:0 1px 0 rgba(0,0,0,.45),0 8px 14px rgba(0,0,0,.30);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
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
.slide-textbox{display:inline-block;background:rgba(20,82,132,0.10);border:1px solid rgba(255,255,255,0.35);border-radius:16px;padding:clamp(.6rem,2vw,.75rem) clamp(.75rem,2.5vw,1rem);backdrop-filter:blur(8px);box-shadow:var(--shadow-md);}
.slide-title{font-weight:900;letter-spacing:.2px;color:#fff;font-size:clamp(1.25rem,5vw,2rem);line-height:1.15;}
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
.svc-title-it::before{content:'';display:block;width:7px;height:clamp(22px,5.5vw,28px);background:linear-gradient(180deg,var(--blu),var(--blu-hover));border-radius:10px;box-shadow:0 4px 12px rgba(20,82,132,.35);}
.svc-title-en{font-weight:400;font-size:var(--fs-xs);color:var(--blu-hover);margin-left:16px;opacity:.85;letter-spacing:.4px;margin-top:3px;}
.svc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(14px,4vw,20px);max-width:340px;margin:0 auto;}
.svc-link{text-decoration:none;color:inherit;display:block;outline:none;perspective:1000px;}
.svc-card{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;aspect-ratio:1/1;padding:clamp(6px,2vw,10px);background:rgba(255,255,255,.70);border:1px solid rgba(255,255,255,.75);border-radius:clamp(20px,5.5vw,26px);box-shadow:0 8px 18px rgba(14,59,96,.18),0 3px 6px rgba(0,0,0,.08),inset 0 1px 0 rgba(255,255,255,.5);transition:all 0.3s cubic-bezier(0.34,1.56,0.64,1);overflow:hidden;}
.svc-link:hover .svc-card{background:rgba(255,255,255,.95);transform:translateY(-3px) scale(1.04);box-shadow:0 14px 30px rgba(20,82,132,.22),0 4px 8px rgba(0,0,0,.08);}
.svc-link:active .svc-card{transform:scale(0.95);transition-duration:.1s;}
.svc-icon-box{width:clamp(38px,10vw,48px);height:clamp(38px,10vw,48px);margin-bottom:clamp(5px,1.5vw,8px);border-radius:clamp(12px,3vw,15px);display:flex;align-items:center;justify-content:center;font-size:clamp(17px,4.8vw,23px);color:#fff;background:linear-gradient(180deg,#5B9BD5 0%,var(--blu) 100%);box-shadow:0 6px 14px rgba(20,82,132,.3),inset 0 1.5px 0 rgba(255,255,255,.4);transition:transform .4s ease;}
.svc-link:hover .svc-icon-box{transform:rotate(-6deg) scale(1.10);}
.svc-icon-box i{filter:drop-shadow(0 2px 3px rgba(0,0,0,.25));}
.svc-label-it{font-size:clamp(11px,3vw,13px);font-weight:700;color:var(--blu-dark);line-height:1.15;width:100%;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;}
.svc-label-en{font-size:var(--fs-xs);font-weight:600;color:var(--ink-sub);line-height:1.1;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.9;}
.svc-ripple{position:absolute;border-radius:50%;transform:scale(0);background:rgba(60,164,52,.25);pointer-events:none;animation:svcRipple .55s linear;}
@keyframes svcRipple{to{transform:scale(3.5);opacity:0;}}
.w-banner-scatti{width:100%;}
.banner-link-card{display:flex;align-items:center;justify-content:space-between;width:100%;background:linear-gradient(135deg,var(--blu-dark) 0%,var(--blu) 50%,var(--blu-hover) 100%);color:#fff;text-decoration:none;padding:clamp(14px,3.5vw,20px) clamp(14px,3.5vw,22px);box-shadow:var(--shadow-md);transition:filter .3s ease;cursor:pointer;}
.banner-link-card:hover{filter:brightness(1.1);}
.banner-content{display:flex;flex-direction:column;flex:1;min-width:0;}
.banner-title{font-size:var(--fs-lg);font-weight:700;line-height:1.2;letter-spacing:.3px;}
.banner-subtitle-text{font-size:var(--fs-sm);font-weight:300;opacity:.80;margin-top:4px;}
.banner-actions{display:flex;align-items:center;padding-left:12px;gap:10px;flex-shrink:0;}
.camera-icon{font-size:var(--fs-xl);opacity:.5;}
.cta-arrow-box{background:rgba(255,255,255,.18);width:36px;height:36px;display:flex;align-items:center;justify-content:center;border-radius:50%;}
.cta-arrow-icon{font-size:var(--fs-md);animation:nudgeRight 2s infinite ease-in-out;}
@keyframes nudgeRight{0%,100%{transform:translateX(0);}50%{transform:translateX(4px);}}
.banner-link-card:hover .cta-arrow-icon{animation-duration:.8s;}
.banner-link-card:hover .cta-arrow-box{background:rgba(255,255,255,.3);}
.w-banner-cie{width:100%;max-width:900px;margin:0 auto;background:linear-gradient(180deg,rgba(20,82,132,.96),rgba(15,55,88,.96));border:1px solid rgba(255,255,255,.12);box-shadow:var(--shadow-md);position:relative;overflow:hidden;}
.w-banner-cie::before{content:"";position:absolute;inset:-2px;background:radial-gradient(900px 220px at 18% 0%,rgba(255,255,255,.22),transparent 55%),radial-gradient(780px 220px at 92% 30%,rgba(255,255,255,.10),transparent 60%),radial-gradient(520px 260px at 40% 140%,rgba(60,164,52,.14),transparent 65%);pointer-events:none;mix-blend-mode:overlay;}
.cie-link{position:relative;display:flex;align-items:center;gap:clamp(8px,2.5vw,12px);padding:clamp(10px,2.5vw,14px);color:#fff;text-decoration:none;min-height:clamp(62px,16vw,80px);}
.cie-ico{flex:0 0 auto;width:clamp(36px,9vw,42px);height:clamp(36px,9vw,42px);display:grid;place-items:center;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.14);box-shadow:0 8px 18px rgba(0,0,0,.16);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}
.cie-ico i{font-size:var(--fs-lg);color:#fff;filter:drop-shadow(0 6px 12px rgba(0,0,0,.22));}
.cie-txt{min-width:0;flex:1;line-height:1.08;}
.cie-title{margin:0;font-weight:700;font-size:var(--fs-md);letter-spacing:.2px;opacity:.95;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;}
.cie-subtitle{margin:clamp(2px,.8vw,4px) 0 0;font-weight:700;font-size:var(--fs-md);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}
.cie-info-wrap{position:relative;flex:0 0 auto;width:clamp(56px,14vw,70px);height:clamp(36px,10vw,44px);display:flex;align-items:flex-start;justify-content:flex-end;}
.cie-badge{position:relative;z-index:2;font-size:var(--fs-xs);font-weight:700;letter-spacing:.4px;color:#0b2234;background:linear-gradient(180deg,var(--verde-soft),rgba(60,164,52,.85));padding:clamp(5px,1.4vw,7px) clamp(8px,2vw,10px);border-radius:999px;border:1px solid rgba(255,255,255,.35);box-shadow:0 10px 18px rgba(0,0,0,.20);line-height:1;}
.cie-finger{position:absolute;right:clamp(0px,.5vw,2px);top:clamp(14px,4vw,18px);z-index:1;color:rgba(255,255,255,.95);filter:drop-shadow(0 8px 14px rgba(0,0,0,.30));animation:fingerTap 1.25s ease-in-out infinite;pointer-events:none;}
.cie-finger i{font-size:var(--fs-lg);}
.cie-ring{position:absolute;right:clamp(10px,2.8vw,14px);top:clamp(6px,1.8vw,9px);width:clamp(10px,2.6vw,12px);height:clamp(10px,2.6vw,12px);border:2px solid rgba(255,255,255,.55);border-radius:999px;opacity:0;animation:cieRing 1.25s ease-in-out infinite;pointer-events:none;z-index:0;}
@keyframes fingerTap{0%{transform:translate(0,0) scale(1);}40%{transform:translate(-2px,-4px) scale(1.05);}55%{transform:translate(-1px,-2px) scale(.98);}100%{transform:translate(0,0) scale(1);}}
@keyframes cieRing{0%{opacity:0;transform:scale(.7);}45%{opacity:.65;transform:scale(1);}100%{opacity:0;transform:scale(1.35);}}
.w-raccolta-wrapper{padding:clamp(8px,2.5vw,14px) clamp(8px,2.5vw,12px);background:var(--blu-dark);}
.w-raccolta-wrapper .rd-card{position:relative;border-radius:var(--radius);padding:clamp(12px,3vw,16px);background:linear-gradient(135deg,rgba(255,255,255,.86),rgba(255,255,255,.78));backdrop-filter:blur(14px) saturate(118%);-webkit-backdrop-filter:blur(14px) saturate(118%);border:1px solid rgba(20,82,132,.20);box-shadow:var(--shadow-lg);max-width:520px;margin:0 auto;overflow:hidden;isolation:isolate;}
.w-raccolta-wrapper .rd-card>*{position:relative;z-index:2;}
.w-raccolta-wrapper .rd-card::before{content:"";position:absolute;inset:-8%;pointer-events:none;border-radius:inherit;background:radial-gradient(200px 260px at 20% 0%,rgba(60,164,52,.22),transparent 60%),radial-gradient(240px 200px at 110% 10%,rgba(20,82,132,.22),transparent 60%),radial-gradient(220px 260px at -10% 110%,rgba(255,255,255,.25),transparent 62%);filter:blur(18px) saturate(120%);mix-blend-mode:screen;z-index:0;animation:rdLiqFloat 22s ease-in-out infinite alternate;}
.w-raccolta-wrapper .rd-card::after{content:"";position:absolute;inset:-30% -20%;pointer-events:none;border-radius:inherit;background:linear-gradient(130deg,rgba(255,255,255,0) 20%,rgba(255,255,255,.18) 40%,rgba(255,255,255,0) 60%);z-index:1;animation:rdSheen 6s ease-in-out infinite;}
@keyframes rdLiqFloat{0%{transform:translate3d(0,0,0) rotate(.2deg);}50%{transform:translate3d(-2%,1%,0) rotate(-.6deg);}100%{transform:translate3d(2%,-1%,0) rotate(.8deg);}}
@keyframes rdSheen{0%{transform:translateX(-30%) rotate(.2deg);}50%{transform:translateX(30%) rotate(.2deg);}100%{transform:translateX(-30%) rotate(.2deg);}}
.rd-header{display:flex;align-items:center;gap:clamp(8px,2.5vw,12px);margin-bottom:8px;}
.rd-icon{width:clamp(38px,10vw,46px);height:clamp(38px,10vw,46px);display:grid;place-items:center;border-radius:14px;background:radial-gradient(80% 80% at 30% 20%,rgba(255,255,255,.22),rgba(255,255,255,0) 65%),linear-gradient(160deg,var(--verde),rgba(60,164,52,.85));color:#fff;box-shadow:inset 0 1px 8px rgba(255,255,255,.28),0 8px 18px rgba(0,0,0,.25);flex-shrink:0;}
.rd-title{font-weight:900;font-size:var(--fs-lg);line-height:1.1;color:var(--blu);}
.rd-sub{font-size:var(--fs-xs);color:var(--ink-sub);margin-top:2px;}
.rd-badge{margin-left:auto;font-size:var(--fs-xs);font-weight:800;color:var(--blu);padding:7px 12px;border-radius:999px;background:linear-gradient(160deg,rgba(20,82,132,.10),rgba(20,82,132,.06));border:1px solid rgba(20,82,132,.22);white-space:nowrap;}
.rd-section{margin-top:8px;}
.rd-section h3{margin:0 0 6px;font-size:var(--fs-md);font-weight:900;display:flex;align-items:center;gap:8px;color:inherit;}
.rd-section h3 .fa-solid{opacity:.95;color:var(--blu);}
.rd-chips{display:flex;flex-wrap:wrap;gap:8px;}
.rd-chip{display:inline-flex;align-items:center;gap:8px;padding:clamp(7px,2vw,9px) clamp(10px,2.5vw,14px);border-radius:14px;background:radial-gradient(120% 120% at 20% 10%,rgba(255,255,255,.28),rgba(255,255,255,0) 60%),linear-gradient(180deg,rgba(60,164,52,.18),rgba(60,164,52,.10));border:1px solid rgba(60,164,52,.30);font-size:var(--fs-sm);font-weight:800;color:#0f301a;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:inset 0 1px 8px rgba(255,255,255,.35),0 8px 16px rgba(20,82,132,.08);}
.rd-chip .fa-solid{font-size:var(--fs-sm);}
.rd-chip--none{background:radial-gradient(120% 120% at 20% 10%,rgba(255,255,255,.26),rgba(255,255,255,0) 60%),linear-gradient(180deg,rgba(20,82,132,.12),rgba(20,82,132,.06));border:1px dashed rgba(20,82,132,.28);color:var(--blu);}
.rd-accordion{border-radius:14px;overflow:hidden;border:1px solid rgba(20,82,132,.16);background:rgba(255,255,255,.86);}
.rd-acc-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:clamp(10px,2.5vw,12px) clamp(12px,3vw,14px);cursor:pointer;user-select:none;background:linear-gradient(180deg,rgba(20,82,132,.06),rgba(20,82,132,.03));}
.rd-acc-head span{font-weight:900;font-size:var(--fs-sm);}
.rd-acc-body{display:none;padding:10px 12px;background:rgba(255,255,255,.86);}
.rd-acc-body.open{display:block;}
.day-row{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px dashed rgba(20,82,132,.18);}
.day-row:last-child{border-bottom:none;}
.day-date{flex:0 0 clamp(74px,20vw,92px);font-weight:800;font-size:var(--fs-sm);}
.rd-cta{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;}
.rd-btn{display:inline-flex;align-items:center;gap:8px;padding:clamp(9px,2.5vw,11px) clamp(12px,3vw,16px);border-radius:14px;border:1px solid rgba(60,164,52,.45);font-weight:900;text-decoration:none;cursor:pointer;color:#fff;font-size:var(--fs-sm);background:radial-gradient(120% 120% at 10% 10%,rgba(255,255,255,.22),rgba(255,255,255,0) 60%),linear-gradient(110deg,var(--verde),var(--verde) 40%,var(--cd-green-500) 100%);box-shadow:0 10px 18px rgba(0,0,0,.20),inset 0 1px 10px rgba(255,255,255,.30);}
.rd-btn:active{transform:translateY(1px);}
.eco-tip{margin-top:10px;padding:clamp(8px,2vw,10px) clamp(10px,2.5vw,12px);border-radius:14px;background:linear-gradient(180deg,rgba(20,82,132,.05),rgba(20,82,132,.03));border:1px solid rgba(20,82,132,.18);display:flex;gap:10px;align-items:flex-start;font-size:var(--fs-sm);}
.eco-tip .fa-regular{margin-top:2px;}
.eco-tip small{display:block;font-size:var(--fs-xs);opacity:.85;}
.w-protezione{padding:clamp(10px,3vw,16px) clamp(8px,2.5vw,12px);background:var(--blu-dark);}
.w-protezione h2{color:#145284!important;font-size:var(--fs-xl);}
.w-protezione .disclaimer,.w-protezione .disclaimer a{color:rgba(255,255,255,.85)!important;}
.w-protezione .disclaimer svg{fill:rgba(255,255,255,.85)!important;}
#dpc-alerts-widget{width:100%;margin:0 auto;}
.w-meteo-wrapper{padding:clamp(6px,2vw,10px) clamp(8px,2.5vw,12px);background:var(--blu-dark);flex-shrink:0;flex-grow:0;}
.w-meteo-wrapper .meteo-card{position:relative;border-radius:var(--radius);padding:clamp(10px,2.5vw,12px);background:linear-gradient(135deg,rgba(255,255,255,.86),rgba(255,255,255,.78));backdrop-filter:blur(14px) saturate(118%);-webkit-backdrop-filter:blur(14px) saturate(118%);border:1px solid rgba(20,82,132,.20);box-shadow:var(--shadow-lg);max-width:520px;margin:0 auto;overflow:hidden;}
.w-meteo-wrapper .meteo-card>*:not(.meteo-layer){position:relative;z-index:2;}
.w-meteo-wrapper .meteo-card::before{content:"";position:absolute;inset:-8%;pointer-events:none;border-radius:inherit;background:radial-gradient(220px 240px at 15% 0%,rgba(20,82,132,.18),transparent 60%),radial-gradient(240px 220px at 110% 10%,rgba(46,109,168,.22),transparent 60%),radial-gradient(200px 240px at -10% 110%,rgba(255,255,255,.28),transparent 62%);filter:blur(18px) saturate(120%);mix-blend-mode:screen;z-index:0;animation:rdLiqFloat 24s ease-in-out infinite alternate;}
.w-meteo-wrapper .meteo-card::after{content:"";position:absolute;inset:-30% -20%;pointer-events:none;border-radius:inherit;background:linear-gradient(130deg,rgba(255,255,255,0) 20%,rgba(255,255,255,.18) 40%,rgba(255,255,255,0) 60%);z-index:1;animation:rdSheen 6s ease-in-out infinite;}
.meteo-header{display:flex;align-items:center;gap:8px;margin-bottom:4px;}
.meteo-icon{width:clamp(32px,8vw,38px);height:clamp(32px,8vw,38px);display:grid;place-items:center;border-radius:14px;color:#fff;background:radial-gradient(80% 80% at 30% 20%,rgba(255,255,255,.22),rgba(255,255,255,0) 65%),linear-gradient(160deg,var(--blu),var(--blu-hover));box-shadow:inset 0 1px 8px rgba(255,255,255,.28),0 8px 18px rgba(0,0,0,.22);flex-shrink:0;}
.meteo-title{font-weight:700;font-size:var(--fs-lg);line-height:1.1;color:var(--blu);}
.meteo-sub{font-size:var(--fs-xs);color:var(--ink-sub);}
.meteo-badge{margin-left:auto;font-size:var(--fs-xs);font-weight:700;color:var(--blu);padding:4px 8px;border-radius:999px;border:1px solid rgba(20,82,132,.22);background:linear-gradient(160deg,rgba(20,82,132,.10),rgba(20,82,132,.06));}
.meteo-section{margin-top:6px;}
.meteo-section h3{margin:0 0 4px;font-size:var(--fs-sm);font-weight:700;color:var(--blu);display:flex;gap:6px;align-items:center;}
.m-chips{display:flex;flex-wrap:wrap;gap:6px;}
.m-chip{display:inline-flex;align-items:center;gap:6px;padding:clamp(5px,1.5vw,6px) clamp(8px,2vw,10px);border-radius:12px;font-weight:600;background:linear-gradient(180deg,rgba(20,82,132,.12),rgba(20,82,132,.07));border:1px solid rgba(20,82,132,.28);color:#123b5f;font-size:var(--fs-sm);}
.m-chip .fa-solid{font-size:var(--fs-sm);}
.meteo-acc{border:1px solid rgba(20,82,132,.22);border-radius:14px;overflow:hidden;background:rgba(255,255,255,.86);}
.meteo-acc-h{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:clamp(6px,2vw,8px) clamp(8px,2vw,10px);cursor:pointer;background:linear-gradient(180deg,rgba(20,82,132,.08),rgba(20,82,132,.04));user-select:none;color:var(--blu);font-size:var(--fs-sm);}
.meteo-acc-h strong{font-size:var(--fs-sm);}
.meteo-acc-b{display:none;padding:8px 10px;}
.meteo-acc-b.open{display:block;}
.meteo-cta{display:flex;gap:8px;margin-top:8px;}
.meteo-btn{display:inline-flex;align-items:center;gap:8px;padding:clamp(7px,2vw,9px) clamp(10px,2.5vw,12px);border-radius:12px;border:1px solid rgba(20,82,132,.35);color:#fff;text-decoration:none;font-weight:700;cursor:pointer;font-size:var(--fs-sm);background:linear-gradient(110deg,var(--blu),var(--blu-hover));box-shadow:0 10px 18px rgba(0,0,0,.20),inset 0 1px 10px rgba(255,255,255,.24);}
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
.a11y-btn:hover{background:rgba(20,82,132,.16);}
.a11y-btn:active{transform:scale(.94);}
.a11y-btn[aria-pressed="true"],.a11y-btn.active{background:var(--a11y-btn-active,var(--blu));color:#fff;border-color:transparent;}
.a11y-btn-icon{font-size:16px;}
.a11y-fab{width:50px;height:50px;border-radius:50%;border:none;background:linear-gradient(135deg,var(--blu),var(--blu-hover));color:#fff;font-size:20px;cursor:pointer;box-shadow:0 6px 20px rgba(20,82,132,.35);display:grid;place-items:center;pointer-events:auto;transition:transform .2s ease,box-shadow .2s ease;-webkit-tap-highlight-color:transparent;}
.a11y-fab:hover{transform:scale(1.08);box-shadow:0 8px 26px rgba(20,82,132,.45);}
.a11y-fab:active{transform:scale(.95);}
.a11y-fab[aria-expanded="true"]{background:linear-gradient(135deg,var(--cd-red),#E05555);}
.a11y-fontsize-group{display:flex;align-items:center;gap:4px;}
.a11y-fontsize-val{min-width:20px;text-align:center;font-weight:900;font-size:var(--fs-sm);color:var(--ink);}
.sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important;}
.a11y-live{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;}
.keyboard-nav a:focus-visible,.keyboard-nav button:focus-visible,.keyboard-nav [tabindex]:focus-visible,.keyboard-nav input:focus-visible{outline:3px solid var(--blu-hover)!important;outline-offset:2px!important;}`;
  }

  /* ============================================================
     BUILD JS (complete logic from Cammarata template)
     ============================================================ */
  function buildJS() {
    // This is the complete JS logic – it reads from COMUNE_CONFIG at runtime
    return `(function(){
  "use strict";
  if(/iPhone|iPad|iPod/.test(navigator.userAgent)){document.documentElement.classList.add('ios-device');}
  const C=window.COMUNE_CONFIG;
  const BASE=C.baseUrl.replace(/\\/+$/,'');
  const href=(path)=>{const url=path.startsWith('http')?path:BASE+'/'+path;return encodeURI(decodeURI(url));};
  document.title=C.pageTitle||'Home – '+C.nomeComune+' – Comune.Digital';
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  let LANG=localStorage.getItem('cd_lang')||C.i18n.defaultLang;
  const t=(key)=>{const entry=C.i18n.ui[key];if(!entry)return key;return entry[LANG]||entry[C.i18n.defaultLang]||key;};

  const mount=document.getElementById('widgetMount');
  let html='';

  // Build widget renderers
  const widgetRenderers={
    dateHeader:()=>'<header class="w-date-header" id="dateHeader" aria-label="Data odierna e meteo"><div class="date-header-inner"><div class="date-left"><span class="date-ico" aria-hidden="true"><i class="fa-solid fa-calendar-days"></i></span><div class="date-text"><span class="current-date" id="currentDate"></span><span class="special-event" id="specialEvent"></span></div></div><div class="weather-box" aria-label="Meteo attuale a '+esc(C.nomeComune)+'"><span class="weather-icon" id="weatherIcon">--</span><span class="temperature" id="temperature">--°C</span></div></div></header>',
    tickerBar:()=>'<section class="w-ticker" id="tickerBar" aria-label="Notizie in scorrimento"><div class="ticker-header"><a href="'+esc(href(C.ticker.linkUrl))+'" target="_blank" rel="noopener"><span class="news-ico" aria-hidden="true"><span style="transform:translateY(1px);display:inline-block;">\\u{1F4F0}</span></span><span class="header-title" data-i18n="ticker.title">'+esc(t('ticker.title'))+'</span><span class="arrow-link" aria-hidden="true">\\u2197</span></a></div><div class="ticker-strip"><rssapp-ticker id="'+esc(C.ticker.rssWidgetId)+'"></rssapp-ticker></div></section>',
    slideshow:()=>'<div id="slideshowSlot"></div>',
    servizi:()=>{const svcSections=C.servizi.map(sec=>{const cards=sec.items.map(it=>'<a class="svc-link" href="'+esc(href(it.href))+'" target="_blank" rel="noopener"><div class="svc-card"><div class="svc-icon-box"><i class="fa-solid '+esc(it.icon)+'"></i></div><div class="svc-label-it" data-i18n-it="'+esc(it.labelIt)+'" data-i18n-en="'+esc(it.labelEn)+'">'+esc(LANG==='en'?it.labelEn:it.labelIt)+'</div></div></a>').join('');return '<div class="svc-section"><div class="svc-section-hdr"><div class="svc-title-it" data-i18n-it="'+esc(sec.sectionIt)+'" data-i18n-en="'+esc(sec.sectionEn)+'">'+esc(LANG==='en'?sec.sectionEn:sec.sectionIt)+'</div></div><div class="svc-grid">'+cards+'</div></div>';}).join('');return '<section class="w-services" id="servicesContainer" aria-label="Servizi comunali">'+svcSections+'</section>';},
    bannerScatti:()=>'<section class="w-banner-scatti" id="bannerScatti" aria-label="I vostri scatti"><a href="'+esc(href(C.bannerScatti.href))+'" class="banner-link-card" target="_blank" rel="noopener"><div class="banner-content"><div class="banner-title" data-i18n-it="'+esc(C.bannerScatti.titleIt)+'" data-i18n-en="'+esc(C.bannerScatti.titleEn||C.bannerScatti.titleIt)+'">'+esc(LANG==='en'?(C.bannerScatti.titleEn||C.bannerScatti.titleIt):C.bannerScatti.titleIt)+'</div><div class="banner-subtitle-text" data-i18n="banner.subtitle">'+esc(t('banner.subtitle'))+'</div></div><div class="banner-actions"><i class="fas fa-camera camera-icon"></i><div class="cta-arrow-box"><i class="fas fa-chevron-right cta-arrow-icon"></i></div></div></a></section>',
    bannerCIE:()=>C.bannerCie.enabled?'<section class="w-banner-cie" id="bannerCIE" role="region" aria-label="Avviso CIE"><a class="cie-link" href="'+esc(C.bannerCie.href)+'" target="_blank" rel="noopener" aria-label="'+esc(C.bannerCie.title)+'"><div class="cie-ico" aria-hidden="true"><i class="fa-solid fa-id-card"></i></div><div class="cie-txt"><p class="cie-title" data-i18n-it="'+esc(C.bannerCie.title)+'" data-i18n-en="'+esc(C.bannerCie.titleEn||C.bannerCie.title)+'">'+esc(LANG==='en'?(C.bannerCie.titleEn||C.bannerCie.title):C.bannerCie.title)+'</p><p class="cie-subtitle" data-i18n-it="'+esc(C.bannerCie.subtitle)+'" data-i18n-en="'+esc(C.bannerCie.subtitleEn||C.bannerCie.subtitle)+'">'+esc(LANG==='en'?(C.bannerCie.subtitleEn||C.bannerCie.subtitle):C.bannerCie.subtitle)+'</p></div><div class="cie-info-wrap" aria-hidden="true"><span class="cie-badge" data-i18n="cie.badge">'+esc(t('cie.badge'))+'</span><span class="cie-ring"></span><span class="cie-finger"><i class="fa-solid fa-hand-point-up"></i></span></div></a></section>':'',
    raccoltaDifferenziata:()=>'<section class="w-raccolta-wrapper" aria-label="Raccolta differenziata"><div id="raccoltaDifferenziata" class="rd-card" aria-live="polite"></div></section>',
    protezioneCivile:()=>C.protezioneCivile.enabled?'<section class="w-protezione" id="protezioneCivile" aria-label="Bollettino Protezione Civile"><div id="dpc-alerts-widget"></div></section>':'',
    meteoCard:()=>'<section class="w-meteo-wrapper" aria-label="Meteo '+esc(C.nomeComune)+'"><div id="meteoCard" class="meteo-card" aria-live="polite"><div class="meteo-header"><div class="meteo-icon" aria-hidden="true"><i class="fa-solid fa-cloud-sun"></i></div><div><div class="meteo-title" data-i18n="meteo.title">'+esc(t('meteo.title'))+'</div><div class="meteo-sub" id="mwCity" data-i18n="meteo.loading">'+esc(t('meteo.loading'))+'</div></div><div class="meteo-badge" id="mwBadge">--:--</div></div><div class="meteo-section"><h3><i class="fa-solid fa-temperature-half"></i> <span data-i18n="meteo.current">'+esc(t('meteo.current'))+'</span></h3><div class="m-chips" id="meteoNow"></div></div><div class="meteo-section"><div class="meteo-acc" id="meteoAcc"><div class="meteo-acc-h" id="meteoAccHead"><strong><i class="fa-solid fa-circle-info"></i> <span data-i18n="meteo.details">'+esc(t('meteo.details'))+'</span></strong><small><i id="meteoChev" class="fa-solid fa-chevron-down"></i></small></div><div class="meteo-acc-b" id="meteoAccBody"><div class="m-chips" id="meteoDet"></div></div></div></div><div class="meteo-cta"><a class="meteo-btn" href="javascript:void(0)" id="meteoWeekly"><i class="fa-solid fa-calendar-week"></i> <span data-i18n="meteo.weekly">'+esc(t('meteo.weekly'))+'</span></a></div><div class="meteo-layer" id="meteoLoader"><div class="meteo-spinner" aria-label="Caricamento"></div></div><div class="meteo-layer meteo-err" id="meteoError" role="alert"><div><i class="fa-solid fa-triangle-exclamation"></i> <span data-i18n="meteo.error">'+esc(t('meteo.error'))+'</span></div><div class="msg" id="meteoErrmsg" data-i18n="meteo.errorSub">'+esc(t('meteo.errorSub'))+'</div><a class="meteo-btn" href="#" id="meteoRetry" style="margin-top:4px"><i class="fa-solid fa-rotate-right"></i> <span data-i18n="meteo.retry">'+esc(t('meteo.retry'))+'</span></a></div></div></section>'
  };

  // Sort widgets by order and render enabled ones
  const enabledWidgets=(C.widgets||[]).filter(w=>w.enabled).sort((a,b)=>a.order-b.order);
  enabledWidgets.forEach(w=>{if(widgetRenderers[w.id]){const rendered=widgetRenderers[w.id]();if(rendered)html+=rendered;}});

  mount.innerHTML=html;

  /* Move static slideshow */
  const slideshowEl=document.getElementById('slideshowStatic');
  const slideshowSlot=document.getElementById('slideshowSlot');
  if(slideshowEl&&slideshowSlot){slideshowSlot.replaceWith(slideshowEl);}

  /* Header from config */
  (function(){
    const hdr=C.header||{};
    const hName=document.getElementById('headerName');
    if(hName){if(hdr.mostraNome===false)hName.style.display='none';else hName.textContent=C.nomeComune||'';}
    if(hdr.stemmaUrl){const inner=document.querySelector('.main-header-inner');if(inner){const img=document.createElement('img');img.src=href(hdr.stemmaUrl);img.alt='Stemma '+(C.nomeComune||'Comune');img.className='main-header-stemma';inner.insertBefore(img,inner.firstChild);}}
    function fitHeaderName(){if(!hName)return;hName.style.fontSize='';const maxFs=parseFloat(getComputedStyle(hName).fontSize);const minFs=16;let fs=maxFs;while(fs>minFs&&hName.scrollWidth>hName.clientWidth){fs-=1;hName.style.fontSize=fs+'px';}}
    if(document.readyState==='complete')fitHeaderName();else window.addEventListener('load',fitHeaderName);
    window.addEventListener('resize',fitHeaderName);
  })();

  /* Footer from config */
  (function(){
    const f=C.footer||{};
    const elT=document.getElementById('footerTermini'),elP=document.getElementById('footerPrivacy'),elC=document.getElementById('footerCopy');
    if(elT){elT.href=f.terminiUrl||'#';elT.textContent=f.terminiLabel||'Termini e condizioni';}
    if(elP){elP.href=f.privacyUrl||'#';elP.textContent=f.privacyLabel||'Privacy Policy';}
    if(elC){const yr=new Date().getFullYear();elC.innerHTML='&copy; '+yr+' <a href="'+(f.copyrightUrl||'https://app.comune.digital')+'" id="footerBrand" target="_blank" rel="noopener">'+esc(f.copyrightText||'Comune.Digital')+'</a>';}
  })();

  /* DPC script */
  if(C.protezioneCivile.enabled){
    const s=document.createElement('script');s.src='https://growapp-dpc-alerts-widget.vercel.app/render.js';
    s.setAttribute('data-api-key',C.protezioneCivile.apiKey);s.setAttribute('data-code',C.protezioneCivile.codiceRegione);
    s.setAttribute('data-comune',C.protezioneCivile.nomeComune);s.setAttribute('data-url-regione',C.protezioneCivile.urlRegione);
    document.getElementById('dpcScriptMount').appendChild(s);
  }

  /* DATE WIDGET */
  function dayOfYear(date){const start=new Date(date.getFullYear(),0,0);const diff=(date-start)+((start.getTimezoneOffset()-date.getTimezoneOffset())*60*1000);return Math.floor(diff/(1000*60*60*24));}
  const specialEvents={'1/1':'\\u{1F389} Buon Anno!','1/6':'\\u{1F9D9} Befana!','1/27':'\\u{1F56F} Giorno della Memoria','2/14':'\\u{1F496} San Valentino!','3/8':'\\u{1F469} Giornata internazionale della donna','3/17':'\\u{1F1EE}\\u{1F1F9} Giornata Unità Nazionale','3/19':'\\u{1F468} Festa del papà','3/21':'\\u{1F338} Giornata della Poesia','3/22':'\\u{1F4A7} Giornata Mondiale dell\\'acqua','4/22':'\\u{1F30D} Giornata della Terra','4/25':'\\u{1F1EE}\\u{1F1F9} Festa della Liberazione','5/1':'\\u{1F6E0} Festa dei Lavoratori!','5/9':'\\u{1F1EA}\\u{1F1FA} Festa dell\\'Europa','6/2':'\\u{1F1EE}\\u{1F1F9} Festa della Repubblica','6/5':'\\u{1F333} Giornata dell\\'Ambiente','6/21':'\\u{1F3B6} Festa della Musica','8/15':'\\u2600\\uFE0F Ferragosto!','10/4':'San Francesco d\\'Assisi','10/31':'\\u{1F383} Halloween!','11/1':'\\u{1F56F} Tutti i Santi','11/4':'\\u{1F396} Giornata Unità e Forze Armate','12/8':'\\u{1F64F} Immacolata Concezione','12/24':'\\u{1F384} Vigilia di Natale','12/25':'\\u{1F385} Natale!','12/26':'\\u{1F381} Santo Stefano','12/31':'\\u{1F38A} Vigilia di Capodanno'};

  function updateDateWidget(){
    const now=new Date();const locale=LANG==='en'?'en-GB':'it-IT';
    const weekday=now.toLocaleDateString(locale,{weekday:'long'});
    const formatted=weekday.charAt(0).toUpperCase()+weekday.slice(1);
    const month=now.toLocaleDateString(locale,{month:'long',year:'numeric'});
    document.getElementById('currentDate').textContent=formatted+' '+now.getDate()+' '+month;
    const key=(now.getMonth()+1)+'/'+now.getDate();
    const dayNum=dayOfYear(now);
    document.getElementById('specialEvent').textContent=specialEvents[key]||(dayNum+'° '+t('date.dayOfYear'));
  }
  updateDateWidget();
  (function scheduleMidnight(){const now=new Date();const ms=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1)-now;setTimeout(()=>{updateDateWidget();setInterval(updateDateWidget,86400000);},ms);})();

  /* MINI METEO */
  const miniMeteoUrl='https://api.open-meteo.com/v1/forecast?latitude='+C.lat+'&longitude='+C.lon+'&current=temperature_2m,weather_code&timezone=Europe/Rome';
  function miniWeatherIcon(code){const m={0:'\\u2600\\uFE0F',1:'\\u{1F324}\\uFE0F',2:'\\u26C5\\uFE0F',3:'\\u2601\\uFE0F',45:'\\u{1F32B}\\uFE0F',48:'\\u{1F32B}\\uFE0F',51:'\\u{1F326}\\uFE0F',53:'\\u{1F326}\\uFE0F',55:'\\u{1F327}\\uFE0F',61:'\\u{1F327}\\uFE0F',63:'\\u{1F327}\\uFE0F',65:'\\u{1F327}\\uFE0F',71:'\\u{1F328}\\uFE0F',73:'\\u{1F328}\\uFE0F',75:'\\u{1F328}\\uFE0F',80:'\\u{1F327}\\uFE0F',95:'\\u26C8\\uFE0F',96:'\\u26C8\\uFE0F'};return m[code]||'\\u2014';}
  async function fetchMiniMeteo(){try{const res=await fetch(miniMeteoUrl);if(!res.ok)throw new Error();const data=await res.json();const c=data.current;document.getElementById('weatherIcon').textContent=miniWeatherIcon(c.weather_code);document.getElementById('temperature').textContent=Math.round(c.temperature_2m)+'°C';}catch(e){document.getElementById('weatherIcon').textContent='\\u2014';document.getElementById('temperature').textContent='--°C';}}
  fetchMiniMeteo();setInterval(fetchMiniMeteo,300000);

  /* TICKER RESTYLE */
  function restyleTicker(){const t=document.querySelector('rssapp-ticker');if(!t)return;const fsVar=getComputedStyle(document.documentElement).getPropertyValue('--fs-sm').trim()||'13px';t.querySelectorAll('*').forEach(el=>{el.style.lineHeight='1.6';el.style.fontSize=fsVar;el.style.height='auto';el.style.maxHeight='32px';el.style.overflow='hidden';el.style.fontFamily="'Titillium Web',sans-serif";if(el.tagName==='A'){el.style.marginRight='50px';el.style.display='inline-block';el.style.color='#145284';el.style.textDecoration='none';}});}
  setTimeout(restyleTicker,2000);setInterval(restyleTicker,3000);

  /* SLIDESHOW */
  let sIdx=0,sPlaying=true,sTimer=null,sTransitioning=false,sUserPaused=false;
  const slides=Array.from(document.querySelectorAll('.slide'));
  const sDots=Array.from(document.querySelectorAll('.slide-dot'));
  const sPrev=document.querySelector('.slide-arrow.prev');
  const sNext=document.querySelector('.slide-arrow.next');
  const sCtaLink=document.getElementById('ctaLink');
  const sCtaText=document.getElementById('ctaText');
  const sContainer=document.querySelector('.w-slideshow');

  function sPreload(){slides.forEach(slide=>{const url=slide.getAttribute('data-bg');if(url){const img=new Image();img.onload=()=>{slide.style.setProperty('--bg-image',"url('"+url+"')");};img.onerror=()=>{slide.classList.add('error');};img.src=url;}});}
  function sUpdateCTA(){const h=slides[sIdx]?.getAttribute('data-href');if(h&&sCtaLink)sCtaLink.href=h;}
  function sSyncDots(){sDots.forEach((d,i)=>{const s=slides[i],it=s?.getAttribute('data-title-it')||'',en=s?.getAttribute('data-title-en')||it;d.setAttribute('data-title',LANG==='it'?it:en);d.setAttribute('aria-label',LANG==='it'?it:en);});}
  function sGoTo(i){if(sTransitioning||i===sIdx||!slides.length)return;if(sCtaLink)sCtaLink.classList.add('disabled');sTransitioning=true;slides[sIdx].classList.remove('active');if(sDots[sIdx]){sDots[sIdx].classList.remove('active');sDots[sIdx].setAttribute('aria-selected','false');}sIdx=(i+slides.length)%slides.length;slides[sIdx].classList.add('active');if(sDots[sIdx]){sDots[sIdx].classList.add('active');sDots[sIdx].setAttribute('aria-selected','true');}sUpdateCTA();setTimeout(()=>{sTransitioning=false;if(sCtaLink)sCtaLink.classList.remove('disabled');},620);}
  function sNextFn(){sGoTo(sIdx+1);}function sPrevFn(){sGoTo(sIdx-1);}
  function sPlay(){if(!sPlaying||sUserPaused)return;clearInterval(sTimer);sTimer=setInterval(sNextFn,6000);}
  function sPause(){clearInterval(sTimer);}
  function sStop(){clearInterval(sTimer);sPlaying=false;}
  function sUpdateTexts(){slides.forEach(s=>{const h1=s.querySelector('.slide-title');if(!h1)return;const title=s.getAttribute('data-title-'+LANG)||s.getAttribute('data-title-it')||h1.textContent;h1.textContent=title;});}
  sPreload();sUpdateTexts();sSyncDots();sUpdateCTA();sPlay();

  if(sContainer){
    let sx=0,ex=0,sy=0,ey=0,ctaTouch=false;
    const ctaEl=document.querySelector('.slide-cta');
    sContainer.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;ctaTouch=ctaEl&&ctaEl.contains(e.target);},{passive:true});
    sContainer.addEventListener('touchmove',e=>{if(!ctaTouch){ex=e.touches[0].clientX;ey=e.touches[0].clientY;}},{passive:true});
    sContainer.addEventListener('touchend',()=>{if(ctaTouch){ctaTouch=false;sx=ex=sy=ey=0;return;}const dx=sx-ex,dy=sy-ey;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)){sStop();dx>0?sNextFn():sPrevFn();sPlaying=true;sPlay();}sx=ex=sy=ey=0;ctaTouch=false;},{passive:true});
    if(window.matchMedia('(min-width:769px)').matches){sContainer.addEventListener('mouseenter',()=>{sUserPaused=true;sPause();});sContainer.addEventListener('mouseleave',()=>{sUserPaused=false;if(sPlaying)sPlay();});}
  }
  sDots.forEach((d,i)=>d.addEventListener('click',()=>{sStop();sGoTo(i);sPlaying=true;if(!sUserPaused)sPlay();}));
  if(sPrev&&sNext){sPrev.addEventListener('click',()=>{sStop();sPrevFn();sPlaying=true;if(!sUserPaused)sPlay();});sNext.addEventListener('click',()=>{sStop();sNextFn();sPlaying=true;if(!sUserPaused)sPlay();});}
  document.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();sStop();sPrevFn();sPlaying=true;if(!sUserPaused)sPlay();}if(e.key==='ArrowRight'){e.preventDefault();sStop();sNextFn();sPlaying=true;if(!sUserPaused)sPlay();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)sPause();else if(sPlaying&&!sUserPaused)sPlay();});

  /* RIPPLE */
  document.addEventListener('pointerdown',e=>{const link=e.target.closest('.svc-link');if(!link)return;const card=link.querySelector('.svc-card');if(!card)return;const rect=card.getBoundingClientRect(),size=Math.max(rect.width,rect.height)*2.2;const x=e.clientX-rect.left-size/2,y=e.clientY-rect.top-size/2;const r=document.createElement('span');r.className='svc-ripple';r.style.width=r.style.height=size+'px';r.style.left=x+'px';r.style.top=y+'px';const old=card.querySelector('.svc-ripple');if(old)old.remove();card.appendChild(r);setTimeout(()=>r.remove(),550);},{passive:true});

  /* RACCOLTA DIFFERENZIATA */
  (function(){
    const FEED_URL=href(C.raccolta.feedRssUrl);const PAGE_URL=href(C.raccolta.infoPageUrl);const ECO_TIPS=C.raccolta.ecoTips;
    const root=document.getElementById('raccoltaDifferenziata');
    const fmtDate=(d,opts={weekday:'short',day:'2-digit',month:'short'})=>{const loc=LANG==='en'?'en-GB':'it-IT';return d.toLocaleDateString(loc,opts).replace(/\\./g,'').replace(/^\\w/,c=>c.toUpperCase());};
    let _lastRdModel=null;
    const toMid=(d=new Date())=>{const x=new Date(d);x.setHours(0,0,0,0);return x;};
    const sameDay=(a,b)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
    const findDay=(items,d)=>items.filter(it=>sameDay(it.date,d));
    async function fetchText(url,ms=8000){const ctrl=new AbortController(),tm=setTimeout(()=>ctrl.abort(),ms);try{const res=await fetch(url,{signal:ctrl.signal});if(!res.ok)throw new Error();return await res.text();}finally{clearTimeout(tm);}}
    function parseRSS(xml){const doc=new DOMParser().parseFromString(xml,'text/xml');return[...doc.querySelectorAll('item')].map(it=>({title:it.querySelector('title')?.textContent?.trim()||'',date:new Date(it.querySelector('pubDate')?.textContent||'')})).sort((a,b)=>a.date-b.date);}
    const chipHtml=t=>'<span class="rd-chip" title="'+esc(t)+'"><i class="fa-solid fa-check"></i> '+esc(t)+'</span>';
    const chipNone=()=>'<span class="rd-chip rd-chip--none"><i class="fa-solid fa-circle-minus"></i> <span data-i18n="rd.none">'+esc(t('rd.none'))+'</span></span>';
    function renderBase(){root.innerHTML='<div class="rd-header"><div class="rd-icon" aria-hidden="true"><i class="fa-solid fa-recycle"></i></div><div><div class="rd-title" data-i18n="rd.title">'+esc(t('rd.title'))+'</div><div class="rd-sub" data-i18n="rd.sub">'+esc(t('rd.sub'))+'</div></div><div class="rd-badge" id="rdBadge"><span data-i18n="rd.today">'+esc(t('rd.today'))+'</span> • '+fmtDate(new Date())+'</div></div><div class="rd-section" id="rdToday"><h3><i class="fa-solid fa-calendar-day"></i> <span data-i18n="rd.today">'+esc(t('rd.today'))+'</span></h3><div class="rd-chips" id="chipsToday"></div></div><div class="rd-section" id="rdAgenda"><div class="rd-accordion"><div class="rd-acc-head" id="rdAccHead"><span><i class="fa-solid fa-list-ul"></i> <span data-i18n="rd.next3">'+esc(t('rd.next3'))+'</span></span><i class="fa-solid fa-chevron-down" id="rdAccArrow"></i></div><div class="rd-acc-body" id="rdAccBody"></div></div></div><div class="rd-cta"><a class="rd-btn" href="'+esc(PAGE_URL)+'" rel="noopener"><i class="fa-solid fa-circle-info"></i> <span data-i18n="rd.info">'+esc(t('rd.info'))+'</span></a></div><div class="eco-tip" id="ecoTip" style="display:none"><i class="fa-regular fa-lightbulb"></i><div><strong data-i18n="rd.eco">'+esc(t('rd.eco'))+'</strong><div id="ecoText"></div></div></div>';document.getElementById('rdAccHead')?.addEventListener('click',()=>{document.getElementById('rdAccBody')?.classList.toggle('open');document.getElementById('rdAccArrow')?.classList.toggle('fa-rotate-180');});}
    function renderEcoOnly(){document.getElementById('rdToday')?.remove();document.getElementById('rdAgenda')?.remove();const box=document.getElementById('ecoTip'),txt=document.getElementById('ecoText');if(!box||!txt)return;txt.textContent=ECO_TIPS[Math.floor(Math.random()*ECO_TIPS.length)];box.style.display='flex';}
    function renderToday(titles){const w=document.getElementById('chipsToday');if(!w)return;w.innerHTML=(!titles||!titles.length)?chipNone():titles.map(chipHtml).join('');}
    function renderAgenda(days){const b=document.getElementById('rdAccBody');if(!b)return;if(!days||!days.length){b.innerHTML='<div class="day-row"><div class="day-date">N/D</div><div>'+chipNone()+'</div></div>';return;}b.innerHTML=days.map(d=>'<div class="day-row"><div class="day-date">'+esc(d.label)+'</div><div>'+(d.titles.length?d.titles.map(chipHtml).join(''):chipNone())+'</div></div>').join('');}
    function buildModel(items){const today=toMid(),tom=new Date(today);tom.setDate(today.getDate()+1);const days=[];for(let i=1;i<=3;i++){const d=new Date(today);d.setDate(today.getDate()+i);days.push({date:d,label:fmtDate(d),titles:findDay(items,d).map(it=>it.title)});}return{todayTitles:findDay(items,today).map(it=>it.title),tomorrowTitles:findDay(items,tom).map(it=>it.title),agendaDays:days};}
    function applyModel(m){_lastRdModel=m;renderBase();const hr=new Date().getHours(),noData=(!m.todayTitles?.length)&&(!m.tomorrowTitles?.length);if(hr<12||noData){renderEcoOnly();return;}renderToday(m.todayTitles);renderAgenda(m.agendaDays);}
    window.reRenderRaccolta=function(){if(_lastRdModel){_lastRdModel.agendaDays.forEach(d=>{if(d.date)d.label=fmtDate(d.date);});applyModel(_lastRdModel);}};
    async function loadRD(){try{const xml=await fetchText(FEED_URL);const items=parseRSS(xml);const m=buildModel(items);applyModel(m);try{localStorage.setItem('rd_cache_v2',JSON.stringify({ts:Date.now(),model:m}));}catch(e){}}catch(e){try{const c=JSON.parse(localStorage.getItem('rd_cache_v2'));if(c&&c.model){applyModel(c.model);return;}}catch(e2){}renderBase();renderEcoOnly();}}
    loadRD();document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadRD();});
    (function schedMid(){const ms=new Date(new Date().getFullYear(),new Date().getMonth(),new Date().getDate()+1)-new Date();setTimeout(()=>{loadRD();schedMid();},ms);})();
  })();

  /* METEO */
  (function(){
    const MC=C.meteo;const METEO_CFG={name:C.nomeComune,lat:C.lat,lon:C.lon,weeklyUrl:href(MC.weeklyForecastUrl),interval:MC.updateIntervalMin,timeout:MC.timeoutMs};
    const pad2=n=>String(n).padStart(2,'0');const nowTime=()=>{const d=new Date();return pad2(d.getHours())+':'+pad2(d.getMinutes());};
    const chip=html=>'<span class="m-chip">'+html+'</span>';
    const nowEl=document.getElementById('meteoNow'),detEl=document.getElementById('meteoDet');
    const cityEl=document.getElementById('mwCity'),badgeEl=document.getElementById('mwBadge');
    const weeklyBtn=document.getElementById('meteoWeekly');
    const loader=document.getElementById('meteoLoader'),err=document.getElementById('meteoError');
    const errmsg=document.getElementById('meteoErrmsg'),retry=document.getElementById('meteoRetry');
    const accHead=document.getElementById('meteoAccHead'),accBody=document.getElementById('meteoAccBody'),chev=document.getElementById('meteoChev');
    const showLoader=v=>loader?.classList.toggle('visible',!!v);
    const showErr=m=>{if(errmsg)errmsg.textContent=m||'Errore';err?.classList.add('visible');showLoader(false);};
    const hideErr=()=>err?.classList.remove('visible');
    const iconFor=c=>{if(c===0)return'fa-sun';if([1,2].includes(c))return'fa-cloud-sun';if(c===3)return'fa-cloud';if([45,48].includes(c))return'fa-smog';if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(c))return'fa-cloud-showers-heavy';if([71,73,75,77,85,86].includes(c))return'fa-snowflake';if([95,96,99].includes(c))return'fa-cloud-bolt';return'fa-circle-question';};
    const descFor=c=>{const k='w.'+c;return t(k)!==k?t(k):'N/D';};
    let _lastMeteo=null;
    function render(cur,daily){_lastMeteo={cur,daily};if(cityEl)cityEl.textContent=METEO_CFG.name;if(badgeEl)badgeEl.textContent='Agg. '+nowTime();const temp=Math.round(cur.temperature_2m),tMax=Math.round(daily.temperature_2m_max[0]),tMin=Math.round(daily.temperature_2m_min[0]);const ico=iconFor(cur.weather_code),desc=descFor(cur.weather_code);if(nowEl)nowEl.innerHTML=[chip('<i class="fa-solid '+ico+'"></i> '+desc),chip('<i class="fa-solid fa-temperature-half"></i> '+temp+'°C'),chip('<i class="fa-solid fa-arrow-trend-up"></i> \\u2191'+tMax+'° • \\u2193'+tMin+'°C')].join('');const hum=Math.round(cur.relative_humidity_2m),wind=Math.round(cur.wind_speed_10m),pprob=daily.precipitation_probability_max?.[0]??'--',press=Math.round(cur.surface_pressure);if(detEl)detEl.innerHTML=[chip('<i class="fa-solid fa-droplet"></i> '+t('meteo.humidity')+' '+hum+'%'),chip('<i class="fa-solid fa-wind"></i> '+t('meteo.wind')+' '+wind+' km/h'),chip('<i class="fa-solid fa-umbrella"></i> '+t('meteo.rain')+' '+pprob+'%'),chip('<i class="fa-solid fa-gauge"></i> '+t('meteo.pressure')+' '+press+' hPa')].join('');}
    window.reRenderMeteo=function(){if(_lastMeteo)render(_lastMeteo.cur,_lastMeteo.daily);};
    async function loadMeteo(){hideErr();showLoader(true);const ctrl=new AbortController(),tm=setTimeout(()=>ctrl.abort(),METEO_CFG.timeout);try{const url='https://api.open-meteo.com/v1/forecast?latitude='+METEO_CFG.lat+'&longitude='+METEO_CFG.lon+'&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,surface_pressure,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe/Rome';const res=await fetch(url,{signal:ctrl.signal});clearTimeout(tm);if(!res.ok)throw new Error();const data=await res.json();render(data.current,data.daily);}catch(e){showErr(e.name==='AbortError'?'Timeout':'Dati non disponibili');}finally{showLoader(false);}}
    weeklyBtn?.addEventListener('click',e=>{e.preventDefault();if(window.parent)window.parent.location.href=METEO_CFG.weeklyUrl;else window.location.href=METEO_CFG.weeklyUrl;});
    retry?.addEventListener('click',e=>{e.preventDefault();loadMeteo();});
    accHead?.addEventListener('click',()=>{accBody?.classList.toggle('open');chev?.classList.toggle('fa-rotate-180');});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadMeteo();});
    loadMeteo();setInterval(loadMeteo,METEO_CFG.interval*60*1000);
  })();

  /* LANGUAGE SWITCHER */
  function applyLang(lang){
    LANG=lang;localStorage.setItem('cd_lang',lang);
    const flagBtn=document.getElementById('langToggle');
    if(flagBtn){const otherLang=lang==='it'?'en':'it';flagBtn.textContent=C.i18n.lingue[otherLang]||'\\u{1F310}';}
    document.querySelectorAll('[data-i18n]').forEach(el=>{const key=el.getAttribute('data-i18n');const val=t(key);if(val!==key)el.textContent=val;});
    document.querySelectorAll('[data-i18n-it]').forEach(el=>{const txt=el.getAttribute('data-i18n-'+lang)||el.getAttribute('data-i18n-it');if(txt)el.textContent=txt;});
    document.querySelectorAll('.slide').forEach(slide=>{const title=slide.getAttribute('data-title-'+lang)||slide.getAttribute('data-title-it');const h1=slide.querySelector('.slide-title');if(h1&&title)h1.textContent=title;});
    document.title=(lang==='en'?'Home':'Home')+' – '+C.nomeComune+' – Comune.Digital';
    if(typeof updateDateWidget==='function')updateDateWidget();
    if(typeof window.reRenderMeteo==='function')window.reRenderMeteo();
    if(typeof window.reRenderRaccolta==='function')window.reRenderRaccolta();
  }
  const langBtn=document.getElementById('langToggle');
  if(langBtn){langBtn.addEventListener('click',()=>{applyLang(LANG==='it'?'en':'it');});}
  applyLang(LANG);
})();

/* ACCESSIBILITY */
(function(){
  "use strict";
  const C=window.COMUNE_CONFIG;const A=C.accessibilita||{};const root=document.documentElement;const liveEl=document.getElementById('a11yLive');
  function announce(msg){if(!liveEl)return;liveEl.textContent='';requestAnimationFrame(()=>{liveEl.textContent=msg;});}
  function saveP(k,v){try{localStorage.setItem('cd_a11y_'+k,JSON.stringify(v));}catch(e){}}
  function loadP(k,d){try{const v=localStorage.getItem('cd_a11y_'+k);return v!==null?JSON.parse(v):d;}catch(e){return d;}}
  let darkOn=false;let contrastOn=false;let fontScale=0;const maxScale=A.maxFontScale||4;
  const fab=document.getElementById('a11yFab'),panel=document.getElementById('a11yPanel');
  const btnDark=document.getElementById('a11yDark'),btnContr=document.getElementById('a11yContrast');
  const btnFUp=document.getElementById('a11yFontUp'),btnFDn=document.getElementById('a11yFontDown');
  const fontVal=document.getElementById('a11yFontVal'),btnReset=document.getElementById('a11yReset');
  if(!A.abilitaDarkMode)document.getElementById('a11yRowDark')?.remove();
  if(!A.abilitaContrasto)document.getElementById('a11yRowContrast')?.remove();
  if(!A.abilitaFontScale)document.getElementById('a11yRowFont')?.remove();
  function applyDark(on){darkOn=!!on;root.setAttribute('data-theme',darkOn?'dark':'light');if(btnDark){btnDark.setAttribute('aria-pressed',String(darkOn));btnDark.querySelector('i').className=darkOn?'fa-solid fa-sun a11y-btn-icon':'fa-solid fa-moon a11y-btn-icon';}saveP('dark',darkOn);}
  function applyContrast(on){contrastOn=!!on;if(contrastOn)root.setAttribute('data-contrast','high');else root.removeAttribute('data-contrast');if(btnContr)btnContr.setAttribute('aria-pressed',String(contrastOn));saveP('contrast',contrastOn);}
  function applyFontScale(level){fontScale=Math.max(0,Math.min(maxScale,level));if(fontScale>0)root.setAttribute('data-fontscale',String(fontScale));else root.removeAttribute('data-fontscale');if(fontVal)fontVal.textContent=String(fontScale);saveP('fontscale',fontScale);}
  fab?.addEventListener('click',()=>{const open=panel.classList.toggle('open');fab.setAttribute('aria-expanded',String(open));fab.setAttribute('aria-label',open?'Chiudi impostazioni accessibilità':'Apri impostazioni accessibilità');if(open)announce('Pannello accessibilità aperto');});
  document.addEventListener('pointerdown',(e)=>{if(!panel?.classList.contains('open'))return;if(!panel.contains(e.target)&&!fab?.contains(e.target)){panel.classList.remove('open');fab?.setAttribute('aria-expanded','false');}});
  document.addEventListener('keydown',(e)=>{if(e.key==='Escape'&&panel?.classList.contains('open')){panel.classList.remove('open');fab?.setAttribute('aria-expanded','false');fab?.focus();}});
  btnDark?.addEventListener('click',()=>{applyDark(!darkOn);announce(darkOn?'Tema scuro attivato':'Tema chiaro attivato');});
  btnContr?.addEventListener('click',()=>{applyContrast(!contrastOn);announce(contrastOn?'Alto contrasto attivato':'Alto contrasto disattivato');});
  btnFUp?.addEventListener('click',()=>{if(fontScale>=maxScale)return;applyFontScale(fontScale+1);announce('Testo ingrandito: livello '+fontScale);});
  btnFDn?.addEventListener('click',()=>{if(fontScale<=0)return;applyFontScale(fontScale-1);announce(fontScale===0?'Dimensione testo predefinita':'Testo ridotto: livello '+fontScale);});
  btnReset?.addEventListener('click',()=>{applyDark(false);applyContrast(false);applyFontScale(0);announce('Impostazioni di accessibilità ripristinate');});
  const storedDark=loadP('dark',null);
  if(storedDark!==null){applyDark(storedDark);}else if(A.rispettaSistema&&window.matchMedia('(prefers-color-scheme:dark)').matches){applyDark(true);}else{applyDark(false);}
  applyContrast(loadP('contrast',false));applyFontScale(loadP('fontscale',0));
  if(A.rispettaSistema){window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change',(e)=>{if(loadP('dark',null)===null){applyDark(e.matches);announce(e.matches?'Tema scuro attivato (sistema)':'Tema chiaro attivato (sistema)');}});}
  document.addEventListener('keydown',(e)=>{if(e.key==='Tab')root.classList.add('keyboard-nav');});
  document.addEventListener('mousedown',()=>root.classList.remove('keyboard-nav'));
})();

/* SPOTLIGHT */
(function(){
  "use strict";const C=window.COMUNE_CONFIG;const S=C.spotlight||{};if(!S.widgetId)return;
  const STORAGE_KEY='cd_spotlight_date';const today=new Date().toISOString().slice(0,10);
  if(!S.forzaSempre){try{if(localStorage.getItem(STORAGE_KEY)===today)return;}catch(e){}}
  const durata=S.durata||2500;
  function startSpotlight(){const widget=document.getElementById(S.widgetId);if(!widget)return;try{localStorage.setItem(STORAGE_KEY,today);}catch(e){}
    const overlay=document.createElement('div');overlay.className='spotlight-overlay';document.body.appendChild(overlay);
    function closeSpotlight(){widget.classList.remove('spotlight-center');widget.style.transform='';overlay.classList.remove('active');setTimeout(function(){widget.classList.remove('spotlight-active','spotlight-target');widget.style.zIndex='';if(overlay.parentNode)overlay.remove();window.scrollTo({top:0,behavior:'smooth'});},700);}
    overlay.addEventListener('click',closeSpotlight);
    widget.scrollIntoView({behavior:'smooth',block:'center'});
    setTimeout(function(){const rect=widget.getBoundingClientRect();const viewH=window.innerHeight;const viewW=window.innerWidth;const widgetCenterY=rect.top+rect.height/2;const widgetCenterX=rect.left+rect.width/2;const deltaY=(viewH/2)-widgetCenterY;const deltaX=(viewW/2)-widgetCenterX;const scaleVal=Math.min(1.08,(viewW-32)/rect.width);widget.classList.add('spotlight-target');overlay.classList.add('active');requestAnimationFrame(function(){widget.classList.add('spotlight-active');widget.style.transform='translate('+deltaX+'px,'+deltaY+'px) scale('+scaleVal+')';widget.style.zIndex='8001';setTimeout(function(){widget.classList.add('spotlight-center');},650);setTimeout(closeSpotlight,durata);});},600);}
  if(document.readyState==='complete'){setTimeout(startSpotlight,1000);}else{window.addEventListener('load',function(){setTimeout(startSpotlight,1000);});}
})();`;
  }

  /* ============================================================
     PUBLIC API
     ============================================================ */
  return { render, generateHTML };
})();

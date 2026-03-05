/**
 * Serverless Function — Cartolina View (8 Marzo)
 *
 * Renderizza la pagina di visualizzazione della cartolina con i dati già
 * incorporati nell'HTML. Questo bypassa il problema delle webview (GoodBarber)
 * che non preservano i parametri URL.
 *
 * Endpoint: GET /api/cartolina-view?cn=NomeComune&da=Base64Nome&msg=Base64Msg&sa=urlApp&hp=urlHome&st=urlStemma
 *
 * Parametri query:
 *   cn  = Nome del comune (obbligatorio)
 *   da  = Nome mittente codificato in Base64 (opzionale)
 *   msg = Messaggio codificato in Base64 (opzionale)
 *   sa  = URL scarica app (opzionale)
 *   hp  = URL homepage app (opzionale)
 *   st  = URL stemma/logo comune (opzionale)
 */

module.exports = (req, res) => {
  // Solo GET
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  var cn = req.query.cn || 'Comune';
  var daRaw = req.query.da || '';
  var msgRaw = req.query.msg || '';
  var saRaw = req.query.sa || '';
  var hpRaw = req.query.hp || '';
  var stRaw = req.query.st || '';

  // Decodifica Base64 → UTF-8
  function decodeBase64(str) {
    if (!str) return '';
    try {
      return Buffer.from(decodeURIComponent(str), 'base64').toString('utf8');
    } catch (e) {
      try { return Buffer.from(str, 'base64').toString('utf8'); }
      catch (e2) { return str; }
    }
  }

  // Sanitizza per inserimento in HTML (previene XSS)
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Sanitizza per inserimento in attributi JS/href
  function escAttr(str) {
    return escHtml(str);
  }

  // da e msg sono in Base64 (nome mittente e messaggio)
  var nomeMittente = decodeBase64(daRaw);
  var messaggio = decodeBase64(msgRaw);
  // sa, hp, st sono URL normali (già decodificati da Vercel query parser)
  var sa = saRaw || '#';
  var hp = hpRaw || '#';
  var st = stRaw || '';
  var nomeComune = escHtml(cn);
  var scaricaApp = escAttr(sa);
  var homepage = escAttr(hp);

  // Limiti di sicurezza
  if (nomeMittente.length > 50) nomeMittente = nomeMittente.substring(0, 50);
  if (messaggio.length > 150) messaggio = messaggio.substring(0, 150);

  var nomeSafe = escHtml(nomeMittente);
  var msgSafe = escHtml(messaggio);

  // Blocco stemma
  var stemmaBlock = '';
  if (st) {
    stemmaBlock = '<img src="' + escAttr(st) + '" alt="Stemma ' + nomeComune + '" style="height:36px;object-fit:contain;">';
  }

  // Sezione mittente (visibile solo se presente)
  var introMittenteHtml = nomeSafe
    ? '<div class="intro-mittente visible">✉️ Inviata da ' + nomeSafe + '</div>'
    : '<div class="intro-mittente"></div>';

  var cardMittenteHtml = nomeSafe
    ? '<div class="card-mittente visible">— ' + nomeSafe + '</div>'
    : '';

  var cardMsgHtml = msgSafe
    ? '<div class="card-msg-personale visible">💬 "' + msgSafe + '"</div>'
    : '';

  var html = '<!DOCTYPE html>\n' +
'<html lang="it">\n' +
'<head>\n' +
'<meta charset="UTF-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">\n' +
'<title>8 Marzo – La tua cartolina</title>\n' +
'<link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@500;700&family=Titillium+Web:wght@300;400;600;700&display=swap" rel="stylesheet">\n' +
'<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">\n' +
'<style>\n' +
'  :root {\n' +
'    --blu-900: #0D3A5C; --blu-700: #145284; --blu-500: #2E6DA8;\n' +
'    --verde-700: #3CA434; --verde-500: #59C64D; --verde-300: #A4E89A; --verde-100: #E2F8DE;\n' +
'    --grigio-700: #4A4A4A; --grigio-500: #9B9B9B;\n' +
'    --mimosa: #F5C842; --mimosa-scuro: #C9960A;\n' +
'    --rosa: #C2185B; --rosa-chiaro: #E06090; --rosa-bg: #FDE8EF;\n' +
'  }\n' +
'  * { box-sizing: border-box; margin: 0; padding: 0; }\n' +
'  html { overflow-x: hidden; max-width: 100vw; }\n' +
'  body {\n' +
'    font-family: "Titillium Web", sans-serif;\n' +
'    background: linear-gradient(160deg, #0D3A5C 0%, #145284 35%, #1B6A6E 65%, #1A7C5A 100%);\n' +
'    min-height: 100vh; display: flex; flex-direction: column;\n' +
'    align-items: center; justify-content: center;\n' +
'    padding: 16px 16px 32px; position: relative; overflow-x: hidden;\n' +
'  }\n' +
'  body::before { content:""; position:fixed; top:-50%; right:-30%; width:80vw; height:80vw; border-radius:50%; background:radial-gradient(circle,rgba(245,200,66,0.08) 0%,transparent 70%); z-index:0; pointer-events:none; }\n' +
'  body::after { content:""; position:fixed; bottom:-40%; left:-20%; width:70vw; height:70vw; border-radius:50%; background:radial-gradient(circle,rgba(194,24,91,0.08) 0%,transparent 70%); z-index:0; pointer-events:none; }\n' +
'  .petalo { position:fixed; opacity:0; pointer-events:none; animation:caduta linear infinite; z-index:0; }\n' +
'  @keyframes caduta { 0%{transform:translateY(-60px) rotate(0deg) scale(0.8);opacity:0} 10%{opacity:0.7} 90%{opacity:0.3} 100%{transform:translateY(110vh) rotate(720deg) scale(0.4);opacity:0} }\n' +
'  .intro { text-align:center; position:relative; z-index:10; margin-bottom:12px; animation:fadeDown 0.7s ease both; }\n' +
'  @keyframes fadeDown { from{opacity:0;transform:translateY(-16px)} to{opacity:1;transform:translateY(0)} }\n' +
'  .intro-emoji { display:block; margin-bottom:4px; }\n' +
'  .intro-emoji img { height:50px; object-fit:contain; filter:drop-shadow(0 3px 8px rgba(0,0,0,0.2)); animation:pulse 3s ease-in-out infinite; }\n' +
'  @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }\n' +
'  .intro h1 { color:white; font-size:1.3rem; font-weight:700; letter-spacing:0.5px; margin-bottom:3px; }\n' +
'  .intro p { color:rgba(255,255,255,0.55); font-size:0.82rem; font-weight:300; }\n' +
'  .intro-mittente { display:none; color:var(--mimosa); font-size:0.85rem; font-weight:700; margin-top:4px; }\n' +
'  .intro-mittente.visible { display:block; }\n' +
'  .card-wrapper { width:100%; max-width:460px; position:relative; z-index:10; margin-bottom:18px; animation:popIn 0.55s cubic-bezier(.22,1.4,.36,1) 0.2s both; }\n' +
'  @keyframes popIn { from{opacity:0;transform:scale(0.88)} to{opacity:1;transform:scale(1)} }\n' +
'  .cartolina { width:100%; border-radius:20px; overflow:hidden; box-shadow:0 4px 15px rgba(0,0,0,0.15),0 22px 60px rgba(0,0,0,0.4); background:white; position:relative; min-height:280px; display:flex; flex-direction:column; }\n' +
'  .card-bg { position:absolute; inset:0; background:linear-gradient(155deg,#FDE8EF 0%,#FFF8E1 35%,#FFF0F5 65%,#E3F0FF 100%); }\n' +
'  .card-bg::before { content:""; position:absolute; inset:0; background:radial-gradient(circle at 10% 15%,rgba(245,200,66,0.25) 0%,transparent 40%),radial-gradient(circle at 90% 80%,rgba(194,24,91,0.12) 0%,transparent 40%),radial-gradient(circle at 75% 10%,rgba(92,196,220,0.12) 0%,transparent 30%); }\n' +
'  .card-nastro { position:absolute; top:0; left:0; width:100%; height:5px; background:linear-gradient(90deg,var(--rosa) 0%,var(--rosa-chiaro) 50%,var(--mimosa) 100%); z-index:3; }\n' +
'  .card-deco-tr { position:absolute; top:10px; right:12px; font-size:2rem; line-height:1; z-index:2; filter:drop-shadow(1px 2px 3px rgba(0,0,0,0.12)); animation:dondola 4s ease-in-out infinite; }\n' +
'  .card-deco-bl { position:absolute; bottom:60px; left:12px; font-size:1.5rem; line-height:1; z-index:2; animation:dondola 5s ease-in-out infinite reverse; }\n' +
'  .card-content { position:relative; z-index:4; padding:20px 20px 16px; flex:1; display:flex; flex-direction:column; gap:12px; }\n' +
'  .card-data-label { font-size:0.6rem; font-weight:700; letter-spacing:3px; color:var(--rosa); text-transform:uppercase; margin-bottom:2px; opacity:0.7; }\n' +
'  .card-titolo { font-family:"Dancing Script",cursive; font-size:2rem; font-weight:700; color:var(--rosa); line-height:1.1; text-shadow:1px 1px 0 rgba(255,255,255,0.6); }\n' +
'  .card-titolo span { color:var(--mimosa-scuro); }\n' +
'  .card-quote { font-size:0.92rem; font-style:italic; color:var(--grigio-700); line-height:1.65; max-width:82%; padding:10px 14px; background:rgba(255,255,255,0.65); border-radius:10px; border-left:3px solid var(--mimosa); backdrop-filter:blur(4px); }\n' +
'  .card-msg-personale { font-size:0.85rem; font-weight:600; color:var(--rosa); line-height:1.55; max-width:78%; padding:8px 12px; background:linear-gradient(135deg,rgba(253,232,239,0.8),rgba(255,240,245,0.7)); border-radius:10px; border-left:3px solid var(--rosa-chiaro); display:none; animation:fadeInMsg 0.6s ease 0.6s both; }\n' +
'  @keyframes fadeInMsg { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }\n' +
'  .card-msg-personale.visible { display:block; }\n' +
'  .card-mittente { font-size:0.78rem; font-weight:600; color:#9B9B9B; font-style:italic; display:none; margin-top:2px; animation:fadeInMsg 0.6s ease 0.8s both; }\n' +
'  .card-mittente.visible { display:block; }\n' +
'  .card-footer { display:flex; justify-content:space-between; align-items:flex-end; margin-top:auto; }\n' +
'  .card-footer-comune { font-size:0.56rem; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:#9B9B9B; line-height:1.6; }\n' +
'  .card-footer-comune span { display:block; font-size:0.7rem; color:var(--blu-700); font-weight:700; }\n' +
'  .card-mimosa { font-size:1.8rem; animation:dondola 3s ease-in-out infinite; filter:drop-shadow(1px 2px 4px rgba(0,0,0,0.15)); }\n' +
'  @keyframes dondola { 0%,100%{transform:rotate(-6deg)} 50%{transform:rotate(6deg)} }\n' +
'  .download-section { width:100%; max-width:460px; position:relative; z-index:10; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.15); border-radius:18px; padding:22px 18px; text-align:center; margin-bottom:12px; backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); animation:fadeUp 0.5s ease 0.5s both; }\n' +
'  @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }\n' +
'  .download-section .download-icon { font-size:2.2rem; margin-bottom:8px; display:block; }\n' +
'  .download-section h2 { color:white; font-size:1.15rem; font-weight:700; margin-bottom:6px; }\n' +
'  .download-section p { color:rgba(255,255,255,0.55); font-size:0.78rem; font-weight:300; margin-bottom:16px; line-height:1.5; }\n' +
'  .azioni { width:100%; max-width:460px; position:relative; z-index:10; display:flex; flex-direction:column; gap:10px; }\n' +
'  .btn { display:flex; align-items:center; justify-content:center; gap:10px; padding:16px 20px; border-radius:14px; border:none; font-family:"Titillium Web",sans-serif; font-size:0.92rem; font-weight:700; cursor:pointer; transition:all 0.25s ease; text-decoration:none; letter-spacing:0.3px; width:100%; position:relative; overflow:hidden; }\n' +
'  .btn:active { transform:scale(0.97); }\n' +
'  .btn i { font-size:1.1rem; }\n' +
'  .btn-app { background:linear-gradient(135deg,var(--verde-700) 0%,var(--verde-500) 100%); color:white; box-shadow:0 4px 18px rgba(60,164,52,0.4); font-size:1rem; padding:18px 20px; }\n' +
'  .btn-app:hover { box-shadow:0 6px 24px rgba(60,164,52,0.5); transform:translateY(-2px); }\n' +
'  .btn-app i { font-size:1.2rem; }\n' +
'  .btn-home { background:rgba(255,255,255,0.08); color:white; border:1px solid rgba(255,255,255,0.18); }\n' +
'  .btn-home:hover { background:rgba(255,255,255,0.15); transform:translateY(-1px); }\n' +
'  .divider-testo { text-align:center; color:rgba(255,255,255,0.35); font-size:0.72rem; font-weight:300; padding:2px 0; }\n' +
'  .privacy-notice { width:100%; max-width:460px; margin-top:18px; padding:12px 16px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:12px; display:flex; align-items:flex-start; gap:10px; position:relative; z-index:10; animation:fadeUp 0.5s ease 0.7s both; }\n' +
'  .privacy-notice i { color:var(--verde-300); font-size:0.85rem; margin-top:1px; flex-shrink:0; }\n' +
'  .privacy-notice p { color:rgba(255,255,255,0.45); font-size:0.68rem; font-weight:400; line-height:1.6; }\n' +
'  .footer-ist { margin-top:16px; text-align:center; color:rgba(255,255,255,0.22); font-size:0.65rem; font-weight:300; position:relative; z-index:10; line-height:1.9; }\n' +
'  .footer-ist a { color:rgba(255,255,255,0.38); text-decoration:none; transition:color 0.2s; }\n' +
'  .footer-ist a:hover { color:white; }\n' +
'</style>\n' +
'</head>\n' +
'<body>\n' +
'\n' +
'<div class="intro">\n' +
'  <span class="intro-emoji"><img src="https://estensioni.comune.digital/docs/mimosa.png" alt="Mimosa"></span>\n' +
'  <h1>Hai ricevuto una cartolina!</h1>\n' +
'  <p>Qualcuno ti pensa in questo giorno speciale</p>\n' +
'  ' + introMittenteHtml + '\n' +
'</div>\n' +
'\n' +
'<div class="card-wrapper">\n' +
'  <div class="cartolina">\n' +
'    <div class="card-bg"></div>\n' +
'    <div class="card-nastro"></div>\n' +
'    <div class="card-deco-tr">🌼🌿</div>\n' +
'    <div class="card-deco-bl">🌸</div>\n' +
'    <div class="card-content">\n' +
'      <div>\n' +
'        <div class="card-data-label">8 Marzo · Festa della Donna</div>\n' +
'        <div class="card-titolo">Buon 8<span> Marzo</span></div>\n' +
'      </div>\n' +
'      <div class="card-quote">\n' +
'        "Il rispetto non è un simbolo da esibire per un giorno.<br>\n' +
'        È una responsabilità quotidiana che passa dai gesti,<br>\n' +
'        dalle scelte e dai diritti di tutte le donne."\n' +
'      </div>\n' +
'      ' + cardMsgHtml + '\n' +
'      ' + cardMittenteHtml + '\n' +
'      <div class="card-footer">\n' +
'        <div class="card-footer-comune">\n' +
'          Un pensiero a cura del\n' +
'          <span>Comune di ' + nomeComune + '</span>\n' +
'        </div>\n' +
'        <div class="card-mimosa">🌼</div>\n' +
'      </div>\n' +
'    </div>\n' +
'  </div>\n' +
'</div>\n' +
'\n' +
'<div class="download-section">\n' +
'  <span class="download-icon">📱</span>\n' +
'  <h2>Non hai ancora l\'app del Comune?</h2>\n' +
'  <p>Resta aggiornato su eventi, servizi e notizie del tuo Comune direttamente sul tuo smartphone</p>\n' +
'  <div class="azioni">\n' +
'    <a class="btn btn-app" href="' + scaricaApp + '" target="_blank">\n' +
'      <i class="fas fa-download"></i> Scarica l\'app del Comune\n' +
'    </a>\n' +
'    <div class="divider-testo">— oppure —</div>\n' +
'    <a class="btn btn-home" href="' + homepage + '">\n' +
'      <i class="fas fa-home"></i> Vai all\'homepage dell\'app\n' +
'    </a>\n' +
'  </div>\n' +
'</div>\n' +
'\n' +
'<div class="privacy-notice">\n' +
'  <i class="fas fa-shield-alt"></i>\n' +
'  <p>\n' +
'    <strong>La tua privacy è al sicuro.</strong> Nessun dato personale viene salvato, raccolto o memorizzato dall\'app.\n' +
'    Il messaggio e il nome del mittente viaggiano esclusivamente all\'interno del link e non vengono archiviati su alcun server.\n' +
'  </p>\n' +
'</div>\n' +
'\n' +
'<div class="footer-ist">\n' +
'  Un\'iniziativa del Comune · Powered by <a href="https://comune.digital" target="_blank">Comune.Digital</a>\n' +
'</div>\n' +
'\n' +
'<script>\n' +
'  var petaliEmoji = ["🌸","🌼","💛","✨","🌿","💐"];\n' +
'  petaliEmoji.forEach(function(em) {\n' +
'    for (var j = 0; j < 3; j++) {\n' +
'      var p = document.createElement("div");\n' +
'      p.className = "petalo";\n' +
'      p.textContent = em;\n' +
'      var size = 0.7 + Math.random() * 1;\n' +
'      var dur = 8 + Math.random() * 8;\n' +
'      var delay = Math.random() * 12;\n' +
'      p.style.cssText = "left:" + (Math.random()*100) + "vw;font-size:" + size + "rem;animation-duration:" + dur + "s;animation-delay:" + delay + "s";\n' +
'      document.body.prepend(p);\n' +
'    }\n' +
'  });\n' +
'</script>\n' +
'</body>\n' +
'</html>';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.status(200).send(html);
};

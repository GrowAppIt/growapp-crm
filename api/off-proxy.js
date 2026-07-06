/**
 * Serverless Function — Proxy Open Food Facts (e famiglia Open*Facts)
 *
 * Riceve l'URL di una API Open Food Facts / Open Beauty Facts / Open Products
 * Facts, la chiama lato server e restituisce il JSON con header CORS aperti.
 *
 * Serve alla webapp "Dove lo butto?" caricata dentro le app GoodBarber:
 * dentro la WebView nativa iOS la fetch cross-origin diretta verso
 * world.openfoodfacts.org può essere bloccata (CSP connect-src del container,
 * origine "null" quando la pagina gira su schema custom, ATS). Instradando la
 * chiamata su crm.comune.digital (raggiungibile dalle app GoodBarber, come già
 * fatto per gli RSS) si aggira il blocco.
 *
 * Endpoint: GET /api/off-proxy?url={apiUrl}
 *
 * Successo:  200 OK, Content-Type: application/json, <body JSON di OFF>
 * Errore:    { ok: false, error: "messaggio", remoteStatus?: n }
 *
 * Sicurezza: accetta SOLO URL sui domini Open*Facts (allowlist sotto).
 */

module.exports = async function handler(req, res) {
    // CORS aperto: chiamato da WebView GoodBarber su altri domini
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // I prodotti cambiano di rado: cache edge 10 min + stale 1 giorno
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=86400');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    if (req.method !== 'GET') {
        return res.status(405).json({ ok: false, error: 'Metodo non consentito. Usa GET.' });
    }

    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ ok: false, error: 'Parametro "url" mancante.' });
    }

    let parsed;
    try {
        parsed = new URL(url);
    } catch (e) {
        return res.status(400).json({ ok: false, error: 'URL non valido.' });
    }

    // Allowlist: solo i domini della famiglia Open*Facts
    const allowedSuffixes = [
        '.openfoodfacts.org',
        '.openbeautyfacts.org',
        '.openproductsfacts.org',
        '.openpetfoodfacts.org',
        'openfoodfacts.org',
        'openbeautyfacts.org',
        'openproductsfacts.org',
        'openpetfoodfacts.org'
    ];
    const host = parsed.hostname.toLowerCase();
    const isAllowed = allowedSuffixes.some(s => host === s.replace(/^\./, '') || host.endsWith(s));
    if (!isAllowed) {
        return res.status(403).json({ ok: false, error: 'Dominio non autorizzato per il proxy Open Food Facts: ' + host });
    }
    if (parsed.protocol !== 'https:') {
        return res.status(400).json({ ok: false, error: 'Sono ammessi solo URL https.' });
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        const response = await fetch(parsed.toString(), {
            headers: {
                // OFF chiede uno User-Agent descrittivo dell'applicazione
                'User-Agent': 'ComuneDigital-DoveLoButto/1.0 (info@comune.digital)',
                'Accept': 'application/json'
            },
            signal: controller.signal,
            redirect: 'follow'
        });
        clearTimeout(timeout);

        const contentType = response.headers.get('content-type') || '';
        const body = await response.text();

        if (!response.ok) {
            return res.status(502).json({
                ok: false,
                error: 'Open Food Facts ha risposto con errore: ' + response.status,
                remoteStatus: response.status,
                remoteBodyHead: body ? body.substring(0, 200) : ''
            });
        }

        // Difesa: scartiamo eventuale HTML (non deve mai capitare lato server)
        const trimmed = (body || '').trim().toLowerCase();
        if (trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html')) {
            return res.status(502).json({
                ok: false,
                error: 'Risposta non-JSON da Open Food Facts.',
                remoteBodyHead: body.substring(0, 200)
            });
        }

        res.setHeader('Content-Type', contentType.indexOf('json') >= 0 ? contentType : 'application/json; charset=utf-8');
        return res.status(200).send(body);
    } catch (error) {
        if (error && error.name === 'AbortError') {
            return res.status(504).json({ ok: false, error: 'Timeout sul fetch di Open Food Facts.' });
        }
        console.error('[off-proxy] Errore:', error && error.message);
        return res.status(500).json({
            ok: false,
            error: 'Errore interno del proxy: ' + (error && error.message ? error.message : 'unknown')
        });
    }
};

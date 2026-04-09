/**
 * Serverless Function — Proxy RSS Generico
 *
 * Riceve un URL di feed RSS/XML, lo chiama lato server e restituisce
 * il contenuto raw (XML) con header CORS aperti.
 *
 * Serve a bypassare:
 *  - il Service Worker delle app GoodBarber (mezzolombardo.comune.digital ecc.)
 *    che intercetta i fetch same-origin e restituisce la SPA shell
 *  - i CORS proxy pubblici (allorigins/corsproxy/codetabs) che sono
 *    spesso 403 o down
 *
 * Endpoint: GET /api/rss-proxy?url={feedUrl}
 *
 * Risposta in caso di successo:
 *   200 OK
 *   Content-Type: text/xml; charset=utf-8
 *   <body XML del feed>
 *
 * Risposta in caso di errore:
 *   { ok: false, error: "messaggio", remoteStatus?: n, remoteBodyHead?: "..." }
 *
 * Sicurezza:
 *   Accetta solo URL su domini *.comune.digital (i Comuni clienti)
 *   o domini RSS noti (rss.app, ecc.). Modificare validHosts se serve
 *   ampliare l'allowlist.
 *
 * Note tecniche:
 *   - Manda uno User-Agent di Chrome reale: alcuni feed bloccano UA custom.
 *   - Manda Referer e Origin coerenti con il dominio del feed stesso,
 *     per superare gate semplici lato server.
 *   - Se il server remoto risponde con un codice non-2xx, restituisce un
 *     JSON di diagnostica che include i primi 200 caratteri del body:
 *     utilissimo per capire se il 404 è una SPA shell o un vero errore.
 */

module.exports = async function handler(req, res) {
    // CORS aperto: viene chiamato da iframe GoodBarber su altri domini
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // Cache 5 minuti edge + stale 1h: il feed eventi non cambia spesso
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');

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

    // Allowlist domini consentiti
    let parsed;
    try {
        parsed = new URL(url);
    } catch (e) {
        return res.status(400).json({ ok: false, error: 'URL non valido.' });
    }

    const allowedSuffixes = [
        '.comune.digital',
        '.goodbarber.app',
        '.goodbarber.com',
        '.ww-api.com',
        '.rss.app',
        'rss.app'
    ];

    // Pattern aggiuntivi: siti istituzionali dei Comuni italiani
    // Esempio: www.comune.pantelleria.tp.it, www.comune.mezzolombardo.tn.it
    const allowedPatterns = [
        /^(www\.)?comune\..+\.it$/i,       // comune.*.it (siti comunali)
        /\.comune\..+\.it$/i,              // *.comune.*.it (sottodomini comunali)
        /^(www\.)?regione\..+\.it$/i,      // regione.*.it (siti regionali)
        /^(www\.)?provincia\..+\.it$/i,    // provincia.*.it (siti provinciali)
        /\.governo\.it$/i,                 // *.governo.it
        /\.beniculturali\.it$/i,           // *.beniculturali.it
        /\.protezionecivile\.it$/i         // *.protezionecivile.it
    ];

    const host = parsed.hostname.toLowerCase();
    const isAllowedSuffix = allowedSuffixes.some(s => host === s.replace(/^\./, '') || host.endsWith(s));
    const isAllowedPattern = allowedPatterns.some(re => re.test(host));
    if (!isAllowedSuffix && !isAllowedPattern) {
        return res.status(403).json({ ok: false, error: 'Dominio non autorizzato per il proxy RSS: ' + host });
    }

    // Solo http/https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return res.status(400).json({ ok: false, error: 'Protocollo non supportato.' });
    }

    // Origin / Referer coerenti col dominio del feed (sembra un browser
    // che naviga proprio su quel sito)
    const siteOrigin = parsed.protocol + '//' + parsed.hostname;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        const response = await fetch(parsed.toString(), {
            headers: {
                // UA reale di Chrome desktop: i server di solito si fidano
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*;q=0.8',
                'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Referer': siteOrigin + '/',
                'Origin': siteOrigin,
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin'
            },
            signal: controller.signal,
            redirect: 'follow'
        });
        clearTimeout(timeout);

        const contentType = response.headers.get('content-type') || '';
        const body = await response.text();

        if (!response.ok) {
            // Diagnostica: includiamo i primi 200 caratteri del body per capire
            // se è una SPA shell, un 404 vero, un messaggio di errore ecc.
            return res.status(502).json({
                ok: false,
                error: 'Feed remoto ha risposto con errore: ' + response.status,
                remoteStatus: response.status,
                remoteContentType: contentType,
                remoteBodyHead: body ? body.substring(0, 200) : ''
            });
        }

        // Controllo basilare: scartiamo le HTML SPA shell che possono arrivare
        // come fallback dei Service Worker (es. 200 OK ma con <!DOCTYPE html>).
        const trimmed = (body || '').trim().toLowerCase();
        if (trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html')) {
            return res.status(502).json({
                ok: false,
                error: 'Il feed remoto ha restituito HTML invece di XML (probabile SPA fallback).',
                remoteStatus: response.status,
                remoteContentType: contentType,
                remoteBodyHead: body.substring(0, 200)
            });
        }

        res.setHeader(
            'Content-Type',
            contentType.indexOf('xml') >= 0 ? contentType : 'text/xml; charset=utf-8'
        );
        return res.status(200).send(body);
    } catch (error) {
        if (error && error.name === 'AbortError') {
            return res.status(504).json({ ok: false, error: 'Timeout sul fetch del feed.' });
        }
        console.error('[rss-proxy] Errore:', error && error.message);
        return res.status(500).json({
            ok: false,
            error: 'Errore interno del proxy RSS: ' + (error && error.message ? error.message : 'unknown')
        });
    }
};

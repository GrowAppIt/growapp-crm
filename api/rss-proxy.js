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
 *   { ok: false, error: "messaggio" }
 *
 * Sicurezza:
 *   Accetta solo URL su domini *.comune.digital (i Comuni clienti)
 *   o domini RSS noti (rss.app, ecc.). Modificare validHosts se serve
 *   ampliare l'allowlist.
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
    const host = parsed.hostname.toLowerCase();
    const isAllowed = allowedSuffixes.some(s => host === s.replace(/^\./, '') || host.endsWith(s));
    if (!isAllowed) {
        return res.status(403).json({ ok: false, error: 'Dominio non autorizzato per il proxy RSS.' });
    }

    // Solo http/https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return res.status(400).json({ ok: false, error: 'Protocollo non supportato.' });
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        const response = await fetch(parsed.toString(), {
            headers: {
                // User-Agent browser-like: alcuni server bloccano UA non standard
                'User-Agent': 'Mozilla/5.0 (compatible; ComuneDigitalRSSProxy/1.0; +https://crm.comune.digital)',
                'Accept': 'application/rss+xml, application/xml, text/xml, */*;q=0.8',
                'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8'
            },
            signal: controller.signal,
            redirect: 'follow'
        });
        clearTimeout(timeout);

        if (!response.ok) {
            return res.status(502).json({
                ok: false,
                error: 'Feed remoto ha risposto con errore: ' + response.status
            });
        }

        const contentType = response.headers.get('content-type') || 'text/xml; charset=utf-8';
        const body = await response.text();

        // Controllo basilare: scartiamo le HTML SPA shell che possono arrivare
        // come fallback dei Service Worker (es. 200 OK ma con <!DOCTYPE html>).
        const trimmed = body.trim().toLowerCase();
        if (trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html')) {
            return res.status(502).json({
                ok: false,
                error: 'Il feed remoto ha restituito HTML invece di XML (probabile SPA fallback).'
            });
        }

        res.setHeader('Content-Type', contentType.indexOf('xml') >= 0 ? contentType : 'text/xml; charset=utf-8');
        return res.status(200).send(body);
    } catch (error) {
        if (error && error.name === 'AbortError') {
            return res.status(504).json({ ok: false, error: 'Timeout sul fetch del feed.' });
        }
        console.error('[rss-proxy] Errore:', error && error.message);
        return res.status(500).json({ ok: false, error: 'Errore interno del proxy RSS.' });
    }
};

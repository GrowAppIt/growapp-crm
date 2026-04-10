/**
 * Serverless Function — Proxy Immagini per RSS Slider
 *
 * Riceve un URL di immagine da un dominio con protezione hotlink
 * (es. Facebook CDN), lo scarica lato server e lo restituisce
 * al client con gli header CORS aperti.
 *
 * Serve a bypassare il blocco hotlink di Facebook/Meta che
 * restituisce 403 quando le immagini vengono caricate da un dominio
 * diverso da facebook.com.
 *
 * Endpoint: GET /api/image-proxy?url={imageUrl}
 *
 * Sicurezza:
 *   Accetta solo URL da domini CDN noti (fbcdn.net, rss.app, ecc.)
 *   per evitare abusi come open proxy.
 *
 * Cache: 1 ora edge + stale 24h (le immagini social cambiano raramente)
 */

module.exports = async function handler(req, res) {
    // CORS aperto: viene chiamato da iframe GoodBarber
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

    // Allowlist domini immagine consentiti
    const allowedSuffixes = [
        '.fbcdn.net',           // Facebook CDN (scontent-*.xx.fbcdn.net)
        '.facebook.com',        // Facebook diretto
        '.fb.com',              // Facebook short
        '.instagram.com',       // Instagram CDN (cdninstagram.com, scontent-*.cdninstagram.com)
        '.cdninstagram.com',    // Instagram CDN variante
        '.rss.app',             // RSS.app hosted images
        'rss.app',
        '.comune.digital',      // Nostre immagini
        '.googleusercontent.com', // Google (YouTube thumbnails ecc.)
        '.ytimg.com',           // YouTube thumbnails
        '.ggpht.com',           // Google profile pics
        '.wp.com',              // WordPress CDN
        '.wordpress.com',       // WordPress
        '.twimg.com',           // Twitter/X CDN
        '.pinimg.com'           // Pinterest CDN
    ];

    const host = parsed.hostname.toLowerCase();
    const isAllowed = allowedSuffixes.some(s => host === s.replace(/^\./, '') || host.endsWith(s));
    if (!isAllowed) {
        return res.status(403).json({ ok: false, error: 'Dominio immagine non autorizzato: ' + host });
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return res.status(400).json({ ok: false, error: 'Protocollo non supportato.' });
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(parsed.toString(), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': 'https://www.facebook.com/',
                'Sec-Fetch-Dest': 'image',
                'Sec-Fetch-Mode': 'no-cors',
                'Sec-Fetch-Site': 'cross-site'
            },
            signal: controller.signal,
            redirect: 'follow'
        });
        clearTimeout(timeout);

        if (!response.ok) {
            return res.status(502).json({
                ok: false,
                error: 'Immagine remota ha risposto con errore: ' + response.status,
                remoteStatus: response.status
            });
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg';

        // Verifica che sia effettivamente un'immagine
        if (!contentType.startsWith('image/')) {
            return res.status(502).json({
                ok: false,
                error: 'Il server remoto non ha restituito un\'immagine: ' + contentType
            });
        }

        // Cache aggressiva: immagini social non cambiano spesso
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
        res.setHeader('Content-Type', contentType);

        // Stream del body
        const buffer = await response.arrayBuffer();
        return res.status(200).send(Buffer.from(buffer));

    } catch (error) {
        if (error && error.name === 'AbortError') {
            return res.status(504).json({ ok: false, error: 'Timeout sul fetch dell\'immagine.' });
        }
        console.error('[image-proxy] Errore:', error && error.message);
        return res.status(500).json({
            ok: false,
            error: 'Errore interno del proxy immagini: ' + (error && error.message ? error.message : 'unknown')
        });
    }
};

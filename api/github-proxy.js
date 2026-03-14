/**
 * Serverless Function — GitHub API Proxy per Officina Digitale
 *
 * Proxy sicuro per le chiamate GitHub API.
 * Il token GitHub è salvato come variabile d'ambiente GITHUB_TOKEN su Vercel.
 *
 * Endpoint: POST /api/github-proxy
 * Body: { action, owner, repo, path }
 *
 * Actions supportate:
 *   - "repo_info"     → GET /repos/{owner}/{repo} (info repo)
 *   - "last_commits"  → GET /repos/{owner}/{repo}/commits?per_page=5 (ultimi commit)
 *   - "open_issues"   → GET /repos/{owner}/{repo}/issues?state=open&per_page=10 (issues aperte)
 *   - "readme"        → GET /repos/{owner}/{repo}/readme (README decodificato)
 *   - "file_content"  → GET /repos/{owner}/{repo}/contents/{path} (contenuto file)
 *
 * Response: { success, data } oppure { success: false, error }
 */

module.exports = async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Metodo non supportato' });
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        return res.status(500).json({
            success: false,
            error: 'Token GitHub non configurato. Aggiungi GITHUB_TOKEN nelle variabili d\'ambiente Vercel.'
        });
    }

    const { action, owner, repo, path } = req.body || {};

    if (!action || !owner || !repo) {
        return res.status(400).json({ success: false, error: 'Parametri mancanti: action, owner, repo sono obbligatori' });
    }

    // Sanitizza input (evita path traversal)
    const safeOwner = owner.replace(/[^a-zA-Z0-9._-]/g, '');
    const safeRepo = repo.replace(/[^a-zA-Z0-9._-]/g, '');
    const safePath = (path || '').replace(/\.\./g, '');

    const headers = {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'CRM-ComuneDigital/1.0'
    };

    try {
        let url;
        switch (action) {
            case 'repo_info':
                url = `https://api.github.com/repos/${safeOwner}/${safeRepo}`;
                break;
            case 'last_commits':
                url = `https://api.github.com/repos/${safeOwner}/${safeRepo}/commits?per_page=5`;
                break;
            case 'open_issues':
                url = `https://api.github.com/repos/${safeOwner}/${safeRepo}/issues?state=open&per_page=10`;
                break;
            case 'readme':
                url = `https://api.github.com/repos/${safeOwner}/${safeRepo}/readme`;
                break;
            case 'file_content':
                if (!safePath) {
                    return res.status(400).json({ success: false, error: 'Parametro path obbligatorio per file_content' });
                }
                url = `https://api.github.com/repos/${safeOwner}/${safeRepo}/contents/${safePath}`;
                break;
            default:
                return res.status(400).json({ success: false, error: `Azione "${action}" non supportata` });
        }

        const response = await fetch(url, { headers });

        if (!response.ok) {
            const errText = await response.text();
            return res.status(response.status).json({
                success: false,
                error: `GitHub API errore ${response.status}: ${errText.substring(0, 200)}`
            });
        }

        let data = await response.json();

        // Per il README, decodifica il contenuto da base64
        if (action === 'readme' && data.content) {
            data._decoded = Buffer.from(data.content, 'base64').toString('utf-8');
        }

        // Per file_content, decodifica il contenuto
        if (action === 'file_content' && data.content) {
            data._decoded = Buffer.from(data.content, 'base64').toString('utf-8');
        }

        // Limita la risposta per evitare payload troppo grandi
        if (action === 'last_commits') {
            data = data.map(c => ({
                sha: c.sha?.substring(0, 7),
                message: (c.commit?.message || '').substring(0, 120),
                author: c.commit?.author?.name || '',
                date: c.commit?.author?.date || '',
                url: c.html_url || ''
            }));
        }

        if (action === 'open_issues') {
            data = data.map(i => ({
                number: i.number,
                title: (i.title || '').substring(0, 120),
                state: i.state,
                labels: (i.labels || []).map(l => l.name),
                created_at: i.created_at,
                user: i.user?.login || '',
                url: i.html_url || ''
            }));
        }

        if (action === 'repo_info') {
            data = {
                name: data.name,
                full_name: data.full_name,
                description: data.description,
                language: data.language,
                default_branch: data.default_branch,
                open_issues_count: data.open_issues_count,
                stargazers_count: data.stargazers_count,
                updated_at: data.updated_at,
                pushed_at: data.pushed_at,
                html_url: data.html_url,
                private: data.private
            };
        }

        return res.status(200).json({ success: true, data });

    } catch (error) {
        console.error('[github-proxy] Errore:', error);
        return res.status(500).json({ success: false, error: 'Errore interno: ' + (error.message || '') });
    }
};

/**
 * 🗺️ MAPPA APP COMUNI — v3.9.0
 *
 * Cambiamenti rispetto a v3.8.0:
 *   ✅ Inferenza automatica del comune dal "nome" quando il campo comune è vuoto
 *      (es. "Comune di Mezzolombardo" → "Mezzolombardo")
 *   ✅ Pulsante "Geocodifica ora" nel popup "senza posizione" — ritenta Nominatim
 *      senza dover ricaricare la pagina
 *   ✅ Persistenza dei filtri (stato + cliente + search) in localStorage
 *   ✅ Clustering dei marker via Leaflet.markercluster (lazy-load da CDN)
 *   ✅ Badge "NUOVA" con anellino pulsante per le app create negli ultimi 30 giorni
 *   ✅ Pannello laterale con search + click-to-zoom (bottom sheet su mobile)
 *   ✅ Filtro aggiuntivo per cliente pagante
 *   ✅ Stat "cittadini serviti" nella barra in fondo (somma popolazione app attive)
 *   ✅ Icone diverse per stato (📱⚙⏸✕🧪)
 *   ✅ Deep link ?app=<id> — apri direttamente l'app o condividi il link
 *
 * Visualizza sulla mappa d'Italia le app realizzate per i comuni.
 * Geolocalizza le app usando Nominatim (OpenStreetMap) e salva le coordinate su Firestore.
 *
 * ⚡ PER RIMUOVERE: eliminare questo file + rimuovere le righe aggiunte in:
 *    - index.html (script + leaflet css/js + menu-item mappa)
 *    - ui.js (case 'mappa')
 *    - auth.js (canAccessPage 'mappa')
 *    - app.js (validPages 'mappa')
 */

const MappaClienti = {
    map: null,
    markers: [],
    markersById: {},          // appId → marker (per click dal pannello laterale)
    markerClusterGroup: null, // gruppo Leaflet.markercluster
    apps: [],
    appsFiltrate: [],
    geocodeCache: {},
    _appSenzaPosizione: [],

    // Stato filtri persistito su localStorage
    filtri: {
        stato: 'tutti',
        cliente: 'tutti',
        search: ''
    },
    LS_KEY: 'mappaApp.filtri',

    // Costanti
    GIORNI_NUOVA_APP: 30,
    PLUGIN_CLUSTER_JS: 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
    PLUGIN_CLUSTER_CSS_MAIN: 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
    PLUGIN_CLUSTER_CSS_THEME: 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',

    async render() {
        const mainContent = document.getElementById('mainContent');

        // Carica filtri salvati
        this.caricaFiltri();

        mainContent.innerHTML = `
            <style>
                /* Animazione pulse per badge "Nuova" */
                @keyframes mappaPulseNuova {
                    0%   { box-shadow: 0 0 0 0 rgba(60, 164, 52, 0.7); }
                    70%  { box-shadow: 0 0 0 10px rgba(60, 164, 52, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(60, 164, 52, 0); }
                }
                .mappa-marker-nuovo {
                    animation: mappaPulseNuova 1.6s infinite;
                    border-radius: 50%;
                }
                /* Highlight quando si clicca dal pannello laterale */
                @keyframes mappaHighlight {
                    0%   { transform: scale(1);   filter: brightness(1); }
                    50%  { transform: scale(1.8); filter: brightness(1.4); }
                    100% { transform: scale(1);   filter: brightness(1); }
                }
                .mappa-marker-highlight {
                    animation: mappaHighlight 1.2s ease-in-out;
                }
                /* Badge "NUOVA" su pannello laterale */
                .mappa-badge-nuova {
                    background: var(--verde-700, #3CA434);
                    color: white;
                    font-size: 0.65rem;
                    font-weight: 700;
                    padding: 1px 6px;
                    border-radius: 8px;
                    margin-left: 6px;
                    letter-spacing: 0.5px;
                }
                /* Riga lista app */
                .mappa-lista-riga {
                    padding: 0.55rem 0.75rem;
                    border-radius: 6px;
                    cursor: pointer;
                    border-left: 3px solid transparent;
                    transition: background 0.15s, border-color 0.15s;
                    font-size: 0.85rem;
                    line-height: 1.3;
                }
                .mappa-lista-riga:hover {
                    background: var(--blu-100, #D1E2F2);
                    border-left-color: var(--blu-700, #145284);
                }
                .mappa-lista-riga.attiva {
                    background: var(--blu-100, #D1E2F2);
                    border-left-color: var(--blu-700, #145284);
                    font-weight: 700;
                }
                .mappa-lista-comune {
                    color: var(--grigio-500, #9B9B9B);
                    font-size: 0.75rem;
                    margin-top: 2px;
                }
                /* Layout responsive pannello/mappa */
                .mappa-layout {
                    display: flex;
                    flex: 1;
                    min-height: 0;
                    position: relative;
                }
                .mappa-pannello {
                    width: 320px;
                    background: white;
                    border-right: 1px solid var(--grigio-300, #D9D9D9);
                    display: flex;
                    flex-direction: column;
                    flex-shrink: 0;
                }
                .mappa-pannello-toggle {
                    display: none;
                }
                @media (max-width: 768px) {
                    .mappa-pannello {
                        position: absolute;
                        top: 0; bottom: 0; left: 0;
                        width: 85%;
                        max-width: 320px;
                        z-index: 1000;
                        transform: translateX(-100%);
                        transition: transform 0.25s ease;
                        box-shadow: 2px 0 12px rgba(0,0,0,0.15);
                    }
                    .mappa-pannello.aperto {
                        transform: translateX(0);
                    }
                    .mappa-pannello-toggle {
                        display: inline-flex;
                    }
                }
            </style>

            <div class="page-container" style="padding: 0; height: calc(100vh - var(--header-height)); display: flex; flex-direction: column;">
                <!-- Header della pagina -->
                <div style="padding: 1rem 1.5rem; background: white; border-bottom: 1px solid var(--grigio-300); flex-shrink: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <button class="mappa-pannello-toggle" onclick="MappaClienti.togglePannello()"
                                style="padding: 0.5rem 0.75rem; border: 1px solid var(--grigio-300); border-radius: 8px; background: white; cursor: pointer; font-family: 'Titillium Web';">
                                <i class="fas fa-list"></i> Lista
                            </button>
                            <div>
                                <h1 style="font-size: 1.5rem; font-weight: 900; color: var(--blu-700); margin: 0;">
                                    <i class="fas fa-map-marked-alt"></i> Mappa App
                                </h1>
                                <p style="font-size: 0.875rem; color: var(--grigio-500); margin: 0.25rem 0 0;">
                                    Copertura territoriale delle app realizzate
                                </p>
                            </div>
                        </div>
                        <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                            <select id="mappaFiltroStato" onchange="MappaClienti.cambiaFiltro('stato', this.value)"
                                style="padding: 0.5rem 1rem; border: 1px solid var(--grigio-300); border-radius: 8px; font-family: 'Titillium Web'; font-size: 0.875rem; background: white; cursor: pointer;">
                                <option value="tutti">Tutti gli stati</option>
                                <option value="ATTIVA">Solo Attive</option>
                                <option value="IN_SVILUPPO">In Sviluppo</option>
                                <option value="SOSPESA">Sospese</option>
                                <option value="DISATTIVATA">Disattivate</option>
                                <option value="DEMO">Demo</option>
                                <option value="SENZA_STATO">Senza stato</option>
                            </select>
                            <select id="mappaFiltroCliente" onchange="MappaClienti.cambiaFiltro('cliente', this.value)"
                                style="padding: 0.5rem 1rem; border: 1px solid var(--grigio-300); border-radius: 8px; font-family: 'Titillium Web'; font-size: 0.875rem; background: white; cursor: pointer; max-width: 200px;">
                                <option value="tutti">Tutti i clienti</option>
                            </select>
                            <span id="mappaContatore" style="padding: 0.5rem 1rem; background: var(--blu-100); color: var(--blu-700); border-radius: 8px; font-size: 0.875rem; font-weight: 700;">
                                <i class="fas fa-spinner fa-spin"></i> Caricamento...
                            </span>
                        </div>
                    </div>

                    <!-- Legenda -->
                    <div style="display: flex; gap: 1.25rem; margin-top: 0.75rem; flex-wrap: wrap;">
                        <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--grigio-700);">
                            <span style="width: 14px; height: 14px; border-radius: 50%; background: #3CA434; display: inline-block; border: 2px solid #2A752F;"></span> Attiva
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--grigio-700);">
                            <span style="width: 14px; height: 14px; border-radius: 50%; background: #0288D1; display: inline-block; border: 2px solid #01579B;"></span> In Sviluppo
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--grigio-700);">
                            <span style="width: 14px; height: 14px; border-radius: 50%; background: #FFCC00; display: inline-block; border: 2px solid #E6B800;"></span> Sospesa
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--grigio-700);">
                            <span style="width: 14px; height: 14px; border-radius: 50%; background: #D32F2F; display: inline-block; border: 2px solid #B71C1C;"></span> Disattivata
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--grigio-700);">
                            <span style="width: 14px; height: 14px; border-radius: 50%; background: #9C27B0; display: inline-block; border: 2px solid #6A1B9A;"></span> Demo
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--grigio-700);">
                            <span style="width: 14px; height: 14px; border-radius: 50%; background: var(--grigio-500); display: inline-block; border: 2px solid var(--grigio-700);"></span> Senza stato
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--verde-700);">
                            <span style="width: 12px; height: 12px; border-radius: 50%; background: #3CA434; display: inline-block; box-shadow: 0 0 0 3px rgba(60,164,52,0.35);"></span>
                            Nuova (ultimi ${this.GIORNI_NUOVA_APP} gg)
                        </div>
                    </div>
                </div>

                <!-- Barra di progresso geocoding (nascosta di default) -->
                <div id="geocodingProgress" class="hidden" style="padding: 0.5rem 1.5rem; background: var(--blu-100); border-bottom: 1px solid var(--grigio-300); flex-shrink: 0;">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <i class="fas fa-search-location" style="color: var(--blu-700);"></i>
                        <div style="flex: 1;">
                            <div style="font-size: 0.8rem; color: var(--blu-700); font-weight: 600; margin-bottom: 0.25rem;" id="geocodingText">
                                Geolocalizzazione in corso...
                            </div>
                            <div style="height: 6px; background: var(--grigio-300); border-radius: 3px; overflow: hidden;">
                                <div id="geocodingBar" style="height: 100%; background: var(--blu-700); border-radius: 3px; transition: width 0.3s; width: 0%;"></div>
                            </div>
                        </div>
                        <span id="geocodingPercent" style="font-size: 0.8rem; color: var(--blu-700); font-weight: 700;">0%</span>
                    </div>
                </div>

                <!-- Layout pannello + mappa -->
                <div class="mappa-layout">
                    <aside id="mappaPannello" class="mappa-pannello">
                        <div style="padding: 0.75rem; border-bottom: 1px solid var(--grigio-300);">
                            <div style="position: relative;">
                                <i class="fas fa-search" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--grigio-500); font-size: 0.85rem;"></i>
                                <input id="mappaSearch" type="text" placeholder="Cerca app o comune..."
                                    oninput="MappaClienti.cambiaFiltro('search', this.value)"
                                    style="width: 100%; padding: 0.5rem 0.5rem 0.5rem 2rem; border: 1px solid var(--grigio-300); border-radius: 6px; font-family: 'Titillium Web'; font-size: 0.875rem; box-sizing: border-box;" />
                            </div>
                            <div id="mappaListaContatore" style="font-size: 0.75rem; color: var(--grigio-500); margin-top: 0.4rem;"></div>
                        </div>
                        <div id="mappaLista" style="flex: 1; overflow-y: auto; padding: 0.5rem;"></div>
                    </aside>

                    <div id="mappaContainer" style="flex: 1; min-height: 300px; position: relative; z-index: 1;">
                        <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--grigio-500);">
                            <div style="text-align: center;">
                                <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                                <p>Caricamento mappa...</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Stats bar in fondo -->
                <div id="mappaStats" class="hidden" style="padding: 0.75rem 1.5rem; background: var(--blu-900, #0d3a5f); color: white; display: flex; justify-content: space-around; flex-wrap: wrap; gap: 0.5rem; flex-shrink: 0; font-size: 0.8rem;">
                </div>
            </div>
        `;

        // Ripristina valori filtri nel DOM
        const selStato = document.getElementById('mappaFiltroStato');
        if (selStato) selStato.value = this.filtri.stato;
        const inputSearch = document.getElementById('mappaSearch');
        if (inputSearch) inputSearch.value = this.filtri.search;

        // Carica dati, plugin cluster e inizializza
        await this.caricaDati();
        await this.ensureClusterPlugin();
        this.inizializzaMappa();
        this.popolaSelectClienti();
        await this.posizionaMarkers();
        this.aggiornaStats();
        this.aggiornaListaPannello();
        this.gestisciDeepLink();
    },

    // ───────────────────────────────────────────────────────────
    // PERSISTENZA FILTRI
    // ───────────────────────────────────────────────────────────
    caricaFiltri() {
        try {
            const raw = localStorage.getItem(this.LS_KEY);
            if (raw) {
                const saved = JSON.parse(raw);
                this.filtri = Object.assign(this.filtri, saved);
            }
        } catch (e) { /* ignora */ }
    },

    salvaFiltri() {
        try {
            localStorage.setItem(this.LS_KEY, JSON.stringify(this.filtri));
        } catch (e) { /* ignora */ }
    },

    async cambiaFiltro(campo, valore) {
        this.filtri[campo] = valore;
        this.salvaFiltri();
        await this.posizionaMarkers();
        this.aggiornaListaPannello();
        this.aggiornaStats();
    },

    // ───────────────────────────────────────────────────────────
    // CARICAMENTO DATI
    // ───────────────────────────────────────────────────────────
    async caricaDati() {
        try {
            const snapshot = await db.collection('app').get();
            this.apps = [];

            snapshot.forEach(doc => {
                const data = doc.data();
                this.apps.push({
                    id: doc.id,
                    nome: data.nome || 'App senza nome',
                    comune: data.comune || '',
                    provincia: data.provincia || '',
                    regione: data.regione || '',
                    statoApp: data.statoApp || '',
                    clientePaganteId: data.clientePaganteId || '',
                    clientePaganteRagioneSociale: data.clientePaganteRagioneSociale || '',
                    referenteComune: data.referenteComune || '',
                    telefonoReferente: data.telefonoReferente || '',
                    emailReferente: data.emailReferente || '',
                    urlApp: data.urlApp || '',
                    popolazione: parseInt(data.popolazione) || 0,
                    dataCreazione: data.dataCreazione || '',
                    dataLancioApp: data.dataLancioApp || '',
                    lat: data.lat || null,
                    lng: data.lng || null
                });
            });

            console.log(`🗺️ Caricate ${this.apps.length} app`);
        } catch (error) {
            console.error('Errore caricamento app per mappa:', error);
            UI.showError('Errore caricamento dati app');
        }
    },

    popolaSelectClienti() {
        const sel = document.getElementById('mappaFiltroCliente');
        if (!sel) return;
        const set = new Map();
        this.apps.forEach(a => {
            if (a.clientePaganteRagioneSociale && a.clientePaganteId) {
                set.set(a.clientePaganteId, a.clientePaganteRagioneSociale);
            }
        });
        const ordinati = Array.from(set.entries()).sort((a, b) => a[1].localeCompare(b[1]));
        // Mantiene la prima option "Tutti i clienti"
        sel.innerHTML = '<option value="tutti">Tutti i clienti</option>' +
            ordinati.map(([id, nome]) =>
                `<option value="${id}">${nome.replace(/</g, '&lt;')}</option>`
            ).join('');
        sel.value = this.filtri.cliente || 'tutti';
    },

    // ───────────────────────────────────────────────────────────
    // PLUGIN CLUSTER (lazy-load da CDN, una sola volta)
    // ───────────────────────────────────────────────────────────
    async ensureClusterPlugin() {
        if (window.L && window.L.markerClusterGroup) return;

        // CSS
        if (!document.querySelector(`link[href="${this.PLUGIN_CLUSTER_CSS_MAIN}"]`)) {
            const css1 = document.createElement('link');
            css1.rel = 'stylesheet';
            css1.href = this.PLUGIN_CLUSTER_CSS_MAIN;
            document.head.appendChild(css1);
        }
        if (!document.querySelector(`link[href="${this.PLUGIN_CLUSTER_CSS_THEME}"]`)) {
            const css2 = document.createElement('link');
            css2.rel = 'stylesheet';
            css2.href = this.PLUGIN_CLUSTER_CSS_THEME;
            document.head.appendChild(css2);
        }

        // JS
        return new Promise((resolve) => {
            const existing = document.querySelector(`script[src="${this.PLUGIN_CLUSTER_JS}"]`);
            if (existing) {
                existing.addEventListener('load', () => resolve());
                if (window.L && window.L.markerClusterGroup) resolve();
                return;
            }
            const s = document.createElement('script');
            s.src = this.PLUGIN_CLUSTER_JS;
            s.async = true;
            s.onload = () => resolve();
            s.onerror = () => {
                console.warn('⚠️ Impossibile caricare Leaflet.markercluster, fallback a marker semplici');
                resolve();
            };
            document.body.appendChild(s);
        });
    },

    // ───────────────────────────────────────────────────────────
    // ICONE
    // ───────────────────────────────────────────────────────────
    getColoreStato(statoApp) {
        switch (statoApp) {
            case 'ATTIVA':       return { bg: '#3CA434', border: '#2A752F' };
            case 'IN_SVILUPPO':  return { bg: '#0288D1', border: '#01579B' };
            case 'SOSPESA':      return { bg: '#FFCC00', border: '#E6B800' };
            case 'DISATTIVATA':  return { bg: '#D32F2F', border: '#B71C1C' };
            case 'DEMO':         return { bg: '#9C27B0', border: '#6A1B9A' };
            default:             return { bg: '#9B9B9B', border: '#4A4A4A' };
        }
    },

    getStatoLabel(statoApp) {
        switch (statoApp) {
            case 'ATTIVA':       return 'Attiva';
            case 'IN_SVILUPPO':  return 'In Sviluppo';
            case 'SOSPESA':      return 'Sospesa';
            case 'DISATTIVATA':  return 'Disattivata';
            case 'DEMO':         return 'Demo';
            default:             return 'N/D';
        }
    },

    getIconaStato(statoApp) {
        switch (statoApp) {
            case 'ATTIVA':       return 'fa-mobile-alt';
            case 'IN_SVILUPPO':  return 'fa-cog';
            case 'SOSPESA':      return 'fa-pause';
            case 'DISATTIVATA':  return 'fa-times';
            case 'DEMO':         return 'fa-flask';
            default:             return 'fa-question';
        }
    },

    isNuova(app) {
        const iso = app.dataCreazione || app.dataLancioApp || '';
        if (!iso) return false;
        const t = Date.parse(iso);
        if (isNaN(t)) return false;
        const giorni = (Date.now() - t) / (1000 * 60 * 60 * 24);
        return giorni >= 0 && giorni <= this.GIORNI_NUOVA_APP;
    },

    creaIconaMarker(app) {
        const colore = this.getColoreStato(app.statoApp);
        const iconClass = this.getIconaStato(app.statoApp);
        const nuovaClass = this.isNuova(app) ? 'mappa-marker-nuovo' : '';

        return L.divIcon({
            className: 'custom-marker',
            html: `<div class="${nuovaClass}" style="
                width: 20px; height: 20px;
                border-radius: 50%;
                background: ${colore.bg};
                border: 2px solid ${colore.border};
                box-shadow: 0 1px 4px rgba(0,0,0,0.3);
                cursor: pointer;
                display: flex; align-items: center; justify-content: center;
            "><i class="fas ${iconClass}" style="color: white; font-size: 9px;"></i></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
            popupAnchor: [0, -12]
        });
    },

    // ───────────────────────────────────────────────────────────
    // MAPPA
    // ───────────────────────────────────────────────────────────
    inizializzaMappa() {
        const container = document.getElementById('mappaContainer');
        container.innerHTML = '';

        this.map = L.map(container, {
            zoomControl: true,
            scrollWheelZoom: true,
            attributionControl: true
        }).setView([41.9, 12.5], 6);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 18
        }).addTo(this.map);

        setTimeout(() => { this.map.invalidateSize(); }, 200);
    },

    // ───────────────────────────────────────────────────────────
    // FILTRO APP (in memoria)
    // ───────────────────────────────────────────────────────────
    filtraApp() {
        const f = this.filtri;
        const search = (f.search || '').toLowerCase().trim();
        return this.apps.filter(a => {
            // Stato
            if (f.stato === 'SENZA_STATO') {
                if (a.statoApp && a.statoApp !== '') return false;
            } else if (f.stato && f.stato !== 'tutti') {
                if (a.statoApp !== f.stato) return false;
            }
            // Cliente
            if (f.cliente && f.cliente !== 'tutti') {
                if (a.clientePaganteId !== f.cliente) return false;
            }
            // Search
            if (search) {
                const haystack = (a.nome + ' ' + a.comune + ' ' + a.provincia + ' ' + a.regione + ' ' + a.clientePaganteRagioneSociale).toLowerCase();
                if (haystack.indexOf(search) === -1) return false;
            }
            return true;
        });
    },

    // ───────────────────────────────────────────────────────────
    // POSIZIONAMENTO MARKER
    // ───────────────────────────────────────────────────────────
    async posizionaMarkers(opzioni) {
        opzioni = opzioni || {};
        const forceGeo = !!opzioni.forceGeocode;

        // Rimuovi cluster/markers precedenti
        if (this.markerClusterGroup) {
            this.map.removeLayer(this.markerClusterGroup);
            this.markerClusterGroup = null;
        }
        this.markers.forEach(m => this.map.removeLayer(m));
        this.markers = [];
        this.markersById = {};

        // Crea il cluster group (se plugin disponibile)
        if (window.L && L.markerClusterGroup) {
            this.markerClusterGroup = L.markerClusterGroup({
                showCoverageOnHover: false,
                spiderfyOnMaxZoom: true,
                disableClusteringAtZoom: 12,
                maxClusterRadius: 45
            });
        }

        const appFiltrate = this.filtraApp();
        this.appsFiltrate = appFiltrate;

        // Conta quante app devono essere geocodificate
        const daGeocodificare = appFiltrate.filter(a => !a.lat || !a.lng);
        const totDaGeo = daGeocodificare.length;
        let geoProcessati = 0;

        const progressDiv = document.getElementById('geocodingProgress');
        if (totDaGeo > 0 && progressDiv) {
            progressDiv.classList.remove('hidden');
            document.getElementById('geocodingBar').style.width = '0%';
            document.getElementById('geocodingBar').style.background = 'var(--blu-700)';
            document.getElementById('geocodingText').textContent =
                forceGeo
                    ? `Ritento la geolocalizzazione di ${totDaGeo} app...`
                    : `Geolocalizzazione ${totDaGeo} app in corso... (solo la prima volta)`;
        }

        let posizionati = 0;
        let nonPosizionati = 0;
        const nonTrovate = [];

        for (const app of appFiltrate) {
            let coords = null;

            if (app.lat && app.lng) {
                coords = { lat: app.lat, lng: app.lng };
            } else {
                coords = await this.geocodificaESalva(app);

                geoProcessati++;
                if (progressDiv && totDaGeo > 0) {
                    const perc = Math.round((geoProcessati / totDaGeo) * 100);
                    document.getElementById('geocodingBar').style.width = perc + '%';
                    document.getElementById('geocodingPercent').textContent = perc + '%';
                    document.getElementById('geocodingText').textContent =
                        `Geolocalizzazione: ${geoProcessati}/${totDaGeo} — ${app.comune || app.nome}`;
                }
            }

            if (coords) {
                const marker = L.marker([coords.lat, coords.lng], {
                    icon: this.creaIconaMarker(app)
                });

                marker.bindPopup(this.buildPopupHtml(app), { maxWidth: 320 });
                marker.appId = app.id;
                marker.on('popupopen', () => {
                    this.aggiornaUrlConApp(app.id);
                });

                if (this.markerClusterGroup) {
                    this.markerClusterGroup.addLayer(marker);
                } else {
                    marker.addTo(this.map);
                }
                this.markers.push(marker);
                this.markersById[app.id] = marker;
                posizionati++;
            } else {
                nonPosizionati++;
                nonTrovate.push({ id: app.id, label: app.nome + (app.comune ? ` (${app.comune})` : '') });
            }
        }

        if (this.markerClusterGroup) {
            this.map.addLayer(this.markerClusterGroup);
        }

        if (progressDiv) {
            if (totDaGeo > 0) {
                document.getElementById('geocodingText').textContent =
                    `✅ Geolocalizzazione completata.`;
                document.getElementById('geocodingBar').style.width = '100%';
                document.getElementById('geocodingBar').style.background = 'var(--verde-700)';
                setTimeout(() => { progressDiv.classList.add('hidden'); }, 2500);
            } else {
                progressDiv.classList.add('hidden');
            }
        }

        // Aggiorna contatore in alto
        const contatore = document.getElementById('mappaContatore');
        if (contatore) {
            contatore.innerHTML = `<i class="fas fa-mobile-alt"></i> ${posizionati} su mappa`;
            if (nonPosizionati > 0) {
                this._appSenzaPosizione = nonTrovate;
                contatore.innerHTML += ` <span onclick="MappaClienti.mostraAppSenzaPosizione()" style="opacity: 0.85; cursor: pointer; text-decoration: underline; text-decoration-style: dotted;">(${nonPosizionati} senza posizione <i class="fas fa-info-circle"></i>)</span>`;
            } else {
                this._appSenzaPosizione = [];
            }
        }

        // Zoom per contenere tutti i markers
        if (this.markers.length > 0) {
            const group = L.featureGroup(this.markers);
            this.map.fitBounds(group.getBounds().pad(0.1));
        }

        console.log(`🗺️ App posizionate: ${posizionati}, non trovate: ${nonPosizionati}`);
    },

    buildPopupHtml(app) {
        const statoLabel = this.getStatoLabel(app.statoApp);
        const colore = this.getColoreStato(app.statoApp);
        const badgeNuova = this.isNuova(app)
            ? '<span class="mappa-badge-nuova">NUOVA</span>'
            : '';

        let dataCreazioneFmt = '';
        if (app.dataCreazione) {
            try {
                const d = new Date(app.dataCreazione);
                if (!isNaN(d.getTime())) {
                    dataCreazioneFmt = d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
                }
            } catch (e) { /* ignora */ }
        }

        return `
            <div style="font-family: 'Titillium Web', sans-serif; min-width: 220px;">
                <div style="font-weight: 700; font-size: 1.05rem; color: var(--blu-700); margin-bottom: 0.5rem;">
                    <i class="fas fa-mobile-alt"></i> ${app.nome}${badgeNuova}
                </div>
                <div style="font-size: 0.85rem; color: #4A4A4A; line-height: 1.7;">
                    <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; background: ${colore.bg}; color: white; font-size: 0.75rem; font-weight: 700;">
                        ${statoLabel}
                    </span>
                    <br>
                    ${app.comune ? `<i class="fas fa-landmark"></i> ${app.comune}` : ''}
                    ${app.provincia ? ` (${app.provincia})` : ''}
                    ${app.regione ? ` — ${app.regione}` : ''}
                    ${app.popolazione ? `<br><i class="fas fa-users"></i> ${app.popolazione.toLocaleString('it-IT')} abitanti` : ''}
                    ${app.clientePaganteRagioneSociale ? `<br><i class="fas fa-building"></i> ${app.clientePaganteRagioneSociale}` : ''}
                    ${app.referenteComune ? `<br><i class="fas fa-user"></i> ${app.referenteComune}` : ''}
                    ${app.telefonoReferente ? `<br><i class="fas fa-phone"></i> ${app.telefonoReferente}` : ''}
                    ${app.emailReferente ? `<br><i class="fas fa-envelope"></i> <a href="mailto:${app.emailReferente}" style="color: var(--blu-500);">${app.emailReferente}</a>` : ''}
                    ${dataCreazioneFmt ? `<br><i class="fas fa-calendar-plus"></i> Creata il ${dataCreazioneFmt}` : ''}
                </div>
                <div style="margin-top: 0.5rem; border-top: 1px solid #eee; padding-top: 0.5rem; display: flex; gap: 1rem; flex-wrap: wrap;">
                    <a href="javascript:void(0)" onclick="UI.showPage('dettaglio-app','${app.id}')"
                       style="color: var(--blu-700); font-weight: 700; font-size: 0.85rem; text-decoration: none;">
                        <i class="fas fa-external-link-alt"></i> Scheda App
                    </a>
                    ${app.urlApp ? `
                        <a href="${app.urlApp}" target="_blank"
                           style="color: var(--verde-700); font-weight: 700; font-size: 0.85rem; text-decoration: none;">
                            <i class="fas fa-globe"></i> Apri App
                        </a>
                    ` : ''}
                    <a href="javascript:void(0)" onclick="MappaClienti.copiaDeepLink('${app.id}')"
                       style="color: var(--grigio-700); font-weight: 700; font-size: 0.85rem; text-decoration: none;">
                        <i class="fas fa-link"></i> Copia link
                    </a>
                </div>
            </div>
        `;
    },

    // ───────────────────────────────────────────────────────────
    // GEOCODING + AUTO-INFER COMUNE
    // ───────────────────────────────────────────────────────────
    /**
     * Estrae il nome del comune dal campo "nome" quando il campo "comune" è vuoto.
     * Es: "Comune di Mezzolombardo" → "Mezzolombardo"
     *     "App Città di Trento" → "Trento"
     *     "Municipio di Roma Capitale" → "Roma Capitale"
     * Se non riesce a inferire ritorna stringa vuota.
     */
    inferisciComuneDaNome(app) {
        const nome = (app.nome || '').trim();
        if (!nome) return '';
        // Pattern principali, dal più al meno specifico
        const patterns = [
            /(?:^|\b)comune\s+di\s+(.+?)(?:\s*[-–—]|$)/i,
            /(?:^|\b)citt[àa']\s+di\s+(.+?)(?:\s*[-–—]|$)/i,
            /(?:^|\b)municipio\s+di\s+(.+?)(?:\s*[-–—]|$)/i,
            /(?:^|\b)app\s+(?:di\s+)?(.+?)(?:\s*[-–—]|$)/i
        ];
        for (const re of patterns) {
            const m = nome.match(re);
            if (m && m[1]) {
                let cand = m[1].trim()
                    .replace(/\s+/g, ' ')
                    .replace(/[,.;:]+$/g, '');
                // Scarta candidati troppo corti o troppo lunghi
                if (cand.length >= 2 && cand.length <= 60) return cand;
            }
        }
        return '';
    },

    async geocodificaESalva(app) {
        // Provo prima il campo comune; se vuoto inferisco dal nome
        let nomeComune = (app.comune || '')
            .replace(/^Comune di\s+/i, '')
            .replace(/^Citt[àa']\s+di\s+/i, '')
            .trim();

        let comuneInferito = false;
        if (!nomeComune) {
            const dedotto = this.inferisciComuneDaNome(app);
            if (dedotto) {
                nomeComune = dedotto;
                comuneInferito = true;
                console.log(`🧠 Comune inferito da "${app.nome}" → "${nomeComune}"`);
            }
        }

        if (!nomeComune) {
            return this.fallbackProvincia(app);
        }

        if (this.geocodeCache[nomeComune]) {
            const cached = this.geocodeCache[nomeComune];
            if (cached.source === 'nominatim') {
                this.salvaCoordinateSuFirestore(app.id, cached.lat, cached.lng, comuneInferito ? nomeComune : null);
            }
            return cached;
        }

        try {
            await this.attendiRateLimit();
            const query = encodeURIComponent(`${nomeComune}, Italia`);
            const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=it`;

            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'CRM-ComuneDigital/1.0 (mappa-app)'
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data && data.length > 0) {
                    const lat = parseFloat(data[0].lat);
                    const lng = parseFloat(data[0].lon);

                    console.log(`📍 Geocodificato: ${nomeComune} → ${lat}, ${lng}`);
                    this.geocodeCache[nomeComune] = { lat, lng, source: 'nominatim' };
                    this.salvaCoordinateSuFirestore(app.id, lat, lng, comuneInferito ? nomeComune : null);

                    app.lat = lat;
                    app.lng = lng;
                    if (comuneInferito) app.comune = nomeComune;
                    return { lat, lng };
                }
            }
            console.warn(`⚠️ Nominatim: nessun risultato per "${nomeComune}"`);
        } catch (error) {
            console.warn(`⚠️ Errore geocoding per "${nomeComune}":`, error.message);
        }

        return this.fallbackProvincia(app);
    },

    fallbackProvincia(app) {
        if (app.provincia && this.coordProvince[app.provincia]) {
            const coords = this.coordProvince[app.provincia];
            return {
                lat: coords.lat + (Math.random() - 0.5) * 0.08,
                lng: coords.lng + (Math.random() - 0.5) * 0.08,
                source: 'fallback'
            };
        }
        return null;
    },

    /**
     * Salva lat/lng. Se comuneInferito è valorizzato, salva anche il campo
     * `comune` su Firestore (popolato dall'inferenza dal nome).
     */
    async salvaCoordinateSuFirestore(appId, lat, lng, comuneInferito) {
        try {
            const payload = {
                lat: lat,
                lng: lng,
                geocodificatoIl: new Date().toISOString()
            };
            if (comuneInferito) {
                payload.comune = comuneInferito;
                payload.comuneInferitoDaNome = true;
            }
            await db.collection('app').doc(appId).update(payload);
            console.log(`💾 Coordinate salvate per app ${appId}` + (comuneInferito ? ` (comune inferito: ${comuneInferito})` : ''));
        } catch (error) {
            console.warn(`⚠️ Errore salvataggio coordinate per ${appId}:`, error.message);
        }
    },

    _lastNominatimCall: 0,
    async attendiRateLimit() {
        const now = Date.now();
        const elapsed = now - this._lastNominatimCall;
        if (elapsed < 1100) {
            await new Promise(r => setTimeout(r, 1100 - elapsed));
        }
        this._lastNominatimCall = Date.now();
    },

    /**
     * Ritenta la geocodifica per tutte le app senza posizione (chiamato dal popup).
     */
    async geocodificaSenzaPosizione() {
        // Resetta in memoria lat/lng delle app filtrate senza posizione
        const ids = (this._appSenzaPosizione || []).map(x => x.id);
        if (ids.length === 0) {
            UI.showSuccess('Nessuna app da rigeocodificare');
            return;
        }
        this.apps.forEach(a => {
            if (ids.indexOf(a.id) !== -1) {
                a.lat = null;
                a.lng = null;
            }
        });
        // Pulisce cache nominatim per dare un'altra chance
        this.geocodeCache = {};
        // Chiude modal se aperta
        if (typeof FormsManager !== 'undefined' && FormsManager.closeModal) {
            FormsManager.closeModal();
        }
        await this.posizionaMarkers({ forceGeocode: true });
        this.aggiornaListaPannello();
        this.aggiornaStats();
    },

    // ───────────────────────────────────────────────────────────
    // PANNELLO LATERALE
    // ───────────────────────────────────────────────────────────
    togglePannello() {
        const p = document.getElementById('mappaPannello');
        if (p) p.classList.toggle('aperto');
    },

    aggiornaListaPannello() {
        const lista = document.getElementById('mappaLista');
        const contatore = document.getElementById('mappaListaContatore');
        if (!lista) return;

        const apps = (this.appsFiltrate || []).slice().sort((a, b) => {
            // Prima le "nuove", poi alfabetico per nome
            const an = this.isNuova(a) ? 0 : 1;
            const bn = this.isNuova(b) ? 0 : 1;
            if (an !== bn) return an - bn;
            return (a.nome || '').localeCompare(b.nome || '');
        });

        if (contatore) {
            contatore.textContent = apps.length === 1
                ? '1 app trovata'
                : `${apps.length} app trovate`;
        }

        if (apps.length === 0) {
            lista.innerHTML = `<div style="padding: 1rem; color: var(--grigio-500); font-size: 0.85rem; text-align: center;">
                Nessuna app corrisponde ai filtri.
            </div>`;
            return;
        }

        lista.innerHTML = apps.map(a => {
            const col = this.getColoreStato(a.statoApp);
            const nuova = this.isNuova(a) ? '<span class="mappa-badge-nuova">NUOVA</span>' : '';
            const noPos = (!a.lat || !a.lng) ? ' <i class="fas fa-map-marker-alt" title="Senza posizione" style="color: var(--rosso-errore, #D32F2F);"></i>' : '';
            return `
                <div class="mappa-lista-riga" onclick="MappaClienti.selezionaApp('${a.id}')">
                    <div style="display: flex; align-items: center; gap: 0.4rem;">
                        <span style="width: 10px; height: 10px; border-radius: 50%; background: ${col.bg}; border: 1px solid ${col.border}; flex-shrink: 0;"></span>
                        <span style="font-weight: 600; color: var(--grigio-900, #1f2937); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${a.nome}
                        </span>
                        ${nuova}${noPos}
                    </div>
                    <div class="mappa-lista-comune">
                        ${a.comune || '— senza comune —'}${a.provincia ? ` (${a.provincia})` : ''}
                    </div>
                </div>
            `;
        }).join('');
    },

    selezionaApp(appId) {
        const marker = this.markersById[appId];
        if (!marker) {
            // Magari l'app è "senza posizione" — apri la scheda
            UI.showPage('dettaglio-app', appId);
            return;
        }

        const apriPopupConPulse = () => {
            try { marker.openPopup(); } catch (e) { /* ignora */ }
            // Pulse highlight
            const el = marker.getElement();
            if (el) {
                const inner = el.firstElementChild;
                if (inner) {
                    inner.classList.remove('mappa-marker-highlight');
                    void inner.offsetWidth; // restart animation
                    inner.classList.add('mappa-marker-highlight');
                }
            }
        };

        // Se il marker è dentro un cluster, espandilo prima
        if (this.markerClusterGroup && this.markerClusterGroup.hasLayer(marker)) {
            this.markerClusterGroup.zoomToShowLayer(marker, apriPopupConPulse);
        } else {
            const ll = marker.getLatLng();
            this.map.setView(ll, Math.max(this.map.getZoom(), 13), { animate: true });
            setTimeout(apriPopupConPulse, 300);
        }

        // Su mobile chiudi il pannello
        if (window.innerWidth <= 768) {
            const p = document.getElementById('mappaPannello');
            if (p) p.classList.remove('aperto');
        }

        // Aggiorna riga "attiva"
        const righe = document.querySelectorAll('#mappaLista .mappa-lista-riga');
        righe.forEach(r => r.classList.remove('attiva'));
        const idx = (this.appsFiltrate || []).slice().sort((a, b) => {
            const an = this.isNuova(a) ? 0 : 1;
            const bn = this.isNuova(b) ? 0 : 1;
            if (an !== bn) return an - bn;
            return (a.nome || '').localeCompare(b.nome || '');
        }).findIndex(a => a.id === appId);
        if (idx >= 0 && righe[idx]) righe[idx].classList.add('attiva');

        this.aggiornaUrlConApp(appId);
    },

    // ───────────────────────────────────────────────────────────
    // DEEP LINK ?app=<id>
    // ───────────────────────────────────────────────────────────
    aggiornaUrlConApp(appId) {
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('app', appId);
            window.history.replaceState({}, '', url.toString());
        } catch (e) { /* ignora */ }
    },

    gestisciDeepLink() {
        try {
            const params = new URLSearchParams(window.location.search);
            const appId = params.get('app');
            if (appId && this.markersById[appId]) {
                setTimeout(() => this.selezionaApp(appId), 500);
            }
        } catch (e) { /* ignora */ }
    },

    copiaDeepLink(appId) {
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('app', appId);
            const text = url.toString();
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(() => {
                    UI.showSuccess('Link copiato negli appunti');
                });
            } else {
                // Fallback
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                UI.showSuccess('Link copiato negli appunti');
            }
        } catch (e) {
            UI.showError('Impossibile copiare il link');
        }
    },

    // ───────────────────────────────────────────────────────────
    // STATS BAR
    // ───────────────────────────────────────────────────────────
    aggiornaStats() {
        const statsBar = document.getElementById('mappaStats');
        if (!statsBar) return;

        const totale = this.apps.length;
        const attive = this.apps.filter(a => a.statoApp === 'ATTIVA').length;
        const inSviluppo = this.apps.filter(a => a.statoApp === 'IN_SVILUPPO').length;
        const sospese = this.apps.filter(a => a.statoApp === 'SOSPESA').length;
        const disattivate = this.apps.filter(a => a.statoApp === 'DISATTIVATA').length;
        const demo = this.apps.filter(a => a.statoApp === 'DEMO').length;
        const senzaStato = this.apps.filter(a => !a.statoApp || a.statoApp === '').length;
        const nuove = this.apps.filter(a => this.isNuova(a)).length;

        const regioni = new Set(this.apps.map(a => a.regione).filter(Boolean));
        const province = new Set(this.apps.map(a => a.provincia).filter(Boolean));

        // Cittadini serviti: somma popolazione delle app ATTIVE
        const cittadini = this.apps
            .filter(a => a.statoApp === 'ATTIVA' && a.popolazione)
            .reduce((s, a) => s + a.popolazione, 0);

        const cittadiniFmt = cittadini > 0
            ? cittadini.toLocaleString('it-IT')
            : null;

        statsBar.innerHTML = `
            <span><i class="fas fa-mobile-alt"></i> <strong>${totale}</strong> App totali</span>
            <span style="color: #A4E89A;"><i class="fas fa-check-circle"></i> <strong>${attive}</strong> Attive</span>
            <span style="color: #81D4FA;"><i class="fas fa-code"></i> <strong>${inSviluppo}</strong> In Sviluppo</span>
            <span style="color: #FFCC00;"><i class="fas fa-pause-circle"></i> <strong>${sospese}</strong> Sospese</span>
            <span style="color: #EF9A9A;"><i class="fas fa-times-circle"></i> <strong>${disattivate}</strong> Disattivate</span>
            <span style="color: #CE93D8;"><i class="fas fa-flask"></i> <strong>${demo}</strong> Demo</span>
            ${senzaStato > 0 ? `<span style="color: #CCCCCC;"><i class="fas fa-question-circle"></i> <strong>${senzaStato}</strong> Senza stato</span>` : ''}
            ${nuove > 0 ? `<span style="color: #A4E89A;"><i class="fas fa-sparkles"></i> <strong>${nuove}</strong> Nuove (${this.GIORNI_NUOVA_APP}gg)</span>` : ''}
            <span><i class="fas fa-map"></i> <strong>${regioni.size}</strong> Regioni</span>
            <span><i class="fas fa-map-pin"></i> <strong>${province.size}</strong> Province</span>
            ${cittadiniFmt ? `<span style="color: #FFE082;"><i class="fas fa-users"></i> <strong>${cittadiniFmt}</strong> Cittadini serviti</span>` : ''}
        `;
        statsBar.classList.remove('hidden');
        statsBar.style.display = 'flex';
    },

    // ───────────────────────────────────────────────────────────
    // MODAL "APP SENZA POSIZIONE"
    // ───────────────────────────────────────────────────────────
    mostraAppSenzaPosizione() {
        const lista = this._appSenzaPosizione || [];
        if (lista.length === 0) return;

        const content = `
            <div style="padding: 0.5rem 0;">
                <p style="color: var(--grigio-700); font-size: 0.875rem; margin: 0 0 0.75rem;">
                    Queste app non sono state geolocalizzate. Verifica che il campo <strong>Comune</strong> sia compilato nella scheda dell'app,
                    oppure clicca il pulsante qui sotto per ritentare la geocodifica (può richiedere fino a 1 secondo per app).
                </p>
                <div style="margin: 0.75rem 0;">
                    <button onclick="MappaClienti.geocodificaSenzaPosizione()"
                        style="padding: 0.6rem 1rem; background: var(--blu-700); color: white; border: none; border-radius: 8px; cursor: pointer; font-family: 'Titillium Web'; font-weight: 700; font-size: 0.9rem;">
                        <i class="fas fa-search-location"></i> Geocodifica ora le ${lista.length} app
                    </button>
                </div>
                <div style="max-height: 300px; overflow-y: auto;">
                    ${lista.map((item, i) => `
                        <div style="display: flex; align-items: center; gap: 10px; padding: 0.625rem 0.75rem; border-radius: 8px; cursor: pointer; ${i % 2 === 0 ? 'background: var(--grigio-100);' : ''}"
                             onclick="UI.showPage('dettaglio-app','${item.id}')">
                            <i class="fas fa-map-marker-alt" style="color: var(--rosso-errore); width: 16px; text-align: center;"></i>
                            <span style="font-size: 0.9375rem; color: var(--grigio-900);">${item.label}</span>
                            <i class="fas fa-external-link-alt" style="margin-left: auto; color: var(--blu-500); font-size: 0.8rem;"></i>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        FormsManager.showModal(
            `<i class="fas fa-exclamation-triangle" style="color: var(--giallo-avviso);"></i> ${lista.length} app senza posizione`,
            content
        );
    },

    // ───────────────────────────────────────────────────────────
    // 📍 COORDINATE PROVINCE ITALIANE (fallback)
    // ───────────────────────────────────────────────────────────
    coordProvince: {
        // Piemonte
        'TO': { lat: 45.0703, lng: 7.6869 }, 'VC': { lat: 45.3257, lng: 8.4189 },
        'NO': { lat: 45.4515, lng: 8.6217 }, 'CN': { lat: 44.3842, lng: 7.5424 },
        'AT': { lat: 44.9004, lng: 8.2067 }, 'AL': { lat: 44.9122, lng: 8.6154 },
        'BI': { lat: 45.5628, lng: 8.0581 }, 'VB': { lat: 45.9219, lng: 8.5519 },
        // Valle d'Aosta
        'AO': { lat: 45.7372, lng: 7.3209 },
        // Lombardia
        'VA': { lat: 45.8206, lng: 8.8257 }, 'CO': { lat: 45.8080, lng: 9.0852 },
        'SO': { lat: 46.1699, lng: 9.8782 }, 'MI': { lat: 45.4642, lng: 9.1900 },
        'BG': { lat: 45.6983, lng: 9.6773 }, 'BS': { lat: 45.5416, lng: 10.2118 },
        'PV': { lat: 45.1847, lng: 9.1582 }, 'CR': { lat: 45.1364, lng: 10.0227 },
        'MN': { lat: 45.1564, lng: 10.7914 }, 'LC': { lat: 45.8566, lng: 9.3976 },
        'LO': { lat: 45.3097, lng: 9.5015 }, 'MB': { lat: 45.5845, lng: 9.2744 },
        // Trentino-Alto Adige
        'BZ': { lat: 46.4983, lng: 11.3548 }, 'TN': { lat: 46.0748, lng: 11.1217 },
        // Veneto
        'VR': { lat: 45.4384, lng: 10.9916 }, 'VI': { lat: 45.5455, lng: 11.5354 },
        'BL': { lat: 46.1427, lng: 12.2162 }, 'TV': { lat: 45.6669, lng: 12.2430 },
        'VE': { lat: 45.4408, lng: 12.3155 }, 'PD': { lat: 45.4064, lng: 11.8768 },
        'RO': { lat: 45.0711, lng: 11.7901 },
        // Friuli Venezia Giulia
        'UD': { lat: 46.0711, lng: 13.2346 }, 'GO': { lat: 45.9415, lng: 13.6219 },
        'TS': { lat: 45.6495, lng: 13.7768 }, 'PN': { lat: 45.9564, lng: 12.6565 },
        // Liguria
        'IM': { lat: 43.8868, lng: 8.0265 }, 'SV': { lat: 44.3069, lng: 8.4806 },
        'GE': { lat: 44.4056, lng: 8.9463 }, 'SP': { lat: 44.1025, lng: 9.8241 },
        // Emilia-Romagna
        'PC': { lat: 45.0526, lng: 9.6930 }, 'PR': { lat: 44.8015, lng: 10.3279 },
        'RE': { lat: 44.6973, lng: 10.6297 }, 'MO': { lat: 44.6471, lng: 10.9252 },
        'BO': { lat: 44.4949, lng: 11.3426 }, 'FE': { lat: 44.8381, lng: 11.6198 },
        'RA': { lat: 44.4184, lng: 12.2035 }, 'FC': { lat: 44.2225, lng: 12.0408 },
        'RN': { lat: 44.0594, lng: 12.5683 },
        // Toscana
        'MS': { lat: 44.0357, lng: 10.1396 }, 'LU': { lat: 43.8376, lng: 10.4951 },
        'PT': { lat: 43.9321, lng: 10.9132 }, 'FI': { lat: 43.7696, lng: 11.2558 },
        'LI': { lat: 43.5485, lng: 10.3106 }, 'PI': { lat: 43.7228, lng: 10.4017 },
        'AR': { lat: 43.4633, lng: 11.8817 }, 'SI': { lat: 43.3188, lng: 11.3308 },
        'GR': { lat: 42.7635, lng: 11.1126 }, 'PO': { lat: 43.8777, lng: 11.1023 },
        // Umbria
        'PG': { lat: 43.1107, lng: 12.3908 }, 'TR': { lat: 42.5636, lng: 12.6427 },
        // Marche
        'PU': { lat: 43.7205, lng: 12.6368 }, 'AN': { lat: 43.6158, lng: 13.5189 },
        'MC': { lat: 43.2984, lng: 13.4531 }, 'AP': { lat: 42.8543, lng: 13.5749 },
        'FM': { lat: 43.1602, lng: 13.7181 },
        // Lazio
        'VT': { lat: 42.4206, lng: 12.1075 }, 'RI': { lat: 42.4025, lng: 12.8568 },
        'RM': { lat: 41.9028, lng: 12.4964 }, 'LT': { lat: 41.4676, lng: 12.9035 },
        'FR': { lat: 41.6400, lng: 13.3490 },
        // Abruzzo
        'AQ': { lat: 42.3498, lng: 13.3995 }, 'TE': { lat: 42.6612, lng: 13.6987 },
        'PE': { lat: 42.4618, lng: 14.2141 }, 'CH': { lat: 42.3510, lng: 14.1689 },
        // Molise
        'CB': { lat: 41.5602, lng: 14.6685 }, 'IS': { lat: 41.5932, lng: 14.2331 },
        // Campania
        'CE': { lat: 41.0740, lng: 14.3339 }, 'BN': { lat: 41.1297, lng: 14.7822 },
        'NA': { lat: 40.8518, lng: 14.2681 }, 'AV': { lat: 40.9146, lng: 14.7906 },
        'SA': { lat: 40.6824, lng: 14.7681 },
        // Puglia
        'FG': { lat: 41.4622, lng: 15.5447 }, 'BA': { lat: 41.1171, lng: 16.8719 },
        'TA': { lat: 40.4764, lng: 17.2297 }, 'BR': { lat: 40.6327, lng: 17.9420 },
        'LE': { lat: 40.3516, lng: 18.1750 }, 'BT': { lat: 41.2269, lng: 16.2951 },
        // Basilicata
        'PZ': { lat: 40.6396, lng: 15.8056 }, 'MT': { lat: 40.6664, lng: 16.6043 },
        // Calabria
        'CS': { lat: 39.3068, lng: 16.2534 }, 'CZ': { lat: 38.9100, lng: 16.5879 },
        'KR': { lat: 39.0839, lng: 17.1275 }, 'VV': { lat: 38.6760, lng: 16.1003 },
        'RC': { lat: 38.1096, lng: 15.6435 },
        // Sicilia
        'TP': { lat: 38.0174, lng: 12.5148 }, 'PA': { lat: 38.1157, lng: 13.3615 },
        'ME': { lat: 38.1938, lng: 15.5540 }, 'AG': { lat: 37.3111, lng: 13.5766 },
        'CL': { lat: 37.4901, lng: 14.0625 }, 'EN': { lat: 37.5676, lng: 14.2795 },
        'CT': { lat: 37.5079, lng: 15.0830 }, 'RG': { lat: 36.9253, lng: 14.7250 },
        'SR': { lat: 37.0755, lng: 15.2866 },
        // Sardegna
        'SS': { lat: 40.7259, lng: 8.5590 }, 'NU': { lat: 40.3210, lng: 9.3311 },
        'CA': { lat: 39.2238, lng: 9.1217 }, 'OR': { lat: 39.9062, lng: 8.5886 },
        'SU': { lat: 39.5642, lng: 8.9455 }
    }
};

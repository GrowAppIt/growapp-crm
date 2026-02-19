/**
 * 🗺️ MAPPA APP COMUNI
 * Visualizza sulla mappa d'Italia le app realizzate per i comuni
 * Geolocalizza le app usando Nominatim (OpenStreetMap) e salva le coordinate su Firestore
 * Usa Leaflet.js (open source, gratuito)
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
    apps: [],
    geocodeCache: {},

    async render() {
        const mainContent = document.getElementById('mainContent');

        mainContent.innerHTML = `
            <div class="page-container" style="padding: 0; height: calc(100vh - var(--header-height)); display: flex; flex-direction: column;">
                <!-- Header della pagina -->
                <div style="padding: 1rem 1.5rem; background: white; border-bottom: 1px solid var(--grigio-300); flex-shrink: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
                        <div>
                            <h1 style="font-size: 1.5rem; font-weight: 900; color: var(--blu-700); margin: 0;">
                                <i class="fas fa-map-marked-alt"></i> Mappa App
                            </h1>
                            <p style="font-size: 0.875rem; color: var(--grigio-500); margin: 0.25rem 0 0;">
                                Copertura territoriale delle app realizzate
                            </p>
                        </div>
                        <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                            <!-- Filtro per stato app -->
                            <select id="mappaFiltroStato" onchange="MappaClienti.applicaFiltro()"
                                style="padding: 0.5rem 1rem; border: 1px solid var(--grigio-300); border-radius: 8px; font-family: 'Titillium Web'; font-size: 0.875rem; background: white; cursor: pointer;">
                                <option value="tutti">Tutti gli stati</option>
                                <option value="ATTIVA">Solo Attive</option>
                                <option value="IN_SVILUPPO">In Sviluppo</option>
                                <option value="SOSPESA">Sospese</option>
                                <option value="DISATTIVATA">Disattivate</option>
                                <option value="DEMO">Demo</option>
                                <option value="SENZA_STATO">Senza stato</option>
                            </select>
                            <!-- Contatore -->
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

                <!-- Mappa -->
                <div id="mappaContainer" style="flex: 1; min-height: 300px; position: relative; z-index: 1;">
                    <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--grigio-500);">
                        <div style="text-align: center;">
                            <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                            <p>Caricamento mappa...</p>
                        </div>
                    </div>
                </div>

                <!-- Stats bar in fondo -->
                <div id="mappaStats" class="hidden" style="padding: 0.75rem 1.5rem; background: var(--blu-900); color: white; display: flex; justify-content: space-around; flex-wrap: wrap; gap: 0.5rem; flex-shrink: 0; font-size: 0.8rem;">
                </div>
            </div>
        `;

        // Carica dati e inizializza mappa
        await this.caricaDati();
        this.inizializzaMappa();
        await this.posizionaMarkers();
        this.aggiornaStats();
    },

    /**
     * Carica tutte le app dalla collection Firestore
     */
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
                    dataCreazione: data.dataCreazione || '',
                    // Coordinate salvate (se già geocodificate)
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

    /**
     * Colore marker in base allo stato dell'app
     */
    getColoreStato(statoApp) {
        switch (statoApp) {
            case 'ATTIVA': return { bg: '#3CA434', border: '#2A752F' };
            case 'IN_SVILUPPO': return { bg: '#0288D1', border: '#01579B' };
            case 'SOSPESA': return { bg: '#FFCC00', border: '#E6B800' };
            case 'DISATTIVATA': return { bg: '#D32F2F', border: '#B71C1C' };
            case 'DEMO': return { bg: '#9C27B0', border: '#6A1B9A' };
            default: return { bg: '#9B9B9B', border: '#4A4A4A' };
        }
    },

    /**
     * Etichetta stato leggibile
     */
    getStatoLabel(statoApp) {
        switch (statoApp) {
            case 'ATTIVA': return 'Attiva';
            case 'IN_SVILUPPO': return 'In Sviluppo';
            case 'SOSPESA': return 'Sospesa';
            case 'DISATTIVATA': return 'Disattivata';
            case 'DEMO': return 'Demo';
            default: return 'N/D';
        }
    },

    /**
     * Crea un'icona marker personalizzata con colore stato
     */
    creaIconaMarker(statoApp) {
        const colore = this.getColoreStato(statoApp);
        return L.divIcon({
            className: 'custom-marker',
            html: `<div style="
                width: 18px; height: 18px;
                border-radius: 50%;
                background: ${colore.bg};
                border: 2px solid ${colore.border};
                box-shadow: 0 1px 4px rgba(0,0,0,0.3);
                cursor: pointer;
                display: flex; align-items: center; justify-content: center;
            "><i class="fas fa-mobile-alt" style="color: white; font-size: 8px;"></i></div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
            popupAnchor: [0, -10]
        });
    },

    /**
     * Inizializza la mappa Leaflet centrata sull'Italia
     */
    inizializzaMappa() {
        const container = document.getElementById('mappaContainer');
        container.innerHTML = '';

        this.map = L.map(container, {
            zoomControl: true,
            scrollWheelZoom: true,
            attributionControl: true
        }).setView([41.9, 12.5], 6); // Centro Italia

        // Tiles OpenStreetMap (gratuiti, nessuna API key)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 18
        }).addTo(this.map);

        // Fix: la mappa si ridimensiona correttamente
        setTimeout(() => {
            this.map.invalidateSize();
        }, 200);
    },

    /**
     * Posiziona i markers sulla mappa
     * Strategia di geolocalizzazione:
     * 1. Usa coordinate già salvate su Firestore (lat/lng nel documento app)
     * 2. Se non ci sono, geocodifica con Nominatim (OpenStreetMap) e SALVA su Firestore
     * 3. Fallback: coordinate provincia dal dizionario locale
     */
    async posizionaMarkers() {
        // Pulisci markers precedenti
        this.markers.forEach(m => this.map.removeLayer(m));
        this.markers = [];

        const filtro = document.getElementById('mappaFiltroStato')?.value || 'tutti';
        let appFiltrate = this.apps;

        if (filtro === 'SENZA_STATO') {
            appFiltrate = this.apps.filter(a => !a.statoApp || a.statoApp === '');
        } else if (filtro !== 'tutti') {
            appFiltrate = this.apps.filter(a => a.statoApp === filtro);
        }

        // Conta quante app devono essere geocodificate
        const daGeocodificare = appFiltrate.filter(a => !a.lat || !a.lng);
        const totDaGeo = daGeocodificare.length;
        let geoProcessati = 0;

        // Mostra barra di progresso se ci sono app da geocodificare
        const progressDiv = document.getElementById('geocodingProgress');
        if (totDaGeo > 0 && progressDiv) {
            progressDiv.classList.remove('hidden');
            document.getElementById('geocodingText').textContent =
                `Geolocalizzazione ${totDaGeo} app in corso... (solo la prima volta)`;
        }

        let posizionati = 0;
        let nonPosizionati = 0;
        const nonTrovate = [];

        for (const app of appFiltrate) {
            let coords = null;

            // 1. Coordinate già salvate su Firestore?
            if (app.lat && app.lng) {
                coords = { lat: app.lat, lng: app.lng };
            } else {
                // 2. Geocodifica con Nominatim e salva
                coords = await this.geocodificaESalva(app);

                // Aggiorna progresso
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
                    icon: this.creaIconaMarker(app.statoApp)
                });

                // Popup con info app
                const statoLabel = this.getStatoLabel(app.statoApp);
                const colore = this.getColoreStato(app.statoApp);

                marker.bindPopup(`
                    <div style="font-family: 'Titillium Web', sans-serif; min-width: 220px;">
                        <div style="font-weight: 700; font-size: 1.05rem; color: var(--blu-700); margin-bottom: 0.5rem;">
                            <i class="fas fa-mobile-alt"></i> ${app.nome}
                        </div>
                        <div style="font-size: 0.85rem; color: #4A4A4A; line-height: 1.7;">
                            <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; background: ${colore.bg}; color: white; font-size: 0.75rem; font-weight: 700;">
                                ${statoLabel}
                            </span>
                            <br>
                            ${app.comune ? `<i class="fas fa-landmark"></i> ${app.comune}` : ''}
                            ${app.provincia ? ` (${app.provincia})` : ''}
                            ${app.regione ? ` — ${app.regione}` : ''}
                            ${app.clientePaganteRagioneSociale ? `<br><i class="fas fa-building"></i> ${app.clientePaganteRagioneSociale}` : ''}
                            ${app.referenteComune ? `<br><i class="fas fa-user"></i> ${app.referenteComune}` : ''}
                            ${app.telefonoReferente ? `<br><i class="fas fa-phone"></i> ${app.telefonoReferente}` : ''}
                            ${app.emailReferente ? `<br><i class="fas fa-envelope"></i> <a href="mailto:${app.emailReferente}" style="color: var(--blu-500);">${app.emailReferente}</a>` : ''}
                        </div>
                        <div style="margin-top: 0.5rem; border-top: 1px solid #eee; padding-top: 0.5rem; display: flex; gap: 1rem;">
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
                        </div>
                    </div>
                `, { maxWidth: 320 });

                marker.addTo(this.map);
                this.markers.push(marker);
                posizionati++;
            } else {
                nonPosizionati++;
                nonTrovate.push(app.nome + (app.comune ? ` (${app.comune})` : ''));
            }
        }

        // Nascondi barra progresso
        if (progressDiv) {
            if (totDaGeo > 0) {
                document.getElementById('geocodingText').textContent =
                    `✅ Geolocalizzazione completata! Coordinate salvate su Firestore.`;
                document.getElementById('geocodingBar').style.width = '100%';
                document.getElementById('geocodingBar').style.background = 'var(--verde-700)';
                // Nascondi dopo 3 secondi
                setTimeout(() => { progressDiv.classList.add('hidden'); }, 3000);
            } else {
                progressDiv.classList.add('hidden');
            }
        }

        // Aggiorna contatore
        const contatore = document.getElementById('mappaContatore');
        if (contatore) {
            contatore.innerHTML = `<i class="fas fa-mobile-alt"></i> ${posizionati} su mappa`;
            if (nonPosizionati > 0) {
                contatore.innerHTML += ` <span style="opacity: 0.7; cursor: help;" title="App non geolocalizzate:\n${nonTrovate.join('\n')}">(${nonPosizionati} senza posizione)</span>`;
            }
        }

        // Zoom per contenere tutti i markers
        if (this.markers.length > 0) {
            const group = L.featureGroup(this.markers);
            this.map.fitBounds(group.getBounds().pad(0.1));
        }

        console.log(`🗺️ App posizionate: ${posizionati}, non trovate: ${nonPosizionati}`);
        if (nonTrovate.length > 0) {
            console.log('🗺️ App non geolocalizzate:', nonTrovate);
        }
    },

    /**
     * 🌍 GEOCODIFICA CON NOMINATIM + SALVATAGGIO SU FIRESTORE
     * Cerca le coordinate reali del comune usando OpenStreetMap Nominatim (gratuito)
     * e le salva nel documento app su Firestore per non doverle cercare più
     *
     * Rispetta il rate limit di Nominatim: max 1 richiesta/secondo
     */
    async geocodificaESalva(app) {
        const nomeComune = (app.comune || '')
            .replace(/^Comune di\s+/i, '')
            .replace(/^Città di\s+/i, '')
            .trim();

        if (!nomeComune) {
            // Senza nome comune, fallback sulla provincia
            return this.fallbackProvincia(app);
        }

        // Cache locale per non chiamare due volte lo stesso comune
        if (this.geocodeCache[nomeComune]) {
            const cached = this.geocodeCache[nomeComune];
            // Salva anche su Firestore se non è un fallback
            if (cached.source === 'nominatim') {
                this.salvaCoordinateSuFirestore(app.id, cached.lat, cached.lng);
            }
            return cached;
        }

        try {
            // Attendi 1.1 secondi tra le richieste (rate limit Nominatim)
            await this.attendiRateLimit();

            // Cerca su Nominatim: "NomeComune, Italia"
            const query = encodeURIComponent(`${nomeComune}, Italia`);
            const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=it`;

            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    // User-Agent richiesto da Nominatim
                    'User-Agent': 'CRM-ComuneDigital/1.0 (mappa-app)'
                }
            });

            if (response.ok) {
                const data = await response.json();

                if (data && data.length > 0) {
                    const lat = parseFloat(data[0].lat);
                    const lng = parseFloat(data[0].lon);

                    console.log(`📍 Geocodificato: ${nomeComune} → ${lat}, ${lng}`);

                    // Cache locale
                    this.geocodeCache[nomeComune] = { lat, lng, source: 'nominatim' };

                    // Salva su Firestore (non blocca)
                    this.salvaCoordinateSuFirestore(app.id, lat, lng);

                    // Aggiorna anche l'oggetto locale
                    app.lat = lat;
                    app.lng = lng;

                    return { lat, lng };
                }
            }

            console.warn(`⚠️ Nominatim: nessun risultato per "${nomeComune}"`);
        } catch (error) {
            console.warn(`⚠️ Errore geocoding per "${nomeComune}":`, error.message);
        }

        // Fallback: coordinate provincia
        return this.fallbackProvincia(app);
    },

    /**
     * Fallback: usa le coordinate del capoluogo di provincia
     */
    fallbackProvincia(app) {
        if (app.provincia && this.coordProvince[app.provincia]) {
            const coords = this.coordProvince[app.provincia];
            const result = {
                lat: coords.lat + (Math.random() - 0.5) * 0.08,
                lng: coords.lng + (Math.random() - 0.5) * 0.08,
                source: 'fallback'
            };
            return result;
        }
        return null;
    },

    /**
     * Salva le coordinate geocodificate nel documento app su Firestore
     * Così la prossima volta non serve più geocodificare
     */
    async salvaCoordinateSuFirestore(appId, lat, lng) {
        try {
            await db.collection('app').doc(appId).update({
                lat: lat,
                lng: lng,
                geocodificatoIl: new Date().toISOString()
            });
            console.log(`💾 Coordinate salvate per app ${appId}`);
        } catch (error) {
            console.warn(`⚠️ Errore salvataggio coordinate per ${appId}:`, error.message);
        }
    },

    /**
     * Rate limiter per Nominatim (max 1 richiesta/secondo)
     */
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
     * Applica filtro per stato
     */
    async applicaFiltro() {
        await this.posizionaMarkers();
        this.aggiornaStats();
    },

    /**
     * Aggiorna barra statistiche in fondo
     */
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

        // Regioni e province uniche
        const regioni = new Set(this.apps.map(a => a.regione).filter(Boolean));
        const province = new Set(this.apps.map(a => a.provincia).filter(Boolean));

        statsBar.innerHTML = `
            <span><i class="fas fa-mobile-alt"></i> <strong>${totale}</strong> App totali</span>
            <span style="color: #A4E89A;"><i class="fas fa-check-circle"></i> <strong>${attive}</strong> Attive</span>
            <span style="color: #81D4FA;"><i class="fas fa-code"></i> <strong>${inSviluppo}</strong> In Sviluppo</span>
            <span style="color: #FFCC00;"><i class="fas fa-pause-circle"></i> <strong>${sospese}</strong> Sospese</span>
            <span style="color: #EF9A9A;"><i class="fas fa-times-circle"></i> <strong>${disattivate}</strong> Disattivate</span>
            <span style="color: #CE93D8;"><i class="fas fa-flask"></i> <strong>${demo}</strong> Demo</span>
            ${senzaStato > 0 ? `<span style="color: #CCCCCC;"><i class="fas fa-question-circle"></i> <strong>${senzaStato}</strong> Senza stato</span>` : ''}
            <span><i class="fas fa-map"></i> <strong>${regioni.size}</strong> Regioni</span>
            <span><i class="fas fa-map-pin"></i> <strong>${province.size}</strong> Province</span>
        `;
        statsBar.classList.remove('hidden');
        statsBar.style.display = 'flex';
    },

    /**
     * 📍 Coordinate dei capoluoghi di provincia italiani (fallback)
     */
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

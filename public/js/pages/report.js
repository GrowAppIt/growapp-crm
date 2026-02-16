// Report & Analytics Avanzati
const Report = {
    charts: {},
    filtri: {
        anno: new Date().getFullYear(),
        tipoCliente: 'TUTTI', // TUTTI, DIRETTO, RIVENDITORE
        semestre: 'TUTTI', // TUTTI, S1, S2
        confrontoAnno: true // Abilita confronto con anno precedente
    },
    datiCache: null,

    async render() {
        UI.showLoading();

        try {
            // Carica tutti i dati necessari
            const [stats, fatture, clienti, app] = await Promise.all([
                DataService.getStatistiche(),
                DataService.getFatture({ limit: 5000 }),
                DataService.getClienti(),
                DataService.getApps()
            ]);

            // Cache dati per filtri
            this.datiCache = { stats, fatture, clienti, app };

            const mainContent = document.getElementById('mainContent');
            mainContent.innerHTML = `
                <!-- Header con Filtri -->
                <div class="page-header mb-3" style="background: linear-gradient(135deg, var(--blu-700) 0%, var(--blu-500) 100%); padding: 2rem; border-radius: 12px; color: white; box-shadow: 0 4px 20px rgba(20, 82, 132, 0.3);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1.5rem;">
                        <div>
                            <h1 style="font-size: 2.5rem; font-weight: 900; margin-bottom: 0.5rem; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                                <i class="fas fa-chart-line"></i> Analytics & Report
                            </h1>
                            <p style="font-size: 1.125rem; opacity: 0.95; margin: 0;">
                                Dashboard Avanzata con Confronti e Statistiche
                            </p>
                        </div>
                        <button class="btn" style="background: white; color: var(--blu-700); font-weight: 700; box-shadow: 0 4px 12px rgba(0,0,0,0.2);" onclick="ExportManager.exportReportCompleto()">
                            <i class="fas fa-file-excel"></i> Esporta Excel
                        </button>
                    </div>

                    <!-- Filtri Interattivi -->
                    ${this.renderFiltri()}
                </div>

                <!-- KPI Cards Animate -->
                ${this.renderKPICards()}

                <!-- Confronto Anno su Anno -->
                ${this.renderConfrontoAnnoSuAnno()}

                <!-- Grafici Principali -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(500px, 1fr)); gap: 1.5rem; margin-top: 1.5rem;">
                    ${this.renderFatturatoMensile()}
                    ${this.renderTipoClientiChart()}
                </div>

                <!-- Grafici Secondari -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 1.5rem; margin-top: 1.5rem;">
                    ${this.renderSemestraleChart()}
                    ${this.renderDistribuzioneGestione()}
                </div>

                <!-- Top Clienti -->
                ${this.renderTopClienti()}

                <!-- Statistiche Dettagliate -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 1.5rem; margin-top: 1.5rem;">
                    ${this.renderStatsApp()}
                    ${this.renderStatsContratti()}
                    ${this.renderStatsFatture()}
                </div>
            `;

            // Inizializza grafici con animazioni
            setTimeout(() => {
                this.initCharts();
                this.animateKPIs();
            }, 100);

            UI.hideLoading();
        } catch (error) {
            console.error('Errore rendering report:', error);
            UI.hideLoading();
            UI.showError('Errore nel caricamento dei report');
        }
    },

    renderFiltri() {
        const anniDisponibili = this.getAnniDisponibili();

        return `
            <div style="margin-top: 2rem; padding: 1.5rem; background: rgba(255,255,255,0.15); backdrop-filter: blur(10px); border-radius: 12px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                    <!-- Anno -->
                    <div>
                        <label style="display: block; font-size: 0.875rem; font-weight: 700; margin-bottom: 0.5rem; opacity: 0.95;">
                            <i class="fas fa-calendar"></i> Anno
                        </label>
                        <select id="filtroAnno" class="form-input" onchange="Report.applicaFiltri()" style="background: white; border: 2px solid rgba(255,255,255,0.3);">
                            ${anniDisponibili.map(anno => `
                                <option value="${anno}" ${anno === this.filtri.anno ? 'selected' : ''}>${anno}</option>
                            `).join('')}
                        </select>
                    </div>

                    <!-- Tipo Cliente -->
                    <div>
                        <label style="display: block; font-size: 0.875rem; font-weight: 700; margin-bottom: 0.5rem; opacity: 0.95;">
                            <i class="fas fa-user-tag"></i> Tipo Cliente
                        </label>
                        <select id="filtroTipoCliente" class="form-input" onchange="Report.applicaFiltri()" style="background: white; border: 2px solid rgba(255,255,255,0.3);">
                            <option value="TUTTI" ${this.filtri.tipoCliente === 'TUTTI' ? 'selected' : ''}>Tutti</option>
                            <option value="DIRETTO" ${this.filtri.tipoCliente === 'DIRETTO' ? 'selected' : ''}>Diretti Growapp</option>
                            <option value="RIVENDITORE" ${this.filtri.tipoCliente === 'RIVENDITORE' ? 'selected' : ''}>Tramite Rivenditore</option>
                        </select>
                    </div>

                    <!-- Semestre -->
                    <div>
                        <label style="display: block; font-size: 0.875rem; font-weight: 700; margin-bottom: 0.5rem; opacity: 0.95;">
                            <i class="fas fa-calendar-alt"></i> Periodo
                        </label>
                        <select id="filtroSemestre" class="form-input" onchange="Report.applicaFiltri()" style="background: white; border: 2px solid rgba(255,255,255,0.3);">
                            <option value="TUTTI" ${this.filtri.semestre === 'TUTTI' ? 'selected' : ''}>Anno Completo</option>
                            <option value="S1" ${this.filtri.semestre === 'S1' ? 'selected' : ''}>1° Semestre (Gen-Giu)</option>
                            <option value="S2" ${this.filtri.semestre === 'S2' ? 'selected' : ''}>2° Semestre (Lug-Dic)</option>
                        </select>
                    </div>

                    <!-- Confronto -->
                    <div style="display: flex; align-items: flex-end;">
                        <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; padding: 0.75rem 1rem; background: rgba(255,255,255,0.2); border-radius: 8px; transition: all 0.3s;">
                            <input type="checkbox" id="filtroConfronto" ${this.filtri.confrontoAnno ? 'checked' : ''} onchange="Report.applicaFiltri()" style="width: 20px; height: 20px; cursor: pointer;">
                            <span style="font-weight: 700; font-size: 0.875rem;">
                                <i class="fas fa-exchange-alt"></i> Confronta con ${this.filtri.anno - 1}
                            </span>
                        </label>
                    </div>
                </div>
            </div>
        `;
    },

    renderKPICards() {
        const dati = this.calcolaDatiFiltrati();
        const datiAnnoPrec = this.filtri.confrontoAnno ? this.calcolaDatiFiltrati(this.filtri.anno - 1) : null;

        const cards = [
            {
                icon: 'euro-sign',
                label: 'Fatturato',
                value: dati.fatturatoTotale,
                valuePrec: datiAnnoPrec?.fatturatoTotale,
                format: 'currency',
                color: '--verde-700',
                bgColor: '--verde-100'
            },
            {
                icon: 'file-invoice',
                label: 'Fatture Emesse',
                value: dati.numeroFatture,
                valuePrec: datiAnnoPrec?.numeroFatture,
                format: 'number',
                color: '--blu-700',
                bgColor: '--blu-100'
            },
            {
                icon: 'chart-line',
                label: 'Ticket Medio',
                value: dati.ticketMedio,
                valuePrec: datiAnnoPrec?.ticketMedio,
                format: 'currency',
                color: '--grigio-900',
                bgColor: '--grigio-100'
            },
            {
                icon: 'exclamation-circle',
                label: 'Da Incassare',
                value: dati.daIncassare,
                valuePrec: datiAnnoPrec?.daIncassare,
                format: 'currency',
                color: '--rosso',
                bgColor: 'rgba(211, 47, 47, 0.1)'
            }
        ];

        return `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin-top: 1.5rem;">
                ${cards.map((card, index) => this.renderAnimatedKPI(card, index)).join('')}
            </div>
        `;
    },

    renderAnimatedKPI(card, index) {
        const variazione = card.valuePrec ? ((card.value - card.valuePrec) / card.valuePrec * 100) : null;
        const isPositive = variazione > 0;
        const variazioneIcon = isPositive ? 'arrow-up' : variazione < 0 ? 'arrow-down' : 'minus';
        const variazioneColor = isPositive ? 'var(--verde-700)' : variazione < 0 ? 'var(--rosso)' : 'var(--grigio-500)';

        return `
            <div class="kpi-card-animated" style="
                background: linear-gradient(135deg, var(${card.bgColor}) 0%, white 100%);
                padding: 1.75rem;
                border-radius: 16px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.08);
                transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                animation: slideInUp 0.6s ease-out ${index * 0.1}s backwards;
                position: relative;
                overflow: hidden;
            " onmouseenter="this.style.transform='translateY(-8px) scale(1.02)'; this.style.boxShadow='0 16px 40px rgba(0,0,0,0.12)'" onmouseleave="this.style.transform=''; this.style.boxShadow=''">
                <!-- Icona Background -->
                <div style="position: absolute; top: -20px; right: -20px; font-size: 8rem; opacity: 0.05; color: var(${card.color});">
                    <i class="fas fa-${card.icon}"></i>
                </div>

                <!-- Header -->
                <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;">
                    <div style="width: 56px; height: 56px; background: var(${card.color}); border-radius: 16px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                        <i class="fas fa-${card.icon}" style="color: white; font-size: 1.75rem;"></i>
                    </div>
                    <div style="flex: 1;">
                        <div style="font-size: 0.875rem; font-weight: 600; color: var(--grigio-500); text-transform: uppercase; letter-spacing: 0.5px;">
                            ${card.label}
                        </div>
                    </div>
                </div>

                <!-- Valore -->
                <div class="kpi-value" data-value="${card.value}" data-format="${card.format}" style="
                    font-size: 2.25rem;
                    font-weight: 900;
                    color: var(${card.color});
                    margin-bottom: 0.75rem;
                    line-height: 1;
                ">0</div>

                <!-- Variazione -->
                ${variazione !== null ? `
                    <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; background: rgba(255,255,255,0.8); border-radius: 8px; width: fit-content;">
                        <i class="fas fa-${variazioneIcon}" style="color: ${variazioneColor}; font-size: 0.875rem;"></i>
                        <span style="font-weight: 700; color: ${variazioneColor}; font-size: 0.875rem;">
                            ${Math.abs(variazione).toFixed(1)}%
                        </span>
                        <span style="font-size: 0.75rem; color: var(--grigio-500);">
                            vs ${this.filtri.anno - 1}
                        </span>
                    </div>
                ` : ''}
            </div>
        `;
    },

    renderConfrontoAnnoSuAnno() {
        if (!this.filtri.confrontoAnno) return '';

        const datiAttuale = this.calcolaDatiFiltrati();
        const datiPrec = this.calcolaDatiFiltrati(this.filtri.anno - 1);

        const varFatturato = ((datiAttuale.fatturatoTotale - datiPrec.fatturatoTotale) / datiPrec.fatturatoTotale * 100).toFixed(1);
        const varFatture = ((datiAttuale.numeroFatture - datiPrec.numeroFatture) / datiPrec.numeroFatture * 100).toFixed(1);
        const varTicket = ((datiAttuale.ticketMedio - datiPrec.ticketMedio) / datiPrec.ticketMedio * 100).toFixed(1);

        return `
            <div class="card fade-in" style="margin-top: 1.5rem; background: linear-gradient(135deg, #f5f5f5 0%, white 100%); border: 2px solid var(--blu-100); overflow: hidden;">
                <div class="card-header" style="background: linear-gradient(135deg, var(--blu-700) 0%, var(--blu-500) 100%); color: white; padding: 1.5rem;">
                    <h2 style="margin: 0; font-size: 1.5rem; font-weight: 900;">
                        <i class="fas fa-exchange-alt"></i> Confronto ${this.filtri.anno} vs ${this.filtri.anno - 1}
                    </h2>
                </div>
                <div style="padding: 2rem;">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 2rem;">
                        ${this.renderConfrontoItem('Fatturato Totale', datiPrec.fatturatoTotale, datiAttuale.fatturatoTotale, varFatturato, 'currency')}
                        ${this.renderConfrontoItem('Numero Fatture', datiPrec.numeroFatture, datiAttuale.numeroFatture, varFatture, 'number')}
                        ${this.renderConfrontoItem('Ticket Medio', datiPrec.ticketMedio, datiAttuale.ticketMedio, varTicket, 'currency')}
                    </div>
                </div>
            </div>
        `;
    },

    renderConfrontoItem(label, valorePrecedente, valoreAttuale, variazione, format) {
        const isPositive = parseFloat(variazione) >= 0;
        const icon = isPositive ? 'arrow-up' : 'arrow-down';
        const color = isPositive ? 'var(--verde-700)' : 'var(--rosso)';
        const bgColor = isPositive ? 'var(--verde-100)' : 'rgba(211, 47, 47, 0.1)';

        const formatValue = (val) => {
            if (format === 'currency') return DataService.formatCurrency(val);
            return val.toLocaleString('it-IT');
        };

        return `
            <div style="position: relative;">
                <div style="font-size: 0.875rem; font-weight: 700; color: var(--grigio-500); margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 0.5px;">
                    ${label}
                </div>

                <!-- Anno Precedente -->
                <div style="margin-bottom: 1rem; padding: 1rem; background: var(--grigio-100); border-radius: 8px;">
                    <div style="font-size: 0.75rem; color: var(--grigio-500); margin-bottom: 0.25rem;">${this.filtri.anno - 1}</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: var(--grigio-700);">${formatValue(valorePrecedente)}</div>
                </div>

                <!-- Anno Attuale -->
                <div style="margin-bottom: 1rem; padding: 1rem; background: linear-gradient(135deg, var(--blu-100) 0%, white 100%); border-radius: 8px; border: 2px solid var(--blu-700);">
                    <div style="font-size: 0.75rem; color: var(--blu-700); margin-bottom: 0.25rem; font-weight: 700;">${this.filtri.anno}</div>
                    <div style="font-size: 1.75rem; font-weight: 900; color: var(--blu-700);">${formatValue(valoreAttuale)}</div>
                </div>

                <!-- Variazione -->
                <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.75rem; background: ${bgColor}; border-radius: 8px;">
                    <i class="fas fa-${icon}" style="color: ${color}; font-size: 1.25rem;"></i>
                    <span style="font-size: 1.5rem; font-weight: 900; color: ${color};">${isPositive ? '+' : ''}${variazione}%</span>
                </div>
            </div>
        `;
    },

    renderFatturatoMensile() {
        return `
            <div class="card fade-in" style="box-shadow: 0 8px 24px rgba(0,0,0,0.08);">
                <div class="card-header" style="background: linear-gradient(135deg, var(--blu-700) 0%, var(--blu-500) 100%); color: white;">
                    <h2 style="margin: 0; font-size: 1.25rem; font-weight: 700;">
                        <i class="fas fa-chart-bar"></i> Fatturato Mensile
                    </h2>
                </div>
                <div style="padding: 1.5rem;">
                    <canvas id="chartFatturatoMensile" style="max-height: 350px;"></canvas>
                </div>
            </div>
        `;
    },

    renderTipoClientiChart() {
        return `
            <div class="card fade-in" style="box-shadow: 0 8px 24px rgba(0,0,0,0.08);">
                <div class="card-header" style="background: linear-gradient(135deg, var(--verde-700) 0%, var(--verde-500) 100%); color: white;">
                    <h2 style="margin: 0; font-size: 1.25rem; font-weight: 700;">
                        <i class="fas fa-user-tag"></i> Diretto vs Rivenditore
                    </h2>
                </div>
                <div style="padding: 1.5rem;">
                    <canvas id="chartTipoClienti" style="max-height: 350px;"></canvas>
                </div>
            </div>
        `;
    },

    renderSemestraleChart() {
        return `
            <div class="card fade-in" style="box-shadow: 0 8px 24px rgba(0,0,0,0.08);">
                <div class="card-header" style="background: linear-gradient(135deg, var(--blu-500) 0%, var(--blu-300) 100%); color: white;">
                    <h2 style="margin: 0; font-size: 1.25rem; font-weight: 700;">
                        <i class="fas fa-calendar-check"></i> Confronto Semestrale
                    </h2>
                </div>
                <div style="padding: 1.5rem;">
                    <canvas id="chartSemestrale" style="max-height: 300px;"></canvas>
                </div>
            </div>
        `;
    },

    renderDistribuzioneGestione() {
        return `
            <div class="card fade-in" style="box-shadow: 0 8px 24px rgba(0,0,0,0.08);">
                <div class="card-header" style="background: linear-gradient(135deg, var(--grigio-900) 0%, var(--grigio-700) 100%); color: white;">
                    <h2 style="margin: 0; font-size: 1.25rem; font-weight: 700;">
                        <i class="fas fa-briefcase"></i> Per Gestione Commerciale
                    </h2>
                </div>
                <div style="padding: 1.5rem;">
                    <canvas id="chartGestione" style="max-height: 300px;"></canvas>
                </div>
            </div>
        `;
    },

    renderTopClienti() {
        const dati = this.calcolaDatiFiltrati();
        const topClienti = dati.topClienti.slice(0, 10);

        return `
            <div class="card fade-in" style="margin-top: 1.5rem; box-shadow: 0 8px 24px rgba(0,0,0,0.08);">
                <div class="card-header" style="background: linear-gradient(135deg, #FFD700 0%, #FFA000 100%); color: white;">
                    <h2 style="margin: 0; font-size: 1.5rem; font-weight: 900;">
                        <i class="fas fa-trophy"></i> Top 10 Clienti per Fatturato
                    </h2>
                </div>
                <div class="table-responsive">
                    <table class="table">
                        <thead style="background: var(--grigio-100);">
                            <tr>
                                <th style="width: 60px; text-align: center;">#</th>
                                <th>Cliente</th>
                                <th style="text-align: center;">Fatture</th>
                                <th style="text-align: center;">Tipo</th>
                                <th style="text-align: right;">Fatturato</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${topClienti.map((item, index) => {
                                const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
                                const medalColor = index < 3 ? medalColors[index] : 'transparent';
                                const badgeColor = item.tipo === 'DIRETTO' ? 'var(--verde-700)' : 'var(--blu-700)';

                                return `
                                    <tr style="cursor: pointer; transition: all 0.3s;" onclick="UI.showPage('dettaglio-cliente', '${item.clienteId}')" onmouseenter="this.style.background='var(--blu-100)'" onmouseleave="this.style.background=''">
                                        <td style="text-align: center; font-size: 1.5rem; color: ${medalColor}; font-weight: 900;">
                                            ${index < 3 ? '<i class="fas fa-medal"></i>' : (index + 1)}
                                        </td>
                                        <td>
                                            <div style="font-weight: 700; color: var(--blu-700); font-size: 1rem;">
                                                ${item.nomeCliente || 'Sconosciuto'}
                                            </div>
                                            <div style="font-size: 0.875rem; color: var(--grigio-500);">
                                                ${item.provincia || ''} ${item.gestione ? '• ' + item.gestione : ''}
                                            </div>
                                        </td>
                                        <td style="text-align: center; font-weight: 700; font-size: 1.125rem;">
                                            ${item.numeroFatture}
                                        </td>
                                        <td style="text-align: center;">
                                            <span style="padding: 0.25rem 0.75rem; background: ${badgeColor}; color: white; border-radius: 20px; font-size: 0.75rem; font-weight: 700;">
                                                ${item.tipo || 'N/D'}
                                            </span>
                                        </td>
                                        <td style="text-align: right; font-weight: 900; color: var(--verde-700); font-size: 1.25rem;">
                                            ${DataService.formatCurrency(item.fatturato)}
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    renderStatsApp() {
        const dati = this.calcolaDatiFiltrati();

        return `
            <div class="card fade-in" style="box-shadow: 0 8px 24px rgba(0,0,0,0.08);">
                <div class="card-header" style="background: linear-gradient(135deg, var(--blu-700) 0%, var(--blu-500) 100%); color: white;">
                    <h2 style="margin: 0; font-size: 1.125rem; font-weight: 700;">
                        <i class="fas fa-mobile-alt"></i> App Comuni
                    </h2>
                </div>
                <div style="padding: 1.5rem;">
                    ${this.renderStatItem('Totale App', dati.statsApp.totale, 'mobile-alt', '--blu-700')}
                    ${this.renderStatItem('App Attive', dati.statsApp.attive, 'check-circle', '--verde-700')}
                    ${this.renderStatItem('In Sviluppo', dati.statsApp.inSviluppo, 'code', '--giallo-avviso')}
                    ${this.renderStatItem('Demo/Prospect', dati.statsApp.demo, 'flask', '--grigio-500')}
                </div>
            </div>
        `;
    },

    renderStatsContratti() {
        const { stats } = this.datiCache;

        return `
            <div class="card fade-in" style="box-shadow: 0 8px 24px rgba(0,0,0,0.08);">
                <div class="card-header" style="background: linear-gradient(135deg, var(--verde-700) 0%, var(--verde-500) 100%); color: white;">
                    <h2 style="margin: 0; font-size: 1.125rem; font-weight: 700;">
                        <i class="fas fa-file-contract"></i> Contratti
                    </h2>
                </div>
                <div style="padding: 1.5rem;">
                    ${this.renderStatItem('Totale Contratti', stats.contratti?.totale || 0, 'file-contract', '--verde-700')}
                    ${this.renderStatItem('Attivi', stats.contratti?.attivi || 0, 'check-circle', '--verde-700')}
                    ${this.renderStatItem('In Scadenza', stats.contratti?.inScadenza || 0, 'exclamation-triangle', '--giallo-avviso')}
                    ${this.renderStatItem('Scaduti', stats.contratti?.scaduti || 0, 'times-circle', '--rosso')}
                </div>
            </div>
        `;
    },

    renderStatsFatture() {
        const { stats } = this.datiCache;
        const totale = stats.fatture?.totale || 0;
        const pagate = stats.fatture?.perStato?.PAGATA || 0;
        const nonPagate = stats.fatture?.perStato?.NON_PAGATA || 0;
        const noteCredito = stats.fatture?.perStato?.NOTA_CREDITO || 0;

        return `
            <div class="card fade-in" style="box-shadow: 0 8px 24px rgba(0,0,0,0.08);">
                <div class="card-header" style="background: linear-gradient(135deg, var(--grigio-900) 0%, var(--grigio-700) 100%); color: white;">
                    <h2 style="margin: 0; font-size: 1.125rem; font-weight: 700;">
                        <i class="fas fa-file-invoice"></i> Stato Fatture
                    </h2>
                </div>
                <div style="padding: 1.5rem;">
                    ${this.renderStatItem('Totale', totale, 'file-invoice', '--grigio-900')}
                    ${this.renderStatItem('Pagate', pagate, 'check-circle', '--verde-700')}
                    ${this.renderStatItem('Da Pagare', nonPagate, 'clock', '--giallo-avviso')}
                    ${this.renderStatItem('Note Credito', noteCredito, 'undo', '--rosso')}
                </div>
            </div>
        `;
    },

    renderStatItem(label, value, icon, color) {
        return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid var(--grigio-300);">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div style="width: 36px; height: 36px; background: var(${color}); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                        <i class="fas fa-${icon}" style="color: white; font-size: 1rem;"></i>
                    </div>
                    <span style="font-weight: 600; color: var(--grigio-700);">${label}</span>
                </div>
                <span style="font-size: 1.5rem; font-weight: 900; color: var(${color});">${value.toLocaleString('it-IT')}</span>
            </div>
        `;
    },

    // === CALCOLI DATI ===

    calcolaDatiFiltrati(annoOverride = null) {
        const { fatture, clienti, app } = this.datiCache;
        const anno = annoOverride || this.filtri.anno;

        // Filtra fatture per anno
        let fattureFiltrate = fatture.filter(f => {
            const dataFattura = new Date(f.dataEmissione);
            return dataFattura.getFullYear() === anno;
        });

        // Filtra per semestre
        if (this.filtri.semestre !== 'TUTTI' && !annoOverride) {
            fattureFiltrate = fattureFiltrate.filter(f => {
                const mese = new Date(f.dataEmissione).getMonth() + 1;
                if (this.filtri.semestre === 'S1') return mese <= 6;
                if (this.filtri.semestre === 'S2') return mese > 6;
                return true;
            });
        }

        // Filtra per tipo cliente
        if (this.filtri.tipoCliente !== 'TUTTI' && !annoOverride) {
            fattureFiltrate = fattureFiltrate.filter(f => {
                const appCliente = app.find(a => a.clientePaganteId === f.clienteId);
                if (!appCliente) return false;
                return appCliente.tipoPagamento === this.filtri.tipoCliente;
            });
        }

        // Calcola statistiche
        const fatturatoTotale = fattureFiltrate.reduce((sum, f) => sum + (f.importoTotale || 0), 0);
        const numeroFatture = fattureFiltrate.length;
        const ticketMedio = numeroFatture > 0 ? fatturatoTotale / numeroFatture : 0;
        const daIncassare = fattureFiltrate
            .filter(f => f.statoPagamento === 'NON_PAGATA')
            .reduce((sum, f) => sum + (f.importoTotale || 0), 0);

        // Top clienti
        const fatturatoPerCliente = {};
        fattureFiltrate.forEach(f => {
            if (!fatturatoPerCliente[f.clienteId]) {
                const cliente = clienti.find(c => c.id === f.clienteId);
                const appCliente = app.find(a => a.clientePaganteId === f.clienteId);

                fatturatoPerCliente[f.clienteId] = {
                    clienteId: f.clienteId,
                    nomeCliente: cliente?.ragioneSociale || f.clienteRagioneSociale || 'Sconosciuto',
                    provincia: cliente?.provincia,
                    gestione: cliente?.gestione || appCliente?.gestione,
                    tipo: appCliente?.tipoPagamento,
                    fatturato: 0,
                    numeroFatture: 0
                };
            }
            fatturatoPerCliente[f.clienteId].fatturato += f.importoTotale || 0;
            fatturatoPerCliente[f.clienteId].numeroFatture++;
        });

        const topClienti = Object.values(fatturatoPerCliente)
            .sort((a, b) => b.fatturato - a.fatturato);

        // Stats app
        const statsApp = {
            totale: app.length,
            attive: app.filter(a => a.statoApp === 'ATTIVA').length,
            inSviluppo: app.filter(a => a.statoApp === 'IN_SVILUPPO').length,
            demo: app.filter(a => a.statoApp === 'DEMO' || !a.clientePaganteId).length
        };

        return {
            fatturatoTotale,
            numeroFatture,
            ticketMedio,
            daIncassare,
            topClienti,
            statsApp,
            fattureFiltrate
        };
    },

    getAnniDisponibili() {
        const { fatture } = this.datiCache;
        const anni = new Set();
        fatture.forEach(f => {
            const anno = new Date(f.dataEmissione).getFullYear();
            anni.add(anno);
        });
        return Array.from(anni).sort((a, b) => b - a);
    },

    applicaFiltri() {
        // Leggi filtri
        this.filtri.anno = parseInt(document.getElementById('filtroAnno').value);
        this.filtri.tipoCliente = document.getElementById('filtroTipoCliente').value;
        this.filtri.semestre = document.getElementById('filtroSemestre').value;
        this.filtri.confrontoAnno = document.getElementById('filtroConfronto').checked;

        // Ri-renderizza
        this.render();
    },

    // === ANIMAZIONI ===

    animateKPIs() {
        const kpiElements = document.querySelectorAll('.kpi-value');
        kpiElements.forEach(el => {
            const targetValue = parseFloat(el.dataset.value);
            const format = el.dataset.format;
            this.animateValue(el, 0, targetValue, 1500, format);
        });
    },

    animateValue(element, start, end, duration, format) {
        const range = end - start;
        const increment = range / (duration / 16);
        let current = start;

        const timer = setInterval(() => {
            current += increment;
            if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
                current = end;
                clearInterval(timer);
            }

            if (format === 'currency') {
                element.textContent = DataService.formatCurrency(current);
            } else {
                element.textContent = Math.round(current).toLocaleString('it-IT');
            }
        }, 16);
    },

    // === GRAFICI ===

    initCharts() {
        this.createFatturatoMensileChart();
        this.createTipoClientiChart();
        this.createSemestraleChart();
        this.createGestioneChart();
    },

    createFatturatoMensileChart() {
        const ctx = document.getElementById('chartFatturatoMensile');
        if (!ctx) return;

        const dati = this.calcolaDatiFiltrati();
        const datiPrec = this.filtri.confrontoAnno ? this.calcolaDatiFiltrati(this.filtri.anno - 1) : null;

        // Prepara dati mensili
        const mesi = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
        const datiMensili = new Array(12).fill(0);
        const datiMensiliPrec = datiPrec ? new Array(12).fill(0) : null;

        dati.fattureFiltrate.forEach(f => {
            const mese = new Date(f.dataEmissione).getMonth();
            datiMensili[mese] += f.importoTotale || 0;
        });

        if (datiPrec) {
            datiPrec.fattureFiltrate.forEach(f => {
                const mese = new Date(f.dataEmissione).getMonth();
                datiMensiliPrec[mese] += f.importoTotale || 0;
            });
        }

        // Filtra per semestre se necessario
        let labels = mesi;
        let datasets = [];

        if (this.filtri.semestre === 'S1') {
            labels = mesi.slice(0, 6);
            datasets.push({
                label: `${this.filtri.anno}`,
                data: datiMensili.slice(0, 6),
                backgroundColor: 'rgba(20, 82, 132, 0.8)',
                borderColor: 'rgba(20, 82, 132, 1)',
                borderWidth: 2,
                borderRadius: 8
            });
            if (datiMensiliPrec) {
                datasets.push({
                    label: `${this.filtri.anno - 1}`,
                    data: datiMensiliPrec.slice(0, 6),
                    backgroundColor: 'rgba(156, 39, 176, 0.6)',
                    borderColor: 'rgba(156, 39, 176, 1)',
                    borderWidth: 2,
                    borderRadius: 8
                });
            }
        } else if (this.filtri.semestre === 'S2') {
            labels = mesi.slice(6, 12);
            datasets.push({
                label: `${this.filtri.anno}`,
                data: datiMensili.slice(6, 12),
                backgroundColor: 'rgba(20, 82, 132, 0.8)',
                borderColor: 'rgba(20, 82, 132, 1)',
                borderWidth: 2,
                borderRadius: 8
            });
            if (datiMensiliPrec) {
                datasets.push({
                    label: `${this.filtri.anno - 1}`,
                    data: datiMensiliPrec.slice(6, 12),
                    backgroundColor: 'rgba(156, 39, 176, 0.6)',
                    borderColor: 'rgba(156, 39, 176, 1)',
                    borderWidth: 2,
                    borderRadius: 8
                });
            }
        } else {
            datasets.push({
                label: `${this.filtri.anno}`,
                data: datiMensili,
                backgroundColor: 'rgba(20, 82, 132, 0.8)',
                borderColor: 'rgba(20, 82, 132, 1)',
                borderWidth: 2,
                borderRadius: 8
            });
            if (datiMensiliPrec) {
                datasets.push({
                    label: `${this.filtri.anno - 1}`,
                    data: datiMensiliPrec,
                    backgroundColor: 'rgba(156, 39, 176, 0.6)',
                    borderColor: 'rgba(156, 39, 176, 1)',
                    borderWidth: 2,
                    borderRadius: 8
                });
            }
        }

        // Distruggi grafico esistente
        if (this.charts.fatturatoMensile) {
            this.charts.fatturatoMensile.destroy();
        }

        // Crea grafico
        this.charts.fatturatoMensile = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                animation: {
                    duration: 1500,
                    easing: 'easeInOutQuart'
                },
                plugins: {
                    legend: {
                        display: datasets.length > 1,
                        position: 'top',
                        labels: {
                            font: { size: 14, weight: 'bold' },
                            padding: 15
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => context.dataset.label + ': ' + DataService.formatCurrency(context.parsed.y)
                        },
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: 12,
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 13 }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        ticks: {
                            callback: (value) => DataService.formatCurrency(value),
                            font: { size: 11 }
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 12, weight: 'bold' } }
                    }
                }
            }
        });
    },

    createTipoClientiChart() {
        const ctx = document.getElementById('chartTipoClienti');
        if (!ctx) return;

        const { fattureFiltrate } = this.calcolaDatiFiltrati();
        const { app } = this.datiCache;

        // Calcola fatturato per tipo
        let fatturatoDiretto = 0;
        let fatturatoRivenditore = 0;
        let fatturatoNonClassificato = 0;

        fattureFiltrate.forEach(f => {
            const appCliente = app.find(a => a.clientePaganteId === f.clienteId);
            const importo = f.importoTotale || 0;

            if (appCliente?.tipoPagamento === 'DIRETTO') {
                fatturatoDiretto += importo;
            } else if (appCliente?.tipoPagamento === 'RIVENDITORE') {
                fatturatoRivenditore += importo;
            } else {
                fatturatoNonClassificato += importo;
            }
        });

        // Distruggi grafico esistente
        if (this.charts.tipoClienti) {
            this.charts.tipoClienti.destroy();
        }

        // Crea grafico
        this.charts.tipoClienti = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Diretto Growapp', 'Tramite Rivenditore', 'Non Classificato'],
                datasets: [{
                    data: [fatturatoDiretto, fatturatoRivenditore, fatturatoNonClassificato],
                    backgroundColor: [
                        'rgba(76, 175, 80, 0.8)',
                        'rgba(33, 150, 243, 0.8)',
                        'rgba(158, 158, 158, 0.6)'
                    ],
                    borderColor: [
                        'rgba(76, 175, 80, 1)',
                        'rgba(33, 150, 243, 1)',
                        'rgba(158, 158, 158, 1)'
                    ],
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                animation: {
                    duration: 1500,
                    easing: 'easeInOutQuart',
                    animateRotate: true,
                    animateScale: true
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            font: { size: 13, weight: 'bold' },
                            padding: 15
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const total = fatturatoDiretto + fatturatoRivenditore + fatturatoNonClassificato;
                                const perc = ((context.parsed / total) * 100).toFixed(1);
                                return context.label + ': ' + DataService.formatCurrency(context.parsed) + ' (' + perc + '%)';
                            }
                        },
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: 12,
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 13 }
                    }
                }
            }
        });
    },

    createSemestraleChart() {
        const ctx = document.getElementById('chartSemestrale');
        if (!ctx) return;

        const dati = this.calcolaDatiFiltrati();
        const datiPrec = this.calcolaDatiFiltrati(this.filtri.anno - 1);

        // Calcola per semestre
        const calcSemestre = (fatture) => {
            let s1 = 0, s2 = 0;
            fatture.forEach(f => {
                const mese = new Date(f.dataEmissione).getMonth() + 1;
                if (mese <= 6) s1 += f.importoTotale || 0;
                else s2 += f.importoTotale || 0;
            });
            return [s1, s2];
        };

        const [s1Attuale, s2Attuale] = calcSemestre(dati.fattureFiltrate);
        const [s1Prec, s2Prec] = calcSemestre(datiPrec.fattureFiltrate);

        // Distruggi grafico esistente
        if (this.charts.semestrale) {
            this.charts.semestrale.destroy();
        }

        // Crea grafico
        this.charts.semestrale = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['1° Semestre', '2° Semestre'],
                datasets: [
                    {
                        label: `${this.filtri.anno}`,
                        data: [s1Attuale, s2Attuale],
                        backgroundColor: 'rgba(20, 82, 132, 0.8)',
                        borderColor: 'rgba(20, 82, 132, 1)',
                        borderWidth: 2,
                        borderRadius: 10
                    },
                    {
                        label: `${this.filtri.anno - 1}`,
                        data: [s1Prec, s2Prec],
                        backgroundColor: 'rgba(156, 39, 176, 0.6)',
                        borderColor: 'rgba(156, 39, 176, 1)',
                        borderWidth: 2,
                        borderRadius: 10
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                animation: {
                    duration: 1500,
                    easing: 'easeInOutQuart'
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            font: { size: 14, weight: 'bold' },
                            padding: 15
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => context.dataset.label + ': ' + DataService.formatCurrency(context.parsed.y)
                        },
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: 12
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        ticks: {
                            callback: (value) => DataService.formatCurrency(value)
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 13, weight: 'bold' } }
                    }
                }
            }
        });
    },

    createGestioneChart() {
        const ctx = document.getElementById('chartGestione');
        if (!ctx) return;

        const { fattureFiltrate } = this.calcolaDatiFiltrati();
        const { app, clienti } = this.datiCache;

        // Calcola per gestione
        const fatturatoPerGestione = {};

        fattureFiltrate.forEach(f => {
            const cliente = clienti.find(c => c.id === f.clienteId);
            const appCliente = app.find(a => a.clientePaganteId === f.clienteId);
            const gestione = cliente?.gestione || appCliente?.gestione || 'Non Specificato';

            if (!fatturatoPerGestione[gestione]) {
                fatturatoPerGestione[gestione] = 0;
            }
            fatturatoPerGestione[gestione] += f.importoTotale || 0;
        });

        const labels = Object.keys(fatturatoPerGestione);
        const data = Object.values(fatturatoPerGestione);
        const colors = [
            'rgba(20, 82, 132, 0.8)',
            'rgba(76, 175, 80, 0.8)',
            'rgba(255, 152, 0, 0.8)',
            'rgba(156, 39, 176, 0.8)',
            'rgba(244, 67, 54, 0.8)'
        ];

        // Distruggi grafico esistente
        if (this.charts.gestione) {
            this.charts.gestione.destroy();
        }

        // Crea grafico
        this.charts.gestione = new Chart(ctx, {
            type: 'pie',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: colors.slice(0, labels.length),
                    borderColor: colors.slice(0, labels.length).map(c => c.replace('0.8', '1')),
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                animation: {
                    duration: 1500,
                    easing: 'easeInOutQuart',
                    animateRotate: true,
                    animateScale: true
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            font: { size: 12, weight: 'bold' },
                            padding: 12
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const total = data.reduce((a, b) => a + b, 0);
                                const perc = ((context.parsed / total) * 100).toFixed(1);
                                return context.label + ': ' + DataService.formatCurrency(context.parsed) + ' (' + perc + '%)';
                            }
                        },
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: 12
                    }
                }
            }
        });
    }
};

// CSS Animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInUp {
        from {
            opacity: 0;
            transform: translateY(30px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .kpi-card-animated {
        animation: slideInUp 0.6s ease-out backwards;
    }

    .kpi-card-animated:hover {
        transform: translateY(-8px) scale(1.02);
        box-shadow: 0 16px 40px rgba(0,0,0,0.12);
    }
`;
document.head.appendChild(style);

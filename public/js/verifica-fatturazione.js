// =============================================================================
// verifica-fatturazione.js — VERIFICA COPERTURA FATTURAZIONE DELLE APP ATTIVE
// =============================================================================
// v10.10.0 (nov 2026). Nasce dall'audit fatture fatto a mano il 17/11/2026: lo
// stesso riscontro diventa un controllo ripetibile con un pulsante nella sezione
// Fatture (NON visibile agli agenti). Produce un PDF.
//
// Per ogni app con stato ATTIVA risponde a tre domande:
//   1) è mai stata fatturata?
//   2) fino a che data è fatturata?
//   3) ci sono mesi scoperti rispetto a oggi?
//
// Come ragiona:
//   - Fatture VALIDE: non note di credito, non RIFIUTATA, non stornate (stato
//     NOTA_CREDITO). Stessa regola del fatturato netto (vedi DataService).
//   - Contratti dell'app: quelli con appId = app, quello indicato sull'app
//     (contrattoId), tutta la catena dei rinnovi, e i contratti del cliente pagante
//     non collegati a nessuna app (riconosciuti dal nome nell'oggetto, oppure
//     tutti se il cliente ha una sola app attiva).
//   - "Fatturata fino al" = la data di fine competenza più avanti tra le fatture
//     valide di quei contratti.
//   - Esito:
//       COPERTA    -> fatturata almeno fino alla fine del mese in corso
//       IN REGOLA  -> fatturata fino alla fine del mese scorso (il mese in corso
//                     si fattura a fine mese)
//       SCOPERTA   -> fatturata fino a una data precedente (N mesi scoperti)
//       MAI FATTURATA -> nessuna fattura valida
//
// LIMITI (scritti anche nel PDF): guarda le DATE di competenza, non gli importi;
// non rileva buchi in mezzo al periodo; per i contratti non collegati all'app
// l'abbinamento è fatto per nome.
//
// La funzione analizza() è pura (niente DOM, niente Firestore): si può provare
// anche con Node passando i dati.
// =============================================================================

(function () {
    'use strict';

    var MESI_NOME = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
        'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

    // Mesi coperti da una fattura in base alla sua periodicità (solo come ripiego,
    // quando manca la data di fine competenza).
    var MESI_PERIODICITA = {
        MENSILE: 1, BIMESTRALE: 2, BIMENSILE: 2, TRIMESTRALE: 3, QUADRIMESTRALE: 4,
        SEMESTRALE: 6, ANNUALE: 12, BIENNALE: 24, TRIENNALE: 36, QUADRIENNALE: 48,
        QUINQUENNALE: 60
    };

    function chiave(x) { return x ? (x._id || x.id) : null; }

    // Qualsiasi formato di data -> 'YYYY-MM-DD' (oppure null).
    function iso(v) {
        if (!v) return null;
        if (typeof v === 'string') {
            var m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
            return m ? (m[1] + '-' + m[2] + '-' + m[3]) : null;
        }
        var d = null;
        if (v instanceof Date) d = v;
        else if (typeof v.toDate === 'function') d = v.toDate();
        else if (typeof v.seconds === 'number') d = new Date(v.seconds * 1000);
        if (!d || isNaN(d.getTime())) return null;
        return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    }

    // Ultimo giorno del mese (mese 0-11; accetta anche valori fuori intervallo).
    function fineMese(anno, mese) {
        var d = new Date(anno, mese + 1, 0);
        return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    }

    function mesiTra(a, b) {
        return (parseInt(b.slice(0, 4), 10) - parseInt(a.slice(0, 4), 10)) * 12 +
            (parseInt(b.slice(5, 7), 10) - parseInt(a.slice(5, 7), 10));
    }

    function annoPlausibile(d) {
        if (!d) return false;
        var y = parseInt(d.slice(0, 4), 10);
        return y >= 2015 && y <= 2045;
    }

    function isNotaCredito(f) {
        if (typeof DataService !== 'undefined' && DataService.isNotaCredito) return DataService.isNotaCredito(f);
        if (f.tipoDocumento === 'NOTA_DI_CREDITO') return true;
        if (String(f.numeroFatturaCompleto || '').indexOf('NC-') === 0) return true;
        if (/^\s*NOTA/i.test(String(f.tipo || ''))) return true;
        return (Number(f.importoTotale) || 0) < 0;
    }
    function isAnnullata(f) {
        return f.statoPagamento === 'RIFIUTATA' || f.statoPagamento === 'NOTA_CREDITO';
    }
    function isValida(f) { return !isNotaCredito(f) && !isAnnullata(f); }

    // Fine competenza di una fattura: { al: 'YYYY-MM-DD' | null, stimato: bool }
    function fineCompetenza(f) {
        var al = iso(f.competenzaAl);
        if (al && annoPlausibile(al)) return { al: al, stimato: false };

        // Fatture storiche migrate: campi "dal" / "al" (a volte testo: "Novembre 2025")
        al = iso(f.al);
        if (al && annoPlausibile(al)) {
            if (al.slice(8) === '01') al = fineMese(parseInt(al.slice(0, 4), 10), parseInt(al.slice(5, 7), 10) - 1);
            return { al: al, stimato: false };
        }
        var t = String(f.al || f.dal || '').toLowerCase().match(/([a-z]+)\s+(\d{4})/);
        if (t && MESI_NOME.indexOf(t[1]) >= 0) {
            return { al: fineMese(parseInt(t[2], 10), MESI_NOME.indexOf(t[1])), stimato: false };
        }
        // Ripiego: inizio competenza + periodicità della fattura
        var dal = iso(f.competenzaDal) || iso(f.dal);
        var n = MESI_PERIODICITA[String(f.periodicita || '').toUpperCase()];
        if (dal && annoPlausibile(dal) && n) {
            return { al: fineMese(parseInt(dal.slice(0, 4), 10), parseInt(dal.slice(5, 7), 10) - 1 + (n - 1)), stimato: true };
        }
        return { al: null, stimato: true };
    }

    function normalizza(t) {
        return String(t || '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '').replace(/^app/, '');
    }
    function distanza(a, b) {
        var m = [];
        for (var i = 0; i <= a.length; i++) {
            m[i] = [i];
            for (var j = 1; j <= b.length; j++) {
                m[i][j] = i === 0 ? j : Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            }
        }
        return m[a.length][b.length];
    }

    // -------------------------------------------------------------------------
    // analizza: funzione pura. dati = { clienti, contratti, fatture, app, oggi }
    // -------------------------------------------------------------------------
    function analizza(dati) {
        var clienti = dati.clienti || [], contratti = dati.contratti || [];
        var fatture = dati.fatture || [], apps = dati.app || [];
        var oggi = dati.oggi ? new Date(dati.oggi) : new Date();
        var fineMeseCorrente = fineMese(oggi.getFullYear(), oggi.getMonth());
        var fineMeseScorso = fineMese(oggi.getFullYear(), oggi.getMonth() - 1);

        var clientePerId = {}, contrattoPerId = {}, contrattiPerApp = {}, rinnoviDi = {};
        clienti.forEach(function (c) { clientePerId[chiave(c)] = c; });
        contratti.forEach(function (c) {
            contrattoPerId[chiave(c)] = c;
            if (c.appId) (contrattiPerApp[c.appId] = contrattiPerApp[c.appId] || []).push(c);
            if (c.contrattoOrigineId) (rinnoviDi[c.contrattoOrigineId] = rinnoviDi[c.contrattoOrigineId] || []).push(c);
        });

        var fatturePerContratto = {};
        fatture.forEach(function (f) {
            if (!isValida(f) || !f.contrattoId) return;
            var fc = fineCompetenza(f);
            (fatturePerContratto[f.contrattoId] = fatturePerContratto[f.contrattoId] || []).push({ f: f, al: fc.al, stimato: fc.stimato });
        });

        var attive = apps.filter(function (a) { return a.statoApp === 'ATTIVA'; });
        var appAttivePerPagante = {};
        attive.forEach(function (a) { appAttivePerPagante[a.clientePaganteId] = (appAttivePerPagante[a.clientePaganteId] || 0) + 1; });

        var scad = function (c) { var d = iso(c.dataScadenza); return d || '0000-00-00'; };

        var righe = attive.map(function (a) {
            var idApp = chiave(a);
            var insieme = {}, come = {};
            var aggiungi = function (c, modo) {
                if (!c) return;
                var k = chiave(c);
                if (!insieme[k]) { insieme[k] = c; come[k] = modo; }
            };
            (contrattiPerApp[idApp] || []).forEach(function (c) { aggiungi(c, 'collegato'); });
            if (a.contrattoId) aggiungi(contrattoPerId[a.contrattoId], 'collegato');

            // Catena dei rinnovi (avanti e indietro)
            for (var giro = 0; giro < 8; giro++) {
                Object.keys(insieme).forEach(function (k) {
                    var c = insieme[k];
                    aggiungi(contrattoPerId[c.contrattoRinnovoId], 'rinnovo');
                    aggiungi(contrattoPerId[c.contrattoOrigineId], 'rinnovo');
                    (rinnoviDi[k] || []).forEach(function (x) { aggiungi(x, 'rinnovo'); });
                });
            }

            // Contratti del pagante NON collegati a nessuna app
            var nomeApp = normalizza(a.nome);
            var unicaApp = appAttivePerPagante[a.clientePaganteId] === 1;
            if (a.clientePaganteId) {
                contratti.forEach(function (c) {
                    if (c.clienteId !== a.clientePaganteId || c.appId) return;
                    var ogg = normalizza(c.oggetto);
                    if (ogg && nomeApp && (ogg.indexOf(nomeApp) >= 0 || nomeApp.indexOf(ogg) >= 0 || distanza(ogg, nomeApp) <= 1)) aggiungi(c, 'per nome');
                    else if (unicaApp) aggiungi(c, 'unica app del cliente');
                });
            }

            var lista = Object.keys(insieme).map(function (k) { return insieme[k]; });
            var attivi = lista.filter(function (c) { return c.stato === 'ATTIVO'; });
            var ricorrenti = attivi.filter(function (c) { return c.periodicita !== 'UNA_TANTUM'; });
            var base = ricorrenti.length ? ricorrenti : (attivi.length ? attivi : lista);
            var corrente = base.slice().sort(function (x, y) { return scad(y).localeCompare(scad(x)); })[0] || null;

            var fattureApp = [];
            lista.forEach(function (c) { fattureApp = fattureApp.concat(fatturePerContratto[chiave(c)] || []); });
            var conData = fattureApp.filter(function (x) { return x.al; }).sort(function (x, y) { return y.al.localeCompare(x.al); });
            var migliore = conData[0] || null;
            var ultima = fattureApp.map(function (x) { return x.f; }).sort(function (x, y) {
                return String(iso(y.dataEmissione)).localeCompare(String(iso(x.dataEmissione)));
            })[0] || null;

            var pagante = clientePerId[a.clientePaganteId];
            var r = {
                app: a.nome || '(senza nome)',
                tipoPagamento: a.tipoPagamento || '',
                pagante: pagante ? (pagante.ragioneSociale || '') : '',
                senzaPagante: !pagante,
                contratto: corrente ? (corrente.numeroContratto || '') : '',
                statoContratto: corrente ? (corrente.stato || '') : '',
                periodicita: corrente ? (corrente.periodicita || '') : '',
                scadenzaContratto: corrente ? iso(corrente.dataScadenza) : null,
                contrattoCollegato: corrente ? (come[chiave(corrente)] === 'collegato') : null,
                comeTrovato: corrente ? come[chiave(corrente)] : '',
                numFatture: fattureApp.length,
                fatturataFinoAl: migliore ? migliore.al : null,
                stimato: migliore ? migliore.stimato : false,
                ultimaFattura: ultima ? (ultima.numeroFatturaCompleto || '') : '',
                ultimaFatturaData: ultima ? iso(ultima.dataEmissione) : null,
                mesiScoperti: 0,
                esito: ''
            };
            if (!fattureApp.length) r.esito = 'MAI FATTURATA';
            else if (!r.fatturataFinoAl) r.esito = 'DA VERIFICARE';
            else if (r.fatturataFinoAl >= fineMeseCorrente) r.esito = 'COPERTA';
            else if (r.fatturataFinoAl >= fineMeseScorso) r.esito = 'IN REGOLA';
            else { r.esito = 'SCOPERTA'; r.mesiScoperti = mesiTra(r.fatturataFinoAl, fineMeseScorso); }
            return r;
        });

        var perEsito = function (e) {
            return righe.filter(function (r) { return r.esito === e; }).sort(function (x, y) {
                var c = String(x.fatturataFinoAl || '').localeCompare(String(y.fatturataFinoAl || ''));
                return c || String(x.app).localeCompare(String(y.app));
            });
        };

        // --- Anomalie nei dati (da sistemare a mano) ---
        var anomalie = [];
        righe.forEach(function (r) {
            if (r.senzaPagante) anomalie.push({ tipo: 'App attiva senza cliente pagante', cosa: r.app });
            if (!r.contratto) anomalie.push({ tipo: 'App attiva senza alcun contratto', cosa: r.app + (r.pagante ? ' (' + r.pagante + ')' : '') });
            else {
                if (r.contrattoCollegato === false) anomalie.push({ tipo: 'Contratto corrente non collegato all\'app', cosa: r.app + ': ' + r.contratto + ' (trovato ' + r.comeTrovato + ')' });
                if (r.statoContratto !== 'ATTIVO') anomalie.push({ tipo: 'App attiva con contratto non attivo', cosa: r.app + ': ' + r.contratto + ' ' + r.statoContratto + (r.scadenzaContratto ? ' dal ' + dataIt(r.scadenzaContratto) : '') });
            }
        });
        fatture.forEach(function (f) {
            var num = (f.numeroFatturaCompleto || '(senza numero)') + ' ' + (f.clienteRagioneSociale || '');
            if (typeof f.importoTotale !== 'number') anomalie.push({ tipo: 'Fattura senza importo', cosa: num });
            ['competenzaDal', 'competenzaAl'].forEach(function (campo) {
                var d = iso(f[campo]);
                if (d && !annoPlausibile(d)) anomalie.push({ tipo: 'Data di competenza con anno errato', cosa: num + ': ' + d });
            });
            if (isNotaCredito(f) && !isAnnullata(f)) anomalie.push({ tipo: 'Nota di credito che riduce il fatturato (verificare che sia uno storno parziale)', cosa: num + ' ' + (f.statoPagamento || '') + ' ' + euro(Math.abs(f.importoTotale || 0)) });
            if (!f.clienteRagioneSociale) anomalie.push({ tipo: 'Fattura senza ragione sociale', cosa: num });
        });
        anomalie.sort(function (x, y) { return x.tipo.localeCompare(y.tipo) || x.cosa.localeCompare(y.cosa); });

        return {
            oggi: iso(oggi), fineMeseCorrente: fineMeseCorrente, fineMeseScorso: fineMeseScorso,
            totaleApp: righe.length,
            maiFatturate: perEsito('MAI FATTURATA'),
            scoperte: perEsito('SCOPERTA'),
            daVerificare: perEsito('DA VERIFICARE'),
            inRegola: perEsito('IN REGOLA'),
            coperte: perEsito('COPERTA'),
            anomalie: anomalie,
            numFatture: fatture.length, numContratti: contratti.length
        };
    }

    function dataIt(d) { return d ? (d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4)) : ''; }
    function euro(n) {
        return (Number(n) || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' EUR';
    }
    // jsPDF con i font standard gestisce solo Latin-1: via i caratteri fuori set.
    function latin(t) {
        return String(t == null ? '' : t).replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
            .replace(/[–—]/g, '-').replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF]/g, '');
    }

    // -------------------------------------------------------------------------
    // creaPdf: disegna il rapporto con jsPDF (A4 orizzontale, solo testo/linee).
    // -------------------------------------------------------------------------
    function creaPdf(JsPDF, ris, autore) {
        var doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        var L = 297, H = 210, M = 12, y = M;
        var BLU = [20, 82, 132], VERDE = [60, 164, 52], ROSSO = [211, 47, 47], ARANCIO = [230, 126, 34], GRIGIO = [110, 110, 110];

        var piede = function () {
            var n = doc.internal.getNumberOfPages();
            for (var i = 1; i <= n; i++) {
                doc.setPage(i);
                doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(GRIGIO[0], GRIGIO[1], GRIGIO[2]);
                doc.text(latin('CRM Comune.Digital - Verifica fatturazione app attive - ' + dataIt(ris.oggi)), M, H - 6);
                doc.text('Pagina ' + i + ' di ' + n, L - M, H - 6, { align: 'right' });
            }
        };
        var nuovaPagina = function () { doc.addPage(); y = M; };
        var spazio = function (serve) { if (y + serve > H - 12) nuovaPagina(); };
        var taglia = function (testo, larghezza) {
            var t = latin(testo);
            if (doc.getTextWidth(t) <= larghezza) return t;
            while (t.length > 1 && doc.getTextWidth(t + '...') > larghezza) t = t.slice(0, -1);
            return t + '...';
        };

        // --- Intestazione ---
        doc.setFillColor(BLU[0], BLU[1], BLU[2]); doc.rect(0, 0, L, 24, 'F');
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
        doc.text('Verifica fatturazione delle app attive', M, 11);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
        doc.text(latin('Situazione al ' + dataIt(ris.oggi) + (autore ? '  -  generato da ' + autore : '')), M, 18);
        y = 32;

        // --- Riepilogo ---
        var caselle = [
            ['App attive', ris.totaleApp, BLU],
            ['Mai fatturate', ris.maiFatturate.length, ROSSO],
            ['Scoperte', ris.scoperte.length, ARANCIO],
            ['In regola', ris.inRegola.length, VERDE],
            ['Coperte', ris.coperte.length, VERDE]
        ];
        if (ris.daVerificare.length) caselle.push(['Da verificare', ris.daVerificare.length, GRIGIO]);
        var lw = (L - 2 * M - (caselle.length - 1) * 4) / caselle.length;
        caselle.forEach(function (c, i) {
            var x = M + i * (lw + 4);
            doc.setDrawColor(c[2][0], c[2][1], c[2][2]); doc.setLineWidth(0.6); doc.roundedRect(x, y, lw, 20, 2, 2, 'S');
            doc.setTextColor(c[2][0], c[2][1], c[2][2]); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
            doc.text(String(c[1]), x + lw / 2, y + 10, { align: 'center' });
            doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
            doc.text(c[0], x + lw / 2, y + 16.5, { align: 'center' });
        });
        y += 27;

        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
        var spiegazione = [
            'Come leggere il rapporto',
            '- Coperta: fatturata almeno fino al ' + dataIt(ris.fineMeseCorrente) + ' (fine del mese in corso).',
            '- In regola: fatturata fino al ' + dataIt(ris.fineMeseScorso) + '; il mese in corso si fattura a fine mese.',
            '- Scoperta: fatturata fino a una data precedente. I mesi scoperti sono contati fino al ' + dataIt(ris.fineMeseScorso) + '.',
            '- Mai fatturata: nessuna fattura valida sui contratti dell\'app.',
            'Sono considerate valide le fatture non rifiutate e non stornate; le note di credito non contano come copertura.',
            'Limiti: il controllo guarda le date di competenza e non gli importi; non rileva buchi in mezzo al periodo; se il contratto',
            'non è collegato all\'app, l\'abbinamento è fatto per nome o seguendo i rinnovi (vedi elenco anomalie).',
            'Dati esaminati: ' + ris.numFatture + ' fatture, ' + ris.numContratti + ' contratti.'
        ];
        spiegazione.forEach(function (riga, i) {
            doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
            doc.text(latin(riga), M, y); y += 4.6;
        });
        y += 3;

        // --- Tabelle ---
        var COL = [
            { t: 'App', w: 50, v: function (r) { return r.app; } },
            { t: 'Cliente pagante', w: 50, v: function (r) { return r.pagante || '(nessuno)'; } },
            { t: 'Tipo', w: 22, v: function (r) { return r.tipoPagamento; } },
            { t: 'Contratto', w: 42, v: function (r) { return r.contratto ? (r.contratto + ' ' + r.statoContratto) : 'nessun contratto'; } },
            { t: 'Periodicità', w: 24, v: function (r) { return r.periodicita; } },
            { t: 'Scad. contr.', w: 21, v: function (r) { return dataIt(r.scadenzaContratto); } },
            { t: 'Fatturata fino al', w: 27, v: function (r) { return r.fatturataFinoAl ? dataIt(r.fatturataFinoAl) + (r.stimato ? ' *' : '') : '-'; } },
            { t: 'Mesi', w: 10, v: function (r) { return r.mesiScoperti ? String(r.mesiScoperti) : ''; } },
            { t: 'Ultima fattura', w: 27, v: function (r) { return r.ultimaFattura ? (r.ultimaFattura + ' ' + dataIt(r.ultimaFatturaData).slice(3)) : '-'; } }
        ];
        var testata = function () {
            doc.setFillColor(235, 240, 246); doc.rect(M, y, L - 2 * M, 6.5, 'F');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(40, 40, 40);
            var x = M + 1;
            COL.forEach(function (c) { doc.text(c.t, x, y + 4.5); x += c.w; });
            y += 6.5;
        };
        var sezione = function (titolo, colore, righe, nota) {
            if (!righe.length) return;
            spazio(24);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(colore[0], colore[1], colore[2]);
            doc.text(latin(titolo + ' (' + righe.length + ')'), M, y + 4); y += 7;
            if (nota) {
                doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(GRIGIO[0], GRIGIO[1], GRIGIO[2]);
                doc.text(latin(nota), M, y + 2); y += 5;
            }
            testata();
            righe.forEach(function (r, i) {
                if (y + 5.6 > H - 12) { nuovaPagina(); testata(); }
                if (i % 2 === 1) { doc.setFillColor(248, 248, 248); doc.rect(M, y, L - 2 * M, 5.6, 'F'); }
                doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(30, 30, 30);
                var x = M + 1;
                COL.forEach(function (c) { doc.text(taglia(c.v(r), c.w - 2), x, y + 4); x += c.w; });
                y += 5.6;
            });
            y += 6;
        };

        sezione('Mai fatturate', ROSSO, ris.maiFatturate, 'App attive senza nessuna fattura valida.');
        sezione('Scoperte', ARANCIO, ris.scoperte, 'Ordinate dalla più arretrata. "Mesi" = mesi non fatturati fino al ' + dataIt(ris.fineMeseScorso) + '.');
        sezione('Da verificare', GRIGIO, ris.daVerificare, 'Ci sono fatture ma senza un periodo di competenza leggibile.');
        sezione('In regola (mese in corso da emettere)', VERDE, ris.inRegola, '');
        sezione('Coperte', VERDE, ris.coperte, '');
        var stimate = ris.maiFatturate.concat(ris.scoperte, ris.inRegola, ris.coperte).some(function (r) { return r.stimato; });
        if (stimate) {
            spazio(6);
            doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(GRIGIO[0], GRIGIO[1], GRIGIO[2]);
            doc.text('* data stimata: la fattura non ha la fine competenza, calcolata da inizio competenza e periodicità.', M, y); y += 6;
        }

        // --- Anomalie ---
        if (ris.anomalie.length) {
            spazio(24);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(BLU[0], BLU[1], BLU[2]);
            doc.text('Anomalie nei dati da sistemare (' + ris.anomalie.length + ')', M, y + 4); y += 9;
            var tipoCorrente = '';
            ris.anomalie.forEach(function (a) {
                if (a.tipo !== tipoCorrente) {
                    spazio(12);
                    tipoCorrente = a.tipo;
                    var quanti = ris.anomalie.filter(function (z) { return z.tipo === a.tipo; }).length;
                    y += 1.5;
                    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(40, 40, 40);
                    doc.text(latin(a.tipo + ' (' + quanti + ')'), M, y + 3); y += 5.5;
                }
                spazio(5);
                doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(50, 50, 50);
                doc.text(taglia('- ' + a.cosa, L - 2 * M - 4), M + 3, y + 3); y += 4.6;
            });
        }

        piede();
        return doc;
    }

    function attendiLibreria(test, ms) {
        return new Promise(function (resolve) {
            if (test()) return resolve(true);
            var inizio = Date.now();
            var iv = setInterval(function () {
                if (test()) { clearInterval(iv); resolve(true); }
                else if (Date.now() - inizio > (ms || 8000)) { clearInterval(iv); resolve(false); }
            }, 150);
        });
    }

    // -------------------------------------------------------------------------
    // esegui: collegata al pulsante "Verifica fatturazione" della pagina Fatture.
    // -------------------------------------------------------------------------
    var inCorso = false;
    async function esegui() {
        if (inCorso) return;
        // Il controllo riguarda TUTTI i clienti: mai per gli agenti.
        if (typeof AuthService !== 'undefined' && AuthService.canViewOnlyOwnData()) {
            UI.showError('Questa verifica non è disponibile per il tuo profilo.');
            return;
        }
        inCorso = true;
        UI.showLoading();
        try {
            var pronta = await attendiLibreria(function () { return window.jspdf && window.jspdf.jsPDF; });
            if (!pronta) throw new Error('la libreria PDF non si è caricata. Ricarica la pagina e riprova.');

            var dati = await Promise.all([
                DataService.getClienti(),
                DataService.getContratti(),
                DataService.getFatture({ limit: 5000 }),
                DataService.getApps()
            ]);
            var ris = analizza({ clienti: dati[0], contratti: dati[1], fatture: dati[2], app: dati[3] });
            var autore = (typeof AuthService !== 'undefined' && AuthService.getUserName) ? AuthService.getUserName() : '';
            var doc = creaPdf(window.jspdf.jsPDF, ris, autore);
            doc.save('verifica-fatturazione-app-' + ris.oggi + '.pdf');
            UI.hideLoading();
            UI.showSuccess('Verifica completata: ' + ris.maiFatturate.length + ' mai fatturate, ' + ris.scoperte.length + ' scoperte. PDF scaricato.');
        } catch (e) {
            console.error('Errore verifica fatturazione:', e);
            UI.hideLoading();
            UI.showError('Verifica non riuscita: ' + (e && e.message ? e.message : e));
        } finally {
            inCorso = false;
        }
    }

    var api = { analizza: analizza, creaPdf: creaPdf, esegui: esegui };
    if (typeof window !== 'undefined') window.VerificaFatturazione = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

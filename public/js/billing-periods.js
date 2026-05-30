// =============================================================================
// billing-periods.js — LOGICA CENTRALIZZATA dei periodi di competenza
// =============================================================================
// Unica fonte di verità per:
//   - mappa periodicità -> mesi
//   - generazione dei periodi { dal, al } di un contratto
//   - aggiunta di mesi con ancoraggio al giorno di inizio (niente "deriva")
//
// Usata da data-service.js (scadenzario / fatture da emettere) e da forms.js
// (auto-fill del periodo di competenza nel form Nuova Fattura).
//
// Perché esiste (vedi CLAUDE.md sez. 9):
//   Prima questa logica era duplicata in due punti con algoritmi DIVERSI.
//   forms.js avanzava un cursore con setMonth(...), che per i contratti che
//   iniziano il 29/30/31 "derivava" saltando interi mesi
//   (31/01 -> 02/03 -> 03/04 ...). data-service.js invece correggeva il fine
//   mese. Risultato: competenze sbagliate nel form e falsi positivi nello
//   scadenzario. Qui la logica è UNA SOLA, ancorata alla data di inizio.
// =============================================================================

(function () {
    'use strict';

    // Intervallo in mesi per ciascuna periodicità. 0 = UNA_TANTUM (non ricorre).
    var INTERVALLI = {
        MENSILE: 1,
        BIMENSILE: 2,
        TRIMESTRALE: 3,
        SEMESTRALE: 6,
        ANNUALE: 12,
        BIENNALE: 24,
        TRIENNALE: 36,
        QUADRIENNALE: 48,
        QUINQUENNALE: 60,
        UNA_TANTUM: 0
    };

    // Quante fatture/periodi entrano in un anno (per ripartire l'importo annuale).
    var PERIODI_ANNO = {
        MENSILE: 12,
        BIMENSILE: 6,
        TRIMESTRALE: 4,
        SEMESTRALE: 2,
        ANNUALE: 1,
        BIENNALE: 1,
        TRIENNALE: 1,
        QUADRIENNALE: 1,
        QUINQUENNALE: 1,
        UNA_TANTUM: 1
    };

    function getIntervalloMesi(periodicita) {
        if (periodicita && Object.prototype.hasOwnProperty.call(INTERVALLI, periodicita)) {
            return INTERVALLI[periodicita];
        }
        return 12; // default prudente: annuale
    }

    function getPeriodiAnno(periodicita) {
        if (periodicita && Object.prototype.hasOwnProperty.call(PERIODI_ANNO, periodicita)) {
            return PERIODI_ANNO[periodicita];
        }
        return 1;
    }

    // -------------------------------------------------------------------------
    // parseLocalDate: interpreta una data SEMPRE come data locale, senza sorprese
    // di fuso orario. new Date('2026-01-31') verrebbe letta come mezzanotte UTC e
    // in Italia (UTC+1/+2) rischierebbe lo "scivolamento" di un giorno. Qui, per
    // le stringhe 'YYYY-MM-DD' (con o senza orario), prendiamo anno/mese/giorno
    // testuali e costruiamo una data locale. Gli oggetti Date passano invariati.
    // -------------------------------------------------------------------------
    function parseLocalDate(value) {
        if (value instanceof Date) return new Date(value.getTime());
        if (typeof value === 'string') {
            var m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (m) {
                return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 0, 0, 0, 0);
            }
        }
        var d = new Date(value);
        return isNaN(d.getTime()) ? new Date(NaN) : d;
    }

    // Formatta una Date in 'YYYY-MM-DD' usando i componenti LOCALI (no UTC, no
    // toISOString: quello sposterebbe la data indietro di un giorno in Italia).
    function formatLocalISO(date) {
        if (!(date instanceof Date) || isNaN(date.getTime())) return '';
        var y = date.getFullYear();
        var mm = ('0' + (date.getMonth() + 1)).slice(-2);
        var dd = ('0' + date.getDate()).slice(-2);
        return y + '-' + mm + '-' + dd;
    }

    // -------------------------------------------------------------------------
    // addMesiAncorato: aggiunge "mesi" a una data ANCORANDO il giorno a
    // "giornoAncora". Se quel giorno non esiste nel mese di arrivo (es. il 31 a
    // febbraio) si tronca all'ultimo giorno del mese, MA il calcolo riparte
    // sempre dalla data base, quindi non c'è deriva:
    //   inizio 31/01, +1 mese -> 28/02 ; +2 mesi -> 31/03 ; +3 -> 30/04 ...
    // Restituisce una nuova Date a mezzanotte locale.
    // -------------------------------------------------------------------------
    function addMesiAncorato(base, mesi, giornoAncora) {
        // Si parte dal giorno 1 per evitare il rollover automatico di setMonth
        // (31/01 + 1 mese altrimenti diventerebbe 03/03).
        var d = new Date(base.getFullYear(), base.getMonth(), 1);
        d.setMonth(d.getMonth() + mesi);
        var ultimoGiornoDelMese = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(giornoAncora, ultimoGiornoDelMese));
        d.setHours(0, 0, 0, 0);
        return d;
    }

    // -------------------------------------------------------------------------
    // generaPeriodi: restituisce l'array dei periodi { dal, al, indice } di un
    // contratto, dalla dataInizio fino a opzioni.finoA (o alla dataScadenza, o a
    // un default = oggi + 1 anno per i contratti senza scadenza).
    //
    // REGOLA AZIENDALE (Giancarlo): i periodi di competenza seguono il
    // CALENDARIO, NON il giorno di inizio contratto. Ogni periodo va dal 1° del
    // mese all'ULTIMO giorno del mese, e l'emissione fattura è a FINE mese.
    //   - MENSILE:     01/MM -> ultimo giorno di MM
    //   - BIMESTRALE:  01/MM -> ultimo giorno di MM+1
    //   - TRIMESTRALE: 01/MM -> ultimo giorno di MM+2
    //   - ANNUALE:     01/MM -> ultimo giorno di MM+11 ... ecc.
    // Il mese di partenza è quello della dataInizio (il GIORNO di inizio non
    // conta per i confini del periodo). Periodi contigui e non sovrapposti,
    // troncati alla dataScadenza. UNA_TANTUM -> un solo periodo [inizio, scadenza].
    // Le date sono oggetti Date locali (dal a 00:00:00, al a 23:59:59).
    // -------------------------------------------------------------------------
    function generaPeriodi(contratto, opzioni) {
        opzioni = opzioni || {};
        var periodi = [];
        if (!contratto || !contratto.dataInizio) return periodi;

        var inizio = parseLocalDate(contratto.dataInizio);
        if (isNaN(inizio.getTime())) return periodi;
        inizio.setHours(0, 0, 0, 0);

        var scadenza = null;
        if (contratto.dataScadenza) {
            scadenza = parseLocalDate(contratto.dataScadenza);
            if (isNaN(scadenza.getTime())) scadenza = null;
            else scadenza.setHours(23, 59, 59, 999);
        }

        var intervallo = getIntervalloMesi(contratto.periodicita);

        // UNA_TANTUM: un unico periodo che copre tutto il contratto.
        if (intervallo === 0) {
            var alUT = scadenza ? new Date(scadenza) : new Date(inizio);
            alUT.setHours(23, 59, 59, 999);
            periodi.push({ dal: new Date(inizio), al: alUT, indice: 0 });
            return periodi;
        }

        // Fin dove generare.
        var limite;
        if (opzioni.finoA) {
            limite = new Date(opzioni.finoA);
        } else if (scadenza) {
            limite = new Date(scadenza);
        } else {
            limite = new Date();
            limite.setFullYear(limite.getFullYear() + 1);
        }
        if (isNaN(limite.getTime())) return periodi;
        limite.setHours(23, 59, 59, 999);

        // Periodi allineati al CALENDARIO: dal = 1° del mese (mese di inizio +
        // intervallo*i), al = ultimo giorno del mese in cui finisce il periodo.
        // new Date(anno, mese, ...) gestisce da solo lo sforamento dei mesi (es.
        // mese 13 -> febbraio dell'anno dopo) e gli anni bisestili.
        var annoBase = inizio.getFullYear();
        var meseBase = inizio.getMonth();
        var MAX = 600; // sicurezza (≈ 50 anni mensili)
        for (var i = 0; i < MAX; i++) {
            var meseDal = meseBase + (intervallo * i);
            var dal = new Date(annoBase, meseDal, 1, 0, 0, 0, 0);
            if (dal > limite) break;

            var meseAl = meseDal + (intervallo - 1);
            // giorno 0 del mese successivo = ultimo giorno del mese corrente
            var al = new Date(annoBase, meseAl + 1, 0, 23, 59, 59, 999);

            if (scadenza && al > scadenza) al = new Date(scadenza);

            periodi.push({ dal: dal, al: al, indice: i });

            if (scadenza && al >= scadenza) break;
        }
        return periodi;
    }

    // Vero se i due intervalli [aDal,aAl] e [bDal,bAl] si sovrappongono.
    // (Due intervalli si sovrappongono se e solo se ciascuno inizia prima che
    //  l'altro finisca.)
    function periodiSovrapposti(aDal, aAl, bDal, bAl) {
        return aDal <= bAl && aAl >= bDal;
    }

    // Etichetta leggibile del periodo (allineata a data-service._getPeriodoLabel).
    function getPeriodoLabel(periodicita, numero, totale) {
        switch (periodicita) {
            case 'MENSILE': {
                var mesi = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
                return mesi[(numero - 1) % 12] || ('Rata ' + numero);
            }
            case 'BIMENSILE': return 'Bimestre ' + numero + '/' + totale;
            case 'TRIMESTRALE': return 'Q' + numero + ' (Trimestre ' + numero + '/' + totale + ')';
            case 'SEMESTRALE': return 'Semestre ' + numero + '/' + totale;
            case 'ANNUALE': return 'Annuale';
            case 'BIENNALE': return 'Biennale';
            case 'TRIENNALE': return 'Triennale';
            case 'QUADRIENNALE': return 'Quadriennale';
            case 'QUINQUENNALE': return 'Quinquennale';
            case 'UNA_TANTUM': return 'Una Tantum';
            default: return 'Rata ' + numero + '/' + totale;
        }
    }

    var api = {
        getIntervalloMesi: getIntervalloMesi,
        getPeriodiAnno: getPeriodiAnno,
        addMesiAncorato: addMesiAncorato,
        parseLocalDate: parseLocalDate,
        formatLocalISO: formatLocalISO,
        generaPeriodi: generaPeriodi,
        periodiSovrapposti: periodiSovrapposti,
        getPeriodoLabel: getPeriodoLabel
    };

    // Browser (CRM) + Node (test con node --check / require).
    if (typeof window !== 'undefined') window.BillingPeriods = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();

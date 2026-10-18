/**
 * Report pubblico per Comune — versione PDF (A4, una pagina).
 *
 * Il PDF viene creato sul server partendo dagli stessi dati della pagina
 * /report/ (documento report_pubblici/{token}). Così il pulsante "Scarica PDF"
 * è un normale link a un file: funziona anche nei browser interni di Telegram,
 * WhatsApp ecc., dove la stampa del browser o i download generati in pagina
 * non sono disponibili.
 *
 * Font: Titillium Web (SIL Open Font License, vedi lib/fonts/OFL-Titillium-Web.txt).
 */

const path = require('path');
const PDFDocument = require('pdfkit');

const FONT_DIR = path.join(__dirname, 'fonts');
const FONT = {
    R: path.join(FONT_DIR, 'titillium-web-latin-400-normal.woff'),
    S: path.join(FONT_DIR, 'titillium-web-latin-600-normal.woff'),
    B: path.join(FONT_DIR, 'titillium-web-latin-700-normal.woff')
};

const C = {
    blu900: '#0B2F4F', blu700: '#145284', blu500: '#2E6DA8', blu100: '#D1E2F2', blu50: '#EEF4FA',
    verde700: '#3CA434', verde500: '#59C64D', verde300: '#A4E89A', verde100: '#E2F8DE', verdeTesto: '#256E1F',
    ambra100: '#FFF5D6', ambraBordo: '#F3DF9C', ambraTesto: '#4D3B00',
    grigio900: '#1F2A35', grigio700: '#4A5560', grigio500: '#6F7B86', grigio200: '#E6EBF0', grigio100: '#F3F6F9',
    rosso: '#B3261E', rosso100: '#FDECEC', ios: '#7BB4E8'
};

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

// separatore delle migliaia anche sotto 10.000 (Intl it-IT scriverebbe "6842")
const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const compact = n => n >= 1000
    ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.', ',').replace(/,0$/, '') + 'K'
    : String(Math.round(n));
const meseCorto = ym => MESI[Number(ym.split('-')[1]) - 1].slice(0, 3);
const meseLungo = ym => MESI[Number(ym.split('-')[1]) - 1] + ' ' + ym.slice(0, 4);
const dataLunga = iso => {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.getDate() + ' ' + MESI[d.getMonth()] + ' ' + d.getFullYear();
};
const durataTesto = s => s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0') + ' s';
const pct = (a, b) => b ? Math.round((a - b) / b * 100) : null;

// L'icona arriva da Firebase Storage: si scarica solo da lì, con timeout breve.
async function scaricaIcona(url) {
    try {
        const u = new URL(url);
        if (u.protocol !== 'https:' || !/(^|\.)(firebasestorage|storage)\.googleapis\.com$/.test(u.hostname)) return null;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const resp = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
        if (!resp.ok) return null;
        const buf = Buffer.from(await resp.arrayBuffer());
        const png = buf.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        const jpg = buf[0] === 0xff && buf[1] === 0xd8;
        return (png || jpg) ? buf : null; // pdfkit legge solo PNG e JPEG
    } catch (e) {
        return null;
    }
}

function nomeFile(R) {
    const ultimo = (R.mesi && R.mesi.length) ? R.mesi[R.mesi.length - 1].m : '';
    const base = 'Report app ' + (R.comune || 'Comune') + (ultimo ? ' ' + meseLungo(ultimo) : '');
    return base.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + '.pdf';
}

/**
 * Genera il PDF e ritorna un Buffer.
 */
async function generaPdf(R) {
    const icona = R.iconaUrl ? await scaricaIcona(R.iconaUrl) : null;

    const doc = new PDFDocument({
        size: 'A4',
        margin: 0,
        font: FONT.R, // evita di caricare Helvetica (file .afm esterni)
        info: { Title: 'Report app · ' + (R.comune || ''), Author: 'Comune.Digital', Creator: 'Comune.Digital' }
    });
    doc.registerFont('R', FONT.R);
    doc.registerFont('S', FONT.S);
    doc.registerFont('B', FONT.B);

    const chunks = [];
    doc.on('data', c => chunks.push(c));
    const fine = new Promise(res => doc.on('end', res));

    const W = doc.page.width;   // 595.28
    const M = 36;
    const IW = W - 2 * M;
    const testo = (str, x, y, font, size, color, opts) => {
        doc.font(font).fontSize(size).fillColor(color).text(str, x, y, Object.assign({ lineBreak: false }, opts || {}));
    };

    const mesi = Array.isArray(R.mesi) ? R.mesi : [];
    const somma = k => mesi.reduce((t, r) => t + (r[k] || 0), 0);
    const tot = { pv: somma('pv'), sess: somma('sess') };
    const prec = R.precedenti || {};
    const periodo = mesi.length
        ? meseCorto(mesi[0].m) + ' ' + mesi[0].m.slice(0, 4) + ' – ' + meseCorto(mesi[mesi.length - 1].m) + ' ' + mesi[mesi.length - 1].m.slice(0, 4)
        : '';

    // ================= INTESTAZIONE =================
    const HH = 168;
    const grad = doc.linearGradient(0, 0, W, HH);
    grad.stop(0, C.blu900).stop(0.6, C.blu700).stop(1, '#1C6AA6');
    doc.rect(0, 0, W, HH).fill(grad);
    // trama a puntini leggera
    doc.save().fillColor('#FFFFFF').opacity(0.07);
    for (let y = 12; y < HH - 30; y += 16) for (let x = 12; x < W; x += 16) doc.circle(x, y, 0.8).fill();
    doc.restore();

    doc.circle(M + 4, 30, 4).fill(C.verde500);
    testo('Comune.Digital', M + 14, 23, 'B', 10, '#FFFFFF');
    const agg = 'Aggiornato al ' + dataLunga(R.aggiornatoIl);
    testo(agg, M, 23, 'R', 9, '#FFFFFF', { width: IW, align: 'right' });

    // icona
    const IX = M, IY = 58, IS = 62;
    doc.roundedRect(IX, IY, IS, IS, 16).fill('#FFFFFF');
    if (icona) {
        doc.save();
        doc.roundedRect(IX, IY, IS, IS, 16).clip();
        try { doc.image(icona, IX, IY, { width: IS, height: IS }); } catch (e) { /* immagine non leggibile */ }
        doc.restore();
    } else {
        // colonnato stilizzato
        doc.fillColor(C.blu700);
        doc.polygon([IX + 15, IY + 26], [IX + 31, IY + 16], [IX + 47, IY + 26]).fill();
        for (let i = 0; i < 4; i++) doc.rect(IX + 17 + i * 8, IY + 29, 4, 15).fill();
        doc.rect(IX + 14, IY + 46, 34, 4).fill();
    }
    testo("REPORT DELL'APP", IX + IS + 16, IY + 4, 'S', 8.5, C.verde300, { characterSpacing: 1.2 });
    doc.font('B').fontSize(24).fillColor('#FFFFFF')
        .text(R.comune || '', IX + IS + 16, IY + 16, { width: IW - IS - 16, height: 64, ellipsis: true });

    // ================= DOWNLOAD TOTALI =================
    let y = HH - 32;
    const DH = 146;
    doc.lineWidth(1).roundedRect(M, y, IW, DH, 16).fillAndStroke('#FFFFFF', C.grigio200);
    testo('DOWNLOAD TOTALI', M + 22, y + 18, 'S', 10, C.grigio500, { characterSpacing: 1.2 });
    testo(fmt(R.downloadTotali || 0), M + 20, y + 26, 'B', 58, C.blu900);

    if (R.os && (R.os.ios + R.os.android) > 0) {
        const t = R.os.ios + R.os.android;
        const pI = Math.round(R.os.ios / t * 100), pA = 100 - pI;
        const bx = M + 22, by = y + 120, bw = 320, bh = 10;
        const wI = bw * pI / 100;
        doc.save();
        doc.roundedRect(bx, by, bw, bh, 5).clip();
        doc.rect(bx, by, Math.max(wI - 1, 0), bh).fill(C.ios);
        doc.rect(bx + wI + 1, by, bw - wI - 1, bh).fill(C.verde500);
        doc.restore();
        doc.rect(bx, by - 15, 8, 8).fill(C.ios);
        testo('iPhone ' + pI + '%', bx + 12, by - 18, 'S', 10, C.grigio700);
        const etA = 'Android ' + pA + '%';
        doc.font('S').fontSize(10);
        const wA = doc.widthOfString(etA);
        doc.rect(bx + bw - wA - 12, by - 15, 8, 8).fill(C.verde500);
        testo(etA, bx + bw - wA, by - 18, 'S', 10, C.grigio700);
    }

    if (R.popolazione > 0 && R.downloadTotali > 0) {
        const perCento = Math.round(R.downloadTotali / R.popolazione * 100);
        const cx = M + IW - 78, cy = y + DH / 2, r = 46;
        doc.circle(cx, cy, r).lineWidth(10).stroke(C.verde100);
        const frac = Math.min(perCento, 100) / 100;
        if (frac >= 0.999) {
            doc.circle(cx, cy, r).lineWidth(10).stroke(C.verde500);
        } else if (frac > 0) {
            const a = -Math.PI / 2 + frac * 2 * Math.PI;
            const ex = cx + r * Math.cos(a), ey = cy + r * Math.sin(a);
            doc.path(`M ${cx} ${cy - r} A ${r} ${r} 0 ${frac > 0.5 ? 1 : 0} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`)
                .lineWidth(10).lineCap('round').stroke(C.verde500);
            doc.lineCap('butt');
        }
        testo(String(perCento), cx - 34, cy - 21, 'B', 26, C.grigio900, { width: 68, align: 'center' });
        testo('ogni 100', cx - 34, cy + 7, 'R', 8.5, C.grigio500, { width: 68, align: 'center' });
        testo('abitanti', cx - 34, cy + 17, 'R', 8.5, C.grigio500, { width: 68, align: 'center' });
    }
    y += DH + 16;

    // ================= NUMERI PRINCIPALI (griglia 2×2) =================
    const kpi = [];
    const delta = d => (d === null || d === undefined) ? null : d;
    if (mesi.length) {
        kpi.push({ label: 'Visualizzazioni', sub: periodo, value: fmt(tot.pv), d: delta(pct(tot.pv, prec.pv)) });
        kpi.push({ label: 'Sessioni', sub: periodo, value: fmt(tot.sess), d: delta(pct(tot.sess, prec.sess)) });
    }
    if (R.durataMediaSec > 0) kpi.push({ label: 'Durata media', sub: 'per sessione', value: durataTesto(R.durataMediaSec), d: delta(pct(R.durataMediaSec, R.durataMediaSecPrec)) });
    if (R.iscrittiNotifiche > 0) {
        kpi.push({
            label: 'Iscritti alle notifiche', sub: 'push del Comune', value: fmt(R.iscrittiNotifiche), verde: true,
            nota: 'Dato non automatico, aggiornato di norma ogni settimana.' +
                (R.iscrittiNotificheAggiornatoIl ? ' Ultimo aggiornamento: ' + dataLunga(R.iscrittiNotificheAggiornatoIl) + '.' : '')
        });
    }
    if (kpi.length) {
        const gap = 12, KH = 88;
        const colonne = kpi.length === 1 ? 1 : 2;
        const kw = (IW - gap * (colonne - 1)) / colonne;
        kpi.forEach((k, i) => {
            const x = M + (i % colonne) * (kw + gap);
            const ky = y + Math.floor(i / colonne) * (KH + gap);
            doc.lineWidth(1).roundedRect(x, ky, kw, KH, 14).fillAndStroke('#FFFFFF', C.grigio200);
            doc.roundedRect(x + 16, ky + 16, 5, 28, 2.5).fill(k.verde ? C.verde500 : C.blu500);
            testo(k.label, x + 30, ky + 14, 'S', 12, C.grigio700, { width: kw - 46 });
            testo(k.sub, x + 30, ky + 31, 'R', 8.5, C.grigio500, { width: kw - 46 });
            testo(k.value, x + 16, ky + 46, 'B', 28, C.grigio900, { width: kw * 0.62 });

            const destra = x + kw - 16;
            if (k.d !== null && k.d !== undefined) {
                const up = k.d >= 0;
                const lab = (up ? '+' : '−') + Math.abs(k.d) + '%';
                doc.font('S').fontSize(10);
                const pw = doc.widthOfString(lab) + 16;
                doc.roundedRect(destra - pw, ky + 52, pw, 18, 9).fill(up ? C.verde100 : C.rosso100);
                testo(lab, destra - pw, ky + 54.5, 'S', 10, up ? C.verdeTesto : C.rosso, { width: pw, align: 'center' });
                testo("sull'anno prima", x, ky + 72, 'R', 8, C.grigio500, { width: kw - 16, align: 'right' });
            }
            if (k.nota) {
                const nw = kw * 0.5 - 8;
                doc.font('R').fontSize(7.5);
                const nh = doc.heightOfString(k.nota, { width: nw - 14, lineGap: -0.5 });
                const nTop = ky + KH - nh - 20;
                doc.lineWidth(0.8).roundedRect(destra - nw, nTop, nw, nh + 10, 7).fillAndStroke(C.ambra100, C.ambraBordo);
                doc.fillColor(C.ambraTesto).text(k.nota, destra - nw + 7, nTop + 5, { width: nw - 14, lineGap: -0.5 });
            }
        });
        const righe = Math.ceil(kpi.length / colonne);
        y += righe * KH + (righe - 1) * gap + 24;
    }

    // ================= GRAFICI =================
    function grafico(k, titolo, unita, top, altezza) {
        testo(titolo, M, top, 'B', 13.5, C.blu700);
        const totale = fmt(somma(k)) + ' ' + unita + (periodo ? ' · ' + periodo : '');
        testo(totale, M, top + 3, 'R', 9, C.grigio500, { width: IW, align: 'right' });

        const gTop = top + 26, gH = altezza, gL = M + 30, gW = IW - 30;
        const max0 = Math.max(...mesi.map(d => d[k] || 0), 1) * 1.1;
        const p = Math.pow(10, Math.floor(Math.log10(max0)));
        // passi che divisi per 4 danno etichette tonde (es. 15K/4 = 3,75K no, 16K/4 = 4K sì)
        const max = [1, 2, 4, 6, 8, 10].map(s => s * p).find(v => v >= max0);
        const yv = v => gTop + gH - v / max * gH;
        for (let i = 0; i <= 4; i++) {
            const v = max / 4 * i, yy = yv(v);
            doc.moveTo(gL, yy).lineTo(gL + gW, yy).lineWidth(0.6).stroke(C.grigio200);
            testo(compact(v), M - 4, yy - 4, 'R', 7, C.grigio500, { width: 30, align: 'right' });
        }
        const slot = gW / mesi.length;
        const bw = Math.min(22, slot - 8);
        let migliore = mesi[0];
        mesi.forEach(d => { if ((d[k] || 0) > (migliore[k] || 0)) migliore = d; });
        mesi.forEach((d, i) => {
            const cx = gL + slot * i + slot / 2, x = cx - bw / 2;
            const top2 = yv(d[k] || 0), base = gTop + gH, h = base - top2;
            if (h > 0.5) {
                const r = Math.min(3, h);
                doc.path(`M ${x} ${base} V ${top2 + r} Q ${x} ${top2} ${x + r} ${top2} H ${x + bw - r} Q ${x + bw} ${top2} ${x + bw} ${top2 + r} V ${base} Z`)
                    .fill(C.blu500);
            }
            testo(meseCorto(d.m), cx - slot / 2, base + 5, 'R', 8.5, C.grigio500, { width: slot, align: 'center' });
            if (d === migliore && d[k] > 0) testo(compact(d[k]), cx - slot / 2, top2 - 12, 'B', 8.5, C.grigio900, { width: slot, align: 'center' });
        });
        if (mesi.length > 1) {
            const avg = somma(k) / mesi.length, ay = yv(avg);
            doc.moveTo(gL, ay).lineTo(gL + gW, ay).lineWidth(0.8).stroke(C.grigio500);
            const lab = 'media ' + compact(avg);
            doc.font('S').fontSize(7);
            const lw = doc.widthOfString(lab);
            doc.rect(gL + 2, ay - 10, lw + 6, 9).fill('#FFFFFF');
            testo(lab, gL + 5, ay - 10, 'S', 7, C.grigio700);
        }
        return gTop + gH + 18;
    }

    if (mesi.length) {
        // la pagina ha spazio fisso: i grafici si dividono quello che resta
        const disponibile = doc.page.height - 50 - y - 2 * 44 - 12;
        y = grafico('pv', 'Visualizzazioni', 'visualizzazioni', y, Math.round(disponibile * 0.58));
        grafico('sess', 'Sessioni', 'sessioni', y + 12, Math.round(disponibile * 0.42));
    }

    // ================= PIÈ DI PAGINA =================
    const FY = doc.page.height - 34;
    doc.moveTo(M, FY - 8).lineTo(M + IW, FY - 8).lineWidth(0.6).stroke(C.grigio200);
    testo('Report a cura di Comune.Digital', M, FY, 'S', 8, C.blu700);
    testo('Download aggiornati ogni notte · statistiche mensili a ogni fine mese', M, FY, 'R', 8, C.grigio500, { width: IW, align: 'right' });

    doc.end();
    await fine;
    return Buffer.concat(chunks);
}

module.exports = { generaPdf, nomeFile };

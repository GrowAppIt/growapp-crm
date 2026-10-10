#!/usr/bin/env node
// Stato dei collegamenti MCP delle app (SOLA LETTURA, non stampa mai token).
// Uso: node scripts/mcp-collega/stato.js [quante]   (default 10)
// Mostra: quante app sono collegate e il prossimo gruppo da collegare
// (app ATTIVE con goodbarberWebzineId e senza collegamento, in ordine alfabetico).
'use strict';
const db = require('./fsrest.js');

(async () => {
  const n = parseInt(process.argv[2], 10) || 10;
  const apps = await db.listAll('app');
  const collegate = apps.filter(a => a.mcpRefreshToken).map(a => a.nome).sort();
  const daFare = apps
    .filter(a => a.statoApp === 'ATTIVA' && a.goodbarberWebzineId && !a.mcpRefreshToken)
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const senzaId = apps.filter(a => a.statoApp === 'ATTIVA' && !a.goodbarberWebzineId).map(a => a.nome);

  console.log('Collegate:', collegate.length);
  console.log('Attive ancora da collegare:', daFare.length);
  if (senzaId.length) console.log('Attive SENZA goodbarberWebzineId (da segnalare):', senzaId.join(', '));
  console.log('\nProssimo gruppo (docId | webzineId | nome | cruscotto):');
  daFare.slice(0, n).forEach((a, i) =>
    console.log(`${i + 1}. ${a._id} | ${a.goodbarberWebzineId} | ${a.nome} | ${a.urlCruscotto || '-'}`));
})().catch(e => { console.error('ERR', e.message); process.exit(1); });

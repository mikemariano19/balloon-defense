// Runs the balance bot on every map. Usage: node tools/balance.js [easy,medium] [mode] [mapId]
'use strict';
const { loadEngine } = require('../tests/harness');
const { playBot } = require('./bot');

const diffs = (process.argv[2] || 'easy,medium').split(',');
const mode = process.argv[3] || 'standard';
const only = process.argv[4];
const E0 = loadEngine();
const maps = E0.MAPS.filter(m => !only || m.id === only);
const rows = [];
for (const m of maps) {
  const row = { tier: E0.TIERS.find(t => t.id === m.tier).name, map: m.name };
  for (const d of diffs) {
    const E = loadEngine();
    const t0 = Date.now();
    const r = playBot(E, m.id, d, mode, { maxRounds: 50 });
    row[d] = r.won ? `Won, ${r.lives} lives` : `${r.round}`;
    row[d + 'Sec'] = ((Date.now() - t0) / 1000).toFixed(1);
  }
  rows.push(row);
  console.log(JSON.stringify(row));
}
console.table(rows);

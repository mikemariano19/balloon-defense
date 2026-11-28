// Plays every stage on every difficulty with the balance bot and prints a Markdown table
// with the result and a suggested 1-10 difficulty rating per stage.
// Usage: node tools/stage-report.js [mode] [mapId,mapId]
// The bot is a fixed-plan player (no Gunboats or Gold Mines), so the rating is a guide, not a verdict.
'use strict';
const { loadEngine } = require('../tests/harness');
const { playBot } = require('./bot');

const mode = process.argv[2] || 'standard';
const only = process.argv[3];
const DIFFS = ['easy', 'medium', 'hard', 'nightmare'];
const E0 = loadEngine();
const maps = E0.MAPS.filter(m => !only || only.split(',').includes(m.id));

/* Rating from the bot's results: 1 = the bot wins every difficulty easily, 10 = it fails even on Easy early. */
function rate(results) {
  const fracs = results.map(r => (r.won ? 1 : r.round / r.end));
  const avg = fracs.reduce((a, b) => a + b, 0) / fracs.length;
  return Math.max(1, Math.min(10, Math.round(1 + 9 * (1 - avg))));
}

const lines = ['| Tier | Stage | Easy | Medium | Hard | Nightmare | Rating (1-10) |', '|---|---|---|---|---|---|---|'];
for (const m of maps) {
  const tier = E0.TIERS.find(t => t.id === m.tier).name;
  const results = [];
  const cells = [];
  for (const d of DIFFS) {
    const E = loadEngine();
    const end = E.DIFF[d].end;
    let r;
    try {
      r = playBot(E, m.id, d, mode, { maxRounds: end });
    } catch (err) {
      r = { won: false, round: 0, lives: 0, error: String(err && err.message || err) };
    }
    r.end = end;
    results.push(r);
    cells.push(r.error ? `ERROR: ${r.error}` : r.won ? `Won (${r.lives} lives left)` : `Lost at R${r.round}/${end}`);
  }
  lines.push(`| ${tier} | ${m.name} | ${cells.join(' | ')} | ${rate(results)} |`);
}
console.log(lines.join('\n'));

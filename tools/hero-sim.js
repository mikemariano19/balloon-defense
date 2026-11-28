// Simulates the four hero drafts from docs/hero-preview.md (agent/ivy, commit 1869875) with the balance bot.
// Each hero is added to the engine as a tower with its base stats (level 1-2 strength, no XP, no upgrades).
// Abilities are NOT modeled: the engine has no code for them, so the hero only shows its base attack.
// The bot buys a hero the first time it can afford one, then plays its normal fixed build.
// Usage: node tools/hero-sim.js [mapId,mapId] [easy,medium,...]
// Output: a Markdown table per stage: baseline (no hero) vs each hero, per difficulty.
'use strict';
const { loadEngine } = require('../tests/harness');
const { playBot, bestSpot, samples } = require('./bot');

// Base stats from the draft (Medium prices; the engine multiplies by the difficulty cost factor).
// dtype/chains are the closest engine keys; check them against src/data.ts before trusting results.
const HEROES = {
  fern: { name: 'Fern Fletch', cost: 540, color: '#8d6e63', desc: 'Archer hero (draft)',
    base: { range: 150, rate: 0.95, dmg: 1, pierce: 3, dtype: 'sharp', speed: 540, count: 1, spread: 0, proj: 'dart', camo: false, life: 0 } },
  ember: { name: 'Ember Vale', cost: 725, color: '#ef6c00', desc: 'Fire support hero (draft)',
    base: { range: 100, rate: 0.5, dmg: 1, pierce: 2, dtype: 'normal', speed: 540, count: 1, spread: 0, proj: 'dart', camo: false, life: 0 } },
  flint: { name: 'Sergeant Flint', cost: 700, color: '#6d4c41', desc: 'Artillery hero (draft)',
    base: { range: 160, rate: 1.2, dmg: 2, pierce: 10, blast: 35, dtype: 'normal', speed: 420, count: 1, spread: 0, proj: 'ball', camo: false, life: 0 } },
  willow: { name: 'Willow Moss', cost: 650, color: '#7cb342', desc: 'Forest keeper hero (draft)',
    base: { range: 120, rate: 1.35, dmg: 1, pierce: 1, chains: 3, dtype: 'normal', speed: 540, count: 1, spread: 0, proj: 'dart', camo: false, life: 0 } },
};

/** Registers a hero as a tower type. Upgrade paths are empty so the bot never upgrades it. */
function defineHero(E, id) {
  const h = HEROES[id];
  E.TD[id] = { name: h.name, cost: h.cost, size: 2, r: 19, color: h.color, unlock: 1, desc: h.desc,
    ability: { name: 'Draft ability', desc: 'Not modeled', cd: 60 }, base: h.base, paths: [[], [], []] };
}

/** Plays one stage with an optional hero (null = baseline). Returns the bot result. */
function runOne(mapId, diff, heroId) {
  const E = loadEngine();
  let placed = !heroId;
  if (heroId) defineHero(E, heroId);
  return playBot(E, mapId, diff, 'standard', {
    maxRounds: E.DIFF[diff].end,
    setup: (E2) => { if (heroId) E2.run(`game.allowed.push(${JSON.stringify(heroId)})`); },
    beforeSpend: (E2, pts) => {
      if (placed) return;
      const cost = E2.price(HEROES[heroId].cost);
      if (E2.game.cash < cost) return;
      const spot = bestSpot(E2, heroId, pts);
      if (spot) E2.placeTower(heroId, spot[0], spot[1]);
      placed = E2.game.towers.some(t => t.type === heroId);
    },
  });
}

function cell(r, end) {
  if (r.error) return `ERROR: ${r.error}`;
  return r.won ? `Won (${r.lives} lives)` : `Lost R${r.round}/${end}`;
}

function main() {
  const mapArg = process.argv[2];
  const diffArg = process.argv[3];
  const DIFFS = diffArg ? diffArg.split(',') : ['easy', 'medium', 'hard', 'nightmare'];
  const E0 = loadEngine();
  const maps = E0.MAPS.filter(m => !mapArg || mapArg.split(',').includes(m.id));
  const heroIds = Object.keys(HEROES);
  const header = ['Stage', 'Difficulty', 'Baseline', ...heroIds.map(h => HEROES[h].name)];
  const lines = ['| ' + header.join(' | ') + ' |', '|' + header.map(() => '---').join('|') + '|'];
  for (const m of maps) {
    for (const d of DIFFS) {
      const end = E0.DIFF[d].end;
      const row = [m.name, d, cell(runOne(m.id, d, null), end)];
      for (const h of heroIds) row.push(cell(runOne(m.id, d, h), end));
      lines.push('| ' + row.join(' | ') + ' |');
    }
  }
  console.log(lines.join('\n'));
}

if (require.main === module) main();
module.exports = { HEROES, runOne };

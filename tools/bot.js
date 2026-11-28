// Balance bot: plays the engine headlessly with a fixed build order and best-coverage placement.
// It never builds Gunboats or Gold Mines, so a thoughtful player should do better.
'use strict';

// [action, tower type, which tower of that type (0 = first built), upgrade path]
const PLAN = [
  ['place', 'dart'], ['place', 'dart'], ['up', 'dart', 0, 0], ['place', 'tack'], ['up', 'dart', 1, 0],
  ['up', 'dart', 0, 1], ['place', 'dart'], ['up', 'dart', 0, 1], ['up', 'dart', 1, 1],
  ['place', 'bomb'], ['up', 'tack', 0, 1], ['up', 'bomb', 0, 1], ['up', 'tack', 0, 1],
  ['place', 'sniper'], ['up', 'sniper', 0, 1], ['up', 'dart', 2, 0], ['up', 'sniper', 0, 0],
  ['place', 'frost'], ['up', 'frost', 0, 1], ['up', 'bomb', 0, 0], ['up', 'dart', 0, 1],
  ['place', 'tesla'], ['up', 'tesla', 0, 1], ['up', 'sniper', 0, 0], ['up', 'tesla', 0, 0],
  ['place', 'sniper'], ['up', 'sniper', 1, 0], ['up', 'sniper', 1, 1], ['up', 'bomb', 0, 0],
  ['place', 'signal'], ['up', 'signal', 0, 1], ['up', 'signal', 0, 0], ['up', 'signal', 0, 0],
  ['up', 'tesla', 0, 0], ['up', 'tack', 0, 1], ['up', 'sniper', 0, 0], ['up', 'sniper', 1, 1],
  ['place', 'bomb'], ['up', 'bomb', 1, 1], ['up', 'bomb', 1, 1], ['up', 'bomb', 1, 0], ['up', 'bomb', 0, 0],
  ['place', 'tesla'], ['up', 'tesla', 1, 1], ['up', 'tesla', 1, 0], ['up', 'tesla', 1, 0], ['up', 'tesla', 0, 0],
  ['up', 'sniper', 1, 1], ['up', 'bomb', 1, 1],
];
const LOOP = [['place', 'sniper'], ['upAll', 'sniper'], ['place', 'tesla'], ['upAll', 'tesla'], ['place', 'bomb'], ['upAll', 'bomb']];

/** Points along every road, used to score how much road a tower would cover. */
function samples(E) {
  const out = [];
  for (const p of E.game.paths) for (let d = 0; d < p.len; d += 12) {
    const q = E.posAt(p, d);
    if (q.x >= 0 && q.y >= 0 && q.x <= E.W && q.y <= E.H) out.push(q);
  }
  return out;
}

function bestSpot(E, type, pts) {
  const s = E.TD[type].base, range = s.range && s.range < 2000 ? s.range : s.aura || 100;
  const others = E.game.towers.filter(t => !E.TD[t.type].support);
  let best = null, bestScore = -Infinity;
  for (let x = 20; x <= 940; x += 14) for (let y = 20; y <= 580; y += 14) {
    if (E.spotProblem(type, x, y)) continue;
    let score;
    if (type === 'signal') score = others.filter(t => Math.hypot(t.x - x, t.y - y) <= range).length;
    else if (type === 'sniper') score = -Math.hypot(x - 480, y - 300); // range is the whole map
    else score = pts.reduce((n, q) => n + (Math.hypot(q.x - x, q.y - y) <= range ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = [x, y]; }
  }
  return best;
}

/** Try one plan step. Returns true when done (or impossible), false when waiting for cash. */
function step(E, a, pts) {
  const g = E.game, [kind, type, idx, path] = a;
  const mine = g.towers.filter(t => t.type === type);
  if (kind === 'place') {
    if (E.shopProblem(type)) return true;
    if (g.cash < E.price(E.TD[type].cost)) return false;
    const spot = bestSpot(E, type, pts);
    if (spot) E.placeTower(type, spot[0], spot[1]);
    return true;
  }
  if (kind === 'up') {
    const t = mine[idx];
    if (!t || E.canUp(t, path) !== 'ok') return true;
    if (g.cash < E.upgradeCost(t, path)) return false;
    E.upgrade(t, path);
    return true;
  }
  // upAll: push the newest tower of this type along its main path, then path 0 to tier 2
  const t = mine[mine.length - 1];
  if (!t) return true;
  for (const p of [1, 1, 1, 1, 1, 0, 0]) {
    if (E.canUp(t, p) !== 'ok') continue;
    if (g.cash < E.upgradeCost(t, p)) return false;
    E.upgrade(t, p);
  }
  return true;
}

/**
 * Plays one game. opts: { maxRounds, dt, abilities }.
 * Returns { won, round, lives, cash, towers, seconds }.
 */
function playBot(E, mapId, diffKey, mode = 'standard', opts = {}) {
  const maxRounds = opts.maxRounds || 50, dt = opts.dt || 1 / 40;
  E.DEV.unlockAll = true;
  E.SETTINGS.autoStart = false;
  const mapIdx = E.MAPS.findIndex(m => m.id === mapId);
  if (mapIdx < 0) throw new Error('unknown map ' + mapId);
  E.createGame({ mapIdx, diffKey, mode });
  const pts = samples(E);
  if (opts.setup) opts.setup(E, pts);
  let pi = 0, li = 0;
  const g = () => E.game;
  while (!g().over && g().round < maxRounds && !(g().won && g().round >= g().diff.end)) {
    // spend money between rounds
    if (opts.beforeSpend) opts.beforeSpend(E, pts);
    for (let guard = 0; guard < 40; guard++) {
      const a = pi < PLAN.length ? PLAN[pi] : LOOP[li % LOOP.length];
      if (!step(E, a, pts)) break;
      if (pi < PLAN.length) pi++; else li++;
    }
    E.startRound();
    let t = 0;
    while (g().inRound && !g().over && t < 600) {
      E.update(dt);
      t += dt;
      if (opts.abilities !== false) for (const tw of g().towers) if (E.abilityProblem(tw) === '') E.useAbility(tw);
    }
  }
  return { won: g().won, round: g().round, lives: g().lives, cash: Math.floor(g().cash), towers: g().towers.length, seconds: g().time };
}

module.exports = { playBot, bestSpot, samples };

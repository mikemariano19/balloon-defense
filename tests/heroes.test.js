'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadEngine, fakeStorage } = require('./harness');

const STEP = 1 / 60;
function fresh(mode = 'hero', opts) {
  const E = loadEngine(opts);
  E.DEV.unlockAll = true;
  E.createGame({ mapIdx: 0, diffKey: 'medium', mode });
  E.game.cash = 100000;
  return E;
}
function spot(E, type, near) {
  const all = [];
  for (let x = 30; x < 940; x += 12) for (let y = 30; y < 580; y += 12) if (!E.spotProblem(type, x, y)) all.push([x, y]);
  if (near) all.sort((a, b) => Math.hypot(a[0] - near[0], a[1] - near[1]) - Math.hypot(b[0] - near[0], b[1] - near[1]));
  assert.ok(all.length, 'spot for ' + type);
  return all[0];
}
const place = (E, type, near = [260, 300]) => { const t = E.placeTower(type, ...spot(E, type, near)); assert.ok(t, 'placed ' + type); return t; };
/** Puts the hero on `level` and refreshes everything that depends on it. */
function setLevel(E, t, level) { t.heroXp = E.HERO_XP[level]; E.recalcAll(); }
/** A balloon on the road, `d` px along it. */
function spawn(E, type, d, o = {}) { const b = E.makeBalloon(type, d, o); E.game.balloons.push(b); return b; }
/** The distance along the first road closest to the tower. */
function roadAt(E, t) {
  let best = 0, bd = 1e9;
  for (let d = 0; d < E.game.paths[0].len; d += 4) { const p = E.posAt(E.game.paths[0], d), dd = Math.hypot(p.x - t.x, p.y - t.y); if (dd < bd) { bd = dd; best = d; } }
  return best;
}
/** Marks a round as running without any balloons of its own. */
function inRound(E) { Object.assign(E.game, { inRound: true, round: 3, spawnQ: [{ at: 1e9, type: 'red' }] }); }
const run = (E, seconds) => { for (let i = 0; i < Math.round(seconds / STEP); i++) E.update(STEP); };

test('four heroes, kept out of the tower shop and tower setup', () => {
  const E = fresh();
  assert.deepStrictEqual([...E.HERO_IDS], ['fern', 'ember', 'flint', 'willow']);
  assert.strictEqual(E.SHOP.length, 9);
  for (const id of E.HERO_IDS) {
    assert.ok(!E.SHOP.includes(id));
    assert.strictEqual(E.heroSkillList(id).filter(s => s[3] >= 0).length, 2, id);
  }
  assert.deepStrictEqual(Object.keys(E.cleanTwConfig({ at: 1, towers: { fern: { dmg: 500 }, dart: { dmg: 120 } } }).towers), ['dart']);
  assert.ok(!E.CHALLENGES.includes('hero'), 'never a daily challenge');
});

test('heroes only join Heroes mode, one per game, at the preview prices', () => {
  const std = fresh('standard');
  assert.match(std.shopProblem('fern'), /Heroes mode/);
  const E = fresh();
  assert.deepStrictEqual([...E.HERO_IDS].map(id => E.price(E.TD[id].cost, id)), [540, 725, 700, 650]);
  const fern = place(E, 'fern');
  assert.match(E.shopProblem('fern'), /already on the field/);
  assert.match(E.shopProblem('ember'), /already on the field/);
  assert.strictEqual(E.canUp(fern, 0), 'max');
  assert.strictEqual(E.upgrade(fern, 0), false);
  E.sellTower(fern); // sold before it fought: free to pick another
  assert.strictEqual(E.shopProblem('ember'), '');
  const ember = place(E, 'ember');
  E.startRound();
  E.sellTower(ember);
  assert.match(E.shopProblem('fern'), /Your hero this game is Ember Vale/);
  assert.strictEqual(E.shopProblem('ember'), '');
});

test('a hero levels up at the end of rounds: level 3 after round 5, level 10 after round 32', () => {
  const E = fresh();
  const t = place(E, 'fern');
  const levels = [];
  for (let r = 1; r <= 32; r++) { E.game.round = r; E.heroEndRound(); levels.push(E.heroLevel(t)); }
  assert.strictEqual(levels[3], 2);
  assert.strictEqual(levels[4], 3);
  assert.strictEqual(levels[30], 9);
  assert.strictEqual(levels[31], 10);
  assert.ok(t.s.camo && t.s.count === 2 && t.s.burst === 30 && t.s.bm === 3);
});

test('a real round gives hero XP and no tower XP for the hero', () => {
  const E = fresh();
  E.DEV.unlockAll = false;
  E.game.ua = false;
  const t = place(E, 'fern');
  E.startRound();
  for (let i = 0; i < 60 * 120 && E.game.inRound; i++) E.update(STEP);
  assert.strictEqual(E.game.inRound, false);
  assert.strictEqual(t.heroXp, E.heroRoundXp(1));
  assert.ok(t.pops > 0, 'the hero popped balloons');
  assert.ok(!E.TPROG.fern, 'no tower XP');
});

test('abilities need the level, a running round and a recharge', () => {
  const E = fresh();
  const t = place(E, 'fern');
  assert.match(E.heroAbilityProblem(0), /level 3/);
  setLevel(E, t, 3);
  assert.match(E.heroAbilityProblem(0), /during a round/);
  assert.match(E.heroAbilityProblem(1), /level 10/);
  inRound(E);
  assert.strictEqual(E.useHeroAbility(0), true);
  assert.strictEqual(E.heroCdLeft(0), 60);
  assert.match(E.heroAbilityProblem(0), /Recharging/);
  E.sellTower(t);
  const again = place(E, 'fern');
  setLevel(E, again, 3);
  assert.match(E.heroAbilityProblem(0), /Recharging/, 'selling and buying again doesn\'t reset it');
});

test('Fern: Split Shot picks 3 balloons, Arrow Rain needs a spot and spares lead', () => {
  const E = fresh();
  const t = place(E, 'fern');
  setLevel(E, t, 10);
  inRound(E);
  const d = roadAt(E, t);
  [-30, 0, 30].forEach(o => spawn(E, 'ceramic', d + o));
  assert.strictEqual(E.useHeroAbility(0), true);
  E.updateTower(t, STEP);
  assert.strictEqual(E.game.projs.length, 6, 'two arrows at each of three balloons');
  E.game.projs = [];
  assert.strictEqual(E.useHeroAbility(1), false, 'no spot picked');
  assert.strictEqual(E.heroCdLeft(1), 0);
  E.game.balloons = [];
  t.cd = 1e9;
  const c = spawn(E, 'ceramic', d), lead = spawn(E, 'lead', d);
  c.hp = c.maxHp = 100;
  c.frozen = lead.frozen = 100; // stays under the arrows
  assert.strictEqual(E.useHeroAbility(1, c.x, c.y), true);
  run(E, 1.6);
  assert.strictEqual(c.hp, 100 - 12, '3 waves of 4');
  assert.ok(!lead.dead && lead.type === 'lead');
  assert.strictEqual(E.game.heroFx.length, 0);
});

test('Fern: every 3rd shot bursts, and not on lead', () => {
  const E = fresh();
  const t = place(E, 'fern');
  setLevel(E, t, 7);
  inRound(E);
  spawn(E, 'ceramic', roadAt(E, t));
  const bursts = [];
  for (let i = 0; i < 3; i++) { E.game.projs = []; t.cd = 0; E.updateTower(t, STEP); bursts.push(E.game.projs[0].burst); }
  assert.deepStrictEqual(bursts, [0, 0, 30]);
  E.game.balloons = [];
  const b = spawn(E, 'green', 200), lead = spawn(E, 'lead', 200);
  E.heroBurst({ x: b.x, y: b.y, burst: 30, dmg: 1, hit: new Set(), camo: true, src: t, bm: 1 });
  assert.ok(b.dead && !lead.dead);
});

test('Ember: Kindle turns nearby darts into fire with +1 pierce; Wildfire reaches everything', () => {
  const E = fresh();
  const t = place(E, 'ember');
  const dart = place(E, 'dart', [t.x + 50, t.y]), far = place(E, 'dart', [900, 560]);
  assert.strictEqual(dart.s.dtype, 'sharp');
  setLevel(E, t, 4);
  assert.deepStrictEqual([dart.s.dtype, dart.s.pierce, far.s.dtype, far.s.pierce], ['fire', 4, 'sharp', 3]);
  setLevel(E, t, 10);
  assert.deepStrictEqual([t.s.pierce, t.s.range], [4, 120]);
  inRound(E);
  const camo = spawn(E, 'ceramic', 2000, { camo: true }), lead = spawn(E, 'lead', 100);
  assert.strictEqual(E.useHeroAbility(1), true);
  assert.strictEqual(camo.hp, 10 - 3);
  assert.ok(lead.dead, 'fire pops lead');
  assert.deepStrictEqual([far.s.dtype, far.s.pierce, dart.s.pierce], ['fire', 4, 4], 'all towers, no double bonus');
  E.game.balloons = [];
  run(E, 8.1);
  assert.deepStrictEqual([far.s.dtype, far.s.pierce, dart.s.pierce], ['sharp', 3, 4]);
  E.sellTower(t);
  assert.deepStrictEqual([dart.s.dtype, dart.s.pierce], ['sharp', 3]);
});

test('Ember: Spark Bottle burns the road, camo included', () => {
  const E = fresh();
  const t = place(E, 'ember');
  setLevel(E, t, 3);
  inRound(E);
  t.cd = 1e9;
  const b = spawn(E, 'ceramic', roadAt(E, t), { camo: true });
  b.hp = b.maxHp = 100;
  b.frozen = 100; // stays in the fire
  assert.strictEqual(E.useHeroAbility(0), true);
  run(E, 10.2);
  assert.ok(b.hp <= 81 && b.hp >= 80, 'about 20 damage over 10 s, got ' + (100 - b.hp));
  assert.strictEqual(E.game.heroFx.length, 0);
});

test('Ember: Spark Bottle still lands on the road with no balloon in range', () => {
  const E = fresh();
  const t = place(E, 'ember', [900, 560]);
  setLevel(E, t, 3);
  inRound(E);
  assert.strictEqual(E.useHeroAbility(0), true);
  const e = E.game.heroFx[0];
  assert.ok(E.distToPaths(E.game.paths, e.x, e.y) < 2);
});

test('Flint: black is immune until Armor Cracker; the Dazer Shell stuns', () => {
  const E = fresh();
  const t = place(E, 'flint');
  setLevel(E, t, 3);
  inRound(E);
  t.cd = 1e9;
  const d = roadAt(E, t), black = spawn(E, 'black', d);
  E.explode({ x: black.x, y: black.y, blast: 35, pierce: 10, dmg: 2, bm: 1, stun: 0, cluster: 0, src: t, crack: t.s.crack });
  assert.ok(!black.dead);
  E.game.balloons = [];
  const c = spawn(E, 'ceramic', d);
  assert.strictEqual(E.useHeroAbility(0), true);
  for (let i = 0; i < 120 && E.game.heroFx.length; i++) E.update(STEP);
  assert.strictEqual(c.hp, 7);
  assert.ok(c.frozen > 1.4);
  setLevel(E, t, 8);
  E.game.balloons = [];
  const black2 = spawn(E, 'black', d);
  E.explode({ x: black2.x, y: black2.y, blast: 35, pierce: 10, dmg: 2, bm: 1, stun: 0, cluster: 0, src: t, crack: t.s.crack });
  assert.ok(black2.dead);
});

test('Flint: no shell without a target, and Reload Order helps bomb towers', () => {
  const E = fresh();
  const t = place(E, 'flint');
  const bomb = place(E, 'bomb', [600, 300]);
  const slow = bomb.s.rate;
  setLevel(E, t, 10);
  assert.ok(Math.abs(bomb.s.rate - slow / 1.08) < 1e-9, 'Crew Drill');
  inRound(E);
  assert.strictEqual(E.useHeroAbility(0), false);
  assert.strictEqual(E.heroCdLeft(0), 0);
  E.game.abCd.bomb = 30;
  assert.strictEqual(E.useHeroAbility(1), true);
  assert.strictEqual(E.game.abCd.bomb, 15);
  assert.ok(Math.abs(bomb.s.rate - slow / 1.08 / 1.25) < 1e-9);
  run(E, 8.1);
  assert.ok(Math.abs(bomb.s.rate - slow / 1.08) < 1e-9);
});

test('Flint: with camo from a Signal Tower, the Dazer Shell reaches camo balloons', () => {
  const E = fresh();
  const t = place(E, 'flint');
  const sig = place(E, 'signal', [t.x + 60, t.y]);
  assert.strictEqual(E.upgrade(sig, 0), true); // Radar Dish
  setLevel(E, t, 3);
  assert.strictEqual(t.s.camo, true);
  inRound(E);
  t.cd = 1e9;
  const c = spawn(E, 'ceramic', roadAt(E, t), { camo: true });
  assert.strictEqual(E.useHeroAbility(0), true);
  for (let i = 0; i < 120 && E.game.heroFx.length; i++) E.update(STEP);
  assert.strictEqual(c.hp, 7);
});

test('Willow: sparks jump, roots and grove slow, Tesla gets help', () => {
  const E = fresh();
  const t = place(E, 'willow');
  const tesla = place(E, 'tesla', [t.x + 60, t.y]);
  const base = { rate: tesla.s.rate, chains: tesla.s.chains };
  setLevel(E, t, 10);
  assert.strictEqual(t.s.chains, 5);
  assert.ok(Math.abs(tesla.s.rate - base.rate / 1.1) < 1e-9 && tesla.s.chains === base.chains + 2);
  inRound(E);
  t.cd = tesla.cd = 1e9;
  assert.strictEqual(E.useHeroAbility(0), false, 'nothing to tangle');
  const d = roadAt(E, t), blue = spawn(E, 'blue', d), blimp = spawn(E, 'blimp', d), far = spawn(E, 'blue', 2200);
  const speed = E.balloonSpeed(blue);
  assert.strictEqual(E.useHeroAbility(0), true);
  assert.ok(Math.abs(E.balloonSpeed(blue) - speed / 2) < 1e-9);
  assert.strictEqual(E.heroSlow(blimp), 1);
  assert.strictEqual(E.heroSlow(far), 1);
  E.damageBalloon(blue, 1, 'energy', t);
  assert.ok(E.game.balloons.some(b => b.type === 'red' && b.rootT > 0), 'the layer underneath stays tangled');
  assert.strictEqual(E.useHeroAbility(1), true);
  assert.strictEqual(E.heroSlow(blimp), 0.8);
  assert.strictEqual(E.heroSlow(far), 0.6);
  assert.strictEqual(E.heroSlow(spawn(E, 'boss', 100)), 1);
  E.game.balloons = [];
  run(E, 8.1);
  assert.strictEqual(E.heroSlow(spawn(E, 'blue', 100)), 1);
});

test('a Heroes game saves as v5 and resumes with the hero, its level and cooldowns', () => {
  const storage = fakeStorage();
  const E = fresh('hero', { storageObj: storage });
  const t = place(E, 'willow');
  setLevel(E, t, 10);
  E.game.heroId = 'willow';
  E.game.abCd['willow:1'] = 40;
  E.game.heroBuff.grove = 5;
  E.snapshot();
  const snap = E.savedRun();
  assert.strictEqual(snap.v, 5);
  const F = loadEngine({ storageObj: storage });
  F.createGame({ mapIdx: 0, diffKey: 'medium', mode: 'hero' }, F.savedRun());
  const h = F.heroTower();
  assert.deepStrictEqual([h.type, F.heroLevel(h), h.s.chains, F.heroCdLeft(1), F.game.heroId, F.game.heroBuff.grove], ['willow', 10, 5, 40, 'willow', 5]);
});

test('Standard saves stay v4, and a Heroes win gives no record, ranking or challenge star', () => {
  const S = fresh('standard');
  S.snapshot();
  assert.strictEqual(S.savedRun().v, 4);
  const E = fresh();
  place(E, 'fern');
  Object.assign(E.game, { round: E.game.diff.end, inRound: true });
  E.endRound();
  assert.ok(E.game.won);
  assert.deepStrictEqual(Object.keys(E.records()), []);
  assert.deepStrictEqual(Object.keys(E.runs()), []);
});

test('each hero can fight real rounds without errors', () => {
  for (const id of ['fern', 'ember', 'flint', 'willow']) {
    const E = fresh();
    const t = place(E, id);
    setLevel(E, t, 10);
    for (const type of ['dart', 'bomb', 'tesla', 'frost']) place(E, type);
    E.game.round = 29;
    E.startRound();
    for (let i = 0; i < 60 * 25 && E.game.inRound && !E.game.over; i++) {
      if (i % 120 === 60) {
        E.useHeroAbility(0);
        const b = E.game.balloons[0];
        if (b) E.useHeroAbility(1, b.x, b.y);
      }
      E.update(STEP);
    }
    assert.ok(t.pops > 0, id + ' popped balloons');
  }
});

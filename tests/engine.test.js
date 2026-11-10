'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadEngine, fakeStorage } = require('./harness');
const { playBot } = require('../tools/bot');

const MAP = { meadow: 0, pond: 2 };

function fresh(mapIdx = MAP.meadow, diffKey = 'medium', mode = 'standard', opts) {
  const E = loadEngine(opts);
  E.SETTINGS.unlockAll = true;
  E.createGame({ mapIdx, diffKey, mode });
  return E;
}
/** First valid build spot for `type` on the current map. */
function spot(E, type, from = 0) {
  for (let x = 30 + from; x < 940; x += 10) for (let y = 30; y < 580; y += 10) if (!E.spotProblem(type, x, y)) return [x, y];
  throw new Error('no spot for ' + type);
}
/** A balloon placed on the field `d` px along the first road. */
function spawn(E, type, o = {}, d = 300) {
  const b = E.makeBalloon(type, d, o);
  E.game.balloons.push(b);
  return b;
}
const alive = E => E.game.balloons.filter(b => !b.dead);

test('layer totals match the balloon table', () => {
  const E = loadEngine();
  const want = { red: 1, blue: 2, green: 3, yellow: 4, pink: 5, black: 11, white: 11, lead: 23, zebra: 23, rainbow: 47, ceramic: 104, blimp: 616, brute: 3164 };
  for (const [k, v] of Object.entries(want)) assert.strictEqual(E.RBE[k], v, k);
});

test('all 50 rounds parse, with camo at 24, blimp at 40, brute at 50, a boss every 10th', () => {
  const E = loadEngine();
  const first = {};
  for (let r = 1; r <= 50; r++) {
    const groups = E.roundGroups(r);
    assert.ok(groups.length > 0, 'round ' + r);
    for (const g of groups) {
      assert.ok(g.count > 0 && g.gap > 0 && E.BT[g.type], 'round ' + r + ' ' + g.type);
      const key = g.camo ? 'camo' : g.type;
      if (!(key in first)) first[key] = r;
    }
    assert.strictEqual(groups[0].type === 'boss', r % 10 === 0, 'boss on round ' + r);
  }
  assert.strictEqual(first.camo, 24);
  assert.strictEqual(first.blimp, 40);
  assert.strictEqual(first.brute, 50);
  const g = E.parseRound('20 crgreen .6, 3 flead 1');
  assert.deepStrictEqual([g[0].count, g[0].type, g[0].camo, g[0].regrow, g[1].type, g[1].fort], [20, 'green', true, true, 'lead', true]);
  assert.ok(E.roundGroups(63).length >= 3, 'freeplay rounds');
  assert.deepStrictEqual([10, 20, 30, 40, 50].map(r => E.bossHp(r)), [100, 350, 650, 2000, 5500]);
});

test('extra damage carries through layers, $1 per layer', () => {
  const E = fresh();
  const cash = E.game.cash;
  E.damageBalloon(spawn(E, 'pink'), 7, 'normal', null);
  assert.strictEqual(alive(E).length, 0);
  assert.strictEqual(E.game.cash - cash, 5);
  E.damageBalloon(spawn(E, 'pink'), 2, 'normal', null);
  assert.strictEqual(alive(E).map(b => b.type).join(), 'green');
});

test('immunities: lead vs sharp, black vs explosive, white vs freeze', () => {
  const E = fresh();
  assert.strictEqual(E.damageBalloon(spawn(E, 'lead'), 1, 'sharp', null), -1);
  assert.strictEqual(E.damageBalloon(spawn(E, 'black'), 1, 'explosive', null), -1);
  assert.strictEqual(E.damageBalloon(spawn(E, 'white'), 1, 'freeze', null), -1);
  assert.strictEqual(E.damageBalloon(spawn(E, 'zebra'), 1, 'explosive', null), -1);
  assert.strictEqual(E.damageBalloon(spawn(E, 'lead'), 1, 'normal', null), 1);
});

test('camo: only detectors target it, explosions hit it regardless', () => {
  const E = fresh();
  E.game.cash = 1e6;
  const b = spawn(E, 'red', { camo: true });
  const [x, y] = spot(E, 'dart');
  const t = E.placeTower('dart', x, y);
  assert.strictEqual(E.canSee(t, b), false);
  E.upgrade(t, 1); E.upgrade(t, 1); E.upgrade(t, 1); // Eagle Eye
  assert.strictEqual(E.canSee(t, b), true);
  const c = spawn(E, 'red', { camo: true }, 500);
  E.explode({ x: c.x, y: c.y, blast: 40, pierce: 10, dmg: 1, src: null, bm: 1, cluster: 0 });
  assert.strictEqual(c.dead, true);
  assert.strictEqual(E.makeBalloon('blimp', 0, { camo: true }).camo, false, 'blimps are never camo');
});

test('fortified balloons have double health; fortified lead takes 4 hits', () => {
  const E = fresh();
  assert.strictEqual(E.makeBalloon('ceramic', 0, { fort: true }).hp, 20);
  assert.strictEqual(E.makeBalloon('blimp', 0, { fort: true }).hp, 400);
  const lead = spawn(E, 'lead', { fort: true });
  assert.strictEqual(lead.hp, 4);
  for (let i = 0; i < 3; i++) E.damageBalloon(lead, 1, 'normal', null);
  assert.strictEqual(lead.dead, false);
  E.damageBalloon(lead, 1, 'normal', null);
  assert.strictEqual(lead.dead, true);
  assert.ok(alive(E).every(b => !b.fort), 'children are not fortified');
  assert.strictEqual(E.makeBalloon('red', 0, { fort: true }).fort, false);
});

test('regrow grows back one layer after 2.5 s, never past its original type', () => {
  const E = fresh();
  E.damageBalloon(spawn(E, 'green', { regrow: true }), 1, 'normal', null);
  const kid = alive(E)[0];
  assert.strictEqual(kid.type, 'blue');
  kid.frozen = 99; // hold it in place
  for (let i = 0; i < 24; i++) E.update(0.1);
  assert.strictEqual(kid.type, 'blue', 'not yet');
  for (let i = 0; i < 4; i++) E.update(0.1);
  assert.strictEqual(kid.type, 'green');
  for (let i = 0; i < 60; i++) E.update(0.1);
  assert.strictEqual(kid.type, 'green', 'capped at the original type');
  assert.strictEqual(E.makeBalloon('lead', 0, { regrow: true }).regrow, false, 'only red to pink regrow');
});

test('selling refunds 100% since the round started, 70% otherwise', () => {
  const E = fresh();
  const [x, y] = spot(E, 'dart');
  const t = E.placeTower('dart', x, y);
  E.upgrade(t, 0);
  assert.strictEqual(E.sellValue(t), 200 + 140);
  E.startRound();
  assert.strictEqual(E.sellValue(t), Math.floor(340 * 0.7));
  E.game.inRound = false;
  E.upgrade(t, 0);
  assert.strictEqual(E.sellValue(t), 260 + Math.floor(340 * 0.7));
  const cash = E.game.cash;
  E.sellTower(t);
  assert.strictEqual(E.game.cash - cash, 260 + Math.floor(340 * 0.7));
  assert.strictEqual(E.game.towers.length, 0);
});

test('only one path may go past tier 1', () => {
  const E = fresh();
  E.game.cash = 1e6;
  const [x, y] = spot(E, 'dart');
  const t = E.placeTower('dart', x, y);
  assert.ok(E.upgrade(t, 0) && E.upgrade(t, 0));
  assert.ok(E.upgrade(t, 1), 'tier 1 on the other path is fine');
  assert.strictEqual(E.canUp(t, 1), 'locked');
  assert.ok(E.upgrade(t, 0));
  assert.strictEqual(E.canUp(t, 0), 'max');
  assert.ok(E.hasAbility(t));
});

test('No Tier 3, Primary Only and level-locked rules', () => {
  const E = fresh(MAP.meadow, 'medium', 'notier3');
  E.game.cash = 1e6;
  const [x, y] = spot(E, 'dart');
  const t = E.placeTower('dart', x, y);
  E.upgrade(t, 0); E.upgrade(t, 0);
  assert.strictEqual(E.canUp(t, 0), 'mode');
  const P = fresh(MAP.meadow, 'medium', 'primary');
  assert.strictEqual(P.shopProblem('dart'), '');
  assert.match(P.shopProblem('sniper'), /Primary Only/);
  const L = loadEngine();
  L.createGame({ mapIdx: MAP.meadow, diffKey: 'medium' });
  assert.strictEqual(L.isUnlocked('dart'), true);
  assert.strictEqual(L.isUnlocked('frost'), false, 'Frost needs level 2');
  assert.match(L.shopProblem('mine'), /level 6/);
});

test('Signal buffs: strongest of each kind applies, never stacked', () => {
  const E = fresh();
  const g = E.game;
  const dart = E.newTower('dart', 300, 300);
  const a = E.newTower('signal', 340, 300), b = E.newTower('signal', 260, 300), far = E.newTower('signal', 900, 50);
  a.lv = [2, 0]; // camo + 20% speed
  b.lv = [1, 2]; // camo + bigger aura + 15% range
  g.towers.push(dart, a, b, far);
  E.recalcAll();
  const base = E.statsFor('dart', [0, 0]);
  assert.strictEqual(dart.buffed, true);
  assert.strictEqual(dart.s.camo, true);
  assert.ok(Math.abs(dart.s.rate - base.rate / 1.2) < 1e-9, 'rate buff from one tower only');
  assert.strictEqual(dart.s.range, Math.round(base.range * 1.15));
  a.lv = [2, 0]; b.lv = [2, 0];
  E.recalcAll();
  assert.ok(Math.abs(dart.s.rate - base.rate / 1.2) < 1e-9, 'two equal buffs do not stack');
  assert.strictEqual(a.buffed, false, 'support towers are not buffed');
});

test('Gunboat builds only on water', () => {
  const E = fresh(MAP.pond);
  const w = E.game.map.blocks.find(b => b.k === 'water');
  assert.strictEqual(E.spotProblem('boat', w.x, w.y), '');
  assert.match(E.spotProblem('dart', w.x, w.y), /Only Gunboats/);
  const [x, y] = spot(E, 'dart');
  assert.match(E.spotProblem('boat', x, y), /water/);
  const D = fresh(MAP.meadow);
  assert.match(D.shopProblem('boat'), /no water/);
});

test('Colossus splits at 75/50/25% and releases 4 on death', () => {
  const E = fresh();
  E.game.round = 10;
  const boss = spawn(E, 'boss');
  assert.strictEqual(boss.hp, 100);
  E.damageBalloon(boss, 26, 'normal', null);
  assert.strictEqual(alive(E).length, 1 + 3);
  assert.ok(Math.abs(boss.spdMul - 1.15) < 1e-9);
  E.damageBalloon(boss, 50, 'normal', null); // 24 hp left: two more stages
  assert.strictEqual(boss.bossStage, 3);
  assert.strictEqual(alive(E).length, 1 + 9);
  E.damageBalloon(boss, 24, 'normal', null);
  assert.strictEqual(boss.dead, true);
  assert.strictEqual(alive(E).length, 9 + 4);
  assert.ok(alive(E).every(b => b.type === 'yellow'));
  assert.strictEqual(E.leakValue(E.makeBalloon('boss', 0)), 100, 'a leaking boss costs its remaining health');
});

test('mid-round save and restore keeps balloons, towers and buffs', () => {
  const storageObj = fakeStorage();
  const E = fresh(MAP.meadow, 'medium', 'standard', { storageObj });
  E.game.cash = 5000;
  const [sx, sy] = spot(E, 'signal');
  assert.ok(E.placeTower('signal', sx, sy));
  assert.ok(E.placeTower('dart', ...spot(E, 'dart')));
  assert.ok(E.game.towers[1].buffed, 'dart is inside the aura');
  E.game.round = 11;
  E.startRound();
  for (let i = 0; i < 120; i++) E.update(1 / 30);
  const n = alive(E).length;
  assert.ok(n > 5, 'balloons on the field');
  E.snapshot();
  const E2 = loadEngine({ storageObj });
  const run = E2.savedRun();
  assert.ok(run && run.inRound);
  E2.createGame({ mapIdx: E2.MAPS.findIndex(m => m.id === run.mapId), diffKey: run.diffKey, mode: run.mode, daily: run.daily }, run);
  assert.strictEqual(E2.game.balloons.length, n);
  assert.strictEqual(E2.game.round, 12);
  assert.strictEqual(E2.game.inRound, true);
  assert.strictEqual(E2.game.towers.length, 2);
  assert.strictEqual(E2.game.towers.find(t => t.type === 'dart').buffed, true);
  assert.strictEqual(Math.floor(E2.game.cash), Math.floor(E.game.cash));
  E2.clearRun();
  assert.strictEqual(E2.savedRun(), null);
});

test('levels, XP curve and daily seed', () => {
  const E = loadEngine();
  assert.deepStrictEqual([0, 499, 500, 1499, 1500, 3000].map(x => E.levelOf(x)), [1, 1, 2, 2, 3, 4]);
  E.addXP(600);
  assert.strictEqual(E.playerLevel(), 2);
  assert.ok(E.log.some(e => e.ev === 'level' && e.lv === 2));
  const a = E.dailyConfig('2026-11-11'), b = loadEngine().dailyConfig('2026-11-11');
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b), 'same for everyone on the same day');
  assert.ok(a.mapIdx >= 0 && a.mapIdx < E.MAPS.length && E.DIFF[a.diffKey] && E.MODES[a.mode]);
  const days = new Set(Array.from({ length: 10 }, (_, i) => JSON.stringify(E.dailyConfig('2026-12-' + String(i + 1).padStart(2, '0')))));
  assert.ok(days.size > 5, 'varies by day');
  assert.strictEqual(loadEngine({ storage: false }).records().constructor.name, 'Object', 'runs with storage blocked');
});

test('a 15-round bot game runs cleanly and pays round bonuses', () => {
  const E = loadEngine();
  const r = playBot(E, 'meadow', 'easy', 'standard', { maxRounds: 15 });
  assert.strictEqual(r.round, 15);
  assert.ok(!E.game.over && r.lives > 150, 'lives ' + r.lives);
  assert.ok(r.towers >= 3);
  const done = E.log.filter(e => e.ev === 'toast' && /complete/.test(e.msg));
  assert.strictEqual(done.length, 15);
  assert.match(done[14].msg, /\+\$330/, '150 + 12 x 15');
});

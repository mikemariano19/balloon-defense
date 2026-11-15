'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadEngine, fakeStorage } = require('./harness');
const { playBot } = require('../tools/bot');

const MAP = { meadow: 0, pond: 2 };
const mapIdx = (E, id) => E.MAPS.findIndex(m => m.id === id);

function fresh(mapIdx = MAP.meadow, diffKey = 'medium', mode = 'standard', opts) {
  const E = loadEngine(opts);
  E.DEV.unlockAll = true;
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

test('all 100 rounds parse, with camo at 24, blimp at 40, brute at 50, a boss every 10th', () => {
  const E = loadEngine();
  assert.strictEqual(E.LAST_ROUND, 100);
  const first = {};
  for (let r = 1; r <= 100; r++) {
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
  assert.ok(E.roundGroups(113).length >= 3, 'freeplay rounds');
  assert.deepStrictEqual([10, 20, 30, 40, 50].map(r => E.bossHp(r)), [100, 350, 650, 2000, 5500]);
  assert.deepStrictEqual(Object.values(E.DIFF).map(d => d.end), [40, 60, 80, 100]);
  assert.strictEqual(E.DIFF.nightmare.lives, 1);
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

test('one ability per tower type: only the first tower of a type to reach tier 3 holds it', () => {
  const E = fresh();
  E.game.cash = 1e7;
  const a = E.placeTower('dart', ...spot(E, 'dart'));
  const b = E.placeTower('dart', ...spot(E, 'dart', 300));
  const c = E.placeTower('tack', ...spot(E, 'tack', 500));
  for (let i = 0; i < 3; i++) E.upgrade(b, 0);             // b reaches tier 3 first
  for (let i = 0; i < 4; i++) E.upgrade(a, 0);             // a goes even higher, later
  for (let i = 0; i < 3; i++) E.upgrade(c, 0);
  assert.strictEqual(E.abilityHolder('dart'), a, 'holder is the first in build order among eligible towers');
  assert.ok(E.hasAbility(a) && !E.hasAbility(b) && E.hasAbility(c));
  assert.deepStrictEqual(Array.from(b.lv), [3, 0, 0], 'the other tower still gets the tier-3 upgrade itself');
  assert.match(E.abilityProblem(b), /Another Dart Tower already has/);
  E.startRound();
  assert.strictEqual(E.useAbility(b), false);
  assert.ok(E.useAbility(a));
  assert.match(E.abilityProblem(a), /Recharging/);
  assert.strictEqual(E.abilityProblem(c), '', 'other tower types are not affected');
  // selling the holder passes the ability on, but keeps the cooldown (no reset by selling)
  E.sellTower(a);
  assert.strictEqual(E.abilityHolder('dart'), b);
  assert.ok(E.hasAbility(b));
  assert.match(E.abilityProblem(b), /Recharging/);
  // the cooldown survives save + load, and recharges during rounds
  const left = E.abCdLeft('dart');
  E.snapshot();
  E.createGame({ mapIdx: 0, diffKey: 'medium' }, E.savedRun());
  assert.ok(Math.abs(E.abCdLeft('dart') - left) < 1e-6);
  assert.ok(E.hasAbility(E.game.towers.find(t => t.type === 'dart')));
  E.game.inRound = true;
  E.game.abCd.dart = 0.05;
  E.update(0.1);
  assert.strictEqual(E.abCdLeft('dart'), 0);
});

test('path rule: one path to tier 5, a second to tier 2, the third closed; one tier 5 per path', () => {
  const E = fresh();
  E.game.cash = 1e7;
  const t = E.placeTower('dart', ...spot(E, 'dart'));
  for (let i = 0; i < 4; i++) assert.ok(E.upgrade(t, 0), 'path 1 tier ' + (i + 1));
  assert.ok(E.upgrade(t, 1) && E.upgrade(t, 1), 'second path to tier 2');
  assert.strictEqual(E.canUp(t, 1), 'closed', 'second path stops at tier 2');
  assert.strictEqual(E.canUp(t, 2), 'closed', 'third path is closed');
  assert.ok(E.upgrade(t, 0));
  assert.strictEqual(E.canUp(t, 0), 'max');
  assert.deepStrictEqual(Array.from(t.lv), [5, 2, 0]);
  assert.strictEqual(E.abPower(t), 2, 'ability is stronger past tier 3');
  const u = E.placeTower('dart', ...spot(E, 'dart', 300));
  for (let i = 0; i < 4; i++) E.upgrade(u, 0);
  assert.strictEqual(E.canUp(u, 0), 'unique', 'only one tier-5 per path per game');
  const v = E.placeTower('dart', ...spot(E, 'dart', 500));
  E.upgrade(v, 2); E.upgrade(v, 2); E.upgrade(v, 2);
  assert.strictEqual(E.abPower(v), 1);
  assert.strictEqual(E.canUp(v, 0), 'ok', 'tier 1 on another path is fine');
  E.upgrade(v, 0);
  assert.strictEqual(E.canUp(v, 1), 'closed');
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

test('tower XP: earned per round and per pops, unlocks tiers 3-5 in order', () => {
  const E = loadEngine();
  E.createGame({ mapIdx: MAP.meadow, diffKey: 'medium' });
  E.game.cash = 1e6;
  const t = E.placeTower('dart', ...spot(E, 'dart'));
  E.upgrade(t, 0); E.upgrade(t, 0);
  assert.strictEqual(E.canUp(t, 0), 'xp', 'tier 3 needs XP');
  assert.match(E.unlockProblem('dart', 0, 3), /500/);
  assert.match(E.unlockProblem('dart', 0, 4), /tier 3 first/);
  t.pops = 45;
  E.startRound();
  E.game.spawnQ = []; E.game.balloons = [];
  E.update(0.01); // round ends
  assert.strictEqual(E.tprog('dart').xp, 10 + 2, '10 per round on the field + 1 per 20 pops');
  assert.strictEqual(t.xpPops, 40, 'leftover pops carry to the next round');
  E.tprog('dart').xp = 6000; E.tprog('dart').total = 6000;
  assert.ok(E.unlockTier('dart', 0, 3));
  assert.strictEqual(E.tprog('dart').xp, 5500);
  assert.strictEqual(E.canUp(t, 0), 'ok');
  assert.ok(E.unlockTier('dart', 0, 4) && E.unlockTier('dart', 0, 5));
  assert.strictEqual(E.tprog('dart').xp, 0);
  assert.strictEqual(E.tierUnlocked('dart', 1, 3), false, 'unlocks are per path');
  assert.strictEqual(E.towerLevel('dart'), 7, 'level from total XP ever earned');
  // Unlock All: everything open, no XP earned
  const U = fresh();
  U.game.cash = 1e6;
  const u = U.placeTower('dart', ...spot(U, 'dart'));
  U.startRound(); U.game.spawnQ = []; U.update(0.01);
  assert.strictEqual(U.tprog('dart').xp, 0);
  assert.strictEqual(U.game.ua, true);
  assert.strictEqual(U.tierUnlocked('dart', 2, 5), true);
  assert.ok(u);
});

test('skill points: one per tower level, capped perks change stats and prices', () => {
  const E = loadEngine();
  E.tprog('dart').total = E.towerXpForLevel(10);
  assert.strictEqual(E.towerLevel('dart'), 10);
  assert.strictEqual(E.skillPoints('dart'), 10);
  for (let i = 0; i < 7; i++) E.setPerk('dart', 'range', 1);
  assert.strictEqual(E.perkAlloc('dart').range, 5, 'range perk caps at +10%');
  for (let i = 0; i < 9; i++) E.setPerk('dart', 'cost', 1);
  assert.strictEqual(E.spentPoints('dart'), 10, 'cannot spend more than the level gives');
  E.createGame({ mapIdx: MAP.meadow, diffKey: 'medium' });
  const s = E.statsFor('dart', [0, 0, 0]);
  assert.strictEqual(s.range, Math.round(125 * 1.10));
  assert.strictEqual(E.price(200, 'dart'), 180, '5 cost points = -10%');
  assert.strictEqual(E.price(200, 'tack'), 200);
  E.resetPerks('dart');
  assert.strictEqual(E.spentPoints('dart'), 0, 'free reset');
});

test('tile grid: towers snap to tiles; small towers are 2x2, big ones 3x3', () => {
  const E = fresh();
  E.game.cash = 1e6;
  assert.strictEqual(E.COLS, 40); assert.strictEqual(E.ROWS, 25);
  const [x, y] = spot(E, 'dart');
  const t = E.placeTower('dart', x + 5, y + 3);
  assert.strictEqual((t.x - 24) % 24, 0, 'centre of a 2x2 sits on a tile corner');
  const b = E.placeTower('bomb', ...spot(E, 'bomb', 200));
  assert.strictEqual((b.x - 36) % 24, 0, 'centre of a 3x3 sits on a tile centre');
  assert.match(E.spotProblem('dart', t.x + 20, t.y), /another tower/, 'footprints cannot overlap');
  assert.strictEqual(E.spotProblem('dart', t.x + 48, t.y) === '' || !/another tower/.test(E.spotProblem('dart', t.x + 48, t.y)), true, 'touching is fine');
  const road = E.game.paths[0].segs[1];
  assert.match(E.spotProblem('dart', road.x1, (road.y1 + road.y2) / 2), /road/);
  assert.match(E.spotProblem('dart', 5, 5), /edge/);
});

test('line of sight: tall scenery blocks straight shots and sniper aim, not lobbed bombs', () => {
  const E = fresh(mapIdx(loadEngine(), 'market'));
  const g = E.game;
  assert.ok(g.blockers.length >= 8, 'market stalls are tall blockers');
  const prop = g.deco.find(o => o.prop && o.type === 'stall' && o.x === 420);
  const stall = g.blockers.find(b => b.id === prop.id);
  const t = E.newTower('sniper', stall.x - 80, stall.y);
  g.towers.push(t);
  E.recalcAll();
  assert.ok(t.blk.includes(stall));
  assert.strictEqual(E.inSight(t, stall.x + 80, stall.y), false, 'hidden behind the stall');
  assert.strictEqual(E.inSight(t, stall.x - 80, stall.y - 90), true);
  const bomb = E.newTower('bomb', stall.x - 80, stall.y);
  g.towers.push(bomb);
  E.recalcAll();
  assert.strictEqual(bomb.blk.length, 0, 'bombs are lobbed over scenery');
  assert.strictEqual(E.sightBlocked(E.statsFor('frost', [0, 0, 0])), false, 'frost pulses ignore sight');
  // a balloon behind the stall can't be targeted
  const b = E.makeBalloon('red', 0); b.x = stall.x + 80; b.y = stall.y; g.balloons = [b];
  t.cd = 0; E.updateTower(t, 0.01);
  assert.strictEqual(b.dead, false);
  // clearing the stall for cash opens the view
  g.cash = 5000;
  const before = g.cash;
  assert.ok(E.clearScenery(stall.id));
  assert.ok(g.cash < before && before - g.cash >= 300 && before - g.cash <= 1500);
  assert.strictEqual(E.inSight(t, stall.x + 80, stall.y), true);
  t.cd = 0; E.updateTower(t, 0.01);
  assert.strictEqual(b.dead, true);
});

test('Signal buffs: strongest of each kind applies, never stacked', () => {
  const E = fresh();
  const g = E.game;
  const dart = E.newTower('dart', 300, 300);
  const a = E.newTower('signal', 340, 300), b = E.newTower('signal', 260, 300), far = E.newTower('signal', 900, 50);
  a.lv = [2, 0, 0]; // camo + 20% speed
  b.lv = [1, 2, 0]; // camo + bigger aura + 15% range
  g.towers.push(dart, a, b, far);
  E.recalcAll();
  const base = E.statsFor('dart', [0, 0, 0]);
  assert.strictEqual(dart.buffed, true);
  assert.strictEqual(dart.s.camo, true);
  assert.ok(Math.abs(dart.s.rate - base.rate / 1.2) < 1e-9, 'rate buff from one tower only');
  assert.strictEqual(dart.s.range, Math.round(base.range * 1.15));
  a.lv = [2, 0, 0]; b.lv = [2, 0, 0];
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
  const sig = E.placeTower('signal', sx, sy);
  assert.ok(sig);
  assert.ok(E.placeTower('dart', sig.x + 60, sig.y) || E.placeTower('dart', sig.x, sig.y + 60) || E.placeTower('dart', ...spot(E, 'dart')));
  assert.ok(E.game.towers[1].buffed, 'dart is inside the aura');
  E.game.round = 11;
  E.startRound();
  for (let i = 0; i < 120; i++) E.update(1 / 30);
  const n = alive(E).length;
  assert.ok(n > 5, 'balloons on the field');
  E.snapshot();
  const E2 = loadEngine({ storageObj });
  const run = E2.savedRun();
  assert.ok(run && run.inRound && run.v === 4);
  E2.createGame({ mapIdx: E2.MAPS.findIndex(m => m.id === run.mapId), diffKey: run.diffKey, mode: run.mode, daily: run.daily }, run);
  assert.strictEqual(E2.game.balloons.length, n);
  assert.strictEqual(E2.game.round, 12);
  assert.strictEqual(E2.game.inRound, true);
  assert.strictEqual(E2.game.towers.length, 2);
  assert.strictEqual(E2.game.towers.find(t => t.type === 'dart').buffed, true);
  assert.strictEqual(Math.floor(E2.game.cash), Math.floor(E.game.cash));
  assert.ok(Math.abs(E2.game.clock - E.game.clock) < 1e-6, 'game clock survives a save');
  E2.clearRun();
  assert.strictEqual(E2.savedRun(), null);
});

test('v3 saves and records carry over', () => {
  const storageObj = fakeStorage();
  storageObj.setItem('balloonDefense.v2', JSON.stringify({
    records: { meadow: { hard: { best: 50, won: true } } },
    profile: { xp: 3000, games: 9, wins: 2, pops: 12345 },
    run: { v: 3, mapId: 'meadow', diffKey: 'medium', mode: 'standard', round: 7, lives: 140, cash: 900, towers: [{ type: 'dart', x: 260, y: 200, lv: [3, 1], spent: 2000 }], inRound: false }
  }));
  const E = loadEngine({ storageObj });
  assert.strictEqual(E.badgeCount(), 1, 'v3 medal becomes a map badge');
  assert.strictEqual(E.PROFILE.pops, 12345);
  assert.strictEqual(E.PROFILE.finished, 0);
  const run = E.savedRun();
  E.createGame({ mapIdx: 0, diffKey: run.diffKey, mode: run.mode }, run);
  assert.deepStrictEqual(Array.from(E.game.towers[0].lv), [3, 1, 0]);
  assert.ok(E.hasAbility(E.game.towers[0]));
});

test('run ranking: cleared, then fewer lives lost, then faster game clock, then earlier', () => {
  const E = loadEngine();
  const r = (o) => Object.assign({ map: 'meadow', diff: 'easy', ua: false, cleared: true, round: 40, livesLost: 0, livesLeft: 200, clock: 1000, at: 1 }, o);
  const list = [r({ cleared: false, round: 39, livesLost: 0 }), r({ livesLost: 3 }), r({ clock: 900, at: 5 }), r({ clock: 900, at: 2 }), r({ cleared: false, round: 39, livesLeft: 50 }), r({ cleared: false, round: 12 })];
  const sorted = list.slice().sort(E.compareRuns);
  assert.deepStrictEqual(sorted.map(x => list.indexOf(x)), [3, 2, 1, 0, 4, 5]);
  assert.strictEqual(E.saveRun(r({ clock: 1200 })), true);
  assert.strictEqual(E.saveRun(r({ clock: 1300 })), false, 'slower run is not a new best');
  assert.strictEqual(E.saveRun(r({ clock: 1100 })), true);
  assert.strictEqual(E.bestRun('meadow', 'easy', false).clock, 1100);
  assert.strictEqual(E.bestRun('meadow', 'easy', true), null, 'Unlock All runs are kept apart');
  E.saveRun(r({ diff: 'medium', livesLost: 2 }));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(E.tierScore('beginner', false))), { score: 100 * 1.5 + 200, clock: 2100, stages: 2 });
});

test('a finished game is submitted once with game-clock time, and counts toward win rate', () => {
  const E = fresh(MAP.meadow, 'easy');
  E.DEV.unlockAll = false;
  E.game.ua = false;
  E.game.round = 39;
  E.game.clock = 777;
  E.startRound(); E.game.spawnQ = []; E.update(0.5);
  assert.strictEqual(E.game.won, true);
  const best = E.bestRun('meadow', 'easy', false);
  assert.ok(best && best.cleared && best.livesLost === 0);
  assert.ok(Math.abs(best.clock - 777.5) < 0.02, 'clock ' + best.clock);
  assert.strictEqual(E.PROFILE.finished, 1);
  assert.strictEqual(E.PROFILE.perfect, 1);
  assert.strictEqual(E.winRate(), 1);
  assert.strictEqual(E.submitRun(), null, 'only once');
});

test('profile: names, IDs, avatars, titles and borders', () => {
  const E = loadEngine();
  assert.strictEqual(E.nameProblem('Mike'), '');
  assert.match(E.nameProblem('ab'), /3 to 16/);
  assert.match(E.nameProblem('bad<name>'), /only/);
  assert.match(E.nameProblem('fuckface'), /different/);
  const p = E.createProfile({ name: 'Pop Star', animal: 'owl', style: 'f' });
  assert.match(p.tag, /^\d{4}$/);
  assert.strictEqual(E.hasProfile(), true);
  for (const a of E.ANIMALS) for (const s of ['m', 'f']) assert.match(E.avatarSVG({ animal: a.id, style: s, bg: 'night', border: 'legend' }), /^<svg[\s\S]*<\/svg>$/);
  assert.strictEqual(E.ANIMALS.length * 2, 24);
  assert.strictEqual(E.AVATAR_BGS.length, 10);
  assert.strictEqual(E.BORDERS.filter(b => b.free).length, 10);
  assert.strictEqual(E.TITLES.length, 10);
  E.PROFILE.pops = 60e6;
  assert.strictEqual(E.unlockedTitles().length, 8);
  assert.strictEqual(E.borderUnlocked(E.borderById('slayer')), true);
  assert.strictEqual(E.borderUnlocked(E.borderById('warlord')), false);
  assert.strictEqual(E.currentTitle().id, 'rookie', 'title must be equipped');
});

test('backup code round-trips all progress and detects damage', () => {
  const E = loadEngine();
  E.createProfile({ name: 'Backup Test' });
  E.PROFILE.pops = 4242; E.saveProfile();
  const code = E.backupCode();
  assert.match(code, /^BD4-[0-9a-f]{8}\n/);
  const ok = E.parseBackup('some notes\r\n' + code.replace(/\n/g, '\r\n') + '\r\nmore');
  assert.ok(ok.ok, ok.error);
  assert.strictEqual(ok.data.profile.pops, 4242);
  assert.strictEqual(ok.data.id.name, 'Backup Test');
  const bad = code.replace(/\n([A-Za-z])/, (m, c) => '\n' + (c === 'A' ? 'B' : 'A'));
  assert.strictEqual(E.parseBackup(bad).ok, false);
  assert.strictEqual(E.parseBackup('hello').ok, false);
  const F = loadEngine();
  F.restoreBackup(ok.data);
  assert.strictEqual(F.store.get('profile', {}).pops, 4242);
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

test('every map builds: paths stay clear of blocks, props off the road, room for towers', () => {
  const E0 = loadEngine();
  assert.strictEqual(E0.MAPS.length, 20);
  for (const m of E0.MAPS) {
    const E = fresh(E0.MAPS.indexOf(m));
    const g = E.game;
    let free = 0;
    for (const v of g.grid) if (v === 0) free++;
    assert.ok(free > 250, m.id + ' has build space (' + free + ' tiles)');
    for (const o of g.deco.filter(o => o.prop)) assert.ok(E.distToPaths(g.paths, o.x, o.y) > o.r + 20, m.id + ' prop off the road');
    for (const p of g.paths) assert.ok(p.len > 800 && p.segs.every(s => s.len > 0), m.id + ' path');
    if (E.hasWater(m)) assert.doesNotThrow(() => spot(E, 'boat'), m.id + ' has room for a Gunboat');
  }
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

test('players on one PC: separate saves, top-3 boards with medals, switching and removing', () => {
  const storageObj = fakeStorage();
  const run = (map, diff, cleared, livesLost, clock, round = 40) => ({ map, diff, ua: false, cleared, round, livesLost, livesLeft: 100 - livesLost, clock, at: 1 });
  const keys = [];
  // six players, each in a fresh page load (switching players reloads the page)
  for (let i = 0; i < 6; i++) {
    let E = loadEngine({ storageObj });
    if (i > 0) { E.addPlayerSlot(); E = loadEngine({ storageObj }); }
    assert.strictEqual(E.hasProfile(), false, 'a new slot starts empty');
    E.createProfile({ name: 'Player' + i });
    E.saveRun(run('meadow', 'easy', true, i, 300 + i));
    if (i === 5) E.saveRun(run('meadow', 'hard', true, 0, 500));
    keys.push(E.ACTIVE_KEY);
  }
  const E = loadEngine({ storageObj });
  assert.strictEqual(E.ACTIVE_KEY, keys[5], 'the last added player stays active after a reload');
  assert.strictEqual(E.allPlayers().length, 6);
  // each player only sees their own runs
  assert.strictEqual(Object.keys(E.runs()).length, 2);
  const stage = E.stageRanking('meadow', 'easy', false);
  assert.deepStrictEqual(Array.from(stage, x => x.p.id.name), ['Player0', 'Player1', 'Player2', 'Player3', 'Player4', 'Player5']);
  assert.deepStrictEqual(Array.from(stage, x => x.rank), [1, 2, 3, 4, 5, 6]);
  // tier board: Player5 also cleared Hard, so it leads
  const meadowTier = E.MAPS.find(m => m.id === 'meadow').tier;
  const tier = E.tierBoard(meadowTier, false);
  assert.strictEqual(tier[0].p.id.name, 'Player5');
  assert.strictEqual(tier[0].rank, 1);
  assert.strictEqual(E.BOARD_SIZE, 3, 'tier and stage boards show the top 3: gold, silver, bronze');
  // medals: 1st/2nd/3rd places on Standard stage boards
  assert.deepStrictEqual({ ...E.medalsOf(keys[0]) }, { gold: 1, silver: 0, bronze: 0 });
  assert.deepStrictEqual({ ...E.medalsOf(keys[2]) }, { gold: 0, silver: 0, bronze: 1 });
  assert.deepStrictEqual({ ...E.medalsOf(keys[5]) }, { gold: 1, silver: 0, bronze: 0 }, 'gold on Hard (alone), 6th on Easy');
  assert.deepStrictEqual({ ...E.medalsOf(keys[4]) }, { gold: 0, silver: 0, bronze: 0 });
  // switching and removing
  assert.strictEqual(E.removePlayer(keys[5]), false, 'the active player cannot be removed');
  assert.strictEqual(E.switchPlayer(keys[1]), true);
  const E2 = loadEngine({ storageObj });
  assert.strictEqual(E2.getId().name, 'Player1');
  assert.strictEqual(E2.removePlayer(keys[3]), true);
  assert.strictEqual(E2.allPlayers().length, 5);
  assert.strictEqual(storageObj.getItem(keys[3]), null);
  // cancelling a new player goes back to the previous one and drops the empty slot
  E2.addPlayerSlot();
  const E3 = loadEngine({ storageObj });
  assert.strictEqual(E3.hasProfile(), false);
  assert.strictEqual(E3.cancelNewPlayer(), true);
  const E4 = loadEngine({ storageObj });
  assert.strictEqual(E4.getId().name, 'Player1');
  assert.strictEqual(E4.roster().keys.length, 5);
});

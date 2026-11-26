'use strict';
// v5.1.2: Signal Tower skills, and the game clock stops between rounds.
const test = require('node:test');
const assert = require('node:assert');
const { loadEngine } = require('./harness');

test('Signal Tower has aura skills instead of Attack speed and Pierce; old points are given back', () => {
  const E = loadEngine();
  assert.deepStrictEqual(Array.from(E.perkList('signal'), k => k.id), ['range', 'boost', 'cost', 'rally', 'cd']);
  assert.ok(E.perkList('dart').some(k => k.id === 'pierce'), 'other towers keep Pierce');
  const base = E.statsFor('signal', [0, 0, 0], null), s = E.statsFor('signal', [0, 0, 0], { range: 5, boost: 5, rally: 4 });
  assert.strictEqual(s.aura, Math.round(base.aura * 1.1), '+2% aura per point');
  assert.ok(Math.abs(s.buffRate - 0.1) < 1e-9, '+2% aura attack speed per point');
  assert.strictEqual(s.rallyT, 2, '+0.5 s Rally per point');
  E.tprog('signal').perks = { rate: 5, pierce: 3 }; // points spent on skills that did nothing: free again
  assert.strictEqual(E.spentPoints('signal'), 0);
});

test('the game clock only runs while a round is being played', () => {
  const E = loadEngine();
  E.createGame({ mapIdx: 0, diffKey: 'medium' });
  E.game.round = 3;
  E.game.inRound = false;
  E.update(0.05);
  assert.strictEqual(E.game.clock, 0, 'between rounds');
  E.startRound();
  E.update(0.05);
  assert.ok(E.game.clock > 0, 'during a round');
});

test('a player not seen for 3 days shows the idle photo as their avatar', () => {
  const E = loadEngine();
  const now = Date.now(), day = 86400000;
  E.saveSharedCache([
    { uid: 'old', updated: now - 3 * day - 1000, inuse: { pc: 'x', at: now - 4 * day } },
    { uid: 'new', updated: now - 2 * day },
  ]);
  assert.strictEqual(E.isIdle('old', now), true, 'offline 3 days');
  assert.strictEqual(E.isIdle('new', now + 1), false, 'offline 2 days');
  assert.strictEqual(E.isIdle(undefined, now), false, 'no uid (avatar picker previews)');
  assert.ok(E.avatarSVG({ uid: 'old', animal: 'cat' }, 40).includes('idle-avatar.png'));
  assert.ok(!E.avatarSVG({ uid: 'new', animal: 'cat' }, 40).includes('idle-avatar.png'));
});

test('World Boss modifiers (5.2.1): swarm, strength, gold gain and boss aura DEF, set in master control', () => {
  const E = loadEngine();
  E.DEV.unlockAll = true;
  E.run('wbNow = () => ' + (E.wbDayStart(46, false) + 3600e3));
  const cfg = E.cleanWbConfig({ at: 5, bosses: { wbgale: { swarm: 100, str: 50, gold: 20, aura: 999 } } });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(cfg.bosses.wbgale)), { swarm: 100, str: 50, gold: 20, aura: 90 }, 'aura capped at 90%');
  E.saveAdminData({ master: null, resets: {}, wb: cfg });
  E.applyWbConfig(cfg);
  assert.deepStrictEqual(Array.from(E.wbModsOf(E.WB_BOSSES[0]), m => m.name + ' ' + m.v), ['Swarm 100', 'Strength 50', 'Gold gain 20', 'Boss aura DEF 90']);
  assert.strictEqual(E.wbModsOf(E.WB_BOSSES[1]).length, 0, 'other bosses: no modifiers');

  E.createGame({ mode: 'worldboss', wbBoss: 'wbgale', wbMap: 'wb-jungle', wbWeek: 46 });
  const g = E.game;
  assert.strictEqual(E.popCash(), 1.2, 'gold gain +20%');
  E.startRound();
  g.spawnQ = []; g.balloons = [];
  g.round = 39; E.wbNextRound(false); E.update(0.01);
  const boss = g.wb.ref, n0 = g.balloons.length;
  E.wbSummon(boss, 'red', 3);
  const kids = g.balloons.slice(n0);
  assert.strictEqual(kids.length, 6, 'swarm +100%: twice the balloons');
  const near = kids[0], hp = near.hp;
  near.x = boss.x; near.y = boss.y;
  E.damageBalloon(near, 0.5, 'sharp');
  assert.ok(Math.abs(hp - near.hp - 0.05) < 1e-9, 'inside the aura: 90% less damage');
  near.x = boss.x + E.WB_AURA_R + 50;
  E.damageBalloon(near, 0.5, 'sharp');
  assert.ok(Math.abs(hp - near.hp - 0.55) < 1e-9, 'outside the aura: full damage');
});

test('Champion borders (5.2.1): 10 of them, only the World Boss Champion wears their pick, everywhere', () => {
  const E = loadEngine();
  assert.strictEqual(E.CHAMP_BORDER_IDS.length, 10);
  const av = (o) => E.avatarSVG(Object.assign({ animal: 'fox', border: 'plain' }, o));
  E.run("WB_CHAMP_UID = 'champ00001'; WB_CHAMP_CB = 'wblegend'");
  assert.ok(av({ uid: 'champ00001' }).includes('<polygon'), 'default: Boss Slayer (its star)');
  E.run("WB_CHAMP_CB = champBorderId('wbinferno')");
  assert.ok(av({ uid: 'champ00001' }).includes('#ff6d00'), 'the champion wears their pick (Inferno)');
  assert.ok(av({ uid: 'champ00001', cb: 'wbfrost' }).includes('#01304f'), 'a preview shows the new pick (Frost Titan)');
  assert.strictEqual(E.champBorderId('legend'), 'wblegend', 'not a champion border: Boss Slayer');
  assert.ok(!av({ uid: 'other00001', border: 'wbinferno', cb: 'wbinferno' }).includes('#ff6d00'), 'nobody else, even if their save asks');
  E.run("WB_CHAMP_UID = ''");
  assert.ok(!av({ uid: 'champ00001' }).includes('#ff6d00'), 'after the 7 days: back to their own border');
});

test('Tower setup (5.2.1): master control buffs or nerfs any tower, for every PC', () => {
  const E = loadEngine();
  const base = E.statsFor('dart', [0, 0, 0], null);
  const cfg = E.cleanTwConfig({ at: 7, towers: { dart: { cost: 150, up: 50, dmg: 200, rate: 200, range: 999, pierce: 100 }, nope: { dmg: 5 } } });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(cfg)), { at: 7, towers: { dart: { cost: 150, up: 50, dmg: 200, rate: 200, range: 300 } } }, 'clamped, 100% dropped, unknown towers dropped');
  E.saveAdminData({ master: null, resets: {}, tw: cfg });
  const s = E.statsFor('dart', [0, 0, 0], null);
  assert.strictEqual(s.dmg, base.dmg * 2, 'damage x2');
  assert.ok(Math.abs(s.rate - base.rate / 2) < 1e-9, 'attacks twice as fast');
  assert.strictEqual(s.range, base.range * 3, 'range capped at 300%');
  assert.strictEqual(s.pierce, base.pierce, 'pierce unchanged');
  assert.deepStrictEqual(E.statsFor('tack', [0, 0, 0], null), E.statsFor('tack', [0, 0, 0], null), 'other towers untouched');
  E.createGame({ mapIdx: 0, diffKey: 'medium' });
  const t = E.game.diff.costMul;
  assert.strictEqual(E.price(E.TD.dart.cost, 'dart'), Math.round(E.TD.dart.cost * 1.5 * t / 5) * 5, 'place cost 150%');
  assert.strictEqual(E.price(E.TD.dart.paths[0][0].c, 'dart', true), Math.round(E.TD.dart.paths[0][0].c * 0.5 * t / 5) * 5, 'upgrades half price');
  assert.strictEqual(E.mergeAdmin({ tw: cfg }, { tw: { at: 3, towers: {} } }).tw.at, 7, 'newest wins');
  E.saveAdminData({ master: null, resets: {}, tw: { at: 9, towers: {} } });
  assert.deepStrictEqual(E.statsFor('dart', [0, 0, 0], null), base, 'reset: back to normal');
});

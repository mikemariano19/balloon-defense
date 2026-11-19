'use strict';
// v5.1.1: map domination and medal-taken notifications, World Boss setup from master control.
const test = require('node:test');
const assert = require('node:assert');
const { loadEngine } = require('./harness');

const plain = (x) => JSON.parse(JSON.stringify(x));
/** A fake player for the board functions: `runs` = { 'map:diff': { livesLost, clock, at } } (all cleared). */
function player(name, runs = {}, me = false) {
  const r = {};
  for (const [k, v] of Object.entries(runs)) {
    const [map, diff] = k.split(':');
    r[k + ':std'] = Object.assign({ map, diff, ua: false, cleared: true, round: 40, livesLost: 0, livesLeft: 100, clock: 600, at: 1 }, v);
  }
  return { key: 'k-' + name, me, id: { uid: 'u' + name.toLowerCase(), name, tag: '1234', animal: 'cat' }, runs: r };
}

/* ---------- Domination ---------- */
test('a map is dominated when every difficulty is cleared; the first look only remembers', () => {
  const E = loadEngine();
  const map = E.MAPS[0].id, diffs = Object.keys(E.DIFF);
  const all = {}; for (const d of diffs) all[map + ':' + d] = {};
  const three = {}; for (const d of diffs.slice(0, 3)) three[map + ':' + d] = {};
  const p1 = player('Ana', three), me = player('Me', {}, true);
  assert.deepStrictEqual(plain(E.dominatedMaps(p1)), []);

  const first = E.dominationNotes([player('Ana', all), me], null);
  assert.strictEqual(first.notes.length, 0, 'no notes on the first look');

  const seen = E.dominationNotes([p1, me], null).seen;
  const r = E.dominationNotes([player('Ana', all), me], seen);
  assert.strictEqual(r.notes.length, 1);
  assert.match(r.notes[0].text, new RegExp('^Ana dominates the ' + E.MAPS[0].name + ' map!'));
  assert.strictEqual(r.notes[0].id, 'dom-uana-' + map);
  assert.strictEqual(E.dominationNotes([player('Ana', all), me], r.seen).notes.length, 0, 'only once');

  const mine = E.dominationNotes([player('Me', all, true)], E.dominationNotes([me], null).seen);
  assert.match(mine.notes[0].text, /^You dominate /);
});

/* ---------- Medal taken ---------- */
test('another player taking my medal: who, my medal now and the points lost', () => {
  const E = loadEngine();
  const st = E.MAPS[0].id + ':hard';
  const me = player('Me', { [st]: { clock: 500, at: 10 } }, true);
  const seen = E.medalLostNotes([me], null).seen;
  assert.deepStrictEqual(plain(seen[st + ':std']), { r: 1, above: [] });

  // Ana beats my time: I drop from gold to silver (-1)
  const ana = player('Ana', { [st]: { clock: 400, at: 20 } });
  const r = E.medalLostNotes([me, ana], seen);
  assert.strictEqual(r.notes.length, 1);
  assert.match(r.notes[0].text, /^Ana took your gold medal on .* · Hard!$/);
  assert.strictEqual(r.notes[0].sub, 'Your medal now: silver · -1 point');
  assert.strictEqual(E.medalLostNotes([me, ana], r.seen).notes.length, 0, 'only once');

  // two more players push me off the podium: bronze... then nothing (-2 from silver)
  const bo = player('Bo', { [st]: { clock: 450, at: 30 } }), cy = player('Cy', { [st]: { clock: 460, at: 31 } });
  const r2 = E.medalLostNotes([me, ana, bo, cy], r.seen);
  assert.strictEqual(r2.notes.length, 1);
  assert.match(r2.notes[0].text, /^Cy took your silver/, 'the newest run that passed me');
  assert.strictEqual(r2.notes[0].sub, 'You have no medal there now · -2 points');
});

test('no medal note on the first look, or when my own run is gone', () => {
  const E = loadEngine();
  const st = E.MAPS[1].id + ':easy';
  const me = player('Me', { [st]: {} }, true), ana = player('Ana', { [st]: { clock: 1 } });
  assert.strictEqual(E.medalLostNotes([me, ana], null).notes.length, 0);
  const seen = E.medalLostNotes([me], null).seen;
  assert.strictEqual(E.medalLostNotes([player('Me', {}, true), ana], seen).notes.length, 0);
});

/* ---------- World Boss setup ---------- */
test('master control World Boss setup: cleaned, merged (newest wins), applied to the bosses and the game', () => {
  const E = loadEngine();
  assert.strictEqual(E.WB_BOSSES[0].hp, E.WB_HP);
  assert.strictEqual(E.WB_BOSSES[0].lives, E.WB_LIVES);

  const cfg = E.cleanWbConfig({ at: 5, bosses: { wbbastion: { name: '  Iron   Wall ', hp: 80000, def: 0.5, cash: 99999999, lives: 2000, count: 3 }, bogus: { hp: 1 } } });
  assert.deepStrictEqual(plain(cfg), { at: 5, bosses: { wbbastion: { name: 'Iron Wall', hp: 80000, def: 0.5, cash: 1000000, lives: 2000 } } }, 'clamped, defaults dropped');
  assert.strictEqual(E.cleanWbConfig({ bosses: {} }), null, 'no time: ignored');

  const older = { at: 1, bosses: { wbgale: { hp: 2000 } } };
  assert.strictEqual(E.mergeAdmin({ wb: older }, { wb: cfg }).wb.at, 5);
  assert.strictEqual(E.mergeAdmin({ wb: cfg }, { wb: older }).wb.at, 5);
  assert.strictEqual(E.mergeAdmin({ wb: cfg }, { master: null, resets: {} }).wb.at, 5, 'a password change keeps the setup');

  E.saveAdminData({ master: null, resets: {}, wb: cfg });
  const b = E.WB_BOSSES.find(x => x.id === 'wbbastion');
  assert.strictEqual(b.name, 'Iron Wall');
  assert.strictEqual(E.BT.wbbastion.name, 'Iron Wall');
  assert.strictEqual(b.defTxt, 'High (takes 50% less damage)');
  assert.strictEqual(b.cash, 1000000);

  E.createGame({ mapIdx: 0, diffKey: 'medium', mode: 'worldboss', wbBoss: 'wbbastion', wbMap: 'wb-jungle', wbWeek: 50 });
  assert.strictEqual(E.game.lives, 2000);
  assert.strictEqual(E.game.cash, 1000000);
  assert.strictEqual(E.makeBalloon('wbbastion', 0).hp, 80000);

  // a new setup doesn't change a run already going
  E.saveAdminData({ master: null, resets: {}, wb: { at: 9, bosses: {} } });
  assert.strictEqual(E.game.wb.boss.def, 0.5);
  assert.strictEqual(b.name, 'Bastion', 'back to the defaults');
  assert.strictEqual(b.def, 0.6);
  assert.strictEqual(b.defTxt, 'High (takes 40% less damage)');
});

test('defense text', () => {
  const E = loadEngine();
  assert.strictEqual(E.wbDefTxt(1), 'Normal');
  assert.strictEqual(E.wbDefTxt(0.8), 'Medium (takes 20% less damage)');
  assert.strictEqual(E.wbDefTxt(1.5), 'Weak (takes 50% more damage)');
});

/* ---------- 5.1.2: Nightmare start money ---------- */
test('Hard and Nightmare skip map cash penalties, so every expert map starts on the same money', () => {
  const E = loadEngine();
  const start = (id, diffKey) => { E.createGame({ mapIdx: E.MAPS.findIndex(m => m.id === id), diffKey }); return E.game.cash; };
  const plainExpert = E.MAPS.find(m => m.tier === 'expert' && !m.cash).id;
  assert.strictEqual(start('cross', 'nightmare'), start(plainExpert, 'nightmare'));
  assert.strictEqual(start('figure8', 'nightmare'), start(plainExpert, 'nightmare'));
  assert.ok(start('cross', 'nightmare') >= 650);
  assert.strictEqual(start('cross', 'hard'), start(plainExpert, 'hard'));
  assert.strictEqual(start('figure8', 'hard'), start(plainExpert, 'hard'));
  assert.strictEqual(start('cross', 'medium'), 650 - 600); // Easy and Medium keep the penalty
});

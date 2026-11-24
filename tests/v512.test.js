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

'use strict';
// v5.1: Sniper Post skills, weekend daily challenge, passwords and log-in, master control, game history, last seen.
const test = require('node:test');
const assert = require('node:assert');
const { loadEngine, fakeStorage } = require('./harness');

/** In-memory stand-in for a FileSystemDirectoryHandle (nested folders). */
function fakeFolder() {
  const subs = new Map(), files = new Map();
  const dir = {
    kind: 'directory', name: 'share', files,
    async getDirectoryHandle(name, o = {}) {
      if (!subs.has(name)) { if (!o.create) throw Object.assign(new Error('not found'), { name: 'NotFoundError' }); subs.set(name, fakeFolder()); }
      return subs.get(name);
    },
    async getFileHandle(name, o = {}) {
      if (!files.has(name) && !o.create) throw new Error('not found');
      if (!files.has(name)) files.set(name, '');
      return {
        kind: 'file', name,
        async getFile() { const t = files.get(name); return { size: t.length, text: async () => t }; },
        async createWritable() { let buf = ''; return { write: async (x) => { buf += x; }, close: async () => { files.set(name, buf); } }; },
      };
    },
    async removeEntry(name) { files.delete(name); },
    async *entries() { for (const n of [...files.keys()]) yield [n, await dir.getFileHandle(n)]; },
    sub: (n) => subs.get(n),
  };
  return dir;
}
const connect = (E, folder) => { E.Share.handle = folder; E.Share.state = 'on'; };
const plain = (x) => JSON.parse(JSON.stringify(x));
/** A browser tab: gives the sandbox a sessionStorage, so log-in is required (the harness has none by default). */
const withSession = (E) => { E.ctx.sessionStorage = fakeStorage(); return E; };

/* ---------- Sniper Post skills ---------- */
test('Sniper Post has Damage and Blimp hunter skills instead of Range and Pierce; old points are given back', () => {
  const E = loadEngine();
  assert.deepStrictEqual(Array.from(E.perkList('sniper'), k => k.id), ['dmg', 'rate', 'cost', 'blimp', 'cd']);
  assert.ok(E.perkList('dart').some(k => k.id === 'range'), 'other towers keep Range');
  const s = E.statsFor('sniper', [0, 0, 0], { dmg: 5, blimp: 3 });
  assert.strictEqual(s.dmg, 2 * 1.25);
  assert.ok(Math.abs(s.bm - 1.3) < 1e-9);
  assert.strictEqual(s.range, 9999, 'range unchanged (it already sees the whole map)');
  // points spent on Range and Pierce in 5.0 no longer count, so they are free to spend again
  E.tprog('sniper').perks = { range: 5, pierce: 3 };
  assert.strictEqual(E.spentPoints('sniper'), 0);
});

/* ---------- Daily challenge: no weekends ---------- */
test('no daily challenge on Saturdays and Sundays, and weekends never break a streak', () => {
  const E = loadEngine();
  assert.strictEqual(E.dailyOff('2026-11-21'), true, 'Saturday');
  assert.strictEqual(E.dailyOff('2026-11-22'), true, 'Sunday');
  assert.strictEqual(E.dailyOff('2026-11-23'), false, 'Monday');
  const mon = E.run('new Date(2026, 10, 23, 10)'), sat = E.run('new Date(2026, 10, 21, 10)');
  const d = { '2026-11-19': true, '2026-11-20': true, '2026-11-23': true };
  assert.strictEqual(E.dailyStreak(d, mon), 3, 'Thu, Fri, (weekend skipped), Mon');
  assert.strictEqual(E.dailyStreak({ '2026-11-19': true, '2026-11-20': true }, mon), 2, 'not played yet on Monday: the streak still stands');
  assert.strictEqual(E.dailyStreak({ '2026-11-19': true, '2026-11-20': true }, sat), 2, 'on Saturday the streak is safe');
  assert.deepStrictEqual(plain(E.dailyDays(5, sat)), ['2026-11-20', '2026-11-19', '2026-11-18', '2026-11-17', '2026-11-16'], 'the Daily board shows weekdays only');
});

/* ---------- Passwords ---------- */
test('SHA-256 matches the standard test vectors; passwords are stored salted and checked', () => {
  const E = loadEngine();
  assert.strictEqual(E.sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.strictEqual(E.sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.strictEqual(E.sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1', 'two blocks');
  const id = E.createProfile({ name: 'Mika', pw: 'secret1' });
  assert.ok(id.pw && id.pw.h && id.pw.s, 'hash and salt stored');
  assert.ok(!JSON.stringify(E.store.all()).includes('secret1'), 'the password itself is never stored');
  assert.strictEqual(E.checkPassword(E.getId(), 'secret1'), true);
  assert.strictEqual(E.checkPassword(E.getId(), 'Secret1'), false);
  assert.strictEqual(E.pwProblem('abc'), 'Use at least 4 characters');
  assert.strictEqual(E.pwProblem('abcd', 'abce'), 'The two passwords are not the same');
  assert.strictEqual(E.pwProblem('abcd', 'abcd'), '');
});

test('log-in: registering logs you in; logging out makes the profile offline and unable to play or chat', async () => {
  const E = withSession(loadEngine());
  assert.strictEqual(E.loggedIn(), false);
  const id = E.createProfile({ name: 'Lena', pw: 'pass' });
  assert.strictEqual(E.loggedIn(), true, 'registering logs you in');
  assert.strictEqual(E.isOnline(E.localPlayers()[0]), true);
  E.setSession('');
  assert.strictEqual(E.loggedIn(), false);
  assert.strictEqual(E.activePlayable(), true, 'the profile still belongs to this PC');
  assert.strictEqual(E.isOnline(E.localPlayers()[0]), false, 'logged out = offline');
  const folder = fakeFolder(); connect(E, folder);
  assert.match(await E.Chat.send({ text: 'hi' }), /Log in/);
  await E.Share.syncWith(folder);
  const file = JSON.parse(folder.sub('balloon-defense-players').files.get('p-' + id.uid + '.json'));
  assert.strictEqual(file.inuse, null, 'no "online" heartbeat while logged out');
  E.setSession(id.uid);
  await E.Share.syncWith(folder);
  assert.ok(JSON.parse(folder.sub('balloon-defense-players').files.get('p-' + id.uid + '.json')).inuse, 'heartbeat once logged in');
});

test('the newest password wins when copies of a profile are merged', () => {
  const E = loadEngine();
  E.createProfile({ name: 'Nico', pw: 'first' });
  const a = E.store.all(), b = plain(a);
  b.id.pw = E.makePw('second', a.id.pw.at + 1000);
  a.updated = 9e12; // the copy with the older password was saved later
  const m = E.mergeSaves(b, a);
  assert.strictEqual(E.checkPassword(m.id, 'second'), true);
});

/* ---------- Master control ---------- */
test('master control: the master password is shared through the folder; a reset makes the player create a new password', async () => {
  const folder = fakeFolder();
  const A = loadEngine({ storageObj: fakeStorage() }), B = loadEngine({ storageObj: fakeStorage() });
  connect(A, folder); connect(B, folder);
  const id = A.createProfile({ name: 'Ola', pw: 'mypass' });
  await A.Share.syncWith(folder);
  assert.strictEqual(A.masterSet(), false);
  await A.Share.saveAdmin({ master: A.makePw('boss123'), resets: {} });
  assert.strictEqual(A.checkMaster('boss123'), true);
  await B.Share.syncWith(folder);
  assert.strictEqual(B.checkMaster('boss123'), true, 'PC B uses the same master password');
  assert.strictEqual(B.checkMaster('nope'), false);
  // PC B resets Ola's password
  assert.strictEqual(B.hasPassword(B.bestId(id.uid)), true);
  await B.Share.saveAdmin({ master: null, resets: { [id.uid]: Date.now() + 5 } });
  assert.strictEqual(B.hasPassword(B.bestId(id.uid)), false);
  await A.Share.syncWith(folder);
  assert.strictEqual(A.hasPassword(A.getId()), false, 'Ola has no password at her next log-in');
  assert.strictEqual(A.checkMaster('boss123'), true, 'a reset never loses the master password');
  // she makes a new one: it counts, because it was set after the reset
  A.saveId(Object.assign(A.getId(), { pw: A.makePw('newpass', Date.now() + 10) }));
  assert.strictEqual(A.checkPassword(A.getId(), 'newpass'), true);
});

test('master control: deleting an account logs it out on its own PC; restoring brings it back from its backups', async () => {
  const folder = fakeFolder(), pcA = fakeStorage();
  const A = withSession(loadEngine({ storageObj: pcA }));
  connect(A, folder);
  const id = A.createProfile({ name: 'Pia', pw: 'pia1' });
  A.PROFILE.xp = 7777; A.saveProfile();
  await A.Share.autoBackup();
  await A.Share.syncWith(folder);
  // the admin on PC B deletes Pia
  const B = loadEngine({ storageObj: fakeStorage() });
  connect(B, folder);
  B.createProfile({ name: 'Ben' });
  await B.Share.syncWith(folder);
  assert.strictEqual(B.dropProfileHere(id.uid).removed, 0, 'Pia isn\'t on PC B');
  assert.strictEqual(await B.Share.tombstone(id.uid, B.bestId(id.uid), 'admin'), true);
  const marker = JSON.parse(folder.sub('balloon-defense-players').files.get('p-' + id.uid + '.json'));
  assert.deepStrictEqual([marker.deleted, marker.by, marker.look.name], [true, 'admin', 'Pia'], 'the marker keeps her name for master control');
  // PC A: Pia is playing there. The next sync drops her and logs her out.
  await A.Share.syncWith(folder);
  assert.strictEqual(A.Share.kicked, true);
  assert.strictEqual(A.Share.reload, true);
  assert.strictEqual(A.sessionUid(), '');
  assert.strictEqual(A.localPlayers().length, 0);
  assert.strictEqual(A.pcInfo().owner, '', 'PC A can register a new profile');
  A.PROFILE.xp = 1; A.saveProfile(); // the game keeps running until the page reloads: nothing is written back
  assert.ok(JSON.parse(folder.sub('balloon-defense-players').files.get('p-' + id.uid + '.json')).deleted, 'she stays deleted');
  // a delete by the player's own PC (not master control) never kicks the active profile elsewhere
  const plan = A.planSync([{ uid: 'abcdefg1', key: 'k', me: true, slot: {} }], new Map([['abcdefg1', { uid: 'abcdefg1', deleted: true, by: '' }]]), 'pc', true);
  assert.strictEqual(plan.kick, '');
  // restore: from the backups in the shared folder, with her progress and password
  assert.strictEqual(await B.Share.restoreAccount(id.uid), '');
  const back = B.cleanShared(JSON.parse(folder.sub('balloon-defense-players').files.get('p-' + id.uid + '.json')));
  assert.strictEqual(back.deleted, undefined);
  assert.strictEqual(back.id.name, 'Pia');
  assert.strictEqual(back.profile.xp, 7777);
  assert.strictEqual(B.checkPassword(back.id, 'pia1'), true, 'her password comes back too');
  assert.ok(B.allPlayers().some(p => p.id.uid === id.uid), 'she shows as a player again');
});

test('dropProfileHere stops every save until the page reloads', () => {
  const pc = fakeStorage();
  const E = loadEngine({ storageObj: pc });
  const id = E.createProfile({ name: 'Quin' });
  const r = E.dropProfileHere(id.uid);
  assert.deepStrictEqual(plain(r), { removed: 1, wasActive: true });
  E.PROFILE.xp = 500; E.saveProfile();
  assert.strictEqual(E.readSlot(E.ACTIVE_KEY).id, undefined, 'the deleted profile is not written back');
});

/* ---------- Game history ---------- */
test('game history keeps the newest 30 games and merges copies from two PCs', () => {
  const E = loadEngine();
  E.createProfile({ name: 'Rio' });
  E.createGame({ mapIdx: 0, diffKey: 'easy', mode: 'standard' });
  E.game.round = 12; E.game.pops = 345; E.game.clock = 456.7;
  const h = E.historyEntry(E.game, 2, 1000);
  assert.deepStrictEqual([h.map, h.diff, h.round, h.pops, h.clock, h.rank, h.won], ['meadow', 'easy', 12, 345, 457, 2, false]);
  for (let i = 0; i < 35; i++) E.addHistory(Object.assign({}, h, { id: 'h' + i, at: 1000 + i }));
  const list = E.historyList();
  assert.strictEqual(list.length, 30);
  assert.strictEqual(list[0].id, 'h34', 'newest first');
  const a = E.store.all(), b = plain(a);
  b.history = [Object.assign({}, h, { id: 'other', at: 5000 })];
  const m = E.mergeSaves(a, b);
  assert.strictEqual(m.history.length, 30);
  assert.strictEqual(m.history[0].id, 'other', 'a game from the other copy is kept');
  assert.ok(E.localPlayers()[0].history.length === 30, 'players carry their history');
});

/* ---------- Players: online first, last seen ---------- */
test('players: you first, then online, then by last seen; "30m ago" / "4h ago"', () => {
  const E = loadEngine();
  const now = 2e12;
  assert.strictEqual(E.agoShort(now - 30 * 60000, now), '30m ago');
  assert.strictEqual(E.agoShort(now - 4 * 3600000 - 5000, now), '4h ago');
  assert.strictEqual(E.agoShort(now - 20000, now), 'just now');
  assert.strictEqual(E.agoShort(now - 3 * 86400000, now), '3d ago');
  E.createProfile({ name: 'Sam' });
  const mk = (uid, name, at, inuse) => ({ v: 2, uid, id: { name, tag: '1234', uid }, profile: {}, runs: {}, towers: {}, records: {}, daily: {}, updated: at, pc: 'x', owner: '', inuse: inuse ? { pc: 'x', at: inuse } : null });
  E.saveSharedCache([mk('aaaaaa1', 'Old', now - 86400000), mk('bbbbbb2', 'Live', now - 86400000 * 2, now - 1000), mk('cccccc3', 'Recent', now - 600000, now - 600000)].map(o => E.cleanShared(o)));
  const order = Array.from(E.sortPlayers(E.allPlayers(), now), p => p.id.name);
  assert.deepStrictEqual(order, ['Sam', 'Live', 'Recent', 'Old']);
  const recent = E.allPlayers().find(p => p.id.name === 'Recent');
  assert.strictEqual(E.agoShort(E.lastSeen(recent, now), now), '10m ago');
});

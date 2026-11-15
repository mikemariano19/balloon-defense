'use strict';
// v5.0: profile protection (never go backwards, home PC, repair, backups), World Boss, Chat, notifications.
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

/* ---------- Profile protection ---------- */
test('PP-5: a save can never make progress go backwards (XP, counters, tower XP and unlocks, runs)', () => {
  const E = loadEngine();
  E.createProfile({ name: 'Rina' });
  E.PROFILE.xp = 5000; E.PROFILE.wins = 7; E.PROFILE.pops = 12345; E.saveProfile();
  E.tprog('dart').total = 9000; E.tprog('dart').xp = 300; E.tprog('dart').unl['1-3'] = 1; E.saveTprog();
  E.saveRun({ map: 'meadow', diff: 'easy', ua: false, cleared: true, round: 40, livesLost: 0, livesLeft: 200, clock: 500, at: 1 });
  // a bug (or an old copy) tries to save a reset profile and empty towers
  const bad = E.store.all();
  bad.profile = Object.assign({}, bad.profile, { xp: 10, wins: 0, pops: 3 });
  bad.towers = { dart: { xp: 0, total: 0, unl: {}, perks: {} } };
  bad.runs = {};
  E.store.save(bad);
  const s = E.store.all();
  assert.deepStrictEqual([s.profile.xp, s.profile.wins, s.profile.pops], [5000, 7, 12345], 'counters kept');
  assert.deepStrictEqual([s.towers.dart.total, s.towers.dart.unl['1-3']], [9000, 1], 'tower level and unlocks kept');
  assert.ok(s.runs['meadow:easy:std'], 'best run kept');
  // spending tower XP on an unlock is a real change and is kept
  E.tprog('dart').xp = 0; E.tprog('dart').unl['1-4'] = 1; E.saveTprog();
  assert.deepStrictEqual([E.store.all().towers.dart.xp, E.store.all().towers.dart.unl['1-4']], [0, 1]);
  // the game's in-memory copy catches up with a saved copy that has more
  E.PROFILE.xp = 1; E.saveProfile();
  assert.strictEqual(E.PROFILE.xp, 5000);
  // settings and the half-played game always come from the new copy
  const o = E.store.all(); o.settings = Object.assign({}, o.settings, { sound: true }); o.run = { v: 4, round: 3 }; E.store.save(o);
  assert.strictEqual(E.store.all().settings.sound, true);
  assert.strictEqual(E.store.all().run.round, 3);
  // even if this PC's clock goes backwards
  E.run('Date.now = () => 1000');
  const p = E.store.all(); p.settings.sound = false; E.store.save(p);
  assert.strictEqual(E.store.all().settings.sound, false);
});

test('mergeSaves (5.0): unlocks from both copies, notes, World Boss scores, and the newest home claim', () => {
  const E = loadEngine();
  const a = { updated: 100, id: { name: 'A', uid: 'x', home: { pc: 'pc1', at: 50 } }, towers: { dart: { xp: 5, total: 9000, unl: { '0-3': 1 } } },
    wbHist: { 40: { d: 900, at: 1 }, 41: { d: 10, at: 2 } }, notes: [{ id: 'n1', at: 10 }, { id: 'n2', at: 20 }] };
  const b = { updated: 200, id: { name: 'A', uid: 'x', home: { pc: 'pc2', at: 40 } }, towers: { dart: { total: 9500 } }, // a v4.0 file: total only
    wbHist: { 40: { d: 500, at: 3 }, 41: { d: 70, at: 4 } }, notes: Array.from({ length: 10 }, (_, i) => ({ id: 'm' + i, at: 100 + i })) };
  const m = E.mergeSaves(a, b);
  assert.strictEqual(m.towers.dart.total, 9500);
  assert.strictEqual(m.towers.dart.unl['0-3'], 1, 'the unlock isn\'t lost to a copy that only had the total');
  assert.deepStrictEqual([m.wbHist[40].d, m.wbHist[41].d], [900, 70]);
  assert.strictEqual(m.notes.length, 10, 'the newest 10 notifications');
  assert.strictEqual(m.notes[0].id, 'm9');
  assert.deepStrictEqual(plain(m.id.home), { pc: 'pc1', at: 50 }, 'the latest claim wins, not the newest save');
});

test('PP-3: backups keep the 10 newest plus one a day for the last 14 days', () => {
  const E = loadEngine();
  const day = 864e5, now = Date.UTC(2026, 10, 13, 4);
  const ats = [];
  for (let d = 0; d < 20; d++) for (let i = 0; i < 3; i++) ats.push(now - d * day - i * 3600e3);
  const keep = Array.from(E.backupKeep(ats, now));
  assert.ok(keep.includes(Math.max(...ats)));
  assert.strictEqual(keep.filter(t => now - t < 3 * day + 1).length >= 10, true, 'the 10 newest');
  const days = new Set(keep.map(t => E.todayStr(new Date(t))));
  assert.ok(days.size >= 14, 'one per day for 14 days');
  assert.ok(keep.every(t => now - t <= 14 * day + 3 * 3600e3), 'nothing older than 14 days');
  assert.ok(keep.length <= 10 + 14);
});

test('PP-10 + PP-7: the repair and Find my profile bring back progress from the folder and backups', async () => {
  const folder = fakeFolder(), pcA = fakeStorage();
  const A = loadEngine({ storageObj: pcA });
  connect(A, folder);
  const id = A.createProfile({ name: 'Paz' });
  A.PROFILE.xp = 40000; A.saveProfile();
  A.tprog('bomb').total = 20000; A.tprog('bomb').unl['2-3'] = 1; A.saveTprog();
  await A.Share.autoBackup();
  // the browser loses the tower progress (the old C3 bug) without the save guard noticing: write the slot directly
  const s = JSON.parse(pcA.getItem(A.ACTIVE_KEY)); s.towers = {}; s.profile.xp = 100; pcA.setItem(A.ACTIVE_KEY, JSON.stringify(s));
  const A2 = loadEngine({ storageObj: pcA });
  connect(A2, folder);
  assert.strictEqual(await A2.Share.repair(), 1, 'one profile repaired');
  const fixed = A2.store.all();
  assert.deepStrictEqual([fixed.profile.xp, fixed.towers.bomb.total, fixed.towers.bomb.unl['2-3']], [40000, 20000, 1]);
  assert.strictEqual(await A2.Share.repair(), 0, 'the repair runs once');
  // everything in this browser is wiped: a new PC id, no profile. Find my profile brings Paz back.
  const pcB = fakeStorage();
  const B = loadEngine({ storageObj: pcB });
  connect(B, folder);
  await B.Share.syncWith(folder);
  assert.strictEqual(B.hasProfile(), false);
  B.moveProfileHere(await B.Share.copiesOf(id.uid));
  const B2 = loadEngine({ storageObj: pcB });
  assert.strictEqual(B2.getId().uid, id.uid);
  assert.strictEqual(B2.activePlayable(), true);
  assert.deepStrictEqual([B2.PROFILE.xp, B2.tprog('bomb').total, B2.tprog('bomb').unl['2-3']], [40000, 20000, 1]);
});

test('PP-6: progress in the shared folder is merged in even when this PC\'s copy is newer', async () => {
  const folder = fakeFolder(), pcA = fakeStorage();
  const A = loadEngine({ storageObj: pcA });
  const id = A.createProfile({ name: 'Ivo' });
  A.PROFILE.wins = 30; A.saveProfile();
  await A.Share.syncWith(folder);
  // this browser loses wins, then saves something newer
  const s = JSON.parse(pcA.getItem(A.ACTIVE_KEY)); s.profile.wins = 0; s.updated = Date.now() + 5000; pcA.setItem(A.ACTIVE_KEY, JSON.stringify(s));
  const A2 = loadEngine({ storageObj: pcA });
  await A2.Share.syncWith(folder);
  assert.strictEqual(A2.store.all().profile.wins, 30, 'v4.5 would have copied the newer, emptier save over the folder');
  const file = JSON.parse(folder.sub('balloon-defense-players').files.get('p-' + id.uid + '.json'));
  assert.strictEqual(file.save.profile.wins, 30);
});

test('migration: a v4.5 PC whose active player is someone else\'s profile switches to its own', () => {
  const st = fakeStorage();
  st.setItem('balloonDefense.v2', JSON.stringify({ id: { name: 'Owner', tag: '1111', uid: 'owner00001' }, profile: { xp: 5 } }));
  st.setItem('balloonDefense.p.x', JSON.stringify({ id: { name: 'Guest', tag: '2222', uid: 'guest00001', home: { pc: 'elsewhere', at: 9 } } }));
  st.setItem('balloonDefense.players', JSON.stringify({ keys: ['balloonDefense.v2', 'balloonDefense.p.x'], active: 'balloonDefense.p.x' }));
  const E = loadEngine({ storageObj: st });
  assert.strictEqual(E.migrateHome(), true);
  const E2 = loadEngine({ storageObj: st });
  assert.strictEqual(E2.getId().name, 'Owner');
  assert.strictEqual(E2.activePlayable(), true);
  assert.strictEqual(E2.migrateHome(), false, 'only once');
  const guest = E2.localPlayers().find(p => p.id.name === 'Guest');
  assert.ok(guest && !E2.homeHere(guest.id), 'the guest copy stays saved, view-only');
});

test('a restored backup code plays on this PC (it isn\'t switched away as someone else\'s profile)', () => {
  const A = loadEngine();
  A.createProfile({ name: 'Codey' });
  A.PROFILE.xp = 777; A.saveProfile();
  const code = A.backupCode();
  const st = fakeStorage();
  const B = loadEngine({ storageObj: st });
  const r = B.parseBackup(code);
  assert.ok(r.ok);
  B.restoreBackup(r.data);
  const B2 = loadEngine({ storageObj: st });
  assert.strictEqual(B2.migrateHome(), false);
  assert.strictEqual(B2.activePlayable(), true);
  assert.strictEqual(B2.PROFILE.xp, 777);
  assert.strictEqual(B2.canCreateProfile(), false);
});

test('FX-8: Unlock All is gone from saves and settings', () => {
  const st = fakeStorage();
  st.setItem('balloonDefense.v2', JSON.stringify({ settings: { unlockAll: true, boards: 'ua', sound: true } }));
  const E = loadEngine({ storageObj: st });
  assert.strictEqual(E.SETTINGS.unlockAll, undefined);
  assert.strictEqual(E.SETTINGS.boards, undefined);
  assert.strictEqual(E.SETTINGS.sound, true);
  assert.strictEqual(E.isUnlocked('mine'), false);
  assert.strictEqual(E.tierUnlocked('dart', 0, 3), false);
});

/* ---------- World Boss ---------- */
test('World Boss schedule: each event ends Friday 5:00 PM Philippine time; never the same boss and map twice in a row', () => {
  const E = loadEngine();
  const k = E.wbWeek(Date.UTC(2026, 10, 13, 8, 59)); // Fri 13 Nov 2026, 4:59 PM in Manila
  assert.strictEqual(E.wbWeek(Date.UTC(2026, 10, 13, 9, 0)), k + 1, 'a new event at 5:00 PM');
  const end = new Date(E.wbEndsAt(k));
  assert.deepStrictEqual([end.getUTCDay(), end.getUTCHours(), end.getUTCMinutes()], [5, 9, 0], 'Friday 09:00 UTC = 5:00 PM UTC+8');
  const seen = new Set();
  for (let i = 1; i < 200; i++) {
    const a = E.wbPick(i - 1), b = E.wbPick(i);
    assert.notStrictEqual(a.combo, b.combo);
    seen.add(b.combo);
  }
  assert.strictEqual(seen.size, 16, 'all 4 bosses x 4 maps come up');
  assert.strictEqual(E.wbPick(77).combo, E.wbPick(77).combo, 'every PC gets the same pick');
});

/** Sets the World Boss clock (wbNow) in a sandbox. Event 46 is open on Friday 27 Nov 2026, 7:30 AM to 5:00 PM PH time. */
const setClock = (E, t) => E.run('wbNow = () => ' + t);
const openAt = E => E.wbStartsAt(46) + 3600e3; // 8:30 AM

test('World Boss run: 3,000 lives, boss money, 50,000 HP, loops without taking lives, summons speed up', () => {
  const E = loadEngine();
  E.DEV.unlockAll = true;
  setClock(E, openAt(E));
  E.createGame({ mode: 'worldboss', wbBoss: 'wbbrood', wbMap: 'wb-lava', wbWeek: 46 });
  const g = E.game;
  assert.deepStrictEqual([g.lives, g.cash, g.map.id], [3000, 10000, 'wb-lava']);
  E.startRound();
  const boss = g.balloons[0];
  assert.deepStrictEqual([boss.type, boss.hp, E.BT.wbbrood.r], ['wbbrood', 50000, 85], '2.5 times the Colossus (r 34)');
  boss.dist = g.paths[0].len - 1;
  E.update(0.1);
  assert.ok(!boss.dead && boss.dist < 50, 'at the end of the road it goes round again');
  assert.strictEqual(g.lives, 3000, 'and takes no lives');
  const mobs = () => g.balloons.filter(b => !E.BT[b.type].wb).length;
  for (let i = 0; i < 150; i++) E.update(0.1);
  assert.strictEqual(mobs(), 4, 'Broodmother: 4 balloons at 15 s');
  assert.deepStrictEqual([E.wbSummonGap(0), E.wbSummonGap(600), E.wbSummonGap(1200), E.wbSummonGap(0, 0.6)], [15, 10, 5, 9]);
  assert.ok(Math.abs(E.wbStrength(600) - 1.1046) < 1e-3 && Math.abs(E.wbStrength(1200) - 1.2202) < 1e-3);
  assert.deepStrictEqual([E.wbMob(0), E.wbMob(17.9 * 60), E.wbMob(24 * 60), E.wbMob(32 * 60)], ['green', 'rainbow', 'blimp', 'brute']);
});

test('World Boss damage: defense cuts it, every point is score, best of the week is kept, the board ranks it', () => {
  const E = loadEngine();
  E.createProfile({ name: 'Dex' });
  setClock(E, openAt(E));
  E.createGame({ mode: 'worldboss', wbBoss: 'wbbastion', wbMap: 'wb-arena', wbWeek: 46 });
  E.startRound();
  const boss = E.game.balloons[0];
  E.damageBalloon(boss, 1000, 'sharp', null);
  assert.strictEqual(Math.round(E.game.wb.damage), 600, 'Bastion takes 40% less damage');
  assert.strictEqual(boss.hp, 50000 - 600);
  E.game.lives = 1;
  const leak = E.makeBalloon('red', E.game.paths[0].len - 1, {});
  E.game.balloons.push(leak);
  E.update(0.2);
  assert.ok(E.game.over && E.game.wb.done, 'lives gone: the run ends');
  assert.strictEqual(E.store.get('wbHist', {})[46].d, 600);
  assert.strictEqual(E.wbBoard(46)[0].d, 600);
  // a worse run doesn't replace the best
  E.createGame({ mode: 'worldboss', wbBoss: 'wbbastion', wbMap: 'wb-arena', wbWeek: 46 });
  E.startRound();
  E.damageBalloon(E.game.balloons[0], 100, 'sharp', null);
  assert.strictEqual(E.wbEnd(false).best, false);
  assert.strictEqual(E.store.get('wbHist', {})[46].d, 600);
  // killing the boss: a win, plus 10 per life left
  E.createGame({ mode: 'worldboss', wbBoss: 'wbgale', wbMap: 'wb-jungle', wbWeek: 46 });
  E.startRound();
  const b = E.game.balloons[0];
  E.damageBalloon(b, 2e6, 'sharp', null);
  assert.ok(E.game.won && E.game.wb.killed);
  assert.strictEqual(E.store.get('wbHist', {})[46].d, 50000 + 3000 * 10);
  assert.strictEqual(E.game.submitted, false, 'World Boss runs never go on the stage boards');
  // 5:00 PM: a run still going ends by itself, and nothing is recorded after that
  E.createGame({ mode: 'worldboss', wbBoss: 'wbgale', wbMap: 'wb-jungle', wbWeek: 46 });
  E.startRound();
  setClock(E, E.wbEndsAt(46));
  E.update(0.1);
  assert.ok(E.game.over && E.game.wb.done, 'the run ends at 5:00 PM');
  setClock(E, E.wbEndsAt(46) + 3600e3);
  E.createGame({ mode: 'worldboss', wbBoss: 'wbgale', wbMap: 'wb-jungle', wbWeek: 46 });
  E.game.wb.damage = 9e6;
  assert.strictEqual(E.wbRecord(), false, 'closed: not recorded');
});

test('World Boss schedule: open Fridays 7:30 AM to 5:00 PM PH time; the champion is announced at 5:01 PM', () => {
  const E = loadEngine();
  const st = E.wbStartsAt(46), end = E.wbEndsAt(46);
  assert.strictEqual(new Date(st).toISOString(), '2026-11-26T23:30:00.000Z', 'Friday 27 Nov, 7:30 AM in the Philippines');
  assert.strictEqual(new Date(end).toISOString(), '2026-11-27T09:00:00.000Z', '5:00 PM');
  assert.deepStrictEqual([E.wbOpen(st - 1), E.wbOpen(st), E.wbOpen(end - 1), E.wbOpen(end), E.wbOpen(end + 864e5)], [false, true, true, false, false]);
  assert.strictEqual(E.wbOpen(E.wbStartsAt(44) + 1), false, 'events before the first one on this schedule never open');
  assert.deepStrictEqual([E.wbChampWeek(end + 59e3), E.wbChampWeek(end + 60e3)], [45, 46], 'announced at 5:01 PM');
  assert.strictEqual(E.wbChampWeek(E.wbEndsAt(44) + 120e3), -1, 'nothing before the first event');
});

test('World Boss Champion: only gold of an announced event wears the Legend border; test scores never count', () => {
  const E = loadEngine();
  const me = E.createProfile({ name: 'Gold' });
  const st = E.wbStartsAt(46), end = E.wbEndsAt(46);
  E.store.set('wbHist', { 46: { d: 5000, at: st + 1000 } });
  const other = { key: 'k-o', id: { name: 'Silv', uid: 'silv000001', tag: '1' }, wbHist: { 46: { d: 4000, at: st + 2000 } }, me: false };
  const late = { key: 'k-l', id: { name: 'Late', uid: 'late000001', tag: '2' }, wbHist: { 46: { d: 9e6, at: end + 3600e3 } }, me: false };
  const test = { key: 'k-t', id: { name: 'Test', uid: 'test000001', tag: '3' }, wbHist: { 44: { d: 9e6, at: E.wbStartsAt(44) + 1 }, 45: { d: 9e6, at: E.wbStartsAt(44) + 864e5 } }, me: false };
  const players = [E.localPlayers()[0], other, late, test];
  assert.strictEqual(E.refreshWbChamp(players, end + 30e3), '', 'before 5:01 PM nobody wears it (and the test scores never did)');
  assert.ok(!E.avatarSVG({ uid: me.uid, animal: 'fox', border: 'plain' }).includes('bdbolt'));
  assert.strictEqual(E.refreshWbChamp(players, end + 60e3), me.uid, '5:01 PM: the champion');
  assert.ok(E.avatarSVG({ uid: me.uid, animal: 'fox', border: 'plain' }).includes('bdbolt'), 'the Legend border (fangs and lightning)');
  assert.ok(!E.avatarSVG({ uid: 'silv000001', animal: 'fox', border: 'wblegend' }).includes('bdbolt'), 'nobody else, even if their save asks for it');
  assert.deepStrictEqual(Array.from(E.wbBoard(46, players), x => x.p.id.name), ['Gold', 'Silv'], 'a score set after 5:00 PM does not count');
  const c = E.wbChamp(players, end + 60e3);
  assert.deepStrictEqual([c.k, c.d, c.p.id.name], [46, 5000, 'Gold']);
  const notes = E.wbNotes(players, end + 60e3);
  assert.deepStrictEqual(Array.from(notes, n => n.id), ['wbend-46', 'wbmedal-46'], 'closed: no "the boss is here" note');
  for (const n of notes) assert.strictEqual(E.addNote(n), true);
  for (const n of notes) assert.strictEqual(E.addNote(n), false, 'each only once');
  assert.deepStrictEqual(Array.from(E.wbNotes(players, st + 1), n => n.id), ['wbstart-46'], 'while open: the boss is here');
  assert.ok(!E.BORDERS.find(b => b.id === 'wblegend').free, 'it cannot be picked by hand');
  // a week later it moves to the next champion, or nobody
  assert.strictEqual(E.refreshWbChamp(players, E.wbEndsAt(47) + 60e3), '', 'nobody fought event 47: nobody wears it');
  assert.strictEqual(E.refreshWbChamp([], end + 60e3), '');
});

/* ---------- Notifications ---------- */
test('notifications: the newest 10, unread count, saved with the profile', () => {
  const E = loadEngine();
  E.createProfile({ name: 'Nia' });
  for (let i = 0; i < 13; i++) E.addNote({ id: 'n' + i, at: 1000 + i, text: 'Note ' + i });
  const list = E.notesList();
  assert.strictEqual(list.length, 10);
  assert.strictEqual(list[0].id, 'n12');
  assert.strictEqual(E.unreadNotes(), 10);
  E.markNotesRead();
  assert.strictEqual(E.unreadNotes(), 0);
  assert.strictEqual(E.store.all().notes.length, 10, 'part of the save, so backups have it');
  assert.strictEqual(E.time12(new Date(2026, 0, 1, 15, 5).getTime()), '3:05 PM');
  assert.strictEqual(E.time12(new Date(2026, 0, 1, 0, 30).getTime()), '12:30 AM');
});

/* ---------- Chat ---------- */
test('Chat: messages go through the shared folder, with filters, a rate limit and a 24-hour life', async () => {
  const folder = fakeFolder();
  const A = loadEngine({ storageObj: fakeStorage() }), B = loadEngine({ storageObj: fakeStorage() });
  A.createProfile({ name: 'Ana' }); B.createProfile({ name: 'Ben' });
  connect(A, folder); connect(B, folder);
  assert.strictEqual(A.chatProblem('   '), 'Type a message first');
  assert.match(A.chatProblem('x'.repeat(201)), /200 characters/);
  assert.match(A.chatProblem('you are a GAGO'), /friendly/);
  const t0 = 1.8e12;
  assert.strictEqual(await A.Chat.send({ text: 'Hello everyone! \u{1F600}' }, t0), '');
  assert.match(await A.Chat.send({ text: 'again' }, t0 + 1000), /Wait a moment/);
  assert.strictEqual(await A.Chat.send({ text: 'gg' }, t0 + 4000), '');
  B.run('var got = []; function onChatMessages(l) { got.push(...l); }');
  await B.Chat.poll(t0 + 5000);
  const got = B.run('got');
  assert.deepStrictEqual(plain(got.map(m => [m.name, m.kind, m.text || m.sticker])), [['Ana', 'text', 'Hello everyone! \u{1F600}'], ['Ana', 'text', 'gg']]);
  assert.ok(got[0].title, 'with the sender\'s title');
  assert.strictEqual(B.Chat.unread(0), 2);
  await B.Chat.poll(t0 + 6000);
  assert.strictEqual(B.run('got').length, 2, 'each message is read once');
  // a forged file is ignored; after 24 hours files are deleted
  folder.sub('balloon-defense-chat').files.set('c-' + (t0 + 1) + '-bad0000001-x.json', JSON.stringify({ uid: 'bad0000001', name: '<script>', text: 'hi' }));
  await B.Chat.poll(t0 + 7000);
  assert.strictEqual(B.Chat.msgs.length, 2);
  await B.Chat.poll(t0 + 25 * 3600e3);
  assert.strictEqual(folder.sub('balloon-defense-chat').files.size, 0);
  assert.strictEqual(B.Chat.msgs.length, 0);
});

test('home PC: two PCs that claimed the same profile never hand it back and forth', async () => {
  // a v4 profile that was picked on two PCs: each PC's upgrade claims it
  const A = loadEngine(), B = loadEngine();
  A.createProfile({ name: 'Rina' });
  const slot = A.store.all(); delete slot.id.home;
  for (const E of [A, B]) {
    E.ctx.localStorage.setItem('balloonDefense.v2', JSON.stringify(slot));
    E.ctx.localStorage.removeItem('balloonDefense.pc');
    E.run('ACTIVE_KEY = roster().active');
  }
  A.migrateHome();
  let now = Date.now();
  B.run('Date.now = () => ' + (now + 60000)); // B upgrades a minute later
  B.migrateHome();
  const ha = A.readSlot('balloonDefense.v2').id.home, hb = B.readSlot('balloonDefense.v2').id.home;
  assert.ok(A.claimBeats(ha, hb), 'the PC that upgraded first keeps it');
  assert.ok(ha.at < now - 1e9, 'an upgrade claim is weaker than any real claim (Find my profile, a new profile)');
  // whichever copy is newer, both PCs agree on the same home, every time
  const folder = fakeFolder();
  for (const E of [A, B]) connect(E, folder);
  for (let i = 0; i < 6; i++) for (const E of (i % 2 ? [A, B] : [B, A])) {
    if (E.activePlayable()) { E.PROFILE.xp += 10; E.saveProfile(); }
    await E.Share.sync();
  }
  assert.strictEqual(A.readSlot('balloonDefense.v2').id.home.pc, A.thisPcId());
  assert.strictEqual(B.readSlot('balloonDefense.v2').id.home.pc, A.thisPcId());
  assert.strictEqual(B.lostProfiles().length, 1, 'B shows Find my profile for it');
  // an exact tie (two 5.0 PCs that stamped the same time) goes the same way in both merge orders
  const x = { updated: 5, id: { uid: 'u', home: { pc: 'pcA', at: 100 } } }, y = { updated: 9, id: { uid: 'u', home: { pc: 'pcB', at: 100 } } };
  assert.strictEqual(A.mergeSaves(x, y).id.home.pc, 'pcB');
  assert.strictEqual(A.mergeSaves(y, Object.assign({}, x, { updated: 20 })).id.home.pc, 'pcB');
  // Find my profile (a real time) still beats both
  assert.ok(A.claimBeats({ pc: 'pcA', at: now + 1000 }, ha) && A.claimBeats({ pc: 'pcA', at: now + 1000 }, { pc: 'pcZ', at: slot.id.created }));
});

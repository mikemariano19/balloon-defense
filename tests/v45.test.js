'use strict';
// v4.5: leaderboards (top 3 tier boards, Global and Daily Top 10), profiles across PCs, freeplay XP, Gold Mine skills,
// grid-aligned roads, notifications and automatic backups.
const test = require('node:test');
const assert = require('node:assert');
const { loadEngine, fakeStorage } = require('./harness');

/** In-memory stand-in for a FileSystemDirectoryHandle (same as share.test.js, plus nested folders). */
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
/** Each call to Date.now() in that engine is 1 s later than the last (so files and saves get distinct times). */
const tick = (E, start = 1.79e12) => E.run(`Date.now = (() => { let t = ${start}; return () => (t += 1000); })()`);
const MAP0 = 0;
const spot = (E, type) => { for (let x = 30; x < 940; x += 10) for (let y = 30; y < 580; y += 10) if (!E.spotProblem(type, x, y)) return [x, y]; throw new Error('no spot'); };
const R = (map, diff, livesLost, clock, at = 1) => ({ map, diff, ua: false, cleared: true, round: 40, livesLost, livesLeft: 100 - livesLost, clock, at });
const P = (name, runs = {}, extra = {}) => Object.assign({ key: 'k-' + name, id: { name, uid: ('u' + name.toLowerCase() + '000000').slice(0, 10) }, runs, me: false, dailyRuns: {} }, extra);

/* ---------- Leaderboards ---------- */
test('board sizes: tier and stage boards top 3, Global and Daily top 10', () => {
  const E = loadEngine();
  assert.strictEqual(E.BOARD_SIZE, 3);
  assert.strictEqual(E.GLOBAL_SIZE, 10);
  assert.strictEqual(E.DAILY_SIZE, 10);
});

test('Global board: medal points (gold 3, silver 2, bronze 1), ties, medals move when a run is beaten, crown for #1', () => {
  const E = loadEngine();
  const m = E.MAPS.map(x => x.id), st = (i) => m[i] + ':easy:std', run = (i, lost, at = 1) => R(m[i], 'easy', lost, 100, at);
  // stage 1: Quinn gold, Wren silver, Xav bronze · stage 2: Xav alone (gold) · stages 3 and 4: Vera gold, Yuki silver
  const Q = P('Quinn', { [st(1)]: run(1, 0) }), W = P('Wren', { [st(1)]: run(1, 1) });
  const X = P('Xav', { [st(1)]: run(1, 2), [st(2)]: run(2, 0) });
  const V = P('Vera', { [st(3)]: run(3, 0), [st(4)]: run(4, 0) }), Y = P('Yuki', { [st(3)]: run(3, 1), [st(4)]: run(4, 1) });
  const Z = P('Zed'); // no runs: not listed
  let board = E.globalBoard([Q, W, X, V, Y, Z]);
  assert.deepStrictEqual(Array.from(board, x => [x.p.id.name, x.points]), [['Vera', 6], ['Xav', 4], ['Yuki', 4], ['Quinn', 3], ['Wren', 2]]);
  assert.deepStrictEqual([board[1].gold, board[1].silver, board[1].bronze], [1, 0, 1], 'Xav: 1 gold + 1 bronze');
  assert.strictEqual(board[1].rank, 2, 'equal points: more golds ranks higher (Xav 1 gold, Yuki 0)');
  // equal points, golds and silvers: whoever got there first
  const A = P('Ann', { [st(5)]: run(5, 0, 10) }), B = P('Ben', { [st(6)]: run(6, 0, 5) });
  assert.deepStrictEqual(Array.from(E.globalBoard([A, B]), x => x.p.id.name), ['Ben', 'Ann']);
  // Wren beats Quinn on stage 1: Quinn drops to silver (3 -> 2), Wren rises to gold (2 -> 3) straight away
  W.runs[st(1)] = run(1, 0, 0);
  board = E.globalBoard([Q, W, X, V, Y]);
  const pts = Object.fromEntries(Array.from(board, x => [x.p.id.name, x.points]));
  assert.strictEqual(pts.Wren, 3);
  assert.strictEqual(pts.Quinn, 2);
  // the crown: Global #1 only
  assert.strictEqual(E.refreshCrown([Q, W, X, V, Y]), V.id.uid);
  assert.match(E.avatarSVG(V.id, 40), /crowned/);
  assert.doesNotMatch(E.avatarSVG(Q.id, 40), /crowned/);
  // 12 players with a gold each: all are ranked (the home page shows the first 10)
  const many = Array.from({ length: 12 }, (_, i) => P('Pl' + String(i).padStart(2, '0'), { [st(i)]: run(i, 0) }));
  assert.strictEqual(E.globalBoard(many).length, 12);
});

test('rank arrows compare with the board\'s previous order on this PC', () => {
  const E = loadEngine();
  assert.deepStrictEqual({ ...E.rankMoves('global', [{ uid: 'a', rank: 1 }, { uid: 'b', rank: 2 }]) }, { a: 0, b: 0 }, 'nothing to compare with yet');
  assert.deepStrictEqual({ ...E.rankMoves('global', [{ uid: 'a', rank: 1 }, { uid: 'b', rank: 2 }]) }, { a: 0, b: 0 });
  const order = [{ uid: 'b', rank: 1 }, { uid: 'c', rank: 2 }, { uid: 'a', rank: 3 }];
  assert.deepStrictEqual({ ...E.rankMoves('global', order) }, { b: 1, c: 'new', a: -2 });
  assert.deepStrictEqual({ ...E.rankMoves('global', order) }, { b: 1, c: 'new', a: -2 }, 'arrows stay until the order changes again');
  assert.deepStrictEqual({ ...E.rankMoves('daily:2026-11-12', order) }, { b: 0, c: 0, a: 0 }, 'each board has its own memory');
});

test('Daily board: wins first, then fastest, then most lives; each player keeps their best try', () => {
  const E = loadEngine();
  E.createProfile({ name: 'Dee' });
  const day = '2026-11-12', g = (o) => Object.assign({ daily: day, won: false, round: 10, lives: 0, clock: 500 }, o);
  assert.strictEqual(E.saveDailyRun(g({ round: 12 })), true, 'first try is kept');
  assert.strictEqual(E.saveDailyRun(g({ round: 9 })), false, 'a worse loss is not');
  assert.strictEqual(E.saveDailyRun(g({ won: true, lives: 50, clock: 900 })), true, 'a win beats any loss');
  assert.strictEqual(E.saveDailyRun(g({ won: true, lives: 40, clock: 100 })), true, 'faster wins, even with fewer lives');
  assert.strictEqual(E.saveDailyRun(g({ won: true, lives: 30, clock: 100 })), false, 'same time, fewer lives');
  assert.strictEqual(E.saveDailyRun(g({ won: true, lives: 45, clock: 100 })), true, 'same time, more lives');
  const once = g({ won: true, lives: 99, clock: 1 });
  assert.strictEqual(E.saveDailyRun(once), true);
  assert.strictEqual(E.saveDailyRun(once), false, 'one game counts once (a later freeplay loss adds nothing)');
  assert.strictEqual(E.localPlayers()[0].dailyRuns[day].lives, 99);
  const dr = (won, lives, clock, round = 30) => ({ [day]: { won, lives, clock, round, at: 1 } });
  const players = [P('Lo', {}, { dailyRuns: dr(false, 0, 300, 25) }), P('Hi', {}, { dailyRuns: dr(true, 80, 700) }), P('Mid', {}, { dailyRuns: dr(true, 80, 600) }),
    P('Win', {}, { dailyRuns: dr(true, 20, 100) }), P('Tie', {}, { dailyRuns: dr(true, 90, 600) }), P('None')];
  assert.deepStrictEqual(Array.from(E.dailyBoard(day, players), x => x.p.id.name), ['Win', 'Tie', 'Mid', 'Hi', 'Lo']);
  assert.strictEqual(E.dailyBoard('2026-11-11', players).length, 0, 'another day has its own board');
});

/* ---------- Gameplay ---------- */
test('freeplay (after the last round) gives no tower XP; the last round still does', () => {
  const E = loadEngine();
  E.createGame({ mapIdx: MAP0, diffKey: 'easy' });
  E.game.cash = 1e6;
  E.placeTower('dart', ...spot(E, 'dart'));
  E.game.round = 39;
  E.startRound(); E.game.spawnQ = []; E.game.balloons = []; E.update(0.01);
  assert.strictEqual(E.game.won, true, 'round 40 wins Easy');
  const xp = E.tprog('dart').xp;
  assert.ok(xp > 0, 'the last round earns tower XP');
  E.startRound(); E.game.spawnQ = []; E.game.balloons = []; E.update(0.01);
  assert.strictEqual(E.game.round, 41);
  assert.strictEqual(E.tprog('dart').xp, xp, 'no tower XP in freeplay');
});

test('Gold Mine skill points: income, vault, discount and Payday recharge all work', () => {
  const E = loadEngine();
  assert.deepStrictEqual(Array.from(E.perkList('mine'), k => k.id), ['income', 'vault', 'cost', 'cd']);
  assert.ok(E.perkList('dart').some(k => k.id === 'range'), 'other towers keep their skills');
  E.tprog('mine').total = E.towerXpForLevel(20);
  E.tprog('mine').perks = { range: 5, rate: 5 }; // points spent in v4.0 on skills that did nothing: free again
  assert.strictEqual(E.spentPoints('mine'), 0);
  for (const id of ['income', 'vault', 'cost', 'cd']) for (let i = 0; i < 5; i++) E.setPerk('mine', id, 1);
  assert.deepStrictEqual({ ...E.perksFor('mine') }, { income: 5, vault: 5, cost: 5, cd: 4 });
  E.createGame({ mapIdx: MAP0, diffKey: 'medium' });
  const base = E.statsFor('mine', [0, 0, 0], null), up = E.statsFor('mine', [0, 0, 0]);
  assert.strictEqual(up.income, Math.round(base.income * 1.15), '+3% income per point');
  assert.strictEqual(up.vaultCap, Math.round(base.vaultCap * 1.5), '+10% vault cap per point');
  assert.ok(up.cdMul < 1, 'Payday recharges faster');
  assert.strictEqual(E.price(1000, 'mine'), 900, '-2% cost per point');
});

test('Gold Mines pay every 10 seconds of a round, not at its end; Payday collects 5 or 8 payouts', () => {
  const E = loadEngine();
  E.DEV.unlockAll = true;
  E.createGame({ mapIdx: MAP0, diffKey: 'medium' });
  E.game.cash = 1e5;
  const t = E.placeTower('mine', ...spot(E, 'mine'));
  const run = sec => { for (let i = 0; i < sec * 4; i++) E.update(0.25); };
  const gained = fn => { const before = E.game.cash; fn(); return E.game.cash - before; };
  assert.strictEqual(gained(() => run(30)), 0, 'nothing between rounds');
  E.startRound();
  E.game.spawnQ = [{ at: 1e9, type: 'red' }]; // holds the round open
  assert.strictEqual(gained(() => run(9.75)), 0);
  assert.strictEqual(gained(() => run(0.25)), t.s.income, 'first payout at 10 s');
  assert.strictEqual(gained(() => run(20)), 2 * t.s.income);
  E.game.spawnQ = [];
  E.game.balloons = [];
  assert.strictEqual(gained(() => E.update(0.25)), E.roundBonus(1), 'the end of a round pays no mine gold');
  // a round held open after its last balloon came out stops paying
  E.startRound();
  E.game.spawnQ = [];
  E.game.balloons = [E.makeBalloon('red', 0)];
  E.game.balloons[0].frozen = 1e9;
  E.game.towers[0].payT = 0;
  assert.strictEqual(gained(() => run(300)), 12 * t.s.income, 'at most MINE_GRACE seconds of payouts');
  for (let i = 0; i < 3; i++) E.upgrade(t, 0);
  assert.strictEqual(gained(() => E.useAbility(t)), 5 * t.s.income, 'Payday');
  E.upgrade(t, 0);
  E.game.abCd.mine = 0;
  assert.strictEqual(gained(() => E.useAbility(t)), 8 * t.s.income, 'stronger Payday');
});

test('roads line up with the grid: straight roads are 2 tiles wide with no blocked strip beside them', () => {
  const E0 = loadEngine();
  for (let i = 0; i < E0.MAPS.length; i++) {
    const E = loadEngine();
    E.createGame({ mapIdx: i, diffKey: 'medium' });
    const g = E.game, id = E0.MAPS[i].id;
    for (const p of g.paths)
      for (const s of p.segs) {
        if (s.x1 === s.x2) assert.strictEqual(s.x1 % E.TILE, 0, id + ': vertical road on a grid line');
        if (s.y1 === s.y2) assert.strictEqual(s.y1 % E.TILE, 0, id + ': horizontal road on a grid line');
      }
    for (let r = 0; r < E.ROWS; r++) for (let c = 0; c < E.COLS; c++)
      if (g.grid[r * E.COLS + c] === E.G_ROAD) assert.ok(E.distToPaths(g.paths, c * E.TILE + 12, r * E.TILE + 12) < E.ROAD_HALF + 2, id + ' road tile ' + c + ',' + r + ' is under the road');
  }
  const E = loadEngine();
  E.createGame({ mapIdx: MAP0, diffKey: 'medium' });
  const seg = E.game.paths[0].segs.find(s => s.y1 === s.y2 && s.len > 150);
  const col = Math.floor((Math.min(seg.x1, seg.x2) + 80) / E.TILE), row = seg.y1 / E.TILE, at = (r) => E.game.grid[r * E.COLS + col];
  assert.deepStrictEqual([row - 2, row - 1, row, row + 1].map(r => at(r) === E.G_ROAD), [false, true, true, false], 'exactly the 2 tiles under the road');
});

/* ---------- Profiles ---------- */
test('profiles: unique names, one profile per PC that plays only there, only the owner PC deletes', () => {
  const storageObj = fakeStorage();
  const E = loadEngine({ storageObj });
  assert.strictEqual(E.canCreateProfile(), true);
  const me = E.createProfile({ name: 'Mika' });
  assert.strictEqual(E.isPcOwner(me.uid), true);
  assert.strictEqual(E.homeHere(E.getId()), true, '5.0: the profile\'s home is this PC');
  assert.strictEqual(E.activePlayable(), true);
  assert.strictEqual(E.canCreateProfile(), false, 'this PC already made its profile');
  assert.strictEqual(E.nameTaken('mika'), true, 'names are unique, ignoring case');
  assert.strictEqual(E.nameTaken(' MIKA ', me.uid), false, 'keeping your own name is fine');
  assert.strictEqual(E.nameTaken('Juno'), false);
  assert.strictEqual(E.run('typeof allowExtraProfile'), 'undefined', '5.0: "Add another player on this PC" is gone');
  const E2 = loadEngine({ storageObj });
  assert.strictEqual(E2.deleteActiveProfile(), me.uid);
  const E3 = loadEngine({ storageObj });
  assert.strictEqual(E3.hasProfile(), false);
  assert.strictEqual(E3.canCreateProfile(), true, 'with its own profile deleted, the PC may create one again');
});

test('a v4.0 PC with players: its first profile becomes the PC\'s own', () => {
  const storageObj = fakeStorage();
  storageObj.setItem('balloonDefense.v2', JSON.stringify({ id: { name: 'Oldie', tag: '1111', uid: 'oldie00001' } }));
  const E = loadEngine({ storageObj });
  assert.strictEqual(E.isPcOwner('oldie00001'), true);
  assert.strictEqual(E.canCreateProfile(), false);
});

test('mergeSaves keeps progress from both PCs: larger counters, best runs, more tower XP, every daily', () => {
  const E = loadEngine();
  const a = { updated: 100, id: { name: 'Old', uid: 'x' }, profile: { pops: 900, wins: 3, xp: 50, built: { dart: 4 } }, runs: { 'meadow:easy:std': R('meadow', 'easy', 0, 200) },
    records: { meadow: { easy: { best: 40, won: true }, modes: { reverse: true } } }, towers: { dart: { xp: 10, total: 900 }, bomb: { xp: 5, total: 5 } }, daily: { '2026-11-10': true },
    dailyRuns: { '2026-11-10': { won: true, lives: 90, clock: 10, round: 40 } } };
  const b = { updated: 200, id: { name: 'New', uid: 'x' }, profile: { pops: 500, wins: 5, xp: 70, built: { tack: 2 } }, runs: { 'meadow:easy:std': R('meadow', 'easy', 2, 100), 'pond:hard:std': R('pond', 'hard', 0, 1) },
    records: { meadow: { easy: { best: 20, won: false }, medium: { best: 7, won: false } } }, towers: { dart: { xp: 0, total: 100 }, tack: { xp: 3, total: 30 } }, daily: { '2026-11-11': true },
    dailyRuns: { '2026-11-10': { won: true, lives: 10, clock: 5, round: 40 } } };
  const m = E.mergeSaves(a, b);
  assert.strictEqual(m.id.name, 'New', 'the newer copy wins');
  assert.deepStrictEqual([m.profile.pops, m.profile.wins, m.profile.xp], [900, 5, 70], 'counters take the larger value');
  assert.deepStrictEqual({ ...m.profile.built }, { dart: 4, tack: 2 });
  assert.strictEqual(m.runs['meadow:easy:std'].livesLost, 0, 'best run per stage');
  assert.ok(m.runs['pond:hard:std']);
  assert.deepStrictEqual({ ...m.records.meadow.easy }, { best: 40, won: true });
  assert.ok(m.records.meadow.modes.reverse && m.records.meadow.medium);
  assert.strictEqual(m.towers.dart.total, 900, 'the copy that earned more tower XP');
  assert.ok(m.towers.bomb && m.towers.tack);
  assert.deepStrictEqual(Object.keys(m.daily).sort(), ['2026-11-10', '2026-11-11']);
  assert.strictEqual(m.dailyRuns['2026-11-10'].clock, 5, 'the faster daily win');
  assert.strictEqual(m.updated, 200);
});

/* ---------- Across PCs (shared folder) ---------- */
test('5.0: a profile plays only on its own PC; Find my profile moves it, and the old PC lets go', async () => {
  const folder = fakeFolder();
  const pcA = fakeStorage(), pcB = fakeStorage();
  const A = loadEngine({ storageObj: pcA });
  tick(A, 1.79e12);
  const alice = A.createProfile({ name: 'Alice' });
  A.saveRun(R('meadow', 'easy', 0, 300));
  A.tprog('dart').total = 5000; A.tprog('dart').xp = 1234; A.tprog('dart').unl['0-3'] = 1; A.saveTprog();
  await A.Share.syncWith(folder);
  const file = JSON.parse(folder.sub('balloon-defense-players').files.get('p-' + alice.uid + '.json'));
  assert.ok(file.save && file.save.towers.dart.xp === 1234, 'the whole save is in the shared folder');
  assert.ok(file.inuse && file.inuse.pc === A.thisPcId(), 'the active player says "online on this PC"');

  // PC B: Alice shows as a player from another PC, view-only, online while PC A plays her
  let B = loadEngine({ storageObj: pcB });
  tick(B, 1.79e12 + 5000);
  connect(B, folder);
  await B.Share.syncWith(folder);
  const remote = B.allPlayers().find(p => p.id.name === 'Alice');
  assert.ok(remote && remote.remote);
  assert.strictEqual(B.isOnline(remote, 1.79e12 + 60000), true, 'green dot');
  assert.strictEqual(B.isOnline(remote, 1.79e12 + 10 * 60000), false, 'gray dot 2 minutes after PC A stops');
  assert.strictEqual(B.inUseElsewhere(alice.uid, 1.79e12 + 60000), true, 'can\'t be moved while it is being played');
  assert.strictEqual(B.run('typeof importProfile'), 'undefined', '5.0: no more "Play as" on another PC');
  // PC A's browser data is gone; Alice finds her profile on PC B
  const key = B.moveProfileHere(await B.Share.copiesOf(alice.uid));
  assert.ok(key);
  B = loadEngine({ storageObj: pcB });
  tick(B, 1.79e12 + 100000);
  connect(B, folder);
  assert.strictEqual(B.getId().uid, alice.uid);
  assert.strictEqual(B.activePlayable(), true, 'Alice plays on PC B now');
  assert.ok(B.runs()['meadow:easy:std'], 'runs came along');
  assert.deepStrictEqual([B.tprog('dart').xp, B.tprog('dart').total, B.tprog('dart').unl['0-3']], [1234, 5000, 1], 'tower XP, level and unlocks came along');
  await B.Share.pushActive();
  // PC A (still has the old copy) learns at its next sync that Alice moved: it can't play her any more
  tick(A, 1.79e12 + 200000);
  await A.Share.syncWith(folder);
  assert.strictEqual(A.activePlayable(), false);
  assert.strictEqual(A.migrateHome(), true, 'PC A switches to an empty slot');
  const A2 = loadEngine({ storageObj: pcA });
  assert.strictEqual(A2.hasProfile(), false);
  assert.strictEqual(A2.canCreateProfile(), true);
});

test('a deleted profile disappears from every PC; "remove from this PC" leaves the shared copy', async () => {
  const folder = fakeFolder();
  const pcA = fakeStorage(), pcB = fakeStorage();
  const A = loadEngine({ storageObj: pcA });
  const alice = A.createProfile({ name: 'Alice' });
  await A.Share.syncWith(folder);
  const B = loadEngine({ storageObj: pcB });
  B.createProfile({ name: 'Bob' });
  await B.Share.syncWith(folder);
  // a v4.5 copy of Alice left on PC B (from "Play as"): it stays there, view-only
  const copyKey = 'balloonDefense.p.copy';
  pcB.setItem(copyKey, JSON.stringify(B.saveFromShared(B.sharedCache().players.find(o => o.uid === alice.uid))));
  const r = B.roster(); r.keys.push(copyKey); B.saveRoster(r);
  assert.strictEqual(B.localPlayers().length, 2, 'Bob and a copy of Alice on PC B');
  // PC A (Alice's own PC) deletes her
  connect(A, folder);
  const uid = A.deleteActiveProfile();
  assert.strictEqual(uid, alice.uid);
  await A.Share.tombstone(uid);
  await B.Share.syncWith(folder);
  assert.deepStrictEqual(Array.from(B.allPlayers(), p => p.id.name), ['Bob'], 'PC B dropped its copy instead of bringing her back');
  assert.ok(JSON.parse(folder.sub('balloon-defense-players').files.get('p-' + uid + '.json')).deleted);
  // removing a copy only touches this PC
  const C = loadEngine({ storageObj: fakeStorage() });
  C.createProfile({ name: 'Cleo' });
  await C.Share.syncWith(folder);
  const files = folder.sub('balloon-defense-players').files.size;
  const bobOnC = 'balloonDefense.p.bob';
  C.ctx.localStorage.setItem(bobOnC, JSON.stringify(C.saveFromShared(C.sharedCache().players.find(o => o.id && o.id.name === 'Bob'))));
  const rc = C.roster(); rc.keys.push(bobOnC); C.saveRoster(rc);
  assert.strictEqual(C.removePlayer(bobOnC), true);
  await C.Share.syncWith(folder);
  assert.strictEqual(folder.sub('balloon-defense-players').files.size, files, 'Bob\'s file is still there');
  assert.ok(C.allPlayers().some(p => p.id.name === 'Bob' && p.remote), 'and Bob still shows as a player from another PC');
});

test('planSync (5.0): progress merges both ways, deleted ones go, the active player always writes its heartbeat', () => {
  const E = loadEngine();
  const slot = (uid, updated, xp = 0) => ({ updated, id: { name: 'X', uid }, profile: { built: {}, xp } });
  const found = new Map([
    ['newer0', { uid: 'newer0', pc: 'other', updated: 200, save: { updated: 200, id: { name: 'X', uid: 'newer0' }, profile: { built: {}, xp: 50 } } }],
    ['older0', { uid: 'older0', pc: 'other', updated: 50, save: { id: { name: 'X', uid: 'older0' }, profile: { built: {}, xp: 0 } } }],
    ['lost00', { uid: 'lost00', pc: 'other', updated: 999, save: { id: { name: 'X', uid: 'lost00' }, profile: { built: {}, xp: 1 } } }],
    ['gone00', { uid: 'gone00', deleted: true }],
    ['v1file', { uid: 'v1file', pc: '', updated: 999, save: null }],
  ]);
  const locals = [
    { key: 'kN', uid: 'newer0', me: false, slot: slot('newer0', 100) },
    { key: 'kO', uid: 'older0', me: false, slot: slot('older0', 100) },
    { key: 'kL', uid: 'lost00', me: false, slot: slot('lost00', 100, 900) }, // newer folder copy with LESS progress
    { key: 'kG', uid: 'gone00', me: false, slot: slot('gone00', 100) },
    { key: 'kV', uid: 'v1file', me: false, slot: slot('v1file', 100) },
    { key: 'kM', uid: 'mine00', me: true, slot: slot('mine00', 100) },
  ];
  const plan = E.planSync(locals, found, 'here', false);
  assert.deepStrictEqual(Array.from(plan.merges, x => x.key), ['kN'], 'the folder copy had more progress');
  assert.deepStrictEqual(Array.from(plan.removes), ['kG']);
  assert.deepStrictEqual(Array.from(plan.writes), ['lost00', 'v1file', 'mine00'], 'a newer file with less progress is fixed, not copied');
  assert.strictEqual(plan.reload, false);
  // the active player: merged straight away (no progress waits); the page reloads only when it may
  const busy = [{ key: 'kN', uid: 'newer0', me: true, slot: Object.assign(slot('newer0', 100), { run: { round: 7 }, settings: { sound: true } }) }];
  const p1 = E.planSync(busy, found, 'here', false);
  assert.deepStrictEqual([Array.from(p1.merges, x => x.key), Array.from(p1.writes), p1.reload], [['kN'], ['newer0'], false]);
  const p2 = E.planSync(busy, found, 'here', true);
  assert.strictEqual(p2.reload, true);
  assert.strictEqual(p2.merges[0].data.run.round, 7, 'a half-played game stays on this PC');
  assert.strictEqual(p2.merges[0].data.settings.sound, true, 'so do this PC\'s settings');
  assert.strictEqual(p2.merges[0].data.profile.xp, 50);
});

test('notifications: other PCs see a finished game for 10 minutes; old event files are cleaned up', async () => {
  const folder = fakeFolder();
  const A = loadEngine({ storageObj: fakeStorage() }), B = loadEngine({ storageObj: fakeStorage() });
  const id = A.createProfile({ name: 'Alice' });
  connect(A, folder);
  A.createGame({ mapIdx: MAP0, diffKey: 'hard' });
  Object.assign(A.game, { round: 80, lives: 87, cash: 12400.6, won: true });
  await A.Share.postEvent(A.gameEvent(A.game, id));
  const dir = folder.sub('balloon-defense-events');
  dir.files.set('e-' + (Date.now() - 2 * 864e5) + '-old0000001.json', '{}');
  B.run('var got = []; function onPlayerEvent(e) { got.push(e); }');
  await B.Share.readEvents(folder);
  const got = B.run('got');
  assert.strictEqual(got.length, 1);
  assert.deepStrictEqual([got[0].name, got[0].won, got[0].round, got[0].lives, got[0].cash, got[0].towers, got[0].diff, got[0].map], ['Alice', true, 80, 87, 12400, 0, 'hard', A.MAPS[MAP0].id]);
  assert.strictEqual(dir.files.size, 1, 'the 2-day-old event file was removed');
  await B.Share.readEvents(folder);
  assert.strictEqual(B.run('got').length, 1, 'each event is shown once');
  A.run('var mine = []; function onPlayerEvent(e) { mine.push(e); }');
  await A.Share.readEvents(folder);
  assert.strictEqual(A.run('mine').length, 0, 'a PC doesn\'t notify itself');
  assert.strictEqual(B.cleanEvent({ uid: 'x', pc: 'y', name: '<b>', map: 'meadow', diff: 'easy' }), null, 'bad names are rejected');
});

test('automatic backups (5.0): the 10 newest copies in the shared folder, each one restorable', async () => {
  const folder = fakeFolder();
  const A = loadEngine({ storageObj: fakeStorage() });
  const id = A.createProfile({ name: 'Alice' });
  A.saveRun(R('meadow', 'easy', 0, 300));
  connect(A, folder);
  tick(A);
  for (let i = 0; i < 13; i++) assert.strictEqual(await A.Share.autoBackup(), true);
  const dir = folder.sub('balloon-defense-backups').sub(id.uid);
  assert.strictEqual(dir.files.size, 10, 'the 10 newest are kept (all on the same day here)');
  const list = await A.Share.listBackups();
  assert.strictEqual(list.length, 10);
  assert.ok(list[0].at > list[9].at, 'newest first');
  const data = await A.Share.loadBackup(list[0].at, 'folder');
  assert.strictEqual(data.id.uid, id.uid);
  assert.ok(data.runs['meadow:easy:std']);
  assert.ok(A.store.get('autoBackupAt', 0) > 0, 'the time of the last backup is shown in Settings');
});

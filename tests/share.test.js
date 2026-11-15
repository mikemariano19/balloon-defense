'use strict';
// Shared folder: two "PCs" (separate storage) sync their players through one fake folder.
const test = require('node:test');
const assert = require('node:assert');
const { loadEngine, fakeStorage } = require('./harness');

/** A tiny in-memory stand-in for the browser's FileSystemDirectoryHandle. */
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
const run = (map, diff, livesLost, clock) => ({ map, diff, ua: false, cleared: true, round: 40, livesLost, livesLeft: 100 - livesLost, clock, at: 1 });

test('shared folder: players and scores from other PCs show up on the boards and profiles', async () => {
  const folder = fakeFolder();
  const pcA = fakeStorage(), pcB = fakeStorage();
  const A = loadEngine({ storageObj: pcA });
  A.createProfile({ name: 'Alice' });
  A.saveRun(run('meadow', 'easy', 0, 300));
  const B = loadEngine({ storageObj: pcB });
  B.createProfile({ name: 'Bob' });
  B.saveRun(run('meadow', 'easy', 3, 280));

  assert.strictEqual(A.allPlayers().length, 1, 'before syncing each PC only knows itself');
  await A.Share.syncWith(folder);
  await B.Share.syncWith(folder);
  await A.Share.syncWith(folder);
  assert.strictEqual(A.Share.state, 'on');
  assert.strictEqual(folder.sub('balloon-defense-players').files.size, 2, 'one file per player');

  for (const [E, me, other] of [[A, 'Alice', 'Bob'], [B, 'Bob', 'Alice']]) {
    const all = E.allPlayers();
    assert.deepStrictEqual(Array.from(all, p => p.id.name), [me, other]);
    assert.strictEqual(all[1].remote, true);
    assert.ok(all[1].key.startsWith('shared:'));
    const board = E.stageRanking('meadow', 'easy', false);
    assert.deepStrictEqual(Array.from(board, x => x.p.id.name), ['Alice', 'Bob'], 'Alice lost fewer lives');
  }
  assert.strictEqual(B.medalsOf(B.allPlayers()[1].key).gold, 1, 'medals count for players on other PCs too');
  // the cache keeps the other PC's players while the folder is unavailable
  const B2 = loadEngine({ storageObj: pcB });
  assert.strictEqual(B2.allPlayers().length, 2);
  // newer scores travel on the next sync
  A.saveRun(run('meadow', 'medium', 0, 500));
  await A.Share.syncWith(folder);
  await B.Share.syncWith(folder);
  assert.ok(B.allPlayers()[1].runs['meadow:medium:std'], 'Alice\'s new run reached PC B');
});

test('shared folder: damaged or foreign files are ignored, removed players disappear, errors keep the game running', async () => {
  const folder = fakeFolder();
  const A = loadEngine({ storageObj: fakeStorage() });
  A.createProfile({ name: 'Alice' });
  await A.Share.syncWith(folder);
  const dir = folder.sub('balloon-defense-players');
  dir.files.set('p-abcdef123.json', '{ half written');
  dir.files.set('notes.txt', 'hello');
  dir.files.set('p-zzzzzz999.json', JSON.stringify({ uid: 'zzzzzz999', id: { name: 'x', tag: '1234' } })); // name too short
  dir.files.set('p-mismatch01.json', JSON.stringify({ uid: 'other0001', id: { name: 'Mallory', tag: '1234' } })); // uid != file name
  dir.files.set('p-carol00001.json', JSON.stringify({ uid: 'carol00001', id: { name: 'Carol', tag: '4321', animal: 'owl' }, profile: { xp: 50 }, runs: [], updated: 5 }));
  await A.Share.syncWith(folder);
  assert.deepStrictEqual(Array.from(A.allPlayers(), p => p.id.name), ['Alice', 'Carol']);
  assert.deepStrictEqual({ ...A.allPlayers()[1].runs }, {}, 'an array where an object belongs is dropped');
  dir.files.delete('p-carol00001.json');
  await A.Share.syncWith(folder);
  assert.strictEqual(A.allPlayers().length, 1);
  // a folder that fails (network drive gone) reports an error but nothing throws
  const broken = { name: 'gone', async getDirectoryHandle() { throw new Error('The network path was not found'); } };
  await A.Share.syncWith(broken);
  assert.strictEqual(A.Share.state, 'error');
  assert.match(A.Share.error, /network path/);
  // remote players can't be switched to or removed from this PC
  assert.strictEqual(A.switchPlayer('shared:carol00001'), false);
  assert.strictEqual(A.removePlayer('shared:carol00001'), false);
});

test('older profiles get a cross-PC id once, and keep it', () => {
  const storageObj = fakeStorage();
  storageObj.setItem('balloonDefense.v2', JSON.stringify({ id: { name: 'Oldie', tag: '1111', animal: 'fox' } }));
  const E = loadEngine({ storageObj });
  const uid = E.localPlayers()[0].id.uid;
  assert.match(uid, /^[a-z0-9]{6,20}$/);
  assert.strictEqual(loadEngine({ storageObj }).getId().uid, uid);
});

test('game folder path: network share, mapped drive, own disk', () => {
  const E = loadEngine({ storageObj: fakeStorage() });
  const g = (h) => JSON.parse(JSON.stringify(E.gameFolder(h)));
  assert.deepStrictEqual(g('file://officeserver/Games/Balloon%20Defense/index.html'), { kind: 'network', path: String.raw`\\officeserver\Games\Balloon Defense` });
  assert.deepStrictEqual(g('file:///S:/Games/balloons_td/index.html'), { kind: 'drive', path: String.raw`S:\Games\balloons_td` });
  assert.deepStrictEqual(g('file:///C:/Users/me/Desktop/balloons_td/index.html'), { kind: 'local', path: String.raw`C:\Users\me\Desktop\balloons_td` });
  assert.strictEqual(g('https://example.github.io/game/').kind, 'web');
});

test('a read-only shared folder gives a clear message', async () => {
  const A = loadEngine({ storageObj: fakeStorage() });
  A.createProfile({ name: 'Alice' });
  const ro = fakeFolder();
  const sub = await ro.getDirectoryHandle('balloon-defense-players', { create: true });
  sub.getFileHandle = async () => { throw Object.assign(new Error('denied'), { name: 'NoModificationAllowedError' }); };
  await A.Share.syncWith(ro);
  assert.strictEqual(A.Share.state, 'error');
  assert.match(A.Share.error, /read-only/);
});

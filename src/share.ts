/* Balloon Defense — shared folder: see the players and scores from other office PCs.
   Every PC connects the game to the same folder on a shared network drive (once, with the browser's folder picker).
   Each player is one small JSON file in <folder>/balloon-defense-players/, written by the PC they play on and read by
   every other PC. It uses the File System Access API built into Edge and Chrome: nothing is installed and nothing leaves
   the office network. No DOM access at load time, so the tests can load this file too. */
const SHARE_DIR = 'balloon-defense-players';
const SHARE_FILE = /^p-([a-z0-9]{6,20})\.json$/;
/** Where this copy of the game was opened from, as a Windows path, so each PC knows which folder to pick.
    kind: 'network' (\\server\share\…), 'drive' (a drive letter: shared if it's a mapped network drive), 'local' (C:), 'web' (not a file). */
function gameFolder(href = typeof location !== 'undefined' ? location.href : '') {
    let u;
    try {
        u = new URL(href);
    }
    catch (e) {
        return { kind: 'web', path: '' };
    }
    if (u.protocol !== 'file:')
        return { kind: 'web', path: '' };
    const dir = decodeURIComponent(u.pathname).replace(/\/[^/]*$/, '');
    if (u.host)
        return { kind: 'network', path: '\\\\' + u.host + dir.replace(/\//g, '\\') };
    const m = /^\/([A-Za-z]):(.*)$/.exec(dir);
    if (!m)
        return { kind: 'web', path: '' };
    const path = m[1].toUpperCase() + ':' + (m[2] || '/').replace(/\//g, '\\');
    return { kind: m[1].toUpperCase() === 'C' ? 'local' : 'drive', path };
}
/* The folder handle is kept in IndexedDB (localStorage can't hold it), so the next visit can reuse it. */
function idbReq(mode, fn) {
    return new Promise((res, rej) => {
        const open = indexedDB.open('balloonDefense', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('kv');
        open.onerror = () => rej(open.error);
        open.onsuccess = () => {
            const tx = open.result.transaction('kv', mode), r = fn(tx.objectStore('kv'));
            tx.oncomplete = () => { res(r && r.result); open.result.close(); };
            tx.onerror = () => { rej(tx.error); open.result.close(); };
        };
    });
}
const idbGet = (k): Promise<any> => idbReq('readonly', s => s.get(k)) as Promise<any>;
const idbSet = (k, v) => idbReq('readwrite', s => s.put(v, k));
const idbDel = (k) => idbReq('readwrite', s => s.delete(k));
function notifyShare() { if (typeof onShareChange === 'function')
    onShareChange(); }
const Share = {
    /** 'unsupported' (browser has no folder access) | 'off' (no folder yet) | 'paused' (needs a click to allow again) | 'syncing' | 'on' | 'error' */
    state: 'off',
    handle: null,
    folder: '',
    error: '',
    lastSync: 0,
    wrote: false,
    chain: Promise.resolve(),
    supported() { return typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function' && typeof indexedDB !== 'undefined'; },
    connected() { return this.state === 'on' || this.state === 'syncing'; },
    /** At start-up: reuse the folder picked last time if the browser still allows it. */
    async init() {
        if (!this.supported()) {
            this.state = 'unsupported';
            return notifyShare();
        }
        try {
            this.handle = await idbGet('shareDir');
        }
        catch (e) {
            this.handle = null;
        }
        if (!this.handle) {
            this.state = 'off';
            return notifyShare();
        }
        this.folder = this.handle.name;
        let p = 'prompt';
        try {
            p = await this.handle.queryPermission({ mode: 'readwrite' });
        }
        catch (e) { }
        if (p === 'granted')
            await this.sync();
        else {
            this.state = 'paused';
            notifyShare();
        }
    },
    /** Pick the shared folder (must run from a click). */
    async connect() {
        let h;
        try {
            h = await (window as any).showDirectoryPicker({ id: 'bdshare', mode: 'readwrite' });
        }
        catch (e) {
            return false; // the player closed the picker
        }
        return this.use(h);
    },
    async use(h) {
        this.handle = h;
        this.folder = h.name;
        try {
            await idbSet('shareDir', h);
        }
        catch (e) { }
        await this.sync();
        return this.state === 'on';
    },
    /** The browser asks again after a restart: one click on "Reconnect" (must run from a click). */
    async resume() {
        if (!this.handle)
            return this.connect();
        let p = 'denied';
        try {
            p = await this.handle.requestPermission({ mode: 'readwrite' });
        }
        catch (e) { }
        if (p === 'granted')
            await this.sync();
        return this.state === 'on';
    },
    async disconnect() {
        try {
            await idbDel('shareDir');
        }
        catch (e) { }
        this.handle = null;
        this.folder = '';
        this.state = this.supported() ? 'off' : 'unsupported';
        saveSharedCache([]);
        notifyShare();
    },
    /** Write this PC's players, then read everyone's. Calls never overlap. */
    sync() {
        if (!this.handle)
            return Promise.resolve();
        this.chain = this.chain.then(() => this.syncWith(this.handle)).catch(() => { });
        return this.chain;
    },
    syncSoon() { if (this.connected())
        this.sync(); },
    /** Set when the active player's save was replaced by a newer copy from another PC: the page must reload. */
    reload: false,
    async syncWith(root) {
        this.state = 'syncing';
        notifyShare();
        try {
            this.wrote = false;
            const dir = await root.getDirectoryHandle(SHARE_DIR, { create: true });
            this.wrote = true; // permission was fine; a failure from here on means the folder can't be written
            // 1. read every player file (including copies of this PC's players written by other PCs)
            const found = new Map();
            for await (const [name, fh] of dir.entries()) {
                const m = SHARE_FILE.exec(name);
                if (!m || fh.kind !== 'file')
                    continue;
                try {
                    const f = await fh.getFile();
                    if (f.size > 4e6)
                        continue;
                    const o = cleanShared(JSON.parse(await f.text()));
                    if (o && o.uid === m[1])
                        found.set(o.uid, o);
                }
                catch (e) { } // a half-written or damaged file: skip it this time
            }
            // 2. bring this PC's copies up to date, then write the ones that are newer here
            const locals = localPlayers().map(pl => ({ pl, key: pl.key, uid: pl.id.uid, me: pl.me, slot: readSlot(pl.key) }));
            const canReload = typeof shareCanReload === 'function' ? shareCanReload() : false;
            const plan = planSync(locals, found, thisPcId(), canReload);
            for (const x of plan.merges)
                try {
                    if (x.key === ACTIVE_KEY) { // the game may have saved since this sync started: merge with that too
                        const now = readSlot(ACTIVE_KEY), m = mergeSaves(now, x.data);
                        m.run = now.run || null;
                        if (now.settings)
                            m.settings = now.settings;
                        x.data = m;
                    }
                    localStorage.setItem(x.key, JSON.stringify(x.data));
                    if (x.key === ACTIVE_KEY && !plan.reload)
                        syncMemory(x.data);
                }
                catch (e) { }
            for (const key of plan.removes)
                removePlayer(key);
            if (plan.kick) { // master control deleted the active profile: it goes from this PC too (5.1)
                dropProfileHere(plan.kick);
                setSession('');
                this.kicked = true;
                this.reload = true;
            }
            if (plan.reload)
                this.reload = true;
            for (const x of localPlayers())
                if (plan.writes.includes(x.id.uid))
                    await writeText(dir, 'p-' + x.id.uid + '.json', JSON.stringify(shareFileData(x, readSlot(x.key), x.me && !this.reload && loggedIn())));
            saveSharedCache([...found.values()]);
            await this.readAdmin(root);
            await this.readEvents(root);
            this.state = 'on';
            this.error = '';
            this.lastSync = Date.now();
        }
        catch (e) {
            const name = e && e.name;
            this.state = name === 'NotAllowedError' && !this.wrote ? 'paused' : 'error';
            this.error = name === 'NoModificationAllowedError' || name === 'InvalidModificationError' || (name === 'NotAllowedError' && this.wrote)
                ? 'this folder is read-only for you. Ask for write access, or pick a shared folder everyone can save in'
                : (e && e.message) || String(e);
        }
        notifyShare();
    },
    /** Set when master control deleted the active profile from another PC: the page reloads to the log-in screen. */
    kicked: false,
    /** A deleted profile: its file becomes a small "deleted" marker, so PCs that copied it drop their copy too. */
    async tombstone(uid, id?, by?) {
        if (!this.connected() || !uid)
            return false;
        try {
            const dir = await this.handle.getDirectoryHandle(SHARE_DIR, { create: true });
            await writeText(dir, 'p-' + uid + '.json', JSON.stringify(deletedFileData(uid, id, by)));
            const list = sharedCache().players.filter(o => o && o.uid !== uid);
            list.push(cleanShared(deletedFileData(uid, id, by)));
            saveSharedCache(list);
            return true;
        }
        catch (e) {
            return false;
        }
    },
    /* ----- Master control (5.1): the master password and password resets, shared by every PC ----- */
    /** Reads <folder>/balloon-defense-admin/admin.json, merges it with this browser's copy, and writes back what the folder lacks. */
    async readAdmin(root = this.handle) {
        if (!root)
            return;
        try {
            const dir = await root.getDirectoryHandle(ADMIN_DIR, { create: true });
            let theirs = null;
            try {
                const f = await (await dir.getFileHandle(ADMIN_FILE)).getFile();
                if (f.size < 2e5)
                    theirs = JSON.parse(await f.text());
            }
            catch (e) { }
            const mine = adminData(), all = mergeAdmin(mine, theirs);
            saveAdminData(all);
            if (stableJSON(all) !== stableJSON(cleanAdmin(theirs)))
                await writeText(dir, ADMIN_FILE, JSON.stringify(Object.assign({ v: 1 }, all)));
        }
        catch (e) { }
    },
    /** Saves a change to the master control data here and (when connected) in the shared folder. */
    async saveAdmin(next) {
        saveAdminData(mergeAdmin(adminData(), next));
        if (this.connected())
            await this.readAdmin();
    },
    /** Master control: brings a deleted profile back from every copy still around (its backups in the folder and in
        this browser). Its player file is written again, so it shows on every PC and its owner can log in. */
    async restoreAccount(uid) {
        if (!this.connected())
            return 'Connect the shared folder first';
        const data = mergeAll(await this.copiesOf(uid));
        if (!data || !data.id || !data.id.name)
            return 'No backup of this profile was found';
        if (nameTaken(data.id.name, uid))
            return 'Another player uses the name ' + data.id.name + ' now';
        try {
            const dir = await this.handle.getDirectoryHandle(SHARE_DIR, { create: true }), file = fileFromSave(data);
            await writeText(dir, 'p-' + uid + '.json', JSON.stringify(file));
            saveSharedCache(sharedCache().players.filter(o => o && o.uid !== uid).concat([cleanShared(file)]));
        }
        catch (e) {
            return 'Couldn\'t write to the shared folder';
        }
        return '';
    },
    /* ----- Game results from other PCs (notifications) -----
       Each finished game is one small file in <folder>/balloon-defense-events/. Other PCs show the ones from the last
       10 minutes they haven't seen yet. Files older than a day are cleaned up by whichever PC sees them. */
    async postEvent(ev) {
        if (!this.connected())
            return;
        try {
            const dir = await this.handle.getDirectoryHandle(EVENT_DIR, { create: true });
            const at = Date.now();
            await writeText(dir, 'e-' + at + '-' + ev.uid + '.json', JSON.stringify(Object.assign({ v: 1, at, pc: thisPcId() }, ev)));
        }
        catch (e) { }
    },
    async readEvents(root) {
        let dir;
        try {
            dir = await root.getDirectoryHandle(EVENT_DIR, { create: true });
        }
        catch (e) {
            return;
        }
        const now = Date.now(), seen = eventsSeen(now), fresh = [], old = [];
        let newest = seen;
        for await (const [name, fh] of dir.entries()) {
            const m = EVENT_FILE.exec(name);
            if (!m || fh.kind !== 'file')
                continue;
            const at = +m[1];
            if (now - at > 864e5) {
                old.push(name);
                continue;
            }
            if (at <= seen || now - at > EVENT_FRESH_MS)
                continue;
            try {
                const f = await fh.getFile();
                if (f.size > 2e4)
                    continue;
                const ev = cleanEvent(JSON.parse(await f.text()));
                if (ev && ev.pc !== thisPcId())
                    fresh.push(ev);
            }
            catch (e) { }
            newest = Math.max(newest, at);
        }
        for (const name of old)
            try {
                await dir.removeEntry(name);
            }
            catch (e) { }
        saveEventsSeen(newest);
        fresh.sort((a, b) => a.at - b.at);
        if (typeof onPlayerEvent === 'function')
            for (const ev of fresh.slice(-3))
                onPlayerEvent(ev);
    },
    /** Writes the active profile's file right away (a few seconds after progress is saved), merging in anything the
        folder copy has first. Lighter than a full sync: only this one file is read and written. */
    pushActive() {
        if (!this.connected())
            return Promise.resolve();
        this.chain = this.chain.then(async () => {
            const me = localPlayers().find(p => p.me);
            if (!me || !activePlayable())
                return;
            const dir = await this.handle.getDirectoryHandle(SHARE_DIR, { create: true }), name = 'p-' + me.id.uid + '.json';
            let r = null;
            try {
                const f = await (await dir.getFileHandle(name)).getFile();
                r = cleanShared(JSON.parse(await f.text()));
            }
            catch (e) { }
            if (r && r.deleted)
                return;
            if (r && r.save) {
                const cur = readSlot(me.key), m = mergeSaves(cur, saveFromShared(r));
                m.run = cur.run || null;
                if (cur.settings)
                    m.settings = cur.settings;
                if (progressSig(m) !== progressSig(cur)) {
                    localStorage.setItem(me.key, JSON.stringify(m));
                    syncMemory(m);
                }
            }
            const pl = localPlayers().find(p => p.me);
            await writeText(dir, name, JSON.stringify(shareFileData(pl, readSlot(pl.key), true)));
        }).catch(() => { });
        return this.chain;
    },
    /* ----- Automatic backups -----
       After every game and once a day: the 10 newest copies of the active profile plus one a day for 14 days, in the
       shared folder (<folder>/balloon-defense-backups/<uid>/) when it is connected, and always in this browser (IndexedDB). */
    async autoBackup(data = store.all()) {
        const uid = data && data.id && data.id.uid;
        if (!uid)
            return false;
        const at = Date.now(), copy = { v: 1, at, data };
        let ok = false;
        try {
            const list = ((await idbGet('bk:' + uid)) || []).filter(b => b && b.at);
            list.push(copy);
            const keep = new Set(backupKeep(list.map(b => b.at), at));
            await idbSet('bk:' + uid, list.filter(b => keep.has(b.at)).sort((a, b) => a.at - b.at));
            ok = true;
        }
        catch (e) { }
        if (this.connected())
            try {
                const top = await this.handle.getDirectoryHandle(BACKUP_DIR, { create: true }), dir = await top.getDirectoryHandle(uid, { create: true });
                await writeText(dir, 'b-' + at + '.json', JSON.stringify(copy));
                const names = [];
                for await (const [name, fh] of dir.entries())
                    if (fh.kind === 'file' && BACKUP_FILE.test(name))
                        names.push(name);
                const keep = new Set(backupKeep(names.map(n => +BACKUP_FILE.exec(n)[1]), at));
                for (const name of names)
                    if (!keep.has(+BACKUP_FILE.exec(name)[1]))
                        try {
                            await dir.removeEntry(name);
                        }
                        catch (e) { }
                ok = true;
            }
            catch (e) { }
        if (ok) {
            const o = store.all();
            o.autoBackupAt = at;
            store.save(o);
        }
        return ok;
    },
    /** The automatic backups of the active profile, newest first: [{ at, where: 'folder' | 'browser' }]. */
    async listBackups() {
        const uid = (getId() || {}).uid, out = [];
        if (!uid)
            return out;
        try {
            for (const b of (await idbGet('bk:' + uid)) || [])
                out.push({ at: b.at, where: 'browser' });
        }
        catch (e) { }
        if (this.connected())
            try {
                const top = await this.handle.getDirectoryHandle(BACKUP_DIR, { create: true }), dir = await top.getDirectoryHandle(uid, { create: true });
                for await (const [name, fh] of dir.entries()) {
                    const m = BACKUP_FILE.exec(name);
                    if (m && fh.kind === 'file' && !out.some(x => x.at === +m[1]))
                        out.push({ at: +m[1], where: 'folder' });
                }
            }
            catch (e) { }
        return out.sort((a, b) => b.at - a.at);
    },
    async loadBackup(at, where) {
        const uid = (getId() || {}).uid;
        try {
            if (where === 'browser') {
                const b = ((await idbGet('bk:' + uid)) || []).find(x => x.at === at);
                return b ? b.data : null;
            }
            const top = await this.handle.getDirectoryHandle(BACKUP_DIR), dir = await top.getDirectoryHandle(uid);
            const f = await (await dir.getFileHandle('b-' + at + '.json')).getFile();
            const o = JSON.parse(await f.text());
            return o && o.data && o.data.id && o.data.id.uid === uid ? o.data : null;
        }
        catch (e) {
            return null;
        }
    },
    /** Every copy of one profile this PC can find: its file in the shared folder, and all its automatic backups
        (folder and browser). Used by the repair and by Find my profile, which merge them all. */
    async copiesOf(uid) {
        const out = [];
        if (!uid)
            return out;
        try {
            for (const b of (await idbGet('bk:' + uid)) || [])
                if (b && b.data && b.data.id && b.data.id.uid === uid)
                    out.push(b.data);
        }
        catch (e) { }
        if (!this.connected())
            return out;
        try {
            const dir = await this.handle.getDirectoryHandle(SHARE_DIR, { create: true });
            const f = await (await dir.getFileHandle('p-' + uid + '.json')).getFile();
            const s = saveFromShared(cleanShared(JSON.parse(await f.text())));
            if (s)
                out.push(s);
        }
        catch (e) { }
        try {
            const top = await this.handle.getDirectoryHandle(BACKUP_DIR, { create: true }), dir = await top.getDirectoryHandle(uid);
            for await (const [name, fh] of dir.entries()) {
                if (fh.kind !== 'file' || !BACKUP_FILE.test(name))
                    continue;
                try {
                    const o = JSON.parse(await (await fh.getFile()).text());
                    if (o && o.data && o.data.id && o.data.id.uid === uid)
                        out.push(o.data);
                }
                catch (e) { }
            }
        }
        catch (e) { }
        return out;
    },
    /** Profiles that only this browser's backups still know (the save itself was lost): [{ uid, data }]. */
    async browserProfiles() {
        const out = [];
        try {
            const keys = (await idbReq('readonly', s => s.getAllKeys())) as any[] || [];
            for (const k of keys)
                if (typeof k === 'string' && k.startsWith('bk:')) {
                    const list = (await idbGet(k)) || [], last = list[list.length - 1];
                    if (last && last.data && last.data.id && last.data.id.name)
                        out.push({ uid: k.slice(3), data: last.data, at: last.at });
                }
        }
        catch (e) { }
        return out;
    },
    /** PP-10: once per PC on the first 5.0 start (and again once the shared folder is connected), every profile on this
        PC is rebuilt from the best of its own save, its shared-folder copy and all its backups. Returns how many changed. */
    async repair() {
        const flag = 'balloonDefense.repair5';
        let st: any = {};
        try {
            st = JSON.parse(localStorage.getItem(flag) || '{}') || {};
        }
        catch (e) { }
        if (st.done && (st.folder || !this.connected()))
            return 0;
        let n = 0;
        for (const key of roster().keys) {
            const slot = readSlot(key), uid = slot.id && slot.id.uid;
            if (!uid)
                continue;
            const all = mergeAll([slot, ...await this.copiesOf(uid)]);
            if (!all)
                continue;
            all.run = slot.run || null;
            all.settings = slot.settings;
            all.id = Object.assign({}, all.id, { home: slot.id.home && !claimBeats(all.id.home, slot.id.home) ? slot.id.home : all.id.home });
            if (progressSig(all) !== progressSig(slot)) {
                try {
                    localStorage.setItem(key, JSON.stringify(all));
                }
                catch (e) { }
                if (key === ACTIVE_KEY)
                    syncMemory(all);
                n++;
            }
        }
        try {
            localStorage.setItem(flag, JSON.stringify({ done: true, folder: this.connected(), at: Date.now(), fixed: (st.fixed || 0) + n }));
        }
        catch (e) { }
        return n;
    },
};
const EVENT_DIR = 'balloon-defense-events', EVENT_FILE = /^e-(\d{12,14})-[a-z0-9]{6,20}\.json$/, EVENT_FRESH_MS = 600000;
const BACKUP_DIR = 'balloon-defense-backups', BACKUP_FILE = /^b-(\d{12,14})\.json$/, BACKUP_KEEP = 5;
const ADMIN_DIR = 'balloon-defense-admin', ADMIN_FILE = 'admin.json';
const SEEN_KEY = 'balloonDefense.eventsSeen';
function eventsSeen(now = Date.now()) { try {
    const v = +localStorage.getItem(SEEN_KEY);
    if (v > 0)
        return v;
}
catch (e) { } return now - EVENT_FRESH_MS; }
function saveEventsSeen(v) { try {
    localStorage.setItem(SEEN_KEY, String(v));
}
catch (e) { } }
/** A finished game, as other PCs see it: who, where, and how it ended. */
function gameEvent(g, id) {
    return { uid: id.uid, name: id.name, animal: id.animal, style: id.style, bg: id.bg, border: id.border, won: !!g.won, map: g.map.id, diff: g.diffKey, mode: g.mode,
        daily: !!g.daily, round: g.round, lives: Math.max(0, g.lives), cash: Math.floor(g.cash), towers: g.towers.length };
}
/** Checks an event file; returns null when it isn't one. */
function cleanEvent(o) {
    if (!o || typeof o !== 'object' || typeof o.uid !== 'string' || typeof o.pc !== 'string' || nameProblem(o.name) || !DIFF[o.diff] || !MAPS.some(m => m.id === o.map))
        return null;
    const n = (v) => Math.max(0, Math.floor(+v || 0));
    return { uid: o.uid, pc: o.pc, at: n(o.at), name: String(o.name), animal: String(o.animal || 'fox'), style: o.style === 'f' ? 'f' : 'm', bg: String(o.bg || 'sky'), border: String(o.border || 'plain'),
        won: !!o.won, map: o.map, diff: o.diff, mode: MODES[o.mode] ? o.mode : 'standard', daily: !!o.daily, round: n(o.round), lives: n(o.lives), cash: n(o.cash), towers: n(o.towers) };
}
/** What one sync does with this PC's players, given the files in the shared folder. Pure, so the tests can check it.
    Progress is merged both ways (5.0): nothing either copy holds is lost, whichever is newer.
    - when the folder copy holds anything this PC's copy doesn't, it is merged in (reload = the active player changed
      while the home page may reload; otherwise the game keeps going with the merged progress)
    - a "deleted" marker removes this PC's copy (never the active player's)
    - a file is (re)written when it misses anything this PC's copy has, has no save inside (v4.0), or is the active player's (heartbeat) */
function planSync(locals, found, myPc, canReload) {
    const plan = { merges: [], removes: [], writes: [], reload: false, kick: '' };
    for (const x of locals) {
        const r = found.get(x.uid), mine = x.slot || {};
        if (r && r.deleted) {
            if (!x.me)
                plan.removes.push(x.key);
            else if (r.by === 'admin')
                plan.kick = x.uid; // master control deleted the profile playing here (5.1)
            continue;
        }
        if (!r || !r.save) {
            plan.writes.push(x.uid);
            continue;
        }
        const theirs = saveFromShared(r), data = mergeSaves(mine, theirs);
        // a half-played game and this PC's settings stay with this PC
        data.run = mine.run || null;
        if (mine.settings)
            data.settings = mine.settings;
        const sig = progressSig(data);
        if (sig !== progressSig(mine)) {
            plan.merges.push({ key: x.key, data });
            // reload only for real news (more progress, or a new name, look or home), not for tidied-up fields
            if (x.me && canReload && (progressScore(data) > progressScore(mine) || stableJSON(data.id || null) !== stableJSON(mine.id || null)))
                plan.reload = true;
        }
        if (x.me || sig !== progressSig(theirs))
            plan.writes.push(x.uid);
    }
    return plan;
}
/** The shared-folder copy of the active profile is brought up to date a few seconds after progress is saved (PP-2). */
let PUSH_T: any = 0;
function onStoreChange(k) {
    if (k === 'run' || k === 'noteIds' || k === 'chatRead' || k === 'autoBackupAt' || typeof Share === 'undefined' || !Share.connected())
        return;
    clearTimeout(PUSH_T);
    PUSH_T = setTimeout(() => Share.pushActive(), 4000);
}
async function writeText(dir, name, text) {
    const fh = await dir.getFileHandle(name, { create: true }), w = await fh.createWritable();
    await w.write(text);
    await w.close();
}

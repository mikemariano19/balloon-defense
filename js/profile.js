"use strict";
/* Balloon Defense — player profiles: identity, the players on this PC, local leaderboards and medals, avatars,
   titles, borders, backup codes. Everything stays in this browser: the game is fully offline.
   No DOM access at load time, so the tests can load this file too. */
/* ---------- Identity ---------- */
function getId() { return store.get('id', null); }
function hasProfile() { const p = getId(); return !!(p && p.name && p.tag); }
function saveId(o) { store.set('id', o); }
function nameProblem(name) {
    const n = String(name || '').trim();
    if (n.length < 3 || n.length > 16)
        return 'Use 3 to 16 characters';
    if (!/^[A-Za-z0-9 _-]+$/.test(n))
        return 'Letters, numbers, spaces, _ and - only';
    const flat = n.toLowerCase().replace(/[^a-z]/g, '');
    if (NAME_FILTER.some(w => flat.includes(w)))
        return 'Please pick a different name';
    return '';
}
/** Names are unique (ignoring case) across this PC and the shared folder. `exceptUid` skips the player being renamed. */
function nameTaken(name, exceptUid, players = allPlayers()) {
    const n = String(name || '').trim().toLowerCase();
    return players.some(p => p.id && p.id.uid !== exceptUid && String(p.id.name).trim().toLowerCase() === n);
}
/** A random id that tells players apart across PCs (the shared folder file name uses it). */
function newUid() { return (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).slice(-14); }
function newTag() { return String(1000 + Math.floor(Math.random() * 9000)); }
function createProfile(o) {
    const now = Date.now();
    const id = { name: String(o.name).trim(), tag: newTag(), animal: o.animal || 'fox', style: o.style || 'm', bg: o.bg || 'sky', border: o.border || 'plain',
        title: 'rookie', created: now, uid: newUid(), home: { pc: thisPcId(), at: now } };
    if (o.pw)
        id.pw = makePw(o.pw, now);
    saveId(id);
    const pc = pcInfo();
    pc.owner = id.uid; // the profile made on a PC is that PC's own profile, and plays only there
    pc.extra = false;
    savePcInfo(pc);
    setSession(id.uid); // registering logs you in
    return id;
}
/* ---------- Passwords and log-in (5.1) ----------
   A password is kept with the profile as a salted hash (id.pw = { s: salt, h: hash, at: when it was set }), so it
   travels with the profile to the shared folder and every PC can check it. The password itself is never stored.
   Master control can reset a password: it records the time of the reset, and a password set before it no longer counts. */
let SHA_K = null, SHA_H = null;
/** SHA-256 of a text (UTF-8), as 64 hex digits. */
function sha256(text) {
    const s = unescape(encodeURIComponent(String(text))), rot = (v, n) => (v >>> n) | (v << (32 - n)), max = 4294967296;
    if (!SHA_K) {
        SHA_K = [];
        SHA_H = [];
        const comp = {};
        for (let c = 2; SHA_K.length < 64; c++)
            if (!comp[c]) {
                for (let i = 0; i < 313; i += c)
                    comp[i] = c;
                SHA_H.push((Math.pow(c, .5) * max) | 0);
                SHA_K.push((Math.pow(c, 1 / 3) * max) | 0);
            }
    }
    let m = s + '\x80';
    while (m.length % 64 - 56)
        m += '\x00';
    const words = [];
    for (let i = 0; i < m.length; i++)
        words[i >> 2] |= m.charCodeAt(i) << ((3 - i) % 4) * 8;
    words.push((s.length * 8 / max) | 0, s.length * 8);
    let hash = SHA_H.slice(0, 8);
    for (let j = 0; j < words.length;) {
        const w = words.slice(j, j += 16), old = hash;
        hash = hash.slice(0, 8);
        for (let i = 0; i < 64; i++) {
            const w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
            if (i >= 16)
                w[i] = (w[i - 16] + (rot(w15, 7) ^ rot(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rot(w2, 17) ^ rot(w2, 19) ^ (w2 >>> 10))) | 0;
            const t1 = hash[7] + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & hash[5]) ^ (~e & hash[6])) + SHA_K[i] + (w[i] | 0);
            const t2 = (rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
            hash = [(t1 + t2) | 0].concat(hash);
            hash[4] = (hash[4] + t1) | 0;
        }
        for (let i = 0; i < 8; i++)
            hash[i] = (hash[i] + old[i]) | 0;
    }
    let out = '';
    for (let i = 0; i < 8; i++)
        out += ('0000000' + (hash[i] >>> 0).toString(16)).slice(-8);
    return out;
}
/** The stored form of a password: many rounds of salted SHA-256, so a copied file doesn't give the password away easily. */
function pwHash(pw, salt) {
    let h = sha256(salt + ':' + String(pw));
    for (let i = 0; i < 300; i++)
        h = sha256(h + salt);
    return h;
}
function makePw(pw, now = Date.now()) { const s = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 8); return { s, h: pwHash(pw, s), at: now }; }
function pwProblem(pw, again) {
    const p = String(pw || '');
    if (p.length < 4)
        return 'Use at least 4 characters';
    if (p.length > 40)
        return 'Use 40 characters or fewer';
    if (again !== undefined && p !== String(again))
        return 'The two passwords are not the same';
    return '';
}
/* Master control data: the master password (salted hash) and the password resets ({ uid: time }). Kept in this browser
   and in <folder>/balloon-defense-admin/admin.json, so every PC on the shared folder uses the same ones. */
const ADMIN_KEY = 'balloonDefense.admin';
function cleanAdmin(o) {
    const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
    o = obj(o);
    const m = obj(o.master), resets = {};
    for (const [k, v] of Object.entries(obj(o.resets)))
        if (/^[a-z0-9]{6,20}$/.test(k) && +v > 0)
            resets[k] = +v;
    return { master: typeof m.h === 'string' && typeof m.s === 'string' ? { s: m.s, h: m.h, at: +m.at || 0 } : null, resets, wb: cleanWbConfig(o.wb) };
}
/* ---------- World Boss builds from master control (5.1.1) ----------
   { at, bosses: { wbgale: { name, hp, def, cash, lives, count }, ... } }: only the fields that differ from WB_DEFAULTS.
   Kept with the master control data, so every PC on the shared folder fights the same boss. The newest save wins. */
const WB_LIMITS = { hp: [1000, 10000000], def: [0.1, 3], cash: [0, 1000000], lives: [1, 100000], count: [1, 10] };
function cleanWbConfig(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o) || !(+o.at > 0))
        return null;
    const bosses = {};
    for (const d of WB_DEFAULTS) {
        const x = o.bosses && o.bosses[d.id];
        if (!x || typeof x !== 'object')
            continue;
        const b = {};
        const name = typeof x.name === 'string' ? x.name.replace(/\s+/g, ' ').trim().slice(0, 20) : '';
        if (name && name !== d.name)
            b.name = name;
        for (const [k, [lo, hi]] of Object.entries(WB_LIMITS)) {
            const v = +x[k];
            if (x[k] === undefined || x[k] === null || x[k] === '' || !isFinite(v))
                continue;
            const c = k === 'def' ? Math.round(Math.max(lo, Math.min(hi, v)) * 100) / 100 : Math.round(Math.max(lo, Math.min(hi, v)));
            if (c !== d[k])
                b[k] = c;
        }
        if (Object.keys(b).length)
            bosses[d.id] = b;
    }
    return { at: +o.at, bosses };
}
/** 'Normal', 'High (takes 40% less damage)', 'Weak (takes 50% more damage)'. `def` = share of damage taken. */
function wbDefTxt(def) {
    const pct = Math.round((1 - def) * 100);
    return pct === 0 ? 'Normal' : pct < 0 ? 'Weak (takes ' + -pct + '% more damage)' : (pct >= 40 ? 'High' : pct >= 20 ? 'Medium' : 'Low') + ' (takes ' + pct + '% less damage)';
}
/** Puts the master control builds on WB_BOSSES (and the boss balloon names). Without a config: the defaults. */
function applyWbConfig(cfg = adminData().wb) {
    WB_BOSSES.forEach((b, i) => {
        const d = WB_DEFAULTS[i], x = (cfg && cfg.bosses && cfg.bosses[d.id]) || {};
        Object.assign(b, d, x);
        if (x.def !== undefined)
            b.defTxt = wbDefTxt(b.def);
        if (x.count !== undefined)
            b.summonTxt = b.count + ' balloon' + (b.count === 1 ? '' : 's') + (b.every < 1 ? ', ' + Math.round((1 - b.every) * 100) + '% more often' : ' each summon');
        if (x.def !== undefined || x.count !== undefined)
            b.build = b.speed + ', ' + b.defTxt.replace(/ \(.*\)/, '').toLowerCase() + ' defense' + (b.count > 3 ? ', large summons' : '') + (b.every < 1 ? ', fast summoning' : '');
        if (BT[d.id])
            BT[d.id].name = b.name;
    });
}
function adminData() {
    try {
        return cleanAdmin(JSON.parse(localStorage.getItem(ADMIN_KEY) || 'null'));
    }
    catch (e) {
        return cleanAdmin(null);
    }
}
function saveAdminData(o) {
    try {
        localStorage.setItem(ADMIN_KEY, JSON.stringify(cleanAdmin(o)));
    }
    catch (e) { }
    applyWbConfig();
}
/** Two copies of the master control data merged: the newer master password, and the latest reset of each profile. */
function mergeAdmin(a, b) {
    a = cleanAdmin(a);
    b = cleanAdmin(b);
    const resets = Object.assign({}, a.resets);
    for (const [k, v] of Object.entries(b.resets))
        resets[k] = Math.max(+resets[k] || 0, +v);
    const master = !a.master ? b.master : !b.master ? a.master : (b.master.at > a.master.at ? b.master : a.master);
    const wb = !a.wb ? b.wb : !b.wb ? a.wb : (b.wb.at > a.wb.at ? b.wb : a.wb);
    return { master, resets, wb };
}
function resetAt(uid) { return +adminData().resets[uid] || 0; }
/** True when this profile has a password that still counts (set after the last reset from master control). */
function hasPassword(id) { return !!(id && id.pw && typeof id.pw.h === 'string' && typeof id.pw.s === 'string' && (+id.pw.at || 0) > resetAt(id.uid)); }
function checkPassword(id, pw) { return hasPassword(id) && pwHash(pw, id.pw.s) === id.pw.h; }
function masterSet() { return !!adminData().master; }
function checkMaster(pw) { const m = adminData().master; return !!m && pwHash(pw, m.s) === m.h; }
/** The newest copy of a profile's id that this PC knows (its own save slot or the shared folder): the newest password wins. */
function bestId(uid) {
    let best = null;
    for (const k of roster().keys) {
        const id = readSlot(k).id;
        if (id && id.uid === uid && (!best || pwAt(id) > pwAt(best)))
            best = id;
    }
    const o = sharedCache().players.find(x => x && x.uid === uid && !x.deleted);
    if (o && o.id && (!best || pwAt(o.id) > pwAt(best)))
        best = Object.assign({}, best || {}, o.id, { uid });
    return best;
}
function pwAt(id) { return (id && id.pw && +id.pw.at) || 0; }
/** The log-in of this browser tab (sessionStorage): closing the browser logs you out. */
const SESSION_KEY = 'balloonDefense.session';
function sessionOn() {
    try {
        return typeof sessionStorage !== 'undefined' && !!sessionStorage;
    }
    catch (e) {
        return false;
    }
}
function sessionUid() {
    try {
        return sessionStorage.getItem(SESSION_KEY) || '';
    }
    catch (e) {
        return '';
    }
}
function setSession(uid) {
    try {
        if (uid)
            sessionStorage.setItem(SESSION_KEY, uid);
        else
            sessionStorage.removeItem(SESSION_KEY);
    }
    catch (e) { }
}
/** True when the active profile plays on this PC and is logged in on this tab. Only then can it play, chat or show online. */
function loggedIn() { const id = getId(); return activePlayable() && (!sessionOn() || sessionUid() === id.uid); }
/* ---------- Home PC (5.0) ----------
   A profile plays only on its home PC: id.home = { pc, at }. Other PCs show it, view-only. "Find my profile" moves it
   to a new PC (a newer claim), and the old PC then can't play it any more. */
function homeHere(id) { return !!(id && id.home && id.home.pc === thisPcId()); }
/** True when home claim `a` beats claim `b`: the later claim wins, and an exact tie always goes the same way on every
    PC (the larger PC id), so two PCs can never keep handing a profile back and forth. */
function claimBeats(a, b) {
    a = a || {};
    b = b || {};
    const ta = +a.at || 0, tb = +b.at || 0;
    return ta > tb || (ta === tb && String(a.pc || '') > String(b.pc || ''));
}
/** Profiles in this PC's save slots that now play on another PC (moved away with Find my profile). */
function lostProfiles() { return localPlayers().filter(p => p.id.home && !homeHere(p.id)); }
/** True when the active slot holds a profile that plays on this PC. */
function activePlayable() { return hasProfile() && homeHere(getId()); }
/** Once per page load, before anything is shown: gives v4 profiles their home, and makes sure the active slot is a
    profile that plays here (or an empty slot, so the first-run screens show). Returns true when the page must reload. */
function migrateHome() {
    const pc = pcInfo(), r = roster(), me = thisPcId();
    let changed = false;
    // the PC's own profile (its first one) gets this PC as its home
    if (!pc.owner || !r.keys.some(k => (readSlot(k).id || {}).uid === pc.owner)) {
        const first = r.keys.map(k => readSlot(k).id).find(id => id && id.uid && id.name && (!id.home || id.home.pc === me));
        pc.owner = first ? first.uid : '';
        savePcInfo(pc);
    }
    for (const k of r.keys) {
        const s = readSlot(k), id = s.id;
        if (!id || !id.uid || id.home)
            continue;
        if (id.uid === pc.owner) {
            // a weak claim: a v4 copy upgraded here never takes the profile from a PC that already claimed it. It is
            // always below any real claim (a real time), and smaller the later the upgrade, so the first PC keeps it.
            id.home = { pc: me, at: Math.max(1, 26e11 - Date.now()) };
            try {
                localStorage.setItem(k, JSON.stringify(s));
            }
            catch (e) { }
        }
    }
    const act = readSlot(r.active).id;
    if (act && act.name && !homeHere(act)) {
        // the active player plays on another PC: use this PC's own profile, or an empty slot (create / find screens)
        const own = r.keys.find(k => homeHere(readSlot(k).id));
        if (own)
            r.active = own;
        else {
            const empty = r.keys.find(k => !(readSlot(k).id || {}).name);
            if (empty)
                r.active = empty;
            else {
                const key = 'balloonDefense.p.' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
                try {
                    localStorage.setItem(key, JSON.stringify({ settings: readSlot(r.active).settings || {} }));
                }
                catch (e) { }
                r.keys.push(key);
                r.active = key;
            }
        }
        saveRoster(r);
        changed = true;
    }
    return changed;
}
/* ---------- This PC: its id and the one profile it created ----------
   Each PC creates one profile (its owner). Other people pick their existing profile instead. Only the owner's PC
   can delete that profile for good. Kept outside the player slots, so it belongs to the PC, not to a player. */
const PC_KEY = 'balloonDefense.pc';
function pcInfo() {
    let o = null;
    try {
        o = JSON.parse(localStorage.getItem(PC_KEY) || 'null');
    }
    catch (e) { }
    if (!o || typeof o.id !== 'string') {
        o = { id: newUid(), owner: '', extra: false };
        // a PC from v4 already has players: the first one becomes the owner
        try {
            const first = roster().keys.map(k => readSlot(k).id).find(id => id && id.uid);
            if (first)
                o.owner = first.uid;
        }
        catch (e) { }
        savePcInfo(o);
    }
    return o;
}
function savePcInfo(o) {
    try {
        localStorage.setItem(PC_KEY, JSON.stringify(o));
    }
    catch (e) { }
}
function thisPcId() { return pcInfo().id; }
/** The owner profile, if it still has a save slot on this PC and still plays here. */
function pcOwnerHere() { const o = pcInfo().owner; return !!o && roster().keys.some(k => { const id = readSlot(k).id; return !!(id && id.uid === o && (!id.home || homeHere(id))); }); }
function isPcOwner(uid) { return !!uid && pcInfo().owner === uid; }
/** A new profile can be created when this PC has no profile of its own (each PC plays one profile). */
function canCreateProfile() { return !pcOwnerHere(); }
function fullName(p) { return p.name + '#' + p.tag; }
/* ---------- Players on this PC ---------- */
/** The players on this PC (one save slot each). Gives older profiles their cross-PC id on the way. */
function localPlayers() {
    return roster().keys.map(key => {
        const s = readSlot(key), id = s.id;
        if (!id || !id.name || !id.tag)
            return null;
        if (!id.uid) {
            id.uid = newUid();
            try {
                localStorage.setItem(key, JSON.stringify(s));
            }
            catch (e) { }
        }
        return { key, id, me: key === ACTIVE_KEY, remote: false, profile: Object.assign({}, PROFILE_DEFAULT, s.profile || {}), runs: s.runs || {},
            towers: s.towers || {}, records: s.records || {}, daily: s.daily || {}, dailyRuns: s.dailyRuns || {}, wbHist: s.wbHist || {}, updated: +s.updated || 0,
            history: Array.isArray(s.history) ? s.history : [] };
    }).filter(Boolean);
}
/* ---------- One profile on several PCs ----------
   A profile picked on another PC keeps its progress in two places. The newer save wins, and counters merge by
   taking the larger value, so progress made on either PC is kept. */
function mergeSaves(a, b) {
    a = a || {};
    b = b || {};
    const newer = (+b.updated || 0) >= (+a.updated || 0) ? b : a, older = newer === b ? a : b;
    const out = JSON.parse(JSON.stringify(newer));
    const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
    // profile counters: the larger value (pops, wins, XP, ...)
    const pa = obj(older.profile), pb = obj(newer.profile), prof = out.profile = Object.assign({}, pa, pb);
    for (const k of Object.keys(pa))
        if (typeof pa[k] === 'number' && typeof pb[k] === 'number')
            prof[k] = Math.max(pa[k], pb[k]);
    prof.built = Object.assign({}, obj(pa.built), obj(pb.built));
    for (const k of Object.keys(obj(pa.built)))
        prof.built[k] = Math.max(+pa.built[k] || 0, +(obj(pb.built)[k]) || 0);
    // best run per stage
    const runsOut = out.runs = Object.assign({}, obj(older.runs), obj(newer.runs));
    for (const [k, r] of Object.entries(obj(older.runs)))
        if (obj(newer.runs)[k] && compareRuns(r, newer.runs[k]) < 0)
            runsOut[k] = r;
    // map records: best round, badge won, challenge stars
    const recs = out.records = JSON.parse(JSON.stringify(obj(newer.records)));
    for (const [mid, m] of Object.entries(obj(older.records))) {
        const t = recs[mid] || (recs[mid] = {});
        for (const [k, v] of Object.entries(obj(m))) {
            if (k === 'modes')
                t.modes = Object.assign({}, obj(v), obj(t.modes));
            else {
                const c = t[k] || { best: 0, won: false };
                t[k] = { best: Math.max(+c.best || 0, +(v && v.best) || 0), won: !!c.won || !!(v && v.won) };
            }
        }
    }
    // tower XP: the copy that has earned more for that tower (its XP to spend and skill points go with it).
    // Unlocked tiers are never lost: both copies' unlocks are kept (a v4.0 player file held only the XP total).
    const tw = out.towers = JSON.parse(JSON.stringify(obj(newer.towers)));
    for (const [t, v0] of Object.entries(obj(older.towers))) {
        const v = obj(v0), n = obj(tw[t]);
        const win = !tw[t] || (+v.total || 0) > (+n.total || 0) ? JSON.parse(JSON.stringify(v)) : n, lose = win === n ? v : n;
        win.unl = Object.assign({}, obj(lose.unl), obj(win.unl));
        if (!win.perks && lose.perks)
            win.perks = JSON.parse(JSON.stringify(lose.perks));
        if (win.xp === undefined)
            win.xp = +lose.xp || 0;
        tw[t] = win;
    }
    // daily challenge: every day won, best try per date (the last 60 dates)
    out.daily = Object.assign({}, obj(older.daily), obj(newer.daily));
    const dr = Object.assign({}, obj(older.dailyRuns), obj(newer.dailyRuns));
    for (const [d, r] of Object.entries(obj(older.dailyRuns)))
        if (obj(newer.dailyRuns)[d] && compareDaily(r, newer.dailyRuns[d]) < 0)
            dr[d] = r;
    out.dailyRuns = {};
    for (const d of Object.keys(dr).sort().slice(-60))
        out.dailyRuns[d] = dr[d];
    // World Boss: the best score per week
    const wh = out.wbHist = Object.assign({}, obj(older.wbHist), obj(newer.wbHist));
    for (const [k, h] of Object.entries(obj(older.wbHist))) {
        const n = obj(newer.wbHist)[k];
        if (n && (+h.d || 0) > (+n.d || 0))
            wh[k] = h;
    }
    // game history: both lists, the newest 30
    const hist = new Map();
    for (const x of [...(Array.isArray(older.history) ? older.history : []), ...(Array.isArray(newer.history) ? newer.history : [])])
        if (x && x.id)
            hist.set(x.id, x);
    if (hist.size)
        out.history = [...hist.values()].sort((x, y) => (+y.at || 0) - (+x.at || 0)).slice(0, HISTORY_MAX);
    // the password set last wins (a copy saved later may still carry an older one)
    const pwa = obj(older.id).pw, pwb = obj(newer.id).pw;
    if (out.id && pwa && pwa.h && (+pwa.at || 0) > ((pwb && +pwb.at) || 0))
        out.id.pw = Object.assign({}, pwa);
    // notifications: both lists, the newest 10
    const notes = new Map();
    for (const x of [...(Array.isArray(older.notes) ? older.notes : []), ...(Array.isArray(newer.notes) ? newer.notes : [])])
        if (x && x.id)
            notes.set(x.id, x);
    if (notes.size)
        out.notes = [...notes.values()].sort((x, y) => (+y.at || 0) - (+x.at || 0)).slice(0, NOTES_MAX);
    // which PC the profile plays on: the latest claim wins (Find my profile moves it)
    const ha = obj(obj(older.id).home), hb = obj(obj(newer.id).home);
    if (out.id && claimBeats(ha, hb))
        out.id.home = Object.assign({}, ha);
    out.updated = Math.max(+a.updated || 0, +b.updated || 0);
    return out;
}
/** JSON with sorted keys, so two copies with the same content compare equal. */
function stableJSON(v) {
    if (Array.isArray(v))
        return '[' + v.map(stableJSON).join(',') + ']';
    if (v && typeof v === 'object')
        return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + stableJSON(v[k])).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
}
/** The progress in a save (not the half-played game, settings or timestamps), to tell whether two copies differ. */
function progressSig(s) {
    s = s || {};
    return stableJSON({ id: s.id || null, profile: s.profile || {}, towers: s.towers || {}, runs: s.runs || {}, records: s.records || {}, daily: s.daily || {},
        dailyRuns: s.dailyRuns || {}, wbHist: s.wbHist || {}, notes: s.notes || [], history: s.history || [] });
}
/** A few numbers that only ever go up: used to pick the copy with the most progress and to spot a lost profile. */
function progressScore(s) {
    const p = (s && s.profile) || {}, tw = (s && s.towers) || {};
    let towers = 0;
    for (const k of Object.keys(tw))
        towers += +(tw[k] && tw[k].total) || 0;
    return (+p.xp || 0) + towers + (+p.pops || 0) / 100 + (+p.games || 0);
}
/** store.save: merges the new copy of the active slot into the saved one (same profile only), so nothing goes
    backwards. The new copy's half-played game and settings win. In-memory progress catches up if the saved copy had more. */
function keepProgress(cur, next) {
    const a = cur && cur.id && cur.id.uid, b = next && next.id && next.id.uid;
    if (!a || !b || a !== b)
        return next;
    // the copy being saved is always the newer one, even if this PC's clock went backwards
    next.updated = Math.max(+next.updated || 0, (+cur.updated || 0) + 1);
    const out = mergeSaves(cur, next);
    out.run = next.run === undefined ? null : next.run;
    if (next.settings)
        out.settings = next.settings;
    out.pc = next.pc;
    if (progressSig(out) !== progressSig(next))
        syncMemory(out);
    return out;
}
/** Brings the game's in-memory profile and tower progress up to a saved copy that has more. */
function syncMemory(s) {
    if (!s || typeof PROFILE === 'undefined')
        return;
    if (s.profile)
        for (const k of Object.keys(s.profile))
            PROFILE[k] = typeof s.profile[k] === 'object' && s.profile[k] ? JSON.parse(JSON.stringify(s.profile[k])) : s.profile[k];
    if (s.towers)
        for (const k of Object.keys(s.towers))
            TPROG[k] = JSON.parse(JSON.stringify(s.towers[k]));
}
/** A player file's copy as a save: the whole save it carries, or (v4.0 files) the parts the file shows. */
function saveFromShared(o) {
    if (!o || o.deleted)
        return null;
    const base = o.save && typeof o.save === 'object' ? JSON.parse(JSON.stringify(o.save))
        : { profile: o.profile, runs: o.runs, records: o.records, daily: o.daily, dailyRuns: o.dailyRuns, towers: o.towers || {}, wbHist: o.wbHist || {} };
    base.id = Object.assign({}, base.id || {}, o.id || {}, { uid: o.uid });
    base.updated = +o.updated || +base.updated || 0;
    return base;
}
/** Every copy of one profile merged into one: nothing that any copy holds is lost (PP-10 repair, Find my profile). */
function mergeAll(copies) {
    const list = copies.filter(c => c && typeof c === 'object' && c.id && c.id.uid);
    if (!list.length)
        return null;
    let out = JSON.parse(JSON.stringify(list[0]));
    for (const c of list.slice(1)) {
        const keep = { run: out.run, settings: out.settings };
        out = mergeSaves(out, c);
        if (keep.settings)
            out.settings = keep.settings;
        out.run = keep.run || null;
    }
    return out;
}
/** Find my profile: puts the best copy of a profile into a save slot on this PC and makes this PC its home (the
    newest claim wins on every PC). Reuses the slot that already holds it, or an empty one. Returns the slot key. */
function moveProfileHere(copies, now = Date.now()) {
    const data = mergeAll(copies);
    if (!data)
        return '';
    const uid = data.id.uid, r = roster();
    data.id.home = { pc: thisPcId(), at: now };
    data.run = null;
    data.settings = Object.assign({}, SETTINGS, (readSlot(r.active) || {}).settings || {});
    let key = r.keys.find(k => (readSlot(k).id || {}).uid === uid) || r.keys.find(k => !(readSlot(k).id || {}).name);
    if (!key) {
        key = 'balloonDefense.p.' + now.toString(36) + Math.floor(Math.random() * 1296).toString(36);
        r.keys.push(key);
    }
    const old = readSlot(key);
    if (old.id && old.id.uid === uid) { // keep anything only this PC's copy had
        const m = mergeSaves(old, Object.assign({}, data, { updated: Math.max(now, +old.updated || 0) }));
        m.id.home = data.id.home;
        m.run = null;
        m.settings = data.settings;
        Object.assign(data, m);
    }
    data.updated = now;
    try {
        localStorage.setItem(key, JSON.stringify(data));
    }
    catch (e) {
        return '';
    }
    r.active = key;
    saveRoster(r);
    const pc = pcInfo();
    pc.owner = uid;
    savePcInfo(pc);
    return key;
}
/** True when another PC played this profile in the last 2 minutes (it writes a heartbeat to the shared folder). */
const IN_USE_MS = 120000;
function inUseElsewhere(uid, now = Date.now()) {
    const o = sharedCache().players.find(x => x && x.uid === uid);
    return !!(o && o.inuse && o.inuse.pc && o.inuse.pc !== thisPcId() && now - (+o.inuse.at || 0) < IN_USE_MS);
}
/** Online (green dot): this PC's active profile, or a profile with a heartbeat from any PC in the last 2 minutes. */
function isOnline(pl, now = Date.now()) {
    if (pl.me)
        return loggedIn();
    const o = sharedCache().players.find(x => x && x.uid === pl.id.uid);
    return !!(o && o.inuse && o.inuse.pc && now - (+o.inuse.at || 0) < IN_USE_MS);
}
/** When a player was last on (5.1): their last heartbeat in the shared folder, or else their last save. 0 = never seen. */
function lastSeen(pl, now = Date.now()) {
    if (isOnline(pl, now))
        return now;
    const o = sharedCache().players.find(x => x && x.uid === pl.id.uid);
    return Math.max((o && o.inuse && +o.inuse.at) || 0, +pl.updated || 0, (o && +o.updated) || 0);
}
/** "just now", "30m ago", "4h ago", "3d ago", or a date for anything older than two weeks. */
function agoShort(t, now = Date.now()) {
    if (!t)
        return '';
    const s = Math.max(0, Math.round((now - t) / 1000));
    return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + 'm ago' : s < 86400 ? Math.floor(s / 3600) + 'h ago' : s < 14 * 86400 ? Math.floor(s / 86400) + 'd ago'
        : new Date(t).toLocaleDateString();
}
/** Players for the home page: you first, then everyone online, then the rest by who was on most recently. */
function sortPlayers(players, now = Date.now()) {
    return players.map(p => ({ p, on: isOnline(p, now), seen: lastSeen(p, now) }))
        .sort((a, b) => (+b.p.me - +a.p.me) || (+b.on - +a.on) || (b.seen - a.seen) || String(a.p.id.name).localeCompare(b.p.id.name)).map(x => x.p);
}
/* ---------- Game history (5.1): the newest 30 games, saved with the profile ---------- */
const HISTORY_MAX = 30;
/** One finished game, as the history keeps it. `rank` = the place this run holds on its stage board (0 = none). */
function historyEntry(g, rank = 0, at = Date.now()) {
    return { id: at.toString(36) + Math.random().toString(36).slice(2, 6), at, map: g.map.id, diff: g.diffKey, mode: g.mode, daily: !!g.daily,
        wb: g.wb ? g.wb.boss.id : '', won: !!g.won, round: g.round, lives: Math.max(0, g.lives), pops: g.pops || 0, clock: Math.round(g.clock || 0),
        wbTime: g.wb ? Math.round(g.wb.t || 0) : 0, score: g.wb && typeof wbScore === 'function' ? wbScore(g) : 0, rank: rank || 0 };
}
function historyList() { const h = store.get('history', []); return Array.isArray(h) ? h : []; }
function addHistory(e) { store.set('history', [e, ...historyList().filter(x => x && x.id !== e.id)].slice(0, HISTORY_MAX)); }
/* ---------- Notifications (5.0): the newest 10, saved with the profile ---------- */
function notesList() { const n = store.get('notes', []); return Array.isArray(n) ? n : []; }
/** Adds one. `id` stops the same event being added twice (another PC, the next start-up...). Returns true when added. */
function addNote(n) {
    if (!hasProfile())
        return false;
    const list = notesList(), id = n.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
    const seen = store.get('noteIds', []); // ids already shown, even after they drop off the list of 10
    if (list.some(x => x.id === id) || (Array.isArray(seen) && seen.includes(id)))
        return false;
    store.set('noteIds', (Array.isArray(seen) ? seen : []).concat(id).slice(-80));
    list.unshift({ id, at: n.at || Date.now(), kind: n.kind || 'info', text: String(n.text || ''), sub: n.sub ? String(n.sub) : '', av: n.av || null, read: false });
    list.sort((a, b) => (+b.at || 0) - (+a.at || 0));
    store.set('notes', list.slice(0, NOTES_MAX));
    if (typeof onNotesChange === 'function')
        onNotesChange();
    return true;
}
function unreadNotes() { return notesList().filter(x => !x.read).length; }
function markNotesRead() {
    const l = notesList();
    if (l.some(x => !x.read))
        store.set('notes', l.map(x => Object.assign({}, x, { read: true })));
}
/** The bits of a profile's look that a notification or chat message shows. */
function avatarOf(id) { return id ? { uid: id.uid, animal: id.animal, style: id.style, bg: id.bg, border: id.border } : null; }
/** 12-hour time, e.g. 3:45 PM. */
function time12(t) { const d = new Date(t); let h = d.getHours(); const m = d.getMinutes(), ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + String(m).padStart(2, '0') + ' ' + ap; }
/* ---------- Backups: which automatic copies to keep ---------- */
/** The 10 newest, plus the newest copy of each of the last 14 days. `ats` are backup times; returns the ones to keep. */
function backupKeep(ats, now = Date.now()) {
    const sorted = [...new Set(ats.map(Number))].sort((a, b) => b - a), keep = new Set(sorted.slice(0, 10)), days = new Set();
    for (const at of sorted) {
        if (now - at > 14 * 864e5)
            break;
        const d = todayStr(new Date(at));
        if (!days.has(d)) {
            days.add(d);
            keep.add(at);
        }
    }
    return sorted.filter(at => keep.has(at));
}
/* Players from other PCs, as last read from the shared folder (share.ts keeps this copy up to date). */
const SHARED_KEY = 'balloonDefense.shared';
function sharedCache() {
    try {
        const c = JSON.parse(localStorage.getItem(SHARED_KEY) || 'null');
        if (c && Array.isArray(c.players))
            return c;
    }
    catch (e) { }
    return { players: [], at: 0 };
}
function saveSharedCache(players) {
    try {
        localStorage.setItem(SHARED_KEY, JSON.stringify({ players, at: Date.now() }));
    }
    catch (e) { }
}
/** What this PC writes to the shared folder for one player: what the boards and profile cards show, plus the whole
    save so the player can pick this profile on another PC. `active` adds the "in use on this PC" heartbeat. */
function shareFileData(pl, slot, active) {
    const towers = {};
    for (const [t, v] of Object.entries(pl.towers))
        towers[t] = { total: (v && v.total) || 0 };
    const save = slot ? Object.assign({}, slot) : null;
    if (save)
        delete save.run; // a half-played game stays on the PC it was played on
    return { v: 2, uid: pl.id.uid, id: pl.id, profile: pl.profile, runs: pl.runs, towers, records: pl.records, daily: pl.daily, dailyRuns: pl.dailyRuns || {}, wbHist: pl.wbHist || {},
        updated: pl.updated || Date.now(), pc: thisPcId(), owner: isPcOwner(pl.id.uid) ? thisPcId() : '', inuse: active ? { pc: thisPcId(), at: Date.now() } : null, save };
}
/** A deleted profile leaves this small file behind, so PCs that copied it remove their copy instead of bringing it back.
    It keeps the name and look (so master control can list it), and `by: 'admin'` when master control deleted it. */
function deletedFileData(uid, id, by) {
    const look = id ? { name: id.name, tag: id.tag, animal: id.animal, style: id.style, bg: id.bg, border: id.border } : null;
    return { v: 2, uid, deleted: true, at: Date.now(), by: by || '', look };
}
/** A player file written from a save (master control brings a deleted profile back from its backups). */
function fileFromSave(save, now = Date.now()) {
    const s = JSON.parse(JSON.stringify(save));
    delete s.run;
    s.updated = Math.max(now, +s.updated || 0);
    const towers = {};
    for (const [t, v] of Object.entries(s.towers || {}))
        towers[t] = { total: (v && v.total) || 0 };
    return { v: 2, uid: s.id.uid, id: s.id, profile: s.profile || {}, runs: s.runs || {}, towers, records: s.records || {}, daily: s.daily || {}, dailyRuns: s.dailyRuns || {},
        wbHist: s.wbHist || {}, updated: s.updated, pc: '', owner: '', inuse: null, save: s };
}
/** Checks a player file read from the shared folder; returns null when it isn't one. */
function cleanShared(o) {
    if (o && o.deleted === true && typeof o.uid === 'string' && /^[a-z0-9]{6,20}$/.test(o.uid)) {
        const l = o.look && typeof o.look === 'object' ? o.look : null;
        const look = l && !nameProblem(l.name) ? { name: String(l.name), tag: String(l.tag || '').slice(0, 8), animal: String(l.animal || 'fox').slice(0, 20), style: l.style === 'f' ? 'f' : 'm',
            bg: String(l.bg || 'sky').slice(0, 20), border: String(l.border || 'plain').slice(0, 20) } : null;
        return { uid: o.uid, deleted: true, at: +o.at || 0, by: o.by === 'admin' ? 'admin' : '', look };
    }
    if (!o || typeof o !== 'object' || !o.id || typeof o.uid !== 'string' || !/^[a-z0-9]{6,20}$/.test(o.uid) || nameProblem(o.id.name) || !/^[0-9]{4}$/.test(String(o.id.tag)))
        return null;
    const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
    const str = (x) => (typeof x === 'string' && x.length <= 40 ? x : '');
    const inuse = o.inuse && typeof o.inuse === 'object' && str(o.inuse.pc) ? { pc: str(o.inuse.pc), at: +o.inuse.at || 0 } : null;
    return { uid: o.uid, id: Object.assign({}, obj(o.id), { uid: o.uid }), profile: obj(o.profile), runs: obj(o.runs), towers: obj(o.towers),
        records: obj(o.records), daily: obj(o.daily), dailyRuns: obj(o.dailyRuns), wbHist: obj(o.wbHist), updated: +o.updated || 0, pc: str(o.pc), owner: str(o.owner), inuse,
        save: o.save && typeof o.save === 'object' && !Array.isArray(o.save) ? o.save : null };
}
/** Every player: the ones on this PC first, then the ones from other PCs (shared folder). */
function allPlayers() {
    const local = localPlayers(), uids = new Set(local.map(p => p.id.uid));
    const remote = sharedCache().players.filter(o => o && o.uid && !o.deleted && o.id && !uids.has(o.uid)).map(o => ({ key: 'shared:' + o.uid, id: o.id, me: false, remote: true,
        updated: o.updated, profile: Object.assign({}, PROFILE_DEFAULT, o.profile || {}), runs: o.runs || {}, towers: o.towers || {}, records: o.records || {}, daily: o.daily || {},
        dailyRuns: o.dailyRuns || {}, wbHist: o.wbHist || {}, history: o.save && Array.isArray(o.save.history) ? o.save.history : [] }));
    return local.concat(remote);
}
function playerByKey(key) { return allPlayers().find(p => p.key === key) || null; }
/** Opens a fresh save slot (keeping this PC's settings) and makes it the active player. The page reloads after. */
function addPlayerSlot() {
    const r = roster(), key = 'balloonDefense.p.' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
    try {
        localStorage.setItem(key, JSON.stringify({ settings: Object.assign({}, SETTINGS, { unlockAll: false }), seen: store.get('seen', null) }));
    }
    catch (e) { }
    r.prev = r.active;
    r.keys.push(key);
    r.active = key;
    saveRoster(r);
    return key;
}
function switchPlayer(key) {
    const r = roster();
    if (!r.keys.includes(key))
        return false;
    r.active = key;
    saveRoster(r);
    return true;
}
/** Deletes another player's save from this PC (never the active one). */
function removePlayer(key) {
    const r = roster();
    if (key === r.active || !r.keys.includes(key))
        return false;
    r.keys = r.keys.filter(k => k !== key);
    saveRoster(r);
    try {
        localStorage.removeItem(key);
    }
    catch (e) { }
    return true;
}
/** Leaves a just-opened empty slot and goes back to the player who was active before. */
function cancelNewPlayer() {
    const r = roster(), back = r.prev && r.prev !== r.active && r.keys.includes(r.prev) ? r.prev : (localPlayers()[0] || {}).key;
    if (!back || hasProfile())
        return false;
    const empty = r.active;
    r.keys = r.keys.filter(k => k !== empty);
    r.active = back;
    saveRoster(r);
    try {
        localStorage.removeItem(empty);
    }
    catch (e) { }
    return true;
}
/** Deletes the active profile for good (only its own PC may: see isPcOwner). Another player on this PC becomes active,
    or the next visit starts with the create screen. Returns the deleted uid. */
function deleteActiveProfile() {
    const r = roster(), key = r.active, id = readSlot(key).id, uid = id && id.uid;
    if (!uid || !isPcOwner(uid))
        return '';
    r.keys = r.keys.filter(k => k !== key);
    r.active = r.keys[0] || STORE_KEY;
    if (!r.keys.length)
        r.keys = [STORE_KEY];
    saveRoster(r);
    try {
        localStorage.removeItem(key);
        if (r.active === key) // the default slot came back empty
            localStorage.setItem(key, JSON.stringify({ settings: readSlot(key).settings || {} }));
    }
    catch (e) { }
    const pc = pcInfo();
    pc.owner = '';
    savePcInfo(pc);
    return uid;
}
/** Master control deleted a profile (5.1): every save slot of it on this PC goes, even the active one (the page must
    then reload; nothing is saved to the old slot in the meantime). Returns { removed, wasActive }. */
function dropProfileHere(uid) {
    const r = roster(), keys = r.keys.filter(k => (readSlot(k).id || {}).uid === uid);
    const wasActive = keys.includes(r.active);
    if (!keys.length)
        return { removed: 0, wasActive: false };
    r.keys = r.keys.filter(k => !keys.includes(k));
    for (const k of keys)
        try {
            localStorage.removeItem(k);
        }
        catch (e) { }
    if (!r.keys.length)
        r.keys = [STORE_KEY];
    if (wasActive) {
        r.active = r.keys.find(k => homeHere(readSlot(k).id)) || r.keys[0];
        if (!readSlot(r.active).id)
            try {
                localStorage.setItem(r.active, JSON.stringify({ settings: SETTINGS }));
            }
            catch (e) { }
        if (keys.includes(ACTIVE_KEY))
            SAVES_OFF = true;
    }
    saveRoster(r);
    const pc = pcInfo();
    if (pc.owner === uid) {
        pc.owner = '';
        savePcInfo(pc);
    }
    return { removed: keys.length, wasActive };
}
/* ---------- Leaderboards (all players on this PC and the shared folder) ----------
   Tier and stage boards show the top 3 with gold, silver and bronze. The Global board ranks everyone by medal
   points; the Daily board ranks today's daily challenge. Both show the top 10. */
const BOARD_SIZE = 3, GLOBAL_SIZE = 10, DAILY_SIZE = 10;
const MEDALS = ['gold', 'silver', 'bronze'];
const MEDAL_POINTS = { gold: 3, silver: 2, bronze: 1 };
/** Every player's medals from the Standard stage boards, worked out in one pass. Medals are never stored: when
    someone beats a run, the player who held that place loses the medal (and its points) straight away. */
function medalTable(players = allPlayers()) {
    const t = new Map();
    for (const p of players)
        t.set(p.key, { gold: 0, silver: 0, bronze: 0, reached: 0 });
    for (const map of MAPS)
        for (const k of Object.keys(DIFF))
            for (const x of stageRanking(map.id, k, false, players).slice(0, 3)) {
                const m = t.get(x.p.key);
                m[MEDALS[x.rank - 1]]++;
                m.reached = Math.max(m.reached, +x.run.at || 0);
            }
    return t;
}
function medalPoints(m) { return m.gold * MEDAL_POINTS.gold + m.silver * MEDAL_POINTS.silver + m.bronze * MEDAL_POINTS.bronze; }
/** Global board: medal points (gold 3, silver 2, bronze 1); ties go to more golds, then more silvers, then whoever
    got there first. Players without a medal aren't listed. */
function globalBoard(players = allPlayers()) {
    const t = medalTable(players);
    return players.map(p => { const m = t.get(p.key); return Object.assign({ p, points: medalPoints(m) }, m); }).filter(x => x.points > 0)
        .sort((a, b) => b.points - a.points || b.gold - a.gold || b.silver - a.silver || a.reached - b.reached || String(a.p.id.name).localeCompare(b.p.id.name))
        .map((x, i) => Object.assign(x, { rank: i + 1 }));
}
/** Daily board for one date: each player's best try, best first. */
function dailyBoard(date = todayStr(), players = allPlayers()) {
    return players.map(p => ({ p, run: (p.dailyRuns || {})[date] })).filter(x => x.run && typeof x.run === 'object')
        .sort((a, b) => compareDaily(a.run, b.run)).map((x, i) => Object.assign(x, { rank: i + 1 }));
}
/** The Global #1 wears a crown on every avatar (uid, or '' when nobody has a medal yet). */
let CROWN_UID = '';
function refreshCrown(players = allPlayers()) { const top = globalBoard(players)[0]; CROWN_UID = top ? top.p.id.uid || '' : ''; return CROWN_UID; }
/** Global Top 10 place of a player (1–10), or 0. */
function globalRankOf(uid, players = allPlayers()) { const x = globalBoard(players).find(r => r.p.id.uid === uid); return x && x.rank <= GLOBAL_SIZE ? x.rank : 0; }
/** The World Boss Champion (gold of the last announced event) wears the World Boss Legend border on every avatar ('' = nobody). */
let WB_CHAMP_UID = '';
/* Rank arrows: this PC remembers the last two different orders of each board. A row shows how far that player
   moved between them (+ = up), or 'new' when they weren't on the board before. */
const RANKS_KEY = 'balloonDefense.ranks';
function rankMoves(board, list, store2 = null) {
    let all = {};
    try {
        all = store2 || JSON.parse(localStorage.getItem(RANKS_KEY) || '{}') || {};
    }
    catch (e) { }
    const now = {};
    for (const x of list)
        now[x.uid] = x.rank;
    const b = all[board] || { cur: null, prev: null };
    if (JSON.stringify(b.cur) !== JSON.stringify(now)) {
        b.prev = b.cur;
        b.cur = now;
        all[board] = b;
        for (const k of Object.keys(all))
            if (k.startsWith('daily:') && k < 'daily:' + todayStr(new Date(Date.now() - 8 * 864e5)))
                delete all[k]; // forget daily boards older than a week
        try {
            localStorage.setItem(RANKS_KEY, JSON.stringify(all));
        }
        catch (e) { }
    }
    const out = {};
    for (const x of list)
        out[x.uid] = !b.prev ? 0 : b.prev[x.uid] === undefined ? 'new' : b.prev[x.uid] - x.rank;
    return out;
}
/** A tier board: each player's total tier score; ties go to the faster total game clock. */
function tierBoard(tier, ua, players = allPlayers()) {
    return players.map(p => Object.assign({ p }, tierScore(tier, ua, p.runs))).filter(x => x.stages > 0)
        .sort((a, b) => b.score - a.score || a.clock - b.clock).map((x, i) => Object.assign(x, { rank: i + 1 }));
}
/** A stage board: every player's best run on one map and difficulty, best first. */
function stageRanking(mapId, diff, ua, players = allPlayers()) {
    return players.map(p => ({ p, run: p.runs[stageKey(mapId, diff, ua)] })).filter(x => x.run)
        .sort((a, b) => compareRuns(a.run, b.run)).map((x, i) => Object.assign(x, { rank: i + 1 }));
}
/** Medals: 1st, 2nd and 3rd places a player holds on the Standard stage boards. */
function medalsOf(key, players = allPlayers()) {
    const m = medalTable(players).get(key);
    return m ? { gold: m.gold, silver: m.silver, bronze: m.bronze } : { gold: 0, silver: 0, bronze: 0 };
}
/* ---------- 5.1.1: map and medal notifications ----------
   Both compare the boards with what this profile saw last time (`seen`, kept in its save). The first look only
   remembers, so old results never flood the bell. */
/** Maps a player dominates: every difficulty cleared on Standard. */
function dominatedMaps(p) {
    return MAPS.filter(m => Object.keys(DIFF).every(k => { const r = p.runs && p.runs[stageKey(m.id, k, false)]; return !!(r && r.cleared); })).map(m => m.id);
}
/** New dominations since `seen` ({ uid: [mapId] }, or null on the first look). Returns { notes, seen }. */
function dominationNotes(players, seen) {
    const now = {}, notes = [];
    for (const p of players) {
        const uid = p.id && p.id.uid;
        if (!uid)
            continue;
        now[uid] = dominatedMaps(p);
        if (!seen)
            continue;
        for (const id of now[uid])
            if (!(seen[uid] || []).includes(id)) {
                const m = MAPS.find(x => x.id === id);
                notes.push({ id: 'dom-' + uid + '-' + id, kind: 'dom', av: avatarOf(p.id), me: !!p.me,
                    text: (p.me ? 'You dominate ' : p.id.name + ' dominates ') + 'the ' + m.name + ' map!',
                    sub: 'Cleared every difficulty: ' + Object.keys(DIFF).map(k => DIFF[k].name).join(', ') });
            }
    }
    // keep what was seen of players who aren't listed right now (a file that didn't load this time)
    return { notes, seen: Object.assign({}, seen || {}, now) };
}
/** My medals on the Standard stage boards: { stageKey: { r: rank, above: [uids ranked above me] } }. */
function myMedalSpots(players) {
    const out = {};
    for (const map of MAPS)
        for (const k of Object.keys(DIFF)) {
            const list = stageRanking(map.id, k, false, players), mine = list.find(x => x.p.me);
            if (mine && mine.rank <= 3)
                out[stageKey(map.id, k, false)] = { r: mine.rank, above: list.slice(0, mine.rank - 1).map(x => x.p.id.uid) };
        }
    return out;
}
function medalPts(rank) { return rank >= 1 && rank <= 3 ? MEDAL_POINTS[MEDALS[rank - 1]] : 0; }
/** Someone took one of my medals since `seen` (myMedalSpots, or null on the first look): who, my medal now, and the
    points I lost. Returns { notes, seen }. */
function medalLostNotes(players, seen) {
    const now = myMedalSpots(players), notes = [], me = players.find(p => p.me);
    if (!seen || !me)
        return { notes, seen: now };
    for (const [key, old] of Object.entries(seen)) {
        const cur = now[key];
        if (cur && cur.r <= old.r)
            continue;
        const [mapId, diff] = key.split(':'), map = MAPS.find(m => m.id === mapId);
        if (!map || !DIFF[diff])
            continue;
        const list = stageRanking(mapId, diff, false, players), mine = list.find(x => x.p.me);
        if (!mine)
            continue; // my own run is gone (not taken by anyone)
        const takers = list.filter(x => x.rank < mine.rank && !old.above.includes(x.p.id.uid)).sort((a, b) => (+b.run.at || 0) - (+a.run.at || 0));
        if (!takers.length)
            continue;
        const t = takers[0], lost = MEDALS[old.r - 1], has = cur ? MEDALS[cur.r - 1] : '', d = medalPts(cur ? cur.r : 0) - medalPts(old.r);
        notes.push({ id: 'mlost-' + key + '-' + t.p.id.uid + '-' + (+t.run.at || 0), kind: 'mlost', av: avatarOf(t.p.id), taker: t.p.id.name,
            text: t.p.id.name + ' took your ' + lost + ' medal on ' + map.name + ' · ' + DIFF[diff].name + '!',
            sub: (has ? 'Your medal now: ' + has : 'You have no medal there now') + ' · ' + d + ' point' + (Math.abs(d) === 1 ? '' : 's') });
    }
    return { notes, seen: now };
}
/** Medal points a run of mine on one stage just gained, against what this profile saw before the game (+3 for a new
    gold, +1 for silver to gold...). Call it before the boards are looked at again. */
function medalGain(key, rank) {
    const seen = store.get('medalSeen', null), old = seen && seen[key] ? seen[key].r : 0;
    return medalPts(rank) - medalPts(old);
}
/* ---------- Titles & borders ---------- */
function unlockedTitles() { return TITLES.filter(t => PROFILE.pops >= t.pops); }
function titleById(id) { return TITLES.find(t => t.id === id) || TITLES[0]; }
function currentTitle(p = getId()) { const t = titleById(p && p.title); return PROFILE.pops >= t.pops ? t : TITLES[0]; }
function nextTitle() { return TITLES.find(t => PROFILE.pops < t.pops) || null; }
function borderUnlocked(b) {
    if (b.free)
        return true;
    const t = TITLES.find(x => x.border === b.id);
    if (t)
        return PROFILE.pops >= t.pops;
    if (b.id === 'perfect')
        return (PROFILE.perfect || 0) >= 12;
    if (b.id === 'streak')
        return Math.max(PROFILE.bestStreak || 0, dailyStreak()) >= 30;
    if (b.id === 'medalist')
        return medalsOf(ACTIVE_KEY).gold >= 10;
    return false;
}
function borderById(id) { return BORDERS.find(b => b.id === id) || BORDERS[0]; }
/* ---------- Avatar art (inline SVG, original cartoon animals) ---------- */
/** Gold crown over the top of the avatar, for the Global #1 (CROWN_UID). */
const CROWN_SVG = `<g transform="translate(50 15)"><path d="M-19 9 L-21 -7 L-10 1 L0 -12 L10 1 L21 -7 L19 9Z" fill="#ffd54f" stroke="#7a5600" stroke-width="2.4" stroke-linejoin="round"/>
  <rect x="-19" y="6" width="38" height="5" rx="1.5" fill="#ffb300" stroke="#7a5600" stroke-width="2"/><circle cy="-12" r="3" fill="#ff5252" stroke="#7a5600" stroke-width="1.2"/>
  <circle cx="-21" cy="-7" r="2.4" fill="#40c4ff"/><circle cx="21" cy="-7" r="2.4" fill="#40c4ff"/></g>`;
let SVG_UID = 0;
/* 5.1.2: a player not seen for 3 days shows the idle photo instead of their animal (border and crown stay). */
const IDLE_MS = 3 * 86400000, IDLE_IMG = 'assets/ui/idle-avatar.png';
let idleSeen = null, idleSeenAt = 0;
function isIdle(uid, now = Date.now()) {
    if (!uid)
        return false;
    try {
        if (getId().uid === uid && loggedIn())
            return false;
    }
    catch (e) { }
    if (!idleSeen || now - idleSeenAt > 5000) { // read the shared folder copy at most every 5 s, not once per avatar
        idleSeen = new Map();
        for (const x of sharedCache().players)
            if (x && x.uid)
                idleSeen.set(x.uid, Math.max((x.inuse && +x.inuse.at) || 0, +x.updated || 0));
        idleSeenAt = now;
    }
    const seen = idleSeen.get(uid) || 0;
    return seen > 0 && now - seen >= IDLE_MS;
}
function avatarSVG(o, size = 64) {
    const u = 'av' + (++SVG_UID), A = ANIMALS.find(a => a.id === o.animal) || ANIMALS[0], bg = AVATAR_BGS.find(b => b.id === o.bg) || AVATAR_BGS[0];
    const own = borderById(o.border), bd = o.uid && o.uid === WB_CHAMP_UID ? borderById('wblegend') : own.special ? BORDERS[0] : own, fem = o.style === 'f', fur = A.fur, inner = A.inner, earC = A.earCol || fur;
    const dark = '#263238';
    let ears = '', head = '', face = '', top = '';
    switch (A.ear) {
        case 'point':
            ears = `<path d="M24 46 L30 14 L46 34Z M76 46 L70 14 L54 34Z" fill="${fur}"/><path d="M29 38 L31 22 L40 33Z M71 38 L69 22 L60 33Z" fill="${A.mask ? '#eceff1' : '#ffccbc'}"/>`;
            break;
        case 'round':
            ears = `<circle cx="28" cy="34" r="12" fill="${earC}"/><circle cx="72" cy="34" r="12" fill="${earC}"/><circle cx="28" cy="34" r="6" fill="${A.earCol ? '#455a64' : inner}"/><circle cx="72" cy="34" r="6" fill="${A.earCol ? '#455a64' : inner}"/>`;
            break;
        case 'long':
            ears = `<ellipse cx="38" cy="20" rx="8" ry="22" fill="${fur}" transform="rotate(-10 38 20)"/><ellipse cx="62" cy="20" rx="8" ry="22" fill="${fur}" transform="rotate(10 62 20)"/><ellipse cx="38" cy="22" rx="4" ry="15" fill="#f8bbd0" transform="rotate(-10 38 22)"/><ellipse cx="62" cy="22" rx="4" ry="15" fill="#f8bbd0" transform="rotate(10 62 22)"/>`;
            break;
        case 'tuft':
            ears = `<path d="M24 40 L26 20 L40 32Z M76 40 L74 20 L60 32Z" fill="#6d4c41"/>`;
            break;
        case 'flop':
            ears = `<ellipse cx="24" cy="54" rx="10" ry="19" fill="${earC}" transform="rotate(18 24 54)"/><ellipse cx="76" cy="54" rx="10" ry="19" fill="${earC}" transform="rotate(-18 76 54)"/>`;
            break;
        case 'leaf':
            ears = `<ellipse cx="22" cy="42" rx="14" ry="7" fill="${fur}" transform="rotate(-28 22 42)"/><ellipse cx="78" cy="42" rx="14" ry="7" fill="${fur}" transform="rotate(28 78 42)"/><ellipse cx="22" cy="42" rx="8" ry="3.5" fill="#f3dcc5" transform="rotate(-28 22 42)"/><ellipse cx="78" cy="42" rx="8" ry="3.5" fill="#f3dcc5" transform="rotate(28 78 42)"/>`;
            break;
        case 'eyes':
            ears = `<circle cx="35" cy="36" r="12" fill="${fur}"/><circle cx="65" cy="36" r="12" fill="${fur}"/>`;
            break;
    }
    if (A.antlers)
        ears = `<path d="M38 30 L32 8 M34 16 L24 12 M33 12 L36 4 M62 30 L68 8 M66 16 L76 12 M67 12 L64 4" stroke="#6d4c41" stroke-width="4" stroke-linecap="round" fill="none"/>` + ears;
    head = `<ellipse cx="50" cy="58" rx="30" ry="27" fill="${fur}"/>`;
    if (A.id === 'penguin')
        face = `<path d="M50 44 C38 36 24 46 28 62 C31 76 44 82 50 82 C56 82 69 76 72 62 C76 46 62 36 50 44Z" fill="${inner}"/>`;
    else if (A.id === 'owl')
        face = `<circle cx="39" cy="55" r="12" fill="${inner}"/><circle cx="61" cy="55" r="12" fill="${inner}"/><path d="M34 76 Q50 86 66 76 Q50 70 34 76Z" fill="#a1887f"/>`;
    else if (A.id === 'fox')
        face = `<path d="M22 58 Q36 64 50 80 Q64 64 78 58 Q78 82 50 85 Q22 82 22 58Z" fill="${inner}"/>`;
    else if (A.id === 'frog')
        face = `<path d="M34 70 Q50 80 66 70" stroke="#33691e" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    else
        face = `<ellipse cx="50" cy="69" rx="15" ry="11" fill="${inner}"/>`;
    if (A.patches)
        face += `<ellipse cx="39" cy="55" rx="7" ry="9" fill="${A.patches}" transform="rotate(25 39 55)"/><ellipse cx="61" cy="55" rx="7" ry="9" fill="${A.patches}" transform="rotate(-25 61 55)"/>`;
    if (A.mask)
        face += `<path d="M22 52 Q36 44 50 54 Q64 44 78 52 Q74 62 62 60 Q50 56 38 60 Q26 62 22 52Z" fill="${A.mask}"/>`;
    if (A.stripes)
        face += `<path d="M50 32 L50 42 M42 33 L44 41 M58 33 L56 41 M22 56 L30 58 M22 64 L30 63 M78 56 L70 58 M78 64 L70 63" stroke="${dark}" stroke-width="3" stroke-linecap="round"/>`;
    if (A.id === 'deer')
        face += `<circle cx="40" cy="40" r="2" fill="#fff3e0"/><circle cx="58" cy="38" r="2.2" fill="#fff3e0"/><circle cx="50" cy="35" r="1.8" fill="#fff3e0"/>`;
    // eyes
    const ey = A.ear === 'eyes' ? 35 : 55, ex = A.ear === 'eyes' ? 15 : 11, er = A.ear === 'eyes' ? 7 : 4.5;
    const eyeWhite = A.ear === 'eyes' || A.patches ? '#ffffff' : null;
    let eyes = '';
    for (const sx of [-1, 1]) {
        const x = 50 + sx * ex;
        if (eyeWhite)
            eyes += `<circle cx="${x}" cy="${ey}" r="${er + 1.5}" fill="${eyeWhite}"/>`;
        eyes += `<circle cx="${x}" cy="${ey}" r="${eyeWhite ? er - 2 : er}" fill="${dark}"/><circle cx="${x + 1.5}" cy="${ey - 1.5}" r="1.4" fill="#fff"/>`;
        if (fem)
            eyes += `<path d="M${x - 4 * sx} ${ey - 4} l${-3 * sx} -3 M${x - 1 * sx} ${ey - 5} l${-1 * sx} -4 M${x + 2 * sx} ${ey - 5} l${1 * sx} -3.5" stroke="${dark}" stroke-width="1.4" stroke-linecap="round"/>`;
        else
            eyes += `<path d="M${x - 5} ${ey - 8 + (sx < 0 ? 1 : 0)} L${x + 5} ${ey - 8 + (sx > 0 ? 1 : 0)}" stroke="${A.id === 'panda' || A.id === 'penguin' ? '#90a4ae' : dark}" stroke-width="2" stroke-linecap="round" opacity=".7"/>`;
    }
    let nose = '';
    if (A.beak)
        nose = `<path d="M44 63 L56 63 L50 72Z" fill="#ffa726" stroke="#e65100" stroke-width="1"/>`;
    else if (A.nose)
        nose = `<ellipse cx="50" cy="64" rx="4.5" ry="3.2" fill="${A.nose}"/><path d="M44 70 Q47 73 50 70 Q53 73 56 70" stroke="${dark}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    if (A.whiskers)
        nose += `<path d="M36 66 L22 63 M36 69 L22 70 M64 66 L78 63 M64 69 L78 70" stroke="#616161" stroke-width="1.2"/>`;
    if (fem) {
        top += `<ellipse cx="33" cy="68" rx="5" ry="3" fill="#f48fb1" opacity=".55"/><ellipse cx="67" cy="68" rx="5" ry="3" fill="#f48fb1" opacity=".55"/>`;
        top += `<g transform="translate(70 28) rotate(15)"><path d="M0 0 L-10 -6 L-10 6Z M0 0 L10 -6 L10 6Z" fill="#ec407a"/><circle r="3" fill="#ad1457"/></g>`;
    }
    else
        top += `<g transform="translate(50 89)"><path d="M0 0 L-10 -6 L-10 6Z M0 0 L10 -6 L10 6Z" fill="#1e88e5"/><circle r="2.6" fill="#0d47a1"/></g>`;
    // background
    let bgx = `<defs><linearGradient id="${u}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg.a}"/><stop offset="1" stop-color="${bg.b}"/></linearGradient>
      <clipPath id="${u}c"><circle cx="50" cy="50" r="45"/></clipPath>
      <linearGradient id="${u}lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5252"/><stop offset=".25" stop-color="#ffd740"/><stop offset=".5" stop-color="#69f0ae"/><stop offset=".75" stop-color="#40c4ff"/><stop offset="1" stop-color="#e040fb"/>
      </linearGradient></defs>
      <circle cx="50" cy="50" r="46" fill="url(#${u}g)"/>`;
    if (bg.dots)
        bgx += `<g fill="${bg.dots}" opacity=".5">${[[20, 22], [78, 18], [14, 60], [86, 58], [30, 86], [70, 84], [50, 12]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6"/>`).join('')}</g>`;
    if (bg.stripes)
        bgx += `<g clip-path="url(#${u}c)" stroke="${bg.stripes}" stroke-width="5" opacity=".28">${[0, 1, 2, 3, 4, 5, 6].map(i => `<line x1="${i * 18 - 20}" y1="0" x2="${i * 18 + 20}" y2="100"/>`).join('')}</g>`;
    // border
    const col = bd.animated ? `url(#${u}lg)` : bd.col;
    let bx = '';
    if (bd.glow)
        bx += `<circle cx="50" cy="50" r="46" fill="none" stroke="${bd.glow}" stroke-width="${bd.w + 5}" opacity=".45"/>`;
    bx += `<circle cx="50" cy="50" r="46" fill="none" stroke="${col}" stroke-width="${bd.w}"${bd.dash ? ` stroke-dasharray="${bd.dash}"` : ''}/>`;
    if (bd.double)
        bx += `<circle cx="50" cy="50" r="41" fill="none" stroke="${bd.col}" stroke-width="1.5" opacity=".8"/>`;
    if (bd.dots || bd.rivets)
        bx += Array.from({ length: 12 }, (_, i) => { const a = i / 12 * TAU; return `<circle cx="${(50 + Math.cos(a) * 46).toFixed(1)}" cy="${(50 + Math.sin(a) * 46).toFixed(1)}" r="${bd.rivets ? 2.2 : 1.7}" fill="${bd.dots || bd.rivets}"/>`; }).join('');
    if (bd.spikes)
        bx += Array.from({ length: 10 }, (_, i) => { const a = i / 10 * TAU - Math.PI / 2, c = Math.cos, s = Math.sin; const p = (r, da) => `${(50 + c(a + da) * r).toFixed(1)},${(50 + s(a + da) * r).toFixed(1)}`; return `<polygon points="${p(48, -.12)} ${p(56, 0)} ${p(48, .12)}" fill="${bd.spikes}"/>`; }).join('');
    if (bd.animated) // the ring and its spikes turn smoothly round the avatar (css .bdspin); the face stays still
        bx = `<g class="bdspin">${bx}</g>`;
    if (bd.storm)
        bx = stormBorder();
    const vb = bd.storm ? '-14 -14 128 128' : bd.spikes ? '-6 -6 112 112' : '0 0 100 100';
    const crown = o.uid && o.uid === CROWN_UID ? CROWN_SVG : '', idle = isIdle(o.uid);
    return `<svg class="avatar${crown ? ' crowned' : ''}${bd.storm ? ' storm' : ''}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${vb}" role="img" aria-label="${idle ? 'Idle' : A.name} avatar${crown ? ', Global #1' : ''}">${bgx}<g clip-path="url(#${u}c)">${idle
        ? `<image href="${IDLE_IMG}" x="5" y="5" width="90" height="90" preserveAspectRatio="xMidYMid slice"/>`
        : ears + head + face + eyes + nose + top}</g>${bx}${crown}</svg>`;
}
/** The World Boss Legend border: a black ring with blood-red fangs and a pulsing red glow, and lightning bolts between
    the fangs that flash. Fangs and bolts turn slowly round the avatar; the face stays still (css .bdspin, .bdglow, .bdbolt). */
function stormBorder() {
    const f = (n) => n.toFixed(1), p = (r, a) => f(50 + Math.cos(a) * r) + ',' + f(50 + Math.sin(a) * r), top = -Math.PI / 2;
    let fangs = '', bolts = '';
    for (let i = 0; i < 12; i++) {
        const a = top + i / 12 * TAU;
        fangs += `<polygon points="${p(48, a - .14)} ${p(58, a)} ${p(48, a + .14)}" fill="#212121" stroke="#ff1744" stroke-width="1.2"/>`;
    }
    for (let i = 0; i < 6; i++) {
        const a = top + (i * 2 + 1) / 12 * TAU, deg = a * 180 / Math.PI + 90;
        bolts += `<g transform="translate(${f(50 + Math.cos(a) * 56)} ${f(50 + Math.sin(a) * 56)}) rotate(${f(deg)}) scale(1.5)"><path class="bdbolt" style="animation-duration:${(1 + i * .23).toFixed(2)}s" d="M1.5 -10 L-4.5 0 L0 0 L-2.5 9 L5.5 -2.5 L1 -2.5 Z" fill="#fff59d" stroke="#ffab00" stroke-width="1"/></g>`;
    }
    // fangs under the ring, bolts on top of it (both turn together, so they stay in step)
    return `<circle class="bdglow" cx="50" cy="50" r="47" fill="none" stroke="#ff1744" stroke-width="13" opacity=".3"/><g class="bdspin slow">${fangs}</g>`
        + `<circle cx="50" cy="50" r="46" fill="none" stroke="#1b1b1b" stroke-width="8"/><circle cx="50" cy="50" r="43" fill="none" stroke="#d50000" stroke-width="1.5"/>`
        + `<g class="bdspin slow">${bolts}</g>`;
}
/* ---------- Backup code (F10) ----------
   All progress as one block of text with a checksum, to paste into Notepad. */
function hash32(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
}
function backupCode() {
    const json = JSON.stringify(store.all());
    const b64 = btoa(unescape(encodeURIComponent(json)));
    const lines = b64.match(/.{1,64}/g) || [];
    return 'BD4-' + hash32(json) + '\n' + lines.join('\n') + '\nEND';
}
function parseBackup(text) {
    const t = String(text || '');
    const i = t.indexOf('BD4-');
    if (i < 0)
        return { ok: false, error: 'This doesn\'t look like a Balloon Defense backup code.' };
    const body = t.slice(i + 4).split('END')[0].replace(/\s+/g, '');
    const sum = body.slice(0, 8), b64 = body.slice(8);
    try {
        const json = decodeURIComponent(escape(atob(b64)));
        if (hash32(json) !== sum)
            return { ok: false, error: 'The code is damaged (checksum mismatch). Copy all of it, including the first and last lines.' };
        const data = JSON.parse(json);
        if (!data || typeof data !== 'object')
            return { ok: false, error: 'The code is empty.' };
        return { ok: true, data };
    }
    catch (e) {
        return { ok: false, error: 'The code is damaged and can\'t be read.' };
    }
}
/** Restores a backup into the active slot. The restored profile plays on this PC from now on (like Find my profile).
    The same profile is merged (nothing is lost); a different one replaces the slot. */
function restoreBackup(data) {
    if (data && data.id && data.id.uid) {
        data.id = Object.assign({}, data.id, { home: { pc: thisPcId(), at: Date.now() } });
        const pc = pcInfo();
        pc.owner = data.id.uid;
        savePcInfo(pc);
    }
    store.save(data);
}
function backupFileName(d = new Date()) { return 'balloon-defense-backup-' + todayStr(d) + '.txt'; }
function backupFileText() {
    const p = getId();
    return 'Balloon Defense backup\r\n' + (p ? 'Player: ' + fullName(p) + '\r\n' : '') + 'Saved: ' + new Date().toLocaleString() + '\r\n'
        + 'To restore: Settings > Backup > Restore, then paste everything below (or load this file).\r\n\r\n' + backupCode().replace(/\n/g, '\r\n') + '\r\n';
}
function backupDue() { return PROFILE.games > 0 && PROFILE.games - (PROFILE.backupAt || 0) >= 5; }
function markBackedUp() { PROFILE.backupAt = PROFILE.games; saveProfile(); }
/* 5.1.1: the World Boss builds set in master control (this browser's copy; the shared folder copy is merged at sync). */
applyWbConfig();

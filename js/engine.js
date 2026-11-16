"use strict";
/* Balloon Defense — game rules: grid, paths, balloons, towers, line of sight, abilities, projectiles, rounds,
   saving, player and tower progression, run ranking. No drawing or DOM code lives here. */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
/* ---------- Storage ---------- */
const STORE_KEY = 'balloonDefense.v2'; // unchanged since v2 so older progress carries over (the first player's slot)
/* Several players can share one PC: each has its own save slot, listed in the roster. Everything below
   (settings, profile, runs, tower XP) belongs to the active player; switching players reloads the page. */
const ROSTER_KEY = 'balloonDefense.players';
function readSlot(key) {
    try {
        return JSON.parse(localStorage.getItem(key) || '{}') || {};
    }
    catch (e) {
        return {};
    }
}
function roster() {
    let r = null;
    try {
        r = JSON.parse(localStorage.getItem(ROSTER_KEY) || 'null');
    }
    catch (e) { }
    if (!r || !Array.isArray(r.keys) || !r.keys.length)
        r = { active: STORE_KEY, keys: [STORE_KEY] };
    if (!r.keys.includes(r.active))
        r.active = r.keys[0];
    return r;
}
function saveRoster(r) {
    try {
        localStorage.setItem(ROSTER_KEY, JSON.stringify(r));
    }
    catch (e) { }
}
let ACTIVE_KEY = roster().active;
/** Set when master control deleted the active profile (profile.ts dropProfileHere): nothing is saved until the page reloads. */
let SAVES_OFF = false;
const store = {
    all() { return readSlot(ACTIVE_KEY); },
    /** Saves the active player's slot. Progress never goes backwards: the new copy is merged with the one already
        saved (keepProgress, profile.ts), so larger counters, tower XP and best runs are kept. `replace` skips that. */
    save(o, replace) {
        if (SAVES_OFF)
            return;
        try {
            o.updated = Date.now();
            if (typeof thisPcId === 'function')
                o.pc = thisPcId();
            if (!replace && typeof keepProgress === 'function')
                o = keepProgress(readSlot(ACTIVE_KEY), o);
            localStorage.setItem(ACTIVE_KEY, JSON.stringify(o));
        }
        catch (e) { }
    },
    get(k, d) { const v = this.all()[k]; return v === undefined || v === null ? d : v; },
    set(k, v) {
        const o = this.all();
        o[k] = v;
        this.save(o);
        if (typeof onStoreChange === 'function')
            onStoreChange(k); // the shared-folder copy is updated a few seconds later
    }
};
/** Test and balance tools only (tests/, tools/): every tower and upgrade open. Players can't switch it on. */
const DEV = { unlockAll: false };
const SETTINGS = Object.assign({ autoStart: false, pauseOnBlur: true, effects: 'high', confirmSell: false, sound: false,
    shake: false, cbMarks: false, uiScale: 100, abilTray: true, notify: true, chatToasts: true }, store.get('settings', {}));
delete SETTINGS.unlockAll; // Unlock All was removed in 5.0
delete SETTINGS.boards;
function saveSettings() { store.set('settings', SETTINGS); }
function records() { return store.get('records', {}); }
function recordFor(mapId, diff) { const r = records()[mapId]; return (r && r[diff]) || { best: 0, won: false }; }
function challengesWon(mapId) { const r = records()[mapId]; return (r && r.modes) || {}; }
const PROFILE_DEFAULT = { xp: 0, games: 0, wins: 0, finished: 0, perfect: 0, pops: 0, seconds: 0, rounds: 0, built: {}, bosses: 0, bestStreak: 0, backupAt: 0 };
let PROFILE = Object.assign({}, PROFILE_DEFAULT, store.get('profile', {}));
function saveProfile() { store.set('profile', PROFILE); }
function levelOf(xp) {
    let L = 1;
    while (L < 50 && xp >= xpForLevel(L + 1))
        L++;
    return L;
}
function playerLevel() { return levelOf(PROFILE.xp); }
function isUnlocked(type) { return DEV.unlockAll || playerLevel() >= TD[type].unlock; }
function addXP(n) {
    const before = playerLevel();
    PROFILE.xp += Math.round(n);
    saveProfile();
    const after = playerLevel();
    if (after > before)
        onLevelUp(after, before);
}
function winRate() { return PROFILE.finished ? PROFILE.wins / PROFILE.finished : 0; }
function todayStr(d = new Date()) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function dailyConfig(date = todayStr()) {
    let h = 7;
    for (const ch of date)
        h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const r = rng(h);
    return { mapIdx: Math.floor(r() * MAPS.length), diffKey: r() < .55 ? 'easy' : 'medium', mode: ['standard', ...CHALLENGES][Math.floor(r() * 5)], daily: date };
}
function dailyDone(date = todayStr()) { return !!store.get('daily', {})[date]; }
/** 5.1: there is no daily challenge on Saturdays and Sundays. Takes a Date or a 'YYYY-MM-DD' date. */
function dailyOff(d = new Date()) {
    const day = typeof d === 'string' ? new Date(d + 'T12:00:00') : d, w = day.getDay();
    return w === 0 || w === 6;
}
/** The daily challenge days to show on the Daily board, newest first: today (if it's a weekday) and the weekdays before. */
function dailyDays(n = 5, now = new Date()) {
    const out = [], day = new Date(now.getTime());
    for (let i = 0; out.length < n && i < 30; i++) {
        if (!dailyOff(day))
            out.push(todayStr(day));
        day.setDate(day.getDate() - 1);
    }
    return out;
}
/** Days in a row with a daily challenge won. Weekends have no challenge, so they are skipped and never break it. */
function dailyStreak(d = store.get('daily', {}), now = new Date()) {
    let n = 0;
    const day = new Date(now.getTime()), back = () => {
        let i = 0;
        do
            day.setDate(day.getDate() - 1);
        while (dailyOff(day) && ++i < 7);
    };
    if (dailyOff(day) || !d[todayStr(day)])
        back();
    while (d[todayStr(day)]) {
        n++;
        back();
    }
    return n;
}
/* Daily challenge results for the Daily Top 10: each player's best try per date. Wins rank first, then more lives
   left, then a faster game clock; tries that were lost rank by the round reached. */
function dailyRunFrom(g) { return { won: !!g.won, round: g.round, lives: Math.max(0, g.lives), clock: Math.round((g.clock || 0) * 100) / 100, at: Date.now() }; }
function compareDaily(a, b) {
    if (!!a.won !== !!b.won)
        return a.won ? -1 : 1;
    if (!a.won && a.round !== b.round)
        return b.round - a.round;
    if (a.lives !== b.lives)
        return b.lives - a.lives;
    if (Math.abs((a.clock || 0) - (b.clock || 0)) > 1e-6)
        return (a.clock || 0) - (b.clock || 0);
    return (a.at || 0) - (b.at || 0);
}
/** Keeps the player's best daily try for that date. Only the first end of a game counts (not freeplay after a win). */
function saveDailyRun(g) {
    if (!g || !g.daily || g.dailySaved || g.round < 1)
        return false;
    g.dailySaved = true;
    const all = store.get('dailyRuns', {}), run = dailyRunFrom(g), cur = all[g.daily];
    if (cur && compareDaily(cur, run) <= 0)
        return false;
    all[g.daily] = run;
    const out = {};
    for (const k of Object.keys(all).sort().slice(-30))
        out[k] = all[k]; // a month of results is plenty
    store.set('dailyRuns', out);
    return true;
}
/* ---------- Tower progression: XP, unlocks, levels, skill points ---------- */
let TPROG = store.get('towers', {});
function tprog(type) {
    const p = TPROG[type] || (TPROG[type] = { xp: 0, total: 0, unl: {}, perks: {}, perksUA: {} });
    if (!p.unl)
        p.unl = {}; // a copy from a v4.0 player file held only the XP total
    if (!p.perks)
        p.perks = {};
    p.xp = +p.xp || 0;
    p.total = +p.total || 0;
    return p;
}
function saveTprog() { store.set('towers', TPROG); }
function towerLevel(type) { return towerLevelOf(tprog(type).total); }
function towerLevelOf(t) {
    let L = 1;
    while (L < MAX_TOWER_LEVEL && t >= towerXpForLevel(L + 1))
        L++;
    return L;
}
function skillPoints(type) { return DEV.unlockAll ? MAX_TOWER_LEVEL : towerLevel(type); }
function perkAlloc(type) {
    const p = tprog(type);
    if (DEV.unlockAll)
        return p.perksUA || (p.perksUA = {});
    return p.perks || (p.perks = {});
}
function spentPoints(type) { const a = perkAlloc(type); return perkList(type).reduce((s, k) => s + (a[k.id] || 0), 0); }
/** Effective perks for a tower type (allocation trimmed to the points available). */
function perksFor(type) {
    const a = perkAlloc(type), out = {};
    let left = skillPoints(type);
    for (const k of perkList(type)) {
        const n = Math.min(a[k.id] || 0, k.max, left);
        out[k.id] = n;
        left -= n;
    }
    return out;
}
function setPerk(type, id, delta) {
    const k = perkList(type).find(x => x.id === id), a = perkAlloc(type), cur = a[id] || 0;
    if (!k)
        return false;
    if (delta > 0 && (cur >= k.max || spentPoints(type) >= skillPoints(type)))
        return false;
    if (delta < 0 && cur <= 0)
        return false;
    a[id] = cur + (delta > 0 ? 1 : -1);
    saveTprog();
    return true;
}
function resetPerks(type) {
    const p = tprog(type);
    if (DEV.unlockAll)
        p.perksUA = {};
    else
        p.perks = {};
    saveTprog();
}
function tierUnlocked(type, p, tier) { return tier < 3 || DEV.unlockAll || !!(tprog(type).unl || {})[p + '-' + tier]; }
function unlockProblem(type, p, tier) {
    if (tierUnlocked(type, p, tier))
        return 'unlocked';
    if (tier > 3 && !tierUnlocked(type, p, tier - 1))
        return 'Unlock tier ' + (tier - 1) + ' first';
    if (tprog(type).xp < TIER_XP[tier])
        return 'Needs ' + TIER_XP[tier].toLocaleString() + ' ' + TD[type].name + ' XP';
    return '';
}
function unlockTier(type, p, tier) {
    if (unlockProblem(type, p, tier))
        return false;
    const pr = tprog(type);
    pr.xp -= TIER_XP[tier];
    pr.unl[p + '-' + tier] = 1;
    saveTprog();
    return true;
}
function addTowerXP(type, n) {
    if (n <= 0)
        return;
    const before = towerLevel(type), pr = tprog(type);
    pr.xp += n;
    pr.total += n;
    const after = towerLevel(type);
    if (after > before)
        onTowerLevel(type, after);
}
/* ---------- Paths ---------- */
function buildPath(pts) {
    const segs = [], clean = [];
    for (const p of pts)
        if (!clean.length || Math.hypot(p[0] - clean[clean.length - 1][0], p[1] - clean[clean.length - 1][1]) > 0.5)
            clean.push(p);
    let acc = 0;
    for (let i = 0; i < clean.length - 1; i++) {
        const [x1, y1] = clean[i], [x2, y2] = clean[i + 1], len = Math.hypot(x2 - x1, y2 - y1);
        segs.push({ x1, y1, x2, y2, len, start: acc, a: Math.atan2(y2 - y1, x2 - x1) });
        acc += len;
    }
    return { pts: clean, segs, len: acc };
}
function posAt(path, d) {
    const s = path.segs;
    let i = 0;
    while (i < s.length - 1 && d > s[i].start + s[i].len)
        i++;
    const g = s[i], t = clamp((d - g.start) / g.len, 0, 1);
    return { x: g.x1 + (g.x2 - g.x1) * t, y: g.y1 + (g.y2 - g.y1) * t, a: g.a };
}
function distToPaths(paths, x, y) {
    let best = 1e9;
    for (const p of paths)
        for (const g of p.segs) {
            const dx = g.x2 - g.x1, dy = g.y2 - g.y1, L2 = dx * dx + dy * dy;
            const t = L2 ? clamp(((x - g.x1) * dx + (y - g.y1) * dy) / L2, 0, 1) : 0;
            best = Math.min(best, Math.hypot(x - (g.x1 + dx * t), y - (g.y1 + dy * t)));
        }
    return best;
}
function inBlock(b, x, y, pad) { const dx = (x - b.x) / (b.rx + pad), dy = (y - b.y) / (b.ry + pad); return dx * dx + dy * dy < 1; }
/** Straight road pieces sit on grid lines, so the road (2 tiles wide) covers whole tiles and leaves no blocked strip
    of grass beside it. Only points on horizontal or vertical pieces move (by up to half a tile); curves stay as drawn. */
function snapRoad(pts) {
    const near = (v) => Math.round(v / TILE) * TILE;
    return pts.map(([x, y], i) => {
        const a = pts[i - 1], b = pts[i + 1];
        const vert = (a && Math.abs(a[0] - x) < 0.5) || (b && Math.abs(b[0] - x) < 0.5);
        const horiz = (a && Math.abs(a[1] - y) < 0.5) || (b && Math.abs(b[1] - y) < 0.5);
        return [vert ? near(x) : x, horiz ? near(y) : y];
    });
}
function mapPaths(map, reverse) { return map.paths.map(p => { const q = snapRoad(p); return buildPath(reverse ? q.reverse() : q); }); }
function hasWater(map) { return (map.blocks || []).some(b => b.k === 'water'); }
const PROP_R = { stall: 27, crate: 17, boulder: 24, rock: 14 };
/** Scenery for a map: hand-placed props, random pieces, and a dense frame of foliage around the edges. */
function makeDeco(map, paths) {
    const theme = THEMES[map.theme], r = rng(map.seed * 7 + 3), out = [];
    const clear = (x, y, rad, gap) => distToPaths(paths, x, y) >= rad + gap && !(map.blocks || []).some(b => inBlock(b, x, y, rad + 6));
    for (const p of map.props || []) {
        const rad = (PROP_R[p.type] || 20) * (p.s || 1);
        out.push({ type: p.type, x: p.x, y: p.y, r: rad, rot: 0, prop: true });
    }
    for (let tries = 0; tries < 1400 && out.length < 30 + (map.props || []).length; tries++) {
        const type = theme.deco[Math.floor(r() * theme.deco.length)];
        const big = type.includes('tree') || type.includes('pine') || type === 'palm';
        const rad = big ? 17 + r() * 7 : type === 'flowers' || type === 'fern' ? 12 : 10 + r() * 5;
        const x = 30 + r() * (W - 60), y = 30 + r() * (H - 60);
        if (!clear(x, y, rad, 34))
            continue;
        if (out.some(o => Math.hypot(o.x - x, o.y - y) < o.r + rad + 34))
            continue;
        out.push({ type, x, y, r: rad, rot: (r() - .5) * .5 });
    }
    // frame: foliage hugging every edge, partly off-screen
    const fr = rng(map.seed * 13 + 5);
    for (let i = 0; i < 70; i++) {
        const side = i % 4, t = fr();
        const x = side === 0 ? t * W : side === 1 ? W + 4 - fr() * 14 : side === 2 ? t * W : -4 + fr() * 14;
        const y = side === 0 ? -4 + fr() * 14 : side === 1 ? t * H : side === 2 ? H + 4 - fr() * 14 : t * H;
        const type = theme.frame[Math.floor(fr() * theme.frame.length)], rad = 16 + fr() * 10;
        if (!clear(x, y, rad, 30))
            continue;
        out.push({ type, x, y, r: rad, rot: (fr() - .5) * .6, frame: true });
    }
    out.forEach((o, i) => { o.id = i; o.tall = !!TALL[o.type] && !o.frame; o.solid = !WALKABLE[o.type]; });
    return out.sort((a, b) => a.y - b.y);
}
/* ---------- Tile grid ---------- */
const G_FREE = 0, G_ROAD = 1, G_WATER = 2, G_LAVA = 3, G_ICE = 4, G_SCENERY = 5;
function buildGrid(g) {
    const grid = new Uint8Array(COLS * ROWS);
    for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
            const x = c * TILE + TILE / 2, y = r * TILE + TILE / 2;
            let v = G_FREE;
            if (distToPaths(g.paths, x, y) < ROAD_HALF + 2)
                v = G_ROAD;
            else {
                for (const b of g.map.blocks || []) {
                    if (b.k === 'water' && inBlock(b, x, y, 0)) {
                        v = G_WATER;
                        break;
                    }
                    if (b.k !== 'water' && inBlock(b, x, y, 6)) {
                        v = b.k === 'lava' ? G_LAVA : G_ICE;
                        break;
                    }
                }
                if (v === G_FREE)
                    for (const o of g.deco)
                        if (o.solid && Math.hypot(o.x - x, o.y - y) < o.r * 0.7 + 8) {
                            v = G_SCENERY;
                            break;
                        }
            }
            grid[r * COLS + c] = v;
        }
    g.grid = grid;
    g.blockers = g.deco.filter(o => o.tall).map(o => ({ x: o.x, y: o.y, r: o.r * 0.72, id: o.id }));
}
function tileAt(x, y) { const c = Math.floor(x / TILE), r = Math.floor(y / TILE); return c < 0 || r < 0 || c >= COLS || r >= ROWS ? -1 : game.grid[r * COLS + c]; }
/** Footprint for a tower of `type` centred near (x, y), snapped to the grid. */
function footFor(type, x, y) {
    const n = TD[type].size || 2, c0 = Math.round((x - n * TILE / 2) / TILE), r0 = Math.round((y - n * TILE / 2) / TILE);
    return { c0, r0, n, x: c0 * TILE + n * TILE / 2, y: r0 * TILE + n * TILE / 2 };
}
function halfSize(type) { return (TD[type].size || 2) * TILE / 2; }
/* ---------- Line of sight ---------- */
const SIGHT_PROJ = { dart: 1, bolt: 1, tack: 1, blade: 1, ball: 1, cannonball: 1, torpedo: 1 };
function sightBlocked(s) { return s.mode === 'hitscan' || s.mode === 'chain' || (!s.mode && !!SIGHT_PROJ[s.proj]); }
function segHitsCircle(x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
    const t = L2 ? clamp(((cx - x1) * dx + (cy - y1) * dy) / L2, 0, 1) : 0;
    const px = x1 + dx * t - cx, py = y1 + dy * t - cy;
    return px * px + py * py < r * r;
}
/** Blockers near a tower, cached; refreshed whenever towers or scenery change. */
function refreshBlockers(t) {
    const g = game;
    t.blk = [];
    if (!g.blockers || !g.blockers.length || !sightBlocked(t.s))
        return;
    const R = Math.min(2000, t.s.range || 0) + 160;
    for (const b of g.blockers)
        if (Math.hypot(b.x - t.x, b.y - t.y) < R + b.r)
            t.blk.push(b);
}
function inSight(t, x, y) {
    const blk = t.blk;
    if (!blk || !blk.length)
        return true;
    for (const b of blk)
        if (segHitsCircle(t.x, t.y, x, y, b.x, b.y, b.r))
            return false;
    return true;
}
function clearCost(o) { return clamp(Math.round((300 + (o.r - 10) / 30 * 1200) / 50) * 50, 300, 1500); }
function clearScenery(id) {
    const g = game, o = g.deco.find(d => d.id === id);
    if (!o || !o.tall)
        return false;
    const c = clearCost(o);
    if (g.cash < c) {
        toast('Not enough cash', 'bad');
        return false;
    }
    g.cash -= c;
    g.deco = g.deco.filter(d => d !== o);
    g.cleared.push(id);
    buildGrid(g);
    recalcAll();
    addFx({ k: 'dust', x: o.x, y: o.y, life: .5 });
    addFx({ k: 'txt', x: o.x, y: o.y - 20, txt: 'Cleared', col: '#ffffff', life: 1 });
    Sound.play('place');
    if (!g.inRound)
        snapshot();
    return true;
}
/* ---------- Game state ---------- */
let game = null, nextId = 1;
function price(c, type) {
    const g = game, n = type && g && g.perks && g.perks[type] ? g.perks[type].cost || 0 : 0;
    return Math.round(c * g.diff.costMul * (1 - 0.02 * n) / 5) * 5;
}
function hpMultFor(r) { return r <= 80 ? 1 : r <= LAST_ROUND ? 1 + (r - 80) * 0.02 : 1.4 + (r - LAST_ROUND) * 0.06; }
function createGame(cfg, snap) {
    // World Boss: its own maps, 3,000 lives and $10,000 start money; it is never saved half-way
    const wbBoss = cfg.mode === 'worldboss' ? WB_BOSSES.find(b => b.id === cfg.wbBoss) || WB_BOSSES[0] : null;
    if (wbBoss) {
        cfg = Object.assign({}, cfg, { diffKey: 'medium', mapIdx: -1, daily: false });
        snap = null;
    }
    const map = wbBoss ? WB_MAPS.find(m => m.id === cfg.wbMap) || WB_MAPS[0] : MAPS[cfg.mapIdx], diff = DIFF[cfg.diffKey], mode = cfg.mode || 'standard';
    const paths = mapPaths(map, mode === 'reverse');
    let cash = wbBoss ? wbBoss.cash : diff.cash + (TIER_CASH[map.tier] || 0) + (map.cash || 0);
    if (mode === 'halfcash')
        cash = Math.round(cash / 2);
    const perks = {};
    for (const t of SHOP)
        perks[t] = perksFor(t);
    game = { ...cfg, mode, map, paths, diff, lives: wbBoss ? WB_LIVES : diff.lives, cash, round: 0, inRound: false,
        spawnQ: [], spawned: 0, roundTotal: 0, roundTime: 0, balloons: [], towers: [], projs: [], fx: [], won: false, over: false,
        pops: 0, roundPops: 0, hpMult: 1, popMult: 1, time: 0, clock: 0, autoT: -1, startedAt: Date.now(), leaked: 0, deco: makeDeco(map, paths), saveT: 0,
        allowed: MODES[mode].towers || SHOP, perks, ua: !!DEV.unlockAll, cleared: [], submitted: false, shake: 0,
        abCd: {}, abMax: {},
        wb: wbBoss ? { boss: wbBoss, k: cfg.wbWeek === undefined ? -1 : cfg.wbWeek, t: 0, summonT: 0, payT: 0, damage: 0, killed: false, ref: null, done: false } : null };
    if (snap) {
        game.cleared = (snap.cleared || []).slice();
        game.deco = game.deco.filter(o => !game.cleared.includes(o.id));
    }
    buildGrid(game);
    if (snap) {
        Object.assign(game, { round: snap.round, lives: snap.lives, cash: snap.cash, won: !!snap.won, pops: snap.pops || 0, time: snap.time || 0,
            clock: snap.clock || 0, leaked: snap.leaked || 0, ua: !!snap.ua || !!DEV.unlockAll, submitted: !!snap.submitted });
        for (const s of snap.towers) {
            const t = newTower(s.type, s.x, s.y);
            const lv = s.lv.slice();
            while (lv.length < 3)
                lv.push(0); // v3 saves had 2 paths
            Object.assign(t, { lv, spent: s.spent, fresh: s.fresh || 0, pops: s.pops || 0, xpPops: s.xpPops || 0, target: s.target || 'first', ang: s.ang || -Math.PI / 2, cd: s.cd || 0 });
            t.aim = t.ang;
            game.towers.push(t);
            if (s.abCd > (game.abCd[s.type] || 0))
                game.abCd[s.type] = s.abCd; // older saves kept one cooldown per tower
        }
        if (snap.abCd)
            Object.assign(game.abCd, snap.abCd);
        Object.assign(game.abMax, snap.abMax || {});
        recalcAll();
        if (snap.inRound) {
            game.hpMult = hpMultFor(game.round);
            Object.assign(game, { inRound: true, roundTime: snap.roundTime, spawned: snap.spawned, roundTotal: snap.roundTotal, roundPops: snap.roundPops || 0, spawnQ: snap.spawnQ || [] });
            for (const s of snap.balloons || []) {
                const b = makeBalloon(s.type, s.dist, { camo: s.camo, lineage: s.lineage, pi: s.pi, regrow: s.regrow, fort: s.fort });
                Object.assign(b, { hp: s.hp, maxHp: s.maxHp, frozen: s.frozen || 0, slow: s.slow || 0, regTop: s.regTop ?? b.regTop, bossStage: s.bossStage || 0, spdMul: s.spdMul || 1 });
                game.balloons.push(b);
                nextId = Math.max(nextId, s.lineage + 1);
            }
        }
    }
    else {
        PROFILE.games++;
        saveProfile();
    }
    return game;
}
function snapshot() {
    const g = game;
    if (!g || g.over || g.wb)
        return; // a World Boss run isn't saved half-way: its damage is recorded as it goes (wbRecord)
    store.set('run', { v: 4, mapId: g.map.id, diffKey: g.diffKey, mode: g.mode, daily: g.daily, round: g.round, lives: g.lives, cash: Math.floor(g.cash), won: g.won, pops: g.pops, time: g.time,
        clock: g.clock, leaked: g.leaked, ua: g.ua, cleared: g.cleared, submitted: g.submitted,
        towers: g.towers.map(t => ({ type: t.type, x: t.x, y: t.y, lv: t.lv, spent: t.spent, fresh: t.fresh, pops: t.pops, xpPops: t.xpPops, target: t.target, ang: t.ang, cd: t.cd })),
        abCd: g.abCd, abMax: g.abMax,
        inRound: g.inRound, roundTime: g.roundTime, spawned: g.spawned, roundTotal: g.roundTotal, roundPops: g.roundPops,
        spawnQ: g.inRound ? g.spawnQ : [],
        balloons: g.inRound ? g.balloons.filter(b => !b.dead).map(b => ({ type: b.type, hp: b.hp, maxHp: b.maxHp, dist: b.dist, camo: b.camo, lineage: b.lineage, pi: b.pi,
            frozen: b.frozen, slow: b.slow, regrow: b.regrow, regTop: b.regTop, fort: b.fort, bossStage: b.bossStage, spdMul: b.spdMul })) : [],
        savedAt: Date.now() });
}
function savedRun() { const r = store.get('run', null); return r && (r.v === 3 || r.v === 4) && MAPS.some(m => m.id === r.mapId) && DIFF[r.diffKey] ? r : null; }
function clearRun() { store.set('run', null); }
function saveRecord() {
    if (game.mode !== 'standard' || game.daily)
        return;
    const recs = records(), m = recs[game.map.id] || (recs[game.map.id] = {});
    const cur = m[game.diffKey] || { best: 0, won: false };
    cur.best = Math.max(cur.best, game.round);
    cur.won = cur.won || game.won;
    m[game.diffKey] = cur;
    store.set('records', recs);
}
function saveChallengeWin() {
    const recs = records(), m = recs[game.map.id] || (recs[game.map.id] = {});
    m.modes = m.modes || {};
    m.modes[game.mode] = true;
    store.set('records', recs);
}
function badgeCount(filter) {
    const recs = records();
    let n = 0;
    for (const m of MAPS)
        if (!filter || m.tier === filter)
            for (const k of Object.keys(DIFF))
                if (recs[m.id] && recs[m.id][k] && recs[m.id][k].won)
                    n++;
    return n;
}
/* ---------- Run ranking (leaderboards) ----------
   A stage is one map on one difficulty. Cleared runs beat uncleared; then fewer lives lost; then a faster
   game clock (simulated seconds, so game speed and pausing don't matter); then the earlier run. */
function stageKey(mapId, diffKey, ua) { return mapId + ':' + diffKey + ':' + (ua ? 'ua' : 'std'); }
function compareRuns(a, b) {
    if (!!a.cleared !== !!b.cleared)
        return a.cleared ? -1 : 1;
    if (a.cleared) {
        if (a.livesLost !== b.livesLost)
            return a.livesLost - b.livesLost;
        if (Math.abs(a.clock - b.clock) > 1e-6)
            return a.clock - b.clock;
    }
    else {
        if (a.round !== b.round)
            return b.round - a.round;
        if (a.livesLeft !== b.livesLeft)
            return b.livesLeft - a.livesLeft;
    }
    return (a.at || 0) - (b.at || 0);
}
function runFrom(o) {
    return { map: o.mapId, diff: o.diffKey, ua: !!o.ua, cleared: !!o.won, round: o.round, livesLost: o.leaked || 0, livesLeft: Math.max(0, o.lives),
        clock: Math.round((o.clock || 0) * 100) / 100, at: Date.now() };
}
function runs() { return store.get('runs', {}); }
function bestRun(mapId, diffKey, ua) { return runs()[stageKey(mapId, diffKey, ua)] || null; }
/** Keep a player's best run per stage. Returns true when it is a new personal best. */
function saveRun(run) {
    const all = runs(), key = stageKey(run.map, run.diff, run.ua), cur = all[key];
    if (cur && compareRuns(cur, run) <= 0)
        return false;
    all[key] = run;
    store.set('runs', all);
    return true;
}
/** Submit the current game as a finished run (once). Only Standard-mode, non-daily games are ranked. */
function submitRun() {
    const g = game;
    if (!g || g.submitted || g.round < 1 || g.wb)
        return null;
    g.submitted = true;
    PROFILE.finished++;
    saveProfile();
    if (g.mode !== 'standard' || g.daily)
        return null;
    const run = runFrom({ mapId: g.map.id, diffKey: g.diffKey, ua: g.ua, won: g.won, round: g.round, leaked: g.leaked, lives: g.lives, clock: g.clock });
    return { run, best: saveRun(run) };
}
/** A saved game that is thrown away after round 1 still counts as a finished (uncleared) run. */
function abandonRun(snap) {
    if (!snap || snap.submitted || snap.round < 1)
        return;
    PROFILE.finished++;
    saveProfile();
    if (snap.mode === 'standard' && !snap.daily)
        saveRun(runFrom(snap));
}
function tierScore(tier, ua, all = runs()) {
    let score = 0, clock = 0, stages = 0;
    for (const m of MAPS)
        if (m.tier === tier)
            for (const [k, d] of Object.entries(DIFF)) {
                const r = all[stageKey(m.id, k, ua)];
                if (!r || !r.cleared)
                    continue;
                score += d.points * (r.livesLost === 0 ? 1.5 : 1);
                clock += r.clock;
                stages++;
            }
    return { score, clock, stages };
}
/* ---------- Balloons ---------- */
function makeBalloon(type, dist, o = {}) {
    const d = BT[type];
    const fort = !!o.fort && (d.hp > 1 || type === 'lead');
    let hp = 1;
    if (d.wb)
        hp = WB_HP;
    else if (d.boss)
        hp = Math.round(bossHp(game.round) * (game.mode === 'halfcash' ? 0.8 : 1));
    else if (d.hp > 1)
        hp = Math.round(d.hp * game.hpMult) * (fort ? 2 : 1);
    else if (fort)
        hp = 4;
    const ri = REGROW_CHAIN.indexOf(type), regrow = !!o.regrow && ri >= 0;
    const b = { id: nextId++, type, hp, maxHp: hp, dist, camo: !!o.camo && !d.blimp, lineage: o.lineage || 0, pi: o.pi || 0, frozen: 0, slow: 0,
        slowT: 0, bslow: 0, dead: false, x: 0, y: 0, a: 0, wob: Math.random() * 6, flash: 0,
        regrow, regTop: regrow ? (o.regTop ?? ri) : -1, regT: 0, fort, bossStage: 0, spdMul: 1, numT: 0, born: o.kid ? game.time : -9 };
    if (!b.lineage)
        b.lineage = b.id;
    const p = posAt(game.paths[b.pi], dist);
    b.x = p.x;
    b.y = p.y;
    b.a = p.a;
    return b;
}
function popCash() { return (game.round > 50 ? 0.5 : 1) * game.popMult * (game.mode === 'halfcash' ? 0.5 : 1); }
function toughness(b) { return BT[b.type].boss ? 1e9 + b.hp : Math.ceil(b.hp) + BT[b.type].kids.reduce((s, k) => s + RBE[k], 0); }
/** Apply damage. Returns -1 when immune, 1 when damage was applied, 0 otherwise. */
function damageBalloon(b, dmg, dtype, src, bm) {
    if (b.dead || dmg <= 0)
        return 0;
    const d = BT[b.type];
    if (d.imm && d.imm.includes(dtype)) {
        addFx({ k: 'clink', x: b.x, y: b.y, life: .18 });
        Sound.play('clink');
        return -1;
    }
    if (d.blimp && bm)
        dmg *= bm;
    b.regT = 0;
    if (d.wb) {
        // World Boss: its defense cuts the damage; every point dealt is score. Hits close together show as one number.
        dmg *= game.wb.boss.def;
        const dealt = Math.min(dmg, b.hp);
        game.wb.damage += dealt;
        b.numAcc = (b.numAcc || 0) + dealt;
        if (b.numT <= 0 && b.numAcc >= 1) {
            addFx({ k: 'num', big: true, x: b.x + (Math.random() - .5) * d.r, y: b.y - d.r * (0.2 + Math.random() * 0.4), txt: '-' + Math.round(b.numAcc).toLocaleString(), life: .9 });
            b.numAcc = 0;
            b.numT = .25;
        }
    }
    else if (b.maxHp >= 10 && dmg >= 2 && b.numT <= 0) {
        addFx({ k: 'num', x: b.x + (Math.random() - .5) * 16, y: b.y - BT[b.type].r, txt: '-' + Math.round(Math.min(dmg, b.hp)), life: .7 });
        b.numT = .12;
    }
    if (b.hp > dmg) {
        b.hp -= dmg;
        b.flash = 0.06;
        if (d.boss && !d.wb)
            bossCheck(b);
        return 1;
    }
    popBalloon(b, dmg - b.hp, dtype, src);
    return 1;
}
const MILESTONES = [100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000];
function addShake(n) {
    if (SETTINGS.shake && SETTINGS.effects !== 'low')
        game.shake = Math.max(game.shake, n);
}
function popBalloon(b, left, dtype, src) {
    const g = game, d = BT[b.type];
    b.dead = true;
    const cash = popCash();
    g.cash += cash;
    g.pops++;
    g.roundPops++;
    Sound.play('pop');
    if (src) {
        src.pops++;
        if (MILESTONES.includes(src.pops)) {
            addFx({ k: 'txt', x: src.x, y: src.y - 30, txt: src.pops.toLocaleString() + ' pops!', col: '#ffd93d', life: 1.6, big: true });
            Sound.play('milestone');
        }
    }
    addFx({ k: 'pop', x: b.x, y: b.y, life: .35, col: d.col, r: d.r, seed: b.id });
    if (d.blimp) {
        addFx({ k: 'boom', x: b.x, y: b.y, r: d.r * 1.5, life: .55 });
        addFx({ k: 'scorch', x: b.x, y: b.y, r: d.r, life: 3 });
        addFx({ k: 'txt', x: b.x, y: b.y - d.r, txt: '+$' + Math.max(1, Math.round(RBE[b.type] * cash / 10)), col: '#ffd93d', life: 1.1 });
        addShake(d.boss ? 9 : 4);
        Sound.play('boom');
    }
    let kids = d.kids;
    if (d.wb) {
        PROFILE.bosses++;
        g.wb.killed = true;
        toast(d.name + ' defeated!', 'good');
        Sound.play('chime');
        wbEnd(true);
        return;
    }
    if (d.boss) {
        kids = Array(4).fill(bossMinion(g.round));
        PROFILE.bosses++;
        toast('Colossus defeated!', 'good');
        Sound.play('chime');
    }
    kids.forEach((k, i) => {
        const c = makeBalloon(k, Math.max(0, b.dist - i * (d.blimp ? 14 : 8)), { camo: b.camo, lineage: b.lineage, pi: b.pi, regrow: b.regrow, regTop: b.regTop, kid: true });
        c.slow = b.slow;
        g.balloons.push(c);
        if (left > 0)
            damageBalloon(c, left, dtype, src, 0);
    });
}
function bossCheck(b) {
    while (b.bossStage < 3 && b.hp / b.maxHp <= 0.75 - 0.25 * b.bossStage) {
        b.bossStage++;
        b.spdMul *= 1.15;
        const m = bossMinion(game.round);
        for (let i = 0; i < 3; i++) {
            const c = makeBalloon(m, Math.max(0, b.dist - 20 - i * 10), { lineage: b.lineage, pi: b.pi, kid: true });
            game.balloons.push(c);
        }
        addFx({ k: 'ring', x: b.x, y: b.y, r: 90, col: '#ce93d8', life: .5, fill: true });
        toast('The Colossus splits off more balloons!', 'warn');
        Sound.play('boss');
    }
}
function leakValue(b) { return BT[b.type].boss ? Math.ceil(b.hp) : Math.ceil(b.hp) + BT[b.type].kids.reduce((s, k) => s + RBE[k], 0); }
/* ---------- World Boss run ----------
   PLAY brings the boss in. It walks the looping road forever and summons balloons on a timer that speeds up
   (wbSummonGap); the balloons get 1% stronger every minute (wbStrength) and take lives when they get through.
   Every 30 s is a payday (round bonus, Gold Mine income, tower XP). The run ends when lives reach 0 or the boss dies. */
const WB_PAY_GAP = 30, WB_PAY_BONUS = 100, WB_KILL_BONUS = 10;
function wbStart() {
    // the boss starts just past the hole (its back edge clear of it) and walks on from there
    const g = game, b = makeBalloon(g.wb.boss.id, BT[g.wb.boss.id].r + 36, { pi: 0 });
    g.balloons.push(b);
    g.wb.ref = b;
    onBoss(b);
    toast(g.wb.boss.name + ' is here! Deal as much damage as you can.', 'warn');
    Sound.play('boss');
}
function wbTick(dt) {
    const g = game, w = g.wb, boss = w.ref;
    if (w.k >= 0 && wbNow() >= wbEndsAt(w.k)) { // 5:00 PM: the event is over, and so is this run
        toast('5:00 PM: the World Boss event is over. Your damage counts!', 'warn');
        wbEnd(false);
        return;
    }
    w.t += dt;
    g.hpMult = wbStrength(w.t);
    w.summonT += dt;
    const gap = wbSummonGap(w.t, w.boss.every);
    if (w.summonT >= gap) {
        w.summonT = 0;
        if (boss && !boss.dead)
            wbSummon(boss);
    }
    w.payT += dt;
    if (w.payT >= WB_PAY_GAP) {
        w.payT -= WB_PAY_GAP;
        wbPayday();
    }
}
/** The boss drops balloons right behind itself, on its own road. Fortified from minute 8, some camo from minute 12. */
function wbSummon(b) {
    const g = game, w = g.wb, type = wbMob(w.t);
    for (let i = 0; i < w.boss.count; i++) {
        const c = makeBalloon(type, Math.max(0, b.dist - BT[b.type].r * 0.4 - i * 16), { pi: b.pi, kid: true, fort: w.t >= 480, camo: w.t >= 720 && i % 3 === 2 });
        g.balloons.push(c);
    }
    addFx({ k: 'ring', x: b.x, y: b.y, r: BT[b.type].r * 1.1, col: '#ce93d8', life: .5, fill: true });
}
/** Every 30 s: a small bonus, Gold Mine income and lives, player XP and tower XP (like the end of a round). */
function wbPayday() {
    const g = game;
    let income = WB_PAY_BONUS, lives = 0;
    g.cash += WB_PAY_BONUS;
    for (const t of g.towers) {
        if (t.s.income > 0) {
            let inc = t.s.income;
            if (t.s.vault)
                inc += Math.min(t.s.vaultCap || 1000, Math.floor(g.cash * t.s.vault));
            income += inc;
            g.cash += inc;
            addFx({ k: 'txt', x: t.x, y: t.y - 26, txt: '+$' + inc, col: '#ffd93d', life: 1.5 });
        }
        if (t.s.lives > 0)
            lives += t.s.lives;
    }
    g.lives += lives;
    toast('Payday · +$' + income + (lives ? ' · +' + lives + ' lives' : ''), 'good');
    wbFlushXP();
}
/** Pops become player XP and stats; tower time on the field becomes tower XP. */
function wbFlushXP() {
    const g = game;
    PROFILE.pops += g.roundPops;
    addXP(XP.perRound + g.roundPops / XP.perPops);
    g.roundPops = 0;
    if (g.ua)
        return;
    const add = {};
    for (const t of g.towers) {
        const n = Math.floor((t.pops - t.xpPops) / TXP.perPops);
        t.xpPops += n * TXP.perPops;
        add[t.type] = (add[t.type] || 0) + TXP.perRound + n;
    }
    g.txpGame = g.txpGame || {};
    for (const k of Object.keys(add)) {
        addTowerXP(k, add[k]);
        g.txpGame[k] = (g.txpGame[k] || 0) + add[k];
    }
    saveTprog();
}
/** Score: all damage dealt; killing the boss adds 10 per life left. */
function wbScore(g = game) { return Math.round(g.wb.damage) + (g.wb.killed ? WB_KILL_BONUS * Math.max(0, g.lives) : 0); }
/** Keeps the best score for the week the run started in. Called every few seconds and at the end. True = new best. */
function wbRecord(g = game) {
    if (!g || !g.wb || g.wb.k < 0 || g.ua)
        return false;
    const now = wbNow(); // only while the event is open (a few seconds' grace for the run that ends at 5:00 PM)
    if (now < wbStartsAt(g.wb.k) || now > wbEndsAt(g.wb.k) + WB_ANNOUNCE_MS)
        return false;
    const s = wbScore(g), hist = store.get('wbHist', {}), k = String(g.wb.k), cur = hist[k];
    if (s <= 0 || (cur && cur.d >= s))
        return false;
    hist[k] = { d: s, at: now, boss: g.wb.boss.id, map: g.map.id };
    const out = {};
    for (const key of Object.keys(hist).sort((a, b) => +a - +b).slice(-8))
        out[key] = hist[key]; // two months is plenty
    store.set('wbHist', out);
    return true;
}
/** Ends the run (boss killed, lives gone, or the player left). Returns { score, best, killed } once; null after. */
function wbEnd(killed) {
    const g = game;
    if (!g || !g.wb || g.wb.done)
        return null;
    g.wb.done = true;
    g.over = true;
    g.inRound = false;
    if (killed)
        g.won = true;
    if (g.round >= 1)
        wbFlushXP();
    const best = wbRecord(g);
    saveProfile();
    const res = { score: wbScore(g), best, killed: !!killed };
    g.wb.result = res;
    if (typeof onWorldBossEnd === 'function')
        onWorldBossEnd(res);
    return res;
}
/* ---------- Rounds ---------- */
function buildSpawns(r) {
    const q = [];
    let t = 0;
    for (const gr of roundGroups(r)) {
        for (let i = 0; i < gr.count; i++)
            q.push({ at: t + i * gr.gap, type: gr.type, camo: gr.camo, regrow: gr.regrow, fort: gr.fort });
        t += gr.count * gr.gap * 0.55 + 0.4;
    }
    return q.sort((a, b) => a.at - b.at);
}
function startRound() {
    const g = game;
    if (!g || g.inRound || g.over)
        return false;
    if (g.wb) { // the World Boss fight is one long round
        g.round = 1;
        g.inRound = true;
        g.autoT = -1;
        g.saveT = 0;
        for (const t of g.towers)
            t.fresh = 0;
        wbStart();
        return true;
    }
    g.round++;
    g.hpMult = hpMultFor(g.round);
    g.spawnQ = buildSpawns(g.round);
    g.roundTotal = g.spawnQ.length;
    g.spawned = 0;
    g.roundPops = 0;
    g.roundTime = 0;
    g.inRound = true;
    g.autoT = -1;
    g.saveT = 0;
    if (DEV.unlockAll)
        g.ua = true;
    for (const t of g.towers)
        t.fresh = 0; // free undo ends when the round starts
    const groups = roundGroups(g.round), prev = g.round > 1 ? roundGroups(g.round - 1) : [];
    if (groups.some(x => x.type === 'boss')) {
        toast('Boss round! The Colossus is coming.', 'warn');
        Sound.play('boss');
    }
    else if (groups.some(x => x.camo) && !prev.some(x => x.camo) && g.round <= 50)
        toast('Camo balloons! Only towers with camo detection can see them.', 'warn');
    else if (groups.some(x => x.regrow) && !prev.some(x => x.regrow) && g.round <= 30)
        toast('Regrow balloons heal if you don\'t finish them off!', 'warn');
    else if (groups.some(x => x.fort) && g.round <= 38 && !prev.some(x => x.fort))
        toast('Fortified balloons take twice the hits!', 'warn');
    else if (groups.some(x => x.type === 'blimp') && g.round === 40)
        toast('A Blimp is coming! Bring heavy damage.', 'warn');
    else
        toast('Round ' + g.round);
    return true;
}
function endRound() {
    const g = game;
    g.inRound = false;
    const bonus = Math.round(roundBonus(g.round) * (g.mode === 'halfcash' ? 0.5 : 1));
    let income = 0, lives = 0;
    g.cash += bonus;
    for (const t of g.towers) {
        if (t.s.income > 0) {
            let inc = t.s.income;
            if (t.s.vault)
                inc += Math.min(t.s.vaultCap || 1000, Math.floor(g.cash * t.s.vault));
            income += inc;
            g.cash += inc;
            addFx({ k: 'txt', x: t.x, y: t.y - 26, txt: '+$' + inc, col: '#ffd93d', life: 1.5 });
        }
        if (t.s.lives > 0) {
            lives += t.s.lives;
            addFx({ k: 'txt', x: t.x, y: t.y - 10, txt: '+' + t.s.lives + ' ♥', col: '#ff8a80', life: 1.5 });
        }
    }
    g.lives += lives;
    toast(`Round ${g.round} complete · +$${bonus}` + (income ? ` · income +$${income}` : '') + (lives ? ` · +${lives} lives` : ''), 'good');
    Sound.play('chime');
    PROFILE.pops += g.roundPops;
    PROFILE.rounds++;
    addXP(XP.perRound + g.roundPops / XP.perPops);
    // tower XP: per tower on the field, plus 1 per 20 layers it popped. None with Unlock All, and none in freeplay
    // (rounds after the last one), so long freeplay games can't be used to farm tower levels.
    if (!g.ua && g.round <= g.diff.end) {
        const add = {};
        for (const t of g.towers) {
            const n = Math.floor((t.pops - t.xpPops) / TXP.perPops);
            t.xpPops += n * TXP.perPops;
            add[t.type] = (add[t.type] || 0) + TXP.perRound + n;
        }
        g.txpGame = g.txpGame || {};
        for (const k of Object.keys(add)) {
            addTowerXP(k, add[k]);
            g.txpGame[k] = (g.txpGame[k] || 0) + add[k];
        }
        saveTprog();
    }
    if (g.round >= g.diff.end && !g.won) {
        g.won = true;
        PROFILE.wins++;
        if (g.leaked === 0 && g.mode === 'standard')
            PROFILE.perfect++;
        saveRecord();
        let xp = XP.win;
        if (g.mode !== 'standard') {
            saveChallengeWin();
            xp += XP.challengeWin;
        }
        if (g.daily) {
            const d = store.get('daily', {});
            d[g.daily] = true;
            store.set('daily', d);
            PROFILE.bestStreak = Math.max(PROFILE.bestStreak || 0, dailyStreak());
            xp += XP.daily;
        }
        addXP(xp);
        g.result = submitRun();
        saveDailyRun(g);
        snapshot();
        onVictory();
    }
    else {
        saveRecord();
        snapshot();
        if (SETTINGS.autoStart)
            g.autoT = 1.0;
    }
}
/* ---------- Towers ---------- */
function newTower(type, x, y) {
    return { id: nextId++, type, x, y, lv: [0, 0, 0], spent: 0, fresh: 0, cd: 0, ang: -Math.PI / 2, aim: -Math.PI / 2, pops: 0, xpPops: 0, target: 'first', s: null,
        boostT: 0, boostMul: 1, boostChains: 0, kick: 0, buffed: false, blk: [] };
}
function statsFor(type, lv, perks) {
    if (perks === undefined)
        perks = game && game.perks ? game.perks[type] : null;
    const d = TD[type], s = JSON.parse(JSON.stringify(d.base));
    for (let p = 0; p < 3; p++)
        for (let i = 0; i < (lv[p] || 0); i++)
            d.paths[p][i].a(s);
    s.cdMul = 1;
    if (perks) {
        if (perks.range) {
            if (s.range && s.range < 2000)
                s.range = Math.round(s.range * (1 + 0.02 * perks.range));
            if (s.aura)
                s.aura = Math.round(s.aura * (1 + 0.02 * perks.range));
        }
        if (perks.rate && s.rate)
            s.rate = s.rate / (1 + 0.02 * perks.rate);
        if (perks.pierce && s.pierce !== undefined)
            s.pierce += perks.pierce;
        if (perks.cd)
            s.cdMul = 1 / (1 + 0.05 * perks.cd);
        if (perks.income && s.income > 0)
            s.income = Math.round(s.income * (1 + 0.03 * perks.income));
        if (perks.vault && s.vaultCap)
            s.vaultCap = Math.round(s.vaultCap * (1 + 0.10 * perks.vault));
        if (perks.dmg && s.dmg)
            s.dmg = s.dmg * (1 + 0.05 * perks.dmg); // Sniper Post skills (5.1)
        if (perks.blimp && s.dmg)
            s.bm = (s.bm || 1) * (1 + 0.10 * perks.blimp);
    }
    return s;
}
/** Recompute every tower's stats, including Signal Tower aura buffs (the strongest buff of each kind applies). */
function recalcAll() {
    const g = game;
    for (const t of g.towers)
        t.base = statsFor(t.type, t.lv);
    const sigs = g.towers.filter(t => t.type === 'signal');
    for (const t of g.towers) {
        const s = { ...t.base };
        t.buffed = false;
        if (!TD[t.type].support) {
            let bR = 0, bRate = 0, bD = 0, bP = 0, bC = false, bCd = 0;
            for (const sg of sigs) {
                if (Math.hypot(sg.x - t.x, sg.y - t.y) > sg.base.aura)
                    continue;
                t.buffed = true;
                bR = Math.max(bR, sg.base.buffRange);
                bRate = Math.max(bRate, sg.base.buffRate);
                bD = Math.max(bD, sg.base.buffDmg);
                bP = Math.max(bP, sg.base.buffPierce);
                bC = bC || sg.base.buffCamo;
                bCd = Math.max(bCd, sg.base.buffCd || 0);
            }
            if (bR && s.range < 2000)
                s.range = Math.round(s.range * (1 + bR));
            if (bRate)
                s.rate = s.rate / (1 + bRate);
            if (bD && s.dmg > 0)
                s.dmg += bD;
            if (bP && s.pierce)
                s.pierce += bP;
            if (bC)
                s.camo = true;
            if (bCd)
                s.cdMul *= (1 - bCd);
        }
        t.s = s;
        refreshBlockers(t);
    }
    let pb = 0;
    for (const o of g.towers)
        if (o.type === 'mine')
            pb += o.s.popBonus || 0;
    g.popMult = 1 + Math.min(0.3, pb);
}
const TILE_WHY = { [G_ROAD]: 'Can\'t build on the road', [G_WATER]: 'Only Gunboats can go on water', [G_LAVA]: 'Can\'t build on lava', [G_ICE]: 'Can\'t build on ice', [G_SCENERY]: 'Blocked by scenery' };
function spotProblem(type, x, y) {
    const g = game, f = footFor(type, x, y);
    if (f.c0 < 0 || f.r0 < 0 || f.c0 + f.n > COLS || f.r0 + f.n > ROWS)
        return 'Too close to the edge';
    const water = !!TD[type].water;
    for (let r = f.r0; r < f.r0 + f.n; r++)
        for (let c = f.c0; c < f.c0 + f.n; c++) {
            const v = g.grid[r * COLS + c];
            if (water) {
                if (v !== G_WATER)
                    return 'Gunboats must be built on water';
            }
            else if (v !== G_FREE)
                return TILE_WHY[v];
        }
    const h = f.n * TILE / 2;
    for (const t of g.towers) {
        const th = halfSize(t.type);
        if (Math.abs(t.x - f.x) < th + h - 0.5 && Math.abs(t.y - f.y) < th + h - 0.5)
            return 'Too close to another tower';
    }
    if (g.cash < price(TD[type].cost, type))
        return 'Not enough cash';
    return '';
}
function shopProblem(type) {
    if (!game.allowed.includes(type))
        return 'Not allowed in ' + MODES[game.mode].name + ' mode';
    if (!isUnlocked(type))
        return 'Reach level ' + TD[type].unlock + ' to unlock';
    if (TD[type].water && !hasWater(game.map))
        return 'This map has no water';
    return '';
}
function placeTower(type, x, y) {
    const g = game, cost = price(TD[type].cost, type), why = shopProblem(type) || spotProblem(type, x, y);
    if (why) {
        toast(why, 'bad');
        return null;
    }
    const f = footFor(type, x, y);
    g.cash -= cost;
    const t = newTower(type, f.x, f.y);
    t.spent = cost;
    t.fresh = g.inRound ? 0 : cost;
    g.towers.push(t);
    recalcAll();
    PROFILE.built[type] = (PROFILE.built[type] || 0) + 1;
    addFx({ k: 'ring', x: f.x, y: f.y, r: 34, col: '#ffffff', life: .35 });
    addFx({ k: 'dust', x: f.x, y: f.y, life: .4 });
    Sound.play('place');
    if (!g.inRound)
        snapshot();
    return t;
}
/** 'ok' | 'max' | 'closed' (path rule) | 'mode' | 'unique' (one tier 5 per path per game) | 'xp' (tier not unlocked) */
function canUp(t, p) {
    const lv = t.lv, nl = lv[p] + 1, others = [0, 1, 2].filter(i => i !== p).map(i => lv[i]);
    if (nl > PATH_MAX)
        return 'max';
    if (lv[p] === 0 && others.every(v => v > 0))
        return 'closed';
    if (nl > SECOND_MAX && others.some(v => v > SECOND_MAX))
        return 'closed';
    if (nl >= 3 && game.mode === 'notier3')
        return 'mode';
    if (nl === PATH_MAX && game.towers.some(o => o !== t && o.type === t.type && o.lv[p] === PATH_MAX))
        return 'unique';
    if (!tierUnlocked(t.type, p, nl))
        return 'xp';
    return 'ok';
}
function upgradeCost(t, p) { return price(TD[t.type].paths[p][t.lv[p]].c, t.type); }
function upgrade(t, p) {
    if (!t || canUp(t, p) !== 'ok')
        return false;
    const c = upgradeCost(t, p);
    if (game.cash < c) {
        toast('Not enough cash', 'bad');
        return false;
    }
    game.cash -= c;
    t.spent += c;
    if (!game.inRound)
        t.fresh += c;
    t.lv[p]++;
    recalcAll();
    addFx({ k: 'ring', x: t.x, y: t.y, r: 40, col: PATH_COL[p], life: .45 });
    addFx({ k: 'sparkle', x: t.x, y: t.y, col: PATH_COL[p], life: .6 });
    Sound.play('upgrade');
    if (t.lv[p] === ABILITY_TIER && Math.max(...t.lv) === ABILITY_TIER)
        toast(hasAbility(t) ? TD[t.type].ability.name + ' ability unlocked! Press Q or use the ability tray.'
            : 'Another ' + TD[t.type].name + ' already has ' + TD[t.type].ability.name + ': only one per tower type.', hasAbility(t) ? 'good' : undefined);
    else if (t.lv[p] === ABILITY_TIER + 1 && hasAbility(t))
        toast(TD[t.type].ability.name + ' is now stronger!', 'good');
    if (!game.inRound)
        snapshot();
    return true;
}
/** Full refund for money spent since the last round started; 70% for the rest. */
function sellValue(t) { return t.fresh + Math.floor((t.spent - t.fresh) * 0.7); }
function sellTower(t) {
    if (!t)
        return;
    const v = sellValue(t);
    game.cash += v;
    game.towers = game.towers.filter(o => o !== t);
    recalcAll();
    addFx({ k: 'txt', x: t.x, y: t.y - 20, txt: '+$' + v, col: '#ffd93d', life: 1 });
    addFx({ k: 'dust', x: t.x, y: t.y, life: .4 });
    Sound.play('place');
    if (!game.inRound)
        snapshot();
}
function usesTarget(s) { return !(s.mode === 'pulse' || s.mode === 'mine' || s.mode === 'ring' || s.mode === 'aura' || s.proj === 'tack' || s.proj === 'blade'); }
function canSee(t, b) { return !b.dead && (!b.camo || t.s.camo); }
function inRange(t, b, r) { const dx = b.x - t.x, dy = b.y - t.y, R = r + BT[b.type].r * 0.5; return dx * dx + dy * dy <= R * R; }
function progressOf(b) { return b.dist / game.paths[b.pi].len; }
function rankTargets(t, list) {
    const m = t.target, x = t.x, y = t.y;
    const key = m === 'first' ? (b) => -progressOf(b) : m === 'last' ? (b) => progressOf(b)
        : m === 'strong' ? (b) => -(toughness(b) * 1000 + progressOf(b)) : (b) => (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y);
    return list.slice().sort((a, b) => key(a) - key(b));
}
function balloonSpeed(b) { return BASE_SPEED * BT[b.type].spd * (1 - b.slow) * b.spdMul; }
function predict(b, tt) {
    const sp = b.frozen > 0 ? 0 : balloonSpeed(b), path = game.paths[b.pi];
    return posAt(path, Math.min(path.len, b.dist + sp * tt));
}
function fire(t, s, ang, radial, n, aimDist) {
    const spd = s.speed, life = s.life || (s.range / spd) * 1.3, explode = s.proj === 'bomb' || s.proj === 'missile';
    for (let i = 0; i < n; i++) {
        const a = radial ? (i / n) * TAU : ang + (i - (n - 1) / 2) * (s.spread || 0);
        game.projs.push({ x: t.x + Math.cos(a) * 16, y: t.y + Math.sin(a) * 16, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, a,
            life, life0: life, pierce: s.pierce, dmg: s.dmg, dtype: s.dtype, hit: new Set(), camo: s.camo, src: t, kind: s.proj,
            rad: s.proj === 'ball' ? (s.big ? 22 : 14) : explode || s.proj === 'torpedo' ? 7 : s.proj === 'cannonball' ? 6 : 5,
            explode, blast: s.blast, bm: s.bm || 1, cluster: s.cluster || 0, spin: 0, stun: s.stun || 0, big: s.big || 0,
            arc: s.proj === 'bomb' ? Math.max(40, aimDist || s.range) : 0, trav: 0 });
    }
}
function abPower(t) { const m = Math.max(t.lv[0], t.lv[1], t.lv[2]); return m > ABILITY_TIER ? 2 : m === ABILITY_TIER ? 1 : 0; }
function abilityCd(t) { return TD[t.type].ability.cd * (abPower(t) === 2 ? 0.8 : 1) * (t.s.cdMul || 1); }
function updateTower(t, dt) {
    const s = t.s, g = game;
    if (t.boostT > 0) {
        t.boostT -= dt;
        if (t.boostT <= 0) {
            t.boostMul = 1;
            t.boostChains = 0;
        }
    }
    if (s.mode === 'mine' || s.mode === 'aura')
        return;
    t.cd -= dt;
    if (t.cd > 0)
        return;
    const cands = [], los = t.blk && t.blk.length > 0;
    for (const b of g.balloons)
        if (canSee(t, b) && inRange(t, b, s.range) && (!los || inSight(t, b.x, b.y)))
            cands.push(b);
    if (!cands.length)
        return;
    t.cd = s.rate / (t.boostT > 0 ? t.boostMul : 1);
    t.kick = 1;
    if (s.mode === 'pulse') {
        for (const b of cands) {
            const d = BT[b.type];
            if (d.blimp) {
                if (s.blimpSlow) {
                    b.slowT = 1.6;
                    b.bslow = Math.max(b.slowT > 0 ? b.bslow : 0, s.blimpSlow);
                }
                if (s.freezeBlimp && !d.boss)
                    b.frozen = Math.max(b.frozen, s.freezeBlimp);
            }
            else if (s.freezeAll || (b.type !== 'white' && b.type !== 'zebra')) {
                b.frozen = Math.max(b.frozen, s.freeze);
                if (s.permaslow)
                    b.slow = Math.max(b.slow, s.permaslow);
                if (s.dmg)
                    damageBalloon(b, s.dmg, s.freezeAll ? 'normal' : 'freeze', t);
            }
            if (s.shatter)
                damageBalloon(b, s.shatter, 'normal', t);
        }
        addFx({ k: 'frost', x: t.x, y: t.y, r: s.range, life: .55 });
        return;
    }
    if (s.mode === 'ring') {
        cands.slice(0, 40).forEach(b => damageBalloon(b, s.dmg, 'fire', t, s.bm));
        addFx({ k: 'flame', x: t.x, y: t.y, r: s.range, life: .3 });
        return;
    }
    const ranked = rankTargets(t, cands), tgt = ranked[0];
    if (s.mode === 'hitscan') {
        t.ang = Math.atan2(tgt.y - t.y, tgt.x - t.x);
        addFx({ k: 'tracer', x1: t.x + Math.cos(t.ang) * 26, y1: t.y + Math.sin(t.ang) * 26, x2: tgt.x, y2: tgt.y, life: .1 });
        addFx({ k: 'flash', x: t.x + Math.cos(t.ang) * 28, y: t.y + Math.sin(t.ang) * 28, life: .08 });
        Sound.play('shot');
        let cur = tgt;
        const hit = new Set([cur.id]);
        damageBalloon(cur, s.dmg, 'normal', t, s.bm);
        addFx({ k: 'spark', x: cur.x, y: cur.y, life: .2, col: '#fff59d' });
        for (let k = 0; k < (s.bounce || 0); k++) {
            let best = null, bd = 110 * 110;
            for (const b of g.balloons) {
                if (b.dead || hit.has(b.id) || !canSee(t, b))
                    continue;
                const dd = (b.x - cur.x) * (b.x - cur.x) + (b.y - cur.y) * (b.y - cur.y);
                if (dd < bd) {
                    bd = dd;
                    best = b;
                }
            }
            if (!best)
                break;
            addFx({ k: 'tracer', x1: cur.x, y1: cur.y, x2: best.x, y2: best.y, life: .1 });
            hit.add(best.id);
            damageBalloon(best, s.dmg, 'normal', t, s.bm);
            cur = best;
        }
        return;
    }
    if (s.mode === 'chain') {
        t.ang = Math.atan2(tgt.y - t.y, tgt.x - t.x);
        const chains = s.chains + (t.boostT > 0 ? t.boostChains : 0);
        for (let k = 0; k < Math.min(s.bolts, ranked.length); k++) {
            let cur = ranked[k];
            const hit = new Set(), pts = [[t.x, t.y]];
            for (let j = 0; j < chains && cur; j++) {
                pts.push([cur.x, cur.y]);
                hit.add(cur.id);
                const cx = cur.x, cy = cur.y;
                damageBalloon(cur, s.dmg, 'energy', t, s.bm);
                if (s.shockSlow && !cur.dead) {
                    cur.slowT = Math.max(cur.slowT, 1);
                    cur.bslow = Math.max(cur.bslow, s.shockSlow);
                }
                let best = null, bd = s.jump * s.jump;
                for (const b of g.balloons) {
                    if (b.dead || hit.has(b.id) || !canSee(t, b))
                        continue;
                    const dd = (b.x - cx) * (b.x - cx) + (b.y - cy) * (b.y - cy);
                    if (dd < bd) {
                        bd = dd;
                        best = b;
                    }
                }
                cur = best;
            }
            addFx({ k: 'bolt', pts, life: .2 });
        }
        Sound.play('zap');
        return;
    }
    const radial = s.proj === 'tack' || s.proj === 'blade';
    let ang = 0, dist = 0;
    if (!radial) {
        dist = Math.hypot(tgt.x - t.x, tgt.y - t.y);
        const p = predict(tgt, dist / s.speed);
        ang = Math.atan2(p.y - t.y, p.x - t.x);
        dist = Math.hypot(p.x - t.x, p.y - t.y);
        t.ang = ang;
    }
    fire(t, s, ang, radial, s.count || 1, dist);
    if (s.proj === 'bomb' || s.proj === 'missile' || s.proj === 'cannonball' || s.proj === 'torpedo') {
        addFx({ k: 'flash', x: t.x + Math.cos(ang) * 24, y: t.y + Math.sin(ang) * 24, life: .1, big: true });
        Sound.play('shot');
    }
}
/* ---------- Abilities (any tower with a tier-3 upgrade; stronger from tier 4) ---------- */
/** One ability per tower type: it belongs to the first tower of that type to reach tier 3 (in build order).
    Other towers of the type can still buy tier 3–5 upgrades, but don't get the ability. If the holder is sold,
    the next eligible tower of that type takes it over. */
function abilityHolder(type) { return game.towers.find(t => t.type === type && abPower(t) > 0) || null; }
function hasAbility(t) { return abPower(t) > 0 && abilityHolder(t.type) === t; }
/** Seconds until this tower type's ability can be used again (shared by all towers of the type). */
function abCdLeft(type) { return game.abCd[type] || 0; }
/** The tower of a type whose ability is strongest (used by the ability tray). */
function abilityTower(type) { return abilityHolder(type); }
function abilityProblem(t) {
    if (abPower(t) > 0 && !hasAbility(t))
        return 'Another ' + TD[t.type].name + ' already has ' + TD[t.type].ability.name;
    if (!hasAbility(t))
        return 'Needs a tier-' + ABILITY_TIER + ' upgrade';
    if (abCdLeft(t.type) > 0)
        return 'Recharging (' + Math.ceil(abCdLeft(t.type)) + 's, shared by all ' + TD[t.type].name + 's)';
    if (!game.inRound && t.type !== 'mine')
        return 'Use it during a round';
    return '';
}
function useAbility(t) {
    const why = abilityProblem(t);
    if (why) {
        toast(why, 'bad');
        return false;
    }
    const g = game, pw = abPower(t), tough = () => g.balloons.filter(b => !b.dead).sort((a, b) => toughness(b) - toughness(a));
    g.abCd[t.type] = g.abMax[t.type] = abilityCd(t);
    switch (t.type) {
        case 'dart':
            t.boostT = pw === 2 ? 7 : 5;
            t.boostMul = pw === 2 ? 4 : 3;
            break;
        case 'tesla':
            t.boostT = 6;
            t.boostMul = pw === 2 ? 4 : 3;
            t.boostChains = pw === 2 ? 10 : 5;
            break;
        case 'tack': {
            const R = pw === 2 ? 260 : 200, D = pw === 2 ? 12 : 4;
            for (const b of g.balloons.slice())
                if (!b.dead && Math.hypot(b.x - t.x, b.y - t.y) < R)
                    damageBalloon(b, D, 'normal', t);
            addFx({ k: 'ring', x: t.x, y: t.y, r: R, col: '#f48fb1', life: .6, fill: true });
            addShake(4);
            break;
        }
        case 'bomb': {
            const b = tough()[0];
            if (b) {
                addFx({ k: 'line', x1: t.x, y1: t.y, x2: b.x, y2: b.y, col: '#ff7043', w: 5, life: .25 });
                addFx({ k: 'boom', x: b.x, y: b.y, r: 70, life: .6 });
                addFx({ k: 'scorch', x: b.x, y: b.y, r: 40, life: 3 });
                damageBalloon(b, pw === 2 ? 4000 : 1200, 'normal', t, 1);
                addShake(7);
            }
            break;
        }
        case 'frost':
            for (const b of g.balloons) {
                if (BT[b.type].blimp) {
                    b.slowT = pw === 2 ? 6 : 4;
                    b.bslow = 0.6;
                }
                else
                    b.frozen = Math.max(b.frozen, pw === 2 ? 5 : 3);
            }
            addFx({ k: 'screen', col: 'rgba(179,229,252,.45)', life: .6 });
            break;
        case 'sniper':
            for (const b of tough().slice(0, pw === 2 ? 5 : 3)) {
                const x = b.x, y = b.y, D = pw === 2 ? 90 : 30;
                addFx({ k: 'line', x1: x, y1: -20, x2: x, y2: y, col: '#ffcc80', w: 4, life: .2 });
                addFx({ k: 'boom', x, y, r: 90, life: .6 });
                addFx({ k: 'scorch', x, y, r: 50, life: 3 });
                g.balloons.filter(o => !o.dead && Math.hypot(o.x - x, o.y - y) < 90 + BT[o.type].r).slice(0, 40).forEach(o => damageBalloon(o, D, 'normal', t));
            }
            addShake(6);
            break;
        case 'signal':
            for (const o of g.towers)
                if (!TD[o.type].support && Math.hypot(o.x - t.x, o.y - t.y) <= t.s.aura) {
                    o.boostT = Math.max(o.boostT, pw === 2 ? 8 : 6);
                    o.boostMul = Math.max(o.boostMul, pw === 2 ? 2.5 : 2);
                }
            addFx({ k: 'ring', x: t.x, y: t.y, r: t.s.aura, col: '#80cbc4', life: .6, fill: true });
            break;
        case 'boat':
            fire(t, t.s, 0, true, pw === 2 ? 40 : 24);
            break;
        case 'mine': {
            const v = Math.round(t.s.income * (pw === 2 ? 2.5 : 1.5));
            g.cash += v;
            addFx({ k: 'txt', x: t.x, y: t.y - 26, txt: '+$' + v, col: '#ffd93d', life: 1.5, big: true });
            break;
        }
    }
    addFx({ k: 'sparkle', x: t.x, y: t.y, col: '#ffd93d', life: .7 });
    Sound.play('ability');
    return true;
}
function explode(p) {
    const g = game, list = [];
    for (const b of g.balloons) {
        if (b.dead)
            continue;
        const R = p.blast + BT[b.type].r, dx = b.x - p.x, dy = b.y - p.y, d2 = dx * dx + dy * dy;
        if (d2 <= R * R)
            list.push([d2, b]);
    }
    list.sort((a, b) => a[0] - b[0]);
    list.slice(0, p.pierce).forEach(([, b]) => {
        damageBalloon(b, p.dmg, 'explosive', p.src, p.bm);
        if (p.stun && !b.dead) {
            if (!BT[b.type].blimp)
                b.frozen = Math.max(b.frozen, p.stun);
            else if (p.stun >= 1.2 && !BT[b.type].boss) {
                b.slowT = Math.max(b.slowT, 1);
                b.bslow = Math.max(b.bslow, 0.4);
            }
        }
    });
    addFx({ k: 'boom', x: p.x, y: p.y, r: p.blast, life: .4 });
    if (p.blast >= 40)
        addFx({ k: 'scorch', x: p.x, y: p.y, r: p.blast * .55, life: 3 });
    Sound.play('boom');
    for (let i = 0; i < p.cluster; i++) {
        const a = (i / p.cluster) * TAU + Math.random() * 0.4;
        g.projs.push({ x: p.x, y: p.y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, a, life: .28, life0: .28, pierce: 8, dmg: p.dmg, dtype: 'explosive',
            hit: new Set(), camo: true, src: p.src, kind: 'mini', rad: 4, explode: true, blast: 26, bm: p.bm, cluster: 0, spin: 0, stun: 0, arc: 0, trav: 0 });
    }
}
/* ---------- Simulation step ---------- */
function update(dt) {
    const g = game;
    g.time += dt;
    if (g.round >= 1 && !g.won)
        g.clock += dt; // game clock for ranking
    if (g.autoT >= 0) {
        g.autoT -= dt;
        if (g.autoT < 0)
            startRound();
    }
    if (g.inRound) {
        for (const k in g.abCd)
            if (g.abCd[k] > 0)
                g.abCd[k] = Math.max(0, g.abCd[k] - dt);
        g.roundTime += dt;
        g.saveT += dt;
        if (g.wb) {
            wbTick(dt);
            if (g.over)
                return;
        }
        while (g.spawnQ.length && g.spawnQ[0].at <= g.roundTime) {
            const s = g.spawnQ.shift();
            const b = makeBalloon(s.type, 0, { camo: s.camo, pi: g.spawned % g.paths.length, regrow: s.regrow, fort: s.fort });
            g.balloons.push(b);
            g.spawned++;
            if (BT[s.type].boss)
                onBoss(b);
        }
        if (g.saveT >= 5) {
            g.saveT = 0;
            if (g.wb)
                wbRecord(); // World Boss: keep the damage dealt so far
            else
                snapshot();
        } // mid-round autosave
    }
    for (let i = 0; i < g.balloons.length; i++) {
        const b = g.balloons[i];
        if (b.dead)
            continue;
        if (b.flash > 0)
            b.flash -= dt;
        if (b.numT > 0)
            b.numT -= dt;
        if (b.regrow) {
            b.regT += dt;
            const idx = REGROW_CHAIN.indexOf(b.type);
            if (b.regT >= REGROW_TIME && idx >= 0 && idx < b.regTop) {
                b.type = REGROW_CHAIN[idx + 1];
                b.regT = 0;
                addFx({ k: 'ring', x: b.x, y: b.y, r: 18, col: '#69f0ae', life: .3 });
            }
        }
        if (b.frozen > 0) {
            b.frozen -= dt;
            continue;
        }
        let sp = balloonSpeed(b);
        if (b.slowT > 0) {
            b.slowT -= dt;
            sp *= (1 - b.bslow);
            if (b.slowT <= 0)
                b.bslow = 0;
        }
        b.dist += sp * dt;
        const path = g.paths[b.pi];
        if (b.dist >= path.len && BT[b.type].wb)
            b.dist -= path.len; // the World Boss walks the loop forever and never takes lives
        if (b.dist >= path.len) {
            b.dead = true;
            const lv = leakValue(b);
            g.lives -= lv;
            g.leaked += lv;
            onLeak(lv);
            Sound.play('leak');
            if (g.lives <= 0) {
                g.lives = 0;
                onGameOver();
                return;
            }
            continue;
        }
        const p = posAt(path, b.dist);
        b.x = p.x;
        b.y = p.y;
        b.a = p.a;
    }
    for (const t of g.towers) {
        updateTower(t, dt);
        if (t.kick > 0)
            t.kick = Math.max(0, t.kick - dt * 6);
    }
    for (let i = 0; i < g.projs.length; i++) {
        const p = g.projs[i];
        if (p.dead)
            continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.trav += Math.hypot(p.vx, p.vy) * dt;
        p.life -= dt;
        p.spin += dt * 12;
        if (p.life <= 0 || p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) {
            if (p.explode)
                explode(p);
            p.dead = true;
            continue;
        }
        // straight shots stop at tall scenery
        if (SIGHT_PROJ[p.kind] && p.src && p.src.blk && p.src.blk.length) {
            let hitWall = false;
            for (const w of p.src.blk) {
                const dx = p.x - w.x, dy = p.y - w.y, R = w.r + p.rad * .3;
                if (dx * dx + dy * dy < R * R) {
                    hitWall = true;
                    break;
                }
            }
            if (hitWall) {
                p.dead = true;
                addFx({ k: 'spark', x: p.x, y: p.y, life: .18, col: '#d7ccc8' });
                continue;
            }
        }
        // lobbed bombs only land near the end of their arc
        if (p.arc && p.trav < p.arc * 0.7)
            continue;
        const n = g.balloons.length;
        for (let j = 0; j < n; j++) {
            const b = g.balloons[j];
            if (b.dead || p.hit.has(b.lineage) || (b.camo && !p.camo))
                continue;
            const R = BT[b.type].r + p.rad, dx = b.x - p.x, dy = b.y - p.y;
            if (dx * dx + dy * dy > R * R)
                continue;
            if (p.explode) {
                explode(p);
                p.dead = true;
                break;
            }
            p.hit.add(b.lineage);
            const r = damageBalloon(b, p.dmg, p.dtype, p.src, p.bm);
            if (r === 1 && Math.random() < .25)
                addFx({ k: 'spark', x: p.x, y: p.y, life: .15, col: '#fff8e1' });
            if (r === -1 || --p.pierce <= 0) {
                p.dead = true;
                break;
            }
        }
        if (p.arc && !p.dead && p.trav >= p.arc * 1.15) {
            explode(p);
            p.dead = true;
        }
    }
    for (const f of g.fx)
        f.t += dt;
    g.fx = g.fx.filter(f => f.t < f.life);
    g.balloons = g.balloons.filter(b => !b.dead);
    g.projs = g.projs.filter(p => !p.dead);
    if (g.inRound && !g.wb && !g.spawnQ.length && !g.balloons.length)
        endRound();
}
function addFx(f) {
    if (!game)
        return;
    const low = SETTINGS.effects === 'low', cap = low ? 120 : 500;
    if (game.fx.length >= cap)
        return;
    if (low && (f.k === 'scorch' || f.k === 'spark'))
        return;
    if (low && (f.k === 'pop' || f.k === 'clink' || f.k === 'sparkle' || f.k === 'num') && Math.random() < .6)
        return;
    f.t = 0;
    game.fx.push(f);
}

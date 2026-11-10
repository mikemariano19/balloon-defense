"use strict";
/* Balloon Defense — game rules: paths, balloons, towers, abilities, projectiles, rounds,
   saving, player progression. No drawing or DOM code lives here. */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
/* ---------- Storage ---------- */
const STORE_KEY = 'balloonDefense.v2';
const store = {
    all() {
        try {
            return JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
        }
        catch (e) {
            return {};
        }
    },
    save(o) {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(o));
        }
        catch (e) { }
    },
    get(k, d) { const v = this.all()[k]; return v === undefined || v === null ? d : v; },
    set(k, v) { const o = this.all(); o[k] = v; this.save(o); }
};
const SETTINGS = Object.assign({ autoStart: false, pauseOnBlur: true, effects: 'high', confirmSell: false, sound: false, unlockAll: false }, store.get('settings', {}));
function saveSettings() { store.set('settings', SETTINGS); }
function records() { return store.get('records', {}); }
function recordFor(mapId, diff) { const r = records()[mapId]; return (r && r[diff]) || { best: 0, won: false }; }
function challengesWon(mapId) { const r = records()[mapId]; return (r && r.modes) || {}; }
let PROFILE = Object.assign({ xp: 0, games: 0, wins: 0, pops: 0, seconds: 0, rounds: 0, built: {}, bosses: 0 }, store.get('profile', {}));
function saveProfile() { store.set('profile', PROFILE); }
function levelOf(xp) {
    let L = 1;
    while (L < 50 && xp >= xpForLevel(L + 1))
        L++;
    return L;
}
function playerLevel() { return levelOf(PROFILE.xp); }
function isUnlocked(type) { return SETTINGS.unlockAll || playerLevel() >= TD[type].unlock; }
function tier3Unlocked() { return SETTINGS.unlockAll || playerLevel() >= TIER3_LEVEL; }
function addXP(n) {
    const before = playerLevel();
    PROFILE.xp += Math.round(n);
    saveProfile();
    const after = playerLevel();
    if (after > before)
        onLevelUp(after, before);
}
function todayStr(d = new Date()) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function dailyConfig(date = todayStr()) {
    let h = 7;
    for (const ch of date)
        h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const r = rng(h);
    return { mapIdx: Math.floor(r() * MAPS.length), diffKey: r() < .55 ? 'medium' : 'hard', mode: ['standard', ...CHALLENGES][Math.floor(r() * 5)], daily: date };
}
function dailyDone(date = todayStr()) { return !!store.get('daily', {})[date]; }
function dailyStreak() {
    const d = store.get('daily', {});
    let n = 0;
    const day = new Date();
    if (!d[todayStr(day)])
        day.setDate(day.getDate() - 1);
    while (d[todayStr(day)]) {
        n++;
        day.setDate(day.getDate() - 1);
    }
    return n;
}
/* ---------- Paths ---------- */
function buildPath(pts) {
    const segs = [];
    let acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[i + 1], len = Math.hypot(x2 - x1, y2 - y1);
        segs.push({ x1, y1, x2, y2, len, start: acc, a: Math.atan2(y2 - y1, x2 - x1) });
        acc += len;
    }
    return { pts, segs, len: acc };
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
function mapPaths(map, reverse) { return map.paths.map(p => buildPath(reverse ? p.slice().reverse() : p)); }
function hasWater(map) { return (map.blocks || []).some(b => b.k === 'water'); }
function makeDeco(map, paths) {
    const theme = THEMES[map.theme], r = rng(map.seed * 7 + 3), out = [];
    for (let tries = 0; tries < 1400 && out.length < 30; tries++) {
        const type = theme.deco[Math.floor(r() * theme.deco.length)];
        const big = type.includes('tree') || type.includes('pine');
        const rad = big ? 17 + r() * 7 : type === 'flowers' ? 12 : 10 + r() * 5;
        const x = 16 + r() * (W - 32), y = 16 + r() * (H - 32);
        if (distToPaths(paths, x, y) < rad + 34)
            continue;
        if ((map.blocks || []).some(b => inBlock(b, x, y, rad + 8)))
            continue;
        if (out.some(o => Math.hypot(o.x - x, o.y - y) < o.r + rad + 34))
            continue;
        out.push({ type, x, y, r: rad, rot: (r() - .5) * .5, solid: type !== 'flowers' });
    }
    return out.sort((a, b) => a.y - b.y);
}
/* ---------- Game state ---------- */
let game = null, nextId = 1;
function price(c) { return Math.round(c * game.diff.costMul / 5) * 5; }
function createGame(cfg, snap) {
    const map = MAPS[cfg.mapIdx], diff = DIFF[cfg.diffKey], mode = cfg.mode || 'standard';
    const paths = mapPaths(map, mode === 'reverse');
    let cash = diff.cash + (TIER_CASH[map.tier] || 0) + (map.cash || 0);
    if (mode === 'halfcash')
        cash = Math.round(cash / 2);
    game = { ...cfg, mode, map, paths, diff, lives: diff.lives, cash, round: 0, inRound: false,
        spawnQ: [], spawned: 0, roundTotal: 0, roundTime: 0, balloons: [], towers: [], projs: [], fx: [], won: false, over: false,
        pops: 0, roundPops: 0, hpMult: 1, popMult: 1, time: 0, autoT: -1, startedAt: Date.now(), leaked: 0, deco: makeDeco(map, paths), saveT: 0,
        allowed: MODES[mode].towers || SHOP };
    if (snap) {
        Object.assign(game, { round: snap.round, lives: snap.lives, cash: snap.cash, won: !!snap.won, pops: snap.pops || 0, time: snap.time || 0 });
        for (const s of snap.towers) {
            const t = newTower(s.type, s.x, s.y);
            Object.assign(t, { lv: s.lv.slice(), spent: s.spent, fresh: s.fresh || 0, pops: s.pops || 0, target: s.target || 'first', ang: s.ang || -Math.PI / 2, abCd: s.abCd || 0, cd: s.cd || 0 });
            game.towers.push(t);
        }
        recalcAll();
        if (snap.inRound) {
            game.hpMult = game.round > 50 ? 1 + (game.round - 50) * 0.06 : 1;
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
    if (!g || g.over)
        return;
    store.set('run', { v: 3, mapId: g.map.id, diffKey: g.diffKey, mode: g.mode, daily: g.daily, round: g.round, lives: g.lives, cash: Math.floor(g.cash), won: g.won, pops: g.pops, time: g.time,
        towers: g.towers.map(t => ({ type: t.type, x: t.x, y: t.y, lv: t.lv, spent: t.spent, fresh: t.fresh, pops: t.pops, target: t.target, ang: t.ang, abCd: t.abCd, cd: t.cd })),
        inRound: g.inRound, roundTime: g.roundTime, spawned: g.spawned, roundTotal: g.roundTotal, roundPops: g.roundPops,
        spawnQ: g.inRound ? g.spawnQ : [],
        balloons: g.inRound ? g.balloons.filter(b => !b.dead).map(b => ({ type: b.type, hp: b.hp, maxHp: b.maxHp, dist: b.dist, camo: b.camo, lineage: b.lineage, pi: b.pi,
            frozen: b.frozen, slow: b.slow, regrow: b.regrow, regTop: b.regTop, fort: b.fort, bossStage: b.bossStage, spdMul: b.spdMul })) : [],
        savedAt: Date.now() });
}
function savedRun() { const r = store.get('run', null); return r && r.v === 3 && MAPS.some(m => m.id === r.mapId) ? r : null; }
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
/* ---------- Balloons ---------- */
function makeBalloon(type, dist, o = {}) {
    const d = BT[type];
    const fort = !!o.fort && (d.hp > 1 || type === 'lead');
    let hp = 1;
    if (d.boss)
        hp = Math.round(bossHp(game.round) * (game.mode === 'halfcash' ? 0.8 : 1));
    else if (d.hp > 1)
        hp = Math.round(d.hp * game.hpMult) * (fort ? 2 : 1);
    else if (fort)
        hp = 4;
    const ri = REGROW_CHAIN.indexOf(type), regrow = !!o.regrow && ri >= 0;
    const b = { id: nextId++, type, hp, maxHp: hp, dist, camo: !!o.camo && !d.blimp, lineage: o.lineage || 0, pi: o.pi || 0, frozen: 0, slow: 0,
        slowT: 0, bslow: 0, dead: false, x: 0, y: 0, a: 0, wob: Math.random() * 6, flash: 0,
        regrow, regTop: regrow ? (o.regTop ?? ri) : -1, regT: 0, fort, bossStage: 0, spdMul: 1, numT: 0 };
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
    if (b.maxHp >= 10 && dmg >= 2 && b.numT <= 0) {
        addFx({ k: 'num', x: b.x + (Math.random() - .5) * 16, y: b.y - BT[b.type].r, txt: '-' + Math.round(Math.min(dmg, b.hp)), life: .7 });
        b.numT = .12;
    }
    if (b.hp > dmg) {
        b.hp -= dmg;
        b.flash = 0.06;
        if (d.boss)
            bossCheck(b);
        return 1;
    }
    popBalloon(b, dmg - b.hp, dtype, src);
    return 1;
}
const MILESTONES = [100, 500, 1000, 2500, 5000, 10000, 25000, 50000];
function popBalloon(b, left, dtype, src) {
    const g = game, d = BT[b.type];
    b.dead = true;
    g.cash += popCash();
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
    addFx({ k: 'pop', x: b.x, y: b.y, life: .25, col: d.col, r: d.r });
    if (d.blimp) {
        addFx({ k: 'boom', x: b.x, y: b.y, r: d.r * 1.5, life: .45 });
        Sound.play('boom');
    }
    let kids = d.kids;
    if (d.boss) {
        kids = Array(4).fill(bossMinion(g.round));
        PROFILE.bosses++;
        toast('Colossus defeated!', 'good');
        Sound.play('chime');
    }
    kids.forEach((k, i) => {
        const c = makeBalloon(k, Math.max(0, b.dist - i * (d.blimp ? 14 : 8)), { camo: b.camo, lineage: b.lineage, pi: b.pi, regrow: b.regrow, regTop: b.regTop });
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
            const c = makeBalloon(m, Math.max(0, b.dist - 20 - i * 10), { lineage: b.lineage, pi: b.pi });
            game.balloons.push(c);
        }
        addFx({ k: 'ring', x: b.x, y: b.y, r: 90, col: '#ce93d8', life: .5, fill: true });
        toast('The Colossus splits off more balloons!', 'warn');
        Sound.play('boss');
    }
}
function leakValue(b) { return BT[b.type].boss ? Math.ceil(b.hp) : Math.ceil(b.hp) + BT[b.type].kids.reduce((s, k) => s + RBE[k], 0); }
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
    g.round++;
    g.hpMult = g.round > 50 ? 1 + (g.round - 50) * 0.06 : 1;
    g.spawnQ = buildSpawns(g.round);
    g.roundTotal = g.spawnQ.length;
    g.spawned = 0;
    g.roundPops = 0;
    g.roundTime = 0;
    g.inRound = true;
    g.autoT = -1;
    g.saveT = 0;
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
    let income = 0;
    g.cash += bonus;
    for (const t of g.towers)
        if (t.s.income > 0) {
            let inc = t.s.income;
            if (t.s.vault)
                inc += Math.min(1000, Math.floor(g.cash * t.s.vault));
            income += inc;
            g.cash += inc;
            addFx({ k: 'txt', x: t.x, y: t.y - 26, txt: '+$' + inc, col: '#ffd93d', life: 1.5 });
        }
    toast(`Round ${g.round} complete · +$${bonus}` + (income ? ` · income +$${income}` : ''), 'good');
    Sound.play('chime');
    PROFILE.pops += g.roundPops;
    PROFILE.rounds++;
    addXP(XP.perRound + g.roundPops / XP.perPops);
    if (g.round >= g.diff.end && !g.won) {
        g.won = true;
        PROFILE.wins++;
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
            xp += XP.daily;
        }
        addXP(xp);
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
    return { id: nextId++, type, x, y, lv: [0, 0], spent: 0, fresh: 0, cd: 0, ang: -Math.PI / 2, pops: 0, target: 'first', s: null, abCd: 0, boostT: 0, boostMul: 1, boostChains: 0, kick: 0, buffed: false };
}
function statsFor(type, lv) {
    const d = TD[type], s = JSON.parse(JSON.stringify(d.base));
    for (let p = 0; p < 2; p++)
        for (let i = 0; i < lv[p]; i++)
            d.paths[p][i].a(s);
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
            let bR = 0, bRate = 0, bD = 0, bP = 0, bC = false;
            for (const sg of sigs) {
                if (Math.hypot(sg.x - t.x, sg.y - t.y) > sg.base.aura)
                    continue;
                t.buffed = true;
                bR = Math.max(bR, sg.base.buffRange);
                bRate = Math.max(bRate, sg.base.buffRate);
                bD = Math.max(bD, sg.base.buffDmg);
                bP = Math.max(bP, sg.base.buffPierce);
                bC = bC || sg.base.buffCamo;
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
        }
        t.s = s;
    }
    let pb = 0;
    for (const o of g.towers)
        if (o.type === 'mine')
            pb += o.s.popBonus || 0;
    g.popMult = 1 + Math.min(0.3, pb);
}
function spotProblem(type, x, y) {
    const r = TD[type].r, g = game;
    if (x < r || y < r || x > W - r || y > H - r)
        return 'Too close to the edge';
    if (distToPaths(g.paths, x, y) < 22 + r - 2)
        return 'Can\'t build on the road';
    if (TD[type].water) {
        if (!(g.map.blocks || []).some(b => b.k === 'water' && inBlock(b, x, y, -r + 4)))
            return 'Gunboats must be built on water';
    }
    else {
        for (const b of g.map.blocks || [])
            if (inBlock(b, x, y, r - 4))
                return b.k === 'lava' ? 'Can\'t build on lava' : b.k === 'ice' ? 'Can\'t build on ice' : 'Only Gunboats can go on water';
        for (const o of g.deco)
            if (o.solid && Math.hypot(o.x - x, o.y - y) < o.r * 0.7 + r)
                return 'Blocked by scenery';
    }
    for (const t of g.towers)
        if (Math.hypot(t.x - x, t.y - y) < TD[t.type].r + r)
            return 'Too close to another tower';
    if (g.cash < price(TD[type].cost))
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
    const g = game, cost = price(TD[type].cost), why = shopProblem(type) || spotProblem(type, x, y);
    if (why) {
        toast(why, 'bad');
        return null;
    }
    g.cash -= cost;
    const t = newTower(type, x, y);
    t.spent = cost;
    t.fresh = g.inRound ? 0 : cost;
    g.towers.push(t);
    recalcAll();
    PROFILE.built[type] = (PROFILE.built[type] || 0) + 1;
    addFx({ k: 'ring', x, y, r: 34, col: '#ffffff', life: .35 });
    addFx({ k: 'dust', x, y, life: .4 });
    Sound.play('place');
    if (!g.inRound)
        snapshot();
    return t;
}
function canUp(t, p) {
    const nl = t.lv[p] + 1;
    if (nl > 3)
        return 'max';
    if (nl >= 2 && t.lv[1 - p] >= 2)
        return 'locked';
    if (nl === 3 && game.mode === 'notier3')
        return 'mode';
    if (nl === 3 && !tier3Unlocked())
        return 'level';
    return 'ok';
}
function upgradeCost(t, p) { return price(TD[t.type].paths[p][t.lv[p]].c); }
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
    addFx({ k: 'ring', x: t.x, y: t.y, r: 40, col: p ? '#ffb74d' : '#4fc3f7', life: .45 });
    addFx({ k: 'sparkle', x: t.x, y: t.y, col: p ? '#ffb74d' : '#4fc3f7', life: .6 });
    Sound.play('upgrade');
    if (t.lv[p] === 3)
        toast(TD[t.type].ability.name + ' ability unlocked! Press Q or click it in the ability bar.', 'good');
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
function fire(t, s, ang, radial, n) {
    const spd = s.speed, life = s.life || (s.range / spd) * 1.3, explode = s.proj === 'bomb' || s.proj === 'missile';
    for (let i = 0; i < n; i++) {
        const a = radial ? (i / n) * TAU : ang + (i - (n - 1) / 2) * (s.spread || 0);
        game.projs.push({ x: t.x + Math.cos(a) * 16, y: t.y + Math.sin(a) * 16, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, a,
            life, pierce: s.pierce, dmg: s.dmg, dtype: s.dtype, hit: new Set(), camo: s.camo, src: t, kind: s.proj,
            rad: s.proj === 'ball' ? 14 : explode || s.proj === 'torpedo' ? 7 : s.proj === 'cannonball' ? 6 : 5,
            explode, blast: s.blast, bm: s.bm || 1, cluster: s.cluster || 0, spin: 0 });
    }
}
function updateTower(t, dt) {
    const s = t.s, g = game;
    if (g.inRound && t.abCd > 0)
        t.abCd = Math.max(0, t.abCd - dt);
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
    const cands = [];
    for (const b of g.balloons)
        if (canSee(t, b) && inRange(t, b, s.range))
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
                    b.bslow = s.blimpSlow;
                }
            }
            else if (b.type !== 'white' && b.type !== 'zebra') {
                b.frozen = Math.max(b.frozen, s.freeze);
                if (s.permaslow)
                    b.slow = Math.max(b.slow, s.permaslow);
                if (s.dmg)
                    damageBalloon(b, s.dmg, 'freeze', t);
            }
            if (s.shatter)
                damageBalloon(b, s.shatter, 'normal', t);
        }
        addFx({ k: 'ring', x: t.x, y: t.y, r: s.range, col: '#b3e5fc', life: .5, fill: true });
        return;
    }
    if (s.mode === 'ring') {
        cands.slice(0, 40).forEach(b => damageBalloon(b, s.dmg, 'fire', t));
        addFx({ k: 'ring', x: t.x, y: t.y, r: s.range, col: '#ff7043', life: .25, fill: true });
        return;
    }
    const ranked = rankTargets(t, cands), tgt = ranked[0];
    if (s.mode === 'hitscan') {
        t.ang = Math.atan2(tgt.y - t.y, tgt.x - t.x);
        addFx({ k: 'line', x1: t.x + Math.cos(t.ang) * 26, y1: t.y + Math.sin(t.ang) * 26, x2: tgt.x, y2: tgt.y, col: '#fff59d', w: 2, life: .08 });
        addFx({ k: 'flash', x: t.x + Math.cos(t.ang) * 28, y: t.y + Math.sin(t.ang) * 28, life: .08 });
        Sound.play('shot');
        damageBalloon(tgt, s.dmg, 'normal', t, s.bm);
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
                damageBalloon(cur, s.dmg, 'energy', t);
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
            addFx({ k: 'bolt', pts, life: .18 });
        }
        Sound.play('zap');
        return;
    }
    const radial = s.proj === 'tack' || s.proj === 'blade';
    let ang = 0;
    if (!radial) {
        const dist = Math.hypot(tgt.x - t.x, tgt.y - t.y), p = predict(tgt, dist / s.speed);
        ang = Math.atan2(p.y - t.y, p.x - t.x);
        t.ang = ang;
    }
    fire(t, s, ang, radial, s.count || 1);
    if (s.proj === 'bomb' || s.proj === 'missile' || s.proj === 'cannonball' || s.proj === 'torpedo') {
        addFx({ k: 'flash', x: t.x + Math.cos(ang) * 24, y: t.y + Math.sin(ang) * 24, life: .1, big: true });
        Sound.play('shot');
    }
}
/* ---------- Abilities (any tower with a tier-3 upgrade) ---------- */
function hasAbility(t) { return t.lv[0] === 3 || t.lv[1] === 3; }
function abilityProblem(t) {
    if (!hasAbility(t))
        return 'Needs a tier-3 upgrade';
    if (t.abCd > 0)
        return 'Recharging (' + Math.ceil(t.abCd) + 's)';
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
    const g = game, ab = TD[t.type].ability, tough = () => g.balloons.filter(b => !b.dead).sort((a, b) => toughness(b) - toughness(a));
    t.abCd = ab.cd;
    switch (t.type) {
        case 'dart':
            t.boostT = 5;
            t.boostMul = 3;
            break;
        case 'tesla':
            t.boostT = 6;
            t.boostMul = 3;
            t.boostChains = 5;
            break;
        case 'tack':
            for (const b of g.balloons.slice())
                if (!b.dead && Math.hypot(b.x - t.x, b.y - t.y) < 200)
                    damageBalloon(b, 4, 'normal', t);
            addFx({ k: 'ring', x: t.x, y: t.y, r: 200, col: '#f48fb1', life: .6, fill: true });
            break;
        case 'bomb': {
            const b = tough()[0];
            if (b) {
                addFx({ k: 'line', x1: t.x, y1: t.y, x2: b.x, y2: b.y, col: '#ff7043', w: 5, life: .25 });
                addFx({ k: 'boom', x: b.x, y: b.y, r: 70, life: .5 });
                damageBalloon(b, 1200, 'normal', t, 1);
            }
            break;
        }
        case 'frost':
            for (const b of g.balloons) {
                if (BT[b.type].blimp) {
                    b.slowT = 4;
                    b.bslow = 0.6;
                }
                else
                    b.frozen = Math.max(b.frozen, 3);
            }
            addFx({ k: 'screen', col: 'rgba(179,229,252,.45)', life: .6 });
            break;
        case 'sniper':
            for (const b of tough().slice(0, 3)) {
                const x = b.x, y = b.y;
                addFx({ k: 'line', x1: x, y1: -20, x2: x, y2: y, col: '#ffcc80', w: 4, life: .2 });
                addFx({ k: 'boom', x, y, r: 90, life: .5 });
                g.balloons.filter(o => !o.dead && Math.hypot(o.x - x, o.y - y) < 90 + BT[o.type].r).slice(0, 40).forEach(o => damageBalloon(o, 30, 'normal', t));
            }
            break;
        case 'signal':
            for (const o of g.towers)
                if (!TD[o.type].support && Math.hypot(o.x - t.x, o.y - t.y) <= t.s.aura) {
                    o.boostT = Math.max(o.boostT, 6);
                    o.boostMul = Math.max(o.boostMul, 2);
                }
            addFx({ k: 'ring', x: t.x, y: t.y, r: t.s.aura, col: '#80cbc4', life: .6, fill: true });
            break;
        case 'boat':
            fire(t, t.s, 0, true, 24);
            break;
        case 'mine': {
            const v = Math.round(t.s.income * 1.5);
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
    list.slice(0, p.pierce).forEach(([, b]) => damageBalloon(b, p.dmg, 'explosive', p.src, p.bm));
    addFx({ k: 'boom', x: p.x, y: p.y, r: p.blast, life: .32 });
    Sound.play('boom');
    for (let i = 0; i < p.cluster; i++) {
        const a = (i / p.cluster) * TAU + Math.random() * 0.4;
        g.projs.push({ x: p.x, y: p.y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, a, life: .28, pierce: 8, dmg: p.dmg, dtype: 'explosive',
            hit: new Set(), camo: true, src: p.src, kind: 'mini', rad: 4, explode: true, blast: 26, bm: p.bm, cluster: 0, spin: 0 });
    }
}
/* ---------- Simulation step ---------- */
function update(dt) {
    const g = game;
    g.time += dt;
    if (g.autoT >= 0) {
        g.autoT -= dt;
        if (g.autoT < 0)
            startRound();
    }
    if (g.inRound) {
        g.roundTime += dt;
        g.saveT += dt;
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
        }
        b.dist += sp * dt;
        const path = g.paths[b.pi];
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
        p.life -= dt;
        p.spin += dt * 12;
        if (p.life <= 0 || p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) {
            if (p.explode)
                explode(p);
            p.dead = true;
            continue;
        }
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
            if (r === -1 || --p.pierce <= 0) {
                p.dead = true;
                break;
            }
        }
    }
    for (const f of g.fx)
        f.t += dt;
    g.fx = g.fx.filter(f => f.t < f.life);
    g.balloons = g.balloons.filter(b => !b.dead);
    g.projs = g.projs.filter(p => !p.dead);
    if (g.inRound && !g.spawnQ.length && !g.balloons.length)
        endRound();
}
function addFx(f) {
    if (!game)
        return;
    const cap = SETTINGS.effects === 'low' ? 120 : 400;
    if (game.fx.length >= cap)
        return;
    if (SETTINGS.effects === 'low' && (f.k === 'pop' || f.k === 'clink' || f.k === 'sparkle' || f.k === 'num') && Math.random() < .6)
        return;
    f.t = 0;
    game.fx.push(f);
}

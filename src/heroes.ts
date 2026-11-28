/* Balloon Defense — heroes: four original heroes. One per game, listed above the towers in every mode except Primary Only. The tables come first, then the rules. No
   drawing or DOM code lives here. A hero is placed like a tower (it is an entry in game.towers and TD) but has no
   upgrade paths: it levels up by itself and has two abilities. Heroes are never in SHOP. */
const HERO_MAX_LEVEL = 10;
/** Total hero XP needed for each level (index = level). A hero on the field earns heroRoundXp at the end of every round:
    placed on round 1, that is level 3 after round 5 and level 10 after round 32. */
const HERO_XP = [0, 0, 26, 80, 152, 242, 350, 522, 726, 1026, 1376];
const heroRoundXp = (r) => 10 + 2 * r;
const HERO_ABILITY_LEVELS = [3, 10];
const HERO_KEYS = ['Z', 'X'];
/** `levels`: stat changes the hero gets on reaching a level. `skills` is what the panel and tooltip list. */
const HEROES: any = {
    fern: { name: 'Fern Fletch', role: 'Fox archer, all-round starter', cost: 540, color: '#ee7a2d',
        desc: 'Fires sharp arrows. Cannot pop lead, and sees camo from level 5.',
        base: { range: 150, rate: 0.95, dmg: 1, pierce: 3, dtype: 'sharp', speed: 620, count: 1, spread: 0, proj: 'arrow', camo: false, life: 0, bm: 1, burst: 0 },
        levels: { 5: s => { s.camo = true; }, 6: s => { s.count = 2; s.spread = 0.12; }, 7: s => { s.burst = 30; }, 8: s => { s.bm = 3; } },
        abilities: [{ name: 'Split Shot', cd: 60, desc: 'For 8 s, shoots 3 different balloons at once.' },
            { name: 'Arrow Rain', cd: 70, aim: 120, desc: 'Pick a spot: 3 waves of 4 damage on everything there (cannot pop lead).' }],
        skills: [[5, 'Keen Eyes', 'Detects camo.'], [6, 'Twin Nock', '2 arrows per shot.'], [7, 'Burst Tip', 'Every 3rd shot bursts in a small circle (cannot pop lead).'], [8, 'Blimp Piercer', '3x damage to blimps.']] },
    ember: { name: 'Ember Vale', role: 'Tiger fire support', cost: 725, color: '#d9483b',
        desc: 'Throws fire that pops lead. Short range, and the normal attack misses camo.',
        base: { range: 100, rate: 0.5, dmg: 1, pierce: 2, dtype: 'fire', speed: 420, count: 1, spread: 0, proj: 'ember', camo: false, life: 0, bm: 1 },
        levels: { 6: s => { s.pierce += 2; }, 8: s => { s.range += 20; } },
        abilities: [{ name: 'Spark Bottle', cd: 30, desc: 'Burning patch on the road for 10 s, hits camo too.' },
            { name: 'Wildfire', cd: 60, desc: '3 fire damage to every balloon (camo too); all towers get Kindle for 8 s.' }],
        skills: [[4, 'Kindle', 'Towers within 100 px get +1 pierce, and their sharp attacks become fire.'], [6, 'Hotter Flame', '+2 pierce.'], [8, 'Wide Blaze', '+20 range.']] },
    flint: { name: 'Sergeant Flint', role: 'Bear artillery commander', cost: 700, color: '#66733a',
        desc: 'Lobs exploding shells over scenery. No camo, and cannot pop black or zebra until level 8.',
        base: { range: 160, rate: 1.2, dmg: 2, pierce: 10, dtype: 'explosive', speed: 380, proj: 'bomb', blast: 35, camo: false, life: 0, bm: 1, cluster: 0, stun: 0, crack: 0 },
        levels: { 8: s => { s.crack = 1; } },
        abilities: [{ name: 'Dazer Shell', cd: 16, desc: 'Homing shell: 3 damage and a 1.5 s stun around it (no stun on bosses).' },
            { name: 'Reload Order', cd: 80, desc: 'Halves the Blimp Wrecker recharge left; bomb towers attack 25% faster for 8 s.' }],
        skills: [[5, 'Crew Drill', 'Bomb Cannons and Mortar Deck Gunboats attack 8% faster.'], [8, 'Armor Cracker', 'Own shells damage black and zebra.']] },
    willow: { name: 'Willow Moss', role: 'Deer forest keeper, crowd control', cost: 650, color: '#4f8f4a',
        desc: 'Firefly sparks jump between balloons and pop lead. No camo, weak against blimps.',
        base: { range: 120, rate: 1.35, dmg: 1, chains: 3, jump: 85, mode: 'chain', camo: false, bolts: 1, bm: 1, shockSlow: 0, boltCol: '#fff27a' },
        levels: { 7: s => { s.chains = 5; } },
        abilities: [{ name: 'Tangle Roots', cd: 30, desc: 'Balloons within 150 px move 50% slower for 5 s (not blimps).' },
            { name: 'Great Grove', cd: 90, desc: 'All balloons move 40% slower for 8 s (blimps 20%, bosses not at all).' }],
        skills: [[5, 'Green Current', 'Tesla Coils within 120 px attack 10% faster.'], [7, 'Longer Jumps', 'Sparks jump to 5 balloons.'], [8, 'Charged Grove', 'Tesla Coils within 120 px get +2 chain jumps.']] }
};
const HERO_IDS = Object.keys(HEROES);
// placement, drawing, targeting and selling read TD, so every hero has an entry there too (with no upgrade paths)
for (const id of HERO_IDS) {
    const h = HEROES[id];
    (TD as any)[id] = { name: h.name, cost: h.cost, size: 2, r: 19, color: h.color, unlock: 1, desc: h.desc, hero: true, base: h.base, paths: [[], [], []] };
}
/** Every skill and ability of a hero in level order: [level, name, text, ability slot or -1]. */
function heroSkillList(id) {
    const h = HEROES[id];
    return h.skills.map(([lv, name, desc]) => [lv, name, desc, -1])
        .concat(h.abilities.map((a, i) => [HERO_ABILITY_LEVELS[i], a.name, a.desc, i]))
        .sort((a, b) => a[0] - b[0]);
}
function heroStats(id, level) {
    const h = HEROES[id], s: any = Object.assign({}, h.base);
    for (let L = 2; L <= level; L++)
        if (h.levels[L])
            h.levels[L](s);
    s.cdMul = 1;
    return s;
}
function heroLevel(t) { let L = 1; while (L < HERO_MAX_LEVEL && (t.heroXp || 0) >= HERO_XP[L + 1])
    L++; return L; }
/** The hero on the field (one at most), or null. */
function heroTower() { return game ? game.towers.find(t => TD[t.type].hero) || null : null; }
/** Heroes join every game except modes that limit the towers (Primary Only). */
function heroesAllowed() { return !!game && !MODES[game.mode].towers; }
/** Why this hero can't be placed now ('' = it can). The first hero that fights a round is the hero for that game. */
function heroProblem(id) {
    if (!heroesAllowed())
        return 'No heroes in ' + MODES[game.mode].name + ' mode';
    if (game.heroId && game.heroId !== id)
        return 'Your hero this game is ' + HEROES[game.heroId].name;
    if (heroTower())
        return 'Your hero is already on the field';
    return '';
}
/** At the end of every round the hero on the field gains XP, and may level up. */
function heroEndRound() {
    const t = heroTower();
    if (!t)
        return;
    game.heroId = t.type;
    const before = heroLevel(t);
    t.heroXp = (t.heroXp || 0) + heroRoundXp(game.round);
    const after = heroLevel(t);
    if (after > before) {
        recalcAll();
        const i = HERO_ABILITY_LEVELS.findIndex(L => L > before && L <= after);
        toast(HEROES[t.type].name + ' is level ' + after + (i >= 0 ? ': ' + HEROES[t.type].abilities[i].name + ' unlocked (press ' + HERO_KEYS[i] + ')' : ''), 'good');
        addFx({ k: 'sparkle', x: t.x, y: t.y, col: '#ffd93d', life: .8 });
    }
    if (typeof onHeroXp === 'function')
        onHeroXp(after > before);
}
/** Bomb Cannons, and Gunboats with Mortar Deck or higher. */
function isBombTower(t) { return t.type === 'bomb' || (t.type === 'boat' && t.lv[2] >= 3); }
/** What the hero (and its timed abilities) adds to tower `t`'s stats `s`. Called by recalcAll after Signal buffs. */
function heroBuffs(t, s) {
    t.heroBuffed = false;
    if (TD[t.type].hero || TD[t.type].support)
        return;
    const h = heroTower(), lv = h ? heroLevel(h) : 0, buff = game.heroBuff || {};
    const near = (R) => Math.hypot(h.x - t.x, h.y - t.y) <= R;
    if (buff.kindle > 0 || (h && h.type === 'ember' && lv >= 4 && near(100))) {
        if (s.pierce)
            s.pierce += 1;
        if (s.dtype === 'sharp')
            s.dtype = 'fire';
        t.heroBuffed = true;
    }
    if (isBombTower(t)) {
        if (h && h.type === 'flint' && lv >= 5) {
            s.rate /= 1.08;
            t.heroBuffed = true;
        }
        if (buff.reload > 0) {
            s.rate /= 1.25;
            t.heroBuffed = true;
        }
    }
    if (h && h.type === 'willow' && t.type === 'tesla' && lv >= 5 && near(120)) {
        s.rate /= 1.1;
        if (lv >= 8)
            s.chains += 2;
        t.heroBuffed = true;
    }
}
/** Speed multiplier from Tangle Roots and Great Grove (the stronger of the two, they don't stack). */
function heroSlow(b) {
    const d = BT[b.type], root = b.rootT > 0 ? 0.5 : 1;
    const grove = game.heroBuff && game.heroBuff.grove > 0 && !d.boss ? (d.blimp ? 0.8 : 0.6) : 1;
    return Math.min(root, grove);
}
/* ---------- Attacks ---------- */
/** Fern Fletch's shot: up to 3 targets during Split Shot, and every 3rd shot bursts from level 7. */
function fernShot(t, ranked) {
    const s = t.s;
    t.shots = (t.shots || 0) + 1;
    const burst = s.burst && t.shots % 3 === 0 ? s.burst : 0;
    ranked.slice(0, t.splitT > 0 ? 3 : 1).forEach((tgt, i) => {
        const p = predict(tgt, Math.hypot(tgt.x - t.x, tgt.y - t.y) / s.speed), ang = Math.atan2(p.y - t.y, p.x - t.x), from = game.projs.length;
        if (!i)
            t.ang = ang;
        fire(t, s, ang, false, s.count, 0);
        for (let j = from; j < game.projs.length; j++)
            game.projs[j].burst = burst;
    });
}
/** The small blast of a Burst Tip arrow, around the first balloon it hits. */
function heroBurst(p) {
    const R = p.burst;
    p.burst = 0;
    let n = 0;
    for (const b of game.balloons.slice()) {
        if (n >= 12)
            break;
        if (b.dead || p.hit.has(b.lineage) || (b.camo && !p.camo) || Math.hypot(b.x - p.x, b.y - p.y) > R + BT[b.type].r)
            continue;
        n++;
        damageBalloon(b, p.dmg, 'sharp', p.src, p.bm);
    }
    addFx({ k: 'ring', x: p.x, y: p.y, r: R, col: '#ffb74d', life: .3, fill: true });
}
/* ---------- Abilities ---------- */
function heroCdLeft(i) { const t = heroTower(); return t ? game.abCd[t.type + ':' + i] || 0 : 0; }
function heroAbilityProblem(i) {
    const t = heroTower();
    if (!t)
        return 'Place your hero first';
    if (heroLevel(t) < HERO_ABILITY_LEVELS[i])
        return 'Needs hero level ' + HERO_ABILITY_LEVELS[i];
    if (heroCdLeft(i) > 0)
        return 'Recharging (' + Math.ceil(heroCdLeft(i)) + 's)';
    if (!game.inRound)
        return 'Use it during a round';
    return '';
}
/** Damage everything within r of (x, y). */
function heroArea(x, y, r, dmg, dtype, src) {
    for (const b of game.balloons.slice())
        if (!b.dead && Math.hypot(b.x - x, b.y - y) <= r + BT[b.type].r)
            damageBalloon(b, dmg, dtype, src);
}
/** Where Spark Bottle lands: on the furthest-along balloon in range, else on the road in range nearest the exit, else
    on the road closest to the hero. */
function heroRoadSpot(t) {
    const R = t.s.range, lead = game.balloons.filter(b => !b.dead && inRange(t, b, R)).sort((a, b) => progressOf(b) - progressOf(a))[0];
    if (lead)
        return { x: lead.x, y: lead.y };
    let best = null, bestAt = -1, near = null, nearD = 1e9;
    for (const path of game.paths)
        for (let d = 0; d <= path.len; d += 8) {
            const p = posAt(path, d), dd = Math.hypot(p.x - t.x, p.y - t.y);
            if (p.x < 0 || p.x > W || p.y < 0 || p.y > H)
                continue;
            if (dd <= R && d / path.len > bestAt) {
                best = p;
                bestAt = d / path.len;
            }
            if (dd < nearD) {
                near = p;
                nearD = dd;
            }
        }
    const q = best || near;
    return { x: q.x, y: q.y };
}
/** Uses hero ability `i` (0 or 1). Arrow Rain also needs the spot to hit. True when it fired. */
function useHeroAbility(i, x?, y?) {
    const why = heroAbilityProblem(i);
    if (why) {
        toast(why, 'bad');
        return false;
    }
    const g = game, t = heroTower(), ab = HEROES[t.type].abilities[i], id = t.type + ':' + i;
    if (ab.aim && x === undefined)
        return false;
    const inRoots = (b) => !b.dead && !BT[b.type].blimp && Math.hypot(b.x - t.x, b.y - t.y) <= 150;
    if (id === 'willow:0' && !g.balloons.some(inRoots)) {
        toast('No balloons close enough to tangle', 'bad');
        return false;
    }
    let dazed = null;
    if (id === 'flint:0') {
        dazed = rankTargets(t, g.balloons.filter(b => canSee(t, b)))[0];
        if (!dazed) {
            toast('No balloon to aim at', 'bad');
            return false;
        }
    }
    g.abCd[id] = g.abMax[id] = ab.cd * (t.s.cdMul || 1);
    switch (id) {
        case 'fern:0':
            t.splitT = 8;
            break;
        case 'fern:1':
            g.heroFx.push({ k: 'rain', x, y, r: ab.aim, left: 3, t: 0.25 });
            break;
        case 'ember:0': {
            const p = heroRoadSpot(t);
            g.heroFx.push({ k: 'patch', x: p.x, y: p.y, r: 36, left: 10, t: 0.5 });
            break;
        }
        case 'ember:1':
            heroArea(W / 2, H / 2, W * 2, 3, 'fire', t);
            g.heroBuff.kindle = 8;
            recalcAll();
            addFx({ k: 'screen', col: 'rgba(255,138,58,.4)', life: .7 });
            addShake(6);
            break;
        case 'flint:0':
            g.heroFx.push({ k: 'dazer', x: t.x, y: t.y, tid: dazed.id, crack: t.s.crack, camo: t.s.camo });
            break;
        case 'flint:1':
            if (g.abCd.bomb > 0)
                g.abCd.bomb /= 2;
            g.heroBuff.reload = 8;
            recalcAll();
            addFx({ k: 'screen', col: 'rgba(255,207,63,.25)', life: .5 });
            break;
        case 'willow:0':
            for (const b of g.balloons)
                if (inRoots(b))
                    b.rootT = 5;
            addFx({ k: 'ring', x: t.x, y: t.y, r: 150, col: '#8bc34a', life: .7, fill: true });
            break;
        case 'willow:1':
            g.heroBuff.grove = 8;
            addFx({ k: 'screen', col: 'rgba(139,195,74,.35)', life: .7 });
            break;
    }
    addFx({ k: 'sparkle', x: t.x, y: t.y, col: '#ffd93d', life: .7 });
    Sound.play('ability');
    return true;
}
/** Runs timed ability effects: burning patches, arrow waves, the homing shell and the 8 s boosts. */
function heroTick(dt) {
    const g = game, buff = g.heroBuff;
    let ended = false;
    for (const k of ['kindle', 'reload', 'grove'])
        if (buff[k] > 0) {
            buff[k] = Math.max(0, buff[k] - dt);
            if (!buff[k] && k !== 'grove')
                ended = true;
        }
    if (ended)
        recalcAll();
    if (!g.heroFx.length)
        return;
    const src = heroTower();
    for (const e of g.heroFx) {
        if (e.k === 'rain') {
            e.t -= dt;
            if (e.t <= 0) {
                e.t += 0.5;
                e.left--;
                heroArea(e.x, e.y, e.r, 4, 'sharp', src);
                addFx({ k: 'arrows', x: e.x, y: e.y, r: e.r, life: .35 });
                e.done = e.left <= 0;
            }
        }
        else if (e.k === 'patch') {
            e.t -= dt;
            e.left -= dt;
            if (e.t <= 1e-6) {
                e.t += 0.5;
                heroArea(e.x, e.y, e.r, 1, 'fire', src);
            }
            e.done = e.left <= 1e-6;
        }
        else { // dazer shell: flies to its balloon, or to the nearest other one if that was popped
            // it sees camo only if Flint did when firing (a Signal Tower's Radar Dish)
            const see = (b) => !b.dead && (!b.camo || e.camo), far = (b) => Math.hypot(b.x - e.x, b.y - e.y);
            let b = g.balloons.find(o => o.id === e.tid && see(o));
            if (!b) {
                b = g.balloons.filter(see).sort((p, q) => far(p) - far(q))[0];
                if (!b) {
                    e.done = true;
                    continue;
                }
                e.tid = b.id;
            }
            const d = far(b), step = 520 * dt;
            if (d > step + BT[b.type].r) {
                e.x += (b.x - e.x) / d * step;
                e.y += (b.y - e.y) / d * step;
                continue;
            }
            const x = b.x, y = b.y, hit = (o) => see(o) && Math.hypot(o.x - x, o.y - y) <= 60 + BT[o.type].r;
            for (const o of g.balloons.slice())
                if (hit(o))
                    damageBalloon(o, 3, e.crack ? 'normal' : 'explosive', src);
            for (const o of g.balloons) // after the damage, so the layers it uncovered are stunned too
                if (hit(o) && !BT[o.type].boss)
                    o.frozen = Math.max(o.frozen, 1.5);
            addFx({ k: 'boom', x, y, r: 60, life: .45 });
            Sound.play('boom');
            e.done = true;
        }
    }
    g.heroFx = g.heroFx.filter(e => !e.done);
}

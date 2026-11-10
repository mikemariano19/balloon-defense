/* Balloon Defense — game data: maps, modes, difficulties, balloons, towers, rounds.
   Edit these tables to rebalance the game; no other file needs to change. */
const W = 960, H = 600, TAU = Math.PI * 2;
/* ---------- Map tiers & themes ---------- */
const TIERS = [
    { id: 'beginner', name: 'Beginner', color: '#6bcb77' },
    { id: 'intermediate', name: 'Intermediate', color: '#4d96ff' },
    { id: 'advanced', name: 'Advanced', color: '#ffb74d' },
    { id: 'expert', name: 'Expert', color: '#ff6b6b' }
];
const THEMES = {
    meadow: { ground: 'grass', path: 'dirt', edge: '#8a6a45', blot: ['#69a537', '#86c24f'], deco: ['tree', 'tree', 'bush', 'flowers', 'rock', 'pine'] },
    autumn: { ground: 'autumn', path: 'dirt', edge: '#7a5a3a', blot: ['#8d9a3d', '#b2b85c'], deco: ['autumntree', 'autumntree', 'bush', 'rock', 'mushroom', 'tree'] },
    desert: { ground: 'sand', path: 'sandpath', edge: '#8a5c36', blot: ['#d4a75e', '#ecc98a'], deco: ['cactus', 'rock', 'cactus', 'drybush'] },
    snow: { ground: 'snow', path: 'snowpath', edge: '#8396ab', blot: ['#dde8f3', '#ffffff'], deco: ['snowpine', 'snowpine', 'icerock', 'snowpine'] },
    volcano: { ground: 'ash', path: 'basalt', edge: '#2a1d19', blot: ['#3b322f', '#5a4c47'], deco: ['lavarock', 'deadtree', 'lavarock'] }
};
const MAPS = [
    { id: 'meadow', tier: 'beginner', name: 'Meadow Bend', theme: 'meadow', seed: 11, desc: 'A long, gentle road. Perfect for learning.',
        paths: [[[-30, 110], [200, 110], [200, 460], [440, 460], [440, 140], [700, 140], [700, 470], [860, 470], [860, 290], [990, 290]]] },
    { id: 'spiral', tier: 'beginner', name: 'Sunny Spiral', theme: 'meadow', seed: 17, desc: 'Balloons spiral inward to the center cave.',
        paths: [[[-30, 80], [880, 80], [880, 520], [90, 520], [90, 230], [720, 230], [720, 380], [280, 380]]] },
    { id: 'pond', tier: 'beginner', name: 'Pond Park', theme: 'meadow', seed: 23, desc: 'The road loops around a pond. Try a Gunboat!',
        paths: [[[-30, 140], [240, 140], [240, 480], [720, 480], [720, 120], [990, 120]]],
        blocks: [{ k: 'water', x: 480, y: 300, rx: 150, ry: 100 }] },
    { id: 'switch', tier: 'intermediate', name: 'Switchback Pass', theme: 'autumn', seed: 29, desc: 'Tight zig-zags reward towers in the middle.',
        paths: [[[-30, 520], [140, 520], [140, 90], [320, 90], [320, 510], [500, 510], [500, 90], [680, 90], [680, 510], [850, 510], [850, 300], [990, 300]]] },
    { id: 'woods', tier: 'intermediate', name: 'Autumn Woods', theme: 'autumn', seed: 31, desc: 'A stepped trail past a woodland pond.',
        paths: [[[-30, 300], [180, 300], [180, 90], [400, 90], [400, 300], [600, 300], [600, 510], [800, 510], [800, 200], [990, 200]]],
        blocks: [{ k: 'water', x: 300, y: 470, rx: 110, ry: 70 }] },
    { id: 'frost', tier: 'intermediate', name: 'Frosty Lake', theme: 'snow', seed: 37, desc: 'Icy loops end at a cave in the glacier.',
        paths: [[[480, -30], [480, 140], [160, 140], [160, 460], [800, 460], [800, 140], [620, 140], [620, 300], [330, 300]]],
        blocks: [{ k: 'ice', x: 880, y: 300, rx: 55, ry: 90 }] },
    { id: 'canyon', tier: 'advanced', name: 'Canyon Run', theme: 'desert', seed: 47, desc: 'Short and direct. Spend wisely.',
        paths: [[[-30, 300], [280, 300], [280, 130], [640, 130], [640, 470], [990, 470]]] },
    { id: 'dunes', tier: 'advanced', name: 'Dune Hook', theme: 'desert', seed: 53, desc: 'A quick hook through the dunes past an oasis.',
        paths: [[[990, 520], [620, 520], [620, 120], [160, 120], [160, 420], [420, 420], [420, 270]]],
        blocks: [{ k: 'water', x: 820, y: 230, rx: 90, ry: 60 }] },
    { id: 'lava', tier: 'advanced', name: 'Lava Rift', theme: 'volcano', seed: 59, desc: 'Lava pools leave little room to build.',
        paths: [[[-30, 120], [340, 120], [340, 480], [620, 480], [620, 120], [990, 120]]],
        blocks: [{ k: 'lava', x: 480, y: 270, rx: 80, ry: 110 }, { k: 'lava', x: 160, y: 380, rx: 110, ry: 80 }, { k: 'lava', x: 810, y: 390, rx: 110, ry: 90 }] },
    { id: 'twin', tier: 'expert', name: 'Twin Rivers', theme: 'meadow', seed: 61, desc: 'Two separate roads. Balloons take turns on each.',
        paths: [[[-30, 130], [560, 130], [560, 250], [990, 250]], [[-30, 470], [400, 470], [400, 360], [990, 360]]],
        blocks: [{ k: 'water', x: 780, y: 110, rx: 120, ry: 60 }, { k: 'water', x: 200, y: 300, rx: 110, ry: 55 }] },
    { id: 'cross', tier: 'expert', name: 'Crossroads', theme: 'autumn', seed: 67, cash: -600, desc: 'The road crosses itself. Short and busy.',
        paths: [[[-30, 300], [640, 300], [640, 110], [460, 110], [460, 520], [990, 520]]] },
    { id: 'last', tier: 'expert', name: 'Last Stand', theme: 'volcano', seed: 71, desc: 'Two short entrances merge into one. Brutal.',
        paths: [[[-30, 170], [460, 170], [460, 300], [990, 300]], [[-30, 440], [460, 440], [460, 300], [990, 300]]],
        blocks: [{ k: 'lava', x: 220, y: 305, rx: 150, ry: 55 }, { k: 'lava', x: 770, y: 470, rx: 120, ry: 60 }] }
];
/* Per-tier start-cash bonus keeps difficulty climbing evenly (see balance notes in the SRD). */
const TIER_CASH = { beginner: 300, intermediate: 150, advanced: 0, expert: 0 };
const DIFF = {
    easy: { name: 'Easy', lives: 200, cash: 650, costMul: 0.85, end: 30, medal: 'bronze', note: '200 lives · cheaper towers · 30 rounds' },
    medium: { name: 'Medium', lives: 150, cash: 650, costMul: 1.00, end: 40, medal: 'silver', note: '150 lives · normal prices · 40 rounds' },
    hard: { name: 'Hard', lives: 100, cash: 650, costMul: 1.08, end: 50, medal: 'gold', note: '100 lives · pricier towers · 50 rounds' }
};
const MODES = {
    standard: { name: 'Standard', desc: 'The normal game. Wins earn medals.' },
    halfcash: { name: 'Half Cash', desc: 'Start with half the cash. Pops and round bonuses pay half.' },
    primary: { name: 'Primary Only', desc: 'Only Dart, Tack, Bomb and Frost towers.', towers: ['dart', 'tack', 'bomb', 'frost'] },
    notier3: { name: 'No Tier 3', desc: 'Upgrades stop at tier 2, so no abilities.' },
    reverse: { name: 'Reverse', desc: 'Balloons travel the road backwards.' }
};
const CHALLENGES = ['halfcash', 'primary', 'notier3', 'reverse'];
/* ---------- Player levels ---------- */
const xpForLevel = (L) => 250 * (L - 1) * L; // total XP needed to reach level L
const TIER3_LEVEL = 3; // tier-3 upgrades unlock at this level
/** Cash paid for finishing round r */
const roundBonus = (r) => 150 + 12 * Math.min(r, 50);
const XP = { perRound: 15, perPops: 20, win: 500, challengeWin: 300, daily: 400 };
/* ---------- Balloons ---------- */
const BASE_SPEED = 62; // px per second for Red
const BT = {
    red: { name: 'Red', hp: 1, spd: 1.0, col: '#e53935', kids: [], r: 11 },
    blue: { name: 'Blue', hp: 1, spd: 1.4, col: '#1e88e5', kids: ['red'], r: 11.5 },
    green: { name: 'Green', hp: 1, spd: 1.8, col: '#43a047', kids: ['blue'], r: 12 },
    yellow: { name: 'Yellow', hp: 1, spd: 2.6, col: '#fdd835', kids: ['green'], r: 12.5 },
    pink: { name: 'Pink', hp: 1, spd: 3.0, col: '#f06292', kids: ['yellow'], r: 13 },
    black: { name: 'Black', hp: 1, spd: 1.8, col: '#263238', kids: ['pink', 'pink'], r: 9, imm: ['explosive'] },
    white: { name: 'White', hp: 1, spd: 2.0, col: '#eceff1', kids: ['pink', 'pink'], r: 9, imm: ['freeze'] },
    lead: { name: 'Lead', hp: 1, spd: 1.0, col: '#90a4ae', kids: ['black', 'black'], r: 13, imm: ['sharp'] },
    zebra: { name: 'Zebra', hp: 1, spd: 1.8, col: '#263238', kids: ['black', 'white'], r: 13, imm: ['explosive', 'freeze'] },
    rainbow: { name: 'Rainbow', hp: 1, spd: 2.2, col: '#ab47bc', kids: ['zebra', 'zebra'], r: 14 },
    ceramic: { name: 'Ceramic', hp: 10, spd: 2.5, col: '#a1714f', kids: ['rainbow', 'rainbow'], r: 15 },
    blimp: { name: 'Blimp', hp: 200, spd: 1.0, col: '#1e63c4', kids: ['ceramic', 'ceramic', 'ceramic', 'ceramic'], r: 30, blimp: true },
    brute: { name: 'Brute Blimp', hp: 700, spd: 0.6, col: '#c62828', kids: ['blimp', 'blimp', 'blimp', 'blimp'], r: 40, blimp: true },
    boss: { name: 'Colossus', hp: 100, spd: 0.4, col: '#7b1fa2', kids: [], r: 34, blimp: true, boss: true }
};
const REGROW_CHAIN = ['red', 'blue', 'green', 'yellow', 'pink'];
const REGROW_TIME = 2.5; // seconds without damage before a regrow balloon grows a layer
const RBE = {};
(function calc() { const f = (t) => RBE[t] || (RBE[t] = BT[t].hp + BT[t].kids.reduce((s, k) => s + f(k), 0)); Object.keys(BT).forEach(f); })();
/* Boss (Colossus) every 10 rounds: health, and what it spawns at 75/50/25% and on death */
function bossHp(r) { const t = [0, 100, 350, 650, 2000, 5500][Math.min(5, Math.floor(r / 10))]; return r > 50 ? Math.round(5500 * (1 + (r - 50) * 0.08)) : t; }
function bossMinion(r) { return r <= 10 ? 'yellow' : r <= 20 ? 'black' : r <= 30 ? 'zebra' : r <= 40 ? 'rainbow' : r <= 50 ? 'ceramic' : 'blimp'; }
/* ---------- Rounds: "<count> <prefix><type> <gap seconds>"
   prefixes (any order): c = camo, r = regrow (red–pink only), f = fortified (lead, ceramic, blimps) ---------- */
const ROUNDS = [null,
    '20 red .9', '35 red .55', '25 red .5, 6 blue .9', '30 red .4, 15 blue .7', '10 red .5, 25 blue .55',
    '15 red .4, 15 blue .5, 5 green .9', '20 red .35, 25 blue .45, 4 green .8', '20 blue .4, 14 green .6', '30 green .45', '60 blue .2',
    '10 yellow .9, 20 green .4, 10 blue .3', '15 blue .3, 20 green .4, 8 yellow .7', '50 blue .2, 23 green .35', '50 red .15, 20 green .3, 10 yellow .5, 9 pink .8', '20 green .3, 12 yellow .5, 12 pink .6',
    '40 green .25, 8 yellow .4, 6 black 1', '12 yellow .4, 12 pink .5, 8 white .9', '80 green .14', '10 lead 1.2, 15 yellow .4', '6 black .8, 6 white .8, 20 pink .3',
    '40 pink .25', '16 white .5, 16 black .5', '7 zebra 1.2, 10 pink .3', '20 pink .3, 10 cgreen .6', '10 rainbow 1, 20 yellow .2',
    '20 zebra .7, 6 lead .9, 15 rgreen .3', '60 pink .12, 30 black .3, 30 white .3', '12 lead .6, 8 cpink .5, 12 ryellow .3', '16 rainbow .6, 30 ryellow .15', '6 ceramic 1.2, 20 rainbow .5',
    '8 zebra .5, 8 cblack .5, 6 ceramic 1.1, 10 rpink .35', '15 black .3, 15 white .3, 8 rainbow .5, 8 ceramic 1', '30 cyellow .2, 6 crainbow .8, 20 rpink .2', '15 lead .4, 15 ceramic .8, 6 flead .8', '35 rainbow .3, 10 ceramic .6, 20 crpink .2',
    '30 ceramic .6', '20 czebra .4, 20 ceramic .5, 10 crainbow .5', '40 ceramic .45, 15 clead .5, 6 fceramic 1', '15 crainbow .3, 40 ceramic .35', '20 ceramic .5, 1 blimp 1',
    '60 ceramic .3, 15 crainbow .2', '2 blimp 3, 20 rainbow .25, 8 fceramic .6', '50 ceramic .25, 3 blimp 3', '40 czebra .2, 4 blimp 2.5, 30 crpink .1', '60 ceramic .2, 30 cceramic .4',
    '6 blimp 2, 30 crainbow .15, 12 fceramic .4', '70 cceramic .25', '8 blimp 1.6, 40 ceramic .2', '120 ceramic .12, 6 blimp 1.4, 2 fblimp 3', '1 brute 1, 8 blimp 1.5, 40 cceramic .2'
];
function parseRound(str) {
    return str.split(',').map(s => {
        const [n, t, gap] = s.trim().split(/\s+/);
        let type = t;
        const g: { count: number; type: string; gap: number; camo: boolean; regrow?: boolean; fort?: boolean } = { count: +n, type: t, gap: +gap, camo: false };
        while (!BT[type] && /^[crf]/.test(type)) {
            if (type[0] === 'c')
                g.camo = true;
            else if (type[0] === 'r')
                g.regrow = true;
            else
                g.fort = true;
            type = type.slice(1);
        }
        g.type = type;
        return g;
    });
}
function roundGroups(r) {
    let groups;
    if (r < ROUNDS.length)
        groups = parseRound(ROUNDS[r]);
    else {
        const k = r - 50; // freeplay
        groups = [{ count: 30 + k * 2, type: 'ceramic', gap: .18, camo: true, fort: k > 5 },
            { count: 6 + k, type: 'blimp', gap: 1.2, camo: false, fort: k > 10 },
            { count: 1 + Math.floor(k / 5), type: 'brute', gap: 4, camo: false }];
    }
    if (r % 10 === 0)
        groups.unshift({ count: 1, type: 'boss', gap: 1, camo: false });
    return groups;
}
/* ---------- Towers ----------
   Damage types: sharp (not lead), explosive (not black/zebra), freeze (not white/zebra/blimps), energy, fire, normal. */
const TD = {
    dart: { name: 'Dart Tower', cost: 200, r: 16, color: '#a1887f', unlock: 1, desc: 'Fires a sharp dart at one balloon. Cheap and reliable.',
        ability: { name: 'Rapid Fire', desc: 'Triple attack speed for 5 seconds.', cd: 40 },
        base: { range: 125, rate: 0.95, dmg: 1, pierce: 3, dtype: 'sharp', speed: 540, count: 1, spread: 0, proj: 'dart', camo: false, life: 0 },
        paths: [
            [{ n: 'Sharp Darts', c: 140, d: '+2 pierce', a: s => { s.pierce += 2; } },
                { n: 'Razor Darts', c: 260, d: '+3 pierce, +1 damage', a: s => { s.pierce += 3; s.dmg += 1; } },
                { n: 'Boulder Ball', c: 1400, d: 'Huge rolling ball: 3 damage, 30 pierce, pops lead', a: s => { s.proj = 'ball'; s.dmg = 3; s.pierce = 30; s.dtype = 'normal'; s.speed = 360; s.life = 1.5; s.rate *= 1.1; } }],
            [{ n: 'Quick Draw', c: 120, d: 'Attacks 25% faster', a: s => { s.rate *= 0.75; } },
                { n: 'Triple Shot', c: 300, d: 'Fires 3 darts at once', a: s => { s.count = 3; s.spread = 0.22; } },
                { n: 'Eagle Eye', c: 650, d: '+60 range, camo detection, 30% faster', a: s => { s.range += 60; s.camo = true; s.rate *= 0.7; } }]
        ] },
    tack: { name: 'Tack Spinner', cost: 280, r: 16, color: '#ec407a', unlock: 1, desc: 'Sprays tacks in every direction when balloons come close.',
        ability: { name: 'Nova Burst', desc: 'Deal 4 damage to every balloon within 200 px.', cd: 35 },
        base: { range: 85, rate: 1.1, dmg: 1, pierce: 2, dtype: 'sharp', speed: 430, count: 8, proj: 'tack', camo: false, life: 0 },
        paths: [
            [{ n: 'More Tacks', c: 180, d: 'Shoots 12 tacks', a: s => { s.count = 12; } },
                { n: 'Blade Ring', c: 520, d: 'Spinning blades: +2 pierce, +1 damage', a: s => { s.proj = 'blade'; s.pierce += 2; s.dmg += 1; } },
                { n: 'Flame Ring', c: 2200, d: 'Constant ring of fire burns everything nearby, pops lead', a: s => { s.mode = 'ring'; s.dmg = 2; s.rate = 0.25; s.dtype = 'fire'; } }],
            [{ n: 'Fast Spin', c: 150, d: 'Attacks 30% faster', a: s => { s.rate *= 0.7; } },
                { n: 'Faster Spin', c: 300, d: 'Attacks 30% faster again', a: s => { s.rate *= 0.7; } },
                { n: 'Long Reach', c: 700, d: '+35 range, +2 pierce', a: s => { s.range += 35; s.pierce += 2; } }]
        ] },
    bomb: { name: 'Bomb Cannon', cost: 525, r: 18, color: '#546e7a', unlock: 1, desc: 'Fires bombs that pop whole groups. Cannot pop black or zebra.',
        ability: { name: 'Blimp Wrecker', desc: 'Hit the toughest balloon on the map for 1,200 damage.', cd: 45 },
        base: { range: 140, rate: 1.3, dmg: 1, pierce: 24, dtype: 'explosive', speed: 380, proj: 'bomb', blast: 42, camo: false, bm: 1, cluster: 0, life: 0 },
        paths: [
            [{ n: 'Bigger Bombs', c: 350, d: '+18 blast radius, +10 pierce', a: s => { s.blast += 18; s.pierce += 10; } },
                { n: 'Heavy Bombs', c: 800, d: 'Explosions deal 3 damage', a: s => { s.dmg = 3; } },
                { n: 'Blimp Buster', c: 3000, d: 'Missiles deal 8x damage to blimps, +1 damage', a: s => { s.bm = 8; s.dmg += 1; s.proj = 'missile'; s.speed = 520; } }],
            [{ n: 'Fast Reload', c: 250, d: 'Reloads 25% faster', a: s => { s.rate *= 0.75; } },
                { n: 'Long Barrel', c: 400, d: '+50 range', a: s => { s.range += 50; } },
                { n: 'Cluster Bombs', c: 1500, d: 'Each explosion releases 6 mini-bombs', a: s => { s.cluster = 6; } }]
        ] },
    sniper: { name: 'Sniper Post', cost: 350, r: 16, color: '#6b8e23', unlock: 1, desc: 'Hits any balloon on the map, instantly. Pops lead.',
        ability: { name: 'Airstrike', desc: 'Bomb the 3 toughest balloons: 30 damage in a wide blast.', cd: 45 },
        base: { range: 9999, rate: 1.6, dmg: 2, mode: 'hitscan', camo: false, bm: 1 },
        paths: [
            [{ n: 'Full Metal', c: 350, d: '4 damage per shot', a: s => { s.dmg = 4; } },
                { n: 'Point Five', c: 1200, d: '7 damage per shot', a: s => { s.dmg = 7; } },
                { n: 'Elite Marksman', c: 3500, d: '18 damage, double damage to blimps', a: s => { s.dmg = 18; s.bm = 2; } }],
            [{ n: 'Night Scope', c: 300, d: 'Camo detection', a: s => { s.camo = true; } },
                { n: 'Fast Bolt', c: 500, d: 'Fires 40% faster', a: s => { s.rate *= 0.6; } },
                { n: 'Semi-Auto', c: 2800, d: 'Fires 3x faster', a: s => { s.rate /= 3; } }]
        ] },
    frost: { name: 'Frost Tower', cost: 400, r: 16, color: '#4fc3f7', unlock: 2, desc: 'Freezes nearby balloons in place. No effect on white, zebra or blimps.',
        ability: { name: 'Absolute Zero', desc: 'Freeze every balloon on screen for 3 s and slow blimps for 4 s.', cd: 50 },
        base: { range: 80, rate: 2.2, freeze: 1.1, dmg: 0, mode: 'pulse', camo: false, permaslow: 0, blimpSlow: 0, shatter: 0 },
        paths: [
            [{ n: 'Lasting Chill', c: 220, d: 'Balloons stay 40% slower after thawing', a: s => { s.permaslow = 0.4; } },
                { n: 'Deep Freeze', c: 450, d: 'Freezing pops 1 layer and lasts longer', a: s => { s.dmg = 1; s.freeze += 0.6; } },
                { n: 'Arctic Core', c: 1800, d: '+40 range, camo detection, slows blimps 50%, 2 damage', a: s => { s.range += 40; s.camo = true; s.blimpSlow = 0.5; s.dmg = 2; } }],
            [{ n: 'Wider Field', c: 200, d: '+20 range', a: s => { s.range += 20; } },
                { n: 'Rapid Chill', c: 450, d: 'Pulses 35% faster', a: s => { s.rate *= 0.65; } },
                { n: 'Shatter Pulse', c: 1300, d: 'Each pulse deals 2 damage to everything in range, incl. white and blimps', a: s => { s.shatter = 2; } }]
        ] },
    signal: { name: 'Signal Tower', cost: 500, r: 16, color: '#26a69a', unlock: 3, support: true, desc: 'Doesn\'t attack. Boosts every tower inside its aura.',
        ability: { name: 'Rally', desc: 'Towers in the aura attack twice as fast for 6 seconds.', cd: 50 },
        base: { mode: 'aura', aura: 110, buffRange: 0, buffRate: 0, buffDmg: 0, buffPierce: 0, buffCamo: false },
        paths: [
            [{ n: 'Radar Dish', c: 350, d: 'Towers in the aura detect camo', a: s => { s.buffCamo = true; } },
                { n: 'Overclock', c: 900, d: 'Towers in the aura attack 20% faster', a: s => { s.buffRate += 0.2; } },
                { n: 'Command Center', c: 3200, d: '+1 damage and another 15% speed to towers in the aura', a: s => { s.buffDmg += 1; s.buffRate += 0.15; } }],
            [{ n: 'Big Antenna', c: 250, d: '+40 aura size', a: s => { s.aura += 40; } },
                { n: 'Spotter', c: 600, d: 'Towers in the aura get +15% range', a: s => { s.buffRange += 0.15; } },
                { n: 'Supply Drop', c: 2000, d: 'Towers in the aura get +2 pierce and +1 damage', a: s => { s.buffPierce += 2; s.buffDmg += 1; } }]
        ] },
    tesla: { name: 'Tesla Coil', cost: 750, r: 17, color: '#7e57c2', unlock: 4, desc: 'Chain lightning jumps between balloons. Detects camo.',
        ability: { name: 'Overload', desc: 'Triple attack speed and +5 chain jumps for 6 seconds.', cd: 45 },
        base: { range: 130, rate: 1.1, dmg: 1, chains: 5, jump: 85, mode: 'chain', camo: true, bolts: 1 },
        paths: [
            [{ n: 'More Arcs', c: 500, d: '+4 chain jumps', a: s => { s.chains += 4; } },
                { n: 'Overcharge', c: 1100, d: '+1 damage, +4 chain jumps', a: s => { s.dmg += 1; s.chains += 4; } },
                { n: 'Storm Core', c: 4000, d: 'Fires 3 bolts at once, 3 damage', a: s => { s.bolts = 3; s.dmg = 3; } }],
            [{ n: 'Capacitor', c: 400, d: 'Fires 30% faster', a: s => { s.rate *= 0.7; } },
                { n: 'Long Arc', c: 600, d: '+40 range, longer jumps', a: s => { s.range += 40; s.jump += 40; } },
                { n: 'Pulse Field', c: 2500, d: 'Fires 2x faster', a: s => { s.rate *= 0.5; } }]
        ] },
    boat: { name: 'Gunboat', cost: 450, r: 17, color: '#8d6e63', unlock: 5, water: true, desc: 'Built on water only. Fires cannonballs that pop lead.',
        ability: { name: 'Broadside', desc: 'Fire 24 cannonballs in every direction.', cd: 30 },
        base: { range: 150, rate: 1.0, dmg: 1, pierce: 3, dtype: 'normal', speed: 420, count: 1, spread: 0, proj: 'cannonball', camo: false, life: 0, income: 0, bm: 1 },
        paths: [
            [{ n: 'Grape Shot', c: 300, d: 'Fires 4 shots in a spread', a: s => { s.count = 4; s.spread = 0.18; } },
                { n: 'Heavy Shot', c: 700, d: '+1 damage, +3 pierce', a: s => { s.dmg += 1; s.pierce += 3; } },
                { n: 'Torpedo Bay', c: 2600, d: 'Torpedoes: 6 damage, 4x vs blimps', a: s => { s.proj = 'torpedo'; s.dmg = 6; s.bm = 4; s.pierce = 4; s.speed = 480; } }],
            [{ n: 'Crow\'s Nest', c: 250, d: 'Camo detection, +30 range', a: s => { s.camo = true; s.range += 30; } },
                { n: 'Fast Crew', c: 500, d: 'Fires 30% faster', a: s => { s.rate *= 0.7; } },
                { n: 'Trade Ship', c: 1800, d: 'Also earns $200 per round', a: s => { s.income += 200; } }]
        ] },
    mine: { name: 'Gold Mine', cost: 900, r: 18, color: '#ffb300', unlock: 6, support: true, desc: 'Doesn\'t attack. Earns cash at the end of every round.',
        ability: { name: 'Payday', desc: 'Collect 1.5 rounds of this mine\'s income right now.', cd: 90 },
        base: { income: 120, mode: 'mine', popBonus: 0, vault: 0 },
        paths: [
            [{ n: 'Richer Vein', c: 500, d: '+$80 per round', a: s => { s.income += 80; } },
                { n: 'Deep Shaft', c: 1200, d: '+$150 per round', a: s => { s.income += 150; } },
                { n: 'Mother Lode', c: 4000, d: '+$500 per round', a: s => { s.income += 500; } }],
            [{ n: 'Pop Bonus', c: 600, d: '+10% cash from pops (all mines max +30%)', a: s => { s.popBonus = 0.1; } },
                { n: 'Bigger Carts', c: 900, d: '+$100 per round', a: s => { s.income += 100; } },
                { n: 'Bank Vault', c: 3000, d: 'Earns 8% interest on your cash each round (max $1000)', a: s => { s.vault = 0.08; } }]
        ] }
};
const SHOP = ['dart', 'tack', 'bomb', 'sniper', 'frost', 'signal', 'tesla', 'boat', 'mine'];

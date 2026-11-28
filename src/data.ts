/* Balloon Defense — game data: maps, modes, difficulties, balloons, towers, rounds, titles, avatars.
   Edit these tables to rebalance the game; no other file needs to change. */
const VERSION = '5.3';
const W = 960, H = 600, TAU = Math.PI * 2;
/* ---------- Tile grid (40 x 25 tiles of 24 px) ---------- */
const TILE = 24, COLS = W / TILE, ROWS = H / TILE;
const ROAD_HALF = 24; // half the road width in px: straight roads are exactly 2 tiles wide, centred on a grid line
/* ---------- Map tiers & themes ---------- */
const TIERS = [
    { id: 'beginner', name: 'Beginner', color: '#6bcb77' },
    { id: 'intermediate', name: 'Intermediate', color: '#4d96ff' },
    { id: 'advanced', name: 'Advanced', color: '#ffb74d' },
    { id: 'expert', name: 'Expert', color: '#ff6b6b' }
];
/* ambient: falling particles drawn over the field (high effects only) */
const THEMES = {
    meadow: { ground: 'grass', path: 'dirt', edge: '#8a6a45', blot: ['#69a537', '#86c24f'], deco: ['tree', 'tree', 'bush', 'flowers', 'rock', 'pine'], frame: ['tree', 'bush', 'pine', 'bush'], litter: ['#f8bbd0', '#fff59d', '#ffffff'], ambient: 'fireflies' },
    autumn: { ground: 'autumn', path: 'dirt', edge: '#7a5a3a', blot: ['#8d9a3d', '#b2b85c'], deco: ['autumntree', 'autumntree', 'bush', 'rock', 'mushroom', 'tree'], frame: ['autumntree', 'bush', 'autumntree'], litter: ['#e65100', '#ff8f00', '#c62828'], ambient: 'leaves' },
    desert: { ground: 'sand', path: 'sandpath', edge: '#8a5c36', blot: ['#d4a75e', '#ecc98a'], deco: ['cactus', 'rock', 'cactus', 'drybush'], frame: ['rock', 'boulder', 'drybush', 'cactus'], litter: ['#a1887f', '#bcaaa4'], ambient: 'dust' },
    snow: { ground: 'snow', path: 'snowpath', edge: '#8396ab', blot: ['#dde8f3', '#ffffff'], deco: ['snowpine', 'snowpine', 'icerock', 'snowpine'], frame: ['snowpine', 'icerock', 'snowpine'], litter: ['#b0bec5', '#ffffff'], ambient: 'snow' },
    volcano: { ground: 'ash', path: 'basalt', edge: '#2a1d19', blot: ['#3b322f', '#5a4c47'], deco: ['lavarock', 'deadtree', 'lavarock'], frame: ['lavarock', 'deadtree', 'lavarock'], litter: ['#ff7043', '#5d4037'], ambient: 'embers' },
    jungle: { ground: 'jungle', path: 'stone', edge: '#4e5a3a', blot: ['#2f6b2a', '#3f8a34'], deco: ['jungletree', 'jungletree', 'fern', 'palm', 'bush', 'rock'], frame: ['jungletree', 'fern', 'palm', 'jungletree'], litter: ['#ffeb3b', '#e91e63', '#ff9800'], ambient: 'fireflies' },
    coast: { ground: 'sand', path: 'dirt', edge: '#8a6a45', blot: ['#e2c48a', '#f0d9a8'], deco: ['palm', 'palm', 'crate', 'rock', 'drybush'], frame: ['palm', 'drybush', 'rock', 'palm'], litter: ['#ffffff', '#ffccbc'], ambient: 'none' }
};
/* Scenery: tall pieces block line of sight and can be cleared for cash; low pieces don't block shots. */
const TALL = { tree: 1, autumntree: 1, pine: 1, snowpine: 1, deadtree: 1, rock: 1, icerock: 1, lavarock: 1, cactus: 1, palm: 1, jungletree: 1, crate: 1, stall: 1, boulder: 1 };
const WALKABLE = { flowers: 1, fern: 1 }; // low scenery you can build over
/* Path helpers for curved maps */
function ring(cx, cy, r, n = 24) {
    const out = [];
    for (let i = 0; i <= n; i++) {
        const a = Math.PI / 2 - i * TAU / n;
        out.push([Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a))]);
    }
    return out;
}
/* Water streams are chains of overlapping ellipses */
function stream(pts, rx, ry) { return pts.map(([x, y]) => ({ k: 'water', x, y, rx, ry })); }
const MAPS: any[] = [
    { id: 'meadow', tier: 'beginner', name: 'Meadow Bend', theme: 'meadow', seed: 11, desc: 'A long, gentle road. Perfect for learning.',
        paths: [[[-30, 110], [200, 110], [200, 460], [440, 460], [440, 140], [700, 140], [700, 470], [860, 470], [860, 290], [990, 290]]] },
    { id: 'spiral', tier: 'beginner', name: 'Sunny Spiral', theme: 'meadow', seed: 17, desc: 'Balloons spiral inward to the center cave.',
        paths: [[[-30, 80], [880, 80], [880, 520], [90, 520], [90, 230], [720, 230], [720, 380], [280, 380]]] },
    { id: 'pond', tier: 'beginner', name: 'Pond Park', theme: 'meadow', seed: 23, desc: 'The road loops around a pond. Try a Gunboat!',
        paths: [[[-30, 140], [240, 140], [240, 480], [720, 480], [720, 120], [990, 120]]],
        blocks: [{ k: 'water', x: 480, y: 300, rx: 150, ry: 100 }] },
    { id: 'leafloops', tier: 'beginner', name: 'Leaf Loops', theme: 'autumn', seed: 101, desc: 'Two looping rings, each around its own little pond.', v4: true,
        paths: [[[-30, 450], ...ring(290, 300, 150), ...ring(670, 300, 150), [990, 450]]],
        blocks: [{ k: 'water', x: 290, y: 300, rx: 52, ry: 46 }, { k: 'water', x: 670, y: 300, rx: 52, ry: 46 }] },
    { id: 'stonegarden', tier: 'beginner', name: 'Stone Garden', theme: 'meadow', path: 'stone', seed: 107, desc: 'A stone path with two square loops and open lawns.', v4: true,
        paths: [[[-30, 150], [330, 150], [330, 330], [180, 330], [180, 60], [620, 60], [620, 420], [800, 420], [800, 250], [520, 250], [520, 540], [990, 540]]] },
    { id: 'switch', tier: 'intermediate', name: 'Switchback Pass', theme: 'autumn', seed: 29, desc: 'Tight zig-zags reward towers in the middle.',
        paths: [[[-30, 520], [140, 520], [140, 90], [320, 90], [320, 510], [500, 510], [500, 90], [680, 90], [680, 510], [850, 510], [850, 300], [990, 300]]] },
    { id: 'woods', tier: 'intermediate', name: 'Autumn Woods', theme: 'autumn', seed: 31, desc: 'A stepped trail past a woodland pond.',
        paths: [[[-30, 300], [180, 300], [180, 90], [400, 90], [400, 300], [600, 300], [600, 510], [800, 510], [800, 200], [990, 200]]],
        blocks: [{ k: 'water', x: 300, y: 470, rx: 110, ry: 70 }] },
    { id: 'frost', tier: 'intermediate', name: 'Frosty Lake', theme: 'snow', seed: 37, desc: 'Icy loops end at a cave in the glacier.',
        paths: [[[480, -30], [480, 140], [160, 140], [160, 460], [800, 460], [800, 140], [620, 140], [620, 300], [330, 300]]],
        blocks: [{ k: 'ice', x: 880, y: 300, rx: 55, ry: 90 }] },
    { id: 'market', tier: 'intermediate', name: 'Market Steps', theme: 'jungle', seed: 113, desc: 'Stone steps between market stalls. Stalls block straight shots.', v4: true,
        paths: [[[-30, 90], [160, 90], [160, 230], [320, 230], [320, 370], [480, 370], [480, 510], [640, 510], [640, 370], [800, 370], [800, 230], [990, 230]]],
        props: [{ type: 'stall', x: 262, y: 138 }, { type: 'stall', x: 420, y: 288 }, { type: 'crate', x: 560, y: 430 }, { type: 'stall', x: 718, y: 290 }, { type: 'stall', x: 878, y: 146 },
            { type: 'crate', x: 238, y: 318 }, { type: 'crate', x: 398, y: 452 }, { type: 'stall', x: 80, y: 300 }] },
    { id: 'millcreek', tier: 'intermediate', name: 'Mill Creek', theme: 'meadow', seed: 127, desc: 'The road crosses the creek twice on wooden bridges.', v4: true,
        paths: [[[-30, 140], [830, 140], [830, 460], [210, 460], [210, 630]]],
        blocks: [...stream([[610, -20], [592, 60], [570, 140], [548, 220], [528, 300], [508, 380], [488, 460], [468, 540], [452, 620]], 50, 54), { k: 'water', x: 690, y: 300, rx: 66, ry: 86 }] },
    { id: 'canyon', tier: 'advanced', name: 'Canyon Run', theme: 'desert', seed: 47, desc: 'Short and direct. Spend wisely.',
        paths: [[[-30, 300], [280, 300], [280, 130], [640, 130], [640, 470], [990, 470]]] },
    { id: 'dunes', tier: 'advanced', name: 'Dune Hook', theme: 'desert', seed: 53, desc: 'A quick hook through the dunes past an oasis.',
        paths: [[[990, 520], [620, 520], [620, 120], [160, 120], [160, 420], [420, 420], [420, 270]]],
        blocks: [{ k: 'water', x: 820, y: 230, rx: 90, ry: 60 }] },
    { id: 'lava', tier: 'advanced', name: 'Lava Rift', theme: 'volcano', seed: 59, desc: 'Lava pools leave little room to build.',
        paths: [[[-30, 120], [340, 120], [340, 480], [620, 480], [620, 120], [990, 120]]],
        blocks: [{ k: 'lava', x: 480, y: 270, rx: 80, ry: 110 }, { k: 'lava', x: 160, y: 380, rx: 110, ry: 80 }, { k: 'lava', x: 810, y: 390, rx: 110, ry: 90 }] },
    { id: 'harbor', tier: 'advanced', name: 'Harbor Run', theme: 'coast', seed: 131, desc: 'A short shore road beside a huge harbour. Gunboat heaven.', v4: true,
        paths: [[[-30, 110], [290, 110], [290, 240], [690, 240], [690, 110], [990, 110]]],
        blocks: [{ k: 'water', x: 480, y: 640, rx: 600, ry: 335 }] },
    { id: 'quarry', tier: 'advanced', name: 'Quarry Switch', theme: 'desert', seed: 137, desc: 'Short switchbacks between tall rocks that block sight.', v4: true,
        paths: [[[330, -30], [330, 160], [640, 160], [640, 300], [330, 300], [330, 440], [640, 440], [640, 630]]],
        props: [{ type: 'boulder', x: 486, y: 230, s: 1.25 }, { type: 'boulder', x: 486, y: 370, s: 1.25 }, { type: 'boulder', x: 190, y: 232 }, { type: 'boulder', x: 790, y: 372 },
            { type: 'rock', x: 160, y: 500 }, { type: 'rock', x: 810, y: 110 }] },
    { id: 'twin', tier: 'expert', name: 'Twin Rivers', theme: 'meadow', seed: 61, desc: 'Two separate roads. Balloons take turns on each.',
        paths: [[[-30, 130], [560, 130], [560, 250], [990, 250]], [[-30, 470], [400, 470], [400, 360], [990, 360]]],
        blocks: [{ k: 'water', x: 780, y: 110, rx: 120, ry: 60 }, { k: 'water', x: 200, y: 300, rx: 110, ry: 55 }] },
    { id: 'cross', tier: 'expert', name: 'Crossroads', theme: 'autumn', seed: 67, cash: -600, desc: 'The road crosses itself. Short and busy.',
        paths: [[[-30, 300], [640, 300], [640, 110], [460, 110], [460, 520], [990, 520]]] },
    { id: 'last', tier: 'expert', name: 'Last Stand', theme: 'volcano', seed: 71, desc: 'Two short entrances merge into one. Brutal.',
        paths: [[[-30, 170], [460, 170], [460, 300], [990, 300]], [[-30, 440], [460, 440], [460, 300], [990, 300]]],
        blocks: [{ k: 'lava', x: 220, y: 305, rx: 150, ry: 55 }, { k: 'lava', x: 770, y: 470, rx: 120, ry: 60 }] },
    { id: 'figure8', tier: 'expert', name: 'Figure Eight', theme: 'autumn', seed: 139, cash: -300, desc: 'A short road that crosses itself right in the middle.', v4: true,
        paths: [[[-30, 150], [330, 150], [630, 450], [780, 450], [780, 150], [630, 150], [330, 450], [180, 450], [180, 630]]] },
    { id: 'threegates', tier: 'expert', name: 'Three Gates', theme: 'volcano', seed: 149, desc: 'Three short entrances merge before the exit.', v4: true,
        paths: [[[250, -30], [250, 200], [560, 200], [560, 300], [990, 300]], [[-30, 300], [990, 300]], [[250, 630], [250, 400], [560, 400], [560, 300], [990, 300]]],
        blocks: [{ k: 'lava', x: 110, y: 140, rx: 80, ry: 60 }, { k: 'lava', x: 110, y: 470, rx: 80, ry: 60 }, { k: 'lava', x: 790, y: 150, rx: 120, ry: 70 }, { k: 'lava', x: 790, y: 455, rx: 120, ry: 70 }] }
];
/* Per-tier start-cash bonus keeps difficulty climbing evenly. */
const TIER_CASH = { beginner: 300, intermediate: 150, advanced: 0, expert: 0 };
const DIFF = {
    // ramp = the round where balloon health starts climbing (+2% per round after it); lower = harder (Easy 80, Medium 70, Hard 60, Nightmare 70)
    easy: { name: 'Easy', lives: 150, cash: 650, costMul: 0.85, end: 40, ramp: 80, badge: 'easy', points: 100, note: '150 lives · cheaper towers · 40 rounds' },
    medium: { name: 'Medium', lives: 100, cash: 650, costMul: 1.00, end: 60, ramp: 70, badge: 'medium', points: 200, note: '100 lives · normal prices · 60 rounds' },
    hard: { name: 'Hard', lives: 60, cash: 650, costMul: 1.08, end: 80, ramp: 60, badge: 'hard', points: 300, note: '60 lives · pricier towers · 80 rounds' },
    nightmare: { name: 'Nightmare', lives: 1, cash: 650, costMul: 1.20, end: 100, ramp: 70, badge: 'nightmare', points: 500, note: '1 life · +20% prices · 100 rounds' }
};
const BADGE_COL = { easy: '#cd7f32', medium: '#b0bec5', hard: '#ffd54f', nightmare: '#ab47bc' };
const MODES = {
    standard: { name: 'Standard', desc: 'The normal game. Wins earn map badges.' },
    halfcash: { name: 'Half Cash', desc: 'Start with half the cash. Pops and round bonuses pay half.' },
    primary: { name: 'Primary Only', desc: 'Only Dart, Tack, Bomb and Frost towers.', towers: ['dart', 'tack', 'bomb', 'frost'] },
    notier3: { name: 'No Tier 3', desc: 'Upgrades stop at tier 2, so no abilities.' },
    reverse: { name: 'Reverse', desc: 'Balloons travel the road backwards.' },
    hero: { name: 'Heroes', desc: 'Bring one of four heroes. It levels up as you clear rounds and has two abilities (Z and X).' },
    worldboss: { name: 'World Boss', desc: 'The weekly World Boss. Deal as much damage as you can.', hidden: true }
};
const CHALLENGES = ['halfcash', 'primary', 'notier3', 'reverse'];
/* ---------- Player levels ---------- */
const xpForLevel = (L) => 250 * (L - 1) * L; // total XP needed to reach level L
/** Cash paid for finishing round r */
const roundBonus = (r) => 150 + 12 * Math.min(r, 50);
const XP = { perRound: 15, perPops: 20, win: 500, challengeWin: 300, daily: 400 };
/* ---------- Tower progression (XP per tower type) ---------- */
const TXP = { perPops: 20, perRound: 10 };
/** XP price to unlock tier 3, 4 and 5 of one upgrade path (tiers 1–2 are always free). */
const TIER_XP = { 3: 500, 4: 1500, 5: 4000 };
const PATH_MAX = 5, SECOND_MAX = 2; // one path to tier 5, a second to tier 2, the third stays closed
const ABILITY_TIER = 3; // tier that grants the ability; the next tier makes it stronger
const MAX_TOWER_LEVEL = 20;
const towerXpForLevel = (L) => 150 * (L - 1) * (L - 1); // total XP ever earned to reach tower level L
const PERKS = [
    { id: 'range', name: 'Range', per: '+2% range', max: 5 },
    { id: 'rate', name: 'Attack speed', per: '+2% attack speed', max: 5 },
    { id: 'cost', name: 'Discount', per: '−2% cost', max: 5 },
    { id: 'pierce', name: 'Pierce', per: '+1 pierce', max: 3 },
    { id: 'cd', name: 'Ability recharge', per: '+5% ability recharge', max: 4 }
];
/** The Gold Mine doesn't attack, so range, attack speed and pierce did nothing for it: it has its own skills. */
const MINE_PERKS = [
    { id: 'income', name: 'Income', per: '+3% gold every 10 s', max: 5 },
    { id: 'vault', name: 'Vault size', per: '+10% interest cap', max: 5 },
    { id: 'cost', name: 'Discount', per: '−2% cost', max: 5 },
    { id: 'cd', name: 'Payday recharge', per: '+5% ability recharge', max: 4 }
];
/** The Sniper Post already sees the whole map and hits one balloon at a time, so range and pierce did nothing for it (5.1). */
const SNIPER_PERKS = [
    { id: 'dmg', name: 'Damage', per: '+5% damage', max: 5 },
    { id: 'rate', name: 'Attack speed', per: '+2% attack speed', max: 5 },
    { id: 'cost', name: 'Discount', per: '−2% cost', max: 5 },
    { id: 'blimp', name: 'Blimp hunter', per: '+10% damage to blimps', max: 3 },
    { id: 'cd', name: 'Ability recharge', per: '+5% ability recharge', max: 4 }
];
/** The Signal Tower doesn't attack, so attack speed and pierce did nothing for it: its skills boost the aura instead (5.1.2). */
const SIGNAL_PERKS = [
    { id: 'range', name: 'Aura size', per: '+2% aura size', max: 5 },
    { id: 'boost', name: 'Aura speed', per: '+2% attack speed to towers in the aura', max: 5 },
    { id: 'cost', name: 'Discount', per: '−2% cost', max: 5 },
    { id: 'rally', name: 'Rally time', per: '+0.5 s Rally duration', max: 4 },
    { id: 'cd', name: 'Rally recharge', per: '+5% ability recharge', max: 4 }
];
function perkList(type) { return type === 'mine' ? MINE_PERKS : type === 'sniper' ? SNIPER_PERKS : type === 'signal' ? SIGNAL_PERKS : PERKS; }
/* ---------- Titles (lifetime balloons popped) ---------- */
const TITLES = [
    { id: 'rookie', name: 'Rookie', pops: 0 },
    { id: 'popper', name: 'Popper', pops: 10000 },
    { id: 'pinmaster', name: 'Pin Master', pops: 100000 },
    { id: 'buster', name: 'Balloon Buster', pops: 500000 },
    { id: 'sweeper', name: 'Sky Sweeper', pops: 1000000 },
    { id: 'captain', name: 'Burst Captain', pops: 5000000 },
    { id: 'commander', name: 'Pop Commander', pops: 10000000 },
    { id: 'slayer', name: 'Slayer', pops: 50000000, border: 'slayer' },
    { id: 'warlord', name: 'Warlord', pops: 250000000, border: 'warlord' },
    { id: 'legend', name: 'Pop Legend', pops: 1000000000, border: 'legend' }
];
/* ---------- Avatars: 12 original cartoon animals x 2 styles ---------- */
const ANIMALS = [
    { id: 'fox', name: 'Fox', fur: '#ef7d32', inner: '#fff3e0', ear: 'point', nose: '#3e2723' },
    { id: 'cat', name: 'Cat', fur: '#9e9e9e', inner: '#f5f5f5', ear: 'point', nose: '#f06292', whiskers: true },
    { id: 'rabbit', name: 'Rabbit', fur: '#eeeeee', inner: '#ffffff', ear: 'long', nose: '#f48fb1' },
    { id: 'bear', name: 'Bear', fur: '#8d6e63', inner: '#d7b9a5', ear: 'round', nose: '#3e2723' },
    { id: 'panda', name: 'Panda', fur: '#fafafa', inner: '#ffffff', ear: 'round', earCol: '#263238', patches: '#263238', nose: '#263238' },
    { id: 'owl', name: 'Owl', fur: '#8d6e63', inner: '#ffe0b2', ear: 'tuft', beak: true },
    { id: 'penguin', name: 'Penguin', fur: '#37474f', inner: '#fafafa', ear: 'none', beak: true },
    { id: 'dog', name: 'Dog', fur: '#d7a86e', inner: '#fff3e0', ear: 'flop', earCol: '#8d5524', nose: '#3e2723' },
    { id: 'tiger', name: 'Tiger', fur: '#ffa726', inner: '#fff8e1', ear: 'round', stripes: true, nose: '#3e2723' },
    { id: 'raccoon', name: 'Raccoon', fur: '#90a4ae', inner: '#eceff1', ear: 'point', mask: '#37474f', nose: '#263238' },
    { id: 'deer', name: 'Deer', fur: '#b7835a', inner: '#f3dcc5', ear: 'leaf', antlers: true, nose: '#3e2723' },
    { id: 'frog', name: 'Frog', fur: '#7cb342', inner: '#dcedc8', ear: 'eyes', nose: null }
];
const AVATAR_BGS = [
    { id: 'sky', name: 'Sky', a: '#81d4fa', b: '#4fc3f7' },
    { id: 'sunset', name: 'Sunset', a: '#ffcc80', b: '#f06292' },
    { id: 'meadow', name: 'Meadow', a: '#c5e1a5', b: '#7cb342' },
    { id: 'ocean', name: 'Ocean', a: '#4dd0e1', b: '#1565c0' },
    { id: 'night', name: 'Night', a: '#3949ab', b: '#1a237e', dots: '#ffffff' },
    { id: 'candy', name: 'Candy', a: '#f8bbd0', b: '#ce93d8', stripes: '#ffffff' },
    { id: 'lemon', name: 'Lemon', a: '#fff59d', b: '#ffca28', dots: '#fff8e1' },
    { id: 'mint', name: 'Mint', a: '#b2dfdb', b: '#26a69a', stripes: '#e0f2f1' },
    { id: 'lava', name: 'Lava', a: '#ff8a65', b: '#b71c1c' },
    { id: 'slate', name: 'Slate', a: '#78909c', b: '#37474f' }
];
/* free: available from the start; others are earned */
const BORDERS: any[] = [
    { id: 'plain', name: 'Plain', free: true, col: '#eceff1', w: 4 },
    { id: 'wood', name: 'Wood', free: true, col: '#8d6e63', w: 6, dash: '' },
    { id: 'silver', name: 'Silver', free: true, col: '#b0bec5', w: 5, double: true },
    { id: 'sky', name: 'Sky', free: true, col: '#4fc3f7', w: 5 },
    { id: 'leaf', name: 'Leaf', free: true, col: '#66bb6a', w: 5, dots: '#c5e1a5' },
    { id: 'berry', name: 'Berry', free: true, col: '#ec407a', w: 5, dots: '#f8bbd0' },
    { id: 'dashed', name: 'Dashed', free: true, col: '#ffca28', w: 4, dash: '6 4' },
    { id: 'rope', name: 'Rope', free: true, col: '#d7a86e', w: 6, dash: '3 2' },
    { id: 'night', name: 'Night', free: true, col: '#5c6bc0', w: 5, dots: '#ffffff' },
    { id: 'mono', name: 'Mono', free: true, col: '#263238', w: 6 },
    { id: 'slayer', name: 'Slayer', how: 'Earn the Slayer title (50M pops)', col: '#e53935', w: 6, spikes: '#b71c1c' },
    { id: 'warlord', name: 'Warlord', how: 'Earn the Warlord title (250M pops)', col: '#546e7a', w: 7, rivets: '#cfd8dc' },
    { id: 'legend', name: 'Legend', how: 'Earn the Pop Legend title (1B pops)', col: 'url(#lg)', w: 7, animated: true },
    { id: 'perfect', name: 'Flawless', how: '12 perfect clears (0 lives lost)', col: '#ffffff', w: 5, glow: '#80deea' },
    { id: 'streak', name: 'Daily Flame', how: '30-day daily challenge streak', col: '#ff7043', w: 6, dots: '#ffd54f' },
    { id: 'medalist', name: 'Medalist', how: 'Hold 10 gold medals (1st place on 10 stage boards)', col: '#ffd54f', w: 6, rivets: '#fff8e1' },
    // 5.2.1 champion borders: only the World Boss Champion can wear one, for the 7 days after Friday 5:01 PM. They pick
    // which in Edit profile (id.cb, default Boss Slayer); it is never their saved border. Drawn by stormBorder (profile.ts).
    ...[['wblegend', 'Boss Slayer', 'Gold ring, purple flames, gems, shield and swords'],
        ['wbinferno', 'Inferno', 'Black and gold ring wrapped in roaring orange flames'],
        ['wbfrost', 'Frost Titan', 'Ice crystal spikes, silver-blue ring and a snowflake'],
        ['wblaurel', 'Royal Laurel', 'Gold laurel wreath, red ribbon and a gold star'],
        ['wbdragon', 'Dragon', 'Emerald scale ring, two horns and a dragon eye'],
        ['wbgalaxy', 'Galaxy', 'Deep-space ring with orbiting planets and twinkling stars'],
        ['wbthunder', 'Thunder God', 'Electric blue ring with flashing gold lightning bolts'],
        ['wbballoon', 'Balloon Parade', 'Rainbow balloons circling a gold ring'],
        ['wbshadow', 'Shadow Wings', 'Dark bat wings, black ring and glowing red eyes'],
        ['wbangel', 'Angel Halo', 'White feather wings, pearl ring and a golden halo']]
        .map(([id, name, desc]) => ({ id, name, desc, how: 'World Boss Champion only (worn for 7 days from Friday 5:01 PM)', col: '#ffc107', w: 8, storm: true, special: true, champ: true }))
];
const CHAMP_BORDER_IDS = BORDERS.filter(b => b.champ).map(b => b.id);
const NAME_FILTER = ['fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fag', 'dick', 'cock', 'pussy', 'whore', 'slut', 'rape', 'nazi', 'hitler', 'gago', 'ulol', 'kupal', 'pekpek', 'putangina'];
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
    boss: { name: 'Colossus', hp: 100, spd: 0.4, col: '#7b1fa2', kids: [], r: 34, blimp: true, boss: true },
    // World Bosses (one a week): 2.5 times the Colossus, 50,000 HP. WB_BOSSES has their builds.
    wbgale: { name: 'Gale', hp: 1, spd: 0.7, col: '#26c6da', kids: [], r: 85, blimp: true, boss: true, wb: true },
    wbbastion: { name: 'Bastion', hp: 1, spd: 0.3, col: '#78909c', kids: [], r: 85, blimp: true, boss: true, wb: true },
    wbbrood: { name: 'Broodmother', hp: 1, spd: 0.3, col: '#8e24aa', kids: [], r: 85, blimp: true, boss: true, wb: true },
    wbswarm: { name: 'Swarm King', hp: 1, spd: 0.7, col: '#f9a825', kids: [], r: 85, blimp: true, boss: true, wb: true }
};
/* Colour-blind markers: one small shape per balloon layer */
const CB_MARK = { red: 'R', blue: 'B', green: 'G', yellow: 'Y', pink: 'P', black: 'K', white: 'W', lead: 'L', zebra: 'Z', rainbow: '★', ceramic: 'C' };
const REGROW_CHAIN = ['red', 'blue', 'green', 'yellow', 'pink'];
const REGROW_TIME = 2.5; // seconds without damage before a regrow balloon grows a layer
const RBE = {};
(function calc() { const f = (t) => RBE[t] || (RBE[t] = BT[t].hp + BT[t].kids.reduce((s, k) => s + f(k), 0)); Object.keys(BT).forEach(f); })();
/* Boss (Colossus) every 10 rounds: health, and what it spawns at 75/50/25% and on death */
function bossHp(r) { const t = [0, 100, 350, 650, 2000, 5500][Math.min(5, Math.floor(r / 10))]; return r > 50 ? Math.round(5500 * (1 + (r - 50) * 0.08)) : t; }
function bossMinion(r) { return r <= 10 ? 'yellow' : r <= 20 ? 'black' : r <= 30 ? 'zebra' : r <= 40 ? 'rainbow' : r <= 50 ? 'ceramic' : r <= 80 ? 'blimp' : 'brute'; }
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
    '6 blimp 2, 30 crainbow .15, 12 fceramic .4', '70 cceramic .25', '8 blimp 1.6, 40 ceramic .2', '120 ceramic .12, 6 blimp 1.4, 2 fblimp 3', '1 brute 1, 8 blimp 1.5, 40 cceramic .2',
    // 51–60
    '80 cceramic .15, 12 fceramic .45', '10 blimp 1.1, 40 crainbow .12', '2 brute 3, 30 ceramic .2', '10 fblimp 1.2, 40 czebra .1', '100 cceramic .1, 6 blimp 1',
    '3 brute 2.5, 60 crpink .05, 20 fceramic .3', '14 blimp .9, 50 cceramic .14', '4 brute 2.2, 8 fblimp 1', '110 fceramic .1', '4 brute 2, 16 blimp .7',
    // 61–70
    '30 clead .2, 80 cceramic .1, 8 fblimp 1', '22 blimp .6, 2 fbrute 3', '140 cceramic .07, 5 brute 1.6', '18 fblimp .6, 60 crainbow .08', '7 brute 1.4, 90 fceramic .1',
    '26 blimp .5, 3 fbrute 2.5', '180 cceramic .06, 10 fblimp .8', '9 brute 1.2, 40 fceramic .15', '34 fblimp .45, 60 czebra .06', '5 fbrute 1.8, 18 blimp .5',
    // 71–80
    '220 cceramic .05, 10 brute 1.1', '44 fblimp .4', '12 brute 1, 110 fceramic .08', '8 fbrute 1.4, 36 blimp .4', '260 fceramic .045',
    '15 brute .9, 28 fblimp .4', '10 fbrute 1.2, 140 cceramic .05', '52 fblimp .35, 9 brute 1', '18 brute .8, 180 fceramic .05', '12 fbrute 1, 36 fblimp .3',
    // 81–90
    '340 cceramic .035, 18 brute .8', '70 fblimp .28, 7 fbrute 1', '22 brute .7, 220 fceramic .04', '16 fbrute .9, 54 blimp .25', '420 fceramic .03',
    '26 brute .6, 70 fblimp .25', '20 fbrute .8, 260 cceramic .035', '90 fblimp .22, 18 brute .6', '30 brute .55, 340 fceramic .03', '24 fbrute .7, 54 fblimp .2',
    // 91–100
    '500 cceramic .025, 34 brute .5', '120 fblimp .18, 14 fbrute .7', '38 brute .45, 420 fceramic .025', '32 fbrute .6, 100 blimp .16', '650 fceramic .02',
    '46 brute .4, 140 fblimp .16', '40 fbrute .5, 500 cceramic .022', '170 fblimp .14, 34 brute .4', '56 brute .35, 560 fceramic .02', '60 fbrute .4, 130 fblimp .14'
];
const LAST_ROUND = ROUNDS.length - 1; // 100
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
        const k = r - LAST_ROUND; // freeplay past round 100
        groups = [{ count: 300 + k * 20, type: 'ceramic', gap: .02, camo: true, fort: true },
            { count: 60 + k * 4, type: 'blimp', gap: .15, camo: false, fort: true },
            { count: 30 + k * 3, type: 'brute', gap: .4, camo: false, fort: k > 5 }];
    }
    if (r % 10 === 0)
        groups.unshift({ count: 1, type: 'boss', gap: 1, camo: false });
    return groups;
}
/* ---------- Towers ----------
   Damage types: sharp (not lead), explosive (not black/zebra), freeze (not white/zebra/blimps), energy, fire, normal.
   size: footprint in tiles (2 = 2x2, 3 = 3x3). Each tower has 3 paths of 5 tiers.
   Stat keys used by upgrades: range rate dmg pierce dtype speed count spread proj camo life bm blast cluster stun
   chains jump bolts freeze permaslow blimpSlow shatter freezeAll income vault vaultCap lives bounce shockSlow aura buff*. */
const TD = {
    dart: { name: 'Dart Tower', cost: 200, size: 2, r: 19, color: '#a1887f', unlock: 1, desc: 'Fires a sharp dart at one balloon. Cheap and reliable.',
        ability: { name: 'Rapid Fire', desc: 'Triple attack speed for 5 seconds.', cd: 40 },
        base: { range: 125, rate: 0.95, dmg: 1, pierce: 3, dtype: 'sharp', speed: 540, count: 1, spread: 0, proj: 'dart', camo: false, life: 0 },
        paths: [
            [{ n: 'Sharp Darts', c: 140, d: '+2 pierce', a: s => { s.pierce += 2; } },
                { n: 'Razor Darts', c: 260, d: '+3 pierce, +1 damage', a: s => { s.pierce += 3; s.dmg += 1; } },
                { n: 'Boulder Ball', c: 1400, d: 'Huge rolling ball: 3 damage, 30 pierce, pops lead', a: s => { s.proj = 'ball'; s.dmg = 3; s.pierce = 30; s.dtype = 'normal'; s.speed = 360; s.life = 1.5; s.rate *= 1.1; } },
                { n: 'Avalanche Ball', c: 4200, d: '6 damage, 60 pierce, rolls faster', a: s => { s.dmg = 6; s.pierce = 60; s.rate *= 0.8; s.speed = 420; } },
                { n: 'Mountain Breaker', c: 18000, d: 'Giant ball: 15 damage, 120 pierce, 3x vs blimps', a: s => { s.dmg = 15; s.pierce = 120; s.bm = 3; s.rate *= 0.7; s.big = 1; } }],
            [{ n: 'Quick Draw', c: 120, d: 'Attacks 25% faster', a: s => { s.rate *= 0.75; } },
                { n: 'Triple Shot', c: 300, d: 'Fires 3 darts at once', a: s => { s.count = 3; s.spread = 0.22; } },
                { n: 'Eagle Eye', c: 650, d: '+60 range, camo detection, 30% faster', a: s => { s.range += 60; s.camo = true; s.rate *= 0.7; } },
                { n: 'Dart Storm', c: 3600, d: 'Fires 5 darts, 40% faster', a: s => { s.count = 5; s.rate *= 0.6; } },
                { n: 'Thousand Needles', c: 16000, d: '8 darts, twice as fast, +2 damage, +4 pierce', a: s => { s.count = 8; s.rate *= 0.5; s.dmg += 2; s.pierce += 4; } }],
            [{ n: 'Long Shot', c: 100, d: '+25 range, faster darts', a: s => { s.range += 25; s.speed += 120; } },
                { n: 'Steel Tips', c: 240, d: 'Darts pop lead', a: s => { s.dtype = 'normal'; } },
                { n: 'Crossbow', c: 900, d: '3 damage, +2 pierce, +30 range', a: s => { s.dmg = 3; s.pierce += 2; s.range += 30; s.speed = 720; s.proj = 'bolt'; } },
                { n: 'Sharpshooter', c: 3000, d: '8 damage, double damage to blimps', a: s => { s.dmg = 8; s.bm = 2; } },
                { n: 'Siege Bolt', c: 14000, d: '20 damage, +6 pierce, 3x vs blimps, +40 range', a: s => { s.dmg = 20; s.pierce += 6; s.bm = 3; s.range += 40; } }]
        ] },
    tack: { name: 'Tack Spinner', cost: 280, size: 2, r: 19, color: '#ec407a', unlock: 1, desc: 'Sprays tacks in every direction when balloons come close.',
        ability: { name: 'Nova Burst', desc: 'Deal 4 damage to every balloon within 200 px.', cd: 35 },
        base: { range: 85, rate: 1.1, dmg: 1, pierce: 2, dtype: 'sharp', speed: 430, count: 8, proj: 'tack', camo: false, life: 0 },
        paths: [
            [{ n: 'More Tacks', c: 180, d: 'Shoots 12 tacks', a: s => { s.count = 12; } },
                { n: 'Blade Ring', c: 520, d: 'Spinning blades: +2 pierce, +1 damage', a: s => { s.proj = 'blade'; s.pierce += 2; s.dmg += 1; } },
                { n: 'Flame Ring', c: 2200, d: 'Constant ring of fire burns everything nearby, pops lead', a: s => { s.mode = 'ring'; s.dmg = 2; s.rate = 0.25; s.dtype = 'fire'; } },
                { n: 'Inferno Ring', c: 5500, d: '4 fire damage, +20 range, burns faster', a: s => { s.dmg = 4; s.range += 20; s.rate = 0.2; } },
                { n: 'Sun Core', c: 22000, d: '10 fire damage, +40 range, 2x vs blimps', a: s => { s.dmg = 10; s.range += 40; s.rate = 0.15; s.bm = 2; } }],
            [{ n: 'Fast Spin', c: 150, d: 'Attacks 30% faster', a: s => { s.rate *= 0.7; } },
                { n: 'Faster Spin', c: 300, d: 'Attacks 30% faster again', a: s => { s.rate *= 0.7; } },
                { n: 'Long Reach', c: 700, d: '+35 range, +2 pierce', a: s => { s.range += 35; s.pierce += 2; } },
                { n: 'Whirlwind', c: 2800, d: 'Twice as fast, 16 tacks', a: s => { s.rate *= 0.5; s.count = Math.max(s.count, 16); } },
                { n: 'Tack Tempest', c: 13000, d: '24 tacks, +2 damage, +4 pierce, faster', a: s => { s.rate *= 0.6; s.dmg += 2; s.pierce += 4; s.count = 24; } }],
            [{ n: 'Hot Tacks', c: 250, d: 'Tacks pop lead', a: s => { s.dtype = 'fire'; } },
                { n: 'Wide Spray', c: 350, d: '+15 range, +1 pierce', a: s => { s.range += 15; s.pierce += 1; } },
                { n: 'Tack Mortar', c: 1300, d: '16 tacks, +1 damage', a: s => { s.count = 16; s.dmg += 1; } },
                { n: 'Blade Maelstrom', c: 4500, d: '20 spinning blades, +2 damage, +4 pierce', a: s => { s.proj = 'blade'; s.count = 20; s.dmg += 2; s.pierce += 4; } },
                { n: 'Razor Cyclone', c: 17000, d: '32 blades, +4 damage, faster', a: s => { s.count = 32; s.dmg += 4; s.rate *= 0.6; } }]
        ] },
    bomb: { name: 'Bomb Cannon', cost: 525, size: 3, r: 27, color: '#546e7a', unlock: 1, desc: 'Lobs bombs that pop whole groups over scenery. Cannot pop black or zebra.',
        ability: { name: 'Blimp Wrecker', desc: 'Hit the toughest balloon on the map for 1,200 damage.', cd: 45 },
        base: { range: 140, rate: 1.3, dmg: 1, pierce: 24, dtype: 'explosive', speed: 380, proj: 'bomb', blast: 42, camo: false, bm: 1, cluster: 0, life: 0, stun: 0 },
        paths: [
            [{ n: 'Bigger Bombs', c: 350, d: '+18 blast radius, +10 pierce', a: s => { s.blast += 18; s.pierce += 10; } },
                { n: 'Heavy Bombs', c: 800, d: 'Explosions deal 3 damage', a: s => { s.dmg = 3; } },
                { n: 'Blimp Buster', c: 3000, d: 'Missiles deal 8x damage to blimps, +1 damage', a: s => { s.bm = 8; s.dmg += 1; s.proj = 'missile'; s.speed = 520; } },
                { n: 'Blimp Breaker', c: 7500, d: '12x vs blimps, +3 damage, faster reload', a: s => { s.bm = 12; s.dmg += 3; s.rate *= 0.8; } },
                { n: 'Sky Shatterer', c: 26000, d: '20x vs blimps, +6 damage, +20 blast', a: s => { s.bm = 20; s.dmg += 6; s.blast += 20; } }],
            [{ n: 'Fast Reload', c: 250, d: 'Reloads 25% faster', a: s => { s.rate *= 0.75; } },
                { n: 'Long Barrel', c: 400, d: '+50 range', a: s => { s.range += 50; } },
                { n: 'Cluster Bombs', c: 1500, d: 'Each explosion releases 6 mini-bombs', a: s => { s.cluster = 6; } },
                { n: 'Cluster Barrage', c: 4200, d: '10 mini-bombs, reloads faster', a: s => { s.cluster = 10; s.rate *= 0.75; } },
                { n: 'Carpet Bomber', c: 18000, d: '16 mini-bombs, +3 damage, much faster', a: s => { s.cluster = 16; s.dmg += 3; s.rate *= 0.6; } }],
            [{ n: 'Shrapnel', c: 300, d: '+8 pierce', a: s => { s.pierce += 8; } },
                { n: 'Concussion', c: 650, d: 'Explosions stun balloons briefly', a: s => { s.stun = 0.4; } },
                { n: 'Shockwave', c: 2000, d: '+30 blast, longer stun, +1 damage', a: s => { s.blast += 30; s.stun = 0.8; s.dmg += 1; } },
                { n: 'Earthquake', c: 5200, d: '+30 blast, +2 damage, stun also slows blimps', a: s => { s.blast += 30; s.dmg += 2; s.stun = 1.2; } },
                { n: 'Seismic Core', c: 20000, d: '+5 damage, +40 blast, reloads faster', a: s => { s.dmg += 5; s.blast += 40; s.rate *= 0.7; } }]
        ] },
    sniper: { name: 'Sniper Post', cost: 700, size: 2, r: 19, color: '#6b8e23', unlock: 1, desc: 'Hits any balloon it can see, instantly. Pops lead. Tall scenery blocks it. Expensive: it is the strongest single-target tower.',
        ability: { name: 'Airstrike', desc: 'Bomb the 3 toughest balloons: 30 damage in a wide blast.', cd: 45 },
        base: { range: 9999, rate: 1.6, dmg: 2, mode: 'hitscan', camo: false, bm: 1, bounce: 0, income: 0 },
        paths: [
            [{ n: 'Full Metal', c: 550, d: '4 damage per shot', a: s => { s.dmg = 4; } },
                { n: 'Point Five', c: 1800, d: '7 damage per shot', a: s => { s.dmg = 7; } },
                { n: 'Elite Marksman', c: 5250, d: '18 damage, double damage to blimps', a: s => { s.dmg = 18; s.bm = 2; } },
                { n: 'Deadeye', c: 12000, d: '40 damage, 3x vs blimps', a: s => { s.dmg = 40; s.bm = 3; } },
                { n: 'Cloud Piercer', c: 45000, d: '100 damage, 4x vs blimps', a: s => { s.dmg = 100; s.bm = 4; } }],
            [{ n: 'Night Scope', c: 450, d: 'Camo detection', a: s => { s.camo = true; } },
                { n: 'Fast Bolt', c: 750, d: 'Fires 40% faster', a: s => { s.rate *= 0.6; } },
                { n: 'Semi-Auto', c: 4200, d: 'Fires 3x faster', a: s => { s.rate /= 3; } },
                { n: 'Full Auto', c: 9750, d: 'Fires twice as fast again', a: s => { s.rate *= 0.5; } },
                { n: 'Bullet Storm', c: 36000, d: 'Twice as fast again, +4 damage', a: s => { s.rate *= 0.5; s.dmg += 4; } }],
            [{ n: 'Steady Aim', c: 400, d: 'Fires 15% faster', a: s => { s.rate *= 0.85; } },
                { n: 'Ricochet', c: 900, d: 'Shots bounce to 2 more balloons', a: s => { s.bounce = 2; } },
                { n: 'Shrapnel Rounds', c: 2700, d: 'Bounces to 5 balloons, +1 damage', a: s => { s.bounce = 5; s.dmg += 1; } },
                { n: 'Supply Sniper', c: 7200, d: '+2 bounces and earns $150 per round', a: s => { s.bounce += 2; s.income += 150; } },
                { n: 'Ghost Rounds', c: 28500, d: '10 bounces, +6 damage, camo detection', a: s => { s.bounce = 10; s.dmg += 6; s.camo = true; } }]
        ] },
    frost: { name: 'Frost Tower', cost: 400, size: 2, r: 19, color: '#4fc3f7', unlock: 2, desc: 'Freezes nearby balloons in place. No effect on white, zebra or blimps.',
        ability: { name: 'Absolute Zero', desc: 'Freeze every balloon on screen for 3 s and slow blimps for 4 s.', cd: 50 },
        base: { range: 80, rate: 2.2, freeze: 1.1, dmg: 0, mode: 'pulse', camo: false, permaslow: 0, blimpSlow: 0, shatter: 0, freezeAll: 0, freezeBlimp: 0 },
        paths: [
            [{ n: 'Lasting Chill', c: 220, d: 'Balloons stay 40% slower after thawing', a: s => { s.permaslow = 0.4; } },
                { n: 'Deep Freeze', c: 450, d: 'Freezing pops 1 layer and lasts longer', a: s => { s.dmg = 1; s.freeze += 0.6; } },
                { n: 'Arctic Core', c: 1800, d: '+40 range, camo detection, slows blimps 50%, 2 damage', a: s => { s.range += 40; s.camo = true; s.blimpSlow = 0.5; s.dmg = 2; } },
                { n: 'Glacier Heart', c: 4800, d: '+20 range, 3 damage, slows blimps 60%', a: s => { s.range += 20; s.dmg = 3; s.freeze += 0.5; s.blimpSlow = 0.6; } },
                { n: 'Ice Age', c: 19000, d: '6 damage, +40 range, slows blimps 75%', a: s => { s.dmg = 6; s.range += 40; s.freeze += 0.8; s.blimpSlow = 0.75; } }],
            [{ n: 'Wider Field', c: 200, d: '+20 range', a: s => { s.range += 20; } },
                { n: 'Rapid Chill', c: 450, d: 'Pulses 35% faster', a: s => { s.rate *= 0.65; } },
                { n: 'Shatter Pulse', c: 1300, d: 'Each pulse deals 2 damage to everything in range, incl. white and blimps', a: s => { s.shatter = 2; } },
                { n: 'Crystal Storm', c: 4000, d: 'Pulses deal 5 damage, 30% faster', a: s => { s.shatter = 5; s.rate *= 0.7; } },
                { n: 'Diamond Burst', c: 17000, d: 'Pulses deal 14 damage, much faster', a: s => { s.shatter = 14; s.rate *= 0.6; } }],
            [{ n: 'Cold Snap', c: 180, d: 'Freezes 0.4 s longer', a: s => { s.freeze += 0.4; } },
                { n: 'Snow Goggles', c: 400, d: 'Camo detection', a: s => { s.camo = true; } },
                { n: 'Snow Cannon', c: 1600, d: 'Freezes white and zebra too, +15 range', a: s => { s.freezeAll = 1; s.range += 15; } },
                { n: 'Polar Vortex', c: 4200, d: 'Balloons stay 50% slower, +30 range', a: s => { s.permaslow = Math.max(s.permaslow, 0.5); s.range += 30; } },
                { n: 'Winter\'s Grip', c: 16000, d: 'Freezes blimps for a moment, 2 damage', a: s => { s.freezeBlimp = 0.5; s.dmg = Math.max(s.dmg, 2); } }]
        ] },
    signal: { name: 'Signal Tower', cost: 500, size: 3, r: 27, color: '#26a69a', unlock: 3, support: true, desc: 'Doesn\'t attack. Boosts every tower inside its aura.',
        ability: { name: 'Rally', desc: 'Towers in the aura attack twice as fast for 6 seconds.', cd: 50 },
        base: { mode: 'aura', aura: 110, buffRange: 0, buffRate: 0, buffDmg: 0, buffPierce: 0, buffCamo: false, buffCd: 0 },
        paths: [
            [{ n: 'Radar Dish', c: 350, d: 'Towers in the aura detect camo', a: s => { s.buffCamo = true; } },
                { n: 'Overclock', c: 900, d: 'Towers in the aura attack 20% faster', a: s => { s.buffRate += 0.2; } },
                { n: 'Command Center', c: 3200, d: '+1 damage and another 15% speed to towers in the aura', a: s => { s.buffDmg += 1; s.buffRate += 0.15; } },
                { n: 'War Room', c: 7500, d: 'Another +15% speed and +1 damage', a: s => { s.buffRate += 0.15; s.buffDmg += 1; } },
                { n: 'Grand Command', c: 25000, d: '+20% speed, +2 damage, +3 pierce to the aura', a: s => { s.buffRate += 0.2; s.buffDmg += 2; s.buffPierce += 3; } }],
            [{ n: 'Big Antenna', c: 250, d: '+40 aura size', a: s => { s.aura += 40; } },
                { n: 'Spotter', c: 600, d: 'Towers in the aura get +15% range', a: s => { s.buffRange += 0.15; } },
                { n: 'Supply Drop', c: 2000, d: 'Towers in the aura get +2 pierce and +1 damage', a: s => { s.buffPierce += 2; s.buffDmg += 1; } },
                { n: 'Uplink', c: 5000, d: '+60 aura, +10% more range', a: s => { s.aura += 60; s.buffRange += 0.1; } },
                { n: 'Satellite Array', c: 20000, d: '+120 aura, +10% range, +2 pierce', a: s => { s.aura += 120; s.buffRange += 0.1; s.buffPierce += 2; } }],
            [{ n: 'Pep Talk', c: 300, d: 'Towers in the aura attack 8% faster', a: s => { s.buffRate += 0.08; } },
                { n: 'Field Kit', c: 700, d: 'Towers in the aura get +1 pierce', a: s => { s.buffPierce += 1; } },
                { n: 'Ability Relay', c: 2400, d: 'Abilities in the aura recharge 25% faster', a: s => { s.buffCd = 0.25; } },
                { n: 'Mobile HQ', c: 6000, d: 'Recharge 40% faster, +1 damage', a: s => { s.buffCd = 0.4; s.buffDmg += 1; } },
                { n: 'Nerve Center', c: 22000, d: 'Recharge 60% faster, +25% speed', a: s => { s.buffCd = 0.6; s.buffRate += 0.25; } }]
        ] },
    tesla: { name: 'Tesla Coil', cost: 750, size: 3, r: 27, color: '#7e57c2', unlock: 4, desc: 'Chain lightning jumps between balloons. Detects camo.',
        ability: { name: 'Overload', desc: 'Triple attack speed and +5 chain jumps for 6 seconds.', cd: 45 },
        base: { range: 130, rate: 1.1, dmg: 1, chains: 5, jump: 85, mode: 'chain', camo: true, bolts: 1, bm: 1, shockSlow: 0 },
        paths: [
            [{ n: 'More Arcs', c: 500, d: '+4 chain jumps', a: s => { s.chains += 4; } },
                { n: 'Overcharge', c: 1100, d: '+1 damage, +4 chain jumps', a: s => { s.dmg += 1; s.chains += 4; } },
                { n: 'Storm Core', c: 4000, d: 'Fires 3 bolts at once, 3 damage', a: s => { s.bolts = 3; s.dmg = 3; } },
                { n: 'Thunderhead', c: 9000, d: '5 bolts, 5 damage', a: s => { s.bolts = 5; s.dmg = 5; } },
                { n: 'Zeus Engine', c: 30000, d: '8 bolts, 10 damage, +6 jumps', a: s => { s.bolts = 8; s.dmg = 10; s.chains += 6; } }],
            [{ n: 'Capacitor', c: 400, d: 'Fires 30% faster', a: s => { s.rate *= 0.7; } },
                { n: 'Long Arc', c: 600, d: '+40 range, longer jumps', a: s => { s.range += 40; s.jump += 40; } },
                { n: 'Pulse Field', c: 2500, d: 'Fires 2x faster', a: s => { s.rate *= 0.5; } },
                { n: 'Arc Reactor', c: 6500, d: 'Fires 2x faster again', a: s => { s.rate *= 0.5; } },
                { n: 'Plasma Lattice', c: 24000, d: '2x faster, +8 jumps, +3 damage', a: s => { s.rate *= 0.5; s.chains += 8; s.dmg += 3; } }],
            [{ n: 'Ground Strike', c: 350, d: 'Double damage to blimps', a: s => { s.bm = 2; } },
                { n: 'Blimp Jolt', c: 800, d: '3x vs blimps, +1 damage', a: s => { s.bm = 3; s.dmg += 1; } },
                { n: 'Static Field', c: 2200, d: 'Zapped balloons slow down 30%', a: s => { s.shockSlow = 0.3; } },
                { n: 'Tempest Coil', c: 5500, d: '5x vs blimps, +40 jump length', a: s => { s.bm = 5; s.jump += 40; } },
                { n: 'Superconductor', c: 21000, d: '+6 damage, 6x vs blimps, +4 jumps', a: s => { s.dmg += 6; s.bm = 6; s.chains += 4; } }]
        ] },
    boat: { name: 'Gunboat', cost: 450, size: 3, r: 27, color: '#8d6e63', unlock: 5, water: true, desc: 'Built on water only. Fires cannonballs that pop lead.',
        ability: { name: 'Broadside', desc: 'Fire 24 cannonballs in every direction.', cd: 30 },
        base: { range: 150, rate: 1.0, dmg: 1, pierce: 3, dtype: 'normal', speed: 420, count: 1, spread: 0, proj: 'cannonball', camo: false, life: 0, income: 0, bm: 1, blast: 0, cluster: 0 },
        paths: [
            [{ n: 'Grape Shot', c: 300, d: 'Fires 4 shots in a spread', a: s => { s.count = 4; s.spread = 0.18; } },
                { n: 'Heavy Shot', c: 700, d: '+1 damage, +3 pierce', a: s => { s.dmg += 1; s.pierce += 3; } },
                { n: 'Torpedo Bay', c: 2600, d: 'Torpedoes: 6 damage, 4x vs blimps', a: s => { s.proj = 'torpedo'; s.dmg = 6; s.bm = 4; s.pierce = 4; s.speed = 480; } },
                { n: 'Dreadnought', c: 7000, d: '12 damage, 6x vs blimps, +4 pierce, faster', a: s => { s.dmg = 12; s.bm = 6; s.pierce += 4; s.rate *= 0.7; } },
                { n: 'Leviathan', c: 26000, d: '30 damage, 8x vs blimps, 3 torpedoes', a: s => { s.dmg = 30; s.bm = 8; s.count = Math.max(3, s.count); s.spread = 0.2; } }],
            [{ n: 'Crow\'s Nest', c: 250, d: 'Camo detection, +30 range', a: s => { s.camo = true; s.range += 30; } },
                { n: 'Fast Crew', c: 500, d: 'Fires 30% faster', a: s => { s.rate *= 0.7; } },
                { n: 'Trade Ship', c: 1800, d: 'Also earns $200 per round', a: s => { s.income += 200; } },
                { n: 'Merchant Fleet', c: 5000, d: 'Earns another $400 per round', a: s => { s.income += 400; } },
                { n: 'Harbor Empire', c: 20000, d: 'Earns another $1,200 per round', a: s => { s.income += 1200; } }],
            [{ n: 'Long Guns', c: 200, d: '+40 range', a: s => { s.range += 40; } },
                { n: 'Chain Shot', c: 550, d: '+4 pierce, +1 damage', a: s => { s.pierce += 4; s.dmg += 1; } },
                { n: 'Mortar Deck', c: 2000, d: 'Lobs exploding shells over scenery', a: s => { s.proj = 'bomb'; s.blast = 50; s.pierce = 30; s.dmg += 1; } },
                { n: 'Bombard', c: 5500, d: '+3 damage, +20 blast, faster', a: s => { s.dmg += 3; s.blast += 20; s.rate *= 0.75; } },
                { n: 'Armada Guns', c: 22000, d: 'Shells split into 8 mini-bombs, +4 damage', a: s => { s.cluster = 8; s.dmg += 4; } }]
        ] },
    mine: { name: 'Gold Mine', cost: 1500, size: 3, r: 27, color: '#ffb300', unlock: 6, support: true, desc: 'Doesn\'t attack. Earns gold every 10 seconds while a round is being played.',
        ability: { name: 'Payday', desc: 'Collect 50 seconds of this mine\'s gold right now (80 seconds once stronger).', cd: 90 },
        base: { income: 40, mode: 'mine', popBonus: 0, vault: 0, vaultCap: 350, lives: 0 },
        paths: [
            [{ n: 'Richer Vein', c: 750, d: '+$25 every 10 s', a: s => { s.income += 25; } },
                { n: 'Deep Shaft', c: 1800, d: '+$50 every 10 s', a: s => { s.income += 50; } },
                { n: 'Mother Lode', c: 6000, d: '+$170 every 10 s', a: s => { s.income += 170; } },
                { n: 'Gold Rush', c: 15000, d: '+$500 every 10 s', a: s => { s.income += 500; } },
                { n: 'Bullion Empire', c: 52500, d: '+$1,350 every 10 s', a: s => { s.income += 1350; } }],
            [{ n: 'Pop Bonus', c: 900, d: '+10% cash from pops (all mines max +30%)', a: s => { s.popBonus = 0.1; } },
                { n: 'Bigger Carts', c: 1350, d: '+$35 every 10 s', a: s => { s.income += 35; } },
                { n: 'Bank Vault', c: 4500, d: 'Earns 3% interest on your cash every 10 s (max $350)', a: s => { s.vault = 0.03; } },
                { n: 'Investment Bank', c: 12000, d: '4% interest (max $850)', a: s => { s.vault = 0.04; s.vaultCap = 850; } },
                { n: 'Central Bank', c: 42000, d: '5% interest (max $2,000), +$170 every 10 s', a: s => { s.vault = 0.05; s.vaultCap = 2000; s.income += 170; } }],
            [{ n: 'Shiny Nuggets', c: 525, d: '+$15 every 10 s', a: s => { s.income += 15; } },
                { n: 'Prospector', c: 1200, d: '+$20 every 10 s', a: s => { s.income += 20; } },
                { n: 'Gem Cutter', c: 3900, d: 'Also gives 5 lives each round', a: s => { s.lives += 5; } },
                { n: 'Rescue Fund', c: 9750, d: '+15 lives per round and +$70 every 10 s', a: s => { s.lives += 15; s.income += 70; } },
                { n: 'Golden Heart', c: 36000, d: '+40 lives per round and +$270 every 10 s', a: s => { s.lives += 40; s.income += 270; } }]
        ] }
};
const SHOP = ['dart', 'tack', 'bomb', 'sniper', 'frost', 'signal', 'tesla', 'boat', 'mine'];
/* Gold Mines pay every MINE_PAY_TIME seconds of a round. They stop MINE_GRACE seconds after the round's last balloon
   has come out, so a round held open (balloons kept frozen) can't be farmed. Payday collects MINE_PAYDAY[power - 1]
   payouts at once. */
const MINE_PAY_TIME = 10, MINE_GRACE = 120, MINE_PAYDAY = [5, 8];
const PATH_COL = ['#4fc3f7', '#ffb74d', '#ba68c8'];
/** Release notes, newest first (the News panel on the home page). */
const NEWS = [
    { v: '5.3', date: '2026-11-28', items: [
            'New Heroes mode (unranked): pick one of four heroes, Fern Fletch, Ember Vale, Sergeant Flint or Willow Moss. Your hero levels up from 1 to 10 as you clear rounds, unlocks skills, and gets two abilities on Z (level 3) and X (level 10).',
            'Gold Mine: now pays every 10 seconds while a round is being played, not once per round. It costs $1,500 (was $900) and its upgrades cost 50% more. Payday collects 5 payouts at once (8 when stronger).',
            'Harder difficulties: Easy 150 lives (was 200), Medium 100 (was 150), Hard 60 (was 100). Balloon health starts ramping up after round 70 on Medium and Nightmare and after round 60 on Hard.'
        ] },
    { v: '5.2.2', date: '2026-11-28', items: [
            'World Boss Champion: 10 exclusive card backgrounds (Royal Throne, Volcano Lair, Galaxy, Treasure Hoard, Aurora, Ocean Sunset, Cherry Blossom, Thunderstorm, Champion Arena, Balloon Sky). The Champion picks one in Edit profile; it shows behind their player card and profile card for 7 days.',
            'Shared folder: results, World Boss scores, logins and profile changes reach the other PCs in a few seconds.'
        ] },
    { v: '5.2.1', date: '2026-11-27', items: [
            'World Boss Champion: 10 exclusive Champion borders (Boss Slayer, Inferno, Frost Titan, Royal Laurel, Dragon, Galaxy, Thunder God, Balloon Parade, Shadow Wings, Angel Halo). The Champion picks one in Edit profile and can switch any time for 7 days; it shows on their avatar everywhere.',
            'World Boss Champion: their name shines in gold everywhere. The World Boss banner shows the Champion prize, and the champion greeting has a Choose my border button.',
            'World Boss leaderboard: Top 5, with Result, Time, Lives and Damage columns in ranking order. Damage is a short number (18.9m).',
            'World Boss: bosses can have modifiers (Swarm, Strength, Gold gain, Boss aura DEF), shown on the banner.',
            'Upgrade path hotkeys are now A, S and D. The ` key no longer hides the game.',
            'Master control: Tower setup, to buff or nerf any tower (cost, upgrade cost, damage, attack speed, range, pierce, income), shared with every PC.'
        ] },
    { v: '5.2', date: '2026-11-26', items: [
            'World Boss: two days a week. Normal on Thursday, Elite on Friday (2.5x HP, 15% faster, one more skull per tier), both 7:30 AM to 5:00 PM (PH time). The leaderboard has an Elite tab and a Normal tab, and the Champion is Elite #1.',
            'World Boss: played in rounds. Five boss tiers come on rounds 40, 60, 80, 100 and 120 (10,000 to 50,000 HP), and rounds keep going while a boss is out, so farms keep paying. A tier only comes once the one before it is popped. Pop all five before round 140 to win.',
            'World Boss: every tier looks stronger than the last. The stars on the boss bar show its tier.',
            'World Boss: four new maps with an END. The boss walks very slowly towards it and stops every time it summons; if it gets there, the run is over.',
            'World Boss: skulls on its health bar. Each one makes it use its skill (Gale dashes, Bastion shields, Broodmother and Swarm King drop big batches); at the last, flaming skull it gets angry. It can\'t be frozen, stunned or slowed.',
            'Daily Top 10 and World Boss boards: wins first, then fastest, then most lives.',
            'Sniper Post is more expensive: $700 to build (was $350), and its upgrades cost 50% more.'
        ] },
    { v: '5.1.1', date: '2026-11-18', items: [
            'A notification when a player dominates a map: every difficulty (Easy, Medium, Hard and Nightmare) cleared on it.',
            'A notification when another player takes your medal on a stage: who took it, the medal you have now, and the points you lost (for example -1). Your own new medals show the points you gained (for example +3).',
            'Global and Daily leaderboards show the top 5; scroll for places 6 to 10.',
            'Ability hotkeys: Q W E R T Y U use the 1st–7th ability on the ability tray (Shift + a tower\'s number key still works). Targeting moved to G.',
            'Hard and Nightmare on Crossroads and Figure Eight now start with the same money as every other Hard / Nightmare map.',
            'Master control: World Boss setup. Change each boss\'s name, HP, defense, start money, lives and summon size, for every PC on the shared folder.'
        ] },
    { v: '5.1', date: '2026-11-16', items: [
            'Log in: the game opens on a sign-in page and nothing else shows until you log in. Find your profile (search by name), then type your password. A profile without a password makes one at its first log-in. New players sign up with the registration form (live name check, password strength, show/hide password).',
            'The World Boss news opens every time you log in.',
            'Master control: reset a password, delete an account, or bring a deleted account back from its backups.',
            'Sniper Post skills: Range and Pierce did nothing for it, so they are now Damage (+5% per point) and Blimp hunter (+10% damage to blimps per point). Points you had in them are given back.',
            'No daily challenge on Saturdays and Sundays. Weekends don\'t break your daily streak.',
            'Players: online players are listed first, a pop-up tells you when someone comes online, and offline players show when they were last on (for example 30m ago or 4h ago).',
            'The game clock is shown next to the round. It stops while the game is paused and runs 3 times as fast on 3x.',
            'Chat shows your own name, avatar, rank and title on your messages too.',
            'Game history: your last 30 games, on your profile.',
            'Notifications show a trophy for wins, medals and the crown, and you get one when you take a top 3 place on a stage board.',
            'The screen flashes red when balloons get through.'
        ] },
    { v: '5.0', date: '2026-11-13', items: [
            'World Boss: a new boss every week on one of 4 new looping maps. It has 50,000 HP and keeps summoning balloons that get stronger every minute. Your score is the damage you deal.',
            'The World Boss banner and its damage board are at the bottom of the leaderboards. Each event ends on Friday at 5:00 PM (Philippine time). The top damage dealer wears the World Boss Legend border for a week.',
            'Chat: talk with everyone on the shared folder, with emoji. Messages stay for 24 hours. New messages pop up at the top of the screen while you play.',
            'Notifications: the bell keeps your last 10 notifications.',
            'Your profile is safer: it is saved to the shared folder within seconds, more backups are kept, and progress can never go backwards. If this browser loses your profile, use "Find my profile".',
            'Each profile now plays only on its own PC. Online players show a green dot, offline players a gray one.',
            'How to Play is now Info, with a World Boss page.',
            'Unlock All, Switch player and Reset all progress were removed.'
        ] },
    { v: '4.5', date: '2026-11-12', items: [
            'Profiles: names are unique, each PC creates one profile, and you can pick your existing profile on any PC connected to the shared folder.',
            'A profile can be played on one PC at a time, and only the PC that created it can delete it.',
            'Leaderboards: tier boards show the top 3 with gold, silver and bronze. New Global Top 10 (medal points: gold 3, silver 2, bronze 1) and Daily Challenge Top 10.',
            'The Global #1 wears a crown on their avatar everywhere. Arrows show who moved up or down.',
            'Notifications when another player wins or loses a game, and automatic backups after every game.',
            'The HUD (boss health, abilities, alerts and the Play button) moved off the map, so nothing covers your towers.',
            'The boss health bar shows skulls where the boss summons minions.',
            'Upgraded towers look different on each path, and projectiles are easier to see.',
            'The Gold Mine has its own skills: income, vault size, discount and Payday recharge.',
            'Freeplay (after you win) no longer gives tower XP. Unlock All can\'t be switched during a game.',
            'Roads line up with the build grid: no more blocked strips of grass beside the road.'
        ] },
    { v: '4.0', date: '2026-11-11', items: [
    'New screen layout: the map fills the screen, with a tower column on the right.',
    'Every tower now has 3 upgrade paths of 5 tiers (135 upgrades): take one path to tier 5 and a second to tier 2. Unlock tiers 3–5 with tower XP.',
    'Tower levels and skill points: open Upgrades on the home page.',
    'Towers snap to a tile grid. Big towers take 3×3 tiles.',
    'Tall scenery blocks straight shots. Clear it for cash if it\'s in the way.',
    '8 new maps, a Nightmare difficulty and longer games (40/60/80/100 rounds).',
    'Player profiles with animal avatars, borders and titles. Back up your progress in Settings.',
    'Better projectiles, explosions and popping effects. Low effects mode for slower PCs.',
    'Players: everyone who uses this PC gets their own profile. Leaderboards show the top 5 with gold, silver and bronze medals, and you can open everyone’s profile. Connect a shared network folder to see players from other PCs.'
        ] }
];
const WHATS_NEW = NEWS[0].items;
/* ---------- World Boss (weekly event) ----------
   Build: speed (BT spd), def = share of damage taken, count = balloons per summon, every = summon gap multiplier. */
const WB_HP = 50000, WB_LIVES = 3000;
const WB_BOSSES = [
    { id: 'wbgale', name: 'Gale', build: 'Fast, normal defense', speed: 'Fast', def: 1, defTxt: 'Normal', count: 3, every: 1, summonTxt: '3 balloons each summon', cash: 10000, skill: 'dash' },
    { id: 'wbbastion', name: 'Bastion', build: 'Slow, high defense', speed: 'Slow', def: 0.6, defTxt: 'High (takes 40% less damage)', count: 3, every: 1, summonTxt: '3 balloons each summon', cash: 10000, skill: 'shield' },
    { id: 'wbbrood', name: 'Broodmother', build: 'Slow, medium defense, large summons', speed: 'Slow', def: 0.8, defTxt: 'Medium (takes 20% less damage)', count: 4, every: 1, summonTxt: '4 balloons each summon', cash: 10000, skill: 'brood' },
    { id: 'wbswarm', name: 'Swarm King', build: 'Fast, normal defense, fast summoning', speed: 'Fast', def: 1, defTxt: 'Normal', count: 3, every: 0.6, summonTxt: '3 balloons, 40% more often', cash: 10000, skill: 'swarm' }
].map(b => Object.assign(b, { hp: WB_HP, lives: WB_LIVES, swarm: 0, str: 0, gold: 0, aura: 0 }));
/** 5.2.1: boss modifiers, in percent (master control): swarm = balloons per summon, str = summoned balloons' health,
    gold = cash from pops and paydays, aura = balloons near the boss (within WB_AURA_R) take this much less damage. */
const WB_MODS = [
    { k: 'swarm', name: 'Swarm', harder: 1 }, { k: 'str', name: 'Strength', harder: 1 }, { k: 'gold', name: 'Gold gain', harder: -1 }, { k: 'aura', name: 'Boss aura DEF', harder: 1 }
];
const WB_AURA_R = 160;
/** The boss's modifiers that aren't 0: [{ k, name, v, harder }]. */
function wbModsOf(b) { return WB_MODS.filter(m => +b[m.k]).map(m => Object.assign({ v: +b[m.k] }, m)); }
/** 5.1.1: the builds as shipped. Master control can change a boss's name, HP, defense, start money, lives and summon
    size (applyWbConfig, profile.ts); "Reset to default" goes back to these. */
const WB_DEFAULTS = WB_BOSSES.map(b => Object.assign({}, b));
/* 5.2: every World Boss road runs from a start to an END. The boss walks it slowly and keeps summoning; if it
   reaches the END the run is over. The four maps were made for this (see the World Boss info). */
const WB_MAPS: any[] = [
    { id: 'wb-jungle', tier: 'worldboss', name: 'Vine Switchback', theme: 'jungle', seed: 211, desc: 'Six long switchbacks through the jungle, top to bottom and back.',
        paths: [[[72, -30], [72, 504], [216, 504], [216, 96], [360, 96], [360, 504], [504, 504], [504, 96], [648, 96], [648, 504], [792, 504], [792, 96], [990, 96]]] },
    { id: 'wb-lava', tier: 'worldboss', name: 'Crater Spiral', theme: 'volcano', seed: 223, desc: 'The road spirals in past a lava pool and ends in the crater.',
        paths: [[[-30, 72], [888, 72], [888, 528], [72, 528], [72, 216], [720, 216], [720, 384], [288, 384]]],
        blocks: [{ k: 'lava', x: 552, y: 300, rx: 110, ry: 34 }] },
    { id: 'wb-frost', tier: 'worldboss', name: 'Frozen Bays', theme: 'snow', seed: 227, desc: 'Two bays round frozen lakes, joined by a narrow double bridge.',
        paths: [[[-30, 552], [96, 552], [96, 48], [432, 48], [432, 552], [528, 552], [528, 48], [864, 48], [864, 552], [990, 552]]],
        blocks: [{ k: 'ice', x: 264, y: 372, rx: 70, ry: 96 }, { k: 'ice', x: 696, y: 372, rx: 70, ry: 96 }] },
    { id: 'wb-arena', tier: 'worldboss', name: 'Stone Serpent', theme: 'meadow', path: 'stone', seed: 229, desc: 'A stone road that snakes back and forth down the field.',
        paths: [[[-30, 72], [864, 72], [864, 216], [96, 216], [96, 360], [864, 360], [864, 504], [-30, 504]]] }
];
/* 5.2: a World Boss fight is played in rounds, like a normal game, from round 1. Tier n comes at the start of round
   WB_TIER_ROUNDS[n - 1] (40, 60, 80, 100, 120), but never before tier n - 1 is popped. Rounds keep going while a boss
   is out, and every round pays its round bonus (Gold Mines pay every 10 seconds). All five must be popped before round
   WB_LAST_ROUND (140).
   Tier HP is a share of the boss's HP (master control): 10,000 / 20,000 / 30,000 / 40,000 / 50,000 by default. Each tier
   also walks a little faster and has more skulls: when its health drops past a skull it uses its skill, and at the
   last (flaming) skull it gets angry (faster, summons more often).
   Elite (Friday) has 2.5x HP, walks 15% faster and has one more skull per tier. */
const WB_TIERS = [
    { hp: 0.2, spd: 1, skulls: 1 }, { hp: 0.4, spd: 1.05, skulls: 2 }, { hp: 0.6, spd: 1.1, skulls: 3 }, { hp: 0.8, spd: 1.15, skulls: 4 }, { hp: 1, spd: 1.2, skulls: 5 }
];
const WB_TIER_ROUNDS = [40, 60, 80, 100, 120], WB_LAST_ROUND = 140;
/** "40, 60, 80, 100 and 120" */
function WB_TIERS_TXT() { return WB_TIER_ROUNDS.slice(0, -1).join(', ') + ' and ' + WB_TIER_ROUNDS[WB_TIER_ROUNDS.length - 1]; }
/** A round starts this long after the last one is cleared, or after WB_ROUND_MAX seconds at most (so a boss that
    keeps summoning can't hold the rounds up). */
const WB_ROUND_GAP = 1.5, WB_ROUND_MAX = 40;
const WB_ELITE = { hp: 2.5, spd: 1.15, skulls: 1 };
/** How the boss's skull skills work (WB_BOSSES[].skill). */
const WB_SKILLS = {
    dash: 'Dash: runs 3 times as fast for 2.5 seconds',
    shield: 'Shield: takes no damage for 4 seconds',
    brood: 'Brood: drops a big batch of balloons',
    swarm: 'Swarm: drops a batch of tougher balloons'
};
/** Seconds the boss needs to walk the whole road at tier 1 (Normal): the same on every map, whatever its length.
    It is busy summoning, so it is very slow: 10 minutes for a fast boss, 12 for a slow one (not counting its stops). */
function wbWalkTime(b) { return b.speed === 'Fast' ? 600 : 720; }
/** Seconds the boss stands still each time it summons. */
const WB_CAST_TIME = 1.5;
/** Seconds between summons: 15 s, then 10 s after 10 minutes, then 5 s after 20 minutes (times the boss's multiplier). */
function wbSummonGap(sec, every = 1) { return (sec >= 1200 ? 5 : sec >= 600 ? 10 : 15) * every; }
/** Summoned balloons get 1% stronger every minute, compounding: about 1.1x at 10 min, 1.2x at 20 and 1.35x at 30. */
function wbStrength(sec) { return Math.pow(1.01, sec / 60); }
/** What the boss summons, by minutes into the fight. */
function wbMob(sec) {
    const m = sec / 60;
    return m < 2 ? 'green' : m < 4 ? 'yellow' : m < 6 ? 'pink' : m < 8 ? 'black' : m < 10 ? 'white' : m < 12 ? 'lead' : m < 14 ? 'zebra' : m < 18 ? 'rainbow' : m < 24 ? 'ceramic' : m < 32 ? 'blimp' : 'brute';
}
/* ---------- Chat ---------- */
const CHAT_EMOJI = ['\u{1F600}', '\u{1F602}', '\u{1F923}', '\u{1F60A}', '\u{1F60D}', '\u{1F60E}', '\u{1F914}', '\u{1F605}', '\u{1F62D}', '\u{1F621}', '\u{1F631}', '\u{1F973}', '\u{1F634}', '\u{1F644}', '\u{1F607}', '\u{1F929}',
    '\u{1F44D}', '\u{1F44E}', '\u{1F44F}', '\u{1F64C}', '\u{1F64F}', '\u{1F4AA}', '\u{1F44B}', '\u{270C}\u{FE0F}', '\u{1F525}', '\u{1F4AF}', '\u{1F389}', '\u{1F388}', '\u{1F4A5}', '\u{2B50}', '\u{2764}\u{FE0F}', '\u{1F494}',
    '\u{1F3C6}', '\u{1F947}', '\u{1F451}', '\u{1F480}', '\u{2615}', '\u{1F355}', '\u{23F0}', '\u{2705}'];
const CHAT_MAX = 200, CHAT_GAP_MS = 3000, CHAT_KEEP_MS = 864e5;
const NOTES_MAX = 10;

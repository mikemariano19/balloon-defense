/* Balloon Defense — drawing: map background, towers, balloons, projectiles, effects, placement grid, sight shadows. */
const VIEW = { scale: 1, bg: null, last: 0, dt: 0, gridA: 0, parts: [], ambT: 0, smokeT: 0 };
const ease = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const hiFx = () => SETTINGS.effects !== 'low';
/* ---------- Background (built once per map / resize / scenery change) ---------- */
function tilePattern(c, name, fallback) {
    const sp = spr('tiles/' + name);
    if (!sp)
        return fallback;
    try {
        return c.createPattern(sp.c, 'repeat') || fallback;
    }
    catch (e) {
        return fallback;
    }
}
function strokePaths(c, paths, style, width) {
    c.strokeStyle = style;
    c.lineWidth = width;
    c.lineJoin = 'miter'; // square corners: the road covers whole grid tiles, like the build grid marks it
    c.miterLimit = 2;
    c.lineCap = 'square'; // a road that ends on the map ends on a tile edge too
    for (const p of paths) {
        c.beginPath();
        p.pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
        c.stroke();
    }
}
function inWater(map, x, y) { return (map.blocks || []).some(b => b.k === 'water' && inBlock(b, x, y, 0)); }
function buildBG(map, paths, deco, scale) {
    const theme = THEMES[map.theme], pathTile = map.path || theme.path;
    const cv2 = document.createElement('canvas');
    cv2.width = Math.round(W * scale);
    cv2.height = Math.round(H * scale);
    const c = cv2.getContext('2d');
    c.scale(scale, scale);
    c.fillStyle = tilePattern(c, theme.ground, theme.blot[0]);
    c.fillRect(0, 0, W, H);
    // soft variation so the tiling doesn't show
    const r = rng(map.seed);
    for (let i = 0; i < 70; i++) {
        c.globalAlpha = .18;
        c.fillStyle = theme.blot[i % 2];
        c.beginPath();
        c.ellipse(r() * W, r() * H, 30 + r() * 70, 20 + r() * 40, r() * 3, 0, TAU);
        c.fill();
    }
    // ground litter: petals, leaves, pebbles
    for (let i = 0; i < 260; i++) {
        const x = r() * W, y = r() * H;
        c.globalAlpha = .35 + r() * .4;
        c.fillStyle = theme.litter[i % theme.litter.length];
        c.beginPath();
        c.ellipse(x, y, 1.2 + r() * 2.2, 0.8 + r() * 1.4, r() * 3, 0, TAU);
        c.fill();
    }
    c.globalAlpha = 1;
    // lakes / lava: all rims first so overlapping pieces (streams) join up
    const blocks = map.blocks || [];
    for (const b of blocks) {
        c.save();
        if (b.k === 'lava') {
            c.shadowColor = 'rgba(255,110,0,.9)';
            c.shadowBlur = 26;
        }
        c.fillStyle = b.k === 'water' ? (map.theme === 'desert' || map.theme === 'coast' ? '#d9bf86' : '#6d8f4e') : b.k === 'ice' ? '#9fb7c9' : '#2a1d1a';
        c.beginPath();
        c.ellipse(b.x, b.y, b.rx + 8, b.ry + 8, 0, 0, TAU);
        c.fill();
        c.restore();
    }
    for (const b of blocks) {
        c.save();
        c.beginPath();
        c.ellipse(b.x, b.y, b.rx, b.ry, 0, 0, TAU);
        c.clip();
        c.fillStyle = tilePattern(c, b.k, b.k === 'water' ? '#3d8fd1' : b.k === 'ice' ? '#bfe3f5' : '#e8541a');
        c.fillRect(b.x - b.rx, b.y - b.ry, b.rx * 2, b.ry * 2);
        const g = c.createRadialGradient(b.x - b.rx * .3, b.y - b.ry * .4, 4, b.x, b.y, Math.max(b.rx, b.ry));
        g.addColorStop(0, 'rgba(255,255,255,.18)');
        g.addColorStop(1, 'rgba(0,0,40,.16)');
        c.fillStyle = g;
        c.fillRect(b.x - b.rx, b.y - b.ry, b.rx * 2, b.ry * 2);
        c.restore();
    }
    // road: a textured trail with soft, worn edges
    strokePaths(c, paths, 'rgba(0,0,0,.16)', 62);
    c.globalAlpha = .5;
    strokePaths(c, paths, theme.edge, 56);
    c.globalAlpha = 1;
    strokePaths(c, paths, theme.edge, 50);
    strokePaths(c, paths, tilePattern(c, pathTile, '#cfa974'), 43);
    const rr = rng(map.seed + 99);
    for (const p of paths)
        for (let d = 0; d < p.len; d += 7) {
            const q = posAt(p, d), nx = -Math.sin(q.a), ny = Math.cos(q.a);
            for (const side of [-1, 1]) {
                const off = side * (20 + rr() * 6);
                c.globalAlpha = .55;
                c.fillStyle = rr() < .5 ? theme.edge : 'rgba(0,0,0,.25)';
                c.beginPath();
                c.ellipse(q.x + nx * off, q.y + ny * off, 2 + rr() * 4, 1.5 + rr() * 2.5, rr() * 3, 0, TAU);
                c.fill();
            }
            if (rr() < .35) {
                const off = (rr() - .5) * 34;
                c.globalAlpha = .4;
                c.fillStyle = rr() < .5 ? 'rgba(255,255,255,.6)' : 'rgba(0,0,0,.35)';
                c.beginPath();
                c.arc(q.x + nx * off, q.y + ny * off, .8 + rr() * 1.6, 0, TAU);
                c.fill();
            }
        }
    c.globalAlpha = .1;
    strokePaths(c, paths, '#ffffff', 16);
    c.globalAlpha = 1;
    // wooden bridges where the road crosses water
    for (const p of paths)
        for (let d = 0; d < p.len; d += 9) {
            const q = posAt(p, d);
            if (!inWater(map, q.x, q.y))
                continue;
            c.save();
            c.translate(q.x, q.y);
            c.rotate(q.a);
            c.fillStyle = '#8d6e63';
            c.fillRect(-3.6, -29, 7.2, 58);
            c.fillStyle = 'rgba(0,0,0,.25)';
            c.fillRect(3, -29, 1.2, 58);
            c.fillStyle = '#5d4037';
            c.fillRect(-5, -31, 10, 4);
            c.fillRect(-5, 27, 10, 4);
            c.restore();
        }
    // entrances & exits
    const seenEnds = new Set();
    for (const p of paths) {
        const [sx, sy] = p.pts[0], [nx, ny] = p.pts[1], a = Math.atan2(ny - sy, nx - sx);
        const ex = clamp(sx, 14, W - 14), ey = clamp(sy, 14, H - 14);
        c.save();
        c.translate(ex + Math.cos(a) * 14, ey + Math.sin(a) * 14);
        c.rotate(a);
        c.fillStyle = 'rgba(255,255,255,.6)';
        for (let i = 0; i < 2; i++) {
            c.beginPath();
            c.moveTo(i * 12 - 4, -9);
            c.lineTo(i * 12 + 6, 0);
            c.lineTo(i * 12 - 4, 9);
            c.lineTo(i * 12, 0);
            c.fill();
        }
        c.restore();
        const [lx, ly] = p.pts[p.pts.length - 1], key = lx + ',' + ly;
        if (seenEnds.has(key))
            continue;
        seenEnds.add(key);
        if (lx > 0 && lx < W && ly > 0 && ly < H) {
            c.save();
            c.translate(lx, ly);
            c.fillStyle = '#6d6d6d';
            c.beginPath();
            c.arc(0, 0, 30, 0, TAU);
            c.fill();
            c.fillStyle = '#8e8e8e';
            for (let i = 0; i < 10; i++) {
                const aa = i / 10 * TAU;
                c.beginPath();
                c.arc(Math.cos(aa) * 27, Math.sin(aa) * 27, 6, 0, TAU);
                c.fill();
            }
            const g = c.createRadialGradient(0, 0, 2, 0, 0, 24);
            g.addColorStop(0, '#000');
            g.addColorStop(1, '#2b2b2b');
            c.fillStyle = g;
            c.beginPath();
            c.arc(0, 0, 23, 0, TAU);
            c.fill();
            c.restore();
        }
    }
    // scenery (frame foliage first so inner pieces overlap it)
    const order = deco.filter(o => o.frame).concat(deco.filter(o => !o.frame));
    for (const o of order) {
        if (!drawSpr(c, 'scenery/' + o.type, o.x, o.y, o.r / 22, 32, 32, o.rot)) {
            c.fillStyle = o.tall ? '#2e7d32' : '#558b2f';
            c.beginPath();
            c.arc(o.x, o.y, o.r, 0, TAU);
            c.fill();
        }
    }
    // soft edge vignette
    const vg = c.createRadialGradient(W / 2, H / 2, H * .45, W / 2, H / 2, W * .65);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.22)');
    c.fillStyle = vg;
    c.fillRect(0, 0, W, H);
    return cv2;
}
/* ---------- Towers ---------- */
function maxTier(lv) { return lv ? Math.max(lv[0] || 0, lv[1] || 0, lv[2] || 0) : 0; }
/** Upgrades show on the tower: a band in the main path's colour from tier 1, a path-specific add-on from tier 3
    (spikes, armour studs or orbiting gems), and a bigger, doubled add-on at tier 5. */
function drawPathMarks(c, x, y, R, lv, time, k) {
    const order = [0, 1, 2].filter(p => lv[p] > 0).sort((a, b) => lv[b] - lv[a]);
    if (!order.length)
        return;
    const top = order[0], tier = lv[top], col = PATH_COL[top];
    c.save();
    c.lineWidth = 3 * k;
    c.strokeStyle = col;
    c.beginPath();
    c.arc(x, y, R * .96, 0, TAU);
    c.stroke();
    if (order[1] !== undefined) { // the second path: a thinner inner band
        c.lineWidth = 1.6 * k;
        c.strokeStyle = PATH_COL[order[1]];
        c.beginPath();
        c.arc(x, y, R * .82, 0, TAU);
        c.stroke();
    }
    if (tier >= 3) {
        const n = tier >= 5 ? 2 : 1;
        c.fillStyle = col;
        c.strokeStyle = 'rgba(0,0,0,.55)';
        c.lineWidth = 1;
        if (top === 0) // spikes
            for (let i = 0; i < 6 * n; i++) {
                const a = i / (6 * n) * TAU - Math.PI / 2, r0 = R * .92, r1 = R + (tier >= 5 ? 9 : 6) * k, w = .2 / n;
                c.beginPath();
                c.moveTo(x + Math.cos(a - w) * r0, y + Math.sin(a - w) * r0);
                c.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
                c.lineTo(x + Math.cos(a + w) * r0, y + Math.sin(a + w) * r0);
                c.closePath();
                c.fill();
                c.stroke();
            }
        else if (top === 1) // armour studs
            for (let i = 0; i < 4 * n; i++) {
                const a = i / (4 * n) * TAU + Math.PI / 4, sz = (tier >= 5 ? 6 : 5) * k;
                c.save();
                c.translate(x + Math.cos(a) * R, y + Math.sin(a) * R);
                c.rotate(a);
                roundRect(c, -sz / 2, -sz / 2, sz, sz, 1.5 * k);
                c.fill();
                c.stroke();
                c.restore();
            }
        else // orbiting gems
            for (let i = 0; i < 3 * n; i++) {
                const a = time * 1.6 + i / (3 * n) * TAU, gx = x + Math.cos(a) * (R + 4 * k), gy = y + Math.sin(a) * (R + 4 * k), g = (tier >= 5 ? 3.4 : 2.8) * k;
                c.beginPath();
                c.moveTo(gx, gy - g);
                c.lineTo(gx + g, gy);
                c.lineTo(gx, gy + g);
                c.lineTo(gx - g, gy);
                c.closePath();
                c.fill();
                c.stroke();
            }
    }
    c.restore();
}
function drawTower(c, type, x, y, ang, lv, time, scale, kick?, t?) {
    const d = TD[type], mt = maxTier(lv), big = mt >= 5 ? 1.18 : mt >= 4 ? 1.12 : mt >= 3 ? 1.06 : 1, s = (d.r / 22) * (scale || 1) * big, R = d.r * (scale || 1) * big;
    const topPath = lv ? [0, 1, 2].reduce((a, p) => lv[p] > lv[a] ? p : a, 0) : 0;
    if (type === 'boat')
        y += Math.sin(time * 2 + x) * 1.5;
    if (t && t.boostT > 0) {
        c.save();
        c.globalAlpha = .5 + Math.sin(time * 12) * .2;
        c.fillStyle = '#ffb74d';
        c.beginPath();
        c.arc(x, y, R + 9, 0, TAU);
        c.fill();
        c.restore();
    }
    if (mt >= ABILITY_TIER) {
        c.save();
        const col = mt >= 4 ? PATH_COL[topPath] : '#ffd93d';
        c.shadowColor = col;
        c.shadowBlur = mt >= 5 ? 20 : 14;
        c.strokeStyle = col;
        c.lineWidth = (mt >= 5 ? 4 : 3) * (scale || 1);
        c.beginPath();
        c.arc(x, y, R + 5, 0, TAU);
        c.stroke();
        c.restore();
    }
    if (!drawSpr(c, 'towers/' + type + '-base', x, y, s)) {
        disc(c, x, y, R, d.color, 'rgba(0,0,0,.4)', 2);
    }
    if (lv)
        drawPathMarks(c, x, y, R, lv, time, scale || 1);
    let rot = ang;
    if (type === 'tack')
        rot = time * (lv && lv[0] >= 3 ? 4 : 0.8);
    if (type === 'frost')
        rot = time * 0.4;
    if (type === 'signal')
        rot = time * 1.2;
    if (type === 'mine' || type === 'tesla')
        rot = 0;
    const k = (kick || 0) * 3 * s, still = type === 'tack' || type === 'frost';
    const ox = still ? 0 : -Math.cos(ang) * k, oy = still ? 0 : -Math.sin(ang) * k;
    if (!drawSpr(c, 'towers/' + type + '-top', x + ox, y + oy, s, 32, 32, rot)) {
        c.strokeStyle = '#222';
        c.lineWidth = 4;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + Math.cos(ang) * R * 1.2, y + Math.sin(ang) * R * 1.2);
        c.stroke();
    }
    if (type === 'tesla') {
        const p = .55 + Math.sin(time * 6) * .25, Rr = R * .55;
        const g = c.createRadialGradient(x, y, 0, x, y, Rr * 1.6);
        g.addColorStop(0, 'rgba(255,255,255,' + p + ')');
        g.addColorStop(1, 'rgba(124,77,255,0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(x, y, Rr * 1.6, 0, TAU);
        c.fill();
    }
    if (type === 'tack' && lv && lv[0] >= 3) {
        c.save();
        c.globalAlpha = .35 + Math.sin(time * 10) * .15;
        c.fillStyle = '#ff7043';
        c.beginPath();
        c.arc(x, y, R * 1.1, 0, TAU);
        c.fill();
        c.restore();
    }
    if (mt >= 5) { // crown for tier 5
        c.save();
        c.translate(x, y - R - 9);
        c.fillStyle = '#ffd54f';
        c.strokeStyle = '#8d6e00';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(-8, 4);
        c.lineTo(-8, -3);
        c.lineTo(-4, 1);
        c.lineTo(0, -5);
        c.lineTo(4, 1);
        c.lineTo(8, -3);
        c.lineTo(8, 4);
        c.closePath();
        c.fill();
        c.stroke();
        c.restore();
    }
    if (t && t.buffed) {
        c.fillStyle = '#26a69a';
        c.beginPath();
        c.moveTo(x + R - 2, y - R - 2);
        c.lineTo(x + R + 4, y - R - 10);
        c.lineTo(x + R + 10, y - R - 2);
        c.closePath();
        c.fill();
        c.strokeStyle = '#e0f2f1';
        c.lineWidth = 1;
        c.stroke();
    }
    if (lv && !scale) {
        const rows = [0, 1, 2].filter(p => lv[p] > 0);
        rows.forEach((p, ri) => {
            for (let i = 0; i < PATH_MAX; i++) {
                c.fillStyle = i < lv[p] ? PATH_COL[p] : 'rgba(0,0,0,.35)';
                c.beginPath();
                c.arc(x - 10 + i * 5, y + d.r + 7 + ri * 5, 2, 0, TAU);
                c.fill();
            }
        });
    }
}
/* ---------- Balloons ---------- */
function drawBalloon(c, b, time) {
    const d = BT[b.type];
    if (d.boss)
        return drawBoss(c, b, d, time);
    if (d.blimp)
        return drawBlimp(c, b, d);
    const bob = Math.sin(time * 3 + b.wob) * 1.3, x = b.x, y = b.y + bob;
    let s = d.r / 16.5;
    if (b.born > -9) { // child balloons pop in with a short scale-up
        const k = (time - b.born) / 0.14;
        if (k < 1)
            s *= 0.55 + 0.45 * ease(k);
    }
    if (!drawSpr(c, 'balloons/' + b.type, x, y, s, 20, 20)) {
        c.fillStyle = d.col;
        c.beginPath();
        c.ellipse(x, y, d.r * .88, d.r, 0, 0, TAU);
        c.fill();
    }
    if (b.camo)
        drawSpr(c, 'balloons/camo', x, y, s, 20, 20);
    if (b.type === 'ceramic' && b.hp < b.maxHp) {
        const dmg = 1 - b.hp / b.maxHp, k = s;
        c.strokeStyle = 'rgba(40,20,10,.85)';
        c.lineWidth = 1.3;
        c.beginPath();
        const cracks = [[-6, -10, 0, -2, -4, 6], [5, -9, 2, 0, 7, 7], [-9, 2, -2, 4, 1, 12], [8, -2, 3, 5, -2, 10]];
        for (let i = 0; i < Math.ceil(dmg * 4); i++) {
            const q = cracks[i];
            c.moveTo(x + q[0] * k, y + q[1] * k);
            c.lineTo(x + q[2] * k, y + q[3] * k);
            c.lineTo(x + q[4] * k, y + q[5] * k);
        }
        c.stroke();
    }
    if (b.fort) {
        c.strokeStyle = '#cfd8dc';
        c.lineWidth = 3;
        c.beginPath();
        c.ellipse(x, y, d.r * .84, d.r * .95, 0, 0, TAU);
        c.stroke();
        c.strokeStyle = '#546e7a';
        c.lineWidth = 1;
        c.stroke();
        for (let i = 0; i < 6; i++) {
            const a = i / 6 * TAU;
            disc(c, x + Math.cos(a) * d.r * .84, y + Math.sin(a) * d.r * .95, 1.6, '#eceff1');
        }
    }
    if (b.regrow) {
        const bx = x + d.r * .62, by = y - d.r * .7;
        disc(c, bx, by, 5.5, '#2e7d32', '#e8f5e9', 1.2);
        c.strokeStyle = '#fff';
        c.lineWidth = 1.8;
        c.beginPath();
        c.moveTo(bx - 3, by);
        c.lineTo(bx + 3, by);
        c.moveTo(bx, by - 3);
        c.lineTo(bx, by + 3);
        c.stroke();
    }
    if (SETTINGS.cbMarks && CB_MARK[b.type]) {
        disc(c, x - d.r * .55, y - d.r * .6, 5.2, 'rgba(0,0,0,.75)', '#fff', 1);
        c.fillStyle = '#fff';
        c.font = '800 7px "Segoe UI", system-ui, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(CB_MARK[b.type], x - d.r * .55, y - d.r * .6 + .5);
        c.textBaseline = 'alphabetic';
    }
    if (b.flash > 0) {
        c.fillStyle = 'rgba(255,255,255,.55)';
        c.beginPath();
        c.ellipse(x, y, d.r * .85, d.r * .95, 0, 0, TAU);
        c.fill();
    }
    if (b.frozen > 0) {
        if (!drawSpr(c, 'balloons/frozen', x, y, (d.r + 5) / 22)) {
            c.fillStyle = 'rgba(179,229,252,.55)';
            c.beginPath();
            c.arc(x, y, d.r + 4, 0, TAU);
            c.fill();
        }
    }
    else if (b.slow > 0 || b.slowT > 0) {
        c.strokeStyle = 'rgba(129,212,250,.85)';
        c.lineWidth = 2;
        c.beginPath();
        c.arc(x, y, d.r + 3, 0, TAU);
        c.stroke();
    }
}
function drawBoss(c, b, d, time) {
    if (d.wb)
        return drawWorldBoss(c, b, d, time);
    const s = d.r / 34, y = b.y + Math.sin(time * 2 + b.wob) * 2;
    c.save();
    c.globalAlpha = .25;
    c.fillStyle = '#000';
    c.beginPath();
    c.ellipse(b.x + 6, b.y + d.r + 6, d.r * .8, d.r * .3, 0, 0, TAU);
    c.fill();
    c.restore();
    if (!drawSpr(c, 'balloons/boss', b.x, y, s, 40, 43))
        disc(c, b.x, y, d.r, d.col);
    if (b.flash > 0) {
        c.fillStyle = 'rgba(255,255,255,.3)';
        c.beginPath();
        c.arc(b.x, y, d.r, 0, TAU);
        c.fill();
    }
    if (b.slowT > 0) {
        c.strokeStyle = 'rgba(179,229,252,.8)';
        c.lineWidth = 3;
        c.beginPath();
        c.arc(b.x, y, d.r + 4, 0, TAU);
        c.stroke();
    }
}
/** World Boss: 5 times the Colossus. Slightly see-through so the towers under it stay visible.
    5.2: every tier looks stronger than the last (drawWbTierGear): tier 2 gets an armour band, tier 3 spikes, tier 4 a
    glowing aura and horns, tier 5 a fire aura. Elite gear is blood red. Skull skills show too: shield, dash, angry,
    and a ring while it stands still to summon. No labels: the look alone tells the tier. */
function drawWorldBoss(c, b, d, time) {
    const tier = b.tier || 1, elite = !!(game && game.wb && game.wb.elite), grow = 1 + 0.06 * (tier - 1);
    const y = b.y + Math.sin(time * 1.4 + b.wob) * 4, s = d.r / 68 * grow, R = d.r * grow;
    c.save();
    c.globalAlpha = .22;
    c.fillStyle = "#000";
    c.beginPath();
    c.ellipse(b.x + 14, b.y + R * .95, R * .75, R * .22, 0, 0, TAU);
    c.fill();
    c.restore();
    drawWbAura(c, b.x, y, R, tier, elite, time, game && game.wb && game.wb.angry);
    c.save();
    c.globalAlpha = .88;
    if (!drawSpr(c, "balloons/" + b.type, b.x, y, s, 80, 86))
        disc(c, b.x, y, R, d.col);
    // later tiers are darker and redder, like they are heating up
    if (tier >= 3 || elite) {
        c.globalAlpha = Math.min(.34, .07 * (tier - 2) + (elite ? .1 : 0));
        c.fillStyle = elite ? '#7f0000' : '#4a148c';
        c.beginPath();
        c.arc(b.x, y - R * .05, R * .86, 0, TAU);
        c.fill();
    }
    if (b.flash > 0) {
        c.globalAlpha = .18;
        c.fillStyle = "#fff";
        c.beginPath();
        c.arc(b.x, y, R * .95, 0, TAU);
        c.fill();
    }
    c.restore();
    drawWbTierGear(c, b.x, y, R, tier, elite, time);
    if (b.shieldT > 0) { // Bastion's shield
        c.save();
        c.globalAlpha = .35 + .15 * Math.sin(time * 10);
        c.fillStyle = '#4fc3f7';
        c.strokeStyle = '#e1f5fe';
        c.lineWidth = 4;
        c.beginPath();
        c.arc(b.x, y, R * 1.12, 0, TAU);
        c.fill();
        c.globalAlpha = .9;
        c.stroke();
        c.restore();
    }
    if (b.dashT > 0) { // Gale's dash: speed lines behind it
        c.save();
        c.translate(b.x, y);
        c.rotate(b.a || 0);
        c.strokeStyle = 'rgba(255,255,255,.75)';
        c.lineWidth = 4;
        c.lineCap = 'round';
        for (let i = -2; i <= 2; i++) {
            const o = ((time * 600 + i * 47) % 60);
            c.beginPath();
            c.moveTo(-R * 1.1 - o, i * R * .3);
            c.lineTo(-R * 1.6 - o, i * R * .3);
            c.stroke();
        }
        c.restore();
    }
    if (b.castT > 0) { // summoning: it stands still and a purple ring pulses out
        c.save();
        const k = 1 - b.castT / WB_CAST_TIME;
        c.globalAlpha = .6 * (1 - k);
        c.strokeStyle = elite ? '#ff1744' : '#ce93d8';
        c.lineWidth = 6;
        c.beginPath();
        c.arc(b.x, y, R * (1 + .5 * k), 0, TAU);
        c.stroke();
        c.restore();
    }
}
/** Behind the boss: a soft glow from tier 4, flames at tier 5, a red pulse while it is angry. */
function drawWbAura(c, x, y, R, tier, elite, time, angry) {
    if (tier < 4 && !elite && !angry)
        return;
    c.save();
    const pulse = .5 + .5 * Math.sin(time * 4);
    if (tier >= 4 || elite) {
        const g = c.createRadialGradient(x, y, R * .7, x, y, R * 1.45);
        g.addColorStop(0, elite ? 'rgba(255,23,68,.55)' : tier >= 5 ? 'rgba(255,109,0,.55)' : 'rgba(186,104,200,.5)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.globalAlpha = .7 + .3 * pulse;
        c.fillStyle = g;
        c.beginPath();
        c.arc(x, y, R * 1.45, 0, TAU);
        c.fill();
    }
    if (tier >= 5) { // flames licking up round it
        c.globalAlpha = .85;
        for (let i = 0; i < 14; i++) {
            const a = i / 14 * TAU, f = .75 + .25 * Math.sin(time * 9 + i * 1.7), len = R * (.35 + .25 * f);
            const bx = x + Math.cos(a) * R * .92, by = y + Math.sin(a) * R * .92;
            c.fillStyle = i % 2 ? (elite ? '#ff1744' : '#ff6d00') : '#ffd54f';
            c.beginPath();
            c.moveTo(bx + Math.cos(a + 1.57) * R * .14, by + Math.sin(a + 1.57) * R * .14);
            c.quadraticCurveTo(bx + Math.cos(a) * len * .6 + Math.cos(a + 1.2) * 10, by + Math.sin(a) * len * .6 + Math.sin(a + 1.2) * 10 - 6,
                bx + Math.cos(a) * len, by + Math.sin(a) * len - len * .35);
            c.quadraticCurveTo(bx + Math.cos(a) * len * .4, by + Math.sin(a) * len * .4, bx - Math.cos(a + 1.57) * R * .14, by - Math.sin(a + 1.57) * R * .14);
            c.fill();
        }
    }
    if (angry) {
        c.globalAlpha = .25 + .25 * pulse;
        c.strokeStyle = '#ff1744';
        c.lineWidth = 8;
        c.beginPath();
        c.arc(x, y, R * (1.05 + .05 * pulse), 0, TAU);
        c.stroke();
    }
    c.restore();
}
/** In front of the boss: armour band (tier 2+), turning spikes (tier 3+), horns (tier 4+), crown of fire (tier 5). */
function drawWbTierGear(c, x, y, R, tier, elite, time) {
    if (tier < 2)
        return;
    const metal = elite ? '#b71c1c' : tier >= 4 ? '#ffb300' : '#78909c', dark = elite ? '#3e0000' : '#263238';
    c.save();
    c.globalAlpha = .95;
    // armour band round the middle, with rivets
    c.strokeStyle = dark;
    c.lineWidth = R * .2;
    c.beginPath();
    c.ellipse(x, y + R * .12, R * .88, R * .3, 0, .15, Math.PI - .15);
    c.stroke();
    c.strokeStyle = metal;
    c.lineWidth = R * .13;
    c.stroke();
    c.fillStyle = '#eceff1';
    for (let i = 1; i < 6; i++) {
        const a = .15 + (Math.PI - .3) * i / 6;
        c.beginPath();
        c.arc(x + Math.cos(a) * R * .88, y + R * .12 + Math.sin(a) * R * .3, R * .035, 0, TAU);
        c.fill();
    }
    if (tier >= 3) { // spikes all round, turning slowly
        const n = 8 + (tier - 3) * 2, spin = time * .4;
        for (let i = 0; i < n; i++) {
            const a = spin + i / n * TAU, ca = Math.cos(a), sa = Math.sin(a), w = R * .1;
            const bx = x + ca * R * .93, by = y + sa * R * .93, tx = x + ca * R * (1.2 + .04 * tier), ty = y + sa * R * (1.2 + .04 * tier);
            c.fillStyle = dark;
            c.beginPath();
            c.moveTo(bx - sa * w * 1.25, by + ca * w * 1.25);
            c.lineTo(tx + ca * 3, ty + sa * 3);
            c.lineTo(bx + sa * w * 1.25, by - ca * w * 1.25);
            c.fill();
            c.fillStyle = metal;
            c.beginPath();
            c.moveTo(bx - sa * w, by + ca * w);
            c.lineTo(tx, ty);
            c.lineTo(bx + sa * w, by - ca * w);
            c.fill();
        }
    }
    if (tier >= 4) { // two curved horns on top
        for (const side of [-1, 1]) {
            c.fillStyle = dark;
            c.beginPath();
            c.moveTo(x + side * R * .32, y - R * .78);
            c.quadraticCurveTo(x + side * R * .85, y - R * 1.05, x + side * R * .72, y - R * 1.5);
            c.quadraticCurveTo(x + side * R * .62, y - R * 1.08, x + side * R * .12, y - R * .86);
            c.fill();
            c.fillStyle = tier >= 5 ? '#ff6d00' : '#eceff1';
            c.beginPath();
            c.moveTo(x + side * R * .66, y - R * 1.2);
            c.quadraticCurveTo(x + side * R * .78, y - R * 1.3, x + side * R * .72, y - R * 1.5);
            c.quadraticCurveTo(x + side * R * .68, y - R * 1.32, x + side * R * .58, y - R * 1.24);
            c.fill();
        }
    }
    if (tier >= 5) { // a crown of fire between the horns
        const f = Math.sin(time * 12);
        c.fillStyle = elite ? '#ff1744' : '#ff6d00';
        c.beginPath();
        c.moveTo(x - R * .3, y - R * .9);
        for (let i = 0; i <= 4; i++)
            c.lineTo(x - R * .3 + i * R * .15, y - R * (i % 2 ? .98 : 1.2 + .05 * f));
        c.lineTo(x + R * .3, y - R * .9);
        c.fill();
        c.fillStyle = '#ffd54f';
        c.beginPath();
        c.arc(x, y - R * 1.02, R * .06, 0, TAU);
        c.fill();
    }
    c.restore();
}
function drawBlimp(c, b, d) {
    const s = (d.r * 1.35) / 52;
    c.save();
    c.globalAlpha = .18;
    c.fillStyle = '#000';
    c.beginPath();
    c.ellipse(b.x + 8, b.y + d.r * .9, d.r * 1.2, d.r * .35, 0, 0, TAU);
    c.fill();
    c.restore();
    if (!drawSpr(c, 'balloons/' + b.type, b.x, b.y, s, 64, 32, b.a)) {
        c.save();
        c.translate(b.x, b.y);
        c.rotate(b.a);
        c.fillStyle = d.col;
        c.beginPath();
        c.ellipse(0, 0, d.r * 1.35, d.r * .66, 0, 0, TAU);
        c.fill();
        c.restore();
    }
    if (b.flash > 0 || b.slowT > 0 || b.frozen > 0) {
        c.save();
        c.translate(b.x, b.y);
        c.rotate(b.a);
        c.fillStyle = b.flash > 0 ? 'rgba(255,255,255,.35)' : 'rgba(179,229,252,.4)';
        c.beginPath();
        c.ellipse(4 * s, 0, 52 * s, 24 * s, 0, 0, TAU);
        c.fill();
        c.restore();
    }
    if (b.fort) {
        c.save();
        c.translate(b.x, b.y);
        c.rotate(b.a);
        c.strokeStyle = '#cfd8dc';
        c.lineWidth = 3;
        c.beginPath();
        c.ellipse(4 * s, 0, 52 * s, 24 * s, 0, 0, TAU);
        c.stroke();
        c.restore();
    }
    const w = d.r * 1.8, f = clamp(b.hp / b.maxHp, 0, 1), by = b.y - d.r - 14;
    c.fillStyle = 'rgba(0,0,0,.65)';
    roundRect(c, b.x - w / 2 - 2, by - 1, w + 4, 8, 4);
    c.fill();
    c.fillStyle = f > .5 ? '#66bb6a' : f > .25 ? '#ffca28' : '#ef5350';
    roundRect(c, b.x - w / 2, by + 1, Math.max(2, w * f), 4, 2);
    c.fill();
}
function roundRect(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect)
    c.roundRect(x, y, w, h, r);
else
    c.rect(x, y, w, h); }
/* ---------- Particles (render-only, wall clock) ---------- */
function addPart(p) { if (hiFx() && VIEW.parts.length < 320) {
    p.t = 0;
    VIEW.parts.push(p);
} }
function updateParts(c, dt) {
    const out = [];
    for (const p of VIEW.parts) {
        p.t += dt;
        if (p.t >= p.life)
            continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.k === 'leaf') {
            p.vx = Math.sin(p.t * 2 + p.ph) * 22;
        }
        if (p.k === 'firefly') {
            p.vx += (Math.random() - .5) * 40 * dt;
            p.vy += (Math.random() - .5) * 40 * dt;
        }
        out.push(p);
        const a = Math.min(1, (1 - p.t / p.life) * 1.5, p.t * 3);
        c.save();
        c.globalAlpha = a * (p.alpha || 1);
        if (p.k === 'smoke') {
            disc(c, p.x, p.y, p.r * (1 + p.t / p.life * 1.5), p.col);
        }
        else if (p.k === 'leaf') {
            c.translate(p.x, p.y);
            c.rotate(p.t * 3 + p.ph);
            c.fillStyle = p.col;
            c.beginPath();
            c.ellipse(0, 0, 4, 2, 0, 0, TAU);
            c.fill();
        }
        else if (p.k === 'firefly' || p.k === 'ember') {
            c.shadowColor = p.col;
            c.shadowBlur = 8;
            disc(c, p.x, p.y, p.r, p.col);
        }
        else
            disc(c, p.x, p.y, p.r, p.col);
        c.restore();
    }
    VIEW.parts = out;
}
function spawnAmbient(dt) {
    const kind = THEMES[game.map.theme].ambient;
    if (!hiFx() || kind === 'none')
        return;
    VIEW.ambT -= dt;
    if (VIEW.ambT > 0 || VIEW.parts.length > 160)
        return;
    VIEW.ambT = kind === 'snow' ? .08 : kind === 'leaves' ? .35 : kind === 'embers' ? .15 : kind === 'dust' ? .5 : .4;
    const x = Math.random() * W;
    if (kind === 'snow')
        addPart({ k: 'snow', x, y: -6, vx: (Math.random() - .5) * 14, vy: 26 + Math.random() * 22, r: 1.2 + Math.random() * 1.8, col: '#ffffff', life: 24, alpha: .85 });
    else if (kind === 'leaves')
        addPart({ k: 'leaf', x, y: -6, vx: 0, vy: 30 + Math.random() * 20, ph: Math.random() * 6, col: ['#e65100', '#ff8f00', '#c62828', '#f9a825'][Math.floor(Math.random() * 4)], life: 22 });
    else if (kind === 'embers')
        addPart({ k: 'ember', x, y: H + 6, vx: (Math.random() - .5) * 16, vy: -(24 + Math.random() * 30), r: 1.2 + Math.random(), col: '#ff9100', life: 18, alpha: .9 });
    else if (kind === 'dust')
        addPart({ k: 'smoke', x: -10, y: Math.random() * H, vx: 40 + Math.random() * 30, vy: (Math.random() - .5) * 6, r: 6 + Math.random() * 8, col: 'rgba(255,236,179,.35)', life: 12 });
    else
        addPart({ k: 'firefly', x, y: Math.random() * H, vx: 0, vy: 0, r: 1.6, col: '#eeff41', life: 5 + Math.random() * 4, alpha: .8 });
}
/* ---------- Projectiles & effects ---------- */
function disc(c, x, y, r, fill, stroke?, lw?) { c.fillStyle = fill; c.beginPath(); c.arc(x, y, Math.max(0.1, r), 0, TAU); c.fill(); if (stroke) {
    c.lineWidth = lw || 2;
    c.strokeStyle = stroke;
    c.stroke();
} }
function trail(c, p, len, col, w) {
    const sp = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / sp, uy = p.vy / sp;
    const g = c.createLinearGradient(p.x, p.y, p.x - ux * len, p.y - uy * len);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.strokeStyle = g;
    c.lineWidth = w;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(p.x, p.y);
    c.lineTo(p.x - ux * len, p.y - uy * len);
    c.stroke();
}
/** Projectiles are drawn 1.5x bigger than their art with a dark outline, so they show on every ground. */
const PROJ_SCALE = 1.5;
function drawProj(c, p) {
    if (p.kind === 'dart' || p.kind === 'bolt' || p.kind === 'tack' || p.kind === 'mini' || p.kind === 'cannonball') {
        const len = p.kind === 'bolt' ? 30 : p.kind === 'cannonball' ? 16 : 20;
        if (hiFx())
            trail(c, p, len, 'rgba(255,255,255,.85)', p.kind === 'bolt' ? 4.5 : 3.5);
        trail(c, p, len * .6, 'rgba(255,214,64,.9)', p.kind === 'bolt' ? 2.5 : 2); // a short bright streak even on Low effects
    }
    if (p.kind === 'missile' || p.kind === 'torpedo') {
        VIEW.smokeT += 1;
        if (VIEW.smokeT % 3 === 0)
            addPart({ k: 'smoke', x: p.x - p.vx * .02, y: p.y - p.vy * .02, vx: (Math.random() - .5) * 10, vy: (Math.random() - .5) * 10, r: p.kind === 'torpedo' ? 2.5 : 3.5, col: p.kind === 'torpedo' ? 'rgba(225,245,254,.7)' : 'rgba(189,189,189,.6)', life: .6 });
    }
    let lift = 0;
    if (p.arc) { // lobbed: arc above its shadow
        const q = clamp(p.trav / p.arc, 0, 1);
        lift = Math.sin(q * Math.PI) * Math.min(46, p.arc * .28);
        c.save();
        c.globalAlpha = .28;
        c.fillStyle = '#000';
        c.beginPath();
        c.ellipse(p.x, p.y + 2, 6 - lift / 18, 3 - lift / 40, 0, 0, TAU);
        c.fill();
        c.restore();
    }
    c.save();
    c.translate(p.x, p.y - lift);
    if (p.kind !== 'ball') // the rolling ball is already big
        c.scale(PROJ_SCALE, PROJ_SCALE);
    if (hiFx()) { // dark rim around the shape
        c.shadowColor = 'rgba(0,0,0,.9)';
        c.shadowBlur = 3;
    }
    switch (p.kind) {
        case 'dart':
            c.rotate(p.a + Math.sin(p.spin) * .12);
            c.fillStyle = '#eceff1';
            c.fillRect(-7, -1, 9, 2);
            c.fillStyle = '#ef5350';
            c.fillRect(-9, -2.2, 3, 4.4);
            c.fillStyle = '#90a4ae';
            c.beginPath();
            c.moveTo(2, -2.2);
            c.lineTo(8, 0);
            c.lineTo(2, 2.2);
            c.fill();
            break;
        case 'bolt':
            c.rotate(p.a);
            c.fillStyle = '#6d4c41';
            c.fillRect(-11, -1.3, 16, 2.6);
            c.fillStyle = '#cfd8dc';
            c.beginPath();
            c.moveTo(5, -3);
            c.lineTo(12, 0);
            c.lineTo(5, 3);
            c.fill();
            c.fillStyle = '#ffca28';
            c.fillRect(-12, -3, 4, 6);
            break;
        case 'tack':
            c.rotate(p.a);
            c.fillStyle = '#cfd8dc';
            c.beginPath();
            c.moveTo(-4, -2.2);
            c.lineTo(6, 0);
            c.lineTo(-4, 2.2);
            c.fill();
            break;
        case 'blade':
            c.rotate(p.spin);
            c.fillStyle = '#eceff1';
            c.strokeStyle = '#78909c';
            c.lineWidth = 1;
            c.beginPath();
            for (let i = 0; i < 4; i++) {
                const a = i / 4 * TAU;
                c.lineTo(Math.cos(a) * 8, Math.sin(a) * 8);
                c.lineTo(Math.cos(a + .78) * 2.5, Math.sin(a + .78) * 2.5);
            }
            c.closePath();
            c.fill();
            c.stroke();
            break;
        case 'ball': {
            const R = p.big ? 21 : 13;
            c.rotate(p.spin);
            disc(c, 0, 0, R, '#8d6e63', '#4e342e', 2);
            c.strokeStyle = '#5d4037';
            c.beginPath();
            c.moveTo(-R * .6, -R * .2);
            c.lineTo(R * .45, R * .3);
            c.moveTo(-R * .15, -R * .7);
            c.lineTo(R * .2, 0);
            c.stroke();
            break;
        }
        case 'bomb':
            disc(c, 0, 0, 6.5, '#212121', '#000', 1);
            c.fillStyle = '#ff9800';
            c.fillRect(-1, -9, 2, 3);
            if (Math.random() < .6)
                disc(c, 0, -10, 1.6 + Math.random(), '#ffeb3b');
            disc(c, -2, -2, 1.8, 'rgba(255,255,255,.5)');
            break;
        case 'mini':
            disc(c, 0, 0, 3.5, '#37474f');
            break;
        case 'cannonball':
            disc(c, 0, 0, 5.5, '#263238', '#000', 1);
            disc(c, -1.5, -1.5, 1.6, 'rgba(255,255,255,.5)');
            break;
        case 'torpedo':
            c.rotate(p.a);
            c.fillStyle = '#455a64';
            roundRect(c, -9, -3, 16, 6, 3);
            c.fill();
            c.fillStyle = '#ffca28';
            c.fillRect(5, -3, 2, 6);
            break;
        case 'missile':
            c.rotate(p.a);
            c.fillStyle = '#eceff1';
            c.fillRect(-8, -3, 13, 6);
            c.fillStyle = '#e53935';
            c.beginPath();
            c.moveTo(5, -3);
            c.lineTo(10, 0);
            c.lineTo(5, 3);
            c.fill();
            c.fillStyle = '#ff9800';
            c.beginPath();
            c.moveTo(-8, -2);
            c.lineTo(-14 - Math.random() * 4, 0);
            c.lineTo(-8, 2);
            c.fill();
            break;
    }
    c.restore();
}
const GROUND_FX = { scorch: 1, frostground: 1 };
function drawGroundFx(c, f) {
    const k = f.t / f.life;
    if (f.k === 'scorch') {
        c.save();
        c.globalAlpha = (1 - k) * .5;
        const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
        g.addColorStop(0, 'rgba(20,12,8,.9)');
        g.addColorStop(.7, 'rgba(40,25,15,.5)');
        g.addColorStop(1, 'rgba(40,25,15,0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(f.x, f.y, f.r, 0, TAU);
        c.fill();
        c.restore();
    }
}
function drawFx(c, f) {
    const k = f.t / f.life, a = 1 - k;
    c.save();
    c.globalAlpha = clamp(a, 0, 1);
    switch (f.k) {
        case 'pop': {
            // coloured fragments ease outward, spin and fade
            const e = ease(k), n = 6, sd = f.seed || 1;
            c.fillStyle = f.col;
            for (let i = 0; i < n; i++) {
                const an = (i / n) * TAU + sd, dist = f.r * (.3 + e * 1.3);
                c.save();
                c.translate(f.x + Math.cos(an) * dist, f.y + Math.sin(an) * dist);
                c.rotate(an + k * 4);
                c.beginPath();
                c.moveTo(-3, -2);
                c.quadraticCurveTo(0, -4, 3, -2);
                c.lineTo(1.5, 2);
                c.lineTo(-1.5, 2);
                c.closePath();
                c.fill();
                c.restore();
            }
            c.globalAlpha = clamp(a * .7, 0, 1);
            c.strokeStyle = '#fff';
            c.lineWidth = 1.5;
            c.beginPath();
            c.arc(f.x, f.y, f.r * (.4 + e * .7), 0, TAU);
            c.stroke();
            break;
        }
        case 'clink':
            disc(c, f.x, f.y, 3 + k * 5, '#eceff1');
            break;
        case 'spark': {
            c.strokeStyle = f.col || '#fff59d';
            c.lineWidth = 1.5;
            c.beginPath();
            for (let i = 0; i < 5; i++) {
                const an = i / 5 * TAU + 0.4, r0 = 1 + k * 4, r1 = r0 + 4 * (1 - k);
                c.moveTo(f.x + Math.cos(an) * r0, f.y + Math.sin(an) * r0);
                c.lineTo(f.x + Math.cos(an) * r1, f.y + Math.sin(an) * r1);
            }
            c.stroke();
            break;
        }
        case 'boom': {
            // flash → fireball → smoke ring, with debris
            c.globalAlpha = 1;
            if (k < .2)
                disc(c, f.x, f.y, f.r * (.3 + k * 2.5), 'rgba(255,255,240,' + (1 - k * 5) + ')');
            const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
            g.addColorStop(0, 'rgba(255,241,118,' + .95 * a + ')');
            g.addColorStop(.5, 'rgba(255,152,0,' + .7 * a + ')');
            g.addColorStop(1, 'rgba(244,67,54,0)');
            c.fillStyle = g;
            c.beginPath();
            c.arc(f.x, f.y, f.r * (.55 + ease(k) * .55), 0, TAU);
            c.fill();
            if (hiFx()) {
                c.globalAlpha = clamp(a * .5, 0, 1);
                c.strokeStyle = 'rgba(97,97,97,.8)';
                c.lineWidth = 6 * a + 1;
                c.beginPath();
                c.arc(f.x, f.y, f.r * (.7 + ease(k) * .6), 0, TAU);
                c.stroke();
                c.fillStyle = '#4e342e';
                for (let i = 0; i < 7; i++) {
                    const an = i / 7 * TAU + f.x, d = f.r * (.4 + ease(k) * 1.1);
                    c.fillRect(f.x + Math.cos(an) * d - 1.5, f.y + Math.sin(an) * d - 1.5 + k * k * 12, 3, 3);
                }
            }
            break;
        }
        case 'frost': {
            // icy shockwave with shards, plus a brief frosted ground
            const e = ease(k);
            c.globalAlpha = clamp(a * .22, 0, 1);
            c.fillStyle = '#e1f5fe';
            c.beginPath();
            c.arc(f.x, f.y, f.r, 0, TAU);
            c.fill();
            c.globalAlpha = clamp(a, 0, 1);
            c.strokeStyle = '#b3e5fc';
            c.lineWidth = 3;
            c.beginPath();
            c.arc(f.x, f.y, f.r * (.25 + e * .75), 0, TAU);
            c.stroke();
            if (hiFx()) {
                c.strokeStyle = '#ffffff';
                c.lineWidth = 1.5;
                c.beginPath();
                for (let i = 0; i < 10; i++) {
                    const an = i / 10 * TAU, r0 = f.r * (.2 + e * .7);
                    c.moveTo(f.x + Math.cos(an) * r0, f.y + Math.sin(an) * r0);
                    c.lineTo(f.x + Math.cos(an) * (r0 + 6), f.y + Math.sin(an) * (r0 + 6));
                }
                c.stroke();
            }
            break;
        }
        case 'flame': {
            // animated ring of fire tongues
            const n = hiFx() ? 22 : 10, tm = game.time;
            for (let i = 0; i < n; i++) {
                const an = i / n * TAU + tm * .8, rr = f.r * (.82 + .14 * Math.sin(tm * 9 + i * 2.1));
                const x = f.x + Math.cos(an) * rr, y = f.y + Math.sin(an) * rr, h = 7 + 5 * Math.sin(tm * 13 + i);
                const g = c.createRadialGradient(x, y, 0, x, y, h);
                g.addColorStop(0, 'rgba(255,241,118,.9)');
                g.addColorStop(.6, 'rgba(255,112,67,.6)');
                g.addColorStop(1, 'rgba(255,61,0,0)');
                c.fillStyle = g;
                c.beginPath();
                c.arc(x, y, h, 0, TAU);
                c.fill();
            }
            break;
        }
        case 'ring':
            c.strokeStyle = f.col;
            c.lineWidth = 3;
            c.beginPath();
            c.arc(f.x, f.y, f.r * (.3 + ease(k) * .7), 0, TAU);
            c.stroke();
            if (f.fill) {
                c.globalAlpha = a * .16;
                c.fillStyle = f.col;
                c.fill();
            }
            break;
        case 'line':
            c.strokeStyle = f.col;
            c.lineWidth = f.w;
            c.beginPath();
            c.moveTo(f.x1, f.y1);
            c.lineTo(f.x2, f.y2);
            c.stroke();
            break;
        case 'tracer':
            c.lineCap = 'round';
            c.strokeStyle = 'rgba(255,245,157,.35)';
            c.lineWidth = 5;
            c.beginPath();
            c.moveTo(f.x1, f.y1);
            c.lineTo(f.x2, f.y2);
            c.stroke();
            c.strokeStyle = '#fffde7';
            c.lineWidth = 1.6;
            c.stroke();
            break;
        case 'flash':
            disc(c, f.x, f.y, (f.big ? 10 : 6) * (1 - k * .5), 'rgba(255,236,150,.9)');
            break;
        case 'dust':
            for (let i = 0; i < 8; i++) {
                const an = i / 8 * TAU;
                disc(c, f.x + Math.cos(an) * (16 + ease(k) * 18), f.y + Math.sin(an) * (12 + ease(k) * 14), 4 * (1 - k) + 1, 'rgba(210,190,160,.7)');
            }
            break;
        case 'sparkle':
            for (let i = 0; i < 10; i++) {
                const an = i / 10 * TAU + k;
                disc(c, f.x + Math.cos(an) * (10 + ease(k) * 30), f.y + Math.sin(an) * (10 + ease(k) * 30) - k * 10, 2.4, f.col);
            }
            break;
        case 'bolt': {
            const path = () => {
                c.beginPath();
                for (let i = 0; i < f.pts.length; i++) {
                    const [x, y] = f.pts[i];
                    if (!i) {
                        c.moveTo(x, y);
                        continue;
                    }
                    const [px, py] = f.pts[i - 1];
                    for (let s = 1; s < 4; s++) {
                        const tt = s / 4;
                        c.lineTo(px + (x - px) * tt + (Math.random() - .5) * 10, py + (y - py) * tt + (Math.random() - .5) * 10);
                    }
                    c.lineTo(x, y);
                }
            };
            c.lineJoin = 'round';
            if (hiFx()) {
                c.strokeStyle = 'rgba(179,136,255,.45)';
                c.lineWidth = 7;
                path();
                c.stroke();
            }
            c.strokeStyle = '#ede7f6';
            c.lineWidth = 2.2;
            c.shadowColor = '#b388ff';
            c.shadowBlur = 10;
            path();
            c.stroke();
            break;
        }
        case 'num':
            c.fillStyle = f.big ? '#ffeb3b' : '#fff59d';
            c.font = (f.big ? '900 22px' : '800 12px') + ' "Segoe UI", system-ui, sans-serif';
            c.textAlign = 'center';
            c.strokeStyle = 'rgba(0,0,0,.7)';
            c.lineWidth = 3;
            c.strokeText(f.txt, f.x, f.y - ease(k) * 18);
            c.fillText(f.txt, f.x, f.y - ease(k) * 18);
            break;
        case 'screen':
            c.fillStyle = f.col;
            c.fillRect(0, 0, W, H);
            break;
        case 'txt':
            c.fillStyle = f.col;
            c.font = (f.big ? '900 20px' : '800 16px') + ' "Segoe UI", system-ui, sans-serif';
            c.textAlign = 'center';
            c.strokeStyle = 'rgba(0,0,0,.65)';
            c.lineWidth = 3.5;
            c.strokeText(f.txt, f.x, f.y - ease(k) * 26);
            c.fillText(f.txt, f.x, f.y - ease(k) * 26);
            break;
    }
    c.restore();
}
/* ---------- Ranges, sight shadows, placement grid ---------- */
function drawRange(c, x, y, r, mode?) {
    if (r > 2000)
        return;
    const col = mode === 'bad' ? [244, 67, 54] : mode === 'preview' ? [77, 150, 255] : [255, 255, 255];
    c.save();
    c.fillStyle = `rgba(${col},.13)`;
    c.strokeStyle = `rgba(${col},.75)`;
    c.lineWidth = 1.6;
    c.setLineDash([7, 5]);
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
    c.stroke();
    c.restore();
}
/** Shade the parts of a range circle hidden behind tall scenery (LS-4). */
function drawSightShadows(c, x, y, range, blockers) {
    if (!blockers || !blockers.length)
        return;
    const R = Math.min(range, 1300);
    c.save();
    c.beginPath();
    if (range > 2000)
        c.rect(0, 0, W, H);
    else
        c.arc(x, y, R, 0, TAU);
    c.clip();
    c.fillStyle = 'rgba(10,15,30,.3)';
    for (const b of blockers) {
        const dx = b.x - x, dy = b.y - y, d = Math.hypot(dx, dy);
        if (d < b.r + 2 || d > R + b.r)
            continue;
        const th = Math.atan2(dy, dx), al = Math.asin(Math.min(1, b.r / d)), far = R * 2 + 200;
        const t1 = th - al, t2 = th + al, tl = Math.sqrt(Math.max(0, d * d - b.r * b.r));
        c.beginPath();
        c.moveTo(x + Math.cos(t1) * tl, y + Math.sin(t1) * tl);
        c.lineTo(x + Math.cos(t1) * far, y + Math.sin(t1) * far);
        c.lineTo(x + Math.cos(t2) * far, y + Math.sin(t2) * far);
        c.lineTo(x + Math.cos(t2) * tl, y + Math.sin(t2) * tl);
        c.closePath();
        c.fill();
    }
    c.restore();
}
function drawGrid(c, alpha) {
    if (alpha <= 0.01)
        return;
    c.save();
    c.globalAlpha = alpha;
    c.strokeStyle = 'rgba(255,255,255,.16)';
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 1; i < COLS; i++) {
        c.moveTo(i * TILE + .5, 0);
        c.lineTo(i * TILE + .5, H);
    }
    for (let j = 1; j < ROWS; j++) {
        c.moveTo(0, j * TILE + .5);
        c.lineTo(W, j * TILE + .5);
    }
    c.stroke();
    // faintly mark tiles that can never be built on
    c.fillStyle = 'rgba(0,0,0,.12)';
    const g = game.grid;
    for (let r = 0; r < ROWS; r++)
        for (let k = 0; k < COLS; k++)
            if (g[r * COLS + k] === G_ROAD || g[r * COLS + k] === G_SCENERY)
                c.fillRect(k * TILE, r * TILE, TILE, TILE);
    c.restore();
}
function drawFootprint(c, type, x, y, ok) {
    const f = footFor(type, x, y), s = f.n * TILE;
    c.save();
    c.fillStyle = ok ? 'rgba(102,187,106,.35)' : 'rgba(239,83,80,.38)';
    c.strokeStyle = ok ? '#a5d6a7' : '#ef9a9a';
    c.lineWidth = 2;
    c.shadowColor = ok ? '#66bb6a' : '#ef5350';
    c.shadowBlur = 10;
    c.fillRect(f.x - s / 2, f.y - s / 2, s, s);
    c.strokeRect(f.x - s / 2 + 1, f.y - s / 2 + 1, s - 2, s - 2);
    c.restore();
    return f;
}
function drawLabel(c, x, y, txt, bad) {
    c.save();
    c.font = '600 13px "Segoe UI", system-ui, sans-serif';
    c.textAlign = 'center';
    const w = c.measureText(txt).width + 16;
    x = clamp(x, w / 2 + 4, W - w / 2 - 4);
    y = Math.max(20, y);
    c.fillStyle = bad ? 'rgba(120,20,20,.9)' : 'rgba(15,20,30,.85)';
    roundRect(c, x - w / 2, y - 15, w, 22, 11);
    c.fill();
    c.fillStyle = '#fff';
    c.fillText(txt, x, y + 1);
    c.restore();
}
function drawAura(c, t) {
    c.save();
    c.fillStyle = 'rgba(38,166,154,.14)';
    c.strokeStyle = 'rgba(128,203,196,.85)';
    c.lineWidth = 2;
    c.setLineDash([3, 6]);
    c.beginPath();
    c.arc(t.x, t.y, t.s.aura, 0, TAU);
    c.fill();
    c.stroke();
    c.restore();
}
/* Moving chevrons that show the route before the first round */
function drawRouteHint(c, time) {
    c.save();
    c.fillStyle = 'rgba(255,255,255,.75)';
    for (const p of game.paths) {
        for (let d = (time * 90) % 60; d < p.len; d += 60) {
            const q = posAt(p, d);
            c.save();
            c.translate(q.x, q.y);
            c.rotate(q.a);
            c.beginPath();
            c.moveTo(-5, -7);
            c.lineTo(5, 0);
            c.lineTo(-5, 7);
            c.lineTo(-2, 0);
            c.fill();
            c.restore();
        }
    }
    c.restore();
}
/* Animated water ripples, shoreline foam and lava glow (drawn every frame over the baked background) */
function drawLiquids(c, time) {
    if (!hiFx())
        return;
    for (const b of game.map.blocks || []) {
        if (b.k === 'ice')
            continue;
        c.save();
        c.beginPath();
        c.ellipse(b.x, b.y, b.rx, b.ry, 0, 0, TAU);
        c.clip();
        if (b.k === 'water') {
            c.strokeStyle = 'rgba(255,255,255,.22)';
            c.lineWidth = 1.4;
            const n = Math.max(3, Math.round(b.rx * b.ry / 2600));
            for (let i = 0; i < Math.min(n, 26); i++) {
                const px = b.x + Math.sin(i * 12.9898) * b.rx * .8, py = b.y + Math.cos(i * 78.233) * b.ry * .8;
                const ph = (time * .6 + i * .37) % 1, rr = 4 + ph * 14;
                c.globalAlpha = 1 - ph;
                c.beginPath();
                c.ellipse(px, py, rr, rr * .45, 0, Math.PI * 1.1, Math.PI * 1.9);
                c.stroke();
            }
            c.globalAlpha = .55;
            c.strokeStyle = 'rgba(255,255,255,.75)';
            c.lineWidth = 2.5;
            c.setLineDash([10, 14]);
            c.lineDashOffset = -time * 14;
            c.beginPath();
            c.ellipse(b.x, b.y, b.rx - 2, b.ry - 2, 0, 0, TAU);
            c.stroke();
        }
        else {
            c.globalAlpha = .18 + Math.sin(time * 2 + b.x) * .1;
            c.fillStyle = '#ffeb3b';
            c.fillRect(b.x - b.rx, b.y - b.ry, b.rx * 2, b.ry * 2);
        }
        c.restore();
    }
}
function render(c, ui) {
    const g = game;
    if (!g)
        return;
    const now = performance.now(), dt = VIEW.last ? Math.min(.05, (now - VIEW.last) / 1000) : 0;
    VIEW.last = now;
    VIEW.dt = dt;
    const paused = ui.paused || ui.modal;
    let sx = 0, sy = 0;
    if (g.shake > 0) {
        sx = (Math.random() - .5) * g.shake;
        sy = (Math.random() - .5) * g.shake;
        g.shake = Math.max(0, g.shake - dt * 30);
    }
    c.setTransform(VIEW.scale, 0, 0, VIEW.scale, sx * VIEW.scale, sy * VIEW.scale);
    if (VIEW.bg)
        c.drawImage(VIEW.bg, 0, 0, W, H);
    else {
        c.fillStyle = '#7cb342';
        c.fillRect(0, 0, W, H);
    }
    drawLiquids(c, now / 1000);
    for (const f of g.fx)
        if (GROUND_FX[f.k])
            drawGroundFx(c, f);
    if (g.round === 0 && !g.inRound)
        drawRouteHint(c, g.time);
    VIEW.gridA = clamp(VIEW.gridA + (ui.shop ? 1 : -1) * dt / 0.12, 0, 1);
    drawGrid(c, VIEW.gridA);
    const sel = ui.selected;
    for (const t of g.towers)
        if (t.type === 'signal' && (t === sel || t === ui.hoverTower))
            drawAura(c, t);
    if (ui.shop === 'signal' && ui.mouse.in) {
        const f = footFor('signal', ui.mouse.x, ui.mouse.y);
        drawAura(c, { x: f.x, y: f.y, s: statsFor('signal', [0, 0, 0]) });
    }
    if (sel) {
        drawRange(c, sel.x, sel.y, sel.s.range || 0);
        drawSightShadows(c, sel.x, sel.y, sel.s.range || 0, sel.blk);
        if (ui.previewRange && ui.previewRange !== sel.s.range)
            drawRange(c, sel.x, sel.y, ui.previewRange, 'preview');
    }
    else if (ui.hoverTower && !ui.shop && ui.hoverTower.s.range)
        drawRange(c, ui.hoverTower.x, ui.hoverTower.y, ui.hoverTower.s.range);
    // footprint pads
    for (const t of g.towers) {
        const h = halfSize(t.type);
        c.fillStyle = 'rgba(0,0,0,.13)';
        roundRect(c, t.x - h + 2, t.y - h + 2, h * 2 - 4, h * 2 - 4, 6);
        c.fill();
    }
    // turrets turn smoothly toward their target, with a turn-speed limit
    for (const t of g.towers) {
        let d = t.ang - t.aim;
        while (d > Math.PI)
            d -= TAU;
        while (d < -Math.PI)
            d += TAU;
        const step = (paused ? 0 : dt) * 14 * (ui.speed || 1);
        t.aim += clamp(d * Math.min(1, (paused ? 0 : dt) * 18 * (ui.speed || 1)), -step, step);
        drawTower(c, t.type, t.x, t.y, t.aim, t.lv, g.time, 0, t.kick, t);
        if (t.s.mode === 'ring' && hiFx() && t.cd > -0.5) {
            c.save();
            c.globalAlpha = .25;
            drawFx(c, { k: 'flame', x: t.x, y: t.y, r: t.s.range, t: 0, life: 1 });
            c.restore();
        }
    }
    if (sel) {
        const h = halfSize(sel.type) + 4;
        c.strokeStyle = '#ffd93d';
        c.lineWidth = 2.5;
        c.setLineDash([5, 4]);
        roundRect(c, sel.x - h, sel.y - h, h * 2, h * 2, 8);
        c.stroke();
        c.setLineDash([]);
    }
    for (const b of g.balloons)
        if (BT[b.type].blimp)
            drawBalloon(c, b, g.time);
    for (const b of g.balloons)
        if (!BT[b.type].blimp)
            drawBalloon(c, b, g.time);
    for (const p of g.projs)
        drawProj(c, p);
    for (const f of g.fx)
        if (!GROUND_FX[f.k])
            drawFx(c, f);
    if (!paused)
        spawnAmbient(dt);
    updateParts(c, paused ? 0 : dt * (ui.speed || 1));
    if (ui.hoverScenery && !ui.shop) {
        const o = ui.hoverScenery;
        c.save();
        c.strokeStyle = '#ffd93d';
        c.lineWidth = 2;
        c.setLineDash([4, 4]);
        c.beginPath();
        c.arc(o.x, o.y, o.r + 4, 0, TAU);
        c.stroke();
        c.restore();
        drawLabel(c, o.x, o.y - o.r - 12, 'Clear for ' + money(clearCost(o)), g.cash < clearCost(o));
    }
    if (ui.shop && ui.mouse.in) {
        const why = shopProblem(ui.shop) || spotProblem(ui.shop, ui.mouse.x, ui.mouse.y), s = statsFor(ui.shop, [0, 0, 0]);
        const f = drawFootprint(c, ui.shop, ui.mouse.x, ui.mouse.y, !why);
        drawRange(c, f.x, f.y, s.range || 34, why ? 'bad' : 'ok');
        if (sightBlocked(s)) {
            const R = Math.min(2000, s.range) + 160;
            drawSightShadows(c, f.x, f.y, s.range, g.blockers.filter(b => Math.hypot(b.x - f.x, b.y - f.y) < R + b.r));
        }
        c.globalAlpha = why ? .55 : .9;
        drawTower(c, ui.shop, f.x, f.y, -Math.PI / 2, null, g.time, 0);
        c.globalAlpha = 1;
        if (why)
            drawLabel(c, f.x, f.y - halfSize(ui.shop) - 14, why, true);
    }
}

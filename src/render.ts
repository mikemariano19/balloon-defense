/* Balloon Defense — drawing: map background, towers, balloons, projectiles, effects. */
const VIEW = { scale: 1, bg: null };
/* ---------- Background (built once per map / resize) ---------- */
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
    c.lineJoin = 'round';
    c.lineCap = 'round';
    for (const p of paths) {
        c.beginPath();
        p.pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
        c.stroke();
    }
}
function buildBG(map, paths, deco, scale) {
    const theme = THEMES[map.theme];
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
    c.globalAlpha = 1;
    // lakes / lava
    for (const b of map.blocks || []) {
        c.save();
        if (b.k === 'lava') {
            c.shadowColor = 'rgba(255,110,0,.9)';
            c.shadowBlur = 26;
        }
        c.fillStyle = b.k === 'water' ? '#6d8f4e' : b.k === 'ice' ? '#9fb7c9' : '#2a1d1a';
        if (map.theme === 'desert' && b.k === 'water')
            c.fillStyle = '#c9a15e';
        c.beginPath();
        c.ellipse(b.x, b.y, b.rx + 7, b.ry + 7, 0, 0, TAU);
        c.fill();
        c.restore();
        c.save();
        c.beginPath();
        c.ellipse(b.x, b.y, b.rx, b.ry, 0, 0, TAU);
        c.clip();
        c.fillStyle = tilePattern(c, b.k, b.k === 'water' ? '#3d8fd1' : b.k === 'ice' ? '#bfe3f5' : '#e8541a');
        c.fillRect(b.x - b.rx, b.y - b.ry, b.rx * 2, b.ry * 2);
        const g = c.createRadialGradient(b.x - b.rx * .3, b.y - b.ry * .4, 4, b.x, b.y, Math.max(b.rx, b.ry));
        g.addColorStop(0, 'rgba(255,255,255,.22)');
        g.addColorStop(1, 'rgba(0,0,0,.18)');
        c.fillStyle = g;
        c.fillRect(b.x - b.rx, b.y - b.ry, b.rx * 2, b.ry * 2);
        c.restore();
    }
    // road
    strokePaths(c, paths, 'rgba(0,0,0,.2)', 58);
    strokePaths(c, paths, theme.edge, 50);
    strokePaths(c, paths, tilePattern(c, theme.path, '#cfa974'), 42);
    c.globalAlpha = .12;
    strokePaths(c, paths, '#ffffff', 16);
    c.globalAlpha = 1;
    // entrances & exits
    const seenEnds = new Set();
    for (const p of paths) {
        const [sx, sy] = p.pts[0], [nx, ny] = p.pts[1], a = Math.atan2(ny - sy, nx - sx);
        const ex = clamp(sx, 14, W - 14), ey = clamp(sy, 14, H - 14);
        c.save();
        c.translate(ex + Math.cos(a) * 14, ey + Math.sin(a) * 14);
        c.rotate(a);
        c.fillStyle = 'rgba(255,255,255,.55)';
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
    // scenery
    for (const o of deco) {
        if (!drawSpr(c, 'scenery/' + o.type, o.x, o.y, o.r / 22, 32, 32, o.rot)) {
            c.fillStyle = '#2e7d32';
            c.beginPath();
            c.arc(o.x, o.y, o.r, 0, TAU);
            c.fill();
        }
    }
    return cv2;
}
/* ---------- Towers ---------- */
function drawTower(c, type, x, y, ang, lv, time, scale, kick?, t?) {
    const d = TD[type], s = (d.r / 22) * (scale || 1);
    const top = lv && (lv[0] === 3 || lv[1] === 3);
    if (type === 'boat')
        y += Math.sin(time * 2 + x) * 1.5;
    if (t && t.boostT > 0) {
        c.save();
        c.globalAlpha = .5 + Math.sin(time * 12) * .2;
        c.fillStyle = '#ffb74d';
        c.beginPath();
        c.arc(x, y, d.r * (scale || 1) + 9, 0, TAU);
        c.fill();
        c.restore();
    }
    if (top) {
        c.save();
        c.shadowColor = '#ffd93d';
        c.shadowBlur = 14;
        c.strokeStyle = '#ffd93d';
        c.lineWidth = 3 * (scale || 1);
        c.beginPath();
        c.arc(x, y, d.r * (scale || 1) + 5, 0, TAU);
        c.stroke();
        c.restore();
    }
    if (!drawSpr(c, 'towers/' + type + '-base', x, y, s)) {
        c.fillStyle = d.color;
        c.beginPath();
        c.arc(x, y, d.r * (scale || 1), 0, TAU);
        c.fill();
        c.strokeStyle = 'rgba(0,0,0,.4)';
        c.lineWidth = 2;
        c.stroke();
    }
    let rot = ang;
    if (type === 'tack')
        rot = time * (lv && lv[0] === 3 ? 4 : 0.8);
    if (type === 'frost')
        rot = time * 0.4;
    if (type === 'signal')
        rot = time * 1.2;
    if (type === 'mine' || type === 'tesla')
        rot = 0;
    const k = (kick || 0) * 3 * s;
    const ox = type === 'tack' || type === 'frost' ? 0 : -Math.cos(ang) * k, oy = type === 'tack' || type === 'frost' ? 0 : -Math.sin(ang) * k;
    if (!drawSpr(c, 'towers/' + type + '-top', x + ox, y + oy, s, 32, 32, rot)) {
        c.strokeStyle = '#222';
        c.lineWidth = 4;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + Math.cos(ang) * d.r * 1.2, y + Math.sin(ang) * d.r * 1.2);
        c.stroke();
    }
    if (type === 'tesla') {
        const p = .55 + Math.sin(time * 6) * .25, R = d.r * (scale || 1) * .55;
        const g = c.createRadialGradient(x, y, 0, x, y, R * 1.6);
        g.addColorStop(0, 'rgba(255,255,255,' + p + ')');
        g.addColorStop(1, 'rgba(124,77,255,0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(x, y, R * 1.6, 0, TAU);
        c.fill();
    }
    if (type === 'tack' && lv && lv[0] === 3) {
        c.save();
        c.globalAlpha = .35 + Math.sin(time * 10) * .15;
        c.fillStyle = '#ff7043';
        c.beginPath();
        c.arc(x, y, d.r * 1.1, 0, TAU);
        c.fill();
        c.restore();
    }
    if (t && t.buffed) {
        c.fillStyle = '#26a69a';
        c.beginPath();
        c.moveTo(x + d.r - 2, y - d.r - 2);
        c.lineTo(x + d.r + 4, y - d.r - 10);
        c.lineTo(x + d.r + 10, y - d.r - 2);
        c.closePath();
        c.fill();
        c.strokeStyle = '#e0f2f1';
        c.lineWidth = 1;
        c.stroke();
    }
    if (lv && !scale) {
        for (let p = 0; p < 2; p++)
            for (let i = 0; i < 3; i++) {
                c.fillStyle = i < lv[p] ? (p ? '#ffb74d' : '#4fc3f7') : 'rgba(0,0,0,.35)';
                c.beginPath();
                c.arc(x - 13 + p * 16 + i * 5, y + d.r + 8, 2.1, 0, TAU);
                c.fill();
            }
    }
}
/* ---------- Balloons ---------- */
function drawBalloon(c, b, time) {
    const d = BT[b.type];
    if (d.boss)
        return drawBoss(c, b, d, time);
    if (d.blimp)
        return drawBlimp(c, b, d);
    const bob = Math.sin(time * 3 + b.wob) * 1.3, s = d.r / 16.5, x = b.x, y = b.y + bob;
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
    else if (b.slow > 0) {
        c.strokeStyle = 'rgba(129,212,250,.85)';
        c.lineWidth = 2;
        c.beginPath();
        c.arc(x, y, d.r + 3, 0, TAU);
        c.stroke();
    }
}
function drawBoss(c, b, d, time) {
    const s = d.r / 34, y = b.y + Math.sin(time * 2 + b.wob) * 2;
    c.save();
    c.globalAlpha = .25;
    c.fillStyle = '#000';
    c.beginPath();
    c.ellipse(b.x + 6, b.y + d.r + 6, d.r * .8, d.r * .3, 0, 0, TAU);
    c.fill();
    c.restore();
    if (!drawSpr(c, 'balloons/boss', b.x, y, s, 40, 43)) {
        disc(c, b.x, y, d.r, d.col);
    }
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
function drawBlimp(c, b, d) {
    const s = (d.r * 1.35) / 52;
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
    if (b.flash > 0 || b.slowT > 0) {
        c.save();
        c.translate(b.x, b.y);
        c.rotate(b.a);
        c.fillStyle = b.flash > 0 ? 'rgba(255,255,255,.35)' : 'rgba(179,229,252,.35)';
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
/* ---------- Projectiles & effects ---------- */
function disc(c, x, y, r, fill, stroke?, lw?) { c.fillStyle = fill; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); if (stroke) {
    c.lineWidth = lw || 2;
    c.strokeStyle = stroke;
    c.stroke();
} }
function drawProj(c, p) {
    c.save();
    c.translate(p.x, p.y);
    switch (p.kind) {
        case 'dart':
            c.rotate(p.a);
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
        case 'ball':
            c.rotate(p.spin);
            disc(c, 0, 0, 13, '#8d6e63', '#4e342e', 2);
            c.strokeStyle = '#5d4037';
            c.beginPath();
            c.moveTo(-8, -3);
            c.lineTo(6, 4);
            c.moveTo(-2, -9);
            c.lineTo(3, 0);
            c.stroke();
            break;
        case 'bomb':
            disc(c, 0, 0, 6.5, '#212121', '#000', 1);
            c.fillStyle = '#ff9800';
            c.fillRect(-1, -9, 2, 3);
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
            c.fillStyle = 'rgba(255,255,255,.5)';
            c.fillRect(-14 - Math.random() * 4, -1, 5, 2);
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
function drawFx(c, f) {
    const k = f.t / f.life, a = 1 - k;
    c.save();
    c.globalAlpha = clamp(a, 0, 1);
    switch (f.k) {
        case 'pop': {
            c.strokeStyle = f.col;
            c.lineWidth = 2.2;
            c.beginPath();
            const r0 = f.r * .5 + k * f.r * .9, r1 = r0 + 6;
            for (let i = 0; i < 7; i++) {
                const an = i / 7 * TAU;
                c.moveTo(f.x + Math.cos(an) * r0, f.y + Math.sin(an) * r0);
                c.lineTo(f.x + Math.cos(an) * r1, f.y + Math.sin(an) * r1);
            }
            c.stroke();
            break;
        }
        case 'clink':
            disc(c, f.x, f.y, 3 + k * 5, '#eceff1');
            break;
        case 'boom': {
            const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
            g.addColorStop(0, 'rgba(255,241,118,.95)');
            g.addColorStop(.5, 'rgba(255,152,0,.7)');
            g.addColorStop(1, 'rgba(244,67,54,0)');
            c.fillStyle = g;
            c.beginPath();
            c.arc(f.x, f.y, f.r * (.6 + k * .5), 0, TAU);
            c.fill();
            break;
        }
        case 'ring':
            c.strokeStyle = f.col;
            c.lineWidth = 3;
            c.beginPath();
            c.arc(f.x, f.y, f.r * (.3 + k * .7), 0, TAU);
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
        case 'flash':
            disc(c, f.x, f.y, (f.big ? 10 : 6) * (1 - k * .5), 'rgba(255,236,150,.9)');
            break;
        case 'dust':
            for (let i = 0; i < 8; i++) {
                const an = i / 8 * TAU;
                disc(c, f.x + Math.cos(an) * (16 + k * 18), f.y + Math.sin(an) * (12 + k * 14), 4 * (1 - k) + 1, 'rgba(210,190,160,.7)');
            }
            break;
        case 'sparkle':
            for (let i = 0; i < 10; i++) {
                const an = i / 10 * TAU + k;
                disc(c, f.x + Math.cos(an) * (10 + k * 30), f.y + Math.sin(an) * (10 + k * 30) - k * 10, 2.4, f.col);
            }
            break;
        case 'bolt': {
            c.strokeStyle = '#ede7f6';
            c.lineWidth = 2.5;
            c.shadowColor = '#b388ff';
            c.shadowBlur = 10;
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
            c.stroke();
            break;
        }
        case 'num':
            c.fillStyle = '#fff59d';
            c.font = '800 12px "Segoe UI", system-ui, sans-serif';
            c.textAlign = 'center';
            c.strokeStyle = 'rgba(0,0,0,.7)';
            c.lineWidth = 3;
            c.strokeText(f.txt, f.x, f.y - k * 18);
            c.fillText(f.txt, f.x, f.y - k * 18);
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
            c.strokeText(f.txt, f.x, f.y - k * 26);
            c.fillText(f.txt, f.x, f.y - k * 26);
            break;
    }
    c.restore();
}
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
function drawLabel(c, x, y, txt, bad) {
    c.save();
    c.font = '600 13px "Segoe UI", system-ui, sans-serif';
    c.textAlign = 'center';
    const w = c.measureText(txt).width + 16;
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
function render(c, ui) {
    const g = game;
    if (!g)
        return;
    c.setTransform(VIEW.scale, 0, 0, VIEW.scale, 0, 0);
    if (VIEW.bg)
        c.drawImage(VIEW.bg, 0, 0, W, H);
    else {
        c.fillStyle = '#7cb342';
        c.fillRect(0, 0, W, H);
    }
    if (g.round === 0 && !g.inRound)
        drawRouteHint(c, g.time);
    const sel = ui.selected;
    for (const t of g.towers)
        if (t.type === 'signal' && (t === sel || t === ui.hoverTower))
            drawAura(c, t);
    if (ui.shop === 'signal' && ui.mouse.in)
        drawAura(c, { x: ui.mouse.x, y: ui.mouse.y, s: TD.signal.base });
    if (sel) {
        drawRange(c, sel.x, sel.y, sel.s.range || 0);
        if (ui.previewRange && ui.previewRange !== sel.s.range)
            drawRange(c, sel.x, sel.y, ui.previewRange, 'preview');
    }
    else if (ui.hoverTower && !ui.shop && ui.hoverTower.s.range)
        drawRange(c, ui.hoverTower.x, ui.hoverTower.y, ui.hoverTower.s.range);
    for (const t of g.towers)
        drawTower(c, t.type, t.x, t.y, t.ang, t.lv, g.time, 0, t.kick, t);
    if (sel) {
        c.strokeStyle = '#ffd93d';
        c.lineWidth = 2.5;
        c.setLineDash([5, 4]);
        c.beginPath();
        c.arc(sel.x, sel.y, TD[sel.type].r + 8, 0, TAU);
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
        drawFx(c, f);
    if (ui.shop && ui.mouse.in) {
        const why = shopProblem(ui.shop) || spotProblem(ui.shop, ui.mouse.x, ui.mouse.y), base = TD[ui.shop].base;
        drawRange(c, ui.mouse.x, ui.mouse.y, base.range || 34, why ? 'bad' : 'ok');
        c.globalAlpha = why ? .55 : .9;
        drawTower(c, ui.shop, ui.mouse.x, ui.mouse.y, -Math.PI / 2, null, g.time, 0);
        c.globalAlpha = 1;
        if (why)
            drawLabel(c, ui.mouse.x, ui.mouse.y - TD[ui.shop].r - 20, why, true);
    }
}

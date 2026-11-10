"use strict";
/* Balloon Defense — screens, HUD, side panel, modals, input and the main loop. */
const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
const UI = { shop: null, selected: null, hoverTower: null, previewRange: 0,
    mouse: { x: 0, y: 0, in: false }, speed: 1, paused: false, tier: 'beginner', menuMap: 0, menuDiff: 'medium', menuMode: 'standard',
    modal: null, sellTarget: null, bossKey: false };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n) => '$' + Math.floor(n).toLocaleString();
const tierOf = (id) => TIERS.find(t => t.id === id);
let ART_FAILED = 0;
function show(screen) { ['loading', 'menu', 'game'].forEach(s => $(s).classList.toggle('on', s === screen)); }
const inGame = () => !!game && $('game').classList.contains('on');
/* ---------- Engine callbacks ---------- */
function toast(msg, kind) {
    const box = $('toasts'), el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 3)
        box.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 2600);
}
function onLeak(_n) {
    const b = $('sLivesBox');
    b.classList.remove('hit');
    void b.offsetWidth;
    b.classList.add('hit');
    const v = $('vignette');
    v.classList.add('on');
    clearTimeout(onLeak.t);
    onLeak.t = setTimeout(() => v.classList.remove('on'), 220);
}
function onBoss(_b) { }
function onLevelUp(lv, before) {
    const unlocked = SHOP.filter(t => TD[t].unlock > before && TD[t].unlock <= lv).map(t => TD[t].name);
    if (TIER3_LEVEL > before && TIER3_LEVEL <= lv)
        unlocked.push('tier-3 upgrades and abilities');
    toast(`Level ${lv}!` + (unlocked.length ? ' Unlocked: ' + unlocked.join(', ') : ''), 'good');
    Sound.play('level');
    if (inGame()) {
        buildShop();
        renderPanel();
    }
}
function onGameOver() {
    game.over = true;
    game.inRound = false;
    saveRecord();
    clearRun();
    saveProfile();
    const mins = Math.max(1, Math.round((Date.now() - game.startedAt) / 60000));
    openModal('end', `<div style="text-align:center"><h2>Game Over</h2><p class="lead">The balloons broke through on round ${game.round}.</p></div>
    <div class="bigstats"><div><b>${game.round}</b><span>Round reached</span></div><div><b>${game.pops.toLocaleString()}</b><span>Balloons popped</span></div><div><b>${mins} min</b><span>Played</span></div></div>
    <div class="row"><button class="btn" data-act="menu"><img class="icon" src="assets/ui/home.svg" alt="">Main menu</button><button class="btn primary big" data-act="retry"><img class="icon" src="assets/ui/restart.svg" alt="">Try again</button></div>`);
}
function onVictory() {
    UI.paused = true;
    const d = game.diff, mode = game.mode !== 'standard';
    const reward = game.daily ? `<img class="medalbig" src="assets/ui/calendar.svg" alt=""><h2>Daily challenge complete!</h2>`
        : mode ? `<img class="medalbig" src="assets/ui/star.svg" alt=""><h2>Challenge complete!</h2>`
            : `<img class="medalbig" src="assets/ui/medal-${d.medal}.svg" alt=""><h2>Victory!</h2>`;
    const what = game.daily ? 'today\'s daily challenge' : `<b>${esc(game.map.name)}</b> on <b>${d.name}</b>` + (mode ? ` in <b>${MODES[game.mode].name}</b> mode` : '');
    openModal('end', `<div style="text-align:center">${reward}<p class="lead">You beat ${what}${!mode && !game.daily ? ` and earned the ${d.medal} medal` : ''}.</p></div>
    <div class="bigstats"><div><b>${game.lives}</b><span>Lives left</span></div><div><b>${game.pops.toLocaleString()}</b><span>Balloons popped</span></div><div><b>Lv ${playerLevel()}</b><span>Your level</span></div></div>
    <p class="muted" style="text-align:center;font-size:13px">Keep playing in freeplay: balloons get tougher every round.</p>
    <div class="row"><button class="btn" data-act="menu"><img class="icon" src="assets/ui/home.svg" alt="">Main menu</button><button class="btn primary big" data-act="freeplay">Continue (freeplay)</button></div>`);
}
/* ---------- Sizing ---------- */
function fit() {
    if (!inGame())
        return;
    const st = $('stage'), aw = st.clientWidth - 20, ah = st.clientHeight - 20;
    const sc = Math.max(.3, Math.min(aw / W, ah / H)), cw = Math.floor(W * sc), ch = Math.floor(H * sc);
    $('board').style.width = cw + 'px';
    $('board').style.height = ch + 'px';
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    const ns = cv.width / W;
    if (!VIEW.bg || Math.abs(ns - VIEW.scale) > .01)
        VIEW.bg = buildBG(game.map, game.paths, game.deco, Math.min(ns, 3));
    VIEW.scale = ns;
}
window.addEventListener('resize', () => { clearTimeout(fit.t); fit.t = setTimeout(fit, 60); });
/* ---------- Start / leave a game ---------- */
function startGame(cfg, snap) {
    createGame(cfg, snap);
    Object.assign(UI, { shop: null, selected: null, hoverTower: null, previewRange: 0, speed: 1, paused: false });
    closeModal();
    show('game');
    VIEW.bg = null;
    $('toasts').innerHTML = '';
    lastNextRound = -1;
    const modeTxt = game.daily ? 'Daily' : game.mode !== 'standard' ? MODES[game.mode].name : tierOf(game.map.tier).name;
    $('hMap').textContent = game.map.name;
    $('hDiff').textContent = game.diff.name + ' · ' + modeTxt;
    buildShop();
    renderPanel();
    fit();
    refreshHUD(true);
    if (!snap) {
        snapshot();
        toast(game.daily ? 'Daily challenge: ' + MODES[game.mode].name + ' on ' + game.diff.name : 'Place towers, then press START');
    }
    else if (snap.inRound) {
        UI.paused = true;
        openPause('Saved in the middle of round ' + game.round + '.');
    }
    else
        toast('Welcome back! Starting from round ' + (game.round + 1), 'good');
}
function goMenu() {
    if (game && !game.over)
        snapshot();
    saveProfile();
    closeModal();
    UI.paused = true;
    buildMenu();
    show('menu');
}
function pause() {
    if (!game || game.over || UI.modal)
        return;
    UI.paused = true;
    openPause();
}
function resume() { UI.paused = false; closeModal(); }
/* ---------- HUD ---------- */
let lastNextRound = -1;
function refreshHUD(force) {
    const g = game;
    if (!g)
        return;
    $('sLives').textContent = Math.max(0, g.lives);
    $('sCash').textContent = money(g.cash);
    $('sRound').textContent = g.round;
    $('sRoundOf').textContent = g.won ? '· freeplay' : '/ ' + g.diff.end;
    $('sProg').style.width = (g.inRound ? Math.round(100 * g.spawned / Math.max(1, g.roundTotal)) : (g.round ? 100 : 0)) + '%';
    $('gSound').querySelector('img').src = 'assets/ui/' + (SETTINGS.sound ? 'sound-on' : 'sound-off') + '.svg';
    const rb = $('roundBtn');
    if (!g.inRound) {
        $('roundIcon').src = 'assets/ui/play.svg';
        $('roundTxt').textContent = 'START';
        rb.className = (g.round === 0 && g.towers.length) || g.autoT >= 0 ? 'pulse' : '';
    }
    else {
        $('roundIcon').src = 'assets/ui/fast.svg';
        $('roundTxt').textContent = UI.speed + 'x';
        rb.className = UI.speed > 1 ? 'fast' + (UI.speed === 3 ? ' x3' : '') : '';
    }
    const nr = g.round + 1;
    if (nr !== lastNextRound || force) {
        lastNextRound = nr;
        $('nextLabel').textContent = g.inRound ? 'Next:' : 'Round ' + nr + ':';
        const merged = [];
        for (const gr of roundGroups(nr)) {
            const m = merged.find(x => x.type === gr.type && x.camo === gr.camo && !!x.regrow === !!gr.regrow && !!x.fort === !!gr.fort);
            if (m)
                m.count += gr.count;
            else
                merged.push({ ...gr });
        }
        $('nextChips').innerHTML = merged.slice(0, 6).map(m => {
            const tags = (m.camo ? 'camo ' : '') + (m.regrow ? 'regrow ' : '') + (m.fort ? 'fortified ' : '');
            return `<span class="chip${m.camo ? ' camo' : ''}${m.regrow ? ' regrow' : ''}${m.fort ? ' fort' : ''}${BT[m.type].boss ? ' boss' : ''}" title="${m.count} ${tags}${BT[m.type].name}"><img ${BT[m.type].blimp && !BT[m.type].boss ? 'class="wide"' : ''} src="assets/balloons/${m.type}.svg" alt="">${m.count}</span>`;
        }).join('');
    }
    // boss bar
    const boss = g.balloons.find(b => BT[b.type].boss && !b.dead);
    $('bossbar').classList.toggle('on', !!boss);
    if (boss) {
        $('bossHp').style.width = Math.max(0, 100 * boss.hp / boss.maxHp) + '%';
        $('bossTxt').textContent = Math.ceil(boss.hp).toLocaleString() + ' / ' + boss.maxHp.toLocaleString();
    }
    document.querySelectorAll('[data-cost]').forEach((b) => b.classList.toggle('poor', g.cash < +b.dataset.cost));
    const tp = $('tpPops');
    if (tp && UI.selected)
        tp.textContent = UI.selected.pops.toLocaleString();
    const sv = $('tpSell');
    if (sv && UI.selected)
        sv.textContent = money(sellValue(UI.selected)) + (UI.selected.fresh > 0 && UI.selected.fresh === UI.selected.spent ? ' (full refund)' : '');
    refreshAbilities();
}
setInterval(() => {
    if (inGame())
        refreshHUD();
}, 120);
/* ---------- Ability bar ---------- */
let abilityKey = '';
function refreshAbilities() {
    const list = game.towers.filter(hasAbility);
    const key = list.map(t => t.id).join(',');
    const bar = $('abilities');
    if (key !== abilityKey) {
        abilityKey = key;
        bar.innerHTML = '';
        list.slice(0, 8).forEach(t => {
            const b = document.createElement('button');
            b.className = 'abil';
            b.dataset.tid = String(t.id);
            b.title = TD[t.type].ability.name + ' — ' + TD[t.type].ability.desc;
            b.appendChild(iconCanvas(t.type, 40));
            b.insertAdjacentHTML('beforeend', '<i></i>');
            b.addEventListener('click', () => {
                const tw = game.towers.find(x => x.id === t.id);
                if (tw) {
                    useAbility(tw);
                    refreshHUD();
                }
            });
            bar.appendChild(b);
        });
    }
    bar.querySelectorAll('.abil').forEach((b) => {
        const t = game.towers.find(x => x.id === +b.dataset.tid);
        if (!t)
            return;
        const p = t.abCd > 0 ? t.abCd / TD[t.type].ability.cd : 0;
        b.style.setProperty('--p', String(p));
        b.classList.toggle('ready', !abilityProblem(t));
        b.classList.toggle('sel', t === UI.selected);
    });
}
/* ---------- Stats helpers ---------- */
function statRows(type, s) {
    if (s.mode === 'mine')
        return [['Income', money(s.income) + '/round'], ['Pop bonus', s.popBonus ? '+10%' : '—'], ['Interest', s.vault ? '8%' : '—']];
    if (s.mode === 'aura')
        return [['Aura', s.aura], ['Speed', s.buffRate ? '+' + Math.round(s.buffRate * 100) + '%' : '—'], ['Range', s.buffRange ? '+' + Math.round(s.buffRange * 100) + '%' : '—'],
            ['Damage', s.buffDmg ? '+' + s.buffDmg : '—'], ['Pierce', s.buffPierce ? '+' + s.buffPierce : '—'], ['Camo', s.buffCamo ? 'Yes' : '—']];
    const rows = [];
    rows.push(['Damage', s.mode === 'pulse' ? (s.dmg ? s.dmg + ' + freeze' : 'Freeze') : s.dmg]);
    if (s.mode === 'pulse')
        rows.push(['Freeze', s.freeze.toFixed(1) + 's']);
    else if (s.mode === 'chain')
        rows.push(['Chains', s.chains + (s.bolts > 1 ? ' ×' + s.bolts : '')]);
    else if (s.mode === 'hitscan')
        rows.push(['Pierce', 1]);
    else if (s.mode === 'ring')
        rows.push(['Hits', 'all near']);
    else
        rows.push(['Pierce', s.pierce + (s.count > 1 ? ' ×' + s.count : '')]);
    rows.push(['Speed', (1 / s.rate).toFixed(2) + '/s']);
    rows.push(['Range', s.range > 2000 ? 'Whole map' : Math.round(s.range)]);
    if (s.blast)
        rows.push(['Blast', s.blast + (s.cluster ? ' +cluster' : '')]);
    if (s.income)
        rows.push(['Income', money(s.income) + '/rd']);
    return rows;
}
function badges(type, s) {
    if (s.mode === 'mine')
        return '<span class="badge">Economy</span>';
    if (s.mode === 'aura')
        return '<span class="badge support">Support</span>';
    const b = [];
    b.push(s.camo ? '<span class="badge camo">Sees camo</span>' : '<span class="badge no">No camo</span>');
    if (s.dtype === 'sharp')
        b.push('<span class="badge no">Can\'t pop lead</span>');
    else if (s.dtype === 'explosive')
        b.push('<span class="badge no">Can\'t pop black/zebra</span>');
    else if (s.mode === 'pulse')
        b.push('<span class="badge no">Can\'t freeze white/zebra</span>');
    else
        b.push('<span class="badge lead">Pops lead</span>');
    if (s.bm > 1)
        b.push(`<span class="badge blimp">${s.bm}x vs blimps</span>`);
    if (TD[type].water)
        b.push('<span class="badge water">Water only</span>');
    return b.join('');
}
function deltas(a, b) {
    const out = [];
    if (b.dmg !== a.dmg && b.dmg !== undefined)
        out.push((b.dmg > a.dmg ? '+' : '') + (b.dmg - a.dmg) + ' dmg');
    if (b.pierce !== a.pierce && b.pierce !== undefined)
        out.push('Pierce ' + a.pierce + '→' + b.pierce);
    if (b.rate !== a.rate && b.rate)
        out.push('Speed +' + Math.round((a.rate / b.rate - 1) * 100) + '%');
    if (b.range !== a.range && b.range)
        out.push('Range +' + Math.round(b.range - a.range));
    if (b.count !== a.count && b.count)
        out.push(b.count + ' shots');
    if (b.blast !== a.blast)
        out.push('Blast +' + (b.blast - a.blast));
    if (b.chains !== a.chains)
        out.push('+' + (b.chains - a.chains) + ' chains');
    if (b.bolts !== a.bolts)
        out.push(b.bolts + ' bolts');
    if (b.income !== a.income)
        out.push('+' + money(b.income - a.income) + '/rd');
    if (b.freeze !== a.freeze)
        out.push('Freeze +' + (b.freeze - a.freeze).toFixed(1) + 's');
    if (b.aura !== a.aura)
        out.push('Aura +' + (b.aura - a.aura));
    if (b.camo && !a.camo)
        out.push('Camo');
    if (a.dtype === 'sharp' && b.dtype && b.dtype !== 'sharp')
        out.push('Pops lead');
    if (b.bm !== a.bm && b.bm > 1)
        out.push(b.bm + 'x blimp');
    return out;
}
/* ---------- Shop ---------- */
function iconCanvas(type, px) {
    const c = document.createElement('canvas');
    c.width = px * 2;
    c.height = px * 2;
    const x = c.getContext('2d');
    x.scale(2, 2);
    drawTower(x, type, px / 2, px / 2, -Math.PI / 4, null, 0, (px * .4) / TD[type].r);
    return c;
}
function buildShop() {
    const el = $('shop');
    el.innerHTML = '';
    SHOP.forEach((type, i) => {
        const d = TD[type], b = document.createElement('button'), why = shopProblem(type);
        b.className = 'shopbtn' + (why ? ' locked' : '');
        b.dataset.type = type;
        if (!why)
            b.dataset.cost = String(price(d.cost));
        b.innerHTML = `<span class="hk">${i + 1}</span>`;
        b.appendChild(iconCanvas(type, 48));
        const lock = !isUnlocked(type) ? `Lv ${d.unlock}` : !game.allowed.includes(type) ? 'Mode' : TD[type].water && !hasWater(game.map) ? 'No water' : '';
        b.insertAdjacentHTML('beforeend', `<span class="nm">${d.name}</span><span class="pr">${lock ? '<img src="assets/ui/lock.svg" alt="">' + lock : money(price(d.cost))}</span>`);
        b.addEventListener('click', () => pickShop(type));
        b.addEventListener('mouseenter', () => showInfo(type));
        b.addEventListener('mouseleave', () => showInfo(UI.shop));
        el.appendChild(b);
    });
    showInfo(null);
}
function showInfo(type) {
    const el = $('info');
    el.classList.toggle('hide', !type && !!UI.selected);
    if (!type) {
        el.innerHTML = '<div class="empty">Hover a tower to see its stats. Click it, then click the map to build. Hold <kbd>Shift</kbd> to build several.</div>';
        return;
    }
    const d = TD[type], s = d.base, why = shopProblem(type);
    el.innerHTML = `<h4>${d.name}<span>${money(price(d.cost))}</span></h4><div class="muted">${d.desc}</div>
    ${why ? `<div class="lockline"><img src="assets/ui/lock.svg" alt="">${why}</div>` : ''}
    <div class="stats">${statRows(type, s).map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div><div class="badges">${badges(type, s)}</div>
    <div class="abline"><img src="assets/ui/bolt.svg" alt=""><span><b>${d.ability.name}</b> (tier 3): ${d.ability.desc}</span></div>`;
}
function pickShop(type) {
    if (type) {
        const why = shopProblem(type);
        if (why) {
            toast(why, 'bad');
            return;
        }
    }
    UI.shop = UI.shop === type ? null : type;
    if (UI.shop) {
        UI.selected = null;
        renderPanel();
    }
    document.querySelectorAll('.shopbtn').forEach((b) => b.classList.toggle('sel', b.dataset.type === UI.shop));
    showInfo(UI.shop);
}
/* ---------- Selected tower panel ---------- */
function renderPanel() {
    const el = $('panel'), t = UI.selected;
    UI.previewRange = 0;
    if (!UI.shop)
        showInfo(null);
    if (!t) {
        el.innerHTML = '<div class="empty">No tower selected.<br>Click a tower on the map to see its stats, upgrade it or sell it.</div>';
        return;
    }
    const d = TD[t.type];
    let h = `<div class="tp"><div class="tphead"><canvas id="tpIcon" width="92" height="92"></canvas><div><div class="nm">${d.name}</div><div class="sub">Pops: <b id="tpPops">${t.pops.toLocaleString()}</b>${t.buffed ? ' · <span class="buffed">Boosted</span>' : ''}</div></div>
    <button class="x" data-act="deselect" title="Close (Esc)"><img src="assets/ui/close.svg" alt="Close"></button></div>
    <div class="stats">${statRows(t.type, t.s).map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div><div class="badges">${badges(t.type, t.s)}</div>`;
    if (hasAbility(t)) {
        const why = abilityProblem(t);
        h += `<button class="btn abilbtn${why ? '' : ' ready'}" data-act="ability"><img class="icon" src="assets/ui/bolt.svg" alt=""><span><b>${d.ability.name}</b><small>${why || d.ability.desc}</small></span><kbd>Q</kbd></button>`;
    }
    for (let p = 0; p < 2; p++) {
        const lv = t.lv[p], ups = d.paths[p], st = canUp(t, p);
        h += `<div class="path p${p}"><div class="pathhead">Path ${p + 1} <kbd>${p ? '.' : ','}</kbd><div class="pips">${[0, 1, 2].map(i => `<span class="${i < lv ? 'on' : ''}"></span>`).join('')}</div></div>`;
        if (st === 'max')
            h += `<div class="upbtn max">★ Path complete</div>`;
        else {
            const u = ups[lv], c = upgradeCost(t, p);
            if (st !== 'ok') {
                const why = st === 'locked' ? 'locked: only one path can go past tier 1' : st === 'mode' ? 'not allowed in No Tier 3 mode' : 'unlocks at level ' + TIER3_LEVEL;
                h += `<div class="upbtn locked"><img src="assets/ui/lock.svg" alt="">${u.n} — ${why}</div>`;
            }
            else {
                const nl = t.lv.slice();
                nl[p]++;
                const after = statsFor(t.type, nl), dl = deltas(t.base, after);
                if (lv === 2)
                    dl.push('Ability: ' + d.ability.name);
                h += `<button class="upbtn" data-up="${p}" data-cost="${c}" data-range="${after.range || after.aura || 0}"><div class="row"><b>${u.n}</b><em>${money(c)}</em></div><small>${u.d}</small>${dl.length ? `<div class="delta">${dl.map(x => `<span>${x}</span>`).join('')}</div>` : ''}</button>`;
            }
        }
        if (lv)
            h += `<div class="owned">Owned: ${ups.slice(0, lv).map(u => u.n).join(' · ')}</div>`;
        h += '</div>';
    }
    if (usesTarget(t.s)) {
        h += '<div class="seglabel">Target <kbd>T</kbd></div><div class="seg">' + [['first', 'First'], ['last', 'Last'], ['strong', 'Strong'], ['close', 'Close']]
            .map(([k, n]) => `<button data-tg="${k}" class="${t.target === k ? 'on' : ''}">${n}</button>`).join('') + '</div>';
    }
    h += `<button class="btn danger sell" data-act="sell">Sell for <span id="tpSell">${money(sellValue(t))}</span> <kbd>Del</kbd></button>`;
    if (t.fresh > 0)
        h += `<div class="refund">Full refund on anything bought since the last round started.</div>`;
    h += '</div>';
    el.innerHTML = h;
    const ic = $('tpIcon').getContext('2d');
    ic.scale(2, 2);
    drawTower(ic, t.type, 23, 23, -Math.PI / 4, null, 0, 17 / d.r);
    refreshHUD();
}
$('panel').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !UI.selected)
        return;
    if (b.dataset.up !== undefined) {
        if (upgrade(UI.selected, +b.dataset.up))
            renderPanel();
    }
    else if (b.dataset.tg) {
        UI.selected.target = b.dataset.tg;
        renderPanel();
    }
    else if (b.dataset.act === 'sell')
        askSell(UI.selected);
    else if (b.dataset.act === 'ability') {
        if (useAbility(UI.selected))
            renderPanel();
    }
    else if (b.dataset.act === 'deselect') {
        UI.selected = null;
        renderPanel();
    }
});
$('panel').addEventListener('mouseover', (e) => { const b = e.target.closest('[data-range]'); UI.previewRange = b ? +b.dataset.range : 0; });
$('panel').addEventListener('mouseleave', () => { UI.previewRange = 0; });
setInterval(() => {
    if (!inGame() || !UI.selected || !hasAbility(UI.selected))
        return;
    const b = document.querySelector('.abilbtn small');
    if (!b)
        return;
    const why = abilityProblem(UI.selected);
    b.textContent = why || TD[UI.selected.type].ability.desc;
    document.querySelector('.abilbtn').classList.toggle('ready', !why);
}, 300);
function askSell(t) {
    if (!SETTINGS.confirmSell) {
        doSell(t);
        return;
    }
    UI.paused = true;
    UI.sellTarget = t;
    openModal('confirm', `<h2>Sell ${TD[t.type].name}?</h2><p class="lead">You'll get back ${money(sellValue(t))}.</p>
    <div class="row"><button class="btn" data-act="close">Cancel</button><button class="btn danger" data-act="dosell">Sell</button></div>`);
}
function doSell(t) { sellTower(t); UI.selected = null; renderPanel(); refreshHUD(); }
/* ---------- Canvas input ---------- */
function canvasPos(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
function towerAt(x, y) { return game.towers.find(t => Math.hypot(t.x - x, t.y - y) < TD[t.type].r + 6) || null; }
cv.addEventListener('pointermove', (e) => {
    const p = canvasPos(e);
    Object.assign(UI.mouse, p, { in: true });
    UI.hoverTower = game && !UI.shop ? towerAt(p.x, p.y) : null;
    cv.classList.toggle('pointer', !!UI.hoverTower);
});
cv.addEventListener('pointerleave', () => { UI.mouse.in = false; UI.hoverTower = null; });
cv.addEventListener('pointerdown', (e) => {
    if (!game || game.over || UI.modal)
        return;
    if (e.button === 2)
        return;
    const p = canvasPos(e);
    Object.assign(UI.mouse, p, { in: true });
    if (UI.shop) {
        const t = placeTower(UI.shop, p.x, p.y);
        if (t && !e.shiftKey) {
            pickShop(null);
            UI.selected = t;
            renderPanel();
        }
        refreshHUD(true);
        return;
    }
    UI.selected = towerAt(p.x, p.y);
    renderPanel();
});
cv.addEventListener('contextmenu', (e) => { e.preventDefault(); pickShop(null); UI.selected = null; renderPanel(); });
/* ---------- Buttons & keys ---------- */
function roundButton() {
    if (!game || game.over)
        return;
    if (UI.paused) {
        resume();
        return;
    }
    if (!game.inRound)
        startRound();
    else
        UI.speed = UI.speed % 3 + 1;
    refreshHUD();
}
function toggleSound() {
    SETTINGS.sound = !SETTINGS.sound;
    saveSettings();
    if (SETTINGS.sound) {
        Sound.init();
        Sound.play('chime');
    }
    refreshHUD();
}
$('roundBtn').addEventListener('click', roundButton);
$('gPause').addEventListener('click', pause);
$('gSound').addEventListener('click', toggleSound);
$('gHelp').addEventListener('click', () => { UI.paused = true; openHelp(); });
$('gSettings').addEventListener('click', () => { UI.paused = true; openSettings(); });
$('mHelp').addEventListener('click', openHelp);
$('mSettings').addEventListener('click', openSettings);
$('mStats').addEventListener('click', openStats);
/* Boss key: ` hides the game behind a plain blank screen and pauses it. */
function toggleBossKey() {
    UI.bossKey = !UI.bossKey;
    $('bosskey').classList.toggle('on', UI.bossKey);
    document.title = UI.bossKey ? 'Untitled' : 'Balloon Defense';
    if (UI.bossKey && inGame() && !game.over && !UI.modal) {
        UI.paused = true;
        snapshot();
    }
}
document.addEventListener('keydown', (e) => {
    if (e.key === '`' || e.key === '~') {
        e.preventDefault();
        toggleBossKey();
        return;
    }
    if (UI.bossKey)
        return;
    if (e.key === 'Escape' && UI.modal) {
        if (UI.modal === 'pause')
            resume();
        else if (UI.modal !== 'end')
            closeModalAndResume();
        return;
    }
    if (UI.modal)
        return;
    if (!inGame())
        return;
    const k = e.key;
    if (k >= '1' && k <= '9') {
        const t = SHOP[+k - 1];
        if (t)
            pickShop(t);
    }
    else if (k === ' ') {
        e.preventDefault();
        roundButton();
    }
    else if (k === 'f' || k === 'F') {
        UI.speed = UI.speed % 3 + 1;
    }
    else if (k === 'p' || k === 'P')
        pause();
    else if (k === 'h' || k === 'H') {
        UI.paused = true;
        openHelp();
    }
    else if (k === 'm' || k === 'M')
        toggleSound();
    else if ((k === 'q' || k === 'Q') && UI.selected) {
        if (useAbility(UI.selected))
            renderPanel();
    }
    else if (k === 'Escape') {
        if (UI.shop || UI.selected) {
            pickShop(null);
            UI.selected = null;
            renderPanel();
        }
        else
            pause();
    }
    else if (k === ',') {
        if (upgrade(UI.selected, 0))
            renderPanel();
    }
    else if (k === '.') {
        if (upgrade(UI.selected, 1))
            renderPanel();
    }
    else if ((k === 'Delete' || k === 'Backspace') && UI.selected)
        askSell(UI.selected);
    else if ((k === 't' || k === 'T') && UI.selected && usesTarget(UI.selected.s)) {
        const m = ['first', 'last', 'strong', 'close'];
        UI.selected.target = m[(m.indexOf(UI.selected.target) + 1) % 4];
        renderPanel();
    }
    refreshHUD();
});
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => {
    if (SETTINGS.sound)
        Sound.init();
}, { once: false, passive: true }));
$('bosskey').addEventListener('click', toggleBossKey);
function autoPause() {
    if (SETTINGS.pauseOnBlur && inGame() && !game.over && !UI.modal)
        pause();
}
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        autoPause();
        if (game && !game.over)
            snapshot();
    }
});
window.addEventListener('blur', autoPause);
window.addEventListener('beforeunload', () => {
    if (game && !game.over)
        snapshot();
    saveProfile();
});
/* ---------- Modals ---------- */
function openModal(name, html, cls) {
    UI.modal = name;
    const c = $('modalCard');
    c.className = 'card ' + (cls || '');
    c.innerHTML = html;
    $('modal').classList.add('on');
    return c;
}
function closeModal() { UI.modal = null; $('modal').classList.remove('on'); }
function closeModalAndResume() {
    const wasGame = inGame();
    closeModal();
    if (wasGame && !game.over)
        UI.paused = false;
}
$('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') {
        if (UI.modal === 'pause')
            resume();
        else if (UI.modal !== 'end')
            closeModalAndResume();
        return;
    }
    const b = e.target.closest('[data-act]');
    if (!b)
        return;
    const a = b.dataset.act;
    if (a === 'close')
        closeModalAndResume();
    else if (a === 'resume')
        resume();
    else if (a === 'menu')
        goMenu();
    else if (a === 'retry' || a === 'restart') {
        const cfg = { mapIdx: game.mapIdx, diffKey: game.diffKey, mode: game.mode, daily: game.daily };
        clearRun();
        startGame(cfg);
    }
    else if (a === 'freeplay') {
        closeModal();
        UI.paused = false;
        if (SETTINGS.autoStart)
            game.autoT = 0.8;
    }
    else if (a === 'settings')
        openSettings();
    else if (a === 'help')
        openHelp();
    else if (a === 'dosell') {
        closeModalAndResume();
        doSell(UI.sellTarget);
    }
    else if (a === 'diff') {
        UI.menuDiff = b.dataset.diff;
        openMapModal(UI.menuMap);
    }
    else if (a === 'mode') {
        UI.menuMode = b.dataset.mode;
        openMapModal(UI.menuMap);
    }
    else if (a === 'play') {
        clearRun();
        startGame({ mapIdx: UI.menuMap, diffKey: UI.menuDiff, mode: UI.menuMode });
    }
    else if (a === 'daily') {
        clearRun();
        startGame(dailyConfig());
    }
    else if (a === 'toggle') {
        const k = b.dataset.key;
        SETTINGS[k] = !SETTINGS[k];
        saveSettings();
        b.classList.toggle('on', SETTINGS[k]);
        if (k === 'sound' && SETTINGS.sound) {
            Sound.init();
            Sound.play('chime');
        }
        if (k === 'unlockAll') {
            if (inGame()) {
                buildShop();
                renderPanel();
            }
            else
                buildMenu();
        }
    }
    else if (a === 'fx') {
        SETTINGS.effects = SETTINGS.effects === 'high' ? 'low' : 'high';
        saveSettings();
        b.classList.toggle('on', SETTINGS.effects === 'high');
    }
    else if (a === 'resetprogress') {
        if (b.dataset.armed) {
            store.save({ settings: SETTINGS });
            PROFILE = { xp: 0, games: 0, wins: 0, pops: 0, seconds: 0, rounds: 0, built: {}, bosses: 0 };
            closeModal();
            buildMenu();
            toast('Progress reset');
        }
        else {
            b.dataset.armed = '1';
            b.textContent = 'Click again to confirm';
        }
    }
});
function openPause(note) {
    openModal('pause', `<div style="text-align:center"><h2>Paused</h2><p class="lead">${esc(game.map.name)} · ${game.diff.name} · Round ${game.round}${note ? '<br>' + esc(note) : ''}</p></div>
    <div class="row" style="flex-direction:column;align-items:stretch;max-width:280px;margin:16px auto 0">
      <button class="btn primary big" data-act="resume" style="justify-content:center">Resume</button>
      <button class="btn" data-act="settings" style="justify-content:center"><img class="icon" src="assets/ui/gear.svg" alt="">Settings</button>
      <button class="btn" data-act="help" style="justify-content:center"><img class="icon" src="assets/ui/help.svg" alt="">How to play</button>
      <button class="btn" data-act="restart" style="justify-content:center"><img class="icon" src="assets/ui/restart.svg" alt="">Restart map</button>
      <button class="btn" data-act="menu" style="justify-content:center"><img class="icon" src="assets/ui/home.svg" alt="">Save &amp; main menu</button>
    </div><p class="muted" style="text-align:center;font-size:12px;margin-top:14px">Your game saves automatically every few seconds.</p>`);
}
function openSettings() {
    const row = (key, title, sub, on, act) => `<div class="setting"><div><b>${title}</b><span>${sub}</span></div><button class="toggle${on ? ' on' : ''}" data-act="${act || 'toggle'}" data-key="${key}"></button></div>`;
    openModal('settings', `<div class="cardhead"><h2>Settings</h2><button class="iconbtn x" data-act="close"><img src="assets/ui/close.svg" alt="Close"></button></div>
    ${row('sound', 'Sound effects', 'Soft pops and booms. Off by default so it stays quiet at work (M)', SETTINGS.sound)}
    ${row('autoStart', 'Auto-start rounds', 'Start the next round automatically after a short break', SETTINGS.autoStart)}
    ${row('pauseOnBlur', 'Pause when I switch windows', 'Stops the game when this window loses focus', SETTINGS.pauseOnBlur)}
    ${row('effects', 'High-quality effects', 'Turn off on slower PCs for a smoother game', SETTINGS.effects === 'high', 'fx')}
    ${row('confirmSell', 'Confirm before selling', 'Ask before selling a tower', SETTINGS.confirmSell)}
    ${row('unlockAll', 'Unlock everything', 'Skip levelling: all towers and tier-3 upgrades available now', SETTINGS.unlockAll)}
    <div class="row" style="justify-content:space-between"><button class="btn danger" data-act="resetprogress">Reset all progress</button><button class="btn primary" data-act="close">Done</button></div>`);
}
function balloonNote(t) {
    const d = BT[t];
    if (d.boss)
        return 'Boss every 10 rounds';
    if (d.blimp)
        return d.hp + ' HP, can\'t be frozen';
    if (d.imm)
        return 'Immune: ' + d.imm.join(', ');
    if (d.hp > 1)
        return d.hp + ' HP, tough shell';
    return 'Speed ' + d.spd + 'x';
}
function openHelp() {
    openModal('help', `<div class="cardhead"><h2>How to play</h2><button class="iconbtn x" data-act="close"><img src="assets/ui/close.svg" alt="Close"></button></div>
    <div class="help">
    <ul>
      <li>Pick a tower on the right, then click the grass to build it. Hold <kbd>Shift</kbd> to build several.</li>
      <li>Press the green <b>START</b> button (or <kbd>Space</kbd>) to send the next round. During a round, the same button changes the speed.</li>
      <li>Changed your mind? Anything bought since the last round started sells for a <b>full refund</b>.</li>
      <li>Each tower has 2 upgrade paths of 3 tiers; only one path can go past tier 1. A tier-3 tower gets an <b>ability</b>: click it in the bar at the bottom-left or press <kbd>Q</kbd>.</li>
      <li>The <b>Signal Tower</b> boosts towers in its aura. The <b>Gunboat</b> can only be built on water.</li>
      <li>Every 10th round brings the <b>Colossus</b> boss. It splits off balloons as it takes damage. Don't let it through!</li>
      <li>Your game saves automatically. Use <b>Continue</b> on the main menu to pick it up later.</li>
      <li>Earn XP each round to level up and unlock towers. In a hurry? Settings → Unlock everything.</li>
    </ul>
    <h3>Balloons</h3>
    <div class="bguide">${Object.keys(BT).map(t => `<div><img ${BT[t].blimp && !BT[t].boss ? 'class="wide"' : ''} src="assets/balloons/${t}.svg" alt=""><div><b>${BT[t].name}</b><span class="muted">${balloonNote(t)}</span></div></div>`).join('')}
      <div><img src="assets/balloons/camo.svg" alt="" style="background:#43a047;border-radius:50%"><div><b>Camo</b><span class="muted">Needs camo detection</span></div></div>
      <div><span class="trait regrow">+</span><div><b>Regrow</b><span class="muted">Heals a layer if left alone</span></div></div>
      <div><span class="trait fort"></span><div><b>Fortified</b><span class="muted">Takes twice the hits</span></div></div></div>
    <h3>Keys</h3>
    <div class="keys">
      <span><kbd>1</kbd>–<kbd>9</kbd></span><span>Pick a tower</span>
      <span><kbd>Space</kbd></span><span>Start round / change speed</span>
      <span><kbd>,</kbd> <kbd>.</kbd></span><span>Upgrade path 1 / path 2</span>
      <span><kbd>Q</kbd></span><span>Use the selected tower's ability</span>
      <span><kbd>T</kbd></span><span>Change targeting</span>
      <span><kbd>Del</kbd></span><span>Sell selected tower</span>
      <span><kbd>M</kbd></span><span>Sound on / off</span>
      <span><kbd>\`</kbd></span><span>Boss key: hide the game instantly</span>
      <span><kbd>Esc</kbd> / <kbd>P</kbd></span><span>Cancel / pause</span>
    </div></div>`, 'wide');
}
function openStats() {
    const p = PROFILE, L = levelOf(p.xp), next = xpForLevel(L + 1), cur = xpForLevel(L);
    const fav = Object.entries(p.built).sort((a, b) => b[1] - a[1])[0];
    const medals = medalCount(), stars = MAPS.reduce((s, m) => s + Object.keys(challengesWon(m.id)).length, 0);
    const hrs = Math.floor(p.seconds / 3600), mins = Math.floor(p.seconds / 60) % 60;
    const best = MAPS.map(m => ({ m, b: Math.max(0, ...Object.keys(DIFF).map(k => recordFor(m.id, k).best)) })).filter(x => x.b).sort((a, b) => b.b - a.b).slice(0, 5);
    openModal('stats', `<div class="cardhead"><h2>Your stats</h2><button class="iconbtn x" data-act="close"><img src="assets/ui/close.svg" alt="Close"></button></div>
    <div class="lvlbig"><b>Level ${L}</b><div class="xpbar"><i style="width:${Math.round(100 * (p.xp - cur) / (next - cur))}%"></i></div><span>${(p.xp - cur).toLocaleString()} / ${(next - cur).toLocaleString()} XP to level ${L + 1}</span></div>
    <div class="bigstats">
      <div><b>${p.pops.toLocaleString()}</b><span>Balloons popped</span></div>
      <div><b>${p.games}</b><span>Games played</span></div>
      <div><b>${p.wins}</b><span>Wins</span></div>
      <div><b>${medals} / ${MAPS.length * 3}</b><span>Medals</span></div>
      <div><b>${stars} / ${MAPS.length * CHALLENGES.length}</b><span>Challenge stars</span></div>
      <div><b>${dailyStreak()}</b><span>Daily streak</span></div>
      <div><b>${p.rounds.toLocaleString()}</b><span>Rounds survived</span></div>
      <div><b>${p.bosses}</b><span>Bosses defeated</span></div>
      <div><b>${hrs ? hrs + 'h ' : ''}${mins}m</b><span>Time played</span></div>
    </div>
    <h3 style="margin:6px 0">Favourite tower</h3><p class="muted" style="margin:0">${fav ? `${TD[fav[0]].name} (built ${fav[1]} times)` : 'Build some towers first!'}</p>
    <h3 style="margin:14px 0 6px">Best runs</h3>${best.length ? `<div class="bestlist">${best.map(x => `<div><span>${esc(x.m.name)}</span><b>Round ${x.b}</b></div>`).join('')}</div>` : '<p class="muted" style="margin:0">No runs yet.</p>'}`, 'wide');
}
/* ---------- Menu ---------- */
const previewCache = {};
function mapPreview(map, px) {
    if (!previewCache[map.id]) {
        const paths = mapPaths(map, false);
        previewCache[map.id] = buildBG(map, paths, makeDeco(map, paths), .75);
    }
    const c = document.createElement('canvas');
    c.width = px;
    c.height = Math.round(px * H / W);
    c.getContext('2d').drawImage(previewCache[map.id], 0, 0, c.width, c.height);
    return c;
}
function medalRow(map) {
    const r = records()[map.id] || {}, ch = challengesWon(map.id);
    const icons = Object.entries(DIFF).map(([k, d]) => `<img src="assets/ui/medal-${r[k] && r[k].won ? d.medal : 'none'}.svg" title="${d.name}: ${r[k] && r[k].won ? 'won' : 'not won yet'}" alt="">`).join('');
    const stars = CHALLENGES.map(m => `<img class="star" src="assets/ui/${ch[m] ? 'star' : 'star-empty'}.svg" title="${MODES[m].name}: ${ch[m] ? 'won' : 'not won yet'}" alt="">`).join('');
    const best = Math.max(0, ...Object.keys(DIFF).map(k => (r[k] && r[k].best) || 0));
    return `<div class="medals">${icons}<span class="sep"></span>${stars}<span class="best">${best ? 'Best ' + best : 'New'}</span></div>`;
}
function medalCount(filter) {
    const recs = records();
    let n = 0;
    for (const m of MAPS)
        if (!filter || m.tier === filter)
            for (const k of Object.keys(DIFF))
                if (recs[m.id] && recs[m.id][k] && recs[m.id][k].won)
                    n++;
    return n;
}
function buildMenu() {
    const run = savedRun();
    $('continueBox').classList.toggle('on', !!run);
    if (run) {
        const m = MAPS.find(x => x.id === run.mapId);
        $('contTitle').textContent = 'Continue: ' + m.name + (run.daily ? ' (daily)' : run.mode !== 'standard' ? ' · ' + MODES[run.mode].name : '');
        $('contSub').textContent = `${DIFF[run.diffKey].name} · ${run.inRound ? 'in round ' + run.round : run.round ? 'round ' + run.round + ' done' : 'not started'} · ${run.lives} lives · ${money(run.cash)} · ${run.towers.length} towers`;
    }
    const L = playerLevel(), cur = xpForLevel(L), next = xpForLevel(L + 1);
    $('lvl').innerHTML = `<b>Lv ${L}</b><div class="xpbar"><i style="width:${Math.round(100 * (PROFILE.xp - cur) / (next - cur))}%"></i></div>`;
    $('lvl').title = `${PROFILE.xp - cur} / ${next - cur} XP to level ${L + 1}`;
    // daily card
    const dc = dailyConfig(), dm = MAPS[dc.mapIdx], done = dailyDone();
    $('daily').innerHTML = `<img src="assets/ui/calendar.svg" class="dicon" alt=""><div class="grow"><b>Daily challenge${done ? ' — complete ✓' : ''}</b>
    <div class="muted">${esc(dm.name)} · ${DIFF[dc.diffKey].name} · ${MODES[dc.mode].name}${dailyStreak() ? ' · 🔥 ' + dailyStreak() + '-day streak' : ''}</div></div>
    <button class="btn ${done ? '' : 'primary'}" data-daily="1">${done ? 'Play again' : 'Play daily'}</button>`;
    $('tiers').innerHTML = TIERS.map(t => `<button class="tier${t.id === UI.tier ? ' on' : ''}" data-tier="${t.id}" style="--tc:${t.color}"><span class="dot" style="background:${t.color}"></span>${t.name}<small>${medalCount(t.id)}/${MAPS.filter(m => m.tier === t.id).length * 3}</small></button>`).join('');
    const maps = $('maps');
    maps.innerHTML = '';
    MAPS.forEach((m, i) => {
        if (m.tier !== UI.tier)
            return;
        const card = document.createElement('div');
        card.className = 'mapcard';
        card.appendChild(mapPreview(m, 640));
        const t = tierOf(m.tier);
        card.insertAdjacentHTML('beforeend', `<div class="body"><h3>${esc(m.name)}<span class="tag" style="color:${t.color}">${t.name}</span>${m.paths.length > 1 ? '<span class="tag">2 roads</span>' : ''}${hasWater(m) ? '<span class="tag water">Water</span>' : ''}</h3><p>${esc(m.desc)}</p>${medalRow(m)}</div>`);
        card.onclick = () => openMapModal(i);
        maps.appendChild(card);
    });
    $('menufoot').textContent = (ART_FAILED ? `⚠ ${ART_FAILED} art files didn't load — keep the "assets" folder next to index.html. ` : '') +
        `Medals: ${medalCount()} / ${MAPS.length * 3} · Win a map on Easy, Medium and Hard for bronze, silver and gold. Win challenge modes for stars.`;
}
$('tiers').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tier]');
    if (b) {
        UI.tier = b.dataset.tier;
        buildMenu();
    }
});
$('daily').addEventListener('click', (e) => {
    if (e.target.closest('[data-daily]')) {
        clearRun();
        startGame(dailyConfig());
    }
});
$('contGo').addEventListener('click', () => {
    const r = savedRun();
    if (r)
        startGame({ mapIdx: MAPS.findIndex(m => m.id === r.mapId), diffKey: r.diffKey, mode: r.mode || 'standard', daily: r.daily }, r);
});
$('contDiscard').addEventListener('click', () => { clearRun(); buildMenu(); });
function openMapModal(i) {
    UI.menuMap = i;
    const m = MAPS[i], t = tierOf(m.tier), run = savedRun(), ch = challengesWon(m.id);
    const c = openModal('map', `<div class="mapmodal"><div class="cardhead"><div><h2>${esc(m.name)}</h2><p class="lead" style="margin:0 0 10px"><span class="tag" style="color:${t.color}">${t.name}</span> ${esc(m.desc)}</p></div>
    <button class="iconbtn x" data-act="close"><img src="assets/ui/close.svg" alt="Close"></button></div><div id="mmPrev"></div>
    <div class="diffs">${Object.entries(DIFF).map(([k, d]) => {
        const r = recordFor(m.id, k);
        return `<button class="diff${k === UI.menuDiff ? ' on' : ''}" data-act="diff" data-diff="${k}"><div class="t">${d.name}<img src="assets/ui/medal-${r.won ? d.medal : 'none'}.svg" alt=""></div><span>${d.note}</span><span>${r.best ? 'Best: round ' + r.best : 'Not played'}</span></button>`;
    }).join('')}</div>
    <div class="modes">${Object.entries(MODES).map(([k, md]) => `<button class="mode${k === UI.menuMode ? ' on' : ''}" data-act="mode" data-mode="${k}" title="${esc(md.desc)}">${k !== 'standard' ? `<img src="assets/ui/${ch[k] ? 'star' : 'star-empty'}.svg" alt="">` : ''}${md.name}</button>`).join('')}</div>
    <p class="modedesc">${esc(MODES[UI.menuMode].desc)}</p>
    ${run ? `<div class="warnline">Starting a new game replaces your saved game on ${esc(MAPS.find(x => x.id === run.mapId).name)}.</div>` : ''}
    <div class="row"><button class="btn primary big" data-act="play">Play ${DIFF[UI.menuDiff].name}${UI.menuMode !== 'standard' ? ' · ' + MODES[UI.menuMode].name : ''}</button></div></div>`, 'wide');
    c.querySelector('#mmPrev').appendChild(mapPreview(m, 1200));
}
/* ---------- Main loop ---------- */
let last = performance.now();
function frame(now) {
    const raw = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (inGame()) {
        if (!UI.paused && !game.over && !UI.modal && !UI.bossKey) {
            for (let i = 0; i < UI.speed; i++) {
                update(raw);
                if (game.over)
                    break;
            }
            PROFILE.seconds += raw;
        }
        render(ctx, UI);
    }
    requestAnimationFrame(frame);
}
/* ---------- Boot ---------- */
loadAssets(p => { $('loadbar').style.width = Math.round(p * 100) + '%'; }).then(({ failed }) => {
    ART_FAILED = failed;
    if (failed)
        console.warn(failed + ' images failed to load; using simple shapes instead.');
    buildMenu();
    show('menu');
    requestAnimationFrame(frame);
});

"use strict";
/* Balloon Defense — screens, HUD, tower column, tower panel, upgrade tree, profiles, modals, input and the main loop. */
const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
const UI = { shop: null, selected: null, selScenery: null, hoverTower: null, hoverScenery: null, previewRange: 0,
    mouse: { x: 0, y: 0, in: false }, speed: 1, paused: false, tier: 'beginner', menuMap: 0, menuDiff: 'medium', menuMode: 'standard',
    modal: null, sellTarget: null, treeType: 'dart', treeSel: [0, 0], treeKind: 'towers', heroType: 'fern', heroLv: 10, showInfo: false, cashShown: 0, draft: null, prevScreen: 'menu',
    aim: null }; // the hero ability slot waiting for a click on the map
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n) => '$' + Math.floor(n).toLocaleString();
const tierOf = (id) => TIERS.find(t => t.id === id);
const fmtClock = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
let ART_FAILED = 0;
function show(screen) { hideTip(); ['loading', 'menu', 'game', 'tree'].forEach(s => $(s).classList.toggle('on', s === screen)); }
const inGame = () => !!game && $('game').classList.contains('on');
/* ---------- Engine callbacks ---------- */
function toast(msg, kind, ms = 2600) {
    const box = $('toasts'), el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 3)
        box.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, ms);
}
function onLeak(n) {
    const b = $('sLivesBox');
    b.classList.remove('hit');
    void b.offsetWidth;
    b.classList.add('hit');
    const v = $('vignette');
    v.classList.add('on');
    clearTimeout(onLeak.t);
    onLeak.t = setTimeout(() => v.classList.remove('on'), 220);
    // 5.1: the whole screen flashes red; bigger leaks flash stronger
    const f = $('dmgFlash');
    if (f) {
        f.style.setProperty('--dmg', String(Math.min(1, 0.45 + 0.08 * Math.max(1, +n || 1))));
        f.classList.remove('on');
        void f.offsetWidth;
        f.classList.add('on');
    }
}
function onBoss(_b) { }
function onLevelUp(lv, before) {
    const unlocked = SHOP.filter(t => TD[t].unlock > before && TD[t].unlock <= lv).map(t => TD[t].name);
    toast(`Level ${lv}!` + (unlocked.length ? ' Unlocked: ' + unlocked.join(', ') : ''), 'good');
    Sound.play('level');
    if (inGame()) {
        buildShop();
        renderPanel();
    }
}
function onTowerLevel(type, lv) { toast(`${TD[type].name} reached level ${lv}: +1 skill point`, 'good'); }
/** The hero earned XP at the end of a round: refresh its panel. */
function onHeroXp(leveled) {
    if (leveled)
        Sound.play('level');
    if (inGame() && UI.selected && TD[UI.selected.type].hero)
        renderPanel();
}
function txpLine() {
    const x = game.txpGame || {}, k = Object.keys(x).sort((a, b) => x[b] - x[a]);
    const free = game.won && game.round > game.diff.end ? `<p class="muted" style="text-align:center;font-size:12.5px">Freeplay: no tower XP after round ${game.diff.end}.</p>` : '';
    return (k.length ? `<div class="xpgain"><b>Tower XP</b>${k.map(t => `<span>${TD[t].name} <em>+${x[t].toLocaleString()}</em></span>`).join('')}</div>` : '') + free;
}
/** When a game ends (won, or lost): the daily result, the game history, a trophy for a top 3 place, the notification
    for other PCs, and an automatic backup. Once per game. `res` = submitRun's result (a ranked Standard run). */
function afterGameEnd(res) {
    const g = game;
    if (!g || g.ended)
        return;
    g.ended = true;
    saveDailyRun(g);
    let rank = 0;
    if (res && res.run && !g.wb) {
        const mine = stageRanking(g.map.id, g.diffKey, false).find(x => x.p.me);
        rank = mine && res.best ? mine.rank : 0;
        if (rank && rank <= 3) {
            const d = DIFF[g.diffKey], gain = medalGain(stageKey(g.map.id, g.diffKey, false), rank);
            addNote({ id: 'trophy-' + g.map.id + '-' + g.diffKey + '-' + res.run.at, kind: 'trophy', av: avatarOf(getId()),
                text: 'You took ' + MEDALS[rank - 1] + ' on ' + g.map.name + ' · ' + d.name + '!', sub: (gain > 0 ? '+' + gain + ' point' + (gain === 1 ? '' : 's') + ' · ' : '')
                    + (res.run.cleared ? 'Cleared · ' + res.run.livesLost + ' lives lost' : 'Round ' + res.run.round) + ' · game clock ' + fmtClock(res.run.clock) });
        }
    }
    if (g.round >= 1)
        addHistory(historyEntry(g, rank));
    const id = getId();
    if (id && id.uid && !g.wb)
        Share.postEvent(gameEvent(g, id));
    Share.autoBackup();
    Share.syncSoon();
}
function runLine(res) {
    if (!res)
        return '';
    const r = res.run;
    return `<p class="runline">${r.cleared ? (r.livesLost === 0 ? '<b class="perfect">Perfect clear!</b> ' : 'Cleared · ' + r.livesLost + ' lives lost · ') : 'Reached round ' + r.round + ' · '}game clock <b>${fmtClock(r.clock)}</b>${res.best ? ' · <b class="newbest">New personal best</b>' : ''}</p>`;
}
function onGameOver() {
    if (game.wb) { // World Boss: the run ends when lives run out; the damage dealt is the score
        game.lives = 0;
        wbEnd(false);
        return;
    }
    game.over = true;
    game.inRound = false;
    saveRecord();
    const res = submitRun();
    clearRun();
    saveProfile();
    afterGameEnd(res);
    openModal('end', `<div style="text-align:center"><h2>Game Over</h2><p class="lead">The balloons broke through on round ${game.round}.</p></div>
    <div class="bigstats"><div><b>${game.round}</b><span>Round reached</span></div><div><b>${game.pops.toLocaleString()}</b><span>Balloons popped</span></div><div><b>${fmtClock(game.clock)}</b><span>Game time</span></div></div>
    ${runLine(res)}${txpLine()}
    <div class="row"><button class="btn" data-act="menu"><img class="icon" src="assets/ui/home.svg" alt="">Home</button><button class="btn primary big" data-act="retry"><img class="icon" src="assets/ui/restart.svg" alt="">Try again</button></div>`);
}
/** A World Boss run ended (all tiers popped, the boss reached the END, lives gone, time up, or the player left): the
    result card, unless leaving for home. */
function onWorldBossEnd(res) {
    const g = game, w = g.wb, k = w.k, board = wbBoard(k, undefined, w.elite), mine = board.find(x => x.p.me);
    afterGameEnd();
    if (UI.leavingWb)
        return;
    UI.paused = true;
    const mins = Math.max(1, Math.round(w.t / 60));
    openModal('end', `${res.killed ? `<div class="confetti">${Array.from({ length: 24 }, (_, i) => `<i style="--i:${i};--c:${['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ce93d8'][i % 5]}"></i>`).join('')}</div>` : ''}
    <div style="text-align:center"><img class="wbart big" src="assets/balloons/${w.boss.id}.svg" alt=""><h2>${res.killed ? esc(w.boss.name) + ' defeated!' : 'World Boss run over'}</h2>
    <p class="lead">${res.killed ? 'You popped all ' + WB_TIERS.length + ' tiers! Kill bonus: ' + (WB_KILL_BONUS * Math.max(0, g.lives)).toLocaleString() + ' (' + WB_KILL_BONUS + ' per life left).'
        : w.escaped ? 'Tier ' + w.tier + ' reached the END after ' + mins + ' min.' : g.round >= WB_LAST_ROUND ? 'Round ' + WB_LAST_ROUND + ' came: all ' + WB_TIERS.length + ' tiers must be popped before it.' : 'The balloons broke through on round ' + g.round + '.'}</p></div>
    <div class="bigstats">${res.killed ? `<div><b>${fmtClock(w.t)}</b><span>Time · ${Math.max(0, g.lives).toLocaleString()} lives</span></div>` : `<div><b>${w.tiers} / ${WB_TIERS.length}</b><span>Tiers popped · ${res.score.toLocaleString()} damage</span></div>`}<div><b>${mine ? '#' + mine.rank : '—'}</b><span>Rank today (${w.elite ? 'Elite' : 'Normal'})</span></div><div><b>${mine ? wbResult(mine) : '0'}</b><span>Your best today</span></div></div>
    ${res.best ? '<p class="runline"><b class="newbest">New best today!</b></p>' : ''}${txpLine()}
    <div class="row"><button class="btn" data-act="menu"><img class="icon" src="assets/ui/home.svg" alt="">Home</button><button class="btn primary big" data-act="wbfight">Fight again</button></div>`);
}
/** Starts this week's World Boss fight. */
function startWorldBoss() {
    if (!loggedIn())
        return openLogin();
    const mode = wbOpenMode();
    if (!mode) {
        toast('The World Boss (' + (wbNextStart().elite ? 'Elite' : 'Normal') + ') opens ' + wbOpensTxt() + ' your time (7:30 AM PH time).', 'warn');
        return;
    }
    const k = wbWeek(), p = wbPick(k);
    startGame({ mode: 'worldboss', wbBoss: p.boss.id, wbMap: p.map.id, wbWeek: k, wbElite: mode === 'elite' });
}
function onVictory() {
    UI.paused = true;
    afterGameEnd(game.result);
    const d = game.diff, mode = game.mode !== 'standard';
    const reward = game.daily ? `<img class="medalbig" src="assets/ui/calendar.svg" alt=""><h2>Daily challenge complete!</h2>`
        : mode ? `<img class="medalbig" src="assets/ui/star.svg" alt=""><h2>Challenge complete!</h2>`
            : `<div class="medalbig">${badgeSVG(d.badge, true, 80)}</div><h2>Victory!</h2>`;
    const what = game.daily ? 'today\'s daily challenge' : `<b>${esc(game.map.name)}</b> on <b>${d.name}</b>` + (mode ? ` in <b>${MODES[game.mode].name}</b> mode` : '');
    openModal('end', `<div class="confetti">${Array.from({ length: 24 }, (_, i) => `<i style="--i:${i};--c:${['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ce93d8'][i % 5]}"></i>`).join('')}</div>
    <div style="text-align:center">${reward}<p class="lead">You beat ${what}${!mode && !game.daily ? ` and earned the ${d.name} badge` : ''}.</p></div>
    <div class="bigstats"><div><b>${game.lives}</b><span>Lives left</span></div><div><b>${game.pops.toLocaleString()}</b><span>Balloons popped</span></div><div><b>Lv ${playerLevel()}</b><span>Your level</span></div></div>
    ${runLine(game.result)}${txpLine()}
    <p class="muted" style="text-align:center;font-size:13px">Keep playing in freeplay: balloons get tougher every round.</p>
    <div class="row"><button class="btn" data-act="menu"><img class="icon" src="assets/ui/home.svg" alt="">Home</button><button class="btn primary big" data-act="freeplay">Continue (freeplay)</button></div>`);
}
/* ---------- Sizing ---------- */
function fit() {
    if (!inGame())
        return;
    const st = $('boardWrap'), aw = st.clientWidth - 8, ah = st.clientHeight - 8; // the space between the two HUD bars
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
function rebuildBG() { VIEW.bg = buildBG(game.map, game.paths, game.deco, Math.min(VIEW.scale, 3)); }
window.addEventListener('resize', () => { clearTimeout(fit.t); fit.t = setTimeout(fit, 60); });
function applyScale() { document.documentElement.style.setProperty('--ui', String((SETTINGS.uiScale || 100) / 100)); }
/* ---------- Start / leave a game ---------- */
function startGame(cfg, snap) {
    createGame(cfg, snap);
    Object.assign(UI, { aim: null, shop: null, selected: null, selScenery: null, hoverTower: null, hoverScenery: null, previewRange: 0, speed: 1, paused: false, cashShown: Math.floor(game.cash) });
    $('sCash').textContent = money(game.cash);
    VIEW.parts = [];
    closeModal();
    show('game');
    VIEW.bg = null;
    $('toasts').innerHTML = '';
    $('notes').innerHTML = ''; // home-page notes would cover the HUD
    lastNextRound = -1;
    abilityKey = null; // always rebuild the tray: '' would keep the last game's buttons when this one has none yet
    const modeTxt = game.daily ? 'Daily' : game.mode !== 'standard' ? MODES[game.mode].name : tierOf(game.map.tier).name;
    $('hMap').textContent = game.wb ? 'World Boss · ' + game.wb.boss.name + ' · ' + game.map.name : game.map.name + ' · ' + game.diff.name + ' · ' + modeTxt;
    $('game').classList.toggle('wbgame', !!game.wb);
    buildShop();
    renderPanel();
    fit();
    refreshHUD(true);
    if (!snap) {
        snapshot();
        toast(game.wb ? 'World Boss: place towers, then press PLAY to bring in ' + game.wb.boss.name : game.daily ? 'Daily challenge: ' + MODES[game.mode].name + ' on ' + game.diff.name : 'Place towers, then press PLAY');
    }
    else if (snap.inRound) {
        UI.paused = true;
        openPause('Saved in the middle of round ' + game.round + '.');
    }
    else
        toast('Welcome back! Starting from round ' + (game.round + 1), 'good');
}
function goMenu() {
    if (game && game.wb && !game.over) { // leaving a World Boss fight ends it: the damage so far counts
        UI.leavingWb = true;
        wbEnd(false);
        UI.leavingWb = false;
    }
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
/** Health fractions where the boss summons minions (engine bossCheck: 75%, 50%, 25%). */
const BOSS_MARKS = [0.75, 0.5, 0.25];
const SKULL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C7 2 4 5.6 4 10c0 2.6 1.2 4.4 3 5.5V19a1 1 0 0 0 1 1h1.5v-2h1.5v2h2v-2h1.5v2H16a1 1 0 0 0 1-1v-3.5c1.8-1.1 3-2.9 3-5.5 0-4.4-3-8-8-8Z" fill="#fff" stroke="#2a0f33" stroke-width="1.4"/><circle cx="9" cy="10.5" r="2.2" fill="#2a0f33"/><circle cx="15" cy="10.5" r="2.2" fill="#2a0f33"/><path d="M12 13l-1.3 2h2.6Z" fill="#2a0f33"/></svg>';
function refreshHUD(force) {
    const g = game;
    if (!g)
        return;
    $('sLives').textContent = Math.max(0, g.lives);
    if (g.wb) { // World Boss: rounds, up to the last one (140)
        $('sRoundLbl').textContent = 'ROUND';
        $('sRound').textContent = g.round;
        $('sRoundOf').textContent = '/' + WB_LAST_ROUND;
    }
    else {
        $('sRoundLbl').textContent = 'ROUND';
        $('sRound').textContent = g.round;
        $('sRoundOf').textContent = g.won ? ' freeplay' : '/' + g.diff.end;
    }
    // 5.1: the game clock. It is simulated time, so it stops while paused and runs 2x / 3x as fast on fast forward.
    $('sClockBox').classList.toggle('hide', !!g.wb);
    $('sClock').textContent = fmtClock(g.clock);
    $('sClockBox').classList.toggle('fast', !UI.paused && g.inRound && UI.speed > 1);
    $('sClockBox').classList.toggle('stopped', !!(UI.paused || UI.modal || !g.inRound));
    $('gSound').querySelector('img').src = 'assets/ui/' + (SETTINGS.sound ? 'sound-on' : 'sound-off') + '.svg';
    const rb = $('roundBtn');
    if (!g.inRound) {
        $('roundIcon').src = 'assets/ui/play.svg';
        $('roundTxt').textContent = 'PLAY';
        rb.className = (g.round === 0 && g.towers.length) || g.autoT >= 0 ? 'pulse' : '';
    }
    else {
        $('roundIcon').src = 'assets/ui/fast.svg';
        $('roundTxt').textContent = UI.speed + 'x';
        rb.className = 'ff' + (UI.speed > 1 ? ' fast' : '') + (UI.speed === 3 ? ' x3' : '');
    }
    const nr = g.round + 1;
    if (!g.wb && (nr !== lastNextRound || force)) {
        lastNextRound = nr;
        $('nextLabel').textContent = 'Round ' + nr + ':';
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
    $('nextBox').classList.toggle('hide', g.inRound || !!g.wb);
    const boss = g.balloons.find(b => BT[b.type].boss && !b.dead), wbOn = !!(g.wb && g.inRound && !g.over);
    $('bossbar').classList.toggle('on', !!boss || wbOn);
    $('bossbar').classList.toggle('wb', wbOn);
    $('bossbar').classList.toggle('elite', wbOn && !!g.wb.elite);
    if (wbOn) { // World Boss (5.2): name, 5 stars (one lit for each tier that has come), skulls, health, next tier
        const w = g.wb, b = w.ref && !w.ref.dead ? w.ref : null, next = wbNextTierRound(w);
        const nameKey = w.tier + ':' + w.tiers + ':' + (b ? 1 : 0) + ':' + g.round;
        if ($('bossName').dataset.k !== nameKey) {
            $('bossName').dataset.k = nameKey;
            $('bossName').innerHTML = esc(BT[w.boss.id].name.toUpperCase()) + (w.elite ? ' <i class="wbelite">ELITE</i>' : '')
                + ' <span class="wbstars" title="Boss tier ' + Math.max(1, w.tier) + ' of ' + WB_TIERS.length + '">'
                + WB_TIERS.map((_, i) => `<i class="${i < w.tier ? 'lit' : ''}${i === w.tier - 1 && b ? ' now' : ''}" title="Tier ${i + 1} (round ${WB_TIER_ROUNDS[i]})${i < w.tiers ? ': popped' : i === w.tier - 1 && b ? ': fighting now' : ''}">★</i>`).join('')
                + '</span>';
        }
        const pct = b ? Math.max(0, 100 * b.hp / b.maxHp) : 0;
        $('bossHp').style.width = pct + '%';
        $('bossHp').style.backgroundSize = pct > 0 ? (10000 / pct) + '% 100%' : '';
        const key = b ? 'wb' + w.tier + ':' + b.bossStage : 'wbx';
        if ($('bossMarks').dataset.k !== key) {
            $('bossMarks').dataset.k = key;
            $('bossMarks').innerHTML = !b ? '' : Array.from({ length: b.skulls }, (_, i) => {
                const f = 1 - (i + 1) / (b.skulls + 1), last = i === b.skulls - 1;
                return `<i class="bmark${b.bossStage > i ? ' past' : b.bossStage === i ? ' next' : ''}${last ? ' fire' : ''}" style="left:${f * 100}%" title="${last ? 'Gets angry' : 'Uses its skill'} at ${Math.round(f * 100)}% health">${SKULL}</i>`;
            }).join('');
        }
        $('bossTxt').textContent = b ? Math.ceil(b.hp).toLocaleString() + ' / ' + b.maxHp.toLocaleString() + (b.shieldT > 0 ? ' · SHIELD' : w.angry ? ' · ANGRY' : '') + (next ? ' · next boss R' + next : '')
            : next ? 'Next boss on round ' + next + (next > g.round ? ' (in ' + (next - g.round) + ')' : '') : '';
    }
    else if (boss) {
        $('bossName').textContent = 'COLOSSUS';
        $('bossName').dataset.k = '';
        $('bossHp').style.width = Math.max(0, 100 * boss.hp / boss.maxHp) + '%';
        $('bossHp').style.backgroundSize = '';
        // a skull at each health mark where the Colossus summons minions (75%, 50%, 25%); dimmed once passed
        const marks = BOSS_MARKS.map((f, i) => `<i class="bmark${boss.bossStage > i ? ' past' : boss.bossStage === i ? ' next' : ''}" style="left:${f * 100}%" title="Summons minions at ${Math.round(f * 100)}% health">${SKULL}</i>`).join('');
        if ($('bossMarks').dataset.k !== String(boss.bossStage)) {
            $('bossMarks').dataset.k = String(boss.bossStage);
            $('bossMarks').innerHTML = marks;
        }
        // FX-3: the skulls show where it summons; the text is just the health left
        $('bossTxt').textContent = Math.ceil(boss.hp).toLocaleString() + ' / ' + boss.maxHp.toLocaleString();
    }
    document.querySelectorAll('[data-cost]').forEach((b) => b.classList.toggle('poor', g.cash < +b.dataset.cost));
    const tp = $('tpPops');
    if (tp && UI.selected)
        tp.textContent = UI.selected.pops.toLocaleString();
    const sv = $('tpSell');
    if (sv && UI.selected)
        sv.textContent = money(sellValue(UI.selected));
    refreshAbilities();
}
setInterval(() => {
    if (inGame())
        refreshHUD();
}, 120);
/** Cash counts up/down smoothly to its real value (GR-6). */
function tickCash() {
    const target = Math.floor(game.cash), cur = UI.cashShown;
    if (cur === target)
        return;
    const d = target - cur, step = Math.abs(d) < 3 ? d : d * 0.25;
    UI.cashShown = Math.abs(d) < 3 ? target : Math.round(cur + step);
    $('sCash').textContent = money(UI.cashShown);
}
/* ---------- Ability tray ---------- */
let abilityKey = '';
/** 5.1.2: ability hotkeys. Q W E R T Y U use the 1st–7th ability on the tray (left to right). Shift + a tower's
    number key still works as a backup, so every tower type keeps a key. */
const ABIL_KEYS = 'QWERTYU';
function abilityTypes() { return SHOP.filter(t => abilityTower(t)).slice(0, 10); }
/** The letter that fires this tower type's ability, or '' when it is not on the tray or past the 7th slot. */
function abilityHotkey(type) { const i = abilityTypes().indexOf(type); return i >= 0 && i < ABIL_KEYS.length ? ABIL_KEYS[i] : ''; }
/** Uses the ability on tray slot `i` (0-based). */
function abilityBySlot(i) {
    const type = abilityTypes()[i];
    if (!type) {
        toast('No ability on that key yet (a tier 3 upgrade gives one)', 'warn', 1800);
        return false;
    }
    return abilityByKey(SHOP.indexOf(type) + 1);
}
/** Uses the ability of tower type number `n` (1–9). True when it fired. */
function abilityByKey(n) {
    const type = SHOP[n - 1], tw = type && abilityTower(type);
    if (!tw) {
        if (type)
            toast(TD[type].name + ': no ability yet (a tier 3 upgrade gives one)', 'warn', 1800);
        return false;
    }
    const why = abilityProblem(tw);
    if (why) {
        toast(TD[type].ability.name + ': ' + why, 'warn', 1500);
        return false;
    }
    const ok = useAbility(tw);
    if (ok && UI.selected)
        renderPanel();
    return ok;
}
function refreshAbilities() {
    // one button per tower type: the ability and its cooldown are shared by every tower of that type. The hero's
    // unlocked abilities come first, on Z and X.
    const list = SHOP.map(abilityTower).filter(Boolean);
    const hero = heroTower(), slots = hero ? [0, 1].filter(i => heroLevel(hero) >= HERO_ABILITY_LEVELS[i]) : [];
    const key = slots.map(i => hero.type + ':h' + i).concat(list.map(t => t.type + ':' + abPower(t))).join(',');
    const bar = $('abilities');
    $('abilWrap').classList.toggle('closed', !SETTINGS.abilTray);
    $('abilWrap').classList.toggle('none', !list.length && !slots.length);
    $('abilBtn').classList.toggle('has', list.some(t => !abilityProblem(t)) || slots.some(i => !heroAbilityProblem(i)));
    if (key !== abilityKey) {
        abilityKey = key;
        bar.innerHTML = '';
        slots.forEach(i => {
            const b = document.createElement('button'), ab = HEROES[hero.type].abilities[i];
            b.className = 'abil hab';
            b.dataset.slot = String(i);
            b.title = ab.name + ' — ' + ab.desc + ' [' + HERO_KEYS[i] + ']';
            b.appendChild(iconCanvas(hero.type, 40));
            b.insertAdjacentHTML('beforeend', `<i></i><kbd class="hk">${HERO_KEYS[i]}</kbd>`);
            b.addEventListener('click', () => heroAbilityKey(i));
            bar.appendChild(b);
        });
        list.slice(0, 10).forEach(t => {
            const b = document.createElement('button');
            b.className = 'abil' + (abPower(t) === 2 ? ' p2' : '');
            b.dataset.type = t.type;
            const hk = abilityHotkey(t.type);
            b.title = TD[t.type].ability.name + (abPower(t) === 2 ? ' (strong)' : '') + ' — ' + TD[t.type].ability.desc + (hk ? ' [' + hk + ']' : '');
            b.appendChild(iconCanvas(t.type, 40));
            b.insertAdjacentHTML('beforeend', '<i></i>' + (hk ? `<kbd class="hk">${hk}</kbd>` : ''));
            b.addEventListener('click', () => {
                const tw = abilityTower(t.type);
                if (tw) {
                    useAbility(tw);
                    refreshHUD();
                }
            });
            bar.appendChild(b);
        });
    }
    // the buttons in the selected hero's panel
    document.querySelectorAll('.habbtn').forEach((b) => {
        const i = +b.dataset.slot, why = heroAbilityProblem(i);
        b.querySelector('small').textContent = why || (UI.aim === i ? 'Click the map to aim' : HEROES[hero.type].abilities[i].desc);
        b.classList.toggle('ready', !why);
    });
    bar.querySelectorAll('.abil').forEach((b) => {
        if (b.dataset.slot !== undefined) {
            const i = +b.dataset.slot, left = heroCdLeft(i), id = hero.type + ':' + i;
            b.style.setProperty('--p', String(left > 0 ? Math.min(1, left / (game.abMax[id] || left)) : 0));
            b.classList.toggle('ready', !heroAbilityProblem(i));
            b.classList.toggle('sel', UI.aim === i);
            return;
        }
        const t = abilityTower(b.dataset.type);
        if (!t)
            return;
        const left = abCdLeft(t.type), p = left > 0 ? Math.min(1, left / (game.abMax[t.type] || abilityCd(t))) : 0;
        b.style.setProperty('--p', String(p));
        b.classList.toggle('ready', !abilityProblem(t));
        b.classList.toggle('sel', !!UI.selected && UI.selected.type === t.type);
    });
}
function toggleTray() { SETTINGS.abilTray = !SETTINGS.abilTray; saveSettings(); refreshAbilities(); }
$('abilToggle').addEventListener('click', toggleTray);
$('abilBtn').addEventListener('click', toggleTray);
/* ---------- Stats helpers ---------- */
function statRows(type, s) {
    if (s.mode === 'mine')
        return [['Income', money(s.income) + '/' + MINE_PAY_TIME + 's'], ['Pop bonus', s.popBonus ? '+' + Math.round(s.popBonus * 100) + '%' : '—'], ['Interest', s.vault ? Math.round(s.vault * 100) + '%/' + MINE_PAY_TIME + 's' : '—'], ['Lives', s.lives ? '+' + s.lives + '/round' : '—']];
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
        rows.push(['Hits', 1 + (s.bounce || 0)]);
    else if (s.mode === 'ring')
        rows.push(['Hits', 'all near']);
    else
        rows.push(['Pierce', s.pierce + (s.count > 1 ? ' ×' + s.count : '')]);
    rows.push(['Speed', (1 / s.rate).toFixed(2) + '/s']);
    rows.push(['Range', s.range > 2000 ? 'In sight' : Math.round(s.range)]);
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
    else if (s.dtype === 'explosive' && !s.crack)
        b.push('<span class="badge no">Can\'t pop black/zebra</span>');
    else if (s.mode === 'pulse' && !s.freezeAll)
        b.push('<span class="badge no">Can\'t freeze white/zebra</span>');
    else
        b.push('<span class="badge lead">Pops lead</span>');
    if (s.bm > 1)
        b.push(`<span class="badge blimp">${s.bm}x vs blimps</span>`);
    b.push(sightBlocked(s) ? '<span class="badge sight">Needs line of sight</span>' : '<span class="badge">Ignores scenery</span>');
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
    if (b.range !== a.range && b.range && b.range < 2000)
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
        out.push('+' + money(b.income - a.income) + (b.mode === 'mine' ? '/' + MINE_PAY_TIME + 's' : '/rd'));
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
    if (b.bounce !== a.bounce)
        out.push(b.bounce + ' bounces');
    if (b.lives !== a.lives)
        out.push('+' + (b.lives - a.lives) + ' lives/rd');
    return out;
}
/* ---------- Badges (map) & upgrade icons ---------- */
function badgeSVG(kind, won, size = 22) {
    const col = won ? BADGE_COL[kind] : '#4a5470', L = { easy: 'E', medium: 'M', hard: 'H', nightmare: 'N' }[kind];
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-label="${kind} badge"><path d="M12 1.5 L21 5 V11.5 C21 17 17 21 12 22.5 C7 21 3 17 3 11.5 V5Z" fill="${col}" stroke="${won ? 'rgba(0,0,0,.35)' : '#2f3a55'}" stroke-width="1.4"/>
    <text x="12" y="15.5" text-anchor="middle" font-size="10" font-weight="900" font-family="Segoe UI,system-ui,sans-serif" fill="${won ? (kind === 'nightmare' ? '#fff' : '#3b2a00') : '#7d88a6'}">${L}</text></svg>`;
}
/** A round skill node: the tower's own art on a cream disc, inside a ring in the path's colour, with the tier number
    at the bottom, a bolt for ability tiers and a padlock while the tier still needs XP. */
function upIcon(type, p, i, state, size = 44) {
    const grey = state === 'locked' || state === 'closed', col = grey ? '#8d969e' : PATH_COL[p], tier = i + 1;
    const ab = tier === ABILITY_TIER || tier === ABILITY_TIER + 1, art = 'assets/towers/' + type;
    return `<svg class="upicon ${state}" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="22.5" fill="rgba(0,0,0,.35)"/><circle cx="24" cy="23" r="21.5" fill="${col}"/>
    <path d="M7 19 A17.5 17.5 0 0 1 41 19" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="24" cy="23" r="16" fill="${grey ? '#d5d9dc' : '#fdf3dc'}" stroke="rgba(0,0,0,.28)" stroke-width="1.5"/>
    <g class="art"><image href="${art}-base.svg" x="9" y="8" width="30" height="30"/><image href="${art}-top.svg" x="9" y="8" width="30" height="30" transform="rotate(-45 24 23)"/></g>
    <g transform="translate(24 41)"><circle r="6.5" fill="#20301c" stroke="${grey ? '#c9d0d6' : '#fff'}" stroke-width="1.5"/><text y="3.4" text-anchor="middle" font-size="9.5" font-weight="900" font-family="Segoe UI,system-ui,sans-serif" fill="#fff">${tier}</text></g>
    ${ab ? `<g transform="translate(39 9)"><circle r="7" fill="#ffd93d" stroke="#8a5c00" stroke-width="1.2"/><path d="M1 -5 L-3.5 1 H0 L-1 5 L3.5 -1 H0Z" fill="#5d3b00"/></g>` : ''}
    ${state === 'locked' ? `<g transform="translate(40 34)"><circle r="6.5" fill="#263238" stroke="#fff" stroke-width="1"/><rect x="-3.2" y="-.8" width="6.4" height="5" rx="1" fill="#eceff1"/><path d="M-1.9 -.8 V-2.6 A1.9 1.9 0 0 1 1.9 -2.6 V-.8" stroke="#eceff1" stroke-width="1.3" fill="none"/></g>` : ''}</svg>`;
}
const CHEVRON = (dir) => `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="${dir === 'l' ? 'M15 4.5 7.5 12l7.5 7.5' : dir === 'r' ? 'M9 4.5 16.5 12 9 19.5' : 'M4.5 15 12 7.5l7.5 7.5'}" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
/* ---------- Tower column (shop) ---------- */
function iconCanvas(type, px) {
    const c = document.createElement('canvas');
    c.width = px * 2;
    c.height = px * 2;
    const x = c.getContext('2d');
    x.scale(2, 2);
    drawTower(x, type, px / 2, px / 2, -Math.PI / 4, null, 0, (px * .4) / TD[type].r);
    return c;
}
function xpReady(type) {
    if (DEV.unlockAll)
        return false;
    for (let p = 0; p < 3; p++)
        for (let t = 3; t <= 5; t++)
            if (unlockProblem(type, p, t) === '')
                return true;
    return false;
}
function buildShop() {
    hideTip();
    const el = $('shop');
    el.innerHTML = '';
    SHOP.forEach((type, i) => {
        const d = TD[type], b = document.createElement('button'), why = shopProblem(type);
        b.className = 'shopbtn' + (why ? ' locked' : '') + (d.size === 3 ? ' big' : '');
        b.dataset.type = type;
        if (!why)
            b.dataset.cost = String(price(d.cost, type));
        b.innerHTML = `<span class="hk">${i + 1}</span>${xpReady(type) ? '<span class="xpready" title="An XP unlock is ready in Upgrades">▲</span>' : ''}`;
        b.appendChild(iconCanvas(type, 50));
        const lock = !isUnlocked(type) ? `Lv ${d.unlock}` : !game.allowed.includes(type) ? 'Mode' : TD[type].water && !hasWater(game.map) ? 'No water' : '';
        b.insertAdjacentHTML('beforeend', `<span class="pr">${lock ? '<img src="assets/ui/lock.svg" alt="">' + lock : money(price(d.cost, type))}</span>`);
        b.addEventListener('click', () => pickShop(type));
        b.addEventListener('mouseenter', () => { showTip(type, b); $('hoverName').textContent = d.name; });
        b.addEventListener('mouseleave', () => { hideTip(); $('hoverName').textContent = UI.shop ? TD[UI.shop].name : 'Towers'; });
        el.appendChild(b);
    });
    buildHeroShop();
    showInfo(null);
}
/** The heroes above the towers. Once one is picked for this game, only that one is listed. */
function buildHeroShop() {
    const el = $('heroShop'), on = heroesAllowed();
    el.innerHTML = '';
    el.classList.toggle('on', on);
    if (!on)
        return;
    const placed = heroTower(), mine = placed ? placed.type : game.heroId;
    (mine ? [mine] : HERO_IDS).forEach(type => {
        const b = document.createElement('button'), why = shopProblem(type), cost = price(TD[type].cost, type);
        b.className = 'shopbtn hero' + (why ? ' locked' : '') + (mine ? ' one' : '');
        b.dataset.type = type;
        if (!why)
            b.dataset.cost = String(cost);
        b.appendChild(iconCanvas(type, 50));
        b.insertAdjacentHTML('beforeend', `<span class="pr">${placed ? 'On field' : money(cost)}</span>`);
        b.addEventListener('click', () => pickShop(type));
        b.addEventListener('mouseenter', () => { showTip(type, b); $('hoverName').textContent = TD[type].name; });
        b.addEventListener('mouseleave', () => { hideTip(); $('hoverName').textContent = UI.shop ? TD[UI.shop].name : 'Towers'; });
        el.appendChild(b);
    });
}
/** Every skill and ability of a hero, with the ones above `level` dimmed. */
function heroSkillsHTML(type, level) {
    return `<ul class="hskills">${heroSkillList(type).map(([lv, name, desc, slot]) => `<li class="${lv > level ? 'locked' : ''}"><em>Lv ${lv}</em><span><b>${name}</b>${slot >= 0 ? ` <kbd>${HERO_KEYS[slot]}</kbd>` : ''}<br>${desc}</span></li>`).join('')}</ul>`;
}
/** Z / X, the tray and the hero panel: use hero ability `i`, or start aiming it (press again to cancel). */
function heroAbilityKey(i) {
    if (!game || game.over)
        return;
    const t = heroTower(), ab = t && HEROES[t.type].abilities[i], why = heroAbilityProblem(i);
    if (why) {
        UI.aim = null;
        toast((ab ? ab.name + ': ' : '') + why, 'warn', 1500);
    }
    else if (ab.aim) {
        const cancel = UI.aim === i;
        if (UI.shop)
            pickShop(null);
        UI.aim = cancel ? null : i;
        if (!cancel)
            toast(ab.name + ': click the map to aim (Esc cancels)', undefined, 2000);
    }
    else
        useHeroAbility(i);
    refreshHUD();
}
/** The small hint under the tower buttons. It stays one size, so hovering never moves the column. */
function showInfo(type) {
    $('info').innerHTML = type ? `<div class="empty">Placing <b>${TD[type].name}</b>: click the map. ${TD[type].hero ? 'One hero per game.' : 'Hold <kbd>Shift</kbd> to build several.'} Right-click cancels.</div>`
        : '<div class="empty">Pick a tower, then click the map. Hold <kbd>Shift</kbd> to build several. Right-click cancels.</div>';
}
/** The tower description card, shown beside the tower column (over the map) while a tower button is hovered. */
function showTip(type, btn) {
    const el = $('tipCard'), d = TD[type], s = statsFor(type, [0, 0, 0]), why = shopProblem(type);
    el.innerHTML = `<div class="tiphead"><b>${d.name}</b><span class="tipcost"><img src="assets/ui/coin.svg" alt="">${money(price(d.cost, type))}</span></div>
    ${d.hero ? `<div class="herotip"><img src="assets/heroes/${type}-portrait.svg" alt=""><div class="desc"><b>${HEROES[type].role}</b><br>${d.desc}</div></div>${heroSkillsHTML(type, HERO_MAX_LEVEL)}` : `<div class="desc">${d.desc}</div>`}
    <div class="foot">${d.size}×${d.size} tiles · ${d.hero ? 'Starts at level 1' : 'Tower level ' + towerLevel(type)}</div>
    ${why ? `<div class="lockline"><img src="assets/ui/lock.svg" alt="">${why}</div>` : ''}
    <div class="stats">${statRows(type, s).map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div><div class="badges">${badges(type, s)}</div>`;
    el.classList.add('on');
    const side = $('side').getBoundingClientRect(), b = btn.getBoundingClientRect(), h = el.offsetHeight;
    el.style.right = Math.round(window.innerWidth - side.left + 10) + 'px';
    const top = Math.round(clamp(b.top + b.height / 2 - 40, 8, window.innerHeight - h - 8));
    el.style.top = top + 'px';
    el.style.setProperty('--ay', Math.round(clamp(b.top + b.height / 2 - top - 12, 10, h - 30)) + 'px'); // arrow points at the button
}
function hideTip() { $('tipCard').classList.remove('on'); }
function pickShop(type) {
    if (type) {
        const why = shopProblem(type);
        if (why) {
            toast(why, 'bad');
            return;
        }
    }
    UI.shop = UI.shop === type ? null : type;
    UI.aim = null;
    if (UI.shop) {
        UI.selected = null;
        UI.selScenery = null;
        renderPanel();
    }
    document.querySelectorAll('.shopbtn').forEach((b) => b.classList.toggle('sel', b.dataset.type === UI.shop));
    showInfo(UI.shop);
    $('hoverName').textContent = UI.shop ? TD[UI.shop].name : 'Towers';
}
/* ---------- Selected tower panel (slides in over the map) ---------- */
function upCard(t, p) {
    const d = TD[t.type], lv = t.lv[p], st = canUp(t, p);
    if (st === 'max')
        return `<div class="ucard max"><b>Path complete</b><small>★ tier ${PATH_MAX}</small></div>`;
    if (st === 'closed')
        return `<div class="ucard closed"><img src="assets/ui/lock.svg" alt=""><b>PATH CLOSED</b></div>`;
    const u = d.paths[p][lv], tier = lv + 1;
    const nl = t.lv.slice();
    nl[p]++;
    const after = statsFor(t.type, nl), dl = deltas(t.base, after);
    if (tier === ABILITY_TIER)
        dl.push('Ability: ' + d.ability.name);
    if (tier === ABILITY_TIER + 1)
        dl.push('Stronger ' + d.ability.name);
    const info = `data-desc="${esc(u.n + ': ' + u.d + (dl.length ? ' (' + dl.join(', ') + ')' : ''))}" data-range="${after.range || after.aura || 0}"`;
    if (st === 'xp') {
        const why = unlockProblem(t.type, p, tier);
        return `<button class="ucard xp${why ? '' : ' can'}" data-unlock="${p}" ${info}>${upIcon(t.type, p, lv, 'locked', 30)}<span><b>${esc(u.n)}</b><small>${why ? '🔒 ' + TIER_XP[tier].toLocaleString() + ' XP' : 'Unlock: ' + TIER_XP[tier].toLocaleString() + ' XP'}</small></span></button>`;
    }
    if (st !== 'ok')
        return `<div class="ucard closed" ${info}><img src="assets/ui/lock.svg" alt=""><b>${st === 'mode' ? 'Not in this mode' : 'One per game'}</b></div>`;
    const c = upgradeCost(t, p);
    return `<button class="ucard next" data-up="${p}" data-cost="${c}" ${info}>${upIcon(t.type, p, lv, 'avail', 30)}<span><b>${esc(u.n)}</b><em>${money(c)}</em></span></button>`;
}
function renderPanel() {
    const el = $('panel'), t = UI.selected, o = UI.selScenery;
    UI.previewRange = 0;
    if (!t && !o) {
        el.classList.remove('on');
        el.innerHTML = '';
        return;
    }
    el.classList.add('on');
    if (o) {
        const c = clearCost(o);
        el.innerHTML = `<div class="tp"><div class="tptop"><b>Scenery</b><button class="x" data-act="deselect" title="Close (Esc)">×</button></div>
        <p class="sdesc">Tall scenery blocks darts, tacks, cannonballs, torpedoes, sniper shots and the first jump of lightning. Bombs, frost and abilities go over it.</p>
        <button class="btn primary sell" data-act="clear" data-cost="${c}">Clear for ${money(c)}</button></div>`;
        refreshHUD();
        return;
    }
    if (TD[t.type].hero) {
        renderHeroPanel(el, t);
        return;
    }
    const d = TD[t.type];
    let h = `<div class="tp"><div class="tptop"><b>${d.name}</b><span class="star" title="Pops">★ <b id="tpPops">${t.pops.toLocaleString()}</b></span>
      <button class="tup" data-act="tree" title="Upgrade tree: unlock tiers with XP">${CHEVRON('u')}${xpReady(t.type) ? '<span class="dot"></span>' : ''}</button><button class="i${UI.showInfo ? ' on' : ''}" data-act="info" title="Stats">i</button><button class="x" data-act="deselect" title="Close (Esc)">×</button></div>
    <div class="tpport"><canvas id="tpIcon" width="160" height="160"></canvas><div class="tpside">
      ${t.buffed ? '<span class="buffed">Boosted by a Signal Tower</span>' : ''}
      ${usesTarget(t.s) ? '<div class="seglabel">Target <kbd>G</kbd></div><div class="seg tg">' + [['first', 'First'], ['last', 'Last'], ['close', 'Close'], ['strong', 'Strong']]
        .map(([k, n]) => `<button data-tg="${k}" class="${t.target === k ? 'on' : ''}">${n}</button>`).join('') + '</div>' : `<div class="muted small">${sightBlocked(t.s) ? 'Needs line of sight.' : 'Hits everything in range.'}</div>`}
      <div class="lvtag">Tower level ${towerLevel(t.type)}</div></div></div>`;
    if (UI.showInfo)
        h += `<div class="stats">${statRows(t.type, t.s).map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div><div class="badges">${badges(t.type, t.s)}</div>`;
    if (abPower(t) > 0 && !hasAbility(t))
        h += `<div class="abilnote"><img class="icon" src="assets/ui/bolt.svg" alt="">${esc(d.ability.name)} belongs to another ${esc(d.name)} (one per tower type).</div>`;
    if (hasAbility(t)) {
        const why = abilityProblem(t);
        h += `<button class="btn abilbtn${why ? '' : ' ready'}" data-act="ability"><img class="icon" src="assets/ui/bolt.svg" alt=""><span><b>${d.ability.name}${abPower(t) === 2 ? ' II' : ''}</b><small>${why || d.ability.desc}</small></span>${abilityHotkey(t.type) ? `<kbd>${abilityHotkey(t.type)}</kbd>` : ''}</button>`;
    }
    for (let p = 0; p < 3; p++) {
        const lv = t.lv[p];
        h += `<div class="prow p${p}"><div class="vpips">${[4, 3, 2, 1, 0].map(i => `<span class="${i < lv ? 'on' : ''}"></span>`).join('')}</div>
        ${lv ? `<div class="ucard owned">${upIcon(t.type, p, lv - 1, 'owned', 30)}<span><b>${esc(d.paths[p][lv - 1].n)}</b><small>OWNED</small></span></div>` : '<div class="ucard none"><small>Path ' + (p + 1) + ' <kbd>' + PATH_KEYS[p] + '</kbd></small></div>'}
        ${upCard(t, p)}</div>`;
    }
    h += `<div class="udesc" id="uDesc">Hover an upgrade to see what it does.</div>`;
    h += `<div class="tpbot"><span class="sellval"><img src="assets/ui/coin.svg" alt=""><span id="tpSell">${money(sellValue(t))}</span></span><button class="btn danger" data-act="sell">Sell <kbd>Del</kbd></button></div>`;
    if (t.fresh > 0)
        h += `<div class="refund">Full refund on anything bought since the last round started.</div>`;
    h += '</div>';
    el.innerHTML = h;
    const ic = $('tpIcon').getContext('2d');
    ic.scale(2, 2);
    drawTower(ic, t.type, 40, 40, -Math.PI / 4, t.lv, 0, 30 / d.r);
    refreshHUD();
}
/** The panel of a placed hero: portrait, level and XP, targeting, abilities, every skill, and Sell. */
function renderHeroPanel(el, t) {
    const hd = HEROES[t.type], lv = heroLevel(t), max = lv >= HERO_MAX_LEVEL, xp = t.heroXp || 0;
    const from = HERO_XP[lv], to = max ? from : HERO_XP[lv + 1], pct = max ? 100 : Math.round(100 * (xp - from) / (to - from));
    let h = `<div class="tp"><div class="tptop"><b>${hd.name}</b><span class="star" title="Pops">★ <b id="tpPops">${t.pops.toLocaleString()}</b></span>
      <button class="tup" data-act="tree" title="Hero details: every level, ability and skill" style="margin-left:auto">${CHEVRON('u')}</button><button class="i${UI.showInfo ? ' on' : ''}" data-act="info" title="Stats">i</button><button class="x" data-act="deselect" title="Close (Esc)">×</button></div>
    <div class="tpport"><img class="heroport" src="assets/heroes/${t.type}-portrait.svg" alt=""><div class="tpside">
      <div class="lvtag">Hero level ${lv}${max ? ' (max)' : ''}</div><div class="hxp"><i style="width:${pct}%"></i></div>
      <div class="muted small">${max ? hd.role : (xp - from) + ' / ' + (to - from) + ' XP · +' + heroRoundXp(game.inRound ? game.round : game.round + 1) + ' after this round'}</div>
      ${t.buffed ? '<span class="buffed">Boosted by a Signal Tower</span>' : ''}
      <div class="seglabel">Target <kbd>G</kbd></div><div class="seg tg">${[['first', 'First'], ['last', 'Last'], ['close', 'Close'], ['strong', 'Strong']]
        .map(([k, n]) => `<button data-tg="${k}" class="${t.target === k ? 'on' : ''}">${n}</button>`).join('')}</div></div></div>`;
    if (UI.showInfo)
        h += `<div class="stats">${statRows(t.type, t.s).map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div><div class="badges">${badges(t.type, t.s)}</div>`;
    hd.abilities.forEach((ab, i) => {
        h += `<button class="btn abilbtn habbtn" data-act="hab" data-slot="${i}"><img class="icon" src="assets/ui/bolt.svg" alt=""><span><b>${ab.name}</b><small></small></span><kbd>${HERO_KEYS[i]}</kbd></button>`;
    });
    // Sell sits above the skill list, so it shows without scrolling
    h += `<div class="tpbot"><span class="sellval"><img src="assets/ui/coin.svg" alt=""><span id="tpSell">${money(sellValue(t))}</span></span><button class="btn danger" data-act="sell">Sell <kbd>Del</kbd></button></div>`;
    h += `<div class="refund">${t.fresh > 0 ? 'Full refund on a hero bought since the last round started.' : 'Selling loses its levels.'}</div>`;
    h += heroSkillsHTML(t.type, lv) + '</div>';
    el.innerHTML = h;
    refreshHUD();
}
$('panel').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b)
        return;
    if (b.dataset.act === 'tree') {
        $('gUpgrades').click();
        return;
    }
    if (b.dataset.act === 'deselect') {
        UI.selected = null;
        UI.selScenery = null;
        renderPanel();
        return;
    }
    if (b.dataset.act === 'clear' && UI.selScenery) {
        if (clearScenery(UI.selScenery.id)) {
            UI.selScenery = null;
            UI.hoverScenery = null;
            rebuildBG();
            renderPanel();
        }
        return;
    }
    if (!UI.selected)
        return;
    if (b.dataset.up !== undefined) {
        if (upgrade(UI.selected, +b.dataset.up))
            renderPanel();
    }
    else if (b.dataset.unlock !== undefined) {
        const t = UI.selected, p = +b.dataset.unlock, tier = t.lv[p] + 1, why = unlockProblem(t.type, p, tier);
        if (why)
            toast(why + '. Earn it by playing with this tower.', 'bad');
        else if (unlockTier(t.type, p, tier)) {
            toast(`Unlocked ${TD[t.type].paths[p][tier - 1].n} for ${TIER_XP[tier].toLocaleString()} XP`, 'good');
            Sound.play('upgrade');
            buildShop();
            renderPanel();
        }
    }
    else if (b.dataset.tg) {
        UI.selected.target = b.dataset.tg;
        renderPanel();
    }
    else if (b.dataset.act === 'sell')
        askSell(UI.selected);
    else if (b.dataset.act === 'info') {
        UI.showInfo = !UI.showInfo;
        renderPanel();
    }
    else if (b.dataset.act === 'ability') {
        if (useAbility(UI.selected))
            renderPanel();
    }
    else if (b.dataset.act === 'hab')
        heroAbilityKey(+b.dataset.slot);
});
$('panel').addEventListener('mouseover', (e) => {
    const b = e.target.closest('[data-range]');
    UI.previewRange = b ? +b.dataset.range : 0;
    const dsc = e.target.closest('[data-desc]'), box = $('uDesc');
    if (box)
        box.textContent = dsc ? dsc.dataset.desc : 'Hover an upgrade to see what it does.';
});
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
function doSell(t) {
    sellTower(t);
    if (t && TD[t.type].hero) {
        UI.aim = null;
        buildShop();
    }
    UI.selected = null;
    renderPanel();
    refreshHUD();
}
/* ---------- Canvas input ---------- */
function canvasPos(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
function towerAt(x, y) { return game.towers.find(t => { const h = halfSize(t.type); return Math.abs(t.x - x) <= h && Math.abs(t.y - y) <= h; }) || null; }
function sceneryAt(x, y) { return game.deco.find(o => o.tall && Math.hypot(o.x - x, o.y - y) < o.r * 0.8 + 3) || null; }
cv.addEventListener('pointermove', (e) => {
    const p = canvasPos(e);
    Object.assign(UI.mouse, p, { in: true });
    UI.hoverTower = game && !UI.shop ? towerAt(p.x, p.y) : null;
    UI.hoverScenery = game && !UI.shop && !UI.hoverTower ? sceneryAt(p.x, p.y) : null;
    cv.classList.toggle('pointer', !!UI.hoverTower || !!UI.hoverScenery);
});
cv.addEventListener('pointerleave', () => { UI.mouse.in = false; UI.hoverTower = null; UI.hoverScenery = null; });
cv.addEventListener('pointerdown', (e) => {
    if (!game || game.over || UI.modal)
        return;
    if (e.button === 2)
        return;
    const p = canvasPos(e);
    Object.assign(UI.mouse, p, { in: true });
    if (UI.aim != null) { // aiming a hero ability
        useHeroAbility(UI.aim, p.x, p.y);
        UI.aim = null;
        refreshHUD();
        return;
    }
    if (UI.shop) {
        const t = placeTower(UI.shop, p.x, p.y), hero = !!t && !!TD[t.type].hero;
        if (t && (!e.shiftKey || hero)) {
            pickShop(null);
            UI.selected = t;
            if (hero)
                buildShop();
            renderPanel();
        }
        refreshHUD(true);
        return;
    }
    UI.selected = towerAt(p.x, p.y);
    UI.selScenery = UI.selected ? null : sceneryAt(p.x, p.y);
    renderPanel();
});
cv.addEventListener('contextmenu', (e) => { e.preventDefault(); UI.aim = null; pickShop(null); UI.selected = null; UI.selScenery = null; renderPanel(); });
/* ---------- Buttons & keys ---------- */
function cycleSpeed() { UI.speed = UI.speed % 3 + 1; }
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
        UI.speed = UI.speed === 1 ? 3 : 1; // tap: 1x <-> 3x
    refreshHUD();
}
/* round button: tap toggles 1x/3x, long-press sets 2x */
let rbHold = 0, rbLong = false;
$('roundBtn').addEventListener('pointerdown', () => {
    rbLong = false;
    clearTimeout(rbHold);
    if (game && game.inRound && !UI.paused)
        rbHold = setTimeout(() => { rbLong = true; UI.speed = 2; refreshHUD(); toast('Speed 2x'); }, 450);
});
['pointerup', 'pointerleave'].forEach(ev => $('roundBtn').addEventListener(ev, () => clearTimeout(rbHold)));
$('roundBtn').addEventListener('click', () => {
    if (rbLong) {
        rbLong = false;
        return;
    }
    roundButton();
});
function toggleSound() {
    SETTINGS.sound = !SETTINGS.sound;
    saveSettings();
    if (SETTINGS.sound) {
        Sound.init();
        Sound.play('chime');
    }
    refreshHUD();
}
$('gPause').addEventListener('click', pause);
$('gSound').addEventListener('click', toggleSound);
$('gHelp').addEventListener('click', () => { UI.paused = true; openHelp(); });
$('gSettings').addEventListener('click', () => { UI.paused = true; openSettings(); });
$('gUpgrades').addEventListener('click', () => {
    if (game && !game.over) {
        UI.paused = true;
        snapshot();
    }
    openTree(UI.selected ? UI.selected.type : UI.treeKind === 'heroes' ? UI.heroType : UI.treeType, 'game');
});
$('mHelp').addEventListener('click', openHelp);
$('mSettings').addEventListener('click', () => openSettings());
$('mStats').addEventListener('click', () => openProfileCard());
$('profChip').addEventListener('click', () => openProfileCard());
$('mUpgrades').addEventListener('click', () => loggedIn() ? openTree(UI.treeKind === 'heroes' ? UI.heroType : UI.treeType, 'menu') : openLogin());
/** Upgrade path 1 / 2 / 3 hotkeys. */
const PATH_KEYS = ['A', 'S', 'D'];
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && UI.modal) {
        if (UI.modal === 'pause')
            resume();
        else if (UI.modal === 'wbnews')
            closeWbNews();
        else if (!modalLocked())
            closeModalAndResume();
        return;
    }
    if (UI.modal)
        return;
    if ($('tree').classList.contains('on')) {
        if (e.key === 'Escape')
            closeTree();
        else if (e.key === 'ArrowLeft')
            UI.treeKind === 'heroes' ? heroStep(-1) : treeStep(-1);
        else if (e.key === 'ArrowRight')
            UI.treeKind === 'heroes' ? heroStep(1) : treeStep(1);
        else if (e.key === 'Tab') {
            e.preventDefault();
            treeKind(UI.treeKind === 'heroes' ? 'towers' : 'heroes');
        }
        else if (UI.treeKind === 'heroes' && /^[0-9]$/.test(e.key)) {
            UI.heroLv = +e.key || 10;
            renderTree();
        }
        return;
    }
    if (!inGame())
        return;
    const k = e.key, dig = /^(Digit|Numpad)([1-9])$/.exec(e.code || '');
    if (e.shiftKey && dig && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        abilityByKey(+dig[2]);
    }
    else if (k >= '1' && k <= '9') {
        const t = SHOP[+k - 1];
        if (t)
            pickShop(t);
    }
    else if (k === ' ') {
        e.preventDefault();
        roundButton();
    }
    else if (k === 'f' || k === 'F')
        cycleSpeed();
    else if (k === 'p' || k === 'P')
        pause();
    else if (k === 'h' || k === 'H') {
        UI.paused = true;
        openHelp();
    }
    else if (k === 'm' || k === 'M')
        toggleSound();
    else if (k.length === 1 && ABIL_KEYS.includes(k.toUpperCase()) && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        abilityBySlot(ABIL_KEYS.indexOf(k.toUpperCase()));
    }
    else if ((k === 'z' || k === 'Z' || k === 'x' || k === 'X') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        if (!e.repeat)
            heroAbilityKey(HERO_KEYS.indexOf(k.toUpperCase()));
    }
    else if (k === 'Escape') {
        if (UI.aim != null)
            UI.aim = null;
        else if (UI.shop || UI.selected || UI.selScenery) {
            pickShop(null);
            UI.selected = null;
            UI.selScenery = null;
            renderPanel();
        }
        else
            pause();
    }
    else if (k.length === 1 && PATH_KEYS.includes(k.toUpperCase()) && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        if (upgrade(UI.selected, PATH_KEYS.indexOf(k.toUpperCase())))
            renderPanel();
    }
    else if ((k === 'Delete' || k === 'Backspace') && UI.selected)
        askSell(UI.selected);
    else if ((k === 'g' || k === 'G') && UI.selected && usesTarget(UI.selected.s)) {
        const m = ['first', 'last', 'close', 'strong'];
        UI.selected.target = m[(m.indexOf(UI.selected.target) + 1) % 4];
        renderPanel();
    }
    refreshHUD();
});
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => {
    if (SETTINGS.sound)
        Sound.init();
}, { once: false, passive: true }));
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
function closeModal() {
    UI.modal = null;
    $('modal').classList.remove('on');
    // logged out: nothing of the game shows, so closing anything goes back to the sign-in page
    if (document.body.classList.contains('locked') && !loggedIn())
        openLogin(UI.loginNote);
}
function closeModalAndResume() {
    const wasGame = inGame();
    closeModal();
    if (wasGame && !game.over)
        UI.paused = false;
}
function startNew(cfg) {
    if (!loggedIn())
        return openLogin(); // looking at the boards is fine without logging in; playing needs it
    if (cfg.daily && dailyOff(cfg.daily)) {
        toast('There is no daily challenge on Saturdays and Sundays', 'warn');
        return;
    }
    const run = savedRun();
    if (run)
        abandonRun(run);
    clearRun();
    startGame(cfg);
}
$('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') {
        if (UI.modal === 'wbchamp')
            closeWbChamp();
        else if (UI.modal === 'wbnews')
            closeWbNews();
        else if (UI.modal === 'pause')
            resume();
        else if (!modalLocked())
            closeModalAndResume();
        return;
    }
    const b = e.target.closest('[data-act]');
    if (!b)
        return;
    const a = b.dataset.act;
    if (a === 'champok')
        closeWbChamp();
    else if (a === 'champpick') {
        if (UI.modal === 'wbchamp') { // from the greeting: it counts as seen; a running game stays paused
            store.set('wbChampSeen', UI.wbChampK);
            UI.wbPrevModal = null;
        }
        openChampPick();
    }
    else if (a === 'close')
        closeModalAndResume();
    else if (a === 'resume')
        resume();
    else if (a === 'menu')
        goMenu();
    else if (a === 'wbfight' || ((a === 'retry' || a === 'restart') && game && game.wb)) {
        if (game && game.wb && !game.over) {
            UI.leavingWb = true;
            wbEnd(false);
            UI.leavingWb = false;
        }
        startWorldBoss();
    }
    else if (a === 'retry' || a === 'restart') {
        const cfg = { mapIdx: game.mapIdx, diffKey: game.diffKey, mode: game.mode, daily: game.daily };
        if (!game.over)
            submitRun();
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
    else if (a === 'play')
        startNew({ mapIdx: UI.menuMap, diffKey: UI.menuDiff, mode: UI.menuMode });
    else if (a === 'toggle') {
        const k = b.dataset.key;
        SETTINGS[k] = !SETTINGS[k];
        saveSettings();
        b.classList.toggle('on', SETTINGS[k]);
        if (k === 'sound' && SETTINGS.sound) {
            Sound.init();
            Sound.play('chime');
        }
    }
    else if (a === 'fx') {
        SETTINGS.effects = SETTINGS.effects === 'high' ? 'low' : 'high';
        saveSettings();
        b.classList.toggle('on', SETTINGS.effects === 'high');
    }
    else if (a === 'scale') {
        SETTINGS.uiScale = +b.dataset.v;
        saveSettings();
        applyScale();
        b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
        if (inGame())
            fit();
    }
    else if (a === 'copycode')
        copyBackup(b);
    else if (a === 'savefile')
        saveBackupFile();
    else if (a === 'loadfile')
        $('fileIn').click();
    else if (a === 'restore')
        doRestore($('restoreTxt').value);
    // profile creation / editing
    else if (a === 'pick') {
        UI.draft[b.dataset.k] = b.dataset.v;
        refreshDraft();
    }
    else if (a === 'create')
        finishCreate();
    else if (a === 'editprofile')
        openEditProfile();
    else if (a === 'saveprofile')
        finishEdit();
    else if (a === 'whatsnew-close') {
        const never = $('wnNever').checked;
        store.set('seen', { version: VERSION, never });
        $('mNews').classList.remove('dot');
        closeModal();
    }
    else if (a === 'backupnow')
        openSettings('backup');
    else if (a === 'upgrades') {
        closeModal();
        openTree(UI.treeKind === 'heroes' ? UI.heroType : UI.treeType, 'menu');
    }
    else
        playerAction(a, b);
});
function openPause(note) {
    const wb = game.wb;
    openModal('pause', `<div style="text-align:center"><h2>Paused</h2><p class="lead">${wb ? 'World Boss · ' + esc(wb.boss.name) + ' · ' + esc(game.map.name) + ' · ' + fmtClock(wb.t) + ' · damage ' + Math.round(wb.damage).toLocaleString()
        : esc(game.map.name) + ' · ' + game.diff.name + ' · Round ' + game.round}${note ? '<br>' + esc(note) : ''}</p></div>
    <div class="row" style="flex-direction:column;align-items:stretch;max-width:280px;margin:16px auto 0">
      <button class="btn primary big" data-act="resume" style="justify-content:center">Resume</button>
      <button class="btn" data-act="settings" style="justify-content:center"><img class="icon" src="assets/ui/gear.svg" alt="">Settings</button>
      <button class="btn" data-act="help" style="justify-content:center"><img class="icon" src="assets/ui/help.svg" alt="">Info</button>
      <button class="btn" data-act="restart" style="justify-content:center"><img class="icon" src="assets/ui/restart.svg" alt="">${wb ? 'End run and fight again' : 'Restart map'}</button>
      <button class="btn" data-act="menu" style="justify-content:center"><img class="icon" src="assets/ui/home.svg" alt="">${wb ? 'End run &amp; home' : 'Save &amp; home'}</button>
    </div><p class="muted" style="text-align:center;font-size:12px;margin-top:14px">${wb ? 'A World Boss run can\'t be saved half-way. Your damage so far always counts.' : 'Your game saves automatically every few seconds. Game clock: ' + fmtClock(game.clock)}</p>`);
}
/* ---------- Settings & backup ---------- */
function openSettings(focus) {
    const row = (key, title, sub, on, act) => `<div class="setting"><div><b>${title}</b><span>${sub}</span></div><button class="toggle${on ? ' on' : ''}" data-act="${act || 'toggle'}" data-key="${key}" aria-pressed="${!!on}" aria-label="${esc(title)}"></button></div>`;
    const c = openModal('settings', `<div class="cardhead"><h2>Settings</h2><button class="iconbtn x" data-act="close"><img src="assets/ui/close.svg" alt="Close"></button></div>
    ${row('sound', 'Sound effects', 'Soft pops and booms. Off by default so it stays quiet at work (M)', SETTINGS.sound)}
    ${row('autoStart', 'Auto-start rounds', 'Start the next round automatically after a short break', SETTINGS.autoStart)}
    ${row('pauseOnBlur', 'Pause when I switch windows', 'Stops the game when this window loses focus', SETTINGS.pauseOnBlur)}
    ${row('effects', 'High-quality effects', 'Off = Low effects: no particles, screen shake or scorch marks, for slower PCs', SETTINGS.effects === 'high', 'fx')}
    ${row('shake', 'Screen shake', 'Big explosions shake the field slightly', SETTINGS.shake)}
    ${row('cbMarks', 'Colour-blind markers', 'A small letter on each balloon layer (R, B, G, Y, P…)', SETTINGS.cbMarks)}
    <div class="setting"><div><b>Interface size</b><span>Scales the tower column, panels and menus</span></div><div class="seg small">${[90, 100, 110, 125].map(v => `<button data-act="scale" data-v="${v}" class="${SETTINGS.uiScale === v ? 'on' : ''}">${v}%</button>`).join('')}</div></div>
    ${row('confirmSell', 'Confirm before selling', 'Ask before selling a tower', SETTINGS.confirmSell)}
    ${row('notify', 'Other players\' results', 'A notification when another player wins or loses a game (shared folder)', SETTINGS.notify !== false)}
    ${row('chatToasts', 'Chat pop-ups during games', 'New chat messages show at the top of the screen for 5 seconds while you play', SETTINGS.chatToasts !== false)}
    <h3 id="shHead" style="margin:18px 0 4px">Shared folder (players on other PCs)</h3>
    <p class="small" id="shStatus" style="margin:0 0 8px">${shareStatusText()}</p>
    <div class="row left" id="shBtns">${shareButtonsHTML(true)}</div>
    <h3 id="bkHead" style="margin:18px 0 4px">Backup</h3>
    <p class="small" style="margin:0 0 6px"><b>Automatic backup</b> after every game and once a day: the 10 newest copies of your profile, stats and achievements, plus one a day for 14 days${Share.connected() ? ', in the shared folder and in this browser' : ' in this browser (connect the shared folder to keep them on the network too)'}.
      Last: <b>${store.get('autoBackupAt', 0) ? ago(store.get('autoBackupAt', 0)) : 'not yet'}</b>.</p>
    <div class="autobk" id="autoBk"><span class="muted small">Looking for backups…</span></div>
    <div class="row left"><button class="btn small" data-act="autobk-now">Back up now</button></div>
    <p class="muted small" style="margin:10px 0 8px">You can also copy a backup code and keep it in Notepad, or save a backup file. ${PROFILE.backupAt ? '' : '<b class="warn">You have no backup code yet.</b>'}</p>
    <div class="row left"><button class="btn primary" data-act="copycode">Copy backup code</button><button class="btn" data-act="savefile">Save backup file</button><button class="btn" data-act="loadfile">Load backup file</button></div>
    <textarea id="restoreTxt" placeholder="To restore, paste a backup code here (it starts with BD4-)" spellcheck="false"></textarea>
    <div class="row left"><button class="btn" data-act="restore">Restore from code</button><span class="muted small" id="bkMsg"></span></div>
    <p class="muted small" style="margin:14px 0 0">Your profile plays only on this PC. It is also saved to the shared folder a few seconds after every change, so it can be found again with <b>Find my profile</b> if this browser ever loses it.</p>
    <div class="row"><button class="btn primary" data-act="close">Done</button></div>`);
    fillAutoBackups();
    if (focus === 'backup' || focus === 'share')
        setTimeout(() => c.querySelector(focus === 'share' ? '#shHead' : '#bkHead').scrollIntoView({ block: 'start' }), 30);
}
function copyBackup(btn) {
    const code = backupCode();
    const done = () => { markBackedUp(); btn.textContent = 'Copied! Paste it into Notepad'; $('bkMsg').textContent = ''; };
    if (navigator.clipboard && navigator.clipboard.writeText)
        navigator.clipboard.writeText(code).then(done, () => fallbackCopy(code, done));
    else
        fallbackCopy(code, done);
}
function fallbackCopy(code, done) {
    const ta = $('restoreTxt');
    ta.value = code;
    ta.select();
    let ok = false;
    try {
        ok = document.execCommand('copy');
    }
    catch (e) { }
    if (ok)
        done();
    else
        $('bkMsg').textContent = 'Copy blocked by the browser: select the text above and press Ctrl+C.';
}
function saveBackupFile() {
    try {
        const blob = new Blob([backupFileText()], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = backupFileName();
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        markBackedUp();
        $('bkMsg').textContent = 'Saved ' + backupFileName() + ' to your Downloads.';
    }
    catch (e) {
        $('bkMsg').textContent = 'Downloads are blocked here. Use Copy backup code instead.';
    }
}
$('fileIn').addEventListener('change', () => {
    const f = $('fileIn').files[0];
    if (!f)
        return;
    const r = new FileReader();
    r.onload = () => {
        const ta = $('restoreTxt');
        if (ta)
            ta.value = String(r.result);
        doRestore(String(r.result));
    };
    r.readAsText(f);
    $('fileIn').value = '';
});
function doRestore(text) {
    const r = parseBackup(text);
    if (!r.ok) {
        $('bkMsg').textContent = r.error;
        return;
    }
    const who = r.data.id ? r.data.id.name + '#' + r.data.id.tag : 'this backup', cur = getId();
    if (!loggedIn() && cur && cur.name && (!r.data.id || r.data.id.uid !== cur.uid)) {
        $('bkMsg').textContent = 'This PC\'s profile is ' + cur.name + '. Log in as ' + cur.name + ' first to replace it with another profile.';
        return;
    }
    if (!confirm('Replace all progress in this browser with ' + who + '?'))
        return;
    Share.autoBackup().catch(() => false).then(() => { restoreBackup(r.data); location.reload(); });
}
/** Settings: the automatic backups of this profile, newest first, each with a Restore button. */
function fillAutoBackups() {
    Share.listBackups().then(list => {
        const el = $('autoBk');
        if (!el || UI.modal !== 'settings')
            return;
        el.innerHTML = list.length ? list.slice(0, 10).map(b => `<div class="bkrow"><span>${new Date(b.at).toLocaleString()} <small class="muted">· ${b.where === 'folder' ? 'shared folder' : 'this browser'}</small></span>
          <button class="btn small" data-act="autobk-restore" data-at="${b.at}" data-where="${b.where}">Restore</button></div>`).join('')
            : '<span class="muted small">No automatic backups yet. One is made after your next game.</span>';
    });
}
function restoreAutoBackup(b) {
    if (!b.dataset.armed) {
        b.dataset.armed = '1';
        b.textContent = 'Click again: replace your progress';
        return;
    }
    Share.loadBackup(+b.dataset.at, b.dataset.where).then(data => {
        if (!data) {
            toast('That backup can\'t be read', 'bad');
            return;
        }
        restoreBackup(Object.assign(data, { settings: SETTINGS }));
        location.reload();
    });
}
/** The automatic daily backup, once per day at start-up. */
function dailyAutoBackup() {
    const at = store.get('autoBackupAt', 0);
    if (hasProfile() && PROFILE.games > 0 && (!at || todayStr(new Date(at)) !== todayStr()))
        Share.autoBackup();
}
/* ---------- Help ---------- */
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
/** Info: two tabs, How to Play and World Boss. */
function openHelp(tab) {
    UI.infoTab = tab || UI.infoTab || 'play';
    const tabs = `<div class="seg infotabs"><button data-act="infotab" data-t="play" class="${UI.infoTab === 'play' ? 'on' : ''}">How to Play</button><button data-act="infotab" data-t="wb" class="${UI.infoTab === 'wb' ? 'on' : ''}">World Boss</button></div>`;
    if (UI.infoTab === 'wb') {
        const c = openModal('help', `<div class="cardhead"><h2>Info</h2><button class="iconbtn x" data-act="close"><img src="assets/ui/close.svg" alt="Close"></button></div>${tabs}<div class="help">${wbInfoHTML()}</div>`, 'wide');
        fillWbMaps(c);
        return c;
    }
    openModal('help', `<div class="cardhead"><h2>Info</h2><button class="iconbtn x" data-act="close"><img src="assets/ui/close.svg" alt="Close"></button></div>${tabs}
    <div class="help">
    <ul>
      <li>Pick a tower in the column on the right, then click the grass. Towers snap to the grid: small towers take 2×2 tiles, big ones 3×3. Hold <kbd>Shift</kbd> to build several.</li>
      <li>Press the green <b>PLAY</b> button (or <kbd>Space</kbd>) to send the next round. During a round, tap it for 1x/3x speed or hold it for 2x.</li>
      <li>Anything bought since the last round started sells for a <b>full refund</b>.</li>
      <li>Each tower has <b>3 upgrade paths of 5 tiers</b>. One path can go to tier 5, a second to tier 2, and the third closes. Tier 3 gives an <b>ability</b> (stronger at tier 4). Each tower type has <b>one ability holder</b>: the first of that type to reach tier 3. Others still get the upgrades but not the ability; if the holder is sold, the next one takes over. Only one of each tier-5 per game.</li>
      <li>Tiers 3–5 are unlocked once with that tower's <b>XP</b>, earned by using it. Tower levels give skill points: open <b>Upgrades</b>.</li>
      <li><b>Tall scenery</b> (trees, rocks, stalls) blocks straight shots and sniper aim. Bombs, frost and abilities go over it. Click scenery to clear it for cash.</li>
      <li>Every 10th round brings the <b>Colossus</b> boss. Skulls on its health bar show where it summons more balloons. Don't let it through!</li>
      <li>Once a week there is a <b>World Boss</b>: see the World Boss tab.</li>
      <li>Your game saves automatically, and your profile is copied to the shared folder. Back up your progress in Settings → Backup.</li>
    </ul>
    <h3>Balloons</h3>
    <div class="bguide">${Object.keys(BT).filter(t => !BT[t].wb).map(t => `<div><img ${BT[t].blimp && !BT[t].boss ? 'class="wide"' : ''} src="assets/balloons/${t}.svg" alt=""><div><b>${BT[t].name}</b><span class="muted">${balloonNote(t)}</span></div></div>`).join('')}
      <div><img src="assets/balloons/camo.svg" alt="" style="background:#43a047;border-radius:50%"><div><b>Camo</b><span class="muted">Needs camo detection</span></div></div>
      <div><span class="trait regrow">+</span><div><b>Regrow</b><span class="muted">Heals a layer if left alone</span></div></div>
      <div><span class="trait fort"></span><div><b>Fortified</b><span class="muted">Takes twice the hits</span></div></div></div>
    <h3>Keys</h3>
    <div class="keys">
      <span><kbd>1</kbd>–<kbd>9</kbd></span><span>Pick a tower</span>
      <span><kbd>Space</kbd> / <kbd>F</kbd></span><span>Start round / change speed</span>
      <span><kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd></span><span>Upgrade path 1 / 2 / 3</span>
      <span><kbd>Q</kbd> <kbd>W</kbd> <kbd>E</kbd> <kbd>R</kbd> <kbd>T</kbd> <kbd>Y</kbd> <kbd>U</kbd></span><span>Use the 1st–7th ability on the ability tray (the key is shown on each button)</span>
      <span><kbd>Shift</kbd> + <kbd>1</kbd>–<kbd>9</kbd></span><span>Use that tower type's ability (backup)</span>
      <span><kbd>G</kbd></span><span>Change targeting</span>
      <span><kbd>Del</kbd></span><span>Sell selected tower</span>
      <span><kbd>M</kbd></span><span>Sound on / off</span>
      <span><kbd>Esc</kbd> / <kbd>P</kbd></span><span>Cancel / pause</span>
    </div></div>`, 'wide');
}
/* ---------- Profile: create, card, edit ---------- */
function pickerHTML(d) {
    const opt = (k, v, inner, on, locked, title) => `<button class="pick${on ? ' on' : ''}${locked ? ' locked' : ''}" data-act="${locked ? '' : 'pick'}" data-k="${k}" data-v="${v}" title="${esc(title || '')}">${inner}</button>`;
    return `<div class="pickrow"><span>Animal</span><div class="picks animals">${ANIMALS.map(a => opt('animal', a.id, avatarSVG({ animal: a.id, style: d.style, bg: d.bg, border: 'plain' }, 44), d.animal === a.id, false, a.name)).join('')}</div></div>
    <div class="pickrow"><span>Style</span><div class="seg">${[['m', 'Male'], ['f', 'Female']].map(([v, n]) => `<button data-act="pick" data-k="style" data-v="${v}" class="${d.style === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    <div class="pickrow"><span>Background</span><div class="picks">${AVATAR_BGS.map(b => opt('bg', b.id, `<i class="swatch" style="background:linear-gradient(${b.a},${b.b})"></i>`, d.bg === b.id, false, b.name)).join('')}</div></div>
    <div class="pickrow"><span>Border</span><div class="picks">${BORDERS.filter(b => !b.special).map(b => { const u = borderUnlocked(b); return opt('border', b.id, avatarSVG({ animal: d.animal, style: d.style, bg: d.bg, border: b.id }, 36) + (u ? '' : '<img class="plock" src="assets/ui/lock.svg" alt="">'), d.border === b.id, !u, b.name + (u ? '' : ' — ' + b.how)); }).join('')}</div></div>${champPickHTML(d, opt)}`;
}
/** 5.2.1: the champion borders, in Edit profile, for the World Boss Champion only (any of the 10, changed any time while
    they are champion). Everyone else sees nothing here. */
function champPickHTML(d, opt) {
    if (UI.modal !== 'editprofile' || !d.uid || d.uid !== WB_CHAMP_UID)
        return '';
    return `<div class="champpick"><div class="cphead"><b>Champion borders</b><small>World Boss Champion only · yours until the next champion is announced (Friday 5:01 PM) · click one to wear it</small></div>
      ${champCardsHTML(d, champBorderId(d.cb), true)}
      <div class="cphead"><b>Champion card backgrounds</b><small>Behind your player card and your profile card · click one to use it</small></div>
      ${champBgCardsHTML(d, champBgId(d.cbg), true)}</div>`;
}
/** 5.2.2: the 10 Champion card backgrounds as numbered cards, each a small player card with this avatar (and its
    champion border). `pick` makes them buttons for Edit profile; `cur` is marked Using. */
function champBgCardsHTML(d, cur, pick) {
    const av = avatarSVG({ animal: d.animal || 'fox', style: d.style || 'm', bg: d.bg || 'sky', border: champBorderId(d.cb || WB_CHAMP_CB), champ: true }, 60);
    return `<div class="cpgrid">${CHAMP_BGS.map((b, i) => {
        const on = cur === b.id, inner = `<i class="cpn">${i + 1}</i><span class="cbmini cbg" style="--cbe:${b.edge}">${champBgHTML(b.id, 'cbk' + i, 100, 120, 50, 46)}${av}</span><b>${esc(b.name)}</b><small>${esc(b.desc)}</small>${on ? '<em>Using</em>' : ''}`;
        return pick ? `<button type="button" class="cpcard${on ? ' on' : ''}" data-act="pick" data-k="cbg" data-v="${b.id}" title="Use ${esc(b.name)}">${inner}</button>` : `<div class="cpcard${on ? ' on' : ''}">${inner}</div>`;
    }).join('')}</div>`;
}
/** The 10 Champion borders as numbered cards, each on this avatar (d: animal, style, bg), with its name and look.
    `pick` makes them buttons for Edit profile; `cur` is marked Wearing. */
function champCardsHTML(d, cur, pick) {
    return `<div class="cpgrid">${BORDERS.filter(b => b.champ).map((b, i) => {
        const on = cur === b.id, inner = `<i class="cpn">${i + 1}</i>${avatarSVG({ animal: d.animal || 'fox', style: d.style || 'm', bg: d.bg || 'sky', border: b.id, champ: true }, 96)}<b>${esc(b.name)}</b><small>${esc(b.desc)}</small>${on ? '<em>Wearing</em>' : ''}`;
        return pick ? `<button type="button" class="cpcard${on ? ' on' : ''}" data-act="pick" data-k="cb" data-v="${b.id}" title="Wear ${esc(b.name)}">${inner}</button>` : `<div class="cpcard${on ? ' on' : ''}">${inner}</div>`;
    }).join('')}</div>`;
}
/** The registration picker: animal, style, background and the free borders (a new player has earned no others yet). */
function regPickerHTML(d) {
    const opt = (k, v, inner, on, title) => `<button type="button" class="pick${on ? ' on' : ''}" data-act="pick" data-k="${k}" data-v="${v}" title="${esc(title)}">${inner}</button>`;
    return `<div class="pickrow"><span>Animal</span><div class="picks animals">${ANIMALS.map(a => opt('animal', a.id, avatarSVG({ animal: a.id, style: d.style, bg: d.bg, border: 'plain' }, 40), d.animal === a.id, a.name)).join('')}</div></div>
    <div class="pickrow"><span>Style</span><div class="seg">${[['m', 'Male'], ['f', 'Female']].map(([v, n]) => `<button type="button" data-act="pick" data-k="style" data-v="${v}" class="${d.style === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    <div class="pickrow"><span>Background</span><div class="picks">${AVATAR_BGS.map(b => opt('bg', b.id, `<i class="swatch" style="background:linear-gradient(${b.a},${b.b})"></i>`, d.bg === b.id, b.name)).join('')}</div></div>
    <div class="pickrow"><span>Border</span><div class="picks">${BORDERS.filter(b => b.free).map(b => opt('border', b.id, avatarSVG({ animal: d.animal, style: d.style, bg: d.bg, border: b.id }, 32), d.border === b.id, b.name)).join('')}</div></div>`;
}
function refreshDraft() {
    const d = UI.draft, el = $('draftPick'), pv = $('draftPrev');
    if (el)
        el.innerHTML = UI.modal === 'register' ? regPickerHTML(d) : pickerHTML(d);
    if (pv)
        pv.innerHTML = avatarSVG(d, UI.modal === 'register' ? 120 : 110);
    if (UI.modal === 'editprofile') {
        const t = $('titleSel');
        if (t)
            t.value = d.title;
    }
}
/* ---------- Log in and registration (5.1) ----------
   Nothing of the game shows until you log in: the home page stays hidden (body.locked) behind a full-screen sign-in page.
   Log in: pick your profile (search by name), then type your password (a profile without one makes it now). A profile
   from another PC moves here when you log in. New players use the registration form (one profile per PC). */
/** Locks the app (home page hidden) while nobody is logged in on this tab. */
function syncLock() { document.body.classList.toggle('locked', !loggedIn()); }
const EYE = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>';
/** A password box with a show/hide button and a Caps Lock warning. */
function pwField(id, label, o = {}) {
    return `<div class="field"><label class="lbl" for="${id}">${label}</label><div class="pwbox"><input id="${id}" type="password" maxlength="40" autocomplete="${o.ac || 'new-password'}" placeholder="${esc(o.ph || '')}" spellcheck="false">
      <button type="button" class="pweye" data-act="pweye" data-for="${id}" title="Show password" aria-label="Show password">${EYE}</button></div>
      <div class="caps" id="${id}Caps">Caps Lock is on</div>${o.extra || ''}</div>`;
}
function wirePw(id, enter) {
    const el = $(id);
    if (!el)
        return;
    const caps = (e) => {
        const c = $(id + 'Caps');
        if (c && e.getModifierState)
            c.classList.toggle('on', e.getModifierState('CapsLock'));
    };
    el.addEventListener('keydown', (e) => {
        caps(e);
        if (e.key === 'Enter') {
            e.preventDefault();
            enter();
        }
    });
    el.addEventListener('keyup', caps);
}
/** Password strength 0–4 and its label (length, upper and lower case, digits, symbols). */
function pwStrength(p) {
    p = String(p || '');
    if (!p)
        return { n: 0, txt: '' };
    let n = 0;
    if (p.length >= 6)
        n++;
    if (p.length >= 10)
        n++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p))
        n++;
    if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p))
        n++;
    else if (/\d/.test(p) || /[^A-Za-z0-9]/.test(p))
        n += .5;
    n = Math.max(1, Math.min(4, Math.round(n)));
    return { n, txt: ['', 'Weak', 'Fair', 'Good', 'Strong'][n] };
}
function meterHTML(id) { return `<div class="pwmeter" id="${id}"><i></i><i></i><i></i><i></i><span></span></div>`; }
function setMeter(id, pw) {
    const m = $(id);
    if (!m)
        return;
    const s = pwStrength(pw);
    m.dataset.n = String(s.n);
    m.querySelector('span').textContent = pw ? s.txt + (pwProblem(pw) ? ' · ' + pwProblem(pw).toLowerCase() : '') : 'At least 4 characters';
}
/** The page around both forms: the game's name and art on the left, the form on the right. */
function authPage(tab, inner) {
    const balloons = ['red', 'blue', 'green', 'yellow', 'pink', 'rainbow'].map((b, i) => `<img src="assets/balloons/${b}.svg" alt="" style="--i:${i}">`).join('');
    return `<div class="auth">
      <aside class="authside"><div class="authballoons">${balloons}</div>
        <img class="authlogo" src="assets/ui/logo.svg" alt=""><div class="authtitle">Balloon Defense</div>
        <p>Pop every balloon. Climb the leaderboards. Beat the World Boss every Friday.</p>
        <span class="authver">Version ${esc(VERSION.replace(/\.0$/, ''))}</span></aside>
      <section class="authmain">
        <div class="seg ptabs"><button data-act="signin" class="${tab === 'login' ? 'on' : ''}">Log in</button><button data-act="tocreate" class="${tab === 'register' ? 'on' : ''}">Register</button></div>
        ${inner}
        <div class="authfoot"><button class="linkbtn" data-act="restorecode">Restore a backup code</button><span>·</span><button class="linkbtn" data-act="master">Master control</button></div>
      </section></div>`;
}
function profileFoot() { return ''; }
function profileTabs(on) { return ''; }
/** The registration form: name, password (twice, with a strength meter) and avatar. Each PC registers one profile. */
function openCreateProfile(keep) {
    if (loggedIn())
        return openProfileCard();
    syncLock();
    const owner = !canCreateProfile() ? localPlayers().find(p => p.id.uid === pcInfo().owner) : null;
    if (owner || hasProfile()) {
        const o = owner || localPlayers().find(p => p.me);
        openModal('register', authPage('register', `<h2>Register</h2>
        <div class="authnote">${o ? avatarSVG(o.id, 56) : ''}<div><b>This PC already has its own profile${o ? ': ' + esc(o.id.name) : ''}.</b>
          <span>Each PC registers one profile. If you already have a profile, log in with it: it moves to this PC.</span></div></div>
        <button class="btn primary big wide" data-act="signin">Go to log in</button>`), 'authcard');
        return;
    }
    const typed = keep && $('nameIn') ? $('nameIn').value : '';
    if (!keep || !UI.draft)
        UI.draft = { name: '', animal: ANIMALS[Math.floor(Math.random() * ANIMALS.length)].id, style: Math.random() < .5 ? 'm' : 'f', bg: AVATAR_BGS[Math.floor(Math.random() * 4)].id, border: 'plain' };
    const migrated = PROFILE.games > 0;
    openModal('register', authPage('register', `<h2>Create your profile</h2>
    <p class="authsub">${migrated ? 'Your old progress on this PC is safe and comes with you. ' : ''}It takes a few seconds. Nothing about you is stored: no email, no real name.</p>
    <form class="regform" onsubmit="return false" autocomplete="off">
      <div class="regtop"><div class="regprev"><div id="draftPrev"></div><b id="draftName">Your name</b><small>Rookie · Lv 1</small></div>
      <div class="regfields">
        <div class="field"><label class="lbl" for="nameIn">Player name</label><input id="nameIn" maxlength="16" autocomplete="off" spellcheck="false" placeholder="3–16 letters or numbers">
          <div class="hint" id="nameHint">Letters, numbers, spaces, _ and -. Everyone sees this name.</div></div>
        ${pwField('pwIn', 'Password', { ph: 'At least 4 characters', extra: meterHTML('pwMeter') })}
        ${pwField('pw2In', 'Type the password again', { extra: '<div class="hint" id="pw2Hint"></div>' })}
      </div></div>
      <div class="regpick"><div class="regpickhead">Your avatar <span class="muted small">(you can change it later)</span></div><div id="draftPick"></div></div>
    </form>
    <div class="err" id="regErr"></div>
    <button class="btn primary big wide" data-act="create">Create profile and play</button>
    <p class="authalt">Already have a profile? <button class="linkbtn" data-act="signin">Log in</button></p>`), 'authcard');
    refreshDraft();
    const nameIn = $('nameIn');
    nameIn.value = typed;
    const checkName = () => {
        const v = nameIn.value, why = v.trim() ? (nameProblem(v) || (nameTaken(v) ? 'That name is taken. If it\'s yours, log in with it.' : '')) : '';
        const h = $('nameHint');
        h.className = 'hint' + (!v.trim() ? '' : why ? ' bad' : ' ok');
        h.textContent = !v.trim() ? 'Letters, numbers, spaces, _ and -. Everyone sees this name.' : why || '✓ ' + v.trim() + ' is available';
        $('draftName').textContent = v.trim() || 'Your name';
        return !why && !!v.trim();
    };
    const checkPw = () => {
        setMeter('pwMeter', $('pwIn').value);
        const a = $('pwIn').value, b = $('pw2In').value, h = $('pw2Hint');
        h.className = 'hint' + (!b ? '' : a === b ? ' ok' : ' bad');
        h.textContent = !b ? '' : a === b ? '✓ The passwords match' : 'The passwords are not the same';
    };
    nameIn.addEventListener('input', checkName);
    nameIn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            $('pwIn').focus();
        }
    });
    $('pwIn').addEventListener('input', checkPw);
    $('pw2In').addEventListener('input', checkPw);
    wirePw('pwIn', () => $('pw2In').focus());
    wirePw('pw2In', finishCreate);
    if (typed)
        checkName();
    checkPw();
    setTimeout(() => $('nameIn') && $('nameIn').focus(), 30);
}
function finishCreate() {
    const name = $('nameIn').value, pw = $('pwIn').value, pw2 = $('pw2In').value;
    const why = nameProblem(name) || (nameTaken(name) ? 'That name is taken. If it\'s yours, log in with it.' : '') || pwProblem(pw, pw2);
    if (why) {
        $('regErr').textContent = why;
        shakeCard();
        (nameProblem(name) || nameTaken(name) ? $('nameIn') : pwProblem(pw) ? $('pwIn') : $('pw2In')).focus();
        return;
    }
    if (!canCreateProfile() || hasProfile()) {
        openCreateProfile();
        return;
    }
    UI.draft.name = name;
    UI.draft.pw = pw;
    createProfile(UI.draft);
    UI.draft.pw = '';
    syncLock();
    closeModal();
    buildMenu();
    Share.syncSoon();
    toast('Welcome, ' + name.trim() + '!', 'good');
    afterLogin();
}
function shakeCard() { const c = $('modalCard'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }
/** Everyone who can log in on this PC: its own profiles, the shared folder's and this browser's backups (not deleted ones). */
async function loginCandidates() {
    const seen = new Map(), cache = sharedCache().players, gone = new Set(cache.filter(o => o && o.deleted).map(o => o.uid));
    for (const pl of localPlayers())
        seen.set(pl.id.uid, { uid: pl.id.uid, id: pl.id, profile: pl.profile, at: pl.updated, key: pl.key, here: homeHere(pl.id), inuse: inUseElsewhere(pl.id.uid) });
    for (const o of cache)
        if (o && o.uid && !o.deleted && o.id && o.id.name) {
            const c = seen.get(o.uid);
            if (!c)
                seen.set(o.uid, { uid: o.uid, id: o.id, profile: Object.assign({}, PROFILE_DEFAULT, o.profile || {}), at: +o.updated || 0, key: '', here: false, inuse: inUseElsewhere(o.uid) });
            else if (!c.here)
                c.at = Math.max(c.at || 0, +o.updated || 0);
        }
    for (const b of await Share.browserProfiles())
        if (!seen.has(b.uid) && !gone.has(b.uid))
            seen.set(b.uid, { uid: b.uid, id: b.data.id, profile: Object.assign({}, PROFILE_DEFAULT, b.data.profile || {}), at: b.at, key: '', here: false, inuse: false });
    const now = Date.now();
    return [...seen.values()].map(c => Object.assign(c, { on: !!c.inuse, seen: Math.max(+c.at || 0, ((cache.find(o => o && o.uid === c.uid) || {}).inuse || {}).at || 0) }))
        .sort((a, b) => (+b.here - +a.here) || (+b.on - +a.on) || (b.seen - a.seen) || String(a.id.name).localeCompare(b.id.name))
        .map(c => Object.assign(c, { seenTxt: c.on ? 'Playing now' : c.seen ? agoShort(c.seen, now) : '' }));
}
function openLogin(note) {
    if (loggedIn())
        return;
    syncLock();
    const conn = Share.connected() ? '' : Share.state === 'paused' ? '<div class="authwarn"><span>Reconnect the shared folder to see every player.</span><button class="btn small" data-act="share-resume">Reconnect</button></div>'
        : Share.state === 'unsupported' ? '' : '<div class="authwarn"><span>Connect the shared folder to see players from other PCs.</span><button class="btn small" data-act="share-connect">Connect</button></div>';
    const q = UI.loginQuery || '';
    openModal('login', authPage('login', `<h2>Welcome back</h2>
    <p class="authsub">Pick your profile, then type your password.</p>
    ${note ? `<div class="authwarn">${note}</div>` : ''}${conn}
    <div class="searchbox"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
      <input id="loginFind" placeholder="Find your name…" autocomplete="off" spellcheck="false" value="${esc(q)}"></div>
    <div class="logingrid" id="loginGrid"><p class="muted">Looking for players…</p></div>
    <p class="authalt">New here? <button class="linkbtn" data-act="tocreate">Create a profile</button></p>`), 'authcard');
    const find = $('loginFind');
    find.addEventListener('input', () => { UI.loginQuery = find.value; filterLogin(); });
    find.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { // Enter picks the only (or first) match
            const b = document.querySelector('#loginGrid .ltile:not(.hide)');
            if (b)
                b.click();
        }
    });
    loginCandidates().then(list => {
        const el = $('loginGrid');
        if (!el || UI.modal !== 'login')
            return;
        UI.loginList = list;
        el.innerHTML = list.length ? list.map(c => `<button class="ltile${c.here ? ' here' : ''}${c.on ? ' busy' : ''}" data-act="loginpick" data-uid="${esc(c.uid)}" data-name="${esc(String(c.id.name).toLowerCase())}" title="${c.on ? 'Being played on another PC right now' : 'Log in as ' + esc(c.id.name)}">
          <span class="lav">${avatarSVG(Object.assign({}, c.id, { uid: c.uid }), 52)}<i class="sdot ${c.on ? 'on' : 'off'}"></i></span>
          <span class="lname"><b>${pName(c.uid, c.id.name)}</b><small>Lv ${levelOf(c.profile.xp)} · ${esc(c.seenTxt || 'Offline')}</small></span>
          <span class="ltags">${c.here ? '<i class="tag here">This PC</i>' : ''}${hasPassword(bestId(c.uid) || c.id) ? '<i class="tag lock" title="Has a password">🔒</i>' : '<i class="tag new" title="Makes a password at log-in">New password</i>'}</span></button>`).join('')
            + '<p class="muted small nomatch hide">No player with that name. <button class="linkbtn" data-act="tocreate">Create a profile</button></p>'
            : '<div class="authempty"><b>No players yet</b><span>Be the first: create a profile.</span><button class="btn primary" data-act="tocreate">Create a profile</button></div>';
        filterLogin();
    });
    setTimeout(() => $('loginFind') && $('loginFind').focus(), 30);
}
function filterLogin() {
    const q = String(UI.loginQuery || '').trim().toLowerCase();
    let n = 0;
    document.querySelectorAll('#loginGrid .ltile').forEach(b => { const hit = !q || b.dataset.name.includes(q); b.classList.toggle('hide', !hit); n += +hit; });
    const nm = document.querySelector('#loginGrid .nomatch');
    if (nm)
        nm.classList.toggle('hide', n > 0);
}
/** Step 2: the password for the picked profile (or a new one, when it has none). */
function openLoginPw(uid) {
    const c = (UI.loginList || []).find(x => x.uid === uid);
    if (!c)
        return openLogin();
    if (c.inuse) {
        toast('That profile is being played on another PC right now. Try again in a couple of minutes.', 'warn');
        return;
    }
    const id = bestId(uid) || c.id, has = hasPassword(id), t = titleById(c.id.title);
    UI.loginUid = uid;
    openModal('loginpw', authPage('login', `<button class="backlink" data-act="signin">‹ All players</button>
    <div class="loginwho">${avatarSVG(Object.assign({}, c.id, { uid }), 96)}<div><div class="pname">${pName(uid, c.id.name)}<span>#${esc(c.id.tag)}</span></div>
      <div class="ptitle">${esc((c.profile.pops || 0) >= t.pops ? t.name : TITLES[0].name)} · Lv ${levelOf(c.profile.xp)}</div>
      <div class="muted small">${c.here ? 'Plays on this PC' : 'Moves to this PC when you log in'}</div></div></div>
    <form onsubmit="return false" autocomplete="off">
    ${has ? pwField('pwIn', 'Password', { ac: 'current-password' })
        : `<div class="authwarn info"><span><b>Make a password.</b> This profile doesn't have one yet. You'll type it every time you log in.</span></div>
      ${pwField('pwIn', 'New password', { ph: 'At least 4 characters', extra: meterHTML('pwMeter') })}${pwField('pw2In', 'Type it again', { extra: '<div class="hint" id="pw2Hint"></div>' })}`}
    </form><div class="err" id="pwErr"></div>
    <button class="btn primary big wide" data-act="logingo">${has ? 'Log in' : 'Save password and log in'}</button>
    ${has ? '<p class="authalt">Forgot your password? Ask whoever runs <b>Master control</b> to reset it.</p>' : ''}`), 'authcard');
    if (has)
        wirePw('pwIn', loginGo);
    else {
        const chk = () => {
            setMeter('pwMeter', $('pwIn').value);
            const a = $('pwIn').value, b = $('pw2In').value, h = $('pw2Hint');
            h.className = 'hint' + (!b ? '' : a === b ? ' ok' : ' bad');
            h.textContent = !b ? '' : a === b ? '✓ The passwords match' : 'The passwords are not the same';
        };
        $('pwIn').addEventListener('input', chk);
        $('pw2In').addEventListener('input', chk);
        wirePw('pwIn', () => $('pw2In').focus());
        wirePw('pw2In', loginGo);
        chk();
    }
    setTimeout(() => $('pwIn') && $('pwIn').focus(), 30);
}
function loginGo() {
    const uid = UI.loginUid, c = (UI.loginList || []).find(x => x.uid === uid);
    if (!c)
        return openLogin();
    const id = bestId(uid) || c.id, has = hasPassword(id), pw = $('pwIn').value;
    const fail = (msg) => { $('pwErr').textContent = msg; shakeCard(); $('pwIn').focus(); $('pwIn').select(); };
    if (has && !pw)
        return fail('Type your password');
    if (has && !checkPassword(id, pw))
        return fail('Wrong password. Try again.');
    const why = has ? '' : pwProblem(pw, $('pw2In').value);
    if (why)
        return fail(why);
    if (inUseElsewhere(uid))
        return fail('That profile is being played on another PC right now. Try again in a couple of minutes.');
    const newPw = has ? null : makePw(pw);
    const btn = document.querySelector('[data-act=logingo]');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Logging in…';
    }
    doLogin(c, newPw);
}
/** Logs in: the profile becomes the active one on this PC (moving it here if it played on another PC). */
function doLogin(c, newPw) {
    const setPw = (key) => {
        if (!newPw)
            return;
        const s = readSlot(key);
        if (s.id) {
            s.id.pw = newPw;
            s.updated = Date.now();
            try {
                localStorage.setItem(key, JSON.stringify(s));
            }
            catch (e) { }
        }
    };
    if (c.here && c.key) {
        setPw(c.key);
        setSession(c.uid);
        if (c.key === ACTIVE_KEY) { // already loaded: no reload needed
            if (newPw)
                saveId(Object.assign(getId(), { pw: newPw }));
            syncLock();
            closeModal();
            buildMenu();
            Share.syncSoon();
            afterLogin();
            return;
        }
        switchPlayer(c.key);
        markJustIn();
        location.reload(); // the page loads that save slot
        return;
    }
    const local = localPlayers().find(p => p.id.uid === c.uid);
    Share.copiesOf(c.uid).then(copies => {
        if (local)
            copies.push(readSlot(local.key));
        const key = moveProfileHere(copies);
        if (!key) {
            toast('That profile can\'t be moved here', 'bad');
            openLogin();
            return;
        }
        setPw(key);
        setSession(c.uid);
        markJustIn();
        // the new home is written to the folder straight away, so the old PC learns it has moved
        Share.pushActive().then(() => location.reload());
    });
}
/** A log-in that reloads the page: the World Boss news still shows once it has loaded. */
function markJustIn() {
    try {
        sessionStorage.setItem('balloonDefense.justIn', '1');
    }
    catch (e) { }
}
function takeJustIn() {
    try {
        const v = sessionStorage.getItem('balloonDefense.justIn');
        sessionStorage.removeItem('balloonDefense.justIn');
        return !!v;
    }
    catch (e) {
        return false;
    }
}
/** Right after logging in: the World Boss news (every log-in), then what's new in this version. */
function afterLogin() {
    checkWbNotes();
    openWbNews();
}
function logout() {
    if (game && !game.over)
        snapshot();
    saveProfile();
    setSession('');
    location.reload();
}
/** Change your password (from your profile card). */
function openChangePw() {
    const has = hasPassword(getId());
    openModal('changepw', `<div class="cardhead"><h2>${has ? 'Change password' : 'Set a password'}</h2><button class="iconbtn x" data-act="close"><img src="assets/ui/close.svg" alt="Close"></button></div>
    <form onsubmit="return false" autocomplete="off">
    ${has ? '<label class="lbl" for="pwOld">Current password</label><input id="pwOld" type="password" maxlength="40" autocomplete="current-password" style="width:100%">' : ''}
    <div class="pwpair"><div><label class="lbl" for="pwIn">New password</label><input id="pwIn" type="password" maxlength="40" autocomplete="new-password"></div>
      <div><label class="lbl" for="pw2In">Type it again</label><input id="pw2In" type="password" maxlength="40" autocomplete="new-password"></div></div></form>
    <div class="err" id="pwErr"></div>
    <div class="row"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="savepw">Save</button></div>`);
}
function saveNewPw() {
    const id = getId(), has = hasPassword(id);
    if (has && !checkPassword(id, $('pwOld').value)) {
        $('pwErr').textContent = 'The current password is wrong';
        return;
    }
    const why = pwProblem($('pwIn').value, $('pw2In').value);
    if (why) {
        $('pwErr').textContent = why;
        return;
    }
    saveId(Object.assign(id, { pw: makePw($('pwIn').value) }));
    Share.syncSoon();
    toast('Password saved', 'good');
    openProfileCard();
}
function openEditProfile() {
    const p = getId();
    UI.draft = { uid: p.uid, name: p.name, animal: p.animal, style: p.style, bg: p.bg, border: p.border, cb: champBorderId(p.cb), cbg: champBgId(p.cbg), title: p.title };
    openModal('editprofile', `<div class="cardhead"><h2>Edit profile</h2><button class="iconbtn x" data-act="close"><img src="assets/ui/close.svg" alt="Close"></button></div>
    <div class="createtop"><div id="draftPrev"></div><div class="grow"><label class="lbl" for="nameIn">Player name</label>
      <div class="nameid"><input id="nameIn" maxlength="16" autocomplete="off" spellcheck="false" value="${esc(p.name)}"><span>#${p.tag}</span></div><div class="err" id="nameErr"></div>
      <label class="lbl" for="titleSel">Title shown under your name</label>
      <select id="titleSel">${TITLES.map(t => `<option value="${t.id}" ${PROFILE.pops >= t.pops ? '' : 'disabled'} ${p.title === t.id ? 'selected' : ''}>${t.name}${PROFILE.pops >= t.pops ? '' : ' — ' + t.pops.toLocaleString() + ' pops'}</option>`).join('')}</select></div></div>
    <div id="draftPick"></div>
    <div class="row"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="saveprofile">Save</button></div>`, 'wide');
    refreshDraft();
    $('titleSel').addEventListener('change', (e) => { UI.draft.title = e.target.value; });
}
function finishEdit() {
    const name = $('nameIn').value, why = nameProblem(name), p = getId();
    if (why) {
        $('nameErr').textContent = why;
        return;
    }
    if (nameTaken(name, p.uid)) {
        $('nameErr').textContent = 'Name already taken';
        return;
    }
    Object.assign(p, { name: name.trim(), animal: UI.draft.animal, style: UI.draft.style, bg: UI.draft.bg, border: UI.draft.border, title: UI.draft.title || p.title });
    if (p.uid === WB_CHAMP_UID) { // the champion's pick of the champion borders
        p.cb = champBorderId(UI.draft.cb);
        p.cbg = champBgId(UI.draft.cbg);
        WB_CHAMP_CB = p.cb;
    }
    saveId(p);
    Share.syncSoon();
    openProfileCard();
    buildMenu();
}
function maybeWhatsNew() {
    const seen = store.get('seen', null);
    if (seen && (seen.never || seen.version === VERSION))
        return;
    openModal('whatsnew', `<div class="cardhead"><h2>What's new in ${VERSION.replace(/\.0$/, '')}</h2><button class="iconbtn x" data-act="whatsnew-close" title="Close"><img src="assets/ui/close.svg" alt="Close"></button></div>
    <ul class="wn">${WHATS_NEW.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    <div class="row" style="justify-content:space-between;align-items:center"><label class="chk"><input type="checkbox" id="wnNever"> Don't show again</label><button class="btn primary" data-act="whatsnew-close">Let's play</button></div>`);
}
/* ---------- Upgrade tree screen ---------- */
function openTree(type, from) {
    if (type && TD[type] && TD[type].hero) { // a hero opens the Heroes tab on that hero
        UI.treeKind = 'heroes';
        UI.heroType = type;
        const on = from === 'game' && game && heroTower();
        UI.heroLv = on && on.type === type ? heroLevel(on) : HERO_MAX_LEVEL; // the hero on the field opens at its level
    }
    else {
        UI.treeKind = 'towers';
        UI.treeType = type || 'dart';
    }
    UI.prevScreen = from || 'menu';
    UI.treeSel = [0, 0];
    show('tree');
    renderTree();
}
/** The Towers | Heroes switch at the top of the Upgrades screen. */
function treeKindHTML() {
    const k = UI.treeKind;
    return `<div class="tkind" role="tablist">
      <button role="tab" class="${k === 'towers' ? 'on' : ''}" data-kind="towers" aria-selected="${k === 'towers'}"><canvas class="kicon" width="60" height="60"></canvas>Towers<small>XP unlocks · skill points</small></button>
      <button role="tab" class="${k === 'heroes' ? 'on' : ''}" data-kind="heroes" aria-selected="${k === 'heroes'}"><img src="assets/heroes/${UI.heroType}-portrait.svg" alt="">Heroes<small>${HERO_IDS.length} heroes · details</small></button>
      <span class="tkhint">Tab switches · ← → browse</span></div>`;
}
/** Draws the current tower on the Towers switch and wires both switch buttons. */
function wireTreeKind() {
    const c = $('tree').querySelector('.kicon');
    if (c) {
        const x = c.getContext('2d');
        x.scale(2, 2);
        drawTower(x, UI.treeType, 15, 15, -Math.PI / 4, null, 0, 12 / TD[UI.treeType].r);
    }
    $('tree').querySelectorAll('[data-kind]').forEach((b) => { b.onclick = () => treeKind(b.dataset.kind); });
}
function treeKind(kind) { UI.treeKind = kind; hideTip(); renderTree(); }
/** Rounds a hero placed on round 1 needs to reach `level`. */
function heroRoundsTo(level) { let xp = 0, r = 0; while (xp < HERO_XP[level]) {
    r++;
    xp += heroRoundXp(r);
} return r; }
/** The stat lines of a hero at a level, for the Heroes tab. */
function heroStatRows(id, level) {
    const s = heroStats(id, level), base = heroStats(id, 1), up = (k) => level > 1 && s[k] !== base[k] ? ' class="up"' : '';
    const rows = [['Damage', s.dmg, 'dmg'], s.mode === 'chain' ? ['Jumps to', s.chains + ' balloons', 'chains'] : ['Pierce', s.pierce, 'pierce'],
        ['Range', s.range + ' px', 'range'], ['Attack', 'every ' + s.rate + ' s', 'rate']];
    if (s.count > 1 || base.count !== s.count)
        rows.push(['Shots', s.count + ' arrows', 'count']);
    if (s.blast)
        rows.push(['Blast', s.blast + ' px', 'blast']);
    if (s.burst)
        rows.push(['Burst', 'every 3rd shot', 'burst']);
    rows.push(['Pops', s.mode === 'chain' ? 'everything, lead too' : s.dtype === 'sharp' ? 'not lead' : s.dtype === 'explosive' ? (s.crack ? 'everything' : 'not black or zebra') : 'everything, lead too', s.crack !== undefined ? 'crack' : 'dtype']);
    rows.push(['Camo', s.camo ? 'Yes' : 'No', 'camo']);
    if (s.bm > 1)
        rows.push(['Vs blimps', s.bm + 'x damage', 'bm']);
    return rows.map(([k, v, key]) => `<div${up(key)}><span>${k}</span><b>${v}</b></div>`).join('');
}
function heroStep(d) { const i = HERO_IDS.indexOf(UI.heroType); UI.heroType = HERO_IDS[(i + d + HERO_IDS.length) % HERO_IDS.length]; renderTree(); }
/** The Heroes tab: pick a hero, then read its stats at any level, its level track, abilities and skills. Heroes have no
    XP to spend: they level up inside each game. */
function renderHeroTree() {
    const id = UI.heroType, h = HEROES[id], L = UI.heroLv, list = heroSkillList(id);
    const at = (lv) => list.filter(x => x[0] === lv);
    const inGameNow = game && !game.over && UI.prevScreen === 'game';
    const allowedNow = inGameNow ? heroesAllowed() : true;
    const tabs = HERO_IDS.map(k => `<button class="ttab hero${k === id ? ' on' : ''}" data-ht="${k}" title="${HEROES[k].name}" style="--hc:${HEROES[k].color}"><img src="assets/heroes/${k}-portrait.svg" alt="${HEROES[k].name}"></button>`).join('');
    const track = Array.from({ length: HERO_MAX_LEVEL }, (_, i) => {
        const lv = i + 1, here = at(lv), ab = here.find(x => x[3] >= 0), sk = here.find(x => x[3] < 0);
        const st = lv <= L ? 'on' : '';
        return `${i ? `<i class="hline${lv <= L ? ' on' : ''}"></i>` : ''}<button class="hlv ${st}${lv === L ? ' sel' : ''}${ab ? ' ab' : sk ? ' sk' : ''}" data-lv="${lv}" title="Level ${lv}${here.length ? ': ' + here.map(x => x[1]).join(', ') : ''}">
          <b>${lv}</b>${ab ? `<kbd>${HERO_KEYS[ab[3]]}</kbd>` : sk ? '<em>★</em>' : ''}<small>${lv === 1 ? 'placed' : 'rd ' + heroRoundsTo(lv)}</small></button>`;
    }).join('');
    const abil = h.abilities.map((a, i) => {
        const lv = HERO_ABILITY_LEVELS[i], open = L >= lv;
        return `<div class="habil${open ? '' : ' locked'}"><div class="hakey"><kbd>${HERO_KEYS[i]}</kbd></div><div><b>${esc(a.name)}</b><span>Level ${lv} · ${a.cd} s recharge${a.aim ? ' · aim it' : ''}</span><p>${esc(a.desc)}</p></div></div>`;
    }).join('');
    const skills = h.skills.map(([lv, name, desc]) => `<li class="${lv > L ? 'locked' : ''}"><em>Lv ${lv}</em><span><b>${esc(name)}</b>${esc(desc)}</span></li>`).join('');
    $('tree').innerHTML = `<div class="treehead hero" style="--hc:${h.color}"><button class="back" id="tBack" title="Back (Esc)"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M19.5 12H6M11.5 5.5 5 12l6.5 6.5" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Back</span></button>
      <button class="arrow" id="tPrev" title="Previous hero (←)" aria-label="Previous hero">${CHEVRON('l')}</button><img class="hhead" src="assets/heroes/${id}-portrait.svg" alt="">
      <div class="tname"><h2>${h.name}</h2><span>${esc(h.role)}</span></div>
      <button class="arrow" id="tNext" title="Next hero (→)" aria-label="Next hero">${CHEVRON('r')}</button>
      <div class="txpbox"><div class="txpnum"><img src="assets/ui/coin.svg" alt=""><b>${money(inGameNow ? price(h.cost, id) : h.cost)}</b>${inGameNow ? 'this game' : 'on Medium'}</div>
        <small>One hero per game · levels 1–${HERO_MAX_LEVEL} as you clear rounds</small></div>
</div>
    ${treeKindHTML()}
    <div class="ttabs">${tabs}</div>
    <p class="tdesc">${esc(h.desc)} ${inGameNow ? (allowedNow ? 'Heroes are above the towers in this game.' : `No heroes in ${MODES[game.mode].name} mode.`) : 'In a game, heroes are listed above the towers (every mode except Primary Only).'}</p>
    <div class="treebody">
      <div class="treecard herocard" style="--pc:${h.color}"><img class="hbig" src="assets/heroes/${id}-portrait.svg" alt=""><h3>${h.name}</h3><div class="muted">Level <b>${L}</b> stats</div>${L > 1 ? '<div class="muted small"><span class="upk">▲</span> gained since level 1</div>' : ''}
        <div class="hstats">${heroStatRows(id, L)}</div></div>
      <div class="treegrid">
        <h4 class="hsec">Level track <small>click a level to see the hero at that level · “rd” = round it is reached if placed on round 1</small></h4>
        <div class="htrack">${track}</div>
        <h4 class="hsec">Abilities</h4><div class="habils">${abil}</div>
        <h4 class="hsec">Skills <small>always on once reached</small></h4><ul class="hskills big">${skills}</ul>
        <div class="treenote">A hero earns 10 + 2 × round XP at the end of each round on the field. Selling it loses its levels.
          Before it fights a round you can swap it for another hero; after that, only that hero for the rest of the game. Heroes need no XP or skill points here.</div></div>
    </div>`;
    $('tBack').onclick = closeTree;
    $('tPrev').onclick = () => heroStep(-1);
    $('tNext').onclick = () => heroStep(1);
    $('tree').querySelectorAll('[data-ht]').forEach((b) => { b.onclick = () => { UI.heroType = b.dataset.ht; renderTree(); }; });
    $('tree').querySelectorAll('[data-lv]').forEach((b) => { b.onclick = () => { UI.heroLv = +b.dataset.lv; renderTree(); }; });
    wireTreeKind();
}
function closeTree() {
    if (UI.prevScreen === 'game' && game && !game.over) {
        show('game');
        // perks only change between games; XP unlocks apply now
        buildShop();
        renderPanel();
        fit();
        UI.paused = true;
        openPause();
    }
    else {
        buildMenu();
        show('menu');
    }
}
function treeStep(d) { const i = SHOP.indexOf(UI.treeType); UI.treeType = SHOP[(i + d + SHOP.length) % SHOP.length]; UI.treeSel = [0, 0]; renderTree(); }
function renderTree() {
    if (UI.treeKind === 'heroes')
        return renderHeroTree();
    const type = UI.treeType, d = TD[type], pr = tprog(type), [sp, si] = UI.treeSel, u = d.paths[sp][si], tier = si + 1;
    const L = towerLevel(type), nextXp = towerXpForLevel(L + 1), curXp = towerXpForLevel(L);
    const why = unlockProblem(type, sp, tier), unlocked = why === 'unlocked';
    const baseCost = game && inGame() ? price(u.c, type, true) : Math.round(u.c * twMul(type, 'up') / 5) * 5;
    const grid = [0, 1, 2].map(p => {
        const open = d.paths[p].filter((x, i) => tierUnlocked(type, p, i + 1)).length;
        return `<div class="trow" style="--pc:${PATH_COL[p]}"><div class="pl"><b>Path ${p + 1}</b><small>${open} / 5 open</small></div><div class="tnodes">${d.paths[p].map((x, i) => {
            const tr = i + 1, own = tierUnlocked(type, p, tr), ready = !own && unlockProblem(type, p, tr) === '';
            const st = own ? 'owned' : ready ? 'ready' : 'locked';
            const sub = own ? (tr < 3 ? 'Open' : '✓ Unlocked') : ready ? '▲ Unlock ' + TIER_XP[tr].toLocaleString() : TIER_XP[tr].toLocaleString() + ' XP';
            return `${i ? `<i class="tline${own ? ' on' : ''}"></i>` : ''}<div class="tcell ${st}"><button class="tnode${p === sp && i === si ? ' sel' : ''}" data-p="${p}" data-i="${i}" title="${esc(x.n)}">${upIcon(type, p, i, own ? 'owned' : 'locked', 62)}</button><b>${esc(x.n)}</b><small>${sub}</small></div>`;
        }).join('')}</div></div>`;
    }).join('');
    const tabs = SHOP.map(k => `<button class="ttab${k === type ? ' on' : ''}" data-tt="${k}" title="${TD[k].name}"><canvas width="72" height="72"></canvas>${xpReady(k) ? '<span class="xpready" title="An XP unlock is ready">▲</span>' : ''}</button>`).join('');
    const perks = perksFor(type), alloc = perkAlloc(type), pts = skillPoints(type), spent = spentPoints(type);
    const lvPct = L < MAX_TOWER_LEVEL ? Math.round(100 * (pr.total - curXp) / (nextXp - curXp)) : 100;
    $('tree').innerHTML = `<div class="treehead"><button class="back" id="tBack" title="Back (Esc)"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M19.5 12H6M11.5 5.5 5 12l6.5 6.5" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Back</span></button>
      <button class="arrow" id="tPrev" title="Previous tower (←)" aria-label="Previous tower">${CHEVRON('l')}</button><canvas id="tIcon" width="112" height="112"></canvas>
      <div class="tname"><h2>${d.name}</h2><span>Tower level <b>${L}</b>${L < MAX_TOWER_LEVEL ? '' : ' (max)'}</span></div>
      <button class="arrow" id="tNext" title="Next tower (→)" aria-label="Next tower">${CHEVRON('r')}</button>
      <div class="txpbox"><div class="txpnum"><img src="assets/ui/star.svg" alt=""><b>${pr.xp.toLocaleString()}</b> XP to spend</div>
        <div class="xpbar"><i style="width:${lvPct}%"></i></div><small>${L < MAX_TOWER_LEVEL ? `${(pr.total - curXp).toLocaleString()} / ${(nextXp - curXp).toLocaleString()} to level ${L + 1}` : 'Max level'}</small></div>
</div>
    ${treeKindHTML()}
    <div class="ttabs">${tabs}</div>
    <p class="tdesc">${d.desc} Earn ${d.name} XP by using it: ${TXP.perRound} per round on the field plus 1 per ${TXP.perPops} layers it pops.</p>
    <div class="treebody">
      <div class="treecard" style="--pc:${PATH_COL[sp]}">${upIcon(type, sp, si, unlocked ? 'owned' : 'locked', 112)}<h3>${esc(u.n)}</h3><div class="muted">Path ${sp + 1} · Tier ${tier}${tier === ABILITY_TIER ? ' · ability: ' + d.ability.name : tier === ABILITY_TIER + 1 ? ' · stronger ability' : ''}</div>
        <p>${esc(u.d)}</p><div class="cost"><img src="assets/ui/coin.svg" alt="">${money(baseCost)} in game</div>
        ${unlocked ? `<div class="unl">${tier < 3 ? 'Always available' : 'Unlocked'}</div>` : `<button class="btn primary big" id="tUnlock" ${why ? 'disabled' : ''}>Unlock for ${TIER_XP[tier].toLocaleString()} XP</button><div class="muted small">${why || ''}</div>`}</div>
      <div class="treegrid">${grid}<div class="treenote">Tiers 1–2 are always open. Tiers 3, 4 and 5 cost ${TIER_XP[3]}, ${TIER_XP[4].toLocaleString()} and ${TIER_XP[5].toLocaleString()} XP, in order, per path.
        In a game, one path can reach tier ${PATH_MAX}, a second tier ${SECOND_MAX}, and the third closes.</div></div>
    </div>
    <div class="perks"><div class="perkhead"><h3>Skill points</h3><span><b>${pts - spent}</b> of ${pts} free · 1 per tower level</span><button class="btn small" id="tReset">Reset (free)</button></div>
      <div class="perkgrid">${perkList(type).map(k => `<div class="perk"><b>${k.name}</b><span>${k.per} per point</span><div class="ppips">${Array.from({ length: k.max }, (_, i) => `<i class="${i < (alloc[k.id] || 0) ? (i < perks[k.id] ? 'on' : 'over') : ''}"></i>`).join('')}</div>
        <div class="pbtns"><button data-perk="${k.id}" data-d="-1" ${(alloc[k.id] || 0) ? '' : 'disabled'}>−</button><button data-perk="${k.id}" data-d="1" ${(alloc[k.id] || 0) >= k.max || spent >= pts ? 'disabled' : ''}>+</button></div></div>`).join('')}</div>
      <p class="muted small">${game && !game.over && UI.prevScreen === 'game' ? 'Skill point changes apply from your next game.' : 'Skill points apply to every game you start. Reset them any time between games.'}</p></div>`;
    const ic = $('tIcon').getContext('2d');
    ic.scale(2, 2);
    drawTower(ic, type, 28, 28, -Math.PI / 4, null, 0, 22 / d.r);
    $('tree').querySelectorAll('.ttab').forEach((b) => {
        const c = b.querySelector('canvas').getContext('2d');
        c.scale(2, 2);
        drawTower(c, b.dataset.tt, 18, 18, -Math.PI / 4, null, 0, 14 / TD[b.dataset.tt].r);
        b.onclick = () => { UI.treeType = b.dataset.tt; UI.treeSel = [0, 0]; renderTree(); };
    });
    $('tBack').onclick = closeTree;
    $('tPrev').onclick = () => treeStep(-1);
    $('tNext').onclick = () => treeStep(1);
    $('tReset').onclick = () => { resetPerks(type); renderTree(); };
    wireTreeKind();
    if ($('tUnlock'))
        $('tUnlock').onclick = () => {
            if (unlockTier(type, sp, tier)) {
                Sound.play('upgrade');
                renderTree();
            }
        };
    $('tree').querySelectorAll('.tnode').forEach((b) => b.addEventListener('click', () => { UI.treeSel = [+b.dataset.p, +b.dataset.i]; renderTree(); }));
    $('tree').querySelectorAll('[data-perk]').forEach((b) => b.addEventListener('click', () => { setPerk(type, b.dataset.perk, +b.dataset.d); renderTree(); }));
}
/* ---------- Home page ---------- */
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
function badgeRow(map) {
    const r = records()[map.id] || {}, ch = challengesWon(map.id);
    const icons = Object.entries(DIFF).map(([k, d]) => `<span title="${d.name} badge: ${r[k] && r[k].won ? 'earned' : 'not yet'}">${badgeSVG(d.badge, !!(r[k] && r[k].won))}</span>`).join('');
    const stars = CHALLENGES.map(m => `<img class="star" src="assets/ui/${ch[m] ? 'star' : 'star-empty'}.svg" title="${MODES[m].name}: ${ch[m] ? 'won' : 'not won yet'}" alt="">`).join('');
    const ua = false;
    const bestRunTxt = (() => {
        const list = Object.keys(DIFF).map(k => bestRun(map.id, k, ua)).filter(Boolean).sort(compareRuns);
        if (!list.length) {
            const best = Math.max(0, ...Object.keys(DIFF).map(k => (r[k] && r[k].best) || 0));
            return best ? 'Best round ' + best : 'New';
        }
        const b = list[0];
        return b.cleared ? DIFF[b.diff].name + ' ' + (b.livesLost ? '✓' : '★') + ' ' + fmtClock(b.clock) : 'Best round ' + b.round;
    })();
    return `<div class="medals">${icons}<span class="sep"></span>${stars}<span class="best">${bestRunTxt}</span></div>`;
}
function renderProfileChip() {
    const p = getId();
    $('profChip').innerHTML = p && loggedIn() ? `${avatarSVG(p, 44)}<span class="pc"><b>${pName(p.uid, p.name)}<i>#${p.tag}</i></b><small>${currentTitle(p).name} · Lv ${playerLevel()}</small></span>` : '<span class="pc"><b>Log in</b></span>';
}
function showActToast(html) {
    const el = $('actToast');
    el.innerHTML = html + '<button class="x" title="Dismiss">×</button>';
    el.classList.add('on');
    el.querySelector('.x').addEventListener('click', () => el.classList.remove('on'));
}
$('actToast').addEventListener('click', (e) => {
    if (e.target.closest('[data-bk]')) {
        $('actToast').classList.remove('on');
        openSettings('backup');
    }
});
function buildMenu() {
    const run = savedRun();
    $('mNews').classList.toggle('dot', newsUnread());
    renderProtectBar();
    onNotesChange();
    refreshChatDot();
    $('continueBox').classList.toggle('on', !!run);
    if (run) {
        const m = MAPS.find(x => x.id === run.mapId);
        $('contTitle').textContent = 'Continue: ' + m.name + (run.daily ? ' (daily)' : run.mode !== 'standard' ? ' · ' + MODES[run.mode].name : '');
        $('contSub').textContent = `${DIFF[run.diffKey].name} · ${run.inRound ? 'in round ' + run.round : run.round ? 'round ' + run.round + ' done' : 'not started'} · ${run.lives} lives · ${money(run.cash)} · ${run.towers.length} towers`;
    }
    renderProfileChip();
    const dc = dailyConfig(), dm = MAPS[dc.mapIdx], done = dailyDone(), streak = dailyStreak();
    $('daily').classList.toggle('off', dailyOff());
    $('daily').innerHTML = dailyOff() // 5.1: no daily challenge on Saturdays and Sundays
        ? `<img src="assets/ui/calendar.svg" class="dicon" alt=""><div class="grow"><b>No daily challenge today</b>
    <div class="muted">There is no daily challenge on Saturdays and Sundays. The next one is on Monday${streak ? ' · 🔥 your ' + streak + '-day streak is safe' : ''}.</div></div>
    <button class="btn" disabled>Back on Monday</button>`
        : `<img src="assets/ui/calendar.svg" class="dicon" alt=""><div class="grow"><b>Daily challenge${done ? ' — complete ✓' : ''}</b>
    <div class="muted">${esc(dm.name)} · ${DIFF[dc.diffKey].name} · ${MODES[dc.mode].name}${streak ? ' · 🔥 ' + streak + '-day streak' : ''}</div></div>
    <button class="btn ${done ? '' : 'primary'}" data-daily="1">${done ? 'Play again' : 'Play daily'}</button>`;
    renderBoards();
    $('tiers').innerHTML = TIERS.map(t => `<button class="tier${t.id === UI.tier ? ' on' : ''}" data-tier="${t.id}" style="--tc:${t.color}"><span class="dot" style="background:${t.color}"></span>${t.name}<small>${badgeCount(t.id)}/${MAPS.filter(m => m.tier === t.id).length * 4}</small></button>`).join('');
    const maps = $('maps');
    maps.innerHTML = '';
    MAPS.forEach((m, i) => {
        if (m.tier !== UI.tier)
            return;
        const card = document.createElement('button');
        card.className = 'mapcard';
        card.appendChild(mapPreview(m, 640));
        const t = tierOf(m.tier);
        card.insertAdjacentHTML('beforeend', `<div class="body"><h3>${esc(m.name)}${m.v4 ? '<span class="tag new">New</span>' : ''}<span class="tag" style="color:${t.color}">${t.name}</span>${m.paths.length > 1 ? `<span class="tag">${m.paths.length} roads</span>` : ''}${hasWater(m) ? '<span class="tag water">Water</span>' : ''}</h3><p>${esc(m.desc)}</p>${badgeRow(m)}</div>`);
        card.onclick = () => openMapModal(i);
        maps.appendChild(card);
    });
    $('menufoot').textContent = (ART_FAILED ? `⚠ ${ART_FAILED} art files didn't load — keep the "assets" folder next to index.html. ` : '') +
        `Map badges: ${badgeCount()} / ${MAPS.length * 4} · Win a map on Easy, Medium, Hard and Nightmare for its badges. Win challenge modes for stars. · v${VERSION}`;
    if (backupDue())
        showActToast(`<span>You've played ${PROFILE.games - (PROFILE.backupAt || 0)} games since your last backup.</span><button class="btn primary small" data-bk="1">Back up now</button>`);
}
$('tiers').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tier]');
    if (b) {
        UI.tier = b.dataset.tier;
        buildMenu();
    }
});
$('daily').addEventListener('click', (e) => {
    if (e.target.closest('[data-daily]') && !dailyOff())
        startNew(dailyConfig());
});
$('contGo').addEventListener('click', () => {
    const r = savedRun();
    if (r)
        startGame({ mapIdx: MAPS.findIndex(m => m.id === r.mapId), diffKey: r.diffKey, mode: r.mode || 'standard', daily: r.daily }, r);
});
$('contDiscard').addEventListener('click', () => { abandonRun(savedRun()); clearRun(); game = null; buildMenu(); });
function openMapModal(i) {
    UI.menuMap = i;
    const m = MAPS[i], t = tierOf(m.tier), run = savedRun(), ch = challengesWon(m.id);
    const c = openModal('map', `<div class="mapmodal"><div class="cardhead"><div><h2>${esc(m.name)}</h2><p class="lead" style="margin:0 0 10px"><span class="tag" style="color:${t.color}">${t.name}</span> ${esc(m.desc)}</p></div>
    <button class="iconbtn x" data-act="close"><img src="assets/ui/close.svg" alt="Close"></button></div><div id="mmPrev"></div>
    <div class="diffs">${Object.entries(DIFF).map(([k, d]) => {
        const r = recordFor(m.id, k);
        return `<button class="diff${k === UI.menuDiff ? ' on' : ''}" data-act="diff" data-diff="${k}"><div class="t">${d.name}${badgeSVG(d.badge, r.won)}</div><span>${d.note}</span><span>${r.won ? 'Badge earned' : r.best ? 'Best: round ' + r.best : 'Not played'}</span></button>`;
    }).join('')}</div>
    ${stageBoard(m, UI.menuDiff)}
    <div class="modes">${Object.entries(MODES).filter(([, md]) => !md.hidden).map(([k, md]) => `<button class="mode${k === UI.menuMode ? ' on' : ''}" data-act="mode" data-mode="${k}" title="${esc(md.desc)}">${CHALLENGES.includes(k) ? `<img src="assets/ui/${ch[k] ? 'star' : 'star-empty'}.svg" alt="">` : ''}${md.name}</button>`).join('')}</div>
    <p class="modedesc">${esc(MODES[UI.menuMode].desc)}${UI.menuMode !== 'standard' ? ' Challenge runs are not ranked.' : ''}</p>
    ${run ? `<div class="warnline">Starting a new game replaces your saved game on ${esc(MAPS.find(x => x.id === run.mapId).name)}.</div>` : ''}
    <div class="row"><button class="btn primary big" data-act="play">Play ${DIFF[UI.menuDiff].name}${UI.menuMode !== 'standard' ? ' · ' + MODES[UI.menuMode].name : ''}</button></div></div>`, 'wide');
    c.querySelector('#mmPrev').appendChild(mapPreview(m, 1200));
}
/* ---------- Players on this PC: player list, leaderboards, profile cards ---------- */
/** Modals the player can't click away: game results, and the first-run profile screens. */
function modalLocked() { return UI.modal === 'end' || (!loggedIn() && ['login', 'loginpw', 'register', 'restore'].includes(UI.modal)); }
function runResult(r) { return r.cleared ? (r.livesLost ? r.livesLost + ' lost · ' : '★ ') + fmtClock(r.clock) : 'Round ' + r.round; }
function titleOf(pl) { const t = titleById(pl.id.title); return pl.profile.pops >= t.pops ? t : TITLES[0]; }
/** Rank badge: a medal for places 1–3, the number after that. */
function rankBadge(rank, px = 22) {
    return rank <= 3 ? `<img class="rkm" src="assets/ui/medal-${MEDALS[rank - 1]}.svg" width="${px}" height="${px}" alt="${MEDALS[rank - 1]} medal" title="${['1st', '2nd', '3rd'][rank - 1]} place">`
        : `<i class="rk">${rank}</i>`;
}
function boardRow(pl, rank, right, sub) {
    return `<li class="lbrow${pl.me ? ' me' : ''}" data-act="player" data-player="${esc(pl.key)}" title="Open ${esc(pl.id.name)}'s profile">${rankBadge(rank)}${avatarSVG(pl.id, 28)}
      <span class="pn"><b>${pName(pl.id.uid, pl.id.name)}<em>#${esc(pl.id.tag)}</em>${pl.me ? '<u>you</u>' : ''}</b><small>${sub}</small></span><b class="sc">${right}</b></li>`;
}
/* ----- Home page: the players and the tier boards ----- */
function renderPlayers(players) {
    const here = players.filter(p => !p.remote).length, away = players.length - here;
    $('playersNote').textContent = players.length <= 1 ? (Share.connected() ? 'Only you so far: other PCs appear here once they connect to the same folder' : 'Only you so far')
        : here + ' on this PC' + (away ? ' · ' + away + ' from other PCs' : '') + ' · click one to see their profile';
    $('shareBox').innerHTML = shareButtonsHTML(false);
    // 5.1: you first, then everyone online, then the others by who was on last ("30m ago", "4h ago")
    const now = Date.now();
    $('players').innerHTML = sortPlayers(players.filter(pl => !pl.me || loggedIn()), now).map(pl => {
        const on = isOnline(pl, now), seen = on ? 'Online' : agoShort(lastSeen(pl, now), now), cbg = champCardBg(pl.id);
        return `<button class="ptile${pl.me ? ' me' : ''}${pl.remote ? ' remote' : ''}${on ? ' online' : ''}${cbg ? ' cbg' : ''}"${cbg ? ` style="--cbe:${cbg.edge}"` : ''} data-player="${esc(pl.key)}" title="Open ${esc(pl.id.name)}'s profile">
      ${cbg ? champBgHTML(cbg.id, 'cbt', 140, 170, 70, 44) : ''}<i class="sdot ${on ? 'on' : 'off'}" title="${on ? 'Online' : 'Offline'}"></i>${pl.me ? '<i class="youbadge">You</i>' : ''}${avatarSVG(pl.id, 64)}<b>${pName(pl.id.uid, pl.id.name)}</b><small>Lv ${levelOf(pl.profile.xp)}</small><span class="ttl">${esc(titleOf(pl).name)}</span>
      <em class="seen${on ? ' on' : ''}" title="${on ? 'Online now' : 'Last online'}">${seen ? esc(seen) : 'Offline'}</em></button>`;
    }).join('') || '<p class="muted small">No players yet.</p>';
    checkOnlineToasts(players, now);
}
/* 5.1: a pop-up when another player comes online. The first look after loading only remembers who is on. */
function checkOnlineToasts(players, now = Date.now()) {
    const on = new Set(players.filter(p => !p.me && isOnline(p, now)).map(p => p.id.uid));
    if (UI.onlineSeen && loggedIn())
        for (const p of players)
            if (!p.me && on.has(p.id.uid) && !UI.onlineSeen.has(p.id.uid))
                presenceToast(p);
    UI.onlineSeen = on;
}
function presenceToast(pl) {
    const box = $('chatToasts'), el = document.createElement('div');
    el.className = 'ctoast presence';
    el.innerHTML = `${avatarSVG(pl.id, 30)}<div class="grow"><b>${pName(pl.id.uid, pl.id.name)}</b><span><i class="sdot on"></i>is online now · Lv ${levelOf(pl.profile.xp)} ${esc(titleOf(pl).name)}</span></div><button class="x" title="Close" aria-label="Close">×</button>`;
    box.prepend(el);
    while (box.children.length > 4)
        box.lastChild.remove();
    let gone = false;
    const bye = () => {
        if (gone)
            return;
        gone = true;
        el.classList.add('out');
        setTimeout(() => el.remove(), 300);
    };
    el.querySelector('.x').addEventListener('click', bye);
    setTimeout(bye, 5000);
}
/** ▲ moved up, ▼ moved down, – unchanged, NEW: since this board's order last changed on this PC. */
function moveTag(d) {
    return d === 'new' ? '<i class="mv new" title="New on this board">NEW</i>' : d > 0 ? `<i class="mv up" title="Up ${d}"><span class="arr">▲</span>${d}</i>`
        : d < 0 ? `<i class="mv down" title="Down ${-d}"><span class="arr">▼</span>${-d}</i>` : '<i class="mv same" title="No change">–</i>';
}
/** A player's name as HTML: the World Boss Champion's shines (css .champname). */
function pName(uid, name) {
    const n = esc(name);
    return uid && uid === WB_CHAMP_UID ? `<span class="champname" title="World Boss Champion">${n}</span>` : n;
}
function whoCell(pl, sub) {
    return `<td class="who"><div class="wc">${avatarSVG(pl.id, 30)}<span><b>${pName(pl.id.uid, pl.id.name)}${pl.me ? '<u>you</u>' : ''}</b><small>${sub}</small></span></div></td>`;
}
/** Global Top 10: medal points from the stage boards (gold 3, silver 2, bronze 1), laid out as a medal table. */
function globalTable(players) {
    const list = globalBoard(players), mv = rankMoves('global', list.map(x => ({ uid: x.p.id.uid, rank: x.rank }))), mine = list.find(x => x.p.me);
    const rows = list.slice(0, GLOBAL_SIZE).map(x => `<tr class="${x.p.me ? 'me' : ''}${x.rank === 1 ? ' first' : ''}" data-player="${esc(x.p.key)}" title="Open ${esc(x.p.id.name)}'s profile">
      <td class="rk"><b>${x.rank}</b>${moveTag(mv[x.p.id.uid])}</td>${whoCell(x.p, esc(titleOf(x.p).name))}
      <td class="n">${x.gold}</td><td class="n">${x.silver}</td><td class="n">${x.bronze}</td><td class="n tot">${x.points}</td></tr>`).join('');
    return `<div class="mtable"><div class="mthead"><h3><img src="assets/ui/trophy.svg" alt="">Global · Top ${GLOBAL_SIZE}</h3><span class="muted small">Points: gold 3 · silver 2 · bronze 1</span></div>
    <div class="tscroll"><table><thead><tr><th></th><th class="l">Top ${GLOBAL_SIZE} players</th><th><i class="mdot gold"></i>Gold</th><th><i class="mdot silver"></i>Silver</th><th><i class="mdot bronze"></i>Bronze</th><th>Points</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="6" class="empty muted small">Nobody has a medal yet. Finish in the top 3 of any stage to get one.</td></tr>`}</tbody></table></div>
    <div class="tbsub">${mine ? `You: <b>#${mine.rank}</b> of ${list.length} · ${mine.points} pts` : 'Finish in the top 3 of a stage board to rank'}${CROWN_UID ? ' · #1 wears the crown' : ''}</div></div>`;
}
/** Daily Challenge Top 10 for one day (today, or up to 6 days back): best performance first. */
function dailyTable(players) {
    // 5.1: weekdays only. UI.dailyDay is how many challenge days back (0 = today, or last Friday at the weekend).
    const days = dailyDays(5), idx = Math.max(0, Math.min(days.length - 1, -(UI.dailyDay || 0)));
    const date = days[idx], day = new Date(date + 'T12:00:00'), cfg = dailyConfig(date), m = MAPS[cfg.mapIdx], isToday = date === todayStr();
    const list = dailyBoard(date, players), mv = rankMoves('daily:' + date, list.map(x => ({ uid: x.p.id.uid, rank: x.rank }))), mine = list.find(x => x.p.me);
    const rows = list.slice(0, DAILY_SIZE).map(x => `<tr class="${x.p.me ? 'me' : ''}" data-player="${esc(x.p.key)}" title="Open ${esc(x.p.id.name)}'s profile">
      <td class="rk"><b>${x.rank}</b>${moveTag(mv[x.p.id.uid])}</td>${whoCell(x.p, esc(titleOf(x.p).name))}
      <td class="n">${x.run.won ? '<b class="okc">Won</b>' : 'Round ' + x.run.round}</td><td class="n">${x.run.lives}</td><td class="n tot">${fmtClock(x.run.clock)}</td></tr>`).join('');
    const label = isToday ? 'Today' : day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    return `<div class="mtable"><div class="mthead"><h3><img src="assets/ui/calendar.svg" alt="">Daily · Top ${DAILY_SIZE}</h3>
      <span class="daynav"><button class="iconbtn sm" data-act="dailyday" data-d="-1" ${idx >= days.length - 1 ? 'disabled' : ''} title="Day before">◀</button><b>${label}</b><button class="iconbtn sm" data-act="dailyday" data-d="1" ${idx <= 0 ? 'disabled' : ''} title="Next day">▶</button></span></div>
    <p class="muted small dsub">${esc(m.name)} · ${DIFF[cfg.diffKey].name} · ${MODES[cfg.mode].name}</p>
    <div class="tscroll"><table><thead><tr><th></th><th class="l">Top ${DAILY_SIZE} players</th><th>Result</th><th>Lives</th><th>Time</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5" class="empty muted small">Nobody has played this daily challenge yet.</td></tr>`}</tbody></table></div>
    <div class="tbsub">${mine ? `You: <b>#${mine.rank}</b> of ${list.length}` : !isToday ? 'You didn\'t play this day' : 'Play today\'s daily challenge to rank'} · wins first, then fastest, then most lives${dailyOff() ? ' · no daily challenge at the weekend' : ''}</div></div>`;
}
/** 5.1.1: Global and Daily show the top 5; places 6–10 scroll. The box is cut just under the 5th row (measured, since
    row heights follow the font); while the home page is hidden the CSS height is used. */
const TOP_SHOWN = 5;
function fitTopBoards() {
    requestAnimationFrame(() => document.querySelectorAll('#topBoards .tscroll').forEach((box) => {
        const rows = box.querySelectorAll('tbody tr');
        box.classList.toggle('more', rows.length > TOP_SHOWN);
        if (rows.length <= TOP_SHOWN) {
            box.style.maxHeight = '';
            return;
        }
        const top = box.getBoundingClientRect().top, cut = rows[TOP_SHOWN - 1].getBoundingClientRect().bottom - top + box.scrollTop;
        if (cut > 0)
            box.style.maxHeight = Math.ceil(cut) + 'px';
    }));
}
window.addEventListener('resize', fitTopBoards);
function renderBoards() {
    const ua = false, players = allPlayers();
    refreshCrown(players);
    renderPlayers(players);
    renderProfileChip();
    $('topBoards').innerHTML = globalTable(players) + dailyTable(players);
    fitTopBoards();
    renderWorldBoss(players);
    checkCrownNote();
    checkBoardNotes(players);
    $('boardNote').textContent = 'Tier boards: top ' + BOARD_SIZE + (Share.connected() ? ' (this PC and the shared folder)' : ' on this PC');
    $('boards').innerHTML = TIERS.map(t => {
        const board = tierBoard(t.id, ua, players), stages = MAPS.filter(m => m.tier === t.id).length * Object.keys(DIFF).length;
        const mine = board.find(x => x.p.me);
        return `<div class="tboard" style="--tc:${t.color}"><div class="tbhead"><span class="dot"></span><b>${t.name}</b><span class="score">${board.length}<small> ranked</small></span></div>
        ${board.length ? `<ol class="gl">${board.slice(0, BOARD_SIZE).map(x => boardRow(x.p, x.rank, Math.round(x.score).toLocaleString(), x.stages + ' / ' + stages + ' stages · ' + fmtClock(x.clock))).join('')}</ol>`
            : '<p class="muted small">Nobody has cleared a map in this tier yet. Be the first!</p>'}
        <div class="tbsub">${mine ? `You: <b>#${mine.rank}</b> of ${board.length} · ${Math.round(mine.score).toLocaleString()} pts` : 'Clear a map in this tier to rank'}</div></div>`;
    }).join('');
}
$('boards').addEventListener('click', (e) => {
    const r = e.target.closest('[data-player]');
    if (r)
        openProfileCard(r.dataset.player);
});
$('topBoards').addEventListener('click', (e) => {
    const t = e.target, d = t.closest('[data-act=dailyday]'), r = t.closest('[data-player]');
    if (d) {
        UI.dailyDay = Math.max(-4, Math.min(0, (UI.dailyDay || 0) + +d.dataset.d));
        renderBoards();
    }
    else if (r)
        openProfileCard(r.dataset.player);
});
$('players').addEventListener('click', (e) => {
    const r = e.target.closest('[data-player]');
    if (r)
        openProfileCard(r.dataset.player);
});
/* ----- Map pop-up: the stage's top 5 ----- */
function stageBoard(m, k) {
    const ua = false, list = stageRanking(m.id, k, ua), mineRow = list.find(x => x.p.me), r = mineRow && mineRow.run;
    const mine = r ? (r.cleared ? `${r.livesLost === 0 ? '<b class="perfect">Perfect clear</b>' : 'Cleared · ' + r.livesLost + ' lives lost'} · game clock ${fmtClock(r.clock)}` : 'Reached round ' + r.round + ' · ' + r.livesLeft + ' lives left') : 'Not played yet';
    return `<div class="stageboard"><ol class="gl sbtop">${list.length ? list.slice(0, BOARD_SIZE).map(x => boardRow(x.p, x.rank, runResult(x.run), esc(titleOf(x.p).name))).join('') : '<li class="muted small empty">Nobody has played this stage yet.</li>'}</ol>
    <div class="sbmine"><span>Your best</span><b>${mine}</b><span>${mineRow ? 'Rank <b>#' + mineRow.rank + '</b> of ' + list.length : ''}</span></div></div>`;
}
function openRestoreCode() {
    openModal('restore', `<h2>Restore a backup code</h2><p class="lead" style="margin-top:0">Paste the code from your Notepad backup (it starts with BD4-), or load a backup file.</p>
    <textarea id="restoreTxt" placeholder="BD4-…" spellcheck="false"></textarea>
    <div class="row left"><button class="btn" data-act="loadfile">Load backup file</button><span class="muted small" id="bkMsg"></span></div>
    <div class="row">${loggedIn() ? '<button class="btn" data-act="close">Cancel</button>' : '<button class="btn" data-act="backcreate">Back</button>'}<button class="btn primary" data-act="restore">Restore</button></div>`);
}
/** Modal buttons for the player screens. Returns true when handled. */
function playerAction(a, b) {
    if (a === 'restorecode')
        openRestoreCode();
    else if (a === 'backcreate' || a === 'signin')
        openLogin();
    else if (a === 'tocreate')
        openCreateProfile();
    else if (a === 'loginpick')
        openLoginPw(b.dataset.uid);
    else if (a === 'logingo')
        loginGo();
    else if (a === 'logout')
        logout();
    else if (a === 'changepw')
        openChangePw();
    else if (a === 'savepw')
        saveNewPw();
    else if (a === 'history')
        openHistory(b.dataset.player);
    else if (a === 'wbnews-close')
        closeWbNews();
    else if (a === 'wbnews-fight') {
        closeModal();
        startWorldBoss();
    }
    else if (a && a.startsWith('master'))
        masterAction(a, b);
    else if (a === 'infotab')
        openHelp(b.dataset.t);
    else if (a === 'wbinfo')
        openHelp('wb');
    else if (a && a.startsWith('chat-'))
        chatAction(a, b);
    else if (a === 'pweye') { // show / hide a password
        const inp = $(b.dataset.for);
        if (inp) {
            const show = inp.type === 'password';
            inp.type = show ? 'text' : 'password';
            b.classList.toggle('on', show);
            b.title = show ? 'Hide password' : 'Show password';
            inp.focus();
        }
    }
    else if (a === 'removeplayer') {
        if (!b.dataset.armed) {
            b.dataset.armed = '1';
            b.textContent = 'Click again to remove this PC\'s copy';
            return true;
        }
        // only this PC's copy goes: the profile stays in the shared folder and on its own PC
        if (removePlayer(b.dataset.key)) {
            closeModal();
            toast('Player removed from this PC');
            buildMenu();
        }
    }
    else if (a === 'deleteaccount') {
        if (!b.dataset.armed) {
            b.dataset.armed = '1';
            b.textContent = 'Click again: delete this profile everywhere';
            return true;
        }
        const look = getId(), uid = deleteActiveProfile();
        if (uid) {
            setSession('');
            Share.tombstone(uid, look).then(() => location.reload());
        }
    }
    else if (a === 'autobk-now') {
        b.disabled = true;
        Share.autoBackup().then(ok => { b.disabled = false; b.textContent = ok ? 'Backed up' : 'Backup failed'; fillAutoBackups(); });
    }
    else if (a === 'autobk-restore')
        restoreAutoBackup(b);
    else if (a === 'news')
        openNews();
    else if (a === 'dailyday') {
        UI.dailyDay = Math.max(-4, Math.min(0, (UI.dailyDay || 0) + +b.dataset.d));
        renderBoards();
    }
    else if (a === 'player')
        openProfileCard(b.dataset.player);
    else if (a && a.startsWith('share-'))
        shareAction(a, b);
    else
        return false;
    return true;
}
/* ----- Shared folder (players on other PCs) ----- */
function ago(t) {
    const s = Math.round((Date.now() - t) / 1000);
    return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : new Date(t).toLocaleDateString();
}
function shareStatusText() {
    const st = Share.state, f = esc(Share.folder || 'the folder');
    if (st === 'unsupported')
        return '<b class="warn">This browser can\'t use a shared folder.</b> Open the game in Microsoft Edge or Google Chrome.';
    if (st === 'off')
        return 'Not connected. To see players from other PCs, connect every PC to the <b>same folder</b> on a shared network drive (the game\'s own folder works). Each player is one small file in it. Nothing is installed and nothing leaves your network.'
            + (gameFolder().path ? '<br>This game was opened from <code>' + esc(gameFolder().path) + '</code>.' : '');
    if (st === 'paused')
        return 'Using <b>' + f + '</b>, but the browser asks for permission again after a restart. Click <b>Reconnect</b>.';
    if (st === 'error')
        return '<b class="warn">Can\'t use ' + f + ':</b> ' + esc(Share.error) + '. Is the network drive available?';
    return (st === 'syncing' ? 'Syncing with <b>' : '<b class="okc">Connected</b> to <b>') + f + '</b>' + (Share.lastSync ? ' · synced ' + ago(Share.lastSync) : '') + ' · players from other PCs: ' + sharedCache().players.length;
}
function shareButtonsHTML(inSettings) {
    const st = Share.state;
    if (st === 'unsupported')
        return inSettings ? '' : '<span class="sharechip off" title="Open the game in Edge or Chrome to share players between PCs">This browser can\'t share between PCs</span>';
    if (st === 'off')
        return `<button class="btn ${inSettings ? 'primary' : 'small'}" data-act="share-connect" title="See players from other PCs through a shared folder">Connect shared folder</button>`;
    if (st === 'paused')
        return `<button class="btn primary ${inSettings ? '' : 'small'}" data-act="share-resume">Reconnect ${esc(Share.folder)}</button>`;
    const chip = inSettings ? '' : `<span class="sharechip${st === 'error' ? ' bad' : ''}" title="${esc(Share.folder)}">${st === 'error' ? '⚠ Folder unavailable' : st === 'syncing' ? 'Syncing…' : '● Shared folder · ' + ago(Share.lastSync)}</span>`;
    return chip + '<button class="btn small" data-act="share-sync">Sync now</button>' + (inSettings ? '<button class="btn small" data-act="share-connect">Change folder</button><button class="btn small" data-act="share-disconnect">Disconnect</button>' : '');
}
function shareAction(a, b) {
    if (a === 'share-connect')
        openShareConnect();
    else if (a === 'share-pick')
        Share.connect().then(ok => {
            if (ok) {
                if (UI.modal === 'shareconnect')
                    closeModal();
                toast('Shared folder connected: ' + Share.folder, 'good');
            }
            else if (Share.state === 'error' && $('scErr'))
                $('scErr').textContent = 'Can\'t use that folder: ' + Share.error + '.';
        });
    else if (a === 'share-copypath')
        copyText(gameFolder().path).then(ok => { b.textContent = ok ? 'Copied!' : 'Select the path and press Ctrl+C'; });
    else if (a === 'share-resume')
        Share.resume();
    else if (a === 'share-sync')
        Share.sync();
    else if (a === 'share-disconnect')
        Share.disconnect();
}
/** Step before the folder picker: says which folder to choose (the one the game was opened from, if it's shared). */
function openShareConnect() {
    const g = gameFolder();
    const where = g.kind === 'network' || g.kind === 'drive'
        ? `<p class="lead" style="margin-top:0">Everyone opens this game from:</p>
           <div class="pathbox"><code>${esc(g.path)}</code><button class="btn small" data-act="share-copypath">Copy path</button></div>
           <ol class="steps"><li>Click <b>Choose folder</b> below.</li><li>In the window that opens, click the address bar at the top, paste the path (<kbd>Ctrl</kbd>+<kbd>V</kbd>) and press <kbd>Enter</kbd>.</li>
           <li>Click <b>Select folder</b>, then <b>Edit files</b> (or <b>Allow</b>) when the browser asks.</li></ol>
           <p class="muted small">Do the same on every PC. Everyone must pick <b>this same folder</b>${g.kind === 'drive' ? ' (if your PCs use different drive letters, pick the same shared folder by its network name)' : ''}.</p>`
        : g.kind === 'local'
            ? `<div class="warnline">This game was opened from this PC's own disk (<code>${esc(g.path)}</code>), so other PCs can't use this folder.
               Pick a folder on a <b>shared network drive</b> that everyone can open and save in, and pick the same one on every PC.</div>`
            : '<p class="lead" style="margin-top:0">Pick a folder on a shared network drive that everyone can open and save in. Pick the <b>same folder</b> on every PC.</p>';
    openModal('shareconnect', `<div class="cardhead"><h2>Connect the shared folder</h2><button class="iconbtn x" data-act="close"><img src="assets/ui/close.svg" alt="Close"></button></div>
    ${where}<div class="err" id="scErr"></div>
    <div class="row"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="share-pick">Choose folder</button></div>`);
}
function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText)
        return navigator.clipboard.writeText(text).then(() => true, () => false);
    return Promise.resolve(false);
}
/** Called by share.ts whenever the folder state or the players from other PCs change. */
/** The active profile may be swapped for a newer copy from another PC only on the home page, with nothing open. */
function shareCanReload() { return !inGame() && !UI.modal && $('menu').classList.contains('on'); }
function onShareChange() {
    if (Share.reload && shareCanReload()) {
        location.reload(); // this profile was played on another PC since: load that progress
        return;
    }
    if (Share.kicked && !(inGame() && game && !game.over)) { // master control deleted this profile (5.1)
        Share.kicked = false;
        showNote('This profile was deleted with Master control. You are logged out.', 'lost');
        setTimeout(() => location.reload(), 3000);
        return;
    }
    if (hasProfile() && !activePlayable() && !(inGame() && game && !game.over)) {
        // the profile logged in on another PC and moved there: this PC can't play it any more
        showNote(getId().name + ' logged in on another PC and moved there.', 'lost');
        if (migrateHome())
            setTimeout(() => location.reload(), 2500);
        return;
    }
    if ($('menu').classList.contains('on')) {
        renderBoards();
        renderProtectBar();
        if (UI.modal === 'login')
            openLogin();
    }
    if (UI.modal === 'settings' && $('shStatus')) {
        $('shStatus').innerHTML = shareStatusText();
        $('shBtns').innerHTML = shareButtonsHTML(true);
    }
}
$('shareBox').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b)
        shareAction(b.dataset.act, b);
});
// every 30 s: write this PC's players (the active one also says "in use here"), read everyone else's, and new game results
setInterval(() => {
    if (Share.connected())
        Share.sync();
}, 30000);
// 5.2.1: every 4 s, read only the shared folder's "something changed" marker; sync at once when another PC touched it
setInterval(() => {
    if (Share.connected())
        Share.watch();
}, 4000);
/* ----- Notifications: another player won or lost a game ----- */
function onPlayerEvent(ev) {
    if (SETTINGS.notify === false)
        return;
    const m = MAPS.find(x => x.id === ev.map), d = DIFF[ev.diff];
    const what = ev.daily ? 'the daily challenge' : (m ? m.name : ev.map) + (ev.mode !== 'standard' ? ' · ' + MODES[ev.mode].name : '');
    addNote({ id: 'ev-' + ev.uid + '-' + ev.at, at: ev.at, kind: ev.won ? 'won' : 'lost', av: { uid: ev.uid, animal: ev.animal, style: ev.style, bg: ev.bg, border: ev.border },
        text: ev.name + ' ' + (ev.won ? 'won' : 'lost') + ' ' + what, sub: d.name + ' · round ' + ev.round + ' · ' + ev.lives + ' lives · ' + money(ev.cash) + ' · ' + ev.towers + ' towers' });
    if (inGame()) { // during a game: one line in the bottom bar, so nothing covers the map or the buttons
        toast(`${ev.won ? "🏆 " : ""}${ev.name} ${ev.won ? "won" : "lost"} ${what} · ${d.name} · round ${ev.round} · ${ev.lives} lives · ${money(ev.cash)} · ${ev.towers} towers`, ev.won ? 'good' : 'bad', 6000);
        return;
    }
    const el = document.createElement('div');
    el.className = 'note ' + (ev.won ? 'won' : 'lost');
    el.innerHTML = `${avatarSVG({ animal: ev.animal, style: ev.style, bg: ev.bg, border: ev.border, uid: ev.uid }, 40)}
      <div class="grow"><b>${esc(ev.name)} ${ev.won ? 'won' : 'lost'}</b> <span>${esc(what)}</span>
      <div class="nstats"><span title="Difficulty">${badgeSVG(d.badge, ev.won, 18)}${d.name}</span><span>Round ${ev.round}</span><span>♥ ${ev.lives}</span><span>${money(ev.cash)}</span><span>${ev.towers} towers</span></div></div>
      ${ev.won ? '<img class="ntrophy" src="assets/ui/trophy.svg" alt="Trophy" title="Won">' : ''}<button class="x" title="Dismiss">×</button>`;
    pushNote(el, 9000);
}
function pushNote(el, ms) {
    const box = $('notes');
    box.appendChild(el);
    while (box.children.length > 3)
        box.firstChild.remove();
    const bye = () => { el.classList.add('out'); setTimeout(() => el.remove(), 400); };
    el.querySelector('.x').addEventListener('click', bye);
    setTimeout(bye, ms);
}
/** A plain message card at the top right (on top of the HUD's own toasts, so it is seen on every screen). */
function showNote(text, kind = 'won') {
    const el = document.createElement('div');
    el.className = 'note ' + kind;
    el.innerHTML = `<div class="grow"><b>${esc(text)}</b></div><button class="x" title="Dismiss">×</button>`;
    pushNote(el, 8000);
}
/* ----- News: what changed in each version ----- */
function newsUnread() { const s = store.get('seen', null); return !s || s.version !== VERSION; }
function openNews() {
    store.set('seen', Object.assign({}, store.get('seen', {}), { version: VERSION }));
    $('mNews').classList.remove('dot');
    openModal('news', `<div class="cardhead"><h2>News</h2><button class="iconbtn x" data-act="close"><img src="assets/ui/close.svg" alt="Close"></button></div>
    ${NEWS.map((n, i) => `<section class="newsv"><h3>Version ${esc(n.v)}${i === 0 ? ' <span class="tag new">Current</span>' : ''}<small class="muted">${new Date(n.date + 'T12:00:00').toLocaleDateString()}</small></h3>
      <ul class="wn">${n.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>`).join('')}`, 'wide');
}
$('mNews').addEventListener('click', openNews);
/* ----- Profile cards (yours and every other player's on this PC) ----- */
function openProfileCard(key = ACTIVE_KEY) {
    const players = allPlayers(), pl = players.find(x => x.key === key);
    if ((!pl || pl.me) && key === ACTIVE_KEY && !loggedIn())
        return openLogin();
    if (!pl)
        return;
    const me = pl.me, p = pl.id, P = pl.profile, title = titleOf(pl), hrs = Math.floor(P.seconds / 3600), mins = Math.floor(P.seconds / 60) % 60;
    const fav = Object.entries(P.built).sort((a, b) => b[1] - a[1])[0];
    const L = levelOf(P.xp), next = xpForLevel(L + 1), cur = xpForLevel(L), nt = TITLES.find(t => P.pops < t.pops);
    const md = medalsOf(key, players);
    const best = Object.values(pl.runs).filter(r => !r.ua).sort(compareRuns).slice(0, 5)
        .map(r => ({ r, rank: (stageRanking(r.map, r.diff, false, players).find(x => x.p.key === key) || { rank: 0 }).rank }));
    const badges = MAPS.reduce((s, m) => s + Object.keys(DIFF).filter(k => pl.records[m.id] && pl.records[m.id][k] && pl.records[m.id][k].won).length, 0);
    const stars = MAPS.reduce((s, m) => s + Object.keys((pl.records[m.id] && pl.records[m.id].modes) || {}).length, 0);
    const towers = SHOP.map(t => ({ t, total: (pl.towers[t] || {}).total || 0 })).sort((a, b) => b.total - a.total).slice(0, me ? 9 : 5);
    const others = players.length - 1, cbg = champCardBg(p);
    openModal('profile', `<div class="cardhead"><h2>${me ? 'Your profile' : pl.remote ? 'Player <small class="muted">· another PC</small>' : 'Player'}</h2><button class="iconbtn x" data-act="close"><img src="assets/ui/close.svg" alt="Close"></button></div>
    <div class="pcard${cbg ? ' cbg' : ''}"${cbg ? ` style="--cbe:${cbg.edge}"` : ''}>${cbg ? champBgHTML(cbg.id, 'cbp', 760, 230, 74, 115) : ''}<div class="pav">${avatarSVG(p, 120)}</div><div class="grow">
      <div class="pname">${pName(p.uid, p.name)}<span>#${esc(p.tag)}</span></div><div class="ptitle">${esc(title.name)}</div>
      ${nt ? `<div class="pnext">Next title: <b>${esc(nt.name)}</b> · ${P.pops.toLocaleString()} / ${nt.pops.toLocaleString()} pops</div>` : '<div class="pnext">Highest title reached</div>'}
      <div class="medalrow" title="1st, 2nd and 3rd places held on Standard stage boards">${MEDALS.map(m => `<span><img src="assets/ui/medal-${m}.svg" alt="${m}">${md[m]}</span>`).join('')}<small class="muted">${medalPoints(md)} pts${p.uid && p.uid === CROWN_UID ? ' · <b class="crownc">Global #1</b>' : ''}${others ? '' : ' · add players to compete'}</small></div>
      <div class="lvlbig"><b>Level ${L}</b><div class="xpbar"><i style="width:${Math.round(100 * (P.xp - cur) / (next - cur))}%"></i></div><span>${(P.xp - cur).toLocaleString()} / ${(next - cur).toLocaleString()} XP to level ${L + 1}</span></div>
      <div class="row left" style="margin-top:6px">${me ? `<button class="btn" data-act="editprofile">Edit profile</button><button class="btn" data-act="changepw">${hasPassword(p) ? 'Change password' : 'Set password'}</button><button class="btn" data-act="history" data-player="${esc(key)}">Game history</button><button class="btn" data-act="logout">Log out</button>`
        : `<span class="onl ${isOnline(pl) ? 'on' : 'off'}"><i class="sdot ${isOnline(pl) ? 'on' : 'off'}"></i>${isOnline(pl) ? 'Online' : 'Offline' + (lastSeen(pl) ? ' · ' + agoShort(lastSeen(pl)) : '')}</span><span class="muted small">Plays on ${pl.remote || !homeHere(p) ? 'another PC' : 'this PC'}${pl.updated ? ' · last saved ' + ago(pl.updated) : ''}</span><button class="btn small" data-act="history" data-player="${esc(key)}">Game history</button>`}</div></div></div>
    <div class="bigstats four">
      <div><b>${P.pops.toLocaleString()}</b><span>Balloons popped</span></div>
      <div><b>${P.games}</b><span>Games played</span></div>
      <div><b>${P.wins}</b><span>Wins</span></div>
      <div><b>${P.finished ? Math.round(100 * Math.min(1, P.wins / P.finished)) : 0}%</b><span>Win rate (${P.wins}/${P.finished})</span></div>
      <div><b>${badges} / ${MAPS.length * 4}</b><span>Map badges</span></div>
      <div><b>${stars} / ${MAPS.length * CHALLENGES.length}</b><span>Challenge stars</span></div>
      <div><b>${P.perfect || 0}</b><span>Perfect clears</span></div>
      <div><b>${dailyStreak(pl.daily)}</b><span>Daily streak</span></div>
      <div><b>${P.rounds.toLocaleString()}</b><span>Rounds survived</span></div>
      <div><b>${P.bosses}</b><span>Bosses defeated</span></div>
      <div><b>${hrs ? hrs + 'h ' : ''}${mins}m</b><span>Time played</span></div>
      <div><b>${fav && TD[fav[0]] ? TD[fav[0]].name.split(' ')[0] : '—'}</b><span>Favourite tower</span></div>
      <div><b>${Math.max(wbScoreOf(pl, wbWeek(), true), wbScoreOf(pl, wbWeek(), false)).toLocaleString()}</b><span>World Boss damage (this week)</span></div>
      <div><b>${Math.max(0, ...Object.keys(pl.wbHist || {}).map(k => wbScoreOf(pl, parseInt(k), !k.endsWith('n')))).toLocaleString()}</b><span>World Boss best ever</span></div>
    </div>
    <h3 class="sub">${me ? 'Tower levels' : 'Top towers'}</h3><div class="tlevels">${towers.map(x => `<div><canvas data-tw="${x.t}" width="56" height="56"></canvas><b>Lv ${towerLevelOf(x.total)}</b><span>${TD[x.t].name}</span></div>`).join('')}</div>
    <h3 class="sub">Best runs</h3>${best.length ? `<div class="bestlist">${best.map(({ r, rank }) => { const m = MAPS.find(x => x.id === r.map); return `<div><span>${esc(m ? m.name : r.map)} · ${DIFF[r.diff] ? DIFF[r.diff].name : esc(r.diff)}${rank && rank <= 3 ? ' ' + rankBadge(rank, 18) : ''}</span><b>${r.cleared ? (r.livesLost ? 'Cleared · ' + r.livesLost + ' lost' : 'Perfect') + ' · ' + fmtClock(r.clock) : 'Round ' + r.round}${rank ? ' · #' + rank : ''}</b></div>`; }).join('')}</div>` : '<p class="muted" style="margin:0">No finished runs yet.</p>'}
    <div class="row">${me ? (isPcOwner(p.uid) ? '<button class="btn danger" data-act="deleteaccount" title="Deletes this profile on every PC. Only this PC (where it was created) can do this.">Delete profile</button>'
        : '<span class="muted small" style="margin-right:auto">Only the PC that created this profile can delete it.</span>')
        + '<button class="btn" data-act="backupnow">Back up progress</button>'
        : pl.remote ? '' : `<button class="btn danger" data-act="removeplayer" data-key="${esc(key)}" title="Removes only this PC's copy. The profile stays on its own PC and in the shared folder.">Remove from this PC</button>`}</div>`, 'wide');
    document.querySelectorAll('#modalCard canvas[data-tw]').forEach(c => { const x = c.getContext('2d'); x.scale(2, 2); drawTower(x, c.dataset.tw, 14, 14, -Math.PI / 4, null, 0, 11 / TD[c.dataset.tw].r); });
}
/* ---------- World Boss: banner, damage board, info ---------- */
function wbImg(id, cls = 'wbart') { return `<img class="${cls}" src="assets/balloons/${id}.svg" alt="">`; }
function wbInfoHTML() {
    const k = wbWeek(), p = wbPick(k), mode = wbOpenMode(), nx = wbNextStart();
    const tierHp = (elite) => WB_TIERS.map((t, i) => wbTierStats(i + 1, elite, p.boss).hp.toLocaleString()).join(' · ');
    return `<div class="wbinfo-now">${wbImg(p.boss.id, 'wbart mid')}<div><b>${mode ? 'Now (' + (mode === 'elite' ? 'Elite' : 'Normal') + ')' : 'Next (' + (nx.elite ? 'Elite' : 'Normal') + ')'}: ${esc(p.boss.name)} on ${esc(p.map.name)}</b>
      <span class="muted">${esc(p.boss.build)} · ${mode ? 'open now, ends ' + new Date(wbOpenEnd()).toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' }) + ' (your time) · ' + wbLeft(wbOpenEnd()) + ' left' : 'opens ' + wbOpensTxt() + ' (your time) · in ' + wbLeft(nx.at)}</span></div></div>
    <ul>
      <li>Once a week, everyone fights the same <b>World Boss</b> on the same map. The boss and the map are picked at random each week, never the same pair twice in a row.</li>
      <li>It is fought twice, both days from <b>7:30 AM to 5:00 PM Philippine time</b>: <b>Normal on Thursday</b> and <b>Elite on Friday</b>. Each day has its own Top 5 board. A run still going at 5:00 PM ends, and its damage counts.</li>
      <li>At <b>5:01 PM on Friday</b> the <b>World Boss Champion</b> is announced to every player, even in the middle of a game (it pauses): #1 on the Elite board (or on the Normal board if nobody played Elite). Everyone also gets a notification with the top 3.</li>
      <li>You start with the boss's lives (<b>${p.boss.lives.toLocaleString()}</b> this week) and its start money. Press <b>PLAY</b> to start round 1.</li>
      <li>It is played in <b>rounds</b>, like a normal game. The next round starts by itself as soon as this round's balloons are popped (or after ${WB_ROUND_MAX} seconds), and <b>rounds keep going while a boss is out</b>. Every round pays its round bonus and Gold Mines pay every ${MINE_PAY_TIME} seconds, so farms keep making money.</li>
      <li>The boss comes in <b>${WB_TIERS.length} tiers</b>, one every 20 rounds: on <b>rounds ${WB_TIERS_TXT()}</b>. A tier only comes once the one before it is popped. <b>Pop all ${WB_TIERS.length} before round ${WB_LAST_ROUND}</b> to win. The stars on the boss bar show its tier.</li>
      <li>Each tier walks the road very slowly towards the <b>END</b>, and stands still for a moment every time it summons. If it gets there, <b>the run is over</b>. Later tiers have more HP and walk a little faster. Tier HP this week, Normal: <b>${tierHp(false)}</b>. Elite: <b>${tierHp(true)}</b>, and it walks 15% faster.</li>
      <li><b>Skulls</b> on its health bar: when its health drops past one it uses its skill (this week: <b>${esc(WB_SKILLS[p.boss.skill] || '')}</b>). At the last, flaming skull it gets <b>angry</b>: 25% faster, and it summons more often. Elite has one more skull on every tier.</li>
      <li>The boss can't be frozen, stunned or slowed. Towers with extra damage to blimps do that extra damage to it too.</li>
      <li>It summons balloons every <b>15 seconds</b>, every <b>10 seconds</b> after 10 minutes, and every <b>5 seconds</b> after 20 minutes. They get <b>1% stronger every minute</b>, and tougher kinds come in over time: ceramics from 18 minutes, blimps from 24. Balloons that reach the END take lives.</li>
      <li><b>Ranking:</b> popping all ${WB_TIERS.length} tiers ranks first, then the <b>fastest</b>, then the <b>most lives left</b>. Runs that don't pop all ${WB_TIERS.length} rank below every win, by the <b>damage you deal</b>: every hit on the boss in full, plus every balloon layer you pop, with no cap. Your best run of the day counts on that day's board, at the bottom of the leaderboards.</li>
      <li>The <b>Champion</b> unlocks <b>10 exclusive Champion borders</b> and <b>10 card backgrounds</b> for 7 days, until the next champion is announced, and can switch between them any time in <b>Edit profile</b>. The border shows on their avatar everywhere, the background behind their player and profile cards. Nobody else can wear them.</li>
      <li>World Boss runs don't count on the tier or stage boards, and they can't be saved half-way: your damage so far always counts.</li>
    </ul>
    <h3>The four bosses</h3>
    <table class="wbtable"><thead><tr><th></th><th class="l">Boss</th><th>Speed</th><th>Defense</th><th>HP (tiers 1–5)</th><th>Skull skill</th><th>Summons</th><th>Lives</th><th>Start money</th></tr></thead>
    <tbody>${WB_BOSSES.map(b => `<tr><td>${wbImg(b.id, 'wbart sm')}</td><td class="l"><b>${esc(b.name)}</b><small class="muted">${esc(b.build)}</small>${wbModsHTML(b)}</td><td>${b.speed}</td><td>${esc(b.defTxt)}</td><td>${wbTierStats(1, false, b).hp.toLocaleString()}–${b.hp.toLocaleString()}</td><td>${esc(WB_SKILLS[b.skill] || '')}</td><td>${esc(b.summonTxt)}</td><td>${b.lives.toLocaleString()}</td><td>${money(b.cash)}</td></tr>`).join('')}</tbody></table>
    <h3>The four maps</h3><div class="wbmaps">${WB_MAPS.map(m => `<div><canvas data-wbmap="${m.id}"></canvas><b>${esc(m.name)}</b><span class="muted small">${esc(m.desc)}</span></div>`).join('')}</div>`;
}
/** Draws the small World Boss map previews inside an element. */
function fillWbMaps(root) {
    root.querySelectorAll('canvas[data-wbmap]').forEach((c) => {
        const m = WB_MAPS.find(x => x.id === c.dataset.wbmap);
        if (m)
            c.replaceWith(mapPreview(m, 320));
    });
}
/** A World Boss board result: the time and lives left when all tiers were popped, else the tiers popped and damage. */
/** The boss's modifiers as chips: "Swarm -20%", "Strength +20%", "Boss aura DEF +20%". Red is harder, green easier. */
function wbModsHTML(b) {
    const m = wbModsOf(b);
    return m.length ? '<div class="wbmods">' + m.map(x => '<span class="wbmod ' + (x.k === 'aura' ? 'aura' : x.v * x.harder > 0 ? 'up' : 'down') + '"' + (x.k === 'aura' ? ' title="Balloons near the boss take ' + x.v + '% less damage"' : '') + '>' + x.name + ' ' + (x.v > 0 ? '+' : '') + x.v + '%</span>').join('') + '</div>' : '';
}
function wbResult(x) {
    const h = x.h || {};
    const res = h.won ? '<b class="okc">Won</b>' : 'T' + (h.tiers || 0);
    return res + ' · ' + fmtClock(+h.t || 0) + ' · ' + (+h.lives || 0).toLocaleString() + ' lives · ' + shortNum(x.d) + ' dmg';
}
/** A board row's result in four cells, in ranking order: Result (Won, or the tiers popped) | Time | Lives left | Damage. */
function wbCells(x) {
    const h = x.h || {};
    return `<td class="n wbres">${h.won ? '<b class="okc">Won</b>' : '<span title="Tiers popped">T' + (h.tiers || 0) + '</span>'}</td><td class="n tot">${fmtClock(+h.t || 0)}</td>`
        + `<td class="n tot">${(+h.lives || 0).toLocaleString()}</td><td class="n tot" title="${Math.round(x.d).toLocaleString()} damage">${shortNum(x.d)}</td>`;
}
/** A big number, short: 950, 12.5k, 18.9m, 1.2b. */
function shortNum(n) {
    n = +n || 0;
    const a = Math.abs(n), d = a >= 1e9 ? 1e9 : a >= 1e6 ? 1e6 : a >= 1e3 ? 1e3 : 0;
    return d ? +(n / d).toFixed(1) + (d === 1e9 ? 'b' : d === 1e6 ? 'm' : 'k') : String(Math.round(n));
}
/** The event whose boards to show: this week's once Thursday's fight has started, else last week's. */
function wbBoardWeek(now = wbNow()) { const k = wbWeek(now); return now >= wbDayStart(k, false) ? k : k - 1; }
/** 5.2.1: the champion prize on the World Boss banner: the 10 Champion borders on your own animal. Click for a closer look. */
function champPrizeStrip() {
    const id = getId() || {}, look = (b) => ({ animal: id.animal || 'fox', style: id.style || 'm', bg: id.bg || 'sky', border: b.id, champ: true });
    return `<button class="champprize" data-act="champprize" title="See the Champion prize"><span class="cpl"><b>Champion prize</b><small>10 borders + 10 card backgrounds · 7 days</small></span>
      <span class="cpavs">${BORDERS.filter(b => b.champ).map(b => avatarSVG(look(b), 30)).join('')}</span></button>`;
}
/** The Champion prize window: every Champion border as a card on your own avatar. The champion can go and pick one. */
function openChampPrize() {
    const id = getId() || {}, me = !!(id.uid && id.uid === WB_CHAMP_UID), cur = champBorderId(id.cb);
    openModal('champprize', `<div class="cardhead"><h2>Champion prize</h2><button class="iconbtn x" data-act="close"><img src="assets/ui/close.svg" alt="Close"></button></div>
    <p class="lead">The World Boss Champion (Elite #1, announced Friday at 5:01 PM) unlocks all 10 of these borders and 10 card backgrounds for 7 days and can switch between them any time. Nobody else can use them.</p>
    ${champCardsHTML(id, me ? cur : '', false)}
    <h3 class="cpsub">Champion card backgrounds</h3>
    ${champBgCardsHTML(id, me ? champBgId(id.cbg) : '', false)}
    <div class="row">${me ? '<button class="btn primary" data-act="champpick">Choose my border and background</button>' : ''}<button class="btn" data-act="close">Close</button></div>`, 'wide');
}
/** Edit profile, scrolled to the Champion border picker. */
function openChampPick() {
    openEditProfile();
    const el = document.querySelector('#modal .champpick');
    if (el)
        el.scrollIntoView({ block: 'center' });
}
/** The World Boss banner and its board, at the bottom of the leaderboards. */
function renderWorldBoss(players = allPlayers()) {
    const el = $('wbBox');
    if (!el)
        return;
    const k = wbWeek(), p = wbPick(k), mode = wbOpenMode(), open = !!mode, bk = wbBoardWeek(), elite = UI.wbTab !== 'normal';
    const board = bk >= WB_FIRST ? wbBoard(bk, players, elite) : [], mine = board.find(x => x.p.me), today = open && (mode === 'elite') === elite && bk === k;
    refreshWbChamp(players);
    const champ = WB_CHAMP_UID ? players.find(x => x.id.uid === WB_CHAMP_UID) : null;
    const rows = board.slice(0, 5).map(x => `<tr class="${x.p.me ? 'me' : ''}" data-player="${esc(x.p.key)}" title="Open ${esc(x.p.id.name)}'s profile">
      <td class="rk">${x.rank <= 3 ? rankBadge(x.rank, 20) : '<b>' + x.rank + '</b>'}</td>${whoCell(x.p, esc(titleOf(x.p).name))}${wbCells(x)}</tr>`).join('');
    el.innerHTML = `<div class="wbbanner" style="--wbc:${BT[p.boss.id].col}">
      <div class="wbhead"><span class="wbtag">WORLD BOSS</span><span class="wbtimer" id="wbTimer">${wbTimerHTML()}</span></div>
      <div class="wbbody">${wbImg(p.boss.id, 'wbart')}<div class="wbtxt"><h3>${esc(p.boss.name)}</h3><div class="wbbuild">${esc(p.boss.build)}</div>${wbModsHTML(p.boss)}
        <div class="wbmeta"><span>Map: <b>${esc(p.map.name)}</b></span><span>HP <b>${p.boss.hp.toLocaleString()}</b></span><span>Start <b>${money(p.boss.cash)}</b> · <b>${p.boss.lives.toLocaleString()}</b> lives</span></div>
        <div class="row left">${open ? '<button class="btn primary big" data-act="wbfight">Fight · ' + (mode === 'elite' ? 'Elite' : 'Normal') + '</button>' : '<button class="btn big" disabled>' + (wbNextStart().elite ? 'Elite' : 'Normal') + ' opens ' + esc(wbOpensTxt()) + '</button>'}</div></div></div>
      ${champPrizeStrip()}
      <div class="wbfoot muted small">Normal on Thursday, Elite on Friday, 7:30 AM to 5:00 PM (PH time) · ${WB_TIERS.length} tiers, the boss must not reach the END · the Champion (Elite #1) is announced on Friday at 5:01 PM and unlocks 10 exclusive Champion borders and card backgrounds for 7 days${champ ? ' · Champion: <b>' + esc(champ.id.name) + '</b>' : ''}</div></div>
    <div class="mtable wbboard"><div class="mthead"><h3><img src="assets/ui/trophy.svg" alt="">World Boss · ${today ? 'Top 5 today' : bk === k ? 'This week' : 'Last event'}</h3>
      <span class="wbtabs"><button class="wbtab${elite ? ' on' : ''}" data-act="wbtab" data-tab="elite">Elite</button><button class="wbtab${elite ? '' : ' on'}" data-act="wbtab" data-tab="normal">Normal</button></span></div>
    <div class="wbrows"><table><thead><tr><th></th><th class="l">Top 5 players</th><th>Result</th><th>Time</th><th>Lives</th><th>Dmg</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" class="empty muted small">' + (today ? 'Nobody has fought the boss yet today. Be the first!' : 'No ' + (elite ? 'Elite' : 'Normal') + ' results yet. ' + (elite ? 'Elite is on Friday' : 'Normal is on Thursday') + ' from 7:30 AM (PH time).') + '</td></tr>'}</tbody></table></div>
    <div class="tbsub">${mine ? `You: <b>#${mine.rank}</b> of ${board.length} · best ${wbResult(mine)}` : today ? 'Fight the boss to rank' : 'Only the Champion wears the Champion borders'} · wins first, then fastest, then most lives, then damage</div></div>`;
}
$('wbBox').addEventListener('click', (e) => {
    const t = e.target, a = t.closest('[data-act]'), r = t.closest('[data-player]');
    if (a && a.dataset.act === 'wbfight')
        startWorldBoss();
    else if (a && a.dataset.act === 'wbtab') {
        UI.wbTab = a.dataset.tab;
        renderWorldBoss();
    }
    else if (a && a.dataset.act === 'champprize')
        openChampPrize();
    else if (r)
        openProfileCard(r.dataset.player);
});
/** When the next fight opens, in this PC's time: "Fri 7:30 AM". */
function wbOpensTxt() { return new Date(wbNextStart().at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }); }
function wbTimerHTML() {
    const m = wbOpenMode(), n = wbNextStart();
    return m ? (m === 'elite' ? 'Elite' : 'Normal') + ' ends in <b>' + wbLeft(wbOpenEnd()) + '</b>' : (n.elite ? 'Elite' : 'Normal') + ' opens in <b>' + wbLeft(n.at) + '</b>';
}
/* Every second, on every screen: the banner's clock, and when the fight opens, closes or its champion is announced
   (5:01 PM): the notifications, the Legend border, the boards and the champion greeting. */
setInterval(() => {
    const t = $('wbTimer');
    if (t && $('menu').classList.contains('on'))
        t.innerHTML = wbTimerHTML();
    if ($('wbNewsTimer'))
        $('wbNewsTimer').innerHTML = wbNewsTimerHTML();
    const st = wbWeek() + '|' + wbOpenMode() + '|' + wbChampWeek();
    if (UI.wbState !== undefined && UI.wbState !== st) {
        refreshWbChamp();
        checkWbNotes();
        if ($('menu').classList.contains('on'))
            renderBoards();
    }
    UI.wbState = st;
    checkWbChampModal();
}, 1000);
/** The champion greeting: once per event for each player on this PC, over whatever is on screen. A game pauses. */
function checkWbChampModal() {
    if (!loggedIn() || UI.modal === 'wbchamp' || UI.modal === 'wbnews' || UI.modal === 'restore')
        return;
    const players = allPlayers(), c = wbChamp(players);
    if (!c || store.get('wbChampSeen', -1) >= c.k)
        return;
    refreshWbChamp(players);
    if (inGame() && !game.over)
        UI.paused = true;
    const card = $('modalCard');
    UI.wbPrevModal = UI.modal ? { name: UI.modal, html: card.innerHTML, cls: card.className.replace(/^card ?/, '') } : null;
    UI.wbChampK = c.k;
    openModal('wbchamp', wbChampHTML(c, players), 'wbchampcard');
    Sound.play('milestone');
}
/** The greeting card: the champion's avatar in the Legend border, their name, the boss and their damage, silver and bronze. */
function wbChampHTML(c, players) {
    const me = c.p.me, name = esc(c.p.id.name), board = wbBoard(c.k, players, c.elite), map = wbPick(c.k).map;
    const others = board.slice(1, 3).map(x => `<span>${rankBadge(x.rank, 18)} ${pName(x.p.id.uid, x.p.id.name)} · ${wbResult(x)}</span>`).join('');
    return `<div class="confetti">${Array.from({ length: 24 }, (_, i) => `<i style="--i:${i};--c:${['#ffd93d', '#ce93d8', '#4fc3f7', '#ff6b6b', '#ffffff'][i % 5]}"></i>`).join('')}</div>
    <div class="wbchamp">
      <div class="wbtag">WORLD BOSS CHAMPION · ${c.elite ? 'ELITE' : 'NORMAL'}</div>
      <div class="wbc-av">${avatarSVG(avatarOf(c.p.id), 168)}</div>
      <h2>${me ? 'Congratulations, <span class="champname">you</span> are the World Boss Champion!' : 'Congratulations, ' + pName(c.p.id.uid, c.p.id.name) + '!'}</h2>
      <p class="lead">${me ? 'You' : name} ${c.h && c.h.won ? 'popped all ' + WB_TIERS.length + ' tiers of' : 'dealt the most damage to'} <b>${esc(c.boss.name)}</b>${c.h && c.h.won ? ' the fastest' : ''} on ${esc(map.name)}.</p>
      <div class="wbc-dmg"><b>${c.h && c.h.won ? fmtClock(+c.h.t || 0) : c.d.toLocaleString()}</b><span>${c.h && c.h.won ? 'time · ' + (+c.h.lives || 0).toLocaleString() + ' lives left' : 'damage'}</span></div>
      <div class="wbc-border">${me ? 'You unlocked' : name + ' unlocked'} <b>10 exclusive Champion borders</b> and <b>10 card backgrounds</b> for 7 days, until the next champion is announced. ${me ? 'Pick yours any time in <b>Edit profile</b>: the border shows on your avatar everywhere, the background on your player and profile cards.' : 'Only the Champion can wear them.'}</div>
      ${others ? `<div class="wbc-others">${others}</div>` : ''}
      <div class="row">${me ? '<button class="btn primary big" data-act="champpick">Choose my border and background</button><button class="btn big" data-act="champok">Later</button>' : '<button class="btn primary big" data-act="champok">Congratulations!</button>'}</div>
    </div>`;
}
/** Closes the greeting: back to what was on screen, or the pause menu when a game was running. */
function closeWbChamp() {
    store.set('wbChampSeen', UI.wbChampK);
    const prev = UI.wbPrevModal;
    UI.wbPrevModal = null;
    if (prev)
        openModal(prev.name, prev.html, prev.cls);
    else if (inGame() && !game.over)
        openPause();
    else
        closeModal();
}
/** The big countdown in the World Boss news: "Ends in" / "Opens in" and the time left. */
function wbNewsTimerHTML() {
    const m = wbOpenMode(), n = wbNextStart();
    return `<span>${m ? (m === 'elite' ? 'Elite' : 'Normal') + ' ends in' : (n.elite ? 'Elite' : 'Normal') + ' opens in'}</span><b>${wbLeft(m ? wbOpenEnd() : n.at)}</b>`;
}
/** 5.1: the World Boss news, every time you log in: one big banner with this week's boss, its stats, the countdown,
    how today is going and the reigning champion. */
function openWbNews() {
    if (!loggedIn())
        return;
    const k = wbWeek(), p = wbPick(k), mode = wbOpenMode(), open = !!mode, players = allPlayers(), c = wbChamp(players);
    const board = open ? wbBoard(k, players, mode === 'elite') : [], mine = board.find(x => x.p.me), col = BT[p.boss.id].col;
    UI.wbNewsOpen = true;
    const stat = (label, val) => `<div class="wbn-stat"><span>${label}</span><b>${val}</b></div>`;
    const today = !open ? '' : mine ? `You are <b>#${mine.rank}</b> today with <b>${wbResult(mine)}</b>. Beat it!`
        : board.length ? `<b>${board.length}</b> player${board.length > 1 ? 's have' : ' has'} fought it today · leader <b>${pName(board[0].p.id.uid, board[0].p.id.name)}</b> ${wbResult(board[0])}`
            : 'Nobody has fought it yet today. <b>Be the first!</b>';
    openModal('wbnews', `<div class="wbn" style="--wbc:${col}">
      <button class="iconbtn x wbn-x" data-act="wbnews-close" title="Close"><img src="assets/ui/close.svg" alt="Close"></button>
      <div class="wbn-rays"></div>
      <div class="wbn-top"><span class="wbn-tag">${open ? '<i class="wbn-live"></i>LIVE NOW · ' + (mode === 'elite' ? 'ELITE' : 'NORMAL') : 'THIS WEEK'}</span><span class="wbn-kicker">World Boss Event</span></div>
      <div class="wbn-hero">
        <div class="wbn-art"><div class="wbn-glow"></div>${wbImg(p.boss.id, 'wbn-boss')}</div>
        <div class="wbn-info">
          <h2 class="wbn-name">${esc(p.boss.name)}</h2>
          <div class="wbn-build">${esc(p.boss.build)}</div>
          <div class="wbn-where">on <b>${esc(p.map.name)}</b></div>
          <div class="wbn-timer" id="wbNewsTimer">${wbNewsTimerHTML()}</div>
          <div class="wbn-when">${open ? 'Open until 5:00 PM today (PH time)' : 'Normal Thu · Elite Fri · 7:30 AM – 5:00 PM (PH time) · next ' + esc(wbOpensTxt()) + ' your time'}</div>
        </div>
      </div>
      <div class="wbn-stats">${stat('Tiers', String(WB_TIERS.length))}${stat('HP', wbTierStats(1, false, p.boss).hp.toLocaleString() + '–' + p.boss.hp.toLocaleString())}${stat('Boss rounds', WB_TIERS_TXT())}${stat('Skull skill', esc((WB_SKILLS[p.boss.skill] || '').split(':')[0]))}${stat('Speed', esc(p.boss.speed))}${stat('Defense', esc(p.boss.defTxt.replace(/ \(.*\)/, '')))}${stat('Summons', esc(p.boss.summonTxt))}${stat('Lives', p.boss.lives.toLocaleString())}${stat('Start', money(p.boss.cash))}</div>
      ${today ? `<div class="wbn-today">${today}</div>` : ''}
      ${c ? `<div class="wbn-champ">${avatarSVG(avatarOf(c.p.id), 46)}<div><small>Reigning champion</small><b>${pName(c.p.id.uid, c.p.id.name)}</b><span>${c.h && c.h.won ? 'Beat ' + esc(c.boss.name) + (c.elite ? ' (Elite)' : '') + ' in ' + fmtClock(+c.h.t || 0) : c.d.toLocaleString() + ' damage on ' + esc(c.boss.name)}</span></div></div>` : ''}
      <div class="wbn-actions"><button class="btn" data-act="wbinfo">How it works</button>${open ? '<button class="btn" data-act="wbnews-close">Later</button><button class="btn primary big wbn-fight" data-act="wbnews-fight">⚔ Fight now</button>' : '<button class="btn primary big" data-act="wbnews-close">Got it</button>'}</div>
    </div>`, 'wbncard');
}
function closeWbNews() {
    UI.wbNewsOpen = false;
    closeModal();
    maybeWhatsNew();
}
/** World Boss notifications: a new boss, last week's results and your medal (each only once). */
function checkWbNotes() {
    if (!loggedIn())
        return;
    for (const n of wbNotes(allPlayers()))
        addNote(n);
}
/* ---------- Notifications (the bell) ---------- */
function onNotesChange() {
    const n = unreadNotes(), c = $('bellCount');
    if (c) {
        c.textContent = n ? String(n) : '';
        c.classList.toggle('on', n > 0);
    }
    if (UI.modal === 'notes')
        renderNotesList();
}
function noteIcon(x) {
    if (x.av)
        return avatarSVG(x.av, 36);
    const img = x.kind === 'wb' ? 'assets/balloons/boss.svg' : x.kind === 'medal' ? 'assets/ui/medal-gold.svg' : x.kind === 'crown' || x.kind === 'trophy' ? 'assets/ui/trophy.svg' : 'assets/ui/chart.svg';
    return `<img class="nicon" src="${img}" alt="">`;
}
/** 5.1: notifications about a win, a medal, a top 3 place, the crown or a World Boss result carry a trophy. */
function noteTrophy(x) {
    const k = x.kind, id = String(x.id || '');
    if (k === 'won' || k === 'medal' || k === 'crown' || k === 'trophy' || k === 'dom' || (k === 'wb' && id.startsWith('wbend-'))) {
        const m = /\b(gold|silver|bronze)\b/i.exec(x.text || ''), col = m ? m[1].toLowerCase() : 'gold';
        return `<img class="ntrophy ${col}" src="assets/ui/trophy.svg" alt="Trophy" title="Trophy">`;
    }
    return '';
}
function renderNotesList() {
    const el = $('notesList'), list = notesList();
    if (!el)
        return;
    el.innerHTML = list.length ? list.map(x => `<div class="nrow${x.read ? '' : ' unread'} k-${esc(x.kind)}">${noteIcon(x)}<div class="grow"><b>${esc(x.text)}</b>${x.sub ? `<span>${esc(x.sub)}</span>` : ''}</div>${noteTrophy(x)}<time>${time12(x.at)}<small>${new Date(x.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></time></div>`).join('')
        : '<p class="muted" style="text-align:center;margin:18px 0">No notifications yet.</p>';
}
function openNotes() {
    openModal('notes', `<div class="cardhead"><h2>Notifications</h2><button class="iconbtn x" data-act="close"><img src="assets/ui/close.svg" alt="Close"></button></div>
    <p class="muted small" style="margin:0 0 8px">Your last ${NOTES_MAX} notifications.</p><div class="nlist" id="notesList"></div>`);
    renderNotesList();
    markNotesRead();
    onNotesChange();
}
$('mBell').addEventListener('click', openNotes);
/* ---------- Chat ---------- */
function chatReadAt() { return +store.get('chatRead', 0) || 0; }
function refreshChatDot() {
    const n = loggedIn() ? Chat.unread(chatReadAt()) : 0;
    $('mChat').classList.toggle('dot', n > 0 && UI.modal !== 'chat');
}
/** Rank in chat (5.1): the Global Top 10 place when the player has one, and always their level. */
function chatBadge(uid, players) {
    const r = globalRankOf(uid, players), pl = players.find(p => p.id.uid === uid);
    return (r ? `<i class="gbadge${r <= 3 ? ' m' + r : ''}" title="Global Top 10: #${r}">#${r}</i>` : '')
        + (pl ? `<i class="lvbadge" title="Level ${levelOf(pl.profile.xp)}">Lv ${levelOf(pl.profile.xp)}</i>` : '');
}
/* Chat, Messenger style (5.1):
   - a centred time line ("11:30 PM · 30m ago") starts the chat and comes back whenever 5 minutes or more pass
   - messages from the same person sent within 2 minutes of each other (and not across a time line) form one run:
     the first shows the avatar beside the name, level, rank and title; the rest line up under it
   - "Sent 30m ago" under your latest message; every bubble shows its exact time when you point at it */
const CHAT_GAP_LINE = 300000, CHAT_GAP_RUN = 120000;
function chatTimeLine(at, now = Date.now()) {
    const d = new Date(at), today = new Date(now), y = new Date(now - 864e5);
    const day = d.toDateString() === today.toDateString() ? '' : d.toDateString() === y.toDateString() ? 'Yesterday ' : d.toLocaleDateString(undefined, { weekday: 'short' }) + ' ';
    const ago = agoShort(at, now);
    return day + time12(at) + (ago ? ' · ' + ago : '');
}
function chatRowHTML(m, players, prev, next, isLast) {
    const myId = getId() || {}, me = m.uid === myId.uid, now = Date.now();
    const line = !prev || m.at - prev.at >= CHAT_GAP_LINE || new Date(prev.at).toDateString() !== new Date(m.at).toDateString();
    const nextLine = !!next && (next.at - m.at >= CHAT_GAP_LINE || new Date(next.at).toDateString() !== new Date(m.at).toDateString());
    const first = line || !(prev.uid === m.uid && m.at - prev.at < CHAT_GAP_RUN);
    const last = !next || nextLine || !(next.uid === m.uid && next.at - m.at < CHAT_GAP_RUN);
    const look = me ? Object.assign({}, m, { animal: myId.animal, style: myId.style, bg: myId.bg, border: myId.border, name: myId.name, title: currentTitle(myId).name }) : m;
    const av = first ? avatarSVG({ uid: m.uid, animal: look.animal, style: look.style, bg: look.bg, border: look.border }, 36) : '<span class="cav"></span>';
    const head = first ? `<div class="chead"><b>${pName(m.uid, look.name)}</b>${me ? '<u>you</u>' : ''}${chatBadge(m.uid, players)}${look.title ? `<span class="ctitle">${esc(look.title)}</span>` : ''}</div>` : '';
    const emojiOnly = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|️|‍|\s)+$/u.test(m.text) && !/[0-9#*]/.test(m.text) && [...m.text.replace(/\s/g, '')].length <= 12;
    const exact = new Date(m.at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    const sent = me && isLast ? `<div class="csent">Sent ${agoShort(m.at, now)}</div>` : '';
    return (line ? `<div class="cline"><span>${esc(chatTimeLine(m.at, now))}</span></div>` : '')
        + `<div class="cmsg${me ? ' mine' : ''}${first ? ' first' : ''}${last ? ' last' : ''}">${av}<div class="cbody">${head}<div class="cbub${emojiOnly ? ' emo' : ''}" title="${esc(exact)}">${esc(m.text)}</div>${sent}</div></div>`;
}
function renderChatList(stick = true) {
    const el = $('chatList');
    if (!el)
        return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40, players = allPlayers();
    refreshCrown(players);
    const n = Chat.msgs.length;
    el.innerHTML = n ? Chat.msgs.map((m, i) => chatRowHTML(m, players, Chat.msgs[i - 1], Chat.msgs[i + 1], i === n - 1)).join('') : '<p class="muted" style="text-align:center;margin:30px 0">No messages in the last 24 hours. Say hi!</p>';
    if (stick || atBottom)
        el.scrollTop = el.scrollHeight;
}
// "30m ago" and "Sent just now" stay current while the chat is open
setInterval(() => {
    if (UI.modal === 'chat')
        renderChatList(false);
}, 30000);
function openChat() {
    if (!loggedIn())
        return openLogin();
    const off = !Share.connected();
    openModal('chat', `<div class="cardhead"><h2>Chat</h2><button class="iconbtn x" data-act="close"><img src="assets/ui/close.svg" alt="Close"></button></div>
    <p class="muted small" style="margin:0 0 8px">Everyone on the shared folder · messages are cleared after 24 hours</p>
    ${off ? `<div class="chatoff"><p>Connect the shared folder in Settings to chat.</p><button class="btn primary" data-act="share-connect">Connect shared folder</button></div>`
        : `<div class="clist" id="chatList"></div>
    <div class="cpick" id="chatPick"></div>
    <div class="cinput"><button class="iconbtn" data-act="chat-emoji" title="Emoji">\u{1F600}</button>
      <input id="chatIn" maxlength="${CHAT_MAX}" autocomplete="off" placeholder="Type a message…"><button class="btn primary" data-act="chat-send">Send</button></div>
    <div class="cfoot"><span class="err" id="chatErr"></span><span class="muted small" id="chatCount">0 / ${CHAT_MAX}</span></div>`}`, 'wide chatcard');
    if (off)
        return;
    store.set('chatRead', Date.now());
    refreshChatDot();
    renderChatList(true);
    const inp = $('chatIn');
    inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendChat({ text: inp.value });
        }
    });
    inp.addEventListener('input', () => { $('chatCount').textContent = inp.value.length + ' / ' + CHAT_MAX; $('chatErr').textContent = ''; });
    setTimeout(() => inp.focus(), 30);
    Chat.poll().then(() => renderChatList(false));
}
function sendChat(body) {
    const btn = document.querySelector('[data-act=chat-send]');
    if (btn)
        btn.disabled = true;
    Chat.send(body).then(why => {
        if (btn)
            btn.disabled = false;
        if (why) {
            if ($('chatErr'))
                $('chatErr').textContent = why;
            return;
        }
        if ($('chatIn')) {
            $('chatIn').value = '';
            $('chatCount').textContent = '0 / ' + CHAT_MAX;
        }
        if ($('chatPick'))
            $('chatPick').innerHTML = '';
        store.set('chatRead', Date.now());
        renderChatList(true);
    });
}
function chatAction(a, b) {
    const pick = $('chatPick');
    if (a === 'chat-send')
        sendChat({ text: $('chatIn').value });
    else if (a === 'chat-emoji') {
        pick.innerHTML = pick.dataset.k === 'e' && pick.innerHTML ? '' : `<div class="emojis">${CHAT_EMOJI.map(e => `<button data-act="chat-addemoji" data-e="${e}">${e}</button>`).join('')}</div>`;
        pick.dataset.k = 'e';
    }
    else if (a === 'chat-addemoji') {
        const inp = $('chatIn'), pos = inp.selectionStart ?? inp.value.length;
        if ((inp.value + b.dataset.e).length > CHAT_MAX)
            return;
        inp.value = inp.value.slice(0, pos) + b.dataset.e + inp.value.slice(pos);
        inp.focus();
        inp.selectionStart = inp.selectionEnd = pos + b.dataset.e.length;
        $('chatCount').textContent = inp.value.length + ' / ' + CHAT_MAX;
    }
    else
        return false;
    return true;
}
$('mChat').addEventListener('click', openChat);
/** New messages from other players: the chat list, the red dot, and (during a game) a pop-up at the top. */
function onChatMessages(list) {
    if (UI.modal === 'chat') {
        store.set('chatRead', Date.now());
        renderChatList(false);
    }
    refreshChatDot();
    const me = (getId() || {}).uid;
    if (inGame() && SETTINGS.chatToasts !== false)
        for (const m of list)
            if (m.uid !== me && m.at >= Chat.started)
                queueChatToast(m);
}
/* In-game chat pop-ups: top centre, 5 seconds each, with an X. Up to 3 at once, newest on top; the rest wait. */
const CHAT_TOAST_MS = 5000, CHAT_TOAST_MAX = 3;
const chatQueue = [];
function queueChatToast(m) { chatQueue.push(m); pumpChatToasts(); }
function pumpChatToasts() {
    const box = $('chatToasts');
    while (chatQueue.length && box.querySelectorAll('.ctoast:not(.out)').length < CHAT_TOAST_MAX) {
        const m = chatQueue.shift(), el = document.createElement('div');
        el.className = 'ctoast';
        el.innerHTML = `${avatarSVG({ uid: m.uid, animal: m.animal, style: m.style, bg: m.bg, border: m.border }, 30)}<div class="grow"><b>${pName(m.uid, m.name)}</b>
          <span>${esc(m.text)}</span></div><button class="x" title="Close" aria-label="Close">×</button>`;
        box.prepend(el);
        let gone = false;
        const bye = () => {
            if (gone)
                return;
            gone = true;
            el.classList.add('out');
            setTimeout(() => { el.remove(); pumpChatToasts(); }, 300);
        };
        el.querySelector('.x').addEventListener('click', bye);
        setTimeout(bye, CHAT_TOAST_MS);
    }
}
// the chat folder is checked every 5 seconds, on the home page and during games
setInterval(() => {
    if (Share.connected() && loggedIn())
        Chat.poll();
}, 5000);
/* ---------- Find my profile: in 5.1 logging in does this (a profile from another PC moves here) ---------- */
function openFindProfile() { openLogin(); }
/* ---------- Game history (5.1) ---------- */
function historyWhat(h) {
    if (h.wb) {
        const b = WB_BOSSES.find(x => x.id === h.wb), m = WB_MAPS.find(x => x.id === h.map);
        return 'World Boss' + (h.wbElite ? ' (Elite)' : '') + ' · ' + (b ? b.name : h.wb) + (m ? ' · ' + m.name : '');
    }
    const m = MAPS.find(x => x.id === h.map), d = DIFF[h.diff];
    return (h.daily ? 'Daily · ' : '') + (m ? m.name : h.map) + ' · ' + (d ? d.name : h.diff) + (h.mode && h.mode !== 'standard' && MODES[h.mode] ? ' · ' + MODES[h.mode].name : '');
}
function openHistory(key = ACTIVE_KEY) {
    const pl = allPlayers().find(x => x.key === key);
    if (!pl)
        return;
    const list = (pl.history || []).slice().sort((a, b) => (+b.at || 0) - (+a.at || 0));
    const wins = list.filter(h => h.won).length;
    const rows = list.map(h => {
        const res = h.wb ? `<b>${(+h.score || 0).toLocaleString()}</b> damage` : h.won ? '<b class="okc">Won</b>' : '<b class="badc">Lost</b>';
        const trophy = h.won || (h.rank && h.rank <= 3) ? `<img class="ntrophy${h.rank && h.rank <= 3 ? ' ' + MEDALS[h.rank - 1] : ''}" src="assets/ui/trophy.svg" alt="Trophy" title="${h.rank && h.rank <= 3 ? MEDALS[h.rank - 1] + ' on the stage board' : 'Won'}">` : '';
        const stats = h.wb ? `${fmtClock(h.wbTime || 0)} · ${h.lives.toLocaleString()} lives left` : `Round ${h.round} · ${h.lives} lives · ${(+h.pops || 0).toLocaleString()} pops · ${fmtClock(h.clock || 0)}`;
        return `<tr class="${h.won ? 'won' : 'lost'}"><td class="l"><b>${esc(historyWhat(h))}</b><small class="muted">${stats}</small></td><td class="n">${res}${h.rank ? ` <small class="muted">#${h.rank}</small>` : ''}</td><td class="n">${trophy}</td>
          <td class="n when">${time12(h.at)}<small>${new Date(h.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></td></tr>`;
    }).join('');
    openModal('history', `<div class="cardhead"><h2>Game history <small class="muted">· ${esc(pl.id.name)}</small></h2><button class="iconbtn x" data-act="close"><img src="assets/ui/close.svg" alt="Close"></button></div>
    <p class="muted small" style="margin:0 0 8px">The last ${HISTORY_MAX} finished games${list.length ? ` · ${wins} won of ${list.length}` : ''}.</p>
    ${list.length ? `<div class="histwrap"><table class="histtable"><thead><tr><th class="l">Game</th><th>Result</th><th></th><th>When</th></tr></thead><tbody>${rows}</tbody></table></div>`
        : '<p class="muted" style="text-align:center;margin:18px 0">No finished games yet. Games played from 5.1 on show here.</p>'}
    <div class="row"><button class="btn" data-act="player" data-player="${esc(key)}">Back to profile</button></div>`, 'wide');
}
/* ---------- Master control (5.1): reset a password, delete an account, restore a deleted account ----------
   Protected by a master password, set the first time Master control is opened. It is kept (as a salted hash) in the
   shared folder, so every PC uses the same one. Forgot it? Delete balloon-defense-admin/admin.json in the shared folder. */
function openMaster() {
    if (UI.masterOk)
        return renderMaster();
    const set = masterSet();
    openModal('master', `<div class="cardhead"><h2>Master control</h2><button class="iconbtn x" data-act="${loggedIn() ? 'close' : 'signin'}"><img src="assets/ui/close.svg" alt="Close"></button></div>
    ${Share.connected() ? '' : '<div class="warnline">The shared folder isn\'t connected: only this PC\'s profiles can be changed, and a new master password is only kept on this PC.</div>'}
    <form onsubmit="return false" autocomplete="off">
    ${set ? '<p class="lead">Type the master password.</p><label class="lbl" for="mpIn">Master password</label><input id="mpIn" type="password" maxlength="40" style="width:100%" autocomplete="off">'
        : `<p class="lead">No master password yet. Set one now: whoever knows it can reset passwords and delete or restore accounts on every PC.</p>
      <div class="pwpair"><div><label class="lbl" for="mpIn">New master password</label><input id="mpIn" type="password" maxlength="40" autocomplete="new-password" placeholder="At least 4 characters"></div>
      <div><label class="lbl" for="mp2In">Type it again</label><input id="mp2In" type="password" maxlength="40" autocomplete="new-password"></div></div>`}
    </form><div class="err" id="mpErr"></div>
    <div class="row"><button class="btn" data-act="${loggedIn() ? 'close' : 'signin'}">${loggedIn() ? 'Cancel' : 'Back'}</button><button class="btn primary" data-act="master-unlock">${set ? 'Open' : 'Set master password'}</button></div>`);
    const go = (e) => {
        if (e.key === 'Enter')
            masterAction('master-unlock', null);
    };
    $('mpIn').addEventListener('keydown', go);
    if ($('mp2In'))
        $('mp2In').addEventListener('keydown', go);
    setTimeout(() => $('mpIn') && $('mpIn').focus(), 30);
    // pick up a master password set on another PC before deciding
    if (!set && Share.connected())
        Share.readAdmin().then(() => {
            if (masterSet() && UI.modal === 'master' && !UI.masterOk)
                openMaster();
        });
}
/** Every account master control can act on: live ones (this PC and the shared folder) and deleted ones. */
function masterAccounts() {
    const out = new Map();
    for (const pl of allPlayers())
        out.set(pl.id.uid, { uid: pl.id.uid, id: pl.id, deleted: false, here: !pl.remote, online: isOnline(pl), pw: hasPassword(bestId(pl.id.uid) || pl.id) });
    for (const o of sharedCache().players)
        if (o && o.deleted && !out.has(o.uid))
            out.set(o.uid, { uid: o.uid, id: o.look ? Object.assign({ uid: o.uid }, o.look) : { uid: o.uid, name: '(deleted profile)', tag: '' }, deleted: true, at: o.at, by: o.by });
    return [...out.values()].sort((a, b) => (+a.deleted - +b.deleted) || String(a.id.name).localeCompare(b.id.name));
}
function renderMaster(msg) {
    const list = masterAccounts();
    const row = (a) => `<tr class="${a.deleted ? 'gone' : ''}"><td class="who"><div class="wc">${avatarSVG(Object.assign({}, a.id, { uid: a.uid }), 30)}<span><b>${esc(a.id.name)}${a.id.tag ? '<em>#' + esc(a.id.tag) + '</em>' : ''}</b>
      <small>${a.deleted ? 'Deleted' + (a.at ? ' ' + agoShort(a.at) : '') : (a.online ? 'Online' : 'Offline') + ' · ' + (a.pw ? 'has a password' : 'no password')}</small></span></div></td>
      <td class="acts">${a.deleted ? `<button class="btn small primary" data-act="master-restore" data-uid="${esc(a.uid)}">Restore account</button>`
        : `<button class="btn small" data-act="master-reset" data-uid="${esc(a.uid)}" ${a.pw ? '' : 'disabled title="No password to reset"'}>Reset password</button><button class="btn small danger" data-act="master-delete" data-uid="${esc(a.uid)}">Delete account</button>`}</td></tr>`;
    openModal('master', `<div class="cardhead"><h2>Master control</h2><button class="iconbtn x" data-act="master-close"><img src="assets/ui/close.svg" alt="Close"></button></div>
    <p class="muted small" style="margin:0 0 8px"><b>Reset password</b>: the player makes a new password at their next log-in. <b>Delete account</b>: removed from every PC (its backups stay, so it can be restored). <b>Restore account</b>: brought back from its backups, with its password.</p>
    ${msg ? `<div class="mmsg">${esc(msg)}</div>` : ''}
    <div class="histwrap mtable"><table class="mastertable"><tbody>${list.map(row).join('') || '<tr><td class="muted">No accounts yet.</td></tr>'}</tbody></table></div>
    <div class="row" style="justify-content:space-between"><span><button class="btn" data-act="master-changepw">Change master password</button> <button class="btn" data-act="master-wb">⚔ World Boss setup</button> <button class="btn" data-act="master-tw">🗼 Tower setup</button></span><button class="btn primary" data-act="master-close">Done</button></div>`, 'wide');
}
/** 5.1.1: World Boss setup in master control: each boss's name, HP, defense, start money, lives and summon size.
    Saved with the master control data, so every PC on the shared folder uses it. Runs already going keep their build. */
function renderMasterWb(msg, err) {
    const cur = wbPick(wbWeek()).boss.id, num = (id, f, v, min, max, step = 1) => `<input type="number" data-boss="${id}" data-f="${f}" value="${v}" min="${min}" max="${max}" step="${step}">`;
    const row = (b) => {
        const d = WB_DEFAULTS.find(x => x.id === b.id), changed = ['name', 'hp', 'def', 'cash', 'lives', 'count', 'swarm', 'str', 'gold', 'aura'].some(k => b[k] !== d[k]);
        return `<tr${b.id === cur ? ' class="now"' : ''}><td>${wbImg(b.id, 'wbart sm')}</td>
        <td class="l"><input type="text" data-boss="${b.id}" data-f="name" value="${esc(b.name)}" maxlength="20" placeholder="${esc(d.name)}"><small class="muted">${b.id === cur ? '<b class="okc">This week</b> · ' : ''}${esc(d.speed)} · default ${esc(d.name)}${changed ? ' · <b>changed</b>' : ''}</small></td>
        <td>${num(b.id, 'hp', b.hp, WB_LIMITS.hp[0], WB_LIMITS.hp[1], 1000)}</td>
        <td>${num(b.id, 'def', Math.round(b.def * 100), WB_LIMITS.def[0] * 100, WB_LIMITS.def[1] * 100, 5)}</td>
        <td>${num(b.id, 'cash', b.cash, WB_LIMITS.cash[0], WB_LIMITS.cash[1], 500)}</td>
        <td>${num(b.id, 'lives', b.lives, WB_LIMITS.lives[0], WB_LIMITS.lives[1], 100)}</td>
        <td>${num(b.id, 'count', b.count, WB_LIMITS.count[0], WB_LIMITS.count[1])}</td>
${WB_MODS.map(m => '        <td>' + num(b.id, m.k, b[m.k] || 0, WB_LIMITS[m.k][0], WB_LIMITS[m.k][1], 5) + '</td>').join('')}
        <td><button class="btn small" data-act="master-wbdef" data-boss="${b.id}" title="Put this boss back to its default build">Default</button></td></tr>`;
    };
    const cfg = adminData().wb;
    openModal('master', `<div class="cardhead"><h2>World Boss setup</h2><button class="iconbtn x" data-act="master-back"><img src="assets/ui/close.svg" alt="Close"></button></div>
    <p class="muted small" style="margin:0 0 8px"><b>Damage taken</b>: 100% is normal defense, 60% takes 40% less damage, 150% takes 50% more. <b>Summon</b>: balloons per summon. <b>Swarm</b>: more or fewer balloons per summon. <b>Strength</b>: summoned balloons' health. <b>Gold gain</b>: cash from pops and rounds. <b>Aura DEF</b>: balloons near the boss take this much less damage. 0 = off.
      Changes reach every PC on the shared folder; runs already going keep the build they started with.${cfg ? ' Last saved ' + agoShort(cfg.at) + '.' : ''}</p>
    ${Share.connected() ? '' : '<div class="warnline">The shared folder isn\'t connected: this setup is only kept on this PC.</div>'}
    ${msg ? `<div class="mmsg">${esc(msg)}</div>` : ''}<div class="err" id="wbErr">${err ? esc(err) : ''}</div>
    <div class="histwrap"><table class="wbtable wbsetup"><thead><tr><th></th><th class="l">Name</th><th>HP</th><th>Damage taken %</th><th>Start money</th><th>Lives</th><th>Summon</th><th>Swarm %</th><th>Strength %</th><th>Gold gain %</th><th>Aura DEF %</th><th></th></tr></thead>
    <tbody>${WB_BOSSES.map(row).join('')}</tbody></table></div>
    <div class="row" style="justify-content:space-between"><button class="btn danger" data-act="master-wbreset">Reset all to default</button>
      <span><button class="btn" data-act="master-back">Back</button> <button class="btn primary" data-act="master-wbsave">Save</button></span></div>`, 'wide');
}
/** The setup form as a config ({ at, bosses }), or an error message. `only` puts one boss back to its defaults. */
function readMasterWb(only) {
    const bosses = {};
    for (const d of WB_DEFAULTS) {
        if (only === d.id)
            continue;
        const x = {}, get = (f) => { const el = document.querySelector(`#modal [data-boss="${d.id}"][data-f="${f}"]`); return el ? el.value : ''; };
        x.name = String(get('name')).replace(/\s+/g, ' ').trim();
        if (!x.name)
            return d.name + ': type a name';
        for (const f of ['hp', 'def', 'cash', 'lives', 'count', 'swarm', 'str', 'gold', 'aura']) {
            const raw = String(get(f)).trim(), v = +raw, [lo, hi] = WB_LIMITS[f].map(n => f === 'def' ? n * 100 : n);
            if (raw === '' || !isFinite(v) || v < lo || v > hi)
                return x.name + ': ' + { hp: 'HP', def: 'damage taken', cash: 'start money', lives: 'lives', count: 'summon size', swarm: 'swarm', str: 'strength', gold: 'gold gain', aura: 'aura DEF' }[f] + ' must be ' + lo.toLocaleString() + ' to ' + hi.toLocaleString() + (['swarm', 'str', 'gold', 'aura'].includes(f) ? '%' : '');
            x[f] = f === 'def' ? v / 100 : v;
        }
        bosses[d.id] = x;
    }
    return { at: Date.now(), bosses };
}
/** Which tower setup fields mean something for a tower: a stat it has at some level (cost and upgrade cost always). */
function twFieldsOf(type) {
    const has = { cost: true, up: true }, lvls = [[0, 0, 0], [5, 0, 0], [0, 5, 0], [0, 0, 5], [5, 5, 0], [0, 5, 5], [5, 0, 5]];
    for (const lv of lvls) {
        const s = statsFor(type, lv, null);
        if (s.dmg)
            has['dmg'] = true;
        if (s.rate)
            has['rate'] = true;
        if ((s.range && s.range < 2000) || s.aura)
            has['range'] = true;
        if (s.pierce)
            has['pierce'] = true;
        if (s.income > 0)
            has['income'] = true;
    }
    return has;
}
/** 5.2.1: Tower setup in master control: buff or nerf any tower, in percent of normal (100% = as shipped). Saved with
    the master control data, so every PC on the shared folder plays the same towers. Games in progress pick it up too. */
/** Green for a buff, red for a nerf (for costs, higher is a nerf). */
function twClass(k, v) { const d = (v - 100) * (k === 'cost' || k === 'up' ? -1 : 1); return d > 0 ? 'twup' : d < 0 ? 'twdown' : ''; }
function renderMasterTw(msg, err) {
    const row = (type) => {
        const d = TD[type], has = twFieldsOf(type), cur = TW_CFG[type] || {}, changed = Object.keys(cur).length > 0;
        return `<tr${changed ? ' class="now"' : ''}><td class="l"><b>${esc(d.name)}</b><small class="muted">${changed ? '<b class="okc">changed</b> · ' : ''}$${d.cost.toLocaleString()} normally</small></td>`
            + TW_FIELDS.map(fd => `<td>${has[fd.k] ? `<input type="number" data-tw="${type}" data-f="${fd.k}" value="${cur[fd.k] || 100}" min="${fd.lo}" max="${fd.hi}" step="5" class="${twClass(fd.k, cur[fd.k] || 100)}">` : '<span class="muted">—</span>'}</td>`).join('')
            + `<td><button class="btn small" data-act="master-twdef" data-tw="${type}" title="Put this tower back to normal">Default</button></td></tr>`;
    };
    const cfg = adminData().tw;
    openModal('master', `<div class="cardhead"><h2>Tower setup</h2><button class="iconbtn x" data-act="master-back"><img src="assets/ui/close.svg" alt="Close"></button></div>
    <p class="muted small" style="margin:0 0 8px"><b>100%</b> is normal. Above 100% buffs (more damage, faster attacks, more range, pierce or income), below nerfs.
      For <b>Place cost</b> and <b>Upgrade cost</b>, above 100% makes the tower more expensive. Every PC on the shared folder gets these; games in progress pick them up too.${cfg ? ' Last saved ' + agoShort(cfg.at) + '.' : ''}</p>
    ${Share.connected() ? '' : '<div class="warnline">The shared folder isn\'t connected: this setup is only kept on this PC.</div>'}
    ${msg ? `<div class="mmsg">${esc(msg)}</div>` : ''}<div class="err" id="twErr">${err ? esc(err) : ''}</div>
    <div class="histwrap"><table class="wbtable wbsetup twsetup"><thead><tr><th class="l">Tower</th>${TW_FIELDS.map(fd => `<th>${fd.name} %</th>`).join('')}<th></th></tr></thead>
    <tbody>${SHOP.map(row).join('')}</tbody></table></div>
    <div class="row" style="justify-content:space-between"><button class="btn danger" data-act="master-twreset">Reset all to normal</button>
      <span><button class="btn" data-act="master-back">Back</button> <button class="btn primary" data-act="master-twsave">Save</button></span></div>`, 'wide');
    document.querySelectorAll('#modal input[data-tw]').forEach((el) => el.addEventListener('input', () => { el.className = twClass(el.dataset.f, +el.value || 100); }));
}
/** The tower setup form as a config ({ at, towers }), or an error message. `only` puts one tower back to normal. */
function readMasterTw(only) {
    const towers = {};
    for (const type of SHOP) {
        if (only === type)
            continue;
        const x = {};
        for (const fd of TW_FIELDS) {
            const el = document.querySelector(`#modal [data-tw="${type}"][data-f="${fd.k}"]`);
            if (!el)
                continue;
            const raw = String(el.value).trim(), v = +raw;
            if (raw === '' || !isFinite(v) || v < fd.lo || v > fd.hi)
                return TD[type].name + ': ' + fd.name.toLowerCase() + ' must be ' + fd.lo + '% to ' + fd.hi + '%';
            x[fd.k] = v;
        }
        towers[type] = x;
    }
    return { at: Date.now(), towers };
}
function masterAction(a, b) {
    if (a === 'master')
        return openMaster();
    if (a === 'master-unlock') {
        const pw = $('mpIn').value;
        if (masterSet() && !UI.masterChange) {
            if (!checkMaster(pw)) {
                $('mpErr').textContent = 'Wrong master password';
                return;
            }
            UI.masterOk = true;
            return renderMaster();
        }
        const why = pwProblem(pw, $('mp2In') ? $('mp2In').value : pw);
        if (why) {
            $('mpErr').textContent = why;
            return;
        }
        UI.masterChange = false;
        UI.masterOk = true;
        Share.saveAdmin({ master: makePw(pw), resets: {} }).then(() => renderMaster('Master password saved.'));
        return;
    }
    if (!UI.masterOk)
        return openMaster();
    const uid = b && b.dataset.uid, acc = uid ? masterAccounts().find(x => x.uid === uid) : null;
    if (a === 'master-close') {
        UI.masterOk = false;
        if (loggedIn())
            closeModal();
        else
            openLogin();
    }
    else if (a === 'master-changepw') {
        UI.masterChange = true;
        openModal('master', `<div class="cardhead"><h2>Change master password</h2></div><form onsubmit="return false" autocomplete="off">
        <div class="pwpair"><div><label class="lbl" for="mpIn">New master password</label><input id="mpIn" type="password" maxlength="40" autocomplete="new-password"></div>
        <div><label class="lbl" for="mp2In">Type it again</label><input id="mp2In" type="password" maxlength="40" autocomplete="new-password"></div></div></form><div class="err" id="mpErr"></div>
        <div class="row"><button class="btn" data-act="master-back">Cancel</button><button class="btn primary" data-act="master-unlock">Save</button></div>`);
    }
    else if (a === 'master-back') {
        UI.masterChange = false;
        renderMaster();
    }
    else if (a === 'master-wb')
        renderMasterWb();
    else if (a === 'master-tw')
        renderMasterTw();
    else if (a === 'master-twsave' || a === 'master-twdef' || a === 'master-twreset') {
        if (a === 'master-twreset' && !b.dataset.armed) {
            b.dataset.armed = '1';
            b.textContent = 'Click again to reset every tower';
            return;
        }
        const one = a === 'master-twdef' ? b.dataset.tw : '';
        const cfg = a === 'master-twreset' ? { at: Date.now(), towers: {} } : readMasterTw(one);
        if (typeof cfg === 'string') {
            $('twErr').textContent = cfg;
            return;
        }
        Share.saveAdmin({ master: null, resets: {}, tw: cfg }).then(() => {
            if (game && game.towers)
                recalcAll();
            renderMasterTw(a === 'master-twreset' ? 'Every tower is back to normal.'
                : one ? TD[one].name + ' is back to normal.' : 'Tower setup saved' + (Share.connected() ? ' for every PC.' : ' on this PC.'));
        });
    }
    else if (a === 'master-wbsave' || a === 'master-wbdef' || a === 'master-wbreset') {
        if (a === 'master-wbreset' && !b.dataset.armed) {
            b.dataset.armed = '1';
            b.textContent = 'Click again to reset all four';
            return;
        }
        const one = a === 'master-wbdef' ? b.dataset.boss : '';
        const cfg = a === 'master-wbreset' ? { at: Date.now(), bosses: {} } : readMasterWb(one);
        if (typeof cfg === 'string') {
            $('wbErr').textContent = cfg;
            return;
        }
        Share.saveAdmin({ master: null, resets: {}, wb: cfg }).then(() => {
            renderMasterWb(a === 'master-wbreset' ? 'All four bosses are back to their default builds.'
                : one ? WB_BOSSES.find(x => x.id === one).name + ' is back to its default build.' : 'World Boss setup saved' + (Share.connected() ? ' for every PC.' : ' on this PC.'));
            if ($('menu').classList.contains('on'))
                renderBoards();
        });
    }
    else if (a === 'master-reset' && acc) {
        if (!b.dataset.armed) {
            b.dataset.armed = '1';
            b.textContent = 'Click again to reset';
            return;
        }
        Share.saveAdmin({ master: null, resets: { [uid]: Date.now() } }).then(() => { Share.syncSoon(); renderMaster('Password of ' + acc.id.name + ' reset. They make a new one at their next log-in.'); });
    }
    else if (a === 'master-delete' && acc) {
        if (!b.dataset.armed) {
            b.dataset.armed = '1';
            b.textContent = 'Click again: delete ' + acc.id.name + ' everywhere';
            return;
        }
        b.disabled = true;
        const look = acc.id, wasMe = (getId() || {}).uid === uid;
        // a last backup first, so the account can be restored with everything it had
        const copy = localPlayers().find(p => p.id.uid === uid);
        (copy ? Share.autoBackup(readSlot(copy.key)) : Promise.resolve(false)).catch(() => false).then(() => {
            const r = dropProfileHere(uid);
            return Share.tombstone(uid, look, 'admin').then(ok => ({ ok, r }));
        }).then(({ ok, r }) => {
            if (!ok && !r.removed) {
                renderMaster('Couldn\'t delete ' + look.name + ': connect the shared folder first.');
                return;
            }
            if (wasMe || r.wasActive) {
                setSession('');
                showNote(look.name + ' was deleted.', 'lost');
                setTimeout(() => location.reload(), 1200);
                return;
            }
            renderMaster(look.name + ' was deleted' + (ok ? ' on every PC.' : ' from this PC (connect the shared folder to delete it everywhere).'));
            buildMenu();
        });
    }
    else if (a === 'master-restore' && acc) {
        b.disabled = true;
        b.textContent = 'Restoring…';
        Share.restoreAccount(uid).then(why => {
            renderMaster(why ? 'Couldn\'t restore: ' + why + '.' : acc.id.name + ' is back. They can log in on any PC.');
            if (!why)
                buildMenu();
        });
    }
    return true;
}
/* ---------- Protection bar: progress is only in this browser (PP-8) ---------- */
function renderProtectBar() {
    const el = $('protectBar'), st = Share.state;
    const show = loggedIn() && (st === 'off' || st === 'paused' || st === 'error');
    el.classList.toggle('on', show);
    if (show)
        el.innerHTML = `<b>Progress is only on this PC.</b><span>Connect the shared folder to protect it.</span>${st === 'paused'
            ? '<button class="btn small primary" data-act="share-resume">Reconnect</button>' : '<button class="btn small primary" data-act="share-connect">Connect shared folder</button>'}`;
}
$('protectBar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b)
        shareAction(b.dataset.act, b);
});
/** Global #1 changed since this PC last looked: a notification (not on the first look). */
function checkCrownNote() {
    if (!loggedIn())
        return;
    const key = 'balloonDefense.lastCrown';
    let last = null;
    try {
        last = localStorage.getItem(key);
    }
    catch (e) { }
    if (last === CROWN_UID)
        return;
    try {
        localStorage.setItem(key, CROWN_UID);
    }
    catch (e) { }
    if (last === null || !CROWN_UID)
        return;
    const pl = allPlayers().find(p => p.id.uid === CROWN_UID);
    if (pl)
        addNote({ id: 'crown-' + CROWN_UID + '-' + todayStr(), kind: 'crown', av: avatarOf(pl.id), text: (pl.me ? 'You are' : pl.id.name + ' is') + ' the new #1 on the Global Top 10!', sub: 'The Global #1 wears the crown.' });
}
/** 5.1.1: someone dominated a map (every difficulty cleared), or took one of my medals. A notification and a pop-up. */
function checkBoardNotes(players = allPlayers()) {
    if (!loggedIn())
        return;
    const dom = dominationNotes(players, store.get('domSeen', null)), lost = medalLostNotes(players, store.get('medalSeen', null));
    for (const [k, v] of [['domSeen', dom.seen], ['medalSeen', lost.seen]])
        if (stableJSON(v) !== stableJSON(store.get(k, null)))
            store.set(k, v); // only when it changed: every save is copied to the shared folder
    if (SETTINGS.notify === false && !dom.notes.some(n => n.me))
        dom.notes = [];
    for (const n of dom.notes.concat(lost.notes))
        if (addNote(n))
            popBoardNote(n);
}
function popBoardNote(n) {
    const good = n.kind === 'dom';
    if (inGame()) {
        toast((good ? '🏆 ' : '') + n.text + ' · ' + n.sub, good ? 'good' : 'bad', 6000);
        return;
    }
    const el = document.createElement('div');
    el.className = 'note ' + (good ? 'won' : 'lost');
    el.innerHTML = `${n.av ? avatarSVG(n.av, 40) : ''}<div class="grow"><b>${esc(n.text)}</b><div class="nstats"><span>${esc(n.sub)}</span></div></div>
      ${good ? '<img class="ntrophy" src="assets/ui/trophy.svg" alt="Trophy">' : ''}<button class="x" title="Dismiss">×</button>`;
    pushNote(el, 9000);
}
/* ---------- Main loop ---------- */
let last = performance.now();
function frame(now) {
    const raw = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (inGame()) {
        if (!UI.paused && !game.over && !UI.modal) {
            for (let i = 0; i < UI.speed; i++) {
                update(raw);
                if (game.over)
                    break;
            }
            PROFILE.seconds += raw;
        }
        render(ctx, UI);
        tickCash();
    }
    requestAnimationFrame(frame);
}
/* ---------- Boot ---------- */
applyScale();
/* 5.0: each profile plays only on its home PC. If the active slot is someone else's profile, switch to this PC's own
   one (or to an empty slot for the first-run screens) before anything is shown. */
if (migrateHome())
    location.reload();
else
    boot();
function boot() {
    // the shared folder is read while the art loads, so a profile with more progress in the folder (or a backup)
    // is merged in before the home page shows (PP-6, PP-10)
    const shareReady = Share.init().then(() => Share.repair()).catch(() => 0);
    const wait = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
    loadAssets(p => { $('loadbar').style.width = Math.round(p * 100) + '%'; }).then(({ failed }) => wait(shareReady, 5000).then(() => failed)).then((failed) => {
        ART_FAILED = failed;
        if (failed)
            console.warn(failed + ' images failed to load; using simple shapes instead.');
        if (Share.reload) { // the folder had more progress for this profile: start again with it
            Share.reload = false;
            location.reload();
            return;
        }
        syncLock(); // logged out: the home page stays hidden behind the sign-in page
        buildMenu();
        show('menu');
        requestAnimationFrame(frame);
        shareReady.then(() => {
            if (loggedIn())
                dailyAutoBackup();
            checkWbNotes();
            buildMenu();
            Chat.poll().then(refreshChatDot);
            if (UI.modal === 'login') // the shared folder is read now: show its players too
                openLogin(UI.loginNote);
        });
        // 5.1: every visit starts with the log-in screen (a reload in the same browser tab stays logged in)
        if (!loggedIn()) {
            const lost = lostProfiles().map(p => esc(p.id.name));
            UI.loginNote = lost.length ? `<b>${lost.join(', ')}</b> ${lost.length > 1 ? 'were' : 'was'} logged in on another PC and moved there. Log in to bring ${lost.length > 1 ? 'one' : 'it'} back to this PC.` : '';
            if (sessionUid() && hasProfile() && sessionUid() !== getId().uid)
                setSession(''); // the tab's log-in belonged to a profile that isn't here any more
            openLogin(UI.loginNote);
        }
        else if (takeJustIn())
            afterLogin(); // logged in, and the page reloaded to load that profile: the World Boss news now
        else
            maybeWhatsNew();
    });
}

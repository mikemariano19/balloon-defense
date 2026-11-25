"use strict";
/* Balloon Defense — World Boss schedule and boards (5.0, two days a week since 5.2). The game rules for a World Boss
   run are in engine.ts. Each week has one boss and map, fought twice, both from 7:30 AM to 5:00 PM Philippine time
   (UTC+8): Normal on Thursday and Elite on Friday. Each day has its own Top 10 board. The champion (gold on the Elite
   board, or on the Normal board if nobody played Elite) is announced on Friday at 5:01 PM and wears the World Boss
   Legend border until the next champion is announced.
   Every PC works out the same boss and map from the week number, so no server is needed.
   No DOM access at load time, so the tests can load this file too. */
const WB_EPOCH = Date.UTC(2026, 0, 2, 9, 0, 0); // Friday 2 Jan 2026, 5:00 PM in the Philippines
const WB_WEEK_MS = 7 * 864e5;
const WB_OPEN_MS = 9.5 * 36e5; // the fight is open for 9.5 hours: 7:30 AM to 5:00 PM
const WB_ANNOUNCE_MS = 60e3; // the champion is announced one minute after the end (5:01 PM)
const WB_FIRST = 45; // the first event on this schedule (Friday 20 Nov 2026); older scores were tests and never count
/** The clock. A function so the tests can move it. */
function wbNow() { return Date.now(); }
/** The event coming up or running at `now` (its number). It ends on Friday at 5:00 PM: wbEndsAt(k). */
function wbWeek(now = wbNow()) { return Math.floor((now - WB_EPOCH) / WB_WEEK_MS); }
/** Friday (Elite) 5:00 PM and 7:30 AM. */
function wbEndsAt(k) { return WB_EPOCH + (k + 1) * WB_WEEK_MS; }
function wbStartsAt(k) { return wbEndsAt(k) - WB_OPEN_MS; }
/** One day of event k: Thursday (Normal) or Friday (Elite). */
function wbDayEnd(k, elite) { return wbEndsAt(k) - (elite ? 0 : 864e5); }
function wbDayStart(k, elite) { return wbDayEnd(k, elite) - WB_OPEN_MS; }
/** Which fight is open at `now`: 'normal' (Thursday), 'elite' (Friday) or '' (closed). */
function wbOpenMode(now = wbNow()) {
    const k = wbWeek(now);
    if (k < WB_FIRST)
        return '';
    if (now >= wbDayStart(k, true))
        return 'elite';
    return now >= wbDayStart(k, false) && now < wbDayEnd(k, false) ? 'normal' : '';
}
/** True while a fight is open (Thursday or Friday, 7:30 AM to 5:00 PM PH time). */
function wbOpen(now = wbNow()) { return !!wbOpenMode(now); }
/** When the open fight ends, or the next one starts (and which one that is). */
function wbNextStart(now = wbNow()) {
    let k = Math.max(WB_FIRST, wbWeek(now));
    if (now < wbDayStart(k, false))
        return { at: wbDayStart(k, false), elite: false, k };
    if (now < wbDayStart(k, true))
        return { at: wbDayStart(k, true), elite: true, k };
    k++;
    return { at: wbDayStart(k, false), elite: false, k };
}
function wbOpenEnd(now = wbNow()) { const m = wbOpenMode(now); return m ? wbDayEnd(wbWeek(now), m === 'elite') : 0; }
/** The last event whose champion has been announced (Friday 5:01 PM), or -1 before the first one. */
function wbChampWeek(now = wbNow()) { const k = wbWeek(now - WB_ANNOUNCE_MS) - 1; return k >= WB_FIRST ? k : -1; }
/** Where a run is kept in wbHist: "46" for the Friday (Elite) fight of event 46, "46n" for its Thursday (Normal) fight.
    Results from before 5.2 were all on Fridays, so they stay on the Elite board. */
function wbKey(k, elite) { return String(k) + (elite ? '' : 'n'); }
/** A player's best run for one day of event k, only if it was set while that day was open (else null). */
function wbRunOf(p, k, elite = true) {
    const h = (p && p.wbHist || {})[wbKey(k, elite)];
    if (!h || k < WB_FIRST || !(+h.d > 0))
        return null;
    const at = +h.at || 0;
    return at >= wbDayStart(k, elite) && at <= wbDayEnd(k, elite) + WB_ANNOUNCE_MS ? h : null;
}
/** A player's score (damage) for one day of event k (else 0). */
function wbScoreOf(p, k, elite = true) { const h = wbRunOf(p, k, elite); return h ? +h.d : 0; }
/** The boss and map of event k. One of 16 pairs, picked at random, never the same pair two weeks in a row. */
function wbPick(k) {
    let c = 0;
    for (let i = 0; i <= Math.max(0, k); i++) {
        const r = rng(i * 7919 + 101)();
        c = i === 0 ? Math.floor(r * 16) : (c + 1 + Math.floor(r * 15)) % 16;
    }
    return { k, combo: c, boss: WB_BOSSES[c % 4], map: WB_MAPS[Math.floor(c / 4)] };
}
/** One day's board: each player's best run. Wins (all 5 tiers popped) first, fastest, then most lives left; then the
    rest by damage. */
function wbBoard(k, players = allPlayers(), elite = true) {
    return players.map(p => ({ p, h: wbRunOf(p, k, elite), d: wbScoreOf(p, k, elite) })).filter(x => x.h)
        .sort((a, b) => compareWb(a.h, b.h)).map((x, i) => Object.assign(x, { rank: i + 1 }));
}
/** A board row's result as plain text: "all 5 tiers in 18m 30s" or "tier 3 · 45,000 damage". */
function wbResultTxt(x) {
    const h = x.h || {}, s = Math.round(+h.t || 0);
    return h.won ? 'all 5 tiers in ' + Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's'
        : (h.tiers ? h.tiers + ' tier' + (h.tiers === 1 ? '' : 's') + ' · ' : '') + x.d.toLocaleString() + ' damage';
}
/** The champion: gold on the Elite board of the last announced event (or on its Normal board if nobody played Elite),
    or null. Only they wear the World Boss Legend border. */
function wbChamp(players = allPlayers(), now = wbNow()) {
    const k = wbChampWeek(now);
    if (k < 0)
        return null;
    let elite = true, top = wbBoard(k, players, true)[0];
    if (!top) {
        elite = false;
        top = wbBoard(k, players, false)[0];
    }
    return top ? { k, elite, p: top.p, d: top.d, h: top.h, boss: wbPick(k).boss } : null;
}
function refreshWbChamp(players = allPlayers(), now = wbNow()) {
    const c = wbChamp(players, now);
    WB_CHAMP_UID = c ? c.p.id.uid || '' : '';
    return WB_CHAMP_UID;
}
/** "2d 4h", "3h 12m", "12m 05s": time left until `t`. */
function wbLeft(t, now = wbNow()) {
    const s = Math.max(0, Math.floor((t - now) / 1000)), d = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60;
    return d ? d + 'd ' + h + 'h' : h ? h + 'h ' + m + 'm' : m + 'm ' + String(s % 60).padStart(2, '0') + 's';
}
/** Notifications about World Boss events this player hasn't been told about yet: the boss is here (Thursday and Friday,
    while open), and the results of the last announced event (top 3, your medal). Each has a fixed id, so it is only added once. */
function wbNotes(players = allPlayers(), now = wbNow()) {
    const k = wbWeek(now), out = [], cur = wbPick(k), me = players.find(p => p.me), mode = wbOpenMode(now);
    if (mode)
        out.push({ id: 'wbstart-' + wbKey(k, mode === 'elite'), kind: 'wb', at: wbDayStart(k, mode === 'elite'),
            text: 'The World Boss is here (' + (mode === 'elite' ? 'Elite' : 'Normal') + '): ' + cur.boss.name + ' on ' + cur.map.name,
            sub: cur.boss.build + ' · open until 5:00 PM today (PH time)' });
    const c = wbChampWeek(now), ch = c < 0 ? null : wbChamp(players, now), prev = ch ? wbBoard(c, players, ch.elite) : [];
    if (prev.length) {
        const p0 = wbPick(c), tag = ch.elite ? 'Elite' : 'Normal';
        out.push({ id: 'wbend-' + c, kind: 'wb', at: wbEndsAt(c) + WB_ANNOUNCE_MS, av: avatarOf(prev[0].p.id),
            text: p0.boss.name + ' is over. Champion (' + tag + '): ' + prev[0].p.id.name + ' (' + wbResultTxt(prev[0]) + ')',
            sub: prev.slice(1, 3).map(x => (x.rank === 2 ? 'Silver: ' : 'Bronze: ') + x.p.id.name + ' (' + wbResultTxt(x) + ')').join(' · ') });
        const mine = me && prev.find(x => x.p.key === me.key);
        if (mine && mine.rank <= 3)
            out.push({ id: 'wbmedal-' + c, kind: 'medal', at: wbEndsAt(c) + WB_ANNOUNCE_MS + 1, av: avatarOf(me.id),
                text: 'You won ' + ['gold', 'silver', 'bronze'][mine.rank - 1] + ' (' + tag + ') against ' + p0.boss.name + '!',
                sub: mine.rank === 1 ? 'You are the World Boss Champion and wear the Legend border for 7 days.' : wbResultTxt(mine) });
    }
    return out;
}

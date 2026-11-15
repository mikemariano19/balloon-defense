"use strict";
/* Balloon Defense — World Boss schedule and boards (5.0). The game rules for a World Boss run are in engine.ts.
   One event a week, on Friday from 7:30 AM to 5:00 PM Philippine time (UTC+8). The champion (gold) is announced at
   5:01 PM and wears the World Boss Legend border until the next champion is announced.
   Every PC works out the same boss and map from the week number, so no server is needed.
   No DOM access at load time, so the tests can load this file too. */
const WB_EPOCH = Date.UTC(2026, 0, 2, 9, 0, 0); // Friday 2 Jan 2026, 5:00 PM in the Philippines
const WB_WEEK_MS = 7 * 864e5;
const WB_OPEN_MS = 9.5 * 36e5; // the fight is open for 9.5 hours: 7:30 AM to 5:00 PM
const WB_ANNOUNCE_MS = 60e3; // the champion is announced one minute after the end (5:01 PM)
const WB_FIRST = 45; // the first event on this schedule (Friday 20 Nov 2026); older scores were tests and never count
/** The clock. A function so the tests can move it. */
function wbNow() { return Date.now(); }
/** The event coming up or running at `now` (its number). Event k is open from wbStartsAt(k) to wbEndsAt(k). */
function wbWeek(now = wbNow()) { return Math.floor((now - WB_EPOCH) / WB_WEEK_MS); }
function wbEndsAt(k) { return WB_EPOCH + (k + 1) * WB_WEEK_MS; }
function wbStartsAt(k) { return wbEndsAt(k) - WB_OPEN_MS; }
/** True while this week's fight is open (Friday 7:30 AM to 5:00 PM PH time). */
function wbOpen(now = wbNow()) { const k = wbWeek(now); return k >= WB_FIRST && now >= wbStartsAt(k); }
/** The last event whose champion has been announced (5:01 PM), or -1 before the first one. */
function wbChampWeek(now = wbNow()) { const k = wbWeek(now - WB_ANNOUNCE_MS) - 1; return k >= WB_FIRST ? k : -1; }
/** A player's score for event k, only if it was set while that event was open (else 0). */
function wbScoreOf(p, k) {
    const h = (p && p.wbHist || {})[String(k)];
    if (!h || k < WB_FIRST || !(+h.d > 0))
        return 0;
    const at = +h.at || 0;
    return at >= wbStartsAt(k) && at <= wbEndsAt(k) + WB_ANNOUNCE_MS ? +h.d : 0;
}
/** The boss and map of event k. One of 16 pairs, picked at random, never the same pair two weeks in a row. */
function wbPick(k) {
    let c = 0;
    for (let i = 0; i <= Math.max(0, k); i++) {
        const r = rng(i * 7919 + 101)();
        c = i === 0 ? Math.floor(r * 16) : (c + 1 + Math.floor(r * 15)) % 16;
    }
    return { k, combo: c, boss: WB_BOSSES[c % 4], map: WB_MAPS[Math.floor(c / 4)] };
}
/** Event k's damage board: each player's best score that event, highest first (ties: whoever got there first). */
function wbBoard(k, players = allPlayers()) {
    return players.map(p => ({ p, h: (p.wbHist || {})[String(k)], d: wbScoreOf(p, k) })).filter(x => x.d > 0)
        .sort((a, b) => b.d - a.d || (+a.h.at || 0) - (+b.h.at || 0)).map((x, i) => Object.assign(x, { rank: i + 1 }));
}
/** The champion: gold of the last announced event, or null. Only they wear the World Boss Legend border. */
function wbChamp(players = allPlayers(), now = wbNow()) {
    const k = wbChampWeek(now), top = k < 0 ? null : wbBoard(k, players)[0];
    return top ? { k, p: top.p, d: top.d, boss: wbPick(k).boss } : null;
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
/** Notifications about World Boss events this player hasn't been told about yet: the boss is here (while it is open),
    and the results of the last announced event (top 3, your medal). Each has a fixed id, so it is only added once. */
function wbNotes(players = allPlayers(), now = wbNow()) {
    const k = wbWeek(now), out = [], cur = wbPick(k), me = players.find(p => p.me);
    if (wbOpen(now))
        out.push({ id: 'wbstart-' + k, kind: 'wb', at: wbStartsAt(k), text: 'The World Boss is here: ' + cur.boss.name + ' on ' + cur.map.name,
            sub: cur.boss.build + ' · open until 5:00 PM today (PH time)' });
    const c = wbChampWeek(now), prev = c < 0 ? [] : wbBoard(c, players);
    if (prev.length) {
        const p0 = wbPick(c);
        out.push({ id: 'wbend-' + c, kind: 'wb', at: wbEndsAt(c) + WB_ANNOUNCE_MS, av: avatarOf(prev[0].p.id),
            text: p0.boss.name + ' is over. Champion: ' + prev[0].p.id.name + ' (' + prev[0].d.toLocaleString() + ' damage)',
            sub: prev.slice(1, 3).map(x => (x.rank === 2 ? 'Silver: ' : 'Bronze: ') + x.p.id.name + ' (' + x.d.toLocaleString() + ')').join(' · ') });
        const mine = me && prev.find(x => x.p.key === me.key);
        if (mine && mine.rank <= 3)
            out.push({ id: 'wbmedal-' + c, kind: 'medal', at: wbEndsAt(c) + WB_ANNOUNCE_MS + 1, av: avatarOf(me.id),
                text: 'You won ' + ['gold', 'silver', 'bronze'][mine.rank - 1] + ' against ' + p0.boss.name + '!',
                sub: mine.rank === 1 ? 'You are the World Boss Champion and wear the Legend border for 7 days.' : mine.d.toLocaleString() + ' damage' });
    }
    return out;
}

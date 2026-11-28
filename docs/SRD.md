# Balloon Defense — Software Requirements Specification (SRD)

**Version:** 5.2.2 (from `src/data.ts`, `VERSION`)
**Status:** Describes the code on branch `agent/bo` as it was at commit `2467a04` (main). Items marked **(not merged)** come from other branches.
**Audience:** designers, testers, and anyone changing the rules.

---

## 1. Introduction

### 1.1 Purpose
Balloon Defense is an offline browser tower defense game. The player places towers on a grid to pop balloons before they leak through the end of the road. This document states what the game must do, how it is organised, and how it is checked.

### 1.2 Scope
In scope: the single-player game (maps, difficulties, modes, towers, balloons, rounds, scoring), player progression, run ranking, the weekly World Boss event, profiles and login, the shared-folder sync for other PCs, the chat room, notifications, and the balance and test tools.

Out of scope: any server, accounts on the internet, payments, mobile-native apps, and anything that sends data outside the player's own PC and shared folder.

### 1.3 Definitions
| Term | Meaning |
|---|---|
| Balloon | An enemy that walks a road. Lower layers pop into child balloons. |
| Layer / HP | How many hits a balloon takes before it pops. |
| Leak | A balloon that reaches the end of the road. It costs lives. |
| Round | One wave of balloons. Ends with a round bonus. |
| Stage | One map on one difficulty. Ranked separately. |
| Run | One game from start until it is won, lost, or abandoned. |
| Tile | 24 px grid square. The field is 40 × 25 tiles. |
| Tower XP | XP earned by one tower type; unlocks its upgrade tiers 3–5. |
| Player XP / level | XP earned by the profile; levels unlock towers. |
| World Boss (WB) | A weekly boss event with its own maps, rules and leaderboard. |
| Shared folder | A folder on a network drive that several PCs read and write for sync. |

### 1.4 References
- `README.md` — player-facing feature list and version history.
- `src/data.ts` — all game tables (maps, difficulties, balloons, towers, rounds, titles, borders, World Boss config).
- `src/engine.ts` — game rules (no drawing or DOM code).
- `src/profile.ts`, `src/share.ts`, `src/chat.ts`, `src/worldboss.ts`, `src/ui.ts`, `src/render.ts`, `src/audio.ts`, `src/assets.ts` — the other modules.
- `tests/*.test.js` — automated tests. `tools/balance.js`, `tools/stage-report.js` — balance and rating tools.

---

## 2. Overall Description

### 2.1 Product perspective
- Plain HTML, CSS and JavaScript at runtime. Sources are TypeScript in `src/`, compiled with `tsc` to `js/`. The compiled `js/` is committed, so players never build.
- Entry point: `index.html`. Double-click it to play. No install.
- Art is hand-editable SVG in `assets/` (`balloons/`, `towers/`, `tiles/`, `scenery/`, `ui/`). Avatars are drawn in code.
- Published to GitHub Pages by `.github/workflows/pages.yml` on every push to `main`. The workflow runs `npm run build` and `npm test` before publishing.

### 2.2 Users
- **Player:** plays alone, on one or more profiles, on one or more PCs.
- **Developer / designer:** edits `src/data.ts` to rebalance; runs tests and the balance tools.
- **Master (admin):** the person who knows the master password. Uses Master control.

### 2.3 Operating environment
- Modern desktop browser. The shared folder needs the browser's built-in folder access, which is available in Edge and Chrome.
- No network connection is needed for play. Nothing is sent to the internet.
- Node.js 20 for building and tests.

### 2.4 Constraints
- Offline by design. No server-side code.
- Saves live in the browser's local storage. Other PCs see a player only through the shared folder or a backup code.
- Game rules must stay separate from drawing code (`src/engine.ts` has no DOM code).

### 2.5 Assumptions
- Players keep their browser's site data. Clearing it loses the local save unless a backup exists.
- Clocks on the PCs are roughly right. The World Boss schedule is in Philippine time (UTC+8) and uses the PC clock.

---

## 3. Functional Requirements

### 3.1 Start, log-in and profiles

**FR-1 Log-in.** Every visit starts at the log-in screen. The player picks a profile and types its password.
- Passwords are stored only as salted SHA-256 hashes in `id.pw`.
- A profile without a password creates one at its first log-in.
- The log-in lasts for the browser tab (`sessionStorage`). `loggedIn()` gates play, chat and the online dot.
- New players use the registration form. One profile per PC.

**FR-2 Profile identity.** A profile has a name shown as `name#ID`, one of 12 animal avatars in 10 background styles, a border, and a title.

**FR-3 Home PC.** A profile plays only on its home PC (`id.home`). Other PCs show it view-only.

**FR-4 Multiple profiles.** Several profiles can live in one browser. A roster (`balloonDefense.players`) lists them. Switching a profile reloads the page.

**FR-5 Profile safety.** Saves never go backwards. Every save is merged with the saved copy (`keepProgress`): larger counters, tower XP and best runs are kept.

**FR-6 Backups.** Automatic backups: the 10 newest, plus one per day for 14 days. With the shared folder connected they are written to `<folder>/balloon-defense-backups/<uid>/`.

**FR-7 Find my profile.** Rebuilds a lost profile from the shared folder and all backups, and moves it to this PC.

**FR-8 Backup code / file.** The player can export a backup code or file and import it on another PC. This works without the shared folder.

**FR-9 Master control.** Opened from the log-in screen with a master password set the first time it is used.
- Reset a password, delete an account everywhere, or restore a deleted account from its backups.
- Set World Boss settings (see §3.9).
- The master password is kept hashed in `<folder>/balloon-defense-admin/admin.json`. If it is forgotten, that file is deleted to reset it.

### 3.2 Map and grid

**FR-10 Field.** Drawn at 960 × 600 px. The grid is 40 × 25 tiles of 24 px.

**FR-11 Roads.** Each map has one or more roads, each a polyline of points. Straight road pieces are snapped to grid lines so the road covers whole tiles. The road is 2 tiles (48 px) wide.

**FR-12 Tile types.** Each tile is one of: free, road, water, lava, ice, scenery. Only free tiles can take a tower. Boats need water.

**FR-13 Scenery.**
- Scenery is generated from a seed per map (same map, same scenery every time).
- *Tall* scenery (trees, rocks, cacti, palms, crates, stalls, boulders and similar) blocks line of sight for sight-based towers. It can be cleared for cash.
- *Walkable* low scenery (`flowers`, `fern`) can be built over and does not block shots.
- Clearing cost is $300 to $1,500, scaled by the piece's size.

**FR-14 Maps.** 20 maps in 4 tiers:

| Tier | Maps |
|---|---|
| Beginner | Meadow Bend, Sunny Spiral, Pond Park, Leaf Loops, Stone Garden |
| Intermediate | Switchback Pass, Autumn Woods, Frosty Lake, Market Steps, Mill Creek |
| Advanced | Canyon Run, Dune Hook, Lava Rift, Harbor Run, Quarry Switch |
| Expert | Twin Rivers, Crossroads, Last Stand, Figure Eight, Three Gates |

Each map has a theme (meadow, autumn, desert, snow, volcano, jungle, coast) that sets ground, path, scenery and ambient particles (high effects only).

**FR-15 Start cash bonus by tier.** Beginner +$300, Intermediate +$150, Advanced and Expert +$0.

**FR-16 Map cash penalty.** Crossroads starts −$600 and Figure Eight −$300. On Hard and Nightmare the penalty is skipped, so every map starts on the same money.

**FR-17 Reverse mode** runs the roads backwards (`mapPaths(map, reverse)`).

### 3.3 Difficulty

**FR-18 Difficulties.** Start cash is $650 on every difficulty before the map and tier bonuses.

| Difficulty | Lives | Rounds | Tower price | Balloon health ramp starts | Points |
|---|---|---|---|---|---|
| Easy | 150 | 40 | ×0.85 | round 80 | 100 |
| Medium | 100 | 60 | ×1.00 | round 70 | 200 |
| Hard | 60 | 80 | ×1.08 | round 60 | 300 |
| Nightmare | 1 | 100 | ×1.20 | round 70 | 500 |

**FR-19 Balloon health ramp.** Before the ramp round, health is ×1. After it, health rises 2% per round until round 100. Past round 100 it rises 6% per round (freeplay).

### 3.4 Game modes and challenges

**FR-20 Modes.**

| Mode | Rule |
|---|---|
| Standard | The normal game. Wins earn map badges and ranked runs. |
| Half Cash | Starts with half the cash. Pops and round bonuses pay half. |
| Primary Only | Only Dart, Tack, Bomb and Frost towers. |
| No Tier 3 | Upgrades stop at tier 2, so no abilities. |
| Reverse | Balloons travel the road backwards. |
| World Boss | Hidden from the mode list. See §3.9. |

The four challenges are Half Cash, Primary Only, No Tier 3 and Reverse. Winning a challenge records it on the map.

**FR-21 Daily challenge.**
- One challenge per date, chosen from the date (same for everyone).
- Map is random; difficulty is Easy (55%) or Medium (45%); mode is Standard or one of the four challenges.
- Not offered on Saturdays or Sundays. Weekend days never break a streak.
- A streak counts consecutive weekdays with a win.
- Only the first end of a game counts; freeplay after a win is not saved.

### 3.5 Economy

**FR-22 Pop cash.** Each pop pays $1 (×0.5 after round 50, ×0.5 in Half Cash).

**FR-23 Round bonus.** Finishing round *r* pays `150 + 12 × min(r, 50)` (×0.5 in Half Cash).

**FR-24 Lives.** A balloon that reaches the end leaks and costs lives equal to its value (its remaining layers, counting children). The Colossus costs its remaining HP.

**FR-25 Selling.** Selling refunds part of the price. A confirm step can be turned on in Settings.

**FR-26 Free undo.** A tower placed or upgraded before the round starts can be undone for free until the round starts.

### 3.6 Towers

**FR-27 Shop.** Nine towers. Each is unlocked by player level.

| Tower | Price | Footprint | Unlock (player level) | Support? | Ability (cooldown) |
|---|---|---|---|---|---|
| Dart | $200 | 2×2 | 1 | No | Rapid Fire, triple attack speed 5 s (40 s) |
| Tack Spinner | $280 | 2×2 | 1 | No | Nova Burst, 4 damage to balloons within 200 px (35 s) |
| Bomb Cannon | $525 | 3×3 | 1 | No | Blimp Wrecker, 1,200 damage to the toughest balloon (45 s) |
| Sniper Post | $700 | 2×2 | 1 | No | Airstrike, 30 damage to the 3 toughest (45 s) |
| Frost Tower | $400 | 2×2 | 2 | No | Absolute Zero, freeze all on screen 3 s (50 s) |
| Signal Tower | $500 | 3×3 | 3 | Yes | Rally, towers in aura attack twice as fast 6 s (50 s) |
| Tesla Coil | $750 | 3×3 | 4 | No | Overload, triple speed and +5 chain jumps 6 s (45 s) |
| Gunboat | $450 | 3×3 | 5 | No | Broadside, 24 cannonballs (30 s). Water only. |
| Gold Mine | $900 | 3×3 | 6 | Yes | Payday, 1.5 rounds of its income now (90 s) |

*(not merged)* `agent/tomas` commit `cb4369e` changes the Gold Mine to $1,500 and its upgrades to +50% cost, and sets it to pay every 10 s during rounds. Confirm which version is intended before merging.

Price = base × tower cost multiplier (master control) × difficulty multiplier × (1 − 2% × Discount skill), rounded to $5.

**FR-28 Upgrades.** Each tower has 3 upgrade paths of 5 tiers, so 135 upgrades per tower type.
- Tiers 1–2 are always free to buy with cash.
- Tiers 3, 4 and 5 unlock with tower XP: 500, 1,500 and 4,000 XP.
- One path can reach tier 5. A second path can reach tier 2. The third path stays closed.
- Tier 3 grants the ability; tier 4 or 5 makes it stronger.

**FR-29 Tower XP.** Each tower earns XP while it stands on the field (per round) and per pops it makes (1 XP per 20 pops). Tower level is set by total XP earned: `150 × (L−1)²`, up to level 20.

**FR-30 Skill points.** Each tower level gives one skill point. Points go into that tower's skill list. Each skill has a max (for example Range max 5, +2% per point). The skill lists differ by tower:
- Most towers: Range, Attack speed, Discount, Pierce, Ability recharge.
- Sniper Post: Damage, Attack speed, Discount, Blimp hunter, Ability recharge.
- Gold Mine: Income (+3% per round), Vault size, Discount, Payday recharge.
- Signal Tower: Aura size, Aura speed, Discount, Rally time, Rally recharge.

**FR-31 Ability cooldowns** are shared by every tower of one type, so one type cannot spam its ability.

**FR-32 Targeting.** Each tower has a targeting setting. The default is `first`. *(Other options are not listed in this spec; check `src/engine.ts`.)*

**FR-33 Line of sight.** Shots that are hitscan or chain mode, and projectiles of type dart, bolt, tack, blade, ball, cannonball or torpedo, are blocked by tall scenery in the way (`sightBlocked`, `src/engine.ts`). Bomb shells, Frost pulses and the Signal aura are not blocked by scenery.

**FR-34 Camo.** Camo balloons are seen only by towers with camo detection (upgrades or skills: Eagle Eye, Arctic Core, Night Scope, Snow Goggles, Ghost Rounds, Tesla, and others).

**FR-35 Damage types.**
- *Sharp* — pops everything except lead.
- *Explosive* — pops everything except black and zebra.
- *Freeze* — freezes everything except white, zebra and blimps.
- *Fire*, *energy*, *normal* — each as listed in `src/data.ts`.

**FR-36 Blimp multipliers.** Some towers deal extra damage to blimps (`bm`): Bomb, Sniper, Dart and others.

### 3.7 Balloons and rounds

**FR-37 Balloon types.**

| Balloon | Layers / HP | Speed | Pops into |
|---|---|---|---|
| Red | 1 | 1.0 | — |
| Blue | 1 | 1.4 | Red |
| Green | 1 | 1.8 | Blue |
| Yellow | 1 | 2.6 | Green |
| Pink | 1 | 3.0 | Yellow |
| Black | 1 | 1.8 | 2 Pink (immune: explosive) |
| White | 1 | 2.0 | 2 Pink (immune: freeze) |
| Lead | 1 | 1.0 | 2 Black (immune: sharp) |
| Zebra | 1 | 1.8 | Black + White (immune: explosive, freeze) |
| Rainbow | 1 | 2.2 | 2 Zebra |
| Ceramic | 10 | 2.5 | 2 Rainbow |
| Blimp | 200 | 1.0 | 4 Ceramic |
| Brute Blimp | 700 | 0.6 | 4 Blimp |
| Colossus (boss) | see FR-39 | 0.4 | 4 minions |

Speeds are multiples of the base speed of 62 px/s.

**FR-38 Round prefixes.** A round is written as `count type gap`. Prefixes: `c` = camo, `r` = regrow (Red–Pink only; heals if not finished), `f` = fortified (double hits: Lead, Ceramic, Blimps).

**FR-39 Colossus boss.** Every 10th round starts with a Colossus.
- HP by round: 100 (round 10), 350 (20), 650 (30), 2,000 (40), 5,500 (50), then 8% more per round after round 50.
- Splits off 3 minions at 75%, 50% and 25% health. Minion type depends on round (yellow → black → zebra → rainbow → ceramic → blimp → brute).
- Drops 4 minions on death.

**FR-40 Round table.** Rounds 1–100 are fixed in `ROUNDS` in `src/data.ts`. Past round 100 is freeplay: more ceramics, blimps and brutes each round.

**FR-41 Round flow.** The player presses Start Round (or uses auto-start). Balloons spawn along the road. The round ends when every balloon is popped or has leaked.

### 3.8 Run results, scoring and ranking

**FR-42 Ranked runs.** Only Standard, non-daily games are ranked. A run is submitted once.

**FR-43 Stage ranking.** One stage = one map on one difficulty (`stageKey`). A run ranks by:
1. Cleared runs beat uncleared runs.
2. Cleared: fewer lives lost, then faster game clock (simulated seconds, so game speed and pausing do not matter).
3. Uncleared: more rounds reached, then more lives left.
4. Then the earlier run.

Each profile keeps its best run per stage.

**FR-44 Tier score.** A tier's score is the sum of the points of every cleared stage on that tier. A stage with no lives lost counts 1.5×.

**FR-45 Leaderboards.** Shown in the Leaderboards screen:
- Top 3 per tier and per stage (gold / silver / bronze medals).
- Global Top 10 by medal points.
- Daily Top 10 (each player's best try per date; wins first, then clock, then lives left).
- Boards show the top 5; places 6–10 scroll.

**FR-46 Medals and badges.** Winning a stage on any difficulty earns a map badge. Medals are awarded per stage board. A profile holding 10 gold medals earns the Medalist border.

**FR-47 Notifications.** The bell keeps the last 10 items:
- Medal taken (who took your medal, the points lost).
- Your new medals (the points gained).
- Map domination (every difficulty of a map cleared).
- Trophies, World Boss news, online pop-ups.
- Saved as `domSeen` / `medalSeen` so the first look does not flood the bell.

### 3.9 World Boss

**FR-48 Schedule.** One boss a week, rotating between 4 bosses, each on 4 looping maps. The event closes at **5:00 PM Philippine time on Friday**. The fight is open for 9.5 hours, from 7:30 AM to 5:00 PM.
- Thursday: the normal fight.
- Friday: the Elite fight (2.5× HP, boss walks 15% faster, one extra skull per tier).
- The week number comes from a fixed epoch (`WB_EPOCH`). Scores from before the first event (`WB_FIRST`) never count.

**FR-49 Bosses.**

| Boss | Speed | Defense | Summons | Skill |
|---|---|---|---|---|
| Gale | Fast | Normal | 3 per summon | Dash (runs 3× for 2.5 s) |
| Bastion | Slow | High (40% less damage) | 3 per summon | Shield (no damage for 4 s) |
| Broodmother | Slow | Medium (20% less damage) | 4 per summon | Brood (big batch) |
| Swarm King | Fast | Normal | 3, 40% more often | Swarm (tougher batch) |

Each boss has 50,000 HP and 3,000 lives by default. Master control can change name, HP, defense, start money ($10,000 default), lives, and summon size.

**FR-50 Tiers.** Five tiers of HP: 20%, 40%, 60%, 80% and 100% of the boss's HP. Tier *n* arrives at round 40, 60, 80, 100 or 120, but never before the previous tier is popped. All five must be popped before round 140.

**FR-51 Skulls.** Each tier has 1–5 skulls (one more per tier). Passing a skull triggers the boss's skill. The last (flaming) skull makes the boss angry: faster, and it summons more often.

**FR-52 Walk and summons.**
- The boss walks the road in 10 minutes (Fast) or 12 minutes (Slow).
- It stops for 1.5 s each time it summons.
- Summon gap: 15 s, then 10 s after 10 minutes, then 5 s after 20 minutes.
- Summons get 1% stronger every minute.
- Summons follow a mob schedule: green (0–2 min), yellow, pink, black, white, lead, zebra, rainbow, ceramic, blimp, brute.
- Summons are fortified from minute 8 and some are camo from minute 12.

**FR-53 Rounds.** The fight is played in rounds. A round starts 1.5 s after the last one is cleared, or after 40 s at most.

**FR-54 End of a fight.** It ends when:
- all five tiers are popped (win);
- the boss reaches the END of the road;
- lives reach 0;
- round 140 is reached (damage still counts);
- 5:00 PM comes.

**FR-55 Scoring.** Score = total damage dealt (after boss defense), with no cap. Killing the boss adds 10 points per life left.

**FR-56 Leaderboard order.** A kill ranks above a non-kill. Among kills: faster kill, then more lives left. Among non-kills: more damage. Ties go to the earlier run.

**FR-57 Champion.** The gold medalist is the World Boss Champion for 7 days from Friday 5:01 PM. They can wear a champion border (10 choices, picked in Edit profile). The champion is announced one minute after the end.

**FR-58 Boss modifiers** (master control, percent): Swarm (balloons per summon), Strength (summoned balloons' HP), Gold gain (pops and paydays), Boss aura (balloons within 160 px of the boss take less damage).

### 3.10 Progression

**FR-59 Player level.** Up to level 50. Total XP to reach level *L* is `250 × (L−1) × L`.

**FR-60 Player XP sources.** Each round: 15 XP plus 1 XP per 20 pops. Winning a game: 500. Winning a challenge: 300. Winning a daily challenge: 400.

**FR-61 Titles.** By lifetime pops: Rookie (0), Popper (10k), Pin Master (100k), Balloon Buster (500k), Sky Sweeper (1M), Burst Captain (5M), Pop Commander (10M), Slayer (50M, border), Warlord (250M, border), Pop Legend (1B, border).

**FR-62 Borders.** Ten free borders at start, plus earned borders: Slayer, Warlord, Legend (from titles), Flawless (12 perfect clears with no lives lost), Daily Flame (30-day daily streak), Medalist (10 gold medals), and 10 World Boss champion borders.

**FR-63 Avatars.** 12 animals × 2 styles, 24 total. Backgrounds: 10 styles.

**FR-64 Game history.** The last 30 games are kept on the profile.

**FR-65 Stats.** Profile shows games, wins, finished, perfect clears, pops, time played, rounds, towers built, bosses killed, best daily streak.

### 3.11 Settings and controls

**FR-66 Settings.** Auto-start rounds, pause on window blur, effects (high / low), confirm sell, sound, screen shake, colour-blind markers (one letter per balloon layer), UI scale, ability tray, notifications, chat pop-ups.

**FR-67 Hotkeys.**
- Q W E R T Y U: 1st to 7th ability on the ability tray.
- Shift + a tower's number key: backup ability hotkey.
- G: ability targeting.

**FR-68 Pause and speed.** Pause stops the HUD game clock. 3× speed is available and the clock runs 3× faster.

**FR-69 Save and resume.** The current run is saved to local storage during play (`snapshot`, `savedRun`). A saved run can be resumed. World Boss runs are never saved half-way; their damage is recorded as it goes (`wbRecord`).

**FR-70 Save version.** The save key is `balloonDefense.v2`, unchanged since v2, so older progress carries over.

### 3.12 Shared folder and sync

**FR-71 Connection.** Settings → Shared folder, or **Connect shared folder** on the home page. Uses the browser's folder access (Edge or Chrome). After a browser restart the browser may ask once more: click **Reconnect**.

**FR-72 Folder layout.**

| Path | Contents |
|---|---|
| `balloon-defense-players/` | One JSON file per player (the whole save). |
| `balloon-defense-chat/` | Chat messages. |
| `balloon-defense-events/` | Game results used for notifications. |
| `balloon-defense-backups/<uid>/` | Automatic backups. |
| `balloon-defense-admin/admin.json` | Master control data (hashed master password, WB config). |

**FR-73 Timing.** A player's file is written a few seconds after each change (`Share.pushActive`). Every PC reads all files at start-up and every 30 seconds. Merge runs both ways (`planSync`).

**FR-74 Repair.** On the first 5.0 start every profile is repaired from its backups once (`Share.repair`).

**FR-75 Newest wins.** Admin settings: the newest save wins on every PC.

**FR-76 Offline.** If the folder is not connected, the game still works on the local save. Other PCs are not visible.

### 3.13 Chat and social

**FR-77 Chat.** One room for every player on the shared folder. Emoji, 24-hour message history, own name / avatar / level / rank / title shown. Pop-ups appear at the top of the screen during games (can be turned off).

**FR-78 Name filter.** Profile names containing listed offensive words are not accepted (`NAME_FILTER`).

**FR-79 Online status.** Each player shows an online or offline dot. The player list shows online players first, with "30m ago" last-seen for others.

**FR-80 Profile view.** Clicking a player on the home page shows their profile.

---

## 4. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-1 | Offline | Play must work with no network access. No external requests at runtime. |
| NFR-2 | Install | No install. Opens by double-clicking `index.html`. |
| NFR-3 | Build | `npm run build` compiles `src/*.ts` to `js/*.js` with `tsc` (`tsconfig.json`). Compiled files are committed. |
| NFR-4 | Performance | *Not yet measured.* Target: smooth animation with 30+ towers and a full set of balloons on screen. |
| NFR-5 | Accessibility | Colour-blind markers (letters per layer). Screen shake and particles can be turned off. |
| NFR-6 | Security | Passwords stored as salted SHA-256 hashes. Chat and names are filtered. No secrets in the repository. |
| NFR-7 | Data safety | Saves never go backwards. Ten recent backups plus daily backups for 14 days. |
| NFR-8 | Responsiveness | *Not specified.* Layout is designed for a desktop window. |
| NFR-9 | Browser support | Edge and Chrome (desktop). Other browsers: *not verified*. |
| NFR-10 | Deployment | Pushed to GitHub Pages by workflow on every push to `main`. |

---

## 5. Testing and Quality

**TQ-1 Automated tests.** `npm test` runs the Node tests in `tests/`:
- `engine.test.js` — game rules.
- `share.test.js` — shared folder and merge.
- `v45.test.js`, `v50.test.js`, `v51.test.js`, `v511.test.js`, `v512.test.js` — per-version regression tests.
- `harness.js` — shared test helpers.

**TQ-2 Balance bot.** `npm run balance` (`tools/balance.js`), e.g. `node tools/balance.js easy,medium,hard standard meadow,market`.

**TQ-3 Stage report.** `tools/stage-report.js` plays each stage and difficulty with the bot and gives a 1–10 rating.

**TQ-4 Acceptance.** A change is ready for players only after the owner has tested it in-game. Nothing is pushed to GitHub before that.

**TQ-5 Known gaps.** No automated tests cover drawing or the browser UI. Those are checked by hand in-game.

---

## 6. Versioning and Change Control

- The version lives in `VERSION` in `src/data.ts`. The README lists the features of each version.
- Balance changes are made in `src/data.ts` tables only; no other file needs to change.
- Save format changes must keep older saves loadable (see `savedRun`, `keepProgress`).

---

## 7. Open Items

1. **Gold Mine price** — $900 on main; $1,500 on `agent/tomas` (`cb4369e`). Decide which.
2. **README version** says 5.1.1 while `VERSION` is 5.2.2. Update the README.
3. **NFR-4, NFR-8** have no target yet.
4. **NFR-9** other browsers are not verified.
5. `tools/hero-sim.js` is an untracked file on this branch; its purpose is not covered here.

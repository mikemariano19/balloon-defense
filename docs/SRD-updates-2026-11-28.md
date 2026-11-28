# Balloon Defense: SRD for the updates of 28 November 2026

**Base version:** 5.2.2
**Written by:** Tomas, from the source files, test files, team documents and Git logs on this PC.
**Not done:** no build, tests or in-game check were run while writing this.

## 1. Scope and status

This document states what each of today's updates must do. Times are Philippine time (UTC+8).

| ID | Update | Where it is | Commit (time) | In the main game folder? | On GitHub? |
|---|---|---|---|---|---|
| U1 | Version 5.2.2: Champion card backgrounds | `main` | `6398a97` (01:28) | Yes | Yes, by the local record of `origin/main` |
| U2 | Gold Mine pays every 10 seconds | `agent/tomas` | `cb4369e` (20:23) | No | No push seen |
| U3 | Balance pass and stage report tool | `agent/bo` | `35c312b` (19:29), `2467a04` (19:38) | No | No push seen |
| U4 | Heroes | `agent/ivy`; staged copy in `agent/tomas` | `ae8d14f` (21:52); the copy is not committed | No | No push seen |
| U5 | Research, reviews and previews | `agent/condoriano`, `agent/ivy`, `agent/bo` | `f2d2d47`, `d41b5b9`, `1869875`, `02698f3` | No | No push seen |

**No single folder has all of the updates.** The `tomas` work folder has U2 and U4. The `bo` work folder has U3.

## 2. General requirements

| ID | Requirement |
|---|---|
| G-1 | The game stays offline: open `index.html`, no install. |
| G-2 | Sources are in `src/` (TypeScript). The compiled `js/` is committed, so players never build. |
| G-3 | Nothing is pushed to GitHub until the owner has tested it in-game. |

## 3. U1: Version 5.2.2

| ID | Requirement |
|---|---|
| U1-1 | There are 10 Champion card backgrounds: Royal Throne, Volcano Lair, Galaxy, Treasure Hoard, Aurora, Ocean Sunset, Cherry Blossom, Thunderstorm, Champion Arena, Balloon Sky. |
| U1-2 | Only the World Boss Champion shows one. The Champion picks it in Edit profile. |
| U1-3 | It shows behind the Champion's player card and profile card for 7 days. |
| U1-4 | An unknown or missing choice shows the first background (Royal Throne). |
| U1-5 | Shared folder: results, World Boss scores, log-ins and profile changes reach the other PCs in a few seconds. (Listed in the 5.2.2 news; the speed-up was committed on 27 November, `00af4e6`.) |

## 4. U2: Gold Mine

### 4.1 Rules

| ID | Requirement |
|---|---|
| U2-1 | The Gold Mine costs $1,500 (was $900). Every upgrade costs 50% more. |
| U2-2 | A mine pays every 10 seconds of game time while a round is being played. Pause stops the timer; fast forward speeds it up. |
| U2-3 | Nothing is paid between rounds or at the end of a round. Each mine's timer carries over to the next round and is saved with the game. |
| U2-4 | Payouts stop 120 seconds after the round's last balloon has come out, so a round held open cannot be farmed. |
| U2-5 | One payout is the mine's gold plus interest on the cash held, up to the interest cap. |
| U2-6 | Lives from mines are still given once per round. |
| U2-7 | Payday collects 5 payouts at once (8 once stronger), without interest. Cooldown 90 s. It can be used between rounds. |
| U2-8 | Skills read: Income +3% gold every 10 s, Vault size +10% interest cap. |

### 4.2 Values

| Item | Old price | New price | Old effect (per round) | New effect (per 10 s) |
|---|---|---|---|---|
| Base mine | $900 | $1,500 | $120, interest cap $1,000 | $40, interest cap $350 |
| Richer Vein | $500 | $750 | +$80 | +$25 |
| Deep Shaft | $1,200 | $1,800 | +$150 | +$50 |
| Mother Lode | $4,000 | $6,000 | +$500 | +$170 |
| Gold Rush | $10,000 | $15,000 | +$1,500 | +$500 |
| Bullion Empire | $35,000 | $52,500 | +$4,000 | +$1,350 |
| Pop Bonus | $600 | $900 | +10% pop cash (all mines max +30%) | Same effect |
| Bigger Carts | $900 | $1,350 | +$100 | +$35 |
| Bank Vault | $3,000 | $4,500 | 8% interest, max $1,000 | 3%, max $350 |
| Investment Bank | $8,000 | $12,000 | 12%, max $2,500 | 4%, max $850 |
| Central Bank | $28,000 | $42,000 | 15%, max $6,000, +$500 | 5%, max $2,000, +$170 |
| Shiny Nuggets | $350 | $525 | +$40 | +$15 |
| Prospector | $800 | $1,200 | +$60 | +$20 |
| Gem Cutter | $2,600 | $3,900 | +5 lives each round | Same effect |
| Rescue Fund | $6,500 | $9,750 | +15 lives, +$200 | +15 lives per round, +$70 |
| Golden Heart | $24,000 | $36,000 | +40 lives, +$800 | +40 lives per round, +$270 |

Prices are base prices, before the difficulty multiplier and discounts.

## 5. U3: Balance pass and stage report

### 5.1 Difficulty

| Difficulty | Lives (old → new) | Rounds | Health ramp starts after round (old → new) |
|---|---|---|---|
| Easy | 200 → 150 | 40 | 80 → 80 |
| Medium | 150 → 100 | 60 | 80 → 70 |
| Hard | 100 → 60 | 80 | 80 → 60 |
| Nightmare | 1 → 1 | 100 | 80 → 70 |

| ID | Requirement |
|---|---|
| U3-1 | After the ramp round, balloon health rises 2% per round up to round 100, then 6% per round. |
| U3-2 | World Boss games keep the old ramp (after round 80). |
| U3-3 | `node tools/stage-report.js [mode] [mapId,mapId]` plays each stage on each difficulty with the balance bot and prints a table with a suggested rating from 1 to 10. The bot builds no Gunboats or Gold Mines, so the rating is only a guide. |

**Effect to note:** Medium ends at round 60, so its new ramp (after round 70) changes freeplay only. The normal Medium game gets harder through fewer lives.

## 6. U4: Heroes

### 6.1 Rules

| ID | Requirement |
|---|---|
| U4-1 | Heroes are not a game mode. They are placed like towers in every mode except Primary Only (which allows only its four towers). (Changed 29 November: Heroes was first built as a separate mode.) |
| U4-2 | One hero per game. Before it fights a round it can be changed; after that, only that hero can be used. |
| U4-3 | A hero is placed like a 2 × 2 tower. It is listed above the towers and has no upgrade paths. |
| U4-4 | A hero has levels 1 to 10, earned during the game. At the end of each round a hero on the field gains 10 + 2 × round XP. Placed on round 1, it is level 3 after round 5 and level 10 after round 32. |
| U4-5 | The first ability unlocks at level 3 (key Z), the second at level 10 (key X). Abilities need a running round and a finished cooldown. |
| U4-6 | Selling a hero loses its levels. Ability cooldowns stay. Money spent since the last round started is refunded in full; the rest at 70%. |
| U4-7 | Signal Towers buff heroes like other towers. |
| U4-8 | A game with a hero counts like any other game: records, rankings, challenge stars and XP. The hero itself earns no tower XP. |
| U4-9 | A saved game keeps the hero, its level, cooldowns and running effects. A save with a hero (picked or on the field) is version 5; saves without one stay version 4. An old save from the removed Heroes mode continues as Standard. |
| U4-10 | The hero panel shows portrait, level, XP, targeting, abilities, skills, Sell and a Hero details button. |
| U4-11 | The Upgrades screen has a Towers / Heroes switch (Tab key). The Heroes tab shows each hero's price, stats at any chosen level (gains marked ▲), a level track with the round each level is reached, both abilities and all skills. ← → browse heroes, 1–9 and 0 pick a level. A hero selected in a game opens its page at its current level. |

### 6.2 Heroes

Prices are for Medium. Ranges and distances are in pixels, times in seconds.

| Hero | Role | Price | Attack (damage / pierce / range / seconds per attack) | Weakness |
|---|---|---|---|---|
| Fern Fletch (fox) | Archer, starter | $540 | Sharp arrows: 1 / 3 / 150 / 0.95 | Cannot pop lead; no camo until level 5 |
| Ember Vale (tiger) | Fire support | $725 | Fire: 1 / 2 / 100 / 0.5 | Short range; normal attack misses camo |
| Sergeant Flint (bear) | Artillery | $700 | Explosive, blast 35: 2 / 10 / 160 / 1.2 | No camo; cannot pop black or zebra until level 8 |
| Willow Moss (deer) | Crowd control | $650 | Sparks jumping to 3 balloons: damage 1, range 120, every 1.35 | No camo; weak against blimps |

| Hero | Level | Skill or ability | Requirement |
|---|---|---|---|
| Fern | 3 | Split Shot (60 s cooldown) | For 8 s, shoots 3 different balloons at once |
| Fern | 5 | Keen Eyes | Detects camo |
| Fern | 6 | Twin Nock | 2 arrows per shot |
| Fern | 7 | Burst Tip | Every 3rd shot bursts, radius 30; cannot pop lead |
| Fern | 8 | Blimp Piercer | 3× damage to blimps |
| Fern | 10 | Arrow Rain (70 s) | Pick a spot: 3 waves of 4 sharp damage, radius 120 |
| Ember | 3 | Spark Bottle (30 s) | Burning patch on the road for 10 s, 1 damage every 0.5 s, hits camo |
| Ember | 4 | Kindle | Towers within 100 get +1 pierce; sharp attacks become fire |
| Ember | 6 | Hotter Flame | +2 pierce |
| Ember | 8 | Wide Blaze | +20 range |
| Ember | 10 | Wildfire (60 s) | 3 fire damage to every balloon, camo included; all towers get Kindle for 8 s |
| Flint | 3 | Dazer Shell (16 s) | Homing shell: 3 damage and 1.5 s stun, radius 60; no stun on bosses |
| Flint | 5 | Crew Drill | Bomb Cannons and Mortar Deck Gunboats attack 8% faster |
| Flint | 8 | Armor Cracker | His shells damage black and zebra |
| Flint | 10 | Reload Order (80 s) | Halves the Blimp Wrecker recharge left; bomb towers attack 25% faster for 8 s |
| Willow | 3 | Tangle Roots (30 s) | Balloons within 150 move 50% slower for 5 s; not blimps |
| Willow | 5 | Green Current | Tesla Coils within 120 attack 10% faster |
| Willow | 7 | Longer Jumps | Sparks jump to 5 balloons |
| Willow | 8 | Charged Grove | Tesla Coils within 120 get +2 chain jumps |
| Willow | 10 | Great Grove (90 s) | All balloons 40% slower for 8 s (blimps 20%, bosses not at all) |

Hero buffs to other towers never apply to support towers.

## 7. U5: Documents

| Document | Branch | Content |
|---|---|---|
| `docs/btd6-heroes.md` | `agent/condoriano` | Research on BTD6 starter heroes, from unofficial guides |
| `docs/hero-review.md` | `agent/ivy` | Which hero ideas fit this game |
| `docs/hero-preview.md`, `docs/hero-preview.html` | `agent/ivy` | Names, looks, skills and abilities of the four heroes |
| `docs/SRD.md` | `agent/bo` (work folder) | SRD of the whole game; reported as not committed |
| `tools/hero-sim.js` | `agent/bo` (work folder) | Bot simulation of the hero drafts, base attack only; reported as not tracked |

## 8. Acceptance: what to test in-game

| Test | Folder | Expected |
|---|---|---|
| T-1 Gold Mine | `tomas` | Costs $1,500 on Medium before discounts; pays at 10 s of a round; no pay between rounds |
| T-2 Payday | `tomas` | Gives 5 payouts at once, 8 when stronger |
| T-3 Heroes | main | In a Standard game, the heroes are above the towers; one hero places, levels up, Z works at level 3 and X at level 10 |
| T-4 Heroes save | main | Leaving and continuing keeps the hero and its level |
| T-5 Balance | `bo` | Lives are 150 / 100 / 60 / 1 |
| T-6 Champion background | main | The Champion can pick one and it shows on both cards |

Each work folder is under `.agent-office/worktrees/`. Open its `index.html`.

## 9. Open items

1. **Merge.** U2, U3 and U4 are on separate branches and change some of the same files (`data.ts`, `engine.ts` and their compiled copies). After merging, rebuild and run `npm test`.
2. **Tests.** Test files cover U2, U3 and U4, but they were not run for this document.
3. **Easy lives.** U3 also lowers Easy from 200 to 150, although its commit title names only Medium, Hard and Nightmare. Confirm that this is wanted.
4. **Medium ramp.** Decide whether the ramp should start before round 60.
5. **Old records.** Runs made under the easier rules may stay on the same leaderboards as new ones. Not verified.
6. **Version and news.** U2 and U4 add no new version number or News entry (still 5.2.2).
7. **Hero balance and names.** Balance is untested. The names were not checked for trademarks.
8. **Two SRDs.** `docs/SRD.md` (whole game) says `2467a04` is on `main`, but the `main` log ends at `6398a97`. Correct this before relying on it.

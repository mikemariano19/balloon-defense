# Hero preview: original heroes for Balloon Defense

Draft by Ivy, 2026-11-28. A design proposal only: no hero exists in the game and none of these numbers are tested.
Roles are loosely based on four BTD6 heroes (see `hero-review.md`). Names and ability names are new; they were not
checked for trademarks.

## Shared rules (proposed)

- One hero per game, in a new unranked Hero mode.
- Levels 1-10, earned during the game. The XP curve is not designed yet.
- First ability unlocks at level 3 (key **Z**), second at level 10 (key **X**).
- Prices are for Medium; other difficulties use the normal price multiplier.
- Ranges are in px, times in seconds.

| Hero | Animal | Role | Price | Inspired by | Build order |
|---|---|---|---|---|---|
| Fern Fletch | Fox | Archer, all-round starter | $540 | Quincy | 1 |
| Ember Vale | Tiger | Fire support | $725 | Gwendolin | 2 |
| Sergeant Flint | Bear | Artillery commander | $700 | Striker Jones | 3 |
| Willow Moss | Deer | Forest keeper, crowd control | $650 | Obyn Greenfoot (mostly new) | 4 |

## 1. Fern Fletch (archer)

**Attack:** sharp arrows. Damage 1, pierce 3, range 150, one shot per 0.95 s.
**Weakness:** cannot pop Lead; no camo until level 5.

| Level | Skill | Effect |
|---|---|---|
| 3 | **Split Shot** (ability, recharge 60) | For 8 s, shoots 3 different balloons at once |
| 5 | Keen Eyes | Detects camo |
| 6 | Twin Nock | 2 arrows per shot |
| 7 | Burst Tip | Every 3rd shot bursts in a 30 px radius (still cannot pop Lead) |
| 8 | Blimp Piercer | 3x damage to blimps |
| 10 | **Arrow Rain** (ability, recharge 70) | Pick a spot: 3 waves of 4 damage within 120 px |

## 2. Ember Vale (fire)

**Attack:** fire. Damage 1, pierce 2, range 100, one attack per 0.5 s. Pops Lead.
**Weakness:** short range, low pierce, highest price; normal attack misses camo.

| Level | Skill | Effect |
|---|---|---|
| 3 | **Spark Bottle** (ability, recharge 30) | Burning patch on the road for 10 s, 1 damage every 0.5 s, hits camo |
| 4 | Kindle | Towers within 100 px get +1 pierce; their sharp attacks become fire |
| 6 | Hotter Flame | +2 pierce |
| 8 | Wide Blaze | +20 range |
| 10 | **Wildfire** (ability, recharge 60) | 3 damage to every balloon on screen (camo too); all towers get Kindle for 8 s |

## 3. Sergeant Flint (artillery)

**Attack:** explosive shells. Damage 2, pierce 10, blast 35, range 160, one shot per 1.2 s. Pops Lead.
**Weakness:** no camo; cannot pop Black or Zebra until level 8.

| Level | Skill | Effect |
|---|---|---|
| 3 | **Dazer Shell** (ability, recharge 16) | Homing shell: 3 damage, stuns for 1.5 s within 60 px; no stun on bosses |
| 5 | Crew Drill | Bomb Cannons and Mortar Deck Gunboats attack 8% faster |
| 8 | Armor Cracker | Own shells damage Black and Zebra |
| 10 | **Reload Order** (ability, recharge 80) | Halves the remaining Blimp Wrecker recharge; bomb towers attack 25% faster for 8 s |

## 4. Willow Moss (forest)

**Attack:** firefly sparks (energy) that jump to 3 balloons. Damage 1, range 120, one attack per 1.35 s. Pops Lead.
**Weakness:** no camo, low damage, weak against blimps.

| Level | Skill | Effect |
|---|---|---|
| 3 | **Tangle Roots** (ability, recharge 30) | Balloons within 150 px move 50% slower for 5 s; not blimps or bosses |
| 5 | Green Current | Tesla Coils within 120 px attack 10% faster |
| 7 | Longer Jumps | Sparks jump to 5 balloons |
| 8 | Charged Grove | Tesla Coils within 120 px get +2 chain jumps |
| 10 | **Great Grove** (ability, recharge 90) | All balloons slow 40% (blimps 20%, bosses unaffected) for 8 s |

## Open questions

1. Are the names and animals right, or should they change?
2. Should heroes stay out of ranked, Daily and World Boss games?
3. Reload Order shortens a strong ability, and Wildfire hits the whole screen: both need balance testing.

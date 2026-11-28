# Which BTD6 basic heroes fit Balloon Defense

Reviewed 2026-11-28 by Ivy. Compares `docs/btd6-heroes.md` (branch `agent/condoriano`, commit `f2d2d47`) with the
code on `main` (version 5.2.2). Reading only: nothing was built or run. Hero numbers come from that research, which
used unofficial guides and was not checked in BTD6. Only the four heroes it details are reviewed, not the other 14.

The game has no hero system today.

## Verdict

| Order | Hero | Fit | Works with what exists | Needs new code or a design change |
|---|---|---|---|---|
| 1 | Quincy | Good | Arrows match the Dart Tower base (damage 1, pierce 3, 0.95 s). Camo flag, blimp bonus (`bm`), speed boost. | Third-shot explosion, aimed arrow storm |
| 2 | Gwendolin | Fair | `fire` damage type, aura buffs, screen-wide ability loop | New weakness, burning patch on the road, lead-popping buff |
| 3 | Striker Jones | Fair to weak | Explosions, stun, `g.abCd.bomb` | Partial damage to Black, buffs limited to Bomb Cannon and Mortar Deck |
| Later | Obyn Greenfoot | Poor | Slow effects, `RBE` for a swallow limit | No Druid or magic towers, no homing shots, no road objects |

## Notes per hero

**Quincy.** Start here. Lead stays his weakness (`sharp`), so use the "cannot pop Lead" version and make the third-shot
blast `sharp` or unable to hurt Lead; `explode()` always deals `explosive`, which pops it. Rapid Shot copies the Dart
Tower's Rapid Fire, which is simple but not distinct. BTD6 range 50 is about 195 px if scaled from our Dart Tower
(125 px for BTD6's 32, from memory), longer than any ordinary attacking tower except the Sniper Post: tune it.

**Gwendolin.** Copied as written she has no weakness: no balloon here is immune to `fire` and there is no Purple, so
she pops everything but camo. Pick a limit (short range, low pierce, higher price, or a new immunity). For Heat It Up,
change only neighbours' `sharp` damage to `fire`; the `buffPierce` pattern in `recalcAll` covers the pierce part.

**Striker Jones.** Bombs are immune-blocked by Black and Zebra (all or nothing in `damageBalloon`), so "50% chance on
Black" is new logic. Artillery Command maps to `g.abCd.bomb = 0`, which gives a second Blimp Wrecker (1,200, or 4,000
damage): check balance. "Bosses and BADs" should mean `BT[type].boss`, which includes the World Bosses.

**Obyn Greenfoot.** Most of the kit would be invented. If wanted, redo it as an original forest hero that buffs Tesla
Coil, after a road-object system exists. Wall of Trees pays cash, so it also needs an anti-farming limit.

## Prices

The research prices equal Medium price x our `costMul` (Easy 0.85, Hard 1.08, Nightmare 1.2), rounded to 5. So store
one base price (Quincy 540, Gwendolin 725, Striker 700, Obyn 650) and call `price()`. Start cash is $650 plus any map
and tier adjustment, so check that each hero is affordable on the poorest maps.

## Fix before or while building (highest first)

1. **Names and rights.** These four heroes and their ability names belong to Ninja Kiwi, and the README describes
   public publishing through GitHub Pages. Reuse the roles, with original names, art and ability names.
2. **Rankings.** Runs are keyed by map, difficulty and `ua` only (`stageKey`, `src/engine.ts`), so hero games would beat
   old medals unfairly. Daily and World Boss boards need the same decision. Simplest first release: a non-`standard`
   Hero mode, which `submitRun` and `saveRecord` already leave unranked, with heroes off everywhere else.
3. **Keep heroes out of `SHOP`.** It drives hotkeys 1-9, sprites, tower skills, the upgrade tree and XP. Use a
   `HEROES` table. Code that reads `TD[type]` (placement, drawing, XP toasts, selling) needs a hero path, and
   `endRound` must not give heroes tower XP.
4. **Abilities.** The system allows one per tower type, and nine already share seven keys (QWERTYU). A hero has two,
   gated at levels 3 and 10: give them their own ids, cooldowns and keys (Z and X looked free in `src/ui.ts`).
5. **Save and resume.** `snapshot` lists tower fields one by one, so hero level, hero XP and shot counters must be added.
   An older build loading a save that holds an unknown tower type is likely to crash: bump the run version, and keep
   accepting versions 3 and 4.
6. **Rules to decide.** One hero per game; level 1-20 per game (new, separate from the stored tower level); Signal Tower
   buffs; sell refund; Primary Only and No Tier 3 behaviour.
7. **Merge order.** `agent/tomas` (Gold Mine) and `agent/bo` (balance) are not on `main` and change `data.ts` and
   `engine.ts`. Merge them first, then tune heroes. The balance bot does not know about heroes.

## Suggested first step

One original archer hero modeled on Quincy, in an unranked Hero mode, with levels 1-10 and both abilities. Add the
others after it has been tested.

# Balloon Defense 5.1.1

An offline browser tower defense game. No install: double-click `index.html`.

What's new in 5.1.1:
- **Map domination** notification when a player clears every difficulty of a map (`dominationNotes`, `src/profile.ts`).
- **Medal taken** notification: who took your medal on which stage, your medal now and the points lost
  (`medalLostNotes`). Your own new medals show the points gained (`medalGain`). Both remember what this profile saw
  last (`domSeen` / `medalSeen` in the save), so the first look never floods the bell.
- Global and Daily boards show the top 5; places 6–10 scroll (`fitTopBoards`, `src/ui.ts`).
- **Ability hotkeys**: Q W E R T Y U use the 1st–7th ability on the ability tray (`abilityBySlot`); Shift + a tower's number key is a backup (`abilityByKey`). Targeting is G.
- **Hard / Nightmare money**: map cash penalties are skipped on Hard and Nightmare, so Crossroads and Figure Eight no longer start on $50 / $350.
- **World Boss setup** in Master control: name, HP, defense, start money, lives and summon size per boss. Kept in
  `admin.json` with the master password (`cleanWbConfig` / `applyWbConfig`); the newest save wins on every PC.
  A run already going keeps the build it started with.

What's new in 5.1:
- **Log in** (`openLogin`, `src/ui.ts`): every visit starts by picking a profile and typing its password. Passwords are
  stored as salted SHA-256 hashes in `id.pw` (`src/profile.ts`), never in plain text. A profile without one creates it at
  its first log-in. The log-in lasts for the browser tab (`sessionStorage`); `loggedIn()` gates playing, chat and the
  online dot. New players use the registration form (one profile per PC, as before).
- **Master control** (link on the log-in screen): reset a password, delete an account everywhere, or restore a deleted
  account from its backups. The master password is set the first time it is opened and kept, hashed, in
  `<folder>/balloon-defense-admin/admin.json`. Forgot it? Delete that file.
- World Boss news on every log-in · game history (last 30 games, on the profile) · trophies in notifications · red screen
  flash on leaks · HUD game clock (stops on pause, 3x on 3x) · players sorted online first, with "30m ago" last-seen ·
  online pop-ups · your own name, avatar, level/rank and title in chat · no daily challenge on weekends (streaks skip
  them) · Sniper Post skills: Damage and Blimp hunter replace Range and Pierce.

What's new in 5.0 (the News button on the home page lists every version):
- **Profile protection.** A profile plays only on its home PC (`id.home`); other PCs show it view-only. Saves never go
  backwards (`keepProgress`: every save is merged with the saved copy). The shared-folder copy is written a few seconds
  after each change (`Share.pushActive`) and merged both ways at every sync (`planSync`). Backups: 10 newest plus one a
  day for 14 days. **Find my profile** rebuilds a lost profile from the folder and all backups and moves it to this PC.
  On the first 5.0 start, every profile is repaired from its backups once (`Share.repair`).
- **World Boss** (`src/worldboss.ts`, rules in `src/engine.ts`): one boss a week (4 bosses x 4 looping maps), ending
  Friday 5:00 PM Philippine time. 50,000 HP, summons that speed up and get 1% stronger per minute, 3,000 lives, score =
  damage. Banner and damage board at the bottom of the leaderboards; the gold medalist wears the Legend border for 7 days.
- **Chat** (`src/chat.ts`): one room for everyone on the shared folder, with emoji, 24-hour messages,
  pop-ups at the top of the screen during games.
- **Notifications** bell (last 10). Info button (How to Play + World Boss). Online/offline dots.
- Removed: Unlock All, Switch player, Add another player, Reset all progress.

- 20 maps in 4 tiers, 4 difficulties (Easy 40 rounds and 150 lives, Medium 60 and 100, Hard 80 and 60, Nightmare 100 and 1), 4 challenge modes, daily challenge.
- **Heroes** mode (unranked): one of four heroes who levels up as you clear rounds, with two abilities on Z and X
  (`src/heroes.ts`, details in `docs/hero-preview.md`).
- 9 towers, each with 3 upgrade paths of 5 tiers (135 upgrades): one path up to tier 5, a second up to tier 2. Tiers 3–5 unlock
  with that tower's XP; tower levels give skill points.
- Tile grid (40 × 25): small towers take 2 × 2 tiles, big ones 3 × 3. Tall scenery blocks line of sight and can be cleared for cash.
- One profile per PC (plus players from other PCs through a shared folder): name#ID, 24 animal avatars, backgrounds, borders, titles.
  The home page lists every player with an online/offline dot; click one to see their profile.
- Leaderboards across all players: top 3 per tier and per stage (gold / silver / bronze), Global Top 10 by medal points, Daily Top 10.
- Backup code / backup file to move progress between PCs.
- Plain HTML/CSS/JS at runtime; sources are TypeScript in `src/`, compiled to `js/` (committed, so players never build).
- Art is hand-editable SVG in `assets/` (`balloons/`, `towers/`, `tiles/`, `scenery/`, `ui/`). Avatars are drawn in code (`src/profile.ts`).

## Fully offline, with a shared folder for other PCs

Nothing is sent to the internet. Each player's progress lives in the browser's local storage (one save slot per player).

To see players from **other PCs**, connect every PC to the same folder on a shared network drive: Settings → Shared folder,
or **Connect shared folder** next to Players on the home page (Edge or Chrome; uses the browser's built-in folder access, no install).
Each player is one small JSON file in `<folder>/balloon-defense-players/`, written by the PC they play on and read by the others
at start-up, a few seconds after progress changes, and every 30 seconds. The file holds the whole save, so a lost
profile can be found again (Find my profile). Chat messages go to `<folder>/balloon-defense-chat/`, game results to `<folder>/balloon-defense-events/` (notifications) and automatic backups to
`<folder>/balloon-defense-backups/<uid>/`. After a browser restart, Edge may ask once more: click **Reconnect**.
Code: `src/share.ts`. The backup code or file still works for moving progress without the shared folder.

## Develop

```
npm install
npm run build     # tsc -> js/
npm test          # engine, progression, grid, line-of-sight, ranking, players, profile and shared-folder tests
npm run balance   # balance bot: node tools/balance.js easy,medium,hard standard meadow,market
```

## Publish

Push to a GitHub repository's `main` branch and enable Pages (Settings -> Pages -> Source: GitHub Actions).
`.github/workflows/pages.yml` builds, tests and publishes the playable files.

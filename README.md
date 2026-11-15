# Balloon Defense 5.0

An offline browser tower defense game. No install: double-click `index.html`.

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

- 20 maps in 4 tiers, 4 difficulties (Easy 40, Medium 60, Hard 80, Nightmare 100 rounds), 4 challenge modes, daily challenge.
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

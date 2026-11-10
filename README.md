# Balloon Defense 3.0

An offline browser tower defense game. No install: double-click `index.html`.

- 12 maps, 3 difficulties, 4 challenge modes, daily challenge, player levels.
- Plain HTML/CSS/JS at runtime; sources are TypeScript in `src/`, compiled to `js/` (committed, so players never build).
- Art is hand-editable SVG in `assets/` (`balloons/`, `towers/`, `tiles/`, `scenery/`, `ui/`).

## Develop

```
npm install
npm run build     # tsc -> js/
npm test          # 16 engine unit tests
npm run balance   # balance bot on every map (slow)
```

## Publish

Push to a GitHub repository's `main` branch and enable Pages (Settings -> Pages -> Source: GitHub Actions).
`.github/workflows/pages.yml` builds, tests and publishes the playable files.

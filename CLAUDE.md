# Sprawl

Browser city builder: `index.html` (canvas 2D + vanilla JS) plus one stylesheet.
Open it directly in a browser, or serve it with `npx serve .`.

## Styles
- Source: `src/scss/style.scss`, compiled to `css/style.css` with `npm run build` / `npm run watch` (dart-sass).
- `css/style.css` is committed so the page opens without a build; rebuild after every SCSS change.
- Class names are BEM; some are generated in JS (`buildTools`, `updateNeeds`, `renderLog`, `svgIcon(type, cls)`),
  so a renamed class must be changed in both places.

## Core idea
The city grows procedurally on its own (roads on a 4-tile block lattice, houses next to roads).
Needs (water, food, jobs, healthcare, education, power) spawn at the city's outskirts.
When the player builds the matching service within 3 tiles in time, an attractor is added there
and growth is pulled in that direction. Expired needs push growth away and remove nearby houses.

## Code map (all inside the IIFE in index.html)
- `SVC`: building types, costs, coverage radius, unlock population
- `newState`, `genTerrain`, `seedCity`: map generation (value noise for lakes and forests)
- `growStep`, `upgradeStep`: procedural growth, weighted by `attract()`
- `spawnNeed`, `solveNeed`, `expireNeed`: the needs loop
- `step`: simulation tick; `draw`: rendering; `buildTools`, `updateNeeds`: UI
- `window.claude?.hot` lines are only for the claude.ai artifact viewer and can be removed

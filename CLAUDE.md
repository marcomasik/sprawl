# Sprawl

Browser city builder (three.js + vanilla JS), isometric SimCity 4 style view. `index.html` loads the compiled `css/style.css` and `js/app.js`.
Open it directly in a browser, or serve it with `npx serve .`.

## Build
- `npm run build` compiles both; `npm run watch` rebuilds both on change.
- SCSS: `src/scss/style.scss` (entry) → `css/style.css` (dart-sass).
- JS: ES modules in `src/js/`, entry `main.js` → bundled by esbuild into `js/app.js` (IIFE, so file:// works).
- `css/style.css` and `js/app.js` are committed so the page opens without a build; rebuild after every source change.
- Never edit `css/` or `js/` by hand.

## Core idea
The city grows procedurally on its own (roads on a 4-tile block lattice, houses next to roads).
Needs (water, food, jobs, healthcare, education, power) spawn at the city's outskirts.
When the player builds the matching service within 3 tiles in time, an attractor is added there
and growth is pulled in that direction. Expired needs push growth away and remove nearby houses.

## Code map (src/js/)
- `config.js`: constants; `SVC` holds building types, costs, coverage radius, unlock population
- `util.js`, `noise.js`: helpers and value noise
- `state.js`: the game state `S` plus `newState`, `recalc`, `attract`, `serialize`/`restore`
- `world.js`: map generation (`genTerrain`, `seedCity`, `setRoad`, `placeHouse`)
- `growth.js`: `growStep`, `upgradeStep` (procedural growth, weighted by `attract()`)
- `needs.js`: `spawnNeed`, `solveNeed`, `expireNeed`
- `actions.js`: `canPlace`, `place` (player building and demolishing)
- `sim.js`: `step` (simulation tick), `income`, `checkProgress`
- `effects.js`: particle and floating-text data (tile units; `h` is height above ground)
- `render.js`: three.js scene (`draw`, `resize`, `pickTile`). Tile (x, y) is world (x - W/2 + 0.5, 0, y - H/2 + 0.5).
  Terrain and forest trees are rebuilt only when `markTerrainDirty()` was called; buildings, roads and overlays are
  refilled every frame into InstancedMeshes, one-off objects (markers, glows, previews) come from `take()` pools.
  Floating text is HTML in `#labels`, projected from 3D each frame.
- `camera.js`: orthographic SimCity 4 style camera; `pan`, `zoomBy`, `rotate` (90° steps)
- `ui.js`: DOM panels (tools, requests, log, stats, toast) and the selected `tool`
- `input.js`: pointer and keyboard handling, `hover`; drag/WASD pan, wheel zoom, Q/E rotate
- `main.js`: frame loop and boot
- Shared mutable values (`S`, `tool`, `hover`, `particles`) are `export let` and only reassigned in their own module;
  other modules read them through live import bindings or call that module's setter (`selectTool`, `clearEffects`, `markTerrainDirty`).
- `window.claude?.hot` lines in `main.js` are only for the claude.ai artifact viewer and can be removed

## Styles (src/scss/)
- `base/` (reset, tokens, document), `layout/_app.scss`, and one partial per UI component in `components/`.
- Class names are BEM; some are generated in JS (`ui.js`: `buildTools`, `updateNeeds`, `renderLog`, `svgIcon(type, cls)`),
  so a renamed class must be changed in both places.

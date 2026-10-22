# Sprawl

Browser city builder (three.js + vanilla JS), isometric SimCity 4 style view. `index.html` loads the compiled `css/style.css` and `js/app.js`.
Open it directly in a browser, or serve it with `npx serve .`.

## Build
- `npm run build` compiles both; `npm run watch` rebuilds both on change.
- SCSS: `src/scss/style.scss` (entry) → `css/style.css` (dart-sass).
- JS: ES modules in `src/js/`, entry `main.js` → bundled by esbuild into `js/app.js` (IIFE, so file:// works).
  `.glb` models are bundled as bytes and `.png` as data URLs (`--loader` flags in package.json), so no file is fetched at runtime.
- `css/style.css` and `js/app.js` are committed so the page opens without a build; rebuild after every source change.
- Never edit `css/` or `js/` by hand.

## Core idea
The city grows procedurally on its own: roads, and houses next to roads. Each tile has a district style (`S.style`,
`computeStyle` in world.js: noise plus lakeshores and slopes). Above a cutoff that rises with population (`organicCut`
in growth.js) streets grow organically from dead ends (turns, branches, loops, 2-tile clearance, reserved branch spots);
below it they follow the 4-tile block lattice (`isLat`). So the old core meanders and later flat expansion is gridded.
Needs (water, food, jobs, healthcare, education, power) spawn at the city's outskirts.
When the player builds the matching service within 3 tiles in time, an attractor is added there
and growth is pulled in that direction. Expired needs push growth away and remove nearby houses.
House level = 1 + the number of service types covering the tile (max 7, `POP` in config.js); houses climb one level
at a time while mood ≥ 35 (`upgradeStep`) and render taller per level, from small houses to skyscrapers (`HOUSES` in render.js).

## Code map (src/js/)
- `config.js`: constants; `SVC` holds building types, costs, coverage radius, unlock population
- `util.js`, `noise.js`: helpers and value noise
- `state.js`: the game state `S` plus `newState`, `recalc`, `attract`, `serialize`/`restore`
- `world.js`: map generation (`genTerrain`, `computeStyle`, `seedCity`, `setRoad`, `placeHouse`)
- `growth.js`: `growStep`, `upgradeStep` (procedural growth, weighted by `attract()`; organic street rules in `organicRoad`)
- `needs.js`: `spawnNeed`, `solveNeed`, `expireNeed`
- `actions.js`: `canPlace`, `place` (player building and demolishing)
- `sim.js`: `step` (simulation tick), `income`, `checkProgress`
- `effects.js`: particle and floating-text data (tile units; `h` is height above ground)
- `render.js`: three.js scene (`draw`, `resize`, `pickTile`). Tile (x, y) is world (x - W/2 + 0.5, h, y - H/2 + 0.5).
  `HOUSES`, `SVC_MODEL`, `ROAD` map game objects to Kenney models. Each model gets one InstancedMesh per part (`putModel`);
  forest trees are refilled only when `markTerrainDirty()` was called, all other batches every frame.
  Roads are picked by neighbour mask and sheared onto sloped tiles; buildings stand on the tile's lowest corner,
  turned toward the nearest road (`facing`). Lots, parks, road beds and coverage are draped quads.
  One-off objects (markers, badges, ghosts, glows) come from `take()` pools; floating text is HTML in `#labels`.
- `terrain.js`: visual-only heightmap on tile corners (water level y = 0, lake beds below), `hAt`, `tileTop`, `tileSpan`,
  plus the ground and edge-skirt geometry. Heights never decide where things may be built; they only shape district
  style and make organic streets avoid climbing.
- `models.js`: loads the embedded Kenney models (`loadModels`, awaited before boot) into `models["kit/name"]`
  templates, re-centred with their base at y = 0 and switched to Lambert materials. Kenney models face +z.
  Suburban houses get a `roof` vertex flag (roof-green texel and upper 70% of the model) and a shader tweak that
  replaces those texels with the instance colour; render.js passes `roof` from `ROOF_TILES`, picked by tile hash.
- `camera.js`: orthographic SimCity 4 style camera; `pan`, `zoomBy`, `rotate` (90° steps)
- `ui.js`: HUD panels (tool palette, advisor requests, log + ticker, status bar stats and speed state, toast) and the selected `tool`
- `minimap.js`: north-up overview with the camera outline (`viewFootprint()` from render.js); click/drag calls `centerOn`
- `input.js`: pointer and keyboard handling, `hover`; drag/WASD pan, wheel zoom, Q/E rotate, speed and nav buttons,
  Log/Help popovers (any button with `aria-controls` toggles its panel, one open at a time)
- `main.js`: frame loop and boot
- Shared mutable values (`S`, `tool`, `hover`, `particles`) are `export let` and only reassigned in their own module;
  other modules read them through live import bindings or call that module's setter (`selectTool`, `clearEffects`, `markTerrainDirty`).
- `window.claude?.hot` lines in `main.js` are only for the claude.ai artifact viewer and can be removed

## Styles (src/scss/)
- `base/` (reset, tokens, document, mixins), `layout/_app.scss`, and one partial per UI component in `components/`.
- SimCity 4 style HUD: the map fills the window (`.app` is fixed, the canvas follows its size) and everything else floats
  above it: `.tools` palette (left), `.advisor` (top right), `.navigator` minimap (bottom right), `.statusbar` (bottom),
  `.popover` panels. Panels share the `panel` mixin from `base/_mixins.scss`; `--edge` and `--bar-h` place them.
- Class names are BEM; some are generated in JS (`ui.js`: `buildTools`, `updateNeeds`, `renderLog`, `svgIcon(type, cls)`),
  so a renamed class must be changed in both places.

## Models (src/models/)
- Kenney City Kits (CC0, kenney.nl): `suburban/`, `commercial/`, `industrial/`, `roads/`, each with its own `colormap.png`
  and `License.txt`. Only the models listed in `KITS` in `models.js` are copied in; adding one means copying the `.glb`
  from the kit's `Models/GLB format/` folder and adding its name to `KITS`.

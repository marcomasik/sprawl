/* ---------- map generation ---------- */
import { W, H, N, CX, CY, GRASS, WATER, FOREST, ROOFS } from "./config.js";
import { inb, at } from "./util.js";
import { vnoise, fbm } from "./noise.js";
import { S } from "./state.js";
import { markTerrainDirty } from "./render.js";
import { computeHeights, tileSpan } from "./terrain.js";

export function genTerrain() {
  const s = S.seed, wv = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = at(x, y), dc = Math.hypot(x - CX, y - CY);
    wv[i] = fbm(x, y, s) + Math.max(0, 7 - dc) * 0.045;
    S.shade[i] = vnoise(x / 3, y / 3, s + 31);
  }
  const th = Array.from(wv).sort((a, b) => a - b)[Math.floor(N * 0.15)];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = at(x, y), dc = Math.hypot(x - CX, y - CY);
    if (wv[i] < th && dc > 4) S.terrain[i] = WATER;
    else S.terrain[i] = fbm(x + 50, y + 50, s + 99) > 0.6 && dc > 5 ? FOREST : GRASS;
  }
}
// District character per tile, 0 = planned grid, 1 = organic: a slow noise field plus a pull toward lakeshores and slopes.
// Growth compares it against a cutoff that rises with population (see growth.js), so the old core meanders and later
// expansion on flat land follows the grid. Recomputed from the seed and terrain, never stored.
export function computeStyle() {
  computeHeights();
  S.style = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let shore = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (inb(x + dx, y + dy) && S.terrain[at(x + dx, y + dy)] === WATER) shore = 1;
    const [lo, hi] = tileSpan(x, y), hill = Math.min(1, (hi - lo) / 0.6);
    S.style[at(x, y)] = Math.min(1, 0.9 * fbm(x * 0.6 + 300, y * 0.6 + 300, S.seed + 71) - 0.1 + 0.25 * shore + 0.45 * hill);
  }
}
export function clearForest(i) { if (S.terrain[i] === FOREST) { S.terrain[i] = GRASS; markTerrainDirty(); } }
export function setRoad(x, y, born) {
  if (!inb(x, y)) return;
  const i = at(x, y);
  if (S.terrain[i] === WATER || S.build[i]) return;
  clearForest(i);
  S.build[i] = { k: "road", born };
}
export function placeHouse(x, y, born) {
  const i = at(x, y);
  if (S.terrain[i] === WATER || S.build[i]) return;
  clearForest(i);
  S.build[i] = { k: "house", lvl: 1, hue: (Math.random() * ROOFS.length) | 0, rot: Math.random() < 0.5, born };
}
export function seedCity() {
  for (let d = -2; d <= 2; d++) { setRoad(CX + d, CY, -1e9); setRoad(CX, CY + d, -1e9); }
  for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [2, 1], [-2, -1], [1, 2], [-1, -2], [-3, 1]]) placeHouse(CX + dx, CY + dy, -1e9);
}

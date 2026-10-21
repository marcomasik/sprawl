/* ---------- map generation ---------- */
import { W, H, N, CX, CY, GRASS, WATER, FOREST, ROOFS } from "./config.js";
import { inb, at } from "./util.js";
import { vnoise, fbm } from "./noise.js";
import { S } from "./state.js";
import { markTerrainDirty } from "./render.js";

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
  for (let d = -4; d <= 4; d++) { setRoad(CX + d, CY, -1e9); setRoad(CX, CY + d, -1e9); }
  for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [2, 1], [-2, -1], [1, 2], [-1, -2], [-3, 1]]) placeHouse(CX + dx, CY + dy, -1e9);
}

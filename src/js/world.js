/* ---------- map generation ---------- */
import { W, H, N, CX, CY, GRASS, WATER, FOREST, ROOFS } from "./config.js";
import { inb, at, rnd, DIR8 } from "./util.js";
import { vnoise, fbm } from "./noise.js";
import { S, isRoad, clipped } from "./state.js";
import { markTerrainDirty } from "./render.js";
import { computeHeights, tileSpan, tileTop } from "./terrain.js";

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
// org marks a street grown organically: it may link diagonally and is drawn as a generated strip (streets.js).
export function setRoad(x, y, born, org = false) {
  if (!inb(x, y)) return;
  const i = at(x, y);
  if (S.terrain[i] === WATER || S.build[i]) return;
  clearForest(i);
  S.build[i] = { k: "road", born, org };
  // a shoreline road lifts the beach corners it touches above the water (terrain.js)
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inb(x + dx, y + dy) && S.terrain[at(x + dx, y + dy)] === WATER) { markTerrainDirty(); return; }
}
export function placeHouse(x, y, born) {
  const i = at(x, y);
  if (S.terrain[i] === WATER || S.build[i]) return;
  clearForest(i);
  S.build[i] = { k: "house", lvl: 1, hue: (Math.random() * ROOFS.length) | 0, rot: Math.random() < 0.5, born };
}
/* ---------- regional roads ---------- */
// The town is founded where regional roads meet at the map centre and every arm runs out to a map edge.
// Layouts: 40% four-way, 30% T, 20% a road straight through, 10% a single road ending in town.
const ARMS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // east, south, west, north
function pickArms() {
  const r = Math.random();
  if (r < 0.4) return [0, 1, 2, 3];
  if (r < 0.7) { const skip = (Math.random() * 4) | 0; return [0, 1, 2, 3].filter(a => a !== skip); }
  if (r < 0.9) return rnd([[0, 2], [1, 3]]);
  return [(Math.random() * 4) | 0];
}
// A land tile on the arm's map edge, up to a quarter of the map off the centre line.
function edgePoint(arm) {
  const [dx, dy] = ARMS[arm];
  for (let k = 0; k < 20; k++) {
    const off = Math.round((Math.random() - 0.5) * 0.5 * (dx ? H : W));
    const x = dx ? (dx > 0 ? W - 1 : 0) : CX + off, y = dy ? (dy > 0 ? H - 1 : 0) : CY + off;
    if (inb(x, y) && S.terrain[at(x, y)] !== WATER) return [x, y];
  }
  return null;
}
// Smallest-first binary heap of [priority, value].
function heap() {
  const a = [];
  return {
    size: () => a.length,
    push(p, v) {
      a.push([p, v]);
      for (let i = a.length - 1; i > 0;) { const j = (i - 1) >> 1; if (a[j][0] <= a[i][0]) break; [a[i], a[j]] = [a[j], a[i]]; i = j; }
    },
    pop() {
      const top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last;
        for (let i = 0; ;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < a.length && a[l][0] < a[m][0]) m = l;
          if (r < a.length && a[r][0] < a[m][0]) m = r;
          if (m === i) break;
          [a[i], a[m]] = [a[m], a[i]]; i = m;
        }
      }
      return top[1];
    },
  };
}
// A* from (sx, sy) to (tx, ty) over land, 8 directions, keeping the heading in the search state so turns can cost:
// straight is free, 45° costs a little, 90° more, sharper turns are not allowed. Climbing, forest and a gentle noise
// field add cost, the noise is what keeps arms from running ruler-straight. Arms keep their distance from each other
// outside the junction. Returns the tiles from start to target, or null.
const TURN_COST = [0, 0.35, 1.2];
function route(sx, sy, tx, ty) {
  const best = new Float32Array(N * 9).fill(Infinity), from = new Int32Array(N * 9).fill(-1), open = heap();
  const wet = (x, y) => !inb(x, y) || S.terrain[at(x, y)] === WATER;
  const start = at(sx, sy) * 9 + 8;
  best[start] = 0;
  open.push(Math.hypot(tx - sx, ty - sy), start);
  while (open.size()) {
    const st = open.pop(), i = (st / 9) | 0, dir = st % 9, x = i % W, y = (i / W) | 0;
    if (x === tx && y === ty) {
      const path = [];
      for (let s = st; s >= 0; s = from[s]) path.push([((s / 9) | 0) % W, ((s / 9) | 0) / W | 0]);
      return path.reverse();
    }
    DIR8.forEach(([dx, dy], k) => {
      const nx = x + dx, ny = y + dy;
      if (wet(nx, ny) || (dx && dy && (wet(nx, y) || wet(x, ny)))) return;
      let turn = 0;
      if (dir < 8) {
        const [px, py] = DIR8[dir];
        const step = Math.round(Math.acos(Math.max(-1, Math.min(1, (px * dx + py * dy) / Math.hypot(px, py) / Math.hypot(dx, dy)))) / (Math.PI / 4));
        if (step > 2) return;
        turn = TURN_COST[step];
      }
      const j = at(nx, ny);
      // keep clear of the arms already laid: running right beside one is near-forbidden, within two tiles costly
      let crowd = 0;
      if (Math.max(Math.abs(nx - CX), Math.abs(ny - CY)) > 2) {
        for (let ay = -2; ay <= 2; ay++) for (let ax = -2; ax <= 2; ax++) {
          if (isRoad(nx + ax, ny + ay)) crowd = Math.max(crowd, Math.max(Math.abs(ax), Math.abs(ay)) === 1 ? 20 : 6);
        }
      }
      const cost = Math.hypot(dx, dy) * (1 + (S.terrain[j] === FOREST ? 0.15 : 0) + 0.8 * fbm(nx * 1.5 + 700, ny * 1.5 + 700, S.seed + 19))
        + 6 * Math.abs(tileTop(nx, ny) - tileTop(x, y)) + turn + crowd;
      const ns = j * 9 + k, g = best[st] + cost;
      if (g >= best[ns]) return;
      best[ns] = g;
      from[ns] = st;
      open.push(g + Math.hypot(tx - nx, ty - ny), ns);
    });
  }
  return null;
}
export function seedCity() {
  setRoad(CX, CY, -1e9, true);
  for (const arm of pickArms()) {
    for (let k = 0; k < 4; k++) {
      const end = edgePoint(arm), path = end && route(CX, CY, end[0], end[1]);
      if (!path) continue;
      for (const [x, y] of path) setRoad(x, y, -1e9, true);
      break;
    }
  }
  // a handful of founding families on free tiles beside the roads near the junction
  const spots = [];
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const x = CX + dx, y = CY + dy;
    if (!inb(x, y) || S.build[at(x, y)] || S.terrain[at(x, y)] === WATER || clipped(x, y)) continue;
    if (DIR8.some(([ax, ay]) => isRoad(x + ax, y + ay))) spots.push([x, y]);
  }
  for (let k = 0; k < 9 && spots.length; k++) placeHouse(...spots.splice((Math.random() * spots.length) | 0, 1)[0], -1e9);
}

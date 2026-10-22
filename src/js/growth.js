/* ---------- growth ---------- */
import { W, H, N, CX, CY, WATER, FOREST, MAX_LVL } from "./config.js";
import { inb, at, rnd, isLat, now } from "./util.js";
import { S, isRoad, covCount, attract } from "./state.js";
import { setRoad, placeHouse } from "./world.js";
import { tileTop } from "./terrain.js";
import { hash } from "./noise.js";
import { burst, floatText } from "./effects.js";

const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]], DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const degree = (x, y) => DIR4.filter(([dx, dy]) => isRoad(x + dx, y + dy)).length;
// How organic a tile must be (S.style) to grow organic streets: nearly everywhere while the town is a village,
// only hills, shores and noise peaks once it is a city. Everything below the cutoff grows on the grid lattice.
const organicCut = () => 0.15 + 0.5 * Math.min(1, S.pop / 2000);

// Road tiles reachable from (x, y) in at most n steps along the network.
function network(x, y, n) {
  const seen = new Set([at(x, y)]);
  let front = [[x, y]];
  for (let k = 0; k < n; k++) {
    const next = [];
    for (const [fx, fy] of front) for (const [dx, dy] of DIR4) {
      if (isRoad(fx + dx, fy + dy) && !seen.has(at(fx + dx, fy + dy))) { seen.add(at(fx + dx, fy + dy)); next.push([fx + dx, fy + dy]); }
    }
    front = next;
  }
  return seen;
}
// True when no street other than the one (x, y) attaches to via (px, py) comes within r tiles. Road tiles up to
// 4 steps along the network from the attachment point count as the same street; so does a street straight ahead
// that this one is about to join.
function clearOf(x, y, px, py, r) {
  const own = network(x + px, y + py, 4);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx === -2 * px && dy === -2 * py) continue;
    if (isRoad(x + dx, y + dy) && !own.has(at(x + dx, y + dy))) return false;
  }
  return true;
}
// Weight for an organic street on (x, y), 0 if not allowed. Straight on from a dead end is likeliest, then turns,
// loops and side branches. No other street may come within 2 tiles (so blocks are at least two houses deep), except
// one straight ahead that this street is about to join; streets never form 2×2 squares and avoid climbing.
function organicRoad(x, y) {
  const r4 = DIR4.filter(([dx, dy]) => isRoad(x + dx, y + dy));
  if (!r4.length || r4.length > 2) return 0;
  for (const [sx, sy] of DIAG) if (isRoad(x + sx, y) && isRoad(x, y + sy) && isRoad(x + sx, y + sy)) return 0;
  const [px, py] = r4[0];
  let w;
  if (r4.length === 2) w = 0.5;
  else {
    if (!clearOf(x, y, px, py, 2)) return 0;
    const deg = degree(x + px, y + py);
    if (deg === 0) w = 0.5;
    else if (deg === 1) w = isRoad(x + 2 * px, y + 2 * py) ? 0.75 : 0.45;
    else if (deg === 2) w = 0.2;
    else return 0;
  }
  return w * Math.exp(-3 * Math.abs(tileTop(x, y) - tileTop(x + px, y + py)));
}
// Organic tiles kept free of houses so streets can carry on: the tile straight ahead of a dead end, and a fixed
// ~40% of the spots where a street could turn or branch (picked by hash, so the choice is stable per tile).
function aheadOfDeadEnd(x, y) {
  return DIR4.some(([dx, dy]) => isRoad(x + dx, y + dy) && degree(x + dx, y + dy) === 1 && isRoad(x + 2 * dx, y + 2 * dy));
}

export function growStep() {
  const hc = [], rc = [], shape = [], t = now(), cut = organicCut();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = at(x, y);
    if (S.build[i] || S.terrain[i] === WATER || S.needs.some(n => n.x === x && n.y === y)) continue;
    if (S.style[i] > cut) {
      const w = organicRoad(x, y);
      if (w > 0) { rc.push(i); shape.push(w); }
      if (aheadOfDeadEnd(x, y) || (w > 0 && hash(x, y, S.seed + 13) < 0.4)) continue;
    } else if (isLat(x, y)) {
      const p = DIR4.find(([dx, dy]) => isRoad(x + dx, y + dy));
      if (p && clearOf(x, y, p[0], p[1], 1)) { rc.push(i); shape.push(1); }
      continue;
    }
    let road = false, full = true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (isRoad(x + dx, y + dy)) road = true;
      const nb = inb(x + dx, y + dy) ? S.build[at(x + dx, y + dy)] : null;
      if (!nb || nb.k === "road") full = false;
    }
    if (road) hc.push(i);
    else if (full) S.build[i] = { k: "park", born: t };
  }
  let list = hc.length && (!rc.length || Math.random() < 0.7) ? hc : rc;
  if (!list.length) return;
  let tot = 0;
  const w = list.map((i, k) => {
    const x = i % W, y = (i / W) | 0;
    let s = 0.04 + attract(x, y) + 0.35 * Math.exp(-Math.hypot(x - CX, y - CY) / 7) + 0.06 * covCount(i) - (S.terrain[i] === FOREST ? 0.03 : 0);
    s = Math.max(0.005, s);
    s = s * s * (0.6 + 0.8 * Math.random()) * (list === rc ? shape[k] : 1);
    tot += s;
    return s;
  });
  let r = Math.random() * tot, k = 0;
  while (k < list.length - 1 && (r -= w[k]) > 0) k++;
  const i = list[k], x = i % W, y = (i / W) | 0;
  if (list === hc) placeHouse(x, y, t); else setRoad(x, y, t);
}
// Each service type covering a house is worth one level; houses climb (or drop) one level at a time toward that.
export function upgradeStep() {
  const hs = [];
  for (let i = 0; i < N; i++) if (S.build[i] && S.build[i].k === "house") hs.push(i);
  for (let n = 0; n < Math.min(16, hs.length); n++) {
    const i = rnd(hs), b = S.build[i], x = i % W, y = (i / W) | 0;
    const target = Math.min(MAX_LVL, 1 + covCount(i));
    if (b.lvl < target && S.mood >= 35 && Math.random() < 0.6) {
      b.lvl++; b.born = now();
      burst(x, y, "#fff4d6", 5);
      floatText(x, y, "▲", "#7cc68d");
    } else if (b.lvl > target && Math.random() < 0.12) { b.lvl--; b.born = now(); }
  }
}

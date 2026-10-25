/* ---------- growth ---------- */
import { W, H, N, CX, CY, WATER, FOREST, MAX_LVL } from "./config.js";
import { inb, at, rnd, isLat, now, DIR8 } from "./util.js";
import { S, isRoad, isOrgRoad, roadLinks, clipped, covCount, attract } from "./state.js";
import { setRoad, placeHouse } from "./world.js";
import { tileTop } from "./terrain.js";
import { hash } from "./noise.js";
import { burst, floatText } from "./effects.js";

const DIR4 = DIR8.slice(0, 4), DIAG = DIR8.slice(4);
// How organic a tile must be (S.style) to grow organic streets: nearly everywhere while the town is a village,
// only hills, shores and noise peaks once it is a city. Everything below the cutoff grows on the grid lattice.
const organicCut = () => 0.15 + 0.5 * Math.min(1, S.pop / 2000);

// Road tiles reachable from (x, y) in at most n steps along the network.
function network(x, y, n) {
  const seen = new Set([at(x, y)]);
  let front = [[x, y]];
  for (let k = 0; k < n; k++) {
    const next = [];
    for (const [fx, fy] of front) for (const [dx, dy] of roadLinks(fx, fy)) {
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
// A new organic street on (x, y) may link diagonally to organic street (x+dx, y+dy) when the two tiles it would cut
// across are still empty land.
function diagonalOk(x, y, dx, dy) {
  const free = (fx, fy) => inb(fx, fy) && !S.build[at(fx, fy)] && S.terrain[at(fx, fy)] !== WATER;
  return isOrgRoad(x + dx, y + dy) && free(x + dx, y) && free(x, y + dy);
}
// Weight by how sharply the street turns on its way from Q through P to the new tile: straight on is likeliest,
// then 45° and 90° turns; sharper turns are not allowed.
const TURN = [0.8, 0.3, 0.15];
// Weight for an organic street on (x, y), 0 if not allowed. It attaches orthogonally to any street or diagonally to an
// organic one. Dead ends carry on (straight, 45°, 90°), streets also loop, join and branch. No other street may come
// within 2 tiles (so blocks are at least two houses deep) except one straight ahead that this street is about to join;
// streets never form 2×2 squares, never take a tile a diagonal street cuts across, and avoid climbing.
function organicRoad(x, y) {
  if (clipped(x, y)) return 0;
  const parents = DIR8.filter(([dx, dy]) => (dx && dy) ? diagonalOk(x, y, dx, dy) : isRoad(x + dx, y + dy));
  if (!parents.length || parents.length > 2) return 0;
  for (const [sx, sy] of DIAG) if (isRoad(x + sx, y) && isRoad(x, y + sy) && isRoad(x + sx, y + sy)) return 0;
  // the new street leaves each parent tile in direction -(px, py); within 45° of a street that parent already has,
  // the two would leave a sliver of grass between them
  for (const [px, py] of parents) {
    if (roadLinks(x + px, y + py).some(([lx, ly]) => -(lx * px + ly * py) / Math.hypot(lx, ly) / Math.hypot(px, py) > 0.5)) return 0;
  }
  const [px, py] = parents[0];
  let w;
  if (parents.length === 2) {
    // closing a loop: only around a real block, not when the two streets already meet within 8 steps
    if (network(x + px, y + py, 8).has(at(x + parents[1][0], y + parents[1][1]))) return 0;
    w = 0.5;
  } else {
    if (!clearOf(x, y, px, py, 2)) return 0;
    const links = roadLinks(x + px, y + py);
    if (!links.length) w = 0.5;
    else if (links.length === 1) {
      // incoming direction Q→P is -links[0], outgoing P→new is -(px, py); 45° steps between them
      const [qx, qy] = links[0];
      const cos = (qx * px + qy * py) / Math.hypot(qx, qy) / Math.hypot(px, py);
      w = TURN[Math.round(Math.acos(Math.max(-1, Math.min(1, cos))) / (Math.PI / 4))] ?? 0;
    } else if (links.length === 2) w = 0.15;
    else return 0;
    if (px && py) w *= 0.9;
  }
  return w * Math.exp(-3 * Math.abs(tileTop(x, y) - tileTop(x + px, y + py)));
}
// Organic tiles kept free of houses so streets can carry on: every tile an organic dead end could grow into next
// (and, for a diagonal step, the two tiles it would cut across), plus a fixed ~40% of the spots where a street could
// turn or branch (picked by hash, so the choice is stable per tile).
function streetReserve() {
  const keep = new Set();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!isOrgRoad(x, y) || roadLinks(x, y).length !== 1) continue;
    for (const [dx, dy] of DIR8) {
      if (!inb(x + dx, y + dy) || S.build[at(x + dx, y + dy)] || organicRoad(x + dx, y + dy) <= 0) continue;
      keep.add(at(x + dx, y + dy));
      if (dx && dy) { keep.add(at(x + dx, y)); keep.add(at(x, y + dy)); }
    }
  }
  return keep;
}

// Distance (Chebyshev, capped at 9) from each tile to the nearest house or service. The town only grows next to what
// is already built (houses within 2 tiles, new streets within 3), so it spreads outward along the regional roads
// instead of popping up along them at the map edges. A service the player builds out there can start a neighbourhood.
function townDistance() {
  const d = new Uint8Array(N).fill(9);
  for (let i = 0; i < N; i++) {
    const b = S.build[i];
    if (!b || (b.k !== "house" && b.k !== "svc")) continue;
    const x = i % W, y = (i / W) | 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      if (inb(x + dx, y + dy)) { const j = at(x + dx, y + dy); d[j] = Math.min(d[j], Math.max(Math.abs(dx), Math.abs(dy))); }
    }
  }
  return d;
}

export function growStep() {
  const hc = [], rc = [], shape = [], org = new Set(), t = now(), cut = organicCut(), keep = streetReserve(), near = townDistance();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = at(x, y);
    if (S.build[i] || S.terrain[i] === WATER || S.needs.some(n => n.x === x && n.y === y)) continue;
    if (S.style[i] > cut) {
      const w = near[i] <= 3 ? organicRoad(x, y) : 0;
      if (w > 0) { rc.push(i); shape.push(w); org.add(i); }
      if (keep.has(i) || (w > 0 && hash(x, y, S.seed + 13) < 0.4)) continue;
    } else if (isLat(x, y)) {
      const p = DIR4.find(([dx, dy]) => isRoad(x + dx, y + dy));
      if (p && near[i] <= 3 && !clipped(x, y) && clearOf(x, y, p[0], p[1], 1)) { rc.push(i); shape.push(1); }
      continue;
    }
    if (clipped(x, y)) continue;
    let road = false, full = true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (isRoad(x + dx, y + dy)) road = true;
      const nb = inb(x + dx, y + dy) ? S.build[at(x + dx, y + dy)] : null;
      if (!nb || nb.k === "road") full = false;
    }
    if (road && near[i] <= 2) hc.push(i);
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
  if (list === hc) placeHouse(x, y, t); else setRoad(x, y, t, org.has(i));
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

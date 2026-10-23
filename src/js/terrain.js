/* ---------- terrain relief ---------- */
// Visual only: heights live on tile corners, (W+1) x (H+1), and never feed back into the simulation.
// Water level is y = 0; lake beds sit below it, land above it. Corner (cx, cy) is world (cx - W/2, h, cy - H/2).
import * as THREE from "three";
import { W, H, N, CX, CY, WATER, FOREST } from "./config.js";
import { inb, at, mix } from "./util.js";
import { fbm } from "./noise.js";
import { S } from "./state.js";

const CW = W + 1, CN = CW * (H + 1);
const heights = new Float32Array(CN), normals = new Float32Array(CN * 3);
const SKIRT = -1.4;

export const cornerH = (cx, cy) => heights[Math.max(0, Math.min(H, cy)) * CW + Math.max(0, Math.min(W, cx))];
// Bilinear height at a point in tile units (0..W, 0..H).
export function hAt(px, py) {
  const x = Math.max(0, Math.min(W - 1e-6, px)), y = Math.max(0, Math.min(H - 1e-6, py));
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const a = cornerH(ix, iy), b = cornerH(ix + 1, iy), c = cornerH(ix, iy + 1), d = cornerH(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
export const tileTop = (x, y) => hAt(x + 0.5, y + 0.5);
export function tileSpan(x, y) {
  const hs = [cornerH(x, y), cornerH(x + 1, y), cornerH(x, y + 1), cornerH(x + 1, y + 1)];
  return [Math.min(...hs), Math.max(...hs)];
}
export function cornerNormal(cx, cy, out) {
  const i = (Math.max(0, Math.min(H, cy)) * CW + Math.max(0, Math.min(W, cx))) * 3;
  return out.set(normals[i], normals[i + 1], normals[i + 2]);
}

// Multi-source BFS: steps from every tile to the nearest tile matching isSource.
function distanceTo(isSource) {
  const d = new Int16Array(N).fill(999), q = [];
  for (let i = 0; i < N; i++) if (isSource(i)) { d[i] = 0; q.push(i); }
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!inb(x + dx, y + dy)) continue;
      const j = at(x + dx, y + dy);
      if (d[j] > d[i] + 1) { d[j] = d[i] + 1; q.push(j); }
    }
  }
  return d;
}
export function computeHeights() {
  const toWater = distanceTo(i => S.terrain[i] === WATER), toLand = distanceTo(i => S.terrain[i] !== WATER);
  for (let cy = 0; cy <= H; cy++) for (let cx = 0; cx <= W; cx++) {
    let land = 0, water = 0, dW = 999, dL = 999, road = false;
    for (const [tx, ty] of [[cx - 1, cy - 1], [cx, cy - 1], [cx - 1, cy], [cx, cy]]) {
      if (!inb(tx, ty)) continue;
      const i = at(tx, ty);
      if (S.terrain[i] === WATER) { water++; dL = Math.min(dL, toLand[i]); } else { land++; dW = Math.min(dW, toWater[i]); }
      if (S.build[i]?.k === "road") road = true;
    }
    let h;
    if (!land) h = -0.25 - 0.16 * Math.min(4, dL);
    // beaches dip just under the water line, except where a road runs along the shore
    else if (water) h = road ? 0.04 : -0.12;
    else {
      // flat around the founding crossroads and along shores, rolling hills further out
      const out = Math.min(1, Math.max(0, (Math.hypot(cx - CX, cy - CY) - 6) / 14));
      h = 0.1 + 4.2 * out * Math.min(1, dW / 4) * Math.pow(fbm(cx * 1.3 + 200, cy * 1.3 + 200, S.seed + 57), 1.6);
    }
    heights[cy * CW + cx] = h;
  }
  const v = new THREE.Vector3();
  for (let cy = 0; cy <= H; cy++) for (let cx = 0; cx <= W; cx++) {
    v.set(cornerH(cx - 1, cy) - cornerH(cx + 1, cy), 2, cornerH(cx, cy - 1) - cornerH(cx, cy + 1)).normalize();
    normals.set([v.x, v.y, v.z], (cy * CW + cx) * 3);
  }
}

const rock = new THREE.Color("#8c8a72"), c = new THREE.Color(), n = new THREE.Vector3();
function tileColor(x, y) {
  const i = at(x, y), sh = S.shade[i], t = S.terrain[i];
  if (t === WATER) {
    let deep = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inb(x + dx, y + dy) && S.terrain[at(x + dx, y + dy)] === WATER) deep++;
    return c.set(mix("#c2b283", "#3f5f63", Math.min(1, deep / 9 * 0.8 + sh * 0.2)));
  }
  let shore = false;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inb(x + dx, y + dy) && S.terrain[at(x + dx, y + dy)] === WATER) shore = true;
  c.set(shore ? mix("#d7c995", "#c8b97f", sh) : t === FOREST ? mix("#6f9d5c", "#628f50", sh) : mix("#8dba73", "#78a862", sh));
  const [lo, hi] = tileSpan(x, y);
  return c.lerp(rock, Math.min(0.55, Math.max(0, (hi - lo - 0.35) * 0.9)));
}
// One quad per tile with that tile's flat colour and smooth normals from the heightmap; uv spans the whole map
// (0..1 over W × H tiles) for the painted road texture.
export function groundGeometry() {
  const p = [], nm = [], cl = [], uv = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    tileColor(x, y);
    for (const [cx, cy] of [[x, y], [x, y + 1], [x + 1, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) {
      p.push(cx - W / 2, cornerH(cx, cy), cy - H / 2);
      cornerNormal(cx, cy, n);
      nm.push(n.x, n.y, n.z);
      cl.push(c.r, c.g, c.b);
      uv.push(cx / W, cy / H);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nm, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(cl, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
// Earth walls around the map edge, from the surface (or water line) down to the skirt depth.
export function skirtGeometry() {
  const p = [];
  const wall = (ax, ay, bx, by) => {
    const ta = Math.max(0, cornerH(ax, ay)), tb = Math.max(0, cornerH(bx, by));
    const x0 = ax - W / 2, z0 = ay - H / 2, x1 = bx - W / 2, z1 = by - H / 2;
    p.push(x0, ta, z0, x0, SKIRT, z0, x1, tb, z1, x1, tb, z1, x0, SKIRT, z0, x1, SKIRT, z1);
  };
  for (let x = 0; x < W; x++) { wall(x, 0, x + 1, 0); wall(x + 1, H, x, H); }
  for (let y = 0; y < H; y++) { wall(0, y + 1, 0, y); wall(W, y, W, y + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

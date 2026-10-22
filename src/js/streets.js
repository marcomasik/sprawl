/* ---------- organic streets ---------- */
// Organic road tiles are drawn as one generated mesh instead of Kenney pieces. Each tile gets a curve from its centre
// to the edge (or, for a diagonal link, the corner) it shares with every linked neighbour; neighbours meet there with
// the same position and heading, so a street bends smoothly through 45° and 90° turns. The cross-section copies
// Kenney's road, so organic streets join grid pieces without a seam.
import * as THREE from "three";
import { W, H } from "./config.js";
import { S, isOrgRoad, roadLinks } from "./state.js";
import { hAt } from "./terrain.js";

const SIDEWALK = new THREE.Color("#bdc6ee"), GUTTER = new THREE.Color("#515566");
const ASPHALT = new THREE.Color("#666b80"), LINE = new THREE.Color("#8e95b3");
// [from, to, lift, colour]: offsets across the street from its centre line, in tiles
const BANDS = [
  [-0.5, -0.4, 0.03, SIDEWALK], [0.4, 0.5, 0.03, SIDEWALK],
  [-0.4, -0.3, 0.02, GUTTER], [0.3, 0.4, 0.02, GUTTER],
  [-0.3, 0.3, 0.02, ASPHALT], [-0.015, 0.015, 0.022, LINE],
];
const STEPS = 8;

let pos, col;
function vert(px, pz, lift, c) {
  pos.push(px - W / 2, Math.max(0, hAt(px, pz)) + lift, pz - H / 2);
  col.push(c.r, c.g, c.b);
}
// Emits triangle a, b, c (tile-unit [x, z] points) wound to face up, whichever way the caller walked around it.
function tri(a, b, c, lift, colour) {
  if ((b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) < 0) [b, c] = [c, b];
  for (const [px, pz] of [a, b, c]) vert(px, pz, lift, colour);
}
// Extrudes the bands along samples [x, z, tangentX, tangentZ] (tile units, unit tangents).
function ribbon(samples, bands = BANDS) {
  for (const [o1, o2, lift, c] of bands) {
    for (let k = 0; k < samples.length - 1; k++) {
      const [ax, az, atx, atz] = samples[k], [bx, bz, btx, btz] = samples[k + 1];
      const a1 = [ax - atz * o1, az + atx * o1], a2 = [ax - atz * o2, az + atx * o2];
      const b1 = [bx - btz * o1, bz + btx * o1], b2 = [bx - btz * o2, bz + btx * o2];
      tri(a1, a2, b2, lift, c);
      tri(a1, b2, b1, lift, c);
    }
  }
}
// Quadratic Bézier from a through control point c to b.
function curve(a, c, b) {
  const out = [];
  for (let k = 0; k <= STEPS; k++) {
    const t = k / STEPS, u = 1 - t;
    const x = u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], z = u * u * a[1] + 2 * u * t * c[1] + t * t * b[1];
    let tx = 2 * u * (c[0] - a[0]) + 2 * t * (b[0] - c[0]), tz = 2 * u * (c[1] - a[1]) + 2 * t * (b[1] - c[1]);
    const l = Math.hypot(tx, tz) || 1;
    out.push([x, z, tx / l, tz / l]);
  }
  return out;
}
const line = (a, b) => curve(a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b);
// Ring sector around (cx, cz) between radii r0 and r1 and angles a0..a1, flat on the terrain.
function sector(cx, cz, r0, r1, a0, a1, lift, c) {
  const n = 12;
  for (let k = 0; k < n; k++) {
    const p = a0 + (a1 - a0) * k / n, q = a0 + (a1 - a0) * (k + 1) / n;
    const i0 = [cx + Math.cos(p) * r0, cz + Math.sin(p) * r0], i1 = [cx + Math.cos(q) * r0, cz + Math.sin(q) * r0];
    const o0 = [cx + Math.cos(p) * r1, cz + Math.sin(p) * r1], o1 = [cx + Math.cos(q) * r1, cz + Math.sin(q) * r1];
    tri(i0, o0, o1, lift, c);
    tri(i0, o1, i1, lift, c);
  }
}

export function streetGeometry() {
  pos = []; col = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!isOrgRoad(x, y)) continue;
    const c = [x + 0.5, y + 0.5], links = roadLinks(x, y);
    const ends = links.map(([dx, dy]) => [c[0] + dx * 0.5, c[1] + dy * 0.5]);
    if (links.length === 2) ribbon(curve(ends[0], c, ends[1]));
    else if (links.length === 1) {
      // dead end: run to the centre, then round it off with a cul-de-sac facing away from the street
      ribbon(line(ends[0], c));
      const away = Math.atan2(-links[0][1], -links[0][0]);
      sector(c[0], c[1], 0, 0.4, away - Math.PI / 2, away + Math.PI / 2, 0.02, ASPHALT);
      sector(c[0], c[1], 0.3, 0.4, away - Math.PI / 2, away + Math.PI / 2, 0.021, GUTTER);
      sector(c[0], c[1], 0.4, 0.5, away - Math.PI / 2, away + Math.PI / 2, 0.03, SIDEWALK);
    } else if (!links.length) {
      sector(c[0], c[1], 0, 0.4, 0, Math.PI * 2, 0.02, ASPHALT);
      sector(c[0], c[1], 0.4, 0.5, 0, Math.PI * 2, 0.03, SIDEWALK);
    } else {
      // junction: an open asphalt disc in the middle, each arm with its own sidewalks out to the edge
      sector(c[0], c[1], 0, 0.42, 0, Math.PI * 2, 0.021, ASPHALT);
      links.forEach(([dx, dy], k) => {
        const l = Math.hypot(dx, dy);
        ribbon(line([c[0] + dx / l * 0.4, c[1] + dy / l * 0.4], ends[k]));
      });
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

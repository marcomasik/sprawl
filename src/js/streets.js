/* ---------- streets ---------- */
// All roads are painted into one texture that lies on the terrain mesh itself (render.js), so they follow every
// slope exactly. Each road tile strokes a path from its centre to the edge (or, for a diagonal link, the corner) it
// shares with each linked neighbour; two-way tiles curve through the centre. Layers are stroked across all tiles
// in turn (curb, sidewalk, gutter, asphalt) with round caps and joins, so junctions merge into one surface with
// rounded sidewalk corners. Colours and proportions follow Kenney's road kit.
import { W, H } from "./config.js";
import { isRoad, roadLinks } from "./state.js";

export const PX = 64; // texture pixels per tile
// [width in tiles, colour], widest first
const LAYERS = [[1.04, "#7d829c"], [1, "#bdc6ee"], [0.8, "#515566"], [0.6, "#666b80"]];
const LINE = "#8e95b3";

export function paintStreets(g) {
  g.clearRect(0, 0, W * PX, H * PX);
  g.lineCap = g.lineJoin = "round";
  const paths = [], lines = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!isRoad(x, y)) continue;
    const cx = (x + 0.5) * PX, cy = (y + 0.5) * PX, links = roadLinks(x, y), p = new Path2D();
    const ends = links.map(([dx, dy]) => [cx + dx * PX / 2, cy + dy * PX / 2]);
    if (links.length === 2) { p.moveTo(...ends[0]); p.quadraticCurveTo(cx, cy, ...ends[1]); }
    else if (!links.length) { p.moveTo(cx, cy); p.lineTo(cx, cy); }
    else for (const e of ends) { p.moveTo(cx, cy); p.lineTo(...e); }
    paths.push(p);
    // centre line on plain street tiles only, junctions stay clear
    if (links.length && links.length <= 2) lines.push(p);
  }
  for (const [w, colour] of LAYERS) {
    g.lineWidth = w * PX;
    g.strokeStyle = colour;
    for (const p of paths) g.stroke(p);
  }
  g.lineWidth = 0.03 * PX;
  g.strokeStyle = LINE;
  g.setLineDash([0.14 * PX, 0.12 * PX]);
  for (const p of lines) g.stroke(p);
  g.setLineDash([]);
}

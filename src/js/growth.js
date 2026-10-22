/* ---------- growth ---------- */
import { W, H, N, CX, CY, WATER, FOREST, MAX_LVL } from "./config.js";
import { inb, at, rnd, isLat, now } from "./util.js";
import { S, isRoad, covCount, attract } from "./state.js";
import { setRoad, placeHouse } from "./world.js";
import { burst, floatText } from "./effects.js";

export function growStep() {
  const hc = [], rc = [], t = now();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = at(x, y);
    if (S.build[i] || S.terrain[i] === WATER || S.needs.some(n => n.x === x && n.y === y)) continue;
    if (isLat(x, y)) {
      if (isRoad(x + 1, y) || isRoad(x - 1, y) || isRoad(x, y + 1) || isRoad(x, y - 1)) rc.push(i);
    } else {
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
  }
  let list = hc.length && (!rc.length || Math.random() < 0.7) ? hc : rc;
  if (!list.length) return;
  let tot = 0;
  const w = list.map(i => {
    const x = i % W, y = (i / W) | 0;
    let s = 0.04 + attract(x, y) + 0.35 * Math.exp(-Math.hypot(x - CX, y - CY) / 7) + 0.06 * covCount(i) - (S.terrain[i] === FOREST ? 0.03 : 0);
    s = Math.max(0.005, s);
    s = s * s * (0.6 + 0.8 * Math.random());
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

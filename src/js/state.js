/* ---------- state ---------- */
// S is only reassigned here (newState, restore); other modules read it through the live import binding.
import { W, N, SVC, TYPES, POP } from "./config.js";
import { inb, at, DIR8 } from "./util.js";
import { genTerrain, seedCity, computeStyle } from "./world.js";
import { pushLog, renderLog } from "./ui.js";
import { markTerrainDirty } from "./render.js";

export let S = null;

export function newState(seed) {
  S = {
    seed, terrain: new Uint8Array(N), shade: new Float32Array(N), build: new Array(N).fill(null),
    needs: [], attr: [], coins: 120, mood: 70, time: 0, nextNeed: 4, growT: 0, econT: 0, leaveT: 0,
    nid: 1, rankIdx: 0, unlocked: new Set(["water", "food"]), peak: 0, paused: true, speed: 1, log: [], started: false,
  };
  genTerrain();
  computeStyle();
  seedCity();
  recalc();
  pushLog("A handful of families settle at the crossroads.", null);
  markTerrainDirty();
}
export const isRoad = (x, y) => inb(x, y) && S.build[at(x, y)] && S.build[at(x, y)].k === "road";
export const isOrgRoad = (x, y) => isRoad(x, y) && !!S.build[at(x, y)].org;
// Offsets of the roads (x, y) connects to: every orthogonal road, plus a diagonal one when both tiles are organic
// streets and neither tile between them is a road (otherwise the street runs through that tile instead).
export function roadLinks(x, y) {
  return DIR8.filter(([dx, dy]) => isRoad(x + dx, y + dy) &&
    (!dx || !dy || (isOrgRoad(x, y) && isOrgRoad(x + dx, y + dy) && !isRoad(x + dx, y) && !isRoad(x, y + dy))));
}
// A free tile that a diagonal street cuts across at one corner. It stays free of buildings and roads.
export function clipped(x, y) {
  if (isRoad(x, y)) return false;
  for (const [sx, sy] of DIR8) if (sx && sy && isOrgRoad(x + sx, y) && isOrgRoad(x, y + sy) && !isRoad(x + sx, y + sy)) return true;
  return false;
}
export function recalc() {
  S.cov = {};
  for (const t of TYPES) S.cov[t] = new Uint8Array(N);
  S.svcList = [];
  let pop = 0;
  for (let i = 0; i < N; i++) {
    const b = S.build[i];
    if (!b) continue;
    if (b.k === "house") pop += POP[b.lvl];
    else if (b.k === "svc") {
      const x = i % W, y = (i / W) | 0, r = SVC[b.type].r;
      S.svcList.push({ x, y });
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
        if (dx * dx + dy * dy <= r * r && inb(x + dx, y + dy)) S.cov[b.type][at(x + dx, y + dy)] = 1;
    }
  }
  S.pop = pop;
  S.peak = Math.max(S.peak, pop);
}
export function covCount(i) { let c = 0; for (const t of TYPES) if (S.cov[t][i]) c++; return c; }
export function attract(x, y) {
  let a = 0;
  for (const t of S.attr) a += t.s * Math.exp(-Math.hypot(x - t.x, y - t.y) / 7);
  for (const b of S.svcList) a += 0.22 * Math.exp(-Math.hypot(x - b.x, y - b.y) / 5);
  return a;
}

/* ---------- snapshot for live updates ---------- */
export function serialize() {
  return {
    seed: S.seed, terrain: Array.from(S.terrain), shade: Array.from(S.shade), build: S.build, needs: S.needs, attr: S.attr,
    coins: S.coins, mood: S.mood, time: S.time, nextNeed: S.nextNeed, nid: S.nid, rankIdx: S.rankIdx,
    unlocked: [...S.unlocked], peak: S.peak, paused: S.paused, speed: S.speed, log: S.log, started: S.started,
  };
}
export function restore(d) {
  S = Object.assign({}, d, {
    terrain: Uint8Array.from(d.terrain), shade: Float32Array.from(d.shade), unlocked: new Set(d.unlocked),
    growT: 0, econT: 0, leaveT: 0,
  });
  for (const b of S.build) if (b) b.born = -1e9;
  computeStyle();
  recalc();
  renderLog();
  markTerrainDirty();
}

/* ---------- needs ---------- */
import { W, N, CX, CY, WATER, SVC, TYPES } from "./config.js";
import { inb, at, rnd, compass } from "./util.js";
import { S, recalc } from "./state.js";
import { burst, floatText } from "./effects.js";
import { pushLog } from "./ui.js";

export function spawnNeed() {
  const maxN = Math.min(5, 2 + Math.floor(S.pop / 250));
  if (S.needs.length >= maxN) return;
  const types = TYPES.filter(t => S.unlocked.has(t));
  const houses = [];
  for (let i = 0; i < N; i++) if (S.build[i] && S.build[i].k === "house") {
    const x = i % W, y = (i / W) | 0;
    houses.push({ x, y, d: Math.hypot(x - CX, y - CY) });
  }
  if (!houses.length) return;
  houses.sort((a, b) => b.d - a.d);
  const outer = houses.slice(0, Math.max(3, Math.ceil(houses.length * 0.35)));
  for (let tries = 0; tries < 30; tries++) {
    const h = rnd(outer);
    const ang = (h.d < 0.5 ? Math.random() * Math.PI * 2 : Math.atan2(h.y - CY, h.x - CX)) + (Math.random() - 0.5) * 1.3;
    const dist = 2 + Math.random() * 3;
    const x = Math.round(h.x + Math.cos(ang) * dist), y = Math.round(h.y + Math.sin(ang) * dist);
    if (!inb(x, y)) continue;
    const i = at(x, y);
    if (S.terrain[i] === WATER || S.build[i]) continue;
    if (S.needs.some(n => Math.hypot(n.x - x, n.y - y) < 5)) continue;
    const hi = at(h.x, h.y);
    const lacking = types.filter(t => !S.cov[t][hi] && !S.cov[t][i]);
    if (!lacking.length) continue;
    const type = rnd(lacking);
    const life = Math.max(24, 44 - S.pop / 70);
    S.needs.push({ id: S.nid++, x, y, type, age: 0, life });
    pushLog(`${SVC[type].need} wanted ${compass(x, y)}.`, type);
    return;
  }
}
export function solveNeed(n) {
  const frac = 1 - n.age / n.life, reward = Math.round(12 + frac * 24);
  S.coins += reward;
  S.mood = Math.min(100, S.mood + 6);
  S.attr.push({ x: n.x, y: n.y, s: 1.4 });
  floatText(n.x, n.y, `+${reward}`, "#f0b44c");
  burst(n.x, n.y, SVC[n.type].color, 16);
  pushLog(`${SVC[n.type].need} delivered ${compass(n.x, n.y)}. The town reaches toward it.`, n.type);
}
export function expireNeed(n) {
  S.mood = Math.max(0, S.mood - 10);
  S.attr.push({ x: n.x, y: n.y, s: -0.6 });
  const hs = [];
  for (let i = 0; i < N; i++) if (S.build[i] && S.build[i].k === "house") {
    const x = i % W, y = (i / W) | 0, d = Math.hypot(x - n.x, y - n.y);
    if (d <= 6) hs.push({ i, d, x, y });
  }
  hs.sort((a, b) => a.d - b.d);
  const gone = hs.slice(0, 2);
  for (const h of gone) { S.build[h.i] = null; burst(h.x, h.y, "#9a9384", 8); }
  recalc();
  const fam = gone.length === 1 ? "One family left." : gone.length ? `${gone.length} families left.` : "";
  pushLog(`Nobody answered the ${SVC[n.type].need.toLowerCase()} request ${compass(n.x, n.y)}. ${fam}`, "bad");
}

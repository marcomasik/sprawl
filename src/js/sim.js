/* ---------- simulation ---------- */
import { W, N, SVC, TYPES, RANKS } from "./config.js";
import { rnd } from "./util.js";
import { S, recalc } from "./state.js";
import { growStep, upgradeStep } from "./growth.js";
import { spawnNeed, expireNeed } from "./needs.js";
import { burst } from "./effects.js";
import { pushLog, toast, buildTools, saveBest } from "./ui.js";

export function step(dt) {
  S.time += dt;
  for (const n of S.needs) n.age += dt;
  const expired = S.needs.filter(n => n.age >= n.life);
  if (expired.length) { S.needs = S.needs.filter(n => n.age < n.life); expired.forEach(expireNeed); }

  S.econT += dt;
  while (S.econT >= 1) {
    S.econT -= 1;
    S.coins += income();
    if (S.mood < 72) S.mood = Math.min(72, S.mood + 0.12);
    for (const n of S.needs) if (n.age > n.life / 2) S.mood = Math.max(0, S.mood - 0.05);
  }

  S.growT += dt;
  while (S.growT >= 0.7) {
    S.growT -= 0.7;
    const chance = S.mood < 20 ? 0.1 : 0.35 + S.mood / 100 * 0.65;
    const steps = Math.min(4, 1 + Math.floor(S.pop / 400) + (S.mood > 65 ? 1 : 0));
    for (let k = 0; k < steps; k++) if (Math.random() < chance) growStep();
    upgradeStep();
    for (const a of S.attr) a.s *= 0.99;
    S.attr = S.attr.filter(a => Math.abs(a.s) > 0.05);
    recalc();
    checkProgress();
  }

  S.nextNeed -= dt;
  if (S.nextNeed <= 0) {
    spawnNeed();
    S.nextNeed = Math.max(6, 15 - S.pop / 120) * (0.75 + Math.random() * 0.5);
  }

  if (S.mood < 12) {
    S.leaveT += dt;
    if (S.leaveT > 4) {
      S.leaveT = 0;
      const hs = [];
      for (let i = 0; i < N; i++) if (S.build[i] && S.build[i].k === "house") hs.push(i);
      if (hs.length > 3) {
        const i = rnd(hs);
        S.build[i] = null;
        burst(i % W, (i / W) | 0, "#9a9384", 8);
        recalc();
        if (Math.random() < 0.4) pushLog("Morale is low. Families are packing up.", "bad");
      }
    }
  } else S.leaveT = 0;
}
export const income = () => 0.5 + S.pop * 0.035;
function checkProgress() {
  for (const t of TYPES) if (!S.unlocked.has(t) && S.pop >= SVC[t].unlock) {
    S.unlocked.add(t);
    toast(`${SVC[t].name} unlocked`);
    pushLog(`The town now asks for ${SVC[t].need.toLowerCase()}. ${SVC[t].name} unlocked.`, t);
    buildTools();
  }
  let r = 0;
  for (let k = 0; k < RANKS.length; k++) if (S.peak >= RANKS[k][0]) r = k;
  if (r > S.rankIdx) {
    S.rankIdx = r;
    toast(`Your settlement is now a ${RANKS[r][1].toLowerCase()}`);
    pushLog(`The settlement is now a ${RANKS[r][1].toLowerCase()}.`, null);
  }
  saveBest();
}

/* ---------- player actions ---------- */
import { WATER, SVC, SOLVE_R } from "./config.js";
import { inb, at, compass, now } from "./util.js";
import { S, recalc, clipped } from "./state.js";
import { clearForest } from "./world.js";
import { solveNeed } from "./needs.js";
import { burst, floatText } from "./effects.js";
import { tool, toast, pushLog } from "./ui.js";

export function canPlace(x, y, t) {
  if (!inb(x, y)) return "Off the map";
  const i = at(x, y), b = S.build[i];
  if (t === "clear") return b && b.k !== "road" ? null : "Nothing to clear here";
  if (!S.unlocked.has(t)) return `Unlocks at ${SVC[t].unlock} people`;
  if (S.terrain[i] === WATER) return "You can't build on water";
  if (clipped(x, y)) return "A street runs across this corner";
  if (b) return "That tile is taken";
  if (S.coins < SVC[t].cost) return `Needs ${SVC[t].cost} coins`;
  return null;
}
export function place(x, y) {
  const err = canPlace(x, y, tool);
  if (err) { toast(err); return; }
  const i = at(x, y);
  if (tool === "clear") {
    const b = S.build[i];
    if (b.k === "svc") { const back = Math.floor(SVC[b.type].cost / 2); S.coins += back; floatText(x, y, `+${back}`, "#f0b44c"); pushLog(`${SVC[b.type].name} demolished ${compass(x, y)}.`, b.type); }
    S.build[i] = null;
    burst(x, y, "#9a9384", 8);
    recalc();
    return;
  }
  const def = SVC[tool];
  S.coins -= def.cost;
  clearForest(i);
  S.build[i] = { k: "svc", type: tool, born: now() };
  recalc();
  let solved = 0;
  S.needs = S.needs.filter(n => {
    if (n.type === tool && Math.hypot(n.x - x, n.y - y) <= SOLVE_R) { solveNeed(n); solved++; return false; }
    return true;
  });
  if (!solved) { pushLog(`${def.name} built ${compass(x, y)}.`, tool); burst(x, y, def.color, 8); }
  floatText(x, y, `−${def.cost}`, "#e8edf1");
}

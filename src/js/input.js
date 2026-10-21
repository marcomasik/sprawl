/* ---------- input ---------- */
import { W, H, SVC, TYPES } from "./config.js";
import { $, inb } from "./util.js";
import { S, newState } from "./state.js";
import { place } from "./actions.js";
import { clearEffects } from "./effects.js";
import { cv } from "./render.js";
import { tool, selectTool, buildTools, clearNeedList } from "./ui.js";

export let hover = null;
let confirmT = 0;

function tileFrom(e) {
  const r = cv.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / r.width * W), y = Math.floor((e.clientY - r.top) / r.height * H);
  return inb(x, y) ? { x, y } : null;
}
function startGame() { S.started = true; S.paused = false; }
export function bindInput() {
  cv.addEventListener("pointermove", e => { hover = tileFrom(e); });
  cv.addEventListener("pointerdown", e => { hover = tileFrom(e); });
  cv.addEventListener("pointerleave", () => { hover = null; });
  cv.addEventListener("click", e => {
    const p = tileFrom(e);
    if (!p) return;
    if (!S.started) { startGame(); return; }
    if (tool) { place(p.x, p.y); return; }
    const n = S.needs.find(n => Math.hypot(n.x - p.x, n.y - p.y) <= 1.5);
    if (n) selectTool(n.type);
  });
  $("startbtn").addEventListener("click", startGame);
  $("pause").addEventListener("click", () => { if (!S.started) startGame(); else S.paused = !S.paused; });
  $("speed").addEventListener("click", () => { S.speed = S.speed === 1 ? 2 : S.speed === 2 ? 3 : 1; });
  $("newmap").addEventListener("click", () => {
    const b = $("newmap");
    if (!b.classList.contains("warn")) {
      b.classList.add("warn"); b.textContent = "Tap again to restart";
      clearTimeout(confirmT);
      confirmT = setTimeout(() => { b.classList.remove("warn"); b.textContent = "New map"; }, 3000);
      return;
    }
    clearTimeout(confirmT);
    b.classList.remove("warn"); b.textContent = "New map";
    const sp = S.speed;
    newState((Math.random() * 1e9) | 0);
    S.speed = sp;
    clearNeedList();
    clearEffects();
    selectTool(null);
    buildTools();
    startGame();
  });
  window.addEventListener("keydown", e => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    const t = TYPES.find(k => SVC[k].key === e.key);
    if (t) { selectTool(tool === t ? null : t); return; }
    if (e.key === "x" || e.key === "X") { selectTool(tool === "clear" ? null : "clear"); return; }
    if (e.key === "Escape") { selectTool(null); return; }
    if (e.key === " " && !(e.target && e.target.tagName === "BUTTON")) {
      e.preventDefault();
      if (!S.started) startGame(); else S.paused = !S.paused;
    }
  });
}

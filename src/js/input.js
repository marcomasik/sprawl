/* ---------- input ---------- */
import { SVC, TYPES } from "./config.js";
import { $ } from "./util.js";
import { S, newState } from "./state.js";
import { place } from "./actions.js";
import { clearEffects } from "./effects.js";
import { cv, pickTile } from "./render.js";
import { pan, zoomBy, rotate } from "./camera.js";
import { tool, selectTool, buildTools, clearNeedList } from "./ui.js";

export let hover = null;
let confirmT = 0;
let drag = null, dragged = false;
const held = new Set();
const PAN_KEYS = { arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0], arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1] };
const PAN_SPEED = 700;

function startGame() { S.started = true; S.paused = false; }
// Held pan keys move the view a fixed screen speed per second.
export function stepInput(dt) {
  let kx = 0, ky = 0;
  for (const k of held) { kx += PAN_KEYS[k][0]; ky += PAN_KEYS[k][1]; }
  if (kx || ky) pan(-kx * PAN_SPEED * dt, -ky * PAN_SPEED * dt);
}
export function bindInput() {
  const wrap = $("mapwrap");
  cv.addEventListener("pointerdown", e => {
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
    dragged = false;
    hover = pickTile(e.clientX, e.clientY);
  });
  cv.addEventListener("pointermove", e => {
    if (drag && drag.id === e.pointerId) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!dragged && Math.hypot(dx, dy) > 5) { dragged = true; cv.setPointerCapture(e.pointerId); wrap.classList.add("panning"); }
      if (dragged) { pan(dx, dy); drag.x = e.clientX; drag.y = e.clientY; return; }
    }
    hover = pickTile(e.clientX, e.clientY);
  });
  const endDrag = () => { drag = null; wrap.classList.remove("panning"); };
  cv.addEventListener("pointerup", endDrag);
  cv.addEventListener("pointercancel", endDrag);
  cv.addEventListener("pointerleave", () => { if (!drag) hover = null; });
  cv.addEventListener("contextmenu", e => e.preventDefault());
  cv.addEventListener("wheel", e => { e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  cv.addEventListener("click", e => {
    if (dragged) return;
    const p = pickTile(e.clientX, e.clientY);
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
    const key = e.key.toLowerCase();
    if (PAN_KEYS[key]) { e.preventDefault(); held.add(key); return; }
    if (key === "q") { rotate(-1); return; }
    if (key === "e") { rotate(1); return; }
    if (key === "+" || key === "=") { zoomBy(1.25); return; }
    if (key === "-") { zoomBy(0.8); return; }
    const t = TYPES.find(k => SVC[k].key === e.key);
    if (t) { selectTool(tool === t ? null : t); return; }
    if (key === "x") { selectTool(tool === "clear" ? null : "clear"); return; }
    if (e.key === "Escape") { selectTool(null); return; }
    if (e.key === " " && !(e.target && e.target.tagName === "BUTTON")) {
      e.preventDefault();
      if (!S.started) startGame(); else S.paused = !S.paused;
    }
  });
  window.addEventListener("keyup", e => held.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => held.clear());
}

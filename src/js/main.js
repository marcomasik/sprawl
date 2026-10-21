/* ---------- boot ---------- */
import { S, newState, serialize, restore } from "./state.js";
import { step } from "./sim.js";
import { cv, draw, resize } from "./render.js";
import { buildTools, updateTools, updateNeeds, updateStats, saveBest } from "./ui.js";
import { bindInput, stepInput } from "./input.js";

let last = 0, uiT = 0;
function frame(t) {
  const dt = Math.min(0.1, (t - (last || t)) / 1000);
  last = t;
  if (S.started && !S.paused) step(dt * S.speed);
  stepInput(dt);
  draw(t, dt);
  uiT -= dt;
  if (uiT <= 0) { uiT = 0.15; updateStats(); updateTools(); updateNeeds(); }
  requestAnimationFrame(frame);
}
function start(data) {
  if (data && data.state && data.state.terrain) {
    try { restore(data.state); } catch (e) { newState((Math.random() * 1e9) | 0); }
  } else newState((Math.random() * 1e9) | 0);
  buildTools();
  saveBest();
  resize();
  new ResizeObserver(resize).observe(cv.parentElement);
  updateStats();
  requestAnimationFrame(frame);
}

bindInput();
try { window.claude?.hot?.snapshot?.(() => ({ state: serialize() })); } catch (e) {}
const hot = window.claude?.hot;
if (hot && hot.ready) hot.ready(start); else start(hot?.data ?? {});

/* ---------- rendering ---------- */
import { W, H, N, WATER, FOREST, SVC, ROOFS, ICON, SOLVE_R } from "./config.js";
import { $, reduce, inb, at, rgba, mix, easeOutBack } from "./util.js";
import { hash } from "./noise.js";
import { S, isRoad } from "./state.js";
import { canPlace } from "./actions.js";
import { particles, floaters, stepEffects } from "./effects.js";
import { tool } from "./ui.js";
import { hover } from "./input.js";

export const cv = $("cv");
const ctx = cv.getContext("2d");
const tc = document.createElement("canvas"), tctx = tc.getContext("2d");
let ts = 16, cssW = 0, cssH = 0, dpr = 1, terrainDirty = true;
const ICON2D = {};
for (const k in ICON) ICON2D[k] = new Path2D(ICON[k]);

export function markTerrainDirty() { terrainDirty = true; }
export function resize() {
  const rect = cv.parentElement.getBoundingClientRect();
  cssW = rect.width;
  ts = cssW / W;
  cssH = ts * H;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(cssW * dpr);
  cv.height = Math.round(cssH * dpr);
  cv.style.height = cssH + "px";
  terrainDirty = true;
}
function renderTerrain() {
  tc.width = cv.width; tc.height = cv.height;
  const g = tctx;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = at(x, y), sh = S.shade[i], t = S.terrain[i];
    let c;
    if (t === WATER) {
      let deep = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inb(x + dx, y + dy) && S.terrain[at(x + dx, y + dy)] === WATER) deep++;
      c = mix("#5b9cbf", "#3b7699", Math.min(1, deep / 9 * 0.8 + sh * 0.2));
    } else {
      let shore = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inb(x + dx, y + dy) && S.terrain[at(x + dx, y + dy)] === WATER) shore = true;
      c = shore ? mix("#d7c995", "#c8b97f", sh) : t === FOREST ? mix("#6f9d5c", "#628f50", sh) : mix("#8dba73", "#78a862", sh);
    }
    g.fillStyle = c;
    g.fillRect(x * ts, y * ts, ts + 0.6, ts + 0.6);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (S.terrain[at(x, y)] !== FOREST) continue;
    for (let k = 0; k < 3; k++) {
      const ox = (0.22 + hash(x, y, k + 3) * 0.56) * ts, oy = (0.22 + hash(x, y, k + 9) * 0.56) * ts;
      const r = ts * (0.2 + hash(x, y, k + 17) * 0.1);
      g.fillStyle = "rgba(30,50,30,.28)";
      g.beginPath(); g.arc(x * ts + ox + r * 0.25, y * ts + oy + r * 0.35, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#3f7046";
      g.beginPath(); g.arc(x * ts + ox, y * ts + oy, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#57905a";
      g.beginPath(); g.arc(x * ts + ox - r * 0.25, y * ts + oy - r * 0.25, r * 0.5, 0, Math.PI * 2); g.fill();
    }
  }
  terrainDirty = false;
}
function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
function drawIcon(type, cx, cy, r, color, bg) {
  ctx.save();
  if (type === "work") {
    ctx.strokeStyle = color; ctx.lineCap = "round";
    ctx.lineWidth = r * 0.34;
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55); ctx.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92); ctx.stroke();
    }
    ctx.fillStyle = color; circle(cx, cy, r * 0.62); ctx.fill();
    ctx.fillStyle = bg; circle(cx, cy, r * 0.26); ctx.fill();
  } else {
    ctx.translate(cx - r, cy - r);
    ctx.scale(r / 12, r / 12);
    ctx.fillStyle = color;
    ctx.fill(ICON2D[type]);
  }
  ctx.restore();
}
function popScale(b, t, dur) {
  if (reduce || b.born < 0) return 1;
  const a = (t - b.born) / dur;
  return a >= 1 ? 1 : Math.max(0, easeOutBack(a));
}
function drawRoads() {
  for (const [wf, col] of [[0.66, "#8d8676"], [0.5, "#e2dac6"]]) {
    ctx.fillStyle = col;
    const hw = ts * wf / 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!isRoad(x, y)) continue;
      const cx = x * ts + ts / 2, cy = y * ts + ts / 2;
      ctx.fillRect(cx - hw, cy - hw, hw * 2, hw * 2);
      if (isRoad(x + 1, y)) ctx.fillRect(cx, cy - hw, ts, hw * 2);
      if (isRoad(x, y + 1)) ctx.fillRect(cx - hw, cy, hw * 2, ts);
    }
  }
}
function drawHouse(x, y, b, t) {
  const sz = [0, 0.5, 0.64, 0.78][b.lvl] * ts * popScale(b, t, 380);
  if (sz <= 0.5) return;
  const px = x * ts + ts / 2 - sz / 2, py = y * ts + ts / 2 - sz / 2;
  const [lt, dk] = ROOFS[b.hue];
  ctx.fillStyle = "rgba(25,40,28,.32)";
  ctx.fillRect(px + ts * 0.08, py + ts * 0.1, sz, sz);
  if (b.lvl < 3) {
    ctx.fillStyle = lt;
    if (b.rot) ctx.fillRect(px, py, sz / 2, sz); else ctx.fillRect(px, py, sz, sz / 2);
    ctx.fillStyle = dk;
    if (b.rot) ctx.fillRect(px + sz / 2, py, sz / 2, sz); else ctx.fillRect(px, py + sz / 2, sz, sz / 2);
    if (b.lvl === 2) { ctx.fillStyle = "rgba(255,255,255,.28)"; ctx.fillRect(px + sz * 0.68, py + sz * 0.12, sz * 0.14, sz * 0.14); }
  } else {
    ctx.fillStyle = dk; ctx.fillRect(px, py, sz, sz);
    ctx.fillStyle = lt; ctx.fillRect(px + sz * 0.12, py + sz * 0.12, sz * 0.76, sz * 0.76);
    ctx.fillStyle = dk; ctx.fillRect(px + sz * 0.56, py + sz * 0.24, sz * 0.2, sz * 0.2);
  }
}
function drawSvc(x, y, b, t) {
  const def = SVC[b.type], sz = 0.86 * ts * popScale(b, t, 420);
  if (sz <= 0.5) return;
  const px = x * ts + ts / 2 - sz / 2, py = y * ts + ts / 2 - sz / 2;
  ctx.fillStyle = "rgba(25,40,28,.35)";
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(px + ts * 0.08, py + ts * 0.1, sz, sz, sz * 0.22) : ctx.rect(px + ts * 0.08, py + ts * 0.1, sz, sz); ctx.fill();
  ctx.fillStyle = def.color;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(px, py, sz, sz, sz * 0.22) : ctx.rect(px, py, sz, sz); ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.22)"; ctx.lineWidth = 1; ctx.stroke();
  drawIcon(b.type, x * ts + ts / 2, y * ts + ts / 2, sz * 0.34, "#fffaf0", def.color);
}
function drawPark(x, y, b, t) {
  const s = popScale(b, t, 400), cx = x * ts + ts / 2, cy = y * ts + ts / 2;
  ctx.fillStyle = "#9cc77f";
  ctx.fillRect(cx - ts * 0.4 * s, cy - ts * 0.4 * s, ts * 0.8 * s, ts * 0.8 * s);
  for (const [ox, oy, r] of [[-0.14, -0.1, 0.2], [0.16, 0.12, 0.17]]) {
    ctx.fillStyle = "#3f7046"; circle(cx + ox * ts * s, cy + oy * ts * s, r * ts * s); ctx.fill();
  }
}
function drawNeed(n, t) {
  const def = SVC[n.type], cx = (n.x + 0.5) * ts, cy = (n.y + 0.5) * ts;
  const R = Math.max(ts * 0.66, 10), frac = Math.max(0, 1 - n.age / n.life);
  if (tool === n.type) {
    ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
    ctx.strokeStyle = rgba(def.color, 0.9); ctx.fillStyle = rgba(def.color, 0.1);
    circle(cx, cy, (SOLVE_R + 0.5) * ts); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
  }
  if (!reduce) {
    const ph = (t / 1400 + n.id * 0.37) % 1;
    ctx.fillStyle = rgba(def.color, 0.4 * (1 - ph));
    circle(cx, cy, R * (1 + ph * 1.1)); ctx.fill();
  }
  ctx.fillStyle = "#16202b"; circle(cx, cy, R); ctx.fill();
  ctx.lineWidth = Math.max(2, R * 0.2);
  ctx.strokeStyle = "rgba(255,255,255,.16)"; circle(cx, cy, R * 0.86); ctx.stroke();
  ctx.strokeStyle = frac < 0.3 ? "#e8675a" : def.color;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.86, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
  drawIcon(n.type, cx, cy, R * 0.5, def.color, "#16202b");
}
export function draw(t, dt) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (terrainDirty) renderTerrain();
  ctx.drawImage(tc, 0, 0, cssW, cssH);

  for (const a of S.attr) {
    if (a.s <= 0.05) continue;
    const cx = (a.x + 0.5) * ts, cy = (a.y + 0.5) * ts, r = ts * 6;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,236,170,${Math.min(0.32, a.s * 0.22)})`);
    g.addColorStop(1, "rgba(255,236,170,0)");
    ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  if (tool && tool !== "clear") {
    ctx.fillStyle = rgba(SVC[tool].color, 0.16);
    const cov = S.cov[tool];
    for (let i = 0; i < N; i++) if (cov[i]) ctx.fillRect((i % W) * ts, ((i / W) | 0) * ts, ts + 0.5, ts + 0.5);
  }

  drawRoads();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const b = S.build[at(x, y)];
    if (!b || b.k === "road") continue;
    if (b.k === "house") drawHouse(x, y, b, t);
    else if (b.k === "svc") drawSvc(x, y, b, t);
    else if (b.k === "park") drawPark(x, y, b, t);
  }
  for (const n of S.needs) drawNeed(n, t);

  if (hover && tool) {
    const err = canPlace(hover.x, hover.y, tool);
    const px = hover.x * ts, py = hover.y * ts;
    if (tool === "clear") {
      ctx.strokeStyle = err ? "rgba(255,255,255,.5)" : "#e8675a"; ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, ts - 2, ts - 2);
    } else {
      const def = SVC[tool];
      ctx.setLineDash([3, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(def.color, 0.95);
      circle(px + ts / 2, py + ts / 2, def.r * ts); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = err ? "#e8675a" : def.color;
      ctx.fillRect(px + ts * 0.07, py + ts * 0.07, ts * 0.86, ts * 0.86);
      ctx.globalAlpha = 1;
      if (!err) drawIcon(tool, px + ts / 2, py + ts / 2, ts * 0.3, "#fffaf0", def.color);
    }
  }

  stepEffects(dt);
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color; circle(p.x * ts, p.y * ts, Math.max(1.5, p.size * ts)); ctx.fill();
  }
  ctx.textAlign = "center";
  ctx.font = `600 ${Math.max(12, ts * 0.8)}px Barlow, system-ui, sans-serif`;
  for (const f of floaters) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.6));
    ctx.fillStyle = "rgba(15,22,30,.7)"; ctx.fillText(f.text, f.x * ts + 1, f.y * ts + 1);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x * ts, f.y * ts);
  }
  ctx.globalAlpha = 1;
}

/* ---------- effects ---------- */
import { reduce } from "./util.js";

export let particles = [], floaters = [];

export function burst(x, y, color, n) {
  if (reduce) return;
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, v = 0.6 + Math.random() * 1.6;
    particles.push({ x: x + 0.5, y: y + 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.4, life: 1, color, size: 0.08 + Math.random() * 0.1 });
  }
}
export function floatText(x, y, text, color) { floaters.push({ x: x + 0.5, y: y + 0.2, text, color, life: 1 }); }
export function stepEffects(dt) {
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 1.8 * dt; p.life -= dt * 1.4; }
  particles = particles.filter(p => p.life > 0);
  for (const f of floaters) { f.y -= dt * 1.1; f.life -= dt * 0.8; }
  floaters = floaters.filter(f => f.life > 0);
}
export function clearEffects() { particles = []; floaters = []; }

/* ---------- effects ---------- */
// Positions are in tile units: x/z across the map, h above the ground.
import { reduce } from "./util.js";

export let particles = [], floaters = [];

export function burst(x, y, color, n) {
  if (reduce) return;
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, v = 0.4 + Math.random() * 1.1;
    particles.push({ x: x + 0.5, z: y + 0.5, h: 0.3, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vh: 1.4 + Math.random() * 1.6, life: 1, color, size: 0.08 + Math.random() * 0.1 });
  }
}
export function floatText(x, y, text, color) { floaters.push({ x: x + 0.5, y: y + 0.5, text, color, life: 1 }); }
export function stepEffects(dt) {
  for (const p of particles) {
    p.x += p.vx * dt; p.z += p.vz * dt; p.h += p.vh * dt; p.vh -= 6 * dt; p.life -= dt * 1.4;
    if (p.h < 0) { p.h = 0; p.vh *= -0.3; }
  }
  particles = particles.filter(p => p.life > 0);
  for (const f of floaters) f.life -= dt * 0.8;
  floaters = floaters.filter(f => f.life > 0);
}
export function clearEffects() { particles = []; floaters = []; }

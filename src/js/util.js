/* ---------- helpers ---------- */
import { W, H, CX, CY, DIRS } from "./config.js";

export const $ = id => document.getElementById(id);
export const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

export const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
export const at = (x, y) => y * W + x;
export const rnd = a => a[(Math.random() * a.length) | 0];
export const isLat = (x, y) => ((x - CX) % 4 + 4) % 4 === 0 || ((y - CY) % 4 + 4) % 4 === 0;
export function compass(x, y) {
  if (Math.hypot(x - CX, y - CY) < 2) return "in the centre";
  const a = Math.atan2(y - CY, x - CX);
  return "in the " + DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}
export function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
export function mix(a, b, t) {
  const p = parseInt(a.slice(1), 16), q = parseInt(b.slice(1), 16);
  const r = Math.round((p >> 16) + ((q >> 16) - (p >> 16)) * t);
  const g = Math.round(((p >> 8) & 255) + (((q >> 8) & 255) - ((p >> 8) & 255)) * t);
  const bl = Math.round((p & 255) + ((q & 255) - (p & 255)) * t);
  return `rgb(${r},${g},${bl})`;
}
export function easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
export const now = () => performance.now();
export function dayOf(t) { return Math.floor(t / 20) + 1; }

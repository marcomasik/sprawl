/* ---------- minimap ---------- */
// North-up overview of the whole map with the camera's view outline; click or drag on it to move the view.
import { W, H, WATER, FOREST, SVC } from "./config.js";
import { $, at } from "./util.js";
import { S } from "./state.js";
import { viewFootprint } from "./render.js";
import { centerOn } from "./camera.js";

const mm = $("minimap"), g = mm.getContext("2d");
const BUILD = { road: "#5d6170", park: "#9cc77f" };
// houses shift from cream to blue-grey as they grow into towers
const HOUSE = ["", "#e2dccd", "#e9e3d4", "#c9ccd3", "#b5bac4", "#a2a8b4", "#8f96a3", "#7c8493"];

export function drawMinimap() {
  const sx = mm.width / W, sy = mm.height / H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = at(x, y), b = S.build[i], t = S.terrain[i];
    g.fillStyle = b ? (b.k === "house" ? HOUSE[b.lvl] : b.k === "svc" ? SVC[b.type].color : BUILD[b.k])
      : t === WATER ? "#3d86b3" : t === FOREST ? "#4c7c4a" : "#7fae68";
    g.fillRect(x * sx, y * sy, Math.ceil(sx), Math.ceil(sy));
  }
  for (const n of S.needs) {
    g.fillStyle = SVC[n.type].color;
    g.strokeStyle = "#fffaf0";
    g.lineWidth = 2;
    g.beginPath(); g.arc((n.x + 0.5) * sx, (n.y + 0.5) * sy, sx * 0.9, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  g.strokeStyle = "rgba(255,255,255,.9)";
  g.lineWidth = 2;
  g.beginPath();
  viewFootprint().forEach(([x, y], k) => k ? g.lineTo(x * sx, y * sy) : g.moveTo(x * sx, y * sy));
  g.closePath();
  g.stroke();
}
export function bindMinimap() {
  const jump = e => {
    const r = mm.getBoundingClientRect();
    centerOn((e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H);
  };
  mm.addEventListener("pointerdown", e => { mm.setPointerCapture(e.pointerId); jump(e); });
  mm.addEventListener("pointermove", e => { if (e.buttons) jump(e); });
}

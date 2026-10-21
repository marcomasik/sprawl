/* ---------- camera ---------- */
// Orthographic camera at a fixed pitch, rotating in 90° steps around a target on the ground, like SimCity 4.
import * as THREE from "three";
import { W, H } from "./config.js";
import { reduce } from "./util.js";

const PITCH = 0.62, DIST = 80;
const MIN_ZOOM = 0.9, MAX_ZOOM = 5;

export const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 300);
const target = new THREE.Vector3();
let az = Math.PI / 4, azGoal = az, zoom = 1.3, zoomGoal = zoom, viewH = 30, viewPx = 1;

export function setViewport(w, h) {
  const aspect = w / h, span = (W + H) / Math.SQRT2;
  viewH = Math.max(span * Math.sin(PITCH) + 2, span / aspect) * 1.04;
  viewPx = h;
  camera.left = -viewH * aspect / 2; camera.right = viewH * aspect / 2;
  camera.top = viewH / 2; camera.bottom = -viewH / 2;
  camera.updateProjectionMatrix();
}
// Moves the view by a screen distance in CSS pixels; dragging right moves the map right.
export function pan(dx, dy) {
  const wpp = viewH / zoom / viewPx, sp = Math.sin(PITCH);
  target.x += (-Math.cos(az) * dx - Math.sin(az) * dy / sp) * wpp;
  target.z += (Math.sin(az) * dx - Math.cos(az) * dy / sp) * wpp;
  target.x = Math.max(-W / 2, Math.min(W / 2, target.x));
  target.z = Math.max(-H / 2, Math.min(H / 2, target.z));
}
// Centres the view on a point in tile units.
export function centerOn(tx, ty) {
  target.x = Math.max(-W / 2, Math.min(W / 2, tx - W / 2));
  target.z = Math.max(-H / 2, Math.min(H / 2, ty - H / 2));
}
export function zoomBy(f) { zoomGoal = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomGoal * f)); }
export function rotate(dir) { azGoal += dir * Math.PI / 2; }
export function updateCamera(dt) {
  const k = reduce ? 1 : 1 - Math.exp(-dt * 12);
  az += (azGoal - az) * k;
  zoom += (zoomGoal - zoom) * k;
  camera.position.set(
    target.x + Math.sin(az) * Math.cos(PITCH) * DIST,
    Math.sin(PITCH) * DIST,
    target.z + Math.cos(az) * Math.cos(PITCH) * DIST,
  );
  camera.lookAt(target);
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
}

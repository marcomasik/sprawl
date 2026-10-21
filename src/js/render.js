/* ---------- rendering ---------- */
// three.js scene. Tile (x, y) sits at world (x - W/2 + 0.5, 0, y - H/2 + 0.5), one unit per tile.
// Static terrain is rebuilt when marked dirty; everything else is refilled every frame from S.
import * as THREE from "three";
import { W, H, N, WATER, FOREST, SVC, ROOFS, ICON, SOLVE_R } from "./config.js";
import { $, reduce, inb, at, mix, easeOutBack } from "./util.js";
import { hash } from "./noise.js";
import { S, isRoad } from "./state.js";
import { canPlace } from "./actions.js";
import { particles, floaters, stepEffects } from "./effects.js";
import { tool } from "./ui.js";
import { hover } from "./input.js";
import { camera, setViewport, updateCamera } from "./camera.js";

export const cv = $("cv");
const labelsEl = $("labels");
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
renderer.setClearColor("#16202b");
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight("#e4efff", "#56664a", 1.6));
const sun = new THREE.DirectionalLight("#fff3dc", 2.2);
sun.position.set(-30, 50, 20);
scene.add(sun);

let cssW = 0, cssH = 0, terrainDirty = true;
const wx = x => x - W / 2 + 0.5, wz = y => y - H / 2 + 0.5;

/* ---------- geometry and materials ---------- */
const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const flatGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const coneGeo = new THREE.ConeGeometry(0.5, 1, 6).translate(0, 0.5, 0);
const ballGeo = new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.5, 0);
const ringGeo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
const lineRingGeo = new THREE.RingGeometry(0.97, 1, 96).rotateX(-Math.PI / 2);
const discGeo = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
const roofGeo = new THREE.BufferGeometry();
// gable roof over a unit footprint, ridge along x
roofGeo.setAttribute("position", new THREE.Float32BufferAttribute([
  -.5, 0, -.5, -.5, 0, .5, -.5, 1, 0,
  .5, 0, .5, .5, 0, -.5, .5, 1, 0,
  -.5, 0, .5, .5, 0, .5, .5, 1, 0, -.5, 0, .5, .5, 1, 0, -.5, 1, 0,
  .5, 0, -.5, -.5, 0, -.5, -.5, 1, 0, .5, 0, -.5, -.5, 1, 0, .5, 1, 0,
], 3));
roofGeo.computeVertexNormals();
const solid = () => new THREE.MeshLambertMaterial({ color: "#ffffff" });
const overlay = (opacity = 1) => new THREE.MeshBasicMaterial({ transparent: true, opacity, depthWrite: false });

function instanced(geo, mat, max = N) {
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.count = 0;
  m.frustumCulled = false;
  scene.add(m);
  return m;
}
const roads = instanced(boxGeo, solid());
const walls = instanced(boxGeo, solid());
const roofs = instanced(roofGeo, solid());
const svcs = instanced(boxGeo, solid());
const parks = instanced(boxGeo, solid());
const shrubs = instanced(ballGeo, solid(), N * 2);
const trees = instanced(coneGeo, solid(), N * 3);
const cover = instanced(flatGeo, overlay(0.22));
const debris = instanced(boxGeo, solid(), 400);
cover.renderOrder = 1;

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), col = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
function put(mesh, x, y, z, sx, sy, sz, color, rot = 0) {
  if (mesh.count >= mesh.instanceMatrix.count) return;
  q.setFromAxisAngle(UP, rot);
  m4.compose(pos.set(x, y, z), q, scl.set(sx, sy, sz));
  mesh.setMatrixAt(mesh.count, m4);
  if (color) mesh.setColorAt(mesh.count, col.set(color));
  mesh.count++;
}
function flush(...meshes) {
  for (const m of meshes) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
}

// Pooled one-off objects (markers, glows, previews): take() hands out objects in draw order, the rest get hidden.
const pools = new Map();
function take(key, create) {
  let p = pools.get(key);
  if (!p) pools.set(key, p = { items: [], used: 0 });
  if (p.used === p.items.length) { const o = create(); scene.add(o); p.items.push(o); }
  const o = p.items[p.used++];
  o.visible = true;
  return o;
}
function hideUnused() {
  for (const p of pools.values()) { for (let i = p.used; i < p.items.length; i++) p.items[i].visible = false; p.used = 0; }
}

/* ---------- canvas textures ---------- */
const ICON2D = {};
for (const k in ICON) ICON2D[k] = new Path2D(ICON[k]);
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); }
function paintIcon(g, type, cx, cy, r, color, bg) {
  g.save();
  if (type === "work") {
    g.strokeStyle = color; g.lineCap = "round";
    g.lineWidth = r * 0.34;
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55); g.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92); g.stroke();
    }
    g.fillStyle = color; circle(g, cx, cy, r * 0.62); g.fill();
    g.fillStyle = bg; circle(g, cx, cy, r * 0.26); g.fill();
  } else {
    g.translate(cx - r, cy - r);
    g.scale(r / 12, r / 12);
    g.fillStyle = color;
    g.fill(ICON2D[type]);
  }
  g.restore();
}
function canvasTexture(size, paint) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  paint(c.getContext("2d"), size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const roofIcons = {};
for (const t in SVC) {
  roofIcons[t] = new THREE.MeshBasicMaterial({
    transparent: true, depthWrite: false,
    map: canvasTexture(64, (g, s) => paintIcon(g, t, s / 2, s / 2, s * 0.36, "#fffaf0", SVC[t].color)),
  });
}
const glowTex = canvasTexture(128, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, "rgba(255,236,170,1)");
  gr.addColorStop(1, "rgba(255,236,170,0)");
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});
function paintNeed(g, s, n, def) {
  const c = s / 2, R = s * 0.42, frac = Math.max(0, 1 - n.age / n.life);
  g.clearRect(0, 0, s, s);
  g.fillStyle = "#16202b"; circle(g, c, c, R); g.fill();
  g.lineWidth = R * 0.2;
  g.strokeStyle = "rgba(255,255,255,.16)"; circle(g, c, c, R * 0.86); g.stroke();
  g.strokeStyle = frac < 0.3 ? "#e8675a" : def.color;
  g.beginPath(); g.arc(c, c, R * 0.86, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); g.stroke();
  paintIcon(g, n.type, c, c, R * 0.5, def.color, "#16202b");
}

/* ---------- terrain ---------- */
const ground = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
const base = new THREE.Mesh(new THREE.BoxGeometry(W, 1.2, H).translate(0, -0.6, 0), new THREE.MeshLambertMaterial({ color: "#6b5844" }));
base.position.y = -0.01;
scene.add(ground, base);

export function markTerrainDirty() { terrainDirty = true; }
function buildTerrain() {
  const p = [], c = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = at(x, y), sh = S.shade[i], t = S.terrain[i];
    let hex;
    if (t === WATER) {
      let deep = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inb(x + dx, y + dy) && S.terrain[at(x + dx, y + dy)] === WATER) deep++;
      hex = mix("#5b9cbf", "#3b7699", Math.min(1, deep / 9 * 0.8 + sh * 0.2));
    } else {
      let shore = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inb(x + dx, y + dy) && S.terrain[at(x + dx, y + dy)] === WATER) shore = true;
      hex = shore ? mix("#d7c995", "#c8b97f", sh) : t === FOREST ? mix("#6f9d5c", "#628f50", sh) : mix("#8dba73", "#78a862", sh);
    }
    col.set(hex);
    const x0 = x - W / 2, z0 = y - H / 2;
    p.push(x0, 0, z0, x0, 0, z0 + 1, x0 + 1, 0, z0, x0 + 1, 0, z0, x0, 0, z0 + 1, x0 + 1, 0, z0 + 1);
    for (let k = 0; k < 6; k++) c.push(col.r, col.g, col.b);
  }
  ground.geometry.dispose();
  ground.geometry = new THREE.BufferGeometry();
  ground.geometry.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  ground.geometry.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
  ground.geometry.computeVertexNormals();

  trees.count = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (S.terrain[at(x, y)] !== FOREST || S.build[at(x, y)]) continue;
    for (let k = 0; k < 3; k++) {
      const ox = 0.22 + hash(x, y, k + 3) * 0.56, oz = 0.22 + hash(x, y, k + 9) * 0.56, r = 0.2 + hash(x, y, k + 17) * 0.1;
      put(trees, x - W / 2 + ox, 0, y - H / 2 + oz, r * 2, r * 4, r * 2, k === 1 ? "#57905a" : "#3f7046");
    }
  }
  flush(trees);
  terrainDirty = false;
}

export function resize() {
  const rect = cv.parentElement.getBoundingClientRect();
  cssW = rect.width;
  cssH = Math.round(Math.min(cssW * 0.62, window.innerHeight * 0.78));
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(cssW, cssH, false);
  cv.style.height = cssH + "px";
  setViewport(cssW, cssH);
}
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(UP, 0), hit = new THREE.Vector3();
export function pickTile(clientX, clientY) {
  const r = cv.getBoundingClientRect();
  ndc.set((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (!ray.ray.intersectPlane(plane, hit)) return null;
  const x = Math.floor(hit.x + W / 2), y = Math.floor(hit.z + H / 2);
  return inb(x, y) ? { x, y } : null;
}

/* ---------- per-frame drawing ---------- */
function popScale(b, t, dur) {
  if (reduce || b.born < 0) return 1;
  const a = (t - b.born) / dur;
  return a >= 1 ? 1 : Math.max(0, easeOutBack(a));
}
function drawHouse(x, y, b, t) {
  const s = popScale(b, t, 380);
  if (s <= 0.01) return;
  const [lt, dk] = ROOFS[b.hue], cx = wx(x), cz = wz(y), rot = b.rot ? Math.PI / 2 : 0;
  if (b.lvl < 3) {
    const f = (b.lvl === 1 ? 0.5 : 0.64) * s, h = (b.lvl === 1 ? 0.3 : 0.46) * s;
    put(walls, cx, 0, cz, f, h, f, "#ece4d2", rot);
    put(roofs, cx, h, cz, f * 1.08, f * 0.5, f * 1.08, dk, rot);
  } else {
    const f = 0.78 * s, h = 1.1 * s;
    put(walls, cx, 0, cz, f, h, f, lt, rot);
    put(walls, cx, h, cz, f * 0.8, 0.06 * s, f * 0.8, dk, rot);
  }
}
function drawSvc(x, y, b, t) {
  const s = popScale(b, t, 420);
  if (s <= 0.01) return;
  const f = 0.86 * s, h = 0.55 * s, cx = wx(x), cz = wz(y);
  put(svcs, cx, 0, cz, f, h, f, SVC[b.type].color);
  const icon = take("icon:" + b.type, () => new THREE.Mesh(flatGeo, roofIcons[b.type]));
  icon.position.set(cx, h + 0.01, cz);
  icon.scale.setScalar(f * 0.8);
}
function drawPark(x, y, b, t) {
  const s = popScale(b, t, 400), cx = wx(x), cz = wz(y);
  put(parks, cx, 0, cz, 0.8 * s, 0.03, 0.8 * s, "#9cc77f");
  for (const [ox, oz, r] of [[-0.14, -0.1, 0.2], [0.16, 0.12, 0.17]]) put(shrubs, cx + ox * s, 0.03, cz + oz * s, r * 2 * s, r * 2 * s, r * 2 * s, "#3f7046");
}
function drawNeed(n, t) {
  const def = SVC[n.type], cx = wx(n.x), cz = wz(n.y);
  if (tool === n.type) {
    const area = take("solve", () => new THREE.Mesh(discGeo, overlay(0.12)));
    area.material.color.set(def.color);
    area.position.set(cx, 0.02, cz);
    area.scale.setScalar(SOLVE_R + 0.5);
    const edge = take("solveEdge", () => new THREE.Mesh(lineRingGeo, overlay(0.9)));
    edge.material.color.set(def.color);
    edge.position.set(cx, 0.03, cz);
    edge.scale.setScalar(SOLVE_R + 0.5);
  }
  if (!reduce) {
    const ph = (t / 1400 + n.id * 0.37) % 1;
    const pulse = take("pulse", () => new THREE.Mesh(ringGeo, overlay()));
    pulse.material.color.set(def.color);
    pulse.material.opacity = 0.6 * (1 - ph);
    pulse.position.set(cx, 0.04, cz);
    pulse.scale.setScalar(0.6 + ph * 1.4);
  }
  const marker = take("need", () => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sp.renderOrder = 10;
    sp.userData.g = c.getContext("2d");
    return sp;
  });
  paintNeed(marker.userData.g, 128, n, def);
  marker.material.map.needsUpdate = true;
  marker.position.set(cx, 1.3, cz);
  marker.scale.setScalar(1.5);
}
function drawHover() {
  const err = canPlace(hover.x, hover.y, tool), cx = wx(hover.x), cz = wz(hover.y);
  if (tool === "clear") {
    const box = take("demolish", () => new THREE.Mesh(boxGeo, overlay(0.35)));
    box.material.color.set(err ? "#ffffff" : "#e8675a");
    box.position.set(cx, 0, cz);
    box.scale.set(0.96, 0.08, 0.96);
    return;
  }
  const def = SVC[tool];
  const range = take("range", () => new THREE.Mesh(lineRingGeo, overlay(0.9)));
  range.material.color.set(def.color);
  range.position.set(cx, 0.05, cz);
  range.scale.set(def.r, 1, def.r);
  const ghost = take("ghost", () => new THREE.Mesh(boxGeo, overlay(0.7)));
  ghost.material.color.set(err ? "#e8675a" : def.color);
  ghost.position.set(cx, 0, cz);
  ghost.scale.set(0.86, 0.55, 0.86);
}
function drawLabels() {
  while (labelsEl.children.length < floaters.length) {
    const el = document.createElement("span");
    el.className = "mapwrap__floater";
    labelsEl.appendChild(el);
  }
  floaters.forEach((f, k) => {
    const el = labelsEl.children[k];
    pos.set(f.x - W / 2, 0.8 + (1 - f.life) * 1.6, f.y - H / 2).project(camera);
    el.textContent = f.text;
    el.style.color = f.color;
    el.style.opacity = Math.max(0, Math.min(1, f.life * 1.6));
    el.style.transform = `translate(${((pos.x + 1) / 2 * cssW).toFixed(1)}px, ${((1 - pos.y) / 2 * cssH).toFixed(1)}px) translate(-50%, -50%)`;
  });
  for (let k = floaters.length; k < labelsEl.children.length; k++) labelsEl.children[k].style.opacity = 0;
}
export function draw(t, dt) {
  updateCamera(dt);
  if (terrainDirty) buildTerrain();

  for (const a of S.attr) {
    if (a.s <= 0.05) continue;
    const glow = take("glow", () => new THREE.Mesh(flatGeo, new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    glow.material.opacity = Math.min(0.32, a.s * 0.22) * 1.6;
    glow.position.set(wx(a.x), 0.015, wz(a.y));
    glow.scale.setScalar(12);
  }

  cover.count = 0;
  if (tool && tool !== "clear") {
    cover.material.color.set(SVC[tool].color);
    const cov = S.cov[tool];
    for (let i = 0; i < N; i++) if (cov[i]) put(cover, wx(i % W), 0.01, wz((i / W) | 0), 1, 1, 1);
  }

  roads.count = walls.count = roofs.count = svcs.count = parks.count = shrubs.count = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const b = S.build[at(x, y)];
    if (!b) continue;
    if (b.k === "road") put(roads, wx(x), 0, wz(y), 1, 0.04, 1, isRoad(x + 1, y) || isRoad(x - 1, y) ? "#5d5d5a" : "#636360");
    else if (b.k === "house") drawHouse(x, y, b, t);
    else if (b.k === "svc") drawSvc(x, y, b, t);
    else if (b.k === "park") drawPark(x, y, b, t);
  }
  for (const n of S.needs) drawNeed(n, t);
  if (hover && tool) drawHover();

  stepEffects(dt);
  debris.count = 0;
  for (const p of particles) {
    const s = p.size * Math.max(0, p.life);
    put(debris, p.x - W / 2, p.h, p.z - H / 2, s, s, s, p.color);
  }
  flush(roads, walls, roofs, svcs, parks, shrubs, cover, debris);
  hideUnused();
  renderer.render(scene, camera);
  drawLabels();
}

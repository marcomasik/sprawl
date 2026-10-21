/* ---------- rendering ---------- */
// three.js scene. Tile (x, y) sits at world (x - W/2 + 0.5, h, y - H/2 + 0.5), one unit per tile; heights come from terrain.js.
// Static terrain is rebuilt when marked dirty; everything else is refilled every frame from S.
import * as THREE from "three";
import { W, H, N, FOREST, SVC, ROOFS, ICON, SOLVE_R } from "./config.js";
import { $, reduce, inb, at, easeOutBack } from "./util.js";
import { hash } from "./noise.js";
import { S } from "./state.js";
import { canPlace } from "./actions.js";
import { particles, floaters, stepEffects } from "./effects.js";
import { tool } from "./ui.js";
import { hover } from "./input.js";
import { camera, setViewport, updateCamera } from "./camera.js";
import { computeHeights, groundGeometry, skirtGeometry, hAt, cornerNormal, tileTop, tileSpan } from "./terrain.js";

export const cv = $("cv");
const labelsEl = $("labels");
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
renderer.setClearColor("#16202b");
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight("#e4efff", "#56664a", 1.25));
const sun = new THREE.DirectionalLight("#fff1d6", 2.8);
sun.position.set(-30, 50, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 150 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
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
// Map overlays (rings, glows, previews) ignore depth so slopes and buildings never hide them.
const overlay = (opacity = 1) => new THREE.MeshBasicMaterial({ transparent: true, opacity, depthWrite: false, depthTest: false });

function instanced(geo, mat, max = N, shadows = true) {
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.count = 0;
  m.frustumCulled = false;
  m.castShadow = m.receiveShadow = shadows;
  scene.add(m);
  return m;
}
const walls = instanced(boxGeo, solid());
const roofs = instanced(roofGeo, solid());
const svcs = instanced(boxGeo, solid());
const shrubs = instanced(ballGeo, solid(), N * 2);
const trees = instanced(coneGeo, solid(), N * 3);
const debris = instanced(boxGeo, solid(), 400, false);

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), col = new THREE.Color(), nrm = new THREE.Vector3();
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

// Draped quads follow the terrain: roads, parks and the coverage overlay are refilled into these every frame.
function draped(mat, max = N) {
  const g = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "color"]) g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(max * 18), 3).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.userData.count = 0;
  scene.add(m);
  return m;
}
function drape(mesh, x, y, inset, lift, color) {
  const g = mesh.geometry, k = mesh.userData.count++ * 18, a = inset, b = 1 - inset;
  col.set(color);
  [[a, a], [a, b], [b, a], [b, a], [a, b], [b, b]].forEach(([ox, oy], v) => {
    const px = x + ox, py = y + oy;
    g.attributes.position.array.set([px - W / 2, hAt(px, py) + lift, py - H / 2], k + v * 3);
    cornerNormal(Math.round(px), Math.round(py), nrm);
    g.attributes.normal.array.set([nrm.x, nrm.y, nrm.z], k + v * 3);
    g.attributes.color.array.set([col.r, col.g, col.b], k + v * 3);
  });
}
function finishDrape(mesh) {
  const g = mesh.geometry;
  g.setDrawRange(0, mesh.userData.count * 6);
  for (const name of ["position", "normal", "color"]) g.attributes[name].needsUpdate = true;
  mesh.userData.count = 0;
}
const decalMat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const decals = draped(decalMat);
decals.receiveShadow = true;
const cover = draped(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.24, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
cover.renderOrder = 1;

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
ground.receiveShadow = true;
const skirt = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ color: "#6b5844", side: THREE.DoubleSide }));
const water = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({
  color: "#3d86b3", specular: "#4a6a80", shininess: 30, transparent: true, opacity: 0.8, depthWrite: false,
}));
water.receiveShadow = true;
scene.add(ground, skirt, water);

export function markTerrainDirty() { terrainDirty = true; }
function buildTerrain() {
  computeHeights();
  ground.geometry.dispose();
  ground.geometry = groundGeometry();
  skirt.geometry.dispose();
  skirt.geometry = skirtGeometry();

  trees.count = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (S.terrain[at(x, y)] !== FOREST || S.build[at(x, y)]) continue;
    for (let k = 0; k < 3; k++) {
      const ox = 0.22 + hash(x, y, k + 3) * 0.56, oz = 0.22 + hash(x, y, k + 9) * 0.56, r = 0.2 + hash(x, y, k + 17) * 0.1;
      put(trees, x - W / 2 + ox, hAt(x + ox, y + oz) - 0.05, y - H / 2 + oz, r * 2, r * 4, r * 2, k === 1 ? "#57905a" : "#3f7046");
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
// Picks the terrain surface, or the water surface where the ray would hit a lake bed.
export function pickTile(clientX, clientY) {
  const r = cv.getBoundingClientRect();
  ndc.set((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, camera);
  let p = ray.intersectObject(ground)[0]?.point;
  if (!p || p.y < 0) p = ray.ray.intersectPlane(plane, hit);
  if (!p) return null;
  const x = Math.floor(p.x + W / 2), y = Math.floor(p.z + H / 2);
  return inb(x, y) ? { x, y } : null;
}

/* ---------- per-frame drawing ---------- */
function popScale(b, t, dur) {
  if (reduce || b.born < 0) return 1;
  const a = (t - b.born) / dur;
  return a >= 1 ? 1 : Math.max(0, easeOutBack(a));
}
// Buildings start at the tile's lowest corner and grow by the slope, so they sit into hillsides instead of floating.
function drawHouse(x, y, b, t) {
  const s = popScale(b, t, 380);
  if (s <= 0.01) return;
  const [lt, dk] = ROOFS[b.hue], cx = wx(x), cz = wz(y), rot = b.rot ? Math.PI / 2 : 0;
  const [lo, hi] = tileSpan(x, y), base = Math.max(0, lo), rise = hi - base;
  if (b.lvl < 3) {
    const f = (b.lvl === 1 ? 0.5 : 0.64) * s, h = (b.lvl === 1 ? 0.3 : 0.46) * s;
    put(walls, cx, base, cz, f, h + rise, f, "#ece4d2", rot);
    put(roofs, cx, base + rise + h, cz, f * 1.08, f * 0.5, f * 1.08, dk, rot);
  } else {
    const f = 0.78 * s, h = 1.1 * s;
    put(walls, cx, base, cz, f, h + rise, f, lt, rot);
    put(walls, cx, base + rise + h, cz, f * 0.8, 0.06 * s, f * 0.8, dk, rot);
  }
}
function drawSvc(x, y, b, t) {
  const s = popScale(b, t, 420);
  if (s <= 0.01) return;
  const [lo, hi] = tileSpan(x, y), base = Math.max(0, lo), top = hi + 0.55 * s;
  const f = 0.86 * s, cx = wx(x), cz = wz(y);
  put(svcs, cx, base, cz, f, top - base, f, SVC[b.type].color);
  const icon = take("icon:" + b.type, () => new THREE.Mesh(flatGeo, roofIcons[b.type]));
  icon.position.set(cx, top + 0.01, cz);
  icon.scale.setScalar(f * 0.8);
}
function drawPark(x, y, b, t) {
  const s = popScale(b, t, 400);
  drape(decals, x, y, 0.5 - 0.4 * s, 0.02, "#9cc77f");
  for (const [ox, oz, r] of [[-0.14, -0.1, 0.2], [0.16, 0.12, 0.17]]) {
    const px = x + 0.5 + ox * s, pz = y + 0.5 + oz * s;
    put(shrubs, px - W / 2, hAt(px, pz), pz - H / 2, r * 2 * s, r * 2 * s, r * 2 * s, "#3f7046");
  }
}
function groundRing(key, geo, x, y, scale, color, opacity) {
  const m = take(key, () => new THREE.Mesh(geo, overlay()));
  m.material.color.set(color);
  m.material.opacity = opacity;
  m.position.set(wx(x), Math.max(0, tileTop(x, y)) + 0.05, wz(y));
  m.scale.set(scale, 1, scale);
  return m;
}
function drawNeed(n, t) {
  const def = SVC[n.type];
  if (tool === n.type) {
    groundRing("solve", discGeo, n.x, n.y, SOLVE_R + 0.5, def.color, 0.12);
    groundRing("solveEdge", lineRingGeo, n.x, n.y, SOLVE_R + 0.5, def.color, 0.9);
  }
  if (!reduce) {
    const ph = (t / 1400 + n.id * 0.37) % 1;
    groundRing("pulse", ringGeo, n.x, n.y, 0.6 + ph * 1.4, def.color, 0.6 * (1 - ph));
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
  marker.position.set(wx(n.x), tileTop(n.x, n.y) + 1.3, wz(n.y));
  marker.scale.setScalar(1.5);
}
function drawHover() {
  const err = canPlace(hover.x, hover.y, tool), cx = wx(hover.x), cz = wz(hover.y);
  const [lo, hi] = tileSpan(hover.x, hover.y), base = Math.max(0, lo);
  if (tool === "clear") {
    const box = take("demolish", () => new THREE.Mesh(boxGeo, overlay(0.35)));
    box.material.color.set(err ? "#ffffff" : "#e8675a");
    box.position.set(cx, base, cz);
    box.scale.set(0.96, hi - base + 0.08, 0.96);
    return;
  }
  const def = SVC[tool];
  groundRing("range", lineRingGeo, hover.x, hover.y, def.r, def.color, 0.9);
  const ghost = take("ghost", () => new THREE.Mesh(boxGeo, overlay(0.7)));
  ghost.material.color.set(err ? "#e8675a" : def.color);
  ghost.position.set(cx, base, cz);
  ghost.scale.set(0.86, hi - base + 0.55, 0.86);
}
function drawLabels() {
  while (labelsEl.children.length < floaters.length) {
    const el = document.createElement("span");
    el.className = "mapwrap__floater";
    labelsEl.appendChild(el);
  }
  floaters.forEach((f, k) => {
    const el = labelsEl.children[k];
    pos.set(f.x - W / 2, Math.max(0, hAt(f.x, f.y)) + 0.8 + (1 - f.life) * 1.6, f.y - H / 2).project(camera);
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
  water.material.opacity = reduce ? 0.8 : 0.78 + Math.sin(t / 1800) * 0.03;

  for (const a of S.attr) {
    if (a.s <= 0.05) continue;
    const glow = take("glow", () => new THREE.Mesh(flatGeo, new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })));
    glow.material.opacity = Math.min(0.32, a.s * 0.22) * 1.4;
    glow.position.set(wx(a.x), Math.max(0, tileTop(a.x, a.y)) + 0.1, wz(a.y));
    glow.scale.setScalar(12);
  }

  if (tool && tool !== "clear") {
    cover.material.color.set(SVC[tool].color);
    const cov = S.cov[tool];
    for (let i = 0; i < N; i++) if (cov[i]) drape(cover, i % W, (i / W) | 0, 0, 0.03, "#ffffff");
  }

  walls.count = roofs.count = svcs.count = shrubs.count = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const b = S.build[at(x, y)];
    if (!b) continue;
    if (b.k === "road") drape(decals, x, y, 0, 0.02, "#5f5f5c");
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
    put(debris, p.x - W / 2, Math.max(0, hAt(p.x, p.z)) + p.h, p.z - H / 2, s, s, s, p.color);
  }
  flush(walls, roofs, svcs, shrubs, debris);
  finishDrape(decals);
  finishDrape(cover);
  hideUnused();
  renderer.render(scene, camera);
  drawLabels();
}

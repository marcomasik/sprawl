/* ---------- rendering ---------- */
// three.js scene. Tile (x, y) sits at world (x - W/2 + 0.5, h, y - H/2 + 0.5), one unit per tile; heights come from terrain.js.
// Static terrain and forests are rebuilt when marked dirty; everything else is refilled every frame from S.
import * as THREE from "three";
import { W, H, N, FOREST, SVC, ICON, SOLVE_R } from "./config.js";
import { $, reduce, inb, at, easeOutBack } from "./util.js";
import { hash } from "./noise.js";
import { S, isRoad } from "./state.js";
import { canPlace } from "./actions.js";
import { particles, floaters, stepEffects } from "./effects.js";
import { tool } from "./ui.js";
import { hover } from "./input.js";
import { camera, setViewport, updateCamera } from "./camera.js";
import { computeHeights, groundGeometry, skirtGeometry, hAt, cornerH, cornerNormal, tileTop, tileSpan } from "./terrain.js";
import { models } from "./models.js";

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

/* ---------- which model goes where ---------- */
// Houses by level, each level visibly taller than the last (about 0.45 tiles high at level 1, up to ~3.9 at level 7);
// a house's roof hue picks the variant.
const HOUSES = [
  ["building-type-a", "building-type-g", "building-type-h", "building-type-i", "building-type-m"].map(n => "suburban/" + n),
  ["building-type-c", "building-type-e", "building-type-l", "building-type-o", "building-type-r", "building-type-s", "building-type-u"].map(n => "suburban/" + n),
  ["building-a", "building-b", "building-d", "building-h"].map(n => "commercial/" + n),
  ["building-f", "building-g", "building-l"].map(n => "commercial/" + n),
  ["building-skyscraper-a", "building-m"].map(n => "commercial/" + n),
  ["building-skyscraper-c", "building-skyscraper-e"].map(n => "commercial/" + n),
  ["building-skyscraper-b", "building-skyscraper-d"].map(n => "commercial/" + n),
];
const HOUSE_FIT = [0.72, 0.95, 0.95, 0.95, 0.95, 0.95, 1];
// natural roof tile colours, picked per tile so a street gets a mix: terracotta and clay reds, browns, slate and anthracite
const ROOF_TILES = ["#b5573c", "#a0442f", "#c2703f", "#8a4a36", "#6e4431", "#4f3a2f", "#59616a", "#3f444b"];
const SVC_MODEL = {
  water: "industrial/water-tower", food: "industrial/building-j", work: "industrial/building-h",
  health: "commercial/building-c", school: "commercial/building-e", power: "industrial/building-m",
};
const FOREST_TREES = ["suburban/tree-large", "suburban/tree-small"];
// Road pieces by neighbour mask (N=1, E=2, S=4, W=8). Each Kenney piece's own connections at rotation 0
// are tried in all four 90° turns; turning +90° about y maps E->N, S->E, W->S, N->W.
const ROAD = [];
for (const [key, mask] of [["square", 0], ["end", 2], ["straight", 10], ["bend", 12], ["intersection", 14], ["crossroad", 15]]) {
  let m = mask;
  for (let k = 0; k < 4; k++) {
    ROAD[m] ??= ["roads/road-" + key, k * Math.PI / 2];
    m = (m >> 1) | ((m & 1) << 3);
  }
}
// Kenney models face +z; turn a building toward the first road beside it.
function facing(x, y, fallback) {
  for (const [dx, dy, rot] of [[0, 1, 0], [1, 0, Math.PI / 2], [0, -1, Math.PI], [-1, 0, -Math.PI / 2]]) if (isRoad(x + dx, y + dy)) return rot;
  return fallback ? Math.PI / 2 : 0;
}

/* ---------- geometry and materials ---------- */
const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const flatGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const ringGeo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
const lineRingGeo = new THREE.RingGeometry(0.97, 1, 96).rotateX(-Math.PI / 2);
const discGeo = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
// Map overlays (rings, glows, previews) ignore depth so slopes and buildings never hide them.
const overlay = (opacity = 1) => new THREE.MeshBasicMaterial({ transparent: true, opacity, depthWrite: false, depthTest: false });

const m4 = new THREE.Matrix4(), shear = new THREE.Matrix4(), q = new THREE.Quaternion();
const pos = new THREE.Vector3(), scl = new THREE.Vector3(), col = new THREE.Color(), nrm = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const debris = new THREE.InstancedMesh(boxGeo, new THREE.MeshLambertMaterial({ color: "#ffffff" }), 400);
debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
debris.count = 0;
debris.frustumCulled = false;
scene.add(debris);

// One InstancedMesh per model part, created on first use. Forest trees are fixed (refilled with the terrain),
// every other batch is emptied at the start of each frame and refilled by draw().
const batches = new Map();
function batch(key, max) {
  let b = batches.get(key);
  if (!b) {
    const meshes = models[key].parts.map(p => {
      const m = new THREE.InstancedMesh(p.geometry, p.material, max);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
      return m;
    });
    batches.set(key, b = { meshes, count: 0, max, dirty: true, fixed: FOREST_TREES.includes(key) });
  }
  return b;
}
// Options: slope = [dy/dx, dy/dz] shears the model onto a tilted tile (roads; buildings stay upright),
// sy scales height separately (buildings rising out of the ground), roof colours a house's roof, max sizes the batch.
function putModel(key, x, y, z, s, rot, { slope, sy = s, roof, max = N } = {}) {
  const b = batch(key, max);
  if (b.count >= b.max) return;
  m4.compose(pos.set(0, 0, 0), q.setFromAxisAngle(UP, rot), scl.set(s, sy, s));
  if (slope) m4.premultiply(shear.set(1, 0, 0, 0, slope[0], 1, slope[1], 0, 0, 0, 1, 0, 0, 0, 0, 1));
  m4.setPosition(x, y, z);
  if (roof && models[key].roof) col.set(roof);
  for (const m of b.meshes) {
    m.setMatrixAt(b.count, m4);
    if (roof && models[key].roof) m.setColorAt(b.count, col);
  }
  b.count++;
  b.dirty = true;
}
function clearBatches(fixed) {
  for (const b of batches.values()) if (b.fixed === fixed) { b.count = 0; b.dirty = true; }
}
function flushBatches() {
  for (const b of batches.values()) {
    if (!b.dirty) continue;
    for (const m of b.meshes) {
      m.count = b.count;
      m.instanceMatrix.clearUpdateRanges();
      m.instanceMatrix.addUpdateRange(0, b.count * 16);
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) {
        m.instanceColor.clearUpdateRanges();
        m.instanceColor.addUpdateRange(0, b.count * 3);
        m.instanceColor.needsUpdate = true;
      }
    }
    b.dirty = false;
  }
}

// Draped quads follow the terrain: lots, parks, road beds and the coverage overlay are refilled into these every frame.
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
const decals = draped(new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
decals.receiveShadow = true;
const cover = draped(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.24, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
cover.renderOrder = 1;
// service lots: the service colour washed toward pavement grey
const LOT = {};
for (const t in SVC) LOT[t] = "#" + new THREE.Color(SVC[t].color).lerp(new THREE.Color("#9a9c94"), 0.55).getHexString();

// Pooled one-off objects (markers, badges, previews): take() hands out objects in draw order, the rest get hidden.
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
// round badge floating over each service so its type reads at any zoom
const badges = {};
for (const t in SVC) {
  badges[t] = new THREE.SpriteMaterial({
    map: canvasTexture(64, (g, s) => {
      g.fillStyle = SVC[t].color; circle(g, s / 2, s / 2, s * 0.46); g.fill();
      g.lineWidth = s * 0.06; g.strokeStyle = "#fffaf0"; circle(g, s / 2, s / 2, s * 0.43); g.stroke();
      paintIcon(g, t, s / 2, s / 2, s * 0.24, "#fffaf0", SVC[t].color);
    }),
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

  clearBatches(true);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (S.terrain[at(x, y)] !== FOREST || S.build[at(x, y)]) continue;
    for (let k = 0; k < 3; k++) {
      const ox = 0.2 + hash(x, y, k + 3) * 0.6, oz = 0.2 + hash(x, y, k + 9) * 0.6, s = 1.3 + hash(x, y, k + 17) * 0.7;
      putModel(FOREST_TREES[k % 2], x - W / 2 + ox, hAt(x + ox, y + oz) - 0.03, y - H / 2 + oz, s, hash(x, y, k + 23) * Math.PI * 2, { max: N * 3 });
    }
  }
  terrainDirty = false;
}

export function resize() {
  const rect = cv.parentElement.getBoundingClientRect();
  cssW = rect.width;
  cssH = rect.height;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(cssW, cssH, false);
  setViewport(cssW, cssH);
}
// Where the screen corners meet the ground, in tile units, for the minimap's view outline.
export function viewFootprint() {
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => {
    ray.setFromCamera(ndc.set(x, y), camera);
    const p = ray.ray.intersectPlane(plane, hit);
    return p ? [p.x + W / 2, p.z + H / 2] : [W / 2, H / 2];
  });
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
// Fits a model's larger footprint side to `fit` tiles.
const fitScale = (key, fit) => fit / Math.max(models[key].size.x, models[key].size.z);
function drawRoad(x, y) {
  const mask = (isRoad(x, y - 1) ? 1 : 0) | (isRoad(x + 1, y) ? 2 : 0) | (isRoad(x, y + 1) ? 4 : 0) | (isRoad(x - 1, y) ? 8 : 0);
  const [key, rot] = ROAD[mask];
  const h00 = cornerH(x, y), h10 = cornerH(x + 1, y), h01 = cornerH(x, y + 1), h11 = cornerH(x + 1, y + 1);
  const slope = [(h10 + h11 - h00 - h01) / 2, (h01 + h11 - h00 - h10) / 2];
  drape(decals, x, y, 0, 0.005, "#6e7280");
  putModel(key, wx(x), (h00 + h10 + h01 + h11) / 4 + 0.01, wz(y), 1, rot, { slope });
}
// Buildings stand on the tile's lowest corner, so on slopes they sit into the hillside instead of floating.
// New and upgraded houses rise out of the ground at full footprint, with a small overshoot.
function drawHouse(x, y, b, t) {
  const rise = popScale(b, t, 520);
  if (rise <= 0.01) return;
  const set = HOUSES[b.lvl - 1], key = set[b.hue % set.length], s = fitScale(key, HOUSE_FIT[b.lvl - 1]);
  putModel(key, wx(x), Math.max(0, tileSpan(x, y)[0]), wz(y), s, facing(x, y, b.rot), { sy: s * rise, roof: ROOF_TILES[(hash(x, y, 91) * ROOF_TILES.length) | 0] });
}
function drawSvc(x, y, b, t) {
  const s = popScale(b, t, 420);
  if (s <= 0.01) return;
  const key = SVC_MODEL[b.type], fs = fitScale(key, 0.95), base = Math.max(0, tileSpan(x, y)[0]);
  drape(decals, x, y, 0.03, 0.01, LOT[b.type]);
  putModel(key, wx(x), base, wz(y), fs * s, facing(x, y, false));
  const badge = take("badge:" + b.type, () => new THREE.Sprite(badges[b.type]));
  badge.position.set(wx(x), base + models[key].size.y * fs * s + 0.35, wz(y));
  badge.scale.setScalar(0.5 * s);
}
function drawPark(x, y, b, t) {
  const s = popScale(b, t, 400);
  drape(decals, x, y, 0.5 - 0.45 * s, 0.01, "#9cc77f");
  putModel("suburban/planter", wx(x), Math.max(0, tileTop(x, y)), wz(y), fitScale("suburban/planter", 0.7) * s, (x + y) % 2 ? 0 : Math.PI / 2);
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
// See-through copy of a model for placement previews, tinted red when the spot is invalid.
function ghost(key, err) {
  const g = take("ghost:" + key, () => {
    const grp = new THREE.Group();
    for (const p of models[key].parts) grp.add(new THREE.Mesh(p.geometry, new THREE.MeshBasicMaterial({ map: p.material.map, transparent: true, opacity: 0.7, depthWrite: false })));
    return grp;
  });
  for (const m of g.children) m.material.color.set(err ? "#ff6f5e" : "#ffffff");
  return g;
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
  const def = SVC[tool], key = SVC_MODEL[tool];
  groundRing("range", lineRingGeo, hover.x, hover.y, def.r, def.color, 0.9);
  const g = ghost(key, err);
  g.position.set(cx, base, cz);
  g.rotation.y = facing(hover.x, hover.y, false);
  g.scale.setScalar(fitScale(key, 0.95));
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

  clearBatches(false);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const b = S.build[at(x, y)];
    if (!b) continue;
    if (b.k === "road") drawRoad(x, y);
    else if (b.k === "house") drawHouse(x, y, b, t);
    else if (b.k === "svc") drawSvc(x, y, b, t);
    else if (b.k === "park") drawPark(x, y, b, t);
  }
  for (const n of S.needs) drawNeed(n, t);
  if (hover && tool) drawHover();

  stepEffects(dt);
  debris.count = 0;
  for (const p of particles) {
    if (debris.count >= 400) break;
    const s = p.size * Math.max(0, p.life);
    m4.compose(pos.set(p.x - W / 2, Math.max(0, hAt(p.x, p.z)) + p.h, p.z - H / 2), q.identity(), scl.set(s, s, s));
    debris.setMatrixAt(debris.count, m4);
    debris.setColorAt(debris.count++, col.set(p.color));
  }
  debris.instanceMatrix.needsUpdate = true;
  if (debris.instanceColor) debris.instanceColor.needsUpdate = true;
  flushBatches();
  finishDrape(decals);
  finishDrape(cover);
  hideUnused();
  renderer.render(scene, camera);
  drawLabels();
}

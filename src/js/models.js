/* ---------- models ---------- */
// Kenney City Kit models (CC0, kenney.nl), embedded in the bundle so the game still opens from file://.
// esbuild inlines every src/models/*/*.glb as bytes and each kit's colormap.png as a data URL.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const KITS = {
  suburban: ["building-type-a", "building-type-c", "building-type-h", "building-type-i", "building-type-g", "building-type-m",
    "building-type-e", "building-type-l", "building-type-o", "building-type-r", "building-type-s", "building-type-u",
    "tree-large", "tree-small", "planter"],
  commercial: ["building-a", "building-b", "building-c", "building-d", "building-e", "building-f", "building-g", "building-h",
    "building-l", "building-m", "building-skyscraper-a", "building-skyscraper-b", "building-skyscraper-c", "building-skyscraper-d",
    "building-skyscraper-e"],
  industrial: ["water-tower", "building-j", "building-h", "building-m"],
  roads: ["road-straight", "road-bend", "road-intersection", "road-crossroad", "road-end", "road-square"],
};

// "kit/name" -> { parts: [{ geometry, material }], size }, geometry centred on x/z with its base at y = 0
export const models = {};

const lambert = new Map();
function toLambert(m) {
  if (!lambert.has(m)) lambert.set(m, new THREE.MeshLambertMaterial({ map: m.map, color: m.color }));
  return lambert.get(m);
}
function template(root) {
  root.updateMatrixWorld(true);
  const parts = [], box = new THREE.Box3();
  root.traverse(o => {
    if (!o.isMesh) return;
    const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld);
    geometry.computeBoundingBox();
    box.union(geometry.boundingBox);
    parts.push({ geometry, material: toLambert(o.material) });
  });
  const c = box.getCenter(new THREE.Vector3());
  for (const p of parts) p.geometry.translate(-c.x, -box.min.y, -c.z);
  return { parts, size: box.getSize(new THREE.Vector3()) };
}
export async function loadModels() {
  await Promise.all(Object.entries(KITS).map(async ([kit, names]) => {
    const colormap = (await import(`../models/${kit}/colormap.png`)).default;
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(url => url.endsWith("colormap.png") ? colormap : url);
    const loader = new GLTFLoader(manager);
    await Promise.all(names.map(async name => {
      const bytes = (await import(`../models/${kit}/${name}.glb`)).default;
      const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
      models[`${kit}/${name}`] = template(gltf.scene);
    }));
  }));
}

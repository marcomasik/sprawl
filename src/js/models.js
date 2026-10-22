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

// "kit/name" -> { parts: [{ geometry, material }], size, roof }, geometry centred on x/z with its base at y = 0.
// roof is true for suburban houses: their green roof vertices carry a `roof` flag and take the instance colour instead.
export const models = {};

const lambert = new Map();
function toLambert(m) {
  if (!lambert.has(m)) lambert.set(m, new THREE.MeshLambertMaterial({ map: m.map, color: m.color }));
  return lambert.get(m);
}
// Luminance of the kit's main roof green (#61cb8b, linear); roof texels are scaled against it to keep their shading.
const ROOF_REF = 0.4156;
const roofed = new Map();
function roofMaterial(m) {
  if (roofed.has(m)) return roofed.get(m);
  const mat = new THREE.MeshLambertMaterial({ map: m.map, color: m.color });
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float roof;\nvarying float vRoof;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRoof = roof;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vRoof;")
      .replace("#include <color_fragment>", `#ifdef USE_COLOR
  if (vRoof > 0.5) diffuseColor.rgb = vColor.rgb * dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) / ${ROOF_REF.toFixed(4)};
#endif`);
  };
  mat.customProgramCacheKey = () => "roof";
  roofed.set(m, mat);
  return mat;
}
// Flags vertices that sample a roof green from the colormap and sit in the upper part of the model,
// which leaves the green bushes and hedges at the foot of the house alone.
function markRoofs(tpl, pixels) {
  for (const p of tpl.parts) {
    const g = p.geometry, uv = g.attributes.uv, pos = g.attributes.position, flag = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = Math.min(pixels.width - 1, Math.floor(uv.getX(i) * pixels.width));
      const y = Math.min(pixels.height - 1, Math.floor(uv.getY(i) * pixels.height));
      const k = (y * pixels.width + x) * 4, r = pixels.data[k], gr = pixels.data[k + 1], b = pixels.data[k + 2];
      flag[i] = gr > r + 40 && gr > b + 10 && pos.getY(i) > tpl.size.y * 0.3 ? 1 : 0;
    }
    g.setAttribute("roof", new THREE.BufferAttribute(flag, 1));
    p.material = roofMaterial(p.material);
  }
  tpl.roof = true;
}
async function readPixels(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, c.width, c.height);
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
  return { parts, size: box.getSize(new THREE.Vector3()), roof: false };
}
export async function loadModels() {
  await Promise.all(Object.entries(KITS).map(async ([kit, names]) => {
    const colormap = (await import(`../models/${kit}/colormap.png`)).default;
    const pixels = kit === "suburban" ? await readPixels(colormap) : null;
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(url => url.endsWith("colormap.png") ? colormap : url);
    const loader = new GLTFLoader(manager);
    await Promise.all(names.map(async name => {
      const bytes = (await import(`../models/${kit}/${name}.glb`)).default;
      const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
      const tpl = template(gltf.scene);
      if (pixels && name.startsWith("building-type-")) markRoofs(tpl, pixels);
      models[`${kit}/${name}`] = tpl;
    }));
  }));
}

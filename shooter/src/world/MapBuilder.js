import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { World } from './World.js';
import { Nav } from './Nav.js';
import { expandMap } from './MapData.js';

export const PALETTE = {
  bg: 0x0a0d14, attack: 0xff7a1a, defend: 0x19e0c8, edge: 0x8aa6d8, floor: '#1f2838', grid: '#33415c',
};

// Детерминированный «шум» по номеру бокса — чуть меняем оттенок, чтобы стены не были плоскими
const jitter = (i) => 0.9 + ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.2;

function floorTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = PALETTE.floor; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = PALETTE.grid; g.lineWidth = 2; g.strokeRect(1, 1, 126, 126);
  g.strokeStyle = '#273248'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.moveTo(0, 64); g.lineTo(128, 64); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

function siteTexture(letter, color) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const hex = '#' + new THREE.Color(color).getHexString();
  g.strokeStyle = hex; g.lineWidth = 8; g.globalAlpha = 0.85;
  g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2); g.stroke();
  g.globalAlpha = 0.18; g.fillStyle = hex; g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 0.9; g.fillStyle = hex; g.font = 'bold 130px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(letter, 128, 138);
  return new THREE.CanvasTexture(c);
}

// Загружает карту: физика (World), навигация (Nav) и меши в одной группе.
export function loadMap(def) {
  const exp = expandMap(def);
  const [W, D] = exp.size;
  const world = new World();

  // пол — невидимый бокс для физики
  world.add({ kind: 'floor', surf: exp.floor.surf, x0: -W / 2 - 4, z0: -D / 2 - 4, y0: -2, w: W + 8, d: D + 8, h: 2, nonav: true });
  const shown = [];
  for (const b of exp.boxes) { world.add(b); shown.push(b); }

  const group = new THREE.Group();
  group.name = 'map';

  // --- стены/укрытия одним мешем + контурные линии одним LineSegments ---
  const geos = [], edge = [];
  const col = new THREE.Color();
  shown.forEach((b, i) => {
    if (b.kind === 'patch') return;
    const g = new THREE.BoxGeometry(b.w, b.h, b.d);
    g.translate(b.x0 + b.w / 2, b.y0 + b.h / 2, b.z0 + b.d / 2);
    col.set(b.color).multiplyScalar(jitter(i));
    const arr = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < arr.length; k += 3) { arr[k] = col.r; arr[k + 1] = col.g; arr[k + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geos.push(g);
    if (b.outer) return;
    const x0 = b.x0, x1 = b.x1, y0 = b.y0, y1 = b.y1, z0 = b.z0, z1 = b.z1;
    const C = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
    for (const [p, q] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) edge.push(...C[p], ...C[q]);
  });
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
  geos.forEach((g) => g.dispose());
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.Float32BufferAttribute(edge, 3));
  group.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: PALETTE.edge, transparent: true, opacity: 0.55 })));

  // --- пол ---
  const tex = floorTexture(); tex.repeat.set(W / 8, D / 8);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W + 8, D + 8), new THREE.MeshLambertMaterial({ map: tex }));
  tex.repeat.set((W + 8) / 8, (D + 8) / 8);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  group.add(floor);

  // пятна покрытий (другой материал пола → другой звук шагов)
  for (const b of shown) {
    if (b.kind !== 'patch') continue;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.d), new THREE.MeshLambertMaterial({ color: b.color }));
    m.rotation.x = -Math.PI / 2; m.position.set(b.x0 + b.w / 2, b.h + 0.01, b.z0 + b.d / 2);
    m.receiveShadow = true; group.add(m);
  }

  // --- зоны спавна и точки закладки ---
  const spawnPlane = (list, color) => {
    if (!list.length) return;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const [x, z] of list) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 5, z1 - z0 + 5),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0.02, (z0 + z1) / 2);
    group.add(m);
  };
  spawnPlane(exp.attackSpawns, PALETTE.attack);
  spawnPlane(exp.defendSpawns, PALETTE.defend);
  for (const s of Object.values(exp.sites)) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.r * 2, s.r * 2),
      new THREE.MeshBasicMaterial({ map: siteTexture(s.name, 0xffd23f), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(s.x, 0.03, s.z);
    group.add(m);
  }

  // навигация считаем после построения мира
  const nav = new Nav(exp.nodes, world);
  return { exp, world, nav, group };
}

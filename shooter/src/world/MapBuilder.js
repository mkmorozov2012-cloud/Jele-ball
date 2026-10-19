import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { World } from './World.js';
import { Nav } from './Nav.js';
import { expandMap } from './MapData.js';
import { buildDust } from './DustMap.js';

export const PALETTE = {
  bg: 0x0a0d14, attack: 0xff7a1a, defend: 0x19e0c8, edge: 0x8aa6d8,
};

// ---------- процедурные текстуры (рисуются на canvas один раз) ----------
const rnd = (a, b) => a + Math.random() * (b - a);
function canvasTex(draw, size = 256, repeat = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const speckle = (g, n, size, a0 = 0.04, a1 = 0.1) => { for (let i = 0; i < n; i++) { const l = Math.random() < 0.5; g.fillStyle = l ? `rgba(255,255,255,${rnd(a0, a1)})` : `rgba(0,0,0,${rnd(a0, a1)})`; g.fillRect(rnd(0, size), rnd(0, size), rnd(1, 3), rnd(1, 3)); } };

const TEX = {
  concrete: () => canvasTex((g, s) => {
    g.fillStyle = '#d3d8e0'; g.fillRect(0, 0, s, s); speckle(g, 5000, s);
    for (let i = 0; i < 6; i++) { const x = rnd(0, s), y = rnd(0, s), gr = g.createRadialGradient(x, y, 2, x, y, rnd(20, 50)); gr.addColorStop(0, 'rgba(0,0,0,0.10)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }
    g.strokeStyle = 'rgba(40,50,70,0.55)'; g.lineWidth = 3;                         // стыки панелей
    g.beginPath(); g.moveTo(0, 1); g.lineTo(s, 1); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.moveTo(1, 0); g.lineTo(1, s); g.stroke();
    g.fillStyle = 'rgba(30,38,54,0.5)'; for (const [x, y] of [[10, 10], [s - 10, 10], [10, s / 2 - 10], [s - 10, s / 2 - 10], [10, s / 2 + 10], [s - 10, s / 2 + 10], [10, s - 10], [s - 10, s - 10]]) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
    const gr = g.createLinearGradient(0, s * 0.82, 0, s); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.22)'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }),
  wood: () => canvasTex((g, s) => {
    g.fillStyle = '#e1b783'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 4; i++) {                                                     // доски
      g.fillStyle = `rgba(${i % 2 ? '90,55,20' : '255,230,190'},0.12)`; g.fillRect(i * s / 4, 0, s / 4, s);
      g.strokeStyle = 'rgba(60,35,10,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4, s); g.stroke();
    }
    g.strokeStyle = 'rgba(80,45,15,0.25)'; g.lineWidth = 1; for (let i = 0; i < 90; i++) { const x = rnd(0, s); g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + rnd(-6, 6), s * 0.3, x + rnd(-6, 6), s * 0.7, x + rnd(-4, 4), s); g.stroke(); }
    g.strokeStyle = 'rgba(70,40,12,0.85)'; g.lineWidth = 16; g.strokeRect(8, 8, s - 16, s - 16);          // рама
    g.lineWidth = 12; g.beginPath(); g.moveTo(14, 14); g.lineTo(s - 14, s - 14); g.stroke();              // диагональ
    g.fillStyle = 'rgba(25,20,15,0.8)'; for (const [x, y] of [[16, 16], [s - 16, 16], [16, s - 16], [s - 16, s - 16]]) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
  }),
  metal: () => canvasTex((g, s) => {
    g.fillStyle = '#c4cddb'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {                         // рифлёный лист «ромбики»
      const cx = x * 32 + 16, cy = y * 32 + 16, a = (x + y) % 2 ? 0.28 : 0.18;
      g.save(); g.translate(cx, cy); g.rotate((x + y) % 2 ? Math.PI / 4 : -Math.PI / 4); g.fillStyle = `rgba(20,30,50,${a})`; g.fillRect(-9, -2.5, 18, 5); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(-9, -2.5, 18, 1.5); g.restore();
    }
    speckle(g, 2000, s); g.strokeStyle = 'rgba(20,30,50,0.55)'; g.lineWidth = 4; g.strokeRect(2, 2, s - 4, s - 4);
  }),
  corr: () => canvasTex((g, s) => {
    for (let x = 0; x < s; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, '#f2f2f2'); gr.addColorStop(0.5, '#b9b9b9'); gr.addColorStop(1, '#e6e6e6'); g.fillStyle = gr; g.fillRect(x, 0, 16, s); }
    for (let i = 0; i < 9; i++) { const x = rnd(0, s), y = rnd(0, s), gr = g.createRadialGradient(x, y, 2, x, y, rnd(14, 40)); gr.addColorStop(0, 'rgba(110,50,20,0.28)'); gr.addColorStop(1, 'rgba(110,50,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }
    g.fillStyle = 'rgba(20,20,20,0.7)'; g.fillRect(0, 0, s, 8); g.fillRect(0, s - 8, s, 8); speckle(g, 1200, s);
  }),
  floor: () => canvasTex((g, s) => {
    g.fillStyle = '#9aa3b3'; g.fillRect(0, 0, s, s); speckle(g, 6000, s, 0.03, 0.09);
    for (let i = 0; i < 4; i++) { g.fillStyle = `rgba(${i % 3 ? '255,255,255' : '0,0,0'},0.05)`; g.fillRect((i % 2) * s / 2, Math.floor(i / 2) * s / 2, s / 2, s / 2); }
    g.strokeStyle = 'rgba(15,22,36,0.7)'; g.lineWidth = 3; g.strokeRect(1, 1, s - 2, s - 2); g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1; g.strokeRect(5, 5, s - 10, s - 10);
  }),
  hazard: () => canvasTex((g, s) => {
    g.fillStyle = '#16181c'; g.fillRect(0, 0, s, s); g.fillStyle = '#f2c230';
    for (let i = -s; i < s * 2; i += 64) { g.beginPath(); g.moveTo(i, s); g.lineTo(i + 32, s); g.lineTo(i + 32 + s, 0); g.lineTo(i + s, 0); g.closePath(); g.fill(); }
  }),
  glow: () => canvasTex((g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }, 128, false),
  windows: () => canvasTex((g, s) => {
    g.fillStyle = '#0d1422'; g.fillRect(0, 0, s, s);
    for (let y = 6; y < s; y += 14) for (let x = 6; x < s; x += 12) { if (Math.random() < 0.38) { g.fillStyle = Math.random() < 0.7 ? 'rgba(255,214,140,0.85)' : 'rgba(120,210,255,0.8)'; g.fillRect(x, y, 6, 8); } }
  }),
};
const texCache = {};
const T = (k) => texCache[k] || (texCache[k] = TEX[k]());

// ---------- фото-текстуры Poly Haven (CC0, 1k): public/textures/<имя>_{diff,nor,rough}.jpg ----------
const loader = new THREE.TextureLoader();
const photoCache = {};
function photo(name) {
  if (photoCache[name]) return photoCache[name];
  const load = (suffix, srgb) => {
    const t = loader.load(`${import.meta.env.BASE_URL}textures/${name}_${suffix}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return (photoCache[name] = { map: load('diff', true), normalMap: load('nor', false), roughnessMap: load('rough', false) });
}
const photoMat = (name, extra = {}) => new THREE.MeshStandardMaterial({ ...photo(name), vertexColors: true, metalness: 0, ...extra });

function letterTexture(letter) {
  return canvasTex((g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,210,63,0.55)'); gr.addColorStop(1, 'rgba(255,210,63,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
    g.fillStyle = '#fff3c4'; g.font = `bold ${s * 0.6}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(letter, s / 2, s / 2 + s * 0.04);
  }, 256, false);
}
function siteTexture(letter) {
  return canvasTex((g, s) => {
    g.strokeStyle = '#ffd23f'; g.lineWidth = 8; g.globalAlpha = 0.85; g.beginPath(); g.arc(128, 128, 118, 0, 7); g.stroke();
    g.setLineDash([14, 10]); g.lineWidth = 3; g.beginPath(); g.arc(128, 128, 100, 0, 7); g.stroke(); g.setLineDash([]);
    g.globalAlpha = 0.16; g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(128, 128, 118, 0, 7); g.fill();
    g.globalAlpha = 0.9; g.font = 'bold 130px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffd23f'; g.fillText(letter, 128, 138);
  }, 256, false);
}

// детерминированный «шум» по номеру
const hash = (i) => { const x = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return x - Math.floor(x); };
const CONT_COLORS = ['#c0482f', '#2f78b8', '#3f9a62', '#d1a02f', '#7b4fb0'];

// ---------- сборка геометрии по «корзинам» материалов ----------
class Buckets {
  constructor() { this.b = {}; }
  push(key, geo) { (this.b[key] ||= []).push(geo); }
  // бокс с цветом по вершинам и UV в метрах (плитка tile метров)
  box(key, x0, y0, z0, w, h, d, color, tile = 2) {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(x0 + w / 2, y0 + h / 2, z0 + d / 2);
    const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
    this.color(g, color); this.push(key, g); return g;
  }
  color(g, color) {
    const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  cylinder(key, x, y, z, r, h, color, seg = 12) { const g = new THREE.CylinderGeometry(r, r, h, seg); g.translate(x, y + h / 2, z); this.color(g, color); this.push(key, g); }
  merge(key) { const arr = this.b[key]; if (!arr?.length) return null; const m = mergeGeometries(arr); arr.forEach((g) => g.dispose()); return m; }
}

// Загружает карту: физика (World), навигация (Nav) и меши в одной группе.
export function loadMap(def) {
  const exp = expandMap(def);
  const [W, D] = exp.size;
  const world = new World();
  world.add({ kind: 'floor', surf: exp.floor.surf, x0: -W / 2 - 4, z0: -D / 2 - 4, y0: -2, w: W + 8, d: D + 8, h: 2, nonav: true });
  for (const b of exp.boxes) world.add(b);

  const group = new THREE.Group(); group.name = 'map';
  const dust = def.visual === 'dust';                                               // готовая процедурная карта: свои стены, земля и декор
  if (dust) group.add(buildDust().group);
  const B = new Buckets(), edge = [];
  const mats = {
    wall: photoMat('concrete_wall_009'),
    outer: photoMat('broken_brick_wall'),
    brick: photoMat('red_brick'),
    wood: new THREE.MeshLambertMaterial({ map: T('wood'), vertexColors: true }),
    metal: photoMat('rusty_metal_04', { metalness: 0.5 }),
    corr: photoMat('corrugated_iron', { metalness: 0.5 }),
    trim: new THREE.MeshLambertMaterial({ vertexColors: true }),
    neon: new THREE.MeshBasicMaterial({ vertexColors: true }),
    hazard: new THREE.MeshLambertMaterial({ map: T('hazard') }),
  };
  const keyOf = { wall: 'wall', low: 'brick', crate: 'wood', plat: 'metal', stair: 'metal', cont: 'corr', barrel: 'trim' };

  exp.boxes.forEach((b, i) => {
    if (dust || b.kind === 'patch') return;
    const hv = 0.92 + hash(i) * 0.16;
    const col = new THREE.Color(b.kind === 'cont' ? CONT_COLORS[Math.floor(hash(i + 3) * CONT_COLORS.length)] : b.color).multiplyScalar(hv);
    if (b.kind === 'barrel') {                                                        // бочка: цилиндр с обручами
      const cx = b.x0 + b.w / 2, cz = b.z0 + b.d / 2;
      B.cylinder('trim', cx, 0, cz, 0.34, 0.95, col);
      B.cylinder('trim', cx, 0.12, cz, 0.355, 0.07, 0x20242a); B.cylinder('trim', cx, 0.7, cz, 0.355, 0.07, 0x20242a);
      B.cylinder('trim', cx, 0.95, cz, 0.28, 0.03, 0x3a414c);
      return;
    }
    B.box(b.outer && b.kind === 'wall' ? 'outer' : keyOf[b.kind] || 'wall', b.x0, b.y0, b.z0, b.w, b.h, b.d, col, b.kind === 'cont' ? 2.6 : 2);
    if (b.outer) return;
    const x1 = b.x1, y1 = b.y1, z1 = b.z1;
    // контурные линии
    const C = [[b.x0, b.y0, b.z0], [x1, b.y0, b.z0], [x1, b.y0, z1], [b.x0, b.y0, z1], [b.x0, y1, b.z0], [x1, y1, b.z0], [x1, y1, z1], [b.x0, y1, z1]];
    for (const [p, q] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) edge.push(...C[p], ...C[q]);
    if (b.kind === 'wall' && b.h >= 3) {
      B.box('trim', b.x0 - 0.05, b.y0, b.z0 - 0.05, b.w + 0.1, 0.4, b.d + 0.1, 0x2b313d);              // цоколь
      B.box('trim', b.x0 - 0.08, y1 - 0.14, b.z0 - 0.08, b.w + 0.16, 0.14, b.d + 0.16, 0x7d889c);        // карниз
      const long = Math.max(b.w, b.d);
      if (long >= 6 && hash(i + 9) < 0.6) {                                                               // неоновая полоса
        const nc = hash(i + 5) < 0.5 ? 0x4fd8ff : 0xffb347, alongX = b.w >= b.d, side = hash(i + 7) < 0.5 ? 1 : -1;
        if (alongX) B.box('neon', b.x0 + 0.3, 2.3, side > 0 ? z1 + 0.01 : b.z0 - 0.05, b.w - 0.6, 0.08, 0.05, nc);
        else B.box('neon', side > 0 ? x1 + 0.01 : b.x0 - 0.05, 2.3, b.z0 + 0.3, 0.05, 0.08, b.d - 0.6, nc);
      }
      if (long >= 8 && hash(i + 11) < 0.5) {                                                              // труба вдоль стены
        const alongX = b.w >= b.d;
        const g = new THREE.CylinderGeometry(0.11, 0.11, long - 0.5, 8);
        if (alongX) { g.rotateZ(Math.PI / 2); g.translate(b.x0 + b.w / 2, 3.2, z1 + 0.14); } else { g.rotateX(Math.PI / 2); g.translate(x1 + 0.14, 3.2, b.z0 + b.d / 2); }
        B.color(g, 0x7a8696); B.push('trim', g);
      }
    } else if (b.kind === 'crate') {
      for (const [px, pz] of [[b.x0, b.z0], [x1 - 0.1, b.z0], [b.x0, z1 - 0.1], [x1 - 0.1, z1 - 0.1]]) B.box('trim', px - 0.02, b.y0, pz - 0.02, 0.14, b.h, 0.14, 0x4a321c);   // угловые стойки
      B.box('trim', b.x0 - 0.03, y1 - 0.08, b.z0 - 0.03, b.w + 0.06, 0.1, b.d + 0.06, 0x4a321c);
    } else if (b.kind === 'low') {
      const hz = new THREE.PlaneGeometry(b.w, b.d); hz.rotateX(-Math.PI / 2); hz.translate(b.x0 + b.w / 2, y1 + 0.012, b.z0 + b.d / 2);
      const uv = hz.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * b.w / 1.2, uv.getY(k) * b.d / 1.2);
      B.push('hazard', hz);                                                                              // жёлто-чёрная полоса сверху
    } else if (b.kind === 'cont') {
      B.box('trim', b.x0 - 0.03, b.y0, b.z0 - 0.03, b.w + 0.06, 0.12, b.d + 0.06, 0x222222);
      B.box('trim', b.x0 - 0.03, y1 - 0.1, b.z0 - 0.03, b.w + 0.06, 0.1, b.d + 0.06, 0x222222);
    } else if (b.kind === 'plat' && b.h > 0.5) {
      B.box('neon', b.x0 + 0.1, b.y1 - 0.06, b.z0 + 0.1, b.w - 0.2, 0.04, 0.05, 0xffd23f);              // подсветка кромки помоста
      B.box('neon', b.x0 + 0.1, b.y1 - 0.06, z1 - 0.15, b.w - 0.2, 0.04, 0.05, 0xffd23f);
    }
  });

  for (const key of Object.keys(B.b)) {
    const geo = B.merge(key); if (!geo) continue;
    const mesh = new THREE.Mesh(geo, mats[key]);
    mesh.castShadow = key !== 'neon'; mesh.receiveShadow = key !== 'neon';
    group.add(mesh);
  }
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.Float32BufferAttribute(edge, 3));
  group.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: PALETTE.edge, transparent: true, opacity: 0.35 })));

  // ---------- пол ----------
  if (!dust) {
    const fp = photo('cracked_concrete_02');
    for (const t of [fp.map, fp.normalMap, fp.roughnessMap]) t.repeat.set((W + 8) / 4, (D + 8) / 4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W + 8, D + 8), new THREE.MeshStandardMaterial({ ...fp, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; group.add(floor);
  }
  for (const b of exp.boxes) {                                                     // пятна покрытий
    if (dust || b.kind !== 'patch') continue;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.d), new THREE.MeshLambertMaterial({ color: b.surf === 'sand' ? 0x6d6247 : 0x3a4658 }));
    m.rotation.x = -Math.PI / 2; m.position.set(b.x0 + b.w / 2, b.h + 0.012, b.z0 + b.d / 2); m.receiveShadow = true; group.add(m);
  }

  // ---------- зоны спавна, точки закладки ----------
  const spawnPlane = (list, color) => {
    if (!list.length) return;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const [x, z] of list) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 5, z1 - z0 + 5), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0.02, (z0 + z1) / 2); group.add(m);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hw = (x1 - x0 + 5) / 2, hd = (z1 - z0 + 5) / 2;     // неоновая рамка зоны спавна
    const lines = [];
    for (const [ax, az, bx, bz] of [[-hw, -hd, hw, -hd], [hw, -hd, hw, hd], [hw, hd, -hw, hd], [-hw, hd, -hw, -hd]]) lines.push(cx + ax, 0.04, cz + az, cx + bx, 0.04, cz + bz);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color })));
  };
  if (!dust) { spawnPlane(exp.attackSpawns, PALETTE.attack); spawnPlane(exp.defendSpawns, PALETTE.defend); }
  const pylons = new Buckets();
  for (const s of Object.values(exp.sites)) {
    if (dust) {                                                                    // только светящийся маяк-буква над точкой
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: letterTexture(s.name), transparent: true, depthWrite: false }));
      sp.scale.set(5, 5, 1); sp.position.set(s.x, 7.5, s.z); group.add(sp); continue;
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.r * 2, s.r * 2), new THREE.MeshBasicMaterial({ map: siteTexture(s.name), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(s.x, 0.03, s.z); group.add(m);
    // маяк-буква над точкой и четыре пилона по периметру
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: letterTexture(s.name), transparent: true, depthWrite: false }));
    sp.scale.set(5, 5, 1); sp.position.set(s.x, 6.2, s.z); group.add(sp);
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2, px = s.x + Math.cos(a) * s.r * 0.98, pz = s.z + Math.sin(a) * s.r * 0.98;
      pylons.box('trim', px - 0.25, 0, pz - 0.25, 0.5, 2.6, 0.5, 0x2e3542); pylons.box('neon', px - 0.2, 2.6, pz - 0.2, 0.4, 0.5, 0.4, 0xffd23f);
    }
  }
  for (const key of Object.keys(pylons.b)) { const geo = pylons.merge(key); if (geo) group.add(new THREE.Mesh(geo, mats[key])); }

  // ---------- фонари со световыми конусами и пятнами света ----------
  const lampB = new Buckets(), glow = [], cones = [];
  for (const p of exp.props) {
    if (p.type !== 'lamp') continue;
    lampB.box('trim', p.x - 0.07, 0, p.z - 0.07, 0.14, p.h, 0.14, 0x39414f);
    lampB.box('neon', p.x - 0.35, p.h, p.z - 0.18, 0.7, 0.12, 0.36, 0xfff0c8);
    lampB.box('trim', p.x - 0.4, p.h + 0.12, p.z - 0.22, 0.8, 0.06, 0.44, 0x2a303b);
    const pool = new THREE.PlaneGeometry(10, 10); pool.rotateX(-Math.PI / 2); pool.translate(p.x, 0.035, p.z); glow.push(pool);
    const cone = new THREE.ConeGeometry(2.6, p.h, 14, 1, true); cone.translate(p.x, p.h / 2, p.z); cones.push(cone);
  }
  for (const key of Object.keys(lampB.b)) { const geo = lampB.merge(key); if (geo) group.add(new THREE.Mesh(geo, mats[key])); }
  if (glow.length) group.add(new THREE.Mesh(mergeGeometries(glow), new THREE.MeshBasicMaterial({ map: T('glow'), color: 0xffe6b0, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false })));
  if (cones.length) group.add(new THREE.Mesh(mergeGeometries(cones), new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));

  const nav = new Nav(exp.nodes, world);
  return { exp, world, nav, group };
}

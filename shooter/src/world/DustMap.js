import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Витрина карты в стиле CS2 «Dust»: песчаные дома с арками, окна, ставни, навесы, ящики, машины.
// Геометрия собирается процедурно и склеивается по материалам (≈15 draw call'ов на всю карту).
// Коллизии и навигацию подключим, когда карта будет утверждена: список solids уже собирается.

const BASE = import.meta.env.BASE_URL;
const TL = new THREE.TextureLoader();
const PI = Math.PI;

function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function pbr(name, extra = {}) {
  const load = (s, srgb) => { const t = TL.load(`${BASE}textures/${name}_${s}.jpg`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return new THREE.MeshStandardMaterial({ map: load('diff', true), normalMap: load('nor'), roughnessMap: load('rough'), vertexColors: true, metalness: 0, ...extra });
}
function stripes() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 8;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 8); g.fillStyle = '#9a9488';
  for (let i = 0; i < 4; i++) g.fillRect(i * 32 + 16, 0, 16, 8);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

// метров на один повтор текстуры
const TILE = { plaster: 3.2, plaster2: 3.2, stone: 2.4, wood: 1.6, sand: 6, tiles: 2.2, metal: 2 };

const GAIN = { plaster: 1.6, plaster2: 1.25, stone: 1.1, wood: 2.6, metal: 2.2 };

function makeMaterials() {
  return {
    plaster: pbr('plaster_grey_04'),
    plaster2: pbr('white_rough_plaster'),
    stone: pbr('sandstone_blocks_05'),
    wood: pbr('wood_plank_wall'),
    sand: pbr('gravelly_sand'),
    tiles: pbr('clay_roof_tiles_02'),
    metal: pbr('rusty_metal_04', { metalness: 0.15, roughness: 0.8 }),
    dark: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.2 }),
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.35 }),
    tar: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    leaf: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }),
    cloth: new THREE.MeshStandardMaterial({ map: stripes(), vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }),
  };
}

class Mesher {
  constructor() { this.b = {}; }
  add(key, geo, color = 0xffffff, m) {
    if (geo.index) geo = geo.toNonIndexed();
    if (m) geo.applyMatrix4(m);
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
    const n = geo.attributes.position.count, c = new THREE.Color(color), arr = new Float32Array(n * 3);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (GAIN[key]) c.multiplyScalar(GAIN[key]);                                    // серые текстуры красим в песок, поэтому светлим
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    (this.b[key] ||= []).push(geo);
  }
  box(key, cx, y0, cz, w, h, d, color, yaw = 0) {
    const m = new THREE.Matrix4().makeRotationY(yaw); m.setPosition(cx, y0 + h / 2, cz);
    this.add(key, new THREE.BoxGeometry(w, h, d), color, m);
  }
  cyl(key, cx, y0, cz, r0, r1, h, color, seg = 14) {
    const m = new THREE.Matrix4().makeTranslation(cx, y0 + h / 2, cz);
    this.add(key, new THREE.CylinderGeometry(r1, r0, h, seg), color, m);
  }
  build(mats) {
    const out = new THREE.Group();
    for (const [key, list] of Object.entries(this.b)) {
      const mat = mats[key], s = TILE[key];
      if (mat.map && s) for (const g of list) worldUV(g, 1 / s);
      const mesh = new THREE.Mesh(mergeGeometries(list), mat);
      mesh.castShadow = mesh.receiveShadow = true; mesh.name = key;
      out.add(mesh);
    }
    return out;
  }
}

// UV по мировым координатам (проекция по доминирующей оси нормали): бесшовно на любой геометрии
function worldUV(g, k) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * k; uv[i * 2 + 1] = v * k;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

const archPath = (p, uc, y0, w, hs) => { p.lineTo(uc - w / 2, y0 + hs); p.absarc(uc, y0 + hs, w / 2, PI, 0, true); p.lineTo(uc + w / 2, y0); };
function archG(w, h) {
  const s = new THREE.Shape(), hs = h - w / 2;
  s.moveTo(-w / 2, 0); archPath(s, 0, 0, w, hs); s.closePath();
  return new THREE.ShapeGeometry(s, 12);
}

const WALL = [0xf3e5c0, 0xe9d3a2, 0xdfc592, 0xf0e7d3, 0xdab98a, 0xe8d6b0, 0xd9c19a];
const TRIM = [0x2f6f8a, 0x3c7d5d, 0x8a3b2c, 0x54606e, 0x8c6a2c, 0x35566e];
const AWN = [0xc8553d, 0x2f8a80, 0xd9a23a, 0x3f6aa0, 0xb8b0a0];
const STONE = 0xe6d5ae;

export function buildDust() {
  const R = rng(11), rr = (a, b) => a + R() * (b - a), pick = (a) => a[Math.floor(R() * a.length)];
  const M = new Mesher(), mats = makeMaterials(), group = new THREE.Group(), solids = [];

  // ---------- стена с арочными проёмами и окнами (экструзия контура) ----------
  // dir 'x' — стена идёт вдоль +X от (ax,az); 'z' — вдоль +Z. doors: {u,w,h}, wins: {u,y,w,h}
  function wall(ax, az, dir, len, h, th, o = {}) {
    const doors = (o.doors || []).slice().sort((a, b) => a.u - b.u), wins = o.wins || [];
    const s = new THREE.Shape(); s.moveTo(0, 0);
    for (const d of doors) { s.lineTo(d.u - d.w / 2, 0); archPath(s, d.u, 0, d.w, d.h - d.w / 2); }
    s.lineTo(len, 0); s.lineTo(len, h); s.lineTo(0, h); s.closePath();
    for (const w of wins) { const hp = new THREE.Path(); hp.moveTo(w.u - w.w / 2, w.y); archPath(hp, w.u, w.y, w.w, w.h - w.w / 2); hp.closePath(); s.holes.push(hp); }
    const place = (g, t, extra = 0) => {
      g.translate(0, 0, -t / 2 - extra);
      const m = new THREE.Matrix4();
      if (dir === 'z') m.makeRotationY(-PI / 2);
      m.setPosition(ax, 0, az);
      return m;
    };
    const g = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: false, curveSegments: 12 });
    M.add(o.mat || 'plaster', g, o.color ?? pick(WALL), place(g, th));
    // каменные обрамления арок и карниз
    for (const d of doors) {
      const ow = d.w + 0.9, hs = d.h - d.w / 2, sh = new THREE.Shape();
      sh.moveTo(-ow / 2, 0); archPath(sh, 0, 0, ow, hs + 0.0); sh.closePath();
      const hp = new THREE.Path(); hp.moveTo(-d.w / 2, 0); archPath(hp, 0, 0, d.w, hs); hp.closePath(); sh.holes.push(hp);
      const gg = new THREE.ExtrudeGeometry(sh, { depth: th + 0.3, bevelEnabled: false, curveSegments: 12 });
      gg.translate(d.u, 0, -th / 2 - 0.15);
      const m = new THREE.Matrix4(); if (dir === 'z') m.makeRotationY(-PI / 2); m.setPosition(ax, 0, az);
      M.add('stone', gg, STONE, m);
    }
    const cx = dir === 'x' ? ax + len / 2 : ax, cz = dir === 'x' ? az : az + len / 2;
    M.box('stone', cx, h - 0.3, cz, dir === 'x' ? len + 0.3 : th + 0.5, 0.3, dir === 'x' ? th + 0.5 : len + 0.3, STONE);
    M.box('stone', cx, 0, cz, dir === 'x' ? len : th + 0.16, 0.6, dir === 'x' ? th + 0.16 : len, STONE);
    for (const e of [0, len]) M.box('stone', dir === 'x' ? ax + e : ax, 0, dir === 'x' ? az : az + e, th + 0.3, h, th + 0.3, STONE);          // окантовка торцов стены
    solids.push(dir === 'x' ? { x0: ax, z0: az - th / 2, x1: ax + len, z1: az + th / 2, h } : { x0: ax - th / 2, z0: az, x1: ax + th / 2, z1: az + len, h });
  }

  // ---------- окно/дверь на фасаде ----------
  function onFacade(key, geo, color, bx, bz, theta, u, y, off) {
    const c = Math.cos(theta), s = Math.sin(theta), m = new THREE.Matrix4().makeRotationY(theta);
    m.setPosition(bx + c * u + s * off, y, bz - s * u + c * off);
    M.add(key, geo, color, m);
  }
  function windowAt(bx, bz, th, u, y, shutter) {
    onFacade('stone', archG(1.55, 2.2), STONE, bx, bz, th, u, y, 0.03);
    onFacade('dark', archG(1.15, 1.85), 0x14110e, bx, bz, th, u, y + 0.14, 0.07);
    onFacade('stone', new THREE.BoxGeometry(1.9, 0.14, 0.4), STONE, bx, bz, th, u, y - 0.04, 0.2);
    if (shutter) { const c = pick(TRIM); for (const sx of [-1, 1]) onFacade('wood', new THREE.BoxGeometry(0.46, 1.9, 0.06), c, bx, bz, th, u + sx * 0.98, y + 1.05, 0.08); }
  }
  function doorAt(bx, bz, th, u) {
    onFacade('stone', archG(2.1, 3.15), STONE, bx, bz, th, u, 0, 0.03);
    onFacade('wood', archG(1.6, 2.85), pick(TRIM), bx, bz, th, u, 0, 0.08);
    onFacade('stone', new THREE.BoxGeometry(2.5, 0.16, 0.7), STONE, bx, bz, th, u, 0, 0.3);
  }
  function awning(bx, bz, th, u, wd, y, color) {
    const g = new THREE.BoxGeometry(wd, 0.05, 2.0); g.rotateX(0.32); g.translate(0, 0, 1.05);
    onFacade('cloth', g, color, bx, bz, th, u, y, 0);
    for (const sx of [-1, 1]) onFacade('wood', new THREE.BoxGeometry(0.1, y, 0.1), 0x4a3320, bx, bz, th, u + sx * (wd / 2 - 0.1), 0, 1.95);
  }

  // ---------- здание ----------
  function building(cx, cz, w, d, h, o = {}) {
    const col = o.color ?? pick(WALL), mat = o.mat || (R() < 0.22 ? 'plaster2' : 'plaster');
    M.box(mat, cx, 0, cz, w, h, d, col);
    M.box('stone', cx, 0, cz, w + 0.16, 0.7, d + 0.16, STONE);
    M.box('stone', cx, h - 0.32, cz, w + 0.5, 0.32, d + 0.5, STONE);
    for (const [px, pz, pw, pd] of [[cx, cz - d / 2, w + 0.3, 0.3], [cx, cz + d / 2, w + 0.3, 0.3], [cx - w / 2, cz, 0.3, d], [cx + w / 2, cz, 0.3, d]]) M.box(mat, px, h, pz, pw, 0.6, pd, col);
    M.box('tar', cx, h - 0.05, cz, w - 0.2, 0.08, d - 0.2, 0xb8a98c);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) M.box('stone', cx + sx * w / 2, 0, cz + sz * d / 2, 0.5, h, 0.5, STONE);   // угловые окантовки граней
    for (const y of [0.7, h - 0.6]) M.box('dark', cx, y, cz, w + 0.22, 0.1, d + 0.22, 0x3a3631);                                              // тёмные пояса по периметру
    solids.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2, h });
    const sides = [[0, cx, cz + d / 2, w], [PI, cx, cz - d / 2, w], [PI / 2, cx + w / 2, cz, d], [-PI / 2, cx - w / 2, cz, d]];
    sides.forEach(([th, bx, bz, L], i) => {
      if (o.skip?.includes(i)) return;
      const n = Math.max(0, Math.floor((L - 1.6) / 3.5)), floors = h >= 6.5 ? [1.4, 4.4] : [1.5];
      for (let k = 0; k < n; k++) {
        const u = (k - (n - 1) / 2) * 3.5;
        floors.forEach((y, fi) => {
          if (o.door === i && fi === 0 && Math.abs(u) < 2.2) return;
          if (R() < 0.18) return;
          windowAt(bx, bz, th, u, y, R() < 0.45);
        });
      }
      if (o.door === i) { doorAt(bx, bz, th, 0); if (o.awn) awning(bx, bz, th, 0, 3.4, 3.4, pick(AWN)); }
      if (!o.far && h >= 6.5 && L > 8 && R() < 0.4) {                                                        // балкон с деревянными перилами
        const u = rr(-L / 4, L / 4);
        onFacade('stone', new THREE.BoxGeometry(3.4, 0.2, 1.2), STONE, bx, bz, th, u, 3.25, 0.6);
        for (let k = 0; k < 8; k++) onFacade('wood', new THREE.BoxGeometry(0.07, 0.95, 0.07), 0x5a4026, bx, bz, th, u - 1.6 + k * 0.457, 3.45, 1.15);
        onFacade('wood', new THREE.BoxGeometry(3.4, 0.08, 0.1), 0x5a4026, bx, bz, th, u, 4.4, 1.15);
      }
      if (!o.far && R() < 0.4) for (let k = -Math.floor(L / 2.4); k <= Math.floor(L / 2.4); k++) onFacade('wood', new THREE.BoxGeometry(0.16, 0.16, 0.7), 0x5a4026, bx, bz, th, k * 1.2, h - 0.9, 0.3);   // торцы балок
      if (o.door === i) { /* дверь уже поставлена */ }
      else if (R() < 0.3 && L > 6) { const u = rr(-L / 3, L / 3); onFacade('wood', new THREE.BoxGeometry(2.4, 2.6, 0.08), pick(TRIM), bx, bz, th, u, 0.1, 0.05); }   // глухие ворота-ставни
    });
    if (h > 5 && R() < 0.6) M.cyl('metal', cx + rr(-w / 3, w / 3), h, cz + rr(-d / 3, d / 3), 1.0, 1.0, 1.8, 0xb8aa92, 16);     // бак на крыше
    if (R() < 0.7) M.box('metal', cx + rr(-w / 3, w / 3), h, cz + rr(-d / 3, d / 3), 1.1, 0.8, 0.8, 0xc9c4b8);                   // кондиционер
    if (o.pitch) {                                                                                                 // черепичная двускатная крыша
      for (const sx of [-1, 1]) {
        const g = new THREE.BoxGeometry(w + 0.8, 0.14, (d / 2) / Math.cos(0.38) + 0.5); g.rotateX(sx * 0.38);
        const m = new THREE.Matrix4().makeTranslation(cx, h + 0.9, cz + sx * d / 4); M.add('tiles', g, 0xffffff, m);
      }
    }
  }

  // ---------- реквизит ----------
  const crate = (cx, cz, s, y = 0, yaw = 0) => {
    M.box('wood', cx, y, cz, s, s, s, 0xc9a574, yaw);
    M.box('dark', cx, y + s - 0.03, cz, s + 0.06, 0.05, s + 0.06, 0x2e2a26, yaw);                  // кромка крышки
    const c = 0x5a4026, e = s / 2 - 0.04;
    for (const sy of [-1, 1]) for (const sx of [-1, 1]) {
      const cs = Math.cos(yaw), sn = Math.sin(yaw), px = sx * e, pz = sy * e;
      M.box('wood', cx + cs * px + sn * pz, y, cz - sn * px + cs * pz, 0.09, s, 0.09, c, yaw);
    }
  };
  const stack = (cx, cz, yaw = 0) => { crate(cx, cz, 1.1, 0, yaw); crate(cx + 1.2, cz + 0.1, 1.1, 0, yaw + 0.1); crate(cx + 0.5, cz + 0.05, 0.95, 1.1, yaw - 0.15); };
  const barrel = (cx, cz, color = pick([0x2f5f8a, 0x7a3b2a, 0x3f6a45, 0xb3893a])) => { M.cyl('metal', cx, 0, cz, 0.36, 0.36, 0.95, color); for (const y of [0.15, 0.7]) M.cyl('metal', cx, y, cz, 0.375, 0.375, 0.06, 0x2a2622); };
  function truck(cx, cz, yaw, color) {
    const T = (x, y, z) => { const c = Math.cos(yaw), s = Math.sin(yaw); return [cx + c * x + s * z, y, cz - s * x + c * z]; };
    const b = (lx, ly, lz, w, h, d, col, k = 'paint') => { const [x, y, z] = T(lx, 0, lz); M.box(k, x, ly, z, w, h, d, col, yaw); };
    b(0, 0.45, 0, 4.4, 0.8, 1.9, color); b(0.9, 1.25, 0, 1.9, 0.75, 1.7, color);
    b(0.9, 1.3, 0, 1.95, 0.5, 1.72, 0x15191c, 'dark');
    for (const z of [-0.9, 0.9]) b(-1.2, 1.25, z, 2.0, 0.4, 0.08, color);
    for (const [wx, wz] of [[-1.4, -0.95], [1.4, -0.95], [-1.4, 0.95], [1.4, 0.95]]) {
      const [x, , z] = T(wx, 0, wz); const g = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 16); g.rotateX(PI / 2);
      const m = new THREE.Matrix4().makeRotationY(yaw); m.setPosition(x, 0.42, z); M.add('dark', g, 0x1b1b1b, m);
    }
  }
  function palm(cx, cz) {
    const lean = rr(-0.5, 0.5), H = rr(5, 7);
    for (let i = 0; i < 7; i++) M.cyl('wood', cx + lean * (i / 7) ** 2 * 2, i * H / 7, cz, 0.3 - i * 0.02, 0.28 - i * 0.02, H / 7 + 0.02, 0x8a6e4a, 8);
    for (let i = 0; i < 10; i++) {
      const g = new THREE.PlaneGeometry(0.7, 3.4, 1, 6); g.translate(0, 1.7, 0);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) { const t = p.getY(k) / 3.4; p.setZ(k, -t * t * 1.6); p.setX(k, p.getX(k) * (1 - t * 0.85)); }
      g.computeVertexNormals(); g.rotateX(-1.0 - rr(0, 0.3)); g.rotateY(i / 10 * PI * 2 + rr(-0.2, 0.2));
      M.add('leaf', g, pick([0x5a7a3a, 0x6a8a45, 0x4f6f33]), new THREE.Matrix4().makeTranslation(cx + lean * 2, H, cz));
    }
  }
  const wires = [];
  const tilt = (key, cx, y, cz, w, t, d, rx, yaw, color) => {
    const m = new THREE.Matrix4().makeRotationY(yaw).multiply(new THREE.Matrix4().makeRotationX(rx)); m.setPosition(cx, y, cz);
    M.add(key, new THREE.BoxGeometry(w, t, d), color, m);
  };
  const local = (cx, cz, yaw) => { const c = Math.cos(yaw), s = Math.sin(yaw); return (x, z) => [cx + c * x + s * z, cz - s * x + c * z]; };
  const sack = (x, z, y = 0) => { const g = new THREE.SphereGeometry(0.4, 8, 6); g.scale(1, 0.7, 0.8); M.add('tar', g, pick([0xcdb98a, 0xbfa97a, 0xd6c79c]), new THREE.Matrix4().makeTranslation(x, y + 0.28, z)); };
  function stall(cx, cz, yaw = 0) {                                               // рыночный прилавок с навесом и товаром
    const P = local(cx, cz, yaw);
    for (const [x, z] of [[-1.5, -0.9], [1.5, -0.9], [-1.5, 0.9], [1.5, 0.9]]) { const [px, pz] = P(x, z); M.box('wood', px, 0, pz, 0.12, z < 0 ? 2.6 : 2.3, 0.12, 0x6a4a2c); }
    tilt('cloth', cx, 2.45, cz, 3.5, 0.04, 2.4, 0.14, yaw, pick(AWN));
    const [tx, tz] = P(0, 0.1); M.box('wood', tx, 0, tz, 2.8, 0.85, 1.0, 0xc29a64, yaw);
    for (let i = 0; i < 6; i++) { const [gx, gz] = P(-1.1 + i * 0.44, 0.1); M.cyl('paint', gx, 0.85, gz, 0.17, 0.2, 0.18, pick([0xc8553d, 0xd9a23a, 0x6a8a45, 0xe0d0a0]), 10); }
    const [bx, bz] = P(rr(-1, 1), -1.5); crate(bx, bz, 0.8, 0, yaw); const [sx, sz] = P(1.9, 0.4); sack(sx, sz); sack(sx + 0.3, sz + 0.5);
  }
  function sandbags(cx, cz, len, yaw = 0, y0 = 0, layers = 3) {                   // мешки с песком в три слоя
    const c = Math.cos(yaw), s = Math.sin(yaw), n = Math.round(len / 0.9);
    for (let l = 0; l < layers; l++) for (let i = 0; i < n - (l % 2); i++) {
      const u = (i - (n - 1) / 2 + (l % 2) * 0.5) * 0.9 + rr(-0.03, 0.03);
      M.box('tar', cx + c * u, y0 + l * 0.33, cz - s * u, 0.9, 0.34, 0.6, pick([0xb5a27a, 0xa89570, 0xbfae86]), yaw + rr(-0.05, 0.05));
    }
  }
  function bunting(x1, z1, x2, z2, y) {                                           // гирлянда флажков между домами
    const len = Math.hypot(x2 - x1, z2 - z1), th = Math.atan2(-(z2 - z1), x2 - x1), n = Math.round(len / 0.8), pts = [];
    for (let i = 0; i <= n * 2; i++) { const t = i / (n * 2); pts.push(new THREE.Vector3(x1 + (x2 - x1) * t, y - Math.sin(t * PI) * 0.9, z1 + (z2 - z1) * t)); }
    wires.push(pts);
    for (let i = 1; i < n; i++) {
      const t = i / n, g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.2, 0, 0), new THREE.Vector3(0.2, 0, 0), new THREE.Vector3(0, -0.42, 0)]);
      g.computeVertexNormals();
      const m = new THREE.Matrix4().makeRotationY(th); m.setPosition(x1 + (x2 - x1) * t, y - Math.sin(t * PI) * 0.9 - 0.02, z1 + (z2 - z1) * t);
      M.add('cloth', g, pick(AWN), m);
    }
  }
  function tent(cx, cz, yaw = 0) {                                                // двускатная палатка
    for (const sx of [-1, 1]) tilt('cloth', cx + Math.cos(yaw) * sx * 0.9, 1.15, cz - Math.sin(yaw) * sx * 0.9, 0.04, 2.5, 3.2, 0, yaw, 0xd9cfb4);
    const P = local(cx, cz, yaw);
    for (const sx of [-1, 1]) { const [x, z] = P(sx * 0.9, 0); const g = new THREE.BoxGeometry(0.04, 2.0, 3.2); const m = new THREE.Matrix4().makeRotationY(yaw).multiply(new THREE.Matrix4().makeRotationZ(-sx * 0.5)); m.setPosition(x, 1.0, z); M.add('cloth', g, 0xd9cfb4, m); }
  }
  function well(cx, cz) {
    M.cyl('stone', cx, 0, cz, 1.55, 1.55, 0.75, 0xe0cfa8, 24); M.cyl('dark', cx, 0.75, cz, 1.25, 1.25, 0.03, 0x3f6f75, 24);
    for (const sx of [-1, 1]) M.box('wood', cx + sx * 1.1, 0.7, cz, 0.14, 2.0, 0.14, 0x5a4026);
    M.box('wood', cx, 2.6, cz, 2.5, 0.14, 0.14, 0x5a4026);
  }
  const planter = (x, z) => { M.box('stone', x, 0, z, 1.2, 0.6, 0.6, 0xe0cfa8); const g = new THREE.SphereGeometry(0.5, 8, 6); g.scale(1.2, 0.8, 0.9); M.add('leaf', g, 0x56733a, new THREE.Matrix4().makeTranslation(x, 0.85, z)); };
  const bench = (x, z, yaw = 0) => { M.box('wood', x, 0.45, z, 1.8, 0.1, 0.5, 0x8a6a44, yaw); for (const s of [-1, 1]) M.box('stone', x + Math.cos(yaw) * s * 0.7, 0, z - Math.sin(yaw) * s * 0.7, 0.2, 0.45, 0.45, 0xe0cfa8, yaw); };
  const tarpStack = (cx, cz, yaw = 0, y = 0) => { crate(cx, cz, 1.2, y, yaw); crate(cx + 1.3, cz, 1.2, y, yaw); crate(cx + 0.65, cz, 1.1, y + 1.2, yaw); tilt('cloth', cx + 0.65, y + 2.45, cz, 2.8, 0.05, 1.6, 0.0, yaw, 0x6a7f5a); };
  const pole = (x, z) => { M.cyl('wood', x, 0, z, 0.16, 0.12, 8, 0x5a4630, 8); M.box('wood', x, 7.0, z, 2.4, 0.12, 0.12, 0x5a4630); };

  // ====================== КАРТА ======================
  const W = 100, D = 80;
  // периметр: высокие стены с арочными окнами
  const perim = (ax, az, dir, len) => {
    const wins = []; for (let u = 4; u < len - 3; u += 6.5) if (R() < 0.8) wins.push({ u, y: 4.8, w: 1.5, h: 2.6 });
    wall(ax, az, dir, len, 9.5, 1.4, { wins, mat: 'plaster', color: pick(WALL) });
  };
  perim(-W / 2, -D / 2, 'x', W); perim(-W / 2, D / 2, 'x', W); perim(-W / 2, -D / 2, 'z', D); perim(W / 2, -D / 2, 'z', D);

  // центральные блоки и улицы
  building(-17, -1, 18, 26, 7.5, { door: 2, skip: [], awn: true });
  building(16, -1, 16, 26, 7.5, { door: 3 });
  building(43, 8, 14, 44, 8.5, { door: 3 });
  building(-43, 8, 14, 44, 8.5, { door: 2 });
  // ворота-арки: «двери мида», ворота длинной и узкой улиц
  wall(-8, -12, 'x', 16, 6.2, 1.2, { doors: [{ u: 8, w: 5.2, h: 5 }], mat: 'plaster2' });
  wall(24, 12.6, 'x', 12, 6.8, 1.2, { doors: [{ u: 6, w: 5, h: 4.9 }] });
  wall(-36, 12.6, 'x', 10, 6.8, 1.2, { doors: [{ u: 5, w: 4.6, h: 4.6 }] });
  // T-спавн: лавки по бокам, низкие стены, ящики
  building(-14, 31, 9, 8, 5.6, { door: 0, awn: true, pitch: true });
  building(14, 31, 9, 8, 5.6, { door: 0, awn: true, pitch: true });
  building(0, 38, 16, 4, 7, { skip: [0, 1, 2, 3] });
  // CT: центральный дом и боковые
  building(0, -35.5, 16, 7, 9, { door: 0, awn: true });
  building(-12, -24, 8, 7, 6.2, { door: 0 });
  building(12, -24, 8, 7, 6.2, { door: 0 });
  // сайт B (двор слева) и сайт A (площадка справа)
  building(-45, -28, 8, 18, 8, { door: 2 });
  building(-30, -36, 12, 5, 6.5, { door: 0 });
  building(46, -30, 8, 16, 7.5, { door: 2 });
  building(33, -37, 14, 4, 7, { skip: [0, 1, 2, 3] });
  // платформа A со ступенями
  M.box('stone', 35, 0, -28, 18, 0.9, 12, 0xe2d2aa);
  for (let i = 0; i < 5; i++) M.box('stone', 35, 0, -21.4 + i * 0.45 - 0.2, 7, 0.18 * (5 - i), 0.5, 0xe2d2aa);
  // крытая галерея над длинной улицей
  for (const x of [24.3, 35.7]) M.box('wood', x, 0, -4, 0.35, 5.2, 0.35, 0x5a4026);
  for (let i = 0; i < 6; i++) M.box('wood', 30, 5.0, -7 + i * 1.4, 11, 0.2, 0.3, 0x4a3320);
  for (let i = 0; i < 4; i++) { const g = new THREE.BoxGeometry(2.8, 0.05, 8.6); const m = new THREE.Matrix4().makeTranslation(26.8 + i * 2.8, 5.25, -3); M.add('cloth', g, pick(AWN), m); }

  // ящики и укрытия
  stack(-7.2, 11, 0.3); stack(5.5, -4, -0.4); stack(30, 4, 0.2); stack(28, 26, 0.6); stack(-30, 4, -0.2);
  stack(-6, 28, 0.1); stack(8, 25, -0.2); stack(-4, -20, 0.2); stack(5, -19, 0.5); stack(-45, -15, 0.2);
  crate(36.5, -25, 1.3, 0.9, 0.2); crate(33, -30, 1.3, 0.9); crate(34.3, -30.1, 1.1, 2.2, 0.3); crate(38.5, -28.5, 1.2, 0.9, -0.3);
  crate(-38, -22, 1.4); crate(-38, -23.4, 1.4); crate(-37.5, -22.6, 1.1, 1.4, 0.4);
  [[-13, 20], [-12.2, 20.6], [13, 22], [15, -14.8], [35, 10], [-30, -18], [-29.4, -18.8], [25, -24], [-3, 34]].forEach(([x, z]) => barrel(x, z));
  // низкие стены-укрытия
  M.box('stone', 0, 0, 14, 7, 1.2, 0.6, 0xe0cfa8); M.box('stone', -9, 0, 26, 0.6, 1.2, 8, 0xe0cfa8); M.box('stone', 9, 0, 26, 0.6, 1.2, 8, 0xe0cfa8);
  M.box('stone', 30, 0, -12, 8, 1.2, 0.6, 0xe0cfa8); M.box('stone', -32, 0, -12, 6, 1.2, 0.6, 0xe0cfa8);
  // мощёные площадки под сайтами, мидом и спавном
  for (const [x, z, w, d] of [[0, 0, 12, 22], [0, 30, 20, 8], [32, -17, 18, 9], [-32, -27, 16, 14], [0, -20, 14, 6]]) M.box('stone', x, 0, z, w, 0.04, d, 0xd8c7a0);
  // мид: рынок
  stall(-5.2, 8.5, PI / 2); stall(5.2, 2.5, -PI / 2); stall(-5.2, -4.5, PI / 2); stall(5.4, -8.5, -PI / 2);
  well(0, 4); bench(-5.5, -9, 0); bench(5.5, 14, 0); planter(-5.8, 15); planter(5.8, -2); planter(-5.8, 0);
  sack(-4.6, 2); sack(-4.2, 2.6); sack(4.5, 11); sack(4.9, 11.5); sack(-3.5, -14);
  bunting(-8, 6, 8, 6, 5.6); bunting(-8, -4, 8, -4, 5.8); bunting(-8, 20, 8, 20, 5.2);
  // длинная улица: укрытия из мешков, навес и гирлянды
  sandbags(30, -10, 5, 0.1); sandbags(26.5, 6, 3.6, 1.6, 0, 2); sandbags(26.5, 20, 3.6, 1.6, 0, 2);
  tarpStack(32, 22, 0.2); bunting(24, 10, 36, 10, 5.8); bunting(24, 24, 36, 24, 5.4); stall(34.2, 15, -PI / 2);
  // сайт A: мешки на платформе, ящики под брезентом
  sandbags(30, -23.2, 6, 0, 0.9, 2); sandbags(41, -25, 3.6, PI / 2, 0.9, 2); tarpStack(28.5, -30.5, 0.3, 0.9); sack(39, -31, 0.9); sack(39.6, -30.4, 0.9);
  planter(25, -18); planter(44, -18); bench(36, -17.5, 0); bunting(22, -18, 46, -18, 6.4);
  // сайт B: палатка, паллеты, лавки
  tent(-38, -36, 0.4); tarpStack(-40, -31, -0.3); sandbags(-27, -20.5, 5, 0.1, 0, 2); sandbags(-36, -17, 4, 0, 0, 2);
  for (const [x, z] of [[-33, -33], [-33.7, -33.4], [-24, -24]]) M.box('wood', x, 0, z, 1.2, 0.15, 1.0, 0x9a7a4e, rr(0, 1));
  bench(-24, -33, PI / 2); planter(-42, -18); planter(-25, -23); bunting(-46, -19, -22, -19, 6.2);
  // спавн T и CT
  stall(-3, 24, 0.2); stall(3.6, 22, -0.2); bench(-6, 34.5, 0); bench(6, 34.5, 0); planter(-3.5, 35.2); planter(3.5, 35.2); bunting(-14, 26, 14, 26, 5.4);
  sandbags(0, -29, 5, 0, 0, 2); stall(-6, -22, 0); planter(6, -22); bunting(-12, -20, 12, -20, 5.6);
  // машины и пальмы
  truck(31, 0, 0.5, 0x6f7f5a); truck(-18, 22, 0.3, 0xc7bfae); truck(-34, -26, 2.2, 0x8a3d2c);
  [[-40, -20], [-22, -35], [41, -18], [-10, 36], [18, 20]].forEach(([x, z]) => palm(x, z));
  // столбы с проводами
  const poles = [[22, 22], [22, -2], [22, -20], [-24, 22], [-24, -2], [-24, -20]];
  poles.forEach(([x, z]) => pole(x, z));
  for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) { const a = poles[i * 3 + j], b = poles[i * 3 + j + 1]; if (!b || j === 2) continue; for (const dx of [-1, 0, 1]) { const pts = []; for (let t = 0; t <= 1; t += 0.1) pts.push(new THREE.Vector3(a[0] + dx, 6.9 - Math.sin(t * PI) * 0.7, a[1] + (b[1] - a[1]) * t)); wires.push(pts); } }

  // ---------- внешний город и мечеть на горизонте ----------
  const ring = [];
  for (let x = -90; x <= 90; x += 15) { ring.push([x + rr(-3, 3), -D / 2 - rr(10, 18)], [x + rr(-3, 3), D / 2 + rr(10, 18)]); }
  for (let z = -60; z <= 60; z += 15) { ring.push([-W / 2 - rr(10, 18), z + rr(-3, 3)], [W / 2 + rr(10, 18), z + rr(-3, 3)]); }
  for (const [x, z] of ring) building(x, z, rr(11, 17), rr(11, 17), rr(11, 21), { far: true });
  // мечеть: куб + купол + два минарета
  building(-62, -62, 22, 20, 12, { color: 0xf1ead8, mat: 'plaster2' });
  { const g = new THREE.SphereGeometry(8, 28, 16, 0, PI * 2, 0, PI / 2); M.add('plaster2', g, 0xf3ecdc, new THREE.Matrix4().makeTranslation(-62, 12, -62)); }
  for (const [mx, mz] of [[-48, -50], [-76, -50]]) {
    M.cyl('plaster2', mx, 0, mz, 1.5, 1.2, 26, 0xf0e6cc, 16); M.cyl('stone', mx, 22, mz, 2.1, 2.1, 0.6, STONE, 16);
    M.cyl('plaster2', mx, 22.6, mz, 1.0, 0.9, 4, 0xf0e6cc, 16);
    const g = new THREE.ConeGeometry(1.4, 4.5, 16); M.add('tiles', g, 0xffffff, new THREE.Matrix4().makeTranslation(mx, 28.9, mz));
  }
  // песчаные холмы за городом
  const hills = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * PI * 2 + rr(-0.1, 0.1), r = rr(130, 165), g = new THREE.IcosahedronGeometry(1, 4);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const v = new THREE.Vector3().fromBufferAttribute(p, k); const n = 1 + 0.18 * Math.sin(v.x * 5 + i) * Math.cos(v.z * 4 + i * 2); p.setXYZ(k, v.x * n, v.y * n, v.z * n); }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xcfb384, roughness: 1 }));
    m.scale.set(rr(30, 50), rr(10, 22), rr(26, 40)); m.position.set(Math.cos(a) * r, -3, Math.sin(a) * r); hills.add(m);
  }

  group.add(M.build(mats), hills);

  // проволока
  for (const pts of wires) group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x1a1a1a })));

  // ---------- земля, пыльные пятна, буквы ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), mats.sand);
  const gg = ground.geometry; gg.rotateX(-PI / 2);
  { const n = gg.attributes.position.count, arr = new Float32Array(n * 3).fill(1); gg.setAttribute('color', new THREE.BufferAttribute(arr, 3)); gg.attributes.uv.array.forEach((_, i, a) => a[i] *= 420 / 6); }
  ground.receiveShadow = true; group.add(ground);

  const blob = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(70,52,34,0.55)'); gr.addColorStop(1, 'rgba(70,52,34,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
  })();
  const bm = new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, fog: true });
  for (let i = 0; i < 70; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bm), s = rr(4, 14);
    m.rotation.set(-PI / 2, 0, rr(0, PI)); m.scale.set(s, s * rr(0.5, 1), 1); m.position.set(rr(-46, 46), 0.012 + i * 0.0001, rr(-36, 36)); group.add(m);
  }
  const letter = (ch, x, z) => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.fillStyle = 'rgba(20,16,12,0.9)'; g.font = 'bold 220px Impact, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 128, 140);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.82, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -PI / 2; m.position.set(x, 0.02, z); group.add(m);
  };
  letter('A', 29, -17); letter('B', -29, -31);

  return { group, solids };
}

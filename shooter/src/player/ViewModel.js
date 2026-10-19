import * as THREE from 'three';
import { WEAPONS } from '../weapons/Weapons.js';
import { buildGun, SIGHT } from '../weapons/GunModels.js';
import { damp, clamp } from '../core/Util.js';

// Оружие от первого лица: детальная 3D-модель + руки + анимации:
// покачивание при ходьбе, инерция при повороте мыши, отдача, затвор/помпа/затворная рукоять,
// настоящая перезарядка (рука достаёт магазин и вставляет новый), доставание, прицеливание, удар ножом.
const SLEEVE = new THREE.MeshStandardMaterial({ color: 0x4d5a3e, roughness: 0.95 });       // оливковая ткань формы
const GLOVE = new THREE.MeshStandardMaterial({ color: 0x1f2226, roughness: 0.7 });        // чёрная перчатка
const GLOVE_PAD = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.6 });
const FLASH = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const FLASH_CORE = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const bx = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
const SCALE = 0.56;

// рука: тактическая перчатка из скруглённых форм (ладонь, пальцы, большой палец) + рукав, уходящий назад-вниз за экран
const capsule = (r, len, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const o = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat);
  o.rotation.set(Math.PI / 2 + rx, ry, rz); o.position.set(x, y, z); return o;   // капсула вдоль оси Z
};
function makeHand(side) {
  const g = new THREE.Group();
  const palm = capsule(0.027, 0.03, GLOVE, 0, 0, 0.005); palm.scale.set(1.5, 1, 1); g.add(palm);                  // ладонь
  for (let i = 0; i < 4; i++) g.add(capsule(0.0105, 0.045 - Math.abs(i - 1.3) * 0.004, GLOVE, (i - 1.5) * 0.02 * side, 0.004, -0.058, -0.25));   // пальцы, слегка согнуты
  g.add(capsule(0.012, 0.035, GLOVE, -side * 0.036, -0.004, -0.025, -0.1, 0, side * 0.7));                         // большой палец
  g.add(capsule(0.03, 0.02, GLOVE_PAD, 0, -0.012, 0.045));                                             // нашивка на запястье
  const fore = capsule(0.034, 0.4, SLEEVE, side * 0.03, -0.045, 0.28, 0, 0, 0); fore.rotation.set(Math.PI / 2 - 0.28, -side * 0.12, 0); g.add(fore);
  return g;
}

function starFlash() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.05), FLASH); m.rotation.z = i * Math.PI / 3; g.add(m); }
  const core = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.09), FLASH_CORE); g.add(core);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.06), FLASH); side.rotation.y = Math.PI / 2; g.add(side);
  g.visible = false;
  return g;
}

export class ViewModel {
  constructor(scene, actor) {
    this.a = actor;
    this.root = new THREE.Group();
    this.holder = new THREE.Group();     // анимируемая часть
    this.holder.scale.setScalar(SCALE);
    this.root.add(this.holder);
    scene.add(this.root);
    this.light = new THREE.PointLight(0xffc070, 0, 3); this.root.add(this.light);
    this.cache = {}; this.entry = null; this.curId = null;
    this.kickV = 0; this.kickRot = 0; this.swingT = 0; this.swingHeavy = false;
    this.t = 0; this.adsK = 0; this.flashT = 0; this.drawT = 0; this.cycleT = 9; this.dip = 0;
    this.swayX = 0; this.swayY = 0; this.rollSway = 0;
    this.flash = starFlash();
    this.lastReloadP = 0;
  }

  set(id) {
    if (id === this.curId) return;
    if (this.entry) this.holder.remove(this.entry.root);
    this.curId = id;
    let e = this.cache[id];
    if (!e) {
      const def = WEAPONS[id], o = buildGun(def), root = new THREE.Group();
      root.add(o.group);
      const hr = makeHand(1); hr.position.set(...o.hands.r); root.add(hr);
      let hl = null;
      if (def.type !== 'melee') { hl = makeHand(-1); hl.position.set(...o.hands.l); hl.rotation.y = 0.15; root.add(hl); }
      else { hr.rotation.x = 0.2; }
      e = this.cache[id] = { o, root, hl, hr, def, hlRest: hl ? hl.position.clone() : null, sight: SIGHT[def.type] ?? 0.08 };
    }
    this.entry = e;
    this.holder.add(e.root);
    e.o.group.add(this.flash);
    this.flash.position.copy(e.o.muzzle);
    this.drawT = 0.0001;
  }
  draw() { this.drawT = 0.0001; }
  kick(w) {
    const big = w.type === 'sniper' || w.type === 'shotgun';
    this.kickV += big ? 0.13 : w.type === 'pistol' ? 0.055 : w.type === 'mg' ? 0.045 : 0.032;
    this.kickRot += big ? 0.22 : w.type === 'pistol' ? 0.1 : 0.055;
    this.flashT = 0.05; this.flash.rotation.z = Math.random() * 6;
    this.flash.scale.setScalar(w.type === 'sniper' ? 1.9 : w.type === 'shotgun' ? 1.7 : w.type === 'pistol' ? 0.85 : w.type === 'mg' ? 1.4 : 1.1);
    this.light.intensity = 2.2; this.cycleT = 0;
    const e = this.entry; if (e?.o.slide) e.o.slide.position.z = e.o.slide.userData.rest.z + 0.05;
  }
  swing(heavy) { this.swingT = 0.0001; this.swingHeavy = heavy; }
  land(v) { this.dip = Math.min(0.06, v * 0.004); }

  // look: {yaw, pitch} — на сколько повернулась камера за кадр (рад) → инерция оружия
  update(dt, m, camera, look = { yaw: 0, pitch: 0 }) {
    const a = this.a, g = a.gun;
    if (!g) return;
    const w = WEAPONS[g.id];
    this.set(g.id);
    const e = this.entry, o = e.o;
    this.t += dt;
    const scoped = a.scope > 0 && w.type === 'sniper';
    this.root.visible = a.alive && !scoped;

    // прицеливание: совмещаем линию прицела с глазом
    const adsTarget = a.scope > 0 && w.type !== 'sniper' ? 1 : 0;
    this.adsK = damp(this.adsK, adsTarget, 16, dt);
    const adsY = -(e.sight * SCALE) - 0.008, k = this.adsK;
    const base = { x: 0.15, y: -0.15, z: -0.5 };
    let x = base.x * (1 - k), y = base.y + (adsY - base.y) * k, z = base.z + (-0.36 - base.z) * k;
    let rx = 0, ry = 0, rz = 0;

    // ходьба: «восьмёрка», сильнее при беге
    const mv = a.body.onGround ? Math.min(1, a.speedNow / 5.6) : 0, bob = (1 - k * 0.9) * mv;
    x += Math.cos(this.t * 7) * 0.012 * bob; y += Math.abs(Math.sin(this.t * 7)) * 0.016 * bob - Math.sin(this.t * 1.6) * 0.002;
    rz += Math.cos(this.t * 7) * 0.02 * bob; ry += Math.sin(this.t * 3.5) * 0.015 * bob;
    if (!a.body.onGround) { y += clamp(a.body.vy * 0.003, -0.03, 0.03); rx += clamp(a.body.vy * 0.004, -0.05, 0.05); }
    // инерция при повороте мыши
    this.swayX = damp(this.swayX, clamp(-look.yaw * 1.6, -0.14, 0.14), 14, dt);
    this.swayY = damp(this.swayY, clamp(-look.pitch * 1.6, -0.1, 0.1), 14, dt);
    x += this.swayX * (1 - k * 0.8); y += this.swayY * (1 - k * 0.8); ry += this.swayX * 1.4; rx += this.swayY * 1.0;
    // приземление
    this.dip = damp(this.dip, 0, 9, dt); y -= this.dip;
    // отдача
    this.kickV = damp(this.kickV, 0, 15, dt); this.kickRot = damp(this.kickRot, 0, 15, dt);
    z += this.kickV; rx += this.kickRot; y += this.kickV * 0.25;
    // доставание
    if (this.drawT > 0) {
      this.drawT += dt;
      const p = Math.min(1, this.drawT / Math.max(0.2, w.draw));
      const q = (1 - p) * (1 - p);
      y -= q * 0.4; rx -= q * 0.7; rz += q * 0.3;
      if (p >= 1) this.drawT = 0;
    }
    // детали оружия: затвор, помпа, затворная рукоять
    this.cycleT += dt;
    if (o.slide) o.slide.position.z = damp(o.slide.position.z, o.slide.userData.rest.z, 22, dt);
    if (o.pump) { const c = clamp(this.cycleT / 0.45, 0, 1); o.pump.position.z = o.pump.userData.rest.z + Math.sin(c * Math.PI) * 0.07 * (w.rpm < 100 ? 1 : 0.4); }
    if (o.bolt) { const c = clamp((this.cycleT - 0.15) / 0.55, 0, 1), s = Math.sin(c * Math.PI); o.bolt.position.z = o.bolt.userData.rest.z + s * 0.07; o.bolt.rotation.z = -s * 1.2; }

    // перезарядка
    let hlTarget = null;
    if (a.reloadEnd > m.time) {
      const p = clamp(1 - (a.reloadEnd - m.time) / w.reload, 0, 1);
      const s = Math.sin(p * Math.PI);
      y -= 0.05 * s; rx -= 0.35 * s; rz += 0.45 * s; x -= 0.03 * s; ry += 0.25 * s;
      const env = clamp(Math.min(p / 0.15, (0.92 - p) / 0.15), 0, 1);
      let off = 0, vis = true;
      if (p < 0.32) off = 0; else if (p < 0.5) off = -((p - 0.32) / 0.18) * 0.32; else if (p < 0.58) vis = false; else if (p < 0.8) off = -0.32 * (1 - (p - 0.58) / 0.22); else off = 0;
      if (o.mag) { o.mag.visible = vis; o.mag.position.y = o.mag.userData.rest.y + off; o.mag.position.z = o.mag.userData.rest.z + (p >= 0.32 && p < 0.5 ? (p - 0.32) * 0.12 : 0); }
      if (e.hl) {
        const tgt = o.mag ? new THREE.Vector3(o.mag.userData.rest.x, o.mag.userData.rest.y - 0.07 + off, o.mag.userData.rest.z + 0.02) : new THREE.Vector3(0, -0.04, e.hlRest.z * 0.4);
        hlTarget = { tgt, env };
      }
      if (this.lastReloadP < 0.6 && p >= 0.6) this.flashT = 0;
      this.lastReloadP = p;
    } else {
      if (o.mag) { o.mag.visible = true; o.mag.position.copy(o.mag.userData.rest); }
      this.lastReloadP = 0;
    }
    if (e.hl) {
      if (hlTarget) e.hl.position.lerpVectors(e.hlRest, hlTarget.tgt, hlTarget.env);
      else e.hl.position.lerp(e.hlRest, Math.min(1, dt * 18));
    }
    // удар ножом
    if (this.swingT > 0) {
      this.swingT += dt;
      const dur = this.swingHeavy ? 0.42 : 0.24, p = Math.min(1, this.swingT / dur), s = Math.sin(p * Math.PI);
      ry += (this.swingHeavy ? -1.3 : 1.0) * s; rx -= 0.7 * s; rz += (this.swingHeavy ? 0.6 : -0.7) * s; z -= 0.14 * s; x -= 0.12 * s; y += 0.04 * s;
      if (p >= 1) this.swingT = 0;
    }
    this.holder.position.set(x, y, z);
    this.holder.rotation.set(rx, ry, rz);

    // вспышка выстрела + подсветка рук
    if (this.flashT > 0) { this.flashT -= dt; this.flash.visible = this.flashT > 0; } else this.flash.visible = false;
    this.light.position.copy(o.muzzle).multiplyScalar(SCALE).add(this.holder.position);
    this.light.intensity = damp(this.light.intensity, 0, 30, dt);
  }
}

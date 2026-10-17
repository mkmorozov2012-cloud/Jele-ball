import * as THREE from 'three';
import { WEAPONS } from '../weapons/Weapons.js';
import { damp } from '../core/Util.js';

// Оружие от первого лица: процедурная модель из нескольких боксов + анимации
// (покачивание, отдача, перезарядка, доставание, прицеливание, удар ножом).
const darkMat = new THREE.MeshLambertMaterial({ color: 0x14181f });
const gloveMat = new THREE.MeshLambertMaterial({ color: 0x232a36 });
const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };

function buildGun(def) {
  const mp = def.model, g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: mp.color });
  const L = mp.len, H = mp.h;
  if (def.type === 'melee') {
    g.add(box(0.035, 0.05, L * 0.7, new THREE.MeshLambertMaterial({ color: mp.color, emissive: 0x223344 }), 0, 0.02, -L * 0.45));
    g.add(box(0.05, 0.05, 0.14, darkMat, 0, 0, 0.04));
    g.add(box(0.12, 0.03, 0.03, darkMat, 0, 0, -0.04));
    g.userData.muzzle = new THREE.Vector3(0, 0, -L);
    return g;
  }
  g.add(box(0.06, H * 0.6, L * 0.6, mat, 0, 0, -L * 0.3));
  g.add(box(0.03, 0.035, L * 0.5, darkMat, 0, H * 0.18, -L * 0.8));
  const grip = box(0.045, H * 1.1, 0.06, darkMat, 0, -H * 0.75, -L * 0.08); grip.rotation.x = 0.25; g.add(grip);
  if (mp.mag) g.add(box(0.045, H * 0.95, 0.06, darkMat, 0, -H * 0.8, -L * 0.38));
  if (mp.stock) g.add(box(0.05, H * 0.8, L * 0.28, mat, 0, -H * 0.1, L * 0.14));
  if (mp.scope) { g.add(box(0.05, 0.05, L * 0.34, darkMat, 0, H * 0.62, -L * 0.4)); g.add(box(0.058, 0.058, 0.02, new THREE.MeshBasicMaterial({ color: 0x66e0ff }), 0, H * 0.62, -L * 0.58)); }
  if (mp.pump) g.add(box(0.05, 0.05, L * 0.22, darkMat, 0, -H * 0.15, -L * 0.7));
  if (mp.box) g.add(box(0.09, H * 0.9, L * 0.2, darkMat, 0.0, -H * 0.8, -L * 0.34));
  g.add(box(0.062, 0.012, L * 0.5, new THREE.MeshBasicMaterial({ color: 0x19e0c8 }), 0, H * 0.31, -L * 0.3));  // акцентная полоса
  // перчатки
  g.add(box(0.07, 0.08, 0.11, gloveMat, 0, -H * 0.9, -L * 0.06));
  g.add(box(0.08, 0.07, 0.12, gloveMat, -0.01, -H * 0.1, -L * 0.62));
  g.userData.muzzle = new THREE.Vector3(0, H * 0.18, -L * 1.05);
  return g;
}

export class ViewModel {
  constructor(scene, actor) {
    this.a = actor;
    this.root = new THREE.Group();
    this.holder = new THREE.Group();     // анимируемая часть
    this.holder.scale.setScalar(0.8);
    this.root.add(this.holder);
    scene.add(this.root);
    this.cache = {};
    this.cur = null; this.curId = null;
    this.kickV = 0; this.kickRot = 0; this.swingT = 0; this.swingHeavy = false;
    this.drawStart = 0; this.t = 0; this.adsK = 0; this.flashT = 0;
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat);
    this.flash.visible = false;
    this.holder.add(this.flash);
    this.drawT = 0;
  }
  set(id) {
    if (id === this.curId) return;
    if (this.cur) this.holder.remove(this.cur);
    this.curId = id;
    this.cur = this.cache[id] || (this.cache[id] = buildGun(WEAPONS[id]));
    this.holder.add(this.cur);
    this.flash.position.copy(this.cur.userData.muzzle);
    this.drawT = 0;
  }
  draw() { this.drawT = 0.0001; }
  kick(w) {
    this.kickV += w.type === 'sniper' || w.type === 'shotgun' ? 0.12 : w.type === 'pistol' ? 0.05 : 0.03;
    this.kickRot += w.type === 'sniper' || w.type === 'shotgun' ? 0.2 : 0.05;
    this.flashT = 0.045; this.flash.rotation.z = Math.random() * 6;
    const s = w.type === 'sniper' ? 1.7 : w.type === 'shotgun' ? 1.5 : w.type === 'pistol' ? 0.8 : 1;
    this.flash.scale.setScalar(s);
  }
  swing(heavy) { this.swingT = 0.0001; this.swingHeavy = heavy; }

  update(dt, m) {
    const a = this.a;
    const g = a.gun;
    if (!g) return;
    const w = WEAPONS[g.id];
    this.set(g.id);
    this.t += dt;
    const scoped = a.scope > 0 && w.type === 'sniper';
    this.root.visible = a.alive && !scoped;
    // прицеливание
    const adsTarget = a.scope > 0 && w.type !== 'sniper' ? 1 : 0;
    this.adsK = damp(this.adsK, adsTarget, 16, dt);
    const base = { x: 0.17, y: -0.19, z: -0.42 };
    let x = base.x * (1 - this.adsK), y = base.y + (-0.095 - base.y) * this.adsK, z = base.z + (-0.3 - base.z) * this.adsK;
    let rx = 0, ry = 0, rz = 0;
    // покачивание при ходьбе / дыхание
    const mv = a.body.onGround ? Math.min(1, a.speedNow / 5) : 0;
    const bobAmp = (1 - this.adsK * 0.85);
    x += Math.cos(this.t * 8) * 0.008 * mv * bobAmp;
    y += Math.abs(Math.sin(this.t * 8)) * 0.012 * mv * bobAmp + Math.sin(this.t * 1.7) * 0.002;
    // отдача
    this.kickV = damp(this.kickV, 0, 14, dt); this.kickRot = damp(this.kickRot, 0, 14, dt);
    z += this.kickV; rx += this.kickRot;
    // доставание
    if (this.drawT > 0) {
      this.drawT += dt;
      const p = Math.min(1, this.drawT / Math.max(0.2, w.draw));
      y -= (1 - p) * (1 - p) * 0.35; rx -= (1 - p) * 0.6;
      if (p >= 1) this.drawT = 0;
    }
    // перезарядка
    if (a.reloadEnd > m.time) {
      const p = 1 - (a.reloadEnd - m.time) / w.reload;
      const s = Math.sin(Math.min(1, Math.max(0, p)) * Math.PI);
      y -= 0.16 * s; rx -= 0.9 * s; rz += 0.5 * s; x -= 0.03 * s;
    }
    // удар ножом
    if (this.swingT > 0) {
      this.swingT += dt;
      const dur = this.swingHeavy ? 0.4 : 0.22, p = Math.min(1, this.swingT / dur);
      const s = Math.sin(p * Math.PI);
      ry += (this.swingHeavy ? -1.2 : 0.9) * s; rx -= 0.6 * s; z -= 0.12 * s; x -= 0.1 * s;
      if (p >= 1) this.swingT = 0;
    }
    this.holder.position.set(x, y, z);
    this.holder.rotation.set(rx, ry, rz);
    if (this.flashT > 0) { this.flashT -= dt; this.flash.visible = this.flashT > 0; } else this.flash.visible = false;
  }
}

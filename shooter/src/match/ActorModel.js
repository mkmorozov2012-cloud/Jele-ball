import * as THREE from 'three';
import { PALETTE } from '../world/MapBuilder.js';
import { buildGun } from '../weapons/GunModels.js';
import { WEAPONS } from '../weapons/Weapons.js';
import { loadSoldier, reachArm } from './Soldier.js';

// Низкополигональная фигурка бойца: суставы-«шарниры» (бёдра, плечи), оружие в руках,
// походка, приседание, падение при смерти и танцы.
const G = {
  leg: new THREE.BoxGeometry(0.2, 0.78, 0.24),
  boot: new THREE.BoxGeometry(0.22, 0.12, 0.3),
  torso: new THREE.BoxGeometry(0.54, 0.66, 0.32),
  head: new THREE.BoxGeometry(0.28, 0.28, 0.28),
  visor: new THREE.BoxGeometry(0.3, 0.08, 0.06),
  arm: new THREE.BoxGeometry(0.13, 0.5, 0.13),
  pack: new THREE.BoxGeometry(0.34, 0.4, 0.14),
  belt: new THREE.BoxGeometry(0.56, 0.08, 0.34),
};
const mats = {};
function teamMats(side) {
  if (mats[side]) return mats[side];
  const c = new THREE.Color(side === 'atk' ? PALETTE.attack : PALETTE.defend);
  mats[side] = {
    body: new THREE.MeshLambertMaterial({ color: c.clone().multiplyScalar(0.55), emissive: c.clone().multiplyScalar(0.28) }),
    glow: new THREE.MeshBasicMaterial({ color: c }),
  };
  return mats[side];
}
const legMat = new THREE.MeshLambertMaterial({ color: 0x20252f });
const bootMat = new THREE.MeshLambertMaterial({ color: 0x12151b });
const headMat = new THREE.MeshLambertMaterial({ color: 0xc9d1de });
export const revealMat = new THREE.MeshBasicMaterial({ color: 0xff3b5c, depthTest: false, transparent: true, opacity: 0.85 });
const gunCache = {};

export const DANCES = ['disco', 'robot', 'wave', 'spin', 'floss', 'jump'];
export const DANCE_NAMES = { disco: 'Диско', robot: 'Робот', wave: 'Волна', spin: 'Вихрь', floss: 'Флосс', jump: 'Прыжки' };

export class ActorModel {
  constructor(side) {
    this.side = side;
    this.root = new THREE.Group();        // позиция и поворот
    this.inner = new THREE.Group();       // приседание/падение/танец
    this.root.add(this.inner);
    const m = teamMats(side);
    this.parts = [];
    const mesh = (parent, geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; parent.add(o); this.parts.push(o); return o; };
    const joint = (x, y, z) => { const j = new THREE.Group(); j.position.set(x, y, z); this.inner.add(j); return j; };
    // ноги и руки крепятся к суставам, поэтому качаются от бедра и плеча
    this.hipL = joint(-0.14, 0.78, 0); this.hipR = joint(0.14, 0.78, 0);
    mesh(this.hipL, G.leg, legMat, 0, -0.39, 0); mesh(this.hipR, G.leg, legMat, 0, -0.39, 0);
    mesh(this.hipL, G.boot, bootMat, 0, -0.72, -0.03); mesh(this.hipR, G.boot, bootMat, 0, -0.72, -0.03);
    this.torso = mesh(this.inner, G.torso, m.body, 0, 1.11, 0);
    this.pack = mesh(this.inner, G.pack, m.glow, 0, 1.15, 0.2);
    this.belt = mesh(this.inner, G.belt, bootMat, 0, 0.8, 0);
    this.headJ = joint(0, 1.46, 0);
    this.head = mesh(this.headJ, G.head, headMat, 0, 0.14, 0);
    this.visor = mesh(this.headJ, G.visor, m.glow, 0, 0.16, -0.14);
    this.shL = joint(-0.34, 1.4, 0); this.shR = joint(0.34, 1.4, 0);
    this.armL = mesh(this.shL, G.arm, m.body, 0, -0.22, 0); this.armR = mesh(this.shR, G.arm, m.body, 0, -0.22, 0);
    this.gunHolder = new THREE.Group(); this.gunHolder.position.set(0.14, 1.2, -0.12); this.inner.add(this.gunHolder);
    this.gunId = null; this.gunObj = null;
    this.orig = this.parts.map((p) => p.material);
    this.phase = 0; this.crouch = 0; this.fall = 0; this.revealed = false; this.dt = 0;
    this.danceT = 0;
    // фото-солдат подменяет кубики, когда загрузится; кубики остаются для танцев и как запасной вид
    this.soldier = null; this.cur = null;
    loadSoldier().then((s) => {
      this.soldier = s; this.inner.add(s.wrap);
      s.orig = s.meshes.map((m) => m.material); s.base = s.meshes.map((m) => m.material.color.clone());
      this.tint(side); this.showSoldier(true);
      if (this.revealed) { this.revealed = false; this.setRevealed(true); }
    }).catch((e) => console.warn('солдат не загрузился, остаются кубики:', e));
  }
  tint(side) {
    const c = new THREE.Color(side === 'atk' ? PALETTE.attack : PALETTE.defend);
    // цвет команды: лёгкий оттенок + слабое свечение, чтобы не терялись текстуры формы
    this.soldier?.meshes.forEach((m, i) => { m.material.color.copy(this.soldier.base[i]).lerp(c, 0.28); m.material.emissive?.copy(c).multiplyScalar(0.07); });
  }
  showSoldier(on) {
    if (!this.soldier) return;
    this.soldier.wrap.visible = on;
    this.parts.forEach((p) => { p.visible = !on; });
  }
  // руки солдата тянутся к хвату оружия: правая — к рукоятке, левая — к цевью (нож — одной рукой)
  holdGun() {
    if (!this.gunObj || !this.hands) return;
    this.root.updateMatrixWorld(true);
    const q = this.root.getWorldQuaternion(new THREE.Quaternion());
    const out = (x) => new THREE.Vector3(x, -0.9, 0.2).applyQuaternion(q);   // локоть в сторону и вниз
    const { r, l } = this.hands, arms = this.soldier.arms;
    reachArm(arms.r, this.gunObj.localToWorld(new THREE.Vector3(...r)), out(0.8));
    if (WEAPONS[this.gunId].type !== 'melee') reachArm(arms.l, this.gunObj.localToWorld(new THREE.Vector3(...l)), out(-0.8));
  }
  // проигрывает нужную анимацию с плавным переходом
  play(name) {
    const s = this.soldier, next = s.act[name];
    if (!next || this.cur === next) return;
    next.reset().play();
    if (this.cur) this.cur.crossFadeTo(next, 0.2, false);
    this.cur = next;
  }
  setSide(side) {
    if (side === this.side) return;
    this.side = side; const m = teamMats(side);
    this.torso.material = this.armL.material = this.armR.material = m.body;
    this.pack.material = this.visor.material = m.glow;
    this.orig = this.parts.map((p) => p.material);
    this.tint(side);
    if (this.revealed) { this.revealed = false; this.setRevealed(true); }
  }
  setRevealed(r) {
    if (r === this.revealed) return;
    this.revealed = r;
    this.parts.forEach((p, i) => { p.material = r ? revealMat : this.orig[i]; p.renderOrder = r ? 999 : 0; });
    this.soldier?.meshes.forEach((p, i) => { p.material = r ? revealMat : this.soldier.orig[i]; p.renderOrder = r ? 999 : 0; });
    if (this.gunObj) this.gunObj.traverse((o) => { if (o.isMesh) { o.renderOrder = r ? 999 : 0; } });
  }
  setGun(id) {
    if (id === this.gunId) return;
    this.gunId = id;
    if (this.gunObj) this.gunHolder.remove(this.gunObj);
    if (!id) { this.gunObj = null; return; }
    const def = WEAPONS[id];
    const o = (gunCache[id] ||= buildGun(def));
    this.hands = o.hands;                                  // точки хвата (правая и левая рука) в координатах оружия
    const c = o.group.clone(true);
    c.scale.setScalar(def.type === 'melee' ? 0.9 : 0.85);
    this.gunObj = c; this.gunHolder.add(c);
  }

  // dt — секунды; a — Actor
  update(a, dt) {
    const b = a.body;
    this.root.position.set(b.x, b.y, b.z);
    this.root.rotation.y = a.yaw;
    const target = a.crouching ? 1 : 0;
    this.crouch += (target - this.crouch) * Math.min(1, dt * 14);
    this.inner.scale.y = 1 - this.crouch * 0.26;
    this.inner.position.set(0, 0, 0); this.inner.rotation.set(0, 0, 0);
    if (a.alive) {
      this.fall = 0;
      const g = a.gun; this.setGun(g ? g.id : null);
      if (a.dance) { this.showSoldier(false); this.dance(a, dt); return; }
      this.showSoldier(true);
      this.gunHolder.visible = true;
      if (this.soldier) {                                  // фото-солдат: ноги и руки ведёт анимация
        const v = a.speedNow;
        this.play(v < 0.4 ? 'idle' : v < 3.6 ? 'walk' : 'run');
        this.soldier.mixer.update(dt);
        this.gunHolder.rotation.set(a.pitch * 0.5, 0, 0);
        this.holdGun();
        return;
      }
      this.headJ.rotation.set(0, 0, 0);
      this.phase += a.speedNow * dt * 2.2;
      const sw = Math.min(1, a.speedNow / 3) * 0.75;
      this.hipL.rotation.x = Math.sin(this.phase) * sw; this.hipR.rotation.x = -Math.sin(this.phase) * sw;
      this.hipL.rotation.z = this.hipR.rotation.z = 0;
      this.shL.rotation.set(-1.15 + a.pitch * 0.5, 0.25, 0); this.shR.rotation.set(-1.3 + a.pitch * 0.5, -0.05, 0);
      this.gunHolder.rotation.set(a.pitch * 0.5, 0, 0);
      this.headJ.rotation.x = -a.pitch * 0.3;
    } else {
      this.fall = Math.min(1, this.fall + dt * 3.5);
      this.inner.rotation.x = -this.fall * 1.45;
      this.setRevealed(false);
    }
  }

  // Танцы: процедурные позы на сочетании синусов. t — время танца.
  dance(a, dt) {
    const d = a.dance; d.t += dt;
    const t = d.t, s = Math.sin, c = Math.cos, beat = t * Math.PI * 2 * 2;   // 120 ударов в минуту
    const I = this.inner;
    this.gunHolder.visible = false;
    this.hipL.rotation.set(0, 0, 0); this.hipR.rotation.set(0, 0, 0);
    this.shL.rotation.set(0, 0, 0); this.shR.rotation.set(0, 0, 0); this.headJ.rotation.set(0, 0, 0);
    switch (d.kind) {
      case 'disco':
        this.shR.rotation.set(0, 0, -2.6 + s(beat) * 0.25); this.shR.rotation.x = -0.4 + s(beat) * 0.2;    // рука вверх, указательный жест
        this.shL.rotation.set(0.2, 0, 0.9);                                                               // рука на поясе
        I.rotation.z = s(beat / 2) * 0.1; I.position.y = Math.abs(s(beat / 2)) * 0.06; I.rotation.y = s(beat / 2) * 0.3;
        this.hipL.rotation.x = s(beat / 2) * 0.5; this.hipR.rotation.x = -s(beat / 2) * 0.5;
        break;
      case 'robot': {
        const q = Math.floor(t * 4) % 4;                                                                    // «рваные» повороты
        this.shL.rotation.set(-1.57 * (q % 2), 0, 0.2); this.shR.rotation.set(-1.57 * ((q + 1) % 2), 0, -0.2);
        this.headJ.rotation.y = [0.6, 0, -0.6, 0][q]; I.rotation.y = [0.3, 0, -0.3, 0][q];
        this.hipL.rotation.x = 0.4 * (q % 2); this.hipR.rotation.x = 0.4 * ((q + 1) % 2);
        break;
      }
      case 'wave':
        this.shL.rotation.set(0, 0, 2.7 + s(beat) * 0.35); this.shR.rotation.set(0, 0, -2.7 + s(beat + 1.6) * 0.35);
        I.position.y = Math.abs(s(beat / 2)) * 0.08; I.rotation.z = s(beat / 2) * 0.12;
        this.hipL.rotation.x = s(beat / 2) * 0.3; this.hipR.rotation.x = -s(beat / 2) * 0.3;
        break;
      case 'spin':
        I.rotation.y = t * 7; I.position.y = Math.abs(s(beat / 2)) * 0.18;
        this.shL.rotation.set(0, 0, 1.5); this.shR.rotation.set(0, 0, -1.5);
        this.hipL.rotation.x = s(beat) * 0.6; this.hipR.rotation.x = -s(beat) * 0.6;
        break;
      case 'floss': {
        const w = s(beat / 2);
        I.position.x = w * 0.12; this.shL.rotation.set(0.1, 0, 0.9 + w * 0.8); this.shR.rotation.set(0.1, 0, -0.9 + w * 0.8);
        this.hipL.rotation.z = w * 0.35; this.hipR.rotation.z = w * 0.35; I.rotation.z = -w * 0.18; this.headJ.rotation.z = w * 0.25;
        break;
      }
      case 'jump': default: {
        const j = Math.abs(s(beat / 2));
        I.position.y = j * 0.35; this.shL.rotation.set(0, 0, 2.9 - j * 0.3); this.shR.rotation.set(0, 0, -2.9 + j * 0.3);
        this.hipL.rotation.x = j * 0.7; this.hipR.rotation.x = j * 0.7;
        break;
      }
    }
  }
}

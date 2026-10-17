import * as THREE from 'three';
import { PALETTE } from '../world/MapBuilder.js';

// Низкополигональная фигурка бойцов. Геометрии общие для всех, материалы — по командам.
const G = {
  leg: new THREE.BoxGeometry(0.2, 0.78, 0.24),
  torso: new THREE.BoxGeometry(0.54, 0.66, 0.32),
  head: new THREE.BoxGeometry(0.28, 0.28, 0.28),
  visor: new THREE.BoxGeometry(0.3, 0.08, 0.06),
  arm: new THREE.BoxGeometry(0.13, 0.5, 0.13),
  gun: new THREE.BoxGeometry(0.08, 0.1, 0.55),
  pack: new THREE.BoxGeometry(0.34, 0.4, 0.14),
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
const headMat = new THREE.MeshLambertMaterial({ color: 0xc9d1de });
const gunMat = new THREE.MeshLambertMaterial({ color: 0x111418 });
export const revealMat = new THREE.MeshBasicMaterial({ color: 0xff3b5c, depthTest: false, transparent: true, opacity: 0.85 });

export class ActorModel {
  constructor(side) {
    this.side = side;
    this.root = new THREE.Group();        // позиция и поворот
    this.inner = new THREE.Group();       // приседание/падение
    this.root.add(this.inner);
    const m = teamMats(side);
    const mk = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; this.inner.add(o); return o; };
    this.legL = mk(G.leg, legMat, -0.14, 0.39, 0); this.legR = mk(G.leg, legMat, 0.14, 0.39, 0);
    this.legL.geometry = G.leg;
    this.torso = mk(G.torso, m.body, 0, 1.11, 0);
    this.pack = mk(G.pack, m.glow, 0, 1.15, 0.2);
    this.head = mk(G.head, headMat, 0, 1.6, 0);
    this.visor = mk(G.visor, m.glow, 0, 1.62, -0.14);
    this.armL = mk(G.arm, m.body, -0.34, 1.12, -0.12); this.armR = mk(G.arm, m.body, 0.34, 1.12, -0.18);
    this.armL.rotation.x = this.armR.rotation.x = -0.9;
    this.gun = mk(G.gun, gunMat, 0.22, 1.12, -0.4);
    this.parts = [this.legL, this.legR, this.torso, this.pack, this.head, this.visor, this.armL, this.armR, this.gun];
    this.orig = this.parts.map((p) => p.material);
    this.phase = 0; this.crouch = 0; this.fall = 0; this.revealed = false;
  }
  setSide(side) {
    if (side === this.side) return;
    this.side = side; const m = teamMats(side);
    this.torso.material = this.armL.material = this.armR.material = m.body;
    this.pack.material = this.visor.material = m.glow;
    this.orig = this.parts.map((p) => p.material);
    if (this.revealed) { this.revealed = false; this.setRevealed(true); }
  }
  setRevealed(r) {
    if (r === this.revealed) return;
    this.revealed = r;
    this.parts.forEach((p, i) => { p.material = r ? revealMat : this.orig[i]; p.renderOrder = r ? 999 : 0; });
  }
  // dt — секунды; a — Actor
  update(a, dt) {
    const b = a.body;
    this.root.position.set(b.x, b.y, b.z);
    this.root.rotation.y = a.yaw;
    const target = a.crouching ? 1 : 0;
    this.crouch += (target - this.crouch) * Math.min(1, dt * 14);
    this.inner.scale.y = 1 - this.crouch * 0.26;
    if (a.alive) {
      this.fall = 0; this.inner.rotation.x = 0;
      this.phase += a.speedNow * dt * 2.2;
      const sw = Math.min(1, a.speedNow / 3) * 0.75;
      this.legL.rotation.x = Math.sin(this.phase) * sw; this.legR.rotation.x = -Math.sin(this.phase) * sw;
      this.armL.rotation.x = this.armR.rotation.x = -0.9 + a.pitch * 0.5;
      this.gun.rotation.x = a.pitch * 0.5;
    } else {
      this.fall = Math.min(1, this.fall + dt * 3.5);
      this.inner.rotation.x = -this.fall * 1.45;
      this.inner.position.y = 0.0;
      this.setRevealed(false);
    }
  }
}

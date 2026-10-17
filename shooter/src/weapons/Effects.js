import * as THREE from 'three';
import { rand } from '../core/Util.js';

// Визуальные эффекты на пулах объектов (без создания новых мешей во время боя):
// трассеры, декали попаданий, пыль/искры/кровь, гильзы.
const SURF_COL = { concrete: 0x9aa2ad, metal: 0xffd27a, wood: 0xa8794a, sand: 0xc9b27a };

function decalTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(0,0,0,0.95)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Effects {
  constructor(group, audio) {
    this.group = group; this.audio = audio;
    this.lastImpactSnd = 0;
    // --- трассеры ---
    this.tracers = [];
    const tg = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.frustumCulled = false; group.add(m);
      this.tracers.push({ m, life: 0, max: 0.09 });
    }
    this.tNext = 0;
    // --- декали ---
    this.decalN = 220; this.decalI = 0;
    this.decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: decalTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), this.decalN);
    this.decals.frustumCulled = false;
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.decalN; i++) this.decals.setMatrixAt(i, z);
    group.add(this.decals);
    // --- частицы ---
    this.pN = 360; this.pI = 0;
    this.parts = [];
    for (let i = 0; i < this.pN; i++) this.parts.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.05, sy: 0.05, grav: 9, bounce: false, max: 1 });
    this.pm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), this.pN);
    this.pm.frustumCulled = false;
    this.pm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.pN * 3), 3);
    for (let i = 0; i < this.pN; i++) this.pm.setMatrixAt(i, z);
    group.add(this.pm);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
    this._c = new THREE.Color(); this._up = new THREE.Vector3(0, 0, 1);
    // кольца-импульсы (способности)
    this.rings = [];
    for (let i = 0; i < 6; i++) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      r.rotation.x = -Math.PI / 2; r.visible = false; group.add(r);
      this.rings.push({ m: r, life: 0, max: 1, R: 1 });
    }
    this.rN = 0;
  }

  ring(x, y, z, R, color, dur = 0.8) {
    const r = this.rings[this.rN++ % this.rings.length];
    r.m.position.set(x, y, z); r.m.material.color.set(color); r.life = r.max = dur; r.R = R; r.m.visible = true;
  }

  tracer(ax, ay, az, bx, by, bz, side) {
    const t = this.tracers[this.tNext++ % this.tracers.length];
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
    if (len < 0.2) return;
    const m = t.m;
    m.position.set(ax + dx / 2, ay + dy / 2, az + dz / 2);
    m.scale.set(0.025, 0.025, len);
    this._v.set(dx / len, dy / len, dz / len);
    m.quaternion.setFromUnitVectors(this._up, this._v);
    m.material.color.set(side === 'atk' ? 0xffb066 : 0x8ffff0);
    m.material.opacity = 0.9; m.visible = true; t.life = t.max;
  }

  impact(x, y, z, nx, ny, nz, surf = 'concrete', size = 1) {
    // декаль: плоскость, повёрнутая вдоль нормали
    const i = this.decalI++ % this.decalN;
    this._v.set(nx, ny, nz);
    this._q.setFromUnitVectors(this._up, this._v);
    const s = 0.2 * size * rand(0.8, 1.2);
    this._m.compose(this._v.set(x + nx * 0.012, y + ny * 0.012, z + nz * 0.012), this._q, this._s.set(s, s, s));
    this.decals.setMatrixAt(i, this._m);
    this.decals.instanceMatrix.needsUpdate = true;
    const col = SURF_COL[surf] ?? SURF_COL.concrete;
    const n = Math.round(4 * size) + 1;
    for (let k = 0; k < n; k++) {
      this.spawn(x, y, z, nx * rand(0.5, 2.5) + rand(-1, 1), ny * rand(0.5, 2.5) + rand(0, 1.5), nz * rand(0.5, 2.5) + rand(-1, 1),
        rand(0.025, 0.06), rand(0.25, 0.55), surf === 'metal' && k < 2 ? 0xffe9a0 : col, 7);
    }
    if (this.audio && performance.now() - this.lastImpactSnd > 45) { this.lastImpactSnd = performance.now(); this.audio.impact(surf, { x, y, z }); }
  }

  blood(x, y, z, d) {
    for (let k = 0; k < 6; k++) this.spawn(x, y, z, d.x * 2 + rand(-1.5, 1.5), d.y * 2 + rand(0, 2), d.z * 2 + rand(-1.5, 1.5), rand(0.03, 0.07), rand(0.3, 0.6), 0xd8334a, 9);
  }

  shell(mz, a) {
    // гильза вылетает вправо-вверх от оружия игрока
    const cy = Math.cos(a.yaw), sy = Math.sin(a.yaw);
    const rx = cy, rz = -sy;
    this.spawn(mz.x, mz.y, mz.z, rx * rand(1.5, 2.5) + rand(-0.3, 0.3), rand(1.5, 2.5), rz * rand(1.5, 2.5), 0.03, 1.1, 0xe0b04a, 14, true, 0.08);
  }

  explosion(x, y, z) {
    for (let k = 0; k < 90; k++) {
      const a = rand(0, 6.28), e = rand(-0.2, 1), sp = rand(6, 26);
      this.spawn(x, y + 0.5, z, Math.cos(a) * sp * (1 - Math.abs(e) * 0.4), e * sp * 0.8 + 4, Math.sin(a) * sp * (1 - Math.abs(e) * 0.4), rand(0.2, 0.7), rand(0.6, 1.4), Math.random() < 0.5 ? 0xff7a1a : 0xffd23f, 6);
    }
  }

  puff(x, y, z, color, n = 10, spd = 3) {
    for (let k = 0; k < n; k++) this.spawn(x, y, z, rand(-spd, spd), rand(0, spd), rand(-spd, spd), rand(0.05, 0.12), rand(0.4, 0.9), color, 1);
  }

  spawn(x, y, z, vx, vy, vz, size, life, color, grav, bounce = false, sy) {
    const idx = this.pI++ % this.pN, p = this.parts[idx];
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.s = size; p.sy = sy ?? size; p.life = life; p.max = life; p.grav = grav; p.bounce = bounce;
    this._c.set(color); this.pm.instanceColor.setXYZ(idx, this._c.r, this._c.g, this._c.b);
    this.pm.instanceColor.needsUpdate = true;
  }

  update(dt) {
    for (const t of this.tracers) {
      if (!t.m.visible) continue;
      t.life -= dt;
      if (t.life <= 0) { t.m.visible = false; continue; }
      const k = t.life / t.max; t.m.material.opacity = k; t.m.scale.x = t.m.scale.y = 0.025 * (0.4 + k);
    }
    for (const r of this.rings) {
      if (!r.m.visible) continue;
      r.life -= dt;
      if (r.life <= 0) { r.m.visible = false; continue; }
      const k = 1 - r.life / r.max;
      r.m.scale.setScalar(Math.max(0.01, r.R * k)); r.m.material.opacity = (1 - k) * 0.8;
    }
    let any = false;
    for (let i = 0; i < this.pN; i++) {
      const p = this.parts[i];
      if (p.life <= 0) continue;
      p.life -= dt; any = true;
      if (p.life <= 0) { this._m.makeScale(0, 0, 0); this.pm.setMatrixAt(i, this._m); continue; }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.02) { if (p.bounce) { p.y = 0.02; p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; } else { p.y = 0.02; p.vy = 0; p.vx = p.vz = 0; } }
      const k = Math.min(1, p.life / (p.max * 0.5));
      this._m.compose(this._v.set(p.x, p.y, p.z), this._q.identity(), this._s.set(p.s * k, p.sy * k, p.s * k));
      this.pm.setMatrixAt(i, this._m);
    }
    if (any) this.pm.instanceMatrix.needsUpdate = true;
  }

  clearDecals() {
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.decalN; i++) this.decals.setMatrixAt(i, z);
    this.decals.instanceMatrix.needsUpdate = true;
  }
}

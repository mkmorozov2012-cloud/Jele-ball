import * as THREE from 'three';
import { ECON } from '../weapons/Weapons.js';
import { PALETTE } from '../world/MapBuilder.js';

// Заряд: установка на точке, таймер, взрыв, обезвреживание.
export class Bomb {
  constructor(m) {
    this.m = m;
    this.mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.35), new THREE.MeshLambertMaterial({ color: 0x222831 }));
    body.position.y = 0.13;
    this.light = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.12), new THREE.MeshBasicMaterial({ color: PALETTE.attack }));
    this.light.position.set(0, 0.29, 0);
    this.mesh.add(body, this.light);
    this.mesh.visible = false;
    m.group.add(this.mesh);
    this.reset();
  }
  reset() {
    this.planted = false; this.defused = false; this.exploded = false;
    this.timer = 0; this.x = 0; this.z = 0; this.site = null; this.nextBeep = 0; this.planter = null;
    this.mesh.visible = false;
  }
  siteAt(a) {
    for (const s of Object.values(this.m.map.sites)) {
      if (Math.hypot(a.body.x - s.x, a.body.z - s.z) < s.r) return s;
    }
    return null;
  }
  canPlant(a) {
    return !this.planted && a.alive && a.side === 'atk' && this.m.rounds.phase === 'live' && a.body.onGround && !!this.siteAt(a);
  }
  canDefuse(a) {
    return this.planted && !this.exploded && !this.defused && a.alive && a.side === 'def' && a.body.onGround &&
      Math.hypot(a.body.x - this.x, a.body.z - this.z) < 2.6;
  }
  plant(a) {
    const s = this.siteAt(a);
    this.planted = true; this.planter = a; this.site = s?.name || '?';
    this.x = a.body.x; this.z = a.body.z; this.timer = ECON.bombTime; this.plantTime = this.m.time;
    this.mesh.position.set(this.x, a.body.y, this.z); this.mesh.visible = true;
    a.money = Math.min(ECON.maxMoney, a.money + ECON.plantBonus);
    a.ult = Math.min(8, a.ult + 1);
    this.m.emit('planted', this.site);
    this.m.emit('message', `ЗАРЯД УСТАНОВЛЕН — ТОЧКА ${this.site}`, 2.5);
    this.m.audio.beep(600);
    this.m.noise(this.x, this.z, 60, 'atk', 'plant', a);
  }
  defuse(a) {
    this.defused = true;
    a.ult = Math.min(8, a.ult + 1);
    this.m.emit('message', 'ЗАРЯД ОБЕЗВРЕЖЕН', 2.5);
  }
  update(dt) {
    if (!this.planted || this.exploded || this.defused) return;
    const m = this.m;
    if (m.rounds.phase === 'end') return;
    this.timer -= dt;
    const left = Math.max(0, this.timer);
    const rate = left > 10 ? 1 : left > 5 ? 0.5 : 0.25;
    this.nextBeep -= dt;
    if (this.nextBeep <= 0) {
      this.nextBeep = rate;
      m.audio.beep(left < 5 ? 1700 : 1200, { x: this.x, y: 0, z: this.z });
      this.light.material.color.set(0xffffff);
      setTimeout(() => this.light.material.color.set(PALETTE.attack), 90);
    }
    if (this.timer <= 0) this.explode();
  }
  explode() {
    const m = this.m;
    this.exploded = true; this.mesh.visible = false;
    m.fx.explosion(this.x, 0.5, this.z);
    m.audio.explosion({ x: this.x, y: 0, z: this.z });
    for (const a of m.actors) {
      if (!a.alive) continue;
      const d = Math.hypot(a.body.x - this.x, a.body.z - this.z);
      if (d < 28) m.damage(null, a, d < 14 ? 999 : 999 * (1 - (d - 14) / 14), 'body', 'bomb', {});
    }
    m.emit('exploded');
  }
}

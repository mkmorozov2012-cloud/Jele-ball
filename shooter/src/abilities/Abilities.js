import * as THREE from 'three';
import AGENTS from '../data/agents.json';
import { TYPES } from './types.js';
import { DEG } from '../core/Util.js';

// Система способностей: хранит состояние (заряды, перезарядка), применяет способности через
// реестр типов, управляет зонами (дым, лечение…), стенами и турелями.
export class AbilitySystem {
  constructor(m) {
    this.m = m;
    this.zones = []; this.walls = []; this.turrets = []; this.timers = [];
    this.root = new THREE.Group(); m.group.add(this.root);
  }
  def(a, slot) { return AGENTS[a.agent].abilities.find((x) => x.slot === slot); }

  init(a) {
    a.abil = {};
    for (const d of AGENTS[a.agent].abilities) if (d.slot !== 'ult') a.abil[d.slot] = { charges: d.slot === 'ab3' ? 1 : 0, cd: 0 };
  }
  roundInit(a) {
    for (const d of AGENTS[a.agent].abilities) {
      if (d.slot === 'ult') continue;
      const st = a.abil[d.slot]; st.cd = 0;
      if (d.recharge) st.charges = d.maxCharges;
    }
  }
  reset() {
    for (const z of this.zones) this.root.remove(z.mesh);
    for (const w of this.walls) { this.m.world.remove(w.box); this.root.remove(w.mesh); }
    for (const t of this.turrets) this.root.remove(t.mesh);
    this.zones = []; this.walls = []; this.turrets = []; this.timers = [];
    this.m.world.smokes.length = 0;
  }

  // Можно ли применить сейчас (для HUD/ботов)
  ready(a, slot) {
    const d = this.def(a, slot);
    if (!d || !a.alive) return false;
    if (slot === 'ult') return a.ult >= d.cost;
    const st = a.abil[slot];
    return st.charges > 0 && st.cd <= 0;
  }

  cast(a, slot) {
    const m = this.m;
    if (m.rounds.phase === 'buy' && m.mode === 'match') return false;
    if (m.rounds.phase === 'end' || !this.ready(a, slot)) return false;
    const d = this.def(a, slot);
    const fn = TYPES[d.type];
    if (!fn || fn({ m, a, p: d.params, sys: this, def: d }) === false) return false;
    if (slot === 'ult') a.ult -= d.cost;
    else {
      const st = a.abil[slot];
      st.charges--;
      st.cd = d.cd;                     // ab1/ab2: пауза между применениями; ab3: время до возврата заряда
    }
    const kind = d.type === 'zone' ? (d.params.smoke ? 'smoke' : 'zone') : d.type;
    m.audio.ability(slot === 'ult' ? 'ult' : kind, a.isPlayer ? null : a.body);
    m.emit('ability', a, d);
    return true;
  }

  later(sec, fn) { this.timers.push({ t: this.m.time + sec, fn }); }

  // ---- зоны ----
  addZone(a, pt, p) {
    const m = this.m;
    const col = new THREE.Color(p.color || '#ffffff');
    let mesh;
    if (p.smoke) {
      mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(p.radius, 1), new THREE.MeshLambertMaterial({ color: col, flatShading: true, transparent: true, opacity: 0.97 }));
      mesh.position.set(pt.x, pt.y + p.radius * 0.55, pt.z);
    } else {
      mesh = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(p.radius, p.radius, 0.06, 28), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, depthWrite: false }));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(p.radius, 0.06, 6, 40), new THREE.MeshBasicMaterial({ color: col }));
      ring.rotation.x = Math.PI / 2;
      mesh.add(disc, ring);
      mesh.position.set(pt.x, pt.y + 0.04, pt.z);
    }
    this.root.add(mesh);
    const z = { x: pt.x, y: pt.y, z: pt.z, r: p.radius, until: m.time + p.dur, owner: a, side: a.side, p, mesh, tick: 0 };
    if (p.smoke) { z.sphere = { x: pt.x, y: pt.y + p.radius * 0.55, z: pt.z, r: p.radius * 0.95 }; m.world.smokes.push(z.sphere); }
    this.zones.push(z);
  }

  flashAt(owner, pt, p) {
    const m = this.m;
    m.fx.puff(pt.x, pt.y, pt.z, 0xffffff, 18, 6);
    m.audio.ability('flash', pt);
    for (const t of m.actors) {
      if (!t.alive) continue;
      const ex = t.body.x, ey = t.eyeY, ez = t.body.z;
      const dx = pt.x - ex, dy = pt.y - ey, dz = pt.z - ez, d = Math.hypot(dx, dy, dz);
      if (d > p.radius || !m.world.los(ex, ey, ez, pt.x, pt.y, pt.z)) continue;
      const l = t.look();
      const dot = (dx * l.x + dy * l.y + dz * l.z) / (d || 1);
      const k = dot > 0.2 ? 1 : dot > -0.4 ? 0.45 : 0.15;
      const dur = p.dur * k * (1 - Math.min(0.5, d / p.radius * 0.5));
      t.fx.blindUntil = Math.max(t.fx.blindUntil, m.time + dur); t.fx.blindMax = dur;
      if (t.isPlayer) m.emit('flashed', dur);
    }
  }

  // ---- стены ----
  addWall(a, box, dur) {
    const m = this.m;
    m.world.add(box);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(box.w, box.h, box.d),
      new THREE.MeshLambertMaterial({ color: 0xc58bff, emissive: 0x3a1e5a, transparent: true, opacity: 0.88 }));
    mesh.position.set(box.x0 + box.w / 2, box.y0 + box.h / 2, box.z0 + box.d / 2);
    this.root.add(mesh);
    this.walls.push({ box, mesh, until: m.time + dur });
  }

  // ---- турели ----
  addTurret(a, pt, p) {
    const m = this.m;
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.5, 8), new THREE.MeshLambertMaterial({ color: 0x2a3140 }));
    base.position.y = 0.25;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.7), new THREE.MeshLambertMaterial({ color: 0xc58bff, emissive: 0x4a2a7a }));
    head.position.y = 0.7;
    g.add(base, head); g.position.set(pt.x, pt.y, pt.z);
    this.root.add(g);
    this.turrets.push({ x: pt.x, y: pt.y, z: pt.z, owner: a, side: a.side, until: m.time + p.dur, p, mesh: g, head, nextShot: m.time + 0.6 });
  }

  update(dt) {
    const m = this.m, now = m.time;
    // перезарядки
    for (const a of m.actors) {
      for (const d of AGENTS[a.agent].abilities) {
        if (d.slot === 'ult') continue;
        const st = a.abil[d.slot];
        if (st.cd > 0) {
          if (d.recharge && st.charges < d.maxCharges) { st.cd -= dt; if (st.cd <= 0) { st.cd = 0; st.charges = d.maxCharges; } }
          else if (!d.recharge) st.cd = Math.max(0, st.cd - dt);
        }
      }
    }
    // отложенные действия
    for (let i = this.timers.length - 1; i >= 0; i--) if (this.timers[i].t <= now) { const t = this.timers.splice(i, 1)[0]; t.fn(); }
    // зоны
    const viewer = m.player.side;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (z.until <= now) {
        this.root.remove(z.mesh);
        if (z.sphere) { const k = m.world.smokes.indexOf(z.sphere); if (k >= 0) m.world.smokes.splice(k, 1); }
        this.zones.splice(i, 1); continue;
      }
      if (z.p.smoke) z.mesh.rotation.y += dt * 0.15;
      z.mesh.visible = !(z.p.trap && z.side !== viewer);
      z.tick -= dt;
      const doTick = z.tick <= 0; if (doTick) z.tick = 0.5;
      for (const t of m.actors) {
        if (!t.alive) continue;
        const dx = t.body.x - z.x, dz = t.body.z - z.z;
        if (dx * dx + dz * dz > z.r * z.r || Math.abs(t.body.y - z.y) > z.r) continue;
        const enemy = t.side !== z.side;
        if (enemy) {
          if (z.p.enemySlow) { t.fx.slowUntil = now + 0.25; t.fx.slow = z.p.enemySlow; }
          if (z.p.enemyReveal) t.fx.revealUntil = Math.max(t.fx.revealUntil, now + 0.4);
          if (z.p.enemyDps && doTick) m.damage(z.owner, t, z.p.enemyDps * 0.5, 'body', 'gas', {});
        } else {
          if (z.p.allyHeal) t.hp = Math.min(100, t.hp + z.p.allyHeal * dt);
          if (z.p.allyReduce) { t.fx.reduce = z.p.allyReduce; t.fx.reduceUntil = now + 0.25; }
        }
      }
    }
    // стены
    for (let i = this.walls.length - 1; i >= 0; i--) {
      const w = this.walls[i];
      if (w.until <= now) { m.world.remove(w.box); this.root.remove(w.mesh); this.walls.splice(i, 1); }
    }
    // турели
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const t = this.turrets[i];
      if (t.until <= now || t.owner.side !== t.side) { this.root.remove(t.mesh); this.turrets.splice(i, 1); continue; }
      let best = null, bd = t.p.range;
      for (const e of m.actors) {
        if (!e.alive || e.side === t.side) continue;
        const d = Math.hypot(e.body.x - t.x, e.body.z - t.z);
        if (d < bd && m.world.seen(t.x, t.y + 0.7, t.z, e.body.x, e.body.y + 1.1, e.body.z)) { bd = d; best = e; }
      }
      if (best) {
        t.mesh.rotation.y = Math.atan2(-(best.body.x - t.x), -(best.body.z - t.z));
        if (now >= t.nextShot) {
          t.nextShot = now + 1 / t.p.rate;
          m.fx.tracer(t.x, t.y + 0.7, t.z, best.body.x, best.body.y + 1.1, best.body.z, t.side);
          if (Math.random() < 0.75) m.damage(t.owner, best, t.p.dmg, 'body', 'turret', {});
          m.audio.tone({ f0: 900, f1: 400, dur: 0.05, type: 'square', gain: 0.08, pos: { x: t.x, y: t.y, z: t.z } });
        }
      }
    }
  }
}

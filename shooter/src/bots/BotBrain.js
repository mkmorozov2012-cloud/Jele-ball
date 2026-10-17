import { stepActor, applyCrouch } from '../player/Movement.js';
import { shoot, startReload, switchSlot, wdef } from '../weapons/Combat.js';
import { DEG, angDiff, clamp, rand, pick } from '../core/Util.js';
import { botBuy } from './BotBuy.js';
import { ECON } from '../weapons/Weapons.js';
import { botAbilities } from './BotAbilities.js';

// Три уровня сложности: время реакции, скорость поворота, ошибка прицела (градусы),
// шанс целиться в голову, шанс услышать шум, «стрейф» в бою.
export const DIFFS = [
  { name: 'Лёгкий',  react: 0.62, turn: 3.2, err: 3.6, head: 0.05, hear: 0.45, strafe: 0,   fov: 95 },
  { name: 'Средний', react: 0.34, turn: 5.5, err: 1.9, head: 0.14, hear: 0.75, strafe: 0.4, fov: 110 },
  { name: 'Сложный', react: 0.17, turn: 9.0, err: 0.8, head: 0.28, hear: 1.0,  strafe: 0.8, fov: 125 },
];

const tmp = { x: 0, y: 0, z: 0 };

// «Мозг» бота: восприятие (зрение + слух) → решение (по плану команды) → движение/стрельба.
export class BotBrain {
  constructor(m, a, diff) {
    this.m = m; this.actor = a; this.diff = diff; this.D = DIFFS[diff];
    this.plan = null;
    this.reset();
    this.perT = Math.random() * 0.1;
    this.abT = 1 + Math.random();
  }
  reset() {
    this.state = 'idle';
    this.path = []; this.pi = 0; this.goalIdx = -1; this.atGoal = false;
    this.target = null; this.targetVisible = false; this.seenAt = -99; this.reactAt = 0; this.lastKnown = null; this.aimHead = false;
    this.noise = null; this.alertUntil = 0;
    this.burstLeft = 0; this.burstPause = 0; this.tapAt = 0;
    this.strafeDir = 0; this.strafeT = 0;
    this.stuckT = 0; this.lastX = 0; this.lastZ = 0; this.stuckN = 0;
    this.bought = false; this.buyAt = 0;
    this.executing = false; this.sneak = false;
    this.lookYaw = this.actor.yaw; this.scanT = 0; this.wanderT = 0;
  }
  newRound() {
    this.reset();
    const a = this.actor, m = this.m;
    this.plan = m.tactics.plan[a.id] || null;
    this.buyAt = m.time + 0.5 + Math.random() * 4;
    this.lookYaw = a.yaw;
  }

  // ---------- слух и урон ----------
  hear(x, z, kind, dist) {
    const a = this.actor, m = this.m;
    if (Math.random() > this.D.hear * (kind === 'step' ? 0.65 : 1)) return;
    if (this.targetVisible) return;
    this.noise = { x, z, t: m.time, kind };
    m.tactics.noteContact(x, z);
    if (kind === 'step' && this.state === 'hold') { /* стоим на углу, но смотрим на звук */ }
  }
  onDamaged(att) {
    if (!att || att === this.actor || att.side === this.actor.side) return;
    const m = this.m;
    this.alertUntil = m.time + 4;
    this.noise = { x: att.body.x, z: att.body.z, t: m.time, kind: 'hit' };
    this.lastKnown = { x: att.body.x, z: att.body.z };
    if (!this.targetVisible) this.reactAt = Math.max(this.reactAt, m.time + this.D.react * 0.6);
  }

  // ---------- восприятие ----------
  perceive() {
    const a = this.actor, m = this.m, now = m.time;
    const blind = a.fx.blindUntil > now;
    let best = null, bd = 1e9;
    const ex = a.body.x, ey = a.eyeY, ez = a.body.z;
    const fov = (now < this.alertUntil ? 200 : this.D.fov) * DEG / 2;
    for (const t of m.actors) {
      if (!t.alive || t.side === a.side) continue;
      const tb = t.body;
      const dx = tb.x - ex, dz = tb.z - ez, d = Math.hypot(dx, dz);
      // подсвеченных врагов «знаем» без прямой видимости
      if (t.fx.revealUntil > now && !blind) { this.lastKnown = { x: tb.x, z: tb.z }; if (!this.targetVisible) this.noise = { x: tb.x, z: tb.z, t: now, kind: 'reveal' }; }
      if (blind || d > 75) continue;
      const diff = Math.abs(angDiff(a.yaw, Math.atan2(-dx, -dz)));
      if (diff > fov) continue;
      const h = tb.h;
      const vis = m.world.seen(ex, ey, ez, tb.x, tb.y + h * 0.9, tb.z) || m.world.seen(ex, ey, ez, tb.x, tb.y + h * 0.5, tb.z);
      if (!vis) continue;
      if (d < bd) { bd = d; best = t; }
      if (a.side === m.player.side) t.spottedUntil = now + 0.8;
    }
    if (best) {
      if (best !== this.target || !this.targetVisible) {
        this.reactAt = now + this.D.react * rand(0.8, 1.25);
        this.aimHead = Math.random() < this.D.head;
      }
      this.target = best; this.targetVisible = true; this.seenAt = now;
      this.lastKnown = { x: best.body.x, z: best.body.z };
      m.tactics.noteContact(best.body.x, best.body.z);
    } else {
      if (this.targetVisible && now - this.seenAt > 0.35) this.targetVisible = false;
    }
    if (!this.targetVisible && this.target && (!this.target.alive || now - this.seenAt > 6)) this.target = null;
  }

  // ---------- выбор цели движения по плану ----------
  nodeIdx(id) { return id === undefined || id === null ? -1 : this.m.nav.get(id); }
  setGoal(idx) {
    if (idx < 0 || idx === this.goalIdx) return;
    const a = this.actor, m = this.m;
    this.goalIdx = idx; this.atGoal = false;
    const start = m.nav.nearest(a.body.x, a.body.z, a.body.y);
    const p = m.nav.path(start, idx);
    this.path = p || [idx]; this.pi = 0;
    // если стартовый узел позади нас — пропускаем его
    if (this.path.length > 1) {
      const n0 = m.nav.nodes[this.path[0]], n1 = m.nav.nodes[this.path[1]];
      const d0 = Math.hypot(n0.x - a.body.x, n0.z - a.body.z), d01 = Math.hypot(n0.x - n1.x, n0.z - n1.z), d1 = Math.hypot(n1.x - a.body.x, n1.z - a.body.z);
      if (d1 < d01 + d0 - 0.5 && d1 < d01) this.pi = 1;
    }
  }

  decide(dt) {
    const a = this.actor, m = this.m, plan = this.plan, nav = m.nav;
    const bomb = m.bomb;
    // --- тренировка: просто бродит по узлам ---
    if (this.rangeBot) {
      this.wanderT -= dt;
      if (this.wanderT <= 0 || this.atGoal) { this.wanderT = rand(4, 9); this.goalIdx = -1; this.setGoal(Math.floor(Math.random() * nav.nodes.length)); }
      this.state = 'move';
      return;
    }
    if (!plan) return;
    if (plan.role === 'atk') {
      const site = m.map.sites[plan.site];
      if (bomb.planted) {
        // после закладки охраняем точку: занимаем позиции вокруг и смотрим на заряд
        this.state = 'hold'; this.executing = false;
        this.setGoal(this.nodeIdx(plan.post));
        this.holdLook = { x: bomb.x, z: bomb.z };
      } else if (m.tactics.readyToExecute()) {
        this.executing = true; this.state = 'execute';
        const planter = m.tactics.planter();
        if (planter === a) {
          this.setGoal(this.nodeIdx(site.plant));
          // дошли — ставим заряд (если рядом нет видимых врагов)
          if (this.atGoal && !this.targetVisible && bomb.canPlant(a)) this.doPlant(dt);
          else a.plantProgress = 0;
        } else this.setGoal(this.nodeIdx(plan.post));
      } else {
        this.state = 'approach';
        this.setGoal(this.nodeIdx(plan.entry));
      }
    } else {
      // защита
      if (bomb.planted && !bomb.defused) {
        this.state = 'retake'; this.executing = true;
        const s = m.map.sites[bomb.site];
        this.setGoal(this.nodeIdx(s.plant));
        const near = Math.hypot(a.body.x - bomb.x, a.body.z - bomb.z) < 2.4;
        if (near && !this.targetVisible && bomb.canDefuse(a)) this.doDefuse(dt);
        else a.defuseProgress = 0;
      } else {
        this.state = 'hold';
        let hold = plan.hold;
        if (plan.site === 'mid') {
          // ротатор: стоит в центре, при контакте у точки бежит туда
          const hot = ['A', 'B'].find((s) => m.time - m.tactics.intel[s] < 6);
          if (hot) { const s = m.map.sites[hot]; hold = s.holds[plan.i % s.holds.length]; this.holdLook = null; }
          else hold = this.centerNode();
        }
        this.setGoal(this.nodeIdx(hold));
      }
    }
  }
  centerNode() {
    if (this._center !== undefined) return this._center;
    let best = null, bd = 1e9;
    for (const n of this.m.nav.nodes) { const d = Math.hypot(n.x, n.z + 8); if (d < bd) { bd = d; best = n.id; } }
    return (this._center = best);
  }

  doPlant(dt) {
    const a = this.actor;
    a.plantProgress += dt; a.frozen = true;
  }
  doDefuse(dt) {
    const a = this.actor;
    a.defuseProgress += dt; a.frozen = true;
  }

  // ---------- движение ----------
  move(dt, engaged) {
    const a = this.actor, m = this.m, b = a.body;
    let wx = 0, wz = 0, jump = false;
    const wantsMove = !a.frozen && this.path.length > 0 && !this.atGoal;
    if (wantsMove && (!engaged || this.strafeMode === 'advance')) {
      const n = m.nav.nodes[this.path[Math.min(this.pi, this.path.length - 1)]];
      let dx = n.x - b.x, dz = n.z - b.z, d = Math.hypot(dx, dz);
      const last = this.pi >= this.path.length - 1;
      if (d < (last ? 0.9 : 1.4)) {
        if (last) { this.atGoal = true; } else this.pi++;
      } else { wx = dx / d; wz = dz / d; }
    }
    if (engaged && this.strafeDir !== 0 && this.target) {
      // стрейф перпендикулярно направлению на цель
      const dx = this.target.body.x - b.x, dz = this.target.body.z - b.z, d = Math.hypot(dx, dz) || 1;
      wx = -dz / d * this.strafeDir; wz = dx / d * this.strafeDir;
    }
    // застревание
    this.stuckT += dt;
    if (this.stuckT > 0.7) {
      const moved = Math.hypot(b.x - this.lastX, b.z - this.lastZ);
      if ((wx || wz) && moved < 0.12) {
        this.stuckN++;
        jump = true;
        if (this.stuckN >= 2) { const g = this.goalIdx; this.goalIdx = -1; this.setGoal(g); this.stuckN = 0; }
      } else this.stuckN = 0;
      this.lastX = b.x; this.lastZ = b.z; this.stuckT = 0;
    }
    a.walking = this.sneak && !engaged;
    // присед — только при дальней стрельбе стоя
    applyCrouch(m, a, !!(engaged && this.crouchShot));
    const wasFrozen = a.frozen;
    stepActor(m, a, wx, wz, dt, jump);
    a.frozen = wasFrozen && (a.plantProgress > 0 || a.defuseProgress > 0);
    // куда смотреть при движении
    if (!engaged && (wx || wz)) this.lookYaw = Math.atan2(-wx, -wz);
  }

  // ---------- взгляд и стрельба ----------
  aimAndShoot(dt) {
    const a = this.actor, m = this.m, now = m.time;
    const t = this.target;
    let engaged = false;
    this.strafeMode = '';
    if (t && t.alive && (this.targetVisible || now - this.seenAt < 0.5)) {
      engaged = true;
      const tb = t.body, ex = a.body.x, ey = a.eyeY, ez = a.body.z;
      const ty = tb.y + tb.h * (this.aimHead ? 0.93 : 0.62);
      const dx = tb.x - ex, dz = tb.z - ez, dy = ty - ey, hd = Math.hypot(dx, dz), dist = Math.hypot(hd, dy);
      const dyaw = Math.atan2(-dx, -dz), dpitch = Math.atan2(dy, hd);
      const turn = this.D.turn * dt * (1 + clamp(Math.abs(angDiff(a.yaw, dyaw)), 0, 3) * 0.6);
      a.yaw += clamp(angDiff(a.yaw, dyaw), -turn, turn);
      a.pitch += clamp(dpitch - a.pitch, -turn, turn);
      const err = Math.hypot(angDiff(a.yaw, dyaw) * Math.cos(a.pitch), dpitch - a.pitch);
      const w = wdef(a);
      // оружие по ситуации
      if (w.type === 'sniper') a.scope = dist > 16 ? 1 : 0; else a.scope = dist > 28 && w.type !== 'shotgun' && w.type !== 'melee' ? 1 : 0;
      if (w.type === 'melee' && a.guns.primary) switchSlot(m, a, 'primary');
      this.crouchShot = dist > 22 && this.diff >= 1 && w.type !== 'shotgun';
      // стрейф
      this.strafeT -= dt;
      if (this.strafeT <= 0) {
        this.strafeT = rand(0.35, 0.9);
        this.strafeDir = Math.random() < this.D.strafe && dist > 8 && !this.crouchShot ? (Math.random() < 0.5 ? -1 : 1) : 0;
      }
      if (this.state === 'execute' || this.state === 'retake') this.strafeMode = 'advance';  // продолжаем идти к цели
      if (now >= this.reactAt && err < (2.2 + 14 / Math.max(6, dist)) * DEG && !a.frozen) {
        const still = a.speedNow < (this.diff >= 1 ? 1.4 : 3.5);
        if (still || w.type === 'mg') this.fire(w, dist);
      }
      if (a.plantProgress > 0) a.plantProgress = 0;
      if (a.defuseProgress > 0) a.defuseProgress = 0;
    } else {
      this.crouchShot = false; this.strafeDir = 0; a.scope = 0;
      this.burstLeft = 0;
      // смотрим на шум / на точку, куда идём
      let want = this.lookYaw, wp = 0;
      if (this.noise && now - this.noise.t < 3) { want = Math.atan2(-(this.noise.x - a.body.x), -(this.noise.z - a.body.z)); }
      else if (this.atGoal && this.holdYaw !== undefined) want = this.holdYaw;
      const turn = this.D.turn * 0.55 * dt;
      a.yaw += clamp(angDiff(a.yaw, want), -turn, turn);
      a.pitch += clamp(wp - a.pitch, -turn, turn);
    }
    return engaged;
  }

  fire(w, dist) {
    const a = this.actor, m = this.m, now = m.time;
    if (w.type === 'shotgun' && dist > 22) return;
    if (a.reloadEnd > now) return;
    const e = this.D.err * (a.speedNow > 1 ? 1.8 : 1) * (a.scope ? 0.8 : 1);
    const mk = () => a.look(tmp, a.yaw + rand(-e, e) * DEG, a.pitch + rand(-e, e) * DEG);
    if (w.auto || w.burst) {
      if (this.burstPause > now) return;
      if (this.burstLeft <= 0) this.burstLeft = w.type === 'smg' ? Math.round(rand(5, 11)) : w.type === 'mg' ? Math.round(rand(10, 25)) : Math.round(rand(3, 7));
      if (shoot(m, a, mk())) { this.burstLeft--; if (this.burstLeft <= 0) this.burstPause = now + rand(0.18, 0.5) * (2.2 - this.diff * 0.5); }
    } else {
      if (this.tapAt > now) return;
      if (shoot(m, a, mk())) this.tapAt = now + (w.type === 'sniper' ? rand(0.4, 0.9) : rand(0.04, 0.22) * (2 - this.diff * 0.5));
    }
  }

  // ---------- общий цикл ----------
  update(dt) {
    const a = this.actor, m = this.m;
    if (!a.alive) return;
    const phase = m.rounds.phase;
    if (phase === 'buy' && m.mode === 'match') {
      if (!this.bought && m.time >= this.buyAt) { this.bought = true; botBuy(m, a); }
      a.frozen = false;
      stepActor(m, a, 0, 0, dt);
      return;
    }
    if (m.mode === 'match' && (phase === 'end' || phase === 'over')) { a.frozen = false; stepActor(m, a, 0, 0, dt); return; }

    this.perT -= dt;
    if (this.perT <= 0) { this.perT = 0.1 + Math.random() * 0.03; this.perceive(); }
    // после потери цели идём туда, где её видели
    this.decide(dt);
    const engaged = this.aimAndShoot(dt);
    if (!engaged && this.lastKnown && m.time - this.seenAt < 3 && this.state !== 'hold' && !this.rangeBot && !this.executing) {
      // охота: короткая проверка последнего места, потом возврат к плану
    }
    // взгляд на удержании позиции
    if (this.state === 'hold' && this.atGoal && !engaged) {
      const g = this.m.nav.nodes[this.goalIdx];
      const look = this.holdLook || (g && g.lx !== undefined ? { x: g.lx, z: g.lz } : null);
      if (look) {
        this.scanT -= dt; if (this.scanT <= 0) { this.scanT = rand(1.2, 3); this.scanOff = rand(-0.35, 0.35); }
        this.holdYaw = Math.atan2(-(look.x - a.body.x), -(look.z - a.body.z)) + (this.scanOff || 0);
      }
    } else this.holdYaw = undefined;
    // ходьба тише у точки (сложные боты)
    this.sneak = this.diff >= 2 && this.state === 'execute' && !this.targetVisible && !!this.plan && this.plan.role === 'atk' && this.nearSite(14);
    this.move(dt, engaged);

    // перезарядка и оружие
    const g = a.gun;
    if (g && wdef(a).type !== 'melee') {
      if (g.mag === 0 && g.reserve === 0 && a.guns.secondary && a.slot === 'primary') switchSlot(m, a, 'secondary');
      else if (!engaged && g.mag < wdef(a).mag * 0.5 && m.time - this.seenAt > 2) startReload(m, a);
    }
    // способности
    this.abT -= dt;
    if (this.abT <= 0) { this.abT = 0.5 + Math.random() * 0.4; botAbilities(this); }

    // завершение закладки / обезвреживания
    if (a.plantProgress >= ECON.plantTime && m.bomb.canPlant(a)) { m.bomb.plant(a); a.plantProgress = 0; a.frozen = false; }
    if (a.defuseProgress >= ECON.defuseTime && m.bomb.canDefuse(a)) { m.bomb.defuse(a); a.defuseProgress = 0; a.frozen = false; }
  }

  nearSite(r) {
    const s = this.m.map.sites[this.plan?.site]; if (!s) return false;
    return Math.hypot(this.actor.body.x - s.x, this.actor.body.z - s.z) < s.r + r;
  }
}

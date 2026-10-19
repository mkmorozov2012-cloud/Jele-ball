import * as THREE from 'three';
import { settings } from '../core/Settings.js';
import { clamp, damp, DEG, angDiff } from '../core/Util.js';
import { ECON, WEAPONS } from '../weapons/Weapons.js';
import { shoot, startReload, switchSlot, wdef, currentSpread } from '../weapons/Combat.js';
import { stepActor, applyCrouch } from './Movement.js';
import { ViewModel } from './ViewModel.js';
import { DANCES, DANCE_NAMES } from '../match/ActorModel.js';

const SLOTS = ['primary', 'secondary', 'knife'];

// Управление игроком: мышь, клавиши, стрельба, камера с отдачей и тряской.
export class Player {
  constructor(m, actor) {
    this.m = m; this.a = actor; this.game = m.game;
    this.punch = { yaw: 0, pitch: 0 };
    this.shake = 0;
    this.trauma = 0; this.fovKick = 0; this.tilt = 0; this.flinch = 0; this.tclock = Math.random() * 100;
    this.eyeH = 1.62;
    this.zoomMul = 1;
    this.bobT = 0;
    this.buf = 0;
    this.specIdx = 0;
    this.vm = new ViewModel(this.game.vmScene, actor);
    this.dir = { x: 0, y: 0, z: 0 };
    this.camYaw = 0; this.camX = 0; this.camY = 0; this.camZ = 0;
    this.respawnAt = 0;
    this.spectating = null;
    actor.onShoot = (w, kick) => this.onShoot(w, kick);
    actor.onMelee = (heavy) => this.vm.swing(heavy);
    actor.onSwitch = () => { this.vm.draw(); };
    // источники тряски экрана
    m.on('hurt', (from, dealt) => {
      this.addTrauma(0.25 + dealt / 90);
      if (from) {                                   // крен и «рывок» в сторону, откуда стреляли
        const dx = from.x - actor.body.x, dz = from.z - actor.body.z;
        const side = (dx * Math.cos(actor.yaw) - dz * Math.sin(actor.yaw)) / (Math.hypot(dx, dz) || 1);
        this.tilt += side * 0.06; this.flinch += 0.025;
      }
    });
    m.on('exploded', () => {
      const d = Math.hypot(m.bomb.x - actor.body.x, m.bomb.z - actor.body.z);
      this.addTrauma(Math.max(0.15, 1 - d / 70)); this.fovKick += 4;
    });
  }

  // ---- танец (клавиша V): камера от третьего лица, бит и поза ----
  startDance(kind) {
    const a = this.a;
    a.dance = { kind, t: 0 }; this.orbit = 0; this.stopBeat?.(); this.stopBeat = this.m.audio.danceBeat(kind);
    a.model.root.visible = true; this.vm.root.visible = false; a.scope = 0;
    this.m.emit('message', `Танец: ${DANCE_NAMES[kind]}`, 1.2);
  }
  stopDance() {
    const a = this.a; if (!a.dance) return;
    a.dance = null; this.stopBeat?.(); this.stopBeat = null;
    if (a.model) a.model.root.visible = false;
  }
  danceCamera(dt, camera) {
    const a = this.a, b = a.body;
    this.orbit += dt * 0.55;
    const ang = a.yaw + this.orbit, fx = -Math.sin(ang), fz = -Math.cos(ang);
    const hx = b.x, hy = b.y + 1.3, hz = b.z;
    let dist = 3.0;
    const hit = this.m.world.raycast(hx, hy, hz, fx, 0.25, fz, dist + 0.3);
    if (hit) dist = Math.max(0.8, hit.t - 0.3);
    this.camX = hx + fx * dist; this.camY = hy + 0.25 * dist; this.camZ = hz + fz * dist;
    camera.position.set(this.camX, this.camY, this.camZ);
    camera.lookAt(hx, hy - 0.15, hz);
    this.camYaw = Math.atan2(-(hx - this.camX), -(hz - this.camZ));
    this.game.setZoom(1);
  }

  // «травма» растёт от событий и плавно спадает; сила тряски = травма² (мелкие толчки почти не видны, большие — заметны)
  addTrauma(v) { this.trauma = Math.min(1, this.trauma + v); }

  // сглаженный шум без случайных скачков
  noise(seed) { const t = this.tclock; return (Math.sin(t * 17.3 + seed) + Math.sin(t * 27.1 + seed * 2.3) * 0.6 + Math.sin(t * 41.7 + seed * 3.1) * 0.3) / 1.9; }

  newRound() {
    this.trauma = 0; this.tilt = 0; this.flinch = 0; this.fovKick = 0;
    this.stopBeat?.(); this.stopBeat = null; if (this.a.model) this.a.model.root.visible = false;
    this.punch.yaw = this.punch.pitch = 0; this.shake = 0; this.eyeH = 1.62; this.zoomMul = 1;
    this.setSpectate(null);
    this.vm.draw();
  }

  onShoot(w, kick) {
    const k = w.type === 'sniper' ? 1 : 1;
    this.punch.pitch = Math.min(this.punch.pitch + kick[1] * DEG * k, 20 * DEG);
    this.punch.yaw += kick[0] * DEG;
    const pw = { pistol: 0.07, smg: 0.045, rifle: 0.075, shotgun: 0.32, sniper: 0.4, mg: 0.06, melee: 0.05 }[w.type] ?? 0.06;
    this.addTrauma(pw); this.fovKick += w.type === 'sniper' || w.type === 'shotgun' ? 1.2 : 0.35;
    this.vm.kick(w);
  }

  setSpectate(t) {
    if (this.spectating?.model && this.spectating !== this.a) this.spectating.model.root.visible = true;
    this.spectating = t;
    if (t?.model) t.model.root.visible = false;
  }

  update(dt) {
    const m = this.m, a = this.a, g = this.game, inp = g.input;
    const camera = g.camera;
    if (m.autoPlayer && a.alive) {                      // отладка: игрока ведёт бот
      this.eyeH = a.eyeY - a.body.y;
      this.applyCamera(camera, dt); this.vm.update(dt, m, camera); return;
    }
    if (!a.alive) return this.updateDead(dt);
    if (this.spectating) this.setSpectate(null);

    // --- танец ---
    if (inp.pressed('emote')) {
      const i = a.dance ? (DANCES.indexOf(a.dance.kind) + 1) % DANCES.length : Math.floor(Math.random() * DANCES.length);
      this.startDance(DANCES[i]);
    }
    if (a.dance) {
      const moved = ['forward', 'back', 'left', 'right', 'jump'].some((x) => inp.isDown(x)) || inp.fire || inp.aim || inp.pressed('reload') || inp.pressed('ab1') || inp.pressed('ab2') || inp.pressed('ab3') || inp.pressed('ult') || m.time - (a.lastHurt ?? -9) < 0.3;
      inp.takeMouse(); inp.takeWheel();
      if (moved && a.dance.t > 0.25) this.stopDance();
      else { a.frozen = true; stepActor(m, a, 0, 0, dt); a.frozen = false; this.danceCamera(dt, camera); return; }
    }
    const w = wdef(a);
    // --- взгляд ---
    const [dx, dy] = inp.takeMouse();
    const k = 0.0022 * settings.data.sens / this.zoomMul;
    a.yaw -= dx * k;
    a.pitch = clamp(a.pitch - dy * k, -1.55, 1.55);

    // --- движение ---
    let fw = 0, st = 0;
    if (inp.isDown('forward')) fw += 1;
    if (inp.isDown('back')) fw -= 1;
    if (inp.isDown('right')) st += 1;
    if (inp.isDown('left')) st -= 1;
    const sy = Math.sin(a.yaw), cy = Math.cos(a.yaw);
    let wx = -sy * fw + cy * st, wz = -cy * fw - sy * st;
    const l = Math.hypot(wx, wz); if (l > 0) { wx /= l; wz /= l; }
    applyCrouch(m, a, inp.isDown('crouch'));
    a.walking = inp.isDown('walk') && !a.crouching;

    // --- заряд ---
    this.handleUse(dt, inp);

    stepActor(m, a, wx, wz, dt, inp.isDown('jump'));
    if (a.landed > 0) { this.eyeH -= Math.min(0.25, a.landed * 0.012); this.vm.land(a.landed); }
    this.eyeH = damp(this.eyeH, a.crouching ? 1.15 : 1.62, 14, dt);

    // --- оружие ---
    this.handleWeapons(dt, inp, w);

    // --- способности ---
    for (const [act, slot] of [['ab1', 'ab1'], ['ab2', 'ab2'], ['ab3', 'ab3'], ['ult', 'ult']]) {
      if (inp.pressed(act)) {
        if (!m.abilities.cast(a, slot)) { /* нельзя — тихо */ m.emit('abilityFail', slot); }
      }
    }
    if (inp.pressed('buy')) m.emit('toggleShop');

    // --- прицел / зум ---
    let zoomTarget = 1;
    if (a.scope > 0) zoomTarget = w.type === 'sniper' ? w.zoom[a.scope - 1] : w.ads;
    this.zoomMul = damp(this.zoomMul, zoomTarget, 18, dt);

    // --- отдача возвращается ---
    const firing = m.time - a.lastShot < 0.12;
    const rec = Math.exp(-(firing ? 3.2 : 9) * dt);
    this.punch.pitch *= rec; this.punch.yaw *= rec;

    this.applyCamera(camera, dt);
    this.vm.update(dt, m, camera, { yaw: angDiff(this.prevYaw ?? a.yaw, a.yaw), pitch: a.pitch - (this.prevPitch ?? a.pitch) });
    this.prevYaw = a.yaw; this.prevPitch = a.pitch;
    // дульная позиция для трассеров
    const f = a.look(this.dir, this.camYaw, camera.rotation.x);
    a.muzzle = { x: this.camX + f.x * 0.7 + Math.cos(this.camYaw) * 0.22, y: this.camY + f.y * 0.7 - 0.16, z: this.camZ + f.z * 0.7 - Math.sin(this.camYaw) * 0.22 };
    // сообщения скрываем при смерти и т.п. — в HUD
  }

  handleUse(dt, inp) {
    const m = this.m, a = this.a, bomb = m.bomb;
    const use = inp.isDown('use');
    if (use && bomb.canPlant(a)) {
      a.plantProgress += dt;
      if (Math.floor(a.plantProgress * 6) % 2 === 0 && Math.random() < 0.2) m.audio.plantTick();
      if (a.plantProgress >= ECON.plantTime) { bomb.plant(a); a.plantProgress = 0; }
    } else a.plantProgress = 0;
    if (use && bomb.canDefuse(a)) {
      a.defuseProgress += dt;
      if (a.defuseProgress >= ECON.defuseTime) { bomb.defuse(a); a.defuseProgress = 0; }
    } else a.defuseProgress = 0;
    a.frozen = a.plantProgress > 0 || a.defuseProgress > 0;
  }

  handleWeapons(dt, inp, w) {
    const m = this.m, a = this.a;
    // смена оружия
    for (const [i, act] of ['slot1', 'slot2', 'slot3'].entries()) {
      if (inp.pressed(act)) switchSlot(m, a, SLOTS[i]);
    }
    const wheel = inp.takeWheel();
    if (wheel) {
      const have = SLOTS.filter((s) => a.guns[s]);
      const i = have.indexOf(a.slot);
      switchSlot(m, a, have[(i + wheel + have.length) % have.length]);
    }
    if (inp.pressed('reload')) startReload(m, a);
    if (a.frozen || m.uiOpen === 'blocking' || m.uiOpen === 'shop-modal') { inp.firePressed(); return; }

    const wd = wdef(a);
    // прицеливание
    if (wd.type === 'sniper') {
      if (inp.aimPressed() && a.reloadEnd <= m.time) a.scope = (a.scope + 1) % (wd.zoom.length + 1);
    } else if (wd.type !== 'melee' && wd.type !== 'shotgun') {
      a.scope = inp.aim && a.reloadEnd <= m.time ? 1 : 0;
    } else a.scope = 0;

    // дир. выстрела: камера (с отдачей)
    const dir = a.look(this.dir, a.yaw + this.punch.yaw, a.pitch + this.punch.pitch);
    if (wd.type === 'melee') {
      if (inp.fire) shoot(m, a, dir, false);
      else if (inp.aim) shoot(m, a, dir, true);
      return;
    }
    if (inp.firePressed()) this.buf = 0.12;
    this.buf -= dt;
    let want = false;
    if (wd.auto) want = inp.fire;
    else if (wd.burst) want = this.buf > 0 || a.burstLeft > 0;
    else want = this.buf > 0;
    if (want && shoot(m, a, dir)) this.buf = 0;
  }

  applyCamera(camera, dt) {
    const a = this.a, b = a.body;
    this.bobT += a.speedNow * dt * (a.crouching ? 1.1 : 1.6);
    const bob = a.body.onGround ? Math.min(1, a.speedNow / 5) : 0;
    this.camX = b.x; this.camZ = b.z;
    this.camY = b.y + this.eyeH + Math.sin(this.bobT * 2) * 0.015 * bob;
    camera.position.set(this.camX, this.camY, this.camZ);
    this.camYaw = a.yaw + this.punch.yaw;
    // тряска: травма → сглаженный шум по рысканию, тангажу и крену
    this.tclock += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    this.tilt = damp(this.tilt, 0, 7, dt); this.flinch = damp(this.flinch, 0, 9, dt); this.fovKick = damp(this.fovKick, 0, 10, dt);
    const amt = this.trauma * this.trauma * (settings.data.graphics.shake ?? 1) * (1 - Math.min(0.6, (this.zoomMul - 1) * 0.2));
    const sy = this.noise(1) * 0.035 * amt, sp = this.noise(7) * 0.035 * amt + this.flinch, sr = this.noise(13) * 0.06 * amt + this.tilt;
    camera.rotation.set(a.pitch + this.punch.pitch + sp, this.camYaw + sy, Math.cos(this.bobT) * 0.004 * bob + sr, 'YXZ');
    this.game.setZoom(this.zoomMul);
    if (this.fovKick > 0.02) { camera.fov += this.fovKick * (settings.data.graphics.shake ?? 1); camera.updateProjectionMatrix(); }
  }

  // --- наблюдение после смерти ---
  updateDead(dt) {
    const m = this.m, a = this.a, g = this.game, inp = g.input, camera = g.camera;
    inp.takeMouse(); inp.takeWheel();
    this.vm.root.visible = false;
    if (m.mode === 'range') {
      if (!this.respawnAt) this.respawnAt = m.time + 2;
      if (m.time >= this.respawnAt) { this.respawnAt = 0; const [sx, sz] = m.map.attackSpawns[0]; m.spawnAt(a, sx, sz, 0, 0); m.loadoutDefault(a); this.vm.root.visible = true; }
    }
    const allies = m.actors.filter((t) => t.alive && t.side === a.side && t !== a);
    let target = allies.length ? allies[this.specIdx % allies.length] : null;
    if (inp.firePressed()) { this.specIdx++; target = allies.length ? allies[this.specIdx % allies.length] : null; }
    if (target !== this.spectating) this.setSpectate(target);
    this.zoomMul = damp(this.zoomMul, 1, 10, dt);
    if (target) {
      camera.position.set(target.body.x, target.eyeY, target.body.z);
      camera.rotation.set(target.pitch, target.yaw, 0, 'YXZ');
      this.camX = target.body.x; this.camY = target.eyeY; this.camZ = target.body.z; this.camYaw = target.yaw;
    } else {
      // свободная камера над местом гибели
      const p = a.deathPos || a.body;
      this.camX = p.x; this.camY = p.y + 3; this.camZ = p.z; this.camYaw += dt * 0.3;
      camera.position.set(this.camX, this.camY, this.camZ);
      camera.rotation.set(-0.6, this.camYaw, 0, 'YXZ');
    }
    this.game.setZoom(1);
  }
}

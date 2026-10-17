import { STAND_H, CROUCH_H, BODY_R } from '../world/World.js';

// Участник матча (игрок или бот): здоровье, оружие, деньги, способности, эффекты.
// Поведение (кто управляет) вынесено отдельно: Player.js или BotBrain.js.
export class Actor {
  constructor(id, name, squad, agent, isPlayer = false) {
    this.id = id; this.name = name; this.squad = squad; this.agent = agent; this.isPlayer = isPlayer;
    this.side = 'atk';                       // 'atk' | 'def' — меняется на половине матча
    this.body = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: BODY_R, h: STAND_H, onGround: true, groundBox: null };
    this.yaw = 0; this.pitch = 0;
    this.crouching = false; this.walking = false;
    this.alive = true; this.hp = 100; this.armor = 0;
    this.money = 800; this.kills = 0; this.deaths = 0; this.assists = 0; this.damageDealt = 0; this.roundKills = 0;
    this.guns = { primary: null, secondary: null, knife: null };
    this.slot = 'secondary';
    this.nextFire = 0; this.reloadEnd = 0; this.drawEnd = 0; this.lastShot = -9; this.shotIdx = 0;
    this.fireSpread = 0; this.burstLeft = 0; this.scope = 0; this.dryAt = 0;
    this.abil = {};                          // состояние способностей: {ab1:{charges,cd}, ...}
    this.ult = 0;                            // очки ультимейта
    this.fx = { slowUntil: 0, slow: 0, blindUntil: 0, blindMax: 1, revealUntil: 0, buffs: [], hot: [], dash: null, reduce: 0 };
    this.damagers = new Map();               // кто бил недавно: id -> {t, dmg}
    this.lastDamagerPos = null;
    this.stepDist = 0; this.stepSide = 0;
    this.deathPos = null; this.deathTime = 0;
    this.speedNow = 0;                       // текущая горизонтальная скорость (для разброса и звука)
    this.model = null;
    this.brain = null;
    this.plantProgress = 0; this.defuseProgress = 0;
    this.stats = { adrDamage: 0 };
  }
  get eyeY() { return this.body.y + (this.crouching ? 1.15 : 1.62); }
  get x() { return this.body.x; }
  get y() { return this.body.y; }
  get z() { return this.body.z; }
  get gun() { return this.guns[this.slot]; }
  setCrouch(c) { this.crouching = c; this.body.h = c ? CROUCH_H : STAND_H; }

  // Единичный вектор взгляда
  look(out = { x: 0, y: 0, z: 0 }, yaw = this.yaw, pitch = this.pitch) {
    const cp = Math.cos(pitch);
    out.x = -Math.sin(yaw) * cp; out.y = Math.sin(pitch); out.z = -Math.cos(yaw) * cp;
    return out;
  }
}

import * as THREE from 'three';
import { Emitter } from '../core/Events.js';
import { MAPS, RANGE_MAP } from '../data/maps/index.js';
import AGENTS from '../data/agents.json';
import { loadMap } from '../world/MapBuilder.js';
import { zoneAt } from '../world/MapData.js';
import { Effects } from '../weapons/Effects.js';
import { WEAPONS, ECON, slotOf } from '../weapons/Weapons.js';
import { giveWeapon, refillAmmo, tickWeapon, switchSlot } from '../weapons/Combat.js';
import { Actor } from './Actor.js';
import { ActorModel } from './ActorModel.js';
import { Rounds } from './Rounds.js';
import { Bomb } from './Bomb.js';
import { Player } from '../player/Player.js';
import { stepActor } from '../player/Movement.js';
import { BotBrain } from '../bots/BotBrain.js';
import { AbilitySystem } from '../abilities/Abilities.js';
import { Tactics } from '../bots/Tactics.js';
import { applyDummy } from '../bots/Dummy.js';

const BOT_NAMES = ['Гранит', 'Ёрш', 'Метеор', 'Тополь', 'Кремень', 'Нетопырь', 'Радиус', 'Шторм', 'Янтарь', 'Фарфор', 'Зубр', 'Север'];
export const AGENT_IDS = Object.keys(AGENTS);

// Один матч (или тренировка): мир, участники, раунды, бомба, эффекты.
export class Match {

  constructor(game, cfg) {
    this.game = game; this.cfg = cfg; this.audio = game.audio;
    this.mode = cfg.mode || 'match';
    this.diff = cfg.diff ?? 1;
    this.time = 0; this.emitter = new Emitter();
    this.paused = false; this.uiOpen = null;
    this.over = false;

    const def = this.mode === 'range' ? RANGE_MAP : MAPS[cfg.map];
    const loaded = loadMap(def);
    this.map = loaded.exp; this.world = loaded.world; this.nav = loaded.nav;
    this.group = new THREE.Group();
    this.group.add(loaded.group);
    game.scene.add(this.group);
    this.fx = new Effects(this.group, this.audio);

    this.actors = [];
    this.bots = [];
    this.createActors(cfg);
    this.abilities = new AbilitySystem(this);
    this.bomb = new Bomb(this);
    this.tactics = new Tactics(this);
    this.rounds = new Rounds(this);
    for (const a of this.actors) this.abilities.init(a);

    if (this.mode === 'match') this.rounds.startMatch(cfg.side);
    else this.startRange();
  }

  on(n, f) { return this.emitter.on(n, f); }
  emit(n, ...a) { this.emitter.emit(n, ...a); }

  createActors(cfg) {
    const mkModel = (a) => {
      a.model = new ActorModel(a.side);
      this.group.add(a.model.root);
    };
    let nameIdx = 0;
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    if (this.mode === 'range') {
      const p = new Actor(0, 'Вы', 0, cfg.agent, true);
      p.side = 'atk'; this.player = p; this.actors.push(p);
      this.player.ctrl = new Player(this, p);
      mkModel(p); p.model.root.visible = false;
      return;
    }
    const mine = AGENT_IDS.filter((id) => id !== cfg.agent).sort(() => Math.random() - 0.5);
    const theirs = [...AGENT_IDS].sort(() => Math.random() - 0.5);
    for (let squad = 0; squad < 2; squad++) {
      for (let i = 0; i < 5; i++) {
        let a;
        if (squad === 0 && i === 0) {
          a = new Actor(0, 'Вы', 0, cfg.agent, true);
          this.player = a;
        } else {
          const agent = squad === 0 ? mine[i - 1] : theirs[i];
          a = new Actor(this.actors.length, names[nameIdx++ % names.length], squad, agent);
        }
        this.actors.push(a);
      }
    }
    this.player.ctrl = new Player(this, this.player);
    for (const a of this.actors) {
      if (!a.isPlayer || cfg.auto) { a.brain = new BotBrain(this, a, this.diff); this.bots.push(a.brain); }
    }
    this.autoPlayer = !!cfg.auto;
    this.actors.forEach(mkModel);
    this.player.model.root.visible = false;
  }

  startRange() {
    const p = this.player;
    p.money = 99999; p.side = 'atk';
    this.loadoutDefault(p);
    p.ult = 99;
    const [sx, sz] = this.map.attackSpawns[0] || [0, 30];
    this.spawnAt(p, sx, sz, 0, 0);
    this.dummies = [];
    for (const t of this.map.targets) {
      const a = new Actor(this.actors.length, t.kind === 'bot' ? 'Бот-цель' : 'Мишень', 1, 'lumen');
      a.side = 'def'; a.dummy = { ...t, ox: t.x, oz: t.z, t: Math.random() * 6, dead: 0 };
      a.model = new ActorModel('def'); this.group.add(a.model.root);
      this.loadoutDefault(a);
      this.spawnAt(a, t.x, t.z, 0, 0);
      this.abilities.init(a);
      if (t.kind === 'bot') { a.brain = new BotBrain(this, a, 0); a.brain.rangeBot = true; this.bots.push(a.brain); }
      this.actors.push(a); this.dummies.push(a);
    }
    this.rounds = { phase: 'range', score: [0, 0], round: 0, timeLeft: 0, update() {}, sideOf: () => 'atk' };
    this.emit('range');
  }

  // ---- вспомогательное ----
  loadoutDefault(a) {
    a.guns = { primary: null, secondary: null, knife: null };
    giveWeapon(a, 'blade'); giveWeapon(a, 'spark');
    a.slot = 'secondary'; a.armor = 0;
  }
  spawnAt(a, x, z, yawToX = 0, yawToZ = 0) {
    const b = a.body;
    b.x = x; b.y = 0.01; b.z = z; b.vx = b.vy = b.vz = 0; b.onGround = false;
    a.setCrouch(false);
    a.yaw = Math.atan2(-(yawToX - x), -(yawToZ - z)); a.pitch = 0;
    a.alive = true; a.hp = 100;
    a.nextFire = a.reloadEnd = a.drawEnd = 0; a.fireSpread = 0; a.shotIdx = 0; a.burstLeft = 0; a.scope = 0;
    a.fx.slowUntil = a.fx.blindUntil = a.fx.revealUntil = 0; a.fx.buffs = []; a.fx.hot = []; a.fx.dash = null; a.fx.reduce = 0;
    a.dance = null; a.damagers.clear(); a.plantProgress = a.defuseProgress = 0; a.frozen = false;
    if (a.model) { a.model.update(a, 0); a.model.root.visible = !a.isPlayer; a.model.fall = 0; a.model.inner.rotation.x = 0; }
  }
  enemiesOf(a) { return this.actors.filter((t) => t.alive && t.side !== a.side); }
  alliesOf(a) { return this.actors.filter((t) => t.alive && t.side === a.side && t !== a); }
  aliveCount(side) { let n = 0; for (const a of this.actors) if (a.alive && a.side === side) n++; return n; }
  zoneName(x, z) { return zoneAt(this.map, x, z); }

  // ---- покупка ----
  // item: id оружия | 'light' | 'heavy' | 'ab1' | 'ab2'. Возвращает null при успехе или причину отказа.
  buy(a, item) {
    if (!a.alive) return 'Вы мертвы';
    if (this.mode === 'match' && this.rounds.phase !== 'buy') return 'Закупка закончилась';
    const free = this.mode === 'range';
    let price, apply;
    if (WEAPONS[item]) {
      const w = WEAPONS[item]; price = w.price;
      apply = () => giveWeapon(a, item);
      const g = a.guns[w.type === 'pistol' ? 'secondary' : 'primary'];
      if (g && g.id === item) return 'Уже есть';
    } else if (ECON.shields[item]) {
      price = ECON.shields[item].price;
      if (a.armor >= ECON.shields[item].value) return 'Щит уже установлен';
      apply = () => { a.armor = ECON.shields[item].value; };
    } else if (item === 'ab1' || item === 'ab2') {
      const ab = AGENTS[a.agent].abilities.find((x) => x.slot === item), st = a.abil[item];
      price = ab.cost;
      if (st.charges >= ab.maxCharges) return 'Максимум зарядов';
      apply = () => { st.charges++; };
    } else return 'Неизвестный предмет';
    if (!free && a.money < price) return 'Недостаточно денег';
    if (!free) a.money -= price;
    apply();
    if (a.isPlayer) {
      this.audio.uiSnd('buy');
      if (WEAPONS[item]) { switchSlot(this, a, slotOf(item)); }
    }
    return null;
  }

  // ---- урон ----
  damage(att, vic, dmg, part, wid, info = {}) {
    if (!vic.alive || this.over) return;
    if (this.rounds.phase === 'end' && this.mode === 'match') return;
    if (vic.fx.reduce > 0 && vic.fx.reduceUntil > this.time) dmg *= 1 - vic.fx.reduce;
    dmg = Math.max(1, Math.round(dmg));
    const absorb = Math.min(vic.armor, dmg * ECON.armorAbsorb);
    vic.armor -= absorb;
    const hpPart = dmg - absorb;
    const dealt = Math.min(vic.hp, hpPart) + absorb;
    vic.hp -= hpPart;
    if (att && att !== vic) {
      att.damageDealt += dealt;
      const e = vic.damagers.get(att.id) || { dmg: 0 };
      e.dmg += dealt; e.t = this.time; vic.damagers.set(att.id, e);
      vic.lastDamagerPos = { x: att.body.x, z: att.body.z };
      if (att.isPlayer) { this.emit('hitmarker', part === 'head', vic.hp <= 0); this.audio.hit(vic.hp <= 0 ? 'kill' : part === 'head' ? 'head' : 'body'); }
    }
    vic.lastHurt = this.time;
    if (vic.isPlayer) { this.emit('hurt', att && att !== vic ? { x: att.body.x, z: att.body.z } : null, dealt); this.audio.hurt(); }
    vic.brain?.onDamaged?.(att, dealt);
    if (vic.hp <= 0) this.kill(att, vic, part, wid);
  }

  kill(att, vic, part, wid) {
    vic.hp = 0; vic.alive = false; vic.deaths++;
    vic.deathPos = { x: vic.body.x, y: vic.body.y, z: vic.body.z }; vic.deathTime = this.time;
    vic.plantProgress = vic.defuseProgress = 0; vic.scope = 0;
    const w = WEAPONS[wid];
    if (att && att !== vic && att.side !== vic.side) {
      att.kills++; att.roundKills++;
      att.money = Math.min(ECON.maxMoney, att.money + (w?.kill ?? 100));
      att.ult = Math.min(AGENTS[att.agent].ultCost, att.ult + 1);
      for (const b of att.fx.buffs) if (b.lifesteal && b.until > this.time) att.hp = Math.min(100, att.hp + 100 * b.lifesteal);
    }
    for (const [id, e] of vic.damagers) {
      if (att && id === att.id) continue;
      const helper = this.actors.find((x) => x.id === id);
      if (helper && helper.side !== vic.side && this.time - e.t < 8) helper.assists++;
    }
    this.emit('kill', { killer: att, victim: vic, weapon: wid, head: part === 'head' });
    this.audio.hit(att?.isPlayer ? 'kill' : 'body');
    if (vic.model) vic.model.update(vic, 0);
    if (this.mode === 'range' && vic.dummy) vic.dummy.dead = 3;
  }

  // ---- шум (слышимость ботами) ----
  noise(x, z, radius, side, kind, src) {
    for (const b of this.bots) {
      const t = b.actor;
      if (!t.alive || t.side === side) continue;
      const d = Math.hypot(t.body.x - x, t.body.z - z);
      if (d > radius) continue;
      b.hear(x, z, kind, d, src);
    }
  }

  // шаги: считаем пройденный путь на земле
  footstep(a, dt) {
    const b = a.body;
    if (a.landed > 0 && !a.dummy) {
      this.audio.step(b.groundBox?.surf || 'concrete', a.isPlayer ? null : b, 1.4);
      if (!a.crouching) this.noise(b.x, b.z, 22, a.side, 'step', a);
    }
    if (!b.onGround || !a.alive || a.speedNow < 2.2) { a.stepDist *= 0.9; return; }
    a.stepDist += a.speedNow * dt;
    if (a.stepDist > 2.3) {
      a.stepDist = 0;
      const loud = !a.walking && !a.crouching && a.speedNow > 3.5;
      if (a.isPlayer) this.audio.step(b.groundBox?.surf || 'concrete', null, loud ? 0.55 : 0.2);
      else if (loud || a.speedNow > 3.5) this.audio.step(b.groundBox?.surf || 'concrete', b, loud ? 1 : 0.35);
      if (loud) this.noise(b.x, b.z, 26, a.side, 'step', a);
    }
  }

  update(dt) {
    if (this.paused) return;
    this.time += dt;
    this.rounds.update(dt);
    this.player.ctrl.update(dt);
    for (const b of this.bots) b.update(dt);
    if (this.mode === 'range') applyDummy(this, dt);
    for (const a of this.actors) {
      if (!a.isPlayer) {
        // боты двигаются через brain.update; здесь — общая физика и звук
        if (a.alive) { /* движение уже применено в BotBrain */ } else { a.body.vx = a.body.vz = 0; stepActor(this, a, 0, 0, dt); }
      }
      if (a.alive) {
        tickWeapon(this, a, dt);
        this.footstep(a, dt);
        for (let i = a.fx.hot.length - 1; i >= 0; i--) {
          const h = a.fx.hot[i]; const amt = Math.min(h.rate * dt, h.left);
          a.hp = Math.min(100, a.hp + amt); h.left -= amt;
          if (h.left <= 0.001) a.fx.hot.splice(i, 1);
        }
        if (this.mode === 'range' && a.isPlayer) { const g = a.gun; if (g && g.reserve < 200) g.reserve = 200; }
      }
      a.model?.update(a, dt);
    }
    this.abilities.update(dt);
    this.bomb.update(dt);
    this.fx.update(dt);
    this.updateReveal();
    const p = this.player;
    this.audio.listener(p.ctrl.camX ?? p.body.x, p.ctrl.camY ?? p.eyeY, p.ctrl.camZ ?? p.body.z, p.ctrl.camYaw ?? p.yaw);
  }

  // Подсветка врагов (способности разведчика): видят все союзники подсветившего
  updateReveal() {
    const viewerSide = this.player.side;
    for (const a of this.actors) {
      if (!a.model || a.isPlayer) continue;
      a.model.setRevealed(a.alive && a.side !== viewerSide && a.fx.revealUntil > this.time);
    }
  }

  // Возвращает павшего союзника в бой на месте гибели (ультимейт «Возрождение»)
  reviveActor(a) {
    const p = a.deathPos;
    this.spawnAt(a, p.x, p.z, p.x, p.z + 1);
    a.body.y = p.y + 0.01; a.hp = 60; a.fx.hot = [];
    a.model.fall = 0; a.model.inner.rotation.x = 0;
    if (a.isPlayer) { a.ctrl?.setSpectate?.(null); a.ctrl.vm.root.visible = true; }
    this.emit('message', `${a.name} возвращён в бой`, 2);
  }

  // отладка: показать граф навигации (в консоли: __g.match.debugNav())
  debugNav() {
    const pos = [];
    this.nav.nodes.forEach((n, i) => { for (const [j] of this.nav.adj[i]) if (j > i) { const q = this.nav.nodes[j]; pos.push(n.x, n.y + 0.5, n.z, q.x, q.y + 0.5, q.z); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x00ff88 })));
    for (const n of this.nav.nodes) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3, 0.6), new THREE.MeshBasicMaterial({ color: 0xffee00 })); s.position.set(n.x, n.y + 1.5, n.z); this.group.add(s); }
  }

  dispose() {
    this.game.scene.remove(this.group);
    this.group.traverse((o) => { o.geometry?.dispose?.(); });
  }
}

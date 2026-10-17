import AGENTS from '../data/agents.json';
import { rand } from '../core/Util.js';

// Простая «логика» применения способностей ботами. Для каждого типа — условие и точка применения.
// Точку прицеливания подменяем через actor.aimOverride (её читает aimPoint в types.js).
export function botAbilities(brain) {
  const m = brain.m, a = brain.actor, sys = m.abilities;
  if (m.rounds.phase !== 'live' && m.mode === 'match') return;
  const t = brain.targetVisible ? brain.target : null;
  const dist = t ? Math.hypot(t.body.x - a.body.x, t.body.z - a.body.z) : 0;
  const plan = brain.plan || {};
  const bomb = m.bomb;
  const site = m.map.sites[bomb.planted ? bomb.site : plan.site] || null;
  const since = m.time - m.tactics.liveAt;

  for (const d of AGENTS[a.agent].abilities) {
    if (!sys.ready(a, d.slot)) continue;
    const p = d.params;
    let ok = false, aim = null;
    switch (d.type) {
      case 'flash':
        if (t && dist > 10 && dist < 28 && Math.random() < 0.5) { ok = true; aim = { x: t.body.x, y: t.body.y, z: t.body.z }; }
        break;
      case 'dash':
        if (t && dist > 7 && dist < 24 && Math.random() < 0.25) ok = true;
        break;
      case 'heal':
        if (a.hp < 55 && !t) ok = true;
        break;
      case 'buff':
        if (p.armor) { if (since > 3 && m.alliesOf(a).length) ok = Math.random() < 0.2; }
        else if (t && dist < 30) ok = true;
        break;
      case 'reveal':
        if (d.slot === 'ult') ok = since > 15 && m.aliveCount(a.side === 'atk' ? 'def' : 'atk') >= 3 && Math.random() < 0.05;
        else if (brain.executing || (brain.noise && m.time - brain.noise.t < 2.5)) ok = Math.random() < 0.3;
        break;
      case 'zone':
        if (p.smoke) {
          if (a.side === 'atk' && brain.executing && site) {
            const e = m.nav.nodes[m.nav.get(site.entries[0])]; ok = true;
            aim = { x: (e.x + site.x) / 2, y: 0, z: (e.z + site.z) / 2 };
          } else if (a.side === 'def' && bomb.planted) { ok = Math.random() < 0.1; aim = { x: bomb.x, y: 0, z: bomb.z }; }
        } else if (p.enemyDps) {
          if (t && dist < 22) { ok = true; aim = { x: t.body.x, y: t.body.y, z: t.body.z }; }
        } else if (p.allyHeal) {
          if (a.hp < 70 || m.alliesOf(a).some((x) => x.hp < 60)) { ok = Math.random() < 0.3; aim = { x: a.body.x, y: a.body.y, z: a.body.z }; }
        } else if (p.trap || p.enemyReveal) {
          if (a.side === 'def' && brain.state === 'hold' && plan.site && m.map.sites[plan.site]) {
            const s = m.map.sites[plan.site], e = m.nav.nodes[m.nav.get(s.entries[0])]; ok = true; aim = { x: e.x, y: e.y, z: e.z };
          } else if (a.side === 'atk' && brain.executing && site) { ok = Math.random() < 0.3; aim = { x: site.x, y: 0, z: site.z }; }
        } else if (p.enemySlow || p.allyReduce) {   // купол: при контакте у точки
          ok = !!t && (bomb.planted || since > 20); aim = { x: a.body.x, y: a.body.y, z: a.body.z };
        }
        break;
      case 'wall':
        if (t && dist > 6 && dist < 22) { ok = true; aim = { x: a.body.x + (t.body.x - a.body.x) * 0.4, y: a.body.y, z: a.body.z + (t.body.z - a.body.z) * 0.4 }; }
        break;
      case 'turret':
        if (brain.state === 'hold' || (t && dist > 8)) { ok = Math.random() < 0.4; aim = { x: a.body.x, y: a.body.y, z: a.body.z }; }
        break;
      case 'revive':
        ok = !t && m.actors.some((x) => !x.alive && x.side === a.side) && Math.random() < 0.2;
        break;
      default: break;
    }
    if (!ok) continue;
    // ульт тратим осторожно: только если есть смысл (иначе пропускаем)
    if (d.slot === 'ult' && d.type !== 'reveal' && d.type !== 'revive' && !t && !(brain.executing || bomb.planted)) continue;
    a.aimOverride = aim;
    if (aim) { // для вспышки — смотрим на точку
      const dx = aim.x - a.body.x, dz = aim.z - a.body.z;
      if (d.type === 'flash' || d.type === 'zone' && !p.allyHeal) a.yaw = Math.atan2(-dx, -dz);
    }
    sys.cast(a, d.slot);
    a.aimOverride = null;
    break;     // не больше одной способности за проход
  }
}

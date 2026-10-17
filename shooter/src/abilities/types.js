// Реестр типов способностей. У каждого типа единый интерфейс: (ctx) => boolean.
//   ctx = { m: матч, a: кто применяет, p: параметры из agents.json, sys: AbilitySystem }
// Вернули false — способность не потрачена (например, некуда поставить).
// Чтобы добавить новый тип, достаточно вызвать register('имя', ctx => {...}).
import * as THREE from 'three';
import { ECON } from '../weapons/Weapons.js';

export const TYPES = {};
export const register = (name, fn) => { TYPES[name] = fn; };

// Точка, куда смотрит актёр (для зондов, дыма, стен); на землю опускаем отдельным лучом
export function aimPoint(m, a, range) {
  if (a.aimOverride) return { ...a.aimOverride };
  const d = a.look();
  const ox = a.body.x, oy = a.eyeY, oz = a.body.z;
  const h = m.world.raycast(ox, oy, oz, d.x, d.y, d.z, range);
  let x, y, z;
  if (h) { x = ox + d.x * (h.t - 0.2); y = oy + d.y * (h.t - 0.2); z = oz + d.z * (h.t - 0.2); }
  else { x = ox + d.x * range; y = oy + d.y * range; z = oz + d.z * range; }
  const g = m.world.raycast(x, y + 0.3, z, 0, -1, 0, 12);
  return { x, y: g ? y + 0.3 - g.t : 0, z };
}

register('zone', ({ m, a, p, sys }) => {
  const pt = p.place === 'self' ? { x: a.body.x, y: a.body.y, z: a.body.z } : aimPoint(m, a, p.range || 20);
  sys.addZone(a, pt, p);
  return true;
});

register('dash', ({ m, a, p }) => {
  const d = a.look();
  let hx = d.x, hz = d.z; const l = Math.hypot(hx, hz) || 1; hx /= l; hz /= l;
  a.fx.dash = { until: m.time + p.dur, vx: hx * p.speed, vz: hz * p.speed };
  if (a.body.onGround) { a.body.vy = 2.5; a.body.onGround = false; }
  return true;
});

register('flash', ({ m, a, p, sys }) => {
  const pt = aimPoint(m, a, p.range || 30);
  pt.y = Math.max(pt.y + 1.4, a.eyeY - 0.2);
  sys.later(0.4, () => sys.flashAt(a, pt, p));
  m.fx.puff(pt.x, pt.y, pt.z, 0xffffff, 6, 1);
  return true;
});

register('heal', ({ a, p }) => {
  a.fx.hot.push({ rate: p.amount / p.over, left: p.amount });
  return true;
});

register('buff', ({ m, a, p }) => {
  const targets = p.radius ? [a, ...m.alliesOf(a).filter((t) => Math.hypot(t.body.x - a.body.x, t.body.z - a.body.z) < p.radius)] : [a];
  for (const t of targets) {
    if (p.armor) t.armor = Math.min(ECON.shields.heavy.value, t.armor + p.armor);
    if (p.speed || p.fireRate || p.lifesteal) t.fx.buffs.push({ until: m.time + p.dur, speed: p.speed, fireRate: p.fireRate, lifesteal: p.lifesteal });
    m.fx.puff(t.body.x, t.body.y + 1, t.body.z, 0x7dff8a, 8, 2);
  }
  return true;
});

register('reveal', ({ m, a, p }) => {
  for (const t of m.enemiesOf(a)) {
    if (Math.hypot(t.body.x - a.body.x, t.body.z - a.body.z) <= p.radius) t.fx.revealUntil = Math.max(t.fx.revealUntil, m.time + p.dur);
  }
  if (p.radius < 100) m.fx.ring(a.body.x, 0.1, a.body.z, p.radius, 0xffd23f, 0.8);
  return true;
});

register('wall', ({ m, a, p, sys }) => {
  const pt = aimPoint(m, a, p.range);
  const alongX = Math.abs(Math.sin(a.yaw)) > Math.abs(Math.cos(a.yaw));   // смотрим вдоль X → стена вдоль Z
  const w = alongX ? p.d : p.w, d = alongX ? p.w : p.d;
  const box = { kind: 'barrier', surf: 'metal', x0: pt.x - w / 2, z0: pt.z - d / 2, y0: pt.y, w, d, h: p.h, color: '#c58bff', nonav: true };
  for (const t of m.actors) {                      // не ставим стену внутрь человека
    if (!t.alive) continue;
    const bd = t.body;
    if (bd.x + bd.r > box.x0 && bd.x - bd.r < box.x0 + w && bd.z + bd.r > box.z0 && bd.z - bd.r < box.z0 + d && bd.y < pt.y + p.h && bd.y + bd.h > pt.y) return false;
  }
  sys.addWall(a, box, p.dur);
  return true;
});

register('turret', ({ m, a, p, sys }) => {
  const pt = aimPoint(m, a, 8);
  sys.addTurret(a, pt, p);
  return true;
});

register('revive', ({ m, a }) => {
  const dead = m.actors.filter((t) => !t.alive && t.side === a.side && t.deathPos).sort((x, y) => y.deathTime - x.deathTime)[0];
  if (!dead) return false;
  m.reviveActor(dead);
  return true;
});

export const THREE_REF = THREE;

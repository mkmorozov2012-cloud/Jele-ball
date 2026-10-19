import { WEAPONS, ECON, falloff, slotOf } from './Weapons.js';
import { slab, HIT } from '../world/World.js';
import { DEG, clamp } from '../core/Util.js';

// Боевая механика: выдача оружия, перезарядка, разброс, отдача, трассировка пуль.
// Работает с любым Actor — игроком или ботом.

export const wdef = (a) => WEAPONS[a.guns[a.slot].id];

export function giveWeapon(a, id) {
  const w = WEAPONS[id], slot = slotOf(id);
  a.guns[slot] = { id, mag: w.mag || 0, reserve: w.reserve || 0 };
  if (a.slot === slot || !a.guns[a.slot]) a.slot = slot;
}

export function refillAmmo(a) {
  for (const g of Object.values(a.guns)) if (g) { const w = WEAPONS[g.id]; g.mag = w.mag || 0; g.reserve = w.reserve || 0; }
}

export function switchSlot(m, a, slot) {
  if (!a.guns[slot] || a.slot === slot) return false;
  a.slot = slot; a.reloadEnd = 0; a.scope = 0; a.burstLeft = 0;
  a.drawEnd = m.time + WEAPONS[a.guns[slot].id].draw;
  a.onSwitch?.(m);
  if (a.isPlayer) m.audio.draw();
  return true;
}

export function startReload(m, a) {
  const g = a.gun, w = wdef(a);
  if (!g || w.type === 'melee' || g.mag >= w.mag || g.reserve <= 0 || a.reloadEnd > m.time) return false;
  a.reloadEnd = m.time + w.reload; a.scope = 0; a.burstLeft = 0;
  m.audio.reload(a.isPlayer ? null : a.body, w);
  return true;
}

// Скорость движения с учётом оружия, приседа, замедлений и баффов (м/с)
export function maxSpeed(m, a) {
  const w = a.gun ? wdef(a) : null;
  let s = ECON.baseSpeed * (w ? w.speed : 1);
  if (a.crouching) s *= 0.5; else if (a.walking) s *= 0.42;
  if (a.scope > 0 && w?.type === 'sniper') s *= 0.6;
  if (a.fx.slowUntil > m.time) s *= 1 - a.fx.slow;
  for (const b of a.fx.buffs) if (b.until > m.time && b.speed) s *= 1 + b.speed;
  return s;
}

// Покадровое обновление оружия: окончание перезарядки, затухание разброса
export function tickWeapon(m, a, dt) {
  const g = a.gun;
  if (!g) return;
  const w = WEAPONS[g.id];
  if (a.reloadEnd && m.time >= a.reloadEnd) {
    const need = w.mag - g.mag, take = Math.min(need, g.reserve);
    g.mag += take; g.reserve -= take; a.reloadEnd = 0;
  }
  if (w.spread) {
    const still = a.speedNow < 0.5 && a.body.onGround;
    const rate = w.spread.recover * (still ? 1.8 : 0.5) * (a.crouching ? 1.3 : 1);
    a.fireSpread = Math.max(0, a.fireSpread - rate * dt);
  }
}

// Итоговый разброс (полуугол конуса, градусы)
export function currentSpread(m, a) {
  const w = wdef(a), s = w.spread;
  if (!s) return 0;
  if (w.type === 'sniper' && a.scope === 0) return w.unscoped + a.fireSpread;
  const frac = clamp((a.speedNow / (ECON.baseSpeed * 0.9) - 0.3) / 0.7, 0, 1);
  let sp = (s.base + s.move * frac) * (a.crouching ? s.crouch : 1);
  if (!a.body.onGround) sp += s.air;
  sp += a.fireSpread;
  if (a.scope > 0 && w.type !== 'sniper') sp *= 0.7;
  return sp;
}

// Случайное направление внутри конуса вокруг dir
const tmpD = { x: 0, y: 0, z: 0 };
function cone(dir, deg, out = tmpD) {
  if (deg <= 0) { out.x = dir.x; out.y = dir.y; out.z = dir.z; return out; }
  const r = Math.tan(deg * DEG) * Math.sqrt(Math.random()), th = Math.random() * Math.PI * 2;
  // right = normalize(dir × up), up2 = right × dir
  let rx = -dir.z, rz = dir.x; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
  const ux = -rz * dir.y, uy = rz * dir.x - rx * dir.z, uz = rx * dir.y;
  const cx = Math.cos(th) * r, cy = Math.sin(th) * r;
  out.x = dir.x + rx * cx + ux * cy; out.y = dir.y + uy * cy; out.z = dir.z + rz * cx + uz * cy;
  const l = Math.hypot(out.x, out.y, out.z); out.x /= l; out.y /= l; out.z /= l;
  return out;
}

// Хитбоксы: ноги / тело / голова (по долям роста)
const BX = { x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 };
export function hitboxes(a) {
  const b = a.body, h = b.h;
  const w = 0.26, hw = 0.17;
  return [
    ['leg', b.x - w, b.y, b.z - w, b.x + w, b.y + h * 0.42, b.z + w],
    ['body', b.x - w, b.y + h * 0.42, b.z - w, b.x + w, b.y + h * 0.84, b.z + w],
    ['head', b.x - hw, b.y + h * 0.84, b.z - hw, b.x + hw, b.y + h * 1.02, b.z + hw],
  ];
}

function actorHits(m, shooter, o, d, maxD) {
  const out = [];
  for (const t of m.actors) {
    if (!t.alive || t.side === shooter.side && !m.ffa) continue;
    if (t === shooter) continue;
    let best = null;
    for (const [part, x0, y0, z0, x1, y1, z1] of hitboxes(t)) {
      BX.x0 = x0; BX.y0 = y0; BX.z0 = z0; BX.x1 = x1; BX.y1 = y1; BX.z1 = z1;
      if (slab(o.x, o.y, o.z, d.x, d.y, d.z, BX) && HIT.t0 >= 0 && HIT.t0 <= maxD && (!best || HIT.t0 < best.t)) best = { t: HIT.t0, part, actor: t, type: 'actor' };
    }
    if (best) out.push(best);
  }
  return out;
}

// Трассировка одной пули: стены (с пробитием) и цели. Возвращает точку конца.
function traceBullet(m, a, w, o, d, tr) {
  const maxD = 220;
  const walls = m.world.rayAll(o.x, o.y, o.z, d.x, d.y, d.z, maxD).map((h) => ({ ...h, type: 'wall' }));
  const ev = walls.concat(actorHits(m, a, o, d, maxD)).sort((p, q) => p.t - q.t);
  let pen = w.pen || 0, mul = 1, endT = maxD;
  for (const e of ev) {
    if (e.type === 'wall') {
      m.fx.impact(o.x + d.x * e.t, o.y + d.y * e.t, o.z + d.z * e.t, e.nx, e.ny, e.nz, e.box.surf, tr.pellets > 1 ? 0.5 : 1);
      if (e.thick > pen) { endT = e.t; break; }
      pen -= e.thick; mul *= w.penMul || 0.6;
    } else {
      const mulPart = e.part === 'head' ? w.head : e.part === 'leg' ? w.leg : 1;
      const dmg = (tr.dmg ?? w.dmg) * mulPart * falloff(w, e.t) * mul;
      const px = o.x + d.x * e.t, py = o.y + d.y * e.t, pz = o.z + d.z * e.t;
      m.fx.blood(px, py, pz, d);
      tr.hits.push({ actor: e.actor, dmg, part: e.part, px, py, pz });
      endT = e.t; break;
    }
  }
  tr.end.x = o.x + d.x * endT; tr.end.y = o.y + d.y * endT; tr.end.z = o.z + d.z * endT;
}

// Выстрел. dir — единичный вектор прицеливания (с учётом отдачи игрока).
export function shoot(m, a, dir, heavy = false) {
  const g = a.gun;
  if (!a.alive || !g) return false;
  const w = wdef(a), now = m.time;
  if (a.reloadEnd > now || a.drawEnd > now || a.nextFire > now) return false;
  if (w.type === 'melee') return melee(m, a, dir, w, heavy);
  if (g.mag <= 0) {
    if (now > a.dryAt) { a.dryAt = now + 0.35; m.audio.dry(a.isPlayer ? null : a.body); startReload(m, a); }
    return false;
  }
  g.mag--;
  let mul = 1;
  for (const b of a.fx.buffs) if (b.until > now && b.fireRate) mul += b.fireRate;
  const interval = 60 / (w.rpm * mul);
  a.nextFire = now - a.nextFire < interval * 1.6 && a.nextFire > 0 ? a.nextFire + interval : now + interval;
  if (now - a.lastShot > 0.3 + interval) a.shotIdx = 0;
  a.lastShot = now;
  if (w.burst) {
    if (a.burstLeft <= 0) a.burstLeft = w.burst - 1; else a.burstLeft--;
    if (a.burstLeft === 0) a.nextFire += 0.28;
  }

  const o = { x: a.body.x, y: a.eyeY, z: a.body.z };
  const sp = currentSpread(m, a);
  const mz = a.muzzle || o;
  const hitsAll = [];
  let lastEnd = { x: 0, y: 0, z: 0 };
  for (let p = 0; p < w.pellets; p++) {
    const d0 = cone(dir, sp);
    const d1 = w.pellets > 1 ? cone(d0, w.pelletSpread, { x: 0, y: 0, z: 0 }) : d0;
    const tr = { hits: [], end: { x: 0, y: 0, z: 0 }, pellets: w.pellets };
    traceBullet(m, a, w, o, d1, tr);
    hitsAll.push(...tr.hits);
    if (p < Math.min(w.pellets, 4) || w.pellets === 1) m.fx.tracer(mz.x, mz.y, mz.z, tr.end.x, tr.end.y, tr.end.z, a.side);
    lastEnd = tr.end;
  }
  // сводим попадания по целям (дробь — суммируем урон)
  const byActor = new Map();
  for (const h of hitsAll) {
    const cur = byActor.get(h.actor);
    if (!cur) byActor.set(h.actor, { ...h }); else { cur.dmg += h.dmg; if (h.part === 'head') cur.part = 'head'; }
  }
  for (const h of byActor.values()) m.damage(a, h.actor, h.dmg, h.part, w.id, h);

  // отдача и разброс
  a.fireSpread = Math.min(w.spread.max, a.fireSpread + w.spread.shot);
  let ri = a.shotIdx;
  if (ri >= w.recoil.length) { const tail = Math.max(2, Math.floor(w.recoil.length * 0.4)); ri = w.recoil.length - tail + ((ri - w.recoil.length) % tail); }
  const kick = w.recoil[ri] || [0, 0];
  a.shotIdx++;
  a.onShoot?.(w, kick);
  m.audio.gun(w, a.isPlayer ? null : a.body);
  m.noise(a.body.x, a.body.z, w.type === 'sniper' ? 70 : 50, a.side, 'shot', a);
  if (a.isPlayer) m.fx.shell(mz, a);
  return true;
}

function melee(m, a, dir, w, heavy) {
  const now = m.time;
  a.nextFire = now + 60 / (heavy ? w.heavyRpm : w.rpm);
  a.onMelee?.(heavy);
  m.audio.swing(a.isPlayer ? null : a.body);
  const o = { x: a.body.x, y: a.eyeY, z: a.body.z };
  let best = null;
  for (const t of m.actors) {
    if (!t.alive || t.side === a.side) continue;
    const dx = t.body.x - o.x, dz = t.body.z - o.z, dy = t.body.y + 1 - o.y;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > w.range + 0.4) continue;
    const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / (dist || 1);
    if (dot < 0.55) continue;
    if (!m.world.los(o.x, o.y, o.z, t.body.x, t.body.y + 1, t.body.z)) continue;
    if (!best || dist < best.dist) best = { t, dist };
  }
  if (best) {
    const t = best.t;
    // удар в спину — смертелен (тяжёлый удар)
    const fx = -Math.sin(t.yaw), fz = -Math.cos(t.yaw);
    const behind = (fx * dir.x + fz * dir.z) > 0.4;
    const dmg = heavy ? (behind ? 150 : w.heavy) : (behind ? w.dmg * 2 : w.dmg);
    m.fx.blood(t.body.x, t.body.y + 1.1, t.body.z, dir);
    m.damage(a, t, dmg, 'body', w.id, { px: t.body.x, py: t.body.y + 1, pz: t.body.z });
  } else {
    const h = m.world.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, w.range);
    if (h) m.fx.impact(o.x + dir.x * h.t, o.y + dir.y * h.t, o.z + dir.z * h.t, h.nx, h.ny, h.nz, h.box.surf, 0.5);
  }
  return true;
}

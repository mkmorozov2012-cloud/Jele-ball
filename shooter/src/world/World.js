// Физический мир: набор осевых боксов (AABB), лучи и движение тел.
// Игрок и боты — вертикальные «капсулы», упрощённые до бокса 0.6 x h x 0.6.
// Так проще и быстрее: движение по осям + выталкивание из стен + автоподъём на ступеньки.

const STEP = 0.5;      // максимальная высота ступеньки, на которую тело шагает само
const EPS = 0.0005;

export const BODY_R = 0.3;
export const STAND_H = 1.8;
export const CROUCH_H = 1.3;

// Пересечение луча с боксом (метод «плит»). Результат кладём в общий объект HIT (без аллокаций).
const HIT = { t0: 0, t1: 0, axis: 0, sign: 0 };
function slab(ox, oy, oz, dx, dy, dz, b) {
  let tmin = -Infinity, tmax = Infinity, axis = 0, sign = 0;
  // X
  if (Math.abs(dx) < 1e-9) { if (ox < b.x0 || ox > b.x1) return false; }
  else {
    let a = (b.x0 - ox) / dx, c = (b.x1 - ox) / dx, s = -1;
    if (a > c) { const t = a; a = c; c = t; s = 1; }
    if (a > tmin) { tmin = a; axis = 0; sign = s; }
    if (c < tmax) tmax = c;
    if (tmin > tmax) return false;
  }
  // Y
  if (Math.abs(dy) < 1e-9) { if (oy < b.y0 || oy > b.y1) return false; }
  else {
    let a = (b.y0 - oy) / dy, c = (b.y1 - oy) / dy, s = -1;
    if (a > c) { const t = a; a = c; c = t; s = 1; }
    if (a > tmin) { tmin = a; axis = 1; sign = s; }
    if (c < tmax) tmax = c;
    if (tmin > tmax) return false;
  }
  // Z
  if (Math.abs(dz) < 1e-9) { if (oz < b.z0 || oz > b.z1) return false; }
  else {
    let a = (b.z0 - oz) / dz, c = (b.z1 - oz) / dz, s = -1;
    if (a > c) { const t = a; a = c; c = t; s = 1; }
    if (a > tmin) { tmin = a; axis = 2; sign = s; }
    if (c < tmax) tmax = c;
    if (tmin > tmax) return false;
  }
  HIT.t0 = tmin; HIT.t1 = tmax; HIT.axis = axis; HIT.sign = sign;
  return tmax >= 0;
}
export { slab, HIT };

export class World {
  constructor() {
    this.boxes = [];
    this.smokes = [];   // сферы дыма {x,y,z,r}: блокируют обзор, но не пули
  }

  add(b) {
    b.x1 = b.x0 + b.w; b.y1 = b.y0 + b.h; b.z1 = b.z0 + b.d;
    this.boxes.push(b);
    return b;
  }
  remove(b) {
    const i = this.boxes.indexOf(b);
    if (i >= 0) this.boxes.splice(i, 1);
  }

  // Луч: ближайшее попадание в геометрию. Возвращает {t, nx, ny, nz, box} или null.
  raycast(ox, oy, oz, dx, dy, dz, max = 500) {
    let best = null, bt = max;
    for (const b of this.boxes) {
      if (!slab(ox, oy, oz, dx, dy, dz, b)) continue;
      if (HIT.t0 < 0 || HIT.t0 > bt) continue;
      bt = HIT.t0;
      best = { t: bt, nx: 0, ny: 0, nz: 0, box: b };
      if (HIT.axis === 0) best.nx = HIT.sign; else if (HIT.axis === 1) best.ny = HIT.sign; else best.nz = HIT.sign;
    }
    return best;
  }

  // Все пересечения вдоль луча (для пробития стен), отсортированы по дистанции.
  rayAll(ox, oy, oz, dx, dy, dz, max = 500) {
    const out = [];
    for (const b of this.boxes) {
      if (!slab(ox, oy, oz, dx, dy, dz, b)) continue;
      if (HIT.t0 < 0 || HIT.t0 > max) continue;
      const h = { t: HIT.t0, thick: HIT.t1 - HIT.t0, nx: 0, ny: 0, nz: 0, box: b };
      if (HIT.axis === 0) h.nx = HIT.sign; else if (HIT.axis === 1) h.ny = HIT.sign; else h.nz = HIT.sign;
      out.push(h);
    }
    return out.sort((a, b) => a.t - b.t);
  }

  // Прямая видимость между двумя точками (пули/звук — без учёта дыма).
  los(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return true;
    const ix = dx / len, iy = dy / len, iz = dz / len;
    for (const b of this.boxes) {
      if (slab(ax, ay, az, ix, iy, iz, b) && HIT.t0 > 0.001 && HIT.t0 < len - 0.02) return false;
    }
    return true;
  }

  // Видимость с учётом дыма (для глаз ботов).
  seen(ax, ay, az, bx, by, bz) {
    if (!this.los(ax, ay, az, bx, by, bz)) return false;
    if (!this.smokes.length) return true;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz;
    for (const s of this.smokes) {
      // расстояние от центра дыма до отрезка
      let t = ((s.x - ax) * dx + (s.y - ay) * dy + (s.z - az) * dz) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + dx * t - s.x, py = ay + dy * t - s.y, pz = az + dz * t - s.z;
      if (px * px + py * py + pz * pz < s.r * s.r) return false;
    }
    return true;
  }

  // Проходим ли отрезок на плоскости для ботов (учитывает ступеньки и высоту).
  segmentFree(x0, z0, y0, x1, z1, y1, half = 0.45) {
    const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
    const dx = x1 - x0, dz = z1 - z0;
    for (const b of this.boxes) {
      if (b.pass || b.nonav) continue;                 // ступеньки лестниц не мешают
      if (b.y1 <= lo + STEP + 0.01) continue;          // низкое — перешагиваем
      if (b.y0 >= hi + 1.2) continue;                  // слишком высоко над головой
      // конец отрезка стоит на этой платформе — она не преграда
      const inside = (x, z, y) => x > b.x0 - 0.01 && x < b.x1 + 0.01 && z > b.z0 - 0.01 && z < b.z1 + 0.01 && y >= b.y1 - 0.06;
      if (inside(x0, z0, y0) || inside(x1, z1, y1)) continue;
      // расширенный бокс против отрезка в плоскости XZ (2D-слэб)
      let tmin = 0, tmax = 1, ok = true;
      for (const [o, d, mn, mx] of [[x0, dx, b.x0 - half, b.x1 + half], [z0, dz, b.z0 - half, b.z1 + half]]) {
        if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) { ok = false; break; } }
        else {
          let a = (mn - o) / d, c = (mx - o) / d;
          if (a > c) { const t = a; a = c; c = t; }
          if (a > tmin) tmin = a;
          if (c < tmax) tmax = c;
          if (tmin > tmax) { ok = false; break; }
        }
      }
      if (ok) return false;
    }
    return true;
  }

  overlaps(b, bx) {
    return b.x - b.r < bx.x1 && b.x + b.r > bx.x0 &&
           b.z - b.r < bx.z1 && b.z + b.r > bx.z0 &&
           b.y + b.h > bx.y0 + 1e-4 && b.y < bx.y1 - 1e-4;
  }
  anyOverlap(b) {
    for (const bx of this.boxes) if (this.overlaps(b, bx)) return true;
    return false;
  }

  // Можно ли встать (хватает ли места над головой)
  canStand(b) {
    const h = b.h; b.h = STAND_H;
    const r = !this.anyOverlap(b);
    b.h = h;
    return r;
  }

  // Движение тела: скорость * dt с раздельным разрешением по осям.
  moveBody(b, dt) {
    const was = b.onGround;
    b.onGround = false;
    const dx = b.vx * dt;
    if (dx) { b.x += dx; this.pushH(b, 0, dx, was); }
    const dz = b.vz * dt;
    if (dz) { b.z += dz; this.pushH(b, 2, dz, was); }
    const dy = b.vy * dt;
    b.y += dy;
    this.pushV(b, dy);
  }

  pushH(b, axis, d, was) {
    for (const bx of this.boxes) {
      if (!this.overlaps(b, bx)) continue;
      const lift = bx.y1 - b.y;
      if (was && lift > 0 && lift <= STEP) {            // ступенька — поднимаемся
        const oy = b.y;
        b.y = bx.y1 + EPS;
        if (!this.anyOverlap(b)) continue;
        b.y = oy;
      }
      if (axis === 0) { b.x = d > 0 ? bx.x0 - b.r - EPS : bx.x1 + b.r + EPS; b.vx = 0; }
      else { b.z = d > 0 ? bx.z0 - b.r - EPS : bx.z1 + b.r + EPS; b.vz = 0; }
    }
  }

  pushV(b, dy) {
    for (const bx of this.boxes) {
      if (!this.overlaps(b, bx)) continue;
      if (dy <= 0) { b.y = bx.y1; b.vy = 0; b.onGround = true; b.groundBox = bx; }
      else { b.y = bx.y0 - b.h; b.vy = 0; }
    }
  }

  // Что под ногами (для звука шагов)
  groundAt(b) {
    return b.groundBox || null;
  }
}

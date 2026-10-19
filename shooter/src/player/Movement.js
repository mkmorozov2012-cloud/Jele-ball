import { maxSpeed } from '../weapons/Combat.js';

const GRAVITY = 24, JUMP_V = 7.6;

// Общий шаг движения для игрока и ботов: ускорение, прыжок, рывок, коллизии.
// (wx, wz) — желаемое направление (единичное или ноль), run=false → ходьба тише.
export function stepActor(m, a, wx, wz, dt, jump = false) {
  const b = a.body, now = m.time;
  const dash = a.fx.dash;
  if (dash && dash.until > now) {
    b.vx = dash.vx; b.vz = dash.vz;
  } else {
    if (dash) { a.fx.dash = null; }
    const sp = a.frozen ? 0 : maxSpeed(m, a);
    const tx = wx * sp, tz = wz * sp;
    const ax = tx - b.vx, az = tz - b.vz, d = Math.hypot(ax, az);
    const acc = (b.onGround ? 75 : 9) * dt;
    if (d <= acc || d < 1e-6) { b.vx = tx; b.vz = tz; } else { b.vx += (ax / d) * acc; b.vz += (az / d) * acc; }
  }
  const wasAir = !b.onGround, vyBefore = b.vy;
  b.vy = Math.max(b.vy - GRAVITY * dt, -50);
  if (jump && b.onGround && !a.frozen) { b.vy = JUMP_V; b.onGround = false; }
  m.world.moveBody(b, dt);
  a.speedNow = Math.hypot(b.vx, b.vz);
  a.landed = wasAir && b.onGround && vyBefore < -7 ? -vyBefore : 0;
}

// Приседание с проверкой потолка
export function applyCrouch(m, a, want) {
  if (want === a.crouching) return;
  if (!want && !m.world.canStand(a.body)) return;
  a.setCrouch(want);
}

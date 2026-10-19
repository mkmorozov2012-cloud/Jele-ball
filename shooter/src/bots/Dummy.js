import { stepActor } from '../player/Movement.js';

// Мишени стрельбища: стоят, ходят из стороны в сторону или воскресают после попадания.
export function applyDummy(m, dt) {
  for (const a of m.dummies || []) {
    const d = a.dummy;
    if (!a.alive) {
      d.dead -= dt;
      if (d.dead <= 0) {
        m.spawnAt(a, d.ox, d.oz, 0, 0); m.loadoutDefault(a);
        a.model.fall = 0; a.model.inner.rotation.x = 0;
      }
      continue;
    }
    if (a.brain) continue;                       // «бот-цель» управляется BotBrain
    if (d.kind === 'strafe') {
      d.t += dt;
      stepActor(m, a, Math.sin(d.t * (d.speed || 0.8)), 0, dt);
    } else {
      stepActor(m, a, 0, 0, dt);
    }
    a.yaw = 0;
    if (a.hp < 100) a.hp = Math.min(100, a.hp + dt * 12);  // мишень медленно восстанавливается
  }
}

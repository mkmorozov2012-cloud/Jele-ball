import { stepActor } from '../player/Movement.js';
export class BotBrain {
  constructor(m, a, diff) { this.m = m; this.actor = a; this.diff = diff; }
  newRound() {}
  hear() {}
  update(dt) { if (this.actor.alive) stepActor(this.m, this.actor, 0, 0, dt); }
}

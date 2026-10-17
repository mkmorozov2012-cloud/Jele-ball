import { shuffle } from '../core/Util.js';

// Командная тактика ботов: кто куда идёт в раунде.
// Атака выбирает точку и входы, защита расставляется по позициям, при закладке — ретейк.
export class Tactics {
  constructor(m) {
    this.m = m;
    this.site = 'A';
    this.intel = { A: -99, B: -99 };      // когда последний раз «слышали» врага у точки
    this.liveAt = 0;
    this.execute = false;                  // атака начала штурм точки
    this.executeAt = 0;
    this.plan = {};                        // actor.id -> {...}
  }

  sites() { return Object.keys(this.m.map.sites); }

  newRound() {
    const m = this.m;
    if (m.mode !== 'match') return;
    this.plan = {}; this.execute = false; this.intel = { A: -99, B: -99 };
    const names = this.sites();
    this.site = names[Math.floor(Math.random() * names.length)];
    const atk = shuffle(m.actors.filter((a) => a.side === 'atk'));
    const def = shuffle(m.actors.filter((a) => a.side === 'def'));
    const S = m.map.sites[this.site];
    atk.forEach((a, i) => {
      this.plan[a.id] = { role: 'atk', site: this.site, entry: S.entries[i % S.entries.length], post: S.posts[i % S.posts.length], i };
    });
    // защита: по два на каждую точку и один «ротатор» в центре
    const layout = ['A', 'B', 'A', 'B', 'mid'];
    def.forEach((a, i) => {
      const site = layout[i % layout.length];
      const s = m.map.sites[site];
      this.plan[a.id] = { role: 'def', site, hold: s ? s.holds[Math.floor(i / 2) % s.holds.length] : null, i };
    });
  }

  liveStart() { this.liveAt = this.m.time; }

  // Первый живой атакующий-бот — «закладчик» (если игрок-атакующий жив, ему решать самому)
  planter() {
    const list = this.m.actors.filter((a) => a.alive && a.side === 'atk');
    const bot = list.find((a) => !a.isPlayer || a.brain);
    return bot || null;
  }

  noteContact(x, z) {
    const m = this.m;
    for (const s of Object.values(m.map.sites)) {
      if (Math.hypot(s.x - x, s.z - z) < s.r + 18) this.intel[s.name] = m.time;
    }
  }

  // Готовы ли атакующие идти на точку: все дошли до входов или прошло время
  readyToExecute() {
    const m = this.m;
    if (this.execute) return true;
    const since = m.time - this.liveAt;
    const bots = m.bots.filter((b) => b.actor.alive && b.actor.side === 'atk');
    const arrived = bots.filter((b) => b.atGoal).length;
    if (since > 12 && (arrived >= Math.ceil(bots.length * 0.6) || since > 22)) { this.execute = true; this.executeAt = m.time; }
    return this.execute;
  }
}

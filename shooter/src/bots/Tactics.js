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
    this.sight = { atk: null, def: null }; // последнее замеченное врагами положение (общая информация команды)
    this.switched = false; this.atkStart = 5;
  }

  // Общая «рация»: любой бот сообщает, где увидел врага
  report(side, enemy) { this.sight[side] = { x: enemy.body.x, z: enemy.body.z, t: this.m.time }; }
  recent(side, sec = 3.5) { const s = this.sight[side]; return s && this.m.time - s.t < sec ? s : null; }

  // Экономика команды: если в среднем денег мало — «эко-раунд» (копим), иначе полная закупка
  ecoMode(side) {
    const list = this.m.actors.filter((a) => a.side === side);
    const avg = list.reduce((s, a) => s + a.money + (a.guns.primary ? 2500 : 0), 0) / Math.max(1, list.length);
    return this.m.rounds.round > 1 && avg < 2300;
  }

  // Каждый кадр боя: решаем, не пора ли атаке сменить точку
  update() {
    const m = this.m;
    if (m.mode !== 'match' || m.rounds.phase !== 'live' || this.switched || m.bomb.planted || !this.execute) return;
    const lost = this.atkStart - m.aliveCount('atk');
    if (lost >= 2 && m.time - this.executeAt < 30 && m.aliveCount('atk') >= 2) {
      this.switched = true;
      if (Math.random() < 0.6) this.switchSite();
    }
  }
  switchSite() {
    const m = this.m, names = this.sites(), other = names.find((n) => n !== this.site);
    if (!other) return;
    this.site = other;
    const S = m.map.sites[other];
    let i = 0;
    for (const a of m.actors) {
      const p = this.plan[a.id]; if (!p || p.role !== 'atk') continue;
      p.site = other; p.entry = S.entries[i % S.entries.length]; p.post = S.posts[i % S.posts.length]; i++;
    }
    this.execute = false; this.liveAt = m.time - 3;      // бежим на другую точку и ждём сбора
    for (const b of m.bots) if (b.actor.side === 'atk') { b.goalIdx = -1; b.atGoal = false; b.executing = false; }
    m.emit('message', 'Атака меняет точку!', 1.5);
  }

  // Ретейк: защитники сначала собираются у точки и только потом идут на заряд
  retakeReady() {
    const m = this.m, b = m.bomb;
    if (!b.planted) return false;
    if (m.time - b.plantTime > 16) return true;
    const s = m.map.sites[b.site]; let near = 0, alive = 0;
    for (const a of m.actors) { if (!a.alive || a.side !== 'def') continue; alive++; if (Math.hypot(a.body.x - s.x, a.body.z - s.z) < s.r + 14) near++; }
    return near >= Math.min(3, alive);
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

  liveStart() { this.liveAt = this.m.time; this.switched = false; this.atkStart = this.m.aliveCount('atk'); }

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
    if (since > 8 && (arrived >= Math.ceil(bots.length * 0.6) || since > 18)) { this.execute = true; this.executeAt = m.time; }
    return this.execute;
  }
}

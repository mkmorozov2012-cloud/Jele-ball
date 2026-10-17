import { ECON, WEAPONS } from '../weapons/Weapons.js';
import AGENTS from '../data/agents.json';
import { giveWeapon, refillAmmo } from '../weapons/Combat.js';

// Раундовый режим: фазы, счёт, смена сторон, экономика.
// Команды (squad): 0 — команда игрока, 1 — противник. Стороны: 'atk' (атака) / 'def' (защита).
export class Rounds {
  constructor(m) {
    this.m = m;
    this.round = 0;
    this.score = [0, 0];
    this.phase = 'buy';         // buy | live | end | over
    this.timeLeft = 0;
    this.lossStreak = [0, 0];
    this.squadSide = ['atk', 'def'];
    this.last = null;           // итог последнего раунда {winnerSide, reason}
    this.history = [];
    this.spawnBox = { atk: null, def: null };
    this.pendingBuyBots = [];
  }
  sideOf(squad) { return this.squadSide[squad]; }
  squadOf(side) { return this.squadSide[0] === side ? 0 : 1; }

  startMatch(sideChoice) {
    const m = this.m;
    let mySide = sideChoice;
    if (mySide !== 'atk' && mySide !== 'def') mySide = Math.random() < 0.5 ? 'atk' : 'def';
    this.squadSide = mySide === 'atk' ? ['atk', 'def'] : ['def', 'atk'];
    this.fullReset();
    this.startRound();
  }

  fullReset() {
    for (const a of this.m.actors) {
      a.money = ECON.startMoney; a.kills = a.deaths = a.assists = a.damageDealt = 0; a.ult = 0;
      a.side = this.squadSide[a.squad];
      this.m.loadoutDefault(a);
    }
    this.lossStreak = [0, 0];
  }

  startRound() {
    const m = this.m;
    this.round++;
    this.phase = 'buy'; this.timeLeft = ECON.buyTime;
    m.bomb.reset();
    m.abilities.reset();
    m.fx.clearDecals();
    m.world.smokes.length = 0;
    const idx = { atk: 0, def: 0 };
    for (const a of m.actors) {
      a.side = this.squadSide[a.squad];
      a.model?.setSide(a.side);
      if (!a.survived) m.loadoutDefault(a);
      a.survived = false;
      refillAmmo(a);
      a.slot = a.guns.primary ? 'primary' : 'secondary';
      a.roundKills = 0;
      const list = a.side === 'atk' ? m.map.attackSpawns : m.map.defendSpawns;
      const [sx, sz] = list[idx[a.side]++ % list.length];
      m.spawnAt(a, sx, sz, 0, 0);
      m.abilities.roundInit(a);
    }
    // границы зоны спавна на время закупки
    for (const side of ['atk', 'def']) {
      const list = side === 'atk' ? m.map.attackSpawns : m.map.defendSpawns;
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const [x, z] of list) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      this.spawnBox[side] = { x0: x0 - 5, x1: x1 + 5, z0: z0 - 4, z1: z1 + 4 };
    }
    m.tactics.newRound();
    for (const b of m.bots) b.newRound();
    m.player.ctrl.newRound();
    m.audio.roundStart();
    m.emit('roundStart', this.round);
    m.emit('message', this.round === 1 || this.round === ECON.halfAfter + 1 ? 'ПОДГОТОВКА' : `РАУНД ${this.round}`, 2);
  }

  update(dt) {
    const m = this.m;
    if (this.phase === 'over') return;
    // барьер спавна во время закупки
    if (this.phase === 'buy') {
      for (const a of m.actors) {
        const box = this.spawnBox[a.side]; if (!box || !a.alive) continue;
        const b = a.body;
        b.x = Math.min(box.x1, Math.max(box.x0, b.x)); b.z = Math.min(box.z1, Math.max(box.z0, b.z));
      }
    }
    this.timeLeft -= dt;
    if (this.phase === 'buy') {
      if (this.timeLeft <= 0) { this.phase = 'live'; this.timeLeft = ECON.roundTime; m.emit('phase', 'live'); m.emit('message', 'РАУНД НАЧАЛСЯ', 1.5); m.tactics.liveStart(); }
    } else if (this.phase === 'live') {
      this.checkEnd();
    } else if (this.phase === 'end') {
      if (this.timeLeft <= 0) {
        if (this.matchWinner !== undefined) { this.phase = 'over'; m.over = true; m.emit('matchEnd', this.matchWinner); return; }
        this.startRound();
      }
    }
  }

  checkEnd() {
    const m = this.m, bomb = m.bomb;
    const atk = m.aliveCount('atk'), def = m.aliveCount('def');
    if (bomb.exploded) return this.endRound('atk', 'Заряд взорван');
    if (bomb.defused) return this.endRound('def', 'Заряд обезврежен');
    if (def === 0) return this.endRound('atk', 'Защитники уничтожены');
    if (atk === 0 && !bomb.planted) return this.endRound('def', 'Атакующие уничтожены');
    if (!bomb.planted && this.timeLeft <= 0) return this.endRound('def', 'Время вышло');
  }

  endRound(winnerSide, reason) {
    if (this.phase !== 'live') return;
    const m = this.m;
    this.phase = 'end'; this.timeLeft = ECON.endTime;
    const ws = this.squadOf(winnerSide), ls = 1 - ws;
    this.score[ws]++;
    this.lossStreak[ws] = 0;
    const bonus = ECON.lossBonus[Math.min(this.lossStreak[ls], ECON.lossBonus.length - 1)];
    this.lossStreak[ls]++;
    for (const a of m.actors) {
      let gain = a.squad === ws ? ECON.winBonus : bonus;
      if (a.side === 'atk' && a.squad === ls && m.bomb.planted) gain += ECON.plantBonus;
      a.money = Math.min(ECON.maxMoney, a.money + gain);
      a.survived = a.alive;
      a.ult = Math.min(AGENTS[a.agent].ultCost, a.ult + 1);   // +1 очко ульты за раунд
    }
    this.last = { winnerSide, winnerSquad: ws, reason };
    this.history.push({ round: this.round, winnerSquad: ws, winnerSide, reason });
    m.emit('roundEnd', this.last);
    m.audio.roundEnd(m.player.squad === ws);
    m.emit('message', m.player.squad === ws ? 'РАУНД ВЫИГРАН' : 'РАУНД ПРОИГРАН', 3);

    // конец матча
    if (this.score[ws] >= ECON.roundsToWin) {
      this.matchWinner = ws;
      this.timeLeft = ECON.endTime + 0.5;
      return;
    }
    // смена сторон на половине
    if (this.round === ECON.halfAfter) {
      this.squadSide = [this.squadSide[1], this.squadSide[0]];
      this.lossStreak = [0, 0];
      for (const a of m.actors) { a.money = ECON.startMoney; a.survived = false; a.ult = 0; }
      this.timeLeft = ECON.endTime + 1.5;
      m.emit('message', 'СМЕНА СТОРОН', 3);
    }
  }
}

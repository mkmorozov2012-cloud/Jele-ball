import { settings } from '../core/Settings.js';
import { prettyKey } from '../core/Input.js';
import { fmtTime } from '../core/Util.js';
import { WEAPONS, ECON } from '../weapons/Weapons.js';
import AGENTS from '../data/agents.json';
import { currentSpread, wdef } from '../weapons/Combat.js';
import { Minimap } from '../world/Minimap.js';

const SIDE_COL = { atk: 'var(--atk)', def: 'var(--def)' };

// Рисует прицел внутри контейнера по настройкам (используется и в HUD, и в настройках)
export function renderCrosshair(el, c, extraGap = 0) {
  el.innerHTML = '';
  el.style.setProperty('--ch-color', c.color);
  el.style.opacity = c.opacity;
  const add = (cls, style) => { const d = document.createElement('i'); d.className = cls; Object.assign(d.style, style); el.appendChild(d); return d; };
  const gap = c.gap + extraGap, len = c.size, th = c.thickness;
  if (c.shape === 'cross') {
    add('ch', { width: th + 'px', height: len + 'px', left: `calc(50% - ${th / 2}px)`, top: `calc(50% - ${gap + len}px)` });
    add('ch', { width: th + 'px', height: len + 'px', left: `calc(50% - ${th / 2}px)`, top: `calc(50% + ${gap}px)` });
    add('ch', { height: th + 'px', width: len + 'px', top: `calc(50% - ${th / 2}px)`, left: `calc(50% - ${gap + len}px)` });
    add('ch', { height: th + 'px', width: len + 'px', top: `calc(50% - ${th / 2}px)`, left: `calc(50% + ${gap}px)` });
  } else if (c.shape === 'circle') {
    const r = gap + len / 2;
    add('ch ring', { width: r * 2 + 'px', height: r * 2 + 'px', left: `calc(50% - ${r}px)`, top: `calc(50% - ${r}px)`, borderWidth: th + 'px' });
  } else if (c.shape === 'chevron') {
    const g = gap + 2;
    add('ch', { width: th + 'px', height: len + 'px', left: `calc(50% - ${len * 0.5}px)`, top: `calc(50% + ${g}px)`, transform: 'rotate(40deg)' });
    add('ch', { width: th + 'px', height: len + 'px', left: `calc(50% + ${len * 0.5 - th}px)`, top: `calc(50% + ${g}px)`, transform: 'rotate(-40deg)' });
  } else if (c.shape === 'dot') {
    add('ch', { width: len / 2 + th + 'px', height: len / 2 + th + 'px', left: `calc(50% - ${(len / 2 + th) / 2}px)`, top: `calc(50% - ${(len / 2 + th) / 2}px)`, borderRadius: '50%' });
  }
  if (c.dot && c.shape !== 'dot') add('ch', { width: th + 1 + 'px', height: th + 1 + 'px', left: `calc(50% - ${(th + 1) / 2}px)`, top: `calc(50% - ${(th + 1) / 2}px)`, borderRadius: '50%' });
}

export class Hud {
  constructor(root) {
    this.root = root;
    this.el = document.createElement('div');
    this.el.id = 'hud'; this.el.className = 'hidden';
    this.el.innerHTML = `
      <div class="h-top">
        <div class="h-team" id="hL"><b id="hSL">0</b><div class="h-alive" id="hAL"></div></div>
        <div class="h-center"><div id="hTimer">0:00</div><div id="hPhase"></div><div id="hRound"></div></div>
        <div class="h-team right" id="hR"><b id="hSR">0</b><div class="h-alive" id="hAR"></div></div>
      </div>
      <div class="h-mini"><canvas id="hMini" width="230" height="230"></canvas><div id="hZone"></div></div>
      <div class="h-kill" id="hKill"></div>
      <div id="hCross"></div>
      <div id="hHit"><i></i><i></i><i></i><i></i></div>
      <div id="hMsg"></div>
      <div id="hHint"></div>
      <div id="hProg"><div class="bar"><div></div></div><span></span></div>
      <div class="h-bl"><div class="h-agent" id="hAgent"></div>
        <div class="h-hp"><span id="hHpN">100</span><div class="bars"><div class="bar hp"><div id="hHpB"></div></div><div class="bar ar"><div id="hArB"></div></div></div></div></div>
      <div class="h-br"><div id="hWpn"></div><div id="hAmmo"><b>0</b><span>/ 0</span></div><div id="hMoney"></div></div>
      <div class="h-abil" id="hAbil"></div>
      <div id="hFlash"></div><div id="hHurt"></div><div id="hSmoke"></div>
      <div id="hScope"><i></i><i></i></div>
      <div id="hSpec"></div><div id="hFps"></div>
      <div id="hLock">Нажмите, чтобы продолжить</div>
      <div id="hScores"></div>`;
    root.appendChild(this.el);
    this.$ = (id) => this.el.querySelector('#' + id);
    this.cache = {};
    this.killRows = [];
    this.msgT = 0; this.hitT = 0; this.hurtA = 0; this.flashA = 0;
    this.fpsAcc = 0; this.fpsN = 0; this.fpsT = 0;
    this.off = [];
    settings.on('change', () => this.applyCrosshair());
  }

  // Подписаться на матч
  attach(m) {
    this.detach();
    this.m = m;
    this.mini = new Minimap(this.$('hMini'), m.map);
    this.el.classList.remove('hidden');
    this.cache = {};
    this.$('hKill').innerHTML = '';
    this.buildAbilities();
    this.applyCrosshair();
    this.$('hMini').parentElement.style.display = '';
    const on = (n, f) => this.off.push(m.on(n, f));
    on('kill', (k) => this.addKill(k));
    on('message', (t, s) => this.message(t, s));
    on('hitmarker', (head, kill) => { this.hitT = 0.22; this.$('hHit').className = head ? 'head' : kill ? 'kill' : ''; });
    on('hurt', (from) => { this.hurtA = 0.55; });
    on('flashed', () => {});
    on('abilityFail', () => m.audio.uiSnd('error'));
    on('roundStart', () => { this.$('hKill').innerHTML = ''; });
  }
  detach() { this.off.forEach((f) => f()); this.off = []; this.m = null; this.el.classList.add('hidden'); }

  applyCrosshair() {
    this.baseCross = true;
    this.crossKey = '';
  }

  buildAbilities() {
    const a = this.m.player, ag = AGENTS[a.agent];
    this.$('hAgent').innerHTML = `<b style="color:${ag.color}">${ag.name}</b><span>${ag.role}</span>`;
    this.$('hAbil').innerHTML = ag.abilities.map((d) => `
      <div class="ab" data-slot="${d.slot}" title="${d.name}">
        <div class="ab-key">${prettyKey(settings.data.keys[d.slot === 'ult' ? 'ult' : d.slot]?.[0] || d.key)}</div>
        <div class="ab-name">${d.name}</div>
        <div class="ab-cd"></div><div class="ab-n"></div></div>`).join('');
    this.abEls = [...this.$('hAbil').children];
  }

  message(text, sec = 2) { const e = this.$('hMsg'); e.textContent = text; e.classList.add('on'); this.msgT = sec; }

  addKill(k) {
    const m = this.m, p = m.player;
    const row = document.createElement('div');
    const col = (a) => (a ? (a.side === 'atk' ? 'var(--atk)' : 'var(--def)') : '#aaa');
    const w = WEAPONS[k.weapon];
    const wn = w ? w.name : k.weapon === 'bomb' ? 'Взрыв' : k.weapon === 'gas' ? 'Яд' : k.weapon === 'turret' ? 'Турель' : '';
    row.className = 'kf' + (k.killer === p ? ' me' : k.victim === p ? ' dead' : '');
    row.innerHTML = `${k.killer ? `<b style="color:${col(k.killer)}">${k.killer.name}</b>` : ''}<em>${wn}${k.head ? ' <u>⌖</u>' : ''}</em><b style="color:${col(k.victim)}">${k.victim.name}</b>`;
    const box = this.$('hKill'); box.prepend(row);
    setTimeout(() => row.remove(), 6000);
    while (box.children.length > 6) box.lastChild.remove();
  }

  set(id, v, prop = 'textContent') {
    const key = id + prop;
    if (this.cache[key] === v) return;
    this.cache[key] = v; this.$(id)[prop] = v;
  }
  setStyle(id, prop, v) {
    const key = id + '.' + prop;
    if (this.cache[key] === v) return;
    this.cache[key] = v; this.$(id).style[prop] = v;
  }

  update(dt, game) {
    const m = this.m; if (!m) return;
    const p = m.player, r = m.rounds, now = m.time;
    const g = p.gun;
    // --- верхняя панель ---
    if (m.mode === 'match') {
      const mine = p.squad, side = r.sideOf(mine), other = r.sideOf(1 - mine);
      this.set('hSL', String(r.score[mine])); this.set('hSR', String(r.score[1 - mine]));
      this.$('hL').style.setProperty('--tc', SIDE_COL[side]); this.$('hR').style.setProperty('--tc', SIDE_COL[other]);
      this.alivePips('hAL', mine); this.alivePips('hAR', 1 - mine);
      let tl = r.timeLeft, phase = '', hot = false;
      if (r.phase === 'buy') phase = 'ЗАКУПКА';
      else if (r.phase === 'live') { phase = m.bomb.planted ? 'ЗАРЯД УСТАНОВЛЕН' : 'РАУНД'; if (m.bomb.planted) { tl = m.bomb.timer; hot = true; } }
      else phase = r.phase === 'over' ? 'КОНЕЦ МАТЧА' : 'КОНЕЦ РАУНДА';
      this.set('hTimer', fmtTime(Math.max(0, tl)));
      this.$('hTimer').classList.toggle('hot', hot);
      this.set('hPhase', phase);
      this.set('hRound', `Раунд ${r.round} · ${side === 'atk' ? 'Атака' : 'Защита'}`);
    } else {
      this.set('hPhase', 'СТРЕЛЬБИЩЕ'); this.set('hTimer', '∞'); this.set('hRound', 'Свободная тренировка');
      this.setStyle('hL', 'visibility', 'hidden'); this.setStyle('hR', 'visibility', 'hidden');
    }
    // --- здоровье ---
    this.set('hHpN', String(Math.ceil(p.hp)));
    this.setStyle('hHpB', 'width', p.hp + '%');
    this.setStyle('hArB', 'width', (p.armor / 50 * 100) + '%');
    // --- оружие ---
    if (g) {
      const w = WEAPONS[g.id];
      this.set('hWpn', w.name + (p.reloadEnd > now ? ' · перезарядка' : ''));
      const html = w.type === 'melee' ? '<b>—</b>'
        : `<b class="${g.mag <= Math.ceil(w.mag * 0.25) ? 'low' : ''}">${g.mag}</b><span>/ ${m.mode === 'range' ? '∞' : g.reserve}</span>`;
      this.set('hAmmo', html, 'innerHTML');
    }
    this.set('hMoney', '$ ' + p.money);
    // --- способности ---
    const ag = AGENTS[p.agent];
    ag.abilities.forEach((d, i) => {
      const el = this.abEls[i]; if (!el) return;
      let n = '', cd = 0, ready = false;
      if (d.slot === 'ult') { n = `${Math.min(p.ult, d.cost)}/${d.cost}`; ready = p.ult >= d.cost; }
      else { const st = p.abil[d.slot]; n = st.charges + (d.maxCharges > 1 || !d.recharge ? '' : ''); cd = d.cd ? Math.min(1, st.cd / d.cd) : 0; ready = st.charges > 0 && st.cd <= 0; if (d.recharge && st.charges === 0) cd = st.cd / d.cd; }
      el.classList.toggle('ready', ready);
      el.querySelector('.ab-n').textContent = n;
      el.querySelector('.ab-cd').style.height = (cd * 100) + '%';
    });
    // --- прицел ---
    const cfg = settings.data.crosshair;
    const sp = p.alive && g && wdef(p).type !== 'melee' ? currentSpread(m, p) : 0;
    const scoped = p.alive && p.scope > 0 && wdef(p).type === 'sniper';
    const key = JSON.stringify(cfg) + Math.round(sp * 2) + (p.alive ? '1' : '0') + (scoped ? 's' : '');
    if (key !== this.crossKey) {
      this.crossKey = key;
      renderCrosshair(this.$('hCross'), cfg, scoped ? 999 : Math.min(30, sp * 2.4));
      this.$('hCross').style.display = scoped || !p.alive ? 'none' : '';
    }
    this.setStyle('hScope', 'display', scoped ? 'block' : 'none');
    // --- хитмаркер, сообщение ---
    if (this.hitT > 0) { this.hitT -= dt; this.setStyle('hHit', 'opacity', String(Math.max(0, this.hitT / 0.22))); } else this.setStyle('hHit', 'opacity', '0');
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) this.$('hMsg').classList.remove('on'); }
    // --- подсказки и прогресс ---
    let hint = '';
    const useKey = prettyKey(settings.data.keys.use[0]), buyKey = prettyKey(settings.data.keys.buy[0]);
    if (p.alive) {
      if (m.mode === 'match' && m.bomb.canPlant(p)) hint = `Удерживайте [${useKey}] — установить заряд`;
      else if (m.mode === 'match' && m.bomb.canDefuse(p)) hint = `Удерживайте [${useKey}] — обезвредить заряд`;
      else if (m.mode === 'match' && r.phase === 'buy') hint = `[${buyKey}] — закупка`;
      else if (m.mode === 'range') hint = `[${buyKey}] — оружие`;
    }
    this.set('hHint', hint);
    const prog = p.plantProgress > 0 ? p.plantProgress / ECON.plantTime : p.defuseProgress > 0 ? p.defuseProgress / ECON.defuseTime : 0;
    this.$('hProg').style.display = prog > 0 ? 'block' : 'none';
    if (prog > 0) { this.$('hProg').querySelector('.bar > div').style.width = prog * 100 + '%'; this.$('hProg').querySelector('span').textContent = p.plantProgress > 0 ? 'Установка заряда' : 'Обезвреживание'; }
    // --- оверлеи ---
    this.hurtA = Math.max(0, this.hurtA - dt * 1.4);
    this.setStyle('hHurt', 'opacity', String(this.hurtA));
    const blind = p.fx.blindUntil - now;
    this.setStyle('hFlash', 'opacity', blind > 0 ? String(Math.min(1, blind / Math.max(0.3, p.fx.blindMax * 0.5))) : '0');
    let inSmoke = false;
    const cam = game.camera.position;
    for (const s of m.world.smokes) if ((cam.x - s.x) ** 2 + (cam.y - s.y) ** 2 + (cam.z - s.z) ** 2 < s.r * s.r) { inSmoke = true; break; }
    this.setStyle('hSmoke', 'opacity', inSmoke ? '0.93' : '0');
    // --- наблюдение ---
    const spec = m.player.ctrl.spectating;
    this.set('hSpec', !p.alive ? (spec ? `Наблюдение: ${spec.name} · ЛКМ — следующий` : 'Вы погибли') : '');
    this.setStyle('hSpec', 'display', !p.alive ? 'block' : 'none');
    // --- блокировка курсора ---
    const needLock = !game.input.locked && !game.input.free && !m.paused && !m.uiOpen && !m.over;
    this.setStyle('hLock', 'display', needLock ? 'flex' : 'none');
    // --- миникарта ---
    this.mini.draw(m);
    this.set('hZone', p.alive ? m.zoneName(p.body.x, p.body.z) : '');
    // --- FPS ---
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fpsT = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
    this.setStyle('hFps', 'display', settings.data.graphics.showFps ? 'block' : 'none');
    this.set('hFps', this.fpsT + ' FPS');
    // --- таблица игроков ---
    const showScores = game.input.isDown('scores') || m.over;
    this.setStyle('hScores', 'display', showScores ? 'block' : 'none');
    if (showScores) this.renderScores(m);
  }

  alivePips(id, squad) {
    const m = this.m;
    const list = m.actors.filter((a) => a.squad === squad);
    const key = list.map((a) => (a.alive ? 1 : 0)).join('');
    if (this.cache[id] === key) return;
    this.cache[id] = key;
    this.$(id).innerHTML = list.map((a) => `<i class="${a.alive ? 'on' : ''}"></i>`).join('');
  }

  renderScores(m) {
    if (m.time - (this.scoreT || 0) < 0.25) return;
    this.scoreT = m.time;
    const p = m.player;
    const rows = (squad) => m.actors.filter((a) => a.squad === squad).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths).map((a) => {
      const side = a.side;
      return `<tr class="${a.isPlayer ? 'me' : ''} ${a.alive ? '' : 'dead'}"><td><span class="sw" style="background:${SIDE_COL[side]}"></span>${a.name}</td><td>${AGENTS[a.agent].name}</td><td>${a.kills}</td><td>${a.deaths}</td><td>${a.assists}</td><td>${Math.round(a.damageDealt)}</td><td>$${a.money}</td></tr>`;
    }).join('');
    const head = '<tr><th>Игрок</th><th>Агент</th><th>У</th><th>С</th><th>П</th><th>Урон</th><th>Деньги</th></tr>';
    const r = m.rounds;
    this.$('hScores').innerHTML = `<div class="sc-title">Таблица игроков</div>
      <div class="sc-score">${m.mode === 'match' ? `${r.score[p.squad]} : ${r.score[1 - p.squad]}` : ''}</div>
      <table>${head}${rows(p.squad)}</table><table class="enemy">${head}${rows(1 - p.squad)}</table>`;
  }
}

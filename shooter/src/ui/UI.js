import { Hud } from './Hud.js';
import { Shop } from './Shop.js';
import { MenuBg } from './MenuBg.js';
import { buildArsenal } from './Arsenal.js';
import { buildSettings } from './SettingsUI.js';
import { MAPS } from '../data/maps/index.js';
import AGENTS from '../data/agents.json';
import { expandMap } from '../world/MapData.js';
import { Minimap } from '../world/Minimap.js';
import { settings } from '../core/Settings.js';
import { DIFFS } from '../bots/BotBrain.js';
import { ECON } from '../weapons/Weapons.js';
import { Touch } from './Touch.js';
import { IS_TOUCH } from '../core/Settings.js';

// Менеджер интерфейса: экраны меню, переходы, HUD, закупка, пауза, итоги.
export class UI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui');
    this.root.innerHTML = `<div id="menuBg"><canvas></canvas></div><div id="screens"></div>`;
    this.bg = new MenuBg(this.root.querySelector('canvas'));
    this.screensEl = this.root.querySelector('#screens');
    this.hud = new Hud(this.root);
    this.shop = new Shop(this.root); this.shop.game = game;
    if (IS_TOUCH) { this.root.classList.add('touch'); document.documentElement.classList.add('touch'); this.touch = new Touch(game, this.root); }
    this.cfg = { ...settings.data.last, mode: 'match' };
    this.screens = {};
    this.cur = null; this.back = [];
    this.buildScreens();
    this.buildOverlays();
    // звуки интерфейса на кнопках
    this.root.addEventListener('mouseover', (e) => { if (e.target.closest('.btn,.card,.acard,.witem,.item,.seg button,.tabs button')) game.audio.uiSnd('hover'); });
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('button,.card,.acard,.witem'); if (!b) return;
      game.audio.ensure(); game.audio.uiSnd(b.hasAttribute('data-back') ? 'back' : 'click');
      if (!game.match) game.audio.ambient(true);
    });
    addEventListener('keydown', (e) => this.onKey(e));
    this.showMenu();
  }

  // ---------- экраны ----------
  mk(id, html) {
    const el = document.createElement('div'); el.className = 'screen'; el.id = 's-' + id; el.innerHTML = html;
    this.screensEl.appendChild(el); this.screens[id] = el; return el;
  }
  go(id, push = true) {
    if (this.cur && push) this.back.push(this.cur);
    this.setScreen(id);
  }
  goBack() { const id = this.back.pop(); this.setScreen(id || 'main'); }
  setScreen(id) {
    for (const [k, el] of Object.entries(this.screens)) el.classList.toggle('active', k === id);
    this.cur = id;
  }

  buildScreens() {
    const game = this.game;
    // --- главное меню ---
    const main = this.mk('main', `
      <div class="brand"><div class="logo-prism"></div><h1>PRISM<br><b>NOIR</b></h1><p>Тактический шутер 5 на 5</p></div>
      <nav class="menu">
        <button class="btn primary" data-go="play">Играть</button>
        <button class="btn" data-go="range">Стрельбище</button>
        <button class="btn" data-go="arsenal">Арсенал</button>
        <button class="btn" data-go="agents">Агенты</button>
        <button class="btn" data-go="settings">Настройки</button>
      </nav>
      <div class="foot">Прототип · один игрок + 4 бота против 5 ботов · 13 раундов до победы</div>`);
    // --- настройка матча ---
    const play = this.mk('play', `<h2>Играть</h2><h3>Параметры матча</h3>
      <div class="label">Карта</div><div class="cards" id="mapCards"></div>
      <div class="label">Сложность ботов</div><div class="seg" id="diffSeg"></div>
      <div class="label">Сторона</div><div class="seg" id="sideSeg"></div>
      <div class="row" style="margin-top:28px"><button class="btn ghost" data-back>← Назад</button><button class="btn primary" id="toAgents">Выбор агента →</button></div>`);
    const mc = play.querySelector('#mapCards');
    for (const def of Object.values(MAPS)) {
      const card = document.createElement('div'); card.className = 'card'; card.dataset.map = def.id;
      const cv = document.createElement('canvas'); cv.width = cv.height = 280;
      const exp = expandMap(def);
      card.appendChild(cv);
      card.insertAdjacentHTML('beforeend', `<b>${def.name}</b><span>${def.desc || ''}</span>`);
      mc.appendChild(card);
      const mm = new Minimap(cv, exp); cv.getContext('2d').drawImage(mm.layer, 0, 0);
    }
    mc.addEventListener('click', (e) => { const c = e.target.closest('.card'); if (c) { this.cfg.map = c.dataset.map; this.syncPlay(); } });
    const seg = (id, items, key) => {
      const el = play.querySelector(id);
      el.innerHTML = items.map(([v, t]) => `<button data-v="${v}">${t}</button>`).join('');
      el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { this.cfg[key] = key === 'diff' ? +b.dataset.v : b.dataset.v; this.syncPlay(); } });
    };
    seg('#diffSeg', DIFFS.map((d, i) => [i, d.name]), 'diff');
    seg('#sideSeg', [['random', 'Случайно'], ['atk', 'Атака'], ['def', 'Защита']], 'side');
    play.querySelector('#toAgents').onclick = () => { this.cfg.mode = 'match'; this.openAgents(true); };

    // --- стрельбище ---
    this.mk('range', `<h2>Стрельбище</h2><h3>Тренировка</h3>
      <p style="max-width:640px;color:#b9c3d6;line-height:1.6">Неподвижные и движущиеся мишени, а также «бот-цели», которые стреляют в ответ (лёгкий уровень).
      Деньги и патроны бесконечны — нажмите <b>B</b>, чтобы взять любое оружие и способности. Способности и ультимейт доступны сразу.</p>
      <div class="row" style="margin-top:26px"><button class="btn ghost" data-back>← Назад</button><button class="btn primary" id="rangeGo">Выбор агента →</button></div>`)
      .querySelector('#rangeGo').onclick = () => { this.cfg.mode = 'range'; this.openAgents(true); };

    // --- выбор агента ---
    this.mk('agent', `<h2 id="agTitle">Агенты</h2><h3 id="agSub">Выберите агента</h3>
      <div class="agents"><div class="alist" id="aList"></div><div class="adet" id="aDet"></div></div>
      <div class="row" style="margin-top:14px"><button class="btn ghost" data-back>← Назад</button><button class="btn primary" id="agGo">В бой!</button></div>`);
    const al = this.screens.agent.querySelector('#aList');
    al.innerHTML = Object.values(AGENTS).map((a) => `<div class="acard" data-id="${a.id}" style="--ac:${a.color}"><div class="emblem">${a.name[0]}</div><div><b>${a.name}</b><span>${a.role}</span></div></div>`).join('');
    al.addEventListener('click', (e) => { const c = e.target.closest('.acard'); if (c) { this.cfg.agent = c.dataset.id; this.syncAgents(); } });
    this.screens.agent.querySelector('#agGo').onclick = () => this.launch();

    // --- арсенал и настройки ---
    buildArsenal(this.mk('arsenal', ''));
    buildSettings(this.mk('settings', ''), game);

    // навигация по data-атрибутам
    this.screensEl.addEventListener('click', (e) => {
      const g = e.target.closest('[data-go]'); if (g) { this.navigate(g.dataset.go); return; }
      if (e.target.closest('[data-back]')) this.goBack();
    });
  }

  navigate(id) {
    if (id === 'agents') { this.openAgents(false); return; }
    if (id === 'play') this.syncPlay();
    this.go(id);
  }
  syncPlay() {
    const el = this.screens.play;
    el.querySelectorAll('.card').forEach((c) => c.classList.toggle('sel', c.dataset.map === this.cfg.map));
    el.querySelectorAll('#diffSeg button').forEach((b) => b.classList.toggle('on', +b.dataset.v === this.cfg.diff));
    el.querySelectorAll('#sideSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === this.cfg.side));
  }
  openAgents(forMatch) {
    this.agentsForMatch = forMatch;
    const s = this.screens.agent;
    s.querySelector('#agGo').style.display = forMatch ? '' : 'none';
    s.querySelector('#agTitle').textContent = forMatch ? 'Подготовка' : 'Агенты';
    this.syncAgents(); this.go('agent');
  }
  syncAgents() {
    const s = this.screens.agent, a = AGENTS[this.cfg.agent] || Object.values(AGENTS)[0];
    this.cfg.agent = a.id;
    s.querySelectorAll('.acard').forEach((c) => c.classList.toggle('sel', c.dataset.id === a.id));
    const det = s.querySelector('#aDet');
    det.style.setProperty('--ac', a.color);
    det.innerHTML = `<h4>${a.name}</h4><div class="role">${a.role}</div><p style="color:#b9c3d6;margin-bottom:12px">${a.desc}</p>` + a.abilities.map((d) => {
      const meta = d.slot === 'ult' ? `ультимейт · ${d.cost} очков` : d.recharge ? `бесплатно · перезарядка ${d.cd} с` : `$${d.cost} · макс. зарядов: ${d.maxCharges} · пауза ${d.cd} с`;
      return `<div class="abl"><div class="k">${d.key}</div><div><b>${d.name}</b><small>${meta}</small><p>${d.desc}</p></div></div>`;
    }).join('');
    det.style.animation = 'none'; void det.offsetWidth; det.style.animation = '';
  }

  // на телефоне уходим в полный экран и горизонтальную ориентацию (если окно это разрешает)
  goFullscreen() {
    if (!IS_TOUCH) return;
    try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch { /* не разрешено */ }
    try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch { /* не разрешено */ }
  }

  launch() {
    this.goFullscreen();
    settings.data.last = { map: this.cfg.map, diff: this.cfg.diff, agent: this.cfg.agent, side: this.cfg.side };
    settings.save();
    const fade = this.fade; fade.classList.add('on');
    setTimeout(() => {
      try {
        this.game.startMatch({ mode: this.cfg.mode, map: this.cfg.map, diff: this.cfg.diff, agent: this.cfg.agent, side: this.cfg.side });
      } catch (err) {
        console.error(err);                       // ошибка запуска не должна оставлять чёрный экран
        this.game.endMatch(true); this.showMenu();
      } finally {
        setTimeout(() => fade.classList.remove('on'), 150);
      }
    }, 420);
  }

  // ---------- оверлеи: пауза, итоги, затемнение ----------
  buildOverlays() {
    const game = this.game;
    this.fade = document.createElement('div'); this.fade.id = 'fade'; this.root.appendChild(this.fade);
    this.pauseEl = document.createElement('div'); this.pauseEl.className = 'overlay';
    this.pauseEl.innerHTML = `<div class="modal"><h3>ПАУЗА</h3><button class="btn primary" data-act="resume">Продолжить</button><button class="btn" data-act="settings">Настройки</button><button class="btn" data-act="leave">Выйти в меню</button></div>`;
    this.resEl = document.createElement('div'); this.resEl.className = 'overlay';
    this.root.append(this.pauseEl, this.resEl);
    this.pauseEl.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'resume') game.resume();
      else if (a === 'settings') { this.settingsFromPause = true; this.screens.settings.classList.add('active'); this.pauseEl.classList.remove('active'); }
      else if (a === 'leave') { this.pauseEl.classList.remove('active'); game.endMatch(); }
    });
    this.resEl.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'menu') { this.resEl.classList.remove('active'); game.endMatch(); }
      else if (a === 'again') { this.resEl.classList.remove('active'); const c = this.lastCfg; game.endMatch(true); this.launchWith(c); }
    });
    // «назад» в настройках из паузы
    this.screens.settings.addEventListener('click', (e) => {
      if (e.target.closest('[data-back]') && this.settingsFromPause) { e.stopPropagation(); this.settingsFromPause = false; this.screens.settings.classList.remove('active'); this.pauseEl.classList.add('active'); }
    }, true);
  }
  launchWith(c) { this.cfg = { ...this.cfg, ...c }; this.launch(); }

  showPause(on) {
    this.pauseEl.classList.toggle('active', on);
    if (!on) this.screens.settings.classList.remove('active');
  }

  showMenu() {
    this.hud.detach(); this.shop.close(true);
    this.root.querySelector('#menuBg').style.display = '';
    this.bg.start(); this.back = [];
    this.syncPlay(); this.syncAgents();
    this.setScreen('main');
  }
  hideMenu() {
    for (const el of Object.values(this.screens)) el.classList.remove('active');
    this.root.querySelector('#menuBg').style.display = 'none'; this.bg.stop();
  }

  onMatchStart(m) {
    this.lastCfg = { ...this.cfg };
    this.hideMenu(); this.pauseEl.classList.remove('active'); this.resEl.classList.remove('active');
    this.hud.attach(m); this.shop.attach(m);
    m.on('toggleShop', () => this.shop.toggle());
    m.on('matchEnd', (winner) => this.showResults(m, winner));
    this.game.audio.ambient(false);
  }
  onMatchEnd() { this.showMenu(); this.game.audio.ambient(true); }

  showResults(m, winner) {
    this.game.input.unlock(); this.game.input.enabled = false;
    const p = m.player, r = m.rounds, win = winner === p.squad;
    const rows = (squad) => m.actors.filter((a) => a.squad === squad).sort((a, b) => b.kills - a.kills).map((a) => `<tr class="${a.isPlayer ? 'me' : ''}"><td>${a.name}</td><td>${AGENTS[a.agent].name}</td><td>${a.kills}</td><td>${a.deaths}</td><td>${a.assists}</td><td>${Math.round(a.damageDealt)}</td></tr>`).join('');
    const head = '<tr><th>Игрок</th><th>Агент</th><th>Убийства</th><th>Смерти</th><th>Ассисты</th><th>Урон</th></tr>';
    this.resEl.innerHTML = `<div class="results"><h3 class="${win ? 'win' : 'lose'}">${win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}</h3>
      <div class="big">${r.score[p.squad]} : ${r.score[1 - p.squad]}</div>
      <table>${head}${rows(p.squad)}</table><table>${head}${rows(1 - p.squad)}</table>
      <div class="row" style="justify-content:center"><button class="btn primary" data-act="again">Реванш</button><button class="btn" data-act="menu">В меню</button></div></div>`;
    this.resEl.classList.add('active');
  }

  onKey(e) {
    const m = this.game.match;
    if (e.code === 'Escape') {
      if (m && this.shop.isOpen) { this.shop.close(); e.preventDefault(); }
      return;
    }
    if (m && this.shop.isOpen && settings.data.keys.buy.includes(e.code)) { this.shop.close(); e.preventDefault(); }
  }

  update(dt) {
    const m = this.game.match;
    this.touch?.update(m);
    if (m) { this.hud.update(dt, this.game); this.shop.update(); }
    else this.bg.draw(dt);
  }
}

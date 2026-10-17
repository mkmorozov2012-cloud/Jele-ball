import { settings } from '../core/Settings.js';
import AGENTS from '../data/agents.json';

// Сенсорное управление для телефона: джойстик слева, зона обзора справа, кнопки действий.
// Касания превращаются в те же «клавиши» и «кнопки мыши», что читает Input, поэтому
// остальной игре всё равно, чем играют — клавиатурой или пальцами.
const BTN = [
  // id, подпись, класс, тип: hold | tap | toggle
  ['fire', 'Огонь', 'fire', 'hold'], ['aim', 'Прицел', 'aim', 'hold'], ['jump', 'Прыжок', 'jump', 'hold'], ['crouch', 'Присед', 'crouch', 'toggle'],
  ['reload', 'Перезаряд', 'reload', 'tap'], ['use', 'Заряд', 'use', 'hold'],
  ['ab1', '1', 'ab', 'tap'], ['ab2', '2', 'ab', 'tap'], ['ab3', '3', 'ab', 'tap'], ['ult', 'Ульта', 'ab ult', 'tap'],
  ['swap', 'Оружие', 'sm swap', 'tap'], ['buy', 'Закупка', 'sm', 'tap'], ['emote', 'Танец', 'sm', 'tap'], ['scores', 'Таблица', 'sm', 'hold'], ['pause', 'Пауза', 'sm', 'tap'],
];

export class Touch {
  constructor(game, root) {
    this.game = game; this.input = game.input;
    this.el = document.createElement('div'); this.el.id = 'touch'; this.el.style.display = 'none';
    this.el.innerHTML = '<div class="tz look"></div><div class="tz stick"><i class="tbase"></i><i class="tknob"></i></div>';
    root.appendChild(this.el);
    this.look = this.el.querySelector('.look'); this.stick = this.el.querySelector('.stick');
    this.base = this.el.querySelector('.tbase'); this.knob = this.el.querySelector('.tknob');
    this.btns = {};
    for (const [id, label, cls, type] of BTN) {
      const b = document.createElement('button'); b.className = 'tb ' + cls; b.dataset.id = id;
      b.innerHTML = `<span>${label}</span><em class="n"></em><u class="cd"></u>`;
      this.el.appendChild(b); this.btns[id] = { el: b, type, on: false };
      this.bindButton(id, b, type);
    }
    this.bindStick(); this.bindLook();
    this.keys = new Set(); this.crouch = false;
    const rot = document.createElement('div'); rot.id = 'rotate'; rot.textContent = 'Поверните телефон горизонтально'; root.appendChild(rot);
    this.moveVec = { x: 0, y: 0 };
  }

  code(action) { return settings.data.keys[action]?.[0]; }
  setKey(action, on) {
    const c = this.code(action); if (!c) return;
    if (on) { if (!this.input.down.has(c)) this.input.edge.add(c); this.input.down.add(c); } else this.input.down.delete(c);
  }
  tap(action) { const c = this.code(action); if (c) this.input.edge.add(c); }

  bindButton(id, b, type) {
    const st = this.btns[id], inp = this.input, g = this.game;
    const press = (e) => {
      e.preventDefault(); b.setPointerCapture?.(e.pointerId); b.classList.add('down');
      st.pid = e.pointerId; st.lx = e.clientX; st.ly = e.clientY;
      if (id === 'fire') { inp.mouse.add(0); inp.mouseEdge.add(0); }
      else if (id === 'aim') { inp.mouse.add(2); inp.mouseEdge.add(2); }
      else if (id === 'swap') inp.wheel += 1;
      else if (id === 'pause') g.pause();
      else if (id === 'crouch') { this.crouch = !this.crouch; this.setKey('crouch', this.crouch); b.classList.toggle('on', this.crouch); }
      else if (type === 'hold') this.setKey(id, true);
      else this.tap(id);
    };
    const move = (e) => {                                  // палец на кнопке «Огонь» ещё и поворачивает камеру
      if (id !== 'fire' && id !== 'aim') return;
      if (e.pointerId !== st.pid) return;
      this.addLook(e.clientX - st.lx, e.clientY - st.ly); st.lx = e.clientX; st.ly = e.clientY;
    };
    const release = (e) => {
      if (st.pid !== e.pointerId) return; st.pid = null; b.classList.remove('down');
      if (id === 'fire') inp.mouse.delete(0); else if (id === 'aim') inp.mouse.delete(2);
      else if (id !== 'crouch' && type === 'hold') this.setKey(id, false);
    };
    b.addEventListener('pointerdown', press); b.addEventListener('pointermove', move);
    b.addEventListener('pointerup', release); b.addEventListener('pointercancel', release);
  }

  addLook(dx, dy) { const k = 1.7; this.input.dx += dx * k; this.input.dy += dy * k; }

  bindLook() {
    let pid = null, lx = 0, ly = 0;
    const z = this.look;
    z.addEventListener('pointerdown', (e) => { e.preventDefault(); z.setPointerCapture?.(e.pointerId); pid = e.pointerId; lx = e.clientX; ly = e.clientY; });
    z.addEventListener('pointermove', (e) => { if (e.pointerId !== pid) return; this.addLook(e.clientX - lx, e.clientY - ly); lx = e.clientX; ly = e.clientY; });
    const up = (e) => { if (e.pointerId === pid) pid = null; };
    z.addEventListener('pointerup', up); z.addEventListener('pointercancel', up);
  }

  bindStick() {
    let pid = null, ox = 0, oy = 0; const R = 56;
    const z = this.stick;
    const apply = (dx, dy) => {
      const l = Math.hypot(dx, dy) || 1, m = Math.min(l, R);
      const x = dx / l * m, y = dy / l * m;
      this.knob.style.transform = `translate(${x}px,${y}px)`;
      const nx = x / R, ny = y / R, mag = Math.hypot(nx, ny);
      this.setKey('forward', ny < -0.3 && mag > 0.25); this.setKey('back', ny > 0.3 && mag > 0.25);
      this.setKey('left', nx < -0.3 && mag > 0.25); this.setKey('right', nx > 0.3 && mag > 0.25);
      this.setKey('walk', mag > 0.25 && mag < 0.55);               // лёгкий наклон — тихий шаг
    };
    z.addEventListener('pointerdown', (e) => {
      e.preventDefault(); z.setPointerCapture?.(e.pointerId); pid = e.pointerId; ox = e.clientX; oy = e.clientY;
      const r = z.getBoundingClientRect();
      for (const el of [this.base, this.knob]) { el.style.left = ox - r.left + 'px'; el.style.top = oy - r.top + 'px'; el.style.opacity = 1; }
      this.knob.style.transform = 'translate(0,0)';
    });
    z.addEventListener('pointermove', (e) => { if (e.pointerId === pid) apply(e.clientX - ox, e.clientY - oy); });
    const up = (e) => {
      if (e.pointerId !== pid) return; pid = null;
      for (const a of ['forward', 'back', 'left', 'right', 'walk']) this.setKey(a, false);
      this.base.style.opacity = 0.35; this.knob.style.opacity = 0.35; this.knob.style.transform = 'translate(0,0)';
      const r = z.getBoundingClientRect(); this.base.style.left = this.knob.style.left = '90px'; this.base.style.top = this.knob.style.top = r.height - 90 + 'px';
    };
    z.addEventListener('pointerup', up); z.addEventListener('pointercancel', up);
    requestAnimationFrame(() => up({ pointerId: null }) || null);
    pid = null; this.base.style.left = this.knob.style.left = '90px'; this.base.style.opacity = this.knob.style.opacity = 0.35;
  }

  // Видимость и состояние кнопок способностей (заряды, перезарядка)
  update(m) {
    const show = !!m && !m.paused && !m.uiOpen && !m.over;
    this.el.style.display = show ? '' : 'none';
    if (!show) return;
    const p = m.player, ag = AGENTS[p.agent];
    if (this.agent !== p.agent) {                              // подписи кнопок способностей — названия способностей
      this.agent = p.agent;
      for (const d of ag.abilities) { const sp = this.btns[d.slot].el.querySelector('span'); sp.textContent = d.name; sp.style.fontSize = d.name.length > 9 ? '9px' : ''; }
    }
    for (const d of ag.abilities) {
      const b = this.btns[d.slot]; if (!b) continue;
      const n = b.el.querySelector('.n'), cd = b.el.querySelector('.cd');
      let ready, pct = 0;
      if (d.slot === 'ult') { n.textContent = `${Math.min(p.ult, d.cost)}/${d.cost}`; ready = p.ult >= d.cost; }
      else { const st = p.abil[d.slot]; n.textContent = st.charges; ready = st.charges > 0 && st.cd <= 0; pct = d.cd ? Math.min(1, st.cd / d.cd) : 0; }
      b.el.classList.toggle('ready', ready); cd.style.height = pct * 100 + '%';
    }
    const planting = m.bomb.canPlant(p) || m.bomb.canDefuse(p);
    this.btns.use.el.classList.toggle('hl', planting);
    this.btns.use.el.querySelector('span').textContent = m.bomb.canDefuse(p) ? 'Разряд' : 'Заряд';
    this.btns.buy.el.style.display = (m.mode === 'range' || m.rounds.phase === 'buy') ? '' : 'none';
    this.btns.fire.el.querySelector('span').textContent = p.alive ? 'Огонь' : 'Дальше';
  }
}

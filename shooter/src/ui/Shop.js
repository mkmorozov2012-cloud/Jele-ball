import { WEAPONS, ECON, TYPE_NAMES, TYPE_ORDER } from '../weapons/Weapons.js';
import AGENTS from '../data/agents.json';
import { fmtTime } from '../core/Util.js';
import { IS_TOUCH } from '../core/Settings.js';

// Меню закупки: оружие по категориям, щиты, способности агента.
export class Shop {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.id = 'shop'; this.el.className = 'overlay';
    this.el.innerHTML = `<div class="shop"><div class="shop-top"><h3>ЗАКУПКА</h3><span id="shopMoney"></span><span id="shopTime"></span><span class="spacer"></span><button class="btn sm ${IS_TOUCH ? 'x' : ''}" id="shopClose">${IS_TOUCH ? '✕' : 'Закрыть [B]'}</button></div><div class="shop-body" id="shopBody"></div></div>`;
    root.appendChild(this.el);
    this.body = this.el.querySelector('#shopBody');
    this.el.querySelector('#shopClose').onclick = () => this.close();
    this.body.addEventListener('click', (e) => {
      const it = e.target.closest('.item'); if (!it || !this.m) return;
      const err = this.m.buy(this.m.player, it.dataset.id);
      if (err) this.m.audio.uiSnd('error'); this.render();
    });
    this.open_ = false;
  }
  attach(m) { this.m = m; this.close(true); this.sig = ''; }
  get isOpen() { return this.open_; }
  open() {
    const m = this.m; if (!m) return;
    if (m.mode === 'match' && m.rounds.phase !== 'buy') return;
    this.open_ = true; m.uiOpen = 'shop';
    this.game.input.enabled = false; this.game.input.unlock(); this.game.input.clear();
    this.el.classList.add('active'); this.render();
  }
  close(silent) {
    if (!this.open_ && !silent) return;
    this.open_ = false; this.el.classList.remove('active');
    if (this.m) this.m.uiOpen = null;
    if (!silent && this.m && !this.m.paused) { this.game.input.enabled = true; this.game.input.clear(); if (!this.game.input.touchMode) this.game.input.lock(); }
  }
  toggle() { this.open_ ? this.close() : this.open(); }

  render() {
    const m = this.m, p = m.player, free = m.mode === 'range';
    this.el.querySelector('#shopMoney').textContent = free ? '$ ∞' : '$ ' + p.money;
    const afford = (price) => free || p.money >= price;
    const wItem = (w) => {
      const own = (p.guns[w.type === 'pistol' ? 'secondary' : 'primary'] || {}).id === w.id;
      const dmg = w.pellets > 1 ? `${w.dmg}×${w.pellets}` : w.dmg;
      return `<div class="item ${own ? 'own' : ''} ${!own && !afford(w.price) ? 'off' : ''}" data-id="${w.id}"><b>${w.name}</b><span class="pr">${w.price ? '$' + w.price : 'бесплатно'}</span><small>урон ${dmg} · ${w.rpm} в/мин · магазин ${w.mag} · ${w.auto ? 'авто' : w.burst ? 'очередь' : 'одиночный'}</small></div>`;
    };
    const sec = (t, items) => `<div class="sec"><h5>${t}</h5>${items}</div>`;
    const byType = (t) => Object.values(WEAPONS).filter((w) => w.type === t).sort((a, b) => a.price - b.price).map(wItem).join('');
    const ag = AGENTS[p.agent];
    const sh = Object.entries(ECON.shields).map(([id, s]) => `<div class="item ${p.armor >= s.value ? 'own' : ''} ${p.armor < s.value && !afford(s.price) ? 'off' : ''}" data-id="${id}"><b>${s.name}</b><span class="pr">$${s.price}</span><small>+${s.value} щита</small></div>`).join('');
    const ab = ag.abilities.filter((d) => d.slot === 'ab1' || d.slot === 'ab2').map((d) => {
      const st = p.abil[d.slot];
      return `<div class="item ${st.charges >= d.maxCharges ? 'own' : ''} ${st.charges < d.maxCharges && !afford(d.cost) ? 'off' : ''}" data-id="${d.slot}"><b>${IS_TOUCH ? '' : `[${d.key}] `}${d.name}</b><span class="pr">$${d.cost}</span><small>заряды ${st.charges}/${d.maxCharges} · ${d.desc}</small></div>`;
    }).join('');
    this.body.innerHTML = [...TYPE_ORDER.map((t) => sec(TYPE_NAMES[t], byType(t))), sec('Щиты', sh), sec('Способности: ' + ag.name, ab)].join('');
  }
  update() {
    if (!this.open_) return;
    const m = this.m;
    if (m.mode === 'match' && m.rounds.phase !== 'buy') { this.close(); return; }
    this.el.querySelector('#shopTime').textContent = m.mode === 'match' ? `до начала раунда: ${fmtTime(m.rounds.timeLeft)}` : 'тренировка: всё бесплатно';
  }
}

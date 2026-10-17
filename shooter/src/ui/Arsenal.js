import { WEAPONS, TYPE_NAMES, TYPE_ORDER } from '../weapons/Weapons.js';

const TABS = ['melee', ...TYPE_ORDER];

// Экран «Арсенал»: список оружия слева, характеристики и рисунок паттерна отдачи справа.
export function buildArsenal(el) {
  el.innerHTML = `<h2>Арсенал</h2><h3>Оружие</h3>
    <div class="wtabs" id="wTabs"></div>
    <div class="arsenal"><div class="wlist" id="wList"></div><div class="wdet" id="wDet"></div></div>
    <div class="row" style="margin-top:14px"><button class="btn ghost" data-back>← Назад</button></div>`;
  let tab = 'rifle', sel = 'cliff';
  const tabs = el.querySelector('#wTabs'), list = el.querySelector('#wList'), det = el.querySelector('#wDet');

  const render = () => {
    tabs.innerHTML = TABS.map((t) => `<button class="${t === tab ? 'on' : ''}" data-t="${t}">${TYPE_NAMES[t]}</button>`).join('');
    const ws = Object.values(WEAPONS).filter((w) => w.type === tab);
    if (!ws.find((w) => w.id === sel)) sel = ws[0].id;
    list.innerHTML = ws.map((w) => `<div class="witem ${w.id === sel ? 'sel' : ''}" data-id="${w.id}"><span>${w.name}</span><em>${w.price ? '$' + w.price : 'бесплатно'}</em></div>`).join('');
    const w = WEAPONS[sel];
    const bar = (label, v, max, text) => `<div class="stat"><span>${label}</span><div class="bar"><div style="width:${Math.min(100, v / max * 100)}%"></div></div><span>${text}</span></div>`;
    let stats;
    if (w.type === 'melee') {
      stats = bar('Удар (ЛКМ)', w.dmg, 150, w.dmg) + bar('Тяжёлый (ПКМ)', w.heavy, 150, w.heavy) + bar('Дальность', w.range, 4, w.range + ' м') + bar('Скорость бега', w.speed * 100, 120, '×' + w.speed);
    } else {
      const pel = w.pellets > 1 ? ` ×${w.pellets}` : '';
      stats = bar('Урон (тело)', w.dmg * Math.min(w.pellets, 4) * (w.pellets > 1 ? 1 : 1), 150, w.dmg + pel)
        + bar('Урон (голова)', w.dmg * w.head, 300, Math.round(w.dmg * w.head) + pel)
        + bar('Урон (ноги)', w.dmg * w.leg, 150, Math.round(w.dmg * w.leg) + pel)
        + bar('Скорострельность', w.rpm, 1000, w.rpm + ' в/мин')
        + bar('Магазин', w.mag, 150, `${w.mag} / ${w.reserve}`)
        + bar('Перезарядка', 6 - w.reload, 6, w.reload + ' с')
        + bar('Разброс стоя', 6 - w.spread.base * 3, 6, w.spread.base + '°')
        + bar('Разброс в беге', 12 - w.spread.move, 12, w.spread.move + '°')
        + bar('Скорость бега', w.speed * 100, 120, '×' + w.speed)
        + bar('Падение урона', 100 - (1 - w.falloff[2]) * 100, 100, `${w.falloff[0]}–${w.falloff[1]} м`)
        + bar('Пробитие стен', w.pen, 2, w.pen + ' м')
        + `<div class="stat"><span>Режим</span><span></span><span>${w.burst ? 'очередь ×' + w.burst : w.auto ? 'авто' : 'одиночный'}</span></div>`
        + (w.zoom ? `<div class="stat"><span>Прицел (ПКМ)</span><span></span><span>${w.zoom.map((z) => '×' + z).join(' / ')}</span></div>` : '');
    }
    det.innerHTML = `<h4>${w.name}<small>${TYPE_NAMES[w.type]} · ${w.price ? '$' + w.price : 'бесплатно'}</small></h4><div class="desc">${w.desc}</div>
      <div>${stats}</div>${w.recoil ? '<div><canvas class="recoil" width="260" height="260"></canvas><div class="rc-cap">ПАТТЕРН ОТДАЧИ: путь прицела за очередь. Выучите его и тяните мышь против отдачи.</div></div>' : ''}`;
    if (w.recoil) drawRecoil(det.querySelector('canvas'), w);
  };
  tabs.addEventListener('click', (e) => { const t = e.target.closest('[data-t]'); if (t) { tab = t.dataset.t; render(); } });
  list.addEventListener('click', (e) => { const t = e.target.closest('[data-id]'); if (t) { sel = t.dataset.id; render(); } });
  render();
}

// Рисуем траекторию точек: накопленная отдача каждого выстрела
function drawRecoil(c, w) {
  const g = c.getContext('2d');
  g.fillStyle = '#0b0f18'; g.fillRect(0, 0, 260, 260);
  g.strokeStyle = 'rgba(120,150,210,0.2)'; g.beginPath(); g.moveTo(130, 0); g.lineTo(130, 260); g.moveTo(0, 240); g.lineTo(260, 240); g.stroke();
  const n = Math.min(w.recoil.length, 30);
  let x = 0, y = 0; const pts = [];
  for (let i = 0; i < n; i++) { x += w.recoil[i][0]; y += w.recoil[i][1]; pts.push([x, y]); }
  const maxY = Math.max(1, ...pts.map((p) => p[1])), maxX = Math.max(1, ...pts.map((p) => Math.abs(p[0])));
  const sc = Math.min(200 / maxY, 110 / maxX);
  g.strokeStyle = '#ffd23f'; g.lineWidth = 2; g.beginPath();
  pts.forEach(([px, py], i) => { const X = 130 + px * sc, Y = 240 - py * sc; i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
  g.stroke();
  pts.forEach(([px, py], i) => { g.fillStyle = i === 0 ? '#19e0c8' : '#ff7a1a'; g.beginPath(); g.arc(130 + px * sc, 240 - py * sc, 3.5, 0, 7); g.fill(); });
}

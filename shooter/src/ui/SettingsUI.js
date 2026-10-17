import { settings, DEFAULTS } from '../core/Settings.js';
import { ACTIONS, prettyKey } from '../core/Input.js';
import { renderCrosshair } from './Hud.js';

// Экран настроек: управление, прицел (с живым предпросмотром), звук, графика.
export function buildSettings(el, game) {
  el.innerHTML = `<h2>Настройки</h2><h3>Параметры игры</h3>
    <div class="tabs" id="stTabs"></div><div class="panel" id="stPanel"></div>
    <div class="row" style="margin-top:14px"><button class="btn ghost" data-back>← Назад</button><span class="spacer"></span><button class="btn sm ghost" id="stReset">Сбросить всё</button></div>`;
  const tabs = el.querySelector('#stTabs'), panel = el.querySelector('#stPanel');
  const TABS = [['control', 'Управление'], ['cross', 'Прицел'], ['sound', 'Звук'], ['gfx', 'Графика']];
  let tab = 'control';
  const S = settings.data;

  const slider = (label, get, set, min, max, step, fmt = (v) => v) => {
    const row = document.createElement('div'); row.className = 'set';
    row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${get()}"><span class="val">${fmt(get())}</span>`;
    const inp = row.querySelector('input'), val = row.querySelector('.val');
    inp.oninput = () => { set(+inp.value); val.textContent = fmt(+inp.value); settings.save(); };
    return row;
  };
  const select = (label, get, set, opts) => {
    const row = document.createElement('div'); row.className = 'set';
    row.innerHTML = `<span>${label}</span><select>${opts.map(([v, t]) => `<option value="${v}" ${String(v) === String(get()) ? 'selected' : ''}>${t}</option>`).join('')}</select><span></span>`;
    row.querySelector('select').onchange = (e) => { set(e.target.value); settings.save(); };
    return row;
  };

  const render = () => {
    tabs.innerHTML = TABS.map(([id, t]) => `<button class="${id === tab ? 'on' : ''}" data-t="${id}">${t}</button>`).join('');
    panel.innerHTML = '';
    if (tab === 'control') {
      panel.appendChild(slider('Чувствительность мыши', () => S.sens, (v) => { S.sens = v; }, 0.1, 5, 0.05, (v) => (+v).toFixed(2)));
      const lab = document.createElement('div'); lab.className = 'label'; lab.textContent = 'Раскладка клавиш (нажмите кнопку, затем клавишу; Esc — отмена)'; panel.appendChild(lab);
      const grid = document.createElement('div'); grid.className = 'keys';
      for (const [id, name] of ACTIONS) {
        const r = document.createElement('div'); r.className = 'keyrow';
        const b = document.createElement('button'); b.className = 'rebind';
        const text = () => S.keys[id].map(prettyKey).join(' / ');
        b.textContent = text();
        b.onclick = () => {
          b.classList.add('wait'); b.textContent = '…нажмите клавишу';
          game.input.rebinding = (code) => {
            if (code !== 'Escape') { for (const k of Object.keys(S.keys)) if (k !== id) S.keys[k] = S.keys[k].filter((c) => c !== code); S.keys[id] = [code]; settings.save(); }
            render();
          };
        };
        r.innerHTML = `<span>${name}</span>`; r.appendChild(b); grid.appendChild(r);
      }
      panel.appendChild(grid);
    } else if (tab === 'cross') {
      const c = S.crosshair;
      const wrap = document.createElement('div'); wrap.className = 'chwrap';
      const left = document.createElement('div'); left.style.flex = '1'; left.style.minWidth = '420px';
      const prev = document.createElement('div'); prev.className = 'chprev';
      const upd = () => renderCrosshair(prev, c, 0);
      const wrapSlider = (...a) => { const r = slider(...a); const i = r.querySelector('input'); const o = i.oninput; i.oninput = () => { o(); upd(); }; return r; };
      left.appendChild(select('Форма', () => c.shape, (v) => { c.shape = v; upd(); }, [['cross', 'Крест'], ['dot', 'Точка'], ['circle', 'Круг'], ['chevron', 'Галочка']]));
      const col = document.createElement('div'); col.className = 'set'; col.innerHTML = `<span>Цвет</span><input type="color" value="${c.color}"><span></span>`;
      col.querySelector('input').oninput = (e) => { c.color = e.target.value; settings.save(); upd(); }; left.appendChild(col);
      left.appendChild(wrapSlider('Размер', () => c.size, (v) => { c.size = v; }, 2, 20, 1));
      left.appendChild(wrapSlider('Толщина', () => c.thickness, (v) => { c.thickness = v; }, 1, 6, 1));
      left.appendChild(wrapSlider('Зазор', () => c.gap, (v) => { c.gap = v; }, 0, 16, 1));
      left.appendChild(wrapSlider('Прозрачность', () => c.opacity, (v) => { c.opacity = v; }, 0.2, 1, 0.05, (v) => (+v).toFixed(2)));
      const dot = document.createElement('div'); dot.className = 'set'; dot.innerHTML = `<span>Точка в центре</span><input type="checkbox" ${c.dot ? 'checked' : ''}><span></span>`;
      dot.querySelector('input').onchange = (e) => { c.dot = e.target.checked; settings.save(); upd(); }; left.appendChild(dot);
      wrap.append(left, prev); panel.appendChild(wrap); upd();
    } else if (tab === 'sound') {
      panel.appendChild(slider('Общая громкость', () => S.volume.master, (v) => { S.volume.master = v; }, 0, 1, 0.05, (v) => Math.round(v * 100) + '%'));
      panel.appendChild(slider('Эффекты', () => S.volume.sfx, (v) => { S.volume.sfx = v; }, 0, 1, 0.05, (v) => Math.round(v * 100) + '%'));
      panel.appendChild(slider('Интерфейс и музыка', () => S.volume.ui, (v) => { S.volume.ui = v; }, 0, 1, 0.05, (v) => Math.round(v * 100) + '%'));
    } else {
      const g = S.graphics;
      panel.appendChild(select('Качество', () => g.quality, (v) => { g.quality = v; }, [['low', 'Низкое (без теней)'], ['medium', 'Среднее'], ['high', 'Высокое']]));
      panel.appendChild(select('Лимит FPS', () => g.fpsCap, (v) => { g.fpsCap = +v; }, [[0, 'Без ограничений'], [30, '30'], [60, '60'], [120, '120'], [144, '144']]));
      panel.appendChild(slider('Поле зрения (FOV)', () => g.fov, (v) => { g.fov = v; }, 70, 120, 1, (v) => v + '°'));
      panel.appendChild(slider('Тряска экрана', () => g.shake, (v) => { g.shake = v; }, 0, 1.5, 0.05, (v) => Math.round(v * 100) + '%'));
      const f = document.createElement('div'); f.className = 'set'; f.innerHTML = `<span>Показывать FPS</span><input type="checkbox" ${g.showFps ? 'checked' : ''}><span></span>`;
      f.querySelector('input').onchange = (e) => { g.showFps = e.target.checked; settings.save(); }; panel.appendChild(f);
      const n = document.createElement('div'); n.className = 'label'; n.textContent = 'Качество применяется при следующем запуске матча'; panel.appendChild(n);
    }
  };
  tabs.addEventListener('click', (e) => { const t = e.target.closest('[data-t]'); if (t) { tab = t.dataset.t; render(); } });
  el.querySelector('#stReset').onclick = () => { settings.reset(); render(); };
  settings.on('change', () => {});
  render();
}

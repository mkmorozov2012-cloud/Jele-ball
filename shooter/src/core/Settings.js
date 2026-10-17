import { Emitter } from './Events.js';

// Все настройки игрока. Хранятся в localStorage, при ошибке — просто в памяти.
const KEY = 'prismnoir.settings.v1';

export const DEFAULTS = {
  sens: 1.0,                      // множитель чувствительности мыши
  crosshair: { color: '#19e0c8', size: 7, thickness: 2, gap: 4, shape: 'cross', dot: false, opacity: 1 },
  volume: { master: 0.7, sfx: 1, ui: 0.8 },
  graphics: { quality: 'medium', fpsCap: 0, fov: 100, showFps: true },
  keys: {
    forward: ['KeyW'], back: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    jump: ['Space'], crouch: ['ControlLeft', 'KeyZ'], walk: ['ShiftLeft'],
    reload: ['KeyR'], use: ['KeyF'],
    ab1: ['KeyC'], ab2: ['KeyQ'], ab3: ['KeyE'], ult: ['KeyX'],
    slot1: ['Digit1'], slot2: ['Digit2'], slot3: ['Digit3'],
    buy: ['KeyB'], scores: ['Tab'],
  },
  last: { map: 'quarry', diff: 1, agent: 'lumen', side: 'random' },
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
// Глубокая копия значений по умолчанию + поверх — то, что сохранил игрок
const merge = (base, over) => {
  const out = JSON.parse(JSON.stringify(base));
  if (!isObj(over)) return out;
  for (const k of Object.keys(base)) if (k in over) out[k] = isObj(base[k]) ? merge(base[k], over[k]) : over[k];
  return out;
};

class SettingsStore extends Emitter {
  constructor() {
    super();
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch { /* нет доступа — игнорируем */ }
    this.data = merge(DEFAULTS, saved);
  }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
    this.emit('change', this.data);
  }
  reset() { Object.assign(this.data, merge(DEFAULTS, null)); this.save(); }
}
export const settings = new SettingsStore();

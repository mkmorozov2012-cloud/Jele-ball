import { settings } from './Settings.js';

// Список действий для окна раскладки клавиш: [id, подпись]
export const ACTIONS = [
  ['forward', 'Вперёд'], ['back', 'Назад'], ['left', 'Влево'], ['right', 'Вправо'],
  ['jump', 'Прыжок'], ['crouch', 'Присесть'], ['walk', 'Тихий шаг'],
  ['reload', 'Перезарядка'], ['use', 'Заряд / обезвредить'],
  ['ab1', 'Способность 1'], ['ab2', 'Способность 2'], ['ab3', 'Способность 3'], ['ult', 'Ультимейт'],
  ['slot1', 'Основное оружие'], ['slot2', 'Пистолет'], ['slot3', 'Клинок'],
  ['buy', 'Закупка'], ['scores', 'Таблица игроков'], ['emote', 'Танец'],
];

export const prettyKey = (code) => code
  .replace('Key', '').replace('Digit', '').replace('Left', '').replace('Control', 'Ctrl')
  .replace('Space', 'Пробел').replace('Mouse0', 'ЛКМ').replace('Mouse2', 'ПКМ');

// Ввод: клавиатура + мышь. Состояние опрашивается из игрового цикла.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();      // зажатые коды клавиш
    this.edge = new Set();      // нажатые в этом кадре
    this.mouse = new Set();     // зажатые кнопки мыши
    this.mouseEdge = new Set();
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.locked = false;
    this.enabled = false;       // игровой ввод (не в меню)
    this.rebinding = null;      // callback при переназначении клавиши
    this.onLockChange = null;
    this.free = false;          // ввод без Pointer Lock (отладка, телефон, песочница)
    this.touchMode = false;     // игра на телефоне: настоящие события мыши игнорируем

    addEventListener('keydown', (e) => this.key(e, true));
    addEventListener('keyup', (e) => this.key(e, false));
    addEventListener('mousedown', (e) => {
      if (this.rebinding && e.target.closest?.('.rebind')) return;
      if (!this.enabled || this.touchMode) return;
      this.mouse.add(e.button); this.mouseEdge.add(e.button);
    });
    addEventListener('mouseup', (e) => this.mouse.delete(e.button));
    addEventListener('mousemove', (e) => {
      if (!this.enabled || this.touchMode || !(this.locked || this.free)) return;
      this.dx += e.movementX; this.dy += e.movementY;
    });
    addEventListener('wheel', (e) => { if (this.enabled) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('blur', () => { this.down.clear(); this.mouse.clear(); });
    document.addEventListener('pointerlockerror', () => { this.free = true; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.onLockChange?.(this.locked);
    });
  }
  key(e, isDown) {
    if (this.rebinding && isDown) {
      e.preventDefault();
      const cb = this.rebinding; this.rebinding = null; cb(e.code);
      return;
    }
    if (e.code === 'Tab' || (this.enabled && ['Space', 'ControlLeft'].includes(e.code))) e.preventDefault();
    if (isDown) { if (!this.down.has(e.code)) this.edge.add(e.code); this.down.add(e.code); }
    else this.down.delete(e.code);
  }
  // Захват мыши. В песочнице (например, во встроенном окне) он может быть запрещён —
  // тогда играем без захвата: движения мыши читаются, пока курсор над окном.
  lock() {
    if (this.free) return;
    const fallback = () => { this.free = true; };
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      p?.catch?.(() => { try { const q = this.canvas.requestPointerLock(); q?.catch?.(fallback); } catch { fallback(); } });
    } catch {
      try { this.canvas.requestPointerLock(); } catch { fallback(); }
    }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  codes(action) { return settings.data.keys[action] || []; }
  isDown(action) { return this.codes(action).some((c) => this.down.has(c)); }
  pressed(action) { return this.codes(action).some((c) => this.edge.has(c)); }
  get fire() { return this.mouse.has(0); }
  get aim() { return this.mouse.has(2); }
  firePressed() { return this.mouseEdge.has(0); }
  aimPressed() { return this.mouseEdge.has(2); }
  takeMouse() { const r = [this.dx, this.dy]; this.dx = this.dy = 0; return r; }
  takeWheel() { const w = this.wheel; this.wheel = 0; return w; }
  endFrame() { this.edge.clear(); this.mouseEdge.clear(); }
  clear() { this.down.clear(); this.edge.clear(); this.mouse.clear(); this.mouseEdge.clear(); this.dx = this.dy = this.wheel = 0; }
}

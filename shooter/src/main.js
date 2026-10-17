import './style.css';
import { Game } from './core/Game.js';

import { WEAPONS, ECON } from './weapons/Weapons.js';

const game = new Game();
import { stepActor } from './player/Movement.js';
import { maxSpeed } from './weapons/Combat.js';
window.__data = { WEAPONS, ECON, stepActor, maxSpeed };
window.__g = game;   // для отладки из консоли

// Режим отладки: ?dev=1 запускает матч сразу, без меню и Pointer Lock
const q = new URLSearchParams(location.search);
if (q.has('dev')) {
  game.input.free = true;
  game.startMatch({ mode: q.get('mode') || 'match', map: q.get('map') || 'quarry', agent: q.get('agent') || 'lumen', diff: +(q.get('diff') ?? 1), side: q.get('side') || 'atk', auto: q.has('auto') });
  if (q.has('speed')) game.timeScale = +q.get('speed');
}

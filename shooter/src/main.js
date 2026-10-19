import './style.css';
import * as THREE from 'three';
import { Game } from './core/Game.js';

const game = new Game();
window.__g = game;   // для отладки из консоли
window.__THREE = THREE;

// Режим отладки: ?dev=1 запускает матч сразу, без меню и Pointer Lock
const q = new URLSearchParams(location.search);
if (q.has('dev')) {
  game.input.free = true;
  game.startMatch({ mode: q.get('mode') || 'match', map: q.get('map') || 'quarry', agent: q.get('agent') || 'lumen', diff: +(q.get('diff') ?? 1), side: q.get('side') || 'atk', auto: q.has('auto') });
  if (q.has('speed')) game.timeScale = +q.get('speed');
}

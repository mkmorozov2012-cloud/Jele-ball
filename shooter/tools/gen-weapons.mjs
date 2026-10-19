// Одноразовый генератор стартового weapons.json (паттерны отдачи считаются формулой).
// После генерации файл src/data/weapons.json правится руками — это и есть конфиг оружия.
import fs from 'node:fs';
const W = [];
const S = (base, move, air, shot, max, recover, crouch = 0.7) => ({ base, move, air, shot, max, recover, crouch });
function gun(o) {
  const n = o.n ?? 8, kick = o.kick ?? 0.6, sway = o.sway ?? 0.2, ph = o.ph ?? 0;
  const recoil = [];
  for (let i = 0; i < n; i++) {
    const pitch = kick * (i < 3 ? 1.15 : i < 8 ? 0.8 : 0.5);
    const yaw = sway * Math.sin(i * 0.95 + ph) * Math.min(1, i / 5);
    recoil.push([+yaw.toFixed(2), +pitch.toFixed(2)]);
  }
  const { n: _n, kick: _k, sway: _s, ph: _p, ...rest } = o;
  W.push({ pellets: 1, pen: 0.2, penMul: 0.6, speed: 1, ads: 1.15, auto: false, burst: 0, ...rest, recoil });
}
// --- ближний бой ---
W.push({ id: 'blade', name: 'Клинок', type: 'melee', price: 0, kill: 150, speed: 1.12, draw: 0.3, dmg: 40, heavy: 75, rpm: 150, heavyRpm: 55, range: 2.4, desc: 'ЛКМ — быстрый удар, ПКМ — тяжёлый. Самая высокая скорость бега.', model: { len: 0.55, h: 0.05, color: '#9fb4d0', kind: 'blade' } });
// --- пистолеты ---
gun({ id: 'spark', name: 'Искра', type: 'pistol', price: 0, kill: 150, rpm: 360, mag: 12, reserve: 36, reload: 1.6, draw: 0.35, dmg: 26, head: 3, leg: 0.85, falloff: [18, 50, 0.7], spread: S(0.25, 2.4, 4.5, 0.9, 3.2, 7), kick: 0.9, sway: 0.25, n: 5, desc: 'Стартовый пистолет. Точный и надёжный.', model: { len: 0.32, h: 0.13, color: '#5b6577' } });
gun({ id: 'pin', name: 'Булавка', type: 'pistol', price: 200, kill: 150, rpm: 480, mag: 15, reserve: 45, reload: 1.5, draw: 0.3, dmg: 21, head: 3.2, leg: 0.85, falloff: [14, 40, 0.65], spread: S(0.2, 2.0, 4.2, 0.75, 2.8, 8, 0.65), kick: 0.7, sway: 0.2, n: 6, ph: 1, desc: 'Лёгкий и быстрый. Хорош на раннем раунде.', model: { len: 0.3, h: 0.12, color: '#6b7a93' } });
gun({ id: 'swarm', name: 'Рой', type: 'pistol', price: 400, kill: 150, rpm: 840, mag: 20, reserve: 60, reload: 1.8, draw: 0.35, dmg: 15, head: 2.6, leg: 0.85, auto: true, falloff: [10, 30, 0.55], spread: S(0.5, 3.2, 5.5, 0.55, 5.5, 5), kick: 0.5, sway: 0.4, n: 14, ph: 2, desc: 'Автоматический пистолет. Льёт свинец, но быстро теряет точность.', model: { len: 0.34, h: 0.15, color: '#3f6a8a' } });
gun({ id: 'fang', name: 'Клык', type: 'pistol', price: 450, kill: 150, rpm: 300, mag: 8, reserve: 24, reload: 1.9, draw: 0.4, dmg: 38, head: 3.6, leg: 0.85, falloff: [20, 55, 0.75], pen: 0.4, spread: S(0.2, 2.8, 5, 1.6, 3.8, 5), kick: 1.6, sway: 0.3, n: 5, ph: 3, desc: 'Тяжёлый пистолет: две попытки в голову решают исход дуэли.', model: { len: 0.36, h: 0.15, color: '#7a5a3c' } });
gun({ id: 'thunder', name: 'Гром', type: 'pistol', price: 800, kill: 150, rpm: 100, mag: 6, reserve: 18, reload: 2.4, draw: 0.5, dmg: 88, head: 2, leg: 0.85, falloff: [18, 45, 0.75], pen: 0.6, spread: S(0.3, 3.5, 6, 3.2, 5, 3, 0.75), kick: 3.4, sway: 0.5, n: 3, ph: 4, desc: 'Ручная пушка. Попадание в тело — почти фраг, но стреляет медленно.', model: { len: 0.4, h: 0.18, color: '#8a4a4a' } });
// --- пистолеты-пулемёты ---
gun({ id: 'fly', name: 'Муха', type: 'smg', price: 950, kill: 100, rpm: 960, mag: 30, reserve: 90, reload: 2.0, draw: 0.4, dmg: 17, head: 3, leg: 0.9, auto: true, falloff: [10, 28, 0.5], speed: 0.98, spread: S(0.35, 2.4, 5.5, 0.45, 5, 6), kick: 0.42, sway: 0.35, n: 20, ph: 0.3, desc: 'Очень высокая скорострельность. Для быстрых раундов и ближнего боя.', model: { len: 0.5, h: 0.16, color: '#4d5568', mag: true } });
gun({ id: 'wasp', name: 'Оса', type: 'smg', price: 1250, kill: 100, rpm: 820, mag: 35, reserve: 105, reload: 2.1, draw: 0.42, dmg: 20, head: 3.2, leg: 0.9, auto: true, falloff: [12, 34, 0.55], speed: 0.97, spread: S(0.3, 2.2, 5, 0.4, 4.5, 6), kick: 0.46, sway: 0.3, n: 22, ph: 1.2, desc: 'Универсальный ПП: уверенно держит средние дистанции.', model: { len: 0.55, h: 0.17, color: '#5b5f46', mag: true } });
gun({ id: 'bumble', name: 'Шмель', type: 'smg', price: 1600, kill: 100, rpm: 700, mag: 25, reserve: 100, reload: 2.2, draw: 0.45, dmg: 24, head: 3.4, leg: 0.9, auto: true, falloff: [14, 40, 0.6], pen: 0.3, speed: 0.96, spread: S(0.25, 2.0, 4.8, 0.38, 4, 6.5), kick: 0.5, sway: 0.25, n: 18, ph: 2.1, desc: 'Самый точный ПП. Хорош из присяда.', model: { len: 0.58, h: 0.17, color: '#6a5a3a', mag: true } });
// --- дробовики ---
gun({ id: 'boar', name: 'Кабан', type: 'shotgun', price: 850, kill: 150, rpm: 70, mag: 6, reserve: 24, reload: 3.0, draw: 0.55, dmg: 10, head: 2.2, leg: 0.9, pellets: 12, pelletSpread: 4.2, falloff: [4, 15, 0.12], pen: 0.1, speed: 0.92, ads: 1.0, spread: S(0.4, 1.4, 3, 0, 0, 10, 0.8), kick: 3.0, sway: 0.4, n: 3, ph: 0.5, desc: 'Помповый дробовик: в упор убивает с одного выстрела.', model: { len: 0.75, h: 0.16, color: '#6a4c34', stock: true, pump: true } });
gun({ id: 'wall', name: 'Стена', type: 'shotgun', price: 1900, kill: 150, rpm: 220, mag: 7, reserve: 28, reload: 3.3, draw: 0.6, dmg: 7.5, head: 2, leg: 0.9, auto: true, pellets: 9, pelletSpread: 3.6, falloff: [5, 18, 0.15], pen: 0.15, speed: 0.9, ads: 1.0, spread: S(0.4, 1.4, 3, 0, 0, 10, 0.8), kick: 2.0, sway: 0.5, n: 6, ph: 1.7, desc: 'Автоматический дробовик с узким разбросом.', model: { len: 0.8, h: 0.18, color: '#3b4a5c', stock: true } });
// --- штурмовые винтовки ---
gun({ id: 'wind', name: 'Ветер', type: 'rifle', price: 1900, kill: 200, rpm: 600, mag: 30, reserve: 90, reload: 2.5, draw: 0.55, dmg: 33, head: 3.7, leg: 0.85, auto: true, falloff: [25, 70, 0.72], pen: 0.35, speed: 0.93, ads: 1.3, spread: S(0.2, 4.5, 7, 0.38, 3.2, 6), kick: 0.62, sway: 0.4, n: 30, ph: 0.6, desc: 'Недорогая винтовка. Лёгкая отдача, хороший старт.', model: { len: 0.82, h: 0.17, color: '#4a5a4a', stock: true, mag: true } });
gun({ id: 'cheetah', name: 'Гепард', type: 'rifle', price: 2250, kill: 200, rpm: 760, mag: 25, reserve: 75, reload: 2.4, draw: 0.5, dmg: 28, head: 3.6, leg: 0.85, auto: true, falloff: [22, 60, 0.7], pen: 0.3, speed: 0.95, ads: 1.25, spread: S(0.25, 4.2, 7, 0.42, 3.4, 6), kick: 0.58, sway: 0.55, n: 25, ph: 2.4, desc: 'Скорострельная и подвижная. Сильна в движении, слабее на дальних.', model: { len: 0.78, h: 0.16, color: '#8a6a2a', stock: true, mag: true } });
gun({ id: 'cliff', name: 'Утёс', type: 'rifle', price: 2900, kill: 200, rpm: 540, mag: 25, reserve: 75, reload: 2.6, draw: 0.6, dmg: 40, head: 3.9, leg: 0.85, auto: true, falloff: [30, 90, 0.78], pen: 0.5, speed: 0.9, ads: 1.35, spread: S(0.15, 4.8, 7.5, 0.4, 3.0, 5.5), kick: 0.75, sway: 0.45, n: 25, ph: 3.3, desc: 'Основная винтовка. Один выстрел в голову убивает без щита.', model: { len: 0.88, h: 0.18, color: '#3d4c66', stock: true, mag: true } });
gun({ id: 'bulwark', name: 'Таран', type: 'rifle', price: 3200, kill: 200, rpm: 480, mag: 24, reserve: 72, reload: 2.7, draw: 0.62, dmg: 46, head: 3.3, leg: 0.85, burst: 3, falloff: [32, 95, 0.8], pen: 0.6, speed: 0.89, ads: 1.4, spread: S(0.1, 4.8, 7.5, 0.5, 2.4, 6), kick: 0.95, sway: 0.2, n: 9, ph: 0.2, desc: 'Очередь по три патрона. Требует точной стрельбы.', model: { len: 0.9, h: 0.19, color: '#5a3d66', stock: true, mag: true } });
// --- снайперские винтовки ---
gun({ id: 'needle', name: 'Игла', type: 'sniper', price: 1500, kill: 150, rpm: 56, mag: 5, reserve: 15, reload: 3.2, draw: 0.7, dmg: 100, head: 2.0, leg: 0.8, falloff: [60, 140, 0.9], pen: 1.0, penMul: 0.65, speed: 0.88, ads: 2.2, zoom: [2.2], spread: S(0.02, 7, 10, 3, 3, 4, 0.9), unscoped: 3.8, kick: 2.8, sway: 0.2, n: 2, desc: 'Недорогой затворный снайпер. Один зум; пробивает тонкие стены.', model: { len: 1.05, h: 0.16, color: '#3a5a4a', stock: true, scope: true } });
gun({ id: 'horizon', name: 'Горизонт', type: 'sniper', price: 4700, kill: 150, rpm: 42, mag: 5, reserve: 15, reload: 3.6, draw: 0.8, dmg: 150, head: 1.7, leg: 0.85, falloff: [80, 180, 0.95], pen: 1.8, penMul: 0.7, speed: 0.84, ads: 2.5, zoom: [2.5, 5], spread: S(0.02, 8, 12, 3, 3, 4, 0.9), unscoped: 4.5, kick: 3.8, sway: 0.2, n: 2, ph: 1, desc: 'Мощнейший снайпер: убивает в тело с одного выстрела, два уровня зума, пробивает стены.', model: { len: 1.15, h: 0.18, color: '#2f3b52', stock: true, scope: true } });
gun({ id: 'eye', name: 'Око', type: 'sniper', price: 3000, kill: 150, rpm: 150, mag: 10, reserve: 30, reload: 3.0, draw: 0.75, dmg: 72, head: 2.8, leg: 0.8, falloff: [60, 140, 0.9], pen: 1.2, penMul: 0.6, speed: 0.88, ads: 2.2, zoom: [2.2, 4], auto: false, spread: S(0.05, 7, 10, 2.2, 4, 4, 0.9), unscoped: 4.2, kick: 2.0, sway: 0.25, n: 4, ph: 2, desc: 'Самозарядный снайпер: два попадания в тело, быстрая вторая попытка.', model: { len: 1.0, h: 0.17, color: '#6a4a2a', stock: true, scope: true, mag: true } });
// --- пулемёты ---
gun({ id: 'roller', name: 'Каток', type: 'mg', price: 1600, kill: 100, rpm: 780, mag: 100, reserve: 100, reload: 4.6, draw: 0.8, dmg: 30, head: 3.2, leg: 0.85, auto: true, falloff: [22, 65, 0.65], pen: 0.7, speed: 0.82, ads: 1.1, spread: S(0.7, 6, 9, 0.35, 5, 4), kick: 0.7, sway: 0.7, n: 40, ph: 1.4, desc: 'Лёгкий пулемёт: 100 патронов и подавляющий огонь.', model: { len: 0.95, h: 0.2, color: '#4b4b3a', stock: true, mag: true, box: true } });
gun({ id: 'hammer', name: 'Молот', type: 'mg', price: 3200, kill: 100, rpm: 600, mag: 150, reserve: 150, reload: 5.2, draw: 0.9, dmg: 38, head: 3.3, leg: 0.85, auto: true, falloff: [26, 80, 0.7], pen: 1.0, speed: 0.78, ads: 1.1, spread: S(0.6, 6.5, 9.5, 0.4, 5.5, 3.5), kick: 0.85, sway: 0.8, n: 50, ph: 2.6, desc: 'Тяжёлый пулемёт: пробивает укрытия, но очень медленный.', model: { len: 1.0, h: 0.22, color: '#5b3b3b', stock: true, mag: true, box: true } });

const out = {};
for (const w of W) out[w.id] = w;
// компактный вывод: короткие массивы и вложенные объекты spread/model — в одну строку
let txt = JSON.stringify(out, null, 1);
for (let i = 0; i < 3; i++) txt = txt.replace(/\[\s+([^\[\]{}]*?)\s+\]/g, (m, a) => '[' + a.replace(/\s*\n\s*/g, ' ') + ']').replace(/\[\s+(\[[^{}]*?\])\s+\]/g, (m, a) => '[' + a.replace(/\s*\n\s*/g, ' ') + ']');
txt = txt.replace(/\{\s+("base"[^{}]*?|"len"[^{}]*?)\s+\}/g, (m, a) => '{ ' + a.replace(/\s*\n\s*/g, ' ') + ' }');
fs.writeFileSync(new URL('../src/data/weapons.json', import.meta.url), txt);
console.log('оружия:', W.length);

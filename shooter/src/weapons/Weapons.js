import WEAPONS from '../data/weapons.json';
import ECON from '../data/economy.json';

export { WEAPONS, ECON };
export const TYPE_NAMES = { melee: 'Ближний бой', pistol: 'Пистолеты', smg: 'Пистолеты-пулемёты', shotgun: 'Дробовики', rifle: 'Штурмовые винтовки', sniper: 'Снайперские винтовки', mg: 'Пулемёты' };
export const TYPE_ORDER = ['pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'mg'];
// Какой слот занимает оружие: пистолеты — secondary, нож — knife, остальное — primary
export const slotOf = (id) => (WEAPONS[id].type === 'pistol' ? 'secondary' : WEAPONS[id].type === 'melee' ? 'knife' : 'primary');
export const weaponList = () => Object.values(WEAPONS);

// Множитель урона по дистанции: до start — 100%, к end падает до minMul
export function falloff(w, dist) {
  const [a, b, m] = w.falloff || [999, 1000, 1];
  if (dist <= a) return 1;
  return 1 - (1 - m) * Math.min(1, (dist - a) / (b - a));
}

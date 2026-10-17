import { WEAPONS } from '../weapons/Weapons.js';
import { pick } from '../core/Util.js';

// Закупка ботов: по деньгам выбирают оружие, щит и способности.
export function botBuy(m, a) {
  const buy = (item) => m.buy(a, item) === null;
  const hasPrimary = !!a.guns.primary;
  let money = a.money;
  const round = m.rounds.round;
  // экономия: на слабом бюджете иногда пропускаем раунд
  if (round > 1 && !hasPrimary && money < 1700 && Math.random() < 0.45) { if (money >= 500) buy('light'); return; }

  if (!hasPrimary) {
    let w = null;
    if (money >= 5700 && Math.random() < 0.22) w = 'horizon';
    else if (money >= 3900) w = pick(['cliff', 'bulwark', 'cliff', 'cheetah']);
    else if (money >= 2900) w = pick(['wind', 'cheetah', 'eye', 'cliff']);
    else if (money >= 2000) w = pick(['wind', 'bumble', 'wall', 'roller']);
    else if (money >= 1300) w = pick(['wasp', 'bumble', 'boar', 'fly']);
    else if (money >= 950) w = pick(['fly', 'boar', 'needle']);
    if (w && buy(w)) money = a.money;
    else if (!a.guns.secondary || a.guns.secondary.id === 'spark') {
      if (money >= 800 && Math.random() < 0.3) buy('thunder'); else if (money >= 450 && Math.random() < 0.6) buy('fang'); else if (money >= 400) buy('swarm'); else if (money >= 200) buy('pin');
    }
  }
  if (a.armor < 25) {
    if (a.money >= 1000 + 700 && a.armor < 50 && a.money > 2800) buy('heavy');
    else if (a.money >= 400) buy('light');
  }
  // способности: покупаем платные, пока есть деньги с запасом
  for (const slot of ['ab1', 'ab2']) {
    if (a.money > 700 && Math.random() < 0.75) buy(slot);
  }
  if (a.money > 2600) buy('ab1');
  a.slot = a.guns.primary ? 'primary' : 'secondary';
}

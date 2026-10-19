// Проверка карт без браузера: запускается `npm run check-maps`.
// Печатает: узлы внутри стен, несвязные узлы, длины путей и время хода до точек от спавнов.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandMap } from '../src/world/MapData.js';
import { World } from '../src/world/World.js';
import { Nav } from '../src/world/Nav.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/data/maps');
const SPEED = 5.5;
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
  const def = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const exp = expandMap(def);
  const world = new World();
  world.add({ kind: 'floor', x0: -60, z0: -60, y0: -2, w: 120, d: 120, h: 2, nonav: true });
  exp.boxes.forEach((b) => world.add(b));
  const nav = new Nav(exp.nodes, world);
  console.log(`\n=== ${def.name} (${f}) — боксов ${exp.boxes.length}, узлов ${exp.nodes.length}`);
  // узлы в стенах
  for (const n of exp.nodes) {
    const body = { x: n.x, y: n.y + 0.05, z: n.z, r: 0.35, h: 1.8 };
    if (world.anyOverlap(body)) console.log(`  ! узел ${n.id} (${n.x}, ${n.z}) внутри геометрии`);
  }
  // связность
  if (!exp.nodes.length) continue;
  const seen = new Set([0]); const q = [0];
  while (q.length) { const c = q.pop(); for (const [nb] of nav.adj[c]) if (!seen.has(nb)) { seen.add(nb); q.push(nb); } }
  if (seen.size !== exp.nodes.length) console.log('  ! недостижимые узлы:', exp.nodes.filter((_, i) => !seen.has(i)).map((n) => n.id).join(', '));
  // время пути
  const spawnPath = (spawns, target) => {
    let best = Infinity;
    for (const [x, z] of spawns) {
      const p = nav.path(nav.nearest(x, z), nav.get(target));
      if (p) best = Math.min(best, nav.length(p));
    }
    return best;
  };
  for (const s of Object.values(exp.sites)) {
    const atk = spawnPath(exp.attackSpawns, s.plant), def_ = spawnPath(exp.defendSpawns, s.plant);
    console.log(`  Точка ${s.name}: атака ${atk.toFixed(1)} м (${(atk / SPEED).toFixed(1)} с), защита ${def_.toFixed(1)} м (${(def_ / SPEED).toFixed(1)} с)`);
    for (const e of s.entries) {
      const a = spawnPath(exp.attackSpawns, e), d = spawnPath(exp.defendSpawns, e);
      console.log(`     вход ${e}: атака ${(a / SPEED).toFixed(1)} с, защита ${(d / SPEED).toFixed(1)} с`);
    }
  }
}

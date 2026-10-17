// Превращает компактное описание карты (JSON) в готовые данные:
// боксы, зоны, точки закладки, навигационные узлы. Левая половина карты
// зеркалится на правую автоматически — так линии A и B всегда равны по времени пути.
// Модуль не зависит от Three.js, поэтому им пользуется и скрипт проверки карт.

export const KINDS = {
  wall:  { color: '#4a566e', surf: 'concrete' },
  crate: { color: '#8c6d46', surf: 'wood' },
  plat:  { color: '#5f7194', surf: 'metal' },
  low:   { color: '#667391', surf: 'concrete' },
  stair: { color: '#6c7ca0', surf: 'metal' },
  patch: { color: '#2d3a4c', surf: 'sand' },
  cont:  { color: '#b5472f', surf: 'metal' },
  barrel: { color: '#c0392b', surf: 'metal' },
};

const mirrorBox = (b) => ({ ...b, x0: -(b.x0 + b.w) });
const flipName = (s, letter) => s.replace('{S}', letter);
const mid = (id) => id + '~';

export function expandMap(def) {
  const mirror = def.mirror !== false;
  const [W, D] = def.size;
  const out = {
    id: def.id, name: def.name, size: def.size, desc: def.desc || '',
    floor: def.floor || { surf: 'concrete' },
    boxes: [], zones: [], sites: {}, nodes: [],
    attackSpawns: def.attackSpawns || [], defendSpawns: def.defendSpawns || [],
    targets: def.targets || [], range: !!def.range, props: [],
  };

  const addBox = (kind, cx, cz, w, d, h, y0 = 0, extra = {}) => {
    const k = KINDS[kind] || KINDS.wall;
    const b = { kind, color: k.color, surf: extra.surf || k.surf, x0: cx - w / 2, z0: cz - d / 2, y0, w, d, h, ...extra };
    out.boxes.push(b);
    if (mirror && Math.abs(cx) > 0.01) out.boxes.push(mirrorBox(b));
  };

  // Декор: ["lamp", x, z, высота] — фонарь, ["barrel", x, z] — бочка (с коллизией). Правая половина зеркалится.
  for (const [type, px, pz, ph] of def.props || []) {
    const put = (x) => {
      if (type === 'barrel') { const c = ['#c0392b', '#2f6fa8', '#d6a21e', '#3d8f5a'][out.boxes.length % 4]; out.boxes.push({ kind: 'barrel', color: c, surf: 'metal', x0: x - 0.35, z0: pz - 0.35, y0: 0, w: 0.7, d: 0.7, h: 0.95 }); }
      else out.props.push({ type, x, z: pz, h: ph || 4 });
    };
    put(px); if (mirror && Math.abs(px) > 0.01) put(-px);
  }

  // внешние стены
  const t = 2, hh = 7;
  const o = { outer: true, surf: 'concrete' };
  out.boxes.push({ kind: 'wall', color: KINDS.wall.color, ...o, x0: -W / 2 - t, z0: -D / 2 - t, y0: 0, w: W + 2 * t, d: t, h: hh });
  out.boxes.push({ kind: 'wall', color: KINDS.wall.color, ...o, x0: -W / 2 - t, z0: D / 2, y0: 0, w: W + 2 * t, d: t, h: hh });
  out.boxes.push({ kind: 'wall', color: KINDS.wall.color, ...o, x0: -W / 2 - t, z0: -D / 2, y0: 0, w: t, d: D, h: hh });
  out.boxes.push({ kind: 'wall', color: KINDS.wall.color, ...o, x0: W / 2, z0: -D / 2, y0: 0, w: t, d: D, h: hh });

  for (const [kind, cx, cz, w, d, h, y0 = 0, surf] of def.boxes || []) addBox(kind, cx, cz, w, d, h, y0, surf ? { surf } : {});

  // Лестницы: ["+z", cx, cz, ширина, ступеней, подъём, глубина, y0]. (cx,cz) — нижний край.
  for (const [dir, cx, cz, width, n, rise, run, y0 = 0] of def.stairs || []) {
    for (let i = 0; i < n; i++) {
      const top = (i + 1) * rise, off = (i + 0.5) * run;
      let px = cx, pz = cz, w = width, d = run;
      if (dir === '+z') pz += off; else if (dir === '-z') pz -= off;
      else { px += dir === '+x' ? off : -off; w = run; d = width; }
      addBox('stair', px, pz, w, d, top, y0, { pass: true });
    }
  }

  // Зоны (подписи): {n, r:[x0,z0,x1,z1]}; "{S}" заменяется на A / B
  for (const z of def.zones || []) {
    const [x0, z0, x1, z1] = z.r;
    out.zones.push({ n: flipName(z.n, 'A'), r: [x0, z0, x1, z1] });
    if (mirror && !(Math.abs(x0 + x1) < 0.01)) out.zones.push({ n: flipName(z.n, 'B'), r: [-x1, z0, -x0, z1] });
  }

  // Узлы навигации: ["id", x, z, y, lookX, lookZ]
  for (const [id, x, z, y = 0, lx, lz] of def.nodes || []) {
    out.nodes.push({ id, x, z, y, lx, lz });
    if (mirror && Math.abs(x) > 0.01) out.nodes.push({ id: mid(id), x: -x, z, y, lx: lx === undefined ? undefined : -lx, lz });
  }

  // Точки закладки: A задана, B — зеркало. В списках id узлов зеркальные получают «~».
  for (const [name, s] of Object.entries(def.sites || {})) {
    out.sites[name] = { name, x: s.x, z: s.z, r: s.r, plant: s.plant, entries: s.entries || [], holds: s.holds || [], posts: s.posts || [] };
    if (mirror) {
      const other = name === 'A' ? 'B' : 'A';
      const m = (arr) => arr.map(mid);
      out.sites[other] = { name: other, x: -s.x, z: s.z, r: s.r, plant: mid(s.plant), entries: m(s.entries || []), holds: m(s.holds || []), posts: m(s.posts || []) };
    }
  }
  return out;
}

// Название зоны под координатами
export function zoneAt(map, x, z) {
  for (const zn of map.zones) {
    const [x0, z0, x1, z1] = zn.r;
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return zn.n;
  }
  let best = '', bd = 1e9;
  for (const zn of map.zones) {
    const [x0, z0, x1, z1] = zn.r;
    const d = Math.hypot((x0 + x1) / 2 - x, (z0 + z1) / 2 - z);
    if (d < bd) { bd = d; best = zn.n; }
  }
  return best;
}

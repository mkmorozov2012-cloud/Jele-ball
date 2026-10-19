// Навигация ботов: граф точек. Рёбра строятся автоматически — соединяем узлы,
// между которыми можно пройти по прямой (без стен). Путь ищем алгоритмом A*.
export class Nav {
  constructor(nodes, world, maxEdge = 20) {
    this.nodes = nodes;
    this.world = world;
    this.idx = new Map(nodes.map((n, i) => [n.id, i]));
    this.adj = nodes.map(() => []);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d > maxEdge || Math.abs(a.y - b.y) > 1.5) continue;
        if (world.segmentFree(a.x, a.z, a.y, b.x, b.z, b.y)) {
          this.adj[i].push([j, d]); this.adj[j].push([i, d]);
        }
      }
    }
  }
  get(id) { return this.idx.get(id); }

  // Ближайший узел, до которого можно дойти напрямую
  nearest(x, z, y = 0) {
    let best = -1, bd = 1e9, bestAny = -1, bdAny = 1e9;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bdAny) { bdAny = d; bestAny = i; }
      if (d < bd && this.world.segmentFree(x, z, y, n.x, n.z, n.y, 0.3)) { bd = d; best = i; }
    }
    return best >= 0 ? best : bestAny;
  }

  // A*: возвращает массив индексов узлов от start до goal (включительно)
  path(start, goal) {
    if (start === goal) return [start];
    const n = this.nodes.length;
    const g = new Array(n).fill(Infinity), f = new Array(n).fill(Infinity), prev = new Array(n).fill(-1);
    const open = new Set([start]), closed = new Uint8Array(n);
    const h = (i) => Math.hypot(this.nodes[i].x - this.nodes[goal].x, this.nodes[i].z - this.nodes[goal].z);
    g[start] = 0; f[start] = h(start);
    while (open.size) {
      let cur = -1, cf = Infinity;
      for (const i of open) if (f[i] < cf) { cf = f[i]; cur = i; }
      if (cur === goal) {
        const p = [cur];
        while (prev[cur] >= 0) { cur = prev[cur]; p.push(cur); }
        return p.reverse();
      }
      open.delete(cur); closed[cur] = 1;
      for (const [nb, d] of this.adj[cur]) {
        if (closed[nb]) continue;
        const ng = g[cur] + d;
        if (ng < g[nb]) { g[nb] = ng; prev[nb] = cur; f[nb] = ng + h(nb); open.add(nb); }
      }
    }
    return null;
  }

  // Длина пути в метрах между двумя узлами (для проверки баланса карт)
  length(path) {
    let s = 0;
    for (let i = 1; i < path.length; i++) s += Math.hypot(this.nodes[path[i]].x - this.nodes[path[i - 1]].x, this.nodes[path[i]].z - this.nodes[path[i - 1]].z);
    return s;
  }
}

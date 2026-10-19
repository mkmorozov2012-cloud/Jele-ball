import { PALETTE } from './MapBuilder.js';

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// Миникарта: статический слой (стены, подписи зон) рисуется один раз,
// каждый кадр поверх — игроки, заряд, видимые враги.
export class Minimap {
  constructor(canvas, map) {
    this.c = canvas; this.g = canvas.getContext('2d'); this.map = map;
    const [W, D] = map.size;
    this.s = Math.min(canvas.width / (W + 4), canvas.height / (D + 4));
    this.ox = canvas.width / 2; this.oy = canvas.height / 2;
    this.layer = document.createElement('canvas'); this.layer.width = canvas.width; this.layer.height = canvas.height;
    this.drawStatic(this.layer.getContext('2d'));
  }
  px(x) { return this.ox + x * this.s; }
  py(z) { return this.oy + z * this.s; }

  drawStatic(g) {
    const m = this.map, s = this.s;
    g.fillStyle = 'rgba(8,11,18,0.85)'; g.fillRect(0, 0, this.layer.width, this.layer.height);
    const [W, D] = m.size;
    g.fillStyle = '#121824'; g.fillRect(this.px(-W / 2), this.py(-D / 2), W * s, D * s);
    // зоны спавна
    g.fillStyle = 'rgba(255,122,26,0.12)'; this.rectOf(g, m.attackSpawns, 5);
    g.fillStyle = 'rgba(25,224,200,0.12)'; this.rectOf(g, m.defendSpawns, 5);
    for (const b of m.boxes) {
      if (b.outer || b.kind === 'patch') continue;
      g.fillStyle = b.h < 1.6 ? '#3a4660' : b.h < 3 ? '#4a5878' : '#5d6e92';
      if (b.kind === 'plat') g.fillStyle = '#44587a';
      g.fillRect(this.px(b.x0), this.py(b.z0), Math.max(1, b.w * s), Math.max(1, b.d * s));
    }
    // точки
    for (const st of Object.values(m.sites)) {
      g.strokeStyle = '#ffd23f'; g.lineWidth = 1.5; g.beginPath(); g.arc(this.px(st.x), this.py(st.z), st.r * s, 0, 7); g.stroke();
      g.fillStyle = '#ffd23f'; g.font = 'bold 16px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(st.name, this.px(st.x), this.py(st.z));
    }
    // подписи зон
    g.font = '8px sans-serif'; g.fillStyle = 'rgba(190,205,230,0.75)'; g.textAlign = 'center';
    for (const z of m.zones) {
      const [x0, z0, x1, z1] = z.r;
      if ((x1 - x0) < 4 || (z1 - z0) < 4) continue;
      g.fillText(z.n, this.px((x0 + x1) / 2), this.py((z0 + z1) / 2) + 0);
    }
  }
  rectOf(g, list, pad) {
    if (!list.length) return;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const [x, z] of list) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    g.fillRect(this.px(x0 - pad), this.py(z0 - pad), (x1 - x0 + pad * 2) * this.s, (z1 - z0 + pad * 2) * this.s);
  }

  // m — Match; рисуем с точки зрения команды игрока
  draw(m) {
    const g = this.g, p = m.player;
    g.clearRect(0, 0, this.c.width, this.c.height);
    g.drawImage(this.layer, 0, 0);
    const col = (side) => (side === 'atk' ? hex(PALETTE.attack) : hex(PALETTE.defend));
    // дым
    g.fillStyle = 'rgba(170,180,200,0.45)';
    for (const sm of m.world.smokes) { g.beginPath(); g.arc(this.px(sm.x), this.py(sm.z), sm.r * this.s, 0, 7); g.fill(); }
    // заряд
    if (m.bomb.planted && !m.bomb.defused) {
      g.fillStyle = (Math.floor(performance.now() / 300) % 2) ? '#ff3b5c' : '#ffd23f';
      g.fillRect(this.px(m.bomb.x) - 3, this.py(m.bomb.z) - 3, 6, 6);
    }
    for (const a of m.actors) {
      if (!a.alive) continue;
      const ally = a.side === p.side;
      const shown = ally || a.fx.revealUntil > m.time || a.spottedUntil > m.time;
      if (!shown) continue;
      const x = this.px(a.body.x), y = this.py(a.body.z);
      g.fillStyle = col(a.side);
      g.beginPath(); g.arc(x, y, a === p ? 4 : 3.2, 0, 7); g.fill();
      if (ally) {
        // направление взгляда
        g.strokeStyle = col(a.side); g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y);
        g.lineTo(x - Math.sin(a.yaw) * 9, y - Math.cos(a.yaw) * 9); g.stroke();
      } else { g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke(); }
      if (a === p) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 5.5, 0, 7); g.stroke(); }
    }
  }
}

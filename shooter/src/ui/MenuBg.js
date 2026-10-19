// Анимированный фон меню: парящие призмы (полигоны) двух командных цветов + перспективная сетка.
export class MenuBg {
  constructor(canvas) {
    this.c = canvas; this.g = canvas.getContext('2d');
    this.shapes = [];
    this.t = 0; this.mx = 0; this.my = 0; this.running = false;
    for (let i = 0; i < 38; i++) this.shapes.push(this.make(i));
    addEventListener('mousemove', (e) => { this.mx = e.clientX / innerWidth - 0.5; this.my = e.clientY / innerHeight - 0.5; });
    addEventListener('resize', () => this.resize());
    this.resize();
  }
  make(i) {
    const atk = i % 2 === 0;
    return { x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.9, r: 20 + Math.random() * 70, n: 3 + (i % 3), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      vy: -0.01 - Math.random() * 0.02, col: atk ? '255,122,26' : '25,224,200', a: 0.06 + Math.random() * 0.14 };
  }
  resize() { this.c.width = innerWidth; this.c.height = innerHeight; }
  start() { if (!this.running) { this.running = true; this.last = performance.now(); } }
  stop() { this.running = false; }
  draw(dt) {
    if (!this.running) return;
    const g = this.g, W = this.c.width, H = this.c.height;
    this.t += dt;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#080b12'); bg.addColorStop(1, '#101a2a');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // сетка пола в перспективе
    g.strokeStyle = 'rgba(120,150,210,0.12)'; g.lineWidth = 1;
    const hy = H * 0.62;
    for (let i = -20; i <= 20; i++) { g.beginPath(); g.moveTo(W / 2 + i * 40 + this.mx * 30, hy); g.lineTo(W / 2 + i * 220 + this.mx * 120, H); g.stroke(); }
    for (let k = 0; k < 14; k++) {
      const f = ((k + (this.t * 0.4) % 1) / 14), y = hy + (H - hy) * f * f;
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
    // призмы
    for (const s of this.shapes) {
      s.rot += s.vr * dt; s.y += s.vy * dt;
      if (s.y < -0.2) { s.y = 1.2; s.x = Math.random(); }
      const px = s.x * W + this.mx * -60 * s.z, py = s.y * H + this.my * -40 * s.z;
      g.save(); g.translate(px, py); g.rotate(s.rot);
      g.beginPath();
      for (let i = 0; i < s.n; i++) { const a = i / s.n * Math.PI * 2; const r = s.r * s.z; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath();
      g.fillStyle = `rgba(${s.col},${s.a})`; g.fill();
      g.strokeStyle = `rgba(${s.col},${Math.min(0.7, s.a * 3)})`; g.lineWidth = 1.5; g.stroke();
      g.restore();
    }
    // виньетка
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.9);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
  }
}

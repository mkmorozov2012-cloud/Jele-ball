import { settings } from '../core/Settings.js';

// Весь звук генерируется на лету через WebAudio — внешних файлов нет.
// Позиционные звуки (шаги, выстрелы ботов) идут через PannerNode.
export class Synth {
  constructor() {
    this.ctx = null; this.pos = { x: 0, y: 0, z: 0 };
    settings.on('change', () => this.applyVolume());
  }
  ensure() {
    if (!this.ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return false;
      this.ctx = new C();
      const c = this.ctx;
      this.master = c.createGain(); this.master.connect(c.destination);
      const comp = c.createDynamicsCompressor(); comp.connect(this.master); this.bus = comp;
      this.sfx = c.createGain(); this.sfx.connect(this.bus);
      this.ui = c.createGain(); this.ui.connect(this.bus);
      const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      this.applyVolume();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return true;
  }
  applyVolume() {
    if (!this.ctx) return;
    const v = settings.data.volume;
    this.master.gain.value = v.master; this.sfx.gain.value = v.sfx; this.ui.gain.value = v.ui;
  }
  // позиция слушателя (камера игрока)
  listener(x, y, z, yaw) {
    if (!this.ctx) return;
    this.pos.x = x; this.pos.y = y; this.pos.z = z;
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = x; l.positionY.value = y; l.positionZ.value = z;
      l.forwardX.value = -Math.sin(yaw); l.forwardY.value = 0; l.forwardZ.value = -Math.cos(yaw);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    }
  }
  // куда направить звук: позиционный (панорама + затухание) или обычный
  dest(pos, vol = 1) {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = vol;
    if (pos) {
      const p = c.createPanner();
      p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 7; p.rolloffFactor = 1.3; p.maxDistance = 150;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = (pos.y || 0) + 1.2; p.positionZ.value = pos.z; }
      g.connect(p); p.connect(this.sfx);
    } else g.connect(this.sfx);
    return g;
  }
  noise({ dur = 0.1, type = 'bandpass', f0 = 1500, f1 = null, q = 0.8, gain = 0.4, pos = null, delay = 0, attack = 0.002, bus = null }) {
    if (!this.ensure()) return;
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g);
    g.connect(bus || this.dest(pos));
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  tone({ f0 = 440, f1 = null, dur = 0.1, type = 'sine', gain = 0.3, pos = null, delay = 0, attack = 0.003, bus = null }) {
    if (!this.ensure()) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || this.dest(pos));
    o.start(t); o.stop(t + dur + 0.05);
  }

  // --- оружие ---
  gun(w, pos) {
    if (!this.ensure()) return;
    let k = 0; for (const ch of w.id) k += ch.charCodeAt(0);
    const pv = 0.92 + (k % 17) / 100;
    const T = w.type;
    if (T === 'pistol') {
      this.noise({ dur: 0.09, f0: 2200 * pv, q: 0.7, gain: 0.5, pos });
      this.tone({ f0: 180 * pv, f1: 60, dur: 0.1, type: 'triangle', gain: 0.5, pos });
    } else if (T === 'smg') {
      this.noise({ dur: 0.07, f0: 2600 * pv, q: 0.6, gain: 0.42, pos });
      this.tone({ f0: 210 * pv, f1: 80, dur: 0.07, type: 'triangle', gain: 0.4, pos });
    } else if (T === 'shotgun') {
      this.noise({ dur: 0.28, type: 'lowpass', f0: 1800 * pv, f1: 200, gain: 0.8, pos });
      this.tone({ f0: 110 * pv, f1: 40, dur: 0.26, type: 'sawtooth', gain: 0.5, pos });
    } else if (T === 'sniper') {
      this.noise({ dur: 0.5, type: 'lowpass', f0: 2500 * pv, f1: 120, gain: 0.9, pos });
      this.tone({ f0: 95 * pv, f1: 30, dur: 0.45, type: 'sawtooth', gain: 0.6, pos });
      this.noise({ dur: 0.6, type: 'lowpass', f0: 600, f1: 100, gain: 0.25, pos, delay: 0.14 });
    } else if (T === 'mg') {
      this.noise({ dur: 0.1, f0: 1200 * pv, q: 0.6, gain: 0.55, pos });
      this.tone({ f0: 100 * pv, f1: 45, dur: 0.12, type: 'sawtooth', gain: 0.5, pos });
    } else {
      this.noise({ dur: 0.12, f0: 1600 * pv, q: 0.7, gain: 0.55, pos });
      this.tone({ f0: 140 * pv, f1: 55, dur: 0.13, type: 'triangle', gain: 0.55, pos });
    }
  }
  dry(pos) { this.tone({ f0: 900, f1: 500, dur: 0.03, type: 'square', gain: 0.12, pos }); }
  reload(pos, w) {
    const d = w?.reload || 2;
    this.noise({ dur: 0.05, f0: 3000, q: 2, gain: 0.25, pos, delay: 0.15 });
    this.tone({ f0: 500, f1: 300, dur: 0.05, type: 'square', gain: 0.1, pos, delay: 0.18 });
    this.noise({ dur: 0.06, f0: 2000, q: 2, gain: 0.3, pos, delay: d * 0.62 });
    this.tone({ f0: 700, f1: 420, dur: 0.06, type: 'square', gain: 0.12, pos, delay: d * 0.62 });
    this.noise({ dur: 0.05, f0: 3500, q: 2, gain: 0.25, pos, delay: d * 0.93 });
  }
  draw() { this.noise({ dur: 0.08, f0: 1500, f1: 3000, q: 2, gain: 0.2 }); this.tone({ f0: 400, f1: 700, dur: 0.05, type: 'square', gain: 0.07 }); }
  swing(pos) { this.noise({ dur: 0.18, type: 'highpass', f0: 800, f1: 3000, gain: 0.3, pos }); }
  impact(surf, pos) {
    if (!this.ctx) return;
    const d = Math.hypot(pos.x - this.pos.x, pos.z - this.pos.z);
    if (d > 45) return;
    if (surf === 'metal') { this.tone({ f0: 2400, f1: 1800, dur: 0.06, type: 'triangle', gain: 0.1, pos }); this.noise({ dur: 0.05, f0: 4000, q: 1, gain: 0.18, pos }); }
    else if (surf === 'wood') this.noise({ dur: 0.07, type: 'lowpass', f0: 800, gain: 0.3, pos });
    else this.noise({ dur: 0.06, type: 'bandpass', f0: 1800, q: 1.2, gain: 0.22, pos });
  }
  step(surf, pos, vol = 1) {
    if (!this.ensure()) return;
    const v = 0.5 * vol;
    if (surf === 'metal') { this.noise({ dur: 0.07, f0: 1800, q: 1.5, gain: v * 0.8, pos }); this.tone({ f0: 520, f1: 380, dur: 0.12, type: 'triangle', gain: v * 0.35, pos }); }
    else if (surf === 'wood') { this.noise({ dur: 0.07, type: 'lowpass', f0: 700, gain: v, pos }); this.tone({ f0: 170, f1: 110, dur: 0.08, type: 'sine', gain: v * 0.6, pos }); }
    else if (surf === 'sand') this.noise({ dur: 0.13, type: 'lowpass', f0: 1200, f1: 400, gain: v * 0.6, pos, attack: 0.02 });
    else this.noise({ dur: 0.07, type: 'bandpass', f0: 900, q: 0.9, gain: v, pos });
  }
  land(surf) { this.step(surf, null, 1.4); }
  hit(kind) {
    if (kind === 'head') { this.tone({ f0: 1800, dur: 0.07, type: 'square', gain: 0.12, bus: this.ui }); this.tone({ f0: 2400, dur: 0.09, type: 'square', gain: 0.09, delay: 0.04, bus: this.ui }); }
    else if (kind === 'kill') { this.tone({ f0: 700, f1: 1400, dur: 0.14, type: 'triangle', gain: 0.2, bus: this.ui }); this.noise({ dur: 0.1, f0: 600, q: 0.7, gain: 0.25, bus: this.ui }); }
    else this.tone({ f0: 1100, dur: 0.05, type: 'square', gain: 0.1, bus: this.ui });
  }
  hurt() { this.noise({ dur: 0.18, type: 'lowpass', f0: 500, gain: 0.5 }); this.tone({ f0: 120, f1: 60, dur: 0.18, gain: 0.4 }); }
  explosion(pos) {
    this.noise({ dur: 1.8, type: 'lowpass', f0: 1500, f1: 60, gain: 1, pos });
    this.tone({ f0: 70, f1: 25, dur: 1.5, type: 'sawtooth', gain: 0.7, pos });
  }
  beep(f = 1000, pos = null) { this.tone({ f0: f, dur: 0.08, type: 'square', gain: 0.18, pos }); }
  plantTick() { this.tone({ f0: 1300, dur: 0.05, type: 'square', gain: 0.1 }); }
  ability(kind, pos) {
    if (kind === 'smoke') this.noise({ dur: 0.7, type: 'lowpass', f0: 1500, f1: 300, gain: 0.5, pos });
    else if (kind === 'dash') this.noise({ dur: 0.25, type: 'bandpass', f0: 500, f1: 2800, q: 1, gain: 0.5, pos });
    else if (kind === 'flash') { this.tone({ f0: 3000, f1: 1000, dur: 0.5, type: 'sine', gain: 0.25, pos }); this.noise({ dur: 0.3, type: 'highpass', f0: 3000, gain: 0.5, pos }); }
    else if (kind === 'heal') { [523, 659, 784].forEach((f, i) => this.tone({ f0: f, dur: 0.22, type: 'sine', gain: 0.15, delay: i * 0.08, pos })); }
    else if (kind === 'reveal') { this.tone({ f0: 300, f1: 1800, dur: 0.5, type: 'sine', gain: 0.18, pos }); this.tone({ f0: 1800, f1: 300, dur: 0.4, type: 'triangle', gain: 0.1, delay: 0.5, pos }); }
    else if (kind === 'wall') { this.noise({ dur: 0.4, type: 'lowpass', f0: 400, gain: 0.7, pos }); this.tone({ f0: 90, f1: 50, dur: 0.35, type: 'sawtooth', gain: 0.4, pos }); }
    else if (kind === 'turret') { this.tone({ f0: 200, f1: 500, dur: 0.25, type: 'square', gain: 0.15, pos }); }
    else if (kind === 'ult') { [220, 330, 440, 660].forEach((f, i) => this.tone({ f0: f, dur: 0.4, type: 'sawtooth', gain: 0.12, delay: i * 0.07, pos })); }
    else this.tone({ f0: 600, f1: 900, dur: 0.15, type: 'triangle', gain: 0.2, pos });
  }
  roundStart() { [392, 523].forEach((f, i) => this.tone({ f0: f, dur: 0.25, type: 'triangle', gain: 0.2, delay: i * 0.12, bus: this.ui })); }
  roundEnd(win) { (win ? [523, 659, 784, 1047] : [392, 330, 262]).forEach((f, i) => this.tone({ f0: f, dur: 0.3, type: 'triangle', gain: 0.22, delay: i * 0.13, bus: this.ui })); }

  // Бит для танца: кик, хэт и бас-линия, 120 ударов в минуту. Возвращает функцию остановки.
  danceBeat(kind) {
    if (!this.ensure()) return () => {};
    const bass = { disco: [55, 55, 82, 55, 73, 55, 82, 98], robot: [65, 65, 0, 65, 98, 0, 65, 82], wave: [49, 0, 73, 0, 49, 0, 82, 73], spin: [55, 82, 55, 98, 55, 82, 110, 98], floss: [58, 58, 87, 58, 69, 58, 87, 103], jump: [62, 0, 62, 93, 62, 0, 78, 93] }[kind] || [55, 55, 82, 55];
    let step = 0;
    const id = setInterval(() => {
      const i = step++ % 8;
      if (i % 2 === 0) { this.tone({ f0: 150, f1: 42, dur: 0.16, type: 'sine', gain: 0.5, bus: this.ui }); }
      this.noise({ dur: 0.04, type: 'highpass', f0: 7000, gain: i % 2 ? 0.12 : 0.06, bus: this.ui });
      if (i % 4 === 2) this.noise({ dur: 0.1, type: 'bandpass', f0: 1800, q: 0.8, gain: 0.2, bus: this.ui });
      const f = bass[i]; if (f) this.tone({ f0: f * 2, dur: 0.22, type: 'sawtooth', gain: 0.18, bus: this.ui });
      if (i === 0 || i === 5) this.tone({ f0: f ? f * 8 : 440, dur: 0.12, type: 'square', gain: 0.05, bus: this.ui });
    }, 250);
    return () => clearInterval(id);
  }

  // звуки интерфейса
  uiSnd(kind) {
    if (!this.ensure()) return;
    const b = this.ui;
    if (kind === 'hover') this.tone({ f0: 1200, dur: 0.03, type: 'sine', gain: 0.05, bus: b });
    else if (kind === 'back') this.tone({ f0: 500, f1: 300, dur: 0.09, type: 'triangle', gain: 0.18, bus: b });
    else if (kind === 'confirm') { this.tone({ f0: 600, dur: 0.07, type: 'triangle', gain: 0.2, bus: b }); this.tone({ f0: 900, dur: 0.1, type: 'triangle', gain: 0.2, delay: 0.07, bus: b }); }
    else if (kind === 'buy') { this.tone({ f0: 1000, dur: 0.05, type: 'square', gain: 0.1, bus: b }); this.tone({ f0: 1500, dur: 0.08, type: 'square', gain: 0.1, delay: 0.05, bus: b }); }
    else if (kind === 'error') this.tone({ f0: 200, f1: 150, dur: 0.15, type: 'sawtooth', gain: 0.15, bus: b });
    else this.tone({ f0: 800, f1: 600, dur: 0.05, type: 'triangle', gain: 0.15, bus: b });
  }
  // фоновый «пад» для главного меню
  ambient(on) {
    if (!this.ensure()) return;
    if (on && !this.amb) {
      const c = this.ctx, g = c.createGain(); g.gain.value = 0; g.connect(this.ui);
      g.gain.linearRampToValueAtTime(0.06, c.currentTime + 2);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; f.connect(g);
      const oscs = [55, 82.4, 110.3, 164.8].map((fr, i) => {
        const o = c.createOscillator(); o.type = i % 2 ? 'sawtooth' : 'triangle'; o.frequency.value = fr; o.detune.value = (i - 1.5) * 6;
        o.connect(f); o.start(); return o;
      });
      const lfo = c.createOscillator(); lfo.frequency.value = 0.12; const lg = c.createGain(); lg.gain.value = 250; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
      this.amb = { g, oscs, lfo };
    } else if (!on && this.amb) {
      const { g, oscs, lfo } = this.amb; this.amb = null;
      g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.6);
      setTimeout(() => { oscs.forEach((o) => o.stop()); lfo.stop(); }, 700);
    }
  }
}

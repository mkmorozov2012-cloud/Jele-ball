import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { settings, IS_TOUCH } from './Settings.js';
import { Input } from './Input.js';
import { Synth } from '../audio/Synth.js';
import { Match } from '../match/Match.js';
import { PALETTE } from '../world/MapBuilder.js';
import { UI } from '../ui/UI.js';

// Корневой объект: рендерер, сцены, цикл, переключение меню ↔ матч.
export class Game {
  constructor() {
    this.canvas = document.getElementById('view');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.autoClear = false;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.background = new THREE.Color(0xb9aea4);                 // пока грузится панорама
    this.scene.fog = new THREE.Fog(0xb9aea4, 70, 190);
    this.fogBase = 190; this.hdri = {};
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 400);
    this.scene.add(this.camera);

    // свет: мягкое небо + одно направленное солнце (единственный источник теней)
    this.hemi = new THREE.HemisphereLight(0xf2ece4, 0x6a6258, 2.6); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    this.sun.position.set(34, 70, 22);
    const sc = this.sun.shadow.camera; sc.left = -52; sc.right = 52; sc.top = 52; sc.bottom = -52; sc.near = 10; sc.far = 160;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun);
    this.setSky('redwall');

    // оружие рисуется отдельной сценой, чтобы не проваливаться в стены
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(55, 1, 0.01, 5);
    this.vmScene.add(new THREE.HemisphereLight(0xe0e8ff, 0x59607a, 2.0));
    const vl = new THREE.DirectionalLight(0xffffff, 2.0); vl.position.set(1, 2, 1); this.vmScene.add(vl);

    this.input = new Input(this.canvas);
    if (IS_TOUCH) { this.input.touchMode = true; this.input.free = true; }
    this.audio = new Synth();
    this.match = null; this.state = 'menu';
    this.timeScale = 1;
    this.zoom = 1; this.baseV = 70;
    this.lastT = performance.now();
    this.fpsT = 60;

    addEventListener('resize', () => this.resize());
    this.resize();
    settings.on('change', () => { this.updateFov(); });
    this.updateFov();

    this.input.onLockChange = (locked) => {
      if (!locked && this.match && !this.match.paused && !this.match.uiOpen && !this.match.over) this.pause();
    };
    this.canvas.addEventListener('mousedown', () => {
      if (!IS_TOUCH && this.match && !this.match.paused && !this.input.locked && !this.match.uiOpen && !this.match.over) { this.audio.ensure(); this.input.lock(); }
    });
    this.ui = new UI(this);
    requestAnimationFrame((t) => this.frame(t));
  }

  // небо, туман и свет под карту: 'redwall' — серый город (Red Wall), 'desert' — солнечный день над песчаным кварталом (Poly Haven, CC0)
  setSky(kind) {
    const desert = kind === 'desert', sc = this.sun.shadow.camera;
    if (this.skyKind === kind) return;
    this.skyKind = kind;
    const file = desert ? 'desert_sky' : 'red_wall', cfg = desert
      ? { fog: 0xe4d3b0, near: 90, far: 300, env: 0.7, exp: 0.95, hemi: [0xdfeaff, 0xb59a70, 0.9], sun: [0xfff0d2, 3.4, [-55, 70, 38]], ext: 80 }
      : { fog: 0xb9aea4, near: 70, far: 190, env: 0.8, exp: 1, hemi: [0xf2ece4, 0x6a6258, 2.6], sun: [0xfff1dc, 2.4, [34, 70, 22]], ext: 52 };
    this.scene.background = new THREE.Color(cfg.fog); this.scene.fog.color.set(cfg.fog);
    this.scene.fog.near = cfg.near; this.fogBase = cfg.far;
    this.renderer.toneMappingExposure = cfg.exp; this.scene.environmentIntensity = cfg.env;
    this.hemi.color.set(cfg.hemi[0]); this.hemi.groundColor.set(cfg.hemi[1]); this.hemi.intensity = cfg.hemi[2];
    this.sun.color.set(cfg.sun[0]); this.sun.intensity = cfg.sun[1]; this.sun.position.set(...cfg.sun[2]);
    sc.left = sc.bottom = -cfg.ext; sc.right = sc.top = cfg.ext; sc.far = desert ? 220 : 160; sc.updateProjectionMatrix();
    this.scene.fog.far = cfg.far;
    const apply = (tex) => { if (this.skyKind !== kind) return; this.scene.background = tex; this.scene.environment = tex; };
    if (this.hdri[file]) apply(this.hdri[file]);
    else new RGBELoader().load(`${import.meta.env.BASE_URL}hdri/${file}.hdr`, (tex) => { tex.mapping = THREE.EquirectangularReflectionMapping; this.hdri[file] = tex; apply(tex); });
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.vmCamera.aspect = w / h; this.vmCamera.updateProjectionMatrix();
    this.updateFov();
  }
  // Настройка FOV — горизонтальная; Three.js хочет вертикальную
  updateFov() {
    const hf = settings.data.graphics.fov * Math.PI / 180;
    this.baseV = 2 * Math.atan(Math.tan(hf / 2) / this.camera.aspect) * 180 / Math.PI;
    this.setZoom(this.zoom, true);
  }
  setZoom(mul, force = false) {
    if (!force && Math.abs(mul - this.zoom) < 1e-4 && this.camera.fov > 0) return;
    this.zoom = mul;
    this.camera.fov = 2 * Math.atan(Math.tan(this.baseV * Math.PI / 360) / mul) * 180 / Math.PI;
    this.camera.updateProjectionMatrix();
  }

  applyGraphics() {
    const q = settings.data.graphics.quality;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 'low' ? Math.min(dpr, 0.8) : q === 'medium' ? Math.min(dpr, 1) : Math.min(dpr, 1.5));
    this.renderer.shadowMap.enabled = q !== 'low';
    this.sun.castShadow = q !== 'low';
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) { this.sun.shadow.mapSize.set(size, size); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    this.scene.fog.far = this.fogBase * (q === 'low' ? 0.75 : 1);
    this.renderer.setSize(innerWidth, innerHeight, false);
  }

  startMatch(cfg) {
    this.endMatch(true);
    this.applyGraphics();
    this.audio.ensure(); this.audio.ambient(false);
    this.match = new Match(this, cfg);
    this.state = 'match';
    this.canvas.style.display = 'block';
    this.input.clear(); this.input.enabled = true;
    this.ui.onMatchStart(this.match);
    if (!this.input.touchMode) this.input.lock();
  }
  endMatch(silent = false) {
    if (!this.match) return;
    this.match.dispose();
    this.match.player.ctrl.vm.root.removeFromParent();
    this.match = null; this.state = 'menu';
    this.input.enabled = false; this.input.unlock(); this.input.clear();
    this.setZoom(1);
    this.canvas.style.display = 'none';
    if (!silent) this.ui.onMatchEnd();
  }
  pause() {
    if (!this.match || this.match.paused || this.match.over) return;
    this.match.paused = true; this.input.enabled = false; this.input.unlock(); this.input.clear();
    this.ui.showPause(true);
  }
  resume() {
    if (!this.match) return;
    this.match.paused = false; this.input.clear(); this.input.enabled = true;
    this.ui.showPause(false);
    if (!this.input.touchMode) this.input.lock();
  }

  // отладка: вид сверху (для проверки карт)
  topView(on = true) {
    if (!on) { this.debugCam = null; return; }
    const c = new THREE.OrthographicCamera(-46, 46, 46 * innerHeight / innerWidth * (innerWidth / innerHeight), -46, 1, 300);
    c.left = -46 * innerWidth / innerHeight; c.right = 46 * innerWidth / innerHeight; c.top = 46; c.bottom = -46;
    c.position.set(0, 120, 0.01); c.lookAt(0, 0, 0); c.updateProjectionMatrix();
    this.debugCam = c;
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const cap = settings.data.graphics.fpsCap;
    if (cap && now - this.lastT < 1000 / cap - 1.5) return;
    const dt = Math.max(0, Math.min(0.05, (now - this.lastT) / 1000));
    this.lastT = now;
    const m = this.match;
    if (m) {
      if (!m.paused) {
        const steps = Math.max(1, Math.round(this.timeScale));
        for (let i = 0; i < steps; i++) m.update(dt * (this.timeScale < 1 ? this.timeScale : 1));
      }
      this.ui.update(dt);
      const r = this.renderer;
      r.clear();
      r.render(this.scene, this.debugCam || this.camera);
      if (!this.debugCam) { r.clearDepth(); r.render(this.vmScene, this.vmCamera); }
    } else this.ui.update(dt);
    this.input.endFrame();
  }
}

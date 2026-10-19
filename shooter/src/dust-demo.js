import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { buildDust } from './world/DustMap.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const haze = 0xe4d3b0;
scene.background = new THREE.Color(0x9fc3e6); scene.fog = new THREE.Fog(haze, 90, 330);
new RGBELoader().load(`${import.meta.env.BASE_URL}hdri/desert_sky.hdr`, (t) => {
  t.mapping = THREE.EquirectangularReflectionMapping; scene.background = t; scene.environment = t; scene.environmentIntensity = 0.7; scene.backgroundBlurriness = 0;
});

scene.add(new THREE.HemisphereLight(0xdfeaff, 0xb59a70, 0.9));
const sun = new THREE.DirectionalLight(0xfff0d2, 3.4); sun.position.set(-55, 70, 38);
sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 70, bottom: -70, near: 10, far: 220 });
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.05; scene.add(sun);

const { group } = buildDust(); scene.add(group);

const cam = new THREE.PerspectiveCamera(70, 1, 0.1, 900);
const VIEWS = {
  1: [[0, 70, 78], [0, 0, -2]],        // общий план
  2: [[0, 1.7, 33], [0, 2, -5]],       // мид от спавна T
  3: [[30, 1.7, 20], [30, 2.5, -20]],  // длинная улица к сайту A
  4: [[-30, 1.7, -14], [-36, 1.5, -30]], // сайт B
  5: [[26, 1.7, -14], [38, 1.5, -28]], // сайт A
  6: [[-24, 12, 36], [10, 3, 0]],      // вид сверху сбоку
};
function view(k) { const [p, l] = VIEWS[k]; cam.position.set(...p); cam.lookAt(...l); euler.setFromQuaternion(cam.quaternion, 'YXZ'); }
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
window.view = view;

const keys = {};
addEventListener('keydown', (e) => { keys[e.code] = true; if (VIEWS[e.key]) view(e.key); });
addEventListener('keyup', (e) => { keys[e.code] = false; });
let drag = false;
canvas.addEventListener('pointerdown', (e) => { drag = true; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup', () => { drag = false; });
canvas.addEventListener('pointermove', (e) => { if (!drag) return; euler.y -= e.movementX * 0.003; euler.x = THREE.MathUtils.clamp(euler.x - e.movementY * 0.003, -1.5, 1.5); cam.quaternion.setFromEuler(euler); });

function resize() { renderer.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
view(new URLSearchParams(location.search).get('v') || 2);

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const sp = (keys.ShiftLeft ? 18 : 7) * dt, f = new THREE.Vector3(); cam.getWorldDirection(f);
  const r = new THREE.Vector3().crossVectors(f, cam.up);
  if (keys.KeyW) cam.position.addScaledVector(f, sp); if (keys.KeyS) cam.position.addScaledVector(f, -sp);
  if (keys.KeyD) cam.position.addScaledVector(r, sp); if (keys.KeyA) cam.position.addScaledVector(r, -sp);
  if (keys.KeyE) cam.position.y += sp; if (keys.KeyQ) cam.position.y -= sp;
  renderer.render(scene, cam);
});

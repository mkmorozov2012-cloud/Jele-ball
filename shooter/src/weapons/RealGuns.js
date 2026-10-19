import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// Реалистичные модели оружия (Sketchfab, CC-BY — см. public/models/CREDITS.md).
// Исходные файлы повёрнуты и промасштабированы по-разному, поэтому для каждого задаём оси:
//   fwd — какая ось файла смотрит в сторону дула, up — какая ось файла смотрит вверх (знак = «+» или «-»).
export const REAL_MODELS = {
  colt_m1911: { file: 'colt_m1911', fwd: '-x', up: '+y' },
  desert_eagle: { file: 'desert_eagle', fwd: '-z', up: '+y' },
  makarov_pm: { file: 'makarov_pm', fwd: '+z', up: '+y' },
  ak74m: { file: 'ak74m', fwd: '-z', up: '+y' },
  ak47_tactical: { file: 'ak47_tactical', fwd: '+z', up: '+y' },
  akm_kryptek: { file: 'akm_kryptek', fwd: '-z', up: '+y' },
  ak47_akm: { file: 'ak47_akm', fwd: '-z', up: '+y' },
  sniper_djmaesen: { file: 'sniper_djmaesen', fwd: '+z', up: '+y' },
  modern_sniper: { file: 'modern_sniper', fwd: '-z', up: '+y' },
  kar98k: { file: 'kar98k', fwd: '-x', up: '+y' },
  mosin_1938: { file: 'mosin_1938', fwd: '-z', up: '+y' },
};

const JUNK = /(^|_)(bullet|round|munition|cartridge)(_|$)|^floor$|^stand$/i;
const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const axis = (s) => AX[s[1]].clone().multiplyScalar(s[0] === '-' ? -1 : 1);

// Ориентирует модель: дуло → -Z, верх → +Y, длина вдоль Z = 1, центр bbox в начале координат.
// Возвращает новую группу-обёртку (исходная сцена внутри неё).
export function orientBasis(scene, key) {
  const cfg = REAL_MODELS[key];
  // выкидываем «декорации» из файлов-витрин: пол, подставку, лежащие рядом патроны
  const junk = [];
  scene.traverse((o) => { if (o.isMesh && (JUNK.test(o.name) || JUNK.test(o.material?.name || ''))) junk.push(o); });
  junk.forEach((o) => o.parent.remove(o));
  const f = axis(cfg.fwd), u = axis(cfg.up), r = new THREE.Vector3().crossVectors(f, u);
  // колонки матрицы: куда переходят оси файла → нужны обратные: v_new = (v·r, v·u, -v·f)
  const m = new THREE.Matrix4().makeBasis(r, u, f.clone().negate()).invert();
  const inner = new THREE.Group(); inner.add(scene);
  inner.applyMatrix4(m);
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const k = 1 / size.z;
  const wrap = new THREE.Group();
  inner.position.sub(c); wrap.add(inner);
  wrap.scale.setScalar(k);
  wrap.userData.height = size.y * k; wrap.userData.width = size.x * k;
  return wrap;
}

const loader = new GLTFLoader();
const cache = new Map();
export function loadReal(key) {
  if (!cache.has(key)) {
    cache.set(key, loader.loadAsync(`${import.meta.env.BASE_URL}models/${REAL_MODELS[key].file}.glb`).then((g) => g.scene));
  }
  // SkeletonUtils.clone — обычный clone ломает модели с костями (например, Colt)
  return cache.get(key).then((s) => orientBasis(cloneSkinned(s), key));
}

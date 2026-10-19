import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// Анимированный солдат (public/models/soldier.glb из примеров three.js: Idle / Walk / Run).
const HEIGHT = 1.8;
let promise = null;
export function loadSoldier() {
  promise ||= new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/soldier.glb`);
  return promise.then((g) => {
    const scene = cloneSkinned(g.scene);
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene), k = HEIGHT / (box.max.y - box.min.y);
    const wrap = new THREE.Group();
    scene.scale.multiplyScalar(k); scene.position.y = -box.min.y * k;
    wrap.add(scene);                                             // модель смотрит в -Z, как «вперёд» в игре
    const meshes = [];
    wrap.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; o.material = o.material.clone(); meshes.push(o); } });
    const mixer = new THREE.AnimationMixer(scene);
    const act = {};
    for (const c of g.animations) if (/^(idle|walk|run)$/i.test(c.name)) act[c.name.toLowerCase()] = mixer.clipAction(c);
    const b = (n) => scene.getObjectByName('mixamorig' + n);
    const arms = { r: [b('RightArm'), b('RightForeArm'), b('RightHand')], l: [b('LeftArm'), b('LeftForeArm'), b('LeftHand')] };
    return { wrap, meshes, mixer, act, arms };
  });
}

// Двухкостный IK: тянет кисть к target (мир), локоть уходит в сторону pole (направление в мире).
// Вызывать после mixer.update и обновления world-матриц.
const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), D = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Vector3();
const wq = new THREE.Quaternion(), pq = new THREE.Quaternion(), sq = new THREE.Quaternion();
function swing(bone, from, to) {                       // поворачивает кость так, чтобы направление from стало to
  sq.setFromUnitVectors(from, to);
  bone.getWorldQuaternion(wq).premultiply(sq);
  bone.parent.getWorldQuaternion(pq);
  bone.quaternion.copy(pq.invert().multiply(wq));
  bone.updateMatrixWorld(true);
}
export function reachArm([upper, fore, hand], target, pole) {
  upper.getWorldPosition(A); fore.getWorldPosition(B); hand.getWorldPosition(C);
  const l1 = A.distanceTo(B), l2 = B.distanceTo(C);
  D.subVectors(target, A);
  const d = THREE.MathUtils.clamp(D.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  D.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  P.copy(pole).addScaledVector(D, -pole.dot(D)).normalize();
  E.copy(A).addScaledVector(D, a).addScaledVector(P, h);          // положение локтя
  swing(upper, B.sub(A).normalize(), E.clone().sub(A).normalize());
  fore.getWorldPosition(B); hand.getWorldPosition(C);
  swing(fore, C.sub(B).normalize(), D.subVectors(target, B).normalize());
}

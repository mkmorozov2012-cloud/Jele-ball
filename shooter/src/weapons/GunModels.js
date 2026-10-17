import * as THREE from 'three';

// Процедурные 3D-модели оружия из десятков деталей: ствол, ресивер, прицелы, магазины, приклады.
// Все модели смотрят в -Z, начало координат — у рукояти. Подвижные части (затвор, магазин, помпа)
// возвращаются отдельно, чтобы ViewModel мог их анимировать (перезарядка, отдача затвора).
const lam = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });
const MAT = {
  steel: lam(0x8793a4), gun: lam(0x59636f), dark: lam(0x2a303a), poly: lam(0x434a57), wood: lam(0x9a6a3e),
  woodDark: lam(0x6e4a2a), brass: lam(0xd9b255), rubber: lam(0x1d2026), chrome: lam(0xc3cddb),
  glass: new THREE.MeshBasicMaterial({ color: 0x5fe8ff }), red: new THREE.MeshBasicMaterial({ color: 0xff3b3b }),
};
const geoCache = {};
const BOX = (w, h, d) => { const k = `b${w}_${h}_${d}`; return geoCache[k] || (geoCache[k] = new THREE.BoxGeometry(w, h, d)); };
const CYL = (r, len, seg = 10) => { const k = `c${r}_${len}_${seg}`; if (!geoCache[k]) { const g = new THREE.CylinderGeometry(r, r, len, seg); g.rotateX(Math.PI / 2); geoCache[k] = g; } return geoCache[k]; };
const CONE = (r0, r1, len, seg = 10) => { const k = `n${r0}_${r1}_${len}`; if (!geoCache[k]) { const g = new THREE.CylinderGeometry(r1, r0, len, seg); g.rotateX(Math.PI / 2); geoCache[k] = g; } return geoCache[k]; };

function add(g, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m;
}
const box = (g, w, h, d, mat, x, y, z, rx, ry, rz) => add(g, BOX(w, h, d), mat, x, y, z, rx, ry, rz);
const cyl = (g, r, len, mat, x, y, z, seg) => add(g, CYL(r, len, seg), mat, x, y, z);

// группа-«деталь», которая будет двигаться
const part = (parent, x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); p.userData.rest = p.position.clone(); return p; };

function accentMat(c) { return new THREE.MeshBasicMaterial({ color: c }); }

// ---------------- пистолеты ----------------
function pistol(def, g, o) {
  const L = def.model.len, st = STYLE[def.id] || 'compact', body = lam(def.model.color);
  const heavy = st === 'heavy' || st === 'cannon', mach = st === 'machine';
  const sl = part(g, 0, 0.03, -L * 0.4);                              // затвор (движется)
  box(sl, 0.036 + (heavy ? 0.008 : 0), 0.04 + (heavy ? 0.012 : 0), L * (st === 'compact' ? 0.7 : 0.88), body, 0, 0, 0);
  box(sl, 0.038, 0.006, L * 0.86, MAT.steel, 0, 0.022 + (heavy ? 0.006 : 0), 0);                // верхняя планка
  for (let i = 0; i < 5; i++) box(sl, 0.039, 0.03, 0.004, MAT.dark, 0, 0, L * 0.3 - i * 0.012);   // насечки затвора
  box(sl, 0.012, 0.012, 0.01, MAT.dark, 0, 0.03, L * 0.36);                                       // целик
  box(sl, 0.006, 0.014, 0.008, MAT.red, 0, 0.034, -L * 0.4);                                      // мушка
  box(sl, 0.039, 0.008, L * 0.3, accentMat(o.accent), 0, -0.012, -L * 0.1);                       // акцентная полоса
  box(g, 0.032, 0.036, L * 0.66, MAT.gun, 0, -0.012, -L * 0.28);                                  // рамка
  cyl(g, st === 'cannon' ? 0.02 : 0.011, 0.04 + (st === 'cannon' ? L * 0.5 : 0), MAT.chrome, 0, 0.034, -L * (st === 'cannon' ? 0.85 : 0.66)); // ствол/дульный срез
  if (st === 'cannon') { box(g, 0.03, 0.03, L * 0.6, MAT.dark, 0, -0.012, -L * 0.7); box(g, 0.02, 0.03, 0.02, MAT.steel, 0, 0.065, 0.03); }  // подствольный груз и курок
  const grip = box(g, 0.036, 0.11, 0.05, st === 'cannon' ? MAT.wood : MAT.poly, 0, -0.075, 0.035); grip.rotation.x = 0.22;
  for (let i = 0; i < 4; i++) box(g, 0.038, 0.004, 0.052, MAT.dark, 0, -0.045 - i * 0.018, 0.04 + i * 0.004, 0.22);
  const mag = part(g, 0, -0.12, 0.028);
  box(mag, 0.03, mach ? 0.1 : 0.03, 0.04, MAT.dark, 0, mach ? -0.03 : 0.0, 0, 0.22);
  box(mag, 0.032, 0.008, 0.044, MAT.steel, 0, mach ? -0.085 : -0.016, 0.005, 0.22);
  box(g, 0.01, 0.034, 0.008, MAT.steel, 0, -0.045, -0.02);                                         // спусковая скоба
  box(g, 0.01, 0.008, 0.05, MAT.steel, 0, -0.063, -0.044);
  box(g, 0.008, 0.02, 0.008, MAT.dark, 0, -0.03, -0.03);                                          // спуск
  if (heavy) box(g, 0.026, 0.008, 0.07, MAT.steel, 0, -0.04, -L * 0.55);                          // рейка
  if (mach) { box(g, 0.04, 0.012, 0.03, MAT.dark, 0, 0.056, -L * 0.62); box(g, 0.04, 0.012, 0.03, MAT.dark, 0, 0.056, -L * 0.7); }  // компенсатор
  o.slide = sl; o.mag = mag; o.muzzle.set(0, 0.034, -L * (st === 'cannon' ? 1.1 : 0.95)); o.eject.set(0.02, 0.04, -L * 0.2);
  o.hands = { r: [0, -0.07, 0.04], l: [0.0, -0.1, 0.02] };
}

// ---------------- пистолеты-пулемёты ----------------
function smg(def, g, o) {
  const L = def.model.len, st = STYLE[def.id] || 'boxy', c = lam(def.model.color);
  box(g, 0.05, 0.06, L * 0.5, c, 0, 0.005, -L * 0.25);                                              // ресивер
  box(g, 0.052, 0.02, L * 0.48, MAT.gun, 0, 0.04, -L * 0.25);                                      // крышка
  box(g, 0.02, 0.014, L * 0.5, MAT.steel, 0, 0.056, -L * 0.25);                                     // верхняя планка
  box(g, 0.044, 0.05, L * 0.34, MAT.poly, 0, 0.0, -L * 0.62);                                      // цевьё
  for (let i = 0; i < 5; i++) box(g, 0.046, 0.016, 0.014, MAT.dark, 0, 0.01, -L * 0.5 - i * 0.03);  // вентиляционные пазы
  cyl(g, 0.011, L * 0.2, MAT.steel, 0, 0.012, -L * 0.88);
  cyl(g, 0.016, 0.07, MAT.dark, 0, 0.012, -L * 0.98, 8);                                           // глушитель/пламегаситель
  const fg = box(g, 0.025, 0.06, 0.03, MAT.poly, 0, -0.045, -L * 0.7); fg.rotation.x = 0.1;        // передняя рукоять
  const grip = box(g, 0.036, 0.09, 0.045, MAT.poly, 0, -0.07, 0.035); grip.rotation.x = 0.28;
  box(g, 0.028, 0.012, 0.07, MAT.dark, 0, -0.035, -0.02);                                           // скоба
  const mag = part(g, 0, -0.03, -L * 0.28);
  const mg = box(mag, 0.032, 0.14, 0.036, MAT.dark, 0, -0.08, 0); if (st === 'bullpup') mg.position.z += L * 0.25;
  box(mag, 0.034, 0.01, 0.04, accentMat(def.model.accent || '#19e0c8'), 0, -0.14, 0);
  if (st === 'carbine' || st === 'boxy') {                                                           // складной приклад
    box(g, 0.012, 0.012, L * 0.38, MAT.steel, 0.018, 0.02, L * 0.2); box(g, 0.012, 0.012, L * 0.38, MAT.steel, -0.018, 0.02, L * 0.2);
    box(g, 0.05, 0.07, 0.014, MAT.rubber, 0, 0.005, L * 0.39);
  } else box(g, 0.05, 0.075, L * 0.3, c, 0, 0.0, L * 0.18);
  box(g, 0.03, 0.026, 0.05, MAT.dark, 0, 0.078, -L * 0.2);                                          // коллиматор
  box(g, 0.022, 0.02, 0.004, MAT.red, 0, 0.082, -L * 0.2 - 0.026);
  box(g, 0.036, 0.008, L * 0.3, accentMat(def.model.accent || '#19e0c8'), 0, 0.03, -L * 0.28);
  o.mag = mag; o.muzzle.set(0, 0.012, -L * 1.03); o.eject.set(0.03, 0.04, -L * 0.2);
  o.hands = { r: [0, -0.075, 0.04], l: [0, -0.06, -L * 0.7] };
}

// ---------------- дробовики ----------------
function shotgun(def, g, o) {
  const L = def.model.len, st = STYLE[def.id] || 'pump', c = lam(def.model.color);
  box(g, 0.05, 0.065, L * 0.22, MAT.gun, 0, 0.0, -L * 0.1);                                          // ресивер
  cyl(g, 0.019, L * 0.62, MAT.steel, 0, 0.022, -L * 0.52, 12);                                      // ствол
  cyl(g, 0.016, L * 0.5, MAT.gun, 0, -0.012, -L * 0.46, 10);                                        // трубчатый магазин
  cyl(g, 0.012, 0.03, MAT.dark, 0, 0.022, -L * 0.84, 8);
  box(g, 0.008, 0.012, 0.008, MAT.red, 0, 0.046, -L * 0.82);                                        // мушка
  box(g, 0.01, 0.006, L * 0.5, MAT.dark, 0, 0.043, -L * 0.5);                                       // планка на стволе
  const pump = part(g, 0, -0.005, -L * 0.45);                                                         // цевьё-помпа
  box(pump, 0.05, 0.05, L * 0.2, st === 'pump' ? MAT.wood : MAT.poly, 0, 0, 0);
  for (let i = 0; i < 5; i++) box(pump, 0.052, 0.04, 0.006, MAT.dark, 0, 0, -L * 0.07 + i * 0.03);
  if (st === 'auto') { box(g, 0.056, 0.05, L * 0.34, MAT.dark, 0, 0.022, -L * 0.62); for (let i = 0; i < 5; i++) box(g, 0.058, 0.01, 0.01, MAT.steel, 0, 0.022, -L * 0.52 - i * 0.04); }
  box(g, 0.05, 0.08, L * 0.3, st === 'pump' ? MAT.wood : MAT.poly, 0, -0.012, L * 0.2, 0.08);       // приклад
  box(g, 0.05, 0.095, 0.02, MAT.rubber, 0, -0.018, L * 0.355, 0.08);
  const grip = box(g, 0.035, 0.08, 0.04, st === 'pump' ? MAT.wood : MAT.poly, 0, -0.065, 0.03); grip.rotation.x = 0.3;
  box(g, 0.012, 0.03, 0.05, MAT.steel, 0, -0.04, -0.03);
  box(g, 0.04, 0.008, L * 0.2, accentMat(def.model.accent || '#ffd23f'), 0, 0.034, -L * 0.1);
  box(g, 0.012, 0.012, 0.03, MAT.brass, 0.028, 0.02, -L * 0.04);                                     // окно выброса
  o.pump = pump; o.muzzle.set(0, 0.022, -L * 0.88); o.eject.set(0.03, 0.03, -L * 0.04);
  o.hands = { r: [0, -0.07, 0.035], l: [0, -0.012, -L * 0.45] };
}

// ---------------- штурмовые винтовки ----------------
function rifle(def, g, o) {
  const L = def.model.len, st = STYLE[def.id] || 'standard', c = lam(def.model.color);
  const bull = st === 'bullpup';
  box(g, 0.05, 0.07, L * 0.34, c, 0, 0.005, -L * 0.13);                                              // нижний ресивер
  box(g, 0.048, 0.04, L * 0.34, MAT.gun, 0, 0.055, -L * 0.13);                                       // верхний ресивер
  box(g, 0.02, 0.012, L * 0.34, MAT.steel, 0, 0.082, -L * 0.13);                                     // рейка
  for (let i = 0; i < 7; i++) box(g, 0.022, 0.006, 0.01, MAT.dark, 0, 0.089, -L * 0.22 + i * 0.03);
  box(g, 0.055, 0.06, L * 0.3, MAT.poly, 0, 0.012, -L * 0.45);                                       // цевьё
  for (let i = 0; i < 4; i++) { box(g, 0.058, 0.02, 0.016, MAT.dark, 0, 0.012, -L * 0.36 - i * 0.05); box(g, 0.02, 0.012, 0.016, MAT.dark, 0, 0.044, -L * 0.36 - i * 0.05); }
  if (st === 'burst') { for (const [x, y] of [[0, 0.03], [-0.013, 0.007], [0.013, 0.007]]) cyl(g, 0.009, L * 0.3, MAT.steel, x, y, -L * 0.8, 8); box(g, 0.05, 0.05, 0.02, MAT.dark, 0, 0.02, -L * 0.62); }
  else { cyl(g, 0.012, L * 0.34, MAT.steel, 0, 0.032, -L * 0.8, 10); cyl(g, 0.007, L * 0.25, MAT.gun, 0, 0.056, -L * 0.62, 6); }
  const muz = st === 'carbine' ? 0.028 : 0.022; cyl(g, muz, 0.06, MAT.dark, 0, 0.032, -L * 0.98, 8);   // дульный тормоз
  for (let i = 0; i < 3; i++) box(g, muz * 2.2, 0.006, 0.008, MAT.steel, 0, 0.032 + 0.0, -L * 0.96 - i * 0.02);
  const mag = part(g, 0, -0.03, -L * 0.18);                                                           // изогнутый магазин
  box(mag, 0.034, 0.1, 0.04, MAT.dark, 0, -0.05, bull ? L * 0.3 : 0, 0.0);
  box(mag, 0.034, 0.07, 0.04, MAT.dark, 0, -0.12, (bull ? L * 0.3 : 0) + 0.025, 0.28);
  box(mag, 0.036, 0.008, 0.044, accentMat(def.model.accent || '#19e0c8'), 0, -0.16, (bull ? L * 0.3 : 0) + 0.035, 0.28);
  const grip = box(g, 0.036, 0.095, 0.045, MAT.poly, 0, -0.075, 0.04); grip.rotation.x = 0.3;
  box(g, 0.03, 0.012, 0.075, MAT.dark, 0, -0.04, -0.02);                                              // скоба
  if (!bull) { box(g, 0.05, 0.075, L * 0.3, c, 0, 0.0, L * 0.2); box(g, 0.05, 0.1, 0.02, MAT.rubber, 0, -0.01, L * 0.35); box(g, 0.05, 0.02, L * 0.28, MAT.poly, 0, 0.044, L * 0.2); }
  else box(g, 0.055, 0.085, L * 0.3, c, 0, 0.0, L * 0.1);
  // оптика / целик
  if (st === 'standard' || st === 'burst') { box(g, 0.035, 0.03, 0.08, MAT.dark, 0, 0.1, -L * 0.15); box(g, 0.026, 0.022, 0.004, MAT.glass, 0, 0.1, -L * 0.15 - 0.042); box(g, 0.04, 0.012, 0.03, MAT.steel, 0, 0.088, -L * 0.15); }
  else { box(g, 0.01, 0.03, 0.01, MAT.steel, 0, 0.1, -L * 0.1); box(g, 0.008, 0.03, 0.008, MAT.steel, 0, 0.09, -L * 0.7); }
  box(g, 0.052, 0.01, L * 0.4, accentMat(def.model.accent || '#19e0c8'), 0, 0.03, -L * 0.1);
  box(g, 0.02, 0.012, 0.03, MAT.brass, 0.03, 0.05, -L * 0.12);
  o.mag = mag; o.muzzle.set(0, 0.032, -L * 1.02); o.eject.set(0.03, 0.05, -L * 0.1);
  o.hands = { r: [0, -0.08, 0.04], l: [0, -0.015, -L * 0.45] };
}

// ---------------- снайперские винтовки ----------------
function sniper(def, g, o) {
  const L = def.model.len, st = STYLE[def.id] || 'bolt', c = lam(def.model.color);
  box(g, 0.05, 0.075, L * 0.25, c, 0, 0.0, -L * 0.1);                                                // ресивер
  cyl(g, 0.017, L * 0.62, MAT.steel, 0, 0.03, -L * 0.65, 12);                                       // тяжёлый ствол
  cyl(g, 0.024, 0.09, MAT.dark, 0, 0.03, -L * 0.98, 10);                                             // дульный тормоз
  for (let i = 0; i < 3; i++) box(g, 0.056, 0.006, 0.012, MAT.steel, 0, 0.03, -L * 0.96 - i * 0.025);
  box(g, 0.05, 0.05, L * 0.28, st === 'dmr' ? MAT.poly : MAT.woodDark, 0, 0.005, -L * 0.43);         // цевьё
  box(g, 0.05, 0.09, L * 0.34, st === 'dmr' ? MAT.poly : MAT.wood, 0, -0.01, L * 0.17, 0.0);         // приклад
  box(g, 0.045, 0.04, L * 0.16, MAT.rubber, 0, 0.06, L * 0.24);                                      // щёчная накладка
  box(g, 0.05, 0.11, 0.022, MAT.rubber, 0, -0.01, L * 0.335);
  const grip = box(g, 0.036, 0.095, 0.045, MAT.poly, 0, -0.075, 0.03); grip.rotation.x = 0.3;
  box(g, 0.012, 0.03, 0.05, MAT.steel, 0, -0.045, -0.04);
  // прицел
  cyl(g, 0.03, L * 0.28, MAT.dark, 0, 0.115, -L * 0.18, 14);
  cyl(g, 0.038, 0.05, MAT.gun, 0, 0.115, -L * 0.3, 14); cyl(g, 0.034, 0.04, MAT.gun, 0, 0.115, -L * 0.06, 14);
  add(g, new THREE.CircleGeometry(0.03, 14), MAT.glass, 0, 0.115, -L * 0.325 - 0.001);
  box(g, 0.012, 0.06, 0.02, MAT.steel, 0, 0.08, -L * 0.22); box(g, 0.012, 0.06, 0.02, MAT.steel, 0, 0.08, -L * 0.1);
  box(g, 0.03, 0.012, 0.03, accentMat(def.model.accent || '#66e0ff'), 0, 0.15, -L * 0.18);
  // затвор с рукояткой — анимируется
  const bolt = part(g, 0.028, 0.03, -L * 0.05);
  cyl(bolt, 0.008, 0.05, MAT.chrome, 0.0, 0, 0); box(bolt, 0.06, 0.012, 0.012, MAT.chrome, 0.03, 0, 0.02, 0, 0, 0.0);
  add(bolt, new THREE.SphereGeometry(0.014, 8, 6), MAT.dark, 0.062, 0, 0.02);
  // сошки
  box(g, 0.012, 0.09, 0.012, MAT.steel, 0.025, -0.045, -L * 0.52, 0, 0, 0.2); box(g, 0.012, 0.09, 0.012, MAT.steel, -0.025, -0.045, -L * 0.52, 0, 0, -0.2);
  const mag = part(g, 0, -0.05, -L * 0.08);
  box(mag, 0.036, st === 'dmr' ? 0.1 : 0.04, 0.05, MAT.dark, 0, st === 'dmr' ? -0.03 : -0.0, 0);
  o.mag = mag; o.bolt = bolt; o.muzzle.set(0, 0.03, -L * 1.05); o.eject.set(0.03, 0.05, -L * 0.06);
  o.hands = { r: [0, -0.08, 0.035], l: [0, -0.02, -L * 0.42] };
}

// ---------------- пулемёты ----------------
function mg(def, g, o) {
  const L = def.model.len, st = STYLE[def.id] || 'light', c = lam(def.model.color), heavy = st === 'heavy';
  box(g, 0.07, 0.09, L * 0.36, c, 0, 0.01, -L * 0.12);
  box(g, 0.072, 0.03, L * 0.34, MAT.gun, 0, 0.065, -L * 0.12);                                       // крышка подачи
  box(g, 0.03, 0.014, L * 0.34, MAT.steel, 0, 0.088, -L * 0.12);
  box(g, 0.075, 0.075, L * 0.28, MAT.poly, 0, 0.015, -L * 0.45);                                     // кожух
  for (let i = 0; i < 6; i++) { box(g, 0.077, 0.02, 0.014, MAT.dark, 0, 0.015, -L * 0.34 - i * 0.04); box(g, 0.02, 0.078, 0.014, MAT.dark, 0, 0.015, -L * 0.34 - i * 0.04); }
  cyl(g, heavy ? 0.022 : 0.017, L * 0.3, MAT.steel, 0, 0.02, -L * 0.85, 12);
  cyl(g, 0.03, 0.08, MAT.dark, 0, 0.02, -L * 1.0, 10);
  box(g, 0.012, 0.06, 0.012, MAT.steel, 0, 0.12, -L * 0.1); box(g, 0.012, 0.012, 0.16, MAT.steel, 0, 0.15, -L * 0.1);  // ручка для переноски
  const mag = part(g, -0.03, -0.07, -L * 0.1);                                                        // коробка с лентой
  box(mag, 0.1, 0.1, 0.12, MAT.dark, -0.04, -0.03, 0); box(mag, 0.1, 0.012, 0.126, accentMat(def.model.accent || '#ffd23f'), -0.04, -0.09, 0);
  for (let i = 0; i < 7; i++) box(mag, 0.012, 0.016, 0.014, MAT.brass, 0.0 + i * 0.002, 0.02 + i * 0.012, 0, 0, 0, 0.5);  // лента
  box(g, 0.075, 0.1, L * 0.3, c, 0, 0.0, L * 0.2);
  box(g, 0.075, 0.12, 0.02, MAT.rubber, 0, 0, L * 0.355);
  const grip = box(g, 0.04, 0.1, 0.05, MAT.poly, 0, -0.085, 0.05); grip.rotation.x = 0.3;
  const fg = box(g, 0.03, 0.08, 0.04, MAT.poly, 0, -0.06, -L * 0.45);
  box(g, 0.012, 0.09, 0.012, MAT.steel, 0.04, -0.05, -L * 0.62, 0, 0, 0.35); box(g, 0.012, 0.09, 0.012, MAT.steel, -0.04, -0.05, -L * 0.62, 0, 0, -0.35); // сошки
  o.mag = mag; o.muzzle.set(0, 0.02, -L * 1.06); o.eject.set(0.04, 0.05, -L * 0.1);
  o.hands = { r: [0, -0.09, 0.05], l: [0, -0.04, -L * 0.45] };
}

// ---------------- ближний бой ----------------
function blade(def, g, o) {
  const mp = def.model;
  const edge = new THREE.MeshLambertMaterial({ color: mp.color, emissive: 0x2a3d55 });
  cyl(g, 0.014, 0.16, MAT.rubber, 0, 0, 0.02, 8);                                                    // обмотанная рукоять
  for (let i = 0; i < 5; i++) box(g, 0.032, 0.006, 0.01, MAT.dark, 0, 0, -0.04 + i * 0.03);
  add(g, new THREE.SphereGeometry(0.02, 8, 6), MAT.steel, 0, 0, 0.11);                                // навершие
  box(g, 0.12, 0.022, 0.025, MAT.steel, 0, 0, -0.07); box(g, 0.02, 0.05, 0.03, accentMat(def.model.accent || '#19e0c8'), 0, 0, -0.07);   // гарда
  box(g, 0.012, 0.045, 0.3, edge, 0, 0.0, -0.24);                                                     // клинок
  box(g, 0.014, 0.008, 0.28, MAT.dark, 0, 0.0, -0.24);                                                // кровосток
  const tip = box(g, 0.012, 0.045, 0.1, edge, 0, 0.0, -0.44); tip.scale.set(1, 1, 1);
  box(g, 0.012, 0.03, 0.08, edge, 0, 0.0, -0.5, 0.0);
  box(g, 0.012, 0.012, 0.05, edge, 0, 0.0, -0.56);
  box(g, 0.003, 0.05, 0.4, new THREE.MeshBasicMaterial({ color: 0xcfe9ff }), 0, 0.0, -0.32);        // блик на кромке
  o.muzzle.set(0, 0, -0.55); o.eject.set(0, 0, 0);
  o.hands = { r: [0, 0, 0.03], l: [0, -0.06, 0.1] };
}

const STYLE = {
  spark: 'compact', pin: 'compact', swarm: 'machine', fang: 'heavy', thunder: 'cannon',
  fly: 'boxy', wasp: 'carbine', bumble: 'bullpup',
  boar: 'pump', wall: 'auto',
  wind: 'carbine', cheetah: 'bullpup', cliff: 'standard', bulwark: 'burst',
  needle: 'bolt', horizon: 'bolt', eye: 'dmr',
  roller: 'light', hammer: 'heavy',
};
export const SIGHT = { pistol: 0.058, smg: 0.088, shotgun: 0.05, rifle: 0.1, sniper: 0.117, mg: 0.095, melee: 0 };
const BUILD = { melee: blade, pistol, smg, shotgun, rifle, sniper, mg };

// Собирает модель оружия. Возвращает { group, muzzle, eject, hands, slide?, mag?, pump?, bolt? }
export function buildGun(def) {
  const g = new THREE.Group();
  const o = { group: g, muzzle: new THREE.Vector3(), eject: new THREE.Vector3(), hands: null, slide: null, mag: null, pump: null, bolt: null };
  (BUILD[def.type] || rifle)(def, g, o);
  g.traverse((m) => { if (m.isMesh) m.castShadow = false; });
  return o;
}

/**
 * Datos canonicos de un dodecaedro regular, compartidos por el render (Three.js)
 * y la fisica (cannon-es). Asi el indice de cada cara (faceIndex) es identico en
 * la geometria visible, en la textura y en el solido de colision.
 *
 * - VERTICES: 20 vertices con circunradio = 1.
 * - FACES: 12 caras pentagonales, cada una con 5 indices de vertice en orden
 *   antihorario visto desde fuera (normal saliente).
 * - FACE_NORMALS: normal unitaria saliente de cada cara (mismo orden que FACES).
 * - INRADIUS: distancia del centro al plano de una cara (para apoyar el dado).
 */

const PHI = (1 + Math.sqrt(5)) / 2;
const H = 1 / PHI;
const CIRCUM = Math.sqrt(3); // circunradio de los vertices "crudos"

// 20 vertices crudos (circunradio sqrt(3))
const RAW = [
  [-1, -1, -1], [-1, -1, 1], [-1, 1, -1], [-1, 1, 1],
  [1, -1, -1], [1, -1, 1], [1, 1, -1], [1, 1, 1],
  [0, -H, -PHI], [0, -H, PHI], [0, H, -PHI], [0, H, PHI],
  [-H, -PHI, 0], [H, -PHI, 0], [-H, PHI, 0], [H, PHI, 0],
  [-PHI, 0, -H], [-PHI, 0, H], [PHI, 0, -H], [PHI, 0, H],
];

// Direcciones de las 12 caras (permutaciones de (0, ±phi, ±1))
const FACE_DIRS = [
  [0, PHI, 1], [0, PHI, -1], [0, -PHI, 1], [0, -PHI, -1],
  [1, 0, PHI], [1, 0, -PHI], [-1, 0, PHI], [-1, 0, -PHI],
  [PHI, 1, 0], [PHI, -1, 0], [-PHI, 1, 0], [-PHI, -1, 0],
];

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function norm(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

// Vertices normalizados a circunradio 1
const VERTICES = RAW.map((v) => [v[0] / CIRCUM, v[1] / CIRCUM, v[2] / CIRCUM]);

const FACES = [];
const FACE_NORMALS = [];

for (const dir of FACE_DIRS) {
  const n = norm(dir);
  // Las 5 caras con mayor proyeccion sobre la normal forman la cara
  const dots = VERTICES.map((v) => dot(v, n));
  const max = Math.max(...dots);
  let idx = dots
    .map((d, i) => ({ d, i }))
    .filter((o) => Math.abs(o.d - max) < 1e-6)
    .map((o) => o.i);

  // Centro de la cara y orden antihorario alrededor de la normal
  const center = idx.reduce(
    (acc, i) => [acc[0] + VERTICES[i][0], acc[1] + VERTICES[i][1], acc[2] + VERTICES[i][2]],
    [0, 0, 0]
  ).map((c) => c / idx.length);

  const r0 = norm(sub(VERTICES[idx[0]], center));
  const b = norm(cross(n, r0));
  idx = idx.sort((ia, ib) => {
    const va = sub(VERTICES[ia], center);
    const vb = sub(VERTICES[ib], center);
    const aa = Math.atan2(dot(va, b), dot(va, r0));
    const ab = Math.atan2(dot(vb, b), dot(vb, r0));
    return aa - ab;
  });

  FACES.push(idx);
  FACE_NORMALS.push(n);
}

// Inradio (con circunradio 1)
const c0 = FACES[0].reduce(
  (acc, i) => [acc[0] + VERTICES[i][0], acc[1] + VERTICES[i][1], acc[2] + VERTICES[i][2]],
  [0, 0, 0]
).map((c) => c / FACES[0].length);
const INRADIUS = Math.hypot(c0[0], c0[1], c0[2]);

export { VERTICES, FACES, FACE_NORMALS, INRADIUS };

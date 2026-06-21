/**
 * Construccion de la geometria 3D de los dados y utilidades para orientarlos.
 *
 * El d6 es un cubo (BoxGeometry) y el d12 se construye a mano a partir de los
 * datos canonicos del dodecaedro (dodecahedron.js), de modo que el indice de
 * cada cara coincide en el render, la textura y el solido de colision (fisica).
 *
 * La geometria es generica y agnostica del juego: cada constructor recibe en
 * `opts` un generador de texturas y un mapeo cara->resultado (`faceResult`).
 * Es `games.js` quien decide que numeros/simbolos lleva cada juego (El Anillo
 * Unico, HeroQuest, ...). Asi anadir un juego nuevo no toca este archivo.
 *
 * Cada dado expone:
 *   - geometryKind: 'cube' | 'dodeca'  (forma base para la fisica)
 *   - mass: masa para el cuerpo rigido.
 *   - mesh: el THREE.Mesh para la escena.
 *   - faceNormals: normal local saliente de cada cara, indexada por faceIndex.
 *   - restHeight: altura del centro cuando reposa apoyado en una cara.
 *   - resultForFace(faceIndex): traduce la cara de arriba al resultado del juego.
 *   - setColor(color): regenera las texturas con un nuevo color.
 */

import * as THREE from 'three';
import { VERTICES, FACES, FACE_NORMALS, INRADIUS } from './dodecahedron.js';

const UP = new THREE.Vector3(0, 1, 0);

export const D6_SIZE = 1;       // arista del cubo
export const D12_RADIUS = 0.82; // circunradio del dodecaedro

function diceMaterial(texture) {
  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.45,
    metalness: 0.05,
  });
}

// ---------------------------------------------------------------------------
// d6  (cubo)
// ---------------------------------------------------------------------------
export function createD6(color, opts = {}) {
  const size = opts.size || D6_SIZE;
  const makeTextures = opts.textures;
  const faceResult = opts.faceResult;
  const geometry = new THREE.BoxGeometry(size, size, size);
  let textures = makeTextures(color);
  let materials = textures.map(diceMaterial);
  const mesh = new THREE.Mesh(geometry, materials);

  // Orden de caras del BoxGeometry: +X, -X, +Y, -Y, +Z, -Z
  const faceNormals = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
  ];

  return {
    geometryKind: 'cube',
    mass: 1,
    mesh,
    faceNormals,
    restHeight: size / 2,
    resultForFace: faceResult,
    setColor(newColor) {
      textures.forEach((t) => t.dispose());
      textures = makeTextures(newColor);
      materials = textures.map(diceMaterial);
      mesh.material = materials;
    },
    dispose() {
      geometry.dispose();
      textures.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

// ---------------------------------------------------------------------------
// d12 (dodecaedro construido desde datos canonicos)
// ---------------------------------------------------------------------------
export function createD12(color, opts = {}) {
  const radius = opts.radius || D12_RADIUS;
  const makeTextures = opts.textures;
  const faceResult = opts.faceResult;
  const positions = [];
  const uvs = [];
  const faceNormals = [];
  const geometry = new THREE.BufferGeometry();

  const v = new THREE.Vector3();
  const uAxis = new THREE.Vector3();
  const vAxis = new THREE.Vector3();
  let vertOffset = 0;

  FACES.forEach((face, faceIndex) => {
    const normal = new THREE.Vector3().fromArray(FACE_NORMALS[faceIndex]);
    faceNormals.push(normal.clone());

    // Vertices de la cara (pentagono) escalados
    const pts = face.map((idx) =>
      new THREE.Vector3().fromArray(VERTICES[idx]).multiplyScalar(radius)
    );
    const center = pts
      .reduce((acc, p) => acc.add(p), new THREE.Vector3())
      .multiplyScalar(1 / pts.length);

    // Base 2D sobre la cara: el eje vertical se alinea con el "arriba" del mundo
    // proyectado, para que los numeros queden derechos.
    vAxis.copy(UP).addScaledVector(normal, -UP.dot(normal));
    if (vAxis.lengthSq() < 1e-4) {
      vAxis.set(0, 0, 1).addScaledVector(normal, -normal.z);
    }
    vAxis.normalize();
    uAxis.crossVectors(vAxis, normal).normalize();

    // Radio maximo para normalizar las UV dentro de [0,1]
    let maxR = 0;
    for (const p of pts) {
      v.subVectors(p, center);
      maxR = Math.max(maxR, Math.hypot(v.dot(uAxis), v.dot(vAxis)));
    }
    const scale = 1 / (2 * maxR * 1.08);

    const uvOf = (p) => {
      v.subVectors(p, center);
      return [v.dot(uAxis) * scale + 0.5, v.dot(vAxis) * scale + 0.5];
    };

    // Triangulacion en abanico: (0,1,2) (0,2,3) (0,3,4)
    const fan = [
      [0, 1, 2], [0, 2, 3], [0, 3, 4],
    ];
    for (const tri of fan) {
      for (const k of tri) {
        positions.push(pts[k].x, pts[k].y, pts[k].z);
        const uv = uvOf(pts[k]);
        uvs.push(uv[0], uv[1]);
      }
    }

    geometry.addGroup(vertOffset, 9, faceIndex);
    vertOffset += 9;
  });

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();

  let textures = makeTextures(color);
  let materials = textures.map(diceMaterial);
  const mesh = new THREE.Mesh(geometry, materials);

  return {
    geometryKind: 'dodeca',
    mass: 1.3,
    mesh,
    faceNormals,
    restHeight: INRADIUS * radius,
    resultForFace: faceResult,
    setColor(newColor) {
      textures.forEach((t) => t.dispose());
      textures = makeTextures(newColor);
      materials = textures.map(diceMaterial);
      mesh.material = materials;
    },
    dispose() {
      geometry.dispose();
      textures.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

/**
 * Quaternion que orienta el dado para que la cara `faceIndex` quede arriba,
 * con un giro opcional alrededor del eje vertical.
 */
export function orientationForFace(faceNormals, faceIndex, spin = 0) {
  const q = new THREE.Quaternion().setFromUnitVectors(faceNormals[faceIndex], UP);
  const spinQ = new THREE.Quaternion().setFromAxisAngle(UP, spin);
  return spinQ.multiply(q);
}

/**
 * Construccion de la geometria 3D de los dados y utilidades para orientarlos.
 *
 * El d6 es un cubo (BoxGeometry) y el d12 se construye a mano a partir de los
 * datos canonicos del dodecaedro (dodecahedron.js), de modo que el indice de
 * cada cara coincide en el render, la textura y el solido de colision (fisica).
 *
 * Cada dado expone:
 *   - type: 'd6' | 'd12'
 *   - mesh: el THREE.Mesh para la escena.
 *   - faceNormals: normal local saliente de cada cara, indexada por faceIndex.
 *   - restHeight: altura del centro cuando reposa apoyado en una cara.
 *   - setColor(color): regenera las texturas con un nuevo color.
 */

import * as THREE from 'three';
import { createD6Textures, createD12Textures } from './textures.js';
import { VERTICES, FACES, FACE_NORMALS, INRADIUS } from './dodecahedron.js';

const UP = new THREE.Vector3(0, 1, 0);

export const D6_SIZE = 1;       // arista del cubo
export const D12_RADIUS = 0.82; // circunradio del dodecaedro

// Numero grabado en cada cara del cubo, en el orden de caras del render
// (+X, -X, +Y, -Y, +Z, -Z). Debe coincidir con textures.js (numbersByFace).
export const D6_NUMBER_BY_FACE = [1, 6, 2, 5, 3, 4];

/**
 * Traduce el indice de cara que ha quedado arriba a un resultado del juego.
 * Es la fuente de verdad compartida con la fisica: donde cae el dado ES el valor.
 */
export function resultForFace(type, faceIndex) {
  if (type === 'd6') {
    const value = D6_NUMBER_BY_FACE[faceIndex];
    return { type, faceIndex, value, label: String(value), special: value === 6 ? 'tengwar' : null };
  }
  // d12: caras 0..9 => numeros 1..10, 10 => Runa de Gandalf, 11 => Ojo de Sauron
  if (faceIndex <= 9) {
    return { type, faceIndex, value: faceIndex + 1, label: String(faceIndex + 1), special: null };
  }
  if (faceIndex === 10) {
    return { type, faceIndex, value: 11, label: 'Runa de Gandalf', special: 'gandalf' };
  }
  return { type, faceIndex, value: 0, label: 'Ojo de Sauron', special: 'eye' };
}

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
export function createD6(color, size = D6_SIZE) {
  const geometry = new THREE.BoxGeometry(size, size, size);
  let textures = createD6Textures(color);
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
    type: 'd6',
    mesh,
    faceNormals,
    restHeight: size / 2,
    setColor(newColor) {
      textures.forEach((t) => t.dispose());
      textures = createD6Textures(newColor);
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
export function createD12(color, radius = D12_RADIUS) {
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

  let textures = createD12Textures(color);
  let materials = textures.map(diceMaterial);
  const mesh = new THREE.Mesh(geometry, materials);

  return {
    type: 'd12',
    mesh,
    faceNormals,
    restHeight: INRADIUS * radius,
    setColor(newColor) {
      textures.forEach((t) => t.dispose());
      textures = createD12Textures(newColor);
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

export function createDie(type, color) {
  return type === 'd12' ? createD12(color) : createD6(color);
}

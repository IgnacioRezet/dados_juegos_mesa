/**
 * Generacion procedural de las caras de los dados con <canvas>.
 *
 * Cada cara se dibuja sobre un fondo del color elegido (el "plastico" del dado)
 * con la tinta negra grabada, imitando los dados de El Anillo Unico:
 *   - d6: numeros 1..6; el 6 lleva una pequena runa Tengwar.
 *   - d12: numeros 1..10, la Runa de Gandalf y el Ojo de Sauron.
 */

import * as THREE from 'three';

const SIZE = 256;

/** Oscurece un color hex (#rrggbb) un factor 0..1 para sombras/borde. */
function shade(hex, factor) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(factor);
  return '#' + c.getHexString();
}

function baseCanvas(color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  // Fondo del dado con un leve degradado radial para dar volumen.
  const grad = ctx.createRadialGradient(SIZE * 0.4, SIZE * 0.35, SIZE * 0.1, SIZE * 0.5, SIZE * 0.5, SIZE * 0.75);
  grad.addColorStop(0, shade(color, 1.12));
  grad.addColorStop(0.6, color);
  grad.addColorStop(1, shade(color, 0.78));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  return { canvas, ctx };
}

function inkStyle(ctx) {
  ctx.fillStyle = '#111';
  ctx.strokeStyle = '#111';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

/** Dibuja un numero centrado con una tipografia con serifas (estilo "elfico"). */
function drawNumber(ctx, text, scale = 1) {
  inkStyle(ctx);
  ctx.save();
  ctx.translate(SIZE / 2, SIZE / 2);
  ctx.font = `bold ${Math.round(150 * scale)}px Georgia, "Times New Roman", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Contorno hueco + relleno fino para el aspecto "grabado".
  ctx.lineWidth = 6;
  ctx.strokeText(text, 0, -6);
  ctx.fillText(text, 0, -6);
  ctx.restore();
}

/** Pequena runa que acompana al 6 (marca de exito mayor), version reducida. */
function drawTengwarMark(ctx) {
  ctx.save();
  ctx.translate(SIZE * 0.71, SIZE * 0.30);
  ctx.scale(0.34, 0.34);
  drawGandalfRune(ctx, true);
  ctx.restore();
}

/**
 * Runa de Gandalf: asta vertical con un tridente que se abre hacia arriba
 * y cuatro puntos (arriba, abajo, izquierda, derecha). Es el mejor resultado
 * del dado de hazana.
 */
function drawGandalfRune(ctx, compact = false) {
  ctx.save();
  if (!compact) ctx.translate(SIZE / 2, SIZE / 2);
  inkStyle(ctx);
  ctx.lineWidth = 22;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const J = 18; // altura del nudo donde nacen las ramas

  // Asta inferior
  ctx.beginPath();
  ctx.moveTo(-6, J);
  ctx.lineTo(-6, 92);
  ctx.stroke();

  // Rama izquierda (casi vertical, la mas alta)
  ctx.beginPath();
  ctx.moveTo(-6, J);
  ctx.lineTo(-14, -86);
  ctx.stroke();

  // Rama central (diagonal hacia arriba-derecha)
  ctx.beginPath();
  ctx.moveTo(-6, J);
  ctx.lineTo(40, -52);
  ctx.stroke();

  // Rama derecha (mas abierta)
  ctx.beginPath();
  ctx.moveTo(-6, J);
  ctx.lineTo(66, -16);
  ctx.stroke();

  // Cuatro puntos alrededor
  const dot = (x, y, r) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  dot(-10, -112, 12);
  dot(-6, 116, 12);
  dot(-92, 14, 12);
  dot(96, 36, 12);

  ctx.restore();
}

/**
 * Ojo de Sauron: ojo muy alargado con pupila vertical en llama y remates
 * angulares en las puntas. Es el peor resultado del dado de hazana.
 */
function drawEyeOfSauron(ctx) {
  ctx.save();
  ctx.translate(SIZE / 2, SIZE / 2);
  ctx.scale(0.92, 0.92);
  ctx.fillStyle = '#111';
  ctx.strokeStyle = '#111';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Parpado: dos arcos anchos que se juntan en las puntas (forma de ojo)
  ctx.lineWidth = 15;
  ctx.beginPath();
  ctx.moveTo(-104, 0);
  ctx.bezierCurveTo(-50, -44, 50, -44, 104, 0);  // parpado superior
  ctx.bezierCurveTo(50, 40, -50, 40, -104, 0);   // parpado inferior
  ctx.stroke();

  // Pupila vertical (hoja de llama)
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.quadraticCurveTo(20, 0, 0, 34);
  ctx.quadraticCurveTo(-20, 0, 0, -34);
  ctx.fill();

  // Remates angulares en cada punta del ojo
  const hook = (dir) => {
    const x = 104 * dir;
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 34 * dir, -20);
    ctx.lineTo(x + 16 * dir, -24);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 30 * dir, 18);
    ctx.stroke();
  };
  hook(1);
  hook(-1);

  ctx.restore();
}

function makeTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Devuelve las 6 texturas del d6 en el orden de caras del BoxGeometry:
 * [ +X, -X, +Y, -Y, +Z, -Z ]. El mapeo numero<->cara se decide en dice.js.
 */
export function createD6Textures(color) {
  // numbersByFace[i] = numero que se ve en la cara i (0..5)
  const numbersByFace = [1, 6, 2, 5, 3, 4];
  return numbersByFace.map((n) => {
    const { canvas, ctx } = baseCanvas(color);
    drawNumber(ctx, String(n));
    if (n === 6) drawTengwarMark(ctx);
    return makeTexture(canvas);
  });
}

/**
 * Devuelve las 12 texturas del d12 indexadas por faceIndex (0..11):
 *   0..9  => numeros 1..10
 *   10    => Runa de Gandalf
 *   11    => Ojo de Sauron
 */
export function createD12Textures(color) {
  const textures = [];
  for (let i = 0; i < 12; i++) {
    const { canvas, ctx } = baseCanvas(color);
    if (i <= 9) {
      drawNumber(ctx, String(i + 1), 0.92);
    } else if (i === 10) {
      drawGandalfRune(ctx);
    } else {
      drawEyeOfSauron(ctx);
    }
    textures.push(makeTexture(canvas));
  }
  return textures;
}

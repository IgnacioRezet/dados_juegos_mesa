/**
 * Registro de juegos y sus dados.
 *
 * Cada juego declara:
 *   - id, name, icon, tagline: metadatos para el selector del lobby.
 *   - dice: lista ordenada de tipos de dado, cada uno con etiqueta, limites,
 *     cantidad por defecto y `make(color)` que construye el dado 3D inyectando
 *     sus texturas y su mapeo cara->resultado.
 *   - summarize(results): resume una tirada -> { headline, tags[], logTotal }.
 *   - describeDie(result): texto corto de un dado para el registro.
 *
 * Anadir un juego nuevo = anadir una entrada aqui. La geometria (dice.js) y la
 * red/servidor son agnosticas del juego concreto.
 */

import { createD6, createD12 } from './dice.js';
import {
  createD6Textures,
  createD12Textures,
  createHeroQuestCombatTextures,
  HEROQUEST_FACE_SYMBOLS,
} from './textures.js';

// ---------------------------------------------------------------------------
// El Anillo Unico
// ---------------------------------------------------------------------------
// Numero grabado en cada cara del cubo, en el orden del BoxGeometry
// (+X, -X, +Y, -Y, +Z, -Z). Debe coincidir con textures.js (numbersByFace).
const TOR_D6_NUMBER_BY_FACE = [1, 6, 2, 5, 3, 4];

function torD6Result(faceIndex) {
  const value = TOR_D6_NUMBER_BY_FACE[faceIndex];
  return { type: 'd6', faceIndex, value, label: String(value), special: value === 6 ? 'tengwar' : null };
}

function torD12Result(faceIndex) {
  // caras 0..9 => numeros 1..10, 10 => Runa de Gandalf, 11 => Ojo de Sauron
  if (faceIndex <= 9) {
    return { type: 'd12', faceIndex, value: faceIndex + 1, label: String(faceIndex + 1), special: null };
  }
  if (faceIndex === 10) {
    return { type: 'd12', faceIndex, value: 11, label: 'Runa de Gandalf', special: 'gandalf' };
  }
  return { type: 'd12', faceIndex, value: 0, label: 'Ojo de Sauron', special: 'eye' };
}

const torGame = {
  id: 'tor',
  name: 'El Anillo Único',
  icon: '⚔',
  tagline: 'd6 de éxito · d12 de hazaña',
  // Musica ambiente de la sesion (rutas relativas a /public). Suena en bucle.
  music: [
    'assets/music/LOTR - Rohan  Rohirrim Soundtrack Suite.mp3',
    'assets/music/Nazgul Theme x Sauron Theme  EPIC VERSION (The Lord of the Rings Soundtrack).mp3',
  ],
  dice: [
    {
      type: 'd6', label: 'Dados de éxito', sub: 'd6', min: 0, max: 20, default: 2,
      make: (color) => createD6(color, { textures: createD6Textures, faceResult: torD6Result }),
    },
    {
      type: 'd12', label: 'Dado de hazaña', sub: 'd12', min: 0, max: 6, default: 1,
      make: (color) => createD12(color, { textures: createD12Textures, faceResult: torD12Result }),
    },
  ],
  summarize(results) {
    let total = 0, eyes = 0, gandalf = false;
    for (const d of results) {
      if (d.special === 'eye') eyes++;
      else if (d.special === 'gandalf') gandalf = true;
      else total += d.value; // d6 (incluido el 6) y d12 de 1..10
    }
    const tags = [];
    if (gandalf) tags.push({ text: '¡Runa de Gandalf!', kind: 'gandalf' });
    if (eyes > 0) tags.push({ text: `${eyes} Ojo(s) de Sauron`, kind: 'eye' });
    return { headline: String(total), tags, logTotal: `= ${total}` };
  },
  describeDie(d) {
    if (d.special === 'gandalf') return '✦ Runa de Gandalf';
    if (d.special === 'eye') return '◉ Ojo de Sauron';
    if (d.special === 'tengwar') return '6 ᚷ';
    return d.label;
  },
};

// ---------------------------------------------------------------------------
// HeroQuest
// ---------------------------------------------------------------------------
const HQ_LABELS = { skull: 'Calavera', white: 'Escudo blanco', black: 'Escudo negro' };

function heroQuestResult(faceIndex) {
  const symbol = HEROQUEST_FACE_SYMBOLS[faceIndex];
  return { type: 'combat', faceIndex, symbol, value: 0, label: HQ_LABELS[symbol], special: symbol };
}

const heroQuestGame = {
  id: 'heroquest',
  name: 'HeroQuest',
  icon: '💀',
  tagline: 'd6 de combate · calaveras y escudos',
  // Pon aqui los mp3 de HeroQuest (en public/assets/music/) y sonaran solo en
  // sus sesiones. De momento vacio: HeroQuest no lleva musica.
  music: [],
  dice: [
    {
      type: 'combat', label: 'Dados de combate', sub: 'd6', min: 0, max: 12, default: 3,
      make: (color) => createD6(color, { textures: createHeroQuestCombatTextures, faceResult: heroQuestResult }),
    },
  ],
  summarize(results) {
    let skulls = 0, white = 0, black = 0;
    for (const d of results) {
      if (d.symbol === 'skull') skulls++;
      else if (d.symbol === 'white') white++;
      else black++;
    }
    const tags = [];
    if (white > 0) tags.push({ text: `${white} escudo(s) blanco(s)`, kind: 'white-shield' });
    if (black > 0) tags.push({ text: `${black} escudo(s) negro(s)`, kind: 'black-shield' });
    return { headline: `💀 ${skulls}`, tags, logTotal: `💀${skulls} 🛡${white} 🛡${black}` };
  },
  describeDie(d) {
    if (d.symbol === 'skull') return '💀';
    if (d.symbol === 'white') return '🛡 blanco';
    return '🛡 negro';
  },
};

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------
export const GAMES = {
  [torGame.id]: torGame,
  [heroQuestGame.id]: heroQuestGame,
};

export const DEFAULT_GAME = torGame.id;

export function listGames() {
  return Object.values(GAMES);
}

export function getGame(id) {
  return GAMES[id] || GAMES[DEFAULT_GAME];
}

/** Construye el dado 3D para (juego, tipo) con el color dado. */
export function createDie(gameId, type, color) {
  const game = getGame(gameId);
  const def = game.dice.find((d) => d.type === type) || game.dice[0];
  return def.make(color);
}

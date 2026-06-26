/**
 * Esquema de la hoja de personaje de El Anillo Unico (The One Ring 2.ª ed.).
 *
 * Describe TODOS los campos del PDF oficial, agrupados por seccion. `sheet.js`
 * usa estas tablas para construir el formulario fiel al PDF y para serializar
 * a/desde el JSON `data` que se persiste en Strapi.
 *
 * Cada campo se identifica por una `key` estable (no traducir): es la clave en
 * `data` y forma el id de presencia "<playerId>:<key>". Las etiquetas visibles
 * estan en `label`.
 */

// Culturas heroicas: solo cambian el tema visual (marco/acento) y el campo
// "Heroic Culture". Las 4 hojas del PDF son identicas salvo el borde.
export const CULTURES = {
  hobbit: { id: 'hobbit', name: 'Hobbit', accent: '#9c6b2f', blessing: '' },
  elf: { id: 'elf', name: 'Elfo', accent: '#3f7fa6', blessing: '' },
  dwarf: { id: 'dwarf', name: 'Enano', accent: '#9a3b2f', blessing: '' },
  men: { id: 'men', name: 'Hombres', accent: '#b08a2e', blessing: '' },
};

export const DEFAULT_CULTURE = 'men';

export function getCulture(id) {
  return CULTURES[id] || CULTURES[DEFAULT_CULTURE];
}

// --- Seccion PERSONAJE ---------------------------------------------------
export const CHARACTER_FIELDS = [
  { key: 'heroicCulture', label: 'Cultura Heroica', type: 'text' },
  { key: 'age', label: 'Edad', type: 'text', short: true },
  { key: 'culturalBlessing', label: 'Bendición Cultural', type: 'text' },
  { key: 'standardOfLiving', label: 'Nivel de Vida', type: 'text' },
  { key: 'calling', label: 'Llamada', type: 'text' },
  { key: 'shadowPath', label: 'Senda de la Sombra', type: 'text' },
  { key: 'patron', label: 'Patrono', type: 'text' },
  { key: 'distinctiveFeatures', label: 'Rasgos Distintivos', type: 'text' },
  { key: 'flaws', label: 'Defectos', type: 'text' },
];

// --- Atributos (Fuerza / Corazón / Ingenio): valor + número objetivo ------
export const ATTRIBUTES = [
  { key: 'strength', label: 'Fuerza' },
  { key: 'heart', label: 'Corazón' },
  { key: 'wits', label: 'Ingenio' },
];

// --- Aguante / Esperanza: cajas numericas ---------------------------------
export const ENDURANCE_FIELDS = [
  { key: 'enduranceMax', label: 'Máx.' },
  { key: 'enduranceCurrent', label: 'Actual' },
  { key: 'load', label: 'Carga' },
  { key: 'fatigue', label: 'Fatiga' },
];

export const HOPE_FIELDS = [
  { key: 'hopeMax', label: 'Máx.' },
  { key: 'hopeCurrent', label: 'Actual' },
  { key: 'shadow', label: 'Sombra' },
  { key: 'shadowScars', label: 'Cicatrices' },
];

// --- Estados --------------------------------------------------------------
export const CONDITIONS = [
  { key: 'weary', label: 'Agotado' },
  { key: 'miserable', label: 'Desdichado' },
  { key: 'wounded', label: 'Herido' },
];

// --- Habilidades: 3 columnas de 6, cada una con valor 1..6 + favorita -----
export const SKILL_COLUMNS = [
  [
    { key: 'awe', label: 'Imponer' },
    { key: 'athletics', label: 'Atletismo' },
    { key: 'awareness', label: 'Percepción' },
    { key: 'hunting', label: 'Caza' },
    { key: 'song', label: 'Canto' },
    { key: 'craft', label: 'Artesanía' },
  ],
  [
    { key: 'enhearten', label: 'Alentar' },
    { key: 'travel', label: 'Viajar' },
    { key: 'insight', label: 'Perspicacia' },
    { key: 'healing', label: 'Sanar' },
    { key: 'courtesy', label: 'Cortesía' },
    { key: 'battle', label: 'Batalla' },
  ],
  [
    { key: 'persuade', label: 'Persuadir' },
    { key: 'stealth', label: 'Sigilo' },
    { key: 'scan', label: 'Escudriñar' },
    { key: 'explore', label: 'Explorar' },
    { key: 'riddle', label: 'Acertijos' },
    { key: 'lore', label: 'Saber' },
  ],
];

// --- Competencias de combate: valor 1..6 ----------------------------------
export const PROFICIENCIES = [
  { key: 'axes', label: 'Hachas' },
  { key: 'bows', label: 'Arcos' },
  { key: 'spears', label: 'Lanzas' },
  { key: 'swords', label: 'Espadas' },
];

// --- Recompensas / Virtudes / Puntos / Tesoro -----------------------------
export const POINTS_FIELDS = [
  { key: 'adventurePoints', label: 'Puntos de Aventura' },
  { key: 'skillPoints', label: 'Puntos de Habilidad' },
  { key: 'fellowshipPoints', label: 'Puntos de Comunidad' },
];

// Valor (TN Corazón) y Sabiduría (TN Ingenio): cajas numericas.
export const VALOUR_FIELD = { key: 'valour', label: 'Valor', sub: 'TN Corazón' };
export const WISDOM_FIELD = { key: 'wisdom', label: 'Sabiduría', sub: 'TN Ingenio' };
export const TREASURE_FIELD = { key: 'treasure', label: 'Tesoro' };

// Recompensas y Virtudes: listas repetibles de una sola columna (texto).
export const REWARDS_COLS = [{ key: 'name', label: 'Recompensa', flex: 1 }];
export const VIRTUES_COLS = [{ key: 'name', label: 'Virtud', flex: 1 }];

// --- Combate: armas, armadura, escudo -------------------------------------
// Las listas de Equipo de Guerra y Armadura son repetibles: cada una se guarda
// como un array de filas en `data` (key del grupo) y crece con el boton "+".
export const WAR_GEAR_COLS = [
  { key: 'name', label: 'Equipo de Guerra', flex: 2 },
  { key: 'damage', label: 'Daño', flex: 1 },
  { key: 'injury', label: 'Lesión', flex: 1 },
  { key: 'load', label: 'Carga', flex: 1 },
  { key: 'notes', label: 'Notas', flex: 2 },
];

export const ARMOUR_COLS = [
  { key: 'name', label: 'Armadura y Yelmo', flex: 2 },
  { key: 'protection', label: 'Protección', flex: 1 },
  { key: 'load', label: 'Carga', flex: 1 },
];

export const SHIELD_FIELDS = [
  { key: 'shieldName', label: 'Escudo', type: 'text', flex: 2 },
  { key: 'shieldParry', label: 'Parada', type: 'num' },
  { key: 'shieldLoad', label: 'Carga', type: 'num' },
];

// Protection / Parry (Base + Total) bajo armadura y escudo.
export const PROTECTION_FIELDS = [
  { key: 'protectionBase', label: 'Base' },
  { key: 'protectionTotal', label: 'Total' },
];
export const PARRY_FIELDS = [
  { key: 'parryBase', label: 'Base' },
  { key: 'parryTotal', label: 'Total' },
];

export const SKILL_MAX = 6; // numero de rombos por habilidad/proficiencia

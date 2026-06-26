/**
 * Cliente REST fino para Strapi (persistencia de hojas de personaje).
 *
 * Solo el servidor Node habla con Strapi; el navegador nunca. Si no estan
 * definidas las variables de entorno STRAPI_URL / STRAPI_TOKEN, todas las
 * funciones son no-op y devuelven null: la mesa funciona en modo solo memoria
 * (degradacion elegante, igual que el comportamiento original).
 *
 * Content-Type esperado en Strapi: `character-sheet` (coleccion) con campos
 *   sessionCode (string), playerId (string), culture (string),
 *   playerName (string), data (json).
 * Se identifica una hoja por la pareja (sessionCode, playerId).
 */

const STRAPI_URL = (process.env.STRAPI_URL || '').replace(/\/$/, '');
const STRAPI_TOKEN = process.env.STRAPI_TOKEN || '';
// Plural API id del content-type (Strapi v4/v5: /api/<pluralName>)
const COLLECTION = process.env.STRAPI_COLLECTION || 'character-sheets';

const persistenceEnabled = Boolean(STRAPI_URL && STRAPI_TOKEN);

function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${STRAPI_TOKEN}`,
  };
}

function base() {
  return `${STRAPI_URL}/api/${COLLECTION}`;
}

/** Aplana la forma de Strapi ({id, attributes}|{...}) a un objeto plano. */
function flatten(entry) {
  if (!entry) return null;
  const attrs = entry.attributes || entry;
  return {
    docId: entry.documentId || entry.id || attrs.documentId || null,
    id: entry.id || null,
    sessionCode: attrs.sessionCode,
    playerId: attrs.playerId,
    culture: attrs.culture,
    playerName: attrs.playerName,
    data: attrs.data || {},
  };
}

async function findEntry(sessionCode, playerId) {
  const qs =
    `?filters[sessionCode][$eq]=${encodeURIComponent(sessionCode)}` +
    `&filters[playerId][$eq]=${encodeURIComponent(playerId)}` +
    `&pagination[pageSize]=1`;
  const res = await fetch(base() + qs, { headers: headers() });
  if (!res.ok) throw new Error(`Strapi find ${res.status}`);
  const json = await res.json();
  const list = json.data || [];
  return list.length ? list[0] : null;
}

/**
 * Carga la hoja de (sessionCode, playerId) desde Strapi.
 * @returns {Promise<object|null>} hoja plana o null si no existe / sin persistencia.
 */
async function loadSheet(sessionCode, playerId) {
  if (!persistenceEnabled) return null;
  try {
    const entry = await findEntry(sessionCode, playerId);
    return flatten(entry);
  } catch (err) {
    console.warn('[strapi] loadSheet fallo:', err.message);
    return null;
  }
}

/**
 * Crea o actualiza la hoja de (sessionCode, playerId).
 * @returns {Promise<object|null>} hoja plana guardada o null si sin persistencia / error.
 */
async function saveSheet(sessionCode, playerId, sheet) {
  if (!persistenceEnabled) return null;
  const payload = {
    data: {
      sessionCode,
      playerId,
      culture: sheet.culture || null,
      playerName: sheet.playerName || null,
      data: sheet.data || {},
    },
  };
  try {
    const existing = await findEntry(sessionCode, playerId);
    if (existing) {
      const docId = existing.documentId || existing.id;
      const res = await fetch(`${base()}/${docId}`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Strapi update ${res.status}`);
      const json = await res.json();
      return flatten(json.data);
    }
    const res = await fetch(base(), {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Strapi create ${res.status}`);
    const json = await res.json();
    return flatten(json.data);
  } catch (err) {
    console.warn('[strapi] saveSheet fallo:', err.message);
    return null;
  }
}

module.exports = { persistenceEnabled, loadSheet, saveSheet };

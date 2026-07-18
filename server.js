/**
 * Servidor del Lanzador de Dados de "El Anillo Unico".
 *
 * - Sirve los archivos estaticos de /public.
 * - Gestiona sesiones (salas) en tiempo real mediante WebSockets.
 * - El RESULTADO de cada tirada lo decide el servidor (fuente de verdad)
 *   y se transmite a todos los participantes de la misma sesion, de modo
 *   que todos ven exactamente la misma tirada animarse.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

// Carga minima de .env (sin dependencias) ANTES de requerir strapi, que lee
// process.env al importarse. Solo define claves que no existan ya en el entorno.
(function loadDotEnv() {
  try {
    const file = path.join(__dirname, '.env');
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].replace(/^["']|["']$/g, '');
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch (_) { /* sin .env, modo solo memoria */ }
})();

const { persistenceEnabled, loadSheet, loadSheetByName, saveSheet } = require('./strapi');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Estado en memoria de las sesiones
// ---------------------------------------------------------------------------
/**
 * @type {Map<string, {
 *   clients: Set<any>, history: any[], game: string,
 *   sheets: Map<string, object>,   // playerId -> hoja { playerId, culture, playerName, data }
 *   editing: Map<string, string>,  // field -> playerId que lo esta editando (efimero)
 * }>}
 */
const sessions = new Map();

function getSession(code) {
  let s = sessions.get(code);
  if (!s) {
    s = {
      clients: new Set(),
      history: [],
      game: null,
      sheets: new Map(),
      editing: new Map(),
    };
    sessions.set(code, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Hojas de personaje (solo El Anillo Unico). El estado vivo esta en memoria y
// se comparte por WebSocket; la persistencia en Strapi es EXPLICITA: el jugador
// pulsa "Guardar personaje" (mensaje sheetSave). No hay auto-guardado al entrar
// ni al editar. El navegador nunca habla con Strapi directamente.
// ---------------------------------------------------------------------------
function blankSheet(playerId, culture, playerName) {
  return { playerId, culture: culture || 'men', playerName: playerName || 'Aventurero', data: {} };
}

/**
 * Identidad estable de un jugador DENTRO de una sala, derivada de su nombre.
 * El mismo nombre reclama siempre la misma hoja (entres desde el navegador que
 * entres), lo que evita hojas duplicadas. Nombres distintos = personajes
 * distintos; el mismo nombre = el mismo personaje.
 */
function playerIdFromName(name) {
  const norm = String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // quita acentos
    .replace(/[^a-z0-9]+/g, '-')       // no alfanumerico -> guion
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return 'n-' + (norm || 'anon');
}

function sheetsList(session) {
  return [...session.sheets.values()];
}

function editingObject(session) {
  return Object.fromEntries(session.editing);
}

function broadcast(sessionCode, payload, exclude = null) {
  const session = sessions.get(sessionCode);
  if (!session) return;
  const data = JSON.stringify(payload);
  for (const client of session.clients) {
    if (client !== exclude && client.readyState === 1) {
      client.send(data);
    }
  }
}

function participantsList(session) {
  // Deduplica por playerId: varias conexiones con el mismo nombre (mismo
  // personaje en varias pestanas/dispositivos) cuentan como un unico jugador.
  const seen = new Map();
  for (const c of session.clients) {
    if (!seen.has(c.playerId)) {
      seen.set(c.playerId, {
        id: c.playerId,
        name: c.playerName,
        color: c.color,
        culture: c.culture || 'men',
      });
    }
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Tiradas
// ---------------------------------------------------------------------------
// El servidor NO decide el resultado: solo reparte una semilla y los tipos de
// dado. El resultado lo determina la fisica (cannon-es) de forma identica en
// todos los clientes (misma semilla => misma simulacion => misma cara arriba).
// Cada cliente reporta el resultado que calculo con 'rollResult', y el servidor
// guarda el primero recibido por tirada para el historial / nuevos jugadores.

// El cliente envia ya la lista expandida de dados ([{type}, ...]) segun el
// juego de la sesion. El servidor es agnostico del juego: solo valida que cada
// entrada tenga un `type` razonable y limita el total de dados en mesa.
const MAX_DICE = 24;

function buildDiceSpec(request) {
  if (!Array.isArray(request.dice)) return [];
  return request.dice
    .filter((d) => d && typeof d.type === 'string')
    .slice(0, MAX_DICE)
    .map((d) => ({ type: d.type.slice(0, 16) }));
}

function randomSeed() {
  return Math.floor(Math.random() * 0x7fffffff);
}

// ---------------------------------------------------------------------------
// WebSockets
// ---------------------------------------------------------------------------
let nextPlayerId = 1;

wss.on('connection', (ws) => {
  ws.playerId = 'p' + nextPlayerId++;
  ws.playerName = 'Aventurero';
  ws.color = '#7cc23a';
  ws.sessionCode = null;

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (_) {
      return;
    }

    switch (msg.type) {
      case 'join': {
        const code = (msg.session || 'mesa-central').trim().toUpperCase();
        ws.playerName = (msg.name || 'Aventurero').slice(0, 24);
        // Identidad por NOMBRE dentro de la sala: el mismo nombre reclama la
        // misma hoja (entres desde el navegador que entres), evitando duplicados.
        ws.playerId = playerIdFromName(ws.playerName);
        ws.color = msg.color || ws.color;
        ws.culture = msg.culture || ws.culture || 'men';
        ws.sessionCode = code;

        const session = getSession(code);
        session.clients.add(ws);

        // El juego lo fija quien crea la sesion; los que entran despues lo heredan.
        if (!session.game) session.game = msg.game || 'tor';

        // Hoja de personaje propia (solo El Anillo Unico). Solo se muestran las
        // hojas de quienes estan conectados: se carga UNICAMENTE la del jugador
        // que entra (por su identidad de nombre); si no existe en Strapi, se crea
        // en blanco. No se persiste al entrar: solo con "Guardar personaje".
        let isNewSheet = false;
        if (session.game === 'tor' && !session.sheets.has(ws.playerId)) {
          // 1) por identidad de nombre; 2) compat: por nombre (hojas antiguas
          //    guardadas con otra identidad); 3) si nada, hoja en blanco.
          let sheet = await loadSheet(code, ws.playerId);
          if (!sheet) sheet = await loadSheetByName(code, ws.playerName);
          if (!sheet) {
            sheet = blankSheet(ws.playerId, ws.culture, ws.playerName);
            isNewSheet = true;
          } else {
            sheet.playerId = ws.playerId;          // adopta la identidad por nombre
            sheet.culture = sheet.culture || ws.culture;
            sheet.playerName = ws.playerName;
          }
          session.sheets.set(ws.playerId, sheet);
        }

        // Confirmar al jugador que entro, con su id, el juego y el historial
        ws.send(JSON.stringify({
          type: 'joined',
          playerId: ws.playerId,
          session: code,
          game: session.game,
          history: session.history.slice(-30),
          participants: participantsList(session),
          sheets: sheetsList(session),
          editing: editingObject(session),
        }));

        // Avisar a todos de la nueva lista de participantes
        broadcast(code, {
          type: 'participants',
          participants: participantsList(session),
          joined: { id: ws.playerId, name: ws.playerName },
        });

        // Si se creo una hoja nueva, avisar a los demas para que la muestren.
        if (isNewSheet) {
          broadcast(code, {
            type: 'sheetCreated',
            sheet: session.sheets.get(ws.playerId),
          }, ws);
        }
        break;
      }

      case 'updateProfile': {
        if (!ws.sessionCode) break;
        if (msg.name) ws.playerName = String(msg.name).slice(0, 24);
        if (msg.color) ws.color = msg.color;
        const session = getSession(ws.sessionCode);
        // Reflejar el nombre en la hoja (metadato de presentacion; se guarda
        // cuando el jugador pulse "Guardar personaje").
        const sheet = session.sheets.get(ws.playerId);
        if (sheet && msg.name) sheet.playerName = ws.playerName;
        broadcast(ws.sessionCode, {
          type: 'participants',
          participants: participantsList(session),
        });
        break;
      }

      case 'sheetEdit': {
        // Edicion de un campo de la PROPIA hoja. Se valida que el jugador solo
        // edite la suya, se aplica al estado en memoria y se retransmite. NO se
        // persiste aqui: la escritura en Strapi ocurre con sheetSave.
        if (!ws.sessionCode || typeof msg.field !== 'string') break;
        const session = getSession(ws.sessionCode);
        const sheet = session.sheets.get(ws.playerId);
        if (!sheet) break;
        sheet.data[msg.field] = msg.value;
        broadcast(ws.sessionCode, {
          type: 'sheetUpdate',
          playerId: ws.playerId,
          field: msg.field,
          value: msg.value,
        }, ws);
        break;
      }

      case 'sheetSave': {
        // Guardado EXPLICITO de la propia hoja en Strapi (boton "Guardar").
        if (!ws.sessionCode) break;
        const session = getSession(ws.sessionCode);
        const sheet = session.sheets.get(ws.playerId);
        if (!sheet) break;
        if (!persistenceEnabled) {
          ws.send(JSON.stringify({ type: 'sheetSaved', ok: false, reason: 'no-persistence' }));
          break;
        }
        const saved = await saveSheet(ws.sessionCode, ws.playerId, sheet);
        ws.send(JSON.stringify({
          type: 'sheetSaved',
          ok: !!saved,
          at: Date.now(),
          reason: saved ? null : 'strapi-error',
        }));
        break;
      }

      case 'sheetFocus':
      case 'sheetBlur': {
        // Presencia "estoy editando este campo". field se identifica como
        // "<playerId>:<fieldName>" para no colisionar entre hojas distintas.
        if (!ws.sessionCode || typeof msg.field !== 'string') break;
        const session = getSession(ws.sessionCode);
        if (msg.type === 'sheetFocus') {
          session.editing.set(msg.field, ws.playerId);
        } else if (session.editing.get(msg.field) === ws.playerId) {
          session.editing.delete(msg.field);
        }
        broadcast(ws.sessionCode, {
          type: 'sheetPresence',
          field: msg.field,
          playerId: msg.type === 'sheetFocus' ? ws.playerId : null,
        }, ws);
        break;
      }

      case 'roll': {
        if (!ws.sessionCode) break;
        const dice = buildDiceSpec(msg);
        if (dice.length === 0) break;

        const session = getSession(ws.sessionCode);

        const roll = {
          type: 'roll',
          rollId: 'r' + Date.now() + '-' + ws.playerId,
          roller: { id: ws.playerId, name: ws.playerName },
          game: session.game || 'tor',  // el juego es el de la sesion
          color: msg.color || ws.color,
          seed: randomSeed(),
          dice,             // solo tipos; el resultado lo calcula la fisica
          results: null,    // se rellena cuando un cliente reporta 'rollResult'
          summary: null,
          at: Date.now(),
        };

        session.history.push(roll);
        if (session.history.length > 100) session.history.shift();

        broadcast(ws.sessionCode, roll);
        break;
      }

      case 'rollResult': {
        // El primer cliente que termina la simulacion fija el resultado oficial
        // para el historial; los demas reportes (identicos) se ignoran.
        if (!ws.sessionCode || !msg.rollId) break;
        const session = sessions.get(ws.sessionCode);
        if (!session) break;
        const roll = session.history.find((r) => r.rollId === msg.rollId);
        if (roll && !roll.results) {
          roll.results = msg.results;
          roll.summary = msg.summary;
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!ws.sessionCode) return;
    const session = sessions.get(ws.sessionCode);
    if (!session) return;
    const code = ws.sessionCode;
    session.clients.delete(ws);

    // Liberar los campos que este jugador tenia en edicion y avisar a los demas.
    for (const [field, pid] of [...session.editing]) {
      if (pid === ws.playerId) {
        session.editing.delete(field);
        broadcast(code, { type: 'sheetPresence', field, playerId: null });
      }
    }

    // Si no queda ninguna otra conexion de este jugador (mismo nombre), su hoja
    // deja de mostrarse a los demas (queda guardada en Strapi para su regreso).
    const stillConnected = [...session.clients].some((c) => c.playerId === ws.playerId);
    if (!stillConnected && session.sheets.has(ws.playerId)) {
      session.sheets.delete(ws.playerId);
      broadcast(code, { type: 'sheetRemoved', playerId: ws.playerId });
    }

    if (session.clients.size === 0) {
      // Sin auto-guardado: la sesion se descarta de memoria. Lo guardado en
      // Strapi (via "Guardar personaje") se recupera al volver a entrar.
      sessions.delete(code);
    } else {
      broadcast(code, {
        type: 'participants',
        participants: participantsList(session),
        left: { id: ws.playerId, name: ws.playerName },
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n  ⚔  Dados de El Anillo Unico`);
  console.log(`  ➜  http://localhost:${PORT}`);
  console.log(`  📜  Hojas: ${persistenceEnabled ? 'persistidas en Strapi' : 'solo memoria (sin STRAPI_URL/TOKEN)'}\n`);
});

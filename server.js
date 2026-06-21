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
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Estado en memoria de las sesiones
// ---------------------------------------------------------------------------
/** @type {Map<string, { clients: Set<any>, history: any[], game: string }>} */
const sessions = new Map();

function getSession(code) {
  let s = sessions.get(code);
  if (!s) {
    s = { clients: new Set(), history: [], game: null };
    sessions.set(code, s);
  }
  return s;
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
  return [...session.clients].map((c) => ({
    id: c.playerId,
    name: c.playerName,
    color: c.color,
  }));
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

  ws.on('message', (raw) => {
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
        ws.color = msg.color || ws.color;
        ws.sessionCode = code;

        const session = getSession(code);
        session.clients.add(ws);

        // El juego lo fija quien crea la sesion; los que entran despues lo heredan.
        if (!session.game) session.game = msg.game || 'tor';

        // Confirmar al jugador que entro, con su id, el juego y el historial
        ws.send(JSON.stringify({
          type: 'joined',
          playerId: ws.playerId,
          session: code,
          game: session.game,
          history: session.history.slice(-30),
          participants: participantsList(session),
        }));

        // Avisar a todos de la nueva lista de participantes
        broadcast(code, {
          type: 'participants',
          participants: participantsList(session),
          joined: { id: ws.playerId, name: ws.playerName },
        });
        break;
      }

      case 'updateProfile': {
        if (!ws.sessionCode) break;
        if (msg.name) ws.playerName = String(msg.name).slice(0, 24);
        if (msg.color) ws.color = msg.color;
        broadcast(ws.sessionCode, {
          type: 'participants',
          participants: participantsList(getSession(ws.sessionCode)),
        });
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
    session.clients.delete(ws);
    if (session.clients.size === 0) {
      sessions.delete(ws.sessionCode);
    } else {
      broadcast(ws.sessionCode, {
        type: 'participants',
        participants: participantsList(session),
        left: { id: ws.playerId, name: ws.playerName },
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n  ⚔  Dados de El Anillo Unico`);
  console.log(`  ➜  http://localhost:${PORT}\n`);
});

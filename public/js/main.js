/**
 * Punto de entrada del cliente: enlaza la escena 3D, la red y la interfaz.
 *
 * El juego activo (El Anillo Unico, HeroQuest, ...) lo elige el jugador en el
 * lobby, pero es compartido por sesion: el servidor lo fija al crearla y lo
 * devuelve en 'joined'. A partir de ahi, los controles de dados, el resumen de
 * la tirada y el registro se construyen segun la definicion de ese juego.
 */

import { DiceScene } from './scene.js';
import { Network } from './network.js';
import { listGames, getGame, DEFAULT_GAME } from './games.js';

const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------------------
// Estado local del jugador
// ---------------------------------------------------------------------------
const state = {
  name: localStorage.getItem('tor.name') || '',
  color: localStorage.getItem('tor.color') || '#7cc23a',
  game: localStorage.getItem('tor.game') || DEFAULT_GAME,
  session: '',
  counts: {},        // cantidad elegida por tipo de dado del juego activo
  joined: false,
};

let currentGame = getGame(state.game);   // juego activo (autoritativo tras 'joined')

const scene = new DiceScene($('#scene'));
const net = new Network();

// ---------------------------------------------------------------------------
// Lobby (entrar a una sesion)
// ---------------------------------------------------------------------------
const lobby = $('#lobby');
const nameInput = $('#name-input');
const sessionInput = $('#session-input');
const colorInput = $('#color-input');

nameInput.value = state.name;
colorInput.value = state.color;
// Sugerir codigo de sesion desde la URL (?s=CODIGO) o uno aleatorio
const urlSession = new URLSearchParams(location.search).get('s');
sessionInput.value = (urlSession || '').toUpperCase();

// Tarjetas de seleccion de juego
function renderGameCards() {
  const wrap = $('#game-select');
  wrap.innerHTML = '';
  listGames().forEach((game) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'game-card' + (game.id === state.game ? ' selected' : '');
    card.dataset.game = game.id;
    card.innerHTML =
      `<span class="game-icon">${game.icon}</span>` +
      `<span class="game-name">${game.name}</span>` +
      `<span class="game-tag">${game.tagline}</span>`;
    card.addEventListener('click', () => {
      state.game = game.id;
      localStorage.setItem('tor.game', game.id);
      renderGameCards();
    });
    wrap.appendChild(card);
  });
}
renderGameCards();

$('#random-session').addEventListener('click', () => {
  const code = Math.random().toString(36).slice(2, 7).toUpperCase();
  sessionInput.value = code;
});

$('#join-btn').addEventListener('click', joinSession);
[nameInput, sessionInput].forEach((el) =>
  el.addEventListener('keydown', (e) => e.key === 'Enter' && joinSession())
);

function joinSession() {
  const name = nameInput.value.trim() || 'Aventurero';
  const session = (sessionInput.value.trim() || 'MESA').toUpperCase();
  state.name = name;
  state.session = session;
  state.color = colorInput.value;
  localStorage.setItem('tor.name', name);
  localStorage.setItem('tor.color', state.color);

  net.join(session, name, state.color, state.game);
  lobby.classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#session-code').textContent = session;
  scene._onResize();
}

// ---------------------------------------------------------------------------
// Controles de tirada (se generan segun el juego activo)
// ---------------------------------------------------------------------------
const tableColor = $('#table-color');
tableColor.value = state.color;
const diceControls = $('#dice-controls');

function applyGame(game) {
  currentGame = game;
  $('#brand').textContent = `${game.icon} ${game.name}`;
  buildDiceControls(game);
}

function buildDiceControls(game) {
  diceControls.innerHTML = '';
  state.counts = {};
  for (const def of game.dice) {
    state.counts[def.type] = def.default;
    const ctrl = document.createElement('div');
    ctrl.className = 'dice-control';
    ctrl.innerHTML =
      `<span class="dice-label">${def.label} <em>${def.sub}</em></span>` +
      `<div class="stepper">` +
      `<button data-step="-1" data-target="${def.type}">−</button>` +
      `<span class="count" id="count-${def.type}">${def.default}</span>` +
      `<button data-step="1" data-target="${def.type}">+</button>` +
      `</div>`;
    diceControls.appendChild(ctrl);
  }
}

// Delegacion: un solo listener para todos los steppers, sea cual sea el juego
diceControls.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-step]');
  if (!btn) return;
  const type = btn.dataset.target;
  const step = parseInt(btn.dataset.step, 10);
  const def = currentGame.dice.find((d) => d.type === type);
  if (!def) return;
  state.counts[type] = clamp((state.counts[type] || 0) + step, def.min, def.max);
  $(`#count-${type}`).textContent = state.counts[type];
});

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

tableColor.addEventListener('input', () => {
  state.color = tableColor.value;
  colorInput.value = state.color;
  localStorage.setItem('tor.color', state.color);
  scene.setColor(state.color);          // recolorea los dados en mesa al instante
  net.updateProfile(state.name, state.color);
});

$('#roll-btn').addEventListener('click', () => {
  scene.audio.resume(); // habilita el audio tras el gesto del usuario
  const dice = [];
  for (const def of currentGame.dice) {
    const n = state.counts[def.type] || 0;
    for (let i = 0; i < n; i++) dice.push({ type: def.type });
  }
  if (dice.length === 0) {
    flashHint('Anade al menos un dado para tirar.');
    return;
  }
  net.roll(currentGame.id, dice, state.color);
});

function flashHint(text) {
  const hint = $('#hint');
  hint.textContent = text;
  hint.classList.add('show');
  setTimeout(() => hint.classList.remove('show'), 1800);
}

// ---------------------------------------------------------------------------
// Eventos de red
// ---------------------------------------------------------------------------
net.on('status', ({ online }) => {
  const dot = $('#conn-status');
  dot.classList.toggle('online', online);
  dot.title = online ? 'Conectado' : 'Reconectando...';
});

net.on('joined', (msg) => {
  state.joined = true;

  // El juego es el de la sesion (puede diferir del elegido si ya existia).
  const sessionGame = getGame(msg.game);
  if (msg.game && msg.game !== state.game) {
    flashHint(`Esta mesa juega a ${sessionGame.name}`);
  }
  state.game = sessionGame.id;
  applyGame(sessionGame);

  renderParticipants(msg.participants);
  // Registrar tiradas pasadas (las que ya tienen resultado calculado)
  if (msg.history && msg.history.length) {
    for (const h of msg.history) {
      if (h.results) addLogEntry(h, h.results, h.summary);
    }
    // Reproducir visualmente la ultima, sin volver a anunciarla ni registrarla
    const last = msg.history[msg.history.length - 1];
    scene.playRoll(last, { silent: true });
  }
});

net.on('participants', (msg) => {
  renderParticipants(msg.participants);
  if (msg.joined && msg.joined.id !== net.playerId) {
    flashHint(`${msg.joined.name} se unio a la mesa`);
  }
});

// El servidor solo manda semilla + tipos de dado; el resultado lo decide la
// fisica. Guardamos la tirada en curso y esperamos a que los dados se detengan.
let currentRoll = null;
net.on('roll', (roll) => {
  currentRoll = roll;
  scene.playRoll(roll);
});

// Cuando los dados se detienen, leemos el resultado de la fisica y lo mostramos.
scene.onSettled = (results) => {
  if (!currentRoll) return;
  const summary = currentGame.summarize(results);
  announceRoll(currentRoll.roller, summary);
  addLogEntry(currentRoll, results, summary);
  net.sendResult(currentRoll.rollId, results, summary); // el servidor guarda el 1.º
};

// ---------------------------------------------------------------------------
// Render de participantes, anuncio y registro
// ---------------------------------------------------------------------------
function renderParticipants(list) {
  const el = $('#participants');
  el.innerHTML = '';
  list.forEach((p) => {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'pdot';
    dot.style.background = p.color || '#7cc23a';
    li.appendChild(dot);
    li.appendChild(document.createTextNode(p.name));
    if (p.id === net.playerId) li.classList.add('me');
    el.appendChild(li);
  });
  $('#player-count').textContent = list.length;
}

function announceRoll(roller, summary) {
  const banner = $('#result-banner');
  const parts = [`<strong>${roller.name}</strong> saca:`, `<span class="big">${summary.headline}</span>`];
  const tags = summary.tags.map((t) => `<span class="tag ${t.kind}">${t.text}</span>`);
  banner.innerHTML = parts.join(' ') + ' ' + tags.join(' ');
  banner.classList.remove('pop');
  void banner.offsetWidth; // reinicia la animacion
  banner.classList.add('pop');
}

function addLogEntry(rollMeta, results, summary) {
  const log = $('#roll-log');
  const li = document.createElement('li');
  const game = getGame(rollMeta.game);
  const dice = results.map((d) => game.describeDie(d)).join(', ');
  const time = new Date(rollMeta.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  li.innerHTML =
    `<span class="log-dot" style="background:${rollMeta.color}"></span>` +
    `<span class="log-name">${rollMeta.roller.name}</span> ` +
    `<span class="log-dice">${dice}</span> ` +
    `<span class="log-total">${summary.logTotal}</span> ` +
    `<span class="log-time">${time}</span>`;
  log.prepend(li);
  while (log.children.length > 40) log.removeChild(log.lastChild);
}

// ---------------------------------------------------------------------------
// Compartir enlace de sesion
// ---------------------------------------------------------------------------
$('#share-btn').addEventListener('click', async () => {
  const url = `${location.origin}/?s=${encodeURIComponent(state.session)}`;
  try {
    await navigator.clipboard.writeText(url);
    flashHint('Enlace copiado al portapapeles');
  } catch (_) {
    flashHint(url);
  }
});

// Arrancar conexion
net.connect();

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
import { SheetView } from './sheet.js';
import { CULTURES, DEFAULT_CULTURE } from './sheet-schema.js';
import { MusicPlayer } from './music.js';

const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------------------
// Estado local del jugador
// ---------------------------------------------------------------------------
const state = {
  name: localStorage.getItem('tor.name') || '',
  color: localStorage.getItem('tor.color') || '#7cc23a',
  game: localStorage.getItem('tor.game') || DEFAULT_GAME,
  culture: localStorage.getItem('tor.culture') || DEFAULT_CULTURE,
  session: '',
  counts: {},        // cantidad elegida por tipo de dado del juego activo
  joined: false,
};

// Identidad estable del cliente (para recuperar la misma hoja tras recargar)
let clientId = localStorage.getItem('tor.clientId');
if (!clientId) {
  clientId = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());
  localStorage.setItem('tor.clientId', clientId);
}

// Hojas de personaje vivas en la sesion: playerId -> SheetView
const sheetViews = new Map();
// Color de cada participante por id (para indicadores de presencia)
const participantColors = new Map();
const colorFor = (id) => participantColors.get(id) || '#7cc23a';

let currentGame = getGame(state.game);   // juego activo (autoritativo tras 'joined')

const scene = new DiceScene($('#scene'));
const net = new Network();
const music = new MusicPlayer();

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
      updateCultureVisibility();
    });
    wrap.appendChild(card);
  });
}
renderGameCards();

// Selector de cultura heroica (solo El Anillo Único)
function renderCultureCards() {
  const wrap = $('#culture-select');
  wrap.innerHTML = '';
  Object.values(CULTURES).forEach((c) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'game-card' + (c.id === state.culture ? ' selected' : '');
    card.dataset.culture = c.id;
    card.innerHTML = `<span class="game-name">${c.name}</span>`;
    card.addEventListener('click', () => {
      state.culture = c.id;
      localStorage.setItem('tor.culture', c.id);
      renderCultureCards();
    });
    wrap.appendChild(card);
  });
}
function updateCultureVisibility() {
  $('#culture-block').classList.toggle('hidden', state.game !== 'tor');
}
renderCultureCards();
updateCultureVisibility();

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

  // Arranca la música del juego elegido AQUÍ (dentro del gesto de clic, para
  // que el navegador permita el audio). Si la sesión resulta ser de otro juego,
  // applyGame() cambiará la lista después.
  music.setPlaylist(getGame(state.game).music);
  music.start();

  net.join(session, name, state.color, state.game, state.culture, clientId);
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
  // Música propia del juego de la sesión (si ya estaba sonando, sigue; si la
  // lista es distinta, cambia de banda sonora).
  music.setPlaylist(game.music || []);
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

  // Hojas de personaje (solo El Anillo Único)
  if (sessionGame.id === 'tor') {
    initSheets(msg.sheets || [], msg.editing || {});
  } else {
    teardownSheets();
  }
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
// Hojas de personaje colaborativas (El Anillo Único)
// ---------------------------------------------------------------------------
const sheetsLayer = $('#sheets-layer');
const sheetsMine = $('#sheets-mine');
const sheetsOthers = $('#sheets-others');
const sheetsToggle = $('#sheets-toggle');

function initSheets(sheets, editing) {
  teardownSheets();
  sheets.forEach((sheet) => addSheet(sheet));
  // Aplicar la presencia inicial (quién edita qué campo)
  for (const [field, playerId] of Object.entries(editing)) {
    applyPresence(field, playerId);
  }
  sheetsToggle.classList.remove('hidden');
  sheetsLayer.classList.remove('hidden');
}

function teardownSheets() {
  sheetViews.clear();
  sheetsMine.innerHTML = '';
  sheetsOthers.innerHTML = '';
  sheetsToggle.classList.add('hidden');
  sheetsLayer.classList.add('hidden');
}

function addSheet(sheet) {
  if (sheetViews.has(sheet.playerId)) return;
  const isOwner = sheet.playerId === net.playerId;
  const view = new SheetView({
    sheet,
    isOwner,
    colorFor,
    onEdit: (field, value) => net.sheetEdit(field, value),
    onFocus: (field) => net.sheetFocus(`${sheet.playerId}:${field}`),
    onBlur: (field) => net.sheetBlur(`${sheet.playerId}:${field}`),
    onSave: () => net.sheetSave(),
  });
  sheetViews.set(sheet.playerId, view);
  if (isOwner) {
    sheetsMine.appendChild(view.root);
  } else {
    view.root.classList.add('compact');
    sheetsOthers.appendChild(view.root);
  }
}

// El campo de presencia viene como "<playerId>:<fieldKey>"
function applyPresence(field, playerId) {
  const sep = field.indexOf(':');
  if (sep < 0) return;
  const ownerId = field.slice(0, sep);
  const key = field.slice(sep + 1);
  const view = sheetViews.get(ownerId);
  if (view) view.setPresence(key, playerId);
}

sheetsToggle.addEventListener('click', () => {
  sheetsLayer.classList.toggle('hidden');
});

// Paneles Compañía / Tiradas plegables (clic en su título). Al plegarlos, la
// capa de hojas recupera ese espacio lateral.
function wirePanelCollapse(panelSel, appClass) {
  const panel = $(panelSel);
  if (!panel) return;
  const h2 = panel.querySelector('h2');
  h2.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('collapsed');
    $('#app').classList.toggle(appClass, collapsed);
  });
}
wirePanelCollapse('.participants-panel', 'panels-left-collapsed');
wirePanelCollapse('.log-panel', 'panels-right-collapsed');

// En móvil, los paneles arrancan plegados para no tapar las hojas (se pueden
// abrir tocando su título).
if (window.matchMedia('(max-width: 768px)').matches) {
  $('.participants-panel')?.classList.add('collapsed');
  $('.log-panel')?.classList.add('collapsed');
  $('#app').classList.add('panels-left-collapsed', 'panels-right-collapsed');
}

net.on('sheetCreated', (msg) => {
  if (msg.sheet) addSheet(msg.sheet);
});

net.on('sheetUpdate', (msg) => {
  const view = sheetViews.get(msg.playerId);
  if (view) view.applyUpdate(msg.field, msg.value);
});

net.on('sheetPresence', (msg) => {
  applyPresence(msg.field, msg.playerId);
});

// Confirmacion del guardado explicito (solo llega al dueño de la hoja)
net.on('sheetSaved', (msg) => {
  const view = sheetViews.get(net.playerId);
  if (!view) return;
  if (msg.ok) {
    const t = new Date(msg.at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    view.setSaveStatus('ok', t);
  } else {
    view.setSaveStatus(msg.reason === 'no-persistence' ? 'no-persistence' : 'error');
  }
});

// ---------------------------------------------------------------------------
// Render de participantes, anuncio y registro
// ---------------------------------------------------------------------------
function renderParticipants(list) {
  const el = $('#participants');
  el.innerHTML = '';
  participantColors.clear();
  list.forEach((p) => {
    participantColors.set(p.id, p.color || '#7cc23a');
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

// ---------------------------------------------------------------------------
// Controles de música ambiente
// ---------------------------------------------------------------------------
const musicToggle = $('#music-toggle');
const musicVol = $('#music-vol');
musicVol.value = music.volume;

function renderMusicToggle() {
  musicToggle.textContent = music.enabled ? '🔊' : '🔇';
  musicToggle.classList.toggle('off', !music.enabled);
}
renderMusicToggle();

musicToggle.addEventListener('click', () => {
  music.toggle();           // also cuenta como gesto de usuario (desbloquea audio)
  renderMusicToggle();
});
musicVol.addEventListener('input', () => music.setVolume(parseFloat(musicVol.value)));

// Arrancar conexion
net.connect();

/**
 * Punto de entrada del cliente: enlaza la escena 3D, la red y la interfaz.
 */

import { DiceScene } from './scene.js';
import { Network } from './network.js';

const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------------------
// Estado local del jugador
// ---------------------------------------------------------------------------
const state = {
  name: localStorage.getItem('tor.name') || '',
  color: localStorage.getItem('tor.color') || '#7cc23a',
  session: '',
  numD6: 2,
  numD12: 1,
  joined: false,
};

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

  net.join(session, name, state.color);
  lobby.classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#session-code').textContent = session;
  syncControls();
  scene._onResize();
}

// ---------------------------------------------------------------------------
// Controles de tirada
// ---------------------------------------------------------------------------
const d6Count = $('#d6-count');
const d12Count = $('#d12-count');
const tableColor = $('#table-color');
tableColor.value = state.color;

function syncControls() {
  d6Count.textContent = state.numD6;
  d12Count.textContent = state.numD12;
}

document.querySelectorAll('[data-step]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target;
    const step = parseInt(btn.dataset.step, 10);
    if (target === 'd6') state.numD6 = clamp(state.numD6 + step, 0, 20);
    else state.numD12 = clamp(state.numD12 + step, 0, 6);
    syncControls();
  });
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
  if (state.numD6 === 0 && state.numD12 === 0) {
    flashHint('Anade al menos un dado para tirar.');
    return;
  }
  net.roll(state.numD6, state.numD12, state.color);
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
  const summary = summarize(results);
  announceRoll(currentRoll.roller, summary);
  addLogEntry(currentRoll, results, summary);
  net.sendResult(currentRoll.rollId, results, summary); // el servidor guarda el 1.º
};

function summarize(results) {
  let total = 0, eyes = 0, gandalf = false;
  for (const d of results) {
    if (d.special === 'eye') eyes++;
    else if (d.special === 'gandalf') gandalf = true;
    else total += d.value; // d6 (incluido el 6) y d12 de 1..10
  }
  return { total, eyes, gandalf, count: results.length };
}

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

function describeDie(d) {
  if (d.special === 'gandalf') return '✦ Runa de Gandalf';
  if (d.special === 'eye') return '◉ Ojo de Sauron';
  if (d.special === 'tengwar') return '6 ᚷ';
  return d.label;
}

function announceRoll(roller, s) {
  const banner = $('#result-banner');
  const parts = [`<strong>${roller.name}</strong> saca:`, `<span class="big">${s.total}</span>`];
  const tags = [];
  if (s.gandalf) tags.push('<span class="tag gandalf">¡Runa de Gandalf!</span>');
  if (s.eyes > 0) tags.push(`<span class="tag eye">${s.eyes} Ojo(s) de Sauron</span>`);
  banner.innerHTML = parts.join(' ') + ' ' + tags.join(' ');
  banner.classList.remove('pop');
  void banner.offsetWidth; // reinicia la animacion
  banner.classList.add('pop');
}

function addLogEntry(rollMeta, results, summary) {
  const log = $('#roll-log');
  const li = document.createElement('li');
  const dice = results.map(describeDie).join(', ');
  const time = new Date(rollMeta.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  li.innerHTML =
    `<span class="log-dot" style="background:${rollMeta.color}"></span>` +
    `<span class="log-name">${rollMeta.roller.name}</span> ` +
    `<span class="log-dice">${dice}</span> ` +
    `<span class="log-total">= ${summary.total}</span> ` +
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
syncControls();

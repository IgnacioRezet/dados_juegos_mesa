/**
 * Cliente WebSocket: conexion, reconexion y despacho de mensajes de la sesion.
 */

export class Network {
  constructor() {
    this.ws = null;
    this.handlers = {};
    this.playerId = null;
    this._pending = null; // mensaje 'join' a reenviar tras reconectar
  }

  on(type, fn) {
    this.handlers[type] = fn;
    return this;
  }

  _emit(type, payload) {
    if (this.handlers[type]) this.handlers[type](payload);
  }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}`);

    this.ws.addEventListener('open', () => {
      this._emit('status', { online: true });
      if (this._pending) this.send(this._pending);
    });

    this.ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (_) {
        return;
      }
      if (msg.type === 'joined') this.playerId = msg.playerId;
      this._emit(msg.type, msg);
    });

    this.ws.addEventListener('close', () => {
      this._emit('status', { online: false });
      setTimeout(() => this.connect(), 1500); // reconexion automatica
    });

    this.ws.addEventListener('error', () => this.ws.close());
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  join(session, name, color, game) {
    this._pending = { type: 'join', session, name, color, game };
    this.send(this._pending);
  }

  // dice: lista expandida de tipos, p.ej. [{type:'d6'}, {type:'d12'}]
  roll(game, dice, color) {
    this.send({ type: 'roll', game, dice, color });
  }

  sendResult(rollId, results, summary) {
    this.send({ type: 'rollResult', rollId, results, summary });
  }

  updateProfile(name, color) {
    this.send({ type: 'updateProfile', name, color });
  }
}

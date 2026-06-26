/**
 * Reproductor de musica ambiente por juego.
 *
 * - Cada juego declara su lista de pistas en `games.js` (`music: [...]`).
 * - La reproduccion DEBE arrancar tras un gesto del usuario (el navegador
 *   bloquea el autoplay con sonido): se llama a `start()` desde el clic de
 *   "Entrar a la mesa".
 * - Reproduce la lista en bucle (al terminar una pista pasa a la siguiente y
 *   vuelve al principio). Volumen y silencio se recuerdan en localStorage.
 */
export class MusicPlayer {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'none';
    this.playlist = [];
    this.index = 0;
    this._wantPlay = false;       // el usuario ya dio el gesto para sonar

    this.enabled = localStorage.getItem('tor.music') !== 'off';
    const v = parseFloat(localStorage.getItem('tor.musicVol'));
    this.volume = Number.isFinite(v) ? v : 0.3;   // ambiente bajito por defecto
    this.audio.volume = this.volume;

    this.audio.addEventListener('ended', () => this._next());
  }

  /** Cambia la lista de pistas (p. ej. al fijar el juego de la sesion). */
  setPlaylist(list) {
    const next = Array.isArray(list) ? list.filter(Boolean) : [];
    if (next.join('|') === this.playlist.join('|')) return; // misma lista: no reiniciar
    this.playlist = next;
    this.index = 0;
    this._load();
    if (this._wantPlay && this.enabled) this._play();
  }

  _load() {
    if (!this.playlist.length) {
      this.audio.removeAttribute('src');
      return;
    }
    // encodeURI respeta las barras y codifica espacios/caracteres del nombre.
    this.audio.src = encodeURI(this.playlist[this.index % this.playlist.length]);
  }

  _next() {
    if (!this.playlist.length) return;
    this.index = (this.index + 1) % this.playlist.length;
    this._load();
    if (this.enabled) this._play();
  }

  _play() {
    if (!this.playlist.length) return;
    const p = this.audio.play();
    if (p && p.catch) p.catch(() => {}); // ignora el bloqueo de autoplay
  }

  /** Llamar desde un gesto del usuario (clic) para desbloquear el audio. */
  start() {
    this._wantPlay = true;
    if (this.enabled) this._play();
  }

  setEnabled(on) {
    this.enabled = !!on;
    localStorage.setItem('tor.music', this.enabled ? 'on' : 'off');
    if (this.enabled) { this._wantPlay = true; this._play(); }
    else this.audio.pause();
    return this.enabled;
  }

  toggle() { return this.setEnabled(!this.enabled); }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    this.audio.volume = this.volume;
    localStorage.setItem('tor.musicVol', String(this.volume));
  }
}

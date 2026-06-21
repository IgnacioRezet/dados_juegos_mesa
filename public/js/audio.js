/**
 * Sonidos de dados sintetizados con Web Audio (sin archivos externos).
 * Cada golpe es una breve rafaga de ruido filtrado + un "thud" grave, con el
 * volumen proporcional a la fuerza del impacto. El AudioContext se crea/reanuda
 * tras el primer gesto del usuario (el click de tirar).
 */

export class DiceAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.lastPlay = 0;
    this.buffer = null;
  }

  /** Debe llamarse desde un gesto del usuario (click) para habilitar el audio. */
  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this._buildNoiseBuffer();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _buildNoiseBuffer() {
    const len = Math.floor(this.ctx.sampleRate * 0.2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.buffer = buf;
  }

  /**
   * Reproduce un golpe de dado.
   * @param {number} strength 0..1 segun la velocidad del impacto.
   * @param {boolean} heavy  true para el d12 (tono mas grave).
   */
  clack(strength = 0.6, heavy = false) {
    if (!this.enabled || !this.ctx || !this.buffer) return;
    const now = this.ctx.currentTime;
    // Evita saturacion: limita la cadencia de golpes
    if (now - this.lastPlay < 0.012) return;
    this.lastPlay = now;

    const vol = Math.min(0.5, 0.08 + strength * 0.45);

    // Componente de "click" (ruido por banda)
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = heavy ? 900 + Math.random() * 300 : 1600 + Math.random() * 700;
    bp.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0008, now + (heavy ? 0.14 : 0.08));
    src.connect(bp).connect(g).connect(this.ctx.destination);
    src.start(now);
    src.stop(now + 0.2);

    // Componente grave (cuerpo del dado golpeando la mesa)
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(heavy ? 150 : 230, now);
    osc.frequency.exponentialRampToValueAtTime(heavy ? 70 : 110, now + 0.09);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(vol * 0.7, now);
    og.gain.exponentialRampToValueAtTime(0.0008, now + 0.1);
    osc.connect(og).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  setEnabled(on) {
    this.enabled = on;
  }
}

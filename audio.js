// Web Audio: все звуки — осцилляторы, без файлов.
// Контекст создаётся лениво после первого жеста пользователя.

const MASTER_VOLUME = 0.15;
const MUTE_KEY = 'chalk_muted';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.lastPaint = 0;

    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }

    // Первый клик/нажатие снимает блокировку браузера.
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock, { passive: true });
  }

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch {
      this.ctx = null;
      this.master = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      /* localStorage может быть недоступен */
    }
    if (this.master) {
      try {
        this.master.gain.setTargetAtTime(
          this.muted ? 0 : MASTER_VOLUME,
          this.ctx.currentTime,
          0.02
        );
      } catch {
        this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
      }
    }
    return this.muted;
  }

  _tone({ type = 'sine', from, to = from, dur, vol = 0.3, delay = 0 }) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, from), t0);
    if (to !== from) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    }
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  play(name) {
    if (this.muted) return;
    try {
      this.unlock();
      if (!this.ctx) return;

      switch (name) {
        case 'jump':
          this._tone({ type: 'sine', from: 300, to: 600, dur: 0.12, vol: 0.34 });
          break;
        case 'land':
          this._tone({ type: 'square', from: 120, dur: 0.08, vol: 0.14 });
          break;
        case 'paint': {
          const now = performance.now();
          if (now - this.lastPaint < 60) return;
          this.lastPaint = now;
          this._tone({ type: 'triangle', from: 800, dur: 0.035, vol: 0.09 });
          break;
        }
        case 'collect':
          this._tone({ type: 'sine', from: 660, dur: 0.075, vol: 0.3 });
          this._tone({ type: 'sine', from: 990, dur: 0.085, vol: 0.3, delay: 0.075 });
          break;
        case 'win': {
          const notes = [523, 659, 784, 1047];
          notes.forEach((f, i) => {
            this._tone({
              type: 'sine',
              from: f,
              dur: 0.1,
              vol: 0.3,
              delay: i * 0.1,
            });
          });
          break;
        }
        case 'lose':
          this._tone({ type: 'sine', from: 400, to: 120, dur: 0.4, vol: 0.3 });
          break;
        case 'hit':
          this._tone({ type: 'square', from: 240, to: 90, dur: 0.22, vol: 0.26 });
          this._tone({ type: 'sine', from: 180, to: 70, dur: 0.3, vol: 0.2, delay: 0.02 });
          break;
        case 'puzzle': {
          const notes = [659, 784, 1047];
          notes.forEach((f, i) => {
            this._tone({
              type: 'triangle',
              from: f,
              dur: 0.16,
              vol: 0.28,
              delay: i * 0.08,
            });
          });
          break;
        }
        case 'ui':
          this._tone({ type: 'sine', from: 540, dur: 0.05, vol: 0.16 });
          break;
        case 'page':
          this._tone({ type: 'triangle', from: 320, to: 520, dur: 0.24, vol: 0.18 });
          break;
        case 'shoot':
          this._tone({ type: 'square', from: 230, to: 90, dur: 0.13, vol: 0.18 });
          this._tone({ type: 'triangle', from: 720, to: 240, dur: 0.09, vol: 0.1 });
          break;
        case 'block': {
          const now = performance.now();
          if (now - (this.lastBlock || 0) < 45) return;
          this.lastBlock = now;
          this._tone({ type: 'triangle', from: 980, to: 340, dur: 0.07, vol: 0.12 });
          break;
        }
        case 'gate': {
          const notes = [196, 294, 392];
          notes.forEach((f, i) => {
            this._tone({
              type: 'sine',
              from: f,
              dur: 0.28,
              vol: 0.18,
              delay: i * 0.06,
            });
          });
          break;
        }
        default:
          break;
      }
    } catch {
      /* звук не должен ломать игру */
    }
  }
}

// Лазеры «МЕЛОК: Ночной Вернисаж».
//
// Один цикл: нагрев (0.8 с) → выстрел (1.2 с) → пауза (1.0 с).
// Пока идёт выстрел, луч яркий и наносит урон. В нагрев и паузу
// урона нет: в нагрев виден только пунктирный прицел, в паузу — лишь
// потухшие линзы. Соседние лазеры получают разный phaseOffset.

export const LASER_CHARGE = 0.8;
export const LASER_FIRE = 1.2;
export const LASER_PAUSE = 1.0;
export const LASER_CYCLE = LASER_CHARGE + LASER_FIRE + LASER_PAUSE;

const CORE = '#ff2a2a';
const AURA = 'rgba(255, 42, 42, 0.28)';
const AIM = 'rgba(255, 77, 77, 0.4)';

export class Laser {
  constructor(opts = {}) {
    this.id = opts.id || 'laser';
    this.x = opts.x || 0;
    this.y = opts.y || 0;
    this.w = opts.w || 7;
    this.h = opts.h || 7;
    this.phaseOffset = opts.phaseOffset || 0;
    this.onCharge = opts.onCharge || null;
    this.onFire = opts.onFire || null;

    this.time = 0;
    this.phase = this._phaseAt(0);
    this.seed = (this.x * 0.37 + this.y * 0.11) % (Math.PI * 2);
  }

  get cx() {
    return this.x + this.w / 2;
  }

  get cy() {
    return this.y + this.h / 2;
  }

  get horizontal() {
    return this.w >= this.h;
  }

  get rect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  _phaseAt(time) {
    const t =
      (((time + this.phaseOffset) % LASER_CYCLE) + LASER_CYCLE) %
      LASER_CYCLE;
    if (t < LASER_CHARGE) return 'charge';
    if (t < LASER_CHARGE + LASER_FIRE) return 'fire';
    return 'pause';
  }

  reset() {
    this.time = 0;
    this.phase = this._phaseAt(0);
  }

  // Возвращает новую фазу, если она сменилась, иначе null.
  // Звук включается только в момент входа в «нагрев» или «выстрел».
  update(dt) {
    if (!(dt > 0)) return null;
    this.time += dt;
    const next = this._phaseAt(this.time);
    const prev = this.phase;
    this.phase = next;
    if (next === prev) return null;
    if (next === 'charge' && this.onCharge) this.onCharge(this);
    if (next === 'fire' && this.onFire) this.onFire(this);
    return next;
  }

  isActive() {
    return this.phase === 'fire';
  }

  isWarning() {
    return this.phase === 'charge';
  }

  _ends() {
    if (this.horizontal) {
      return [
        { x: this.x, y: this.y + this.h / 2 },
        { x: this.x + this.w, y: this.y + this.h / 2 },
      ];
    }
    return [
      { x: this.x + this.w / 2, y: this.y },
      { x: this.x + this.w / 2, y: this.y + this.h },
    ];
  }

  _drawLens(ctx, px, py) {
    // Тёмное гнездо-излучатель и цветная линза r=5.
    ctx.fillStyle = '#11151f';
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fill();

    let color;
    if (this.phase === 'fire') {
      const pulse = 0.82 + 0.18 * Math.sin(this.time * 24 + this.seed);
      color = `rgba(255, 58, 58, ${pulse})`;
    } else if (this.phase === 'charge') {
      const pulse = 0.42 + 0.38 * (0.5 + 0.5 * Math.sin(this.time * 15 + this.seed));
      color = `rgba(255, 58, 58, ${pulse})`;
    } else {
      color = '#575e6c';
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  render(ctx) {
    const [a, b] = this._ends();
    const horizontal = this.horizontal;

    ctx.save();

    // Линзы-излучатели на концах луча.
    this._drawLens(ctx, a.x, a.y);
    this._drawLens(ctx, b.x, b.y);

    if (this.phase === 'fire') {
      // Аура — простой полупрозрачный прямоугольник на 2.5 px шире
      // ядра с каждой стороны. Никаких shadowBlur и градиентов.
      if (horizontal) {
        ctx.fillStyle = AURA;
        ctx.fillRect(this.x, this.y - 2.5, this.w, this.h + 5);
      } else {
        ctx.fillStyle = AURA;
        ctx.fillRect(this.x - 2.5, this.y, this.w + 5, this.h);
      }

      // Ядро толщиной 6–8 px, чуть «дышит» по толщине (±0.5 px).
      const wobble = Math.sin(this.time * 17 + this.seed) * 0.5;
      if (horizontal) {
        const hh = Math.max(6, this.h + wobble);
        ctx.fillStyle = CORE;
        ctx.fillRect(this.x, this.y + (this.h - hh) / 2, this.w, hh);
      } else {
        const ww = Math.max(6, this.w + wobble);
        ctx.fillStyle = CORE;
        ctx.fillRect(this.x + (this.w - ww) / 2, this.y, ww, this.h);
      }

      // Линзы светятся ярче поверх луча.
      this._drawLens(ctx, a.x, a.y);
      this._drawLens(ctx, b.x, b.y);
    } else if (this.phase === 'charge') {
      // Тонкий пунктирный прицел с альфой 0.4 — выстрела ещё нет.
      ctx.strokeStyle = AIM;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // В паузе луча нет совсем: остаются только тускло-серые линзы.

    ctx.restore();
  }
}

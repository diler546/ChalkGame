import {
  CELL,
  cellKey,
  cellRect,
  gridBounds,
  horizontalOverlap,
} from './collision.js';

// Менеджер меловых мазков: сетка 12×12, свободная линия по Брезенхэму.
export class Brush {
  constructor(opts = {}) {
    this.cells = new Map(); // ключ -> ячейка; порядок Map = возраст
    this.active = null;
    this.maxCells = 220;
    this.lifetime = 4;
    // () => boolean — можно ли потратить краску на новую ячейку.
    this.onCell = opts.onCell || null;
    // (gx, gy) => boolean — ячейка не входит в лимит 220 мазков (пазлы).
    this.isExempt = opts.isExempt || (() => false);
    // (gx, gy) => void — мазок завершён: ячейка засчитывается (прогресс пазла).
    this.onCommitCell = opts.onCommitCell || null;
    this.counted = 0; // сколько ячеек учитывается в лимите
  }

  reset() {
    this.cells.clear();
    this.active = null;
    this.counted = 0;
  }

  get isDrawing() {
    return this.active !== null;
  }

  begin(wx, wy) {
    if (this.active) return false;
    this.active = {
      lastGX: null,
      lastGY: null,
      created: new Set(), // все ячейки мазка (новые и обновлённые)
      added: new Set(), // только новые ячейки мазка
    };
    return this._lineTo(wx, wy);
  }

  extend(wx, wy) {
    if (!this.active) return true;
    return this._lineTo(wx, wy);
  }

  // Возвращает false, если краска закончилась.
  _lineTo(wx, wy) {
    if (!this.active) return false;
    const gx = Math.floor(wx / CELL);
    const gy = Math.floor(wy / CELL);

    const a = this.active;
    if (a.lastGX === null) {
      if (!this._addCell(gx, gy)) return false;
    } else {
      let x0 = a.lastGX;
      let y0 = a.lastGY;
      const dx = Math.abs(gx - x0);
      const dy = -Math.abs(gy - y0);
      const sx = x0 < gx ? 1 : -1;
      const sy = y0 < gy ? 1 : -1;
      let err = dx + dy;

      // Брезенхэм: закрашиваем все ячейки между точками.
      for (;;) {
        if (!this._addCell(x0, y0)) return false;
        if (x0 === gx && y0 === gy) break;
        const e2 = err * 2;
        if (e2 >= dy) {
          err += dy;
          x0 += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y0 += sy;
        }
      }
    }

    a.lastGX = gx;
    a.lastGY = gy;
    return true;
  }

  _addCell(gx, gy) {
    const key = cellKey(gx, gy);
    const existing = this.cells.get(key);

    if (existing) {
      // Повторный мазок обновляет ячейку и делает её «свежей».
      existing.ttl = this.lifetime;
      existing.frozen = true;
      existing.phase = Math.random() * Math.PI * 2;
      this.cells.delete(key);
      this.cells.set(key, existing);
      this.active.created.add(key);
      return true;
    }

    // Спрашиваем разрешение на трату краски.
    if (this.onCell && !this.onCell(gx, gy)) return false;

    // Ячейки пазлов не входят в лимит 220 мазков.
    const exempt = !!this.isExempt(gx, gy);

    // Лимит: вытесняем самую старую ячейку (из учитываемых).
    while (this.counted >= this.maxCells) {
      const oldest = this._oldestCounted();
      if (oldest === null) break;
      this.cells.delete(oldest);
      this.counted -= 1;
    }

    const r = cellRect(gx, gy);
    this.cells.set(key, {
      ...r,
      gx,
      gy,
      ttl: this.lifetime,
      frozen: true,
      phase: Math.random() * Math.PI * 2,
      seed: Math.random() * 1000,
      exempt,
    });
    if (!exempt) this.counted += 1;
    this.active.created.add(key);
    this.active.added.add(key);
    return true;
  }

  _oldestCounted() {
    for (const [key, cell] of this.cells) {
      if (!cell.exempt) return key;
    }
    return null;
  }

  // commit=false — незаконченный мазок не становится твёрдым (пауза).
  // Только завершённый мазок засчитывается (прогресс пазла не откатывается).
  finishDraw(commit = true) {
    if (!this.active) return;
    const stroke = this.active;
    for (const key of stroke.created) {
      const cell = this.cells.get(key);
      if (!cell) continue;
      if (commit) {
        cell.frozen = false;
        cell.ttl = this.lifetime;
        if (this.onCommitCell) this.onCommitCell(cell.gx, cell.gy);
      } else if (stroke.added.has(key)) {
        // Новая ячейка незаконченного мазка — исчезает.
        this.cells.delete(key);
        if (!cell.exempt) this.counted -= 1;
      } else {
        // Ячейка была и до мазка — просто снова тает.
        cell.frozen = false;
      }
    }
    this.active = null;
  }

  update(dt) {
    for (const [key, cell] of this.cells) {
      if (cell.frozen) continue;
      cell.ttl -= dt;
      if (cell.ttl <= 0) {
        this.cells.delete(key);
        if (!cell.exempt) this.counted -= 1;
      }
    }
  }

  // Живые ячейки, пересекающие прямоугольник (проверка по сетке).
  solidsNear(rect) {
    const out = [];
    const { x0, y0, x1, y1 } = gridBounds(rect);
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const cell = this.cells.get(cellKey(gx, gy));
        if (cell && cell.ttl > 0 && horizontalOverlap(cell, rect)) out.push(cell);
      }
    }
    return out;
  }

  // Для рендера: только попавшие в камеру ячейки.
  forEachVisible(x0, y0, x1, y1, cb) {
    const b = gridBounds({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    for (let gy = b.y0; gy <= b.y1; gy++) {
      for (let gx = b.x0; gx <= b.x1; gx++) {
        const cell = this.cells.get(cellKey(gx, gy));
        if (cell) cb(cell);
      }
    }
  }
}

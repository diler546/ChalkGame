// Три печати-пазла: квадрат, круг и ромб.
//
// Пазл — контур на меловой сетке 12×12. Внутри контура ячейки идут в
// прогресс, снаружи — тратят краску, но не засчитываются. Мазок
// засчитывается только после отпускания указателя. Прогресс не тает и
// сбрасывается только при полном рестарте забега.
//
// Ячейки пазла не входят в лимит 220 мазков и не тратят краску.

import { CELL, cellKey } from './collision.js';

const CHALK = '#f0ead8';

const CONFIGS = [
  {
    id: 'square',
    name: 'Квадрат',
    gate: 'gate-square',
    kind: 'square',
    gx0: 253,
    gy0: 57,
    side: 6,
    centerGx: 256,
    centerGy: 60,
  },
  {
    id: 'circle',
    name: 'Круг',
    gate: 'gate-circle',
    kind: 'circle',
    centerGx: 389,
    centerGy: 60,
    radius: 4,
  },
  {
    id: 'diamond',
    name: 'Ромб',
    gate: 'gate-diamond',
    kind: 'diamond',
    centerGx: 518,
    centerGy: 60,
    radius: 4.6,
  },
];

function key(gx, gy) {
  return cellKey(gx, gy);
}

export class PuzzleManager {
  constructor() {
    this.puzzles = CONFIGS.map((c) => ({ ...c }));

    for (const p of this.puzzles) {
      p.cells = this._buildCells(p);
      p.target = Math.ceil(p.cells.length * 0.8); // 80%+ — печать снята
    }

    this.byCell = new Map();
    for (const p of this.puzzles) {
      for (const c of p.cells) this.byCell.set(key(c.gx, c.gy), p);
    }

    this.reset();
  }

  _buildCells(p) {
    const cells = [];
    if (p.kind === 'square') {
      for (let gy = p.gy0; gy < p.gy0 + p.side; gy++) {
        for (let gx = p.gx0; gx < p.gx0 + p.side; gx++) {
          cells.push({ gx, gy });
        }
      }
      return cells;
    }

    const r = p.radius;
    const gx0 = Math.floor(p.centerGx - r - 1);
    const gx1 = Math.ceil(p.centerGx + r + 1);
    const gy0 = Math.floor(p.centerGy - r - 1);
    const gy1 = Math.ceil(p.centerGy + r + 1);

    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const dx = gx + 0.5 - p.centerGx;
        const dy = gy + 0.5 - p.centerGy;
        const inside =
          p.kind === 'circle'
            ? Math.hypot(dx, dy) <= r
            : Math.abs(dx) + Math.abs(dy) <= r;
        if (inside) cells.push({ gx, gy });
      }
    }
    return cells;
  }

  reset() {
    for (const p of this.puzzles) {
      p.filled = new Set();
      p.solved = false;
    }
  }

  get(id) {
    return this.puzzles.find((p) => p.id === id) || null;
  }

  get total() {
    return this.puzzles.length;
  }

  isSolved(id) {
    const p = this.get(id);
    return !!p && p.solved;
  }

  solvedCount() {
    return this.puzzles.filter((p) => p.solved).length;
  }

  gateOf(id) {
    const p = this.get(id);
    return p ? p.gate : null;
  }

  isSolvedGate(gateId) {
    const p = this.puzzles.find((item) => item.gate === gateId);
    return !!p && p.solved;
  }

  isInsideCell(gx, gy) {
    return this.byCell.has(key(gx, gy));
  }

  // Вызывается кисточкой после завершения мазка.
  // { counted, solved, puzzle } — solved=true только в момент решения.
  paintCell(gx, gy) {
    const p = this.byCell.get(key(gx, gy));
    if (!p) return { counted: false, solved: false, puzzle: null };
    if (p.filled.has(key(gx, gy))) {
      return { counted: false, solved: p.solved, puzzle: p };
    }
    p.filled.add(key(gx, gy));
    const solved = this._checkSolved(p);
    return { counted: true, solved, puzzle: p };
  }

  _checkSolved(p) {
    if (p.solved) return false;
    if (p.filled.size < p.target) return false;
    p.solved = true;
    return true;
  }

  progress(id) {
    const p = this.get(id);
    if (!p) return { filled: 0, target: 1, solved: false, cellCount: 0 };
    return {
      filled: p.filled.size,
      target: p.target,
      solved: p.solved,
      cellCount: p.cells.length,
    };
  }

  centerOf(p) {
    return { x: p.centerGx * CELL, y: p.centerGy * CELL };
  }

  topOf(p) {
    if (p.kind === 'square') return p.gy0 * CELL;
    return (p.centerGy - p.radius) * CELL;
  }

  _diamondPath(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
  }

  render(ctx, time, hiddenGates = null) {
    for (const p of this.puzzles) {
      if (hiddenGates && hiddenGates.has(p.gate)) continue;
      // Закрашенные ячейки — часть печати, живут до рестарта.
      for (const c of p.cells) {
        if (!p.filled.has(key(c.gx, c.gy))) continue;
        const x = c.gx * CELL;
        const y = c.gy * CELL;
        ctx.fillStyle = CHALK;
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.fillRect(x + 2, y + 2, CELL - 4, 2);

        // Меловая крошка по краю.
        ctx.fillStyle = 'rgba(240, 234, 216, 0.35)';
        ctx.fillRect(x + 1, y + CELL - 2, 3, 1);
      }

      // Контур: полупрозрачный пунктир, который не тает.
      const cx = p.centerGx * CELL;
      const cy = p.centerGy * CELL;
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = p.solved
        ? 'rgba(120, 200, 130, 0.9)'
        : 'rgba(240, 234, 216, 0.55)';
      ctx.beginPath();
      if (p.kind === 'square') {
        ctx.strokeRect(
          p.gx0 * CELL,
          p.gy0 * CELL,
          p.side * CELL,
          p.side * CELL
        );
      } else if (p.kind === 'circle') {
        ctx.arc(cx, cy, p.radius * CELL, 0, Math.PI * 2);
      } else {
        this._diamondPath(ctx, cx, cy, p.radius * CELL);
      }
      ctx.stroke();
      ctx.restore();

      // Счётчик над фигурой.
      const pr = this.progress(p.id);
      const labelY = this.topOf(p) - 32;
      const label = p.solved
        ? `${p.name}: печать снята`
        : `${p.name}: ${pr.filled}/${pr.target}`;
      ctx.save();
      ctx.font = '600 13px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      const w = ctx.measureText(label).width + 16;
      ctx.fillStyle = 'rgba(8, 11, 18, 0.82)';
      ctx.fillRect(cx - w / 2, labelY, w, 21);
      ctx.strokeStyle = p.solved
        ? 'rgba(120, 200, 130, 0.65)'
        : 'rgba(240, 234, 216, 0.32)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - w / 2, labelY, w, 21);
      ctx.fillStyle = p.solved ? '#9fe0a8' : '#f0ead8';
      ctx.fillText(label, cx, labelY + 15);
      ctx.restore();
    }
  }
}


// Пазлы «МЕЛОК: Ночной Вернисаж».
//
// Два типа:
//   1. «Раскрась фигуру» — квадрат, круг, треугольник, ромб, звезда.
//      Внутри контура ячейки идут в прогресс, снаружи — тратят краску.
//      Прогресс 80%+ снимает печать. Ячейки пазла не входят в лимит 220.
//   2. «Соедини мазком» — на стене 4 гвоздика и красные шипы. Нужно
//      провести один непрерывный мазок через все точки, не задев шипы.
//
// Прогресс не тает и сбрасывается только полным рестартом забега.

import { CELL, cellKey, rectsOverlap } from './collision.js';

const CHALK = '#f0ead8';

const SHAPES = [
  {
    id: 'square',
    name: 'Квадрат',
    gate: 'gate-square',
    kind: 'square',
    gx0: 167,
    gy0: 90,
    side: 6,
    centerGx: 170,
    centerGy: 93,
  },
  {
    id: 'circle',
    name: 'Круг',
    gate: 'gate-circle',
    kind: 'circle',
    centerGx: 264,
    centerGy: 75,
    radius: 4,
  },
  {
    id: 'triangle',
    name: 'Треугольник',
    gate: 'gate-triangle',
    kind: 'triangle',
    gx0: 320,
    gy0: 88,
    side: 7,
    centerGx: 323.5,
    centerGy: 91.5,
  },
  {
    id: 'diamond',
    name: 'Ромб',
    gate: 'gate-diamond',
    kind: 'diamond',
    centerGx: 382,
    centerGy: 79,
    radius: 4.6,
  },
  {
    id: 'star',
    name: 'Звезда',
    gate: 'gate-star',
    kind: 'star',
    centerGx: 422,
    centerGy: 72,
    radius: 6,
    inner: 2.6,
  },
];

const CONNECTS = [
  {
    id: 'connect-a',
    name: 'Соедини A',
    kind: 'connect',
    bridge: 'bridge-a',
    gx0: 200,
    gy0: 72,
    cols: 16,
    rows: 16,
    buttons: [
      { gx: 202, gy: 74 },
      { gx: 213, gy: 74 },
      { gx: 213, gy: 85 },
      { gx: 202, gy: 85 },
    ],
    spikes: [
      { gx: 207, gy: 76 },
      { gx: 207, gy: 79 },
      { gx: 207, gy: 82 },
    ],
  },
  {
    id: 'connect-b',
    name: 'Соедини B',
    kind: 'connect',
    bridge: 'bridge-b',
    gx0: 388,
    gy0: 72,
    cols: 16,
    rows: 16,
    buttons: [
      { gx: 395, gy: 74 },
      { gx: 401, gy: 79 },
      { gx: 395, gy: 84 },
      { gx: 389, gy: 79 },
    ],
    spikes: [
      { gx: 395, gy: 77 },
      { gx: 395, gy: 81 },
      { gx: 396, gy: 79 },
    ],
  },
];

function key(gx, gy) {
  return cellKey(gx, gy);
}

function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function pointInPolygon(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;
    const hit =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi || 0.00001) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

export class PuzzleManager {
  constructor() {
    this.puzzles = [...SHAPES, ...CONNECTS].map((c) => ({
      ...c,
      filled: new Set(),
      solved: false,
      progressCount: 0,
      strokeCells: new Set(),
      solutionCells: new Set(),
      hitFlash: 0,
    }));

    for (const p of this.puzzles) {
      p.cells =
        p.kind === 'connect' ? this._buildBoardCells(p) : this._buildShapeCells(p);
      if (p.kind !== 'connect') p.target = Math.ceil(p.cells.length * 0.8);
    }

    this.byCell = new Map();
    for (const p of this.puzzles) {
      for (const c of p.cells) this.byCell.set(key(c.gx, c.gy), p);
    }
  }

  _buildShapeCells(p) {
    const cells = [];

    if (p.kind === 'square') {
      for (let gy = p.gy0; gy < p.gy0 + p.side; gy++) {
        for (let gx = p.gx0; gx < p.gx0 + p.side; gx++) {
          cells.push({ gx, gy });
        }
      }
      return cells;
    }

    if (p.kind === 'triangle') {
      const ax = p.gx0;
      const ay = p.gy0 + p.side - 1;
      const bx = p.gx0 + p.side - 1;
      const by = p.gy0 + p.side - 1;
      const cx = p.gx0 + (p.side - 1) / 2;
      const cy = p.gy0;
      for (let gy = p.gy0 - 1; gy <= p.gy0 + p.side; gy++) {
        for (let gx = p.gx0 - 1; gx <= p.gx0 + p.side; gx++) {
          if (pointInTriangle(gx + 0.5, gy + 0.5, ax, ay, bx, by, cx, cy)) {
            cells.push({ gx, gy });
          }
        }
      }
      return cells;
    }

    if (p.kind === 'star') {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? p.radius : p.inner;
        pts.push({
          x: p.centerGx + Math.cos(ang) * r,
          y: p.centerGy + Math.sin(ang) * r,
        });
      }
      for (let gy = Math.floor(p.centerGy - p.radius - 1); gy <= Math.ceil(p.centerGy + p.radius + 1); gy++) {
        for (let gx = Math.floor(p.centerGx - p.radius - 1); gx <= Math.ceil(p.centerGx + p.radius + 1); gx++) {
          if (pointInPolygon(gx + 0.5, gy + 0.5, pts)) cells.push({ gx, gy });
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

  _buildBoardCells(p) {
    const cells = [];
    for (let gy = p.gy0; gy < p.gy0 + p.rows; gy++) {
      for (let gx = p.gx0; gx < p.gx0 + p.cols; gx++) {
        cells.push({ gx, gy });
      }
    }
    return cells;
  }

  reset() {
    for (const p of this.puzzles) {
      p.filled = new Set();
      p.solved = false;
      p.progressCount = 0;
      p.strokeCells = new Set();
      p.solutionCells = new Set();
      p.hitFlash = 0;
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

  isSolvedBridge(bridgeId) {
    const p = this.puzzles.find((item) => item.bridge === bridgeId);
    return !!p && p.solved;
  }

  isInsideCell(gx, gy) {
    return this.byCell.has(key(gx, gy));
  }

  closeBoardAt(gx, gy) {
    return this.byCell.has(key(gx, gy));
  }

  // Новый мазок: попытки «соедини» начинаются заново, но счётчик
  // последней попытки остаётся на экране до первого касания доски.
  beginStroke() {
    for (const p of this.puzzles) {
      if (p.kind !== 'connect' || p.solved) continue;
      p.strokeCells.clear();
    }
  }

  cancelStroke() {
    for (const p of this.puzzles) {
      if (p.kind === 'connect' && !p.solved) p.strokeCells.clear();
    }
  }

  // Кисточка сообщает о каждой засчитанной ячейке.
  paintCell(gx, gy) {
    const p = this.byCell.get(key(gx, gy));
    if (!p) return { counted: false, solved: false, puzzle: null };

    if (p.kind === 'connect') {
      if (p.solved) return { counted: false, solved: false, puzzle: p };
      if (p.strokeCells.size === 0) p.progressCount = 0;
      p.strokeCells.add(key(gx, gy));
      return { counted: false, solved: false, puzzle: p, connect: true };
    }

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

  // Вызывается после отпускания указателя. Возвращает события для Game.
  endStroke() {
    const events = [];

    for (const p of this.puzzles) {
      if (p.kind !== 'connect' || p.solved || p.strokeCells.size === 0) continue;

      if (this._hitsSpike(p)) {
        p.strokeCells.clear();
        p.progressCount = 0;
        p.hitFlash = 0.6;
        events.push({ type: 'hit', puzzle: p });
        continue;
      }

      const touched = this._touchedButtons(p);
      p.progressCount = touched;

      if (touched >= p.buttons.length && this._isConnected(p)) {
        p.solved = true;
        p.solutionCells = new Set(p.strokeCells);
        p.strokeCells.clear();
        events.push({ type: 'solved', puzzle: p });
      } else {
        events.push({ type: 'progress', puzzle: p, touched });
      }
    }

    return events;
  }

  _touchedButtons(p) {
    const touched = new Set();
    for (let i = 0; i < p.buttons.length; i++) {
      const b = p.buttons[i];
      const bx = b.gx * CELL + CELL / 2;
      const by = b.gy * CELL + CELL / 2;
      for (const k of p.strokeCells) {
        const [gx, gy] = k.split(',').map(Number);
        const cx = gx * CELL + CELL / 2;
        const cy = gy * CELL + CELL / 2;
        if (Math.hypot(cx - bx, cy - by) <= 9) {
          touched.add(i);
          break;
        }
      }
    }
    return touched.size;
  }

  _hitsSpike(p) {
    for (const s of p.spikes) {
      const sr = {
        x: s.gx * CELL + 1,
        y: s.gy * CELL + 2,
        w: CELL - 2,
        h: CELL - 2,
      };
      for (const k of p.strokeCells) {
        const [gx, gy] = k.split(',').map(Number);
        const cr = { x: gx * CELL, y: gy * CELL, w: CELL, h: CELL };
        if (rectsOverlap(cr, sr)) return true;
      }
    }
    return false;
  }

  _isConnected(p) {
    if (p.strokeCells.size <= 1) return true;
    const all = p.strokeCells;
    const first = all.values().next().value;
    const seen = new Set([first]);
    const queue = [first];
    while (queue.length) {
      const [gx, gy] = queue.pop().split(',').map(Number);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const k = key(gx + dx, gy + dy);
        if (all.has(k) && !seen.has(k)) {
          seen.add(k);
          queue.push(k);
        }
      }
    }
    return seen.size === all.size;
  }

  progress(id) {
    const p = this.get(id);
    if (!p) return { filled: 0, target: 1, solved: false, cellCount: 0 };
    if (p.kind === 'connect') {
      return {
        filled: p.progressCount,
        target: p.buttons.length,
        solved: p.solved,
        cellCount: p.cells.length,
        kind: 'connect',
      };
    }
    return {
      filled: p.filled.size,
      target: p.target,
      solved: p.solved,
      cellCount: p.cells.length,
      kind: 'shape',
    };
  }

  centerOf(p) {
    if (p.kind === 'connect') {
      return {
        x: (p.gx0 + p.cols / 2) * CELL,
        y: (p.gy0 + p.rows / 2) * CELL,
      };
    }
    return { x: p.centerGx * CELL, y: p.centerGy * CELL };
  }

  topOf(p) {
    if (p.kind === 'connect') return p.gy0 * CELL;
    if (p.kind === 'square' || p.kind === 'triangle') return p.gy0 * CELL;
    return (p.centerGy - p.radius) * CELL;
  }

  update(dt) {
    for (const p of this.puzzles) {
      if (p.hitFlash > 0) p.hitFlash = Math.max(0, p.hitFlash - dt);
    }
  }

  _traceShape(ctx, p) {
    const cx = p.centerGx * CELL;
    const cy = p.centerGy * CELL;

    if (p.kind === 'square') {
      ctx.strokeRect(p.gx0 * CELL, p.gy0 * CELL, p.side * CELL, p.side * CELL);
      return;
    }

    if (p.kind === 'circle') {
      ctx.arc(cx, cy, p.radius * CELL, 0, Math.PI * 2);
      return;
    }

    ctx.beginPath();
    if (p.kind === 'diamond') {
      ctx.moveTo(cx, cy - p.radius * CELL);
      ctx.lineTo(cx + p.radius * CELL, cy);
      ctx.lineTo(cx, cy + p.radius * CELL);
      ctx.lineTo(cx - p.radius * CELL, cy);
      ctx.closePath();
      return;
    }

    if (p.kind === 'triangle') {
      const side = p.side;
      ctx.moveTo(p.gx0 * CELL, (p.gy0 + side - 1) * CELL);
      ctx.lineTo((p.gx0 + side - 1) * CELL, (p.gy0 + side - 1) * CELL);
      ctx.lineTo((p.gx0 + (side - 1) / 2) * CELL, p.gy0 * CELL);
      ctx.closePath();
      return;
    }

    if (p.kind === 'star') {
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = (i % 2 === 0 ? p.radius : p.inner) * CELL;
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
  }

  _renderShape(ctx, p, time) {
    // Закрашенные ячейки — часть печати, живут до рестарта.
    for (const c of p.cells) {
      if (!p.filled.has(key(c.gx, c.gy))) continue;
      const x = c.gx * CELL;
      const y = c.gy * CELL;
      ctx.fillStyle = CHALK;
      ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.fillRect(x + 2, y + 2, CELL - 4, 2);
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
    this._traceShape(ctx, p);
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

  _buttonCovered(p, b, set) {
    if (!set || set.size === 0) return false;
    const bx = b.gx * CELL + CELL / 2;
    const by = b.gy * CELL + CELL / 2;
    for (const k of set) {
      const [gx, gy] = k.split(',').map(Number);
      const cx = gx * CELL + CELL / 2;
      const cy = gy * CELL + CELL / 2;
      if (Math.hypot(cx - bx, cy - by) <= 9) return true;
    }
    return false;
  }

  _renderConnect(ctx, p) {
    const x = p.gx0 * CELL;
    const y = p.gy0 * CELL;
    const w = p.cols * CELL;
    const h = p.rows * CELL;

    // Доска на стене. Никаких градиентов — только плоские плашки.
    ctx.fillStyle = '#0f131c';
    ctx.fillRect(x - 8, y - 8, w + 16, h + 16);
    ctx.fillStyle = p.hitFlash > 0 ? '#26151b' : '#121722';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = p.hitFlash > 0 ? '#a8444c' : '#6d5423';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.strokeStyle = 'rgba(200, 170, 90, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 7, y + 7, w - 14, h - 14);

    // Закреплённые уголки.
    ctx.fillStyle = '#c8aa5a';
    for (const [sx, sy] of [
      [x + 8, y + 8],
      [x + w - 8, y + 8],
      [x + 8, y + h - 8],
      [x + w - 8, y + h - 8],
    ]) {
      ctx.fillRect(sx - 2, sy - 2, 4, 4);
    }

    // Решённый мазок остаётся на доске.
    for (const k of p.solutionCells) {
      const [gx, gy] = k.split(',').map(Number);
      const cx = gx * CELL;
      const cy = gy * CELL;
      ctx.fillStyle = 'rgba(240, 234, 216, 0.82)';
      ctx.fillRect(cx + 2, cy + 2, CELL - 4, CELL - 4);
    }

    // Шипы.
    for (const s of p.spikes) {
      const sx = s.gx * CELL;
      const sy = s.gy * CELL;
      ctx.fillStyle = '#8d2f37';
      ctx.beginPath();
      ctx.moveTo(sx + 3, sy + CELL - 3);
      ctx.lineTo(sx + CELL / 2, sy + 3);
      ctx.lineTo(sx + CELL - 3, sy + CELL - 3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#c05a62';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Кнопки-гвоздики.
    for (const b of p.buttons) {
      const bx = b.gx * CELL + CELL / 2;
      const by = b.gy * CELL + CELL / 2;
      const active =
        this._buttonCovered(p, b, p.strokeCells) ||
        this._buttonCovered(p, b, p.solutionCells);
      ctx.fillStyle = '#222a38';
      ctx.beginPath();
      ctx.arc(bx, by, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = active ? '#e8cf88' : '#b8933f';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = active ? '#f5e6b8' : '#d8c89a';
      ctx.beginPath();
      ctx.arc(bx, by, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Счётчик над доской.
    const pr = this.progress(p.id);
    const words = ['точка', 'точки', 'точек'];
    const n = p.buttons.length;
    const n10 = n % 10;
    const word =
      n10 === 1 && n % 100 !== 11
        ? words[0]
        : n10 >= 2 && n10 <= 4 && (n % 100 < 10 || n % 100 >= 20)
          ? words[1]
          : words[2];
    const label = p.solved
      ? 'Соедини: готово'
      : `Соедини: ${pr.filled}/${n} ${word}`;
    const labelY = y - 30;
    const cx = x + w / 2;
    ctx.save();
    ctx.font = '600 13px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    const lw = ctx.measureText(label).width + 16;
    ctx.fillStyle = 'rgba(8, 11, 18, 0.86)';
    ctx.fillRect(cx - lw / 2, labelY, lw, 21);
    ctx.strokeStyle = p.solved
      ? 'rgba(120, 200, 130, 0.65)'
      : 'rgba(240, 234, 216, 0.32)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - lw / 2, labelY, lw, 21);
    ctx.fillStyle = p.solved ? '#9fe0a8' : '#f0ead8';
    ctx.fillText(label, cx, labelY + 15);
    ctx.restore();
  }

  render(ctx, time, hiddenGates = null) {
    for (const p of this.puzzles) {
      if (p.gate && hiddenGates && hiddenGates.has(p.gate)) continue;
      if (p.kind === 'connect') this._renderConnect(ctx, p);
      else this._renderShape(ctx, p, time);
    }
  }
}



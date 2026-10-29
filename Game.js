import { Player } from './Player.js';
import { Input } from './input.js';
import { Brush } from './brush.js';
import { Camera } from './camera.js';
import { AudioEngine } from './audio.js';
import { EnemyManager } from './enemies.js';
import { PuzzleManager } from './puzzles.js';
import {
  WORLD,
  VIEW,
  SPAWN,
  HALLS,
  PLATFORMS,
  PITS,
  PICTURES,
  DANGERS,
  DOOR,
  GATES,
  DECOR,
} from './level.js';
import { clamp, rectsOverlap } from './collision.js';

const BEST_KEY = 'chalk_best';
const DIFF_KEY = 'chalk_difficulty';
const COST_PER_CELL = 1 / 3; // 1 краска за 3 ячейки
const TOTAL_PICTURES = PICTURES.length;

// Хардкорный баланс: краски мало, регенерация медленная. Восемь мостов
// по 230 px стоят примерно 61 краску, поэтому каждый забег — планирование.
export const DIFFICULTIES = Object.freeze({
  easy: {
    id: 'easy',
    label: 'Лёгкий',
    paint: 90,
    regen: 2.5,
    lives: 5,
    bonus: 5,
    picturePaint: 14,
  },
  medium: {
    id: 'medium',
    label: 'Средний',
    paint: 50,
    regen: 1.1,
    lives: 3,
    bonus: 10,
    picturePaint: 10,
  },
  hard: {
    id: 'hard',
    label: 'Сложный',
    paint: 26,
    regen: 0.45,
    lives: 1,
    bonus: 15,
    picturePaint: 8,
  },
});

const CUTSCENES = Object.freeze({
  intro: [
    'Ночь. Галерея закрыта, но картины не спят.',
    'Сторож ушёл, оставив дверь на замке.',
    'Восемь залов. Восемь полотен. Три печати.',
    'У тебя только мел и краска. Мосты тают.',
    'Верни свет на стены. До рассвета.',
  ],
  outro: [
    'Последняя дверь поддалась.',
    'Картины вспыхнули красками, как в первый день.',
    'Сторож вернулся, но не стал спрашивать, кто это сделал.',
    'На полу остался лишь меловой след — и он вёл к выходу.',
  ],
});

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Детерминированный генератор «от руки».
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roughLine(ctx, x1, y1, x2, y2, jitter, rand) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const steps = Math.max(2, Math.round(len / 42));
  const nx = -dy / len;
  const ny = dx / len;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x1 + dx * t;
    const py = y1 + dy * t;
    const off =
      (rand() - 0.5) * jitter * (i === 0 || i === steps ? 0.3 : 1);
    if (i === 0) ctx.moveTo(px + nx * off, py + ny * off);
    else ctx.lineTo(px + nx * off, py + ny * off);
  }
  ctx.stroke();
}

function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const b2 = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `rgb(${r},${g},${b2})`;
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    canvas.width = VIEW.w;
    canvas.height = VIEW.h;

    this.state = 'menu'; // menu | intro | playing | paused | outro | won | lost
    this.onStateChange = null;
    this.onSoundChange = null;

    this.selectedDifficulty = this._loadDifficulty();
    this.runDifficulty = this.selectedDifficulty;
    this._applyDifficulty(this.runDifficulty);

    this.player = new Player(SPAWN.x, SPAWN.y);
    this.puzzles = new PuzzleManager();
    this.brush = new Brush({
      onCell: (gx, gy) => this._onBrushCell(gx, gy),
      isExempt: (gx, gy) => this.puzzles.isInsideCell(gx, gy),
      onCommitCell: (gx, gy) => this._commitBrushCell(gx, gy),
    });
    this.camera = new Camera(VIEW.w, VIEW.h, WORLD.w, WORLD.h);
    this.audio = new AudioEngine();
    this.enemies = new EnemyManager();

    this.totalPuzzles = this.puzzles.total;
    this.paint = this.maxPaint;
    this.hearts = this.maxLives;
    this.invuln = 0;
    this.score = 0;
    this.best = this._loadBest();
    this.picturesCollected = 0;
    this.puzzlesSolved = 0;
    this.pictures = PICTURES.map((p) => ({ ...p, collected: false }));
    this.checkpoint = { x: SPAWN.x, y: SPAWN.y };

    this.runTime = 0;
    this.paintSpent = 0;
    this.hits = 0;
    this.falls = 0;
    this.gateFade = {};
    for (const g of GATES) this.gateFade[g.id] = 0;

    this.hintTimer = 7;
    this.lastTime = 0;
    this.rafId = null;
    this.flashes = [];
    this.toasts = [];
    this.hurtFlash = 0;
    this.fade = 0;
    this.stateTime = 0;

    this.dust = Array.from({ length: 20 }, (_, i) => ({
      x: Math.random() * VIEW.w,
      y: Math.random() * VIEW.h,
      r: 1 + Math.random() * 1.4,
      phase: (i * 1.7) % (Math.PI * 2),
      drift: 6 + (i % 5) * 3,
      alpha: 0.3 + (i % 4) * 0.06,
    }));

    this.input = new Input(canvas, {
      getState: () => this.state,
      toWorld: (x, y) => this._screenToWorld(x, y),
      onPauseToggle: () => this.togglePause(),
      onDrawStart: (x, y) => this._drawStart(x, y),
      onDrawMove: (x, y) => this._drawMove(x, y),
      onDrawEnd: () => this.brush.finishDraw(true),
    });

    this._loop = this._loop.bind(this);
    this.camera.snap(this.player);
    this._bindVisibility();
    this._startLoop();
  }

  // ---------- состояние ----------
  _setState(next) {
    this.state = next;
    this.stateTime = 0;
    this.fade = 0.85;
    if (this.onStateChange) this.onStateChange(next);
  }

  start() {
    if (this.state === 'playing' || this.state === 'intro') return;
    this._prepareRun();
    this.audio.play('page');
    this._setState('intro');
  }

  beginRun() {
    if (this.state !== 'intro' && this.state !== 'menu') return;
    this.input.clear();
    this.lastTime = 0;
    this.audio.play('page');
    this._setState('playing');
  }

  restart() {
    this._prepareRun();
    this.input.clear();
    this.lastTime = 0;
    this._setState('playing');
  }

  _prepareRun() {
    this.runDifficulty = this.selectedDifficulty;
    this._applyDifficulty(this.runDifficulty);
    this.reset();
  }

  toMenu() {
    this.brush.finishDraw(false);
    this.input.clear();
    this.lastTime = 0;
    this.camera.snap(this.player);
    this.audio.play('ui');
    this._setState('menu');
  }

  finishOutro() {
    if (this.state !== 'outro') return;
    this._setState('won');
  }

  skipCutscene() {
    if (this.state === 'intro') this.beginRun();
    else if (this.state === 'outro') this.finishOutro();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.brush.finishDraw(false);
    this.input.clear();
    this.lastTime = 0;
    this._setState('paused');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.input.clear();
    this.lastTime = 0;
    this.audio.play('ui');
    this._setState('playing');
  }

  togglePause() {
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') this.resume();
  }

  toggleSound() {
    const muted = this.audio.toggleMute();
    if (this.onSoundChange) this.onSoundChange(muted);
    return muted;
  }

  // ---------- сложность ----------
  // На паузе и на экране поражения выбор только запоминается:
  // новая сложность применится после «Заново», а текущий забег не меняется.
  setDifficulty(id) {
    if (!DIFFICULTIES[id]) return;
    this.selectedDifficulty = id;
    try {
      localStorage.setItem(DIFF_KEY, id);
    } catch {
      /* приватный режим */
    }

    if (this.state === 'menu') {
      this.runDifficulty = id;
      this._applyDifficulty(id);
      this.paint = this.maxPaint;
      this.hearts = this.maxLives;
    }

    if (this.onStateChange) this.onStateChange(this.state);
  }

  _applyDifficulty(id) {
    const cfg = DIFFICULTIES[id] || DIFFICULTIES.medium;
    this.maxPaint = cfg.paint;
    this.regenPerSec = cfg.regen;
    this.maxLives = cfg.lives;
    this.winBonus = cfg.bonus;
    this.picturePaint = cfg.picturePaint;
  }

  _loadDifficulty() {
    try {
      const v = localStorage.getItem(DIFF_KEY);
      if (v && DIFFICULTIES[v]) return v;
    } catch {
      /* приватный режим */
    }
    return 'medium';
  }

  get maxScore() {
    return TOTAL_PICTURES + this.totalPuzzles * 2 + this.winBonus;
  }

  // ---------- сброс ----------
  reset() {
    this.player.reset();
    this.brush.reset();
    this.puzzles.reset();
    this.enemies.reset();
    this.paint = this.maxPaint;
    this.hearts = this.maxLives;
    this.invuln = 0;
    this.score = 0;
    this.picturesCollected = 0;
    this.puzzlesSolved = 0;
    for (const p of this.pictures) p.collected = false;
    this.checkpoint = { x: SPAWN.x, y: SPAWN.y };
    this.runTime = 0;
    this.paintSpent = 0;
    this.hits = 0;
    this.falls = 0;
    for (const g of GATES) this.gateFade[g.id] = 0;
    this.hintTimer = 7;
    this.lowPaintWarned = false;
    this.lastTime = 0;
    this.flashes.length = 0;
    this.toasts.length = 0;
    this.hurtFlash = 0;
    this.input.clear();
    this.camera.snap(this.player);
  }

  getSummary() {
    const cfg = DIFFICULTIES[this.runDifficulty] || DIFFICULTIES.medium;
    return {
      score: this.score,
      best: this.best,
      maxScore: this.maxScore,
      difficulty: cfg.label,
      difficultyId: this.runDifficulty,
      pictures: this.picturesCollected,
      picturesTotal: TOTAL_PICTURES,
      puzzles: this.puzzles.solvedCount(),
      puzzlesTotal: this.totalPuzzles,
      paint: Math.floor(this.paint),
      maxPaint: this.maxPaint,
      hearts: this.hearts,
      maxLives: this.maxLives,
      time: formatTime(this.runTime),
      hits: this.hits,
      falls: this.falls,
      paintSpent: Math.round(this.paintSpent),
    };
  }

  get hallLabel() {
    const cx = this.player.x + this.player.w / 2;
    for (const h of HALLS) {
      if (cx >= h.x0 && cx < h.x1) return h.label;
    }
    return HALLS[HALLS.length - 1].label;
  }

  // ---------- ввод ----------
  _screenToWorld(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const sx = (clientX - r.left) * (this.canvas.width / r.width);
    const sy = (clientY - r.top) * (this.canvas.height / r.height);
    return { x: sx + this.camera.x, y: sy + this.camera.y };
  }

  _drawStart(wx, wy) {
    if (this.state !== 'playing') return false;
    if (this.paint + 1e-9 < COST_PER_CELL && !this._atPuzzle(wx, wy)) {
      this._toast('Краска закончилась — ищи полотно');
      return false;
    }
    const ok = this.brush.begin(wx, wy);
    if (ok) this.audio.play('paint');
    return ok;
  }

  _drawMove(wx, wy) {
    if (this.state !== 'playing' || !this.brush.isDrawing) return false;
    const ok = this.brush.extend(wx, wy);
    if (!ok) {
      this.brush.finishDraw(true);
      return false;
    }
    return true;
  }

  _onBrushCell(gx, gy) {
    const inPuzzle = this.puzzles.isInsideCell(gx, gy);
    if (!inPuzzle) {
      if (this.paint + 1e-9 < COST_PER_CELL) return false;
      this.paint = Math.max(0, this.paint - COST_PER_CELL);
      this.paintSpent += COST_PER_CELL;
      this.audio.play('paint');
    }
    return true;
  }

  _commitBrushCell(gx, gy) {
    const res = this.puzzles.paintCell(gx, gy);
    if (!res.counted) return;
    if (res.solved) {
      this.puzzlesSolved = this.puzzles.solvedCount();
      this.score += 2;
      const c = this.puzzles.centerOf(res.puzzle);
      this.flashes.push({ x: c.x, y: c.y, t: 0.55, max: 0.55, hue: 120 });
      this.audio.play('puzzle');
      this.audio.play('gate');
      this._toast(`${res.puzzle.name}: печать снята — проход открыт`);
    }
  }

  _atPuzzle(wx, wy) {
    return this.puzzles.isInsideCell(
      Math.floor(wx / 12),
      Math.floor(wy / 12)
    );
  }

  _bindVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.state === 'playing') this.pause();
        else {
          this.input.clear();
          this.lastTime = 0;
        }
      }
    });
  }

  // ---------- игровой цикл ----------
  _startLoop() {
    if (this.rafId !== null) return;
    this.lastTime = 0;
    this.rafId = requestAnimationFrame(this._loop);
  }

  _loop(time) {
    this.rafId = requestAnimationFrame(this._loop);

    if (this.lastTime === 0) {
      this.lastTime = time;
      this._updateAmbient(0);
      this.render();
      return;
    }

    let dt = (time - this.lastTime) / 1000;
    this.lastTime = time;
    if (dt < 0) dt = 0;
    if (dt > 1 / 30) dt = 1 / 30;

    this._updateAmbient(dt);
    if (this.state === 'playing') this.update(dt);
    this.render();
  }

  _updateAmbient(dt) {
    this.stateTime += dt;
    this.fade = Math.max(0, this.fade - dt * 2.4);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3.2);
    this._updateFlashes(dt);
    for (const t of this.toasts) t.t -= dt;
    this.toasts = this.toasts.filter((t) => t.t > 0);

    for (const g of GATES) {
      if (this.puzzles.isSolved(g.puzzle)) {
        this.gateFade[g.id] = Math.min(1, this.gateFade[g.id] + dt * 2.6);
      }
    }
  }

  update(dt) {
    this.runTime += dt;
    this.hintTimer = Math.max(0, this.hintTimer - dt);
    this.brush.update(dt);
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);

    const near = {
      x: this.player.x - 72,
      y: this.player.y - 72,
      w: this.player.w + 144,
      h: this.player.h + 144,
    };
    const solids = PLATFORMS.slice();
    const gates = this._activeGates();
    solids.push(...gates);
    solids.push(...this.brush.solidsNear(near));

    this.player.update(dt, solids, this.input.keys);
    this.input.keys.jumpPressed = false;

    if (this.player.x < 0) {
      this.player.x = 0;
      this.player.vx = 0;
    } else if (this.player.x + this.player.w > WORLD.w) {
      this.player.x = WORLD.w - this.player.w;
      this.player.vx = 0;
    }

    if (this.player.justJumped) this.audio.play('jump');
    if (this.player.justLanded) this.audio.play('land');

    // Регенерация только на статичной платформе, не на меловом мосту.
    if (this.player.onGround && this._onStaticPlatform() && this.invuln <= 0) {
      this.paint = Math.min(this.maxPaint, this.paint + this.regenPerSec * dt);
      this._saveCheckpoint();
    }

    if (this.paint < this.maxPaint * 0.18 && !this.lowPaintWarned) {
      this.lowPaintWarned = true;
      this._toast('Краска на исходе — экономь мосты');
    } else if (this.paint > this.maxPaint * 0.4) {
      this.lowPaintWarned = false;
    }

    // Картины.
    for (const pic of this.pictures) {
      if (pic.collected) continue;
      if (rectsOverlap(this.player, pic)) {
        pic.collected = true;
        this.picturesCollected += 1;
        this.score += 1;
        this.paint = Math.min(this.maxPaint, this.paint + this.picturePaint);
        this.flashes.push({
          x: pic.x + pic.w / 2,
          y: pic.y + pic.h / 2,
          t: 0.4,
          max: 0.4,
          hue: pic.hue,
        });
        this.audio.play('collect');
        this._toast(
          `Полотно возвращено: ${this.picturesCollected} / ${TOTAL_PICTURES}`
        );
      }
    }

    // Враги и их снаряды.
    this.enemies.update(dt, {
      player: this.player,
      brush: this.brush,
      solids: PLATFORMS.concat(this._activeGates()),
    });
    for (const ev of this.enemies.consumeEvents()) {
      if (ev.type === 'shoot') this.audio.play('shoot');
      else if (ev.type === 'block') this.audio.play('block');
      else if (ev.type === 'playerHit') this._damage('projectile', ev);
    }

    const hitEnemy = this.enemies.checkHit(this.player);
    if (hitEnemy) this._damage('enemy', hitEnemy);

    // Опасные зоны.
    for (const d of DANGERS) {
      if (rectsOverlap(this.player, d)) {
        this._damage('danger');
        break;
      }
    }

    // Падение в бездну.
    if (this.player.y > WORLD.h + 80) {
      this._damage('fall');
    }

    if (this._doorOpen() && rectsOverlap(this.player, DOOR)) {
      this._win();
      return;
    }

    this.camera.follow(this.player);
  }

  _activeGates() {
    const out = [];
    for (const g of GATES) {
      if (!this.puzzles.isSolved(g.puzzle)) {
        out.push({ x: g.x, y: g.y, w: g.w, h: g.h });
      }
    }
    return out;
  }

  _doorOpen() {
    return (
      this.picturesCollected >= TOTAL_PICTURES &&
      this.puzzles.solvedCount() >= this.totalPuzzles
    );
  }

  _saveCheckpoint() {
    const p = this._staticPlatformUnder();
    if (!p) return;
    for (const d of DANGERS) {
      if (rectsOverlap(this.player, d)) return;
    }
    this.checkpoint = { x: this.player.x, y: this.player.y };
  }

  _staticPlatformUnder() {
    const feet = this.player.y + this.player.h;
    const cx = this.player.x + this.player.w / 2;
    for (const p of PLATFORMS) {
      if (
        Math.abs(feet - p.y) < 2.5 &&
        cx > p.x + 4 &&
        cx < p.x + p.w - 4
      ) {
        return p;
      }
    }
    return null;
  }

  _onStaticPlatform() {
    return this._staticPlatformUnder() !== null;
  }

  // Урон: -1 жизнь и секунда неуязвимости. Враг отбрасывает, опасность
  // и бездна возвращают на последнюю твёрдую полку.
  _damage(kind, source) {
    if (this.invuln > 0 || this.state !== 'playing') return;

    this.hearts -= 1;
    this.hits += 1;
    this.invuln = 1;
    this.hurtFlash = 1;
    this.audio.play('hit');

    if (this.hearts <= 0) {
      this.hearts = 0;
      this._lose();
      return;
    }

    if (kind === 'enemy') {
      const ecx = source
        ? source.x + (source.w !== undefined ? source.w / 2 : 0)
        : this.player.x + this.player.w / 2;
      const dir = this.player.x + this.player.w / 2 >= ecx ? 1 : -1;
      this.player.x += dir * 16;
      this.player.vy = -300;
      this.player.onGround = false;
      this._toast('Осторожно — экспонат живой');
    } else if (kind === 'projectile') {
      const dir = source && source.x > this.player.x + this.player.w / 2 ? -1 : 1;
      this.player.x += dir * 10;
      this.player.vy = -260;
      this.player.onGround = false;
      this._toast('Снаряд! Меловая стена его остановит');
    } else {
      if (kind === 'fall') this.falls += 1;
      this.player.x = this.checkpoint.x;
      this.player.y = this.checkpoint.y;
      this.player.vx = 0;
      this.player.vy = 0;
      this.invuln = 1.5;
      this._toast('Возврат к последней твёрдой полке');
    }
  }

  _updateFlashes(dt) {
    for (const f of this.flashes) f.t -= dt;
    this.flashes = this.flashes.filter((f) => f.t > 0);
  }

  _toast(text) {
    this.toasts.push({ text, t: 2.4, max: 2.4 });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  _win() {
    if (this.state !== 'playing') return;
    this.score += this.winBonus;
    this.updateBest();
    this.brush.finishDraw(false);
    this.input.clear();
    this._setState('outro');
    this.audio.play('win');
  }

  _lose() {
    if (this.state !== 'playing') return;
    this.updateBest();
    this.brush.finishDraw(false);
    this.input.clear();
    this._setState('lost');
    this.audio.play('lose');
  }

  updateBest() {
    if (this.score > this.best) {
      this.best = this.score;
      this.saveBest();
    }
  }

  saveBest() {
    try {
      localStorage.setItem(BEST_KEY, String(this.best));
    } catch {
      /* приватный режим */
    }
  }

  loadBest() {
    try {
      const v = parseInt(localStorage.getItem(BEST_KEY) || '0', 10);
      if (Number.isNaN(v) || v < 0) return 0;
      return v;
    } catch {
      return 0;
    }
  }

  _loadBest() {
    return this.loadBest();
  }

  getCutscene(kind) {
    return CUTSCENES[kind] || [];
  }

  // ---------- рендер ----------
  render() {
    const ctx = this.ctx;
    const time = performance.now() / 1000;

    this._drawBackground(ctx);
    ctx.save();
    ctx.translate(-this.camera.x, -this.camera.y);

    this._drawGallery(ctx, time);
    this._drawPits(ctx);
    this._drawPlatforms(ctx);
    this._drawGates(ctx, time);
    this._drawDoor(ctx, time);
    this._drawPictures(ctx, time);
    this._drawDangers(ctx);
    this._drawBrush(ctx, time);

    const hidden = new Set();
    for (const g of GATES) {
      if (this.gateFade[g.id] >= 0.95) hidden.add(g.id);
    }
    this.puzzles.render(ctx, time, hidden);
    this.enemies.render(ctx, time);
    this._drawFlashes(ctx);

    const blink = this.invuln > 0 && Math.floor(time * 12) % 2 === 0;
    ctx.save();
    if (blink) ctx.globalAlpha = 0.5;
    this.player.render(ctx, time);
    ctx.restore();

    ctx.restore();

    this._drawDust(ctx, time);

    if (this.state === 'playing' || this.state === 'paused') {
      this._drawHUD(ctx);
    }
    if (this.state === 'playing' && this.hintTimer > 0) this._drawHint(ctx);
    this._drawToasts(ctx);
    this._drawHurt(ctx);
    this._drawOverlay(ctx);
    this._drawFade(ctx);
  }

  _drawBackground(ctx) {
    ctx.fillStyle = '#0a0c12';
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  }

  _drawGallery(ctx, time) {
    // Стена и пол галереи.
    ctx.fillStyle = '#171b26';
    ctx.fillRect(0, 0, WORLD.w, 1120);
    ctx.fillStyle = '#141822';
    ctx.fillRect(0, 0, WORLD.w, 470);
    ctx.fillStyle = '#1b1f2a';
    ctx.fillRect(0, 1020, WORLD.w, 100);
    ctx.fillStyle = '#2a3040';
    ctx.fillRect(0, 1020, WORLD.w, 2);

    // Потолочный карниз.
    ctx.fillStyle = '#1d2231';
    ctx.fillRect(0, 0, WORLD.w, 30);
    ctx.fillStyle = '#232838';
    ctx.fillRect(0, 30, WORLD.w, 4);
    ctx.fillStyle = '#0f121a';
    ctx.fillRect(0, 34, WORLD.w, 8);

    // Вертикальные швы панелей.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= WORLD.w; x += 240) {
      ctx.moveTo(Math.round(x) + 0.5, 42);
      ctx.lineTo(Math.round(x) + 0.5, 1120);
    }
    ctx.stroke();

    // Пилястры на границах залов.
    for (const x of DECOR.pilasters) {
      ctx.fillStyle = '#1c2130';
      ctx.fillRect(x - 13, 42, 26, 1078);
      ctx.fillStyle = '#232a3a';
      ctx.fillRect(x - 18, 42, 36, 9);
      ctx.fillRect(x - 18, 1080, 36, 12);
      ctx.fillStyle = 'rgba(200, 170, 90, 0.18)';
      ctx.fillRect(x - 13, 51, 2, 1029);
    }

    // Названия залов.
    ctx.textAlign = 'center';
    ctx.font = '600 13px Georgia, serif';
    for (const hall of HALLS) {
      ctx.fillStyle = 'rgba(210, 180, 110, 0.38)';
      ctx.fillText(hall.label, hall.center, 66);
      ctx.fillStyle = 'rgba(210, 180, 110, 0.18)';
      ctx.fillRect(hall.center - 30, 74, 60, 1);
    }

    // Окна: плоское ночное небо и луна из 2–3 кругов.
    for (const w of DECOR.windows) {
      ctx.fillStyle = '#0b0f18';
      ctx.fillRect(w.x - 10, w.y - 10, w.w + 20, w.h + 20);
      ctx.strokeStyle = '#6d5423';
      ctx.lineWidth = 4;
      ctx.strokeRect(w.x - 7, w.y - 7, w.w + 14, w.h + 14);

      ctx.fillStyle = '#101a30';
      ctx.fillRect(w.x, w.y, w.w, w.h);

      ctx.fillStyle = 'rgba(215, 225, 250, 0.55)';
      for (let i = 0; i < 7; i++) {
        const sx =
          w.x + 14 + ((i * 53 + w.x * 3) % Math.max(1, w.w - 28));
        const sy =
          w.y + 16 + ((i * 71 + w.y * 7) % Math.max(1, w.h * 0.5));
        ctx.fillRect(Math.round(sx), Math.round(sy), 2, 2);
      }

      if (w.moon) {
        const mx = w.x + w.w * 0.42;
        const my = w.y + w.h * 0.34;
        ctx.fillStyle = '#e6e2d2';
        ctx.beginPath();
        ctx.arc(mx, my, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#cfd0c4';
        ctx.beginPath();
        ctx.arc(mx - 9, my - 7, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#101a30';
        ctx.beginPath();
        ctx.arc(mx + 12, my + 6, 26, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = '#6d5423';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w.x + w.w / 2, w.y);
      ctx.lineTo(w.x + w.w / 2, w.y + w.h);
      ctx.moveTo(w.x, w.y + w.h * 0.6);
      ctx.lineTo(w.x + w.w, w.y + w.h * 0.6);
      ctx.stroke();

      // Подоконник.
      ctx.fillStyle = '#20242e';
      ctx.fillRect(w.x - 12, w.y + w.h + 7, w.w + 24, 7);
    }

    // Пустые рамы.
    for (let i = 0; i < DECOR.frames.length; i++) {
      const f = DECOR.frames[i];
      const rand = mulberry32(i * 977 + 31);
      ctx.fillStyle = '#12151d';
      ctx.fillRect(f.x - 6, f.y - 6, f.w + 12, f.h + 12);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = f.lw;
      roughLine(ctx, f.x, f.y, f.x + f.w, f.y, 2.2, rand);
      roughLine(ctx, f.x + f.w, f.y, f.x + f.w, f.y + f.h, 2.2, rand);
      roughLine(ctx, f.x + f.w, f.y + f.h, f.x, f.y + f.h, 2.2, rand);
      roughLine(ctx, f.x, f.y + f.h, f.x, f.y, 2.2, rand);

      const cx = f.x + f.w / 2;
      const cy = f.y + f.h / 2;
      ctx.fillStyle = 'rgba(200, 190, 160, 0.16)';
      if (f.kind === 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, Math.min(f.w, f.h) * 0.26, 0, Math.PI * 2);
        ctx.fill();
      } else if (f.kind === 1) {
        ctx.beginPath();
        ctx.moveTo(cx, cy - f.h * 0.28);
        ctx.lineTo(cx + f.w * 0.3, cy + f.h * 0.24);
        ctx.lineTo(cx - f.w * 0.3, cy + f.h * 0.24);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(cx - f.w * 0.24, cy - f.h * 0.22, f.w * 0.48, f.h * 0.44);
      }
    }

    // Плоские настенные лампы.
    for (const x of DECOR.lamps) {
      ctx.strokeStyle = '#4a3d26';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, 42);
      ctx.lineTo(x, 70);
      ctx.stroke();
      ctx.fillStyle = '#2a3040';
      ctx.beginPath();
      ctx.moveTo(x - 9, 78);
      ctx.lineTo(x + 9, 78);
      ctx.lineTo(x + 5, 68);
      ctx.lineTo(x - 5, 68);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e6d8a8';
      ctx.fillRect(x - 4, 74, 8, 4);
    }
  }

  _drawPits(ctx) {
    for (const pit of PITS) {
      ctx.fillStyle = '#05070c';
      ctx.fillRect(pit.x, 1120, pit.w, WORLD.h - 1120);
      ctx.fillStyle = '#080b12';
      ctx.fillRect(pit.x, 1120, pit.w, 12);
      ctx.fillStyle = '#2a3040';
      ctx.fillRect(pit.x, 1120, pit.w, 2);
      ctx.strokeStyle = 'rgba(120, 140, 190, 0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i <= 3; i++) {
        const x = pit.x + (pit.w * i) / 4;
        ctx.moveTo(Math.round(x) + 0.5, 1128);
        ctx.lineTo(Math.round(x) + 0.5, WORLD.h);
      }
      ctx.stroke();
    }
  }

  _drawPlatforms(ctx) {
    for (let i = 0; i < PLATFORMS.length; i++) {
      const p = PLATFORMS[i];
      const rand = mulberry32(i * 613 + 97);
      const kind = p.kind || 'floor';

      if (kind === 'bridge') {
        // Подвесной мостик: доски и верёвки к верхним крюкам.
        ctx.strokeStyle = '#8a7440';
        ctx.lineWidth = 2;
        for (const side of [p.x + 5, p.x + p.w - 5]) {
          ctx.beginPath();
          ctx.moveTo(side, p.y + 2);
          ctx.quadraticCurveTo(
            side + (side < p.x + p.w / 2 ? -8 : 8),
            (p.y + p.anchorY) / 2,
            side,
            p.anchorY
          );
          ctx.stroke();
        }
        ctx.fillStyle = '#4a3a22';
        ctx.fillRect(p.x + 2, p.anchorY - 3, 8, 5);
        ctx.fillRect(p.x + p.w - 10, p.anchorY - 3, 8, 5);

        ctx.fillStyle = '#3a2f22';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = '#2b241b';
        ctx.fillRect(p.x, p.y + p.h - 4, p.w, 4);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = p.x + 16; x < p.x + p.w - 4; x += 18) {
          ctx.moveTo(Math.round(x) + 0.5, p.y + 2);
          ctx.lineTo(Math.round(x) + 0.5, p.y + p.h - 2);
        }
        ctx.stroke();
      } else if (kind === 'beam') {
        // Балка под потолком: дерево, металлические накладки, раскосы.
        ctx.fillStyle = '#2a2318';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = '#1e1a13';
        ctx.fillRect(p.x, p.y + p.h - 4, p.w, 4);
        ctx.strokeStyle = 'rgba(200, 170, 90, 0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = p.x + 30; x < p.x + p.w - 10; x += 46) {
          ctx.moveTo(x, p.y + 4);
          ctx.lineTo(x + 22, p.y + 4);
        }
        ctx.stroke();
        ctx.fillStyle = '#3c4353';
        for (let x = p.x + 12; x < p.x + p.w; x += 120) {
          ctx.fillRect(x, p.y + p.h - 3, 10, 3);
        }
        ctx.strokeStyle = '#3c4353';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p.x + 18, p.y + p.h);
        ctx.lineTo(p.x + 2, p.y + p.h + 22);
        ctx.moveTo(p.x + p.w - 18, p.y + p.h);
        ctx.lineTo(p.x + p.w - 2, p.y + p.h + 22);
        ctx.stroke();
      } else {
        // Пол, полка или карниз.
        const floorLike = kind === 'floor';
        ctx.fillStyle = floorLike
          ? i % 2 === 0
            ? '#1c212c'
            : '#1f2431'
          : kind === 'cornice'
            ? '#2a3040'
            : '#232835';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(p.x, p.y + p.h - 3, p.w, 3);

        if (floorLike && p.h > 40) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let x = p.x + 46; x < p.x + p.w - 8; x += 58) {
            ctx.moveTo(Math.round(x) + 0.5, p.y + 12);
            ctx.lineTo(Math.round(x) + 0.5, p.y + p.h - 6);
          }
          ctx.stroke();
        } else {
          // Кронштейны у полок.
          ctx.fillStyle = '#1a1e28';
          const b = Math.min(14, p.h);
          for (const bx of [p.x + 9, p.x + p.w - 9]) {
            ctx.beginPath();
            ctx.moveTo(bx - 4, p.y + p.h);
            ctx.lineTo(bx - 4, p.y + p.h - b);
            ctx.lineTo(bx + 7, p.y + p.h);
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      // Золотая кромка: 2–3 неточных сегмента.
      const segs = p.w > 200 ? 3 : 2;
      ctx.strokeStyle = '#c8aa5a';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (let s = 0; s < segs; s++) {
        const x1 = p.x + (p.w * s) / segs;
        const x2 = p.x + (p.w * (s + 1)) / segs;
        const y1 = p.y + 1 + (rand() - 0.5) * 1.6;
        const y2 = p.y + 1 + (rand() - 0.5) * 1.6;
        roughLine(ctx, x1, y1, x2, y2, 1.1, rand);
      }
    }
  }

  _drawGates(ctx) {
    for (const g of GATES) {
      const fade = this.gateFade[g.id] || 0;
      const alpha = 1 - fade;
      if (alpha <= 0.02) continue;
      const rand = mulberry32(g.x * 17 + 3);

      ctx.save();
      ctx.globalAlpha = alpha;

      // Каменная стена-перегородка.
      ctx.fillStyle = '#2b3140';
      ctx.fillRect(g.x, g.y, g.w, g.h);
      ctx.fillStyle = '#242a37';
      ctx.fillRect(g.x, g.y, 12, g.h);
      ctx.fillRect(g.x + g.w - 12, g.y, 12, g.h);

      ctx.strokeStyle = '#1a1e28';
      ctx.lineWidth = 2;
      ctx.beginPath();
      let row = 0;
      for (let y = g.y; y < g.y + g.h; y += 22) {
        ctx.moveTo(g.x, Math.round(y) + 0.5);
        ctx.lineTo(g.x + g.w, Math.round(y) + 0.5);
        const off = row % 2 === 0 ? 0 : 14;
        for (let x = g.x + off; x < g.x + g.w; x += 28) {
          ctx.moveTo(Math.round(x) + 0.5, Math.round(y) + 0.5);
          ctx.lineTo(Math.round(x) + 0.5, Math.round(y + 22) + 0.5);
        }
        row++;
      }
      ctx.stroke();

      // Верхний карниз и цоколь.
      ctx.fillStyle = '#394153';
      ctx.fillRect(g.x - 8, g.y - 10, g.w + 16, 14);
      ctx.fillStyle = '#4a5264';
      ctx.fillRect(g.x - 8, g.y - 10, g.w + 16, 3);
      ctx.fillStyle = '#1b202b';
      ctx.fillRect(g.x - 6, g.y + g.h - 20, g.w + 12, 20);

      // Боковые пилястры.
      ctx.fillStyle = '#323948';
      ctx.fillRect(g.x - 7, g.y, 9, g.h);
      ctx.fillRect(g.x + g.w - 2, g.y, 9, g.h);
      ctx.fillStyle = 'rgba(200, 170, 90, 0.2)';
      ctx.fillRect(g.x - 7, g.y + 6, 2, g.h - 26);
      ctx.fillRect(g.x + g.w + 5, g.y + 6, 2, g.h - 26);

      // Большая римская цифра — едва заметная метка печати.
      ctx.textAlign = 'center';
      ctx.font = 'bold 74px Georgia, serif';
      ctx.fillStyle = 'rgba(200, 170, 90, 0.07)';
      ctx.fillText(g.roman, g.x + g.w / 2, g.y + 150);

      // Углублённая панель под пазл.
      const pw = Math.min(170, g.w - 24);
      const px = g.x + g.w / 2 - pw / 2;
      const py = 620;
      const ph = 210;
      ctx.fillStyle = '#121620';
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = '#6d5423';
      ctx.lineWidth = 3;
      ctx.strokeRect(px, py, pw, ph);
      ctx.strokeStyle = 'rgba(200, 170, 90, 0.28)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 6, py + 6, pw - 12, ph - 12);
      ctx.fillStyle = '#c8aa5a';
      for (const [sx, sy] of [
        [px + 7, py + 7],
        [px + pw - 7, py + 7],
        [px + 7, py + ph - 7],
        [px + pw - 7, py + ph - 7],
      ]) {
        ctx.fillRect(sx - 2, sy - 2, 4, 4);
      }

      // Подпись печати.
      ctx.font = 'bold 11px "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(230, 210, 160, 0.8)';
      ctx.fillText(g.label, g.x + g.w / 2, py + ph - 12);

      // Неровная золотая линия по верху — рукодельный штрих.
      ctx.strokeStyle = '#c8aa5a';
      ctx.lineWidth = 2;
      roughLine(ctx, g.x + 4, g.y - 4, g.x + g.w - 4, g.y - 4, 1.3, rand);

      ctx.restore();
    }
  }

  _drawDoor(ctx) {
    const d = DOOR;
    const open = this._doorOpen();
    const rand = mulberry32(777);

    ctx.fillStyle = open ? '#3a2c18' : '#20242e';
    ctx.fillRect(d.x - 8, d.y - 8, d.w + 16, d.h + 8);

    if (open) {
      ctx.fillStyle = '#0a0c12';
      ctx.fillRect(d.x, d.y, d.w, d.h);
      ctx.fillStyle = '#4a3a22';
      ctx.fillRect(d.x + 2, d.y + 2, d.w - 4, d.h - 4);
      ctx.strokeStyle = '#6b5430';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 1; i < 3; i++) {
        ctx.moveTo(d.x + (d.w * i) / 3, d.y + 4);
        ctx.lineTo(d.x + (d.w * i) / 3, d.y + d.h - 4);
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = '#6b4a2c';
      ctx.fillRect(d.x, d.y, d.w, d.h);
      ctx.strokeStyle = '#4c331c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 1; i < 3; i++) {
        const x = d.x + (d.w * i) / 3;
        ctx.moveTo(Math.round(x) + 0.5, d.y + 2);
        ctx.lineTo(Math.round(x) + 0.5, d.y + d.h - 2);
      }
      ctx.stroke();
      ctx.strokeStyle = '#8a6740';
      ctx.lineWidth = 2;
      roughLine(ctx, d.x + 3, d.y + 3, d.x + d.w - 3, d.y + 3, 1.6, rand);

      ctx.fillStyle = '#d8b45a';
      ctx.beginPath();
      ctx.arc(d.x + d.w - 11, d.y + d.h * 0.52, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a6a2c';
      ctx.beginPath();
      ctx.arc(d.x + d.w - 11, d.y + d.h * 0.52, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    const label = 'ВЫХОД';
    ctx.font = 'bold 9px "Segoe UI", sans-serif';
    const tw = ctx.measureText(label).width + 14;
    const tx = d.x + d.w / 2 - tw / 2;
    const ty = d.y - 26;
    ctx.fillStyle = '#d8cfb4';
    ctx.beginPath();
    ctx.moveTo(tx + 2, ty);
    ctx.lineTo(tx + tw - 1, ty + 2);
    ctx.lineTo(tx + tw, ty + 15);
    ctx.lineTo(tx + 1, ty + 17);
    ctx.lineTo(tx, ty + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2b2318';
    ctx.textAlign = 'center';
    ctx.fillText(label, d.x + d.w / 2, ty + 12);
  }

  _drawPictures(ctx, time) {
    for (const pic of this.pictures) {
      if (pic.collected) continue;
      const bob = Math.sin(time * 1.7 + pic.x * 0.02) * 2;
      const x = pic.x;
      const y = pic.y + bob;
      const rand = mulberry32(pic.x * 31 + 7);

      ctx.fillStyle = '#b8933f';
      ctx.fillRect(x - 5, y - 5, pic.w + 10, pic.h + 10);
      ctx.fillStyle = '#d8bb6a';
      ctx.fillRect(x - 5, y - 5, pic.w + 10, 3);

      ctx.fillStyle = '#191d26';
      ctx.fillRect(x, y, pic.w, pic.h);

      const cx = x + pic.w / 2;
      const cy = y + pic.h / 2;
      ctx.fillStyle = `hsl(${pic.hue}, 55%, 52%)`;
      ctx.beginPath();
      ctx.arc(cx, cy + 2, pic.w * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `hsl(${(pic.hue + 40) % 360}, 45%, 38%)`;
      ctx.fillRect(cx - pic.w * 0.3, cy + pic.w * 0.22, pic.w * 0.6, pic.h * 0.2);

      ctx.strokeStyle = 'rgba(190, 160, 110, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, y - 5);
      ctx.lineTo(cx, y - 12);
      ctx.stroke();
      roughLine(ctx, cx - 6, y - 12, cx + 6, y - 12, 1, rand);
    }
  }

  _drawDangers(ctx) {
    for (const d of DANGERS) {
      if (d.type === 'puddle') {
        const cx = d.x + d.w / 2;
        const cy = d.y + d.h / 2;
        ctx.fillStyle = '#5a1a20';
        ctx.beginPath();
        ctx.ellipse(cx, cy, d.w / 2, d.h / 2 + 1, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(232, 190, 190, 0.5)';
        ctx.fillRect(cx - d.w * 0.22, cy - 2, 12, 2);
        ctx.fillRect(cx + d.w * 0.08, cy + 1, 8, 2);
      } else {
        const count = Math.min(5, Math.max(3, Math.round(d.w / 10)));
        const tw = d.w / count;
        const rand = mulberry32(d.x * 13 + 3);
        ctx.fillStyle = '#22262f';
        ctx.fillRect(d.x, d.y + d.h - 4, d.w, 4);
        for (let i = 0; i < count; i++) {
          const sx = d.x + i * tw;
          const h = d.h * (0.55 + rand() * 0.45);
          ctx.fillStyle = '#8d94a1';
          ctx.beginPath();
          ctx.moveTo(sx + 1, d.y + d.h - 3);
          ctx.lineTo(sx + tw / 2, d.y + d.h - 3 - h);
          ctx.lineTo(sx + tw - 1, d.y + d.h - 3);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#c3c9d4';
          ctx.beginPath();
          ctx.moveTo(sx + tw / 2, d.y + d.h - 3 - h);
          ctx.lineTo(sx + tw / 2 - 1.5, d.y + d.h - 3 - h * 0.45);
          ctx.lineTo(sx + tw / 2 + 1.5, d.y + d.h - 3 - h * 0.45);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  _drawBrush(ctx, time) {
    this.brush.forEachVisible(
      this.camera.x - 12,
      this.camera.y - 12,
      this.camera.x + VIEW.w + 12,
      this.camera.y + VIEW.h + 12,
      (cell) => {
        let alpha = 0.85;
        if (cell.ttl < 0.7) {
          alpha = 0.2 + 0.8 * Math.abs(Math.sin(time * 22 + cell.phase));
        }
        ctx.globalAlpha = alpha;

        const rand = mulberry32(Math.floor(cell.seed * 1000));
        const x = cell.x;
        const y = cell.y;
        ctx.fillStyle = '#f0ead8';
        ctx.beginPath();
        ctx.moveTo(x + 1 + rand() * 2, y + rand() * 1.5);
        ctx.lineTo(x + 11 - rand() * 1.5, y + rand() * 2);
        ctx.lineTo(x + 11 - rand(), y + 11 - rand() * 2);
        ctx.lineTo(x + rand() * 2, y + 11 - rand());
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fillRect(x + 2, y + 2, 8, 2);
        ctx.fillStyle = 'rgba(160, 150, 130, 0.3)';
        ctx.fillRect(x + 2, y + 9, 8, 1.5);
        ctx.fillStyle = 'rgba(245, 240, 225, 0.75)';
        ctx.fillRect(
          x + 3 + (cell.seed % 5),
          y + 4 + ((cell.seed * 3) % 4),
          1.5,
          1.5
        );

        ctx.globalAlpha = 1;
      }
    );
  }

  _drawFlashes(ctx) {
    for (const f of this.flashes) {
      const k = 1 - f.t / f.max;
      const a = 1 - k;
      const r = 12 + 46 * k;

      ctx.strokeStyle = `hsla(${f.hue}, 85%, 74%, ${0.95 * a})`;
      ctx.lineWidth = 3 * a + 1;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(255, 246, 214, ${0.6 * a})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  _drawDust(ctx, time) {
    for (const d of this.dust) {
      const x =
        ((d.x - this.camera.x * 0.08 + Math.sin(time * 0.3 + d.phase) * d.drift) %
          VIEW.w +
          VIEW.w) %
        VIEW.w;
      const y =
        ((d.y - this.camera.y * 0.05 + Math.cos(time * 0.22 + d.phase) * 9) %
          VIEW.h +
          VIEW.h) %
        VIEW.h;
      ctx.fillStyle = `rgba(225, 232, 245, ${d.alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- HUD ----------
  _drawHUD(ctx) {
    this._drawFlask(ctx, 22, 18);

    ctx.textAlign = 'left';
    ctx.font = '600 12px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(210, 180, 110, 0.66)';
    ctx.fillText(this.hallLabel, 22, 112);

    if (this.paint < this.maxPaint * 0.18) {
      ctx.fillStyle = '#e08080';
      ctx.font = '11px "Segoe UI", sans-serif';
      ctx.fillText('краска на исходе', 22, 130);
    }

    const rx = VIEW.w - 20 - 260;
    const ry = 18;
    const rw = 260;
    const rh = 152;
    ctx.fillStyle = 'rgba(9, 12, 19, 0.8)';
    roundRect(ctx, rx, ry, rw, rh, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200, 170, 90, 0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const rows = [
      ['Картины', `${this.picturesCollected} / ${TOTAL_PICTURES}`, '#f2e7ca'],
      [
        'Пазлы',
        `${this.puzzles.solvedCount()} / ${this.totalPuzzles}`,
        '#f2e7ca',
      ],
      ['Очки', `${this.score} / ${this.maxScore}`, '#f2e7ca'],
      ['Рекорд', String(this.best), '#e8c776'],
    ];
    let ly = ry + 24;
    for (const [label, value, color] of rows) {
      ctx.textAlign = 'left';
      ctx.font = '12px "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(198, 190, 168, 0.7)';
      ctx.fillText(label, rx + 14, ly);
      ctx.textAlign = 'right';
      ctx.font = 'bold 13px "Segoe UI", sans-serif';
      ctx.fillStyle = color;
      ctx.fillText(value, rx + rw - 14, ly);
      ly += 23;
    }

    ctx.textAlign = 'left';
    ctx.font = '12px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(198, 190, 168, 0.7)';
    ctx.fillText('Жизни', rx + 14, ly);
    for (let i = 0; i < this.maxLives; i++) {
      this._drawHeart(ctx, rx + 68 + i * 17, ly - 5, i < this.hearts);
    }

    ctx.textAlign = 'left';
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(198, 190, 168, 0.55)';
    ctx.fillText(
      `Сложность: ${
        (DIFFICULTIES[this.runDifficulty] || DIFFICULTIES.medium).label
      }`,
      rx + 14,
      ry + rh - 12
    );
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(198, 190, 168, 0.4)';
    ctx.fillText(formatTime(this.runTime), rx + rw - 14, ry + rh - 12);
  }

  _drawHeart(ctx, x, y, filled) {
    ctx.beginPath();
    ctx.moveTo(x, y + 5);
    ctx.bezierCurveTo(x - 7, y - 2, x - 4, y - 8, x, y - 3);
    ctx.bezierCurveTo(x + 4, y - 8, x + 7, y - 2, x, y + 5);
    ctx.closePath();
    ctx.fillStyle = filled ? '#c0454f' : 'rgba(120, 120, 130, 0.28)';
    ctx.fill();
  }

  _drawFlask(ctx, x, y) {
    const bodyW = 34;
    const bodyH = 52;
    const neckW = 14;
    const neckH = 12;
    const capH = 7;
    const ratio = clamp(this.paint / this.maxPaint, 0, 1);
    const empty = this.paint <= 0.01;

    ctx.fillStyle = 'rgba(9, 12, 19, 0.78)';
    roundRect(ctx, x - 4, y - 4, bodyW + 8, bodyH + 8, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200, 170, 90, 0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#1a1f2b';
    roundRect(ctx, x, y, bodyW, bodyH, 5);
    ctx.fill();

    const liquidH = (bodyH - 6) * ratio;
    if (liquidH > 0.5) {
      let color;
      if (ratio > 0.5) {
        color = mixHex('#50c060', '#4ac0e0', (ratio - 0.5) / 0.5);
      } else {
        color = mixHex('#e05050', '#50c060', ratio / 0.5);
      }
      ctx.fillStyle = color;
      roundRect(ctx, x + 3, y + bodyH - 3 - liquidH, bodyW - 6, liquidH, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillRect(x + 4, y + bodyH - 4 - liquidH, bodyW - 8, 2);
    }

    ctx.save();
    if (empty) {
      ctx.translate(x + bodyW / 2, y);
      ctx.rotate(0.16);
      ctx.translate(-(x + bodyW / 2), -y);
    }
    ctx.fillStyle = '#232937';
    roundRect(ctx, x + (bodyW - neckW) / 2, y - neckH, neckW, neckH + 2, 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#c8aa5a';
    roundRect(
      ctx,
      x + (bodyW - neckW) / 2 - 2,
      y - neckH - capH,
      neckW + 4,
      capH,
      2
    );
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#e6dcc2';
    ctx.fillRect(x + 3, y + bodyH * 0.38, bodyW - 6, 13);
    ctx.fillStyle = '#2b2318';
    ctx.font = 'bold 7px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('КРАСКА', x + bodyW / 2, y + bodyH * 0.38 + 9.5);

    ctx.textAlign = 'left';
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.fillStyle = '#f2e7ca';
    ctx.fillText(
      `${Math.floor(this.paint)} / ${this.maxPaint}`,
      x + bodyW + 16,
      y + 26
    );
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(198, 190, 168, 0.6)';
    ctx.fillText('краска', x + bodyW + 16, y + 42);
  }

  _drawHint(ctx) {
    const alpha = this.hintTimer < 0.8 ? this.hintTimer / 0.8 : 1;
    const w = 700;
    const h = 66;
    const x = (VIEW.w - w) / 2;
    const y = VIEW.h - 190;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);

    ctx.fillStyle = 'rgba(9, 12, 19, 0.84)';
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200, 170, 90, 0.34)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.strokeStyle = '#b98b4a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 24, y + 43);
    ctx.lineTo(x + 36, y + 27);
    ctx.stroke();
    ctx.fillStyle = '#f2f0e5';
    ctx.beginPath();
    ctx.arc(x + 38, y + 24, 3.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.font = '15px "Segoe UI", sans-serif';
    ctx.fillStyle = '#efe6cf';
    ctx.fillText('Зажми ЛКМ/тап — рисуй кисточкой.', x + 56, y + 28);
    ctx.font = '13px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(202, 192, 166, 0.82)';
    ctx.fillText(
      'Мосты тают, контуры печатей — нет. Восемь залов, три печати, одна дверь.',
      x + 56,
      y + 49
    );
    ctx.restore();
  }

  _drawToasts(ctx) {
    if (!this.toasts.length) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '600 13px "Segoe UI", sans-serif';
    for (let i = 0; i < this.toasts.length; i++) {
      const t = this.toasts[i];
      const alpha = Math.min(1, t.t / 0.5);
      const w = ctx.measureText(t.text).width + 30;
      const x = (VIEW.w - w) / 2;
      const y = 88 + i * 32;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(9, 12, 19, 0.86)';
      roundRect(ctx, x, y, w, 25, 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(200, 170, 90, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#efe6cf';
      ctx.fillText(t.text, VIEW.w / 2, y + 17);
    }
    ctx.restore();
  }

  _drawHurt(ctx) {
    if (this.hurtFlash <= 0) return;
    ctx.fillStyle = `rgba(190, 45, 55, ${0.15 * this.hurtFlash})`;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  }

  _drawOverlay(ctx) {
    if (this.state === 'playing') return;
    const alphas = {
      menu: 0.62,
      intro: 0.4,
      outro: 0.4,
      paused: 0.58,
      won: 0.55,
      lost: 0.58,
    };
    const a = alphas[this.state] ?? 0.55;
    ctx.fillStyle = `rgba(6, 8, 14, ${a})`;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  }

  _drawFade(ctx) {
    if (this.fade <= 0) return;
    ctx.fillStyle = `rgba(4, 5, 10, ${this.fade})`;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  }
}

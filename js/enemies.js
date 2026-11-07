// Враги шести типов.
//
//   patrol   — ходит по площадке и разворачивается у края;
//   jumper   — прыгает на месте;
//   flyer    — летает по синусоиде;
//   shooter  — стоит на точке и стреляет снарядами;
//   guard    — сторож с фонарём: конус света опасен, спина — нет;
//   pendulum — прыгун на цепи: качается и бьёт тяжёлым шаром.
//
// Снаряды стрелков останавливаются меловыми клетками: игрок может
// нарисовать перед собой стену и полностью закрыться от выстрелов.
//
// Любой контакт/снаряд/конус отнимает одну жизнь; после удара у игрока
// секунда неуязвимости. Сами враги не исчезают.

import { ENEMIES, WORLD } from './level.js';
import { rectsOverlap } from './collision.js';

const PATROL_SPEED = 58;
const JUMP_VY = -500;
const GRAVITY = 1400;
const MAX_FALL = 1200;
const SHOT_SPEED = 285;

function rect(x, y, w, h) {
  return { x, y, w, h };
}

function makeEnemy(cfg) {
  if (cfg.type === 'patrol') {
    return {
      ...cfg,
      w: 24,
      h: 32,
      dir: 1,
      vx: PATROL_SPEED,
      vy: 0,
      color: '#3b2b5a',
    };
  }
  if (cfg.type === 'jumper') {
    return {
      ...cfg,
      w: 28,
      h: 28,
      y: cfg.groundY - 28,
      vy: 0,
      jumpTimer: 0.7,
      jumpInterval: 1.9,
      color: '#1f3f2a',
    };
  }
  if (cfg.type === 'flyer') {
    return {
      ...cfg,
      x: cfg.baseX,
      y: cfg.baseY,
      r: 14,
      t: (cfg.baseX % 10) * 0.1,
      color: '#4a1f28',
    };
  }
  if (cfg.type === 'guard') {
    return {
      ...cfg,
      w: 24,
      h: 40,
      dir: cfg.dir || -1,
      flipTimer: cfg.flip || 2,
      coneLength: cfg.coneLength || 190,
      coneHalf: cfg.coneHalf || 0.17,
      color: '#3a2430',
    };
  }
  if (cfg.type === 'pendulum') {
    return {
      ...cfg,
      t: 0,
      bobX: cfg.anchorX,
      bobY: cfg.anchorY + cfg.length,
      bobR: 16,
      color: '#2c3340',
    };
  }
  return {
    ...cfg,
    w: 26,
    h: 40,
    timer: 0.9 + ((cfg.x || 0) % 7) * 0.1,
    flash: 0,
    aimX: cfg.dir || -1,
    aimY: 0,
    color: '#24324a',
  };
}

export class EnemyManager {
  constructor() {
    this._init();
  }

  _init() {
    this.enemies = ENEMIES.map(makeEnemy);
    this.projectiles = [];
    this.sparks = [];
    this.events = [];
  }

  reset() {
    this._init();
  }

  consumeEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  update(dt, world = {}) {
    const player = world.player || null;
    const brush = world.brush || null;
    const solids = world.solids || [];

    for (const e of this.enemies) {
      if (e.type === 'patrol') {
        e.x += e.dir * PATROL_SPEED * dt;
        if (e.x <= e.minX) {
          e.x = e.minX;
          e.dir = 1;
        } else if (e.x >= e.maxX) {
          e.x = e.maxX;
          e.dir = -1;
        }
      } else if (e.type === 'jumper') {
        e.jumpTimer -= dt;
        if (e.jumpTimer <= 0 && e.vy >= 0) {
          e.vy = JUMP_VY;
          e.jumpTimer = e.jumpInterval;
        }
        e.vy = Math.min(MAX_FALL, e.vy + GRAVITY * dt);
        e.y += e.vy * dt;
        if (e.y + e.h >= e.groundY) {
          e.y = e.groundY - e.h;
          e.vy = 0;
        }
      } else if (e.type === 'flyer') {
        e.t += dt;
        e.x = e.baseX + Math.sin(e.t * 0.8) * e.ampX;
        e.y = e.baseY + Math.sin(e.t * 1.15 + 0.6) * e.ampY;
      } else if (e.type === 'shooter') {
        this._updateShooter(e, dt, player);
      } else if (e.type === 'guard') {
        e.flipTimer -= dt;
        if (e.flipTimer <= 0) {
          e.dir *= -1;
          e.flipTimer = e.flip || 2;
        }
      } else if (e.type === 'pendulum') {
        e.t += dt;
        const period = 3;
        const amp = Math.PI / 4; // полный размах 90°
        const angle =
          Math.sin(((e.t + (e.phase || 0)) / period) * Math.PI * 2) * amp;
        e.bobX = e.anchorX + Math.sin(angle) * e.length;
        e.bobY = e.anchorY + Math.cos(angle) * e.length;
      }
    }

    this._updateProjectiles(dt, player, brush, solids);
    this._updateSparks(dt);
  }

  _updateShooter(e, dt, player) {
    e.flash = Math.max(0, e.flash - dt);
    if (!player) return;

    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    const dx = px - cx;
    const dy = py - cy;
    const dist = Math.hypot(dx, dy) || 1;

    e.aimX = dx / dist;
    e.aimY = dy / dist;
    e.dir = dx >= 0 ? 1 : -1;

    e.timer -= dt;
    if (e.timer > 0) return;
    if (dist > e.range || dist < 36) {
      e.timer = 0.35;
      return;
    }

    e.timer = e.cooldown;
    e.flash = 0.13;
    this.projectiles.push({
      x: cx + e.aimX * 17,
      y: cy - 4 + e.aimY * 17,
      vx: e.aimX * SHOT_SPEED,
      vy: e.aimY * SHOT_SPEED,
      r: 4,
      ttl: 3.2,
      life: 3.2,
      color: '#e0a24a',
    });
    this.events.push({ type: 'shoot' });
  }

  _updateProjectiles(dt, player, brush, solids) {
    const alive = [];

    for (const p of this.projectiles) {
      const speed = Math.hypot(p.vx, p.vy) || 1;
      const steps = Math.max(1, Math.ceil((speed * dt) / 4));
      const sub = dt / steps;
      let dead = false;

      for (let i = 0; i < steps && !dead; i++) {
        p.x += p.vx * sub;
        p.y += p.vy * sub;
        p.ttl -= sub;

        if (p.ttl <= 0 || p.x < 0 || p.x > WORLD.w || p.y < 0 || p.y > WORLD.h) {
          dead = true;
          break;
        }

        const box = { x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 };

        // Меловая стена: снаряд полностью останавливается.
        if (brush) {
          let blocked = false;
          for (const cell of brush.solidsNear(box)) {
            if (rectsOverlap(box, cell)) {
              blocked = true;
              break;
            }
          }
          if (blocked) {
            this._spark(p.x, p.y);
            this.events.push({ type: 'block', x: p.x, y: p.y });
            dead = true;
            break;
          }
        }

        // Обычные платформы и закрытые печати.
        for (const s of solids) {
          if (rectsOverlap(box, s)) {
            this._spark(p.x, p.y);
            this.events.push({ type: 'block', x: p.x, y: p.y });
            dead = true;
            break;
          }
        }
        if (dead) break;

        if (player && rectsOverlap(box, player)) {
          this.events.push({ type: 'playerHit', x: p.x, y: p.y });
          dead = true;
          break;
        }
      }

      if (!dead) alive.push(p);
    }

    this.projectiles = alive;
  }

  _spark(x, y) {
    for (let i = 0; i < 3; i++) {
      this.sparks.push({
        x,
        y,
        vx: (i - 1) * 42,
        vy: -30 - i * 18,
        t: 0.26,
        max: 0.26,
        size: 2 + (i % 2),
      });
    }
  }

  _updateSparks(dt) {
    for (const s of this.sparks) {
      s.t -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 420 * dt;
    }
    this.sparks = this.sparks.filter((s) => s.t > 0);
  }

  getRects() {
    const out = [];
    for (const e of this.enemies) {
      if (e.type === 'flyer') {
        out.push({ type: 'circle', cx: e.x, cy: e.y, r: e.r, ref: e });
      } else if (e.type === 'pendulum') {
        out.push({
          type: 'circle',
          cx: e.bobX,
          cy: e.bobY,
          r: e.bobR,
          ref: e,
        });
      } else {
        out.push(rect(e.x, e.y, e.w, e.h));
      }
    }
    return out;
  }

  // Конус фонаря сторожа: попадание только спереди.
  _guardSees(e, player) {
    const gcx = e.x + e.w / 2;
    const pcx = player.x + player.w / 2;

    // Спина сторожа безопасна: всё, что позади, конус не освещает.
    if ((pcx - gcx) * e.dir < 0) return false;

    const eyeX = gcx + e.dir * 9;
    const eyeY = e.y + 13;

    // Ближайшая точка тела игрока к фонарю — так конус ловит и вплотную.
    const nx = Math.max(player.x, Math.min(eyeX, player.x + player.w));
    const ny = Math.max(player.y, Math.min(eyeY, player.y + player.h));
    const dx = nx - eyeX;
    const dy = ny - eyeY;
    const dist = Math.hypot(dx, dy);
    if (dist > e.coneLength) return false;
    if (dist < 1) return true;

    const facing = e.dir > 0 ? 0 : Math.PI;
    const angle = Math.atan2(dy, dx);
    const diff = Math.abs(
      ((angle - facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI
    );
    return diff <= e.coneHalf;
  }

  // Возвращает врага, в которого попал игрок, или null.
  checkHit(player) {
    for (const e of this.enemies) {
      if (e.type === 'flyer') {
        const dx = player.x + player.w / 2 - e.x;
        const dy = player.y + player.h / 2 - e.y;
        if (Math.hypot(dx, dy) < Math.max(player.w, player.h) / 2 + e.r - 2) {
          return e;
        }
      } else if (e.type === 'guard') {
        if (this._guardSees(e, player)) return e;
      } else if (e.type === 'pendulum') {
        const dx = player.x + player.w / 2 - e.bobX;
        const dy = player.y + player.h / 2 - e.bobY;
        if (Math.hypot(dx, dy) < Math.max(player.w, player.h) / 2 + e.bobR - 2) {
          return e;
        }
      } else if (rectsOverlap(player, e)) {
        return e;
      }
    }
    return null;
  }

  render(ctx, time) {
    for (const e of this.enemies) {
      if (e.type === 'patrol') {
        ctx.fillStyle = e.color;
        ctx.fillRect(e.x, e.y, e.w, e.h);
        ctx.fillStyle = '#f2d06b';
        const ex = e.dir > 0 ? e.x + e.w - 7 : e.x + 3;
        ctx.fillRect(ex, e.y + 8, 4, 4);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(e.x, e.y + e.h - 4, e.w, 4);
      } else if (e.type === 'jumper') {
        ctx.fillStyle = e.color;
        ctx.fillRect(e.x, e.y, e.w, e.h);
        ctx.fillStyle = '#d9b75b';
        ctx.fillRect(e.x + 6, e.y + 8, 3, 3);
        ctx.fillRect(e.x + 19, e.y + 8, 3, 3);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(e.x, e.y + e.h - 4, e.w, 4);
      } else if (e.type === 'flyer') {
        const flap = Math.sin(time * 12 + e.t) * 3;
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(10, 8, 12, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(e.x - e.r, e.y);
        ctx.lineTo(e.x - e.r - 6, e.y - 4 + flap);
        ctx.moveTo(e.x - e.r, e.y);
        ctx.lineTo(e.x - e.r - 6, e.y + 4 + flap);
        ctx.moveTo(e.x + e.r, e.y);
        ctx.lineTo(e.x + e.r + 6, e.y - 4 - flap);
        ctx.moveTo(e.x + e.r, e.y);
        ctx.lineTo(e.x + e.r + 6, e.y + 4 - flap);
        ctx.stroke();
        ctx.fillStyle = '#d8b75b';
        ctx.fillRect(e.x - 2, e.y - 1, 4, 3);
      } else if (e.type === 'guard') {
        const cx = e.x + e.w / 2;
        const eyeX = cx + e.dir * 9;
        const eyeY = e.y + 13;
        const facing = e.dir > 0 ? 0 : Math.PI;

        // Конус фонаря: спереди опасно, со спины — нет.
        ctx.save();
        ctx.fillStyle = 'rgba(242, 208, 107, 0.10)';
        ctx.beginPath();
        ctx.moveTo(eyeX, eyeY);
        ctx.arc(
          eyeX,
          eyeY,
          e.coneLength,
          facing - e.coneHalf,
          facing + e.coneHalf
        );
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(242, 208, 107, 0.22)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        // Пальто, плечи, шляпа.
        ctx.fillStyle = e.color;
        ctx.fillRect(e.x + 2, e.y + 11, e.w - 4, e.h - 11);
        ctx.fillStyle = '#4a3340';
        ctx.fillRect(e.x, e.y + 14, e.w, 5);
        ctx.fillStyle = '#2b1c28';
        ctx.fillRect(e.x + 4, e.y, e.w - 8, 11);
        ctx.fillRect(e.x + 1, e.y + 8, e.w - 2, 3);

        // Фонарь в вытянутой руке.
        const lx = cx + e.dir * 15;
        const ly = e.y + 24;
        ctx.strokeStyle = '#6d5a35';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, e.y + 19);
        ctx.lineTo(lx, ly);
        ctx.stroke();
        ctx.fillStyle = '#f2d06b';
        ctx.beginPath();
        ctx.arc(lx, ly + 3, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8a7440';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#f0c05a';
        const ex = e.dir > 0 ? e.x + e.w - 9 : e.x + 5;
        ctx.fillRect(ex, e.y + 4, 3, 2);
      } else if (e.type === 'pendulum') {
        // Подвес от потолка к шарниру (если задан mountY).
        if (typeof e.mountY === 'number') {
          ctx.strokeStyle = '#3c4353';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(e.anchorX, e.mountY);
          ctx.lineTo(e.anchorX, e.anchorY);
          ctx.stroke();
          ctx.fillStyle = '#2a3040';
          ctx.fillRect(e.anchorX - 7, e.mountY, 14, 5);
        }

        // Цепь и тяжёлый шар.
        ctx.strokeStyle = '#4b5262';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(e.anchorX, e.anchorY);
        ctx.lineTo(e.bobX, e.bobY);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(200, 210, 230, 0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(e.anchorX - 1, e.anchorY);
        ctx.lineTo(e.bobX - 1, e.bobY);
        ctx.stroke();

        // Крепление на балке.
        ctx.fillStyle = '#3c4353';
        ctx.fillRect(e.anchorX - 10, e.anchorY - 6, 20, 8);
        ctx.fillStyle = '#5a6373';
        ctx.fillRect(e.anchorX - 4, e.anchorY - 2, 8, 3);

        // Шипы шара.
        ctx.fillStyle = '#1c222d';
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + time * 0.4;
          const x1 = e.bobX + Math.cos(a) * (e.bobR - 2);
          const y1 = e.bobY + Math.sin(a) * (e.bobR - 2);
          const x2 = e.bobX + Math.cos(a) * (e.bobR + 6);
          const y2 = e.bobY + Math.sin(a) * (e.bobR + 6);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.lineTo(x1 + 2, y1 + 2);
          ctx.closePath();
          ctx.fill();
        }

        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(e.bobX, e.bobY, e.bobR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#59627a';
        ctx.beginPath();
        ctx.arc(e.bobX - 4, e.bobY - 5, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#d8c89a';
        ctx.fillRect(e.bobX - 2, e.bobY - 9, 3, 3);
      } else if (e.type === 'shooter') {
        const cx = e.x + e.w / 2;
        const cy = e.y + e.h / 2;
        const mx = cx + e.aimX * 19;
        const my = cy - 4 + e.aimY * 19;

        // Тёмный плащ и капюшон.
        ctx.fillStyle = e.color;
        ctx.fillRect(e.x + 3, e.y + 8, e.w - 6, e.h - 8);
        ctx.fillStyle = '#1a2233';
        ctx.fillRect(e.x + 1, e.y, e.w - 2, 15);
        ctx.fillStyle = '#0c111b';
        ctx.fillRect(e.x + 5, e.y + 4, e.w - 10, 7);

        // Глаз.
        ctx.fillStyle = '#f0c05a';
        const ex = e.dir > 0 ? e.x + e.w - 10 : e.x + 6;
        ctx.fillRect(ex, e.y + 6, 4, 3);

        // Ствол смотрит в сторону игрока.
        ctx.strokeStyle = '#8a7440';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx, cy - 4);
        ctx.lineTo(mx, my);
        ctx.stroke();
        ctx.strokeStyle = '#2a2f3a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 4);
        ctx.lineTo(mx, my);
        ctx.stroke();

        if (e.flash > 0) {
          ctx.fillStyle = '#f2d06b';
          ctx.beginPath();
          ctx.moveTo(mx, my);
          ctx.lineTo(mx + e.aimX * 8 - e.aimY * 3, my + e.aimY * 8 + e.aimX * 3);
          ctx.lineTo(mx + e.aimX * 8 + e.aimY * 3, my + e.aimY * 8 - e.aimX * 3);
          ctx.closePath();
          ctx.fill();
        }

        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(e.x + 2, e.y + e.h - 4, e.w - 4, 4);
      }
    }

    // Снаряды: плоский ромб с коротким следом.
    for (const p of this.projectiles) {
      ctx.strokeStyle = 'rgba(224, 162, 74, 0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      ctx.fillStyle = '#3a2218';
      ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }

    // Меловая крошка от попадания.
    for (const s of this.sparks) {
      const a = s.t / s.max;
      ctx.fillStyle = `rgba(240, 234, 216, ${0.75 * a})`;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), s.size, s.size);
    }
  }
}
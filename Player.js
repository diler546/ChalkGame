import { EPS, horizontalOverlap, rectsOverlap, verticalOverlap } from './collision.js';

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

export class Player {
  constructor(x, y) {
    this.w = 28;
    this.h = 40;
    this.spawnX = x;
    this.spawnY = y;
    this.speed = 240;
    this.jumpSpeed = 640;
    this.gravity = 1400;
    this.maxFall = 1200;
    this.reset();
  }

  reset() {
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.facing = 1;
    this.justJumped = false;
    this.justLanded = false;
  }

  update(dt, solids, keys) {
    this.justJumped = false;
    this.justLanded = false;

    // Горизонтальное управление.
    let dir = 0;
    if (keys.left) dir -= 1;
    if (keys.right) dir += 1;
    this.vx = dir * this.speed;
    if (dir !== 0) this.facing = dir;

    // Jump buffer 100 мс.
    if (keys.jumpPressed) this.jumpBuffer = 0.1;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    // Переменная высота прыжка.
    if (!keys.jump && this.vy < -200) this.vy = -200;

    // Coyote time 100 мс.
    if (this.onGround) this.coyote = 0.1;
    else this.coyote = Math.max(0, this.coyote - dt);

    if (this.jumpBuffer > 0 && (this.onGround || this.coyote > 0)) {
      this.vy = -this.jumpSpeed;
      this.onGround = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.justJumped = true;
    }

    this.vy = Math.min(this.maxFall, this.vy + this.gravity * dt);

    const wasGround = this.onGround;

    // Ось X — отдельно, со свипом по старой и новой позиции.
    const oldX = this.x;
    this.x += this.vx * dt;
    this._resolveX(oldX, solids);

    // Ось Y — отдельно, чтобы не проваливаться сквозь платформы.
    const oldY = this.y;
    this.onGround = false;
    this.y += this.vy * dt;
    this._resolveY(oldY, solids);

    if (this.onGround && !wasGround) this.justLanded = true;
  }

  _resolveX(oldX, solids) {
    if (this.vx === 0) {
      for (const s of solids) {
        if (rectsOverlap(this, s)) this._pushOutX(s);
      }
      return;
    }

    let stopRight = Infinity;
    let stopLeft = -Infinity;

    for (const s of solids) {
      if (!verticalOverlap(this, s)) continue;

      if (this.vx > 0) {
        // Край игрока пересёк левый край платформы за этот шаг.
        if (oldX + this.w <= s.x + EPS && this.x + this.w > s.x) {
          stopRight = Math.min(stopRight, s.x);
        }
      } else {
        if (oldX >= s.x + s.w - EPS && this.x < s.x + s.w) {
          stopLeft = Math.max(stopLeft, s.x + s.w);
        }
      }
    }

    if (this.vx > 0 && stopRight !== Infinity) {
      this.x = stopRight - this.w;
      this.vx = 0;
    } else if (this.vx < 0 && stopLeft !== -Infinity) {
      this.x = stopLeft;
      this.vx = 0;
    }

    // Страховка для случаев, когда игрок уже частично внутри.
    for (const s of solids) {
      if (rectsOverlap(this, s)) this._pushOutX(s);
    }
  }

  _pushOutX(s) {
    if (this.x + this.w / 2 < s.x + s.w / 2) this.x = s.x - this.w;
    else this.x = s.x + s.w;
    this.vx = 0;
  }

  _resolveY(oldY, solids) {
    let landY = Infinity;
    let ceilingY = -Infinity;

    for (const s of solids) {
      if (!horizontalOverlap(this, s)) continue;

      if (this.vy > 0) {
        // Ноги пересекли верх платформы.
        if (oldY + this.h <= s.y + EPS && this.y + this.h > s.y) {
          landY = Math.min(landY, s.y);
        }
      } else if (this.vy < 0) {
        // Голова пересекла низ платформы.
        if (oldY >= s.y + s.h - EPS && this.y < s.y + s.h) {
          ceilingY = Math.max(ceilingY, s.y + s.h);
        }
      }
    }

    if (landY !== Infinity) {
      this.y = landY - this.h;
      this.vy = 0;
      this.onGround = true;
      return;
    }
    if (ceilingY !== -Infinity) {
      this.y = ceilingY;
      this.vy = 0;
      return;
    }

    // Страховка от наложения.
    for (const s of solids) {
      if (!rectsOverlap(this, s)) continue;
      if (this.y + this.h / 2 < s.y + s.h / 2) {
        this.y = s.y - this.h;
        this.vy = 0;
        this.onGround = true;
      } else {
        this.y = s.y + s.h;
        this.vy = 0;
      }
    }
  }

  render(ctx, time) {
    const p = this;
    const cx = p.x + p.w / 2;
    const feet = p.y + p.h;

    // Мягкая тень.
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${p.onGround ? 0.28 : 0.12})`;
    ctx.beginPath();
    ctx.ellipse(cx, feet + 2, 17, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const move = p.vx / p.speed;
    let tilt = move * 0.07;
    let sx = 1;
    let sy = 1;
    if (!p.onGround) {
      tilt = move * 0.045;
      if (p.vy < 0) {
        sx = 1.05;
        sy = 0.94;
      } else {
        sx = 0.97;
        sy = 1.04;
      }
    }

    const step = p.onGround && Math.abs(move) > 0.1 ? Math.sin(time * 14) * 2 : 0;

    ctx.save();
    ctx.translate(cx, feet);
    ctx.rotate(tilt);
    ctx.scale(p.facing * sx, sy);

    // Ноги.
    ctx.fillStyle = '#c8b184';
    roundRect(ctx, -10, -9 + step, 8, 9, 3);
    ctx.fill();
    roundRect(ctx, 2, -9 - step, 8, 9, 3);
    ctx.fill();

    // Тело.
    const body = ctx.createLinearGradient(-14, -38, 14, 0);
    body.addColorStop(0, '#eddbb4');
    body.addColorStop(0.65, '#e2c99b');
    body.addColorStop(1, '#cbb184');
    ctx.fillStyle = body;
    roundRect(ctx, -13, -35, 26, 31, 8);
    ctx.fill();

    // Шарф.
    ctx.fillStyle = '#8e2f3c';
    roundRect(ctx, -14, -31, 28, 7, 3);
    ctx.fill();
    const flap = Math.sin(time * 5 + 0.6) * 2;
    ctx.beginPath();
    ctx.moveTo(-9, -27);
    ctx.quadraticCurveTo(-16, -24 + flap, -19, -18 + flap);
    ctx.lineTo(-14, -16 + flap);
    ctx.quadraticCurveTo(-11, -21, -6, -24);
    ctx.closePath();
    ctx.fill();

    // Берет.
    ctx.fillStyle = '#27314f';
    ctx.beginPath();
    ctx.ellipse(0, -37, 15, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(4, -34.5, 15, 4.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a466e';
    ctx.beginPath();
    ctx.ellipse(-4, -39, 7, 3, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // Лицо.
    ctx.fillStyle = '#2a2118';
    ctx.beginPath();
    ctx.arc(6.5, -25, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(160, 90, 80, 0.35)';
    ctx.beginPath();
    ctx.arc(10, -21, 2.6, 0, Math.PI * 2);
    ctx.fill();

    // Рука и кисточка.
    ctx.strokeStyle = '#d8bd91';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(8, -23);
    ctx.lineTo(13, -29);
    ctx.stroke();

    ctx.strokeStyle = '#9a6a3a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(11, -29);
    ctx.lineTo(22, -40);
    ctx.stroke();
    ctx.strokeStyle = '#d8b878';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(11, -28.5);
    ctx.lineTo(21, -39);
    ctx.stroke();
    // Белый кончик.
    ctx.fillStyle = '#f4f2e8';
    ctx.beginPath();
    ctx.arc(23, -41, 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

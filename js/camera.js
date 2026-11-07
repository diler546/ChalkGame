import { clamp } from './collision.js';

// Плавная камера: lerp 0.12 за кадр, ограничена краями мира.
export class Camera {
  constructor(viewW, viewH, worldW, worldH) {
    this.viewW = viewW;
    this.viewH = viewH;
    this.worldW = worldW;
    this.worldH = worldH;
    this.x = 0;
    this.y = 0;
  }

  _target(player) {
    return {
      x: clamp(
        player.x + player.w / 2 - this.viewW / 2,
        0,
        Math.max(0, this.worldW - this.viewW)
      ),
      y: clamp(
        player.y + player.h / 2 - this.viewH / 2,
        0,
        Math.max(0, this.worldH - this.viewH)
      ),
    };
  }

  follow(player) {
    const t = this._target(player);
    this.x += (t.x - this.x) * 0.12;
    this.y += (t.y - this.y) * 0.12;
    this.x = clamp(this.x, 0, Math.max(0, this.worldW - this.viewW));
    this.y = clamp(this.y, 0, Math.max(0, this.worldH - this.viewH));
  }

  snap(player) {
    const t = this._target(player);
    this.x = t.x;
    this.y = t.y;
  }
}

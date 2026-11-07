// Клавиатура, экранные кнопки и указатель (мышь / палец / перо).

export class Input {
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.opts = opts;
    this.keys = {
      left: false,
      right: false,
      jump: false,
      jumpPressed: false,
    };
    this.pointerId = null;
    this.painting = false;
    this._bindKeyboard();
    this._bindPointer();
    this._bindMobile();
  }

  clear() {
    this.keys.left = false;
    this.keys.right = false;
    this.keys.jump = false;
    this.keys.jumpPressed = false;
    this.pointerId = null;
    this.painting = false;
  }

  // ---------- клавиатура ----------
  _bindKeyboard() {
    const isLeft = (e) => {
      const k = e.key;
      const c = e.code;
      return (
        c === 'ArrowLeft' ||
        c === 'KeyA' ||
        k === 'a' ||
        k === 'A' ||
        k === 'ф' ||
        k === 'Ф'
      );
    };
    const isRight = (e) => {
      const k = e.key;
      const c = e.code;
      return (
        c === 'ArrowRight' ||
        c === 'KeyD' ||
        k === 'd' ||
        k === 'D' ||
        k === 'в' ||
        k === 'В'
      );
    };
    const isJump = (e) => {
      const k = e.key;
      const c = e.code;
      return (
        c === 'Space' ||
        c === 'ArrowUp' ||
        c === 'KeyW' ||
        k === ' ' ||
        k === 'w' ||
        k === 'W' ||
        k === 'ArrowUp' ||
        k === 'ц' ||
        k === 'Ц'
      );
    };
    const isPause = (e) => {
      const k = e.key;
      const c = e.code;
      return (
        c === 'Escape' ||
        c === 'KeyP' ||
        k === 'p' ||
        k === 'P' ||
        k === 'з' ||
        k === 'З' ||
        k === 'Escape'
      );
    };

    window.addEventListener('keydown', (e) => {
      if (isPause(e)) {
        if (!e.repeat) this.opts.onPauseToggle();
        if (this.opts.getState() === 'playing') e.preventDefault();
        return;
      }

      const gameKey = isLeft(e) || isRight(e) || isJump(e);
      const active =
        this.opts.getState() === 'playing' || this.opts.getState() === 'paused';
      if (gameKey && active && this.opts.getState() === 'playing') e.preventDefault();
      if (this.opts.getState() !== 'playing') return;

      if (isLeft(e)) this.keys.left = true;
      if (isRight(e)) this.keys.right = true;
      if (isJump(e)) {
        if (!e.repeat && !this.keys.jump) this.keys.jumpPressed = true;
        this.keys.jump = true;
      }
    });

    // Отпускание работает всегда, даже если игру поставили на паузу.
    window.addEventListener('keyup', (e) => {
      if (isLeft(e)) this.keys.left = false;
      if (isRight(e)) this.keys.right = false;
      if (isJump(e)) this.keys.jump = false;
    });

    window.addEventListener('blur', () => {
      this._finishStroke();
      this.clear();
    });
  }

  // ---------- рисование указателем ----------
  _bindPointer() {
    const canvas = this.canvas;

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0) return;
        if (this.opts.getState() !== 'playing') return;
        if (this.pointerId !== null) return; // только один палец
        e.preventDefault();
        this.pointerId = e.pointerId;
        this.painting = false;
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          /* необязательно */
        }
        const w = this.opts.toWorld(e.clientX, e.clientY);
        this.painting = this.opts.onDrawStart(w.x, w.y) === true;
      },
      { passive: false }
    );

    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerId !== this.pointerId || !this.painting) return;
        if (this.opts.getState() !== 'playing') {
          this._finishStroke();
          return;
        }
        e.preventDefault();
        const w = this.opts.toWorld(e.clientX, e.clientY);
        if (this.opts.onDrawMove(w.x, w.y) === false) {
          this._finishStroke();
        }
      },
      { passive: false }
    );

    const end = (e) => {
      if (e.pointerId !== this.pointerId) return;
      e.preventDefault();
      this._finishStroke();
    };
    window.addEventListener('pointerup', end, { passive: false });
    window.addEventListener('pointercancel', end, { passive: false });
  }

  _finishStroke() {
    if (this.painting) this.opts.onDrawEnd();
    this.painting = false;
    if (this.pointerId !== null) {
      try {
        this.canvas.releasePointerCapture(this.pointerId);
      } catch {
        /* указатель уже отпущен */
      }
    }
    this.pointerId = null;
  }

  // ---------- экранные кнопки ----------
  _bindMobile() {
    const hold = (el, down, up) => {
      if (!el) return;
      el.addEventListener(
        'pointerdown',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this.opts.getState() !== 'playing') return;
          try {
            el.setPointerCapture(e.pointerId);
          } catch {
            /* необязательно */
          }
          down();
        },
        { passive: false }
      );
      const release = (e) => {
        e.preventDefault();
        up();
      };
      el.addEventListener('pointerup', release, { passive: false });
      el.addEventListener('pointerleave', release, { passive: false });
      el.addEventListener('pointercancel', release, { passive: false });
    };

    hold(
      document.getElementById('m-left'),
      () => { this.keys.left = true; },
      () => { this.keys.left = false; }
    );
    hold(
      document.getElementById('m-right'),
      () => { this.keys.right = true; },
      () => { this.keys.right = false; }
    );
    hold(
      document.getElementById('m-jump'),
      () => {
        if (!this.keys.jump) this.keys.jumpPressed = true;
        this.keys.jump = true;
      },
      () => { this.keys.jump = false; }
    );
  }
}

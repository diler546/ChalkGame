// Геометрические хелперы и работа с сеткой 12 × 12.

export const CELL = 12;
export const EPS = 0.001;

export function rectsOverlap(a, b, eps = EPS) {
  return (
    a.x + eps < b.x + b.w &&
    a.x + a.w - eps > b.x &&
    a.y + eps < b.y + b.h &&
    a.y + a.h - eps > b.y
  );
}

export function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

export function horizontalOverlap(a, b, eps = EPS) {
  return a.x + eps < b.x + b.w && a.x + a.w - eps > b.x;
}

export function verticalOverlap(a, b, eps = EPS) {
  return a.y + eps < b.y + b.h && a.y + a.h - eps > b.y;
}

export function cellKey(gx, gy) {
  return gx + ',' + gy;
}

export function worldToCell(x, y, size = CELL) {
  return { gx: Math.floor(x / size), gy: Math.floor(y / size) };
}

export function cellRect(gx, gy, size = CELL) {
  return { x: gx * size, y: gy * size, w: size, h: size };
}

// Диапазон индексов сетки, накрывающий прямоугольник.
export function gridBounds(rect, size = CELL) {
  return {
    x0: Math.floor(rect.x / size),
    y0: Math.floor(rect.y / size),
    x1: Math.floor((rect.x + rect.w) / size),
    y1: Math.floor((rect.y + rect.h) / size),
  };
}

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

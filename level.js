// Данные уровня «МЕЛОК: Ночной Вернисаж» — восемь залов ночной галереи.
//
// Мир 6400 × 1200, пол на высоте 1120. Камера видит 1280 × 720, поэтому
// верхние балки и шахты действительно приходится исследовать.
//
// ЗАЛ I      0…800     старт, две полки, пропасть №1
// ЗАЛ II     800…1600  высокая шахта из восьми полок, пропасть №2
// ЗАЛ III    1600…2400 подвесной мостик, карниз, пропасть №3
// ЗАЛ IV     2400…3200 балкон, ПЕЧАТЬ I (квадрат), пропасть №4
// ЗАЛ V      3200…4000 верхний мостик, пропасть №5
// ЗАЛ VI     4000…4800 балкон-мостик, ПЕЧАТЬ II (круг), пропасть №6
// ЗАЛ VII    4800…5600 шахта до балки под потолком, пропасть №7
// ЗАЛ VIII   5600…6400 мостик, ПЕЧАТЬ III (ромб), пропасть №8, дверь
//
// Все восемь пропастей — по 230 px: прыжок перекрывает ~219 px, поэтому
// каждая пропасть требует мелового моста.
//
// У каждой платформы один и тот же прямоугольник используется и для
// отрисовки, и для физики. Невидимых полок и балок без коллизии нет.

export const WORLD = Object.freeze({ w: 6400, h: 1200 });

export const VIEW = Object.freeze({ w: 1280, h: 720 });

export const SPAWN = Object.freeze({ x: 70, y: 1080 });

export const HALLS = Object.freeze([
  { id: 1, label: 'ЗАЛ I', x0: 0, x1: 800, center: 400 },
  { id: 2, label: 'ЗАЛ II', x0: 800, x1: 1600, center: 1200 },
  { id: 3, label: 'ЗАЛ III', x0: 1600, x1: 2400, center: 2000 },
  { id: 4, label: 'ЗАЛ IV', x0: 2400, x1: 3200, center: 2800 },
  { id: 5, label: 'ЗАЛ V', x0: 3200, x1: 4000, center: 3600 },
  { id: 6, label: 'ЗАЛ VI', x0: 4000, x1: 4800, center: 4400 },
  { id: 7, label: 'ЗАЛ VII', x0: 4800, x1: 5600, center: 5200 },
  { id: 8, label: 'ЗАЛ VIII', x0: 5600, x1: 6400, center: 6000 },
]);

// kind: floor | ledge | bridge | cornice | beam.
// bridge и cornice получают верёвки/кронштейны в рендере, но физика —
// всё тот же прямоугольник.
export const PLATFORMS = Object.freeze([
  // --- пол: 16 участков, между ними восемь пропастей ---
  { x: 0,    y: 1120, w: 300, h: 80, kind: 'floor' }, // I
  { x: 530,  y: 1120, w: 270, h: 80, kind: 'floor' },
  { x: 800,  y: 1120, w: 290, h: 80, kind: 'floor' }, // II
  { x: 1320, y: 1120, w: 280, h: 80, kind: 'floor' },
  { x: 1600, y: 1120, w: 280, h: 80, kind: 'floor' }, // III
  { x: 2110, y: 1120, w: 290, h: 80, kind: 'floor' },
  { x: 2400, y: 1120, w: 280, h: 80, kind: 'floor' }, // IV
  { x: 2910, y: 1120, w: 290, h: 80, kind: 'floor' },
  { x: 3200, y: 1120, w: 280, h: 80, kind: 'floor' }, // V
  { x: 3710, y: 1120, w: 290, h: 80, kind: 'floor' },
  { x: 4000, y: 1120, w: 280, h: 80, kind: 'floor' }, // VI
  { x: 4510, y: 1120, w: 290, h: 80, kind: 'floor' },
  { x: 4800, y: 1120, w: 280, h: 80, kind: 'floor' }, // VII
  { x: 5310, y: 1120, w: 290, h: 80, kind: 'floor' },
  { x: 5600, y: 1120, w: 280, h: 80, kind: 'floor' }, // VIII
  { x: 6110, y: 1120, w: 290, h: 80, kind: 'floor' },

  // --- ЗАЛ I: две полки у пропасти №1 ---
  { x: 100, y: 1010, w: 100, h: 18, kind: 'ledge' },
  { x: 215, y: 895,  w: 80,  h: 18, kind: 'ledge' },

  // --- ЗАЛ II: вертикальная шахта, ведёт к балке под потолком ---
  { x: 830, y: 1010, w: 90, h: 18, kind: 'ledge' },
  { x: 940, y: 905,  w: 90, h: 18, kind: 'ledge' },
  { x: 840, y: 800,  w: 90, h: 18, kind: 'ledge' },
  { x: 950, y: 695,  w: 90, h: 18, kind: 'ledge' },
  { x: 850, y: 590,  w: 90, h: 18, kind: 'ledge' },
  { x: 950, y: 485,  w: 90, h: 18, kind: 'ledge' },
  { x: 850, y: 380,  w: 90, h: 18, kind: 'ledge' },
  { x: 960, y: 250,  w: 150, h: 18, kind: 'beam', brace: true },

  // --- ЗАЛ III: мостик, полка и карниз ---
  { x: 1620, y: 1010, w: 100, h: 18, kind: 'ledge' },
  { x: 1750, y: 905,  w: 100, h: 18, kind: 'ledge' },
  { x: 1780, y: 780,  w: 160, h: 18, kind: 'bridge', anchorY: 600 },
  { x: 1680, y: 655,  w: 100, h: 18, kind: 'ledge' },
  { x: 1760, y: 545,  w: 120, h: 14, kind: 'cornice' },

  // --- ЗАЛ IV: балкон перед ПЕЧАТЬЮ I ---
  { x: 2420, y: 1010, w: 100, h: 18, kind: 'ledge' },
  { x: 2550, y: 905,  w: 100, h: 18, kind: 'ledge' },
  { x: 2440, y: 800,  w: 100, h: 18, kind: 'ledge' },
  { x: 2600, y: 780,  w: 160, h: 18, kind: 'bridge', anchorY: 580 },

  // --- ЗАЛ V: верхний мостик над залом ---
  { x: 3220, y: 1010, w: 100, h: 18, kind: 'ledge' },
  { x: 3350, y: 905,  w: 100, h: 18, kind: 'ledge' },
  { x: 3260, y: 800,  w: 100, h: 18, kind: 'ledge' },
  { x: 3380, y: 690,  w: 170, h: 18, kind: 'bridge', anchorY: 500 },
  { x: 3860, y: 1010, w: 80,  h: 18, kind: 'ledge' },

  // --- ЗАЛ VI: балкон-мостик перед ПЕЧАТЬЮ II ---
  { x: 4020, y: 1010, w: 100, h: 18, kind: 'ledge' },
  { x: 4150, y: 905,  w: 100, h: 18, kind: 'ledge' },
  { x: 4070, y: 780,  w: 180, h: 18, kind: 'bridge', anchorY: 600 },
  { x: 4240, y: 670,  w: 90,  h: 18, kind: 'ledge' },

  // --- ЗАЛ VII: большая шахта к балке под потолком ---
  { x: 5340, y: 1010, w: 90, h: 18, kind: 'ledge' },
  { x: 5460, y: 905,  w: 90, h: 18, kind: 'ledge' },
  { x: 5340, y: 800,  w: 90, h: 18, kind: 'ledge' },
  { x: 5460, y: 695,  w: 90, h: 18, kind: 'ledge' },
  { x: 5340, y: 590,  w: 90, h: 18, kind: 'ledge' },
  { x: 5460, y: 485,  w: 90, h: 18, kind: 'ledge' },
  { x: 5340, y: 380,  w: 90, h: 18, kind: 'ledge' },
  { x: 5460, y: 275,  w: 90, h: 18, kind: 'ledge' },
  { x: 4800, y: 250,  w: 660, h: 18, kind: 'beam', brace: true },

  // --- ЗАЛ VIII: мостик и высокий балкон перед ПЕЧАТЬЮ III ---
  { x: 5620, y: 1010, w: 100, h: 18, kind: 'ledge' },
  { x: 5750, y: 905,  w: 100, h: 18, kind: 'ledge' },
  { x: 5660, y: 780,  w: 180, h: 18, kind: 'bridge', anchorY: 600 },
  { x: 5780, y: 670,  w: 90,  h: 18, kind: 'ledge' },
]);

// Восемь пропастей по 230 px — каждая требует моста.
export const PITS = Object.freeze([
  { x: 300,  w: 230 }, // I
  { x: 1090, w: 230 }, // II
  { x: 1880, w: 230 }, // III
  { x: 2680, w: 230 }, // IV
  { x: 3480, w: 230 }, // V
  { x: 4280, w: 230 }, // VI
  { x: 5080, w: 230 }, // VII
  { x: 5880, w: 230 }, // VIII
]);

// Восемь картин — по одной в каждом зале.
export const PICTURES = Object.freeze([
  { x: 230,  y: 849, w: 26, h: 34, hue: 28,  hall: 1 },
  { x: 990,  y: 204, w: 26, h: 34, hue: 205, hall: 2 },
  { x: 1790, y: 499, w: 26, h: 34, hue: 95,  hall: 3 },
  { x: 2565, y: 859, w: 26, h: 34, hue: 320, hall: 4 },
  { x: 3440, y: 644, w: 26, h: 34, hue: 45,  hall: 5 },
  { x: 4255, y: 624, w: 26, h: 34, hue: 160, hall: 6 },
  { x: 5355, y: 544, w: 26, h: 34, hue: 275, hall: 7 },
  { x: 5795, y: 624, w: 26, h: 34, hue: 10,  hall: 8 },
]);

// Двенадцать опасностей: лужи и шипы разной формы.
export const DANGERS = Object.freeze([
  { x: 205,  y: 1104, w: 34,  h: 16, type: 'spikes' }, // I, пол
  { x: 560,  y: 1108, w: 90,  h: 12, type: 'puddle' }, // I, пол
  { x: 1480, y: 1104, w: 34,  h: 16, type: 'spikes' }, // II, пол
  { x: 1660, y: 1108, w: 90,  h: 12, type: 'puddle' }, // III, пол
  { x: 2440, y: 1104, w: 34,  h: 16, type: 'spikes' }, // IV, пол
  { x: 2640, y: 764,  w: 34,  h: 16, type: 'spikes' }, // IV, мостик
  { x: 3360, y: 1108, w: 90,  h: 12, type: 'puddle' }, // V, пол
  { x: 4050, y: 1108, w: 80,  h: 12, type: 'puddle' }, // VI, пол
  { x: 4520, y: 1104, w: 34,  h: 16, type: 'spikes' }, // VI, перед печатью
  { x: 4860, y: 1108, w: 90,  h: 12, type: 'puddle' }, // VII, пол
  { x: 5420, y: 1104, w: 34,  h: 16, type: 'spikes' }, // VII, под шахтой
  { x: 5700, y: 764,  w: 34,  h: 16, type: 'spikes' }, // VIII, мостик
]);

// Финишная дверь в Зале VIII.
export const DOOR = Object.freeze({ x: 6340, y: 1040, w: 48, h: 80 });

// Три печати — высокие стены от пола почти до потолка.
// Пока пазл не решён, стена полностью перекрывает проход: перепрыгнуть
// или перелезть её нельзя, а меловая лестница до потолка не по карману.
export const GATES = Object.freeze([
  {
    id: 'gate-square',
    puzzle: 'square',
    x: 2960,
    y: 220,
    w: 220,
    h: 900,
    label: 'ПЕЧАТЬ I',
    roman: 'I',
  },
  {
    id: 'gate-circle',
    puzzle: 'circle',
    x: 4560,
    y: 220,
    w: 220,
    h: 900,
    label: 'ПЕЧАТЬ II',
    roman: 'II',
  },
  {
    id: 'gate-diamond',
    puzzle: 'diamond',
    x: 6120,
    y: 220,
    w: 190,
    h: 900,
    label: 'ПЕЧАТЬ III',
    roman: 'III',
  },
]);

// Враги. Стрелки стоят на точках и стреляют в игрока; их снаряды
// останавливаются меловыми клетками.
export const ENEMIES = Object.freeze([
  { type: 'patrol', x: 690,  y: 1088, minX: 660, maxX: 775 },
  { type: 'patrol', x: 2180, y: 1088, minX: 2130, maxX: 2375 },
  { type: 'patrol', x: 3780, y: 1088, minX: 3730, maxX: 3980 },
  { type: 'patrol', x: 5700, y: 1088, minX: 5620, maxX: 5860 },

  { type: 'jumper', x: 860,  groundY: 1120 },
  { type: 'jumper', x: 2520, groundY: 1120 },
  { type: 'jumper', x: 4140, groundY: 1120 },

  { type: 'flyer', baseX: 420,  baseY: 960, ampX: 70, ampY: 45 },
  { type: 'flyer', baseX: 1900, baseY: 700, ampX: 80, ampY: 55 },
  { type: 'flyer', baseX: 3600, baseY: 920, ampX: 75, ampY: 40 },
  { type: 'flyer', baseX: 5400, baseY: 700, ampX: 60, ampY: 80 },

  { type: 'shooter', x: 975,  y: 865, dir: -1, range: 620, cooldown: 2.3 },
  { type: 'shooter', x: 3470, y: 650, dir: -1, range: 640, cooldown: 1.9 },
  { type: 'shooter', x: 5470, y: 445, dir: -1, range: 700, cooldown: 2.0 },
]);

export const DECOR = Object.freeze({
  windows: [
    { x: 120,  y: 110, w: 180, h: 240, moon: true },
    { x: 900,  y: 150, w: 150, h: 200, moon: false },
    { x: 1700, y: 100, w: 170, h: 230, moon: true },
    { x: 2500, y: 140, w: 150, h: 210, moon: false },
    { x: 3300, y: 120, w: 160, h: 220, moon: true },
    { x: 4080, y: 150, w: 150, h: 200, moon: false },
    { x: 4900, y: 100, w: 180, h: 240, moon: true },
    { x: 5750, y: 130, w: 150, h: 210, moon: false },
  ],

  // Пустые рамы: разный размер, толщина и цвет.
  frames: [
    { x: 360,  y: 330, w: 88,  h: 112, color: '#7a2b33', lw: 7, kind: 0 },
    { x: 660,  y: 380, w: 116, h: 142, color: '#a5761f', lw: 5, kind: 1 },
    { x: 1140, y: 300, w: 78,  h: 96,  color: '#2f4a33', lw: 8, kind: 2 },
    { x: 1450, y: 360, w: 100, h: 126, color: '#7a2b33', lw: 4, kind: 1 },
    { x: 2050, y: 320, w: 92,  h: 118, color: '#2f4a33', lw: 6, kind: 0 },
    { x: 2320, y: 380, w: 106, h: 130, color: '#a5761f', lw: 5, kind: 2 },
    { x: 2700, y: 300, w: 96,  h: 120, color: '#7a2b33', lw: 6, kind: 1 },
    { x: 3320, y: 390, w: 110, h: 136, color: '#2f4a33', lw: 5, kind: 0 },
    { x: 3820, y: 320, w: 88,  h: 112, color: '#a5761f', lw: 7, kind: 2 },
    { x: 4200, y: 360, w: 100, h: 126, color: '#7a2b33', lw: 4, kind: 1 },
    { x: 4980, y: 330, w: 92,  h: 118, color: '#2f4a33', lw: 6, kind: 0 },
    { x: 5880, y: 360, w: 106, h: 130, color: '#a5761f', lw: 5, kind: 2 },
  ],

  // Пилястры на границах залов — фон, а не платформы.
  pilasters: [800, 1600, 2400, 3200, 4000, 4800, 5600],

  // Плоские настенные лампы под потолком.
  lamps: [400, 1200, 2000, 2800, 3600, 4400, 5200, 6000],
});






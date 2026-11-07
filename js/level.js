// Данные уровня «МЕЛОК: Ночной Вернисаж» — семь плотных залов.
//
// Мир 5380 × 1400. Пол выровнен по меловой сетке: FLOOR_Y = 1296,
// 1296 / 12 = 108. Мосты, нарисованные по кромке пола, ложатся ровно.
//
// У каждого зала свой твёрдый потолок. Он входит в solids для игрока и
// не даёт «срезать» зал по верху. Разная высота задаёт ритм:
//   ЗАЛ I    520 px  обучение
//   ЗАЛ II   500 px  подъём по нарисованным уступам
//   ЗАЛ III  260 px  низкий лабиринт
//   ЗАЛ IV   560 px  пропасти, маятники, карнизы
//   ЗАЛ V    320 px  вертикальный бой
//   ЗАЛ VI   420 px  опасный коридор
//   ЗАЛ VII  540 px  финальная арена
//
// Раскладка слева направо:
//   ЗАЛ I      0…720     старт, две пропасти, картина, патрульный
//   ЗАЛ II     720…1400  колодец, картина наверху, стрелок
//   ЗАЛ III    1400…2100 ПЕЧАТЬ I (квадрат), лужи, пропасть
//   ЗАЛ IV     2100…3220 «Соедини мазком» A, ПЕЧАТЬ II (круг), 4 пропасти
//   ЗАЛ V      3220…3940 ПЕЧАТЬ III (треугольник), колодец, сторож
//   ЗАЛ VI     3940…4640 ПЕЧАТЬ IV (ромб), скользкий коридор
//   ЗАЛ VII    4640…5380 ПЕЧАТЬ V (звезда), «Соедини B», дверь
//
// Все платформы используют один прямоугольник для рисунка и физики.

export const WORLD = Object.freeze({ w: 5380, h: 1400 });
export const VIEW = Object.freeze({ w: 1280, h: 720 });
export const CELL = 12;
export const FLOOR_Y = 1296;

// Точка появления художника: первый зал, на полу.
export const SPAWN = Object.freeze({ x: 62, y: FLOOR_Y - 40 });

export const HALLS = Object.freeze([
  {
    id: 1,
    label: 'ЗАЛ I',
    name: 'Обучение',
    x0: 0,
    x1: 720,
    center: 360,
    ceilingY: 776,
  },
  {
    id: 2,
    label: 'ЗАЛ II',
    name: 'Подъём',
    x0: 720,
    x1: 1400,
    center: 1060,
    ceilingY: 796,
  },
  {
    id: 3,
    label: 'ЗАЛ III',
    name: 'Лабиринт',
    x0: 1400,
    x1: 2100,
    center: 1750,
    ceilingY: 1036,
  },
  {
    id: 4,
    label: 'ЗАЛ IV',
    name: 'Пропасти',
    x0: 2100,
    x1: 3220,
    center: 2660,
    ceilingY: 736,
  },
  {
    id: 5,
    label: 'ЗАЛ V',
    name: 'Вертикальный бой',
    x0: 3220,
    x1: 3940,
    center: 3580,
    ceilingY: 976,
  },
  {
    id: 6,
    label: 'ЗАЛ VI',
    name: 'Опасный коридор',
    x0: 3940,
    x1: 4640,
    center: 4290,
    ceilingY: 876,
  },
  {
    id: 7,
    label: 'ЗАЛ VII',
    name: 'Финал',
    x0: 4640,
    x1: 5380,
    center: 5010,
    ceilingY: 756,
  },
]);

// Твёрдые потолки: низ прямоугольника — ровно ceilingY зала.
// Плита тянется до верха мира, чтобы из зала с высоким потолком нельзя
// было перейти в соседний зал поверх его низкого потолка.
export const CEILINGS = Object.freeze(
  HALLS.map((h) => ({
    id: h.id,
    x: h.x0,
    y: 0,
    w: h.x1 - h.x0,
    h: h.ceilingY,
    ceilingY: h.ceilingY,
    kind: 'ceiling',
  }))
);

// Тринадцать пропастей. 230–240 px требуют мелового моста;
// пропасти с островком можно пройти по столбу, но это медленнее.
export const PITS = Object.freeze([
  { x: 190, w: 230, island: true }, // I
  { x: 460, w: 230 }, // I
  { x: 1140, w: 230, island: true }, // II
  { x: 1720, w: 230, island: true }, // III
  { x: 2140, w: 240, island: true }, // IV
  { x: 2420, w: 190, island: true }, // IV
  { x: 2660, w: 200, island: true }, // IV
  { x: 2890, w: 230 }, // IV, мост-пазл A
  { x: 3300, w: 230, island: true }, // V
  { x: 3570, w: 230 }, // V
  { x: 4180, w: 230, island: true }, // VI
  { x: 4700, w: 230, island: true }, // VII
  { x: 5140, w: 180 }, // VII, мост-пазл B
]);

// Пол нарезан на участки примерно по 300 px. Соседние участки стыкуются
// вплотную, поэтому швов в коллизии нет, а рисунок пола выглядит живым.
function buildFloor() {
  const out = [];
  let cursor = 0;

  const addRun = (x0, x1) => {
    let x = x0;
    while (x < x1 - 0.001) {
      let w = Math.min(300, x1 - x);
      if (x1 - (x + w) < 60) w = x1 - x;
      out.push({ x, y: FLOOR_Y, w, h: 104, kind: 'floor' });
      x += w;
    }
  };

  for (const pit of PITS) {
    addRun(cursor, pit.x);
    cursor = pit.x + pit.w;
  }
  addRun(cursor, WORLD.w);
  return out;
}

// kind: floor | ledge | bridge | cornice | beam | pillar.
// Островки — настоящие столбы в пропастях, их верх на 76 px выше пола.
const LEDGES = [
  // --- ЗАЛ I: ступени к первой картине ---
  { x: 90, y: 1190, w: 90, h: 18, kind: 'ledge' },
  { x: 180, y: 1090, w: 80, h: 18, kind: 'ledge' },
  { x: 90, y: 990, w: 100, h: 18, kind: 'ledge' },
  { x: 300, y: 1220, w: 30, h: 76, kind: 'pillar' },

  // --- ЗАЛ II: колодец. Между нижней и верхней полкой только мел. ---
  { x: 770, y: 1180, w: 90, h: 18, kind: 'ledge' },
  { x: 1020, y: 836, w: 130, h: 18, kind: 'bridge', anchorY: 796 },
  { x: 1240, y: 1220, w: 30, h: 76, kind: 'pillar' },

  // --- ЗАЛ III: низкий лабиринт ---
  { x: 1480, y: 1180, w: 70, h: 18, kind: 'ledge' },
  { x: 1630, y: 1120, w: 70, h: 18, kind: 'ledge' },
  { x: 1820, y: 1220, w: 30, h: 76, kind: 'pillar' },

  // --- ЗАЛ IV: четыре пропасти, узкие островки, балкончики ---
  { x: 2240, y: 1220, w: 30, h: 76, kind: 'pillar' },
  { x: 2150, y: 1100, w: 90, h: 18, kind: 'ledge' },
  { x: 2500, y: 1220, w: 30, h: 76, kind: 'pillar' },
  { x: 2450, y: 1090, w: 90, h: 18, kind: 'ledge' },
  { x: 2580, y: 1080, w: 80, h: 18, kind: 'ledge' },
  { x: 2740, y: 1220, w: 30, h: 76, kind: 'pillar' },

  // --- ЗАЛ V: вертикальный бой, три уровня ---
  { x: 3330, y: 1180, w: 80, h: 18, kind: 'ledge' },
  { x: 3430, y: 1080, w: 80, h: 18, kind: 'ledge' },
  { x: 3330, y: 1020, w: 80, h: 18, kind: 'ledge' },
  { x: 3400, y: 1220, w: 30, h: 76, kind: 'pillar' },

  // --- ЗАЛ VI: карниз над островком ---
  { x: 4260, y: 1100, w: 90, h: 18, kind: 'ledge' },
  { x: 4280, y: 1220, w: 30, h: 76, kind: 'pillar' },

  // --- ЗАЛ VII: картина в труднодоступном месте ---
  { x: 4750, y: 900, w: 90, h: 18, kind: 'ledge' },
  { x: 4800, y: 1220, w: 30, h: 76, kind: 'pillar' },
];

export const PLATFORMS = Object.freeze([...buildFloor(), ...LEDGES]);

// Семь картин — по одной в залах I, II, V, VI, VII и две в IV.
export const PICTURES = Object.freeze([
  { x: 115, y: 946, w: 26, h: 34, hue: 28, hall: 1 },
  { x: 1060, y: 800, w: 26, h: 34, hue: 205, hall: 2 },
  { x: 2470, y: 1050, w: 26, h: 34, hue: 320, hall: 4 },
  { x: 2170, y: 1060, w: 26, h: 34, hue: 45, hall: 4 },
  { x: 3350, y: 984, w: 26, h: 34, hue: 95, hall: 5 },
  { x: 4280, y: 1060, w: 26, h: 34, hue: 160, hall: 6 },
  // Седьмая картина — над левым краем Зала VII, до доски connect-b,
  // печати star и моста bridge-b. Видна ещё до решения пазла.
  { x: 4668, y: 780, w: 26, h: 34, hue: 275, hall: 7 },
]);

// Пять печатей-стен. Они стоят на полу, упираются в потолок зала и
// перекрывают проход до решения соответствующего пазла.
export const GATES = Object.freeze([
  {
    id: 'gate-square',
    puzzle: 'square',
    x: 1980,
    y: 1036,
    w: 120,
    h: 260,
    label: 'ПЕЧАТЬ I',
    roman: 'I',
  },
  {
    id: 'gate-circle',
    puzzle: 'circle',
    x: 3110,
    y: 736,
    w: 110,
    h: 560,
    label: 'ПЕЧАТЬ II',
    roman: 'II',
  },
  {
    id: 'gate-triangle',
    puzzle: 'triangle',
    x: 3820,
    y: 976,
    w: 120,
    h: 320,
    label: 'ПЕЧАТЬ III',
    roman: 'III',
  },
  {
    id: 'gate-diamond',
    puzzle: 'diamond',
    x: 4520,
    y: 876,
    w: 120,
    h: 420,
    label: 'ПЕЧАТЬ IV',
    roman: 'IV',
  },
  {
    id: 'gate-star',
    puzzle: 'star',
    x: 4980,
    y: 756,
    w: 160,
    h: 540,
    label: 'ПЕЧАТЬ V',
    roman: 'V',
  },
]);

// Два пазла «соедини мазком» открывают постоянные мосты-платформы.
export const PUZZLE_BRIDGES = Object.freeze([
  {
    id: 'bridge-a',
    puzzle: 'connect-a',
    x: 2890,
    y: FLOOR_Y,
    w: 230,
    h: 18,
    label: 'МОСТ I',
  },
  {
    id: 'bridge-b',
    puzzle: 'connect-b',
    x: 5140,
    y: FLOOR_Y,
    w: 180,
    h: 18,
    label: 'МОСТ II',
  },
]);

// Финишная дверь в Зале VII.
export const DOOR = Object.freeze({ x: 5325, y: FLOOR_Y - 80, w: 48, h: 80 });

// Опасные зоны: лужи и шипы постоянны, slick — скользкий пол.
// У шипов с ceil:true остриё направлено вниз, от потолка.
// Бывшие капли краски заменены лазерами (см. LASERS).
export const DANGERS = Object.freeze([
  // ЗАЛ I
  { x: 20, y: FLOOR_Y, w: 90, h: 8, type: 'slick' },
  { x: 90, y: FLOOR_Y - 12, w: 60, h: 12, type: 'puddle' },
  { x: 150, y: FLOOR_Y - 16, w: 34, h: 16, type: 'spikes' },

  // ЗАЛ II
  { x: 800, y: FLOOR_Y - 16, w: 34, h: 16, type: 'spikes' },
  { x: 840, y: FLOOR_Y - 12, w: 70, h: 12, type: 'puddle' },

  // ЗАЛ III
  { x: 1450, y: FLOOR_Y - 12, w: 70, h: 12, type: 'puddle' },
  { x: 1540, y: FLOOR_Y - 12, w: 70, h: 12, type: 'puddle' },
  { x: 1630, y: FLOOR_Y - 12, w: 70, h: 12, type: 'puddle' },
  { x: 1490, y: 1036, w: 70, h: 70, type: 'spikes', ceil: true },

  // ЗАЛ IV
  { x: 2380, y: FLOOR_Y, w: 40, h: 8, type: 'slick' },

  // ЗАЛ V
  { x: 3230, y: FLOOR_Y, w: 70, h: 8, type: 'slick' },
  { x: 3245, y: FLOOR_Y - 16, w: 30, h: 16, type: 'spikes' },

  // ЗАЛ VI
  { x: 3950, y: FLOOR_Y, w: 75, h: 8, type: 'slick' },
  { x: 4030, y: FLOOR_Y - 16, w: 30, h: 16, type: 'spikes' },
  { x: 4070, y: FLOOR_Y - 12, w: 60, h: 12, type: 'puddle' },
  { x: 4130, y: FLOOR_Y - 12, w: 40, h: 12, type: 'puddle' },
  { x: 4040, y: 876, w: 60, h: 70, type: 'spikes', ceil: true },
  { x: 4470, y: FLOOR_Y - 12, w: 45, h: 12, type: 'puddle' },
]);

// Шестнадцать лазеров: семь исходных и девять вертикальных лучей
// на месте бывших капель краски. Вертикальные перекрывают проход
// от потолка до пола, горизонтальные натянуты над пропастями.
// phaseOffset сдвигает цикл: соседние лазеры стреляют вразнобой.
export const LASERS = Object.freeze([
  // ЗАЛ II: первый лазер — узкий вертикальный занавес на пути к колодцу.
  { id: 'laser-1', x: 980, y: 796, w: 7, h: FLOOR_Y - 796, phaseOffset: 0 },

  // ЗАЛ III: луч над пропастью с островком.
  { id: 'laser-2', x: 1720, y: FLOOR_Y - 38, w: 230, h: 7, phaseOffset: 1 },

  // ЗАЛ IV: два луча над соседними пропастями, фазы разведены на 1 с.
  { id: 'laser-3', x: 2140, y: FLOOR_Y - 38, w: 240, h: 7, phaseOffset: 0 },
  { id: 'laser-4', x: 2660, y: FLOOR_Y - 38, w: 200, h: 7, phaseOffset: 1 },

  // ЗАЛ V–VII: по одному лучу над пропастью с островком.
  { id: 'laser-5', x: 3300, y: FLOOR_Y - 38, w: 230, h: 7, phaseOffset: 2 },
  { id: 'laser-6', x: 4180, y: FLOOR_Y - 38, w: 230, h: 7, phaseOffset: 0 },
  { id: 'laser-7', x: 4700, y: FLOOR_Y - 38, w: 230, h: 7, phaseOffset: 1 },

  // Бывшие капли краски. Ширина 7 px, x сдвинут на -1, чтобы луч
  // стоял на прежнем месте; phaseOffset = phase * 3 / 2 сохраняет
  // относительный сдвиг при переходе с цикла 2 с на цикл 3 с.
  // ЗАЛ I
  { id: 'laser-drip-1', x: 554, y: 776, w: 7, h: FLOOR_Y - 776, phaseOffset: 0 },

  // ЗАЛ II
  { id: 'laser-drip-2', x: 1199, y: 796, w: 7, h: FLOOR_Y - 796, phaseOffset: 1.5 },

  // ЗАЛ III
  { id: 'laser-drip-3', x: 1749, y: 1036, w: 7, h: FLOOR_Y - 1036, phaseOffset: 0.75 },

  // ЗАЛ IV
  { id: 'laser-drip-4', x: 2634, y: 736, w: 7, h: FLOOR_Y - 736, phaseOffset: 0 },
  { id: 'laser-drip-5', x: 2864, y: 736, w: 7, h: FLOOR_Y - 736, phaseOffset: 1.5 },

  // ЗАЛ V
  { id: 'laser-drip-6', x: 3354, y: 976, w: 7, h: FLOOR_Y - 976, phaseOffset: 0.75 },

  // ЗАЛ VI
  { id: 'laser-drip-7', x: 3999, y: 876, w: 7, h: FLOOR_Y - 876, phaseOffset: 0 },
  { id: 'laser-drip-8', x: 4439, y: 876, w: 7, h: FLOOR_Y - 876, phaseOffset: 1.5 },

  // ЗАЛ VII
  { id: 'laser-drip-9', x: 4659, y: 756, w: 7, h: FLOOR_Y - 756, phaseOffset: 0 },
]);

// Семнадцать врагов. patrol/jumper/flyer/shooter — старые типы,
// guard — сторож с фонарём, pendulum — тяжёлый шар на цепи.
export const ENEMIES = Object.freeze([
  // ЗАЛ I
  { type: 'patrol', x: 120, y: FLOOR_Y - 32, minX: 40, maxX: 180 },
  { type: 'flyer', baseX: 360, baseY: 980, ampX: 70, ampY: 40 },

  // ЗАЛ II: стрелок караулит верх колодца.
  { type: 'shooter', x: 1040, y: 796, dir: -1, range: 520, cooldown: 2.2 },

  // ЗАЛ III
  { type: 'patrol', x: 1500, y: FLOOR_Y - 32, minX: 1430, maxX: 1620 },
  { type: 'jumper', x: 1660, groundY: FLOOR_Y },

  // ЗАЛ IV
  { type: 'flyer', baseX: 2350, baseY: 1000, ampX: 70, ampY: 45 },
  { type: 'shooter', x: 2600, y: 1040, dir: -1, range: 560, cooldown: 2.0 },
  {
    type: 'pendulum',
    anchorX: 2260,
    anchorY: 950,
    length: 260,
    phase: 0,
    mountY: 736,
  },
  {
    type: 'pendulum',
    anchorX: 2760,
    anchorY: 950,
    length: 260,
    phase: 1.5,
    mountY: 736,
  },

  // ЗАЛ V: сторож на площадке, прыгун внизу, маятник над пропастью.
  {
    type: 'guard',
    x: 3430,
    y: 1080 - 40,
    dir: -1,
    flip: 2,
    coneLength: 190,
    coneHalf: 0.17,
  },
  { type: 'flyer', baseX: 3430, baseY: 930, ampX: 90, ampY: 35 },
  {
    type: 'pendulum',
    anchorX: 3685,
    anchorY: 1000,
    length: 250,
    phase: 0,
    mountY: 976,
  },

  // ЗАЛ VI
  { type: 'patrol', x: 3980, y: FLOOR_Y - 32, minX: 3950, maxX: 4120 },
  { type: 'jumper', x: 4450, groundY: FLOOR_Y },

  // ЗАЛ VII
  {
    type: 'guard',
    x: 4950,
    y: FLOOR_Y - 40,
    dir: -1,
    flip: 2,
    coneLength: 190,
    coneHalf: 0.17,
  },
  { type: 'flyer', baseX: 4750, baseY: 1080, ampX: 60, ampY: 45 },
  { type: 'flyer', baseX: 5200, baseY: 1050, ampX: 70, ampY: 50 },
]);

export const DECOR = Object.freeze({
  windows: [
    { x: 60, y: 820, w: 150, h: 180, moon: true },
    { x: 880, y: 840, w: 140, h: 170, moon: false },
    { x: 1460, y: 1060, w: 120, h: 150, moon: true },
    { x: 2280, y: 780, w: 160, h: 200, moon: false },
    { x: 3340, y: 1010, w: 130, h: 160, moon: true },
    { x: 3980, y: 910, w: 140, h: 180, moon: false },
    { x: 4820, y: 800, w: 160, h: 200, moon: true },
  ],

  // Пустые рамы: разный размер, толщина и цвет.
  frames: [
    { x: 500, y: 850, w: 90, h: 110, color: '#7a2b33', lw: 7, kind: 0 },
    { x: 760, y: 860, w: 100, h: 120, color: '#a5761f', lw: 5, kind: 1 },
    { x: 1500, y: 1080, w: 80, h: 96, color: '#2f4a33', lw: 8, kind: 2 },
    { x: 2100, y: 780, w: 90, h: 110, color: '#7a2b33', lw: 4, kind: 1 },
    { x: 3600, y: 1020, w: 90, h: 110, color: '#a5761f', lw: 6, kind: 0 },
    { x: 4300, y: 920, w: 90, h: 110, color: '#2f4a33', lw: 5, kind: 2 },
    { x: 5100, y: 790, w: 110, h: 130, color: '#7a2b33', lw: 6, kind: 1 },
  ],

  // Пилястры на границах залов — фон, а не платформы.
  pilasters: [720, 1400, 2100, 3220, 3940, 4640],

  // Плоские настенные лампы под потолком (x; высота берётся из зала).
  lamps: [360, 1060, 1750, 2660, 3580, 4290, 5010],
});
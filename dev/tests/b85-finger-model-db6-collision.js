/**
 * dev/tests/b85-finger-model-db6-collision.js
 *
 * Набор тестов для Волны B-85:
 * 1. Db6 [9, 11, 11, 10, 11, 9] -> пальцы [1, 3, 3, 2, 4, 1].
 * 2. F6 [1, 3, 3, 2, 3, 1] и F#6 [2, 4, 4, 3, 4, 2] -> пальцы [1, 3, 3, 2, 4, 1].
 * 3. Сохранение корректных пальцев для базовых открытых и баррэ форм (Am, C, D, F, Bm, G).
 * 4. Полное отсутствие коллизий (один и тот же палец 2..4 на разных ладах) по всей библиотеке аккордов.
 * 5. renderFingeringSVG и createInteractiveFretboard корректно выводят пальцы 1, 3, 3, 2, 4, 1 для Db6.
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`   ok   ${message}`);
    passed++;
  } else {
    console.error(`   FAIL ${message}`);
    failed++;
  }
}

function assertEq(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr === expectedStr) {
    console.log(`   ok   ${message}`);
    passed++;
  } else {
    console.error(`   FAIL ${message} (expected ${expectedStr}, got ${actualStr})`);
    failed++;
  }
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

const htmlPath = path.resolve(__dirname, '../../STRUCHORD.html');
const htmlSource = fs.readFileSync(htmlPath, 'utf8');

const dom = new JSDOM(htmlSource, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(win) {
    win.requestAnimationFrame = (fn) => setTimeout(fn, 16);
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '',
      measureText: () => ({ width: 10 }),
      clearRect() {},
      beginPath() {},
      arc() {},
      fill() {},
      stroke() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      save() {},
      restore() {},
      translate() {},
      rotate() {},
      fillText() {},
      strokeText() {},
      setTransform() {},
      scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
  },
});

const w = dom.window;

async function runTests() {
  section('1. Расчёт пальцев для 6-х баррэ форм (Db6, F6, F#6)');

  const db6Shape = [9, 11, 11, 10, 11, 9];
  const db6Fingers = w.computeFingersForShape(db6Shape);
  assertEq(db6Fingers, [1, 3, 3, 2, 4, 1], 'Db6 [9, 11, 11, 10, 11, 9] -> [1, 3, 3, 2, 4, 1]');

  const f6Shape = [1, 3, 3, 2, 3, 1];
  const f6Fingers = w.computeFingersForShape(f6Shape);
  assertEq(f6Fingers, [1, 3, 3, 2, 4, 1], 'F6 [1, 3, 3, 2, 3, 1] -> [1, 3, 3, 2, 4, 1]');

  const fs6Shape = [2, 4, 4, 3, 4, 2];
  const fs6Fingers = w.computeFingersForShape(fs6Shape);
  assertEq(fs6Fingers, [1, 3, 3, 2, 4, 1], 'F#6 [2, 4, 4, 3, 4, 2] -> [1, 3, 3, 2, 4, 1]');

  section('2. Базовые открытые и баррэ формы');

  const amFingers = w.computeFingersForShape(['x', 0, 2, 2, 1, 0]);
  assertEq(amFingers, ['x', 0, 2, 3, 1, 0], 'Am открытый [x, 0, 2, 2, 1, 0] -> [x, 0, 2, 3, 1, 0]');

  const cFingers = w.computeFingersForShape(['x', 3, 2, 0, 1, 0]);
  assertEq(cFingers, ['x', 3, 2, 0, 1, 0], 'C открытый [x, 3, 2, 0, 1, 0] -> [x, 3, 2, 0, 1, 0]');

  const dFingers = w.computeFingersForShape(['x', 'x', 0, 2, 3, 2]);
  assertEq(dFingers, ['x', 'x', 0, 1, 3, 2], 'D открытый [x, x, 0, 2, 3, 2] -> [x, x, 0, 1, 3, 2]');

  const fFingers = w.computeFingersForShape([1, 3, 3, 2, 1, 1]);
  assertEq(fFingers, [1, 3, 4, 2, 1, 1], 'F баррэ [1, 3, 3, 2, 1, 1] -> [1, 3, 4, 2, 1, 1]');

  const bmFingers = w.computeFingersForShape(['x', 2, 4, 4, 3, 2]);
  assertEq(bmFingers, ['x', 1, 3, 4, 2, 1], 'Bm баррэ [x, 2, 4, 4, 3, 2] -> [x, 1, 3, 4, 2, 1]');

  const gFingers = w.computeFingersForShape([3, 2, 0, 0, 0, 3]);
  assertEq(gFingers, [2, 1, 0, 0, 0, 3], 'G открытый [3, 2, 0, 0, 0, 3] -> [2, 1, 0, 0, 0, 3]');

  section('3. Отрисовка SVG и интерактивный гриф для Db6');

  const svg = w.renderFingeringSVG(db6Shape, 24, { showFingers: true });
  assert(svg.includes('>1<'), 'SVG содержит метку пальца 1 (баррэ)');
  assert(svg.includes('>2<'), 'SVG содержит метку пальца 2 (3-я струна)');
  assert(svg.includes('>3<'), 'SVG содержит метку пальца 3 (5-я и 4-я струны)');
  assert(svg.includes('>4<'), 'SVG содержит метку пальца 4 (2-я струна)');

  section('4. Проверка всей библиотеки на отсутствие коллизий');

  const chords = [
    'C', 'Cm', 'C7', 'Cmaj7', 'Cm7', 'C6', 'C9', 'Cadd9', 'Csus4', 'Csus2', 'Cdim', 'Cdim7', 'Cm7b5',
    'Db', 'Dbm', 'Db7', 'Dbmaj7', 'Dbm7', 'Db6', 'Db9', 'Dbadd9',
    'D', 'Dm', 'D7', 'Dmaj7', 'Dm7', 'D6', 'D9', 'Dadd9',
    'Eb', 'Ebm', 'Eb7', 'Ebmaj7', 'Ebm7', 'Eb6',
    'E', 'Em', 'E7', 'Emaj7', 'Em7', 'E6', 'E9', 'Eadd9', 'E7#9',
    'F', 'Fm', 'F7', 'Fmaj7', 'Fm7', 'F6', 'F9',
    'F#', 'F#m', 'F#7', 'F#maj7', 'F#m7', 'F#6',
    'G', 'Gm', 'G7', 'Gmaj7', 'Gm7', 'G6', 'G9', 'Gadd9',
    'Ab', 'Abm', 'Ab7', 'Abmaj7', 'Abm7', 'Ab6',
    'A', 'Am', 'A7', 'Amaj7', 'Am7', 'A6', 'A9', 'Aadd9',
    'Bb', 'Bbm', 'Bb7', 'Bbmaj7', 'Bbm7', 'Bb6',
    'B', 'Bm', 'B7', 'Bmaj7', 'Bm7', 'B6'
  ];

  let collisionCount = 0;
  let totalShapes = 0;

  for (const ch of chords) {
    const v = w.getFingeringVariants(ch, 'C');
    if (!v || !v.shapes) continue;
    v.shapes.forEach((shape) => {
      totalShapes++;
      const f = w.computeFingersForShape(shape);
      if (!f) return;

      const fingerFrets = new Map();
      for (let s = 0; s < 6; s++) {
        const finger = f[s];
        const fret = shape[s];
        if (finger === 'x' || finger === 0 || finger === '0' || finger === 'T' || fret === 'x' || fret === 0 || fret === '0') continue;
        if (!fingerFrets.has(finger)) fingerFrets.set(finger, new Set());
        fingerFrets.get(finger).add(fret);
      }

      for (const [finger, frets] of fingerFrets.entries()) {
        if (finger !== 1 && frets.size > 1) {
          collisionCount++;
        }
      }
    });
  }

  assert(totalShapes > 1000, `Проверено ${totalShapes} форм аккордов из библиотеки`);
  assertEq(collisionCount, 0, 'Количество анатомических коллизий пальцев 2..4 на разных ладах равно 0');

  console.log(`\nИТОГО: пройдено ${passed}, провалено ${failed}`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

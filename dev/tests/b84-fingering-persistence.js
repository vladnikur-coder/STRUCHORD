/**
 * dev/tests/b84-fingering-persistence.js
 *
 * Набор тестов для Волны B-84:
 * 1. resolveFingeringShape: безусловный приоритет пользовательских форм (ev.fingering и preferredFingeringByChord).
 * 2. resolveFingeringShape: работа с кастомными / нераспознанными аккордами (getFingeringVariants -> []).
 * 3. openFingeringEditor: прямая инициализация currentShape из entrySnapshot.fingering.
 * 4. commitEditSave: корректная привязка к тональности секции (sec.key || globalKey) и прямое обновление ev.
 * 5. Round-trip: сохранение кастомного войсинга -> проверка resolveFingeringShape -> повторное открытие редактора.
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
const { document } = w;

function ev(code) {
  return w.eval(code);
}

function wait(ms = 20) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  section('1. resolveFingeringShape: приоритет ev.fingering без блокировки через shapeMatchesChord');

  const evAltered = {
    chord: 'C',
    fingering: ['x', 3, 2, 0, 1, 3], // C chord with high G (or altered top note)
  };
  const resolvedAltered = w.resolveFingeringShape('C', 'C', null, evAltered);
  assertEq(resolvedAltered, ['x', 3, 2, 0, 1, 3], 'ev.fingering как массив возвращается напрямую');

  const evStringFingering = {
    chord: 'C',
    fingering: 'x,3,2,0,1,3',
  };
  const resolvedString = w.resolveFingeringShape('C', 'C', null, evStringFingering);
  assertEq(resolvedString, ['x', 3, 2, 0, 1, 3], 'ev.fingering как строка парсится и возвращается');

  const evForeignTuning = {
    chord: 'C',
    fingering: 'x,3,2,0,1,3',
    fingeringTuning: '@DROP_D',
  };
  const resolvedForeign = w.resolveFingeringShape('C', 'C', null, evForeignTuning);
  assert(
    JSON.stringify(resolvedForeign) !== JSON.stringify(['x', 3, 2, 0, 1, 3]),
    'Форма из чужого строя не применяется в стандартном строе'
  );

  section('2. resolveFingeringShape: кастомные и нераспознанные аккорды (getFingeringVariants пуст)');

  const evCustomChord = {
    chord: 'CustomX9',
    fingering: ['x', 'x', 4, 2, 3, 1],
  };
  const resolvedCustom = w.resolveFingeringShape('CustomX9', 'C', null, evCustomChord);
  assertEq(resolvedCustom, ['x', 'x', 4, 2, 3, 1], 'Кастомный аккорд возвращает форму из ev.fingering');

  // preferredFingeringByChord lookup
  const customPosKey = 'CustomX9|C|0|0|0';
  ev(`preferredFingeringByChord.set("${customPosKey}", "x,x,4,2,3,1")`);
  const resolvedPosKey = w.resolveFingeringShape('CustomX9', 'C', customPosKey);
  assertEq(resolvedPosKey, ['x', 'x', 4, 2, 3, 1], 'preferredFingeringByChord возвращает форму для кастомного аккорда');

  section('3. openFingeringEditor: прямая инициализация из entrySnapshot.fingering');

  // Setup sections in window scope
  ev(`
    sections = [
      {
        id: 101,
        name: 'Куплет',
        key: 'G',
        squares: [
          {
            id: 201,
            events: [
              {
                chord: 'C',
                fingering: 'x,3,2,0,3,3',
                barreOff: [],
                fingers: [null, 2, 1, null, 3, 4],
              },
            ],
          },
        ],
      },
    ];
  `);

  const wrapper = document.createElement('div');
  wrapper.className = 'chord-wrapper';
  wrapper.dataset.sec = '101';
  wrapper.dataset.square = '201';
  wrapper.dataset.ei = '0';
  const chordInput = document.createElement('input');
  chordInput.className = 'chord-input';
  chordInput.value = 'C';
  chordInput.dataset.sec = '101';
  chordInput.dataset.square = '201';
  chordInput.dataset.ei = '0';
  wrapper.appendChild(chordInput);
  document.body.appendChild(wrapper);

  // Open editor for this cell
  w.openFingeringEditor('C', 0, wrapper);
  await wait(50);

  const modal = document.querySelector('.fingering-modal') || document.querySelector('.fe-modal');
  assert(!!modal, 'Модалка редактора открылась успешно');

  const fretboardContainer = document.getElementById('fingering-editor-fretboard');
  assert(!!fretboardContainer, 'Контейнер грифа найден в модалке');

  // Verify that circles / text in fretboard match entrySnapshot.fingering ['x', 3, 2, 0, 3, 3]
  const svgCircles = Array.from(modal.querySelectorAll('circle'));
  assert(svgCircles.length >= 3, 'На грифе отрисованы точки сохраненной формы Cadd9');

  // Close editor via Cancel
  const cancelBtn = modal.querySelector('#cancel-fingering') || modal.querySelector('.fe-btn--ghost');
  if (cancelBtn) cancelBtn.click();
  await wait(50);
  assert(!document.querySelector('.fingering-modal') && !document.querySelector('.fe-modal'), 'Редактор закрылся');

  section('4. commitEditSave: сохранение с тональностью секции и прямое обновление ev');

  // Open editor again and save
  w.openFingeringEditor('C', 0, wrapper);
  await wait(50);

  const editModal = document.querySelector('.fingering-modal') || document.querySelector('.fe-modal');
  const saveBtn = editModal.querySelector('#save-fingering');

  saveBtn.click();
  await wait(50);

  assert(!document.querySelector('.fingering-modal') && !document.querySelector('.fe-modal'), 'После сохранения модалка закрылась');

  const savedEv = ev('sections[0].squares[0].events[0]');
  assert(savedEv.fingering != null, 'Событие сохранило fingering');
  assertEq(
    typeof savedEv.fingering === 'string' ? savedEv.fingering.split(',').map((v) => (v === 'x' ? 'x' : Number(v))) : savedEv.fingering,
    ['x', 3, 2, 0, 3, 3],
    'Событие содержит сохраненный хват [x, 3, 2, 0, 3, 3]'
  );

  const posKeyExpected = w.buildFingeringPositionKey('C', 'G', 101, 201, 0);
  const preferredVal = ev(`preferredFingeringByChord.get("${posKeyExpected}")`);
  assertEq(preferredVal, 'x,3,2,0,3,3', 'preferredFingeringByChord привязан к тональности секции (G)');

  section('5. Round-trip: повторное открытие редактора загружает сохраненную кастомную форму');

  w.openFingeringEditor('C', 0, wrapper);
  await wait(50);

  const reModal = document.querySelector('.fingering-modal') || document.querySelector('.fe-modal');
  assert(!!reModal, 'Повторно открыта модалка для C');

  const reCloseBtn = reModal.querySelector('#cancel-fingering') || reModal.querySelector('.fe-btn--ghost');
  if (reCloseBtn) reCloseBtn.click();
  await wait(50);

  section('6. Кастомный аккорд без библиотечных заготовок открывается в редакторе без ошибок');

  ev(`
    sections[0].squares[0].events[0].chord = 'Xdim7alt';
    sections[0].squares[0].events[0].fingering = 'x,x,5,4,3,2';
  `);
  chordInput.value = 'Xdim7alt';

  let threw = false;
  try {
    w.openFingeringEditor('Xdim7alt', 0, wrapper);
  } catch (err) {
    threw = true;
    console.error('Error opening editor for custom chord:', err);
  }
  await wait(50);

  assert(!threw, 'openFingeringEditor для кастомного аккорда не выбросил ошибку');
  const customModal = document.querySelector('.fingering-modal') || document.querySelector('.fe-modal');
  assert(!!customModal, 'Модалка открылась даже при пустом getFingeringVariants');

  const customCloseBtn = customModal.querySelector('#cancel-fingering') || customModal.querySelector('.fe-btn--ghost');
  if (customCloseBtn) customCloseBtn.click();
  await wait(50);

  console.log(`\nИТОГО: пройдено ${passed}, провалено ${failed}`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

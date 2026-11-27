'use strict';
// 0.869 · таб-миниатюра: все такты вставки + линейка долей по РЕАЛЬНЫМ
// координатам alphaTab. Чистый Node + vm (без зависимостей и без браузера).
//
// Падал на коде 0.868:
//   • миниатюра брала первый <svg> из нескольких (только первый такт);
//   • линейка считалась равномерно по ширине карточки, поэтому ключ TAB и
//     размер слева сдвигали числа на 1–3 доли от нот.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const ROADMAP = fs.readFileSync(path.join(ROOT, 'ROADMAP.md'), 'utf8');

const plain = (x) => JSON.parse(JSON.stringify(x));
let passed = 0;
function ok(msg) {
  passed++;
  console.log('  ok  ' + msg);
}

function sliceBetween(startMarker, endMarker, label) {
  const i0 = HTML.indexOf(startMarker);
  assert(i0 >= 0, `start marker not found (${label})`);
  const i1 = HTML.indexOf(endMarker, i0 + startMarker.length);
  assert(i1 > i0, `end marker not found (${label})`);
  return HTML.slice(i0, i1);
}

function extractFn(name) {
  const marker = '\nfunction ' + name + '(';
  const i0 = HTML.indexOf(marker);
  assert(i0 >= 0, `function ${name} not found`);
  const i1 = HTML.indexOf('\n}\n', i0);
  assert(i1 > i0, `end of function ${name} not found`);
  return HTML.slice(i0 + 1, i1 + 2);
}

// =====================================================================
// 1. Статические инварианты 0.871
// =====================================================================
{
  assert(HTML.includes('ver 0.880'), 'STRUCHORD.html header is ver 0.880');
  assert(SW.includes("const CACHE_NAME = 'struchord-v880';"), 'sw.js CACHE_NAME is struchord-v880');
  assert(README.includes('`0.880`'), 'README header is 0.879');
  assert(ROADMAP.includes('**0.880**'), 'ROADMAP header is 0.879');

  // А: все такты в одной строке, картинка выбирается по площади.
  assert(
    HTML.includes('tabThumbApi.settings.display.barsPerRow = built.barCount;'),
    'миниатюра печатает все такты в одной строке (barsPerRow)',
  );
  assert(
    HTML.includes('tabThumbApi.settings.display.barCountPerPartial = Math.max(10, built.barCount);'),
    'части рисунка не режутся на barCountPerPartial',
  );
  assert(HTML.includes('function tabThumbBigSvg(host)'), 'выбор главного рисунка alphaTab');
  assert(!/tabThumbHost\.querySelector\('svg'\)/.test(HTML), 'первый <svg> больше не берётся');

  // Б: линейка считается по visualBounds долей, а не по сетке карточки.
  assert(HTML.includes('function tabThumbBeatAnchors(built)'), 'якоря долей из boundsLookup');
  assert(HTML.includes('function tabThumbRulerMarks('), 'чистая арифметика линейки');
  assert(HTML.includes('function tabThumbRulerHtml('), 'сборка линейки');
  assert(
    HTML.includes("root.querySelector('[data-tab-counts]')"),
    'линейка накладывается на карточку вместе с картинкой',
  );
  assert(
    !HTML.includes('const fullRowRuler ='),
    'равномерная линейка buildInnerCounts у таба больше не рисуется',
  );
  // 0.877: линейка alphaTab осталась только там, где рисует alphaTab —
  // в Ленте. В редакторе песни стан свой («Только цифры»), и мелкой
  // линейки «1 1 и 2 2 та и та» в карточке больше нет.
  // 0.880: в клетке Ленты своя мини-линейка снята — счёт под вставкой
  // рисует общая линейка Ленты. Разметка под неё осталась там, где alphaTab
  // по-прежнему один: в окне редактора вставки (engine: 'alphatab').
  assert(
    HTML.includes('const tabRuler = !useDigits && !inTimeline && thumbSpec'),
    'своя линейка карточки живёт вне Ленты (0.880)',
  );
  assert(
    HTML.includes('const inTimeline = !!(cellOpts && cellOpts.inTimeline);'),
    'разметка знает, что карточка в Ленте',
  );
  assert(
    HTML.includes("renderTabInsertHtml(sec, sq, parentTs, true, { inTimeline: true })"),
    'Лента по-прежнему просит alphaTab',
  );

  // Ключ TAB и размер слева кадрируются — иначе первая нота уезжает под 2–3-ю долю.
  assert(HTML.includes('function tabThumbSvgForCell(svgEl, outFretList = \'\', offsetLeft = 0)'),
    'картинка кадрируется по offsetLeft');

  // 0.880: таб-клетка БОЛЬШЕ НЕ пропускает общий счёт — наоборот, счёт под
  // вставкой теперь приходит из общей линейки (дробление — по самой мелкой
  // ноте вставки, см. tabTimelineRulerSteps).
  assert(
    !/renderRhythmTrack[\s\S]{0,8000}if \(ev\.isTab\) return;/.test(HTML),
    'общий счёт Ленты доходит до таб-клетки (0.880)',
  );
  assert(
    HTML.includes('? tabTimelineRulerSteps(sq, ev)'),
    'дробление счёта под вставкой берётся из её нот',
  );
  ok('Статические инварианты 0.871: версия, SW, все такты, линейка по координатам, кадрирование, лента');
}

// =====================================================================
// 2. Арифметика линейки: позиции чисел равны позициям долей alphaTab
// =====================================================================
const rulerCode = [
  extractFn('tabThumbRulerMarks'),
  extractFn('tabThumbRulerGradient'),
  extractFn('tabThumbRulerSteps'),
  extractFn('tabThumbRulerHtml'),
].join('\n');

function makeRuler(anchorsOverride) {
  const sandbox = {
    console,
    Math,
    Number,
    String,
    Array,
    Map,
    Object,
    parseFloat,
    tabInsertNoteDuration: (n) => n.dur * (n.dots === 1 ? 1.5 : 1) * (n.triplet === true ? 2 / 3 : 1),
    getGridUnitsPerBar: () => 4,
    globalTimeSig: '4/4',
    countLabelFor: (absBeat, subIndex, stepsPerBeat, beatsPerBar) => {
      if (subIndex === 0) {
        if (Math.abs(absBeat - Math.round(absBeat)) > 1e-6) return '';
        return String(Math.round(absBeat) % beatsPerBar + 1);
      }
      if (stepsPerBeat === 2) return subIndex === 1 ? 'и' : '';
      if (stepsPerBeat === 3) return ['', 'та', 'ти'][subIndex] || '';
      if (stepsPerBeat === 4) return ['', 'та', 'и', 'та'][subIndex] || '';
      return '';
    },
    tabThumbBeatAnchors: () => anchorsOverride,
  };
  vm.createContext(sandbox);
  vm.runInContext(
    rulerCode + '\nglobalThis.__api = { tabThumbRulerMarks, tabThumbRulerSteps, tabThumbRulerHtml };',
    sandbox,
  );
  return sandbox.__api;
}

// Один такт 4/4 при ширине 320: ключ TAB и размер съедают 65 px, доли стоят
// там, где их нарисовал alphaTab (последняя шире — место под тактовую черту).
const oneBar = [
  { start: 0, dur: 1, x0: 67.1, x1: 126.4, bar: 0, placeholder: false },
  { start: 1, dur: 1, x0: 126.4, x1: 185.7, bar: 0, placeholder: false },
  { start: 2, dur: 1, x0: 185.7, x1: 245.0, bar: 0, placeholder: false },
  { start: 3, dur: 1, x0: 245.0, x1: 308.4, bar: 0, placeholder: false },
];
{
  const api = makeRuler(oneBar);
  const marks = api.tabThumbRulerMarks(oneBar, 4, 1, 4);
  assert.strictEqual(marks.length, 4, 'четыре доли — четыре числа');
  assert.deepStrictEqual(plain(marks.map((m) => m.label)), ['1', '2', '3', '4'], 'номера долей 1–4');
  assert.deepStrictEqual(
    plain(marks.map((m) => Math.round(m.x * 10) / 10)),
    [67.1, 126.4, 185.7, 245.0],
    'числа стоят ровно на координатах alphaTab, а не по равномерной сетке',
  );
  // Старое поведение (равномерно по ширине) дало бы 0/80/160/240: первая нота
  // стояла на нуле, а звучала под второй-третьей долей. Новая линейка сдвинута
  // на 67 px вправо — ровно на ширину ключа TAB и размера.
  const uniform = [0, 80, 160, 240];
  assert(
    Math.abs(marks[0].x - uniform[0]) > 40,
    'первая доля сдвинута на 67 px от края — это и была «нота под 2–3-й долей»',
  );
  assert(
    plain(marks.map((m) => Math.round(m.x))).join(',') !== uniform.join(','),
    'линейка не равномерная: позиции берутся у alphaTab',
  );
  ok('Один такт: числа на реальных координатах долей (67.1 / 126.4 / 185.7 / 245.0), а не 0/80/160/240');
}

// Три такта: второй такт начинается своей долей, а не посередине карточки.
{
  const threeBars = oneBar.map((a) => ({ ...a, x0: a.x0 - 67.1 + 2, x1: a.x1 - 67.1 + 2 })).concat([
    { start: 4, dur: 1, x0: 171.6, x1: 194.1, bar: 1, placeholder: false },
    { start: 5, dur: 1, x0: 194.1, x1: 216.6, bar: 1, placeholder: false },
    { start: 6, dur: 1, x0: 216.6, x1: 239.1, bar: 1, placeholder: false },
    { start: 7, dur: 1, x0: 239.1, x1: 265.7, bar: 1, placeholder: false },
    { start: 8, dur: 4, x0: 276.2, x1: 308.5, bar: 2, placeholder: true },
  ]);
  const api = makeRuler(threeBars);
  const marks = api.tabThumbRulerMarks(threeBars, 12, 1, 4);
  assert.strictEqual(marks.length, 8, 'восемь записанных долей из трёх тактов — восемь чисел');
  assert.deepStrictEqual(
    plain(marks.map((m) => m.label)),
    ['1', '2', '3', '4', '1', '2', '3', '4'],
    'счёт перезапускается на каждом такте',
  );
  const barOne = marks.filter((m) => m.node < 8);
  assert(
    Math.abs(barOne[0].x - 2) < 1e-6 && Math.abs(barOne[4].x - 171.6) < 1e-6,
    'первый такт начинается со своей доли, второй — со своей (171.6), а не с 1/4 ширины',
  );
  assert(
    marks.every((m) => Math.abs(m.x - 276.2) > 1e-6),
    'полностью пустой хвостовой такт не подписывается (целая пауза-заглушка узкая)',
  );
  ok('Три такта: у каждого такта свои координаты, пустой хвостовой такт без цифр');
}

// Долгая нота: узлы внутри неё интерполируются, но не теряются.
{
  const half = [{ start: 0, dur: 2, x0: 30, x1: 130, bar: 0, placeholder: false }];
  const api = makeRuler(half);
  const marks = api.tabThumbRulerMarks(half, 2, 1, 4);
  assert.deepStrictEqual(plain(marks.map((m) => m.label)), ['1', '2'], 'половинная подписана и на второй доле');
  assert(Math.abs(marks[1].x - 80) < 1e-6, 'вторая доля — середина половинной');
  ok('Половинная нота: вторая доля стоит на своём месте внутри неё');
}

// Восьмые: счёт «1 и 2 и», шаг дробится.
{
  const eighths = [];
  for (let i = 0; i < 8; i++) eighths.push({ start: i / 2, dur: 0.5, x0: 40 + i * 30, x1: 70 + i * 30, bar: 0, placeholder: false });
  const api = makeRuler(eighths);
  assert.strictEqual(api.tabThumbRulerSteps(eighths), 2, 'восьмые дают шаг 1/2');
  const marks = api.tabThumbRulerMarks(eighths, 4, 2, 4);
  assert.deepStrictEqual(
    plain(marks.map((m) => m.label)),
    ['1', 'и', '2', 'и', '3', 'и', '4', 'и'],
    'счёт восьмыми: 1 и 2 и 3 и 4 и',
  );
  ok('Восьмые: счёт «1 и 2 и 3 и 4 и» на своих узлах');
}

// =====================================================================
// 3. Сборка линейки: проценты от обрезанной картинки
// =====================================================================
{
  const api = makeRuler(oneBar);
  const noCrop = api.tabThumbRulerHtml({}, { b: 4, t: '4/4' }, 320, 0);
  const lefts = [...noCrop.counts.matchAll(/left:([\d.]+)%/g)].map((m) => Number(m[1]));
  assert.deepStrictEqual(
    plain(lefts.map((v) => Math.round((v / 100) * 320 * 10) / 10)),
    [67.1, 126.4, 185.7, 245],
    'без кадрирования проценты соответствуют координатам alphaTab',
  );
  const cropped = api.tabThumbRulerHtml({}, { b: 4, t: '4/4' }, 320, 61.076);
  const cropLefts = [...cropped.counts.matchAll(/left:([\d.]+)%/g)].map((m) => Number(m[1]));
  assert(
    cropLefts.every((v, i) => v < lefts[i]),
    'после кадрирования левой служебной зоны все числа сдвигаются влево',
  );
  assert(
    Math.round((cropLefts[0] / 100) * 320 * 10) / 10 === 7.4,
    'первая доля стоит сразу у левого края (7.4 px из 320)',
  );
  assert(/is-edge/.test(cropped.counts), 'крайняя левая цифра прижата к кромке, а не центрирована');
  assert(/is-downbeat/.test(cropped.counts), '«1» выделена как сильная доля');
  assert(cropped.ticks.includes('--color-tick-line'), 'засечки долей окрашены токеном темы');
  assert(cropped.subticks === '', 'при целых долях подсетка не рисуется');
  const eighthHtml = api.tabThumbRulerHtml({}, { b: 4, t: '4/4' }, 320, 0);
  assert(eighthHtml.subticks === '', 'шаг 1 не даёт подсетки');
  ok('Сборка: проценты считаются от обрезанной картинки, «1» у кромки, засечки из токена темы');
}

console.log('\nитого: ' + passed + ' групп OK');

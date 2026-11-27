#!/usr/bin/env node
'use strict';
// 0.881 · таб-вставка в ЛЕНТЕ без искажений: свой стан вместо растянутого
// alphaTab.
//
// Что забраковал владелец в 0.880 (замеры в Chromium, Oasis, вставка
// 2 доли × 4 шестнадцатых, клетка 192×98):
//   • preserveAspectRatio="none" растягивал картинку по X в 1.8 раза —
//     цифры расплющены, а глиф уже не той формы;
//   • содержимое alphaTab было 238 px по высоте при кадре 98 px — верхняя и
//     нижняя струны с цифрами срезаны;
//   • первая нота стояла в x=0, её цифру срезал край карточки.
//
// Решение 0.881: в Ленте стан рисует тот же движок «Только цифры», что в
// сетке редактора (0.877–0.879), но в режиме «lenta»:
//   • x = начало вставки + доля × ширина клетки (время, а не номер ноты);
//   • цифра прижата ЛЕВЫМ краем к своему моменту — так требует владелец;
//   • своей линейки внутри нет, вся высота отдана стану, отступ ≥ 4 px;
//   • SVG не масштабируется вообще (viewBox = размер клетки), поэтому
//     пропорции глифа естественные по построению.
//
// Запуск: node dev/tests/b12-timeline-tab-0881.js

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const ROADMAP = fs.readFileSync(path.join(ROOT, 'ROADMAP.md'), 'utf8');
const CHANGELOG = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');

let passed = 0;
function ok(msg) {
  passed++;
  console.log('  ok  ' + msg);
}
const r3 = (v) => Math.round(v * 1000) / 1000;

function cssRule(selector) {
  const i = HTML.indexOf('\n' + selector + ' {');
  assert(i >= 0, `CSS-правило не найдено: ${selector}`);
  const j = HTML.indexOf('}', i);
  return HTML.slice(i, j + 1);
}

// =====================================================================
// 1. Статические инварианты 0.881
// =====================================================================
{
  assert(HTML.includes('ver 0.881'), 'STRUCHORD.html header is ver 0.881');
  assert(SW.includes("const CACHE_NAME = 'struchord-v881';"), 'sw.js CACHE_NAME is struchord-v881');
  assert(README.includes('`0.881`'), 'README header is 0.881');
  assert(ROADMAP.includes('**0.881**'), 'ROADMAP header is 0.881');
  assert(CHANGELOG.includes('## 0.881'), 'CHANGELOG has 0.881 entry');

  // А. Никакого неравномерного масштаба: в таб-станции «none» не осталось.
  //    (В других местах приложения оно законно — там растягивается декор,
  //    а не музыкальные глифы, поэтому проверяем только код стана.)
  const thumbRegion = HTML.slice(
    HTML.indexOf('function tabThumbSvgForCell('),
    HTML.indexOf('function tabThumbRulerHtml('),
  );
  assert(thumbRegion.length > 200, 'код alphaTab-картинки найден');
  assert(!/preserveAspectRatio[^;\n]*none/.test(thumbRegion),
    'в alphaTab-картинке (окно редактора вставки) нет растяжения «none»');
  const digitsRegion = HTML.slice(
    HTML.indexOf('function tabDigitsSvgMarkup('),
    HTML.indexOf('function tabDigitsSpanText('),
  );
  assert(!/preserveAspectRatio[^;\n]*none/.test(digitsRegion),
    'в стане «только цифры» и Ленты нет растяжения «none»');
  assert(digitsRegion.includes('preserveAspectRatio="xMidYMid meet"'),
    'стан вписывается в свой прямоугольник с сохранением пропорций');
  assert(!/transform="scale\(/.test(HTML), 'цифры не масштабируются трансформом');
  assert(!HTML.includes('textLength'), 'глиф не растягивается по textLength');

  // Лента больше не просит картинку у alphaTab: сборки кадра для неё нет.
  assert(!HTML.includes('function tabThumbTimelineSvg('), 'сборка «растянутого» кадра Ленты удалена');
  assert(!HTML.includes('function tabThumbShiftBeatGroup('), 'пофреймовый сдвиг групп alphaTab удалён');
  assert(HTML.includes('function tabThumbRenderPayload(spec, width)'),
    'alphaTab-картинка осталась только для окна редактора вставки');
  assert(!/fitHeight/.test(HTML), 'замер высоты под alphaTab в Ленте снят');

  // Б. Свой стан рисуется и в сетке editors, и в Ленте.
  assert(HTML.includes("const useDigits = !(cellOpts && cellOpts.engine === 'alphatab');"),
    'свой стан везде, alphaTab — только по явному engine: alphatab');
  assert(HTML.includes("const digitsLayout = inTimeline ? 'lenta' : (isCell ? 'cell' : 'block');"),
    'карточка Ленты просит раскладку «lenta»');
  assert(HTML.includes("(useDigits ? (inTimeline ? ' tab-insert--lenta' : ' tab-insert--digits') : '')"),
    'класс карточки Ленты — tab-insert--lenta');
  assert(HTML.includes("const isLenta = options.layout === 'lenta';"), 'раскладка знает режим lenta');
  assert(HTML.includes('const atStart = L.anchor === \'start\';'), 'разметка умеет прижимать цифру влево');
  assert(HTML.includes("const tabRuler = !useDigits && thumbSpec"),
    'мини-линейка осталась только у alphaTab-картинки окна редактора');

  // В. Высота клетки — одна переменная, как в 0.880 (не ломаем).
  const cellRule = cssRule('.tl-cell');
  assert(/--tl-cell-height:\s*4\.875rem/.test(cellRule), 'высота клетки Ленты живёт в переменной');
  const tabRule = cssRule('.tl-cell.tl-cell--tab');
  assert(/height:\s*var\(--tl-cell-height/.test(tabRule), 'таб-клетка берёт ТУ ЖЕ высоту');
  assert(/padding:\s*0/.test(tabRule), 'у таб-клетки нет внутренних полей');

  // Г. Карточка Ленты: прозрачная, без рамки и полей, стан не выпускает
  //    ничего наружу; скругление края ленты не режет стан (поля у крайних
  //    клеток песни).
  const cardRule = cssRule('.tab-insert--lenta');
  assert(/border:\s*0/.test(cardRule), 'у карточки Ленты нет рамки');
  assert(/background:\s*transparent/.test(cardRule), 'фон даёт клетка Ленты, а не карточка');
  assert(/padding:\s*0/.test(cardRule), 'у карточки нет полей — линии стана идут от края до края');
  assert(/overflow:\s*hidden/.test(cardRule), 'стан не вылезает за клетку');
  assert(/--tab-digit-halo:\s*var\(--tl-cell-bg/.test(cardRule),
    'подложка под цифрой того же цвета, что клетка');
  assert(HTML.includes('.tl-section:first-child .tl-square:first-child .tl-cell:first-child .tab-insert--lenta {\n  padding-left: 0.5rem;'),
    'первая клетка песни отдаёт скруглению 0.5rem слева — стан не срезан');
  assert(HTML.includes('.tl-section:last-child .tl-square:last-child .tl-cell:last-child .tab-insert--lenta {\n  padding-right: 0.5rem;'),
    'последняя клетка песни отдаёт скруглению 0.5rem справа');

  // Д. Сетка редактора (0.877–0.879) не тронута.
  assert(HTML.includes('function tabDigitsLayout('), 'раскладка «только цифры» на месте');
  assert(HTML.includes('function tabDigitsSvgMarkup('), 'рисование «только цифры» на месте');
  assert(HTML.includes('.tab-insert--digits {'), 'стили цифровой карточки на месте');
  assert(/const padX = isLenta \? 0 : \(isCell \? TAB_DIGITS_CELL_PAD_X/.test(HTML),
    'поля сетки редактора прежние — режим lenta их не меняет');
  assert(HTML.includes('const firstX = padX + (boxW - stripW) / 2 + step / 2;'),
    'центрированная сетка редактора не изменилась');
  ok('Статика 0.881: «none» нет, Лента рисует свой стан, сетка 0.879 и высота 0.880 целы');
}

// =====================================================================
// Живой стенд (jsdom): Лента и редактор на одной модели
// =====================================================================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function boot() {
  let raw = HTML;
  for (const f of ['keyboard-audio.js', 'keyboard-accompaniment.js']) {
    const tag = `<script src="./${f}"></script>`;
    if (raw.includes(tag)) {
      raw = raw.replace(tag, () => `<script>${fs.readFileSync(path.join(ROOT, f), 'utf8')}</script>`);
    }
  }
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => {
    if (!/Could not parse CSS|Not implemented/.test(e.message)) errors.push(e.message);
  });
  const dom = new JSDOM(raw, {
    url: 'http://127.0.0.1:8080/STRUCHORD.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(win) {
      win.matchMedia = () => ({
        matches: false, addListener() {}, removeListener() {},
        addEventListener() {}, removeEventListener() {},
      });
      win.HTMLCanvasElement.prototype.getContext = () => ({
        font: '', measureText: () => ({ width: 8 }),
        clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
        moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {},
        translate() {}, rotate() {}, fillText() {}, strokeText() {},
        setTransform() {}, scale() {},
        createLinearGradient: () => ({ addColorStop() {} }),
      });
      // Лента меряет клетки: в jsdom ширины нет, поэтому берём её из inline-стиля.
      Object.defineProperty(win.HTMLElement.prototype, 'offsetWidth', {
        get() { return parseFloat(this.style && this.style.width) || 100; },
      });
    },
  });
  return { w: dom.window, doc: dom.window.document, errors };
}

// Размер тела карточки в jsdom: раскладки нет, поэтому подменяем ровно те
// числа, которые в браузере даёт clientWidth/clientHeight.
function sizeBody(w, body, width, height) {
  Object.defineProperty(body, 'clientWidth', { configurable: true, get: () => width });
  Object.defineProperty(body, 'clientHeight', { configurable: true, get: () => height });
}

// Сценарий владельца: вставка 2 доли × 4 шестнадцатых перед первой ячейкой.
const OWNER_NOTES = `[
  { start: 0,    dur: 0.25, string: 0, fret: 3 },
  { start: 0.25, dur: 0.25, string: 1, fret: 5 },
  { start: 0.5,  dur: 0.25, string: 2, fret: 7 },
  { start: 0.75, dur: 0.25, string: 3, fret: 2 },
  { start: 1,    dur: 0.25, string: 4, fret: 9 },
  { start: 1.25, dur: 0.25, string: 5, fret: 0 },
  { start: 1.5,  dur: 0.25, string: 2, fret: 12 },
  { start: 1.75, dur: 0.25, string: 1, fret: 5 }
]`;

async function runGeometry() {
  const { w } = boot();
  await sleep(900);

  const geo = w.eval(`
    (function () {
      const notes = ${OWNER_NOTES};
      const domain = tabInsertDomainFrom({ tabInstrument: 'guitar' });
      const L = tabDigitsLayout(notes, 2, globalTimeSig || '4/4', domain, { layout: 'lenta', width: 192, height: 98 });
      const uke = tabDigitsLayout(notes, 2, globalTimeSig || '4/4',
        tabInsertDomainFrom({ tabInstrument: 'ukulele' }), { layout: 'lenta', width: 192, height: 98 });
      // Плотный случай владельца: такт 4/4 из 16 шестнадцатых, 96 px на долю
      // (клетка 384 px) — шаг 24 px, каждый третий лад двузначный.
      const dense = [];
      for (let i = 0; i < 16; i++) dense.push({ start: i * 0.25, dur: 0.25, string: i % 6, fret: i % 3 === 0 ? 12 : (i % 5) + 1 });
      const D = tabDigitsLayout(dense, 4, '4/4', domain, { layout: 'lenta', width: 384, height: 98 });
      // Масштаб Ленты «−»: та же вставка в клетке вдвое уже. Здесь лады
      // однозначные — цифры обязаны остаться читаемыми (≥ 11 px).
      const single = notes.map((n) => ({ ...n, fret: n.fret % 9 }));
      const narrow = tabDigitsLayout(single, 2, '4/4', domain, { layout: 'lenta', width: 96, height: 98 });
      // «−» с двузначным ладом: места на «12» в шаге 12 px нет — кегль
      // станции уменьшается равномерно, но не ниже 8 px, и глиф не вылезает
      // за свой шаг.
      const narrowTwo = tabDigitsLayout(notes, 2, '4/4', domain, { layout: 'lenta', width: 96, height: 98 });
      // Паузы и двузначные лады.
      const pauses = tabDigitsLayout([
        { start: 0, dur: 0.5, pause: true },
        { start: 0.5, dur: 0.5, string: 0, fret: 12 },
        { start: 1, dur: 0.5, string: 1, fret: 10 },
      ], 2, '4/4', domain, { layout: 'lenta', width: 192, height: 98 });
      // Сетка редактора — не должна измениться.
      const cell = tabDigitsLayout(notes, 2, '4/4', domain, { layout: 'cell', width: 96, height: 78 });
      const strip = (L2) => ({
        layout: L2.layout, anchor: L2.anchor, font: L2.font, lineGap: L2.lineGap,
        lineW: L2.lineW, staffTop: L2.staffTop, staffBottom: L2.staffBottom,
        width: L2.width, height: L2.height, strings: L2.strings,
        labels: L2.labels.length,
        x: L2.positions.map((p) => p.x),
        pause: L2.positions.map((p) => !!p.pause),
        sizes: L2.positions.map((p) => p.digits.map((d) => d.font)),
        w: L2.positions.map((p) => p.digits.map((d) => d.w)),
        room: L2.positions.map((p) => p.room),
        ys: L2.positions.map((p) => p.digits.map((d) => d.y)),
      });
      return { lenta: strip(L), uke: strip(uke), dense: strip(D), narrow: strip(narrow),
        narrowTwo: strip(narrowTwo), pauses: strip(pauses), cell: strip(cell) };
    })()
  `);

  // --- А/Б. x по времени, левый край цифры ---
  assert.strictEqual(geo.lenta.layout, 'lenta', 'раскладка вернула режим lenta');
  assert.strictEqual(geo.lenta.anchor, 'start', 'цифра прижата левым краем к своему моменту');
  assert.strictEqual(geo.lenta.labels, 0, 'подписей счёта внутри стана Ленты нет — их рисует общая линейка');
  assert.deepStrictEqual(Array.from(geo.lenta.x).map(r3), [0, 24, 48, 72, 96, 120, 144, 168],
    'x = время × ширина клетки: 8 шестнадцатых на 2 доли в 192 px — шаг 24 px');

  // --- В. Высота: цифры и линии внутри клетки с отступом ≥ 4 px ---
  const font = geo.lenta.font;
  assert(font >= 14, `кегль цифры в Ленте ≥ 14 px (получено ${r3(font)})`);
  const half = font * 0.45;
  assert(geo.lenta.staffTop - half >= 4 - 1e-6,
    `верхняя струна с цифрой внутри клетки с отступом ≥ 4 px (${r3(geo.lenta.staffTop - half)})`);
  assert(geo.lenta.staffBottom + half <= 98 - 4 + 1e-6,
    `нижняя струна с цифрой внутри клетки с отступом ≥ 4 px (${r3(98 - (geo.lenta.staffBottom + half))})`);
  assert.strictEqual(geo.lenta.strings, 6, 'у гитары шесть линий');
  assert(geo.lenta.lineW >= 1, `линия струны не тоньше 1 px (${geo.lenta.lineW})`);
  const ys = Array.from(geo.lenta.ys).flat();
  assert(Math.max(...ys) <= 98 - 4 && Math.min(...ys) >= 4, 'все цифры по вертикали внутри безопасной зоны');

  // 4 струны: линии расходятся шире, но отступы те же.
  assert.strictEqual(geo.uke.strings, 4, 'у укулеле четыре линии');
  assert(geo.uke.staffBottom + geo.uke.font * 0.45 <= 94 + 1e-6, 'укулеле влезает по высоте');
  assert(geo.uke.staffTop - geo.uke.font * 0.45 >= 4 - 1e-6, 'укулеле не прижимается к верхнему краю');

  // --- Е. Плотные случаи ---
  const dense = geo.dense;
  assert(Math.abs(dense.room[1] - 24) < 1e-6, 'у 16-х в 192 px шаг 24 px');
  const sizesFlat = Array.from(dense.sizes).flat();
  const twoDigit = sizesFlat.filter((sz) => sz > 0);
  assert(twoDigit.every((s) => s >= 11), 'ни одна цифра в плотном случае не мельче 11 px');
  // Двузначный лад не налезает на соседа: ширина глифа ≤ своё место.
  const widths = Array.from(dense.w);
  assert(widths.every((row) => row.every((wd) => wd <= 24 + 1e-6)),
    'двузначные лады («12») не шире своего шага 24 px — соседи не налезают');

  // Масштаб «−»: кегль тот же, x пересчитан от новой ширины.
  assert.strictEqual(r3(geo.narrow.font), r3(font), 'при «−» кегль цифры не мельчает');
  assert.deepStrictEqual(Array.from(geo.narrow.x).map(r3), [0, 12, 24, 36, 48, 60, 72, 84],
    'при «−» x = время × 96 px');
  assert(Array.from(geo.narrow.sizes).flat().every((sz) => sz >= 11),
    'при «−» однозначные цифры не мельче 11 px');
  const n2 = Array.from(geo.narrowTwo.sizes).flat();
  assert(n2.every((sz) => sz >= 8), 'при «−» с двузначным ладом кегль не ниже 8 px');
  assert(new Set(n2.map(r3)).size === 1, 'кегль в станции Ленты один на все цифры — стан не «пляшет»');
  assert(Array.from(geo.narrowTwo.w).flat().every((wd) => wd <= 12 - 1 + 1e-6),
    'при «−» двузначный лад не шире своего шага 12 px — соседи не налезают');

  // Паузы: метка паузы без цифр, следующие ноты на своих местах.
  assert.deepStrictEqual(Array.from(geo.pauses.pause), [true, false, false], 'пауза помечена, ноты — нет');
  assert.deepStrictEqual(Array.from(geo.pauses.x).map(r3), [0, 48, 96], 'пауза тоже занимает своё время');
  assert(geo.pauses.sizes[0].length === 0, 'у паузы нет цифры');

  // Сетка редактора прежняя: центрирование, подписи, мелкий кегль от высоты.
  assert.strictEqual(geo.cell.layout, 'cell', 'сетка редактора осталась «cell»');
  assert.strictEqual(geo.cell.anchor, 'middle', 'в сетке цифра по-прежнему центрирована');
  assert(geo.cell.font < font, 'в сетке кегль считается от высоты стана, а не от клетки целиком');
  assert(geo.cell.labels > 0, 'в сетке подписи счёта на месте');
  console.log(
    '      кегль Ленты: ' + r3(font) + ' px, линия ' + geo.lenta.lineW + ' px, ' +
    'верх ' + r3(geo.lenta.staffTop) + ', низ ' + r3(geo.lenta.staffBottom),
  );
  ok('Геометрия Ленты: x по времени, кегль ≥ 14 px, отступы ≥ 4 px, паузы, «−», сетка 0.879 цела');
  w.close();
}

// =====================================================================
// 3. Разметка SVG: всё внутри клетки, ничего не масштабируется
// =====================================================================
async function runMarkup() {
  const { w } = boot();
  await sleep(900);

  const out = w.eval(`
    (function () {
      const notes = ${OWNER_NOTES};
      const domain = tabInsertDomainFrom({ tabInstrument: 'guitar' });
      const L = tabDigitsLayout(notes, 2, '4/4', domain, { layout: 'lenta', width: 192, height: 98 });
      const P = tabDigitsLayout([{ start: 0, dur: 0.5, pause: true }, { start: 0.5, dur: 0.5, string: 0, fret: 7 }],
        2, '4/4', domain, { layout: 'lenta', width: 192, height: 98 });
      return { svg: tabDigitsSvgMarkup(L), pause: tabDigitsSvgMarkup(P), layout: L };
    })()
  `);
  const host = w.document.createElement('div');
  host.innerHTML = out.svg;
  const svg = host.querySelector('svg');
  assert(svg, 'стан собрался в SVG');

  // Пропорции: viewBox ровно в пикселях клетки, значит масштаба нет.
  const vb = svg.getAttribute('viewBox');
  assert.strictEqual(vb, '0 0 192 98', 'viewBox = размер клетки, SVG ничего не растягивает');
  assert.strictEqual(svg.getAttribute('preserveAspectRatio'), 'xMidYMid meet',
    'пропорции сохраняются (не «none»)');

  // Линии струн: шесть штук, через всю ширину, не тоньше 1 px.
  const lines = [...svg.querySelectorAll('line.tab-digits-line')];
  assert.strictEqual(lines.length, 6, 'шесть линий струн');
  lines.forEach((line) => {
    assert.strictEqual(Number(line.getAttribute('x1')), 0.75, 'линия начинается у левого края');
    assert.strictEqual(Number(line.getAttribute('x2')), 191.25, 'линия доходит до правого края');
    assert(Number(line.getAttribute('stroke-width')) >= 1, 'линия не тоньше 1 px');
  });

  // Цифры: явный кегль, левая привязка, никаких трансформов.
  const texts = [...svg.querySelectorAll('text.tab-digits-digit')];
  assert.strictEqual(texts.length, 8, 'восемь цифр — по одной на ноту');
  texts.forEach((t, i) => {
    assert(/^[0-9x]+$/.test(t.textContent), `цифра ${i + 1} — лад, а не служебный символ`);
    assert(t.getAttribute('text-anchor') === 'start', `цифра ${i + 1} прижата левым краем`);
    assert(!t.hasAttribute('transform'), `цифра ${i + 1} не трансформируется`);
    assert(Number(t.getAttribute('font-size')) >= 14, `цифра ${i + 1} не мельче 14 px`);
    assert(!isNaN(Number(t.getAttribute('x'))), `у цифры ${i + 1} есть x`);
  });
  assert.deepStrictEqual(texts.map((t) => r3(Number(t.getAttribute('x')))), [0, 24, 48, 72, 96, 120, 144, 168],
    'x цифр в разметке = моменты звучания');

  // Подложка под каждой цифрой — по её ширине, а не «квадрат на всё».
  const halos = [...svg.querySelectorAll('rect.tab-digits-halo')];
  assert.strictEqual(halos.length, 8, 'подложка есть под каждой цифрой');
  halos.forEach((h, i) => {
    const x = Number(h.getAttribute('x'));
    const wd = Number(h.getAttribute('width'));
    assert(Math.abs(x + 1 - Number(texts[i].getAttribute('x'))) < 0.01, `подложка ${i + 1} начинается у цифры`);
    assert(wd >= 6, `подложка ${i + 1} не вырождена`);
  });

  // Пауза — короткая чёрточка, цифры у неё нет.
  const pauseHost = w.document.createElement('div');
  pauseHost.innerHTML = out.pause;
  const dash = pauseHost.querySelector('line.tab-digits-pause');
  assert(dash, 'пауза нарисована чёрточкой');
  assert.strictEqual(pauseHost.querySelectorAll('text.tab-digits-digit').length, 1,
    'под паузой нет цифры — нота осталась одна');
  assert.strictEqual(pauseHost.querySelectorAll('text.tab-digits-count').length, 0,
    'счёт внутри стана Ленты не дублируется');
  ok('Разметка: viewBox в пикселях клетки, левая привязка цифр, линии на всю ширину, пауза без цифры');
  w.close();
}

// =====================================================================
// 4. Живая Лента: карточка, стан от размера клетки, общий счёт
// =====================================================================
async function runLive() {
  const { w, doc, errors } = boot();
  await sleep(1200);
  assert(!errors.length, 'стенд поднялся без ошибок: ' + errors.join(' | '));
  w.eval(`
    startNewSongFromHome();
    addSection('Verse');
    sections[0].squares[0].events = [
      { chord: '', span: 2, timeSig: null, isTab: true, tabNotes: ${OWNER_NOTES} },
      { chord: 'C', span: 2 }
    ];
    if (!timelineMode) toggleTimelineMode();
    renderTimeline();
  `);

  const tabCell = doc.querySelector('#timelineTrack .tl-cell--tab');
  assert(tabCell, 'в Ленте появилась таб-клетка');
  const card = tabCell.querySelector('.tab-insert');
  assert(card, 'внутри клетки — карточка вставки');
  assert(card.classList.contains('tab-insert--lenta'), 'карточка Ленты — свой стан (tab-insert--lenta)');
  assert(!card.classList.contains('tab-insert--digits'), 'класс сетки редактора в Ленте не используется');
  assert(!card.querySelector('.tab-thumb') && !card.querySelector('.tab-thumb-wait'),
    'картинку у alphaTab Лента больше не просит');
  assert(!card.querySelector('[data-tab-counts]') && !card.querySelector('[data-tab-ticks]'),
    'своей мини-линейки счёта в карточке нет');
  const spec = JSON.parse(decodeURIComponent(card.querySelector('[data-tab-thumb]').getAttribute('data-tab-thumb')));
  assert.strictEqual(spec.n.length, 8, 'состав нот передан целиком — формат данных прежний');
  assert.strictEqual(spec.b, 2, 'длина вставки в долях — 2');

  // Стан рисуется от фактического размера клетки. В jsdom раскладки нет,
  // поэтому подменяем ровно те два числа, что в браузере даёт clientWidth.
  const body = card.querySelector('.tab-insert-body');
  assert(body, 'у карточки есть тело со станом');
  sizeBody(w, body, 192, 98);
  w.eval('tabDigitsPaint(document)');

  const svg = body.querySelector('svg.tab-digits-svg');
  assert(svg, 'стан нарисован');
  assert.strictEqual(svg.getAttribute('viewBox'), '0 0 192 98',
    'viewBox = фактический размер клетки (масштабировать нечего)');
  const xs = [...svg.querySelectorAll('text.tab-digits-digit')].map((t) => r3(Number(t.getAttribute('x'))));
  assert.deepStrictEqual(xs, [0, 24, 48, 72, 96, 120, 144, 168], 'ноты стоят на своих моментах');

  // Таблица «ожидаемый / фактический x» — 4 ноты, как просил владелец.
  const width = 192;
  const table = [0, 0.25, 0.5, 0.75].map((start, i) => ({
    note: i + 1,
    expected: r3((start / 2) * width),
    actual: xs[i],
  }));
  table.forEach((row) => {
    assert(Math.abs(row.expected - row.actual) <= 2,
      `нота ${row.note}: ожидали x≈${row.expected}, получили ${row.actual}`);
  });
  console.log('      x нот в клетке (ожидаемо / фактически): ' +
    table.map((r) => `${r.note}: ${r.expected}/${r.actual}`).join(' · '));

  // Масштаб «−»: та же вставка в клетке 96 px — стан перерисовывается.
  sizeBody(w, body, 96, 98);
  w.eval('tabDigitsPaint(document)');
  const narrow = body.querySelector('svg.tab-digits-svg');
  assert.strictEqual(narrow.getAttribute('viewBox'), '0 0 96 98', '«−»: стан пересчитан под 96 px');
  const narrowXs = [...narrow.querySelectorAll('text.tab-digits-digit')].map((t) => r3(Number(t.getAttribute('x'))));
  assert.deepStrictEqual(narrowXs, [0, 12, 24, 36, 48, 60, 72, 84], '«−»: ноты на своих моментах');
  const narrowSizes = [...narrow.querySelectorAll('text.tab-digits-digit')].map((t) => Number(t.getAttribute('font-size')));
  // Во вставке есть двузначный лад (12), а шаг на «−» — 12 px: кегль
  // станции уменьшается равномерно, но не ниже 8 px, и глиф остаётся в шаге.
  assert(narrowSizes.every((s) => s >= 8), '«−»: цифры не мельче 8 px');
  assert(new Set(narrowSizes.map(r3)).size === 1, '«−»: кегль один на все цифры станции');

  // Общий счёт Ленты — как в 0.880: «1 та и та 2 та и та», дальше 3 и 4.
  const counts = [...doc.querySelectorAll('#timelineRhythm .tl-count')].map((el) => ({
    text: el.textContent,
    isBeat: el.classList.contains('is-beat'),
    left: parseFloat(el.style.left) || 0,
  }));
  const underTab = counts.slice(0, 8);
  assert.deepStrictEqual(
    underTab.map((c) => (c.isBeat ? `[${c.text}]` : c.text)),
    ['[1]', 'та', 'и', 'та', '[2]', 'та', 'и', 'та'],
    'под 2 долями × 4 шестнадцатых стоит «[1] та и та [2] та и та»',
  );
  const afterTab = counts.slice(8);
  assert.deepStrictEqual(afterTab.map((c) => (c.isBeat ? `[${c.text}]` : c.text)), ['[3]', '[4]'],
    'аккорд после вставки продолжает счёт с 3-й доли');

  // Сетка редактора песни — прежняя карточка «только цифры».
  const gridHtml = w.eval(`
    (function () {
      const sec = sections[0];
      const sq = { id: 99, type: 'tab', notes: ${OWNER_NOTES}, span: 1 };
      return renderTabInsertHtml(sec, sq, sec.timeSig || globalTimeSig, false);
    })()
  `);
  assert(/tab-insert--digits/.test(gridHtml), 'в редакторе карточка остаётся «только цифры»');
  assert(/tab-insert--lenta/.test(gridHtml) === false, 'класс Ленты в сетку не протекает');
  assert(/data-tab-positions="8"/.test(gridHtml), 'в редакторе 8 позиций — как в 0.879');

  // Окно редактора вставки по-прежнему просит alphaTab (engine).
  const atHtml = w.eval(`
    (function () {
      const sec = sections[0];
      const sq = { id: 98, type: 'tab', notes: ${OWNER_NOTES}, span: 2 };
      return renderTabInsertHtml(sec, sq, sec.timeSig || globalTimeSig, false, { engine: 'alphatab' });
    })()
  `);
  assert(/data-tab-counts/.test(atHtml), 'в окне редактора вставки мини-линейка осталась');
  assert(!/tab-digits-svg/.test(atHtml), 'в окне редактора вставки рисует alphaTab, а не свой стан');
  ok('Живая Лента: свой стан от размера клетки, «−» пересчитывает, счёт 0.880 цел, редактор не тронут');
  w.close();
}

// =====================================================================
// 5. Дробление счёта под вставкой — по самой мелкой ноте (0.880, без правок)
// =====================================================================
async function runSteps() {
  const { w } = boot();
  await sleep(900);
  const steps = w.eval(`
    (function () {
      const notes = (count, dur) => Array.from({ length: count }, (_, i) => ({ start: i * dur, dur, string: 0, fret: 1 }));
      const sq = (list) => ({ id: 1, type: 'tab', notes: list });
      return {
        sixteenths: tabTimelineRulerSteps(sq(notes(8, 0.25)), null),
        eighths: tabTimelineRulerSteps(sq(notes(4, 0.5)), null),
        quarters: tabTimelineRulerSteps(sq(notes(4, 1)), null),
        triplets: tabTimelineRulerSteps(sq(notes(6, 0.5)), { isTab: true, tabNotes: notes(6, 0.5).map((n) => ({ ...n, triplet: true })) }),
        sixteenthTriplets: tabTimelineRulerSteps(sq(notes(12, 0.25)), { isTab: true, tabNotes: notes(12, 0.25).map((n) => ({ ...n, triplet: true })) }),
        thirtySeconds: tabTimelineRulerSteps(sq(notes(8, 0.125)), null),
        empty: tabTimelineRulerSteps(sq([]), null),
        pauses: tabTimelineRulerSteps(sq([{ start: 0, dur: 0.25, pause: true }, { start: 0.25, dur: 0.5, string: 0, fret: 1 }]), null),
      };
    })()
  `);
  assert.strictEqual(steps.sixteenths, 4, 'шестнадцатые — «1 та и та»');
  assert.strictEqual(steps.eighths, 2, 'восьмые — «1 и 2 и»');
  assert.strictEqual(steps.quarters, 1, 'четверти — «1 2 3 4»');
  assert.strictEqual(steps.triplets, 3, 'триоли — «1 та ти»');
  assert.strictEqual(steps.sixteenthTriplets, 1, 'шестнадцатые триоли — только номера долей');
  assert.strictEqual(steps.thirtySeconds, 1, 'тридцать вторые — только номера долей');
  assert.strictEqual(steps.empty, 1, 'пустая вставка не дробит счёт');
  assert.strictEqual(steps.pauses, 2, 'пауза не делает счёт мельче, чем звучащие ноты');
  ok('Дробление счёта: 16-е / 8-е / четверти / триоли / пустая вставка / паузы');
  w.close();
}

(async () => {
  await runGeometry();
  await runMarkup();
  await runLive();
  await runSteps();
  console.log('\nитого: ' + passed + ' групп OK');
})().catch((e) => {
  console.error('\nПРОВАЛ: ' + (e && e.message));
  if (e && e.stack) console.error(e.stack.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
});

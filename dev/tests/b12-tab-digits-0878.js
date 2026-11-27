#!/usr/bin/env node
'use strict';
// 0.878 · «Только цифры» живут ВНУТРИ ряда аккордов, на своём месте.
//
// Почему тест такой:
//   • jsdom не считает раскладку, поэтому главная проверка — ЧИСТАЯ
//     арифметика: tabDigitsLayout (стан под размер клетки) и
//     tabDigitsCellPlan (сколько места просить у ряда). Обе функции без DOM;
//   • решения «клетка на всю строку» больше нет: тест падает, если в модуле
//     появится gridColumn: '1 / -1' или data-tab-digits-row;
//   • fit проверяется на подставных clientWidth (jsdom отдаёт 0);
//   • живой рендер подтверждает: заголовка «TAB / 4 н. · 2 доли» в клетке
//     нет, сведения — в title/aria-label, у отдельного блока заголовок есть,
//     данные песни не поехали, Лента и окно редактора вставки на alphaTab.
//
// Запуск: node dev/tests/b12-tab-digits-0878.js

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cssBlock(selector) {
  const at = HTML.indexOf('\n' + selector);
  assert(at >= 0, 'CSS-правило найдено: ' + selector);
  const open = HTML.indexOf('{', at);
  const close = HTML.indexOf('}', open);
  return HTML.slice(open, close + 1);
}

// Модуль стана целиком — по нему проверяем, что запрещённых приёмов нет.
const MODULE = HTML.slice(
  HTML.indexOf('// ===== 0.878: «Только цифры»'),
  HTML.indexOf('function renderTabInsertHtml(')
);

// =====================================================================
// 1. Версия и статические инварианты
// =====================================================================
{
  assert(HTML.includes('ver 0.878'), 'STRUCHORD.html header is ver 0.878');
  assert(SW.includes("const CACHE_NAME = 'struchord-v878';"), 'sw.js CACHE_NAME is struchord-v878');
  assert(README.includes('`0.878`'), 'README header is 0.878');
  assert(ROADMAP.includes('**0.878**'), 'ROADMAP header is 0.878');
  assert(CHANGELOG.includes('## 0.878'), 'CHANGELOG has 0.878 entry');

  for (const fn of [
    'tabDigitsLayout', 'tabDigitsSvgMarkup', 'tabDigitsSpanText', 'tabDigitsFit', 'tabDigitsScheduleFit',
    'tabDigitsCellPlan', 'tabDigitsSpanWidth', 'tabDigitsTemplateColumns', 'tabDigitsGridColumns',
    'tabDigitsPaint', 'tabDigitsNeed', 'tabDigitsFontFor',
  ]) {
    assert(HTML.includes('function ' + fn + '('), 'функция ' + fn + ' есть');
  }

  // Главный запрет 0.878: клетка никогда не занимает строку целиком.
  assert(!MODULE.includes("'1 / -1'"), 'в модуле стана нет gridColumn «1 / -1»');
  assert(!MODULE.includes('tabDigitsRow'), 'пометки переноса data-tab-digits-row нет');
  assert(!MODULE.includes('tabDigitsMinWidth'), 'формулы «позиции × 24 + 32» больше нет');
  assert(!HTML.includes('data-tab-digits-w='), 'ширина стана больше не пишется в разметку');

  // Высота: ряд с таб-вставкой не выше ряда с аккордами.
  assert(!HTML.includes('minmax(7.75rem'), 'прежнее растяжение ряда (7.75rem) убрано');
  const digitsBody = cssBlock('.tab-insert-body--digits {');
  assert(!/height:\s*6rem/.test(digitsBody), 'у тела стана нет своей высоты 6rem');
  const cellBody = cssBlock('.tab-insert--cell .tab-insert-body--digits {');
  assert(/min-height:\s*0/.test(cellBody), 'в клетке у стана нет минимальной высоты');
  assert(/height:\s*auto/.test(cellBody), 'в клетке высоту задаёт ряд');
  const blockBody = cssBlock('.tab-insert:not(.tab-insert--cell) .tab-insert-body--digits {');
  assert(/height:\s*6rem/.test(blockBody), 'у отдельного блока высота стана прежняя (6rem)');

  // Стан заполняет клетку, а не висит по центру в натуральном размере.
  const svgCss = cssBlock('.tab-insert-body--digits .tab-digits-svg {');
  assert(/width:\s*100%/.test(svgCss) && /height:\s*100%/.test(svgCss), 'SVG растянут на всю клетку');
  assert(!/width:\s*auto/.test(svgCss), 'натуральной ширины у SVG больше нет');

  // Цифры: 13–14 px в обычном случае, минимум 11 px, начертание ≤ 600.
  assert(HTML.includes('const TAB_DIGITS_FONT_MIN = 11;'), 'минимум кегля 11 px задан константой');
  assert(HTML.includes('const TAB_DIGITS_FONT_MAX = 13.5;'), 'обычный кегль 13–14 px задан константой');
  assert(HTML.includes('const TAB_DIGITS_STEP_MIN = 18;'), 'уплотнённый шаг 18 px задан константой');
  const digitCss = cssBlock('.tab-digits-digit {');
  assert(/font-weight:\s*600/.test(digitCss), 'начертание цифр не жирнее 600');
  assert(!/font-size/.test(digitCss), 'кегль цифр задаёт раскладка, а не CSS');

  // Заголовок в клетке не рисуется, в отдельном блоке — рисуется.
  assert(HTML.includes("const heading = (useDigits && isCell)\n    ? ''"), 'в клетке заголовок «TAB / …» не печатается');
  assert(HTML.includes("`Таб занимает ${word} ${from}–${to}`"), 'подсказка клетки называет доли');
  assert(HTML.includes("+ ', ' + count + ' ' + noteWord"), 'в подсказке есть число нот');
  ok('Статические инварианты: версия 0.878, нет «1 / -1», высота ряда, SVG на всю клетку, кегль 11–13.5 px');
}

// =====================================================================
// Живой стенд
// =====================================================================
function makeDom() {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/?view=editor', virtualConsole: vc,
    beforeParse(w) {
      w.TextEncoder = TextEncoder;
      w.TextDecoder = TextDecoder;
      w.HTMLCanvasElement.prototype.getContext = () => new Proxy(
        { measureText: () => ({ width: 10 }), createLinearGradient: () => ({ addColorStop() {} }), getImageData: () => ({ data: [] }) },
        { get: (o, k) => (k in o ? o[k] : () => {}) },
      );
      w.URL.createObjectURL = () => 'blob:digits-test';
      w.URL.revokeObjectURL = () => {};
      w.HTMLAnchorElement.prototype.click = () => {};
      w.confirm = () => true;
      w.alert = () => {};
      // Кадры после закрытия окна не нужны: иначе отложенный скан полезет в
      // уже уничтоженный jsdom-документ.
      w.requestAnimationFrame = (cb) => setTimeout(() => { if (!w.__closed) cb(Date.now()); }, 8);
      const closeWindow = w.close.bind(w);
      w.close = () => { w.__closed = true; try { closeWindow(); } catch (_) {} };
      if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.FontFace = class { constructor() {} load() { return Promise.resolve(this); } };
      if (!w.document.fonts) w.document.fonts = { add() {}, check: () => true, ready: Promise.resolve(), forEach() {} };
    },
  });
  return { dom, w: dom.window, doc: dom.window.document, errors };
}

// Ноты строятся так же, как их пишет редактор: start/dur — в долях размера.
function sixteenths(count, span, dur) {
  const step = dur || span / count;
  return Array.from({ length: count }, (_, i) => ({
    start: Math.round(i * step * 1e9) / 1e9,
    dur: step,
    string: 1 + (i % 3),
    fret: i % 5,
  }));
}

function songOf() {
  return {
    schemaVersion: 9,
    metadata: { title: 'digits 0878', artist: 'STRUCHORD' },
    bpm: 120, globalTimeSig: '4/4', globalKey: 'C', keyMode: 'manual', tuning: 'e-std', tuningNotes: null, parts: [],
    sections: [{
      id: 101, type: 'Verse', repeat: 1, squares: [
        // Em / таб-вставка на 2 доли (8 шестнадцатых) / C / G — случай владельца.
        {
          id: 102, type: 'chords', repeat: 1, customBeats: null, events: [
            { root: 'Em', span: 2, quality: 'min' },
            { span: 2, isTab: true, tabNotes: sixteenths(8, 2) },
            { root: 'C', span: 2 },
            { root: 'G', span: 2 },
          ],
        },
        { id: 103, type: 'tab', beats: 4, customBeats: null, repeat: 1, events: [], notes: sixteenths(16, 4) },
        { id: 104, type: 'tab', beats: 4, customBeats: null, repeat: 1, events: [], notes: sixteenths(8, 4, 0.5) },
        { id: 105, type: 'tab', beats: 8, customBeats: null, repeat: 1, events: [], notes: sixteenths(8, 8, 1) },
      ],
    }],
  };
}

async function boot() {
  const ctx = makeDom();
  const { w } = ctx;
  await sleep(300);
  w.localStorage.setItem('struchord_songs', JSON.stringify([songOf()]));
  w.loadSong(0);
  await sleep(450);
  return ctx;
}

async function main() {
  // -------------------------------------------------------------------
  // 2. Стан живёт в размере клетки: шаг ≥ 18 px, кегль 11–13.5 px
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    const { w } = ctx;
    // Клетка обычного ряда аккордов: ряд 4.5rem (72 px), поля карточки 3 px
    // и рамки нет → тело стана 64 px.
    const cellHeights = [64];
    cellHeights.forEach((height) => {
      const L = w.tabDigitsLayout(sixteenths(4, 2), 2, '4/4', { strings: 6 }, { width: 194, height, layout: 'cell' });
      assert(L.font >= 11 && L.font <= 13.5, 'кегль в клетке из диапазона 11–13.5 px: ' + L.font.toFixed(2));
      assert(L.step >= 18, 'шаг между позициями не меньше 18 px: ' + L.step.toFixed(1));
      assert.strictEqual(L.layout, 'cell', 'раскладка помечена как клеточная');
    });
    // Отдельный блок (6rem = 96 px) — обычный случай 13–14 px.
    const block = w.tabDigitsLayout(sixteenths(16, 4), 4, '4/4', { strings: 6 }, { width: 396, height: 96, layout: 'block' });
    assert(block.font >= 13 && block.font <= 14, 'в блоке кегль 13–14 px: ' + block.font.toFixed(2));
    // Стан заполняет клетку по ширине: первая и последняя позиции внутри полей.
    const wide = w.tabDigitsLayout(sixteenths(4, 2), 2, '4/4', { strings: 6 }, { width: 462, height: 64, layout: 'cell' });
    const xs = wide.positions.map((p) => p.x);
    assert(xs[0] > wide.padX && xs[xs.length - 1] < wide.width - wide.padX, 'позиции внутри полей стана');
    assert(Math.abs((xs[0] - wide.padX) - (wide.width - wide.padX - xs[xs.length - 1])) < 0.51,
      'стан заполняет ширину симметрично, без пустого центра');
    // Высота масштабирует линии, а не «зависает»: 64 → 96 px.
    const small = w.tabDigitsLayout(sixteenths(8, 2), 2, '4/4', { strings: 6 }, { width: 232, height: 64, layout: 'cell' });
    const tall = w.tabDigitsLayout(sixteenths(8, 2), 2, '4/4', { strings: 6 }, { width: 232, height: 96, layout: 'cell' });
    assert(tall.lineGap > small.lineGap * 1.3, 'расстояние между линиями растёт от высоты клетки');
    assert(tall.font > small.font, 'кегль растёт вместе с высотой');
    assert(tall.stemBottom > small.stemBottom, 'чёрточки ритма едут вместе со станом');
    assert(tall.beatLabelY > small.beatLabelY, 'номера долей едут вместе со станом');
    // Всё, что нарисовано, влезает в клетку по вертикали.
    [small, tall, block].forEach((L, i) => {
      assert(L.staffTop >= L.font * 0.5, 'сверху есть запас под цифру первой струны (' + i + ')');
      assert(L.beatLabelY + L.labelFont * 0.4 <= L.height, 'номера долей влезают в клетку (' + i + ')');
      const lastLine = L.staffTop + (L.strings - 1) * L.lineGap;
      assert(lastLine < L.height, 'последняя линия струны внутри клетки (' + i + ')');
    });
    // Цифры не налезают по горизонтали: подложка уже шага.
    const tight = w.tabDigitsLayout(sixteenths(16, 4), 4, '4/4', { strings: 6 }, { width: 300, height: 64, layout: 'cell' });
    assert(tight.step >= 18, 'даже 16 шестнадцатых в 300 px держат шаг 18 px: ' + tight.step.toFixed(1));
    tight.positions.forEach((p, i) => {
      if (i === 0) return;
      const left = tight.positions[i - 1].x + tight.haloW / 2;
      const right = p.x - tight.haloW / 2;
      assert(right - left >= -0.01, 'подложки цифр ' + i + ' не пересекаются');
    });
    ok('Стан в размере клетки: шаг ≥ 18 px, кегль 11–13.5 px (в блоке 13.5), линии и номера от высоты');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 3. Сколько места клетка просит у ряда (чистая арифметика)
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    const { w } = ctx;
    const need4 = w.tabDigitsNeed(4, 'cell');
    const need8 = w.tabDigitsNeed(8, 'cell');
    const need16 = w.tabDigitsNeed(16, 'cell');
    assert.strictEqual(need4.min, 12 + 4 * 18, 'минимум для 4 позиций = поля + 4 × 18 px');
    assert.strictEqual(need4.pref, 12 + 4 * 24, 'комфорт для 4 позиций = поля + 4 × 24 px');
    assert.strictEqual(need16.min, 300, '16 позиций: минимум 300 px');
    assert.strictEqual(w.tabDigitsNeed(8, 'block').min, 38 + 8 * 18, 'у блока поля больше');

    // Своя доля уже 18 px на позицию → клетка просит ширину в пикселях.
    const tight = w.tabDigitsCellPlan({ innerWidth: 936, total: 8, span: 2, gap: 2, needMin: need16.min, needPref: need16.pref });
    assert.strictEqual(tight.mode, 'wide', '16 шестнадцатых в 232 px — нужна своя ширина');
    assert(tight.request >= need16.min, 'просим не меньше минимума: ' + tight.request);
    assert(tight.request <= tight.cap, 'и не больше, чем ряд может отдать');
    const rest = 6 * 20;
    assert(tight.request <= 936 - rest - 14 + 0.01, 'аккордам рядом остаётся по 20 px на колонку');
    assert(tight.request < 936, 'клетка не занимает ряд целиком');

    // Места хватает — сетка не меняется.
    const fine = w.tabDigitsCellPlan({ innerWidth: 936, total: 8, span: 2, gap: 2, needMin: need4.min, needPref: need4.pref });
    assert.strictEqual(fine.mode, 'grid', '4 ноты в 232 px — обычная сетка');
    assert.strictEqual(fine.colPx, 0, 'пиксельных колонок не просим');
    const eights = w.tabDigitsCellPlan({ innerWidth: 936, total: 8, span: 2, gap: 2, needMin: need8.min, needPref: need8.pref });
    assert.strictEqual(eights.mode, 'grid', '8 нот в 232 px — обычная сетка');

    // Узкий экран: больше, чем ряд может отдать, не просим.
    const narrow = w.tabDigitsCellPlan({ innerWidth: 330, total: 8, span: 2, gap: 2, needMin: need16.min, needPref: need16.pref });
    assert.strictEqual(narrow.mode, 'wide', 'на 330 px стан просит ширину в пикселях');
    assert(narrow.request < 330, 'и не пытается занять весь ряд: ' + narrow.request);

    // Шаблон сетки: число колонок не меняется, ни одна клетка не «1 / -1».
    const tpl = w.tabDigitsTemplateColumns([
      { span: 2, colPx: 0 }, { span: 2, colPx: 197 }, { span: 2, colPx: 0 }, { span: 2, colPx: 0 },
    ]);
    assert.strictEqual(w.tabDigitsGridColumns(tpl), 8, 'колонок в шаблоне столько же, сколько долей');
    assert(!tpl.includes('1 / -1'), 'в шаблоне нет «на всю строку»');
    assert(tpl.includes('197px') && tpl.split('minmax(0, 1fr)').length - 1 === 3, 'расширены только колонки клетки');
    ok('План ширины: своя доля или пиксельные колонки той же клетки, число колонок не меняется');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 4. Раскладка ряда: клетка остаётся на месте (подставные clientWidth)
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    const { w, doc } = ctx;
    const mount = ({ total = 8, width = 936, positions = 16 }) => {
      const host = doc.createElement('div');
      host.className = 'square-inner';
      host.style.gridTemplateColumns = `repeat(${total}, minmax(0, 1fr))`;
      const card = (span, n) => `<div class="chord-wrapper${n ? ' chord-wrapper--tab' : ''}" style="grid-column:span ${span};" data-tab-span="${span}">` +
        (n
          ? `<div class="tab-insert tab-insert--cell tab-insert--digits" data-tab-positions="${n}"><div class="tab-insert-body tab-insert-body--digits"></div></div>`
          : `<div class="chord-content"><span class="chord">C</span></div>`) +
        '</div>';
      host.innerHTML = card(2, 0) + card(2, positions) + card(2, 0) + card(2, 0);
      doc.body.appendChild(host);
      Object.defineProperty(host, 'clientWidth', { get: () => width, configurable: true });
      return host;
    };
    // Просторный ряд: обычная fr-сетка, клетка на своём месте.
    {
      const host = mount({ width: 936, positions: 8 });
      w.tabDigitsFit(doc);
      const wrap = host.querySelector('.chord-wrapper--tab');
      assert.strictEqual(wrap.style.gridColumn, 'span 2', 'ширины хватает — клетка осталась в своей доле');
      assert(!/px/.test(host.style.gridTemplateColumns), 'сетка осталась в fr');
      assert.strictEqual(w.tabDigitsGridColumns(host.style.gridTemplateColumns), 8, 'восемь колонок на месте');
      // 16 шестнадцатых — клетка просит ширину, но строку не занимает.
      host.remove();
      const dense = mount({ width: 936, positions: 16 });
      w.tabDigitsFit(doc);
      const denseWrap = dense.querySelector('.chord-wrapper--tab');
      assert.strictEqual(denseWrap.style.gridColumn, 'span 2', 'клетка не расширяется по колонкам — её доля прежняя');
      assert(/px/.test(dense.style.gridTemplateColumns), 'колонки самой клетки получили ширину в пикселях');
      assert.strictEqual(w.tabDigitsGridColumns(dense.style.gridTemplateColumns), 8, 'колонок по-прежнему восемь');
      assert(!dense.style.gridTemplateColumns.includes('1 / -1'), 'на всю строку не уезжает');
      // Соседи остались в ряду: у всех клеток есть колонки.
      const spans = [...dense.children].map((el) => /span\s+(\d+)/.exec(el.style.gridColumn)?.[1]);
      assert.deepStrictEqual(spans, ['2', '2', '2', '2'], 'порядок и доли соседей не менялись');
      // Окно выросло — пиксельные колонки снимаются, сетка снова ровная.
      const wider = mount({ width: 1600, positions: 16 });
      w.tabDigitsFit(doc);
      assert(!/px/.test(wider.style.gridTemplateColumns), 'на широком окне стан влезает в долю — сетка снова fr');
      // И снова узко — вернулись к пикселям (решение пересчитывается).
      Object.defineProperty(wider, 'clientWidth', { get: () => 700, configurable: true });
      w.tabDigitsFit(doc);
      assert(/px/.test(wider.style.gridTemplateColumns), 'окно сузилось — ширина клетки вернулась');
      dense.remove();
      wider.remove();
    }
    // Клетка никогда не занимает строку целиком даже в узком ряду из двух колонок.
    {
      const host = doc.createElement('div');
      host.className = 'square-inner';
      host.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
      host.innerHTML = '<div class="chord-wrapper chord-wrapper--tab" style="grid-column:span 2;" data-tab-span="2">' +
        '<div class="tab-insert tab-insert--cell tab-insert--digits" data-tab-positions="16">' +
        '<div class="tab-insert-body tab-insert-body--digits"></div></div></div>';
      doc.body.appendChild(host);
      Object.defineProperty(host, 'clientWidth', { get: () => 400, configurable: true });
      w.tabDigitsFit(doc);
      const wrap = host.querySelector('.chord-wrapper--tab');
      assert.notStrictEqual(wrap.style.gridColumn, '1 / -1', '«1 / -1» не появляется никогда');
      assert.strictEqual(w.tabDigitsGridColumns(host.style.gridTemplateColumns), 2, 'колонки не добавились');
      host.remove();
    }
    // Ноль ширины (jsdom, скрытая вкладка) — раскладку не трогаем.
    {
      const host = mount({ width: 0, positions: 16 });
      const before = host.style.gridTemplateColumns;
      w.tabDigitsFit(doc);
      assert.strictEqual(host.style.gridTemplateColumns, before, 'без замера сетку не переписываем');
      host.remove();
    }
    // Отдельная строка таба: квадрат растягивается до нужной ширины (как в 0.877).
    {
      const host = doc.createElement('div');
      host.className = 'square square--tab';
      host.innerHTML = '<div class="square-inner" style="width:20%;">' +
        '<div class="tab-insert tab-insert--digits" data-tab-positions="16"><div class="tab-insert-body tab-insert-body--digits"></div></div></div>';
      doc.body.appendChild(host);
      Object.defineProperty(host, 'clientWidth', { get: () => 1000, configurable: true });
      const inner = host.querySelector('.square-inner');
      w.tabDigitsFit(doc);
      assert.strictEqual(inner.style.minWidth, String(w.tabDigitsNeed(16, 'block').min) + 'px', '200 px мало — квадрат растянут до минимума стана');
      inner.style.width = '100%';
      w.tabDigitsFit(doc);
      assert.strictEqual(inner.style.minWidth, '', 'места хватает — растяжение снято');
      host.remove();
    }
    // Отрисовка под замеренный прямоугольник: SVG ровно размером тела, кегль ≥ 11 px.
    {
      const spec = w.tabThumbSpecFrom(sixteenths(16, 4), 4, '4/4', w.tabInsertDomainFrom({}));
      const host = doc.createElement('div');
      host.className = 'chord-wrapper chord-wrapper--tab';
      host.innerHTML = '<div class="tab-insert tab-insert--cell tab-insert--digits" data-tab-positions="16" data-tab-layout="cell">' +
        '<div class="tab-insert-body tab-insert-body--digits" data-tab-thumb="' + encodeURIComponent(JSON.stringify(spec)) + '"></div></div>';
      doc.body.appendChild(host);
      const body = host.querySelector('.tab-insert-body--digits');
      Object.defineProperty(body, 'clientWidth', { get: () => 456, configurable: true });
      Object.defineProperty(body, 'clientHeight', { get: () => 64, configurable: true });
      w.tabDigitsPaint(doc);
      const svg = body.querySelector('svg.tab-digits-svg');
      assert(svg, 'стан нарисован после замера');
      assert.strictEqual(svg.getAttribute('viewBox'), '0 0 456 64', 'viewBox совпадает с телом клетки');
      const first = body.querySelector('.tab-digits-digit');
      const fontPx = parseFloat(first.getAttribute('font-size'));
      assert(fontPx >= 11 && fontPx <= 13.5, 'кегль цифры в нарисованном стане 11–13.5 px: ' + fontPx);
      assert.strictEqual(fontPx, 11, 'в клетке 64 px кегль упирается в нижнюю границу 11 px');
      // Стан нарисован только один раз: повторный вызов с тем же размером ничего не меняет.
      const before = body.innerHTML;
      w.tabDigitsPaint(doc);
      assert.strictEqual(body.innerHTML, before, 'повторный вызов с тем же размером не перерисовывает');
      // Клетка выросла — стан перерисовывается под новый прямоугольник.
      Object.defineProperty(body, 'clientHeight', { get: () => 88, configurable: true });
      w.tabDigitsPaint(doc);
      const grown = body.querySelector('svg.tab-digits-svg');
      assert.strictEqual(grown.getAttribute('viewBox'), '0 0 456 88', 'новый размер — новый viewBox');
      const grownFont = parseFloat(body.querySelector('.tab-digits-digit').getAttribute('font-size'));
      assert(grownFont > 11, 'в высокой клетке кегль растёт: ' + grownFont);
      host.remove();
    }
    ok('Раскладка: клетка на месте, колонки только её, «1 / -1» нет, возврат к fr, отдельный блок как раньше');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 5. Живой рендер: без заголовка в клетке, всё в подсказке
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    const { w, doc } = ctx;
    const digits = Array.from(doc.querySelectorAll('.tab-insert--digits'));
    assert.strictEqual(digits.length, 4, 'все четыре вставки в песне — «Только цифры»');
    digits.forEach((card) => {
      assert(card.querySelector('svg.tab-digits-svg'), 'у карточки свой стан');
      assert(card.getAttribute('aria-label'), 'у карточки есть aria-label');
      assert(card.dataset.tabPositions, 'карточка помнит число позиций');
      const selected = card.dataset.tabPositions + ' ' + (card.getAttribute('title') || '');
      assert(/Таб занимает/.test(selected), 'подсказка говорит, какие доли заняты');
    });
    const cell = doc.querySelector('.chord-wrapper--tab .tab-insert--digits');
    assert(cell, 'ячейка между аккордами нарисована цифрами');
    assert(!cell.querySelector('.tab-insert-heading'), 'в клетке нет строки «TAB / 4 н. · 2 доли»');
    assert(!cell.querySelector('.tab-insert-label'), 'в клетке нет метки TAB');
    const aria = cell.getAttribute('aria-label');
    assert.strictEqual(aria, 'Таб занимает доли 3–4, 8 нот', 'подсказка клетки: «Таб занимает доли 3–4, 8 нот»');
    assert.strictEqual(cell.getAttribute('title'), aria, 'title и aria-label совпадают');
    assert.strictEqual(cell.querySelectorAll('.tab-digits-digit').length, 8, 'восемь цифр в ячейке');
    assert.strictEqual(Array.from(cell.querySelectorAll('.tab-digits-beat')).map((t) => t.textContent).join(''), '34',
      'крупные номера долей «3» и «4»');
    assert.strictEqual(cell.dataset.tabLayout, 'cell', 'карточка знает, что она в клетке');
    const wrap = cell.closest('.chord-wrapper--tab');
    assert(wrap.style.gridColumn !== '1 / -1', 'клетка не на всю строку');
    // Отдельный блок «в начале секции» — заголовок на месте.
    const blocks = Array.from(doc.querySelectorAll('.tab-insert--digits:not(.tab-insert--cell)'));
    assert.strictEqual(blocks.length, 3, 'три отдельные строки таба');
    blocks.forEach((b) => {
      assert(b.querySelector('.tab-insert-heading'), 'у отдельного блока заголовок остался');
      assert(b.querySelector('.tab-insert-count'), 'у отдельного блока есть подпись «N н. · …»');
      assert.strictEqual(b.dataset.tabLayout, 'block', 'блок помечен как block');
    });
    // Подписи долей у аккордов не тронуты.
    const labels = Array.from(doc.querySelectorAll('.chord-wrapper:not(.chord-wrapper--tab) .chord-count')).map((e) => e.textContent);
    assert(labels.includes('3') && labels.includes('4'), 'номера долей «3 4» под аккордами остались');
    assert.strictEqual(ctx.errors.length, 0, 'страница без ошибок: ' + ctx.errors.slice(0, 2).join(' | '));
    assert.strictEqual(w.eval('TAB_THUMB_PENDING.size'), 0, 'alphaTab не рисует карточки «Только цифры»');
    ok('Живой рендер: в клетке нет заголовка, сведения в title/aria-label, у блока заголовок на месте');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 6. Данные, Лента и окно редактора вставки не изменились
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    const { w, doc } = ctx;
    const body = doc.querySelector('.tab-insert--digits [data-tab-thumb]');
    const spec = JSON.parse(decodeURIComponent(body.dataset.tabThumb));
    assert(Array.isArray(spec.n) && typeof spec.b === 'number' && typeof spec.t === 'string', 'спека нот прежняя (n/b/t/u/th)');
    assert(!('digits' in spec) && !('digitsWidth' in spec), 'новых полей в данных нет');
    const before = JSON.stringify(w.eval('sections'));
    w.render();
    await sleep(250);
    assert.strictEqual(JSON.stringify(w.eval('sections')), before, 'рендер не изменил данные песни');
    const cellEv = JSON.parse(before)[0].squares[0].events[1];
    assert.strictEqual(cellEv.isTab, true, 'ячейка осталась таб-вставкой');
    assert.strictEqual(cellEv.tabNotes.length, 8, 'восемь нот на месте');
    // Лента и редактор вставки — по-прежнему alphaTab.
    assert(HTML.includes("renderTabInsertHtml(sec, sq, parentTs, true, { inTimeline: true })"), 'Лента просит alphaTab');
    assert(HTML.includes("renderTabInsertHtml(sec, editor.draft, ts, false, { engine: 'alphatab' })"), 'окно редактора на alphaTab');
    w.openTabInsertEditor(101, 103);
    await sleep(400);
    const preview = doc.querySelector('.tab-editor-preview .tab-insert');
    assert(preview, 'превью в окне редактора есть');
    assert(!preview.classList.contains('tab-insert--digits'), 'окно редактора вставки не перешло на цифры');
    assert(preview.querySelector('.tab-insert-heading'), 'в окне редактора заголовок на месте');
    assert.strictEqual(ctx.errors.length, 0, 'окно редактора открылось без ошибок');
    ok('Данные: формат нот прежний, сохранение не менялось, окно редактора вставки на alphaTab');
    ctx.dom.window.close();
  }

  console.log(`\n0.878 «Только цифры в ряду аккордов»: ${passed} групп OK`);
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});

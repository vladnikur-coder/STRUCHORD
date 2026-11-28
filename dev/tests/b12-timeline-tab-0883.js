#!/usr/bin/env node
'use strict';
// 0.883 · таб-вставка в ЛЕНТЕ: цифра стоит центром на своём моменте, как
// подпись общей линейки; ось времени — полная ширина клетки.
//
// Замеры владельца (Chromium, Oasis, 2 доли × 4 шестнадцатых):
//   • центры подписей `.tl-count` от левого края клетки: 0 / 24.1 / 48.3 / 72.4;
//   • центры цифр: 15.8 / 38.3 / 61.0 / 83.7 — шаг 22.6 вместо 24.1;
//   • при «+» (клетка 376 px): 16.5 / 61.8 / 107.2 / 152.7 вместо ≈ 0/47/94/141.
//
// Причины: (а) карточка крайней клетки имела поле 0.5rem, поэтому стан
// считался по 182 px вместо 193 и весь съезжал на 10 px; (б) цифра была
// прижата ЛЕВЫМ краем к моменту, а подпись центрирована; (в) подложка
// скруглялась на 1.5 px.
//
// Что держит прогон:
//   • viewBox стана = размер КЛЕТКИ (ось времени ничего не сжимает), стан
//     кладётся на клетку абсолютно — масштаб ровно 1;
//   • центр цифры = x своего момента = центр подписи `.tl-count` (±1 px)
//     при ширинах клетки 96 / 192 / 376 px;
//   • первую и последнюю цифры не сдвигают и не обрезают: у края клетки
//     цифра выступает на половину ширины, `overflow: visible`;
//   • подложка скруглена: rx ≈ 30 % высоты, но не меньше 4 px;
//   • вид 0.882 сохранён: Arial 400, кегль 0.20 высоты, шаг струн 16.4 px,
//     высота клетки как у аккордовой, длительности скрыты;
//   • сетка редактора (.tab-insert--digits) не тронута.
//
// Запуск: node dev/tests/b12-timeline-tab-0883.js

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

function cssRules(selector) {
  const out = [];
  let from = 0;
  for (;;) {
    const i = HTML.indexOf('\n' + selector + ' {', from);
    if (i < 0) break;
    const j = HTML.indexOf('}', i);
    out.push(HTML.slice(i, j + 1));
    from = j + 1;
  }
  assert(out.length, `CSS-правило не найдено: ${selector}`);
  return out;
}
function cssRule(selector) {
  return cssRules(selector)[0];
}

// =====================================================================
// 1. Статические инварианты 0.883
// =====================================================================
{
  assert(HTML.includes('ver 0.883'), 'STRUCHORD.html header is ver 0.883');
  assert(SW.includes("const CACHE_NAME = 'struchord-v883';"), 'sw.js CACHE_NAME is struchord-v883');
  assert(README.includes('`0.883`'), 'README header is 0.883');
  assert(ROADMAP.includes('**0.883**'), 'ROADMAP header is 0.883');
  assert(CHANGELOG.includes('## 0.883'), 'CHANGELOG has 0.883 entry');

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
  // 0.883: цифра центрируется на своём моменте, левой привязки больше нет.
  assert(!digitsRegion.includes('atStart'), 'левой привязки цифры в стане больше нет');
  assert(HTML.includes('    anchor: \'middle\','), 'и сетка, и Лента центрируют цифру на своём x');
  assert(HTML.includes('const hx = p.x - hw / 2;'), 'подложка центрируется на моменте');
  assert(HTML.includes('rx="${tabDigitsNum(L.haloRx)}"'), 'радиус скругления подложки приходит из раскладки');
  assert(HTML.includes('const haloRx = isLenta'), 'радиус считается для Ленты');
  assert(/\? Math\.max\(4, Math\.min\(haloH \/ 2, haloH \* 0\.3\)\)/.test(HTML),
    'радиус подложки = 30 % высоты, но не меньше 4 px и не больше половины высоты');
  assert(!/let dx = 0;/.test(HTML), 'сдвига цифры у правого края больше нет');
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
  assert(/overflow:\s*visible/.test(cardRule), 'стан не обрезается: цифра выступает за край клетки');
  assert(/--tab-digit-halo:\s*var\(--tl-cell-bg/.test(cardRule),
    'подложка под цифрой того же цвета, что клетка');
  // 0.883: полей у крайних клеток больше нет — иначе стан съезжает с линейки.
  assert(!/tab-insert--lenta \{\n  padding-left: 0\.5rem/.test(HTML) &&
    !/tab-insert--lenta \{\n  padding-right: 0\.5rem/.test(HTML),
    'у крайних клеток песни полей нет — стан стоит ровно по ширине клетки');
  // Каскад: `.tl-cell` ниже по файлу тоже задаёт `overflow: hidden` (нужно
  // фону и метке), поэтому правило таб-клетки обязано быть специфичнее —
  // два класса. Одиночный `.tl-cell--tab` проиграл бы и вернул обрезку.
  assert(cssRules('.tl-cell.tl-cell--tab').some((r) => /overflow:\s*visible/.test(r)),
    'таб-клетка не обрезает выступающую цифру — и правило специфичнее `.tl-cell`');
  assert(cssRules('.tl-cell.tl-cell--tab').some((r) => /height:\s*var\(--tl-cell-height/.test(r)),
    'высота таб-клетки по-прежнему из общей переменной');
  assert(/overflow:\s*hidden/.test(cssRule('.tl-cell')),
    'у обычной клетки Ленты обрезка осталась — там ей обрезать нечего');
  // Вложенный селектор обязателен: `.tl-cell--tab .tab-insert` ставит
  // карточке `overflow: hidden` выше по файлу.
  assert(/overflow:\s*visible/.test(cssRule('.tl-cell--tab .tab-insert--lenta')),
    'карточка Ленты в таб-клетке тоже не обрезает стан');
  // И сам корень SVG: UA-стиль обрезает содержимое по окну стана, а половинка
  // крайней цифры лежит за ним.
  assert(/overflow:\s*visible/.test(cssRule('.tab-insert--lenta .tab-digits-svg')),
    'окно стана Ленты не обрезает выступающую цифру');

  // Д. Сетка редактора (0.877–0.879) не тронута.
  assert(HTML.includes('function tabDigitsLayout('), 'раскладка «только цифры» на месте');
  assert(HTML.includes('function tabDigitsSvgMarkup('), 'рисование «только цифры» на месте');
  assert(HTML.includes('.tab-insert--digits {'), 'стили цифровой карточки на месте');
  assert(/const padX = isLenta \? 0 : \(isCell \? TAB_DIGITS_CELL_PAD_X/.test(HTML),
    'поля сетки редактора прежние — режим lenta их не меняет');
  assert(HTML.includes('const firstX = padX + (boxW - stripW) / 2 + step / 2;'),
    'центрированная сетка редактора не изменилась');

  // Е. 0.882: вид 0.880 — крупные цифры Arial только в Ленте.
  const lentaDigitRule = cssRule('.tab-insert--lenta .tab-digits-digit');
  assert(/font-family:\s*Arial/.test(lentaDigitRule), 'цифры Ленты — Arial/sans-serif');
  assert(/font-weight:\s*400/.test(lentaDigitRule), 'начертание цифр Ленты — 400, как в 0.880');
  const gridDigitRule = cssRule('.tab-digits-digit');
  assert(/font-family:\s*ui-monospace/.test(gridDigitRule) && /font-weight:\s*600/.test(gridDigitRule),
    'сетка редактора осталась на моноширинном полужирном');
  assert(!/Arial/.test(gridDigitRule), 'Arial в сетку не протёк');
  assert(/TAB_DIGITS_LENTA_FONT_RATIO = 0\.20/.test(HTML), 'кегль цифр Ленты — 0.20 высоты клетки');
  assert(/TAB_DIGITS_LENTA_FONT_MIN = 12/.test(HTML), 'минимальный кегль цифр Ленты — 12 px');
  assert(/TAB_DIGITS_LENTA_INK = 0\.72/.test(HTML), 'высота чернил цифры — 0.72 кегля');
  assert(/TAB_DIGITS_LENTA_ADVANCE = 0\.56/.test(HTML), 'ширина цифры Arial — 0.56 кегля');
  assert(/TAB_DIGITS_LENTA_READ_MIN = 11/.test(HTML), 'читаемая граница на мелком масштабе — 11 px');
  assert(HTML.includes('const byHeight = clampNumberValue(height * TAB_DIGITS_LENTA_FONT_RATIO'),
    'кегль Ленты считается от высоты клетки');
  assert(HTML.includes('lineGap = Math.max(3, (height - 2 * (halfInk + TAB_DIGITS_LENTA_AIR)) / span);'),
    'шаг линий считается от высоты чернил цифры');
  ok('Статика 0.883: цифра по центру, полей у крайних клеток нет, подложка скруглена, Arial и сетка целы');
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
      // 0.883: стан считается по размеру КЛЕТКИ, а не тела карточки, поэтому
      // клетке нужен настоящий прямоугольник.
      win.Element.prototype.getBoundingClientRect = function () {
        const w0 = parseFloat(this.style && this.style.width) || 0;
        const isCell = this.classList && this.classList.contains('tl-cell');
        // Клетки стоят в ряд: левый край = сумма ширин предыдущих клеток.
        // Без этого все клетки «в одной точке» и подписи соседей налезают
        // на область вставки — в браузере такого нет.
        let left = 0;
        if (isCell && this.parentElement) {
          for (const sib of [...this.parentElement.children]) {
            if (sib === this) break;
            if (sib.classList && sib.classList.contains('tl-cell')) left += parseFloat(sib.style && sib.style.width) || 0;
          }
        }
        const width = isCell ? w0 : 0;
        const height = isCell ? 98 : 0;
        return { x: left, y: 0, left, top: 0, right: left + width, bottom: height, width, height };
      };
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
      // Низкая клетка телефона (78 px) — кегль подстраивается, цифры целы.
      const low = tabDigitsLayout(notes, 2, '4/4', domain, { layout: 'lenta', width: 150, height: 78 });
      // Аккорд: пять нот на одной доле, цифры на соседних струнах.
      const chord = tabDigitsLayout([
        { start: 0, dur: 0.5, string: 0, fret: 3 },
        { start: 0, dur: 0.5, string: 1, fret: 1 },
        { start: 0, dur: 0.5, string: 2, fret: 0 },
        { start: 0, dur: 0.5, string: 3, fret: 2 },
        { start: 0, dur: 0.5, string: 4, fret: 3 },
        { start: 1, dur: 0.5, string: 0, fret: 12 },
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
        narrowTwo: strip(narrowTwo), pauses: strip(pauses), low: strip(low), chord: strip(chord), cell: strip(cell) };
    })()
  `);

  // --- А/Б. x по времени, левый край цифры ---
  assert.strictEqual(geo.lenta.layout, 'lenta', 'раскладка вернула режим lenta');
  assert.strictEqual(geo.lenta.anchor, 'middle', 'цифра центрирована на своём моменте');
  assert.strictEqual(geo.lenta.labels, 0, 'подписей счёта внутри стана Ленты нет — их рисует общая линейка');
  assert.deepStrictEqual(Array.from(geo.lenta.x).map(r3), [0, 24, 48, 72, 96, 120, 144, 168],
    'x = время × ширина клетки: 8 шестнадцатых на 2 доли в 192 px — шаг 24 px');

  // --- В. Кегль и шаг струн: вид 0.880 ---
  const font = geo.lenta.font;
  const INK = 0.72;   // высота чернил цифры Arial в долях кегля
  assert(font >= 19, `кегль цифры в Ленте ≥ 19 px (получено ${r3(font)})`);
  assert(Math.abs(font - 0.2 * 98) < 0.05, `кегль = 0.20 высоты клетки (${r3(font)} при 98 px)`);
  assert(Math.abs(geo.lenta.lineGap - 16.38) < 0.05,
    `шаг струн ≈ 17 px (получено ${r3(geo.lenta.lineGap)})`);
  assert(geo.lenta.lineGap < 19 && geo.lenta.lineGap > 16,
    'шаг струн близок к 0.880 (19 px), но с запасом на целые цифры');
  // Верхняя и нижняя цифры целиком внутри клетки: считаем по ЧЕРНИЛАМ.
  const inkHalf = (font * INK) / 2;
  const inkTop = geo.lenta.staffTop - inkHalf;
  const inkBottom = geo.lenta.staffBottom + inkHalf;
  assert(inkTop >= 0.5, `верхняя цифра не срезана (чернила от ${r3(inkTop)} px)`);
  assert(inkBottom <= 97.5, `нижняя цифра не срезана (чернила до ${r3(inkBottom)} px)`);
  assert(Math.abs(inkTop - 1) < 0.05 && Math.abs(98 - inkBottom - 1) < 0.05,
    'поля сверху и снизу = половина высоты цифры + 1 px воздуха');
  assert.strictEqual(geo.lenta.strings, 6, 'у гитары шесть линий');
  assert(geo.lenta.lineW >= 1, `линия струны не тоньше 1 px (${geo.lenta.lineW})`);
  // Цифра не налезает на соседнюю линию: чернила меньше шага.
  assert(font * INK < geo.lenta.lineGap, 'цифра ниже промежутка между линиями — линии не перекрываются');

  // 4 струны: линии расходятся шире, цифры целы.
  assert.strictEqual(geo.uke.strings, 4, 'у укулеле четыре линии');
  assert(geo.uke.staffTop - (geo.uke.font * INK) / 2 >= 0.5, 'укулеле: верхняя цифра цела');
  assert(geo.uke.staffBottom + (geo.uke.font * INK) / 2 <= 97.5, 'укулеле: нижняя цифра цела');

  // Низкая клетка телефона: кегль подстраивается, но цифры по-прежнему целы.
  assert(geo.low.font > 12 && geo.low.font < font, `в клетке 78 px кегль меньше (${r3(geo.low.font)})`);
  assert(geo.low.staffTop - (geo.low.font * INK) / 2 >= 0.5 && geo.low.staffBottom + (geo.low.font * INK) / 2 <= 77.5,
    'в клетке 78 px цифры целиком внутри');

  // Аккорд: цифры на соседних струнах не налезают (чернила ≤ шаг), кегль полный.
  const chordSizes = Array.from(geo.chord.sizes).flat();
  assert(chordSizes.every((sz) => Math.abs(sz - font) < 0.05),
    'в аккорде кегль не поджимается — цифры того же размера');
  assert(font * INK <= geo.chord.lineGap, 'в аккорде чернила цифр не налезают на соседнюю струну');

  // --- Е. Плотные случаи ---
  const dense = geo.dense;
  assert(Math.abs(dense.room[1] - 24) < 1e-6, 'у 16-х в 192 px шаг 24 px');
  const sizesFlat = Array.from(dense.sizes).flat();
  assert(sizesFlat.every((sz) => sz >= 19), 'в плотном случае кегль остаётся полным (≥ 19 px)');
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
  assert(Array.from(geo.narrow.sizes).flat().every((sz) => sz <= font + 1e-6),
    'при «−» цифры не крупнее стана');
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
    '      кегль Ленты: ' + r3(font) + ' px (0.20 × 98), шаг струн ' + r3(geo.lenta.lineGap) +
    ' px, линия ' + geo.lenta.lineW + ' px, чернила ' + r3(inkTop) + '…' + r3(inkBottom) + ' px',
  );
  ok('Геометрия Ленты: кегль 19.6 px, шаг струн 16.4 px, цифры целиком внутри, x по времени, аккорд и «−»');
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

  // Цифры: явный кегль, центровка на моменте, никаких трансформов.
  const texts = [...svg.querySelectorAll('text.tab-digits-digit')];
  assert.strictEqual(texts.length, 8, 'восемь цифр — по одной на ноту');
  texts.forEach((t, i) => {
    assert(/^[0-9x]+$/.test(t.textContent), `цифра ${i + 1} — лад, а не служебный символ`);
    assert(t.getAttribute('text-anchor') === 'middle', `цифра ${i + 1} центрирована на своём моменте`);
    assert(!t.hasAttribute('transform'), `цифра ${i + 1} не трансформируется`);
    assert(Number(t.getAttribute('font-size')) >= 19, `цифра ${i + 1} не мельче 19 px`);
    assert(!isNaN(Number(t.getAttribute('x'))), `у цифры ${i + 1} есть x`);
  });
  assert.deepStrictEqual(texts.map((t) => r3(Number(t.getAttribute('x')))), [0, 24, 48, 72, 96, 120, 144, 168],
    'x цифр в разметке = моменты звучания');

  // Подложка под каждой цифрой — по её ширине, не «квадрат на всё», и по
  // высоте чернил: линия разрывается вокруг цифры, как в 0.880.
  const halos = [...svg.querySelectorAll('rect.tab-digits-halo')];
  assert.strictEqual(halos.length, 8, 'подложка есть под каждой цифрой');
  halos.forEach((h, i) => {
    const x = Number(h.getAttribute('x'));
    const wd = Number(h.getAttribute('width'));
    const hh = Number(h.getAttribute('height'));
    assert(Math.abs((x + wd / 2) - Number(texts[i].getAttribute('x'))) < 0.01,
      `подложка ${i + 1} центрирована на цифре`);
    assert(wd >= 6, `подложка ${i + 1} не вырождена`);
    assert(hh >= 12 && hh <= 17, `подложка ${i + 1} по высоте чернил (${r3(hh)} px)`);
    const rx = Number(h.getAttribute('rx'));
    assert(rx >= 4 && Math.abs(rx - Math.min(hh / 2, hh * 0.3)) < 0.01,
      `подложка ${i + 1} скруглена: rx=${r3(rx)} при высоте ${r3(hh)} px (30 %, но не меньше 4)`);
  });
  // Цифры не растянуты: ширина глифа у Arial ≈ 0.56 кегля на знак.
  const suiteWidths = [...svg.querySelectorAll('text.tab-digits-digit')].map((t) => {
    const i = texts.indexOf(t);
    return Number(halos[i].getAttribute('width')) - 2;
  });
  const fontSizes = texts.map((t) => Number(t.getAttribute('font-size')));
  suiteWidths.forEach((wd, i) => {
    const chars = texts[i].textContent.trim().length;
    assert(Math.abs(wd - 0.56 * fontSizes[i] * chars) < 0.6,
      `ширина цифры ${i + 1} = 0.56 кегля на знак (без растяжения)`);
  });
  // Шрифт и начертание — из CSS карточки Ленты (jsdom считает каскад).
  const cardHost = w.document.createElement('div');
  cardHost.className = 'tab-insert tab-insert--lenta';
  cardHost.innerHTML = out.svg;
  w.document.body.appendChild(cardHost);
  const computed = w.getComputedStyle(cardHost.querySelector('text.tab-digits-digit'));
  assert(/Arial/i.test(computed.fontFamily || ''), `font-family цифр Ленты — Arial (${computed.fontFamily})`);
  assert(/^(400|normal)$/.test((computed.fontWeight || '').trim()), `font-weight цифр Ленты — 400 (${computed.fontWeight})`);
  cardHost.remove();

  // Пауза — короткая чёрточка, цифры у неё нет.
  const pauseHost = w.document.createElement('div');
  pauseHost.innerHTML = out.pause;
  const dash = pauseHost.querySelector('line.tab-digits-pause');
  assert(dash, 'пауза нарисована чёрточкой');
  assert.strictEqual(pauseHost.querySelectorAll('text.tab-digits-digit').length, 1,
    'под паузой нет цифры — нота осталась одна');
  assert.strictEqual(pauseHost.querySelectorAll('text.tab-digits-count').length, 0,
    'счёт внутри стана Ленты не дублируется');
  ok('Разметка: viewBox в пикселях клетки, цифры Arial 400 ≥ 19 px, линии на всю ширину, пауза без цифры');
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

  // 0.883: стан считается по размеру КЛЕТКИ. В jsdom ширину даёт
  // inline-стиль клетки (как в браузере — getBoundingClientRect).
  const body = card.querySelector('.tab-insert-body');
  assert(body, 'у карточки есть тело со станом');
  sizeBody(w, body, 120, 98);   // тело уже клетки (старое поведение) — не должно влиять

  // Ставим клетке ширину (как масштабы «−»/«авто»/«+»), пересобираем ОБЩУЮ
  // линейку на этой ширине и заново красим стан. Подписи `.tl-count` живут в
  // тех же пикселях клетки, поэтому их центры можно сверять с x цифр напрямую.
  function paintAt(widthPx) {
    tabCell.style.width = widthPx + 'px';
    w.eval('renderRhythmTrack()');
    w.eval('tabDigitsPaint(document)');
    const s2 = body.querySelector('svg.tab-digits-svg');
    const all = [...doc.querySelectorAll('#timelineRhythm .tl-count')]
      .map((el) => ({ text: el.textContent, isBeat: el.classList.contains('is-beat'), center: parseFloat(el.style.left) || 0 }));
    const labels = all.filter((c) => c.center >= -0.5 && c.center < widthPx - 0.01);
    const cells = [...s2.querySelectorAll('text.tab-digits-digit')]
      .map((t) => ({ text: t.textContent.trim(), center: r3(Number(t.getAttribute('x'))) }));
    return { width: widthPx, svg: s2, labels, all, digits: cells };
  }

  const auto = paintAt(192);
  const svg = auto.svg;
  assert(svg, 'стан нарисован');
  // Настоящий каскад, а не только текст правил: ни клетка, ни карточка не
  // должны обрезать выступающую половину крайней цифры.
  assert.strictEqual(w.getComputedStyle(tabCell).overflow, 'visible',
    'у таб-клетки в браузере overflow: visible — крайняя цифра не режется');
  assert.strictEqual(w.getComputedStyle(card).overflow, 'visible',
    'карточка Ленты не обрезает стан');
  assert.strictEqual(svg.getAttribute('viewBox'), '0 0 192 98',
    'viewBox = ширина КЛЕТКИ, а не тела карточки (ничего не сжимается)');
  assert.strictEqual(svg.getAttribute('width'), '192', 'SVG ровно по ширине клетки');
  assert.strictEqual(svg.style.position, 'absolute', 'стан лежит на клетке, а не центрируется в теле');
  assert.strictEqual(svg.style.width, '192px', 'стан занял ровно ширину клетки и в CSS — не «100 % тела»');
  assert.strictEqual(svg.style.height, '98px', 'высота стана — высота клетки');
  assert.strictEqual(w.getComputedStyle(svg).overflow, 'visible',
    'окно стана само не режет цифру у края');
  const xs = auto.digits.map((d) => d.center);
  assert.deepStrictEqual(xs, [0, 24, 48, 72, 96, 120, 144, 168],
    'x цифр = моменты звучания от левого края клетки');

  // Главная сверка 0.883: центр цифры = центр подписи .tl-count (±1 px).
  // Таблица владельца «центр цифры / центр подписи» на всех трёх масштабах.
  const zoomTable = [];
  [192, 96, 376].forEach((widthPx) => {
    const shot = paintAt(widthPx);
    assert.strictEqual(shot.svg.getAttribute('viewBox'), `0 0 ${widthPx} 98`,
      `клетка ${widthPx} px: стан пересчитан по её ширине`);
    assert.strictEqual(shot.labels.length, 8, `клетка ${widthPx} px: под вставкой восемь подписей «1 та и та 2 та и та»`);
    assert.strictEqual(shot.digits.length, 8, `клетка ${widthPx} px: восемь цифр`);
    const rows = shot.digits.map((d, i) => ({
      note: i + 1,
      digit: d.text,
      digitCenter: d.center,
      label: shot.labels[i].text,
      labelCenter: r3(shot.labels[i].center),
    }));
    rows.forEach((row) => {
      assert(Math.abs(row.digitCenter - row.labelCenter) <= 1,
        `клетка ${widthPx} px, нота ${row.note}: центр цифры ${row.digitCenter} против центра подписи «${row.label}» ${row.labelCenter} (допуск 1 px)`);
    });
    // x цифры = доля времени × ширина клетки, без сдвигов и сжатий.
    const expect = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875].map((frac) => r3(frac * widthPx));
    shot.digits.forEach((d, i) => {
      assert(Math.abs(d.center - expect[i]) <= 1,
        `клетка ${widthPx} px, нота ${i + 1}: ожидали x≈${expect[i]}, получили ${d.center}`);
    });
    // Первая цифра не сдвинута внутрь и последняя не поджата — выступание разрешено.
    assert.strictEqual(shot.digits[0].center, 0, `клетка ${widthPx} px: первая цифра на левом краю, а не сдвинута`);
    assert.strictEqual(shot.digits[7].center, expect[7], `клетка ${widthPx} px: восьмая цифра на своём моменте, не поджата к краю`);
    zoomTable.push({ width: widthPx, rows, expected: expect });
  });
  zoomTable.forEach((z) => {
    console.log(`      клетка ${z.width} px: ` + z.rows
      .map((r, i) => `${r.digi ?? r.digit} ${r.digitCenter}/${r.labelCenter} (${r.label})`).join(' · '));
  });

  // Общий счёт Ленты — как в 0.880: «1 та и та 2 та и та», дальше 3 и 4.
  const counts = auto.labels;
  const underTab = counts.slice(0, 8);
  assert.deepStrictEqual(
    underTab.map((c) => (c.isBeat ? `[${c.text}]` : c.text)),
    ['[1]', 'та', 'и', 'та', '[2]', 'та', 'и', 'та'],
    'под 2 долями × 4 шестнадцатых стоит «[1] та и та [2] та и та»',
  );
  const afterTab = auto.all.filter((c) => c.center >= 191.99);
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

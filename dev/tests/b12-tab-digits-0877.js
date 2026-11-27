#!/usr/bin/env node
'use strict';
// 0.877 · «Только цифры»: свой стан вместо alphaTab в редакторе песни.
//
// Почему тест такой:
//   • jsdom не считает раскладку, поэтому основная проверка — ЧИСТАЯ модель
//     стана (tabDigitsLayout): позиции, шаг 24 px, формула ширины, номера
//     долей, перекладины, геометрия «цифры не налезают»;
//   • решение «клетка шире своей доли → на свою строку сетки» проверяется на
//     подставных clientWidth (jsdom отдаёт 0);
//   • живой рендер подтверждает, что в песне рисуется свой стан, а Лента и
//     окно редактора вставки остались на alphaTab, и что данные не поехали.
//
// Запуск: node dev/tests/b12-tab-digits-0877.js

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const ROADMAP = fs.readFileSync(path.join(ROOT, 'ROADMAP.md'), 'utf8');

let passed = 0;
function ok(msg) {
  passed++;
  console.log('  ok  ' + msg);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cssBlock(selector) {
  const at = 'STRUCHORD'.length ? HTML.indexOf('\n' + selector) : -1;
  assert(at >= 0, 'CSS-правило найдено: ' + selector);
  const open = HTML.indexOf('{', at);
  const close = HTML.indexOf('}', open);
  return HTML.slice(open, close + 1);
}

// =====================================================================
// 1. Версия и статические инварианты
// =====================================================================
{
  assert(HTML.includes('ver 0.877'), 'STRUCHORD.html header is ver 0.877');
  assert(SW.includes("const CACHE_NAME = 'struchord-v877';"), 'sw.js CACHE_NAME is struchord-v877');
  assert(README.includes('`0.877`'), 'README header is 0.877');
  assert(ROADMAP.includes('**0.877**'), 'ROADMAP header is 0.877');

  for (const fn of ['tabDigitsLayout', 'tabDigitsSvgMarkup', 'tabDigitsMinWidth', 'tabDigitsSpanText', 'tabDigitsFit', 'tabDigitsScheduleFit']) {
    assert(HTML.includes('function ' + fn + '('), 'функция ' + fn + ' есть');
  }
  assert(HTML.includes('const TAB_DIGITS_POS_W = 24;'), 'минимум 24 px на нотовую позицию задан константой');
  // Лента осталась на alphaTab, редактор вставки — тоже.
  assert(HTML.includes("renderTabInsertHtml(sec, sq, parentTs, true, { inTimeline: true })"),
    'Лента просит alphaTab (inTimeline)');
  assert(HTML.includes("renderTabInsertHtml(sec, sq, parentTs, true, { isCell: true, ei, event: ev, inTimeline: true })"),
    'таб-клетка Ленты просит alphaTab');
  assert(HTML.includes("renderTabInsertHtml(sec, editor.draft, ts, false, { engine: 'alphatab' })"),
    'окно редактора вставки осталось на alphaTab');
  assert(HTML.includes("if (el.hasAttribute && el.hasAttribute('data-tab-digits')) return;"),
    'миниатюра alphaTab не трогает карточки «Только цифры»');
  assert(HTML.includes('data-tab-digits-w='), 'ширина стана уезжает в разметку карточки');
  // Мелкой линейки «1 1 и 2 2 та и та» в таб-клетке больше нет.
  const cellHtml = HTML.slice(HTML.indexOf('function buildInlineTabCellHtml('), HTML.indexOf('function buildSquareInnerEventsHtml('));
  assert(!cellHtml.includes('chord-counts'), 'в таб-клетке нет мелкого счёта «и/та»');
  assert(cellHtml.includes('data-tab-span='), 'клетка помнит свою долю в колонках сетки');
  assert(cellHtml.includes('beatOffset: epochOwnOffset'), 'крупные номера долей считаются от начала такта');

  const digitsCss = cssBlock('.tab-insert--digits {');
  assert(digitsCss.includes('--tab-digit-halo'), 'у цифр есть подложка цвета карточки');
  assert(cssBlock('.tab-insert--digits .tab-insert-count {').includes('text-overflow: clip;'),
    'подпись не режется троеточием');
  assert(cssBlock('.tab-insert--digits .tab-insert-count {').includes('white-space: normal;'),
    'подпись может лечь во вторую строку');
  assert(cssBlock('.tab-digits-digit {').includes('font:'), 'цифры ладов — моноширинный шрифт');
  ok('Статические инварианты: версия 0.877, функции стана, Лента и редактор вставки на alphaTab, CSS');
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
      w.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 8);
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
    metadata: { title: 'digits 0877', artist: 'STRUCHORD' },
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
  // 2. Модель стана: нотовые позиции, шаг 24 px, формула ширины
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    const { w } = ctx;
    const cases = [
      ['2 доли × 4 шестнадцатых', sixteenths(8, 2), 2, 8],
      ['1 такт × 8 восьмых', sixteenths(8, 4, 0.5), 4, 8],
      ['1 такт × 16 шестнадцатых', sixteenths(16, 4), 4, 16],
      ['2 такта × 8 четвертей', sixteenths(8, 8, 1), 8, 8],
    ];
    const table = [];
    for (const [name, notes, beats, expected] of cases) {
      const L = w.tabDigitsLayout(notes, beats, '4/4', { strings: 6 }, {});
      assert.strictEqual(L.positions.length, expected, `${name}: позиций ${expected}`);
      assert.strictEqual(L.width, 16 + expected * 24, `${name}: ширина стана = позиции × 24 + поля`);
      assert.strictEqual(L.minWidth, expected * 24 + 32, `${name}: ширина карточки = позиции × 24 + 32`);
      for (let i = 1; i < L.positions.length; i += 1) {
        const step = L.positions[i].x - L.positions[i - 1].x;
        assert.strictEqual(step, 24, `${name}: шаг между позициями ровно 24 px`);
      }
      table.push(`${name}: ${expected} поз. → ${L.minWidth} px`);
    }
    console.log('  формула ширины: max(доля времени, позиции × 24 + 32)');
    table.forEach((row) => console.log('    ' + row));
    // Аккорд на одной доле — одна позиция, три цифры на разных струнах.
    const chord = w.tabDigitsLayout([
      { start: 0, dur: 0.5, string: 1, fret: 2 },
      { start: 0, dur: 0.5, string: 2, fret: 3 },
      { start: 0, dur: 0.5, string: 3, fret: 2 },
    ], 2, '4/4', { strings: 6 }, {});
    assert.strictEqual(chord.positions.length, 1, 'аккорд на одной доле — одна позиция');
    assert.strictEqual(chord.positions[0].digits.length, 3, 'в позиции три цифры');
    ok('Модель: позиции, шаг 24 px, формула ширины, аккорд = одна позиция');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 3. Граничные случаи формулы ширины
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    const { w } = ctx;
    assert.strictEqual(w.tabDigitsMinWidth(0), 56, 'пустая вставка: минимум одна позиция (56 px)');
    assert.strictEqual(w.tabDigitsMinWidth(1), 56, 'одна позиция: 24 + 32 = 56 px');
    assert.strictEqual(w.tabDigitsMinWidth(2), 80, 'две позиции: 80 px');
    assert.strictEqual(w.tabDigitsMinWidth(8), 224, 'восемь позиций: 224 px');
    assert.strictEqual(w.tabDigitsMinWidth(16), 416, 'шестнадцать позиций: 416 px');
    assert.strictEqual(w.tabDigitsMinWidth(32), 800, 'тридцать две позиции: 800 px');
    // Шаг не зависит от густоты: 4 позиции в такте и 16 позиций в такте.
    const sparse = w.tabDigitsLayout(sixteenths(4, 4, 1), 4, '4/4', { strings: 6 }, {});
    const dense = w.tabDigitsLayout(sixteenths(16, 4), 4, '4/4', { strings: 6 }, {});
    assert.strictEqual(sparse.positions[1].x - sparse.positions[0].x, 24, 'четверти: шаг 24 px');
    assert.strictEqual(dense.positions[1].x - dense.positions[0].x, 24, 'шестнадцатые: тот же шаг 24 px');
    assert(dense.minWidth > sparse.minWidth * 3, 'шестнадцать шестнадцатых вчетверо шире четырёх четвертей');
    // Пустая вставка: стана нет, карточка честно говорит «Нет нот».
    const empty = w.tabDigitsLayout([], 4, '4/4', { strings: 6 }, {});
    assert.strictEqual(empty.empty, true, 'пустая вставка помечена');
    assert.strictEqual(w.tabDigitsSvgMarkup(empty), '', 'для пустой вставки SVG не рисуется');
    ok('Границы ширины: 0/1/2/8/16/32 позиции, густота не меняет шаг, пустая вставка');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 4. Цифры не налезают + номера долей + перекладины
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    const { w } = ctx;
    const L = w.tabDigitsLayout(sixteenths(16, 4), 4, '4/4', { strings: 6 }, {});
    // Подложка цифры 13 px при шаге 24 px: между подложками 11 px воздуха.
    assert.strictEqual(L.haloW, 13, 'ширина подложки цифры');
    assert.strictEqual(24 - L.haloW, 11, 'между подложками соседних цифр 11 px');
    for (let i = 1; i < L.positions.length; i += 1) {
      const left = L.positions[i - 1].x + L.haloW / 2;
      const right = L.positions[i].x - L.haloW / 2;
      assert(right - left >= 10.5, 'цифра ' + i + ' не налезает на предыдущую');
    }
    // Номера долей — только крупные, только начало доли, без «и/та».
    assert.strictEqual(L.beatLabels.map((b) => b.text).join(''), '1234', 'номера долей «1 2 3 4»');
    assert(L.beatLabels.every((b) => /^\d+$/.test(b.text)), 'в стане нет подписей «и» и «та»');
    for (let i = 1; i < L.beatLabels.length; i += 1) {
      assert(L.beatLabels[i].x - L.beatLabels[i - 1].x >= 24, 'номера долей не налезают друг на друга');
    }
    // Ячейка во второй половине такта нумеруется «3 4», как и аккорды рядом.
    const secondHalf = w.tabDigitsLayout(sixteenths(8, 2), 2, '4/4', { strings: 6 }, { beatOffset: 2 });
    assert.strictEqual(secondHalf.beatLabels.map((b) => b.text).join(''), '34', 'номера долей продолжают такт: «3 4»');
    // Перекладины: у шестнадцатых две на долю (4 доли → 8 линий), у восьмых одна (4).
    assert.strictEqual(L.beams.length, 8, 'шестнадцатые: две перекладины на каждую долю');
    assert(L.beams.filter((b) => b.level === 1).length === 4 && L.beams.filter((b) => b.level === 2).length === 4,
      'уровни перекладин: 4 по одной + 4 по второй');
    const eighths = w.tabDigitsLayout(sixteenths(8, 4, 0.5), 4, '4/4', { strings: 6 }, {});
    assert.strictEqual(eighths.beams.length, 4, 'восьмые: одна перекладина на долю');
    const quarters = w.tabDigitsLayout(sixteenths(4, 4, 1), 4, '4/4', { strings: 6 }, {});
    assert.strictEqual(quarters.beams.length, 0, 'четверти: перекладин нет');
    // Перекладина не выходит за свои позиции.
    L.beams.forEach((b) => {
      assert(b.xs.length >= 2 && b.xs[0] < b.xs[b.xs.length - 1], 'перекладина соединяет минимум две ноты');
    });
    // Пауза — короткая метка на своём месте, позицию она занимает.
    const withPause = w.tabDigitsLayout([
      { start: 0, dur: 0.5, string: 1, fret: 2 },
      { start: 0.5, dur: 0.5, pause: true },
      { start: 1, dur: 0.5, string: 2, fret: 4 },
    ], 2, '4/4', { strings: 6 }, {});
    assert.strictEqual(withPause.positions.length, 3, 'пауза занимает свою позицию');
    assert.strictEqual(withPause.positions.filter((p) => p.pause).length, 1, 'метка паузы одна');
    const svg = w.tabDigitsSvgMarkup(withPause);
    assert(svg.includes('tab-digits-rest'), 'метка паузы нарисована');
    assert(svg.includes('tab-digits-halo'), 'у цифр есть подложка');
    assert.strictEqual((svg.match(/class="tab-digits-line"/g) || []).length, 6, 'шесть линий струн');
    assert.strictEqual((svg.match(/class="tab-digits-beat"/g) || []).length, withPause.beatLabels.length, 'номера долей в SVG');
    assert(!svg.includes('TAB') && !svg.includes('4/4'), 'ключа TAB и размера в стане нет');
    const uke = w.tabDigitsLayout(sixteenths(4, 2), 2, '4/4', { instrument: 'ukulele', strings: 4 }, {});
    assert.strictEqual((w.tabDigitsSvgMarkup(uke).match(/class="tab-digits-line"/g) || []).length, 4,
      'у укулеле четыре линии');
    ok('Геометрия: цифры не налезают (11 px воздуха), доли «1 2 3 4»/«3 4», перекладины, пауза, укулеле');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 5. Ширина клетки: своя доля или своя строка сетки
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    const { w, doc } = ctx;
    const mount = ({ total = 8, span = 2, need = 224, state = { width: 900 } }) => {
      const host = doc.createElement('div');
      host.className = 'square-inner';
      host.style.gridTemplateColumns = `repeat(${total}, minmax(0,1fr))`;
      host.innerHTML = `<div class="chord-wrapper chord-wrapper--tab" style="grid-column:span ${span};" data-tab-span="${span}">` +
        `<div class="tab-insert tab-insert--cell tab-insert--digits" data-tab-digits-w="${need}"><div class="tab-insert-body"></div></div></div>`;
      doc.body.appendChild(host);
      Object.defineProperty(host, 'clientWidth', { get: () => state.width, configurable: true });
      return { host, wrap: host.querySelector('.chord-wrapper--tab'), state };
    };
    // Своя доля: 900 px сетки, 8 колонок по 2 px зазора, клетка на 2 колонки → 223.5 px.
    {
      const { wrap, state } = mount({ need: 223.5 });
      w.tabDigitsFit(doc);
      assert.strictEqual(wrap.style.gridColumn, 'span 2', 'нужная ширина ровно равна доле — клетка остаётся на месте');
      wrap.querySelector('.tab-insert').setAttribute('data-tab-digits-w', '224.5');
      w.tabDigitsFit(doc);
      assert.strictEqual(wrap.style.gridColumn, '1 / -1', 'шире доли — клетка уезжает на свою строку сетки');
      assert.strictEqual(wrap.dataset.tabDigitsRow, '1', 'перенос помечен');
      // Окно выросло — своя доля снова достаточна, клетка возвращается.
      state.width = 1100;
      w.tabDigitsFit(doc);
      assert.strictEqual(wrap.style.gridColumn, 'span 2', 'доля выросла — клетка вернулась в ряд');
      assert(!wrap.dataset.tabDigitsRow, 'пометка переноса снята');
    }
    // Ноль в задании — раскладку не трогаем.
    {
      const { wrap } = mount({ need: 0 });
      w.tabDigitsFit(doc);
      assert.strictEqual(wrap.style.gridColumn, 'span 2', 'пустая вставка раскладку не двигает');
    }
    // Отдельная строка таба: квадрат растягивается до нужной ширины, но не больше своей строки.
    {
      const host = doc.createElement('div');
      host.className = 'square square--tab';
      host.innerHTML = `<div class="square-inner" style="width:50%;">` +
        `<div class="tab-insert tab-insert--digits" data-tab-digits-w="416"><div class="tab-insert-body"></div></div></div>`;
      doc.body.appendChild(host);
      Object.defineProperty(host, 'clientWidth', { get: () => 1000, configurable: true });
      const inner = host.querySelector('.square-inner');
      w.tabDigitsFit(doc);
      assert.strictEqual(inner.style.minWidth, '', '50 % от 1000 px = 500 px — растягивать не нужно');
      inner.style.width = '20%';
      w.tabDigitsFit(doc);
      assert.strictEqual(inner.style.minWidth, '416px', '200 px мало — квадрат растянут до 416 px');
      inner.style.width = '100%';
      w.tabDigitsFit(doc);
      assert.strictEqual(inner.style.minWidth, '', 'места хватает — растяжение снято');
    }
    ok('Ширина: ровно доля / шире доли → своя строка / возврат при росте окна / строка таба');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 6. Живой рендер: свой стан в песне, alphaTab в Ленте и в редакторе
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    const { w, doc } = ctx;
    const digits = Array.from(doc.querySelectorAll('.tab-insert--digits'));
    assert.strictEqual(digits.length, 4, 'все четыре вставки в песне — «Только цифры»');
    digits.forEach((card) => {
      assert(card.querySelector('svg.tab-digits-svg'), 'у карточки свой стан');
      assert(!card.querySelector('[data-tab-counts]'), 'мелкой линейки в карточке нет');
      assert(!card.querySelector('.tab-thumb-wait'), 'надписи-заглушки alphaTab нет');
      assert(card.getAttribute('aria-label'), 'у карточки есть aria-label');
      assert(card.getAttribute('title').includes('Таб занимает'), 'подсказка говорит, какие доли заняты');
    });
    const cell = doc.querySelector('.chord-wrapper--tab .tab-insert--digits');
    assert(cell, 'ячейка между аккордами нарисована цифрами');
    assert.strictEqual(cell.getAttribute('aria-label').split(' · ')[0], 'Таб занимает доли 3–4',
      'ячейка во второй половине такта: «доли 3–4»');
    assert(/^\d+ н\. · /.test(cell.querySelector('.tab-insert-count').textContent), 'короткая подпись «8 н. · 2 доли»');
    assert.strictEqual(cell.querySelectorAll('.tab-digits-digit').length, 8, 'восемь цифр в ячейке');
    assert.strictEqual(Array.from(cell.querySelectorAll('.tab-digits-beat')).map((t) => t.textContent).join(''), '34',
      'крупные номера долей «3» и «4»');
    // Ячейка больше не держит мелкую линейку — значит и «и/та» не налезают.
    const wrap = cell.closest('.chord-wrapper--tab');
    assert.strictEqual(wrap.querySelectorAll('.chord-ticks, .chord-ticks-step, .chord-counts').length, 0,
      'у таб-клетки нет мелких засечек и счёта «1 и 2 и»');
    // Ширина в разметке — из формулы, а не из догадки.
    const wide = Array.from(digits).find((c) => c.querySelectorAll('.tab-digits-digit').length === 16);
    assert.strictEqual(wide.getAttribute('data-tab-digits-w'), '416', 'такт из 16 шестнадцатых просит 416 px');
    // Соседние аккорды живут как раньше: у них остался свой счёт долей.
    assert(doc.querySelectorAll('.chord-wrapper .chord-counts').length > 0, 'у аккордов счёт долей на месте');
    // Подписи долей у аккордов после вставки: «1 2 3 4» на месте.
    const labels = Array.from(doc.querySelectorAll('.chord-wrapper:not(.chord-wrapper--tab) .chord-count')).map((e) => e.textContent);
    assert(labels.includes('3') && labels.includes('4'), 'номера долей «3 4» под аккордами остались');
    assert.strictEqual(ctx.errors.length, 0, 'страница без ошибок: ' + ctx.errors.slice(0, 2).join(' | '));
    // alphaTab не получил ни одного задания на эти карточки.
    assert.strictEqual(w.eval('TAB_THUMB_PENDING.size'), 0, 'alphaTab не рисует карточки «Только цифры»');
    ok('Живой рендер: свой стан в песне, «3 4» у аккордов, alphaTab не вызывается');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 7. Данные и окно редактора вставки не изменились
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    const { w, doc } = ctx;
    // Состав нот по-прежнему в data-tab-thumb — формат прежний.
    const body = doc.querySelector('.tab-insert--digits [data-tab-thumb]');
    const spec = JSON.parse(decodeURIComponent(body.dataset.tabThumb));
    assert(Array.isArray(spec.n) && typeof spec.b === 'number' && typeof spec.t === 'string', 'спека нот прежняя (n/b/t/u/th)');
    assert(!('digits' in spec), 'новых полей в данных нет');
    // Дорисовка стана не трогает данные песни: модель до и после render() одна.
    const before = JSON.stringify(w.eval('sections'));
    w.render();
    await sleep(250);
    assert.strictEqual(JSON.stringify(w.eval('sections')), before, 'рендер не изменил данные песни');
    const rawCell = JSON.parse(before);
    const cellEv = rawCell[0].squares[0].events[1];
    assert.strictEqual(cellEv.isTab, true, 'ячейка осталась таб-вставкой');
    assert.strictEqual(cellEv.tabNotes.length, before === '' ? 0 : 8, 'восемь нот на месте');
    assert(!('digits' in cellEv) && !('digitsWidth' in cellEv), 'служебных полей в песне нет');
    // Окно редактора вставки осталось на alphaTab.
    w.openTabInsertEditor(101, 103);
    await sleep(400);
    const preview = doc.querySelector('.tab-editor-preview .tab-insert');
    assert(preview, 'превью в окне редактора есть');
    assert(!preview.classList.contains('tab-insert--digits'), 'окно редактора вставки не перешло на цифры');
    assert(preview.querySelector('[data-tab-counts]'), 'в окне редактора осталась линейка долей с «и/та»');
    assert.strictEqual(ctx.errors.length, 0, 'окно редактора открылось без ошибок');
    ok('Данные: формат нот прежний, сохранение не изменилось, окно редактора вставки на alphaTab');
    ctx.dom.window.close();
  }

  console.log(`\n0.877 «Только цифры»: ${passed} групп OK`);
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});

#!/usr/bin/env node
'use strict';
// 0.880 · таб-вставка в ЛЕНТЕ: без длительностей, во всю высоту клетки,
// ноты ровно на своих долях, счёт «1 та и та» — в общей линейке Ленты.
//
// Владелец (замеры в Chromium, Oasis, вставка 2 доли × 4 шестнадцатых перед
// первой ячейкой, 1 доля ≈ 96 px) перечислил, что не так в Ленте:
//   • высота клетки таба 190 px против 98 px у соседней аккордовой (свисает
//     на зону боя и линейки);
//   • рисуются палочки и флажки длительностей;
//   • ключ «TAB» и размер обрезаны слева и сдвигают ноты;
//   • внутри карточки своя мини-линейка «1 та и та 2», она дублирует общую
//     и налезает на цифры;
//   • в общей линейке Ленты под вставкой подписей нет («0 та» вместо «2 та»).
//
// Этот прогон держит следствия правок: статические инварианты, арифметику
// «доля → x» на синтетическом рисунке alphaTab и живую Ленту в jsdom.
// Пиксельные кадры в настоящем браузере снимает dev/tests/b12-timeline-tab-0880-shots.js
// (в песочнице Chromium нет — см. отчёт).
//
// Запуск: node dev/tests/b12-timeline-tab-0880.js

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
// 1. Статические инварианты 0.880
// =====================================================================
{
  assert(HTML.includes('ver 0.880'), 'STRUCHORD.html header is ver 0.880');
  assert(SW.includes("const CACHE_NAME = 'struchord-v880';"), 'sw.js CACHE_NAME is struchord-v880');
  assert(README.includes('`0.880`'), 'README header is 0.880');
  assert(ROADMAP.includes('**0.880**'), 'ROADMAP header is 0.880');
  assert(CHANGELOG.includes('## 0.880'), 'CHANGELOG has 0.880 entry');

  // А. Высота: одна переменная на все клетки, у таба своя высота исчезла.
  const cellRule = cssRule('.tl-cell');
  assert(/--tl-cell-height:\s*4\.875rem/.test(cellRule), 'высота клетки Ленты живёт в переменной');
  assert(/height:\s*var\(--tl-cell-height/.test(cellRule), 'аккордовая клетка берёт высоту из переменной');
  const tabRule = cssRule('.tl-cell.tl-cell--tab');
  assert(/height:\s*var\(--tl-cell-height/.test(tabRule), 'таб-клетка берёт ТУ ЖЕ высоту');
  assert(!/9\.5rem/.test(tabRule), 'своей высоты 9.5rem у таб-клетки больше нет');
  assert(/min-height:\s*0/.test(tabRule), 'min-height таб-клетки не растягивает ряд');
  assert(/padding:\s*0/.test(tabRule), 'у таб-клетки нет внутренних полей под счёт');
  const tabCardRule = cssRule('.tl-cell--tab .tab-insert');
  assert(/padding:\s*0/.test(tabCardRule), 'карточка не занимает место под мини-линейку');
  assert(/height:\s*100%/.test(tabCardRule), 'карточка во всю высоту клетки');
  assert(/overflow:\s*hidden/.test(tabCardRule), 'карточка не выпускает стан за свои края');
  const headingRule = cssRule('.tl-cell--tab .tab-insert-heading');
  assert(/display:\s*none/.test(headingRule), 'заголовок в клетке Ленты не отъедает высоту у стана');
  const bodyRule = cssRule('.tl-cell--tab .tab-insert-body');
  assert(/height:\s*100%/.test(bodyRule), 'тело карточки занимает карточку целиком');

  // Б. Длительности: ритм скрыт ТОЛЬКО у клетки Ленты, окно редактора прежнее.
  assert(
    HTML.includes('tabThumbApi.settings.notation.rhythmMode = fitHeight') &&
      HTML.includes('? alphaTab.TabRhythmMode.Hidden') &&
      HTML.includes(': alphaTab.TabRhythmMode.ShowWithBeams'),
    'rhythmMode = Hidden для Ленты и ShowWithBeams для окна редактора',
  );
  assert(
    /if \(fitHeight\) tabThumbApi\.settings\.notation\.rhythmMode|tabThumbApi\.settings\.notation\.rhythmMode = fitHeight/.test(HTML),
    'режим ритма привязан к запросу клетки (fitHeight), а не к «мастерской» вообще',
  );

  // В. Ключ и размер: кадрируем служебную зону слева.
  assert(HTML.includes('function tabThumbTimelineSvg('), 'сборка картинки клетки Ленты');
  assert(/viewBox',\s*`\$\{x0\.toFixed\(3\)\} 0 \$\{span\.toFixed\(3\)\}/.test(HTML),
    'кадр начинается с первой доли — ключ и размер за кадром');
  assert(HTML.includes("clone.setAttribute('preserveAspectRatio', 'none')"),
    'кадр растягивается ровно в прямоугольник клетки (стан во всю высоту)');
  assert(HTML.includes('function tabThumbShiftBeatGroup('), 'доля ставится на свою временную позицию');
  assert(HTML.includes('function tabThumbAnchorNoteX('), 'x цифры берётся из границ ноты alphaTab');
  assert(/nx:\s*tabThumbAnchorNoteX\(bb, vb\)/.test(HTML), 'якорь доли знает x своей цифры');
  assert(/id:\s*bb\.beat \? bb\.beat\.id : 0/.test(HTML), 'якорь доли знает id своей группы');
  assert(HTML.includes("g.setAttribute('opacity', '0.42')") ||
    HTML.includes("g.setAttribute('opacity', '0.42')"), 'пауза — приглушённая метка, а не цифра');

  // Г. Мини-линейка в карточке Ленты снята, общая линейка её заменила.
  assert(HTML.includes('const tabRuler = !useDigits && !inTimeline && thumbSpec'),
    'в клетке Ленты своей мини-линейки нет');
  assert(HTML.includes('const inTimeline = !!(cellOpts && cellOpts.inTimeline);'),
    'разметка карточки знает, что она в Ленте');
  assert(HTML.includes('function tabTimelineRulerSteps(sq, ev)'),
    'дробление счёта под вставкой считается по её нотам');
  assert(HTML.includes('? tabTimelineRulerSteps(sq, ev)'),
    'общая линейка берёт дробление у таб-вставки');
  assert(!/renderRhythmTrack[\s\S]{0,6000}if \(ev\.isTab\) return;/.test(HTML),
    'таб-клетка больше не пропускает общий счёт');
  assert(HTML.includes("return String(beatInBar + 1);"),
    'номера долей по-прежнему считаются от начала такта');

  // Д. Сетка редактора песни (0.879) не тронута.
  assert(HTML.includes('const useDigits = !(cellOpts && (cellOpts.inTimeline || cellOpts.engine === \'alphatab\'));'),
    'в редакторе стан «только цифры», в Ленте — alphaTab');
  assert(HTML.includes('function tabDigitsLayout('), 'раскладка «только цифры» на месте');
  assert(HTML.includes('function tabDigitsSvgMarkup('), 'рисование «только цифры» на месте');
  assert(HTML.includes('.tab-insert--digits {'), 'стили цифровой карточки на месте');
  assert(/data-tab-positions="\$\{digitsCount\}"/.test(HTML), 'цифровая карточка сообщает число позиций');
  assert(/class="tab-digits-line"/.test(HTML) || HTML.includes('tab-digits-line'),
    'линии стана «только цифры» рисуются как раньше');
  ok('Статика 0.880: высота из одной переменной, ритм скрыт только в Ленте, мини-линейки нет, сетка 0.879 цела');
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
      // Высота клетки Ленты в браузере приходит из раскладки — здесь 98 px,
      // ровно столько владелец намерил у аккордовой клетки.
      win.Element.prototype.getBoundingClientRect = function () {
        const isTabCell = this.classList && this.classList.contains('tl-cell--tab');
        return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: isTabCell ? 98 : 0 };
      };
    },
  });
  return { w: dom.window, doc: dom.window.document, errors };
}

// Сценарий владельца: вставка 2 доли × 4 шестнадцатых перед первой ячейкой.
async function runLive() {
  const { w, doc, errors } = boot();
  await sleep(1200);
  assert(!errors.length, 'стенд поднялся без ошибок: ' + errors.join(' | '));
  w.eval(`
    startNewSongFromHome();
    addSection('Verse');
    const notes = [];
    for (let i = 0; i < 8; i++) notes.push({ start: i * 0.25, dur: 0.25, string: i % 6, fret: (i % 5) + 1 });
    sections[0].squares[0].events = [
      { chord: '', span: 2, timeSig: null, isTab: true, tabNotes: notes },
      { chord: 'C', span: 2 }
    ];
    if (!timelineMode) toggleTimelineMode();
    renderTimeline();
  `);

  const tabCell = doc.querySelector('#timelineTrack .tl-cell--tab');
  assert(tabCell, 'в Ленте появилась таб-клетка');
  const card = tabCell.querySelector('.tab-insert');
  assert(card, 'внутри клетки — карточка вставки');

  // В. Мини-линейки в карточке нет.
  assert(!card.querySelector('[data-tab-counts]'), 'своей мини-линейки счёта в карточке нет');
  assert(!card.querySelector('[data-tab-ticks]'), 'своих штрихов в карточке нет');
  assert(!card.querySelector('[data-tab-subticks]'), 'своих подсеток в карточке нет');

  // Г. Счёт — в общей линейке Ленты, ровно под нотами.
  const counts = [...doc.querySelectorAll('#timelineRhythm .tl-count')].map((el) => ({
    text: el.textContent,
    isBeat: el.classList.contains('is-beat'),
    left: parseFloat(el.style.left) || 0,
  }));
  const tabWidth = parseFloat(tabCell.style.width) || 0;
  assert(tabWidth > 0, 'ширина таб-клетки известна (inline-стиль)');
  // В jsdom левый край ленты — ноль, поэтому x подписей таб-клетки и есть
  // абсолютная позиция от её начала.
  const underTab = counts.slice(0, 8);
  assert.deepStrictEqual(
    underTab.map((c) => (c.isBeat ? `[${c.text}]` : c.text)),
    ['[1]', 'та', 'и', 'та', '[2]', 'та', 'и', 'та'],
    'под 2 долями × 4 шестнадцатых стоит «[1] та и та [2] та и та»',
  );
  const table = underTab.map((c, i) => ({
    index: i,
    label: c.text,
    expected: r3((i / underTab.length) * tabWidth),
    actual: r3(c.left),
  }));
  table.forEach((row) => {
    assert(
      Math.abs(row.expected - row.actual) <= 2,
      `подпись «${row.label}» стоит на своём месте: ожидали ${row.expected}, получили ${row.actual}`,
    );
  });
  console.log(
    '      x подписей под вставкой (ожидаемо / фактически): ' +
      table.map((r) => `${r.label} ${r.expected}/${r.actual}`).join(' · '),
  );

  const ticksUnderTab = [...doc.querySelectorAll('#timelineRhythm .tl-tick')]
    .slice(0, 8)
    .map((el) => (el.classList.contains('is-beat') ? 'beat' : el.classList.contains('is-bar') ? 'bar' : 'sub'));
  assert.deepStrictEqual(ticksUnderTab, ['bar', 'sub', 'sub', 'sub', 'beat', 'sub', 'sub', 'sub'],
    'штрихи под вставкой: сильная доля — «bar», вторая — «beat», между ними «sub»');

  // Счёт после вставки продолжает такт: следующая аккордовая клетка — с 3-й доли.
  // У этой аккордовой клетки нет боя — считаются только доли, но именно
  // третья и четвёртая: счёт после вставки не сбит.
  const afterTab = counts.slice(8);
  assert.deepStrictEqual(
    afterTab.map((c) => (c.isBeat ? `[${c.text}]` : c.text)),
    ['[3]', '[4]'],
    'аккорд после вставки продолжает счёт с 3-й доли',
  );

  // Д. Сетка редактора песни прежняя: без cellOpts карточка «только цифры».
  const gridHtml = w.eval(`
    (function () {
      const sec = sections[0];
      const sq = { id: 99, type: 'tab', notes: [
        { start: 0, dur: 0.25, string: 0, fret: 3 },
        { start: 0.25, dur: 0.25, string: 1, fret: 5 },
        { start: 0.5, dur: 0.25, string: 2, fret: 7 },
        { start: 0.75, dur: 0.25, string: 3, fret: 2 }
      ], span: 1 };
      return renderTabInsertHtml(sec, sq, sec.timeSig || globalTimeSig, false);
    })()
  `);
  assert(/tab-insert--digits/.test(gridHtml), 'в редакторе карточка остаётся «только цифры»');
  assert(/data-tab-positions="4"/.test(gridHtml), 'в редакторе 4 позиции — как в 0.879');
  assert(/tab-digits-line/.test(gridHtml), 'линии стана рисуются своим SVG, а не картинкой alphaTab');
  assert(!/data-tab-counts/.test(gridHtml), 'своей мини-линейки в карточке редактора тоже нет (0.877+)');

  // Та же вставка в Ленте — alphaTab, цифрового стана нет.
  assert(!card.classList.contains('tab-insert--digits'), 'в Ленте по-прежнему alphaTab, а не цифровой стан');
  const thumbBody = card.querySelector('[data-tab-thumb]');
  assert(thumbBody, 'карточка Ленты просит картинку у alphaTab');
  const spec = JSON.parse(decodeURIComponent(thumbBody.getAttribute('data-tab-thumb')));
  assert.strictEqual(spec.n.length, 8, 'состав нот передан целиком (8 нот)');
  assert.strictEqual(spec.b, 2, 'длина вставки в долях — 2');

  // Б. В jsdom alphaTab не рисует: карточка честно ждёт картинку, а не врёт.
  assert(!!card.querySelector('.tab-thumb-wait') || !!card.querySelector('.tab-thumb'),
    'карточка ждёт картинку alphaTab (в jsdom движок не рисует)');

  // Регрессия 0.808: счёт аккордов на синкопах не сломан.
  w.eval(`
    sections[0].squares[0].events = [
      { chord: 'C', span: 1.75 },
      { chord: 'G', span: 2.25 }
    ];
    sections[0].strumPattern = {
      mode: 'strum', subdivision: 4,
      steps: ['D', null, null, null, 'D', null, null, 'U', null, 'U', 'D', null, 'D', null, 'D', 'U']
    };
    renderTimeline();
  `);
  const syncCounts = [...doc.querySelectorAll('#timelineRhythm .tl-count')].map((el) =>
    el.classList.contains('is-beat') ? `[${el.textContent}]` : el.textContent,
  );
  assert.deepStrictEqual(
    syncCounts,
    ['[1]', 'та', 'и', 'та', '[2]', 'та', 'и', 'та', '[3]', 'та', 'и', 'та', '[4]', 'та', 'и', 'та'],
    'синкопа 1.75 → 2.25 по-прежнему даёт непрерывный счёт (регрессия 0.808)',
  );
  ok('Живая Лента: счёт под вставкой и после неё, мини-линейки нет, сетка 0.879 цела');
  w.close();
}

// =====================================================================
// 2. Геометрия: доля -> x. Синтетический рисунок alphaTab (без движка).
// =====================================================================
async function runGeometry() {
  const { w } = boot();
  await sleep(900);

  // alphaTab расставляет доли по содержимому: лад из двух цифр шире. Рисунок
  // 320 px, слева 60 px служебной зоны (ключ и размер), дальше 4 доли.
  const svg =
    '<svg width="320" height="100" class="at"><g transform="translate(0,10)">' +
    '<g class="b1" transform="translate(60,0)"><text x="0" y="0">3</text></g>' +
    '<g class="b2" transform="translate(130,0)"><text x="0" y="0">12</text></g>' +
    '<g class="b3" transform="translate(215,0)"><text x="0" y="0">5</text></g>' +
    '<g class="b4" transform="translate(280,0)"><text x="0" y="0">7</text></g>' +
    '</g></svg>';
  const anchors = [
    { start: 0, dur: 1, x0: 60, x1: 126, nx: 62, id: 1, rest: false, bar: 0 },
    { start: 1, dur: 1, x0: 130, x1: 196, nx: 132, id: 2, rest: false, bar: 0 },
    { start: 2, dur: 1, x0: 215, x1: 270, nx: 217, id: 3, rest: true, bar: 0 },
    { start: 3, dur: 1, x0: 280, x1: 310, nx: 282, id: 4, rest: false, bar: 0 },
  ];
  const host = w.document.createElement('div');
  host.innerHTML = svg;
  const svgEl = host.querySelector('svg');
  const built = { beatInfo: new Map([[{ id: 3 }, { rest: true }]]) };
  const out = w.tabThumbTimelineSvg(svgEl, anchors, { b: 4, t: '4/4' }, built, []);
  assert(out && out.includes('<svg'), 'картинка собралась');

  const vb = (out.match(/viewBox="([^"]+)"/) || [])[1];
  assert(vb, 'у картинки есть viewBox');
  const [vx, vy, vw, vh] = vb.split(/\s+/).map(Number);
  assert.strictEqual(r3(vx), 60, 'кадр начинается с первой доли (ключ и размер за кадром)');
  assert.strictEqual(r3(vw), 250, 'ширина кадра — от первой доли до конца последней');
  assert.strictEqual(r3(vy), 0, 'по вертикали кадр начинается с верха рисунка');
  assert.strictEqual(r3(vh), 100, 'высота кадра — вся натуральная высота (стан заполнит клетку)');
  assert(/preserveAspectRatio="none"/.test(out), 'кадр растягивается в прямоугольник клетки');
  assert(/width="100%"/.test(out) && /height="100%"/.test(out), 'картинка во всю клетку');

  const holder = w.document.createElement('div');
  holder.innerHTML = out;
  const groups = new Map();
  [...holder.querySelectorAll('g[class]')].forEach((g) => {
    const cls = (g.getAttribute('class') || '').trim();
    if (/^b\d+$/.test(cls)) groups.set(Number(cls.slice(1)), g);
  });
  assert.strictEqual(groups.size, 4, 'все четыре доли на месте');

  // Таблица «ожидаемый / фактический x»: после кадрирования доля k из четырёх
  // обязана стоять на k/4 ширины кадра.
  const rows = anchors.map((a) => {
    const g = groups.get(a.id);
    const own = (g.getAttribute('transform').match(/^translate\((-?[\d.]+) /) || [])[1];
    const shift = Number(own);
    const actual = a.nx + shift - vx;       // x цифры в координатах кадра
    const expected = (a.start / 4) * vw;
    return { beat: a.id, expected: r3(expected), actual: r3(actual) };
  });
  rows.forEach((row) => {
    assert(Math.abs(row.expected - row.actual) <= 0.5,
      `доля ${row.beat}: ожидали x=${row.expected}, получили ${row.actual}`);
  });
  console.log(
    '      x нот в кадре (ожидаемо / фактически): ' +
      rows.map((r) => `${r.beat}: ${r.expected}/${r.actual}`).join(' · '),
  );

  // Доля с паузой — приглушённая метка, остальные не тронуты.
  assert.strictEqual(groups.get(3).getAttribute('opacity'), '0.42', 'пауза приглушена');
  assert.strictEqual(groups.get(1).getAttribute('opacity'), null, 'обычная доля не приглушена');

  // Классы музыкального шрифта сохраняются — иначе цифры «квадратиками».
  assert(/tab-thumb-svg at-surface at/.test(out), 'классы музыкального шрифта на месте');
  assert(/aria-hidden="true"/.test(out), 'картинка скрыта от скринридера');

  // Одинаковые доли: сдвигов нет, кадр по-прежнему от первой доли.
  const flat = '<svg width="200" height="80"><g class="b1" transform="translate(40,0)"><text>1</text></g>' +
    '<g class="b2" transform="translate(80,0)"><text>2</text></g></svg>';
  const flatHost = w.document.createElement('div');
  flatHost.innerHTML = flat;
  const flatOut = w.tabThumbTimelineSvg(flatHost.querySelector('svg'), [
    { start: 0, dur: 1, x0: 40, x1: 79, nx: 40, id: 1, rest: false },
    { start: 1, dur: 1, x0: 80, x1: 119, nx: 80, id: 2, rest: false },
  ], { b: 2 }, { beatInfo: new Map() }, []);
  assert(/viewBox="40\.000 0 79\.000 80\.000"/.test(flatOut), 'ровные доли: кадр без сюрпризов');

  // Хвост такта: пауза-заглушка (её группы в рисунке уже нет) не должна
  // растягивать кадр — иначе настоящие ноты сжались бы к левому краю.
  const tailHost = w.document.createElement('div');
  tailHost.innerHTML = '<svg width="300" height="100"><g class="b1" transform="translate(50,0)"><text>3</text></g>' +
    '<g class="b2" transform="translate(120,0)"><text>5</text></g></svg>';
  const tailOut = w.tabThumbTimelineSvg(tailHost.querySelector('svg'), [
    { start: 0, dur: 1, x0: 50, x1: 119, nx: 50, id: 1, rest: false },
    { start: 1, dur: 1, x0: 120, x1: 190, nx: 120, id: 2, rest: false },
    { start: 2, dur: 2, x0: 193, x1: 292, nx: 193, id: 3, rest: false, placeholder: true },
  ], { b: 2 }, { beatInfo: new Map() }, []);
  assert(/viewBox="50\.000 0 140\.000 100\.000"/.test(tailOut),
    'пауза-заглушка хвоста не растягивает кадр: он кончается на последней настоящей доле');

  // Пустой/битый рисунок — пустая строка, а не «NaN» в разметке.
  assert.strictEqual(w.tabThumbTimelineSvg(null, anchors, { b: 4 }, built, []), '', 'без рисунка — пусто');
  const noSize = w.document.createElement('div');
  noSize.innerHTML = '<svg><g class="b1"><text>1</text></g></svg>';
  assert.strictEqual(w.tabThumbTimelineSvg(noSize.querySelector('svg'), anchors, { b: 4 }, built, []), '',
    'рисунок без размеров не превращается в мусор');
  ok('Геометрия: x каждой ноты = её доля (допуск 0.5 px), пауза приглушена, классы шрифта целы');
  w.close();
}

// =====================================================================
// 3. Дробление счёта под вставкой — по самой мелкой ноте
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
        pauses: tabTimelineRulerSteps(sq([{ start: 0, dur: 0.25, pause: true }, { start: 0.25, dur: 0.5, string: 0, fret: 1 }]), null)
      };
    })()
  `);
  assert.strictEqual(steps.sixteenths, 4, 'шестнадцатые — «1 та и та»');
  assert.strictEqual(steps.eighths, 2, 'восьмые — «1 и 2 и»');
  assert.strictEqual(steps.quarters, 1, 'четверти — «1 2 3 4»');
  assert.strictEqual(steps.triplets, 3, 'триоли — «1 та ти»');
  assert.strictEqual(steps.sixteenthTriplets, 1,
    'шестнадцатые триоли (6 узлов в доле) словами не подписываются — только номера долей, чтобы слоги не соврали');
  assert.strictEqual(steps.thirtySeconds, 1, 'тридцать вторые — тоже только номера долей');
  assert.strictEqual(steps.empty, 1, 'пустая вставка не дробит счёт');
  assert.strictEqual(steps.pauses, 2, 'пауза не делает счёт мельче, чем звучащие ноты');
  ok('Дробление счёта: 16-е / 8-е / четверти / триоли / пустая вставка / паузы');
  w.close();
}

(async () => {
  await runLive();
  await runGeometry();
  await runSteps();
  console.log('\nитого: ' + passed + ' групп OK');
})().catch((e) => {
  console.error('\nПРОВАЛ: ' + (e && e.message));
  if (e && e.stack) console.error(e.stack.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
});

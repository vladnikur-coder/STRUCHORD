#!/usr/bin/env node
'use strict';
// 0.875 · Регрессия 0.874: стан — главный элемент окна редактора таб-вставки.
//
// Что проверяется:
//   1) высота стана: минимум 220 px на экране 680 px, рост по свободному месту,
//      и ни один медиазапрос больше не опускает стан ниже минимума;
//   2) компактная палитра: секции-переключатели, вторичные свёрнуты по умолчанию,
//      панель ладов в одну строку, пустое место под «Приёмами» убрано;
//   3) «Такт N: M из K — не заполнен» не красное и не двигает окно,
//      а переполнение по-прежнему ошибка;
//   4) стан сам прокручивается к курсору и последней введённой ноте;
//   5) данные и сохранение не изменились: девять нот подряд сохраняются как есть.
//
// jsdom не считает раскладку, поэтому высоты проверяются разбором CSS-правил
// (кламп считается по формуле), а прокрутка — на подставленных метриках:
// математика та же, что в браузере.
//
// Запуск: node dev/tests/b12-tab-editor-layout-0875.js

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
function cssBlock(selector) {
  const at = HTML.indexOf('\n' + selector);
  assert(at >= 0, 'CSS-правило найдено: ' + selector);
  const open = HTML.indexOf('{', at);
  const close = HTML.indexOf('}', open);
  return HTML.slice(open, close + 1);
}
const px = (rem) => Math.round(parseFloat(rem) * 16);

// =====================================================================
// 1. Высота стана
// =====================================================================
{
  assert(HTML.includes('ver 0.878'), 'STRUCHORD.html header is ver 0.878');
  assert(SW.includes("const CACHE_NAME = 'struchord-v878';"), 'sw.js CACHE_NAME is struchord-v878');
  assert(README.includes('`0.878`'), 'README header is 0.878');
  assert(ROADMAP.includes('**0.878**'), 'ROADMAP header is 0.878');

  const vars = cssBlock('.tab-insert-editor {');
  const m = /--tab-staff-min: clamp\(([\d.]+)rem, ([\d.]+)vh, ([\d.]+)rem\);/.exec(vars);
  assert(m, 'минимум стана задан клампом от rem и vh');
  const [, minRem, vh, maxRem] = m;
  const staffMin = (viewportH) =>
    Math.max(px(minRem), Math.min(Math.round((viewportH * parseFloat(vh)) / 100), px(maxRem)));

  // Приёмка: на 680 px — не меньше 220 px, на высоких экранах заметно больше.
  const measured = {
    '1024x768': staffMin(768),
    '1366x680': staffMin(680),
    '1440x800': staffMin(800),
    '1280x900': staffMin(900),
    '390x844': staffMin(844),
  };
  console.log('      минимум высоты стана:', JSON.stringify(measured));
  assert(measured['1366x680'] >= 220, 'на 1366×680 стан не ниже 220 px, а именно ' + measured['1366x680']);
  assert(measured['1280x900'] >= measured['1366x680'] + 40, 'на 900 px стан заметно выше, чем на 680 px');
  assert(measured['1440x800'] >= 250, 'на 1440×800 стан не ниже 250 px');
  assert(measured['1024x768'] >= 240 && measured['390x844'] >= 260, 'планшет и телефон получают свой минимум');

  // Ни один медиазапрос не опускает минимум стана числом rem.
  const numericMins = HTML.match(/\.tab-at-host \{\s*min-height: [\d.]+rem/g) || [];
  assert.strictEqual(numericMins.length, 0,
    'у .tab-at-host нет минимумов «числом», которые перебивали бы кламп: ' + JSON.stringify(numericMins));

  const host = cssBlock('.tab-at-host {');
  assert(host.includes('flex: 1 1 auto;'), 'стан растёт и забирает свободное место');
  assert(host.includes('min-height: var(--tab-staff-min);'), 'стан держит минимум из переменной');
  assert(!host.includes('max-height'), 'потолка высоты у стана больше нет');
  assert(host.includes('overflow-y: auto;'), 'длинная вставка прокручивается внутри стана');

  const surface = cssBlock('.tab-editor-surface {');
  assert(surface.includes('flex: 1 1 auto;'), 'поверхность стана растёт вместе с ним');
  assert(surface.includes('min-height: calc(var(--tab-staff-min) + 2rem);'), 'минимум поверхности = шапка + стан');

  // Каждый медиазапрос, который задаёт минимум поверхности, считает его от стана.
  const surfaceMins = HTML.match(/\.tab-editor-surface \{ min-height: [^;]+;/g) || [];
  for (const rule of surfaceMins) {
    assert(!/min-height: [\d.]+rem/.test(rule), 'минимум поверхности не занижен числом: ' + rule);
  }
  ok('Высота стана: ' + measured['1366x680'] + ' px на 680, ' + measured['1280x900'] + ' px на 900, роста по flex');
}

// =====================================================================
// 2. Компактная палитра
// =====================================================================
{
  const techStatus = cssBlock('.tab-tech-status {');
  assert(techStatus.includes('min-height: 0;'), 'строка приёмов больше не держит пустое место');
  assert(HTML.includes('.tab-tech-status:empty { display: none; }'), 'пустая строка приёмов не показывается');

  // Постоянной подсказки в разметке нет — она в tooltip и в «?».
  assert(HTML.includes("title=\"Приём ставится на ноту под курсором, а при выделении — сразу на все выбранные ноты. Открыть или свернуть секцию\""),
    'подсказка про приёмы живёт в tooltip секции');
  assert(HTML.includes("['Приём ставится на ноту под курсором (при выделении — на все выбранные)', 'L H P …']"),
    'подсказка про приёмы есть в шпаргалке «?»');
  assert(!HTML.includes("tabTechLabel(n)\n    : 'Приём ставится"), 'в статусе приёмов нет постоянного текста');

  // Панель ладов — одна строка.
  const desktop = HTML.slice(
    HTML.indexOf("@media (min-width: 64.0625rem) and (hover: hover) and (pointer: fine) {"),
    HTML.indexOf('@media (max-height: 760px) {'),
  );
  assert(desktop.includes('.tab-tools-row--frets { flex-wrap: nowrap; }'), 'панель ладов не переносится');
  assert(desktop.includes(".tab-tools-row--frets .tab-fret-pad { flex: 1 1 0; min-width: 0; width: auto; }"),
    'гриф ладов не выдавливает переключатель на отдельную строку');
  assert(desktop.includes('.tab-group-toggle {'), 'у секций палитры есть переключатель');
  assert(desktop.includes('.tab-palette-group[data-tab-group][data-open="false"] > .tab-tools-row'),
    'свёрнутая секция прячет свои кнопки');
  assert(desktop.includes('.tab-palette-group--tech > [data-tab-tech-params],'),
    'параметры приёма уходят на свою строку только когда секция открыта');

  const toggleFallback = HTML.indexOf('.tab-group-toggle { display: none; }');
  const toggleDesktop = HTML.indexOf('@media (min-width: 64.0625rem) and (hover: hover) and (pointer: fine) {');
  assert(toggleFallback > 0 && toggleFallback < toggleDesktop, 'на тач-раскладке переключателя секций нет');

  assert(HTML.includes('const TAB_PALETTE_OPEN_DEFAULT = { dur: true, edit: false, nav: false, tech: false };'),
    'вторичные секции свёрнуты по умолчанию, «Длительности» открыты');
  ok('Палитра: секции-переключатели, вторичные свёрнуты, лады одной строкой, пустое место у «Приёмов» убрано');
}

// =====================================================================
// 3. Статус «не заполнен»: не красное, не двигает окно
// =====================================================================
{
  const slot = cssBlock('.tab-status-slot {');
  assert(slot.includes('min-height: var(--tab-status-slot);'), 'место под строку статуса зарезервировано');
  assert(HTML.includes('.tab-status-slot.is-compact {\n  height: var(--tab-status-slot);\n  overflow: hidden;\n}'),
    'в обычном состоянии полоса фиксируется по высоте');
  assert(HTML.includes('.tab-gp-error.is-incomplete {\n  color: var(--color-text-secondary);\n  font-weight: 500;\n}'),
    '«не заполнен» — серый, а не красный');
  assert(HTML.includes('.tab-status-slot.is-compact .tab-gp-error-msg {'), 'длинный текст не рвёт строку');
  ok('Статус: полоса фиксированной высоты, «не заполнен» нейтральным цветом');
}

// =====================================================================
// Живой стенд
// =====================================================================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
        { measureText: () => ({ width: 10 }), createLinearGradient: () => ({ addColorStop() {} }) },
        { get: (o, k) => (k in o ? o[k] : () => {}) },
      );
      w.URL.createObjectURL = () => 'blob:layout-test';
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

function songOf(notes = []) {
  return {
    schemaVersion: 9, metadata: { title: 'layout 0875', artist: 'STRUCHORD' }, bpm: 120, globalTimeSig: '4/4',
    globalKey: 'C', keyMode: 'manual', tuning: 'e-std', tuningNotes: null, parts: [],
    sections: [{
      id: 101, type: 'Verse', repeat: 1, squares: [
        { id: 102, type: 'tab', beats: 4, customBeats: null, repeat: 1, events: [], notes },
      ],
    }],
  };
}

async function boot(notes) {
  const ctx = makeDom();
  const { w } = ctx;
  await sleep(250);
  w.localStorage.setItem('struchord_songs', JSON.stringify([songOf(notes)]));
  w.loadSong(0);
  await sleep(200);
  w.localStorage.removeItem('struchord-tab-palette');
  return ctx;
}

async function open(ctx) {
  const { w } = ctx;
  w.openTabInsertEditor(101, 102);
  await sleep(350);
  ctx.editor = w.eval('tabInsertEditorState');
  ctx.group = (key) => ctx.doc.querySelector(`[data-tab-group="${key}"]`);
  ctx.toggle = (key) => ctx.doc.querySelector(`[data-tab-group-toggle="${key}"]`);
}

async function main() {
  // -------------------------------------------------------------------
  // 4. Секции палитры: свёрнуты по умолчанию, переключаются, помнят выбор
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    await open(ctx);
    const { w, doc } = ctx;
    const titles = ['dur', 'edit', 'nav', 'tech'].map((k) => ctx.group(k).querySelector('.tab-group-title').textContent.trim());
    assert.strictEqual(JSON.stringify(titles), JSON.stringify(['Длительности', 'Правка', 'Навигация', 'Приёмы']),
      'названия секций не изменились');

    assert.strictEqual(ctx.group('dur').getAttribute('data-open'), 'true', '«Длительности» открыты');
    for (const key of ['edit', 'nav', 'tech']) {
      assert.strictEqual(ctx.group(key).getAttribute('data-open'), 'false', `«${key}» свёрнута по умолчанию`);
      assert.strictEqual(ctx.toggle(key).getAttribute('aria-expanded'), 'false', `aria-expanded у «${key}» = false`);
    }
    assert.strictEqual(w.eval('JSON.stringify(tabPaletteState())'), '{"dur":true,"edit":false,"nav":false,"tech":false}',
      'состояние по умолчанию: открыты только длительности');

    ctx.toggle('tech').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(120);
    assert.strictEqual(ctx.group('tech').getAttribute('data-open'), 'true', 'клик открыл «Приёмы»');
    assert.strictEqual(ctx.toggle('tech').getAttribute('aria-expanded'), 'true', 'aria-expanded обновился');
    assert.strictEqual(w.localStorage.getItem('struchord-tab-palette'), '{"dur":true,"edit":false,"nav":false,"tech":true}',
      'выбор владельца сохранён');
    // Кнопки приёмов на месте и работают.
    const techBtn = doc.querySelector('[data-tab-tech="pm"]');
    assert(techBtn, 'кнопка «Palm Mute» есть в разметке');

    doc.querySelector('[data-tab-cancel]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(200);
    await open(ctx);
    assert.strictEqual(ctx.group('tech').getAttribute('data-open'), 'true', 'открытая секция пережила переоткрытие редактора');
    ctx.toggle('tech').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(120);
    assert.strictEqual(ctx.group('tech').getAttribute('data-open'), 'false', 'повторный клик сворачивает секцию');
    ok('Секции палитры: вторичные свёрнуты, переключаются, помнят выбор, названия прежние');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 5. Статус: «не заполнен» серый и в фиксированной полосе; переполнение — нет
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    await open(ctx);
    const { w, doc } = ctx;
    const status = doc.querySelector('[data-tab-gp-error]');
    const slot = doc.querySelector('.tab-status-slot');

    w.tabGpPut(ctx.editor, 5);
    await sleep(180);
    assert.strictEqual(status.hidden, false, 'недобор долей показан');
    assert(/не заполнен/.test(status.textContent), 'текст про недобор на месте');
    assert(status.classList.contains('is-incomplete'), 'класс «обычное состояние» выставлен');
    assert(!status.classList.contains('is-notice'), 'это не служебное уведомление');
    assert(slot.classList.contains('is-compact'), 'полоса зафиксирована по высоте');
    assert.strictEqual(slot.getAttribute('aria-label'), null, 'разметка полосы не менялась');
    assert(doc.querySelector('[data-tab-gp-fix="pad"]'), 'кнопка «Заполнить паузами» осталась');

    // Полный такт — статус исчезает, полоса остаётся на месте (место зарезервировано).
    for (let i = 0; i < 3; i++) { w.tabGpMove(ctx.editor, 1); await sleep(30); w.tabGpPut(ctx.editor, 3); await sleep(30); }
    await sleep(120);
    assert.strictEqual(status.hidden, true, 'полный такт не показывает статус');
    // Полоса остаётся на месте за счёт min-height из переменной — высота окна
    // не меняется ни при появлении, ни при исчезновении строки.
    assert(slot.classList.contains('is-compact') === false, 'пустая полоса держится на min-height, а не на фиксации');

    // Переполнение — настоящая ошибка: красный цвет и свободная высота.
    w.eval('tabInsertEditorState.gpBars[0].push({ dur: 4, notes: [{ string: 0, fret: 1 }] })');
    w.eval('tabGpSync(tabInsertEditorState)');
    await sleep(250);
    const over = doc.querySelector('[data-tab-gp-error]');
    assert(/переполнен/.test(over.textContent), 'переполнение показано');
    assert(!over.classList.contains('is-incomplete'), 'переполнение не считается обычным состоянием');
    assert(!doc.querySelector('.tab-status-slot').classList.contains('is-compact'), 'для ошибки полоса не фиксируется');
    ok('Статус: «не заполнен» — серый в фиксированной полосе, переполнение остаётся ошибкой');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 6. Автопрокрутка стана к курсору
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    await open(ctx);
    const { w, doc } = ctx;
    const host = doc.querySelector('.tab-at-host');
    const dot = host.querySelector('.tab-at-cursor-dot');
    // В jsdom alphaTab не рисует — метрики стана и рамки курсора подставляем те,
    // что даёт браузер: содержимое 446 px в окне 220 px.
    dot.hidden = false;
    const metrics = (scrollTop, dotTop, view, content) => {
      Object.defineProperty(host, 'clientHeight', { configurable: true, value: view });
      Object.defineProperty(host, 'scrollHeight', { configurable: true, value: content });
      Object.defineProperty(dot, 'offsetHeight', { configurable: true, value: 24 });
      Object.defineProperty(dot, 'offsetTop', { configurable: true, value: dotTop });
      host.scrollTop = scrollTop;
    };

    metrics(0, 400, 220, 446);
    assert.strictEqual(w.eval('tabAtScrollCursorIntoView()'), true, 'курсор ниже окна — прокрутка нужна');
    assert.strictEqual(host.scrollTop, 216, 'низ курсора с отступом 12 px попал в видимую область');

    metrics(216, 100, 220, 446);
    assert.strictEqual(w.eval('tabAtScrollCursorIntoView()'), true, 'курсор выше окна — прокрутка вверх');
    assert.strictEqual(host.scrollTop, 88, 'верх курсора с отступом попал в видимую область');

    metrics(100, 120, 220, 446);
    assert.strictEqual(w.eval('tabAtScrollCursorIntoView()'), false, 'видимый курсор не трогает прокрутку');
    assert.strictEqual(host.scrollTop, 100, 'scrollTop не изменился');

    metrics(400, 20, 220, 446);
    assert.strictEqual(w.eval('tabAtScrollCursorIntoView()'), true, 'прокрутка к началу');
    assert.strictEqual(host.scrollTop, 8, 'верх курсора встаёт с отступом 12 px от края');
    metrics(400, 0, 220, 446);
    assert.strictEqual(w.eval('tabAtScrollCursorIntoView()'), true, 'самый верх стана');
    assert.strictEqual(host.scrollTop, 0, 'scrollTop не уходит в минус');

    metrics(0, 10, 220, 200);
    assert.strictEqual(w.eval('tabAtScrollCursorIntoView()'), false, 'содержимое влезает — прокрутки нет');

    // Ввод девяти нот подряд: курсор уезжает в третий такт, стан обязан за ним.
    metrics(0, 400, 220, 446);
    for (let i = 0; i < 9; i++) {
      w.tabGpPut(ctx.editor, i + 1);
      await sleep(70);
      w.tabGpMove(ctx.editor, 1);
      await sleep(70);
    }
    assert.strictEqual(ctx.editor.gpBars.length >= 3, true, 'девять нот занимают три такта');
    const last = ctx.editor.gpBars.flat().flatMap((g) => g.notes).map((n) => n.fret);
    assert.strictEqual(JSON.stringify(last.slice(0, 9)), JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9]),
      'все девять нот лежат по порядку');
    ok('Автопрокрутка: вниз, вверх, без дёрганья, без минуса; девять нот уводят курсор в третий такт');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 7. Приёмы: пустая строка не занимает место, у ноты показывает приём
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    await open(ctx);
    const { w, doc } = ctx;
    ctx.toggle('tech').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(120);
    const statusEl = doc.querySelector('[data-tab-tech-status]');
    assert.strictEqual(statusEl.textContent.trim(), '', 'без выбранной ноты строка приёмов пуста');
    assert.strictEqual(statusEl.children.length, 0, 'в строке нет постоянной подсказки');

    w.tabGpPut(ctx.editor, 3);
    await sleep(180);
    assert.strictEqual(statusEl.textContent.trim(), '', 'простая нота без приёмов строку не занимает');
    doc.querySelector('[data-tab-tech="pm"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(200);
    assert(/P\.M\./.test(statusEl.textContent), 'появился приём — строка сказала о нём: ' + statusEl.textContent);
    ok('Приёмы: постоянной подсказки нет, строка появляется только по делу');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 8. Данные и сохранение не изменились
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    await open(ctx);
    const { w, doc } = ctx;
    for (let i = 0; i < 9; i++) {
      w.tabGpPut(ctx.editor, i + 1);
      await sleep(60);
      if (i < 8) { w.tabGpMove(ctx.editor, 1); await sleep(60); }
    }
    doc.querySelector('[data-tab-apply]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(300);
    const sq = (w.tabInsertTarget(101, 102) || {}).sq;
    assert(sq, 'квадрат на месте');
    const notes = sq.notes.filter((n) => !n.pause);
    assert.strictEqual(notes.length, 9, 'все девять нот сохранены');
    assert.strictEqual(JSON.stringify(notes.map((n) => n.fret)), JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9]),
      'лады и порядок нот не изменились');
    assert.strictEqual(Math.round(sq.beats / 4), 3, 'длина — три такта, лишнего пустого такта нет');
    assert.strictEqual(JSON.stringify(sq).includes('manualBar'), false, 'служебные пометки в песню не попали');
    assert.deepStrictEqual(ctx.errors, [], 'jsdom без ошибок');
    ok('Данные: девять нот подряд сохраняются как раньше, без лишнего такта и служебных полей');
    ctx.dom.window.close();
  }

  console.log(`\n${passed} groups passed, 0 failed`);
}

main().catch((err) => {
  console.error('\nFAILED: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});

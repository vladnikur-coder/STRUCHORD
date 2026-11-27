#!/usr/bin/env node
'use strict';
// 0.874 · Окно редактора таб-вставки: высота стана, панель инструментов,
// строка статуса, панель ладов 0–9 на компьютере и подсказка пустого стана.
//
// jsdom не считает раскладку, поэтому проверяются три вещи:
//   1) CSS-инварианты, на которых держится исправление (ограничение стана и
//      его прокрутка, несжимаемые панели, зарезервированный слот статуса,
//      компактный режим низких экранов, настольная панель ладов);
//   2) живое поведение в настоящем редакторе: 10 кнопок ладов ставят ноты,
//      переключатель сворачивает панель и помнит выбор, подсказка пустого
//      стана появляется и исчезает;
//   3) что данные не поехали: в песню уходят те же ноты, что и раньше.
//
// Запуск: node dev/tests/b12-tab-editor-layout-0874.js

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
  // Ищем правило в начале строки: те же селекторы встречаются в медиазапросах.
  const at = HTML.indexOf('\n' + selector);
  assert(at >= 0, 'CSS-правило найдено: ' + selector);
  const open = HTML.indexOf('{', at);
  const close = HTML.indexOf('}', open);
  return HTML.slice(open, close + 1);
}

// =====================================================================
// 1. CSS-инварианты раскладки
// =====================================================================
{
  assert(HTML.includes('ver 0.878'), 'STRUCHORD.html header is ver 0.878');
  assert(SW.includes("const CACHE_NAME = 'struchord-v878';"), 'sw.js CACHE_NAME is struchord-v878');
  assert(README.includes('`0.878`'), 'README header is 0.878');
  assert(ROADMAP.includes('**0.878**'), 'ROADMAP header is 0.878');

  // 0.875: минимум стана поднят до 220 px, потолка больше нет — стан растёт.
  const vars = cssBlock('.tab-insert-editor {');
  assert(vars.includes('--tab-staff-min: clamp(13.75rem, 32vh, 34rem);'), 'минимум стана задан клампом от 220 px');
  assert(vars.includes('--tab-status-slot:'), 'высота строки статуса задана переменной');

  const host = cssBlock('.tab-at-host {');
  assert(host.includes('overflow-y: auto;'), 'стан прокручивается сам');
  assert(host.includes('flex: 1 1 auto;'), 'стан растёт по свободному месту');
  assert(host.includes('min-height: var(--tab-staff-min);'), 'стан не схлопывается в ноль');

  const surface = cssBlock('.tab-editor-surface {');
  assert(surface.includes('flex: 1 1 auto;'), 'поверхность стана забирает свободное место');
  assert(surface.includes('min-height: calc(var(--tab-staff-min) + 2rem);'), 'минимум поверхности считается от стана');

  for (const [selector, label] of [
    ['.tab-palette {', 'палитра'],
    ['.tab-palette-top-band {', 'верхняя полоса палитры'],
    ['.tab-palette-group {', 'группа палитры'],
    ['.tab-tools-row {', 'строка инструментов'],
  ]) {
    assert(cssBlock(selector).includes('flex: 0 0 auto;'),
      `${label}: не сжимается в полоску (flex: 0 0 auto)`);
  }

  const slot = cssBlock('.tab-status-slot {');
  assert(slot.includes('min-height: var(--tab-status-slot);'), 'место под строку статуса зарезервировано');
  assert(slot.includes('max-height:'), 'длинный статус не растягивает окно без предела');
  assert(HTML.includes('<div class="tab-status-slot">'), 'слот статуса есть в разметке');

  assert(HTML.includes('@media (max-height: 760px) {'), 'есть компактный режим низких экранов');
  const compact = HTML.slice(HTML.indexOf('@media (max-height: 760px) {'));
  assert(!compact.includes('--tab-staff-min:'), 'в компактном режиме минимум стана не понижается');
  assert(compact.includes('.tab-insert-editor .tab-tool { min-width: 1.55rem; height: 1.6rem; }'),
    'в компактном режиме кнопки инструментов меньше');

  // Настольная панель ладов: правило показа идёт ПОСЛЕ fallback-скрытия.
  const hideAt = HTML.indexOf('.tab-fret-toggle { display: none; }');
  const desktopAt = HTML.indexOf('@media (min-width: 64.0625rem) and (hover: hover) and (pointer: fine) {');
  assert(hideAt > 0 && desktopAt > hideAt, 'показ переключателя ладов перекрывает fallback-скрытие');
  const desktop = HTML.slice(desktopAt, HTML.indexOf('.tab-fret-key { min-height: 1.9rem;', desktopAt));
  assert(desktop.includes('display: flex;'), 'на компьютере панель ладов показана');
  assert(desktop.includes('.tab-tools-row--frets[data-collapsed="true"] .tab-fret-pad { display: none; }'),
    'свёрнутая панель ладов скрывает клавиши');
  assert(desktop.includes('.tab-fret-toggle {'), 'у панели ладов есть переключатель');

  // 0.876: подсказка «Нажмите цифру на клавиатуре…» убрана по просьбе владельца.
  assert(!HTML.includes('tab-at-empty-hint'), 'разметки подсказки пустого стана нет');
  assert(!HTML.includes('Нажмите цифру на клавиатуре, чтобы поставить ноту'), 'текста подсказки нет');
  assert(!HTML.includes('tabSyncEmptyHint'), 'функции подсказки нет');
  ok('CSS 0.874: стан с клампом и прокруткой, панели не сжимаются, слот статуса, компактный режим, панель ладов');
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
      // GP-режим: tabAtSupported() смотрит на ResizeObserver/FontFace/document.fonts.
      if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.FontFace = class { constructor() {} load() { return Promise.resolve(this); } };
      if (!w.document.fonts) w.document.fonts = { add() {}, check: () => true, ready: Promise.resolve(), forEach() {} };
    },
  });
  return { dom, w: dom.window, doc: dom.window.document, errors };
}

function songOf() {
  return {
    schemaVersion: 9, metadata: { title: 'layout 0874', artist: 'STRUCHORD' }, bpm: 120, globalTimeSig: '4/4',
    globalKey: 'C', keyMode: 'manual', tuning: 'e-std', tuningNotes: null, parts: [],
    sections: [{
      id: 101, type: 'Verse', repeat: 1, squares: [
        { id: 102, type: 'tab', beats: 4, customBeats: null, repeat: 1, events: [], notes: [] },
        { id: 103, type: 'tab', beats: 4, customBeats: null, repeat: 1, events: [], notes: [{ start: 0, dur: 1, string: 0, fret: 3 }] },
      ],
    }],
  };
}

async function boot() {
  const ctx = makeDom();
  const { w } = ctx;
  await sleep(250);
  w.localStorage.setItem('struchord_songs', JSON.stringify([songOf()]));
  w.loadSong(0);
  await sleep(200);
  w.localStorage.removeItem('struchord-tab-fret-pad');
  return ctx;
}

async function open(ctx, sqId = 102) {
  const { w } = ctx;
  w.openTabInsertEditor(101, sqId);
  await sleep(350);
  ctx.editor = w.eval('tabInsertEditorState');
  ctx.row = () => ctx.doc.querySelector('[data-tab-fret-row]');
  ctx.toggle = () => ctx.doc.querySelector('[data-tab-fret-toggle]');
}

async function main() {
  // -------------------------------------------------------------------
  // 2. Панель ладов 0–9 на компьютере: видны все цифры, клик ставит ноту
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    await open(ctx);
    const { w, doc } = ctx;
    const keys = doc.querySelectorAll('.tab-fret-pad [data-tab-digit]');
    assert.strictEqual(keys.length, 10, 'в панели ладов все цифры 0–9');
    assert.strictEqual(JSON.stringify(Array.from(keys).map((k) => k.getAttribute('data-tab-digit'))),
      JSON.stringify(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']), 'цифры идут по порядку');
    assert(ctx.row() && ctx.row().getAttribute('data-collapsed') === 'false', 'по умолчанию панель развёрнута');
    assert(ctx.toggle().getAttribute('aria-expanded') === 'true', 'переключатель говорит «развёрнуто»');

    // Клик по цифре ставит ноту с этим ладом — данные и ввод не изменились.
    doc.querySelector('[data-tab-digit="7"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(150);
    const barNotes = ctx.editor.gpBars.flatMap((bar) => bar).flatMap((g) => g.notes);
    assert.strictEqual(barNotes.length, 1, 'цифра поставила одну ноту');
    assert.strictEqual(barNotes[0].fret, 7, 'лад взят ровно из нажатой цифры');
    assert.strictEqual(barNotes[0].string, 0, 'струна — текущая струна курсора');
    ok('Панель ладов: 10 кнопок, клик ставит ноту ровно с этим ладом');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 3. Сворачивание панели: состояние и память между открытиями
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    await open(ctx);
    const { w, doc } = ctx;
    ctx.toggle().dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(120);
    assert.strictEqual(ctx.row().getAttribute('data-collapsed'), 'true', 'переключатель свернул панель');
    assert.strictEqual(ctx.toggle().getAttribute('aria-expanded'), 'false', 'aria-expanded обновился');
    assert.strictEqual(w.localStorage.getItem('struchord-tab-fret-pad'), '0', 'выбор сохранён');
    assert(doc.querySelectorAll('.tab-fret-pad [data-tab-digit]').length === 10,
      'клавиши остались в DOM — прячет их CSS');

    // Закрыть и открыть снова: выбор владельца помнится.
    doc.querySelector('[data-tab-cancel]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(200);
    await open(ctx, 103);
    assert.strictEqual(ctx.row().getAttribute('data-collapsed'), 'true', 'свёрнутость пережила переоткрытие');

    ctx.toggle().dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(120);
    assert.strictEqual(ctx.row().getAttribute('data-collapsed'), 'false', 'повторный клик разворачивает панель');
    assert.strictEqual(w.localStorage.getItem('struchord-tab-fret-pad'), '1', 'развёрнутость тоже запомнена');
    ok('Переключатель ладов: сворачивает, помнит выбор между открытиями, возвращается в развёрнутый вид');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 4. Подсказки в пустом стане больше нет (0.876, просьба владельца)
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    await open(ctx);
    const { w } = ctx;
    assert.strictEqual(ctx.doc.querySelector('[data-tab-empty-hint]'), null, 'узла подсказки в редакторе нет');
    // Пустая вставка работает как раньше: цифра ставит ноту.
    w.tabGpPut(ctx.editor, 5);
    await sleep(150);
    assert.strictEqual(ctx.editor.gpBars[0].flatMap((g) => g.notes).length, 1, 'ввод с клавиатуры не затронут');
    ok('Пустой стан: подсказки-надписи нет, ввод ноты работает');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 5. Слот статуса: строка живёт в зарезервированном месте
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    await open(ctx);
    const { w, doc } = ctx;
    const slot = doc.querySelector('.tab-status-slot');
    const status = doc.querySelector('[data-tab-gp-error]');
    assert(slot && slot.contains(status), 'строка статуса внутри слота');
    assert.strictEqual(status.hidden, true, 'пустой статус скрыт');

    // Недописанный такт даёт строку «Такт N: M из K» — она обязана лечь в слот,
    // а не добавить новую строку телу окна.
    w.tabGpPut(ctx.editor, 3);
    await sleep(200);
    status.hidden = false;
    const before = slot.childElementCount;
    assert.strictEqual(before, 1, 'в слоте ровно одна строка статуса — высота места не меняется');
    assert(slot.className.startsWith('tab-status-slot'), 'слот не перерисовывается вместе со статусом');
    ok('Строка статуса: постоянный слот, появление текста не меняет состав тела окна');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 6. Данные не поехали: сохранение после ввода с панели ладов
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    await open(ctx);
    const { w, doc } = ctx;
    for (const [digit, beat] of [[3, 0], [5, 1], [7, 2], [2, 3]]) {
      w.tabGpPut(ctx.editor, digit);
      await sleep(60);
      if (beat < 3) { w.tabGpMove(ctx.editor, 1); await sleep(60); }
    }
    doc.querySelector('[data-tab-apply]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await sleep(300);
    const sq = (w.tabInsertTarget(101, 102) || {}).sq;
    assert(sq, 'квадрат на месте');
    assert.strictEqual(sq.beats, 4, 'длина та же — один такт');
    assert.strictEqual(JSON.stringify(sq.notes.map((n) => [n.start, n.fret])), JSON.stringify([[0, 3], [1, 5], [2, 7], [3, 2]]),
      'ноты и их позиции не изменились от новой панели');
    assert.strictEqual(JSON.stringify(sq).includes('manualBar'), false, 'служебные пометки в песню не попали');
    assert.deepStrictEqual(ctx.errors, [], 'jsdom без ошибок');
    ok('Данные: ввод с новой панели сохраняется как раньше — те же ноты, та же длина, без служебных полей');
    ctx.dom.window.close();
  }

  console.log(`\n${passed} groups passed, 0 failed`);
}

main().catch((err) => {
  console.error('\nFAILED: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});

#!/usr/bin/env node
'use strict';
// 0.873 · таб-вставка: пустой хвост при «Применить» убирается.
//
// Стрелка → на последней доле добавляет настоящий такт (решение 0.694).
// Пользователь, набравший четыре ноты, получал «2 такта» и не понимал,
// откуда второй. Теперь пустые такты в конце вставки не пишутся в песню,
// рядом с полем «Длина» об этом коротко сказано, а такт, заведённый
// человеком («+ Такт», поле «Длина», открытая песня), остаётся.
//
// Стенд идёт через настоящий редактор: GP-режим включается, когда
// tabAtSupported() видит ResizeObserver/FontFace/document.fonts, поэтому
// в jsdom они подставлены (alphaTab в jsdom не рисует, но модель тактов
// строится тем же путём, что в браузере).
//
// Запуск: node dev/tests/b12-tab-insert-tail-0873.js

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

// =====================================================================
// 1. Статические инварианты
// =====================================================================
{
  assert(HTML.includes('ver 0.880'), 'STRUCHORD.html header is ver 0.880');
  assert(SW.includes("const CACHE_NAME = 'struchord-v880';"), 'sw.js CACHE_NAME is struchord-v880');
  assert(README.includes('`0.880`'), 'README header is 0.879');
  assert(ROADMAP.includes('**0.880**'), 'ROADMAP header is 0.879');

  assert(HTML.includes('function tabGpTrimTrailingEmptyBars(e) {'), 'хвост срезается отдельной функцией');
  assert(HTML.includes('function tabGpTrailingEmptyBars(e) {'), 'хвост считается и для подсказки');
  assert(HTML.includes('function tabGpLengthHintText(e) {'), 'текст подсказки у «Длины»');
  assert(HTML.includes('data-tab-length-hint'), 'подсказка есть в разметке редактора');
  assert(HTML.includes('if (editor.gpBars && tabGpTrimTrailingEmptyBars(editor)) tabGpSync(editor);'),
    '«Применить» срезает хвост ДО валидации и записи');
  assert(HTML.includes('return tabGpMarkManualBar(groups);'), 'такты из песни помечаются как заведённые человеком');
  assert(HTML.includes('e.gpBars.splice(e.gpCursor.bar, 0, tabGpMarkManualBar([tabGpBlank(e)]));'),
    '«+ Такт» помечает свой такт');
  ok('Статика 0.873: версии, срез хвоста до записи, ручные такты помечены, подсказка в разметке');
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
      w.URL.createObjectURL = () => 'blob:tail-test';
      w.URL.revokeObjectURL = () => {};
      w.HTMLAnchorElement.prototype.click = () => {};
      w.confirm = () => true;
      w.alert = () => {};
      w.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 8);
      // GP-режим редактора: tabAtSupported() смотрит на эти три вещи.
      if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.FontFace = class { constructor() {} load() { return Promise.resolve(this); } };
      if (!w.document.fonts) w.document.fonts = { add() {}, check: () => true, ready: Promise.resolve(), forEach() {} };
    },
  });
  return { dom, w: dom.window, doc: dom.window.document, errors };
}

function tabSquare(over) {
  return { id: 102, type: 'tab', beats: 4, customBeats: null, repeat: 1, events: [], notes: [], ...over };
}

function songOf(square) {
  return {
    schemaVersion: 9, metadata: { title: 'tail 0873', artist: 'STRUCHORD' }, bpm: 120, globalTimeSig: '4/4',
    globalKey: 'C', keyMode: 'manual', tuning: 'e-std', tuningNotes: null, parts: [],
    sections: [{ id: 101, type: 'Verse', repeat: 1, squares: [square] }],
  };
}

async function boot(square) {
  const ctx = makeDom();
  const { w } = ctx;
  await sleep(250);
  w.localStorage.setItem('struchord_songs', JSON.stringify([songOf(square)]));
  w.loadSong(0);
  await sleep(200);
  w.openTabInsertEditor(101, 102);
  await sleep(350);
  ctx.editor = w.eval('tabInsertEditorState');
  assert(ctx.editor && ctx.editor.gpBars, 'редактор открылся в режиме тактов (GP)');
  ctx.hint = () => ctx.doc.querySelector('[data-tab-length-hint]');
  ctx.apply = () => ctx.doc.querySelector('[data-tab-apply]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ctx.square = () => (w.tabInsertTarget(101, 102) || {}).sq || null;
  return ctx;
}

// Четыре четвертные ноты: цифра на доле, курсор уходит на следующую.
async function typeFourNotes(ctx) {
  const { w } = ctx;
  for (let i = 0; i < 4; i += 1) {
    w.tabGpPut(ctx.editor, i + 1);
    await sleep(60);
    if (i < 3) { w.tabGpMove(ctx.editor, 1); await sleep(60); }
  }
}

// Стрелка → идёт по долям такта, поэтому «дойти до пустого такта» —
// это несколько нажатий. Ждём, пока число тактов вырастет.
async function pushBar(ctx) {
  const { w, editor } = ctx;
  const before = editor.gpBars.length;
  for (let i = 0; i < 64 && editor.gpBars.length === before; i += 1) {
    w.tabGpMove(editor, 1);
    await sleep(35);
  }
  assert(editor.gpBars.length > before, 'стрелка → дошла до конца и добавила такт');
}

async function main() {
  // -------------------------------------------------------------------
  // 2. Четыре ноты и «→»: подсказка есть, сохраняется один такт
  // -------------------------------------------------------------------
  {
    const ctx = await boot(tabSquare({}));
    const { w, editor } = ctx;
    assert.strictEqual(ctx.hint().hidden, true, 'пока хвоста нет, подсказка скрыта');
    await typeFourNotes(ctx);
    assert.strictEqual(editor.gpBars.length, 1, 'четыре ноты уложились в один такт');
    w.tabGpMove(editor, 1);
    await sleep(150);
    assert.strictEqual(editor.gpBars.length, 2, 'стрелка → добавила второй такт');
    assert.strictEqual(editor.draft.beats, 8, 'длина черновика стала 2 такта');
    assert.strictEqual(ctx.hint().hidden, false, 'подсказка появилась сразу, без пересборки редактора');
    assert.strictEqual(ctx.hint().textContent, 'пустой такт в конце уберётся при сохранении', 'короткий текст подсказки');

    ctx.apply();
    await sleep(300);
    assert.strictEqual(ctx.doc.querySelector('.tab-insert-editor'), null, 'редактор закрылся по «Применить»');
    const square = ctx.square();
    assert.strictEqual(square.beats, 4, 'в песню записан один такт, а не два');
    assert.strictEqual(square.notes.length, 4, 'все четыре ноты на месте');
    assert.strictEqual(square.customBeats, null, 'длина квадрата не обзавелась customBeats');
    assert.strictEqual(JSON.stringify(square).includes('manualBar'), false,
      'служебная пометка «такт руки» в песню не попадает');
    assert.deepStrictEqual(ctx.errors, [], 'jsdom без ошибок');
    ok('4 ноты + «→»: подсказка появилась, «Применить» записал 1 такт с 4 нотами');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 3. Явный «+ Такт» сохраняется
  // -------------------------------------------------------------------
  {
    const ctx = await boot(tabSquare({}));
    const { w, editor } = ctx;
    w.tabGpInsert(editor, true);
    await sleep(150);
    assert.strictEqual(editor.gpBars.length, 2, '«+ Такт» добавил такт');
    assert.strictEqual(ctx.hint().hidden, true, 'явный такт не считается хвостом — подсказки нет');
    ctx.apply();
    await sleep(300);
    const square = ctx.square();
    assert.strictEqual(square.beats, 8, 'явно добавленный пустой такт сохранён');
    assert.strictEqual(square.notes.length, 0, 'нот нет — вставка пустая, но длинная');
    ok('«+ Такт»: пустой такт руки не срезается, в песне 2 такта');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 4. Пустая вставка: хвост из двух тактов → остаётся один
  // -------------------------------------------------------------------
  {
    const ctx = await boot(tabSquare({}));
    const { w, editor } = ctx;
    w.tabGpMove(editor, 1);
    await sleep(100);
    w.tabGpMove(editor, 1);
    await sleep(120);
    assert.strictEqual(editor.gpBars.length, 3, 'две стрелки → дали три такта');
    assert.strictEqual(ctx.hint().textContent, 'пустых тактов в конце: 2 — уберутся при сохранении',
      'подсказка называет число тактов');
    ctx.apply();
    await sleep(300);
    const square = ctx.square();
    assert.strictEqual(square.beats, 4, 'остался один такт — как у пустой вставки до 0.873');
    assert.strictEqual(square.notes.length, 0, 'пустая вставка осталась пустой');
    ok('Пустая вставка: хвост из двух тактов срезан до одного, пустая вставка ведёт себя как раньше');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 5. Пустой такт в середине не трогается
  // -------------------------------------------------------------------
  {
    const ctx = await boot(tabSquare({}));
    const { w, editor } = ctx;
    // Нота в первом такте → пустой такт «+ Такт» в середине → нота в третьем.
    w.tabGpPut(editor, 3);
    await sleep(60);
    await pushBar(ctx);
    w.tabGpInsert(editor, true);
    await sleep(120);
    w.tabGpMove(editor, 1);
    await sleep(80);
    w.tabGpPut(editor, 5);
    await sleep(120);
    assert.strictEqual(editor.gpBars.length, 3, 'нота, пустой такт в середине и нота');
    assert.strictEqual(ctx.hint().hidden, true, 'середина — не хвост, подсказки нет');
    ctx.apply();
    await sleep(300);
    const square = ctx.square();
    assert.strictEqual(square.beats, 12, 'все три такта сохранены');
    assert.strictEqual(JSON.stringify(square.notes.map((n) => [n.start, n.fret])), JSON.stringify([[0, 3], [8, 5]]),
      'ноты остались на своих долях вокруг пустого такта');
    ok('Пустой такт в середине: сохраняется, ноты вокруг него не сдвигаются');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 6. Ctrl+Z: отмена правки и отмена стрелки в редакторе
  // -------------------------------------------------------------------
  {
    const ctx = await boot(tabSquare({ notes: [{ start: 0, dur: 1, string: 0, fret: 5 }] }));
    const { w, editor } = ctx;
    for (let i = 0; i < 3; i += 1) {
      w.tabGpPut(editor, i + 2);
      await sleep(60);
      w.tabGpMove(editor, 1);
      await sleep(60);
    }
    await pushBar(ctx);
    assert.strictEqual(editor.gpBars.length, 2, 'ноты и лишний такт в черновике');
    assert.strictEqual(ctx.hint().hidden, false, 'подсказка видит хвост');
    // Черновая отмена снимает стрелку: подсказка обязана исчезнуть.
    w.eval('tabAtUndoDraft()');
    await sleep(150);
    assert.strictEqual(editor.gpBars.length, 1, 'Ctrl+Z в редакторе вернул один такт');
    assert.strictEqual(ctx.hint().hidden, true, 'подсказка ушла вместе с хвостом');
    await pushBar(ctx);
    ctx.apply();
    await sleep(300);
    let square = ctx.square();
    assert.strictEqual(square.beats, 4, 'после «Применить» один такт');
    assert.strictEqual(JSON.stringify(square.notes.map((n) => n.fret)), JSON.stringify([2, 3, 4]),
      'первая доля перезаписана новой нотой — в такте три ноты');
    w.undoEdit();
    await sleep(250);
    square = ctx.square();
    assert.strictEqual(square.beats, 4, 'Ctrl+Z вернул прежнюю длину');
    assert.strictEqual(JSON.stringify(square.notes.map((n) => n.fret)), JSON.stringify([5]),
      'Ctrl+Z вернул исходную ноту, а не четыре');
    w.redoEdit();
    await sleep(250);
    square = ctx.square();
    assert.strictEqual(JSON.stringify(square.notes.map((n) => n.fret)), JSON.stringify([2, 3, 4]),
      'Redo вернул правку целиком');
    ok('Ctrl+Z: черновая отмена убирает стрелку и подсказку, отмена/повтор правки песни работают');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 7. Старые песни: вставка на 2 такта остаётся двухтактной
  // -------------------------------------------------------------------
  {
    const ctx = await boot(tabSquare({ beats: 8, notes: [{ start: 0, dur: 1, string: 0, fret: 7 }] }));
    const { editor } = ctx;
    assert.strictEqual(editor.gpBars.length, 2, 'песня открылась двумя тактами');
    assert.strictEqual(editor.gpBars.every((bar) => bar.some((g) => g.manualBar)), true,
      'такты из песни помечены как заведённые человеком');
    assert.strictEqual(ctx.hint().hidden, true, 'у старой песни хвоста нет — подсказки нет');
    ctx.apply();
    await sleep(300);
    const square = ctx.square();
    assert.strictEqual(square.beats, 8, 'длина старой вставки не изменилась');
    assert.strictEqual(JSON.stringify(square.notes.map((n) => n.fret)), JSON.stringify([7]), 'нота на месте');
    ok('Старая песня: двухтактная вставка без правок сохраняется без изменений');
    ctx.dom.window.close();
  }

  console.log(`\n${passed} groups passed, 0 failed`);
}

main().catch((err) => {
  console.error('\nFAILED: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});

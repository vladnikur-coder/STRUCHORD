#!/usr/bin/env node
'use strict';
// 0.872 · B-39 Этап 3, волна 3.
//
// Три вещи, которых не хватало волне 2:
//   1. связка «вставка ↔ партия» — «В партию» и «Из партии» в редакторе вставки;
//   2. четыре строя укулеле живут в сохранённом файле и в экспорте
//      (до 0.872 санитайзер проверял укулельную партию по гитарным пресетам
//      и молча возвращал High G — Low G, баритон и Canadian терялись);
//   3. старые песни сохраняются бит-в-бит: база снята с 0.871
//      (dev/fixtures/b39-save-baseline-0872.json, генератор
//      dev/tools/gen-save-baseline-0872.js).
//
// Запуск: node dev/tests/b39-ukulele-stage3-0872.js

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const { JSDOM, VirtualConsole } = require('jsdom');
const codec = require('../gpx-bcfz-runtime');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const ROADMAP = fs.readFileSync(path.join(ROOT, 'ROADMAP.md'), 'utf8');
const BASELINE = JSON.parse(fs.readFileSync(path.join(ROOT, 'dev', 'fixtures', 'b39-save-baseline-0872.json'), 'utf8'));
const FIXTURES = Object.keys(BASELINE.fixtures);

let passed = 0;
function ok(msg) {
  passed++;
  console.log('  ok  ' + msg);
}
function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// =====================================================================
// 1. Статические инварианты 0.872
// =====================================================================
{
  assert(HTML.includes('ver 0.877'), 'STRUCHORD.html header is ver 0.877');
  assert(SW.includes("const CACHE_NAME = 'struchord-v877';"), 'sw.js CACHE_NAME is struchord-v877');
  assert(README.includes('`0.877`'), 'README header is 0.877');
  assert(ROADMAP.includes('**0.877**'), 'ROADMAP header is 0.877');

  assert(HTML.includes('function tabInsertMoveToPart(editor) {'), 'вставка → партия');
  assert(HTML.includes('function tabInsertFillFromPart(editor) {'), 'партия → вставка');
  assert(HTML.includes('data-tab-to-part'), 'кнопка «В партию» есть в панели редактора');
  assert(HTML.includes('data-tab-from-part'), 'кнопка «Из партии» есть в панели редактора');
  assert(HTML.includes('function tabInsertPartFor(domain) {'), 'партия ищется по домену вставки');
  assert(HTML.includes("tuning: uke ? domain.tuning : null,"), 'новая укулельная партия берёт строй вставки');
  assert(HTML.includes('const tuningTable = partTuningTable(inst);'),
    'санитайзер партий берёт таблицу строёв роли (укулеле — своя)');
  assert(!HTML.includes("const tuningTable = inst === 'bass' ? PART_BASS_TUNINGS : TUNER_TUNINGS;"),
    'гитарная таблица больше не применяется к укулеле');
  ok('Статика 0.872: версии, обе связи «вставка ↔ партия», таблица строёв роли в санитайзере');
}

// =====================================================================
// Живой стенд
// =====================================================================
function makeDom() {
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => { throw new Error('jsdom: ' + e.message); });
  return new JSDOM(HTML, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/?view=editor', virtualConsole: vc,
    beforeParse(w) {
      w.TextEncoder = TextEncoder;
      w.TextDecoder = TextDecoder;
      w.HTMLCanvasElement.prototype.getContext = () => new Proxy({ measureText: () => ({ width: 10 }), createLinearGradient: () => ({ addColorStop() {} }) }, { get: (o, k) => (k in o ? o[k] : () => {}) });
      w.URL.createObjectURL = () => 'blob:stage3-test';
      w.URL.revokeObjectURL = () => {};
      w.HTMLAnchorElement.prototype.click = () => {};
      w.confirm = () => true;
      w.alert = () => {};
      w.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 8);
    },
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot(song) {
  const dom = makeDom();
  const w = dom.window;
  await sleep(250);
  if (song) {
    w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
    w.loadSong(0);
    await sleep(200);
  }
  return { dom, w, doc: w.document };
}

function click(w, doc, selector) {
  const el = doc.querySelector(selector);
  assert(el, `кнопка ${selector} есть в редакторе`);
  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
}

function baseSong(title, sections, parts) {
  return {
    schemaVersion: 9, metadata: { title, artist: 'STRUCHORD' }, bpm: 120, globalTimeSig: '4/4',
    globalKey: 'C', keyMode: 'manual', tuning: 'e-std', tuningNotes: null,
    parts: parts || [], sections,
  };
}

function gpxXml(w) {
  const result = w.gpExportBytes();
  const files = codec.readContainer(Uint8Array.from(result.bytes)).entries;
  const file = files.find((f) => f.name === 'score.gpif');
  return new TextDecoder().decode(file.data || file.bytes);
}

async function main() {
  // -------------------------------------------------------------------
  // 2. «В партию»: ноты уходят в рулон, вставка из песни убирается
  // -------------------------------------------------------------------
  {
    const song = baseSong('stage3 to-part', [{
      id: 101, type: 'Verse', repeat: 1, squares: [
        { id: 102, type: 'tab', beats: 4, repeat: 1, events: [],
          notes: [{ start: 0, dur: 1, string: 0, fret: 3 }, { start: 2, dur: 1, string: 5, fret: 5 }] },
        { id: 103, type: 'tab', beats: 4, repeat: 1, events: [],
          notes: [{ start: 0, dur: 1, string: 0, fret: 0 }, { start: 2, dur: 1, string: 2, fret: 3 }],
          tabInstrument: 'ukulele', tabTuning: 'uke-high-g' },
        { id: 104, type: 'tab', beats: 4, repeat: 1, events: [],
          notes: [{ start: 0, dur: 0.5, string: 0, fret: 5 }], tabInstrument: 'ukulele', tabTuning: 'uke-baritone' },
      ],
    }]);
    const { dom, w, doc } = await boot(song);

    // Укулельная вставка на втором квадрате (offset 4).
    w.openTabInsertEditor(101, 103);
    await sleep(350);
    assert(doc.querySelector('.tab-insert-editor'), 'редактор вставки открылся');
    click(w, doc, '[data-tab-to-part]');
    await sleep(300);
    assert(!doc.querySelector('.tab-insert-editor'), 'после переноса редактор закрылся');

    const part = w.partActivePart();
    assert(part, 'партия создана');
    assert.strictEqual(part.instrument, 'ukulele', 'вставка ушла в укулельную партию');
    assert.strictEqual(part.tuning, 'uke-high-g', 'партия взяла строй вставки');
    assert.strictEqual(part.viewMode, 'tab', 'партия открывается табулатурой');
    const roll = (part.rolls && part.rolls['101']) || [];
    assert.strictEqual(JSON.stringify(roll.map((n) => [n.start, n.string, n.fret])), JSON.stringify([[4, 0, 0], [6, 2, 3]]),
      'ноты легли в рулон с абсолютной позицией секции (квадрат начинается на 4 доле)');
    assert.strictEqual(w.tabInsertTarget(101, 103), null, 'вставка-квадрат убрана из песни');
    assert(w.tabInsertTarget(101, 102), 'соседняя гитарная вставка осталась на месте');

    // Гитара: та же кнопка, но домен другой — партия гитарная, строй песни.
    w.openTabInsertEditor(101, 102);
    await sleep(350);
    click(w, doc, '[data-tab-to-part]');
    await sleep(300);
    const guitar = w.partActivePart();
    assert.strictEqual(guitar.instrument, 'guitar', 'гитарная вставка ушла в гитарную партию');
    assert.strictEqual(guitar.tuning, null, 'гитарная партия ссылается на строй песни');
    assert.strictEqual(guitar.id === part.id, false, 'это отдельная партия, а не укулельная');
    assert.strictEqual(JSON.stringify(((guitar.rolls || {})['101'] || []).map((n) => [n.start, n.string, n.fret])),
      JSON.stringify([[0, 0, 3], [2, 5, 5]]), 'шестиструнные ноты легли как есть');
    assert.strictEqual(w.tabInsertTarget(101, 102), null, 'гитарная вставка тоже убрана');

    // Укулеле другого строя: новая партия не смешивается со старой.
    w.openTabInsertEditor(101, 104);
    await sleep(350);
    click(w, doc, '[data-tab-to-part]');
    await sleep(300);
    const baritone = w.partActivePart();
    assert.strictEqual(baritone.tuning, 'uke-baritone', 'вставка другого строя создала свою партию');
    assert.notStrictEqual(baritone.id, part.id, 'партии не слились');
    ok('«В партию»: рулон с абсолютными позициями, строй вставки, разные домены и строи не смешиваются');
    dom.window.close();
  }

  // -------------------------------------------------------------------
  // 3. Ячеечная вставка → партия: квадрат остаётся, длительности не едут
  // -------------------------------------------------------------------
  {
    const song = baseSong('stage3 cell', [{
      id: 101, type: 'Verse', repeat: 1, squares: [
        { id: 102, type: 'tab', beats: 4, repeat: 1, events: [], notes: [{ start: 0, dur: 1, string: 0, fret: 1 }] },
        { id: 103, repeat: 1, events: [
          { chord: 'Am', span: 2, timeSig: null },
          { chord: '', span: 2, timeSig: null, isTab: true, tabNotes: [{ start: 0, dur: 0.5, string: 1, fret: 2 }],
            tabInstrument: 'ukulele', tabTuning: 'uke-low-g' },
        ] },
      ],
    }]);
    const { dom, w, doc } = await boot(song);
    w.openTabInsertEditor(101, 103, { ei: 1 });
    await sleep(350);
    assert(doc.querySelector('.tab-insert-editor'), 'редактор ячеечной вставки открылся');
    click(w, doc, '[data-tab-to-part]');
    await sleep(300);
    const part = w.partActivePart();
    const roll = (part.rolls || {})['101'] || [];
    assert.strictEqual(JSON.stringify(roll.map((n) => [n.start, n.dur, n.string, n.fret])), JSON.stringify([[6, 0.5, 1, 2]]),
      'нота ячейки встала на 4 (квадрат) + 2 (аккордовая ячейка) доли с той же длительностью');
    assert.strictEqual(w.tabInsertTarget(101, 103, 1), null, 'ячейка больше не таб-вставка (стала пустым слотом)');
    assert.strictEqual(part.tuning, 'uke-low-g', 'строй ячейки переехал в партию');
    ok('«В партию» из ячейки: абсолютная позиция по аккордовому окну, длительность сохранена');
    dom.window.close();
  }

  // -------------------------------------------------------------------
  // 4. «Из партии»: окно берётся, точка и триоль живы, лишнее — мимо
  // -------------------------------------------------------------------
  {
    const song = baseSong('stage3 from-part', [{
      id: 101, type: 'Verse', repeat: 1, squares: [
        { id: 102, type: 'tab', beats: 4, repeat: 1, events: [],
          notes: [], tabInstrument: 'ukulele', tabTuning: 'uke-baritone' },
        { id: 103, type: 'tab', beats: 4, repeat: 1, events: [], notes: [] },
      ],
    }], [{
      id: 'p-uke', name: 'Укулеле', instrument: 'ukulele', tuning: 'uke-baritone', viewMode: 'tab', visible: true,
      pitchRolls: {},
      rolls: {
        101: [
          { start: 0, dur: 1, string: 0, fret: 5 },
          { start: 1, dur: 0.5, string: 1, fret: 2, dots: 1, triplet: true },
          { start: 9, dur: 1, string: 3, fret: 1 },
        ],
      },
    }]);
    const { dom, w, doc } = await boot(song);
    w.openTabInsertEditor(101, 102);
    await sleep(350);
    click(w, doc, '[data-tab-from-part]');
    await sleep(250);
    click(w, doc, '[data-tab-apply]');
    await sleep(300);
    const target = w.tabInsertTarget(101, 102);
    assert(target, 'вставка на месте');
    assert.strictEqual(JSON.stringify(target.sq.notes.map((n) => [n.start, n.string, n.fret])), JSON.stringify([[0, 0, 5], [1, 1, 2]]),
      'в вставку попали только ноты из окна (нота на 9-й доле — мимо)');
    assert.strictEqual(target.sq.notes[1].dots, 1, 'точка сохранена');
    assert.strictEqual(target.sq.notes[1].triplet, true, 'триоль сохранена');
    assert.strictEqual(target.sq.tabTuning, 'uke-baritone', 'строй вставки остался баритоновым');

    // Гитара в песне без гитарной партии: переносить нечего, вставка не меняется.
    w.openTabInsertEditor(101, 103);
    await sleep(350);
    click(w, doc, '[data-tab-from-part]');
    await sleep(250);
    click(w, doc, '[data-tab-apply]');
    await sleep(250);
    const guitarTarget = w.tabInsertTarget(101, 103);
    assert(guitarTarget && guitarTarget.sq.notes.length === 0,
      'гитарная вставка не получила укулельные ноты');
    ok('«Из партии»: окно, точка и триоль, чужой домен не подмешивается');
    dom.window.close();
  }

  // -------------------------------------------------------------------
  // 5. Четыре строя: сохранение, перезагрузка и экспорт
  // -------------------------------------------------------------------
  {
    const tunings = [
      ['uke-high-g', '67 60 64 69'],
      ['uke-low-g', '55 60 64 69'],
      ['uke-baritone', '50 55 59 64'],
      ['uke-canadian', '69 62 66 71'],
    ];
    const { dom, w } = await boot(null);
    for (const [tuning, pitches] of tunings) {
      const song = baseSong('stage3 ' + tuning, [{
        id: 101, type: 'Verse', repeat: 1, squares: [
          { id: 102, type: 'tab', beats: 4, repeat: 1, events: [], notes: [{ start: 0, dur: 1, string: 0, fret: 0 }],
            tabInstrument: 'ukulele', tabTuning: tuning },
        ],
      }], [{
        id: 'p-uke', name: 'Укулеле', instrument: 'ukulele', tuning, viewMode: 'tab', visible: true,
        pitchRolls: {}, rolls: { 101: [{ start: 0, dur: 1, string: 0, fret: 3 }] },
      }]);
      w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
      w.loadSong(0);
      await sleep(180);
      assert.strictEqual(w.partActivePart().tuning, tuning, `${tuning}: строй не сброшен при загрузке`);
      const xml = gpxXml(w);
      assert(new RegExp('<Pitches>' + pitches + '</Pitches>').test(xml), `${tuning}: GPX пишет <Pitches>${pitches}</Pitches>`);

      const saving = w.saveCurrentSong();
      if (saving && typeof saving.then === 'function') await saving;
      await sleep(150);
      const stored = JSON.parse(w.localStorage.getItem('struchord_songs') || '[]');
      assert.strictEqual((stored[0].parts || [])[0].tuning, tuning, `${tuning}: строй записан в файл`);
      w.loadSong(0);
      await sleep(150);
      assert.strictEqual(w.partActivePart().tuning, tuning, `${tuning}: строй пережил перезагрузку файла`);
    }
    ok('Четыре строя укулеле: загрузка → GPX → сохранение → перезагрузка, ничего не откатывается в High G');
    dom.window.close();
  }

  // -------------------------------------------------------------------
  // 6. Старые песни: сохранение бит-в-бит с 0.871
  // -------------------------------------------------------------------
  {
    // Каждый фикстур — в свежем стенде: база снята так же, а «источник»
    // библиотеки от прошлой песни иначе включил бы диалог переименования.
    for (const fixture of FIXTURES) {
      const { dom, w } = await boot(null);
      const raw = fs.readFileSync(path.join(ROOT, 'dev', 'fixtures', fixture), 'utf8');
      const song = JSON.parse(raw);
      w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
      w.loadSong(0);
      await sleep(180);
      const saving = w.saveCurrentSong();
      if (saving && typeof saving.then === 'function') await saving;
      await sleep(150);
      const stored = JSON.parse(w.localStorage.getItem('struchord_songs') || '[]');
      assert(stored.length === 1, `${fixture}: песня сохранилась`);
      const saved = { ...stored[0] };
      delete saved.date; // метка сохранения по определению новая
      const text = JSON.stringify(saved);
      const expected = BASELINE.fixtures[fixture];
      assert.strictEqual(Buffer.byteLength(text, 'utf8'), expected.bytes, `${fixture}: та же длина, что на 0.871`);
      assert.strictEqual(sha256(text), expected.sha256, `${fixture}: те же байты, что на 0.871`);
      dom.window.close();
    }
    ok('Миграция: все пять фикстур сохраняются бит-в-бит с базой 0.871');
  }

  console.log(`\n${passed} groups passed, 0 failed`);
}

main().catch((err) => {
  console.error('\nFAILED: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});

#!/usr/bin/env node
/*
 * b12-global-view.js — B-12.11 этап 5 «Global View и дорожки».
 *
 * Проверяем:
 *  1. Полоса Global View: строки «Песня», дорожки, «Мастер»; заливка
 *     тактов с нотами; блок секции в мастер-строке.
 *  2. Клик по ячейке ставит курсор на дорожку и такт; протяжка выделяет
 *     такты; двойной клик по секции выделяет секцию.
 *  3. Критерий этапа: такты 5–8 второй дорожки на первую за три действия:
 *     протяжка, Ctrl+C, клик по такту первой дорожки + Ctrl+V.
 *  4. Вставить/удалить такт сдвигают рулоны всех дорожек.
 *  5. Окно EQ (три полосы) и окно «Строй дорожки» открываются из полосы.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'STRUCHORD.html'), 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(win) {
    win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    win.cancelAnimationFrame = (id) => clearTimeout(id);
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }),
      clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {},
      lineTo() {}, closePath() {}, save() {}, restore() {}, translate() {}, rotate() {},
      fillText() {}, strokeText() {}, setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return {
    currentTime: 0, state: 'running', resume() {}, sampleRate: 44100,
    createBuffer: (c, len) => ({ getChannelData: () => new Float32Array(len) }),
  };
};

let pass = 0;
let fail = 0;
function check(name, cond, details) {
  if (cond) { pass++; console.log('ok   ' + name); }
  else { fail++; console.error('FAIL ' + name + (details ? ' — ' + details : '')); }
}
function eqJson(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

const square = (id, chord) => ({
  id, repeat: 1, customBeats: 4,
  events: [{ chord, span: 4, timeSig: null, strumPattern: null }],
});
// Секция из 8 тактов; у баса ноты в тактах 5–8 (позиции 16..31).
const bassNotes = [
  { start: 16, dur: 1, string: 3, fret: 2 },
  { start: 20, dur: 1, string: 3, fret: 4 },
  { start: 24, dur: 1, string: 2, fret: 1 },
  { start: 28, dur: 1, string: 2, fret: 3 },
];
const song = {
  schemaVersion: 5, metadata: { artist: 'A', title: 'B' }, bpm: 120, globalKey: 'C',
  keyMode: 'manual', globalTimeSig: '4/4', tuning: 'e-std', tuningNotes: null, notes: '',
  sections: [{
    id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null,
    bpm: null, repeat: 1, strumPattern: null,
    squares: [11, 12, 13, 14, 15, 16, 17, 18].map((id) => square(id, 'C')),
  }],
  parts: [
    { id: 1, name: 'Гитара', instrument: 'guitar', tuning: null, visible: true, rolls: { '1': [] } },
    { id: 2, name: 'Бас', instrument: 'bass', tuning: null, visible: true, rolls: { '1': bassNotes.map((n) => ({ ...n })) } },
  ],
  nextId: 90, rhythmPool: null, userFingerings: [], preferredFingerings: [], date: '',
};

w.addEventListener('load', async () => {
  try {
    w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
    w.loadSong(0);
    w.eval('render()');
    w.confirm = () => true;
    w.eval('togglePartsMode(true)');
    const chId = (i) => `part:${w.eval(`songParts[${i}].id`)}`;
    const cell = (ch, bar) => w.document.querySelector(`#ptGv .pt-gv-cell[data-ch="${ch}"][data-bar="${bar}"]`);
    const rolls = (i) => JSON.parse(w.eval(`JSON.stringify(songParts[${i}].rolls['1'] || [])`));

    // ---------- 1. Полоса и сетка ----------
    const rows = Array.from(w.document.querySelectorAll('#ptGv .pt-gv-lab[data-ch]')).map((el) => el.dataset.ch);
    check('строки Global View: Песня, две дорожки, Мастер',
      eqJson(rows, ['song', chId(0), chId(1), 'master']), JSON.stringify(rows));
    check('ячейки баса с нотами залиты (такты 5–8), пустые — нет',
      cell(chId(1), 4).classList.contains('has-notes') && cell(chId(1), 7).classList.contains('has-notes') &&
      !cell(chId(1), 0).classList.contains('has-notes') && !cell(chId(0), 4).classList.contains('has-notes'));
    const secBlock = w.document.querySelector('#ptGv .pt-gv-sec');
    check('в мастер-строке блок секции на все 8 тактов',
      !!secBlock && secBlock.style.gridColumn === 'span 8', secBlock && secBlock.style.gridColumn);

    // ---------- 2. Клик и протяжка ----------
    const ev = (type, el, opts) => el.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...(opts || {}) }));
    ev('pointerdown', cell(chId(1), 1));
    w.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true }));
    check('клик по ячейке баса: дорожка активна, курсор в такте 2',
      w.eval('partsActiveId') === w.eval('songParts[1].id') && w.eval('partsCursor.pos') === 4,
      JSON.stringify([w.eval('partsActiveId'), w.eval('partsCursor && partsCursor.pos')]));

    // Протяжка по тактам 5–8 баса (elementFromPoint в jsdom нет — подменяем).
    let hoverCell = null;
    w.document.elementFromPoint = () => hoverCell;
    ev('pointerdown', cell(chId(1), 4));
    hoverCell = cell(chId(1), 7);
    ev('pointermove', w.document.getElementById('ptGv'));
    w.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true }));
    check('протяжка выделила такты 5–8 баса',
      eqJson(JSON.parse(w.eval('JSON.stringify(partsBarSel)')), { partId: w.eval('songParts[1].id'), from: 4, to: 7 }),
      w.eval('JSON.stringify(partsBarSel)'));

    // ---------- 3. Критерий: копирование за три действия ----------
    const key = (keyName, opts) => w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true, ...(opts || {}) }));
    key('c', { ctrlKey: true, code: 'KeyC' }); // действие 2 (действие 1 — протяжка выше)
    check('Ctrl+C положил 4 ноты в тактовый буфер',
      w.eval('partsBarClipboard && partsBarClipboard.notes.length') === 4,
      w.eval('JSON.stringify(partsBarClipboard && partsBarClipboard.notes.length)'));
    ev('pointerdown', cell(chId(0), 4));
    w.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true }));
    key('v', { ctrlKey: true, code: 'KeyV' }); // действие 3: клик + Ctrl+V
    const guitarStarts = rolls(0).map((n) => n.start).sort((a, b) => a - b);
    check('такты 5–8 баса скопированы на гитару (позиции 16,20,24,28)',
      eqJson(guitarStarts, [16, 20, 24, 28]), JSON.stringify(guitarStarts));
    check('исходные ноты баса на месте', rolls(1).length === 4);

    // Двойной клик по секции выделяет её целиком.
    w.eval('partsBarSel = null; renderPartsGlobalView()');
    w.document.querySelector('#ptGv .pt-gv-sec')
      .dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true }));
    check('двойной клик по секции выделяет все её такты активной дорожки',
      eqJson(JSON.parse(w.eval('JSON.stringify(partsBarSel)')), { partId: w.eval('songParts[0].id'), from: 0, to: 7 }),
      w.eval('JSON.stringify(partsBarSel)'));

    // ---------- 4. Структура: вставить/удалить такт ----------
    w.eval('gvInsertBar(0)');
    check('вставка такта сдвинула ноты гитары и баса на такт вправо',
      rolls(0).some((n) => n.start === 20) && rolls(1).some((n) => n.start === 20) &&
      !rolls(0).some((n) => n.start === 16),
      JSON.stringify([rolls(0).map((n) => n.start), rolls(1).map((n) => n.start)]));
    check('вставка такта добавила квадрат в секцию',
      w.eval('sections[0].squares.length') === 9, String(w.eval('sections[0].squares.length')));
    w.eval('gvDeleteBar(0)');
    check('удаление такта вернуло ноты на место',
      rolls(0).some((n) => n.start === 16) && w.eval('sections[0].squares.length') === 8);

    // Бегущий курсор воспроизведения подсвечивает играющий такт.
    w.eval('partsGvPlaybackCursor(1, 18)');
    check('при игре подсвечен играющий такт (такт 5)',
      cell(chId(0), 4).classList.contains('is-playing') && !cell(chId(0), 3).classList.contains('is-playing'));
    w.eval('partsGvPlayingBar = -1');

    // ---------- 5. Окна EQ и строя ----------
    w.eval(`openPartsEq(${JSON.stringify(chId(0))})`);
    check('кнопка EQ открывает окно с тремя полосами',
      w.document.getElementById('partsEq').hidden === false &&
      w.document.querySelectorAll('#ptEqBands input[data-eq-band]').length === 3);
    w.eval('closePartsEq()');
    w.eval('openPartsTuning()');
    check('окно «Строй дорожки» открывается: строки струн и каподастр внутри',
      w.document.getElementById('partsTuning').hidden === false &&
      !!w.document.getElementById('ptTuningRows') &&
      !!w.document.querySelector('#partsTuning select#ptCapo'),
      w.document.getElementById('partsTuning').innerHTML.slice(0, 200));
    w.eval('closePartTuningDialog()');
  } catch (e) {
    fail++;
    console.error('ОШИБКА:', e && e.stack ? e.stack : e);
  }
  console.log(`итого: ${pass} ok, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
});

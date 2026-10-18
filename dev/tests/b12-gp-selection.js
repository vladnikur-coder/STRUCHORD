#!/usr/bin/env node
/*
 * b12-gp-selection.js — B-12.11 этап 3: выделение нот и буфер обмена (как GP).
 *
 * Проверяем: Shift+стрелки и Ctrl+A выделяют; Ctrl+C/X/V копируют, вырезают
 * и вставляют поверх на позиции курсора; Delete с выделением убирает диапазон;
 * DOM нот внутри диапазона получает is-selected; вставка за конец секции
 * честно отклоняется.
 */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
  beforeParse(win) {
    win.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText: () => ({ width: 10 }),
      clearRect(){}, beginPath(){}, arc(){}, fill(){}, stroke(){}, moveTo(){}, lineTo(){}, closePath(){},
      save(){}, restore(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, setTransform(){}, scale(){},
      createLinearGradient: () => ({ addColorStop(){} }) });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {}, sampleRate: 44100,
    createBuffer: (c, len) => ({ getChannelData: () => new Float32Array(len) }) };
};

const song = {
  schemaVersion: 5, metadata: { artist: 'A', title: 'B' }, bpm: 120, globalKey: 'C', keyMode: 'manual',
  globalTimeSig: '4/4', tuning: 'e-std', tuningNotes: null, notes: '',
  sections: [{ id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null,
    repeat: 1, strumPattern: null,
    squares: [{ id: 11, repeat: 1, customBeats: 4, events: [{ chord: 'C', span: 4, timeSig: null, strumPattern: null }] }] }],
  parts: [{ id: 7, name: 'Соло', instrument: 'guitar', tuning: null, visible: true,
    rolls: { '1': [
      { start: 0, dur: 1, string: 5, fret: 3 },
      { start: 1, dur: 1, string: 5, fret: 5 },
      { start: 2, dur: 1, string: 4, fret: 2 },
    ] } }],
  nextId: 50, rhythmPool: null, userFingerings: [], preferredFingerings: [], date: '',
};

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('ok   ' + name); }
  else { fail++; console.error('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function key(k, opts) {
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true }, opts || {})));
}
function roll() { return JSON.parse(w.eval('JSON.stringify(songParts[0].rolls["1"] || [])')); }
function range() { return w.eval('partsNoteRange && { start: partsNoteRange.start, end: partsNoteRange.end }'); }

w.addEventListener('load', async () => {
  try {
    w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
    w.loadSong(0);
    w.eval('render()');
    w.confirm = () => true;
    w.eval('togglePartsMode(true)');
    w.eval("setPartsScoreEngine('native')"); // тест родной ленты: вид «Обычный»
    w.eval('setPartsCursorString(1, 0, 5, 0)');

    // Shift+→ выделяет от курсора; DOM подсвечивает ноты диапазона.
    key('ArrowRight', { code: 'ArrowRight', shiftKey: true });
    const r1 = range();
    check('Shift+→ создал диапазон от курсора', !!r1 && r1.start === 0 && r1.end >= 2, JSON.stringify(r1));
    const selectedDom = w.document.querySelectorAll('#partsTrack [data-source-start].is-selected').length;
    check('ноты диапазона подсвечены в DOM', selectedDom >= 1, String(selectedDom));

    // Ctrl+A — вся дорожка (план этапа 3, как в GP).
    key('a', { code: 'KeyA', ctrlKey: true });
    check('Ctrl+A выделил всю дорожку', w.eval('partsTrackSel') === w.eval('songParts[0].id'));
    key('c', { code: 'KeyC', ctrlKey: true });
    check('буфер дорожки структурный', w.eval('partsClipboard && partsClipboard.kind') === 'track');
    key('v', { code: 'KeyV', ctrlKey: true });
    check('вставка дорожки поверх себя — ноты те же', roll().length === 3, JSON.stringify(roll()));
    // Диапазон для обычного буфера ставим руками.
    w.eval('partsTrackSel = null; setPartsNoteRange(songParts[0], sections[0], 0, 4)');

    // Ctrl+C и вставка в конец: курсор на 3 — нота на 3 (струна 5 лад 3)
    // не встанет: диапазон 4 доли от 3 выходит за секцию? span=4, ноты на
    // относительных 0..2 → 3..5: последняя за концом. Честный отказ.
    key('c', { code: 'KeyC', ctrlKey: true });
    check('Ctrl+C наполнил буфер', w.eval('partsClipboard && partsClipboard.notes.length') === 3);
    w.eval('setPartsCursorString(1, 0, 5, 3)');
    key('v', { code: 'KeyV', ctrlKey: true });
    check('вставка за конец секции отклонена', roll().length === 3, JSON.stringify(roll()));

    // Вставка на позицию 1 поверх существующей ноты (start 1, струна 5):
    // нота на 1 заменяется копией диапазона [3@1, 5@2, 2@3-струна4].
    w.eval('setPartsCursorString(1, 0, 5, 1)');
    key('v', { code: 'KeyV', ctrlKey: true });
    const afterPaste = roll();
    check('Ctrl+V вставил поверх: 5 нот (одна заменена, на 2 — аккорд двух струн)',
      afterPaste.length === 5, JSON.stringify(afterPaste));
    check('вставленная первая нота — лад 3 на позиции 1',
      afterPaste.some((n) => n.start === 1 && n.fret === 3 && n.string === 5), JSON.stringify(afterPaste));

    // Ctrl+X вырезает диапазон целиком. Пауза — чтобы история не склеила
    // вставку и вырезание в один шаг отмены.
    await new Promise((r) => setTimeout(r, 520));
    key('a', { code: 'KeyA', ctrlKey: true });
    key('x', { code: 'KeyX', ctrlKey: true });
    check('Ctrl+X вырезал все ноты', roll().length === 0, JSON.stringify(roll()));
    w.undoEdit();
    check('Ctrl+Z вернул вырезанное', roll().length === 5, JSON.stringify(roll()));

    // Delete с выделением убирает диапазон.
    key('a', { code: 'KeyA', ctrlKey: true });
    key('Delete', { code: 'Delete' });
    check('Delete убрал выделенный диапазон', roll().length === 0, JSON.stringify(roll()));

    // Тройной клик по табу — выделение секции (GP: вся дорожка).
    w.undoEdit();
    w.eval('renderPartsScreen()');
    const svg = w.document.querySelector('#partsTrack svg.pt-svg');
    check('таб-лента на месте для тройного клика', !!svg);
    if (svg) {
      svg.getBoundingClientRect = () => ({ left: 0, right: 400, top: 0, bottom: 100, width: 400, height: 100 });
      const ev = new w.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 30, clientY: 20 });
      Object.defineProperty(ev, 'detail', { value: 3 });
      svg.dispatchEvent(ev);
      const r3 = range();
      check('тройной клик выделил всю дорожку', w.eval('partsTrackSel') === w.eval('songParts[0].id'));
    }

    console.log(`\nитого: ${pass} ok, ${fail} FAIL`);
    if (fail) process.exitCode = 1;
  } catch (error) {
    console.error('ОШИБКА:', error && error.stack ? error.stack : error);
    process.exitCode = 1;
  }
});

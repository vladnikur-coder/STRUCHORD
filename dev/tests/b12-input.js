#!/usr/bin/env node
/*
 * b12-input.js — B-12.2 «Партии», кирпич 2 «Ввод».
 *
 * Проверяем клавиатурный ввод нот в окне партий (сверено с Guitar Pro 8,
 * решения допроса R8 от 2026-10-13):
 *  1. Палитра: семь длительностей + точка, двойная точка, триоль;
 *     кнопки подсвечены, клик выбирает длительность и знаки.
 *  2. Курсор: клик по табу ставит курсор и не добавляет ноту; стрелки
 *     шагают на длительность, Shift — мельче, Home/End и Ctrl+Home/End.
 *  3. Цифры: лад, две цифры в окне (10–24), несуществующий лад не
 *     склеивается; цифра поверх ноты меняет лад и сохраняет длительность.
 *  4. Длительности: = короче, − длиннее, . точка, Ctrl+. двойная, /
 *     триоль — и знаки уезжают в файл вместе с длительностью.
 *  5. Правки: Backspace/Delete, Insert доли (с отказом за концом
 *     секции), R — пауза; всё откатывается одним шагом Ctrl+Z.
 *  6. Разбор файла: знаки, спорящие с длительностью, отбрасываются.
 *  7. Размеры: в 6/8 нотные длительности переводятся через знаменатель.
 */
const fs = require('fs');
const path = require('path');
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
  parts: [{ id: 7, name: 'Соло', instrument: 'guitar', tuning: null, visible: true, rolls: {} }],
  nextId: 50, rhythmPool: null, userFingerings: [], preferredFingerings: [], date: '',
};

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log('ok   ' + name);
  } else {
    fail++;
    console.error('FAIL ' + name + (extra ? ' — ' + extra : ''));
  }
}

function key(k, opts) {
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true }, opts || {})));
}
function plucks() { return w.eval('(window.__plucks || []).length'); }
// Детерминированное состояние: четверть, без знаков, курсор на позиции p.
function reset(pos) {
  w.eval(`partInput.durIndex = 4; partInput.dots = 0; partInput.triplet = false;
    partLastDigit = null; partsCursor.pos = ${pos}; syncPartsCursorDom(); syncPartsPalette();`);
}
function note() {
  const roll = JSON.parse(w.eval('JSON.stringify(songParts[0].rolls["1"] || [])'));
  return roll.find((n) => Math.abs(n.start - w.eval('partsCursor.pos')) < 1e-6 && n.string === w.eval('partsCursor.string')) || roll[0];
}
function dur() { return w.eval('(songParts[0].rolls["1"] || []).length'); }

w.addEventListener('load', () => {
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
  w.eval('render()');
  w.confirm = () => true;
  w.eval(`
    window.__plucks = [];
    pluckString = function(ctx, opts) { window.__plucks.push({ f: opts.freq, d: opts.duration }); };
  `);
  w.eval('togglePartsMode(true); setPartsEditMode("input")');

  const track = w.document.getElementById('partsTrack');
  check('окно построено, станок есть', track.querySelectorAll('.pt-section').length === 1,
    String(track.querySelectorAll('.pt-section').length));
  check('палитра: 7 длительностей + 3 знака',
    w.document.querySelectorAll('#ptDurGroup .pt-pal-btn').length === 7 &&
    w.document.querySelectorAll('#ptMarkGroup .pt-pal-btn').length === 3);
  check('по умолчанию четверть', w.document.querySelector('#ptDurGroup .pt-pal-btn[data-dur="4"]').classList.contains('is-on'));
  const cursor0 = w.eval('JSON.stringify(partsCursor)');
  check('курсор встал в начало партии', /"pos":0/.test(cursor0) && /"string":5/.test(cursor0), cursor0);
  check('курсор нарисован', track.querySelectorAll('.pt-cursor').length === 1);

  // --- клик по табу ставит курсор (квадрат 1/4 → позиция 2 = третья доля) ---
  const svg = track.querySelector('.pt-svg');
  const svgBox = { left: 0, top: 0, width: 96, height: 90, right: 96, bottom: 90 };
  svg.getBoundingClientRect = () => svgBox;
  const viewBox = svg.getAttribute('viewBox').split(/[ ,]+/).map(Number);
  const scoreY = Number(svg.dataset.topPad || 12) +
    (Number(svg.dataset.stringCount || 6) - 1 - 2) * Number(svg.dataset.lineGap || 9);
  const clientY = (scoreY - viewBox[1]) * svgBox.height / viewBox[3];
  svg.dispatchEvent(new w.MouseEvent('pointerdown', { clientX: 48, clientY, bubbles: true }));
  const cursor1 = JSON.parse(w.eval('JSON.stringify(partsCursor)'));
  check('клик: позиция 2', Math.abs(cursor1.pos - 2) < 1e-6, JSON.stringify(cursor1));
  check('клик: струна 2 (третья строка сверху)', cursor1.string === 2, JSON.stringify(cursor1));
  check('клик не создал ноту', w.eval('songParts[0].rolls["1"] ? songParts[0].rolls["1"].length : -1') === -1 ||
    w.eval('(songParts[0].rolls["1"] || []).length') === 0);

  // --- цифра: нота появляется, звучит, курсор остаётся ---
  key('5');
  let roll = JSON.parse(w.eval('JSON.stringify(songParts[0].rolls["1"] || [])'));
  check('цифра 5 создала ноту', roll.length === 1 && roll[0].fret === 5 && Math.abs(roll[0].start - 2) < 1e-6 &&
    Math.abs(roll[0].dur - 1) < 1e-6 && roll[0].string === 2, JSON.stringify(roll));
  check('нота прозвучала', plucks() === 1, String(plucks()));
  check('курсор остался на месте', JSON.parse(w.eval('JSON.stringify(partsCursor)')).pos === 2);

  // --- вторая цифра в окне = лад 12; 51 не существует → остаётся 1 ---
  key('5');
  key('1');
  roll = JSON.parse(w.eval('JSON.stringify(songParts[0].rolls["1"] || [])'));
  check('лад 51 не существует → остаётся 1', roll[0].fret === 1, JSON.stringify(roll));
  key('2');
  roll = JSON.parse(w.eval('JSON.stringify(songParts[0].rolls["1"] || [])'));
  check('лад 12 (две цифры в окне)', roll[0].fret === 12 && Math.abs(roll[0].dur - 1) < 1e-6, JSON.stringify(roll));

  // --- окно выключено: вторая цифра = новый лад, длительность сохраняется ---
  w.eval('partDigitWindowMs = 0');
  key('9');
  roll = JSON.parse(w.eval('JSON.stringify(songParts[0].rolls["1"] || [])'));
  check('цифра поверх ноты меняет лад, длительность цела',
    roll.length === 1 && roll[0].fret === 9 && Math.abs(roll[0].dur - 1) < 1e-6, JSON.stringify(roll));
  w.eval('partDigitWindowMs = 800');

  // --- = короче, − длиннее (как в GP). Каждую проверку ведём от 1/4. ---
  reset(2);
  key('=', { code: 'Equal' });
  check('= укоротил ноту до 1/8', Math.abs(note().dur - 0.5) < 1e-6, JSON.stringify(note()));
  key('=', { code: 'Equal' });
  check('= ещё раз — 1/16', Math.abs(note().dur - 0.25) < 1e-6, JSON.stringify(note()));
  key('-', { code: 'Minus' });
  check('− вернул 1/8', Math.abs(note().dur - 0.5) < 1e-6, JSON.stringify(note()));
  key('-', { code: 'Minus' });
  check('− ещё раз — 1/4', Math.abs(note().dur - 1) < 1e-6, JSON.stringify(note()));

  // --- точка, двойная точка, триоль ---
  reset(2);
  key('.', { code: 'Period' });
  check('точка: 1,5 четверти, знак записан',
    Math.abs(note().dur - 1.5) < 1e-6 && note().dots === 1, JSON.stringify(note()));
  check('палитра подсветила точку', w.document.querySelector('#ptMarkGroup .pt-pal-btn[data-mark="dot"]').classList.contains('is-on'));
  key('.', { code: 'Period' });
  check('повторная точка снимает точку', Math.abs(note().dur - 1) < 1e-6 && !note().dots, JSON.stringify(note()));
  key('.', { code: 'Period', ctrlKey: true });
  check('Ctrl+. даёт двойную точку (×1,75)', Math.abs(note().dur - 1.75) < 1e-6 && note().dots === 2, JSON.stringify(note()));
  reset(2);
  key('/', { code: 'Slash' });
  check('триоль: ⅔ четверти, знак записан',
    Math.abs(note().dur - 2 / 3) < 1e-3 && note().triplet === true, JSON.stringify(note()));
  key('/', { code: 'Slash' });
  check('повторная триоль снимает триоль', Math.abs(note().dur - 1) < 1e-6 && !note().triplet, JSON.stringify(note()));

  // --- стрелки ---
  reset(2);
  key('ArrowRight', { code: 'ArrowRight' });
  check('→ сдвинул курсор на длительность (2+1=3)', Math.abs(w.eval('partsCursor.pos') - 3) < 1e-6, String(w.eval('partsCursor.pos')));
  key('ArrowUp', { code: 'ArrowUp' });
  check('↑ сменил струну вверх', w.eval('partsCursor.string') === 3, String(w.eval('partsCursor.string')));
  key('ArrowDown', { code: 'ArrowDown' });
  key('ArrowDown', { code: 'ArrowDown' });
  check('↓ сменил струну вниз (до 1)', w.eval('partsCursor.string') === 1, String(w.eval('partsCursor.string')));
  // B-12.11 этап 3 (GP): Shift+стрелки расширяют выделение, а не шаг курсора.
  reset(2);
  key('ArrowRight', { code: 'ArrowRight', shiftKey: true });
  check('Shift+→ (GP) расширяет выделение вправо', Math.abs(w.eval('partsCursor.pos') - 3) < 1e-6 && !!w.eval('partsNoteRange'), String(w.eval('partsCursor.pos')));
  key('ArrowLeft', { code: 'ArrowLeft', shiftKey: true });
  check('Shift+← сужает выделение обратно к 2', Math.abs(w.eval('partsCursor.pos') - 2) < 1e-6, String(w.eval('partsCursor.pos')));
  reset(2);
  key('Home', { code: 'Home' });
  check('Home (GP) — начало такта', w.eval('partsCursor.pos') === 0, String(w.eval('partsCursor.pos')));
  key('End', { code: 'End' });
  check('End (GP) — начало последнего такта (секция = 1 такт → 0)', w.eval('partsCursor.pos') === 0, String(w.eval('partsCursor.pos')));
  key('End', { code: 'End', ctrlKey: true });
  check('Ctrl+End — конец партии', Math.abs(w.eval('partsCursor.pos') - 3) < 1e-6, String(w.eval('partsCursor.pos')));
  key('Home', { code: 'Home', ctrlKey: true });
  check('Ctrl+Home — начало партии', w.eval('partsCursor.pos') === 0, String(w.eval('partsCursor.pos')));

  // --- нота на другой струне: аккорд (несколько нот в одной позиции) ---
  w.eval('setPartsCursorString(1, 0, 5, 2); movePartsCursorEdge(false, false); setPartsCursorString(1, 0, 5, 2);');
  key('3');
  roll = JSON.parse(w.eval('JSON.stringify(songParts[0].rolls["1"] || [])'));
  check('вторая нота в той же позиции на другой струне', roll.length === 2, JSON.stringify(roll));

  // --- удаление и Insert ---
  w.eval('setPartsCursorString(1, 0, 5, 2)');
  key('Backspace', { code: 'Backspace' });
  roll = JSON.parse(w.eval('JSON.stringify(songParts[0].rolls["1"] || [])'));
  check('Backspace удалил ноту на своей струне', roll.length === 1 && roll[0].string !== 5, JSON.stringify(roll));
  reset(0);
  w.eval('setPartsCursorString(1, 0, 2, 0); partsCursor.pos = 0;');
  key('Insert', { code: 'Insert' });
  roll = JSON.parse(w.eval('JSON.stringify(songParts[0].rolls["1"] || [])'));
  check('Insert сдвинул ноты вправо на длительность', Math.abs(roll[0].start - 3) < 1e-6, JSON.stringify(roll));

  // --- Insert у конца секции отказывает ---
  w.eval(`songParts[0].rolls['1'] = [{ start: 3, dur: 1, string: 0, fret: 2 }]; partsCursor.pos = 3;`);
  key('Insert', { code: 'Insert' });
  roll = JSON.parse(w.eval('JSON.stringify(songParts[0].rolls["1"] || [])'));
  check('Insert не выталкивает ноту за такт', Math.abs(roll[0].start - 3) < 1e-6, JSON.stringify(roll));

  // --- R = пауза (шаг вправо) ---
  reset(0);
  key('r');
  check('R сдвинул курсор вправо', Math.abs(w.eval('partsCursor.pos') - 1) < 1e-6, String(w.eval('partsCursor.pos')));

  // --- палитра мышью ---
  reset(0);
  w.document.querySelector('#ptDurGroup .pt-pal-btn[data-dur="3"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('клик по палитре выбрал 1/8', w.eval('partInput.durIndex') === 3, String(w.eval('partInput.durIndex')));
  w.document.querySelector('#ptMarkGroup .pt-pal-btn[data-mark="triplet"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('клик по триоли включил её', w.eval('partInput.triplet') === true);

  // --- ввод в триольной сетке ---
  w.eval('partsCursor.pos = 0; songParts[0].rolls["1"] = [];');
  key('7');
  roll = JSON.parse(w.eval('JSON.stringify(songParts[0].rolls["1"] || [])'));
  const tripletNote = roll.find((n) => n.start === 0);
  check('триольная нота: длительность 1/3 доли и знак',
    tripletNote && Math.abs(tripletNote.dur - 1 / 3) < 1e-3 && tripletNote.triplet === true, JSON.stringify(roll));

  // --- сейв и повторная загрузка ---
  w.saveCurrentSong();
  const lib = JSON.parse(w.localStorage.getItem('struchord_songs'));
  const saved = lib[lib.length - 1];
  const savedNotes = saved.parts[0].rolls['1'];
  check('знаки уехали в файл', savedNotes.some((n) => n.dots) === false && savedNotes.some((n) => n.triplet) === true,
    JSON.stringify(savedNotes));
  w.loadSong(0);
  w.eval('render()');
  check('после перезагрузки знаки на месте',
    w.eval('(songParts[0].rolls["1"] || []).some(n => n.triplet === true)') === true);

  // --- мусор в файле: знаки, спорящие с длительностью, отбрасываются ---
  w.localStorage.setItem('struchord_songs', JSON.stringify([Object.assign({}, song, {
    parts: [{ id: 7, name: 'Соло', instrument: 'guitar', tuning: null, visible: true,
      rolls: { '1': [{ start: 0, dur: 1, string: 0, fret: 3, dots: 2 }] } }],
  })]));
  w.loadSong(0);
  w.eval('render()');
  const bad = JSON.parse(w.eval('JSON.stringify(songParts[0].rolls["1"][0])'));
  check('знаки без подтверждения длиной отброшены', !bad.dots && !bad.triplet && Math.abs(bad.dur - 1) < 1e-9, JSON.stringify(bad));

  // --- отмена ---
  w.eval('togglePartsMode(true); setPartsEditMode("input")');
  w.eval('setPartsCursorString(1, 0, 5, 0)');
  key('4');
  const beforeUndo = JSON.parse(w.eval('JSON.stringify(songParts[0].rolls["1"] || [])'));
  w.undoEdit();
  const afterUndo = JSON.parse(w.eval('JSON.stringify(songParts[0].rolls["1"] || [])'));
  check('Ctrl+Z-шаг откатывает ввод ноты',
    beforeUndo.length === afterUndo.length + 1 &&
    !afterUndo.some((n) => n.string === 5 && Math.abs(n.start) < 1e-6 && n.fret === 4),
    JSON.stringify([beforeUndo, afterUndo]));

  // --- пустое состояние и создание партии ---
  w.eval('songParts.length = 0; renderPartsScreen();');
  check('без партий показано пустое состояние', w.document.getElementById('partsEmpty').hidden === false);
  w.document.getElementById('ptCreatePart').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('кнопка создала партию', w.eval('songParts.length') === 1 && w.eval('songParts[0].name') === 'Партия 1',
    w.eval('JSON.stringify(songParts)'));

  // --- 6/8: нотные длительности переводятся через знаменатель ---
  w.localStorage.setItem('struchord_songs', JSON.stringify([Object.assign({}, song, {
    globalTimeSig: '6/8',
    sections: [{ id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null,
      repeat: 1, strumPattern: null,
      squares: [{ id: 11, repeat: 1, customBeats: 6, events: [{ chord: 'C', span: 6, timeSig: null, strumPattern: null }] }] }],
    parts: [{ id: 7, name: 'Соло', instrument: 'guitar', tuning: null, visible: true, rolls: {} }],
  })]));
  w.loadSong(0);
  w.eval('render()');
  w.eval('togglePartsMode(true); setPartsEditMode("input")');
  check('6/8: четверть = 2 единицы сетки', Math.abs(w.eval('partInputUnits("6/8", 4, 0, false)') - 2) < 1e-9,
    String(w.eval('partInputUnits("6/8", 4, 0, false)')));
  check('6/8: целая = 8 единиц (два такта по 6/8)', Math.abs(w.eval('partInputUnits("6/8", 6, 0, false)') - 8) < 1e-9);
  w.eval('partInput.durIndex = 4; partInput.dots = 0; partInput.triplet = false; setPartsCursorString(1, 0, 5, 0);');
  key('2');
  const note68 = JSON.parse(w.eval('JSON.stringify(songParts[0].rolls["1"][0])'));
  check('6/8: введённая четверть длится 2 единицы', Math.abs(note68.dur - 2) < 1e-9, JSON.stringify(note68));

  // --- партия без нот: это чистый станок, а не пустое состояние ---
  w.localStorage.setItem('struchord_songs', JSON.stringify([Object.assign({}, song, {
    parts: [{ id: 7, name: 'Соло', instrument: 'guitar', tuning: null, visible: true, rolls: {} }],
  })]));
  w.loadSong(0);
  w.eval('render()');
  w.eval('togglePartsMode(true); setPartsEditMode("input")');
  check('партия без нот: пустое состояние скрыто, станок ждёт ввод',
    w.document.getElementById('partsEmpty').hidden === true &&
    w.document.querySelectorAll('#partsTrack .pt-section').length === 1,
    JSON.stringify({ hidden: w.document.getElementById('partsEmpty').hidden,
      sections: w.document.querySelectorAll('#partsTrack .pt-section').length,
      isParts: w.document.body.classList.contains('is-parts'),
      partsMode: w.eval('partsMode'), parts: w.eval('songParts.length') }));
  check('партия без нот: палитра на месте',
    w.document.querySelectorAll('#ptDurGroup .pt-pal-btn').length === 7 &&
    w.document.querySelectorAll('#ptMarkGroup .pt-pal-btn').length === 3 &&
    w.document.querySelectorAll('#ptToneGroup .pt-pal-btn').length === 16,
    JSON.stringify({
      dur: w.document.querySelectorAll('#ptDurGroup .pt-pal-btn').length,
      tone: w.document.querySelectorAll('#ptToneGroup .pt-pal-btn').length,
    }));
  check('курсор умеет встать в пустую партию', w.eval('partsCursor !== null') === true);

  // --- Esc выходит из окна и не оставляет незакрытую вторую цифру ---
  w.eval('setPartsCursorString(1, 0, 5, 0); partLastDigit = { fret: 1, secId: 1, pass: 0, string: 5, pos: 0, at: Date.now() };');
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check('Esc вернул в редактор и сбросил ввод второй цифры',
    !w.document.body.classList.contains('is-parts') && w.eval('partLastDigit') === null);

  // --- лестница длительностей упирается в края, а не улетает ---
  w.eval('togglePartsMode(true); setPartsEditMode("input")');
  reset(0);
  for (let i = 0; i < 12; i++) key('=', { code: 'Equal' });
  check('= упирается в 1/64', w.eval('partInput.durIndex') === 0, String(w.eval('partInput.durIndex')));
  for (let i = 0; i < 12; i++) key('-', { code: 'Minus' });
  check('− упирается в целую', w.eval('partInput.durIndex') === 6, String(w.eval('partInput.durIndex')));

  // --- целая нота в 4/4 занимает такт целиком ---
  w.eval('songParts[0].rolls["1"] = []; setPartsCursorString(1, 0, 5, 0);');
  key('2');
  check('целая нота = 4 единицы (весь такт 4/4)',
    Math.abs(note().dur - 4) < 1e-9, JSON.stringify(note()));
  check('курсор целой ноты шириной в такт', Math.abs(w.eval('partCursorStepUnits(sections[0])') - 4) < 1e-9);

  // --- нота у конца системы подрезается хвостом, а знаки не врут ---
  w.eval('songParts[0].rolls["1"] = []; partInput.durIndex = 4; partInput.dots = 1; partInput.triplet = false;');
  w.eval('setPartsCursorString(1, 0, 5, 3.75)');
  key('7');
  const tail = note();
  check('нота у конца такта подрезана (0,25 доли)', Math.abs(tail.dur - 0.25) < 1e-9, JSON.stringify(tail));
  check('подрезанной ноте знаки не приписаны', !tail.dots && !tail.triplet, JSON.stringify(tail));

  // --- знаки из демо-файла переживают разбор: пунктир и триоль ---
  const demoRaw = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'b12-parts-demo.struchord'), 'utf8');
  w.localStorage.setItem('struchord_songs', JSON.stringify([JSON.parse(demoRaw)]));
  w.loadSong(0);
  w.eval('render()');
  const demoRoll = JSON.parse(w.eval('JSON.stringify(songParts[0].rolls["1"])'));
  check('демо: пунктирная четверть сохранила точку',
    demoRoll.some((n) => n.dots === 1 && Math.abs(n.dur - 1.5) < 1e-6), JSON.stringify(demoRoll.slice(0, 8)));
  check('демо: триоль сохранила знак и длину 1/3',
    demoRoll.filter((n) => n.triplet === true).length === 3 &&
    demoRoll.filter((n) => n.triplet === true).every((n) => Math.abs(n.dur - 1 / 3) < 1e-3),
    JSON.stringify(demoRoll.filter((n) => n.triplet === true)));
  w.eval('togglePartsMode(true); setPartsEditMode("input"); setPartsCursorString(1, 0, 5, 12);');
  check('демо: триоль нарисована знаком «3»',
    w.document.querySelectorAll('#partsTrack .pt-note-mark').length >= 4,
    String(w.document.querySelectorAll('#partsTrack .pt-note-mark').length));

  // --- палитра подхватывает длительность ноты под курсором (как в GP) ---
  w.eval('songParts[0].rolls["1"] = [{ start: 0, dur: 0.75, string: 5, fret: 5, dots: 1 }];');
  w.eval('partInput.durIndex = 4; partInput.dots = 0; setPartsCursorString(1, 0, 5, 2); syncPartsPalette();');
  check('пустое место не меняет выбор', w.eval('partInput.durIndex') === 4 && w.eval('partInput.dots') === 0);
  w.eval('setPartsCursorString(1, 0, 5, 0); adoptPartsInputFromCursor();');
  check('нота под курсором подтянула палитру (1/8 с точкой)',
    w.eval('partInput.durIndex') === 3 && w.eval('partInput.dots') === 1,
    JSON.stringify([w.eval('partInput.durIndex'), w.eval('partInput.dots')]));
  check('палитра подсветила 1/8 и точку',
    w.document.querySelector('#ptDurGroup .pt-pal-btn[data-dur="3"]').classList.contains('is-on') &&
    w.document.querySelector('#ptMarkGroup .pt-pal-btn[data-mark="dot"]').classList.contains('is-on'));

  // --- коллизия записи: восьмая с точкой и триолью звучит как простая восьмая ---
  check('совпадение записи со звуком распознаётся',
    w.eval('partNotationMatches(0.5, "4/4", 1, true)') === true &&
    w.eval('partNotationMatches(0.5, "4/4", 2, false)') === false);
  check('палитра читает ноту с предпочтением её знаков',
    w.eval('JSON.stringify(partNotationOf(0.5, "4/4", 1, true))') === '{"durIndex":3,"dots":1,"triplet":true}',
    w.eval('JSON.stringify(partNotationOf(0.5, "4/4", 1, true))'));

  console.log(`\nитого: ${pass} ok, ${fail} FAIL`);
  if (fail) process.exitCode = 1;
});

#!/usr/bin/env node
/*
 * b12-editing.js — B-12.10.2 «Ввод и редактирование нот».
 * Проверяем безопасный Select, ввод с таба/стана, сетку, голоса,
 * контекстную аппликатуру и отмену Store-backed правок.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'STRUCHORD.html'), 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
  beforeParse(win) {
    win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    win.cancelAnimationFrame = (id) => clearTimeout(id);
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }), clearRect() {}, beginPath() {}, arc() {},
      fill() {}, stroke() {}, moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {},
      translate() {}, rotate() {}, fillText() {}, strokeText() {}, setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {}, sampleRate: 44100,
    createBuffer: (channels, len) => ({ getChannelData: () => new Float32Array(len) }) };
};

let passed = 0;
let failed = 0;
function check(name, condition, details) {
  if (condition) {
    passed++;
    console.log('ok   ' + name);
  } else {
    failed++;
    console.error('FAIL ' + name + (details ? ' — ' + details : ''));
  }
}
function key(keyValue, opts) {
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', Object.assign({ key: keyValue, bubbles: true }, opts || {})));
}
function json(expr) { return JSON.parse(w.eval(`JSON.stringify(${expr})`)); }
function roll() { return json('songParts[0].rolls["1"] || []'); }
function pitchRoll() { return json('songParts[0].pitchRolls["1"] || []'); }
function makeSong(parts, options) {
  const opts = options || {};
  return {
    schemaVersion: 9,
    metadata: { artist: 'B-12 tests', title: 'Editing' },
    bpm: 100, globalKey: opts.key || 'C', keyMode: 'manual', globalTimeSig: opts.timeSig || '4/4',
    tuning: 'e-std', tuningNotes: null, notes: '', date: '2026-10-17',
    sections: [{
      id: 1, type: 'Verse', customName: null, key: opts.key || null, shift: null,
      timeSig: opts.timeSig || null, bpm: null, repeat: 1, strumPattern: null,
      squares: [{ id: 11, repeat: 1, customBeats: opts.beats || 4,
        events: [{ chord: 'C', span: opts.beats || 4, timeSig: null, strumPattern: null }] }],
    }],
    parts, nextId: 100, rhythmPool: null, userFingerings: [], preferredFingerings: [], date: '2026-10-17',
  };
}
function closeParts() {
  if (w.eval('partsMode')) w.eval('togglePartsMode(false)');
}
function load(song) {
  closeParts();
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
  w.eval('render()');
  w.confirm = () => true;
}
function openParts() { w.eval('togglePartsMode(true)'); }
w.eval("setPartsScoreEngine('native')"); // тест родной ленты: вид «Обычный»
function setInput() { w.eval('setPartsEditMode("input")'); }
function staffSvg(partId) {
  return w.document.querySelector(`.pt-row[data-part="${partId}"] svg.pt-score-staff-svg`);
}
function scoreBar(svg) {
  const cell = svg.closest('.pt-score-bar');
  const start = Number(cell.dataset.start);
  const end = Number(cell.dataset.end);
  return {
    cell, start, end, dur: end - start,
    leftInset: Number(cell.dataset.leftInset || 0),
    contentWidth: Number(cell.dataset.contentWidth || 0),
  };
}
function scoreClick(svg, unit, y) {
  const view = String(svg.getAttribute('viewBox') || '').split(/[ ,]+/).map(Number);
  const bar = scoreBar(svg);
  const usable = Math.max(12, bar.contentWidth - 12);
  const ratio = Math.max(0, Math.min(1, (unit - bar.start) / bar.dur));
  const x = bar.leftInset + 6 + ratio * usable;
  const rect = { left: 0, top: 0, width: view[2], height: view[3], right: view[2], bottom: view[3] };
  svg.getBoundingClientRect = () => rect;
  svg.dispatchEvent(new w.MouseEvent('pointerdown', {
    bubbles: true, button: 0, clientX: view[0] + x, clientY: view[1] + y,
  }));
}
function tabClick(svg, unit, string) {
  if (svg.classList.contains('pt-score-tab-svg')) {
    const count = Number(svg.dataset.stringCount || 6);
    const top = Number(svg.dataset.topPad || 12);
    const gap = Number(svg.dataset.lineGap || 9);
    return scoreClick(svg, unit, top + (count - 1 - string) * gap);
  }
  const view = String(svg.getAttribute('viewBox') || '').split(/[ ,]+/).map(Number);
  const count = Number(w.eval('partStringCount(partActivePart())'));
  const top = Number(w.eval('PART_TAB_TOP_PAD'));
  const gap = Number(w.eval('partTabLineGap(partActivePart())'));
  const x = unit * Number(w.eval('PART_TAB_UNIT'));
  const y = top + (count - 1 - string) * gap;
  const rect = { left: 0, top: 0, width: view[2], height: view[3], right: view[2], bottom: view[3] };
  svg.getBoundingClientRect = () => rect;
  svg.dispatchEvent(new w.MouseEvent('pointerdown', {
    bubbles: true, button: 0, clientX: x, clientY: y,
  }));
}
function activeNoteInRoll(predicate) { return roll().find(predicate); }
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const settleHistory = () => wait(460);

w.addEventListener('load', async () => {
  try {
    w.eval(`
      window.__plucks = [];
      window.__toasts = [];
      pluckString = function (ctx, opts) { window.__plucks.push(opts); };
      previewPartNote = function () {};
      previewPartPitchNote = function () {};
      showToast = function (message) { window.__toasts.push(String(message)); };
    `);

    // ---------- Select без записи + tab-click со снапом ----------
    load(makeSong([{ id: 1, name: 'Guitar', instrument: 'guitar', viewMode: 'tab', tuning: null,
      visible: true, rolls: { '1': [] } }]));
    openParts();
    // B-12.11: как в GP, отдельных режимов нет — ввод сразу при открытии.
    check('новое открытие партий начинается сразу с ввода (GP)', w.eval('partsInputEnabled()') === true);
    check('голос и палитра редактирования доступны сразу',
      !w.document.getElementById('ptVoice').disabled &&
      Array.from(w.document.querySelectorAll('#partsPalette .pt-pal-btn')).every((button) => !button.disabled));
    w.eval('setPartsCursorString(1, 0, 5, 0)');
    w.eval('inputPartFret(4)');
    check('команда ввода сразу создаёт ноту без переключения режима',
      roll().length === 1 && roll()[0].fret === 4,
      JSON.stringify(roll()));
    w.eval('songParts[0].rolls["1"] = []; renderPartsScreen();');

    // Точечный выбор ноты округляется по активной dotted-eighth сетке.
    w.eval('partInput.durIndex = 3; partInput.dots = 1; partInput.triplet = false;');
    const tabSvg = w.document.querySelector('#partsTrack svg.pt-score-tab-svg, #partsTrack svg.pt-svg');
    tabClick(tabSvg, 2.30, 5);
    check('клик по табу ставит курсор на dotted-eighth сетку, не создавая ноту',
      Math.abs(w.eval('partsCursor.pos') - 2.25) < 1e-6 && roll().length === 0,
      JSON.stringify({ pos: w.eval('partsCursor.pos'), roll: roll() }));
    setInput();
    w.eval('inputPartFret(5)');
    check('лад вводится сразу, без переключения режима',
      roll().length === 1 && roll()[0].fret === 5 && Math.abs(roll()[0].start - 2.25) < 1e-6 &&
        Math.abs(roll()[0].dur - 0.75) < 1e-6 && roll()[0].dots === 1,
      JSON.stringify(roll()));
    load(makeSong([{ id: 4, name: 'Triplet grid', instrument: 'guitar', viewMode: 'tab', tuning: null,
      visible: true, rolls: { '1': [] } }]));
    openParts();
    w.eval('partInput.durIndex = 4; partInput.dots = 0; partInput.triplet = true;');
    tabClick(w.document.querySelector('#partsTrack svg.pt-score-tab-svg, #partsTrack svg.pt-svg'), 2.4, 5);
    check('tab snap использует триольную сетку выбранной длительности',
      Math.abs(w.eval('partsCursor.pos') - 8 / 3) < 1e-6 && roll().length === 0,
      String(w.eval('partsCursor.pos')));
    load(makeSong([{ id: 5, name: '6/8 grid', instrument: 'guitar', viewMode: 'tab', tuning: null,
      visible: true, rolls: { '1': [] } }], { timeSig: '6/8', beats: 6 }));
    openParts();
    w.eval('partInput.durIndex = 4; partInput.dots = 0; partInput.triplet = false;');
    tabClick(w.document.querySelector('#partsTrack svg.pt-score-tab-svg, #partsTrack svg.pt-svg'), 2.6, 5);
    check('snap учитывает знаменатель 6/8 и границу секции',
      Math.abs(w.eval('partsCursor.pos') - 2) < 1e-6 &&
        w.eval('partSectionUnits(sections[0])') === 6 && w.eval('partCursorStepUnits(sections[0])') === 2,
      JSON.stringify({ pos: w.eval('partsCursor.pos'), end: w.eval('partSectionUnits(sections[0])'), step: w.eval('partCursorStepUnits(sections[0])') }));

    // ---------- Staff click: key signature, pending semitone, Enter ----------
    load(makeSong([{ id: 2, name: 'Keys', instrument: 'keys', gmProgram: 0, viewMode: 'staff',
      tuning: 'e-std', visible: true, rolls: {}, pitchRolls: { '1': [] } }], { key: 'G' }));
    openParts();
    w.eval('partInput.durIndex = 4; partInput.dots = 0; partInput.triplet = false;');
    const keySvg = staffSvg(2);
    const keyStaves = JSON.parse(keySvg.dataset.staves || '[]');
    const treble = keyStaves.find((staff) => staff.clef === 'treble');
    const fSharp = w.eval(`partScorePitchAtStaffY(${treble.top}, ${JSON.stringify(treble)}, 'G')`);
    check('клик в тональности G применяет ключевой знак F♯', fSharp === 78, String(fSharp));
    scoreClick(keySvg, 1.2, treble.top); // верхняя линейка скрипичного стана — F♯5
    check('staff-click задаёт высоту и snapped onset, но не вставляет',
      w.eval('partsCursor.staffPitch') === 78 && Math.abs(w.eval('partsCursor.pos') - 1) < 1e-6 && pitchRoll().length === 0,
      JSON.stringify({ pitch: w.eval('partsCursor.staffPitch'), pos: w.eval('partsCursor.pos'), notes: pitchRoll() }));
    setInput();
    key('ArrowUp', { code: 'ArrowUp' });
    check('в Input стрелка меняет pending pitch на полутон, без ранней записи',
      w.eval('partsCursor.staffPitch') === 79 && pitchRoll().length === 0);
    key('Enter', { code: 'Enter' });
    check('Enter вставляет pending pitch в выбранную долю',
      pitchRoll().length === 1 && pitchRoll()[0].pitch === 79 && Math.abs(pitchRoll()[0].start - 1) < 1e-6,
      JSON.stringify(pitchRoll()));

    // ---------- Контекстная аппликатура guitar + tie-break ----------
    load(makeSong([{ id: 3, name: 'Guitar staff', instrument: 'guitar', viewMode: 'staff', tuning: null,
      visible: true, rolls: { '1': [{ start: 0, dur: 1, string: 3, fret: 3 }] } }]));
    openParts();
    w.eval('partInput.durIndex = 4; partInput.dots = 0; partInput.triplet = false;');
    setInput();
    const guitarSvg = staffSvg(3);
    const guitarStaves = JSON.parse(guitarSvg.dataset.staves || '[]');
    const guitarTreble = guitarStaves.find((staff) => staff.clef === 'treble');
    const c5Y = guitarTreble.bottom - 5 * 4; // C5 натуральное при C major
    scoreClick(guitarSvg, 1.2, c5Y);
    check('staff ввод сохраняет onset и выбранную высоту до Enter',
      Math.abs(w.eval('partsCursor.pos') - 1) < 1e-6 && w.eval('partsCursor.staffPitch') === 72 && roll().length === 1);
    key('Enter', { code: 'Enter' });
    let entered = activeNoteInRoll((note) => Math.abs(note.start - 1) < 1e-6);
    check('аппликатура минимизирует движение и при равенстве предпочитает прошлую струну',
      !!entered && entered.string === 3 && entered.fret === 5,
      JSON.stringify({ previous: roll()[0], entered }));
    check('нотная и tab-высота синхронизированы с октавным переносом гитары',
      Math.abs(w.eval(`partScoreNotePitch(songParts[0], ${JSON.stringify(entered)})`) - 72) < 1e-6);
    w.eval('partsCursor.staffPitch = null; partsCursor.staffClef = null');
    key('ArrowUp', { code: 'ArrowUp' });
    check('clef для pending staff pitch выводится из ноты без сбоя',
      w.eval('partsCursor.staffClef') === 'treble' && w.eval('partsCursor.staffPitch') === 73 &&
        activeNoteInRoll((note) => note.start === 1).fret === 5);

    // Первый палец при равных fret выбирает более высокую струну; прошлый
    // материал другого голоса не участвует в критерии движения.
    const duplicateTuning = ['E4', 'E4', 'E4', 'E4', 'E4', 'E4'];
    const tiePosition = json(`partAutoFingeringPosition({ instrument:'guitar', strings:${JSON.stringify(duplicateTuning)}, rolls:{} }, 64, 1, 0, 1, null)`);
    check('первая нота при равном fret выбирает более высокую звучащую струну',
      tiePosition && tiePosition.line === 5 && tiePosition.fret === 0, JSON.stringify(tiePosition));
    const otherVoicePosition = json(`partAutoFingeringPosition({ instrument:'guitar', rolls:{'1':[
      { start:0, dur:1, string:3, fret:3, voice:2 }
    ]} }, 60, 1, 1, 1, null)`);
    check('предыдущая нота другого голоса не влияет на аппликатуру',
      otherVoicePosition && otherVoicePosition.line === 4 && otherVoicePosition.fret === 1,
      JSON.stringify(otherVoicePosition));

    // Невозможный fret не зажимается и не транспонируется молча.
    const beforeImpossible = roll().length;
    w.eval('setPartsCursorString(1, 0, 5, 2); partsCursor.staffPitch = 120; inputPartStaffNote()');
    check('недостижимая staff-высота отклоняется с объяснением',
      roll().length === beforeImpossible && w.eval('window.__toasts.slice(-1)[0]')?.includes('нет позиции'),
      JSON.stringify({ count: roll().length, toast: w.eval('window.__toasts.slice(-1)[0]') }));
    const beforeCollision = JSON.stringify(roll());
    const occupiedPositions = json('partPitchPositions(songParts[0], 60)');
    const blockers = occupiedPositions.map((position) => ({ start: 2, dur: 1,
      string: position.line, fret: position.fret, voice: 1 }));
    w.eval(`songParts[0].rolls['1'] = ${JSON.stringify(roll().concat(blockers))};
      partsSelection = null; setPartsCursorString(1, 0, 5, 2); partsCursor.staffPitch = 72; inputPartStaffNote();`);
    check('коллизия всех playable strings отклоняет ввод, не подменяя голос/высоту',
      roll().length === beforeImpossible + blockers.length &&
        w.eval('window.__toasts.slice(-1)[0]')?.includes('заняты все подходящие струны'),
      JSON.stringify({ blockers, count: roll().length, toast: w.eval('window.__toasts.slice(-1)[0]') }));
    w.eval(`songParts[0].rolls['1'] = ${beforeCollision}; partsSelection = null; renderPartsScreen();`);

    // ---------- Keyboard pitch/time + Store undo/redo ----------
    // Перевыделяем введённую ноту после отказа выше.
    w.eval(`selectPartsNote(songParts[0], sections[0], partRollFor(songParts[0], 1).find(n => Math.abs(n.start - 1) < 1e-6), 'roll', 0)`);
    await settleHistory();
    check('staff-ввод вошёл в историю Store', w.eval('historyDebugState().length') >= 2,
      JSON.stringify(w.eval('historyDebugState()')));
    // B-12.11 этап 3: Ctrl+Shift+стрелки теперь выделение (GP), поэтому
    // функцию сдвига ноты проверяем прямым вызовом — она жива для палитры/меню.
    w.eval('moveSelectedPartNote("time", 1)');
    let edited = activeNoteInRoll((note) => note.fret === 5);
    check('moveSelectedPartNote перемещает selected note на 1/16',
      edited && Math.abs(edited.start - 1.25) < 1e-6, JSON.stringify(edited));
    await settleHistory();
    check('перемещение стало отдельным Store-шагом', w.eval('historyDebugState().length') >= 3,
      JSON.stringify(w.eval('historyDebugState()')));
    w.undoEdit();
    await wait(30);
    check('Undo возвращает прежний onset',
      activeNoteInRoll((note) => note.fret === 5)?.start === 1, JSON.stringify(roll()));
    w.redoEdit();
    await wait(30);
    check('Redo восстанавливает сдвиг',
      activeNoteInRoll((note) => note.fret === 5)?.start === 1.25, JSON.stringify(roll()));

    w.eval('moveSelectedPartNote("pitch", 1)');
    edited = activeNoteInRoll((note) => Math.abs(note.start - 1.25) < 1e-6);
    check('moveSelectedPartNote pitch меняет sounding pitch на полутон и переаппликатуривает',
      edited && Math.abs(w.eval(`partFretPitch(songParts[0], ${edited.string}, ${edited.fret})`) - 61) < 1e-6 &&
        edited.string === 4 && edited.fret === 2, JSON.stringify(edited));
    await settleHistory();
    w.undoEdit();
    await wait(30);
    check('Undo pitch возвращает исходную ноту',
      activeNoteInRoll((note) => note.start === 1.25)?.fret === 5 && activeNoteInRoll((note) => note.start === 1.25)?.string === 3,
      JSON.stringify(roll()));
    w.redoEdit();
    await wait(30);
    check('Redo pitch возвращает изменённую высоту',
      activeNoteInRoll((note) => note.start === 1.25)?.string === 4 && activeNoteInRoll((note) => note.start === 1.25)?.fret === 2,
      JSON.stringify(roll()));

    const selectedNow = activeNoteInRoll((note) => note.start === 1.25);
    w.eval('setPartsDuration(3)');
    check('палитра длительности редактирует выбранную ноту в Input',
      selectedNow && Math.abs(activeNoteInRoll((note) => note.start === 1.25).dur - 0.5) < 1e-6,
      JSON.stringify(roll()));
    await settleHistory();
    w.undoEdit();
    await wait(30);
    check('Undo длительности восстанавливает прежнюю длину',
      Math.abs(activeNoteInRoll((note) => note.start === 1.25).dur - 1) < 1e-6);
    w.redoEdit();
    await wait(30);
    check('Redo длительности возвращает новую длину',
      Math.abs(activeNoteInRoll((note) => note.start === 1.25).dur - 0.5) < 1e-6);

    // ---------- Voice selector: reassignment is explicit, stored and undoable ----------
    w.eval('partsSelection = null; setPartsCursorString(1, 0, 5, 3); partLastDigit = { fret:1, at:Date.now() }');
    const voiceSelect = w.document.getElementById('ptVoice');
    voiceSelect.value = '2';
    voiceSelect.dispatchEvent(new w.Event('change', { bubbles: true }));
    check('смена голоса сбрасывает окно двухзначного лада', w.eval('partLastDigit') === null);
    // Возвращаем выделение на конкретную ноту и переносим её в голос 2.
    w.eval(`selectPartsNote(songParts[0], sections[0], partRollFor(songParts[0], 1).find(n => Math.abs(n.start - 1.25) < 1e-6), 'roll', 0)`);
    voiceSelect.value = '2';
    voiceSelect.dispatchEvent(new w.Event('change', { bubbles: true }));
    const reassigned = activeNoteInRoll((note) => Math.abs(note.start - 1.25) < 1e-6);
    check('селектор переписывает голос выделенной ноты одной Store-командой',
      reassigned && reassigned.voice === 2 && w.songStore.log().some((entry) => entry.label === 'part/note-voice'),
      JSON.stringify(reassigned));
    await settleHistory();
    w.undoEdit();
    await wait(30);
    check('Undo возвращает выделенную ноту в голос 1',
      !Object.prototype.hasOwnProperty.call(activeNoteInRoll((note) => note.start === 1.25), 'voice'));
    w.redoEdit();
    await wait(30);
    check('Redo возвращает назначение голоса 2',
      activeNoteInRoll((note) => note.start === 1.25)?.voice === 2);
    w.saveCurrentSong();
    const saved = JSON.parse(w.localStorage.getItem('struchord_songs')).slice(-1)[0];
    check('schema v9 сериализует voice 2 для tab-note',
      saved.schemaVersion === 9 && saved.parts[0].rolls['1'].some((note) => note.voice === 2),
      JSON.stringify(saved.parts[0].rolls['1']));

    // B-12.11 этап 3 (GP): Ctrl+Shift+стрелки расширяют выделение, ноту не двигают.
    const beforeGpEdit = JSON.stringify(roll());
    key('ArrowRight', { code: 'ArrowRight', ctrlKey: true, shiftKey: true });
    check('Ctrl+Shift+→ (GP) выделяет, а не двигает ноту',
      JSON.stringify(roll()) === beforeGpEdit && !!w.eval('partsNoteRange') && w.eval('partsInputEnabled()') === true);

    console.log(`\nитого: ${passed} ok, ${failed} FAIL`);
    if (failed) process.exitCode = 1;
  } catch (error) {
    console.error('ОШИБКА:', error && error.stack ? error.stack : error);
    process.exitCode = 1;
  }
});

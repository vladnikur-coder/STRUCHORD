#!/usr/bin/env node
/*
 * B-12.9.4 «Сделать секцией».
 *
 * Проверяем тактовую адресацию в 4/4 и 3/4, Shift-диапазон в ленте и табах,
 * непрерывную отрисовку табов с маркерами, split/merge модели, перенос
 * tab/pitch rolls и sound automation, сохранение метра при объединении,
 * защиту от небезопасных повторов/границ ячеек, Custom-диалог и один undo.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'STRUCHORD.html'), 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
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
function check(name, condition, details) {
  if (condition) {
    pass++;
    console.log('ok   ' + name);
  } else {
    fail++;
    console.error('FAIL ' + name + (details ? ' — ' + details : ''));
  }
}
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function waitFor(test, label, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (test()) return true;
    await wait(20);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function makeEvent(chord, span, timeSig = null) {
  return {
    chord, span, timeSig, strumPattern: null,
    fingering: null, fingeringTuning: null, barreOff: null, fingers: null,
  };
}
function makeSection(id, type, events, timeSig = null, extra = {}) {
  return {
    id, type, customName: null, note: null, key: null, shift: null,
    timeSig, bpm: null, repeat: 1, strumPattern: null,
    squares: [{ id: id + 100, repeat: 1, customBeats: null, events }],
    ...extra,
  };
}
function baseSong(sections, extra = {}) {
  return {
    schemaVersion: 6,
    metadata: { artist: 'Тест', title: 'Сделать секцией' },
    bpm: 100, globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4',
    tuning: 'e-std', tuningNotes: null, notes: '', date: '2026-10-14',
    sections, nextId: 1000, rhythmPool: null,
    userFingerings: [], preferredFingerings: [], parts: [], ...extra,
  };
}
function loadSong(song) {
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
}
function currentState() {
  return JSON.parse(w.eval(`JSON.stringify({
    sections: sections.map(s => ({id:s.id,type:s.type,customName:s.customName,timeSig:s.timeSig,
      bpm:s.bpm,key:s.key,shift:s.shift,repeat:s.repeat,note:s.note,
      squares:s.squares.map(q => ({id:q.id,repeat:q.repeat,customBeats:q.customBeats,mark:q.mark,repeatOpen:q.repeatOpen,repeatClose:q.repeatClose,
        events:q.events.map(e => ({chord:e.chord,span:e.span,timeSig:e.timeSig,strumPattern:e.strumPattern}))}))})),
    parts:songParts.map(p => ({id:p.id,rolls:p.rolls,pitchRolls:p.pitchRolls,soundAuto:p.soundAuto})),
    soundAuto:songSoundAuto,
    rhythmPoolIsNull:songRhythmRolls===null,
    lastCommand:songStore.log().slice(-1)[0]?.label,
  })`));
}
function setMeasureRange(startSec, startUnit, endSec, endUnit) {
  w.eval(`setSectionRangeAtUnit(${Number(startSec)}, ${Number(startUnit)}, false);`);
  w.eval(`setSectionRangeAtUnit(${Number(endSec)}, ${Number(endUnit)}, true);`);
}
function clickAt(target, type, x, shiftKey = false) {
  target.dispatchEvent(new w.MouseEvent(type, {
    bubbles: true, cancelable: true, button: 0, clientX: x, clientY: 24, shiftKey,
  }));
}

(async () => {
  await waitFor(() => w.document.readyState === 'complete', 'application startup');
  await wait(60);

  // Размер такта — числитель родительского размера, не число ячеек редактора.
  loadSong(baseSong([
    makeSection(1, 'Verse', [makeEvent('C', 8)]),
    makeSection(2, 'Chorus', [makeEvent('G', 6)], '3/4'),
  ]));
  let layout = JSON.parse(w.eval(`JSON.stringify(buildSectionRangeData().layout.map(b=>[b.secId,b.barIndex,b.start,b.end]))`));
  check('полные такты считаются по 4/4 и 3/4 (даже внутри длинной ячейки)',
    JSON.stringify(layout) === JSON.stringify([[1,0,0,4],[1,1,4,8],[2,0,0,3],[2,1,3,6]]), JSON.stringify(layout));

  // Лента: клик и Shift-клик выделяют непрерывный диапазон внутри одного cell.
  w.eval('toggleTimelineMode(true)');
  let cell = w.document.querySelector('#timelineTrack .tl-cell');
  cell.getBoundingClientRect = () => ({ left: 100, right: 500, top: 0, bottom: 80, width: 400, height: 80 });
  clickAt(cell, 'click', 120, false); // 4/4, первая половина такта 1
  clickAt(cell, 'click', 340, true);  // внутри такта 2
  let timelineSummary = w.document.getElementById('timelineSectionRangeSummary').textContent;
  check('Shift-клик на ленте выбирает два полных такта',
    timelineSummary.includes('Выбрано 2 такта') && w.document.querySelectorAll('.tl-cell.is-section-range-selected').length === 1,
    timelineSummary);
  check('подсветка ленты показывает только пересечение выбранных долей',
    cell.style.getPropertyValue('--section-range-left') === '0.000%' &&
      parseFloat(cell.style.getPropertyValue('--section-range-right')) > 99,
    `${cell.style.getPropertyValue('--section-range-left')}..${cell.style.getPropertyValue('--section-range-right')}`);
  cell.dispatchEvent(new w.MouseEvent('contextmenu', {
    bubbles: true, cancelable: true, clientX: 180, clientY: 70,
  }));
  const rangeMenu = w.document.querySelector('.section-range-context');
  check('контекстное меню диапазона предлагает преобразование и снятие',
    rangeMenu && rangeMenu.querySelectorAll('[role="menuitem"]').length === 2);
  rangeMenu.querySelector('[role="menuitem"]').click();
  check('команда из контекстного меню открывает компактный выбор типа',
    !!w.document.querySelector('.make-section-overlay'));
  w.document.querySelector('.make-section-overlay .section-range-clear').click();

  // Tablature: один непрерывный горизонтальный score, маркеры секций сверху.
  loadSong(baseSong([
    makeSection(1, 'Verse', [makeEvent('C', 4), makeEvent('G', 4)]),
    makeSection(2, 'Chorus', [makeEvent('F', 4)], null, { repeat: 2 }),
  ], { parts: [{ id: 50, name: 'Гитара', instrument: 'guitar', visible: true,
    tuning: null, rolls: { '1': [{ start: 0, dur: 1, string: 5, fret: 3 }] }, pitchRolls: {} }] }));
  w.eval('togglePartsMode(true)');
  w.eval("setPartsScoreEngine('native')"); // тест родной ленты: вид «Обычный»
  const partTrack = w.document.getElementById('partsTrack');
  check('табулатуры идут одной непрерывной лентой без карточек .pt-system',
    partTrack.querySelectorAll('.pt-continuous-body').length === 1 &&
      partTrack.querySelectorAll('.pt-system').length === 0,
    `continuous=${partTrack.querySelectorAll('.pt-continuous-body').length}, block=${partTrack.querySelectorAll('.pt-system').length}`);
  check('границы/названия секций — маячки над непрерывными табами',
    partTrack.querySelectorAll('.pt-score-marker').length === 3 &&
      partTrack.querySelectorAll('.pt-section-segment').length === 3 &&
      partTrack.querySelector('.pt-score-marker').textContent.includes('Куплет'),
    `markers=${partTrack.querySelectorAll('.pt-score-marker').length}`);
  let svg = partTrack.querySelector('.pt-svg');
  svg.getBoundingClientRect = () => ({ left: 0, right: 400, top: 0, bottom: 100, width: 400, height: 100 });
  clickAt(svg, 'pointerdown', 20, false);
  clickAt(svg, 'pointerdown', 240, true);
  const tabSummary = w.document.getElementById('partsSectionRangeSummary').textContent;
  check('Shift-клик в табулатуре выделяет такты той же адресации',
    tabSummary.includes('Выбрано 2 такта') && partTrack.querySelector('.pt-measure-selection')?.getAttribute('d'), tabSummary);

  // Реальное split/merge: исходная секция режется на префикс, новую секцию и суффикс.
  const source = baseSong([
    makeSection(10, 'Verse', [makeEvent('C', 4), makeEvent('Dm', 4), makeEvent('Em', 4)]),
    makeSection(20, 'Bridge', [makeEvent('F', 4)]),
  ], {
    parts: [{ id: 70, name: 'Лады', instrument: 'guitar', visible: true, tuning: null,
      rolls: { '10': [
        { start: 0, dur: 1, string: 5, fret: 1, accent: 1 },
        { start: 4, dur: 1, string: 4, fret: 2, velocity: 77 },
        { start: 9, dur: 0.5, string: 3, fret: 4, bend: { type: 'bend', points: [[0,0],[1,1]] } },
      ] },
      pitchRolls: { '10': [
        { start: 1, dur: 1, pitch: 60, voice: 1, velocity: 88 },
        { start: 5, dur: 0.5, pitch: 64, voice: 2 },
        { start: 10, dur: 1, pitch: 67, voice: 1 },
      ] },
      soundAuto: [
        { sec: 10, unit: 1, sound: 'clean' },
        { sec: 10, unit: 5, sound: 'drive' },
        { sec: 10, unit: 10, sound: 'ambient' },
      ],
    }],
    soundAuto: [
      { sec: 10, unit: 1, sound: 'clean' },
      { sec: 10, unit: 5, sound: 'drive' },
      { sec: 10, unit: 10, sound: 'ambient' },
    ],
  });
  loadSong(source);
  setMeasureRange(10, 4.1, 10, 7.9);
  const beforeLog = w.eval('songStore.log().length');
  const result = JSON.parse(w.eval(`JSON.stringify(applyMakeSectionRange('Chorus', null))`));
  const split = currentState();
  const chosen = split.sections.find((s) => s.type === 'Chorus');
  const prefix = split.sections[0];
  const suffix = split.sections[2];
  const splitPart = split.parts[0];
  check('одна операция создаёт одну настоящую секцию в массиве секций',
    result.ok && split.sections.map(s => s.type).join('|') === 'Verse|Chorus|Verse|Bridge' &&
      chosen.squares.flatMap(q => q.events).map(e => e.chord).join('|') === 'Dm',
    JSON.stringify(split.sections.map(s => [s.type,s.squares.flatMap(q=>q.events.map(e=>e.chord))])));
  check('невыбранные такты и секции остаются на местах',
    prefix.squares.flatMap(q => q.events).map(e => e.chord).join('|') === 'C' &&
      suffix.squares.flatMap(q => q.events).map(e => e.chord).join('|') === 'Em' &&
      split.sections[3].id === 20 && split.sections[3].type === 'Bridge');
  check('tab rolls и pitchRolls сохраняют каждую ноту и свойства при переносе',
    Object.values(splitPart.rolls).flat().length === 3 && Object.values(splitPart.pitchRolls).flat().length === 3 &&
      splitPart.rolls[String(chosen.id)][0].fret === 2 && splitPart.rolls[String(chosen.id)][0].string === 4 &&
      splitPart.pitchRolls[String(chosen.id)][0].pitch === 64 && splitPart.pitchRolls[String(chosen.id)][0].voice === 2 &&
      splitPart.rolls[String(suffix.id)][0].bend.points[1][1] === 1,
    JSON.stringify({ rolls: splitPart.rolls, pitches: splitPart.pitchRolls }));
  check('позиции нот смещены к началу сохранённых фрагментов',
    splitPart.rolls['10'][0].start === 0 && splitPart.pitchRolls[String(chosen.id)][0].start === 1 &&
      splitPart.pitchRolls[String(suffix.id)][0].start === 2,
    JSON.stringify({ rolls: splitPart.rolls, pitches: splitPart.pitchRolls }));
  check('song- и part-sound automation перенесены вместе с долями',
    split.soundAuto.length === 3 && split.soundAuto.some(p => p.sec === chosen.id && p.unit === 1 && p.sound === 'drive') &&
      split.soundAuto.some(p => p.sec === suffix.id && p.unit === 2 && p.sound === 'ambient') &&
      splitPart.soundAuto.some(p => p.sec === chosen.id && p.unit === 1 && p.sound === 'drive'),
    JSON.stringify({ song: split.soundAuto, part: splitPart.soundAuto }));
  check('вся правка проходит одним songStore.dispatch',
    w.eval('songStore.log().length') === beforeLog + 1 && split.lastCommand === 'section/make-range', split.lastCommand);
  await wait(480);
  check('один undo снимает разбиение целиком', w.eval('historyDebugState().length') >= 2);
  w.eval('undoEdit()');
  await wait(60);
  check('после одного undo восстановлены исходные секции и ноты',
    w.eval('sections.map(s=>s.id).join(",")') === '10,20' &&
      JSON.parse(w.eval(`JSON.stringify(songParts[0].rolls['10'])`)).length === 3);

  // Межсекционный перенос 3/4 → 4/4: каждый исходный размер становится явным у event,
  // а абсолютные доли pitch-ролла пересчитываются в единицы новой секции.
  loadSong(baseSong([
    makeSection(31, 'Verse', [makeEvent('Am', 4)]),
    makeSection(32, 'Verse', [makeEvent('D', 3)], '3/4'),
  ], { parts: [{ id: 71, name: 'Клавиши', instrument: 'keys', visible: true,
    rolls: {}, pitchRolls: { '32': [{ start: 1, dur: 0.5, pitch: 62, velocity: 90 }] } }] }));
  setMeasureRange(31, 0.1, 32, 2.9);
  const meterResult = JSON.parse(w.eval(`JSON.stringify(applyMakeSectionRange('Custom', 'Интерлюдия'))`));
  let meterState = currentState();
  const custom = meterState.sections[0];
  const meterPitch = meterState.parts[0].pitchRolls[String(custom.id)]?.[0];
  check('диапазон через секции создаёт Custom с именем и сохраняет оба такта',
    meterResult.ok && custom.type === 'Custom' && custom.customName === 'Интерлюдия' &&
      custom.squares.flatMap(q=>q.events).map(e=>e.chord).join('|') === 'Am|D');
  check('3/4 не теряется при помещении выбранного такта в новую секцию 4/4',
    custom.timeSig === null && custom.squares.flatMap(q=>q.events)[1].timeSig === '3/4' &&
      Math.abs(meterPitch.start - 4 - 4/3) < 1e-5 && Math.abs(meterPitch.dur - 2/3) < 1e-5,
    JSON.stringify({ ts: custom.squares.flatMap(q=>q.events).map(e=>e.timeSig), pitch: meterPitch }));
  w.saveCurrentSong();
  const saved = JSON.parse(w.localStorage.getItem('struchord_songs'));
  const savedSong = saved[saved.length - 1];
  loadSong(savedSong);
  meterState = currentState();
  const reloaded = meterState.sections[0];
  check('новая секция и event-level 3/4 проходят save/load',
    reloaded.type === 'Custom' && reloaded.customName === 'Интерлюдия' &&
      reloaded.squares.flatMap(q=>q.events)[1].timeSig === '3/4' &&
      Object.values(meterState.parts[0].pitchRolls).flat().some(n => Math.abs(n.start - (4 + 4/3)) < 1e-5));

  // Предохранители не позволяют молча изменить музыку при разрезании повторов,
  // неполных тактов или ячеек, пересекающих границу.
  loadSong(baseSong([
    makeSection(41, 'Verse', [makeEvent('C', 4), makeEvent('G', 4)], null, { repeat: 2 }),
  ]));
  setMeasureRange(41, 0.1, 41, 3.9);
  let plan = w.eval('buildMakeSectionPlan()');
  check('частичный выбор повторяющейся секции безопасно отклоняется',
    plan.error && plan.error.includes('Повторяющуюся секцию'), plan.error);
  loadSong(baseSong([
    makeSection(42, 'Verse', [makeEvent('C', 4), makeEvent('G', 4)], null,
      { squares: [{ id: 142, repeat: 2, customBeats: null, events: [makeEvent('C',4),makeEvent('G',4)] }] }),
  ]));
  setMeasureRange(42, 0.1, 42, 3.9);
  plan = w.eval('buildMakeSectionPlan()');
  check('разрез повторяющегося квадрата безопасно отклоняется',
    plan.error && plan.error.includes('повторяющийся квадрат'), plan.error);
  loadSong(baseSong([makeSection(43, 'Verse', [makeEvent('C', 8)])], {
    parts: [{ id: 73, name: 'Гитара', instrument: 'guitar', visible: true,
      rolls: { '43': [{ start: 5, dur: 1, string: 4, fret: 7 }] }, pitchRolls: {} }],
  }));
  setMeasureRange(43, 0.1, 43, 3.9);
  plan = w.eval('buildMakeSectionPlan()');
  const longResult = JSON.parse(w.eval(`JSON.stringify(applyMakeSectionRange('Solo', null))`));
  const longState = currentState();
  const longSelected = longState.sections.find((s) => s.type === 'Solo');
  const longRemainder = longState.sections.find((s) => s.id === 43);
  check('длинная ячейка разрезается на выбранный такт и остаток',
    !plan.error && longResult.ok && longSelected.squares.flatMap(q=>q.events).map(e=>e.span).join('|') === '4' &&
      longRemainder.squares.flatMap(q=>q.events).map(e=>e.span).join('|') === '4' &&
      longSelected.squares.flatMap(q=>q.events)[0].chord === 'C' && longRemainder.squares.flatMap(q=>q.events)[0].chord === 'C');
  check('tab-нота после разреза длинной ячейки остаётся в суффиксе на своей доле',
    longState.parts[0].rolls['43'][0].start === 1 && longState.parts[0].rolls['43'][0].fret === 7,
    JSON.stringify(longState.parts[0].rolls));
  loadSong(baseSong([makeSection(46, 'Verse', [
    { ...makeEvent('C', 8), strumPattern: { mode: 'strum', subdivision: 2, steps: ['D','U'] } },
  ])]));
  setMeasureRange(46, 0.1, 46, 3.9);
  plan = w.eval('buildMakeSectionPlan()');
  check('ячейку со своим ритмом не режем молча',
    plan.error && plan.error.includes('своим ритмом'), plan.error);
  loadSong(baseSong([
    makeSection(44, 'Verse', [makeEvent('C', 4), makeEvent('G', 1)]),
    makeSection(45, 'Chorus', [makeEvent('D', 4)]),
  ]));
  setMeasureRange(44, 0.1, 45, 3.9);
  plan = w.eval('buildMakeSectionPlan()');
  check('неполный хвост внутри межсекционного диапазона не теряется молча',
    plan.error && plan.error.includes('фрагмент до следующей секции'), plan.error);

  // Служебные пустые squares и ритм-пулы тоже не должны исчезнуть при split.
  loadSong(baseSong([makeSection(47, 'Verse', [makeEvent('C', 4), makeEvent('G', 4)])]));
  w.eval(`sections[0].squares.splice(1, 0, { id: 747, repeat: 2, customBeats: 4, events: [] });`);
  setMeasureRange(47, 4.1, 47, 7.9);
  const emptyResult = JSON.parse(w.eval(`JSON.stringify(applyMakeSectionRange('Chorus', null))`));
  const emptyState = currentState();
  const emptySelected = emptyState.sections.find((s) => s.type === 'Chorus');
  check('пустой квадрат на границе остаётся в выбранной секции со своими свойствами',
    emptyResult.ok && emptySelected.squares.some(q => q.events.length === 0 && q.repeat === 2 && q.customBeats === 4));
  loadSong(baseSong([makeSection(48, 'Verse', [
    { ...makeEvent('C', 4), strumPattern: { mode: 'strum', subdivision: 2, steps: ['D','U'] } },
    makeEvent('G', 4),
  ])]));
  setMeasureRange(48, 0.1, 48, 3.9);
  const rhythmResult = JSON.parse(w.eval(`JSON.stringify(applyMakeSectionRange('Bridge', null))`));
  const rhythmState = currentState();
  const rhythmSelected = rhythmState.sections.find((s) => s.type === 'Bridge');
  check('свой ритм целой ячейки переносится вместе с ней',
    rhythmResult.ok && rhythmSelected.squares.flatMap(q=>q.events)[0].strumPattern?.steps?.length >= 2,
    JSON.stringify(rhythmSelected && rhythmSelected.squares));

  // Компактный диалог покрывает все типы, требует имя для Custom и сохраняет отмену.
  loadSong(baseSong([makeSection(51, 'Verse', [makeEvent('C', 4)])]));
  setMeasureRange(51, 0.1, 51, 3.9);
  w.eval('openMakeSectionDialog()');
  let dialog = w.document.querySelector('.make-section-overlay');
  check('диалог показывает все 8 типов и выбранный диапазон',
    dialog && dialog.querySelectorAll('#makeSectionType option').length === 8 &&
      dialog.querySelector('.make-section-range-label').textContent.includes('1 такт'));
  dialog.querySelector('#makeSectionType').value = 'Custom';
  dialog.querySelector('#makeSectionType').dispatchEvent(new w.Event('change', { bubbles: true }));
  dialog.querySelector('.section-range-action').click();
  check('Custom без имени не создаёт секцию и показывает подсказку',
    w.eval('sections.length') === 1 && dialog.querySelector('.make-section-error').textContent.includes('Введите название'));
  dialog.querySelector('#makeSectionCustomName').value = 'Intro reprise';
  dialog.querySelector('.section-range-action').click();
  check('Custom с именем создаёт секцию и закрывает диалог',
    w.eval('sections.some(s=>s.type==="Custom"&&s.customName==="Intro reprise")') &&
      !w.document.querySelector('.make-section-overlay'));

  console.log(`\nитого: ${pass} ok, ${fail} FAIL`);
  await wait(150);
  dom.window.close();
  process.exitCode = fail ? 1 : 0;
})().catch((error) => {
  console.error(error.stack || error);
  dom.window.close();
  process.exitCode = 1;
});

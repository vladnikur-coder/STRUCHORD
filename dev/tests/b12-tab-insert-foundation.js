#!/usr/bin/env node
/* B-12.12, 0.668: проверки результата, не наличия функций.
 * Импорт → реальный DOM (оба пути) → экспорт → открытие; ходьба и история.
 * Ввод с клавиатуры и бинарный экспорт проверяются на следующих этапах.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.join(__dirname, '..', '..');
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'dev/fixtures/b12-tab-insert.struchord'), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const virtualConsole = new VirtualConsole();
const errors = [];
virtualConsole.on('jsdomError', error => errors.push(error.message));
virtualConsole.on('error', (...args) => errors.push(args.join(' ')));
const dom = new JSDOM(fs.readFileSync(path.join(root, 'STRUCHORD.html'), 'utf8'), {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/?view=editor', virtualConsole,
  beforeParse(w) {
    w.requestAnimationFrame = cb => setTimeout(cb, 0);
    w.cancelAnimationFrame = clearTimeout;
    w.HTMLCanvasElement.prototype.getContext = () => new Proxy({
      measureText: () => ({ width: 10 }), createLinearGradient: () => ({ addColorStop() {} }),
    }, { get: (obj, key) => key in obj ? obj[key] : () => {} });
    w.URL.createObjectURL = () => 'blob:tab-foundation';
    w.URL.revokeObjectURL = () => {};
    w.HTMLAnchorElement.prototype.click = () => {};
    w.confirm = () => true;
  },
});
const w = dom.window;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let pass = 0, fail = 0;
function check(name, condition, details) {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${details ? ' — ' + details : ''}`);
  if (condition) pass++; else fail++;
}
const state = () => JSON.parse(w.eval('JSON.stringify(sections)'));
const ids = () => state()[0].squares.map(sq => sq.id).join(',');
let loadSequence = 0, loadAccepted = false;
async function load(song) {
  const tagged = clone(song);
  tagged.metadata.title += ' #' + (++loadSequence);
  w.localStorage.setItem('struchord_songs', JSON.stringify([tagged]));
  w.loadSong(0);
  await wait(70);
  loadAccepted = w.eval('DOM.songTitle.value') === tagged.metadata.title;
}
async function save() { return clone(await w.exportStruchordFile()); }
function walk(limit = 30) {
  return JSON.parse(w.eval(`(() => {
    const sr = {}, qr = {}; let walk = structureWalkState(null);
    let si = 0, sqi = 0, ei = 0; const out = [];
    for (let i = 0; i < ${limit}; i++) {
      const n = findNextEvent(si, sqi, ei, sr, qr, walk);
      if (!n) return JSON.stringify({done: true, events: out});
      out.push({square: n.square.id, tab: n.event.isTab === true, span: n.event.span, chord: n.event.chord});
      si = n.sectionIndex; sqi = n.squareIndex; ei = n.eventIndex + 1; walk = n.walk;
    }
    return JSON.stringify({done: false, events: out});
  })()`));
}
// 0.692: клетка таба больше не рисует цифры сама — она получает картинку от
// alphaTab, а состав нот лежит в data-tab-thumb. Считаем ноты оттуда.
function tabNotesIn(doc, scopeSel) {
  let total = 0;
  doc.querySelectorAll(`${scopeSel} .tab-insert-body[data-tab-thumb]`).forEach((el) => {
    try {
      total += (JSON.parse(decodeURIComponent(el.dataset.tabThumb)).n || []).length;
    } catch (_) {}
  });
  return total;
}
async function main() {
  await wait(200);
  await load(fixture);
  check('загрузчик принимает настоящий файл с табом и events: []', loadAccepted && state()[0]?.squares[0]?.type === 'tab');
  // Даёт красному прогону дойти до независимых дефектов рендера и ходьбы,
  // даже если загрузчик ещё не умеет таб. Успех импорта проверен ВЫШЕ.
  if (state()[0]?.squares[0]?.type !== 'tab') {
    w.eval(`sections = ${JSON.stringify(fixture.sections)}; nextId = 103;`);
  }
  w.render(); await wait(70);
  check('время вставки ровно 4 доли', w.eval('getSquareBeats(sections[0].squares[0], "4/4")') === 4);
  check('секция содержит 20 долей, не 16', w.eval('partSectionUnits(sections[0])') === 20);
  check('полный рендер содержит четыре лада', tabNotesIn(w.document, '.tab-insert') === 4);
  check('таб занимает все колонки своей строки', w.getComputedStyle(w.document.querySelector('.tab-insert')).gridColumn === '1 / -1');
  w.rerenderSectionSquaresDom(w.eval('sections[0]'));
  check('локальный рендер сохраняет четыре лада', tabNotesIn(w.document, '.tab-insert') === 4);
  const played = walk();
  check('ходьба заканчивается, а не зацикливается на табе', played.done, JSON.stringify(played.events.slice(0, 6)));
  check('порядок TAB → Em → Em → Em → Em', played.events.length === 5 && played.events[0].tab && played.events.slice(1).every(n => n.chord === 'Em'));
  check('время событий совпадает с длиной секции', played.events.reduce((sum, n) => sum + n.span, 0) === 20);
  w.eval('sections[0].squares[0].repeat = 2; sections[0].repeat = 2;');
  const repeated = walk();
  check('повторы квадрата и секции: 4 таба, 8 аккордов, затем конец', repeated.done && repeated.events.filter(n => n.tab).length === 4 && repeated.events.length === 12);
  w.eval('sections[0].squares[0].repeat = 1; sections[0].repeat = 1;');
  w.toggleTimelineMode(true); await wait(50);
  check('лента содержит такт таба и четыре аккорда', w.document.querySelectorAll('#timelineTrack .tl-cell').length === 5);
  check('вставка в ленте содержит те же четыре лада', tabNotesIn(w.document, '#timelineTrack .tab-insert') === 4);
  check('бой не нарисован поверх вставки в ленте', w.document.querySelectorAll('.tl-cell--tab .event-strum-preview').length === 0);
  w.toggleTimelineMode(false);
  const exported = await save();
  check('файл содержит type/beats/notes без фиктивных аккордов', exported.sections[0].squares[0].type === 'tab' && exported.sections[0].squares[0].beats === 4 && exported.sections[0].squares[0].notes.length === 4 && exported.sections[0].squares[0].events.length === 0);
  await load(exported);
  check('экспорт → открытие сохраняет струны, лады и время', loadAccepted && JSON.stringify(state()[0]?.squares[0]?.notes) === JSON.stringify(fixture.sections[0].squares[0].notes));
  const legacy = clone(fixture);
  legacy.sections[0].squares[0].notes.forEach(n => delete n.start);
  await load(legacy);
  check('последовательные ноты 0.667 получают позиции 0,1,2,3', loadAccepted && state()[0]?.squares[0]?.notes?.map(n => n.start).join(',') === '0,1,2,3');
  const dirty = clone(fixture);
  dirty.sections[0].squares[0].notes = [
    { start: 0, string: 0, fret: 0, dur: 1 },
    { start: 0, string: 1, fret: 2, dur: 1 },
    { start: 1, string: 9, fret: 3, dur: 1 },
    { start: 1, string: 1, fret: 40, dur: 1 },
    { start: 1, string: 1.5, fret: 3, dur: 1 },
    { start: 1, string: 1, fret: 3.5, dur: 1 },
    { start: 1, string: 1, fret: 3, dur: 0.3 },
    { start: 3.5, string: 1, fret: 3, dur: 1 },
    { start: 4, string: 1, fret: 3, dur: 1 },
    { start: null, string: 1, fret: 3, dur: 1 },
    { start: 2, string: 1, fret: 3, dur: 0.5, dots: 1, triplet: true },
    { start: 3, pause: true, dur: 1 },
  ];
  await load(dirty);
  const cleanNotes = state()[0]?.squares[0]?.notes || [];
  check('битые ноты отбрасываются, не превращаются в лад 24/струну 5', loadAccepted && cleanNotes.length === 4 && cleanNotes.every(n => n.pause || (n.fret <= 24 && n.string <= 5)), JSON.stringify(cleanNotes));
  check('созвучие сохраняется на одной позиции', cleanNotes.filter(n => n.start === 0).length === 2);
  check('точка, триоль и пауза переживают чтение', cleanNotes.some(n => n.dots === 1 && n.triplet === true) && cleanNotes.some(n => n.pause === true));
  const beforeBad = JSON.stringify(state());
  const badChord = clone(fixture); delete badChord.sections[0].squares[0].type;
  await load(badChord);
  check('пустые events разрешены только табу', !loadAccepted && JSON.stringify(state()) === beforeBad);
  const badLength = clone(fixture); badLength.sections[0].squares[0].beats = 5;
  await load(badLength);
  check('нецелое число тактов не принимается как корректная вставка', !loadAccepted && JSON.stringify(state()) === beforeBad);
  const oldSong = clone(fixture); oldSong.sections[0].squares.shift();
  await load(oldSong);
  const ordinary = (await save()).sections[0].squares[0];
  check('аккордовый квадрат сохраняется без новых type/beats/notes', !('type' in ordinary) && !('beats' in ordinary) && !('notes' in ordinary));
  await load(fixture);
  w.resetHistory();
  w.moveTabSquare(1, 101, 1);
  w.cloneTabSquare(1, 101); // Два действия БЕЗ ожидания debounce 400 мс.
  check('быстрые перенос и копирование создали два независимых шага', state()[0].squares.length === 3);
  w.undoEdit(); await wait(60);
  check('первое Undo отменяет только копирование', ids() === '102,101', ids());
  w.undoEdit(); await wait(60);
  check('второе Undo отменяет перенос', ids() === '101,102', ids());
  w.redoEdit(); await wait(60);
  check('Redo возвращает перенос', ids() === '102,101', ids());
  w.redoEdit(); await wait(60);
  check('второе Redo возвращает независимую копию нот', state()[0].squares.length === 3 && state()[0].squares[2].notes.length === 4);
  await load(fixture); w.resetHistory();
  w.prompt = () => '2';
  w.setSquareBeats(1, 101);
  check('длина меняется на два целых такта', state()[0].squares[0].beats === 8);
  w.undoEdit(); await wait(60);
  check('изменение длины отменяется', state()[0].squares[0].beats === 4);
  w.redoEdit(); await wait(60);
  check('изменение длины возвращается', state()[0].squares[0].beats === 8);
  w.tabInsertSetBeats(1, 101, 0.25);
  check('часть такта не принимается обработчиком длины', state()[0].squares[0].beats === 8);
  w.tabInsertSetBeats(1, 101, 20);
  check('более четырёх тактов не принимаются', state()[0].squares[0].beats === 8);
  w.eval('sections[0].squares[0].notes.push({ start: 7, string: 0, fret: 0, dur: 1 });');
  w.tabInsertSetBeats(1, 101, 4);
  check('уменьшение не отрезает существующие ноты', state()[0].squares[0].beats === 8 && state()[0].squares[0].notes.some(n => n.start === 7));
  await load(fixture); w.resetHistory();
  w.removeSquare(1, 101);
  check('удаление убирает четыре доли', w.eval('partSectionUnits(sections[0])') === 16);
  w.undoEdit(); await wait(60);
  check('Undo возвращает удалённый таб и его ноты', state()[0].squares[0].type === 'tab' && state()[0].squares[0].notes.length === 4);
  // Старый мини-редактор не должен портить каноническую модель при сохранении.
  await load(fixture); w.resetHistory();
  w.openTabInsertEditor(1, 101);
  const overlay = w.document.querySelector('.tab-insert-editor');
  overlay.querySelector('[data-tab-add]').click();
  check('список диалога обновляется до пяти строк', overlay.querySelectorAll('.tab-note-row').length === 5);
  check('черновик не меняет песню до подтверждения', state()[0].squares[0].notes.length === 4 && state()[0].squares[0].beats === 4);
  overlay.querySelector('[data-tab-cancel]').click();
  overlay.querySelector('[data-tab-confirm-leave]')?.click();
  check('Отмена восстанавливает входное состояние без шага истории', !w.document.querySelector('.tab-insert-editor') && state()[0].squares[0].notes.length === 4 && w.historyDebugState().length === 1);
  w.openTabInsertEditor(1, 101);
  w.document.querySelector('[data-tab-add]').click();
  w.document.querySelector('[data-tab-apply]').click();
  check('пятая четверть добавляет ровно один такт', state()[0].squares[0].notes.length === 5 && state()[0].squares[0].beats === 8);
  const added = await save(); await load(added);
  check('пятая нота не теряется при сохранении и открытии', loadAccepted && state()[0].squares[0].notes.length === 5 && state()[0].squares[0].notes[4].start === 4);
  await load(fixture); w.resetHistory();
  w.tabInsertSetDur(1, 101, 0, 2);
  check('длительность сдвигает хвост на одну долю и удлиняет вставку', state()[0].squares[0].notes.map(n => n.start).join(',') === '0,2,3,4' && state()[0].squares[0].beats === 8);
  w.undoEdit(); await wait(60);
  check('длительность и автоматическое удлинение отменяются вместе', state()[0].squares[0].beats === 4 && state()[0].squares[0].notes[1].start === 1);
  const harmony = clone(fixture);
  harmony.sections[0].squares[0].notes.splice(1, 0, {start: 0, string: 1, fret: 2, dur: 1});
  await load(harmony); w.resetHistory();
  w.tabInsertRemoveNote(1,101,0);
  check('удаление одной струны созвучия не сжимает время', state()[0].squares[0].notes.map(n => n.start).join(',') === '0,1,2,3');
  w.tabInsertRemoveNote(1,101,0);
  check('удаление последней струны сдвигает хвост', state()[0].squares[0].notes.map(n => n.start).join(',') === '0,1,2');
  w.tabInsertSetFret(1,101,0,40);
  check('недопустимый ввод лада не превращается в 24', state()[0].squares[0].notes[0].fret === 3);
  w.tabInsertSetFret(1, 101, 0, '');
  check('пустой ввод лада не превращается в открытую струну', state()[0].squares[0].notes[0].fret === 3);
  const inconsistent = w.tabInsertCleanNotes([{ start: 0, string: 0, fret: 0, dur: 1 }, { start: 0, string: 1, fret: 2, dur: 1, dots: 1, triplet: true }], 4, '4/4');
  check('созвучие не смешивает разные ритмические записи одной длительности', inconsistent.length === 1);
  const full = clone(fixture); full.sections[0].squares[0].beats = 16;
  full.sections[0].squares[0].notes = [{start: 15, string: 0, fret: 0, dur: 1}];
  await load(full); w.tabInsertAddNote(1,101);
  check('на пределе четырёх тактов ноты не выходят за границу', state()[0].squares[0].beats === 16 && state()[0].squares[0].notes.length === 1);
  const sixEight = clone(fixture); sixEight.globalTimeSig = '6/8'; sixEight.sections[0].squares[0].beats = 6;
  sixEight.sections[0].squares[0].notes = [{ start: 0, string: 0, fret: 0, dur: 2 }];
  await load(sixEight);
  const sixWalk = walk();
  check('таб в 6/8 не округляется в валюту четвертей', sixWalk.done && sixWalk.events[0].span === 6 && w.eval('getEventDurationForTimeSig(6, 120, "6/8")') === 1.5);
  // Контракт планировщика (не заменяет живой Web Audio бенч).
  const originalContext = w.getAudioContext, originalPluck = w.pluckString;
  let scheduled = [];
  w.getAudioContext = () => ({ currentTime: 0 });
  w.pluckString = (_ctx, options) => scheduled.push(options);
  try {
    const rhythm = { type: 'tab', beats: 4, notes: [
      { start: 0, string: 0, fret: 0, dur: 1, dots: 1 },
      { start: 1.5, string: 1, fret: 3, dur: 0.5, triplet: true },
      { start: 1.5, string: 2, fret: 2, dur: 0.5, triplet: true },
      { start: 2, pause: true, dur: 1 },
      { start: 3, string: 0, fret: 3, dur: 1 },
    ] };
    await load(fixture);
    w.playTabNotesAt(rhythm, 10, 120, '4/4', w.eval('sections[0]'));
    check('планировщик пропускает паузу, но сохраняет её время', scheduled.length === 4 && scheduled[3].startTime === 11.5);
    check('созвучие планируется одновременно', scheduled[1].startTime === 10.75 && scheduled[2].startTime === 10.75);
    check('точка и триоль меняют реальную длительность', scheduled[0].duration === 0.75 && Math.abs(scheduled[1].duration - 1/6) < 1e-9);
    check('в ABI щипка передаётся конечная панорама', scheduled.every(n => Number.isFinite(n.pan)));
    const retuned = clone(sixEight); retuned.tuning = 'drop-d'; retuned.capo = 2;
    await load(retuned); scheduled = [];
    w.playTabNotesAt(w.eval('sections[0].squares[0]'), 10, 120, '6/8', w.eval('sections[0]'));
    check('Drop D + капо 2: шестая открытая звучит E2, четверть в 6/8 длится 0.5 с', loadAccepted && scheduled.length === 1 && Math.abs(scheduled[0].freq - 82.4068892282) < 0.001 && scheduled[0].duration === 0.5);
  } finally { w.getAudioContext = originalContext; w.pluckString = originalPluck; }
  // Смена размера не должна делать уже сохранённый TAB неоткрываемым.
  await load(fixture); w.setSectionTimeSig(1, '3/4'); await wait(50);
  check('смена размера секции сохраняет ритм и округляет длину до целых тактов', state()[0].timeSig === '3/4' && state()[0].squares[0].beats === 6 && state()[0].squares[0].notes[1].start === 1 && state()[0].squares[0].events.length === 0);
  await load(fixture); w.resetHistory();
  w.eval('DOM.globalTimeSig.value = "6/8";'); w.onGlobalTimeSigChange(); await wait(50);
  check('смена 4/4 → 6/8 переводит время и ноты в восьмые', w.eval('globalTimeSig') === '6/8' && state()[0].squares[0].beats === 12 && state()[0].squares[0].notes.map(n => n.start).join(',') === '0,2,4,6' && state()[0].squares[0].notes.every(n => n.dur === 2));
  w.undoEdit(); await wait(60);
  check('смена размера с табом отменяется целиком одним шагом', w.eval('globalTimeSig') === '4/4' && state()[0].squares[0].beats === 4 && state()[0].squares[0].notes[1].start === 1);
  w.redoEdit(); await wait(60);
  const migrated = await save(); await load(migrated);
  check('после смены размера файл открывается со всеми четырьмя нотами', loadAccepted && state()[0].squares[0].beats === 12 && state()[0].squares[0].notes.length === 4 && state()[0].squares[0].events.length === 0);
  await load(full); w.resetHistory();
  const beforeMeterRejection = JSON.stringify(state());
  w.eval('DOM.globalTimeSig.value = "3/4";'); w.onGlobalTimeSigChange(); await wait(50);
  check('если нужно больше 4 тактов, глобальная смена размера отвергается без изменений', w.eval('globalTimeSig') === '4/4' && w.eval('DOM.globalTimeSig.value') === '4/4' && JSON.stringify(state()) === beforeMeterRejection && w.historyDebugState().length === 1);
  w.setSectionTimeSig(1, '3/4'); await wait(50);
  check('переполнение при смене размера секции не обрезает ноты и не меняет песню', JSON.stringify(state()) === beforeMeterRejection && w.historyDebugState().length === 1);
  const onlyTab = clone(fixture); onlyTab.sections[0].squares.pop();
  await load(onlyTab); w.toggleTimelineMode(true); await wait(50);
  check('песня из одного таба не считается пустой', w.document.getElementById('tlEmpty').hidden && tabNotesIn(w.document, '#timelineTrack') === 4);
  check('нет ошибок выполнения', errors.length === 0, errors.join('\n'));
}
main().catch(error => { fail++; console.error(error.stack); }).finally(() => {
  console.log(`итого: ${pass} ok, ${fail} FAIL`);
  dom.window.close(); process.exitCode = fail ? 1 : 0;
});

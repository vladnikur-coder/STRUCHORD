// Зонд (2026-08-25): вопрос пользователя «один удар вниз тоже пропадает?»
// Проверяем пины-одиночки против боев секции по правилу волны-7 (crit_sound).
const fs = require('fs');
const { JSDOM } = require('jsdom');
const file = process.argv[2] || '/home/user/STRUCHORD.html';
const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(w) {
    w.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }),
      clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
      moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {},
      translate() {}, rotate() {}, fillText() {}, strokeText() {},
      setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {} };
};

let bad = 0;
const ok = (name, cond, extra) => {
  console.log(`   ${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && extra !== undefined ? ' — ' + extra : ''}`);
  if (!cond) bad++;
};
const evl = (code) => w.eval(`(()=>{ ${code} })()`);
const scene = (events, secPattern) => evl(`
  sections = [{ id: 1, name: 'A', key: 'C', timeSig: null, bpm: 0, squares: [
    { id: 2, timeSig: null, strumPattern: null, customBeats: null, events: [] }
  ]}];
  sections[0].squares[0].events = ${JSON.stringify(events)};
  if (songRhythmRolls) {
    for (const key of [...songRhythmRolls.refs.keys()]) {
      if (key.startsWith('1:2:')) songRhythmRolls.refs.delete(key);
    }
    songRhythmRolls.sectionRolls.delete(1);
  }
  sections[0].strumPattern = ${JSON.stringify(secPattern || null)};
  ensureSquareRhythmRefs(sections[0], sections[0].squares[0]);
  if (songRhythmRolls) setSectionRhythmRoll(sections[0], sections[0].strumPattern);
  return 0`);
const strum = (sub, s) => ({ mode: 'strum', subdivision: sub, steps: s.split('') });
const D = (pattern, span) => ({ chord: 'C', span, timeSig: null, strumPattern: pattern || null });
const soundingText = (i) =>
  evl(`const sq = sections[0].squares[0];
       const p = rhythmSoundingForEvent(sections[0], sq, sq.events[${i}], ${i});
       return p ? p.steps.map(s=>Array.isArray(s)?s.join('+'):s).join('') : ''`);
const hasPin = (i) => evl(`return !!(songRhythmRolls && songRhythmRolls.refs.has(rhythmRefKey(1, 2, ${i})))`);
const demoteSq = () => evl('return demoteMatchingCellRhythms(sections[0], sections[0].squares[0])');

console.log('=== X1. Бой секции D_D_D_D_ (sub2); пин ячейки — ОДИН D (sub1), доля 1 ===');
scene([D(strum(1, 'D'), 1), D(null, 1)], strum(2, 'D_D_D_D_'));
let drop = demoteSq();
ok('X1a совпал с фасадом (фасад на это окно = тот же одинокий D): пин снят', drop === 1, `dropped=${drop}`);
ok('X1b звук прежний: одинокий D (записан сеткой фасада: D_)', soundingText(0) === 'D_', soundingText(0));

console.log('=== X2. Бой секции DUDUDUDU (sub2); пин ячейки — ОДИН D ===');
scene([D(strum(1, 'D'), 1), D(null, 1)], strum(2, 'DUDUDUDU'));
drop = demoteSq();
ok('X2a фасад окна = DU, пин = D_: НЕ совпал, пин жив', drop === 0 && hasPin(0), `dropped=${drop}`);
ok('X2b звук прежний: D', soundingText(0) === 'D', soundingText(0));

console.log('=== X3. Бой D_D_D_D_ (sub2); пин — один D, но записан шестнадцатыми (sub4) ===');
scene([D(strum(4, 'D_______' + '_'), 1), D(null, 1)], strum(2, 'D_D_D_D_'));
drop = demoteSq();
ok('X3a crit_sound: плотная запись того же одинокого D: пин снят', drop === 1, `dropped=${drop}`);
ok('X3b звук прежний: одинокий D (записан сеткой фасада: D_)', soundingText(0) === 'D_', soundingText(0));

console.log('=== X4. Секция БЕЗ боя; пин — один D ===');
scene([D(strum(1, 'D'), 1), D(null, 1)], null);
drop = demoteSq();
ok('X4a facade_no: правило спит, пин жив', drop === 0 && hasPin(0), `dropped=${drop}`);
ok('X4b звук прежний: D', soundingText(0) === 'D', soundingText(0));

console.log('=== X5. Бой D_D_D_D_ (sub2); пин — один D на ОКНЕ В ДВЕ ДОЛИ (span 2) ===');
scene([D(strum(2, 'D___'), 2), D(null, 1)], strum(2, 'D_D_D_D_'));
drop = demoteSq();
ok('X5a фасад на 2 долях = D_D_ (лишний D), пин = D___: пин жив', drop === 0 && hasPin(0), `dropped=${drop}`);
ok('X5b звук прежний: D на окне 2 долей (каноника: D___)', soundingText(0) === 'D___', soundingText(0));

console.log('=== X6. Бой D_D_D_D_ (sub2); пин — один D НА ПОДЪЁМЕ (sub2, "_D") ===');
scene([D(strum(2, '_D'), 1), D(null, 1)], strum(2, 'D_D_D_D_'));
drop = demoteSq();
ok('X6a фаза другая (фасад D_, пин _D): пин жив', drop === 0 && hasPin(0), `dropped=${drop}`);
ok('X6b звук прежний: _D', soundingText(0) === '_D', soundingText(0));

console.log(bad ? `\nПЛОХО: ${bad}` : '\nвсе сцены прошли');
process.exitCode = bad ? 1 : 0;

// --- Дополнение после уточнения пользователя (2026-08-25) ---
// «одиночный удар который звучит если ритм не определен не должен
//  считаться за общий бой секции... (если только такой бой не определен
//  как общий для секции самим пользователем)»
console.log('=== X7. Секция БЕЗ боя, но квадрат со старым рисунком D_D_D_D_; пин — один D ===');
evl(`
  sections = [{ id: 1, name: 'A', key: 'C', timeSig: null, bpm: 0, squares: [
    { id: 2, timeSig: null, strumPattern: ${JSON.stringify(strum(2, 'D_D_D_D_'))}, customBeats: null, events: [] }
  ]}];
  sections[0].squares[0].events = [${JSON.stringify(D(strum(1, 'D'), 1))}, ${JSON.stringify(D(null, 1))}];
  for (const key of [...songRhythmRolls.refs.keys()]) {
    if (key.startsWith('1:2:')) songRhythmRolls.refs.delete(key);
  }
  songRhythmRolls.sectionRolls.delete(1);
  sections[0].strumPattern = null;
  ensureSquareRhythmRefs(sections[0], sections[0].squares[0]);
  return 0`);
drop = demoteSq();
ok('X7a уточнение: рисунок квадрата — НЕ общий бой; пин один D живёт', drop === 0 && hasPin(0), `dropped=${drop}`);

console.log('=== X8. Секция С явным боем DUDUDUDU, квадрат со старым рисунком D_D_D_D_ ===');
evl(`
  sections = [{ id: 1, name: 'A', key: 'C', timeSig: null, bpm: 0, squares: [
    { id: 2, timeSig: null, strumPattern: ${JSON.stringify(strum(2, 'D_D_D_D_'))}, customBeats: null, events: [] }
  ]}];
  sections[0].squares[0].events = [
    ${JSON.stringify(D(strum(2, 'DU'), 1))},
    ${JSON.stringify(D(strum(1, 'D'), 1))}
  ];
  for (const key of [...songRhythmRolls.refs.keys()]) {
    if (key.startsWith('1:2:')) songRhythmRolls.refs.delete(key);
  }
  songRhythmRolls.sectionRolls.delete(1);
  sections[0].strumPattern = ${JSON.stringify(strum(2, 'DUDUDUDU'))};
  ensureSquareRhythmRefs(sections[0], sections[0].squares[0]);
  setSectionRhythmRoll(sections[0], sections[0].strumPattern);
  return 0`);
drop = demoteSq();
ok('X8a фасад = ЯВНЫЙ бой секции: пин «DU» совпал — снят', drop === 1 && !hasPin(0), `dropped=${drop}`);
ok('X8b пин «один D» (совпал с РИСУНКОМ КВАДРАТА, не с боем) — живёт', hasPin(1), 'снял зря!');

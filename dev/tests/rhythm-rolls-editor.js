// Контрактный тест волны-2: редактор пишет в рулоны (2026-08).
//
// Решения пользователя: правка расшаренной ячейки — хирургическая запись
// в свою полосу рулона (соседи не трогаются, лента живая); сетка редактора
// тоньше и кратна сетке рулона — утончается ВЕСЬ рулон (k: 2,4,8, потолок
// 24); несовместимая/более грубая сетка или другой режим — ФОРК в
// приватный рулон; подсказка связанности показывается только в редакторе.
//
// Волна-4 (2026-08): кэш изъят — все чтения ниже через проекцию
// (звучащее = хранимое), «метка» в ожиданиях — тождество рулона.
//
// Запускается из run-tests.sh.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const file = process.argv[2] || __dirname + '/../../STRUCHORD.html';
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
  console.log(`   ${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && extra ? ' — ' + extra : ''}`);
  if (!cond) bad++;
};
const evl = (code) => w.eval(`(()=>{ ${code} })()`);
evl('requestRender = function(){}; showToast = function(){}; return 0');

// Волна-4: читаем проекцию (звучащее = хранимое), кэша у событий нет.
const stepText = (i) =>
  evl(`const sq = sections[0].squares[0];
       const p = rhythmSoundingForEvent(sections[0], sq, sq.events[${i}], ${i});
       return p ? p.steps.map(s=>Array.isArray(s)?s.join('+'):s).join('') : ''`);
const subOf = (i) =>
  evl(`const sq = sections[0].squares[0];
       const p = rhythmSoundingForEvent(sections[0], sq, sq.events[${i}], ${i});
       return p ? (p.subdivision || 1) : 0`);
// Связанность — тождество рулона (id из refs; '' — ссылки нет).
const group = (i) => evl(`const r = songRhythmRolls && songRhythmRolls.refs.get(rhythmRefKey(1, 2, ${i}));
  return r ? r.roll : ''`);
const rollText = () => evl(`
  const st = songRhythmRolls;
  const ref = st.refs.get(rhythmRefKey(1, 2, 0));
  return ref ? st.pool[ref.roll].steps.map(s=>Array.isArray(s)?s.join('+'):s).join('') : '(нет)'`);
const rollSub = () => evl(`
  const st = songRhythmRolls;
  const ref = st.refs.get(rhythmRefKey(1, 2, 0));
  return ref ? st.pool[ref.roll].subdivision : 0`);

const scene = (events) => evl(`
  sections = [{ id: 1, name: 'A', key: 'C', timeSig: null, bpm: 0, squares: [
    { id: 2, timeSig: null, strumPattern: null, customBeats: null, events: [] }
  ]}];
  sections[0].squares[0].events = ${JSON.stringify(events)};
  songRhythmRolls = null;
  return 0`);
const D = (steps, span, extra) =>
  Object.assign({ chord: 'C', span, timeSig: null }, steps ? { strumPattern: steps } : {}, extra || {});
const strum = (sub, text) => ({ mode: 'strum', subdivision: sub, steps: text.split('') });

console.log('контракт волны-2: редактор и рулоны (' + file + ')');

// --- 1. Хирургическая запись в общий рулон ------------------------------
scene([D(strum(2, 'D_DU_UDU'), 4)]);
evl('return addChordAfter(1, 2, 0), 0'); // D_DU|_UDU на одном рулоне
evl(`
  const sq = sections[0].squares[0];
  const saved = { mode: 'strum', subdivision: 2, steps: 'DU__'.split('') };
  saveEventPatternToRhythmRoll(sections[0], sq, sq.events[0], 1, 2, 0, saved, 2);
  return 0`);
ok('1а полоса левой переписана', stepText(0) === 'DU__', stepText(0));
ok('1б правая полоса ленты не тронута', stepText(1) === '_UDU', stepText(1));
ok('1в рулон единый и живой (DU___UDU)', rollText() === 'DU___UDU', rollText());
ok('1г обе ячейки остались на общем рулоне', !!group(0) && group(0) === group(1), `${group(0)} vs ${group(1)}`);
ok('1д кэша нет: события рисунка не хранят (волна-4)',
  evl('return sections[0].squares[0].events.every((e) => !e.strumPattern)'), 'остался');

// --- 2. Утончение сетки ВСЕГО рулона (sub_upgrid) ------------------------
scene([D(strum(2, 'D_DU_UDU'), 4)]);
evl('return addChordAfter(1, 2, 0), 0');
evl(`
  const sq = sections[0].squares[0];
  const saved = { mode: 'strum', subdivision: 4, steps: 'D_U_____'.split('') }; // 8 шагов на 2 доли
  saveEventPatternToRhythmRoll(sections[0], sq, sq.events[0], 1, 2, 0, saved, 4);
  return 0`);
ok('2а левая на сетке 4', stepText(0) === 'D_U_____' && subOf(0) === 4, `${stepText(0)} sub ${subOf(0)}`);
ok('2б правая утончена вместе с рулоном (звук тот же)',
  stepText(1) === '__U_D_U_' && subOf(1) === 4, `${stepText(1)} sub ${subOf(1)}`);
ok('2в рулон один и на сетке 4', rollSub() === 4 && rollText() === 'D_U_______U_D_U_',
  `${rollText()} sub ${rollSub()}`);

// --- 3. ФОРК на некратной сетке (3 против 2) ------------------------------
scene([D(strum(2, 'D_DU_UDU'), 4)]);
evl('return addChordAfter(1, 2, 0), 0');
evl(`
  const sq = sections[0].squares[0];
  const saved = { mode: 'strum', subdivision: 3, steps: 'DU____'.split('') }; // 6 шагов на 2 доли
  saveEventPatternToRhythmRoll(sections[0], sq, sq.events[0], 1, 2, 0, saved, 3);
  return 0`);
ok('3а форкнутая ячейка хранит рисунок дословно', stepText(0) === 'DU____' && subOf(0) === 3,
  `${stepText(0)} sub ${subOf(0)}`);
ok('3б правая осталась на своей ленте', stepText(1) === '_UDU' && subOf(1) === 2, `${stepText(1)} sub ${subOf(1)}`);
ok('3в рулоны разошлись (связи больше нет)', group(0) !== group(1), `${group(0)} vs ${group(1)}`);
ok('3г рулоны разные', evl(`
  const st = songRhythmRolls;
  const a = st.refs.get(rhythmRefKey(1, 2, 0)), b = st.refs.get(rhythmRefKey(1, 2, 1));
  return a && b && a.roll !== b.roll`), '');

// --- 4. ФОРК на смене режима (strum -> pick) ------------------------------
scene([D(strum(2, 'D_DU_UDU'), 4)]);
evl('return addChordAfter(1, 2, 0), 0');
evl(`
  const sq = sections[0].squares[0];
  const saved = { mode: 'pick', subdivision: 2, steps: [[1],[2],[3],[4]] };
  saveEventPatternToRhythmRoll(sections[0], sq, sq.events[0], 1, 2, 0, saved, 2);
  return 0`);
ok('4а pick записан у форкнутой', stepText(0) === '1234', stepText(0));
ok('4б правая не тронута', stepText(1) === '_UDU', stepText(1));

// --- 5. Сброс: ссылка снимается, лента соседа живёт ------------------------
scene([D(strum(2, 'D_DU_UDU'), 4)]);
evl('return addChordAfter(1, 2, 0), 0');
evl(`
  // ровно как кнопка «Сбросить» редактора: ссылку сняли, выродившийся
  // рулон свели к полосе уцелевшего окна.
  const st = songRhythmRolls;
  const sq0 = sections[0].squares[0];
  const ref0 = st.refs.get(rhythmRefKey(1, 2, 0));
  st.refs.delete(rhythmRefKey(1, 2, 0));
  if (ref0) collapseOrphanRhythmRoll(st, sections[0], sq0, ref0.roll);
  sq0.events[0].strumPattern = null; // легаси-осадок, если вдруг был
  return 0`);
const survive = evl(`
  const sq = sections[0].squares[0];
  resliceSharedRhythmsInSquare(sq, '4/4', sections[0], 0, [2, 2]);
  return 0`);
ok('5а после сброса левая без рисунка и ссылки',
  evl(`return !sections[0].squares[0].events[0].strumPattern
       && !(songRhythmRolls && songRhythmRolls.refs.has(rhythmRefKey(1, 2, 0)))`), 'остался');
ok('5б правая хранит свою полосу', stepText(1) === '_UDU', stepText(1));
ok('5в идемпотентно: повтор той же перенарезки ничего не меняет', (() => {
  const before = stepText(1);
  evl(`resliceSharedRhythmsInSquare(sections[0].squares[0], '4/4', sections[0], 0, [2, 2]); return 0`);
  return stepText(1) === before;
})(), '');

// --- 6. Идемпотентность перенарезки связанной пары ------------------------
scene([D(strum(2, 'D_DU_UDU'), 4)]);
evl('return addChordAfter(1, 2, 0), 0');
evl(`
  const sq = sections[0].squares[0];
  const start = sq.events.map(e => e.span);
  sq.events[0].span = 1.5; sq.events[1].span = 2.5;
  resliceSharedRhythmsInSquare(sq, '4/4', sections[0], 0, start);
  return 0`);
const once = `${stepText(0)}|${stepText(1)}`;
evl(`
  const sq = sections[0].squares[0];
  resliceSharedRhythmsInSquare(sq, '4/4', sections[0], 0, [1.5, 2.5]);
  resliceSharedRhythmsInSquare(sq, '4/4', sections[0], 0, [1.5, 2.5]);
  return 0`);
ok('6 повторные прогоны по тем же долям не темнят', `${stepText(0)}|${stepText(1)}` === once && once === 'D_D|U_UDU',
  `${stepText(0)}|${stepText(1)}`);

console.log(bad ? `\nFAIL: ${bad}` : '\nвсе проверки прошли');
process.exit(bad ? 1 : 0);

// B-23 (2026-08-27): «−» со стороны пиннатого поглотителя терял звук
// удалённой соседки.
//
// Дословная постановка пользователя:
//   «общий бой секции D_DU_UDU; у первой ячейки кастомный бой D_XU_UXU;
//    я нажимаю минус на второй ячейке; у получившейся ячейки должен быть
//    бой D_XU_UXUD_DU_UDU»
//
// Факты до починки (репро, сцены A/C): лента поглотителя прокручивалась
// по кругу на поглощённое время (D_XU_UXUD_XU_UXU), звук удалённой
// (фасадное окно или её чужой рисунок) умирал молча. Корень: условие
// сшивки removedRef && !absorbRef покрывало зеркало B-20, но не прямое
// направление. Скрытая дыра той же ветки: тихая удалённая (секция без
// боя) обнажала прокрутку рулона на молчавшее время — удары набивались.
//
// Решения ask_user:
//   full_record — сшивать звучавшее по обеим половинам всегда, когда
//     есть хоть одна ссылка (кастом+фасад, фасад+кастом, кастом+чужой
//     кастом), из звучащих окон до операции; тихая половина — явными
//     паузами её длительности; полностью тихую запись не материализуем;
//   stays_facade — пара вообще без ссылок остаётся чистым фасадом;
//   пин ставим, только если он меняет звук (soundingWindowsEqual против
//     пост-проекции, замеренной самим движком после splice/shift);
//   честная связка (обе ссылки на одном рулоне) не трогается — её ленту
//     собирает механика окна (collapse сироты).
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
const minus = (i) => evl(`removeChordAt(1, 2, ${i}); return 0`);

console.log('--- 1. Спека: кастом + фасад, «−» на второй --------------------');
scene([D(strum(2, 'D_XU_UXU'), 4), D(null, 4)], strum(2, 'D_DU_UDU'));
ok('1а до: своя половина кастомная', soundingText(0) === 'D_XU_UXU', soundingText(0));
ok('1б до: соседка звучит фасадом', soundingText(1) === 'D_DU_UDU', soundingText(1));
minus(1);
ok('1в спека: итог D_XU_UXUD_DU_UDU', soundingText(0) === 'D_XU_UXUD_DU_UDU', soundingText(0));
ok('1г пин стоит (магия записана, не цикл)', hasPin(0), 'нет пина');
ok('1д фасад не подсунут: ровно одна порция кастома',
  soundingText(0).split('D_XU_UXU').length - 1 === 1, soundingText(0));

console.log('--- 2. Контроль B-20: фасад + кастом, «−» на второй ------------');
scene([D(null, 4), D(strum(2, 'D_XU_UXU'), 4)], strum(2, 'D_DU_UDU'));
minus(1);
ok('2а фасад поглотителя + тейп удалённой', soundingText(0) === 'D_DU_UDUD_XU_UXU', soundingText(0));

console.log('--- 3. Два РАЗНЫХ кастома, «−» на второй -----------------------');
scene([D(strum(2, 'D_XU_UXU'), 4), D(strum(2, 'U_U_U_U_'), 4)], strum(2, 'D_DU_UDU'));
minus(1);
ok('3а чужой рисунок удалённой влит, не цикл своего',
  soundingText(0) === 'D_XU_UXUU_U_U_U_', soundingText(0));

console.log('--- 4. Поглотитель справа пиннатый («−» на первой фасадной) ----');
scene([D(null, 4), D(strum(2, 'D_XU_UXU'), 4)], strum(2, 'D_DU_UDU'));
minus(0);
ok('4а фасадная часть слева записана', soundingText(0) === 'D_DU_UDUD_XU_UXU', soundingText(0));

console.log('--- 5. Поглотитель справа фасадный («−» на первой кастомной) ---');
scene([D(strum(2, 'D_XU_UXU'), 4), D(null, 4)], strum(2, 'D_DU_UDU'));
minus(0);
ok('5а зеркало спеки', soundingText(0) === 'D_XU_UXUD_DU_UDU', soundingText(0));

console.log('--- 6. stays_facade: обе общие, «−» на второй -------------------');
scene([D(null, 4), D(null, 4)], strum(2, 'D_DU_UDU'));
minus(1);
ok('6а итог — чистый фасад дважды', soundingText(0) === 'D_DU_UDUD_DU_UDU', soundingText(0));
ok('6б без пина (рулон не материализован)', !hasPin(0), String(hasPin(0)));

console.log('--- 7. Экономная ветвь: цикл пина == сшитый рисунок -------------');
scene([D(strum(2, 'DUDU'), 2), D(null, 2)], strum(2, 'DUDUDUDU'));
minus(1);
ok('7а звук тот же', soundingText(0) === 'DUDUDUDU', soundingText(0));
ok('7б пина нет — сущностей без музыки не плодим', !hasPin(0), String(hasPin(0)));

console.log('--- 8. Без боя секции: половина без рисунка играет заводской удар ---');
scene([D(strum(2, 'DUDU'), 2), D(null, 2)], null);
ok('8а до: соседка без звучащего РИСУНКА', soundingText(1) === '', soundingText(1));
ok('8б до: но на таймлайне она играет заводской удар в начале окна (t=2)',
  evl(`const sec=sections[0], sq=sec.squares[0];
       let off=0; const out=[];
       sq.events.forEach((ev,ei)=>{
         const span=ev.span||1;
         const p=rhythmSoundingForEvent(sec,sq,ev,ei);
         const sb=p ? Math.max(1,p.subdivision||1) : 1;
         const st=(p&&p.steps)?p.steps:plainHitRhythm(span,1,'strum').steps;
         st.forEach((s,k)=>{ if(s!=='_') out.push(off+k/sb); });
         off+=span; });
       return out.join(',')`) === '0,0.5,1,1.5,2', 'таймлайн до');
minus(1);
ok('8в заводской удар записан, не затёрт и не удвоен: DUDUD___ (удар на t=2)',
  soundingText(0) === 'DUDUD___', soundingText(0));
ok('8г пин стоит (иначе кассета прокрутилась бы по кругу)', hasPin(0), 'нет пина');
ok('8д таймлайн после == таймлайну до (ударов ровно 5, позиции те же)',
  evl(`const sec=sections[0], sq=sec.squares[0];
       let off=0; const out=[];
       sq.events.forEach((ev,ei)=>{
         const span=ev.span||1;
         const p=rhythmSoundingForEvent(sec,sq,ev,ei);
         const sb=p ? Math.max(1,p.subdivision||1) : 1;
         const st=(p&&p.steps)?p.steps:plainHitRhythm(span,1,'strum').steps;
         st.forEach((s,k)=>{ if(s!=='_') out.push(off+k/sb); });
         off+=span; });
       return out.join(',')`) === '0,0.5,1,1.5,2', 'таймлайн после');

console.log('--- 9. Честная связка, «−» на второй -----------------------------');
scene([D(strum(2, 'D_DU_UDU'), 4)], strum(2, 'D_DU_UDU'));
evl('addChordAfter(1, 2, 0); return 0');
ok('9а связка звучит половинами', soundingText(0) === 'D_DU' && soundingText(1) === '_UDU',
  `${soundingText(0)}|${soundingText(1)}`);
minus(1);
ok('9б лента собралась целиком', soundingText(0) === 'D_DU_UDU', soundingText(0));
ok('9в сверка с фасадом сняла пин (ритм == бою секции)', !hasPin(0), String(hasPin(0)));

console.log('--- 10. После сшивки итог НЕ следует за сменой боя секции ------');
scene([D(strum(2, 'D_XU_UXU'), 4), D(null, 4)], strum(2, 'D_DU_UDU'));
minus(1);
evl(`sections[0].strumPattern = { mode: 'strum', subdivision: 2, steps: 'XDXDXDXD'.split('') };
     setSectionRhythmRoll(sections[0], sections[0].strumPattern); return 0`);
ok('10а сшитый приватный рулон стоит на месте при смене фасада',
  soundingText(0) === 'D_XU_UXUD_DU_UDU', soundingText(0));

if (bad) {
  console.log(`\nFAIL: ${bad}`);
  process.exit(1);
}
console.log('\nвсе проверки прошли');

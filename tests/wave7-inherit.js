// Волна-7 (2026-08-25): автонаследование — пин ячейки, совпавший с боем
// секции, снимается, ячейка снова наследует общий ритм.
//
// Дословная постановка пользователя:
//   «если ритм ячейки полностью совпадает с ритмом секции, то он не должен
//    считаться кастомным (внутри ячейки). тоесть, если ритм ячейки в какой
//    то момент совпадает с ритмом секции, кастомный ритм внутри этой
//    ячейки должен удаляться, а ячейка наследовать общий ритм секции»
//
// Решения ask_user:
//   trig_all — проверка на всех четырёх событиях: сейв из редактора,
//     отпускание ручки протяжки, установка боя секции, загрузка файла;
//   crit_sound — совпадение по ЗВУКУ (позиции и типы ударов побитово,
//     плотность записи безразлична);
//   facade_no — без явного боя у секции правило спит (пин «один удар»
//     при пустой секции не трогаем);
//   scope (custom) — «рисунка квадрата не существует, мы отменили эту
//     фичу»: область только пины ячеек (поле квадрата читается лишь ради
//     старых сейвов и само участвует в фасаде).
// Тишина волны-5 не пострадает: заводскому фасаду пустой секции (один
// удар) она не равна.
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

// Сцена: события квадрата + опционный бой секции (как редактор секции:
// положили — зеркалим в секционный рулон, убрали — снимаем).
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
  // Пины материализуются лениво первым писателем — как в проде (волна-4):
  // без ensure pool'а ссылок на ячейки просто ещё нет.
  ensureSquareRhythmRefs(sections[0], sections[0].squares[0]);
  if (songRhythmRolls) setSectionRhythmRoll(sections[0], sections[0].strumPattern);
  return 0`);
const strum = (sub, s) => ({ mode: 'strum', subdivision: sub, steps: s.split('') });
const pick = (sub, steps) => ({ mode: 'pick', subdivision: sub, steps });
const D = (pattern, span) => ({ chord: 'C', span, timeSig: null, strumPattern: pattern || null });

const soundingText = (i) =>
  evl(`const sq = sections[0].squares[0];
       const p = rhythmSoundingForEvent(sections[0], sq, sq.events[${i}], ${i});
       return p ? p.steps.map(s=>Array.isArray(s)?s.join('+'):s).join('') : ''`);
const hasPin = (i) => evl(`return !!(songRhythmRolls && songRhythmRolls.refs.has(rhythmRefKey(1, 2, ${i})))`);
const demoteSq = () => evl('return demoteMatchingCellRhythms(sections[0], sections[0].squares[0])');

// Жест как в проде (onUp зеркалит волна-7: после растворения — demote).
const gStart = (ei) => evl(`
  globalThis.__g = { ei: ${ei || 0}, startSpans: sections[0].squares[0].events.map((e) => e.span) };
  return 0`);
const gMove = (nsp) => evl(`
  const sq = sections[0].squares[0];
  ${JSON.stringify(nsp)}.forEach((v, i) => { sq.events[i].span = v; });
  resliceSharedRhythmsInSquare(sq, '4/4', sections[0], globalThis.__g.ei, globalThis.__g.startSpans);
  return 0`);
const gUp = () => evl(`
  const sq = sections[0].squares[0];
  resliceSharedRhythmsInSquare(sq, '4/4', sections[0], globalThis.__g.ei, globalThis.__g.startSpans);
  dissolveSewnRhythmPair(songRhythmRolls, sections[0], sq, globalThis.__g.ei);
  demoteMatchingCellRhythms(sections[0], sq);
  return 0`);

// --- 1. Пин == бой секции (та же запись) — распускается ------------------
scene([D(strum(2, 'DU'), 1), D(null, 1)], strum(2, 'DUDUDUDU'));
ok('1а до demote: пин есть', hasPin(0), 'нет пина');
ok('1б demote снял ровно 1', demoteSq() === 1, String(demoteSq()));
ok('1в пина больше нет — ячейка наследует', !hasPin(0), 'пин остался');
ok('1г звук не изменился: DU', soundingText(0) === 'DU', soundingText(0));
evl(`sections[0].strumPattern = { mode: 'strum', subdivision: 2, steps: 'XUXUXUXU'.split('') };
     setSectionRhythmRoll(sections[0], sections[0].strumPattern); return 0`);
ok('1д после смены боя секции ячейка СЛЕДУЕТ: XU', soundingText(0) === 'XU', soundingText(0));

// --- 2. Совпадение по ЗВУКУ, а не по записи (sub 4 против sub 2) ---------
scene([D(strum(4, 'D_U_'), 1), D(null, 1)], strum(2, 'DUDUDUDU'));
ok('2а плотная запись той же музыки распускается', demoteSq() === 1, String(demoteSq()));
ok('2б звук тот же: DU (уже фасад)', soundingText(0) === 'DU', soundingText(0));

// --- 3. НЕ совпадает — пин живёт -----------------------------------------
scene([D(strum(2, 'DU'), 1), D(null, 1)], strum(2, 'DDDDDDDD'));
ok('3а другой рисунок не тронут', demoteSq() === 0 && hasPin(0), `dropped=${demoteSq()}`);
ok('3б звучит своё: DU', soundingText(0) === 'DU', soundingText(0));

// --- 4. facade_no: секция без боя — правило спит --------------------------
scene([D(strum(2, 'DU'), 1), D(null, 1)], null);
ok('4а без боя секции пин живёт', demoteSq() === 0 && hasPin(0), 'снял!');
ok('4б звучит своё: DU', soundingText(0) === 'DU', soundingText(0));

// --- 5. Смена боя секции: совпавшая сдаёт пин, несовпавшая — нет ----------
scene([D(strum(2, 'DU'), 1), D(strum(2, 'UU'), 1)], null);
demoteSq();
ok('5а без боя оба пина живы', hasPin(0) && hasPin(1), `${hasPin(0)}${hasPin(1)}`);
evl(`sections[0].strumPattern = { mode: 'strum', subdivision: 2, steps: 'DUDUDUDU'.split('') };
     setSectionRhythmRoll(sections[0], sections[0].strumPattern);
     return demoteMatchingCellRhythmsInSection(sections[0])`);
ok('5б с боем DU: совпавшая ячейка 0 сдалась, ячейка 1 жива', !hasPin(0) && hasPin(1),
  `${hasPin(0)}${hasPin(1)}`);
evl(`sections[0].strumPattern = { mode: 'strum', subdivision: 2, steps: 'XDXDXDXD'.split('') };
     setSectionRhythmRoll(sections[0], sections[0].strumPattern); return 0`);
ok('5в сдавшаяся следует за секцией: XD', soundingText(0) === 'XD', soundingText(0));
ok('5г уцелевшая играет своё: UU', soundingText(1) === 'UU', soundingText(1));

// --- 6. Тишина волны-5: боевой секции не равна — живёт --------------------
scene([D(strum(2, '____'), 2), D(null, 2)], strum(2, 'DUDUDUDU'));
ok('6а явная тишина не снимается', demoteSq() === 0 && hasPin(0), 'тишину сняло!');
ok('6б тишина и стоит', soundingText(0) === '____', soundingText(0));

// --- 7. Честное совпадение тишины (секция из одних пауз) ------------------
scene([D(strum(2, '__'), 1), D(null, 1)], strum(2, '________'));
ok('7а секция-пустыня == тишина ячейки: распускается', demoteSq() === 1, String(demoteSq()));
ok('7б звук всё та же тишина', soundingText(0) === '__', soundingText(0));

// --- 8. Загрузка: тот же проход, что зовёт loadSongFromObject -------------
scene([D(strum(2, 'DU'), 1), D(null, 1)], strum(2, 'DUDUDUDU'));
ok('8а песенный проход снимает совпадающий пин',
  evl('return demoteMatchingCellRhythmsInSong()') === 1 && !hasPin(0), `dropped=${evl('return 0')}`);
ok('8б звук после «загрузки» прежний', soundingText(0) === 'DU', soundingText(0));

// --- 9. Фаза: сравнение ПОЗИЦИОННОЕ, а не по буквам рисунка ---------------
scene([D(null, 1), D(null, 1), D(strum(2, '_U'), 1), D(strum(2, 'DU'), 1)],
      strum(2, 'D_DU_U_U'));
// фасад: [0..1)='D_', [1..2)='DU', [2..3)='_U', [3..4)='_U'
const dropped9 = demoteSq();
ok('9а ячейка [2..3) с окном «_U» == фасад с её фазой: сдана', dropped9 === 1 && !hasPin(2),
  `dropped=${dropped9}`);
ok('9б ячейка [3..4) с окном «DU» != фасад «_U»: пин жив', hasPin(3), 'снял зря!');
ok('9в звук квадрата не изменился ни в одной ячейке', (() => {
  return soundingText(0) === 'D_' && soundingText(1) === 'DU'
    && soundingText(2) === '_U' && soundingText(3) === 'DU';
})(), `${soundingText(0)}|${soundingText(1)}|${soundingText(2)}|${soundingText(3)}`);

// --- 10. Режимы не путаем: перебор != бой с теми же позициями --------------
scene([D(pick(2, [[6], []]), 1), D(null, 1)], strum(2, 'DUDUDUDU'));
ok('10а щипок 6-й струны не равен бойному D: пин жив', demoteSq() === 0 && hasPin(0), 'снял зря!');

// --- 11. Триггер mouseup (реальный путь onUp): лента -> наследство --------
scene([D(strum(2, 'DU'), 2), D(null, 2)], strum(2, 'DUDUDUDU'));
gStart(0);
gMove([1, 3]);
gUp();
ok('11а после жеста ни одного пина: весь квадрат звучит фасадом',
  !hasPin(0) && !hasPin(1), `${hasPin(0)}${hasPin(1)}`);
ok('11б звук весь жест стоял: DU', soundingText(0) === 'DU', soundingText(0));
ok('11в звук весь жест стоял: DUDUDU', soundingText(1) === 'DUDUDU', soundingText(1));
evl(`sections[0].strumPattern = { mode: 'strum', subdivision: 2, steps: 'UUUUUUUU'.split('') };
     setSectionRhythmRoll(sections[0], sections[0].strumPattern); return 0`);
ok('11г наследство восстановлено: ячейки следуют за секцией',
  soundingText(0) === 'UU' && soundingText(1) === 'UUUUUU', `${soundingText(0)}|${soundingText(1)}`);

// --- 12. B-20: структурные операции завершаются сверкой с фасадом ---------
// Дефект-репро пользователя (2026-08-26): бой секции задан, ячейка запинена
// тем же звучанием, деление «+» дало честную связку — окна половин совпали
// с фасадом, а плашки кастома висели вечно (демоция волны-7 звала только
// на сейвах боёв и загрузке). Решения: all_structural (сверка на всех
// структурных операциях), per_cell (снимаем по одной, остаток связки не
// трогаем), toast (о каждом снятии — тост).
evl(`window.__b20toasts = [];
     const __ot20 = showToast;
     showToast = (m) => { window.__b20toasts.push(m); __ot20 && __ot20(m); };
     return 0`);
const toasts20 = () => evl('return window.__b20toasts.splice(0)');
const demoteToasts = () => toasts20().filter((t) => t.indexOf('снят с пина') >= 0);

// 12: пин == фасаду на весь такт, деление «+» -> обе половины звучат фасадом.
scene([D(strum(2, 'D_DU_UDU'), 4)], strum(2, 'D_DU_UDU'));
ok('12а до деления пин стоит', hasPin(0));
toasts20();
evl('addChordAfter(1, 2, 0); return 0');
ok('12б после «+» пинов не осталось (окна половин == фасад)',
  !hasPin(0) && !hasPin(1), `${hasPin(0)}${hasPin(1)}`);
ok('12в тосты о снятии: по одному на ячейку', demoteToasts().length === 2,
  JSON.stringify(demoteToasts()));
ok('12г звук половин прежний', soundingText(0) === 'D_DU' && soundingText(1) === '_UDU',
  `${soundingText(0)}|${soundingText(1)}`);

// 13: частичная связка (per_cell): первая половина == фасад, вторая — нет.
scene([D(strum(2, 'D_DU_UUU'), 4)], strum(2, 'D_DU_UDU'));
toasts20();
evl('addChordAfter(1, 2, 0); return 0');
ok('13а снята только совпавшая: per_cell', !hasPin(0) && hasPin(1),
  `${hasPin(0)}${hasPin(1)}`);
const demoted13 = demoteToasts();
ok('13б тост один, про ячейку 1', demoted13.length === 1
  && demoted13[0].indexOf('ячейки 1') >= 0, JSON.stringify(demoted13));

// 14: поглощение «−»: поглотившее окно (полный такт) звучит фасадом.
// Состояние собираем напрямую: ячейка 2 доли на полнотактовой ленте
// (краевой случай старых сейвов/жестов), соседняя пустая. После «−»
// поглотитель берёт весь такт, окно == фасад -> settle снимает пин.
scene([D(strum(2, 'D_DU'), 2), D(null, 2)], strum(2, 'D_DU_UDU'));
evl(`const st14 = ensureRhythmStorage();
     const ref14 = st14.refs.get(rhythmRefKey(1, 2, 0));
     st14.pool[ref14.roll].steps = 'D_DU_UDU'.split('');
     st14.pool[ref14.roll].subdivision = 2;
     ref14.anchor = 0; return 0`);
toasts20();
evl('removeChordAt(1, 2, 1); return 0');
ok('14а после «−» пин снят: поглотившее окно == фасад', !hasPin(0),
  String(hasPin(0)));
const demoted14 = demoteToasts();
ok('14б тост о снятии показан', demoted14.length === 1, JSON.stringify(demoted14));
ok('14в звук поглотителя прежний', soundingText(0) === 'D_DU_UDU', soundingText(0));

// 15: меню размера (прямая смена span): ужатие 4 -> 2 делает окно равным фасаду.
scene([D(strum(2, 'D_DU_UDU'), 4), D(null, 4)], strum(2, 'D_DU_UDU'));
toasts20();
evl('changeChordSpanDirect(1, 2, 0, 2); return 0');
ok('15а после ужатия в меню пин снят', !hasPin(0), String(hasPin(0)));
ok('15б тост показан', demoteToasts().length === 1, JSON.stringify(demoteToasts()));
ok('15в звук ужатой ячейки прежний', soundingText(0) === 'D_DU', soundingText(0));

// --- 16. B-20 решение Б: «−» перенимает ленту (траектория зонда #53) ------
// per_cell снял пин с совпавшей половины связки; «−» на ленточной половине:
// поглотитель без ссылки ОБЯЗАН получить сшитую ленту (своя часть = фасад,
// удалённая = её тейп) — звук до и после операции тождествен.
scene([D(strum(2, 'D_DU_UUU'), 4)], strum(2, 'D_DU_UDU'));
evl('addChordAfter(1, 2, 0); return 0'); // связка; cell0 сдан (== фасад), cell1 ленточный
const soundBefore16 = `${soundingText(0)}|${soundingText(1)}`;
toasts20();
evl('removeChordAt(1, 2, 1); return 0');
ok('16а поглотитель перенял ленту (пин появился)', hasPin(0), String(hasPin(0)));
ok('16б звук за весь период прежний: ' + soundBefore16.replace('|', ''),
  soundingText(0) === 'D_DU_UUU', soundingText(0));
ok('16в лишнего: снимать после перенятия нечего (тостов нет)',
  demoteToasts().length === 0, JSON.stringify(demoteToasts()));

// 17. Целиком сданная связка: «−» остаётся на фасаде (лента ≡ фасад, пинов нет).
scene([D(strum(2, 'D_DU_UDU'), 4)], strum(2, 'D_DU_UDU'));
evl('addChordAfter(1, 2, 0); return 0'); // обе половины сданы
toasts20();
evl('removeChordAt(1, 2, 1); return 0');
ok('17а пинов не возникло (обе части были без пина)', !hasPin(0), String(hasPin(0)));
ok('17б звук склейки прежний (фасад ≡ лента)', soundingText(0) === 'D_DU_UDU', soundingText(0));

if (bad) {
  console.log(`\nFAIL: ${bad}`);
  process.exit(1);
}
console.log('\nвсе проверки прошли');

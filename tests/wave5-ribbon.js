// Волна-5 (2026-08): «сквозная лента соседей» при ресайзе.
//
// Дословная спека пользователя:
//   наш патч не привел к желаемому результату
//   мне нужно чтобы при ресайзе двух стоящих рядом ячеек, ритм внутри них
//   не менялся(только в случае если у них разное количество ударов на долю)
//   пример:
//     D_DU_UDU|D_XU_UXU
//     D_DU_U|DUD_XU_UXU
//     D_DU_UDUD_X|U_UXU
//   если ритм в рядом стоящей ячейке не определен, то он должен
//   восприниматься как пустой ритм(________)
//   если ритм в рядом стоящей ячейке определен как общий для секции, то
//   ритм внутри ячейки должен быть взят из общего
//   если тип ритма в соседних ячейках отличается(бой и перебор), это не
//   должно быть препятствием
//
// Решения пользователя (ask_user): сквозная лента — для ВСЕХ соседей, как
// в примере; разное дробление — общая сетка (ряд как у связок, потолок
// 24), общей нет — не сшиваем; пустая — лента тишины (удар-в-начале
// пропадает, принято); наследник — застывает на месте жеста; тип ритма —
// режим читается по шагу (рулон 'mixed'); сшивка — только на момент
// правки, на отпускании мыши ячейки снова независимы.
//
// Жесты здесь воспроизводят прод дословно: origSpans защёлкивается в
// gStart (pointerdown), дальше при каждом ходе (gMove) вызывается
// resliceSharedRhythmsInSquare с теми же долями «до жеста», а gUp —
// onUp: финальный проход + растворение временной сшивки.
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

const scene = (events) => evl(`
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
  sections[0].strumPattern = null;
  return 0`);
const strum = (sub, s) => ({ mode: 'strum', subdivision: sub, steps: s.split('') });
const pick = (sub, steps) => ({ mode: 'pick', subdivision: sub, steps });
const D = (pattern, span, extra) => Object.assign({ chord: 'C', span, timeSig: null, strumPattern: pattern || null }, extra || {});

const soundingText = (i) =>
  evl(`const sq = sections[0].squares[0];
       const p = rhythmSoundingForEvent(sections[0], sq, sq.events[${i}], ${i});
       return p ? p.steps.map(s=>Array.isArray(s)?s.join('+'):s).join('') : ''`);
const hasOwn = (i) =>
  evl(`return !!((songRhythmRolls && songRhythmRolls.refs.has(rhythmRefKey(1, 2, ${i})))
       || sections[0].squares[0].events[${i}].strumPattern)`);
const group = (i) => evl(`const r = songRhythmRolls && songRhythmRolls.refs.get(rhythmRefKey(1, 2, ${i}));
  return r ? r.roll : ''`);
const rollOf = (i) => evl(`const r = songRhythmRolls.refs.get(rhythmRefKey(1, 2, ${i}));
  return r ? songRhythmRolls.pool[r.roll] : null`);

// Жест как в проде.
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
  return 0`);

// --- 1. Пример из спеки дословно: 16 шагов не двигаются ни на одном ходу
scene([D(strum(2, 'D_DU_UDU'), 4), D(strum(2, 'D_XU_UXU'), 4)]);
gStart(0);
gMove([3, 5]);
ok('1а ход 1 влево: D_DU_U', soundingText(0) === 'D_DU_U', soundingText(0));
ok('1б ход 1 влево: DUD_XU_UXU', soundingText(1) === 'DUD_XU_UXU', soundingText(1));
ok('1в жест: одна временная лента',
  group(0) !== '' && group(0) === group(1) && rollOf(0) && rollOf(0).transient === true,
  `${group(0)}/${group(1)}`);
gMove([5.5, 2.5]);
ok('1г ход 2 вправо: D_DU_UDUD_X', soundingText(0) === 'D_DU_UDUD_X', soundingText(0));
ok('1д ход 2 вправо: U_UXU', soundingText(1) === 'U_UXU', soundingText(1));
ok('1е лента 16 шагов цела на любом ходу',
  `${soundingText(0)}${soundingText(1)}` === 'D_DU_UDUD_XU_UXU', `${soundingText(0)}|${soundingText(1)}`);
gUp();
ok('1ж mouseup: два приватных рулона, звук тот же',
  group(0) !== '' && group(1) !== '' && group(0) !== group(1)
    && soundingText(0) === 'D_DU_UDUD_X' && soundingText(1) === 'U_UXU',
  `${soundingText(0)}|${soundingText(1)} ${group(0)}/${group(1)}`);
ok('1з приватные рулоны несут ровно свои куски',
  rollOf(0) && rollOf(0).steps.length === 11 && rollOf(1) && rollOf(1).steps.length === 5,
  `${rollOf(0) && rollOf(0).steps.length}/${rollOf(1) && rollOf(1).steps.length}`);
// Обратимость жеста: тянем обратно к исходным долям — лента собирается
// из текущих кусков в ту же ось, и окна возвращают дословный исходник.
gStart(0);
gMove([4, 4]);
ok('1и обратный ход: D_DU_UDU', soundingText(0) === 'D_DU_UDU', soundingText(0));
ok('1к обратный ход: D_XU_UXU', soundingText(1) === 'D_XU_UXU', soundingText(1));
gUp();

// --- 2. Пустая соседка = лента тишины (удар-в-начале пропадает — принято)
scene([D(strum(2, 'D_DU_UDU'), 4), D(null, 4)]);
ok('2а до жеста у пустой рисунка нет', soundingText(1) === '' && !hasOwn(1), soundingText(1) || '(тишина планировщика)');
gStart(0);
gMove([3, 5]);
ok('2б пустая стала лентой тишины: удары левой на месте, дальше явные паузы',
  soundingText(1) === 'DU________', soundingText(1));
ok('2в своя ячейка режется позиционно', soundingText(0) === 'D_DU_U', soundingText(0));
ok('2г лента пары 16 шагов цела',
  `${soundingText(0)}${soundingText(1)}` === 'D_DU_UDU________', `${soundingText(0)}|${soundingText(1)}`);
gUp();
ok('2д mouseup: тишина — её приватный рулон', hasOwn(1) && soundingText(1) === 'DU________', soundingText(1));

// --- 3. Наследник застывает, дальний наследник продолжает течь за фасадом
scene([D(strum(2, 'DUDU'), 2), D(null, 2), D(null, 4)]);
evl(`sections[0].strumPattern = { mode:'strum', subdivision:2, steps:'D_X_D_X_'.split('') }; return 0`);
ok('3а до жеста средняя звучит фасадом (срез с фазой)', soundingText(1) === 'D_X_', soundingText(1));
gStart(0);
gMove([1, 3, 4]);
ok('3б застывший наследник читает ленту от границы', soundingText(1) === 'DUD_X_', soundingText(1));
ok('3в дальний наследник не тронут', !hasOwn(2), 'записан');
ok('3г дальний звучит фасадом по новым долям', soundingText(2) === 'D_X_D_X_', soundingText(2));
gUp();
ok('3д mouseup: средняя — приватный рулон', hasOwn(1) && soundingText(1) === 'DUD_X_', soundingText(1));
evl(`sections[0].strumPattern = { mode:'strum', subdivision:2, steps:'UUUUUUUU'.split('') }; return 0`);
ok('3е застывший НЕ следует за новым боем', soundingText(1) === 'DUD_X_', soundingText(1));
ok('3ж дальний подхватил новый бой', soundingText(2) === 'UUUUUUUU', soundingText(2));

// --- 4. Бой + перебор: лента mixed, режим по шагу, сейв кругом
scene([D(strum(2, 'D_D_'), 2), D(pick(2, [[6], [], [4, 3], []]), 2)]);
gStart(0);
gMove([3, 1]);
// Волна-6: лента канонизирована до sub 1 — щипок стоит на той же доле,
// запись короче ('D_D_6' при sub2 и 'DD6' при sub1 — одна и та же музыка).
ok('4а левая вобрала щипок с границы (канон.)', soundingText(0) === 'DD6', soundingText(0));
ok('4б правая — свой остаток ленты', soundingText(1) === '4+3', soundingText(1));
ok('4в временный рулон mixed',
  group(0) === group(1) && rollOf(0) && rollOf(0).mode === 'mixed', rollOf(0) && rollOf(0).mode);
ok('4г превью mixed рисуется: 4 шага, 1 pick, 1 down', (() => {
  const r = evl(`const { preview } = buildStrumPreviewEls({ mode:'mixed', subdivision:2, steps:['D','_',[6],[]] });
    return preview.querySelectorAll('.strum-step').length + ':' +
           preview.querySelectorAll('.pick').length + ':' +
           preview.querySelectorAll('.down').length`);
  return r === '4:1:1';
})(), '');
ok('4д mouseup: два приватных mixed-рулона', (() => {
  gUp();
  return group(0) !== group(1) && rollOf(0) && rollOf(0).mode === 'mixed'
    && rollOf(1) && rollOf(1).mode === 'mixed';
})(), `${rollOf(0) && rollOf(0).mode}/${rollOf(1) && rollOf(1).mode}`);
ok('4е сейв-круг: mixed переживает serialize/adopt', (() => {
  const before = `${soundingText(0)}|${soundingText(1)}`;
  const applied = evl(`
    const rp = JSON.parse(JSON.stringify(serializeRhythmPoolForSave()));
    return rp && adoptRhythmPoolFromSong(rp) ? 1 : 0`);
  const after = `${soundingText(0)}|${soundingText(1)}`;
  return applied === 1 && before === after;
})(), `${soundingText(0)}|${soundingText(1)}`);
ok('4ж mixed-рулон в сейве — с режимом mixed', (() => {
  const mode = evl(`
    const rp = serializeRhythmPoolForSave();
    return rp ? rp.pool[songRhythmRolls.refs.get(rhythmRefKey(1, 2, 0)).roll].mode : 'нет'`);
  return mode === 'mixed';
})(), evl(`const rp = serializeRhythmPoolForSave(); return rp ? rp.pool[songRhythmRolls.refs.get(rhythmRefKey(1, 2, 0)).roll].mode : 'нет'`));

// --- 5. Общей сетки нет (sub 5 против sub 2): не сшиваем, старые правила
scene([D(strum(5, 'DUUDD'), 1), D(strum(2, 'DU'), 1)]);
gStart(0);
gMove([0.5, 1.5]);
ok('5а несшиваемая пара: левая обрезана по-старому (regrid + цикл)', soundingText(0) === 'D_U_U', soundingText(0));
ok('5б несшиваемая пара: правая добрана циклом по-старому', soundingText(1) === 'DUD', soundingText(1));
ok('5в сшивки не было', group(0) !== group(1) && !(rollOf(0) && rollOf(0).transient), `${group(0)}/${group(1)}`);

// --- 6. Граница внутри честной связки («+»): позиционный срез, связка жива
scene([D(strum(2, 'D_DU_UDU'), 4)]);
evl('return addChordAfter(1, 2, 0), 0');
gStart(0);
gMove([1, 3]);
ok('6а связанная пара: позиционный срез левой', soundingText(0) === 'D_', soundingText(0));
ok('6б связанная пара: позиционный срез правой', soundingText(1) === 'DU_UDU', soundingText(1));
gUp();
ok('6в mouseup НЕ разрушает честную связку', group(0) !== '' && group(0) === group(1), `${group(0)}/${group(1)}`);
ok('6г лента связки не переписана (8 шагов)', rollOf(0) && rollOf(0).steps.length === 8, rollOf(0) && rollOf(0).steps.length);

// --- 7. Граница внутри связки из трёх: связка не распадается, лента та же
scene([D(strum(2, 'D_DU_UDU'), 4)]);
evl('return addChordAfter(1, 2, 0), 0');
evl('return addChordAfter(1, 2, 1), 0');
ok('7а связка из трёх на одном рулоне', group(0) === group(1) && group(1) === group(2), `${group(0)}/${group(1)}/${group(2)}`);
gStart(1);
gMove([2, 0.5, 1.5]);
ok('7б середина режется позиционно', soundingText(1) === '_', soundingText(1));
ok('7в хвост читает ленту от новой границы', soundingText(2) === 'UDU', soundingText(2));
ok('7г первая треть неподвижна', soundingText(0) === 'D_DU', soundingText(0));
gUp();
ok('7д mouseup: связка из трёх жива', group(0) === group(1) && group(1) === group(2), `${group(0)}/${group(1)}/${group(2)}`);

// --- 8. Клик по ручке без протяжки: ничего не сшивается
scene([D(strum(2, 'D_D_D_D_'), 4), D(null, 4)]);
evl(`sections[0].squares[0].strumPattern = { mode:'strum', subdivision:2, steps:'X_X_X_X_'.split('') }; return 0`);
gStart(0);
gUp(); // нажал и отпустил, граница не двигалась
ok('8а клик без протяжки наследника не застывает', !hasOwn(1), 'застыл');
ok('8б звук правой по-прежнему фасадный', soundingText(1) === 'X_X_X_X_', soundingText(1));

if (bad) {
  console.log(`\nFAIL: ${bad}`);
  process.exit(1);
}
console.log('\nвсе проверки прошли');

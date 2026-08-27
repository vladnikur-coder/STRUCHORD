// Волна-6 (2026-08-25): канонизация сетки + сквозная лента по цепочке.
//
// Дословная спека пользователя:
//   «если ритм записан восьмыми, а сдвиг был сделан на одну шестнадцатую,
//    ритм для корректного сдвига переделывается под шестнадцатые (что
//    правильно), но при следующем сдвиге на следующую шестнадцатую, ритм
//    всё ещё записан шестнадцатыми, хотя это перегружено и нелогично»
//   «Нашел ненужное усложнение для пользователя» — про ту же перегрузку.
//
// Решения ask_user:
//   deep_bad — глубокая протяжка должна сшивать ВСЮ цепочку затронутых
//     ячеек, а не пару у ручки;
//   dissolve_all — на отпускании каждая ячейка цепочки получает свой
//     приватный рулон;
//   outlier (custom) — «пусть сетка у выбивающейся ячейки сбрасывается до
//     подавляющего значения, а её ритм очищается, с уведомлением»;
//   канонизация — обратный ход сетки до самой грубой без потерь.
//
// Жесты воспроизводят прод: gStart защёлкивает origSpans (pointerdown),
// gMove пишет доли и зовёт resliceSharedRhythmsInSquare с долями «до
// жеста», gUp — финальный проход onUp + растворение временной сшивки.
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
const D = (pattern, span, extra) => Object.assign({ chord: 'C', span, timeSig: null, strumPattern: pattern || null }, extra || {});

const soundingText = (i) =>
  evl(`const sq = sections[0].squares[0];
       const p = rhythmSoundingForEvent(sections[0], sq, sq.events[${i}], ${i});
       return p ? p.steps.map(s=>Array.isArray(s)?s.join('+'):s).join('') : ''`);
const group = (i) => evl(`const r = songRhythmRolls && songRhythmRolls.refs.get(rhythmRefKey(1, 2, ${i}));
  return r ? r.roll : ''`);
const rollOf = (i) => evl(`const r = songRhythmRolls.refs.get(rhythmRefKey(1, 2, ${i}));
  return r ? songRhythmRolls.pool[r.roll] : null`);
const subOf = (i) => { const r = rollOf(i); return r ? Math.max(1, r.subdivision || 1) : 0; };

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

// Перехват тостов (уведомления о выбивающихся)
evl(`window.__toasts = [];
     const __origToast = showToast;
     showToast = (m) => { __toasts.push(m); return __origToast(m); };
     return 0`);
const toasts = () => evl('return window.__toasts.slice()');
const clearToasts = () => evl('window.__toasts = []; return 0');

// --- 1. Канонизация: спека пользователя дословно -------------------------
// восьмые -> +1/16 (шестнадцатые, правильно) -> ещё +1/16 (снова восьмые!)
scene([D(strum(2, 'DU'), 1), D(null, 1)]);
gStart(0);
gMove([1.25, 0.75]);
ok('1а первая 1/16: лента ушла в шестнадцатые (sub 4)', subOf(0) === 4, String(subOf(0)));
ok('1б музыка на месте: DU + тишина', soundingText(0).startsWith('D') && soundingText(0).includes('U'),
  soundingText(0));
gMove([1.5, 0.5]);
ok('1в вторая 1/16: сетка канонизирована обратно в восьмые (sub 2)', subOf(0) === 2, String(subOf(0)));
ok('1г звук побитово тот же: DU_', soundingText(0) === 'DU_', soundingText(0));
ok('1д правая — тишина', soundingText(1) === '_', soundingText(1));
gUp();
// B-06: пустая правая при необъявленном бое секции рулона НЕ получает —
// дематериализация: ни ссылки, ни записанной тишины.
ok('1е mouseup: левая приватная в восьмых; правая дематериализована (B-06)',
  group(0) !== '' && group(1) === '' && subOf(0) === 2,
  `${group(0)}/${group(1)} sub ${subOf(0)}/${subOf(1)}`);
ok('1ж после mouseup правая — без рисунка (удар+тишина планировщика, B-06)',
  soundingText(0) === 'DU_' && soundingText(1) === '',
  `${soundingText(0)}|${soundingText(1)}`);

// 1б-серия: скачок сразу на 1/32, затем на чётную восьмую — лесенка сходится
scene([D(strum(2, 'DU'), 1), D(null, 1)]);
gStart(0);
gMove([1.125, 0.875]);
// B-03: лесенка утончения теперь пошаговая ×2 и останавливается на
// ПЕРВОЙ достаточной сетке: до B-03 она шла ×2/×4 курсами и из sub 2
// достигала только 4 и 16, перешагивая sub 8 (заметка «так было и до
// волны-6» снята). Геометрия 1/32 (1.125 доли) целая на sub 8 — на
// нём и остановились; звук тот же.
ok('1з 1/32: лента ушла в sub 8 (B-03: минимальная достаточная)', subOf(0) === 8, String(subOf(0)));
gMove([1.5, 0.5]);
ok('1и обратно на восьмую: канонизировано до sub 2 одним проходом', subOf(0) === 2, String(subOf(0)));
ok('1к звук тот же: DU_', soundingText(0) === 'DU_', soundingText(0));
gUp();

// 1в-серия: настоящий шестнадцатый удар БЛОКИРУЕТ укрупнение
// ('DU__' при sub 4 = удар на 1/16 — не сворачивается; внимание: 'D_U_'
// при sub 4 — это восьмые, записанные шестнадцатыми, она канонизируется)
scene([D(strum(4, 'DU__'), 1), D(null, 1)]);
gStart(0);
gMove([1.5, 0.5]);
ok('1л контент с настоящей шестнадцатой: сетка остаётся sub 4', subOf(0) === 4, String(subOf(0)));
ok('1м звук не тронут', soundingText(0) === 'DU____', soundingText(0));
gUp();

// --- 2. Цепочка: глубокая протяжка сшивает ВСЕ затронутые ячейки ---------
scene([D(strum(2, 'DU'), 1), D(strum(2, 'XX'), 1), D(strum(2, 'D_'), 1), D(strum(2, 'U_'), 1)]);
gStart(0);
gMove([2.5, 0.0625, 0.4375, 1]);
ok('2а вся цепочка на одной временной ленте', (() => {
  const g0 = group(0), g1 = group(1), g2 = group(2);
  return g0 !== '' && g0 === g1 && g1 === g2 && rollOf(0) && rollOf(0).transient === true;
})(), `${group(0)}/${group(1)}/${group(2)}`);
ok('2б дальняя ячейка вне ленты', group(3) !== '' && group(3) !== group(0), `${group(3)} vs ${group(0)}`);
ok('2в лента поднялась на sub 16 (минимальная под геометрию жеста)', subOf(0) === 16, String(subOf(0)));
ok('2г левая вобрала музыку соседей позиционно', (() => {
  const s = soundingText(0);
  return s.indexOf('D') === 0 && s.indexOf('U') === 8 && s.indexOf('X') === 16 && s.lastIndexOf('D') === 32;
})(), soundingText(0));
ok('2д задавленная ячейка: один шаг тишины (зона покоя второй пустышки)',
  soundingText(1) === '_', soundingText(1));
ok('2е резаная вторая: хвост пустых шагов', soundingText(2) === '_______', soundingText(2));
// канонизация добралась и до собственного рулона четвёртой: 'U_' при
// sub 2 и 'U' при sub 1 — один удар на нулевой доле, музыка та же
ok('2ж четвёртая звучит как была (канон. U)', soundingText(3) === 'U', soundingText(3));
ok('2з музыка квадрата целиком не сдвинулась', (() => {
  // удары на тех же абсолютных долях: 0, .5, 1, 1.5, 2, 3
  const hits = [];
  for (let i = 0; i < 4; i++) {
    const txt = soundingText(i);
    const sub = evl(`const p = rhythmSoundingForEvent(sections[0], sections[0].squares[0], sections[0].squares[0].events[${i}], ${i});
                      return p ? (p.subdivision || 1) : 1`);
    const off = evl(`return sections[0].squares[0].events.slice(0, ${i}).reduce((a, e) => a + e.span, 0)`);
    txt.split('').forEach((ch, k) => { if (ch !== '_') hits.push(off + k / sub + ch); });
  }
  return hits.join(',') === '0D,0.5U,1X,1.5X,2D,3U';
})(), 'hits');
gUp();
// B-06: задавленная и резаная (окна — чистая тишина при необъявленном бое
// секции) приватных рулонов НЕ получают — дематериализованы (с тостами:
// у обеих бой был). У звучащих (0 и 3) — приватные, transient не осталось.
ok('2и mouseup: звучащие — приватные рулоны; тихие дематериализованы (B-06)', (() => {
  const r0 = rollOf(0), r3 = rollOf(3);
  return group(1) === '' && group(2) === ''
    && r0 && r3 && !r0.transient && !r3.transient;
})(), `${group(0)}/${group(1)}/${group(2)}/${group(3)}`);
ok('2к левая после mouseup: канон sub 2, кусок «DUXXD»', subOf(0) === 2 && soundingText(0) === 'DUXXD',
  `${subOf(0)} ${soundingText(0)}`);
ok('2л задавленная: дематериализована (B-06), рисунка нет',
  group(1) === '' && soundingText(1) === '', soundingText(1) || '(рисунка нет)');
ok('2м резаная вторая: дематериализована (B-06), рисунка нет',
  group(2) === '' && soundingText(2) === '', soundingText(2) || '(рисунка нет)');
ok('2н четвёртая без изменений (канон. sub 1)', soundingText(3) === 'U' && subOf(3) === 1, `${soundingText(3)} sub${subOf(3)}`);
ok('2н·тосты: у обеих тихих бой был — два уведомления «ни одного удара» (B-06)',
  toasts().filter((m) => m.indexOf('в окне не осталось') >= 0).length === 2,
  JSON.stringify(toasts()));
// Обратный ход: возвращаем доли как исходные — музыка собирается дословно
gStart(0);
gMove([1, 1, 1, 1]);
ok('2о обратный ход: DU', soundingText(0) === 'DU', soundingText(0));
ok('2п обратный ход: XX', soundingText(1) === 'XX', soundingText(1));
ok('2р обратный ход: D_', soundingText(2) === 'D_', soundingText(2));
ok('2с обратный ход: U (канон.)', soundingText(3) === 'U', soundingText(3));
gUp();
ok('2т после обратного жеста: восьмые у 0/1/2, sub 1 у одиночного удара',
  subOf(0) === 2 && subOf(1) === 2 && subOf(3) === 1, `${subOf(0)}/${subOf(1)}/${subOf(3)}`);

// --- 3. Выбивающаяся ячейка: тишина + один тост + сетка сброшена ---------
clearToasts();
scene([D(strum(2, 'DU'), 1), D(strum(2, 'XX'), 1), D(strum(5, 'D____'), 1), D(strum(2, 'U_'), 1)]);
gStart(0);
gMove([2.5, 0.0625, 0.4375, 1]);
ok('3а цепочка сшилась по сетке под пару (sub до утончения — 2/после — по геометрии)',
  group(0) !== '' && group(0) === group(1) && group(1) === group(2), `${group(0)}..`);
ok('3б выбивающаяся (третья) очищена: тишина на её окне', soundingText(2) === '_______', soundingText(2));
ok('3в соседи не пострадали: левая вобрала XX позиционно', (() => {
  const s = soundingText(0);
  return s.indexOf('D') === 0 && s.indexOf('U') === 8 && s.indexOf('X') === 16;
})(), soundingText(0));
ok('3г вылетело ровно ОДНО уведомление про очищение', (() => {
  const t = toasts().filter((m) => m.indexOf('очищен') >= 0);
  return t.length === 1 && t[0].indexOf('3') >= 0;
})(), JSON.stringify(toasts()));
// углублённый ход в том же жесте: тост НЕ спамится заново
gMove([2.75, 0.0625, 0.1875, 1]);
ok('3д повторный ход жеста: тот же один тост', toasts().filter((m) => m.indexOf('очищен') >= 0).length === 1,
  JSON.stringify(toasts()));
gUp();
// B-06: бой секции не объявлен — записанной тишине конец: рулона нет
// ВОВСЕ (sub 5 исчезла вместе с пином), ячейка стала обычной пустой.
ok('3е выбивающаяся после mouseup: пин не записан вовсе, sub 5 исчезла (B-06)',
  group(2) === '' && !rollOf(2), `sub=${rollOf(2) && rollOf(2).subdivision}`);
ok('3ж выбивающаяся: дематериализована — рисунка нет (B-06)',
  group(2) === '' && soundingText(2) === '', soundingText(2) || '(рисунка нет)');
ok('3з остальные звучат как музыка пары', soundingText(0).indexOf('D') === 0 && soundingText(3) === 'U',
  `${soundingText(0)}|${soundingText(3)}`);

// --- 4. Клик без протяжки — лента не собирается (гвард волны-5 жив) -----
// (пул при первом reslice строится лениво — это по проекту; проверяем,
// что transient-рулонов не появилось и звук не сменился)
// рисунки 'DX'-типа несводимы к грубой сетке — запись обязана стоять на
// месте символ в символ добуквенно
scene([D(strum(2, 'DU'), 1), D(strum(2, 'XX'), 1), D(strum(2, 'DX'), 1)]);
const snd = () => `${soundingText(0)}|${soundingText(1)}|${soundingText(2)}`;
const snd0 = snd();
gStart(0);
gMove([1, 1, 1]);
gUp();
ok('4а клик: звук не изменился', snd() === snd0, `${snd0} -> ${snd()}`);
ok('4б клик: ни одного transient-рулона', (() => {
  return ![0, 1, 2].some((i) => { const r = rollOf(i); return r && r.transient; });
})(), `${group(0)}/${group(1)}/${group(2)}`);

if (bad) {
  console.log(`\nFAIL: ${bad}`);
  process.exit(1);
}
console.log('\nвсе проверки прошли');

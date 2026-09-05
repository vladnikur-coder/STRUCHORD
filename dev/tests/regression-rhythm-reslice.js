// Регрессионный тест общего ритма поделённых ячеек (волна «нарезка при
// ресайзе», 2026-08-22).
//
// Дословная спека пользователя:
//   ячейка 4/4, ритм D_DU_UDU
//   нажал «+»            -> D_DU|_UDU
//   ресайз на одну восьмую       -> D_D|U_UDU
//   ресайз на одну шестнадцатую  -> D___D_U|___U_D_U_
//
// Механика: addChordAfter ставит обеим половинам общую метку
// rhythmGroup; растяжка границы (writeSpans/onUp в attachResizeHandlers)
// склеивает шаги пары и режет по новой границе
// (resliceSharedRhythmsInSquare). Чужие соседи без метки не трогаются;
// граница «не на шаге рисунка» — тоже (половины шага не существует).
//
// Волна-2 «Рулон и окна» (2026-08): связанность = тождество рулона, а
// хранимый кэш ячейки = ЗВУЧАЩЕЕ ОКНО ленты над её долей. Поэтому у
// ячеек с собственным рисунком хранимый байт после операций стал окном
// (trim/loop исходника): звук и показ посимвольно прежние (золотой
// слепок: displayed == окно), меняется только записанное число шагов:
//   F (чужие на ресайзе [3,5]):  D_D_D_D_ -> D_D_D_ | U_U_U_U_ -> U_U_U_U_U_
//   I (разные режимы, не склеены): то же для левой; pick-сторона добирает цикл
//   M (пара несшиваемая): левая -> D_D_D_
//   T/U (минус чужой/пустой сосед): поглотитель 8 долей -> цикл х2
// Эти ожидания переписаны по факту новой модели и звуконейтральны.
//
// Волна-3 (2026-08): звук и показ читают проекцию (окно на рулон);
// сшивка смешанных пар отменена — ячейка без своего рисунка больше НЕ
// материализует унаследованный срез при протяжке границы, наследство
// живёт (зонд: «старая застряла, новая следует за секцией»). Сцены
// L/O/P переписаны под это: проверяют звук через soundingText.
//
// Волна-4 (2026-08): материализованный кэш изъят — событие рисунка не
// хранит вовсе, покрытая пулом ячейка живёт только ссылкой на рулон.
// «Хранимый = звучащее» схлопнулось: звучащее и есть хранимое. Поэтому
// все чтения ниже — только проекция (soundingText), а «метка» в
// ожиданиях — тождество рулона (group возвращает id рулона из refs).
// Сцена J переписана в круг сохранить-загрузить: сейв несёт пул
// (schemaVersion 2, у событий нет strumPattern), после загрузки связка
// жива. Сцены W/X — новые: секционный бой не роняет пул, дроп выливает
// окна в события.
//
// Волна-5 (2026-08), «сквозная лента соседей»: протяжка границы сшивает
// пару в один временный рулон по долям ДО жеста, и обе ячейки читают его
// позиционно — ритм стоит на месте, ползёт только граница (спека:
// D_DU_UDU|D_XU_UXU -> D_DU_U|DUD_XU_UXU -> D_DU_UDUD_X|U_UXU). Пустая
// входит лентой тишины (удар-в-начале у неё пропадает — принято спекой),
// наследник — застывшим срезом фасада и дальше за боем секции НЕ
// следует; разные режимы дают рулон 'mixed' (режим по шагу); общей
// подсетки до 24 нет — пара не сшивается, старые правила. На отпускании
// мыши сшивка растворяется в два приватных рулона; честные связки от
// «+» не распадаются. Сцены F/I/L/N/O/P переписаны под это поведение.
//
// Запускается из run-tests.sh вместе с остальными. Вторым аргументом
// можно передать путь к другой копии файла (прогон red/green).
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
// Звук ячейки через единую проекцию (окно на рулон, иначе фасад);
// '' — рисунка нет вовсе (планировщик играет «удар + тишина»). Волна-4:
// это же и есть ХРАНИМОЕ содержимое — кэша у событий больше нет.
const soundingText = (i) =>
  evl(`const sq = sections[0].squares[0];
       const p = rhythmSoundingForEvent(sections[0], sq, sq.events[${i}], ${i});
       return p ? p.steps.map(s=>Array.isArray(s)?s.join('+'):s).join('') : ''`);
const subOf = (i) =>
  evl(`const sq = sections[0].squares[0];
       const p = rhythmSoundingForEvent(sections[0], sq, sq.events[${i}], ${i});
       return p ? (p.subdivision || 1) : 0`);
// «Свой ритм» ячейки волны-4: ссылка на рулон (кэша нет; встроенный
// байт здесь — только легаси-вкрапление до ближайшего писателя).
const hasOwn = (i) =>
  evl(`return !!((songRhythmRolls && songRhythmRolls.refs.has(rhythmRefKey(1, 2, ${i})))
       || sections[0].squares[0].events[${i}].strumPattern)`);
const spans = () => evl('return sections[0].squares[0].events.map(e=>e.span).join(",")');
// Связанность — тождество рулона: возвращаем id рулона ячейки ('' нет ссылки).
const group = (i) => evl(`const r = songRhythmRolls && songRhythmRolls.refs.get(rhythmRefKey(1, 2, ${i}));
  return r ? r.roll : ''`);
const setSpans = (arr) => {
  // На копии «до» функции перерезки ещё нет (или она старая) — прогон
  // обязан остаться красным по проверкам, а не упасть с ReferenceError.
  try {
    evl(`arr=${JSON.stringify(arr)}; const sq=sections[0].squares[0]; const start=sq.events.map(e=>e.span); arr.forEach((v,i)=>{ sq.events[i].span=v; }); if (typeof resliceSharedRhythmsInSquare === 'function') resliceSharedRhythmsInSquare(sq, "4/4", sections[0], ${'EI'}, start); return 0`.replace('EI', String(arr._ei || 0)));
  } catch (e) { /* старая копия: только доли сдвинутся, рисунок — нет */ }
};

// Отпускание ручки тем же жестом (волна-5): в проде это onUp —
// растворение временной сшивки пары в два приватных рулона.
const release = (ei) =>
  evl(`dissolveSewnRhythmPair(songRhythmRolls, sections[0], sections[0].squares[0], ${ei || 0}); return 0`);

// Сцена: секция, квадрат 4/4, ячейки по описанию.
const scene = (events) => evl(`
  sections = [{ id: 1, name: 'A', key: 'C', timeSig: null, bpm: 0, squares: [
    { id: 2, timeSig: null, strumPattern: null, customBeats: null, events: [] }
  ]}];
  sections[0].squares[0].events = ${JSON.stringify(events)};
  // Сцена собирается в обход писателей: хирургически снимаем ссылки ЭТОГО
  // квадрата — следующий писатель перестроит его точечно (ensure), как в
  // проде при правке sections мимо загрузчика. Пул целиком НЕ обнуляем:
  // полный мигратор с самопроверкой — путь загрузки, а не правки (он
  // текстово консервативен к сетке: расширенное окно 4|D___D_U_ не равно
  // записанному 2|D_DU, и такие честные пары жили бы без пула).
  if (songRhythmRolls) {
    for (const key of [...songRhythmRolls.refs.keys()]) {
      if (key.startsWith('1:2:')) songRhythmRolls.refs.delete(key);
    }
    songRhythmRolls.sectionRolls.delete(1);
  }
  return 0`);
// Рендер и тосты нам не нужны — только данные.
evl('requestRender = function(){}; showToast = function(){}; return 0');

const D = (steps, span, extra) =>
  Object.assign({ chord: 'C', span, timeSig: null }, steps ? { strumPattern: steps } : {}, extra || {});
const strum = (sub, text) => ({ mode: 'strum', subdivision: sub, steps: text.split('') });

console.log('регрессия: общий ритм поделённых ячеек при ресайзе (' + file + ')');

// --- A. Деление: D_DU_UDU -> D_DU|_UDU ---------------------------------
scene([D(strum(2, 'D_DU_UDU'), 4)]);
evl('return addChordAfter(1, 2, 0), 0');
ok('A1 деление пополам: доли 2,2', spans() === '2,2', spans());
ok('A2 левая D_DU', soundingText(0) === 'D_DU', soundingText(0));
ok('A3 правая _UDU', soundingText(1) === '_UDU', soundingText(1));
ok('A4 связка жива: обе ячейки на одном рулоне', !!group(0) && group(0) === group(1), `${group(0)} vs ${group(1)}`);
ok('A5 кэша нет: события рисунка не хранят (волна-4)',
  evl('return sections[0].squares[0].events.every((e) => !e.strumPattern)'), 'остался');

// --- B. Ресайз на восьмую: D_D|U_UDU -----------------------------------
setSpans([1.5, 2.5]);
ok('B1 ресайз -1/8: левая D_D', soundingText(0) === 'D_D', soundingText(0));
ok('B2 ресайз -1/8: правая U_UDU', soundingText(1) === 'U_UDU', soundingText(1));
ok('B3 связка пережила перерезку (рулон общий)', !!group(0) && group(0) === group(1), `${group(0)} vs ${group(1)}`);
// Показ/звук режутся той же формулой: срез левой ячейки — ровно D_D, и
// это одновременно ХРАНИМОЕ (кэша нет — B1 читает проекцию).
ok('B4 проекция согласована с удар в удар', soundingText(0) === 'D_D', soundingText(0));

// --- C. Назад на 2/2: рисунок восстановился полностью -------------------
setSpans([2, 2]);
ok('C1 возврат: D_DU', soundingText(0) === 'D_DU', soundingText(0));
ok('C2 возврат: _UDU', soundingText(1) === '_UDU', soundingText(1));

// --- D. Ресайз на восьмую вправо: D_DU_|UDU -----------------------------
setSpans([2.5, 1.5]);
ok('D1 +1/8: левая D_DU_', soundingText(0) === 'D_DU_', soundingText(0));
ok('D2 +1/8: правая UDU', soundingText(1) === 'UDU', soundingText(1));

// --- E. Граница тоньше шага рисунка (1.75 при восьмых) — сетка утончается.
// Состояние после D: левая D_DU_ (2.5), правая UDU (1.5), обе sub 2.
// Тянем левую до 1.75: срез по восьмым дробный -> пара переходит на
// шестнадцатые (удар + пустой шаг), срез целочисленный.
setSpans([1.75, 2.25]);
ok('E1 пересетка: левая D___D_U', soundingText(0) === 'D___D_U', soundingText(0));
ok('E2 пересетка: правая ___U_D_U_', soundingText(1) === '___U_D_U_', soundingText(1));
ok('E3 пересетка: дробление стало 4', subOf(0) === 4 && subOf(1) === 4, `${subOf(0)}/${subOf(1)}`);
ok('E4 суммарный ритм тот же, что звучал', `${soundingText(0)}${soundingText(1)}` === 'D___D_U___U_D_U_',
  `${soundingText(0)}|${soundingText(1)}`);

// --- F. Чужие соседи: протяжка границы сшивает пару в сквозную ленту ---
// (волна-5): обе читают ОДИН временный рулон позиционно — удары стоят на
// месте, ползёт только граница. Удар D на доле 3.0 такта остаётся на
// ней и уходит в правую ячейку вместе с границей. На mouseup — два
// приватных рулона с тем же звуком.
scene([D(strum(2, 'D_D_D_D_'), 4), D(strum(2, 'U_U_U_U_'), 4)]);
setSpans([3, 5]);
// Волна-6: канонизация — записи укрупнены до самой грубой сетки без
// потерь (D_D_D_ при sub2 и DDD при sub1 — одна и та же музыка побитово).
ok('F1 без метки: левая хранит звучащее окно (канон.)', soundingText(0) === 'DDD', soundingText(0));
ok('F2 без метки: правая читает ленту от границы (канон.)', soundingText(1) === 'DUUUU', soundingText(1));
ok('F2б жест: пара на временном общем рулоне', !!group(0) && group(0) === group(1), `${group(0)} / ${group(1)}`);
release(0);
ok('F2в mouseup: приватные рулоны, звук тот же (канон.)',
  group(0) !== '' && group(1) !== '' && group(0) !== group(1)
    && soundingText(0) === 'DDD' && soundingText(1) === 'DUUUU',
  `${soundingText(0)}|${soundingText(1)} ${group(0)}/${group(1)}`);
// Разные метки — тоже чужие: сшивка та же.
scene([
  D(strum(2, 'D_D_D_D_'), 4, { strumPattern: Object.assign(strum(2, 'D_D_D_D_'), { rhythmGroup: 'rgA' }) }),
  D(strum(2, 'U_U_U_U_'), 4, { strumPattern: Object.assign(strum(2, 'U_U_U_U_'), { rhythmGroup: 'rgB' }) }),
]);
setSpans([3, 5]);
ok('F3 разные метки: левая — звучащее окно (канон.)', soundingText(0) === 'DDD', soundingText(0));
ok('F4 разные метки: правая — лента от границы (канон.)', soundingText(1) === 'DUUUU', soundingText(1));

// --- G. Рекурсивное деление: цепочка из трёх ячеек -----------------------
scene([D(strum(2, 'D_DU_UDU'), 4)]);
evl('return addChordAfter(1, 2, 0), 0');
evl('return addChordAfter(1, 2, 1), 0');
ok('G1 двойное деление: доли 2,1,1', spans() === '2,1,1', spans());
ok('G2 рулон унаследован всеми тремя', !!group(0) && group(0) === group(1) && group(1) === group(2),
  `${group(0)} / ${group(1)} / ${group(2)}`);
setSpans([1.5, 1, 1.5]);
ok('G3 нарезка цепочки: D_D', soundingText(0) === 'D_D', soundingText(0));
ok('G4 нарезка цепочки: U_', soundingText(1) === 'U_', soundingText(1));
ok('G5 нарезка цепочки: UDU', soundingText(2) === 'UDU', soundingText(2));
ok('G6 суммарный ритм неизменен', `${soundingText(0)}${soundingText(1)}${soundingText(2)}` === 'D_DU_UDU',
  `${soundingText(0)}|${soundingText(1)}|${soundingText(2)}`);

// --- H. Шестнадцатые: D___D_U|___U_D_U_ ----------------------------------
scene([D(strum(4, 'D___D_U___U_D_U_'), 4)]);
evl('return addChordAfter(1, 2, 0), 0');
// Волна-6: лента шестнадцатых канонизирована в восьмые — музыка та же
// (D@0, D@1.0, U@1.5 в каждом окне), запись вдвое короче.
ok('H1 деление 16-х: каноническая запись', soundingText(0) === 'D_DU' && soundingText(1) === '_UDU',
  `${soundingText(0)}|${soundingText(1)}`);
setSpans([1.75, 2.25]);
ok('H2 ресайз -1/16: левая D___D_U', soundingText(0) === 'D___D_U', soundingText(0));
ok('H3 ресайз -1/16: правая ___U_D_U_', soundingText(1) === '___U_D_U_', soundingText(1));

// --- I. Несовместимые пары не склеиваются --------------------------------
scene([
  D(null, 4, { strumPattern: Object.assign(strum(2, 'D_D_D_D_'), { rhythmGroup: 'rgA' }) }),
  D(null, 4, { strumPattern: Object.assign(strum(4, 'U_U_U_U_U_U_U_U_'), { rhythmGroup: 'rgA' }) }),
]);
setSpans([3, 5]);
// Связанная пара с РАЗНЫМ дроблением (sub 2 + sub 4): пересекаем левую
// на общую сетку 4 и режем — музыка пары сохраняется ВКЛЮЧАЯ хвост
// левой (её последние четыре шестнадцатых переезжают в правую).
// Волна-6: общая сетка канонизируется до sub 2 — удары на тех же местах,
// запись вдвое короче (D___D___D___ при sub4 и D_D_D_ при sub2 — одно и то же).
ok('I1 разное дробление: левая пересечена (канон. D_D_D_)', soundingText(0) === 'D_D_D_', soundingText(0));
ok('I2 разное дробление: правая вобрала хвост левой (канон.)', soundingText(1) === 'D_UUUUUUUU', soundingText(1));
scene([
  D(null, 4, { strumPattern: Object.assign(strum(2, 'D_D_D_D_'), { rhythmGroup: 'rgA' }) }),
  D(null, 4, { strumPattern: { mode: 'pick', subdivision: 2, rhythmGroup: 'rgA', steps: [[5], [3], [4], [2], [3], [1], [2], [3]] } }),
]);
setSpans([3, 5]);
ok('I3 разный режим: левая — звучащее окно', soundingText(0) === 'D_D_D_', soundingText(0));
ok('I4 разный режим: правая — лента от границы (бой+перебор)', soundingText(1) === 'D_53423123', soundingText(1));
ok('I4б режим не помеха: временный рулон mixed',
  group(0) === group(1)
    && evl(`return songRhythmRolls.pool[songRhythmRolls.refs.get(rhythmRefKey(1, 2, 0)).roll].mode`) === 'mixed',
  `${group(0)}/${group(1)}`);
release(0);
ok('I4в mouseup: приватные mixed-рулоны, звук тот же (канон.)',
  group(0) !== '' && group(1) !== '' && group(0) !== group(1)
    && soundingText(0) === 'DDD' && soundingText(1) === 'D_53423123',
  `${soundingText(0)}|${soundingText(1)}`);

// --- K. Спека-2: из деления сразу тянем на 1/16 -------------------------
scene([D(strum(2, 'D_DU_UDU'), 4)]);
evl('return addChordAfter(1, 2, 0), 0');
setSpans([1.75, 2.25]);
ok('K1 спека: левая D___D_U', soundingText(0) === 'D___D_U', soundingText(0));
ok('K2 спека: правая ___U_D_U_', soundingText(1) === '___U_D_U_', soundingText(1));
ok('K3 рулон тот же после пересетки', !!group(0) && group(0) === group(1), `${group(0)} vs ${group(1)}`);

// --- L. Своя ячейка + наследующий сосед: наследник ЗАСТЫВАЕТ (волна-5) --
// Спека: «если ритм в рядом стоящей ячейке определён как общий для
// секции, он должен быть взят из общего» + inherit_freeze: при касании
// границы наследник получает свой срез фасада по долям ДО жеста и
// становится обычной своей ячейкой — дальше за боем секции НЕ следует.
// Далёкие наследники снаружи пары фасадом текут по-прежнему (сцены M/N).
scene([D(strum(2, 'D_D_D_D_'), 4), D(null, 4)]);
evl(`sections[0].squares[0].strumPattern = { mode:'strum', subdivision:2, steps:'X_X_X_X_'.split('') }; return 0`);
setSpans([3.5, 4.5]);
// Левая на новой доле звучит D_D_D_D (7 из 8); правая — застывший срез
// фасада: позиция границы 3.5 доли приходится на шаг 7 ленты пары —
// тот же текст _X_X_X_X_, что старая модель знала по наследству.
ok('L1 левая D_D_D_D (звук тот же)', soundingText(0) === 'D_D_D_D', soundingText(0));
ok('L2 наследник застыл собственным срезом (inherit_freeze)', hasOwn(1), 'не записан');
ok('L3 звук правой — застывший срез фасада _X_X_X_X_',
  soundingText(1) === '_X_X_X_X_', soundingText(1));
ok('L4 суммарная лента как звучала', `${soundingText(0)}${soundingText(1)}` === 'D_D_D_D_X_X_X_X_',
  `${soundingText(0)}|${soundingText(1)}`);
ok('L5 жест: пара на временном общем рулоне', !!group(0) && group(0) === group(1), `${group(0)} / ${group(1)}`);
release(0);
ok('L5б mouseup: два приватных рулона',
  group(0) !== '' && group(1) !== '' && group(0) !== group(1), `${group(0)} / ${group(1)}`);
// Смена боя квадрата ПОСЛЕ протяжки: застывший наследник НЕ подхватывает
// новый бой (волна-5), своя ячейка тем более.
evl(`sections[0].squares[0].strumPattern = { mode:'strum', subdivision:2, steps:'DDDDDDDD'.split('') }; return 0`);
ok('L6 застывший наследник не следует за новым боем',
  soundingText(1) === '_X_X_X_X_', soundingText(1));
ok('L7 своей ячейке смена боя безразлична (окно ленты)', soundingText(0) === 'D_D_D_D', soundingText(0));

// --- M. Сосед наследует несчётный рисунок (фазы нет) — пару не трогаем --
scene([D(strum(2, 'D_D_D_D_'), 4), D(null, 4)]);
evl(`sections[0].squares[0].strumPattern = { mode:'strum', subdivision:2, steps:'X_X_X'.split('') }; return 0`);
setSpans([3, 5]);
ok('M1 левая хранит звучащее окно (канон.)', soundingText(0) === 'DDD', soundingText(0));
ok('M2 сосед остался без рисунка', evl('return !sections[0].squares[0].events[1].strumPattern'), 'появился');

// --- N. Обе без рисунка: пара сшивается в ленту тишины (волна-5) --------
scene([D(null, 4), D(null, 4)]);
setSpans([3, 5]);
ok('N1 обе без встроенных паттернов (истина в пуле)',
  evl('return !sections[0].squares[0].events[0].strumPattern && !sections[0].squares[0].events[1].strumPattern'),
  'появился');
ok('N2 звук — явная тишина по спеке: 3 + 5 пауз',
  soundingText(0) === '___' && soundingText(1) === '_____', `${soundingText(0)}|${soundingText(1)}`);

// --- O. Сосед вообще без рисунка: входит лентой тишины (волна-5) --------
// Спека: «если ритм в рядом стоящей ячейке не определён, он воспринимается
// как пустой ритм (________)». Регрессия волны-5 (пропадает «удар в
// начале») ОТМЕНЕНА решением B-06 (2026-08-26): при отпускании пустая
// ячейка при необъявленном бое секции дематериализуется — ссылки и рулона
// нет, звук снова «удар + тишина» планировщика. По дороге (на удержании)
// лента тишины жива: окно показывает паузы, но кастомом оно не светится.
scene([D(strum(2, 'D_D_D_D_'), 4), D(null, 4)]);
setSpans([3.5, 4.5]);
ok('O1 левая D_D_D_D (звук тот же)', soundingText(0) === 'D_D_D_D', soundingText(0));
ok('O2 тронутая пустая получила ленту тишины', hasOwn(1) && group(1) !== '', 'не записана');
ok('O3 звук правой — девять явных пауз вместо удара+тишины',
  soundingText(1) === '_________', soundingText(1) || '(пусто)');
release(0);
ok('O4 mouseup: B-06 — призрачная тишина дематериализована (секция без боя)',
  !hasOwn(1) && soundingText(1) === '', soundingText(1) || '(рисунка нет)');

// --- P. Зеркально: пустая слева — лента тишины, своя справа позиционна --
// (волна-5): пауза на позиции 3.5 доли остаётся на ней, удары U стоят на
// своих долях — граница просто переехала по сквозной ленте.
scene([D(null, 4), D(strum(2, 'U_U_U_U_'), 4)]);
setSpans([3.5, 4.5]);
ok('P1 тронутая пустая получила ленту тишины', hasOwn(0) && group(0) !== '', 'не записана');
ok('P2 правая читает ленту от границы', soundingText(1) === '_U_U_U_U_', soundingText(1));
ok('P3 жест: пара на временном общем рулоне', !!group(0) && group(0) === group(1), `${group(0)} / ${group(1)}`);
release(0);
// B-06: пустая левая дематериализована (секция без боя), правая — свой
// приватный рулон; звук правой позиционно прежний.
ok('P4 mouseup: левая без рисунка (B-06), правая — приватный рулон, звук тот же',
  group(0) === '' && group(1) !== ''
    && soundingText(0) === '' && soundingText(1) === '_U_U_U_U_',
  `${soundingText(0)}|${soundingText(1)}`);

// --- Q. Удаление второй половины связки: «убрать нарезку» ---------------
scene([D(strum(2, 'D_DU_UDU'), 4)]);
evl('return addChordAfter(1, 2, 0), 0');
evl('return removeChordAt(1, 2, 1), 0');
ok('Q1 ячейка одна, span 4', spans() === '4', spans());
ok('Q2 ритм собран целиком D_DU_UDU', soundingText(0) === 'D_DU_UDU', soundingText(0));

// --- R. Удаление ПЕРВОЙ половины: ритм тоже собирается целиком ----------
scene([D(strum(2, 'D_DU_UDU'), 4)]);
evl('return addChordAfter(1, 2, 0), 0');
evl('return removeChordAt(1, 2, 0), 0');
ok('R1 ячейка одна, span 4', spans() === '4', spans());
ok('R2 ритм собран целиком D_DU_UDU', soundingText(0) === 'D_DU_UDU', soundingText(0));

// --- S. Удаление середины цепочки из трёх -------------------------------
scene([D(strum(2, 'D_DU_UDU'), 4)]);
evl('return addChordAfter(1, 2, 0), 0');
evl('return addChordAfter(1, 2, 1), 0');
evl('return removeChordAt(1, 2, 1), 0');
ok('S1 доли 3,1', spans() === '3,1', spans());
ok('S2 левая вобрала середину: D_DU_U', soundingText(0) === 'D_DU_U', soundingText(0));
ok('S3 правая цела: DU', soundingText(1) === 'DU', soundingText(1));
ok('S4 рулон общий уцелел', !!group(0) && group(0) === group(1), `${group(0)} vs ${group(1)}`);
ok('S5 склейка честная: ресайз 2|2 режет исходный ритм', (() => {
  // Состояние S: левая D_DU_U (3), правая DU (1) — их склейка и есть
  // исходные 8 шагов. Тянем до 2|2: левая D_DU, правая _UDU — ровно
  // состояние после ПЕРВОГО деления (шаги на своих местах на оси).
  setSpans([2, 2]);
  return soundingText(0) === 'D_DU' && soundingText(1) === '_UDU';
})(), `${soundingText(0)}|${soundingText(1)}`);

// --- T. Чужие ячейки: поглощение доли прежнее, кэш — звучащее окно ------
scene([D(strum(2, 'D_D_D_D_'), 4), D(strum(2, 'U_U_U_U_'), 4)]);
evl('return removeChordAt(1, 2, 1), 0');
ok('T1 поглотитель растянулся до 8', spans() === '8', spans());
// B-23 (2026-08-27): канон «минуса» сменился со старого «свой рисунок
// растягивается на всю долю, чужой умирает с ячейкой» на «полную
// запись» — сшивка того, что звучало до операции: свои удары D@0..3
// плюс чужие U@4..7 (запись канонизирована грубой сеткой sub 1).
ok('T2 его рисунок — полная запись пары (канон B-23)', soundingText(0) === 'DDDDUUUU', soundingText(0));

// --- U. Смешанная пара (своя + пустая): доля как раньше, кэш — окно -----
scene([D(strum(2, 'D_D_D_D_'), 4), D(null, 4)]);
evl('return removeChordAt(1, 2, 1), 0');
ok('U1 поглотитель растянулся до 8', spans() === '8', spans());
// B-23: удалённая без рисунка на таймлайне играла заводской удар в t=4 —
// он записан (не затёрт, не размножен): свои D@0..3 + заводской D@4.
ok('U2 его рисунок — свой + заводской удар удалённой (канон B-23)', soundingText(0) === 'DDDDD___', soundingText(0));

// --- V. Склейка при разном дроблении: общая сетка по кратности ----------
scene([
  D(null, 2, { strumPattern: Object.assign(strum(2, 'D_DU'), { rhythmGroup: 'rgV' }) }),
  D(null, 2, { strumPattern: Object.assign(strum(4, '__U_D_U_'), { rhythmGroup: 'rgV' }) }),
]);
evl('return removeChordAt(1, 2, 1), 0');
// Волна-6: склейка по-прежнему собирает общую сетку 4, но она тут же
// канонизируется до sub 2 — удары D@0,1.0 U@1.5,2.5 D@3.0 U@3.5 на местах.
ok('V1 склейка: каноническая запись D_DU_UDU', soundingText(0) === 'D_DU_UDU', soundingText(0));
ok('V2 дробление канонизировано до 2', subOf(0) === 2, String(subOf(0)));

// --- J. Волна-4: круг «песня -> сейв -> загрузка» — ленты, не копии -------
scene([D(strum(2, 'D_DU_UDU'), 4)]);
evl('return addChordAfter(1, 2, 0), 0');
const rollJ = evl(`return songRhythmRolls.refs.get(rhythmRefKey(1, 2, 0)).roll`);
evl(`localStorage.removeItem('struchord_songs'); window.saveCurrentSong(); return 0`);
const savedSong = JSON.parse(evl(`return localStorage.getItem('struchord_songs')`))[0];
ok('J1 сейв: у событий нет встроенного рисунка',
  savedSong.sections[0].squares[0].events.every((e) => !e.strumPattern), 'остался');
ok('J2 сейв: пул на борту, обе ссылки на ОДИН рулон',
  !!savedSong.rhythmPool &&
  savedSong.rhythmPool.refs.length === 2 &&
  savedSong.rhythmPool.refs[0][1] === savedSong.rhythmPool.refs[1][1] &&
  savedSong.rhythmPool.refs[0][1] === rollJ,
  JSON.stringify(savedSong.rhythmPool || null).slice(0, 140));
ok('J3 сейв: schemaVersion 2', savedSong.schemaVersion === 2, String(savedSong.schemaVersion));
evl('sections = []; songRhythmRolls = null; window.loadSong(0); return 0');
ok('J4 после загрузки звук прежний: D_DU|_UDU',
  soundingText(0) === 'D_DU' && soundingText(1) === '_UDU',
  `${soundingText(0)}|${soundingText(1)}`);
ok('J5 после загрузки обе ячейки на одном рулоне',
  evl(`const a = songRhythmRolls.refs.get(rhythmRefKey(1, 2, 0)), b = songRhythmRolls.refs.get(rhythmRefKey(1, 2, 1));
       return !!(a && b && a.roll === b.roll)`), '');
ok('J6 кэш после загрузки не материализуется',
  evl('return sections[0].squares[0].events.every((e) => !e.strumPattern)'), 'появился');
// Битый пул чужого файла: отказ adopt -> мигратор, песня грузится без
// ритма ячеек, но грузится (warn в консоль — не падение).
const broken = JSON.parse(JSON.stringify(savedSong));
broken.rhythmPool.pool[Object.keys(broken.rhythmPool.pool)[0]].subdivision = 99;
const brokenJson = JSON.stringify([broken]);
evl(`localStorage.setItem('struchord_songs', ${JSON.stringify(brokenJson)});
     sections = []; songRhythmRolls = null;
     window.loadSong(0); return 0`);
ok('J7 битый пул отклонён, загрузка прошла', evl('return Array.isArray(sections) && sections.length === 1'), 'не загрузилась');
ok('J8 битый пул не принят (refs пуст)', evl('return !songRhythmRolls || songRhythmRolls.refs.size === 0'), 'ссылки остались');
// Сейв СТАРОГО формата (v1: кэш на ячейках с общей меткой): поднимается
// мигратором с самопроверкой, звук прежний, кэш стрипнут.
const legacy = JSON.parse(JSON.stringify(savedSong));
legacy.schemaVersion = 1;
delete legacy.rhythmPool;
legacy.sections[0].squares[0].events[0].strumPattern =
  { mode: 'strum', subdivision: 2, steps: 'D_DU'.split(''), rhythmGroup: 'rg-leg' };
legacy.sections[0].squares[0].events[1].strumPattern =
  { mode: 'strum', subdivision: 2, steps: '_UDU'.split(''), rhythmGroup: 'rg-leg' };
evl(`localStorage.setItem('struchord_songs', ${JSON.stringify(JSON.stringify([legacy]))});
     sections = []; songRhythmRolls = null;
     window.loadSong(0); return 0`);
// Файл теряет метку на входе (cloneSafePattern режет rhythmGroup — так
// было всегда, сверено с копией волны-3): связка v1 поднимается раздельными
// пинами, звук тот же. Рвётся ровно перезагрузка — волна-4 тем и сильнее,
// что свой формат (J4/J5) связку несёт живой.
ok('J9 легаси v1: обе ячейки покрыты пулом (раздельные пины, как в волне-3)',
  evl(`return songRhythmRolls.refs.has(rhythmRefKey(1, 2, 0))
       && songRhythmRolls.refs.has(rhythmRefKey(1, 2, 1))`), 'не покрыты');
// Здесь '_' на входе файла — cloneSafePattern давно нормализует тишину в
// null: текст после реальной загрузки 'DDU'|'UDU' (проверено на копии
// волны-3 слово в слово), посимвольный звук прежний.
ok('J10 легаси v1: звук после миграции прежний (null-тишина, паритет волне-3)',
  soundingText(0) === 'DDU' && soundingText(1) === 'UDU',
  `${soundingText(0)}|${soundingText(1)}`);
ok('J11 легаси v1: кэш стрипнут после загрузки',
  evl('return sections[0].squares[0].events.every((e) => !e.strumPattern)'), 'остался');

// --- W. Секционный бой правит ТОЛЬКО секционный рулон (волна-4) -----------
// Волны-2/3 здесь дропали пул целиком — тогда спасал кэш; теперь дроп
// стирал бы рисунки ячеек. Правка должна пройти точечно.
scene([D(strum(2, 'D_DU_UDU'), 4)]);
evl('return addChordAfter(1, 2, 0), 0');
evl(`sections[0].strumPattern = { mode: 'strum', subdivision: 2, steps: 'DDDDDDDD'.split('') };
     setSectionRhythmRoll(sections[0], sections[0].strumPattern);
     return 0`);
ok('W1 связка ячеек жива после правки боя секции',
  !!group(0) && group(0) === group(1) && soundingText(0) === 'D_DU' && soundingText(1) === '_UDU',
  `${group(0)} vs ${group(1)}: ${soundingText(0)}|${soundingText(1)}`);
ok('W2 секционный рулон зеркалит новый бой',
  evl(`const st = songRhythmRolls;
       const roll = st.pool[st.sectionRolls.get(1)];
       return roll && roll.steps.join('') === 'DDDDDDDD'`), 'не тот шаг-дорожка');

// --- X. Дроп выливает окна в события, перемиграция собирает связку --------
scene([D(strum(2, 'D_DU_UDU'), 4)]);
evl('return addChordAfter(1, 2, 0), 0');
evl('dropRhythmStorage(); return 0');
ok('X1 выливка: окна вернулись в события (старый путь)', soundingText(0) === 'D_DU' && soundingText(1) === '_UDU'
  && evl(`return sections[0].squares[0].events[0].strumPattern.steps.join('') === 'D_DU'
       && sections[0].squares[0].events[1].strumPattern.steps.join('') === '_UDU'`), 'не вылиты');
ok('X2 выливка: метка связки на месте (для перемиграции)',
  evl(`const a = sections[0].squares[0].events[0].strumPattern.rhythmGroup,
            b = sections[0].squares[0].events[1].strumPattern.rhythmGroup;
       return !!a && a === b`), 'метки нет');
setSpans([1.5, 2.5]);
// Звук пути «дроп -> перемиграция». Волна-5: ленивая постройка пула
// прямо в жесте идёт по долям ДО жеста (иначе сшивка читала бы окна в
// съехавшей геометрии), поэтому связка собирается обратно в ЦЕЛЬНУЮ
// ленту D_DU_UDU и режется позиционно: удар, попавший за границу,
// доигрывает в правой ячейке. Это сильнее пути волн-2/3, где окна
// врапились по новым долям (D_D|_UDU_) и лента теряла непрерывность.
ok('X3 перемиграция собрала связку, звук позиционен по ленте',
  !!group(0) && group(0) === group(1) && soundingText(0) === 'D_D' && soundingText(1) === 'U_UDU',
  `${group(0)} vs ${group(1)}: ${soundingText(0)}|${soundingText(1)}`);

// --- Y. B-06 свип: приватные пины-тишины дематериализуются ----------------
// Триггеры свипа в продукте: загрузка файла (старые сейвы с записанной
// тишиной от ресайза до B-06) и сброс боя секции. Здесь — сам свип.
scene([D(strum(2, 'D_D_D_D_'), 4), D(null, 4)]);
// Руками ставим «призрака» из старого сейва: приватный рулон из пауз.
evl(`const st = songRhythmRolls;
     st.pool['rrh-gh'] = { mode: 'strum', subdivision: 2, steps: '________'.split('') };
     st.refs.set(rhythmRefKey(1, 2, 1), { roll: 'rrh-gh', anchor: 4 });
     return 0`);
ok('Y1 призрак поставлен: ссылка и окно из одних пауз',
  group(1) !== '' && soundingText(1) === '________', `${group(1)} ${soundingText(1)}`);
ok('Y2 свип снял ровно одного призрака',
  evl('return dematerializeGhostSilenceInSong()') === 1, 'не снят');
ok('Y3 после свипа ни ссылки, ни рисунка — удар-в-начале вернулся',
  group(1) === '' && soundingText(1) === '', soundingText(1) || '(рисунка нет)');
// Объявленный бой секции: та же тишина осмысленна (глушит) — свип спит.
evl(`sections[0].strumPattern = { mode: 'strum', subdivision: 2, steps: 'D_D_D_D_'.split('') };
     setSectionRhythmRoll(sections[0], sections[0].strumPattern); return 0`);
evl(`const st = songRhythmRolls;
     st.pool['rrh-gh2'] = { mode: 'strum', subdivision: 2, steps: '________'.split('') };
     st.refs.set(rhythmRefKey(1, 2, 1), { roll: 'rrh-gh2', anchor: 4 });
     return 0`);
ok('Y4 бой секции объявлен: свип спит, тишина живёт (волна-7)',
  evl('return dematerializeGhostSilenceInSong()') === 0 && group(1) !== '' && soundingText(1) === '________',
  `${group(1)} ${soundingText(1)}`);

console.log(bad ? `\nFAIL: ${bad}` : '\nвсе проверки прошли');
process.exit(bad ? 1 : 0);

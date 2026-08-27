// Кнопки расширений под колесом аккордов — живая очередь.
// Ручной ввод аккорда с расширением, которого на кнопках нет (Cadd9),
// ставит это расширение на первую кнопку, сдвигая остальные; мест всегда
// семь (ряды 4 + 3). Плюс регрессия: встроенные режимы собирают имена
// по-прежнему (C7, F#Δ, Bdim...).
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM(fs.readFileSync('/home/user/STRUCHORD.html', 'utf8'), {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(w) {
    w.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }),
      clearRect(){}, beginPath(){}, arc(){}, fill(){}, stroke(){}, moveTo(){},
      lineTo(){}, closePath(){}, save(){}, restore(){}, translate(){}, rotate(){},
      fillText(){}, strokeText(){}, setTransform(){}, scale(){},
      createLinearGradient: () => ({ addColorStop(){} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {} };
};
let bad = 0;
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x ? ' — ' + x : ''}`); if (!c) bad++; };

w.addEventListener('load', () => {
  const d = w.document;
  const row1 = () => Array.from(d.querySelectorAll('#wheelModeRow1 .mode-tab')).map((b) => b.textContent).join(' ');
  const row2 = () => Array.from(d.querySelectorAll('#wheelModeRow2 .mode-tab')).map((b) => b.textContent).join(' ');
  const allCount = () => d.querySelectorAll('.mode-tab').length;
  // Вводит аккорд так, как это делает ручной ввод: через saveCurrentChord.
  const type = (chord) =>
    w.eval(`{
      const inp = document.querySelector('.chord-input');
      inp.value = ${JSON.stringify(chord)};
      activeChordInput = inp;
      saveCurrentChord();
    }`);
  const wheelTexts = () =>
    Array.from(d.querySelectorAll('#circleSvg text')).map((t) => t.textContent).join(' ');
  const pathCount = () => d.querySelectorAll('#circleSvg path').length;

  w.eval("addSection('Verse'); render();");

  console.log('=== 1. Начальные кнопки — семь штатных, ряды 4 + 3 ===');
  console.log('      ряд 1:', row1(), '| ряд 2:', row2());
  ok('ряд 1: 7 maj7 sus4 sus2', row1() === '7 maj7 sus4 sus2', row1());
  ok('ряд 2: dim aug 6', row2() === 'dim aug 6', row2());
  ok('всего семь кнопок', allCount() === 7, allCount() + '');

  console.log('\n=== 2. Регрессия: встроенные режимы собирают имена как раньше ===');
  const disp = (mode, rc, isMin) =>
    w.eval(`{ setWheelMode(${JSON.stringify(mode)}); getDisplayChord(${JSON.stringify(rc)}, ${!!isMin}); }`);
  ok('7: C -> C7', disp('7', 'C') === 'C7');
  ok('7: Am -> Am7', disp('7', 'Am', true) === 'Am7');
  ok('maj7: C -> Cmaj7', disp('maj7', 'C') === 'Cmaj7');
  ok('maj7: F# -> F#Δ (компакт)', disp('maj7', 'F#') === 'F#Δ');
  ok('maj7: Am -> Am(maj7)', disp('maj7', 'Am', true) === 'Am(maj7)',
     w.eval('getDisplayChord("Am", true)'));
  ok('dim: B -> Bdim', disp('dim', 'B') === 'Bdim');
  ok('dim: F# -> F#° (компакт)', disp('dim', 'F#') === 'F#°');
  ok('aug: C -> Caug', disp('aug', 'C') === 'Caug');
  ok('sus2: D -> Dsus2', disp('sus2', 'D') === 'Dsus2');
  ok('6: Am -> Am6', disp('6', 'Am', true) === 'Am6');
  // Кольца: triads/7/6/maj7 — два кольца (24 сегмента), sus/dim/aug — одно.
  w.eval("setWheelMode('triads')");
  ok('triads — два кольца', pathCount() === 24, pathCount() + '');
  w.eval("setWheelMode('maj7')");
  ok('maj7 — два кольца', pathCount() === 24, pathCount() + '');
  // На внутреннем кольце тесно — показываем компакт 'AmΔ'; клик всё
  // равно вставляет каноническое 'Am(maj7)' (проверено в disp выше).
  ok('на внутреннем кольце компактные mΔ', wheelTexts().includes('mΔ'));
  w.eval("setWheelMode('sus4')");
  ok('sus4 — одно кольцо', pathCount() === 12, pathCount() + '');

  console.log('\n=== 3. Ручной ввод Cadd9: кнопка add9 встаёт первой ===');
  type('Cadd9');
  console.log('      ряд 1:', row1(), '| ряд 2:', row2());
  ok('первая кнопка — add9', row1().split(' ')[0] === 'add9', row1());
  ok('остальные сдвинулись, «6» вытеснена',
     row1() === 'add9 7 maj7 sus4' && row2() === 'sus2 dim aug', row1() + ' / ' + row2());
  ok('кнопок по-прежнему семь', allCount() === 7, allCount() + '');

  console.log('\n=== 4. Повторный ввод add9 — очередь не дёргается ===');
  type('Gadd9');
  ok('список без изменений', row1() === 'add9 7 maj7 sus4' && row2() === 'sus2 dim aug', row1() + ' / ' + row2());

  console.log('\n=== 5. Кнопка add9 работает как штатная: колесо строит Cadd9/Amadd9 ===');
  const btn1 = d.querySelector('#wheelModeRow1 .mode-tab');
  btn1.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok('режим включился', w.eval('wheelMode') === 'add9', w.eval('wheelMode'));
  ok('кнопка подсвечена', btn1.classList.contains('active'));
  ok('мажорный сегмент — Cadd9', w.eval("getDisplayChord('C', false)") === 'Cadd9',
     w.eval("getDisplayChord('C', false)"));
  ok('минорный сегмент — Amadd9', w.eval("getDisplayChord('Am', true)") === 'Amadd9',
     w.eval("getDisplayChord('Am', true)"));
  ok('на колесе виден add9', wheelTexts().includes('add9'));
  ok('два кольца (окраска, не лад)', pathCount() === 24, pathCount() + '');
  ok('повторный клик снимает в triads',
     (btn1.dispatchEvent(new w.MouseEvent('click', { bubbles: true })), w.eval('wheelMode') === 'triads'),
     w.eval('wheelMode'));

  console.log('\n=== 6. Расширение со своим минором склеивается в базовое: Fm9 -> «9» ===');
  type('Fm9');
  console.log('      ряд 1:', row1(), '| ряд 2:', row2());
  ok('«9» первой кнопкой (m склеена), aug вытеснена',
     row1() === '9 add9 7 maj7' && row2() === 'sus4 sus2 dim', row1() + ' / ' + row2());
  w.eval("setWheelMode('9')");
  ok('мажорный сегмент — C9', w.eval("getDisplayChord('C', false)") === 'C9',
     w.eval("getDisplayChord('C', false)"));
  ok('минорный сегмент — Am9 (минор приходит с внутреннего кольца)',
     w.eval("getDisplayChord('Am', true)") === 'Am9', w.eval("getDisplayChord('Am', true)"));
  ok('два кольца', pathCount() === 24, pathCount() + '');

  console.log('\n=== 6а. Склейка в уже живущие кнопки: m7/m(maj7)/mΔ/mmaj7 новых не создают ===');
  const before6a = row1() + ' / ' + row2();
  // «7» и «maj7» сейчас в очереди — склейка всё равно находит их, а
  // набранная руками «CmΔ» доходит как «Cmδ» (toLowerCase в
  // normalizeChordCase) и тоже обязана склеиться в «maj7», без кнопки «δ».
  type('Cm7'); type('Cm(maj7)'); type('CmΔ'); type('Gmmaj7');
  ok('очередь без изменений — склеились в «7» и «maj7»',
     row1() + ' / ' + row2() === before6a, row1() + ' / ' + row2());
  ok('мусорной кнопки «δ» нет', !(row1() + ' ' + row2()).includes('δ'));

  console.log('\n=== 7. Ладовое расширение: C7sus4 -> одно кольцо, минор заменяется ===');
  type('C7sus4');
  console.log('      ряд 1:', row1(), '| ряд 2:', row2());
  ok('7sus4 первой кнопкой', row1().split(' ')[0] === '7sus4', row1());
  w.eval("setWheelMode('7sus4')");
  ok('одно кольцо', pathCount() === 12, pathCount() + '');
  ok('сегмент Bm-кольца строит B7sus4, а не Bm7sus4',
     w.eval("getDisplayChord('Bm', true)") === 'B7sus4', w.eval("getDisplayChord('Bm', true)"));

  console.log('\n=== 7б. Квинтаккорд «5»: одно кольцо, минор стирается ===');
  type('E5');
  console.log('      ряд 1:', row1(), '| ряд 2:', row2());
  ok('кнопка «5» первой', row1().split(' ')[0] === '5', row1());
  w.eval("setWheelMode('5')");
  ok('одно кольцо', pathCount() === 12, pathCount() + '');
  ok('мажорный сегмент — C5', w.eval("getDisplayChord('C', false)") === 'C5');
  ok('минорный сегмент тоже A5, а не «Am5»',
     w.eval("getDisplayChord('Am', true)") === 'A5', w.eval("getDisplayChord('Am', true)"));
  // Корень и «5» — отдельные SVG-тексты (суффикс мельче): смотрим,
  // что суффикс «5» есть, а «m5» нет ни в одном тексте.
  const svgTexts = Array.from(d.querySelectorAll('#circleSvg text')).map((t) => t.textContent);
  ok('на колесе виден «5» без «m5»',
     svgTexts.includes('5') && !svgTexts.some((t) => t.includes('m5')),
     svgTexts.join(' ').slice(0, 60));

  console.log('\n=== 8. Трезвучия и слэш-бас новых кнопок не дают ===');
  const before = row1() + ' / ' + row2();
  type('C'); type('Am'); type('C/E'); type('Cmaj');
  ok('очередь без изменений', row1() + ' / ' + row2() === before, row1() + ' / ' + row2());

  console.log('\n=== 9. Написание канонизируется: C+ -> кнопка aug, а не «+» ===');
  type('F11'); // вытесняем dim... проверим aug: он уже вытеснен после шага 6
  type('C+');
  console.log('      ряд 1:', row1(), '| ряд 2:', row2());
  ok('первая кнопка — aug (не «+»)', row1().split(' ')[0] === 'aug', row1());

  console.log('\n=== 10. Вытеснение по кругу: мест всегда семь ===');
  ['C13', 'G9', 'D6/9', 'A7', 'Eb9'].forEach(type);
  console.log('      ряд 1:', row1(), '| ряд 2:', row2());
  ok('кнопок семь', allCount() === 7, allCount() + '');
  // «9» здесь — склеенная ещё из Fm9 (шаг 6): G9 её не сдвинул (повтор
  // без LRU-подъёма), A7 переучил штатную «7», а Eb9 вернул вытесненную
  // «9» — она снова первая.
  ok('«9» — первая', row1().split(' ')[0] === '9', row1());
  ok('очередь: 9 7 6/9 13 / aug 11 5',
     row1() === '9 7 6/9 13' && row2() === 'aug 11 5', row1() + ' / ' + row2());

  console.log('\n=== 11. Открытие колеса: режим сброшен в трезвучия, очередь кнопок цела ===');
  const listBefore = row1() + ' / ' + row2();
  w.eval("activeChordInput = document.querySelector('.chord-input'); openChordWheel(activeChordInput);");
  ok('режим — triads', w.eval('wheelMode') === 'triads', w.eval('wheelMode'));
  ok('очередь сохранилась', row1() + ' / ' + row2() === listBefore, row1() + ' / ' + row2());
  ok('ни одна кнопка не подсвечена', d.querySelectorAll('.mode-tab.active').length === 0);
  w.eval('closeChordWheel()');

  console.log('\n=== 12. Собранное с колеса имя полноценно работает дальше ===');
  w.eval("setWheelMode('add9')");
  // Октава в getChordNotes всегда 4 — функция отвечает за набор нот.
  ok('getChordNotes(Cadd9) — C E G D',
     w.eval("JSON.stringify(getChordNotes('Cadd9'))") === JSON.stringify(['C4', 'E4', 'G4', 'D4']),
     w.eval("JSON.stringify(getChordNotes('Cadd9'))"));
  // Движок обязан читать минорную форму maj7 как минор — раньше
  // includes-проверка на 'maj' ломала это и Am(maj7) звучал мажором.
  ok('getChordNotes(Am(maj7)) — минор: A C E G#',
     w.eval("JSON.stringify(getChordNotes('Am(maj7)'))") === JSON.stringify(['A4', 'C4', 'E4', 'G#4']),
     w.eval("JSON.stringify(getChordNotes('Am(maj7)'))"));
  ok('getChordNotes(Cmaj7) — мажор без регрессии: C E G B',
     w.eval("JSON.stringify(getChordNotes('Cmaj7'))") === JSON.stringify(['C4', 'E4', 'G4', 'B4']),
     w.eval("JSON.stringify(getChordNotes('Cmaj7'))"));

  // Песня-кирпичик для проверок загрузки: события идут в том порядке,
  // в каком их увидит читатель. Той же формой пользуется unit-core.
  const mkSong = (name, chordLists) => ({
    schemaVersion: 2, name, bpm: 100, globalKey: 'C', keyMode: 'manual',
    globalTimeSig: '4/4', notes: '', nextId: 99, userFingerings: [], preferredFingerings: [],
    date: '2026-01-01T00:00:00.000Z',
    sections: [{ id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null,
      bpm: null, repeat: 1, strumPattern: null,
      squares: chordLists.map((evs, i) => ({ id: 2 + i, repeat: 1, customBeats: null, strumPattern: null,
        events: evs.map((chord) => ({ chord, span: 2 })) })) }],
  });
  const loadObj = (song) => {
    w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
    w.loadSong(0);
  };

  console.log('\n=== 13. Загрузка песни: очередь пересобирается из её аккордов ===');
  // По ходу песни: add9 (такт 1), Am и C/E не участвуют, 7 — уже в
  // умолчаниях (повтор не сдвигает), дальше m9 — склеивается в «9» —
  // и 5. На кнопках — задом наперёд, хвост добирают умолчания, ручная
  // история прошлых шагов смыта (очередь всегда описывает открытую
  // песню).
  loadObj(mkSong('seed13', [
    ['Cadd9', 'Am', 'C/E', 'G7'],
    ['Fm9', 'Cadd9', 'D5'],
  ]));
  console.log('      ряд 1:', row1(), '| ряд 2:', row2());
  ok('расширения песни впереди, в обратном порядке появления',
     row1() === '5 9 add9 7' && row2() === 'maj7 sus4 sus2', row1() + ' / ' + row2());
  ok('кнопок семь', allCount() === 7, allCount() + '');
  const tokens13 = (row1() + ' ' + row2()).split(' ');
  ok('Fm9 из песни склеился в «9», кнопки m9 нет',
     tokens13.includes('9') && !tokens13.includes('m9'), tokens13.join(','));
  ok('ручные остатки прошлой сессии ввода сброшены',
     !['13', '6/9', '11', '7sus4', 'aug'].some((t) => tokens13.includes(t)),
     tokens13.join(','));

  console.log('\n=== 14. Реальный файл: Every breath you take ===');
  // Аккорды по порядку появления: Aadd9, F#madd9, Dsus2, D5, Esus2, E5 —
  // расширения add9, add9 (F#madd9 склеился), sus2 (в умолчаниях), 5.
  const every = JSON.parse(
    fs.readFileSync('/home/user/uploads/Every breath you take.struchord-2.json', 'utf8'));
  loadObj(every);
  console.log('      ряд 1:', row1(), '| ряд 2:', row2());
  ok('«5» и склеенный add9 впереди; отдельной кнопки madd9 нет',
     row1() === '5 add9 7 maj7' && row2() === 'sus4 sus2 dim', row1() + ' / ' + row2());

  console.log('\n=== 15. Больше семи расширений в песне: ранние вытесняются, как при вводе ===');
  loadObj(mkSong('seed15', [
    ['C13', 'G9', 'D6/9', 'Eb11', 'Fm7b5', 'Bbadd11', 'A7b9', 'E5'],
  ]));
  console.log('      ряд 1:', row1(), '| ряд 2:', row2());
  ok('места заняли последние семь (Fm7b5 склеен в «7b5»), «13» и умолчания вытеснены',
     row1() === '5 7b9 add11 7b5' && row2() === '11 6/9 9', row1() + ' / ' + row2());

  console.log('\n=== 16. Пустая песня — очередь возвращается к умолчаниям ===');
  loadObj(mkSong('seed16', []));
  console.log('      ряд 1:', row1(), '| ряд 2:', row2());
  ok('штатные кнопки', row1() === '7 maj7 sus4 sus2' && row2() === 'dim aug 6',
     row1() + ' / ' + row2());

  console.log('\n=== 12а. Алиас «(9)» = add9: компактный показ и приём ввода ===');
  // Компактная запись — тот же getCompactChordName, что в ячейках.
  ok('компакт: Cadd9 -> C(9)', w.eval("getCompactChordName('Cadd9')") === 'C(9)');
  ok('компакт: F#madd9 -> F#m(9) (минор не теряем)',
     w.eval("getCompactChordName('F#madd9')") === 'F#m(9)',
     w.eval("getCompactChordName('F#madd9')"));
  ok('регрессия: C6/9 не трогаем', w.eval("getCompactChordName('C6/9')") === 'C6/9');
  // Ввод канонизируется тем же expandChordName, что и остальные алиасы.
  ok('ввод: C(9) -> Cadd9', w.eval("expandChordName('C(9)')") === 'Cadd9');
  ok('ввод: Am(9) -> Amadd9', w.eval("expandChordName('Am(9)')") === 'Amadd9');
  ok('ввод: C6/9 без изменений', w.eval("expandChordName('C6/9')") === 'C6/9');
  // Сквозной путь: грузим песенку с ячейками (после шага 16 очередь
  // штатная) и набираем C(9) руками — saveCurrentChord канонизирует так
  // же, как колесо (selectChord): в ячейку попадает Cadd9 и учится
  // кнопка «add9» (её нет среди умолчаний — встаёт первой).
  loadObj(mkSong('alias9', [['C', 'G']]));
  w.eval('render()');
  const inpVal = w.eval(`{
    const inp = document.querySelector('.chord-input');
    inp.value = 'C(9)';
    activeChordInput = inp;
    saveCurrentChord();
    inp.value;
  }`);
  ok('в ячейке сохраняется каноничный Cadd9', inpVal === 'Cadd9', inpVal);
  ok('сквозное: набранная C(9) учит кнопку add9', row1().split(' ')[0] === 'add9', row1());
  // Внутреннее кольцо в add9-режиме: компакт m(9); полное имя не влезало.
  w.eval("setWheelMode('add9')");
  ok('на внутреннем кольце компактные m(9)',
     wheelTexts().includes('m(9)'), wheelTexts().slice(0, 100));
  ok('значение остаётся каноничным: минорный сегмент = Amadd9',
     w.eval("getDisplayChord('Am', true)") === 'Amadd9');
  w.eval("setWheelMode('triads')");

  console.log('\n=== 12б. Компакты §1 + фиксы канонизации/движка ===');
  const GCN = (x) => w.eval(`getCompactChordName(${JSON.stringify(x)})`);
  ok('Cmaj9 -> CΔ9, Cmaj13 -> CΔ13',
     GCN('Cmaj9') === 'CΔ9' && GCN('Cmaj13') === 'CΔ13');
  ok('Cmmaj7 -> CmΔ (был ложный CΔ = Cmaj7!)', GCN('Cmmaj7') === 'CmΔ', GCN('Cmmaj7'));
  ok('Cmmaj9/Cmmaj13 -> CmΔ9/CmΔ13', GCN('Cmmaj9') === 'CmΔ9' && GCN('Cmmaj13') === 'CmΔ13');
  ok('Cdim7 -> C°7, Caug7 -> C+7', GCN('Cdim7') === 'C°7' && GCN('Caug7') === 'C+7');
  ok('Cadd11 -> C(11), Amadd11 -> Am(11)',
     GCN('Cadd11') === 'C(11)' && GCN('Amadd11') === 'Am(11)');
  ok('C7sus4 -> C7sus, а не C74 (септиму не срезаем)',
     GCN('C7sus4') === 'C7sus', GCN('C7sus4'));
  ok('C13sus4 -> C13sus', GCN('C13sus4') === 'C13sus');
  ok('C7sus2 не ломаем в C72', GCN('C7sus2') === 'C7sus2', GCN('C7sus2'));
  ok('компакт-регрессии: Cmaj7/C°/C4/C2, C6/9 и C7b9 — без форм',
     GCN('Cmaj7') === 'CΔ' && GCN('Cdim') === 'C°' && GCN('Csus4') === 'C4' &&
     GCN('Csus2') === 'C2' && GCN('C6/9') === 'C6/9' && GCN('C7b9') === 'C7b9');
  const ECN = (x) => w.eval(`expandChordName(${JSON.stringify(x)})`);
  ok('ввод: CΔ7 -> Cmaj7 (а не Cmaj77)', ECN('CΔ7') === 'Cmaj7', ECN('CΔ7'));
  ok('ввод: CΔ9 -> Cmaj9, CΔ13 -> Cmaj13', ECN('CΔ9') === 'Cmaj9' && ECN('CΔ13') === 'Cmaj13');
  ok('ввод-регрессии: CΔ/CmΔ/CmΔ7/C°7/CΔ7#5',
     ECN('CΔ') === 'Cmaj7' && ECN('CmΔ') === 'Cmmaj7' && ECN('CmΔ7') === 'Cmmaj7' &&
     ECN('C°7') === 'Cdim7' && ECN('CΔ7#5') === 'Cmaj7#5');
  const NCC = (x) => w.eval(`normalizeChordCase(${JSON.stringify(x)})`);
  ok('джазовая M — мажор: CM7 -> Cmaj7, CM9 -> Cmaj9, CM -> C',
     NCC('CM7') === 'Cmaj7' && NCC('CM9') === 'Cmaj9' && NCC('CM') === 'C',
     NCC('CM7') + ' ' + NCC('CM'));
  ok('регрессии регистра: Cm7 -> Cm7, CMaj7 -> Cmaj7',
     NCC('Cm7') === 'Cm7' && NCC('CMaj7') === 'Cmaj7');
  const GN = (x) => JSON.stringify(w.eval(`getChordNotes(${JSON.stringify(x)})`));
  const N = (...a) => JSON.stringify(a);
  ok('звук: C7b9 теперь с b9', GN('C7b9') === N('C4','E4','G4','A#4','C#4'), GN('C7b9'));
  ok('звук: C7#9 с #9', GN('C7#9') === N('C4','E4','G4','A#4','D#4'), GN('C7#9'));
  ok('звук: C7#11 с #11', GN('C7#11') === N('C4','E4','G4','A#4','F#4'), GN('C7#11'));
  ok('звук: C7b13 с b13 (G# = Ab)', GN('C7b13') === N('C4','E4','G4','A#4','G#4'), GN('C7b13'));
  ok('звук: C6/9 = C E G A D (нона не теряется)',
     GN('C6/9') === N('C4','E4','G4','A4','D4'), GN('C6/9'));
  ok('звук: слитное C69 — то же самое (не стек до 13-й)',
     GN('C69') === N('C4','E4','G4','A4','D4'), GN('C69'));
  ok('звук-регрессии: C7/Cmaj7/Cdim7/C9sus4 без изменений',
     GN('C7') === N('C4','E4','G4','A#4') &&
     GN('Cmaj7') === N('C4','E4','G4','B4') &&
     GN('Cdim7') === N('C4','D#4','F#4','A4') &&
     GN('C9sus4') === N('C4','F4','G4','A#4','D4'));
  ok('осознанно не трогали: C5add9 остаётся мажорным add9',
     GN('C5add9') === N('C4','E4','G4','D4'), GN('C5add9'));

  console.log(bad ? `\nПРОВАЛОВ: ${bad}` : '\nвсе проверки пройдены');
  if (bad) process.exitCode = 1;
});

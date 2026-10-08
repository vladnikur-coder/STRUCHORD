#!/usr/bin/env node
/*
 * b101-chord-parsing.js — разбор аккордов: имена, ноты, альтерации.
 *
 * Волна B-101 (0.589), кирпич 1. Закрепляем то, что раньше давало НЕВЕРНЫЙ
 * результат, а не просто «работает»:
 *
 *  1. add-хвосты не сворачиваются в sus: Cadd4/Cadd2 остаются собой, а не
 *     превращаются в Caddsus4/Caddsus2 (терция терялась: C F G вместо C E F G);
 *  2. добавленные 2-я и 4-я реально попадают в ноты (Cadd4 = C E F G);
 *  3. ♭/♯ понимаются разборщиками: Cm7♭5 терял пониженную квинту и давал
 *     ноты обычного Cm7, C7(♭9) терял ♭9. Написание В ЯЧЕЙКЕ остаётся
 *     типографским (0.562) — приводятся только разборщики;
 *  4. альтерация в скобках — не расширение: C(#11) не должен набирать
 *     септиму, нону и натуральную 11-ю (было семь нот вместо четырёх);
 *  5. минорная нона: C Eb G Bb D получает имя Cm9, а не Cm7.
 *
 * Каждый раздел помечен, какое поведение было ДО — чтобы переписать
 * ожидание здесь можно было только осознанно.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const htmlPath = path.join(__dirname, '..', '..', 'STRUCHORD.html');
const html = fs.readFileSync(htmlPath, 'utf8');

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
function check(name, cond, details) {
  if (cond) {
    pass++;
    console.log('ok   ' + name);
  } else {
    fail++;
    console.error('FAIL ' + name + (details ? ' (' + details + ')' : ''));
  }
}
const ECN = (x) => w.eval(`expandChordName(${JSON.stringify(x)})`);
const NOTES = (x, ks) => w.eval(`getChordNotes(${JSON.stringify(x)}, ${JSON.stringify(ks || 'sharp')})`);
const BCN = (root, iv) => w.eval(`buildChordName(${JSON.stringify(root)}, ${JSON.stringify(iv)})`);
const PARSE = (x) => w.eval(`parseChordForKeyDetection(${JSON.stringify(x)})`);
const show = (v) => JSON.stringify(v);

console.log('=== 1. expandChordName: add-хвост не становится sus ===');
check('Cadd4 -> Cadd4 (было Caddsus4)', ECN('Cadd4') === 'Cadd4', show(ECN('Cadd4')));
check('Cadd2 -> Cadd2 (было Caddsus2)', ECN('Cadd2') === 'Cadd2', show(ECN('Cadd2')));
check('Amadd4 -> Amadd4', ECN('Amadd4') === 'Amadd4', show(ECN('Amadd4')));
check('Cadd9 -> Cadd9 (не тронуто)', ECN('Cadd9') === 'Cadd9', show(ECN('Cadd9')));
check('Cadd11 -> Cadd11 (не тронуто)', ECN('Cadd11') === 'Cadd11', show(ECN('Cadd11')));
check('Amadd9 -> Amadd9', ECN('Amadd9') === 'Amadd9', show(ECN('Amadd9')));
console.log('  -- регрессии алиасов 0.428/0.562 --');
check('C(9) -> Cadd9', ECN('C(9)') === 'Cadd9', show(ECN('C(9)')));
check('Am(9) -> Amadd9', ECN('Am(9)') === 'Amadd9', show(ECN('Am(9)')));
check('C6/9 без изменений', ECN('C6/9') === 'C6/9', show(ECN('C6/9')));
check('C° -> Cdim', ECN('C°') === 'Cdim', show(ECN('C°')));
check('C+ -> Caug', ECN('C+') === 'Caug', show(ECN('C+')));
check('CΔ7 -> Cmaj7', ECN('CΔ7') === 'Cmaj7', show(ECN('CΔ7')));
check('CΔ9 -> Cmaj9', ECN('CΔ9') === 'Cmaj9', show(ECN('CΔ9')));
check('C7sus4 не срезается в C74', ECN('C7sus4') === 'C7sus4', show(ECN('C7sus4')));
check('C7sus2 не ломается', ECN('C7sus2') === 'C7sus2', show(ECN('C7sus2')));
// Голые цифры по-прежнему читаются как sus: судьба C2 (Csus2 или Cadd9) —
// открытый вопрос волны, поведение НЕ менялось. Фиксируем как есть.
check('C2 -> Csus2 (открытый вопрос, поведение сохранено)', ECN('C2') === 'Csus2', show(ECN('C2')));
check('C4 -> Csus4 (открытый вопрос, поведение сохранено)', ECN('C4') === 'Csus4', show(ECN('C4')));

console.log('=== 2. Добавленные ступени реально звучат ===');
// 0.592 (кирпич 4): getChordNotes раскладывает аккорд ОТ КОРНЯ ВВЕРХ, поэтому
// ноты выше корня уходят в следующую октаву — Cadd9 это C4 E4 G4 D5, а не
// C4 E4 G4 D4. Раньше все ноты лепились в четвёртую октаву, и у G7 третья,
// пятая и септима (D, F) оказывались НИЖЕ корня: озвучка без аппликатуры
// собирала аккорд обратной расстановкой. Классы высот те же, меняется только
// номер октавы — ниже ожидания переписаны осознанно.

check('Cadd4 = C E F G (было C E G)', show(NOTES('Cadd4')) === show(['C4', 'E4', 'G4', 'F5']), show(NOTES('Cadd4')));
check('Cadd2 = C E G D (было C E G)', show(NOTES('Cadd2')) === show(['C4', 'E4', 'G4', 'D5']), show(NOTES('Cadd2')));
check('Amadd2 = A C E B', show(NOTES('Amadd2')) === show(['A4', 'C5', 'E5', 'B5']), show(NOTES('Amadd2')));
check('Cadd11 по-прежнему C E G F', show(NOTES('Cadd11')) === show(['C4', 'E4', 'G4', 'F5']), show(NOTES('Cadd11')));
check('Cadd9 по-прежнему C E G D', show(NOTES('Cadd9')) === show(['C4', 'E4', 'G4', 'D5']), show(NOTES('Cadd9')));
// 0.347: «C5add9» осознанно остаётся МАЖОРНЫМ add9 (C E G D), а не квинтой
// с девятой — правило /^5($|[^a-z])/ не срабатывает, потому что после 5 идёт
// буква. Менять не входило в эту волну; фиксируем как принятое поведение.
check('C5add9 остаётся мажорным add9 (0.347)', show(NOTES('C5add9')) === show(['C4', 'E4', 'G4', 'D5']), show(NOTES('C5add9')));

console.log('=== 3. Типографские ♭/♯ понимаются разборщиками ===');
check('Cm7♭5 = C Eb Gb Bb (было C Eb G Bb = обычный Cm7)',
  show(NOTES('Cm7♭5')) === show(['C4', 'D#4', 'F#4', 'A#4']), show(NOTES('Cm7♭5')));
check('Cm7b5 (ASCII) не изменился',
  show(NOTES('Cm7b5')) === show(['C4', 'D#4', 'F#4', 'A#4']), show(NOTES('Cm7b5')));
check('две записи дают одинаковые ноты', show(NOTES('Cm7♭5')) === show(NOTES('Cm7b5')));
check('C7(♭9) держит ♭9 (было 4 ноты, ♭9 терялась)',
  show(NOTES('C7(♭9)')) === show(['C4', 'E4', 'G4', 'A#4', 'C#5']), show(NOTES('C7(♭9)')));
check('C7(b9) совпадает с C7(♭9)', show(NOTES('C7(b9)')) === show(NOTES('C7(♭9)')));
check('C7(♯5) = C E G# Bb (было G)',
  show(NOTES('C7(♯5)')) === show(['C4', 'E4', 'G#4', 'A#4']), show(NOTES('C7(♯5)')));
check('C(♯5) = C E G#', show(NOTES('C(♯5)')) === show(['C4', 'E4', 'G#4']), show(NOTES('C(♯5)')));
check('C(♭5) = C E Gb', show(NOTES('C(♭5)')) === show(['C4', 'E4', 'F#4']), show(NOTES('C(♭5)')));
check('C7(♯9) = C E G Bb D#', show(NOTES('C7(♯9)')) === show(['C4', 'E4', 'G4', 'A#4', 'D#5']), show(NOTES('C7(♯9)')));
check('Bm7♭5 разобран как уменьшённый (был min, не считался vii°)',
  PARSE('Bm7♭5') && PARSE('Bm7♭5').quality === 'dim', show(PARSE('Bm7♭5')));
check('Bm7b5 (ASCII) — dim, без изменений', PARSE('Bm7b5').quality === 'dim', show(PARSE('Bm7b5')));
check('Bø7 — dim, без изменений', PARSE('Bø7').quality === 'dim', show(PARSE('Bø7')));
// Cm7♭5 диатоничен в Db мажоре (vii°). До правки он давал ноты обычного Cm7
// (C Eb G Bb) — G ломало диатоничность, и ступень не показывалась НИГДЕ.
check('Cm7♭5 в Db -> vii° (было "" из-за ноты G вместо Gb)',
  w.eval(`getScaleDegree('Cm7♭5', 'Db')`) === 'vii°', show(w.eval(`getScaleDegree('Cm7♭5', 'Db')`)));
check('и в диезной записи enharmonic то же самое',
  w.eval(`getScaleDegree('Bm7♭5', 'C')`) === 'vii°', show(w.eval(`getScaleDegree('Bm7♭5', 'C')`)));

console.log('=== 4. Альтерация в скобках — не расширение ===');
check('C(#11) = 4 ноты C E G F# (было 7 нот с септимой и ноной)',
  show(NOTES('C(#11)')) === show(['C4', 'E4', 'G4', 'F#5']), show(NOTES('C(#11)')));
check('C(♯11) совпадает с C(#11) (иначе простая замена ♯-># УХУДШАЛА ноты)',
  show(NOTES('C(♯11)')) === show(['C4', 'E4', 'G4', 'F#5']), show(NOTES('C(♯11)')));
check('C(b9) = C E G Db (было 6 нот)',
  show(NOTES('C(b9)')) === show(['C4', 'E4', 'G4', 'C#5']), show(NOTES('C(b9)')));
check('C7(#11) = C E G Bb F#', show(NOTES('C7(#11)')) === show(['C4', 'E4', 'G4', 'A#4', 'F#5']), show(NOTES('C7(#11)')));
check('C7(#9) = C E G Bb D#', show(NOTES('C7(#9)')) === show(['C4', 'E4', 'G4', 'A#4', 'D#5']), show(NOTES('C7(#9)')));
// Стек расширений тянет за 13-й и 11-ю, и 9-ю, и септиму; ♭9 кладётся поверх
// натуральной 9-й — это принятое приближение, зафиксированное в комментарии
// самого getChordNotes. Правка скобок на него не влияет (группы в скобках —
// отдельный случай), поэтому ожидание прежнее: 8 нот.
check('C13b9 держит 13-ю и ♭9 поверх натуральной 9-й (8 нот, как раньше)',
  show(NOTES('C13b9')) === show(['C4', 'E4', 'G4', 'A#4', 'C#5', 'D5', 'F5', 'A5']), show(NOTES('C13b9')));
check('C7(no3) не потерял септиму', NOTES('C7(no3)').includes('A#4'), show(NOTES('C7(no3)')));

console.log('=== 5. buildChordName: минорная нона ===');
check('Cm9: (0,2,3,7,10) -> Cm9 (было Cm7)', BCN('C', [0, 2, 3, 7, 10]) === 'Cm9', BCN('C', [0, 2, 3, 7, 10]));
check('Cm11 без изменений', BCN('C', [0, 2, 3, 5, 7, 10]) === 'Cm11', BCN('C', [0, 2, 3, 5, 7, 10]));
check('Cm13 без изменений', BCN('C', [0, 2, 3, 7, 9, 10]) === 'Cm13', BCN('C', [0, 2, 3, 7, 9, 10]));
check('Cm(maj9) без изменений', BCN('C', [0, 2, 3, 7, 11]) === 'Cm(maj9)', BCN('C', [0, 2, 3, 7, 11]));
check('аккорд Хендрикса 7♯9 не сломан гвардом',
  BCN('C', [0, 3, 4, 7, 10]) === 'C7(♯9)', BCN('C', [0, 3, 4, 7, 10]));
check('C9 без изменений', BCN('C', [0, 2, 4, 7, 10]) === 'C9', BCN('C', [0, 2, 4, 7, 10]));
check('Cm7 без изменений', BCN('C', [0, 3, 7, 10]) === 'Cm7', BCN('C', [0, 3, 7, 10]));
check('Cm7♭5 без изменений', BCN('C', [0, 3, 6, 10]) === 'Cm7♭5', BCN('C', [0, 3, 6, 10]));

console.log('=== 6. Написание в ячейке остаётся типографским (0.562) ===');
check('buildChordName по-прежнему пишет ♭', BCN('C', [0, 3, 6, 10]).includes('♭'), BCN('C', [0, 3, 6, 10]));
check('expandChordName не переписывает ♭ на b', ECN('Cm7♭5') === 'Cm7♭5', ECN('Cm7♭5'));
check('normalizeChordCase не переписывает ♭ на b',
  w.eval(`normalizeChordCase('C7(♭9)')`) === 'C7(♭9)', w.eval(`normalizeChordCase('C7(♭9)')`));
check('normalizeAccidentals — служебная, на модель не влияет',
  w.eval(`normalizeAccidentals('Cm7♭5')`) === 'Cm7b5', w.eval(`normalizeAccidentals('Cm7♭5')`));

console.log('=== 7. Кирпич 2: нота Cb не выпадает из озвучки ===');
// В бемольных тональностях SHARP_TO_FLAT пишет ноту B как Cb, а таблица
// noteToFrequency её не знала: частота выходила NaN, и strumChord отбрасывал
// её через .filter(Boolean). В F и Bb аккорды вида G7/Em/Bdim звучали без
// этой ноты, если у ячейки нет своей аппликатуры.
const FREQ = (n) => w.eval(`noteToFrequency(${JSON.stringify(n)})`);
const KEPT = (chord, key) => {
  const ks = w.eval(`getKeyStyle(${JSON.stringify(key)})`);
  return NOTES(chord, ks).filter((n) => w.eval(`noteToFrequency(${JSON.stringify(n)})`) !== null);
};
check('Cb4 = та же высота, что B4 (было NaN)', FREQ('Cb4') === FREQ('B4') && FREQ('Cb4') > 0, String(FREQ('Cb4')));
check('Cb без октавы тоже считается', FREQ('Cb') > 0, String(FREQ('Cb')));
check('незнакомое написание даёт null, а не NaN', FREQ('H') === null, String(FREQ('H')));
check('G7 в Bb звучит всеми 4 нотами (было 3)', KEPT('G7', 'Bb').length === 4, show(KEPT('G7', 'Bb')));
check('G7 в F звучит всеми 4 нотами', KEPT('G7', 'F').length === 4, show(KEPT('G7', 'F')));
check('Em в F звучит всеми 3 нотами', KEPT('Em', 'F').length === 3, show(KEPT('Em', 'F')));
check('Bdim в Bb звучит всеми 3 нотами', KEPT('Bdim', 'Bb').length === 3, show(KEPT('Bdim', 'Bb')));
check('Abm в Gb звучит всеми 3 нотами', KEPT('Abm', 'Gb').length === 3, show(KEPT('Abm', 'Gb')));
check('G7 в C без изменений (4 ноты)', KEPT('G7', 'C').length === 4, show(KEPT('G7', 'C')));
console.log('  -- регрессия ступеней: правка звука не должна их трогать --');
const DEG = (c, k) => w.eval(`getScaleDegree(${JSON.stringify(c)}, ${JSON.stringify(k)})`);
check('Am в F = iii', DEG('Am', 'F') === 'iii', show(DEG('Am', 'F')));
check('C в F = V', DEG('C', 'F') === 'V', show(DEG('C', 'F')));
check('Dm в Bb = iii', DEG('Dm', 'Bb') === 'iii', show(DEG('Dm', 'Bb')));
check('Gm в Bb = vi', DEG('Gm', 'Bb') === 'vi', show(DEG('Gm', 'Bb')));
check('Abm в Gb = ii (нота Cb осталась в гамме)', DEG('Abm', 'Gb') === 'ii', show(DEG('Abm', 'Gb')));
// G мажор в F мажоре НЕ диатоничен (это V/V) — пустая ступень корректна.
// В черновике разбора я ошибочно посчитал это потерей; остаётся как есть.
check('G в F = "" — корректно, G мажор не диатоничен в F', DEG('G', 'F') === '', show(DEG('G', 'F')));

console.log('=== 8. Кирпич 3: Нэшвилл и римские цифры ===');
const NASH = (x, k) => w.eval(`nashvilleToChord(${JSON.stringify(x)}, ${JSON.stringify(k)})`);
console.log('  -- римские: порядок и регистр (было ii -> Ci, IV -> Cv, vi -> Gi) --');
check('ii в C = Dm (было Ci)', NASH('ii', 'C') === 'Dm', show(NASH('ii', 'C')));
check('IV в C = F (было Cv)', NASH('IV', 'C') === 'F', show(NASH('IV', 'C')));
check('vi в C = Am (было Gi)', NASH('vi', 'C') === 'Am', show(NASH('vi', 'C')));
check('vii в C = Bm (регистр = качество)', NASH('vii', 'C') === 'Bm', show(NASH('vii', 'C')));
check('vii° в C = Bdim', NASH('vii°', 'C') === 'Bdim', show(NASH('vii°', 'C')));
check('i и I в C различаются: Cm и C', NASH('i', 'C') === 'Cm' && NASH('I', 'C') === 'C',
  show(NASH('i', 'C')) + ' / ' + show(NASH('I', 'C')));
check('iii в C = Em, III в C = E', NASH('iii', 'C') === 'Em' && NASH('III', 'C') === 'E');
check('суффикс сохраняется: V7 = G7', NASH('V7', 'C') === 'G7', show(NASH('V7', 'C')));
check('суффикс сохраняется: ii7 = Dm7', NASH('ii7', 'C') === 'Dm7', show(NASH('ii7', 'C')));
check('суффикс сохраняется: IVmaj7 = Fmaj7', NASH('IVmaj7', 'C') === 'Fmaj7', show(NASH('IVmaj7', 'C')));
check('бас сохраняется: I/E = C/E', NASH('I/E', 'C') === 'C/E', show(NASH('I/E', 'C')));
console.log('  -- римские в миноре (было III=Amii, VI=Emi, VII=Emii) --');
check('i в Am = Am', NASH('i', 'Am') === 'Am', show(NASH('i', 'Am')));
check('III в Am = C', NASH('III', 'Am') === 'C', show(NASH('III', 'Am')));
check('VI в Am = F', NASH('VI', 'Am') === 'F', show(NASH('VI', 'Am')));
check('VII в Am = G', NASH('VII', 'Am') === 'G', show(NASH('VII', 'Am')));
check('ii° в Am = Bdim', NASH('ii°', 'Am') === 'Bdim', show(NASH('ii°', 'Am')));
check('V в Am = E (мажорная доминанта гармонического минора)', NASH('V', 'Am') === 'E', show(NASH('V', 'Am')));
check('v в Am = Em', NASH('v', 'Am') === 'Em', show(NASH('v', 'Am')));
check('V7 в Am = E7', NASH('V7', 'Am') === 'E7', show(NASH('V7', 'Am')));
console.log('  -- альтерации: знак задаёт и написание --');
check('bVII в C = Bb (было A#)', NASH('bVII', 'C') === 'Bb', show(NASH('bVII', 'C')));
check('bIII в C = Eb', NASH('bIII', 'C') === 'Eb', show(NASH('bIII', 'C')));
check('bVI в C = Ab', NASH('bVI', 'C') === 'Ab', show(NASH('bVI', 'C')));
check('#iv в C = F#m', NASH('#iv', 'C') === 'F#m', show(NASH('#iv', 'C')));
check('b7 в C = Bb (было A#)', NASH('b7', 'C') === 'Bb', show(NASH('b7', 'C')));
check('b3 в C = Eb', NASH('b3', 'C') === 'Eb', show(NASH('b3', 'C')));
check('#4 в C = F# (не Gb)', NASH('#4', 'C') === 'F#', show(NASH('#4', 'C')));
console.log('  -- числа: в миноре отсчёт от относительного мажора --');
check('1 в C = C', NASH('1', 'C') === 'C', show(NASH('1', 'C')));
check('6 в C = Am', NASH('6', 'C') === 'Am', show(NASH('6', 'C')));
check('7 в C = Bdim', NASH('7', 'C') === 'Bdim', show(NASH('7', 'C')));
check('6 в Am = Am — тоника (конвенция Нэшвилла)', NASH('6', 'Am') === 'Am', show(NASH('6', 'Am')));
check('1 в Am = C', NASH('1', 'Am') === 'C', show(NASH('1', 'Am')));
check('2 в Am = Dm', NASH('2', 'Am') === 'Dm', show(NASH('2', 'Am')));
check('5 в Am = G', NASH('5', 'Am') === 'G', show(NASH('5', 'Am')));
console.log('  -- валидатор: мусор больше не уходит в файл песни --');
for (const garbage of ['Ci', 'Cv', 'Amii', 'Bvii', 'Biii', 'xx', 'i9x', '17']) {
  check(`«${garbage}» отклонён`, NASH(garbage, 'C') === null, show(NASH(garbage, 'C')));
}
console.log('  -- обычные аккорды не перехватываются вводом ступеней --');
for (const chord of ['C', 'Cm7', 'Bb', 'F#m7', 'C/E', 'Cadd9', 'C7b9']) {
  check(`«${chord}» остаётся аккордом`, NASH(chord, 'C') === null, show(NASH(chord, 'C')));
}
console.log('  -- русские порядковые --');
check('шестая в Am = F (было F#m с мусорным хвостом)', NASH('шестая', 'Am') === 'F', show(NASH('шестая', 'Am')));
check('шестая в миноре в Am = Fm', NASH('шестая в миноре', 'Am') === 'Fm', show(NASH('шестая в миноре', 'Am')));
check('шестая в мажоре в Am = F#', NASH('шестая в мажоре', 'Am') === 'F#', show(NASH('шестая в мажоре', 'Am')));
check('первая в Am = Am', NASH('первая', 'Am') === 'Am', show(NASH('первая', 'Am')));
check('шестая в C = Am (без изменений)', NASH('шестая', 'C') === 'Am', show(NASH('шестая', 'C')));
console.log('  -- bVII доходит до парсера (normalizeChordCase его больше не ломает) --');
check("normalizeChordCase('bVII') всё ещё даёт Bvii — поэтому Нэшвилл зовётся раньше",
  w.eval(`normalizeChordCase('bVII')`) === 'Bvii', w.eval(`normalizeChordCase('bVII')`));
check('saveCurrentChord зовёт Нэшвилл до нормализации регистра',
  /nashvilleToChord\(rawChord, currentKey\)/.test(html), 'порядок вызова в saveCurrentChord');

console.log('=== 9. B-101 (кирпич 4): ступени, доминанты, октавы — 0.592 ===');
const PC = (x) => w.eval(`parseChordForKeyDetection(${JSON.stringify(x)})`);
const SDOM = (a, b, k) => w.eval(
  `isSecondaryDominant(parseChordForKeyDetection(${JSON.stringify(a)}), ` +
  `parseChordForKeyDetection(${JSON.stringify(b)}), ${JSON.stringify(k)})`);
// sus-аккорд держит кварту ВМЕСТО терции, поэтому «минорная ступень» над ним
// — выдумка: Dsus4 в C показывался как ii, хотя минорной терции (F) в нём
// нет и в помине. Раньше проверялись только корень и вхождение нот в гамму —
// D, G, A все диатоничны, поэтому подпись проходила. Теперь для sus ступень
// не показывается вовсе: честнее не написать ничего, чем написать неправду.
// РЕШЕНИЕ ОБРАТИМО: вся правка — одна строка `if (/sus/i.test(wb)) return ''`.
console.log('  -- sus: ступени не показываем, поскольку терции нет --');
for (const [chord, key, was] of [['Dsus4', 'C', 'ii'], ['Csus4', 'C', 'I'], ['Asus2', 'C', 'vi'],
  ['Esus4', 'C', 'iii'], ['G7sus4', 'C', 'V'], ['Csus4', 'F', 'V'], ['Gsus4', 'Bb', 'V']]) {
  check(`${chord} в ${key} — ступени нет (было ${was})`, DEG(chord, key) === '', show(DEG(chord, key)));
}
console.log('  -- обычные аккорды: ступени без регрессий --');
for (const [chord, key, deg] of [['C', 'C', 'I'], ['Dm', 'C', 'ii'], ['Em', 'C', 'iii'],
  ['F', 'C', 'IV'], ['G', 'C', 'V'], ['Am', 'C', 'vi'], ['Bdim', 'C', 'vii°'], ['G7', 'C', 'V'],
  ['F', 'F', 'I'], ['Gm', 'F', 'ii'], ['Am', 'F', 'iii'], ['Bb', 'F', 'IV'], ['C', 'F', 'V'],
  ['Dm', 'F', 'vi'], ['Edim', 'F', 'vii°'],
  ['Am', 'Am', 'i'], ['Bdim', 'Am', 'ii°'], ['C', 'Am', 'III'], ['Dm', 'Am', 'iv'],
  ['F', 'Am', 'VI'], ['G', 'Am', 'VII'],
  ['Bb', 'Bb', 'I'], ['Cm', 'Bb', 'ii'], ['Eb', 'Bb', 'IV']]) {
  check(`${chord} в ${key} = ${deg}`, DEG(chord, key) === deg, show(DEG(chord, key)));
}
check('F#dim7 в C — ступени нет (не в гамме, без изменений)', DEG('F#dim7', 'C') === '', show(DEG('F#dim7', 'C')));

// Доминантовый бонус в определении тональности читал только имена,
// начинающиеся с семёрки: G9/G11/G13 оставались без бонуса, хотя это те же
// доминанты с надстройками. Порядок альтернатив 13|11|9|7 важен, иначе
// «G13» собралось бы как 1 -> и дальше (?!\d) его отсечёт.
console.log('  -- isDominant7: 9/11/13 — тоже доминанты --');
for (const chord of ['G7', 'G9', 'G11', 'G13', 'G7b9', 'G13b9']) {
  check(`${chord} — доминанта (${chord === 'G7' ? 'без изменений' : 'было false'})`,
    PC(chord).isDominant7 === true, show(PC(chord).isDominant7));
}
for (const chord of ['Gmaj7', 'Gmaj9', 'Gm7', 'Gm9', 'G', 'G6', 'Gsus4', 'Gdim7', 'Gm7b5']) {
  check(`${chord} — не доминанта (без изменений)`, PC(chord).isDominant7 === false, show(PC(chord).isDominant7));
}

// Уменьшённое трезвучие обычно не тонизируют, поэтому V/vii° — не функция.
console.log('  -- V/vii° больше не считается функцией --');
check('F#7 -> Bdim в C = false (было true)', SDOM('F#7', 'Bdim', 'C') === false, show(SDOM('F#7', 'Bdim', 'C')));
for (const [a, b] of [['D7', 'G'], ['A7', 'Dm'], ['E7', 'Am'], ['C7', 'F'], ['B7', 'Em'], ['G7', 'C']]) {
  check(`${a} -> ${b} в C = true (без изменений)`, SDOM(a, b, 'C') === true, show(SDOM(a, b, 'C')));
}
for (const [a, b] of [['D7', 'Dm'], ['A7', 'A']]) {
  check(`${a} -> ${b} в C = false (без изменений)`, SDOM(a, b, 'C') === false, show(SDOM(a, b, 'C')));
}

// Раньше все ноты лепились в четвёртую октаву: G7 давал G4 B4 D4 F4, и две
// ноты оказывались НИЖЕ корня — озвучка без аппликатуры собирала аккорд
// обратной расстановкой. Теперь октава растёт вместе с интервалом.
console.log('  -- октавы: аккорд раскладывается от корня вверх --');
check('G7 = G4 B4 D5 F5 (было G4 B4 D4 F4)', show(NOTES('G7')) === show(['G4', 'B4', 'D5', 'F5']), show(NOTES('G7')));
check('Am7 = A4 C5 E5 G5 (было A4 C4 E4 G4)', show(NOTES('Am7')) === show(['A4', 'C5', 'E5', 'G5']), show(NOTES('Am7')));
check('Bb в flat-стиле = Bb4 D5 F5 (было Bb4 D4 F4)',
  show(NOTES('Bb', 'flat')) === show(['Bb4', 'D5', 'F5']), show(NOTES('Bb', 'flat')));
check('C13 = C4 E4 G4 A#4 D5 F5 A5', show(NOTES('C13')) === show(['C4', 'E4', 'G4', 'A#4', 'D5', 'F5', 'A5']), show(NOTES('C13')));
check('B13 = B4 D#5 F#5 A5 C#6 E6 G#6 (самый высокий случай)',
  show(NOTES('B13')) === show(['B4', 'D#5', 'F#5', 'A5', 'C#6', 'E6', 'G#6']), show(NOTES('B13')));
check('Cmaj7 не съехал: C4 E4 G4 B4', show(NOTES('Cmaj7')) === show(['C4', 'E4', 'G4', 'B4']), show(NOTES('Cmaj7')));
// Главное свойство: высоты внутри аккорда не убывают, и каждая нота звучит.
let notRising = [];
let silent = [];
for (const root of ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']) {
  for (const suffix of ['', 'm', '7', 'maj7', 'm7', 'dim7', 'm7b5', '9', '11', '13', 'add9', 'sus4', '6', '6/9']) {
    for (const ks of ['sharp', 'flat']) {
      const chord = root + suffix;
      const freqs = NOTES(chord, ks).map((n) => FREQ(n));
      if (freqs.some((f) => !isFinite(f))) silent.push(chord + '/' + ks);
      for (let i = 1; i < freqs.length; i++) {
        if (freqs[i] <= freqs[i - 1]) notRising.push(chord + '/' + ks + ' ' + show(NOTES(chord, ks)));
      }
    }
  }
}
check('все 336 аккордов × 2 стиля звучат (нет NaN-частот)', silent.length === 0, silent.slice(0, 5).join('; '));
check('высоты внутри аккорда не убывают (было: D и F ниже корня у G7)', notRising.length === 0, notRising.slice(0, 3).join('; '));

// Профиль Крумхансла–Кесслера для мажора: 6.35 2.23 3.48 2.33 4.38 4.09 2.52
// 5.19 2.39 3.66 2.29 2.88 на C C# D D# E F F# G G# A A# B. Диатонические
// позиции — 6.35 3.48 4.38 4.09 5.19 3.66 и 2.88 (B, вводящий тон). В коде
// последним весом стояло 2.52 — это F#, то есть значение со сдвигом на позицию.
console.log('  -- профиль K-K: вес vii° в мажоре --');
const MAJW = w.eval("KEY_TEMPLATES.find(t => t.name === 'major').weights.join(',')");
const MINW = w.eval("KEY_TEMPLATES.find(t => t.name === 'minor').weights.join(',')");
check('мажор: 6.35,3.48,4.38,4.09,5.19,3.66,2.88 (было ...2.52)', MAJW === '6.35,3.48,4.38,4.09,5.19,3.66,2.88', MAJW);
check('минор не тронут: 6.33,3.52,5.38,3.53,4.75,3.98,3.34', MINW === '6.33,3.52,5.38,3.53,4.75,3.98,3.34', MINW);


console.log(`\nПРОВАЛОВ: ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);

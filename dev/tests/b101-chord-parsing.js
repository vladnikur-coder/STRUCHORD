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
check('Cadd4 = C E F G (было C E G)', show(NOTES('Cadd4')) === show(['C4', 'E4', 'G4', 'F4']), show(NOTES('Cadd4')));
check('Cadd2 = C E G D (было C E G)', show(NOTES('Cadd2')) === show(['C4', 'E4', 'G4', 'D4']), show(NOTES('Cadd2')));
check('Amadd2 = A C E B', show(NOTES('Amadd2')) === show(['A4', 'C4', 'E4', 'B4']), show(NOTES('Amadd2')));
check('Cadd11 по-прежнему C E G F', show(NOTES('Cadd11')) === show(['C4', 'E4', 'G4', 'F4']), show(NOTES('Cadd11')));
check('Cadd9 по-прежнему C E G D', show(NOTES('Cadd9')) === show(['C4', 'E4', 'G4', 'D4']), show(NOTES('Cadd9')));
// 0.347: «C5add9» осознанно остаётся МАЖОРНЫМ add9 (C E G D), а не квинтой
// с девятой — правило /^5($|[^a-z])/ не срабатывает, потому что после 5 идёт
// буква. Менять не входило в эту волну; фиксируем как принятое поведение.
check('C5add9 остаётся мажорным add9 (0.347)', show(NOTES('C5add9')) === show(['C4', 'E4', 'G4', 'D4']), show(NOTES('C5add9')));

console.log('=== 3. Типографские ♭/♯ понимаются разборщиками ===');
check('Cm7♭5 = C Eb Gb Bb (было C Eb G Bb = обычный Cm7)',
  show(NOTES('Cm7♭5')) === show(['C4', 'D#4', 'F#4', 'A#4']), show(NOTES('Cm7♭5')));
check('Cm7b5 (ASCII) не изменился',
  show(NOTES('Cm7b5')) === show(['C4', 'D#4', 'F#4', 'A#4']), show(NOTES('Cm7b5')));
check('две записи дают одинаковые ноты', show(NOTES('Cm7♭5')) === show(NOTES('Cm7b5')));
check('C7(♭9) держит ♭9 (было 4 ноты, ♭9 терялась)',
  show(NOTES('C7(♭9)')) === show(['C4', 'E4', 'G4', 'A#4', 'C#4']), show(NOTES('C7(♭9)')));
check('C7(b9) совпадает с C7(♭9)', show(NOTES('C7(b9)')) === show(NOTES('C7(♭9)')));
check('C7(♯5) = C E G# Bb (было G)',
  show(NOTES('C7(♯5)')) === show(['C4', 'E4', 'G#4', 'A#4']), show(NOTES('C7(♯5)')));
check('C(♯5) = C E G#', show(NOTES('C(♯5)')) === show(['C4', 'E4', 'G#4']), show(NOTES('C(♯5)')));
check('C(♭5) = C E Gb', show(NOTES('C(♭5)')) === show(['C4', 'E4', 'F#4']), show(NOTES('C(♭5)')));
check('C7(♯9) = C E G Bb D#', show(NOTES('C7(♯9)')) === show(['C4', 'E4', 'G4', 'A#4', 'D#4']), show(NOTES('C7(♯9)')));
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
  show(NOTES('C(#11)')) === show(['C4', 'E4', 'G4', 'F#4']), show(NOTES('C(#11)')));
check('C(♯11) совпадает с C(#11) (иначе простая замена ♯-># УХУДШАЛА ноты)',
  show(NOTES('C(♯11)')) === show(['C4', 'E4', 'G4', 'F#4']), show(NOTES('C(♯11)')));
check('C(b9) = C E G Db (было 6 нот)',
  show(NOTES('C(b9)')) === show(['C4', 'E4', 'G4', 'C#4']), show(NOTES('C(b9)')));
check('C7(#11) = C E G Bb F#', show(NOTES('C7(#11)')) === show(['C4', 'E4', 'G4', 'A#4', 'F#4']), show(NOTES('C7(#11)')));
check('C7(#9) = C E G Bb D#', show(NOTES('C7(#9)')) === show(['C4', 'E4', 'G4', 'A#4', 'D#4']), show(NOTES('C7(#9)')));
// Стек расширений тянет за 13-й и 11-ю, и 9-ю, и септиму; ♭9 кладётся поверх
// натуральной 9-й — это принятое приближение, зафиксированное в комментарии
// самого getChordNotes. Правка скобок на него не влияет (группы в скобках —
// отдельный случай), поэтому ожидание прежнее: 8 нот.
check('C13b9 держит 13-ю и ♭9 поверх натуральной 9-й (8 нот, как раньше)',
  show(NOTES('C13b9')) === show(['C4', 'E4', 'G4', 'A#4', 'C#4', 'D4', 'F4', 'A4']), show(NOTES('C13b9')));
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

console.log(`\nПРОВАЛОВ: ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);

#!/usr/bin/env node
/*
 * b596-chord-kirpich6.js — B-101, кирпич 6 (версия 0.596).
 *
 * Закрепляем исправления объективных ошибок разбора и написания, а также
 * решения пользователя по видимым правилам (R8):
 *  1. C-7 и C-m7 = Cm7; C-M7 и C-Δ = Cm(maj7); CM7 и CΔ = Cmaj7 (джазовая запись);
 *  2. E#, B#, Fb как корни дают ноты (раньше тихие аккорды без ступени);
 *  3. b6 = малая секста (Cmb6 = C Eb G Ab), а не потеря ноты;
 *  4. ступени: E#dim в F# = vii°, G#dim в Am = vii° (ведущий тон), Cb в Ebm = VI;
 *  5. V/ii sus4: A7 → Dsus4 = «V/ii sus4»;
 *  6. Dm6 без квинты (D F B) не распознаётся — это Bdim/D;
 *  7. C11 с басом C — C11, а не Gm11/C (правило «корень в басу побеждает»);
 *  8. x33311 остаётся Fsus4/C по нотам, но принимается для ячейки C11 или C7sus4;
 *  9. написание корня по тональности: диатонический — по гамме (E#/Cb допустимы),
 *     хроматический — из читаемого набора, тритон — по стилю тональности;
 * 10. метроном 6/8: вторичный акцент на границе групп (click 1 = вторая доля).
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
const ev = (code) => w.eval(code);
const pcs = (notes) => (notes || []).map((n) => String(n).replace(/\d+$/, '')).sort().join(' ');
const pcsOf = (chord, style = 'sharp') => pcs(ev(`getChordNotes(${JSON.stringify(chord)}, ${JSON.stringify(style)})`));
// Путь ввода: имя из ячейки расширяется (Δ → maj7) и нормализуется, потом идёт в ноты.
const pcsTyped = (chord, style = 'sharp') => pcs(ev(
  `getChordNotes(normalizeChordCase(expandChordName(${JSON.stringify(chord)})), ${JSON.stringify(style)})`));

// ---- 1. Запись минорной и мажорной септимы ----
check('C-7 даёт Cm7 (C Eb G Bb), а не C7', pcsOf('C-7') === pcsOf('Cm7'), pcsOf('C-7'));
// Джазовая запись: C-M7 и C-Δ — минор с большой септимой (Cm(maj7) = C Eb G B).
check('C-M7 даёт Cm(maj7) = C D# G B', pcsTyped('C-M7') === 'B C D# G', pcsTyped('C-M7'));
check('C-Δ даёт Cm(maj7)', pcsTyped('C-Δ') === 'B C D# G', pcsTyped('C-Δ'));
check('CΔ даёт Cmaj7 (C E G B)', pcsTyped('CΔ') === 'B C E G', pcsTyped('CΔ'));
check('C-5 не трогается (C E F# — пониженная квинта)', pcsOf('C-5') === 'C E F#', pcsOf('C-5'));

// ---- 2. Корни E#, B#, Fb дают ноты ----
check('E#dim не тихий: F G# B', pcsOf('E#dim') === 'B F G#', pcsOf('E#dim'));
check('B#m не тихий: C D# G', pcsOf('B#m') === 'C D# G', pcsOf('B#m'));
check('Fb не тихий: E Ab Cb (Cb = B по высоте)', pcsOf('Fb', 'flat') === 'Ab Cb E', pcsOf('Fb', 'flat'));

// ---- 3. b6 — малая секста ----
check('Cmb6 = C Eb G Ab (малая секста, без 9-й)', pcsOf('Cmb6') === 'C D# G G#', pcsOf('Cmb6'));
check('C7b6 не теряет ноту (C E G Bb Ab)', pcsOf('C7b6').split(' ').length === 5, pcsOf('C7b6'));

// ---- 4. Ступени ----
check('E#dim в F# = vii°', ev('analyzeChordHarmony("E#dim","F#",{}).degree') === 'vii°',
  ev('analyzeChordHarmony("E#dim","F#",{}).degree'));
check('B#m в C = i', ev('analyzeChordHarmony("B#m","C",{}).degree') === 'i');
check('G#dim в Am = vii° (ведущий тон, не #vii°)', ev('analyzeChordHarmony("G#dim","Am",{}).degree') === 'vii°',
  ev('analyzeChordHarmony("G#dim","Am",{}).degree'));
check('Cb в Ebm = VI (диатоническая ступень)', ev('analyzeChordHarmony("Cb","Ebm",{}).degree') === 'VI',
  ev('analyzeChordHarmony("Cb","Ebm",{}).degree'));

// ---- 5. Вторичная доминанта к sus-цели ----
check('A7 → Dsus4 = V/ii sus4', ev('analyzeChordHarmony("A7","C",{nextChord:"Dsus4"}).function') === 'V/ii sus4',
  ev('analyzeChordHarmony("A7","C",{nextChord:"Dsus4"}).function'));

// ---- 6. Dm6 без квинты — не Dm6 ----
check('D F B (бас D) = Bdim/D, не Dm6',
  ev('analyzeFingeringShape(["x","x",0,4,3,1],{key:"C"}).chordName') === 'Bdim/D',
  ev('analyzeFingeringShape(["x","x",0,4,3,1],{key:"C"}).chordName'));

// ---- 7. C11 с басом C ----
const c11Shapes = [['x', 3, 0, 0, 6, 6], ['x', 3, 0, 0, 11, 1], ['x', 3, 0, 3, 6, 3]];
c11Shapes.forEach((s) => {
  const name = ev(`analyzeFingeringShape(${JSON.stringify(s)},{key:"C"}).chordName`);
  check(`C G Bb D F с басом C: ${JSON.stringify(s)} → C11`, name === 'C11', name);
});

// ---- 8. x33311: имя по нотам Fsus4/C, принимается для C11 и C7sus4 ----
const x33311 = ['x', 3, 3, 3, 1, 1];
check('x33311 по нотам = Fsus4/C', ev(`analyzeFingeringShape(${JSON.stringify(x33311)},{key:"C"}).chordName`) === 'Fsus4/C');
check('x33311 принимается для ячейки C11',
  ev(`shapeMatchesChord(${JSON.stringify(x33311)}, getChordNotes("C11","sharp"), "C", null)`) === true);
check('x33311 принимается для ячейки C7sus4',
  ev(`shapeMatchesChord(${JSON.stringify(x33311)}, getChordNotes("C7sus4","sharp"), "C", null)`) === true);
check('x33311 не принимается для Cmaj7 (нет F и Bb)',
  ev(`shapeMatchesChord(${JSON.stringify(x33311)}, getChordNotes("Cmaj7","sharp"), "C", null)`) === false);

// ---- 9. Написание корня по тональности ----
const spell = (root, style, key) => ev(`correctChordName(${JSON.stringify(root)}, ${JSON.stringify(style)}, ${JSON.stringify(key)})`);
check('C в F# остаётся C (B# не из читаемого набора)', spell('C', 'sharp', 'F#') === 'C', spell('C', 'sharp', 'F#'));
check('F в F# по гамме = E# (диатонический корень)', spell('F', 'sharp', 'F#') === 'E#', spell('F', 'sharp', 'F#'));
check('B в Bb остаётся B (Cb из читаемого набора не берём)', spell('B', 'flat', 'Bb') === 'B', spell('B', 'flat', 'Bb'));
check('A# в C = Bb (хроматический, читаемый)', spell('A#', 'sharp', 'C') === 'Bb', spell('A#', 'sharp', 'C'));
check('Ab в Dm (тритон G# по стилю бемольной тональности) = Ab', spell('G#', 'flat', 'Dm') === 'Ab', spell('G#', 'flat', 'Dm'));
check('F# в Cm (тритон, бемольный стиль) = Gb', spell('F#', 'flat', 'Cm') === 'Gb', spell('F#', 'flat', 'Cm'));
check('E в Db (хроматический, Fb заменяем на E)', spell('E', 'flat', 'Db') === 'E', spell('E', 'flat', 'Db'));
check('B в Ebm (диатонический, Cb по гамме)', spell('B', 'flat', 'Ebm') === 'Cb', spell('B', 'flat', 'Ebm'));

// ---- 10. Метроном 6/8: вторичный акцент на границе групп ----
{
  const clicks = [];
  w.eval('scheduleClick = function (ctx, t, acc, mid) { window.__clicks.push({ acc, mid }); }');
  w.eval('window.__clicks = []');
  const savedSub = ev('metronomeSubdivision');
  ev('metronomeSubdivision = 1');
  ev('playbackState.isPlaying = true');
  // 6/8 при 120 BPM: пульс — долевая четверть 0.75 с; берём 4 пульса (0..3).
  w.eval('scheduleMetronomeEvents({ currentTime: 2.9 }, 0, "6/8", 120)');
  ev('stopMetronomeScheduler()');
  ev('playbackState.isPlaying = false');
  ev(`metronomeSubdivision = ${savedSub}`);
  const got = w.eval('window.__clicks');
  clicks.push(...got);
  check('6/8 шаг «доля»: первый пульс — акцент', clicks[0] && clicks[0].acc === true, JSON.stringify(clicks));
  check('6/8 шаг «доля»: второй пульс (граница 3+3) — вторичный акцент', clicks[1] && clicks[1].mid === true, JSON.stringify(clicks));
}

// --- 0.596 (пункт 1 баг-репорта): транспонирование и октавы E#/B#/Fb/Cb ---
{
  const T = (c, st) => ev(`transposeChord(${JSON.stringify(c)}, ${st})`);
  const cases = [
    ['E#', 1, 'F#'], ['E#', 2, 'G'], ['E#', -1, 'E'],
    ['E#dim', 1, 'F#dim'], ['E#dim', -1, 'Edim'],
    ['B#', 1, 'C#'], ['B#', 2, 'D'], ['B#', -1, 'B'],
    ['Fb', 1, 'F'], ['Fb', 2, 'Gb'], ['Fb', -1, 'Eb'],
    ['Cb', 1, 'C'], ['Cb', 2, 'Db'], ['Cb', -1, 'Bb'],
    ['Cbmaj7', 1, 'Cmaj7'], ['Cbmaj7', 2, 'Dbmaj7'], ['Cbmaj7', -1, 'Bbmaj7'],
    ['Fb/Cb', 1, 'F/C'], ['E#m7/B#', 1, 'F#m7/C#'],
  ];
  for (const [c, st, want] of cases) {
    const got = T(c, st);
    check(`транспонирование ${c} ${st > 0 ? '+' : ''}${st} = ${want}`, got === want, String(got));
  }
  const F = (n) => ev(`noteToFrequency(${JSON.stringify(n)})`);
  check('E#4 = F4 (было null)', F('E#4') !== null && F('E#4') === F('F4'), String(F('E#4')));
  check('B#4 = C5 (было null)', F('B#4') !== null && F('B#4') === F('C5'), String(F('B#4')));
  check('Fb4 = E4 (было null)', F('Fb4') !== null && F('Fb4') === F('E4'), String(F('Fb4')));
  check('Cb4 = B3 (научная нотация)', F('Cb4') !== null && F('Cb4') === F('B3'), String(F('Cb4')));
  const N = (c, ks) => ev(`getChordNotes(${JSON.stringify(c)}, ${JSON.stringify(ks)})`);
  const fr = (c, ks) => N(c, ks).map((n) => F(n));
  check('Cb (корень) звучит как Cb4 Eb4 Gb4', JSON.stringify(fr('Cb', 'flat')) === JSON.stringify([F('Cb4'), F('Eb4'), F('Gb4')]), JSON.stringify(N('Cb', 'flat')));
  check('Fb в бемольном стиле: E4 Ab4 и B4 (=Cb5) в верхнем голосе', JSON.stringify(N('Fb', 'flat')) === JSON.stringify(['E4', 'Ab4', 'Cb5']), JSON.stringify(N('Fb', 'flat')));
  check('G7 в F: все 4 ноты звучат (B = Cb5 = B4)', fr('G7', 'flat').filter((x) => x).length === 4 && F('Cb5') === F('B4'), JSON.stringify(fr('G7', 'flat')));
}

// --- 0.596 (решения пользователя по видимым правилам) ---
{
  const NN = (c, ks) => ev(`getChordNotes(${JSON.stringify(c)}, ${JSON.stringify(ks)})`);
  const PC = (c, ks) => ev(`getChordNotes(${JSON.stringify(c)}, ${JSON.stringify(ks)})`).map((n) => ev(`toSharpNote(${JSON.stringify(n.replace(/\d+$/, ''))})`)).join(' ');
  // Пункт 2: голый C- = Cm (C Eb G), а не C E G
  check('C- звучит как Cm (C D# G), не как C', PC('C-', 'sharp') === PC('Cm', 'sharp') && PC('C-', 'sharp') === 'C D# G', PC('C-', 'sharp'));
  check('C- разбирается как минор', ev('parseChordForKeyDetection("C-").quality') === 'min', ev('parseChordForKeyDetection("C-").quality'));
  check('C-/G звучит как Cm/G', PC('C-/G', 'sharp') === 'C D# G', PC('C-/G', 'sharp'));
  check('C-5 по-прежнему пониженная квинта (C E F#)', PC('C-5', 'sharp') === 'C E F#', PC('C-5', 'sharp'));
  // Пункт 3: C11 без терции — C G Bb D F
  check('C11 звучит как C G Bb D F (без E)', PC('C11', 'sharp') === 'C G A# D F', PC('C11', 'sharp'));
  check('C11 в бемольном стиле: без E', !NN('C11', 'flat').some((n) => n.startsWith('E')), JSON.stringify(NN('C11', 'flat')));
  check('Cm11 сохраняет терцию (C D# G A# D F)', PC('Cm11', 'sharp') === 'C D# G A# D F', PC('Cm11', 'sharp'));
  check('Cmaj11 сохраняет терцию', PC('Cmaj11', 'sharp').includes('E'), PC('Cmaj11', 'sharp'));
  // Пункт 4: Cmaj7#5 — имя то же, качество aug
  check('Cmaj7#5: качество aug (терции 0-4-8)', ev('parseChordForKeyDetection("Cmaj7#5").quality') === 'aug', ev('parseChordForKeyDetection("Cmaj7#5").quality'));
  check('Cmaj7#5: имя сохраняется', ev('parseChordForKeyDetection("Cmaj7#5").chordName') === 'Cmaj7#5', ev('parseChordForKeyDetection("Cmaj7#5").chordName'));
  check('Cmaj7#5: ступень I+ (aug)', ev('analyzeChordHarmony("Cmaj7#5","C").degree') === 'I+', ev('analyzeChordHarmony("Cmaj7#5","C").degree'));
  check('C7#5 не меняется (качество maj, доминанта)', ev('parseChordForKeyDetection("C7#5").quality') === 'maj', ev('parseChordForKeyDetection("C7#5").quality'));
  // Пункт 5: C E A с басом C = Am/C, а не C6
  check('x,x,x,5,5,5 (C E A) = Am/C, не C6', ev('analyzeFingeringShape(["x","x","x",5,5,5],{key:"C"}).chordName') === 'Am/C', ev('analyzeFingeringShape(["x","x","x",5,5,5],{key:"C"}).chordName'));
  check('C6 с квинтой G по-прежнему C6 (x,3,2,2,1,0 — C6/9 без G не берём)', ev('analyzeFingeringShape(["x",3,2,2,3,3],{key:"C"}).chordName') === 'C6/9', ev('analyzeFingeringShape(["x",3,2,2,3,3],{key:"C"}).chordName'));
}

// --- 0.598: алиасы большой септимы с «+» и Δ ---
{
  const X = (c) => ev(`expandChordName(${JSON.stringify(c)})`);
  const P = (c) => ev(`parseChordForKeyDetection(${JSON.stringify(c)})`);
  const PCS = (c) => ev(`getChordNotes(${JSON.stringify(c)}, "sharp")`).map((n) => ev(`toSharpNote(${JSON.stringify(n.replace(/\d+$/, ''))})`)).join(' ');
  for (const c of ['CΔ+', 'CM7+', 'C+maj7', 'Cmaj7+', 'CΔ#5', 'Cmaj7+5']) {
    check(`${c} → Cmaj7#5/CM7#5 (алиас), качество aug`, /^C(maj7|M7)#5$/.test(X(c)) && P(c).quality === 'aug', `${X(c)} / ${P(c).quality}`);
  }
  check('CΔ+ по нотам: C E G# B', PCS('CΔ+') === 'C E G# B', PCS('CΔ+'));
  check('CΔ (прямой вызов getChordNotes): C E G B, не C E G', PCS('CΔ') === 'C E G B', PCS('CΔ'));
  check('CΔ+ ступень I+ в C', ev('analyzeChordHarmony("CΔ+","C").degree') === 'I+', ev('analyzeChordHarmony("CΔ+","C").degree'));
  check('C+ (Caug) по-прежнему null (как и было)', P('C+').quality === null, String(P('C+').quality));
  check('C11: quality остаётся maj, isDominant7 true (null менял регистр ступеней)', P('C11').quality === 'maj' && P('C11').isDominant7 === true, JSON.stringify(P('C11')));
  check('D11 в C = II (доминанта, заглавная)', ev('analyzeChordHarmony("D11","C").degree') === 'II', ev('analyzeChordHarmony("D11","C").degree'));
}

console.log(`\nПРОВАЛОВ: ${fail}  (ок: ${pass})`);
process.exit(fail ? 1 : 0);

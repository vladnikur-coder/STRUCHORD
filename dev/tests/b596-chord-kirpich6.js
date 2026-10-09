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

console.log(`\nПРОВАЛОВ: ${fail}  (ок: ${pass})`);
process.exit(fail ? 1 : 0);

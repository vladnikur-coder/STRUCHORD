#!/usr/bin/env node
/*
 * b601-minor-dominant.js — версия 0.601 (баг «Доминанта тоники с расширением в миноре»).
 *  1. Для гармонического минора расширения (9, 11, 13) не учитываются у аккордов с септимой:
 *     E7, E9, E11, E13 в Am и A7, A11 в Dm — это V (certain), а не V/i.
 *  2. Тоника не бывает целью вторичной функции: E9 → Am даёт V, не V/i.
 *  3. Sus-аккорды и add9/6 без септимы этим правилом не затрагиваются.
 *  4. Соглашение 0.598: C11 без терции — расширение, терция не нужна для проверки.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'STRUCHORD.html'), 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
  beforeParse(win) {
    win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    win.cancelAnimationFrame = (id) => clearTimeout(id);
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }), clearRect() {}, beginPath() {}, arc() {}, fill() {},
      stroke() {}, moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {}, translate() {},
      rotate() {}, fillText() {}, strokeText() {}, setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {}, sampleRate: 44100,
    createBuffer: (c, len) => ({ getChannelData: () => new Float32Array(len) }) };
};

let pass = 0;
let fail = 0;
function check(name, cond, details) {
  if (cond) { pass++; console.log('ok   ' + name); }
  else { fail++; console.error('FAIL ' + name + (details ? ' (' + details + ')' : '')); }
}
const ev = (code) => w.eval(code);
const analyze = (chord, key, opts = {}) => ev(`analyzeChordHarmony(${JSON.stringify(chord)}, ${JSON.stringify(key)}, ${JSON.stringify(opts)})`);

console.log('=== 1. расширения доминанты в гармоническом миноре ===');
for (const [chord, key, next] of [['E7', 'Am', 'Am'], ['E9', 'Am', 'Am'], ['E11', 'Am', 'Am'], ['E13', 'Am', 'Am'], ['A7', 'Dm', 'Dm'], ['A11', 'Dm', 'Dm']]) {
  const r = analyze(chord, key, { nextChord: next });
  check(`${chord} в ${key} → V, certain`, r.degree === 'V' && r.function === 'V' && r.confidence === 'certain', JSON.stringify(r));
}
for (const [chord, key] of [['E9', 'Am'], ['E11', 'Am'], ['E13', 'Am'], ['A11', 'Dm']]) {
  const r = analyze(chord, key, {});
  check(`${chord} в ${key} без следующего аккорда → V`, r.degree === 'V', JSON.stringify(r));
}

console.log('=== 2. тоника не цель вторичной функции ===');
for (const [chord, key, next] of [['E9', 'Am', 'Am'], ['E11', 'Am', 'Am'], ['E13', 'Am', 'Am']]) {
  const r = analyze(chord, key, { nextChord: next });
  check(`${chord} → ${next} в ${key}: не V/i`, r.degree !== 'V/i' && r.detail !== 'secondary-dominant', JSON.stringify(r));
}
check('isSecondaryDominant(E9, Am) = false (тоника не цель)', ev(`isSecondaryDominant('E9', 'Am', 'Am')`) === false);

console.log('=== 3. ограничения правила ===');
const sus = analyze('E7sus4', 'Am', { nextChord: 'Am' });
check('E7sus4 не становится V через расширения', sus.function !== 'V' || sus.detail !== 'harmonic-minor-dominant', JSON.stringify(sus));
const add6 = analyze('E6', 'Am', { nextChord: 'Am' });
check('E6 (C# — 6-я, не расширение) не становится harmonic-minor-dominant', add6.detail !== 'harmonic-minor-dominant', JSON.stringify(add6));
const add9 = analyze('Eadd9', 'Am', { nextChord: 'Am' });
check('Eadd9 (без септимы) не становится harmonic-minor-dominant', add9.detail !== 'harmonic-minor-dominant', JSON.stringify(add9));
const e7s9 = analyze('E7#9', 'Am', { nextChord: 'Am' });
check('E7#9 (G — не в гармоническом миноре) не становится V', e7s9.detail !== 'harmonic-minor-dominant', JSON.stringify(e7s9));

console.log('=== 4. соглашение 0.598: C11 без терции ===');
const pc = ev(`parseChordForKeyDetection('E11')`);
check('E11: quality null, isDominant7 true', pc.quality === null && pc.isDominant7 === true, JSON.stringify(pc));

console.log(`\nИТОГО: пройдено ${pass}, провалено ${fail}`);
process.exit(fail ? 1 : 0);

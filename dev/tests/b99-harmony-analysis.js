#!/usr/bin/env node
// B-99, stage 1: a pure harmonic-analysis contract. This deliberately makes
// no DOM/CSS assertions: colours, the legend and cell treatment are a later
// UX stage once these conservative classifications have been heard in songs.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM(fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8'), {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(w) {
    w.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    w.cancelAnimationFrame = (id) => clearTimeout(id);
    w.HTMLCanvasElement.prototype.getContext = () => ({
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
  return { currentTime: 0, state: 'running', resume() {} };
};

let failures = 0;
function ok(name, condition, detail = '') {
  console.log(`   ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures += 1;
}
const analyze = (chord, key, options) => w.analyzeChordHarmony(chord, key, options);
const section = (key, chords) => ({
  key,
  squares: [{ events: chords.map((chord) => ({ chord, span: 4 })) }],
});

const cMajor = analyze('Am7', 'C');
ok('обычная ступень C-мажора остаётся diatonic',
  cMajor.group === 'diatonic' && cMajor.detail === 'ionian' && cMajor.degree === 'vi', JSON.stringify(cMajor));

const aMinor = analyze('E', 'Am');
ok('мажорная V в натуральном A-миноре не выдаётся за диатонику',
  aMinor.group === 'modal-borrowed' || aMinor.group === 'chromatic', JSON.stringify(aMinor));

const secondary = analyze('D7', 'C', { nextChord: 'G' });
ok('D7 → G в C получает точную контекстную функцию V/V',
  secondary.group === 'chromatic' && secondary.detail === 'secondary-dominant' && secondary.function === 'V/V' && secondary.confidence === 'contextual', JSON.stringify(secondary));

const bareD = analyze('D', 'C');
ok('D-мажор без разрешения не получает ложную точную функцию',
  bareD.group === 'modal-borrowed' && bareD.detail === null && bareD.confidence === 'ambiguous', JSON.stringify(bareD));

const bFlat = analyze('Bb', 'C');
ok('один bVII в C остаётся честно неоднозначным между mode и mixture',
  bFlat.group === 'modal-borrowed' && bFlat.detail === null && bFlat.confidence === 'ambiguous' &&
  bFlat.candidates.includes('mixolydian') && bFlat.candidates.includes('borrowed-parallel-aeolian'), JSON.stringify(bFlat));

const dorian = w.analyzeSectionHarmony(section('Cm', ['Cm', 'Dm', 'F', 'Gm']));
ok('две характерные ступени дают уверенный C-dorian контекст',
  dorian[1].detail === 'modal-dorian' && dorian[2].detail === 'modal-dorian' &&
  dorian[1].confidence === 'contextual' && dorian[2].confidence === 'contextual', JSON.stringify(dorian));

const weakDorian = w.analyzeSectionHarmony(section('Cm', ['Cm', 'Dm', 'Gm']));
ok('одна характерная ступень не притворяется дорийским ладом',
  weakDorian[1].detail !== 'modal-dorian', JSON.stringify(weakDorian));

const sectionKey = w.analyzeSectionHarmony(section('Dm', ['Dm', 'Gm', 'A']));
ok('анализ секции берёт её модулированную тональность, а не globalKey',
  sectionKey[0].key === 'Dm' && sectionKey[1].group === 'diatonic', JSON.stringify(sectionKey));

const invalid = analyze('not-a-chord', 'C');
ok('некорректный аккорд безопасно остаётся unknown', invalid.group === 'unknown', JSON.stringify(invalid));

console.log(failures ? `\n${failures} FAIL` : '\nALL OK — B-99 harmonic analysis');
process.exit(failures ? 1 : 0);

#!/usr/bin/env node
// B-99: functional harmony must carry a precise modal profile only when
// analysis has enough evidence. The UI consumes `mode`; only confirmed
// mode profiles receive color markers; V/x stays functional/textual only.
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
const modes = (key, chords) => w.analyzeSectionHarmony(section(key, chords)).map((item) => item.mode).join(',');

const unresolvedKeyAnalysis = w.analyzeSectionHarmony(section(null, ['C', 'G', 'Am']));
ok('auto mode with no detected key does not analyze an unkeyed section as fallback C',
  unresolvedKeyAnalysis.length === 3 && unresolvedKeyAnalysis.every((item) =>
    item.key === null && item.group === 'unknown' && item.mode === null && !item.degree),
  JSON.stringify(unresolvedKeyAnalysis));

const cMajor = analyze('Am7', 'C');
ok('обычная ступень C-мажора получает точный ионийский профиль',
  cMajor.group === 'diatonic' && cMajor.mode === 'ionian' && cMajor.degree === 'vi', JSON.stringify(cMajor));

const aMinor = analyze('E', 'Am');
ok('мажорная V в A-миноре — гармонический минор, а не vague borrow',
  aMinor.group === 'minor-variant' && aMinor.mode === 'harmonic-minor' &&
  aMinor.detail === 'harmonic-minor-dominant' && aMinor.function === 'V', JSON.stringify(aMinor));

const fMinorInAMinor = analyze('Fm', 'Am', { nextChord: 'E' });
ok('Fm в Am нейтрален даже перед E: VI A-эолийского — F, а не Fm',
  fMinorInAMinor.group === 'unknown' && fMinorInAMinor.mode === null &&
  fMinorInAMinor.confidence === 'none', JSON.stringify(fMinorInAMinor));

const secondary = analyze('D7', 'C', { nextChord: 'G' });
ok('D7 → G в C остаётся отдельной прикладной V/V, не притворяется ладом',
  secondary.group === 'secondary-function' && secondary.mode === null &&
  secondary.detail === 'secondary-dominant' && secondary.function === 'V/V', JSON.stringify(secondary));

const bareD = analyze('D', 'C');
ok('D-мажор без контекста остаётся нейтральным, без ложного лада или категории',
  bareD.group === 'unknown' && bareD.mode === null && bareD.confidence === 'none' && bareD.candidates.includes('lydian'), JSON.stringify(bareD));

const bFlat = analyze('Bb', 'C');
ok('один bVII в C остаётся нейтральным: кандидаты не становятся пользовательской категорией',
  bFlat.group === 'unknown' && bFlat.mode === null &&
  bFlat.candidates.includes('mixolydian') && bFlat.candidates.includes('borrowed-parallel-aeolian'), JSON.stringify(bFlat));

const dorian = w.analyzeSectionHarmony(section('Cm', ['Cm', 'Dm', 'F', 'Gm']));
ok('достаточный C-dorian контекст раскладывает всю секцию в дорийский профиль',
  dorian.every((item) => item.mode === 'dorian') && dorian.every((item) => item.confidence === 'contextual'), JSON.stringify(dorian));

const weakDorian = w.analyzeSectionHarmony(section('Cm', ['Cm', 'Dm', 'Gm']));
ok('одна характерная ступень не притворяется дорийским ладом и остаётся нейтральной',
  weakDorian[1].group === 'unknown' && weakDorian[1].mode === null && weakDorian[1].confidence === 'none', JSON.stringify(weakDorian));

ok('подтверждённые контексты получают свои конкретные modal profiles',
  modes('C', ['C', 'D', 'F#dim', 'G']) === 'lydian,lydian,lydian,lydian' &&
  modes('C', ['C', 'Dm', 'F', 'Gm', 'Bb']) === 'mixolydian,mixolydian,mixolydian,mixolydian,mixolydian' &&
  modes('Cm', ['Cm', 'Db', 'Gdim', 'Bbm']) === 'phrygian,phrygian,phrygian,phrygian' &&
  modes('C', ['Cdim', 'Db', 'Fm', 'Gb']) === 'locrian,locrian,locrian,locrian' &&
  modes('Am', ['Am', 'Bdim', 'Caug', 'Dm', 'E', 'F', 'G#dim']) ===
    'harmonic-minor,harmonic-minor,harmonic-minor,harmonic-minor,harmonic-minor,harmonic-minor,harmonic-minor',
  JSON.stringify({
    lydian: modes('C', ['C', 'D', 'F#dim', 'G']),
    mixolydian: modes('C', ['C', 'Dm', 'F', 'Gm', 'Bb']),
    phrygian: modes('Cm', ['Cm', 'Db', 'Gdim', 'Bbm']),
    locrian: modes('C', ['Cdim', 'Db', 'Fm', 'Gb']),
    harmonicMinor: modes('Am', ['Am', 'Bdim', 'Caug', 'Dm', 'E', 'F', 'G#dim']),
  }));

const sectionKey = w.analyzeSectionHarmony(section('Dm', ['Dm', 'Gm', 'A']));
ok('анализ секции берёт её модулированную тональность, а не globalKey',
  sectionKey[0].key === 'Dm' && sectionKey[0].mode === 'aeolian' && sectionKey[2].mode === 'harmonic-minor', JSON.stringify(sectionKey));

const minorLine = w.analyzeSectionHarmony(section('Am', ['Am', 'C', 'D', 'E']));
ok('Am–C–D–E раскладывается по эолийскому, мелодическому и гармоническому минорам',
  minorLine.map((item) => item.degree).join(',') === 'i,III,IV,V' &&
  minorLine.map((item) => item.mode).join(',') === 'aeolian,aeolian,melodic-minor,harmonic-minor', JSON.stringify(minorLine));

const residual = analyze('F#m', 'C');
ok('необъяснённый F#-минор в C остаётся нейтральным без отдельной хроматической корзины',
  residual.group === 'unknown' && residual.mode === null && residual.detail === null && residual.confidence === 'none', JSON.stringify(residual));

const invalid = analyze('not-a-chord', 'C');
ok('некорректный аккорд безопасно остаётся unknown', invalid.group === 'unknown' && invalid.mode === null, JSON.stringify(invalid));

console.log(failures ? `\n${failures} FAIL` : '\nALL OK — B-99 modal-profile analysis');
process.exit(failures ? 1 : 0);

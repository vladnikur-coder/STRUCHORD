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

const completeSeventhChecks = {
  c7Mixolydian: w.getHarmonyModeDegree(w.parseChordForKeyDetection('C7'), 'C', 'mixolydian'),
  c7Ionian: w.getHarmonyModeDegree(w.parseChordForKeyDetection('C7'), 'C', 'ionian'),
  d7Lydian: w.getHarmonyModeDegree(w.parseChordForKeyDetection('D7'), 'C', 'lydian'),
  d7Ionian: w.getHarmonyModeDegree(w.parseChordForKeyDetection('D7'), 'C', 'ionian'),
  dMaj7Lydian: w.getHarmonyModeDegree(w.parseChordForKeyDetection('Dmaj7'), 'C', 'lydian'),
  cMaj7Ionian: w.getHarmonyModeDegree(w.parseChordForKeyDetection('Cmaj7'), 'C', 'ionian'),
  bDim7HarmonicMinor: w.getHarmonyModeDegree(w.parseChordForKeyDetection('Bdim7'), 'C', 'harmonic-minor'),
};
const seventhModalLine = w.analyzeSectionHarmony(section('C', ['C7', 'Gm7', 'Bbmaj7']));
const seventhFalsePositiveLine = w.analyzeSectionHarmony(section('C', ['Cmaj7', 'Gm7', 'Bbmaj7']));
ok('септаккорды проверяются по полному составу: добавленная септима подтверждает или исключает лад',
  completeSeventhChecks.c7Mixolydian === 0 && completeSeventhChecks.c7Ionian === -1 &&
  completeSeventhChecks.d7Lydian === 1 && completeSeventhChecks.d7Ionian === -1 &&
  completeSeventhChecks.dMaj7Lydian === -1 && completeSeventhChecks.cMaj7Ionian === 0 &&
  completeSeventhChecks.bDim7HarmonicMinor === 6 &&
  seventhModalLine.every((item) => item.mode === 'mixolydian') &&
  seventhFalsePositiveLine.every((item) => item.mode !== 'mixolydian'),
  JSON.stringify({ completeSeventhChecks, seventhModalLine, seventhFalsePositiveLine }));

const melodicMinorSixth = {
  cAm: w.getHarmonyModeDegree(w.parseChordForKeyDetection('Am'), 'C', 'melodic-minor'),
  cAdim: w.getHarmonyModeDegree(w.parseChordForKeyDetection('Adim'), 'C', 'melodic-minor'),
  aFsm: w.getHarmonyModeDegree(w.parseChordForKeyDetection('F#m'), 'Am', 'melodic-minor'),
  aFsdim: w.getHarmonyModeDegree(w.parseChordForKeyDetection('F#dim'), 'Am', 'melodic-minor'),
};
ok('VI ступень мелодического минора — уменьшённое трезвучие, не минорное',
  melodicMinorSixth.cAm === -1 && melodicMinorSixth.cAdim === 5 &&
  melodicMinorSixth.aFsm === -1 && melodicMinorSixth.aFsdim === 5,
  JSON.stringify(melodicMinorSixth));

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
ok('D-мажор без контекста: слабое заимствование без ложного лада (0.599), кандидаты сохранены',
  bareD.group === 'borrowed-unconfirmed' && bareD.mode === null && bareD.confidence === 'weak' && bareD.candidates.includes('lydian'), JSON.stringify(bareD));

const majorDegreeCases = [
  ['F', 'D', '♭III'],
  ['C', 'D', '♭VII'],
  ['G', 'A', '♭VII'],
  ['D', 'E', '♭VII'],
  ['A', 'B', '♭VII'],
  ['G', 'B', '♭VI'],
  ['F#dim', 'C', '#iv°'],
  ['A#', 'C', '♭VII'],
  ['Bb', 'C', '♭VII'],
];
const rootDegreeMismatches = majorDegreeCases.flatMap(([chord, key, expected]) => {
  const analysis = analyze(chord, key);
  const wheel = w.getBorrowingMenuProfile(chord, key);
  return analysis.degree === expected && wheel?.degree === expected
    ? []
    : [`${chord} in ${key}: analysis=${analysis.degree}, wheel=${wheel?.degree}, expected=${expected}`];
});
const neutralFInD = analyze('F', 'D');
ok('chromatic degrees use key/scale position, match wheel labels; unconfirmed borrowed chord is weak, no mode name (0.599)',
  rootDegreeMismatches.length === 0 && neutralFInD.degree === '♭III' &&
  neutralFInD.group === 'borrowed-unconfirmed' && neutralFInD.mode === null && neutralFInD.confidence === 'weak',
  rootDegreeMismatches.join('; ') || JSON.stringify(neutralFInD));

const bFlat = analyze('Bb', 'C');
ok('один bVII в C: слабая группа с степенью из круга, лад не назван (0.599)',
  bFlat.group === 'borrowed-unconfirmed' && bFlat.mode === null && bFlat.confidence === 'weak' && bFlat.degree === '♭VII' &&
  bFlat.candidates.includes('mixolydian') && bFlat.candidates.includes('aeolian') && !bFlat.candidates.includes('borrowed-parallel-aeolian'), JSON.stringify(bFlat));

const dorian = w.analyzeSectionHarmony(section('Cm', ['Cm', 'Dm', 'F', 'Gm']));
ok('достаточный C-dorian контекст раскладывает всю секцию в дорийский профиль',
  dorian.every((item) => item.mode === 'dorian') && dorian.every((item) => item.confidence === 'contextual'), JSON.stringify(dorian));

const weakDorian = w.analyzeSectionHarmony(section('Cm', ['Cm', 'Dm', 'Gm']));
ok('одна характерная ступень не притворяется дорийским ладом: слабая группа, mode null (0.599)',
  weakDorian[1].group === 'borrowed-unconfirmed' && weakDorian[1].mode === null && weakDorian[1].confidence === 'weak' && weakDorian[1].candidates.includes('dorian'), JSON.stringify(weakDorian));

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

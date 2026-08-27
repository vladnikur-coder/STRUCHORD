// Быстрая оценка любых форм любого аккорда через scoreShape.
// Запуск:
//   node dev/tools/probe-shape-score.js A7sus4 'x,0,2,0,3,0' '5,0,0,0,5,0'
// Без форм печатает текущий топ-10 выдачи.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM(fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8'), {
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

const chord = process.argv[2];
const shapes = process.argv.slice(3);
if (!chord) {
  console.log('надо: node dev/tools/probe-shape-score.js <аккорд> [форма ...]');
  process.exit(1);
}
const parse = (s) => s.split(',').map((v) => (v === 'x' ? 'x' : Number(v)));
const out = w.eval(`(() => {
  const notes = getChordNotes(${JSON.stringify(chord)});
  const root = ${JSON.stringify(chord)}.match(/^[A-G][#b]?/)[0];
  const bass = ${JSON.stringify(chord)}.includes('/') ? ${JSON.stringify(chord)}.split('/')[1] : null;
  const score = (s) => scoreShape(s, notes, root, bass);
  const ban = (s) => (analyzeShapeGrip(s).ban || '');
  const valid = (s) => shapeMatchesChord(s, notes, bass);
  return { root, bass, score, ban, valid };
})()`);

if (shapes.length) {
  for (const s of shapes) {
    const p = parse(s);
    const sc = out.score(p);
    console.log(
      `${s.padEnd(17)} score=${String(sc.toFixed(1)).padStart(7)}  ban=${out.ban(p) || '—'}  valid=${out.valid(p)}`
    );
  }
} else {
  const vars = w.getFingeringVariants(chord, 'C').slice(0, 10);
  for (const v of vars) {
    console.log(`${v.shape.padEnd(17)} ${String(v.method).padEnd(9)} score=${v.score.toFixed(1)}`);
  }
}

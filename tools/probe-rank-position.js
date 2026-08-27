// Зонд позиций конкретных форм в выдаче: для аккорда печатает место
// каждой заданной формы в итоговом списке getFingeringVariants (+score).
// Использование: node dev/tools/probe-rank-position.js <аккорд> <форма> [форма...]
// Форма — 6 значений через запятую, x для глушёных.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM(fs.readFileSync('/home/user/STRUCHORD.html', 'utf8'), {
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
const forms = process.argv.slice(3).map((s) => s.split(','));

w.addEventListener('load', () => {
  const out = w.eval(`(function(){
    const v = getFingeringVariants(${JSON.stringify(chord)}, 'C');
    if (!v) return null;
    const ks = getKeyStyle('C');
    const notes = getChordNotes(${JSON.stringify(chord.split('/')[0])}, ks) || [];
    const root = (notes[0] || '').replace(/\\d+$/, '');
    const bass = ${JSON.stringify(chord)}.includes('/')
      ? ${JSON.stringify(chord)}.split('/')[1] : null;
    const forms = ${JSON.stringify(forms)};
    return forms.map((f) => {
      const key = f.join(',');
      const idx = v.shapes.findIndex((s) => s.join(',') === key);
      let valid = null, score = null;
      try {
        valid = !!shapeMatchesChord(f.map((x) => (x === 'x' ? 'x' : +x)), notes, bass);
      } catch (e) { valid = 'ERR:' + e.message; }
      try {
        score = Math.round(scoreShape(f.map((x) => (x === 'x' ? 'x' : +x)), notes, root, bass) * 10) / 10;
      } catch (e) { score = 'ERR:' + e.message; }
      return { shape: key, pos: idx >= 0 ? idx + 1 : null, method: idx >= 0 ? v.methods[idx] : null, valid, score,
        total: v.shapes.length };
    });
  })()`);
  console.log(JSON.stringify({ chord, results: out }, null, 1));
});

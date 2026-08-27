// Разбивка оценки scoreShape на вклад каждого правила FINGERING_WEIGHTS.
// Метод: вклад ключа K = score(полные веса) − score(веса, где K = 0).
// Аддитивность штрафов в scoreShape делает разбивку точной.
// Остаток (не покрытый весами) печатается как BASE — это захардкоженные
// блоки (высокая позиция без баррэ, большой палец, таблица BARRE_FRET_EXTRA).
//
// Запуск: node dev/tools/probe-score-breakdown.js <аккорд> <форма> [форма...]
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
const forms = process.argv.slice(3).map((s) =>
  s.split(',').map((x) => (x === 'x' ? 'x' : +x))
);

w.addEventListener('load', () => {
  const out = w.eval(`(function(){
    const ks = getKeyStyle('C');
    const notes = getChordNotes(${JSON.stringify(chord.split('/')[0])}, ks) || [];
    const root = (notes[0] || '').replace(/\\d+$/, '');
    const bass = ${JSON.stringify(chord)}.includes('/')
      ? ${JSON.stringify(chord)}.split('/')[1] : null;
    const forms = ${JSON.stringify(forms)};
    const r10 = (x) => Math.round(x * 10) / 10;
    return forms.map((f) => {
      const backup = JSON.parse(JSON.stringify(FINGERING_WEIGHTS));
      const full = scoreShape(f, notes, root, bass);
      const parts = {};
      const keys = Object.keys(backup).filter(
        (k) => typeof backup[k] === 'number');
      for (const k of keys) {
        FINGERING_WEIGHTS[k] = 0;
        const d = full - scoreShape(f, notes, root, bass);
        if (Math.abs(d) > 0.01) parts[k] = r10(d);
        FINGERING_WEIGHTS[k] = backup[k];
      }
      // Массив BARRE_FRET_EXTRA целиком
      const arr = FINGERING_WEIGHTS.BARRE_FRET_EXTRA;
      FINGERING_WEIGHTS.BARRE_FRET_EXTRA = arr.map(() => 0);
      const dArr = full - scoreShape(f, notes, root, bass);
      if (Math.abs(dArr) > 0.01) parts.BARRE_FRET_EXTRA = r10(dArr);
      FINGERING_WEIGHTS.BARRE_FRET_EXTRA = backup.BARRE_FRET_EXTRA.slice();
      // База при полностью нулевых весах
      for (const k of Object.keys(FINGERING_WEIGHTS)) {
        FINGERING_WEIGHTS[k] = Array.isArray(FINGERING_WEIGHTS[k])
          ? FINGERING_WEIGHTS[k].map(() => 0) : 0;
      }
      const base = scoreShape(f, notes, root, bass);
      Object.assign(FINGERING_WEIGHTS, backup);
      FINGERING_WEIGHTS.BARRE_FRET_EXTRA = backup.BARRE_FRET_EXTRA.slice();
      let accounted = base;
      for (const v of Object.values(parts)) accounted += v;
      return { shape: f.join(','), score: r10(full), base: r10(base),
               parts, unexplained: r10(full - accounted) };
    });
  })()`);
  console.log(JSON.stringify({ chord, results: out }, null, 1));
});

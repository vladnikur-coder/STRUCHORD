// Зонд выдачи аппликатур: для каждого аккорда печатает JSON со списком
// форм в порядке показа, методом (user/open/caged/modified/fallback) и
// оценкой scoreShape. Используется для снимков «до/после» переработки
// скоринга удобства: снимок кладётся в dev/bench/results/, сравнение
// сводится таблицей в README.
//
// Запуск: node dev/tools/probe-fingering-rank.js [аккорд,аккорд,...]
// Без аргументов — полный калибровочный банк.
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

// Банк: все аккорды из калибровочных пар + золотая таблица unit-scoring.
const BANK = [
  'Aadd9', 'D7', 'G', 'C9', 'Bm', 'F', 'F#m7', 'Am7', 'Bb', 'Cmaj7',
  'Dm9', 'Gadd9', 'Esus4', 'Dm', 'C', 'Bm7', 'Dadd9', 'A7', 'Cadd9',
  'Am', 'Em', 'E', 'D', 'A', 'E7', 'A7sus4', 'G7', 'Fm', 'Cm', 'B',
  'C#m', 'G/B', 'D/F#', 'C/G',
];
const chords = process.argv[2] ? process.argv[2].split(',') : BANK;

w.addEventListener('load', () => {
  const out = {};
  for (const chord of chords) {
    const res = w.eval(`(function(){
      const v = getFingeringVariants(${JSON.stringify(chord)}, 'C');
      if (!v) return null;
      const ks = getKeyStyle('C');
      const notes = getChordNotes(${JSON.stringify(chord.split('/')[0])}, ks) || [];
      const root = (notes[0] || '').replace(/\\d+$/, '');
      const bass = ${JSON.stringify(chord)}.includes('/')
        ? ${JSON.stringify(chord)}.split('/')[1] : null;
      return v.shapes.slice(0, 12).map((s, i) => ({
        shape: s.join(','),
        method: v.methods[i],
        score: Math.round(scoreShape(s, notes, root, bass) * 10) / 10,
      }));
    })()`);
    out[chord] = res;
  }
  console.log(JSON.stringify(out, null, 1));
});

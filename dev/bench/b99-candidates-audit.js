#!/usr/bin/env node
// Аудит «кандидатов»: что анализатор знает о каждом секторе круга вне
// тональности — raw-материал для палитры заимствований для сонграйтера.
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

function audit(key, chords) {
  console.log(`\n===== ${key} =====`);
  for (const chord of chords) {
    const r = w.analyzeChordHarmony(chord, key);
    const line = [
      `${chord.padEnd(6)}`,
      `group=${r.group}`,
      r.mode ? `mode=${r.mode}` : 'mode=—',
      r.degree ? `degree=${r.degree}` : 'degree=—',
      `candidates=[${(r.candidates || []).join(', ')}]`,
    ].join('  ');
    console.log(line);
  }
}

// Am: 12 мажорных/минорных трезвучий хроматики + пара септаккордов-кандидатов
audit('Am', ['Am', 'Bbm', 'Bm', 'C', 'C#m', 'D', 'Dm', 'Eb', 'E', 'F', 'Fm', 'F#m', 'G', 'G#m',
             'E7', 'B7', 'C7', 'D7', 'F7', 'G7', 'G#dim', 'Bdim', 'Caug', 'A7']);
audit('C', ['C', 'Db', 'Dm', 'D', 'Ebm', 'Em', 'F', 'Fm', 'F#m', 'Gm', 'G', 'Ab', 'A', 'Bb', 'B',
            'D7', 'A7', 'E7', 'Bb', 'Ab']);

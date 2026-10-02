#!/usr/bin/env node
// Аудит круга: сколько секторов ладовой карты получают цвет при строгой
// проверке 0.545 в разных тональностях и режимах круга.
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

const keys = ['C', 'G', 'Am', 'Em', 'F#m', 'C#m', 'Eb', 'Bb'];
const modes = ['triads', 'sevenths'];
for (const key of keys) {
  for (const mode of modes) {
    w.eval(`
      globalKey = ${JSON.stringify(key)};
      keyMode = 'manual';
      activeSectionKey = null;
      activeChordInput = null;
      wheelMode = ${JSON.stringify(mode)};
      drawWheel();
    `);
    const sectors = w.document.querySelectorAll('#circleSvg .wheel-sector');
    let colored = 0, neutral = 0;
    const groups = {};
    sectors.forEach((s) => {
      const g = s.dataset.harmonyGroup;
      if (!g) { neutral++; return; }
      colored++;
      const p = s.dataset.harmonyProfile || g;
      groups[p] = (groups[p] || 0) + 1;
    });
    console.log(`${key.padEnd(4)} ${mode.padEnd(9)} секторов ${String(sectors.length).padEnd(3)} с цветом ${String(colored).padEnd(3)} нейтральных ${String(neutral).padEnd(3)} :: ${Object.entries(groups).map(([p, n]) => `${p}×${n}`).join(', ')}`);
  }
}

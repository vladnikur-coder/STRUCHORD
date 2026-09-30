#!/usr/bin/env node
// Разовый аудит B-99: сколько ячеек в реальных песнях пользователя реально
// получают подтверждённый профиль (цвет), а сколько остаются нейтральными.
const fs = require('fs');
const path = require('path');
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

const dir = __dirname + '/../../uploads';
const files = fs.readdirSync(dir).filter((f) => /struchord.*\.json$/i.test(f));

const MODE_RU = {
  ionian: 'ионийский', aeolian: 'эолийский', 'harmonic-minor': 'гарм.минор',
  'melodic-minor': 'мел.минор', dorian: 'дорийский', phrygian: 'фригийский',
  lydian: 'лидийский', mixolydian: 'миксолидийский', locrian: 'локрийский',
  'secondary-function': 'V/x', unknown: 'нейтральный',
};

let grandCells = 0, grandColored = 0;
const grandModes = {};

for (const file of files) {
  const song = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const globalKey = song.globalKey || 'C';
  let cells = 0, colored = 0, neutral = 0;
  const modes = {};
  const sectionLines = [];
  for (const sec of song.sections || []) {
    const effKey = sec.key || globalKey;
    // Разворачиваем повторы квадратов не нужно: анализируем уникальные последовательности
    const chords = [];
    for (const sq of sec.squares || []) for (const ev of sq.events || []) chords.push(ev.chord);
    if (!chords.length) continue;
    const fakeSection = { key: effKey, squares: [{ events: chords.map((c) => ({ chord: c, span: 4 })) }] };
    let analysis;
    try {
      analysis = w.analyzeSectionHarmony(fakeSection);
    } catch (e) {
      sectionLines.push(`  [${sec.customName || sec.type || sec.name || '?'}] ошибка анализа: ${e.message}`);
      continue;
    }
    let sColored = 0, sNeutral = 0;
    const sModes = {};
    analysis.forEach((item, i) => {
      const label = MODE_RU[item.mode] || item.mode || 'нейтральный';
      modes[label] = (modes[label] || 0) + 1;
      sModes[label] = (sModes[label] || 0) + 1;
      if (item.mode) { colored++; sColored++; } else { neutral++; sNeutral++; }
      cells++;
    });
    const uniq = Object.keys(sModes).length;
    sectionLines.push(`  ${String(sec.customName || sec.type || sec.name || '?').padEnd(18)} ${String(effKey).padEnd(3)} цветов:${sColored} нейтр:${sNeutral} профилей:${uniq} [${Object.entries(sModes).map(([m, n]) => `${m}×${n}`).join(', ')}]`);
  }
  const pct = cells ? Math.round((colored / cells) * 100) : 0;
  console.log(`\n${file}`);
  sectionLines.forEach((l) => console.log(l));
  console.log(`  ИТОГО: ячеек ${cells}, с цветом ${colored} (${pct}%), нейтральных ${neutral} (${100 - pct}%)`);
  grandCells += cells; grandColored += colored;
  for (const [m, n] of Object.entries(modes)) grandModes[m] = (grandModes[m] || 0) + n;
}

console.log('\n===== ПО ВСЕМ ПЕСНЯМ =====');
console.log(`ячеек ${grandCells}, с цветом ${grandColored} (${grandCells ? Math.round(grandColored / grandCells * 100) : 0}%), нейтральных ${grandCells - grandColored}`);
console.log('распределение профилей:', Object.entries(grandModes).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m}×${n}`).join(', '));

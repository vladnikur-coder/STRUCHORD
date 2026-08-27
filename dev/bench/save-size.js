// Замер размера сейва (волна-4): один и тот же сценарий песни
// сериализуется через публичный saveCurrentSong, читаем localStorage.
// Запуск: node dev/bench/save-size.js [путь-к-файлу]
// Печатает байты JSON и формат (есть rhythmPool или кэш на ячейках).
const fs = require('fs');
const { JSDOM } = require('jsdom');
const file = process.argv[2] || '/home/user/STRUCHORD.html';
const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {
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
const evl = (code) => w.eval(`(()=>{ ${code} })()`);
evl('requestRender = function(){}; showToast = function(){}; window.confirm = function(){return true}; return 0');

// Песня-замер: 3 секции по 2 квадрата; в каждом квадрате две связанные
// пары (деление) на 8 долях + одиночный рисунок — типовой «куплетный» ритм.
evl(`
  sections = [];
  globalTimeSig = '4/4';
  const strum = (sub, text) => ({ mode: 'strum', subdivision: sub, steps: text.split('') });
  const bodies = ['D_DU_UDU', 'D___D_U___U_D_U_', 'DU_DU_D_'];
  const subs = [2, 4, 2];
  for (let s = 0; s < 3; s++) {
    addSection('Verse');
    const sec = sections[s];
    addSquare(sec.id);
    sec.squares.forEach((sq) => {
      sq.events = [
        { chord: 'C', span: 4, timeSig: null, strumPattern: strum(subs[s], bodies[s]) },
        { chord: 'G', span: 4, timeSig: null, strumPattern: strum(subs[s], bodies[s]) },
        { chord: 'Am', span: 4, timeSig: null, strumPattern: strum(2, 'DDDDDDDD') },
        { chord: 'F', span: 4, timeSig: null },
      ];
    });
  }
  // Разрезы (связки): в каждом квадрате первую ячейку делим на 2+2.
  sections.forEach((sec) => sec.squares.forEach((sq) => addChordAfter(sec.id, sq.id, 0)));
  localStorage.removeItem('struchord_songs');
  window.saveCurrentSong();
  return 0`);

const raw = evl(`return localStorage.getItem('struchord_songs')`);
const song = JSON.parse(raw)[0];
const bytes = Buffer.byteLength(raw, 'utf8');
const evPatterns = evl(`return sections.flatMap((s) => s.squares).flatMap((q) => q.events).filter((e) => e.strumPattern).length`);
const rolls = song.rhythmPool ? Object.keys(song.rhythmPool.pool).length : 0;
console.log(`${file.split('/').pop()}`);
console.log(`  JSON: ${bytes} байт; у событий файла рисунков: ${song.sections.flatMap((s) => s.squares).flatMap((q) => q.events).filter((e) => e.strumPattern).length}; rhythmPool: ${song.rhythmPool ? `да (рулонов ${rolls}, ссылок ${song.rhythmPool.refs.length})` : 'нет'}; schemaVersion: ${song.schemaVersion}; ячеек с рисунком в рантайме: ${evPatterns}`);

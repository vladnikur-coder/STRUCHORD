// B-29 (2026-08-29): глобальный «Сброс» обязан чистить кастомный ритм.
// Репро: до фикса clearAll() очищал sections и nextId, но оставлял
// songRhythmRolls. Затем addSection() снова выдавал id секции 1 и квадрата
// 2, и старый ref "1:2:0" простреливал в новую пустую песню.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const file = process.argv[2] || __dirname + '/../../STRUCHORD.html';
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
w.confirm = () => true;

let bad = 0;
const ok = (name, cond, extra) => {
  console.log(`   ${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && extra !== undefined ? ' — ' + extra : ''}`);
  if (!cond) bad++;
};
const evl = (code) => w.eval(`(()=>{ ${code} })()`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

w.addEventListener('load', async () => {
  console.log('=== B-29: clearAll чистит пул ритмов ===');
  evl(`
    const strum = (sub, s) => ({ mode: 'strum', subdivision: sub, steps: s.split('') });
    sections = [{ id: 1, type: 'Verse', customName: null, key: null, timeSig: null, bpm: null,
      repeat: 1, strumPattern: null, squares: [
        { id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
          { chord: 'C', span: 4, timeSig: null, strumPattern: strum(2, 'DUDUDUDU') },
        ]}
      ]
    }];
    songRhythmRolls = null;
    ensureSquareRhythmRefs(sections[0], sections[0].squares[0]);
    render();
    return 0`);
  ok('до сброса есть ref кастомного ритма 1:2:0',
    evl(`return songRhythmRolls && songRhythmRolls.refs.has('1:2:0')`));
  ok('до сброса ячейка помечена своим ритмом',
    !!w.document.querySelector('.chord-btn-strum--own'));

  evl(`clearAll(); return 0`);
  await sleep(40);
  ok('после clearAll sections пустой', evl('return sections.length') === 0);
  ok('после clearAll пул существует, но refs пустые',
    evl(`return !!songRhythmRolls && songRhythmRolls.refs.size === 0 && Object.keys(songRhythmRolls.pool).length === 0 && songRhythmRolls.sectionRolls.size === 0`),
    evl(`return songRhythmRolls && JSON.stringify({ refs: songRhythmRolls.refs.size, pool: Object.keys(songRhythmRolls.pool).length, sections: songRhythmRolls.sectionRolls.size })`));

  evl(`addSection('Verse'); return 0`);
  await sleep(40);
  ok('после addSection id снова 1/2 — репро переиспользования id',
    evl(`return sections[0].id === 1 && sections[0].squares[0].id === 2`));
  ok('старый ref не прострелил в новую песню',
    evl(`return !songRhythmRolls.refs.has('1:2:0')`));
  ok('новая ячейка не получила чужую плашку кастомного ритма',
    !w.document.querySelector('.chord-btn-strum--own')
      && !w.document.querySelector('.event-strum-preview.has-pattern'));

  console.log(bad ? `\nFAIL: ${bad}` : '\nвсе проверки ok');
  process.exit(bad ? 1 : 0);
});

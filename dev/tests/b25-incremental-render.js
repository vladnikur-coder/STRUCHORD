// B-25 (2026-08-29): первые инкрементальные обновления редактора.
// Цель среза: операции, которые НЕ меняют число DOM-ячеек, должны
// синхронизировать текущий квадрат локально, а не запускать полный render().
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

let bad = 0;
const ok = (name, cond, extra) => {
  console.log(`   ${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && extra !== undefined ? ' — ' + extra : ''}`);
  if (!cond) bad++;
};
const evl = (code) => w.eval(`(()=>{ ${code} })()`);

function resetRenderCounter() {
  evl(`
    if (!window.__b25OldRequestRender) window.__b25OldRequestRender = requestRender;
    window.__b25RequestRenderCount = 0;
    window.__b25IncrementalSquareSyncCount = 0;
    requestRender = function () {
      window.__b25RequestRenderCount++;
      return window.__b25OldRequestRender.apply(this, arguments);
    };
    return 0`);
}
function restoreRenderCounter() {
  evl(`
    if (window.__b25OldRequestRender) requestRender = window.__b25OldRequestRender;
    delete window.__b25OldRequestRender;
    delete window.__b25RequestRenderCount;
    delete window.__b25IncrementalSquareSyncCount;
    return 0`);
}

function scene() {
  evl(`
    sections = [{ id: 1, type: 'Verse', customName: null, key: 'C', timeSig: null, bpm: 0,
      repeat: 1, strumPattern: null, squares: [
        { id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
          { chord: 'C', span: 2, timeSig: null, strumPattern: null },
          { chord: 'G', span: 2, timeSig: null, strumPattern: null },
        ]},
        { id: 3, repeat: 1, customBeats: null, strumPattern: null, events: [
          { chord: 'Am', span: 8, timeSig: null, strumPattern: null },
        ]},
      ]
    }];
    if (songRhythmRolls) {
      for (const key of [...songRhythmRolls.refs.keys()]) {
        if (key.startsWith('1:2:') || key.startsWith('1:3:')) songRhythmRolls.refs.delete(key);
      }
      songRhythmRolls.sectionRolls.delete(1);
    }
    render();
    return 0`);
}

w.addEventListener('load', async () => {
  console.log('=== B-25.1 direct span: локальная синхронизация квадрата ===');
  scene();
  resetRenderCounter();
  evl(`changeChordSpanDirect(1, 2, 0, 4); return 0`);
  ok('changeChordSpanDirect не вызывает полный requestRender',
    evl('return window.__b25RequestRenderCount') === 0,
    evl('return window.__b25RequestRenderCount'));
  ok('сработала инкрементальная синхронизация квадрата',
    evl('return window.__b25IncrementalSquareSyncCount') >= 1,
    evl('return window.__b25IncrementalSquareSyncCount'));
  ok('модель обновлена: span первой ячейки = 4',
    evl('return sections[0].squares[0].events[0].span') === 4,
    evl('return sections[0].squares[0].events[0].span'));
  const grid = evl(`return document.querySelector('.square[data-square="2"] .square-inner').style.gridTemplateColumns`);
  ok('DOM-сетка квадрата обновлена под 6 колонок', /repeat\(6,/.test(grid), grid);
  const width = evl(`return document.querySelector('.square[data-square="2"] .square-inner').style.width`);
  ok('ширина квадрата пересчитана относительно секции', width === '37.5%', width);
  const badge = evl(`return document.querySelector('.square[data-square="2"] .square-beats-badge').textContent`);
  ok('бейдж тактов обновлён локально', badge === '1.5 такта', badge);
  const spanTitle = evl(`return document.querySelector('.chord-wrapper[data-ei="0"] .chord-span-btn').title`);
  ok('кнопка размера получила новый title', spanTitle.includes('долей: 4'), spanTitle);
  restoreRenderCounter();

  console.log('=== B-25.1 event timeSig: без полного render ===');
  scene();
  resetRenderCounter();
  evl(`setEventTimeSig(1, 2, 0, '2/4'); return 0`);
  ok('setEventTimeSig не вызывает полный requestRender',
    evl('return window.__b25RequestRenderCount') === 0,
    evl('return window.__b25RequestRenderCount'));
  ok('setEventTimeSig синхронизировал квадрат локально',
    evl('return window.__b25IncrementalSquareSyncCount') >= 1,
    evl('return window.__b25IncrementalSquareSyncCount'));
  ok('модель хранит собственный размер ячейки',
    evl(`return sections[0].squares[0].events[0].timeSig`) === '2/4',
    evl(`return sections[0].squares[0].events[0].timeSig`));
  const btnText = evl(`return document.querySelector('.chord-wrapper[data-ei="0"] .chord-span-btn').textContent`);
  ok('DOM-кнопка показывает новый размер', btnText === '2/4', btnText);
  restoreRenderCounter();

  console.log(bad ? `\nFAIL: ${bad}` : '\nвсе проверки ok');
  process.exit(bad ? 1 : 0);
});

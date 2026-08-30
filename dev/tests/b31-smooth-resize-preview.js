// B-31 (2026-08-30): smooth resize preview / FLIP commit.
// Во время drag обычной границы ячеек и правого края квадрата основной
// DOM/модель не пересобираются: работает лёгкий guide overlay. Commit —
// один раз на pointerup.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const firePointerDown = (el, x) => {
  const e = new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x });
  if (typeof el.onpointerdown === 'function') el.onpointerdown(e);
  else el.dispatchEvent(e);
};
const firePointerMove = (x) =>
  w.document.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: x }));
const firePointerUp = (x) =>
  w.document.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: x }));

function scene() {
  evl(`
    globalTimeSig = '4/4';
    DOM.globalTimeSig.value = '4/4';
    sections = [{ id: 1, type: 'Verse', customName: null, key: null, timeSig: null, bpm: 0,
      repeat: 1, strumPattern: null, squares: [
        { id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
          { chord: 'C', span: 2, timeSig: null, strumPattern: null },
          { chord: 'G', span: 2, timeSig: null, strumPattern: null },
        ]},
      ]
    }];
    if (songRhythmRolls) {
      for (const key of [...songRhythmRolls.refs.keys()]) if (key.startsWith('1:2:')) songRhythmRolls.refs.delete(key);
      songRhythmRolls.sectionRolls.delete(1);
    }
    render();
    window.__b31ResizePreviewCount = 0;
    window.__b31ResizeCommitCount = 0;
    window.__b31SquareResizePreviewCount = 0;
    window.__b31RequestRenderCount = 0;
    if (!window.__b31OldRequestRender) window.__b31OldRequestRender = requestRender;
    requestRender = function () {
      window.__b31RequestRenderCount++;
      return window.__b31OldRequestRender.apply(this, arguments);
    };
    return 0`);
}
function restoreRequestRender() {
  evl(`
    if (window.__b31OldRequestRender) requestRender = window.__b31OldRequestRender;
    delete window.__b31OldRequestRender;
    return 0`);
}

w.addEventListener('load', async () => {
  console.log('=== B-31.1 cell boundary: drag preview без model/DOM commit ===');
  scene();
  await sleep(40);
  evl(`
    const bi = document.querySelector('.square-inner');
    bi.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 76, right: 400, bottom: 76, x: 0, y: 0 });
    document.querySelectorAll('.chord-wrapper').forEach((el, i) => {
      el.getBoundingClientRect = () => ({ left: i * 200, top: 0, width: 200, height: 76, right: i * 200 + 200, bottom: 76, x: i * 200, y: 0 });
    });
    return 0`);
  const handle = w.document.querySelector('.resize-handle');
  firePointerDown(handle, 100);
  firePointerMove(200); // +1 доля: 2|2 -> 3|1
  await sleep(35);
  ok('на pointermove модель ещё не изменилась',
    evl('return sections[0].squares[0].events.map((e) => e.span).join(",")') === '2,2',
    evl('return sections[0].squares[0].events.map((e) => e.span).join(",")'));
  ok('на pointermove появился только preview-guide',
    !!w.document.querySelector('.square-inner > .resize-preview-layer .resize-preview-guide'),
    w.document.querySelector('.square-inner') && w.document.querySelector('.square-inner').innerHTML);
  ok('тяжёлый commit на pointermove не выполнялся',
    evl('return window.__b31ResizeCommitCount') === 0,
    evl('return window.__b31ResizeCommitCount'));
  firePointerUp(200);
  await sleep(60);
  ok('на pointerup модель коммитится один раз',
    evl('return sections[0].squares[0].events.map((e) => e.span).join(",")') === '3,1'
      && evl('return window.__b31ResizeCommitCount') === 1,
    evl('return sections[0].squares[0].events.map((e) => e.span).join(",") + " commits=" + window.__b31ResizeCommitCount'));
  ok('после commit preview-guide убран', !w.document.querySelector('.resize-preview-layer'));
  ok('полный requestRender не понадобился для cell resize',
    evl('return window.__b31RequestRenderCount') === 0,
    evl('return window.__b31RequestRenderCount'));
  restoreRequestRender();

  console.log('=== B-31.2 square right edge: drag preview без innerHTML на move ===');
  scene();
  await sleep(40);
  evl(`
    const sq = sections[0].squares[0];
    sq.events = [
      { chord: 'C', span: 4, timeSig: null, strumPattern: null },
      { chord: 'G', span: 4, timeSig: null, strumPattern: null },
      { chord: 'Am', span: 4, timeSig: null, strumPattern: null },
      { chord: 'F', span: 4, timeSig: null, strumPattern: null },
    ];
    sq.customBeats = null;
    render();
    window.__b31SquareResizePreviewCount = 0;
    window.__b31RequestRenderCount = 0;
    if (!window.__b31OldRequestRender) window.__b31OldRequestRender = requestRender;
    requestRender = function () { window.__b31RequestRenderCount++; return window.__b31OldRequestRender.apply(this, arguments); };
    const bi = document.querySelector('.square-inner');
    Object.defineProperty(bi, 'offsetWidth', { value: 400, configurable: true });
    bi.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 76, right: 400, bottom: 76, x: 0, y: 0 });
    return 0`);
  const sqHandle = w.document.querySelector('.square-resize-handle');
  const beforeWrappers = evl(`return document.querySelectorAll('.square-inner .chord-wrapper').length`);
  firePointerDown(sqHandle, 400);
  firePointerMove(300); // 16 долей -> 12 долей
  await sleep(35);
  ok('на move правого края модель ещё не изменилась',
    evl('return getSquareBeats(sections[0].squares[0], "4/4")') === 16,
    evl('return getSquareBeats(sections[0].squares[0], "4/4")'));
  ok('на move правого края ячейки не добавляются/удаляются',
    evl(`return document.querySelectorAll('.square-inner .chord-wrapper').length`) === beforeWrappers,
    evl(`return document.querySelectorAll('.square-inner .chord-wrapper').length`));
  ok('на move правого края есть лёгкий guide',
    !!w.document.querySelector('.square > .resize-preview-layer .resize-preview-guide.is-square-edge'));
  firePointerUp(300);
  await sleep(60);
  ok('на pointerup правого края модель меняется один раз',
    evl('return getSquareBeats(sections[0].squares[0], "4/4")') === 12,
    evl('return getSquareBeats(sections[0].squares[0], "4/4")'));
  ok('после pointerup правого края DOM локально пересобран под 3 ячейки',
    evl(`return document.querySelectorAll('.square[data-square="2"] .chord-wrapper').length`) === 3,
    evl(`return document.querySelectorAll('.square[data-square="2"] .chord-wrapper').length`));
  ok('полный requestRender не понадобился для square resize',
    evl('return window.__b31RequestRenderCount') === 0,
    evl('return window.__b31RequestRenderCount'));
  restoreRequestRender();

  console.log(bad ? `\nFAIL: ${bad}` : '\nвсе проверки ok');
  process.exit(bad ? 1 : 0);
});

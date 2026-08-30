// B-31 (2026-08-30): smooth snapped resize границы между ячейками.
//
// Уточнённая постановка после визуальной отмены guide-only прототипа:
// существующий resize остаётся дискретным и привязанным к шагам сетки,
// но переходы между snapped-состояниями не должны быть резкими скачками.
// Pointermove не мутирует модель, не делает reslice/settle и не
// пересобирает основной square-inner; модель фиксируется один раз на pointerup.
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
    squareZoom = 1.5; // шаг ресайза — восьмые
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
    window.__b31ResizePreviewFrameCount = 0;
    window.__b31ResizeModelCommitCount = 0;
    window.__b31RequestRenderCount = 0;
    if (!window.__b31OldRequestRender) window.__b31OldRequestRender = requestRender;
    requestRender = function () {
      window.__b31RequestRenderCount++;
      return window.__b31OldRequestRender.apply(this, arguments);
    };
    const bi = document.querySelector('.square-inner');
    bi.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 76, right: 400, bottom: 76, x: 0, y: 0 });
    document.querySelectorAll('.chord-wrapper').forEach((el, i) => {
      el.getBoundingClientRect = () => ({ left: i * 200, top: 0, width: 200, height: 76, right: i * 200 + 200, bottom: 76, x: i * 200, y: 0 });
    });
    return 0`);
}
function restoreRequestRender() {
  evl(`
    if (window.__b31OldRequestRender) requestRender = window.__b31OldRequestRender;
    delete window.__b31OldRequestRender;
    squareZoom = 1;
    return 0`);
}

w.addEventListener('load', async () => {
  console.log('=== B-31.1 live boundary resize: pointermove меняет только геометрию ===');
  scene();
  await sleep(30);
  const handle = w.document.querySelector('.square[data-square="2"] .chord-wrapper[data-ei="0"] .resize-handle');
  ok('ручка границы есть', !!handle);
  const firstNodeStable = evl(`return document.querySelector('.chord-wrapper[data-ei="0"]')`);
  firePointerDown(handle, 100);
  firePointerMove(150);
  firePointerMove(170); // схлопывается в тот же rAF: 2|2 -> preview 3.5|0.5
  ok('до rAF модель ещё не изменилась',
    evl('return sections[0].squares[0].events.map((e) => e.span).join(",")') === '2,2',
    evl('return sections[0].squares[0].events.map((e) => e.span).join(",")'));
  await sleep(35);
  const liveTemplate = evl(`return document.querySelector('.square-inner').style.gridTemplateColumns`);
  ok('на pointermove включается live-grid из fr-колонок snapped-ячеек',
    liveTemplate.includes('3.5fr') && liveTemplate.includes('0.5fr') && !liveTemplate.startsWith('repeat('),
    liveTemplate);
  ok('snap-переходы анимируются grid-template-columns',
    evl(`return document.querySelector('.square-inner').classList.contains('is-snap-resize-animated')`),
    evl(`return document.querySelector('.square-inner').className`));
  ok('счёт вынесен в frozen overlay, чтобы 1/та/и/та не резинились',
    evl(`return !!document.querySelector('.resize-metric-overlay .chord-count')`),
    'no metric overlay');
  ok('засечки тоже вынесены в frozen overlay и не едут вместе с ячейкой',
    evl(`return !!document.querySelector('.resize-metric-overlay .chord-ticks') && !!document.querySelector('.resize-metric-overlay .chord-ticks-step')`),
    'no frozen ticks');
  ok('edge-отступ счёта перенесён на новую snapped-границу до отпускания',
    evl(`return Array.from(document.querySelectorAll('.resize-count-cell .chord-count.is-edge')).map(n => n.textContent).join('|')`) === '1|и',
    evl(`return Array.from(document.querySelectorAll('.resize-count-cell .chord-count.is-edge')).map(n => n.textContent).join('|')`));
  ok('ячейки живо переставлены без пересоздания wrapper-узлов',
    evl(`return document.querySelector('.chord-wrapper[data-ei="0"]')`) === firstNodeStable,
    'wrapper node changed');
  ok('модель всё ещё не мутировала на pointermove',
    evl('return sections[0].squares[0].events.map((e) => e.span).join(",")') === '2,2',
    evl('return sections[0].squares[0].events.map((e) => e.span).join(",")'));
  ok('коммит модели на pointermove не выполнялся',
    evl('return window.__b31ResizeModelCommitCount') === 0,
    evl('return window.__b31ResizeModelCommitCount'));
  ok('полный requestRender на pointermove не вызывался',
    evl('return window.__b31RequestRenderCount') === 0,
    evl('return window.__b31RequestRenderCount'));

  console.log('=== B-31.2 pointerup: один commit и локальная синхронизация ===');
  firePointerUp(170);
  await sleep(50);
  ok('на pointerup модель коммитится один раз',
    evl('return sections[0].squares[0].events.map((e) => e.span).join(",")') === '3.5,0.5'
      && evl('return window.__b31ResizeModelCommitCount') === 1,
    evl('return sections[0].squares[0].events.map((e) => e.span).join(",") + " commits=" + window.__b31ResizeModelCommitCount'));
  ok('после локальной синхронизации DOM соответствует финальной дробной сетке',
    /^repeat\(8,/.test(evl(`return document.querySelector('.square-inner').style.gridTemplateColumns`)),
    evl(`return document.querySelector('.square-inner').style.gridTemplateColumns`));
  ok('после commit frozen-счёт снят вместе с live-классами',
    !evl(`return !!document.querySelector('.resize-metric-overlay')`)
      && !evl(`return document.querySelector('.square-inner').classList.contains('is-live-resizing')`),
    evl(`return document.querySelector('.square-inner').className`));
  ok('полный requestRender не понадобился для commit',
    evl('return window.__b31RequestRenderCount') === 0,
    evl('return window.__b31RequestRenderCount'));
  restoreRequestRender();

  console.log('=== B-31.3 no-op: клик по ручке не трогает модель ===');
  scene();
  await sleep(30);
  const noOpHandle = w.document.querySelector('.square[data-square="2"] .resize-handle');
  firePointerDown(noOpHandle, 100);
  firePointerUp(100);
  await sleep(50);
  ok('no-op не делает commit модели',
    evl('return window.__b31ResizeModelCommitCount') === 0
      && evl('return sections[0].squares[0].events.map((e) => e.span).join(",")') === '2,2',
    evl('return sections[0].squares[0].events.map((e) => e.span).join(",") + " commits=" + window.__b31ResizeModelCommitCount'));
  ok('no-op возвращает обычную repeat-сетку',
    /^repeat\(4,/.test(evl(`return document.querySelector('.square-inner').style.gridTemplateColumns`)),
    evl(`return document.querySelector('.square-inner').style.gridTemplateColumns`));
  ok('no-op не вызывает полный requestRender',
    evl('return window.__b31RequestRenderCount') === 0,
    evl('return window.__b31RequestRenderCount'));
  restoreRequestRender();

  console.log(bad ? `\nFAIL: ${bad}` : '\nвсе проверки ok');
  process.exit(bad ? 1 : 0);
});

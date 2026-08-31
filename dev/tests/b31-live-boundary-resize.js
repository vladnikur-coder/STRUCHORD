// B-31 (2026-08-30): smooth snapped resize границы между ячейками.
//
// Уточнённая постановка после визуальной отмены guide-only прототипа:
// существующий resize остаётся дискретным и привязанным к шагам сетки,
// но переходы между snapped-состояниями не должны быть резкими скачками.
// Pointermove не мутирует модель, не делает reslice/settle и не
// пересобирает основной square-inner; счёт/засечки во время drag остаются на стартовых координатах, а edge-отступ счёта следует текущей snapped-границе; модель фиксируется один раз на pointerup.
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

function sceneSquareEdge() {
  evl(`
    globalTimeSig = '4/4';
    DOM.globalTimeSig.value = '4/4';
    squareZoom = 1;
    sections = [{ id: 1, type: 'Verse', customName: null, key: null, timeSig: null, bpm: 0,
      repeat: 1, strumPattern: null, squares: [
        { id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
          { chord: 'C', span: 4, timeSig: null, strumPattern: null },
          { chord: 'G', span: 4, timeSig: null, strumPattern: null },
          { chord: 'Am', span: 4, timeSig: null, strumPattern: null },
          { chord: 'F', span: 4, timeSig: null, strumPattern: null },
        ]},
      ]
    }];
    if (songRhythmRolls) {
      for (const key of [...songRhythmRolls.refs.keys()]) if (key.startsWith('1:2:')) songRhythmRolls.refs.delete(key);
      songRhythmRolls.sectionRolls.delete(1);
    }
    render();
    window.__b31RequestRenderCount = 0;
    window.__b31SquareEdgeStageCount = 0;
    window.__b31SquareEdgePreviewFrameCount = 0;
    window.__b31SquareEdgeCommitCount = 0;
    if (!window.__b31OldRequestRender) window.__b31OldRequestRender = requestRender;
    requestRender = function () {
      window.__b31RequestRenderCount++;
      return window.__b31OldRequestRender.apply(this, arguments);
    };
    const bi = document.querySelector('.square-inner');
    bi.getBoundingClientRect = () => ({ left: 0, top: 0, width: 402, height: 74, right: 402, bottom: 74, x: 0, y: 0 });
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
  ok('на pointermove включается live-grid из fr-треков snapped-ячеек',
    /^minmax\(0, [0-9.]+fr\) minmax\(0, [0-9.]+fr\)/.test(liveTemplate)
      && !liveTemplate.startsWith('repeat('),
    liveTemplate);
  ok('snap-переходы анимируются grid-template-columns',
    evl(`return document.querySelector('.square-inner').classList.contains('is-snap-resize-animated')`),
    evl(`return document.querySelector('.square-inner').className`));
  ok('счёт вынесен в frozen overlay, чтобы 1/та/и/та не резинились',
    evl(`return !!document.querySelector('.resize-metric-overlay .chord-count')`),
    'no metric overlay');
  ok('засечки тоже вынесены в frozen overlay и не едут вместе с ячейкой',
    evl(`return !!document.querySelector('.resize-metric-overlay .resize-frozen-tick') && !!document.querySelector('.resize-metric-overlay .resize-frozen-tick.is-step')`),
    'no frozen ticks');
  ok('движущаяся граница перекрывает frozen-засечки, но не счёт',
    evl(`return !!document.querySelector('.resize-boundary-cover')
      && getComputedStyle(document.querySelector('.resize-boundary-grid')).zIndex === '2'
      && getComputedStyle(document.querySelector('.resize-count-cell')).zIndex === '3'`),
    'no boundary cover layer');
  ok('счёт остаётся на стартовых координатах, но edge-отступ следует текущей границе',
    evl(`return Array.from(document.querySelectorAll('.resize-count-cell .chord-count.is-edge')).map(n => n.textContent).join('|')`) === '1|и',
    evl(`return Array.from(document.querySelectorAll('.resize-count-cell .chord-count.is-edge')).map(n => n.textContent).join('|')`));
  ok('edge-отступ счёта во время resize плавный и transform-only',
    /\.resize-metric-overlay \.resize-count-cell \.chord-count \{[\s\S]*transition:\s*transform 0\.12s/.test(fs.readFileSync(file, 'utf8'))
      && /\.resize-metric-overlay \.resize-count-cell \.chord-count\.is-edge \{[\s\S]*transform:\s*translateX\(2px\)/.test(fs.readFileSync(file, 'utf8')),
    'no smooth transform edge offset');
  ok('засечка под текущей границей плавно скрывается в реальном времени',
    evl(`return !!document.querySelector('.resize-frozen-tick.is-hidden')`)
      && /\.resize-metric-overlay \.resize-frozen-tick \{[\s\S]*transition:\s*opacity 0\.14s/.test(fs.readFileSync(file, 'utf8')),
    'no fading hidden tick');
  ok('засечка на старой границе снова видима, когда границу утащили дальше',
    evl(`return !!document.querySelector('.resize-frozen-tick[data-resize-metric-key="2000000"]:not(.is-hidden)')`),
    evl(`return Array.from(document.querySelectorAll('.resize-frozen-tick[data-resize-metric-key="2000000"]')).map(n => n.className).join('|') || 'missing old-edge tick'`));
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

  console.log('=== B-31.4 right edge: smooth snapped crop без innerHTML на move ===');
  sceneSquareEdge();
  await sleep(30);
  const edgeHandle = w.document.querySelector('.square[data-square="2"] .square-resize-handle');
  ok('ручка правого края есть', !!edgeHandle);
  firePointerDown(edgeHandle, 400);
  firePointerMove(300); // 4 такта -> 3 такта
  ok('до rAF модель правого края ещё не изменилась',
    evl('return sections[0].squares[0].events.length + ":" + (sections[0].squares[0].customBeats || 16)') === '4:16',
    evl('return sections[0].squares[0].events.length + ":" + (sections[0].squares[0].customBeats || 16)'));
  await sleep(35);
  ok('правый край перешёл в staged crop-preview',
    evl(`return document.querySelector('.square-inner').classList.contains('is-square-edge-resizing')`)
      && /px\)\)$/.test(evl(`return document.querySelector('.square-inner').style.gridTemplateColumns`)),
    evl(`return document.querySelector('.square-inner').className + ' | ' + document.querySelector('.square-inner').style.gridTemplateColumns`));
  ok('на pointermove правого края модель не мутирует и полный render не нужен',
    evl('return sections[0].squares[0].events.length') === 4
      && evl('return window.__b31RequestRenderCount') === 0,
    evl('return "events=" + sections[0].squares[0].events.length + " renders=" + window.__b31RequestRenderCount'));
  ok('staged preview правого края строится один раз',
    evl('return window.__b31SquareEdgeStageCount') === 1
      && evl('return window.__b31SquareEdgePreviewFrameCount') === 1,
    evl('return "stage=" + window.__b31SquareEdgeStageCount + " frames=" + window.__b31SquareEdgePreviewFrameCount'));
  firePointerMove(295);
  await sleep(35);
  ok('движения внутри того же snap не перестраивают staged preview',
    evl('return window.__b31SquareEdgeStageCount') === 1,
    evl('return window.__b31SquareEdgeStageCount'));
  firePointerUp(300);
  await sleep(50);
  ok('на pointerup правый край коммитится один раз',
    evl('return sections[0].squares[0].customBeats') === 12
      && evl('return sections[0].squares[0].events.length') === 3
      && evl('return window.__b31SquareEdgeCommitCount') === 1,
    evl('return "beats=" + sections[0].squares[0].customBeats + " events=" + sections[0].squares[0].events.length + " commits=" + window.__b31SquareEdgeCommitCount'));
  ok('commit правого края тоже без полного requestRender',
    evl('return window.__b31RequestRenderCount') === 0,
    evl('return window.__b31RequestRenderCount'));
  restoreRequestRender();

  console.log(bad ? `\nFAIL: ${bad}` : '\nвсе проверки ok');
  process.exit(bad ? 1 : 0);
});

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
    window.__b31SquareEdgePreviewRenderCount = 0;
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

function sceneSquareEdgeAdd() {
  evl(`
    globalTimeSig = '4/4';
    DOM.globalTimeSig.value = '4/4';
    squareZoom = 1;
    sections = [{ id: 1, type: 'Verse', customName: null, key: null, timeSig: null, bpm: 0,
      repeat: 1, strumPattern: null, squares: [
        { id: 2, repeat: 1, customBeats: 12, strumPattern: null, events: [
          { chord: 'C', span: 4, timeSig: null, strumPattern: null },
          { chord: 'G', span: 4, timeSig: null, strumPattern: null },
          { chord: 'Am', span: 4, timeSig: null, strumPattern: null },
        ]},
      ]
    }];
    if (songRhythmRolls) {
      for (const key of [...songRhythmRolls.refs.keys()]) if (key.startsWith('1:2:')) songRhythmRolls.refs.delete(key);
      songRhythmRolls.sectionRolls.delete(1);
    }
    render();
    window.__b31RequestRenderCount = 0;
    window.__b31SquareEdgePreviewRenderCount = 0;
    window.__b31SquareEdgePreviewFrameCount = 0;
    window.__b31SquareEdgeCommitCount = 0;
    window.__b31SquareEdgeFreezeOverlayCount = 0;
    if (!window.__b31OldRequestRender) window.__b31OldRequestRender = requestRender;
    requestRender = function () {
      window.__b31RequestRenderCount++;
      return window.__b31OldRequestRender.apply(this, arguments);
    };
    const bi = document.querySelector('.square-inner');
    bi.getBoundingClientRect = () => ({ left: 0, top: 0, width: 302, height: 74, right: 302, bottom: 74, x: 0, y: 0 });
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

  console.log('=== B-31.4 right edge: smooth snapped preview без модели на move ===');
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
  ok('правый край перешёл в smooth snapped preview будущей структуры',
    evl(`return document.querySelector('.square-inner').classList.contains('is-square-edge-resizing')`)
      && /^repeat\(12,/.test(evl(`return document.querySelector('.square-inner').style.gridTemplateColumns`))
      && /px\)\)$/.test(evl(`return document.querySelector('.square-inner').style.gridTemplateColumns`)),
    evl(`return document.querySelector('.square-inner').className + ' | ' + document.querySelector('.square-inner').style.gridTemplateColumns`));
  ok('на pointermove правого края модель не мутирует и полный render не нужен',
    evl('return sections[0].squares[0].events.length') === 4
      && evl('return window.__b31RequestRenderCount') === 0,
    evl('return "events=" + sections[0].squares[0].events.length + " renders=" + window.__b31RequestRenderCount'));
  ok('до отпускания DOM показывает будущую snapped-структуру без записи модели',
    evl(`return document.querySelectorAll('.square[data-square="2"] > .square-inner > .chord-wrapper').length`) === 3
      && evl(`return document.querySelector('.square[data-square="2"] > .square-inner > .chord-wrapper[data-ei="3"]')`) === null,
    'right edge preview did not switch to future structure');
  ok('удаляемый такт — right-anchored strip: лево фиксировано, ширины нет (право приклеено к краю)',
    evl(`return !!document.querySelector('.square-edge-freeze-overlay')
      && !!document.querySelector('.square-edge-removed-strip')
      && document.querySelectorAll('.square-edge-freeze-cell.is-kept').length === 3
      && document.querySelectorAll('.square-edge-removed-strip .square-edge-freeze-cell.is-removed-slide').length === 1
      && document.querySelector('.square-edge-removed-strip').style.left !== ''
      && document.querySelector('.square-edge-removed-strip').style.width === ''
      && getComputedStyle(document.querySelector('.square-edge-removed-strip')).right === '0px'`),
    evl(`return 'strip=' + !!document.querySelector('.square-edge-removed-strip') + ' kept=' + document.querySelectorAll('.square-edge-freeze-cell.is-kept').length + ' removed=' + document.querySelectorAll('.square-edge-removed-strip .square-edge-freeze-cell.is-removed-slide').length + ' left=' + (document.querySelector('.square-edge-removed-strip')?.style.left || '') + ' width=' + (document.querySelector('.square-edge-removed-strip')?.style.width || '') + ' right=' + getComputedStyle(document.querySelector('.square-edge-removed-strip')).right`));
  ok('граница перед удаляемым тактом остаётся видимой до конца анимации',
    evl(`return document.querySelectorAll('.square-edge-freeze-boundary').length >= 1`),
    evl(`return document.querySelectorAll('.square-edge-freeze-boundary').length`));
  ok('preview правого края строится один раз на snapped-переход',
    evl('return window.__b31SquareEdgePreviewRenderCount') === 1
      && evl('return window.__b31SquareEdgePreviewFrameCount') === 1,
    evl('return "renders=" + window.__b31SquareEdgePreviewRenderCount + " frames=" + window.__b31SquareEdgePreviewFrameCount'));
  firePointerMove(295);
  await sleep(35);
  ok('движения внутри того же snap не перестраивают preview правого края',
    evl('return window.__b31SquareEdgePreviewRenderCount') === 1,
    evl('return window.__b31SquareEdgePreviewRenderCount'));
  await sleep(520);
  ok('follow_mouse: overlay и ghost живут до pointerup (hold != финал по дизайну), модель не тронута',
    evl(`return !!document.querySelector('.square-edge-freeze-overlay')
      && !!document.querySelector('.square[data-square="2"] .square-inner > .square-edge-extend-ghost')
      && document.querySelectorAll('.square[data-square="2"] > .square-inner > .chord-wrapper').length === 3
      && sections[0].squares[0].events.length === 4`),
    evl(`return 'overlay=' + !!document.querySelector('.square-edge-freeze-overlay')
      + ' ghost=' + !!document.querySelector('.square[data-square="2"] .square-inner > .square-edge-extend-ghost')
      + ' dom=' + document.querySelectorAll('.square[data-square="2"] > .square-inner > .chord-wrapper').length
      + ' model=' + sections[0].squares[0].events.length`));
  firePointerUp(300);
  await sleep(80);
  ok('на pointerup preview-слой (overlay + ghost) снят',
    evl(`return !document.querySelector('.square-edge-freeze-overlay')
      && !document.querySelector('.square-edge-extend-ghost')`),
    evl(`return 'overlay=' + !!document.querySelector('.square-edge-freeze-overlay')
      + ' ghost=' + !!document.querySelector('.square-edge-extend-ghost')`));
  await sleep(450);
  ok('после pointerup правый край коммитится один раз',
    evl(`return sections[0].squares[0].customBeats`) === 12
      && evl(`return sections[0].squares[0].events.length`) === 3
      && evl(`return window.__b31SquareEdgeCommitCount`) === 1,
    evl(`return "beats=" + sections[0].squares[0].customBeats + " events=" + sections[0].squares[0].events.length + " commits=" + window.__b31SquareEdgeCommitCount`));
  ok('commit правого края тоже без полного requestRender',
    evl(`return window.__b31RequestRenderCount`) === 0,
    evl(`return window.__b31RequestRenderCount`));
  restoreRequestRender();

  console.log('=== B-31.5 right edge add: старые такты frozen поверх preview ===');
  sceneSquareEdgeAdd();
  await sleep(30);
  const addEdgeHandle = w.document.querySelector('.square[data-square="2"] .square-resize-handle');
  ok('ручка правого края для добавления есть', !!addEdgeHandle);
  firePointerDown(addEdgeHandle, 300);
  firePointerMove(400); // 3 такта -> 4 такта
  ok('до rAF модель добавления ещё не изменилась',
    evl('return sections[0].squares[0].events.length + ":" + sections[0].squares[0].customBeats') === '3:12',
    evl('return sections[0].squares[0].events.length + ":" + sections[0].squares[0].customBeats'));
  await sleep(45);
  ok('добавление показывает будущий четвёртый такт без записи модели',
    evl(`return document.querySelectorAll('.square[data-square="2"] > .square-inner > .chord-wrapper').length`) === 4
      && evl('return sections[0].squares[0].events.length') === 3,
    evl(`return 'dom=' + document.querySelectorAll('.square[data-square="2"] > .square-inner > .chord-wrapper').length + ' model=' + sections[0].squares[0].events.length`));
  ok('старые три такта frozen overlay закрывает от визуального растяжения',
    evl(`return !!document.querySelector('.square-edge-freeze-overlay')
      && document.querySelectorAll('.square-edge-freeze-cell').length === 3
      && window.__b31SquareEdgeFreezeOverlayCount === 1`),
    evl(`return 'freeze=' + !!document.querySelector('.square-edge-freeze-overlay') + ' cells=' + document.querySelectorAll('.square-edge-freeze-cell').length + ' count=' + window.__b31SquareEdgeFreezeOverlayCount`));
  ok('frozen overlay явно восстанавливает границы между старыми тактами',
    evl(`return document.querySelectorAll('.square-edge-freeze-boundary').length`) === 2,
    evl(`return document.querySelectorAll('.square-edge-freeze-boundary').length`));
  firePointerUp(400);
  await sleep(450);
  ok('после визуального settle добавление коммитится один раз',
    evl('return (sections[0].squares[0].customBeats || 16)') === 16
      && evl('return sections[0].squares[0].events.length') === 4
      && evl('return window.__b31SquareEdgeCommitCount') === 1,
    evl('return "beats=" + (sections[0].squares[0].customBeats || 16) + " events=" + sections[0].squares[0].events.length + " commits=" + window.__b31SquareEdgeCommitCount'));
  restoreRequestRender();

  console.log('=== B-31.6 right edge: multi-takt shrink не складывает удаляемые такты ===');
  sceneSquareEdge();
  await sleep(30);
  const multiEdgeHandle = w.document.querySelector('.square[data-square="2"] .square-resize-handle');
  firePointerDown(multiEdgeHandle, 400);
  firePointerMove(100); // 4 такта -> 1 такт
  await sleep(35);
  ok('multi-shrink держит удаляемые такты в одном strip без наложения в правый край',
    evl(`return document.querySelectorAll('.square[data-square="2"] > .square-inner > .chord-wrapper').length === 1
      && document.querySelectorAll('.square-edge-freeze-cell.is-kept').length === 1
      && document.querySelectorAll('.square-edge-removed-strip .square-edge-freeze-cell.is-removed-slide').length === 3
      && document.querySelectorAll('.square-edge-removed-strip').length === 1`),
    evl(`return 'dom=' + document.querySelectorAll('.square[data-square="2"] > .square-inner > .chord-wrapper').length
      + ' kept=' + document.querySelectorAll('.square-edge-freeze-cell.is-kept').length
      + ' removed=' + document.querySelectorAll('.square-edge-removed-strip .square-edge-freeze-cell.is-removed-slide').length
      + ' strips=' + document.querySelectorAll('.square-edge-removed-strip').length`));
  firePointerUp(100);
  await sleep(450);
  ok('multi-shrink после settle коммитится в 1 такт без overlay-хвостов',
    evl('return sections[0].squares[0].customBeats') === 4
      && evl('return sections[0].squares[0].events.length') === 1
      && evl(`return document.querySelectorAll('.square-edge-freeze-overlay,.square-edge-removed-strip').length`) === 0,
    evl(`return 'beats=' + sections[0].squares[0].customBeats + ' events=' + sections[0].squares[0].events.length + ' overlays=' + document.querySelectorAll('.square-edge-freeze-overlay,.square-edge-removed-strip').length`));
  restoreRequestRender();

  console.log('=== B-31.7 right edge: секция с visual≠sound — settled-preview == финал ===');
  // Репро «серого пятна» (2026-09-01): preview считал проценты от ЗВУКОВОГО
  // эталона (getSectionMaxBeats), а финальный рендер — от ВИЗУАЛЬНОГО
  // (getSectionMaxVisualBeats). В секции с ячейками своего размера (Wind of
  // Change: sound=20 / visual=18) коробка preview расходилась с px-сеткой:
  // серая дорожка фона при задвигании + скачок ширины на pointerup.
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
        { id: 3, repeat: 1, customBeats: null, strumPattern: null, events: [
          { chord: 'Em', span: 4, timeSig: '3/4', strumPattern: null },
          { chord: 'Dm', span: 4, timeSig: '3/4', strumPattern: null },
          { chord: 'G', span: 4, timeSig: '3/4', strumPattern: null },
          { chord: 'C', span: 4, timeSig: '3/4', strumPattern: null },
          { chord: 'Am', span: 4, timeSig: '3/4', strumPattern: null },
          { chord: 'E', span: 4, timeSig: '3/4', strumPattern: null },
        ]},
      ]
    }];
    if (songRhythmRolls) {
      for (const key of [...songRhythmRolls.refs.keys()]) songRhythmRolls.refs.delete(key);
      songRhythmRolls.sectionRolls.delete(1);
    }
    render();
    window.__b31RequestRenderCount = 0;
    window.__b31SquareEdgePreviewRenderCount = 0;
    window.__b31SquareEdgePreviewFrameCount = 0;
    window.__b31SquareEdgeCommitCount = 0;
    if (!window.__b31OldRequestRender) window.__b31OldRequestRender = requestRender;
    requestRender = function () {
      window.__b31RequestRenderCount++;
      return window.__b31OldRequestRender.apply(this, arguments);
    };
    const bi = document.querySelector('.square[data-square="2"] .square-inner');
    bi.getBoundingClientRect = () => ({ left: 0, top: 0, width: 402, height: 74, right: 402, bottom: 74, x: 0, y: 0 });
    return JSON.stringify({
      soundMax: getSectionMaxBeats(sections[0]),
      visualMax: getSectionMaxVisualBeats(sections[0]),
    })`);
  const etalons = JSON.parse(evl(`return JSON.stringify({
    soundMax: getSectionMaxBeats(sections[0]),
    visualMax: getSectionMaxVisualBeats(sections[0]),
  })`));
  ok('эталоны секции расходятся (иначе тест ничего не ловит)',
    etalons.soundMax > etalons.visualMax + 1 && etalons.visualMax === 24,
    JSON.stringify(etalons));
  const mixedHandle = w.document.querySelector('.square[data-square="2"] .square-resize-handle');
  firePointerDown(mixedHandle, 400);
  firePointerMove(98); // 16 долей -> 4 доли (визуальная цель 4/24 = 16.6667%)
  await sleep(35);
  const holdWidth = evl(`return document.querySelector('.square[data-square="2"] .square-inner').style.width`);
  ok('settled-preview (мышь зажата) считает % от ВИЗУАЛЬНОГО эталона (16.6667%, не 12.5%)',
    Math.abs(parseFloat(holdWidth) - 16.6667) < 0.01,
    holdWidth);
  const holdGrid = evl(`return document.querySelector('.square[data-square="2"] .square-inner').style.gridTemplateColumns`);
  ok('px-колонки preview посчитаны от визуальной ширины ряда (23.625px)',
    /23\.6250*px/.test(holdGrid), holdGrid);
  await sleep(520); // visual settle до отпускания
  firePointerUp(98);
  await sleep(600);
  const finalWidth = evl(`return document.querySelector('.square[data-square="2"] .square-inner').style.width`);
  ok('после pointerup ширина НЕ скачет: финал == settled-preview',
    Math.abs(parseFloat(finalWidth) - parseFloat(holdWidth)) < 0.01,
    holdWidth + ' -> ' + finalWidth);
  ok('модель закоммичена в 4 доли, один commit',
    evl('return sections[0].squares[0].events.length') === 1
      && evl('return sections[0].squares[0].customBeats') === 4
      && evl('return window.__b31SquareEdgeCommitCount') === 1,
    evl('return "events=" + sections[0].squares[0].events.length + " beats=" + sections[0].squares[0].customBeats + " commits=" + window.__b31SquareEdgeCommitCount'));
  restoreRequestRender();

  console.log('=== B-31.8 right edge: follow_mouse — край за мышью, соседи заморожены, доезд на pointerup ===');
  // Решение пользователя (2026-09-01, «follow_mouse»): при задвигании
  // самого длинного квадрата правый край непрерывно следует за мышью ВЕСЬ
  // жест (никакого залипания на 100% и лестницы 25%-шагов), соседи и
  // repeat-ряд на время жеста заморожены на стартовых ширинах, а на
  // pointerup всё мягко «доезжает» до финальных макетных ширин.
  // Репро-геометрия: старт ряда 402px, драг 400->90 → follow = 92/402.
  evl(`
    globalTimeSig = '4/4';
    DOM.globalTimeSig.value = '4/4';
    squareZoom = 1;
    sections = [{ id: 1, type: 'Verse', customName: null, key: null, timeSig: null, bpm: 0,
      repeat: 2, strumPattern: null, squares: [
        { id: 2, repeat: 1, customBeats: 20, strumPattern: null, events: [
          { chord: 'C', span: 4, timeSig: '3/4', strumPattern: null },
          { chord: 'G', span: 4, timeSig: '3/4', strumPattern: null },
          { chord: 'Am', span: 4, timeSig: '3/4', strumPattern: null },
          { chord: 'F', span: 4, timeSig: '3/4', strumPattern: null },
          { chord: 'Em', span: 4, timeSig: '3/4', strumPattern: null },
          { chord: 'Dm', span: 4, timeSig: '3/4', strumPattern: null },
        ]},
        { id: 3, repeat: 1, customBeats: null, strumPattern: null, events: [
          { chord: 'C', span: 4, timeSig: null, strumPattern: null },
          { chord: 'G', span: 4, timeSig: null, strumPattern: null },
          { chord: 'Am', span: 4, timeSig: null, strumPattern: null },
          { chord: 'F', span: 4, timeSig: null, strumPattern: null },
        ]},
      ]
    }];
    if (songRhythmRolls) {
      for (const key of [...songRhythmRolls.refs.keys()]) songRhythmRolls.refs.delete(key);
      songRhythmRolls.sectionRolls.delete(1);
    }
    render();
    window.__b31RequestRenderCount = 0;
    window.__b31SquareEdgePreviewRenderCount = 0;
    window.__b31SquareEdgePreviewFrameCount = 0;
    window.__b31SquareEdgeCommitCount = 0;
    if (!window.__b31OldRequestRender) window.__b31OldRequestRender = requestRender;
    requestRender = function () {
      window.__b31RequestRenderCount++;
      return window.__b31OldRequestRender.apply(this, arguments);
    };
    const bi = document.querySelector('.square[data-square="2"] .square-inner');
    bi.getBoundingClientRect = () => ({ left: 0, top: 0, width: 402, height: 74, right: 402, bottom: 74, x: 0, y: 0 });
    return 0`);
  const victimHandle = w.document.querySelector('.square[data-square="2"] .square-resize-handle');
  const startSibling = evl(`return document.querySelector('.square[data-square="3"] .square-inner').style.width`);
  const startRepeatRow = evl(`return document.querySelector('.section-card[data-id="1"] .section-repeat-row').style.width`);
  firePointerDown(victimHandle, 400);
  firePointerMove(90); // звуковые 20 доли -> 4 (1 такт)
  await sleep(35);
  const holdVictim = evl(`return document.querySelector('.square[data-square="2"] .square-inner').style.width`);
  const holdSibling = evl(`return document.querySelector('.square[data-square="3"] .square-inner').style.width`);
  const holdBadge = evl(`return document.querySelector('.square[data-square="2"] .square-beats-badge').textContent`);
  // follow-формула: clamp(startPx + dx) / rowWidth * 100 = (402-310)/402
  ok('край при удержании следует за мышью: follow 22.89%, не финал 18.75% и не залипание 100%',
    Math.abs(parseFloat(holdVictim) - (92 / 402) * 100) < 0.01, holdVictim);
  ok('сосед при удержании заморожен на стартовой ширине, без живой перестройки',
    Math.abs(parseFloat(holdSibling) - parseFloat(startSibling)) < 0.01, startSibling + ' -> ' + holdSibling);
  ok('бейдж тактов жертвы обновлён ещё до отпускания', holdBadge === '1 такт', holdBadge);
  const holdRepeatRow = evl(`return document.querySelector('.section-card[data-id="1"] .section-repeat-row').style.width`);
  ok('repeat-ряд при удержании заморожен на стартовой ширине',
    Math.abs(parseFloat(holdRepeatRow) - parseFloat(startRepeatRow)) < 0.01, startRepeatRow + ' -> ' + holdRepeatRow);
  // Непрерывность: движение ВНУТРИ того же снапа (4 доли: px ∈ (80.4,120.6))
  // двигает край (follow), хотя структура (preview render) не перестраивается.
  const framesBefore = evl('return window.__b31SquareEdgePreviewFrameCount || 0');
  const rendersBefore = evl('return window.__b31SquareEdgePreviewRenderCount || 0');
  firePointerMove(105); // тот же снап (1 такт), но мышь правее
  await sleep(35);
  const followVictim = evl(`return document.querySelector('.square[data-square="2"] .square-inner').style.width`);
  ok('внутри того же снапа край продолжает ехать за мышью (22.89% -> 26.62%)',
    Math.abs(parseFloat(followVictim) - (107 / 402) * 100) < 0.01, holdVictim + ' -> ' + followVictim);
  ok('preview-структура при этом не перестраивается (render count не растёт)',
    evl('return window.__b31SquareEdgePreviewRenderCount || 0') === rendersBefore,
    rendersBefore + ' -> ' + evl('return window.__b31SquareEdgePreviewRenderCount || 0'));
  ok('каждый pointermove даёт follow-кадр (frame count растёт)',
    evl('return window.__b31SquareEdgePreviewFrameCount || 0') > framesBefore,
    framesBefore + ' -> ' + evl('return window.__b31SquareEdgePreviewFrameCount || 0'));
  await sleep(520);
  firePointerUp(90);
  await sleep(600);
  const finalVictim = evl(`return document.querySelector('.square[data-square="2"] .square-inner').style.width`);
  const finalSibling = evl(`return document.querySelector('.square[data-square="3"] .square-inner').style.width`);
  ok('после pointerup жертва доезжает до финальной ширины 18.75% (визуальный эталон)',
    Math.abs(parseFloat(finalVictim) - 18.75) < 0.01,
    holdVictim + ' -> ' + finalVictim);
  ok('после pointerup сосед доезжает до финальных 100%',
    Math.abs(parseFloat(finalSibling) - 100) < 0.01,
    holdSibling + ' -> ' + finalSibling);
  const finalRepeatRow = evl(`return document.querySelector('.section-card[data-id="1"] .section-repeat-row').style.width`);
  ok('после pointerup repeat-ряд доезжает до финальных 100%',
    Math.abs(parseFloat(finalRepeatRow) - 100) < 0.01,
    holdRepeatRow + ' -> ' + finalRepeatRow);
  ok('settle-доезд запускался (не мгновенный скачок без обработки)',
    (evl('return window.__b31SquareEdgeSettleCount || 0') >= 1),
    String(evl('return window.__b31SquareEdgeSettleCount || 0')));
  ok('модель закоммичена в 1 такт',
    evl('return sections[0].squares[0].customBeats') === 4
      && evl('return sections[0].squares[0].events.length') === 1,
    evl('return "beats=" + sections[0].squares[0].customBeats + " events=" + sections[0].squares[0].events.length'));
  restoreRequestRender();

  console.log(bad ? `\nFAIL: ${bad}` : '\nвсе проверки ok');
  process.exit(bad ? 1 : 0);
});

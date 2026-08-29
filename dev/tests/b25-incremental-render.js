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

function resetRenderCounter() {
  evl(`
    if (!window.__b25OldRequestRender) window.__b25OldRequestRender = requestRender;
    window.__b25RequestRenderCount = 0;
    window.__b25IncrementalSquareSyncCount = 0;
    window.__b25IncrementalSquareRenderCount = 0;
    window.__b25IncrementalSectionSquaresRenderCount = 0;
    window.__b25IncrementalRepeatSyncCount = 0;
    window.__b25IncrementalSectionBadgeSyncCount = 0;
    window.__b25IncrementalSectionHeaderSyncCount = 0;
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
    delete window.__b25IncrementalSquareRenderCount;
    delete window.__b25IncrementalSectionSquaresRenderCount;
    delete window.__b25IncrementalRepeatSyncCount;
    delete window.__b25IncrementalSectionBadgeSyncCount;
    delete window.__b25IncrementalSectionHeaderSyncCount;
    return 0`);
}

function scene() {
  evl(`
    globalKey = 'C';
    keyMode = 'manual';
    DOM.rootKey.value = 'C';
    sections = [{ id: 1, type: 'Verse', customName: null, key: null, timeSig: null, bpm: 0,
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

  console.log('=== B-25.1 resize drag: pointermove схлопывается до 1 записи на кадр ===');
  scene();
  evl('window.__b25ResizeWriteCount = 0; return 0');
  const resizeHandle = w.document.querySelector('.square[data-square="2"] .chord-wrapper[data-ei="0"] .resize-handle');
  ok('ручка границы есть для проверки throttle', !!resizeHandle);
  firePointerDown(resizeHandle, 100);
  firePointerMove(130);
  firePointerMove(160);
  firePointerMove(190);
  ok('до rAF тяжёлая запись resize ещё не выполнялась',
    evl('return window.__b25ResizeWriteCount || 0') === 0,
    evl('return window.__b25ResizeWriteCount || 0'));
  await sleep(35);
  ok('несколько pointermove в одном кадре дали не больше одной записи DOM/model',
    evl('return window.__b25ResizeWriteCount || 0') <= 1,
    evl('return window.__b25ResizeWriteCount || 0'));
  firePointerUp(190);
  await sleep(520);
  evl('delete window.__b25ResizeWriteCount; return 0');

  console.log('=== B-25.2 addChordAfter: локальный rerender square-inner ===');
  scene();
  resetRenderCounter();
  evl(`addChordAfter(1, 2, 0); return 0`);
  ok('addChordAfter не вызывает полный requestRender',
    evl('return window.__b25RequestRenderCount') === 0,
    evl('return window.__b25RequestRenderCount'));
  ok('addChordAfter пересобрал один square-inner локально',
    evl('return window.__b25IncrementalSquareRenderCount') >= 1,
    evl('return window.__b25IncrementalSquareRenderCount'));
  ok('после + в модели три ячейки',
    evl('return sections[0].squares[0].events.length') === 3,
    evl('return sections[0].squares[0].events.length'));
  ok('после + в DOM три chord-wrapper с актуальными data-ei',
    evl(`return [...document.querySelectorAll('.square[data-square="2"] .chord-wrapper')].map((el) => el.dataset.ei).join(',')`) === '0,1,2',
    evl(`return [...document.querySelectorAll('.square[data-square="2"] .chord-wrapper')].map((el) => el.dataset.ei).join(',')`));
  ok('после + появились две ручки границ',
    evl(`return document.querySelectorAll('.square[data-square="2"] .resize-handle').length`) === 2,
    evl(`return document.querySelectorAll('.square[data-square="2"] .resize-handle').length`));
  restoreRenderCounter();

  console.log('=== B-25.2 removeChordAt: локальный rerender square-inner ===');
  evl(`
    sections = [{ id: 1, type: 'Verse', customName: null, key: 'C', timeSig: null, bpm: 0,
      repeat: 1, strumPattern: null, squares: [
        { id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
          { chord: 'C', span: 2, timeSig: null, strumPattern: null },
          { chord: 'G', span: 2, timeSig: null, strumPattern: null },
          { chord: 'Am', span: 4, timeSig: null, strumPattern: null },
        ]},
      ]
    }];
    if (songRhythmRolls) {
      for (const key of [...songRhythmRolls.refs.keys()]) if (key.startsWith('1:2:')) songRhythmRolls.refs.delete(key);
      songRhythmRolls.sectionRolls.delete(1);
    }
    render();
    return 0`);
  resetRenderCounter();
  evl(`removeChordAt(1, 2, 1); return 0`);
  ok('removeChordAt не вызывает полный requestRender',
    evl('return window.__b25RequestRenderCount') === 0,
    evl('return window.__b25RequestRenderCount'));
  ok('removeChordAt пересобрал один square-inner локально',
    evl('return window.__b25IncrementalSquareRenderCount') >= 1,
    evl('return window.__b25IncrementalSquareRenderCount'));
  ok('после − в модели две ячейки',
    evl('return sections[0].squares[0].events.length') === 2,
    evl('return sections[0].squares[0].events.length'));
  ok('поглотитель получил длительность удалённой ячейки',
    evl('return sections[0].squares[0].events[0].span') === 4,
    evl('return sections[0].squares[0].events[0].span'));
  ok('после − в DOM две chord-wrapper с актуальными data-ei',
    evl(`return [...document.querySelectorAll('.square[data-square="2"] .chord-wrapper')].map((el) => el.dataset.ei).join(',')`) === '0,1',
    evl(`return [...document.querySelectorAll('.square[data-square="2"] .chord-wrapper')].map((el) => el.dataset.ei).join(',')`));
  ok('после − осталась одна ручка границы',
    evl(`return document.querySelectorAll('.square[data-square="2"] .resize-handle').length`) === 1,
    evl(`return document.querySelectorAll('.square[data-square="2"] .resize-handle').length`));
  restoreRenderCounter();

  console.log('=== B-25.3 add/remove/clone square: локальный rerender squares-list ===');
  scene();
  resetRenderCounter();
  evl(`addSquare(1); return 0`);
  ok('addSquare не вызывает полный requestRender',
    evl('return window.__b25RequestRenderCount') === 0,
    evl('return window.__b25RequestRenderCount'));
  ok('addSquare пересобрал squares-list одной секции',
    evl('return window.__b25IncrementalSectionSquaresRenderCount') >= 1,
    evl('return window.__b25IncrementalSectionSquaresRenderCount'));
  ok('после addSquare в модели три квадрата',
    evl('return sections[0].squares.length') === 3,
    evl('return sections[0].squares.length'));
  ok('после addSquare в DOM три .square',
    evl(`return document.querySelectorAll('.section-card[data-id="1"] .squares-list > .square').length`) === 3,
    evl(`return document.querySelectorAll('.section-card[data-id="1"] .squares-list > .square').length`));
  ok('edge-классы квадратов актуальны после addSquare',
    evl(`return !!document.querySelector('.square[data-square="2"].square--first')
      && !!document.querySelector('.square[data-square="' + sections[0].squares[2].id + '"].square--last')`));
  restoreRenderCounter();

  scene();
  resetRenderCounter();
  evl(`cloneLastSquare(1); return 0`);
  ok('cloneLastSquare не вызывает полный requestRender',
    evl('return window.__b25RequestRenderCount') === 0,
    evl('return window.__b25RequestRenderCount'));
  ok('cloneLastSquare пересобрал squares-list одной секции',
    evl('return window.__b25IncrementalSectionSquaresRenderCount') >= 1,
    evl('return window.__b25IncrementalSectionSquaresRenderCount'));
  ok('клон появился в модели и DOM',
    evl('return sections[0].squares.length') === 3
      && evl(`return document.querySelectorAll('.section-card[data-id="1"] .squares-list > .square').length`) === 3);
  restoreRenderCounter();

  scene();
  resetRenderCounter();
  evl(`removeSquare(1, 2); return 0`);
  ok('removeSquare не вызывает полный requestRender',
    evl('return window.__b25RequestRenderCount') === 0,
    evl('return window.__b25RequestRenderCount'));
  ok('removeSquare пересобрал squares-list одной секции',
    evl('return window.__b25IncrementalSectionSquaresRenderCount') >= 1,
    evl('return window.__b25IncrementalSectionSquaresRenderCount'));
  ok('после removeSquare остался один квадрат и edge-классы пересчитаны',
    evl('return sections[0].squares.length') === 1
      && evl(`return document.querySelectorAll('.section-card[data-id="1"] .squares-list > .square').length`) === 1
      && evl(`return !!document.querySelector('.section-card[data-id="1"] .squares-list > .square.square--first.square--last')`));
  restoreRenderCounter();

  console.log('=== B-25.3 setSquareCustomBeats: локальный rerender одного square-inner ===');
  scene();
  resetRenderCounter();
  evl(`setSquareCustomBeats(1, 2, 12); return 0`);
  ok('setSquareCustomBeats не вызывает полный requestRender',
    evl('return window.__b25RequestRenderCount') === 0,
    evl('return window.__b25RequestRenderCount'));
  ok('setSquareCustomBeats пересобрал один square-inner',
    evl('return window.__b25IncrementalSquareRenderCount') >= 1,
    evl('return window.__b25IncrementalSquareRenderCount'));
  ok('длина квадрата увеличилась до 12 долей и DOM получил новые ячейки',
    evl('return getSquareBeats(sections[0].squares[0], sections[0].timeSig || globalTimeSig)') === 12
      && evl(`return document.querySelectorAll('.square[data-square="2"] .chord-wrapper').length`) === 4,
    evl(`return document.querySelectorAll('.square[data-square="2"] .chord-wrapper').length`));
  restoreRenderCounter();

  console.log('=== B-25.4 rhythm modal: event save/reset без полного render ===');
  scene();
  evl(`sections[0].squares[0].events[0].strumPattern = { mode: 'strum', subdivision: 2, steps: ['D','U','D','U'] }; render(); return 0`);
  resetRenderCounter();
  evl(`openStrumPatternEditor('event', 1, 2, 0); document.querySelector('#save-pattern').click(); return 0`);
  ok('save event rhythm не вызывает полный requestRender',
    evl('return window.__b25RequestRenderCount') === 0,
    evl('return window.__b25RequestRenderCount'));
  ok('save event rhythm синхронизирует текущий квадрат локально',
    evl('return window.__b25IncrementalSquareSyncCount') >= 1,
    evl('return window.__b25IncrementalSquareSyncCount'));
  ok('после save event кнопка ритма помечена как own',
    !!w.document.querySelector('.square[data-square="2"] .chord-wrapper[data-ei="0"] .chord-btn-strum--own'));
  restoreRenderCounter();

  resetRenderCounter();
  evl(`openStrumPatternEditor('event', 1, 2, 0); document.querySelector('#reset-pattern').click(); return 0`);
  ok('reset event rhythm не вызывает полный requestRender',
    evl('return window.__b25RequestRenderCount') === 0,
    evl('return window.__b25RequestRenderCount'));
  ok('reset event rhythm синхронизирует текущий квадрат локально',
    evl('return window.__b25IncrementalSquareSyncCount') >= 1,
    evl('return window.__b25IncrementalSquareSyncCount'));
  ok('после reset event кнопка/preview очищены',
    !w.document.querySelector('.square[data-square="2"] .chord-wrapper[data-ei="0"] .chord-btn-strum--own')
      && !w.document.querySelector('.square[data-square="2"] .chord-wrapper[data-ei="0"] .event-strum-preview.has-pattern'));
  restoreRenderCounter();

  console.log('=== B-25.4 rhythm modal: section save/reset без полного render ===');
  scene();
  evl(`sections[0].strumPattern = { mode: 'strum', subdivision: 2, steps: ['D','U','D','U','D','U','D','U'] }; render(); return 0`);
  resetRenderCounter();
  evl(`openStrumPatternEditor('section', 1); document.querySelector('#save-pattern').click(); return 0`);
  ok('save section rhythm не вызывает полный requestRender',
    evl('return window.__b25RequestRenderCount') === 0,
    evl('return window.__b25RequestRenderCount'));
  ok('save section rhythm пересобирает squares-list секции локально',
    evl('return window.__b25IncrementalSectionSquaresRenderCount') >= 1,
    evl('return window.__b25IncrementalSectionSquaresRenderCount'));
  ok('section rhythm badge есть после save',
    !!w.document.querySelector('.section-card[data-id="1"] .strum-badge-wrap'));
  restoreRenderCounter();

  resetRenderCounter();
  evl(`openStrumPatternEditor('section', 1); document.querySelector('#reset-pattern').click(); return 0`);
  ok('reset section rhythm не вызывает полный requestRender',
    evl('return window.__b25RequestRenderCount') === 0,
    evl('return window.__b25RequestRenderCount'));
  ok('reset section rhythm пересобирает squares-list секции локально',
    evl('return window.__b25IncrementalSectionSquaresRenderCount') >= 1,
    evl('return window.__b25IncrementalSectionSquaresRenderCount'));
  ok('section rhythm badge удалён после reset',
    !w.document.querySelector('.section-card[data-id="1"] .strum-badge-wrap'));
  restoreRenderCounter();

  console.log('=== B-25.5 repeat/BPM: простые свойства без полного render ===');
  scene();
  resetRenderCounter();
  evl(`setSquareRepeat(1, 2, 3); return 0`);
  ok('setSquareRepeat не вызывает полный requestRender',
    evl('return window.__b25RequestRenderCount') === 0,
    evl('return window.__b25RequestRenderCount'));
  ok('setSquareRepeat обновляет бейдж квадрата напрямую',
    evl('return window.__b25IncrementalRepeatSyncCount') >= 1
      && evl(`return document.querySelector('.square[data-square="2"] .repeat-badge').textContent`) === '×3'
      && evl(`return document.querySelector('.square[data-square="2"] .repeat-badge').classList.contains('repeat-badge--visible')`));
  restoreRenderCounter();

  resetRenderCounter();
  evl(`setSectionRepeat(1, 2); return 0`);
  ok('setSectionRepeat не вызывает полный requestRender',
    evl('return window.__b25RequestRenderCount') === 0,
    evl('return window.__b25RequestRenderCount'));
  ok('setSectionRepeat пересобирает только squares-list секции',
    evl('return window.__b25IncrementalSectionSquaresRenderCount') >= 1,
    evl('return window.__b25IncrementalSectionSquaresRenderCount'));
  ok('section repeat row обновлён локально',
    evl(`return !!document.querySelector('.section-card[data-id="1"] .section-repeat-badge-absolute')
      && document.querySelector('.section-card[data-id="1"] .section-repeat-badge-absolute').textContent === '×2'`));
  restoreRenderCounter();

  resetRenderCounter();
  evl(`setSectionBpm(1, 96); return 0`);
  ok('setSectionBpm не вызывает полный requestRender',
    evl('return window.__b25RequestRenderCount') === 0,
    evl('return window.__b25RequestRenderCount'));
  ok('setSectionBpm обновляет BPM-бейдж секции локально',
    evl('return window.__b25IncrementalSectionBadgeSyncCount') >= 1
      && evl(`return document.querySelector('.section-card[data-id="1"] .section-badge--bpm').textContent`) === '96 BPM');
  evl(`setSectionBpm(1, null); return 0`);
  ok('сброс BPM секции удаляет BPM-бейдж локально',
    !w.document.querySelector('.section-card[data-id="1"] .section-badge--bpm'));
  restoreRenderCounter();

  console.log('=== B-25.6 section header/key/timeSig: локально ===');
  scene();
  resetRenderCounter();
  evl(`renameSection(1, 'Middle'); return 0`);
  ok('renameSection не вызывает полный requestRender',
    evl('return window.__b25RequestRenderCount') === 0,
    evl('return window.__b25RequestRenderCount'));
  ok('renameSection обновляет label локально',
    evl(`return document.querySelector('.section-card[data-id="1"] .section-label').textContent`) === 'Middle'
      && evl(`return document.querySelector('.section-card[data-id="1"] .section-label').classList.contains('custom')`));
  restoreRenderCounter();

  resetRenderCounter();
  evl(`changeSectionType(1, 'Chorus'); return 0`);
  ok('changeSectionType не вызывает полный requestRender',
    evl('return window.__b25RequestRenderCount') === 0,
    evl('return window.__b25RequestRenderCount'));
  ok('changeSectionType обновляет label локально',
    evl(`return document.querySelector('.section-card[data-id="1"] .section-label').textContent`) === 'Припев'
      && evl(`return document.querySelector('.section-card[data-id="1"] .section-label').classList.contains('chorus')`));
  restoreRenderCounter();

  resetRenderCounter();
  evl(`setSectionKey(1, 'G'); return 0`);
  ok('setSectionKey не вызывает полный requestRender',
    evl('return window.__b25RequestRenderCount') === 0,
    evl('return window.__b25RequestRenderCount'));
  ok('setSectionKey обновляет бейдж модуляции локально',
    evl(`return !!document.querySelector('.section-card[data-id="1"] .section-badge--key')
      && document.querySelector('.section-card[data-id="1"] .section-badge--key').title === 'Тональность секции: G'`));
  restoreRenderCounter();

  scene();
  resetRenderCounter();
  evl(`setSectionTimeSig(1, '3/4'); return 0`);
  ok('setSectionTimeSig не вызывает полный requestRender',
    evl('return window.__b25RequestRenderCount') === 0,
    evl('return window.__b25RequestRenderCount'));
  ok('setSectionTimeSig обновляет header и squares-list локально',
    evl('return window.__b25IncrementalSectionHeaderSyncCount') >= 1
      && evl('return window.__b25IncrementalSectionSquaresRenderCount') >= 1,
    evl(`return JSON.stringify({h: window.__b25IncrementalSectionHeaderSyncCount, s: window.__b25IncrementalSectionSquaresRenderCount})`));
  ok('setSectionTimeSig показывает бейдж размера секции',
    evl(`return !!document.querySelector('.section-card[data-id="1"] .section-badge--timesig')
      && document.querySelector('.section-card[data-id="1"] .section-badge--timesig').textContent === '3/4'`));
  restoreRenderCounter();

  console.log(bad ? `\nFAIL: ${bad}` : '\nвсе проверки ok');
  process.exit(bad ? 1 : 0);
});

// B-15 regression: exercise the boundary through DOM hit-testing, not by
// calling handle.onpointerdown directly. jsdom has no layout engine, so this
// test supplies the same rects a browser would expose and implements the
// smallest elementFromPoint hit-test needed to model the real pointer target:
// the 2px grid gap belongs to the preceding .resize-handle hit area.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM(fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8'), {
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
const ok = (name, condition, extra) => {
  console.log(`   ${condition ? 'ok  ' : 'FAIL'} ${name}${!condition && extra !== undefined ? ' — ' + extra : ''}`);
  if (!condition) bad++;
};
const evl = (code) => w.eval(`(()=>{ ${code} })()`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ptr = (type, x, y = 36) => new w.MouseEvent(type, {
  bubbles: true,
  cancelable: true,
  clientX: x,
  clientY: y,
});

w.addEventListener('load', async () => {
  const d = w.document;
  const pattern = { mode: 'strum', subdivision: 2, steps: ['D', 'U', 'D', 'U'] };
  const facade = {
    mode: 'strum',
    subdivision: 2,
    steps: ['D', 'U', 'D', 'U', 'D', 'U', 'D', 'U'],
  };

  evl(`
    sections = [{ id: 1, name: 'A', key: 'C', timeSig: null, bpm: 0, squares: [{
      id: 2, timeSig: null, strumPattern: null, customBeats: null,
      events: [
        { chord: 'C', span: 2, timeSig: null, strumPattern: ${JSON.stringify(pattern)} },
        { chord: 'G', span: 2, timeSig: null, strumPattern: null }
      ]
    }]}];
    sections[0].strumPattern = ${JSON.stringify(facade)};
    if (!songRhythmRolls) resetRhythmStorage();
    for (const key of [...songRhythmRolls.refs.keys()]) {
      if (key.startsWith('1:2:')) songRhythmRolls.refs.delete(key);
    }
    songRhythmRolls.sectionRolls.delete(1);
    ensureSquareRhythmRefs(sections[0], sections[0].squares[0]);
    setSectionRhythmRoll(sections[0], sections[0].strumPattern);
    render();
    return 0;
  `);

  const inner = d.querySelector('.square-inner');
  const wrappers = [...d.querySelectorAll('.chord-wrapper')];
  const handle = d.querySelector('.chord-wrapper[data-ei="0"] .resize-handle');
  ok('две ячейки и их внутренняя ручка существуют', !!inner && wrappers.length === 2 && !!handle);

  // Geometry: wrapper 0 ends at x=200, the 2px grid gap is x=200..202,
  // wrapper 1 starts at x=202. The widened handle must own the boundary gap.
  const rect = (left, top, width, height) => ({
    left, top, width, height, right: left + width, bottom: top + height,
    x: left, y: top,
  });
  inner.getBoundingClientRect = () => rect(0, 0, 400, 72);
  wrappers[0].getBoundingClientRect = () => rect(0, 0, 200, 72);
  wrappers[1].getBoundingClientRect = () => rect(202, 0, 198, 72);
  handle.getBoundingClientRect = () => rect(190, 0, 12, 72);

  // This is deliberately a target lookup followed by a normal DOM dispatch.
  // No handler property is called by the test.
  d.elementFromPoint = (x, y) => {
    const hr = handle.getBoundingClientRect();
    return x >= hr.left && x <= hr.right && y >= hr.top && y <= hr.bottom
      ? handle
      : inner;
  };
  const boundaryX = 201; // the visible 2px inter-cell gap
  const hit = d.elementFromPoint(boundaryX, 36);
  ok('реальный hit-test границы возвращает именно .resize-handle',
    hit === handle && hit.classList.contains('resize-handle'),
    hit && hit.className);

  const beforeSpans = evl('return JSON.stringify(sections[0].squares[0].events.map((e) => e.span))');
  const beforeRef = evl("return songRhythmRolls.refs.has('1:2:0')");
  hit.dispatchEvent(ptr('pointerdown', boundaryX));
  ok('нативный DOM pointerdown запускает подсказку',
    !!d.querySelector('.square-inner .rhythm-hints'));
  ok('кастомный бой остаётся в подсказке',
    d.querySelectorAll('.square-inner .rhythm-hint')[0]?.querySelectorAll('.rhythm-hint-hit').length === 4);

  // Release at the same coordinate: this is the no-op click contract.
  d.dispatchEvent(ptr('pointerup', boundaryX));
  await sleep(700);
  const afterSpans = evl('return JSON.stringify(sections[0].squares[0].events.map((e) => e.span))');
  const afterRef = evl("return songRhythmRolls.refs.has('1:2:0')");
  const preview = d.querySelector('.chord-wrapper[data-ei="0"] .event-strum-preview');
  ok('клик без сдвига не меняет модель', afterSpans === beforeSpans, `${beforeSpans} -> ${afterSpans}`);
  ok('клик без сдвига не демотирует кастомный ref', beforeRef && afterRef);
  ok('после reverse flight custom mini-preview возвращён',
    !!preview && preview.classList.contains('has-pattern'));

  console.log(bad ? `\nПРОВАЛОВ: ${bad}` : '\nвсе проверки ok');
  if (bad) process.exitCode = 1;
});

// B-15/B-30 regression on the user's actual song «Дешевые Драмы».
// Its rhythm is custom at section level, while the second square contains
// partial inherited slices in the mini-preview. Those visible slices must
// now use the same per-hit reverse flight as a pinned cell rhythm.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
const song = JSON.parse(fs.readFileSync(
  __dirname + '/../../uploads/Дешевые Драмы.struchord.json',
  'utf8'
));
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(w) {
    w.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }),
      clearRect(){}, beginPath(){}, arc(){}, fill(){}, stroke(){}, moveTo(){},
      lineTo(){}, closePath(){}, save(){}, restore(){}, translate(){}, rotate(){},
      fillText(){}, strokeText(){}, setTransform(){}, scale(){},
      createLinearGradient: () => ({ addColorStop(){} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {} };
};
let bad = 0;
const ok = (name, condition, extra) => {
  console.log(`   ${condition ? 'ok  ' : 'FAIL'} ${name}${!condition && extra ? ' — ' + extra : ''}`);
  if (!condition) bad++;
};
const ptr = (type, x) => new w.MouseEvent(type, {
  bubbles: true, cancelable: true, clientX: x, clientY: 36,
});
const rect = (left, top, width, height) => ({
  left, top, width, height, right: left + width, bottom: top + height,
  x: left, y: top,
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

w.addEventListener('load', async () => {
  const d = w.document;
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
  await sleep(300);

  const inner = d.querySelector('.square[data-square="3"] .square-inner');
  const wrappers = [...inner.querySelectorAll(':scope > .chord-wrapper')];
  const handle = wrappers[0].querySelector('.resize-handle');
  ok('загружен второй квадрат песни с шестью ячейками', wrappers.length === 6 && !!handle);
  ok('бой песни — секционный, ячеечных refs нет',
    w.eval('sections[0].strumPattern.subdivision') === 3
      && w.eval('songRhythmRolls.refs.size') === 0);

  // Give jsdom browser-like geometry for the exact second-square layout.
  inner.getBoundingClientRect = () => rect(0, 0, 600, 72);
  let left = 0;
  wrappers.forEach((wrapper, ei) => {
    const span = [2, 2, 1.75, 2.25, 4, 4][ei];
    const width = span / 16 * 600;
    const start = left;
    wrapper.getBoundingClientRect = () => rect(start, 0, width, 72);
    const preview = wrapper.querySelector('.event-strum-preview');
    preview.getBoundingClientRect = () => rect(start, 0, width, 20);
    const steps = [...preview.querySelectorAll('.strum-step')];
    steps.forEach((step, j) => {
      step.getBoundingClientRect = () => rect(
        start + ((j + 0.5) / Math.max(1, steps.length)) * width,
        8, 8, 10
      );
    });
    left += width;
  });
  // The handle lies on the F|E boundary (the first two partial slices).
  handle.getBoundingClientRect = () => rect(74, 0, 12, 72);

  const previews = wrappers.map((wrapper) => wrapper.querySelector('.event-strum-preview'));
  ok('первые четыре ячейки показывают фактические неполные срезы',
    previews.slice(0, 4).every((box) => box.classList.contains('has-pattern'))
      && previews.slice(0, 4).every((box) => box.classList.contains('is-inherited-slice')));
  ok('две последние ячейки полного повтора остаются без лишнего preview',
    previews.slice(4).every((box) => !box.classList.contains('has-pattern')));

  const beforeSpans = w.eval('JSON.stringify(sections[0].squares[1].events.map((e) => e.span))');
  handle.dispatchEvent(ptr('pointerdown', 80));
  const entries = w.eval('rhythmHintSession.entries.map((entry) => entry.custom)');
  ok('видимый inherited slice считается FLIP-ритмом только на время подсказки',
    JSON.stringify(entries) === '[true,true,true,true,false,false]', JSON.stringify(entries));
  const overlay = d.querySelector('.square-inner .rhythm-hints');
  const overlayHints = overlay ? [...overlay.querySelectorAll('.rhythm-hint')] : [];
  // Supply current overlay hit rects before pointerup so exit deltas are
  // measured exactly as they would be in a laid-out browser.
  overlayHints.forEach((hint, hi) => {
    [...hint.querySelectorAll('.rhythm-hint-hit')].forEach((hit, j) => {
      hit.getBoundingClientRect = () => rect(100 + hi * 70 + j * 4, 40, 8, 10);
    });
  });
  ok('pointerdown создаёт overlay с ритмом над счётом',
    !!overlay && overlayHints[0]?.querySelectorAll('.rhythm-hint-hit').length === 6);

  // No movement: the model must stay untouched, but all previews that are
  // actually visible in the song must return by per-hit reverse flight.
  d.dispatchEvent(ptr('pointerup', 80));
  await sleep(40);
  const ghost = d.querySelector('body > .rhythm-hints');
  const ghostHints = ghost ? [...ghost.querySelectorAll('.rhythm-hint')] : [];
  const sliceHits = ghostHints.slice(0, 4)
    .flatMap((hint) => [...hint.querySelectorAll('.rhythm-hint-hit')]);
  ok('частичные срезы получают reverse flight в mini-preview',
    sliceHits.length > 0 && sliceHits.every((hit) =>
      hit.dataset.rhythmTargetTransform && hit.style.transform.includes('translate(')));
  ok('полный наследник остаётся fade-only без flight',
    ghostHints.slice(4).every((hint) =>
      !hint.querySelector('.rhythm-hint-hit')?.dataset.rhythmTargetTransform
      && !hint.style.transform.includes('translateY(')));
  ok('клик без движения не меняет spans и не создаёт refs',
    w.eval('JSON.stringify(sections[0].squares[1].events.map((e) => e.span))') === beforeSpans
      && w.eval('songRhythmRolls.refs.size') === 0);

  console.log(bad ? `FAIL: ${bad}` : 'ALL OK');
  process.exit(bad ? 1 : 0);
});

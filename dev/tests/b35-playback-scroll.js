// B-35 (0.147): авто-скролл «как в Guitar Pro» — виден играющий КВАДРАТ
// и следующий (в т.ч. первый квадрат следующей секции). Без подсветки.
// jsdom без раскладки: геометрия мокается (rect'ы, clientWidth,
// scrollLeft/scrollWidth), ловим цели scrollTo/scrollIntoView.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(win) {
    win.HTMLCanvasElement.prototype.getContext = () => ({
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
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x ? ' — ' + x : ''}`); if (!c) bad++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

w.addEventListener('load', async () => {
  const d = w.document;
  const song = {
    schemaVersion: 2, name: 'B-35', bpm: 100,
    globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4', notes: '',
    sections: [
      { id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
        squares: [
          { id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
            { chord: 'Am', span: 4, timeSig: null, strumPattern: null }] },
          { id: 3, repeat: 1, customBeats: null, strumPattern: null, events: [
            { chord: 'F', span: 4, timeSig: null, strumPattern: null }] },
        ]},
      { id: 4, type: 'Chorus', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
        squares: [
          { id: 5, repeat: 1, customBeats: null, strumPattern: null, events: [
            { chord: 'C', span: 4, timeSig: null, strumPattern: null }] },
          { id: 6, repeat: 1, customBeats: null, strumPattern: null, events: [
            { chord: 'G', span: 4, timeSig: null, strumPattern: null }] },
        ]},
    ],
    nextId: 10, userFingerings: [], preferredFingerings: [], date: '',
  };
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
  await sleep(300);

  // --- Мок-геометрия: КОЛОНКА (0.149). Квадраты друг под другом ---
  // (высота строки 74). Вьюпорты 500px, контент 1400 (для широких).
  // секция1: sq2 top 1000 (ширина 400), sq3 top 1074 (ширина 900 —
  // широкий, ячейка далеко справа); секция2: sq5 top 1300, sq6 top 1374.
  const TOPS = { 2: 1000, 3: 1074, 5: 1300, 6: 1374 };
  const WIDTHS = { 2: 400, 3: 900, 5: 400, 6: 400 };
  // Ячейки внутри квадрата: top = sqTop+40, высота 40; по X: [100..300]
  // от начала квадрата, кроме sq3 — [600..800] (проверка приоритета).
  const CELLX = { 2: [100, 300], 3: [600, 800], 5: [100, 300], 6: [100, 300] };
  const squares = {};
  for (const el of d.querySelectorAll('.square')) squares[el.dataset.square] = el;
  const vps = [...d.querySelectorAll('.squares-viewport')];
  const vp1 = vps[0], vp2 = vps[1];
  const state = { scroll: { vp1: 0, vp2: 0, page: 0 }, scrollTo: [], pageTo: [] };
  Object.defineProperty(d.documentElement, 'scrollHeight', { get: () => 2000, configurable: true });
  Object.defineProperty(w, 'innerHeight', { get: () => 500, configurable: true });
  Object.defineProperty(w, 'scrollY', { get: () => state.scroll.page, configurable: true });
  w.scrollTo = (o) => { state.pageTo.push(Math.round(o.top)); state.scroll.page = o.top; };
  const bar = d.querySelector('.transport-bar');
  if (bar) bar.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 40, right: 500, bottom: 40 });
  for (const [vp, key] of [[vp1, 'vp1'], [vp2, 'vp2']]) {
    vp.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 200, right: 500, bottom: 200 });
    Object.defineProperty(vp, 'clientWidth', { get: () => 500, configurable: true });
    Object.defineProperty(vp, 'scrollWidth', { get: () => 1400, configurable: true });
    Object.defineProperty(vp, 'scrollLeft', {
      get: () => state.scroll[key], set: (v) => { state.scroll[key] = v; }, configurable: true,
    });
    vp.scrollTo = (o) => { state.scrollTo.push({ key, left: Math.round(o.left) }); state.scroll[key] = o.left; };
  }
  const vpOf = (id) => (id === '2' || id === '3') ? 'vp1' : 'vp2';
  for (const id of Object.keys(TOPS)) {
    const el = squares[id];
    el.getBoundingClientRect = () => {
      const vkey = vpOf(id);
      return { left: 0 - state.scroll[vkey], top: TOPS[id] - state.scroll.page,
        width: WIDTHS[id], height: 74, right: WIDTHS[id] - state.scroll[vkey], bottom: TOPS[id] + 74 - state.scroll.page };
    };
  }
  for (const el of d.querySelectorAll('.chord-wrapper')) {
    const id = el.closest('.square').dataset.square;
    el.getBoundingClientRect = () => {
      const base = squares[id].getBoundingClientRect();
      return { left: base.left + CELLX[id][0], top: base.top + 40, width: CELLX[id][1] - CELLX[id][0],
        height: 40, right: base.left + CELLX[id][1], bottom: base.top + 80 };
    };
  }

  console.log('=== 1. Колонка: ячейка + следующий квадрат ниже ===');
  {
    // ячейка sq2 [1040..1080] → [596..976]; след. sq3 [1074..1148] → [664..1010];
    // пересечение [664..976]: с page 0 → цель 664 — видно ОБОИХ.
    state.scroll.page = 0; state.scrollTo = []; state.pageTo = [];
    w.eval('ensurePlaybackSquaresVisible(document.querySelector(\'.square[data-square="2"] .chord-wrapper\'))');
    ok('вертикаль: одна цель 664 показывает ячейку И следующий квадрат',
      state.pageTo.length === 1 && state.pageTo[0] === 664, JSON.stringify(state.pageTo));
    ok('квадрат sq2 (400px) уже виден при vp=0 — горизонт не трогаем',
      !state.scrollTo.some((s) => s.key === 'vp1'), JSON.stringify(state.scrollTo));
  }

  console.log('=== 2. Уже видно — никаких скроллов ===');
  {
    // ячейка sq6 [1414..1454] видна при page 1000 (диапазон [970..1350]);
    // следующего нет — полная тишина.
    state.scroll.page = 1000; state.scroll.vp2 = 0; state.scrollTo = []; state.pageTo = [];
    w.eval('ensurePlaybackSquaresVisible(document.querySelector(\'.square[data-square="6"] .chord-wrapper\'))');
    ok('ни горизонтального, ни вертикального скролла',
      state.scrollTo.length === 0 && state.pageTo.length === 0,
      JSON.stringify({ scrollTo: state.scrollTo, pageTo: state.pageTo }));
  }

  console.log('=== 3. Широкий квадрат: приоритет играющей ЯЧЕЙКИ ===');
  {
    // sq3 ширина 900 (+48 > 500 — не влезает), ячейка [600..800] в контенте.
    state.scroll.page = 950; state.scroll.vp1 = 0; state.scrollTo = []; state.pageTo = [];
    w.eval('ensurePlaybackSquaresVisible(document.querySelector(\'.square[data-square="3"] .chord-wrapper\'))');
    // [600..800] вне окна [0..500] → правая цель 800-500+24=324.
    ok('горизонт: скролл к ячейке (324), не к началу квадрата',
      state.scrollTo.some((s) => s.key === 'vp1' && s.left === 324), JSON.stringify(state.scrollTo));
  }

  console.log('=== 4. Вырожденный рект следующего — без прыжков ===');
  {
    state.scroll.page = 950; state.scrollTo = []; state.pageTo = [];
    const orig = squares[5].getBoundingClientRect.bind(squares[5]);
    squares[5].getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 });
    w.eval('ensurePlaybackSquaresVisible(document.querySelector(\'.square[data-square="3"] .chord-wrapper\'))');
    ok('ноль-рект следующего: страница не прыгает', state.pageTo.length === 0, JSON.stringify(state.pageTo));
    squares[5].getBoundingClientRect = orig;
  }

  console.log('=== 5. Кросс-секция: следующий квадрат в другой секции ===');
  {
    // ячейка sq5 [1340..1380] → [896..1276]; след. sq6 [1374..1448] → [930..1310];
    // пересечение [964..1276]; page 0 → цель 964; горизонт sq6 [0..400] уже виден.
    state.scroll.page = 0; state.scroll.vp1 = 0; state.scroll.vp2 = 0; state.scrollTo = []; state.pageTo = [];
    w.eval('ensurePlaybackSquaresVisible(document.querySelector(\'.square[data-square="5"] .chord-wrapper\'))');
    ok('вертикаль к 964 (оба в кадре)', state.pageTo.length === 1 && state.pageTo[0] === 964,
      JSON.stringify(state.pageTo));
    ok('горизонт секции 2 уже в нуле — без скролла',
      !state.scrollTo.some((s) => s.key === 'vp2'), JSON.stringify(state.scrollTo));
  }

  console.log('=== 6. Статически: в хелпере нет scrollIntoView ===');
  {
    const app = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
    const fn = app.slice(app.indexOf('function ensurePlaybackSquaresVisible'), app.indexOf('function findNextEvent'));
    ok('в ensurePlaybackSquaresVisible нет scrollIntoView', !fn.includes('.scrollIntoView('));
    ok('вызов в планировщике', app.includes('if (!timelineMode) ensurePlaybackSquaresVisible(newWrapper);'));
  }

  console.log(bad ? `FAIL: ${bad}` : 'ALL OK');
  w.close();
  process.exit(bad ? 1 : 0);
});

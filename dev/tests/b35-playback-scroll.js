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

  // --- Мок-геометрия ---
  // Вьюпорты: 500px шириной, контент 1400px. Квадраты по 400px в потоке:
  // секция1: sq1 [0..400], sq2 [400..800]; секция2: sq3 [0..400], sq4 [400..800].
  const GEO = { 2: [0, 400], 3: [400, 800], 5: [0, 400], 6: [400, 800] };
  const squares = {};
  for (const el of d.querySelectorAll('.square')) squares[el.dataset.square] = el;
  const vps = [...d.querySelectorAll('.squares-viewport')];
  const vp1 = vps[0], vp2 = vps[1];
  const state = {
    scroll: { vp1: 0, vp2: 0 },
    intoView: [],
    scrollTo: [],
  };
  for (const [vp, key] of [[vp1, 'vp1'], [vp2, 'vp2']]) {
    vp.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 200, right: 500, bottom: 200 });
    Object.defineProperty(vp, 'clientWidth', { get: () => 500, configurable: true });
    Object.defineProperty(vp, 'scrollWidth', { get: () => 1400, configurable: true });
    Object.defineProperty(vp, 'scrollLeft', {
      get: () => state.scroll[key],
      set: (v) => { state.scroll[key] = v; },
      configurable: true,
    });
    vp.scrollTo = (o) => { state.scrollTo.push({ key, left: Math.round(o.left) }); state.scroll[key] = o.left; };
  }
  for (const [id, [l, r]] of Object.entries(GEO)) {
    const el = squares[id];
    el.getBoundingClientRect = () => ({ left: l - state.scroll[el.closest('.squares-viewport') === vp1 ? 'vp1' : 'vp2'],
      top: 10, width: r - l, height: 120, right: r, bottom: 130 });
  }
  for (const el of d.querySelectorAll('.chord-wrapper')) {
    el.scrollIntoView = () => { state.intoView.push(el.closest('.square').dataset.square); };
  }
  squares[5].scrollIntoView = squares[6].scrollIntoView = () => { state.intoView.push('sec2'); };

  console.log('=== 1. Следующий квадрат в той же секции (за краем) ===');
  {
    state.scroll.vp1 = 400; // окно [400..900]: текущий кв.2 [0..400] вне окна слева
    state.scrollTo = [];
    w.eval('ensurePlaybackSquaresVisible(document.querySelector(\'.square[data-square="2"] .chord-wrapper\'))');
    // виден [0..800], окно 500 → не влезает: текущий слева (0-24→0), след. обрезан
    ok('скролл к 0 (текущий слева, следующий виден частично)',
      state.scrollTo.length === 1 && state.scrollTo[0].key === 'vp1' && state.scrollTo[0].left === 0,
      JSON.stringify(state.scrollTo));
  }

  console.log('=== 2. Диапазон уже виден — скролла нет ===');
  {
    state.scroll.vp1 = 0; state.scrollTo = [];
    // квадрат 2 занимает [0..400] — виден целиком; квадрат 3 начнём с 380: диапазон [0..780] не влезает...
    // Проще: сдвинем окно так, чтобы [400..800] (кв.3 как текущий) и [0..400]... берём текущим кв.3, след. нет в секции.
    state.scroll.vp1 = 320; // окно [320..820]: кв.3 [400..800] виден целиком
    w.eval('ensurePlaybackSquaresVisible(document.querySelector(\'.square[data-square="3"] .chord-wrapper\'))');
    ok('текущий виден — горизонтального скролла нет', state.scrollTo.length === 0, JSON.stringify(state.scrollTo));
  }

  console.log('=== 3. Последний квадрат секции → первый квадрат следующей ===');
  {
    state.scrollTo = []; state.intoView = [];
    w.eval('ensurePlaybackSquaresVisible(document.querySelector(\'.square[data-square="3"] .chord-wrapper\'))');
    // кв.3 [400..800] при scroll 320 виден; след. — кв.5 секции 2: вертикаль + свой горизонт
    ok('вертикальный показ секции 2 (scrollIntoView)', state.intoView.includes('sec2'), JSON.stringify(state.intoView));
    ok('горизонталь секции 2: кв.5 [0..400] при scroll 0 уже виден — без скролла',
      !state.scrollTo.some((s) => s.key === 'vp2'), JSON.stringify(state.scrollTo));
  }

  console.log('=== 4. Первый квадрат секции 2 как текущий: след. кв.6 докручивается ===');
  {
    state.scroll.vp2 = 300; // кв.5 [0..400] наполовину за окном слева
    state.scrollTo = [];
    w.eval('ensurePlaybackSquaresVisible(document.querySelector(\'.square[data-square="5"] .chord-wrapper\'))');
    // [0..800] в окно 500 не влезает: текущий слева → 0-24 → 0
    ok('скролл vp2 к 0 (текущий слева, кв.6 частично справа)',
      state.scrollTo.some((s) => s.key === 'vp2' && s.left === 0), JSON.stringify(state.scrollTo));
  }

  console.log('=== 5. Планировщик зовёт хелпер (статически) ===');
  {
    const app = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
    ok('вызов в планировщике', app.includes('if (!timelineMode) ensurePlaybackSquaresVisible(newWrapper);'));
    ok('playbackNextSquareEl: сосед → следующая секция',
      app.includes('function playbackNextSquareEl') && app.includes("nc.querySelector('.square')"));
  }

  console.log(bad ? `FAIL: ${bad}` : 'ALL OK');
  w.close();
  process.exit(bad ? 1 : 0);
});

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

  // --- Мок-геометрия (0.148: ручной скролл, scrollIntoView больше нет) ---
  // Вьюпорты: 500px окно, контент 1400px. Квадраты по 400px:
  // секция1: sq2 [0..400], sq3 [400..800]; секция2: sq5 [0..400], sq6 [400..800].
  const GEO = { 2: [0, 400], 3: [400, 800], 5: [0, 400], 6: [400, 800] };
  const squares = {};
  for (const el of d.querySelectorAll('.square')) squares[el.dataset.square] = el;
  const vps = [...d.querySelectorAll('.squares-viewport')];
  const vp1 = vps[0], vp2 = vps[1];
  const state = { scroll: { vp1: 0, vp2: 0, page: 0 }, scrollTo: [], pageTo: [] };
  Object.defineProperty(d.documentElement, 'scrollHeight', { get: () => 2000, configurable: true });
  // Окно страницы: 500px высоты, документ 1600px.
  Object.defineProperty(w, 'innerHeight', { get: () => 500, configurable: true });
  Object.defineProperty(w, 'scrollY', { get: () => state.scroll.page, configurable: true });
  w.scrollTo = (o) => { state.pageTo.push(Math.round(o.top)); state.scroll.page = o.top; };
  const bar = d.querySelector('.transport-bar');
  if (bar) bar.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 40, right: 500, bottom: 40 });
  // Вертикальные ректы квадратов: секция 1 на y=100, секция 2 на y=1000.
  const TOPS = { sec1: 1000, sec2: 1300 }; // секции рядом: в окно 500 влезают ячейка+кв.след.секции
  for (const [vp, key] of [[vp1, 'vp1'], [vp2, 'vp2']]) {
    vp.getBoundingClientRect = () => ({ left: 0, top: key === 'vp1' ? 150 : 1050, width: 500, height: 200, right: 500, bottom: 350 });
    Object.defineProperty(vp, 'clientWidth', { get: () => 500, configurable: true });
    Object.defineProperty(vp, 'scrollWidth', { get: () => 1400, configurable: true });
    Object.defineProperty(vp, 'scrollLeft', {
      get: () => state.scroll[key], set: (v) => { state.scroll[key] = v; }, configurable: true,
    });
    vp.scrollTo = (o) => { state.scrollTo.push({ key, left: Math.round(o.left) }); state.scroll[key] = o.left; };
  }
  const secOf = (id) => (id === '2' || id === '3') ? 'sec1' : 'sec2';
  for (const [id, [l, r]] of Object.entries(GEO)) {
    const el = squares[id];
    const vkey = secOf(id) === 'sec1' ? 'vp1' : 'vp2';
    el.getBoundingClientRect = () => {
      const top = TOPS[secOf(id)] - state.scroll.page;
      return { left: l - state.scroll[vkey], top, width: r - l, height: 120, right: r - state.scroll[vkey], bottom: top + 120 };
    };
  }
  // Ячейки: по центру своего квадрата (top квадрата + 40).
  for (const el of d.querySelectorAll('.chord-wrapper')) {
    const sqEl = el.closest('.square');
    const id = sqEl.dataset.square;
    el.getBoundingClientRect = () => {
      const base = squares[id].getBoundingClientRect();
      return { left: base.left + 100, top: base.top + 40, width: 200, height: 40, right: base.left + 300, bottom: base.top + 80 };
    };
  }

  console.log('=== 1. Следующий квадрат в той же секции (за краем) ===');
  {
    state.scroll.vp1 = 400; state.scroll.page = 800; state.scrollTo = []; state.pageTo = [];
    // ячейка кв.2: top 140 (квадрат 100+40), окно 500, панель 64 → видна.
    w.eval('ensurePlaybackSquaresVisible(document.querySelector(\'.square[data-square="2"] .chord-wrapper\'))');
    ok('горизонталь: скролл к 0 (текущий слева, следующий частично)',
      state.scrollTo.length === 1 && state.scrollTo[0].key === 'vp1' && state.scrollTo[0].left === 0,
      JSON.stringify(state.scrollTo));
    ok('вертикаль: ячейка видна — окно не трогаем', state.pageTo.length === 0, JSON.stringify(state.pageTo));
  }

  console.log('=== 2. Уже видно — никаких скроллов ===');
  {
    // кв.6 — последний в секции 2 (следующего нет): кв.6 [400..800] при
    // vp2=320 виден целиком, ячейка при page=640 в окне по вертикали.
    state.scroll.vp2 = 320; state.scroll.page = 1200; state.scrollTo = []; state.pageTo = [];
    w.eval('ensurePlaybackSquaresVisible(document.querySelector(\'.square[data-square="6"] .chord-wrapper\'))');
    ok('ни горизонтального, ни вертикального скролла',
      state.scrollTo.length === 0 && state.pageTo.length === 0,
      JSON.stringify({ scrollTo: state.scrollTo, pageTo: state.pageTo }));
  }

  console.log('=== 3. Граница секций: следующая секция ниже окна ===');
  {
    state.scroll.page = 0; state.scroll.vp1 = 0; state.scroll.vp2 = 0; state.scrollTo = []; state.pageTo = [];
    // Ячейка кв.3 [1140..1180] → диапазон [696..1076]; кв.5 [1300..1420] → [936..1236];
    // пересечение [936..1076]: при скролле 936 окно [936..1436] видит ОБОИХ.
    w.eval('ensurePlaybackSquaresVisible(document.querySelector(\'.square[data-square="3"] .chord-wrapper\'))');
    ok('вертикаль: одна цель показывает ячейку И кв.5 (936)', state.pageTo.length === 1 && state.pageTo[0] === 936,
      JSON.stringify(state.pageTo));
    ok('горизонталь секции 2: кв.5 [0..400] уже в окне — без скролла',
      !state.scrollTo.some((s) => s.key === 'vp2'), JSON.stringify(state.scrollTo));
  }

  console.log('=== 4. Вырожденный рект (content-visibility) — без прыжков ===');
  {
    state.scroll.page = 936; state.pageTo = []; state.scrollTo = [];
    // Ячейка кв.3 видна в окне [936..1436], следующая секция «ноль-рект» — пропускается.
    const orig = squares[5].getBoundingClientRect.bind(squares[5]);
    squares[5].getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 });
    w.eval('ensurePlaybackSquaresVisible(document.querySelector(\'.square[data-square="3"] .chord-wrapper\'))');
    ok('нулевой рект следующего: страница НЕ прыгает (в т.ч. не к верху)',
      state.pageTo.length === 0, JSON.stringify(state.pageTo));
    squares[5].getBoundingClientRect = orig;
  }

  console.log('=== 5. Ячейка над верхней границей — минимальный скролл, не в верх ===');
  {
    state.scroll.page = 1200; state.pageTo = [];
    // Ячейка кв.2 [1040..1080] → диапазон [596..976]; при 1200 ближайшая
    // точка = 976: минимальный подъём, НЕ к верху страницы.
    w.eval('ensurePlaybackSquaresVisible(document.querySelector(\'.square[data-square="2"] .chord-wrapper\'))');
    ok('цель 976 — минимальный подъём, не к верху', state.pageTo.length === 1 && state.pageTo[0] === 976,
      JSON.stringify(state.pageTo));
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

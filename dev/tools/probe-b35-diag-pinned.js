// Диагност B-35 «воспроизведение при закреплённой аппликатуре».
// Песня: 2 секции × 4 однокордовых квадрата, 4/4@160, зум 2×.
// Закрепляем первый аккорд программно, играем и на КАЖДОЙ смене ячейки
// пишем в один лог: скролл-цели, --pinned-shift (padding-top сетки),
// высоту закреплённого ряда, позицию ряда и ячейки, пересечение ячейки
// с рядом. Единая шкала времени от t0.
const path = require('path');
const puppeteer = require(path.join(__dirname, '../../node_modules/puppeteer'));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/tmp/chrome/chrome',
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chromelibs/lib' },
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,700', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 500 });
  await page.evaluateOnNewDocument(() => {
    const CH = ['Am', 'F', 'C', 'G', 'Dm', 'E7', 'A7', 'Bdim'];
    const sections = [];
    let id = 2;
    for (let s = 0; s < 2; s++) {
      const squares = [];
      for (let q = 0; q < 4; q++) {
        squares.push({ id: id++, repeat: 1, customBeats: null, strumPattern: null,
          events: [{ chord: CH[(s * 4 + q) % CH.length], span: 4, timeSig: null, strumPattern: null }] });
      }
      sections.push({ id: 100 + s, type: s % 2 ? 'Chorus' : 'Verse', customName: null, key: null,
        shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null, squares });
    }
    const song = { schemaVersion: 2, name: 'B-35 pinned', bpm: 160,
      globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4', notes: '',
      sections, nextId: 200, userFingerings: [], preferredFingerings: [], date: '' };
    try { localStorage.setItem('struchord_songs', JSON.stringify([song])); } catch (e) {}
  });
  await page.goto('file://' + path.join(__dirname, '../../STRUCHORD.html'), { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 900));
  await page.evaluate(() => loadSong(0));
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(() => setSquareZoom(2.0, true));
  await new Promise((r) => setTimeout(r, 400));

  // Закрепляем аппликатуру первой ячейки (как drag в док, минуя жест).
  const pinned = await page.evaluate(() => {
    pinnedFingering = { secId: 101, squareId: 2, eventIndex: 0, chord: 'Am', shape: null };
    renderPinnedFingering();
    renderPinnedNext(findNextChordAfter(101, 2, 0));
    return {
      hasClass: document.body.classList.contains('has-pinned-fingering'),
      shift: document.getElementById('sectionsContainer').style.getPropertyValue('--pinned-shift'),
      rowH: document.getElementById('pinnedRow').offsetHeight,
      nextShown: document.getElementById('pinnedNext').style.display,
    };
  });
  console.log('pin:', JSON.stringify(pinned));
  await new Promise((r) => setTimeout(r, 400)); // дождаться transition padding-top

  await page.evaluate(() => {
    window.__t0 = performance.now();
    window.__win = [];
    const orig = window.scrollTo.bind(window);
    window.scrollTo = function (...a) {
      const to = a[0] && typeof a[0] === 'object' ? a[0].top : a[1];
      window.__win.push({ t: Math.round(performance.now() - window.__t0), to: Math.round(to) });
      return orig(...a);
    };
  });

  await page.evaluate(() => playAll());
  const data = await page.evaluate(async () => {
    const log = [];
    let lastSq = null;
    while (performance.now() - window.__t0 < 12500) {
      const t = Math.round(performance.now() - window.__t0);
      const active = document.querySelector('.chord-wrapper.playback-active');
      if (active) {
        const sqEl = active.closest('.square');
        const sqId = sqEl && sqEl.dataset.square;
        if (sqId !== lastSq) {
          lastSq = sqId;
          const grid = document.getElementById('sectionsContainer');
          const row = document.getElementById('pinnedRow');
          const bar = document.querySelector('.transport-bar');
          const ar = active.getBoundingClientRect();
          const rr = row.getBoundingClientRect();
          const br = bar.getBoundingClientRect();
          log.push({
            t, sqId,
            scrollY: Math.round(window.scrollY),
            shift: grid.style.getPropertyValue('--pinned-shift') || getComputedStyle(grid).paddingTop,
            rowH: row.offsetHeight,
            rowTop: Math.round(rr.top), rowBottom: Math.round(rr.bottom),
            barBottom: Math.round(br.bottom),
            cellTop: Math.round(ar.top), cellBottom: Math.round(ar.bottom),
            cellBehindRow: ar.top < rr.bottom && ar.bottom > rr.top,
            pinnedChord: document.querySelector('#pinnedFingering .fingering-chord-name') &&
              document.querySelector('#pinnedFingering .fingering-chord-name').textContent,
          });
        }
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return { log, win: window.__win };
  });
  await page.evaluate(() => { try { stopPlayback(); } catch (e) {} });

  console.log('--- смены квадратов (единая шкала, мс):');
  for (const e of data.log) {
    console.log(`t=${String(e.t).padStart(5)} sq${e.sqId} y=${e.scrollY} shift=${e.shift} rowH=${e.rowH} row=[${e.rowTop}..${e.rowBottom}] bar=${e.barBottom} cell=[${e.cellTop}..${e.cellBottom}]${e.cellBehindRow ? ' ЗА РЯДОМ' : ''} chord=${e.pinnedChord}`);
  }
  console.log('--- window.scrollTo:');
  for (const w of data.win) console.log(`t=${String(w.t).padStart(5)} -> ${w.to}`);
  const shifts = new Set(data.log.map((e) => e.shift));
  console.log('--- итог: смен=' + data.log.length, 'скроллов=' + data.win.length,
    'уникальных shift=' + shifts.size, [...shifts].join('|'));
  const behind = data.log.filter((e) => e.cellBehindRow);
  console.log('--- ячеек ЗА закреплённым рядом:', behind.length, behind.map((e) => `sq${e.sqId}@${e.cellTop}`).join(','));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

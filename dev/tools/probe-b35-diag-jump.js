// Диагност B-35 (0.148 → фикс): воспроизводим сценарий пользователя —
// «после скролла с каждой новой ячейкой происходит скачок вверх-вниз;
// следующий квадрат виден не всегда». Ловим виновата с поличным:
// патчим window.scrollTo (цель + стек), пишем траекторию scrollY по
// ячейкам, проверяем видимость следующего квадрата. Окно низкое,
// зум 2× — страница скроллится и по вертикали, и по горизонтали.
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
    // Длинная песня: 4 секции × 4 однокордовых квадрата — высокий ряд
    // страниц и много смен ячеек.
    const CH = ['Am', 'F', 'C', 'G', 'Dm', 'E7', 'A7', 'Bdim'];
    const sections = [];
    let id = 2;
    for (let s = 0; s < 4; s++) {
      const squares = [];
      for (let q = 0; q < 4; q++) {
        squares.push({ id: id++, repeat: 1, customBeats: null, strumPattern: null,
          events: [{ chord: CH[(s * 4 + q) % CH.length], span: 4, timeSig: null, strumPattern: null }] });
      }
      sections.push({ id: 100 + s, type: s % 2 ? 'Chorus' : 'Verse', customName: null, key: null,
        shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null, squares });
    }
    const song = {
      schemaVersion: 2, name: 'diag-long', bpm: 140,
      globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4', notes: '',
      sections, nextId: 200, userFingerings: [], preferredFingerings: [], date: '',
    };
    try { localStorage.setItem('struchord_songs', JSON.stringify([song])); } catch (e) {}
  });
  await page.goto('file://' + path.join(__dirname, '../../STRUCHORD.html'), { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 900));
  await page.evaluate(() => loadSong(0));
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(() => setSquareZoom(2.0, true));
  await new Promise((r) => setTimeout(r, 400));

  // Патч-логер всех scrollTo страницы.
  await page.evaluate(() => {
    window.__scrollLog = [];
    const orig = window.scrollTo.bind(window);
    window.scrollTo = function (...args) {
      const o = args[0];
      const target = o && typeof o === 'object' ? o.top : args[1];
      let stack = '';
      try { stack = (new Error()).stack.split('\n').slice(2, 5).join(' | ').slice(0, 220); } catch (e) {}
      window.__scrollLog.push({ t: Math.round(performance.now()), y: window.scrollY, target, stack });
      return orig(...args);
    };
  });

  await page.evaluate(() => playAll());
  // t≈2.2с: «пользователь проскроллил» — колесо вниз на ~600px.
  await new Promise((r) => setTimeout(r, 5000));
  await page.mouse.move(640, 250);
  await page.mouse.wheel({ deltaY: 800 });
  await new Promise((r) => setTimeout(r, 300));

  const track = await page.evaluate(async () => {
    const out = [];
    let lastCell = null;
    const t0 = performance.now();
    while (performance.now() - t0 < 30000) {
      const active = document.querySelector('.chord-wrapper.playback-active');
      const sqEl = active && active.closest('.square');
      const cellKey = sqEl ? sqEl.dataset.square : (active ? 'x' : '-');
      if (cellKey !== lastCell && active && sqEl) {
        lastCell = cellKey;
        const nextEl = window.playbackNextSquareEl(sqEl);
        let nextVis = null;
        if (nextEl) {
          const nr = nextEl.getBoundingClientRect();
          const nvp = nextEl.closest('.squares-viewport');
          const nvr = nvp.getBoundingClientRect();
          nextVis = {
            id: nextEl.dataset.square,
            leftInVp: Math.round(nr.left - nvr.left),
            w: Math.round(nr.width),
            vpW: Math.round(nvr.width),
            vVis: nr.top < innerHeight && nr.bottom > 80,
          };
        }
        const cr = active.getBoundingClientRect();
        const sr = sqEl.getBoundingClientRect();
        out.push({
          t: Math.round(performance.now() - t0),
          sq: cellKey,
          y: Math.round(window.scrollY),
          cellTopView: Math.round(cr.top),
          rowDocTop: Math.round(sr.top + window.scrollY),
          docH: document.documentElement.scrollHeight,
          barTop: (document.querySelector('.transport-bar') || {}).getBoundingClientRect
            ? Math.round(document.querySelector('.transport-bar').getBoundingClientRect().top)
            : null,
          next: nextVis,
        });
      }
      await new Promise((r) => setTimeout(r, 60));
    }
    return out;
  });
  await page.evaluate(() => { try { stopPlayback(); } catch (e) {} });
  const scrollLog = await page.evaluate(() => window.__scrollLog);

  console.log('=== Траектория по ячейкам (t, квадрат, scrollY, следующий) ===');
  for (const s of track) {
    const n = s.next ? `${s.next.id}(left=${s.next.leftInVp}/${s.next.vpW}, vVis=${s.next.vVis})` : 'нет';
    console.log(`  t=${String(s.t).padEnd(5)} sq=${String(s.sq).padEnd(3)} y=${String(s.y).padEnd(5)} cellTopView=${String(s.cellTopView).padEnd(5)} rowDocTop=${String(s.rowDocTop).padEnd(5)} docH=${String(s.docH).padEnd(6)} barTop=${String(s.barTop).padEnd(5)} next=${n}`);
  }
  console.log('=== window.scrollTo вызовы (t, от, цель, стек) ===');
  for (const l of scrollLog.slice(0, 25)) {
    console.log(`  t=${l.t} y=${Math.round(l.y)} → ${Math.round(l.target)} :: ${l.stack}`);
  }

  // Анализ скачков: смена ячейки → |Δy| и знак.
  let jumps = 0, alternating = 0, prevDelta = 0;
  for (let i = 1; i < track.length; i++) {
    const d = track[i].y - track[i - 1].y;
    if (Math.abs(d) > 40) {
      jumps++;
      if (prevDelta * d < 0) alternating++;
      prevDelta = d;
    }
  }
  console.log(`событий-смен ячеек: ${track.length}, скачков >40px: ${jumps}, смен направления: ${alternating}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

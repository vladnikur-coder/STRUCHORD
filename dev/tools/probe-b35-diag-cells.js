// Диагност B-35 #2: скачки вверх-вниз при смене ЯЧЕЕК (не квадратов).
// Песня с 4 ячейками в квадрате (как в реальных песнях), зум 2.6× —
// квадраты широкие, ячейки меняются каждые ~0.43с. Логируем:
// window.scrollTo, .squares-viewport.scrollTo, HTMLElement.focus
// (всё со стеками) + траекторию scrollY на каждую смену ячейки.
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
    // 3 секции × 3 квадрата × 4 ячейки (по 1 доле) — ячейки меняются часто.
    const CH = ['Am', 'F', 'C', 'G', 'Dm', 'E7', 'A7', 'Bdim', 'Em'];
    const sections = [];
    let id = 2;
    for (let s = 0; s < 3; s++) {
      const squares = [];
      for (let q = 0; q < 3; q++) {
        const events = [];
        for (let c = 0; c < 4; c++) {
          events.push({ chord: CH[(s * 3 + q + c) % CH.length], span: 1, timeSig: null, strumPattern: null });
        }
        squares.push({ id: id++, repeat: 1, customBeats: null, strumPattern: null, events });
      }
      sections.push({ id: 100 + s, type: s % 2 ? 'Chorus' : 'Verse', customName: null, key: null,
        shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null, squares });
    }
    const song = {
      schemaVersion: 2, name: 'diag-cells', bpm: 140,
      globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4', notes: '',
      sections, nextId: 200, userFingerings: [], preferredFingerings: [], date: '',
    };
    try { localStorage.setItem('struchord_songs', JSON.stringify([song])); } catch (e) {}
  });
  await page.goto('file://' + path.join(__dirname, '../../STRUCHORD.html'), { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 900));
  await page.evaluate(() => loadSong(0));
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(() => setSquareZoom(2.6, true));
  await new Promise((r) => setTimeout(r, 400));

  await page.evaluate(() => {
    window.__log = { winScroll: [], vpScroll: [], focus: [], track: [] };
    const shortStack = () => {
      try {
        return (new Error()).stack.split('\n')[2].trim().replace(/^at\s+/, '').slice(0, 90);
      } catch (e) { return '?'; }
    };
    const origWin = window.scrollTo.bind(window);
    window.scrollTo = function (...a) {
      const t = a[0] && typeof a[0] === 'object' ? a[0].top : a[1];
      window.__log.winScroll.push({ t: Math.round(performance.now()), from: Math.round(window.scrollY), to: Math.round(t), at: shortStack() });
      return origWin(...a);
    };
    for (const vp of document.querySelectorAll('.squares-viewport')) {
      const orig = vp.scrollTo.bind(vp);
      vp.scrollTo = function (...a) {
        window.__log.vpScroll.push({ t: Math.round(performance.now()), to: Math.round(a[0].left), at: shortStack() });
        return orig(...a);
      };
    }
    const origFocus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function (...a) {
      window.__log.focus.push({ t: Math.round(performance.now()), el: (this.id || this.className || this.tagName).toString().slice(0, 40), at: shortStack() });
      return origFocus.apply(this, a);
    };
  });

  await page.evaluate(() => playAll());
  const track = await page.evaluate(async () => {
    let last = null;
    const t0 = performance.now();
    while (performance.now() - t0 < 12000) {
      const active = document.querySelector('.chord-wrapper.playback-active');
      if (active) {
        const key = `${active.dataset.sec}:${active.dataset.square}:${active.dataset.ei}`;
        if (key !== last) {
          last = key;
          window.__log.track.push({
            t: Math.round(performance.now() - t0), cell: key,
            y: Math.round(window.scrollY),
            cellTop: Math.round(active.getBoundingClientRect().top),
          });
        }
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return window.__log;
  });
  await page.evaluate(() => { try { stopPlayback(); } catch (e) {} });

  console.log('=== Смены ячеек (t, ячейка, scrollY, cellTop) ===');
  for (const s of track.track.slice(0, 40)) {
    console.log(`  t=${String(s.t).padEnd(5)} ${s.cell.padEnd(9)} y=${String(s.y).padEnd(5)} cellTop=${s.cellTop}`);
  }
  console.log('=== window.scrollTo (' + track.winScroll.length + ') ===');
  for (const l of track.winScroll.slice(0, 12)) console.log(`  t=${l.t} ${l.from}→${l.to} :: ${l.at}`);
  console.log('=== vp.scrollTo (' + track.vpScroll.length + ') ===');
  for (const l of track.vpScroll.slice(0, 12)) console.log(`  t=${l.t} →${l.to} :: ${l.at}`);
  console.log('=== focus() (' + track.focus.length + ') ===');
  for (const l of track.focus.slice(0, 10)) console.log(`  t=${l.t} ${l.el} :: ${l.at}`);
  console.log(`всего: ячеек ${track.track.length}, winScroll ${track.winScroll.length}, vpScroll ${track.vpScroll.length}, focus ${track.focus.length}`);

  // Скачки: |Δy| > 30 на смене ячейки внутри одного квадрата.
  let inSqJumps = 0;
  for (let i = 1; i < track.track.length; i++) {
    const a = track.track[i - 1], b = track.track[i];
    const sqA = a.cell.split(':').slice(0, 2).join(':'), sqB = b.cell.split(':').slice(0, 2).join(':');
    if (sqA === sqB && Math.abs(b.y - a.y) > 30) inSqJumps++;
  }
  console.log('скачков >30px ПРИ СМЕНЕ ЯЧЕЙКИ ВНУТРИ квадрата:', inSqJumps);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

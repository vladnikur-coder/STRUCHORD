// Диагност «не вижу блюра» превью закрепа:-pin, игра, середина песни —
// скриншот зоны ряда + что технически позади превью и что говорит
// computed style. Один прогон = один png (before/after фикса).
const path = require('path');
const puppeteer = require(path.join(__dirname, '../../node_modules/puppeteer'));

(async () => {
  const tag = process.argv[2] || 'check';
  const browser = await puppeteer.launch({
    executablePath: '/tmp/chrome/chrome',
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chromelibs/lib' },
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,700', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 500 });
  await page.evaluateOnNewDocument(() => {
    const CH = ['Am', 'F', 'C', 'G', 'Dm', 'E7', 'A7', 'Bdim'];
    const sections = []; let id = 2;
    for (let s = 0; s < 2; s++) {
      const squares = [];
      for (let q = 0; q < 4; q++) squares.push({ id: id++, repeat: 1, customBeats: null, strumPattern: null,
        events: [{ chord: CH[(s * 4 + q) % 8], span: 4, timeSig: null, strumPattern: null }] });
      sections.push({ id: 100 + s, type: s % 2 ? 'Chorus' : 'Verse', customName: null, key: null,
        shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null, squares });
    }
    const song = { schemaVersion: 2, name: 'blur', bpm: 160, globalKey: 'C', keyMode: 'manual',
      globalTimeSig: '4/4', notes: '', sections, nextId: 200, userFingerings: [], preferredFingerings: [], date: '' };
    try { localStorage.setItem('struchord_songs', JSON.stringify([song])); } catch (e) {}
  });
  await page.goto('file://' + path.join(__dirname, '../../STRUCHORD.html'), { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 900));
  await page.evaluate(() => loadSong(0));
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(() => setSquareZoom(2.0, true));
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => {
    pinnedFingering = { secId: 101, squareId: 2, eventIndex: 0, chord: 'Am', shape: null };
    renderPinnedFingering();
    renderPinnedNext(findNextChordAfter(101, 2, 0));
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => playAll());
  await new Promise((r) => setTimeout(r, 5200));   // середина: бар прилип, контент едет под рядом

  const info = await page.evaluate(() => {
    const next = document.getElementById('pinnedNext');
    const row = document.getElementById('pinnedRow');
    const nr = next.getBoundingClientRect();
    const cs = getComputedStyle(next);
    const rowCS = getComputedStyle(row);
    // что за КВАДРАТЫ лежат под зоной превью прямо сейчас
    const behind = [...document.querySelectorAll('.square')].filter((sq) => {
      const r = sq.getBoundingClientRect();
      return r.top < nr.bottom && r.bottom > nr.top && r.left < nr.right && r.right > nr.left;
    }).map((sq) => sq.dataset.square);
    return {
      nextRect: { t: Math.round(nr.top), b: Math.round(nr.bottom), l: Math.round(nr.left), r: Math.round(nr.right) },
      display: next.style.display,
      backdrop: cs.backdropFilter || cs.webkitBackdropFilter,
      bg: cs.backgroundColor,
      rowTransform: rowCS.transform,
      squaresBehind: behind,
    };
  });
  console.log(JSON.stringify(info, null, 1));
  const clip = { x: Math.max(0, info.nextRect.l - 260), y: Math.max(0, info.nextRect.t - 20),
    width: Math.min(700, 1280), height: 320 };
  await page.screenshot({ path: `/tmp/blur-${tag}.png`, clip });
  console.log('screenshot /tmp/blur-' + tag + '.png');
  await page.evaluate(() => { try { stopPlayback(); } catch (e) {} });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

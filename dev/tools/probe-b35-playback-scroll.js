// Живой проб B-35 (0.150): автоскролл «как в Guitar Pro» + уважение к
// ручному скроллу. Песня: 2 секции × 4 однокордовых квадрата, 4/4@160
// (такт 1.5с, всего 12с), зум 2×. Фазы:
//   A (0..4с) — обычное следование: играющий квадрат и следующий видны;
//   B (4с)   — «пользователь смотрит вперёд»: колесо вниз на 500px;
//   C (4..8с)— страница у пользователя: НОЛЬ window.scrollTo;
//   D (>8.5с)— тишина >4с: следование возвращается, ячейка снова видна.
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
    const song = { schemaVersion: 2, name: 'B-35 follow', bpm: 160,
      globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4', notes: '',
      sections, nextId: 200, userFingerings: [], preferredFingerings: [], date: '' };
    try { localStorage.setItem('struchord_songs', JSON.stringify([song])); } catch (e) {}
  });
  await page.goto('file://' + path.join(__dirname, '../../STRUCHORD.html'), { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 900));
  await page.evaluate(() => loadSong(0));
  await new Promise((r) => setTimeout(r, 500));
  console.log('версия в шапке:', await page.$eval('.app-title span', (s) => s.textContent.trim()));
  await page.evaluate(() => setSquareZoom(2.0, true));
  await new Promise((r) => setTimeout(r, 400));

  const wheelAt = 4000;
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
  // Сэмплер живёт ПАРАЛЛЕЛЬНО колесу (фаза A не должна потеряться).
  const dataPromise = page.evaluate(async (wheelAt) => {
    const samples = [];
    let lastSq = null;
    while (performance.now() - window.__t0 < 12500) {
      const t = Math.round(performance.now() - window.__t0);
      const active = document.querySelector('.chord-wrapper.playback-active');
      if (active) {
        const sqEl = active.closest('.square');
        const sqId = sqEl && sqEl.dataset.square;
        const changed = sqId !== lastSq;
        if (changed) lastSq = sqId;
        const nextEl = sqEl && window.playbackNextSquareEl(sqEl);
        let nextOk = null;
        if (nextEl) {
          const nr = nextEl.getBoundingClientRect();
          const nvp = nextEl.closest('.squares-viewport');
          const nvr = nvp.getBoundingClientRect();
          nextOk = nr.top < innerHeight && nr.bottom > 80 && nr.left < nvr.right - 24;
        }
        const ar = active.getBoundingClientRect();
        samples.push({
          t, sqId, changed,
          cellVisible: ar.top > 60 && ar.bottom < innerHeight - 12,
          nextOk,
          y: Math.round(window.scrollY),
        });
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return { samples, win: window.__win };
  }, wheelAt);
  // Фаза B: «пользователь смотрит вперёд» — колесо вниз на 500px.
  await new Promise((r) => setTimeout(r, wheelAt));
  await page.mouse.move(640, 250);
  await page.mouse.wheel({ deltaY: 500 });
  const data = await dataPromise;
  await page.evaluate(() => { try { stopPlayback(); } catch (e) {} });

  let fails = 0;
  const check = (name, cond, info) => {
    console.log(`   ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ' — ' + info}`);
    if (!cond) fails++;
  };

  const phaseA = data.samples.filter((s) => s.t < wheelAt - 300);
  check('фаза A: ячейка всегда видна', phaseA.every((s) => s.cellVisible),
    phaseA.filter((s) => !s.cellVisible).length + ' промахов');
  check('фаза A: следующий квадрат виден на сменах',
    phaseA.filter((s) => s.changed).every((s) => s.nextOk === null || s.nextOk === true || s.nextOk),
    '');
  const inView = phaseA.filter((s) => s.changed);
  check('фаза A: смены покрыты', inView.length >= 3, String(inView.length));

  const phaseC = data.win.filter((l) => l.t > wheelAt + 250 && l.t < wheelAt + 3800);
  check('фаза C (страница у пользователя): НОЛЬ авто-скроллов', phaseC.length === 0,
    JSON.stringify(phaseC.slice(0, 3)));

  const phaseD = data.samples.filter((s) => s.t > wheelAt + 4800);
  check('фаза D: следование вернулось — ячейка снова видна',
    phaseD.length > 0 && phaseD.every((s) => s.cellVisible),
    phaseD.filter((s) => !s.cellVisible).map((s) => `${s.sqId}@${s.t}`).slice(0, 3).join(','));
  // В фазе D (тишина >4с) потеря ячейки обязана чиниться скроллом
  // в течение ~1.5с; если ячейка видна — ноль скроллов тоже норма.
  const followBroken = [];
  for (const s of phaseD) {
    if (!s.cellVisible) {
      const scrolled = data.win.some((l) => l.t > s.t - 200 && l.t < s.t + 1500);
      if (!scrolled) followBroken.push(`${s.sqId}@${s.t}`);
    }
  }
  check('фаза D: потеря ячейки всегда чинится скроллом', followBroken.length === 0,
    followBroken.slice(0, 3).join(','));

  console.log(fails ? `PROBE FAIL: ${fails}` : 'PROBE OK');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

// Приёмочный проб B-35 (0.151): воспроизведение при ЗАКРЕПЛЁННОЙ
// аппликатуре. Песня: 2 секции × 4 однокордовых квадрата, 4/4@160
// (такт 1.5с, всего 12с), зум 2×. Закрепляем первый аккорд
// программно (тот же путь, что drag в док) и проверяем:
//   1) --pinned-shift постоянен всю игру (нет раздувания от скролла);
//   2) лестница скроллов монотонная, шаги маленькие, как без закрепа;
//   3) на каждой смене ячейка полностью видна и не спрятана за рядом;
//   4) следующий квадрат виден на сменах;
//   5) ручной скролл при закрепе так же глушит следование (0.150).
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
    const song = { schemaVersion: 2, name: 'B-35 pinned acc', bpm: 160,
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

  const pinned = await page.evaluate(() => {
    pinnedFingering = { secId: 101, squareId: 2, eventIndex: 0, chord: 'Am', shape: null };
    renderPinnedFingering();
    renderPinnedNext(findNextChordAfter(101, 2, 0));
    return document.body.classList.contains('has-pinned-fingering');
  });
  if (!pinned) { console.log('PROBE FAIL: закрепить не удалось'); await browser.close(); process.exit(1); }
  await new Promise((r) => setTimeout(r, 400)); // transition padding-top

  const wheelAt = 3100; // посреди игры, до колеса 2 смены, после — ещё 5
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
  const dataPromise = page.evaluate(async () => {
    const samples = [];
    let lastSq = null;
    while (performance.now() - window.__t0 < 13000) {
      const t = Math.round(performance.now() - window.__t0);
      const active = document.querySelector('.chord-wrapper.playback-active');
      if (active) {
        const sqEl = active.closest('.square');
        const sqId = sqEl && sqEl.dataset.square;
        const changed = sqId !== lastSq;
        if (changed) lastSq = sqId;
        const row = document.getElementById('pinnedRow').getBoundingClientRect();
        const nextEl = sqEl && window.playbackNextSquareEl(sqEl);
        let nextOk = null;
        if (nextEl) {
          const nr = nextEl.getBoundingClientRect();
          nextOk = nr.top < innerHeight && nr.bottom > 80;
        }
        const ar = active.getBoundingClientRect();
        samples.push({
          t, sqId, changed,
          cellTop: Math.round(ar.top), cellBottom: Math.round(ar.bottom),
          rowBottom: Math.round(row.bottom),
          cellFullyVisible: ar.top >= row.bottom + 4 && ar.bottom <= innerHeight - 12,
          cellBehindRow: ar.top < row.bottom && ar.bottom > row.top,
          nextOk,
          shift: document.getElementById('sectionsContainer').style.getPropertyValue('--pinned-shift'),
          y: Math.round(window.scrollY),
        });
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return { samples, win: window.__win };
  });
  await new Promise((r) => setTimeout(r, wheelAt));
  await page.mouse.move(640, 250);
  await page.mouse.wheel({ deltaY: 400 });
  const data = await dataPromise;
  await page.evaluate(() => { try { stopPlayback(); } catch (e) {} });

  let fails = 0;
  const check = (name, cond, info) => {
    console.log(`   ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ' — ' + info}`);
    if (!cond) fails++;
  };
  console.log('версия:', await page.$eval('.app-title span', (s) => s.textContent.trim()).catch(() => '?'));

  // scrollTo здесь ПЛАВНЫЙ (scroll-behavior): после смены квадрата даём
  // ему успокоиться — «осевший» сэмпл = первый не раньше +600мс (урок
  // из диагностов 0.149).
  const changes = data.samples.filter((s) => s.changed);
  const settledOf = (ch) =>
    data.samples.find((s) => s.sqId === ch.sqId && s.t >= ch.t + 600 && s.t <= ch.t + 1100) || null;
  const settled = changes.map(settledOf).filter(Boolean);
  // Окна, где автоследование ОБЯЗАНО работать: до колеса и после 4с
  // тишины (тихое окно колес..+4.6с — страница пользователя).
  const followActive = (s) => s.t < wheelAt - 300 || s.t > wheelAt + 4600;
  const settledFollow = settled.filter(followActive);

  const shifts = new Set(data.samples.map((s) => s.shift));
  check('1) --pinned-shift постоянен всю игру', shifts.size <= 1, [...shifts].join('|'));
  const targetsOf = (a, b) => data.win.filter((l) => l.t >= a && l.t < b).map((l) => l.to);
  const stairsOk = (arr) => arr.every((v, i) => i === 0 || v >= arr[i - 1] - 1) &&
    arr.reduce((m, v, i) => i ? Math.max(m, v - arr[i - 1]) : 0, 0) <= 130;
  const before = targetsOf(0, wheelAt - 300);
  const after = targetsOf(wheelAt + 4600, 13000);
  // После тишины скроллов может и не быть: если пользователь и так в
  // диапазоне видимости, «ближайшая точка» — стоять на месте.
  check('2) лестницы монотонные с малыми шагами (до/после тишины)',
    stairsOk(before) && (after.length === 0 || stairsOk(after)),
    `до=${JSON.stringify(before)} после=${JSON.stringify(after)}`);
  check('3) на осевших сменах ячейка полностью видна (не за рядом)',
    settledFollow.length >= 5 && settledFollow.every((s) => s.cellFullyVisible && !s.cellBehindRow),
    settledFollow.filter((s) => !s.cellFullyVisible || s.cellBehindRow)
      .map((s) => `sq${s.sqId}@t${s.t}[${s.cellTop}..${s.cellBottom}]row${s.rowBottom}`).slice(0, 3).join(','));
  check('4) на осевших сменах следующий квадрат виден',
    settledFollow.every((s) => s.nextOk === null || s.nextOk === true),
    settledFollow.filter((s) => !(s.nextOk === null || s.nextOk === true)).map((s) => `sq${s.sqId}@${s.t}`).join(','));
  const quiet = data.win.filter((l) => l.t > wheelAt + 250 && l.t < wheelAt + 3800);
  check('5) ручной скролл при закрепе глушит следование (3.5с тишины)',
    quiet.length === 0, JSON.stringify(quiet.slice(0, 3)));

  console.log(fails ? `PROBE FAIL: ${fails}` : 'PROBE OK');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

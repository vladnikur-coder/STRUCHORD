// Живой проб B-35 (0.147): авто-скролл «как в Guitar Pro».
// Песня: секция1 [Am][F][C], секция2 [G][Em], 4/4@200 (такт 1.2с),
// зум сетки 2× — ряд шире окна. Во время игры постоянно проверяем:
//   - играющий КВАДРАТ виден целиком в своём вьюпорте;
//   - СЛЕДУЮЩИЙ квадрат виден (в своей секции — левый край в окне;
//     на границе секций — ряд следующей секции виден по вертикали);
// образцы в первые 600мс после смены квадрата не считаются (плавный
// скролл ещё едет), но у каждого квадрата должен быть годный образец.
const path = require('path');
const puppeteer = require(path.join(__dirname, '../../node_modules/puppeteer'));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/tmp/chrome/chrome',
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chromelibs/lib' },
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,900', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 500 }); // низкое окно: страница скроллится и по вертикали
  await page.evaluateOnNewDocument(() => {
    const sq = (id, chord) => ({ id, repeat: 1, customBeats: null, strumPattern: null,
      events: [{ chord, span: 4, timeSig: null, strumPattern: null }] });
    const song = {
      schemaVersion: 2, name: 'B-35 scroll', bpm: 200,
      globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4', notes: '',
      sections: [
        { id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
          squares: [sq(2, 'Am'), sq(3, 'F'), sq(4, 'C')] },
        { id: 5, type: 'Chorus', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
          squares: [sq(6, 'G'), sq(7, 'Em')] },
      ],
      nextId: 10, userFingerings: [], preferredFingerings: [], date: '',
    };
    try { localStorage.setItem('struchord_songs', JSON.stringify([song])); } catch (e) {}
  });
  await page.goto('file://' + path.join(__dirname, '../../STRUCHORD.html'), { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 900));
  await page.evaluate(() => loadSong(0));
  await new Promise((r) => setTimeout(r, 500));
  console.log('версия в шапке:', await page.$eval('.app-title span', (s) => s.textContent.trim()));
  await page.evaluate(() => setSquareZoom(2.0, true));
  await new Promise((r) => setTimeout(r, 400));

  await page.evaluate(() => playAll());
  const samples = await page.evaluate(async () => {
    const out = [];
    let lastSq = null, lastChange = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 8200) {
      const active = document.querySelector('.chord-wrapper.playback-active');
      if (active) {
        const sqEl = active.closest('.square');
        const sqId = sqEl && sqEl.dataset.square;
        if (sqId !== lastSq) { lastSq = sqId; lastChange = performance.now(); }
        const vp = sqEl.closest('.squares-viewport');
        const vr = vp.getBoundingClientRect();
        const sr = sqEl.getBoundingClientRect();
        const nextEl = window.playbackNextSquareEl(sqEl);
        let next = null;
        if (nextEl) {
          const nvp = nextEl.closest('.squares-viewport');
          const nr = nextEl.getBoundingClientRect();
          const nvr = nvp.getBoundingClientRect();
          next = {
            id: nextEl.dataset.square,
            sameVp: nvp === vp,
            leftInVp: Math.round(nr.left - nvr.left),
            w: Math.round(nr.width),
            vVisible: nr.top < innerHeight && nr.bottom > 90, // ниже липкой панели
            nvrRight: Math.round(nvr.width),
          };
        }
        out.push({
          t: Math.round(performance.now() - t0),
          sqId,
          scrollY: Math.round(window.scrollY || 0),
          curFullyVisible: sr.left >= vr.left - 2 && sr.right <= vr.right + 2,
          curTop: Math.round(sr.top), curBottom: Math.round(sr.bottom),
          afterChange: performance.now() - lastChange < 600,
          next,
        });
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    return out;
  });
  await page.evaluate(() => { try { stopPlayback(); } catch (e) {} });

  let fails = 0;
  const check = (name, cond, info) => {
    console.log(`   ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ' — ' + info}`);
    if (!cond) fails++;
  };
  const asserted = samples.filter((s) => !s.afterChange);
  const bySquare = {};
  for (const s of asserted) bySquare[s.sqId] = s;
  check('каждый из 5 квадратов покрыт образцами', Object.keys(bySquare).length === 5,
    JSON.stringify(Object.keys(bySquare)));

  const curBad = asserted.filter((s) => !s.curFullyVisible);
  check('играющий квадрат всегда виден целиком', curBad.length === 0,
    curBad.slice(0, 3).map((s) => `${s.sqId}@${s.t}`).join(', '));

  const nextBad = asserted.filter((s) => {
    if (!s.next || s.next.id === s.sqId) return false;      // повторы/нет следующего
    if (s.next.sameVp) return !(s.next.leftInVp < s.next.nvrRight - 24); // левый край в окне
    return !(s.next.vVisible && s.next.leftInVp < s.next.nvrRight - 24);
  });
  check('следующий квадрат всегда виден', nextBad.length === 0,
    nextBad.slice(0, 3).map((s) => `${s.sqId}→${s.next && s.next.id}@${s.t}`).join(', '));

  // «Рассинхрон»: страница не должна возвращаться к верху во время игры.
  // Единственный законный минимум — самые первые секунды, пока не
  // проскроллили. Как только scrollY превысил 150, назад к <50 хода нет.
  let maxScroll = 0;
  const topSnap = [];
  for (const s of samples) {
    maxScroll = Math.max(maxScroll, s.scrollY);
    if (maxScroll >= 150 && s.scrollY < 50) topSnap.push(`${s.sqId}@${s.t} y=${s.scrollY}`);
  }
  check('страница не возвращается к верху после проскролла', topSnap.length === 0, topSnap.slice(0, 3).join(', '));
  check('песня глубже одного экрана (вертикаль задействована)', maxScroll >= 150, String(maxScroll));

  const boundary = asserted.find((s) => s.sqId === '4');
  check('граница секций: во время кв.4 виден кв.6 (секция 2)',
    !!boundary && !!boundary.next && boundary.next.id === '6' && boundary.next.vVisible,
    JSON.stringify(boundary && boundary.next));

  console.log(fails ? `PROBE FAIL: ${fails}` : 'PROBE OK');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

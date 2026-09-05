// Стресс-проб B-42 v6 (0.161): переплывание закрепления/открепления —
// явность и отсутствие багов. Проверяет в живом Chromium:
//   1) во время переплывания РЯД остаётся «чистым» (opacity/transform/
//      filter = 1/none/none) — иначе WebKit теряет backdrop-filter
//      превью (стекло слепло бы на время анимации);
//   2) карточки реально анимируются (animation-name из keyframes);
//   3) стекло превью живо В СЕРЕДИНЕ появления (pin при игре);
//   4) открепление: ряд скрывается после анимации, не раньше;
//   5) быстрые комбинации: pin→unpin→pin, повторный pin во время
//      появления — без зависших классов/таймеров, контент верный.
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
    const sections = [];
    let id = 2;
    for (let s = 0; s < 2; s++) {
      const squares = [];
      for (let q = 0; q < 4; q++) squares.push({ id: id++, repeat: 1, customBeats: null, strumPattern: null,
        events: [{ chord: ['Am', 'F', 'C', 'G'][(s * 4 + q) % 4], span: 4, timeSig: null, strumPattern: null }] });
      sections.push({ id: 100 + s, type: s % 2 ? 'Chorus' : 'Verse', customName: null, key: null,
        shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null, squares });
    }
    const song = { schemaVersion: 2, name: 'pinswap', bpm: 160, globalKey: 'C', keyMode: 'manual',
      globalTimeSig: '4/4', notes: '', sections, nextId: 200, userFingerings: [], preferredFingerings: [], date: '' };
    try { localStorage.setItem('struchord_songs', JSON.stringify([song])); } catch (e) {}
  });
  await page.goto('file://' + path.join(__dirname, '../../STRUCHORD.html'), { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 900));
  await page.evaluate(() => loadSong(0));
  await new Promise((r) => setTimeout(r, 500));

  let fails = 0;
  const check = (name, cond, info) => {
    console.log(`   ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ' — ' + info}`);
    if (!cond) fails++;
  };
  const pinCell = (sq) => page.evaluate((sq) => {
    currentTooltipWrapper = document.querySelector(
      `.chord-wrapper[data-sec="100"][data-square="${sq}"][data-ei="0"]`);
    lastTooltipWrapper = currentTooltipWrapper;
    document.getElementById('fingering-tooltip').dataset.currentShape = 'x,0,2,2,1,0';
    pinFingeringFromTooltip();
  }, sq);
  const rowState = () => page.evaluate(() => {
    const row = document.getElementById('pinnedRow');
    const cs = getComputedStyle(row);
    const card = document.getElementById('pinnedFingering');
    const cardCS = getComputedStyle(card);
    const next = document.getElementById('pinnedNext');
    const nextCS = getComputedStyle(next);
    return {
      display: row.style.display,
      classes: [...row.classList],
      dissolveTimer: !!row.__dissolveTimer,
      rowOpacity: cs.opacity, rowTransform: cs.transform, rowFilter: cs.filter,
      cardAnim: cardCS.animationName,
      nextAnim: nextCS.animationName,
      nextBackdrop: nextCS.backdropFilter || nextCS.webkitBackdropFilter || '',
      chord: (card.querySelector('.fingering-chord-name') || {}).textContent,
    };
  });

  console.log('=== 1. Появление при «игре» (превью видно): ряд чист, стекло живо ===');
  await page.evaluate(() => { playbackState.isPlaying = true; });
  await pinCell(2);
  await new Promise((r) => setTimeout(r, 160));   // середина анимации
  let st = await rowState();
  check('ряд чист по opacity', st.rowOpacity === '1', st.rowOpacity);
  check('ряд чист по transform', st.rowTransform === 'none', st.rowTransform);
  check('ряд чист по filter', st.rowFilter === 'none', st.rowFilter);
  check('карточка анимируется (in-card)', st.cardAnim === 'struchord-pin-in-card', st.cardAnim);
  check('превью анимируется тем же ключом', st.nextAnim === 'struchord-pin-in-card', st.nextAnim);
  check('стекло превью живо в середине переплывания', /blur\(10px\)/.test(st.nextBackdrop), st.nextBackdrop);
  await new Promise((r) => setTimeout(r, 400));
  st = await rowState();
  check('класс появления снят по таймеру', !st.classes.includes('is-appearing'), st.classes.join(','));
  check('анимация отпустила карточку', st.cardAnim === 'none', st.cardAnim);

  console.log('=== 2. Открепление: растворение, затем скрытие ===');
  await page.evaluate(() => unpinFingering());
  await new Promise((r) => setTimeout(r, 150));
  st = await rowState();
  check('растворение идёт (out-card)', st.cardAnim === 'struchord-pin-out-card', st.cardAnim);
  check('ряд ещё виден до конца анимации', st.display !== 'none');
  check('ряд чист и во время растворения', st.rowOpacity === '1' && st.rowFilter === 'none');
  await new Promise((r) => setTimeout(r, 350));
  st = await rowState();
  check('ряд скрыт после анимации', st.display === 'none', st.display);
  check('таймер растворения погашен', !st.dissolveTimer);

  console.log('=== 3. Быстрые комбинации ===');
  await pinCell(2);                       // появление пошло
  await new Promise((r) => setTimeout(r, 120));
  await page.evaluate(() => unpinFingering());   // отмена почти сразу
  await new Promise((r) => setTimeout(r, 120));
  await pinCell(3);                       // перезакрепление ВНУТРЯ растворения
  st = await rowState();
  check('перезакрепление отменило растворение',
    !st.classes.includes('is-dissolving') && st.display === 'flex', st.classes.join(','));
  check('появление перезапущено', st.classes.includes('is-appearing'));
  await new Promise((r) => setTimeout(r, 300));   // контентный свап (0.13с) успел
  st = await rowState();
  check('контент — свежий аккорд (F)', /F/.test(st.chord || ''), st.chord);
  await new Promise((r) => setTimeout(r, 400));
  st = await rowState();
  const isClean = (x) => x.classes.every((c) => !c.startsWith('is-')) && !x.dissolveTimer;
  check('финал чист: без is-классов и таймеров',
    isClean(st) && st.display === 'flex', JSON.stringify(st.classes));
  check('анимация завершена', st.cardAnim === 'none', st.cardAnim);

  console.log('=== 4. Повторный pin во время появления (рестарт) ===');
  await pinCell(2);
  await new Promise((r) => setTimeout(r, 150));
  await pinCell(3);
  st = await rowState();
  check('анимация перезапустилась', st.cardAnim === 'struchord-pin-in-card', st.cardAnim);
  await new Promise((r) => setTimeout(r, 300));
  st = await rowState();
  check('аккорд обновился (F)', /F/.test(st.chord || ''), st.chord);
  await new Promise((r) => setTimeout(r, 400));
  st = await rowState();
  check('всё чисто после рестарта',
    st.classes.every((c) => !c.startsWith('is-')) && !st.dissolveTimer,
    JSON.stringify(st.classes));

  console.log('=== 5. Открепление при видимой превью (игра) ===');
  await page.evaluate(() => renderPinnedNext({ secId: 100, squareId: 3, eventIndex: 0, chord: 'F' }));
  await page.evaluate(() => unpinFingering());
  await new Promise((r) => setTimeout(r, 150));
  st = await rowState();
  check('превью растворяется вместе с карточкой', st.nextAnim === 'struchord-pin-out-card', st.nextAnim);
  await new Promise((r) => setTimeout(r, 400));
  st = await rowState();
  check('ряд и превью скрыты', st.display === 'none' &&
    (await page.evaluate(() => document.getElementById('pinnedNext').style.display)) === 'none');

  console.log(fails ? `PROBE FAIL: ${fails}` : 'PROBE OK');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

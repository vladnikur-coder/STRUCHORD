// Диагност «во время воспроизведения не получается закрепить»:
// редактор (не лента), игра, тултип у играющей ячейки — реальный жест
// перетаскивания в панель, по шагам: видимость тултипа, wrapper'ы,
// dragState, overDock, результат pinFingeringFromTooltip.
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
    const CH = ['Am', 'F', 'C', 'G'];
    const sections = []; let id = 2;
    for (let s = 0; s < 2; s++) {
      const squares = [];
      for (let q = 0; q < 4; q++) squares.push({ id: id++, repeat: 1, customBeats: null, strumPattern: null,
        events: [{ chord: CH[(s * 4 + q) % 4], span: 4, timeSig: null, strumPattern: null }] });
      sections.push({ id: 100 + s, type: s % 2 ? 'Chorus' : 'Verse', customName: null, key: null,
        shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null, squares });
    }
    const song = { schemaVersion: 2, name: 'pinplay', bpm: 160, globalKey: 'C', keyMode: 'manual',
      globalTimeSig: '4/4', notes: '', sections, nextId: 200, userFingerings: [], preferredFingerings: [], date: '' };
    try { localStorage.setItem('struchord_songs', JSON.stringify([song])); } catch (e) {}
  });
  await page.goto('file://' + path.join(__dirname, '../../STRUCHORD.html'), { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 900));
  await page.evaluate(() => loadSong(0));
  await new Promise((r) => setTimeout(r, 500));

  // --- Сценарий A: игра БЕЗ предварительного ховера ---
  await page.evaluate(() => playAll());
  await new Promise((r) => setTimeout(r, 1800));
  let st = await page.evaluate(() => {
    const tip = document.getElementById('fingering-tooltip');
    const r = tip.getBoundingClientRect();
    return {
      playing: playbackState.isPlaying,
      tipDisplay: tip.style.display,
      tipVisible: r.width > 50 && r.height > 50,
      tipRect: { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) },
      cur: !!currentTooltipWrapper, last: !!lastTooltipWrapper,
      lastChord: lastTooltipWrapper && lastTooltipWrapper.querySelector('.chord-input').value,
    };
  });
  console.log('A (без ховера):', JSON.stringify(st));
  // хватаем тултип у играющей ячейки и тащим в центр панели
  const bar = await page.evaluate(() => {
    const r = document.querySelector('.transport-bar').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  await page.mouse.move(st.tipRect.x, st.tipRect.y);
  await page.mouse.down();
  await page.mouse.move(bar.x, bar.y, { steps: 8 });
  const midDrag = await page.evaluate(() => ({
    dragging: !!pinDragState,
    overDock: pinDragState ? pinDragState.overDock : null,
  }));
  await page.mouse.up();
  const resA = await page.evaluate(() => ({
    pinned: isFingeringPinned(),
    rowShown: document.getElementById('pinnedRow').style.display,
  }));
  console.log('  драг:', JSON.stringify(midDrag), '→', JSON.stringify(resA));
  await page.evaluate(() => { try { stopPlayback(); } catch (e) {} unpinnedGuard: unpinFingering(); });
  await new Promise((r) => setTimeout(r, 500));

  // --- Сценарий B: ховер в покое, потом игра, потом драг ---
  const cell = await page.evaluate(() => {
    const w = document.querySelector('.chord-wrapper[data-sec="100"][data-square="3"][data-ei="0"]');
    const r = w.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  await page.mouse.move(cell.x, cell.y);
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => playAll());
  await new Promise((r) => setTimeout(r, 1800));
  const stB = await page.evaluate(() => {
    const tip = document.getElementById('fingering-tooltip');
    const r = tip.getBoundingClientRect();
    return {
      tipDisplay: tip.style.display,
      tipRect: { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) },
      lastChord: lastTooltipWrapper && lastTooltipWrapper.querySelector('.chord-input').value,
    };
  });
  console.log('B (ховер до игры):', JSON.stringify(stB));
  await page.mouse.move(stB.tipRect.x, stB.tipRect.y);
  await page.mouse.down();
  await page.mouse.move(bar.x, bar.y, { steps: 8 });
  await page.mouse.up();
  const resB = await page.evaluate(() => ({
    pinned: isFingeringPinned(),
    pinChord: pinnedFingering && pinnedFingering.chord,
    rowShown: document.getElementById('pinnedRow').style.display,
  }));
  console.log('  драг →', JSON.stringify(resB));
  await page.evaluate(() => { try { stopPlayback(); } catch (e) {} unpinFingering(); });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

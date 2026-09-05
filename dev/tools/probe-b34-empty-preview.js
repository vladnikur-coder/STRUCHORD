// Живой проб B-34 (0.144): при воспроизведении ПУСТОЙ ячейки превью
// следующего аккорда обязано стоять над ЯЧЕЙКОЙ этого аккорда, а не в
// «случайном месте» (старый код считал позицию от нулевого ректа
// скрытого главного тултипа). Песня: [пустая 4 доли] → [F 4 доли],
// BPM 100 (такт = 2.4с). Сэмплим превью в момент звучания пустой.
const path = require('path');
const puppeteer = require(path.join(__dirname, '../../node_modules/puppeteer'));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/tmp/chrome/chrome',
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chromelibs/lib' },
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,900', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.evaluateOnNewDocument(() => {
    const song = {
      schemaVersion: 2, name: 'B-34 empty preview', bpm: 100,
      globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4', notes: '',
      sections: [
        { id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
          squares: [{ id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
            { chord: '', span: 4, timeSig: null, strumPattern: null },
            { chord: 'F', span: 4, timeSig: null, strumPattern: null },
          ]}]},
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

  let fails = 0;
  const check = (name, cond, info) => {
    console.log(`   ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ' — ' + info}`);
    if (!cond) fails++;
  };

  // Запуск воспроизведения: пустая ячейка звучит первую пару секунд.
  await page.evaluate(() => playAll());
  // Превью появляется через ~150мс после начала события; сэмплим в 400..1600мс.
  await new Promise((r) => setTimeout(r, 700));
  const sample = await page.evaluate(() => {
    const r1 = (n) => Math.round(n * 10) / 10;
    const prev = document.getElementById('preview-tooltip');
    const main = document.getElementById('fingering-tooltip');
    const cells = document.querySelectorAll('.chord-wrapper');
    const fCell = cells[1];
    if (!prev || prev.style.display !== 'block' || !fCell) {
      return { open: false, prevDisp: prev ? prev.style.display : 'нет', mainDisp: main ? main.style.display : '?', cells: cells.length };
    }
    const pr = prev.getBoundingClientRect();
    const cr = fCell.getBoundingClientRect();
    return {
      open: true,
      mainDisp: main.style.display,
      prev: { left: r1(pr.left), top: r1(pr.top), w: r1(pr.width), h: r1(pr.height), cx: r1(pr.left + pr.width / 2), bottom: r1(pr.bottom) },
      cell: { left: r1(cr.left), top: r1(cr.top), w: r1(cr.width), cx: r1(cr.left + cr.width / 2) },
    };
  });
  const stillPlaying = await page.evaluate(() => playbackState.isPlaying);
  check('воспроизведение идёт (пустая ячейка звучит)', stillPlaying);
  check('превью следующего аккорда открыто', sample.open, JSON.stringify(sample));
  if (sample.open) {
    check('главный тултип скрыт (пустая ячейка — репро-условие)', sample.mainDisp !== 'block', sample.mainDisp);
    check('превью по центру ячейки F (|Δcx|≤3)', Math.abs(sample.prev.cx - sample.cell.cx) <= 3,
      `prev.cx=${sample.prev.cx} cell.cx=${sample.cell.cx}`);
    const above = sample.prev.bottom <= sample.cell.top + 14;
    const below = sample.prev.top >= sample.cell.top + 20; // «под ячейкой» допускаем (не влезло сверху)
    check('превью над ячейкой F (или под, если сверху нет места)', above || below,
      `prev.bottom=${sample.prev.bottom} cell.top=${sample.cell.top}`);
    check('не «случайное место»: не у угла окна', !(sample.prev.left <= 14 && sample.prev.top <= 14),
      `prev=(${sample.prev.left},${sample.prev.top})`);
  }
  await page.evaluate(() => { try { stopAll(); } catch (e) { try { stopPlayback(); } catch (e2) {} } });
  console.log(fails ? `PROBE FAIL: ${fails}` : 'PROBE OK');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

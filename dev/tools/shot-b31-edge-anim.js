// Съёмка B-31: ПОКАДРОВАЯ анимация правого края при shrink «4 такта → 1 такт».
// CDP screencast ловит каждый композиционный кадр — то, что видит глаз.
// Ищем серую плашку #D0CCC2 (фон .square-inner) вне зоны ячеек.
// Ручной зонд, в dev/run-tests.sh не входит. Кадры — в dev/bench/results/.
const path = require('path');
const fs = require('fs');
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');

const OUT = path.join(__dirname, '..', 'bench', 'results');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    args: [...sparticuz.args, '--no-sandbox'],
    executablePath: await sparticuz.executablePath(),
    headless: 'shell',
    defaultViewport: { width: 1400, height: 900 },
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/libs/al2023/lib' },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', String(e)));
  await page.goto(`http://127.0.0.1:8000/STRUCHORD.html?shot-b31anim=${Date.now()}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('typeof addSection === "function"');

  await page.evaluate(() => {
    sections = [{ id: 1, type: 'Verse', customName: null, key: 'C', timeSig: null, bpm: 0,
      repeat: 1, strumPattern: null, squares: [
        { id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
          { chord: 'C', span: 4, timeSig: null, strumPattern: null },
          { chord: 'G', span: 4, timeSig: null, strumPattern: null },
          { chord: 'Am', span: 4, timeSig: null, strumPattern: null },
          { chord: 'F', span: 4, timeSig: null, strumPattern: null },
        ]},
      ]
    }];
    if (songRhythmRolls) {
      for (const key of [...songRhythmRolls.refs.keys()]) songRhythmRolls.refs.delete(key);
      songRhythmRolls.sectionRolls.delete(1);
    }
    render();
  });
  await sleep(300);

  const handle = await page.$('.square[data-square="2"] .square-resize-handle');
  const hb = await handle.boundingBox();
  if (!hb) throw new Error('ручка не найдена');
  const cx = hb.x + hb.width / 2, cy = hb.y + hb.height / 2;
  const inner = await page.$eval('.square[data-square="2"] .square-inner', (el) => el.getBoundingClientRect().width);

  const cdp = await page.createCDPSession();
  const frames = [];
  const seen = new Set();
  cdp.on('Page.screencastFrame', async (ev) => {
    if (!seen.has(ev.sessionId)) {
      seen.add(ev.sessionId);
      frames.push({ ts: ev.metadata?.timestamp || 0, data: ev.data });
    }
    try { await cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }); } catch (e) {}
  });
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  // Плавное задвигание через 3 и 2 к 1, как рукой: ~240мс пути.
  const targetX = cx - inner * 0.75;
  await page.mouse.move(targetX, cy, { steps: 12, delay: 20 });
  await sleep(700); // settle при зажатой мыши
  await page.mouse.up();
  await sleep(400);
  await cdp.send('Page.stopScreencast');

  frames.forEach((f, i) => {
    fs.writeFileSync(path.join(OUT, `b31-anim-${String(i).padStart(2, '0')}.png`), Buffer.from(f.data, 'base64'));
  });
  console.log('сохранено кадров:', frames.length);
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });

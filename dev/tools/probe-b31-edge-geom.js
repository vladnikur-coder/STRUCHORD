// Зонд B-31: покадровая геометрия правого края при задвигании.
// На каждом rAF во время drag меряем: правый край .square-inner (он едет
// width-переходом), правый край удал-ленты (transform-переход), правый край
// реальных preview-ячеек и kept-клонов. Если край квадрата дальше всех
// покрытий на >2px — там видно ГОЛЫЙ серый фон .square-inner («пятно»).
// Ручной зонд, в тесты не входит.
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
  await page.goto(`http://127.0.0.1:8000/STRUCHORD.html?probe-b31=${Date.now()}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('typeof addSection === "function"');

  // Сцена: 4/4, один квадрат 4 такта.
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

  // rAF-сэмплер: живёт в странице, пишет массив сэмплов в window.__geom.
  await page.evaluate(() => {
    window.__geom = [];
    window.__geomOn = true;
    const sample = () => {
      if (!window.__geomOn) return;
      const bi = document.querySelector('.square-inner');
      if (bi) {
        const innerRight = bi.getBoundingClientRect().right;
        const overlay = bi.querySelector(':scope > .square-edge-freeze-overlay');
        const strip = bi.querySelector(':scope > .square-edge-freeze-overlay > .square-edge-removed-strip');
        const kept = [...bi.querySelectorAll('.square-edge-freeze-cell.is-kept')];
        const realWrappers = [...bi.querySelectorAll(':scope > .chord-wrapper')];
        const realRight = realWrappers.length
          ? Math.max(...realWrappers.map((w) => w.getBoundingClientRect().right)) : 0;
        const stripRight = strip ? strip.getBoundingClientRect().right : 0;
        const keptRight = kept.length ? Math.max(...kept.map((w) => w.getBoundingClientRect().right)) : 0;
        const cover = Math.max(realRight, stripRight, keptRight);
        window.__geom.push({
          t: Math.round(performance.now()),
          innerRight: +innerRight.toFixed(1),
          realRight: +realRight.toFixed(1),
          stripRight: +stripRight.toFixed(1),
          keptRight: +keptRight.toFixed(1),
          grayGap: +(innerRight - cover).toFixed(1),
          overlayOpacity: overlay ? getComputedStyle(overlay).opacity : null,
          wrappers: realWrappers.length,
        });
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  const handle = await page.$('.square[data-square="2"] .square-resize-handle');
  const hb = await handle.boundingBox();
  const cx = hb.x + hb.width / 2, cy = hb.y + hb.height / 2;
  const inner = await page.$eval('.square[data-square="2"] .square-inner', (el) => el.getBoundingClientRect().width);

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - inner * 0.75, cy, { steps: 12, delay: 25 });
  await sleep(700);
  await page.mouse.up();
  await sleep(400);

  const geom = await page.evaluate(() => { window.__geomOn = false; return window.__geom; });
  fs.writeFileSync(path.join(OUT, 'b31-geom.json'), JSON.stringify(geom, null, 1));

  // Отчёт: только кадры, где что-то анимируется или есть щель
  const t0 = geom[0]?.t || 0;
  let worst = { grayGap: 0 };
  let anyMotion = false;
  const lines = [];
  let lastKey = '';
  for (const g of geom) {
    const key = [g.innerRight, g.realRight, g.stripRight, g.keptRight, g.wrappers].join('|');
    const moving = key !== lastKey;
    lastKey = key;
    if (g.grayGap > worst.grayGap) worst = g;
    if (moving || g.grayGap > 2) {
      anyMotion = anyMotion || moving;
      lines.push(`t=${g.t - t0}ms inner=${g.innerRight} real=${g.realRight} strip=${g.stripRight} kept=${g.keptRight} GAP=${g.grayGap} ovOp=${g.overlayOpacity} w=${g.wrappers}`);
    }
  }
  console.log(lines.slice(0, 120).join('\n'));
  console.log('...\nХУДШИЙ КАДР:', JSON.stringify(worst));
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });

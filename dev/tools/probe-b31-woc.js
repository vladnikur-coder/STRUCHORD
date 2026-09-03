// Зонд B-31: живая песня (Wind of Change), задвигание самого длинного
// квадрата секции. Меряем кадр 2 (settle при зажатой мыши) против кадра 3
// (после отпускания): ширина жертвы, ширины СОСЕДЕЙ, бейдж тактов.
const path = require('path');
const fs = require('fs');
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');

const OUT = path.join('/tmp', 'b31-woc');
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
  page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 300)));
  const song = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'uploads',
    'Scorpions - Wind of Change.struchord-6.json'), 'utf8'));
  await page.goto(`http://127.0.0.1:8000/STRUCHORD.html?woc=${Date.now()}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('typeof addSection === "function"');

  await page.evaluate((song) => {
    globalTimeSig = song.globalTimeSig || '4/4';
    globalKey = song.globalKey || 'C';
    DOM.bpmInput.value = song.bpm || 80;
    sections = song.sections;
    songRhythmRolls = migrateSectionsToRhythmPool(sections);
    render();
  }, song);
  await sleep(300);

  const secId = 4, sqId = 5;
  const readRow = () => page.evaluate(([secId, sqId]) => {
    const card = document.querySelector(`.section-card[data-id="${secId}"]`);
    const squares = [...card.querySelectorAll('.squares-list > .square')].map((el) => {
      const bi = el.querySelector('.square-inner');
      return {
        id: el.dataset.square,
        victim: el.dataset.square === String(sqId),
        styleW: bi.style.width,
        computedW: +bi.getBoundingClientRect().width.toFixed(1),
        badge: el.querySelector('.square-beats-badge')?.textContent || '',
      };
    });
    const victim = card.querySelector(`.square[data-square="${sqId}"] .square-inner`);
    const grid = victim.style.gridTemplateColumns;
    const cols = (grid.match(/([\d.]+)px/g) || []).map((s) => parseFloat(s));
    const gridPx = cols.reduce((a, b) => a + b, 0) + Math.max(0, cols.length - 1) * 2;
    return {
      squares,
      victimBox: +victim.getBoundingClientRect().width.toFixed(1),
      gridPx: +gridPx.toFixed(1),
      visualMax: getSectionMaxVisualBeats(sections.find((s) => s.id === secId)),
    };
  }, [secId, sqId]);

  const handle = await page.$(`.square[data-sec="${secId}"][data-square="${sqId}"] .square-resize-handle`);
  if (!handle) throw new Error('ручка не найдена');
  const hb = await handle.boundingBox();
  const cx = hb.x + hb.width / 2, cy = hb.y + hb.height / 2;
  const inner = await page.$eval(`.square[data-square="${sqId}"] .square-inner`, (el) => el.getBoundingClientRect().width);
  console.log('квадрат #5: ширина', Math.round(inner), 'px; ручка @', Math.round(cx), Math.round(cy));

  const f1 = await readRow();
  await page.screenshot({ path: path.join(OUT, 'w1-before.png') });

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - inner * 0.79, cy, { steps: 2 }); // 20 долей -> ~4
  await sleep(600);
  const f2 = await readRow();
  await page.screenshot({ path: path.join(OUT, 'w2-settled-hold.png') });

  await page.mouse.up();
  await sleep(500);
  const f3 = await readRow();
  await page.screenshot({ path: path.join(OUT, 'w3-after-up.png') });

  const show = (f, label) => console.log(label, JSON.stringify(f));
  show(f1, 'КАДР 1:');
  show(f2, 'КАДР 2:');
  show(f3, 'КАДР 3:');
  console.log('ВЕРДИКТ: ширина жертвы кадр2 vs кадр3:', f2.squares.find(s=>s.victim).computedW, 'vs', f3.squares.find(s=>s.victim).computedW,
    '| style:', f2.squares.find(s=>s.victim).styleW, 'vs', f3.squares.find(s=>s.victim).styleW,
    '| сетка в коробке:', f2.gridPx, 'vs коробка', f2.victimBox);
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });

// Зонд B-65 (0.200): перетаскивание секции ярлыком. Меряет: сворачивание
// карточки в слот, догонялку ярлыка, перестановку слота, посадку и
// итоговый порядок модели. Ручной зонд. Нужен http://127.0.0.1:8000.
// Флаг --shots кладёт кадры в dev/bench/results/b65-frames/.
const path = require('path');
const fs = require('fs');
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');
const OUT = path.join(__dirname, '..', 'bench', 'results');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = process.argv.includes('--shots');

(async () => {
  const browser = await puppeteer.launch({
    args: [...sparticuz.args, '--no-sandbox'],
    executablePath: await sparticuz.executablePath(),
    headless: 'shell',
    defaultViewport: { width: 1400, height: 1000 },
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/libs/al2023/lib' },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', String(e)));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });
  await page.goto(`http://127.0.0.1:8000/STRUCHORD.html?probe-b65=${Date.now()}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('typeof addSection === "function"');
  await page.evaluate(() => {
    const mk = (id, type, n) => ({ id, type, customName: null, key: 'C', timeSig: null, bpm: 0, repeat: id === 2 ? 2 : 1, strumPattern: null,
      squares: Array.from({ length: n }, (_, i) => ({ id: id * 100 + i, repeat: 1, customBeats: null, strumPattern: null,
        events: [{ chord: 'C', span: 4, timeSig: null, strumPattern: null }, { chord: 'G', span: 4, timeSig: null, strumPattern: null }] })) });
    sections = [mk(1, 'Intro', 1), mk(2, 'Verse', 3), mk(3, 'Chorus', 2), mk(4, 'Bridge', 1)];
    render();
  });
  await sleep(300);
  const order0 = await page.evaluate(() => sections.map((s) => s.type).join(','));
  console.log('порядок до:', order0);

  const cards = await page.$$eval('.section-card', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { id: e.dataset.id, top: r.top, h: r.height }; }));
  console.log('карточки:', JSON.stringify(cards));
  const hdr = await page.$eval('.section-card[data-id="2"] .section-header .drag-handle', (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });

  const shotsDir = path.join(OUT, 'b65-frames');
  if (SHOTS) { fs.rmSync(shotsDir, { recursive: true, force: true }); fs.mkdirSync(shotsDir, { recursive: true }); }
  let fi = 0;
  const shot = async () => { if (SHOTS) await page.screenshot({ path: path.join(shotsDir, `f${String(fi++).padStart(2, '0')}.png`), clip: { x: 0, y: 0, width: 1400, height: 1000 } }); };

  await page.mouse.move(hdr.x, hdr.y);
  await page.mouse.down();
  await page.mouse.move(hdr.x + 10, hdr.y + 10, { steps: 2 });
  // сворачивание
  const collapse = [];
  for (let i = 0; i < 20; i++) {
    collapse.push(await page.evaluate(() => {
      const c = document.querySelector('.section-card[data-id="2"]');
      const chip = document.getElementById('sectionDragChip');
      return [Math.round(c.getBoundingClientRect().height), c.className.includes('is-drag-slot') ? 'slot' : '-', chip ? getComputedStyle(chip).display + ':' + getComputedStyle(chip).opacity : 'no-chip'];
    }));
    await shot();
    await sleep(16);
  }
  console.log('сворачивание (высота карточки, класс, ярлык):', JSON.stringify(collapse));
  // рывок вниз — догонялка
  await page.mouse.move(hdr.x + 40, hdr.y + 420, { steps: 2 });
  const lag = [];
  for (let i = 0; i < 14; i++) {
    lag.push(await page.evaluate(() => { const c = document.getElementById('sectionDragChip'); return Math.round(c.getBoundingClientRect().top); }));
    await shot();
    await sleep(16);
  }
  console.log('ярлык догоняет (top по кадрам):', JSON.stringify(lag));
  const domOrder = await page.$$eval('.section-card', (els) => els.map((e) => e.dataset.id).join(','));
  console.log('порядок DOM во время жеста:', domOrder);
  await sleep(300);
  // бросок
  await page.mouse.up();
  const land = [];
  for (let i = 0; i < 50; i++) {
    land.push(await page.evaluate(() => {
      const c = document.querySelector('.section-card[data-id="2"]');
      const chip = document.getElementById('sectionDragChip');
      const cr = c.getBoundingClientRect();
      return [Math.round(cr.height), Math.round(cr.top), chip ? getComputedStyle(chip).display + ':' + (+getComputedStyle(chip).opacity).toFixed(2) + '@' + Math.round(chip.getBoundingClientRect().top) : '-', c.className.replace('section-card', '').trim() || '-'];
    }));
    await shot();
    await sleep(16);
  }
  console.log('посадка (h, top, ярлык, класс):'); land.forEach((l, i) => { if (i % 2 === 0) console.log('  ', i, JSON.stringify(l)); });
  console.log('порядок после:', await page.evaluate(() => sections.map((s) => s.type).join(',')));
  console.log('DOM после:', await page.$$eval('.section-card', (els) => els.map((e) => e.dataset.id).join(',')));
  console.log('остаточные инлайны у карточки:', await page.$eval('.section-card[data-id="2"]', (e) => e.getAttribute('style')));
  console.log('sectionDrag:', await page.evaluate(() => sectionDrag));

  // Отмена по Esc
  const hdr2 = await page.$eval('.section-card[data-id="3"] .section-header .drag-handle', (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.move(hdr2.x, hdr2.y); await page.mouse.down();
  await page.mouse.move(hdr2.x, hdr2.y - 300, { steps: 6 }); await sleep(400);
  console.log('DOM в жесте 2:', await page.$$eval('.section-card', (els) => els.map((e) => e.dataset.id).join(',')));
  await page.keyboard.press('Escape'); await sleep(900);
  await page.mouse.up();
  console.log('после Esc — модель:', await page.evaluate(() => sections.map((s) => s.type).join(',')), 'DOM:', await page.$$eval('.section-card', (els) => els.map((e) => e.dataset.id).join(',')));
  // Клик по кнопке заголовка не начинает жест
  console.log('клик по кнопке settings не оставляет sectionDrag:', await page.evaluate(async () => {
    const b = document.querySelector('.section-card[data-id="1"] .section-settings-btn');
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10, pointerId: 7, pointerType: 'mouse', button: 0 }));
    const r = sectionDrag === null;
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7 }));
    return r;
  }));
  await browser.close();
})();

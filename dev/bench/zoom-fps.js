// Замер настоящих кадров при непрерывном зуме: гоняем колесо с ctrlKey
// потоком мелких дельт (как трекпадный щипок) и смотрим на длительность
// кадров через requestAnimationFrame + Performance API.
const puppeteer = require('puppeteer');
const path = process.argv[2] || '/home/user/STRUCHORD.html';
const SQUARES = parseInt(process.argv[3] || '8', 10);

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1'],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(180000);
  await page.setViewport({ width: 1440, height: 900 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('file://' + path, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 800));

  // Песня заданного размера. Квадраты кладём прямо в модель, а не через
  // addSquare: у него потолок CONFIG.MAX_SQUARES_PER_SECTION = 16, и цикл
  // `while (length < n)` при n > 16 крутился бы вечно. Нужный объём
  // набираем числом секций.
  const tSetup = Date.now();
  await page.evaluate((n) => {
    sections = [];
    const perSection = Math.min(n, 16);
    const nSections = Math.max(1, Math.ceil(n / perSection)) * 3;
    for (let i = 0; i < nSections; i++) {
      addSection(['Verse', 'Chorus', 'Bridge'][i % 3]);
      const sec = sections[sections.length - 1];
      while (sec.squares.length < perSection) {
        sec.squares.push({
          id: nextId++, repeat: 1, customBeats: 16, strumPattern: null,
          events: [
            { chord: 'Am', span: 4 }, { chord: 'F', span: 4 },
            { chord: 'Cmaj7', span: 4 }, { chord: 'G7', span: 4 },
          ],
        });
      }
    }
    setSquareZoom(1);
    render();
  }, SQUARES);
  console.log(`  подготовка песни: ${((Date.now()-tSetup)/1000).toFixed(1)} с`);
  await new Promise((r) => setTimeout(r, 500));

  const cells = await page.evaluate(() => document.querySelectorAll('.chord-wrapper').length);

  const row = await page.$('.squares-viewport');
  const box = await row.boundingBox();
  // Центр высокого ряда уходит за нижний край окна, и курсор попадает
  // мимо — жест молча не срабатывает. Зажимаем точку внутрь viewport.
  const vp = page.viewport();
  const cx = Math.round(Math.min(box.x + box.width / 2, vp.width - 20));
  const cy = Math.round(Math.min(box.y + Math.min(box.height / 2, 60), vp.height - 20));

  // Собираем длительности кадров во время жеста.
  await page.evaluate(() => {
    window.__frames = [];
    window.__collect = true;
    let last = performance.now();
    const tick = (t) => {
      window.__frames.push(t - last);
      last = t;
      if (window.__collect) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  await page.mouse.move(cx, cy);
  await page.keyboard.down('Control');
  // 90 тиков по -6px — примерно 1.5 секунды непрерывного щипка.
  for (let i = 0; i < 90; i++) {
    await page.mouse.wheel({ deltaY: -6 });
    await new Promise((r) => setTimeout(r, 16));
  }
  await page.keyboard.up('Control');
  await new Promise((r) => setTimeout(r, 200));

  const res = await page.evaluate(() => {
    window.__collect = false;
    const f = window.__frames.slice(5);
    const sorted = [...f].sort((a, b) => a - b);
    const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0;
    return {
      zoom: squareZoom,
      frames: f.length,
      median: q(0.5),
      p95: q(0.95),
      max: sorted[sorted.length - 1] || 0,
      over20: f.filter((x) => x > 20).length,
      over33: f.filter((x) => x > 33).length,
    };
  });

  console.log(`  файл: ${path.split('/').pop()}  ячеек: ${cells}  масштаб: ${res.zoom.toFixed(2)}×`);
  console.log(`  кадров: ${res.frames}`);
  console.log(`  медиана ${res.median.toFixed(1)} мс | p95 ${res.p95.toFixed(1)} мс | худший ${res.max.toFixed(1)} мс`);
  console.log(`  просадок >20мс: ${res.over20}  |  >33мс (двойной пропуск): ${res.over33}`);
  const fps = 1000 / res.median;
  console.log(`  => ${fps.toFixed(0)} fps по медиане`);
  if (Math.abs(res.zoom - 1) < 0.01) console.log('  ВНИМАНИЕ: масштаб не изменился — жест не попал в ряд');
  if (errs.length) console.log('  ОШИБКИ:', errs.slice(0, 3));
  await browser.close();
})();

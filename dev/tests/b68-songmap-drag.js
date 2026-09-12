// B-68: перетаскивание строк в панели структуры (pointer-жест).
// Нужен http://127.0.0.1:8000. Проверяет: захват по порогу, слот,
// порядок строк во время жеста = будущий порядок, модель после посадки,
// отмена по Esc, клик без движения = прыжок, поле переставлено.
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`   ${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!cond) fails++; };
(async () => {
  const browser = await puppeteer.launch({ args: [...sparticuz.args, '--no-sandbox'], executablePath: await sparticuz.executablePath(), headless: 'shell', defaultViewport: { width: 1400, height: 1000 }, env: { ...process.env, LD_LIBRARY_PATH: '/tmp/libs/al2023/lib' } });
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:8000/STRUCHORD.html?b68=${Date.now()}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('typeof addSection === "function"');
  await page.evaluate(() => {
    const mk = (id, type) => ({ id, type, customName: null, key: 'C', timeSig: null, bpm: 0, repeat: id === 3 ? 2 : 1, strumPattern: null,
      squares: [{ id: id * 100, repeat: 1, customBeats: null, strumPattern: null, events: [{ chord: 'C', span: 4, timeSig: null, strumPattern: null }] }] });
    sections = [mk(1, 'Intro'), mk(2, 'Verse'), mk(3, 'Chorus'), mk(4, 'Bridge'), mk(5, 'Outro')];
    render(); renderSongMap();
    document.getElementById('songmap').classList.add('is-open');
  });
  await sleep(300);
  const rowBox = (id) => page.$eval(`.songmap-item[data-id="${id}"]`, (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, h: r.height }; });
  const panelOrder = () => page.evaluate(() => [...document.querySelectorAll('.songmap-item')].map((e) => e.dataset.id).join(''));
  const modelOrder = () => page.evaluate(() => sections.map((s) => s.id).join(''));
  const fieldOrder = () => page.evaluate(() => [...document.querySelectorAll('.section-card')].map((e) => e.dataset.id).join(''));

  // 1. Тащим Outro (5) вверх на место между 1 и 2
  let b = await rowBox(5);
  const b2 = await rowBox(2);
  await page.mouse.move(b.x, b.y); await page.mouse.down();
  await page.mouse.move(b.x + 2, b.y + 2); // < порога
  ok('до порога жест не начат', !(await page.evaluate(() => !!(songmapDrag && songmapDrag.active))));
  await page.mouse.move(b.x + 6, b.y - 8, { steps: 2 }); await sleep(150);
  ok('жест начат по порогу', await page.evaluate(() => !!(songmapDrag && songmapDrag.active)));
  ok('строка стала слотом', await page.$eval('.songmap-item[data-id="5"]', (e) => e.classList.contains('is-drag-slot')));
  ok('ярлык виден и с именем', await page.$eval('#sectionDragChip', (e) => getComputedStyle(e).display === 'flex' && /Аутро|Outro/.test(e.textContent)));
  ok('тащимая выделена', await page.$eval('.songmap-item[data-id="5"]', (e) => e.classList.contains('is-selected')));
  for (let y = b.y; y >= b2.y - 4; y -= 6) { await page.mouse.move(b.x + 6, y); await sleep(12); }
  await sleep(300);
  ok('во время жеста порядок в панели 15234', (await panelOrder()) === '15234', await panelOrder());
  ok('модель ещё не тронута', (await modelOrder()) === '12345');
  await page.mouse.up(); await sleep(600);
  ok('после посадки модель 15234', (await modelOrder()) === '15234', await modelOrder());
  ok('панель 15234', (await panelOrder()) === '15234');
  ok('поле 15234', (await fieldOrder()) === '15234', await fieldOrder());
  ok('слот снят', !(await page.$('.songmap-item.is-drag-slot')));
  ok('ярлык скрыт', await page.$eval('#sectionDragChip', (e) => getComputedStyle(e).display === 'none'));
  ok('перемещённая выделена', await page.$eval('.songmap-item[data-id="5"]', (e) => e.classList.contains('is-selected')));

  // 2. Esc — отмена
  b = await rowBox(3);
  await page.mouse.move(b.x, b.y); await page.mouse.down();
  await page.mouse.move(b.x + 6, b.y + 8, { steps: 2 }); await sleep(100);
  for (let y = b.y; y <= b.y + b.h * 2.2; y += 6) { await page.mouse.move(b.x + 6, y); await sleep(12); }
  await sleep(250);
  ok('перед Esc порядок изменён в панели', (await panelOrder()) !== '15234', await panelOrder());
  await page.keyboard.press('Escape'); await sleep(500); await page.mouse.up(); await sleep(200);
  ok('Esc: панель вернулась к 15234', (await panelOrder()) === '15234', await panelOrder());
  ok('Esc: модель 15234', (await modelOrder()) === '15234');

  // 3. Клик без движения — прыжок, не жест
  await page.evaluate(() => { window.scrollTo(0, 0); document.getElementById('songmap').classList.add('is-open'); }); await sleep(350);
  b = await rowBox(4);
  await page.mouse.click(b.x, b.y); await sleep(700);
  ok('клик выделяет', await page.$eval('.songmap-item[data-id="4"]', (e) => e.classList.contains('is-selected')));
  ok('жеста после клика нет', await page.evaluate(() => songmapDrag === null));
  ok('без ошибок в консоли', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(fails ? `\n${fails} FAIL` : '\nALL OK');
  process.exit(fails ? 1 : 0);
})();

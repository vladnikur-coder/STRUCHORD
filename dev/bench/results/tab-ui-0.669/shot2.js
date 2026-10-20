const puppeteer = require('/home/user/STRUCHORD/node_modules/puppeteer-core');
const fs = require('fs');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/tmp/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('http://127.0.0.1:8000/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction('typeof addTabInsert === "function"');
  await page.evaluate(() => {
    startNewSongFromHome();
    if (!sections.length) addSection();
    const s = sections[0];
    while (s.squares.length < 3) addSquare(s.id);
  });
  await wait(600);
  const out = { errors, steps: {} };

  // Вставка в середину: три квадрата, позиция 2.
  await page.evaluate(() => addTabInsert(sections[0].id));
  await page.waitForSelector('.tab-insert-editor');
  await page.evaluate(() => {
    const e = tabInsertEditorState;
    tabInsertAddNote(e.secId, e.sqId); tabInsertSetFret(e.secId, e.sqId, 0, 5);
  });
  await page.select('[data-tab-position]', '1');
  await page.click('[data-tab-apply]');
  await wait(500);
  out.steps.insertMiddle = await page.evaluate(() => sections[0].squares.map(q => q.type || 'chord'));

  // Кнопка «позже» двигает таб вправо, Undo возвращает.
  const card = await page.$('.section-card');
  const cb = await card.boundingBox();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + 60);
  await wait(400);
  await page.evaluate(() => { const s = sections[0]; const sq = s.squares.find(q => q.type === 'tab'); tabSquareTest = sq.id; });
  const clickMove = async dir => {
    await page.evaluate(dir => {
      const s = sections[0], sq = s.squares.find(q => q.type === 'tab');
      moveTabSquare(s.id, sq.id, dir);
    }, dir);
    await wait(300);
    return page.evaluate(() => sections[0].squares.map(q => q.type || 'chord').join(','));
  };
  out.steps.afterMoveRight = await clickMove(1);
  out.steps.afterUndo = await page.evaluate(() => { undoEdit(); return sections[0].squares.map(q => q.type || 'chord').join(','); });
  out.steps.afterRedo = await page.evaluate(() => { redoEdit(); return sections[0].squares.map(q => q.type || 'chord').join(','); });

  // Клик по реальной кнопке «‹» (после hover строка раскрыта).
  const tabSq = await page.$('.square--tab');
  const tb = await tabSq.boundingBox();
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await wait(400);
  const leftBtn = await page.$('.square--tab .tab-btn');
  const before = await page.evaluate(() => sections[0].squares.map(q => q.type || 'chord').join(','));
  await leftBtn.click();
  await wait(400);
  out.steps.realClick = { before, after: await page.evaluate(() => sections[0].squares.map(q => q.type || 'chord').join(',')) };

  // Отмена сразу после добавления убирает пустую вставку.
  const beforeCancel = await page.evaluate(() => sections[0].squares.length);
  await page.evaluate(() => addTabInsert(sections[0].id));
  await page.waitForSelector('.tab-insert-editor');
  await page.click('[data-tab-cancel]');
  await wait(400);
  out.steps.cancelFresh = { before: beforeCancel, after: await page.evaluate(() => sections[0].squares.length) };
  // Отмена после ввода ноты вставку сохраняет (ноты остаются прежними).
  await page.evaluate(() => addTabInsert(sections[0].id));
  await page.waitForSelector('.tab-insert-editor');
  await page.evaluate(() => { const e = tabInsertEditorState; tabInsertAddNote(e.secId, e.sqId); });
  await page.click('[data-tab-cancel]');
  await wait(400);
  out.steps.cancelAfterNote = await page.evaluate(() => ({
    squares: sections[0].squares.length,
    tabNotes: sections[0].squares.filter(q => q.type === 'tab').map(q => q.notes.length),
  }));

  // Тёмная тема: кнопка «Таб» и «Применить».
  await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
  await wait(400);
  await page.evaluate(() => { const s = sections[0], sq = s.squares.find(q => q.type === 'tab'); openTabInsertEditor(s.id, sq.id); });
  await page.waitForSelector('.tab-insert-editor');
  await wait(400);
  out.steps.dark = await page.evaluate(() => {
    const apply = document.querySelector('[data-tab-apply]');
    const cs = getComputedStyle(apply);
    const addBtn = document.querySelector('.add-tab-btn');
    const acs = getComputedStyle(addBtn);
    return { applyColor: cs.color, applyBg: cs.backgroundColor, addColor: acs.color, addBg: acs.backgroundColor, accentToken: getComputedStyle(document.documentElement).getPropertyValue('--color-on-accent').trim() };
  });
  const modal = await page.$('.tab-insert-editor .strum-modal-content');
  await modal.screenshot({ path: '08-modal-dark.png' });
  await page.screenshot({ path: '09-dark-page.png' });

  out.errors = errors;
  fs.writeFileSync('measurements-2.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });

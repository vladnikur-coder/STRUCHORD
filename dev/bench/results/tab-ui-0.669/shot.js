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
  await page.goto('http://127.0.0.1:8000/STRUCHORD.html', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction('typeof addTabInsert === "function" && typeof sections !== "undefined"', { timeout: 30000 });
  await page.evaluate(() => {
    startNewSongFromHome();
    if (!sections.length) addSection();
    if (!sections[0].squares.length) addSquare(sections[0].id);
  });
  await page.waitForSelector('.square-actions-row', { timeout: 15000 });

  const out = { errors, steps: {} };

  out.steps.setup = await page.evaluate(() => {
    if (!sections.length) addSection();
    return { sections: sections.length, squares: sections[0].squares.length, secId: sections[0].id };
  });

  // 1. Кнопка «Таб» в ряду действий секции (ряд выезжает при наведении).
  const card = await page.$('.section-card');
  const cb = await card.boundingBox();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await wait(500);
  const btn = await page.$('.add-tab-btn');
  out.steps.addButton = await btn.evaluate(el => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const svg = el.querySelector('svg');
    const sr = svg && svg.getBoundingClientRect();
    return {
      text: el.textContent.trim(),
      hasSvg: !!svg,
      svgSize: sr ? [Math.round(sr.width * 100) / 100, Math.round(sr.height * 100) / 100] : null,
      box: [Math.round(r.width * 100) / 100, Math.round(r.height * 100) / 100],
      color: cs.color, bg: cs.backgroundColor, borderStyle: cs.borderTopStyle,
      tiMusic: !!el.querySelector('.ti-music'),
    };
  });
  const bbBtn = await (await page.$('.add-tab-btn')).boundingBox();
  await page.screenshot({ path: '01-add-tab-button.png', clip: { x: Math.max(0, bbBtn.x - 120), y: Math.max(0, bbBtn.y - 60), width: 460, height: 170 } });

  // 2. Добавляем таб-вставку -> редактор открывается сам.
  await page.evaluate(() => addTabInsert(sections[0].id));
  await page.waitForSelector('.tab-insert-editor', { timeout: 5000 });
  await wait(400);
  out.steps.editorOpened = await page.evaluate(() => {
    const overlay = document.querySelector('.tab-insert-editor');
    const sel = overlay.querySelector('[data-tab-position]');
    return {
      open: !!overlay,
      positionOptions: sel ? Array.from(sel.options).map(o => o.textContent) : null,
      positionValue: sel ? sel.value : null,
      hasNoteHeader: !!overlay.querySelector('.tab-row-head'),
    };
  });
  await page.screenshot({ path: '02-editor-empty.png' });

  // 3. Ноты 6/0 6/3 5/0 5/3 + точка.
  await page.evaluate(() => {
    const sid = tabInsertEditorState.secId, qid = tabInsertEditorState.sqId;
    tabInsertAddNote(sid, qid); tabInsertSetFret(sid, qid, 0, 0);
    tabInsertAddNote(sid, qid); tabInsertSetString(sid, qid, 1, 1); tabInsertSetFret(sid, qid, 1, 3);
    tabInsertAddNote(sid, qid); tabInsertSetString(sid, qid, 2, 2); tabInsertSetFret(sid, qid, 2, 0);
    tabInsertAddNote(sid, qid); tabInsertSetString(sid, qid, 3, 2); tabInsertSetFret(sid, qid, 3, 3);
    tabInsertSetDots(sid, qid, 3, true);
  });
  await wait(300);
  out.steps.noteRows = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.tab-editor-body .tab-note-row'));
    return rows.map(row => {
      const r = row.getBoundingClientRect();
      const cells = Array.from(row.children).map(ch => {
        const cr = ch.getBoundingClientRect();
        return { tag: ch.tagName.toLowerCase(), text: ch.textContent.trim().slice(0, 12), y: Math.round(cr.y), h: Math.round(cr.height) };
      });
      const tops = new Set(cells.map(c => c.y));
      return { height: Math.round(r.height), rows: tops.size, cells };
    });
  });
  await page.screenshot({ path: '03-editor-four-notes.png' });
  out.steps.desktopHead = await page.evaluate(() => {
    const head = document.querySelector('.tab-editor-body .tab-row-head');
    if (!head) return null;
    const hr = head.getBoundingClientRect();
    return {
      width: Math.round(hr.width), height: Math.round(hr.height),
      cells: Array.from(head.children).map(c => {
        const r = c.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(c);
        const lines = Array.from(range.getClientRects()).length;
        return { text: c.textContent, x: Math.round(r.x), w: Math.round(r.width), lines, scrollW: c.scrollWidth };
      }),
      rowCols: getComputedStyle(document.querySelector('.tab-editor-body .tab-note-row')).gridTemplateColumns,
    };
  });
  const modal = await page.$('.tab-insert-editor .strum-modal-content');
  await modal.screenshot({ path: '04-modal-four-notes.png' });

  // 4. Контраст кнопки «Применить».
  out.steps.applyButton = await page.evaluate(() => {
    const btn = document.querySelector('[data-tab-apply]');
    const cs = getComputedStyle(btn);
    return { color: cs.color, background: cs.backgroundColor, borderColor: cs.borderTopColor, weight: cs.fontWeight };
  });

  // 5. Позиция: переносим таб в начало секции и применяем.
  out.steps.beforeMove = await page.evaluate(() => {
    const s = sections.find(s => s.id === tabInsertEditorState.secId);
    return s.squares.map(q => q.type || 'chord');
  });
  await page.select('[data-tab-position]', '0');
  await page.click('[data-tab-apply]');
  await wait(500);
  out.steps.afterMove = await page.evaluate(() => {
    const s = sections[0];
    return { order: s.squares.map(q => q.type || 'chord'), editorClosed: !document.querySelector('.tab-insert-editor') };
  });
  await page.screenshot({ path: '05-tab-at-start.png' });

  // 6. Кнопки переноса таб-квадрата: размер, иконки, доступность.
  out.steps.moveButtons = await page.evaluate(() => {
    const sq = document.querySelector('.square--tab');
    sq.scrollIntoView({ block: 'center' });
    const btns = Array.from(sq.querySelectorAll('.tab-btn'));
    return btns.map(b => {
      const r = b.getBoundingClientRect();
      const icon = b.querySelector('i');
      const iconStyle = icon ? getComputedStyle(icon, ':before').content : null;
      return {
        title: b.title, disabled: b.disabled,
        box: [Math.round(r.width * 100) / 100, Math.round(r.height * 100) / 100],
        iconClass: icon && icon.className, iconContent: iconStyle,
        opacity: getComputedStyle(b).opacity,
      };
    });
  });
  const tabSq = await page.$('.square--tab');
  const bb = await tabSq.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await wait(400);
  const bbTab = await (await page.$('.square--tab')).boundingBox();
  await page.screenshot({ path: '06-tab-square-hover.png', clip: { x: Math.max(0, bbTab.x - 20), y: Math.max(0, Math.min(bbTab.y, 900 - bbTab.height) - 20), width: Math.min(1400, bbTab.width + 200), height: Math.min(880, bbTab.height + 60) } });
  out.steps.hoverOpacity = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.square--tab .tab-btn')).map(b => ({ title: b.title, opacity: getComputedStyle(b).opacity, disabled: b.disabled })));

  // 7. Undo одного шага.
  out.steps.undo = await page.evaluate(() => {
    const before = sections[0].squares.map(q => q.type + ':' + (q.notes ? q.notes.length : 0));
    if (typeof undoEdit === 'function') undoEdit();
    const after = sections[0].squares.map(q => q.type + ':' + (q.notes ? q.notes.length : 0));
    return { before, after };
  });

  // 8. Узкий экран — отдельная вкладка, чтобы не полагаться на reload.
  const mobile = await browser.newPage();
  mobile.on('pageerror', e => errors.push('mobile: ' + String(e)));
  await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await mobile.goto('http://127.0.0.1:8000/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await mobile.waitForFunction('typeof addTabInsert === "function"', { timeout: 30000 });
  await mobile.evaluate(() => {
    startNewSongFromHome();
    if (!sections.length) addSection();
    if (!sections[0].squares.length) addSquare(sections[0].id);
    addTabInsert(sections[0].id);
  });
  await mobile.waitForSelector('.tab-insert-editor', { timeout: 5000 });
  await mobile.evaluate(() => {
    const sid = tabInsertEditorState.secId, qid = tabInsertEditorState.sqId;
    for (let i = 0; i < 2; i++) { tabInsertAddNote(sid, qid); tabInsertSetFret(sid, qid, i, i); }
  });
  await wait(400);
  out.steps.mobileRows = await mobile.evaluate(() =>
    Array.from(document.querySelectorAll('.tab-editor-body .tab-note-row')).map(r => Math.round(r.getBoundingClientRect().height)));
  out.steps.mobileOverflow = await mobile.evaluate(() => {
    const body = document.querySelector('.tab-editor-body');
    const modal = document.querySelector('.tab-insert-editor .strum-modal-content');
    const limit = body.getBoundingClientRect().right;
    const wide = Array.from(body.querySelectorAll('*')).filter(el => el.getBoundingClientRect().right > limit + 0.5)
      .slice(0, 8).map(el => ({
        tag: el.tagName.toLowerCase(), cls: el.className, text: (el.textContent || '').trim().slice(0, 14),
        right: Math.round(el.getBoundingClientRect().right), w: Math.round(el.getBoundingClientRect().width),
      }));
    return { bodyScrollWidth: body.scrollWidth, bodyClientWidth: body.clientWidth, modalWidth: Math.round(modal.getBoundingClientRect().width), limit: Math.round(limit), wide };
  });
  await mobile.screenshot({ path: '07-mobile-editor.png' });

  out.errors = errors;
  fs.writeFileSync('measurements.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });

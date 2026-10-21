#!/usr/bin/env node
/* Приёмка 0.671: ввод в редакторе «Таб-вставка» как в Guitar Pro.
 *
 * На компьютере панели кнопок нет — только стан и клавиатура; цифра ставит
 * лад и курсор сам уходит на следующую долю. Панель кнопок остаётся на
 * телефоне, там проверяются тапы.
 *
 *   STRUCHORD_URL=http://127.0.0.1:8000/STRUCHORD.html \
 *   LD_LIBRARY_PATH=/tmp/libs/lib node dev/bench/tab-editor-0.671-live.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const crypto = require('crypto');
const puppeteer = require('puppeteer-core');

const root = path.join(__dirname, '..', '..');
const output = path.resolve(process.env.B12_TAB_RESULTS || path.join(__dirname, 'results', 'tab-editor-0.671'));
const base = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const htmlBytes = fs.readFileSync(path.join(root, 'STRUCHORD.html'));
const artifact = { sha256: crypto.createHash('sha256').update(htmlBytes).digest('hex'), bytes: htmlBytes.length };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], errors = [];
const measurements = {};

function check(name, condition, details) {
  checks.push({ name, ok: !!condition, ...(details === undefined ? {} : { details }) });
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${details === undefined ? '' : ' — ' + JSON.stringify(details)}`);
  assert.ok(condition, name);
}

const stateOf = page => page.evaluate(() => ({
  notes: JSON.parse(JSON.stringify(tabInsertEditorState.draft.notes)),
  cursor: { ...tabAtCursor },
  input: { ...tabAtInput },
}));

// Пауза чуть больше окна склейки двузначного лада: за неё курсор успевает уйти.
const settle = ms => wait(ms === undefined ? 900 : ms);

async function openEditor(page) {
  await page.evaluate(() => {
    startNewSongFromHome();
    if (!sections.length) addSection();
    if (!sections[0].squares.length) addSquare(sections[0].id);
    addTabInsert(sections[0].id);
  });
  await page.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 30000 });
  await wait(2200);
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/tmp/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    defaultViewport: { width: 1280, height: 900 },
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push('page: ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction('typeof addTabInsert === "function"');
    await openEditor(page);

    measurements.mount = await page.evaluate(() => {
      const host = document.querySelector('.tab-at-host');
      const svg = [...host.querySelectorAll('svg')].sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
      const tools = document.querySelector('.tab-tools');
      return {
        hostWidth: Math.round(host.getBoundingClientRect().width),
        hostScrollWidth: host.scrollWidth,
        svgWidth: svg ? Math.round(svg.getBoundingClientRect().width) : null,
        scale: tabAtApi.settings.display.scale,
        bars: tabAtState.barCount,
        beats: tabAtState.beats,
        cursor: { ...tabAtCursor },
        toolsDisplay: tools ? getComputedStyle(tools).display : null,
        hintText: (document.querySelector('.tab-editor-hint') || {}).textContent.trim().slice(0, 60),
      };
    });
    check('стан alphaTab построен (svg на месте)', measurements.mount.svgWidth > 100, measurements.mount);
    check('стан укладывается в ширину без прокрутки', measurements.mount.hostScrollWidth <= measurements.mount.hostWidth + 1, measurements.mount);
    check('на компьютере панели кнопок нет — только стан и клавиатура',
      measurements.mount.toolsDisplay === 'none', measurements.mount.toolsDisplay);
    check('курсор стоит на первой доле шестой струны', measurements.mount.cursor.start === 0 && measurements.mount.cursor.string === 0);
    check('по умолчанию выбрана 1/4', measurements.mount.cursor && (await page.evaluate(() => tabAtInput.dValue)) === 4);
    await page.screenshot({ path: path.join(output, 'e01-empty.png') });

    // 1. Цифра ставит ноту и сама уводит курсор дальше — как в GP.
    await page.keyboard.press('Digit5');
    await settle();
    let st = await stateOf(page);
    check('цифра 5 ставит ноту лада 5 на шестой струне',
      st.notes.length === 1 && st.notes[0].fret === 5 && st.notes[0].string === 0, st.notes);
    check('после ввода курсор сам перешёл на следующую долю (1/4)',
      st.cursor.start === 1, st.cursor);

    // 2. Набор подряд: 3, 12, 0 без единой стрелки.
    await page.keyboard.press('Digit3');
    await settle();
    await page.keyboard.press('Digit1');
    await page.keyboard.press('Digit2');
    await settle();
    await page.keyboard.press('Digit0');
    await settle();
    st = await stateOf(page);
    measurements.typed = st.notes;
    check('набор подряд без стрелок даёт четыре ноты подряд',
      st.notes.length === 4, st.notes.map(n => [n.start, n.fret]));
    check('две цифры подряд складываются в лад 12', st.notes.some(n => n.fret === 12), st.notes.map(n => n.fret));
    check('позиции идут по длительности четверти', st.notes.map(n => n.start).join(',') === '0,1,2,3', st.notes.map(n => n.start));
    check('после четвёртой ноты курсор остановился в конце такта, а не ушёл за него',
      st.cursor.start === 3.75 && st.cursor.string === 0, st.cursor);

    // 3. Двузначный лад — один шаг отмены.
    const historyBeforeDouble = await page.evaluate(() => tabInsertEditorState.history.length);
    await page.evaluate(() => tabAtSetCursor(0, 0));
    await page.keyboard.press('Digit2');
    await page.keyboard.press('Digit4');
    await settle();
    st = await stateOf(page);
    const historyAfterDouble = await page.evaluate(() => tabInsertEditorState.history.length);
    check('2 и 4 подряд дают лад 24', st.notes.some(n => n.start === 0 && n.fret === 24), st.notes);
    check('двузначный лад — ровно один шаг истории', historyAfterDouble - historyBeforeDouble === 1, { before: historyBeforeDouble, after: historyAfterDouble });
    await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control');
    await settle(600);
    await page.evaluate(() => tabAtSetCursor(0, 0));
    await page.keyboard.press('Digit5');
    await settle();

    // 4. Струны: ↑/↓ двигают курсор, ввод идёт на выбранную струну.
    await page.evaluate(() => tabAtSetCursor(0, 0));
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Digit3');
    await settle();
    st = await stateOf(page);
    check('↑ переносит курсор на пятую струну', st.notes.some(n => n.start === 0 && n.string === 1 && n.fret === 3), st.notes);
    check('ввод на занятую долю не уводит курсор — можно доставить струну',
      st.cursor.start === 0 && st.cursor.string === 1, st.cursor);

    // Свободная доля в середине такта: ввод на выбранной струне + авто-переход.
    await page.evaluate(() => tabAtSetCursor(1.5, 2));
    await page.keyboard.press('Digit7');
    await settle();
    st = await stateOf(page);
    // Курсор ушёл ровно на длину ноты: до следующей ноты было полдоли,
    // поэтому и длительность, и шаг — 1/2 (свободное место важнее выбранного 1/4).
    check('на свободной доле ввод идёт на выбранную струну и курсор уходит дальше',
      st.notes.some(n => n.start === 1.5 && n.string === 2 && n.fret === 7) &&
      st.cursor.start === 2 && st.cursor.string === 2, { cursor: st.cursor, notes: st.notes.filter(n => n.start === 1.5) });

    // Созвучие: ↑ сразу после цифры — курсор остаётся, вторая струна встаёт туда же.
    await page.evaluate(() => tabAtSetCursor(1.5, 2));
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Digit5');
    await settle();
    st = await stateOf(page);
    check('↑ сразу после цифры добавляет струну в ту же долю (созвучие)',
      st.notes.filter(n => n.start === 1.5).length === 2, st.notes.filter(n => n.start === 1.5));
    await page.evaluate(() => tabAtSetCursor(0, 0));
    await settle(200);
    await page.screenshot({ path: path.join(output, 'e02-typed.png') });

    // 5. Клик по стану и ввод в месте клика.
    const box = await (await page.$('.tab-at-host')).boundingBox();
    await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.55);
    await wait(500);
    const clicked = await page.evaluate(() => ({ ...tabAtCursor }));
    await page.keyboard.press('Digit7');
    await settle();
    st = await stateOf(page);
    check('клик по стану переносит курсор в место клика', clicked.start > 0.5 && clicked.start < 3.5, clicked);
    check('ввод после клика создаёт ноту в этом месте',
      st.notes.some(n => n.start === clicked.start && n.fret === 7), { clicked, notes: st.notes.length });
    await page.screenshot({ path: path.join(output, 'e03-click.png') });

    // 6. Удаление.
    await page.evaluate(start => tabAtSetCursor(start, tabAtCursor.string), clicked.start);
    await page.keyboard.press('Delete');
    await settle();
    st = await stateOf(page);
    check('Delete убирает ноту под курсором', !st.notes.some(n => n.start === clicked.start && n.fret === 7), st.notes.length);

    // 7. Пауза.
    await page.evaluate(() => tabAtSetCursor(2, 0));
    await page.keyboard.press('KeyR');
    await settle();
    st = await stateOf(page);
    check('R ставит паузу на выбранной доле', st.notes.some(n => n.pause), st.notes.filter(n => n.pause));
    check('пауза не уводит курсор', st.cursor.start === 2, st.cursor);
    await page.keyboard.press('KeyR');
    await settle();
    st = await stateOf(page);
    check('повторное R снимает паузу', !st.notes.some(n => n.pause), st.notes.length);

    // 8. Длительность клавишами − и =, без кнопок.
    await page.evaluate(() => tabAtSetCursor(3, 0));
    await page.keyboard.press('Minus');
    await settle(300);
    const durAfterMinus = await page.evaluate(() => tabAtInput.dValue);
    await page.keyboard.press('Digit4');
    await settle();
    st = await stateOf(page);
    check('«−» уменьшает длительность до 1/8', durAfterMinus === 8, durAfterMinus);
    check('новая нота записана длительностью 1/8', st.notes.some(n => n.start === 3 && n.dur === 0.5), st.notes.filter(n => n.start === 3));
    await page.keyboard.press('Equal');
    await settle(300);
    check('«=» возвращает 1/4', (await page.evaluate(() => tabAtInput.dValue)) === 4);

    // 9. Точка и триоль клавишами.
    await page.evaluate(() => tabAtSetCursor(0, 4));
    await page.keyboard.press('Period');
    await settle(200);
    await page.keyboard.press('Digit9');
    await settle();
    st = await stateOf(page);
    check('«.» записывает точку', st.notes.some(n => n.start === 0 && n.dots === 1), st.notes.filter(n => n.start === 0));
    await page.keyboard.press('Period');
    await page.evaluate(() => tabAtSetCursor(0, 5));
    await page.keyboard.press('Slash');
    await settle(200);
    await page.keyboard.press('Digit8');
    await settle();
    st = await stateOf(page);
    check('«/» записывает триоль', st.notes.some(n => n.start === 0 && n.triplet === true), st.notes.filter(n => n.start === 0));
    await page.keyboard.press('Slash');
    await settle(200);
    await page.screenshot({ path: path.join(output, 'e04-durations.png') });

    // 10. Отмена и повтор черновика.
    const beforeUndo = await stateOf(page);
    await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control');
    await wait(700);
    const afterUndo = await stateOf(page);
    check('Ctrl+Z отменяет последнюю правку черновика',
      JSON.stringify(beforeUndo.notes) !== JSON.stringify(afterUndo.notes), { before: beforeUndo.notes.length, after: afterUndo.notes.length });
    await page.keyboard.down('Control'); await page.keyboard.down('Shift'); await page.keyboard.press('KeyZ');
    await page.keyboard.up('Shift'); await page.keyboard.up('Control');
    await wait(700);
    check('Ctrl+Shift+Z возвращает отменённое',
      JSON.stringify((await stateOf(page)).notes) === JSON.stringify(beforeUndo.notes));

    measurements.draft = await stateOf(page);
    await page.click('[data-tab-apply]');
    await wait(900);
    measurements.saved = await page.evaluate(() => {
      const sq = sections[0].squares.find(s => s.type === 'tab');
      return sq ? { beats: sq.beats, notes: JSON.parse(JSON.stringify(sq.notes)) } : null;
    });
    check('«Применить» переносит ноты в песню',
      measurements.saved && measurements.saved.notes.length === measurements.draft.notes.length, measurements.saved && measurements.saved.notes.length);
    check('редактор закрыт после «Применить»', !(await page.$('.tab-insert-editor')));
    await page.screenshot({ path: path.join(output, 'e05-applied.png') });

    // 11. Повторный вход и сохранение.
    await page.evaluate(() => {
      const sq = sections[0].squares.find(s => s.type === 'tab');
      openTabInsertEditor(sections[0].id, sq.id);
    });
    await page.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 30000 });
    await wait(1800);
    const reopened = await stateOf(page);
    check('повторное открытие показывает те же ноты',
      JSON.stringify(reopened.notes) === JSON.stringify(measurements.saved.notes), reopened.notes.length);
    await page.screenshot({ path: path.join(output, 'e06-reopened.png') });
    await page.click('[data-tab-cancel]');
    await wait(500);

    // 12. Телефон: панель есть, тапы работают.
    const mobile = await browser.newPage();
    mobile.on('pageerror', e => errors.push('mobile page: ' + String(e)));
    await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await mobile.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await mobile.waitForFunction('typeof addTabInsert === "function"');
    await openEditor(mobile);
    await wait(1400);
    measurements.mobile = await mobile.evaluate(() => {
      const host = document.querySelector('.tab-at-host');
      const tools = document.querySelector('.tab-tools');
      const keys = [...document.querySelectorAll('.tab-fret-key')];
      const r = keys[0] ? keys[0].getBoundingClientRect() : null;
      return {
        docScrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        hostWidth: Math.round(host.getBoundingClientRect().width),
        hostScrollWidth: host.scrollWidth,
        toolsDisplay: tools ? getComputedStyle(tools).display : null,
        keySize: r ? [Math.round(r.width), Math.round(r.height)] : null,
        keys: keys.length,
        columns: getComputedStyle(document.querySelector('.tab-fret-pad')).gridTemplateColumns.split(' ').length,
      };
    });
    check('на телефоне нет горизонтальной прокрутки страницы',
      measurements.mobile.docScrollWidth === measurements.mobile.clientWidth, measurements.mobile);
    check('стан подогнан по ширине контейнера',
      measurements.mobile.hostScrollWidth <= measurements.mobile.hostWidth + 1, measurements.mobile);
    check('на телефоне панель показана', measurements.mobile.toolsDisplay !== 'none', measurements.mobile.toolsDisplay);
    check('лад-пад: 10 клавиш в 5 колонок, высота не меньше 42 px',
      measurements.mobile.keys === 10 && measurements.mobile.columns === 5 && measurements.mobile.keySize[1] >= 42, measurements.mobile);

    const tap = async sel => {
      await mobile.evaluate(s => { const el = document.querySelector(s); if (el) el.scrollIntoView({ block: 'center' }); }, sel);
      await mobile.evaluate(s => { const el = document.querySelector(s); if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }, sel);
      // Ждём дольше окна склейки двузначного лада: только тогда видно,
      // куда уехал курсор после автоперехода.
      await wait(820);
      if (process.env.B12_DEBUG) console.log('tap', sel, JSON.stringify(await stateOf(mobile)));
    };
    await tap('[data-tab-digit="3"]');
    const afterDigit = await stateOf(mobile);
    await tap('[data-tab-string-step="1"]');
    const afterString = await stateOf(mobile);
    await tap('[data-tab-digit="5"]');
    const afterSecond = await stateOf(mobile);
    await tap('[data-tab-dur="16"]');
    await tap('[data-tab-digit="7"]');
    await wait(700);
    const mobileState = await stateOf(mobile);
    measurements.mobile.notes = mobileState.notes;
    measurements.mobile.steps = { afterDigit, afterString, afterSecond };
    check('тап по цифре ставит ноту и уводит курсор дальше',
      afterDigit.notes.some(n => n.fret === 3 && n.string === 0) && afterDigit.cursor.start === 1, afterDigit.cursor);
    check('тап по ↑ переносит курсор на пятую струну', afterString.cursor.string === 1, afterString.cursor);
    check('следующий тап по цифре пишется на выбранной струне',
      afterSecond.notes.some(n => n.fret === 5 && n.string === 1), afterSecond.notes);
    check('тап по 1/16 меняет длительность, следующий ввод — на той же струне',
      mobileState.notes.some(n => n.fret === 7 && n.string === 1 && n.dur === 0.25), mobileState.notes);
    await mobile.screenshot({ path: path.join(output, 'm01-taps.png') });
    await mobile.close();

    check('нет ошибок выполнения', errors.length === 0, errors.slice(0, 5));
  } finally {
    await browser.close();
  }
  const okCount = checks.filter(c => c.ok).length;
  fs.writeFileSync(path.join(output, 'measurements.json'), JSON.stringify({ artifact, checks, measurements, errors }, null, 2));
  console.log(`\nитого: ${okCount} ok, ${checks.length - okCount} FAIL`);
  if (okCount !== checks.length) process.exitCode = 1;
})().catch(error => { console.error('FATAL', error); process.exit(1); });

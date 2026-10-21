#!/usr/bin/env node
/* Приёмка 0.670: стан alphaTab в редакторе «Таб-вставка».
 * Проверяем живьём то, что видит пользователь: ввод лада цифрами,
 * ↑/↓ струны, клик по стану и ввод в месте клика, удаление, пауза,
 * длительности, точка, триоль, отмену и сохранение результата.
 *
 *   STRUCHORD_URL=http://127.0.0.1:8000/STRUCHORD.html \
 *   node dev/bench/tab-editor-0.670-live.js
 *   (нужен Chromium: LD_LIBRARY_PATH=/tmp/libs/lib)
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const crypto = require('crypto');
const puppeteer = require('puppeteer-core');

const root = path.join(__dirname, '..', '..');
const output = path.resolve(process.env.B12_TAB_RESULTS || path.join(__dirname, 'results', 'tab-editor-0.670'));
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
      return {
        hostWidth: Math.round(host.getBoundingClientRect().width),
        hostScrollWidth: host.scrollWidth,
        svgWidth: svg ? Math.round(svg.getBoundingClientRect().width) : null,
        svgHeight: svg ? Math.round(svg.getBoundingClientRect().height) : null,
        scale: tabAtApi.settings.display.scale,
        bars: tabAtState.barCount,
        beats: tabAtState.beats,
        cursor: { ...tabAtCursor },
        pressedDur: [...document.querySelectorAll('[data-tab-dur]')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.tabDur),
      };
    });
    check('стан alphaTab построен (svg на месте)', measurements.mount.svgWidth > 100, measurements.mount);
    check('стан укладывается в ширину без прокрутки', measurements.mount.hostScrollWidth <= measurements.mount.hostWidth + 1, measurements.mount);
    check('курсор стоит на первой доле шестой струны', measurements.mount.cursor.start === 0 && measurements.mount.cursor.string === 0);
    check('выбрана длительность 1/4', measurements.mount.pressedDur.join(',') === '4');
    await page.screenshot({ path: path.join(output, 'e01-empty.png') });

    // 1. Ввод лада цифрой.
    await page.keyboard.press('Digit5');
    await wait(800);
    let st = await stateOf(page);
    check('цифра 5 ставит ноту лада 5 на шестой струне',
      st.notes.length === 1 && st.notes[0].fret === 5 && st.notes[0].string === 0, st.notes);
    check('курсор после ввода стоит на месте', st.cursor.start === 0, st.cursor);

    // 2. Стрелки: доля вправо и ввод.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Digit3');
    await wait(800);
    st = await stateOf(page);
    check('→ сдвигает курсор на соседнюю долю, ввод ставит туда ноту',
      st.cursor.start > 0 && st.notes.some(n => n.start === st.cursor.start && n.fret === 3), st.notes);

    // 3. Двузначный лад — одна отмена.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Digit1');
    await page.keyboard.press('Digit2');
    await wait(800);
    const beforeTwo = await page.evaluate(() => tabInsertEditorState.history.length);
    st = await stateOf(page);
    check('две цифры подряд дают лад 12', st.notes.some(n => n.fret === 12), st.notes);
    check('двузначный лад — один шаг истории', beforeTwo - 2 === 1, { history: beforeTwo });

    // 4. ↑/↓ и ввод: прежний баг — нота оставалась на нижней струне.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Digit0');
    await wait(800);
    st = await stateOf(page);
    const upNote = st.notes.find(n => n.start === st.cursor.start);
    check('↑ переносит курсор на пятую струну', st.cursor.string === 1, st.cursor);
    check('после ↑ нота встаёт на пятую струну, а не на шестую', upNote && upNote.string === 1 && upNote.fret === 0, upNote);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Digit2');
    await wait(800);
    st = await stateOf(page);
    check('несколько ↑ двигают курсор дальше, ввод пишется на четвёртой струне',
      st.cursor.string === 4 && st.notes.some(n => n.start === st.cursor.start && n.string === 4 && n.fret === 2), st.cursor);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await wait(400);
    check('↓ возвращает курсор на шестую струну', (await page.evaluate(() => tabAtCursor.string)) === 0);
    await page.screenshot({ path: path.join(output, 'e02-four-notes.png') });

    // 5. Клик по стану и ввод в месте клика.
    const box = await (await page.$('.tab-at-host')).boundingBox();
    await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.55);
    await wait(600);
    const clicked = await page.evaluate(() => ({ ...tabAtCursor }));
    await page.keyboard.press('Digit7');
    await wait(800);
    st = await stateOf(page);
    check('клик по стану переносит курсор в место клика',
      clicked.start > 0.5 && clicked.start < 3.5, clicked);
    check('ввод после клика создаёт ноту в этом месте',
      st.notes.some(n => n.start === clicked.start && n.fret === 7), { clicked, notes: st.notes });
    await page.screenshot({ path: path.join(output, 'e03-click.png') });

    // 6. Удаление.
    await page.keyboard.press('Delete');
    await wait(800);
    st = await stateOf(page);
    check('Delete убирает ноту под курсором',
      !st.notes.some(n => n.start === clicked.start && n.fret === 7), st.notes);

    // 7. Пауза.
    await page.evaluate(() => tabAtSetCursor(2.5, 0));
    await page.keyboard.press('KeyR');
    await wait(700);
    st = await stateOf(page);
    const rest = st.notes.find(n => n.pause);
    check('R ставит паузу на выбранной доле', !!rest, st.notes);
    await page.keyboard.press('KeyR');
    await wait(700);
    st = await stateOf(page);
    check('повторное R снимает паузу', !st.notes.some(n => n.pause), st.notes);

    // 8. Длительности.
    await page.evaluate(() => tabAtSetCursor(3, 2));
    await page.click('[data-tab-dur="8"]');
    await page.keyboard.press('Digit4');
    await wait(900);
    st = await stateOf(page);
    const eighth = st.notes.find(n => n.start === 3);
    check('длительность 1/8 применяется к новой ноте', eighth && eighth.dur === 0.5, eighth);
    check('панель показывает 1/8 активной', (await page.evaluate(() => tabAtInput.dValue)) === 8);

    // 9. Точка.
    await page.click('[data-tab-flag="dot"]');
    await page.evaluate(() => tabAtSetCursor(3, 1));
    await page.keyboard.press('Digit9');
    await wait(900);
    st = await stateOf(page);
    const dotted = st.notes.find(n => n.start === 3 && n.string === 1);
    check('точка записывается в модель (dots: 1)', dotted && dotted.dots === 1, dotted);
    await page.click('[data-tab-flag="dot"]');

    // 10. Триоль.
    await page.click('[data-tab-flag="triplet"]');
    await page.evaluate(() => tabAtSetCursor(3, 3));
    await page.keyboard.press('Digit6');
    await wait(900);
    st = await stateOf(page);
    const triplet = st.notes.find(n => n.start === 3 && n.string === 3);
    check('триоль записывается в модель (triplet: true)', triplet && triplet.triplet === true, triplet);
    await page.click('[data-tab-flag="triplet"]');
    await page.screenshot({ path: path.join(output, 'e04-durations.png') });

    // 11. Отмена и повтор внутри черновика.
    const beforeUndo = await stateOf(page);
    await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control');
    await wait(800);
    const afterUndo = await stateOf(page);
    check('Ctrl+Z отменяет последнюю правку черновика',
      JSON.stringify(beforeUndo.notes) !== JSON.stringify(afterUndo.notes), { before: beforeUndo.notes.length, after: afterUndo.notes.length });
    await page.keyboard.down('Control'); await page.keyboard.down('Shift'); await page.keyboard.press('KeyZ');
    await page.keyboard.up('Shift'); await page.keyboard.up('Control');
    await wait(800);
    const afterRedo = await stateOf(page);
    check('Ctrl+Shift+Z возвращает отменённое',
      JSON.stringify(afterRedo.notes) === JSON.stringify(beforeUndo.notes), afterRedo.notes.length);

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

    // 12. Повторный вход: модель та же, стан строится из сохранённых нот.
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

    // 13. Мобильный вид и тапы.
    const mobile = await browser.newPage();
    mobile.on('pageerror', e => errors.push('mobile page: ' + String(e)));
    await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await mobile.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await mobile.waitForFunction('typeof addTabInsert === "function"');
    await openEditor(mobile);
    await wait(1400);
    measurements.mobile = await mobile.evaluate(() => {
      const host = document.querySelector('.tab-at-host');
      const keys = [...document.querySelectorAll('.tab-fret-key')];
      const r = keys[0] ? keys[0].getBoundingClientRect() : null;
      return {
        docScrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        hostWidth: Math.round(host.getBoundingClientRect().width),
        hostScrollWidth: host.scrollWidth,
        keySize: r ? [Math.round(r.width), Math.round(r.height)] : null,
        keys: keys.length,
        columns: getComputedStyle(document.querySelector('.tab-fret-pad')).gridTemplateColumns.split(' ').length,
      };
    });
    check('на телефоне нет горизонтальной прокрутки страницы',
      measurements.mobile.docScrollWidth === measurements.mobile.clientWidth, measurements.mobile);
    check('стан подогнан по ширине контейнера',
      measurements.mobile.hostScrollWidth <= measurements.mobile.hostWidth + 1, measurements.mobile);
    check('лад-пад на телефоне: 10 клавиш в 5 колонок, высота не меньше 42 px',
      measurements.mobile.keys === 10 && measurements.mobile.columns === 5 && measurements.mobile.keySize[1] >= 42, measurements.mobile);

    const tap = async sel => {
      await mobile.evaluate(s => { const el = document.querySelector(s); if (el) el.scrollIntoView({ block: 'center' }); }, sel);
      await mobile.evaluate(s => { const el = document.querySelector(s); if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }, sel);
      await wait(450);
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
    check('тап по цифре ставит ноту', afterDigit.notes.some(n => n.fret === 3 && n.string === 0), afterDigit.notes);
    check('тап по ↑ переносит курсор на пятую струну', afterString.cursor.string === 1, afterString.cursor);
    check('следующий тап по цифре пишется на выбранной струне',
      afterSecond.notes.some(n => n.fret === 5 && n.string === 1), afterSecond.notes);
    check('тап по 1/16 меняет длительность, повторный ввод меняет лад на той же струне',
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

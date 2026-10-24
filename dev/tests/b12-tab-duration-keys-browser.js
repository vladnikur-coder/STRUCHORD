#!/usr/bin/env node
// GP8: +/= укорачивают, минус удлиняет. Основная клавиатура и Numpad.
// Fixtures через модель; проверяемые действия — реальные клавиши Chromium.
const {isDeepStrictEqual} = require('util');
const fs = require('fs'), path = require('path'), assert = require('assert/strict'), crypto = require('crypto');
const chromium = require('@sparticuz/chromium').default, puppeteer = require('puppeteer-core');
const root = path.resolve(__dirname, '../..');
const output = process.env.B12_DURATION_RESULTS ? path.resolve(process.env.B12_DURATION_RESULTS) : null;
const checks = [], errors = [], wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ': ' + JSON.stringify(detail)}`);
  assert.ok(ok, name);
}
(async () => {
  const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args,
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib' } });
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html', { waitUntil: 'load' });
    await page.evaluate(() => { startNewSongFromHome(); addSection('Verse'); addTabInsert(sections[0].id); });
    await page.waitForSelector('.tab-at-host svg'); await wait(300);
    const state = () => page.evaluate(() => ({ notes: structuredClone(tabInsertEditorState.draft.notes),
      cursor: { ...tabAtCursor }, input: { ...tabAtInput }, history: tabInsertEditorState.history.length }));
    const press = async key => { await page.keyboard.press(key); await wait(60); };
    async function shortcut(shift = false) {
      await page.keyboard.down('Control');
      if (shift) await page.keyboard.down('Shift');
      await press('KeyZ');
      if (shift) await page.keyboard.up('Shift');
      await page.keyboard.up('Control');
    }
    async function fixture(dots = false, triplet = false, empty = false, dValue = 4) {
      await page.evaluate(({ dots, triplet, empty, dValue }) => {
        const editor = tabInsertEditorState, flags = { ...(dots ? { dots: 1 } : {}), ...(triplet ? { triplet: true } : {}) };
        const length = (dots ? 1.5 : 1) * (triplet ? 2 / 3 : 1);
        editor.draft.notes = empty ? [] : [
          { start: 0, string: 0, fret: 3, dur: 1, ...flags },
          { start: 0, string: 1, fret: 5, dur: 1, ...flags },
          { start: length, string: 0, fret: 7, dur: .5 },
        ];
        editor.draft.beats = 4; editor.history = []; editor.forward = [];
        tabAtCursor = { start: 0, string: 0 }; tabAtInput = { dValue, dots: dots ? 1 : 0, triplet };
        tabAtLastDigit = null; tabAtRender(editor);
      }, { dots, triplet, empty, dValue });
      await wait(150); await page.evaluate(() => tabAtSetCursor(0, 0));
      await page.$eval('.tab-at-host', element => element.focus());
    }
    for (const [key, shift, expected] of [['Equal', false, .5], ['Equal', true, .5], ['NumpadAdd', false, .5], ['Minus', false, 2], ['NumpadSubtract', false, 2]]) {
      for (const [dots, triplet] of [[false, false], [true, false], [false, true], [true, true]]) {
        await fixture(dots, triplet); const before = await state();
        if (shift) await page.keyboard.down('Shift');
        await press(key);
        if (shift) await page.keyboard.up('Shift');
        const after = await state(), label = `${shift ? 'Shift+' : ''}${key}, точка=${dots}, триоль=${triplet}`;
        const factor = (dots ? 1.5 : 1) * (triplet ? 2 / 3 : 1);
        check(`${label}: GP-направление обеих нот созвучия`, after.notes.length === 3 && after.notes.slice(0, 2).every(n => n.dur === expected) && after.input.dValue === 4 / expected, after);
        check(`${label}: знаки и лады сохранены, хвост сдвинут правильно`, after.notes.slice(0, 2).every(n => !!n.dots === dots && !!n.triplet === triplet) && after.notes.map(n => n.fret).join() === '3,5,7' && Math.abs(after.notes[2].start - expected * factor) < 1e-8, after);
        check(`${label}: курсор не сдвинут, один шаг Undo`, after.cursor.start === 0 && after.cursor.string === 0 && after.history === 1, after);
        await shortcut(); check(`${label}: Undo вернул исходные ноты`, isDeepStrictEqual((await state()).notes,before.notes));
        await shortcut(true); check(`${label}: Redo вернул новую длительность`, isDeepStrictEqual((await state()).notes,after.notes));
      }
    }
    for (const [dValue, key] of [[64, 'Equal'], [64, 'NumpadAdd'], [1, 'Minus'], [1, 'NumpadSubtract']]) {
      await fixture(false, false, true, dValue); await press(key); const after = await state();
      check(`${key}: предел 1/${dValue} не пересекается`, after.input.dValue === dValue && after.notes.length === 0 && after.cursor.start === 0, after);
    }
    await fixture(false, false, true); await press('Equal'); let after = await state();
    check('пустое место: + выбирает восьмую без записи ноты', after.input.dValue === 8 && after.notes.length === 0 && after.cursor.start === 0, after);
    await press('ArrowRight'); await press('Digit3'); await wait(850); after = await state();
    check('0.678: пустой такт пропущен, восьмая в новом такте без автоперехода', after.cursor.start === 4 && after.notes.length === 1 && after.notes[0].start === 4 && after.notes[0].dur === .5 && after.notes[0].fret === 3, after);
    check('нет ошибок JavaScript', errors.length === 0, errors);
    if (output) {
      fs.mkdirSync(output, { recursive: true }); const html = fs.readFileSync(path.join(root, 'STRUCHORD.html'));
      fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ sha256: crypto.createHash('sha256').update(html).digest('hex'), bytes: html.length, checks, errors }, null, 2) + '\n');
    }
    console.log(`${checks.length} ok / 0 FAIL`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });

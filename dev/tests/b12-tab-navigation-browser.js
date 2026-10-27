#!/usr/bin/env node
// 0.678: соседние позиции, пустые места, расширение 1–4 такта и история.
const fs = require('fs'), path = require('path'), assert = require('assert/strict'), crypto = require('crypto');
const chromium = require('@sparticuz/chromium').default, puppeteer = require('puppeteer-core');
const root = path.resolve(__dirname, '../..'), output = process.env.B12_NAV_RESULTS ? path.resolve(process.env.B12_NAV_RESULTS) : null;
const checks = [], errors = [], wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function check(name, ok, details) {
  checks.push({ name, ok: !!ok, details }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ': ' + JSON.stringify(details)}`); assert.ok(ok, name);
}
const note = (start, dur, fret = 3, string = 0, flags = {}) => ({ start, dur, string, fret, ...flags });
(async () => {
  if (output) fs.mkdirSync(output, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args,
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib' } });
  try {
    for (const [width, height, touch] of [[1280, 900, false], [390, 844, true], [1024, 768, true]]) {
      const page = await browser.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.setViewport({ width, height, isMobile: touch, hasTouch: touch });
      await page.goto(process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html', { waitUntil: 'load' });
      await page.evaluate(() => { startNewSongFromHome(); addSection('Verse'); addTabInsert(sections[0].id); });
      await page.waitForSelector('.tab-at-host svg'); await wait(300);
      const state = () => page.evaluate(() => ({ cursor: { ...tabAtCursor }, input: { ...tabAtInput }, notes: structuredClone(tabInsertEditorState.draft.notes),
        beats: tabInsertEditorState.draft.beats, history: tabInsertEditorState.history?.length || 0, forward: tabInsertEditorState.forward?.length || 0 }));
      async function fixture(notes = [], start = 0, beats = 4, ts = '4/4', dValue = 4, flags = {}) {
        await page.evaluate(({ notes, start, beats, ts, dValue, flags }) => {
          sections[0].timeSig = ts; const e = tabInsertEditorState;
          e.draft.notes = notes; e.draft.beats = beats; e.history = []; e.forward = [];
          tabAtInput = { dValue, dots: flags.dots || 0, triplet: !!flags.triplet }; tabAtCursor = { start, string: 0 }; tabAtLastDigit = null; tabAtRender(e);
        }, { notes, start, beats, ts, dValue, flags });
        await wait(180); await page.evaluate(start => tabAtSetCursor(start, 0), start);
      }
      async function key(k) { await page.$eval('.tab-at-host', e => e.focus()); await page.keyboard.press(k); await wait(70); }
      async function button(selector) {
        await page.$eval(selector, e => e.scrollIntoView({ block: 'center' })); await wait(40);
        if (touch) await page.tap(selector); else await page.click(selector); await wait(100);
      }
      async function undo(redo = false) {
        await page.$eval('.tab-at-host', e => e.focus()); await page.keyboard.down('Control'); if (redo) await page.keyboard.down('Shift');
        await page.keyboard.press('KeyZ'); if (redo) await page.keyboard.up('Shift'); await page.keyboard.up('Control'); await wait(150);
      }
      async function position(label, expected, beats) {
        const s = await state(); check(`${width}: ${label}`, Math.abs(s.cursor.start - expected) < 1e-8 && (beats === undefined || s.beats === beats), s); return s;
      }
      async function aligned(label) {
        const d = await page.evaluate(() => {
          const pos = tabAtCursorPosition(tabAtApi), bb = tabAtBeatBoundsAt(tabAtApi, tabAtCursor.start), n = bb?.notes.find(n => n.note.string === tabAtCursor.string + 1)?.noteHeadBounds;
          return { x: pos?.x, y: pos?.y, dx: n ? Math.abs(pos.x - (n.x + n.w / 2)) : null, dy: n ? Math.abs(pos.y - (n.y + n.h / 2)) : null };
        }); check(`${width}: ${label}, маркер на головке <2 px`, d.dx !== null && d.dx < 2 && d.dy < 2, d);
      }
      async function shot(name) { if (output) { await page.$eval('.tab-at-host', e => e.scrollIntoView({ block: 'center' })); await wait(70); await page.screenshot({ path: path.join(output, `${name}-${width}.png`) }); } }
      const mixed = [note(0, 2), note(0, 2, 5, 1), note(2, .5, 7), { start: 2.5, dur: .5, pause: true }, note(3, 1, 9)];
      for (const mode of ['keyboard', 'buttons']) {
        await fixture(mixed, 2); const move = dir => mode === 'keyboard' ? key(dir < 0 ? 'ArrowLeft' : 'ArrowRight') : button(`[data-tab-time-step="${dir}"]`);
        await move(-1); await position(`${mode}: ← с восьмой возвращает на начало половинной`, 0); await aligned(mode);
        await move(1); await position(`${mode}: → пропускает длительность половинной`, 2);
        await move(1); let s = await position(`${mode}: → на явно записанную паузу`, 2.5);
        check(`${width}: ${mode}: палитра показывает восьмую паузу`, s.input.dValue === 8 && !s.input.triplet, s.input);
        await move(1); await position(`${mode}: → с паузы на следующую ноту`, 3); await aligned(mode);
        for (const expected of [2.5, 2, 0]) { await move(-1); await position(`${mode}: обратный проход ${expected}`, expected); }
        s = await state(); check(`${width}: ${mode}: навигация не меняет ноты/историю`, JSON.stringify(s.notes) === JSON.stringify(mixed) && s.history === 0, s);
      }
      await shot('mixed');
      await page.evaluate(() => tabAtSetCursor(2, 4)); await key('ArrowLeft'); let s = await state();
      check(`${width}: горизонтальный переход сохраняет выбранную струну`, s.cursor.start === 0 && s.cursor.string === 4, s.cursor);
      const rhythm = [note(0, 1, 3, 0, { dots: 1 }), note(1.5, .5, 5, 0, { triplet: true }), { start: 1.833333333, dur: .5, triplet: true, pause: true }];
      await fixture(rhythm, 1.5); await key('ArrowLeft'); await position('← с триоли на предыдущую ноту с точкой', 0);
      await key('ArrowRight'); await position('→ на триоль без округления', 1.5);
      await key('ArrowRight'); s = await position('→ на триольную паузу без округления', 1.833333333);
      check(`${width}: триольная пауза подтянула свою длительность/знаки`, s.input.dValue === 8 && s.input.triplet && s.input.dots === 0, s.input);
      await key('ArrowLeft'); await position('← с триольной паузы обратно', 1.5);
      await fixture([note(0, 2), note(3, 1, 7)]); await key('ArrowRight'); await position('→ на начало пустого промежутка', 2);
      await key('ArrowRight'); await position('шаг в пустоте не перескакивает следующую ноту', 3);
      await key('ArrowLeft'); await position('← с ноты на предыдущую паузу', 2);
      await key('ArrowLeft'); await position('← не попадает внутрь длинной ноты', 0);
      await fixture([note(0, 2)], 1); await key('ArrowLeft'); await position('клик внутри ноты: ← к её началу', 0);
      await page.evaluate(() => tabAtSetCursor(1, 0)); await key('ArrowRight'); await position('клик внутри ноты: → к её концу', 2);
      await fixture([note(1, .25), note(3, .5, 7)], 0, 4, '4/4', 1); await key('ArrowRight'); await position('длинный шаг в пустоте не пропускает короткую ноту', 1);
      for (const [dValue, flags, step] of [[4, {}, 1], [64, {}, .0625], [4, { dots: 1 }, 1.5], [8, { triplet: true }, 1 / 3]]) {
        await fixture([], 0, 4, '4/4', dValue, flags); await key('ArrowRight'); await position(`пустой такт 1/${dValue}: сразу следующий такт`, 4, 8);
        await key('ArrowLeft'); s = await position('пустой такт: обратно к 0 с автоуборкой временного такта', 0, 4);
        check(`${width}: пустые стрелки не записывают ноты/паузы и не оставляют пустой такт`, s.notes.length === 0 && s.beats === 4 && s.history === 0, s);
      }
      await fixture([note(3, 1), note(4, .5, 7)], 3, 8); await key('ArrowRight'); s = await position('переход в уже существующий второй такт', 4, 8);
      check(`${width}: переход между тактами без расширения не создаёт Undo`, s.history === 0, s);
      await key('ArrowLeft'); await position('← между тактами возвращает последнюю ноту предыдущего', 3);
      await fixture([note(0, 2, 3, 0, { dots: 1 }), note(3, 1, 5), note(4, 2, 7)], 3, 6, '6/8');
      await key('ArrowLeft'); await position('6/8: ← с восьмой на четверть с точкой', 0);
      await key('ArrowRight'); await position('6/8: → на восьмую', 3);
      await key('ArrowRight'); await position('6/8: → на четверть', 4);
      await key('ArrowRight'); await position('6/8: добавлен один такт, не четыре четверти', 6, 12);
      await undo(); await position('6/8: Undo вернул длину и курсор', 4, 6);
      await undo(true); await position('6/8: Redo вернул новый такт и курсор', 6, 12);
      await fixture([note(3, 1)], 3); await key('ArrowRight'); s = await position('→ добавляет ровно один такт', 4, 8);
      check(`${width}: расширение — один Undo без новых нот`, s.history === 1 && s.notes.length === 1, s);
      check(`${width}: курсор виден в новом пустом такте`, await page.evaluate(() => !document.querySelector('.tab-at-cursor').hidden && tabAtCursorPosition(tabAtApi).barIndex === 1));
      await undo(); await position('Undo расширения восстанавливает старую длину и позицию', 3, 4);
      await aligned('Undo расширения');
      await undo(true); await position('Redo расширения восстанавливает новый такт и позицию', 4, 8);
      await shot('extended');
      await key('Digit5'); await wait(850); s = await position('первая нота нового такта без автоперехода', 4, 8);
      check(`${width}: новая нота записана в новом такте`, s.notes.some(n => n.start === 4 && n.fret === 5), s);
      await undo(); s = await position('Undo ноты не отменяет расширение', 4, 8);
      check(`${width}: Undo ноты оставил исходную ноту`, s.notes.length === 1 && s.notes[0].start === 3, s);
      await undo(); await position('следующий Undo отменил только расширение', 3, 4);
      await fixture([note(3, 1)], 3);
      for (let i = 0; i < 12; i++) await key('ArrowRight');
      s = await position('достигнут четвёртый такт, больше не создано', 12, 16);
      check(`${width}: три расширения — три действия истории`, s.history === 3 && s.notes.length === 1, s);
      for (let i = 0; i < 3; i++) await button('[data-tab-time-step="1"]');
      await position('на пределе 4 тактов → останавливается', 12, 16);
      s = await state(); check(`${width}: отказ от пятого такта не создаёт историю`, s.history === 3, s);
      for (const [beats, start] of [[12, 8], [8, 4], [4, 3]]) { await undo(); await position('Undo каждого расширения', start, beats); }
      for (const [beats, start] of [[8, 4], [12, 8], [16, 12]]) { await undo(true); await position('Redo каждого расширения', start, beats); }
      await fixture([note(3, 1)], 3); await key('Digit1'); await key('ArrowRight'); await key('Digit2'); s = await state();
      check(`${width}: переход разрывает склейку двузначного лада`, s.notes.some(n => n.start === 3 && n.fret === 1) && s.notes.some(n => n.start === 4 && n.fret === 2), s);
      check(`${width}: до применения исходная вставка не расширена`, await page.evaluate(() => tabInsertTarget(tabInsertEditorState.secId, tabInsertEditorState.sqId).sq.beats === 4));
      await button('[data-tab-apply]'); await page.waitForSelector('.tab-insert-editor', { hidden: true });
      check(`${width}: Применить записало новую длину и две ноты`, await page.evaluate(() => { const sq = sections[0].squares.find(q => q.type === 'tab'); return sq.beats === 8 && sq.notes.length === 2 && sq.notes[1].start === 4; }));
      await page.evaluate(() => { const sq = sections[0].squares.find(q => q.type === 'tab'); openTabInsertEditor(sections[0].id, sq.id); }); await wait(250);
      await page.evaluate(() => tabAtSetCursor(7, 0)); await key('ArrowRight'); await position('повторная правка расширяет только черновик', 8, 12);
      await button('[data-tab-cancel]');
      // 0.691: у черновика есть несохранённые правки — приложение спрашивает
      // подтверждение, прежде чем выбросить их.
      const discard = await page.$('[data-tab-confirm-leave]');
      if (discard && (await page.evaluate((el) => !el.closest('[data-tab-confirm-discard]').hidden, discard)))
        await discard.click();
      await page.waitForSelector('.tab-insert-editor', { hidden: true });
      check(`${width}: Отмена не сохраняет новое расширение`, await page.evaluate(() => sections[0].squares.find(q => q.type === 'tab').beats === 8));
      await page.close();
    }
    check('нет ошибок JavaScript', errors.length === 0, errors);
    if (output) { const html = fs.readFileSync(path.join(root, 'STRUCHORD.html')); fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ sha256: crypto.createHash('sha256').update(html).digest('hex'), bytes: html.length, checks, errors }, null, 2) + '\n'); }
    console.log(`${checks.length} ok / 0 FAIL`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });

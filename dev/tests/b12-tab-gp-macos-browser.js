#!/usr/bin/env node
// Подтверждённый пользователем контракт GP8/macOS, не сертификация native GP.
// По умолчанию только краткий stdout; B12_GP_RESULTS включает шесть кадров.
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict');
const chromium = require('@sparticuz/chromium').default,
  puppeteer = require('puppeteer-core');
const { readScore, notes: oracleNotes } = require('./helpers/export-oracle');
const output = process.env.B12_GP_RESULTS;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let checks = 0;
const errors = [];
const note = (start, fret = 3, dur = 1, string = 0, flags = {}) => ({ start, fret, dur, string, ...flags });
function check(name, actual, expected = true) {
  assert.deepEqual(actual, expected, name);
  checks++;
}
(async () => {
  if (output) fs.mkdirSync(output, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib' },
  });
  try {
    for (const [width, height, touch] of [
      [1280, 900, false],
      [390, 844, true],
      [1024, 768, true],
    ]) {
      const page = await browser.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewport({ width, height, isMobile: touch, hasTouch: touch });
      await page.goto(process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html', {
        waitUntil: 'load',
      });
      await page.evaluate(() => {
        startNewSongFromHome();
        addSection('Verse');
        addTabInsert(sections[0].id);
      });
      await page.waitForSelector('.tab-at-host svg');
      const state = () =>
        page.evaluate(() => {
          const e = tabInsertEditorState;
          return {
            notes: structuredClone(e.draft.notes),
            cursor: { ...tabAtCursor },
            point: { ...e.gpCursor },
            input: { ...tabAtInput },
            beats: e.draft.beats,
            history: e.history?.length || 0,
            forward: e.forward?.length || 0,
            selected: !!e.gpSelection,
            disabled: e.overlay.querySelector('[data-tab-apply]').disabled,
            error: e.overlay.querySelector('[data-tab-gp-error]').textContent,
          };
        });
      async function fixture(
        notes = [],
        start = 0,
        beats = 4,
        ts = '4/4',
        input = { dValue: 4, dots: 0, triplet: false },
      ) {
        await page.evaluate(
          ({ notes, start, beats, ts, input }) => {
            const e = tabInsertEditorState;
            sections[0].timeSig = ts;
            e.draft.notes = notes;
            e.draft.beats = beats;
            e.history = [];
            e.forward = [];
            e.gpSelecting = false;
            tabAtLastDigit = null;
            tabAtInput = input;
            tabGpImport(e);
            tabAtRender(e);
            tabGpSetTime(e, start, 0);
            tabGpValidate(e);
          },
          { notes, start, beats, ts, input },
        );
        await wait(60);
      }
      async function key(key, mod, shift = false) {
        await page.$eval('.tab-at-host', (e) => e.focus());
        if (mod) await page.keyboard.down(mod);
        if (shift) await page.keyboard.down('Shift');
        await page.keyboard.press(key);
        if (shift) await page.keyboard.up('Shift');
        if (mod) await page.keyboard.up(mod);
        await wait(25);
      }
      async function button(selector) {
        await page.$eval(selector, (e) => e.scrollIntoView({ block: 'center' }));
        if (touch) await page.tap(selector);
        else await page.click(selector);
        await wait(40);
      }
      const frets = async () => (await state()).notes.filter((n) => !n.pause).map((n) => n.fret);
      const base = [note(0, 3), note(1, 5), note(2, 7), note(3, 9)];
      for (const theme of ['light', 'dark']) {
        await page.evaluate((theme) => setTheme(theme), theme);
        await wait(80);
        const prefix = `${width}/${theme}`;
        for (const input of [
          { dValue: 4, dots: 0, triplet: false },
          { dValue: 64, dots: 0, triplet: false },
          { dValue: 8, dots: 1, triplet: true },
        ]) {
          await fixture([], 0, 4, '4/4', input);
          await key('ArrowRight');
          let s = await state();
          check(
            `${prefix}: → пустого такта независимо от длительности`,
            [s.cursor.start, s.beats, s.input],
            [4, 8, input],
          );
          await key('KeyZ', 'Meta');
          s = await state();
          check(`${prefix}: Undo расширения`, [s.cursor.start, s.beats], [0, 4]);
          await key('KeyZ', 'Meta', true);
          s = await state();
          check(`${prefix}: Redo расширения`, [s.cursor.start, s.beats], [4, 8]);
        }
        await fixture();
        await key('1');
        await key('2');
        await wait(650);
        let s = await state();
        check(
          `${prefix}: 12, без автоперехода, один Undo`,
          [s.notes[0].fret, s.cursor.start, s.history],
          [12, 0, 1],
        );
        await key('KeyZ', 'Meta');
        check(`${prefix}: Undo двух цифр`, (await state()).notes.length, 0);
        await fixture([note(0, 1)]);
        await key('1');
        await key('2');
        await key('KeyZ', 'Meta');
        check(`${prefix}: первая цифра без изменения не ломает Undo`, await frets(), [1]);
        await fixture();
        for (const k of ['3', 'ArrowRight', '5', 'ArrowRight', '7', 'ArrowRight', '9']) await key(k);
        check(`${prefix}: четыре четверти без скрытой смены длительности`, (await state()).notes, base);
        await fixture(base, 1);
        await key('ArrowUp');
        await key('4');
        await key('Backspace');
        s = await state();
        check(`${prefix}: DeleteNote сохраняет другие струны`, s.notes, base);
        await key('ArrowDown');
        await key('Backspace');
        s = await state();
        check(`${prefix}: удаление сохраняет время и хвост`, s.notes, [
          base[0],
          { start: 1, dur: 1, pause: true },
          base[2],
          base[3],
        ]);
        check(`${prefix}: после удаления пауза реальной длительности`, s.disabled, false);
        await key('KeyZ', 'Meta');
        check(`${prefix}: Undo удаления`, await frets(), [3, 5, 7, 9]);
        await fixture(
          [
            note(0, 3, 1, 0, { dots: 1 }),
            note(1.5, 5, 0.5, 0, { triplet: true }),
            note(1.833333333, 7, 0.5, 0, { triplet: true }),
          ],
          1.5,
        );
        await key('Backspace');
        s = await state();
        check(
          `${prefix}: удалённая триоль остаётся триольной паузой`,
          s.notes.find((n) => n.pause),
          { start: 1.5, dur: 0.5, triplet: true, pause: true },
        );
        await key('ArrowRight');
        check(`${prefix}: точное время следующей триоли`, (await state()).cursor.start, 1.833333333);
        await fixture(base);
        await key('ArrowRight', null, true);
        await key('KeyC', 'Meta');
        await key('ArrowRight');
        await key('KeyV', 'Meta');
        s = await state();
        check(`${prefix}: CmdV после 7, сдвинут только хвост такта`, await frets(), [3, 5, 7, 3, 5, 9]);
        check(
          `${prefix}: переполнение не нормализовано`,
          [s.disabled, s.error.includes('переполнен'), s.notes.length],
          [true, true, 6],
        );
        const savedBefore = await page.evaluate(() => JSON.stringify(tabInsertEditorState.source));
        await page.$eval('[data-tab-apply]', (e) =>
          e.dispatchEvent(new MouseEvent('click', { bubbles: true })),
        );
        check(
          `${prefix}: обход disabled тоже не сохраняет ошибочный черновик`,
          await page.evaluate(() => JSON.stringify(tabInsertEditorState.source)),
          savedBefore,
        );
        await key('KeyZ', 'Meta');
        check(`${prefix}: Undo вставки полностью`, await frets(), [3, 5, 7, 9]);
        await key('KeyZ', 'Meta', true);
        check(`${prefix}: Redo вставки`, await frets(), [3, 5, 7, 3, 5, 9]);
        await fixture(base);
        await key('ArrowRight', null, true);
        await key('KeyC', 'Meta');
        await key('ArrowRight');
        await key('ArrowRight', null, true);
        await key('KeyV', 'Meta');
        s = await state();
        check(`${prefix}: вставка заменяет выделенные 7 и 9`, await frets(), [3, 5, 3, 5]);
        check(`${prefix}: замена снова валидна`, s.disabled, false);
        await fixture(base);
        await key('ArrowRight', null, true);
        await key('KeyX', 'Meta');
        s = await state();
        check(`${prefix}: Cut удаляет позиции, а не ноты по одной`, await frets(), [7, 9]);
        check(
          `${prefix}: неполный черновик разрешён`,
          [s.disabled, s.error.includes('не заполнен')],
          [true, true],
        );
        await key('KeyZ', 'Meta');
        check(`${prefix}: Undo Cut`, await frets(), [3, 5, 7, 9]);
        await fixture(base, 1);
        await key('Equal', 'Control');
        s = await state();
        check(`${prefix}: Insert после занятой позиции`, s.notes.slice(0, 4), [
          base[0],
          base[1],
          { start: 2, dur: 1, pause: true },
          { ...base[2], start: 3 },
        ]);
        await fixture([{ start: 0, dur: 1, pause: true }, note(1, 5)]);
        await key('Equal', 'Control');
        check(
          `${prefix}: Insert на паузе не сдвигает следующую ноту`,
          (await state()).notes.find((n) => n.fret === 5).start,
          1,
        );
        await fixture([], 2);
        await key('3');
        s = await state();
        check(
          `${prefix}: ввод в пустом месте именно под курсором`,
          [s.notes[0].start, s.cursor.start],
          [2, 2],
        );
        await fixture([note(0, 3)]);
        await key('KeyC', 'Meta');
        await fixture([], 2);
        await key('KeyV', 'Meta');
        s = await state();
        check(
          `${prefix}: Paste в пустом месте не передвигает курсор в начало`,
          [s.notes[0].start, s.notes[0].fret],
          [2, 3],
        );
        await fixture(base);
        await key('Minus');
        s = await state();
        check(
          `${prefix}: увеличение длительности допускает ошибку, не режет ноты`,
          [s.notes[0].dur, s.notes.length, s.disabled],
          [2, 4, true],
        );
        await key('Equal');
        check(`${prefix}: исправление ритма разблокирует Apply`, (await state()).disabled, false);
        await fixture(base);
        await key('Period');
        s = await state();
        check(`${prefix}: точка видна в черновике`, [s.notes[0].dots, s.disabled], [1, true]);
        await key('KeyZ', 'Meta');
        check(`${prefix}: Undo точки`, (await state()).notes, base);
        await key('Slash');
        s = await state();
        check(`${prefix}: триоль не округлена`, [s.notes[0].triplet, s.disabled], [true, true]);
        await fixture(base);
        await key('KeyR');
        s = await state();
        check(`${prefix}: R меняет аккорд на паузу без сдвига`, s.notes, [
          { start: 0, dur: 1, pause: true },
          ...base.slice(1),
        ]);
        await fixture(base);
        await key('ArrowRight', null, true);
        await key('KeyR');
        check(`${prefix}: R действует на весь выделенный диапазон`, (await state()).notes, [
          { start: 0, dur: 1, pause: true },
          { start: 1, dur: 1, pause: true },
          base[2],
          base[3],
        ]);
        await fixture();
        await key('KeyR');
        check(`${prefix}: R в пустом такте использует вводимую четверть`, (await state()).notes, [
          { start: 0, dur: 1, pause: true },
        ]);
        await key('KeyR');
        check(`${prefix}: повторное R возвращает открытую струну, не удаляет время`, (await state()).notes, [
          note(0, 0),
        ]);
        await fixture(base.concat([note(4, 11), note(5, 13)]), 5, 8);
        await key('Home');
        check(`${prefix}: Home`, (await state()).cursor.start, 4);
        await key('Home', 'Meta');
        check(`${prefix}: CmdHome`, (await state()).cursor.start, 0);
        await key('End');
        check(`${prefix}: End — начало последнего такта`, (await state()).cursor.start, 4);
        await key('End', null, true);
        check(`${prefix}: ShiftEnd выделяет до последней позиции такта`, (await state()).selected, true);
        await key('Escape');
        check(`${prefix}: Escape сначала снимает выделение`, (await state()).selected, false);
        await fixture(base);
        await key('Equal', 'Meta');
        s = await state();
        check(`${prefix}: Cmd+ вставляет такт перед текущим`, [s.beats, s.notes[0].start], [8, 4]);
        await key('Minus', 'Control');
        s = await state();
        check(`${prefix}: Ctrl− удаляет такт`, [s.beats, s.notes[0].start], [4, 0]);
        await fixture([], 0, 16);
        for (let i = 0; i < 8; i++) await key('ArrowRight');
        s = await state();
        check(`${prefix}: стоп на четырёх тактах`, [s.cursor.start, s.beats, s.history], [12, 16, 0]);
        await fixture([note(0, 3), note(4, 5), note(8, 7), note(12, 9)], 0, 16);
        await key('KeyA', 'Meta');
        await key('KeyC', 'Meta');
        await key('Escape');
        const before = await state();
        await key('KeyV', 'Meta');
        s = await state();
        check(
          `${prefix}: отказ >4 тактов атомарный`,
          [s.notes, s.beats, s.history, s.point],
          [before.notes, before.beats, before.history, before.point],
        );
        for (const [ts, beats] of [
          ['3/4', 3],
          ['5/4', 5],
        ]) {
          await fixture([], 0, beats, ts);
          await key('Backspace');
          const empty = await state();
          check(
            `${prefix}: DeleteNote в пустом ${ts} — no-op`,
            [empty.notes.length, empty.history, empty.disabled],
            [0, 0, false],
          );
        }
        await fixture(base);
        await key('KeyA', 'Meta');
        await key('KeyX', 'Meta');
        for (const k of ['1', 'ArrowRight', '3', 'ArrowRight', '5', 'ArrowRight', '7']) await key(k);
        check(
          `${prefix}: неполный такт можно заново заполнить стрелками`,
          [(await state()).disabled, await frets()],
          [false, [1, 3, 5, 7]],
        );
        if (!touch) {
          await fixture(base);
          await page.$eval('.tab-at-host', (e) => e.scrollIntoView({ block: 'center' }));
          const points = await page.evaluate(() => {
            const h = document.querySelector('.tab-at-host').getBoundingClientRect();
            return [0, 2, 3].map((start) => {
              const b = tabAtBeatBoundsAt(tabAtApi, start),
                n = b.notes[0].noteHeadBounds;
              return { x: h.x + n.x + n.w / 2, y: h.y + n.y + n.h / 2 };
            });
          });
          await page.mouse.move(points[0].x, points[0].y);
          await page.mouse.down();
          await page.mouse.move(points[1].x, points[1].y, { steps: 8 });
          await page.mouse.up();
          check(
            `${prefix}: drag выделяет целые позиции`,
            await page.evaluate(() =>
              tabGpRange(tabInsertEditorState).flatMap((p) => p.beat?.notes.map((n) => n.fret) || []),
            ),
            [3, 5, 7],
          );
          await page.mouse.click(points[0].x, points[0].y);
          await page.keyboard.down('Shift');
          await page.mouse.click(points[2].x, points[2].y);
          await page.keyboard.up('Shift');
          check(
            `${prefix}: Shift-click расширяет диапазон`,
            await page.evaluate(() =>
              tabGpRange(tabInsertEditorState).flatMap((p) => p.beat?.notes.map((n) => n.fret) || []),
            ),
            [3, 5, 7, 9],
          );
        }
        await fixture(base.concat([note(4, 11)]), 0, 8);
        await key('ArrowRight', null, true);
        await key('KeyC', 'Meta');
        await key('ArrowRight');
        await key('KeyV', 'Meta');
        await key('KeyV', 'Meta');
        await key('End');
        check(
          `${prefix}: курсор второго такта не путается с переполненным первым`,
          await page.evaluate(() => [
            tabAtCursor.start,
            tabAtCursorPosition(tabAtApi).barIndex,
            document.querySelector('.tab-at-cursor-readout').textContent.includes('такт 2,'),
          ]),
          [8, 1, true],
        );
        await fixture(base);
        await key('ArrowRight', null, true);
        await key('KeyX', 'Meta');
        await key('KeyA', 'Meta');
        await key('Minus');
        check(
          `${prefix}: диапазон сохраняется после исчезновения виртуального конца`,
          await page.evaluate(() =>
            tabGpRange(tabInsertEditorState).flatMap((p) => p.beat?.notes.map((n) => n.fret) || []),
          ),
          [7, 9],
        );
        await fixture(base);
        await key('1');
        await button('[data-tab-gp="select"]');
        await key('2');
        check(`${prefix}: экранная команда прерывает две цифры лада`, (await state()).notes[0].fret, 2);
        // Независимые проверки цветов native SVG, ghost rest, выделения и границ ошибки.
        await fixture(base);
        await key('Backspace');
        await key('ArrowRight', null, true);
        await key('Minus');
        await wait(100);
        const visual = await page.evaluate(() => {
          const host = document.querySelector('.tab-at-host'),
            e = tabInsertEditorState,
            css = getComputedStyle(document.documentElement);
          const footer = e.overlay.querySelector('.tab-editor-actions').getBoundingClientRect();
          return {
            glyph: tabAtApi.settings.display.resources.mainGlyphColor.rgba,
            primary: css.getPropertyValue('--color-text-primary').trim().toUpperCase(),
            ghosts: host.querySelectorAll('.tab-gp-ghost text').length,
            selection: host.querySelectorAll('.tab-gp-selected').length,
            invalid: host.querySelectorAll('.tab-gp-invalid').length,
            footerInView: footer.top >= 0 && footer.bottom <= innerHeight + 1,
            disabled: e.overlay.querySelector('[data-tab-apply]').disabled,
            clip: host.scrollWidth > host.clientWidth + 1,
          };
        });
        check(`${prefix}: native-нотация использует цвет темы`, visual.glyph, visual.primary);
        check(`${prefix}: ghost rest нарисован отдельно`, visual.ghosts > 0);
        check(
          `${prefix}: диапазон и ошибка видимы`,
          visual.selection > 0 && visual.invalid > 0 && visual.disabled,
        );
        check(`${prefix}: кнопки и стан без горизонтального обрезания`, visual.footerInView && !visual.clip);
        if (output) {
          await page.$eval('.tab-at-host', (e) => e.scrollIntoView({ block: 'center' }));
          await wait(60);
          await page.screenshot({ path: path.join(output, `${width}-${theme}.png`) });
        }
        if (touch) {
          await fixture(base);
          await button('[data-tab-gp="select"]');
          await button('[data-tab-time-step="1"]');
          check(`${prefix}: touch-кнопки выделяют диапазон`, (await state()).selected, true);
        }
        console.log(`ok ${prefix}`);
      }
      // Буфер общий для вставок; единицы 4/4 и 6/8 нельзя путать.
      await fixture([note(0, 3)]);
      await key('KeyC', 'Meta');
      await fixture([], 0, 6, '6/8');
      await key('KeyV', 'Meta');
      check(`${width}: межразмерный буфер сохраняет четверть`, (await state()).notes[0].dur, 2);
      await fixture(base);
      await key('ArrowRight');
      await key('ArrowRight');
      await key('KeyC', 'Meta');
      await button('[data-tab-apply]');
      await page.waitForSelector('.tab-insert-editor', { hidden: true });
      check(
        `${width}: Apply записывает валидную музыку`,
        await page.evaluate(() => sections[0].squares.find((q) => q.type === 'tab').notes.map((n) => n.fret)),
        [3, 5, 7, 9],
      );
      const bytes = await page.evaluate(() => Array.from(gpExportBytesGP5().bytes)),
        score = readScore(bytes);
      check(
        `${width}: введённые ноты сохранены в настоящем GP5`,
        Array.from(
          oracleNotes(score).filter((n) => n.bar === score.masterBars.length - 1),
          (n) => n.fret,
        ),
        [3, 5, 7, 9],
      );
      await page.evaluate(() => window.undoEdit());
      await wait(60);
      check(
        `${width}: Undo Apply не склеивается с чужой сменой размера`,
        await page.evaluate(() => sections[0].squares.find((q) => q.type === 'tab')?.notes.length),
        0,
      );
      await page.evaluate(() => window.redoEdit());
      await wait(60);
      check(
        `${width}: song Redo возвращает музыку`,
        await page.evaluate(() => sections[0].squares.find((q) => q.type === 'tab').notes.map((n) => n.fret)),
        [3, 5, 7, 9],
      );
      await page.evaluate(() => {
        const sq = sections[0].squares.find((q) => q.type === 'tab');
        openTabInsertEditor(sections[0].id, sq.id);
      });
      await page.waitForSelector('.tab-at-host svg');
      await key('KeyV', 'Meta');
      check(`${width}: буфер переживает закрытие диалога`, await frets(), [3, 7, 5, 7, 9]);
      await button('[data-tab-cancel]');
      check(
        `${width}: Cancel не сохраняет ошибочный хвост`,
        await page.evaluate(() => sections[0].squares.find((q) => q.type === 'tab').notes.map((n) => n.fret)),
        [3, 5, 7, 9],
      );
      const historyBefore = await page.evaluate(() => window.historyDebugState().index);
      await page.evaluate(() => {
        const sq = sections[0].squares.find((q) => q.type === 'tab');
        openTabInsertEditor(sections[0].id, sq.id);
      });
      await page.waitForSelector('.tab-at-host svg');
      await key('1');
      await key('KeyZ', 'Meta');
      await button('[data-tab-apply]');
      check(
        `${width}: набор/Undo/Apply не создаёт фантомную правку`,
        await page.evaluate(() => window.historyDebugState().index),
        historyBefore,
      );
      // Старый валидный формат с нотой через черту не теряется при открытии.
      const original = await page.evaluate(() => {
        const sq = sections[0].squares.find((q) => q.type === 'tab');
        sq.beats = 8;
        sq.notes = [{ start: 3, dur: 2, string: 0, fret: 12 }];
        openTabInsertEditor(sections[0].id, sq.id);
        return JSON.stringify(sq);
      });
      check(
        `${width}: сложная старая нота открыта без молчаливого обрезания`,
        await page.evaluate(
          () =>
            !document.querySelector('[data-tab-fallback]').hidden &&
            document.querySelector('.tab-at-host').hidden,
        ),
      );
      await button('[data-tab-cancel]');
      check(
        `${width}: исходная удержанная нота цела`,
        await page.evaluate(() => JSON.stringify(sections[0].squares.find((q) => q.type === 'tab'))),
        original,
      );
      // Настоящий OS clipboard Chromium: это не вызов редакторского Paste из теста.
      await page.evaluate(() => {
        const sq = sections[0].squares.find((q) => q.type === 'tab');
        sq.beats = 4;
        sq.notes = [];
        openTabInsertEditor(sections[0].id, sq.id);
      });
      await page.waitForSelector('.tab-at-host svg');
      await fixture(base);
      await browser
        .defaultBrowserContext()
        .overridePermissions(new URL(page.url()).origin, ['clipboard-read', 'clipboard-sanitized-write']);
      await key('ArrowRight', null, true);
      await key('KeyC', 'Control');
      await wait(120);
      const systemText = await page.evaluate(() => navigator.clipboard.readText());
      check(
        `${width}: OS clipboard содержит типизированные музыкальные позиции`,
        systemText.startsWith('STRUCHORD_TAB/1\n'),
      );
      await key('ArrowRight');
      await key('KeyV', 'Control');
      await wait(120);
      check(`${width}: настоящий paste event вставляет ровно один раз`, await frets(), [3, 5, 7, 3, 5, 9]);
      await fixture(base);
      await key('ArrowRight', null, true);
      await key('KeyX', 'Control');
      await wait(120);
      check(`${width}: настоящий cut event удаляет ровно один раз`, await frets(), [7, 9]);
      await key('KeyZ', 'Meta');
      check(`${width}: Undo системного Cut`, await frets(), [3, 5, 7, 9]);
      const beforeBad = await state();
      await page.evaluate(() => navigator.clipboard.writeText('not tab music'));
      await key('KeyV', 'Control');
      await wait(120);
      check(
        `${width}: чужой системный текст не вставляет старый внутренний буфер`,
        (await state()).notes,
        beforeBad.notes,
      );
      await page.evaluate(() => {
        const dt = new DataTransfer();
        dt.setData(
          'text/plain',
          'STRUCHORD_TAB/1\n' +
            JSON.stringify({
              format: 'struchord-tab',
              version: 1,
              denom: 4,
              segments: [[{ dur: 1, notes: [{ string: 0, fret: 99 }] }]],
            }),
        );
        document
          .querySelector('.tab-at-host')
          .dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
      });
      check(
        `${width}: испорченный музыкальный payload отклонён атомарно`,
        (await state()).notes,
        beforeBad.notes,
      );
      await fixture(base);
      await key('ArrowRight', null, true);
      await button('[data-tab-gp="copy"]');
      await key('ArrowRight');
      await button('[data-tab-gp="paste"]');
      await wait(80);
      check(`${width}: экранные Copy/Paste используют системный буфер`, await frets(), [3, 5, 7, 3, 5, 9]);
      await fixture(base);
      await key('ArrowRight', null, true);
      await button('[data-tab-gp="cut"]');
      await wait(80);
      check(`${width}: экранный Cut удаляет диапазон после копирования`, await frets(), [7, 9]);
      await key('KeyZ', 'Meta');
      await fixture(base);
      await page.evaluate(() => {
        window.__originalClipRead = navigator.clipboard.readText;
        navigator.clipboard.readText = () =>
          new Promise((resolve) => {
            window.__resolveClipRead = resolve;
          });
        document.querySelector('[data-tab-gp="paste"]').click();
      });
      await key('ArrowRight');
      await page.evaluate((text) => {
        navigator.clipboard.readText = window.__originalClipRead;
        window.__resolveClipRead(text);
        delete window.__originalClipRead;
        delete window.__resolveClipRead;
      }, systemText);
      await wait(60);
      check(`${width}: запоздалый Clipboard API не меняет уже другой курсор`, await frets(), [3, 5, 7, 9]);
      await button('[data-tab-cancel]');
      await page.close();
    }
    check('нет ошибок JavaScript', errors, []);
    console.log(`${checks} ok / 0 FAIL`);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});

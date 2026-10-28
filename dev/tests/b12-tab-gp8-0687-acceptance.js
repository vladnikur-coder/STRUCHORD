#!/usr/bin/env node
/**
 * 0.687 Acceptance & Screenshot Test — B-12.12:
 * «Паузу тоже можно удалить» — Backspace / Delete / кнопка корзины удаляют паузу,
 * 1) пауза под курсором исчезает вместе со своей долей: ноты правее подтягиваются влево,
 *    такт становится «не заполнен» с кнопкой «Заполнить паузами» и ждёт нот (как Shift+Delete);
 * 2) на полностью пустом такте сам такт по Backspace/Delete НЕ удаляется (для этого есть Ctrl+Delete и «− Такт»);
 * 3) выделение из нот и пауз удаляется в два шага: сначала ноты → паузы (выделение остаётся),
 *    второе нажатие удаляет уже сами паузы;
 * 4) кнопка корзины ведёт себя как Backspace/Delete, Shift+Delete по-прежнему удаляет долю со сдвигом;
 * 5) всё отменяется одним Ctrl+Z / ⌘Z.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const OUT_DIR = path.join(__dirname, '..', 'bench', 'results', 'tab-gp8-0.687');
fs.mkdirSync(OUT_DIR, { recursive: true });

const results = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  const ok = a === b;
  results.push({ name, ok, actual, expected });
  if (!ok) {
    console.error(`FAIL: ${name}\n  expected: ${b}\n  actual:   ${a}`);
  } else {
    console.log(`PASS: ${name}`);
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const execPath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    (fs.existsSync('/tmp/chromium') ? '/tmp/chromium' : undefined);
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: execPath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 860, deviceScaleFactor: 2 });
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#devPanelTrigger', { timeout: 30000 });

    const ver = await page.$eval('#devPanelTrigger', (el) => el.textContent.trim());
    check('Версия в шапке не ниже 0.687',
      (() => { const mm = String(ver).match(/ver\s+0\.(\d+)/); return !!mm && Number(mm[1]) >= 687; })(),
      true);

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
      startNewSongFromHome();
      if (!sections.length) addSection('Intro');
      addTabInsert(sections[0].id);
    });
    await page.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 30000 });
    await wait(200);

    const setFixture = async (notes, cursorStart = 0, cursorStr = 0, beats = 4, theme = 'light') => {
      await page.evaluate(
        ({ notesIn, cStart, cStr, b, th }) => {
          document.documentElement.dataset.theme = th;
          const toastEl = document.getElementById('toast');
          if (toastEl) toastEl.classList.remove('show');
          const e = tabInsertEditorState;
          const sq = e.source;
          sq.beats = b;
          sq.notes = structuredClone(notesIn);
          e.draft = structuredClone(sq);
          e.history = [];
          e.forward = [];
          e.gpSelection = null;
          e.gpNotice = null;
          e.techPanel = null;
          tabGpImport(e);
          renderTabInsertEditor(e);
          tabGpSetTime(e, cStart, cStr);
          tabAtHostEl?.focus({ preventScroll: true });
        },
        { notesIn: notes, cStart: cursorStart, cStr: cursorStr, b: beats, th: theme },
      );
      await wait(150);
    };

    const key = async (code, { shift = false, ctrl = false, meta = false } = {}) => {
      await page.evaluate(
        ({ c, s, ct, mt }) => {
          const host = document.querySelector('.tab-at-host');
          const map = { Backspace: 'Backspace', Delete: 'Delete', KeyZ: 'z', Escape: 'Escape' };
          host.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: map[c] || c,
              code: c,
              shiftKey: s,
              ctrlKey: ct,
              metaKey: mt,
              bubbles: true,
              cancelable: true,
            }),
          );
        },
        { c: code, s: shift, ct: ctrl, mt: meta },
      );
      await wait(110);
    };

    const readUi = () =>
      page.evaluate(() => {
        const e = tabInsertEditorState;
        const err = e?.overlay?.querySelector('[data-tab-gp-error]');
        const apply = e?.overlay?.querySelector('[data-tab-apply]');
        const padBtn = err?.querySelector('[data-tab-gp-fix="pad"]');
        return {
          notes: (e?.draft?.notes || []).map((n) =>
            n.pause ? ['rest', n.start, n.dur] : [n.fret, n.start, n.dur, n.string],
          ),
          barsCount: e.gpBars.length,
          groupsPerBar: e.gpBars.map((bar) => bar.length),
          cursorStart: tabAtCursor.start,
          cursorPoint: { ...e.gpCursor },
          hasSelection: !!e.gpSelection,
          errorHidden: err ? err.hidden : true,
          errorText: err && !err.hidden ? err.textContent.trim() : '',
          isNotice: !!err?.classList.contains('is-notice'),
          padButton: padBtn ? padBtn.textContent.trim() : null,
          applyDisabled: !!apply?.disabled,
        };
      });

    // === 1. Пауза в середине такта: Backspace удаляет её вместе с долей ===
    await setFixture([
      { start: 0, dur: 1, string: 0, fret: 3 },
      { start: 1, dur: 1, string: 0, fret: 5 },
      { start: 2, dur: 1, string: 0, fret: 7 },
      { start: 3, dur: 1, string: 0, fret: 9 },
    ], 1);
    await key('Backspace'); // нота 5 -> пауза (как в 0.683)
    let ui = await readUi();
    check(
      'Первое нажатие Backspace на ноте, как и раньше, оставляет паузу без сдвига нот (0.683)',
      [ui.notes, ui.applyDisabled],
      [
        [
          [3, 0, 1, 0],
          ['rest', 1, 1],
          [7, 2, 1, 0],
          [9, 3, 1, 0],
        ],
        false,
      ],
    );

    await key('Backspace'); // пауза -> удалена со сдвигом нот влево
    ui = await readUi();
    check(
      'Второе нажатие Backspace на паузе удаляет её: ноты 7 и 9 подтягиваются влево и звучат раньше',
      ui.notes,
      [
        [3, 0, 1, 0],
        [7, 1, 1, 0],
        [9, 2, 1, 0],
      ],
    );
    check(
      'После удаления паузы такт ждёт нот: подсказка «3 из 4 — не заполнен» и кнопка «Заполнить паузами»',
      [ui.errorHidden, ui.errorText.includes('3 из 4 — не заполнен'), ui.padButton, ui.applyDisabled],
      // 0.691: подсказка остаётся, но сохранение не блокируется.
      [false, true, 'Заполнить паузами', false],
    );
    check('Такт остаётся на месте: удаляется пауза, а не такт', [ui.barsCount, ui.groupsPerBar], [1, [3]]);
    await page.screenshot({ path: path.join(OUT_DIR, '01-rest-deleted-pad-button-light.png') });

    // Тёмная тема — тот же результат читается без обрезаний
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
      renderTabInsertEditor(tabInsertEditorState);
      tabGpDecorate(tabInsertEditorState);
    });
    await wait(140);
    await page.screenshot({ path: path.join(OUT_DIR, '02-rest-deleted-dark.png') });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
      renderTabInsertEditor(tabInsertEditorState);
      tabGpDecorate(tabInsertEditorState);
    });
    await wait(120);

    // Один Ctrl+Z сразу после удаления паузы возвращает её на место
    await key('KeyZ', { ctrl: true });
    ui = await readUi();
    check(
      'Один Ctrl+Z после удаления паузы возвращает паузу на место одним шагом',
      [ui.notes, ui.applyDisabled],
      [
        [
          [3, 0, 1, 0],
          ['rest', 1, 1],
          [7, 2, 1, 0],
          [9, 3, 1, 0],
        ],
        false,
      ],
    );
    await key('KeyZ', { ctrl: true });
    ui = await readUi();
    check(
      'Второй Ctrl+Z возвращает исходные ноты 3-5-7-9',
      [ui.notes.map((n) => n[0]), ui.applyDisabled],
      [[3, 5, 7, 9], false],
    );

    // «Заполнить паузами» возвращает полный такт и живую кнопку «Применить»
    await setFixture([
      { start: 0, dur: 1, string: 0, fret: 3 },
      { start: 1, dur: 1, string: 0, fret: 5 },
      { start: 2, dur: 1, string: 0, fret: 7 },
      { start: 3, dur: 1, string: 0, fret: 9 },
    ], 1);
    await key('Backspace');
    await key('Backspace');
    ui = await readUi();
    // 0.691: неполный такт можно сохранить и без добивки паузами.
    check('Перед заполнением такт неполный, но «Применить» доступна', [ui.applyDisabled, ui.groupsPerBar], [false, [3]]);
    await page.click('[data-tab-gp-fix="pad"]');
    await wait(180);
    ui = await readUi();
    check(
      'Кнопка «Заполнить паузами» дополняет такт и снова разрешает «Применить»',
      [ui.errorHidden, ui.applyDisabled, ui.groupsPerBar, ui.notes.map((n) => n[0])],
      [true, false, [4], [3, 7, 9]],
    );

    // === 2. Пауза в самом конце такта ===
    await setFixture([
      { start: 0, dur: 1, string: 0, fret: 3 },
      { start: 1, dur: 1, string: 0, fret: 5 },
      { start: 2, dur: 1, string: 0, fret: 7 },
    ], 3);
    ui = await readUi();
    // 0.688: свободный хвост не рисуется паузой, поэтому такт из трёх нот
    // честно считается неполным — «Применить» ждёт «Заполнить паузами».
    // 0.691: неполный такт больше не блокирует «Применить».
    check(
      'Такт из трёх нот с пустым хвостом считается неполным и объясняет это словами (0.688)',
      [ui.groupsPerBar, ui.applyDisabled, ui.errorText.includes('3 из 4 — не заполнен')],
      [[4], false, true],
    );
    await key('Delete');
    ui = await readUi();
    check(
      'Delete на паузе в конце такта удаляет её и оставляет такт неполным (3 из 4), сам такт на месте',
      [ui.groupsPerBar, ui.barsCount, ui.notes.length, ui.errorText.includes('3 из 4 — не заполнен')],
      [[3], 1, 3, true],
    );

    // === 3. Полностью пустой такт по Backspace/Delete не удаляется ===
    await setFixture([], 0);
    ui = await readUi();
    check('Пустой такт по умолчанию полный и валидный', [ui.barsCount, ui.applyDisabled], [1, false]);
    await key('Delete');
    ui = await readUi();
    check(
      'Delete на пустом такте не удаляет такт: он остаётся и «Применить» доступно',
      [ui.barsCount, ui.notes.length, ui.applyDisabled],
      [1, 0, false],
    );
    check(
      'Вместо удаления такта показывается спокойная подсказка про Ctrl+Delete и «− Такт»',
      [ui.errorHidden, ui.isNotice, ui.errorText.includes('остаётся на месте'), ui.errorText.includes('Ctrl+Delete')],
      [false, true, true, true],
    );
    await page.screenshot({ path: path.join(OUT_DIR, '04-empty-bar-notice-light.png') });
    await key('Backspace');
    ui = await readUi();
    check('Backspace на пустом такте тоже ничего не ломает', [ui.barsCount, ui.applyDisabled], [1, false]);

    // Такт из двух непустых тактов: удаление паузы во втором такте тоже работает
    await setFixture([
      { start: 0, dur: 1, string: 0, fret: 3 },
      { start: 1, dur: 1, string: 0, fret: 5 },
      { start: 2, dur: 1, string: 0, fret: 7 },
      { start: 3, dur: 1, string: 0, fret: 9 },
      { start: 4, dur: 1, string: 0, fret: 3 },
      { start: 5, dur: 1, string: 0, fret: 5 },
      { start: 6, dur: 1, string: 0, fret: 7 },
      { start: 7, dur: 1, string: 0, fret: 9 },
    ], 5, 0, 8);
    await key('Delete');
    await key('Delete');
    ui = await readUi();
    check(
      'Пауза удаляется и во втором такте: ноты подтягиваются, первый такт не тронут',
      [ui.barsCount, ui.notes.filter((n) => n[1] < 4).map((n) => n[0]), ui.notes.filter((n) => n[1] >= 4).map((n) => n[0])],
      [2, [3, 5, 7, 9], [3, 7, 9]],
    );

    // === 4. Смешанное выделение: сначала ноты в паузы, второе нажатие — паузы со сдвигом ===
    await setFixture([
      { start: 0, dur: 1, string: 0, fret: 3 },
      { start: 1, dur: 1, string: 0, fret: 5 },
      { start: 3, dur: 1, string: 0, fret: 9 }, // на 3-й доле в исходнике пауза
    ], 0);
    // Выделяем доли 1–4 стрелками с Shift
    for (let i = 0; i < 3; i++) await key('ArrowRight', { shift: true });
    ui = await readUi();
    check('Выделение четырёх долей готово', [ui.hasSelection, ui.cursorPoint.index], [true, 3]);

    await key('Delete'); // шаг 1: ноты -> паузы, выделение сохраняется
    ui = await readUi();
    check(
      'Первое нажатие по смешанному выделению превращает ноты в паузы и оставляет выделение',
      [ui.notes.every((n) => n[0] === 'rest'), ui.notes.length, ui.hasSelection, ui.applyDisabled],
      [true, 3, true, false],
    );
    await page.screenshot({ path: path.join(OUT_DIR, '03-two-step-selection-light.png') });

    await key('Delete'); // шаг 2: паузы удаляются разом
    ui = await readUi();
    check(
      'Второе нажатие удаляет все выделенные паузы: такт остаётся пустым и валидным, выделение снято',
      [ui.notes.length, ui.barsCount, ui.hasSelection, ui.applyDisabled],
      [0, 1, false, false],
    );
    await key('KeyZ', { ctrl: true });
    ui = await readUi();
    check(
      'Ctrl+Z возвращает удалённые паузы одним шагом',
      [ui.notes.length, ui.notes.every((n) => n[0] === 'rest')],
      [3, true],
    );

    // === 5. Кнопка корзины ведёт себя как Backspace/Delete, Shift+Delete — как раньше ===
    await setFixture([
      { start: 0, dur: 1, string: 0, fret: 3 },
      { start: 1, dur: 1, string: 0, fret: 5 },
      { start: 2, dur: 1, string: 0, fret: 7 },
      { start: 3, dur: 1, string: 0, fret: 9 },
    ], 1);
    await page.click('[data-tab-gp="delete"]');
    await wait(160);
    ui = await readUi();
    check(
      'Кнопка корзины на ноте оставляет паузу без сдвига остальных нот',
      ui.notes,
      [
        [3, 0, 1, 0],
        ['rest', 1, 1],
        [7, 2, 1, 0],
        [9, 3, 1, 0],
      ],
    );
    await page.click('[data-tab-gp="delete"]');
    await wait(160);
    ui = await readUi();
    check(
      'Второе нажатие корзины убирает паузу и сдвигает ноты влево',
      [ui.notes, ui.applyDisabled],
      [
        [
          [3, 0, 1, 0],
          [7, 1, 1, 0],
          [9, 2, 1, 0],
        ],
        false,
      ],
    );
    await key('KeyZ', { ctrl: true });
    ui = await readUi();
    check('Ctrl+Z отменяет удаление паузы корзиной', ui.notes.map((n) => n[0]), [3, 'rest', 7, 9]);

    await setFixture([
      { start: 0, dur: 1, string: 0, fret: 3 },
      { start: 1, dur: 1, string: 0, fret: 5 },
      { start: 2, dur: 1, string: 0, fret: 7 },
      { start: 3, dur: 1, string: 0, fret: 9 },
    ], 1);
    await key('Delete', { shift: true });
    ui = await readUi();
    check(
      'Shift+Delete по-прежнему удаляет долю со сдвигом',
      [ui.notes, ui.cursorPoint.index, ui.applyDisabled],
      [
        [
          [3, 0, 1, 0],
          [7, 1, 1, 0],
          [9, 2, 1, 0],
        ],
        1,
        false,
      ],
    );

    // === 6. Второй такт не страдает ===
    await setFixture([
      { start: 0, dur: 1, string: 0, fret: 3 },
      { start: 1, dur: 1, string: 0, fret: 5 },
      { start: 2, dur: 1, string: 0, fret: 7 },
      { start: 4, dur: 1, string: 1, fret: 2 },
      { start: 5, dur: 1, string: 1, fret: 4 },
      { start: 6, dur: 1, string: 1, fret: 6 },
    ], 2, 0, 8);
    await key('Delete');
    ui = await readUi();
    check(
      'Удаление паузы в первом такте не трогает второй такт',
      [ui.barsCount, ui.notes.filter((n) => n[1] >= 4).map((n) => [n[0], n[1]])],
      [2, [[2, 4], [4, 5], [6, 6]]],
    );

    // === 7. Памятка горячих клавиш обновлена ===
    await page.click('[data-tab-help]');
    await wait(120);
    const helpCheck = await page.evaluate(() => {
      const pop = document.querySelector('[data-tab-shortcuts-popover]');
      pop.querySelector('[data-tab-os="win"]').click();
      const txt = pop.textContent;
      return {
        hasBackspaceDelete: txt.includes('Backspace / Delete'),
        hasRestSecondPress: txt.includes('ещё раз — пауза со сдвигом'),
      };
    });
    check('Памятка «?» объясняет второе нажатие: пауза удаляется со сдвигом', helpCheck, {
      hasBackspaceDelete: true,
      hasRestSecondPress: true,
    });
    await page.keyboard.press('Escape');

    check('На странице нет ошибок JavaScript', pageErrors.length, 0);

    const failed = results.filter((r) => !r.ok);
    fs.writeFileSync(
      path.join(OUT_DIR, 'checks.json'),
      JSON.stringify({ version: ver, total: results.length, failed: failed.length, results }, null, 2),
    );
    console.log(`\n${results.length - failed.length}/${results.length} PASS`);
    if (failed.length) process.exitCode = 1;
    else console.log('ALL OK — 0.687 «пауза удаляется» подтверждён');
  } finally {
    await browser.close();
  }
})();

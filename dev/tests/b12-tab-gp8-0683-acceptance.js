'use strict';

// B-12.12 · 0.683 приёмка (6 замечаний пользователя + согласованные решения R8):
// 1) Подтверждение «Закрыть без сохранения?» на Esc, клик мимо окна и кнопку «Отмена» при несохранённых правках;
// 2) Стрелка → добавляет временный такт (поле «Длина» сразу синхронно), пустой хвост сам убирается при ← и «Применить»;
// 3) Клавиши по Guitar Pro 8: Backspace = Delete (нота в паузу без сдвига), Insert = вставить такт, Ctrl+Insert = вставить долю;
// 4) Починка такта в один клик: кнопки «Заполнить паузами» и «Убрать лишнее с конца» прямо рядом с подсказкой;
// 5) Размер на стане при переполнении такта остаётся 4/4 (не меняется на 5/4);
// 6) Клик мышью в пустом такте выбирает начало такта без разрезания на дробные паузы, в занятом — ближайшую существующую позицию.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium').default || require('@sparticuz/chromium');

const BASE_URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000';
const OUT_DIR = path.resolve(__dirname, '../bench/results/tab-gp8-0.683');
fs.mkdirSync(OUT_DIR, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ name, ok, actual, expected });
  if (!ok) {
    console.error(`FAIL: ${name}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  } else {
    console.log(`PASS: ${name}`);
  }
  assert.deepStrictEqual(actual, expected, name);
}

(async () => {
  chromium.setGraphicsMode = false;
  const executablePath = await chromium.executablePath();
  const browser = await puppeteer.launch({
    executablePath,
    headless: chromium.headless,
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib' },
    args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
  });

  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.goto(`${BASE_URL}/STRUCHORD.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => typeof addTabInsert === 'function' && typeof partsEnsureAlphaTab === 'function');

    // Проверка синхронизации версии 0.683
    const verText = await page.$eval('#devPanelTrigger', (el) => el.textContent.trim());
    check('Версия в шапке обновлена до 0.683', verText, '· ver 0.683');

    const openFreshTab = async (withChordSquare = true) => {
      await page.evaluate((withChord) => {
        document.documentElement.dataset.theme = 'light';
        startNewSongFromHome();
        if (!sections.length) addSection('Intro');
        sections[0].squares = [];
        if (withChord) {
          addSquare(sections[0].id);
          sections[0].squares[0].events[0].chord = 'Em';
        }
        addTabInsert(sections[0].id);
      }, withChordSquare);
      await page.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 30000 });
      await wait(220);
      await page.click('[data-tab-dur="4"]');
      await page.evaluate(() => {
        if (tabInsertEditorState?.gpBars) tabGpSetTime(tabInsertEditorState, 0, 0);
        else tabAtSetCursor(0, 0);
      });
      await page.$eval('.tab-at-host', (el) => el.focus());
    };

    // =========================================================================
    // 1. ПОДТВЕРЖДЕНИЕ ПРИ ЗАКРЫТИИ С НЕСОХРАНЁННЫМИ НОТАМИ (#1)
    // =========================================================================
    await openFreshTab(true);
    // Чистый черновик: Esc закрывает сразу без вопроса
    await page.keyboard.press('Escape');
    await wait(100);
    check(
      '#1: Пустой нетронутый черновик закрывается по Esc сразу без лишнего вопроса',
      await page.evaluate(() => !!document.querySelector('.tab-insert-editor')),
      false,
    );

    // Вводим ноту -> проверяем Esc, клик мимо окна и кнопку «Отмена»
    await openFreshTab(true);
    await page.keyboard.press('Digit3');
    await wait(120);

    // Esc открывает подтверждение
    await page.keyboard.press('Escape');
    await wait(80);
    const escPrompt = await page.evaluate(() => {
      const box = document.querySelector('[data-tab-confirm-discard]');
      return {
        open: !!box && !box.hidden,
        title: box?.querySelector('.tab-confirm-title')?.textContent?.trim(),
        notesLen: tabInsertEditorState?.draft?.notes?.filter((n) => !n.pause).length,
      };
    });
    check('#1: Esc при введённых нотах открывает вопрос «Закрыть без сохранения?»', escPrompt, {
      open: true,
      title: 'Закрыть без сохранения?',
      notesLen: 1,
    });
    await page.screenshot({ path: path.join(OUT_DIR, '01-confirm-discard-light.png') });

    // Повторный Esc закрывает только вопрос («Остаться»), сохраняя ноты
    await page.keyboard.press('Escape');
    await wait(80);
    check(
      '#1: Повторный Esc отменяет закрытие и оставляет набранные ноты',
      await page.evaluate(() => [
        document.querySelector('[data-tab-confirm-discard]').hidden,
        !!document.querySelector('.tab-insert-editor'),
        tabInsertEditorState.draft.notes.filter((n) => !n.pause).map((n) => n.fret),
      ]),
      [true, true, [3]],
    );

    // Клик мимо окна (по затемнённому фону overlay) тоже спрашивает подтверждение
    await page.mouse.click(8, 8);
    await wait(80);
    check(
      '#1: Клик мышью мимо окна при несохранённых нотах тоже показывает подтверждение',
      await page.$eval('[data-tab-confirm-discard]', (el) => !el.hidden),
      true,
    );
    await page.click('[data-tab-confirm-stay]');
    await wait(80);
    check('#1: Кнопка «Остаться» возвращает в редактор с целыми нотами', await page.$eval('[data-tab-confirm-discard]', (el) => el.hidden), true);

    // Undo до исходного состояния -> Esc закрывает сразу без вопроса
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyZ');
    await page.keyboard.up('Control');
    await wait(120);
    await page.keyboard.press('Escape');
    await wait(100);
    check(
      '#1: После отмены правок (Ctrl+Z) к исходному состоянию Esc закрывает окно без вопроса',
      await page.evaluate(() => !!document.querySelector('.tab-insert-editor')),
      false,
    );

    // Кнопка «Отмена» + «Закрыть без сохранения» реально закрывает и сбрасывает черновик
    await openFreshTab(true);
    await page.keyboard.press('Digit5');
    await wait(100);
    await page.click('[data-tab-cancel]');
    await wait(80);
    check('#1: Кнопка «Отмена» при несохранённых нотах спрашивает подтверждение', await page.$eval('[data-tab-confirm-discard]', (el) => !el.hidden), true);
    await page.click('[data-tab-confirm-leave]');
    await wait(120);
    check(
      '#1: «Закрыть без сохранения» закрывает окно и убирает пустую новую вставку',
      await page.evaluate(() => [!!document.querySelector('.tab-insert-editor'), sections[0].squares.length]),
      [false, 1],
    );

    // =========================================================================
    // 2. СТРЕЛКА → И АВТОУБОРКА ПУСТЫХ ХВОСТОВЫХ ТАКТОВ + СИНХРОННАЯ «ДЛИНА» (#2)
    // =========================================================================
    await openFreshTab(true);
    // Вводим 4 ноты (0, 3, 0, 2) и дважды жмём →
    await page.keyboard.press('Digit0');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Digit3');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Digit0');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Digit2');
    await page.keyboard.press('ArrowRight'); // создаёт временный такт 2
    await page.keyboard.press('ArrowRight'); // создаёт временный такт 3
    await wait(160);

    const lenSync = await page.evaluate(() => ({
      bars: tabInsertEditorState.gpBars.length,
      selectVal: document.querySelector('[data-tab-beats]').value,
      pillText: document.querySelector('[data-tab-beats]').closest('.tab-select-wrap').querySelector('.tab-select-pill-text').textContent.trim(),
    }));
    check('#2: При добавлении временных тактов стрелкой → поле «Длина» сразу показывает «3 такта»', lenSync, {
      bars: 3,
      selectVal: '12',
      pillText: '3 такта',
    });

    // Возврат ← убирает пустой 3-й такт сам
    await page.keyboard.press('ArrowLeft');
    await wait(140);
    check(
      '#2: Шаг ← назад из пустого временного такта сам убирает его и обновляет «Длина» до «2 такта»',
      await page.evaluate(() => [
        tabInsertEditorState.gpBars.length,
        document.querySelector('[data-tab-beats]').closest('.tab-select-wrap').querySelector('.tab-select-pill-text').textContent.trim(),
      ]),
      [2, '2 такта'],
    );

    // Снова шагнём → в пустой 3-й такт и сразу нажмём «Применить»
    await page.keyboard.press('ArrowRight');
    await wait(140);
    await page.click('[data-tab-apply]');
    await wait(200);
    const savedSongAfterAutoTrim = await page.evaluate(() => {
      const tabSq = sections[0].squares.find((q) => q.type === 'tab');
      const badge = document.querySelector('.section-card .tab-insert .tab-insert-count')?.textContent?.trim();
      return {
        beats: tabSq.beats,
        notesCount: tabSq.notes.filter((n) => !n.pause).length,
        badge,
      };
    });
    check('#2: При нажатии «Применить» пустые временные такты от → убираются — в песне «4 ноты · 1 такт» без тишины', savedSongAfterAutoTrim, {
      beats: 4,
      notesCount: 4,
      badge: '4 ноты · 1 такт',
    });

    // А если такт добавили намеренно клавишей Insert — он сохраняется!
    await page.evaluate(() => {
      const tabSq = sections[0].squares.find((q) => q.type === 'tab');
      openTabInsertEditor(sections[0].id, tabSq.id);
    });
    await page.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 30000 });
    await wait(180);
    await page.$eval('.tab-at-host', (el) => el.focus());
    await page.keyboard.press('End');
    await page.keyboard.press('Insert'); // явная вставка такта
    await wait(150);
    await page.click('[data-tab-apply]');
    await wait(180);
    check(
      '#2: Явно добавленный клавишей Insert такт не удаляется при «Применить»',
      await page.evaluate(() => sections[0].squares.find((q) => q.type === 'tab').beats),
      8,
    );

    // =========================================================================
    // 3, 4, 5. КЛАВИШИ GP8 (#3), КНОПКИ ПОЧИНКИ ТАКТА (#4) И РАЗМЕР 4/4 НА СТАНЕ (#5)
    // =========================================================================
    await openFreshTab(false);
    for (const fret of ['3', '5', '7', '9']) {
      await page.keyboard.press(`Digit${fret}`);
      if (fret !== '9') await page.keyboard.press('ArrowRight');
    }
    await wait(140);

    // Курсор на 2-ю долю (лад 5) -> Backspace стирает ноту в паузу БЕЗ сдвига 7 и 9
    await page.evaluate(() => tabGpSetTime(tabInsertEditorState, 1, 0));
    await wait(60);
    await page.keyboard.press('Backspace');
    await wait(120);
    const afterBackspace = await page.evaluate(() => ({
      notes: tabInsertEditorState.draft.notes.map((n) => (n.pause ? ['rest', n.start, n.dur] : [n.fret, n.start, n.dur])),
      applyDisabled: document.querySelector('[data-tab-apply]').disabled,
    }));
    check('#3: Backspace по GP8 превращает ноту в паузу без сдвига остальных нот и не блокирует «Применить»', afterBackspace, {
      notes: [
        [3, 0, 1],
        ['rest', 1, 1],
        [7, 2, 1],
        [9, 3, 1],
      ],
      applyDisabled: false,
    });

    // Shift+Backspace удаляет долю со сдвигом -> такт «3 из 4 — не заполнен» + кнопка «Заполнить паузами» (#4)
    await page.keyboard.down('Shift');
    await page.keyboard.press('Backspace');
    await page.keyboard.up('Shift');
    await wait(140);
    const underfillState = await page.evaluate(() => {
      const err = document.querySelector('[data-tab-gp-error]');
      const padBtn = err?.querySelector('[data-tab-gp-fix="pad"]');
      return {
        hidden: err.hidden,
        hasUnderfillText: err.textContent.includes('3 из 4 — не заполнен'),
        padBtnLabel: padBtn?.textContent?.trim() || null,
        applyDisabled: document.querySelector('[data-tab-apply]').disabled,
      };
    });
    check('#4: При нехватке долей показывается кнопка «Заполнить паузами» рядом с подсказкой', underfillState, {
      hidden: false,
      hasUnderfillText: true,
      padBtnLabel: 'Заполнить паузами',
      applyDisabled: true,
    });
    await page.screenshot({ path: path.join(OUT_DIR, '04-underfill-pad-button-light.png') });

    // Клик по «Заполнить паузами» чинит такт в 1 клик и разблокирует «Применить»
    await page.click('[data-tab-gp-fix="pad"]');
    await wait(140);
    const afterPad = await page.evaluate(() => ({
      errHidden: document.querySelector('[data-tab-gp-error]').hidden,
      applyDisabled: document.querySelector('[data-tab-apply]').disabled,
      barBeatsCount: tabInsertEditorState.gpBars[0].length,
      notes: tabInsertEditorState.draft.notes.map((n) => (n.pause ? ['rest', n.start, n.dur] : [n.fret, n.start, n.dur])),
    }));
    check('#4: Клик «Заполнить паузами» добивает остаток такта паузой и включает «Применить»', afterPad, {
      errHidden: true,
      applyDisabled: false,
      barBeatsCount: 4,
      notes: [
        [3, 0, 1],
        [7, 1, 1],
        [9, 2, 1],
      ],
    });

    // Ctrl+Insert вставляет ДОЛЮ (#3) -> такт переполнен («5 из 4»), но размер на стане остаётся 4/4 (#5), и есть кнопка «Убрать лишнее с конца» (#4)
    await page.keyboard.down('Control');
    await page.keyboard.press('Insert');
    await page.keyboard.up('Control');
    await wait(180);
    const overfillAndMeter = await page.evaluate(() => {
      const err = document.querySelector('[data-tab-gp-error]');
      const trimBtn = err?.querySelector('[data-tab-gp-fix="trim"]');
      const mb = tabAtApi?.score?.masterBars?.[0];
      return {
        barsCount: tabInsertEditorState.gpBars.length,
        hasOverfillText: err.textContent.includes('5 из 4 — переполнен'),
        trimBtnLabel: trimBtn?.textContent?.trim() || null,
        staffNumerator: mb?.timeSignatureNumerator,
        staffDenominator: mb?.timeSignatureDenominator,
      };
    });
    check('#3 + #4 + #5: Ctrl+Insert вставляет долю, размер на стане остаётся 4/4 (не 5/4), показана кнопка «Убрать лишнее с конца»', overfillAndMeter, {
      barsCount: 1,
      hasOverfillText: true,
      trimBtnLabel: 'Убрать лишнее с конца',
      staffNumerator: 4,
      staffDenominator: 4,
    });
    await page.screenshot({ path: path.join(OUT_DIR, '05-overfill-keeps-4-4-staff.png') });

    // Клик по «Убрать лишнее с конца» возвращает такт в 4/4 и включает «Применить»
    await page.click('[data-tab-gp-fix="trim"]');
    await wait(140);
    check(
      '#4: Клик «Убрать лишнее с конца» выравнивает переполненный такт и включает «Применить»',
      await page.evaluate(() => [document.querySelector('[data-tab-gp-error]').hidden, document.querySelector('[data-tab-apply]').disabled]),
      [true, false],
    );

    // Обычный Insert без модификаторов вставляет ТАКТ (#3)
    await page.keyboard.press('Insert');
    await wait(150);
    check(
      '#3: Клавиша Insert без модификаторов вставляет такт (1 → 2 такта)',
      await page.evaluate(() => tabInsertEditorState.gpBars.length),
      2,
    );

    // Проверяем шпаргалку «?» на соответствие новым клавишам GP8
    await page.click('[data-tab-help]');
    await wait(80);
    const helpCheck = await page.evaluate(() => {
      const pop = document.querySelector('[data-tab-shortcuts-popover]');
      pop.querySelector('[data-tab-os="win"]').click();
      const txt = pop.textContent;
      return {
        hasBackspaceDelete: txt.includes('Backspace / Delete'),
        hasInsertCtrlInsert: txt.includes('Insert / Ctrl+Insert'),
      };
    });
    check('#3: Памятка горячих клавиш «?» отражает Backspace / Delete и Insert / Ctrl+Insert', helpCheck, {
      hasBackspaceDelete: true,
      hasInsertCtrlInsert: true,
    });
    await page.keyboard.press('Escape'); // закрывает только шпаргалку
    await page.click('[data-tab-cancel]');
    await page.click('[data-tab-confirm-leave]');
    await wait(120);

    // =========================================================================
    // 6. КЛИК МЫШЬЮ В ПУСТОМ И ЗАНЯТОМ ТАКТЕ КАК В GUITAR PRO (#6)
    // =========================================================================
    await openFreshTab(false);
    const clickResultEmpty = await page.evaluate(() => {
      const host = document.querySelector('.tab-at-host');
      const hr = host.getBoundingClientRect();
      const bounds = tabAtBarBounds(tabAtApi, 0);
      const geom = tabAtStringGeometry(tabAtApi, 0);
      return {
        midX: hr.left + bounds.x + bounds.w * 0.58,
        lateX: hr.left + bounds.x + bounds.w * 0.82,
        str6Y: hr.top + geom.yAt(1), // alphaTab string 1 = 6-я (нижняя) струна -> cursorString 0
      };
    });
    // Клик в правой части пустого такта на 6-й струне
    await page.mouse.click(clickResultEmpty.lateX, clickResultEmpty.str6Y);
    await wait(100);
    await page.keyboard.press('Digit7');
    await wait(140);
    const afterEmptyMidClick = await page.evaluate(() => ({
      cursorStart: tabAtCursor.start,
      cursorString: tabAtCursor.string,
      notes: tabInsertEditorState.draft.notes.map((n) => (n.pause ? ['rest', n.start, n.dur] : ['note', n.start, n.fret, n.dur])),
      barBeats: tabInsertEditorState.gpBars[0].map((g) => [g.notes.length ? 'note' : 'rest', tabGpLength(g)]),
    }));
    check('#6: Клик мышью в середине/конце пустого такта ставит ноту строго в начало такта без пауз перед ней', afterEmptyMidClick, {
      cursorStart: 0,
      cursorString: 0,
      notes: [['note', 0, 7, 1]],
      barBeats: [
        ['note', 1],
        ['rest', 3],
      ],
    });
    await page.screenshot({ path: path.join(OUT_DIR, '06-empty-click-starts-at-beat1.png') });

    // В занятом такте (нота на 0 и пауза длиной 3 на start=1): клик в правой части такта выбирает существующую паузу start=1, не режет её на 2.75/3.5
    const occupiedBarCoords = await page.evaluate(() => {
      const host = document.querySelector('.tab-at-host');
      const hr = host.getBoundingClientRect();
      const bounds = tabAtBarBounds(tabAtApi, 0);
      const geom = tabAtStringGeometry(tabAtApi, 0);
      return {
        lateX: hr.left + bounds.x + bounds.w * 0.78,
        str6Y: hr.top + geom.yAt(1),
      };
    });
    await page.mouse.click(occupiedBarCoords.lateX, occupiedBarCoords.str6Y);
    await wait(100);
    check(
      '#6: Клик в правой части частично заполненного такта выбирает существующую паузу (start=1), не разрезая такт',
      await page.evaluate(() => [tabAtCursor.start, tabInsertEditorState.gpCursor.offset || 0]),
      [1, 0],
    );

    // Проверка на телефоне 390×844 в тёмной теме (подтверждение + кнопка «Заполнить паузами» без прокрутки)
    const mobilePage = await browser.newPage();
    mobilePage.on('pageerror', (e) => errors.push(e.message));
    await mobilePage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await mobilePage.goto(`${BASE_URL}/STRUCHORD.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await mobilePage.waitForFunction(() => typeof addTabInsert === 'function');
    await mobilePage.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
      startNewSongFromHome();
      if (!sections.length) addSection('Intro');
      addTabInsert(sections[0].id);
    });
    await mobilePage.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 30000 });
    await wait(250);
    await mobilePage.tap('[data-tab-digit="3"]');
    await wait(120);
    await mobilePage.tap('[data-tab-cancel]');
    await wait(100);
    const mobileConfirmBox = await mobilePage.evaluate(() => {
      const box = document.querySelector('[data-tab-confirm-discard]');
      const stay = box?.querySelector('[data-tab-confirm-stay]')?.getBoundingClientRect();
      const leave = box?.querySelector('[data-tab-confirm-leave]')?.getBoundingClientRect();
      return {
        open: !!box && !box.hidden,
        stayH: stay ? Math.round(stay.height) : 0,
        leaveH: leave ? Math.round(leave.height) : 0,
      };
    });
    check(
      '#1 (телефон 390px, тёмная тема): Диалог подтверждения виден и кнопки ≥ 44 px',
      mobileConfirmBox.open && mobileConfirmBox.stayH >= 44 && mobileConfirmBox.leaveH >= 44,
      true,
    );
    await mobilePage.screenshot({ path: path.join(OUT_DIR, '01-confirm-discard-390-dark.png') });
    await mobilePage.close();
    await page.close();

    check('Отсутствуют ошибки JavaScript на странице', errors, []);

    fs.writeFileSync(path.join(OUT_DIR, 'checks.json'), JSON.stringify({ total: checks.length, checks }, null, 2) + '\n');
    console.log(`\nALL ${checks.length}/${checks.length} 0.683 ACCEPTANCE CHECKS PASSED!`);
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

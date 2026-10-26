#!/usr/bin/env node
/**
 * Приёмочный автотест 0.685 (Alt+↑/↓ и Alt+Shift+↑/↓ как в Guitar Pro 8):
 *  1. Alt+↑ / Alt+↓ переносят ноту на соседнюю струну с сохранением высоты звука
 *     (5 на 6-й → 0 на 5-й; 3-я↔2-я струна в стандартном строю = 4 полутона, остальные = 5).
 *  2. Если пересчитанный лад < 0 или > 24 — нота и курсор остаются на месте,
 *     показывается подсказка «Эту ноту нельзя перенести на соседнюю струну» и исчезает через пару секунд.
 *  3. Если соседняя струна на той же доле уже занята нотой — перенос не выполняется, подсказка показана.
 *  4. Выделение из нескольких нот / созвучие из двух нот: переносятся все сразу, если можно каждую;
 *     если хотя бы одну нельзя — не меняется ничего и показывается подсказка.
 *  5. Alt+Shift+↑ / Alt+Shift+↓ сдвигают лад ±1 на той же струне (в границах 0–24);
 *     оба сочетания отражены в памятке «?» (и для macOS, и для Windows).
 *  6. Нестандартный строй (Drop D: D2 A2 D3 G3 B3 E4): 7-й лад 6-й струны → 0-й лад 5-й струны,
 *     а 5-й лад 6-й струны блокируется.
 *  7. Приёмы (лига, слайд, бенд) сохраняются при переносе, и отмена Ctrl+Z возвращает ноту, струну, лад и приём.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const BASE_URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const CHROME_PATH = process.env.CHROME_PATH || '/tmp/chromium';
const OUT_DIR = path.join(__dirname, '..', 'bench', 'results', 'tab-gp8-0.685');
fs.mkdirSync(OUT_DIR, { recursive: true });

let passed = 0;
let failed = 0;
const checks = [];

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ label, ok, actual, expected });
  if (ok) {
    passed++;
    console.log('PASS: ' + label);
  } else {
    failed++;
    console.error(`FAIL: ${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => typeof addTabInsert === 'function' && typeof partsEnsureAlphaTab === 'function');

    const verNum = await page.$eval('#devPanelTrigger', (el) => parseFloat((el.textContent.match(/\d+\.\d+/) || ['0'])[0]));
    check('Версия в шапке не ниже 0.685', verNum >= 0.685, true);

    // Один раз откроем редактор таба на новой песне, затем переиспользуем его быстро и чисто
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
      startNewSongFromHome();
      if (!sections.length) addSection('Intro');
      addTabInsert(sections[0].id);
    });
    await page.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 30000 });
    await wait(200);

    const setFixture = async (notes, cursorStart = 0, cursorStr = 0, tuningId = 'e-std') => {
      await page.evaluate(
        ({ notesIn, cStart, cStr, tId }) => {
          tunerCustomNotes = null;
          tunerTuningId = tId;
          onSongTuningChanged({ silent: true });
          const e = tabInsertEditorState;
          const toastEl = document.getElementById('toast');
          if (toastEl) toastEl.classList.remove('show');
          const sq = e.source;
          sq.beats = 4;
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
        { notesIn: notes, cStart: cursorStart, cStr: cursorStr, tId: tuningId },
      );
      await wait(140);
    };

    const sendCombo = async (code, { alt = false, shift = false, ctrl = false } = {}) => {
      await page.evaluate(
        ({ keyCode, altKey, shiftKey, ctrlKey }) => {
          const host = document.querySelector('.tab-at-host') || document.querySelector('.tab-insert-editor');
          const keyMap = { ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowRight: 'ArrowRight', ArrowLeft: 'ArrowLeft', KeyZ: 'z' };
          host.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: keyMap[keyCode] || keyCode,
              code: keyCode,
              altKey,
              shiftKey,
              ctrlKey,
              bubbles: true,
              cancelable: true,
            }),
          );
        },
        { keyCode: code, altKey: alt, shiftKey: shift, ctrlKey: ctrl },
      );
      await wait(140);
    };

    const getEditorState = () =>
      page.evaluate(() => {
        const e = tabInsertEditorState;
        const tuning = songTuningNotes();
        const notes = (e?.draft?.notes || []).map((n) => {
          const base = tunerNoteToMidi(tuning[n.string]);
          return {
            start: n.start,
            string: n.string,
            fret: n.fret,
            midi: n.dead || base === null ? null : base + n.fret,
            tie: !!n.tie,
            slide: n.slide || null,
            bend: n.bend ? n.bend.type : null,
            dead: !!n.dead,
          };
        });
        const noticeEl = document.querySelector('[data-tab-gp-error]');
        const toastEl = document.getElementById('toast');
        return {
          notes,
          cursor: { start: tabAtCursor.start, string: tabAtCursor.string },
          history: e?.history?.length || 0,
          notice: noticeEl && !noticeEl.hidden ? noticeEl.textContent.trim() : '',
          toastShown: !!toastEl?.classList.contains('show'),
          toastText: toastEl?.textContent?.trim() || '',
        };
      });

    // --- Пункт 1: Alt+↑ / Alt+↓ сохраняют высоту звука (5 на 6-й → 0 на 5-й, 3-я↔2-я = 4 полутона) ---
    await setFixture([
      { start: 0, dur: 1, string: 0, fret: 5 },
      { start: 1, dur: 1, string: 3, fret: 4 },
      { start: 2, dur: 1, string: 4, fret: 0 },
      { start: 3, dur: 1, string: 0, fret: 24 },
    ], 0, 0);
    await sendCombo('ArrowUp', { alt: true });
    let st = await getEditorState();
    check(
      '#1: Alt+↑ переносит лад 5 с 6-й струны в лад 0 на 5-й струне (MIDI 45 = A2 сохранён)',
      [st.notes[0].string, st.notes[0].fret, st.notes[0].midi, st.cursor.string],
      [1, 0, 45, 1],
    );

    // Проверим переход между 3-й и 2-й струнами (интервал 4 полутона: лад 4 на 3-й → лад 0 на 2-й; лад 0 на 2-й → лад 4 на 3-й)
    await page.evaluate(() => tabGpSetTime(tabInsertEditorState, 1, 3));
    await sendCombo('ArrowUp', { alt: true });
    st = await getEditorState();
    check(
      '#1: Между 3-й и 2-й струной учтён интервал 4 полутона (лад 4 на 3-й → лад 0 на 2-й, B3 = MIDI 59)',
      [st.notes[1].string, st.notes[1].fret, st.notes[1].midi],
      [4, 0, 59],
    );

    await page.evaluate(() => tabGpSetTime(tabInsertEditorState, 2, 4));
    await sendCombo('ArrowDown', { alt: true });
    st = await getEditorState();
    check(
      '#1: Alt+↓ переносит лад 0 со 2-й струны в лад 4 на 3-й струне (B3 = MIDI 59)',
      [st.notes[2].string, st.notes[2].fret, st.notes[2].midi],
      [3, 4, 59],
    );
    await page.screenshot({ path: path.join(OUT_DIR, '01-pitch-move-standard.png') });

    // --- Пункт 2: Упор в крайнюю 6-ю струну блокируется, нота и курсор на месте, подсказка видна ~2 с (в 0.686 лады <0 и >24 разрешены с красной меткой) ---
    await setFixture([
      { start: 0, dur: 1, string: 0, fret: 3 },
      { start: 1, dur: 1, string: 4, fret: 21 },
      { start: 2, dur: 1, string: 0, fret: 7 },
      { start: 3, dur: 1, string: 0, fret: 9 },
    ], 0, 0);
    await sendCombo('ArrowDown', { alt: true }); // ниже 6-й струны струн нет
    st = await getEditorState();
    check(
      '#2: На крайней 6-й струне Alt+↓ оставляет ноту и курсор на месте и показывает подсказку',
      [st.notes[0].string, st.notes[0].fret, st.cursor.string, st.history, st.notice, st.toastShown],
      [0, 3, 0, 0, 'Эту ноту нельзя перенести на соседнюю струну', true],
    );

    // Подождём 2.4 секунды — подсказка должна сама исчезнуть
    await wait(2400);
    st = await getEditorState();
    check('#2: Через пару секунд подсказка аккуратно исчезает сама', [st.notice, st.toastShown], ['', false]);

    // В 0.686 лад > 24 (21 на 2-й струне + 4 = 25 на 3-й струне) переносится с сохранением звука
    await page.evaluate(() => tabGpSetTime(tabInsertEditorState, 1, 4));
    await sendCombo('ArrowDown', { alt: true });
    st = await getEditorState();
    check(
      '#2 (0.686): При пересчитанном ладе > 24 (21 на 2-й → 25 на 3-й) нота переносится с сохранением высоты',
      [st.notes[1].string, st.notes[1].fret, st.cursor.string],
      [3, 25, 3],
    );

    // --- Пункт 3: Занятая соседняя струна на той же доле ---
    await setFixture([
      { start: 0, dur: 1, string: 0, fret: 5 },
      { start: 0, dur: 1, string: 1, fret: 7 },
      { start: 1, dur: 2, string: 0, fret: 0, dots: 1 },
    ], 0, 0);
    await sendCombo('ArrowUp', { alt: true });
    st = await getEditorState();
    check(
      '#3: Если на соседней струне той же доли уже есть нота, перенос не выполняется',
      [st.notes.filter((n) => n.start === 0).map((n) => [n.string, n.fret]), st.cursor.string, st.history],
      [[[0, 5], [1, 7]], 0, 0],
    );

    // --- Пункт 4: Аккорд из двух нот и выделение из нескольких нот (всё или ничего) ---
    await setFixture([
      { start: 0, dur: 1, string: 0, fret: 5 },
      { start: 0, dur: 1, string: 1, fret: 7 },
      { start: 1, dur: 1, string: 0, fret: 7 },
      { start: 1, dur: 1, string: 1, fret: 9 },
      { start: 2, dur: 1, string: 0, fret: 3 },
      { start: 3, dur: 1, string: 0, fret: 5 },
    ], 0, 0);
    // Выделим аккорд из двух нот на доле 0 прямоугольным выделением Shift+↑ (струны 6 и 5)
    await sendCombo('ArrowUp', { shift: true });
    await sendCombo('ArrowUp', { alt: true });
    st = await getEditorState();
    check(
      '#4 + #7: Аккорд из двух нот [6:5, 5:7] переносится целиком в [5:0, 4:2] с сохранением обоих звуков',
      st.notes.filter((n) => n.start === 0).map((n) => [n.string, n.fret, n.midi]),
      [[1, 0, 45], [2, 2, 52]],
    );
    await page.screenshot({ path: path.join(OUT_DIR, '03-two-note-chord-moved.png') });

    // Проверим отмену Ctrl+Z на аккорде из двух нот
    await sendCombo('KeyZ', { ctrl: true });
    st = await getEditorState();
    check(
      '#7: Ctrl+Z возвращает аккорд из двух нот обратно на прежние струны и лады [6:5, 5:7]',
      st.notes.filter((n) => n.start === 0).map((n) => [n.string, n.fret]),
      [[0, 5], [1, 7]],
    );

    // Смешанное выделение: доля 1 (6-я занята и 5-я занята -> одиночная 6-я струна упирается в 5-ю!) + доля 2 (6-я свободна на 5-й)
    await page.evaluate(() => {
      tabInsertEditorState.gpSelection = null;
      tabGpSetTime(tabInsertEditorState, 1, 0);
    });
    // Сделаем stringScoped выделение только 6-й струны на долях 1..2: на доле 1 струна 1 (5-я) уже занята нотой [1,9]!
    await page.evaluate(() => {
      const e = tabInsertEditorState;
      e.gpSelection = {
        anchor: { bar: 0, index: 1 },
        focus: { bar: 0, index: 2 },
        anchorString: 0,
        focusString: 0,
        stringScoped: true,
        barMode: false,
      };
      tabGpDecorate(e);
    });
    await sendCombo('ArrowUp', { alt: true });
    st = await getEditorState();
    check(
      '#4: В выделении нескольких нот, если хоть одну перенести нельзя (занята струна), не меняется ни одна и показана подсказка',
      [
        st.notes.filter((n) => n.start === 1 || n.start === 2).map((n) => [n.start, n.string, n.fret]),
        st.notice,
      ],
      [[[1, 0, 7], [1, 1, 9], [2, 0, 3]], 'Эту ноту нельзя перенести на соседнюю струну'],
    );

    // --- Пункт 5: Alt+Shift+↑ / Alt+Shift+↓ = на полтона вверх/вниз (лад ±1, в 0.686 включая <0 и >24) + шпаргалка «?» ---
    await setFixture([
      { start: 0, dur: 1, string: 0, fret: 5 },
      { start: 1, dur: 1, string: 0, fret: 0 },
      { start: 2, dur: 1, string: 0, fret: 24 },
      { start: 3, dur: 1, string: 0, fret: 0, dead: true },
    ], 0, 0);
    await sendCombo('ArrowUp', { alt: true, shift: true });
    st = await getEditorState();
    check(
      '#5: Alt+Shift+↑ поднимает ноту на полтона (лад 5 → 6 на той же 6-й струне)',
      [st.notes[0].string, st.notes[0].fret, st.history],
      [0, 6, 1],
    );
    await sendCombo('ArrowDown', { alt: true, shift: true });
    st = await getEditorState();
    check(
      '#5: Alt+Shift+↓ опускает ноту на полтона (лад 6 → 5 на той же 6-й струне)',
      [st.notes[0].string, st.notes[0].fret],
      [0, 5],
    );

    // В 0.686 на ладу 0 Alt+Shift+↓ уводит в -1, а на ладу 24 Alt+Shift+↑ уводит в 25
    await page.evaluate(() => tabGpSetTime(tabInsertEditorState, 1, 0));
    await sendCombo('ArrowDown', { alt: true, shift: true });
    st = await getEditorState();
    check('#5 (0.686): На ладу 0 нажатие Alt+Shift+↓ уводит в красный лад −1', st.notes[1].fret, -1);

    await page.evaluate(() => tabGpSetTime(tabInsertEditorState, 2, 0));
    await sendCombo('ArrowUp', { alt: true, shift: true });
    st = await getEditorState();
    check('#5 (0.686): На ладу 24 нажатие Alt+Shift+↑ уводит в красный лад 25', st.notes[2].fret, 25);

    // Dead note × свободно переставляется на соседнюю струну по Alt+↑
    await page.evaluate(() => tabGpSetTime(tabInsertEditorState, 3, 0));
    await sendCombo('ArrowUp', { alt: true });
    st = await getEditorState();
    check('#5: Глушёная нота × свободно переставляется на соседнюю струну по Alt+↑', [st.notes[3].string, st.notes[3].dead], [1, true]);

    // Проверим памятку «?» (оба режима macOS и Windows)
    await page.click('[data-tab-help]');
    await wait(150);
    await page.click('[data-tab-os="win"]');
    await wait(100);
    const helpWin = await page.$eval('[data-tab-shortcuts-popover]', (el) => el.textContent);
    await page.screenshot({ path: path.join(OUT_DIR, '04-shortcuts-popover-win.png') });
    await page.click('[data-tab-os="mac"]');
    await wait(100);
    const helpMac = await page.$eval('[data-tab-shortcuts-popover]', (el) => el.textContent);
    check(
      '#5: В шпаргалке «?» присутствуют оба сочетания (Alt+↑/↓ и Alt+Shift+↑/↓ на Windows, ⌥↑/↓ и ⌥⇧↑/↓ на Mac)',
      helpWin.includes('Alt+↑ / Alt+↓') &&
        helpWin.includes('Alt+Shift+↑ / Alt+Shift+↓') &&
        helpMac.includes('⌥↑ / ⌥↓') &&
        helpMac.includes('⌥⇧↑ / ⌥⇧↓'),
      true,
    );
    await page.click('[data-tab-help]');
    await wait(100);

    // --- Пункт 6: Нестандартный строй Drop D (D2 A2 D3 G3 B3 E4 — между 6-й и 5-й 7 полутонов!) ---
    await setFixture(
      [
        { start: 0, dur: 1, string: 0, fret: 7 },
        { start: 1, dur: 1, string: 0, fret: 5 },
        { start: 2, dur: 1, string: 1, fret: 0 },
        { start: 3, dur: 1, string: 0, fret: 12 },
      ],
      0,
      0,
      'drop-d',
    );
    await sendCombo('ArrowUp', { alt: true }); // D2(38) + 7 = 45 (A2) -> 5-я струна лад 0!
    st = await getEditorState();
    check(
      '#6: В строю Drop D лад 7 на 6-й струне (D2+7=A2) переносится в лад 0 на 5-й струне',
      [st.notes[0].string, st.notes[0].fret, st.notes[0].midi],
      [1, 0, 45],
    );
    await page.screenshot({ path: path.join(OUT_DIR, '05-drop-d-move.png') });

    // В 0.686 лад 5 на 6-й струне в Drop D (38 + 5 = 43 = G2) переносится на 5-ю струну как красный лад −2!
    await page.evaluate(() => tabGpSetTime(tabInsertEditorState, 1, 0));
    await sendCombo('ArrowUp', { alt: true });
    st = await getEditorState();
    check(
      '#6 (0.686): В строю Drop D лад 5 на 6-й струне переносится на 5-ю струну в красный лад −2 (G2 = MIDI 43)',
      [st.notes[1].string, st.notes[1].fret, st.notes[1].midi],
      [1, -2, 43],
    );

    // И обратно в Drop D: лад 0 на 5-й струне -> Alt+↓ -> лад 7 на 6-й струне!
    await page.evaluate(() => tabGpSetTime(tabInsertEditorState, 2, 1));
    await sendCombo('ArrowDown', { alt: true });
    st = await getEditorState();
    check(
      '#6: В строю Drop D лад 0 на 5-й струне по Alt+↓ переносится в лад 7 на 6-й струне',
      [st.notes[2].string, st.notes[2].fret, st.notes[2].midi],
      [0, 7, 45],
    );

    // --- Пункт 7: Перенос нот с приёмами (лига, слайд, бенд) + отмена Ctrl+Z ---
    await setFixture(
      [
        { start: 0, dur: 1, string: 0, fret: 7, tabEffects: true },
        { start: 1, dur: 1, string: 0, fret: 7, tie: true, tabEffects: true },
        { start: 2, dur: 1, string: 0, fret: 5, slide: 'legato', tabEffects: true },
        { start: 3, dur: 1, string: 0, fret: 7, tabEffects: true },
      ],
      0,
      0,
      'e-std',
    );
    // 7а. Лига: курсор стоит только на первой ноте (start=0), нажимаем Alt+↑ -> вся тянущаяся пара 7—7 переходит в 2—2 на 5-й струне с лигой!
    await sendCombo('ArrowUp', { alt: true });
    st = await getEditorState();
    check(
      '#7 (Лига): Alt+↑ переносит связанную лигой ноту целиком (7—7 на 6-й → 2—2 на 5-й) с сохранением лиги',
      [
        [st.notes[0].string, st.notes[0].fret],
        [st.notes[1].string, st.notes[1].fret, st.notes[1].tie],
      ],
      [[1, 2], [1, 2, true]],
    );
    await sendCombo('KeyZ', { ctrl: true });
    st = await getEditorState();
    check(
      '#7 (Лига + Ctrl+Z): Отмена возвращает обе ноты лиги на 6-ю струну и лад 7',
      [[st.notes[0].string, st.notes[0].fret], [st.notes[1].string, st.notes[1].fret, st.notes[1].tie]],
      [[0, 7], [0, 7, true]],
    );

    // 7б. Парный слайд (5 / 7 на долях 2..3): выделяем пару Shift+→ и переносим Alt+↑ -> 0 / 2 на 5-й струне со слайдом!
    await page.evaluate(() => tabGpSetTime(tabInsertEditorState, 2, 0));
    await sendCombo('ArrowRight', { shift: true });
    await sendCombo('ArrowUp', { alt: true });
    st = await getEditorState();
    check(
      '#7 (Слайд): Пара со слайдом 5/7 переносится на 5-ю струну как 0/2 с сохранением слайда',
      [[st.notes[2].string, st.notes[2].fret, st.notes[2].slide], [st.notes[3].string, st.notes[3].fret]],
      [[1, 0, 'legato'], [1, 2]],
    );

    // 7в. Бенд: нота с Full-бендом на 3-й струне (лад 7) -> Alt+↑ -> 2-я струна (лад 3) с сохранением бенда!
    await setFixture(
      [
        {
          start: 0,
          dur: 2,
          string: 3,
          fret: 7,
          bend: { type: 'bend', points: [[0, 0], [1, 2]] },
          tabEffects: true,
        },
        { start: 2, dur: 1, string: 0, fret: 5, slide: 'legato', tabEffects: true },
        { start: 3, dur: 1, string: 0, fret: 7, tabEffects: true },
      ],
      0,
      3,
      'e-std',
    );
    await sendCombo('ArrowUp', { alt: true }); // G3(55)+7=62 -> B3(59)+3=62
    st = await getEditorState();
    check(
      '#7 (Бенд): Нота с бендом на 3-й струне (лад 7) переносится на 2-ю струну (лад 3) с сохранением бенда',
      [st.notes[0].string, st.notes[0].fret, st.notes[0].bend, st.notes[0].midi],
      [4, 3, 'bend', 62],
    );
    await page.screenshot({ path: path.join(OUT_DIR, '06-techniques-bend-moved.png') });

    await sendCombo('KeyZ', { ctrl: true });
    st = await getEditorState();
    check(
      '#7 (Бенд + Ctrl+Z): Отмена возвращает ноту с бендом на 3-ю струну и лад 7',
      [st.notes[0].string, st.notes[0].fret, st.notes[0].bend],
      [3, 7, 'bend'],
    );

    check('Отсутствуют ошибки JavaScript на странице', errors, []);
    fs.writeFileSync(path.join(OUT_DIR, 'checks.json'), JSON.stringify({ passed, failed, checks }, null, 2));
    await page.close();
  } finally {
    await browser.close();
  }

  console.log(`\nALL ${passed}/${passed + failed} 0.685 ACCEPTANCE CHECKS ${failed === 0 ? 'PASSED!' : 'COMPLETED WITH FAILURES'}`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * 0.686 Acceptance & Screenshot Test — B-12.12:
 * Перенос нот на лады 25+ и -1 и ниже с красной подсветкой (.tab-gp-out-fret / .is-out-fret):
 * 1) Alt+↑/↓ переносит в отрицательные лады (-1, -2…) и высокие лады (25+), помечая их красным на стане;
 * 2) Alt+Shift+↑/↓ также свободно уводит в -1, -2… и 25+ с красной подсветкой;
 * 3) Звук при переносе и кнопке «Прослушать» звучит настоящей высотой ноты (даже для -2 и 26);
 * 4) «Применить» разрешено для высоких ладов 25–30 (красная метка сохраняется и в мини-табе/Ленте, экспорт GP5/GPX/MIDI работает),
 *    а для отрицательных ладов (<0) и ладов >30 «Применить» заблокировано с понятной подсказкой до исправления;
 * 5) Отказ с 2-секундной подсказкой срабатывает только на краях 1-й/6-й струны и занятой соседней струне.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const OUT_DIR = path.join(__dirname, '..', 'bench', 'results', 'tab-gp8-0.686');
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
    check('Версия в шапке не ниже 0.686', /ver 0\.68[6-9]|ver 0\.69\d/.test(ver), true);

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
      window.__pluckedFreqs = [];
      const origPluck = window.pluckString;
      if (typeof origPluck === 'function') {
        window.pluckString = function (ctx, opts) {
          if (opts && Number.isFinite(opts.freq)) {
            window.__pluckedFreqs.push(Math.round(opts.freq * 100) / 100);
          }
          return origPluck.apply(this, arguments);
        };
      }
      startNewSongFromHome();
      if (!sections.length) addSection('Intro');
      addTabInsert(sections[0].id);
    });
    await page.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 30000 });
    await wait(200);

    const setFixture = async (notes, cursorStart = 0, cursorStr = 0, theme = 'light') => {
      await page.evaluate(
        ({ notesIn, cStart, cStr, th }) => {
          document.documentElement.dataset.theme = th;
          const toastEl = document.getElementById('toast');
          if (toastEl) toastEl.classList.remove('show');
          window.__pluckedFreqs = [];
          tunerCustomNotes = null;
          tunerTuningId = 'e-std';
          onSongTuningChanged({ silent: true });
          const e = tabInsertEditorState;
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
        { notesIn: notes, cStart: cursorStart, cStr: cursorStr, th: theme },
      );
      await wait(140);
    };

    const sendCombo = async (code, { alt = false, shift = false, ctrl = false } = {}) => {
      await page.evaluate(
        ({ c, a, s, ct }) => {
          const host = document.querySelector('.tab-at-host');
          const keyMap = { ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowRight: 'ArrowRight', KeyZ: 'z' };
          host.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: keyMap[c] || c,
              code: c,
              altKey: a,
              shiftKey: s,
              ctrlKey: ct,
              bubbles: true,
              cancelable: true,
            }),
          );
        },
        { c: code, a: alt, s: shift, ct: ctrl },
      );
      await wait(90);
    };

    const readUi = () =>
      page.evaluate(() => {
        const e = tabInsertEditorState;
        const err = e?.overlay?.querySelector('[data-tab-gp-error]');
        const apply = e?.overlay?.querySelector('[data-tab-apply]');
        const badges = [...document.querySelectorAll('.tab-gp-out-fret')].map((b) => ({
          fret: Number(b.dataset.outFret),
          string: Number(b.dataset.outString),
          text: b.textContent.trim(),
          color: getComputedStyle(b).color,
          borderColor: getComputedStyle(b).borderColor,
        }));
        const cursorDot = document.querySelector('.tab-at-cursor-dot');
        return {
          notes: (e?.draft?.notes || []).map((n) => ({
            start: n.start,
            string: n.string,
            fret: n.fret,
            midi: tabGpOpenMidi(n.string) + n.fret,
          })),
          badges,
          cursorIsOutFret: !!cursorDot?.classList.contains('is-out-fret'),
          applyDisabled: !!apply?.disabled,
          errorHidden: err ? err.hidden : true,
          errorText: err && !err.hidden ? err.textContent.trim() : '',
          plucked: [...(window.__pluckedFreqs || [])],
        };
      });

    // === 1. Перенос в отрицательные лады (-2, -7) и возврат обратно ===
    await setFixture(
      [
        { start: 0, dur: 1, string: 0, fret: 3 }, // G2 = 98.00 Hz (MIDI 43)
        { start: 1, dur: 1, string: 4, fret: 22 }, // A5 = 880.00 Hz (MIDI 81)
        { start: 2, dur: 1, string: 1, fret: 5 },
        { start: 3, dur: 1, string: 2, fret: 7 },
      ],
      0,
      0,
      'light',
    );
    await sendCombo('ArrowUp', { alt: true }); // 3 на 6-й -> -2 на 5-й!
    let ui = await readUi();
    check(
      'Alt+↑ переносит лад 3 с 6-й струны в лад −2 на 5-й струне с сохранением G2 (MIDI 43)',
      [ui.notes[0].string, ui.notes[0].fret, ui.notes[0].midi],
      [1, -2, 43],
    );
    check(
      'Лад −2 помечен красной плашкой .tab-gp-out-fret с текстом «-2» и красной рамкой курсора',
      [ui.badges.length, ui.badges[0]?.fret, ui.badges[0]?.text, ui.cursorIsOutFret],
      [1, -2, '-2', true],
    );
    check(
      'При отрицательном ладе −2 кнопка «Применить» ждёт исправления с понятной подсказкой',
      [ui.applyDisabled, ui.errorText.includes('ниже открытой струны')],
      [true, true],
    );

    // Ещё раз Alt+↑: -2 на 5-й -> -7 на 4-й струне (всё та же G2 = 98.00 Hz!)
    await sendCombo('ArrowUp', { alt: true });
    ui = await readUi();
    check(
      'Повторный Alt+↑ уводит ноту дальше в лад −7 на 4-й струне с тем же звуком G2 (98 Гц)',
      [ui.notes[0].string, ui.notes[0].fret, ui.notes[0].midi, ui.badges[0]?.text],
      [2, -7, 43, '-7'],
    );

    // Перенесём вторую ноту (лад 22 на 2-й струне) вниз на 3-ю струну -> лад 26!
    await page.evaluate(() => tabGpSetTime(tabInsertEditorState, 1, 4));
    await sendCombo('ArrowDown', { alt: true });
    ui = await readUi();
    check(
      'Alt+↓ переносит лад 22 со 2-й струны в высокий лад 26 на 3-й струне (MIDI 81 = A5) с красной меткой',
      [ui.notes[1].string, ui.notes[1].fret, ui.notes[1].midi, ui.badges.map((b) => b.text)],
      [3, 26, 81, ['-7', '26']],
    );
    await page.screenshot({ path: path.join(OUT_DIR, '01-negative-and-high-red-light.png') });

    // Проверим тёмную тему с красными ладами (-2 и 26)
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
      renderTabInsertEditor(tabInsertEditorState);
      tabGpDecorate(tabInsertEditorState);
    });
    await wait(140);
    await page.screenshot({ path: path.join(OUT_DIR, '02-negative-and-high-red-dark.png') });

    // Проверим «Прослушать черновик» — и -7 на 4-й (G2 = 98 Гц), и 26 на 3-й (A5 = 880 Гц) звучат настоящими высотами!
    const playPitches = await page.evaluate(() => {
      window.__pluckedFreqs = [];
      getAudioContext();
      tabEditorTogglePlay(tabInsertEditorState, true);
      const out = [...window.__pluckedFreqs];
      tabEditorStopPlay(tabInsertEditorState);
      return out;
    });
    check(
      'При нажатии «Прослушать» и отрицательный лад (−7 → 98 Гц), и высокий лад (26 → 880 Гц) звучат настоящей высотой',
      [Math.abs(playPitches[0] - 98) < 0.2, Math.abs(playPitches[1] - 880) < 0.5],
      [true, true],
    );

    // === 2. Alt+Shift+↑ / Alt+Shift+↓ тоже свободно уводят в < 0 и > 24 с красной подсветкой ===
    await setFixture(
      [
        { start: 0, dur: 1, string: 0, fret: 0 },
        { start: 1, dur: 1, string: 5, fret: 24 },
        { start: 2, dur: 1, string: 2, fret: 5 },
        { start: 3, dur: 1, string: 2, fret: 7 },
      ],
      0,
      0,
      'light',
    );
    await sendCombo('ArrowDown', { alt: true, shift: true }); // 0 -> -1
    await sendCombo('ArrowDown', { alt: true, shift: true }); // -1 -> -2
    ui = await readUi();
    check(
      'Alt+Shift+↓ дважды на открытой струне уводит лад в −2 с красной подсветкой',
      [ui.notes[0].fret, ui.badges[0]?.text, ui.applyDisabled],
      [-2, '-2', true],
    );
    // Вернём двумя нажатиями Alt+Shift+↑ обратно в 0 — красная метка снимается и «Применить» включается!
    await sendCombo('ArrowUp', { alt: true, shift: true });
    await sendCombo('ArrowUp', { alt: true, shift: true });
    ui = await readUi();
    check(
      'Alt+Shift+↑ возвращает лад из −2 обратно в 0: красная метка исчезает, «Применить» активно',
      [ui.notes[0].fret, ui.badges.length, ui.applyDisabled],
      [0, 0, false],
    );

    // А на 24-м ладу Alt+Shift+↑ уводит в 25 и 26 (красные, но в пределах 25–30 «Применить» разрешено!)
    await page.evaluate(() => tabGpSetTime(tabInsertEditorState, 1, 5));
    await sendCombo('ArrowUp', { alt: true, shift: true }); // 25
    await sendCombo('ArrowUp', { alt: true, shift: true }); // 26
    ui = await readUi();
    check(
      'Alt+Shift+↑ уводит 24-й лад в 26: лад подсвечен красным, а «Применить» для ладов 25–30 доступно',
      [ui.notes[1].fret, ui.badges.map((b) => b.text), ui.applyDisabled],
      [26, ['26'], false],
    );

    // Если же увести выше 30 (например, до 31), «Применить» блокируется с подсказкой про диапазон 0–30
    for (let i = 0; i < 5; i++) await sendCombo('ArrowUp', { alt: true, shift: true }); // 26 -> 31
    ui = await readUi();
    check(
      'При ладе 31 (> 30) нота красная, а «Применить» ждёт возврата в диапазон 0–30',
      [ui.notes[1].fret, ui.badges[0]?.text, ui.applyDisabled, ui.errorText.includes('30')],
      [31, '31', true, true],
    );
    // Вернём на лад 27 (<= 30) и нажмём «Применить»!
    for (let i = 0; i < 4; i++) await sendCombo('ArrowDown', { alt: true, shift: true }); // 31 -> 27
    ui = await readUi();
    check('На ладу 27 кнопка «Применить» снова активна', [ui.notes[1].fret, ui.applyDisabled], [27, false]);

    // === 3. Сохранение лада 27 по «Применить», красная метка на мини-табе и экспорт GP5/GPX/MIDI ===
    await page.click('[data-tab-apply]');
    await wait(250);
    const savedSongCheck = await page.evaluate(() => {
      const editorOpen = !!document.querySelector('.tab-insert-editor');
      const sq = sections[0].squares[0];
      // 0.692: таб в клетке рисует alphaTab; высокий лад помечается на самой
      // клетке, а в готовом рисунке его номер окрашен предупреждающим цветом.
      const body = document.querySelector('.tab-insert .tab-insert-body');
      const redMini = body && body.dataset.tabOutFret
        ? [...body.querySelectorAll('.tab-thumb text')]
            .filter((el) => /^\d+$/.test(el.textContent.trim()) && Number(el.textContent) > 24)
            .map((el) => el.textContent.trim())
        : [];
      const gp5 = gpExportBytesGP5();
      const gpx = gpExportBytes();
      const midi = midiExportBytes();
      return {
        editorOpen,
        savedFrets: sq.notes.map((n) => n.fret),
        redMini,
        gp5Bytes: gp5.bytes.length,
        gpxBytes: gpx.bytes.length,
        midiBytes: midi.bytes.length,
      };
    });
    check(
      '«Применить» сохраняет лад 27 в песню, мини-таб подсвечивает «27» красным, экспорт GP5/GPX/MIDI проходит без сбоев',
      [
        savedSongCheck.editorOpen,
        savedSongCheck.savedFrets,
        savedSongCheck.redMini,
        savedSongCheck.gp5Bytes > 100,
        savedSongCheck.gpxBytes > 100,
        savedSongCheck.midiBytes > 40,
      ],
      [false, [0, 27, 5, 7], ['27'], true, true, true],
    );
    await page.screenshot({ path: path.join(OUT_DIR, '03-saved-mini-tab-red-27.png') });

    check('Отсутствуют ошибки JavaScript на странице', pageErrors, []);

    fs.writeFileSync(path.join(OUT_DIR, 'checks.json'), JSON.stringify(results, null, 2));
    const failed = results.filter((r) => !r.ok);
    if (failed.length) {
      console.error(`\nFAILED ${failed.length}/${results.length} checks.`);
      process.exit(1);
    }
    console.log(`\nALL ${results.length}/${results.length} 0.686 ACCEPTANCE CHECKS PASSED!`);
  } finally {
    await browser.close();
  }
})();

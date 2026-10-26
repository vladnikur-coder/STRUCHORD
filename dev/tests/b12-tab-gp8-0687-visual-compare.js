#!/usr/bin/env node
/**
 * 0.687 visual comparison harness — «паузы и удаление: STRUCHORD vs Guitar Pro 8».
 * Снимает крупным планом одни и те же состояния стана, чтобы сравнить с GP8:
 *   A — явная пауза в середине такта (полный такт),
 *   B — Backspace по ноте: нота стала паузой, такт остаётся полным,
 *   C — Backspace/Delete по паузе (0.687): доля исчезла, такт «не заполнен»,
 *   D — полностью пустой такт,
 *   E — смешанное выделение до/после первого нажатия,
 *   F — та же «не заполненная» доля в тёмной теме.
 * Ничего не меняет в продукте: только кадры для сравнения.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const OUT_DIR = path.join(__dirname, '..', 'bench', 'results', 'tab-pause-vs-gp8');
fs.mkdirSync(OUT_DIR, { recursive: true });

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
  const report = {};

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#devPanelTrigger', { timeout: 30000 });

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
      startNewSongFromHome();
      if (!sections.length) addSection('Intro');
      addTabInsert(sections[0].id);
    });
    await page.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 30000 });
    await wait(250);

    const setFixture = async (notes, cursorStart = 0, cursorStr = 0, beats = 4, theme = 'light') => {
      await page.evaluate(
        ({ notesIn, cStart, cStr, b, th }) => {
          document.documentElement.dataset.theme = th;
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
          // Крупный план стана: ручное приближение на z шагов
          tabAtHostEl?.focus({ preventScroll: true });
        },
        { notesIn: notes, cStart: cursorStart, cStr: cursorStr, b: beats, th: theme },
      );
      await wait(220);
    };

    const key = async (code, { shift = false } = {}) => {
      await page.evaluate(
        ({ c, s }) => {
          const host = document.querySelector('.tab-at-host');
          const map = { Backspace: 'Backspace', Delete: 'Delete', ArrowRight: 'ArrowRight' };
          host.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: map[c] || c,
              code: c,
              shiftKey: s,
              bubbles: true,
              cancelable: true,
            }),
          );
        },
        { c: code, s: shift },
      );
      await wait(160);
    };

    const shotStaff = async (name) => {
      // Кадр «шапка модалки + предупреждение над станом + подпись + сам стан»
      await page.evaluate(() => {
        const host = document.querySelector('.tab-insert-editor .tab-at-host');
        if (host) host.scrollLeft = 0;
        const scrollBox = document.querySelector('.tab-insert-editor');
        if (scrollBox) scrollBox.scrollTop = 0;
        window.scrollTo(0, 0);
      });
      await wait(90);
      const modal = await page.$('.tab-insert-editor');
      const box = await modal.boundingBox();
      const info = await page.evaluate(() => {
        const host = document.querySelector('.tab-insert-editor .tab-at-host');
        const status = document.querySelector('[data-tab-gp-error]');
        const r = host.getBoundingClientRect();
        const s = status && !status.hidden ? status.getBoundingClientRect() : null;
        return {
          scrollY: window.scrollY,
          staffTop: r.top + window.scrollY,
          staffBottom: r.bottom + window.scrollY,
          warnTop: s ? s.top + window.scrollY : null,
        };
      });
      const top = Math.max(box.y, 0) - 6 + info.scrollY;
      const topEdge = Math.min(info.staffTop, info.warnTop ?? info.staffTop) - 46;
      const startY = Math.max(box.y + info.scrollY, Math.min(topEdge, top));
      const endY = Math.min(info.staffBottom + 8, box.y + info.scrollY + box.height);
      await page.screenshot({
        path: path.join(OUT_DIR, name + '.png'),
        clip: { x: Math.max(0, box.x - 6), y: startY, width: Math.min(box.width + 12, 1400), height: Math.max(120, endY - startY) },
      });
      report[name] = await page.evaluate(() => {
        const e = tabInsertEditorState;
        const err = e?.overlay?.querySelector('[data-tab-gp-error]');
        return {
          groups: e.gpBars.map((b) => b.map((g) => ({ dur: g.dur, notes: g.notes.length, ghost: !!g.ghost, wholeBar: !!g.wholeBar, implicit: !!g.implicit }))),
          draft: (e.draft.notes || []).map((n) => (n.pause ? ['rest', n.start, n.dur] : [n.fret, n.start, n.dur, n.string])),
          errorText: err && !err.hidden ? err.textContent.trim() : '',
          invalidFrames: document.querySelectorAll('.tab-gp-invalid').length,
          ghostGlyphs: document.querySelectorAll('.tab-at-host svg .tab-gp-ghost').length,
          applyDisabled: document.querySelector('[data-tab-apply]').disabled,
        };
      });
    };

    const fourNotes = [
      { start: 0, dur: 1, string: 0, fret: 3 },
      { start: 1, dur: 1, string: 0, fret: 5 },
      { start: 2, dur: 1, string: 0, fret: 7 },
      { start: 3, dur: 1, string: 0, fret: 9 },
    ];

    // A — явная пауза в середине такта (после Backspace по ноте)
    await setFixture(fourNotes, 1);
    await key('Backspace');
    await shotStaff('A-rest-in-middle-light');

    // B — пауза в конце такта: три ноты и пауза
    await setFixture(
      [
        { start: 0, dur: 1, string: 0, fret: 3 },
        { start: 1, dur: 1, string: 0, fret: 5 },
        { start: 2, dur: 1, string: 0, fret: 7 },
      ],
      3,
    );
    await shotStaff('B-rest-at-end-light');

    // C — 0.687: пауза удалена, такт «не заполнен»
    await key('Delete');
    await shotStaff('C-rest-deleted-underfill-light');

    // D — полностью пустой такт
    await setFixture([], 0);
    await shotStaff('D-empty-bar-light');

    // E — смешанное выделение: до и после первого нажатия
    await setFixture(fourNotes, 0);
    for (let i = 0; i < 3; i++) await key('ArrowRight', { shift: true });
    await shotStaff('E1-mixed-selection-light');
    await key('Delete');
    await shotStaff('E2-mixed-selection-after-first-press-light');

    // F — «не заполнен» в тёмной теме
    await setFixture(fourNotes, 1, 0, 4, 'dark');
    await key('Backspace');
    await key('Backspace');
    await shotStaff('F-rest-deleted-underfill-dark');

    // G — нота с паузой впереди и «хвост» из автоматических пауз
    await setFixture(
      [
        { start: 2, dur: 1, string: 0, fret: 7 },
        { start: 3, dur: 1, string: 0, fret: 9 },
      ],
      2,
    );
    await shotStaff('G-leading-auto-rests-light');

    fs.writeFileSync(path.join(OUT_DIR, 'states.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
})();

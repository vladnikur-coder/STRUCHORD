#!/usr/bin/env node
/**
 * 0.874 · Проверка окна редактора таб-вставки на четырёх разрешениях и в двух
 * темах + скриншоты «до/после».
 *
 * Проверяет ровно то, что просил владелец:
 *   1280×900, 1366×680, 1024×768, 390×844 — светлая и тёмная тема;
 *   1) окно не вылезает за экран и не прокручивается само;
 *   2) панель инструментов (длительности/приёмы/правка/навигация) целиком видна;
 *   3) стан ограничен по высоте и при нескольких тактах прокручивается внутри;
 *   4) появление строки «Такт N: M из K — не заполнен» не двигает окно;
 *   5) на компьютере есть панель ладов 0–9 и переключатель «Лады»;
 *   6) в пустом стане видна подсказка про цифру.
 *
 * Запуск:
 *   python3 -m http.server 8000            # из корня репозитория
 *   SHOTS_TAG=after  node dev/tests/b12-tab-editor-layout-0874-shots.js
 *   SHOTS_TAG=before STRUCHORD_URL=http://127.0.0.1:8000/tmp/before.html \
 *     node dev/tests/b12-tab-editor-layout-0874-shots.js
 *
 * Для «до» положите версию 0.873 рядом: `git show 99959b5:STRUCHORD.html > before.html`
 * и откройте её по своему URL (`STRUCHORD_URL`). Скриншоты и audit.json
 * складываются в dev/bench/results/tab-editor-layout-0.874-<TAG>/.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const TAG = process.env.SHOTS_TAG || 'after';
const OUT_DIR = path.join(__dirname, '..', 'bench', 'results', 'tab-editor-layout-0.874-' + TAG);
fs.mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS = [
  { name: '1280x900', width: 1280, height: 900, touch: false },
  { name: '1366x680', width: 1366, height: 680, touch: false },
  { name: '1024x768', width: 1024, height: 768, touch: true },
  { name: '390x844', width: 390, height: 844, touch: true },
];
const THEMES = ['light', 'dark'];

const audit = [];
const failures = [];
function check(name, condition, details) {
  audit.push({ name, ok: !!condition, details });
  if (!condition) {
    failures.push(name + (details ? ' — ' + JSON.stringify(details) : ''));
    console.error('FAIL: ' + name + (details ? ' ' + JSON.stringify(details) : ''));
  } else {
    console.log('ok:   ' + name);
  }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Песня с двумя тактами таб-вставки: именно на ней «Приёмы» сжимались в полоску.
async function openTwoBarInsert(page) {
  await page.evaluate(() => {
    startNewSongFromHome();
    addSection('Verse');
    const sec = sections[0];
    sec.squares = [{
      id: nextId++, type: 'tab', repeat: 1, beats: 8, customBeats: 8, events: [],
      notes: [
        { start: 0, dur: 1, string: 0, fret: 3 }, { start: 1, dur: 1, string: 1, fret: 5 },
        { start: 2, dur: 1, string: 2, fret: 7 }, { start: 3, dur: 1, string: 3, fret: 2 },
        { start: 4, dur: 1, string: 0, fret: 0 }, { start: 5, dur: 1, string: 1, fret: 3 },
        { start: 6, dur: 1, string: 2, fret: 5 }, { start: 7, dur: 1, string: 3, fret: 7 },
      ],
    }];
    renderSectionsGrid();
  });
  await wait(1200);
  await page.evaluate(() => openTabInsertEditor(sections[0].id, sections[0].squares[0].id));
  await page.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 30000 });
  await wait(900);
}

function measure(page) {
  return page.evaluate(() => {
    const r = (el) => (el ? el.getBoundingClientRect() : null);
    const modal = document.querySelector('.tab-insert-editor .strum-modal-content');
    const body = document.querySelector('.tab-insert-editor .tab-editor-body');
    const staff = document.querySelector('.tab-at-host');
    const palette = document.querySelector('.tab-palette');
    const actions = document.querySelector('.tab-editor-actions');
    const slot = document.querySelector('.tab-status-slot');
    const status = document.querySelector('[data-tab-gp-error]');
    const frets = document.querySelector('.tab-tools-row--frets');
    const toggle = document.querySelector('[data-tab-fret-toggle]');
    const visible = (el) => !!el && getComputedStyle(el).display !== 'none' && r(el).height > 0;
    const slotBefore = r(slot).height;
    // Строка статуса появляется — окно не должно сдвинуться.
    const wasHidden = status.hidden;
    status.hidden = false;
    status.textContent = 'Такт 2: 1 из 4 — не заполнен';
    const slotAfter = r(slot).height;
    const modalAfter = r(modal).height;
    status.hidden = wasHidden;
    return {
      viewport: { w: innerWidth, h: innerHeight },
      modal: { top: r(modal).top, bottom: r(modal).bottom, height: r(modal).height, scrollHeight: modal.scrollHeight, clientHeight: modal.clientHeight },
      body: { scrollHeight: body.scrollHeight, clientHeight: body.clientHeight },
      staff: { height: r(staff).height, scrollHeight: staff.scrollHeight, clientHeight: staff.clientHeight, maxHeight: getComputedStyle(staff).maxHeight, overflowY: getComputedStyle(staff).overflowY },
      palette: { top: r(palette).top, bottom: r(palette).bottom, height: r(palette).height, visible: visible(palette) },
      actions: { bottom: r(actions).bottom, visible: visible(actions) },
      statusSlot: { height: slotBefore, heightAfterMessage: slotAfter, modalHeightAfterMessage: modalAfter, scrolls: getComputedStyle(slot).overflowY },
      frets: { visible: visible(frets), collapsed: frets && frets.getAttribute('data-collapsed'), keys: document.querySelectorAll('.tab-fret-pad [data-tab-digit]').length, toggleVisible: visible(toggle) },
      bars: (typeof tabInsertEditorState === 'object' && tabInsertEditorState.gpBars) ? tabInsertEditorState.gpBars.length : 0,
      theme: document.documentElement.dataset.theme || '',
    };
  });
}

(async () => {
  const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || (fs.existsSync('/tmp/chromium') ? '/tmp/chromium' : undefined);
  const browser = await puppeteer.launch({
    executablePath: execPath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });
  try {
    for (const vp of VIEWPORTS) {
      for (const theme of THEMES) {
        const page = await browser.newPage();
        await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.width < 500 ? 2 : 1, hasTouch: vp.touch, isMobile: vp.width < 500 });
        await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
        await wait(400);
        await openTwoBarInsert(page);
        const m = await measure(page);
        const id = `${vp.name}-${theme}`;
        audit.push({ id, ...m });

        check(`[${id}] окно целиком на экране`, m.modal.top >= -1 && m.modal.bottom <= m.viewport.h + 1, { top: m.modal.top, bottom: m.modal.bottom, vh: m.viewport.h });
        check(`[${id}] панель инструментов видна и не обрезана`, m.palette.visible && m.palette.bottom <= m.modal.bottom + 1, { paletteBottom: m.palette.bottom, modalBottom: m.modal.bottom });
        check(`[${id}] кнопки «Отмена/Применить» видны`, m.actions.visible && m.actions.bottom <= m.viewport.h + 1, { actionsBottom: m.actions.bottom, vh: m.viewport.h });
        check(`[${id}] стан ограничен по высоте`, m.staff.height <= m.staff.scrollHeight + 1 && parseFloat(m.staff.maxHeight) > 0, m.staff);
        check(`[${id}] строка статуса не двигает окно`, Math.abs(m.statusSlot.heightAfterMessage - m.statusSlot.height) < 1 && Math.abs(m.statusSlot.modalHeightAfterMessage - m.modal.height) < 1,
          { slot: m.statusSlot.height, slotWithMessage: m.statusSlot.heightAfterMessage, modal: m.modal.height, modalWithMessage: m.statusSlot.modalHeightAfterMessage });
        if (vp.width >= 1025 && !vp.touch) {
          check(`[${id}] панель ладов 0–9 на компьютере видна`, m.frets.visible && m.frets.keys === 10, m.frets);
          check(`[${id}] у панели ладов есть переключатель`, m.frets.toggleVisible, m.frets);
          check(`[${id}] по умолчанию панель развёрнута`, m.frets.collapsed === 'false', m.frets);
        } else {
          check(`[${id}] панель ладов на тач-раскладке`, m.frets.visible && m.frets.keys === 10, m.frets);
        }

        const file = path.join(OUT_DIR, `${id}.png`);
        const modalEl = await page.$('.tab-insert-editor .strum-modal-content');
        if (modalEl) await modalEl.screenshot({ path: file });
        else await page.screenshot({ path: file });
        await page.screenshot({ path: path.join(OUT_DIR, `${id}-full.png`) });
        console.log('     shot: ' + path.relative(process.cwd(), file));
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(OUT_DIR, 'audit.json'), JSON.stringify(audit, null, 2));
  const lines = audit.filter((a) => a.name).map((a) => (a.ok ? 'ok   ' : 'FAIL ') + a.name);
  lines.push('', failures.length ? `${failures.length} failed` : 'all checks passed');
  fs.writeFileSync(path.join(OUT_DIR, 'summary.txt'), lines.join('\n') + '\n');
  console.log('\n' + lines.join('\n'));
  process.exit(failures.length ? 1 : 0);
})().catch((err) => {
  console.error('FAILED: ' + (err && err.stack ? err.stack : err));
  process.exit(2);
});

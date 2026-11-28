#!/usr/bin/env node
/**
 * 0.875 · Приёмка окна редактора таб-вставки в реальном браузере.
 *
 * Матрица: 1366×680, 1280×900, 1440×800, 1024×768, 390×844 × светлая и тёмная.
 * На каждом размере печатаются девять нот подряд, затем измеряется:
 *   • высота области стана (на 680 px обязана быть ≥ 220 px);
 *   • курсор и последняя введённая нота внутри видимой области стана;
 *   • панели инструментов доступны (секции-переключатели и кнопки),
 *     ничего не обрезано, окно не прокручивается и не «прыгает»;
 *   • полоса статуса не меняет высоту окна при появлении «не заполнен».
 *
 * Запуск (нужен Chromium и локальный сервер):
 *   python3 -m http.server 8000                     # из корня репозитория
 *   SHOTS_TAG=after  node dev/tests/b12-tab-editor-layout-0875-shots.js
 *   # «до»: git show c79c2ca:STRUCHORD.html > before.html (это 0.874)
 *   SHOTS_TAG=before STRUCHORD_URL=http://127.0.0.1:8000/before.html \
 *     node dev/tests/b12-tab-editor-layout-0875-shots.js
 *
 * Результат: PNG-кадры и audit.json в dev/bench/results/tab-editor-layout-0.875-<TAG>/.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const TAG = process.env.SHOTS_TAG || 'after';
const OUT = path.join(__dirname, '..', 'bench', 'results', 'tab-editor-layout-0.875-' + TAG);
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: '1366x680', width: 1366, height: 680, touch: false, minStaff: 220 },
  { name: '1280x900', width: 1280, height: 900, touch: false, minStaff: 220 },
  { name: '1440x800', width: 1440, height: 800, touch: false, minStaff: 220 },
  { name: '1024x768', width: 1024, height: 768, touch: true, minStaff: 200 },
  { name: '390x844', width: 390, height: 844, touch: true, minStaff: 180 },
];
const THEMES = ['light', 'dark'];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = [];
const failures = [];

function check(name, condition, details) {
  rows.push({ name, ok: !!condition, details });
  if (!condition) {
    failures.push(name + (details ? ' — ' + JSON.stringify(details) : ''));
    console.error('FAIL ' + name + (details ? ' ' + JSON.stringify(details) : ''));
  } else console.log('ok   ' + name);
}

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

async function typeNineNotes(page) {
  await page.$eval('.tab-at-host', (el) => el.focus());
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press('Digit' + ((i % 9) + 1));
    await wait(90);
    if (i < 8) {
      await page.keyboard.press('ArrowRight');
      await wait(70);
    }
  }
  await wait(500);
}

function measure(page) {
  return page.evaluate(() => {
    const r = (el) => (el ? el.getBoundingClientRect() : null);
    const modal = document.querySelector('.tab-insert-editor .strum-modal-content');
    const body = document.querySelector('.tab-insert-editor .tab-editor-body');
    const host = document.querySelector('.tab-at-host');
    const dot = host && host.querySelector('.tab-at-cursor-dot');
    const e = typeof tabInsertEditorState === 'object' ? tabInsertEditorState : null;
    const notes = e && e.gpBars ? e.gpBars.flat().flatMap((g) => g.notes) : [];
    const hostRect = host ? host.getBoundingClientRect() : null;
    const dotRect = dot && !dot.hidden ? dot.getBoundingClientRect() : null;
    const inHost = (rect) =>
      !!rect && !!hostRect &&
      rect.top >= hostRect.top - 1 && rect.bottom <= hostRect.bottom + 1;
    const palette = document.querySelector('.tab-palette');
    const groups = [...document.querySelectorAll('[data-tab-group]')].map((g) => ({
      key: g.getAttribute('data-tab-group'),
      open: g.getAttribute('data-open'),
      toggleVisible: (() => {
        const b = g.querySelector('[data-tab-group-toggle]');
        return !!b && getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().height > 0;
      })(),
    }));
    // «Прыжок»: полоса статуса до и после появления строки.
    const slot = document.querySelector('.tab-status-slot');
    const status = document.querySelector('[data-tab-gp-error]');
    const slotH = slot ? slot.getBoundingClientRect().height : 0;
    const modalH = modal.getBoundingClientRect().height;
    const bodyScrollBefore = body ? body.scrollTop : 0;
    const wasHidden = status ? status.hidden : true;
    if (status) {
      status.hidden = false;
      status.textContent = 'Такт 2: 1 из 4 — не заполнен';
    }
    const slotH2 = slot ? slot.getBoundingClientRect().height : 0;
    const modalH2 = modal.getBoundingClientRect().height;
    const bodyScrollAfter = body ? body.scrollTop : 0;
    if (status) { status.hidden = wasHidden; }
    if (body) body.scrollTop = bodyScrollBefore;
    void bodyScrollAfter;
    return {
      viewport: { w: innerWidth, h: innerHeight },
      modal: { top: r(modal).top, bottom: r(modal).bottom, height: modalH, scrollHeight: modal.scrollHeight, clientHeight: modal.clientHeight },
      body: { scrollHeight: body.scrollHeight, clientHeight: body.clientHeight },
      staff: {
        height: host.getBoundingClientRect().height,
        clientHeight: host.clientHeight,
        scrollHeight: host.scrollHeight,
        scrollTop: host.scrollTop,
        minHeight: getComputedStyle(host).minHeight,
      },
      cursor: { present: !!dotRect, inView: inHost(dotRect), rect: dotRect && { top: dotRect.top, bottom: dotRect.bottom } },
      lastNote: notes.length ? { index: notes.length - 1, fret: notes[notes.length - 1].fret } : null,
      notesCount: notes.length,
      palette: { top: r(palette).top, bottom: r(palette).bottom, visible: !!palette && getComputedStyle(palette).display !== 'none' },
      groups,
      frets: (() => {
        const row = document.querySelector('.tab-tools-row--frets');
        return row ? { height: row.getBoundingClientRect().height, keys: row.querySelectorAll('[data-tab-digit]').length } : null;
      })(),
      status: { slotHeight: slotH, slotHeightWithMessage: slotH2, modalHeightWithMessage: modalH2 },
      theme: document.documentElement.dataset.theme || '',
    };
  });
}

(async () => {
  const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || (fs.existsSync('/tmp/chromium') ? '/tmp/chromium' : undefined);
  const browser = await puppeteer.launch({
    executablePath: execPath, headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });
  try {
    for (const vp of VIEWPORTS) {
      for (const theme of THEMES) {
        const id = `${vp.name}-${theme}`;
        const page = await browser.newPage();
        await page.setViewport({
          width: vp.width, height: vp.height,
          deviceScaleFactor: vp.width < 500 ? 2 : 1, hasTouch: vp.touch, isMobile: vp.width < 500,
        });
        await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
        await wait(400);
        await openTwoBarInsert(page);
        await page.screenshot({ path: path.join(OUT, `${id}-00-before-typing.png`) });
        await typeNineNotes(page);
        const m = await measure(page);
        rows.push({ id, ...m });

        check(`[${id}] стан не ниже ${vp.minStaff} px`, m.staff.clientHeight >= vp.minStaff,
          { staff: m.staff.clientHeight, min: m.staff.minHeight });
        check(`[${id}] девять нот введены`, m.notesCount >= 9, { notes: m.notesCount });
        check(`[${id}] курсор виден на стане`, m.cursor.present && m.cursor.inView, m.cursor);
        check(`[${id}] стан прокручен к курсору`, m.staff.scrollTop > 0 || m.staff.scrollHeight <= m.staff.clientHeight + 1,
          { scrollTop: m.staff.scrollTop, scrollHeight: m.staff.scrollHeight, clientHeight: m.staff.clientHeight });
        check(`[${id}] окно целиком на экране`, m.modal.top >= -1 && m.modal.bottom <= m.viewport.h + 1,
          { top: m.modal.top, bottom: m.modal.bottom, vh: m.viewport.h });
        check(`[${id}] тело окна не прокручивается само`, m.body.scrollHeight <= m.body.clientHeight + 2,
          { scrollHeight: m.body.scrollHeight, clientHeight: m.body.clientHeight });
        check(`[${id}] палитра доступна`, m.palette.visible && m.palette.bottom <= m.modal.bottom + 1,
          { paletteBottom: m.palette.bottom, modalBottom: m.modal.bottom });
        check(`[${id}] полоса статуса не двигает окно`,
          Math.abs(m.status.slotHeightWithMessage - m.status.slotHeight) < 1 &&
          Math.abs(m.status.modalHeightWithMessage - m.modal.height) < 1, m.status);
        if (vp.width >= 1025 && !vp.touch) {
          check(`[${id}] секции-переключатели на месте`, m.groups.length === 4 && m.groups.every((g) => g.toggleVisible),
            m.groups);
          check(`[${id}] вторичные секции свёрнуты`, m.groups.filter((g) => g.open === 'false').length === 3, m.groups);
          check(`[${id}] панель ладов в одну строку`, !!m.frets && m.frets.keys === 10 && m.frets.height < 60, m.frets);
        }

        await page.screenshot({ path: path.join(OUT, `${id}-01-nine-notes.png`) });
        const modalEl = await page.$('.tab-insert-editor .strum-modal-content');
        if (modalEl) await modalEl.screenshot({ path: path.join(OUT, `${id}-02-modal.png`) });
        console.log('     кадры: ' + id);
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(OUT, 'audit.json'), JSON.stringify(rows, null, 2));
  const lines = rows.filter((r) => r.name).map((r) => (r.ok ? 'ok   ' : 'FAIL ') + r.name);
  lines.push('', failures.length ? `${failures.length} failed` : 'all checks passed');
  fs.writeFileSync(path.join(OUT, 'summary.txt'), lines.join('\n') + '\n');
  console.log('\n' + lines.join('\n'));
  process.exit(failures.length ? 1 : 0);
})().catch((err) => {
  console.error('FAILED: ' + (err && err.stack ? err.stack : err));
  process.exit(2);
});

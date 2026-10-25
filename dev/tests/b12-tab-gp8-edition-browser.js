#!/usr/bin/env node
// ver 0.681 — комплексная браузерная проверка палитры Guitar Pro 8,
// встроенных мини-табов внутри квадрата («Going to the Run»),
// полнотабовых секций, кастомных списков, зума стана и мобильной шапки/плеера.

const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const puppeteer = require('puppeteer-core');
const { readScore } = require('./helpers/export-oracle');
const { parseMidi } = require('midi-file');

const BASE_URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000';
const CHROMIUM = process.env.PUPPETEER_EXECUTABLE_PATH || '/tmp/chromium';
const OUT_DIR = path.resolve(__dirname, '../bench/results/tab-gp8-0.681');

let passed = 0;
let failed = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function check(name, actual, expected) {
  try {
    if (arguments.length >= 3) assert.deepEqual(actual, expected, name);
    else assert.ok(actual, name);
    passed++;
    console.log(`ok   ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL ${name}:`, err.message);
  }
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // ==================== 1. НАСТОЛЬНЫЙ РЕЖИМ 1440×900 (LIGHT & DARK) ====================
  const desktopBrowser = await puppeteer.launch({
    executablePath: CHROMIUM,
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib' },
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
      '--blink-settings=primaryPointerType=4,primaryHoverType=2',
    ],
  });

  try {
    const page = await desktopBrowser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    await page.goto(`${BASE_URL}/STRUCHORD.html`, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);

    // Сборка песни «Going to the Run»: секция «Вступление» с 4-тактовым квадратом Em | G | D | A
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.removeItem('struchord-tab-placement-v1');
      startNewSongFromHome();
      if (!sections.length) addSection('Intro');
      const sec = sections[0];
      sec.type = 'Intro';
      const sq = sec.squares[0];
      sq.customBeats = 16;
      sq.events = [
        { chord: 'Em', span: 4, timeSig: null, strumPattern: null, fingering: null },
        { chord: 'G', span: 4, timeSig: null, strumPattern: null, fingering: null },
        { chord: 'D', span: 4, timeSig: null, strumPattern: null, fingering: null },
        { chord: 'A', span: 4, timeSig: null, strumPattern: null, fingering: null },
      ];
      requestRender();
    });
    await wait(250);

    // Открываем «+ Таб» одной кнопкой секции — по умолчанию позиция «0» (в начале секции)
    await page.hover('.section-card');
    await wait(120);
    await page.click('.add-tab-btn');
    await page.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 30000 });
    await wait(450);

    // Проверка палитры GP8, иконок, тултипов Mac/Win, отсутствия старой простыни подсказок и значка «f»
    const gp8Audit = await page.evaluate(() => {
      const groups = [...document.querySelectorAll('.tab-group-title')].map((el) => el.textContent.trim());
      const toolBtns = [...document.querySelectorAll('.tab-palette .tab-tool')];
      const iconBtns = toolBtns.filter((b) => !b.hasAttribute('data-tab-bend') && b.querySelector('svg'));
      const hasOldHint = !!document.querySelector('.tab-editor-hint');
      const hasDynamicsGlyph = [...document.querySelectorAll('.tab-at-host svg text')].some((t) =>
        ['f', 'p', 'mf', 'mp'].includes(t.textContent.trim()),
      );
      const readout = document.querySelector('[data-tab-surface-readout]')?.textContent?.trim() || '';
      const scale = tabAtApi?.settings?.display?.scale;
      const defaultPos = document.querySelector('[data-tab-position]')?.value;

      tabShortcutsOsOverride = 'mac';
      const macSample = tabGpTipAttr('Следующий такт', '⌘→', 'Ctrl+→');
      tabShortcutsOsOverride = 'win';
      const winSample = tabGpTipAttr('Следующий такт', '⌘→', 'Ctrl+→');
      tabShortcutsOsOverride = null;

      return {
        groups,
        totalTools: toolBtns.length,
        iconBtnsCount: iconBtns.length,
        allHaveTip: toolBtns.every((b) => (b.getAttribute('data-gp-tip') || '').length > 2),
        hasOldHint,
        hasDynamicsGlyph,
        readout,
        scale,
        defaultPos,
        macHasCmd: macSample.includes('⌘→'),
        winHasCtrl: winSample.includes('Ctrl+→'),
      };
    });

    check('GP8 палитра: 4 логические группы с заголовками', gp8Audit.groups, [
      'Длительности',
      'Правка',
      'Навигация',
      'Приёмы',
    ]);
    check('GP8 палитра: все кнопки несут SVG-иконки и GP-тултипы', gp8Audit.iconBtnsCount === gp8Audit.totalTools && gp8Audit.allHaveTip, true);
    check('GP8 палитра: текстовая простыня убрана, лишний значок динамики «f» скрыт', [gp8Audit.hasOldHint, gp8Audit.hasDynamicsGlyph], [false, false]);
    check('Стан: крупный базовый масштаб 1.7 и спокойная шапка стана', [gp8Audit.scale, gp8Audit.readout.startsWith('Такт 1 · Доля 1 · 6-я струна')], [1.7, true]);
    check('Умная позиция по умолчанию: «0» (в начале секции)', gp8Audit.defaultPos, '0');
    check('OS-зависимые тултипы: ⌘ на macOS и Ctrl на Windows', [gp8Audit.macHasCmd, gp8Audit.winHasCtrl], [true, true]);

    // Проверка зума стана − / Авто / +
    await page.click('[data-tab-zoom="1"]');
    await wait(250);
    check('Зум «+» увеличивает масштаб стана выше 1.7', await page.evaluate(() => tabAtApi.settings.display.scale > 1.7), true);
    await page.click('[data-tab-zoom="-1"]');
    await page.click('[data-tab-zoom="-1"]');
    await wait(250);
    check('Зум «−» уменьшает масштаб стана ниже 1.7', await page.evaluate(() => tabAtApi.settings.display.scale < 1.7), true);
    await page.click('[data-tab-zoom="auto"]');
    await wait(250);
    check('Кнопка «Авто» возвращает базовый масштаб 1.7', await page.evaluate(() => tabAtApi.settings.display.scale), 1.7);

    // Проверка шпаргалки горячих клавиш «?»
    await page.click('[data-tab-help]');
    await wait(120);
    const helpVisible = await page.$eval('[data-tab-shortcuts-popover]', (el) => !el.hidden && el.querySelectorAll('.tab-shortcuts-section').length === 4);
    check('Кнопка «?» открывает двухколоночную шпаргалку по 4 разделам', helpVisible, true);
    await page.keyboard.press('Escape');
    await wait(80);
    check('Escape закрывает шпаргалку, не закрывая само окно таба', await page.$eval('[data-tab-shortcuts-popover]', (el) => el.hidden), true);

    // Выбор «2 доли» и «Внутри квадрата #1: перед ячейкой 1 (Em)» через кастомные выпадающие списки STRUCHORD
    const cellOptVal = await page.$eval('[data-tab-position]', (sel) => {
      const opt = [...sel.options].find((o) => o.value.includes(':before:0'));
      return opt ? opt.value : null;
    });
    check('В списке «Позиция» доступны ячейки внутри существующего квадрата', !!cellOptVal, true);

    await page.click('.tab-editor-length:nth-child(2) [data-tab-select-trigger]');
    await wait(80);
    await page.click(`.tab-editor-length:nth-child(2) .tab-select-option[data-select-val="${cellOptVal}"]`);
    await wait(150);

    await page.click('.tab-editor-length:nth-child(1) [data-tab-select-trigger]');
    await wait(80);
    await page.click('.tab-editor-length:nth-child(1) .tab-select-option[data-select-val="2"]');
    await wait(300);

    // Вводим вступительную мелодию из 4 восьмых (2 доли): 0 - 2 - 3 на 6-й и 0 на 5-й с легато и вибрато
    await page.click('[data-tab-dur="8"]');
    await page.$eval('.tab-at-host', (e) => e.focus());
    await page.keyboard.press('Digit0');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Digit2');
    await page.keyboard.press('KeyH');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Digit3');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Digit2');
    await page.keyboard.press('KeyV');
    await wait(300);

    // Скриншоты окна редактора GP8 Edition на 1440×900 (светлая и тёмная темы)
    await page.screenshot({ path: path.join(OUT_DIR, 'editor-1440-light.png') });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await wait(300);
    await page.screenshot({ path: path.join(OUT_DIR, 'editor-1440-dark.png') });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await wait(250);

    // Применяем: квадрат остаётся 4-тактовым (16 долей), первая ячейка разбита на [TAB(2) | Em(2) | G(4) | D(4) | A(4)]
    await page.click('[data-tab-apply]');
    await page.waitForSelector('.tab-insert-editor', { hidden: true });
    await wait(250);

    const inlineState = await page.evaluate(() => {
      const sec = sections[0];
      const sq = sec.squares[0];
      const wrappers = [...document.querySelectorAll('.section-card .square .chord-wrapper')];
      const tabWrap = wrappers[0];
      const emWrap = wrappers[1];
      const tr = tabWrap.getBoundingClientRect();
      const er = emWrap.getBoundingClientRect();
      return {
        squaresCount: sec.squares.length,
        totalBeats: getSquareBeats(sq, sec.timeSig || globalTimeSig),
        events: sq.events.map((e) => ({ chord: e.chord, span: e.span, isTab: !!e.isTab, notes: e.tabNotes?.length || 0 })),
        sameHorizontalRow: Math.abs(tr.top - er.top) < 2 && Math.abs(tr.bottom - er.bottom) < 2 && tr.right <= er.left + 2,
        hasSharedCounts: !!tabWrap.querySelector('.chord-counts') && tabWrap.querySelector('.chord-counts').textContent.includes('1'),
        hasResizeHandle: !!tabWrap.querySelector('.resize-handle'),
      };
    });

    check('Going to the Run: в секции остался 1 общий квадрат на 16 долей', [inlineState.squaresCount, inlineState.totalBeats], [1, 16]);
    check('Going to the Run: мини-таб встал первой ячейкой перед Em (2 + 2 + 4 + 4 + 4)', inlineState.events, [
      { chord: '', span: 2, isTab: true, notes: 4 },
      { chord: 'Em', span: 2, isTab: false, notes: 0 },
      { chord: 'G', span: 4, isTab: false, notes: 0 },
      { chord: 'D', span: 4, isTab: false, notes: 0 },
      { chord: 'A', span: 4, isTab: false, notes: 0 },
    ]);
    check('Мини-таб стоит в одном горизонтальном ряду с аккордами, имеет общий счёт «1 та и та» и ручку границы', [
      inlineState.sameHorizontalRow,
      inlineState.hasSharedCounts,
      inlineState.hasResizeHandle,
    ], [true, true, true]);

    // Проверка перетаскивания .resize-handle: вправо (2 -> 3 доли) пустое место добавляется, влево (< 2 долей) упирается в последнюю ноту!
    const handleBox = await page.$eval('.chord-wrapper--tab .resize-handle', (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    const cellWidthPerBeat = await page.$eval('.chord-wrapper--tab', (el) => el.getBoundingClientRect().width / 2);

    // Тянем вправо на +1 долю -> [TAB(3) | Em(1)]
    await page.mouse.move(handleBox.x, handleBox.y);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + cellWidthPerBeat * 1.18, handleBox.y, { steps: 6 });
    await page.mouse.up();
    await wait(150);
    check(
      'Растягивание мини-таба вправо добавляет пустую долю (3 + 1)',
      await page.evaluate(() => sections[0].squares[0].events.slice(0, 2).map((e) => e.span)),
      [3, 1],
    );

    // Тянем сильно влево (попытка сжать до 1 доли при нотах на 2 долях) -> остановка ровно на 2 долях с подсказкой!
    const handleBox2 = await page.$eval('.chord-wrapper--tab .resize-handle', (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.move(handleBox2.x, handleBox2.y);
    await page.mouse.down();
    await page.mouse.move(handleBox2.x - cellWidthPerBeat * 2.2, handleBox2.y, { steps: 8 });
    await page.mouse.up();
    await wait(120);
    const clampCheck = await page.evaluate(() => ({
      spans: sections[0].squares[0].events.slice(0, 2).map((e) => e.span),
      notesCount: sections[0].squares[0].events[0].tabNotes.length,
      toast: document.getElementById('toast')?.textContent || '',
    }));
    check('Сужение мини-таба влево останавливается у последней ноты (2 доли) без потери нот', [clampCheck.spans, clampCheck.notesCount, clampCheck.toast.includes('последней записанной ноты')], [[2, 2], 4, true]);

    // Добавляем вторую секцию целиком из табов (по 4 такта в ряд, вертикально как в Guitar Pro)
    await page.evaluate(() => {
      addSection('Solo');
      const solo = sections[1];
      solo.squares = [
        {
          id: nextId++,
          type: 'tab',
          beats: 16,
          customBeats: null,
          events: [],
          notes: [
            { start: 0, dur: 1, string: 3, fret: 9, vibrato: 'slight' },
            { start: 1, dur: 1, string: 4, fret: 8 },
            { start: 2, dur: 2, string: 4, fret: 10 },
            { start: 4, dur: 2, string: 3, fret: 9 },
            { start: 8, dur: 4, string: 2, fret: 7 },
            { start: 12, dur: 4, string: 1, fret: 7 },
          ],
        },
        {
          id: nextId++,
          type: 'tab',
          beats: 8,
          customBeats: null,
          events: [],
          notes: [
            { start: 0, dur: 2, string: 0, fret: 0 },
            { start: 2, dur: 2, string: 0, fret: 3 },
            { start: 4, dur: 4, string: 1, fret: 2 },
          ],
        },
      ];
      requestRender();
    });
    await wait(300);

    // Скриншоты песни с мини-табом в ряду аккордов + полнотабовой секцией на 1440×900 (light & dark)
    await page.screenshot({ path: path.join(OUT_DIR, 'song-1440-light.png') });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await wait(250);
    await page.screenshot({ path: path.join(OUT_DIR, 'song-1440-dark.png') });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await wait(200);

    // Проверка Ленты, сохранения/загрузки .struchord, экспорта .gp5 и MIDI с inline-табом + полнотабовой секцией
    await page.evaluate(() => toggleTimelineMode(true));
    await wait(200);
    const tlCount = await page.$$eval('#timelineTrack .tl-cell--tab', (els) => els.length);
    check('Режим Ленты отрисовывает и встроенную таб-ячейку, и полнотабовые строки', tlCount, 3);
    await page.evaluate(() => toggleTimelineMode(false));
    await wait(150);

    const exportRoundtrip = await page.evaluate(async () => {
      let capturedBlob = null;
      const origCreate = URL.createObjectURL;
      URL.createObjectURL = function (blob) { capturedBlob = blob; return origCreate.call(this, blob); };
      try { await window.exportStruchordFile(); } finally { URL.createObjectURL = origCreate; }
      const savedText = await capturedBlob.text();
      startNewSongFromHome();
      const file = new File([savedText], 'going-to-the-run.struchord', { type: 'application/json' });
      window.importSong(file);
      for (let i = 0; i < 40 && sections.length < 2; i++) await new Promise((r) => setTimeout(r, 25));
      const inlineNotes = sections[0].squares[0].events[0].tabNotes.length;
      const gp5 = Array.from(window.gpExportBytesGP5().bytes);
      const mid = Array.from(window.midiExportBytes().bytes);
      return { inlineNotes, isTab: !!sections[0].squares[0].events[0].isTab, gp5, mid };
    });
    check('Сохранение и повторная загрузка песни сохраняют встроенный мини-таб и все его ноты', [exportRoundtrip.isTab, exportRoundtrip.inlineNotes], [true, 4]);
    const gp5Score = readScore(exportRoundtrip.gp5);
    const gp5TabTrack = gp5Score.tracks.find((t) => t.name === 'Табы');
    check('Экспорт .gp5 включает ноты встроенного мини-таба и полнотабовой секции в дорожку «Табы»', !!gp5TabTrack && gp5Score.masterBars.length === 10, true);
    const parsedMidi = parseMidi(Buffer.from(exportRoundtrip.mid));
    check('Экспорт MIDI формирует валидный многодорожечный файл с нотами табулатуры', parsedMidi.tracks.length >= 2, true);

    check('Настольный прогон 1440px без ошибок страницы', errors, []);
    await page.close();
  } finally {
    await desktopBrowser.close();
  }

  // ==================== 2. ПЛАНШЕТ 1024×768 И ТЕЛЕФОН 390×844 ====================
  const touchBrowser = await puppeteer.launch({
    executablePath: CHROMIUM,
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib' },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });

  try {
    // --- Планшет 1024×768 ---
    const tabPage = await touchBrowser.newPage();
    const tabErrors = [];
    tabPage.on('pageerror', (e) => tabErrors.push(e.message));
    await tabPage.setViewport({ width: 1024, height: 768, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await tabPage.goto(`${BASE_URL}/STRUCHORD.html`, { waitUntil: 'load', timeout: 60000 });
    await tabPage.evaluate(() => document.fonts.ready);
    await tabPage.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      startNewSongFromHome();
      if (!sections.length) addSection('Intro');
      addTabInsert(sections[0].id);
    });
    await tabPage.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 30000 });
    await wait(450);
    await tabPage.tap('[data-tab-digit="5"]');
    await tabPage.tap('[data-tab-time-step="1"]');
    await tabPage.tap('[data-tab-digit="7"]');
    await wait(250);

    const tabletLayout = await tabPage.evaluate(() => {
      const metaVisible = getComputedStyle(document.querySelector('.tab-editor-meta')).display !== 'none';
      const tabsVisible = getComputedStyle(document.querySelector('.tab-mobile-tabs')).display !== 'none';
      const digits = [...document.querySelectorAll('[data-tab-digit]')].map((d) => d.getBoundingClientRect());
      const body = document.querySelector('.tab-editor-body');
      return {
        metaVisible,
        tabsVisible,
        allDigits44: digits.length === 10 && digits.every((r) => r.width >= 44 && r.height >= 44 && r.bottom <= window.innerHeight + 1),
        zeroScroll: body.scrollHeight <= body.clientHeight + 2,
      };
    });
    check('Планшет 1024×768: Длина/Позиция над станом, вкладки и 0–9 снизу (≥44px) без прокрутки', tabletLayout, {
      metaVisible: true,
      tabsVisible: true,
      allDigits44: true,
      zeroScroll: true,
    });
    await tabPage.screenshot({ path: path.join(OUT_DIR, 'editor-1024-dark.png') });
    check('Планшет 1024px без ошибок страницы', tabErrors, []);
    await tabPage.close();

    // --- Телефон 390×844 ---
    const phonePage = await touchBrowser.newPage();
    const phoneErrors = [];
    phonePage.on('pageerror', (e) => phoneErrors.push(e.message));
    await phonePage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await phonePage.goto(`${BASE_URL}/STRUCHORD.html`, { waitUntil: 'load', timeout: 60000 });
    await phonePage.evaluate(() => document.fonts.ready);

    // Сборка песни с мини-табом внутри первого квадрата + широким 4-тактовым табом для проверки свайпа
    await phonePage.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
      startNewSongFromHome();
      if (!sections.length) addSection('Intro');
      const sec = sections[0];
      sec.squares = [
        {
          id: nextId++,
          customBeats: 8,
          events: [
            {
              chord: '',
              span: 2,
              timeSig: null,
              isTab: true,
              tabNotes: [
                { start: 0, dur: 0.5, string: 0, fret: 0 },
                { start: 0.5, dur: 0.5, string: 0, fret: 2 },
                { start: 1, dur: 0.5, string: 0, fret: 3 },
                { start: 1.5, dur: 0.5, string: 1, fret: 2 },
              ],
            },
            { chord: 'Em', span: 2, timeSig: null, strumPattern: null, fingering: null },
            { chord: 'G', span: 4, timeSig: null, strumPattern: null, fingering: null },
          ],
        },
        {
          id: nextId++,
          type: 'tab',
          beats: 16,
          customBeats: null,
          events: [],
          notes: [
            { start: 0, dur: 2, string: 3, fret: 9 },
            { start: 2, dur: 2, string: 4, fret: 8 },
            { start: 4, dur: 4, string: 4, fret: 10 },
            { start: 8, dur: 4, string: 2, fret: 7 },
            { start: 12, dur: 4, string: 1, fret: 7 },
          ],
        },
      ];
      requestRender();
    });
    await wait(350);

    const phoneSongCheck = await phonePage.evaluate(() => {
      const settingsBtn = document.querySelector('.tools-toggle-inline');
      const sr = settingsBtn.getBoundingClientRect();
      const tbEl = document.querySelector('.transport-bar');
      const tb = tbEl.getBoundingClientRect();
      const visKids = [...tbEl.children].filter((el) => getComputedStyle(el).display !== 'none').map((el) => el.getBoundingClientRect());
      const centerYs = visKids.map((r) => r.top + r.height / 2);
      const singleRow = centerYs.length > 0 && Math.max(...centerYs) - Math.min(...centerYs) < 10;
      const moreBtn = document.getElementById('btnTransportMore');
      const mr = moreBtn.getBoundingClientRect();
      const hint = document.querySelector('.squares-scroll-hint');
      return {
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        settingsFitsRight: sr.left >= 0 && sr.right <= 390.5 && sr.width > 40,
        slimTransportHeight: Math.round(tb.height),
        singleRow,
        moreBtnVisible: getComputedStyle(moreBtn).display !== 'none' && mr.right <= 390.5,
        hasSwipeHint: !!hint && hint.textContent.includes('листайте'),
      };
    });
    check('Телефон 390px: кнопка «Настройки» в шапке не обрезана справа и нет переполнения экрана', [
      phoneSongCheck.docOverflow <= 0,
      phoneSongCheck.settingsFitsRight,
    ], [true, true]);
    check('Телефон 390px: нижняя плашка плеера компактна в 1 ряд (≤ 74px) с кнопкой «Ещё» и подсказкой «↔ листайте»', [
      phoneSongCheck.singleRow && phoneSongCheck.slimTransportHeight <= 74,
      phoneSongCheck.moreBtnVisible,
      phoneSongCheck.hasSwipeHint,
    ], [true, true, true]);

    await phonePage.screenshot({ path: path.join(OUT_DIR, 'song-390-dark.png') });
    await phonePage.evaluate(() => {
      document.querySelector('.section-card')?.scrollIntoView({ block: 'start' });
      window.scrollBy(0, -80);
    });
    await wait(120);
    await phonePage.screenshot({ path: path.join(OUT_DIR, 'song-390-grid-dark.png') });
    await phonePage.evaluate(() => window.scrollTo(0, 0));
    await wait(80);

    // Проверка раскрытия «Ещё» на плеере телефона
    await phonePage.tap('#btnTransportMore');
    await wait(120);
    check('Телефон 390px: кнопка «Ещё» раскрывает дополнительные кнопки плеера', await phonePage.$eval('.transport-bar', (el) => el.classList.contains('is-mobile-more-open')), true);
    await phonePage.tap('#btnTransportMore');
    await wait(100);

    // Открываем встроенный мини-таб касанием на телефоне 390×844
    await phonePage.tap('.chord-wrapper--tab');
    await phonePage.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 30000 });
    await wait(450);

    const phoneModalCheck = await phonePage.evaluate(() => {
      const chip = document.querySelector('[data-tab-mobile-chip]');
      const metaHiddenOnNotes = getComputedStyle(document.querySelector('.tab-editor-meta')).display === 'none';
      const digits = [...document.querySelectorAll('[data-tab-digit]')].map((d) => d.getBoundingClientRect());
      const body = document.querySelector('.tab-editor-body');
      return {
        chipVisible: getComputedStyle(chip).display !== 'none' && chip.textContent.includes('2 доли'),
        metaHiddenOnNotes,
        allDigits44: digits.length === 10 && digits.every((r) => r.width >= 44 && r.height >= 44 && r.bottom <= 844.5),
        zeroScroll: body.scrollHeight <= body.clientHeight + 2,
      };
    });
    check('Телефон 390px редактор: чип «2 доли» сверху, Длина/Позиция убраны во вкладку «Правка», 0–9 ≥44px без скролла', phoneModalCheck, {
      chipVisible: true,
      metaHiddenOnNotes: true,
      allDigits44: true,
      zeroScroll: true,
    });

    await phonePage.screenshot({ path: path.join(OUT_DIR, 'editor-390-dark.png') });
    await phonePage.tap('[data-tab-mobile-tab="tech"]');
    await wait(150);
    await phonePage.screenshot({ path: path.join(OUT_DIR, 'editor-390-tech-dark.png') });

    check('Телефон 390px без ошибок страницы', phoneErrors, []);
    await phonePage.close();
  } finally {
    await touchBrowser.close();
  }

  console.log(`\nИТОГ 0.681 GP8 Edition: ${passed} PASS / ${failed} FAIL`);
  if (failed > 0) process.exit(1);
})();

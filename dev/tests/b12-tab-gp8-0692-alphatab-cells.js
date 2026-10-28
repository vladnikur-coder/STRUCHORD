#!/usr/bin/env node
/**
 * 0.692 Acceptance & Screenshot Test — B-12.12, «таб в клетках рисует alphaTab»:
 * 1) клетка таба и мини-таб внутри аккордовой клетки получают картинку от alphaTab
 *    (настоящий стан, ритм, цифры ладов), а не самодельные линии и подписи;
 * 2) старых самодельных элементов (номера струн, цифры ладов, подписи «1/4»)
 *    в клетке больше нет;
 * 3) картинка вписывается в клетку и перерисовывается при смене темы;
 * 4) пока alphaTab рисует, в клетке спокойная подпись «TAB · N нот», без «прыжков»;
 * 5) клетка открывает редактор таб-вставки по нажатию, как раньше;
 * 6) свободный хвост такта в клетке не дорисовывается паузой (как в редакторе 0.688).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const OUT_DIR = path.join(__dirname, '..', 'bench', 'results', 'tab-gp8-0.692');
fs.mkdirSync(OUT_DIR, { recursive: true });

const results = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  const ok = a === b;
  results.push({ name, ok, actual, expected });
  if (!ok) console.error(`FAIL: ${name}\n  expected: ${b}\n  actual:   ${a}`);
  else console.log(`PASS: ${name}`);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const execPath =
    process.env.PUPPETEER_EXECUTABLE_PATH || (fs.existsSync('/tmp/chromium') ? '/tmp/chromium' : undefined);
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: execPath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 2 });
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#devPanelTrigger', { timeout: 30000 });

    const ver = await page.$eval('#devPanelTrigger', (el) => el.textContent.trim());
    check('Версия в шапке не ниже 0.692',
      (() => { const mm = String(ver).match(/ver\s+0\.(\d+)/); return !!mm && Number(mm[1]) >= 692; })(),
      true);

    // Песня: аккордовая клетка с мини-табом + отдельная клетка таба
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
      startNewSongFromHome();
      addSection('Verse');
      const sec = sections[0];
      sec.squares = [];
      addSquare(sec.id);
      sec.squares[0].events[0].chord = 'Em';
      sec.squares[0].events[0].isTab = true;
      sec.squares[0].events[0].tabNotes = [
        { start: 0, dur: 1, string: 1, fret: 0 },
        { start: 1, dur: 1, string: 3, fret: 3 },
      ];
      sec.squares.unshift({
        id: nextId++,
        type: 'tab',
        repeat: 1,
        beats: 4,
        notes: [
          { start: 0, dur: 1, string: 0, fret: 3 },
          { start: 1, dur: 1, string: 2, fret: 5 },
          { start: 2, dur: 0.5, string: 4, fret: 7 },
          { start: 2.5, dur: 0.5, string: 4, fret: 9 },
        ],
        events: [],
        customBeats: null,
      });
      renderSectionsGrid();
    });
    await wait(2600);

    const state = await page.evaluate(() => {
      const bodies = [...document.querySelectorAll('.tab-insert-body')];
      const read = (body) => {
        const svg = body.querySelector('.tab-thumb svg');
        const br = body.getBoundingClientRect();
        const sr = svg ? svg.getBoundingClientRect() : null;
        return {
          hasJob: !!body.dataset.tabThumb,
          done: body.dataset.thumbDone || '',
          hasSvg: !!svg,
          viewBox: svg ? svg.getAttribute('viewBox') : null,
          digits: svg
            ? [...svg.querySelectorAll('text')]
                .map((t) => (t.textContent || '').trim())
                .filter((t) => /^\d+$/.test(t))
            : [],
          fits:
            !!(sr && sr.left >= br.left - 1 && sr.right <= br.right + 1 && sr.top >= br.top - 1 && sr.bottom <= br.bottom + 1),
        };
      };
      return {
        bodies: bodies.map(read),
        legacy: document.querySelectorAll(
          '.tab-insert .tab-fret-number, .tab-insert .tab-note-position, .tab-insert .tab-string-number, .tab-insert-body > svg',
        ).length,
        cells: document.querySelectorAll('.tab-insert').length,
      };
    });

    check('В клетках есть задание для alphaTab и картинка готова', [state.cells, state.bodies.length, state.bodies.every((b) => b.hasJob && b.done === '1' && b.hasSvg)], [2, 2, true]);
    check('Картинка — настоящий рисунок alphaTab (есть область просмотра и цифры ладов)', [state.bodies.every((b) => !!b.viewBox && b.digits.length > 0), state.bodies[0].digits], [true, ['3', '5', '7', '9']]);
    check('Картинка вписывается в клетку целиком', state.bodies.map((b) => b.fits), [true, true]);
    check('Самодельных линий, цифр и подписей «1/4» в клетках больше нет', state.legacy, 0);

    await page.screenshot({ path: path.join(OUT_DIR, '01-grid-light.png') });
    await page.evaluate(() => document.querySelector('.section-card').scrollIntoView({ block: 'center' }));
    await wait(300);
    await page.screenshot({ path: path.join(OUT_DIR, '02-section-light.png') });

    // Смена темы — картинка перерисовывается в цветах тёмной темы
    const lightFill = await page.evaluate(() => {
      const t = document.querySelector('.tab-thumb svg text');
      return t ? getComputedStyle(t).fill : '';
    });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    await wait(2600);
    const dark = await page.evaluate(() => {
      const bodies = [...document.querySelectorAll('.tab-insert-body')];
      const t = document.querySelector('.tab-thumb svg text');
      return {
        done: bodies.map((b) => b.dataset.thumbDone || ''),
        svgs: document.querySelectorAll('.tab-thumb svg').length,
        fill: t ? getComputedStyle(t).fill : '',
        bg: getComputedStyle(document.body).backgroundColor,
      };
    });
    check('Тёмная тема: все клетки перерисованы', [dark.done, dark.svgs], [['1', '1'], 2]);
    check('Тёмная тема: цвет рисунка отличается от светлой', [!!lightFill, dark.fill !== lightFill], [true, true]);
    await page.evaluate(() => document.querySelector('.section-card').scrollIntoView({ block: 'center' }));
    await wait(300);
    await page.screenshot({ path: path.join(OUT_DIR, '03-section-dark.png') });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
    });
    await wait(2000);

    // Пока alphaTab рисует — в клетке спокойная подпись, а не пустое место
    const pending = await page.evaluate(() => {
      const body = document.querySelector('.tab-insert-body');
      const html = renderTabInsertHtml(sections[0], sections[0].squares[0], sections[0].timeSig || globalTimeSig, true);
      const box = document.createElement('div');
      box.innerHTML = html;
      const fresh = box.querySelector('.tab-insert-body');
      return {
        hasJob: !!fresh.dataset.tabThumb,
        waitText: (fresh.querySelector('.tab-thumb-wait')?.textContent || '').trim(),
        liveMarked: body.dataset.thumbDone,
      };
    });
    check('До отрисовки в клетке подпись «TAB · N нот», без пустоты', [pending.hasJob, /TAB · \d+ (нота|ноты|нот)/.test(pending.waitText)], [true, true]);
    check('Уже нарисованная клетка не сбрасывается при новой разметке', pending.liveMarked, '1');

    // Пустой такт: в клетке честно «Нет нот» и никакой картинки
    const empty = await page.evaluate(() => {
      const html = renderTabInsertHtml(
        sections[0],
        { id: -5, type: 'tab', beats: 4, notes: [], events: [], customBeats: null },
        sections[0].timeSig || globalTimeSig,
        true,
      );
      const box = document.createElement('div');
      box.innerHTML = html;
      return {
        job: !!box.querySelector('[data-tab-thumb]'),
        emptyText: (box.querySelector('.tab-insert-empty')?.textContent || '').trim(),
      };
    });
    check('Пустой такт: «Нет нот» и никакой картинки', empty, { job: false, emptyText: 'Нет нот' });

    // Свободный хвост не дорисовывается паузой, но настоящая пауза видна
    const tail = await page.evaluate(async () => {
      const render = async (notes) => {
        const html = await tabThumbRender(
          { n: notes, b: 4, u: notes.reduce((a, n) => Math.max(a, n.start + n.dur), 0), t: '4/4', th: 'light' },
          300,
        );
        const box = document.createElement('div');
        box.innerHTML = html;
        const svg = box.querySelector('svg');
        const music = svg
          ? [...svg.querySelectorAll('text')]
              .map((t) => (t.textContent || '').codePointAt(0) || 0)
              .filter((c) => c >= 0xe000)
          : [];
        return { len: html.length, music };
      };
      // Полный такт из четырёх нот — образец: в нём заведомо нет пауз,
      // только ключ «TAB» и размер. Всё лишнее в других случаях — паузы.
      const full = await render([
        { start: 0, dur: 1, string: 0, fret: 3 },
        { start: 1, dur: 1, string: 1, fret: 3 },
        { start: 2, dur: 1, string: 2, fret: 4 },
        { start: 3, dur: 1, string: 3, fret: 5 },
      ]);
      const oneNote = await render([{ start: 0, dur: 1, string: 0, fret: 3 }]);
      const oneNotePlusRest = await render([
        { start: 0, dur: 1, string: 0, fret: 3 },
        { start: 1, dur: 3, pause: true },
      ]);
      const base = new Set(full.music);
      return {
        oneNote: { len: oneNote.len, rests: oneNote.music.filter((c) => !base.has(c)).length },
        oneNotePlusRest: { rests: oneNotePlusRest.music.filter((c) => !base.has(c)).length },
      };
    });
    check('Одна нота в такте: рисунок есть, паузы в пустом хвосте нет', [tail.oneNote.len > 200, tail.oneNote.rests], [true, 0]);
    check('Настоящая пауза, поставленная человеком, остаётся видимой', tail.oneNotePlusRest.rests > 0, true);

    // Лента: там таб тоже рисует alphaTab
    await page.evaluate(() => {
      try {
        setSongView('timeline');
      } catch (_) {}
    });
    await wait(3200);
    const tl = await page.evaluate(() => {
      const bodies = [...document.querySelectorAll('.tl-cell [data-tab-thumb]')];
      return {
        bodies: bodies.length,
        drawn: bodies.filter((b) => b.dataset.thumbDone === '1' && b.querySelector('.tab-thumb svg')).length,
        legacy: document.querySelectorAll('.tl-cell .tab-fret-number, .tl-cell .tab-note-position, .tl-cell .tab-note-duration').length,
      };
    });
    check('Лента: таб тоже рисует alphaTab', [tl.bodies > 0, tl.drawn === tl.bodies, tl.legacy], [true, true, 0]);
    await page.screenshot({ path: path.join(OUT_DIR, '05-timeline-light.png') });
    await page.evaluate(() => {
      try {
        setSongView('grid');
      } catch (_) {}
    });
    await wait(1200);

    // Телефон: картинка по-прежнему вписывается в клетку
    const phone = await browser.newPage();
    await phone.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await phone.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await phone.waitForSelector('#devPanelTrigger', { timeout: 30000 });
    await phone.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
      startNewSongFromHome();
      addSection('Verse');
      const sec = sections[0];
      sec.squares = [];
      sec.squares.unshift({
        id: nextId++,
        type: 'tab',
        repeat: 1,
        beats: 4,
        notes: [
          { start: 0, dur: 1, string: 0, fret: 3 },
          { start: 1, dur: 1, string: 2, fret: 5 },
          { start: 2, dur: 0.5, string: 4, fret: 7 },
          { start: 2.5, dur: 0.5, string: 4, fret: 9 },
        ],
        events: [],
        customBeats: null,
      });
      renderSectionsGrid();
    });
    await wait(3600);
    const phoneState = await phone.evaluate(() => {
      const body = document.querySelector('[data-tab-thumb]');
      const svg = body && body.querySelector('.tab-thumb svg');
      if (!svg) return { drawn: false };
      const br = body.getBoundingClientRect();
      const sr = svg.getBoundingClientRect();
      return {
        drawn: true,
        cell: [Math.round(br.width), Math.round(br.height)],
        fillsWidth: sr.width >= br.width - 2,
        fits: sr.left >= br.left - 1 && sr.right <= br.right + 1 && sr.top >= br.top - 1 && sr.bottom <= br.bottom + 1,
      };
    });
    check('Телефон 390: рисунок есть, вписан и занимает ширину клетки', [phoneState.drawn, phoneState.fillsWidth, phoneState.fits], [true, true, true]);
    await phone.screenshot({ path: path.join(OUT_DIR, '06-mobile-dark.png') });
    await phone.close();

    // Нажатие по клетке по-прежнему открывает редактор
    await page.evaluate(() => {
      const cell = document.querySelector('.tab-insert:not(.tab-insert--cell)');
      cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await wait(900);
    const opened = await page.evaluate(() => !!document.querySelector('.tab-insert-editor:not([hidden]) .tab-at-host svg'));
    check('Клетка открывает редактор таб-вставки', opened, true);
    await page.screenshot({ path: path.join(OUT_DIR, '04-editor-unchanged.png') });

    check('На странице нет ошибок JavaScript', pageErrors, []);
    fs.writeFileSync(
      path.join(OUT_DIR, 'checks.json'),
      JSON.stringify({ version: '0.692', passed: results.filter((r) => r.ok).length, total: results.length, results }, null, 2) + '\n',
    );
    console.log(`\n${results.filter((r) => r.ok).length}/${results.length} PASS`);
    if (results.some((r) => !r.ok)) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();

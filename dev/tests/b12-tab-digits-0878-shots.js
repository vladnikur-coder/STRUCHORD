#!/usr/bin/env node
/**
 * 0.878 · Приёмка «Только цифры» в реальном браузере (кадры «до» и «после»).
 *
 * Матрица: 390×844, 768×1024, 1280×900, 1920×1080 × светлая и тёмная тема.
 * В песне четыре случая из спеки:
 *   1) Em · таб-вставка на 2 доли (8 шестнадцатых) · C · G — клетка между аккордами;
 *   2) такт из 16 шестнадцатых;
 *   3) такт из 8 восьмых;
 *   4) два такта по 8 четвертей.
 *
 * На каждом размере проверяется (0.878):
 *   • клетка НИКОГДА не занимает строку целиком: grid-column не «1 / -1» и не
 *     равен сумме колонок ряда;
 *   • высота клетки с табом равна высоте соседней аккордовой клетки;
 *   • ряд с вставкой не выше ряда без вставки в той же секции;
 *   • computed font-size цифр ≥ 11 px и ≤ 14 px;
 *   • четыре цифры и номера долей не налезают друг на друга;
 *   • стан заполняет клетку: SVG ровно по её телу, обрезки нет;
 *   • порядок ячеек не изменился (аккорды остались справа от вставки);
 *   • у аккордов рядом остались номера долей «3 4 1 2»;
 *   • в клетке нет заголовка «TAB / …», сведения — в title/aria-label.
 *
 * Запуск (нужен Chromium и локальный сервер):
 *   python3 -m http.server 8000                       # из корня репозитория
 *   SHOTS_TAG=after  node dev/tests/b12-tab-digits-0878-shots.js
 *   # «до»: git show d2b71d8:STRUCHORD.html > before.html   (это 0.877)
 *   SHOTS_TAG=before STRUCHORD_URL=http://127.0.0.1:8000/before.html \
 *     node dev/tests/b12-tab-digits-0878-shots.js
 *
 * Результат: PNG-кадры, audit.json и summary.txt в
 * dev/bench/results/tab-digits-0.878-<TAG>/.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const TAG = process.env.SHOTS_TAG || 'after';
const OUT = path.join(__dirname, '..', 'bench', 'results', 'tab-digits-0.878-' + TAG);
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844, touch: true, minSpacing: 11 },
  { name: '768x1024', width: 768, height: 1024, touch: true, minSpacing: 11 },
  { name: '1280x900', width: 1280, height: 900, touch: false, minSpacing: 11 },
  { name: '1920x1080', width: 1920, height: 1080, touch: false, minSpacing: 11 },
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

// Песня: аккорды с таб-вставкой на 2 доли и три таб-строки из спеки.
async function buildSong(page) {
  await page.evaluate(() => {
    const sixteenths = (count, span, dur) => {
      const step = dur || span / count;
      return Array.from({ length: count }, (_, i) => ({
        start: Math.round(i * (span / count) * 1e9) / 1e9,
        dur: step,
        string: 1 + (i % 3),
        fret: i % 5,
      }));
    };
    startNewSongFromHome();
    addSection('Verse');
    const sec = sections[0];
    sec.squares = [
      {
        id: nextId++, type: 'chords', repeat: 1, customBeats: null, events: [
          { root: 'Em', span: 2, quality: 'min' },
          { span: 2, isTab: true, tabNotes: sixteenths(8, 2) },
          { root: 'C', span: 2 },
          { root: 'G', span: 2 },
        ],
      },
      {
        id: nextId++, type: 'chords', repeat: 1, customBeats: null, events: [
          { root: 'Am', span: 2 },
          { root: 'F', span: 2 },
          { root: 'Dm', span: 2 },
          { root: 'E', span: 2 },
        ],
      },
      { id: nextId++, type: 'tab', repeat: 1, beats: 4, customBeats: null, events: [], notes: sixteenths(16, 4) },
      { id: nextId++, type: 'tab', repeat: 1, beats: 4, customBeats: null, events: [], notes: sixteenths(8, 4, 0.5) },
      { id: nextId++, type: 'tab', repeat: 1, beats: 8, customBeats: null, events: [], notes: sixteenths(8, 8, 1) },
    ];
    render();
  });
  await wait(1500);
}

function measure(page) {
  return page.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const round = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);
    const cards = [...document.querySelectorAll('.tab-insert')].map((card) => {
      const svg = card.querySelector('svg.tab-digits-svg');
      const body = card.querySelector('.tab-insert-body--digits');
      const digitEls = [...card.querySelectorAll('.tab-digits-digit')];
      const digits = digitEls.map((t) => ({ text: t.textContent, ...rect(t) }));
      const beats = [...card.querySelectorAll('.tab-digits-beat')].map((t) => ({ text: t.textContent, ...rect(t) }));
      // Соседние цифры на одной струне: минимальный зазор между рамками.
      const minGap = (() => {
        const byString = new Map();
        digits.forEach((d) => {
          const key = Math.round(d.y);
          if (!byString.has(key)) byString.set(key, []);
          byString.get(key).push(d);
        });
        let min = Infinity;
        byString.forEach((list) => {
          list.sort((a, b) => a.x - b.x);
          for (let i = 1; i < list.length; i += 1) min = Math.min(min, list[i].left - list[i - 1].right);
        });
        return min === Infinity ? null : round(min);
      })();
      const beatMinGap = (() => {
        const sorted = beats.slice().sort((a, b) => a.x - b.x);
        let min = Infinity;
        for (let i = 1; i < sorted.length; i += 1) min = Math.min(min, sorted[i].left - sorted[i - 1].left);
        return min === Infinity ? null : round(min);
      })();
      const cardRect = rect(card);
      const bodyRect = body ? rect(body) : null;
      const svgRect = svg ? rect(svg) : null;
      const wrap = card.closest('.chord-wrapper--tab');
      const wrapRect = wrap ? rect(wrap) : null;
      const inner = card.closest('.square-inner');
      const tpl = inner ? getComputedStyle(inner).gridTemplateColumns : '';
      const columns = tpl ? tpl.split(/\s+/).filter(Boolean).length : 0;
      const spanMatch = wrap ? /span\s+(\d+)/.exec(getComputedStyle(wrap).gridColumn || '') : null;
      const digitFont = digitEls[0] ? parseFloat(getComputedStyle(digitEls[0]).fontSize) : null;
      return {
        cell: !!card.classList.contains('tab-insert--cell'),
        hasHeading: !!card.querySelector('.tab-insert-heading'),
        digitsCount: digits.length,
        digits: digits.map((d) => d.text).join(','),
        beatLabels: beats.map((b) => b.text).join(''),
        minGap,
        beatMinGap,
        digitFont: round(digitFont),
        // Стан заполняет тело клетки (допуск 1.5 px на округление).
        fillsBody: !!(svgRect && bodyRect) &&
          Math.abs(svgRect.w - bodyRect.w) <= 1.5 && Math.abs(svgRect.h - bodyRect.h) <= 1.5,
        clipped: !!(svgRect && cardRect) &&
          (svgRect.right > cardRect.right + 1 || svgRect.left < cardRect.left - 1 ||
           svgRect.bottom > cardRect.bottom + 1 || svgRect.top < cardRect.top - 1),
        title: card.getAttribute('title'),
        aria: card.getAttribute('aria-label'),
        positions: card.dataset.tabPositions,
        layout: card.dataset.tabLayout,
        gridColumn: wrap ? getComputedStyle(wrap).gridColumn : null,
        span: spanMatch ? Number(spanMatch[1]) : null,
        columns,
        fullRow: !!(wrap && inner && Math.round(rect(wrap).w) >= Math.round(rect(inner).w) - 1),
        wrapHeight: wrapRect ? round(wrapRect.h) : null,
        cardHeight: round(cardRect.h),
        cardWidth: round(cardRect.w),
      };
    });
    // Высоты аккордовых клеток без таба — эталон для сравнения.
    const chordHeights = [...document.querySelectorAll('.chord-wrapper:not(.chord-wrapper--tab)')]
      .map((el) => Math.round(rect(el).h));
    const rowHeights = [...document.querySelectorAll('.square-inner')].map((el) => Math.round(rect(el).h));
    return {
      viewport: { w: innerWidth, h: innerHeight },
      theme: document.documentElement.dataset.theme || '',
      cards,
      chordHeights,
      rowHeights,
      chords: {
        counts: [...document.querySelectorAll('.chord-wrapper:not(.chord-wrapper--tab) .chord-count')].map((e) => e.textContent).join(' '),
        tabCellsWithSmallCounts: document.querySelectorAll('.chord-wrapper--tab .chord-counts').length,
      },
      anyAlphaThumbInSong: document.querySelectorAll('.section-card .tab-insert-body .tab-thumb').length,
      order: [...document.querySelectorAll('.square-inner')][0]
        ? [...document.querySelectorAll('.square-inner')][0].children.length
        : 0,
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
        await buildSong(page);
        const m = await measure(page);
        rows.push({ id, ...m });

        const cards = m.cards.filter((c) => c.digitsCount > 0);
        const cell = cards.find((c) => c.cell);
        const blocks = cards.filter((c) => !c.cell);
        check(`[${id}] четыре вставки нарисованы`, cards.length === 4, { cards: m.cards.length });
        check(`[${id}] цифры ладов на месте (8/16/8/8)`,
          cards.map((c) => c.digitsCount).sort((a, b) => a - b).join(',') === '8,8,8,16',
          cards.map((c) => c.digitsCount));
        // Главный критерий 0.878.
        check(`[${id}] клетка не занимает строку целиком`,
          !!cell && cell.gridColumn !== '1 / -1' && !cell.fullRow,
          cell && { gridColumn: cell.gridColumn, fullRow: cell.fullRow });
        check(`[${id}] высота клетки с табом равна аккордовой`,
          !!cell && m.chordHeights.length > 0 && Math.abs(cell.wrapHeight - m.chordHeights[0]) <= 2,
          cell && { tab: cell.wrapHeight, chord: m.chordHeights[0] });
        check(`[${id}] ряд с вставкой не выше ряда с аккордами`,
          !!cell && m.rowHeights.length > 1 && Math.abs(m.rowHeights[0] - m.rowHeights[1]) <= 2,
          m.rowHeights);
        check(`[${id}] цифры не мельче 11 px и не крупнее 14 px`,
          cards.every((c) => c.digitFont >= 11 && c.digitFont <= 14),
          cards.map((c) => c.digitFont));
        check(`[${id}] стан заполняет клетку`, cards.every((c) => c.fillsBody), cards.map((c) => c.fillsBody));
        check(`[${id}] стан не обрезан`, cards.every((c) => c.clipped === false), cards.map((c) => c.clipped));
        check(`[${id}] цифры не налезают друг на друга`,
          cards.every((c) => c.minGap === null || c.minGap >= 1.5), cards.map((c) => c.minGap));
        check(`[${id}] номера долей не налезают`,
          cards.every((c) => c.beatMinGap === null || c.beatMinGap >= 1), cards.map((c) => c.beatMinGap));
        check(`[${id}] шаг позиций не меньше ${vp.minSpacing} px`,
          cards.every((c) => c.minGap === null || c.minGap + c.digitFont * 0.6 >= vp.minSpacing - 3),
          cards.map((c) => c.minGap));
        check(`[${id}] у клетки номера долей «3 4»`, !!cell && cell.beatLabels === '34', cell && cell.beatLabels);
        check(`[${id}] в клетке нет заголовка «TAB / …»`, !!cell && cell.hasHeading === false, cell && cell.hasHeading);
        check(`[${id}] в блоке заголовок на месте`, blocks.every((b) => b.hasHeading), blocks.map((b) => b.hasHeading));
        check(`[${id}] подсказка клетки «Таб занимает доли 3–4, 8 нот»`,
          !!cell && String(cell.aria || '').startsWith('Таб занимает доли 3–4'), cell && cell.aria);
        check(`[${id}] клетка осталась второй в ряду`, m.order === 6, m.order);
        check(`[${id}] у клетки нет мелкого счёта «и/та»`, m.chords.tabCellsWithSmallCounts === 0, m.chords.tabCellsWithSmallCounts);
        check(`[${id}] у аккордов остались номера долей`,
          m.chords.counts.split(/\s+/).filter(Boolean).length >= 8, m.chords.counts);
        check(`[${id}] alphaTab в песне не рисует`, m.anyAlphaThumbInSong === 0, m.anyAlphaThumbInSong);

        await page.screenshot({ path: path.join(OUT, `${id}-00-full.png`) });
        const sectionCard = await page.$('.section-card');
        if (sectionCard) await sectionCard.screenshot({ path: path.join(OUT, `${id}-01-section.png`) });
        const cardsEls = await page.$$('.section-card .tab-insert');
        for (let i = 0; i < cardsEls.length; i += 1) {
          await cardsEls[i].screenshot({ path: path.join(OUT, `${id}-02-card-${i + 1}.png`) });
        }
        if (cell) {
          console.log(`     ${id}: клетка ${cell.cardWidth}×${cell.cardHeight} px, кегль ${cell.digitFont} px, ` +
            `gridColumn «${cell.gridColumn}» из ${cell.columns} колонок, ряд ${cell.wrapHeight} px против аккордового ${m.chordHeights[0]} px`);
        }
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

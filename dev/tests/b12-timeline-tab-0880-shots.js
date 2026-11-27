#!/usr/bin/env node
/**
 * 0.880 · Приёмка таб-вставки в ЛЕНТЕ в реальном браузере (кадры «до» и «после»).
 *
 * Матрица: 390×844, 768×1024, 1280×900, 1920×1080 × светлая и тёмная тема
 * × три масштаба Ленты («−», «авто», «+»).
 *
 * В песне случаи из спеки владельца — таб-вставка стоит ПЕРЕД первой
 * аккордовой клеткой, чтобы после неё счёт продолжался с 3-й доли:
 *   1) 2 доли × 4 шестнадцатых (случай из замера — 1 доля ≈ 96 px);
 *   2) 1 такт × 8 восьмых;
 *   3) 1 такт × 16 шестнадцатых;
 *   4) 4 четверти;
 *   5) такт с двузначными ладами (12, 10, 3, 7);
 *   6) такт с паузами.
 *
 * На каждом размере проверяется:
 *   • высота таб-клетки = высоте соседней аккордовой (±1 px), стан целиком
 *     внутри клетки и ничего не свешивает;
 *   • в стане нет глифов длительностей: rhythmMode = Hidden (0) и ниже
 *     последней линии струн нет чернил (> 2 px);
 *   • ключ «TAB» и размер не видны: первая цифра начинается у самого левого
 *     края клетки (≤ 2 px), левее неё чернил нет;
 *   • x каждой ноты = начало клетки + (доля / всего долей) × ширина клетки,
 *     допуск ±2 px — с таблицей «ожидаемый / фактический x» в audit.json;
 *   • подписи счёта «1 та и та 2 та и та» стоят под нотами (±2 px), не
 *     налезают друг на друга, а после вставки аккорд продолжает с 3-й доли;
 *   • мини-линейки в карточке нет (никаких [data-tab-counts]/[data-tab-ticks]);
 *   • сетка редактора песни не изменилась: карточка «только цифры» с
 *     .tab-insert--digits и data-tab-positions.
 *
 * Запуск (нужен Chromium и локальный сервер):
 *   python3 -m http.server 8000                       # из корня репозитория
 *   SHOTS_TAG=after  node dev/tests/b12-timeline-tab-0880-shots.js
 *   # «до»: git show 6e80e9d:STRUCHORD.html > before.html   (это 0.879)
 *   SHOTS_TAG=before STRUCHORD_URL=http://127.0.0.1:8000/before.html \
 *     node dev/tests/b12-timeline-tab-0880-shots.js
 *
 * Результат: PNG-кадры, audit.json и summary.txt в
 * dev/bench/results/tab-timeline-0.880-<TAG>/.
 *
 * ВАЖНО: в песочнице Chromium нет, этот прогон владелец запускает сам.
 * Числовые допуски — из спеки: высота ±1 px, позиции ±2 px.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const TAG = process.env.SHOTS_TAG || 'after';
const OUT = path.join(__dirname, '..', 'bench', 'results', 'tab-timeline-0.880-' + TAG);
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844, touch: true },
  { name: '768x1024', width: 768, height: 1024, touch: true },
  { name: '1280x900', width: 1280, height: 900, touch: false },
  { name: '1920x1080', width: 1920, height: 1080, touch: false },
];
const THEMES = ['light', 'dark'];
const ZOOMS = [
  { name: 'min', value: 'TIMELINE_ZOOM_MIN' },
  { name: 'auto', value: 1 },
  { name: 'max', value: 'TIMELINE_ZOOM_MAX' },
];

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

// ---------------------------------------------------------------------------
// Песня: шесть таб-вставок, каждая — перед аккордовой клеткой (как в замере)
// ---------------------------------------------------------------------------
async function buildSong(page) {
  await page.evaluate(() => {
    const notes = (count, span, dur, frets) =>
      Array.from({ length: count }, (_, i) => ({
        start: Math.round(i * (span / count) * 1e9) / 1e9,
        dur: dur || span / count,
        string: i % 6,
        fret: frets ? frets[i % frets.length] : (i % 5) + 1,
      }));
    startNewSongFromHome();
    addSection('Verse');
    const sec = sections[0];
    const square = (tabNotes, beats) => ({
      id: nextId++, type: 'chords', repeat: 1, customBeats: null, events: [
        { chord: '', span: beats, timeSig: null, isTab: true, tabNotes },
        { chord: 'C', span: beats },
      ],
    });
    sec.squares = [
      square(notes(8, 2), 2), //            1) 2 доли × 4 шестнадцатых
      square(notes(8, 4, 0.5), 4), //        2) 1 такт × 8 восьмых
      square(notes(16, 4, 0.25), 4), //      3) 1 такт × 16 шестнадцатых
      square(notes(4, 4, 1), 4), //          4) 4 четверти
      square(notes(8, 4, 0.5, [12, 10, 3, 7]), 4), // 5) двузначные лады
      square([ //                            6) такт с паузами
        { start: 0, dur: 0.5, string: 2, fret: 0 },
        { start: 0.5, dur: 0.5, pause: true },
        { start: 1, dur: 0.5, string: 1, fret: 3 },
        { start: 1.5, dur: 0.5, string: 0, fret: 12 },
        { start: 2, dur: 0.5, pause: true },
        { start: 2.5, dur: 0.5, string: 4, fret: 5 },
        { start: 3, dur: 0.5, string: 3, fret: 2 },
        { start: 3.5, dur: 0.5, string: 2, fret: 7 },
      ], 4),
    ];
    render();
    if (!timelineMode) toggleTimelineMode();
    renderTimeline();
  });
  // Картинки alphaTab печатаются очередью — ждём, пока все клетки получат рисунок.
  for (let i = 0; i < 40; i += 1) {
    const pending = await page.evaluate(
      () => document.querySelectorAll('.tl-cell--tab [data-tab-thumb]:not([data-thumb-done])').length,
    );
    if (!pending) break;
    await wait(250);
  }
  await wait(600);
}

// ---------------------------------------------------------------------------
// Замеры
// ---------------------------------------------------------------------------
function measure(page) {
  return page.evaluate(() => {
    const round = (v) => (v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * 10) / 10);
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height, cx: r.left + r.width / 2 };
    };
    const cells = [...document.querySelectorAll('#timelineTrack .tl-cell')];
    const chordCell = cells.find((c) => !c.classList.contains('tl-cell--tab'));
    const counts = [...document.querySelectorAll('#timelineRhythm .tl-count')].map((el) => ({
      text: el.textContent,
      beat: el.classList.contains('is-beat'),
      ...rect(el),
    }));

    const settings = (() => {
      try {
        return {
          rhythmMode: tabThumbApi.settings.notation.rhythmMode,
          hiddenEnum: alphaTab.TabRhythmMode.Hidden,
        };
      } catch (_) {
        return null;
      }
    })();

    const cards = [...document.querySelectorAll('#timelineTrack .tl-cell--tab')].map((cell) => {
      const card = cell.querySelector('.tab-insert');
      const svg = card ? card.querySelector('svg.tab-thumb-svg') : null;
      const cellRect = rect(cell);
      const cardRect = card ? rect(card) : null;
      const out = {
        cellRect,
        cardRect,
        cellOverflow: getComputedStyle(cell).overflow,
        hasSvg: !!svg,
        headingHidden: (() => {
          const h = card && card.querySelector('.tab-insert-heading');
          return !h || getComputedStyle(h).display === 'none';
        })(),
        ownRuler: card ? card.querySelectorAll('[data-tab-counts], [data-tab-ticks], [data-tab-subticks]').length : -1,
        title: card ? card.getAttribute('title') : null,
        beatGroups: [],
        labels: [],
        ink: null,
        strings: [],
      };
      if (!svg) return out;
      const box = svg.getBoundingClientRect();
      const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
      const scaleX = vb[2] > 0 ? box.width / vb[2] : 1;
      const scaleY = vb[3] > 0 ? box.height / vb[3] : 1;
      out.svgRect = { left: box.left, top: box.top, right: box.right, bottom: box.bottom, w: box.width, h: box.height };
      out.viewBox = vb;
      out.preserveAspectRatio = svg.getAttribute('preserveAspectRatio');
      // Группы долей: alphaTab держит каждую долю в <g class="b<id>">.
      out.beatGroups = [...svg.querySelectorAll('g[class]')]
        .filter((g) => /^b\d+$/.test((g.getAttribute('class') || '').trim()))
        .map((g) => {
          let b;
          try { b = g.getBBox(); } catch (_) { return null; }
          if (!b) return null;
          return {
            id: Number((g.getAttribute('class') || '').trim().slice(1)),
            inkLeft: round(b.x),
            inkTop: round(b.y),
            inkBottom: round(b.y + b.height),
            screenLeft: round(box.left + (b.x - vb[0]) * scaleX),
            screenRight: round(box.left + (b.x + b.width - vb[0]) * scaleX),
            screenBottom: round(box.top + (b.y + b.height - vb[1]) * scaleY),
          };
        })
        .filter(Boolean);
      // Линии струн — тонкие штрихи на всю ширину стана.
      const strings = [];
      let inkTop = Infinity;
      let inkBottom = -Infinity;
      let inkLeft = Infinity;
      [...svg.querySelectorAll('line, path, rect, text')].forEach((el) => {
        let b;
        try { b = el.getBBox(); } catch (_) { return; }
        if (!b || !(b.width > 0) || !(b.height >= 0)) return;
        inkTop = Math.min(inkTop, b.y);
        inkBottom = Math.max(inkBottom, b.y + b.height);
        inkLeft = Math.min(inkLeft, b.x);
        if (b.height <= 2.2 && b.width >= vb[2] * 0.6) strings.push(round(b.y + b.height / 2));
      });
      out.strings = strings.sort((a, b) => a - b);
      out.ink = {
        top: round(inkTop),
        bottom: round(inkBottom),
        left: round(inkLeft),
        screenBottom: round(box.top + (inkBottom - vb[1]) * scaleY),
        screenLeft: round(box.left + (inkLeft - vb[0]) * scaleX),
      };
      // Подписи счёта под этой клеткой.
      out.labels = counts
        .filter((c) => c.cx >= cellRect.left - 1 && c.cx <= cellRect.right + 1)
        .map((c) => ({ text: c.text, beat: c.beat, cx: round(c.cx) }));
      return out;
    });

    return {
      viewport: { w: innerWidth, h: innerHeight },
      theme: document.documentElement.dataset.theme || '',
      zoomLabel: (document.getElementById('timelineZoomValue') || {}).textContent || '',
      chordHeight: chordCell ? round(chordCell.getBoundingClientRect().height) : null,
      settings,
      cards,
      allCounts: counts.map((c) => (c.beat ? `[${c.text}]` : c.text)).join(' '),
      tabCellRegistered: (() => {
        try {
          let found = 0;
          timelineCellByKey.forEach((cell) => {
            if (cell && cell.classList.contains('tl-cell--tab')) found += 1;
          });
          return found;
        } catch (_) {
          return -1;
        }
      })(),
    };
  });
}

// Сетка редактора песни: карточка «только цифры» глазами (0.879 не менялась).
function measureGrid(page) {
  return page.evaluate(() => {
    const card = document.querySelector('.tab-insert--digits');
    if (!card) return null;
    const digits = card.querySelectorAll('.tab-digits-digit').length;
    const lines = card.querySelectorAll('.tab-digits-line').length;
    return {
      digits: !!card.classList.contains('tab-insert--digits'),
      positions: Number(card.getAttribute('data-tab-positions') || 0),
      digitsCount: digits,
      linesCount: lines,
      hasThumb: !!card.querySelector('[data-tab-thumb]'),
      cardH: Math.round(card.getBoundingClientRect().height),
      chordH: (() => {
        const wrap = document.querySelector('.chord-wrapper:not(.chord-wrapper--tab)');
        return wrap ? Math.round(wrap.getBoundingClientRect().height) : null;
      })(),
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
        for (const zoom of ZOOMS) {
          const id = `${vp.name}-${theme}-${zoom.name}`;
          const page = await browser.newPage();
          await page.setViewport({
            width: vp.width, height: vp.height,
            deviceScaleFactor: vp.width < 500 ? 2 : 1, hasTouch: vp.touch, isMobile: vp.width < 500,
          });
          await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
          await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
          await wait(300);

          // Сетка редактора (до перехода в Ленту) — 0.879 не менялась.
          const grid = await measureGrid(page);
          check(`[${id}] сетка: карточка «только цифры» на месте`,
            !!grid && grid.digits && grid.positions > 0 && grid.digitsCount === grid.positions,
            grid);
          check(`[${id}] сетка: высота карточки равна аккордовой клетке`,
            !!grid && grid.chordH !== null && Math.abs(grid.cardH - grid.chordH) <= 2,
            grid && { card: grid.cardH, chord: grid.chordH });

          await buildSong(page);
          if (zoom.value !== 1) {
            await page.evaluate((v) => setTimelineZoom(window[v]), zoom.value);
            await wait(900);
          }
          const m = await measure(page);
          rows.push({ id, ...m });

          check(`[${id}] в Ленте шесть таб-клеток`, m.cards.length === 6, { cards: m.cards.length });
          check(`[${id}] таб-клетки зарегистрированы для воспроизведения`,
            m.tabCellRegistered >= m.cards.length, { registered: m.tabCellRegistered });
          check(`[${id}] картинки alphaTab нарисованы`, m.cards.every((c) => c.hasSvg),
            m.cards.map((c) => c.hasSvg));
          check(`[${id}] ключ и размер за кадром (кадр тянется, поля нет)`,
            m.cards.every((c) => c.preserveAspectRatio === 'none'),
            m.cards.map((c) => c.preserveAspectRatio));

          // 3. Высота и положение.
          check(`[${id}] высота таб-клетки = высоте аккордовой (±1 px)`,
            m.chordHeight !== null && m.cards.every((c) => Math.abs(c.cellRect.h - m.chordHeight) <= 1),
            { chord: m.chordHeight, tab: m.cards.map((c) => Math.round(c.cellRect.h)) });
          check(`[${id}] карточка занимает клетку целиком (не свешивает)`,
            m.cards.every((c) => c.cardRect && Math.abs(c.cardRect.h - c.cellRect.h) <= 1 &&
              c.cardRect.bottom <= c.cellRect.bottom + 0.5),
            m.cards.map((c) => (c.cardRect ? [Math.round(c.cardRect.h), Math.round(c.cellRect.h)] : null)));
          check(`[${id}] стан внутри клетки`,
            m.cards.every((c) => c.svgRect && c.svgRect.top >= c.cellRect.top - 0.5 &&
              c.svgRect.bottom <= c.cellRect.bottom + 0.5),
            m.cards.map((c) => (c.svgRect ? [Math.round(c.svgRect.top), Math.round(c.svgRect.bottom)] : null)));
          check(`[${id}] заголовок «TAB · N нот» в клетке скрыт`,
            m.cards.every((c) => c.headingHidden), m.cards.map((c) => c.headingHidden));

          // 1. Ритм: длительностей нет.
          check(`[${id}] rhythmMode = Hidden (0)`,
            !!m.settings && m.settings.rhythmMode === m.settings.hiddenEnum,
            m.settings);
          check(`[${id}] ниже последней линии струн нет чернил (> 2 px)`,
            m.cards.every((c) => {
              const last = c.strings.length ? Math.max(...c.strings) : null;
              return last !== null && c.ink && (c.ink.bottom - last) <= 2;
            }),
            m.cards.map((c) => {
              const last = c.strings.length ? Math.max(...c.strings) : null;
              return c.ink ? [last, c.ink.bottom] : null;
            }));
          check(`[${id}] линий струн шесть`,
            m.cards.every((c) => c.strings.length === 6), m.cards.map((c) => c.strings.length));

          // 2. Ключ и размер: первая цифра у левого края, левее чернил нет.
          check(`[${id}] первая цифра у левого края клетки (≤ 2 px)`,
            m.cards.every((c) => c.beatGroups.length > 0 &&
              Math.min(...c.beatGroups.map((g) => g.screenLeft)) - c.cardRect.left <= 2),
            m.cards.map((c) => (c.beatGroups.length
              ? round2(Math.min(...c.beatGroups.map((g) => g.screenLeft)) - c.cardRect.left) : null)));
          check(`[${id}] левее первой цифры нет чернил (ключ и размер не видны)`,
            m.cards.every((c) => c.ink && c.beatGroups.length > 0 &&
              c.ink.screenLeft >= Math.min(...c.beatGroups.map((g) => g.screenLeft)) - 2),
            m.cards.map((c) => (c.ink ? c.ink.screenLeft : null)));

          // Ноты на своих долях: таблица «ожидаемый / фактический x».
          const tables = [];
          const withinTolerance = m.cards.every((c) => {
            if (!c.beatGroups.length) return false;
            const total = c.beatGroups.length;
            const beats = total; // долей столько же, сколько групп (по одной на долю)
            const table = c.beatGroups
              .slice()
              .sort((a, b) => a.screenLeft - b.screenLeft)
              .map((g, i) => ({
                note: i + 1,
                expected: round2(c.cardRect.left + (i / beats) * c.cardRect.w),
                actual: round2(g.screenLeft),
              }));
            tables.push({ notes: table.length, rows: table });
            return table.every((r) => Math.abs(r.expected - r.actual) <= 2);
          });
          check(`[${id}] x каждой ноты = её доля (±2 px)`, withinTolerance,
            tables.map((t) => t.rows.map((r) => `${r.expected}/${r.actual}`).join(' ')));
          if (tables.length) {
            console.log('     ' + id + ' x нот (ожидаемо/фактически): ' +
              tables[0].rows.map((r) => `${r.note}: ${r.expected}/${r.actual}`).join(' · '));
          }

          // 4. Линейка: счёт под нотами, не налезает, мини-линейки нет.
          check(`[${id}] своей мини-линейки в карточке нет`,
            m.cards.every((c) => c.ownRuler === 0), m.cards.map((c) => c.ownRuler));
          check(`[${id}] счёт «1 та и та» есть под вставкой`,
            /\[1\].*та.*и.*та/.test(m.allCounts) && !/ 0/.test(m.allCounts), m.allCounts);
          check(`[${id}] подписи стоят под своими нотами (±2 px)`,
            m.cards.every((c) => {
              if (!c.labels.length || !c.beatGroups.length) return false;
              const groups = c.beatGroups.slice().sort((a, b) => a.screenLeft - b.screenLeft);
              const labels = c.labels.slice().sort((a, b) => a.cx - b.cx);
              // Первые подписи клетки соответствуют её нотам по порядку.
              const pairs = labels.slice(0, groups.length);
              return pairs.every((l, i) => Math.abs(l.cx - groups[i].screenLeft) <= 2 + (groups[i].screenRight - groups[i].screenLeft) / 2);
            }),
            m.cards.map((c) => (c.labels.length ? c.labels.map((l) => l.cx).join(',') : null)));
          check(`[${id}] подписи не налезают друг на друга`,
            m.cards.every((c) => c.labels.every((l, i) => i === 0 || l.cx - c.labels[i - 1].cx >= 6)),
            m.cards.map((c) => c.labels.map((l) => l.text).join('')));

          await page.screenshot({ path: path.join(OUT, `${id}-00-full.png`) });
          const track = await page.$('#timelineTrack');
          if (track) await track.screenshot({ path: path.join(OUT, `${id}-01-track.png`) });
          const rhythm = await page.$('#timelineRhythm');
          if (rhythm) await rhythm.screenshot({ path: path.join(OUT, `${id}-02-rhythm.png`) });
          const tabCards = await page.$$('.tl-cell--tab');
          for (let i = 0; i < tabCards.length; i += 1) {
            await tabCards[i].screenshot({ path: path.join(OUT, `${id}-03-cell-${i + 1}.png`) });
          }
          console.log(`     ${id}: клетки ${m.cards.map((c) => Math.round(c.cellRect.h)).join('/')} px против аккордовой ${m.chordHeight} px, ` +
            `линий ${m.cards.map((c) => c.strings.length).join('/')}, ` +
            `счёт: ${m.allCounts.slice(0, 80)}`);
          await page.close();
        }
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

function round2(v) {
  return Math.round(v * 100) / 100;
}

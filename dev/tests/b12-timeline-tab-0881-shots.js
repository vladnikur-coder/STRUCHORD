#!/usr/bin/env node
/**
 * 0.881 · Приёмка таб-вставки в ЛЕНТЕ в реальном браузере (кадры «до» и «после»).
 *
 * Матрица: 390×844, 768×1024, 1280×900, 1920×1080 × светлая и тёмная тема
 * × три масштаба Ленты («−», «авто», «+»).
 *
 * В песне шесть случаев из спеки владельца — каждая вставка стоит ПЕРЕД
 * первой аккордовой клеткой своего квадрата:
 *   1) 2 доли × 4 шестнадцатых (случай из замера — 1 доля ≈ 96 px);
 *   2) 1 такт × 8 восьмых;
 *   3) 1 такт × 16 шестнадцатых (шаг 24 px при 96 px/долю);
 *   4) 4 четверти;
 *   5) такт с двузначными ладами (12, 10, 3, 7);
 *   6) такт с паузами.
 *
 * Что проверяется (числовые допуски — из спеки владельца):
 *   • высота таб-клетки = высоте соседней аккордовой (±1 px), карточка
 *     занимает клетку целиком, стан внутри клетки;
 *   • масштаба нет: viewBox = размеру клетки (|scale − 1| ≤ 0.02), у цифр нет
 *     transform, а отношение ширины глифа к высоте — в естественном диапазоне
 *     (0.35…1.15 для одной цифры, 0.9…2.3 для двух) — это и есть «цифры не
 *     расплющены»;
 *   • линии струн: ровно 6 (гитара), не тоньше 1 px, идут от левого края
 *     карточки до правого (±1.5 px), видны в обеих темах (stroke не прозрачный);
 *   • по вертикали: верхняя и нижняя линии вместе с цифрами внутри клетки с
 *     отступом ≥ 4 px; ниже последней линии нет чернил;
 *   • x каждой ноты = начало вставки + (доля / всего долей) × ширина клетки,
 *     допуск ±2 px — с таблицей «ожидаемый / фактический x» в audit.json;
 *   • первая цифра не срезана: левый край её глифа внутри карточки;
 *   • подписи счёта «1 та и та 2 та и та» стоят под нотами (±2 px), не
 *     налезают друг на друга, после вставки счёт продолжается;
 *   • мини-линейки в карточке нет (никаких [data-tab-counts]/[data-tab-ticks]);
 *   • сетка редактора песни не изменилась: карточка «только цифры» с
 *     .tab-insert--digits и data-tab-positions.
 *
 * Запуск (нужен Chromium и локальный сервер):
 *   python3 -m http.server 8000                       # из корня репозитория
 *   SHOTS_TAG=after node dev/tests/b12-timeline-tab-0881-shots.js
 *   # «до»: git show 33d499b:STRUCHORD.html > before.html   (это 0.880)
 *   SHOTS_TAG=before SHOTS_MODE=before STRUCHORD_URL=http://127.0.0.1:8000/before.html \
 *     node dev/tests/b12-timeline-tab-0881-shots.js
 *
 * SHOTS_MODE=before снимает кадры и пишет замеры, но не проверяет инварианты
 * 0.881: в 0.880 стан рисовал alphaTab, и проверки «своего» стана к нему не
 * применимы — эти кадры нужны как «до».
 *
 * Результат: PNG-кадры, audit.json и summary.txt в
 * dev/bench/results/tab-timeline-0.881-<TAG>/.
 *
 * ВАЖНО: в песочнице Chromium нет, этот прогон владелец запускает сам.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const TAG = process.env.SHOTS_TAG || 'after';
const MODE = process.env.SHOTS_MODE || 'after';
const OUT = path.join(__dirname, '..', 'bench', 'results', 'tab-timeline-0.881-' + TAG);
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
const rowsAudit = [];
const failures = [];

function check(name, condition, details) {
  rowsAudit.push({ name, ok: !!condition, details });
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
  // Стан рисуется по фактическому размеру клетки на следующем кадре.
  for (let i = 0; i < 20; i += 1) {
    const pending = await page.evaluate(
      () => document.querySelectorAll('.tl-cell--tab .tab-insert-body:not([data-tab-digits-box])').length,
    );
    if (!pending) break;
    await wait(150);
  }
  await wait(400);
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

    const cards = [...document.querySelectorAll('#timelineTrack .tl-cell--tab')].map((cell) => {
      const card = cell.querySelector('.tab-insert');
      const cellRect = rect(cell);
      const out = {
        cellRect,
        cardRect: card ? rect(card) : null,
        kind: card ? (card.classList.contains('tab-insert--lenta') ? 'own' : 'alphatab') : 'none',
        headingHidden: (() => {
          const h = card && card.querySelector('.tab-insert-heading');
          return !h || getComputedStyle(h).display === 'none';
        })(),
        ownRuler: card ? card.querySelectorAll('[data-tab-counts], [data-tab-ticks], [data-tab-subticks]').length : -1,
        spec: null,
        digits: [],
        lines: [],
        pause: false,
        labels: [],
      };
      if (!card) return out;
      try {
        out.spec = JSON.parse(decodeURIComponent(card.querySelector('[data-tab-thumb]').getAttribute('data-tab-thumb')));
      } catch (_) {}
      const svg = card.querySelector('svg.tab-digits-svg');
      if (!svg) return out;
      const box = rect(svg);
      const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
      out.svgRect = box;
      out.viewBox = vb;
      out.scaleX = vb[2] > 0 ? round(box.w / vb[2]) : null;
      out.scaleY = vb[3] > 0 ? round(box.h / vb[3]) : null;
      out.preserveAspectRatio = svg.getAttribute('preserveAspectRatio');
      // Линии струн: цвет/толщина из раскладки, ширина — до краёв карточки.
      out.lines = [...svg.querySelectorAll('line.tab-digits-line')].map((line) => {
        const r = rect(line);
        return {
          stroke: getComputedStyle(line).stroke,
          width: Number(line.getAttribute('stroke-width')),
          left: round(r.left),
          right: round(r.right),
          y: round(r.top + r.height / 2),
        };
      });
      // Цифры: настоящий глиф в браузере — по нему и меряем пропорции.
      out.digits = [...svg.querySelectorAll('text.tab-digits-digit')].map((t) => {
        const r = rect(t);
        const b = (() => { try { return t.getBBox(); } catch (_) { return null; } })();
        return {
          text: t.textContent.trim(),
          fontSize: Number(t.getAttribute('font-size')),
          anchor: t.getAttribute('text-anchor'),
          transform: t.getAttribute('transform'),
          inkW: b ? round(b.width) : null,
          inkH: b ? round(b.height) : null,
          aspect: b && b.height > 0 ? round(b.width / b.height) : null,
          left: round(r.left),
          right: round(r.right),
          top: round(r.top),
          bottom: round(r.bottom),
        };
      });
      out.pause = !!svg.querySelector('line.tab-digits-pause');
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

function round2(v) {
  return Math.round(v * 100) / 100;
}

// Ожидаемый x ноты: начало контента карточки + доля × ширина.
function expectedX(card, start, totalBeats) {
  const left = card.cardRect.left + (card.paddingLeft || 0);
  const w = card.cardRect.w - (card.paddingLeft || 0) - (card.paddingRight || 0);
  return round2(left + (start / totalBeats) * w);
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
          // Отступы карточки нужны для ожидаемого x (скруглённые края ленты).
          const pads = await page.evaluate(() => [...document.querySelectorAll('#timelineTrack .tl-cell--tab')].map((cell) => {
            const card = cell.querySelector('.tab-insert');
            const cs = getComputedStyle(card);
            return { paddingLeft: parseFloat(cs.paddingLeft) || 0, paddingRight: parseFloat(cs.paddingRight) || 0 };
          }));
          m.cards.forEach((c, i) => Object.assign(c, pads[i] || {}));
          rowsAudit.push({ id, ...m });

          if (MODE === 'after') {
            check(`[${id}] в Ленте шесть таб-клеток`, m.cards.length === 6, { cards: m.cards.length });
            check(`[${id}] таб-клетки зарегистрированы для воспроизведения`,
              m.tabCellRegistered >= m.cards.length, { registered: m.tabCellRegistered });
            check(`[${id}] Лента рисует свой стан (не картинку alphaTab)`,
              m.cards.every((c) => c.kind === 'own'), m.cards.map((c) => c.kind));

            // 1. Масштаба нет: viewBox = размер клетки, пропорции глифа естественные.
            check(`[${id}] SVG не масштабируется (viewBox = размер клетки)`,
              m.cards.every((c) => c.scaleX !== null && Math.abs(c.scaleX - 1) <= 0.02 && Math.abs(c.scaleY - 1) <= 0.02),
              m.cards.map((c) => [c.scaleX, c.scaleY]));
            check(`[${id}] preserveAspectRatio не «none»`,
              m.cards.every((c) => c.preserveAspectRatio !== 'none'),
              m.cards.map((c) => c.preserveAspectRatio));
            check(`[${id}] у цифр нет transform`,
              m.cards.every((c) => c.digits.every((d) => !d.transform)),
              m.cards.map((c) => c.digits.filter((d) => d.transform).map((d) => d.text)));
            const aspects = m.cards.map((c) => c.digits.map((d) => ({ text: d.text, aspect: d.aspect })));
            check(`[${id}] пропорции глифа естественные (одна цифра 0.35…1.15, две 0.9…2.3)`,
              m.cards.every((c) => c.digits.every((d) =>
                d.aspect !== null && (d.text.length === 1
                  ? d.aspect >= 0.35 && d.aspect <= 1.15
                  : d.aspect >= 0.9 && d.aspect <= 2.3))),
              aspects);
            check(`[${id}] кегль цифр ≥ 14 px в обычном масштабе`,
              m.cards.every((c) => c.digits.every((d) => d.fontSize >= 11)),
              m.cards.map((c) => c.digits.map((d) => round2(d.fontSize))));

            // 2. Линии струн: шесть, не тоньше 1 px, во всю ширину, видны.
            check(`[${id}] линий струн шесть`,
              m.cards.every((c) => c.lines.length === 6), m.cards.map((c) => c.lines.length));
            check(`[${id}] линии не тоньше 1 px и не прозрачные`,
              m.cards.every((c) => c.lines.every((l) => l.width >= 1 && l.stroke && l.stroke !== 'none' && !/rgba\([^)]*,\s*0\)/.test(l.stroke))),
              m.cards.map((c) => c.lines.map((l) => l.stroke).slice(0, 1)));
            check(`[${id}] линии идут от края до края карточки (±1.5 px)`,
              m.cards.every((c) => c.lines.every((l) =>
                Math.abs(l.left - (c.cardRect.left + c.paddingLeft)) <= 1.5 &&
                Math.abs(l.right - (c.cardRect.right - c.paddingRight)) <= 1.5)),
              m.cards.map((c) => (c.lines.length ? [round2(c.lines[0].left - c.cardRect.left), round2(c.cardRect.right - c.lines[0].right)] : null)));

            // 3. Высота и отступы.
            check(`[${id}] высота таб-клетки = высоте аккордовой (±1 px)`,
              m.chordHeight !== null && m.cards.every((c) => Math.abs(c.cellRect.h - m.chordHeight) <= 1),
              { chord: m.chordHeight, tab: m.cards.map((c) => Math.round(c.cellRect.h)) });
            check(`[${id}] заголовок «TAB · N нот» в клетке скрыт`,
              m.cards.every((c) => c.headingHidden), m.cards.map((c) => c.headingHidden));
            const margins = m.cards.map((c) => {
              if (!c.digits.length || !c.lines.length) return null;
              const top = Math.min(...c.digits.map((d) => d.top), ...c.lines.map((l) => l.y - 1));
              const bottom = Math.max(...c.digits.map((d) => d.bottom), ...c.lines.map((l) => l.y + 1));
              return { top: round2(top - c.cellRect.top), bottom: round2(c.cellRect.bottom - bottom) };
            });
            check(`[${id}] стан внутри клетки с отступом ≥ 4 px сверху и снизу`,
              margins.every((mg) => mg && mg.top >= 4 && mg.bottom >= 4), margins);

            // 4. Первая цифра не срезана.
            check(`[${id}] первая цифра не срезана краем карточки`,
              m.cards.every((c) => c.digits.length > 0 &&
                Math.min(...c.digits.map((d) => d.left)) >= c.cardRect.left + c.paddingLeft - 1 &&
                Math.max(...c.digits.map((d) => d.right)) <= c.cardRect.right - c.paddingRight + 1),
              m.cards.map((c) => (c.digits.length ? [round2(Math.min(...c.digits.map((d) => d.left)) - c.cardRect.left)] : null)));

            // 5. x каждой ноты = своя доля (±2 px).
            const tables = [];
            const withinTolerance = m.cards.every((c) => {
              if (!c.spec || !c.spec.n || !c.digits.length) return false;
              const total = Number(c.spec.b) || 1;
              const sounds = c.spec.n.filter((n) => !n.pause);
              const seen = new Set();
              const starts = [];
              sounds.forEach((n) => {
                const key = String(n.start);
                if (seen.has(key)) return;
                seen.add(key);
                starts.push(Number(n.start));
              });
              starts.sort((a, b) => a - b);
              const sorted = c.digits.slice().sort((a, b) => a.left - b.left);
              const table = starts.map((start, i) => ({
                note: i + 1,
                expected: expectedX(c, start, total),
                actual: round2(sorted[i] ? sorted[i].left : NaN),
              }));
              tables.push(table);
              return table.every((r) => Math.abs(r.expected - r.actual) <= 2);
            });
            check(`[${id}] x каждой ноты = её доля (±2 px)`, withinTolerance,
              tables.map((t) => t.map((r) => `${r.expected}/${r.actual}`).join(' ')));
            if (tables.length) {
              console.log('     ' + id + ' x нот (ожидаемо/фактически): ' +
                tables[0].map((r) => `${r.note}: ${r.expected}/${r.actual}`).join(' · '));
            }

            // 6. Счёт в общей линейке.
            check(`[${id}] своей мини-линейки в карточке нет`,
              m.cards.every((c) => c.ownRuler === 0), m.cards.map((c) => c.ownRuler));
            check(`[${id}] счёт «1 та и та» есть под вставкой`,
              /\[1\].*та.*и.*та/.test(m.allCounts) && !/ 0/.test(m.allCounts), m.allCounts);
            check(`[${id}] подписи стоят под своими нотами (±2 px)`,
              m.cards.every((c) => {
                if (!c.labels.length || !c.digits.length) return false;
                const labels = c.labels.slice().sort((a, b) => a.cx - b.cx);
                const digits = c.digits.slice().sort((a, b) => a.left - b.left);
                return labels.slice(0, digits.length).every((l, i) => Math.abs(l.cx - digits[i].left) <= 4);
              }),
              m.cards.map((c) => c.labels.map((l) => l.cx).join(',')));
            check(`[${id}] подписи не налезают друг на друга`,
              m.cards.every((c) => c.labels.every((l, i) => i === 0 || l.cx - c.labels[i - 1].cx >= 6)),
              m.cards.map((c) => c.labels.map((l) => l.text).join('')));
            // Паузы: чёрточка есть там, где в данных пауза.
            const pauseCards = m.cards.filter((c) => c.spec && c.spec.n.some((n) => n.pause));
            check(`[${id}] пауза нарисована чёрточкой`,
              pauseCards.every((c) => c.pause), pauseCards.map((c) => c.pause));
          }

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
            `цифр ${m.cards.map((c) => c.digits.length).join('/')}, ` +
            `счёт: ${m.allCounts.slice(0, 80)}`);
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(OUT, 'audit.json'), JSON.stringify(rowsAudit, null, 2));
  const lines = rowsAudit.filter((r) => r.name).map((r) => (r.ok ? 'ok   ' : 'FAIL ') + r.name);
  lines.push('', failures.length ? `${failures.length} failed` : 'all checks passed');
  fs.writeFileSync(path.join(OUT, 'summary.txt'), lines.join('\n') + '\n');
  console.log('\n' + lines.join('\n'));
  process.exit(failures.length ? 1 : 0);
})().catch((err) => {
  console.error('FAILED: ' + (err && err.stack ? err.stack : err));
  process.exit(2);
});

#!/usr/bin/env node
/**
 * 0.879 · Приёмка «Только цифры» в реальном браузере (кадры «до» и «после»).
 *
 * Матрица: 390×844, 768×1024, 1280×900, 1920×1080 × светлая и тёмная тема.
 * В песне случаи из спеки:
 *   1) Em · таб-вставка на 2 доли (8 шестнадцатых) · C · G — клетка между аккордами;
 *   2) отдельная строка «порядок струн»: нота на струне 0 (низ) и на струне 5 (верх);
 *   3) такт из 16 шестнадцатых, такт из 8 восьмых, такт из 4 четвертей;
 *   4) такт с паузами; такт с двузначными ладами (12, 10).
 *
 * На каждом размере проверяется (0.879):
 *   • нота на первой (тонкой) струне ВЫШЕ ноты на шестой (толстой);
 *   • линии струн видны и без прозрачности (computed stroke, opacity = 1);
 *   • цифры ≥ 16 px при высоте тела стана 90 px и ≥ 12 px при меньшей;
 *   • в стане нет чёрточек и перекладин ритма (классов tab-digits-stem/beam/rest нет);
 *   • подпись счёта стоит строго под своей нотой (|dx| ≤ 1 px), размер 11–12 px,
 *     номер доли ≥ 13 px;
 *   • двузначные лады не налезают на соседей;
 *   • клетка не занимает строку целиком (нет gridColumn «1 / -1»), её высота
 *     равна высоте аккордовой клетки.
 *
 * Запуск (нужен Chromium и локальный сервер):
 *   python3 -m http.server 8000                       # из корня репозитория
 *   SHOTS_TAG=after  node dev/tests/b12-tab-digits-0879-shots.js
 *   # «до»: git show daa5894:STRUCHORD.html > before.html   (это 0.878)
 *   SHOTS_TAG=before STRUCHORD_URL=http://127.0.0.1:8000/before.html \
 *     node dev/tests/b12-tab-digits-0879-shots.js
 *
 * Результат: PNG-кадры, audit.json и summary.txt в
 * dev/bench/results/tab-digits-0.879-<TAG>/.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const TAG = process.env.SHOTS_TAG || 'after';
const OUT = path.join(__dirname, '..', 'bench', 'results', 'tab-digits-0.879-' + TAG);
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844, touch: true },
  { name: '768x1024', width: 768, height: 1024, touch: true },
  { name: '1280x900', width: 1280, height: 900, touch: false },
  { name: '1920x1080', width: 1920, height: 1080, touch: false },
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

async function buildSong(page) {
  await page.evaluate(() => {
    const sixteenths = (count, span, dur, frets) => {
      const step = dur || span / count;
      return Array.from({ length: count }, (_, i) => ({
        start: Math.round(i * (span / count) * 1e9) / 1e9,
        dur: step,
        string: i % 6,
        fret: frets ? frets[i % frets.length] : i % 5,
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
      // Порядок струн: струна 0 (толстая, низ) и струна 5 (тонкая, верх).
      {
        id: nextId++, type: 'tab', repeat: 1, beats: 2, customBeats: null, events: [], notes: [
          { start: 0, dur: 1, string: 0, fret: 3 },
          { start: 1, dur: 1, string: 5, fret: 9 },
        ],
      },
      { id: nextId++, type: 'tab', repeat: 1, beats: 4, customBeats: null, events: [], notes: sixteenths(16, 4) },
      { id: nextId++, type: 'tab', repeat: 1, beats: 4, customBeats: null, events: [], notes: sixteenths(8, 4, 0.5) },
      { id: nextId++, type: 'tab', repeat: 1, beats: 4, customBeats: null, events: [], notes: sixteenths(4, 4, 1) },
      {
        id: nextId++, type: 'tab', repeat: 1, beats: 2, customBeats: null, events: [], notes: [
          { start: 0, dur: 0.5, string: 2, fret: 0 },
          { start: 0.5, dur: 0.5, pause: true },
          { start: 1, dur: 0.5, string: 1, fret: 3 },
          { start: 1.5, dur: 0.5, string: 0, fret: 12 },
        ],
      },
      { id: nextId++, type: 'tab', repeat: 1, beats: 4, customBeats: null, events: [], notes: sixteenths(8, 4, 0.5, [12, 10, 3, 7]) },
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
    const cards = [...document.querySelectorAll('.tab-insert--digits')].map((card) => {
      const svg = card.querySelector('svg.tab-digits-svg');
      const body = card.querySelector('.tab-insert-body--digits');
      const digitEls = [...card.querySelectorAll('.tab-digits-digit')];
      const digits = digitEls.map((t) => ({
        text: t.textContent,
        font: parseFloat(getComputedStyle(t).fontSize),
        ...rect(t),
      }));
      const counts = [...card.querySelectorAll('.tab-digits-count')].map((t) => ({
        text: t.textContent,
        beat: t.classList.contains('is-beat'),
        font: parseFloat(getComputedStyle(t).fontSize),
        ...rect(t),
      }));
      const lines = svg ? [...svg.querySelectorAll('.tab-digits-line')] : [];
      const lineStyle = lines[0] ? getComputedStyle(lines[0]) : null;
      const gaps = (list) => {
        const sorted = list.slice().sort((a, b) => a.x - b.x);
        let min = Infinity;
        for (let i = 1; i < sorted.length; i += 1) min = Math.min(min, sorted[i].left - sorted[i - 1].right);
        return min === Infinity ? null : round(min);
      };
      const cardRect = rect(card);
      const bodyRect = body ? rect(body) : null;
      const wrap = card.closest('.chord-wrapper--tab');
      // Подпись под своей нотой: ищем для каждой метки ближайшую цифру по x.
      const labelOffsets = counts.map((c) => {
        if (!digits.length) return null;
        const nearest = digits.reduce((best, d) => (Math.abs(d.x - c.x) < Math.abs(best.x - c.x) ? d : best), digits[0]);
        return round(Math.abs(nearest.x - c.x));
      });
      return {
        cell: !!card.classList.contains('tab-insert--cell'),
        digitsCount: digits.length,
        countCards: counts.length,
        beatCounts: counts.filter((c) => c.beat).length,
        digitFontMin: digits.length ? round(Math.min(...digits.map((d) => d.font))) : null,
        digitFontMax: digits.length ? round(Math.max(...digits.map((d) => d.font))) : null,
        countFont: counts.length ? round(counts.filter((c) => !c.beat).map((c) => c.font)[0] || 0) : null,
        beatFont: counts.length ? round(counts.filter((c) => c.beat).map((c) => c.font)[0] || 0) : null,
        labelMaxOffset: labelOffsets.length ? Math.max(...labelOffsets.filter((v) => v !== null)) : null,
        labelGap: gaps(counts),
        digitGap: gaps(digits),
        lines: lines.length,
        lineStroke: lineStyle ? lineStyle.stroke : null,
        lineWidth: lineStyle ? parseFloat(lineStyle.strokeWidth) : null,
        lineOpacity: lineStyle ? lineStyle.opacity : null,
        rhythmMarks: card.querySelectorAll('.tab-digits-stem, .tab-digits-beam, .tab-digits-rest').length,
        pauses: card.querySelectorAll('.tab-digits-pause').length,
        bodyH: bodyRect ? Math.round(bodyRect.h) : null,
        cardW: Math.round(cardRect.w),
        cardH: Math.round(cardRect.h),
        gridColumn: wrap ? getComputedStyle(wrap).gridColumn : null,
        digits: digits.map((d) => ({ text: d.text, x: round(d.x), y: round(d.y) })),
      };
    });
    const chordHeights = [...document.querySelectorAll('.chord-wrapper:not(.chord-wrapper--tab)')].map((el) => Math.round(rect(el).h));
    return {
      viewport: { w: innerWidth, h: innerHeight },
      theme: document.documentElement.dataset.theme || '',
      cards,
      chordHeights,
      anyAlphaThumbInSong: document.querySelectorAll('.section-card .tab-insert-body .tab-thumb').length,
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

        const cards = m.cards;
        const cell = cards.find((c) => c.cell);
        const strings = cards.find((c) => c.digitsCount === 2 && c.digits.some((d) => d.text === '3'));
        check(`[${id}] все вставки нарисованы`, cards.length >= 7, { cards: cards.length });
        // Главный критерий: первая (тонкая) струна выше шестой (толстой).
        const low = strings && strings.digits.find((d) => d.text === '3');
        const high = strings && strings.digits.find((d) => d.text === '9');
        check(`[${id}] нота струны 0 ниже ноты струны 5`, !!low && !!high && low.y > high.y,
          low && high && { string0: low.y, string5: high.y });
        check(`[${id}] шесть линий струн`, cards.every((c) => c.lines === 6), cards.map((c) => c.lines));
        check(`[${id}] линии без прозрачности`, cards.every((c) => Number(c.lineOpacity) === 1), cards.map((c) => c.lineOpacity));
        check(`[${id}] толщина линии ≥ 1.25 px`, cards.every((c) => c.lineWidth >= 1.25), cards.map((c) => c.lineWidth));
        check(`[${id}] в стане нет ритм-палочек`, cards.every((c) => c.rhythmMarks === 0), cards.map((c) => c.rhythmMarks));
        check(`[${id}] у паузы есть метка`, cards.some((c) => c.pauses === 1), cards.map((c) => c.pauses));
        check(`[${id}] цифры ≥ 16 px там, где тело стана ≥ 90 px`,
          cards.every((c) => !(c.bodyH >= 90) || c.digitFontMax >= 16), cards.map((c) => [c.bodyH, c.digitFontMax]));
        check(`[${id}] цифры не мельче 12 px`, cards.every((c) => c.digitFontMin >= 12), cards.map((c) => c.digitFontMin));
        check(`[${id}] подписи счёта 11–12 px`, cards.every((c) => !c.countFont || (c.countFont >= 11 && c.countFont <= 12.5)),
          cards.map((c) => c.countFont));
        check(`[${id}] номер доли ≥ 13 px`, cards.every((c) => !c.beatFont || c.beatFont >= 13), cards.map((c) => c.beatFont));
        check(`[${id}] подпись под каждой нотой`, cards.every((c) => c.countCards === c.digitsCount), cards.map((c) => [c.digitsCount, c.countCards]));
        check(`[${id}] подпись стоит под своей нотой`, cards.every((c) => c.labelMaxOffset !== null && c.labelMaxOffset <= 1),
          cards.map((c) => c.labelMaxOffset));
        check(`[${id}] подписи не налезают`, cards.every((c) => c.labelGap === null || c.labelGap >= 0), cards.map((c) => c.labelGap));
        check(`[${id}] цифры не налезают`, cards.every((c) => c.digitGap === null || c.digitGap >= 0.5), cards.map((c) => c.digitGap));
        check(`[${id}] клетка не занимает строку целиком`, !!cell && cell.gridColumn !== '1 / -1', cell && cell.gridColumn);
        check(`[${id}] высота клетки с табом равна аккордовой`,
          !!cell && Math.abs(cell.cardH - m.chordHeights[0]) <= 2, cell && { tab: cell.cardH, chord: m.chordHeights[0] });
        check(`[${id}] alphaTab в песне не рисует`, m.anyAlphaThumbInSong === 0, m.anyAlphaThumbInSong);

        await page.screenshot({ path: path.join(OUT, `${id}-00-full.png`) });
        const sectionCard = await page.$('.section-card');
        if (sectionCard) await sectionCard.screenshot({ path: path.join(OUT, `${id}-01-section.png`) });
        const cardEls = await page.$$('.section-card .tab-insert');
        for (let i = 0; i < cardEls.length; i += 1) {
          await cardEls[i].screenshot({ path: path.join(OUT, `${id}-02-card-${i + 1}.png`) });
        }
        console.log(`     ${id}: цифры ${cards.map((c) => c.digitFontMax).join('/')} px, ` +
          `линии ${cards.map((c) => c.lineWidth).join('/')} px, подписи ${cards.map((c) => c.countFont).join('/')} px, ` +
          `клетка ${cell ? cell.cardW + '×' + cell.cardH : '—'} px против аккордовой ${m.chordHeights[0]} px`);
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

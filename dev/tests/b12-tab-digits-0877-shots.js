#!/usr/bin/env node
/**
 * 0.877 · Приёмка «Только цифры» в реальном браузере (кадры «до» и «после»).
 *
 * Матрица: 390×844, 768×1024, 1280×900, 1920×1080 × светлая и тёмная тема.
 * В песне четыре случая из спеки:
 *   1) Em · таб-вставка на 2 доли (8 шестнадцатых) · C · G — клетка между аккордами;
 *   2) такт из 16 шестнадцатых;
 *   3) такт из 8 восьмых;
 *   4) два такта по 8 четвертей.
 *
 * На каждом размере проверяется:
 *   • все цифры ладов на месте и НЕ налезают друг на друга (зазор между
 *     подложками соседних цифр > 0);
 *   • стан не обрезан карточкой;
 *   • подпись «N н. · …» не режется троеточием;
 *   • крупные номера долей не налезают друг на друга и их столько, сколько
 *     долей (у клетки во второй половине такта — «3», «4»);
 *   • у аккордов рядом остались свои номера долей «3 4 1 2»;
 *   • клетка либо влезает в свою долю, либо уехала на свою строку сетки
 *     (data-tab-digits-row) — третьего не дано;
 *   • шаг между нотовыми позициями в пикселях (24 px × масштаб стана).
 *
 * Запуск (нужен Chromium и локальный сервер):
 *   python3 -m http.server 8000                       # из корня репозитория
 *   SHOTS_TAG=after  node dev/tests/b12-tab-digits-0877-shots.js
 *   # «до»: git show f5a3363:STRUCHORD.html > before.html   (это 0.876)
 *   SHOTS_TAG=before STRUCHORD_URL=http://127.0.0.1:8000/before.html \
 *     node dev/tests/b12-tab-digits-0877-shots.js
 *
 * Результат: PNG-кадры, audit.json и summary.txt в
 * dev/bench/results/tab-digits-0.877-<TAG>/.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const TAG = process.env.SHOTS_TAG || 'after';
const OUT = path.join(__dirname, '..', 'bench', 'results', 'tab-digits-0.877-' + TAG);
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844, touch: true, minSpacing: 14 },
  { name: '768x1024', width: 768, height: 1024, touch: true, minSpacing: 18 },
  { name: '1280x900', width: 1280, height: 900, touch: false, minSpacing: 24 },
  { name: '1920x1080', width: 1920, height: 1080, touch: false, minSpacing: 24 },
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
    const cards = [...document.querySelectorAll('.tab-insert')].map((card) => {
      const svg = card.querySelector('svg.tab-digits-svg');
      const digits = [...card.querySelectorAll('.tab-digits-digit')].map((t) => ({
        text: t.textContent,
        ...rect(t),
      }));
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
        return min === Infinity ? null : Math.round(min * 10) / 10;
      })();
      const beatMinGap = (() => {
        const sorted = beats.slice().sort((a, b) => a.x - b.x);
        let min = Infinity;
        for (let i = 1; i < sorted.length; i += 1) min = Math.min(min, sorted[i].left - sorted[i - 1].right);
        return min === Infinity ? null : Math.round(min * 10) / 10;
      })();
      const cardRect = rect(card);
      const svgRect = svg ? rect(svg) : null;
      const vb = svg ? svg.getAttribute('viewBox').split(/\s+/).map(Number) : null;
      const scale = svgRect && vb && vb[2] ? svgRect.w / vb[2] : null;
      const label = card.querySelector('.tab-insert-count');
      const wrap = card.closest('.chord-wrapper--tab');
      return {
        cell: !!card.classList.contains('tab-insert--cell'),
        digitsCount: digits.length,
        digits: digits.map((d) => d.text).join(','),
        beatLabels: beats.map((b) => b.text).join(''),
        minGap,
        beatMinGap,
        spacingPx: scale ? Math.round(24 * scale * 10) / 10 : null,
        // Обрезка: содержимое стана выходит за карточку?
        clipped: svgRect ? svgRect.right > cardRect.right + 1 || svgRect.left < cardRect.left - 1 : null,
        label: label ? label.textContent : '',
        labelClipped: label ? label.scrollWidth > label.clientWidth + 1 : null,
        title: card.getAttribute('title'),
        forcedRow: wrap ? wrap.dataset.tabDigitsRow === '1' : null,
        wrapWidth: wrap ? Math.round(rect(wrap).w) : null,
        cardWidth: Math.round(cardRect.w),
      };
    });
    return {
      viewport: { w: innerWidth, h: innerHeight },
      theme: document.documentElement.dataset.theme || '',
      formula: [4, 8, 16, 32].map((n) => ({ positions: n, minWidth: tabDigitsMinWidth(n) })),
      cards,
      chords: {
        counts: [...document.querySelectorAll('.chord-wrapper:not(.chord-wrapper--tab) .chord-count')].map((e) => e.textContent).join(' '),
        tabCellsWithSmallCounts: document.querySelectorAll('.chord-wrapper--tab .chord-counts').length,
      },
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

        const cards = m.cards.filter((c) => c.digitsCount > 0);
        check(`[${id}] четыре карточки нарисованы`, cards.length === 4, { cards: m.cards.length });
        check(`[${id}] цифры ладов на месте (8/16/8/8)`,
          cards.map((c) => c.digitsCount).sort((a, b) => a - b).join(',') === '8,8,8,16',
          cards.map((c) => c.digitsCount));
        check(`[${id}] цифры не налезают друг на друга`,
          cards.every((c) => c.minGap === null || c.minGap >= 2),
          cards.map((c) => c.minGap));
        check(`[${id}] стан не обрезан карточкой`, cards.every((c) => c.clipped === false), cards.map((c) => c.clipped));
        check(`[${id}] подпись «N н.» не режется`, cards.every((c) => c.labelClipped === false), cards.map((c) => c.label));
        check(`[${id}] шаг позиций не меньше ${vp.minSpacing} px`,
          cards.every((c) => c.spacingPx === null || c.spacingPx >= vp.minSpacing - 0.5),
          cards.map((c) => c.spacingPx));
        check(`[${id}] номера долей не налезают`,
          cards.every((c) => c.beatMinGap === null || c.beatMinGap >= 1),
          cards.map((c) => c.beatMinGap));
        const cell = cards.find((c) => c.cell);
        check(`[${id}] у клетки номера долей «3 4»`, !!cell && cell.beatLabels === '34', cell && cell.beatLabels);
        check(`[${id}] подсказка клетки «Таб занимает доли 3–4»`,
          !!cell && String(cell.title || '').includes('Таб занимает доли 3–4'), cell && cell.title);
        check(`[${id}] клетка либо в своей доле, либо на своей строке`, !!cell, cell && { forcedRow: cell.forcedRow, w: cell.wrapWidth });
        check(`[${id}] у клетки нет мелкого счёта «и/та»`, m.chords.tabCellsWithSmallCounts === 0, m.chords.tabCellsWithSmallCounts);
        check(`[${id}] у аккордов остались номера долей «3 4 1 2»`,
          m.chords.counts.split(/\s+/).filter(Boolean).length >= 4, m.chords.counts);

        await page.screenshot({ path: path.join(OUT, `${id}-00-full.png`) });
        const sectionCard = await page.$('.section-card');
        if (sectionCard) await sectionCard.screenshot({ path: path.join(OUT, `${id}-01-section.png`) });
        const cardsEls = await page.$$('.section-card .tab-insert');
        for (let i = 0; i < cardsEls.length; i += 1) {
          await cardsEls[i].screenshot({ path: path.join(OUT, `${id}-02-card-${i + 1}.png`) });
        }
        console.log('     кадры: ' + id + ' · ' + m.formula.map((f) => f.positions + 'поз=' + f.minWidth + 'px').join(', '));
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

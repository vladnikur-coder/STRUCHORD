#!/usr/bin/env node
'use strict';
// 0.879 · «Только цифры»: порядок струн, видимые линии, линейка счёта.
//
// Почему тест такой:
//   • jsdom не считает раскладку, поэтому главная проверка — ЧИСТАЯ модель
//     стана (tabDigitsLayout): порядок струн, кегль, вертикальные зоны,
//     подписи счёта, ширина;
//   • контраст линий считается по настоящим токенам темы из STRUCHORD.html,
//     а не «на глаз»: светлая и тёмная тема, фон клетки и фон блока;
//   • ритм-палочки проверяются по разметке SVG: их не должно быть ни в
//     разметке, ни в CSS;
//   • гарантии 0.878 (клетка не уезжает на строку, высота как у аккордов,
//     расширение «на месте») остаются в наборе — их нельзя сломать.
//
// Запуск: node dev/tests/b12-tab-digits-0879.js

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const ROADMAP = fs.readFileSync(path.join(ROOT, 'ROADMAP.md'), 'utf8');
const CHANGELOG = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');

let passed = 0;
function ok(msg) {
  passed++;
  console.log('  ok  ' + msg);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cssBlock(selector) {
  const at = HTML.indexOf('\n' + selector);
  assert(at >= 0, 'CSS-правило найдено: ' + selector);
  const open = HTML.indexOf('{', at);
  const close = HTML.indexOf('}', open);
  return HTML.slice(open, close + 1);
}

const MODULE = HTML.slice(
  HTML.indexOf('// ===== 0.879: «Только цифры»'),
  HTML.indexOf('function renderTabInsertHtml(')
);

// Цвета темы — из настоящих токенов, без догадок.
function themeTokens(marker) {
  const at = HTML.indexOf(marker);
  assert(at >= 0, 'токены темы найдены: ' + marker);
  const chunk = HTML.slice(at, at + 4000);
  const grab = (name) => {
    const m = new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})').exec(chunk);
    assert(m, 'токен --' + name + ' рядом с ' + marker);
    return m[1];
  };
  return {
    textSecondary: grab('color-text-secondary'),
    textPrimary: grab('color-text-primary'),
    background: grab('color-background-secondary'),
    accent: grab('color-accent'),
  };
}
const rgb = (hexColor) => [1, 3, 5].map((i) => parseInt(hexColor.slice(i, i + 2), 16));
const channel = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const luminance = (c) => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
const mix = (top, bottom, p) => top.map((v, i) => Math.round(v * p + bottom[i] * (1 - p)));
const contrast = (a, b) => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
const toHex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

// =====================================================================
// 1. Версия и статические инварианты
// =====================================================================
{
  assert(HTML.includes('ver 0.881'), 'STRUCHORD.html header is ver 0.881');
  assert(SW.includes("const CACHE_NAME = 'struchord-v881';"), 'sw.js CACHE_NAME is struchord-v881');
  assert(README.includes('`0.881`'), 'README header is 0.881');
  assert(ROADMAP.includes('**0.881**'), 'ROADMAP header is 0.881');
  assert(CHANGELOG.includes('## 0.879'), 'CHANGELOG has 0.879 entry');

  for (const fn of [
    'tabDigitsLayout', 'tabDigitsSvgMarkup', 'tabDigitsSpanText', 'tabDigitsFit', 'tabDigitsScheduleFit',
    'tabDigitsCellPlan', 'tabDigitsPaint', 'tabDigitsNeed', 'tabDigitsFontFor',
    'tabDigitsStepsPerBeat', 'tabDigitsCount',
  ]) {
    assert(HTML.includes('function ' + fn + '('), 'функция ' + fn + ' есть');
  }

  // Ритм-палочек и перекладин больше нет — ни в разметке, ни в CSS.
  assert(!/tab-digits-stem|tab-digits-beam|tab-digits-rest/.test(HTML), 'в SVG и CSS нет палочек и перекладин ритма');
  assert(MODULE.includes('tab-digits-pause'), 'пауза рисуется своей меткой');
  // Струны считаются снизу вверх, как в модели и в редакторе.
  assert(MODULE.includes('(strings - 1 - clamped)'), 'порядок струн: первая струна сверху');
  assert(HTML.includes('// alphaTab в этой раскладке считает струны снизу вверх'), 'модель 0 — низкая струна (как в редакторе)');

  const lineCss = cssBlock('.tab-digits-line {');
  assert(/stroke:\s*var\(--color-text-secondary\)/.test(lineCss), 'линия цвета текста второго уровня');
  assert(/opacity:\s*1/.test(lineCss), 'у линии нет прозрачности');
  assert(!/opacity:\s*0\.\d/.test(lineCss), 'полупрозрачных линий нет');
  assert(HTML.includes('const TAB_DIGITS_LINE_W = 1.5;'), 'толщина линии 1.5 px задана константой');
  assert(/stroke-width:\s*1\.5/.test(lineCss), 'запасная толщина линии в CSS тоже 1.5 px');

  const digitCss = cssBlock('.tab-digits-digit {');
  assert(/fill:\s*var\(--color-text-primary\)/.test(digitCss), 'цифры цвета основного текста');
  assert(/font-weight:\s*(600|700)/.test(digitCss), 'цифры полужирные');
  const countCss = cssBlock('.tab-digits-count {');
  assert(/fill:\s*var\(--color-text-secondary\)/.test(countCss), 'подписи счёта — второго уровня');
  const beatCss = cssBlock('.tab-digits-count.is-beat {');
  assert(/fill:\s*var\(--color-text-primary\)/.test(beatCss) && /font-weight:\s*600/.test(beatCss),
    'номер доли крупнее и полужирный');

  // 0.878 не ломаем: клетка не занимает строку, высота как у аккордов.
  assert(!MODULE.includes("'1 / -1'"), 'в модуле стана нет gridColumn «1 / -1»');
  assert(!HTML.includes('minmax(7.75rem'), 'растяжения ряда под таб нет');
  assert(/min-height:\s*0/.test(cssBlock('.tab-insert--cell .tab-insert-body--digits {')), 'в клетке высоту задаёт ряд');
  ok('Статические инварианты: версия 0.879, порядок струн, видимые линии, нет ритм-палочек, гарантии 0.878');
}

// =====================================================================
// 2. Контраст линий к фону — по настоящим токенам тем
// =====================================================================
{
  const themes = [
    ['светлая', '--color-text-primary: #1e1e2f'],
    ['тёмная', '--color-text-primary: #ececea'],
  ];
  const report = [];
  themes.forEach(([name, marker]) => {
    const t = themeTokens(marker);
    const cellBg = mix(rgb(t.accent), rgb(t.background), 0.04);
    const lineOnCell = contrast(rgb(t.textSecondary), cellBg);
    const lineOnBlock = contrast(rgb(t.textSecondary), rgb(t.background));
    const digitOnCell = contrast(rgb(t.textPrimary), cellBg);
    assert(lineOnCell >= 3, `${name} тема: линия на фоне клетки ≥ 3:1 (${lineOnCell.toFixed(2)})`);
    assert(lineOnBlock >= 3, `${name} тема: линия на фоне блока ≥ 3:1 (${lineOnBlock.toFixed(2)})`);
    assert(digitOnCell >= 7, `${name} тема: цифра на фоне клетки ≥ 7:1 (${digitOnCell.toFixed(2)})`);
    report.push(`${name}: линия ${t.textSecondary} на клетке ${toHex(cellBg)} — ${lineOnCell.toFixed(2)}:1, на блоке ${t.background} — ${lineOnBlock.toFixed(2)}:1; цифра ${t.textPrimary} — ${digitOnCell.toFixed(2)}:1`);
  });
  report.forEach((row) => console.log('    ' + row));
  ok('Контраст линий и цифр в обеих темах ≥ 3:1 (линия) и ≥ 7:1 (цифра)');
}

// =====================================================================
// Живой стенд
// =====================================================================
function makeDom() {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(e.message));
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/?view=editor', virtualConsole: vc,
    beforeParse(w) {
      w.TextEncoder = TextEncoder;
      w.TextDecoder = TextDecoder;
      w.HTMLCanvasElement.prototype.getContext = () => new Proxy(
        { measureText: () => ({ width: 10 }), createLinearGradient: () => ({ addColorStop() {} }), getImageData: () => ({ data: [] }) },
        { get: (o, k) => (k in o ? o[k] : () => {}) },
      );
      w.URL.createObjectURL = () => 'blob:digits-test';
      w.URL.revokeObjectURL = () => {};
      w.HTMLAnchorElement.prototype.click = () => {};
      w.confirm = () => true;
      w.alert = () => {};
      // Кадры после закрытия окна не нужны: иначе отложенный скан полезет в
      // уже уничтоженный jsdom-документ.
      w.requestAnimationFrame = (cb) => setTimeout(() => { if (!w.__closed) cb(Date.now()); }, 8);
      const closeWindow = w.close.bind(w);
      w.close = () => { w.__closed = true; try { closeWindow(); } catch (_) {} };
      if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.FontFace = class { constructor() {} load() { return Promise.resolve(this); } };
      if (!w.document.fonts) w.document.fonts = { add() {}, check: () => true, ready: Promise.resolve(), forEach() {} };
    },
  });
  return { dom, w: dom.window, doc: dom.window.document, errors };
}

// Ноты строятся так же, как их пишет редактор: start/dur — в долях размера.
function sixteenths(count, span, dur) {
  const step = dur || span / count;
  return Array.from({ length: count }, (_, i) => ({
    start: Math.round(i * step * 1e9) / 1e9,
    dur: step,
    string: i % 6,
    fret: i % 5,
  }));
}

function songOf() {
  return {
    schemaVersion: 9,
    metadata: { title: 'digits 0879', artist: 'STRUCHORD' },
    bpm: 120, globalTimeSig: '4/4', globalKey: 'C', keyMode: 'manual', tuning: 'e-std', tuningNotes: null, parts: [],
    sections: [{
      id: 101, type: 'Verse', repeat: 1, squares: [
        // Em / таб-вставка на 2 доли (8 шестнадцатых) / C / G — случай владельца.
        {
          id: 102, type: 'chords', repeat: 1, customBeats: null, events: [
            { root: 'Em', span: 2, quality: 'min' },
            { span: 2, isTab: true, tabNotes: sixteenths(8, 2) },
            { root: 'C', span: 2 },
            { root: 'G', span: 2 },
          ],
        },
        { id: 103, type: 'tab', beats: 4, customBeats: null, repeat: 1, events: [], notes: sixteenths(16, 4) },
        { id: 104, type: 'tab', beats: 4, customBeats: null, repeat: 1, events: [], notes: sixteenths(8, 4, 0.5) },
        { id: 105, type: 'tab', beats: 4, customBeats: null, repeat: 1, events: [], notes: sixteenths(4, 4, 1) },
      ],
    }],
  };
}

async function boot() {
  const ctx = makeDom();
  const { w } = ctx;
  await sleep(300);
  w.localStorage.setItem('struchord_songs', JSON.stringify([songOf()]));
  w.loadSong(0);
  await sleep(450);
  return ctx;
}

async function main() {
  // -------------------------------------------------------------------
  // 3. Порядок струн: первая (тонкая) сверху, последняя (толстая) снизу
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    const { w } = ctx;
    const eachString = (strings) => Array.from({ length: strings }, (_, s) => ({
      start: s / Math.max(1, strings), dur: `0.25`, string: s, fret: 0,
    }));
    for (const [label, strings, hexLayout, width, height] of [
      ['клетка, гитара', 6, 'cell', 232, 64],
      ['блок, гитара', 6, 'block', 396, 96],
      ['блок, укулеле', 4, 'block', 396, 96],
    ]) {
      const notes = Array.from({ length: strings }, (_, s) => ({
        start: Math.round((s * 0.25) * 1e9) / 1e9, dur: 0.25, string: s, fret: s,
      }));
      const L = w.tabDigitsLayout(notes, 4, '4/4', { strings }, { width, height, layout: hexLayout });
      assert.strictEqual(L.positions.length, strings, label + ': позиций по числу струн');
      const yOf = (s) => L.positions.find((p) => p.digits[0].string === s).digits[0].y;
      assert(yOf(0) > yOf(1), label + ': струна 0 ниже струны 1');
      for (let s = 1; s < strings; s += 1) {
        assert(yOf(s) < yOf(s - 1), label + `: струна ${s} выше струны ${s - 1}`);
      }
      assert.strictEqual(yOf(strings - 1), L.staffTop, label + ': последняя струна — верхняя линия');
      assert.strictEqual(yOf(0), L.staffBottom, label + ': первая струна — нижняя линия');
      const lines = w.tabDigitsSvgMarkup(L).match(/class="tab-digits-line"/g) || [];
      assert.strictEqual(lines.length, strings, label + ': линий ровно по числу струн');
    }
    ok('Порядок струн: 0 — низ (нижняя линия), последняя — верхняя; 6 и 4 струны, клетка и блок');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 4. Кегль цифр и вертикальные зоны
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    const { w } = ctx;
    const at = (height, layout) => w.tabDigitsLayout(sixteenths(8, 2), 2, '4/4', { strings: 6 }, { width: 396, height, layout });
    assert.strictEqual(w.tabDigitsFontFor(90), 16.02, 'при высоте 90 px кегль 16.02 px');
    assert(w.tabDigitsFontFor(90) >= 16, 'при высоте 90 px кегль не меньше 16 px');
    assert(w.tabDigitsFontFor(64) >= 12, 'в низкой клетке кегль не меньше 12 px');
    assert.strictEqual(w.tabDigitsFontFor(40), 12, 'ниже 12 px кегль не опускается');
    const tall = at(90, 'block');
    assert(tall.font >= 16, 'раскладка держит кегль ≥ 16 px при 90 px');
    assert(tall.font > tall.countFont, 'цифры крупнее подписей счёта');
    assert(tall.beatFont > tall.countFont, 'номер доли крупнее «и»/«та»');
    assert(tall.beatFont >= 13 && tall.countFont >= 11 && tall.countFont <= 12,
      'подписи 11–12 px, номер доли от 13 px');

    // Верхние ~75 % — стан, нижние ~25 % — линейка счёта.
    [64, 90, 96, 140].forEach((height) => {
      const L = at(height, 'block');
      const staffShare = L.rulerTop / L.height;
      assert(staffShare >= 0.7 && staffShare <= 0.8, `линии занимают ~75 % высоты (${height} px: ${(staffShare * 100).toFixed(0)} %)`);
      assert.strictEqual(L.rulerTop, L.height - L.rulerH, 'линейка начинается сразу под станом');
      // Ничего не обрезано: цифра верхней струны и подпись снизу внутри клетки.
      assert(L.staffTop - L.font / 2 >= 0, 'цифра верхней струны не обрезана (' + height + ')');
      assert(L.staffBottom + L.font / 2 <= L.rulerTop + 0.5, 'цифра нижней струны не заходит в линейку (' + height + ')');
      assert(L.rulerBaseline + L.countFont * 0.4 <= L.height, 'подписи счёта влезают в клетку (' + height + ')');
    });

    // Двузначные лады помещаются: поджатый кегль укладывается в шаг.
    const twoDigit = [
      { start: 0, dur: 0.25, string: 0, fret: 12 },
      { start: 0.25, dur: 0.25, string: 1, fret: 10 },
      { start: 0.5, dur: 0.25, string: 2, fret: 3 },
      { start: 0.75, dur: 0.25, string: 3, fret: 0 },
    ];
    const tight = w.tabDigitsLayout(twoDigit, 1, '4/4', { strings: 6 }, { width: 156, height: 64, layout: 'cell' });
    tight.positions.forEach((p) => {
      p.digits.forEach((d) => {
        assert(d.font <= tight.font + 1e-9, 'кегль двузначной цифры не больше обычного');
        assert(0.62 * d.font * d.label.length <= tight.step + 0.5,
          `лад «${d.label}» шириной ${(0.62 * d.font * d.label.length).toFixed(1)} px помещается в шаг ${tight.step.toFixed(1)} px`);
      });
    });
    // Аккорд: поджатый кегль не выходит за расстояние между линиями.
    const chord = [];
    for (let i = 0; i < 4; i += 1) for (const s of [0, 1, 2]) chord.push({ start: i * 0.25, dur: 0.25, string: s, fret: i + s });
    const chordL = w.tabDigitsLayout(chord, 1, '4/4', { strings: 6 }, { width: 396, height: 96, layout: 'block' });
    chordL.positions.forEach((p) => {
      p.digits.forEach((d) => {
        assert(d.font <= chordL.lineGap * 0.95, 'в аккорде кегль поджат под расстояние между линиями');
      });
    });
    ok('Кегль: 16.02 px при 90 px, ≥ 12 px, подписи 11–13 px, зоны 75/25, двузначные лады и аккорды влезают');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 5. Линейка счёта: слова, позиция под нотой, паузы
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    const { w } = ctx;
    const labelsOf = (notes, beats, ts, opts) => {
      const L = w.tabDigitsLayout(notes, beats, ts, { strings: 6 }, { width: 396, height: 96, layout: 'block', ...(opts || {}) });
      return { L, text: L.positions.map((p) => p.label) };
    };
    // 16-е: «1 та и та 2 та и та».
    const s16 = labelsOf(sixteenths(16, 4), 4, '4/4');
    assert.strictEqual(s16.text.slice(0, 8).join('|'), '1|та|и|та|2|та|и|та', '16-е: «1 та и та 2 та и та»');
    assert.strictEqual(s16.text.length, 16, 'подпись есть под каждой нотой (16)');
    // 8-е: «1 и 2 и».
    const s8 = labelsOf(sixteenths(8, 4, 0.5), 4, '4/4');
    assert.strictEqual(s8.text.join('|'), '1|и|2|и|3|и|4|и', '8-е: «1 и 2 и 3 и 4 и»');
    // Четверти: только номера.
    const s4 = labelsOf(sixteenths(4, 4, 1), 4, '4/4');
    assert.strictEqual(s4.text.join('|'), '1|2|3|4', 'четверти: «1 2 3 4»');
    // Крупные номера только на начале доли.
    const beats = s16.L.positions.filter((p) => p.labelBeat).map((p) => p.label);
    assert.strictEqual(beats.join(''), '1234', 'крупные номера — только начала долей');
    // Подпись строго под своей нотой.
    s16.L.positions.forEach((p) => {
      const label = s16.L.labels.find((l) => l.text === p.label && Math.abs(l.x - p.x) < 1e-9);
      assert(label, 'подпись «' + p.label + '» стоит ровно под своей нотой');
    });
    // Подписи не налезают друг на друга.
    for (let i = 1; i < s16.L.labels.length; i += 1) {
      const gap = s16.L.labels[i].x - s16.L.labels[i - 1].x;
      assert(gap >= s16.L.countFont * 1.15, 'подписи не налезают: ' + gap.toFixed(1) + ' px');
    }
    // Пауза тоже получает подпись на своей позиции.
    const withPause = [
      { start: 0, dur: 0.5, string: 2, fret: 0 },
      { start: 0.5, dur: 0.5, pause: true },
      { start: 1, dur: 0.5, string: 1, fret: 3 },
      { start: 1.5, dur: 0.5, string: 0, fret: 12 },
    ];
    const pauseL = w.tabDigitsLayout(withPause, 2, '4/4', { strings: 6 }, { width: 396, height: 96, layout: 'block' });
    assert.strictEqual(pauseL.positions.filter((p) => p.pause).length, 1, 'пауза занимает свою позицию');
    assert.strictEqual(pauseL.positions[1].label, 'и', 'у паузы есть подпись «и»');
    const pauseSvg = w.tabDigitsSvgMarkup(pauseL);
    assert(pauseSvg.includes('tab-digits-pause'), 'пауза нарисована меткой');
    assert(!/tab-digits-stem|tab-digits-beam/.test(pauseSvg), 'у паузы нет палочек');
    // Клетка во второй половине такта продолжает счёт такта.
    const half = w.tabDigitsLayout(sixteenths(8, 2), 2, '4/4', { strings: 6 }, { width: 232, height: 64, layout: 'cell', beatOffset: 2 });
    assert.strictEqual(half.positions.filter((p) => p.labelBeat).map((p) => p.label).join(''), '34',
      'клетка во второй половине такта: «3», «4»');
    ok('Линейка счёта: «1 та и та 2 та и та» / «1 и 2 и» / «1 2 3 4», подписи под нотами, паузы, счёт такта');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 6. Нет ритм-палочек; линии на всю ширину; подложки под цифрами
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    const { w } = ctx;
    const L = w.tabDigitsLayout(sixteenths(16, 4), 4, '4/4', { strings: 6 }, { width: 396, height: 96, layout: 'block' });
    const svg = w.tabDigitsSvgMarkup(L);
    assert(!/tab-digits-stem|tab-digits-beam|tab-digits-rest/.test(svg), 'в стане нет ни одной ритм-палочки');
    assert.strictEqual((svg.match(/class="tab-digits-line"/g) || []).length, 6, 'шесть линий струн');
    assert(/class="tab-digits-line" stroke-width="1.5"/.test(svg), 'толщина линии 1.5 px в разметке');
    assert.strictEqual((svg.match(/x1="0.75"/g) || []).length, 6, 'линии начинаются у левого края');
    assert.strictEqual((svg.match(new RegExp('x2="' + (L.width - 0.75) + '"', 'g')) || []).length, 6, 'линии доходят до правого края');
    // Подложек столько же, сколько цифр, и каждая не шире шага.
    assert.strictEqual((svg.match(/tab-digits-halo/g) || []).length, 16, 'подложка под каждой цифрой');
    assert(L.haloW <= L.step * 0.95, 'подложка не задевает соседнюю позицию');
    // Подложки идут ДО цифр: слой ниже.
    const lastHalo = svg.lastIndexOf('tab-digits-halo');
    const firstDigit = svg.indexOf('tab-digits-digit');
    assert(lastHalo < firstDigit, 'все подложки нарисованы до цифр — соседняя струна цифру не подъедает');
    // Подписи счёта — после цифр, внизу.
    assert(svg.lastIndexOf('tab-digits-count') > firstDigit, 'линейка счёта нарисована под цифрами');
    ok('SVG: нет палочек, 6 линий на всю ширину по 1.5 px, подложки под цифрами и слоем ниже');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 7. Гарантии 0.878: клетка на месте, расширение «на месте»
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    const { w, doc } = ctx;
    const need4 = w.tabDigitsNeed(4, 'cell');
    const need16 = w.tabDigitsNeed(16, 'cell');
    assert.strictEqual(need4.min, 12 + 4 * 18, 'минимум 18 px на позицию');
    assert.strictEqual(need4.pref, 12 + 4 * 24, 'комфорт 24 px на позицию');
    const planTight = w.tabDigitsCellPlan({ innerWidth: 936, total: 8, span: 2, gap: 2, needMin: need16.min, needPref: need16.pref });
    assert.strictEqual(planTight.mode, 'wide', 'плотный такт просит ширину');
    assert(planTight.request <= 936 - 6 * 20 - 14 + 0.01, 'аккордам рядом ≥ 20 px на колонку');
    const planFine = w.tabDigitsCellPlan({ innerWidth: 936, total: 8, span: 2, gap: 2, needMin: need4.min, needPref: need4.pref });
    assert.strictEqual(planFine.mode, 'grid', 'просторной клетке пиксельных колонок не нужно');
    const tpl = w.tabDigitsTemplateColumns([{ span: 2, colPx: 0 }, { span: 2, colPx: 197 }, { span: 2, colPx: 0 }, { span: 2, colPx: 0 }]);
    assert.strictEqual(w.tabDigitsGridColumns(tpl), 8, 'колонок столько же, сколько долей');

    const host = doc.createElement('div');
    host.className = 'square-inner';
    host.style.gridTemplateColumns = 'repeat(8, minmax(0, 1fr))';
    const card = (span, n) => `<div class="chord-wrapper${n ? ' chord-wrapper--tab' : ''}" style="grid-column:span ${span};" data-tab-span="${span}">` +
      (n
        ? `<div class="tab-insert tab-insert--cell tab-insert--digits" data-tab-positions="${n}"><div class="tab-insert-body tab-insert-body--digits"></div></div>`
        : '<div class="chord-content"><span class="chord">C</span></div>') + '</div>';
    host.innerHTML = card(2, 0) + card(2, 16) + card(2, 0) + card(2, 0);
    doc.body.appendChild(host);
    Object.defineProperty(host, 'clientWidth', { get: () => 936, configurable: true });
    w.tabDigitsFit(doc);
    const wrap = host.querySelector('.chord-wrapper--tab');
    assert.notStrictEqual(wrap.style.gridColumn, '1 / -1', 'клетка не уезжает на строку');
    assert.strictEqual(wrap.style.gridColumn, 'span 2', 'доля клетки в колонках не меняется');
    assert(/px/.test(host.style.gridTemplateColumns), 'пиксельные колонки только у самой клетки');
    assert.strictEqual(w.tabDigitsGridColumns(host.style.gridTemplateColumns), 8, 'число колонок прежнее');
    assert.deepStrictEqual([...host.children].map((el) => /span\s+(\d+)/.exec(el.style.gridColumn)?.[1]), ['2', '2', '2', '2'],
      'порядок и доли соседей не менялись');
    host.remove();
    ok('Гарантии 0.878: клетка на месте, расширение только её колонок, «1 / -1» нет');
    ctx.dom.window.close();
  }

  // -------------------------------------------------------------------
  // 8. Живой рендер: клетка без заголовка, блок с заголовком, данные целы
  // -------------------------------------------------------------------
  {
    const ctx = await boot();
    const { w, doc } = ctx;
    const cards = Array.from(doc.querySelectorAll('.tab-insert--digits'));
    assert.strictEqual(cards.length, 4, 'четыре вставки в песне');
    cards.forEach((card) => {
      const svg = card.querySelector('svg.tab-digits-svg');
      assert(svg, 'у карточки свой стан');
      assert(!/tab-digits-stem|tab-digits-beam/.test(svg.outerHTML), 'в стане нет палочек');
      assert(svg.querySelectorAll('.tab-digits-line').length === 6, 'шесть линий струн');
      assert(svg.querySelectorAll('.tab-digits-count').length > 0, 'линейка счёта нарисована');
      assert(card.getAttribute('title').includes('Таб занимает'), 'подсказка говорит, какие доли заняты');
    });
    const cell = doc.querySelector('.chord-wrapper--tab .tab-insert--digits');
    assert(cell, 'клетка между аккордами нарисована цифрами');
    assert(!cell.querySelector('.tab-insert-heading'), 'в клетке нет строки «TAB / …»');
    assert.strictEqual(cell.getAttribute('aria-label'), 'Таб занимает доли 3–4, 8 нот', 'подсказка клетки прежняя');
    assert.strictEqual(cell.dataset.tabLayout, 'cell', 'карточка знает, что она в клетке');
    assert.strictEqual(cell.closest('.chord-wrapper--tab').style.gridColumn !== '1 / -1', true, 'клетка не на всю строку');
    const blocks = Array.from(doc.querySelectorAll('.tab-insert--digits:not(.tab-insert--cell)'));
    assert.strictEqual(blocks.length, 3, 'три отдельные строки таба');
    blocks.forEach((b) => {
      assert(b.querySelector('.tab-insert-heading'), 'у отдельного блока заголовок остался');
      assert.strictEqual(b.dataset.tabLayout, 'block', 'блок помечен как block');
    });
    assert.strictEqual(ctx.errors.length, 0, 'страница без ошибок: ' + ctx.errors.slice(0, 2).join(' | '));
    assert.strictEqual(w.eval('TAB_THUMB_PENDING.size'), 0, 'alphaTab не рисует карточки «Только цифры»');

    // Отрисовка под замеренный прямоугольник: размеры и подписи на месте.
    const spec = w.tabThumbSpecFrom(sixteenths(16, 4), 4, '4/4', w.tabInsertDomainFrom({}));
    const host = doc.createElement('div');
    host.className = 'chord-wrapper chord-wrapper--tab';
    host.innerHTML = '<div class="tab-insert tab-insert--cell tab-insert--digits" data-tab-positions="16" data-tab-layout="cell">' +
      '<div class="tab-insert-body tab-insert-body--digits" data-tab-thumb="' + encodeURIComponent(JSON.stringify(spec)) + '"></div></div>';
    doc.body.appendChild(host);
    const body = host.querySelector('.tab-insert-body--digits');
    Object.defineProperty(body, 'clientWidth', { get: () => 456, configurable: true });
    Object.defineProperty(body, 'clientHeight', { get: () => 90, configurable: true });
    w.tabDigitsPaint(doc);
    const svg = body.querySelector('svg.tab-digits-svg');
    assert.strictEqual(svg.getAttribute('viewBox'), '0 0 456 90', 'viewBox совпадает с телом клетки');
    const fontPx = parseFloat(svg.querySelector('.tab-digits-digit').getAttribute('font-size'));
    assert(fontPx >= 16, 'в клетке высотой 90 px цифры ≥ 16 px: ' + fontPx);
    const countPx = parseFloat(svg.querySelector('.tab-digits-count:not(.is-beat)').getAttribute('font-size'));
    const beatPx = parseFloat(svg.querySelector('.tab-digits-count.is-beat').getAttribute('font-size'));
    assert(countPx >= 11 && countPx <= 12, 'подписи счёта 11–12 px: ' + countPx);
    assert(beatPx >= 13, 'номер доли ≥ 13 px: ' + beatPx);
    assert.strictEqual(svg.querySelectorAll('.tab-digits-count').length, 16, 'подпись под каждой нотой');
    host.remove();

    // Данные и соседние подсистемы не тронуты.
    const beforeSections = JSON.stringify(w.eval('sections'));
    w.render();
    await sleep(250);
    assert.strictEqual(JSON.stringify(w.eval('sections')), beforeSections, 'рендер не изменил данные песни');
    assert(HTML.includes("renderTabInsertHtml(sec, sq, parentTs, true, { inTimeline: true })"), 'Лента на alphaTab');
    assert(HTML.includes("renderTabInsertHtml(sec, editor.draft, ts, false, { engine: 'alphatab' })"), 'окно редактора на alphaTab');
    w.openTabInsertEditor(101, 103);
    await sleep(400);
    const preview = doc.querySelector('.tab-editor-preview .tab-insert');
    assert(preview && !preview.classList.contains('tab-insert--digits'), 'окно редактора вставки не перешло на цифры');
    assert.strictEqual(ctx.errors.length, 0, 'окно редактора открылось без ошибок');
    ok('Живой рендер: стан без палочек, линейка счёта, 90 px → 16 px, данные и редактор вставки целы');
    ctx.dom.window.close();
  }

  console.log(`\n0.879 «Только цифры: порядок струн и линейка счёта»: ${passed} групп OK`);
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});

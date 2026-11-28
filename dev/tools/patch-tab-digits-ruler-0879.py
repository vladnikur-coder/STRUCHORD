#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""0.879 · «Только цифры» приводим к виду Guitar Pro/alphaTab.

Что меняет патч:
  1. Порядок струн: в модели 0 — НИЗКАЯ струна (так же считает alphaTab в
     редакторе: `string: n.string + 1`, нижняя линия — 1). Значит первая
     (тонкая) струна — верхняя линия, последняя (толстая) — нижняя.
  2. Линии струн: цвет текста второго уровня без прозрачности, толщина
     1.5 px, на всю ширину стана.
  3. Цифры: полужирные, кегль от высоты (90 px → 16 px, минимум 12 px),
     цвет основного текста, подложка ровно под цифрой (соседей не задевает),
     двузначные лады поджимаются под шаг сетки, а не налезают.
  4. Ритм-палочки и перекладины убраны совсем; пауза — короткая
     приглушённая чёрточка на средней линии.
  5. Под цифрами — линейка счёта: под каждой нотой её место в доле
     («та», «и»), начало доли — крупный номер. Терминология — та же
     функция countLabelFor, что в Ленте.
  6. Верхние ~75 % высоты — линии и цифры, нижние ~25 % — линейка счёта.
  7. Ширина: прежнее правило 18–24 px на позицию, уплотнить → расширить на
     месте → никогда не уезжать на строку (0.878 сохраняется).

Патч неидемпотентен (каждый якорь ровно один раз).
"""
import sys

PATH = 'STRUCHORD.html'
src = open(PATH, encoding='utf-8').read()
before = len(src)

START = '// ===== 0.878: «Только цифры» — стан заполняет клетку, место в ряду не меняется ====='
END = 'function tabDigitsSvgMarkup(layout) {'
# Старый SVG-рисовальщик кончается перед spanText; меняем и его.
END2 = '// «Таб занимает доли 1–2» — для tooltip и aria-label.'

NEW_HEAD = r'''// ===== 0.879: «Только цифры» — порядок струн, видимые линии, линейка счёта =====
//
// 0.878 оставила вставку в ряду аккордов и сравняла высоту с аккордовой
// клеткой — это не трогаем. Здесь доводим сам вид стана до привычного
// Guitar Pro / alphaTab:
//
//   • струны считаются снизу вверх, как в модели и в редакторе
//     (`tabAtLayout` передаёт alphaTab `string: n.string + 1`), поэтому
//     ПЕРВАЯ (тонкая) струна — верхняя линия, ПОСЛЕДНЯЯ (толстая) — нижняя;
//   • линии струн видны: цвет текста второго уровня, без прозрачности,
//     1.5 px, контраст к фону клетки 7.6:1 в светлой теме и 5.7:1 в тёмной;
//   • цифры ладов крупные и полужирные, кегль от высоты: 90 px → 16 px,
//     не меньше 12 px; подложка под цифрой скрывает линию, но не соседние
//     цифры (все подложки рисуются слоем ниже всех цифр);
//   • ритм-палочек и перекладин нет совсем: ритм читается по линейке счёта,
//     пауза — короткая приглушённая чёрточка на средней линии;
//   • нижние ~25 % высоты занимает линейка счёта: под каждой нотой подпись
//     её места в доле («и», «та»), начало доли — крупный номер. Слова и
//     нумерация — из той же функции countLabelFor, что в Ленте.
const TAB_DIGITS_STEP_MIN = 18;      // уплотнённый шаг между позициями
const TAB_DIGITS_STEP_PREF = 24;     // обычный шаг
const TAB_DIGITS_STEP_MAX = 120;     // на широкой строке шаг не раздувается бесконечно
const TAB_DIGITS_FONT_MIN = 12;      // минимум кегля цифры при любом уплотнении
const TAB_DIGITS_FONT_MAX = 20;      // выше — стан превращается в плакат
const TAB_DIGITS_FONT_RATIO = 0.178; // кегль от высоты стана: 90 px → 16 px
const TAB_DIGITS_COUNT_FONT_MIN = 11;
const TAB_DIGITS_COUNT_FONT_MAX = 12;
const TAB_DIGITS_BEAT_FONT = 13;     // номер доли в линейке счёта
const TAB_DIGITS_RULER_RATIO = 0.25; // нижняя четверть высоты — линейка счёта
const TAB_DIGITS_RULER_MIN = 14;
const TAB_DIGITS_RULER_MAX = 36;
const TAB_DIGITS_LINE_W = 1.5;       // толщина линии струны (≥ 1.25 px)
const TAB_DIGITS_CELL_CHROME = 12;   // поля карточки (3+3) + поля стана (3+3): рамки у клетки нет
const TAB_DIGITS_BLOCK_CHROME = 38;  // (поля блока 10 + рамка 1)×2 + поля стана 8×2
const TAB_DIGITS_CELL_PAD_X = 3;
const TAB_DIGITS_BLOCK_PAD_X = 8;
const TAB_DIGITS_CELL_PAD_Y = 2;
const TAB_DIGITS_BLOCK_PAD_Y = 4;

// Сколько подписей счёта в одной доле: 1 — четверти, 2 — восьмые,
// 3 — триоли, 4 — шестнадцатые. Считаем по самой мелкой длительности
// вставки: у 16-х подпись «1 та и та 2 та и та», у 8-х «1 и 2 и».
function tabDigitsStepsPerBeat(groups) {
  let minDur = 0;
  (groups || []).forEach((g) => {
    const d = Number(g && g.dur);
    if (d > 0 && (!minDur || d < minDur)) minDur = d;
  });
  if (!(minDur > 0)) return 1;
  const steps = Math.round(1 / minDur);
  if (!Number.isFinite(steps) || steps < 1) return 1;
  return Math.min(4, steps);
}

// Подпись под нотой: место внутри доли. Начало доли — номер (крупный),
// остальное — «и»/«та» в тех же словах, что в Ленте (countLabelFor).
// Дробления мельче 16-х словами не считают — подписываем номером доли,
// чтобы подпись была под каждой нотой.
function tabDigitsCount(absBeat, stepsPerBeat, perBar) {
  const beat = Math.floor(absBeat + 1e-6);
  const frac = Math.max(0, absBeat - beat);
  const slotRaw = frac * stepsPerBeat;
  const slot = Math.round(slotRaw);
  const onGrid = Math.abs(slotRaw - slot) < 0.02 && slot < stepsPerBeat;
  if (onGrid) {
    const text = typeof countLabelFor === 'function'
      ? countLabelFor(absBeat, slot, stepsPerBeat, perBar)
      : '';
    if (text) return { text, beat: slot === 0 };
  }
  const num = ((beat % Math.max(1, perBar)) + Math.max(1, perBar)) % Math.max(1, perBar) + 1;
  return { text: String(num), beat: false };
}

// Сколько карточке нужно ширины: минимум (шаг 18 px) и комфорт (шаг 24 px).
// chrome — рамка и поля карточки плюс поля стана.
function tabDigitsNeed(count, layout) {
  const n = Math.max(1, Math.round(Number(count) || 0));
  const chrome = layout === 'cell' ? TAB_DIGITS_CELL_CHROME : TAB_DIGITS_BLOCK_CHROME;
  return { min: chrome + n * TAB_DIGITS_STEP_MIN, pref: chrome + n * TAB_DIGITS_STEP_PREF };
}

// Кегль цифры от высоты стана: 90 px → 16 px, ниже 12 px не опускаемся.
function tabDigitsFontFor(height) {
  const h = Number(height) || 0;
  return Math.max(TAB_DIGITS_FONT_MIN, Math.min(TAB_DIGITS_FONT_MAX, h * TAB_DIGITS_FONT_RATIO));
}

// Чистая раскладка стана: ноты → нотовые позиции, позиции → координаты.
// Всё, что можно проверить тестом, живёт здесь: jsdom не считает раскладку.
// opts: { beatOffset, layout: 'cell' | 'block', width, height }
function tabDigitsLayout(notes, beats, ts, domain, opts) {
  const options = opts || {};
  const isCell = options.layout === 'cell';
  const strings = Math.max(1, Math.round(Number(domain && domain.strings) || 6));
  const perBar = Math.max(1, Math.round(getGridUnitsPerBar(ts) || 4));
  const beatOffset = Number(options.beatOffset) || 0;
  const byStart = new Map();
  (Array.isArray(notes) ? notes : []).forEach((n) => {
    if (!n) return;
    const start = Number(n.start);
    if (!Number.isFinite(start) || start < 0) return;
    const key = Math.round(start * 1e6);
    let group = byStart.get(key);
    if (!group) {
      group = { start, dur: 0, digits: [], pause: false };
      byStart.set(key, group);
    }
    const dur = Number(n.dur);
    if (dur > 0 && (!group.dur || dur < group.dur)) group.dur = dur;
    if (n.pause === true) {
      group.pause = true;
      return;
    }
    if (!Number.isInteger(n.string) || !Number.isInteger(n.fret)) return;
    // Один голос: одна струна на позицию, как в данных вставки.
    if (group.digits.some((d) => d.string === n.string)) return;
    group.digits.push({
      string: n.string,
      fret: n.fret,
      dead: n.dead === true,
      label: n.dead === true ? 'x' : String(n.fret),
      out: n.fret < 0 || n.fret > 24,
    });
  });
  const groups = [...byStart.values()].sort((a, b) => a.start - b.start);

  const count = Math.max(1, groups.length);
  const padX = isCell ? TAB_DIGITS_CELL_PAD_X : TAB_DIGITS_BLOCK_PAD_X;
  const padY = isCell ? TAB_DIGITS_CELL_PAD_Y : TAB_DIGITS_BLOCK_PAD_Y;
  const padTotalX = padX * 2;
  const width = Math.max(24, Math.round(Number(options.width) || (padTotalX + count * TAB_DIGITS_STEP_PREF)));
  const height = Math.max(24, Math.round(Number(options.height) || (isCell ? 64 : 96)));

  // Шаг из ширины: место между полями делим на позиции. Шире 24 — хорошо
  // (стан заполняет клетку), уже 18 — значит клетке не хватило места и её
  // должен был расширить tabDigitsCellPlan.
  const boxW = Math.max(6, width - padTotalX);
  const step = Math.max(4, Math.min(TAB_DIGITS_STEP_MAX, boxW / count));
  const stripW = step * count;
  const firstX = padX + (boxW - stripW) / 2 + step / 2;

  const font = tabDigitsFontFor(height);
  const countFont = Math.max(TAB_DIGITS_COUNT_FONT_MIN, Math.min(TAB_DIGITS_COUNT_FONT_MAX, font * 0.72));
  const beatFont = Math.max(TAB_DIGITS_BEAT_FONT, Math.min(TAB_DIGITS_FONT_MAX, countFont + 1.5));
  // Верхние ~75 % — стан, нижние ~25 % — линейка счёта. Сверху и снизу
  // оставляем по половине цифры: цифра на первой/последней струне не
  // обрезается краем клетки.
  const rulerH = Math.max(TAB_DIGITS_RULER_MIN, Math.min(TAB_DIGITS_RULER_MAX, height * TAB_DIGITS_RULER_RATIO));
  const staffArea = Math.max(strings * 4, height - rulerH);
  const margin = font * 0.5 + 1;
  const lineGap = Math.max(4, (staffArea - margin * 2) / Math.max(1, strings - 1));
  const staffTop = margin + Math.max(0, (staffArea - margin * 2 - lineGap * (strings - 1)) / 2);
  const staffBottom = staffTop + lineGap * (strings - 1);
  const rulerTop = staffArea;
  const rulerBaseline = Math.min(height - 1.5, rulerTop + (height - rulerTop) * 0.74);
  const stepsPerBeat = tabDigitsStepsPerBeat(groups);

  // Струны считаются снизу вверх: модель 0 — низкая струна (нижняя линия),
  // последняя — высокая (верхняя линия), как в Guitar Pro и alphaTab.
  const stringY = (s) => {
    const clamped = Math.max(0, Math.min(strings - 1, Number(s) || 0));
    return staffTop + (strings - 1 - clamped) * lineGap;
  };

  const positions = groups.map((group, index) => {
    const isPause = group.pause && group.digits.length === 0;
    const x = firstX + index * step;
    const digits = group.digits.slice().sort((a, b) => b.string - a.string).map((d) => {
      // Двузначный лад («12») не должен налезать на соседа: поджимаем
      // кегль ровно под шаг, остальные цифры остаются крупными.
      const fit = (step - 2) / (0.62 * Math.max(1, d.label.length));
      const size = Math.max(9, Math.min(font, fit));
      return { ...d, y: stringY(d.string), font: size };
    });
    const countLabel = tabDigitsCount(group.start + beatOffset, stepsPerBeat, perBar);
    return {
      index,
      start: group.start,
      x,
      digits,
      pause: isPause,
      dur: group.dur,
      label: countLabel.text,
      labelBeat: countLabel.beat,
    };
  });

  const labels = positions
    .filter((p) => p.label)
    .map((p) => ({ x: p.x, text: p.label, beat: p.labelBeat }));

  const widest = positions.reduce((max, p) => Math.max(max, p.digits.reduce((m, d) => Math.max(m, d.label.length), 0)), 1);
  const haloW = Math.max(6, Math.min(step * 0.92, 0.62 * font * widest + 3));
  const haloH = Math.max(5, Math.min(lineGap * 0.95, font * 1.12));
  const pauseW = Math.max(4, Math.min(step * 0.6, font * 0.7));

  return {
    layout: isCell ? 'cell' : 'block',
    strings,
    perBar,
    beatOffset,
    stepsPerBeat,
    positions,
    labels,
    width,
    height,
    padX,
    padY,
    step,
    firstX,
    font,
    countFont,
    beatFont,
    lineGap,
    lineW: TAB_DIGITS_LINE_W,
    staffTop,
    staffBottom,
    rulerTop,
    rulerBaseline,
    haloW,
    haloH,
    pauseW,
    minWidth: tabDigitsNeed(count, isCell ? 'cell' : 'block').min,
    prefWidth: tabDigitsNeed(count, isCell ? 'cell' : 'block').pref,
    empty: positions.length === 0,
  };
}

function tabDigitsNum(v) {
  return Math.round(Number(v) * 100) / 100;
}

// Стан в SVG: линии струн на всю ширину, подложки (слоем ниже), цифры,
// короткие метки пауз и линейка счёта под нотами. Ключа «TAB», размера и
// ритм-палочек нет — они отнимали место, а ритм теперь читается по счёту.
// Размеры — в пикселях клетки, поэтому SVG ничего не масштабирует: цифры
// ровно того кегля, который посчитала раскладка.
function tabDigitsSvgMarkup(layout) {
  if (!layout || layout.empty) return '';
  const L = layout;
  const w = tabDigitsNum(L.width);
  const h = tabDigitsNum(L.height);
  const parts = [];
  for (let i = 0; i < L.strings; i += 1) {
    const y = tabDigitsNum(L.staffTop + i * L.lineGap);
    parts.push(`<line class="tab-digits-line" stroke-width="${L.lineW}" x1="0.75" y1="${y}" x2="${tabDigitsNum(w - 0.75)}" y2="${y}"></line>`);
  }
  // Подложки — отдельным слоем ниже всех цифр: подложка соседней струны не
  // может подъесть цифру аккорда.
  L.positions.forEach((p) => {
    p.digits.forEach((d) => {
      const size = Math.min(L.haloH, d.font * 1.12);
      parts.push(`<rect class="tab-digits-halo" x="${tabDigitsNum(p.x - L.haloW / 2)}" y="${tabDigitsNum(d.y - size / 2)}" width="${tabDigitsNum(L.haloW)}" height="${tabDigitsNum(size)}" rx="1.5"></rect>`);
    });
  });
  // Пауза — короткая приглушённая чёрточка на средней линии, без палочек.
  const middleY = L.staffTop + ((L.strings - 1) / 2) * L.lineGap;
  L.positions.forEach((p) => {
    if (!p.pause) return;
    parts.push(`<line class="tab-digits-pause" stroke-width="1.6" x1="${tabDigitsNum(p.x - L.pauseW / 2)}" y1="${tabDigitsNum(middleY)}" x2="${tabDigitsNum(p.x + L.pauseW / 2)}" y2="${tabDigitsNum(middleY)}"></line>`);
  });
  L.positions.forEach((p) => {
    p.digits.forEach((d) => {
      parts.push(`<text class="tab-digits-digit${d.out ? ' is-out' : ''}" x="${tabDigitsNum(p.x)}" y="${tabDigitsNum(d.y)}" font-size="${tabDigitsNum(d.font)}" text-anchor="middle" dominant-baseline="central">${d.label}</text>`);
    });
  });
  // Линейка счёта: под каждой нотой её место в доле, начало доли крупнее.
  L.positions.forEach((p) => {
    if (!p.label) return;
    const size = p.labelBeat ? L.beatFont : L.countFont;
    parts.push(`<text class="tab-digits-count${p.labelBeat ? ' is-beat' : ''}" x="${tabDigitsNum(p.x)}" y="${tabDigitsNum(L.rulerBaseline)}" font-size="${tabDigitsNum(size)}" text-anchor="middle">${p.label}</text>`);
  });
  return `<svg class="tab-digits-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${parts.join('')}</svg>`;
}

'''

i0 = src.index(START)
i1 = src.index(END2, i0)
assert i0 < i1
src = src[:i0] + NEW_HEAD + src[i1:]


def rep(old, new, count=1):
    global src
    n = src.count(old)
    if n != count:
        sys.stderr.write('anchor count %d (expected %d): %r\n' % (n, count, old[:140]))
        raise SystemExit(1)
    src = src.replace(old, new, count)


# ---------------------------------------------------------------------
# CSS: видимые линии, крупные цифры, линейка счёта, без ритм-палочек
# ---------------------------------------------------------------------
rep(
    """.tab-digits-line { stroke: currentColor; stroke-width: 1; opacity: 0.4; }
.tab-digits-halo { fill: var(--tab-digit-halo); }
.tab-digits-digit {
  fill: currentColor;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 600;
}
.tab-digits-digit.is-out { fill: var(--color-danger); }
.tab-digits-stem,
.tab-digits-beam { stroke: currentColor; stroke-width: 1.1; stroke-linecap: round; opacity: 0.85; }
.tab-digits-rest { stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; opacity: 0.6; }
.tab-digits-beat {
  fill: var(--color-text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 600;
}""",
    """/* 0.879: линии струн видимы без прозрачности. Цвет — текст второго уровня:
   контраст к фону клетки 7.6:1 в светлой теме и 5.7:1 в тёмной (норма 3:1).
   Толщина приходит из раскладки (1.5 px), здесь — запасное значение. */
.tab-digits-line { stroke: var(--color-text-secondary); stroke-width: 1.5; opacity: 1; }
.tab-digits-halo { fill: var(--tab-digit-halo); }
.tab-digits-digit {
  fill: var(--color-text-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 600;
}
.tab-digits-digit.is-out { fill: var(--color-danger); }
/* Пауза — короткая приглушённая чёрточка на средней линии. */
.tab-digits-pause { stroke: var(--color-text-secondary); stroke-linecap: round; opacity: 0.5; }
/* Линейка счёта под нотами: «и»/«та» — второго уровня, номер доли — крупнее. */
.tab-digits-count {
  fill: var(--color-text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 400;
}
.tab-digits-count.is-beat { fill: var(--color-text-primary); font-weight: 600; }""",
)

open(PATH, 'w', encoding='utf-8').write(src)
print('STRUCHORD.html: %d -> %d (%+d)' % (before, len(src), len(src) - before))

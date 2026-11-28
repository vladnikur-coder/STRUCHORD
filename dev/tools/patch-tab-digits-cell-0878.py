#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""0.878 · «Только цифры»: стан заполняет клетку, место в ряду не меняется.

Что делает патч:
  1. Переписывает модуль стана: геометрия считается под фактический размер
     клетки (шаг из ширины ≥18 px, линии из высоты, кегль цифр 13.5 → 11 px),
     SVG заполняет клетку без letterbox (tabDigitsPaint перерисовывает стан
     под замеренный прямоугольник).
  2. Убирает принудительный переход клетки на всю строку (gridColumn 1 / -1).
     Если 18 px не помещаются, клетка получает дополнительные колонки «на
     месте»: сетка квадрата расширяется на столько же, ряд остаётся полным
     (tabDigitsCellSpan — чистая арифметика).
  3. Высота: убраны фиксированные 6rem/7.75rem для стана в ячейке — клетка
     равна обычной аккордовой (4.5rem), ряд не растягивается.
  4. В ячейке убран заголовок «TAB / 4 н. · 2 доли» — сведения в tooltip и
     aria-label. В отдельном блоке «в начале секции» заголовок остался.

Патч неидемпотентен (каждый якорь ровно один раз).
"""
import sys

PATH = 'STRUCHORD.html'
src = open(PATH, encoding='utf-8').read()
before_len = len(src)

START = '// ===== 0.877: «Только цифры» — свой стан в редакторе песни ====='
END = 'function renderTabInsertHtml(sec, sq, parentTs, interactive = true, cellOpts = null) {'

NEW_MODULE = r'''// ===== 0.878: «Только цифры» — стан заполняет клетку, место в ряду не меняется =====
//
// 0.877 рисовал стан в натуральных пикселях (24 px на позицию) и, когда
// ширина не сходилась, уводил клетку на всю строку сетки («grid-column:
// 1 / -1»). Владелец: вставка обязана остаться на своём месте в ряду
// аккордов и никогда не занимать строку целиком.
//
// Теперь стан считается под фактическую клетку и заполняет её целиком:
// SVG рисуется в пикселях клетки (никакого letterbox), шаг между нотами
// берётся из её ширины (не меньше 18 px), расстояние между струнами — из
// высоты, кегль цифр 13–14 px в обычном случае и не меньше 11 px в низком
// ряду. Если 18 px не помещаются, клетка получает дополнительные колонки
// «на месте»: сетка квадрата становится шире ровно на столько же, поэтому
// ряд остаётся полным — ни переносов, ни серых пустых полос, а аккорды
// справа просто чуть сжимаются.
//
// Лента и окно редактора вставки по-прежнему на alphaTab (inTimeline /
// engine: 'alphatab').
const TAB_DIGITS_STEP_MIN = 18;      // уплотнённый шаг между нотами
const TAB_DIGITS_STEP_PREF = 24;     // обычный шаг
const TAB_DIGITS_STEP_MAX = 120;     // на широкой строке шаг не раздувается бесконечно
const TAB_DIGITS_FONT_MAX = 13.5;    // кегль цифр в обычном случае (13–14 px)
const TAB_DIGITS_FONT_MIN = 11;      // меньше нельзя: цифры перестают читаться
const TAB_DIGITS_CELL_CHROME = 14;   // (поля карточки 3 + рамка 1)×2 + поля стана 3×2
const TAB_DIGITS_BLOCK_CHROME = 38;  // (поля блока 10 + рамка 1)×2 + поля стана 8×2
const TAB_DIGITS_CELL_PAD_X = 3;
const TAB_DIGITS_BLOCK_PAD_X = 8;
const TAB_DIGITS_CELL_PAD_Y = 2;
const TAB_DIGITS_BLOCK_PAD_Y = 4;
const TAB_DIGITS_LINE_GAP_MAX = 26;  // шестилинейный стан не растягивается в гиганта

// Уровень ритма: 0 — одиночная ножка (четверть и длиннее), 1 — восьмые,
// 2 — шестнадцатые, 3 — тридцатьвторые. Длительность живёт в долях
// родительского размера, поэтому восьмая в 4/4 — это 0.5.
function tabDigitsBeamLevel(dur) {
  const d = Number(dur);
  if (!Number.isFinite(d) || d <= 0) return 1;
  if (d >= 0.75 - 1e-9) return 0;
  if (d > 0.25 + 1e-9) return 1;
  if (d > 0.125 + 1e-9) return 2;
  return 3;
}

// Сколько карточке нужно ширины: минимум (шаг 18 px) и комфорт (шаг 24 px).
// chrome — рамка и поля карточки плюс поля стана.
function tabDigitsNeed(count, layout) {
  const n = Math.max(1, Math.round(Number(count) || 0));
  const chrome = layout === 'cell' ? TAB_DIGITS_CELL_CHROME : TAB_DIGITS_BLOCK_CHROME;
  return { min: chrome + n * TAB_DIGITS_STEP_MIN, pref: chrome + n * TAB_DIGITS_STEP_PREF };
}

// Кегль цифр от высоты стана: держимся 13–14 px, в низком ряду спускаемся
// до 11 px — ниже цифры читаются плохо. Расстояние между струнами потом
// считается от этой же высоты, поэтому линии и цифры растут вместе.
function tabDigitsFontFor(height, strings, padY) {
  const free = Math.max(16, Number(height) - padY * 2 - 4);
  const denom = 1.5 + 0.8 * Math.max(1, strings - 1);
  const fit = free / denom;
  return Math.max(TAB_DIGITS_FONT_MIN, Math.min(TAB_DIGITS_FONT_MAX, fit));
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
  // должен был расширить tabDigitsCellSpan.
  const span = Math.max(6, width - padTotalX);
  const step = Math.max(4, Math.min(TAB_DIGITS_STEP_MAX, span / count));
  const stripW = step * count;
  const firstX = padX + (span - stripW) / 2 + step / 2;

  const font = tabDigitsFontFor(height, strings, padY);
  const labelFont = Math.max(9, Math.min(TAB_DIGITS_FONT_MAX, font * 0.95));
  const free = Math.max(16, height - padY * 2 - 4);
  const lineGapRaw = (free - font * 1.5) / Math.max(1, strings - 1);
  const lineGap = Math.max(4, Math.min(TAB_DIGITS_LINE_GAP_MAX, lineGapRaw));
  const staffH = lineGap * (strings - 1);
  const totalH = staffH + font * 1.5;
  const staffTop = padY + Math.max(0, (height - padY * 2 - totalH) / 2);
  const staffBottom = staffTop + staffH;
  const rhythmTop = staffBottom + Math.max(1.5, font * 0.12);
  const stemLen = Math.max(4, font * 0.55);
  const stemBottom = rhythmTop + stemLen;
  const beamStep = Math.max(2, font * 0.25);
  const beatLabelY = stemBottom + Math.max(7, font * 0.85);
  const haloW = Math.max(6, Math.min(step * 0.86, font * 1.25));
  const haloH = Math.max(5, Math.min(lineGap * 0.95, font * 1.15));

  const positions = groups.map((group, index) => {
    const isPause = group.pause && group.digits.length === 0;
    return {
      index,
      start: group.start,
      x: firstX + index * step,
      digits: group.digits.slice().sort((a, b) => a.string - b.string),
      pause: isPause,
      dur: group.dur,
      level: isPause ? 0 : tabDigitsBeamLevel(group.dur),
    };
  });

  // Перекладины — только ВНУТРИ доли: восьмые одной доли связаны, восьмые
  // соседних долей нет. Так же считает и настоящая нотация.
  const beams = [];
  const byBeat = new Map();
  positions.forEach((p) => {
    if (p.pause || p.level < 1) return;
    const beat = Math.floor(p.start + 1e-6);
    if (!byBeat.has(beat)) byBeat.set(beat, []);
    byBeat.get(beat).push(p);
  });
  [...byBeat.keys()].sort((a, b) => a - b).forEach((beat) => {
    const list = byBeat.get(beat);
    if (list.length < 2) return;
    const maxLevel = Math.max.apply(null, list.map((p) => p.level));
    for (let level = 1; level <= maxLevel; level += 1) {
      let run = [];
      const flush = () => {
        if (run.length > 1) beams.push({ level, xs: run.slice() });
        run = [];
      };
      list.forEach((p) => {
        if (p.level >= level) run.push(p.x);
        else flush();
      });
      flush();
    }
  });

  // Крупные номера долей: только начало доли, без «и/та». Номер считается
  // внутри такта, поэтому у ячейки во второй половине такта будут «3», «4».
  const beatLabels = [];
  const labelMinGap = Math.max(10, labelFont * 1.1);
  let lastLabelX = -1e9;
  positions.forEach((p) => {
    const inBar = p.start + beatOffset;
    if (Math.abs(inBar - Math.round(inBar)) > 1e-6) return;
    if (p.x - lastLabelX < labelMinGap) return;
    lastLabelX = p.x;
    beatLabels.push({ x: p.x, text: String(Math.round(inBar) % perBar + 1) });
  });

  return {
    layout: isCell ? 'cell' : 'block',
    strings,
    perBar,
    beatOffset,
    positions,
    beams,
    beatLabels,
    width,
    height,
    padX,
    padY,
    step,
    firstX,
    font,
    labelFont,
    lineGap,
    staffTop,
    staffBottom,
    rhythmTop,
    stemLen,
    stemBottom,
    beamStep,
    beatLabelY,
    haloW,
    haloH,
    minWidth: tabDigitsNeed(count, isCell ? 'cell' : 'block').min,
    prefWidth: tabDigitsNeed(count, isCell ? 'cell' : 'block').pref,
    empty: positions.length === 0,
  };
}

function tabDigitsNum(v) {
  return Math.round(Number(v) * 100) / 100;
}

// Стан в SVG. Свои линии, цифры с подложкой (линия не пересекает цифру),
// ножки и перекладины ритма, крупные номера долей. Ключа, размера и
// хвостиков нет — они и съедали ширину у alphaTab. Размеры — в пикселях
// клетки, поэтому SVG ничего не масштабирует: цифры ровно того кегля,
// который посчитала раскладка.
function tabDigitsSvgMarkup(layout) {
  if (!layout || layout.empty) return '';
  const L = layout;
  const w = tabDigitsNum(L.width);
  const h = tabDigitsNum(L.height);
  const font = tabDigitsNum(L.font);
  const labelFont = tabDigitsNum(L.labelFont);
  const parts = [];
  for (let i = 0; i < L.strings; i += 1) {
    const y = tabDigitsNum(L.staffTop + i * L.lineGap);
    parts.push(`<line class="tab-digits-line" x1="1" y1="${y}" x2="${tabDigitsNum(w - 1)}" y2="${y}"></line>`);
  }
  L.positions.forEach((p) => {
    if (p.pause) {
      const y = tabDigitsNum(L.rhythmTop + L.stemLen / 2);
      const arm = tabDigitsNum(Math.max(3, L.font * 0.4));
      parts.push(`<line class="tab-digits-rest" x1="${tabDigitsNum(p.x - arm)}" y1="${y}" x2="${tabDigitsNum(p.x + arm)}" y2="${y}"></line>`);
      return;
    }
    p.digits.forEach((d) => {
      const y = tabDigitsNum(L.staffTop + d.string * L.lineGap);
      parts.push(`<rect class="tab-digits-halo" x="${tabDigitsNum(p.x - L.haloW / 2)}" y="${tabDigitsNum(y - L.haloH / 2)}" width="${tabDigitsNum(L.haloW)}" height="${tabDigitsNum(L.haloH)}" rx="1.5"></rect>`);
      parts.push(`<text class="tab-digits-digit${d.out ? ' is-out' : ''}" x="${tabDigitsNum(p.x)}" y="${y}" font-size="${font}" text-anchor="middle" dominant-baseline="central">${d.label}</text>`);
    });
  });
  L.positions.forEach((p) => {
    if (p.pause) return;
    parts.push(`<line class="tab-digits-stem" x1="${tabDigitsNum(p.x)}" y1="${tabDigitsNum(L.rhythmTop)}" x2="${tabDigitsNum(p.x)}" y2="${tabDigitsNum(L.stemBottom)}"></line>`);
  });
  L.beams.forEach((beam) => {
    const y = tabDigitsNum(L.rhythmTop + L.stemLen - (beam.level - 1) * L.beamStep);
    parts.push(`<line class="tab-digits-beam" x1="${tabDigitsNum(beam.xs[0])}" y1="${y}" x2="${tabDigitsNum(beam.xs[beam.xs.length - 1])}" y2="${y}"></line>`);
  });
  L.beatLabels.forEach((b) => {
    parts.push(`<text class="tab-digits-beat" x="${tabDigitsNum(b.x)}" y="${tabDigitsNum(L.beatLabelY)}" font-size="${labelFont}" text-anchor="middle">${b.text}</text>`);
  });
  return `<svg class="tab-digits-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${parts.join('')}</svg>`;
}

// «Таб занимает доли 1–2» — для tooltip и aria-label.
function tabDigitsSpanText(beats, beatsPerBar, beatOffset, isCell) {
  const b = Number(beats) || 0;
  const off = Number(beatOffset) || 0;
  if (isCell && b > 0 && Math.abs(b - Math.round(b)) < 1e-6) {
    const n = Math.round(b);
    const from = Math.round(off) + 1;
    const to = from + n - 1;
    const word = n === 1 ? 'долю' : 'доли';
    return to > from ? `Таб занимает ${word} ${from}–${to}` : `Таб занимает ${word} ${from}`;
  }
  const bars = formatSquareBars(b / Math.max(1e-6, Number(beatsPerBar) || 1));
  return `Таб занимает ${bars} ${sectionRangeCountWord(bars)}`;
}

// Ширина клетки в сетке из total колонок с зазором gap.
function tabDigitsSpanWidth(innerWidth, total, span, gap) {
  const t = Math.max(1, Math.round(Number(total) || 0));
  const s = clampNumberValue(span, 1, t);
  const gapPx = Number.isFinite(Number(gap)) ? Number(gap) : 2;
  const usable = Number(innerWidth) - (t - 1) * gapPx;
  if (!(usable > 0)) return 0;
  return Math.max(0, (usable * s) / t + (s - 1) * gapPx);
}

function clampNumberValue(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

// План клетки «на месте»: сколько колонок попросить у сетки, чтобы стан
// влез с уплотнённым шагом. Сетка при этом расширяется на столько же
// колонок, поэтому сумма span'ов остаётся равной числу колонок: ряд не
// переносится и не оставляет пустых полос. Клетка никогда не занимает
// ряд целиком (span ≤ колонок − 1).
function tabDigitsCellSpan(opts) {
  const inner = Number(opts && opts.innerWidth) || 0;
  const gap = opts && Number.isFinite(Number(opts.gap)) ? Number(opts.gap) : 2;
  const baseTotal = Math.max(1, Math.round(Number(opts && opts.total) || 0));
  const baseSpan = clampNumberValue(opts && opts.span, 1, baseTotal);
  const need = Number(opts && opts.need) || 0;
  let span = baseSpan;
  let total = baseTotal;
  let guard = 0;
  while (
    tabDigitsSpanWidth(inner, total, span, gap) + 0.5 < need &&
    span + 1 <= Math.max(baseSpan, baseTotal - 1) &&
    guard < 24
  ) {
    span += 1;
    total += 1;
    guard += 1;
  }
  return { span, total, added: span - baseSpan, width: tabDigitsSpanWidth(inner, total, span, gap) };
}

// Раскладка ряда: держим клетку на её месте, при нехватке места расширяем
// сетку вместе с её span'ом. Решение считается из ширины сетки и базовых
// span'ов, без замера после перестановки — ResizeObserver не зациклится.
function tabDigitsFit(root) {
  const scope = root && root.querySelectorAll ? root : document;
  const inners = Array.prototype.slice.call(scope.querySelectorAll('.square-inner'));
  const gap = typeof SQUARE_GRID_GAP === 'number' ? SQUARE_GRID_GAP : 2;
  inners.forEach((inner) => {
    const cards = inner.querySelectorAll('.tab-insert--digits[data-tab-positions]');
    if (!cards.length) return;
    const tpl = (inner.style && inner.style.gridTemplateColumns) || '';
    const totalNow = Number((/repeat\((\d+)/.exec(tpl) || [])[1]) || 0;
    if (!(totalNow > 0)) return;
    const wraps = Array.prototype.slice.call(inner.children).filter((el) => el.classList && el.classList.contains('chord-wrapper'));
    if (!wraps.length) return;
    const spanOf = (el) => Number((/span\s+(\d+)/.exec(el.style.gridColumn || '') || [])[1]) || 0;
    const baseOf = (el) => Math.max(1, Number(el.dataset.tabSpan) || spanOf(el) || 1);
    // База: сколько колонок было ДО нашего расширения.
    let extra = 0;
    wraps.forEach((el) => {
      const base = Number(el.dataset.tabSpan) || 0;
      const cur = spanOf(el);
      if (base > 0 && cur > base) extra += cur - base;
    });
    const baseTotal = Math.max(1, totalNow - extra);
    let total = totalNow;
    let changed = false;
    wraps.forEach((el) => {
      const card = el.querySelector('.tab-insert--digits[data-tab-positions]');
      const baseSpan = baseOf(el);
      if (!card) {
        // Обычный аккорд: если сетка вернулась к базе, span приводим к базовому.
        if (el.dataset.tabSpan && spanOf(el) && spanOf(el) !== baseSpan && total === baseTotal) {
          el.style.gridColumn = 'span ' + baseSpan;
          changed = true;
        }
        return;
      }
      const n = Math.max(1, Number(card.dataset.tabPositions) || 1);
      const need = tabDigitsNeed(n, 'cell').min;
      const plan = tabDigitsCellSpan({ innerWidth: inner.clientWidth, total, span: baseSpan, gap, need });
      total = plan.total;
      if (spanOf(el) !== plan.span) {
        el.style.gridColumn = 'span ' + plan.span;
        changed = true;
      }
      // Следующие клетки живут в сетке нового размера — их базовые span'ы
      // не меняются, поэтому сдвигаются только их ширины.
    });
    if (changed || total !== totalNow) {
      inner.style.gridTemplateColumns = `repeat(${total}, minmax(0, 1fr))`;
    }
    // Высоту и ширину клетки после пересчёта сетки читает отрисовка.
    Array.prototype.slice.call(inner.querySelectorAll('.tab-insert--digits[data-tab-positions]')).forEach((card) => {
      const body = card.querySelector('.tab-insert-body--digits');
      if (body) delete body.dataset.tabDigitsBox;
    });
  });
  tabDigitsPaint(scope);
}

// Отрисовка стана под фактический прямоугольник клетки: SVG fill 100 % и
// геометрия ровно в пикселях этого прямоугольника, поэтому цифры получаются
// того кегля, что задумано, а не «что останется от letterbox».
function tabDigitsPaint(root) {
  const scope = root && root.querySelectorAll ? root : document;
  const cards = scope.querySelectorAll('.tab-insert--digits[data-tab-positions]');
  if (!cards || !cards.length) return;
  cards.forEach((card) => {
    const body = card.querySelector('.tab-insert-body--digits');
    if (!body) return;
    const w = Math.round(body.clientWidth);
    const h = Math.round(body.clientHeight);
    if (!(w > 8 && h > 8)) return;
    const key = w + 'x' + h;
    if (body.dataset.tabDigitsBox === key) return;
    let spec = null;
    try {
      spec = JSON.parse(decodeURIComponent(body.dataset.tabThumb || ''));
    } catch (_) {
      return;
    }
    if (!spec || !Array.isArray(spec.n) || !spec.n.length) return;
    const layout = tabDigitsLayout(
      spec.n, spec.b, spec.t,
      tabInsertDomainFrom({ tabInstrument: spec.i, tabTuning: spec.g }),
      {
        width: w,
        height: h,
        layout: card.classList.contains('tab-insert--cell') ? 'cell' : 'block',
        beatOffset: Number(card.dataset.tabBeatOffset) || 0,
      },
    );
    const svg = tabDigitsSvgMarkup(layout);
    if (!svg) return;
    body.innerHTML = svg;
    body.dataset.tabDigitsBox = key;
  });
}

let tabDigitsFitQueued = false;
function tabDigitsScheduleFit() {
  if (tabDigitsFitQueued) return;
  tabDigitsFitQueued = true;
  const run = () => {
    tabDigitsFitQueued = false;
    try { tabDigitsFit(document); } catch (_) {}
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else setTimeout(run, 16);
}

'''

i0 = src.index(START)
i1 = src.index(END, i0)
src = src[:i0] + NEW_MODULE + src[i1:]

def rep(old, new, count=1):
    global src
    n = src.count(old)
    if n != count:
        sys.stderr.write('anchor count %d (expected %d): %r\n' % (n, count, old[:120]))
        raise SystemExit(1)
    src = src.replace(old, new, count)


# ---------------------------------------------------------------------
# renderTabInsertHtml: разметка стана (без заголовка в ячейке)
# ---------------------------------------------------------------------
rep(
    "  const beatOffset = (cellOpts && Number(cellOpts.beatOffset)) || 0;\n"
    "  const digits = useDigits ? tabDigitsLayout(notes, beats, effTs, domain, { beatOffset }) : null;\n"
    "  const digitsSvg = digits ? tabDigitsSvgMarkup(digits) : '';\n"
    "  const digitsWidth = digits && !digits.empty ? Math.round(digits.minWidth) : 0;\n",
    "  const beatOffset = (cellOpts && Number(cellOpts.beatOffset)) || 0;\n"
    "  // 0.878: раскладка считается от размера клетки. Здесь — натуральный\n"
    "  // размер (шаг 24 px): он же первый кадр, а точную геометрию под\n"
    "  // фактический прямоугольник рисует tabDigitsPaint после раскладки.\n"
    "  const digitsLayout = isCell ? 'cell' : 'block';\n"
    "  const digits = useDigits ? tabDigitsLayout(notes, beats, effTs, domain, { beatOffset, layout: digitsLayout }) : null;\n"
    "  const digitsSvg = digits ? tabDigitsSvgMarkup(digits) : '';\n"
    "  const digitsCount = digits ? digits.positions.length : 0;\n",
)

rep(
    "  const titleText = (useDigits ? spanText + ' · ' + count + ' ' + noteWord : durationText) + foreignNote;",
    "  const titleText = (useDigits ? spanText + ', ' + count + ' ' + noteWord : durationText) + foreignNote;",
)

rep(
    """  return `<div class="${cardClass}" data-sec="${sec.id}" data-square="${sq.id}" data-ei="${ei}"` +
    (useDigits ? ` data-tab-digits-w="${digitsWidth}" aria-label="${titleText}"` : '') + ' ' +
    (canEdit ? `onclick="if(typeof isResizing==='undefined'||!isResizing){event.stopPropagation();${openCall}}" ` : '') + `title="${titleText}">` +
    `<div class="tab-insert-heading"><strong class="tab-insert-label">TAB</strong><span class="tab-insert-count">${useDigits ? shortText : durationText}</span></div>` +""",
    """  // 0.878: в ячейке заголовок «TAB / 4 н. · 2 доли» убран — место в ряду
  // дорогое, а сведения живут в tooltip и aria-label. В отдельном блоке
  // «в начале секции» заголовок остаётся.
  const heading = (useDigits && isCell)
    ? ''
    : `<div class="tab-insert-heading"><strong class="tab-insert-label">TAB</strong>` +
      `<span class="tab-insert-count">${useDigits ? shortText : durationText}</span></div>`;
  return `<div class="${cardClass}" data-sec="${sec.id}" data-square="${sq.id}" data-ei="${ei}"` +
    (useDigits
      ? ` data-tab-positions="${digitsCount}" data-tab-layout="${digitsLayout}" data-tab-beat-offset="${beatOffset}" aria-label="${titleText}"`
      : '') + ' ' +
    (canEdit ? `onclick="if(typeof isResizing==='undefined'||!isResizing){event.stopPropagation();${openCall}}" ` : '') + `title="${titleText}">` +
    heading +""",
)

# ---------------------------------------------------------------------
# CSS: стан заполняет клетку, высота ряда не растёт
# ---------------------------------------------------------------------
rep(
    """.square--tab .square-inner { grid-auto-rows: auto; }
.square--has-tab .square-inner { grid-auto-rows: minmax(7.75rem, auto); }
.square--has-tab .chord-wrapper { min-height: 7.75rem; }""",
    """.square--tab .square-inner { grid-auto-rows: auto; }
/* 0.878: ряд с таб-вставкой больше не растягивается под alphaTab. Клетка
   стана равна обычной аккордовой (4.5rem), поэтому ряд с вставкой и ряд
   без неё одной высоты. */""",
)

rep(
    """.tab-insert--digits.tab-insert--cell {
  --tab-digit-halo: color-mix(in srgb, var(--color-accent) 4%, var(--color-background-secondary));
  padding-bottom: 0.4375rem;
}""",
    """.tab-insert--digits.tab-insert--cell {
  --tab-digit-halo: color-mix(in srgb, var(--color-accent) 4%, var(--color-background-secondary));
  /* В ячейке рамка и поля вместе не больше 8 px: 3 + 3 + рамка 1 + 1. */
  padding: 0.1875rem;
  gap: 0;
  height: 100%;
}""",
)

rep(
    """.tab-insert-body--digits {
  display: flex;
  align-items: center;
  justify-content: center;
  /* 6rem = 96 px: стан 95 px влезает целиком, а ряд с таб-клеткой
     остаётся прежней высоты (заголовок + 96 + поля = 7.75rem). */
  height: 6rem;
  min-height: 6rem;
}""",
    """.tab-insert-body--digits {
  display: flex;
  align-items: stretch;
  justify-content: stretch;
}
/* В ячейке высоту задаёт ряд: никаких своих 6rem / 7.75rem, иначе ряд
   с вставкой оказался бы выше соседнего ряда с аккордами. */
.tab-insert--cell .tab-insert-body--digits { height: auto; min-height: 0; flex: 1 1 auto; }
.tab-insert:not(.tab-insert--cell) .tab-insert-body--digits { height: 6rem; min-height: 6rem; }""",
)

rep(
    """/* Стан держит натуральный размер (24 px на позицию) и сжимается только
   тогда, когда места нет даже на всю строку — тогда цифры не налезают,
   а уменьшаются вместе со станом. */
.tab-insert-body--digits .tab-digits-svg {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  margin: auto;
}""",
    """/* Стан заполняет клетку целиком: геометрия рисуется ровно в её пикселях
   (tabDigitsPaint), а до первого замера SVG просто вписывается по размеру. */
.tab-insert-body--digits .tab-digits-svg {
  display: block;
  width: 100%;
  height: 100%;
}""",
)

rep(
    """.tab-digits-digit {
  fill: currentColor;
  font: 700 9.5px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}""",
    """.tab-digits-digit {
  fill: currentColor;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 600;
}""",
)

rep(
    """.tab-digits-beat {
  fill: var(--color-text-secondary);
  font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}""",
    """.tab-digits-beat {
  fill: var(--color-text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 600;
}""",
)

open(PATH, 'w', encoding='utf-8').write(src)
print('STRUCHORD.html: %d -> %d (%+d)' % (before_len, len(src), len(src) - before_len))

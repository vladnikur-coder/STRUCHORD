#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""0.877 · «Только цифры»: свой стан вместо alphaTab в редакторе песни.

Что делает патч:
  1. Новый модуль рисования (чистая раскладка + SVG + формула ширины):
     tabDigitsLayout / tabDigitsSvgMarkup / tabDigitsSpanText / tabDigitsFit.
  2. renderTabInsertHtml: в редакторе песни (строка таба и ячейка между
     аккордами) рисуется свой стан; Лента и окно редактора вставки остаются
     на alphaTab (engine: 'alphatab').
  3. Ячейка теряет мелкую линейку «1 1 и 2 2 та и та» — крупные номера
     долей теперь внутри стана.
  4. CSS нового стана, короткая подпись «4 н. · 2 доли», tooltip/aria-label
     «Таб занимает доли 1–2».
  5. Ширина: max(доля времени, позиции × 24 px + поля); не влезает —
     клетка уезжает на свою строку сетки штатной авто-раскладкой.

Патч неидемпотентен (каждый якорь ровно один раз).
"""
import sys

PATH = 'STRUCHORD.html'
src = open(PATH, encoding='utf-8').read()
before_len = len(src)


def rep(old, new, count=1):
    global src
    n = src.count(old)
    if n != count:
        sys.stderr.write('anchor count %d (expected %d): %r\n' % (n, count, old[:120]))
        raise SystemExit(1)
    src = src.replace(old, new, count)


# =====================================================================
# 1. JS: модуль «Только цифры»
# =====================================================================
DIGITS_JS = r'''// ===== 0.877: «Только цифры» — свой стан в редакторе песни =====
//
// 0.692–0.876 таб-вставку в редакторе рисовал alphaTab. В клетке из двух
// долей ему негде развернуться: ключ TAB и размер съедали половину ширины,
// шестнадцатые слипались, подпись «4 ноты · 2 доли» обрезалась, а мелкий
// счёт «1 1 и 2 2 та и та» налезал сам на себя.
//
// Здесь свой минимальный стан: тонкие линии струн, цифры ладов на них,
// короткие чёрточки ритма с общими перекладинами по долям и крупные номера
// долей. Расстояние между нотовыми позициями ровное — не меньше 24 px.
// Лента и окно редактора вставки остаются на alphaTab: там места хватает,
// а подписи «и/та» нужны (спека 0.877).
const TAB_DIGITS_POS_W = 24;      // минимум px на нотовую позицию
const TAB_DIGITS_PAD_X = 8;       // поля стана слева и справа
const TAB_DIGITS_CARD_PAD = 16;   // поля карточки (.tab-insert) и рамка
const TAB_DIGITS_STRING_GAP = 8;  // расстояние между линиями струн
const TAB_DIGITS_STAFF_TOP = 7;   // отступ от верха стана до первой струны
const TAB_DIGITS_RHYTHM_GAP = 4;  // от нижней струны до чёрточек ритма
const TAB_DIGITS_STEM_LEN = 10;   // длина ножки/чёрточки
const TAB_DIGITS_BEAM_STEP = 3.5; // между перекладинами
const TAB_DIGITS_LABEL_H = 13;    // строка крупных номеров долей

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

// Чистая раскладка стана: ноты → нотовые позиции, позиции → координаты.
// Всё, что нужно проверить тестом, живёт здесь: jsdom не считает раскладку.
function tabDigitsLayout(notes, beats, ts, domain, opts) {
  const options = opts || {};
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
  const firstX = TAB_DIGITS_PAD_X + TAB_DIGITS_POS_W / 2;
  const positions = groups.map((group, index) => {
    const isPause = group.pause && group.digits.length === 0;
    return {
      index,
      start: group.start,
      x: firstX + index * TAB_DIGITS_POS_W,
      digits: group.digits.slice().sort((a, b) => a.string - b.string),
      pause: isPause,
      dur: group.dur,
      level: isPause ? 0 : tabDigitsBeamLevel(group.dur),
    };
  });

  const staffTop = TAB_DIGITS_STAFF_TOP;
  const staffBottom = staffTop + (strings - 1) * TAB_DIGITS_STRING_GAP;
  const rhythmTop = staffBottom + TAB_DIGITS_RHYTHM_GAP;
  const stemBottom = rhythmTop + TAB_DIGITS_STEM_LEN;

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
  let lastLabelX = -1e9;
  positions.forEach((p) => {
    const inBar = p.start + beatOffset;
    if (Math.abs(inBar - Math.round(inBar)) > 1e-6) return;
    if (p.x - lastLabelX < 14) return;
    lastLabelX = p.x;
    beatLabels.push({ x: p.x, text: String(Math.round(inBar) % perBar + 1) });
  });

  const count = Math.max(1, positions.length);
  const width = TAB_DIGITS_PAD_X * 2 + count * TAB_DIGITS_POS_W;
  const height = rhythmTop + TAB_DIGITS_STEM_LEN + TAB_DIGITS_LABEL_H + 8;
  return {
    strings,
    perBar,
    beatOffset,
    positions,
    beams,
    beatLabels,
    staffTop,
    staffBottom,
    lineGap: TAB_DIGITS_STRING_GAP,
    rhythmTop,
    stemBottom,
    beamStep: TAB_DIGITS_BEAM_STEP,
    beatLabelY: rhythmTop + TAB_DIGITS_STEM_LEN + TAB_DIGITS_LABEL_H,
    posW: TAB_DIGITS_POS_W,
    padX: TAB_DIGITS_PAD_X,
    width,
    // Ширина карточки: позиции × 24 px + поля стана + поля карточки.
    minWidth: width + TAB_DIGITS_CARD_PAD,
    empty: positions.length === 0,
  };
}

// Формула ширины одной строкой — её и печатает отчёт, её же проверяют тесты.
function tabDigitsMinWidth(positions) {
  const n = Math.max(1, Math.round(Number(positions) || 0));
  return TAB_DIGITS_PAD_X * 2 + n * TAB_DIGITS_POS_W + TAB_DIGITS_CARD_PAD;
}

function tabDigitsNum(v) {
  return Math.round(Number(v) * 100) / 100;
}

// Стан в SVG. Свои линии, цифры с подложкой (линия не пересекает цифру),
// ножки и перекладины ритма, крупные номера долей. Ключа, размера и
// хвостиков нет — они и съедали ширину у alphaTab.
function tabDigitsSvgMarkup(layout) {
  if (!layout || layout.empty) return '';
  const L = layout;
  const w = tabDigitsNum(L.width);
  const h = tabDigitsNum(L.height);
  const parts = [];
  for (let i = 0; i < L.strings; i += 1) {
    const y = tabDigitsNum(L.staffTop + i * L.lineGap);
    parts.push(`<line class="tab-digits-line" x1="1" y1="${y}" x2="${tabDigitsNum(w - 1)}" y2="${y}"></line>`);
  }
  L.positions.forEach((p) => {
    if (p.pause) {
      const y = tabDigitsNum(L.rhythmTop + 3);
      parts.push(`<line class="tab-digits-rest" x1="${tabDigitsNum(p.x - 4)}" y1="${y}" x2="${tabDigitsNum(p.x + 4)}" y2="${y}"></line>`);
      return;
    }
    p.digits.forEach((d) => {
      const y = tabDigitsNum(L.staffTop + d.string * L.lineGap);
      parts.push(`<rect class="tab-digits-halo" x="${tabDigitsNum(p.x - 5.5)}" y="${tabDigitsNum(y - 5.5)}" width="11" height="11" rx="2"></rect>`);
      parts.push(`<text class="tab-digits-digit${d.out ? ' is-out' : ''}" x="${tabDigitsNum(p.x)}" y="${y}" text-anchor="middle" dominant-baseline="central">${d.label}</text>`);
    });
  });
  L.positions.forEach((p) => {
    if (p.pause) return;
    parts.push(`<line class="tab-digits-stem" x1="${tabDigitsNum(p.x)}" y1="${tabDigitsNum(L.rhythmTop)}" x2="${tabDigitsNum(p.x)}" y2="${tabDigitsNum(L.stemBottom)}"></line>`);
  });
  L.beams.forEach((beam) => {
    const y = tabDigitsNum(L.rhythmTop + TAB_DIGITS_STEM_LEN - (beam.level - 1) * L.beamStep);
    parts.push(`<line class="tab-digits-beam" x1="${tabDigitsNum(beam.xs[0])}" y1="${y}" x2="${tabDigitsNum(beam.xs[beam.xs.length - 1])}" y2="${y}"></line>`);
  });
  L.beatLabels.forEach((b) => {
    parts.push(`<text class="tab-digits-beat" x="${tabDigitsNum(b.x)}" y="${tabDigitsNum(L.beatLabelY)}" text-anchor="middle">${b.text}</text>`);
  });
  return `<svg class="tab-digits-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${parts.join('')}</svg>`;
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

// Раскладка «не влезает в свою долю» → клетка уезжает на свою строку сетки
// (штатная авто-раскладка .square-inner). Решение считается из ширины сетки,
// а не из замера после перестановки: иначе ResizeObserver зациклился бы.
function tabDigitsFit(root) {
  const scope = root && root.querySelectorAll ? root : document;
  const cards = scope.querySelectorAll('.tab-insert--digits[data-tab-digits-w]');
  if (!cards || !cards.length) return;
  cards.forEach((card) => {
    const need = Number(card.getAttribute('data-tab-digits-w')) || 0;
    if (!(need > 0)) return;
    const wrap = card.closest ? card.closest('.chord-wrapper--tab') : null;
    if (wrap) {
      const inner = wrap.parentElement;
      if (!inner || !inner.style || !inner.style.gridTemplateColumns) return;
      const total = Number((/repeat\((\d+)/.exec(inner.style.gridTemplateColumns) || [])[1]) || 0;
      if (!(total > 0)) return;
      const span = Math.max(
        1,
        Number(wrap.dataset.tabSpan) ||
          Number((/span\s+(\d+)/.exec(wrap.style.gridColumn || '') || [])[1]) ||
          1,
      );
      const gap = typeof SQUARE_GRID_GAP === 'number' ? SQUARE_GRID_GAP : 2;
      const usable = inner.clientWidth - (total - 1) * gap;
      if (!(usable > 0)) return;
      const own = Math.max(0, usable * (span / total) + (span - 1) * gap);
      const forced = wrap.dataset.tabDigitsRow === '1';
      if (own + 0.5 < need && !forced) {
        wrap.style.gridColumn = '1 / -1';
        wrap.dataset.tabDigitsRow = '1';
      } else if (own + 0.5 >= need && forced) {
        wrap.style.gridColumn = 'span ' + span;
        delete wrap.dataset.tabDigitsRow;
      }
      return;
    }
    // Отдельная строка таба: сетка из одной колонки, расти может только сам
    // квадрат — он и растягивается до нужной ширины (не больше своей строки).
    const inner = card.closest ? card.closest('.square-inner') : null;
    const host = inner && inner.parentElement;
    if (!inner || !host) return;
    const cap = host.clientWidth;
    if (!(cap > 0)) return;
    const pct = Number(String(inner.style.width || '').replace('%', '')) || 100;
    const natural = (cap * pct) / 100;
    const target = Math.min(need, cap);
    if (natural + 0.5 < target) inner.style.minWidth = Math.round(target) + 'px';
    else if (inner.style.minWidth) inner.style.minWidth = '';
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

function renderTabInsertHtml(sec, sq, parentTs, interactive = true, cellOpts = null) {'''

rep('function renderTabInsertHtml(sec, sq, parentTs, interactive = true, cellOpts = null) {', DIGITS_JS)

# =====================================================================
# 2. renderTabInsertHtml: выбор движка, подпись, tooltip, разметка
# =====================================================================
rep(
    "  const durationText = `${count} ${noteWord} · ${lenLabel}`;\n",
    "  const durationText = `${count} ${noteWord} · ${lenLabel}`;\n"
    "  // 0.877: в редакторе песни стан рисуем сами («Только цифры»). alphaTab\n"
    "  // остаётся в Ленте (там места хватает и нужны «и/та») и в окне редактора\n"
    "  // вставки — оно передаёт engine: 'alphatab'.\n"
    "  const useDigits = !(cellOpts && (cellOpts.inTimeline || cellOpts.engine === 'alphatab'));\n"
    "  const beatOffset = (cellOpts && Number(cellOpts.beatOffset)) || 0;\n"
    "  const digits = useDigits ? tabDigitsLayout(notes, beats, effTs, domain, { beatOffset }) : null;\n"
    "  const digitsSvg = digits ? tabDigitsSvgMarkup(digits) : '';\n"
    "  const digitsWidth = digits && !digits.empty ? Math.round(digits.minWidth) : 0;\n"
    "  const spanText = tabDigitsSpanText(beats, beatsPerBar, beatOffset, isCell);\n"
    "  const shortText = count ? `${count} н. · ${lenLabel}` : 'нет нот';\n",
)

rep(
    "  const tabRuler = thumbSpec\n",
    "  const tabRuler = !useDigits && thumbSpec\n",
)

OLD_RETURN = '''  return `<div class="tab-insert${isCell ? ' tab-insert--cell' : ''}${domain.instrument === 'ukulele' ? ' tab-insert--uke' : ''}${foreignInsert ? ' is-foreign' : ''}" data-sec="${sec.id}" data-square="${sq.id}" data-ei="${ei}" ` +
    (canEdit ? `onclick="if(typeof isResizing==='undefined'||!isResizing){event.stopPropagation();${openCall}}" ` : '') + `title="${durationText}${foreignInsert ? ' · ' + (domain.instrument === 'ukulele' ? 'укулеле' : 'гитара') + ': другая дорожка' : ''}">` +
    `<div class="tab-insert-heading"><strong class="tab-insert-label">TAB</strong><span class="tab-insert-count">${durationText}</span></div>` +
    `<div class="tab-insert-body"${thumbSpec ? ` data-tab-thumb="${thumbSpec}"${outFret ? ' data-tab-out-fret="1"' : ''}` : ''}>` +
    (thumbSpec
      ? '<span class="tab-thumb-wait">TAB · ' + count + ' ' + noteWord + '</span>'
      : '<span class="tab-insert-empty">Нет нот</span>') +
    '</div>' +
    tabRuler + resizeHandle + '</div>';'''

NEW_RETURN = '''  const foreignNote = foreignInsert ? ' · ' + (domain.instrument === 'ukulele' ? 'укулеле' : 'гитара') + ': другая дорожка' : '';
  const titleText = (useDigits ? spanText + ' · ' : '') + durationText + foreignNote;
  const cardClass = 'tab-insert' + (isCell ? ' tab-insert--cell' : '') +
    (domain.instrument === 'ukulele' ? ' tab-insert--uke' : '') +
    (foreignInsert ? ' is-foreign' : '') + (useDigits ? ' tab-insert--digits' : '');
  const bodyClass = 'tab-insert-body' + (useDigits ? ' tab-insert-body--digits' : '');
  const bodyInner = useDigits
    ? (digitsSvg || '<span class="tab-insert-empty">Нет нот</span>')
    : (thumbSpec
      ? '<span class="tab-thumb-wait">TAB · ' + count + ' ' + noteWord + '</span>'
      : '<span class="tab-insert-empty">Нет нот</span>');
  // Состав нот остаётся в data-tab-thumb у обеих карточек: по нему меряют
  // переносы и тесты. Рисует ли alphaTab — решает класс карточки.
  return `<div class="${cardClass}" data-sec="${sec.id}" data-square="${sq.id}" data-ei="${ei}"` +
    (useDigits ? ` data-tab-digits-w="${digitsWidth}" aria-label="${titleText}"` : '') + ' ' +
    (canEdit ? `onclick="if(typeof isResizing==='undefined'||!isResizing){event.stopPropagation();${openCall}}" ` : '') + `title="${titleText}">` +
    `<div class="tab-insert-heading"><strong class="tab-insert-label">TAB</strong><span class="tab-insert-count">${useDigits ? shortText : durationText}</span></div>` +
    `<div class="${bodyClass}"${thumbSpec ? ` data-tab-thumb="${thumbSpec}"${outFret ? ' data-tab-out-fret="1"' : ''}${useDigits ? ' data-tab-digits="1"' : ''}` : ''}>` +
    bodyInner +
    '</div>' +
    tabRuler + resizeHandle + '</div>';'''

rep(OLD_RETURN, NEW_RETURN)

# =====================================================================
# 3. Ячейка: без мелкой линейки, с номером доли для крупных подписей
# =====================================================================
rep(
    '''  return `<div class="chord-wrapper chord-wrapper--tab" style="grid-column:span ${effectiveSpan};" data-sec="${sec.id}" data-square="${sq.id}" data-ei="${ei}" onclick="''',
    '''  // 0.877: клетка таба больше не держит мелкую линейку «1 1 и 2 2 та и та» —
  // крупные номера долей рисует сам стан. data-tab-span нужен раскладке:
  // если стан шире своей доли, клетка уезжает на свою строку сетки.
  return `<div class="chord-wrapper chord-wrapper--tab" style="grid-column:span ${effectiveSpan};" data-tab-span="${effectiveSpan}" data-sec="${sec.id}" data-square="${sq.id}" data-ei="${ei}" onclick="''',
)

rep(
    '''      ${renderTabInsertHtml(sec, sq, parentTs, true, { isCell: true, ei, event: ev })}
    </div>
    <div class="chord-ticks" aria-hidden="true" style="${buildInnerTicks(beats, epochOwnOffset, '--color-tick-line', 1, effectiveSpan, { ownOffset: epochOwnOffset, unitScale: epochUnitScale })}"></div>
    <div class="chord-ticks-step" aria-hidden="true" style="${buildInnerTicks(beats, epochOwnOffset, '--color-tick-substep', subdiv, effectiveSpan, { ownOffset: epochOwnOffset, unitScale: epochUnitScale })}"></div>
    <div class="chord-counts" aria-hidden="true">${buildInnerCounts(beats, epochOwnOffset, subdiv, effectiveSpan, epochBeatsPerBar, { ownOffset: epochOwnOffset, unitScale: epochUnitScale })}</div>
''',
    '''      ${renderTabInsertHtml(sec, sq, parentTs, true, { isCell: true, ei, event: ev, beatOffset: epochOwnOffset })}
    </div>
''',
)

# Живая перерисовка ячейки при перетаскивании границы: тот же набор полей.
rep(
    "        if (contentEl) contentEl.innerHTML = renderTabInsertHtml(sec, sq, parentTs, true, { isCell: true, ei: i, event: ev });",
    "        if (contentEl) contentEl.innerHTML = renderTabInsertHtml(sec, sq, parentTs, true, { isCell: true, ei: i, event: ev, beatOffset: epochOwnOffset });",
)

# Живая раскладка: доля клетки в колонках меняется — запоминаем её для формулы.
rep(
    "      cw.style.gridColumn = `span ${Math.max(1, liveDist.spans[i])}`;",
    "      cw.style.gridColumn = `span ${Math.max(1, liveDist.spans[i])}`;\n      cw.dataset.tabSpan = String(Math.max(1, liveDist.spans[i]));",
)

# =====================================================================
# 4. Окно редактора вставки остаётся на alphaTab
# =====================================================================
rep(
    '''      <div class="tab-editor-preview">${renderTabInsertHtml(sec, editor.draft, ts, false)}</div>''',
    '''      <div class="tab-editor-preview">${renderTabInsertHtml(sec, editor.draft, ts, false, { engine: 'alphatab' })}</div>''',
)

# =====================================================================
# 5. Миниатюра alphaTab не трогает карточки «Только цифры»
# =====================================================================
rep(
    '''  list.forEach((el) => {
    let spec = null;''',
    '''  list.forEach((el) => {
    // 0.877: карточка «Только цифры» рисует свой стан; задание alphaTab
    // лежит в ней только как состав нот (его читают переносы и тесты).
    if (el.hasAttribute && el.hasAttribute('data-tab-digits')) return;
    let spec = null;''',
)

# =====================================================================
# 6. Пересчёт ширины: после рендера, на ресайз и на изменение сетки
# =====================================================================
rep(
    '''  const run = () => {
    tabThumbScanQueued = false;
    tabThumbScan(document);
  };''',
    '''  const run = () => {
    tabThumbScanQueued = false;
    tabThumbScan(document);
    // 0.877: ширина «цифрового» стана зависит от замера сетки — считаем
    // сразу после того, как карточки попали в документ.
    try { tabDigitsFit(document); } catch (_) {}
  };''',
)

rep(
    '''window.addEventListener('resize', invalidateChordWrapperRects);''',
    '''window.addEventListener('resize', invalidateChordWrapperRects);
// 0.877: доля времени в пикселях меняется вместе с окном — стан может
// перестать влезать в свою клетку (или снова начать влезать).
window.addEventListener('resize', tabDigitsScheduleFit, { passive: true });''',
)

rep(
    '''  const chordLayoutObserver = new ResizeObserver(() => {
    invalidateChordWrapperRects();''',
    '''  const chordLayoutObserver = new ResizeObserver(() => {
    invalidateChordWrapperRects();
    // Решение о переносе клетки считается из ширины сетки, без временных
    // перестановок, поэтому наблюдатель не может зациклиться.
    tabDigitsScheduleFit();''',
)

# =====================================================================
# 7. CSS нового стана
# =====================================================================
DIGITS_CSS = '''.tab-insert-body.is-unavailable .tab-thumb-wait { opacity: 0.45; }
/* ===== 0.877: «Только цифры» — свой стан вместо alphaTab =====
   В клетке из двух долей alphaTab не помещался: ключ TAB и размер съедали
   половину ширины, шестнадцатые слипались, счёт налезал. Здесь свой стан:
   тонкие линии струн, цифры ладов на них, чёрточки ритма и крупные номера
   долей. Лента и окно редактора вставки остаются на alphaTab. */
.tab-insert--digits { --tab-digit-halo: var(--color-background-secondary); }
.tab-insert--digits.tab-insert--cell {
  --tab-digit-halo: color-mix(in srgb, var(--color-accent) 4%, var(--color-background-secondary));
  padding-bottom: 0.4375rem;
}
.chord-wrapper--tab:hover .tab-insert--digits.tab-insert--cell {
  --tab-digit-halo: color-mix(in srgb, var(--color-accent) 8%, var(--color-background-secondary));
}
.tab-insert--digits .tab-insert-heading { align-items: flex-start; flex-wrap: wrap; gap: 0.125rem 0.375rem; }
/* Подпись больше не режется троеточием: короткая форма «4 н. · 2 доли»
   может лечь во вторую строку заголовка. */
.tab-insert--digits .tab-insert-count {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  line-height: 1.15;
  text-align: right;
  margin-left: auto;
}
.tab-insert--digits.tab-insert--cell .tab-insert-count { font-size: 0.625rem; }
.tab-insert-body--digits { display: flex; align-items: center; justify-content: center; }
.tab-insert-body--digits .tab-insert-empty { position: static; }
/* Стан держит натуральный размер (24 px на позицию) и сжимается только
   тогда, когда места нет даже на всю строку — тогда цифры не налезают,
   а уменьшаются вместе со станом. */
.tab-insert-body--digits .tab-digits-svg {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  margin: auto;
}
.tab-digits-line { stroke: currentColor; stroke-width: 1; opacity: 0.4; }
.tab-digits-halo { fill: var(--tab-digit-halo); }
.tab-digits-digit {
  fill: currentColor;
  font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.tab-digits-digit.is-out { fill: var(--color-danger); }
.tab-digits-stem,
.tab-digits-beam { stroke: currentColor; stroke-width: 1.1; stroke-linecap: round; opacity: 0.85; }
.tab-digits-rest { stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; opacity: 0.6; }
.tab-digits-beat {
  fill: var(--color-text-secondary);
  font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}'''

rep('.tab-insert-body.is-unavailable .tab-thumb-wait { opacity: 0.45; }', DIGITS_CSS)

open(PATH, 'w', encoding='utf-8').write(src)
print('STRUCHORD.html: %d -> %d (%+d)' % (before_len, len(src), len(src) - before_len))

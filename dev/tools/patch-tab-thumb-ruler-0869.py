#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""0.869: линейка долей таб-миниатюры — по реальным координатам alphaTab.

Проблема А: миниатюра `.tab-insert` показывала только первый такт. alphaTab
в страничной раскладке переносит такты на новые строки и каждую строку отдаёт
ОТДЕЛЬНЫМ <svg>, а клетка брала первый найденный. Теперь все такты вставки
печатаются в одной строке (barsPerRow = число тактов), а из «мастерской»
берётся самый большой рисунок — служебная подпись alphaTab отбрасывается.

Проблема Б: ключ TAB и размер слева сдвигают стан на 60–70 px, а такты
alphaTab растягивает неравномерно, поэтому равномерная сетка карточки
(`buildInnerTicks`/`buildInnerCounts`) уезжала от нот на 1–3 доли. Теперь
числа и засечки строятся по visualBounds долей из alphaTab — та же геометрия,
что и у самих нот, поэтому нота стоит ровно под своим счётом.

Только точные замены с проверкой числа вхождений.
"""
import io
import sys

PATH = 'STRUCHORD.html'


def rep(text, old, new, count=1, label=''):
    n = text.count(old)
    if n != count:
        sys.exit('FAIL %s: expected %d, found %d for %r' % (label, count, n, old[:110]))
    return text.replace(old, new)


with io.open(PATH, encoding='utf-8') as f:
    html = f.read()
size0 = len(html.encode('utf-8'))

# --------------------------------------------------------------------------
# 1. Разметка карточки: места под линейку вместо равномерной сетки.
# --------------------------------------------------------------------------
old_markup = """  const subdiv = Math.round(1 / (typeof getResizeStep === 'function' ? getResizeStep() : 1));
  const fullRowRuler = (!isCell && interactive && !cellOpts?.inTimeline && typeof buildInnerTicks === 'function' && typeof buildInnerCounts === 'function')
    ? `<div class="chord-ticks" aria-hidden="true" style="${buildInnerTicks(beats, 0, '--color-tick-line', 1, Math.max(1, Math.round(beats * 4)))}"></div>` +
      `<div class="chord-ticks-step" aria-hidden="true" style="${buildInnerTicks(beats, 0, '--color-tick-substep', subdiv, Math.max(1, Math.round(beats * 4)))}"></div>` +
      `<div class="chord-counts" aria-hidden="true">${buildInnerCounts(beats, 0, subdiv, Math.max(1, Math.round(beats * 4)), beatsPerBar)}</div>` +
      `<div class="square-resize-handle" data-sec="${sec.id}" data-square="${sq.id}"></div>`
    : '';
"""
new_markup = """  // 0.869: своя линейка счёта — в строке редактора, в ячейке между аккордами
  // и в Ленте. Разметку строим заранее, а координаты чисел приходят вместе с
  // картинкой (tabThumbRender): равномерная сетка карточки не совпадала с
  // нотами, потому что ключ TAB и размер слева сдвигают стан на 60–70 px,
  // а такты alphaTab растягивает неравномерно.
  const tabRuler = thumbSpec
    ? '<div class="chord-ticks" aria-hidden="true" data-tab-ticks></div>' +
      '<div class="chord-ticks-step" aria-hidden="true" data-tab-subticks></div>' +
      '<div class="chord-counts" aria-hidden="true" data-tab-counts></div>'
    : '';
  const resizeHandle = (!isCell && interactive && !cellOpts?.inTimeline)
    ? `<div class="square-resize-handle" data-sec="${sec.id}" data-square="${sq.id}"></div>`
    : '';
"""
html = rep(html, old_markup, new_markup, 1, 'renderTabInsertHtml/ruler markup')

html = rep(
    html,
    """    fullRowRuler + '</div>';""",
    """    tabRuler + resizeHandle + '</div>';""",
    1,
    'renderTabInsertHtml/return',
)

# --------------------------------------------------------------------------
# 2. Новые функции: координаты долей и сборка линейки.
# --------------------------------------------------------------------------
helpers = """
// 0.869: где alphaTab нарисовал каждую долю. Линейка миниатюры считается по
// этим координатам, а не по ширине карточки: только так нота и её счёт
// оказываются на одной вертикали.
function tabThumbBeatAnchors(built) {
  const api = tabThumbApi, lb = api && api.boundsLookup;
  const out = [];
  if (!built || !built.beatInfo || !lb || !Array.isArray(lb.staffSystems)) return out;
  const layout = built.layout || {};
  const denom = Number(layout.denom) || parseTimeSig((layout && layout.timeSig) || globalTimeSig).denominator;
  for (const sys of lb.staffSystems) {
    for (const sb of (sys.bars || [])) {
      for (const barBounds of (sb.bars || [])) {
        for (const bb of (barBounds.beats || [])) {
          const info = bb.beat && built.beatInfo.get(bb.beat);
          const vb = bb.visualBounds;
          if (!info || !vb || !(info.d > 0)) continue;
          const dur = tabInsertNoteDuration({
            dur: denom / info.d,
            dots: info.dots || 0,
            triplet: info.triplet === true,
          });
          if (!(dur > 1e-9)) continue;
          out.push({
            start: info.start,
            dur,
            x0: vb.x,
            x1: vb.x + vb.w,
            bar: info.bar,
            placeholder: !!info.placeholder,
          });
        }
      }
    }
  }
  return out;
}

// Чистая арифметика линейки: узлы метрической сетки -> x в пикселях картинки.
// Вынесена отдельно, чтобы проверяться тестом без DOM и без alphaTab.
function tabThumbRulerMarks(anchors, totalBeats, stepsPerBeat, beatsPerBar) {
  const list = (Array.isArray(anchors) ? anchors : [])
    .filter((a) => a && a.dur > 1e-9 && Number.isFinite(a.x0) && Number.isFinite(a.x1))
    .slice()
    .sort((a, b) => a.start - b.start);
  if (!list.length || !(totalBeats > 0)) return [];
  // Полностью пустой такт (хвост вставки) не подписываем: целая пауза-заглушка
  // занимает в раскладке в разы меньше места, чем настоящий такт, и четыре
  // цифры встали бы в одну точку.
  const bars = new Map();
  list.forEach((a) => {
    const prev = bars.get(a.bar);
    bars.set(a.bar, prev === undefined ? !!a.placeholder : prev && !!a.placeholder);
  });
  const steps = Math.max(1, Math.round(stepsPerBeat || 1));
  const step = 1 / steps;
  const barBeats = Math.max(1, Math.round(beatsPerBar || 4));
  const out = [];
  for (let idx = 0; idx * step < totalBeats - 1e-9; idx++) {
    const node = Math.round(idx * step * 1e9) / 1e9;
    let anchor = null;
    for (const a of list) {
      if (node >= a.start - 1e-9 && node < a.start + a.dur - 1e-9) { anchor = a; break; }
    }
    if (!anchor || bars.get(anchor.bar)) continue;
    const frac = Math.min(1, Math.max(0, (node - anchor.start) / anchor.dur));
    const x = anchor.x0 + frac * (anchor.x1 - anchor.x0);
    const sub = Math.round((node - Math.floor(node + 1e-6)) * steps) % steps;
    out.push({
      node,
      sub,
      x,
      isBeat: sub === 0,
      label: typeof countLabelFor === 'function'
        ? countLabelFor(node, sub, steps, barBeats)
        : (sub === 0 ? String((Math.round(node) % barBeats) + 1) : ''),
    });
  }
  return out;
}

// Засечки строятся тем же linear-gradient'ом, что и у аккордовых ячеек, только
// позиции берутся не из колонок грида, а в процентах от ширины картинки.
function tabThumbRulerGradient(fracs, colorVar) {
  const stops = [];
  for (const f of fracs) {
    if (!(f > 1e-6) || !(f < 1 - 1e-6)) continue;
    const pos = `calc(${(f * 100).toFixed(4)}%)`;
    stops.push(
      `transparent calc(${pos} - 1px),` +
        `var(${colorVar}) calc(${pos} - 1px),` +
        `var(${colorVar}) calc(${pos} + 1px),` +
        `transparent calc(${pos} + 1px)`,
    );
  }
  if (!stops.length) return '';
  return `background-image:linear-gradient(to right,transparent 0,${stops.join(',')},transparent 100%);`;
}

// Дробление счёта берём по самой мелкой доле вставки: восьмые подписываются
// «1 и 2 и», шестнадцатые — «1 та и та», триоли — «1 та ти». Это тот же счёт,
// что читает лента.
function tabThumbRulerSteps(anchors) {
  let minDur = 0;
  for (const a of anchors) if (!minDur || a.dur < minDur) minDur = a.dur;
  if (!(minDur > 1e-9)) return 1;
  let steps = Math.max(1, Math.min(4, Math.round(1 / minDur)));
  if (anchors.some((a) => a.dur * 3 > 1.999 && a.dur * 3 < 2.001)) steps = Math.max(steps, 3);
  return steps;
}

function tabThumbRulerHtml(built, spec, width, offsetLeft) {
  const anchors = tabThumbBeatAnchors(built);
  const w = Number(width) > 0 ? Number(width) : 320;
  // Картинка кадрируется слева (ключ TAB и размер), поэтому доли считаются
  // в координатах уже обрезанного рисунка.
  const off = Math.max(0, Math.min(Number(offsetLeft) || 0, Math.max(0, w - 24)));
  const span = Math.max(1, w - off);
  const sig = spec && spec.t ? spec.t : globalTimeSig;
  const beatsPerBar = Math.max(1, Math.round(getGridUnitsPerBar(sig)));
  const steps = tabThumbRulerSteps(anchors);
  const totalBeats = Number(spec && spec.b) || 0;
  const marks = tabThumbRulerMarks(anchors, totalBeats, steps, beatsPerBar)
    .map((m) => Object.assign(m, { frac: Math.min(1, Math.max(0, (m.x - off) / span)) }));
  const counts = marks
    .filter((m) => m.label)
    .map((m) => {
      const cls = 'chord-count' + (m.isBeat ? ' is-beat' : '') +
        (m.label === '1' ? ' is-downbeat' : '') + (m.x - off < 10 ? ' is-edge' : '');
      return `<span class="${cls}" style="left:${(m.frac * 100).toFixed(4)}%">${m.label}</span>`;
    })
    .join('');
  return {
    ticks: tabThumbRulerGradient(marks.filter((m) => m.isBeat).map((m) => m.frac), '--color-tick-line'),
    subticks: steps > 1
      ? tabThumbRulerGradient(marks.filter((m) => !m.isBeat).map((m) => m.frac), '--color-tick-substep')
      : '',
    counts,
  };
}

// alphaTab отдаёт по <svg> на каждую часть рисунка, рядом лежит служебная
// подпись «Music engraving by alphaTab». Берём самый большой рисунок: в нём
// стан со всеми тактами вставки.
function tabThumbBigSvg(host) {
  let best = null, bestArea = 0;
  if (!host || !host.querySelectorAll) return best;
  host.querySelectorAll('svg').forEach((svg) => {
    const w = parseFloat(svg.getAttribute('width')) || 0;
    const h = parseFloat(svg.getAttribute('height')) || 0;
    if (w * h > bestArea) { best = svg; bestArea = w * h; }
  });
  return best;
}

"""
html = rep(
    html,
    "function tabThumbApply(el, html) {",
    helpers.lstrip('\n') + "function tabThumbApply(el, payload) {",
    1,
    'insert ruler helpers',
)

html = rep(
    html,
    """function tabThumbSvgForCell(svgEl, outFretList = '') {
  if (!svgEl) return '';
  const clone = svgEl.cloneNode(true);
  const w = parseFloat(svgEl.getAttribute('width')) || svgEl.getBoundingClientRect().width || 320;
  const h = parseFloat(svgEl.getAttribute('height')) || svgEl.getBoundingClientRect().height || 100;
  if (!(w > 0) || !(h > 0)) return '';
  clone.setAttribute('viewBox', `0 0 ${w} ${h}`);""",
    """function tabThumbSvgForCell(svgEl, outFretList = '', offsetLeft = 0) {
  if (!svgEl) return '';
  const clone = svgEl.cloneNode(true);
  const w = parseFloat(svgEl.getAttribute('width')) || svgEl.getBoundingClientRect().width || 320;
  const h = parseFloat(svgEl.getAttribute('height')) || svgEl.getBoundingClientRect().height || 100;
  if (!(w > 0) || !(h > 0)) return '';
  // 0.869: `offsetLeft` отрезает левую служебную зону — ключ TAB и размер.
  const x0 = Math.max(0, Math.min(Number(offsetLeft) || 0, Math.max(0, w - 24)));
  clone.setAttribute('viewBox', `${x0} 0 ${Math.max(1, w - x0)} ${h}`);""",
    1,
    'tabThumbSvgForCell/viewBox',
)

# --------------------------------------------------------------------------
# 3. Применение картинки вместе с линейкой.
# --------------------------------------------------------------------------
html = rep(
    html,
    """function tabThumbApply(el, payload) {
  if (!el || !el.isConnected) return;
  el.dataset.thumbDone = '1';
  el.innerHTML = `<div class="tab-thumb">${html}</div>`;
}""",
    """function tabThumbApply(el, payload) {
  if (!el || !el.isConnected || !payload || !payload.svg) return;
  el.dataset.thumbDone = '1';
  el.innerHTML = `<div class="tab-thumb">${payload.svg}</div>`;
  // Линейка — сосед картинки внутри карточки, а не её часть: картинка
  // перерисовывается целиком, линейка обновляется рядом.
  const card = el.closest ? el.closest('.tab-insert') : null;
  const root = card || el.parentElement || el;
  const ticks = root.querySelector('[data-tab-ticks]');
  if (ticks) ticks.setAttribute('style', payload.ticks || '');
  const subticks = root.querySelector('[data-tab-subticks]');
  if (subticks) subticks.setAttribute('style', payload.subticks || '');
  const counts = root.querySelector('[data-tab-counts]');
  if (counts) counts.innerHTML = payload.counts || '';
}""",
    1,
    'tabThumbApply',
)

# --------------------------------------------------------------------------
# 4. Очередь печати: картинка + линейка одним результатом.
# --------------------------------------------------------------------------
html = rep(
    html,
    """      let html = '';
      try {
        html = await tabThumbRender(job.spec, job.width);
      } catch (_) {
        html = '';
      }
      if (html) {
        TAB_THUMB_CACHE.set(job.key, html);
        job.els.forEach((el) => tabThumbApply(el, html));
      } else {""",
    """      let payload = null;
      try {
        payload = await tabThumbRenderPayload(job.spec, job.width);
      } catch (_) {
        payload = null;
      }
      if (payload && payload.svg) {
        TAB_THUMB_CACHE.set(job.key, payload);
        job.els.forEach((el) => tabThumbApply(el, payload));
      } else {""",
    1,
    'tabThumbFlush',
)

# --------------------------------------------------------------------------
# 5. Сброс линейки при смене темы.
# --------------------------------------------------------------------------
html = rep(
    html,
    """    delete el.dataset.thumbDone;
    el.classList.remove('is-unavailable');
    const word = notes.length === 1 ? 'нота' : notes.length >= 2 && notes.length <= 4 ? 'ноты' : 'нот';""",
    """    delete el.dataset.thumbDone;
    el.classList.remove('is-unavailable');
    const card = el.closest ? el.closest('.tab-insert') : null;
    if (card) {
      const ticks = card.querySelector('[data-tab-ticks]');
      if (ticks) ticks.removeAttribute('style');
      const subticks = card.querySelector('[data-tab-subticks]');
      if (subticks) subticks.removeAttribute('style');
      const counts = card.querySelector('[data-tab-counts]');
      if (counts) counts.innerHTML = '';
    }
    const word = notes.length === 1 ? 'нота' : notes.length >= 2 && notes.length <= 4 ? 'ноты' : 'нот';""",
    1,
    'tabThumbInvalidate',
)

# --------------------------------------------------------------------------
# 6. Рендер миниатюры: все такты в одной строке + выбор рисунка + линейка.
# --------------------------------------------------------------------------
html = rep(
    html,
    """  if (tabThumbApi.settings) {
    tabThumbApi.settings.display.startBar = 1;
    tabThumbApi.settings.display.barCount = built.barCount;
    tabThumbApi.settings.display.scale = scale;""",
    """  if (tabThumbApi.settings) {
    tabThumbApi.settings.display.startBar = 1;
    tabThumbApi.settings.display.barCount = built.barCount;
    // 0.869: все такты вставки печатаются в ОДНУ строку. Иначе alphaTab
    // переносил их на новые строки и отдавал каждую строку отдельным <svg>,
    // а клетка брала первый — «8 нот · 3 такта» показывала 4 ноты.
    tabThumbApi.settings.display.barsPerRow = built.barCount;
    tabThumbApi.settings.display.barCountPerPartial = Math.max(10, built.barCount);
    tabThumbApi.settings.display.scale = scale;""",
    1,
    'tabThumbRender/settings',
)

html = rep(
    html,
    """    try { tabThumbApi.updateSettings(); } catch (_) {}
  }
  await new Promise((resolve) => {""",
    """    try { tabThumbApi.updateSettings(); } catch (_) {}
  }
  // 0.869: «мастерская» копит по <svg> на каждую часть рисунка, поэтому
  // прежняя картинка от прошлой вставки доставалась следующей.
  if (tabThumbHost) tabThumbHost.querySelectorAll('svg').forEach((el) => el.remove());
  await new Promise((resolve) => {""",
    1,
    'tabThumbRender/clear host',
)

html = rep(
    html,
    """  const outList = built.gpOutFrets || [];
  const svgEl = tabThumbHost.querySelector('svg');
  tabThumbDropTailPlaceholders(svgEl, built);
  return tabThumbSvgForCell(svgEl, encodeURIComponent(JSON.stringify(outList)));""",
    """  const outList = built.gpOutFrets || [];
  const svgEl = tabThumbBigSvg(tabThumbHost);
  if (!svgEl) return null;
  tabThumbDropTailPlaceholders(svgEl, built);
  // 0.869: ключ TAB и обозначение размера занимают слева 60–70 px — в узкой
  // клетке это половина места, а в строке редактора первая нота уезжала под
  // 2–3-ю долю. Кадрируем служебную зону: стан начинается с первой доли.
  const anchors = tabThumbBeatAnchors(built);
  let offsetLeft = 0;
  if (anchors.length) {
    let first = Infinity;
    for (const a of anchors) if (a.x0 < first) first = a.x0;
    if (Number.isFinite(first) && first > 8) offsetLeft = first - 6;
  }
  const svgWidth = parseFloat(svgEl.getAttribute('width')) || width;
  const svg = tabThumbSvgForCell(svgEl, encodeURIComponent(JSON.stringify(outList)), offsetLeft);
  if (!svg) return null;
  const ruler = tabThumbRulerHtml(built, spec, svgWidth, offsetLeft);
  return { svg, ticks: ruler.ticks, subticks: ruler.subticks, counts: ruler.counts };""",
    1,
    'tabThumbRender/return',
)

html = rep(
    html,
    """async function tabThumbRender(spec, width) {
  // Печатаем в натуральную величину: alphaTab сам подгоняет такт под ширину""",
    """async function tabThumbRenderPayload(spec, width) {
  // Печатаем в натуральную величину: alphaTab сам подгоняет такт под ширину""",
    1,
    'tabThumbRender/rename payload',
)

# --------------------------------------------------------------------------
# 6b. Прежняя точка входа: снаружи ждут строку с картинкой.
# --------------------------------------------------------------------------
html = rep(
    html,
    """function tabThumbApply(el, payload) {""",
    """// 0.869: прежняя точка входа отдаёт только картинку — на неё опираются
// сторонние проверки (b12-tab-gp8-0692) и старый код очереди печати.
async function tabThumbRender(spec, width) {
  const payload = await tabThumbRenderPayload(spec, width);
  return payload ? payload.svg : '';
}

function tabThumbApply(el, payload) {""",
    1,
    'tabThumbRender/compat wrapper',
)

# --------------------------------------------------------------------------
# 7. Лента: у таб-клетки своя линейка — общий равномерный счёт не дублируем.
# --------------------------------------------------------------------------
html = rep(
    html,
    """    const div = keysActive ? keysSubdiv : (pattern ? Math.max(1, pattern.subdivision || 1) : 1);
    const beatsPerBar = getGridUnitsPerBar(parentTs);""",
    """    const div = keysActive ? keysSubdiv : (pattern ? Math.max(1, pattern.subdivision || 1) : 1);
    // 0.869: у таб-клетки свой счёт — он приходит вместе с картинкой alphaTab
    // и стоит ровно под нотами. Равномерный счёт общей дорожки здесь только
    // спорил с нотами, поэтому таб-клетку он пропускает.
    if (ev.isTab) return;
    const beatsPerBar = getGridUnitsPerBar(parentTs);""",
    1,
    'renderRhythmTrack/tab skip',
)

# --------------------------------------------------------------------------
# 8. Лента: место под счёт внутри таб-клетки.
# --------------------------------------------------------------------------
html = rep(
    html,
    """.tl-cell--tab .tab-insert { border-radius: 0; padding-bottom: 0.5rem; }""",
    """/* 0.869: в таб-клетке ленты появился свой счёт долей — под него нужна та же
   нижняя полоса, что у карточки в редакторе (0.25rem под цифры + запас). */
.tl-cell--tab .tab-insert { border-radius: 0; padding-bottom: 1.25rem; }""",
    1,
    'css timeline padding',
)

with io.open(PATH, 'w', encoding='utf-8') as f:
    f.write(html)

size1 = len(html.encode('utf-8'))
print('OK %d -> %d (%+d)' % (size0, size1, size1 - size0))

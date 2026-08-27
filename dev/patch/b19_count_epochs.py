#!/usr/bin/env python3
# B-19 (2026-08-26): счётные подписи по эпохам размера. Спека пользователя
# (дословно): «если в ячейке меняется размер(timesig), счет на ней должен
# начинаться заново пример: 1и2и|1и2и3и4и (первая ячейка в размере2/2
# вторая 4/4)». Решение ask_user — epoch_all: перезапуск при любой смене
# эффективного размера (включая возврат к родительскому); подписи идут по
# размеру эпохи; следующие такты рестартируют каждый такт; область —
# редактор ячеек (лента — отдельно в B-09). Идемпотентно по маркеру epochTs.
import io, sys

P = '/home/user/STRUCHORD.html'
with io.open(P, encoding='utf-8', errors='surrogateescape') as f:
    c = f.read()

if 'Счётные эпохи размера (B-19' in c:
    print('SKIP: патч B-19 уже применён (маркер на месте)')
    sys.exit(0)

reps = []

# --- 1. buildInnerCounts: ось счёта отделяется от визуальной оси ------------
reps.append((
"""function buildInnerCounts(spanBeats, offsetBeats, subdivide, cellCols, beatsPerBar) {
  const C = Math.max(1, Math.round(cellCols || spanBeats));
  const div = Math.max(1, Math.round(subdivide || 1));
  const step = 1 / div;
  const gap = SQUARE_GRID_GAP;
  if (!(spanBeats > 0)) return '';
  const colsPerBeat = C / spanBeats;
  const colW = `((100% - ${((C - 1) * gap).toFixed(3)}px) / ${C})`;
  const out = [];
  const firstNode = Math.ceil((offsetBeats - 1e-6) / step) * step;
  for (let node = firstNode; node < offsetBeats + spanBeats - 1e-6; node += step) {
    const j = node - offsetBeats;""",
"""// B-19 (epoch_all, 2026-08-26): шестой параметр epoch — { ownOffset,
// unitScale }. Счёт идёт в СОБСТВЕННЫХ единицах эпохи размера (ячейка 2/2
// внутри 4/4 считает своими долями «1 и 2 и», а не четвертной сеткой
// родителя; unitScale = ownDenom / parentDenom), позиции переводим обратно
// на визуальную ось. Без epoch ось оффсета = ось счёта (поведение прошлых
// волн бит-в-бит).
function buildInnerCounts(spanBeats, offsetBeats, subdivide, cellCols, beatsPerBar, epoch) {
  const C = Math.max(1, Math.round(cellCols || spanBeats));
  const div = Math.max(1, Math.round(subdivide || 1));
  const step = 1 / div;
  const gap = SQUARE_GRID_GAP;
  if (!(spanBeats > 0)) return '';
  const unitScale = epoch && epoch.unitScale ? epoch.unitScale : 1;
  const ownOff = epoch ? (epoch.ownOffset || 0) : offsetBeats * unitScale;
  const ownSpan = spanBeats * unitScale;
  const colsPerBeat = C / spanBeats;
  const colW = `((100% - ${((C - 1) * gap).toFixed(3)}px) / ${C})`;
  const out = [];
  const firstNode = Math.ceil((ownOff - 1e-6) / step) * step;
  for (let node = firstNode; node < ownOff + ownSpan - 1e-6; node += step) {
    const j = (node - ownOff) / unitScale;"""))

# --- 2. Рендер ячеек: эпохи вместо сквозного оффсета -------------------------
reps.append((
"""      // Сколько долей прошло от начала квадрата до текущей ячейки —
      // по этому смещению подписи счёта внутри ячейки встают на узлы
      // ОБЩЕЙ сетки, а не отсчитываются от собственного края. Иначе
      // после затакта в пол-доли вся разметка ячейки уезжала.
      let tickOffsetBeats = 0;
      sq.events.forEach((ev, ei) => {
        const effectiveSpan = effectiveSpans[ei];""",
"""      // Счётные эпохи размера (B-19, решение epoch_all, ask_user
      // 2026-08-26): серия ячеек с одинаковым ЭФФЕКТИВНЫМ timesig ведёт
      // общий счёт по её размеру; ячейка с другим размером открывает
      // НОВУЮ эпоху — счёт заново с «1» и нумерацией по её такту (спека
      // пользователя, дословно: «1и2и|1и2и3и4и — первая ячейка в
      // размере2/2 вторая 4/4»). Возврат к родительскому размеру — тоже
      // смена эпохи. Начало квадрата зануляет отсчёт (квадраты
      // целотактные, так было и раньше). Затактное смещение внутри эпохи
      // живёт по-старому: оффсет копится в собственных единицах эпохи.
      let epochTs = null;
      let epochOwnOffset = 0;
      let epochBeatsPerBar = beatsPerBar;
      let epochUnitScale = 1;
      sq.events.forEach((ev, ei) => {
        const evTsEff = ev.timeSig || parentTs;
        if (evTsEff !== epochTs) {
          epochTs = evTsEff;
          epochOwnOffset = 0;
          epochBeatsPerBar = getGridUnitsPerBar(evTsEff);
          epochUnitScale = parseTimeSig(evTsEff).denominator
            / (parseTimeSig(parentTs).denominator || 1);
        }
        const effectiveSpan = effectiveSpans[ei];"""))

reps.append((
"""          <div class="chord-counts" aria-hidden="true">${buildInnerCounts(getEventVisualSpanInParentUnits(ev, parentTs), tickOffsetBeats, Math.round(1 / getResizeStep()), effectiveSpan, beatsPerBar)}</div>""",
"""          <div class="chord-counts" aria-hidden="true">${buildInnerCounts(getEventVisualSpanInParentUnits(ev, parentTs), epochOwnOffset, Math.round(1 / getResizeStep()), effectiveSpan, epochBeatsPerBar, { ownOffset: epochOwnOffset, unitScale: epochUnitScale })}</div>"""))

reps.append((
"""        tickOffsetBeats += getEventVisualSpanInParentUnits(ev, parentTs);
      });""",
"""        epochOwnOffset += ev.span || 1; // собственные единицы эпохи
      });"""))

# --- 3. Зум (refreshStepTicksForCard): те же эпохи ----------------------------
reps.append((
"""      const dist = distributeVisualSpans(sq.events, parentTs);
      let offset = 0;
      inner.querySelectorAll('.chord-wrapper').forEach((cw, ei) => {
        const ev = sq.events[ei];
        if (!ev) return;
        const beats = getEventVisualSpanInParentUnits(ev, parentTs);""",
"""      const dist = distributeVisualSpans(sq.events, parentTs);
      // B-19: те же эпохи, что в render(), — зум меняет лишь плотность.
      let epochTs = null;
      let epochOwnOffset = 0;
      let epochUnitScale = 1;
      inner.querySelectorAll('.chord-wrapper').forEach((cw, ei) => {
        const ev = sq.events[ei];
        if (!ev) return;
        const evTsEff = ev.timeSig || parentTs;
        if (evTsEff !== epochTs) {
          epochTs = evTsEff;
          epochOwnOffset = 0;
          epochUnitScale = parseTimeSig(evTsEff).denominator
            / (parseTimeSig(parentTs).denominator || 1);
        }
        const beats = getEventVisualSpanInParentUnits(ev, parentTs);"""))

reps.append((
"""          countsEl.innerHTML = buildInnerCounts(
            beats,
            offset,
            subdivide,
            dist.spans[ei],
            getGridUnitsPerBar(parentTs)
          );
        }
        offset += beats;""",
"""          countsEl.innerHTML = buildInnerCounts(
            beats,
            epochOwnOffset,
            subdivide,
            dist.spans[ei],
            getGridUnitsPerBar(evTsEff),
            { ownOffset: epochOwnOffset, unitScale: epochUnitScale }
          );
        }
        epochOwnOffset += ev.span || 1;"""))

# --- 4. Лайв-ресайз: те же эпохи ---------------------------------------------
reps.append((
"""  const subdiv = Math.round(1 / getResizeStep());
  const barUnits = getGridUnitsPerBar(parentTs);
  let liveOffset = 0;
  for (let i = 0; i < ec; i++) {
    const cw = bi.querySelector(`.chord-wrapper[data-ei="${i}"]`);
    const beats = getEventVisualSpanInParentUnits(sq.events[i], parentTs);""",
"""  const subdiv = Math.round(1 / getResizeStep());
  // B-19: те же эпохи, что в render(), — иначе по дороге подписи 4/4
  // проскакивали бы на ячейку 2/2 (или наоборот).
  let epochTs = null;
  let epochOwnOffset = 0;
  let epochBeatsPerBar = getGridUnitsPerBar(parentTs);
  let epochUnitScale = 1;
  for (let i = 0; i < ec; i++) {
    const cw = bi.querySelector(`.chord-wrapper[data-ei="${i}"]`);
    const evL = sq.events[i];
    const evTsEff = (evL && evL.timeSig) || parentTs;
    if (evTsEff !== epochTs) {
      epochTs = evTsEff;
      epochOwnOffset = 0;
      epochBeatsPerBar = getGridUnitsPerBar(evTsEff);
      epochUnitScale = parseTimeSig(evTsEff).denominator
        / (parseTimeSig(parentTs).denominator || 1);
    }
    const beats = getEventVisualSpanInParentUnits(sq.events[i], parentTs);"""))

reps.append((
"""      const countsEl = cw.querySelector('.chord-counts');
      if (countsEl) {
        countsEl.innerHTML = buildInnerCounts(
          beats, liveOffset, subdiv, liveDist.spans[i], barUnits);
      }
    }
    liveOffset += beats;""",
"""      const countsEl = cw.querySelector('.chord-counts');
      if (countsEl) {
        countsEl.innerHTML = buildInnerCounts(
          beats, epochOwnOffset, subdiv, liveDist.spans[i], epochBeatsPerBar,
          { ownOffset: epochOwnOffset, unitScale: epochUnitScale });
      }
    }
    epochOwnOffset += (sq.events[i] && sq.events[i].span) || 1;"""))

fail = 0
for old, new in reps:
    n = c.count(old)
    if n != 1:
        print('FAIL: якорь встречается %d раз (нужен 1): %s...' % (n, old[:70].replace('\n', ' | ')))
        fail += 1
        continue
    c = c.replace(old, new, 1)

if fail:
    print('Патч НЕ применён: %d якорей не совпали' % fail)
    sys.exit(1)

with io.open(P, 'w', encoding='utf-8', errors='surrogateescape') as f:
    f.write(c)
print('OK: патч B-19 применён, якорей: %d' % len(reps))

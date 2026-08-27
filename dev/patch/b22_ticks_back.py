#!/usr/bin/env python3
# B-22 (2026-08-26): возврат засечек под подписи счёта. Спека пользователя
# (дословно): «пусть под цифрами все таки будут невысокие засечки.
# не меняй местоположение цифр, просто верни засечки и сделай их высоту
# меньше». Решения ask_user: два слоя как до B-04 (доли всегда + подсечки
# шага по зуму); высоты меньше прежних — доли 4px / подсечки 2px
# (при протяжке 3px). Узлы — эпохи B-19 (засечка ровно под подписью).
# Идемпотентно по маркеру.
import io, sys

P = '/home/user/STRUCHORD.html'
with io.open(P, encoding='utf-8', errors='surrogateescape') as f:
    c = f.read()

if "не меняй местоположение цифр" in c:
    print('SKIP: патч B-22 уже применён')
    sys.exit(0)

reps = []

# --- 1. CSS: правила слоёв + история комментария ------------------------------
reps.append((
"""/* Засечек долей и подсечек шага в редакторе больше нет (B-04,
   2026-08-25): их место и роль заняли подписи счёта (.chord-counts
   ниже) — «1 та и та и так справляются». buildInnerTicks продолжает
   обслуживать только ленту (.tl-ticks). */
/* Счёт долей ВНУТРИ ячейки: «1 та и та». Стоит у самой нижней кромки —
   ровно на месте бывших засечек (B-04): больше засечек нет, сетку
   держат одни подписи.
   Дробность следует за шагом сетки (getResizeStep): пока масштаб мелкий,""",
"""/* История слоёв у нижней кромки: B-04 (2026-08-25) убрала засечки,
   перенеся роль на подписи счёта; B-21 подняла подписи на 3px
   (bottom: 4px); B-22 (2026-08-26) вернула засечки ПОД подписи по
   спеке пользователя: «пусть под цифрами все таки будут невысокие
   засечки. не меняй местоположение цифр, просто верни засечки и
   сделай их высоту меньше». Слои и геометрия те же, что до B-04
   (buildInnerTicks), но короче: доли 6px -> 4px, подсечки шага
   3px -> 2px (при протяжке 5px -> 3px), нижняя кромка bottom: 1px.
   buildInnerTicks обслуживает и редактор, и ленту (.tl-ticks). */
.chord-wrapper .chord-ticks,
.chord-wrapper .chord-ticks-step {
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
  z-index: 1;
}
.chord-wrapper .chord-ticks {
  bottom: 1px;
  height: 4px;
}
/* Подсечки шага перетаскивания: ниже и бледнее засечек долей —
   иерархию держит размер, а не прозрачность (как до B-04). Видимость
   решается наличием самого фона: при шаге в целую долю buildInnerTicks
   возвращает пустую строку, и рисовать нечего. */
.chord-wrapper .chord-ticks-step {
  bottom: 1px;
  height: 2px;
  transition: height 0.15s ease;
}
body.is-resizing .chord-wrapper .chord-ticks-step {
  height: 3px;
}
/* Счёт долей ВНУТРИ ячейки: «1 та и та». Стоит НАД засечками (B-22),
   у нижней кромки (bottom: 4px — B-21 подняла на 3px от места засечек
   эпохи B-04; позиция подписей с B-22 не менялась).
   Дробность следует за шагом сетки (getResizeStep): пока масштаб мелкий,"""))

# --- 2. buildInnerTicks: сигнатура с epoch ------------------------------------
reps.append((
"""function buildInnerTicks(spanBeats, offsetBeats, colorVar, subdivide, cellCols) {
  // Подсечки шага при делителе 1 совпали бы с засечками долей —""",
"""function buildInnerTicks(spanBeats, offsetBeats, colorVar, subdivide, cellCols, epoch) {
  // Подсечки шага при делителе 1 совпали бы с засечками долей —"""))

# --- 3. buildInnerTicks: ось счёта = ось подписей (эпоха B-19) ----------------
reps.append((
"""  const skipWholeBeats = colorVar === '--color-tick-substep';
  const stops = [];
  const firstNode = Math.ceil((offsetBeats - 1e-6) / step) * step;
  for (let node = firstNode; node < offsetBeats + spanBeats - 1e-6; node += step) {
    const j = node - offsetBeats;            // долей от левого края ячейки""",
"""  const skipWholeBeats = colorVar === '--color-tick-substep';
  // B-22: шестой параметр epoch — { ownOffset, unitScale }, ровно как у
  // buildInnerCounts (B-19): засечка обязана стоять под ПОДПИСЬЮ счёта —
  // ячейка 2/2 рисует долевые засечки на своих узлах, а не на четвертной
  // сетке родителя. Без epoch (лента) — прежняя ось оффсета, бит-в-бит.
  const unitScale = epoch && epoch.unitScale ? epoch.unitScale : 1;
  const ownOff = epoch ? (epoch.ownOffset || 0) : offsetBeats * unitScale;
  const ownSpan = spanBeats * unitScale;
  const stops = [];
  const firstNode = Math.ceil((ownOff - 1e-6) / step) * step;
  for (let node = firstNode; node < ownOff + ownSpan - 1e-6; node += step) {
    const j = (node - ownOff) / unitScale;   // долей от левого края ячейки"""))

# --- 4. Рендер ячеек: два слоя засечек под подписями ----------------------------
reps.append((
"""          ${/* Счёт СНАРУЖИ .chord-content: у того overflow: hidden, и
                подпись «1» на левом крае ячейки обрезалась по вертикали
                (замер: вылезает на 3px, видна половина цифры).
                Ячейка .chord-wrapper обрезки не делает. */''}
          <div class="chord-counts" aria-hidden="true">${buildInnerCounts(getEventVisualSpanInParentUnits(ev, parentTs), epochOwnOffset, Math.round(1 / getResizeStep()), effectiveSpan, epochBeatsPerBar, { ownOffset: epochOwnOffset, unitScale: epochUnitScale })}</div>""",
"""          ${/* Счёт СНАРУЖИ .chord-content: у того overflow: hidden, и
                подпись «1» на левом крае ячейки обрезалась по вертикали
                (замер: вылезает на 3px, видна половина цифры).
                Ячейка .chord-wrapper обрезки не делает. */''}
          ${/* Засечки под подписями (B-22): доли всегда, подсечки — по
                шагу зума; узлы эпохи B-19 — те же, что у подписей.
                Слои РАНЬШЕ счёта в разметке — подписи рисуются поверх. */''}
          <div class="chord-ticks" aria-hidden="true" style="${buildInnerTicks(getEventVisualSpanInParentUnits(ev, parentTs), epochOwnOffset, '--color-tick-line', 1, effectiveSpan, { ownOffset: epochOwnOffset, unitScale: epochUnitScale })}"></div>
          <div class="chord-ticks-step" aria-hidden="true" style="${buildInnerTicks(getEventVisualSpanInParentUnits(ev, parentTs), epochOwnOffset, '--color-tick-substep', Math.round(1 / getResizeStep()), effectiveSpan, { ownOffset: epochOwnOffset, unitScale: epochUnitScale })}"></div>
          <div class="chord-counts" aria-hidden="true">${buildInnerCounts(getEventVisualSpanInParentUnits(ev, parentTs), epochOwnOffset, Math.round(1 / getResizeStep()), effectiveSpan, epochBeatsPerBar, { ownOffset: epochOwnOffset, unitScale: epochUnitScale })}</div>"""))

# --- 5. Зум: пересборка подсечек (как до B-04, с осью эпохи) ------------------
reps.append((
"""        const beats = getEventVisualSpanInParentUnits(ev, parentTs);
        // Счёт долей пересобираем ЗДЕСЬ ЖЕ: его дробность следует за
        // шагом сетки зума (B-04: подсечек-засечек больше нет — их роль
        // исполняют сами подписи). Раньше подписи строились только в
        // render(), и при зуме «1 та и та» не появлялось — оставались
        // одни цифры, пока пользователь не тронет что-то ещё.
        const countsEl = cw.querySelector('.chord-counts');""",
"""        const beats = getEventVisualSpanInParentUnits(ev, parentTs);
        // Подсечки шага пересобираем ЗДЕСЬ ЖЕ (B-22 вернула слои под
        // подписи): дробность следует за шагом зума. Засечки ДОЛЕЙ
        // (делитель 1) от зума не зависят — их трогает только render()
        // и лайв-ресайз.
        const stepEl = cw.querySelector('.chord-ticks-step');
        if (stepEl) {
          stepEl.setAttribute('style',
            buildInnerTicks(beats, epochOwnOffset, '--color-tick-substep', subdivide, dist.spans[ei],
              { ownOffset: epochOwnOffset, unitScale: epochUnitScale }));
        }
        // Счёт долей пересобираем ЗДЕСЬ ЖЕ: его дробность следует за
        // шагом сетки зума (по узлам эпохи B-19 — тем же, что подсечки).
        // Раньше подписи строились только в render(), и при зуме
        // «1 та и та» не появлялось — оставались одни цифры, пока
        // пользователь не тронет что-то ещё.
        const countsEl = cw.querySelector('.chord-counts');"""))

# --- 6. Лайв-ресайз: пересборка обоих слоёв ------------------------------------
reps.append((
"""      const countsEl = cw.querySelector('.chord-counts');
      if (countsEl) {
        countsEl.innerHTML = buildInnerCounts(
          beats, epochOwnOffset, subdiv, liveDist.spans[i], epochBeatsPerBar,
          { ownOffset: epochOwnOffset, unitScale: epochUnitScale });
      }
    }
    epochOwnOffset += (sq.events[i] && sq.events[i].span) || 1;""",
"""      // Засечки и подсечки (B-22) пересобираем по ходу — как до B-04,
      // иначе по дороге они оставались бы от прошлого рендера, а на
      // отпускании прыгали на узлы.
      const tickEl = cw.querySelector('.chord-ticks');
      if (tickEl) {
        tickEl.setAttribute('style',
          buildInnerTicks(beats, epochOwnOffset, '--color-tick-line', 1, liveDist.spans[i],
            { ownOffset: epochOwnOffset, unitScale: epochUnitScale }));
      }
      const stepEl = cw.querySelector('.chord-ticks-step');
      if (stepEl) {
        stepEl.setAttribute('style',
          buildInnerTicks(beats, epochOwnOffset, '--color-tick-substep', subdiv, liveDist.spans[i],
            { ownOffset: epochOwnOffset, unitScale: epochUnitScale }));
      }
      const countsEl = cw.querySelector('.chord-counts');
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
print('OK: патч B-22 применён, якорей: %d' % len(reps))

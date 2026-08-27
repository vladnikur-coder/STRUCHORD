#!/usr/bin/env python3
# B-20 этап 2 (2026-08-26), решение Б: per_cell остаётся; «−» перенимает
# ленту удалённой запиненной ячейки, если поглотитель своей ссылки не
# имеет. Лента сшивается из РЕАЛЬНОГО звучания обеих частей до удаления,
# якорясь на начало будущего окна поглотителя — инвариант «правки не
# двигают удары» держится конструктивно (траектория #53 зонда).
import io, sys
PATH = '/home/user/STRUCHORD.html'
src = io.open(PATH, encoding='utf-8', errors='surrogateescape').read()
orig = src
edits = []

def apply(name, old, new):
    global src
    n = src.count(old)
    if n != 1:
        edits.append((name, False)); return False
    src = src.replace(old, new, 1)
    edits.append((name, True)); return True

# 9a. Сшиваем ленту ДО splice (геометрия и окна ещё старые).
apply('9a adopt: stitch tape pre-splice', """  const absorbRef = st && absorbIdx >= 0 ? st.refs.get(rhythmRefKey(sid, sqid, absorbIdx)) : null;
  sq.events.splice(ei, 1);""",
"""  const absorbRef = st && absorbIdx >= 0 ? st.refs.get(rhythmRefKey(sid, sqid, absorbIdx)) : null;
  // B-20 решение Б (2026-08-26): «−» ПЕРЕНИМАЕТ ленту. До сих пор
  // безссылочный поглотитель, поглощая время запиненной соседки, молча
  // терял её рисунок (оставался на фасаде); после автонаследования
  // per_cell такие пары возникают штатно (зонд, траектория #53: связка,
  // частично сданный хвостик, минус на ленточной половине — удары DUUD
  // молча сменились боем секции). Теперь: сшиваем приватную ленту ровно
  // из того, что ЗВУЧАЛО до удаления (своя часть поглотителя = его
  // фасад, часть удалённой = её тейп) и отдаём поглотителю. Окна сняты
  // по геометрии ДО splice; звук итога тождествен звуку до операции по
  // построению, а не по надежде.
  let adoptTape = null;
  let adoptSub = 1;
  let adoptMode = 'strum';
  let adoptAnchor = 0;
  if (st && removedRef && !absorbRef && absorbIdx >= 0) {
    const winAbs = rhythmSoundingForEvent(s, sq, sq.events[absorbIdx], absorbIdx);
    const winRem = rhythmSoundingForEvent(s, sq, removed, ei);
    if (winAbs && winRem && winAbs.steps.length && winRem.steps.length) {
      const sa = Math.max(1, winAbs.subdivision || 1);
      const sb = Math.max(1, winRem.subdivision || 1);
      // Общая сетка — произведение дроблений; regridSquareRollsToFit
      // ниже уплотнит её до канонической.
      adoptSub = sa * sb;
      adoptMode = (winAbs.mode === winRem.mode ? winAbs.mode : 'mixed') || 'strum';
      const absSteps = regridRhythmSteps(winAbs.steps, sa, adoptSub, winAbs.mode);
      const remSteps = regridRhythmSteps(winRem.steps, sb, adoptSub, winRem.mode);
      // Временной порядок частей: кто раньше — тот первый. Якорь —
      // начало будущего окна поглотителя (минимум оффсетов пары).
      const offsPre = squareEventOffsets(sq);
      adoptAnchor = Math.min(offsPre[ei], offsPre[absorbIdx]);
      adoptTape = (offsPre[absorbIdx] <= offsPre[ei]
        ? absSteps.concat(remSteps)
        : remSteps.concat(absSteps));
    }
  }
  sq.events.splice(ei, 1);""")

# 9b. Отдаём сшитую ленту поглотителю до сведения сирот.
apply('9b adopt: give tape to absorber', """    if (st && (removedRef || absorbRef)) {
      if (removedRef) collapseOrphanRhythmRoll(st, s, sq, removedRef.roll);""",
"""    if (st && (removedRef || absorbRef)) {
      // B-20 решение Б: перенятая лента встаёт раньше сведения сирот —
      // collapse считает пользователей уже с ней честно.
      if (adoptTape) {
        const adoptId = mintRhythmRollId(st);
        st.pool[adoptId] = { mode: adoptMode, subdivision: adoptSub, steps: adoptTape };
        st.refs.set(rhythmRefKey(sid, sqid, targetIndex), { roll: adoptId, anchor: adoptAnchor });
      }
      if (removedRef) collapseOrphanRhythmRoll(st, s, sq, removedRef.roll);""")

failed = [name for name, ok in edits if not ok]
if failed:
    print('ABORTED, no changes written:'); [print('  MISSING:', f) for f in failed]; sys.exit(1)
if src != orig:
    io.open(PATH, 'w', encoding='utf-8', errors='surrogateescape').write(src)
    print('PATCHED')
else:
    print('PATCHED (no byte changes)')
for name, ok in edits: print(('  OK   ' if ok else '  FAIL ') + name)

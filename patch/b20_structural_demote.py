#!/usr/bin/env python3
# B-20 (2026-08-26): автонаследование после структурных операций.
# Дефект-репро: демоция волны-7 звалась только на сейвах боёв и загрузке
# файла; после «+»/«−»/меню размера пины, звучащие ровно как фасад,
# висели вечно. Решения: all_structural / per_cell / toast.
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

# 1. demoteMatchingCellRhythms отдаёт индексы снятых (для тостов),
#    сигнатура обратно-совместима.
apply('1 demote signature', """function demoteMatchingCellRhythms(sec, sq) {""",
"""function demoteMatchingCellRhythms(sec, sq, droppedOut) {""")

apply('2 demote collect idx', """    if (!soundingWindowsEqual(own, facade)) continue;
    // Пин снимаем — окно уже звучит ровно как фасад: ячейка переходит на
    // наследование без изменения звука, и дальше следует за боем секции.
    st.refs.delete(key);
    collapseOrphanRhythmRoll(st, sec, sq, ref.roll);
    dropped++;""",
"""    if (!soundingWindowsEqual(own, facade)) continue;
    // Пин снимаем — окно уже звучит ровно как фасад: ячейка переходит на
    // наследование без изменения звука, и дальше следует за боем секции.
    st.refs.delete(key);
    collapseOrphanRhythmRoll(st, sec, sq, ref.roll);
    if (Array.isArray(droppedOut)) droppedOut.push(i);
    dropped++;""")

# 2+. Общий settle-проход с тостом (решение toast), перед парой
#     Section/Song-обёрток, чтобы был рядом с demote.
apply('3 settle wrapper', """  if (dropped) gcRhythmRolls(st);
  return dropped;
}

// То же по всей секции (правка её боя) и по всей песне (загрузка файла).""",
"""  if (dropped) gcRhythmRolls(st);
  return dropped;
}

// B-20 (2026-08-26): автонаследование после СТРУКТУРНЫХ операций.
// Дефект-репро пользователя: бой секции задан, ячейка запинена тем же
// звучанием, деление «+» дало честную связку — окна половин совпали с
// фасадом, а плашки кастома висели: демоция волны-7 звалась лишь на
// сейвах боёв и загрузке файла. Решения ask_user: all_structural
// (сверка на всех структурных операциях — деление «+», поглощение «−»,
// меню размера, смена размера ячейки; отпускание ручки уже звало), per_cell
// (снимаем по одной совпавшей — остаток связки сводит её рулон к своему
// окну через collapseOrphanRhythmRoll и не трогается), toast (о каждом
// снятии — тост, чтобы пропажа плашки не была загадкой). Звук на месте
// не меняется никогда: снятая ячейка звучит ровно тем же фасадом.
function settleSquareRhythmWithFacade(sec, sq, opts) {
  const droppedIdx = [];
  const n = demoteMatchingCellRhythms(sec, sq, droppedIdx);
  if (n && (!opts || opts.toast !== false) && typeof showToast === 'function') {
    droppedIdx.sort((a, b) => a - b).forEach((i) =>
      showToast(`Ритм ячейки ${i + 1} снят с пина: совпал с боем секции`));
  }
  return n;
}

// То же по всей секции (правка её боя) и по всей песне (загрузка файла).""")

# 3. Деление «+»
apply('4 addChordAfter settle', """    regridSquareRollsToFit(s, sq);
    gcRhythmRolls(st);
  }
  if (keyMode === 'auto') refreshAutoDetectedKey();
  requestRender();
}
function removeChordAt(sid, sqid, ei) {""",
"""    regridSquareRollsToFit(s, sq);
    gcRhythmRolls(st);
  }
  // B-20: окна половин после деления могли совпасть с боем секции.
  settleSquareRhythmWithFacade(s, sq);
  if (keyMode === 'auto') refreshAutoDetectedKey();
  requestRender();
}
function removeChordAt(sid, sqid, ei) {""")

# 4. Поглощение «−»
apply('5 removeChordAt settle', """      syncPrivateRhythmAnchors(st, s, sq);
      regridSquareRollsToFit(s, sq);
      gcRhythmRolls(st);
    }""",
"""      syncPrivateRhythmAnchors(st, s, sq);
      regridSquareRollsToFit(s, sq);
      gcRhythmRolls(st);
      // B-20: поглотившее окно могло совпасть с боем секции.
      settleSquareRhythmWithFacade(s, sq);
    }""")

# 5. Меню размера (прямая смена span)
apply('6 span menu settle', """  const total = events.reduce((sum, e) => sum + getEventSpanInParentUnits(e, parentTs), 0);
  sq.customBeats = total;

  requestRender();""",
"""  const total = events.reduce((sum, e) => sum + getEventSpanInParentUnits(e, parentTs), 0);
  sq.customBeats = total;

  // B-20: окно при новых долях могло совпасть с боем секции.
  settleSquareRhythmWithFacade(sec, sq);
  requestRender();""")

# 6. Смена собственного размера ячейки
apply('7 setEventTimeSig settle', """  // Если новый размер совпадает с родительским, сохраняем null
  if (newTimeSig === parentTimeSig) {
    ev.timeSig = null;
  } else {
    ev.timeSig = newTimeSig;
  }
  requestRender();""",
"""  // Если новый размер совпадает с родительским, сохраняем null
  if (newTimeSig === parentTimeSig) {
    ev.timeSig = null;
  } else {
    ev.timeSig = newTimeSig;
  }
  // B-20: окно в новых единицах размера могло совпасть с боем секции.
  settleSquareRhythmWithFacade(sec, sq);
  requestRender();""")

# 7. Отпускание ручки: переводим на settle с тостом (волна-7 звала сырую
#    демоцию и молчала).
apply('8 resize release -> settle', """        // Волна-7: итоговые окна, совпавшие с боем секции, распускаются
        // в наследование — пинов больше нет, ячейки следуют за секцией.
        demoteMatchingCellRhythms(s, sq);""",
"""        // Волна-7: итоговые окна, совпавшие с боем секции, распускаются
        // в наследование — пинов больше нет, ячейки следуют за секцией.
        // B-20: общий settle-проход — то же снятие, но с тостом.
        settleSquareRhythmWithFacade(s, sq);""")

failed = [name for name, ok in edits if not ok]
if failed:
    print('ABORTED, no changes written:'); [print('  MISSING:', f) for f in failed]; sys.exit(1)
if src != orig:
    io.open(PATH, 'w', encoding='utf-8', errors='surrogateescape').write(src)
    print('PATCHED')
else:
    print('PATCHED (no byte changes)')
for name, ok in edits: print(('  OK   ' if ok else '  FAIL ') + name)

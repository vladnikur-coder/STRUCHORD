#!/usr/bin/env python3
"""B-39, этап 1 итерации 0.795 (бэклог №21): якорь автоаккомпанемента — ячейка.

Per-cell вариант (voicings[cell]) получает приоритет над общим для аккорда
(v:<аккорд>) всюду, где выбирается расположение; стрелки/тоггл при выбранной
ячейке пишут per-cell. R8 final=yes 2026-11-05, спек dev/specs/b39-saturation-anchor-0795.md.
"""
import sys

PATH = "STRUCHORD.html"

ANCHORS = [
    # 1. variantIndex: per-cell выше v:<аккорд>.
    (
        """  function variantIndex(trackId, chord, cellKey) {
    var T = tracks();
    var fromModel = null;
    if (T && typeof T.voicingForChord === 'function') {
      fromModel = T.voicingForChord(trackId, chord);
      if (fromModel === null && cellKey && typeof T.track === 'function') {
        var t = T.track(trackId);
        if (t && t.voicings && Number.isInteger(t.voicings[cellKey])) fromModel = t.voicings[cellKey];
      }
    }
    if (Number.isInteger(fromModel)) return fromModel;""",
        """  function variantIndex(trackId, chord, cellKey) {
    var T = tracks();
    var fromModel = null;
    // 0.795 (№21): якорь — ячейка; per-cell вариант приоритетнее общего для аккорда.
    if (cellKey && T && typeof T.track === 'function') {
      var t = T.track(trackId);
      if (t && t.voicings && Number.isInteger(t.voicings[cellKey])) fromModel = t.voicings[cellKey];
    }
    if (!Number.isInteger(fromModel) && T && typeof T.voicingForChord === 'function') {
      fromModel = T.voicingForChord(trackId, chord);
    }
    if (Number.isInteger(fromModel)) return fromModel;""",
    ),
    # 2. setVariantIndex: при выбранной ячейке запись идёт per-cell.
    (
        """    var T = tracks();
    if (T && typeof T.setVoicingForChord === 'function') T.setVoicingForChord(trackId, chord, next);
    else if (T && cellKey && typeof T.setVoicing === 'function') T.setVoicing(trackId, cellKey, next);
    return next;""",
        """    var T = tracks();
    // 0.795 (№21): при выбранной ячейке стрелки/тоггл меняют только её (per-cell).
    if (T && cellKey && typeof T.setVoicing === 'function') T.setVoicing(trackId, cellKey, next);
    else if (T && typeof T.setVoicingForChord === 'function') T.setVoicingForChord(trackId, chord, next);
    return next;""",
    ),
    # 3. voicingProvider: реальный cell в variantIndex (звук следует за ячейкой).
    (
        "      var idx = variantIndex(trackId, chordName, null) % variants.length;",
        "      var idx = variantIndex(trackId, chordName, cell) % variants.length;   // 0.795 (№21): per-cell якорь",
    ),
    # 4. linkedSelection: per-cell ручной вариант приоритетнее v:<аккорд>.
    (
        """      var manual=t.voicings['v:'+chord];
      if(!Number.isInteger(manual))manual=t.voicings[e.cell];""",
        """      var manual=t.voicings[e.cell];   // 0.795 (№21): per-cell выше v:<аккорд>
      if(!Number.isInteger(manual))manual=t.voicings['v:'+chord];""",
    ),
    # 5. linkedSelection, ветка >2048: то же приоритетное правило.
    (
        "      var vi=t.voicings['v:'+name];if(!Number.isInteger(vi))vi=t.voicings[cell];",
        "      var vi=t.voicings[cell];if(!Number.isInteger(vi))vi=t.voicings['v:'+name];   // 0.795 (№21)",
    ),
]


def main():
    with open(PATH, "r", encoding="utf-8") as f:
        s = f.read()
    for i, (old, new) in enumerate(ANCHORS, 1):
        n = s.count(old)
        if n != 1:
            print(f"ПАТЧ НЕ ПРИМЕНЁН: якорь {i} найден {n} раз (ожидался 1)")
            sys.exit(1)
        s = s.replace(old, new)
    with open(PATH, "w", encoding="utf-8") as f:
        f.write(s)
    print(f"OK: применено якорей {len(ANCHORS)}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""B-39, итерация 0.796 (бэклог №23): голосоведение (linkedVoicings) включено
по умолчанию. Absent поля = вкл; явное false (галочка снята) = выкл и
сохраняется в файл. Новые дорожки и так получали true (0.780).
R8: владелец подтвердил 2026-11-05 (старых песен без поля нет, чекбокс = вкл при absent).
"""
import sys

PATH = "STRUCHORD.html"

ANCHORS = [
    # 1. linkedSelection: absent = вкл, выкл только явным false.
    (
        "    if(!t || !t.linkedVoicings || !cell)return null;",
        "    if(!t || t.linkedVoicings===false || !cell)return null;   // 0.796 (№23): по умолчанию вкл",
    ),
    # 2. Галочка в панели: при absent показываем вкл.
    (
        "    if(linkedToggle)linkedToggle.checked=!!active.track.linkedVoicings;",
        "    if(linkedToggle)linkedToggle.checked=active.track.linkedVoicings!==false;   // 0.796 (№23)",
    ),
    # 3. Экспорт/превью guard.
    (
        "    if(track.instrument==='keys' && K && track.linkedVoicings && cell) {",
        "    if(track.instrument==='keys' && K && track.linkedVoicings!==false && cell) {   // 0.796 (№23)",
    ),
    # 4. setLinkedVoicings: выкл записывается явным false, а не удалением поля.
    (
        """    if(!!t.linkedVoicings===on)return true;
    return dispatch('b39/linked-voicings',function(){if(on)t.linkedVoicings=true;else delete t.linkedVoicings;return true;});""",
        """    if((t.linkedVoicings!==false)===on)return true;   // 0.796 (№23): absent = вкл
    return dispatch('b39/linked-voicings',function(){t.linkedVoicings=on;return true;});   // false сохраняется явно""",
    ),
    # 5. Sanitize при загрузке: сохраняем и true, и явный false.
    (
        "        ...(raw.linkedVoicings===true ? {linkedVoicings:true} : {}),",
        "        ...(typeof raw.linkedVoicings==='boolean' ? {linkedVoicings:raw.linkedVoicings} : {}),   // 0.796 (№23): явное false не теряется",
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

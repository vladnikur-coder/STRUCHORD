#!/usr/bin/env python3
"""B-39, итерация 0.800 (баг-репорт по скриншоту владельца, Safari): клавиши панели
рисовались ЗА правой границей карточки панели (C6–C7 поверх фона страницы).

Причина: у .b39-keys-panel width:max-content + overflow:visible, а .b39-keys-body —
скролл-контейнер; в WebKit его ширина могла пойти по содержимому (SVG клавиатуры),
и клавиатура рисовалась за границей панели. Фикс: ширина body жёстко привязана к
панели (width:0; min-width:100%), поэтому overflow-x:auto всегда клипает клавиши
по границе панели, а прокрутка остаётся внутренней (scrollWidth > clientWidth).
"""
import sys

PATH = "STRUCHORD.html"

ANCHORS = [
    (
        ".b39-keys-body { min-width: 0; max-width: 100%; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; }",
        ".b39-keys-body { width: 0; min-width: 100%; max-width: 100%; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; }   // 0.800: width:0+min-width:100% — WebKit не раздувает скролл-контейнер по содержимому внутри width:max-content панели; клавиши клипаются границей панели",
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

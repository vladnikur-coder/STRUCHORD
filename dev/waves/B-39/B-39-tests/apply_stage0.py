#!/usr/bin/env python3
"""Прикладывает ЧАСТЬ 1 (STAGE 0 / B-102) к ЛЮБОЙ версии STRUCHORD.html.

УСТАРЕЛО ДЛЯ ОБЩЕГО СЛУЧАЯ: для всех готовых частей используй apply_patch.py.
Этот скрипт оставлен как запасной вариант только для части 1.

Не использует номера строк. Ищет уникальный якорь `function getChordNotes(cn, ks) {`
и вставляет блок перед ним. Поэтому безразлично, ушёл ли файл вперёд на
200 или на 5000 строк: важно только, чтобы нужные функции в нём остались.

  python3 apply_stage0.py STRUCHORD.html            # применить
  python3 apply_stage0.py STRUCHORD.html --check    # только проверить якоря
  python3 apply_stage0.py STRUCHORD.html --uninstall  # убрать блок

Всегда создаёт резервную копию рядом с файлом.
"""
from pathlib import Path
import sys, datetime, re

HERE = Path(__file__).parent
BLOCK = (HERE / "stage0_block.js").read_text(encoding="utf-8")

BEGIN = "// >>> B-39 STAGE0 BEGIN (B-102) <<<"
END = "// <<< B-39 STAGE0 END (B-102) <<<"
ANCHOR = "function getChordNotes(cn, ks) {"

# Всё, что новый код вызывает. Если чего-то нет — лучше честно остановиться,
# чем вставить код, который упадёт при первом же аккорде.
REQUIRED = {
    "CHROMATIC": "const CHROMATIC = [",
    "SHARP_TO_FLAT": "const SHARP_TO_FLAT = {",
    "FLAT_TO_SHARP": "const FLAT_TO_SHARP = {",
    "expandChordName": "function expandChordName(chord) {",
    "normalizeAccidentals": "function normalizeAccidentals(name) {",
    "normalizeChordCase": "function normalizeChordCase(ch) {",
    "getKeyStyle": "function getKeyStyle(k) {",
    "getChordNotes (якорь)": ANCHOR,
}

def backup(target, data):
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    out = target.parent / (target.name + ".bak-" + stamp)
    n = 1
    while out.exists():
        out = target.parent / (target.name + f".bak-{stamp}-{n}")
        n += 1
    out.write_text(data, encoding="utf-8")
    return out

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    if not args:
        raise SystemExit("Использование: python3 apply_stage0.py STRUCHORD.html [--check|--uninstall]")
    target = Path(args[0]).expanduser().resolve()
    if not target.is_file():
        raise SystemExit(f"Файл не найден: {target}")
    data = target.read_text(encoding="utf-8")

    print(f"Файл: {target}")
    print(f"Размер: {len(data):,} символов, строк: {data.count(chr(10)):,}")

    # --- проверка якорей ---
    problems = []
    for name, needle in REQUIRED.items():
        cnt = data.count(needle)
        print(f"  {name:28} {'OK' if cnt == 1 else 'ПРОБЛЕМА'} (вхождений: {cnt})")
        if cnt != 1:
            problems.append(f"{name}: ожидалось 1 вхождение, найдено {cnt}")
    if problems:
        print("\n❌ Якоря не совпали. Патч НЕ применён.")
        print("   Скорее всего, в этой версии переименована одна из функций разбора аккордов.")
        print("   Покажи этот вывод программисту — он поправит один якорь в REQUIRED.")
        for p in problems:
            print("   -", p)
        return 1

    if "--check" in flags:
        applied = BEGIN in data
        print("\nБлок STAGE 0 уже применён:", "да" if applied else "нет")
        print("✅ Проверка пройдена. Файл не изменён.")
        return 0

    if "--uninstall" in flags:
        if BEGIN not in data or END not in data:
            print("Блок не найден — удалять нечего.")
            return 0
        new = re.sub(re.escape(BEGIN) + r".*?" + re.escape(END) + r"\n?", "",
                     data, count=1, flags=re.S)
        bak = backup(target, data)
        target.write_text(new, encoding="utf-8")
        print(f"✅ Блок удалён. Резервная копия: {bak}")
        return 0

    # --- применение ---
    if BEGIN in data and END in data:
        new = re.sub(re.escape(BEGIN) + r".*?" + re.escape(END) + r"\n?",
                     lambda m: BLOCK, data, count=1, flags=re.S)
        action = "обновлён (старый блок заменён)"
    elif BEGIN in data or END in data:
        print("❌ Найден только один маркер блока — файл повреждён. Патч НЕ применён.")
        return 1
    else:
        new = data.replace(ANCHOR, BLOCK + ANCHOR, 1)
        action = "вставлен"

    bak = backup(target, data)
    target.write_text(new, encoding="utf-8")
    print(f"\n✅ STAGE 0 (B-102) {action}.")
    print(f"   Было: {len(data):,} -> стало: {len(new):,} символов (+{len(new)-len(data):,})")
    print(f"   Резервная копия: {bak}")
    print("\nДальше: node B-39-tests/test_stage0.js <оригинал> <этот файл>")
    return 0

if __name__ == "__main__":
    sys.exit(main())

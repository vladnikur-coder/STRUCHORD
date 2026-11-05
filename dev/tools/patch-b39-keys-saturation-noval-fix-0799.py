#!/usr/bin/env python3
"""0.799 fixup: в строке синхронизации ползунка хвостовой « }» попал в комментарий
при patch-b39-keys-saturation-noval-0799.py — возвращаем закрывающую скобку."""
import sys

PATH = "STRUCHORD.html"
OLD = "if (Number(satInput.value) !== sv && doc.activeElement !== satInput) { satInput.value = String(sv); }   // 0.799 }"
NEW = "if (Number(satInput.value) !== sv && doc.activeElement !== satInput) { satInput.value = String(sv); } }   // 0.799"

with open(PATH, "r", encoding="utf-8") as f:
    s = f.read()
if s.count(OLD) != 1:
    print(f"ПАТЧ НЕ ПРИМЕНЁН: якорь найден {s.count(OLD)} раз")
    sys.exit(1)
with open(PATH, "w", encoding="utf-8") as f:
    f.write(s.replace(OLD, NEW))
print("OK: скобка восстановлена")

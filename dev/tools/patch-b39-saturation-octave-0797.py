#!/usr/bin/env python3
"""0.797 fixup: nextPcAbove — если верхняя нота уже той же pitch class,
следующая сверху = октава (top+12), а не сам top."""
import sys

PATH = "STRUCHORD.html"
OLD = """    function nextPcAbove(pc) {
      var top = out[out.length - 1];
      var m = top + mod12(pc - mod12(top));
      return (m > top && m <= high) ? m : null;
    }"""
NEW = """    function nextPcAbove(pc) {
      var top = out[out.length - 1];
      var d = mod12(pc - mod12(top));
      var m = top + (d === 0 ? 12 : d);   // та же pc сверху = октава выше
      return (m > top && m <= high) ? m : null;
    }"""

with open(PATH, "r", encoding="utf-8") as f:
    s = f.read()
if s.count(OLD) != 1:
    print(f"ПАТЧ НЕ ПРИМЕНЁН: якорь найден {s.count(OLD)} раз")
    sys.exit(1)
with open(PATH, "w", encoding="utf-8") as f:
    f.write(s.replace(OLD, NEW))
print("OK: nextPcAbove octave fix применён")

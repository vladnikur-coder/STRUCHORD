#!/usr/bin/env python3
"""B-39: метки тоники и пальцев внутри чёрных клавиш, поверх 0.732."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 if s.count(a)!=1:raise SystemExit(f'{s.count(a)} совпадений: {a[:100]!r}')
 s=s.replace(a,b,1)
rep('''      if (o.rootPc !== undefined && mod12(m) === o.rootPc) {
        parts.push('<circle cx="' + cx + '" cy="' + (whiteH < 20 ? 2 : whiteH - 10) + '" r="' + (whiteH < 20 ? 1.5 : 3.2) + '" fill="#fff" opacity="0.9"/>');
      }
      if (o.showFingers) {
        var f = FINGERS[i % FINGERS.length];
        parts.push('<text x="' + cx + '" y="' + (whiteH - 3) + '" font-size="' + fingerFont + '" font-weight="700" ' +''','''      if (o.rootPc !== undefined && mod12(m) === o.rootPc) {
        // Чёрная клавиша короче белой: метка должна находиться на ней, а не ниже.
        var dotR = k.white ? (whiteH < 20 ? 1.5 : 3.2) : Math.min(3.2, blackH / 4);
        var dotY = k.white ? (whiteH < 20 ? 2 : whiteH - 10) :
          Math.max(dotR, blackH - (o.showFingers ? fingerFont + 8 : 10));
        parts.push('<circle cx="' + cx + '" cy="' + dotY + '" r="' + dotR + '" fill="#fff" opacity="0.9"/>');
      }
      if (o.showFingers) {
        var f = FINGERS[i % FINGERS.length];
        parts.push('<text x="' + cx + '" y="' + (k.white ? whiteH - 3 : blackH - 3) + '" font-size="' + fingerFont + '" font-weight="700" ' +''')
p.write_text(s,encoding='utf-8');print('Метки на чёрных клавишах исправлены')

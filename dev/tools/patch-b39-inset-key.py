#!/usr/bin/env python3
"""B-39: каёмка внутри подсвеченных клавиш вместо внешней рамки, поверх 0.740."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 if s.count(a)!=1:raise SystemExit(f'{s.count(a)} совпадений: {a[:120]!r}')
 s=s.replace(a,b,1)
rep('''/* Статическое свечение и контрастный контур не меняют геометрию клавиш. */
.b39-keys-svg rect[fill="var(--color-accent, #2f855a)"] {
  stroke: var(--color-on-accent, #fff); stroke-width: .1rem;
  filter: drop-shadow(0 0 .22rem var(--color-accent, #2f855a));
}''','''/* Свечение снаружи, тонкая каёмка только внутри выделенной клавиши. */
.b39-keys-svg rect[fill="var(--color-accent, #2f855a)"] {
  filter: drop-shadow(0 0 .22rem var(--color-accent, #2f855a));
}
.b39-keys-svg .b39-key-inset { fill:none; stroke:var(--color-on-accent, #fff); pointer-events:none; }''')
rep('''    // белые
    layout.keys.forEach(function (k) {''','''    // Отдельная каёмка полностью внутри контура клавиши, не перекрывает соседей.
    function inset(x, w, h) {
      var gap = Math.min(2, w / 4, h / 4), line = Math.min(1.2, gap);
      return '<path class="b39-key-inset" d="M ' + (x + gap) + ' ' + gap +
        ' H ' + (x + w - gap) + ' V ' + (h - gap) + ' H ' + (x + gap) +
        ' Z" stroke-width="' + line + '"/>';
    }
    // белые
    layout.keys.forEach(function (k) {''')
rep('''        '" rx="2" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1"/>');
    });
    // чёрные''','''        '" rx="2" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1"/>');
      if (set[k.midi]) parts.push(inset(k.x, whiteW, whiteH));
    });
    // чёрные''')
rep('''        '" rx="2" fill="' + fill + '" stroke="' + stroke + '" stroke-width="0.8"/>');
    });
    // подписи октaв'''.replace('октaв','октав'),'''        '" rx="2" fill="' + fill + '" stroke="' + stroke + '" stroke-width="0.8"/>');
      if (set[k.midi]) parts.push(inset(x, blackW, blackH));
    });
    // подписи октав''')
p.write_text(s,encoding='utf-8');print('Каёмка перенесена внутрь клавиш')

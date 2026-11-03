#!/usr/bin/env python3
"""B-39: тонкая скруглённая каёмка и аккуратные значки углов поверх 0.741."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 if s.count(a)!=1:raise SystemExit(f'{s.count(a)} совпадений: {a[:120]!r}')
 s=s.replace(a,b,1)
rep('''.b39-keys-resize--bottom-left::after, .b39-keys-resize--bottom-right::after { width:.7rem; height:.15rem; top:.55rem; left:.3rem; }
.b39-keys-resize--bottom-left::after { transform:rotate(-45deg); }
.b39-keys-resize--bottom-right::after { transform:rotate(45deg); }''','''.b39-keys-resize--bottom-left::after, .b39-keys-resize--bottom-right::after { width:.45rem; height:.075rem; top:.25rem; }
.b39-keys-resize--bottom-left::after { left:.85rem; transform:rotate(-45deg); }
.b39-keys-resize--bottom-right::after { right:.85rem; transform:rotate(45deg); }''')
rep('''      var gap = Math.min(2, w / 4, h / 4), line = Math.min(1.2, gap);
      return '<path class="b39-key-inset" d="M ' + (x + gap) + ' ' + gap +
        ' H ' + (x + w - gap) + ' V ' + (h - gap) + ' H ' + (x + gap) +
        ' Z" stroke-width="' + line + '"/>';''','''      var gap = Math.min(2, w / 4, h / 4), line = Math.min(.65, gap), r = Math.min(1, gap / 2);
      var left = x + gap, right = x + w - gap, top = gap, bottom = h - gap;
      return '<path class="b39-key-inset" d="M ' + (left + r) + ' ' + top +
        ' H ' + (right - r) + ' Q ' + right + ' ' + top + ' ' + right + ' ' + (top + r) +
        ' V ' + (bottom - r) + ' Q ' + right + ' ' + bottom + ' ' + (right - r) + ' ' + bottom +
        ' H ' + (left + r) + ' Q ' + left + ' ' + bottom + ' ' + left + ' ' + (bottom - r) +
        ' V ' + (top + r) + ' Q ' + left + ' ' + top + ' ' + (left + r) + ' ' + top +
        ' Z" stroke-width="' + line + '"/>';''')
p.write_text(s,encoding='utf-8');print('Каёмка и углы уточнены')

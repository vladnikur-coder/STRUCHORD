#!/usr/bin/env python3
"""B-39: белая каёмка выбранных клавиш и в тёмной теме, поверх 0.742."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
a='.b39-keys-svg .b39-key-inset { fill:none; stroke:var(--color-on-accent, #fff); pointer-events:none; }'
b='.b39-keys-svg .b39-key-inset { fill:none; stroke:#fff; pointer-events:none; }'
if s.count(a)!=1:raise SystemExit(f'{s.count(a)} совпадений')
p.write_text(s.replace(a,b,1),encoding='utf-8');print('Белая каёмка установлена')

#!/usr/bin/env python3
"""B-39: убрать стандартную синюю обводку на клавишах (0.748)."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
old='.b39-keys-body svg rect[data-midi] { cursor:pointer; }'
new='.b39-keys-body svg rect[data-midi] { cursor:pointer; outline:none; }'
if s.count(old)!=1:raise SystemExit('Нет единственного места для патча')
p.write_text(s.replace(old,new,1),encoding='utf-8')

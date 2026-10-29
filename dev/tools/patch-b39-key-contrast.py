#!/usr/bin/env python3
"""B-39: заметная подсветка клавиш в светлой теме «Дефолт», поверх 0.738."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
a='.b39-keys-body svg.b39-keys-svg { display: block; height: auto; max-width: none; margin-inline: auto; }'
b=a+'''\n/* Тёмно-синий акцент «Дефолта» почти сливался с чёрной клавишей.
   Более яркий синий различим и на чёрной, и на белой клавиатуре. */
html:not([data-theme='dark']):not([data-scheme]) .b39-keys-svg rect[fill="var(--color-accent, #2f855a)"] { fill: #3475b9; }'''
if s.count(a)!=1:raise SystemExit(f'{s.count(a)} совпадений')
p.write_text(s.replace(a,b,1),encoding='utf-8');print('Контраст клавиш увеличен')

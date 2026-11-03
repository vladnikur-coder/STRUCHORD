#!/usr/bin/env python3
"""B-39: рамка и мягкое свечение выбранных клавиш во всех темах, поверх 0.739."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
a="html:not([data-theme='dark']):not([data-scheme]) .b39-keys-svg rect[fill=\"var(--color-accent, #2f855a)\"] { fill: #3475b9; }"
b=a+'''\n/* Статическое свечение и контрастный контур не меняют геометрию клавиш. */
.b39-keys-svg rect[fill="var(--color-accent, #2f855a)"] {
  stroke: var(--color-on-accent, #fff); stroke-width: .1rem;
  filter: drop-shadow(0 0 .22rem var(--color-accent, #2f855a));
}'''
if s.count(a)!=1:raise SystemExit(f'{s.count(a)} совпадений')
p.write_text(s.replace(a,b,1),encoding='utf-8');print('Подсветка клавиш усилена')

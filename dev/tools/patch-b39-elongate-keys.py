#!/usr/bin/env python3
"""B-39: более вытянутые по вертикали клавиши, поверх 0.733."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
a='      var h = Math.max(72, Math.min(78, Math.floor(free * 16 / rem - 16)));'
b='      var h = Math.max(100, Math.min(112, Math.floor(free * 16 / rem - 16)));'
if s.count(a)!=1:raise SystemExit(f'{s.count(a)} совпадений: {a}')
p.write_text(s.replace(a,b,1),encoding='utf-8');print('Клавиши вытянуты по вертикали')

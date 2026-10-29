#!/usr/bin/env python3
"""B-39: вернуть обычную высоту транспорта при открытой клавиатуре, поверх 0.730."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 if s.count(a)!=1:raise SystemExit(f'{s.count(a)} совпадений: {a[:100]!r}')
 s=s.replace(a,b,1)
rep('body.b39-keys-open .transport-bar { padding-top:.1rem; padding-bottom:.1rem; }\n','')
rep("    doc.body.classList.add('b39-keys-open'); panel.hidden = false;", "    panel.hidden = false;")
rep("    restoreHover(); panel.hidden = true; doc.body.classList.remove('b39-keys-open');", "    restoreHover(); panel.hidden = true;")
p.write_text(s,encoding='utf-8');print('Плеер сохраняет обычный вид')

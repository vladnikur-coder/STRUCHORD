#!/usr/bin/env python3
"""B-39: центрированная панель по ширине клавиатуры поверх 0.734."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
a='.b39-keys-panel { box-sizing: border-box; min-width: 0; width: 100%; margin: 0 0 1.25rem;'
b='.b39-keys-panel { box-sizing: border-box; min-width: min(28rem, 100%); max-width: 100%; width: max-content; margin: 0 auto 1.25rem;'
if s.count(a)!=1:raise SystemExit(f'{s.count(a)} совпадений: {a}')
s=s.replace(a,b,1)
a='.b39-keys-body svg.b39-keys-svg { display: block; height: auto; max-width: none; }'
b='.b39-keys-body svg.b39-keys-svg { display: block; height: auto; max-width: none; margin-inline: auto; }'
if s.count(a)!=1:raise SystemExit(f'{s.count(a)} совпадений: {a}')
s=s.replace(a,b,1)
a='.b39-keys-settings { padding-top:.15rem; }'
b='.b39-keys-settings { contain: inline-size; padding-top:.15rem; }'
if s.count(a)!=1:raise SystemExit(f'{s.count(a)} совпадений: {a}')
s=s.replace(a,b,1)
a='.b39-keys-panel select { flex:1 1 0;'
b='.b39-keys-panel.is-compact-range .b39-keys-field { flex-direction:column; align-items:stretch; }\n.b39-keys-panel.is-compact-range .b39-keys-field select { flex:0 0 auto; }\n.b39-keys-panel select { flex:1 1 0;'
if s.count(a)!=1:raise SystemExit(f'{s.count(a)} совпадений: {a}')
s=s.replace(a,b,1)
a='    var range = T.keyRange(active.track.id);\n    if(linkedToggle)'
b="    var range = T.keyRange(active.track.id);\n    panel.classList.toggle('is-compact-range', range.size === 25);\n    if(linkedToggle)"
if s.count(a)!=1:raise SystemExit(f'{s.count(a)} совпадений: {a}')
s=s.replace(a,b,1)
a='.b39-keys-body svg.b39-keys-svg { display: block; height: auto; max-width: none; margin-inline: auto; }'
b='.b39-keys-body svg.b39-keys-svg { display: block; height: auto; max-width: none; margin-inline: auto; }\n.b39-keys-body > .b39-keys-foot { max-width:none; white-space:normal; overflow:visible; }'
if s.count(a)!=1:raise SystemExit(f'{s.count(a)} совпадений: {a}')
s=s.replace(a,b,1)
p.write_text(s,encoding='utf-8');print('Панель центрирована')

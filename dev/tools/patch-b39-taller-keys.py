#!/usr/bin/env python3
"""B-39: клавиши видимой высоты и компактное управление поверх 0.729."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 if s.count(a)!=1:raise SystemExit(f'{s.count(a)} совпадений: {a[:100]!r}')
 s=s.replace(a,b,1)
rep('body.b39-keys-open .transport-bar { padding-top:.2rem; padding-bottom:.2rem; }','body.b39-keys-open .transport-bar { padding-top:.1rem; padding-bottom:.1rem; }')
rep('  max-height: max(0px, calc(25vh - var(--b39-keys-bar-height, 0px) - .9rem));\n','')
rep('.b39-keys-panel.is-settings-open { max-height: none; }\n','')
rep('.b39-keys-close, .b39-keys-settings-toggle { flex:0 0 auto; min-width:1.7rem; min-height:1.7rem;', '.b39-keys-close, .b39-keys-settings-toggle { flex:0 0 auto; min-width:1.6rem; min-height:1.6rem;')
rep('.b39-keys-nav button { min-width: 1.7rem; min-height: 1.7rem;', '.b39-keys-nav button { min-width: 1.6rem; min-height: 1.6rem;')
rep('''    var barHeight = bar.offsetHeight + 'px';
    if (panel.style.getPropertyValue('--b39-keys-bar-height') !== barHeight) panel.style.setProperty('--b39-keys-bar-height', barHeight);
''','')
rep('''      var h = Math.max(12, Math.min(78, Math.floor(free * 16 / rem - 16)));''','''      // Четверть окна — ориентир; при нехватке места не сплющиваем клавиши.
      var h = Math.max(48, Math.min(78, Math.floor(free * 16 / rem - 16)));''')
p.write_text(s,encoding='utf-8');print('Высота клавиш увеличена')

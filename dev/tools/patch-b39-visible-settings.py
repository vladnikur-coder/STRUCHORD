#!/usr/bin/env python3
"""B-39: настройки видны сразу после раскрытия, поверх 0.727."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 if s.count(a)!=1: raise SystemExit(f'Найдено {s.count(a)} совпадений: {a[:90]!r}')
 s=s.replace(a,b,1)
rep('.b39-keys-settings { padding-top:.5rem; }','.b39-keys-settings { padding-top:.15rem; }')
rep('align-items: end; gap: .65rem; margin-bottom: .65rem; }','align-items: end; gap: .4rem; margin-bottom: .4rem; }')
rep('flex-direction: column; gap: .25rem; font-size: .75rem;', 'flex-direction: column; gap: .1rem; font-size: .75rem;')
rep('.b39-keys-panel select { min-height: 2.5rem; width: 100%; max-width: 100%; font: inherit; font-size: .85rem; padding: .4rem .5rem;', '.b39-keys-panel select { min-height: 1.8rem; width: 100%; max-width: 100%; font: inherit; font-size: .85rem; padding: .15rem .4rem;')
rep('''      settings.hidden = !settings.hidden; settingsToggle.setAttribute('aria-expanded', String(!settings.hidden));''','''      settings.hidden = !settings.hidden;
      // В ограниченной панели настройки раньше оказывались целиком ниже клавиш.
      // Временно меняем клавиатуру на настройки, не увеличивая общую высоту.
      body.hidden = !settings.hidden;
      settingsToggle.setAttribute('aria-expanded', String(!settings.hidden));
      panel.scrollTop = 0;''')
rep('flex-direction: column; gap: .1rem; font-size: .75rem; color: var(--color-text-secondary, #666); }','flex-direction: row; align-items:center; gap: .4rem; font-size: .75rem; color: var(--color-text-secondary, #666); }')
rep('.b39-keys-panel select { min-height: 1.8rem; width: 100%; max-width: 100%; font: inherit; font-size: .85rem; padding: .15rem .4rem;','.b39-keys-panel select { flex:1 1 0; min-width:0; min-height: 1.6rem; width: 100%; max-width: 100%; font: inherit; font-size: .85rem; padding: .1rem .4rem;')
p.write_text(s,encoding='utf-8');print('Настройки панели видны сразу')

#!/usr/bin/env python3
"""B-39: развёрнутые настройки без ограничения высоты и внутренней прокрутки, поверх 0.728."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 if s.count(a)!=1: raise SystemExit(f'{s.count(a)} совпадений: {a[:100]!r}')
 s=s.replace(a,b,1)
rep('''  overflow-y: auto; overscroll-behavior-y: contain;
  background: var(--color-surface, #fff);''','''  overflow: visible;
  background: var(--color-surface, #fff);''')
rep('''.b39-keys-panel[hidden] { display: none; }''','''.b39-keys-panel[hidden] { display: none; }
.b39-keys-panel.is-settings-open { max-height: none; }''')
rep('''      settings.hidden = !settings.hidden;
      // В ограниченной панели настройки раньше оказывались целиком ниже клавиш.
      // Временно меняем клавиатуру на настройки, не увеличивая общую высоту.
      body.hidden = !settings.hidden;
      settingsToggle.setAttribute('aria-expanded', String(!settings.hidden));
      panel.scrollTop = 0;''','''      settings.hidden = !settings.hidden;
      // С настройками панель раскрывается целиком; вертикальной прокрутки внутри нет.
      panel.classList.toggle('is-settings-open', !settings.hidden);
      settingsToggle.setAttribute('aria-expanded', String(!settings.hidden));''')
p.write_text(s,encoding='utf-8');print('Настройки разворачиваются без внутренней прокрутки')

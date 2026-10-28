#!/usr/bin/env python3
"""B-39: убрать неинформативную кнопку у названия секции (0.708)."""
from pathlib import Path
p = Path('STRUCHORD.html')
s = p.read_text(encoding='utf-8')
old = '''    Array.prototype.forEach.call(doc.querySelectorAll('.section-card[data-id] .section-mod-badges'), function (badges) {
      var button = badges.querySelector('.b39-section-accomp');
      if (!on) { if (button) button.remove(); return; }
      if (!button) {
        var card = badges.closest('.section-card');
        button = el('button', 'section-badge b39-section-accomp', 'Аккомп.');
        button.type = 'button'; button.title = 'Аккомпанемент секции';
        button.addEventListener('click', function (e) { e.stopPropagation(); HOST.openStrumPatternEditor('section', Number(card.dataset.id)); });
        badges.appendChild(button);
      }
    });
'''
if s.count(old) != 1:
    raise SystemExit('Патч не применён: якорь не найден или не уникален')
p.write_text(s.replace(old, '', 1), encoding='utf-8')
print('Патч применён')

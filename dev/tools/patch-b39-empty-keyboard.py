#!/usr/bin/env python3
"""B-39: клавиатура активной дорожки видна и без аккордов (0.746)."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 if s.count(a)!=1:raise SystemExit('Неоднозначное совпадение: '+a[:100])
 s=s.replace(a,b,1)
rep("""    panel.classList.toggle('has-keyboard', !!chord);
    if (!chord) {
      titleEl.textContent = 'Клавиатура';
      body.innerHTML = '<div class="b39-keys-foot">' + (cell ? 'В этой ячейке нет аккорда активной дорожки.' : 'На активной дорожке пока нет аккордов.') + '</div>';
      countEl.textContent = '—'; foot.textContent = ''; bassEl.textContent = ''; lastVisibleContext = null;
      return;
    }
    var variants = generateKeysVoicings(chord, panelKey(), range, null, {});""", """    // Диапазон дорожки виден всегда, даже без секций или в пустой ячейке.
    // Без аккорда отображаем те же клавиши, но без подсветки и баса.
    panel.classList.add('has-keyboard');
    var variants = chord ? generateKeysVoicings(chord, panelKey(), range, null, {}) : [];""")
rep("    var selected=linkedSelection(active.track.id,lastCellKey);\n    var notes = selected", "    var selected=chord ? linkedSelection(active.track.id,lastCellKey) : null;\n    var notes = selected")
rep("    var f = F.chordFormula(chord, panelKey());\n    var whiteW = resizedWhiteWidth", "    var f = chord ? F.chordFormula(chord, panelKey()) : null;\n    var whiteW = resizedWhiteWidth")
rep("    titleEl.textContent = chord;\n    var oldScroll", "    titleEl.textContent = chord || 'Клавиатура';\n    var oldScroll")
rep("    var svg = body.querySelector('svg'); if (svg) svg.style.width = (res.width / 16) + 'rem';", "    var svg = body.querySelector('svg'); if (svg) { svg.style.width = (res.width / 16) + 'rem'; if (!chord) svg.setAttribute('aria-label', 'Клавиатура без выбранного аккорда'); }")
rep("    countEl.textContent = selected && selected.chord===chord ? (selected.limited ? 'Обычная' : selected.manual ? 'Ручная' : 'Авто') : (idx + 1) + '/' + Math.max(1, variants.length);", "    countEl.textContent = !chord ? '—' : selected && selected.chord===chord ? (selected.limited ? 'Обычная' : selected.manual ? 'Ручная' : 'Авто') : (idx + 1) + '/' + Math.max(1, variants.length);")
rep("    if (showFingersEnabled()) footParts.push('цифры условны, это не аппликатура');", "    if (chord && showFingersEnabled()) footParts.push('цифры условны, это не аппликатура');")
rep("    if (r.top < bottom || r.top > (HOST.innerHeight || 600) * 0.8) panel.scrollIntoView({block:'start'});", "    if (r.top < bottom || r.bottom > (HOST.innerHeight || 600)) panel.scrollIntoView({block:'start'});")
p.write_text(s,encoding='utf-8');print('Клавиатура видна без аккорда')

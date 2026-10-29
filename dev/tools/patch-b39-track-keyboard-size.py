#!/usr/bin/env python3
"""B-39: один размер клавиатуры активной дорожки; поверх 0.722."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 if s.count(a)!=1:raise SystemExit(f'Патч не применён: {s.count(a)} совпадений: {a[:100]!r}')
 s=s.replace(a,b,1)
rep("  var sizeSel = null, timbreSel = null;", "  var timbreSel = null;")
rep('grid-template-columns: repeat(4, minmax(0, 1fr)); align-items: end;', 'grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: end;')
rep('''    sizeSel = el('select'); sizeSel.setAttribute('aria-label', 'Размер клавиатуры песни');
    [25, 37, 49, 61, 76, 88].forEach(function (n) {
      var op = el('option', '', n + ' клавиш'); op.value = String(n); sizeSel.appendChild(op);
    });
    sizeSel.addEventListener('change', function () {
      var T = tracks(); if (T) T.setKeyboardSize(Number(sizeSel.value));
      renderPanel();
    });
''','')
rep("    var defaultSizeOption = el('option', '', 'Как в песне'); defaultSizeOption.value = ''; trackSizeSel.appendChild(defaultSizeOption);\n",'')
rep("    trackSizeSel.addEventListener('change', function () { var T = tracks(), st = T && T.state(); if (st) T.setTrackKeyboardSize(st.activeTrackId, trackSizeSel.value === '' ? null : Number(trackSizeSel.value)); renderPanel(); });", "    trackSizeSel.addEventListener('change', function () { var T = tracks(), st = T && T.state(); if (st) T.setTrackKeyboardSize(st.activeTrackId, Number(trackSizeSel.value)); renderPanel(); });")
rep("    field('Размер песни', sizeSel); field('Размер дорожки', trackSizeSel); field('Общий тембр клавиш', timbreSel);", "    field('Размер клавиатуры', trackSizeSel); field('Общий тембр клавиш', timbreSel);")
rep("    if (sizeSel) sizeSel.value = String(T.state().keyboardSize);\n    var trackSizeSelect = doc.getElementById('b39KeysTrackSize');\n    if (trackSizeSelect) trackSizeSelect.value = active.track.keyboardSize == null ? '' : String(active.track.keyboardSize);", "    var trackSizeSelect = doc.getElementById('b39KeysTrackSize');\n    // Старые файлы могут не содержать размер дорожки: показываем фактический диапазон, ничего не записывая.\n    if (trackSizeSelect) trackSizeSelect.value = String(range.size);")
p.write_text(s,encoding='utf-8');print('Панель: размер только активной дорожки')

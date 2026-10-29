#!/usr/bin/env python3
"""B-39: скрыть строй песни при активной клавишной дорожке, поверх 0.743."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 if s.count(a)!=1:raise SystemExit(f'{s.count(a)} совпадений: {a[:120]!r}')
 s=s.replace(a,b,1)
rep('''        <span class="meta-label">Строй</span>
        <button class="tuning-pill" id="tuningPill"''','''        <span class="meta-label" id="tuningPillLabel">Строй</span>
        <button class="tuning-pill" id="tuningPill"''')
rep('''html.b39-keys-mode .strum-badge-wrap { display:none !important; }''','''html.b39-keys-mode .strum-badge-wrap { display:none !important; }
/* Строй относится к струнным инструментам, а не активной клавишной дорожке. */
html.b39-keys-mode #tuningPillLabel, html.b39-keys-mode #tuningPill,
html.b39-keys-mode #tuningPickerList { display:none !important; }''')
rep('''    // Кнопок клавишных окон на гитаре нет — значит и открытые окна закрываем.
    if (!on) {''','''    // Не оставлять раскрытый гитарный строй при смене активной дорожки.
    var tuningList = doc.getElementById('tuningPickerList');
    if (on && tuningList && !tuningList.hidden && typeof HOST.toggleTuningPicker === 'function') HOST.toggleTuningPicker(false);
    // Кнопок клавишных окон на гитаре нет — значит и открытые окна закрываем.
    if (!on) {''')
p.write_text(s,encoding='utf-8');print('Строй скрыт на клавишной дорожке')

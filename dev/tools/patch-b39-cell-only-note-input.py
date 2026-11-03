#!/usr/bin/env python3
"""0.751: убрать дублирующую кнопку ввода в панели клавиш."""
from pathlib import Path
p = Path('STRUCHORD.html')
s = p.read_text(encoding='utf-8')
changes = [
    ('.b39-note-input select, .b39-note-input input, .b39-note-input button, .b39-input-start {', '.b39-note-input select, .b39-note-input input, .b39-note-input button {'),
    ('.b39-note-input button, .b39-input-start { cursor:pointer; }', '.b39-note-input button { cursor:pointer; }'),
    ('noteCandidates = null, noteInfo = null, noteStart = null;', 'noteCandidates = null, noteInfo = null;'),
    ('    if(noteStart)noteStart.hidden=!!noteDraft;\n', ''),
    ('if(noteBar)noteBar.hidden=true; if(noteStart)noteStart.hidden=false; if(panel)', 'if(noteBar)noteBar.hidden=true; if(panel)'),
    ("    noteStart=el('button','b39-input-start','♫');noteStart.type='button';noteStart.id='b39NoteStart';noteStart.title='Ввести по клавишам';noteStart.setAttribute('aria-label','Ввести по клавишам');\n    noteStart.addEventListener('click',function(){beginNoteInput(selectedCellKey);});\n    head.appendChild(identity); head.appendChild(nav); head.appendChild(noteStart); head.appendChild(settingsToggle); head.appendChild(close);", "    head.appendChild(identity); head.appendChild(nav); head.appendChild(settingsToggle); head.appendChild(close);"),
]
for old,new in changes:
    if s.count(old)!=1: raise SystemExit(f'Expected one occurrence: {old[:100]!r}, found {s.count(old)}')
    s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

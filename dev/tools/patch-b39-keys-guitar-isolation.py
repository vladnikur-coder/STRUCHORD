#!/usr/bin/env python3
"""B-39: оградить клавишную дорожку от гитарных действий формы (0.749)."""
from pathlib import Path
p=Path('STRUCHORD.html'); s=p.read_text(encoding='utf-8')
def replace(old,new):
 global s
 if s.count(old)!=1: raise SystemExit(f'Ожидалось одно вхождение: {old[:100]!r}, найдено {s.count(old)}')
 s=s.replace(old,new,1)
replace('html.b39-keys-mode .fingering-tooltip svg:not(.b39-keys-svg) { display: none !important; }','''html.b39-keys-mode .fingering-tooltip svg:not(.b39-keys-svg) { display: none !important; }
/* Старые стрелки и карандаш управляют гитарными формами, не клавишами. */
html.b39-keys-mode .fingering-tooltip .tooltip-controls,
html.b39-keys-mode .tl-fing-controls { display: none !important; }''')
replace('function openFingeringEditor(chordName, variantIndex, wrapper, opts = {}) {\n  const createMode', '''function openFingeringEditor(chordName, variantIndex, wrapper, opts = {}) {
  // Гитарный редактор сохраняет формы в общую ячейку и библиотеку.
  // При активных клавишах он не должен менять другую дорожку.
  if (window.StruChordAccomp && window.StruChordAccomp.activeIsKeys()) return;
  const createMode''')
replace('function showManualInputFingeringHint(inp, onActivate) {\n  hideManualInputFingeringHint();','''function showManualInputFingeringHint(inp, onActivate) {
  hideManualInputFingeringHint();
  if (window.StruChordAccomp && window.StruChordAccomp.activeIsKeys()) return;''')
replace("      if (leftBtn || rightBtn) {\n        e.stopPropagation();\n        // Отсчёт", "      if (leftBtn || rightBtn) {\n        e.stopPropagation();\n        if (window.StruChordAccomp && window.StruChordAccomp.activeIsKeys()) return;\n        // Отсчёт")
p.write_text(s,encoding='utf-8')

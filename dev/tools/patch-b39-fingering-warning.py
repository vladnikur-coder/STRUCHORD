#!/usr/bin/env python3
"""B-39: обозначить условную нумерацию пальцев, не меняя сохранённые данные."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 n=s.count(a)
 if n!=1: raise SystemExit('ПАТЧ НЕ ПРИМЕНЁН: %d совпадений %r' %(n,a[:100]))
 s=s.replace(a,b,1)
rep('    var height = whiteH + labelSpace;\n    var accent', '    var height = whiteH + labelSpace + (o.showFingers ? 16 : 0);\n    var accent')
rep("      'role=\"img\" aria-label=\"Клавиши аккорда\">');", "      'role=\"img\" aria-label=\"' + (o.showFingers ? 'Клавиши аккорда. Номера пальцев условны, это не аппликатура' : 'Клавиши аккорда') + '\">');")
rep("    parts.push('</svg>');\n    return { svg: parts.join(''), width: width, height: height, whites: layout.whites };", """    if (o.showFingers) {
      parts.push('<text x="2" y="' + (whiteH + labelSpace + 11) + '" font-size="9" fill="' + text + '">Цифры условны — не аппликатура</text>');
    }
    parts.push('</svg>');
    return { svg: parts.join(''), width: width, height: height, whites: layout.whites };""")
rep("'<text x=\"2\" y=\"' + (res.height - 2) + '\" font-size=\"9\" fill=\"var(--color-text-tertiary,#999)\">'", "'<text x=\"2\" y=\"' + (res.height - (showFingersEnabled() ? 18 : 2)) + '\" font-size=\"9\" fill=\"var(--color-text-tertiary,#999)\">'")
rep("(showFingersEnabled() ? ' · пальцы 1–5 — подсказка' : '');", "(showFingersEnabled() ? ' · цифры условны, это не аппликатура' : '');")
rep("  if (typeof renderTimeline === 'function' && timelineMode) renderTimeline();\n}\nfunction initFingersVisibility()", "  if (typeof renderTimeline === 'function' && timelineMode) renderTimeline();\n  if (window.StruChordKeys && typeof window.StruChordKeys.render === 'function') window.StruChordKeys.render();\n}\nfunction initFingersVisibility()")
p.write_text(s,encoding='utf-8');print('Патч применён')

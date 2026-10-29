#!/usr/bin/env python3
"""B-39: крупнее изображение клавиатуры, не меняя размеры дорожек и плеер, поверх 0.731."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 if s.count(a)!=1:raise SystemExit(f'{s.count(a)} совпадений: {a[:100]!r}')
 s=s.replace(a,b,1)
rep("    var labelSpace = o.labelSpace === undefined ? 22 : o.labelSpace;", "    var labelSpace = o.labelSpace === undefined ? 22 : o.labelSpace;\n    var labelFont = o.labelFont || 9, fingerFont = o.fingerFont || 9;")
rep("          '\" font-size=\"9\" fill=\"' + text + '\">C' + (Math.floor(k.midi / 12) - 1) + '</text>');", "          '\" font-size=\"' + labelFont + '\" fill=\"' + text + '\">C' + (Math.floor(k.midi / 12) - 1) + '</text>');")
rep("        parts.push('<text x=\"' + cx + '\" y=\"' + (whiteH - 3) + '\" font-size=\"9\" font-weight=\"700\" ' +", "        parts.push('<text x=\"' + cx + '\" y=\"' + (whiteH - 3) + '\" font-size=\"' + fingerFont + '\" font-weight=\"700\" ' +")
rep('      var h = Math.max(48, Math.min(78, Math.floor(free * 16 / rem - 16)));', '      var h = Math.max(72, Math.min(78, Math.floor(free * 16 / rem - 16)));')
rep('    var whiteW = 20;\n    var fingersVisible = showFingersEnabled();','    var whiteW = 28;\n    var fingersVisible = showFingersEnabled();')
rep('      rootPc: f ? f.rootPc : undefined, labelSpace: 16, showFingerWarning: false', '      rootPc: f ? f.rootPc : undefined, labelSpace: 16, labelFont: 11, fingerFont: 11, showFingerWarning: false')
p.write_text(s,encoding='utf-8');print('Изображение клавиш увеличено')

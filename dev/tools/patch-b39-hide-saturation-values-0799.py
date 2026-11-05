#!/usr/bin/env python3
"""0.799: remove numeric readouts beside both saturation sliders and bump paired release version."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
html_path = ROOT / 'STRUCHORD.html'
s = html_path.read_text()
repls = [
("    satVal = el('span', 'b39-keys-sat-val', '50');\n", ""),
("      satVal.textContent = satInput.value;\n", ""),
("    satWrap.appendChild(satInput); satWrap.appendChild(satVal);", "    satWrap.appendChild(satInput);"),
(" { satInput.value = String(sv); satVal.textContent = String(sv); }", " { satInput.value = String(sv); }"),
("    var satVal=element('span','b39-auto-sat-val',sat.value);sat.addEventListener('input',function(){satVal.textContent=sat.value;});\n", ""),
("    satRow.appendChild(element('span','','Насыщенность'));satRow.appendChild(sat);satRow.appendChild(satVal);box.appendChild(satRow);saturationInput=sat;", "    satRow.appendChild(element('span','','Насыщенность'));satRow.appendChild(sat);box.appendChild(satRow);saturationInput=sat;"),
("· ver 0.798", "· ver 0.799"),
]
for old, new in repls:
    n = s.count(old)
    if n != 1:
        raise SystemExit(f'Ожидалось ровно одно совпадение ({n}): {old!r}')
    s = s.replace(old, new, 1)
html_path.write_text(s)
sw_path = ROOT / 'sw.js'
sw = sw_path.read_text()
if sw.count('struchord-v798') != 1:
    raise SystemExit('Ожидалось ровно одно имя кэша struchord-v798')
sw_path.write_text(sw.replace('struchord-v798', 'struchord-v799', 1))
print('OK: readout удалён, версия 0.799 и парный кэш обновлены')

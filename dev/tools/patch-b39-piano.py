#!/usr/bin/env python3
"""B-39: честное название и более плавная огибающая синтезированного пианино, поверх 0.716."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 n=s.count(a)
 if n!=1: raise SystemExit('ПАТЧ НЕ ПРИМЕНЁН: %d совпадений %r' %(n,a[:100]))
 s=s.replace(a,b,1)
rep("['piano', 'Рояль']", "['piano', 'Пианино']")
rep("{ id: 'piano', label: 'Рояль (синтез)'", "{ id: 'piano', label: 'Пианино (синтез)'")
rep("    var decay = Math.max(Number.isFinite(expression) ? 0.16 : 0.38, Math.min(2.6, dur * 1.5)) * (PEDAL ? 1.85 : 1);", """    // Нота сначала звучит заданную длительность, затем плавно затухает.
    // Прежняя огибающая гасила даже длинные ноты сразу после атаки.
    var held = Math.max(0.025, Math.min(12, Number(dur) || 0.4));
    var tail = PEDAL ? 0.6 : 0.18;""")
rep("      var tau = Math.max(0.08, decay / Math.pow(n, 0.55));\n      g.gain.setValueAtTime(0.0001, start);\n      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), start + 0.004);\n      g.gain.exponentialRampToValueAtTime(0.0001, start + tau);\n      osc.connect(g); g.connect(bus);\n      osc.start(start); osc.stop(start + tau + 0.02);", """      // Высокие призвуки затухают быстрее основного тона.
      var releaseAt = start + held;
      var sustain = Math.max(0.0002, amp * Math.exp(-held * Math.pow(n, 0.45) / 2.4));
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), start + 0.004);
      g.gain.exponentialRampToValueAtTime(sustain, releaseAt);
      g.gain.exponentialRampToValueAtTime(0.0001, releaseAt + tail);
      osc.connect(g); g.connect(bus);
      osc.start(start); osc.stop(releaseAt + tail + 0.02);""")
p.write_text(s,encoding='utf-8');print('Патч применён')

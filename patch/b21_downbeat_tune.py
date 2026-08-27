#!/usr/bin/env python3
# B-21 уточнение (2026-08-26): "1 не будет жирнее чем остальные цифры, только больше".
# is-downbeat: убрать font-weight 900 и свой цвет, оставить только font-size 12px.
import io, sys
PATH = '/home/user/STRUCHORD.html'
src = io.open(PATH, encoding='utf-8', errors='surrogateescape').read()
orig = src
edits = []

old = """/* «1» — якорь такта: крупнее, жирнее, основной цвет (B-21, спека
   «цифра 1 должна выделяться из остальных»). Ретроспективный дефект:
   класс is-downbeat ставится в разметке со времени уточнения B-04, а
   CSS-правила для него не было — визуально все цифры выглядели
   одинаково (10px/800 через .is-beat выше). */
.chord-wrapper .chord-count.is-downbeat {
  font-size: 12px;
  font-weight: 900;
  color: var(--color-text-primary);
}"""
new = """/* «1» — якорь такта: крупнее остальных (B-21, спека «цифра 1 должна
   выделяться из остальных»; уточнение 2026-08-26: «1 не будет жирнее
   чем остальные цифры, только больше» — вес и цвет общие, отличается
   только размером). Ретроспективный дефект: класс is-downbeat ставится
   в разметке со времени уточнения B-04, а CSS-правила для него не было —
   визуально все цифры выглядели одинаково (10px/800 через .is-beat выше). */
.chord-wrapper .chord-count.is-downbeat {
  font-size: 12px;
}"""
n = src.count(old)
if n != 1:
    edits.append(('B21T css downbeat: size only', False))
else:
    src = src.replace(old, new, 1)
    edits.append(('B21T css downbeat: size only', True))

failed = [name for name, ok in edits if not ok]
if failed:
    print('ABORTED, no changes written:'); [print('  MISSING:', f) for f in failed]; sys.exit(1)
if src != orig:
    io.open(PATH, 'w', encoding='utf-8', errors='surrogateescape').write(src)
    print('PATCHED')
else:
    print('PATCHED (no byte changes)')
for name, ok in edits: print(('  OK   ' if ok else '  FAIL ') + name)

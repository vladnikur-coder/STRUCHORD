#!/usr/bin/env python3
"""0.773: keep user fingerings when the key itself changes during respelling.

Reproduction: song in C, chord G# with a saved shape under "G#|C"; change the
key to Ab without transposing. The chord becomes Ab, the key becomes Ab, but
the shape stayed under "G#|C" and the cell showed a standard fingering.
The migration only rewrote the chord name and always used the NEW key.
"""
from pathlib import Path
import sys

html = Path(sys.argv[1]); s = html.read_text(encoding='utf-8')
def r(a, b, count=1):
    global s
    if s.count(a) != count:
        raise SystemExit(f'expected {count} occurrence(s), found {s.count(a)}: ' + a[:110])
    s = s.replace(a, b, count)

r("""function applyEnharmonicCorrectionToAll() {
  let ch = false;
  for (const s of sections) ch = applyEnharmonicCorrectionToSection(s) || ch;
  if (ch) requestRender();
}""", """// previousKeyOf — тональность секции ДО правки. Нужна, когда меняется сама
// тональность: свои формы аккорда лежат под парой «аккорд|тональность», и без
// старого ключа они остаются под прежним адресом и пропадают из ячейки.
function applyEnharmonicCorrectionToAll(previousKeyOf) {
  let ch = false;
  for (const s of sections) {
    const previousKey = typeof previousKeyOf === 'function' ? previousKeyOf(s) : previousKeyOf;
    ch = applyEnharmonicCorrectionToSection(s, previousKey) || ch;
  }
  if (ch) requestRender();
}""")

r("""function applyEnharmonicCorrectionToSection(s) {
  let ch = false;
  const sectionKey = s.key ? s.key : globalKey;
  const sectionKeyStyle = getKeyStyle(sectionKey);""", """function applyEnharmonicCorrectionToSection(s, previousKey) {
  let ch = false;
  const sectionKey = s.key ? s.key : globalKey;
  const previousSectionKey = typeof previousKey === 'string' && previousKey ? previousKey : sectionKey;
  const sectionKeyStyle = getKeyStyle(sectionKey);""")

r("""          migrateFingeringChordName(orig, corr, sectionKey, s.id, sq.id, i);""",
  """          migrateFingeringChordName(orig, corr, previousSectionKey, sectionKey, s.id, sq.id, i);""")

r("""function migrateFingeringChordName(oldName, newName, key, secId, squareId, eventIndex) {""",
  """function migrateFingeringChordName(oldName, newName, oldKey, newKey, secId, squareId, eventIndex) {""")

r("""  const oldBase = oldName + '|' + key;
  const newBase = newName + '|' + key;""", """  const oldBase = oldName + '|' + oldKey;
  const newBase = newName + '|' + newKey;""")

r("""  const oldPosKey = buildFingeringPositionKey(oldName, key, secId, squareId, eventIndex);
  const newPosKey = buildFingeringPositionKey(newName, key, secId, squareId, eventIndex);""",
  """  const oldPosKey = buildFingeringPositionKey(oldName, oldKey, secId, squareId, eventIndex);
  const newPosKey = buildFingeringPositionKey(newName, newKey, secId, squareId, eventIndex);""")

# changeOnly: remember each section's effective key before it is recalculated.
r("""  songStore.dispatch('key/change-only', () => {
    for (const s of sections) {
      if (s.key) {""", """  songStore.dispatch('key/change-only', () => {
    const previousKeys = new Map();
    for (const s of sections) {
      previousKeys.set(s.id, s.key || oldGlobalKey);
      if (s.key) {""")
r("""    globalKey = newGlobalKey;
    applyEnharmonicCorrectionToAll();
  }, opts);""", """    globalKey = newGlobalKey;
    applyEnharmonicCorrectionToAll((s) => previousKeys.get(s.id) || oldGlobalKey);
  }, opts);""")

# Key select: mode change and the empty-song branch do not transpose chords.
r("""    songStore.dispatch('key/change', () => {
    globalKey = newGlobalKey;
    applyEnharmonicCorrectionToAll();""", """    songStore.dispatch('key/change', () => {
    const previousKeys = new Map(sections.map((s) => [s.id, s.key || oldGlobalKey]));
    globalKey = newGlobalKey;
    applyEnharmonicCorrectionToAll((s) => previousKeys.get(s.id) || oldGlobalKey);""", count=2)

if 'previousSectionKey' not in s or s.count('migrateFingeringChordName(orig, corr, previousSectionKey') != 1:
    raise SystemExit('patch did not apply cleanly')
html.write_text(s, encoding='utf-8')
print('enharmonic fingering keys patched')

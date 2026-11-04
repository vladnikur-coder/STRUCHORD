#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""0.792 fixup 2 — стрелки/тоггл не конфликтуют с голосоведением.

Владелец: «обращения неплохо, но конфликтуют с голосоведением; то, о чём я
говорил, — про случай, когда голосоведение ВЫКЛЮЧЕНО».

Правило: при включённом голосоведении (linkedVoicings) авто-выбор единственный —
стрелки ‹ › и тоггл «Плотно|Широко» скрыты (видна кнопка «Сбросить выбор
позиции» для ручного сброса); при выключенном голосоведении стрелки ходят по
обращениям, тоггл переключает плотность, умолчание — основное положение.
Модель не меняется: ручной индекс по-прежнему побеждает в linkedSelection,
exactNotes побеждает всегда.

    python3 dev/tools/patch-b119c-linked-conflict-0792.py --check
    python3 dev/tools/patch-b119c-linked-conflict-0792.py
"""
import argparse
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]


def replace_once(text, old, new, label):
    n = text.count(old)
    if n != 1:
        raise SystemExit('ПАТЧ НЕ ПРИМЕНЁН: якорь «%s» найден %d раз (нужен ровно 1)' % (label, n))
    return text.replace(old, new, 1)


# 1. CSS: при включённом голосоведении стрелки и тоггл скрыты (счётчик виден)
CSS_OLD = """.b39-density-btn[aria-pressed="true"] { background: var(--color-accent, #2c3e66); border-color: var(--color-accent, #2c3e66); color: #fff; }"""
CSS_NEW = """.b39-density-btn[aria-pressed="true"] { background: var(--color-accent, #2c3e66); border-color: var(--color-accent, #2c3e66); color: #fff; }
/* 0.792: при включённом голосоведении авто-выбор единственный — стрелки и
   тоггл плотности скрыты, чтобы не конфликтовать с авто (счётчик виден). */
.b39-keys-panel.is-linked .b39-keys-nav button, .b39-keys-panel.is-linked .b39-keys-density { display: none; }"""

# 2. renderPanel: класс is-linked
R_OLD = """    if(linkedToggle)linkedToggle.checked=!!active.track.linkedVoicings;"""
R_NEW = """    if(linkedToggle)linkedToggle.checked=!!active.track.linkedVoicings;
    panel.classList.toggle('is-linked', !!active.track.linkedVoicings);"""

# 3. stepVariant: guard + убираем авто→ручной переход (конфликт)
S_OLD = """  function stepVariant(delta) {
    var T = tracks(); if (!T || !lastChord || noteDraft) return;
    var active = activeTrack(); if (!active || !active.track) return;
    var range = T.keyRange(active.track.id);
    if (T.exactNotes(active.track.id, lastCellKey, lastChord)) {
      if (!HOST.confirm('Снять вручную введённые ноты этой ячейки и вернуться к обычному расположению?')) return;
      T.clearExactNotes(active.track.id, lastCellKey);
      renderPanel(); return;
    }
    var cur = currentVariantSlot(active.track.id, lastChord, lastCellKey, range);
    var n = cur.st.slots.length; if (!n) return;
    var selection = linkedSelection(active.track.id, lastCellKey);
    if (selection && selection.chord === lastChord && !selection.manual) {
      // Авто-выбор: первое нажатие стрелки — ручное основное (вперёд) / последнее (назад).
      var t0 = delta > 0 ? cur.st.slots[0].base : cur.st.slots[n - 1].base;
      setVariantIndex(active.track.id, lastChord, lastCellKey, t0, cur.st.list.length);
      renderPanel(); return;
    }
    var inv = ((cur.inv + delta) % n + n) % n, slot = cur.st.slots[inv];"""
S_NEW = """  function stepVariant(delta) {
    var T = tracks(); if (!T || !lastChord || noteDraft) return;
    var active = activeTrack(); if (!active || !active.track) return;
    // 0.792: стрелки по обращениям — только при ВЫКЛЮЧЕННОМ голосоведении,
    // иначе конфликт с авто-выбором (там ручной сброс — кнопкой «Сбросить»).
    if (active.track.linkedVoicings) return;
    var range = T.keyRange(active.track.id);
    if (T.exactNotes(active.track.id, lastCellKey, lastChord)) {
      if (!HOST.confirm('Снять вручную введённые ноты этой ячейки и вернуться к обычному расположению?')) return;
      T.clearExactNotes(active.track.id, lastCellKey);
      renderPanel(); return;
    }
    var cur = currentVariantSlot(active.track.id, lastChord, lastCellKey, range);
    var n = cur.st.slots.length; if (!n) return;
    var inv = ((cur.inv + delta) % n + n) % n, slot = cur.st.slots[inv];"""

# 4. toggleDensity: guard
T_OLD = """  function toggleDensity() {
    var T = tracks(); if (!T || !lastChord || noteDraft) return;
    var active = activeTrack(); if (!active || !active.track) return;
    var range = T.keyRange(active.track.id);"""
T_NEW = """  function toggleDensity() {
    var T = tracks(); if (!T || !lastChord || noteDraft) return;
    var active = activeTrack(); if (!active || !active.track) return;
    if (active.track.linkedVoicings) return; // toggl — только при выключенном голосоведении
    var range = T.keyRange(active.track.id);"""


def main():
    ap = argparse.ArgumentParser(description='0.792 fixup: стрелки/тоггл только при выключенном голосоведении')
    ap.add_argument('--check', action='store_true', help='только проверить якоря, файлы не менять')
    args = ap.parse_args()
    p = ROOT / 'STRUCHORD.html'
    text = p.read_text(encoding='utf-8')
    for old, new, label in [
        (CSS_OLD, CSS_NEW, 'CSS: скрыть nav-кнопки и toggl при is-linked'),
        (R_OLD, R_NEW, 'renderPanel: класс is-linked'),
        (S_OLD, S_NEW, 'stepVariant: guard + убран авто→ручной переход'),
        (T_OLD, T_NEW, 'toggleDensity: guard'),
    ]:
        text = replace_once(text, old, new, label)
    print('  ok  STRUCHORD.html  4 якоря')
    if args.check:
        print('ПРОВЕРКА ПРОЙДЕНА: все якоря на месте, файл не менялся.')
        return 0
    p.write_text(text, encoding='utf-8')
    print('ПАТЧ ПРИМЕНЁН: стрелки/тоггл работают только при выключенном голосоведении.')
    return 0


if __name__ == '__main__':
    sys.exit(main())

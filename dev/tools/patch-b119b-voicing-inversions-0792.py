#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""B-119 rework / 0.792 — стрелки по обращениям + тоггл «Плотно | Широко».

Патч по якорям, без `git apply`. Применяется один раз к состоянию после
revert 0.791 (т.е. к 0.790):

    python3 dev/tools/patch-b119b-voicing-inversions-0792.py --check
    python3 dev/tools/patch-b119b-voicing-inversions-0792.py

Владелец отклонил 0.791 (карточки не увидел / не принял) и направил дизайн:
при наведении на аккорд панель клавиш показывает, как его сыграть; стрелки
‹ › переключают ОБРАЩЕНИЯ (по умолчанию основное положение: для C — бас C +
C E G, для Am — бас A + A C E); рядом тоггл «Плотно | Широко», где широко =
верхняя нота правой руки +12 (октава). Варианты должны быть играбельны.
«Широко» — только на клавиатурах 61+ и если нота влезает в диапазон и руку.
Ручной выбор поверх авто и сохраняется; exactNotes побеждает; звук/превью/
экспорт резолвят индекс по тому же списку. Версия 0.792 (0.791 откачен).

Список вариантов: voicingVariantStructure = [обращения (основное первым)]
+ в хвосте широкие копии (top RH +12). Стрелки ходят по обращениям внутри
текущего блока плотности; тоггл переключает base/wide у текущего обращения.
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


# 1. Новые функции перед motionCost (после inversionCandidates)
FUNC_ANCHOR = """  function motionCost(prev,next) {"""
FUNC_NEW = """  // 0.792 (B-119 rework; владелец отклонил карточки 0.791): список вариантов =
  // ОБРАЩЕНИЯ аккорда (основное положение первым — для C: бас C + C E G, для
  // Am: бас A + A C E, размах правой руки ограничен, играбельно) + в хвосте
  // «широкие» копии с верхней нотой правой руки +12 (только на 61+ и если
  // нота влезает в диапазон и в handLimit).
  function voicingVariantStructure(chord, key, range) {
    var invs = inversionCandidates(chord, key, range);
    var basic = generateKeysVoicings(chord, key, range, null, {});
    if (basic.length) {
      var sig0 = basic[0].join(',');
      invs = [basic[0]].concat(invs.filter(function (v) { return v.join(',') !== sig0; }));
    }
    // Только канонические обращения в первой октаве правой руки: стрелки
    // переключают обращения, а не регистры (играбельные положения пианиста).
    var lo = Math.max(range.low + 12, 48);
    var oneOct = invs.filter(function (v) { return v.length > 1 && v[1] >= lo && v[1] < lo + 12; });
    if (oneOct.length) invs = oneOct;
    // Первым — основное положение (правая рука с корня: C -> C E G, Am -> A C E).
    var F = formula(), f = F && F.chordFormula(chord, key);
    var rootPc = f && Number.isInteger(f.rootPc) ? f.rootPc : null;
    if (rootPc !== null) {
      for (var k = 0; k < invs.length; k++) {
        if (invs[k].length > 1 && mod12(invs[k][1]) === rootPc) {
          invs.unshift(invs.splice(k, 1)[0]);
          break;
        }
      }
    }
    var list = invs.slice(), slots = [];
    var size = (range && range.size) || 61, limit = handLimit(size), rhHigh = Math.min(range.high, 84);
    invs.forEach(function (base, i) {
      var slot = { base: i, wide: -1 }, rh = base.slice(1);
      if (size >= 61 && rh.length && base.length < limit && base.length < 9) {
        var extra = Math.max.apply(null, rh) + 12;
        if (extra <= rhHigh) {
          var dup = base.concat([extra]).sort(function (a, b) { return a - b; });
          var sig = dup.join(',');
          if (!list.some(function (v) { return v.join(',') === sig; })) { slot.wide = list.length; list.push(dup); }
        }
      }
      slots.push(slot);
    });
    return { list: list, slots: slots };
  }
  // Единый список вариантов для UI (стрелки/тоггл), ручного выбора и звука:
  // ручной индекс всюду резолвится одинаково.
  function listVoicingVariants(chord, key, range, prev, opts) {
    return voicingVariantStructure(chord, key, range).list;
  }

  function motionCost(prev,next) {"""

# 2. linkedSelection: ручной индекс по единому списку обращений
L2_OLD = """      var variants=generateKeysVoicings(chord,key,cache.range,cache.prev,{}), notes=null;"""
L2_NEW = """      var variants=listVoicingVariants(chord,key,cache.range,cache.prev,{}), notes=null;"""

# 3. fallback за 2048
L3_OLD = """ : generateKeysVoicings(name,(far.sec&&far.sec.key)||currentKey(),cache.range,null,{});"""
L3_NEW = """ : listVoicingVariants(name,(far.sec&&far.sec.key)||currentKey(),cache.range,null,{});"""

# 4. тултип/закреплённая карточка
L4_OLD = """    var variants = generateKeysVoicings(chordName, currentKey(), range, o.prev || null, {});"""
L4_NEW = """    var variants = listVoicingVariants(chordName, currentKey(), range, o.prev || null, {});"""

# 5. stepVariant целиком + toggleDensity + currentVariantSlot
L5_OLD = """  function stepVariant(delta) {
    var T = tracks(); if (!T || !lastChord || noteDraft) return;
    var active = activeTrack(); if (!active || !active.track) return;
    var range = T.keyRange(active.track.id);
    var variants = generateKeysVoicings(lastChord, panelKey(), range, null, {});
    if (!variants.length) return;
    if(T.exactNotes(active.track.id,lastCellKey,lastChord)) {
      if(!HOST.confirm('Снять вручную введённые ноты этой ячейки и вернуться к обычному расположению?'))return;
      T.clearExactNotes(active.track.id,lastCellKey);
      renderPanel();return;
    }
    var selection=linkedSelection(active.track.id,lastCellKey);
    var cur = selection && selection.chord===lastChord && !selection.manual ? (delta>0 ? -1 : 0) : variantIndex(active.track.id, lastChord, lastCellKey) % variants.length;
    setVariantIndex(active.track.id, lastChord, lastCellKey, cur + delta, variants.length);
    renderPanel();
    var M = mixer(); if (M && typeof M.render === 'function') { /* панель микшера не перерисовываем */ }
  }"""
L5_NEW = """  // 0.792 (B-119 rework): текущий слот варианта (обращение + плотность).
  function currentVariantSlot(trackId, chord, cellKey, range) {
    var st = voicingVariantStructure(chord, panelKey(), range);
    var n0 = st.list.length || 1;
    var idx = ((variantIndex(trackId, chord, cellKey) % n0) + n0) % n0;
    for (var i = 0; i < st.slots.length; i++) {
      var s = st.slots[i];
      if (s.base === idx || s.wide === idx) return { st: st, slot: s, inv: i, wide: s.wide === idx, idx: idx };
    }
    return { st: st, slot: st.slots[0] || { base: 0, wide: -1 }, inv: 0, wide: false, idx: st.slots[0] ? st.slots[0].base : 0 };
  }
  // Стрелки ‹ › переключают обращения аккорда (с сохранением текущего блока плотности).
  function stepVariant(delta) {
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
    var inv = ((cur.inv + delta) % n + n) % n, slot = cur.st.slots[inv];
    var target = cur.wide && slot.wide >= 0 ? slot.wide : slot.base;
    setVariantIndex(active.track.id, lastChord, lastCellKey, target, cur.st.list.length);
    renderPanel();
  }
  // Тоггл «Плотно | Широко»: октавное удвоение верхней ноты правой руки.
  function toggleDensity() {
    var T = tracks(); if (!T || !lastChord || noteDraft) return;
    var active = activeTrack(); if (!active || !active.track) return;
    var range = T.keyRange(active.track.id);
    if (T.exactNotes(active.track.id, lastCellKey, lastChord)) return;
    var cur = currentVariantSlot(active.track.id, lastChord, lastCellKey, range);
    var target = cur.wide ? cur.slot.base : (cur.slot.wide >= 0 ? cur.slot.wide : cur.slot.base);
    if (target === cur.idx) return;
    setVariantIndex(active.track.id, lastChord, lastCellKey, target, cur.st.list.length);
    renderPanel();
  }"""

# 6. renderPanel: единый список
L6_OLD = """    var variants = chord ? generateKeysVoicings(chord, panelKey(), range, null, {}) : [];"""
L6_NEW = """    var variants = chord ? listVoicingVariants(chord, panelKey(), range, null, {}) : [];"""

# 7. счётчик + toggl после countEl
L7_OLD = """    countEl.textContent = noteDraft ? 'Ввод' : exact ? 'Своя' : !chord ? '—' : selected && selected.chord===chord ? (selected.limited ? 'Обычная' : selected.manual ? 'Ручная' : 'Авто') : (idx + 1) + '/' + Math.max(1, variants.length);"""
L7_NEW = """    countEl.textContent = noteDraft ? 'Ввод' : exact ? 'Своя' : !chord ? '—' : selected && selected.chord===chord ? (selected.limited ? 'Обычная' : selected.manual ? 'Ручная' : 'Авто') : (idx + 1) + '/' + Math.max(1, variants.length);
    // 0.792: toggl «Плотно|Широко» и номер обращения в счётчике.
    if (densityEl) {
      if (chord && !noteDraft) {
        var st2 = voicingVariantStructure(chord, panelKey(), range);
        var hasWide = st2.slots.some(function (s) { return s.wide >= 0; });
        panel.classList.toggle('has-wide', hasWide);
        var cur2 = currentVariantSlot(active.track.id, chord, lastCellKey, range);
        densityTight.setAttribute('aria-pressed', String(!cur2.wide));
        densityWide.setAttribute('aria-pressed', String(cur2.wide));
        if (!exact && !(selected && selected.chord === chord && selected.limited)) {
          var mode = selected && selected.chord === chord ? (selected.manual ? 'Ручная' : 'Авто') : 'Вариант';
          countEl.textContent = mode + ' · обращение ' + (cur2.inv + 1) + '/' + st2.slots.length + (cur2.wide ? ' · широко' : ' · плотно');
        }
      } else panel.classList.remove('has-wide');
    }"""

# 8. ранний выход: скрыть toggl
L8_OLD = """      countEl.textContent = '—'; foot.textContent = '';"""
L8_NEW = """      countEl.textContent = '—'; foot.textContent = '';
      panel.classList.remove('has-wide');"""

# 9. voicingProvider (звук)
L9_OLD = """      var variants = generateKeysVoicings(chordName, key, range, prev, {});"""
L9_NEW = """      var variants = listVoicingVariants(chordName, key, range, prev, {});"""

# 10. selectedShape
L10_OLD = """  const variants=keys.generateKeysVoicings(chord,key,t.keyRange(id),null,{});if(!variants.length)return null;"""
L10_NEW = """  const variants=(keys.listVoicingVariants||keys.generateKeysVoicings)(chord,key,t.keyRange(id),null,{});if(!variants.length)return null;"""

# 11. авто-модуль
L11_OLD = """        var list = K.generateKeysVoicings(chord, key, T.keyRange(track.id), null, {});"""
L11_NEW = """        var list = (K.listVoicingVariants || K.generateKeysVoicings)(chord, key, T.keyRange(track.id), null, {});"""

# 12. API export
L12_OLD = """    generateKeysVoicings: generateKeysVoicings, toneRank: toneRank, handLimit: handLimit,"""
L12_NEW = """    generateKeysVoicings: generateKeysVoicings, listVoicingVariants: listVoicingVariants, voicingVariantStructure: voicingVariantStructure,
    toggleDensity: toggleDensity,
    toneRank: toneRank, handLimit: handLimit,"""

# 13. CSS тоггла после .b39-keys-count
L13_OLD = """.b39-keys-count { font-size: .8rem; min-width: 2.3rem; text-align: center;
  color: var(--color-text-secondary, #666); }"""
L13_NEW = """.b39-keys-count { font-size: .8rem; min-width: 2.3rem; text-align: center;
  color: var(--color-text-secondary, #666); }
.b39-keys-density { display: none; margin-left: .35rem; }
.b39-keys-panel.has-wide .b39-keys-density { display: inline-flex; }
.b39-density-btn { min-height: 1.6rem; padding: 0 .45rem; font-size: .72rem; cursor: pointer;
  border: .0625rem solid var(--color-border-medium, #c9cdd4); background: var(--color-surface, #fff); color: inherit; }
.b39-density-btn:first-child { border-radius: .5rem 0 0 .5rem; }
.b39-density-btn:last-child { border-radius: 0 .5rem .5rem 0; border-left: none; }
.b39-density-btn[aria-pressed="true"] { background: var(--color-accent, #2c3e66); border-color: var(--color-accent, #2c3e66); color: #fff; }"""

# 14. объявления toggl-элементов
L14_OLD = """  var btn = null, panel = null, body = null, countEl = null, foot = null, titleEl = null;"""
L14_NEW = """  var btn = null, panel = null, body = null, countEl = null, foot = null, titleEl = null;
  var densityEl = null, densityTight = null, densityWide = null;"""

# 15. DOM тоггла в nav
L15_OLD = """    nav.appendChild(prev); nav.appendChild(countEl); nav.appendChild(next);"""
L15_NEW = """    nav.appendChild(prev); nav.appendChild(countEl); nav.appendChild(next);
    // 0.792: toggl «Плотно | Широко» рядом со стрелками обращений.
    densityEl = el('span', 'b39-keys-density'); densityEl.id = 'b39KeysDensity';
    densityEl.setAttribute('role', 'group'); densityEl.setAttribute('aria-label', 'Плотность расположения');
    densityTight = el('button', 'b39-density-btn', 'Плотно'); densityTight.type = 'button';
    densityTight.setAttribute('aria-pressed', 'true'); densityTight.title = 'Ноты правой руки в пределах октавы';
    densityWide = el('button', 'b39-density-btn', 'Широко'); densityWide.type = 'button';
    densityWide.setAttribute('aria-pressed', 'false'); densityWide.title = 'Верхняя нота правой руки удваивается октавой выше (на клавиатурах от 61 клавиши)';
    densityTight.addEventListener('click', function () { if (densityWide.getAttribute('aria-pressed') === 'true') toggleDensity(); });
    densityWide.addEventListener('click', function () { if (densityWide.getAttribute('aria-pressed') !== 'true') toggleDensity(); });
    densityEl.appendChild(densityTight); densityEl.appendChild(densityWide);
    nav.appendChild(densityEl);"""

# 16-17. R7: версия парой (0.791 был откачен, выпускаем 0.792)
HTML_OLD = """· ver 0.790</span></span>"""
HTML_NEW = """· ver 0.792</span></span>"""
SW_OLD = """const CACHE_NAME = 'struchord-v790';"""
SW_NEW = """const CACHE_NAME = 'struchord-v792';"""


def main():
    ap = argparse.ArgumentParser(description='B-119 rework / 0.792: стрелки по обращениям + тоггл плотно/широко')
    ap.add_argument('--check', action='store_true', help='только проверить якоря, файлы не менять')
    args = ap.parse_args()
    jobs = [
        ('STRUCHORD.html', [
            (FUNC_ANCHOR, FUNC_NEW, 'voicingVariantStructure + listVoicingVariants перед motionCost'),
            (L2_OLD, L2_NEW, 'linkedSelection: ручной индекс по списку обращений'),
            (L3_OLD, L3_NEW, 'fallback 2048'),
            (L4_OLD, L4_NEW, 'renderKeysVoicingSVG'),
            (L5_OLD, L5_NEW, 'stepVariant → обращения + toggleDensity + currentVariantSlot'),
            (L6_OLD, L6_NEW, 'renderPanel: единый список'),
            (L7_OLD, L7_NEW, 'счётчик: «обращение i/n · плотно/широко» + toggl'),
            (L8_OLD, L8_NEW, 'ранний выход: скрыть toggl'),
            (L9_OLD, L9_NEW, 'voicingProvider (звук)'),
            (L10_OLD, L10_NEW, 'selectedShape'),
            (L11_OLD, L11_NEW, 'авто-модуль'),
            (L12_OLD, L12_NEW, 'API export'),
            (L13_OLD, L13_NEW, 'CSS тоггла плотно/широко'),
            (L14_OLD, L14_NEW, 'объявления densityEl…'),
            (L15_OLD, L15_NEW, 'DOM тоггла в nav'),
            (HTML_OLD, HTML_NEW, 'версия в шапке'),
        ]),
        ('sw.js', [
            (SW_OLD, SW_NEW, 'CACHE_NAME'),
        ]),
    ]
    out = {}
    for rel, edits in jobs:
        p = ROOT / rel
        text = p.read_text(encoding='utf-8')
        for old, new, label in edits:
            text = replace_once(text, old, new, rel + ': ' + label)
        out[rel] = text
        print('  ok  %-32s %d якорей' % (rel, len(edits)))
    if args.check:
        print('ПРОВЕРКА ПРОЙДЕНА: все якоря на месте, файлы не менялись.')
        return 0
    for rel, text in out.items():
        (ROOT / rel).write_text(text, encoding='utf-8')
    print('ПАТЧ ПРИМЕНЁН: 0.790 -> 0.792 (0.791 откачен revert\'ом; R7: HTML и sw.js парой).')
    return 0


if __name__ == '__main__':
    sys.exit(main())

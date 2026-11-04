#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""B-119 / 0.791 — варианты расположения: единый список + карточки в панели.

Патч по якорям, без `git apply`. Применяется один раз к 0.790:

    python3 dev/tools/patch-b119-voicing-variants-0791.py --check
    python3 dev/tools/patch-b119-voicing-variants-0791.py

Кирпич 5 очереди B-39, требование 1 из dev/specs/piano-voicing-review.md
(«предлагать несколько осмысленных вариантов, а не один»). R8 (2026-11-04):
UI — карточки с миниклавиатурой и подписью (± остаются); набор — базовые
воцинги/обращения + «широкие» с октавным удвоением, только на 61+ клавишах
и когда рука вмещает; ручной выбор и exactNotes побеждают, старые песни без
gалочки — как раньше, авто-выбор ручной не перетирает; полный комплект 0.791.

Решение:
- новый `listVoicingVariants(chord,key,range,prev,opts)` = generateKeysVoicings
  + в хвосте «широкие» варианты (верхняя нота RH +12) при range.size>=61,
  если помещается в диапазон и в handLimit. Старые ручные индексы не
  сдвигаются (широкие добавлены в конец).
- единый список используют UI (карточки + ± + счётчик), ручной выбор в
  linkedSelection и fallback, voicingProvider (звук), selectedShape и
  авто-модуль — ручной индекс всюду разрешается одинаково.
- карточки: div#b39KeysVariants под клавиатурой, мини-SVG + подпись
  voicingLabel («Плотное»/«Компактное»/«Широкое»/«Обращение»/«Широкое ·
  удвоение в октаву»), клик = setVariantIndex.
- inversionCandidates (авто-голосоведение) остаётся на базовом списке.

R7: версия в шапке HTML и CACHE_NAME в sw.js меняются парой (0.791/v791).
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


# 1. Новые функции перед inversionCandidates
NEW_FUNCS_ANCHOR = """  // Обращения одного и того же набора звуков, без изменения гармонии.
  // Отдельный бас оставляем вне сравнения голосов правой руки.
  function inversionCandidates(chord,key,range) {"""
NEW_FUNCS = """  // 0.791 (B-119): единый список вариантов расположения для UI (карточки и ±),
  // ручного выбора и озвучки. База — generateKeysVoicings; в хвост добавляются
  // «широкие» варианты (верхняя нота правой руки +12) только на клавиатурах
  // от 61 клавиши и когда нота помещается в диапазон и в handLimit.
  // Ручные индексы, сохранённые раньше, не сдвигаются: широкие — в конце.
  function listVoicingVariants(chord, key, range, prev, opts) {
    var basic = generateKeysVoicings(chord, key, range, prev, opts);
    var out = basic.slice(), size = (range && range.size) || 61;
    if (size >= 61 && basic.length) {
      var limit = handLimit(size), rhHigh = Math.min(range.high, 84);
      var seen = {};
      out.forEach(function (v) { seen[v.join(',')] = true; });
      basic.slice(0, 2).forEach(function (base) {
        var rh = base.slice(1);
        if (!rh.length || base.length >= limit || base.length >= 9) return;
        var top = Math.max.apply(null, rh), extra = top + 12;
        if (extra > rhHigh) return;
        var dup = base.concat([extra]).sort(function (a, b) { return a - b; });
        var sig = dup.join(',');
        if (seen[sig]) return;
        seen[sig] = true; out.push(dup);
      });
    }
    return out;
  }

  // Короткая осмысленная подпись варианта для карточки (вместо голого индекса).
  function voicingLabel(notes, index, baseCount, f) {
    if (!notes || !notes.length) return 'Вариант ' + (index + 1);
    if (Number.isInteger(baseCount) && index >= baseCount) return 'Широкое · удвоение в октаву';
    var rootPc = f && Number.isInteger(f.rootPc) ? f.rootPc : null;
    var bassPc = mod12(notes[0]), rh = notes.slice(1), label = '';
    if (rootPc !== null && bassPc !== rootPc) label = 'Обращение';
    if (!label && rh.length) {
      var span = Math.max.apply(null, rh) - Math.min.apply(null, rh);
      label = span <= 12 ? 'Плотное' : span <= 17 ? 'Компактное' : 'Широкое';
    }
    return label || ('Вариант ' + (index + 1));
  }

  // Обращения одного и того же набора звуков, без изменения гармонии.
  // Отдельный бас оставляем вне сравнения голосов правой руки.
  function inversionCandidates(chord,key,range) {"""

# 2. linkedSelection: ручной индекс разрешается по тому же списку
L2_OLD = """      var variants=generateKeysVoicings(chord,key,cache.range,cache.prev,{}), notes=null;"""
L2_NEW = """      var variants=listVoicingVariants(chord,key,cache.range,cache.prev,{}), notes=null;"""

# 3. fallback за пределом 2048
L3_OLD = """ : generateKeysVoicings(name,(far.sec&&far.sec.key)||currentKey(),cache.range,null,{});"""
L3_NEW = """ : listVoicingVariants(name,(far.sec&&far.sec.key)||currentKey(),cache.range,null,{});"""

# 4. тултип/карточка
L4_OLD = """    var variants = generateKeysVoicings(chordName, currentKey(), range, o.prev || null, {});"""
L4_NEW = """    var variants = listVoicingVariants(chordName, currentKey(), range, o.prev || null, {});"""

# 5. stepVariant (±)
L5_OLD = """    var variants = generateKeysVoicings(lastChord, panelKey(), range, null, {});"""
L5_NEW = """    var variants = listVoicingVariants(lastChord, panelKey(), range, null, {});"""

# 6. renderPanel: счётчик и карточки
L6_OLD = """    var variants = chord ? generateKeysVoicings(chord, panelKey(), range, null, {}) : [];"""
L6_NEW = """    var variants = chord ? listVoicingVariants(chord, panelKey(), range, null, {}) : [];"""

# 7. voicingProvider (звук, когда голосоведение выключено)
L7_OLD = """      var variants = generateKeysVoicings(chordName, key, range, prev, {});"""
L7_NEW = """      var variants = listVoicingVariants(chordName, key, range, prev, {});"""

# 8. selectedShape (внешний модуль)
L8_OLD = """  const variants=keys.generateKeysVoicings(chord,key,t.keyRange(id),null,{});if(!variants.length)return null;"""
L8_NEW = """  const variants=(keys.listVoicingVariants||keys.generateKeysVoicings)(chord,key,t.keyRange(id),null,{});if(!variants.length)return null;"""

# 9. авто-модуль
L9_OLD = """        var list = K.generateKeysVoicings(chord, key, T.keyRange(track.id), null, {});"""
L9_NEW = """        var list = (K.listVoicingVariants || K.generateKeysVoicings)(chord, key, T.keyRange(track.id), null, {});"""

# 10. экспорт API
L10_OLD = """    generateKeysVoicings: generateKeysVoicings, toneRank: toneRank, handLimit: handLimit,"""
L10_NEW = """    generateKeysVoicings: generateKeysVoicings, listVoicingVariants: listVoicingVariants, voicingLabel: voicingLabel,
    toneRank: toneRank, handLimit: handLimit,"""

# 11. CSS карточек
L11_OLD = """.b39-keys-count { font-size: .8rem; min-width: 2.3rem; text-align: center;
  color: var(--color-text-secondary, #666); }"""
L11_NEW = """.b39-keys-count { font-size: .8rem; min-width: 2.3rem; text-align: center;
  color: var(--color-text-secondary, #666); }
.b39-keys-variants { display: none; gap: .35rem; overflow-x: auto; padding: .25rem 0; }
.b39-keys-panel.has-variants .b39-keys-variants { display: flex; }
.b39-variant { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: .1rem;
  padding: .2rem .3rem; border: .0625rem solid var(--color-border-medium, #c9cdd4);
  border-radius: .5rem; background: var(--color-surface, #fff); color: inherit; cursor: pointer; font: inherit; }
.b39-variant[aria-pressed="true"] { border-color: var(--color-accent, #2c3e66);
  background: rgba(var(--color-accent-rgb, 44, 62, 102), .12); }
.b39-variant svg { display: block; }
.b39-variant-label { font-size: .68rem; color: var(--color-text-secondary, #666); white-space: nowrap; }"""

# 12. объявление varList
L12_OLD = """  var btn = null, panel = null, body = null, countEl = null, foot = null, titleEl = null;"""
L12_NEW = """  var btn = null, panel = null, body = null, countEl = null, foot = null, titleEl = null, varList = null;"""

# 13. создание varList после nav
L13_OLD = """    nav.appendChild(prev); nav.appendChild(countEl); nav.appendChild(next);"""
L13_NEW = """    nav.appendChild(prev); nav.appendChild(countEl); nav.appendChild(next);
    varList = el('div', 'b39-keys-variants'); varList.id = 'b39KeysVariants';
    varList.setAttribute('role', 'group'); varList.setAttribute('aria-label', 'Варианты расположения аккорда');"""

# 14. порядок appendChild
L14_OLD = """    panel.appendChild(head);panel.appendChild(noteBar);panel.appendChild(body);panel.appendChild(settings);"""
L14_NEW = """    panel.appendChild(head);panel.appendChild(noteBar);panel.appendChild(body);panel.appendChild(varList);panel.appendChild(settings);"""

# 15. ранний выход (не клавишная дорожка): чистим карточки
L15_OLD = """      countEl.textContent = '—'; foot.textContent = '';"""
L15_NEW = """      countEl.textContent = '—'; foot.textContent = '';
      if (varList) { varList.innerHTML = ''; panel.classList.remove('has-variants'); }"""

# 16. рендер карточек после счётчика
L16_OLD = """    countEl.textContent = noteDraft ? 'Ввод' : exact ? 'Своя' : !chord ? '—' : selected && selected.chord===chord ? (selected.limited ? 'Обычная' : selected.manual ? 'Ручная' : 'Авто') : (idx + 1) + '/' + Math.max(1, variants.length);"""
L16_NEW = """    countEl.textContent = noteDraft ? 'Ввод' : exact ? 'Своя' : !chord ? '—' : selected && selected.chord===chord ? (selected.limited ? 'Обычная' : selected.manual ? 'Ручная' : 'Авто') : (idx + 1) + '/' + Math.max(1, variants.length);
    // 0.791 (B-119): карточки вариантов расположения текущего аккорда.
    if (varList) {
      varList.innerHTML = '';
      panel.classList.remove('has-variants');
      if (chord && !noteDraft && variants.length > 1) {
        panel.classList.add('has-variants');
        var baseCount = generateKeysVoicings(chord, panelKey(), range, null, {}).length;
        var currentNotes = exact || (selected && selected.chord === chord ? selected.notes : variants[idx]);
        var currentSig = (currentNotes || []).join(',');
        for (var vi = 0; vi < variants.length; vi++) {
          (function (i, v) {
            var card = el('button', 'b39-variant'); card.type = 'button';
            var label = voicingLabel(v, i, baseCount, f);
            card.setAttribute('aria-pressed', v.join(',') === currentSig ? 'true' : 'false');
            card.setAttribute('aria-label', 'Вариант ' + (i + 1) + ' из ' + variants.length + ': ' + label);
            card.title = label;
            var rh = v.slice(1);
            var lo = rh.length ? Math.min.apply(null, rh) : v[0];
            var hi = rh.length ? Math.max.apply(null, rh) : lo;
            var start = Math.floor(lo / 12) * 12, end = Math.max(start + 24, Math.ceil((hi + 1) / 12) * 12);
            if (end - start > 36) end = start + 36;
            var mini = keyboardSVG(start, end, v.filter(function (n) { return n >= start && n <= end; }), { whiteW: 8, whiteH: 26, showFingers: false, labelSpace: 12, labelFont: 8 });
            var holder = el('span', 'b39-variant-keys'); holder.innerHTML = mini.svg; card.appendChild(holder);
            card.appendChild(el('span', 'b39-variant-label', label));
            card.addEventListener('click', function () { setVariantIndex(active.track.id, chord, lastCellKey, i, variants.length); renderPanel(); });
            varList.appendChild(card);
          })(vi, variants[vi]);
        }
      }
    }"""

# 17-18. R7: версия парой
HTML_OLD = """· ver 0.790</span></span>"""
HTML_NEW = """· ver 0.791</span></span>"""
SW_OLD = """const CACHE_NAME = 'struchord-v790';"""
SW_NEW = """const CACHE_NAME = 'struchord-v791';"""


def main():
    ap = argparse.ArgumentParser(description='B-119 / 0.791: варианты расположения (карточки + широкие на 61+)')
    ap.add_argument('--check', action='store_true', help='только проверить якоря, файлы не менять')
    args = ap.parse_args()
    jobs = [
        ('STRUCHORD.html', [
            (NEW_FUNCS_ANCHOR, NEW_FUNCS, 'listVoicingVariants + voicingLabel перед inversionCandidates'),
            (L2_OLD, L2_NEW, 'linkedSelection: ручной индекс по единому списку'),
            (L3_OLD, L3_NEW, 'fallback 2048: тот же список'),
            (L4_OLD, L4_NEW, 'renderKeysVoicingSVG: тот же список'),
            (L5_OLD, L5_NEW, 'stepVariant (±): тот же список'),
            (L6_OLD, L6_NEW, 'renderPanel: счётчик/карточки из единого списка'),
            (L7_OLD, L7_NEW, 'voicingProvider (звук): тот же список'),
            (L8_OLD, L8_NEW, 'selectedShape: guarded listVoicingVariants'),
            (L9_OLD, L9_NEW, 'авто-модуль: guarded listVoicingVariants'),
            (L10_OLD, L10_NEW, 'API: экспорт listVoicingVariants/voicingLabel'),
            (L11_OLD, L11_NEW, 'CSS карточек .b39-keys-variants/.b39-variant'),
            (L12_OLD, L12_NEW, 'varList объявлен'),
            (L13_OLD, L13_NEW, 'varList создан после nav'),
            (L14_OLD, L14_NEW, 'varList в DOM панели'),
            (L15_OLD, L15_NEW, 'ранний выход чистит карточки'),
            (L16_OLD, L16_NEW, 'рендер карточек в renderPanel'),
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
    print('ПАТЧ ПРИМЕНЁН: 0.790 -> 0.791 (R7: HTML и sw.js выложены парой).')
    return 0


if __name__ == '__main__':
    sys.exit(main())

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""0.794 — доведение по ревью преподавателя №2 (после 0.793), 4 пункта.

Ревью №2 (2026-11-05), подтверждено по коду:

П.1 endAccent vs нотная автопартия: plan() в keyboard-accompaniment.js
   возвращает партию StruChordNoteCandidate раньше accent-обработки.
   Шаги нотной партии — события отдельных нот без токенов H/R, блоковой
   атаки там нет, поэтому акцент к ней не применяется ПО СМЫСЛУ. Фикс:
   комментарий в коде + честная оговорка в title чекбокса («в нотной
   автопартии не применяется») + тест: одна партия при вкл/выкл опции
   возвращается без изменений, блоковый рисунок — с/без 13-й.

П.2 спан-проверка считала notes[0] басом: applyExtensionAccent брал
   st.notes.slice(1), но при RH-only/nobrass (omit в tokenContext) первая
   нота — тоже правая рука. Фикс: размах считаем по C.rh (все ноты руки,
   бас отделён по bassPolicy), а не «все кроме первой».

П.3 «намеренные удвоения не штрафуются» сильнее реализации:
   parallelPerfects видит интервалы/движение, не назначение голосов.
   Фикс: честный комментарий (внутри RH намеренное октавное удвоение
   мелодии от двух голосов не отличить; штраф мягкий ×4/×2, не запрет —
   удвоение не ломается; бас вне проверки). Код не меняем.

П.4 сохранность старого звучания по ИНДЕКСАМ вариантов: файл хранит
   voicings['v:'+chord]=int, а порядок вариантов сменился в 0.792 —
   старый индекс тихо мапился бы на другое расположение. Фикс:
   voicingsVersion на дорожке: absent (старые песни) = v1, резолв по
   ПРЕЖНЕМУ generateKeysVoicings; новая дорожка и новая ручная запись
   (setVoicing/setVoicingForChord) = v2, резолв по listVoicingVariants.
   Гейт trackVariantList() во всех звуковых путях: linkedSelection
   (оба резолва), renderKeysVoicingSVG, панель, voicingProvider,
   selectedShape, авто-модуль.

R7: ver 0.794 + struchord-v794 парой.

    python3 dev/tools/patch-review2-0794.py --check
    python3 dev/tools/patch-review2-0794.py
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


# ---------- keyboard-accompaniment.js ----------
A1_OLD = "      var individual=HOST.StruChordNoteCandidate && HOST.StruChordNoteCandidate.plan(o);if(individual)return articulate(individual,o);"
A1_NEW = """      var individual=HOST.StruChordNoteCandidate && HOST.StruChordNoteCandidate.plan(o);
      // 0.794 (ревью №2, п.1): нотная автопартия — события отдельных нот без
      // блоковых атак (токенов H/R), поэтому акцент 13/9 к ней не применяется
      // по смыслу (title чекбокса это оговаривает); шаги возвращаем как есть.
      if(individual)return articulate(individual,o);"""

A2_OLD = "            var rh = st.notes.slice(1);"
A2_NEW = """            // 0.794 (ревью №2, п.2): размах считаем по ВСЕМ нотам правой руки
            // из tokenContext (бас отделён по bassPolicy, в т.ч. nobrass/RH-only),
            // а не по «всем, кроме первой ноты события».
            var rh = (C && Array.isArray(C.rh) && C.rh.length) ? C.rh : st.notes.slice(1);"""

# ---------- STRUCHORD.html ----------
H1_OLD = "отключает только дополнительное выделение.';"
H1_NEW = "отключает только дополнительное выделение. В нотной автопартии (отдельные ноты) не применяется: там верхняя линия — сама сгенерированная партия.';"

H2_OLD = """   *  Неподвижный голос — не параллель; бас вне движений (RH-only), поэтому
   *  «бас oktавой» и удвоение мелодии oktавой штрафом не задеваются."""
H2_NEW = """   *  Неподвижный голос — не параллель; бас вне движений (RH-only), поэтому
   *  удвоение басом октавой штрафом не задевается. ВНУТРИ правой руки проверка
   *  видит только интервалы и направление движения, но не назначение голосов:
   *  намеренное октавное удвоение мелодии (мелодия + её дубль в октаву) от двух
   *  самостоятельных голосов в параллельной октаве не отличить — потому штраф
   *  мягкий (октавы ×4, квинты ×2), а не запрет: удвоение не ломается."""

H3_ANCHOR = "  function linkedSelection(trackId,cell) {"
H3_NEW = """  // 0.794 (ревью №2, п.4): порядок вариантов сменился в 0.792, а в файле
  // песни лежит ИНДЕКС. Старые песни (поля voicingsVersion нет) резолвят
  // ручные индексы по ПРЕЖНЕМУ списку generateKeysVoicings — сохранённый
  // индекс не «переезжает» на другое расположение. Новая дорожка и любая
  // новая ручная запись (setVoicing/setVoicingForChord) получают
  // voicingsVersion=2 и резолвятся по новому listVoicingVariants.
  function trackVariantList(trackId, chord, key, range, prev) {
    var T = tracks(), t = T && T.track(trackId);
    var useNew = !!(t && t.voicingsVersion === 2 && typeof listVoicingVariants === 'function');
    var fn = useNew ? listVoicingVariants : (generateKeysVoicings || listVoicingVariants);
    return fn(chord, key, range, prev, {});
  }
  function linkedSelection(trackId,cell) {"""

H4_OLD = "      var variants=listVoicingVariants(chord,key,cache.range,cache.prev,{}), notes=null;"
H4_NEW = "      var variants=trackVariantList(trackId,chord,key,cache.range,cache.prev), notes=null;   // 0.794: voicingsVersion выбирает порядок вариантов"

H5_OLD = " : listVoicingVariants(name,(far.sec&&far.sec.key)||currentKey(),cache.range,null,{});"
H5_NEW = " : trackVariantList(trackId,name,(far.sec&&far.sec.key)||currentKey(),cache.range,null);"

H6_OLD = "    var variants = listVoicingVariants(chordName, currentKey(), range, o.prev || null, {});"
H6_NEW = "    var variants = trackVariantList(trackId, chordName, currentKey(), range, o.prev || null);   // 0.794: voicingsVersion"

H7_OLD = "    var variants = chord ? listVoicingVariants(chord, panelKey(), range, null, {}) : [];"
H7_NEW = "    var variants = chord ? trackVariantList(active.track.id, chord, panelKey(), range, null) : [];   // 0.794: voicingsVersion"

H8_OLD = "      var variants = listVoicingVariants(chordName, key, range, prev, {});"
H8_NEW = "      var variants = trackVariantList(trackId, chordName, key, range, prev);   // 0.794: voicingsVersion"

H9_OLD = "    generateKeysVoicings: generateKeysVoicings, listVoicingVariants: listVoicingVariants, voicingVariantStructure: voicingVariantStructure,"
H9_NEW = "    generateKeysVoicings: generateKeysVoicings, listVoicingVariants: listVoicingVariants, trackVariantList: trackVariantList, voicingVariantStructure: voicingVariantStructure,"

H10_OLD = "  const variants=(keys.listVoicingVariants||keys.generateKeysVoicings)(chord,key,t.keyRange(id),null,{});if(!variants.length)return null;"
H10_NEW = "  const variants=(keys.trackVariantList?keys.trackVariantList(id,chord,key,t.keyRange(id),null):(keys.listVoicingVariants||keys.generateKeysVoicings)(chord,key,t.keyRange(id),null,{}));if(!variants.length)return null;   // 0.794: voicingsVersion"

H11_OLD = "        var list = (K.listVoicingVariants || K.generateKeysVoicings)(chord, key, T.keyRange(track.id), null, {});"
H11_NEW = "        var list = K.trackVariantList ? K.trackVariantList(track.id, chord, key, T.keyRange(track.id), null) : (K.listVoicingVariants || K.generateKeysVoicings)(chord, key, T.keyRange(track.id), null, {});   // 0.794: voicingsVersion дорожки"

H12_OLD = "    return dispatch('b39/track-voicing', function () { t.voicings[key] = n; return true; });"
H12_NEW = "    return dispatch('b39/track-voicing', function () { t.voicings[key] = n; t.voicingsVersion = 2; return true; });   // 0.794: новая ручная запись — новый порядок вариантов (v2)"

H13_OLD = """      t.voicings['v:' + chord] = n;
      return true;"""
H13_NEW = """      t.voicings['v:' + chord] = n;
      t.voicingsVersion = 2;   // 0.794 (ревью №2, п.4): этот индекс пишется по новому списку (v2)
      return true;"""

H14_OLD = "        ...(raw.endAccent===false ? {endAccent:false} : {}),   // 0.793: у старых песен поля нет — акцент остаётся как в 0.789"
H14_NEW = """        ...(raw.endAccent===false ? {endAccent:false} : {}),   // 0.793: у старых песен поля нет — акцент остаётся как в 0.789
        ...(raw.voicingsVersion===2 ? {voicingsVersion:2} : {}),   // 0.794: у старых песен поля нет — ручные индексы резолвятся по прежнему списку (v1)"""

H15_OLD = "      ...(instrument === 'keys' ? {linkedVoicings:true, endAccent:false} : {}),   // 0.793: у НОВЫХ клавишных дорожек «13/9 в конце такта» выключено"
H15_NEW = "      ...(instrument === 'keys' ? {linkedVoicings:true, endAccent:false, voicingsVersion:2} : {}),   // 0.793: endAccent выкл у новых; 0.794: voicingsVersion=2 — новый порядок вариантов"

H16_OLD = "· ver 0.793"
H16_NEW = "· ver 0.794"

# ---------- sw.js ----------
S1_OLD = "const CACHE_NAME = 'struchord-v793';"
S1_NEW = "const CACHE_NAME = 'struchord-v794';"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true', help='только проверить якоря, файлы не менять')
    args = ap.parse_args()

    accomp_path = ROOT / 'keyboard-accompaniment.js'
    html_path = ROOT / 'STRUCHORD.html'
    sw_path = ROOT / 'sw.js'
    accomp = accomp_path.read_text(encoding='utf-8')
    html = html_path.read_text(encoding='utf-8')
    sw = sw_path.read_text(encoding='utf-8')

    patches = [
        ('accomp', accomp_path, accomp, [(A1_OLD, A1_NEW, 'п.1: комментарий к early return нотной партии'),
                                          (A2_OLD, A2_NEW, 'п.2: C.rh вместо slice(1)')]),
        ('html', html_path, html, [(H1_OLD, H1_NEW, 'п.1: title чекбокса — оговорка про нотную партию'),
                                    (H2_OLD, H2_NEW, 'п.3: честный комментарий parallelPerfects'),
                                    (H3_ANCHOR, H3_NEW, 'п.4: trackVariantList helper'),
                                    (H4_OLD, H4_NEW, 'п.4: linkedSelection резолв'),
                                    (H5_OLD, H5_NEW, 'п.4: linkedSelection fallback'),
                                    (H6_OLD, H6_NEW, 'п.4: renderKeysVoicingSVG'),
                                    (H7_OLD, H7_NEW, 'п.4: панель'),
                                    (H8_OLD, H8_NEW, 'п.4: voicingProvider'),
                                    (H9_OLD, H9_NEW, 'п.4: экспорт trackVariantList'),
                                    (H10_OLD, H10_NEW, 'п.4: selectedShape'),
                                    (H11_OLD, H11_NEW, 'п.4: авто-модуль'),
                                    (H12_OLD, H12_NEW, 'п.4: setVoicing → v2'),
                                    (H13_OLD, H13_NEW, 'п.4: setVoicingForChord → v2'),
                                    (H14_OLD, H14_NEW, 'п.4: sanitize voicingsVersion'),
                                    (H15_OLD, H15_NEW, 'п.4: новая дорожка voicingsVersion:2'),
                                    (H16_OLD, H16_NEW, 'R7: ver 0.794')]),
        ('sw', sw_path, sw, [(S1_OLD, S1_NEW, 'R7: struchord-v794')]),
    ]

    changed = 0
    for name, path, text, subs in patches:
        for old, new, label in subs:
            text = replace_once(text, old, new, '%s / %s' % (name, label))
        if text != (accomp if name == 'accomp' else html if name == 'html' else sw):
            changed += 1
            if not args.check:
                path.write_text(text, encoding='utf-8')
                print('  применён: %s (%d якорей)' % (path.relative_to(ROOT), len(subs)))
            else:
                print('  якоря на месте: %s (%d)' % (path.relative_to(ROOT), len(subs)))
        else:
            print('  без изменений: %s' % path.relative_to(ROOT))
    if args.check:
        print('\n--check: все якоря найдены ровно по одному разу, файлы не менялись')
    else:
        print('\nГотово: правок в %d файлах' % changed)


if __name__ == '__main__':
    main()

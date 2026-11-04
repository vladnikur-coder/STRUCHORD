#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""0.793 — правки по ревью преподавателя (B-39: расположения/голосоведение).

Пять пунктов ревью 2026-11-04, все подтверждены по коду:

1. Лимит растяжки: единый потолок генератора 15 п/т (как VL_MAX_SPAN),
   вместо обещаний «играбельно» — текст «в пределах заданного диапазона и
   ограничения размаха» + пояснение, что удобство зависит от руки/темпа/
   способа исполнения, а арпеджио и две руки этим пределом не оцениваются.
2. «Широко» = РАЗДВИЖЕНИЕ теми же нотами (нота переносится на октаву,
   исходная убирается; без удвоения плотности), предлагается только если
   размах вырос, но остался <= 15; иначе широкого нет. «+октава» — отдельно.
3. Подписи: «Правая рука: i/n · плотно/широко» (бас не меняется), стрелки
   «Предыдущее/Следующее расположение»; если широкого нет — явно пишем.
4. parallelPerfects: баг — свёртка min(mod12,12-mod12) даёт 0..6, ветка
   ===7 мёртвая, квинты не распознавались. Чиню: направленные классы mod12
   (7=квинта, 0=октава/унисон), мягкие РАЗДЕЛЬНЫЕ штрафы (квинты ×2,
   октавы/унисоны ×4), не запрет; неподвижный голос — не параллель.
5. 0.789 акцент 13/9 — опция на дорожке endAccent: у НОВЫХ дорожек выключена,
   у старых песен поля нет = включено (звучание не меняется); добавленная
   нота проходит проверку размаха руки (<=15), иначе пропускается; ручные
   партии не трогаются. UI: чекбокс «Выделять 13/9 в конце такта» в
   автоаккомпанементе.

R7: ver 0.793 + struchord-v793 парой.

    python3 dev/tools/patch-review-fixes-0793.py --check
    python3 dev/tools/patch-review-fixes-0793.py
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
K1_OLD = """          if (ext !== null && ext >= 0 && ext <= 127 && st.notes.indexOf(ext) < 0) {
            st.notes = st.notes.concat([ext]).sort(asc);
          }"""
K1_NEW = """          if (ext !== null && ext >= 0 && ext <= 127 && st.notes.indexOf(ext) < 0) {
            // 0.793 (ревью): добавленная надстройка проходит проверку размаха
            // правой руки (<= 15 п/т, потолок генератора); не проходит —
            // украшение пропускается, аккорд не меняется.
            var rh = st.notes.slice(1);
            if (!rh.length || Math.max(Math.max.apply(null, rh), ext) - Math.min.apply(null, rh) <= 15)
              st.notes = st.notes.concat([ext]).sort(asc);
          }"""

K2_OLD = """    function plan(o) {"""
K2_NEW = """    // 0.793 (ревью): опция дорожки endAccent «Выделять 13/9 в конце такта».
    // У старых песен поля нет — тогда прежнее поведение 0.789 (акцент
    // включён): сохранённые партии не меняют звучание. У новых дорожек false.
    function endAccentEnabled(o) {
      var T = HOST.StruChordTracks, t = T && typeof T.track === 'function' && o && o.trackId ? T.track(o.trackId) : null;
      return !t || t.endAccent !== false;
    }
    function plan(o) {"""

K3_OLD = """        applyExtensionAccent(single, C, span, sub);   // 0.789 (B-117): 13-я/9-я сверху на блоковом аккорде автоплана"""
K3_NEW = """        if (endAccentEnabled(o)) applyExtensionAccent(single, C, span, sub);   // 0.789/0.793: 13-я/9-я сверху, если опция включена"""

K4_OLD = """      if (cfg.source !== 'cell' && !(o.pattern && o.pattern.status === 'manual')) out = applyExtensionAccent(out, C, beats, sub);"""
K4_NEW = """      if (endAccentEnabled(o) && cfg.source !== 'cell' && !(o.pattern && o.pattern.status === 'manual')) out = applyExtensionAccent(out, C, beats, sub);"""

# ---------- STRUCHORD.html ----------
# 4. parallelPerfects: чиним обнаружение, мягкие раздельные штрафы
H1_OLD = """  /** Параллельные квинты и октавы между голосами — грубая ошибка. */
  function parallelPerfects(moves) {
    var n = 0;
    for (var i = 0; i < moves.length; i++) for (var j = i + 1; j < moves.length; j++) {
      var a = moves[i], b = moves[j];
      if (a.from === null || a.to === null || b.from === null || b.to === null) continue;
      if (a.to === a.from || b.to === b.from) continue;          // один голос стоит
      if (Math.sign(a.to - a.from) !== Math.sign(b.to - b.from)) continue;  // разные стороны
      var before = Math.min(mod12(b.from - a.from), 12 - mod12(b.from - a.from));
      var after = Math.min(mod12(b.to - a.to), 12 - mod12(b.to - a.to));
      if (before === after && (before === 0 || before === 7)) n++;
    }
    return n;
  }"""
H1_NEW = """  /** Параллельные совершенные интервалы между голосами — МЯГКИЕ штрафы, не запрет
   *  (ревью 0.793): параллельная квинта (направленный класс 7) — малый штраф,
   *  параллельные октава/унисон (класс 0) — больший. В поп/рок/джазе параллели
   *  допустимы; приоритет — осмысленный состав, удобство рук, верхняя линия.
   *  Неподвижный голос — не параллель; бас вне движений (RH-only), поэтому
   *  «бас oktавой» и удвоение мелодии oktавой штрафом не задеваются.
   *  ВАЖНО: свёртка min(mod12(d), 12-mod12(d)) даёт 0..6 и квинту (7) превращает
   *  в 5 — такая ветка квинты НЕ видит. Сравниваем направленные классы mod12. */
  function parallelPerfects(moves) {
    var fifths = 0, octaves = 0;
    for (var i = 0; i < moves.length; i++) for (var j = i + 1; j < moves.length; j++) {
      var a = moves[i], b = moves[j];
      if (a.from === null || a.to === null || b.from === null || b.to === null) continue;
      if (a.to === a.from || b.to === b.from) continue;          // один голос стоит
      if (Math.sign(a.to - a.from) !== Math.sign(b.to - b.from)) continue;  // разные стороны
      var before = mod12(b.from - a.from), after = mod12(b.to - a.to);
      if (before !== after) continue;
      if (before === 7) fifths++;
      else if (before === 0) octaves++;
    }
    return { fifths: fifths, octaves: octaves };
  }"""

H2_OLD = """    cost += parallelPerfects(match.moves) * 6;"""
H2_NEW = """    var pp = parallelPerfects(match.moves);
    cost += pp.fifths * 2 + pp.octaves * 4;   // 0.793 (ревью): мягкие раздельные штрафы, не запрет"""

H3_OLD = """  //   * параллельные квинты и октавы запрещены (штраф больше, чем любая
  //     экономия движения);"""
H3_NEW = """  //   * параллельные квинты — малый штраф, параллельные октавы/унисоны — больший
  //     (0.793, мягко, не запрет: в жанровом аккомпанементе параллели допустимы,
  //     а приоритет — состав аккорда, удобство рук и верхняя линия);"""

# 1. единый потолок размаха 15
H4_OLD = """      if(last>hi || last-start>16)continue;"""
H4_NEW = """      if(last>hi || last-start>15)continue;   // 0.793: единый потолок размаха правой руки 15 п/т (как VL_MAX_SPAN)"""

# 2. «Широко» = раздвижение теми же нотами
H5_OLD = """      if (size >= 61 && rh.length && base.length < limit && base.length < 9) {
        // «Широко» по-пианистски: поднимаем ОДНУ ноту правой руки на октаву,
        // пробуя сверху вниз, но размах руки должен остаться <= 16 полутонов
        // (тот же лимит, что в inversionCandidates) — иначе одной рукой не
        // сыграть. Для C из C E G получится открытое C G E' (48..64), а не
        // C E G G' (48..67, размах 19 — неиграбельно).
        for (var k = rh.length - 1; k >= 0 && slot.wide < 0; k--) {
          var extra = rh[k] + 12;
          if (extra > rhHigh || extra - rh[0] > 16) continue;
          var dup = base.concat([extra]).sort(function (a, b) { return a - b; });
          var sig = dup.join(',');
          if (!list.some(function (v) { return v.join(',') === sig; })) { slot.wide = list.length; list.push(dup); }
        }
      }"""
H5_NEW = """      if (size >= 61 && rh.length) {
        // 0.793 (ревью): «Широко» = РАЗДВИЖЕНИЕ теми же нотами — одна нота
        // правой руки переносится на октаву, исходная убирается; число голосов,
        // состав аккорда и бас не меняются (удвоения плотности нет — «+октава»
        // будет отдельным приёмом). Вариант предлагается, только если размах
        // руки вырос, но остался в пределах потолка генератора 15 п/т;
        // если удобного широкого нет — широкого нет вообще.
        var baseSpan = rh[rh.length - 1] - rh[0], best = null, bestSpan = 1e9;
        for (var k = 0; k < rh.length; k++) {
          for (var d = 0; d < 2; d++) {
            var moved = rh[k] + (d ? -12 : 12);
            if (moved < lo || moved > rhHigh) continue;
            var cand = rh.map(function (n, idx) { return idx === k ? moved : n; }).sort(function (a, b) { return a - b; });
            var span = cand[cand.length - 1] - cand[0];
            if (span <= baseSpan || span > 15) continue;
            var notes = [base[0]].concat(cand);
            var sig = notes.join(',');
            if (sig === base.join(',') || list.some(function (v) { return v.join(',') === sig; })) continue;
            if (span < bestSpan) { bestSpan = span; best = notes; }
          }
        }
        if (best) { slot.wide = list.length; list.push(best); }
      }"""

# 3. подписи
H6_OLD = """          countEl.textContent = mode + ' · обращение ' + (cur2.inv + 1) + '/' + st2.slots.length + (cur2.wide ? ' · широко' : ' · плотно');"""
H6_NEW = """          countEl.textContent = 'Правая рука: ' + (cur2.inv + 1) + '/' + st2.slots.length + (cur2.wide ? ' · широко' : hasWide ? ' · плотно' : ' · плотно, широкого нет');"""

H7_OLD = """    var prev = el('button', '', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', 'Предыдущая позиция');"""
H7_NEW = """    var prev = el('button', '', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', 'Предыдущее расположение');"""
H8_OLD = """    var next = el('button', '', '›'); next.type = 'button'; next.setAttribute('aria-label', 'Следующая позиция');"""
H8_NEW = """    var next = el('button', '', '›'); next.type = 'button'; next.setAttribute('aria-label', 'Следующее расположение');"""
H9_OLD = """    nav.setAttribute('aria-label', 'Расположение аккорда');"""
H9_NEW = """    nav.setAttribute('aria-label', 'Расположение правой руки (бас не меняется)');
    nav.title = 'Автоматически подобранное расположение. Удобство зависит от размера руки, темпа и способа исполнения; широкие интервалы могут потребовать арпеджирования или распределения между руками. Этот предел не оценивает удобство арпеджио и игры двумя руками.';"""

H10_OLD = """    densityEl.setAttribute('role', 'group'); densityEl.setAttribute('aria-label', 'Плотность расположения');"""
H10_NEW = """    densityEl.setAttribute('role', 'group'); densityEl.setAttribute('aria-label', 'Расположение правой руки: плотно или широко. Бас не меняется');"""
H11_OLD = """    densityTight.setAttribute('aria-pressed', 'true'); densityTight.title = 'Ноты правой руки в пределах октавы';"""
H11_NEW = """    densityTight.setAttribute('aria-pressed', 'true'); densityTight.title = 'Ноты правой руки плотно (в пределах потолка размаха генератора 15 полутонов — не норма руки)';"""
H12_OLD = """    densityWide.setAttribute('aria-pressed', 'false'); densityWide.title = 'Верхняя нота правой руки удваивается октавой выше (на клавиатурах от 61 клавиши)';"""
H12_NEW = """    densityWide.setAttribute('aria-pressed', 'false'); densityWide.title = 'Раздвинуть расположение правой руки без добавления нот (на клавиатурах от 61 клавиши), если размах руки остаётся в пределах 15 полутонов; иначе широкого варианта нет';"""

# 5. endAccent: дефолт новой дорожки, sanitize, setter, экспорт
H13_OLD = """      ...(instrument === 'keys' ? {linkedVoicings:true} : {}),"""
H13_NEW = """      ...(instrument === 'keys' ? {linkedVoicings:true, endAccent:false} : {}),   // 0.793: у НОВЫХ клавишных дорожек «13/9 в конце такта» выключено"""
H14_OLD = """        ...(raw.linkedVoicings===true ? {linkedVoicings:true} : {}),"""
H14_NEW = """        ...(raw.linkedVoicings===true ? {linkedVoicings:true} : {}),
        ...(raw.endAccent===false ? {endAccent:false} : {}),   // 0.793: у старых песен поля нет — акцент остаётся как в 0.789"""
H15_OLD = """  function setLinkedVoicings(id,on) {
    var t=findTrack(id); if(!t || t.instrument!=='keys' || typeof on!=='boolean')return false;
    if(!!t.linkedVoicings===on)return true;
    return dispatch('b39/linked-voicings',function(){if(on)t.linkedVoicings=true;else delete t.linkedVoicings;return true;});
  }"""
H15_NEW = """  function setLinkedVoicings(id,on) {
    var t=findTrack(id); if(!t || t.instrument!=='keys' || typeof on!=='boolean')return false;
    if(!!t.linkedVoicings===on)return true;
    return dispatch('b39/linked-voicings',function(){if(on)t.linkedVoicings=true;else delete t.linkedVoicings;return true;});
  }
  // 0.793: опция «Выделять 13/9 в конце такта». absent === true (старые песни, 0.789).
  function setEndAccent(id,on) {
    var t=findTrack(id); if(!t || t.instrument!=='keys' || typeof on!=='boolean')return false;
    if((t.endAccent!==false)===on)return true;
    return dispatch('b39/end-accent',function(){if(on)delete t.endAccent;else t.endAccent=false;return true;});
  }"""
H16_OLD = """    setLinkedVoicings:setLinkedVoicings, clearVoicingChoice:clearVoicingChoice,"""
H16_NEW = """    setLinkedVoicings:setLinkedVoicings, setEndAccent:setEndAccent, clearVoicingChoice:clearVoicingChoice,"""

# 5. UI чекбокса в автоаккомпанементе
H17_OLD = """    linkRow.appendChild(link);linkRow.appendChild(element('span','','Плавные обращения для всей дорожки (ручные позиции сохраняются)'));box.appendChild(linkRow);"""
H17_NEW = """    linkRow.appendChild(link);linkRow.appendChild(element('span','','Плавные обращения для всей дорожки (ручные позиции сохраняются)'));box.appendChild(linkRow);
    var accRow=element('label','tools-label b39-auto-select'), acc=element('input');acc.type='checkbox';acc.id='b39AutoEndAccent';acc.checked=track.endAccent!==false;
    accRow.appendChild(acc);accRow.appendChild(element('span','','Выделять 13/9 в конце такта'));
    accRow.title='Добавлять сверху 13-ю, иначе 9-ю ступень, если она есть в обозначении аккорда, на последней блоковой атаке такта. Может менять верхнюю линию и увеличивать размах. Выключение не удаляет 9/13 из самого аккорда — отключает только дополнительное выделение.';
    box.appendChild(accRow);"""
H18_OLD = """        T().setAutoAccomp(next);T().setLinkedVoicings(dialogTrack,link.checked);"""
H18_NEW = """        T().setAutoAccomp(next);T().setLinkedVoicings(dialogTrack,link.checked);T().setEndAccent(dialogTrack,acc.checked);"""

# R7
HTML_OLD = """· ver 0.792</span></span>"""
HTML_NEW = """· ver 0.793</span></span>"""
SW_OLD = """const CACHE_NAME = 'struchord-v792';"""
SW_NEW = """const CACHE_NAME = 'struchord-v793';"""


def main():
    ap = argparse.ArgumentParser(description='0.793: правки по ревью преподавателя')
    ap.add_argument('--check', action='store_true', help='только проверить якоря, файлы не менять')
    args = ap.parse_args()
    jobs = [
        ('keyboard-accompaniment.js', [
            (K1_OLD, K1_NEW, 'акцент: проверка размаха руки <=15 для добавленной ноты'),
            (K2_OLD, K2_NEW, 'endAccentEnabled helper'),
            (K3_OLD, K3_NEW, 'plan default-ветка: гейт endAccent'),
            (K4_OLD, K4_NEW, 'plan основной цикл: гейт endAccent'),
        ]),
        ('STRUCHORD.html', [
            (H1_OLD, H1_NEW, 'parallelPerfects: чиним обнаружение (mod12 без свёртки), {fifths,octaves}'),
            (H2_OLD, H2_NEW, 'штрафы мягкие раздельные: квинты ×2, октавы ×4'),
            (H3_OLD, H3_NEW, 'комментарий: не запрет'),
            (H4_OLD, H4_NEW, 'потолок размаха 15 в inversionCandidates'),
            (H5_OLD, H5_NEW, '«Широко» = раздвижение теми же нотами (без удвоения), спан > базового и <=15'),
            (H6_OLD, H6_NEW, 'счётчик «Правая рука: i/n · плотно/широко» (+широкого нет)'),
            (H7_OLD, H7_NEW, 'aria prev «Предыдущее расположение»'),
            (H8_OLD, H8_NEW, 'aria next «Следующее расположение»'),
            (H9_OLD, H9_NEW, 'nav aria/title: бас не меняется + оговорка про удобство'),
            (H10_OLD, H10_NEW, 'toggl aria-label'),
            (H11_OLD, H11_NEW, 'tight title'),
            (H12_OLD, H12_NEW, 'wide title: раздвижение без добавления нот'),
            (H13_OLD, H13_NEW, 'новая дорожка: endAccent:false'),
            (H14_OLD, H14_NEW, 'sanitize: endAccent только явный false (old = on)'),
            (H15_OLD, H15_NEW, 'setEndAccent setter'),
            (H16_OLD, H16_NEW, 'export setEndAccent'),
            (H17_OLD, H17_NEW, 'чекбокс b39AutoEndAccent в автопанели'),
            (H18_OLD, H18_NEW, 'apply: setEndAccent'),
            (HTML_OLD, HTML_NEW, 'ver 0.793'),
        ]),
        ('sw.js', [
            (SW_OLD, SW_NEW, 'CACHE_NAME v793'),
        ]),
    ]
    out = {}
    for rel, edits in jobs:
        p = ROOT / rel
        text = p.read_text(encoding='utf-8')
        for old, new, label in edits:
            text = replace_once(text, old, new, rel + ': ' + label)
        out[rel] = text
        print('  ok  %-28s %d якорей' % (rel, len(edits)))
    if args.check:
        print('ПРОВЕРКА ПРОЙДЕНА: все якоря на месте, файлы не менялись.')
        return 0
    for rel, text in out.items():
        (ROOT / rel).write_text(text, encoding='utf-8')
    print('ПАТЧ ПРИМЕНЁН: 0.792 -> 0.793 (R7: HTML+sw парой, keyboard-accompaniment.js тоже).')
    return 0


if __name__ == '__main__':
    sys.exit(main())

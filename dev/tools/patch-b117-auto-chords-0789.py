#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""B-117 / 0.789 — «аккорды в автоплане»: 13-я/9-я сверху на последнем аккорде такта.

Патч по якорям, без `git apply`. Применяется один раз к 0.788:

    python3 dev/tools/patch-b117-auto-chords-0789.py --check
    python3 dev/tools/patch-b117-auto-chords-0789.py

Кирпич 3 очереди B-39 («щелчок → продолжение между секциями → аккорды в
автоплане»). Владелец на R8 (2026-11-04): «зависит от жанра, как бы сделал
пианист?» — резюме подтверждено `final=yes`.

Read-only замер до кода: воцинг уже «как пианист» — `toneRank` в
generateKeysVoicings ставит 9/13 выше квинты, поэтому у C13 квинта выпадает
раньше 13-й (проверено в dev/specs/keyboard-players-research.md: C13 на
61 клавише = [36,48,50,52,53,55,57,58]). В переборах (токен A) расширения
и так попадают в перебор. Не хватало только блоковых рисунков: пресеты
используют лишь H/R/M/B/O/A/t1/t3/t5, расширения (t7/t9/t11/t13) в
авто-рисунок не попадали.

Решение (только автоплан, ручные рисунки и старые песни не трогаются):
в блоковых рисунках (токены H/R) последний аккорд каждого такта получает
сверху 13-ю ступень, а если её нет в аккорде — 9-ю; ступени нет — шаг не
меняется. В вальсе это естественно ложится на аккорд 3-й доли. Переборы
(A/t3/t5) без изменений. Звук, превью и экспорт используют один план()
 — применяется везде одинаково.

Не меняется: воцинги, ручные рисунки ячеек и секций (source 'cell' и
status 'manual'), пресеты переборов, pad-линия 0.782–0.785, метроном,
экспорт-форматы, история, UI. R7: версия в шапке HTML и CACHE_NAME в sw.js
меняются парой.
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


# ---------------------------------------------------------------------------
# 1. keyboard-accompaniment.js — helper + два вызова в plan()
# ---------------------------------------------------------------------------
HELPER_ANCHOR_OLD = """    function plan(o) {
      o = o || {};
"""
HELPER_ANCHOR_NEW = """    // 0.789 (B-117) · «аккорды в автоплане»: в блоковых авто-рисунках
    // последний аккорд каждого такта получает сверху «цветную» ступень —
    // 13-ю, а если её нет в аккорде, то 9-ю, — как делает пианист в
    // поп/роке («top note» на последнем ударе такта). Ступени нет в
    // аккорде — шаг не меняется. Переборы (A/t3/t5) и ручные рисунки не трогаем.
    function extensionAccentMidi(C, topOf) {
      var f = C && C.formula;
      if (!f || !Array.isArray(f.tones)) return null;
      var pc = tonePitchClass(f, 't13');
      if (pc === null) pc = tonePitchClass(f, 't9');
      if (pc === null) return null;
      var low = Number.isFinite(C.low) ? C.low : 0, high = Number.isFinite(C.high) ? C.high : 127;
      var m = null, x;
      for (x = Math.max(topOf + 1, low); x <= high; x++) if (mod12(x) === pc) { m = x; break; }
      if (m === null) for (x = high; x >= low; x--) if (mod12(x) === pc) { m = x; break; }
      return m;
    }
    function applyExtensionAccent(steps, C, beats, sub) {
      if (!Array.isArray(steps) || !steps.length) return steps;
      var perBar = Math.max(1, Math.round((Number(beats) || 1) * (Number(sub) || 1)));
      for (var bar = 0; bar < steps.length; bar += perBar) {
        var end = Math.min(bar + perBar, steps.length);
        for (var k = end - 1; k >= bar; k--) {
          var st = steps[k], tk = st.token;
          var toks = Array.isArray(tk) ? tk : [tk];
          if (toks.indexOf('H') < 0 && toks.indexOf('R') < 0) continue;
          if (!Array.isArray(st.notes) || !st.notes.length) continue;
          var top = Math.max.apply(null, st.notes);
          var ext = extensionAccentMidi(C, top);
          if (ext !== null && ext >= 0 && ext <= 127 && st.notes.indexOf(ext) < 0) {
            st.notes = st.notes.concat([ext]).sort(asc);
          }
          break;
        }
      }
      return steps;
    }

    function plan(o) {
      o = o || {};
"""

DEFAULT_OLD = """        var single=[{index:0,stepIndex:0,token:'H',at:0,dur:dur,notes:tokenNotes('H',C,function(){return 0;}),subdivision:sub,swing:false,type:cfg.type,source:cfg.source}];
"""
DEFAULT_NEW = """        var single=[{index:0,stepIndex:0,token:'H',at:0,dur:dur,notes:tokenNotes('H',C,function(){return 0;}),subdivision:sub,swing:false,type:cfg.type,source:cfg.source}];
        applyExtensionAccent(single, C, span, sub);   // 0.789 (B-117): 13-я/9-я сверху на блоковом аккорде автоплана
"""

LOOP_OLD = """      out = articulate(out, o);   // 0.776: исполнение зависит от тембра
"""
LOOP_NEW = """      // 0.789 (B-117): автоплан «как пианист» — в блоковых рисунках
      // последний аккорд такта получает сверху 13-ю (или 9-ю), если эта
      // ступень есть в аккорде. Ручные рисунки (ячейка / manual) не трогаем.
      if (cfg.source !== 'cell' && !(o.pattern && o.pattern.status === 'manual')) out = applyExtensionAccent(out, C, beats, sub);
      out = articulate(out, o);   // 0.776: исполнение зависит от тембра
"""

# ---------------------------------------------------------------------------
# 2. R7: версия и кэш выкладываются парой
# ---------------------------------------------------------------------------
HTML_OLD = """· ver 0.788</span></span>"""
HTML_NEW = """· ver 0.789</span></span>"""

SW_OLD = """const CACHE_NAME = 'struchord-v788';"""
SW_NEW = """const CACHE_NAME = 'struchord-v789';"""


def main():
    ap = argparse.ArgumentParser(description='B-117 / 0.789: в автоплане последний аккорд такта получает 13-ю/9-ю сверху (блоковые рисунки)')
    ap.add_argument('--check', action='store_true', help='только проверить якоря, файлы не менять')
    args = ap.parse_args()
    jobs = [
        ('STRUCHORD.html', [
            (HTML_OLD, HTML_NEW, 'версия в шапке'),
        ]),
        ('keyboard-accompaniment.js', [
            (HELPER_ANCHOR_OLD, HELPER_ANCHOR_NEW, 'helpers extensionAccentMidi/applyExtensionAccent перед plan()'),
            (DEFAULT_OLD, DEFAULT_NEW, 'вызов в default-ветке plan() (один блок на ячейку)'),
            (LOOP_OLD, LOOP_NEW, 'вызов в основном цикле plan() до articulate()'),
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
    print('ПАТЧ ПРИМЕНЁН: 0.788 -> 0.789 (R7: HTML и sw.js выложены парой).')
    return 0


if __name__ == '__main__':
    sys.exit(main())

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""B-113 / 0.785 — смена аккорда НАЧИНАЕТСЯ на щелчке (R8 подтверждён 2026-11-03).

Патч по якорям, без `git apply`: рабочие файлы ушли вперёд от любого снимка.
Применяется один раз к 0.784:

    python3 dev/tools/patch-b113-chord-on-click-0785.py --check
    python3 dev/tools/patch-b113-chord-on-click-0785.py

Жалоба владельца после 0.784: «аккорд сменяется раньше клика». Read-only замер
(`/tmp/pad-early-audit-0784.js`, в репозиторий не вошёл) на 4/4 @120 показал:
высота pad начинает ползти в 1,833 с при щелчке 2,000 с (−167 мс), середина
перемены 1,917 с (−83 мс), новый аккорд набирает громкость ровно в 2,000 с.
0.784 укоротил заход с 350 до 167 мс, но НЕ перенёс его: весь переход по-
прежнему лежал ДО щелчка. Владелец уточнил: ≈⅓ доли раньше, на каждом
аккорде, поэтому выбрал «слайд на щелчке и после него» (цена M) и полный
комплект.

Суть правки: в padStep() конец голоса отодвигается на длину перехода
(end = boundary + lead), поэтому те же самые вызовы padGlide/padRelease/
padVoice теперь ставят изгиб, уход старых нот и наплыв новых на отрезок
[щелчок, щелчок + 1/3 доли] вместо [щелчок − 1/3 доли, щелчок].

Длина от доли (0.784), предел 0,35 с, S-кривая, hold общих тонов, padNext от
плеера (0.783), часы метронома (0.784), findNextEvent, 0.775 и Стоп не меняются.
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
# 1. keyboard-audio.js — перенос перехода за щелчок
# ---------------------------------------------------------------------------
AUDIO_STEP_OLD = """      var end = start + dur;
      var key = String(trackId);
      var line = (padLines.get(key) || []).filter(function (v) { return !v.dead && v.end + v.tail > start; });
      var lead = Math.max(.05, Math.min(Number(info.lead) || .35, dur * .45));
"""
AUDIO_STEP_NEW = """      var key = String(trackId);
      var line = (padLines.get(key) || []).filter(function (v) { return !v.dead && v.end + v.tail > start; });
      var lead = Math.max(.05, Math.min(Number(info.lead) || .35, dur * .45));
      // 0.785 (B-113): смена аккорда больше НЕ опережает щелчок. Граница
      // ячейки — это сам щелчок; изгиб, уход старых нот и наплыв новых идут
      // от boundary до boundary + lead. Голоса поэтому живут на lead дольше
      // ячейки, иначе Web Audio оборвал бы их прямо на ударе. Следующая
      // ячейка продлевает их обычным padExtend(), лишних источников нет.
      var boundary = start + dur;
      var end = boundary + lead;
"""

AUDIO_HIGHLIGHT_OLD = """        if (!v.dead) scheduleKeyHighlight(ctx, channel, v.midi, start, end - start);
"""
AUDIO_HIGHLIGHT_NEW = """        // Подсветка клавиш остаётся в рамках ячейки: звук живёт чуть дольше
        // границы, но визуально аккорд по-прежнему сменяется на щелчке.
        if (!v.dead) scheduleKeyHighlight(ctx, channel, v.midi, start, dur);
"""

AUDIO_COMMENT_OLD = """    // по высоте smoothstep-кривой за 1/3 доли (0.784) ДО границы и приходит в неё
    // ровно. Лишние голоса уходят, новые наплывают — паузы в звуке нет.
"""
AUDIO_COMMENT_NEW = """    // по высоте smoothstep-кривой за 1/3 доли (0.784), а с 0.785 — НАЧИНАЯ
    // с границы: старый аккорд держится до щелчка, новый приходит через 1/3
    // доли ПОСЛЕ него. Лишние голоса уходят, новые наплывают — паузы нет.
"""

AUDIO_COMMENT2_OLD = """      // новых нот. Штатный слайд на 0,35 с ставится картой заранее.
"""
AUDIO_COMMENT2_NEW = """      // новых нот. Штатный слайд (0.785: после щелчка) ставится картой заранее.
"""

# ---------------------------------------------------------------------------
# 2. keyboard-accompaniment.js — только уточняем смысл величины
# ---------------------------------------------------------------------------
ACCOMP_CONST_OLD = """    // 0.782: 0,35 с — замер опережения по видео. 0.784: это ПРЕДЕЛ,
    // а рабочая длина считается от доли метронома (padGlideLeadFor).
    // На 120 BPM 0,35 с занимали ~18 % ячейки (в видео было ~9 %), и pad
    // начинал менять аккорд задолго до щелчка. Теперь заход ровно 1/3 доли.
"""
ACCOMP_CONST_NEW = """    // 0.782: 0,35 с — замер опережения по видео. 0.784: это ПРЕДЕЛ,
    // а рабочая длина считается от доли метронома (padGlideLeadFor):
    // ровно 1/3 пульса. 0.785: величина та же, но отсчитывается ПОСЛЕ
    // щелчка — старый аккорд держится до удара, новый приходит через 1/3
    // доли. Имя lead сохранено для совместимости API и тестов: теперь это
    // длина перехода, а не опережение.
"""

ACCOMP_LEAD_OLD = """      // 0.784: заход от доли метронома, а не фиксированные 0,35 с.
      var lead = padGlideLeadFor(o);
"""
ACCOMP_LEAD_NEW = """      // 0.785: длина перехода от доли метронома; отсчёт идёт от щелчка.
      var lead = padGlideLeadFor(o);
"""

ACCOMP_COMMENT_OLD = """    // Войсинг РЕАЛЬНО следующего события. Слайд (0.784: 1/3 доли) нельзя поставить
"""
ACCOMP_COMMENT_NEW = """    // Войсинг РЕАЛЬНО следующего события. Слайд (0.785: после щелчка) нельзя поставить
"""

# ---------------------------------------------------------------------------
# 3. STRUCHORD.html — версия, кэш и уточнённый комментарий
# ---------------------------------------------------------------------------
HTML_COMMENT_OLD = """  // 0.783: pad'у нужен РЕАЛЬНЫЙ следующий аккорд ЗА время захода до
  // границы (0.784: это 1/3 доли, а не фиксированные 0,35 с),
"""
HTML_COMMENT_NEW = """  // 0.783: pad'у нужен РЕАЛЬНЫЙ следующий аккорд К границе: переход
  // ставится заранее из текущей ячейки. 0.785: он начинается НА щелчке
  // и длится 1/3 доли после него, так что ответ нужен всё так же заранее.
"""

HTML_VERSION_OLD = """· ver 0.784"""
HTML_VERSION_NEW = """· ver 0.785"""
SW_OLD = """const CACHE_NAME = 'struchord-v784';"""
SW_NEW = """const CACHE_NAME = 'struchord-v785';"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true', help='только проверить якоря, ничего не менять')
    args = ap.parse_args()

    jobs = [
        ('STRUCHORD.html', [
            (HTML_COMMENT_OLD, HTML_COMMENT_NEW, 'комментарий про место перехода'),
            (HTML_VERSION_OLD, HTML_VERSION_NEW, 'версия в шапке'),
        ]),
        ('keyboard-audio.js', [
            (AUDIO_STEP_OLD, AUDIO_STEP_NEW, 'padStep: boundary + lead'),
            (AUDIO_HIGHLIGHT_OLD, AUDIO_HIGHLIGHT_NEW, 'подсветка в рамках ячейки'),
            (AUDIO_COMMENT_OLD, AUDIO_COMMENT_NEW, 'комментарий про кривую'),
            (AUDIO_COMMENT2_OLD, AUDIO_COMMENT2_NEW, 'комментарий про штатный слайд'),
        ]),
        ('keyboard-accompaniment.js', [
            (ACCOMP_CONST_OLD, ACCOMP_CONST_NEW, 'смысл величины lead'),
            (ACCOMP_LEAD_OLD, ACCOMP_LEAD_NEW, 'padFigure: комментарий'),
            (ACCOMP_COMMENT_OLD, ACCOMP_COMMENT_NEW, 'padNextVoicing: комментарий'),
        ]),
        ('sw.js', [(SW_OLD, SW_NEW, 'CACHE_NAME')]),
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
    print('ПАТЧ ПРИМЕНЁН: 0.784 -> 0.785 (R7: HTML и sw.js выложены парой).')
    return 0


if __name__ == '__main__':
    sys.exit(main())

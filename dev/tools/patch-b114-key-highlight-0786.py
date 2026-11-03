#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""B-114 / 0.786 — подсветка клавиш показывает звучащий аккорд (R8 подтверждён 2026-11-03).

Патч по якорям, без `git apply`: рабочие файлы ушли вперёд от любого снимка.
Применяется один раз к 0.785:

    python3 dev/tools/patch-b114-key-highlight-0786.py --check
    python3 dev/tools/patch-b114-key-highlight-0786.py

Жалоба владельца после принятой 0.785 («звук хорош»):
«но теперь на клавишах подсветка не совпадает с тем, что звучит при
воспроизведении». Уточнения владельца: `ahead` — «горят ноты следующего
аккорда заранее», `panel` — панель клавиш, `by_chord` — вариант A «по
аккорду, смена на щелчке», `switch_clean` — уходящие ноты гаснут сразу на
щелчке, `full` — полный комплект, `final_yes` — «Да, начинай 0.786».

Read-only замер (`/tmp/key-highlight-audit-0785.js`, в репозиторий не вошёл),
4/4 @120 BPM, C -> Am -> F, щелчки 2,000 и 4,000 с:

    t=1,00  звучит C  [48,55,60,64]   горело [45,55,60,64]  (уже Am)
    t=2,05  звучит 48->45             горело [45,53,57,60]  (уже F)
    t=3,00  звучит Am [45,55,60,64]   горело [45,53,57,60]  (уже F)
    t=4,05  звучит переход            горело []
    новая нота 67 подсвечена с t=0, а звучит только с t=2.

Диагноз: `padGlide()` помечает голос БУДУЩЕЙ нотой (`v.midi = toMidi`) ещё
в момент планирования карты перехода, а подсветка `padStep()` читала именно
`v.midi`. До 0.785 звук сам «подъезжал» к этой ноте перед щелчком, поэтому
расхождение было коротким; после переноса перехода НА щелчок звук весь такт
остаётся старым, а подсветка показывает следующий аккорд — опережение стало
равным целой ячейке. Плюс `release`-голоса не подсвечивались вовсе, а
подсветка обрывалась на границе, хотя звук живёт ещё `lead`.

Правка ТОЛЬКО визуальная: в `padStep()` подсветка берёт `p.from` (ноту,
которая реально звучит от `start` до щелчка) вместо мутированного `v.midi`.
Интервал подсветки остаётся `[start, start + dur]`, поэтому переключение
происходит ровно на щелчке: записи следующей ячейки начинаются в её `start`.
Уходящие ноты горят до щелчка и гаснут вместе со сменой аккорда; новые ноты
загораются только со своей ячейкой; пустоты на стыке нет.

Звуковое расписание 0.785 НЕ меняется: `boundary = start + dur`,
`end = boundary + lead`, `lead`, S-кривая, часы метронома, `findNextEvent`,
`previewEvent`, `padNext`, 0.775 и мгновенный Стоп не тронуты. Осознанный
риск: первые ~0,17 с после щелчка подсветка уже нового аккорда, а звук ещё
доезжает (расхождение сжалось с 2,0 с до 0,17 с).
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
# 1. keyboard-audio.js — подсветка по звучащему аккорду
# ---------------------------------------------------------------------------
AUDIO_GLIDE_OLD = """        v.midi = toMidi; v.rate = target;
"""
AUDIO_GLIDE_NEW = """        // 0.786 (B-114): v.midi здесь уже нота СЛЕДУЮЩЕГО аккорда. Подсветка
        // её больше не читает — она берёт p.from (см. padStep ниже). Звук и
        // само голосоведение от этого комментария не меняются.
        v.midi = toMidi; v.rate = target;
"""

AUDIO_DECL_OLD = """      var nextLine = [], used = [];
"""
AUDIO_DECL_NEW = """      var nextLine = [], used = [], litNotes = [];
"""

AUDIO_COLLECT_OLD = """          if (v) {
            used.push(v);
            if (p.kind === 'glide' && p.to !== null) padGlide(v, p.to, end - lead, end);
"""
AUDIO_COLLECT_NEW = """          if (v) {
            used.push(v);
            // 0.786 (B-114): p.from — нота, которая звучит ДО щелчка в этой
            // ячейке. Запоминаем её ДО padGlide(), иначе v.midi уедет вперёд
            // на целый аккорд. new-ноты (from === null) сюда не попадают: они
            // начинают звучать только после щелчка и подсветятся своей ячейкой.
            litNotes.push(p.from);
            if (p.kind === 'glide' && p.to !== null) padGlide(v, p.to, end - lead, end);
"""

AUDIO_HIGHLIGHT_OLD = """      // 0.763: звучащие клавиши подсвечиваются и в непрерывной линии pad.
      nextLine.forEach(function (v) {
        // Подсветка клавиш остаётся в рамках ячейки: звук живёт чуть дольше
        // границы, но визуально аккорд по-прежнему сменяется на щелчке.
        if (!v.dead) scheduleKeyHighlight(ctx, channel, v.midi, start, dur);
      });
"""
AUDIO_HIGHLIGHT_NEW = """      // 0.763 / 0.786 (B-114): звучащие клавиши подсвечиваются и в
      // непрерывной линии pad. Раньше здесь читали v.midi — но padGlide()
      // помечает голос нотой СЛЕДУЮЩЕГО аккорда заранее, поэтому с 0.785
      // подсветка опережала звук на целую ячейку. Берём litNotes (p.from):
      // это ноты реально звучащего аккорда, а не подготовленного следующего.
      // Интервал [start, start + dur] сохранён: смена подсветки происходит
      // ровно на щелчке, уходящие ноты гаснут вместе со сменой аккорда, а
      // пустоты на стыке нет (записи новой ячейки стартуют в её start).
      litNotes.forEach(function (m) {
        scheduleKeyHighlight(ctx, channel, m, start, dur);
      });
"""

# ---------------------------------------------------------------------------
# 2/3. R7: версия и кэш выкладываются парой
# ---------------------------------------------------------------------------
HTML_OLD = """· ver 0.785</span></span>"""
HTML_NEW = """· ver 0.786</span></span>"""

SW_OLD = """const CACHE_NAME = 'struchord-v785';"""
SW_NEW = """const CACHE_NAME = 'struchord-v786';"""


def main():
    ap = argparse.ArgumentParser(description='B-114 / 0.786: подсветка клавиш по звучащему аккорду')
    ap.add_argument('--check', action='store_true', help='только проверить якоря, файлы не менять')
    args = ap.parse_args()
    jobs = [
        ('STRUCHORD.html', [
            (HTML_OLD, HTML_NEW, 'версия в шапке'),
        ]),
        ('keyboard-audio.js', [
            (AUDIO_GLIDE_OLD, AUDIO_GLIDE_NEW, 'padGlide: пометка про v.midi'),
            (AUDIO_DECL_OLD, AUDIO_DECL_NEW, 'padStep: список litNotes'),
            (AUDIO_COLLECT_OLD, AUDIO_COLLECT_NEW, 'padStep: сбор p.from до слайда'),
            (AUDIO_HIGHLIGHT_OLD, AUDIO_HIGHLIGHT_NEW, 'padStep: подсветка по litNotes'),
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
    print('ПАТЧ ПРИМЕНЁН: 0.785 -> 0.786 (R7: HTML и sw.js выложены парой).')
    return 0


if __name__ == '__main__':
    sys.exit(main())

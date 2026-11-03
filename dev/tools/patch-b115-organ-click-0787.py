#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""B-115 / 0.787 — щелчок электрооргана реалистичнее (R8 подтверждён 2026-11-03).

Патч по якорям, без `git apply`. Применяется один раз к 0.786:

    python3 dev/tools/patch-b115-organ-click-0787.py --check
    python3 dev/tools/patch-b115-organ-click-0787.py

Жалоба владельца (log-идея в ROADMAP после 0.782): у электрооргана «есть
какой-то щелчок, возможно он уместен, но не при каждом ударе».

Read-only замер (`/tmp/organ-click-audit.js`, в репозиторий не вошёл, мок
Web Audio в Node): на КАЖДОЙ ноте organAttack() добавлял два слоя поверх
сэмпла — шумовой щелчок клавиши (bandpass-шум, 20 мс) пиком ×1,03–1,16 от
пика самой ноты и перкуссию (синус на 3-й гармонике, хвост 300 мс, пик
~0,23–0,28× ноты). Орган на силу удара почти не реагирует (strength=0.35),
поэтому щелчок одинаково выпирал при любой силе (expr 0.2→1.0: щелчок
0.189→0.368 при ноте 0.180→0.317).

Решения владельца (R8, цена S–M + M доки):
  * `softer` — щелчок клавиши остаётся на каждой ноте (как механический
    контакт у Hammond), но тише: gain `level*(.9+1.4*e)` → `level*(.27+.42*e)*clickVar`
    (≈×0,3), плюс детерминированный разброс уровня от ноты и номера
    повтора (life.clickVar = .75 + rnd*0.5, та же схема, что расстройка
    0.777) — повторы не звучат машинно бит-в-бит;
  * `change` — перкуссия тон-колёс только на НОВОЙ атаке: если та же нота
    этой дорожки звучала менее 0,45 с назад, это повтор внутри рисунка,
    перкуссии нет (life.percussive через lastHit в lifeFor);
  * `wav` — стык петли mp3-сэмплов в ЭТОМ кирпиче НЕ трогаем: отдельным
    кирпичом (WAV-источник/сборщик; источники органа в piano-block только
    mp3), сначала браузерный замер за владельцем;
  * `full` — полный комплект: патч + тест + спек + README/CHANGELOG/ROADMAP.

Не меняется: сэмплы и манифест, makeSustain, остальные тембры (acoustic /
rhodes / pad), звуковое расписание pad 0.782–0.786, метроном, экспорт,
история. R7: версия в шапке HTML и CACHE_NAME в sw.js меняются парой.
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
# 1. keyboard-audio.js — атака органа: тихий щелчок на каждой ноте,
#    перкуссия только на новой атаке
# ---------------------------------------------------------------------------
A_COMMENT1_OLD = """    //  * У органа силы удара нет по природе: акцент даёт щелчок клавиши и
    //    перкуссия, а не громкость.
"""
A_COMMENT1_NEW = """    //  * У органа силы удара нет по природе: акцент даёт перкуссию
    //    тон-колёс (0.787 — только на новой атаке), а не громкость; тихий
    //    щелчок клавиши звучит на каждой ноте.
"""

A_FUNC_OLD = """    // Щелчок клавиши и перкуссия тон-колёс: короткий шум и затухающий тон
    // на третьей гармонике. Именно этого не хватает «электронному» органу.
    function organAttack(ctx, target, midi, start, level, expression) {
      var e = strengthOf(expression), f0 = frequencyOf(midi);
      var nb = hammerBuffer(ctx);
"""
A_FUNC_NEW = """    // Щелчок клавиши и перкуссия тон-колёс: короткий шум и затухающий тон
    // на третьей гармонике. Именно этого не хватает «электронному» органу.
    // 0.787 (B-115): щелчок остался на КАЖДОЙ ноте — как механический
    // контакт у Hammond, — но стал тише (~×0.3) и получил
    // детерминированный разброс уровня от ноты и номера повтора
    // (life.clickVar). Перкуссия звучит только на новой атаке
    // (life.percussive): повтор той же ноты внутри рисунка её не даёт.
    function organAttack(ctx, target, midi, start, level, expression, life) {
      var e = strengthOf(expression), f0 = frequencyOf(midi);
      var clickVar = life && Number.isFinite(life.clickVar) ? life.clickVar : 1;
      var nb = hammerBuffer(ctx);
"""

A_CLICK_OLD = """          g.gain.setValueAtTime(Math.max(.0002, level * (.9 + 1.4 * e)), start);
"""
A_CLICK_NEW = """          g.gain.setValueAtTime(Math.max(.0002, level * (.27 + .42 * e) * clickVar), start);
"""

A_PERC_OLD = """      if (hasRoom()) {
        try {
          var osc = ctx.createOscillator(), pg = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = Math.min(8000, f0 * 3);
"""
A_PERC_NEW = """      if ((!life || life.percussive !== false) && hasRoom()) {
        try {
          var osc = ctx.createOscillator(), pg = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = Math.min(8000, f0 * 3);
"""

A_LIFE_OLD = """      } else if (mode === 'organ') {
        out.jitter = (rnd(2) - .5) * .004;                       // контакты клавиш
      }
"""
A_LIFE_NEW = """      } else if (mode === 'organ') {
        out.jitter = (rnd(2) - .5) * .004;                       // контакты клавиш
        // 0.787 (B-115): щелчок клавиши звучит на каждой ноте, но тихо и с
        // детерминированным разбросом уровня — повторы не звучат машинно
        // бит-в-бит (та же схема, что расстройка у пианино/Rhodes выше).
        out.clickVar = .75 + rnd(4) * .5;
        // Перкуссия тон-колёс — только на НОВОЙ атаке: если та же нота этой
        // дорожки звучала менее 0,45 с назад, это повтор внутри рисунка,
        // а не смена аккорда, — перкуссии нет.
        var prevOrgan = lastHit.get(key);
        out.percussive = !(prevOrgan && at - prevOrgan.at >= 0 && at - prevOrgan.at < .45);
        lastHit.set(key, { at: at });
        if (lastHit.size > 2048) lastHit.clear();
      }
"""

A_CALL_OLD = """      if(mode==='organ')organAttack(ctx,target,midi,start,level,expression);
"""
A_CALL_NEW = """      if(mode==='organ')organAttack(ctx,target,midi,start,level,expression,life);
"""

A_COMMENT2_OLD = """      // акцент даёт атака (щелчок и перкуссия), поэтому громкость почти ровная.
"""
A_COMMENT2_NEW = """      // акцент даёт перкуссию на новой атаке (0.787), а тихий щелчок клавиши
      // звучит на каждой ноте, поэтому громкость почти ровная.
"""

# ---------------------------------------------------------------------------
# 2. R7: версия и кэш выкладываются парой
# ---------------------------------------------------------------------------
HTML_OLD = """· ver 0.786</span></span>"""
HTML_NEW = """· ver 0.787</span></span>"""

SW_OLD = """const CACHE_NAME = 'struchord-v786';"""
SW_NEW = """const CACHE_NAME = 'struchord-v787';"""


def main():
    ap = argparse.ArgumentParser(description='B-115 / 0.787: щелчок органа тише, перкуссия только на новой атаке')
    ap.add_argument('--check', action='store_true', help='только проверить якоря, файлы не менять')
    args = ap.parse_args()
    jobs = [
        ('STRUCHORD.html', [
            (HTML_OLD, HTML_NEW, 'версия в шапке'),
        ]),
        ('keyboard-audio.js', [
            (A_COMMENT1_OLD, A_COMMENT1_NEW, 'комментарий про орган 0.776'),
            (A_FUNC_OLD, A_FUNC_NEW, 'organAttack: сигнатура + life + комментарий 0.787'),
            (A_CLICK_OLD, A_CLICK_NEW, 'щелчок тише (×~0.3) с clickVar'),
            (A_PERC_OLD, A_PERC_NEW, 'перкуссия только при life.percussive'),
            (A_LIFE_OLD, A_LIFE_NEW, 'lifeFor: clickVar + percussive для organ'),
            (A_CALL_OLD, A_CALL_NEW, 'вызов organAttack с life'),
            (A_COMMENT2_OLD, A_COMMENT2_NEW, 'комментарий про калибровку органа'),
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
    print('ПАТЧ ПРИМЕНЁН: 0.786 -> 0.787 (R7: HTML и sw.js выложены парой).')
    return 0


if __name__ == '__main__':
    sys.exit(main())

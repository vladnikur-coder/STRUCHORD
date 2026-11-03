#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""B-112 / 0.784 — pad и метроном на одних часах (R8 подтверждён 2026-11-03).

Патч по якорям, без `git apply`: рабочие файлы ушли вперёд от любого снимка.
Применяется один раз к 0.783:

    python3 dev/tools/patch-b112-metronome-sync-0784.py --check
    python3 dev/tools/patch-b112-metronome-sync-0784.py

Диагностика (только чтение, /tmp/pad-metronome-audit.js): при одном темпе
граница pad и сильный щелчок совпадают ровно (0 мс), но pad НАЧИНАЕТ
перетекать за 0,35 с до щелчка — при 120 BPM это ~18 % ячейки (в видео-
эталоне было ~9 %). Владелец слышит именно это как «pad опережает».
Вторая, отдельная поломка: сетка щелчков вешалась один раз на темп первой
секции и не перевешивалась при смене BPM — замер дал 214 мс уже на первом
такте при 120 -> 140.

Решения владельца (два раунда R8): слайд короче и от доли (1/3 пульса
метронома, предел 0,35 с сохранён); починить ВСЕ часы метронома (смена BPM
секции, смена темпа на ходу, включение на ходу); полный комплект 0.784.
Явное разрешение зайти в планировщик метронома получено — запрет 0.783
снят ТОЛЬКО для этого объёма. findNextEvent, 0.775 «не обрывать ячейку»
и Стоп не переписываются.
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
# 1. STRUCHORD.html — часы метронома
# ---------------------------------------------------------------------------
HTML_STATE_OLD = """function stopMetronomeScheduler() {
  if (metronomeFrameId) {
    cancelAnimationFrame(metronomeFrameId);
    metronomeFrameId = null;
  }
}
let metronomeSubdivision = 1;
function scheduleMetronomeEvents(ctx, st, ts, bpm, resumeAtNow) {
  if (!playbackState.isPlaying) return;
  stopMetronomeScheduler();
"""
HTML_STATE_NEW = """// 0.784: метроном должен жить на тех же часах, что и pad. Ключ НЕ содержит
// якорь квадрата: тот пересчитывается на каждом событии и дрожит на
// последних знаках, а сетку надо перевешивать только при реальной смене
// темпа, размера, доли или при новом запуске/перемотке. Иначе планировщик
// перезапускался бы перед каждой ячейкой и акценты плясали.
let metronomeGridKey = null;
function metronomeKeyFor(ts, bpm) {
  return [ts, bpm, metronomeSubdivision, playbackStartTime].join('|');
}
function stopMetronomeScheduler() {
  if (metronomeFrameId) {
    cancelAnimationFrame(metronomeFrameId);
    metronomeFrameId = null;
  }
  // Любая остановка (Стоп, пауза, выключение метронома, смена доли,
  // восстановление контекста) делает часы недействительными — следующий
  // запуск перевесит сетку заново.
  metronomeGridKey = null;
}
let metronomeSubdivision = 1;
function scheduleMetronomeEvents(ctx, st, ts, bpm, resumeAtNow) {
  if (!playbackState.isPlaying) return;
  stopMetronomeScheduler();
  metronomeGridKey = metronomeKeyFor(ts, bpm);
"""

# Раньше перевешивали только по смене РАЗМЕРА. Смена BPM секции проходила
# мимо: pad шёл по новому темпу, щелчки — по старому.
HTML_NEXT_OLD = """  if (tsChanged && !playbackState.metronomeMuted) {
    stopMetronomeScheduler();
    metronomeFrameId = null;
    scheduleMetronomeEvents(ctx, playbackState.squareAnchorTime, ts, bpm);
  }
"""
HTML_NEXT_NEW = """  // 0.784: метроном живёт на тех же часах, что и pad. Раньше сетку
  // перевешивали только при смене РАЗМЕРА — при смене BPM секции щелчки
  // продолжали идти по старому темпу и уезжали от аккордов (замер:
  // 214 мс уже на первом такте при 120 -> 140). Теперь ключ часов
  // включает темп, размер, долю и точку запуска; resumeAtNow не даёт
  // залпа, если якорь уже в прошлом.
  if (!playbackState.metronomeMuted) {
    const key = metronomeKeyFor(ts, bpm);
    if (key !== metronomeGridKey) {
      stopMetronomeScheduler();
      metronomeFrameId = null;
      scheduleMetronomeEvents(ctx, playbackState.squareAnchorTime, ts, bpm, true);
    }
  }
"""

HTML_TEMPO_OLD = """function reanchorMetronomeForTempo(bpm) {
  if (!playbackState.isPlaying || playbackState.metronomeMuted) return;
  const ctx = getAudioContext();
  const anchor = playbackState.squareAnchorTime;
  if (!ctx || !Number.isFinite(anchor)) return;
  const ts = playbackState.currentTimeSig || globalTimeSig;
  const section = sections[playbackState.currentSectionIndex];
  scheduleMetronomeEvents(ctx, anchor, ts, getEffectiveBpm(section) || bpm, true);
}
"""
HTML_TEMPO_NEW = """function reanchorMetronomeForTempo(bpm) {
  if (!playbackState.isPlaying || playbackState.metronomeMuted) return;
  // 0.784: новый темп вступает со СЛЕДУЮЩЕГО аккорда (см. applyBpmChange).
  // Раньше здесь клики перевешивались немедленно от якоря, посчитанного
  // под старый BPM: сетка уезжала от pad на весь остаток песни. Теперь
  // лишь помечаем часы устаревшими — scheduleNextEvent перевесит их от
  // свежего якоря и нового темпа, без залпа запоздалых щелчков.
  metronomeGridKey = null;
}
"""

# Включение метронома на ходу: без resumeAtNow все прошедшие клики
# планировались в прошлом и звучали разом.
HTML_TOGGLE_OLD = """      if (!playbackState.metronomeMuted) {
        const curSec = sections[playbackState.currentSectionIndex];
        const bpm = getEffectiveBpm(curSec);
        const ts = playbackState.currentTimeSig || curSec?.timeSig || globalTimeSig;
        scheduleMetronomeEvents(ctx, playbackState.squareAnchorTime, ts, bpm);
      } else stopMetronomeScheduler();
"""
HTML_TOGGLE_NEW = """      if (!playbackState.metronomeMuted) {
        const curSec = sections[playbackState.currentSectionIndex];
        const bpm = getEffectiveBpm(curSec);
        const ts = playbackState.currentTimeSig || curSec?.timeSig || globalTimeSig;
        // 0.784: включаемся с текущей позиции, а не с начала квадрата.
        scheduleMetronomeEvents(ctx, playbackState.squareAnchorTime, ts, bpm, true);
      } else stopMetronomeScheduler();
"""

HTML_SUBDIV_OLD = """      stopMetronomeScheduler();
      const curSec = sections[playbackState.currentSectionIndex];
      const bpm = getEffectiveBpm(curSec);
      const ts = playbackState.currentTimeSig || curSec?.timeSig || globalTimeSig;
      scheduleMetronomeEvents(ctx, playbackState.squareAnchorTime, ts, bpm);
"""
HTML_SUBDIV_NEW = """      stopMetronomeScheduler();
      const curSec = sections[playbackState.currentSectionIndex];
      const bpm = getEffectiveBpm(curSec);
      const ts = playbackState.currentTimeSig || curSec?.timeSig || globalTimeSig;
      // 0.784: смена доли на ходу — тоже без залпа запоздалых щелчков.
      scheduleMetronomeEvents(ctx, playbackState.squareAnchorTime, ts, bpm, true);
"""

HTML_VERSION_OLD = """· ver 0.783"""
HTML_VERSION_NEW = """· ver 0.784"""

# Комментарии 0.782/0.783 называли заход «0,35 с» — после 0.784 это предел,
# а не рабочая длина. Код от этого не меняется, но врать документация не должна.
HTML_COMMENT_OLD = """  // 0.783: pad'у нужен РЕАЛЬНЫЙ следующий аккорд ЗА 0,35 с до границы,
"""
HTML_COMMENT_NEW = """  // 0.783: pad'у нужен РЕАЛЬНЫЙ следующий аккорд ЗА время захода до
  // границы (0.784: это 1/3 доли, а не фиксированные 0,35 с),
"""

# ---------------------------------------------------------------------------
# 2. keyboard-accompaniment.js — заход от доли, а не фиксированные 0,35 с
# ---------------------------------------------------------------------------
ACCOMP_CONST_OLD = """    var PAD_GLIDE_LEAD = 0.35;   // с, опережение слайда
"""
ACCOMP_CONST_NEW = """    // 0.782: 0,35 с — замер опережения по видео. 0.784: это ПРЕДЕЛ,
    // а рабочая длина считается от доли метронома (padGlideLeadFor).
    // На 120 BPM 0,35 с занимали ~18 % ячейки (в видео было ~9 %), и pad
    // начинал менять аккорд задолго до щелчка. Теперь заход ровно 1/3 доли.
    var PAD_GLIDE_LEAD = 0.35;          // с, верхний предел (видео)
    var PAD_GLIDE_BEAT_FRACTION = 1 / 3;
    function padPulseSeconds(o) {
      var raw = String((o && o.ts) || (current && current.ts) || '4/4').split('/');
      var num = parseInt(raw[0], 10) || 4, den = parseInt(raw[1], 10) || 4;
      var bpm = Number(o && o.bpm) > 0 ? Number(o.bpm) : 120;
      var qd = 60 / bpm;
      // В составном размере метроном тоже считает пульс пунктирной четвертью.
      return (den === 8 && num >= 6 && num % 3 === 0) ? qd * 1.5 : qd;
    }
    function padGlideLeadFor(o) {
      var dur = Number(o && o.dur) || 0;
      return Math.max(0.05, Math.min(
        PAD_GLIDE_BEAT_FRACTION * padPulseSeconds(o),
        PAD_GLIDE_LEAD,
        dur * 0.2));
    }
"""

ACCOMP_LEAD_OLD = """      var lead = Math.max(0.05, Math.min(PAD_GLIDE_LEAD, (Number(o.dur) || 0) * 0.2));
"""
ACCOMP_LEAD_NEW = """      // 0.784: заход от доли метронома, а не фиксированные 0,35 с.
      var lead = padGlideLeadFor(o);
"""

ACCOMP_API_OLD = """      padVoiceMap: padVoiceMap, padGlideLead: function () { return PAD_GLIDE_LEAD; },
"""
ACCOMP_API_NEW = """      padVoiceMap: padVoiceMap,
      // Без аргумента — исторический предел 0,35 с (старые тесты и превью).
      padGlideLead: function (o) { return o ? padGlideLeadFor(o) : PAD_GLIDE_LEAD; },
      padGlideLeadFor: padGlideLeadFor,
"""

ACCOMP_COMMENT_OLD = """    // Войсинг РЕАЛЬНО следующего события. Слайд за 0,35 с нельзя поставить
"""
ACCOMP_COMMENT_NEW = """    // Войсинг РЕАЛЬНО следующего события. Слайд (0.784: 1/3 доли) нельзя поставить
"""

AUDIO_COMMENT_OLD = """    // по высоте smoothstep-кривой за 0,35 с ДО границы и приходит в неё
"""
AUDIO_COMMENT_NEW = """    // по высоте smoothstep-кривой за 1/3 доли (0.784) ДО границы и приходит в неё
"""

# ---------------------------------------------------------------------------
# 3. R7: версия приложения и кэш выкладываются парой
# ---------------------------------------------------------------------------
SW_OLD = """const CACHE_NAME = 'struchord-v783';"""
SW_NEW = """const CACHE_NAME = 'struchord-v784';"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true', help='только проверить якоря, ничего не менять')
    args = ap.parse_args()

    jobs = [
        ('STRUCHORD.html', [
            (HTML_STATE_OLD, HTML_STATE_NEW, 'ключ часов и reset в stopMetronomeScheduler'),
            (HTML_NEXT_OLD, HTML_NEXT_NEW, 'перевес сетки в scheduleNextEvent'),
            (HTML_TEMPO_OLD, HTML_TEMPO_NEW, 'смена темпа на ходу'),
            (HTML_TOGGLE_OLD, HTML_TOGGLE_NEW, 'включение метронома на ходу'),
            (HTML_SUBDIV_OLD, HTML_SUBDIV_NEW, 'смена доли на ходу'),
            (HTML_VERSION_OLD, HTML_VERSION_NEW, 'версия в шапке'),
            (HTML_COMMENT_OLD, HTML_COMMENT_NEW, 'комментарий 0.783 про заход'),
        ]),
        ('keyboard-accompaniment.js', [
            (ACCOMP_CONST_OLD, ACCOMP_CONST_NEW, 'доля метронома и предел'),
            (ACCOMP_LEAD_OLD, ACCOMP_LEAD_NEW, 'padFigure: lead'),
            (ACCOMP_API_OLD, ACCOMP_API_NEW, 'экспорт padGlideLeadFor'),
            (ACCOMP_COMMENT_OLD, ACCOMP_COMMENT_NEW, 'комментарий про заход'),
        ]),
        ('keyboard-audio.js', [(AUDIO_COMMENT_OLD, AUDIO_COMMENT_NEW, 'комментарий про кривую')]),
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
    print('ПАТЧ ПРИМЕНЁН: 0.783 -> 0.784 (R7: HTML и sw.js выложены парой).')
    return 0


if __name__ == '__main__':
    sys.exit(main())

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""B-111 / 0.783 — pad на повторах и переходах между секциями (R8 подтверждён 2026-11-03).

Патч по якорям, без `git apply`: рабочие файлы ушли вперёд от любого снимка.
Применяется один раз к 0.782:

    python3 dev/tools/patch-b111-pad-structure-0783.py --check
    python3 dev/tools/patch-b111-pad-structure-0783.py

Причина: 0.782 угадывал «следующий аккорд» по плоскому списку sec.squares и
не знал о sq.repeat/sec.repeat, вольтах, D.C./D.S./Coda, зацикливании и
переходе в следующую секцию. Плеер уже имеет точный ответ — findNextEvent(),
который считается в scheduleNextEvent для подсказки следующего аккорда.
Поднимаем этот расчёт выше и передаём его в pad; сам findNextEvent,
метроном и 0.775 не переписываются.

Решения владельца (R8): источник = «спросить у плеера»; между секциями
перетекать, мягко гасить только пустую ячейку и конец песни; на повторах
слайд к реально следующему аккорду; хотфикс 0.783 полным комплектом.
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
# 1. STRUCHORD.html — реальное следующее событие от плеера
# ---------------------------------------------------------------------------
# previewEvent уже считается в scheduleNextEvent на КОПИЯХ счётчиков повторов
# и с текущим _structureWalk. Между старой и новой позицией расчёта нет ни
# одного изменения этих счётчиков, поэтому перестановка значения не меняет.
HTML_CALL_OLD = """  // B-39 STAGE3: свои голоса клавишных дорожек планируются здесь же,
  // до гитарного боя — время начала то же, рассинхрона нет.
  if (window.StruChordAudio) window.StruChordAudio.scheduleEvent(
    ctx, next.section, next.square, next.event, next.eventIndex, evStart, dur, bpm, ts);
"""
HTML_CALL_NEW = """  // 0.783: pad'у нужен РЕАЛЬНЫЙ следующий аккорд ЗА 0,35 с до границы,
  // а плеер будит следующую ячейку лишь за 120 мс. Плеер уже считает его
  // для подсказки следующего аккорда — поднимаем тот же расчёт выше и
  // отдаём в клавишные. findNextEvent, метроном и 0.775 не меняются.
  // Считаем на КОПИЯХ счётчиков: заглядывание вперёд не сбивает игру.
  const previewEvent = findNextEvent(
    next.sectionIndex,
    next.squareIndex,
    next.eventIndex + 1,
    { ...playbackState._sectionRepeatCount },
    { ...playbackState._squareRepeatCount },
    playbackState._structureWalk
  );
  // null = конец песни (подложка гаснет мягко). Иначе — точные секция,
  // квадрат, номер ячейки и событие, включая повторы, скачки и вольты.
  const padNext = previewEvent ? {
    sec: previewEvent.section, sq: previewEvent.square,
    ei: previewEvent.eventIndex, ev: previewEvent.event
  } : null;
  // B-39 STAGE3: свои голоса клавишных дорожек планируются здесь же,
  // до гитарного боя — время начала то же, рассинхрона нет.
  if (window.StruChordAudio) window.StruChordAudio.scheduleEvent(
    ctx, next.section, next.square, next.event, next.eventIndex, evStart, dur, bpm, ts, padNext);
"""

HTML_PREVIEW_OLD = """  // Превью следующего аккорда — это "заглядывание вперёд", а не
  // реальный переход, поэтому считаем его на КОПИИ счётчиков повторов,
  // чтобы не сбивать реальное состояние воспроизведения.
  const previewEvent = findNextEvent(
    next.sectionIndex,
    next.squareIndex,
    next.eventIndex + 1,
    { ...playbackState._sectionRepeatCount },
    { ...playbackState._squareRepeatCount },
    playbackState._structureWalk
  );

  // Закреплённый гриф ведём за игрой: слева аккорд, который звучит
  // сейчас, справа — следующий. Стоит ЗДЕСЬ, а не выше у показа
  // тултипа: «следующий» считает findNextEvent, и до этой строки он
  // ещё не известен.
"""
HTML_PREVIEW_NEW = """  // 0.783: previewEvent и padNext посчитаны выше, до планирования
  // клавишных. Тем же значением пользуются закреплённый гриф и подсказка
  // следующего аккорда; второй раз findNextEvent не вызываем, чтобы
  // счётчики повторов не удваивались.
  // Закреплённый гриф ведём за игрой: слева аккорд, который звучит
  // сейчас, справа — следующий.
"""

# ---------------------------------------------------------------------------
# 2. keyboard-audio.js — принять padNext и передать его в plan()
# ---------------------------------------------------------------------------
AUDIO_SIGNATURE_OLD = """    function scheduleEvent(ctx, sec, sq, ev, ei, evStart, dur, bpm, ts) {"""
AUDIO_SIGNATURE_NEW = """    function scheduleEvent(ctx, sec, sq, ev, ei, evStart, dur, bpm, ts, padNext) {"""

AUDIO_PLAN_OLD = """              trackId: track.id, span: (ev && ev.span) || 1
            });"""
AUDIO_PLAN_NEW = """              trackId: track.id, span: (ev && ev.span) || 1,
              // 0.783: реальное следующее событие от плеера. undefined —
              // превью/старые вызывающие, null — конец песни.
              padNext: padNext
            });"""

# Лишние голоса раньше гасли в КОНЦЕ новой ячейки: старый аккорд гудел
# поверх нового всю ячейку. Гасим на границе коротким кроссфейдом; плавный
# слайд за 0,35 с уже запланирован картой предыдущей ячейки.
AUDIO_LEFTOVER_OLD = """      line.forEach(function (v) { if (used.indexOf(v) < 0 && nextLine.indexOf(v) < 0) padRelease(v, end - lead, end); });"""
AUDIO_LEFTOVER_NEW = """      // 0.783: несовпавшие голоса гаснут НА границе (start), а не в конце
      // новой ячейки. Здесь страховка от рассогласования плана (повтор,
      // скачок, правка войсинга на ходу): короткий кроссфейд с наплывом
      // новых нот. Штатный слайд на 0,35 с ставится картой заранее.
      var crossfade = Math.min(lead, 0.12);
      line.forEach(function (v) {
        if (used.indexOf(v) < 0 && nextLine.indexOf(v) < 0) padRelease(v, start, start + crossfade);
      });"""

# ---------------------------------------------------------------------------
# 3. keyboard-accompaniment.js — padNext вместо угадывания по sec.squares
# ---------------------------------------------------------------------------
ACCOMP_NEXT_OLD = """    // Войсинг следующей ячейки ВНУТРИ секции. Слайд за 0,35 с нельзя
    // поставить из следующей ячейки: плеер будит её лишь за 120 мс
    // (scheduleNextEvent, tWait = ... - 120). Поэтому читаем готовый план
    // секции 0.780 (linkedSelection) заранее; при выключенном голосоведении
    // считаем voiceLead от текущих нот. Смена секции — без раннего слайда.
    function padNextVoicing(o, chord) {
      var T = tracks(), K = keys();
      if (!T || !o.sec || !o.sq || typeof o.ei !== 'number') return null;
      var list = [];
      (o.sec.squares || []).forEach(function (sq) {
        (sq.events || []).forEach(function (ev, i) { list.push({ sq: sq, ev: ev, ei: i }); });
      });
      var here = -1;
      for (var k = 0; k < list.length; k++) {
        if (list[k].sq === o.sq && list[k].ei === o.ei) { here = k; break; }
      }
      if (here < 0 || here + 1 >= list.length) return null;   // граница секции
      var n = list[here + 1], cell = null;
      try { cell = T.cellKey(o.sec, n.sq, n.ei); } catch (e) { return null; }
      if (!cell) return null;
      var nextChord = null;
      try { nextChord = T.trackChord(o.trackId, cell, n.ev); } catch (e) {}
      if (!nextChord) return { notes: [], silence: true };    // пустая ячейка/пауза
      var notes = null, range = o.range || (T.keyRange ? T.keyRange(o.trackId) : null);
      if (K && typeof K.linkedSelection === 'function') {
        try { var sel = K.linkedSelection(o.trackId, cell); if (sel && sel.notes) notes = sel.notes.slice(); } catch (e) {}
      }
      if (!notes && K && typeof K.voiceLead === 'function' && range) {
        try { notes = K.voiceLead(nextChord, o.key || o.sec.key || 'C', range, chord, {}); } catch (e) {}
      }
      if (!notes || !notes.length) return { notes: [], silence: true };
      return { notes: notes.map(Number).filter(isMidi).sort(asc), silence: false };
    }
"""

ACCOMP_NEXT_NEW = """    // Войсинг РЕАЛЬНО следующего события. Слайд за 0,35 с нельзя поставить
    // из следующей ячейки: плеер будит её лишь за 120 мс (scheduleNextEvent,
    // tWait = ... - 120). 0.783: плеер передаёт точный ответ через
    // o.padNext (findNextEvent на копиях счётчиков), поэтому повторы
    // квадратов/секций, вольты, D.C./D.S./Coda, зацикливание и переход в
    // следующую секцию больше не угадываются по геометрии нотного листа.
    // null — конец песни (мягкое гашение). undefined — превью/экспорт/
    // тесты без плеера: старый линейный путь внутри секции как запасной.
    function padNextVoicing(o, chord) {
      var T = tracks(), K = keys();
      if (!T || !o.sec || !o.sq || typeof o.ei !== 'number') return null;
      if (o.padNext !== undefined) {
        var n = o.padNext;
        if (!n || !n.sec || !n.sq) return { notes: [], silence: true, end: true };
        var cell = null;
        try { cell = T.cellKey(n.sec, n.sq, n.ei); } catch (e) {}
        if (!cell) return { notes: [], silence: true, end: true };
        var nextChord = null;
        try { nextChord = T.trackChord(o.trackId, cell, n.ev); } catch (e) {}
        if (!nextChord) return { notes: [], silence: true, end: false };  // пустая ячейка
        var notes = null, range = o.range || (T.keyRange ? T.keyRange(o.trackId) : null);
        if (K && typeof K.linkedSelection === 'function') {
          try { var sel = K.linkedSelection(o.trackId, cell); if (sel && sel.notes) notes = sel.notes.slice(); } catch (e) {}
        }
        if (!notes && K && typeof K.voiceLead === 'function' && range) {
          try { notes = K.voiceLead(nextChord, o.key || o.sec.key || 'C', range, chord, {}); } catch (e) {}
        }
        if (!notes || !notes.length) return { notes: [], silence: true, end: false };
        return { notes: notes.map(Number).filter(isMidi).sort(asc), silence: false,
                 end: false, section: n.sec !== o.sec };
      }
      var list = [];
      (o.sec.squares || []).forEach(function (sq) {
        (sq.events || []).forEach(function (ev, i) { list.push({ sq: sq, ev: ev, ei: i }); });
      });
      var here = -1;
      for (var k = 0; k < list.length; k++) {
        if (list[k].sq === o.sq && list[k].ei === o.ei) { here = k; break; }
      }
      if (here < 0 || here + 1 >= list.length) return null;   // граница секции (fallback)
      var nF = list[here + 1], cellF = null;
      try { cellF = T.cellKey(o.sec, nF.sq, nF.ei); } catch (e) { return null; }
      if (!cellF) return null;
      var nextChordF = null;
      try { nextChordF = T.trackChord(o.trackId, cellF, nF.ev); } catch (e) {}
      if (!nextChordF) return { notes: [], silence: true };    // пустая ячейка/пауза
      var notesF = null, rangeF = o.range || (T.keyRange ? T.keyRange(o.trackId) : null);
      if (K && typeof K.linkedSelection === 'function') {
        try { var selF = K.linkedSelection(o.trackId, cellF); if (selF && selF.notes) notesF = selF.notes.slice(); } catch (e) {}
      }
      if (!notesF && K && typeof K.voiceLead === 'function' && rangeF) {
        try { notesF = K.voiceLead(nextChordF, o.key || o.sec.key || 'C', rangeF, chord, {}); } catch (e) {}
      }
      if (!notesF || !notesF.length) return { notes: [], silence: true };
      return { notes: notesF.map(Number).filter(isMidi).sort(asc), silence: false };
    }
"""

# ---------------------------------------------------------------------------
# 4. R7: версия приложения и кэш выкладываются парой
# ---------------------------------------------------------------------------
HTML_VERSION_OLD = """· ver 0.782"""
HTML_VERSION_NEW = """· ver 0.783"""
SW_OLD = """const CACHE_NAME = 'struchord-v782';"""
SW_NEW = """const CACHE_NAME = 'struchord-v783';"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true', help='только проверить якоря, ничего не менять')
    args = ap.parse_args()

    jobs = [
        ('STRUCHORD.html', [(HTML_CALL_OLD, HTML_CALL_NEW, 'padNext в scheduleEvent'),
                            (HTML_PREVIEW_OLD, HTML_PREVIEW_NEW, 'старый блок previewEvent'),
                            (HTML_VERSION_OLD, HTML_VERSION_NEW, 'версия в шапке')]),
        ('keyboard-audio.js', [(AUDIO_SIGNATURE_OLD, AUDIO_SIGNATURE_NEW, 'сигнатура'),
                               (AUDIO_PLAN_OLD, AUDIO_PLAN_NEW, 'plan(): padNext'),
                               (AUDIO_LEFTOVER_OLD, AUDIO_LEFTOVER_NEW, 'гашение на границе')]),
        ('keyboard-accompaniment.js', [(ACCOMP_NEXT_OLD, ACCOMP_NEXT_NEW, 'padNextVoicing')]),
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
    print('ПАТЧ ПРИМЕНЁН: 0.782 -> 0.783 (R7: HTML и sw.js выложены парой).')
    return 0


if __name__ == '__main__':
    sys.exit(main())

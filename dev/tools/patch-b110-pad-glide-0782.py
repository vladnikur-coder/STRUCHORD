#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""B-110 / 0.782 — pad перетекает между аккордами (R8 подтверждён 2026-11-03).

Патч по якорям, без `git apply`: рабочие файлы ушли вперёд от любого снимка.
Применяется один раз к 0.781:

    python3 dev/tools/patch-b110-pad-glide-0782.py --check
    python3 dev/tools/patch-b110-pad-glide-0782.py

Эталон: uploads/Follow for daily chord progressions!.mp4, кадр 3,7 с —
изгиб голоса начинается за 0,30–0,38 с ДО границы и приходит ровно в неё,
общие тоны идут горизонтально, разрывов нет.
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
# 1. keyboard-accompaniment.js — план по секции, чистый voice-map, без паузы
# ---------------------------------------------------------------------------
ACCOMP_OLD = """    function padFigure(steps, o, unit, beats) {
      var chord = (Array.isArray(o.notes) ? o.notes : []).map(Number).filter(isMidi).sort(asc);
      if (!chord.length) {
        var seen = {};
        steps.forEach(function (s) {
          (Array.isArray(s.notes) ? s.notes : []).forEach(function (n) { if (isMidi(n)) seen[n] = 1; });
        });
        chord = Object.keys(seen).map(Number).sort(asc);
      }
      if (!chord.length || !(unit > 0) || !(beats > 0)) return null;
      var dur = Number(o.dur);
      var bar = Math.min(beats, Math.max(1, numerator(o.ts || (current && current.ts) || '4/4')));
      if (!(bar > 0)) bar = beats;
      var at = [];
      for (var b = 0; b < beats - 1e-6; b += bar) at.push(b);
      // Плотность берём у самого рисунка, а не только у включённого
      // автоаккомпанемента: иначе предпросмотр фанка на pad звучал как поп.
      var ownGenre = preset(o.pattern && o.pattern.type);
      var dense = ownGenre && DENSE_GENRE_FACTOR[ownGenre.genre] !== undefined
        ? DENSE_GENRE_FACTOR[ownGenre.genre] < 1
        : genreFactor() < 1;
      if (dense) {
        var withHalf = at.slice();
        at.forEach(function (b) { if (b + bar / 2 < beats - 1e-6) withHalf.push(b + bar / 2); });
        at = withHalf.sort(asc);
      }
      if (!at.length) at = [0];
      var gap = Math.max(0.01, unit * (TIMBRE_ARTICULATION.pad.gapBeats || 0.1));
      var template = steps[0] || {};
      var out = [];
      at.forEach(function (beat, i) {
        var start = beat * unit;
        if (start >= dur - 0.005) return;
        var stop = (i + 1 < at.length ? at[i + 1] * unit : dur) - gap;
        var len = Math.max(unit * 0.5, stop - start);
        if (start + len > dur) len = Math.max(0.05, dur - start);
        out.push({
          index: out.length, stepIndex: 0, token: 'H', at: start, dur: len,
          notes: chord.slice(), subdivision: template.subdivision, swing: false,
          type: template.type, source: template.source, timbre: 'pad'
        });
      });
      return out.length ? out : null;
    }
"""

ACCOMP_NEW = """    // 0.782 · B-110: pad перетекает между аккордами, а не гаснет на стыке.
    // Замер по эталону uploads/Follow for daily chord progressions!.mp4
    // (кадр 3,7 с): границы аккордов идут 94 px/с, шаг 354 px ≈ 3,8 с;
    // изгиб голоса начинается за 28–36 px = 0,30–0,38 с ДО границы и
    // приходит ровно в неё, общие тоны идут горизонтально, разрывов нет.
    var PAD_GLIDE_LEAD = 0.35;   // с, опережение слайда
    var PAD_GLIDE_MAX_ST = 7;    // полутонов, предел portamento

    // Чистая раскладка голосов: что держится, что ползёт, что уходит,
    // что появляется. Отдаётся в API для проверок без браузера.
    function padVoiceMap(from, to, maxSt) {
      function clean(list) {
        return (Array.isArray(list) ? list : []).map(Number).filter(isMidi)
          .slice().sort(asc).filter(function (n, i, a) { return i === 0 || n !== a[i - 1]; });
      }
      var A = clean(from), B = clean(to), used = B.map(function () { return false; });
      var limit = Number.isFinite(maxSt) ? maxSt : PAD_GLIDE_MAX_ST;
      var out = [], i, j;
      // Общие тоны не перезапускаются вообще — главное отличие от 0.779.
      for (i = 0; i < A.length; i++) {
        j = B.indexOf(A[i]);
        if (j >= 0 && !used[j]) { used[j] = true; out.push({ from: A[i], to: B[j], kind: 'hold' }); }
      }
      // Оставшиеся голоса идут к ближайшей свободной высоте следующего аккорда.
      for (i = 0; i < A.length; i++) {
        if (out.some(function (p) { return p.from === A[i]; })) continue;
        var best = -1, dist = Infinity;
        for (j = 0; j < B.length; j++) {
          if (used[j]) continue;
          var d = Math.abs(B[j] - A[i]);
          if (d < dist) { dist = d; best = j; }
        }
        if (best >= 0 && dist <= limit) { used[best] = true; out.push({ from: A[i], to: B[best], kind: 'glide' }); }
        else out.push({ from: A[i], to: null, kind: 'release' });
      }
      for (j = 0; j < B.length; j++) if (!used[j]) out.push({ from: null, to: B[j], kind: 'new' });
      return out;
    }

    // Войсинг следующей ячейки ВНУТРИ секции. Слайд за 0,35 с нельзя
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

    function padFigure(steps, o, unit, beats) {
      var chord = (Array.isArray(o.notes) ? o.notes : []).map(Number).filter(isMidi).sort(asc);
      if (!chord.length) {
        var seen = {};
        steps.forEach(function (s) {
          (Array.isArray(s.notes) ? s.notes : []).forEach(function (n) { if (isMidi(n)) seen[n] = 1; });
        });
        chord = Object.keys(seen).map(Number).sort(asc);
      }
      if (!chord.length || !(unit > 0) || !(beats > 0)) return null;
      var dur = Number(o.dur);
      var bar = Math.min(beats, Math.max(1, numerator(o.ts || (current && current.ts) || '4/4')));
      if (!(bar > 0)) bar = beats;
      var at = [];
      for (var b = 0; b < beats - 1e-6; b += bar) at.push(b);
      // Плотность берём у самого рисунка, а не только у включённого
      // автоаккомпанемента: иначе предпросмотр фанка на pad звучал как поп.
      var ownGenre = preset(o.pattern && o.pattern.type);
      var dense = ownGenre && DENSE_GENRE_FACTOR[ownGenre.genre] !== undefined
        ? DENSE_GENRE_FACTOR[ownGenre.genre] < 1
        : genreFactor() < 1;
      if (dense) {
        var withHalf = at.slice();
        at.forEach(function (b) { if (b + bar / 2 < beats - 1e-6) withHalf.push(b + bar / 2); });
        at = withHalf.sort(asc);
      }
      if (!at.length) at = [0];
      // 0.782: паузы перед границей больше нет — нота держится до неё самой,
      // поэтому старый и новый аккорд перекрываются и звук не проваливается.
      var template = steps[0] || {};
      var next = padNextVoicing(o, chord);
      var lead = Math.max(0.05, Math.min(PAD_GLIDE_LEAD, (Number(o.dur) || 0) * 0.2));
      var plain = chord.map(function (n) { return { from: n, to: null, kind: 'hold' }; });
      var finalMap = next ? padVoiceMap(chord, next.notes, PAD_GLIDE_MAX_ST) : plain;
      var release = !!(next && next.silence);
      var out = [];
      at.forEach(function (beat, i) {
        var start = beat * unit;
        if (start >= dur - 0.005) return;
        var stop = (i + 1 < at.length ? at[i + 1] * unit : dur);
        var len = Math.max(unit * 0.5, stop - start);
        if (start + len > dur) len = Math.max(0.05, dur - start);
        var last = i === at.length - 1;
        out.push({
          index: out.length, stepIndex: 0, token: 'H', at: start, dur: len,
          notes: chord.slice(), subdivision: template.subdivision, swing: false,
          type: template.type, source: template.source, timbre: 'pad',
          // Промежуточная атака в плотном жанре остаётся в плане, но голос
          // не перезапускается: реестр в audio-слое просто продлевает его.
          pad: { lead: lead, final: last, map: last ? finalMap : plain, release: last && release }
        });
      });
      return out.length ? out : null;
    }
"""

ACCOMP_API_OLD = """      boot: boot, plan: plan, resolve: resolve, buildSteps: buildSteps,
"""
ACCOMP_API_NEW = """      boot: boot, plan: plan, resolve: resolve, buildSteps: buildSteps,
      padVoiceMap: padVoiceMap, padGlideLead: function () { return PAD_GLIDE_LEAD; },
"""

# Без явно сохранённого рисунка plan() раньше возвращал одиночный шаг ДО
# articulate(), поэтому pad-линия не включалась вовсе. Теперь тот же путь
# проходит через articulate(): для остальных тембров он ничего не меняет
# (один шаг уже длится всю ячейку), а pad получает свою фигуру и слайд.
ACCOMP_DEFAULT_OLD = """      if (cfg.source === 'default') {
        var single=[{index:0,stepIndex:0,token:'H',at:0,dur:dur,notes:tokenNotes('H',C,function(){return 0;}),subdivision:sub,swing:false,type:cfg.type,source:cfg.source}];
        if (!o.noHighlight && o.ctx && typeof o.evStart === 'number') scheduleHighlights(o,single);
        if (stepObserver) { try { stepObserver({cell:o.cell,trackId:o.trackId,cfg:cfg,steps:single}); } catch(e) {} }
        return single;
      }
"""
ACCOMP_DEFAULT_NEW = """      if (cfg.source === 'default') {
        var single=[{index:0,stepIndex:0,token:'H',at:0,dur:dur,notes:tokenNotes('H',C,function(){return 0;}),subdivision:sub,swing:false,type:cfg.type,source:cfg.source}];
        // 0.782: pad держит гармонию и без сохранённого рисунка.
        var shaped = articulate(single, o);
        if (!o.noHighlight && o.ctx && typeof o.evStart === 'number') scheduleHighlights(o,shaped);
        if (stepObserver) { try { stepObserver({cell:o.cell,trackId:o.trackId,cfg:cfg,steps:shaped}); } catch(e) {} }
        return shaped;
      }
"""

# ---------------------------------------------------------------------------
# 2. keyboard-audio.js — реестр живых голосов и кривая высоты
# ---------------------------------------------------------------------------
AUDIO_STATE_OLD = """    var prevByTrack = new Map();    // голосоведение: предыдущие MIDI-ноты
"""
AUDIO_STATE_NEW = """    var prevByTrack = new Map();    // голосоведение: предыдущие MIDI-ноты
    var padLines = new Map();       // 0.782: живая непрерывная линия pad, trackId -> голоса
"""

AUDIO_FUNCS_OLD = """    function playNote(ctx, channel, midi, start, dur, level, expression, highlightOwner) {
"""
AUDIO_FUNCS_NEW = """    // 0.782 · B-110: непрерывная линия pad. Один голос живёт от ячейки к
    // ячейке: общий тон продлевается без новой атаки, изменившийся ведётся
    // по высоте smoothstep-кривой за 0,35 с ДО границы и приходит в неё
    // ровно. Лишние голоса уходят, новые наплывают — паузы в звуке нет.
    // Кривая считается детерминированно, экспорт и замеры воспроизводимы.
    function padRate(midi, baseMidi) { return Math.pow(2, (midi - baseMidi) / 12); }
    function padCurve(from, to, n) {
      var arr = new Float32Array(Math.max(2, n));
      for (var i = 0; i < arr.length; i++) {
        var t = i / (arr.length - 1), s = t * t * (3 - 2 * t);   // smoothstep
        arr[i] = from * Math.pow(to / from, s);                   // линейно по полутонам
      }
      return arr;
    }
    function padVoice(ctx, target, midi, start, end, level, fadeIn) {
      var bank = HOST.StruChordSampleBank;
      var rec = bank && bank.nearest ? bank.nearest('pad', midi, velocityOf(null)) : null;
      if (!rec || !rec.buffer || !hasRoom()) return null;
      try {
        var src = ctx.createBufferSource(), g = ctx.createGain();
        src.buffer = rec.buffer;
        var rate = padRate(midi, rec.midi);
        src.playbackRate.value = rate;
        if (rec.loopEnd && rec.loopStart >= 0 && rec.loopEnd > rec.loopStart && rec.loopEnd <= rec.buffer.duration) {
          src.loop = true; src.loopStart = rec.loopStart; src.loopEnd = rec.loopEnd;
        }
        // Калибровка та же, что в playSample: level * 1.8 * cal(pad=4).
        var tail = .35;
        var amp = Math.max(.0002, level * 1.8 * 4 * strengthOf(null));
        var attack = Math.max(.004, Math.min(fadeIn || .14, (end - start) * .5));
        g.gain.setValueAtTime(.0001, start);
        g.gain.exponentialRampToValueAtTime(amp, start + attack);
        g.gain.setValueAtTime(amp, end);
        g.gain.exponentialRampToValueAtTime(.0001, end + tail);
        src.connect(g); g.connect(target);
        src.start(start); src.stop(end + tail + .01);
        register(src); stats.notes++;
        return { src: src, gain: g, amp: amp, midi: midi, baseMidi: rec.midi, rate: rate,
                 start: start, end: end, tail: tail, dead: false };
      } catch (e) { return null; }
    }
    // Продлить голос на новую ячейку: старый запланированный хвост отменяется,
    // источник не перезапускается. stop() можно звать повторно — последний
    // вызов по спецификации Web Audio перекрывает предыдущий.
    function padExtend(v, end) {
      try {
        v.gain.gain.cancelScheduledValues(v.end - .001);
        v.gain.gain.setValueAtTime(v.amp, end);
        v.gain.gain.exponentialRampToValueAtTime(.0001, end + v.tail);
        v.src.stop(end + v.tail + .01);
        v.end = end;
        return true;
      } catch (e) { return false; }
    }
    // Слайд по высоте: экспоненциальная кривая playbackRate = линейный ход
    // по полутонам, S-форма по времени (как изгиб в пиано-ролле эталона).
    function padGlide(v, toMidi, fromTime, endTime) {
      try {
        var target = padRate(toMidi, v.baseMidi);
        var curve = padCurve(v.rate, target, 33);
        v.src.playbackRate.cancelScheduledValues(fromTime - .001);
        v.src.playbackRate.setValueAtTime(v.rate, fromTime - .001);
        v.src.playbackRate.setValueCurveAtTime(curve, fromTime, endTime - fromTime);
        v.midi = toMidi; v.rate = target;
        return true;
      } catch (e) { return false; }
    }
    function padRelease(v, fromTime, endTime) {
      try {
        v.gain.gain.cancelScheduledValues(v.end - .001);
        v.gain.gain.setValueAtTime(v.amp, fromTime);
        v.gain.gain.exponentialRampToValueAtTime(.0001, endTime);
        v.src.stop(endTime + .01);
        v.dead = true;
        return true;
      } catch (e) { return false; }
    }
    // Один шаг pad-фигуры: сопоставляем план с живыми голосами дорожки.
    // Общий тон -> продление, изменённый -> слайд, лишний -> затухание,
    // новый -> наплыв. Паузы между ячейками нет ни при каком исходе.
    function padStep(ctx, channel, trackId, st, start, dur, level) {
      var target = voiceTarget(channel);
      if (!target) return;
      var info = st && st.pad;
      var notes = (Array.isArray(st.notes) ? st.notes : []).map(Number)
        .filter(function (n) { return Number.isFinite(n); });
      if (!info || !notes.length) {                 // запасной путь как в 0.779
        notes.forEach(function (m) { playNote(ctx, channel, m, start, dur, level); });
        return;
      }
      var end = start + dur;
      var key = String(trackId);
      var line = (padLines.get(key) || []).filter(function (v) { return !v.dead && v.end + v.tail > start; });
      var lead = Math.max(.05, Math.min(Number(info.lead) || .35, dur * .45));
      var map = Array.isArray(info.map) && info.map.length ? info.map
        : notes.map(function (n) { return { from: n, to: null, kind: 'hold' }; });
      var nextLine = [], used = [];
      map.forEach(function (p) {
        if (p.from !== null && p.from !== undefined) {
          var v = null;
          for (var i = 0; i < line.length; i++) {
            if (used.indexOf(line[i]) >= 0) continue;
            if (line[i].midi === p.from) { v = line[i]; break; }
          }
          if (v) padExtend(v, end);
          else v = padVoice(ctx, target, p.from, start, end, level, .14);
          if (v) {
            used.push(v);
            if (p.kind === 'glide' && p.to !== null) padGlide(v, p.to, end - lead, end);
            else if (p.kind === 'release') padRelease(v, end - lead, end);
            nextLine.push(v);
          }
        } else if (p.kind === 'new' && p.to !== null) {
          var nv = padVoice(ctx, target, p.to, end - lead, end, level, lead);
          if (nv) nextLine.push(nv);
        }
      });
      line.forEach(function (v) { if (used.indexOf(v) < 0 && nextLine.indexOf(v) < 0) padRelease(v, end - lead, end); });
      padLines.set(key, nextLine);
      // 0.763: звучащие клавиши подсвечиваются и в непрерывной линии pad.
      nextLine.forEach(function (v) {
        if (!v.dead) scheduleKeyHighlight(ctx, channel, v.midi, start, end - start);
      });
    }

    function playNote(ctx, channel, midi, start, dur, level, expression, highlightOwner) {
"""

AUDIO_LOOP_OLD = """        if (steps && steps.length) {
          steps.forEach(function (st) {
            var at = Math.max(0, Number(st.at) || 0);
            var len = Math.max(0.02, Number(st.dur) || seconds);
            (Array.isArray(st.notes) ? st.notes : []).forEach(function (midi) {
              var dynamics=Number.isFinite(st.gain) ? st.gain : null;
              playNote(ctx, channel, midi, evStart + at, len, level * (dynamics===null ? 1 : dynamics), dynamics);
            });
          });
        } else {
"""
AUDIO_LOOP_NEW = """        if (steps && steps.length) {
          steps.forEach(function (st) {
            var at = Math.max(0, Number(st.at) || 0);
            var len = Math.max(0.02, Number(st.dur) || seconds);
            // 0.782: pad-линия ведёт живые голоса сама. Обычный путь создавал
            // бы новый источник на каждую ячейку и давал провал на стыке.
            if (st.timbre === 'pad' && channel.__timbre === 'pad' && st.pad) {
              padStep(ctx, channel, track.id, st, evStart + at, len, level);
            } else {
              (Array.isArray(st.notes) ? st.notes : []).forEach(function (midi) {
                var dynamics=Number.isFinite(st.gain) ? st.gain : null;
                playNote(ctx, channel, midi, evStart + at, len, level * (dynamics===null ? 1 : dynamics), dynamics);
              });
            }
          });
        } else {
"""

AUDIO_STOP_OLD = """      voices.clear();
      prevByTrack.clear();
"""
AUDIO_STOP_NEW = """      voices.clear();
      prevByTrack.clear();
      padLines.clear();   // 0.782: Стоп рвёт непрерывную линию pad
"""

AUDIO_ENSURE_OLD = """      clearKeyHighlights(); voices.clear(); channels.clear(); hammer = null; ctxRef = ctx;
"""
AUDIO_ENSURE_NEW = """      clearKeyHighlights(); voices.clear(); channels.clear(); padLines.clear(); hammer = null; ctxRef = ctx;
"""

# ---------------------------------------------------------------------------
# 3./4. R7: версия приложения и кэш выкладываются парой
# ---------------------------------------------------------------------------
HTML_OLD = """· ver 0.781"""
HTML_NEW = """· ver 0.782"""
SW_OLD = """const CACHE_NAME = 'struchord-v781';"""
SW_NEW = """const CACHE_NAME = 'struchord-v782';"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true', help='только проверить якоря, ничего не менять')
    args = ap.parse_args()

    jobs = [
        ('keyboard-accompaniment.js', [(ACCOMP_OLD, ACCOMP_NEW, 'padFigure'),
                                       (ACCOMP_DEFAULT_OLD, ACCOMP_DEFAULT_NEW, 'default-путь'),
                                       (ACCOMP_API_OLD, ACCOMP_API_NEW, 'api accom')]),
        ('keyboard-audio.js', [(AUDIO_STATE_OLD, AUDIO_STATE_NEW, 'state'),
                               (AUDIO_FUNCS_OLD, AUDIO_FUNCS_NEW, 'pad-* функции'),
                               (AUDIO_LOOP_OLD, AUDIO_LOOP_NEW, 'scheduleEvent'),
                               (AUDIO_STOP_OLD, AUDIO_STOP_NEW, 'stopAll'),
                               (AUDIO_ENSURE_OLD, AUDIO_ENSURE_NEW, 'ensureCtx')]),
        ('STRUCHORD.html', [(HTML_OLD, HTML_NEW, 'версия в шапке')]),
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
    print('ПАТЧ ПРИМЕНЁН: 0.781 -> 0.782 (R7: HTML и sw.js выложены парой).')
    return 0


if __name__ == '__main__':
    sys.exit(main())

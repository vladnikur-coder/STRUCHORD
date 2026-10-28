// >>> B-39 STAGE6 BEGIN (TRACK EXPORT) <<<
// ==========================================================================
// B-39 · ЭТАП 6 (STAGE 6) — ЭКСПОРТ ВСЕХ ДОРОЖЕК
// --------------------------------------------------------------------------
// Что здесь:
//  1. Одна синтетическая «партия» на каждую дорожку B-39. Ноты берутся из
//     КАНОНИЧЕСКОЙ формулы (STAGE 0), позиции (STAGE 4) и рисунка
//     аккомпанимента (STAGE 5) — то есть из того же самого, что звучит
//     в приложении. Призрачные ячейки, M/S и громкость уважаются.
//  2. GPX/GPIF: дорожка с instrument 'keys' и pitchRolls. Встроенный
//     GPIF-писатель видит не-таб-партию и пишет НАСТОЯЩИЙ НОТНЫЙ СТАН:
//     <Octave>/<Tone> с абсолютными высотами, GM-программа 0 (фортепиано).
//  3. GP5: бинарный писатель заточен под струны, поэтому для него та же
//     дорожка подаётся таб-нотами на ВИРТУАЛЬНОМ широком строе из семи
//     октав (C2…C8). Высота каждой ноты восстанавливается ровно
//     (строй + лад = MIDI), сдвиг октавы для баса не применяется.
//     GM-программа 0, вид нотации 'staff'.
//  4. MIDI: SMF format 1, свой трек на дорожку, program 0 для клавиш и
//     25 для гитары; скорость (velocity) из громкости дорожки.
//  5. .struchord уже пишется моделью STAGE 1: tracks, chords, voicings,
//     patterns, keyboardSize, activeTrackId. Здесь он только проверяется.
//
// R12: в этом блоке НЕТ гитарных аппликатур, струн, ладов и getChordNotes.
// Абсолютные высоты берутся из формулы; гитарный путь приложения не тронут.
//
// R7/R6: версия, sw.js и реестр релизов НЕ зашиты в этот блок — рабочая
// версия неизвестна, а sw.js лежит отдельным файлом. Их поднимает
// B-39-tests/bump_release.py после применения патча.
// ==========================================================================
(function (HOST) {
  'use strict';

  // Семь октав: минимум 36 (C2) — писатель GP5 не включает басовый сдвиг
  // нотной позиции (tuningOctaveShift срабатывает только ниже 35).
  var WIDE_MIDI = [36, 48, 60, 72, 84, 96, 108];
  var WIDE_NAMES = ['C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'];
  var GM_PROGRAM = { keys: 0, guitar: 25 };
  var MAX_NOTES = 20000;

  var stats = { parts: 0, notes: 0, skippedGhost: 0, skippedRecorded: 0,
    skippedMuted: 0, octaveShifts: 0, outOfRange: 0, snapped: 0,
    swingWrittenAsStraight: 0 };

  function tracks() { return HOST.StruChordTracks || null; }
  function keys() { return HOST.StruChordKeys || null; }
  function accomp() { return HOST.StruChordAccomp || null; }
  function formula() { return HOST.StruChordFormula || null; }
  function mod12(n) { return ((n % 12) + 12) % 12; }
  function asc(a, b) { return a - b; }
  function round4(n) { return Math.round(Number(n) * 10000) / 10000; }
  // GP5/GPIF кодируют только нотные длительности: округляем до 1/4 доли
  // (шестнадцатая), иначе триоли и кач превратились бы в потерю ноты.
  function snap4(n) { return Math.round(Number(n) * 4) / 4; }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, Number(n) || 0)); }

  /** Активен ли вообще слой дорожек: старая песня экспортируется как раньше. */
  function hasTracks() {
    var T = tracks();
    if (!T || typeof T.state !== 'function') return false;
    var st = null;
    try { st = T.state(); } catch (e) { return false; }
    if (!st || !Array.isArray(st.tracks) || !st.tracks.length) return false;
    if (typeof T.isDefault === 'function') {
      try { if (T.isDefault()) return false; } catch (e) {}
    }
    return true;
  }
  function mainIsKeys() {
    var T = tracks();
    if (!T || typeof T.mainTrack !== 'function') return false;
    try { var m = T.mainTrack(); return !!(m && m.instrument === 'keys'); } catch (e) { return false; }
  }

  // ---------- Позиция ячейки внутри секции (в долях сетки) ----------
  function squareBeats(sq, ts) {
    if (typeof getSquareBeats === 'function') {
      try { var n = getSquareBeats(sq, ts); if (Number.isFinite(n)) return n; } catch (e) {}
    }
    var sum = 0;
    ((sq && sq.events) || []).forEach(function (ev) { sum += Number(ev && ev.span) || 1; });
    return sum * Math.max(1, Number(sq && sq.repeat) || 1);
  }
  function windowUnits(sec, sq, ei, ts) {
    if (typeof partEventWindowUnits === 'function') {
      try {
        var w = partEventWindowUnits(sec, sq, ei);
        if (w && Number.isFinite(w.start) && Number.isFinite(w.span)) {
          return { start: w.start, span: w.span };
        }
      } catch (e) {}
    }
    var list = (sec && sec.squares) || [], start = 0;
    for (var s = 0; s < list.length; s++) {
      if (list[s] === sq) break;
      start += squareBeats(list[s], ts);
    }
    var evs = (sq && sq.events) || [];
    for (var i = 0; i < ei && i < evs.length; i++) start += Number(evs[i] && evs[i].span) || 1;
    var span = Number(evs[ei] && evs[ei].span) || 1;
    return { start: start, span: span };
  }

  // ---------- Абсолютные высоты аккорда ----------
  /**
   * Клавишная дорожка — та же позиция, что звучит (вариант из панели).
   * Остальные дорожки — честная формула в среднем регистре + отдельный бас.
   * Никаких гитарных струн и пропусков нот (R12).
   */
  function voicingFor(track, chord, key) {
    var K = keys(), T = tracks(), F = formula();
    if (track.instrument === 'keys' && K && T &&
        typeof K.generateKeysVoicings === 'function' && typeof T.keyRange === 'function') {
      try {
        var list = K.generateKeysVoicings(chord, key, T.keyRange(track.id), null, {});
        if (list && list.length) {
          var idx = 0;
          try { idx = Number(K.variantIndex(track.id, chord, null)) || 0; } catch (e) {}
          return list[((idx % list.length) + list.length) % list.length].slice();
        }
      } catch (e) {}
    }
    if (!F || typeof F.chordFormula !== 'function') return [];
    var f = null;
    try { f = F.chordFormula(chord, key); } catch (e) { return []; }
    if (!f || !f.tones || !f.tones.length) return [];
    var out = [], lo = 48, hi = 72;
    f.pitchClasses.forEach(function (pc) {
      var m = lo + mod12(pc - mod12(lo));
      if (m <= hi && out.indexOf(m) < 0) out.push(m);
    });
    var bassPc = f.bass ? f.bass.pitchClass : f.rootPc;
    out.unshift(36 + mod12(bassPc - mod12(36)));
    return out.sort(asc).slice(0, 9);
  }

  /** Шаги рисунка. dur = span => at/dur уже в долях сетки, не в секундах. */
  function stepsFor(track, cell, sec, sq, ev, ei, chord, key, range, notes, span, ts) {
    var A = accomp();
    if (A && typeof A.plan === 'function') {
      try {
        var steps = A.plan({
          trackId: track.id, cell: cell, sec: sec, sq: sq, ev: ev, ei: ei,
          ts: ts, dur: span, span: span, chord: chord, key: key,
          range: range, notes: notes,
          // Исполнительский свинг в файл не кодируется: GP/MIDI получают
          // письменный ритм (как gpExportPrepareSong в самом приложении).
          noSwing: true
        });
        if (steps && steps.length) return steps;
      } catch (e) {}
    }
    return [{ at: 0, dur: span, notes: notes }];
  }

  // ---------- Виртуальный строй GP5 ----------
  /**
   * Возвращает 0-based номер струны (от низкой) и лад, такие что
   * WIDE_MIDI[string] + fret = звучащая MIDI-высота.
   * Ноты ниже C2 поднимаем на октаву и честно считаем это потерей.
   */
  function gp5Position(pitch) {
    var p = Math.round(Number(pitch));
    if (!Number.isFinite(p) || p < 0 || p > 127) { stats.outOfRange++; return null; }
    var shifts = 0;
    while (p < WIDE_MIDI[0] && shifts < 4) { p += 12; shifts++; }
    while (p > WIDE_MIDI[WIDE_MIDI.length - 1] + 24 && shifts < 4) { p -= 12; shifts++; }
    stats.octaveShifts += shifts;
    for (var i = 0; i < WIDE_MIDI.length; i++) {
      var fret = p - WIDE_MIDI[i];
      if (fret >= 0 && fret <= 24) return { string: i, fret: fret, pitch: p, shifts: shifts };
    }
    stats.outOfRange++;
    return null;
  }

  function velocityOf(track) {
    return Math.max(1, Math.min(127, Math.round(90 * clamp(track.volume, 0, 100) / 100)));
  }

  // ---------- Сборка синтетических партий ----------
  function buildParts(songData, opts) {
    if (!hasTracks()) return [];
    var T = tracks(), gp5 = !!(opts && opts.gp5);
    var grid = !!(opts && (opts.grid || opts.gp5));
    var st;
    try { st = T.state(); } catch (e) { return []; }
    var anySolo = st.tracks.some(function (t) { return t.solo === true; });
    var secs = (songData && Array.isArray(songData.sections)) ? songData.sections : [];
    var globalKey = (songData && songData.globalKey) || 'C';
    var globalTs = (songData && songData.globalTimeSig) || '4/4';
    var out = [];
    stats.notes = 0; stats.octaveShifts = 0; stats.skippedGhost = 0;
    stats.skippedRecorded = 0; stats.skippedMuted = 0; stats.outOfRange = 0;

    st.tracks.forEach(function (track) {
      if (track.mute === true || (anySolo && track.solo !== true)) { stats.skippedMuted++; return; }
      var isKeys = track.instrument === 'keys';
      var range;
      if (isKeys && typeof T.keyRange === 'function') {
        try { range = T.keyRange(track.id); } catch (e) { range = { low: 36, high: 84, size: 61 }; }
      } else range = { low: 36, high: 84, size: 61 };

      var pitchRolls = {}, rolls = {};
      secs.forEach(function (sec) {
        if (!sec || !Array.isArray(sec.squares)) return;
        var ts = sec.timeSig || globalTs;
        var secKey = sec.key || globalKey;
        var list = [], tabList = [];
        sec.squares.forEach(function (sq) {
          var evs = (sq && sq.events) || [];
          for (var ei = 0; ei < evs.length; ei++) {
            var ev = evs[ei] || {};
            // Записанные вручную ноты ячейки («Виды», шаг 2) живут в своём
            // домене: не подменяем их аккордом и не дублируем.
            if (Array.isArray(ev.notes) && ev.notes.length) { stats.skippedRecorded++; continue; }
            var cell = String(sec.id) + ':' + String(sq.id) + ':' + String(ei);
            var chord = null;
            try { chord = T.trackChord(track.id, cell, ev); } catch (e) {}
            if (!chord) { stats.skippedGhost++; continue; }
            var win = windowUnits(sec, sq, ei, ts);
            var span = Math.max(0.25, Number(win.span) || Number(ev.span) || 1);
            var notes = voicingFor(track, chord, secKey);
            if (!notes.length) continue;
            var steps = stepsFor(track, cell, sec, sq, ev, ei, chord, secKey, range, notes, span, ts);
            steps.forEach(function (step) {
              var at = win.start + (Number(step.at) || 0);
              var dur = Math.max(0.05, Number(step.dur) || span);
              if (grid) {
                var sa = snap4(at), sd = Math.max(0.25, snap4(dur));
                if (sa !== at || sd !== dur) stats.snapped++;
                at = sa; dur = sd;
              }
              (step.notes || []).forEach(function (midi) {
                if (stats.notes >= MAX_NOTES) return;
                var p = Math.round(Number(midi));
                if (!Number.isFinite(p) || p < 0 || p > 127) { stats.outOfRange++; return; }
                var n = { start: round4(at), dur: round4(dur), pitch: p, velocity: velocityOf(track) };
                list.push(n); stats.notes++;
                if (gp5) {
                  var pos = gp5Position(p);
                  if (pos) tabList.push({ start: n.start, dur: n.dur,
                    string: pos.string, fret: pos.fret, velocity: n.velocity, voice: 1 });
                }
              });
            });
          }
        });
        if (list.length) pitchRolls[String(sec.id)] = list;
        if (gp5 && tabList.length) rolls[String(sec.id)] = tabList;
      });

      var base = {
        id: 'b39-' + track.id,
        name: String(track.name || ('Дорожка ' + track.id)),
        viewMode: 'staff',
        capo: 0,
        gmProgram: isKeys ? GM_PROGRAM.keys : GM_PROGRAM.guitar,
        mix: { volume: clamp(track.volume, 0, 100), pan: 0 },
        b39TrackId: track.id,
        b39Instrument: track.instrument
      };
      if (gp5) {
        // GP5-писатель умеет только струны: даём ему виртуальный строй
        // из семи октав и явно рассчитанные струна/лад.
        out.push(Object.assign({}, base, {
          instrument: 'guitar', strings: WIDE_NAMES.slice(),
          rolls: rolls, pitchRolls: {}
        }));
      } else {
        out.push(Object.assign({}, base, {
          instrument: isKeys ? 'keys' : 'other',
          pitchRolls: pitchRolls, rolls: {}
        }));
      }
    });
    stats.parts = out.length;
    return out;
  }

  /** Не мутирует songData: всегда возвращает поверхностную копию. */
  function withTracks(songData, opts) {
    if (!songData || !hasTracks()) return songData;
    var parts = buildParts(songData, opts);
    if (!parts.length) return songData;
    var report = opts && opts.report;
    if (report) {
      try {
        if (typeof gpExportGain === 'function') gpExportGain(report, 'Дорожки B-39 вынесены отдельно', parts.length);
        if (opts.gp5 && stats.octaveShifts && typeof gpExportLoss === 'function') {
          gpExportLoss(report, 'GP5: ноты ниже C2 подняты на октаву (виртуальный строй)', stats.octaveShifts);
        }
        if (stats.outOfRange && typeof gpExportLoss === 'function') {
          gpExportLoss(report, 'Высота вне MIDI-диапазона не экспортирована', stats.outOfRange);
        }
        if (stats.snapped && typeof gpExportLoss === 'function') {
          gpExportLoss(report, 'Исполнительский свинг и триоли записаны письменным ритмом (до 1/4 доли)', stats.snapped);
        }
      } catch (e) {}
    }
    // Свои дорожки ставим ПЕРВЫМИ: у GP/MIDI есть лимит дорожек, и чужие
    // данные не должны вытеснить новые.
    return Object.assign({}, songData, { parts: parts.concat(songData.parts || []) });
  }

  var api = Object.freeze({
    hasTracks: hasTracks, mainIsKeys: mainIsKeys,
    buildParts: buildParts, withTracks: withTracks,
    voicingFor: voicingFor, stepsFor: stepsFor,
    windowUnits: windowUnits, gp5Position: gp5Position,
    WIDE_MIDI: WIDE_MIDI.slice(), WIDE_NAMES: WIDE_NAMES.slice(),
    GM_PROGRAM: Object.assign({}, GM_PROGRAM),
    stats: function () { return Object.assign({}, stats); }
  });
  HOST.StruChordExport = api;
})(typeof window !== 'undefined' ? window : globalThis);
// <<< B-39 STAGE6 END (TRACK EXPORT) <<<

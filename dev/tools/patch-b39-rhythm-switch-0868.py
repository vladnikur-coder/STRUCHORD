#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""B-39 «Укулеле» (0.868): перенос ритма при смене инструмента дорожки.

Гитара → укулеле:
  • бой (mode 'strum': D/U/X) переносится в track.patterns как есть;
  • перебор (pick/mixed с номерами струн 1..6) заменяется ближайшим
    4-струнным пресетом укулеле — плотность, басовые удары, щипки аккорда,
    доля и размер.
Песенные (гитарные) рисунки при этом не меняются: обратная смена возвращает
исходный бой/перебор песни.

Только точные замены с проверкой числа вхождений.
"""
import io
import sys

PATH = 'STRUCHORD.html'


def rep(text, old, new, count=1, label=''):
    n = text.count(old)
    if n != count:
        sys.exit('FAIL %s: expected %d, found %d for %r' % (label, count, n, old[:90]))
    return text.replace(old, new)


with io.open(PATH, encoding='utf-8') as f:
    html = f.read()
size0 = len(html.encode('utf-8'))

helpers = """
  // 0.868 (B-39): перенос ритма при смене инструмента дорожки.
  //
  // Бой — рисунок из D/U/X: он не знает про число струн, поэтому на укулеле
  // звучит ровно так же и переносится как есть.
  // Перебор — это номера струн 1..6. На четырёх струнах шестиструнные шаги
  // невалидны, поэтому берём ближайший 4-струнный пресет: та же доля, та же
  // плотность, столько же басовых ударов и щипков аккорда. Рисунок меняется
  // («похожий перебор»), а не пропадает вместе со старым инструментом.
  var B39_UKE_PICK_MIN_CHORD_WEIGHT = 3;
  function b39RhythmIsStrum(raw) {
    if (!b39IsObj(raw) || !Array.isArray(raw.steps) || !raw.steps.length) return false;
    if (raw.mode === 'pick' || raw.mode === 'mixed') {
      // «Смешанный» рисунок всё равно содержит перебор — его надо менять.
      return raw.steps.every(function (st) {
        return st === null || st === undefined || st === '' || st === '_' ||
          st === 'D' || st === 'U' || st === 'X';
      });
    }
    return raw.steps.every(function (st) {
      return st === null || st === undefined || st === '' || st === '_' ||
        st === 'D' || st === 'U' || st === 'X';
    });
  }
  function b39RhythmShape(raw) {
    var steps = Array.isArray(raw && raw.steps) ? raw.steps : [];
    var used = 0, bass = 0, chords = 0;
    for (var i = 0; i < steps.length; i++) {
      var st = steps[i];
      if (st === null || st === undefined || st === '' || st === '_') continue;
      if (st === 'D' || st === 'U' || st === 'X') continue;
      used++;
      var items = Array.isArray(st) ? st : [st];
      if (items.length > 1) chords++;
      var low = false, high = false;
      for (var j = 0; j < items.length; j++) {
        var it = items[j];
        var num = Number(it);
        if (it === 'B' || (Number.isInteger(num) && num >= 5)) low = true;
        if (it === 'A' || (Number.isInteger(num) && num <= 2)) high = true;
      }
      if (low && !high) bass++;
    }
    return { used: used, bass: bass, chords: chords, subdivision: Number(raw && raw.subdivision) || 1 };
  }
  function b39UkePickPresetFor(raw) {
    var presets = (typeof STRUM_PRESETS !== 'undefined' && Array.isArray(STRUM_PRESETS)) ? STRUM_PRESETS : [];
    var candidates = presets.filter(function (p) {
      return p && p.mode === 'pick' && Array.isArray(p.steps) && Array.isArray(p.instruments)
        && p.instruments.indexOf('ukulele') >= 0;
    });
    if (!candidates.length) return null;
    var shape = b39RhythmShape(raw);
    // Щипки аккорда — самый заметный признак «романса»: если он есть в
    // исходнике, ищем его и в пресетах укулеле.
    var withChords = shape.chords > 0
      ? candidates.filter(function (p) { return b39RhythmShape({ steps: p.steps, subdivision: p.subdivision }).chords > 0; })
      : [];
    if (withChords.length) candidates = withChords;
    var best = null, bestScore = Infinity;
    candidates.forEach(function (p) {
      var ps = b39RhythmShape({ steps: p.steps, subdivision: p.subdivision });
      var score = Math.abs(shape.used - ps.used) * 3
        + Math.abs(shape.bass - ps.bass) * 2
        + Math.abs(shape.chords - ps.chords) * B39_UKE_PICK_MIN_CHORD_WEIGHT
        + (shape.subdivision === ps.subdivision ? 0 : 4);
      if (score < bestScore) { bestScore = score; best = p; }
    });
    if (!best) return null;
    return cleanUkePatternValue({
      mode: 'pick',
      subdivision: best.subdivision,
      steps: best.steps.map(function (st) { return Array.isArray(st) ? st.slice() : st; }),
    });
  }
  // Один рисунок: бой — как есть; перебор — ближайший 4-струнный пресет.
  function b39MigrateRhythmForUke(raw) {
    if (!b39IsObj(raw) || !Array.isArray(raw.steps) || !raw.steps.length) return null;
    if (b39RhythmIsStrum(raw)) return cleanUkePatternValue(raw);
    return b39UkePickPresetFor(raw);
  }
  // Все ритмы песни (секции и ячейки) — в собственные ключи укулеле.
  function b39MigrateSongRhythmsToUke() {
    var out = {};
    runtimeSections().forEach(function (sec) {
      var pattern = sec ? b39MigrateRhythmForUke(sec.strumPattern) : null;
      if (pattern) out['s:' + sec.id] = pattern;
    });
    eachCell(null, function (sec, sq, ev, ei, key) {
      var pattern = ev ? b39MigrateRhythmForUke(ev.strumPattern) : null;
      if (pattern) out[key] = pattern;
    });
    return out;
  }
"""

anchor = "  function setInstrument(id, inst) {\n"
html = rep(html, anchor, helpers + anchor, label='helpers insert')

old_head = """  function setInstrument(id, inst) {
    var t = findTrack(id);
    if (!t || B39_INSTRUMENTS.indexOf(inst) < 0) return false;
    if (t.instrument === inst) return true;
/*__DISPATCH__*/"""
html = rep(html, """  function setInstrument(id, inst) {
    var t = findTrack(id);
    if (!t || B39_INSTRUMENTS.indexOf(inst) < 0) return false;
    if (t.instrument === inst) return true;""",
            """  function setInstrument(id, inst) {
    var t = findTrack(id);
    if (!t || B39_INSTRUMENTS.indexOf(inst) < 0) return false;
    if (t.instrument === inst) return true;
    var prevInst = t.instrument;""", label='prevInst')

html = rep(html, """      if (b39IsStringInst(inst)) {
        t.voicings = {};
        t.patterns = {};""",
            """      if (b39IsStringInst(inst)) {
        // 0.868: бой сохраняем, перебор заменяем похожим 4-струнным.
        var migratedPatterns = (prevInst === 'guitar' && inst === 'ukulele')
          ? b39MigrateSongRhythmsToUke()
          : null;
        t.voicings = {};
        t.patterns = migratedPatterns || {};""", label='patterns migration')

html = rep(html, """    setActive: setActive, setInstrument: setInstrument, setVolume: setVolume, tuning:tuning, activeTuning:function(){return tuning(state.activeTrackId);}, setTuning:setTuning,""",
            """    setActive: setActive, setInstrument: setInstrument, setVolume: setVolume, tuning:tuning, activeTuning:function(){return tuning(state.activeTrackId);}, setTuning:setTuning,
    // 0.868: чистый перенос ритма — для тестов и будущих сценариев импорта.
    migrateRhythmForUke: b39MigrateRhythmForUke, migrateSongRhythmsToUke: b39MigrateSongRhythmsToUke,""",
            label='api export')

html = rep(html, 'ver 0.867', 'ver 0.868', label='version')
with io.open(PATH, 'w', encoding='utf-8') as f:
    f.write(html)

print('patched %s: %d -> %d bytes' % (PATH, size0, len(html.encode('utf-8'))))

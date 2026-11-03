#!/usr/bin/env python3
"""B-39: прослушивание активной дорожки и воспроизведение всех дорожек (0.705)."""
from pathlib import Path
p = Path('STRUCHORD.html'); s = p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 n=s.count(a)
 if n != 1: raise SystemExit(f'Патч не применён: якорь встречается {n} раз: {a[:120]!r}')
 s=s.replace(a,b,1)
rep("function pluckString(ctx, opts) {", """// Синхронный масштаб одного планируемого гитарного голоса дорожки.
let b39GuitarGain = 1;
function b39TrackGain(state, track) {
  if (!track || track.mute || (state.tracks.some(t => t.solo) && !track.solo)) return 0;
  return Math.max(0, Math.min(100, Number.isFinite(Number(track.volume)) ? Number(track.volume) : 100)) / 100;
}
function b39WithGuitarGain(gain, work) {
  const previous = b39GuitarGain;
  b39GuitarGain = gain;
  try { return work(); } finally { b39GuitarGain = previous; }
}
function pluckString(ctx, opts) {""")
rep("  const gain = (Number(opts.gain) || 0) * preset.gain;", "  const gain = (Number(opts.gain) || 0) * preset.gain * b39GuitarGain;")
rep("  if (window.StruChordMixer && !window.StruChordMixer.mainAudible()) return;\n  ensureGuitarBus(ctx);", "  ensureGuitarBus(ctx);")
rep("function playMuteChunk(ctx, startTime, gain) {\n  ensureGuitarBus(ctx);", "function playMuteChunk(ctx, startTime, gain) {\n  gain *= b39GuitarGain;\n  if (gain <= 0) return;\n  ensureGuitarBus(ctx);")
# Explicit and silent guitar track playback: visual rhythm remains intact.
rep("""    if (Array.isArray(next.event.notes) && next.event.notes.length) {
      // «Виды», шаг 2: ячейка с записанными нотами звучит ими (канал
      // «Песня»), бой этой ячейки планировщик пропускает целиком.
      scheduleAccompNotes(next.event.notes, evStart, bpm, ts, next.event.chord, effectiveKey);
    } else if (strumPattern) {
      timelinePassHint = tlPass;
      schedulePatternForEvent(
        next.event.chord,
        evStart,
        dur,
        posCtx,
        strumPattern,
        bpm,
        ts,
        next.square,
        next.eventIndex,
        next.event.span || 1,
        !!ownEventPattern,
        next.section
      );
    } else {
      playChordScheduled(next.event.chord, evStart, dur, posCtx);
    }
""", """    // Главная дорожка хранит аккорд в ev.chord; клавиши уже запланированы выше.
    const trackState = window.StruChordTracks ? window.StruChordTracks.state() : null;
    const mainTrack = trackState && trackState.tracks.find(t => t.id === trackState.mainTrackId);
    const mainGain = !trackState ? 1 : (mainTrack && mainTrack.instrument === 'guitar' ? b39TrackGain(trackState, mainTrack) : 0);
    if (mainGain > 0) b39WithGuitarGain(mainGain, () => {
      if (Array.isArray(next.event.notes) && next.event.notes.length) {
        scheduleAccompNotes(next.event.notes, evStart, bpm, ts, next.event.chord, effectiveKey);
      } else if (strumPattern) {
        timelinePassHint = tlPass;
        schedulePatternForEvent(next.event.chord, evStart, dur, posCtx, strumPattern, bpm, ts,
          next.square, next.eventIndex, next.event.span || 1, !!ownEventPattern, next.section);
      } else {
        playChordScheduled(next.event.chord, evStart, dur, posCtx);
      }
    });
""")
# additional guitars independent of main chord
rep("""  // B-12.1: партии звучат вместе с песней тем же гитарным тембром.""", """  // Другие гитары могут иметь собственный аккорд даже при пустой главной.
  if (window.StruChordTracks) {
    const T = window.StruChordTracks, state = T.state();
    const cell = T.cellKey(next.section, next.square, next.eventIndex);
    const key = next.section.key || globalKey;
    const pos = { secId: next.section.id, squareId: next.square.id, eventIndex: next.eventIndex, key };
    const roll = songRhythmRolls ? rhythmRollWindowFor(next.section.id, next.square, next.eventIndex, songRhythmRolls) : null;
    const own = roll || next.event.strumPattern || null;
    const pattern = own || getEffectiveStrumPattern(null, next.square, next.section);
    state.tracks.forEach(track => {
      if (track.id === state.mainTrackId || track.instrument !== 'guitar') return;
      const chord = T.trackChord(track.id, cell, next.event), gain = b39TrackGain(state, track);
      if (!chord || gain <= 0) return;
      b39WithGuitarGain(gain, () => {
        if (pattern) schedulePatternForEvent(chord, evStart, dur, pos, pattern, bpm, ts,
          next.square, next.eventIndex, next.event.span || 1, !!own, next.section);
        else playChordScheduled(chord, evStart, dur, pos);
      });
    });
  }

  // B-12.1: партии звучат вместе с песней тем же гитарным тембром.""")
# piano preview only active, selected voicing, section key
rep("  function preview(chordName, ctx, now, wrapper) {", "  function preview(chordName, ctx, now, wrapper, key) {")
rep("""      if (track.instrument !== 'keys') return;
      var chord = (cell && T.trackChord(track.id, cell)) || chordName;
      if (!chord) return;""", """      if (track.instrument !== 'keys' || track.id !== state.activeTrackId) return;
      var chord = chordName;
      if (!chord) return;""")
rep("      var notes = voicingFor(chord, currentKey(), T.keyRange(track.id), null);", """      var range = T.keyRange(track.id), effectiveKey = key || currentKey();
      var notes = voicingProvider
        ? (voicingProvider(chord, effectiveKey, range, null, track.id) || voicingFor(chord, effectiveKey, range, null))
        : voicingFor(chord, effectiveKey, range, null);""")
rep("function playChord(c, wrapper) {", "function playChord(c, wrapper, pendingPreview) {")
rep("""    let shape = null;
    if (wrapper) {""", """    let shape = null;
    const T = window.StruChordTracks;
    const state = T ? T.state() : null;
    const active = state && state.tracks.find(t => t.id === state.activeTrackId);
    if (active && wrapper && !pendingPreview) {
      const cell = wrapper.dataset.sec + ':' + wrapper.dataset.square + ':' + wrapper.dataset.ei;
      c = T.trackChord(active.id, cell);
      if (!c) return; // призрачный аккорд не звучит
    }
    if (active && b39TrackGain(state, active) <= 0) return;
    if (wrapper) {""")
rep("""    if (!shape) shape = resolveFingeringShape(c, key, null);
    // B-39 STAGE3: к гитарному превью добавляем клавишные голоса.
    if (window.StruChordAudio) window.StruChordAudio.preview(c, ctx, now, wrapper);
    strumChord(ctx, shape, c, key, now, STRUM_RING_SECONDS, 0.42);""", """    if (active && active.instrument === 'keys') {
      if (window.StruChordAudio) window.StruChordAudio.preview(c, ctx, now, wrapper, key);
    } else {
      if (!shape) shape = resolveFingeringShape(c, key, null);
      b39WithGuitarGain(active ? b39TrackGain(state, active) : 1,
        () => strumChord(ctx, shape, c, key, now, STRUM_RING_SECONDS, 0.42));
    }""")
start=s.index('function previewChordNow(chordName, wrapper) {');end=s.index('\nfunction initMetronomeGain()',start)
s=s[:start]+"""function previewChordNow(chordName, wrapper) {
  // При вводе аккорд может ещё не лежать в модели; слушаем переданное имя.
  playChord(chordName, wrapper, true);
}
"""+s[end:]
p.write_text(s,encoding='utf-8'); print('Патч применён')

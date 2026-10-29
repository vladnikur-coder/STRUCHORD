#!/usr/bin/env python3
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 n=s.count(a)
 if n!=1:raise SystemExit('Ожидалось одно место (%d) %s'%(n,a[:120]))
 s=s.replace(a,b,1)
rep('''    return dispatch('b39/track-chord', function () {
      if (isMain(id)) {''','''    return dispatch('b39/track-chord', function () {
      if (t.voicings[key] && typeof t.voicings[key] === 'object' && !sameChord(t.voicings[key].chord,cleaned)) delete t.voicings[key];
      if (isMain(id)) {''')
rep('''  function moveMainExactNotes(st, sectionId) {''','''  function clearExactNotes(id,key) {
    var t=findTrack(id),v=t && t.voicings && t.voicings[key];
    if(!v || !Array.isArray(v.notes))return false;
    return dispatch('b39/clear-exact-notes',function(){delete t.voicings[key];return true;});
  }
  function moveMainExactNotes(st, sectionId) {''')
rep('''    exactNotes:exactNotes, setExactNotes:setExactNotes, moveMainExactNotes:moveMainExactNotes,''','''    exactNotes:exactNotes, setExactNotes:setExactNotes, clearExactNotes:clearExactNotes, moveMainExactNotes:moveMainExactNotes,''')
rep('''    ev.chord = readableChord;
  }, { quiet: true });''','''    ev.chord = readableChord;
    if (posCtx && window.StruChordTracks) {
      const T=window.StruChordTracks, st=T.state();
      T.clearExactNotes(st.activeTrackId, posCtx.secId + ':' + (posCtx.sqId !== undefined ? posCtx.sqId : posCtx.squareId) + ':' + (posCtx.ei !== undefined ? posCtx.ei : posCtx.eventIndex));
    }
  }, { quiet: true });''')
rep('''    if (!variants.length) return '';
    var idx = variantIndex(trackId, chordName, o.cellKey) % variants.length;
    var linked=linkedSelection(trackId,o.cellKey), exact=T.exactNotes(trackId,o.cellKey,chordName);''','''    var exact=T.exactNotes(trackId,o.cellKey,chordName);
    if (!variants.length && !exact) return '';
    var idx = variantIndex(trackId, chordName, o.cellKey) % Math.max(1,variants.length);
    var linked=linkedSelection(trackId,o.cellKey);''')
rep('''      T.clearVoicingChoice(active.track.id,lastChord,lastCellKey);
    }
    var selection=linkedSelection''','''      T.clearExactNotes(active.track.id,lastCellKey);
      renderPanel();return;
    }
    var selection=linkedSelection''')
rep("    titleEl.textContent = chord || 'Клавиатура';", "    titleEl.textContent = noteDraft ? 'Ввод аккорда' : chord || 'Клавиатура';")
rep('''      rootPc: f ? f.rootPc : undefined, labelSpace: 16,''','''      rootPc: !noteDraft && f ? f.rootPc : undefined, labelSpace: 16,''')
rep('''      whiteW: whiteW, whiteH: keyboardWhiteHeight, showFingers: fingersVisible,''','''      whiteW: whiteW, whiteH: keyboardWhiteHeight, showFingers: noteDraft ? false : fingersVisible,''')
rep("if (command && command.label === 'song/clear') { hoverActive", "if (command && ['song/clear','song/load','b39/tracks-reset-new','b39/tracks-reset-empty','b39/track-active'].indexOf(command.label)>=0) { selectedCellKey=null; cancelNoteInput(); hoverActive")
rep('''            if (Array.isArray(ev.notes) && ev.notes.length) { stats.skippedRecorded++; continue; }
            var cell = String(sec.id) + ':' + String(sq.id) + ':' + String(ei);
            var chord = null;
            try { chord = T.trackChord(track.id, cell, ev); } catch (e) {}
            if (!chord)''','''            var cell = String(sec.id) + ':' + String(sq.id) + ':' + String(ei);
            var chord = null;
            try { chord = T.trackChord(track.id, cell, ev); } catch (e) {}
            if (Array.isArray(ev.notes) && ev.notes.length && !(isKeys && T.exactNotes(track.id,cell,chord))) { stats.skippedRecorded++; continue; }
            if (!chord)''')
rep("    var bass = (!sec || !acc || acc.bassPolicy(active.track.id,sec).include) && notes.length ? notes[0] : null;","    var bass = noteDraft ? (notes.length ? notes[0] : null) : ((!sec || !acc || acc.bassPolicy(active.track.id,sec).include) && notes.length ? notes[0] : null);")
p.write_text(s,encoding='utf-8')

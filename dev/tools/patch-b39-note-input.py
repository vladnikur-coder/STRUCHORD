#!/usr/bin/env python3
"""Ввод точных клавишных нот, на основе версии 0.750."""
from pathlib import Path
p=Path('STRUCHORD.html'); s=p.read_text(encoding='utf-8')
def rep(old,new):
 global s
 n=s.count(old)
 if n!=1: raise SystemExit('Ожидалось одно место (%d): %s'%(n,old[:130]))
 s=s.replace(old,new,1)
rep('''          var n = Number(v); return Number.isInteger(n) && n >= 0 && n <= 99 ? n : null;''','''          if (b39IsObj(v) && typeof v.chord === 'string' && /^[A-G][#b]?/.test(v.chord) && Array.isArray(v.notes) && v.notes.length >= 1 && v.notes.length <= 88 && v.notes.every(function(n){return Number.isInteger(n) && n >= 0 && n <= 127;})) {
            return {chord:v.chord.slice(0,B39_LIMITS.MAX_CHORD), notes:Array.from(new Set(v.notes)).sort(function(a,b){return a-b;})};
          }
          var n = Number(v); return Number.isInteger(n) && n >= 0 && n <= 99 ? n : null;''')
rep('''  function setVoicing(id, key, index) {''','''  function sameChord(a, b) {
    function canonical(x) { return String(x || '').replace(/[♯]/g,'#').replace(/[♭]/g,'b').replace(/(^|\/)([A-G][#b]?)/g,function(_,sep,n){return sep + ((typeof FLAT_TO_SHARP !== 'undefined' && FLAT_TO_SHARP[n]) || n);}); }
    return canonical(a) === canonical(b);
  }
  function exactNotes(id, key, chord) {
    var t=findTrack(id), v=t && t.voicings && t.voicings[key];
    return t && t.instrument==='keys' && v && Array.isArray(v.notes) && sameChord(v.chord,chord) ? v.notes.slice() : null;
  }
  function setExactNotes(id, key, chord, notes) {
    var t=findTrack(id), f=findEvent(key,null);
    if (!t || t.instrument!=='keys' || !f || !sameChord(trackChord(id,key,f.ev),chord) || !Array.isArray(notes) || !notes.length || notes.length>88 || !notes.every(function(n){return Number.isInteger(n) && n>=0 && n<=127;})) return false;
    return dispatch('b39/exact-notes',function(){t.voicings[key]={chord:chord,notes:Array.from(new Set(notes)).sort(function(a,b){return a-b;})};return true;});
  }
  function moveMainExactNotes(st, sectionId) {
    var t=mainTrack(); if(!t || t.instrument!=='keys' || !st)return;
    Object.keys(t.voicings).forEach(function(k){
      if(!/^\\d+:\\d+:\\d+$/.test(k) || (sectionId!=null && String(k).split(':')[0]!==String(sectionId)))return;
      var v=t.voicings[k], f=findEvent(k,null);
      if(!v || !Array.isArray(v.notes) || !f || !sameChord(transposeChord(v.chord,st),f.ev.chord))return;
      var moved=v.notes.map(function(n){return n+st;});
      if(moved.every(function(n){return n>=0 && n<=127;})){v.notes=moved;v.chord=f.ev.chord;}
    });
  }
  function setVoicing(id, key, index) {''')
rep('''    setTrackChord: setTrackChord, setVoicing: setVoicing, setPattern: setPattern,''','''    setTrackChord: setTrackChord, setVoicing: setVoicing, setPattern: setPattern,
    exactNotes:exactNotes, setExactNotes:setExactNotes, moveMainExactNotes:moveMainExactNotes,''')
rep('''  globalKey = nk;
  applyEnharmonicCorrectionToAll();''','''  globalKey = nk;
  applyEnharmonicCorrectionToAll();
  if(window.StruChordTracks) window.StruChordTracks.moveMainExactNotes(st);''')
rep('''    applyEnharmonicCorrectionToSection(sec);
  }, { quiet: true });''','''    applyEnharmonicCorrectionToSection(sec);
    if(window.StruChordTracks) window.StruChordTracks.moveMainExactNotes(delta,sec.id);
  }, { quiet: true });''')
rep('''        globalKey = newGlobalKey;
        applyEnharmonicCorrectionToAll();
        });
        requestRender();
        showToast(
          `Транспонировано на ${semitones''','''        globalKey = newGlobalKey;
        applyEnharmonicCorrectionToAll();
        if(window.StruChordTracks) window.StruChordTracks.moveMainExactNotes(semitones);
        });
        requestRender();
        showToast(
          `Транспонировано на ${semitones''')
rep('''      var key=sec.key || currentKey(), manual=t.voicings['v:'+chord];''','''      var key=sec.key || currentKey(), exact=T.exactNotes(trackId,e.cell,chord);
      if(exact){cache.prev=exact.slice();cache.entries[e.cell]={chord:chord,notes:exact.slice(),manual:true,exact:true};continue;}
      var manual=t.voicings['v:'+chord];''')
rep('''    if(!cache.entries[cell] && cache.indexes[cell]>=2048){
      var far=cache.events[cache.indexes[cell]], name=T.trackChord(trackId,cell,far.ev);''','''    if(!cache.entries[cell] && cache.indexes[cell]>=2048){
      var far=cache.events[cache.indexes[cell]], name=T.trackChord(trackId,cell,far.ev);
      var exactFar=T.exactNotes(trackId,cell,name);
      if(exactFar) return {chord:name,notes:exactFar,manual:true,exact:true};''')
rep('''    var linked=linkedSelection(trackId,o.cellKey);
    var notes = linked && linked.chord===chordName ? linked.notes.slice() : variants[idx], acc=HOST.StruChordAccomp, sec=acc && acc.sectionFromCell(o.cellKey);''','''    var linked=linkedSelection(trackId,o.cellKey), exact=T.exactNotes(trackId,o.cellKey,chordName);
    var notes = exact || (linked && linked.chord===chordName ? linked.notes.slice() : variants[idx]), acc=HOST.StruChordAccomp, sec=acc && acc.sectionFromCell(o.cellKey);''')
rep('''    var selected=chord ? linkedSelection(active.track.id,lastCellKey) : null;
    var notes = selected && selected.chord===chord ? selected.notes.slice() : (variants.length ? variants[idx] : []);''','''    var selected=chord ? linkedSelection(active.track.id,lastCellKey) : null;
    var exact=chord ? T.exactNotes(active.track.id,lastCellKey,chord) : null;
    var notes = exact || (selected && selected.chord===chord ? selected.notes.slice() : (variants.length ? variants[idx] : []));''')
rep('''      var linked=linkedSelection(trackId,cell);if(linked && linked.chord===chordName)return linked.notes.slice();''','''      var exact=T.exactNotes(trackId,cell,chordName);if(exact)return exact;
      var linked=linkedSelection(trackId,cell);if(linked && linked.chord===chordName)return linked.notes.slice();''')
rep('''    if(track.instrument==='keys' && K && track.linkedVoicings && cell) {''','''    if(track.instrument==='keys' && T && cell && typeof T.exactNotes==='function') {
      var exact=T.exactNotes(track.id,cell,chord); if(exact)return exact;
    }
    if(track.instrument==='keys' && K && track.linkedVoicings && cell) {''')
rep('''    var selection=linkedSelection(active.track.id,lastCellKey);
    var cur = selection''','''    if(T.exactNotes(active.track.id,lastCellKey,lastChord)) {
      if(!HOST.confirm('Снять вручную введённые ноты этой ячейки и вернуться к обычному расположению?'))return;
      T.clearVoicingChoice(active.track.id,lastChord,lastCellKey);
    }
    var selection=linkedSelection(active.track.id,lastCellKey);
    var cur = selection''')
p.write_text(s,encoding='utf-8')

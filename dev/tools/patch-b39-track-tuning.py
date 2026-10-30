#!/usr/bin/env python3
"""Apply to a disposable copy of 0.757; apply the resulting diff with patch."""
from pathlib import Path
p=Path('STRUCHORD.html'); s=p.read_text()
def rep(a,b,n=1):
 global s
 count=s.count(a)
 if count!=n: raise RuntimeError(f'expected {n}, got {count}: {a[:120]!r}')
 s=s.replace(a,b)
rep("keyboardSize: null, ...(instrument === 'guitar' ? {guitarShapesVersion:1} : {})", "keyboardSize: null, ...(instrument === 'guitar' ? {guitarShapesVersion:1,trackTuning:{id:'e-std',notes:null}} : {})")
rep('  function sanitizeTracks(rawTracks, validKeys, song) {', '''  function cleanTrackTuning(value, fallback) {
    var base=fallback || {id:'e-std',notes:null};
    if(!b39IsObj(value) || typeof value.id!=='string' || !TUNER_TUNINGS.some(function(x){return x.id===value.id;}))return b39Clone(base);
    if(value.notes != null && (!Array.isArray(value.notes) || value.notes.length!==6 || !value.notes.every(function(n){return typeof n==='string' && /^[A-G][#b]?-?\\d$/.test(n) && noteToFrequency(n);})))return b39Clone(base);
    return {id:value.id,notes:value.notes ? value.notes.slice() : null};
  }
  function legacyTrackTuning(song) {
    return cleanTrackTuning({id:song && song.tuning,notes:song && song.tuningNotes},{id:'e-std',notes:null});
  }
  function sanitizeTracks(rawTracks, validKeys, song) {''')
rep("if (!Array.isArray(rawTracks)) return [b39MakeTrack(1, 'guitar', 'Гитара')];", "if (!Array.isArray(rawTracks)) {var old=b39MakeTrack(1,'guitar','Гитара');old.trackTuning=legacyTrackTuning(song);return [old];}")
rep("if (!rawTracks.length) return [b39MakeTrack(1, 'guitar', 'Гитара')];", "if (!rawTracks.length) {var old=b39MakeTrack(1,'guitar','Гитара');old.trackTuning=legacyTrackTuning(song);return [old];}")
rep("keyboardSize: size, ...(inst==='guitar' ? {guitarShapesVersion:raw.guitarShapesVersion===1?1:0} : {})", "keyboardSize: size, ...(inst==='guitar' ? {guitarShapesVersion:raw.guitarShapesVersion===1?1:0,trackTuning:Object.prototype.hasOwnProperty.call(raw,'trackTuning')?cleanTrackTuning(raw.trackTuning):legacyTrackTuning(song)} : {})")
rep("t.mute || t.solo || t.keyboardSize !== null) return false;", "t.mute || t.solo || t.keyboardSize !== null) return false;\n    if(JSON.stringify(t.trackTuning)!==JSON.stringify(legacyTrackTuning({tuning:tunerTuningId,tuningNotes:tunerCustomNotes})))return false;")
rep("  function setActive(id) {\n    if (!findTrack(id)) return false;\n    return dispatch('b39/track-active', function () { state.activeTrackId = id; return true; });\n  }", """  function setActive(id) {
    if (!findTrack(id)) return false;
    var result=dispatch('b39/track-active', function () { state.activeTrackId = id; return true; });
    if(typeof renderTuningPill==='function')renderTuningPill();
    if(document.querySelector('.tuner-modal') && typeof tunerRenderTuning==='function')tunerRenderTuning();
    return result;
  }
  function tuning(id) {var t=findTrack(id);return t && t.instrument==='guitar' ? b39Clone(t.trackTuning) : null;}
  function setTuning(id,value) {
    var t=findTrack(id);if(!t || t.instrument!=='guitar')return false;
    var cleaned=cleanTrackTuning(value);if(window.captureHistorySnapshot)window.captureHistorySnapshot();
    var result=dispatch('b39/track-tuning',function(){t.trackTuning=cleaned;return true;});
    if(window.captureHistorySnapshot)window.captureHistorySnapshot();return result;
  }""")
rep("      t.instrument = inst;\n      if (inst !== 'keys'", "      t.instrument = inst;\n      if(inst==='guitar' && !t.trackTuning)t.trackTuning={id:'e-std',notes:null};\n      if(inst==='keys')delete t.trackTuning;\n      if (inst !== 'keys'")
rep("    setActive: setActive, setInstrument: setInstrument, setVolume: setVolume,", "    setActive: setActive, setInstrument: setInstrument, setVolume: setVolume, tuning:tuning, activeTuning:function(){return tuning(state.activeTrackId);}, setTuning:setTuning,")
# Explicit guitar context; songTuningNotes remains the old song domain for TAB.
rep('function songTuningNotes() {\n  return tunerActiveNotes();\n}', "function songTuningNotes() {\n  return tunerCustomNotes || (TUNER_TUNINGS.find(t => t.id === tunerTuningId) || TUNER_TUNINGS[0]).notes;\n}")
rep('function songStringNotes() {\n  return songTuningNotes()', 'function songStringNotes() {\n  return b39GuitarTuningNotes()')
rep('return songTuningNotes().map((n) => noteToFrequency(n) * capo);', 'return b39GuitarTuningNotes().map((n) => noteToFrequency(n) * capo);')
rep('  const cur = songTuningNotes();\n  return STD_TUNING_NOTES.map', '  const cur = b39GuitarTuningNotes();\n  return STD_TUNING_NOTES.map')
rep("return isStandardTuning() ? '' : '@' + songTuningNotes().join('');", "return isStandardTuning() ? '' : '@' + b39GuitarTuningNotes().join('');")
rep('function tunerCurrentTuning() {\n  return TUNER_TUNINGS.find((t) => t.id === tunerTuningId) || TUNER_TUNINGS[0];\n}', '''let b39TuningContext = null;
function b39WithTrackTuning(id, work) {
  const previous=b39TuningContext;b39TuningContext=id;
  try{return work();}finally{b39TuningContext=previous;}
}
function b39SelectedTuning() {
  const T=window.StruChordTracks;
  if(!T || b39TuningContext==='legacy')return null;
  return typeof b39TuningContext==='number' ? T.tuning(b39TuningContext) : T.activeTuning();
}
function b39GuitarTuningNotes() {
  const value=b39SelectedTuning();
  if(!value)return tunerCustomNotes || (TUNER_TUNINGS.find(t=>t.id===tunerTuningId)||TUNER_TUNINGS[0]).notes;
  return value.notes || (TUNER_TUNINGS.find(t=>t.id===value.id)||TUNER_TUNINGS[0]).notes;
}
function b39TunerId() {const value=b39SelectedTuning();return value?value.id:tunerTuningId;}
function b39ChangeTuning(id,notes) {
  const T=window.StruChordTracks, st=T && T.state(), t=st && st.tracks.find(x=>x.id===st.activeTrackId);
  if(t && t.instrument==='guitar')return T.setTuning(t.id,{id,notes});
  if(t)return false;
  tunerTuningId=id;tunerCustomNotes=notes;return true;
}
function tunerCurrentTuning() {
  return TUNER_TUNINGS.find((t) => t.id === b39TunerId()) || TUNER_TUNINGS[0];
}''')
rep('return tunerCustomNotes || tunerCurrentTuning().notes;', 'return b39GuitarTuningNotes();')
rep('el.dataset.id === tunerTuningId', 'el.dataset.id === b39TunerId()',2)
rep('''        tunerTuningId = t.id;
        // Ручная подстройка стрелками отменяется выбором готового строя
        // — так же, как в окне тюнера.
        tunerCustomNotes = null;''', '''        b39ChangeTuning(t.id,null);''')
rep('''      tunerTuningId = t.id;
      // Выбрали готовый строй — ручная правка больше не действует.
      tunerCustomNotes = null;''', '''      b39ChangeTuning(t.id,null);''')
rep('  tunerCustomNotes = notes;\n  tunerRenderTuning();', '  b39ChangeTuning(b39TunerId(),notes);\n  tunerRenderTuning();')
# Guitar-shape lookup is based on its owner, not the selected track.
rep("if((v.tuning||'') !== (typeof tuningKeySuffix==='function'?tuningKeySuffix():''))return null;", "if((v.tuning||'') !== (typeof tuningKeySuffix==='function'?b39WithTrackTuning(id,function(){return tuningKeySuffix();}):''))return null;")
rep("var t=findTrack(id), val=cleanGuitarShape({chord:chord,shape:shape,tuning:typeof tuningKeySuffix==='function'?tuningKeySuffix():'',barreOff:barreOff,fingers:fingers});", "var t=findTrack(id), val=cleanGuitarShape({chord:chord,shape:shape,tuning:typeof tuningKeySuffix==='function'?b39WithTrackTuning(id,function(){return tuningKeySuffix();}):'',barreOff:barreOff,fingers:fingers});")
rep("  if(!T || b39TuningContext==='legacy')return null;", "  if(!T || b39TuningContext==='legacy')return null;\n  if(b39TuningContext==='standard')return {id:'e-std',notes:null};")
rep("var shape=defaultGuitarShape(chord,cell,ev,true,{sec:sec,sq:sq,ei:ei});if(shape)t.guitarShapes[cell]=shape;", "var shape=b39WithTrackTuning(t.id,function(){return defaultGuitarShape(chord,cell,ev,true,{sec:sec,sq:sq,ei:ei});});if(shape)t.guitarShapes[cell]=shape;")
rep("var choice=defaultGuitarShape(cleaned,key,null,false);if(choice)t.guitarShapes[key]=choice;", "var choice=b39WithTrackTuning(id,function(){return defaultGuitarShape(cleaned,key,null,false);});if(choice)t.guitarShapes[key]=choice;")
rep("var prior=oldMain && oldMain.instrument==='guitar' ? (guitarShapeFromEvent(ev)||defaultGuitarShape(ev.chord,key,ev,true,{sec:sec,sq:sq,ei:ei})) : null;", "var prior=oldMain && oldMain.instrument==='guitar' ? b39WithTrackTuning(oldMain.id,function(){return guitarShapeFromEvent(ev)||defaultGuitarShape(ev.chord,key,ev,true,{sec:sec,sq:sq,ei:ei});}) : null;")
rep("if(shape)copiedShapes.push([key,shape]);", "if(shape && (shape.tuning||'')==='')copiedShapes.push([key,shape]);")
rep("function songStringNotes() {\n", "function songLegacyStringFreqs() {return songTuningNotes().map(n=>noteToFrequency(n)*songCapoFactor());}\nfunction songStringNotes() {\n")
rep("            songStringFreqs(),", "            songLegacyStringFreqs(),")
rep("          songStringFreqs(),", "          songLegacyStringFreqs(),")
rep("    freqs = songStringFreqs(),\n    sound = songSoundAtEvent", "    freqs = songLegacyStringFreqs(),\n    sound = songSoundAtEvent")
rep("function playTabNote(stringIdx, fret) {\n  const ctx = audioCtx;\n  if (!ctx) return;\n  const freqs = songStringFreqs();", "function playTabNote(stringIdx, fret) {\n  const ctx = audioCtx;\n  if (!ctx) return;\n  const freqs = songLegacyStringFreqs();")
rep("  const secondsPerUnit = getGridUnitDurationSeconds(bpm, parentTs);\n  const freqs = songStringFreqs();", "  const secondsPerUnit = getGridUnitDurationSeconds(bpm, parentTs);\n  const freqs = songLegacyStringFreqs();")
rep("    if (window.StruChordTracks) window.StruChordTracks.load(song);", "    if (window.StruChordTracks) window.StruChordTracks.load(song);\n    if (typeof renderTuningPill==='function') renderTuningPill();")
# The legacy TAB channel must not disappear when a single tuned guitar becomes a B-39 track.
rep("""    const partTracks = sourceParts.filter(p => audible(p.mix) && (!solo || p.mix && p.mix.solo)).map(p => {""", """    const hasTab=sections.some(sec=>(sec.squares||[]).some(sq=>sq.type==='tab'||(sq.events||[]).some(isInlineTabEvent)));
    const tabTrack=!songTrack && !solo && audible(songData.mix) && hasTab
      ? makeTrack('Таб-вставки','guitar',songData.mix,gpExportSongProgram(songData.sound),gpExportSongTuning(songData),songData.capo) : null;
    const partTracks = sourceParts.filter(p => audible(p.mix) && (!solo || p.mix && p.mix.solo)).map(p => {""")
rep("""      if (songTrack) {
        const program = gpExportSongProgram(songSoundAt(sec.id, win.start));
        if (!songTrack.programs.length || songTrack.programs[songTrack.programs.length - 1].program !== program) songTrack.programs.push({ at, program });
        if (sq.type === 'tab' || isInlineTabEvent(ev)) {""", """      const isTab=sq.type==='tab' || isInlineTabEvent(ev);
      const legacyTrack=isTab ? (songTrack || tabTrack) : songTrack;
      if (legacyTrack) {
        const program = gpExportSongProgram(songSoundAt(sec.id, win.start));
        if (!legacyTrack.programs.length || legacyTrack.programs[legacyTrack.programs.length - 1].program !== program) legacyTrack.programs.push({ at, program });
        if (isTab) {""")
rep("add(songTrack, { ...n, velocity, tabEffects: true }, position, unit, n.start, duration);", "add(legacyTrack, { ...n, velocity, tabEffects: true }, position, unit, n.start, duration);")
rep("list.forEach(n => add(songTrack, n, position, unit, n.start - win.start));", "list.forEach(n => add(legacyTrack, n, position, unit, n.start - win.start));")
rep("      state.tracks.push(t);\n      state.activeTrackId = id;\n      return true;", "      state.tracks.push(t);\n      state.activeTrackId = id;\n      if(typeof renderTuningPill==='function')renderTuningPill();\n      if(document.querySelector('.tuner-modal') && typeof tunerRenderTuning==='function')tunerRenderTuning();\n      return true;")
rep("      if (state.activeTrackId === id) state.activeTrackId = state.tracks[0].id;\n      return true;", "      if (state.activeTrackId === id) state.activeTrackId = state.tracks[0].id;\n      if(typeof renderTuningPill==='function')renderTuningPill();\n      if(document.querySelector('.tuner-modal') && typeof tunerRenderTuning==='function')tunerRenderTuning();\n      return true;")
# Remember cell shapes for each tuning, without changing other tracks.
rep("chords: {}, voicings: {}, patterns: {}, guitarShapes: {},", "chords: {}, voicings: {}, patterns: {}, guitarShapes: {}, guitarShapeHistory: {},")
rep("  function sanitizeTracks(rawTracks, validKeys, song) {", """  function cleanShapeHistory(raw) {
    if(!Array.isArray(raw))return null;
    var list=raw.slice(-128).map(cleanGuitarShape).filter(Boolean);
    return list.length?list:null;
  }
  function rememberShape(t,key,shape) {
    if(!t || !shape)return;
    t.guitarShapeHistory=t.guitarShapeHistory||{};
    var list=t.guitarShapeHistory[key]||[];
    list=list.filter(function(v){return !(sameChord(v.chord,shape.chord) && (v.tuning||'')===(shape.tuning||''));});
    list.push(b39Clone(shape));t.guitarShapeHistory[key]=list.slice(-128);
  }
  function recalledShape(t,key,chord,suffix) {
    return ((t.guitarShapeHistory||{})[key]||[]).find(function(v){return sameChord(v.chord,chord) && (v.tuning||'')===suffix;})||null;
  }
  function applyEventShape(ev,shape) {
    delete ev.fingering;delete ev.fingeringTuning;delete ev.barreOff;delete ev.fingers;
    if(!shape)return;
    ev.fingering=shape.shape.join(',');if(shape.tuning)ev.fingeringTuning=shape.tuning;
    if(shape.barreOff && shape.barreOff.length)ev.barreOff=shape.barreOff.slice();
    if(shape.fingers)ev.fingers=shape.fingers.slice();
  }
  function sanitizeTracks(rawTracks, validKeys, song) {""")
rep("guitarShapes: sanitizeMap(raw.guitarShapes, validKeys, cleanGuitarShape, false, false),", "guitarShapes: sanitizeMap(raw.guitarShapes, validKeys, cleanGuitarShape, false, false),\n        guitarShapeHistory: sanitizeMap(raw.guitarShapeHistory, validKeys, cleanShapeHistory, false, false),")
rep("!Object.keys(t.guitarShapes || {}).length && !Object.keys(t.bassRoles || {}).length", "!Object.keys(t.guitarShapes || {}).length && !Object.keys(t.guitarShapeHistory || {}).length && !Object.keys(t.bassRoles || {}).length")
rep("    var result=dispatch('b39/track-tuning',function(){t.trackTuning=cleaned;return true;});", """    var result=dispatch('b39/track-tuning',function(){
      var changed=JSON.stringify(t.trackTuning)!==JSON.stringify(cleaned);
      if(changed && isMain(id))eachCell(null,function(sec,sq,ev,ei,key){rememberShape(t,key,guitarShapeFromEvent(ev));});
      t.trackTuning=cleaned;
      if(changed && isMain(id)){
        var suffix=b39WithTrackTuning(id,function(){return tuningKeySuffix();});
        eachCell(null,function(sec,sq,ev,ei,key){applyEventShape(ev,recalledShape(t,key,ev.chord,suffix));});
      }
      return true;
    });""")
rep("""    var t=findTrack(id), v=t && t.guitarShapes[key];
    if(!t || t.instrument!=='guitar' || !v || !Array.isArray(v.shape) || !sameChord(v.chord,chord)) return null;
    if((v.tuning||'') !== (typeof tuningKeySuffix==='function'?b39WithTrackTuning(id,function(){return tuningKeySuffix();}):''))return null;
    return b39Clone(v);""", """    var t=findTrack(id), v=t && t.guitarShapes[key];
    if(!t || t.instrument!=='guitar')return null;
    var suffix=typeof tuningKeySuffix==='function'?b39WithTrackTuning(id,function(){return tuningKeySuffix();}):'';
    if(!v || !Array.isArray(v.shape) || !sameChord(v.chord,chord) || (v.tuning||'')!==suffix)v=recalledShape(t,key,chord,suffix);
    return v ? b39Clone(v) : null;""")
rep("return dispatch('b39/guitar-shape',function(){t.guitarShapes[key]=val;return true;});", "return dispatch('b39/guitar-shape',function(){rememberShape(t,key,t.guitarShapes[key]);t.guitarShapes[key]=val;rememberShape(t,key,val);return true;});")
rep("if(prior)oldMain.guitarShapes[key]=prior;", "if(prior){oldMain.guitarShapes[key]=prior;rememberShape(oldMain,key,prior);}")
rep("var incoming=newMain.instrument==='guitar' ? cleanGuitarShape(newMain.guitarShapes[key]) : null;", "var incoming=newMain.instrument==='guitar' ? guitarShape(newMain.id,key,newChords[key]) : null;")
rep("    return dispatch('b39/track-chord', function () {\n      if (t.voicings[key]", "    return dispatch('b39/track-chord', function () {\n      if (!sameChord(trackChord(id,key),cleaned) && t.guitarShapeHistory) delete t.guitarShapeHistory[key];\n      if (t.voicings[key]")
# Maintain track cell data by event identity when structural commands shift indexes.
rep("  // ---------- Мутации (все через Store) ----------", """  var CELL_MAP_FIELDS=['chords','voicings','patterns','guitarShapes','guitarShapeHistory'];
  function snapshotCellIdentities() {
    var map=new Map();eachCell(null,function(sec,sq,ev,ei,key){if(ev && typeof ev==='object')map.set(ev,key);});return map;
  }
  function reconcileCellIdentities(before,aliases) {
    if(!(before instanceof Map))return;
    var moved=new Map();eachCell(null,function(sec,sq,ev,ei,key){var source=aliases && aliases.get(ev) || ev;if(before.has(source)){var old=before.get(source),dest=moved.get(old)||[];dest.push(key);moved.set(old,dest);}});
    state.tracks.forEach(function(t){CELL_MAP_FIELDS.forEach(function(field){
      var original=t[field];if(!b39IsObj(original))return;var next={};
      Object.keys(original).forEach(function(key){
        if(!/^\\d+:\\d+:\\d+$/.test(key)){next[key]=original[key];return;}
        if(moved.has(key))moved.get(key).forEach(function(dest){next[dest]=b39Clone(original[key]);});
      });t[field]=next;
    });});
  }
  function cloneCellMaps(srcSec,srcSq,dstSec,dstSq) {
    if(!srcSq || !dstSq)return;
    state.tracks.forEach(function(t){CELL_MAP_FIELDS.forEach(function(field){
      var data=t[field];if(!b39IsObj(data))return;
      (srcSq.events||[]).forEach(function(ev,i){var src=String(srcSec)+':'+String(srcSq.id)+':'+i,dst=String(dstSec)+':'+String(dstSq.id)+':'+i;
        if(Object.prototype.hasOwnProperty.call(data,src))data[dst]=b39Clone(data[src]);
      });
    });});
  }
  // ---------- Мутации (все через Store) ----------""")
rep("    cellKey: cellKey, eachCell: function (cb) { eachCell(null, cb); },", "    cellKey: cellKey, eachCell: function (cb) { eachCell(null, cb); }, snapshotCellIdentities:snapshotCellIdentities, reconcileCellIdentities:reconcileCellIdentities, cloneCellMaps:cloneCellMaps,")
rep("""    const atomicHistory = outermost && opts && opts.history === 'atomic';
    if (atomicHistory && window.captureHistorySnapshot) window.captureHistorySnapshot();""", """    const atomicHistory = outermost && opts && opts.history === 'atomic';
    const trackStructural = outermost && /^(cell\/(add|remove)|square\/(tab-move|remove)|section\/(split|remove))$/.test(String(label)) && window.StruChordTracks;
    const trackCellsBefore = trackStructural ? trackStructural.snapshotCellIdentities() : null;
    if (atomicHistory && window.captureHistorySnapshot) window.captureHistorySnapshot();""")
rep("""    // Объект команды передаётся каждому подписчику: рендеру нужно""", """    if (trackStructural) trackStructural.reconcileCellIdentities(trackCellsBefore);
    // Объект команды передаётся каждому подписчику: рендеру нужно""")
rep("  if (window.StruChordTracks) window.StruChordTracks.cloneBassRoles(orig.id, cl.id);", "  if (window.StruChordTracks) {window.StruChordTracks.cloneBassRoles(orig.id, cl.id);orig.squares.forEach((sq,i)=>window.StruChordTracks.cloneCellMaps(orig.id,sq,cl.id,cl.squares[i]));}")
rep("    s.squares.push(ns);\n  }, { quiet: true });", "    s.squares.push(ns);\n    if(window.StruChordTracks)window.StruChordTracks.cloneCellMaps(s.id,ls,s.id,ns);\n  }, { quiet: true });")
rep("  let events = sq.events;\n  let currentSum", "  const trackCellsBeforeResize=window.StruChordTracks && window.StruChordTracks.snapshotCellIdentities();\n  let events = sq.events;\n  let currentSum")
rep("  events.forEach((e) => {\n    if (e.span < 1) e.span = 1;\n  });", "  events.forEach((e) => {\n    if (e.span < 1) e.span = 1;\n  });\n  if(window.StruChordTracks)window.StruChordTracks.reconcileCellIdentities(trackCellsBeforeResize);")
rep("function makeSectionRangeSquares(sec, interval, selectedParentTs) {", "function makeSectionRangeSquares(sec, interval, selectedParentTs, trackAliases) {")
rep("        const copy = clonePlainData(ev);\n        copy.span = piece.span;", "        const copy = clonePlainData(ev);\n        if(trackAliases)trackAliases.set(copy,ev);\n        copy.span = piece.span;")
rep("  songStore.dispatch('section/make-range', () => {\n    // Пул", "  songStore.dispatch('section/make-range', () => {\n    const trackCellsBeforeRange=window.StruChordTracks && window.StruChordTracks.snapshotCellIdentities();\n    const trackAliases=new WeakMap();\n    // Пул")
rep("const pieces = makeSectionRangeSquares(sourceSection, interval, plan.selectedParentTs);", "const pieces = makeSectionRangeSquares(sourceSection, interval, plan.selectedParentTs, trackAliases);")
rep("    sections = outputSections;\n    songParts.forEach((part) => {", "    sections = outputSections;\n    if(window.StruChordTracks)window.StruChordTracks.reconcileCellIdentities(trackCellsBeforeRange,trackAliases);\n    songParts.forEach((part) => {")
# Preserve section-level keyboard patterns and bass roles when sections are cloned or split.
rep("  function cloneCellMaps(srcSec,srcSq,dstSec,dstSq) {", """  function cloneSectionPatterns(from,to) {
    state.tracks.forEach(function(t){var src='s:'+from,dst='s:'+to;if(t.patterns && Object.prototype.hasOwnProperty.call(t.patterns,src))t.patterns[dst]=b39Clone(t.patterns[src]);});
  }
  function sectionMetadataCompatible(ids) {
    return state.tracks.every(function(t){
      var first=ids[0],p=JSON.stringify((t.patterns||{})['s:'+first]||null),b=(t.bassRoles||{})[first]||null;
      return ids.every(function(id){return JSON.stringify((t.patterns||{})['s:'+id]||null)===p && ((t.bassRoles||{})[id]||null)===b;});
    }) && (!state.autoAccomp || ids.every(function(id){return !!state.autoAccomp.managed[id]===!!state.autoAccomp.managed[ids[0]];}));
  }
  function remapSectionMetadata(pieces) {
    var sources=new Set(pieces.map(function(x){return String(x.sourceId);}));
    state.tracks.forEach(function(t){
      var oldP=Object.assign({},t.patterns),oldB=Object.assign({},t.bassRoles||{});
      sources.forEach(function(id){delete t.patterns['s:'+id];if(t.bassRoles)delete t.bassRoles[id];});
      pieces.forEach(function(p){var a=String(p.sourceId),b=String(p.destId);if(oldP['s:'+a])t.patterns['s:'+b]=b39Clone(oldP['s:'+a]);
        if(oldB[a]){t.bassRoles=t.bassRoles||{};t.bassRoles[b]=oldB[a];}});
    });
    if(state.autoAccomp){var old=Object.assign({},state.autoAccomp.managed);sources.forEach(function(id){delete state.autoAccomp.managed[id];});
      pieces.forEach(function(p){if(old[String(p.sourceId)])state.autoAccomp.managed[String(p.destId)]=true;});}
  }
  function cloneCellMaps(srcSec,srcSq,dstSec,dstSq) {""")
rep("snapshotCellIdentities:snapshotCellIdentities, reconcileCellIdentities:reconcileCellIdentities, cloneCellMaps:cloneCellMaps,", "snapshotCellIdentities:snapshotCellIdentities, reconcileCellIdentities:reconcileCellIdentities, cloneCellMaps:cloneCellMaps, cloneSectionPatterns:cloneSectionPatterns, sectionMetadataCompatible:sectionMetadataCompatible, remapSectionMetadata:remapSectionMetadata,")
rep("  if (window.StruChordAuto) window.StruChordAuto.cloneSection(orig, cl);", "  if (window.StruChordTracks) window.StruChordTracks.cloneSectionPatterns(orig.id,cl.id);\n  if (window.StruChordAuto) window.StruChordAuto.cloneSection(orig, cl);")
rep("  const selectedParentTs = affected[0].parentTs;", "  if(affected.length>1 && window.StruChordTracks && !window.StruChordTracks.sectionMetadataCompatible(affected.map(x=>String(x.sec.id))))return {error:'В секциях различаются настройки дорожек. Чтобы не потерять рисунок или бас, сначала согласуйте их.'};\n  const selectedParentTs = affected[0].parentTs;")
rep("    if(window.StruChordTracks)window.StruChordTracks.reconcileCellIdentities(trackCellsBeforeRange,trackAliases);", "    if(window.StruChordTracks){window.StruChordTracks.reconcileCellIdentities(trackCellsBeforeRange,trackAliases);window.StruChordTracks.remapSectionMetadata(pieceMaps);}")
rep("  function cloneSectionPatterns(from,to) {", """  function purgeSectionPatterns(id) {state.tracks.forEach(function(t){if(t.patterns)delete t.patterns['s:'+id];});}
  function cloneSectionManaged(from,to) {if(state.autoAccomp && state.autoAccomp.managed[String(from)])state.autoAccomp.managed[String(to)]=true;}
  function cloneSectionPatterns(from,to) {""")
rep("cloneSectionPatterns:cloneSectionPatterns, sectionMetadataCompatible", "cloneSectionPatterns:cloneSectionPatterns, purgeSectionPatterns:purgeSectionPatterns, cloneSectionManaged:cloneSectionManaged, sectionMetadataCompatible")
rep("    if (window.StruChordTracks) window.StruChordTracks.removeBassRoles(id);", "    if (window.StruChordTracks) {window.StruChordTracks.removeBassRoles(id);window.StruChordTracks.purgeSectionPatterns(id);}")
rep("    sections.splice(sections.indexOf(sec) + 1, 0, created);\n    songParts.forEach((part) => {", "    sections.splice(sections.indexOf(sec) + 1, 0, created);\n    if(window.StruChordTracks){window.StruChordTracks.cloneSectionPatterns(sec.id,created.id);window.StruChordTracks.cloneBassRoles(sec.id,created.id);window.StruChordTracks.cloneSectionManaged(sec.id,created.id);}\n    songParts.forEach((part) => {")
# Main and additional guitar scheduling executes synchronously under its own context.
rep('if (mainGain > 0) b39WithGuitarGain(mainGain, () => {', 'if (mainGain > 0) b39WithTrackTuning(mainTrack ? mainTrack.id : null, () => b39WithGuitarGain(mainGain, () => {')
rep('''    });
    globalKey = oldKey;
  } else {''', '''    }));
    globalKey = oldKey;
  } else {''')
rep('''      b39WithGuitarGain(gain, () => {
        const trackPos''', '''      b39WithTrackTuning(track.id, () => b39WithGuitarGain(gain, () => {
        const trackPos''')
rep('''        else playChordScheduled(chord, evStart, dur, trackPos);
      });''', '''        else playChordScheduled(chord, evStart, dur, trackPos);
      }));''')
rep("var guitar=guitarCellRoll(track,st.mainTrackId,sec,sq,ev,ei,chord,win,globalTs,grid);", "var guitar=b39WithTrackTuning(track.id,function(){return guitarCellRoll(track,st.mainTrackId,sec,sq,ev,ei,chord,win,globalTs,grid);});")
rep("viewMode:'tab',strings:gpExportSongTuning(songData),", "viewMode:'tab',strings:b39WithTrackTuning(track.id,function(){return b39GuitarTuningNotes().slice();}),")
p.write_text(s)

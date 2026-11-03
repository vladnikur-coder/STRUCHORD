#!/usr/bin/env python3
"""0.752: формы дополнительных гитар и безопасная перестановка дорожек."""
from pathlib import Path
p=Path('STRUCHORD.html'); s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 n=s.count(a)
 if n!=1: raise SystemExit('Expected 1, got %d: %r'%(n,a[:130]))
 s=s.replace(a,b,1)
rep("      keyboardSize: null\n    };\n  }\n  function b39DefaultName", "      keyboardSize: null, ...(instrument === 'guitar' ? {guitarShapesVersion:1} : {})\n    };\n  }\n  function b39DefaultName")
rep("  function sanitizeTracks(rawTracks, validKeys, song) {", """  function cleanGuitarShape(v) {
    if (!b39IsObj(v) || typeof v.chord !== 'string' || !/^[A-G][#b]?/.test(v.chord) || !Array.isArray(v.shape) || v.shape.length !== 6 || !v.shape.every(function(n){return n==='x' || (Number.isInteger(n) && n>=0 && n<=24);})) return null;
    var result={chord:v.chord.slice(0,B39_LIMITS.MAX_CHORD),shape:v.shape.slice(),tuning:typeof v.tuning==='string'?v.tuning.slice(0,160):''};
    if(Array.isArray(v.barreOff)) result.barreOff=v.barreOff.filter(function(n){return Number.isInteger(n)&&n>=1&&n<=24;}).slice(0,6);
    if(Array.isArray(v.fingers) && v.fingers.length===6 && v.fingers.every(function(n){return n===null || n==='x' || /^[0-4]$/.test(String(n));})) result.fingers=v.fingers.slice();
    return result;
  }
  function guitarShapeFromEvent(ev) {
    if(!ev || !ev.chord || !ev.fingering)return null;
    var shape=Array.isArray(ev.fingering)?ev.fingering:typeof ev.fingering==='string'?ev.fingering.split(',').map(function(v){return v.trim()==='x'?'x':Number(v);}):null;
    return cleanGuitarShape({chord:ev.chord,shape:shape,tuning:ev.fingeringTuning||'',barreOff:ev.barreOff,fingers:ev.fingers});
  }
  function sanitizeTracks(rawTracks, validKeys, song) {""")
rep("          if (b39IsObj(v) && typeof v.chord === 'string'", "          if (inst==='guitar' && b39IsObj(v) && Array.isArray(v.shape)) return cleanGuitarShape(v);\n          if (b39IsObj(v) && typeof v.chord === 'string'")
rep("        keyboardSize: size\n      });\n    });\n    return out.length", """        keyboardSize: size, ...(inst==='guitar' ? {guitarShapesVersion:1} : {})
      });
      // Старые дополнительные гитары могли наследовать форму главной,
      // если имена совпадали. Снимок фиксируется только при миграции.
      if(inst==='guitar' && idx>0 && raw.guitarShapesVersion!==1) {
        var t=out[out.length-1];
        eachCell(song && song.sections, function(sec,sq,ev,ei,cell){
          if(!t.voicings[cell] && t.chords[cell] && t.chords[cell]===ev.chord) {
            var old=guitarShapeFromEvent(ev); if(old)t.voicings[cell]=old;
          }
        });
      }
    });
    return out.length""")
rep("  function setVoicing(id, key, index) {", """  function guitarShape(id, key, chord) {
    var t=findTrack(id), v=t && t.voicings[key];
    if(!t || t.instrument!=='guitar' || !v || !Array.isArray(v.shape) || !sameChord(v.chord,chord)) return null;
    if((v.tuning||'') !== (typeof tuningKeySuffix==='function'?tuningKeySuffix():''))return null;
    return b39Clone(v);
  }
  function setGuitarShape(id,key,chord,shape,barreOff,fingers) {
    var t=findTrack(id), val=cleanGuitarShape({chord:chord,shape:shape,tuning:typeof tuningKeySuffix==='function'?tuningKeySuffix():'',barreOff:barreOff,fingers:fingers});
    if(!t || t.instrument!=='guitar' || !/^\\d+:\\d+:\\d+$/.test(String(key)) || !val || !sameChord(trackChord(id,key),chord))return false;
    return dispatch('b39/guitar-shape',function(){t.voicings[key]=val;return true;});
  }
  function setVoicing(id, key, index) {""")
rep("    setTrackChord: setTrackChord, setVoicing: setVoicing, setPattern: setPattern,", "    setTrackChord: setTrackChord, setVoicing: setVoicing, setPattern: setPattern,\n    guitarShape:guitarShape, setGuitarShape:setGuitarShape,")
rep("    var copied = [];\n    if (src) {\n      eachCell(null, function (sec, sq, ev, ei, key) {\n        var c = trackChord(src.id, key, ev);\n        if (c) copied.push([key, c]);", """    var copied = [], copiedShapes = [];
    if (src) {
      eachCell(null, function (sec, sq, ev, ei, key) {
        var c = trackChord(src.id, key, ev);
        if (c) copied.push([key, c]);
        if (inst==='guitar' && src.instrument==='guitar' && c) {
          var shape=isMain(src.id)?guitarShapeFromEvent(ev):guitarShape(src.id,key,c);
          if(shape)copiedShapes.push([key,shape]);
        }""")
rep("      copied.forEach(function (pair) { t.chords[pair[0]] = pair[1]; });\n      state.tracks.push(t);", "      copied.forEach(function (pair) { t.chords[pair[0]] = pair[1]; });\n      copiedShapes.forEach(function(pair){t.voicings[pair[0]]=pair[1];});\n      state.tracks.push(t);")
rep("      eachCell(null, function (sec, sq, ev, ei, key) { ev.chord = newChords[key] || ''; });", """      eachCell(null, function (sec, sq, ev, ei, key) {
        var prior=oldMain && oldMain.instrument==='guitar' ? guitarShapeFromEvent(ev) : null;
        if(prior)oldMain.voicings[key]=prior;
        var incoming=newMain.instrument==='guitar' ? cleanGuitarShape(newMain.voicings[key]) : null;
        ev.chord = newChords[key] || '';
        delete ev.fingering; delete ev.fingeringTuning; delete ev.barreOff; delete ev.fingers;
        if(incoming && sameChord(incoming.chord,ev.chord)){
          ev.fingering=incoming.shape.join(','); if(incoming.tuning)ev.fingeringTuning=incoming.tuning;
          if(incoming.barreOff && incoming.barreOff.length)ev.barreOff=incoming.barreOff.slice();
          if(incoming.fingers)ev.fingers=incoming.fingers.slice();
          delete newMain.voicings[key];
        }
        if(typeof HOST.dropPreferredFingeringsAt==='function')HOST.dropPreferredFingeringsAt(sec.id,sq.id,ei);
      });""")
# Editor: isolate secondary track and defer name until save.
rep("  const createMode = !!opts.createMode;\n  let key = activeSectionKey || globalKey;", """  const createMode = !!opts.createMode;
  const gt=window.StruChordTracks, gtState=gt && gt.state();
  const gtTrack=gtState && gtState.tracks.find(t=>t.id===gtState.activeTrackId);
  const ownGuitar=!!(wrapper && gtTrack && gtTrack.instrument==='guitar' && gtTrack.id!==gtState.mainTrackId);
  const ownCell=ownGuitar ? wrapper.dataset.sec+':'+wrapper.dataset.square+':'+wrapper.dataset.ei : null;
  let key = activeSectionKey || globalKey;""")
rep("    if (snapEv) {\n      entrySnapshot = {", "    if (snapEv && !ownGuitar) {\n      entrySnapshot = {")
rep("    if (!currentShape) {\n      if (variants && variants[variantIndex])", """    if(ownGuitar) {
      const own=gt.guitarShape(gtTrack.id,ownCell,chordName);
      if(own){currentShape=own.shape.slice();initialBarreOff=own.barreOff||null;initialFingers=own.fingers||null;}
    }
    if (!currentShape) {
      if (variants && variants[variantIndex])""")
rep("    const displayChord = normalizeChordCase(fullChord);\n    // Раньше здесь имя просто переписывалось", """    const displayChord = normalizeChordCase(fullChord);
    if(ownGuitar){
      activeChordName=displayChord; activeCacheKey=buildFingeringChordKey(displayChord,key);
      const heading=document.getElementById('fingering-editor-heading-chord');if(heading)heading.textContent=displayChord;
      const all=document.getElementById('save-fingering-all');if(all)all.textContent=`Сохранить для всех ${displayChord}`;
      handleShapeChange(currentShape);return;
    }
    // Раньше здесь имя просто переписывалось""")
rep("      const currentChord = currentInput ? currentInput.value.trim() : chordName;", "      const currentChord = ownGuitar ? activeChordName : (currentInput ? currentInput.value.trim() : chordName);")
rep("  function commitEditSave(applyToAll) {\n", """  function commitEditSave(applyToAll) {
    if(ownGuitar){
      const name=activeChordName, bo=fretboardObj.getBarreOff(), fingers=fretboardObj.getFingers();
      songStore.dispatch('b39/guitar-edit',()=>{
        if(name!==gt.trackChord(gtTrack.id,ownCell))gt.setTrackChord(gtTrack.id,ownCell,name);
        gt.setGuitarShape(gtTrack.id,ownCell,name,currentShape,bo,fingers);
        if(applyToAll)gt.eachCell((sec,sq,ev,ei,cell)=>{if(cell!==ownCell && gt.trackChord(gtTrack.id,cell,ev)===name)gt.setGuitarShape(gtTrack.id,cell,name,currentShape,bo,fingers);});
      },{history:'atomic'});
      closeFingeringEditor();requestRender();return;
    }
""")
rep("    const displayChord = normalizeChordCase(fullChord);\n\n    const sid = +targetInput.dataset.sec,", """    const displayChord = normalizeChordCase(fullChord);
    if(ownGuitar){
      songStore.dispatch('b39/guitar-create',()=>{
        gt.setTrackChord(gtTrack.id,ownCell,displayChord);
        gt.setGuitarShape(gtTrack.id,ownCell,displayChord,currentShape,fretboardObj.getBarreOff(),fretboardObj.getFingers());
      },{history:'atomic'});
      closeFingeringEditor();closeChordWheel();requestRender();return;
    }

    const sid = +targetInput.dataset.sec,""")
# secondary audio: ensure no main fallback when no stored selection.
rep("        shape = resolveFingeringShape(c, key, posKey);\n      }\n    }\n    if (active && active.instrument === 'keys')", """        if(active && active.instrument==='guitar' && active.id!==state.mainTrackId){
          const own=T.guitarShape(active.id,secId+':'+squareId+':'+eventIndex,c);
          shape=own ? own.shape : resolveFingeringShape(c,key,null);
        } else shape = resolveFingeringShape(c, key, posKey);
      }
    }
    if (active && active.instrument === 'keys')""")
rep("    shape = resolveFingeringShape(c, key, posKey);\n    // B-74 / B-41:", """    const T=window.StruChordTracks, state=T && T.state();
    const secondary=state && posCtx.trackId!=null && posCtx.trackId!==state.mainTrackId;
    const own=secondary && T.guitarShape(posCtx.trackId,posCtx.secId+':'+posCtx.squareId+':'+posCtx.eventIndex,c);
    shape=secondary ? (own ? own.shape : resolveFingeringShape(c,key,null)) : resolveFingeringShape(c, key, posKey);
    if(own){barreOff=own.barreOff||null;fingers=own.fingers||null;}
    // B-74 / B-41:""")
rep("    if (shape) {\n      const ev = findEventByPosKey(posKey);\n      barreOff = barreOffForEventShape(ev, shape);", "    if (shape && !secondary) {\n      const ev = findEventByPosKey(posKey);\n      barreOff = barreOffForEventShape(ev, shape);")
rep("      b39WithGuitarGain(gain, () => {\n        if (pattern) schedulePatternForEvent(chord, evStart, dur, pos, pattern, bpm, ts,", "      b39WithGuitarGain(gain, () => {\n        const trackPos={...pos,trackId:track.id};\n        if (pattern) schedulePatternForEvent(chord, evStart, dur, trackPos, pattern, bpm, ts,")
rep("        else playChordScheduled(chord, evStart, dur, pos);", "        else playChordScheduled(chord, evStart, dur, trackPos);")
rep("  const eventForTooltip = sqForTooltip && sqForTooltip.events && sqForTooltip.events[eventIndex];\n\n  const result", """  const eventForTooltip = sqForTooltip && sqForTooltip.events && sqForTooltip.events[eventIndex];
  const activeState=window.StruChordTracks && window.StruChordTracks.state();
  const activeGuitar=activeState && activeState.tracks.find(t=>t.id===activeState.activeTrackId);
  const ownTooltip=!!(activeGuitar && activeGuitar.instrument==='guitar' && activeGuitar.id!==activeState.mainTrackId);
  const ownCell=secId+':'+squareId+':'+eventIndex;
  const ownChoice=()=>ownTooltip && StruChordTracks.guitarShape(activeGuitar.id,ownCell,chordName);
  const tooltipShape=()=>{const own=ownChoice();return ownTooltip ? (own ? own.shape : resolveFingeringShape(chordName,key,null)) : resolveFingeringShape(chordName,key,cacheKey,eventForTooltip);};

  const result""")
rep("        : eventForTooltip &&\n          Array.isArray(eventForTooltip.barreOff)", "        : !ownTooltip && eventForTooltip &&\n          Array.isArray(eventForTooltip.barreOff)")
rep("        : fingersForEventShape(eventForTooltip, shape);\n    // B-39 STAGE4", "        : ownTooltip ? ((ownChoice() || {}).fingers || null) : fingersForEventShape(eventForTooltip, shape);\n    // B-39 STAGE4")
rep("    const barreOffForShape =\n      shownBarreOff !== undefined\n        ? shownBarreOff\n        : !ownTooltip", "    const barreOffForShape =\n      shownBarreOff !== undefined\n        ? shownBarreOff\n        : ownTooltip ? ((ownChoice() || {}).barreOff || null) : !ownTooltip")
a="          preferredFingeringByChord.get(cacheKey) ||\n          (resolveFingeringShape(chordName, key, cacheKey, eventForTooltip) || variants[0]).join(',');"
if s.count(a)!=2: raise SystemExit('tooltip current shape count')
s=s.replace(a,"          (!ownTooltip && preferredFingeringByChord.get(cacheKey)) ||\n          (tooltipShape() || variants[0]).join(',');")
rep("          eventForTooltip && eventForTooltip.fingering === currentShape\n            ? eventForTooltip.barreOff", "          ownTooltip ? ((ownChoice() || {}).barreOff || null) : eventForTooltip && eventForTooltip.fingering === currentShape\n            ? eventForTooltip.barreOff")
rep("        setPreferredFingering(cacheKey, newShape, eventForTooltip || undefined, newBO || [], newFingers);", """        if(ownTooltip) StruChordTracks.setGuitarShape(activeGuitar.id,ownCell,chordName,variants[idx],newBO || [],newFingers);
        else setPreferredFingering(cacheKey, newShape, eventForTooltip || undefined, newBO || [], newFingers);""")

# Both calls are in tooltip only; replace with checks.
a="resolveFingeringShape(chordName, key, cacheKey, eventForTooltip) || variants[0]"
if s.count(a)!=2: raise SystemExit('tooltip render count %d'%s.count(a))
s=s.replace(a,"tooltipShape() || variants[0]")

rep("  const chord = ev ? (ev.chord || '').trim() : '';\n  fillTimelinePanel('now', chord, {\n    secId,", """  const T=window.StruChordTracks, state=T && T.state(), active=state && state.tracks.find(t=>t.id===state.activeTrackId);
  const own=active && active.instrument==='guitar' && active.id!==state.mainTrackId;
  const chord = own ? (T.trackChord(active.id,secId+':'+sqId+':'+ei,ev)||'') : ev ? (ev.chord || '').trim() : '';
  fillTimelinePanel('now', chord, {
    trackId:own ? active.id : undefined,
    secId,""")
rep("  const ev = sq && sq.events[pos.ei];\n  const chord = ev ? (ev.chord || '').trim() : '';", """  const ev = sq && sq.events[pos.ei];
  const T=window.StruChordTracks, state=T && T.state(), active=state && state.tracks.find(t=>t.id===state.activeTrackId);
  const own=active && active.instrument==='guitar' && active.id!==state.mainTrackId;
  const ownCell=pos.secId+':'+pos.sqId+':'+pos.ei;
  const chord=own ? (T.trackChord(active.id,ownCell,ev)||'') : ev ? (ev.chord || '').trim() : '';""")
rep("    preferredFingeringByChord.get(posKey) ||\n    ((resolveFingeringShape(chord, key, posKey, ev) || [])).join(',');", """    (!own && preferredFingeringByChord.get(posKey)) ||
    ((own ? ((T.guitarShape(active.id,ownCell,chord)||{}).shape || resolveFingeringShape(chord,key,null)) : resolveFingeringShape(chord,key,posKey,ev)) || []).join(',');""")
rep("  const currentBO = ev && ev.fingering === current ? ev.barreOff : null;", "  const currentBO = own ? ((T.guitarShape(active.id,ownCell,chord)||{}).barreOff||null) : ev && ev.fingering === current ? ev.barreOff : null;")
rep("        setPreferredFingering(posKey, variants[next].join(','), ev || undefined, barreOffs[next] || [], nextFingers);", """        if(own) T.setGuitarShape(active.id,ownCell,chord,variants[next],barreOffs[next]||[],nextFingers);
        else setPreferredFingering(posKey, variants[next].join(','), ev || undefined, barreOffs[next] || [], nextFingers);""")
# When all occurrences are explicitly requested, count only this track's pinned shapes.
rep("      let pinnedCount = 0;\n      if (wrapper && targetCacheKey) {", """      let pinnedCount = 0;
      if(ownGuitar){
        gt.eachCell((sec,sq,ev,ei,cell)=>{if(cell!==ownCell && gt.trackChord(gtTrack.id,cell,ev)===activeChordName && gt.guitarShape(gtTrack.id,cell,activeChordName))pinnedCount++;});
      }
      if (!ownGuitar && wrapper && targetCacheKey) {""")

rep("  if (!form) {\n    form = resolveFingeringShape(name, key, pinnedPosKey);\n  }\n  // B-74: разжатое баррэ этой ячейки.\n  const pinnedEvent = findEventByPosKey(pinnedPosKey);\n  const pinnedBarreOff = barreOffForEventShape(pinnedEvent, form);\n  const pinnedFingers = fingersForEventShape(pinnedEvent, form);", """  const pinT=window.StruChordTracks, pinState=pinT && pinT.state(), pinTrack=pinState && pinState.tracks.find(t=>t.id===pinState.activeTrackId);
  const pinOwn=pinTrack && pinTrack.instrument==='guitar' && pinTrack.id!==pinState.mainTrackId;
  const pinCell=pinnedFingering.secId+':'+pinnedFingering.squareId+':'+pinnedFingering.eventIndex;
  const pinChoice=pinOwn && pinT.guitarShape(pinTrack.id,pinCell,name);
  if (!form) {
    form = pinOwn ? (pinChoice ? pinChoice.shape : resolveFingeringShape(name,key,null)) : resolveFingeringShape(name, key, pinnedPosKey);
  }
  // B-74: разжатое баррэ этой ячейки.
  const pinnedEvent = findEventByPosKey(pinnedPosKey);
  const pinnedBarreOff = pinOwn ? (pinChoice && pinChoice.barreOff) : barreOffForEventShape(pinnedEvent, form);
  const pinnedFingers = pinOwn ? (pinChoice && pinChoice.fingers) : fingersForEventShape(pinnedEvent, form);""")
rep("  const form = resolveFingeringShape(chord, key, posKey);\n  // B-42 (0.156):", """  const hoverT=window.StruChordTracks, hoverState=hoverT && hoverT.state(), hoverTrack=hoverState && hoverState.tracks.find(t=>t.id===hoverState.activeTrackId);
  const hoverOwn=hoverTrack && hoverTrack.instrument==='guitar' && hoverTrack.id!==hoverState.mainTrackId;
  const hoverChoice=hoverOwn && hoverT.guitarShape(hoverTrack.id,secId+':'+wrapper.dataset.square+':'+wrapper.dataset.ei,chord);
  const form=hoverOwn ? (hoverChoice ? hoverChoice.shape : resolveFingeringShape(chord,key,null)) : resolveFingeringShape(chord, key, posKey);
  // B-42 (0.156):""")

rep("keyboardSize: size, ...(inst==='guitar' ? {guitarShapesVersion:1} : {})", "keyboardSize: size, ...(inst==='guitar' ? {guitarShapesVersion:raw.guitarShapesVersion===1?1:0} : {})")
# In this migration the complete old selection is captured only after song key, tuning and libraries are loaded.
rep("      // Старые дополнительные гитары могли наследовать форму главной,\n      // если имена совпадали. Снимок фиксируется только при миграции.\n      if(inst==='guitar' && idx>0 && raw.guitarShapesVersion!==1) {\n        var t=out[out.length-1];\n        eachCell(song && song.sections, function(sec,sq,ev,ei,cell){\n          if(!t.voicings[cell] && t.chords[cell] && t.chords[cell]===ev.chord) {\n            var old=guitarShapeFromEvent(ev); if(old)t.voicings[cell]=old;\n          }\n        });\n      }\n", "")
rep("  function setTrackChord(id, key, chord) {", """  function defaultGuitarShape(chord,cell,ev,legacy) {
    var f=findEvent(cell,null), sec=f && f.sec, key=sec && sec.key || currentKey();
    if(!f || !chord || typeof HOST.resolveFingeringShape!=='function')return null;
    var pos=legacy && typeof HOST.buildFingeringPositionKey==='function' ? HOST.buildFingeringPositionKey(chord,key,sec.id,f.sq.id,f.ei):null;
    var target=legacy && ev && sameChord(ev.chord,chord) ? ev : undefined;
    var shape=HOST.resolveFingeringShape(chord,key,pos,target);
    var suffix=typeof tuningKeySuffix==='function'?tuningKeySuffix():'';
    return shape ? cleanGuitarShape({chord:chord,shape:shape,tuning:suffix,barreOff:target && target.barreOff,fingers:target && target.fingers}) : null;
  }
  function materializeLegacyGuitars() {
    state.tracks.forEach(function(t,i){
      if(!i || t.instrument!=='guitar' || t.guitarShapesVersion===1)return;
      eachCell(null,function(sec,sq,ev,ei,cell){
        var chord=t.chords[cell];if(!chord)return;
        var v=t.voicings[cell];
        if(v && Array.isArray(v.shape)){if(!v.tuning)v.tuning=typeof tuningKeySuffix==='function'?tuningKeySuffix():'';return;}
        var shape=defaultGuitarShape(chord,cell,ev,true);if(shape)t.voicings[cell]=shape;
      });
      t.guitarShapesVersion=1;
    });
  }
  function setTrackChord(id, key, chord) {""")
rep("        t.chords[key] = cleaned;                   // явный аккорд дорожки", """        t.chords[key] = cleaned;                   // явный аккорд дорожки
        if(t.instrument==='guitar' && !t.voicings[key]){var choice=defaultGuitarShape(cleaned,key,null,false);if(choice)t.voicings[key]=choice;}""")
rep("          var shape=isMain(src.id)?guitarShapeFromEvent(ev):guitarShape(src.id,key,c);", "          var shape=isMain(src.id)?(guitarShapeFromEvent(ev)||defaultGuitarShape(c,key,ev,true)):(guitarShape(src.id,key,c)||defaultGuitarShape(c,key,null,false));")
rep("    guitarShape:guitarShape, setGuitarShape:setGuitarShape,", "    guitarShape:guitarShape, setGuitarShape:setGuitarShape, materializeLegacyGuitars:materializeLegacyGuitars,")
rep("    // Пул рулонов (волна-4): сейв нового формата несёт pool/refs —", "    if(window.StruChordTracks)window.StruChordTracks.materializeLegacyGuitars();\n\n    // Пул рулонов (волна-4): сейв нового формата несёт pool/refs —")

rep("        if (inst==='guitar' && src.instrument==='guitar' && c) {\n          var shape=isMain(src.id)?(guitarShapeFromEvent(ev)||defaultGuitarShape(c,key,ev,true)):(guitarShape(src.id,key,c)||defaultGuitarShape(c,key,null,false));", """        if (inst==='guitar' && c) {
          var shape=src.instrument==='guitar' ? (isMain(src.id)?(guitarShapeFromEvent(ev)||defaultGuitarShape(c,key,ev,true)):(guitarShape(src.id,key,c)||defaultGuitarShape(c,key,null,false))) : defaultGuitarShape(c,key,null,false);""")

rep("        var prior=oldMain && oldMain.instrument==='guitar' ? guitarShapeFromEvent(ev) : null;", "        var prior=oldMain && oldMain.instrument==='guitar' ? (guitarShapeFromEvent(ev)||defaultGuitarShape(ev.chord,key,ev,true)) : null;")
rep("  function setGuitarShape(id,key,chord,shape,barreOff,fingers) {", """  function activeGuitarInfo(cell,chord) {
    var t=findTrack(state.activeTrackId), secondary=!!(t && t.instrument==='guitar' && !isMain(t.id));
    return secondary ? {id:t.id,shape:guitarShape(t.id,cell,chord)} : null;
  }
  function setGuitarShape(id,key,chord,shape,barreOff,fingers) {""")
rep("guitarShape:guitarShape, setGuitarShape:setGuitarShape, materializeLegacyGuitars:materializeLegacyGuitars,", "guitarShape:guitarShape, activeGuitarInfo:activeGuitarInfo, setGuitarShape:setGuitarShape, materializeLegacyGuitars:materializeLegacyGuitars,")
rep("  const hoverT=window.StruChordTracks, hoverState=hoverT && hoverT.state(), hoverTrack=hoverState && hoverState.tracks.find(t=>t.id===hoverState.activeTrackId);\n  const hoverOwn=hoverTrack && hoverTrack.instrument==='guitar' && hoverTrack.id!==hoverState.mainTrackId;\n  const hoverChoice=hoverOwn && hoverT.guitarShape(hoverTrack.id,secId+':'+wrapper.dataset.square+':'+wrapper.dataset.ei,chord);", """  const hoverT=window.StruChordTracks;
  const hoverInfo=hoverT && hoverT.activeGuitarInfo(secId+':'+wrapper.dataset.square+':'+wrapper.dataset.ei,chord);
  const hoverOwn=!!hoverInfo, hoverChoice=hoverInfo && hoverInfo.shape;""")

rep("  function defaultGuitarShape(chord,cell,ev,legacy) {\n    var f=findEvent(cell,null), sec=f && f.sec, key=sec && sec.key || currentKey();", "  function defaultGuitarShape(chord,cell,ev,legacy,f) {\n    f=f||findEvent(cell,null); var sec=f && f.sec, key=sec && sec.key || currentKey();")
rep("var shape=defaultGuitarShape(chord,cell,ev,true);if(shape)t.voicings[cell]=shape;", "var shape=defaultGuitarShape(chord,cell,ev,true,{sec:sec,sq:sq,ei:ei});if(shape)t.voicings[cell]=shape;")
rep("defaultGuitarShape(c,key,ev,true)):(guitarShape(src.id,key,c)||defaultGuitarShape(c,key,null,false))) : defaultGuitarShape(c,key,null,false);", "defaultGuitarShape(c,key,ev,true,{sec:sec,sq:sq,ei:ei})):(guitarShape(src.id,key,c)||defaultGuitarShape(c,key,null,false,{sec:sec,sq:sq,ei:ei}))) : defaultGuitarShape(c,key,null,false,{sec:sec,sq:sq,ei:ei});")
rep("guitarShapeFromEvent(ev)||defaultGuitarShape(ev.chord,key,ev,true)) : null;", "guitarShapeFromEvent(ev)||defaultGuitarShape(ev.chord,key,ev,true,{sec:sec,sq:sq,ei:ei})) : null;")

rep("  const ownCell=secId+':'+squareId+':'+eventIndex;\n  const ownChoice=", "  const ownCell=secId+':'+squareId+':'+eventIndex;\n  tooltipEl.dataset.b39OwnGuitar=ownTooltip ? String(activeGuitar.id) : '';\n  const ownChoice=")
rep("      const editBtn = e.target.closest('.tooltip-edit-btn');\n\n      if (leftBtn || rightBtn) {", "      const editBtn = e.target.closest('.tooltip-edit-btn');\n      if(ownTooltip && StruChordTracks.state().activeTrackId!==activeGuitar.id)return;\n\n      if (leftBtn || rightBtn) {")
rep("          if (oldCacheKey && oldCurrentShape) {\n            // 0.697:", "          if (oldCacheKey && oldCurrentShape && !tooltip.dataset.b39OwnGuitar) {\n            // 0.697:")

rep("      chords: {}, voicings: {}, patterns: {},\n      keyboardSize: null,", "      chords: {}, voicings: {}, patterns: {}, guitarShapes: {},\n      keyboardSize: null,")
rep("          if (inst==='guitar' && b39IsObj(v) && Array.isArray(v.shape)) return cleanGuitarShape(v);\n", "")
rep("        patterns: sanitizeMap(raw.patterns, validKeys, patternValue, false, true),\n", "        patterns: sanitizeMap(raw.patterns, validKeys, patternValue, false, true),\n        guitarShapes: sanitizeMap(raw.guitarShapes, validKeys, cleanGuitarShape, false, false),\n")
rep("return !Object.keys(t.chords).length && !Object.keys(t.voicings).length && !Object.keys(t.patterns).length && !Object.keys(t.bassRoles || {}).length && !t.linkedVoicings;", "return !Object.keys(t.chords).length && !Object.keys(t.voicings).length && !Object.keys(t.patterns).length && !Object.keys(t.guitarShapes || {}).length && !Object.keys(t.bassRoles || {}).length && !t.linkedVoicings;")
rep("        var v=t.voicings[cell];\n        if(v && Array.isArray(v.shape))", "        var v=t.guitarShapes[cell];\n        if(v && Array.isArray(v.shape))")
rep("if(shape)t.voicings[cell]=shape;", "if(shape)t.guitarShapes[cell]=shape;")
rep("      if (t.voicings[key] && typeof t.voicings[key] === 'object' && !sameChord(t.voicings[key].chord,cleaned)) delete t.voicings[key];", """      if (t.voicings[key] && typeof t.voicings[key] === 'object' && !sameChord(t.voicings[key].chord,cleaned)) delete t.voicings[key];
      if (t.guitarShapes[key] && !sameChord(t.guitarShapes[key].chord,cleaned)) delete t.guitarShapes[key];""")
rep("if(t.instrument==='guitar' && !t.voicings[key]){var choice=defaultGuitarShape(cleaned,key,null,false);if(choice)t.voicings[key]=choice;}", "if(t.instrument==='guitar' && !t.guitarShapes[key]){var choice=defaultGuitarShape(cleaned,key,null,false);if(choice)t.guitarShapes[key]=choice;}")
rep("var t=findTrack(id), v=t && t.voicings[key];\n    if(!t || t.instrument!=='guitar' || !v || !Array.isArray(v.shape)", "var t=findTrack(id), v=t && t.guitarShapes[key];\n    if(!t || t.instrument!=='guitar' || !v || !Array.isArray(v.shape)")
rep("return dispatch('b39/guitar-shape',function(){t.voicings[key]=val;return true;});", "return dispatch('b39/guitar-shape',function(){t.guitarShapes[key]=val;return true;});")
rep("copiedShapes.forEach(function(pair){t.voicings[pair[0]]=pair[1];});", "copiedShapes.forEach(function(pair){t.guitarShapes[pair[0]]=pair[1];});")
rep("if(prior)oldMain.voicings[key]=prior;\n        var incoming=newMain.instrument==='guitar' ? cleanGuitarShape(newMain.voicings[key]) : null;", "if(prior)oldMain.guitarShapes[key]=prior;\n        var incoming=newMain.instrument==='guitar' ? cleanGuitarShape(newMain.guitarShapes[key]) : null;")
rep("          delete newMain.voicings[key];", "          delete newMain.guitarShapes[key];")

rep("      if(!i || t.instrument!=='guitar' || t.guitarShapesVersion===1)return;", "      if(t.instrument!=='guitar' || t.guitarShapesVersion===1)return;\n      if(!i){t.guitarShapesVersion=1;return;}")
rep("        if(v && Array.isArray(v.shape)){if(!v.tuning)v.tuning=typeof tuningKeySuffix==='function'?tuningKeySuffix():'';return;}", "        if(v && Array.isArray(v.shape))return;")


rep("if(ownTooltip && StruChordTracks.state().activeTrackId!==activeGuitar.id)return;", "if(activeState && StruChordTracks.state().activeTrackId!==activeState.activeTrackId)return;")
rep("n>=0 && n<=24);})) return null;", "n>=0 && n<=16);})) return null;")

p.write_text(s,encoding='utf-8')

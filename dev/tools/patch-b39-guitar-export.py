#!/usr/bin/env python3
"""Экспорт B-39 гитар по форме и строю, применить к 0.756."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 if s.count(a)!=1: raise SystemExit(f'Expected 1, got {s.count(a)}: {a[:130]!r}')
 s=s.replace(a,b,1)
rep("//  1. Одна синтетическая «партия» на каждую дорожку B-39. Ноты берутся из\n//     КАНОНИЧЕСКОЙ формулы (STAGE 0), позиции (STAGE 4) и рисунка\n//     аккомпанимента (STAGE 5) — то есть из того же самого, что звучит\n//     в приложении. Призрачные ячейки, M/S и громкость уважаются.", "//  1. Одна синтетическая партия на дорожку B-39. Клавиши используют\n//     собственное расположение и аккомпанемент, гитары — форму, строй\n//     и гитарный ритм. Призрачные ячейки, M/S и громкость уважаются.")
rep("// R12: в этом блоке НЕТ гитарных аппликатур, струн, ладов и getChordNotes.\n// Абсолютные высоты берутся из формулы; гитарный путь приложения не тронут.", "// Гитарные струны и лады берутся из формы дорожки; клавиши остаются\n// абсолютными высотами. Звуковой планировщик и данные песни не меняются.")
rep("    swingWrittenAsStraight: 0, gp5Unassigned: 0 };", "    swingWrittenAsStraight: 0, gp5Unassigned: 0, guitarMissingShape: 0, guitarEarlySteps: 0, guitarBrush: 0, guitarCells: 0, guitarOwnMeter: 0, guitarDead: 0 };")
rep("    stats.skippedRecorded = 0; stats.skippedMuted = 0; stats.outOfRange = 0; stats.gp5Unassigned = 0;", "    stats.skippedRecorded = 0; stats.skippedMuted = 0; stats.outOfRange = 0; stats.gp5Unassigned = 0; stats.guitarMissingShape = 0; stats.guitarEarlySteps = 0; stats.guitarBrush = 0; stats.guitarCells = 0; stats.guitarOwnMeter = 0; stats.guitarDead = 0; stats.snapped = 0;")
needle="  // ---------- Сборка синтетических партий ----------"
rep(needle, '''  // Гитара экспортируется струнами и ладами, а не выдуманной позицией
  // из формулы. Ритм повторяет выбор собственного/секционного рисунка и
  // фазы в schedulePatternForEvent; как и другие экспорты, без свинга.
  function guitarCellRoll(track, mainId, sec, sq, ev, ei, chord, win, globalTs, grid) {
    stats.guitarCells++;
    if(ev.timeSig && ev.timeSig!==(sec.timeSig||globalTs))stats.guitarOwnMeter++;
    var span=Math.max(0.0001,Number(ev.span)||1), scale=win.span/span;
    if (track.id===mainId && Array.isArray(ev.notes) && ev.notes.length) {
      return accompCleanNotes(ev.notes,span).map(function(n){return Object.assign({},n,{
        start:round4(win.start+n.start*scale),dur:round4(n.dur*scale),velocity:velocityOf(track)
      });});
    }
    var ctx={secId:sec.id,squareId:sq.id,eventIndex:ei,key:sec.key||globalKey,trackId:track.id};
    var shape=resolveShapeForScheduledChord(chord,ctx).shape;
    if(!Array.isArray(shape) || shape.length!==6){stats.guitarMissingShape++;return [];}
    var roll=typeof songRhythmRolls!=='undefined' && songRhythmRolls ? rhythmRollWindowFor(sec.id,sq,ei,songRhythmRolls) : null;
    var own=roll || ev.strumPattern || null;
    var pattern=own || getEffectiveStrumPattern(null,sq,sec);
    var sub=pattern ? Math.max(1,pattern.subdivision||1) : 1;
    var valid=pattern && Array.isArray(pattern.steps) && pattern.steps.length;
    if(valid && !own && (!Number.isInteger(pattern.steps.length/sub) || pattern.steps.length/sub<1))valid=false;
    var hits=[];
    function add(line,fret,at,dead,brush) {
      if(!Number.isInteger(line) || line<0 || line>=shape.length || !Number.isFinite(fret))return;
      hits.push({start:at,string:line,fret:fret,dead:!!dead,brush:brush||null});
    }
    function strum(at,dead,brush) {
      shape.forEach(function(fret,line){if(fret!=='x' && fret!==null && fret!==undefined && Number.isFinite(Number(fret)))add(line,Number(fret),at,dead,brush);});
    }
    if(!valid) {stats.guitarBrush++;strum(0,false,null);}
    else {
      var ts=getEffectiveTimeSigForEvent(ev,sec), off=getSquareEventOffsetUnits(sq,ei,ts),
        first=own ? 0 : Math.round((((off % (pattern.steps.length/sub))+(pattern.steps.length/sub))%(pattern.steps.length/sub))*sub),
        base=Math.round((off+(Number(pattern.gridPhase)||0))*sub), steps=Math.max(1,Math.round(span*sub));
      for(var i=0;i<steps;i++){
        var rel=(base+i)/sub-off, symbol=pattern.steps[(first+i)%pattern.steps.length];
        if(rel>=span-1e-9)continue;
        if(rel < -1e-9){stats.guitarEarlySteps++;continue;}
        var at=Math.max(0,rel)*scale;
        if(pattern.mode==='pick' || (pattern.mode==='mixed' && (Array.isArray(symbol) || typeof symbol==='number'))) {
          var strings=resolvePickStepStrings(symbol,shape,chord);
          strings.forEach(function(num){var line=6-Number(num), fret=shape[line];
            add(line,fret==='x'||fret===null||fret===undefined ? 0 : Number(fret),at,false,null);});
        } else if(symbol==='D' || symbol==='U') {stats.guitarBrush++;strum(at,false,symbol==='D'?'down':'up');}
        else if(symbol==='X') {stats.guitarDead++;strum(at,true,null);}
      }
    }
    var onsets=Array.from(new Set(hits.map(function(h){return round4(h.start);}))).sort(asc);
    return hits.map(function(h){
      var next=onsets.find(function(t){return t>h.start+1e-9;});
      var length=Math.max(.05,(next===undefined?win.span:next)-h.start);
      if(h.dead)length=Math.min(length,scale/sub);
      var start=win.start+h.start;
      if(grid){var a=snap4(start),d=Math.max(.25,snap4(length));if(a!==start||d!==length)stats.snapped++;start=a;length=d;}
      return {start:round4(start),dur:round4(length),string:h.string,fret:h.fret,velocity:velocityOf(track),
        ...(h.dead ? {dead:true} : {}),...(h.brush ? {brush:h.brush} : {})};
    });
  }

''' + needle)
rep("            if (Array.isArray(ev.notes) && ev.notes.length && !(isKeys && T.exactNotes(track.id,cell,chord))) { stats.skippedRecorded++; continue; }\n            if (!chord) { stats.skippedGhost++; continue; }\n            var win = windowUnits(sec, sq, ei, ts);", """            if (!chord) { stats.skippedGhost++; continue; }
            var win = windowUnits(sec, sq, ei, ts);
            if(!isKeys){
              var guitar=guitarCellRoll(track,st.mainTrackId,sec,sq,ev,ei,chord,win,globalTs,grid);
              guitar.forEach(function(n){if(stats.notes<MAX_NOTES){tabList.push(n);stats.notes++;}});
              continue;
            }""")
rep("        if (gp5 && list.length) {", "        if (gp5 && isKeys && list.length) {")
rep("        if (gp5 && tabList.length) rolls[String(sec.id)] = tabList;", "        if (tabList.length) rolls[String(sec.id)] = tabList;")
rep("      if (gp5) {\n        // GP5-писатель умеет только струны:", """      if (!isKeys) {
        out.push(Object.assign({},base,{instrument:'guitar',viewMode:'tab',strings:gpExportSongTuning(songData),
          capo:Number(songData.capo)||0,rolls:rolls,pitchRolls:{}}));
      } else if (gp5) {
        // GP5-писатель умеет только струны:""")
rep("        if (opts.gp5 && stats.gp5Unassigned && typeof gpExportLoss === 'function') {", """        if (stats.guitarCells && typeof gpExportLoss === 'function') {
          gpExportLoss(report,'Гитара: длительности нот записаны приблизительно, без естественного затухания струн');
        }
        if (stats.guitarOwnMeter && typeof gpExportLoss === 'function') {
          gpExportLoss(report,'Гитара: собственный размер ячейки перенесён приближённо в размер секции',stats.guitarOwnMeter);
        }
        if (stats.guitarBrush && typeof gpExportLoss === 'function') {
          gpExportLoss(report,'Гитара: направление и разнос струн удара не перенесены; ноты записаны одновременно',stats.guitarBrush);
        }
        if (stats.guitarDead && typeof gpExportLoss === 'function') {
          gpExportLoss(report,'Гитара: шумовой удар X заменён приближёнными заглушёнными нотами',stats.guitarDead);
        }
        if (stats.guitarMissingShape && typeof gpExportLoss === 'function') {
          gpExportLoss(report,'Гитара: нет формы для аккорда, ячейка не экспортирована',stats.guitarMissingShape);
        }
        if (stats.guitarEarlySteps && typeof gpExportLoss === 'function') {
          gpExportLoss(report,'Гитара: удар перед началом ячейки не экспортирован',stats.guitarEarlySteps);
        }
        if (opts.gp5 && stats.gp5Unassigned && typeof gpExportLoss === 'function') {""")
rep("""    const data = window.StruChordExport
      ? window.StruChordExport.withTracks(serializeCurrentSong({ includeGpAssetData: false }))
      : serializeCurrentSong({ includeGpAssetData: false });
    const report = { format: 'MIDI (.mid), SMF format 1', transferred: [], losses: [], fileName: gpExportFileBase(data) + '.mid' };""", """    const raw = serializeCurrentSong({ includeGpAssetData: false });
    const report = { format: 'MIDI (.mid), SMF format 1', transferred: [], losses: [], fileName: gpExportFileBase(raw) + '.mid' };
    const data = window.StruChordExport ? window.StruChordExport.withTracks(raw,{report}) : raw;""")
p.write_text(s,encoding='utf-8')

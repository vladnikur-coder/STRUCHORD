#!/usr/bin/env python3
"""Inject an experimental note runtime only into a temporary candidate."""
from pathlib import Path
import sys
p=Path(sys.argv[1]);s=p.read_text(encoding='utf-8');root=Path(__file__).resolve().parents[1]/'prototypes'
def module(name,req):
 src=(root/name).read_text(encoding='utf-8')
 return '(function(){let module={exports:{}},require='+req+';\n'+src+'\nreturn module.exports;})()'
hand=module('keyboard-hand-voicings.js','function(){throw Error("unexpected require")}')
perf=module('keyboard-performance.js','function(){return hand}')
section=module('keyboard-section-adapter.js','function(){return perf}')
bridge=module('keyboard-runtime-bridge.js','function(){return section}')
draft=module('keyboard-note-draft.js','function(){throw Error("unexpected require")}')
renderer=module('keyboard-note-render.js','function(){return draft}')
bundle="\n(function(){const hand="+hand+",perf="+perf+",section="+section+",bridge="+bridge+",draft="+draft+",renderer="+renderer+";window.__keyModules={bridge,draft,renderer};})();\n"+(root/'keyboard-live-candidate.js').read_text(encoding='utf-8')+'\n'+(root/'keyboard-note-editor-candidate.js').read_text(encoding='utf-8')+'\n'
def replace(old,new):
 global s
 if s.count(old)!=1:raise SystemExit('expected one match: '+repr(old[:100]))
 s=s.replace(old,new,1)
replace('// B-39: выбор жанров и предварительный план автоаккомпанемента.',bundle+'// B-39: выбор жанров и предварительный план автоаккомпанемента.')
replace("  function plan(o) {\n    o = o || {};", "  function plan(o) {\n    o = o || {};\n    var individual=HOST.StruChordNoteCandidate && HOST.StruChordNoteCandidate.plan(o);if(individual)return individual;")
replace("      if (activeIsKeys()) {\n        setEditorScope(scope, sectionId, squareId, eventIndex);", "      if (activeIsKeys()) {\n        if(!HOST.__b39NoteLegacy && HOST.StruChordNoteEditor && HOST.StruChordNoteEditor.open(scope,sectionId,squareId,eventIndex))return undefined;\n        setEditorScope(scope, sectionId, squareId, eventIndex);")
replace("...(typeof raw.swing==='boolean'?{swing:raw.swing}:{})};", "...(typeof raw.swing==='boolean'?{swing:raw.swing}:{}),...(raw.engine==='notes-v1'?{engine:'notes-v1'}:{})};")
replace("managed:managed,autoBass:true,swing:swing.checked};", "managed:managed,autoBass:true,swing:swing.checked,engine:'notes-v1'};")
replace("var pattern=makePattern(sec,cfg.primary,cfg.secondary,opts); return !!pattern && T().setPattern(cfg.trackId,'s:'+sec.id,pattern);", """var pattern=makePattern(sec,cfg.primary,cfg.secondary,opts); if(!pattern)return false;
    var part=cfg.engine==='notes-v1' && HOST.StruChordNoteCandidate ? HOST.StruChordNoteCandidate.prepare(sec,cfg,HOST.StruChordNoteCandidate.seedFor(sec,cfg.trackId)) : null;
    if(part && !part.ok){if(HOST.showToast)HOST.showToast('Не удалось обновить клавишную партию');return false;}
    if(part)HOST.StruChordNoteCandidate.commit(cfg.trackId,part);return T().setPattern(cfg.trackId,'s:'+sec.id,pattern);""")
replace("      return true;\n    });\n  }\n  function sameChord(a, b)", """      if(state.autoAccomp && state.autoAccomp.engine==='notes-v1' && state.autoAccomp.trackId===id && HOST.StruChordNoteCandidate){
        var pos=findEvent(key,null);if(pos && state.autoAccomp.managed[String(pos.sec.id)]){
          HOST.StruChordNoteCandidate.refreshManaged(pos.sec,id);
        }
      }
      return true;
    });
  }
  function sameChord(a, b)""")
replace("""  songStore.dispatch('section/bpm', () => {
    sec.bpm = bpm || null;
  }, { quiet: true });""", """  songStore.dispatch('section/bpm', () => {
    sec.bpm = bpm || null;
    if(window.StruChordNoteCandidate)window.StruChordNoteCandidate.refreshManaged(sec);
  }, { quiet: true,history:'atomic' });""")
replace("""    sq.customBeats = total;
  }, { quiet: true });""", """    sq.customBeats = total;
    if(window.StruChordNoteCandidate)window.StruChordNoteCandidate.refreshManaged(sec);
  }, { quiet: true,history:'atomic' });""")
replace("""  return setTrackField(id, 'keyboardSize', size === null ? null : n, 'b39/track-keyboard-size');""", """  var track=findTrack(id);if(!track)return false;
    return dispatch('b39/track-keyboard-size',function(){track.keyboardSize=size===null?null:n;
      if(HOST.StruChordNoteCandidate)runtimeSections().forEach(function(sec){HOST.StruChordNoteCandidate.refreshManaged(sec,id);});return true;});""")
replace("""  el.value = v;
  // Масштаб ленты считается от темпа""", """  el.value = v;
  if(window.StruChordNoteCandidate && window.StruChordTracks && window.StruChordTracks.state().autoAccomp && window.StruChordTracks.state().autoAccomp.engine==='notes-v1')
    songStore.dispatch('b39/auto-tempo',()=>sections.filter(sec=>!sec.bpm).forEach(sec=>window.StruChordNoteCandidate.refreshManaged(sec)));
  // Масштаб ленты считается от темпа""")
replace("""    gpExportLoss(report, 'Исполнительский свинг аккомпанемента не кодируется: записан письменный ритм');""", """    gpExportLoss(report, 'Свинг шаговых рисунков не кодируется: записан письменный ритм');
    if(window.StruChordTracks && window.StruChordTracks.state().tracks.some(t=>Object.values(t.patterns||{}).some(p=>p && p.type==='experimental-notes-v1')))
      gpExportLoss(report, 'Ноты клавишной партии: время и длительность в Guitar Pro могут быть округлены к нотной сетке');""")
replace("""    gpExportLoss(report, 'MIDI не хранит аппликатуры, номера струн, звук синтеза, исполнительский свинг, EQ, реверберацию и оформление');""", """    gpExportLoss(report, 'MIDI не хранит аппликатуры, номера струн, звук синтеза, настройки свинга, EQ, реверберацию и оформление');
    if(window.StruChordTracks && window.StruChordTracks.state().tracks.some(t=>Object.values(t.patterns||{}).some(p=>p && p.type==='experimental-notes-v1')))
      gpExportLoss(report, 'MIDI: временные сдвиги клавишных нот записаны как время атак');""")
replace("function stepsFor(track, cell, sec, sq, ev, ei, chord, key, range, notes, span, ts) {", "function stepsFor(track, cell, sec, sq, ev, ei, chord, key, range, notes, span, ts, gp5Written) {")
replace("""          noSwing: true
        });
        if (steps && steps.length) return steps;""", """          noSwing: true, gp5Written: !!gp5Written
        });
        if (steps && steps.length) return steps;""")
replace("var steps = stepsFor(track, cell, sec, sq, ev, ei, chord, secKey, range, notes, span, ts);", "var steps = stepsFor(track, cell, sec, sq, ev, ei, chord, secKey, range, notes, span, ts, gp5);")
replace("""      var commit = function () {
        if (resetPending) clearScopes();""", """      var commit = function () {
        var transition=HOST.__b39NoteLegacy;
        if(transition && transition.trackId===editingTrackId && (resetPending || JSON.stringify(draft)!==originalDraft)){
          var map=currentTrack.patterns||{};Object.keys(map).forEach(function(k){if(map[k] && map[k].type==='experimental-notes-v1' && (transition.cell ? k===transition.cell : k.indexOf(String(transition.sectionId)+':')===0))T.clearPattern(editingTrackId,k);});
        }
        if (resetPending) clearScopes();""")
replace("""  function closePanel() {
    stopPreview(); selectedStep = null;""", """  function closePanel() {
    HOST.__b39NoteLegacy=null;stopPreview(); selectedStep = null;""")
replace("HOST.songStore.dispatch('b39/accomp-edit', commit);", "HOST.songStore.dispatch('b39/accomp-edit', commit, {history:'atomic'});")
replace("""  DOM.rootKey.value = nk;
  songStore.dispatch('song/transpose', () => {""", """  DOM.rootKey.value = nk;
  if(window.StruChordNoteCandidate && window.StruChordTracks && !window.StruChordNoteCandidate.canMoveManual(sections,st,window.StruChordTracks.state().mainTrackId)){DOM.rootKey.value=ck;showToast('Транспонирование отменено: ручная нота выйдет за диапазон MIDI');return;}
  songStore.dispatch('song/transpose', () => {""")
replace("""  if(window.StruChordTracks) window.StruChordTracks.moveMainExactNotes(st);
  });""", """  if(window.StruChordTracks) window.StruChordTracks.moveMainExactNotes(st);
  if(window.StruChordNoteCandidate && window.StruChordTracks){window.StruChordNoteCandidate.moveManual(sections,st,window.StruChordTracks.state().mainTrackId);sections.forEach(sec=>window.StruChordNoteCandidate.refreshManaged(sec));}
  });""")
replace("""  const delta = shift - prevShift;
  let newKey""", """  const delta = shift - prevShift;
  if(window.StruChordNoteCandidate && window.StruChordTracks && !window.StruChordNoteCandidate.canMoveManual([sec],delta,window.StruChordTracks.state().mainTrackId)){showToast('Модуляция отменена: ручная нота выйдет за диапазон MIDI');return;}
  let newKey""")
replace("""    if(window.StruChordTracks) window.StruChordTracks.moveMainExactNotes(delta,sec.id);
  }, { quiet: true });""", """    if(window.StruChordTracks) window.StruChordTracks.moveMainExactNotes(delta,sec.id);
    if(window.StruChordNoteCandidate && window.StruChordTracks){window.StruChordNoteCandidate.moveManual([sec],delta,window.StruChordTracks.state().mainTrackId);window.StruChordNoteCandidate.refreshManaged(sec);}
  }, { quiet: true });""")
replace("""      if (semitones !== 0) {
        songStore.dispatch('key/transpose', () => {""", """      if (semitones !== 0) {
        if(window.StruChordNoteCandidate && window.StruChordTracks && !window.StruChordNoteCandidate.canMoveManual(sections,semitones,window.StruChordTracks.state().mainTrackId)){DOM.rootKey.value=oldGlobalKey;processingKeyChange=false;showToast('Транспонирование отменено: ручная нота выйдет за диапазон MIDI');return;}
        songStore.dispatch('key/transpose', () => {""")
replace("""        if(window.StruChordTracks) window.StruChordTracks.moveMainExactNotes(semitones);
        });""", """        if(window.StruChordTracks) window.StruChordTracks.moveMainExactNotes(semitones);
        if(window.StruChordNoteCandidate && window.StruChordTracks){window.StruChordNoteCandidate.moveManual(sections,semitones,window.StruChordTracks.state().mainTrackId);sections.forEach(sec=>window.StruChordNoteCandidate.refreshManaged(sec));}
        });""")
# Other key-only branches: they change spelling/context but not pitches.
old_key="""    globalKey = newGlobalKey;
    applyEnharmonicCorrectionToAll();
    });"""
new_key="""    globalKey = newGlobalKey;
    applyEnharmonicCorrectionToAll();
    if(window.StruChordNoteCandidate)sections.forEach(sec=>window.StruChordNoteCandidate.refreshManaged(sec));
    });"""
if s.count(old_key)!=2: raise SystemExit('unexpected key-only branches')
s=s.replace(old_key,new_key)
replace("""        globalKey = newGlobalKey;
        applyEnharmonicCorrectionToAll();
        });
        requestRender();""", """        globalKey = newGlobalKey;
        applyEnharmonicCorrectionToAll();
        if(window.StruChordNoteCandidate)sections.forEach(sec=>window.StruChordNoteCandidate.refreshManaged(sec));
        });
        requestRender();""")
replace("""  songStore.dispatch('cell/timesig', () => {
    if (targetTimeSig !== oldOwnTimeSig) {""", """  let noteMeterOk=true;
  songStore.dispatch('cell/timesig', () => {
    if (targetTimeSig !== oldOwnTimeSig) {""")
replace("""      ev.timeSig = newTimeSig;
    }
  }, { quiet: true });
  // B-20: окно в новых единицах размера""", """      ev.timeSig = newTimeSig;
    }
    if(window.StruChordNoteCandidate)noteMeterOk=window.StruChordNoteCandidate.refreshManaged(sec);
  }, { quiet: true,history:'atomic' });
  // B-20: окно в новых единицах размера""")
replace("""  showToast(`Размер ячейки: ${ev.timeSig || 'глобальный'}`);""", """  showToast(noteMeterOk && window.StruChordNoteCandidate && window.StruChordNoteCandidate.manualTimingConflict(sec) ? 'Размер изменён: ручная нотная партия сохранена, но её длительность нужно согласовать' : noteMeterOk ? `Размер ячейки: ${ev.timeSig || 'глобальный'}` : 'Размер изменён, но авто не поддерживает смешанный размер секции: проверьте клавишную партию');""")
replace("""  showToast(`Размер ячейки изменён на ${newSpan} доли (всего в квадрате: ${total})`);""", """  showToast(window.StruChordNoteCandidate && window.StruChordNoteCandidate.manualTimingConflict(sec) ? 'Размер изменён: ручная нотная партия сохранена, но её длительность нужно согласовать' : `Размер ячейки изменён на ${newSpan} доли (всего в квадрате: ${total})`);""")
# Generated notes are planned and validated before touching the song.
replace("      HOST.songStore.dispatch('b39/auto-apply',function(){\n        selected.forEach", """      var prepared=selected.map(function(sec){return {sec:sec,result:HOST.StruChordNoteCandidate.prepare(sec,next,HOST.StruChordNoteCandidate.seedFor(sec,next.trackId))};});
      if(prepared.some(function(x){return !x.result.ok;})){if(HOST.showToast)HOST.showToast('Не удалось создать партию: проверьте аккорды, размер и диапазон');return;}
      var keys=new Set(Object.keys(track.patterns));prepared.forEach(function(x){x.result.clear.forEach(function(k){keys.delete(k);});x.result.writes.forEach(function(w){keys.add(w.key);});keys.add('s:'+x.sec.id);});
      if(keys.size>4096){if(HOST.showToast)HOST.showToast('Слишком много рисунков на дорожке');return;}
      HOST.songStore.dispatch('b39/auto-apply',function(){
        prepared.forEach(function(x){HOST.StruChordNoteCandidate.commit(dialogTrack,x.result);});
        selected.forEach""")
# Hooks here are only a candidate. If generation fails, stale generated pitches
# are muted by the planner instead of being played against a new chord.
replace("      T.clearExactNotes(st.activeTrackId, posCtx.secId + ':' + (posCtx.sqId !== undefined ? posCtx.sqId : posCtx.squareId) + ':' + (posCtx.ei !== undefined ? posCtx.ei : posCtx.eventIndex));\n    }\n  }, { quiet: true });", """      T.clearExactNotes(st.activeTrackId, posCtx.secId + ':' + (posCtx.sqId !== undefined ? posCtx.sqId : posCtx.squareId) + ':' + (posCtx.ei !== undefined ? posCtx.ei : posCtx.eventIndex));
      const cfg=st.autoAccomp, sec=sections.find(s=>s.id===posCtx.secId);
      if(cfg && cfg.engine==='notes-v1' && sec && cfg.managed[String(sec.id)] && cfg.trackId===st.activeTrackId && window.StruChordNoteCandidate) {
        window.StruChordNoteCandidate.refreshManaged(sec,cfg.trackId);
      }
    }
  }, { quiet: true });""")
p.write_text(s,encoding='utf-8')

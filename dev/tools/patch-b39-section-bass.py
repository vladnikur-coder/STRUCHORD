#!/usr/bin/env python3
"""Применяется к 0.718: отдельная роль баса в секциях клавишной дорожки."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf8')
def rep(a,b):
 global s
 n=s.count(a)
 if n!=1: raise SystemExit(f'{n} совпадений: {a[:140]!r}')
 s=s.replace(a,b,1)
rep('        patterns: sanitizeMap(raw.patterns, validKeys, patternValue, false, true),\n        keyboardSize: size', '''        patterns: sanitizeMap(raw.patterns, validKeys, patternValue, false, true),
        ...(Object.keys(cleanBassRoles(raw.bassRoles, song.sections)).length ? {bassRoles:cleanBassRoles(raw.bassRoles, song.sections)} : {}),
        keyboardSize: size''')
rep('  function sanitizeTracks(rawTracks, validKeys, song) {', '''  // Роль баса — отдельная карта, не часть заменяемого рисунка.
  function cleanBassRoles(raw, secs) {
    var out={}, ids=new Set((Array.isArray(secs)?secs:[]).map(function(s){return String(s.id);}));
    if (!b39IsObj(raw)) return out;
    Object.keys(raw).slice(0,B39_LIMITS.MAX_CELL_ENTRIES).forEach(function(k){
      if (ids.has(k) && ['auto','bass','nobass'].indexOf(raw[k])>=0) out[k]=raw[k];
    });
    return out;
  }
  function sanitizeTracks(rawTracks, validKeys, song) {''')
rep('return {primary:raw.primary,secondary:secondary,trackId:trackId,managed:managed};','return {primary:raw.primary,secondary:secondary,trackId:trackId,managed:managed,...(raw.autoBass===true?{autoBass:true}:{})};')
rep("  function currentKey() {\n    try { return (typeof globalKey !== 'undefined' && globalKey) || 'C'; } catch (e) { return 'C'; }\n  }\n\n  function addTrack", '''  function bassRole(id,secId) {
    var t=findTrack(id); return t && t.bassRoles && t.bassRoles[String(secId)] || 'legacy';
  }
  function setBassRole(id,secId,mode) {
    var t=findTrack(id), key=String(secId);
    if(!t || t.instrument!=='keys' || !runtimeSections().some(function(s){return String(s.id)===key;}) || ['legacy','auto','bass','nobass'].indexOf(mode)<0) return false;
    if(bassRole(id,secId)===mode) return true;
    return dispatch('b39/section-bass',function(){
      if(mode==='legacy'){if(t.bassRoles){delete t.bassRoles[key];if(!Object.keys(t.bassRoles).length)delete t.bassRoles;}}
      else {if(!t.bassRoles)t.bassRoles={};t.bassRoles[key]=mode;}
      return true;
    });
  }
  function cloneBassRoles(from,to) {
    state.tracks.forEach(function(t){if(t.instrument==='keys')setBassRole(t.id,to,bassRole(t.id,from));});
  }
  function removeBassRoles(id) {
    state.tracks.forEach(function(t){if(t.bassRoles && t.bassRoles[String(id)]){
      delete t.bassRoles[String(id)];if(!Object.keys(t.bassRoles).length)delete t.bassRoles;
    }});
  }
  function currentKey() {
    try { return (typeof globalKey !== 'undefined' && globalKey) || 'C'; } catch (e) { return 'C'; }
  }

  function addTrack''')
rep('    patternFor: patternFor, clearPattern: clearPattern, setAutoAccomp: setAutoAccomp,','    patternFor: patternFor, clearPattern: clearPattern, setAutoAccomp: setAutoAccomp,\n    bassRole:bassRole, setBassRole:setBassRole, cloneBassRoles:cloneBassRoles, removeBassRoles:removeBassRoles,')
rep("    if (window.StruChordAuto) window.StruChordAuto.removeSection(id);", "    if (window.StruChordAuto) window.StruChordAuto.removeSection(id);\n    if (window.StruChordTracks) window.StruChordTracks.removeBassRoles(id);")
rep('  if (window.StruChordAuto) window.StruChordAuto.cloneSection(orig, cl);','  if (window.StruChordAuto) window.StruChordAuto.cloneSection(orig, cl);\n  if (window.StruChordTracks) window.StruChordTracks.cloneBassRoles(orig.id, cl.id);')
rep('return !Object.keys(t.chords).length && !Object.keys(t.voicings).length && !Object.keys(t.patterns).length;', 'return !Object.keys(t.chords).length && !Object.keys(t.voicings).length && !Object.keys(t.patterns).length && !Object.keys(t.bassRoles || {}).length;')
# Единая политика без изменения старых песен.
rep('  // ---------- Токены -> MIDI-ноты ----------', '''  function bassPolicy(trackId,sec,override) {
    var T=tracks(), mode=override===undefined && sec && T ? T.bassRole(trackId,sec.id) : override;
    if (['auto','bass','nobass'].indexOf(mode)<0) mode='legacy';
    // Это только подсказка: во вступлении, соло и завершении освобождаем низ.
    var include=mode!=='nobass' && !(mode==='auto' && sec && ['Intro','Solo','Outro'].indexOf(sec.type)>=0);
    return {mode:mode,include:include};
  }
  function sectionFromCell(key) {
    var id=String(key||'').split(':')[0];
    try { return sections.find(function(s){return String(s.id)===id;})||null; } catch(e) {return null;}
  }
  function stripBass(trackId,sec,notes,override) {
    var copy=Array.isArray(notes)?notes.slice():[];
    return !bassPolicy(trackId,sec,override).include ? copy.slice(1) : copy;
  }

  // ---------- Токены -> MIDI-ноты ----------''')
rep('    var bass = notes.length ? notes[0] : null;\n    var rh = notes.length > 1 ? notes.slice(1) : notes.slice();', '''    var omit=!bassPolicy(o.trackId,o.sec,o.bassMode).include;
    if(omit) { notes=notes.slice(1); if(Number.isFinite(low)) low+=12; }
    var bass = !omit && notes.length ? notes[0] : null;
    var rh = omit ? notes.slice() : (notes.length > 1 ? notes.slice(1) : notes.slice());''')
rep('    normalize: normalize, preset: preset, list: list, styles:', '    bassPolicy:bassPolicy, stripBass:stripBass, sectionFromCell:sectionFromCell,\n    normalize: normalize, preset: preset, list: list, styles:')
# Редактор: и сброс рисунка, и изменение роли в одной команде.
rep("draftLength = 4, presetGenre = null, originalDraft = null;", "draftLength = 4, presetGenre = null, originalDraft = null, bassSelect = null, bassRow = null, draftBassMode = 'legacy';")
rep("    var presets = el('div', 'pattern-presets');", '''    bassRow=el('label','b39-auto-select','Бас в этой секции');bassRow.id='b39BassRow';
    bassSelect=el('select','b39-acc-genre');bassSelect.id='b39BassMode';bassSelect.setAttribute('aria-label','Бас в этой секции');
    [['legacy','Как раньше'],['auto','Авто по типу секции'],['bass','С басом'],['nobass','Без баса']].forEach(function(pair){var op=el('option','',pair[1]);op.value=pair[0];bassSelect.appendChild(op);});
    bassSelect.addEventListener('change',function(){draftBassMode=bassSelect.value;if(previewStop)previewDraft();});bassRow.appendChild(bassSelect);
    bassRow.appendChild(el('span','b39-auto-note','Авто — подсказка по типу секции. Без баса басовые шаги станут паузами.'));panel.appendChild(bassRow);
    var presets = el('div', 'pattern-presets');''')
rep('        if (resetPending) clearScopes(); else apply();','        if (resetPending) clearScopes(); else apply();\n        if(current.scope===\'section\' && current.secId!=null) T.setBassRole(editingTrackId,current.secId,draftBassMode);')
rep('    var cfg = resolveForScope(); if (cfg) loadDraft(cfg); resetPending = false;', '''    var cfg = resolveForScope(); if (cfg) loadDraft(cfg); resetPending = false;
    draftBassMode=state && current.secId!=null ? T.bassRole(state.activeTrackId,current.secId) : 'legacy';
    if(bassSelect)bassSelect.value=draftBassMode;if(bassRow)bassRow.hidden=current.scope!=='section';''')
rep('{scope:current.scope, span:span, bpm:bpm, ts:current.ts, keyboardSize:T.track(state.activeTrackId).keyboardSize}', '{scope:current.scope, span:span, bpm:bpm, ts:current.ts, keyboardSize:T.track(state.activeTrackId).keyboardSize,sec:sec,bassMode:current.scope===\'section\'?draftBassMode:undefined}')
rep('      pattern:cfg, patternSource:opt.scope, noHighlight:true });', '      pattern:cfg, patternSource:opt.scope, sec:opt.sec, bassMode:opt.bassMode, noHighlight:true });')
# Транспорт планирует сырые ноты: Accomp.plan удаляет бас только один раз.
rep('      var level = HEADROOM / Math.sqrt(Math.max(1, notes.length));\n      notes.forEach(function (midi) { playNote(ctx, channel, midi, now, 0.55, level); });', '''      var acc=HOST.StruChordAccomp, sec=acc && acc.sectionFromCell(cell);
      if(acc && sec)notes=acc.stripBass(track.id,sec,notes);
      var level = HEADROOM / Math.sqrt(Math.max(1, notes.length));
      notes.forEach(function (midi) { playNote(ctx, channel, midi, now, 0.55, level); });''')
rep('    var notes = variants[idx];\n    var f = F.chordFormula(chordName, currentKey());\n    var bass = notes.length ? notes[0] : null;', '''    var notes = variants[idx], acc=HOST.StruChordAccomp, sec=acc && acc.sectionFromCell(o.cellKey);
    if(acc && sec)notes=acc.stripBass(trackId,sec,notes);
    var f = F.chordFormula(chordName, currentKey());
    var bass = (!sec || !acc || acc.bassPolicy(trackId,sec).include) && notes.length ? notes[0] : null;''')
rep('    var notes = variants.length ? variants[idx] : [];\n    var f = F.chordFormula(chord, currentKey());', '''    var notes = variants.length ? variants[idx] : [];
    var acc=HOST.StruChordAccomp, sec=acc && acc.sectionFromCell(lastCellKey);
    if(acc && sec)notes=acc.stripBass(active.track.id,sec,notes);
    var f = F.chordFormula(chord, currentKey());''')
rep("    var bass = notes.length ? notes[0] : null;\n    foot.textContent = 'Размер '", "    var bass = (!sec || !acc || acc.bassPolicy(active.track.id,sec).include) && notes.length ? notes[0] : null;\n    foot.textContent = 'Размер '")
# Предварительный план: решение видно, старые настройки не меняются молча.
rep("    if(!planBox)return;planBox.textContent=''; var first=primary.value, second=secondary.value;", "    if(!planBox)return;var prior={};Array.from(planBox.querySelectorAll('[data-bass-sec]')).forEach(function(n){prior[n.dataset.bassSec]=n.value;});var checks={};Array.from(planBox.querySelectorAll('input[data-sec]')).forEach(function(n){checks[n.dataset.sec]=n.checked;});planBox.textContent=''; var first=primary.value, second=secondary.value;")
rep("cb.dataset.sec=String(sec.id);cb.checked=!raw || isAuto;", "cb.dataset.sec=String(sec.id);cb.checked=Object.prototype.hasOwnProperty.call(checks,String(sec.id))?checks[String(sec.id)]:!raw || isAuto;")
rep('      row.appendChild(cb);row.appendChild(desc);planBox.appendChild(row);', '''      row.appendChild(cb);row.appendChild(desc);planBox.appendChild(row);
      var bass=element('select','b39-acc-genre');bass.dataset.bassSec=String(sec.id);bass.setAttribute('aria-label','Бас: '+sectionName(sec));
      [['legacy','Бас: как раньше'],['auto','Бас: авто ('+(['Intro','Outro','Solo'].indexOf(sec.type)>=0?'без баса':'с басом')+')'],['bass','Бас: оставить'],['nobass','Бас: убрать']].forEach(function(x){var op=element('option','',x[1]);op.value=x[0];bass.appendChild(op);});
      var saved=T().bassRole(dialogTrack,sec.id);bass.value=prior[String(sec.id)] || (saved!=='legacy'?saved:raw?'legacy':'auto');planBox.appendChild(bass);''')
rep("box.appendChild(element('div','b39-auto-note','Выберите жанры и проверьте план. Позже авто обновит рисунки при смене типа или размера секции; ручные правки защищены. Настройки ячеек сохраняются.'));", "box.appendChild(element('div','b39-auto-note','Проверьте рисунки и подсказки баса. Без баса басовые шаги станут паузами. Ручные рисунки защищены; настройки ячеек сохраняются.'));")
rep('      var next={primary:primary.value,secondary:secondary.value||null,trackId:dialogTrack,managed:managed};', '''      var bassChoices={};Array.from(planBox.querySelectorAll('[data-bass-sec]')).forEach(function(n){bassChoices[n.dataset.bassSec]=n.value;});
      var next={primary:primary.value,secondary:secondary.value||null,trackId:dialogTrack,managed:managed};
      if(selected.some(function(sec){return bassChoices[String(sec.id)]==='auto';}))next.autoBass=true;''')
rep("selected.forEach(function(sec){var pattern=makePattern(sec,next.primary,next.secondary);if(pattern){T().setPattern(dialogTrack,'s:'+sec.id,pattern);next.managed[String(sec.id)]=true;}});", "selected.forEach(function(sec){var pattern=makePattern(sec,next.primary,next.secondary);if(pattern){T().setPattern(dialogTrack,'s:'+sec.id,pattern);T().setBassRole(dialogTrack,sec.id,bassChoices[String(sec.id)]);next.managed[String(sec.id)]=true;}});")
rep("function addSection(sec){var cfg=auto();if(!cfg || !sec)return;var pattern=makePattern(sec,cfg.primary,cfg.secondary);if(!pattern)return;cfg.managed", "function addSection(sec){var cfg=auto();if(!cfg || !sec)return;var pattern=makePattern(sec,cfg.primary,cfg.secondary);if(!pattern)return;if(cfg.autoBass)T().setBassRole(cfg.trackId,sec.id,'auto');cfg.managed")
p.write_text(s,encoding='utf8');print('OK')

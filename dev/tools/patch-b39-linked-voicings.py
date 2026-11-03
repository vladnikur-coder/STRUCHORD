#!/usr/bin/env python3
"""B-39: опциональные обращения и движение голосов; применяется к 0.719."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf8')
def rep(a,b):
 global s
 n=s.count(a)
 if n!=1: raise SystemExit(f'{n} совпадений: {a[:150]!r}')
 s=s.replace(a,b,1)
rep("        ...(Object.keys(cleanBassRoles(raw.bassRoles, song.sections)).length ? {bassRoles:cleanBassRoles(raw.bassRoles, song.sections)} : {}),", "        ...(Object.keys(cleanBassRoles(raw.bassRoles, song.sections)).length ? {bassRoles:cleanBassRoles(raw.bassRoles, song.sections)} : {}),\n        ...(raw.linkedVoicings===true ? {linkedVoicings:true} : {}),")
rep('    repairMain();\n    return snapshot();\n  }\n  function isDefaultState()', '    repairMain();\n    if(HOST.StruChordKeys && HOST.StruChordKeys.clearLinkedCache) HOST.StruChordKeys.clearLinkedCache();\n    return snapshot();\n  }\n  function isDefaultState()')
rep('!Object.keys(t.bassRoles || {}).length;', '!Object.keys(t.bassRoles || {}).length && !t.linkedVoicings;')
rep('  function bassRole(id,secId) {', '''  function setLinkedVoicings(id,on) {
    var t=findTrack(id); if(!t || t.instrument!=='keys' || typeof on!=='boolean')return false;
    if(!!t.linkedVoicings===on)return true;
    return dispatch('b39/linked-voicings',function(){if(on)t.linkedVoicings=true;else delete t.linkedVoicings;return true;});
  }
  function clearVoicingChoice(id,chord,cell) {
    var t=findTrack(id);if(!t || !chord)return false;
    return dispatch('b39/voicing-auto',function(){delete t.voicings['v:'+chord];if(cell)delete t.voicings[cell];return true;});
  }
  function bassRole(id,secId) {''')
rep('    bassRole:bassRole, setBassRole:setBassRole, cloneBassRoles:cloneBassRoles, removeBassRoles:removeBassRoles,','    bassRole:bassRole, setBassRole:setBassRole, cloneBassRoles:cloneBassRoles, removeBassRoles:removeBassRoles,\n    setLinkedVoicings:setLinkedVoicings, clearVoicingChoice:clearVoicingChoice,')
rep("  var variantState = new Map();       // 'trackId|chord' -> индекс (runtime-кэш)", "  var variantState = new Map();       // 'trackId|chord' -> индекс (runtime-кэш)\n  var linkedCache = new Map(), linkedToggle = null, autoChoiceBtn = null;")
rep('.b39-keys-foot { margin-top: .35rem; font-size: .68rem; line-height: 1.4;', '.b39-keys-link { display:block; margin-top:.35rem; font-size:.72rem; }\n.b39-keys-reset { margin-top:.35rem; padding:.25rem .5rem; border:.0625rem solid var(--color-border-medium); border-radius:.4rem; background:var(--color-surface); color:inherit; font:inherit; font-size:.72rem; cursor:pointer; }\n.b39-keys-foot { margin-top: .35rem; font-size: .68rem; line-height: 1.4;')
# Простой набор обращений и линейное сопоставление голосов без перепрыгиваний.
rep('  /** Индекс выбранного варианта: из модели дорожки или runtime-кэш. */', '''  // Обращения одного и того же набора звуков, без изменения гармонии.
  // Отдельный бас оставляем вне сравнения голосов правой руки.
  function inversionCandidates(chord,key,range) {
    var basic=generateKeysVoicings(chord,key,range,null,{});
    if(!basic.length)return [];
    var bass=basic[0][0], pcs=[];
    basic[0].slice(1).forEach(function(n){var pc=mod12(n);if(pcs.indexOf(pc)<0)pcs.push(pc);});
    if(!pcs.length)return basic;
    var lo=Math.max(range.low+12,48), hi=Math.min(range.high,84), out=[], seen={};
    // В плотных расширенных аккордах сохраняем прежнее расположение, не
    // предполагая, какие ступени допустимо убрать.
    if(pcs.length>5 || hi<lo)return basic;
    for(var start=lo;start<=hi;start++) {
      var first=pcs.indexOf(mod12(start));if(first<0)continue;
      var rh=[start], last=start;
      for(var k=1;k<pcs.length;k++){
        var pc=pcs[(first+k)%pcs.length], next=last+1+mod12(pc-mod12(last+1));
        rh.push(next);last=next;
      }
      if(last>hi || last-start>16)continue;
      var notes=[bass].concat(rh), signature=notes.join(',');
      if(!seen[signature]){seen[signature]=true;out.push(notes);}
    }
    return out.length ? out : basic;
  }
  function motionCost(prev,next) {
    var a=prev.slice(1), b=next.slice(1), m=a.length,n=b.length, dp=[];
    for(var i=0;i<=m;i++){dp[i]=[];for(var j=0;j<=n;j++)dp[i][j]=Infinity;}
    dp[0][0]=0;
    for(var x=0;x<=m;x++)for(var y=0;y<=n;y++){
      if(x<m)dp[x+1][y]=Math.min(dp[x+1][y],dp[x][y]+12);
      if(y<n)dp[x][y+1]=Math.min(dp[x][y+1],dp[x][y]+12);
      if(x<m && y<n)dp[x+1][y+1]=Math.min(dp[x+1][y+1],dp[x][y]+Math.abs(a[x]-b[y]));
    }
    return dp[m][n];
  }
  function chooseLinked(candidates,prev,range) {
    if(!candidates.length)return null;
    var target=Math.max(range.low+12,Math.min(range.high-6,64)), best=null, score=Infinity;
    candidates.forEach(function(v){
      var hand=v.slice(1), center=hand.reduce(function(a,b){return a+b;},0)/Math.max(1,hand.length);
      var cost=(prev && prev.length ? motionCost(prev,v) : 0) + Math.abs(center-target)*0.01;
      if(cost<score){score=cost;best=v;}
    });return best;
  }
  function clearLinkedCache(){linkedCache.clear();}
  // Линейно обходим соседние ячейки внутри секции, с ограничением.
  // Кэш сбрасывается при любой команде песни и при загрузке/undo.
  function linkedSelection(trackId,cell) {
    var T=tracks(), t=T && T.track(trackId);
    if(!t || !t.linkedVoicings || !cell)return null;
    var secId=String(cell).split(':')[0], sec;
    try { sec=sections.find(function(s){return String(s.id)===secId;}); } catch(e) {return null;}
    if(!sec)return null;
    var cacheKey=String(trackId)+':'+secId, cache=linkedCache.get(cacheKey);
    if(!cache){
      cache={entries:{}, events:[], indexes:{}, next:0, prev:null, range:T.keyRange(trackId)};
      (sec.squares||[]).forEach(function(sq){(sq.events||[]).forEach(function(ev,ei){var k=T.cellKey(sec,sq,ei);cache.indexes[k]=cache.events.length;cache.events.push({sq:sq,ev:ev,ei:ei,cell:k});});});
      linkedCache.set(cacheKey,cache);
    }
    // Очень длинная секция после 2048 ячеек использует прежний алгоритм.
    while(cache.next<cache.events.length && cache.next<2048 && !cache.entries[cell]){
      var e=cache.events[cache.next++], chord=T.trackChord(trackId,e.cell,e.ev);
      if(!chord){cache.entries[e.cell]={empty:true};continue;}
      var key=sec.key || currentKey(), manual=t.voicings['v:'+chord];
      if(!Number.isInteger(manual))manual=t.voicings[e.cell];
      var variants=generateKeysVoicings(chord,key,cache.range,cache.prev,{}), notes=null;
      if(Number.isInteger(manual) && variants.length)notes=variants[manual%variants.length];
      else notes=chooseLinked(inversionCandidates(chord,key,cache.range),cache.prev,cache.range);
      if(notes && notes.length){cache.prev=notes.slice();cache.entries[e.cell]={chord:chord,notes:notes.slice(),manual:Number.isInteger(manual),index:Number.isInteger(manual)?manual%variants.length:null,count:variants.length};}
      else cache.entries[e.cell]={empty:true};
    }
    // За пределом лимита выбираем независимо от истории воспроизведения:
    // схема, звук и экспорт должны совпадать даже в длинной секции.
    if(!cache.entries[cell] && cache.indexes[cell]>=2048){
      var far=cache.events[cache.indexes[cell]], name=T.trackChord(trackId,cell,far.ev);
      var vi=t.voicings['v:'+name];if(!Number.isInteger(vi))vi=t.voicings[cell];
      var fallback=generateKeysVoicings(name,sec.key||currentKey(),cache.range,null,{});
      if(fallback.length)cache.entries[cell]={chord:name,notes:fallback[(Number.isInteger(vi)?vi:0)%fallback.length].slice(),manual:Number.isInteger(vi),index:vi,count:fallback.length,limited:true};
    }
    var result=cache.entries[cell];return result && !result.empty ? result : null;
  }

  /** Индекс выбранного варианта: из модели дорожки или runtime-кэш. */''')
rep('      back.ev.chord = back.chord;\n      if (back.fingering == null)', '      back.ev.chord = back.chord;\n      if (window.StruChordKeys && window.StruChordKeys.clearLinkedCache) window.StruChordKeys.clearLinkedCache();\n      if (back.fingering == null)')
# Компактная схема и панель берут ту же ячейку, что транспорт.
rep('    var notes = variants[idx], acc=HOST.StruChordAccomp, sec=acc && acc.sectionFromCell(o.cellKey);', '''    var linked=linkedSelection(trackId,o.cellKey);
    var notes = linked && linked.chord===chordName ? linked.notes.slice() : variants[idx], acc=HOST.StruChordAccomp, sec=acc && acc.sectionFromCell(o.cellKey);''')
rep("    panel.appendChild(head); panel.appendChild(body); panel.appendChild(foot);", '''    var linkRow=el('label','b39-keys-link');linkedToggle=el('input');linkedToggle.type='checkbox';linkedToggle.id='b39LinkedVoicings';
    linkRow.appendChild(linkedToggle);linkRow.appendChild(doc.createTextNode(' Плавные обращения внутри секции (для всей дорожки)'));
    linkedToggle.addEventListener('change',function(){var T=tracks(),a=activeTrack();if(T && a)T.setLinkedVoicings(a.track.id,linkedToggle.checked);renderPanel();});
    autoChoiceBtn=el('button','b39-keys-reset','Сбросить выбор позиции');autoChoiceBtn.type='button';autoChoiceBtn.id='b39LinkedReset';autoChoiceBtn.title='Вернуть авто для этого аккорда и текущей ячейки';
    autoChoiceBtn.addEventListener('click',function(){var T=tracks(),a=activeTrack();if(!T || !a || !lastChord)return;if(!HOST.confirm('Сбросить ручную позицию этого аккорда на всей дорожке и в текущей ячейке?'))return;variantState.delete(a.track.id+'|'+lastChord);T.clearVoicingChoice(a.track.id,lastChord,lastCellKey);renderPanel();});
    panel.appendChild(head);panel.appendChild(linkRow);panel.appendChild(autoChoiceBtn);panel.appendChild(body);panel.appendChild(foot);''')
rep('    var cur = variantIndex(active.track.id, lastChord, lastCellKey) % variants.length;', '''    var selection=linkedSelection(active.track.id,lastCellKey);
    var cur = selection && selection.chord===lastChord && !selection.manual ? (delta>0 ? -1 : 0) : variantIndex(active.track.id, lastChord, lastCellKey) % variants.length;''')
rep('    var range = T.keyRange(active.track.id);\n    if (sizeSel)', '''    var range = T.keyRange(active.track.id);
    if(linkedToggle)linkedToggle.checked=!!active.track.linkedVoicings;
    if(autoChoiceBtn)autoChoiceBtn.hidden=!active.track.linkedVoicings;
    if (sizeSel)''')
rep('    var notes = variants.length ? variants[idx] : [];\n    var acc=HOST.StruChordAccomp', '''    var selected=linkedSelection(active.track.id,lastCellKey);
    var notes = selected && selected.chord===chord ? selected.notes.slice() : (variants.length ? variants[idx] : []);
    var acc=HOST.StruChordAccomp''')
rep("    countEl.textContent = (idx + 1) + '/' + Math.max(1, variants.length);", "    countEl.textContent = selected && selected.chord===chord ? (selected.limited ? 'Обычная' : selected.manual ? 'Ручная' : 'Авто') : (idx + 1) + '/' + Math.max(1, variants.length);")
rep('    A.setVoicingProvider(function (chordName, key, range, prev, trackId) {\n      var variants', '''    A.setVoicingProvider(function (chordName, key, range, prev, trackId, cell) {
      var linked=linkedSelection(trackId,cell);if(linked && linked.chord===chordName)return linked.notes.slice();
      var variants''')
rep('      try { store.subscribe(function () { renderPanel(); }); } catch (e) {}\n    }\n    renderPanel();\n  }\n\n  var api = Object.freeze({\n    boot: boot, installRenderer:', '      try { store.subscribe(function () { clearLinkedCache(); renderPanel(); }); } catch (e) {}\n    }\n    renderPanel();\n  }\n\n  var api = Object.freeze({\n    boot: boot, installRenderer:')
rep('    variantIndex: variantIndex, setVariantIndex: setVariantIndex, stepVariant: stepVariant,', '    variantIndex: variantIndex, setVariantIndex: setVariantIndex, stepVariant: stepVariant,\n    linkedSelection:linkedSelection, clearLinkedCache:clearLinkedCache, inversionCandidates:inversionCandidates, motionCost:motionCost,')
# Информация о ячейке во всех путях звука и предпрослушивания.
rep('voicingProvider(chord, key, range, prev, track.id)', 'voicingProvider(chord, key, range, prev, track.id, cell)')
rep('voicingProvider(chord, effectiveKey, range, null, track.id)', 'voicingProvider(chord, effectiveKey, range, null, track.id, cell)')
rep('voicingProvider(chord, effectiveKey, range, null, trackId)', 'voicingProvider(chord, effectiveKey, range, null, trackId, opt.cell)')
rep("(sec.squares || []).some(function (q) { return (q.events || []).some(function (e, i) { chord = T.trackChord(state.activeTrackId, T.cellKey(sec,q,i),e); return !!chord; }); });", "(sec.squares || []).some(function (q) { return (q.events || []).some(function (e, i) { var candidate=T.cellKey(sec,q,i); chord = T.trackChord(state.activeTrackId, candidate,e); if(chord)cell=candidate; return !!chord; }); });")
rep('keyboardSize:T.track(state.activeTrackId).keyboardSize,sec:sec,bassMode:', 'keyboardSize:T.track(state.activeTrackId).keyboardSize,sec:sec,cell:cell,bassMode:')
# Общий расчёт в GP/MIDI при активном режиме; старый путь оставлен без изменений.
rep('  function voicingFor(track, chord, key) {\n    var K = keys(), T = tracks(), F = formula();', '''  function voicingFor(track, chord, key, cell) {
    var K = keys(), T = tracks(), F = formula();
    if(track.instrument==='keys' && K && track.linkedVoicings && cell) {
      var linked=K.linkedSelection(track.id,cell);if(linked && linked.chord===chord)return linked.notes.slice();
    }''')
rep('            var notes = voicingFor(track, chord, secKey);', '            var notes = voicingFor(track, chord, secKey, cell);')
# План включает видимый переключатель для всей дорожки. Старые настройки
# не меняются до явного применения плана; по умолчанию переключатель выключен.
rep("    var cfg=auto();if(cfg){primary.value=cfg.primary;secondary.value=cfg.secondary||'';}", '''    var linkRow=element('label','b39-auto-select'), link=element('input');link.type='checkbox';link.id='b39AutoLinked';link.checked=track.linkedVoicings===true;
    linkRow.appendChild(link);linkRow.appendChild(element('span','','Плавные обращения для всей дорожки (ручные позиции сохраняются)'));box.appendChild(linkRow);
    var cfg=auto();if(cfg){primary.value=cfg.primary;secondary.value=cfg.secondary||'';}''')
rep('        T().setAutoAccomp(next);\n      },{history:\'atomic\'});', "        T().setAutoAccomp(next);T().setLinkedVoicings(dialogTrack,link.checked);\n      },{history:'atomic'});")
p.write_text(s,encoding='utf8');print('OK')

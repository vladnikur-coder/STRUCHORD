#!/usr/bin/env python3
"""B-39: автоаккомпанемент клавишной дорожки поверх 0.713."""
from pathlib import Path
p=Path('STRUCHORD.html'); text=p.read_text(encoding='utf8')
def patch(old,new):
 global text
 n=text.count(old)
 if n!=1: raise SystemExit('ПАТЧ НЕ ПРИМЕНЁН: '+str(n)+' совпадений '+repr(old[:150]))
 text=text.replace(old,new,1)
# Модель дорожек: необязательные данные песни, проходящие тот же путь,
# что сохранение и undo. Старые песни не получают поле.
patch("      keyboardSize: B39_DEFAULT_KEYBOARD,\n      nextTrackId: 2", "      keyboardSize: B39_DEFAULT_KEYBOARD,\n      autoAccomp: null,\n      nextTrackId: 2")
patch("  // Старый файл (без tracks) -> одна гитарная дорожка, поля НЕ пишутся в\n  // файл при сохранении (exportForSave вернёт {}).\n  // Внутренняя подготовка: только новые поля.", """  var AUTO_GENRES = ['pop','rock','punk','country','blues','jazz','soul','funk','fusion'];
  function cleanAuto(raw, tracks, secs) {
    if (!b39IsObj(raw) || AUTO_GENRES.indexOf(raw.primary) < 0) return null;
    var secondary = raw.secondary == null || raw.secondary === '' ? null : raw.secondary;
    if (secondary !== null && (AUTO_GENRES.indexOf(secondary) < 0 || secondary === raw.primary)) return null;
    var trackId = Number(raw.trackId);
    if (!tracks.some(function(t){return t.id===trackId && t.instrument==='keys';})) return null;
    var ids = new Set((Array.isArray(secs)?secs:[]).map(function(s){return String(s.id);}));
    var managed = {}; if (b39IsObj(raw.managed)) Object.keys(raw.managed).slice(0,B39_LIMITS.MAX_CELL_ENTRIES).forEach(function(k){if (ids.has(k) && raw.managed[k]===true) managed[k]=true;});
    return {primary:raw.primary,secondary:secondary,trackId:trackId,managed:managed};
  }
  // Старый файл (без tracks) -> одна гитарная дорожка, поля НЕ пишутся в
  // файл при сохранении (exportForSave вернёт {}).
  // Внутренняя подготовка: только новые поля.""")
patch("      keyboardSize: keyboardSize,\n      nextTrackId: Math.max.apply", "      keyboardSize: keyboardSize,\n      autoAccomp: cleanAuto(raw.autoAccomp, tracks, song.sections),\n      nextTrackId: Math.max.apply")
patch("    out.keyboardSize = p.keyboardSize;\n    return out;", "    out.keyboardSize = p.keyboardSize;\n    if (p.autoAccomp) out.autoAccomp = p.autoAccomp; else delete out.autoAccomp;\n    return out;")
patch("      keyboardSize: p.keyboardSize,\n      nextTrackId: p.nextTrackId", "      keyboardSize: p.keyboardSize,\n      autoAccomp: p.autoAccomp,\n      nextTrackId: p.nextTrackId")
patch("    if (!state.tracks.length) return false;              // новая песня без дорожек", "    if (state.autoAccomp) return false;\n    if (!state.tracks.length) return false;              // новая песня без дорожек")
patch("      activeTrackId: state.activeTrackId,\n      keyboardSize: state.keyboardSize\n    };\n  }\n  function snapshot()", "      activeTrackId: state.activeTrackId,\n      keyboardSize: state.keyboardSize,\n      ...(state.autoAccomp ? {autoAccomp:b39Clone(state.autoAccomp)} : {})\n    };\n  }\n  function snapshot()")
patch("      keyboardSize: state.keyboardSize,\n      mainTrackId:", "      keyboardSize: state.keyboardSize,\n      autoAccomp: b39Clone(state.autoAccomp),\n      mainTrackId:")
patch("  function patternFor(id, key) {", """  function setAutoAccomp(value) {
    var clean = value == null ? null : cleanAuto(value, state.tracks, runtimeSections());
    if (value != null && !clean) return false;
    return dispatch('b39/auto-settings', function(){state.autoAccomp=clean; return true;});
  }
  function patternFor(id, key) {""")
patch("      t.instrument = inst;\n      // Имя меняем", "      t.instrument = inst;\n      if (inst !== 'keys' && state.autoAccomp && state.autoAccomp.trackId === id) state.autoAccomp = null;\n      // Имя меняем")
patch("      state.tracks.splice(idx, 1);\n      if (state.activeTrackId", "      state.tracks.splice(idx, 1);\n      if (state.autoAccomp && state.autoAccomp.trackId === id) state.autoAccomp = null;\n      if (state.activeTrackId")
patch("      state.nextTrackId = 2;\n      state.keyboardSize = B39_DEFAULT_KEYBOARD;", "      state.nextTrackId = 2;\n      state.keyboardSize = B39_DEFAULT_KEYBOARD;\n      state.autoAccomp = null;")
patch("      state.tracks = [];\n      state.activeTrackId = 0;", "      state.tracks = [];\n      state.activeTrackId = 0;\n      state.autoAccomp = null;")
patch("    patternFor: patternFor, clearPattern: clearPattern,", "    patternFor: patternFor, clearPattern: clearPattern, setAutoAccomp: setAutoAccomp,")
# Автообновление добавляется к тем же транзакциям, что правка секции.
patch("    ],\n  });\n  });\n  requestRender();\n  // B-12.2 (итерация 0.622): добавление секции", "    ],\n  });\n  if (window.StruChordAuto) window.StruChordAuto.addSection(sections[sections.length-1]);\n  }, {history:'atomic'});\n  requestRender();\n  // B-12.2 (итерация 0.622): добавление секции")
patch("    ],\n  });\n  });\n  requestRender();\n  // B-12.2 (итерация 0.622): как и обычная секция", "    ],\n  });\n  if (window.StruChordAuto) window.StruChordAuto.addSection(sections[sections.length-1]);\n  }, {history:'atomic'});\n  requestRender();\n  // B-12.2 (итерация 0.622): как и обычная секция")
patch("  sections.splice(idx + 1, 0, cl);\n  // Волна-4:", "  sections.splice(idx + 1, 0, cl);\n  if (window.StruChordAuto) window.StruChordAuto.cloneSection(orig, cl);\n  // Волна-4:")
patch("    sections = sections.filter((s) => s.id !== id);\n    // B-12.1:", "    sections = sections.filter((s) => s.id !== id);\n    if (window.StruChordAuto) window.StruChordAuto.removeSection(id);\n    // B-12.1:")
patch("  s.type = nt;\n  if (s.customName) delete s.customName;\n  // B-25: тип секции", """  songStore.dispatch('section/type', () => {
    s.type = nt;
    if (s.customName) delete s.customName;
    if (window.StruChordAuto) window.StruChordAuto.refreshSection(s, true);
  }, {quiet:true,history:'atomic'});
  // B-25: тип секции""")
patch("      s.type = 'Custom';\n      s.customName = nn;\n    }\n  }, { quiet: true });", "      s.type = 'Custom';\n      s.customName = nn;\n      if (window.StruChordAuto) window.StruChordAuto.refreshSection(s, true);\n    }\n  }, { quiet: true, history: 'atomic' });")
patch("    for (const sq of s.squares) {\n      migrateSquareForTimeSig(sq, oldTimeSig, newTimeSig);\n    }\n  }, { quiet: true, ...((tabSquares.length || inlineTabEvents.length) ? { history: 'atomic' } : {}) });", "    for (const sq of s.squares) {\n      migrateSquareForTimeSig(sq, oldTimeSig, newTimeSig);\n    }\n    if (window.StruChordAuto) window.StruChordAuto.refreshSection(s, true);\n  }, { quiet: true, history: 'atomic' });")
patch("      migrateSquareForTimeSig(sq, oldTimeSig, globalTimeSig);\n    }\n  }\n\n  dropRhythmStorage();\n  }, (tabSquares.length || inlineTabEvents.length) ? { history: 'atomic' } : undefined);", "      migrateSquareForTimeSig(sq, oldTimeSig, globalTimeSig);\n    }\n    if (window.StruChordAuto) window.StruChordAuto.refreshSection(s, true);\n  }\n\n  dropRhythmStorage();\n  }, { history: 'atomic' });")
# Клонирование и удаление с автонастройками — один шаг истории.
start=text.index('function cloneSection(id) {'); end=text.index('function changeSectionType',start)
chunk=text[start:end]
old='  });\n  requestRender();\n  const nm = orig.type'
if chunk.count(old)!=1: raise SystemExit('ПАТЧ НЕ ПРИМЕНЁН: завершение клонирования')
chunk=chunk.replace(old,"  }, {history:'atomic'});\n  requestRender();\n  const nm = orig.type",1)
text=text[:start]+chunk+text[end:]
start=text.index('function removeSection(id) {'); end=text.index('function clonePlainData',start)
chunk=text[start:end]
if chunk.count('  }, { quiet: true });')!=1: raise SystemExit('ПАТЧ НЕ ПРИМЕНЁН: удаление секции')
chunk=chunk.replace('  }, { quiet: true });',"  }, { quiet: true, history:'atomic' });",1)
text=text[:start]+chunk+text[end:]
# Загрузка/undo закрывают постоянный редактор, но не удаляют его DOM.
patch("    const modal = document.querySelector('.strum-modal-overlay');\n    if (modal) removeModalOverlay(modal);\n\n    return true;", "    if (window.StruChordAccomp) window.StruChordAccomp.close();\n    const modal = document.querySelector('.strum-modal-overlay:not(.b39-acc-overlay)');\n    if (modal) removeModalOverlay(modal);\n\n    return true;")
# В редакторе сохраняем метку авто только при неизменённом черновике.
patch("  var subButtons = [], swingBtn = null, scopeCell = null, scopeSec = null, lengthRow = null, stepChoice = null, selectedStep = null, draftLength = 4, presetGenre = null;", "  var subButtons = [], swingBtn = null, scopeCell = null, scopeSec = null, lengthRow = null, stepChoice = null, selectedStep = null, draftLength = 4, presetGenre = null, originalDraft = null;")
patch("    if (presetGenre) { var p = preset(cfg.type); presetGenre.value = p && p.genre || ''; }\n  }", "    if (presetGenre) { var p = preset(cfg.type); presetGenre.value = p && p.genre || ''; }\n    originalDraft = JSON.stringify(draft);\n  }")
patch("    if (draft.swing !== null) payload.swing = draft.swing;\n    return T.setPattern(st.activeTrackId, key, payload);", "    if (draft.swing !== null) payload.swing = draft.swing;\n    var old = T.patternFor(st.activeTrackId, key);\n    if (old && old.autoGenerated === true && originalDraft === JSON.stringify(draft)) payload.autoGenerated = true;\n    return T.setPattern(st.activeTrackId, key, payload);")
patch("    scopeLabel = el('span', 'b39-acc-scope'); top.appendChild(title); top.appendChild(scopeLabel); panel.appendChild(top);\n    var presets", """    scopeLabel = el('span', 'b39-acc-scope'); top.appendChild(title); top.appendChild(scopeLabel); panel.appendChild(top);
    var autoOpen = el('button','b39-acc-action','Автоаккомпанемент на песню'); autoOpen.id='b39AutoOpen'; autoOpen.type='button';
    autoOpen.addEventListener('click',function(){ if (HOST.StruChordAuto) HOST.StruChordAuto.open(panel); }); panel.appendChild(autoOpen);
    var presets""")
# Модуль следует непосредственно за STAGE5 и использует только публичный API.
marker='// <<< B-39 STAGE5 END (KEYS ACCOMPANIMENT) <<<'
assert text.count(marker)==1
module=r'''// B-39: выбор жанров и предварительный план автоаккомпанемента.
(function(HOST){
  'use strict';
  var doc=HOST.document, box=null, primary=null, secondary=null, planBox=null, dialogTrack=null;
  function T(){return HOST.StruChordTracks;} function A(){return HOST.StruChordAccomp;}
  function secs(){try{return Array.isArray(sections)?sections:[];}catch(e){return [];}}
  function tsOf(sec){try{return sec.timeSig || globalTimeSig || '4/4';}catch(e){return '4/4';}}
  function sectionName(sec){try{return sec.type==='Custom' ? (sec.customName||'Секция') : (LABEL_RU[sec.type]||sec.type||'Секция');}catch(e){return 'Секция';}}
  function pickIndex(type){return ({Intro:0,Verse:0,PreChorus:1,Chorus:2,Bridge:1,Solo:0,Outro:0,Custom:1})[type] || 0;}
  function genreName(id){var g=A().styles().find(function(x){return x.id===id;});return g?g.label:'';}
  function makePattern(sec,first,second){
    var acc=A(), idx=pickIndex(sec.type), id='style-'+first+'-'+idx, p=acc.preset(id);
    if (!p) return null;
    var ts=tsOf(sec), beats=Math.max(1,Math.min(32,parseInt(ts,10)||4));
    var base=acc.buildSteps(id,2,beats), accent=second && acc.preset('style-'+second+'-'+idx);
    if (accent) {
      var other=acc.buildSteps(accent.id,2,beats), compound=/^(6|9|12)\/8$/.test(ts), original=base.slice();
      // Если выбранные варианты полностью совпали, выбираем соседний вариант
      // дополнительного жанра, не подменяя жанр и не вводя случайность.
      if (other.every(function(v,i){return JSON.stringify(v)===JSON.stringify(original[i]);})) {
        for (var k=1;k<=2;k++) {
          var alternate=acc.preset('style-'+second+'-'+((idx+k)%3));
          if (!alternate) continue;
          var candidate=acc.buildSteps(alternate.id,2,beats);
          if (candidate.some(function(v,i){return JSON.stringify(v)!==JSON.stringify(original[i]);})) {accent=alternate;other=candidate;break;}
        }
      }
      // Основной жанр занимает большую часть такта; последний бит (в 6/8 —
      // последняя тройка) берём из дополнительного жанра.
      var lastGroup=Math.ceil(beats/(compound ? 3 : 1))-1;
      base=base.map(function(v,i){var group=compound ? Math.floor(i/6) : Math.floor(i/2);return group===lastGroup ? other[i] : v;});
      // Если на последней группе краска совпала, заменяем один отличный шаг.
      if (base.every(function(v,i){return JSON.stringify(v)===JSON.stringify(original[i]);})) {
        var diff=other.findIndex(function(v,i){return JSON.stringify(v)!==JSON.stringify(original[i]);});
        if(diff>=0)base[diff]=other[diff];
      }
    }
    return {type:id,subdivision:2,swing:!!(p.presetSwing || (accent && accent.presetSwing)),steps:base,autoGenerated:true};
  }
  function auto(){var t=T();return t && t.state().autoAccomp;}
  function manual(sec,cfg){var v=T().patternFor(cfg.trackId,'s:'+sec.id);return !v || v.autoGenerated!==true;}
  function refreshSection(sec,ask){
    var cfg=auto(); if(!cfg || !cfg.managed[String(sec.id)]) return false;
    if (manual(sec,cfg) && (!ask || !HOST.confirm('В секции «'+sectionName(sec)+'» рисунок изменён вручную. Заменить его автоматическим?'))) return false;
    var pattern=makePattern(sec,cfg.primary,cfg.secondary); return !!pattern && T().setPattern(cfg.trackId,'s:'+sec.id,pattern);
  }
  function addSection(sec){var cfg=auto();if(!cfg || !sec)return;var pattern=makePattern(sec,cfg.primary,cfg.secondary);if(!pattern)return;cfg.managed[String(sec.id)]=true;T().setPattern(cfg.trackId,'s:'+sec.id,pattern);T().setAutoAccomp(cfg);}
  function cloneSection(orig,cl){
    var cfg=auto(); if(!cfg || !orig || !cl)return;
    var original=T().patternFor(cfg.trackId,'s:'+orig.id);
    if(original){T().setPattern(cfg.trackId,'s:'+cl.id,original); if(cfg.managed[String(orig.id)]){cfg.managed[String(cl.id)]=true;T().setAutoAccomp(cfg);}}
    else addSection(cl);
    // Индивидуальные рисунки ячеек соответствуют клонированным индексам.
    var track=T().track(cfg.trackId); if(!track)return;
    (orig.squares||[]).forEach(function(sq,i){var dest=cl.squares && cl.squares[i];if(!dest)return;(sq.events||[]).forEach(function(ev,j){var old=track.patterns[orig.id+':'+sq.id+':'+j];if(old)T().setPattern(cfg.trackId,cl.id+':'+dest.id+':'+j,old);});});
  }
  function removeSection(id){var cfg=auto();if(!cfg)return;delete cfg.managed[String(id)];T().setAutoAccomp(cfg);}
  function element(tag,cls,txt){var n=doc.createElement(tag);if(cls)n.className=cls;if(txt!=null)n.textContent=txt;return n;}
  function select(label,id,optional){var row=element('label','b39-auto-select',label), sel=element('select','b39-acc-genre');sel.id=id;sel.setAttribute('aria-label',label);
    if(optional){var op=element('option','','Без дополнительного');op.value='';sel.appendChild(op);}
    A().styles().forEach(function(g){var op=element('option','',g.label);op.value=g.id;sel.appendChild(op);});row.appendChild(sel);return {row:row,sel:sel};}
  function renderPlan(){
    if(!planBox)return;planBox.textContent=''; var first=primary.value, second=secondary.value;
    if(second===first && second){planBox.appendChild(element('p','', 'Дополнительный жанр должен отличаться от основного.'));return;}
    var track=T().track(dialogTrack);if(!track)return;
    secs().forEach(function(sec){
      var raw=track.patterns['s:'+sec.id], cfg=auto(), isAuto=!!(cfg && cfg.trackId===dialogTrack && cfg.managed[String(sec.id)] && raw && raw.autoGenerated===true);
      var row=element('label','b39-auto-row'), cb=element('input');cb.type='checkbox';cb.dataset.sec=String(sec.id);cb.checked=!raw || isAuto;
      var desc=element('span'), picked=makePattern(sec,first,second), pr=picked && A().preset(picked.type);
      var cellCount=Object.keys(track.patterns).filter(function(k){return k.indexOf(sec.id+':')===0;}).length;
      var meter=tsOf(sec), simplified=['4/4','3/4','6/8'].indexOf(meter)<0;
      desc.textContent=sectionName(sec)+' · '+meter+(simplified?' (упрощённая адаптация)':'')+' · '+genreName(first)+' / '+(pr?pr.label:'—')+(second?' + '+genreName(second):'')+(raw&&!isAuto?' · свой рисунок':'')+(cellCount?' · настройки ячеек: '+cellCount:'');
      row.appendChild(cb);row.appendChild(desc);planBox.appendChild(row);
    });
    if(!secs().length)planBox.appendChild(element('p','','Добавьте секцию, чтобы создать аккомпанемент.'));
  }
  function close(){if(box){box.remove();box=null;primary=null;secondary=null;planBox=null;}}
  function open(panel){
    close();var st=T()&&T().state(), track=st&&T().track(st.activeTrackId);if(!track || track.instrument!=='keys')return;
    dialogTrack=track.id;box=element('div','b39-auto-panel');box.id='b39AutoPanel';box.setAttribute('role','group');box.setAttribute('aria-label','Автоаккомпанемент на песню');
    box.appendChild(element('strong','','Автоаккомпанемент на песню'));
    box.appendChild(element('div','b39-auto-note','Выберите жанры и проверьте план. Позже авто обновит рисунки при смене типа или размера секции; ручные правки защищены. Настройки ячеек сохраняются.'));
    var f=select('Основной жанр','b39AutoPrimary',false),s=select('Дополнительный жанр','b39AutoSecondary',true);primary=f.sel;secondary=s.sel;box.appendChild(f.row);box.appendChild(s.row);
    var cfg=auto();if(cfg){primary.value=cfg.primary;secondary.value=cfg.secondary||'';}
    primary.addEventListener('change',renderPlan);secondary.addEventListener('change',renderPlan);
    planBox=element('div','b39-auto-list');planBox.id='b39AutoPlan';box.appendChild(planBox);
    var actions=element('div','b39-acc-actions'), cancel=element('button','b39-acc-action','Отмена'), apply=element('button','b39-acc-action b39-acc-save','Применить');
    cancel.type=apply.type='button';cancel.id='b39AutoCancel';apply.id='b39AutoApply';cancel.addEventListener('click',close);
    apply.addEventListener('click',function(){
      if(secondary.value && secondary.value===primary.value){if(HOST.showToast)HOST.showToast('Выберите разные жанры');return;}
      var live=T().state(), track=T().track(dialogTrack); if(!track || track.instrument!=='keys' || live.activeTrackId!==dialogTrack){close();return;}
      var checked=Array.from(planBox.querySelectorAll('input[data-sec]:checked')).map(function(n){return n.dataset.sec;});
      if(!secs().length){if(HOST.showToast)HOST.showToast('Добавьте секцию');return;}
      var old=auto(), same=old && old.trackId===dialogTrack, managed=same?Object.assign({},old.managed):{}, selected=secs().filter(function(sec){return checked.indexOf(String(sec.id))>=0;});
      // Явно снятая галочка отключает авто для прежнего автоматического
      // рисунка. Ручные исключения продолжаем помнить и спрашивать о них.
      if(same) secs().forEach(function(sec){var raw=track.patterns['s:'+sec.id];if(checked.indexOf(String(sec.id))<0 && raw && raw.autoGenerated===true)delete managed[String(sec.id)];});
      var conflicts=selected.filter(function(sec){var raw=track.patterns['s:'+sec.id];return raw && !(same && old.managed[String(sec.id)] && raw.autoGenerated===true);});
      if(conflicts.length && !HOST.confirm('Заменить собственные рисунки секций: '+conflicts.length+'? Если отказаться, они сохранятся; остальные выбранные секции обновятся.')) selected=selected.filter(function(sec){return conflicts.indexOf(sec)<0;});
      var next={primary:primary.value,secondary:secondary.value||null,trackId:dialogTrack,managed:managed};
      HOST.songStore.dispatch('b39/auto-apply',function(){
        selected.forEach(function(sec){var pattern=makePattern(sec,next.primary,next.secondary);if(pattern){T().setPattern(dialogTrack,'s:'+sec.id,pattern);next.managed[String(sec.id)]=true;}});
        T().setAutoAccomp(next);
      },{history:'atomic'});
      close();if(HOST.StruChordAccomp)HOST.StruChordAccomp.close();if(HOST.showToast)HOST.showToast('Автоаккомпанемент обновлён');
    });
    actions.appendChild(cancel);actions.appendChild(apply);
    if(cfg && cfg.trackId===dialogTrack){var off=element('button','b39-acc-action','Отключить авто');off.type='button';off.id='b39AutoOff';off.addEventListener('click',function(){HOST.songStore.dispatch('b39/auto-off',function(){T().setAutoAccomp(null);},{history:'atomic'});close();if(HOST.showToast)HOST.showToast('Авто отключено; рисунки сохранены');});actions.appendChild(off);}
    box.appendChild(actions);panel.insertBefore(box,panel.querySelector('.pattern-presets'));renderPlan();primary.focus();
  }
  HOST.StruChordAuto=Object.freeze({open:open,close:close,makePattern:makePattern,refreshSection:refreshSection,addSection:addSection,cloneSection:cloneSection,removeSection:removeSection});
})(window);
'''
text=text.replace(marker,marker+'\n'+module,1)
patch("    '.b39-acc-preset[hidden] { display:none !important; }',", """    '.b39-acc-editor > * { flex-shrink:0; }',
    '.b39-auto-panel { display:flex; flex-direction:column; gap:.65rem; border:.0625rem solid var(--color-border-medium); border-radius:.75rem; padding:.75rem; }',
    '.b39-auto-note { font-size:.75rem; color:var(--color-text-secondary); }',
    '.b39-auto-select { display:flex; flex-wrap:wrap; align-items:center; gap:.5rem; font-size:.75rem; }',
    '.b39-auto-list { display:flex; flex-direction:column; gap:.45rem; max-height:14rem; overflow:auto; }',
    '.b39-auto-row { display:flex; align-items:flex-start; gap:.45rem; font-size:.75rem; line-height:1.35; }',
    '.b39-auto-row input { flex:none; }',
    '.b39-acc-preset[hidden] { display:none !important; }',""")
# При закрытии редактора не оставлять открытый план.
patch("    stopPreview(); selectedStep = null;\n    if (focusRelease)", "    stopPreview(); selectedStep = null; if (HOST.StruChordAuto) HOST.StruChordAuto.close();\n    if (focusRelease)")
p.write_text(text,encoding='utf8');print('Патч применён')

#!/usr/bin/env python3
"""B-39: одиночный удар по умолчанию и автоаккомпанемент в настройках, поверх 0.744."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 if s.count(a)!=1:raise SystemExit(f'{s.count(a)} совпадений: {a[:150]!r}')
 s=s.replace(a,b,1)
rep('''.b39-keys-settings { contain: inline-size; padding-top:.15rem; }''','''.b39-keys-settings { contain: inline-size; padding-top:.45rem; }
.b39-keys-settings .b39-keys-link { display:flex; align-items:flex-start; gap:.45rem; line-height:1.4; }
.b39-keys-settings-actions { display:flex; flex-wrap:wrap; gap:.5rem; align-items:center; }
.b39-keys-settings-actions .b39-acc-action { font:inherit; font-size:.75rem; }
.b39-keys-settings-actions .b39-keys-reset { margin:0; }''')
rep('''.b39-keys-reset { margin: .25rem 0 .5rem; min-height: 2.5rem; padding:.4rem .7rem; border:.0625rem solid var(--color-border-medium); border-radius:.5rem; background:var(--color-surface); color:inherit; font:inherit; font-size:.8rem; cursor:pointer; }''','''.b39-keys-reset { min-height:2.5rem; }''')
rep("autoChoiceBtn=el('button','b39-keys-reset','Сбросить выбор позиции');", "autoChoiceBtn=el('button','b39-keys-reset b39-acc-action','Сбросить выбор позиции');")
rep('''    settings.appendChild(settingsContext); settings.appendChild(controls); settings.appendChild(linkRow); settings.appendChild(autoChoiceBtn);''','''    var settingsActions=el('div','b39-keys-settings-actions');
    var autoOpen=el('button','b39-acc-action','Автоаккомпанемент'); autoOpen.type='button'; autoOpen.id='b39AutoOpen';
    autoOpen.addEventListener('click',function(){ if (HOST.StruChordAuto) HOST.StruChordAuto.open(); });
    settingsActions.appendChild(autoOpen); settingsActions.appendChild(autoChoiceBtn);
    settings.appendChild(settingsContext); settings.appendChild(controls); settings.appendChild(linkRow); settings.appendChild(settingsActions);''')
rep("    var autoOpen = el('button','b39-acc-action','Автоаккомпанемент на песню'); autoOpen.id='b39AutoOpen'; autoOpen.type='button';\n    autoOpen.addEventListener('click',function(){ if (HOST.StruChordAuto) HOST.StruChordAuto.open(panel); }); panel.appendChild(autoOpen);\n",'')
rep("    '.b39-auto-panel { display:flex; flex-direction:column; gap:.65rem; border:.0625rem solid var(--color-border-medium); border-radius:.75rem; padding:.75rem; }',", "    '.b39-auto-panel { max-height:calc(100vh - 2rem); max-height:calc(100dvh - 2rem); overflow-y:auto; overscroll-behavior:contain; }',\n    '.b39-auto-section { display:flex; flex-direction:row; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:.5rem; padding:.55rem .7rem; border:.0625rem solid var(--color-border-medium); border-radius:.75rem; background:var(--color-background-secondary); }',\n    '.b39-auto-section .b39-auto-row { flex:1 1 15rem; }',")
rep("      row.appendChild(cb);row.appendChild(desc);planBox.appendChild(row);", "      row.appendChild(cb);row.appendChild(desc);var card=element('div','pattern-presets b39-auto-section');card.appendChild(row);planBox.appendChild(card);")
rep("      var saved=T().bassRole(dialogTrack,sec.id);bass.value=prior[String(sec.id)] || (saved!=='legacy'?saved:raw?'legacy':'auto');planBox.appendChild(bass);", "      var saved=T().bassRole(dialogTrack,sec.id);bass.value=prior[String(sec.id)] || (saved!=='legacy'?saved:raw?'legacy':'auto');card.appendChild(bass);")
rep("  function close(){if(box){box.remove();box=null;primary=null;secondary=null;planBox=null;}}\n  function open(panel){", """  var autoOverlay=null;
  function close(){
    var old=autoOverlay; autoOverlay=null; box=null;primary=null;secondary=null;planBox=null;
    if(old){ if(typeof HOST.removeModalOverlay==='function')HOST.removeModalOverlay(old); else old.remove(); }
  }
  function open(){""")
rep("    dialogTrack=track.id;box=element('div','b39-auto-panel');box.id='b39AutoPanel';box.setAttribute('role','group');box.setAttribute('aria-label','Автоаккомпанемент на песню');\n    box.appendChild(element('strong','','Автоаккомпанемент на песню'));", """    dialogTrack=track.id;
    autoOverlay=element('div','strum-modal-overlay b39-auto-overlay');
    box=element('div','strum-modal-content b39-auto-panel');box.id='b39AutoPanel';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-labelledby','b39AutoTitle');
    var heading=element('h3','','Автоаккомпанемент на песню');heading.id='b39AutoTitle';heading.style.margin='0';box.appendChild(heading);""")
rep("    box.appendChild(actions);panel.insertBefore(box,panel.querySelector('.pattern-presets'));renderPlan();primary.focus();", """    box.appendChild(actions);autoOverlay.appendChild(box);doc.body.appendChild(autoOverlay);
    autoOverlay.addEventListener('click',function(e){if(e.target===autoOverlay)close();});
    autoOverlay.addEventListener('keydown',function(e){if(e.key==='Escape')e.stopPropagation();});
    renderPlan();if(typeof HOST.trapFocus==='function')autoOverlay._releaseFocusTrap=HOST.trapFocus(box,close);else primary.focus();""")
rep("      close();if(HOST.StruChordAccomp)HOST.StruChordAccomp.close();if(HOST.showToast)HOST.showToast('Автоаккомпанемент обновлён');", "      close();if(HOST.showToast)HOST.showToast('Автоаккомпанемент обновлён');")
rep("    var C = tokenContext(o, notes);\n    // Номер звука арпеджио", """    var C = tokenContext(o, notes);
    // Без явного рисунка — один аккорд в начале каждой ячейки, как у гитары.
    // Явные пресеты, включая сохранённый keys-block, не меняем.
    if (cfg.source === 'default') {
      var single=[{index:0,stepIndex:0,token:'H',at:0,dur:dur,notes:tokenNotes('H',C,function(){return 0;}),subdivision:sub,swing:false,type:cfg.type,source:cfg.source}];
      if (!o.noHighlight && o.ctx && typeof o.evStart === 'number') scheduleHighlights(o,single);
      if (stepObserver) { try { stepObserver({cell:o.cell,trackId:o.trackId,cfg:cfg,steps:single}); } catch(e) {} }
      return single;
    }
    // Номер звука арпеджио""")
rep("    '.b39-auto-section .b39-auto-row { flex:1 1 15rem; }',", "    '.b39-auto-section .b39-auto-row { flex:1 1 15rem; }',\n    '.b39-auto-section .b39-acc-genre { font-size:.75rem; }',")
rep("draftInherited = false, editingTrackId = null;", "draftInherited = false, draftDefault = false, editingTrackId = null;")
rep("        if (resetPending) clearScopes(); else apply();", "        if (resetPending) clearScopes(); else if (!draftDefault || JSON.stringify(draft) !== originalDraft) apply();")
rep("    draftInherited = current.scope === 'cell' && cfg.source !== 'cell';", "    draftDefault = cfg.source === 'default';\n    draftInherited = current.scope === 'cell' && cfg.source !== 'cell' && !draftDefault;")
rep("    if (cfg.steps) draft.steps = cfg.steps.map(function (v) { return Array.isArray(v) ? v.slice() : v; });\n    if (presetGenre)", "    if (cfg.steps) draft.steps = cfg.steps.map(function (v) { return Array.isArray(v) ? v.slice() : v; });\n    else if (draftDefault) draft.steps = Array.from({length:Math.max(1,Math.round(draftLength * draft.subdivision))},function(_,i){return i===0?'H':null;});\n    if (presetGenre)")
rep("      footEl.textContent = resetPending ? 'После сохранения вернётся унаследованный рисунок.' : 'Нажмите на шаг, чтобы выбрать звуки или паузу.'+hint;", "      footEl.textContent = resetPending ? 'После сохранения вернётся унаследованный рисунок.' : draftDefault && JSON.stringify(draft) === originalDraft ? 'По умолчанию — один удар на каждую ячейку. Выберите пресет или измените шаги для своего рисунка.' : 'Нажмите на шаг, чтобы выбрать звуки или паузу.'+hint;")
rep(" : {type:DEFAULT_TYPE, subdivision:1, swing:null};\n    loadDraft(cfg); resetPending = true;", " : {type:DEFAULT_TYPE, subdivision:1, swing:null, source:'default'};\n    loadDraft(cfg); resetPending = true;")
p.write_text(s,encoding='utf-8');print('Аккомпанемент и дизайн обновлены')

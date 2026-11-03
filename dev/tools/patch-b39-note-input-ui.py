#!/usr/bin/env python3
"""Интерфейс явного ввода нот после модели клавишной дорожки."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(old,new):
 global s
 n=s.count(old)
 if n!=1: raise SystemExit('Ожидалось одно место (%d): %s'%(n,old[:130]))
 s=s.replace(old,new,1)
rep('''.b39-keys-head { display:flex;''','''.b39-note-input { contain:inline-size; display:flex; flex-wrap:wrap; align-items:center; gap:.3rem; margin:.3rem 0; font-size:.8rem; }
.b39-note-input[hidden] { display:none; }
.b39-note-input select, .b39-note-input input, .b39-note-input button, .b39-input-start { font:inherit; color:inherit; background:var(--color-surface); border:.0625rem solid var(--color-border-medium); border-radius:.45rem; padding:.3rem .45rem; }
.b39-note-input input { width:8rem; min-width:6rem; }
.b39-note-input select { width:auto; flex:1 1 8rem; }
.b39-note-input button, .b39-input-start { cursor:pointer; }
.b39-note-input .b39-note-apply { background:var(--color-accent); color:white; }
.b39-note-info { color:var(--color-text-secondary); flex:1 1 100%; }
.b39-keys-panel.is-note-input .b39-keys-nav { display:none; }
.b39-keys-head { display:flex;''')
rep('''  var linkedCache = new Map(), linkedToggle = null, autoChoiceBtn = null;''','''  var linkedCache = new Map(), linkedToggle = null, autoChoiceBtn = null;
  var selectedCellKey = null, noteDraft = null, noteBar = null, noteName = null, noteCandidates = null, noteInfo = null, noteStart = null;''')
rep('''  // ---------- Рендер клавиатуры в SVG ----------''','''  // Явный ввод отдельно от обычного прослушивания; до подтверждения модель не трогаем.
  function recognizeInput(notes) {
    if(notes.length<2 || typeof buildChordName!=='function') return [];
    var pcs=Array.from(new Set(notes.map(mod12))), bass=mod12(Math.min.apply(null,notes));
    var names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'], out=[];
    pcs.slice().sort(function(a,b){return (a===bass?-1:b===bass?1:a-b);}).forEach(function(root){
      var ints=pcs.map(function(pc){return mod12(pc-root);}).sort(function(a,b){return a-b;});
      var name=buildChordName(names[root],ints);if(!name || name==='?')return;
      if(root!==bass)name+='/'+names[bass];
      if(typeof normalizeChordSpelling==='function') name=normalizeChordSpelling(name,panelKey());
      if(out.indexOf(name)<0)out.push(name);
    });
    return out;
  }
  function refreshNoteBar() {
    if(!noteBar)return; noteBar.hidden=!noteDraft;
    if(noteStart)noteStart.hidden=!!noteDraft;
    if(!noteDraft)return;
    var candidates=recognizeInput(noteDraft.notes);
    noteCandidates.innerHTML='';
    if(!candidates.length){var none=el('option','','Не распознано');none.value='';noteCandidates.appendChild(none);}
    candidates.forEach(function(name){var opt=el('option','',name);opt.value=name;noteCandidates.appendChild(opt);});
    noteCandidates.disabled=!candidates.length;
    noteName.value=candidates[0]||'';
    noteInfo.textContent=noteDraft.notes.length ? noteDraft.notes.map(function(n){return noteLabel(n,'sharp');}).join(' · ') : 'Нажмите клавиши: повторное нажатие снимает ноту';
  }
  function cancelNoteInput() { noteDraft=null; if(noteBar)noteBar.hidden=true; if(noteStart)noteStart.hidden=false; if(panel)panel.classList.remove('is-note-input'); }
  function beginNoteInput(key) {
    var T=tracks(), active=activeTrack(), cell=panelCell(key);
    if(!T || !active || !active.track || active.track.instrument!=='keys' || !cell) {if(HOST.showToast)HOST.showToast('Сначала выберите ячейку');return false;}
    if(typeof playbackState!=='undefined' && playbackState.isPlaying) {if(HOST.showToast)HOST.showToast('Остановите воспроизведение');return false;}
    if(Array.isArray(cell.ev.notes) && cell.ev.notes.length && T.state().mainTrackId===active.track.id) {if(HOST.showToast)HOST.showToast('В ячейке есть записанные ноты; сначала разберите их отдельно');return false;}
    selectedCellKey=key; lastCellKey=key; hoverActive=false; hoverBaseKey=null;
    noteDraft={track:active.track.id,cell:key,event:cell.ev,chord:T.trackChord(active.track.id,key,cell.ev),notes:[]};
    openPanel();panel.classList.add('is-note-input');refreshNoteBar();renderPanel();
    if(panel.getBoundingClientRect().bottom>(HOST.innerHeight||600))panel.scrollIntoView({block:'start'});
    return true;
  }
  function applyNoteInput() {
    var d=noteDraft,T=tracks(),active=activeTrack(),cell=d && panelCell(d.cell), name=noteName && noteName.value.trim();
    if(!d || !cell || cell.ev!==d.event || !active || active.track.id!==d.track || T.trackChord(d.track,d.cell,cell.ev)!==d.chord) {cancelNoteInput();renderPanel();if(HOST.showToast)HOST.showToast('Ячейка изменилась, ввод отменён');return;}
    if(!d.notes.length || !name || !/^[A-G][#b♯♭]?/.test(name)) {if(HOST.showToast)HOST.showToast('Выберите ноты и введите название аккорда');return;}
    var chosen=d.notes.slice(), ok=false;
    cancelNoteInput();
    HOST.songStore.dispatch('b39/note-input',function(){
      var before=T.trackChord(d.track,d.cell,cell.ev);
      if(before!==name) setEventChord(cell.ev,name,{secId:cell.sec.id,sqId:cell.sq.id,ei:cell.ei});
      var actual=T.trackChord(d.track,d.cell,cell.ev);
      // Ворота могли отклонить замену записанных нот. Не закреплять новую форму поверх старого аккорда.
      if(actual && (before===name || actual!==before)) ok=T.setExactNotes(d.track,d.cell,actual,chosen);
    },{history:'atomic'});
    lastCellKey=d.cell;renderPanel();
    if(HOST.showToast)HOST.showToast(ok?'Аккорд и выбранные ноты добавлены':'Аккорд не изменён');
  }

  // ---------- Рендер клавиатуры в SVG ----------''')
rep('''    head.appendChild(identity); head.appendChild(nav); head.appendChild(settingsToggle); head.appendChild(close);''','''    noteStart=el('button','b39-input-start','♫');noteStart.type='button';noteStart.id='b39NoteStart';noteStart.title='Ввести по клавишам';noteStart.setAttribute('aria-label','Ввести по клавишам');
    noteStart.addEventListener('click',function(){beginNoteInput(selectedCellKey);});
    head.appendChild(identity); head.appendChild(nav); head.appendChild(noteStart); head.appendChild(settingsToggle); head.appendChild(close);''')
rep('''    body = el('div', 'b39-keys-body'); body.setAttribute''','''    noteBar=el('div','b39-note-input');noteBar.id='b39NoteInput';noteBar.hidden=true;
    noteInfo=el('span','b39-note-info');noteInfo.setAttribute('aria-live','polite');
    noteCandidates=el('select');noteCandidates.id='b39NoteCandidates';noteCandidates.setAttribute('aria-label','Варианты названия');
    noteName=el('input');noteName.id='b39NoteName';noteName.placeholder='Название аккорда';noteName.setAttribute('aria-label','Название аккорда');
    noteCandidates.addEventListener('change',function(){noteName.value=noteCandidates.value;});
    var clearNotes=el('button','','Очистить');clearNotes.type='button';clearNotes.addEventListener('click',function(){if(noteDraft){noteDraft.notes=[];refreshNoteBar();renderPanel();}});
    var cancelNotes=el('button','','Отмена');cancelNotes.type='button';cancelNotes.id='b39NoteCancel';cancelNotes.addEventListener('click',function(){cancelNoteInput();renderPanel();});
    var applyNotes=el('button','b39-note-apply','Добавить');applyNotes.type='button';applyNotes.id='b39NoteApply';applyNotes.addEventListener('click',applyNoteInput);
    [noteInfo,noteCandidates,noteName,clearNotes,cancelNotes,applyNotes].forEach(function(n){noteBar.appendChild(n);});
    body = el('div', 'b39-keys-body'); body.setAttribute''')
rep('''      if (!key || !body.contains(key) || !A || !active || !active.track || active.track.instrument !== 'keys') return;
      var ctx =''','''      if (!key || !body.contains(key) || !A || !active || !active.track || active.track.instrument !== 'keys') return;
      var midi=Number(key.getAttribute('data-midi'));
      if(noteDraft && noteDraft.track===active.track.id) {
        var at=noteDraft.notes.indexOf(midi); if(at<0)noteDraft.notes.push(midi);else noteDraft.notes.splice(at,1);
        noteDraft.notes.sort(function(a,b){return a-b;});refreshNoteBar();renderPanel();
      }
      var ctx =''')
rep("      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) playPanelKey(e.target); }","      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) { var midi=e.target.getAttribute('data-midi'); playPanelKey(e.target); var again=body.querySelector('rect[data-midi=\"'+midi+'\"]'); if(again)again.focus(); } }")
rep('''    panel.appendChild(head);panel.appendChild(body);panel.appendChild(settings);''','''    panel.appendChild(head);panel.appendChild(noteBar);panel.appendChild(body);panel.appendChild(settings);''')
rep('''      if (!panel || panel.hidden || (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen')) return;''','''      if (!panel || panel.hidden || noteDraft || (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen')) return;''')
rep('''    restoreHover(); panel.hidden = true; btn.setAttribute('aria-pressed', 'false');''','''    cancelNoteInput(); restoreHover(); panel.hidden = true; btn.setAttribute('aria-pressed', 'false');''')
rep('''    var T = tracks(); if (!T || !lastChord) return;''','''    var T = tracks(); if (!T || !lastChord || noteDraft) return;''')
rep('''    var active = activeTrack();
    if (!active || !active.track || active.track.instrument !== 'keys') {
      panel.classList.remove('has-keyboard');''','''    var active = activeTrack();
    if(noteDraft && (!active || !active.track || active.track.id!==noteDraft.track || !panelCell(noteDraft.cell) || panelCell(noteDraft.cell).ev!==noteDraft.event || T.trackChord(noteDraft.track,noteDraft.cell,noteDraft.event)!==noteDraft.chord)) cancelNoteInput();
    if (!active || !active.track || active.track.instrument !== 'keys') {
      panel.classList.remove('has-keyboard');''')
rep('''    if(acc && sec)notes=acc.stripBass(active.track.id,sec,notes);
    var f = chord ? F.chordFormula(chord, panelKey()) : null;''','''    if(acc && sec)notes=acc.stripBass(active.track.id,sec,notes);
    if(noteDraft) notes=noteDraft.notes.slice();
    var f = chord ? F.chordFormula(chord, panelKey()) : null;''')
rep('''    countEl.textContent = !chord ? '—' : selected && selected.chord===chord ?''','''    countEl.textContent = noteDraft ? 'Ввод' : exact ? 'Своя' : !chord ? '—' : selected && selected.chord===chord ?''')
rep('''    if (T && active && active.track && info && info.cell && panelCell(info.cell)) {
      lastCellKey = info.cell;''','''    if (T && active && active.track && info && info.cell && panelCell(info.cell)) {
      if(noteDraft && info.cell!==noteDraft.cell)cancelNoteInput();
      lastCellKey = info.cell;''')
rep('''    open: openPanel, close: closePanel, toggle: togglePanel, render: renderPanel, focusCell: function (key) { onAudioEvent({cell:key}); },''','''    open: openPanel, close: closePanel, toggle: togglePanel, render: renderPanel, beginNoteInput:beginNoteInput,
    focusCell: function (key) { selectedCellKey=key; onAudioEvent({cell:key}); },''')
rep('''  if (window.StruChordAccomp && window.StruChordAccomp.activeIsKeys()) return;
  const btn = document.createElement('button');''','''  const isKeys = !!(window.StruChordAccomp && window.StruChordAccomp.activeIsKeys());
  const btn = document.createElement('button');''')
rep("  btn.textContent = 'По аппликатуре';", "  btn.textContent = isKeys ? 'Ввести по клавишам' : 'По аппликатуре';")
rep('''    cleanup();
    openFingeringEditorForNewChord();''','''    cleanup();
    if (window.StruChordAccomp && window.StruChordAccomp.activeIsKeys()) {
      const key=inp2.dataset.sec+':'+inp2.dataset.square+':'+inp2.dataset.ei;
      const cell=sections.find(s=>s.id===+inp2.dataset.sec)?.squares.find(q=>q.id===+inp2.dataset.square)?.events[+inp2.dataset.ei];
      inp2.value=cell && window.StruChordTracks ? (window.StruChordTracks.trackChord(window.StruChordTracks.state().activeTrackId,key,cell)||'') : '';
      inp2.setAttribute('readonly','readonly');
      if(window.StruChordKeys)window.StruChordKeys.beginNoteInput(key);
    } else openFingeringEditorForNewChord();''')
p.write_text(s,encoding='utf-8')

#!/usr/bin/env python3
"""B-39: полноценная правка шагов клавишного аккомпанемента поверх 0.710."""
from pathlib import Path
p=Path('STRUCHORD.html'); text=p.read_text(encoding='utf-8')
a=text.index('// >>> B-39 STAGE5 BEGIN'); b=text.index('// <<< B-39 STAGE5 END',a)
s=text[a:b]
def rep(old,new):
 global s
 n=s.count(old)
 if n != 1: raise SystemExit('ПАТЧ НЕ ПРИМЕНЁН: '+str(n)+' совпадений: '+repr(old[:150]))
 s=s.replace(old,new,1)
rep("    '.b39-acc-foot { margin-top:.5rem; font-size:.65rem; line-height:1.45;',", """    '.b39-acc-editor { max-height:calc(100vh - 1rem); max-height:calc(100dvh - 1rem); overflow-y:auto; overscroll-behavior:contain; }',
    '.b39-acc-editor .pattern-grid--rows { overflow-x:auto; justify-content:safe center; }',
    '.b39-acc-choice { border:.0625rem solid var(--color-border-medium); border-radius:.75rem; padding:.65rem; display:flex; flex-direction:column; gap:.5rem; }',
    '.b39-acc-choice[hidden] { display:none; }',
    '.b39-acc-choice-head { display:flex; justify-content:space-between; align-items:center; gap:.5rem; font-size:.75rem; font-weight:600; }',
    '.b39-acc-choice-options { display:flex; flex-wrap:wrap; gap:.3rem; }',
    '.b39-acc-choice-options .pattern-pick-toggle { width:auto; min-width:2.2rem; height:auto; min-height:2rem; border-radius:.6rem; padding:.25rem .5rem; }',
    '.b39-acc-choice-note { font-size:.6875rem; color:var(--color-text-secondary); }',
    '.b39-acc-foot { margin-top:.5rem; font-size:.65rem; line-height:1.45;',""")
rep("  var subButtons = [], swingBtn = null, scopeCell = null, scopeSec = null;", "  var subButtons = [], swingBtn = null, scopeCell = null, scopeSec = null, lengthRow = null, stepChoice = null, selectedStep = null, draftLength = 4;")
rep("        draft.type = p.id; draft.subdivision = p.subdivision; delete draft.steps; draftInherited = false; resetPending = false; renderPanel();", "        draft.type = p.id; draft.subdivision = p.subdivision; delete draft.steps; draftLength = scopeUnits(); draftInherited = false; selectedStep = null; resetPending = false; renderPanel();")
rep("    presets.appendChild(gridEl); panel.appendChild(presets);\n    var row = el('div', 'pattern-sub-row');", """    presets.appendChild(gridEl); panel.appendChild(presets);
    lengthRow = el('div', 'pattern-sub-row'); lengthRow.id = 'b39AccLength'; panel.appendChild(lengthRow);
    var row = el('div', 'pattern-sub-row');""")
rep("        var target = Math.max(1, Math.round(oldSteps.length * n / old));\n        var result = typeof resamplePatternSteps === 'function' ? resamplePatternSteps(oldSteps, old, n, target) : {steps: oldSteps, lost:0};\n        draft.subdivision = n; draft.steps = result.steps; draftInherited = false; resetPending = false;\n        if (result.lost && typeof HOST.showToast === 'function') HOST.showToast('Некоторые шаги не поместились в новую сетку: ' + result.lost);\n        renderPanel();", """        var target = Math.max(1, Math.round(oldSteps.length * n / old));
        if (target > MAX_STEPS) { if (typeof HOST.showToast === 'function') HOST.showToast('Для такой длины слишком много шагов'); return; }
        var result = typeof resamplePatternSteps === 'function' ? resamplePatternSteps(oldSteps, old, n, target) : {steps: oldSteps, lost:0};
        if (result.lost && !HOST.confirm('При смене дробности не поместятся шаги: ' + result.lost + '. Продолжить?')) return;
        draft.subdivision = n; draft.steps = result.steps; draftInherited = false; selectedStep = null; resetPending = false;
        renderPanel();""")
rep("    stepsEl = el('div', 'pattern-grid b39-acc-steps'); stepsEl.id = 'b39AccSteps'; panel.appendChild(stepsEl);\n    footEl =", "    stepsEl = el('div', 'pattern-grid b39-acc-steps'); stepsEl.id = 'b39AccSteps'; panel.appendChild(stepsEl);\n    stepChoice = el('div', 'b39-acc-choice'); stepChoice.id = 'b39AccStepChoice'; stepChoice.hidden = true; panel.appendChild(stepChoice);\n    footEl =")
rep("  function draftSteps() {\n    var beats = numerator(current.ts || '4/4');\n    if (current.scope === 'cell') {\n      try { var sec = sections.find(function (s) { return s.id === current.secId; }); var sq = sec && sec.squares.find(function (q) { return q.id === current.sqId; }); var ev = sq && sq.events[current.ei]; if (ev) beats = Number(ev.span) || 1; } catch (e) {}\n    }\n    var count = Math.min(MAX_STEPS, Math.max(1, Math.round(beats * draft.subdivision)));\n    var base = draft.steps || buildSteps(draft.type, draft.subdivision, draftInherited ? numerator(current.ts) : beats);", """  function scopeUnits() {
    if (current.scope === 'cell') {
      try { var sec = sections.find(function (s) { return s.id === current.secId; }); var sq = sec && sec.squares.find(function (q) { return q.id === current.sqId; }); var ev = sq && sq.events[current.ei]; if (ev) return Number(ev.span) || 1; } catch (e) {}
    }
    return numerator(current.ts || '4/4');
  }
  function draftSteps() {
    var beats = scopeUnits();
    var count = Math.min(MAX_STEPS, Math.max(1, Math.round(draftLength * draft.subdivision)));
    var base = draft.steps || buildSteps(draft.type, draft.subdivision, draftInherited ? numerator(current.ts) : draftLength);""")
rep("    return Array.from({length:count}, function (_, i) { return base[(offset + i) % base.length]; });\n  }\n  function renderSteps() {", """    return Array.from({length:count}, function (_, i) { var v = base[(offset + i) % base.length]; return Array.isArray(v) ? v.slice() : v; });
  }
  function renderLength() {
    if (!lengthRow) return;
    var full = scopeUnits(), opts = [], maxUnits = full;
    if (current.scope === 'section') {
      try { var sec = sections.find(function (s) { return s.id === current.secId; }); var sq = sec && sec.squares && sec.squares[0]; maxUnits = Math.min(full * 2, Number(getSquareBeats(sq || {events:[]}, current.ts)) || full); } catch (e) {}
    }
    for (var n=1; n<=full; n++) if (full % n === 0) opts.push(n);
    if (full > 0 && opts.indexOf(full) < 0) opts.push(full);
    if (full * 2 <= maxUnits) opts.push(full * 2);
    if (opts.indexOf(draftLength) < 0) opts.push(draftLength);
    opts = opts.filter(function (x) { return x > 0 && Math.round(x * draft.subdivision) <= MAX_STEPS; }).sort(function(a,b){return a-b;});
    lengthRow.textContent = ''; lengthRow.appendChild(el('span', '', 'Длина рисунка:'));
    opts.forEach(function (length) {
      var b=el('button','pattern-sub-btn'+(length===draftLength?' active':''),String(length)); b.type='button'; b.dataset.length=String(length); b.setAttribute('aria-pressed',String(length===draftLength));
      b.title = length < full ? 'Рисунок повторяется' : length > full ? 'Рисунок продолжается в следующем такте' : 'Рисунок на всю длину';
      b.addEventListener('click',function(){
        if (length===draftLength) return;
        var old=draftSteps(), need=Math.max(1,Math.round(length*draft.subdivision));
        var removed=old.slice(need).filter(function(v){return v!==null && v!==undefined;}).length;
        if (removed && !HOST.confirm('При сокращении длины будут удалены шаги: '+removed+'. Продолжить?')) return;
        draft.steps=Array.from({length:need},function(_,i){var v=old[i%old.length];return Array.isArray(v)?v.slice():v;});
        draftLength=length; draftInherited=false; selectedStep=null; resetPending=false; renderPanel();
      }); lengthRow.appendChild(b);
    });
    var note=el('span','hint-inline',draftLength<full ? 'повторяется' : draftLength>full ? 'на следующий такт' : ''); lengthRow.appendChild(note);
  }
  var STEP_CHOICES = [
    ['H','Аккорд'], ['B','Бас'], ['O','Октава баса'], ['A','Арпеджио ↑'],
    ['t1','1 · основа'], ['t3','3 · терция'], ['t5','5 · квинта'], ['t7','7 · септима'],
    ['t9','9 · нона'], ['t11','11 · ундецима'], ['t13','13 · терцдецима']
  ];
  function stepName(token) {
    if (token == null) return 'Пауза';
    var values=Array.isArray(token)?token:[token];
    return values.map(function(v){var found=STEP_CHOICES.find(function(c){return c[0]===v;});return found?found[1]:v;}).join(' + ');
  }
  function stepGlyph(token) {
    if (token == null) return '';
    var values=Array.isArray(token)?token:[token];
    var text=values.map(function(v){return ({H:'А', B:'Б', O:'О', A:'↑', t1:'1', t3:'3', t5:'5', t7:'7', t9:'9', t11:'11', t13:'13'})[v] || '?';}).join('+'); return text.length > 5 ? text.slice(0,4)+'…' : text;
  }
  function renderStepChoice() {
    if (!stepChoice) return;
    stepChoice.textContent=''; stepChoice.hidden=selectedStep === null;
    if (selectedStep === null) return;
    var arr=draftSteps(); if (selectedStep >= arr.length) { selectedStep=null; stepChoice.hidden=true; return; }
    var head=el('div','b39-acc-choice-head'); head.appendChild(el('span','','Шаг '+(selectedStep+1)+' · выберите звуки'));
    var close=el('button','pattern-sub-btn','Готово'); close.type='button'; close.addEventListener('click',function(){selectedStep=null;renderPanel();}); head.appendChild(close); stepChoice.appendChild(head);
    var options=el('div','b39-acc-choice-options'); options.setAttribute('role','group'); options.setAttribute('aria-label','Звуки шага '+(selectedStep+1));
    var values=arr[selectedStep]==null?[]:(Array.isArray(arr[selectedStep])?arr[selectedStep].slice():[arr[selectedStep]]);
    var pause=el('button','pattern-pick-toggle'+(!values.length?' active':''),'Пауза'); pause.type='button'; pause.setAttribute('aria-pressed',String(!values.length));
    pause.addEventListener('click',function(){var steps=draftSteps(); steps[selectedStep]=null; draft.steps=steps; draftInherited=false; resetPending=false; renderPanel();}); options.appendChild(pause);
    STEP_CHOICES.forEach(function(choice){
      var b=el('button','pattern-pick-toggle'+(values.indexOf(choice[0])>=0?' active':''),choice[1]); b.type='button'; b.dataset.token=choice[0]; b.setAttribute('aria-pressed',String(values.indexOf(choice[0])>=0));
      b.addEventListener('click',function(){
        var next=values.slice(), ix=next.indexOf(choice[0]);
        if(ix>=0) next.splice(ix,1); else if(next.length<8) next.push(choice[0]); else {if(typeof HOST.showToast==='function')HOST.showToast('Не больше 8 звуков на шаг');return;}
        var steps=draftSteps(); steps[selectedStep]=next.length===0?null:next.length===1?next[0]:next; draft.steps=steps; draftInherited=false; resetPending=false; renderPanel(); var again=stepChoice.querySelector('[data-token="'+choice[0]+'"]'); if (again) again.focus();
      }); options.appendChild(b);
    });
    stepChoice.appendChild(options);
    stepChoice.appendChild(el('div','b39-acc-choice-note','Можно выбрать несколько звуков. Ступени берутся из текущего аккорда; если ступени в нём нет, она не звучит.'));
  }
  function renderSteps() {""")
rep("    var arr = draftSteps(), sub = draft.subdivision, labels = {H:'Аккорд',B:'Бас',O:'Октава',A:'Арпеджио'};", "    var arr = draftSteps(), sub = draft.subdivision;")
rep("    stepsEl.textContent = '';\n    for (var start=0;", "    stepsEl.classList.toggle('pattern-grid--rows', draftLength > barUnits); stepsEl.style.setProperty('--pattern-cols', String(barUnits));\n    stepsEl.textContent = '';\n    for (var start=0;")
rep("        var token=arr[i], name=token==null ? 'Пауза' : (labels[token] || (Array.isArray(token) ? token.join('+') : token));\n        var button=el('button', 'pattern-step-btn b39-acc-step' + (token==null ? '' : ' filled'), token==null ? '' : (token==='B' ? 'Б' : token==='O' ? 'О' : glyph(token)));", "        var token=arr[i], name=stepName(token);\n        var button=el('button', 'pattern-step-btn b39-acc-step' + (token==null ? '' : ' filled') + (selectedStep===i ? ' is-editing' : ''), stepGlyph(token));")
rep("        button.addEventListener('click', function () { var steps=draftSteps(), values=[null,'H','B','O','A'], at=values.indexOf(steps[i]); steps[i]=values[(at+1)%values.length]; draft.steps=steps; draftInherited=false; resetPending=false; renderPanel(); });", "        button.addEventListener('click', function () { selectedStep = selectedStep===i ? null : i; renderPanel(); });")
rep("    draftInherited = current.scope === 'cell' && cfg.source !== 'cell';\n    if (cfg.steps)", "    draftInherited = current.scope === 'cell' && cfg.source !== 'cell';\n    draftLength = !draftInherited && cfg.steps ? cfg.steps.length / cfg.subdivision : scopeUnits();\n    selectedStep = null;\n    if (cfg.steps)")
rep("    renderSteps();\n    if (footEl) footEl.textContent = resetPending ? 'После сохранения вернётся унаследованный рисунок.' : 'Нажимайте на шаги, чтобы менять аккорд, бас, октаву, арпеджио и паузу.';", "    renderLength(); renderSteps(); renderStepChoice();\n    if (footEl) footEl.textContent = resetPending ? 'После сохранения вернётся унаследованный рисунок.' : 'Нажмите на шаг, чтобы выбрать звуки или паузу.';")
rep("    var span = current.scope === 'cell' && ev ? Number(ev.span) || 1 : numerator(current.ts);\n    var config = Object.assign({}, draft);", "    var span = Math.max(scopeUnits(), draftLength);\n    var config = Object.assign({}, draft);")
rep("    if (draftInherited) config.steps = draftSteps();\n    previewStop =", "    if (draftInherited) config.steps = draftSteps();\n    previewStop =")
rep("    stopPreview();\n    if (focusRelease)", "    stopPreview(); selectedStep = null;\n    if (focusRelease)")
p.write_text(text[:a]+s+text[b:],encoding='utf-8');print('Патч применён')

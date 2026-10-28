#!/usr/bin/env python3
"""B-39: общие элементы редактора и правила Swing (0.709)."""
from pathlib import Path
p=Path('STRUCHORD.html'); s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 n=s.count(a)
 if n!=1: raise SystemExit(f'Патч не применён: {n} совпадений: {a[:110]!r}')
 s=s.replace(a,b,1)
# Общие стили ритмического редактора остаются источником истины.
rep('''.b39-acc-editor .b39-acc-grid { display:flex; flex-wrap:wrap; gap:.35rem; }
.b39-acc-editor .b39-acc-preset { width:auto; height:auto; padding:.4rem .65rem; }
.b39-acc-editor .b39-acc-preset[aria-pressed='true'] { border-color:var(--color-accent); background:var(--color-tint); }
.b39-acc-editor .b39-acc-steps { display:flex; flex-wrap:wrap; gap:.3rem; }
.b39-acc-editor .b39-acc-step { width:auto; min-width:3.7rem; min-height:2.3rem; height:auto; padding:.3rem; font-size:.7rem; }
.b39-acc-editor .pattern-sub-row select { font:inherit; color:inherit; background:var(--color-surface); border:1px solid var(--color-border-medium); border-radius:.5rem; padding:.35rem; }
.b39-acc-actions { display:flex; justify-content:center; flex-wrap:wrap; gap:.5rem; }
.b39-acc-action { padding:.5rem 1rem; background:var(--color-neutral-bg); color:var(--color-text-primary); border:1px solid var(--color-border-medium); border-radius:1.25rem; cursor:pointer; font:inherit; }
.b39-acc-save { background:var(--color-ink); color:var(--color-surface); font-weight:600; }''', '''.b39-acc-actions { display:flex; justify-content:center; flex-wrap:wrap; gap:.5rem; }
.b39-acc-action { padding:.5rem 1.25rem; background:var(--color-neutral-bg); color:var(--color-text-primary); border:.0625rem solid var(--color-border-medium); border-radius:1.25rem; cursor:pointer; }
.b39-acc-action--preview { background:var(--color-tint); color:var(--color-accent); border-color:transparent; font-weight:600; }
.b39-acc-save { background:var(--color-ink); color:white; border:none; font-weight:600; }''')
# Размер дорожки переносится в подходящее место, не теряя настройку.
a=s.index('// >>> B-39 STAGE4 BEGIN'); b=s.index('// <<< B-39 STAGE4 END',a); prefix=s[:a]; part=s[a:b]; tail=s[b:]
def pr(a,b):
 global part
 if part.count(a)!=1: raise SystemExit('Нет якоря клавиатуры: '+a[:80])
 part=part.replace(a,b,1)
pr("    timbreSel = el('select'); timbreSel.setAttribute('aria-label', 'Тембр');", """    var trackSizeSel = el('select'); trackSizeSel.id = 'b39KeysTrackSize';
    trackSizeSel.setAttribute('aria-label', 'Размер клавиатуры дорожки');
    var defaultSizeOption = el('option', '', 'Как в песне'); defaultSizeOption.value = ''; trackSizeSel.appendChild(defaultSizeOption);
    [25,37,49,61,76,88].forEach(function (n) { var op = el('option', '', n + ' клавиш дорожки'); op.value = String(n); trackSizeSel.appendChild(op); });
    trackSizeSel.addEventListener('change', function () { var T = tracks(), st = T && T.state(); if (st) T.setTrackKeyboardSize(st.activeTrackId, trackSizeSel.value === '' ? null : Number(trackSizeSel.value)); renderPanel(); });
    timbreSel = el('select'); timbreSel.setAttribute('aria-label', 'Тембр');""")
pr("    head.appendChild(titleEl); head.appendChild(sizeSel); head.appendChild(timbreSel);", "    head.appendChild(titleEl); head.appendChild(sizeSel); head.appendChild(trackSizeSel); head.appendChild(timbreSel);")
pr("    if (sizeSel && Number(sizeSel.value) !== range.size) sizeSel.value = String(range.size);", """    if (sizeSel) sizeSel.value = String(T.state().keyboardSize);
    var trackSizeSelect = doc.getElementById('b39KeysTrackSize');
    if (trackSizeSelect) trackSizeSelect.value = active.track.keyboardSize == null ? '' : String(active.track.keyboardSize);""")
s=prefix+part+tail
# Устаревшие стили плавающей панели не должны переопределять общую сетку.
rep("""    '.b39-acc-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.3rem; }',
    '.b39-acc-preset { text-align:left; padding:.35rem .45rem; border-radius:.5rem; cursor:pointer;',
    '  font:inherit; font-size:.72rem; line-height:1.25; color:inherit;',
    '  background:transparent; border:1px solid var(--color-border-medium,#c9cdd4); }',
    '.b39-acc-preset[aria-pressed=\"true\"] { border-color:var(--color-accent,#2f855a);',
    '  background:var(--color-accent-soft,rgba(47,133,90,.12)); }',
    '.b39-acc-preset small { display:block; opacity:.7; font-size:.65rem; }',
""", "")
rep("""    '.b39-acc-steps { display:flex; flex-wrap:wrap; gap:.15rem; margin-top:.3rem; }',
    '.b39-acc-step { width:1.35rem; height:1.35rem; display:grid; place-items:center;',
    '  border-radius:.3rem; border:1px solid var(--color-border-medium,#c9cdd4);',
    '  font-size:.65rem; transition:transform .05s linear, background-color .05s linear; }',
""", "")
# Блок аккомпанемента.
a=s.index('// >>> B-39 STAGE5 BEGIN'); b=s.index('// <<< B-39 STAGE5 END',a); prefix=s[:a]; part=s[a:b]; tail=s[b:]
pr("  var sizeSel = null, subSel = null, swingBox = null, scopeCell = null, scopeSec = null;", "  var subButtons = [], swingBtn = null, scopeCell = null, scopeSec = null;")
pr("  var presetButtons = [], overlay = null, scopeLabel = null, resetPending = false, previewStop = null, focusRelease = null, draftInherited = false, draftSize = null, editingTrackId = null;", "  var presetButtons = [], overlay = null, scopeLabel = null, resetPending = false, previewStop = null, previewTimer = null, focusRelease = null, draftInherited = false, editingTrackId = null;")
pr('''    panel.appendChild(el('div', 'pattern-presets-head', 'Пресеты'));
    gridEl = el('div', 'pattern-preset-chips b39-acc-grid');
    PRESETS.forEach(function (p) {
      var button = el('button', 'pattern-sub-btn b39-acc-preset', p.label);
      button.type = 'button'; button.setAttribute('data-preset', p.id); button.title = p.hint;''', '''    var presets = el('div', 'pattern-presets');
    presets.appendChild(el('div', 'pattern-presets-head', 'Пресеты'));
    gridEl = el('div', 'pattern-preset-chips b39-acc-grid');
    PRESETS.forEach(function (p) {
      var button = el('button', 'pattern-preset-chip b39-acc-preset');
      button.type = 'button'; button.setAttribute('data-preset', p.id); button.title = p.hint;
      button.appendChild(el('span', 'pattern-preset-name', p.label));
      var preview = el('span', 'strum-preview'); preview.setAttribute('aria-hidden', 'true');
      buildSteps(p.id, p.subdivision, numerator(current.ts)).slice(0,8).forEach(function (token) { preview.appendChild(el('span', 'strum-step', glyph(token))); });
      button.appendChild(preview);''')
pr("    panel.appendChild(gridEl);\n    var row = el('div', 'pattern-sub-row');", "    presets.appendChild(gridEl); panel.appendChild(presets);\n    var row = el('div', 'pattern-sub-row');")
start=part.index("    subSel = el('select'); subSel.setAttribute('aria-label', 'Нот на долю');"); end=part.index("    stepsEl = el('div', 'pattern-grid b39-acc-steps');",start)
part=part[:start]+'''    [1,2,3,4].forEach(function (n) {
      var button = el('button', 'pattern-sub-btn', String(n)); button.type = 'button'; button.dataset.sub = String(n);
      button.addEventListener('click', function () {
        if (draft.subdivision === n) return;
        var old = draft.subdivision, oldSteps = draftSteps();
        var target = Math.max(1, Math.round(oldSteps.length * n / old));
        var result = typeof resamplePatternSteps === 'function' ? resamplePatternSteps(oldSteps, old, n, target) : {steps: oldSteps, lost:0};
        draft.subdivision = n; draft.steps = result.steps; draftInherited = false; resetPending = false;
        if (result.lost && typeof HOST.showToast === 'function') HOST.showToast('Некоторые шаги не поместились в новую сетку: ' + result.lost);
        renderPanel();
      });
      subButtons.push(button); row.appendChild(button);
    });
    swingBtn = el('button', 'pattern-swing-btn', 'Swing'); swingBtn.type = 'button'; swingBtn.id = 'b39AccSwing';
    swingBtn.title = 'Свинг — качающиеся восьмые. Влияет только на звук';
    swingBtn.addEventListener('click', function () {
      var on = draft.swing === true || (draft.swing === null && sharedRhythm && sharedRhythm.swing === true);
      draft.swing = !on; resetPending = false; renderPanel(); if (previewStop) previewDraft();
    });
    row.appendChild(swingBtn); panel.appendChild(row);
''' + part[end:]
pr("    var actions = el('div', 'b39-acc-actions');\n    var preview = el('button', 'b39-acc-action', '▶ Прослушать'); preview.id = 'b39AccPreview'; preview.type = 'button';\n    preview.addEventListener('click', previewDraft); actions.appendChild(preview);", """    var previewRow = el('div', 'b39-acc-actions');
    var preview = el('button', 'b39-acc-action b39-acc-action--preview'); preview.id = 'b39AccPreview'; preview.type = 'button';
    var previewIcon = el('i', 'ti ti-player-play'); previewIcon.setAttribute('aria-hidden','true'); preview.appendChild(previewIcon); preview.appendChild(doc.createTextNode(' Прослушать'));
    preview.addEventListener('click', previewDraft); previewRow.appendChild(preview); panel.appendChild(previewRow);
    var actions = el('div', 'b39-acc-actions');""")
pr("        if (resetPending) clearScopes(); else apply();\n        if (currentTrack.keyboardSize !== draftSize) T.setTrackKeyboardSize(editingTrackId, draftSize);", "        if (resetPending) clearScopes(); else apply();")
start=part.index('  function renderSteps() {'); end=part.index('  function resolveForScope()',start)
part=part[:start]+'''  function renderSteps() {
    if (!stepsEl) return;
    var arr = draftSteps(), sub = draft.subdivision, labels = {H:'Аккорд',B:'Бас',O:'Октава',A:'Арпеджио'};
    var barUnits = numerator(current.ts || '4/4'), beatLabels = [];
    if (typeof isCompoundMeter === 'function' && isCompoundMeter(current.ts) && typeof getBeatGrouping === 'function') {
      getBeatGrouping(current.ts).forEach(function (size, group) { for (var k=0;k<size;k++) beatLabels.push({text:k===0 ? String(group+1) : '·', strong:k===0}); });
    }
    stepsEl.textContent = '';
    for (var start=0; start<arr.length; start+=sub) {
      var group = el('div','pattern-beat-group'), cells = el('div','pattern-beat-cells'), numbers = el('div','pattern-beat-numbers');
      for (var k=0; k<sub && start+k<arr.length; k++) (function (i, pos, beat) {
        var token=arr[i], name=token==null ? 'Пауза' : (labels[token] || (Array.isArray(token) ? token.join('+') : token));
        var button=el('button', 'pattern-step-btn b39-acc-step' + (token==null ? '' : ' filled'), token==null ? '' : (token==='B' ? 'Б' : token==='O' ? 'О' : glyph(token)));
        button.type='button'; button.dataset.step=String(i); button.setAttribute('aria-label','Шаг '+(i+1)+': '+name+'. Нажмите, чтобы изменить'); button.title=button.getAttribute('aria-label');
        button.addEventListener('click', function () { var steps=draftSteps(), values=[null,'H','B','O','A'], at=values.indexOf(steps[i]); steps[i]=values[(at+1)%values.length]; draft.steps=steps; draftInherited=false; resetPending=false; renderPanel(); });
        cells.appendChild(button);
        var number=el('span','pattern-beat-number');
        if (pos===0) { var label=beatLabels.length ? beatLabels[beat%beatLabels.length] : null; number.textContent=label ? label.text : String((beat%barUnits)+1); number.classList.add('is-beat'); if (label && label.strong) number.classList.add('is-group-start'); }
        else number.textContent=typeof countLabelFor === 'function' ? countLabelFor(beat,pos,sub,barUnits) : 'и';
        numbers.appendChild(number);
      })(start+k,k,Math.floor(start/sub));
      group.appendChild(cells); group.appendChild(numbers); stepsEl.appendChild(group);
    }
  }
''' + part[end:]
pr("    if (scopeLabel) scopeLabel.textContent = current.scope === 'cell' ? 'только для этой ячейки' : 'по умолчанию для всей секции';", "    if (scopeLabel) scopeLabel.textContent = current.scope === 'cell' ? 'только для этой ячейки' : 'по умолчанию для всей секции';\n    var resetButton = doc.getElementById('b39AccReset'); if (resetButton) resetButton.textContent = current.scope === 'cell' ? 'Сбросить к секции' : 'Убрать паттерн';")
pr("    presetButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-preset') === draft.type && !draft.steps)); });\n    if (subSel) subSel.value = String(draft.subdivision);\n    if (swingBox) { swingBox.checked = draft.swing === true || !!inheritedSwing; swingBox.disabled = !(draft.subdivision === 2 || draft.subdivision === 4); }", """    presetButtons.forEach(function (b) { var selected = b.getAttribute('data-preset') === draft.type && !draft.steps; b.setAttribute('aria-pressed', String(selected)); b.classList.toggle('active', selected); });
    subButtons.forEach(function (b) { var n=Number(b.dataset.sub); b.classList.toggle('active', n===draft.subdivision); b.setAttribute('aria-pressed',String(n===draft.subdivision)); b.hidden = n===3 && typeof timeSigAllowsTriplets === 'function' && !timeSigAllowsTriplets(current.ts); });
    if (swingBtn) { var allowed = draft.subdivision === 2 || draft.subdivision === 4; var enabled = draft.swing === true || !!inheritedSwing; swingBtn.hidden = !allowed; swingBtn.classList.toggle('active', allowed && enabled); swingBtn.setAttribute('aria-pressed', String(allowed && enabled)); }""")
pr("  function stopPreview() { if (previewStop) { previewStop(); previewStop = null; } }", "  function stopPreview() { if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; } if (previewStop) { previewStop(); previewStop = null; } }")
pr("    previewStop = A.previewPattern(chord, ctx, state.activeTrackId, key, config, {scope:current.scope, span:span, bpm:bpm, ts:current.ts, keyboardSize:draftSize});", """    previewStop = A.previewPattern(chord, ctx, state.activeTrackId, key, config, {scope:current.scope, span:span, bpm:bpm, ts:current.ts, keyboardSize:T.track(state.activeTrackId).keyboardSize});
    if (previewStop) { var unit = typeof getGridUnitDurationSeconds === 'function' ? getGridUnitDurationSeconds(bpm, current.ts) : 60 / bpm; previewTimer = setTimeout(function () { previewStop = null; previewTimer = null; }, Math.ceil((span * unit + .2) * 1000)); }""")
pr("    var T = tracks(), state = T && T.state(), track = state && T.track(state.activeTrackId);\n    editingTrackId = state ? state.activeTrackId : null; draftSize = track ? track.keyboardSize : null;\n    renderSizeOptions();", "    var T = tracks(), state = T && T.state();\n    editingTrackId = state ? state.activeTrackId : null;")
s=prefix+part+tail
p.write_text(s,encoding='utf-8');print('Патч применён')

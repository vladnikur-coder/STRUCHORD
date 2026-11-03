#!/usr/bin/env python3
"""B-39: общий редактор аккомпанемента по якорям версии 0.707."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 n=s.count(a)
 if n!=1: raise SystemExit(f'Патч не применён: {n} совпадений {a[:90]!r}')
 s=s.replace(a,b,1)
def block(a,b,new):
 global s
 start=s.index(a); end=s.index(b,start); s=s[:start]+new+'\n\n'+s[end:]
rep("html.b39-keys-mode .chord-btn-strum,\nhtml.b39-keys-mode .strum-badge-wrap { display: none !important; }", "/* Гитарный бейдж не должен изображать клавишный рисунок. */\nhtml.b39-keys-mode .strum-badge-wrap { display:none !important; }")
rep("    return { type: raw.type, subdivision: sub, swing: swing };\n  }\n  function numerator(ts)", """    var out = { type: raw.type, subdivision: sub, swing: swing };
    if (Array.isArray(raw.steps) && raw.steps.length > 0 && raw.steps.length <= MAX_STEPS) {
      var valid = raw.steps.every(function (step) {
        if (step === null) return true;
        if (typeof step === 'string') return TOKENS.indexOf(step) >= 0;
        return Array.isArray(step) && step.length > 0 && step.length <= 8 && step.every(function (v) { return TOKENS.indexOf(v) >= 0; });
      });
      if (valid) out.steps = raw.steps.map(function (v) { return Array.isArray(v) ? v.slice() : v; });
    }
    return out;
  }
  function numerator(ts)""")
rep("    return { type: v.type, subdivision: v.subdivision, swing: v.swing, source: source };", "    return { type: v.type, subdivision: v.subdivision, swing: v.swing, steps: v.steps, source: source };")
rep("    var cfg = resolve(o.trackId, o.cell, o.sec);\n    var sub = cfg.subdivision;", """    var cfg = o.pattern ? normalize(o.pattern) : null;
    if (cfg) cfg.source = o.patternSource === 'cell' ? 'cell' : 'section';
    else cfg = resolve(o.trackId, o.cell, o.sec);
    var sub = cfg.subdivision;""")
rep("    var base = buildSteps(cfg.type, sub, beats);", "    var base = cfg.steps && cfg.steps.length ? cfg.steps : buildSteps(cfg.type, sub, beats);")
rep("    if (o.ctx && typeof o.evStart === 'number') scheduleHighlights(o, out);", "    if (!o.noHighlight && o.ctx && typeof o.evStart === 'number') scheduleHighlights(o, out);")
# Preview schedules the same tokens/voicing as playback without altering the song.
rep("  function currentKey() {\n    try { return (typeof globalKey !== 'undefined' && globalKey) || 'C'; } catch (e) { return 'C'; }\n  }\n\n  function stopAll()", """  function previewPattern(chord, ctx, trackId, key, cfg, options) {
    var T = tracks(), Acc = HOST.StruChordAccomp;
    if (!T || !Acc || !ctx || !chord) return null;
    var state = T.state(), track = T.track(trackId);
    if (!track || track.instrument !== 'keys') return null;
    var gain = effectiveGain(state, track);
    if (gain <= 0) return null;
    ensureCtx(ctx);
    var channel = channelFor(ctx, trackId, gain);
    if (!channel) return null;
    var opt = options || {}, range = T.keyRange(trackId), ranges = T.ranges();
    var desired = opt.keyboardSize === null ? state.keyboardSize : opt.keyboardSize;
    if (ranges[desired]) range = Object.assign({size:desired}, ranges[desired]);
    var effectiveKey = key || currentKey();
    var notes = voicingProvider ? (voicingProvider(chord, effectiveKey, range, null, trackId) || voicingFor(chord, effectiveKey, range, null)) : voicingFor(chord, effectiveKey, range, null);
    var span = Math.max(.25, Number(opt.span) || 4), bpm = Math.max(20, Number(opt.bpm) || 120);
    var unit = typeof getGridUnitDurationSeconds === 'function' ? getGridUnitDurationSeconds(bpm, opt.ts || '4/4') : 60 / bpm;
    var steps = Acc.plan({ trackId:trackId, chord:chord, key:effectiveKey, range:range, notes:notes,
      ts:opt.ts || '4/4', span:span, dur:span * unit, ev:{span:span}, sq:{events:[]}, ei:0,
      pattern:cfg, patternSource:opt.scope, noHighlight:true });
    var before = new Set(voices), start = ctx.currentTime + .05;
    var level = HEADROOM / Math.sqrt(Math.max(1, notes.length));
    steps.forEach(function (step) { step.notes.forEach(function (midi) { playNote(ctx, channel, midi, start + step.at, step.dur, level); }); });
    var added = Array.from(voices).filter(function (v) { return !before.has(v); });
    return function () { added.forEach(function (v) { try { v.stop(); } catch (e) {} voices.delete(v); }); };
  }
  function currentKey() {
    try { return (typeof globalKey !== 'undefined' && globalKey) || 'C'; } catch (e) { return 'C'; }
  }

  function stopAll()""")
rep("    scheduleEvent: scheduleEvent, preview: preview, stopAll: stopAll, reset: reset,", "    scheduleEvent: scheduleEvent, preview: preview, previewPattern: previewPattern, stopAll: stopAll, reset: reset,")
# UI block scoped by markers to avoid similarly named buildDom functions.
a=s.index('// >>> B-39 STAGE5 BEGIN');b=s.index('// <<< B-39 STAGE5 END',a); prefix=s[:a]; seg=s[a:b];suffix=s[b:]
seg=seg.replace("  var presetButtons = [];", "  var presetButtons = [], overlay = null, scopeLabel = null, resetPending = false, previewStop = null, focusRelease = null, draftInherited = false, draftSize = null, editingTrackId = null;",1)
start=seg.index('  function buildDom() {');end=seg.index('  function glyph(token)',start)
new=r'''  function buildDom() {
    if (!doc || !doc.body || panel) return;
    // Единственные точки входа — кнопки секции и ячейки, как у гитары.
    btn = el('button', 'b39-acc-btn'); btn.id = 'b39AccBtn'; btn.hidden = true;
    overlay = el('div', 'strum-modal-overlay b39-acc-overlay'); overlay.hidden = true;
    panel = el('div', 'strum-modal-content strum-modal-content--pattern b39-acc-editor');
    panel.id = 'b39AccPanel'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'b39AccTitle');
    if (HUB) HUB.register('acc', closePanel);
    var top = el('div', 'b39-acc-editor-top');
    var title = el('h3', '', 'Аккомпанемент'); title.id = 'b39AccTitle';
    scopeLabel = el('span', 'b39-acc-scope'); top.appendChild(title); top.appendChild(scopeLabel); panel.appendChild(top);
    panel.appendChild(el('div', 'pattern-presets-head', 'Пресеты'));
    gridEl = el('div', 'pattern-preset-chips b39-acc-grid');
    PRESETS.forEach(function (p) {
      var button = el('button', 'pattern-sub-btn b39-acc-preset', p.label);
      button.type = 'button'; button.setAttribute('data-preset', p.id); button.title = p.hint;
      button.addEventListener('click', function () {
        draft.type = p.id; draft.subdivision = p.subdivision; delete draft.steps; draftInherited = false; resetPending = false; renderPanel();
      });
      presetButtons.push(button); gridEl.appendChild(button);
    });
    panel.appendChild(gridEl);
    var row = el('div', 'pattern-sub-row'); row.appendChild(el('span', '', 'Нот на долю:'));
    subSel = el('select'); subSel.setAttribute('aria-label', 'Нот на долю');
    [1,2,3,4].forEach(function (n) { var o = el('option', '', String(n)); o.value = String(n); subSel.appendChild(o); });
    subSel.addEventListener('change', function () { draft.subdivision = Number(subSel.value); delete draft.steps; draftInherited = false; resetPending = false; renderPanel(); });
    row.appendChild(subSel);
    swingBox = el('input'); swingBox.type = 'checkbox'; swingBox.id = 'b39AccSwing';
    swingBox.addEventListener('change', function () { draft.swing = swingBox.checked; resetPending = false; renderPanel(); });
    var swingLabel = el('label', ''); swingLabel.appendChild(swingBox); swingLabel.appendChild(doc.createTextNode(' Swing')); row.appendChild(swingLabel);
    panel.appendChild(row);
    var sizeRow = el('div', 'pattern-sub-row'); sizeRow.appendChild(el('span', '', 'Клавиатура дорожки:'));
    sizeSel = el('select'); sizeSel.setAttribute('aria-label', 'Размер клавиатуры дорожки');
    sizeSel.addEventListener('change', function () { draftSize = sizeSel.value === '' ? null : Number(sizeSel.value); });
    sizeRow.appendChild(sizeSel); panel.appendChild(sizeRow);
    stepsEl = el('div', 'pattern-grid b39-acc-steps'); stepsEl.id = 'b39AccSteps'; panel.appendChild(stepsEl);
    footEl = el('div', 'pattern-hint'); panel.appendChild(footEl);
    var actions = el('div', 'b39-acc-actions');
    var preview = el('button', 'b39-acc-action', '▶ Прослушать'); preview.id = 'b39AccPreview'; preview.type = 'button';
    preview.addEventListener('click', previewDraft); actions.appendChild(preview);
    var cancel = el('button', 'b39-acc-action', 'Отмена'); cancel.id = 'b39AccCancel'; cancel.type = 'button'; cancel.addEventListener('click', closePanel); actions.appendChild(cancel);
    var reset = el('button', 'b39-acc-action', 'Сбросить'); reset.id = 'b39AccReset'; reset.type = 'button';
    reset.addEventListener('click', function () { resetDraft(); renderPanel(); }); actions.appendChild(reset);
    var save = el('button', 'b39-acc-action b39-acc-save', 'Сохранить'); save.id = 'b39AccSave'; save.type = 'button';
    save.addEventListener('click', function () {
      var T = tracks(), currentTrack = T && T.track(editingTrackId);
      if (!currentTrack) { closePanel(); return; }
      var commit = function () {
        if (resetPending) clearScopes(); else apply();
        if (currentTrack.keyboardSize !== draftSize) T.setTrackKeyboardSize(editingTrackId, draftSize);
      };
      if (HOST.songStore && typeof HOST.songStore.dispatch === 'function') HOST.songStore.dispatch('b39/accomp-edit', commit);
      else commit();
      closePanel();
    }); actions.appendChild(save);
    panel.appendChild(actions); overlay.appendChild(panel); doc.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closePanel(); });
    overlay.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); closePanel(); } });
  }'''
seg=seg[:start]+new+'\n\n'+seg[end:]
start=seg.index('  function renderSteps() {');end=seg.index('  function renderSizeOptions()',start)
new=r'''  function draftSteps() {
    var beats = numerator(current.ts || '4/4');
    if (current.scope === 'cell') {
      try { var sec = sections.find(function (s) { return s.id === current.secId; }); var sq = sec && sec.squares.find(function (q) { return q.id === current.sqId; }); var ev = sq && sq.events[current.ei]; if (ev) beats = Number(ev.span) || 1; } catch (e) {}
    }
    var count = Math.min(MAX_STEPS, Math.max(1, Math.round(beats * draft.subdivision)));
    var base = draft.steps || buildSteps(draft.type, draft.subdivision, draftInherited ? numerator(current.ts) : beats);
    var offset = 0;
    if (draftInherited) {
      try { var sec2 = sections.find(function (s) { return s.id === current.secId; }); var sq2 = sec2 && sec2.squares.find(function (q) { return q.id === current.sqId; }); offset = Math.round(squareOffset(sq2, current.ei, current.ts) * draft.subdivision); } catch (e) {}
    }
    return Array.from({length:count}, function (_, i) { return base[(offset + i) % base.length]; });
  }
  function renderSteps() {
    if (!stepsEl) return;
    var arr = draftSteps(), labels = { H:'Аккорд', B:'Бас', O:'Октава', A:'Арпеджио' };
    stepsEl.textContent = '';
    arr.forEach(function (token, i) {
      var text = token == null ? 'Пауза' : (labels[token] || (Array.isArray(token) ? 'Аккорд' : token));
      var c = el('button', 'pattern-sub-btn b39-acc-step', text);
      c.type = 'button'; c.dataset.step = String(i);
      c.setAttribute('aria-label', 'Шаг ' + (i+1) + ': ' + text + '. Нажмите, чтобы изменить');
      c.title = c.getAttribute('aria-label');
      c.addEventListener('click', function () {
        var steps = draftSteps(), values = [null, 'H', 'B', 'O', 'A'], at = values.indexOf(steps[i]);
        steps[i] = values[(at + 1) % values.length]; draft.steps = steps; draftInherited = false; resetPending = false; renderPanel();
      });
      stepsEl.appendChild(c);
    });
  }'''
seg=seg[:start]+new+'\n\n'+seg[end:]
start=seg.index('  function renderPanel() {');end=seg.index('  function guessScope()',start)
new=r'''  function loadDraft(cfg) {
    draft = { type: cfg.type, subdivision: cfg.subdivision, swing: cfg.swing };
    draftInherited = current.scope === 'cell' && cfg.source !== 'cell';
    if (cfg.steps) draft.steps = cfg.steps.map(function (v) { return Array.isArray(v) ? v.slice() : v; });
  }
  function renderPanel() {
    if (!panel) return;
    if (!panel.hidden && editingTrackId !== null) {
      var T = tracks(), state = T && T.state();
      if (!state || state.activeTrackId !== editingTrackId) { closePanel(); return; }
    }
    var inheritedSwing = draft.swing === null && sharedRhythm && sharedRhythm.swing === true;
    presetButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-preset') === draft.type && !draft.steps)); });
    if (subSel) subSel.value = String(draft.subdivision);
    if (swingBox) { swingBox.checked = draft.swing === true || !!inheritedSwing; swingBox.disabled = !(draft.subdivision === 2 || draft.subdivision === 4); }
    if (scopeLabel) scopeLabel.textContent = current.scope === 'cell' ? 'только для этой ячейки' : 'по умолчанию для всей секции';
    renderSteps();
    if (footEl) footEl.textContent = resetPending ? 'После сохранения вернётся унаследованный рисунок.' : 'Нажимайте на шаги, чтобы менять аккорд, бас, октаву, арпеджио и паузу.';
  }
  function stopPreview() { if (previewStop) { previewStop(); previewStop = null; } }
  function previewDraft() {
    stopPreview();
    var T = tracks(), A = audio(); if (!T || !A || !HOST.getAudioContext) return;
    var sec = null; try { sec = sections.find(function (s) { return s.id === current.secId; }); } catch (e) {}
    var sq = sec && (sec.squares || []).find(function (q) { return q.id === current.sqId; });
    if (!sq && sec && sec.squares) sq = sec.squares[0];
    var ev = sq && sq.events && sq.events[current.ei || 0];
    var state = T.state(), cell = sec && sq ? T.cellKey(sec, sq, current.ei || 0) : null;
    var chord = cell && T.trackChord(state.activeTrackId, cell, ev);
    if (!chord && sec) {
      (sec.squares || []).some(function (q) { return (q.events || []).some(function (e, i) { chord = T.trackChord(state.activeTrackId, T.cellKey(sec,q,i),e); return !!chord; }); });
    }
    if (!chord) { if (typeof HOST.showToast === 'function') HOST.showToast('Добавьте аккорд для прослушивания'); return; }
    var ctx = HOST.getAudioContext(); if (!ctx) return;
    if (typeof HOST.resumeAudioContext === 'function') HOST.resumeAudioContext();
    var key = sec && sec.key || (typeof globalKey !== 'undefined' ? globalKey : 'C');
    var bpm = sec && typeof getEffectiveBpm === 'function' ? getEffectiveBpm(sec) : 120;
    var span = current.scope === 'cell' && ev ? Number(ev.span) || 1 : numerator(current.ts);
    var config = Object.assign({}, draft);
    if (draftInherited) config.steps = draftSteps();
    previewStop = A.previewPattern(chord, ctx, state.activeTrackId, key, config, {scope:current.scope, span:span, bpm:bpm, ts:current.ts, keyboardSize:draftSize});
  }
  function resetDraft() {
    var T = tracks(), state = T && T.state(); if (!state) return;
    var cfg = current.scope === 'cell' ? resolve(state.activeTrackId, null, current.secId) : {type:DEFAULT_TYPE, subdivision:1, swing:null};
    loadDraft(cfg); resetPending = true;
  }
  function openPanel() {
    guessScope();
    var T = tracks(), state = T && T.state(), track = state && T.track(state.activeTrackId);
    editingTrackId = state ? state.activeTrackId : null; draftSize = track ? track.keyboardSize : null;
    renderSizeOptions();
    var cfg = resolveForScope(); if (cfg) loadDraft(cfg); resetPending = false;
    if (HUB) HUB.opened('acc');
    if (panel) { panel.hidden = false; overlay.hidden = false; }
    renderPanel();
    if (typeof trapFocus === 'function') focusRelease = trapFocus(panel, closePanel);
    var first = panel && panel.querySelector('button'); if (first) first.focus();
  }
  function closePanel() {
    stopPreview();
    if (focusRelease) { focusRelease(); focusRelease = null; }
    if (panel) { panel.hidden = true; overlay.hidden = true; }
    if (HUB) HUB.closed('acc');
  }
  function togglePanel() { if (panel && !panel.hidden) closePanel(); else openPanel(); }'''
seg=seg[:start]+new+'\n\n'+seg[end:]
seg=seg.replace("    current.scope = scope === 'event' ? 'cell' : 'section';\n  }", """    current.scope = scope === 'event' ? 'cell' : 'section';
    try { var sec = sections.find(function (s) { return s.id === secId; }); var sq = sec && (sec.squares || []).find(function (q) { return q.id === sqId; }); var ev = sq && sq.events && sq.events[ei]; current.ts = (ev && ev.timeSig) || (sec && sec.timeSig) || globalTimeSig || '4/4'; } catch (e) { current.ts = '4/4'; }
  }""",1)
seg=seg.replace("    var payload = { type: draft.type, subdivision: draft.subdivision };", "    var payload = { type: draft.type, subdivision: draft.subdivision };\n    if (draft.steps || draftInherited) payload.steps = draftSteps().map(function (v) { return Array.isArray(v) ? v.slice() : v; });",1)
seg=seg.replace("    if (current.cellKey) T.clearPattern(st.activeTrackId, current.cellKey);\n    if (current.secId !== null && current.secId !== undefined) T.clearPattern(st.activeTrackId, 's:' + current.secId);", "    if (current.scope === 'cell' && current.cellKey) T.clearPattern(st.activeTrackId, current.cellKey);\n    else if (current.secId !== null && current.secId !== undefined) T.clearPattern(st.activeTrackId, 's:' + current.secId);",1)
old_nodes = "    var nodes = doc.querySelectorAll('.chord-btn-strum, .strum-badge-wrap, [title*=\"Бой/перебор\"], [data-b39-acc-label]');"
new_nodes = '''    Array.prototype.forEach.call(doc.querySelectorAll('.section-card[data-id] .section-mod-badges'), function (badges) {
      var button = badges.querySelector('.b39-section-accomp');
      if (!on) { if (button) button.remove(); return; }
      if (!button) {
        var card = badges.closest('.section-card');
        button = el('button', 'section-badge b39-section-accomp', 'Аккомп.');
        button.type = 'button'; button.title = 'Аккомпанемент секции';
        button.addEventListener('click', function (e) { e.stopPropagation(); HOST.openStrumPatternEditor('section', Number(card.dataset.id)); });
        badges.appendChild(button);
      }
    });
''' + old_nodes
if seg.count(old_nodes) != 1: raise SystemExit('Нет якоря кнопок секции')
seg=seg.replace(old_nodes,new_nodes,1)
s=prefix+seg+suffix
rep("  strumItem.textContent = 'Бой / перебор';", "  strumItem.textContent = window.StruChordAccomp && window.StruChordAccomp.activeIsKeys() ? 'Аккомпанемент' : 'Бой / перебор';")
# Styling uses shared modal and controls. Both themes via existing tokens.
rep(".home-settings-sections { display: grid;", """.b39-acc-overlay[hidden] { display:none !important; }
.b39-acc-overlay { z-index:20001; }
.b39-acc-editor { display:flex; flex-direction:column; gap:.875rem; }
.b39-acc-editor[hidden] { display:none; }
.b39-acc-editor-top { display:flex; flex-direction:column; align-items:flex-start; gap:.375rem; }
.b39-acc-editor-top h3 { margin:0; font-size:1.125rem; }
.b39-acc-scope { font-size:.6875rem; font-weight:600; color:var(--color-accent); background:var(--color-tint); border-radius:1.25rem; padding:.125rem .625rem; }
.b39-acc-editor .b39-acc-grid { display:flex; flex-wrap:wrap; gap:.35rem; }
.b39-acc-editor .b39-acc-preset { width:auto; height:auto; padding:.4rem .65rem; }
.b39-acc-editor .b39-acc-preset[aria-pressed='true'] { border-color:var(--color-accent); background:var(--color-tint); }
.b39-acc-editor .b39-acc-steps { display:flex; flex-wrap:wrap; gap:.3rem; }
.b39-acc-editor .b39-acc-step { width:auto; min-width:3.7rem; min-height:2.3rem; height:auto; padding:.3rem; font-size:.7rem; }
.b39-acc-editor .pattern-sub-row select { font:inherit; color:inherit; background:var(--color-surface); border:1px solid var(--color-border-medium); border-radius:.5rem; padding:.35rem; }
.b39-acc-actions { display:flex; justify-content:center; flex-wrap:wrap; gap:.5rem; }
.b39-acc-action { padding:.5rem 1rem; background:var(--color-neutral-bg); color:var(--color-text-primary); border:1px solid var(--color-border-medium); border-radius:1.25rem; cursor:pointer; font:inherit; }
.b39-acc-save { background:var(--color-ink); color:var(--color-surface); font-weight:600; }
.home-settings-sections { display: grid;""")
p.write_text(s,encoding='utf-8');print('Патч применён')

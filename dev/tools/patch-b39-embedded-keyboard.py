#!/usr/bin/env python3
"""B-39: встроенная панель клавиатуры и актуальный контекст; поверх 0.721."""
from pathlib import Path
p=Path('STRUCHORD.html'); s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 n=s.count(a)
 if n!=1: raise SystemExit(f'Патч не применён: {n} совпадений: {a[:120]!r}')
 s=s.replace(a,b,1)
rep('''.b39-keys-panel { position: fixed; z-index: 9998; max-width: calc(100vw - 1rem);
  background: var(--color-surface, #fff); color: var(--color-text-primary, #1b1b1b);
  border: 1px solid var(--color-border-medium, #c9cdd4); border-radius: .875rem;
  box-shadow: 0 .75rem 2rem rgba(0,0,0,.22); padding: .6rem .7rem; }
.b39-keys-panel[hidden] { display: none; }
.b39-keys-head { display: flex; align-items: center; gap: .45rem; flex-wrap: wrap;
  margin-bottom: .45rem; }
.b39-keys-title { font-size: .82rem; font-weight: 700; margin-right: .3rem; }
.b39-keys-panel select { font: inherit; font-size: .72rem; padding: .15rem .3rem;
  border-radius: .4rem; border: 1px solid var(--color-border-medium, #c9cdd4);
  background: var(--color-surface, #fff); color: inherit; }
.b39-keys-nav { display: inline-flex; align-items: center; gap: .25rem; }
.b39-keys-nav button { width: 1.4rem; height: 1.4rem; border-radius: .4rem;
  border: 1px solid var(--color-border-medium, #c9cdd4); background: transparent;
  color: inherit; cursor: pointer; padding: 0; font-size: .75rem; }
.b39-keys-count { font-size: .72rem; min-width: 2.6rem; text-align: center;
  color: var(--color-text-secondary, #666); }
.b39-keys-body { overflow-x: auto; overflow-y: hidden; }
.b39-keys-link { display:block; margin-top:.35rem; font-size:.72rem; }
.b39-keys-reset { margin-top:.35rem; padding:.25rem .5rem; border:.0625rem solid var(--color-border-medium); border-radius:.4rem; background:var(--color-surface); color:inherit; font:inherit; font-size:.72rem; cursor:pointer; }
.b39-keys-foot { margin-top: .35rem; font-size: .68rem; line-height: 1.4;
  color: var(--color-text-tertiary, #999); }''','''.b39-keys-panel { box-sizing: border-box; min-width: 0; width: 100%; margin: 0 0 1.25rem;
  background: var(--color-surface, #fff); color: var(--color-text-primary, #1b1b1b);
  border: .0625rem solid var(--color-border-medium, #c9cdd4); border-radius: .875rem;
  box-shadow: var(--shadow-card); padding: .85rem; }
.b39-keys-panel[hidden] { display: none; }
.b39-keys-head { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; margin-bottom: .65rem; }
.b39-keys-title { font-size: 1rem; font-weight: 700; }
.b39-keys-context { font-size: .8rem; color: var(--color-text-secondary, #666); }
.b39-keys-close { margin-left: auto; min-width: 2.5rem; min-height: 2.5rem; border-radius: .5rem;
  border: .0625rem solid var(--color-border-medium); background: var(--color-surface); color: inherit; font: inherit; cursor: pointer; }
.b39-keys-controls { display: flex; flex-wrap: wrap; align-items: end; gap: .65rem; margin-bottom: .65rem; }
.b39-keys-field { display: flex; flex-direction: column; gap: .25rem; font-size: .75rem; color: var(--color-text-secondary, #666); }
.b39-keys-panel select { min-height: 2.5rem; max-width: 100%; font: inherit; font-size: .85rem; padding: .4rem .5rem;
  border-radius: .5rem; border: .0625rem solid var(--color-border-medium, #c9cdd4);
  background: var(--color-surface, #fff); color: var(--color-text-primary, #1b1b1b); }
.b39-keys-nav { display: inline-flex; align-items: center; gap: .25rem; }
.b39-keys-nav button { min-width: 2.5rem; min-height: 2.5rem; border-radius: .5rem;
  border: .0625rem solid var(--color-border-medium, #c9cdd4); background: var(--color-surface);
  color: inherit; cursor: pointer; padding: 0; font-size: 1.15rem; }
.b39-keys-count { font-size: .8rem; min-width: 3rem; text-align: center;
  color: var(--color-text-secondary, #666); }
.b39-keys-body { min-width: 0; max-width: 100%; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; }
.b39-keys-body svg.b39-keys-svg { display: block; width: 100%; height: auto; max-width: none; }
.b39-keys-link { display:block; margin: .4rem 0; font-size:.8rem; }
.b39-keys-reset { margin: .25rem 0 .5rem; min-height: 2.5rem; padding:.4rem .7rem; border:.0625rem solid var(--color-border-medium); border-radius:.5rem; background:var(--color-surface); color:inherit; font:inherit; font-size:.8rem; cursor:pointer; }
.b39-keys-foot { margin-top: .45rem; font-size: .75rem; line-height: 1.4;
  color: var(--color-text-secondary, #666); }''')
rep("  var lastChord = null, lastTrackId = null, lastCellKey = null;", "  var lastChord = null, lastTrackId = null, lastCellKey = null, lastVisibleContext = null, contextEl = null;")
# Resolve structural position anew, including the active track's empty cells.
rep('''  /**
   * Компактная клавиатура для тултипа / закреплённой карточки / панели «Сейчас».''','''  function panelCell(key) {
    if (!key) return null;
    var ids = String(key).split(':'); if (ids.length !== 3) return null;
    try {
      var all = typeof sections !== 'undefined' && Array.isArray(sections) ? sections : (HOST.__b39Sections || []);
      var sec = all.find(function(s) { return String(s.id) === ids[0]; });
      var sq = sec && (sec.squares || []).find(function(q) { return String(q.id) === ids[1]; });
      var index = Number(ids[2]);
      if (!sq || !Number.isInteger(index) || index < 0 || index >= sq.events.length) return null;
      return {sec:sec, sq:sq, ev:sq.events[index], ei:index};
    } catch (e) { return null; }
  }
  function panelKey() { var c = panelCell(lastCellKey); return c && c.sec.key || currentKey(); }
  function panelContext(track, c) {
    if (!c) return track.name;
    var secName = c.sec.type === 'Custom' ? (c.sec.customName || 'Секция') :
      (typeof LABEL_RU !== 'undefined' && LABEL_RU[c.sec.type] || c.sec.type || 'Секция');
    return track.name + ' · ' + secName + ' · квадрат ' + (c.sec.squares.indexOf(c.sq) + 1) + ', ячейка ' + (c.ei + 1);
  }

  /**
   * Компактная клавиатура для тултипа / закреплённой карточки / панели «Сейчас».''')
rep("    panel.setAttribute('role', 'dialog');\n    panel.setAttribute('aria-label', 'Клавиатура дорожки');", "    panel.setAttribute('role', 'region');\n    panel.setAttribute('aria-label', 'Клавиатура дорожки');\n    btn.setAttribute('aria-controls', 'b39KeysPanel');")
rep("    titleEl = el('span', 'b39-keys-title', 'Клавиши');", "    titleEl = el('span', 'b39-keys-title', 'Клавиатура');\n    contextEl = el('span', 'b39-keys-context');")
rep("    sizeSel = el('select'); sizeSel.setAttribute('aria-label', 'Размер клавиатуры');", "    sizeSel = el('select'); sizeSel.setAttribute('aria-label', 'Размер клавиатуры песни');")
rep('''    var close = el('button', '', '×'); close.type = 'button';
    close.setAttribute('aria-label', 'Закрыть'); close.style.cssText =
      'width:1.4rem;height:1.4rem;border-radius:.4rem;border:1px solid var(--color-border-medium,#c9cdd4);background:transparent;color:inherit;cursor:pointer';
    close.addEventListener('click', closePanel);

    head.appendChild(titleEl); head.appendChild(sizeSel); head.appendChild(trackSizeSel); head.appendChild(timbreSel);
    head.appendChild(nav); head.appendChild(close);
    body = el('div', 'b39-keys-body');''','''    var close = el('button', 'b39-keys-close', '×'); close.type = 'button';
    close.setAttribute('aria-label', 'Закрыть клавиатуру'); close.addEventListener('click', closePanel);
    head.appendChild(titleEl); head.appendChild(contextEl); head.appendChild(close);
    var controls = el('div', 'b39-keys-controls');
    function field(label, control) {
      var item = el('label', 'b39-keys-field'); item.appendChild(doc.createTextNode(label)); item.appendChild(control); controls.appendChild(item);
    }
    field('Размер песни', sizeSel); field('Размер дорожки', trackSizeSel); field('Общий тембр клавиш', timbreSel);
    var position = el('div', 'b39-keys-field'); position.appendChild(el('span', '', 'Расположение')); position.appendChild(nav); controls.appendChild(position);
    body = el('div', 'b39-keys-body'); body.setAttribute('role', 'region'); body.setAttribute('aria-label', 'Клавиатура, прокрутка по горизонтали'); body.tabIndex = 0;''')
rep("    panel.appendChild(head);panel.appendChild(linkRow);panel.appendChild(autoChoiceBtn);panel.appendChild(body);panel.appendChild(foot);\n    doc.body.appendChild(panel);", "    panel.appendChild(head);panel.appendChild(controls);panel.appendChild(linkRow);panel.appendChild(autoChoiceBtn);panel.appendChild(body);panel.appendChild(foot);\n    var transport = doc.querySelector('.transport-bar');\n    if (transport && transport.parentNode) transport.parentNode.insertBefore(panel, transport.nextSibling);\n    else doc.body.appendChild(panel);")
rep('''  function positionPanel() {
    if (!panel || !btn || !btn.getBoundingClientRect) return;
    var r = btn.getBoundingClientRect();
    var w = Math.min(760, (HOST.innerWidth || 1024) - 16);
    panel.style.width = w + 'px';
    panel.style.left = Math.max(8, Math.min((HOST.innerWidth || 1024) - w - 8, r.left)) + 'px';
    panel.style.top = (r.bottom + 8) + 'px';
  }
''','')
rep("    positionPanel(); panel.hidden = false; btn.setAttribute('aria-pressed', 'true'); renderPanel();", "    panel.hidden = false; btn.setAttribute('aria-pressed', 'true'); renderPanel();")
rep("    var variants = generateKeysVoicings(lastChord, currentKey(), range, null, {});", "    var variants = generateKeysVoicings(lastChord, panelKey(), range, null, {});")
rep("      titleEl.textContent = 'Клавиши';\n      body.innerHTML", "      titleEl.textContent = 'Клавиатура'; contextEl.textContent = ''; lastChord = null; lastTrackId = null;\n      body.innerHTML")
rep('''    var chord = lastChord || (F ? null : null);
    if (!chord) {
      // Берём первый непустой аккорд активной дорожки из сетки.
      try {
        T.eachCell(function (sec, sq, ev, ei, key) {
          if (chord) return;
          var c = T.trackChord(active.track.id, key, ev);
          if (c) { chord = c; lastCellKey = key; }
        });
      } catch (e) {}
    }
    if (!chord) {
      body.innerHTML = '<div class="b39-keys-foot">В песне пока нет аккордов.</div>';
      countEl.textContent = '—'; foot.textContent = '';
      return;
    }
    lastChord = chord; lastTrackId = active.track.id;
    var variants = generateKeysVoicings(chord, currentKey(), range, null, {});''','''    var cell = panelCell(lastCellKey), chord = null;
    if (cell) chord = T.trackChord(active.track.id, lastCellKey, cell.ev);
    else {
      lastCellKey = null;
      // Нет актуальной ячейки: показываем первый аккорд активной дорожки.
      try {
        T.eachCell(function (sec, sq, ev, ei, key) {
          if (chord) return;
          var c = T.trackChord(active.track.id, key, ev);
          if (c) { chord = c; lastCellKey = key; cell = {sec:sec,sq:sq,ev:ev,ei:ei}; }
        });
      } catch (e) {}
    }
    lastChord = chord || null; lastTrackId = active.track.id;
    contextEl.textContent = panelContext(active.track, cell);
    if (!chord) {
      titleEl.textContent = 'Клавиатура';
      body.innerHTML = '<div class="b39-keys-foot">' + (cell ? 'В этой ячейке нет аккорда активной дорожки.' : 'На активной дорожке пока нет аккордов.') + '</div>';
      countEl.textContent = '—'; foot.textContent = ''; lastVisibleContext = null;
      return;
    }
    var variants = generateKeysVoicings(chord, panelKey(), range, null, {});''')
rep("    var f = F.chordFormula(chord, currentKey());\n    var whiteW = range.size >= 88 ? 12 : range.size >= 61 ? 15 : 20;", "    var f = F.chordFormula(chord, panelKey());\n    var whiteW = 20;")
rep('''    titleEl.textContent = chord;
    body.innerHTML = res.svg;
    countEl.textContent''','''    titleEl.textContent = 'Клавиатура · ' + chord;
    body.innerHTML = res.svg;
    var svg = body.querySelector('svg'); if (svg) svg.style.minWidth = (res.width / 16) + 'rem';
    var visibleContext = active.track.id + '|' + lastCellKey;
    if (lastVisibleContext !== visibleContext && body.scrollWidth > body.clientWidth) {
      var hand = notes.length > 1 ? notes.slice(1) : notes;
      var focus = hand.length ? hand[Math.floor(hand.length / 2)] : range.low;
      var layout = keyLayout(range.low, range.high, whiteW, 78);
      var focusKey = layout.keys.find(function(k) { return k.midi === focus; });
      if (focusKey) body.scrollLeft = Math.max(0, focusKey.x * body.scrollWidth / res.width - body.clientWidth / 2);
    }
    lastVisibleContext = visibleContext;
    countEl.textContent''')
rep("      (showFingersEnabled() ? ' · цифры условны, это не аппликатура' : '');\n  }\n\n  function onAudioEvent(info)", "      (showFingersEnabled() ? ' · цифры условны, это не аппликатура' : '') +\n      (body.scrollWidth > body.clientWidth ? ' · клавиатуру можно прокручивать вбок' : '');\n  }\n\n  function onAudioEvent(info)")
rep('''    if (T && active && active.track && info && info.ev) {
      var chord = T.trackChord(active.track.id, info.cell, info.ev);
      if (chord) lastChord = chord;
      lastCellKey = info.cell || lastCellKey;
      lastTrackId = active.track.id;
    }''','''    if (T && active && active.track && info && info.cell && panelCell(info.cell)) {
      lastCellKey = info.cell;
    }''')
# A preview with a real cell updates display only; audio and track routing stay untouched.
rep('''      notes.forEach(function (midi) { playNote(ctx, channel, midi, now, 0.55, level); });
    });
  }

  function previewPattern''','''      notes.forEach(function (midi) { playNote(ctx, channel, midi, now, 0.55, level); });
    });
    if (cell && eventNotifier) {
      try { eventNotifier({cell:cell}); } catch (e) {}
    }
  }

  function previewPattern''')

rep('.b39-keys-title { font-size: 1rem; font-weight: 700; }\n.b39-keys-context { font-size: .8rem; color: var(--color-text-secondary, #666); }', '.b39-keys-title { flex: 1 1 auto; font-size: 1rem; font-weight: 700; }\n.b39-keys-context { flex-basis: 100%; font-size: .8rem; color: var(--color-text-secondary, #666); }')
rep('.b39-keys-controls { display: flex; flex-wrap: wrap; align-items: end; gap: .65rem; margin-bottom: .65rem; }\n.b39-keys-field { display: flex; flex-direction: column; gap: .25rem; font-size: .75rem; color: var(--color-text-secondary, #666); }\n.b39-keys-panel select { min-height: 2.5rem; max-width: 100%;', '.b39-keys-controls { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); align-items: end; gap: .65rem; margin-bottom: .65rem; }\n.b39-keys-field { min-width: 0; display: flex; flex-direction: column; gap: .25rem; font-size: .75rem; color: var(--color-text-secondary, #666); }\n.b39-keys-panel select { min-height: 2.5rem; width: 100%; max-width: 100%;')
rep('.fingering-svg-container svg.b39-keys-svg { max-width: 100%; height: auto; }', '''@media (max-width: 640px) {
  .b39-keys-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .b39-keys-position { grid-column: 1 / -1; }
}
.fingering-svg-container svg.b39-keys-svg { max-width: 100%; height: auto; }''')
rep("var op = el('option', '', n + ' клавиш дорожки');", "var op = el('option', '', n + ' клавиш');")
rep("    head.appendChild(titleEl); head.appendChild(contextEl); head.appendChild(close);", "    head.appendChild(titleEl); head.appendChild(close); head.appendChild(contextEl);")
rep("    var position = el('div', 'b39-keys-field');", "    var position = el('div', 'b39-keys-field b39-keys-position');")
rep("    titleEl.textContent = 'Клавиатура · ' + chord;\n    body.innerHTML = res.svg;", "    titleEl.textContent = 'Клавиатура · ' + chord;\n    var oldScroll = body.scrollLeft;\n    body.innerHTML = res.svg;")
rep("    lastVisibleContext = visibleContext;\n    countEl.textContent", "    else if (lastVisibleContext === visibleContext) body.scrollLeft = oldScroll;\n    lastVisibleContext = visibleContext;\n    countEl.textContent")

rep("    open: openPanel, close: closePanel, toggle: togglePanel, render: renderPanel,\n    generateKeysVoicings:", "    open: openPanel, close: closePanel, toggle: togglePanel, render: renderPanel, focusCell: function (key) { onAudioEvent({cell:key}); },\n    generateKeysVoicings:")
rep("        if (consumeWheelRetargetClick(inp)) return;\n        if (playbackState.isPlaying) {", "        if (consumeWheelRetargetClick(inp)) return;\n        if (window.StruChordKeys && window.StruChordKeys.focusCell) {\n          window.StruChordKeys.focusCell(w.dataset.sec + ':' + w.dataset.square + ':' + w.dataset.ei);\n        }\n        if (playbackState.isPlaying) {")

rep("    panel.hidden = false; btn.setAttribute('aria-pressed', 'true'); renderPanel();", "    panel.hidden = false; btn.setAttribute('aria-pressed', 'true'); renderPanel();\n    if (typeof HOST.updatePinnedShift === 'function') HOST.updatePinnedShift();")
rep("    panel.hidden = true; btn.setAttribute('aria-pressed', 'false');\n    if (HUB) HUB.closed('keys');", "    panel.hidden = true; btn.setAttribute('aria-pressed', 'false');\n    if (typeof HOST.updatePinnedShift === 'function') HOST.updatePinnedShift();\n    if (HUB) HUB.closed('keys');")
rep("  const row = document.getElementById('pinnedRow');\n  if (!grid || !bar || !row) return;\n  const shown =", "  const row = document.getElementById('pinnedRow');\n  const keyboardPanel = document.getElementById('b39KeysPanel');\n  if (!grid || !bar || !row) return;\n  const panelOpen = keyboardPanel && !keyboardPanel.hidden;\n  const shown =")
rep('''    const rowBottom = barTop + bar.offsetHeight + 10 + row.offsetHeight;
    shift = Math.max(0, rowBottom + 8 - grid.offsetTop);
  }
  // B-42''','''    const rowBottom = barTop + bar.offsetHeight + 10 + row.offsetHeight;
    // Открытая встроенная клавиатура находится раньше сетки: резерв нужен
    // перед ней, а не только перед квадратами. Вычитаем уже заданный
    // отступ, чтобы повторные вызовы при проигрывании не раскачивали его.
    const currentMargin = panelOpen ? (parseFloat(keyboardPanel.style.marginTop) || 0) : 0;
    const targetTop = panelOpen ? keyboardPanel.offsetTop - currentMargin : grid.offsetTop;
    shift = Math.max(0, rowBottom + 8 - targetTop);
  }
  if (keyboardPanel) {
    const margin = panelOpen && shift > 0 ? shift.toFixed(1) + 'px' : '';
    if (keyboardPanel.style.marginTop !== margin) keyboardPanel.style.marginTop = margin;
    if (panelOpen) shift = 0;
  }
  // B-42''')

a='''    // Открытая встроенная клавиатура находится раньше сетки: резерв нужен
    // перед ней, а не только перед квадратами. Вычитаем уже заданный
    // отступ, чтобы повторные вызовы при проигрывании не раскачивали его.
    const currentMargin = panelOpen ? (parseFloat(keyboardPanel.style.marginTop) || 0) : 0;
    const targetTop = panelOpen ? keyboardPanel.offsetTop - currentMargin : grid.offsetTop;
    shift = Math.max(0, rowBottom + 8 - targetTop);'''
b='''    // Соседние вертикальные margin могут схлопываться. Для встроенной
    // панели считаем от нижнего края транспорта, а не от текущей позиции
    // панели — тогда повторные вызовы не меняют рассчитанный резерв.
    const targetTop = panelOpen ? barTop + bar.offsetHeight : grid.offsetTop;
    shift = Math.max(0, rowBottom + 8 - targetTop);'''
rep(a,b)

rep('  box-shadow: var(--shadow-card); padding: .85rem; }\n.b39-keys-panel[hidden]', '  box-shadow: var(--shadow-card); padding: .85rem; scroll-margin-top: 8rem; }\n.b39-keys-panel[hidden]')
rep("  function togglePanel() { if (!panel) return; panel.hidden ? openPanel() : closePanel(); }\n\n  function stepVariant", """  function togglePanel() {
    if (!panel) return;
    if (!panel.hidden) { closePanel(); return; }
    openPanel();
    var r = panel.getBoundingClientRect();
    if (r.top < 0 || r.top > (HOST.innerHeight || 600) - 160) panel.scrollIntoView({block:'start'});
  }

  function stepVariant""")

rep("r.top > (HOST.innerHeight || 600) - 160", "r.top > (HOST.innerHeight || 600) * 0.8")

rep('.transport-bar:not(.is-mobile-expanded) .b39-keys-btn,\n  .transport-bar:not(.is-mobile-expanded) .b39-acc-btn,\n  .transport-bar:not(.is-mobile-expanded) .b39-wrap { display: none !important; }', '.transport-bar:not(.is-mobile-more-open) .b39-keys-btn,\n  .transport-bar:not(.is-mobile-more-open) .b39-acc-btn,\n  .transport-bar:not(.is-mobile-more-open) .b39-wrap { display: none !important; }')
rep("  .transport-btn.b39-keys-btn::before { content: '🎹'; font-size: .85rem; }\n  .transport-btn.b39-acc-btn::before { content: '🎼'; font-size: .85rem; }", '  .transport-btn.b39-keys-btn::before, .transport-btn.b39-acc-btn::before { content: none; }\n  .transport-btn.b39-keys-btn .b39-btn-label, .transport-btn.b39-acc-btn .b39-btn-label,\n  .transport-btn.b39-btn .b39-btn-label { display: none; }\n  .transport-btn.b39-btn { justify-content: center; }')
rep("    if (r.top < 0 || r.top > (HOST.innerHeight || 600) * 0.8) panel.scrollIntoView({block:'start'});", "    var bar = btn.closest('.transport-bar'), bottom = bar ? bar.getBoundingClientRect().bottom : 0;\n    if (r.top < bottom || r.top > (HOST.innerHeight || 600) * 0.8) panel.scrollIntoView({block:'start'});")
rep('      try { store.subscribe(function () { clearLinkedCache(); renderPanel(); }); } catch (e) {}', "      try { store.subscribe(function (command) { if (command && command.label === 'song/clear') { lastCellKey = null; lastChord = null; lastTrackId = null; lastVisibleContext = null; } clearLinkedCache(); renderPanel(); }); } catch (e) {}")
p.write_text(s,encoding='utf-8')
print('Патч панели клавиатуры применён')

#!/usr/bin/env python3
"""B-39: наведение на ячейку и компактный контекст панели поверх 0.726."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 n=s.count(a)
 if n!=1: raise SystemExit(f'{n} совпадений: {a[:100]!r}')
 s=s.replace(a,b,1)
rep('''.b39-keys-context { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:.75rem; color:var(--color-text-secondary, #666); }''','''.b39-keys-context { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:.75rem; color:var(--color-text-secondary, #666); }
.b39-keys-bass { flex:0 0 auto; white-space:nowrap; font-size:.75rem; color:var(--color-text-secondary, #666); }''')
rep('''  var lastChord = null, lastTrackId = null, lastCellKey = null, lastVisibleContext = null, contextEl = null, settingsContext = null;''','''  var lastChord = null, lastTrackId = null, lastCellKey = null, lastVisibleContext = null, contextEl = null, bassEl = null, settingsContext = null;
  var hoverBaseKey = null, hoverActive = false, hoverTimer = null;''')
rep('''    if (!c) return track.name;
    var secName = c.sec.type === 'Custom' ? (c.sec.customName || 'Секция') :
      (typeof LABEL_RU !== 'undefined' && LABEL_RU[c.sec.type] || c.sec.type || 'Секция');
    return track.name + ' · ' + secName + ' · квадрат ' + (c.sec.squares.indexOf(c.sq) + 1) + ', ячейка ' + (c.ei + 1);''','''    var trackName = track.name === 'Клавиши' ? '' : track.name;
    if (!c) return trackName;
    var secName = c.sec.type === 'Custom' ? (c.sec.customName || 'Секция') :
      (typeof LABEL_RU !== 'undefined' && LABEL_RU[c.sec.type] || c.sec.type || 'Секция');
    return (trackName ? trackName + ' · ' : '') + secName + ' · квадрат ' + (c.sec.squares.indexOf(c.sq) + 1) + ', ячейка ' + (c.ei + 1);''')
rep('''    contextEl = el('span', 'b39-keys-context');''','''    contextEl = el('span', 'b39-keys-context'); bassEl = el('span', 'b39-keys-bass');''')
rep("var identity = el('div', 'b39-keys-identity'); identity.appendChild(titleEl); identity.appendChild(contextEl);", "var identity = el('div', 'b39-keys-identity'); identity.appendChild(titleEl); identity.appendChild(contextEl); identity.appendChild(bassEl);")
rep("    HOST.addEventListener('resize', syncStickyOffset);\n    syncStickyOffset();", "    HOST.addEventListener('resize', syncStickyOffset);\n    installCellHover();\n    syncStickyOffset();")
rep('''  }
  function openPanel() {
    if (!panel) return;
    if (HUB) HUB.opened('keys');''','''  }
  // Одно обновление при входе в новую ячейку; на pointermove ничего не рисуем.
  function installCellHover() {
    doc.addEventListener('pointerover', function (e) {
      if (!panel || panel.hidden || (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen')) return;
      if (e.buttons || (HOST.playbackState && HOST.playbackState.isPlaying) ||
          (typeof isDragging !== 'undefined' && isDragging) || doc.body.classList.contains('is-resizing')) return;
      var wrapper = e.target.closest && e.target.closest('.chord-wrapper');
      if (!wrapper || (e.relatedTarget && wrapper.contains(e.relatedTarget))) return;
      var active = activeTrack(), T = tracks();
      if (!active || !active.track || active.track.instrument !== 'keys' || !T) return;
      var key = wrapper.dataset.sec + ':' + wrapper.dataset.square + ':' + wrapper.dataset.ei;
      var cell = panelCell(key);
      if (!cell || !T.trackChord(active.track.id, key, cell.ev)) return;
      if (hoverTimer) { HOST.clearTimeout(hoverTimer); hoverTimer = null; }
      if (!hoverActive) { hoverBaseKey = lastCellKey; hoverActive = true; }
      if (lastCellKey !== key) { lastCellKey = key; renderPanel(); }
    });
    doc.addEventListener('pointerout', function (e) {
      if (!hoverActive || !panel || panel.hidden) return;
      var fromCell = e.target.closest && e.target.closest('.chord-wrapper');
      var fromPanel = panel.contains(e.target);
      if (!fromCell && !fromPanel) return;
      var next = e.relatedTarget;
      if (next && ((fromCell && fromCell.contains(next)) || panel.contains(next))) return;
      if (hoverTimer) HOST.clearTimeout(hoverTimer);
      hoverTimer = HOST.setTimeout(function () { hoverTimer = null; restoreHover(); }, 300);
    });
  }
  function restoreHover() {
    if (hoverTimer) { HOST.clearTimeout(hoverTimer); hoverTimer = null; }
    if (!hoverActive) return;
    hoverActive = false; lastCellKey = hoverBaseKey; hoverBaseKey = null;
    renderPanel();
  }
  function openPanel() {
    if (!panel) return;
    if (HUB) HUB.opened('keys');''')
rep('''    panel.hidden = true; doc.body.classList.remove('b39-keys-open');''','''    restoreHover(); panel.hidden = true; doc.body.classList.remove('b39-keys-open');''')
rep("titleEl.textContent = 'Клавиатура'; contextEl.textContent = ''; lastChord = null; lastTrackId = null;", "titleEl.textContent = 'Клавиатура'; contextEl.textContent = ''; bassEl.textContent = ''; lastChord = null; lastTrackId = null;")
rep("      countEl.textContent = '—'; foot.textContent = ''; lastVisibleContext = null;", "      countEl.textContent = '—'; foot.textContent = ''; bassEl.textContent = ''; lastVisibleContext = null;")
rep("    if (bass !== null) footParts.push('бас ' + noteLabel(bass, f ? f.keyStyle : 'sharp'));", "    bassEl.textContent = bass !== null ? '· бас ' + noteLabel(bass, f ? f.keyStyle : 'sharp') : '';\n    settingsContext.textContent = contextEl.textContent + (bassEl.textContent ? ' ' + bassEl.textContent : '');")
rep('''  function onAudioEvent(info) {
    var T = tracks(), active = activeTrack();''','''  function onAudioEvent(info) {
    if (hoverTimer) { HOST.clearTimeout(hoverTimer); hoverTimer = null; }
    hoverActive = false; hoverBaseKey = null;
    var T = tracks(), active = activeTrack();''')
rep("if (command && command.label === 'song/clear') { lastCellKey = null; lastChord = null; lastTrackId = null; lastVisibleContext = null; }", "if (command && command.label === 'song/clear') { hoverActive = false; hoverBaseKey = null; if (hoverTimer) HOST.clearTimeout(hoverTimer); hoverTimer = null; lastCellKey = null; lastChord = null; lastTrackId = null; lastVisibleContext = null; }")
rep('      if (e.buttons || (HOST.playbackState && HOST.playbackState.isPlaying) ||',"      if (panel.contains(e.target)) { if (hoverTimer) { HOST.clearTimeout(hoverTimer); hoverTimer = null; } return; }\n      if (e.buttons || (typeof playbackState !== 'undefined' && playbackState.isPlaying) ||")
rep('  // Аппликатура закреплена в панели — всплывающий тултип не нужен.\n',"  // Открытая панель клавиш сама показывает наведение; дублирующий тултип не нужен.\n  const keysPanel = document.getElementById('b39KeysPanel');\n  const keysTrack = window.StruChordTracks && window.StruChordTracks.track(window.StruChordTracks.state().activeTrackId);\n  if (!isPreview && !playbackState.isPlaying && !isFingeringPinned() && keysPanel && !keysPanel.hidden && keysTrack && keysTrack.instrument === 'keys') {\n    hideFingeringTooltip(false);\n    return;\n  }\n  // Аппликатура закреплена в панели — всплывающий тултип не нужен.\n")
rep("    doc.addEventListener('pointerout', function (e) {\n      if (!hoverActive || !panel || panel.hidden) return;","    doc.addEventListener('pointerdown', function (e) {\n      // До начала перетаскивания вернуть обычный контекст, а не рисовать во время жеста.\n      if (hoverActive && panel && !panel.contains(e.target)) restoreHover();\n    });\n    doc.addEventListener('pointerout', function (e) {\n      if (!hoverActive || !panel || panel.hidden) return;")
p.write_text(s,encoding='utf-8');print('Наведение и строка контекста обновлены')

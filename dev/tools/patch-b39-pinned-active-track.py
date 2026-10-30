#!/usr/bin/env python3
"""Активная дорожка в закреплённой аппликатуре. Применять к 0.754."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 if s.count(a)!=1: raise SystemExit('Ожидалось одно совпадение, найдено %s: %s'%(s.count(a),a[:120]))
 s=s.replace(a,b,1)
rep("let pinnedFingering = null;   // { secId, squareId, eventIndex, chord, shape }", """let pinnedFingering = null;   // { secId, squareId, eventIndex, chord, shape }
let pinnedPlaybackPosition = null;
let pinnedPlaybackNext = null;

function pinnedTrackContext(pos, active) {
  const T=window.StruChordTracks, state=active ? active.state : T && T.state();
  const track=active ? active.track : state && state.tracks.find(t=>t.id===state.activeTrackId);
  const sec=pos && sections.find(s=>s.id===pos.secId);
  const sq=sec && sec.squares.find(q=>q.id===pos.squareId);
  const ev=sq && sq.events && sq.events[pos.eventIndex];
  const cell=pos && pos.secId+':'+pos.squareId+':'+pos.eventIndex;
  const chord=track && ev ? (T.trackChord(track.id,cell,ev)||'').trim() : (!track && ev ? (ev.chord||'').trim() : '');
  return {T,state,track,sec,ev,cell,chord};
}""")
rep("function renderPinnedFingering(chordName, shape) {", "function renderPinnedFingering(chordName, shape, position) {")
start=s.index("  const name = chordName || pinnedFingering.chord;",s.index('function renderPinnedFingering'))
end=s.index("  updatePinnedShift();\n}",start)
s=s[:start]+'''  const pos=position || (playbackState.isPlaying && pinnedPlaybackPosition) || pinnedFingering;
  const info=pinnedTrackContext(pos);
  // При восстановлении и переключении дорожек читаем текущую ячейку,
  // а не прежнее имя, сохранённое в момент закрепления.
  const name = chordName === undefined ? info.chord : chordName;
  const content = host.querySelector('.fingering-content');
  if (!name) {
    swapFingeringContent(content, 'empty', '<span class="fingering-chord-name">—</span>');
    updatePinnedShift();
    return;
  }
  const key = info.sec && info.sec.key ? info.sec.key : globalKey;
  const posKey = buildFingeringPositionKey(name,key,pos.secId,pos.squareId,pos.eventIndex);
  const own=info.track && info.track.instrument==='guitar' && info.track.id!==info.state.mainTrackId;
  const choice=own && info.T.guitarShape(info.track.id,info.cell,name);
  const keys=info.track && info.track.instrument==='keys';
  const form=keys ? null : (shape || (own ? (choice ? choice.shape : resolveFingeringShape(name,key,null)) : resolveFingeringShape(name,key,posKey,info.ev)));
  const barreOff=keys ? null : own ? (choice && choice.barreOff) : barreOffForEventShape(info.ev,form);
  const fingers=keys ? null : own ? (choice && choice.fingers) : fingersForEventShape(info.ev,form);
  const svg=keys && window.StruChordKeys
    ? window.StruChordKeys.renderKeysVoicingSVG(name,info.track.id,{cellKey:info.cell}) || ''
    : form ? renderFingeringSVG(form,24,{scale:1.08,barreOff,customFingers:fingers,chord:name,cellKey:info.cell}) || '' : '';
  if (!svg) {
    swapFingeringContent(content, 'none:'+name,
      '<span class="fingering-chord-name">'+renderFingeringChordNameHtml(name)+'</span>'+
      '<span style="color:var(--color-text-tertiary);font-size:0.75rem">Нет аппликатуры</span>');
    updatePinnedShift();
    return;
  }
  // В ключе учитываем расположение, дорожку и пальцы: одинаковое имя
  // в другой ячейке не должно оставлять устаревшую форму.
  const identity=name+'|'+(info.track ? info.track.id : '')+'|'+info.cell+'|'+
    (Array.isArray(form) ? form.join(',') : String(form))+'|'+JSON.stringify([barreOff,fingers]);
  swapFingeringContent(content,identity,
    `<span class="fingering-chord-name">${renderFingeringChordNameHtml(name)}</span>`+
    `<div class="fingering-svg-container">${svg}</div>`);
''' + s[end:]
start=s.index('  const sec = sections.find((x) => x.id === pos.secId);',s.index('function renderPinnedNext'))
end=s.index("  host.style.display = 'block';",start)
s=s[:start]+'''  const info=pinnedTrackContext(pos), chord=info.chord;
  if (!chord) { renderPinnedNext(null); return; }
  const key=info.sec && info.sec.key ? info.sec.key : globalKey;
  const posKey=buildFingeringPositionKey(chord,key,pos.secId,pos.squareId,pos.eventIndex);
  const own=info.track && info.track.instrument==='guitar' && info.track.id!==info.state.mainTrackId;
  const choice=own && info.T.guitarShape(info.track.id,info.cell,chord);
  const keys=info.track && info.track.instrument==='keys';
  const form=keys ? null : own ? (choice ? choice.shape : resolveFingeringShape(chord,key,null)) : resolveFingeringShape(chord,key,posKey,info.ev);
  const barreOff=keys ? null : own ? (choice && choice.barreOff) : barreOffForEventShape(info.ev,form);
  const fingers=keys ? null : own ? (choice && choice.fingers) : fingersForEventShape(info.ev,form);
  const svg=keys && window.StruChordKeys
    ? window.StruChordKeys.renderKeysVoicingSVG(chord,info.track.id,{cellKey:info.cell}) || ''
    : form ? renderFingeringSVG(form,24,{scale:1.08,barreOff,customFingers:fingers,chord,cellKey:info.cell}) || '' : '';
  if (!svg) { renderPinnedNext(null); return; }
  const identity=chord+'|'+(info.track ? info.track.id : '')+'|'+info.cell+'|'+
    (Array.isArray(form) ? form.join(',') : String(form))+'|'+JSON.stringify([barreOff,fingers]);
  swapFingeringContent(host.querySelector('.fingering-content'),identity,
    `<span class="fingering-chord-name">${renderFingeringChordNameHtml(chord)}</span>`+
    `<div class="fingering-svg-container">${svg}</div>`);
''' + s[end:]
rep("function findNextChordAfter(secId, squareId, eventIndex) {\n  const flat = [];", "function findNextChordAfter(secId, squareId, eventIndex) {\n  const flat = [];\n  const active=pinnedTrackContext(null);")
rep("    flat.push({ secId: sec.id, squareId: sq.id, eventIndex: i, chord: (ev.chord || '').trim() });", "    const pos={secId:sec.id,squareId:sq.id,eventIndex:i};\n    flat.push({...pos,chord:active.track ? (active.T.trackChord(active.track.id,active.T.cellKey(sec,sq,i),ev)||'').trim() : (ev.chord||'').trim()});")
rep("  if (!pos || !pos.chord) {\n    host.style.display = 'none';", "  if (!pos) {\n    host.style.display = 'none';")
rep("  if (el.dataset.swapKey === key) {\n    el.innerHTML = html;\n    return;\n  }", "  if (el.dataset.swapKey === key) {\n    if (el.classList.contains('pin-fade-out')) {\n      if (el.dataset.swapTimer) { clearTimeout(+el.dataset.swapTimer); el.dataset.swapTimer=''; }\n      el.classList.remove('pin-fade-out');\n    }\n    el.innerHTML = html;\n    return;\n  }")
rep("  pinnedFingering = null;\n  pinnedHoverWrapper = null;\n  renderPinnedFingering();", "  pinnedFingering = null;\n  pinnedPlaybackPosition = null; pinnedPlaybackNext = null;\n  pinnedHoverWrapper = null;\n  renderPinnedFingering();")
start=s.index('  if (!pinnedFingering || !chordName) return;',s.index('function syncPinnedFingeringWithPlayback'))
end=s.index('\n}',start)
s=s[:start]+'''  if (!pinnedFingering) return;
  pinnedPlaybackPosition={secId,squareId,eventIndex};
  pinnedPlaybackNext=nextPos || null;
  renderPinnedFingering(undefined,undefined,pinnedPlaybackPosition);
  renderPinnedNext(pinnedPlaybackNext);
''' +s[end:]
rep("  renderPinnedFingering(chord, form);\n}\n\n// Остановились", "  renderPinnedFingering(chord, form, {secId,squareId:+wrapper.dataset.square,eventIndex:+wrapper.dataset.ei});\n}\n\n// Остановились")
rep("  if (!pinnedFingering) return;\n  renderPinnedFingering();\n  // B-36 (0.152):", "  if (!pinnedFingering) return;\n  pinnedPlaybackPosition=null; pinnedPlaybackNext=null;\n  renderPinnedFingering(undefined,undefined,pinnedFingering);\n  // B-36 (0.152):")
start=s.index('  if (isFingeringPinned() && next.event.chord && next.event.chord.trim()) {')
end=s.index("\n\n  if (previewEvent &&",start)
s=s[:start]+'''  if (isFingeringPinned()) {
    const nextPos = previewEvent ? {
      secId: previewEvent.section.id, squareId: previewEvent.square.id,
      eventIndex: previewEvent.eventIndex, chord: pinnedTrackContext({
        secId:previewEvent.section.id,squareId:previewEvent.square.id,eventIndex:previewEvent.eventIndex
      }).chord
    } : null;
    syncPinnedFingeringWithPlayback('', next.section.id, next.square.id, next.eventIndex, nextPos);
  }''' +s[end:]
rep("  const form=hoverOwn ? (hoverChoice ? hoverChoice.shape : resolveFingeringShape(chord,key,null)) : resolveFingeringShape(chord, key, posKey);", "  const hoverActive=pinnedTrackContext({secId,squareId:+wrapper.dataset.square,eventIndex:+wrapper.dataset.ei});\n  const form=hoverActive.track && hoverActive.track.instrument==='keys' ? null : hoverOwn ? (hoverChoice ? hoverChoice.shape : resolveFingeringShape(chord,key,null)) : resolveFingeringShape(chord, key, posKey);")
rep("  if (host && host.dataset.swapKey === chord + '|' + formKey) return;", """  const info=pinnedTrackContext({secId,squareId:+wrapper.dataset.square,eventIndex:+wrapper.dataset.ei});
  const own=info.track && info.track.instrument==='guitar' && info.track.id!==info.state.mainTrackId;
  const choice=own && info.T.guitarShape(info.track.id,info.cell,chord);
  const keys=info.track && info.track.instrument==='keys';
  const bo=keys ? null : own ? (choice && choice.barreOff) : barreOffForEventShape(info.ev,form);
  const fingers=keys ? null : own ? (choice && choice.fingers) : fingersForEventShape(info.ev,form);
  const identity=chord+'|'+(info.track ? info.track.id : '')+'|'+info.cell+'|'+formKey+'|'+JSON.stringify([bo,fingers]);
  if (host && host.dataset.swapKey === identity && !host.classList.contains('pin-fade-out')) return;""")
# При смене дорожки обновляем закреплённую карточку сразу, не дожидаясь
# следующего такта. Состояние песни и тайминг не меняются.
rep("function restorePinnedFingering() {", """songStore.subscribe((command) => {
  if (!command || command.label!=='b39/track-active' || !pinnedFingering) return;
  pinnedHoverWrapper=null;
  renderPinnedFingering();
  if (playbackState.isPlaying) renderPinnedNext(pinnedPlaybackNext);
});

function restorePinnedFingering() {""")
rep("  if (typeof renderPinnedNext === 'function' && typeof lastPinnedNextPos !== 'undefined') renderPinnedNext(lastPinnedNextPos);", "  if (typeof renderPinnedNext === 'function' && playbackState.isPlaying) renderPinnedNext(pinnedPlaybackNext);")
p.write_text(s,encoding='utf-8')

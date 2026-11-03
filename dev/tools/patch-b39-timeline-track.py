#!/usr/bin/env python3
"""0.753: активная дорожка в ленте; данные и транспорт не меняются."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 if s.count(a)!=1: raise SystemExit('Expected 1, got %d: %r'%(s.count(a),a[:140]))
 s=s.replace(a,b,1)
rep("function buildTimelineCell(sec, sq, ev, ei, parentTs, dist, secPass, sqPass, harmonyByEvent) {", """function timelineActiveTrack() {
  const T=window.StruChordTracks;
  if(!T)return null;
  const st=T.state(), track=st.tracks.find(t=>t.id===st.activeTrackId);
  return track ? {id:track.id, instrument:track.instrument, main:track.id===st.mainTrackId} : null;
}
function timelineChord(sec,sq,ev,ei,track) {
  const T=window.StruChordTracks;
  if(!track || !T)return ev ? String(ev.chord||'').trim() : '';
  return String(T.trackChord(track.id,T.cellKey(sec,sq,ei),ev)||'').trim();
}
function buildTimelineCell(sec, sq, ev, ei, parentTs, dist, secPass, sqPass, harmonyByEvent, displayTrack) {""")
rep("  const chord = (ev.chord || '').trim();\n  const harmony = harmonyByEvent?.get(`${sq.id}:${ei}`);", "  const chord = timelineChord(sec,sq,ev,ei,displayTrack);\n  const harmony = (!displayTrack || displayTrack.main) ? harmonyByEvent?.get(`${sq.id}:${ei}`) : null;")
rep("  const frag = document.createDocumentFragment();\n\n  // Повторы РАЗВЁРНУТЫ в линию", "  const frag = document.createDocumentFragment();\n  const displayTrack=timelineActiveTrack();\n\n  // Повторы РАЗВЁРНУТЫ в линию")
rep("                harmonyByEvent\n              )\n            );", "                harmonyByEvent,\n                displayTrack\n              )\n            );")
rep("  updateTimelineEmptyState();\n}\n\n// Сквозная дорожка ритма", "  updateTimelineEmptyState(displayTrack);\n}\n\n// Сквозная дорожка ритма")
rep("function timelineHasChords() {\n  return sections.some((sec) =>\n    (sec.squares || []).some((sq) =>\n      sq.type === 'tab' || (sq.events || []).some((ev) => isInlineTabEvent(ev) || (ev.chord || '').trim() !== '')\n    )\n  );\n}", """function timelineHasChords() {
  // Пустая активная дорожка не делает пустой всю песню: остальные звучат.
  const T=window.StruChordTracks, st=T && T.state();
  const tracks=st ? st.tracks : [];
  return sections.some(sec => (sec.squares || []).some(sq => sq.type==='tab' ||
    (sq.events || []).some((ev,ei) => isInlineTabEvent(ev) || (ev.chord || '').trim() ||
      tracks.some(t => timelineChord(sec,sq,ev,ei,{id:t.id})))));
}""")
rep("  const T=window.StruChordTracks, state=T && T.state(), active=state && state.tracks.find(t=>t.id===state.activeTrackId);\n  const own=active && active.instrument==='guitar' && active.id!==state.mainTrackId;\n  const chord = own ? (T.trackChord(active.id,secId+':'+sqId+':'+ei,ev)||'') : ev ? (ev.chord || '').trim() : '';\n  fillTimelinePanel('now', chord, {\n    trackId:own ? active.id : undefined,", """  const active=timelineActiveTrack();
  const chord=timelineChord(sec,sq,ev,ei,active);
  fillTimelinePanel('now', chord, {
    trackId:active && !active.main && active.instrument==='guitar' ? active.id : undefined,""")
rep("  const svgHtml = shape ? renderFingeringSVG(shape, undefined, { barreOff, customFingers: fingers, chord: chord, cellKey: b39CellKey }) || '' : '';", """  const displayTrack=timelineActiveTrack();
  const svgHtml = displayTrack && displayTrack.instrument==='keys' && window.StruChordKeys
    ? window.StruChordKeys.renderKeysVoicingSVG(text,displayTrack.id,{cellKey:b39CellKey}) || ''
    : shape ? renderFingeringSVG(shape, undefined, { barreOff, customFingers: fingers, chord: text, cellKey: b39CellKey }) || '' : '';""")
rep("  updateTimelineSectionNav();\n  fillTimelinePanel('now', next.event.chord, {\n    secId: next.section.id,", """  updateTimelineSectionNav();
  const displayTrack=timelineActiveTrack();
  fillTimelinePanel('now', timelineChord(next.section,next.square,next.event,next.eventIndex,displayTrack), {
    trackId:displayTrack && !displayTrack.main && displayTrack.instrument==='guitar' ? displayTrack.id : undefined,
    secId: next.section.id,""")
rep("  while (after && !(after.event.chord || '').trim() && guard++ < 64) {", "  while (after && !timelineChord(after.section,after.square,after.event,after.eventIndex,displayTrack) && guard++ < 64) {")
rep("    fillTimelinePanel('next', after.event.chord, {\n      secId: after.section.id,", """    fillTimelinePanel('next', timelineChord(after.section,after.square,after.event,after.eventIndex,displayTrack), {
      trackId:displayTrack && !displayTrack.main && displayTrack.instrument==='guitar' ? displayTrack.id : undefined,
      secId: after.section.id,""")
rep("  const own=active && active.instrument==='guitar' && active.id!==state.mainTrackId;\n  const ownCell=pos.secId+':'+pos.sqId+':'+pos.ei;", "  if(active && active.instrument==='keys'){if(bar)bar.remove();return;}\n  const own=active && active.instrument==='guitar' && active.id!==state.mainTrackId;\n  const ownCell=pos.secId+':'+pos.sqId+':'+pos.ei;")
# active switches do not change data, refresh paused panel after full scheduled render.
rep("function renderDependentLayers() {\n", """function renderDependentLayers() {
""") if False else None
rep("  if (timelineMode) {\n    renderTimeline();\n    syncTimelineSongBar();\n  }\n  // B-64:", """  if (timelineMode) {
    // При перестроении сохраняем позицию метки и саму движущуюся ячейку:
    // выбор дорожки не должен сбрасывать место или показывать старую панель.
    const keyFor = (cell) => cell && cell.dataset ? timelineKey(cell.dataset.sec,cell.dataset.square,cell.dataset.ei,cell.dataset.secPass,cell.dataset.sqPass) : null;
    const activeKey=keyFor(timelineActiveCell), motionKey=timelineMotion && keyFor(timelineMotion.cell);
    renderTimeline();
    const restored=activeKey && timelineCellByKey.get(activeKey);
    if(restored){
      timelineActiveCell=restored;restored.classList.add('tl-active');
      if(!playbackState.isPlaying)showPausedFingering(restored);
      else {
        const si=sections.findIndex(s=>s.id===+restored.dataset.sec), sec=sections[si];
        const sqi=sec && sec.squares.findIndex(s=>s.id===+restored.dataset.square), sq=sec && sec.squares[sqi];
        const ei=+restored.dataset.ei, ev=sq && getSquarePlaybackEvents(sq,sec.timeSig||globalTimeSig)[ei];
        if(ev)updateTimelinePanels({section:sec,square:sq,event:ev,sectionIndex:si,squareIndex:sqi,eventIndex:ei});
      }
    }
    if(timelineMotion && motionKey && timelineCellByKey.has(motionKey))timelineMotion.cell=timelineCellByKey.get(motionKey);
    syncTimelineSongBar();
  }
  // B-64:""")

p.write_text(s,encoding='utf-8')

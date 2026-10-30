'use strict';
// Experimental bridge for real STRUCHORD section data. It is not connected to
// the player/UI. Callbacks let tests exercise the same model and formulas.
const {buildSection,formulaToChord}=require('./keyboard-section-adapter');
function prepareSection(o) {
  const {section,track,trackId,tracks,formula,globalKey,globalTimeSig}=o||{};
  if (!section || !track || !tracks || typeof tracks.cellKey!=='function' || typeof tracks.trackChord!=='function' ||
      typeof tracks.keyRange!=='function' || typeof formula!=='function' || !Array.isArray(section.squares)) throw new TypeError('Invalid section bridge input');
  if (track.instrument!=='keys' || track.id!==trackId) return {ok:false,reason:'not-keyboard-track'};
  const meter=section.timeSig||globalTimeSig||'4/4', m=/^(\d+)\/(\d+)$/.exec(meter);
  if (!m || !['4/4','3/4','6/8'].includes(meter)) return {ok:false,reason:'unsupported-meter'};
  const factor=4/Number(m[2]), key=section.key||globalKey||'C', cells=[], loops=[];
  for (const sq of section.squares) {
    if(!sq || !Array.isArray(sq.events)) return {ok:false,reason:'invalid-square'};
    const squareStart=cells.length;
    for (let i=0;i<sq.events.length;i++) {
      const ev=sq.events[i], cell=tracks.cellKey(section,sq,i);
      if(!ev || typeof cell!=='string') return {ok:false,reason:'invalid-cell'};
      if(ev.timeSig && ev.timeSig!==meter) return {ok:false,reason:'mixed-meter',cellKey:cell};
      const beats=Number(ev.span)*factor;
      if(!Number.isFinite(beats)||beats<.25||beats>32||Math.abs(beats*4-Math.round(beats*4))>1e-9) return {ok:false,reason:'unsupported-duration',cellKey:cell};
      const chord=tracks.trackChord(trackId,cell,ev);
      if (!chord) {cells.push({key:cell,beats,rest:true});continue;}
      const v=track.voicings||{}, patterns=track.patterns||{};
      const exact=typeof tracks.exactNotes==='function' && tracks.exactNotes(trackId,cell,chord);
      // User's cell pattern and selected/explicit voicings take precedence.
      const manual=!!patterns[cell] || (!o.shapeAware && (!!exact || Number.isInteger(v[cell]) || Number.isInteger(v['v:'+chord])));
      if(manual) {cells.push({key:cell,beats,manual:true});continue;}
      let f;try {f=formula(chord,key);}catch(e){return {ok:false,reason:'unrecognized-chord',cellKey:cell};}
      if(!f)return {ok:false,reason:'unrecognized-chord',cellKey:cell};
      let c;try {c=formulaToChord(f);}catch(e){return {ok:false,reason:'invalid-formula',cellKey:cell};}
      let shape=null;
      if(o.shapeAware && typeof o.selectedShape==='function') {
        shape=o.selectedShape(trackId,cell,chord,key);
        if(!Array.isArray(shape) || shape.length<2)return {ok:false,reason:'invalid-selected-shape',cellKey:cell};
      }
      cells.push({key:cell,beats,chord:c,shape,strictShape:o.shapeAware && o.strictShape===true});
    }
    if ((Number(sq.repeat)||1)>1 && cells.length>squareStart) loops.push([cells[squareStart],cells[cells.length-1]]);
  }
  if (!cells.length) return {ok:false,reason:'empty-section'};
  if ((Number(section.repeat)||1)>1) loops.push([cells[0],cells[cells.length-1]]);
  const range=tracks.keyRange(trackId);
  if(!range) return {ok:false,reason:'invalid-range'};
  try {
    const result=buildSection({cells,low:range.low,high:range.high,bpm:o.bpm,meter,genre:o.genre,secondary:o.secondary,role:o.role,swing:o.swing,sectionSwing:o.sectionSwing,seed:o.seed});
    if (!result.ok) return result;
    // Each repeated square/section reuses the same cell events. Reserve enough
    // time for last -> first as well as the ordinary linear successor.
    // Manual or rest boundaries cannot yet be checked without interpreting
    // their existing patterns, so explicitly decline rather than guess.
    for (const [first,last] of loops) {
      const a=result.decisions[last.key], b=result.decisions[first.key];
      if (!a || !b) return {ok:false,reason:'unknown-repeat-boundary',cellKey:last.key};
      const center=x=>(x[0]+x[x.length-1])/2, limits={};
      for (const hand of ['left','right']) {
        const dist=Math.abs(center(a[hand])-center(b[hand]));
        const gap=dist ? Math.max(0.06,dist/20)*o.bpm/60 : 0;
        limits[hand]=Math.min(last.beats,a.releases[hand]-a.beat,last.beats-gap);
        if (limits[hand]<=0) return {ok:false,reason:'repeat-transition-too-fast',cellKey:last.key};
      }
      const clipped=result.events[last.key].map(n=>({...n,duration:Math.min(n.duration,limits[n.hand]-n.beat)})).filter(n=>n.duration>0);
      if (!clipped.some(n=>n.hand==='left') || !clipped.some(n=>n.hand==='right')) return {ok:false,reason:'repeat-transition-too-fast',cellKey:last.key};
      result.events[last.key]=clipped;
      for (const hand of ['left','right']) a.releases[hand]=Math.min(a.releases[hand],a.beat+limits[hand]);
    }
    return result;
  } catch (e) { return {ok:false,reason:'unsupported-input',detail:e.message}; }
}
module.exports={prepareSection};

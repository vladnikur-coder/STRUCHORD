'use strict';
// Candidate integration: embedded only into an isolated HTML candidate.
// A section is prepared completely before any track state is touched.
(function(HOST){
 const TYPE='experimental-notes-v1';
 const T=()=>HOST.StruChordTracks;
 const getSec=id=>sections.find(s=>String(s.id)===String(id));
 function variationOf(pattern){const n=Number(pattern && (pattern.noteVariation == null ? pattern.autoVariation : pattern.noteVariation));return Number.isInteger(n) && n>=0 && n<1000000?n:0;}
 function seedFor(sec,id){return (Number(sec.id)||1)+variationOf(T().patternFor(id,'s:'+sec.id))*1009;}
 function fingerprint(notes){return JSON.stringify((notes||[]).map(n=>[n.hand,n.midi,Math.round(n.beat*4),Math.round(n.duration*4)]).sort((a,b)=>a[2]-b[2]||a[1]-b[1]||a[0].localeCompare(b[0])));}
 // Try different deterministic seeds until the written rhythm or pitches
 // change, not merely velocity or a few milliseconds of humanisation.
 function prepareVariation(sec,cfg,start,reference,replaceEdited,overrideSwing){
  const track=T().track(cfg.trackId);if(!track)return {ok:false,reason:'no-track'};
  const base=Number.isInteger(start)&&start>=0?start:0, old=reference||track.patterns;
  for(let attempt=0;attempt<24;attempt++){
   const variation=(base+attempt)%1000000, seed=(Number(sec.id)||1)+variation*1009;
   const result=prepare(sec,cfg,seed,replaceEdited,overrideSwing,2);if(!result.ok)return result;
   const comparable=result.writes.filter(w=>old[w.key] && old[w.key].type===TYPE);
   if(!comparable.length || comparable.some(w=>fingerprint(w.pattern.notes)!==fingerprint(old[w.key].notes)))return {...result,variation};
  }
  return {ok:false,reason:'no-distinct-variation'};
 }
 function specifications(sec,id){const t=T(),out=[];for(const q of sec.squares||[])for(let i=0;i<(q.events||[]).length;i++){
  const e=q.events[i],ts=e.timeSig||sec.timeSig||globalTimeSig,den=Number(String(ts).split('/')[1]);out.push({key:t.cellKey(sec,q,i),beats:Number(e.span)*4/den,chord:t.trackChord(id,t.cellKey(sec,q,i),e)||'',keyName:sec.key||globalKey||'C'});
 }return out;}
 function selectedShape(id,cell,chord,key){
  const t=T(), exact=t.exactNotes(id,cell,chord);if(exact)return exact;
  const keys=HOST.StruChordKeys, linked=keys.linkedSelection(id,cell);if(linked && linked.chord===chord)return linked.notes.slice();
  const variants=keys.generateKeysVoicings(chord,key,t.keyRange(id),null,{});if(!variants.length)return null;
  return variants[keys.variantIndex(id,chord,cell)%variants.length].slice();
 }
 function prepare(sec,cfg,seed,replaceEdited,overrideSwing,overrideRhythmVersion){
  const t=T(),track=t.track(cfg.trackId);if(!track||track.instrument!=='keys')return {ok:false,reason:'no-track'};
  // Own unedited generated cells are candidates for replacement, not manual.
  const patterns={...track.patterns};Object.keys(patterns).forEach(k=>{const v=patterns[k];if(v && v.type===TYPE && (v.status==='generated' || replaceEdited===true))delete patterns[k];});
  const shadow={...track,patterns};let g=HOST.__keyModules.bridge.prepareSection({section:sec,track:shadow,trackId:cfg.trackId,tracks:t,formula:HOST.StruChordFormula.chordFormula,globalKey,globalTimeSig,bpm:getEffectiveBpm(sec),genre:cfg.primary,secondary:cfg.secondary,role:String(sec.type||'Verse').toLowerCase(),shapeAware:cfg.shapeAware===true,strictShape:cfg.followShape===true,selectedShape,swing:!!cfg.swing,sectionSwing:typeof overrideSwing==='boolean'?overrideSwing:(()=>{let p=track.patterns['s:'+sec.id];return p && typeof p.swing==='boolean'?p.swing:null})(),rhythmVersion:overrideRhythmVersion===2 || (overrideRhythmVersion==null && track.patterns['s:'+sec.id] && track.patterns['s:'+sec.id].rhythmVersion===2)?2:1,seed:seed|0});
  if(!g.ok)return g;
  const specs=specifications(sec,cfg.trackId), writes=[],clear=[];
  for(const spec of specs){const old=track.patterns[spec.key];if(Object.prototype.hasOwnProperty.call(g.events,spec.key)){
    const rg=t.keyRange(cfg.trackId),includeBass=cfg.shapeAware && cfg.followShape || HOST.StruChordAccomp.bassPolicy(cfg.trackId,sec,cfg.autoBass?'auto':undefined).include;
    const pat={type:TYPE,beats:spec.beats,status:'generated',shapeAware:cfg.shapeAware===true,shapeNotes:cfg.shapeAware?selectedShape(cfg.trackId,spec.key,spec.chord,spec.keyName):null,notes:includeBass?g.events[spec.key]:g.events[spec.key].filter(n=>n.hand!=='left'),chord:spec.chord,keyName:spec.keyName,bpm:getEffectiveBpm(sec),rangeLow:rg.low,rangeHigh:rg.high};
    if(JSON.stringify(pat).length>32768)return {ok:false,reason:'too-many-notes'};
    try{HOST.__keyModules.draft.validate({version:1,revision:0,cells:[{key:spec.key,beats:spec.beats,status:pat.status,notes:pat.notes}]});}catch(e){return {ok:false,reason:'invalid-generated-notes'};}
    writes.push({key:spec.key,pattern:pat});
   }else if(old && old.type===TYPE && old.status==='generated' && !spec.chord)clear.push(spec.key);
  }
  const newCount=writes.filter(w=>!Object.prototype.hasOwnProperty.call(track.patterns,w.key)).length;
  if(Object.keys(track.patterns).length+newCount-clear.length>4096)return {ok:false,reason:'too-many-patterns'};
  return {ok:true,writes,clear,preserved:g.preserved};
 }
 function commit(trackId,result){if(!result||!result.ok)throw Error('Unprepared notes');for(const w of result.writes)if(!T().setPattern(trackId,w.key,w.pattern))throw Error('Cannot store notes');for(const k of result.clear)T().clearPattern(trackId,k);}
 function refresh(sec,cfg,seed){let result=prepare(sec,cfg,seed);if(!result.ok)return result;commit(cfg.trackId,result);return result;}
 function manualTimingConflict(sec){const track=T().track(T().state().activeTrackId);if(!track||track.instrument!=='keys')return false;return specifications(sec,track.id).some(x=>{const p=track.patterns[x.key];return p && p.type===TYPE && p.status==='manual' && Math.abs(p.beats-x.beats)>1e-8;});}
 function shouldMove(p,k,trackId){const cfg=T().state().autoAccomp,managed=cfg&&cfg.engine==='notes-v1'&&cfg.trackId===trackId&&cfg.managed[String(k.split(':')[0])];return p&&p.type===TYPE&&(p.status==='manual'||!managed);}
 function canMoveManual(secs,delta,trackId){const track=T().track(trackId);if(!track)return true;const ids=new Set(secs.map(s=>String(s.id)));return Object.entries(track.patterns||{}).every(([k,p])=>!ids.has(k.split(':')[0])||!shouldMove(p,k,trackId)||p.notes.every(n=>n.midi+delta>=0&&n.midi+delta<=127));}
 function moveManual(secs,delta,trackId){if(!delta)return;const track=T().track(trackId);if(!track)return;const ids=new Set(secs.map(s=>String(s.id)));for(const [k,p] of Object.entries(track.patterns||{})){if(ids.has(k.split(':')[0])&&shouldMove(p,k,trackId))T().setPattern(trackId,k,{...p,notes:p.notes.map(n=>({...n,midi:n.midi+delta}))});}}
 function refreshManaged(sec,trackId){const cfg=T().state().autoAccomp;if(!cfg||cfg.engine!=='notes-v1'||!sec||!cfg.managed[String(sec.id)]||(trackId!=null&&cfg.trackId!==trackId))return true;const sectionPattern=T().patternFor(cfg.trackId,'s:'+sec.id);if(sectionPattern && sectionPattern.autoGenerated!==true)return true;const r=refresh(sec,cfg,seedFor(sec,cfg.trackId));if(!r.ok && HOST.showToast)HOST.showToast('Не удалось обновить клавишную партию: проверьте размер, темп и аккорды');return r.ok;}
 function plan(o){
  if(!o)return null;let t=T().track(o.trackId),v=o.pattern && o.pattern.type===TYPE?o.pattern:(o.cell && t&&t.patterns[o.cell]);if(!v||v.type!==TYPE)return null;const direct=!!o.pattern;
  if(!direct && v.shapeAware && v.status==='generated' && Array.isArray(v.shapeNotes)){
   const current=selectedShape(o.trackId,o.cell,o.chord,o.key);
   if(JSON.stringify(current)!==JSON.stringify(v.shapeNotes))return null;
  }
  if(!direct && !v.shapeAware && t && ((typeof T().exactNotes==='function' && T().exactNotes(o.trackId,o.cell,o.chord)) || Number.isInteger((t.voicings||{})[o.cell]) || Number.isInteger((t.voicings||{})['v:'+o.chord])))return null;
  // A changed chord/key must never play stale automatically generated pitches.
  const cfg=T().state().autoAccomp,managed=!!(cfg && cfg.engine==='notes-v1' && cfg.trackId===o.trackId && o.sec && cfg.managed[String(o.sec.id)]);
  if(!direct && managed && v.status==='generated' && (v.chord!==o.chord || (o.sec && v.bpm!==getEffectiveBpm(o.sec)) || (o.range && (v.rangeLow!==o.range.low || v.rangeHigh!==o.range.high))))return [{at:0,dur:o.dur,notes:[],gain:1,type:TYPE,source:'cell'}];
  if(o.gp5Written){
    const groups=new Map();for(const n of v.notes){const at=Math.min(v.beats-.25,Math.max(0,Math.round(n.beat*4)/4)),k=n.hand+':'+at;if(!groups.has(k))groups.set(k,{at,hand:n.hand,notes:[],dur:Infinity,velocity:0});const g=groups.get(k);g.notes.push(n.midi);g.dur=Math.min(g.dur,Math.max(.25,Math.round(n.duration*4)/4));g.velocity+=n.velocity;}
    const sorted=[...groups.values()].sort((a,b)=>a.at-b.at||a.hand.localeCompare(b.hand));const unit=o.dur/v.beats;
    const result=sorted.map((g,i)=>{const next=sorted.slice(i+1).find(x=>x.hand===g.hand),dur=Math.min(g.dur,v.beats-g.at,next?next.at-g.at:Infinity);return {index:i,stepIndex:i,at:g.at*unit,dur:dur*unit,notes:g.notes,gain:g.velocity/g.notes.length/100,source:'cell',type:'experimental-note'};}).filter(g=>g.dur>0);
    return result.length?result:[{at:0,dur:o.dur,notes:[],gain:1,type:TYPE,source:'cell'}];
  }
  const d={version:1,revision:0,cells:[{key:o.cell||'preview',beats:v.beats,status:v.status,notes:v.notes}]};
  try{return HOST.__keyModules.renderer.planCell(d,o.cell||'preview',{duration:o.dur,span:o.span,denominator:Number(String(o.ts||'4/4').split('/')[1])});}
  catch(e){return [{at:0,dur:o.dur,notes:[],gain:1,type:TYPE,source:'cell'}];}
 }
 HOST.StruChordNoteCandidate={prepare,prepareVariation,variationOf,commit,refresh,refreshManaged,manualTimingConflict,canMoveManual,moveManual,plan,specifications,seedFor,TYPE,getSec};
})(window);

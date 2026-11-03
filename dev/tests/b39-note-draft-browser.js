'use strict';
// Isolated injection only: real application audio/export APIs read the same
// manually edited per-note draft. This is not integrated into the application.
const fs=require('fs'),path=require('path'),assert=require('assert'),puppeteer=require('puppeteer');
const source=f=>fs.readFileSync(path.join(__dirname,'../prototypes',f),'utf8');
const bundle=`(()=>{
const hand=(()=>{let module={exports:{}};${source('keyboard-hand-voicings.js')};return module.exports})();
const perf=(()=>{let module={exports:{}},require=()=>hand;${source('keyboard-performance.js')};return module.exports})();
const sec=(()=>{let module={exports:{}},require=()=>perf;${source('keyboard-section-adapter.js')};return module.exports})();
const bridge=(()=>{let module={exports:{}},require=()=>sec;${source('keyboard-runtime-bridge.js')};return module.exports})();
const draft=(()=>{let module={exports:{}};${source('keyboard-note-draft.js')};return module.exports})();
const renderer=(()=>{let module={exports:{}},require=()=>draft;${source('keyboard-note-render.js')};return module.exports})();
window.__noteDraft={bridge,draft,renderer};})();`;
(async()=>{const b=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:900});await p.evaluateOnNewDocument(()=>localStorage.setItem('struchord-default-instrument','keys'));await p.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html');await p.addScriptTag({content:bundle});
 const r=await p.evaluate(async()=>{startNewSongFromHome();addSection('Verse');const T=StruChordTracks,id=T.state().activeTrackId,s=sections[0],sq=s.squares[0];['C','Am','F','G'].forEach((chord,i)=>sq.events[i].chord=chord);
  const {bridge,draft,renderer}=window.__noteDraft;
  const gen=bridge.prepareSection({section:s,track:T.track(id),trackId:id,tracks:T,formula:StruChordFormula.chordFormula,globalKey,globalTimeSig,bpm:getEffectiveBpm(s),genre:'pop',role:'verse',swing:true,seed:21});if(!gen.ok)throw Error(gen.reason);
  const specs=sq.events.map((ev,i)=>({key:T.cellKey(s,sq,i),beats:ev.span}));let d=draft.create(specs,gen),key=specs[0].key;
  const original=d.cells[0].notes.map(x=>({...x})),edited=original.map((n,i)=>i===0?{...n,midi:n.midi+1,velocity:42}:n);d=draft.replaceCell(d,key,edited,0);d=draft.snapshot(JSON.parse(JSON.stringify(d)));
  const old=StruChordAccomp, calls=[];function planner(o){const preview=o.pattern && o.pattern.type==='experimental-note-preview';if((o.pattern && !preview)||(!o.cell && !preview))return old.plan(o);const result=renderer.planCell(d,preview?key:o.cell,{duration:o.dur,span:o.span,denominator:Number((o.ts||'4/4').split('/')[1])});if(!result)return old.plan(o);calls.push(result);return result;}
  window.StruChordAccomp=Object.freeze(Object.assign({},old,{plan:planner}));StruChordAudio.setPatternPlanner(planner);
  const ev=sq.events[0],span=ev.span,range=T.keyRange(id),notes=[36,48,52,55];const actual=planner({trackId:id,cell:key,sec:s,sq,ev,ei:0,ts:'4/4',span,dur:span});
  const exported=StruChordExport.stepsFor(T.track(id),key,s,sq,ev,0,'C','C',range,notes,span,'4/4');
  const ctx=getAudioContext();await ctx.resume();const before=StruChordAudio.stats().notes;StruChordAudio.scheduleEvent(ctx,s,sq,ev,0,ctx.currentTime+.1,span*.5,120,'4/4');const played=StruChordAudio.stats().notes-before;
  const parts=StruChordExport.buildParts({sections,globalKey,globalTimeSig});const midi=midiExportBytes();StruChordAudio.stopAll();
  const previewBefore=StruChordAudio.stats().notes;const cancel=StruChordAudio.previewPattern('C',ctx,id,'C',{type:'experimental-note-preview'},{scope:'cell',span,bpm:120,ts:'4/4',sec:s,cell:key});await new Promise(r=>setTimeout(r,180));const previewNotes=StruChordAudio.stats().notes-previewBefore;cancel();const afterCancel=StruChordAudio.stats().notes;await new Promise(r=>setTimeout(r,250));const afterWait=StruChordAudio.stats().notes;
  StruChordAudio.stopAll();window.StruChordAccomp=old;StruChordAudio.setPatternPlanner(old.plan);
  return {edited,actual,exported,played,previewNotes,afterCancel,afterWait,rolls:parts[0].pitchRolls[s.id],midi:Array.from(midi.bytes),calls:calls.length};});
 assert(r.edited.length>0);assert.deepStrictEqual(r.actual,r.exported);assert.equal(r.played,r.edited.length);assert(r.previewNotes>0,'preview schedules edited notes');assert.equal(r.afterCancel,r.afterWait,'cancellation stops further preview notes');assert(r.calls>2);assert.equal(r.actual[0].notes[0],r.edited[0].midi);assert.equal(r.actual[0].gain,.42);
 const expected=r.edited.map(n=>[Math.round(n.beat*1e4)/1e4,Math.round(n.duration*1e4)/1e4,n.midi]).sort((a,b)=>a[0]-b[0]||a[2]-b[2]);
 const rolls=r.rolls.filter(n=>n.start<4).map(n=>[n.start,n.dur,n.pitch]).sort((a,b)=>a[0]-b[0]||a[2]-b[2]);assert.deepStrictEqual(rolls,expected,'written model keeps per-note time, duration and pitch');
 const midi=require('midi-file').parseMidi(Buffer.from(r.midi));let ons=[];for(const tr of midi.tracks){let tick=0;for(const e of tr){tick+=e.deltaTime;if(e.type==='noteOn'&&e.velocity>0&&tick<4*midi.header.ticksPerBeat)ons.push([tick,e.noteNumber,e.velocity]);}}ons.sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);assert.deepStrictEqual(ons,r.rolls.filter(n=>n.start<4).map(n=>[Math.round(n.start*midi.header.ticksPerBeat),n.pitch,n.velocity]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]),'MIDI attacks and velocity match written model');assert(r.rolls.some(n=>n.pitch===r.edited[0].midi && n.velocity===Math.round(90*.42)),'manual dynamics reach export');
 assert.deepStrictEqual(errors,[]);console.log('Editable note draft: actual browser audio planner and MIDI use edited notes — OK (isolated injection)');
 }finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
